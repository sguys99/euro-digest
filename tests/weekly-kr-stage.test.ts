/**
 * 주간 단계 korean-weekly (M3-07) — 총평 시도·재시도·템플릿 강등(배치 실패·시간 초과·검증 실패·비용 가드), mock 결정적 재생,
 * 단계 쓰기(dry·이미 있음). 테스트는 네트워크·실호출 없이 가짜 LlmClient 또는 mock fixture만 쓴다.
 */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  MatchLedgerFileSchema,
  NamesKoFileSchema,
  WeeklyReportSchema,
} from "@/lib/schema";
import { isoWeekRangeUtc } from "@/lib/time";

import type { BudgetCheck } from "../scripts/lib/cost";
import {
  LlmBatchPollError,
  LlmRequestError,
  LlmTransportError,
  createLlmClient,
  type LlmClient,
  type LlmRequest,
  type LlmResult,
  type RunBatchOutcome,
} from "../scripts/lib/llm";
import { createLogger } from "../scripts/lib/logger";
import { buildNameIndex } from "../scripts/lib/names";
import {
  buildWeeklyTable,
  checkWeeklySummary,
  type WeeklyCheckContext,
} from "../scripts/lib/weekly-kr";
import {
  KOREAN_WEEKLY_LLM_WINDOW_MS,
  composeKoreanWeeklySummary,
  runKoreanWeekly,
} from "../scripts/lib/weekly-kr-stage";
import type {
  WeeklyBillableResult,
  WeeklyStageContext,
} from "../scripts/lib/weekly-stages";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = async (rel: string) =>
  JSON.parse(await readFile(path.join(ROOT, rel), "utf8")) as unknown;

const FixtureSchema = z.object({
  week: z.string(),
  players: KoreanPlayersFileSchema,
  playerSince: z.record(z.string(), z.string()),
  ledger: MatchLedgerFileSchema,
});
const FX = FixtureSchema.parse(
  await read("fixtures/players/weekly-2026-43.json"),
);
const NAMES = NamesKoFileSchema.parse(await read("configs/names.ko.json"));
const COMPS = CompetitionsFileSchema.parse(
  await read("configs/competitions.json"),
);
const RANGE = isoWeekRangeUtc("2026-43");
const TABLE = buildWeeklyTable({
  week: "2026-43",
  range: RANGE,
  players: FX.players,
  ledger: FX.ledger.matches,
  playerSince: FX.playerSince,
  compNames: Object.fromEntries(COMPS.map((c) => [c.id, c.nameEn])),
});
const CHECK: WeeklyCheckContext = {
  names: buildNameIndex(NAMES, COMPS),
  competitionLabel: (comp) => COMPS.find((c) => c.id === comp)?.nameKo ?? comp,
};

const GOOD = JSON.stringify({
  s: [
    "이번 주 MVP는 FSV Mainz 05의 Jae-sung Lee다.",
    "Jae-sung Lee는 Werder Bremen전에서 63분 골을 넣었지만 팀은 2-3으로 졌다.",
    "Hee-chan Hwang은 1. FC Köln 원정에서 90분을 뛰었다.",
  ],
});
const BAD = JSON.stringify({
  s: ["Jae-sung Lee scored a goal this week.", "Lee was good.", "That is all."],
});

// ─── 가짜 클라이언트 ─────────────────────────────────────────────────────

type Step =
  | { kind: "ok"; text: string }
  | { kind: "fail" }
  | { kind: "timeout" }
  | { kind: "throw" } // 예상 밖 오류(일반 Error)
  | { kind: "reject" } // 서버가 제출 거부(HTTP 400)
  | { kind: "conn" } // 연결 오류·타임아웃(상태 없음 — 배치가 생겼는지 모름)
  | { kind: "request" } // 보내기 전 거부(LlmRequestError)
  | { kind: "poll" }; // 제출 뒤 상태 조회 실패(LlmBatchPollError)

