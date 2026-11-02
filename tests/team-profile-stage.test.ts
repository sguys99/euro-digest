/**
 * 주간 단계 team-profiles (M4-06) — 20팀 묶음 배치·실패 팀만 재시도·이전 값 유지/비움·비용 가드·마감 초과 취소·이미 했음·dry·
 * 단계 등록(data/teams 공유)·골든셋 mock 재생. 네트워크·실호출 없이 가짜 LlmClient(입력 JSON으로 답을 만든다)와 mock fixture만 쓴다.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  TeamSchema,
  type CompetitionFile,
  type Match,
  type Team,
} from "@/lib/schema";
import { isoWeekRangeUtc } from "@/lib/time";

import type { BudgetCheck } from "../scripts/lib/cost";
import {
  createLlmClient,
  type LlmClient,
  type LlmRequest,
  type LlmResult,
  type RunBatchOutcome,
} from "../scripts/lib/llm";
import { createLogger } from "../scripts/lib/logger";
import { serializeTeamFile } from "../scripts/lib/team-files";
import {
  generatedThisRun,
  runTeamProfiles,
} from "../scripts/lib/team-profile-stage";
import {
  parseTeamEvalArgs,
  runTeamProfileEval,
} from "../scripts/lib/team-profile-eval";
import { checkWeeklyStages } from "../scripts/lib/weekly-run";
import {
  WEEKLY_STAGES,
  type WeeklyBillableResult,
  type WeeklyStage,
  type WeeklyStageContext,
} from "../scripts/lib/weekly-stages";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const RANGE = isoWeekRangeUtc("2026-44");
const T0 = Date.parse("2026-11-01T23:05:00Z"); // 월 08:05 KST

// ─── 합성 데이터 (팀 25개 → 묶음 2개: 13·12) ─────────────────────────────

const SLUGS = Array.from(
  { length: 25 },
  (_, i) => `club-${String(i + 1).padStart(2, "0")}`,
);

function competition(): CompetitionFile {
  const matches: Match[] = [];
  // 팀마다 6경기 — 짝(i, i+1)끼리 홈·원정 3번씩, 홈 팀 2-1 승
  let id = 0;
  for (let i = 0; i < SLUGS.length - 1; i += 2) {
    for (let k = 0; k < 6; k += 1) {
      id += 1;
      const home = k % 2 === 0 ? SLUGS[i]! : SLUGS[i + 1]!;
      const away = k % 2 === 0 ? SLUGS[i + 1]! : SLUGS[i]!;
      matches.push({
        id: `m${id}`,
        comp: "EPL",
        round: String(k + 1),
        kickoff: `2026-10-${String(k + 1).padStart(2, "0")}T15:00:00.000Z`,
        home,
        away,
        score: { h: 2, a: 1 },
        status: "finished",
      });
    }
  }
  return {
    comp: "EPL",
    season: 2026,
    provider: "football-data",
    updatedAt: "2026-11-01T22:00:00.000Z",
    // 마지막 팀(club-25)은 짝이 없어 4경기 — 대상 밖(few-matches)
    standings: SLUGS.map((team, i) =>
      i === SLUGS.length - 1
        ? {
            pos: i + 1,
            prevPos: null,
            team,
            played: 4,
            w: 0,
            d: 0,
            l: 4,
            gf: 0,
            ga: 8,
            pts: 0,
            form: [],
            zone: "relegation" as const,
          }
        : {
            pos: i + 1,
            prevPos: null,
            team,
            played: 6,
            w: 3,
            d: 0,
            l: 3,
            gf: 9,
            ga: 9,
            pts: 9,
            form: [],
            zone: "none" as const,
          },
    ),
    matches,
    scorers: [],
  };
}

function teamFile(slug: string, profile: Team["profile"] = null): Team {
  return TeamSchema.parse({
    slug,
    nameKo: `클럽${slug.slice(-2)}`,
    nameEn: `Club ${slug.slice(-2)}`,
    short: "CLB",
    comp: "EPL",
    alsoIn: [],
    colors: ["#112233", "#445566"],
    formation: null,
    topPlayers: [],
    profile,
    koreanPlayers: [],
    reading: [{ title: "글", url: "https://example.com/a", source: "blog" }],
    lineup: null,
  });
}

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

async function dataDirWith(
  prev: Partial<Record<string, Team["profile"]>> = {},
) {
  const dir = await mkdtemp(path.join(tmpdir(), "team-profile-"));
  tmpDirs.push(dir);
  await mkdir(path.join(dir, "competitions"), { recursive: true });
  await mkdir(path.join(dir, "teams"), { recursive: true });
  await writeFile(
    path.join(dir, "competitions", "epl.json"),
    JSON.stringify(competition()),
  );
  for (const slug of SLUGS) {
    await writeFile(
      path.join(dir, "teams", `${slug}.json`),
      serializeTeamFile(teamFile(slug, prev[slug] ?? null)),
    );
  }
  return dir;
}

const readTeam = async (dir: string, slug: string) =>
  TeamSchema.parse(
    JSON.parse(await readFile(path.join(dir, "teams", `${slug}.json`), "utf8")),
  );

// ─── 가짜 클라이언트 ─────────────────────────────────────────────────────

interface InputTeam {
  id: string;
  lg: {
    p: number;
    w: number;
    l: number;
    gf: number;
    ga: number;
    pts: number;
    pos: number;
  };
}

/** 입력 지표로 검증을 통과하는 답 — bad(기호)이면 영어 한줄평(검증 실패) */
function answer(
  req: LlmRequest,
  bad: (id: string, attempt: string) => boolean,
): string {
  const input = JSON.parse(req.user) as { t: InputTeam[] };
  return JSON.stringify({
    t: input.t.map((t) => ({
      id: t.id,
      o: bad(t.id, req.customId)
        ? "Mid-table side."
        : `${t.lg.p}경기 ${t.lg.w}승 ${t.lg.l}패로 리그 ${t.lg.pos}위다.`,
      s: [`${t.lg.gf}골의 득점력`, `승점 ${t.lg.pts} 확보`],
      w: [`${t.lg.l}패의 기록`, `${t.lg.ga}실점의 수비`],
    })),
  });
}