function fakeClient(steps: Step[]) {
  const calls: string[] = [];
  let cancels = 0;
  const usage = { in: 2000, out: 3000, cacheRead: 0, cacheWrite: 0 };
  const client: LlmClient = {
    mode: "mock",
    model: "claude-haiku-5-5",
    submitBatch: () => Promise.reject(new Error("unused")),
    pollBatch: () =>
      Promise.resolve({
        state: "ended",
        snapshot: {
          batchId: "b-x",
          status: "ended",
          counts: {
            processing: 0,
            succeeded: 0,
            errored: 0,
            canceled: 1,
            expired: 0,
          },
          expiresAt: "2026-11-02T00:00:00Z",
          endedAt: "2026-11-01T00:00:00Z",
        },
      }),
    collectBatchResults: () => Promise.resolve(new Map<string, LlmResult>()),
    cancelBatch: () => {
      cancels += 1;
      return Promise.reject(new Error("cancel 결과는 쓰지 않는다"));
    },
    runBatch: (requests: readonly LlmRequest[]): Promise<RunBatchOutcome> => {
      const req = requests[0]!;
      calls.push(req.customId);
      const step = steps[calls.length - 1] ?? { kind: "fail" };
      if (step.kind === "throw")
        return Promise.reject(new Error("submit 실패"));
      if (step.kind === "reject")
        return Promise.reject(
          new LlmTransportError({
            status: 400,
            errorType: "invalid_request_error",
            message: "거부",
          }),
        );
      if (step.kind === "conn")
        return Promise.reject(
          new LlmTransportError({
            errorType: "connection_error",
            message: "요청 시간 초과",
          }),
        );
      if (step.kind === "request")
        return Promise.reject(new LlmRequestError("마감 지남"));
      if (step.kind === "poll")
        return Promise.reject(
          new LlmBatchPollError(
            `b-${calls.length}`,
            new LlmTransportError({
              status: 404,
              errorType: "not_found_error",
              message: "없음",
            }),
          ),
        );
      if (step.kind === "timeout")
        return Promise.resolve({
          timedOut: true,
          batchId: `b-${calls.length}`,
          snapshot: null,
        });
      const result: LlmResult =
        step.kind === "ok"
          ? {
              customId: req.customId,
              batch: true,
              usage,
              thinkingTokens: 0,
              ok: true,
              text: step.text,
              stopReason: "end_turn",
            }
          : {
              customId: req.customId,
              batch: true,
              usage: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
              thinkingTokens: 0,
              ok: false,
              errorType: "overloaded_error",
              message: "x",
              retryable: true,
            };
      return Promise.resolve({
        timedOut: false,
        batchId: `b-${calls.length}`,
        state: "ended",
        results: new Map([[req.customId, result]]),
        usage: {
          total: usage,
          batch: usage,
          single: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
          requests: { batch: 1, single: 0 },
        },
      });
    },
    callSingle: () => Promise.reject(new Error("주간 총평은 배치만")),
  };
  return { client, calls, cancels: () => cancels };
}

const allowed: BudgetCheck = {
  allowed: true,
  reason: "ok",
  message: "",
  env: "dev",
  estimatedUsd: 0,
  daily: { spentUsd: 0, limitUsd: 0.1, projectedUsd: 0 },
  monthly: { spentUsd: 0, limitUsd: 3, projectedUsd: 0 },
  devShare: 0,
  devAlert: false,
} as unknown as BudgetCheck; // 이 테스트는 allowed·reason만 읽는다(창 필드 모양은 cost.test.ts가 본다)

function ctxWith(over: {
  client?: LlmClient;
  budget?: () => Promise<BudgetCheck>;
  nowMs?: () => number;
  rootDir?: string;
  dry?: boolean;
  force?: boolean;
}) {
  const billed: WeeklyBillableResult[] = [];
  let created = 0;
  const printed: string[] = [];
  const t0 = Date.parse("2026-11-01T23:00:00Z");
  const ctx: WeeklyStageContext = {
    rootDir: over.rootDir ?? ROOT,
    dataDir: path.join(over.rootDir ?? ROOT, "data"),
    week: "2026-43",
    weekRange: RANGE,
    env: "dev",
    llmMode: "mock",
    dry: over.dry ?? true,
    force: over.force ?? false,
    runId: "weekly-dev-test",
    startedAt: new Date(t0).toISOString(),
    now: () => new Date(over.nowMs ? over.nowMs() : t0),
    signal: new AbortController().signal,
    logger: createLogger({ scope: "weekly", sink: () => {} }),
    print: (t) => printed.push(t),
    llm: {
      model: "claude-haiku-5-5",
      createClient: () => {
        created += 1;
        if (!over.client) throw new Error("클라이언트 없음");
        return over.client;
      },
      addResults: (rs) => {
        for (const r of rs) billed.push(r);
      },
      costSoFar: () => 0,
    },
    budget: { check: over.budget ?? (() => Promise.resolve(allowed)) },
    apiCalls: { add: () => {} },
    http: {
      fetch: () =>
        Promise.reject(new Error("테스트에서 네트워크를 쓰지 않는다")),
      userAgent: "EuroDigestBot/0.1 (+test)",
    },
    sources: { add: () => {} },
  };
  return { ctx, billed, printed, created: () => created, t0 };
}

// ─── 표 (실데이터 사본) ──────────────────────────────────────────────────

describe("W43 실데이터 사본 — 표·MVP (FR-91·FR-92)", () => {
  it("추적 7명, MVP 이재성(1골 1경기 = 4점), 김민재 10-25 16:30Z 프라이부르크전(UTC W43)은 명단 제외 행", () => {
    expect(
      TABLE.rows.map((r) => [
        r.player.slug,
        r.apps,
        r.minutes,
        r.goals,
        r.points,
      ]),
    ).toEqual([
      ["lee-jae-sung", 1, 75, 1, 4],
      ["hwang-hee-chan", 1, 90, 0, 1],
      ["jeong-woo-yeong", 1, 76, 0, 1],
      ["lee-kang-in", 1, 67, 0, 1],
      ["kim-min-jae", 1, 45, 0, 1],
      ["seol-young-woo", 0, 0, 0, 0],
      ["jens-castrop", 0, 0, 0, 0],
    ]);
    expect([TABLE.mvp, TABLE.coMvp]).toEqual(["lee-jae-sung", []]);
    const kim = TABLE.rows.find((r) => r.player.slug === "kim-min-jae")!;
    expect(kim.matches.map((m) => [m.kickoff, m.status])).toEqual([
      ["2026-10-21T19:00:00.000Z", "start"],
      ["2026-10-25T16:30:00.000Z", "absent"],
    ]);
  });
  it("W43 실측 총평(data/players/weekly/2026-43.json summary — 치환 뒤 문장)은 경기 대조(⑤-2)를 포함한 코드 검증을 통과한다", () => {
    const actual = [
      "이번 주 MVP는 이재성이다.",
      "이재성은 마인츠 소속으로 10월 24일 홈 분데스리가 경기 브레멘전에 75분 선발 출전해 1골을 넣었고 팀은 2-3으로 졌다.",
      "황희찬은 샬케04 원정에서 쾰른전 90분 선발 출전해 0-0으로 비겼고, 정우영은 우니온 베를린 소속으로 아우크스부르크 원정에서 76분 선발 출전해 1-1로 비겼다.",
      "이강인은 10월 24일 라리가 홈 경기 데포르티보 라코루냐전에 67분 선발 출전했고 팀은 1-0으로 이겼다.",
      "김민재는 10월 21일 UEFA 챔피언스리그 홈 경기 아스널전에 45분 선발 출전했고, 설영우와 옌스 카스트로프는 이번 주 출전하지 않았다.",
    ];
    expect(checkWeeklySummary(actual, TABLE, CHECK).issues).toEqual([]);
    // 같은 문장의 사실을 하나씩 틀리면 걸린다
    const broken = (from: string, to: string) =>
      checkWeeklySummary(
        actual.map((t) => t.replace(from, to)),
        TABLE,
        CHECK,
      ).issues.map((i) => i.code);
    expect(broken("2-3으로 졌다", "2-3으로 이겼다")).toContain("match-result");
    expect(broken("2-3으로 졌다", "3-2로 졌다")).toContain("match-score");
    expect(broken("24일 홈 분데스리가", "24일 원정 분데스리가")).toContain(
      "match-venue",
    );
    expect(broken("브레멘전", "아스널전")).toContain("match-opponent");
    expect(broken("10월 24일 홈", "10월 25일 홈")).toContain("match-date");
    expect(broken("0-0으로 비겼고", "1-1로 비겼고")).toContain("match-score");
  });
});