type Mode = "ok" | "timeout" | "max_tokens";

function fakeClient(opts: {
  bad?: (id: string, customId: string) => boolean;
  mode?: (call: number) => Mode;
}) {
  const calls: string[][] = [];
  let cancels = 0;
  const usage = { in: 3000, out: 6000, cacheRead: 2000, cacheWrite: 0 };
  const client: LlmClient = {
    mode: "mock",
    model: "claude-haiku-5-5",
    submitBatch: () => Promise.reject(new Error("unused")),
    pollBatch: () =>
      Promise.resolve({
        state: "ended",
        snapshot: {
          batchId: "b",
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
      calls.push(requests.map((r) => r.customId));
      const mode = opts.mode?.(calls.length) ?? "ok";
      if (mode === "timeout")
        return Promise.resolve({
          timedOut: true,
          batchId: `b-${calls.length}`,
          snapshot: null,
        });
      const results = new Map<string, LlmResult>();
      for (const req of requests) {
        results.set(
          req.customId,
          mode === "max_tokens"
            ? {
                customId: req.customId,
                batch: true,
                usage,
                thinkingTokens: 16000,
                ok: false,
                errorType: "max_tokens",
                message: "잘림",
                retryable: false,
              }
            : {
                customId: req.customId,
                batch: true,
                usage,
                thinkingTokens: 5000,
                ok: true,
                text: answer(req, opts.bad ?? (() => false)),
                stopReason: "end_turn",
              },
        );
      }
      return Promise.resolve({
        timedOut: false,
        batchId: `b-${calls.length}`,
        state: "ended",
        results,
        usage: {
          total: usage,
          batch: usage,
          single: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
          requests: { batch: requests.length, single: 0 },
        },
      });
    },
    callSingle: () => Promise.reject(new Error("팀 프로필은 배치만")),
  };
  return { client, calls, cancels: () => cancels };
}

const allowed = { allowed: true, reason: "ok" } as unknown as BudgetCheck; // allowed·reason만 읽는다

function ctxWith(over: {
  dataDir: string;
  client?: LlmClient;
  budget?: () => Promise<BudgetCheck>;
  dry?: boolean;
  force?: boolean;
  nowMs?: () => number;
}) {
  const billed: WeeklyBillableResult[] = [];
  const printed: string[] = [];
  const budgetEstimates: number[] = [];
  const ctx: WeeklyStageContext = {
    rootDir: ROOT,
    dataDir: over.dataDir,
    week: "2026-44",
    weekRange: RANGE,
    env: "dev",
    llmMode: "mock",
    dry: over.dry ?? false,
    force: over.force ?? false,
    runId: "weekly-dev-test",
    startedAt: new Date(T0).toISOString(),
    now: () => new Date(over.nowMs ? over.nowMs() : T0),
    signal: new AbortController().signal,
    logger: createLogger({ scope: "weekly", sink: () => {} }),
    print: (t) => printed.push(t),
    llm: {
      model: "claude-haiku-5-5",
      createClient: () => {
        if (!over.client) throw new Error("클라이언트 없음");
        return over.client;
      },
      addResults: (rs) => {
        for (const r of rs) billed.push(r);
      },
      costSoFar: () => 0,
    },
    budget: {
      check: (usd) => {
        budgetEstimates.push(usd);
        return over.budget ? over.budget() : Promise.resolve(allowed);
      },
    },
    apiCalls: { add: () => {} },
    http: {
      fetch: () =>
        Promise.reject(new Error("테스트에서 네트워크를 쓰지 않는다")),
      userAgent: "EuroDigestBot/0.1 (+test)",
    },
    sources: { add: () => {} },
  };
  return { ctx, billed, printed, budgetEstimates };
}

const PREV = (generatedAt: string) => ({
  oneLiner: "이전 한줄평이다.",
  strengths: ["이전 강점 하나", "이전 강점 둘"] as [string, string],
  weaknesses: ["이전 약점 하나", "이전 약점 둘"] as [string, string],
  generatedAt,
});

// ─── 단계 ────────────────────────────────────────────────────────────────

describe("runTeamProfiles", () => {
  it("대상 24팀 → 묶음 2개(12·12) 배치 1회, 모두 통과해 profile만 쓴다(reading 그대로)", async () => {
    const dataDir = await dataDirWith();
    const fake = fakeClient({});
    const { ctx, billed, printed } = ctxWith({ dataDir, client: fake.client });
    const report = await runTeamProfiles(ctx);
    expect(printed.join("\n")).not.toMatch(/\[실패\]/);
    expect(fake.calls).toEqual([
      ["team-profile-2026-44-g1", "team-profile-2026-44-g2"],
    ]);
    expect(report.counts).toMatchObject({
      targets: 24,
      skipped: 1,
      passed: 24,
      failed: 0,
      requests: 2,
    });
    expect(report.outputs).toHaveLength(24);
    expect(billed).toHaveLength(2);
    const t = await readTeam(dataDir, "club-01");
    expect(t.profile).toMatchObject({
      oneLiner: "6경기 3승 3패로 리그 1위다.",
      strengths: ["9골의 득점력", "승점 9 확보"],
      weaknesses: ["3패의 기록", "9실점의 수비"],
      generatedAt: "2026-11-01T23:05:00.000Z",
    });
    expect(t.reading).toHaveLength(1);
    expect((await readTeam(dataDir, "club-25")).profile).toBeNull(); // 대상 밖
  });

  it("검증에 걸린 팀만 모아 재시도 1회 — 재시도에서 통과", async () => {
    const dataDir = await dataDirWith();
    const fake = fakeClient({
      bad: (id, cid) => id === "t02" && !cid.includes("-r1-"),
    });
    const { ctx } = ctxWith({ dataDir, client: fake.client });
    const report = await runTeamProfiles(ctx);
    expect(fake.calls).toEqual([
      ["team-profile-2026-44-g1", "team-profile-2026-44-g2"],
      ["team-profile-2026-44-r1-g1"],
    ]);
    expect(report.counts).toMatchObject({ passed: 24, failed: 0, attempts: 2 });
  });

  it("재시도도 실패 → 템플릿 없이 이전 값(21일 안) 유지·오래된 값 비움", async () => {
    // 묶음 1의 t02 = club-02, 묶음 2의 t02 = club-14 — 둘 다 끝까지 실패
    const dataDir = await dataDirWith({
      "club-02": PREV("2026-10-26T00:00:00.000Z"),
      "club-14": PREV("2026-10-01T00:00:00.000Z"),
    });
    // 첫 시도는 각 묶음의 t02만, 재시도(실패 2팀을 다시 t01·t02로)는 전부 실패
    const fake = fakeClient({
      bad: (id, cid) => cid.includes("-r1-") || id === "t02",
    });
    const { ctx, printed } = ctxWith({ dataDir, client: fake.client });
    const report = await runTeamProfiles(ctx);
    expect(fake.calls[1]).toEqual(["team-profile-2026-44-r1-g1"]); // 실패 2팀 → 묶음 1개
    expect(report.counts).toMatchObject({
      passed: 22,
      failed: 2,
      kept: 1,
      cleared: 1,
    });
    expect((await readTeam(dataDir, "club-02")).profile?.oneLiner).toBe(
      "이전 한줄평이다.",
    );
    expect((await readTeam(dataDir, "club-14")).profile).toBeNull();
    expect(printed.join("\n")).toMatch(/club-02: check — latin@o/);
  });

  it("출력 잘림(max_tokens) — 모든 팀 실패로 재시도 1회, 그래도 잘리면 이전 값", async () => {
    const dataDir = await dataDirWith();
    const fake = fakeClient({ mode: () => "max_tokens" });
    const { ctx, billed } = ctxWith({ dataDir, client: fake.client });
    const report = await runTeamProfiles(ctx);
    expect(fake.calls).toHaveLength(2);
    expect(report.counts).toMatchObject({ passed: 0, failed: 24 });
    expect(billed).toHaveLength(4); // 잘린 결과도 과금 기록
    expect((await readTeam(dataDir, "club-01")).profile).toBeNull(); // 이전 값 없음 → null 그대로
  });

  it("비용 가드 초과 → LLM 없이 이전 값 유지", async () => {
    const dataDir = await dataDirWith({
      "club-01": PREV("2026-10-26T00:00:00.000Z"),
    });
    const fake = fakeClient({});
    const { ctx, budgetEstimates } = ctxWith({
      dataDir,
      client: fake.client,
      budget: () =>
        Promise.resolve({
          allowed: false,
          reason: "daily_exceeded",
        } as unknown as BudgetCheck),
    });
    const report = await runTeamProfiles(ctx);
    expect(fake.calls).toEqual([]);
    expect(budgetEstimates[0]).toBeGreaterThan(0);
    expect(report.counts).toMatchObject({ passed: 0, failed: 24, kept: 1 });
    expect((await readTeam(dataDir, "club-01")).profile?.oneLiner).toBe(
      "이전 한줄평이다.",
    );
  });

  it("마감 초과 → 배치 취소, 재시도하지 않는다", async () => {
    const dataDir = await dataDirWith();
    const fake = fakeClient({ mode: () => "timeout" });
    const { ctx } = ctxWith({ dataDir, client: fake.client });
    const report = await runTeamProfiles(ctx);
    expect(fake.calls).toHaveLength(1);
    expect(fake.cancels()).toBe(1);
    expect(report.counts).toMatchObject({ passed: 0, failed: 24 });
  });

  it("이번 주 프로필이 모두 있으면 건너뛰고(force면 다시), dry는 쓰지 않지만 비용은 기록", async () => {
    const fresh = PREV("2026-11-01T23:00:00.000Z"); // 월 08:00 KST
    expect(generatedThisRun(fresh, RANGE)).toBe(true);
    expect(generatedThisRun(PREV("2026-11-01T14:00:00.000Z"), RANGE)).toBe(
      false,
    ); // 일 23:00 KST
    const prev = Object.fromEntries(SLUGS.map((s) => [s, fresh]));
    const dataDir = await dataDirWith(prev);
    const fake = fakeClient({});
    const skip = await runTeamProfiles(
      ctxWith({ dataDir, client: fake.client }).ctx,
    );
    expect(skip.note).toMatch(/건너뜀/);
    expect(fake.calls).toEqual([]);

    const dry = ctxWith({
      dataDir,
      client: fake.client,
      force: true,
      dry: true,
    });
    const report = await runTeamProfiles(dry.ctx);
    expect(fake.calls).toHaveLength(1);
    expect(dry.billed).toHaveLength(2);
    expect(report.outputs).toEqual([]);
    expect((await readTeam(dataDir, "club-01")).profile?.oneLiner).toBe(
      "이전 한줄평이다.",
    );
  });

  it("팀 파일을 하나도 못 읽으면 단계 실패(던짐)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "team-profile-empty-"));
    tmpDirs.push(dir);
    await expect(
      runTeamProfiles(ctxWith({ dataDir: dir }).ctx),
    ).rejects.toThrow(/팀 파일이 없다/);
  });
});

// ─── 등록 ────────────────────────────────────────────────────────────────

describe("단계 등록 — data/teams 공유", () => {
  const stage = (id: string, over: Partial<WeeklyStage> = {}): WeeklyStage => ({
    id,
    title: id,
    task: "T",
    llm: false,
    timeoutMs: 1000,
    writes: [],
    run: null,
    ...over,
  });

  it("team-profiles 구현·data/teams를 analysis-blogs와 공유 — 등록 검사 통과", () => {
    const tp = WEEKLY_STAGES.find((s) => s.id === "team-profiles")!;
    expect(tp).toMatchObject({
      llm: true,
      writes: ["data/teams"],
      sharedWrites: ["data/teams"],
    });
    expect(tp.run).not.toBeNull();
    expect(checkWeeklyStages(WEEKLY_STAGES)).toEqual([]);
  });

  it("한쪽만 공유를 적었거나 writes 밖 공유 경로는 오류", () => {
    expect(
      checkWeeklyStages([
        stage("a", { writes: ["data/teams"], sharedWrites: ["data/teams"] }),
        stage("b", { writes: ["data/teams"] }),
      ]),
    ).toHaveLength(1);
    expect(
      checkWeeklyStages([
        stage("a", { writes: ["data/x"], sharedWrites: ["data/teams"] }),
      ]),
    ).toHaveLength(1);
    expect(
      checkWeeklyStages([
        stage("a", { writes: ["data/teams"], sharedWrites: ["data/teams"] }),
        stage("b", { writes: ["data/teams"], sharedWrites: ["data/teams"] }),
      ]),
    ).toEqual([]);
  });
});

// ─── 골든셋 mock 재생 ────────────────────────────────────────────────────

describe("eval:prompt --team-profile --mock", () => {
  it("골든 10팀 mock fixture를 재생해 같은 판정(결정적·무비용, 기록 없음)", async () => {
    const parsed = parseTeamEvalArgs(["--team-profile", "--mock"], undefined);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const dataDir = await mkdtemp(path.join(tmpdir(), "team-eval-"));
    tmpDirs.push(dataDir);
    const printed: string[] = [];
    const outcome = await runTeamProfileEval({
      rootDir: ROOT,
      dataDir,
      args: parsed.value,
      env: {},
      model: "claude-haiku-5-5",
      createLlm: (model) => createLlmClient({ mode: "mock", model, env: {} }),
      now: () => new Date(), // mock 클라이언트는 실제 시계로 마감을 본다
      logger: createLogger({ scope: "eval-prompt", sink: () => {} }),
      print: (t) => printed.push(t),
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.run?.mode).toBe("mock");
    expect(outcome.run?.costUsd).toBeNull();
    expect(outcome.run?.teams).toHaveLength(10);
    // v0.2 실측: 9팀 통과 + eintracht-frankfurt 강점 '리그 득점 12위(13골)의 공격'(18팀 중 12위 — 강점 쪽 대조에 걸림)
    expect(outcome.run?.passed).toBe(9);
    expect(
      outcome.run?.teams
        .filter((t) => t.reason !== "ok")
        .map((t) => [t.slug, t.detail]),
    ).toEqual([["eintracht-frankfurt", "side@s1(득점 12위)"]]);
  });
});