// ─── 총평 ────────────────────────────────────────────────────────────────

describe("composeKoreanWeeklySummary — 시도·재시도·템플릿 강등", () => {
  it("mock fixture(weekly-kr-2026-43) 결정적 재생 — 검증 통과, summaryAi true, 비용 결과 기록", async () => {
    // 단계 시계(ctxWith t0)와 같은 시계를 넘긴다 — 실제 시계면 t0 + LLM 창(8분)이 지난 뒤 마감 초과로 강등된다
    const client = createLlmClient({
      mode: "mock",
      model: "claude-haiku-5-5",
      now: () => Date.parse("2026-11-01T23:00:00Z"),
    });
    const { ctx, billed, t0 } = ctxWith({ client });
    const r = await composeKoreanWeeklySummary(
      ctx,
      { table: TABLE, check: CHECK },
      t0,
    );
    expect(r).toMatchObject({ summaryAi: true, reason: "llm" });
    expect(r.summary).toContain("이번 주 MVP는 마인츠의 이재성으로");
    expect(r.attempts).toHaveLength(1);
    expect(billed).toHaveLength(1);
  });

  it("첫 시도 성공 — 1회", async () => {
    const f = fakeClient([{ kind: "ok", text: GOOD }]);
    const { ctx, billed, t0 } = ctxWith({ client: f.client });
    const r = await composeKoreanWeeklySummary(
      ctx,
      { table: TABLE, check: CHECK },
      t0,
    );
    expect(r.summaryAi).toBe(true);
    expect(r.summary.startsWith("이번 주 MVP는 마인츠의 이재성이다.")).toBe(
      true,
    );
    expect(f.calls).toEqual(["weekly-kr-2026-43"]);
    expect(billed).toHaveLength(1);
  });

  it("검증 실패 → 1회 재시도(-r1) 성공", async () => {
    const f = fakeClient([
      { kind: "ok", text: BAD },
      { kind: "ok", text: GOOD },
    ]);
    const { ctx, billed, t0 } = ctxWith({ client: f.client });
    const r = await composeKoreanWeeklySummary(
      ctx,
      { table: TABLE, check: CHECK },
      t0,
    );
    expect(r.summaryAi).toBe(true);
    expect(f.calls).toEqual(["weekly-kr-2026-43", "weekly-kr-2026-43-r1"]);
    expect(r.attempts.map((a) => a.outcome)).toEqual(["check", "ok"]);
    expect(billed).toHaveLength(2); // 실패 시도 비용도 기록
  });

  it("검증 2회 실패 → 템플릿(output-invalid) — 재시도는 1회뿐", async () => {
    const f = fakeClient([
      { kind: "ok", text: BAD },
      { kind: "ok", text: "{}" },
      { kind: "ok", text: GOOD },
    ]);
    const { ctx, t0 } = ctxWith({ client: f.client });
    const r = await composeKoreanWeeklySummary(
      ctx,
      { table: TABLE, check: CHECK },
      t0,
    );
    expect(r).toMatchObject({ summaryAi: false, reason: "output-invalid" });
    expect(r.summary).toContain(
      "이재성이 1경기 75분 1골로 MVP 점수 4점을 얻어",
    );
    expect(f.calls).toHaveLength(2);
  });

  it("배치 결과 실패·제출 거부 → 재시도 → 템플릿(batch-failed)", async () => {
    const f = fakeClient([{ kind: "fail" }, { kind: "reject" }]);
    const { ctx, t0 } = ctxWith({ client: f.client });
    const r = await composeKoreanWeeklySummary(
      ctx,
      { table: TABLE, check: CHECK },
      t0,
    );
    expect(r).toMatchObject({ summaryAi: false, reason: "batch-failed" });
    expect(r.attempts.map((a) => a.outcome)).toEqual([
      "result-failed",
      "submit-failed",
    ]);
  });

  it.each([
    ["reject", "submit-failed"],
    ["request", "submit-failed"],
  ] as const)(
    "제출 거부 확정(%s) → 새 배치 재시도 1회(중복 과금 없음)",
    async (kind, outcome) => {
      const f = fakeClient([{ kind }, { kind: "ok", text: GOOD }]);
      const { ctx, t0 } = ctxWith({ client: f.client });
      const r = await composeKoreanWeeklySummary(
        ctx,
        { table: TABLE, check: CHECK },
        t0,
      );
      expect(r.summaryAi).toBe(true);
      expect(f.calls).toEqual(["weekly-kr-2026-43", "weekly-kr-2026-43-r1"]);
      expect(r.attempts.map((a) => a.outcome)).toEqual([outcome, "ok"]);
    },
  );

  it.each([
    ["conn", "submit-unknown"],
    ["throw", "submit-unknown"],
  ] as const)(
    "배치가 생겼는지 모르는 실패(%s — 연결 오류·타임아웃·예상 밖) → 다시 내지 않고 템플릿",
    async (kind, outcome) => {
      const f = fakeClient([{ kind }, { kind: "ok", text: GOOD }]);
      const { ctx, t0, printed } = ctxWith({ client: f.client });
      const r = await composeKoreanWeeklySummary(
        ctx,
        { table: TABLE, check: CHECK },
        t0,
      );
      expect(r).toMatchObject({ summaryAi: false, reason: "batch-failed" });
      expect(f.calls).toEqual(["weekly-kr-2026-43"]);
      expect(r.attempts.map((a) => a.outcome)).toEqual([outcome]);
      expect(f.cancels()).toBe(0);
      expect(printed.join("\n")).toContain("다시 내지 않고");
    },
  );

  it("제출 뒤 상태 조회 실패(LlmBatchPollError) → 그 배치 취소 시도, 다시 내지 않고 템플릿", async () => {
    const f = fakeClient([{ kind: "poll" }, { kind: "ok", text: GOOD }]);
    const { ctx, t0 } = ctxWith({ client: f.client });
    const r = await composeKoreanWeeklySummary(
      ctx,
      { table: TABLE, check: CHECK },
      t0,
    );
    expect(r).toMatchObject({ summaryAi: false, reason: "batch-failed" });
    expect(f.calls).toEqual(["weekly-kr-2026-43"]);
    expect(r.attempts.map((a) => a.outcome)).toEqual(["poll-failed"]);
    expect(f.cancels()).toBe(1);
  });

  it("배치 마감 초과 → 취소 시도, 재시도 없이 템플릿(batch-timeout)", async () => {
    const f = fakeClient([{ kind: "timeout" }, { kind: "ok", text: GOOD }]);
    const { ctx, t0 } = ctxWith({ client: f.client });
    const r = await composeKoreanWeeklySummary(
      ctx,
      { table: TABLE, check: CHECK },
      t0,
    );
    expect(r).toMatchObject({ summaryAi: false, reason: "batch-timeout" });
    expect(f.calls).toHaveLength(1);
    expect(f.cancels()).toBe(1);
  });

  it("재시도할 시간이 3분 미만이면 재시도하지 않는다", async () => {
    const f = fakeClient([
      { kind: "ok", text: BAD },
      { kind: "ok", text: GOOD },
    ]);
    let calls = 0;
    const t0 = Date.parse("2026-11-01T23:00:00Z");
    // 첫 호출(시도 1 판정) = 시작, 그 뒤 = LLM 창 끝 2분 전
    const { ctx } = ctxWith({
      client: f.client,
      nowMs: () =>
        calls++ === 0 ? t0 : t0 + KOREAN_WEEKLY_LLM_WINDOW_MS - 2 * 60_000,
    });
    const r = await composeKoreanWeeklySummary(
      ctx,
      { table: TABLE, check: CHECK },
      t0,
    );
    expect(r).toMatchObject({ summaryAi: false, reason: "output-invalid" });
    expect(f.calls).toHaveLength(1);
  });

  it("비용 가드 초과 → LLM 없이 템플릿(budget) · 판정 불가 → budget-unreadable", async () => {
    const f = fakeClient([{ kind: "ok", text: GOOD }]);
    const over = ctxWith({
      client: f.client,
      budget: () =>
        Promise.resolve({
          ...allowed,
          allowed: false,
          reason: "monthly_exceeded",
        }),
    });
    expect(
      await composeKoreanWeeklySummary(
        over.ctx,
        { table: TABLE, check: CHECK },
        over.t0,
      ),
    ).toMatchObject({
      summaryAi: false,
      reason: "budget",
    });
    expect(over.created()).toBe(0);
    const broken = ctxWith({
      client: f.client,
      budget: () => Promise.reject(new Error("runs.json 깨짐")),
    });
    expect(
      await composeKoreanWeeklySummary(
        broken.ctx,
        { table: TABLE, check: CHECK },
        broken.t0,
      ),
    ).toMatchObject({
      reason: "budget-unreadable",
    });
    expect(f.calls).toHaveLength(0);
  });

  it("출전 0명 → 호출 생략(no-appearances)", async () => {
    const empty = buildWeeklyTable({
      week: "2026-43",
      range: RANGE,
      players: FX.players,
      ledger: [],
      playerSince: FX.playerSince,
      compNames: {},
    });
    const { ctx, created, t0 } = ctxWith({});
    const r = await composeKoreanWeeklySummary(
      ctx,
      { table: empty, check: CHECK },
      t0,
    );
    expect(r).toMatchObject({
      summaryAi: false,
      reason: "no-appearances",
      attempts: [],
    });
    expect(created()).toBe(0);
  });
});

// ─── 단계 (임시 저장소) ──────────────────────────────────────────────────

describe("runKoreanWeekly — 읽기·쓰기", () => {
  let dir: string | null = null;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  /** links: team-ids·대회 파일(data/competitions)까지 복사 — 리포트 경기 줄의 상대 slug·fd 경기 id 연결 */
  async function repo(opts: { links?: boolean } = {}): Promise<string> {
    dir = await mkdtemp(path.join(tmpdir(), "weekly-kr-"));
    await mkdir(path.join(dir, "configs/prompts"), { recursive: true });
    await mkdir(path.join(dir, "data/matches"), { recursive: true });
    for (const f of ["names.ko.json", "competitions.json"]) {
      await cp(path.join(ROOT, "configs", f), path.join(dir, "configs", f));
    }
    if (opts.links) {
      await cp(
        path.join(ROOT, "configs/team-ids.json"),
        path.join(dir, "configs/team-ids.json"),
      );
      await cp(
        path.join(ROOT, "data/competitions"),
        path.join(dir, "data/competitions"),
        { recursive: true },
      );
    }
    await cp(
      path.join(ROOT, "configs/prompts/weekly-kr.md"),
      path.join(dir, "configs/prompts/weekly-kr.md"),
    );
    await writeFile(
      path.join(dir, "configs/korean-players.json"),
      JSON.stringify(FX.players),
    );
    await writeFile(
      path.join(dir, "data/matches/2026-10.json"),
      JSON.stringify(FX.ledger),
    );
    await writeFile(
      path.join(dir, "data/matches/meta.json"),
      JSON.stringify({
        season: 2026,
        since: "2026-10-19",
        playerSince: FX.playerSince,
        gaps: [],
      }),
    );
    return dir;
  }

  it("누락 가능 경기(이월 목록의 구간 안 기타 대회 경기) — 경고 + 단계 메모·출력에 재생성 안내, 발행은 계속", async () => {
    const root = await repo({ links: true });
    await mkdir(path.join(root, "data/cache"), { recursive: true });
    await writeFile(
      path.join(root, "data/cache/af-pending.json"),
      JSON.stringify({
        updatedAt: "2026-10-25T22:10:00.000Z",
        fixtures: [
          {
            id: 777,
            comp: null,
            leagueId: 81,
            kickoff: "2026-10-25T19:45:00.000Z",
            status: "2H",
            firstSeen: "2026-10-25T22:10:00.000Z",
            requeries: 0,
          },
        ],
      }),
    );
    const f = fakeClient([{ kind: "ok", text: GOOD }]);
    const { ctx, printed } = ctxWith({ client: f.client, rootDir: root });
    const report = await runKoreanWeekly(ctx);
    expect(report.outputs).toEqual(["data/players/weekly/2026-43.json"]);
    expect(report.counts?.possiblyMissing).toBe(1);
    const line =
      "W43 누락 가능: 한국 선수 소속팀 기타 대회 경기 af-777 10월 26일 (월) 04:45 KST (미종료 이월 중) — 다음 날 `npm run weekly -- --week 2026-43 --force`(Actions 수동 실행 force·week 입력)로 재생성";
    expect(report.note).toContain(line);
    expect(printed.join("\n")).toContain(line);
  });

  it("W43 실데이터 사본 + 대회 파일 일정 — 누락 가능 경기 없음(오탐 없음)", async () => {
    const root = await repo({ links: true });
    const f = fakeClient([{ kind: "ok", text: GOOD }]);
    const report = await runKoreanWeekly(
      ctxWith({ client: f.client, rootDir: root }).ctx,
    );
    expect(report.counts?.possiblyMissing).toBe(0);
    expect(report.note).not.toContain("누락 가능");
  });

  it("쓰기 — 스키마 통과 파일, 이미 있으면 force 없이 건너뜀", async () => {
    const root = await repo({ links: true });
    const f = fakeClient([{ kind: "ok", text: GOOD }]);
    const { ctx } = ctxWith({ client: f.client, rootDir: root, dry: false });
    const report = await runKoreanWeekly(ctx);
    expect(report.outputs).toEqual(["data/players/weekly/2026-43.json"]);
    const file = WeeklyReportSchema.parse(
      JSON.parse(
        await readFile(
          path.join(root, "data/players/weekly/2026-43.json"),
          "utf8",
        ),
      ),
    );
    expect(file).toMatchObject({
      week: "2026-43",
      from: "2026-10-19T00:00:00.000Z",
      to: "2026-10-25T23:59:59.999Z",
      mvp: "lee-jae-sung",
      summaryAi: true,
    });
    expect(file.rows).toHaveLength(7);
    // 경기별 줄(2026-11-01) — 김민재: UCL 선발 + 10-25 프라이부르크전 명단 제외, 상대 slug·대회 파일 경기 id 연결
    const kim = file.rows.find((r) => r.player === "kim-min-jae")!;
    expect(kim.matches?.map((l) => [l.kickoff, l.status, l.minutes])).toEqual([
      ["2026-10-21T19:00:00.000Z", "start", 45],
      ["2026-10-25T16:30:00.000Z", "absent", 0],
    ]);
    expect(kim.matches?.every((l) => l.opponent.slug !== null)).toBe(true);
    expect(kim.matches?.map((l) => l.matchId.slice(0, 3))).toEqual([
      "fd-",
      "fd-",
    ]);
    const lee = file.rows.find((r) => r.player === "lee-jae-sung")!;
    expect(lee.matches?.map((l) => [l.goals, l.goalMinutes])).toEqual([
      [1, ["63"]],
    ]);
    const again = await runKoreanWeekly(
      ctxWith({ client: f.client, rootDir: root, dry: false }).ctx,
    );
    expect(again.outputs).toEqual([]);
    expect(again.note).toContain("이미 있음");
  });

  it("dry — 쓰지 않고 출력만, 11월 달 파일이 없어도(빈 달) 진행", async () => {
    const root = await repo();
    const f = fakeClient([{ kind: "ok", text: GOOD }]);
    const { ctx, printed } = ctxWith({
      client: f.client,
      rootDir: root,
      dry: true,
    });
    await runKoreanWeekly({
      ...ctx,
      week: "2026-44",
      weekRange: isoWeekRangeUtc("2026-44"),
    });
    await expect(
      readFile(path.join(root, "data/players/weekly/2026-44.json")),
    ).rejects.toThrow();
    expect(
      printed.some((p) => p.includes("(dry) data/players/weekly/2026-44.json")),
    ).toBe(true);
  });

  it("원장 meta가 없으면 단계 실패(던짐 — 표를 지어내지 않는다)", async () => {
    const root = await repo();
    await rm(path.join(root, "data/matches/meta.json"));
    await expect(
      runKoreanWeekly(ctxWith({ rootDir: root, dry: true }).ctx),
    ).rejects.toThrow(/meta\.json/);
  });
});
