/**
 * M1-44·M1-48 경기 데이터 단계 — runCollect 통합(scripts/lib/collect-run.ts). 네트워크·실호출 없음.
 *
 * 필수 항목: 프로바이더별 병렬·실패 격리, 순위 호출 대상 선별(종료 경기가 있는 대회만),
 * football-data 실패 = 그날 브리핑 생략·뉴스 발행(D24), 순위 일부 실패 = 브리핑 진행·partial, 단계 시간 예산(150초),
 * 유럽 서머타임 종료 직후 겨울 슬롯(07:10 KST)의 입력 창, 실행 기록 apiCalls.footballData·apiFootball,
 * API-Football(M1-48): 브리핑은 컷오프까지의 몫만 기다리고 나머지는 계속, 일일 카운터(runs 합) 상한 → 건너뜀·partial,
 * 이월 파일 쓰기(dry 제외), errors.plan → 이슈 사건 파일(source-broken), 짝짓기(대응표 확인 + D37 강한 증거).
 * 경기 기록 원장(M1-48b): COLLECT_ENABLED(ledgerEnabled) 꺼짐/켜짐·dry·dev, 첫 정기 실행 since·playerSince, 원장의 af-<id>로
 * 재요청 생략(known), 내용 같으면 다시 쓰지 않음, 빠진 날(skipped·date-query) 기록·치유, 원장 쓰기 실패 → 이월 목록에 다시,
 * 브리핑 입력 goals(연결 경기만).
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AfPendingFileSchema,
  MatchLedgerFileSchema,
  MatchLedgerMetaSchema,
  RunsDevFileSchema,
  RunsFileSchema,
  SourcesFileSchema,
  type MatchLedgerMeta,
} from "@/lib/schema";

import {
  runCollect,
  runStatus,
  type BriefOutcome,
  type CollectDeps,
} from "../scripts/lib/collect-run";
import { createLlmClient, type LlmClient } from "../scripts/lib/llm";
import { SourceBrokenPayloadSchema } from "../scripts/lib/github-issues";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { isolateProvider } from "../scripts/lib/match-data";
import { isIncompleteLedgerMatch } from "../scripts/lib/match-ledger";
import {
  FOOTBALL_DATA_BASE_URL,
  FOOTBALL_DATA_STAGE_BUDGET_MS,
} from "../scripts/lib/providers/football-data";
import { feedUserAgent, type FetchLike } from "../scripts/lib/rss";

import {
  afFixtureBody,
  afFixtureResponse,
  afPath,
  readAfFixture,
} from "./support/api-football-fake";
import { cancelGate } from "./support/cancel-gate";
import { fdFixtureResponse, fdPath } from "./support/football-data-fake";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const SOURCES = SourcesFileSchema.parse(
  JSON.parse(read("configs/sources.json")),
);
const BBC = SOURCES.find((s) => s.id === "bbc-sport-football")!;
const BBC_XML = read("fixtures/rss/bbc-sport-football.xml");

/** 06:30 KST 2026-10-11 — 발행일 2026-10-11, 입력 창 = UTC 2026-10-10 */
const NOW = new Date("2026-10-10T21:30:00.000Z");

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-matchdata-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

type FdHandler = (url: string) => Response | Promise<Response>;

function makeDeps(
  fd: FdHandler = (url) => fdFixtureResponse(url)!,
  over: Partial<CollectDeps> = {},
  af: FdHandler = (url) => afFixtureResponse(url)!,
) {
  const records: LogRecord[] = [];
  const printed: string[] = [];
  const fdCalls: string[] = [];
  const afCalls: string[] = [];
  let llmCalls = 0;
  const fetch: FetchLike = async (url) => {
    if (url === BBC.url) return new Response(BBC_XML, { status: 200 });
    if (url.startsWith(FOOTBALL_DATA_BASE_URL)) {
      fdCalls.push(fdPath(url)!);
      return fd(url);
    }
    if (afPath(url) !== null) {
      afCalls.push(afPath(url)!);
      return af(url);
    }
    throw new Error(`테스트에서 예상하지 못한 URL: ${url}`);
  };
  const deps: CollectDeps = {
    rootDir: ROOT,
    dataDir,
    env: "dev",
    llmMode: "mock",
    dry: false,
    limit: 5, // 소량 실행(--limit 5) — 이 파일은 경기 데이터 경로를 본다
    loadSources: async () => [BBC],
    now: () => NOW,
    fetch,
    userAgent: feedUserAgent("test@example.com"),
    feedClock: { now: () => 0, sleep: async () => undefined },
    footballDataApiKey: "test-football-data-key",
    footballDataSleep: async () => undefined,
    createLlm: () => {
      const client = createLlmClient({ mode: "mock", logger: () => undefined });
      const spy: Pick<LlmClient, "callSingle" | "model"> = {
        model: client.model,
        callSingle: (request, options) => {
          llmCalls += 1;
          return client.callSingle(request, options);
        },
      };
      return spy;
    },
    resolveBriefConfig: () => ({
      model: "claude-haiku-5-5",
      budgets: { dailyBudgetUsd: 0.1, monthlyBudgetUsd: 3 },
    }),
    logger: createLogger({
      scope: "collect",
      format: "json",
      sink: (_line, record) => records.push(record),
    }),
    print: (text) => printed.push(text),
    ...over,
  };
  return {
    deps,
    records,
    printed,
    fdCalls,
    afCalls,
    llmCalls: () => llmCalls,
  };
}

/** 08:30 KST 2026-10-11(= 2026-10-10T23:30Z) — 발행일·브리핑 창은 NOW와 같고, 개발 실행 금지 시간대(06:00~08:00 KST) 밖 */
const DEV_OK_NOW = new Date("2026-10-10T23:30:00.000Z");

/**
 * API-Football 키와 가상 시계(간격 대기는 시각만 민다) — 기본 makeDeps는 키가 없어 API-Football을 건너뛴다.
 * dev 실행은 06:00~08:00 KST에 API-Football을 부르지 않으므로 기본 시각을 08:30 KST로 둔다(NOW 06:30 KST 대신).
 */
function withApiFootball(
  over: Partial<CollectDeps> = {},
): Partial<CollectDeps> {
  let t = 0;
  return {
    now: () => DEV_OK_NOW,
    apiFootballApiKey: "test-api-football-key",
    apiFootballNow: () => t,
    apiFootballSleep: async (ms) => {
      t += ms;
    },
    ...over,
  };
}

describe("runCollect — 경기 데이터 단계(M1-44)", () => {
  it("football-data 경기 1 + 순위 5요청, API-Football 키 없음은 건너뜀(success 유지), 브리핑 진행·success", async () => {
    const { deps, fdCalls, llmCalls, records } = makeDeps();
    const outcome = await runCollect(deps);
    expect(fdCalls).toEqual([
      "/matches?competitions=PL,PD,SA,BL1,FL1,CL&dateFrom=2026-10-10&dateTo=2026-10-11",
      "/competitions/PL/standings",
      "/competitions/PD/standings",
      "/competitions/SA/standings",
      "/competitions/BL1/standings",
      "/competitions/FL1/standings",
    ]);
    const md = outcome.matchData!;
    expect(md.apiFootball).toMatchObject({
      provider: "api-football",
      state: "skipped",
      reason: "no-api-key",
    });
    expect(md.apiFootballBrief).toBeNull();
    expect(md.pairing).toBeNull();
    if (md.footballData.state !== "done") throw new Error("unreachable");
    expect(md.footballData.data.results).toHaveLength(23);
    expect(md.footballData.data.standings.map((s) => s.comp)).toEqual([
      "EPL",
      "LALIGA",
      "SERIEA",
      "BUNDESLIGA",
      "LIGUE1",
    ]);
    expect(outcome.brief).toMatchObject({ state: "done", inputMatches: 23 });
    expect(llmCalls()).toBe(1);
    expect(outcome.status).toBe("success");
    const done = records.find(
      (r) =>
        r.event === "collect.matchdata.done" && r.provider === "football-data",
    );
    expect(done).toMatchObject({
      finished: 23,
      apiCalls: 6,
      standingsRows: 96,
      standingsFailed: [],
    });
    // 순위는 지금 브리핑 입력에 넣지 않는다(M1-19) — 입력 키는 그대로
    const input = records.find((r) => r.event === "summarize.input.done");
    expect(input).toMatchObject({ matches: 23 });
  });

  it("--dry: 경기 데이터 요약을 출력한다(호출 수·경기·순위)", async () => {
    const { deps, printed } = makeDeps(undefined, { dry: true });
    await runCollect(deps);
    const summary = printed.find((p) => p.startsWith("── [dry] 경기 데이터"));
    expect(summary).toContain("창 안 종료 23경기");
    expect(summary).toContain("EPL 20팀");
    expect(summary).toContain("api-football: 건너뜀(no-api-key)");
  });

  it("경기 요청 실패(연결 오류 — 재시도 없음) → 그날 브리핑 생략, 뉴스는 발행, partial · exit 0", async () => {
    const { deps, fdCalls, llmCalls } = makeDeps(() => {
      throw new TypeError("fetch failed");
    });
    const outcome = await runCollect(deps);
    expect(fdCalls).toHaveLength(1);
    expect(outcome.matchData?.footballData).toMatchObject({
      state: "failed",
      errorType: "network",
    });
    expect(outcome.brief).toMatchObject({
      state: "failed",
      reason: "football-data",
    });
    expect(llmCalls()).toBe(0);
    expect(outcome.news.path).not.toBeNull();
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("partial");
  });

  it("순위 일부 실패 → 그 대회 순위만 빠지고 브리핑은 진행, partial", async () => {
    const { deps, llmCalls, records } = makeDeps((url) =>
      url.endsWith("/competitions/SA/standings")
        ? new Response("err", { status: 503 })
        : fdFixtureResponse(url)!,
    );
    const outcome = await runCollect(deps);
    const fd = outcome.matchData!.footballData;
    if (fd.state !== "done") throw new Error("unreachable");
    expect(fd.data.standingsFailed).toEqual([
      expect.objectContaining({ comp: "SERIEA", errorType: "http" }),
    ]);
    expect(outcome.brief.state).toBe("done");
    expect(llmCalls()).toBe(1);
    expect(outcome.status).toBe("partial");
    expect(
      records.find((r) => r.event === "collect.standings.fail"),
    ).toMatchObject({ comp: "SERIEA", errorType: "http" });
    expect(
      records.filter((r) => r.event === "collect.matchdata.retry"),
    ).toHaveLength(1);
  });

  it("단계 시간 예산(150초) — 넘으면 남은 대회 순위는 요청 없이 budget, 경기 결과·브리핑은 진행", async () => {
    let t = 0;
    const { deps, fdCalls } = makeDeps(
      (url) => {
        t += 70_000; // 요청마다 70초 걸린다고 가정
        return fdFixtureResponse(url)!;
      },
      {
        footballDataNow: () => t,
        footballDataSleep: async (ms) => {
          t += ms;
        },
      },
    );
    const outcome = await runCollect(deps);
    // 경기(70초) → 간격 6.5초 → PL(146.5초) → 남은 3.5초 < 간격 6.5초 + 최소 시도 3초 → 나머지 budget
    expect(fdCalls).toHaveLength(2);
    expect(t).toBeLessThanOrEqual(FOOTBALL_DATA_STAGE_BUDGET_MS);
    const fd = outcome.matchData!.footballData;
    if (fd.state !== "done") throw new Error("unreachable");
    expect(fd.data.standings.map((s) => s.comp)).toEqual(["EPL"]);
    expect(fd.data.standingsFailed.map((f) => f.errorType)).toEqual([
      "budget",
      "budget",
      "budget",
      "budget",
    ]);
    expect(outcome.brief.state).toBe("done");
    expect(outcome.status).toBe("partial");
  });

  it("서머타임 종료 직후 겨울 슬롯(2026-10-26 07:10 KST) — 입력 창 = UTC 2026-10-25, 종료 경기 없으면 순위·LLM 호출 없음", async () => {
    const { deps, fdCalls, llmCalls } = makeDeps(
      (url) =>
        fdPath(url)!.startsWith("/matches?")
          ? new Response('{"matches":[]}', { status: 200 })
          : fdFixtureResponse(url)!,
      { now: () => new Date("2026-10-25T22:10:00.000Z") },
    );
    const outcome = await runCollect(deps);
    expect(outcome.publishDate).toBe("2026-10-26");
    expect(fdCalls).toEqual([
      "/matches?competitions=PL,PD,SA,BL1,FL1,CL&dateFrom=2026-10-25&dateTo=2026-10-26",
    ]);
    expect(outcome.brief).toMatchObject({
      state: "skipped",
      reason: "no-matches",
    });
    expect(llmCalls()).toBe(0);
  });

  it("키가 없으면 football-data는 skipped(no-api-key) — 요청 없음, 브리핑도 건너뜀", async () => {
    const { deps, fdCalls } = makeDeps(undefined, {
      footballDataApiKey: "  ",
    });
    const outcome = await runCollect(deps);
    expect(fdCalls).toEqual([]);
    expect(outcome.matchData?.footballData).toMatchObject({
      state: "skipped",
      reason: "no-api-key",
    });
    expect(outcome.brief).toMatchObject({
      state: "skipped",
      reason: "no-api-key",
    });
  });
});

describe("isolateProvider·runStatus — 프로바이더 실패 격리", () => {
  it("예상 밖 예외도 그 프로바이더의 failed(unexpected)로 바뀐다(던지지 않는다)", async () => {
    let t = 100;
    const outcome = await isolateProvider(
      "api-football",
      async () => {
        t += 5;
        throw new Error("boom\n두 번째 줄");
      },
      () => t,
    );
    expect(outcome).toEqual({
      provider: "api-football",
      state: "failed",
      errorType: "unexpected",
      error: "boom",
      elapsedMs: 5,
    });
  });

  it("순위 일부 실패는 partial, 순위가 모두 있으면 success", () => {
    const news = { ok: true, sources: [{ ok: true }] };
    const brief: BriefOutcome = {
      state: "done",
      inputMatches: 3,
      lines: ["x"],
    };
    const fd = (failed: number) => ({
      footballData: {
        provider: "football-data" as const,
        state: "done" as const,
        elapsedMs: 1,
        data: {
          window: { start: "", end: "" },
          fetched: 0,
          results: [],
          skipped: {
            invalid: 0,
            notFinished: 0,
            outOfWindow: 0,
            unknownComp: 0,
          },
          inProgress: {},
          others: [],
          standings: [],
          standingsFailed: Array.from({ length: failed }, () => ({
            comp: "EPL" as const,
            errorType: "http" as const,
            error: "x",
          })),
        },
      },
    });
    expect(runStatus(news, brief, fd(0))).toBe("success");
    expect(runStatus(news, brief, fd(1))).toBe("partial");
    expect(runStatus(news, brief)).toBe("success");
  });
});

describe("runCollect — API-Football 경기 단건 단계(M1-48)", () => {
  const indexOf = (records: LogRecord[], event: string, provider?: string) =>
    records.findIndex(
      (r) =>
        r.event === event &&
        (provider === undefined || r.provider === provider),
    );

  it("날짜 2 + 단건 23요청, 브리핑은 API-Football 몫(complete)을 받은 뒤 진행, 이월 파일(INT 1경기), 짝짓기 23쌍, success", async () => {
    const { deps, afCalls, records, llmCalls } = makeDeps(
      undefined,
      withApiFootball(),
    );
    const outcome = await runCollect(deps);
    expect(afCalls.slice(0, 2)).toEqual([
      "/fixtures?date=2026-10-10",
      "/fixtures?date=2026-10-09",
    ]);
    expect(afCalls).toHaveLength(25);
    const md = outcome.matchData!;
    if (md.apiFootball.state !== "done") throw new Error("unreachable");
    expect(md.apiFootball.data.calls).toBe(25);
    expect(md.apiFootball.data.stage.details).toHaveLength(23);
    expect(md.apiFootballBrief).toMatchObject({
      reason: "complete",
      missing: [],
    });
    expect(md.apiFootballBrief!.details).toHaveLength(23);
    // 브리핑은 API-Football 브리핑 몫을 받은 뒤 입력을 만든다
    expect(indexOf(records, "collect.matchdata.brief-ready")).toBeLessThan(
      indexOf(records, "summarize.input.done"),
    );
    expect(outcome.brief.state).toBe("done");
    expect(llmCalls()).toBe(1);
    // 이월 목록 — 중단(INT) 경기 1건. dev 실행은 파일을 쓰지 않는다(리뷰 권장 4 — prod·비dry만)
    expect(
      md.apiFootball.data.stage.pending.map((f) => [f.id, f.status, f.comp]),
    ).toEqual([[1570410, "INT", "LALIGA"]]);
    expect(existsSync(path.join(dataDir, "cache", "af-pending.json"))).toBe(
      false,
    );
    // 짝짓기 — 2026-10-10 종료 23경기 모두 대응표(team-ids.json)로 확인된 쌍
    expect(md.pairing?.links).toHaveLength(23);
    expect(md.pairing?.unconfirmed).toEqual([]);
    expect(md.pairing?.report.candidates).toEqual([]);
    const link = md.pairing!.links.find((l) => l.af.matchId === 1575180)!;
    expect(link.fd.score.ft).toEqual(link.af.score.ft);
    expect(outcome.status).toBe("success");
    expect(
      records.find(
        (r) =>
          r.event === "collect.matchdata.done" && r.provider === "api-football",
      ),
    ).toMatchObject({
      apiCalls: 25,
      details: 23,
      pending: 1,
      pendingWritten: false,
      stoppedBy: null,
    });
  });

  it("prod 실행(정기 운영 전 — 원장 쓰지 않음)은 이월 파일을 쓴다 — INT 1경기(원장이 없으니 불완전 항목은 올리지 않는다)", async () => {
    const { deps, records } = makeDeps(
      undefined,
      withApiFootball({ env: "prod" }),
    );
    await runCollect(deps);
    const pending = AfPendingFileSchema.parse(
      JSON.parse(
        readFileSync(path.join(dataDir, "cache", "af-pending.json"), "utf8"),
      ),
    );
    expect(pending.fixtures.map((f) => [f.id, f.status, f.comp])).toEqual([
      [1570410, "INT", "LALIGA"],
    ]);
    expect(
      records.find(
        (r) =>
          r.event === "collect.matchdata.done" && r.provider === "api-football",
      ),
    ).toMatchObject({ pendingWritten: true });
  });

  it("브리핑 컷오프 — API-Football이 느리면 브리핑은 컷오프(4분)에 진행하고, 나머지는 브리핑 뒤에 끝난다(단계 예산 6분 → 이월·partial)", async () => {
    let t = 0;
    // 브리핑 몫을 넘긴 뒤의 API-Football 요청은 브리핑이 끝날 때까지 붙잡는다 — 브리핑이 나머지를 기다리지 않음을 보인다
    const starts: number[] = [];
    let afBriefSent = false;
    let releaseAf: () => void = () => undefined;
    const briefDoneGate = new Promise<void>((resolve) => {
      releaseAf = resolve;
    });
    const { deps, records } = makeDeps(
      undefined,
      withApiFootball({
        apiFootballNow: () => t,
        apiFootballSleep: async (ms) => {
          t += ms;
        },
      }),
      async (url) => {
        if (afBriefSent) await briefDoneGate;
        starts.push(t);
        t += 20_000; // 요청마다 20초(가짜 fetch는 타임아웃 신호를 보지 않는다)
        return afFixtureResponse(url)!;
      },
    );
    deps.logger = createLogger({
      scope: "collect",
      format: "json",
      sink: (_line, record) => {
        records.push(record);
        if (record.event === "collect.matchdata.brief-ready")
          afBriefSent = true;
        if (record.event === "summarize.brief.done") releaseAf();
      },
    });
    const outcome = await runCollect(deps);
    const md = outcome.matchData!;
    expect(md.apiFootballBrief?.reason).toBe("cutoff");
    expect(md.apiFootballBrief!.details.length).toBeGreaterThan(0);
    expect(md.apiFootballBrief!.missing.length).toBeGreaterThan(0);
    const briefReady = indexOf(records, "collect.matchdata.brief-ready");
    const briefDone = indexOf(records, "summarize.brief.done");
    const afDone = indexOf(records, "collect.matchdata.done", "api-football");
    expect(briefReady).toBeLessThan(briefDone);
    expect(briefDone).toBeLessThan(afDone);
    if (md.apiFootball.state !== "done") throw new Error("unreachable");
    expect(md.apiFootball.data.stage.stoppedBy).toBe("budget");
    // 단계 예산(6분) 안에서만 요청을 시작한다(마지막 요청은 남은 시간으로 타임아웃이 줄어든다)
    expect(Math.max(...starts)).toBeLessThan(360_000);
    expect(outcome.brief.state).toBe("done");
    expect(outcome.status).toBe("partial");
  });

  it("계절별 마감(M1-47) — 늦게 시작한 여름 slot 실행(06:45 KST, 마감 06:50까지 5분): 컷오프 1분·단계 5분으로 줄고 LLM은 06:50 마감을 받는다", async () => {
    const LATE = new Date("2026-10-10T21:45:00.000Z"); // 2026-10-11 06:45 KST
    let t = 0;
    const starts: number[] = [];
    const deadlines: Array<Date | undefined> = [];
    const { deps, records } = makeDeps(
      undefined,
      withApiFootball({
        env: "prod", // dev는 06:00~08:00 KST에 API-Football을 부르지 않는다
        now: () => LATE,
        apiFootballNow: () => t,
        apiFootballSleep: async (ms) => {
          t += ms;
        },
        createLlm: () => {
          const client = createLlmClient({
            mode: "mock",
            logger: () => undefined,
          });
          return {
            model: client.model,
            callSingle: (request, options) => {
              deadlines.push(options?.deadline);
              return client.callSingle(request, options);
            },
          };
        },
      }),
      async (url) => {
        starts.push(t);
        t += 20_000; // 요청마다 20초
        return afFixtureResponse(url)!;
      },
    );
    const outcome = await runCollect(deps);
    expect(records.find((r) => r.event === "collect.deadline")).toMatchObject({
      date: "2026-10-11",
      season: "summer",
      basis: "slot",
      briefDeadline: "2026-10-10T21:50:00.000Z",
      briefDeadlineKst: "06:50",
      remainingMs: 300_000,
      footballDataBudgetMs: 150_000,
      afBriefCutoffMs: 60_000,
      afStageBudgetMs: 300_000,
    });
    const md = outcome.matchData!;
    // 날짜 조회 2건(46.5초) 뒤 첫 판정에서 컷오프(60초) — 득점자 없이 브리핑 진행
    expect(md.apiFootballBrief?.reason).toBe("cutoff");
    expect(md.apiFootballBrief!.details).toEqual([]);
    expect(md.apiFootballBrief!.missing.length).toBeGreaterThan(0);
    if (md.apiFootball.state !== "done") throw new Error("unreachable");
    // 단계는 브리핑 마감(5분)에서 멈추고 나머지는 이월 — 6분 상수보다 짧다
    expect(md.apiFootball.data.stage.stoppedBy).toBe("budget");
    expect(Math.max(...starts)).toBeLessThan(300_000);
    expect(md.apiFootball.data.stage.pending.length).toBeGreaterThan(1);
    expect(outcome.brief.state).toBe("done");
    expect(deadlines).toEqual([new Date("2026-10-10T21:50:00.000Z")]);
  });

  it("계절별 마감(M1-47) — 마감이 지난 수동 실행(08:30 KST)은 off-slot: 시작 + 8분을 마감으로, 단계 예산은 상수 그대로", async () => {
    const deadlines: Array<Date | undefined> = [];
    const { deps, records } = makeDeps(
      undefined,
      withApiFootball({
        createLlm: () => {
          const client = createLlmClient({
            mode: "mock",
            logger: () => undefined,
          });
          return {
            model: client.model,
            callSingle: (request, options) => {
              deadlines.push(options?.deadline);
              return client.callSingle(request, options);
            },
          };
        },
      }),
    );
    const outcome = await runCollect(deps);
    expect(records.find((r) => r.event === "collect.deadline")).toMatchObject({
      date: "2026-10-11",
      season: "summer",
      basis: "off-slot",
      briefDeadline: "2026-10-10T23:38:00.000Z", // 08:30 + 8분
      afBriefCutoffMs: 240_000,
      afStageBudgetMs: 360_000,
    });
    expect(outcome.matchData?.apiFootballBrief?.reason).toBe("complete");
    expect(deadlines).toEqual([new Date("2026-10-10T23:38:00.000Z")]);
  });

  it("football-data가 실패하면 브리핑은 생략되므로 API-Football 몫을 기다리지 않는다(API-Football은 끝까지 받는다)", async () => {
    // API-Football 요청은 브리핑 단계가 끝났다는 로그(summarize.input.fail)가 나올 때까지 붙잡힌다 — 브리핑이 기다리면 멈춘다
    let release: () => void = () => undefined;
    const briefSkipped = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { deps, records, afCalls } = makeDeps(
      () => {
        throw new TypeError("fetch failed");
      },
      withApiFootball(),
      async (url) => {
        await briefSkipped;
        return afFixtureResponse(url)!;
      },
    );
    deps.logger = createLogger({
      scope: "collect",
      format: "json",
      sink: (_line, record) => {
        records.push(record);
        if (record.event === "summarize.input.fail") release();
      },
    });
    const outcome = await runCollect(deps);
    expect(outcome.brief).toMatchObject({
      state: "failed",
      reason: "football-data",
    });
    expect(afCalls).toHaveLength(25);
    expect(outcome.matchData?.apiFootball.state).toBe("done");
    // 최종 결과에는 API-Football 몫이 남는다(브리핑이 쓰지 않았을 뿐) — 짝짓기는 football-data가 없어 null
    expect(outcome.matchData?.apiFootballBrief?.reason).toBe("complete");
    expect(outcome.matchData?.pairing).toBeNull();
  });

  it("--dry: API-Football 요약(대상·결과·득점자·이월 미리보기)과 짝짓기를 출력하고, 이월 파일은 쓰지 않는다", async () => {
    const { deps, printed } = makeDeps(
      undefined,
      withApiFootball({ dry: true }),
    );
    await runCollect(deps);
    const summary = printed.find((p) => p.startsWith("── [dry] 경기 데이터"))!;
    expect(summary).toContain(
      "api-football: 날짜 2026-10-10 36경기 · 2026-10-09 0경기 → 대상 24경기",
    );
    expect(summary).toContain(
      "af 1575180 BUNDESLIGA FC Augsburg(170) 2-2 Bayern München(157) [FT] 3-4-2-1/4-2-3-1",
    );
    expect(summary).toContain("[dry] data/cache/af-pending.json — 쓰지 않음");
    expect(summary).toContain("짝짓기: 연결 23(대응표 23 · 증거 0)");
    // 원장(M1-48b) — dry는 쓰지 않고 항목·한국 선수 행·이름 대조만 보여 준다
    expect(summary).toContain(
      "원장: 쓰지 않음(dry) · 항목 23경기(이미 받음 0 · 형식 오류 0 · 불완전 16) · 한국 선수 행 5",
    );
    expect(summary).toContain(
      "· af 1575180 seol-young-woo start 62분 0골 0도움",
    );
    expect(summary).toContain(
      "이름 대조(kim-ji-soo, id 없음): af 1557418 away — 후보 없음",
    );
    expect(existsSync(path.join(dataDir, "cache", "af-pending.json"))).toBe(
      false,
    );
    expect(existsSync(path.join(dataDir, "matches"))).toBe(false);
  });

  it("일일 카운터 — 오늘(UTC) dev 기록이 50회면 건너뜀(daily-cap): 요청 없음, 브리핑은 그대로, partial", async () => {
    const run = {
      runId: "collect-dev-20261010T100000Z-aaaa",
      env: "dev",
      job: "collect",
      startedAt: "2026-10-10T10:00:00.000Z",
      finishedAt: "2026-10-10T10:01:00.000Z",
      collected: 0,
      clusters: 0,
      summarized: 0,
      downgraded: 0,
      tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
      costUsd: 0,
      apiCalls: { footballData: 0, apiFootball: 50 },
      sources: [],
      status: "success",
    };
    writeFileSync(
      path.join(dataDir, "runs-dev.json"),
      JSON.stringify([run]),
      "utf8",
    );
    const { deps, afCalls, records } = makeDeps(undefined, withApiFootball());
    const outcome = await runCollect(deps);
    expect(afCalls).toEqual([]);
    expect(outcome.matchData?.apiFootball).toMatchObject({
      state: "skipped",
      reason: "daily-cap",
    });
    expect(
      records.find((r) => r.event === "collect.matchdata.quota"),
    ).toMatchObject({
      env: "dev",
      cap: 50,
      usedOwn: 50,
      remaining: 0,
    });
    expect(outcome.brief.state).toBe("done");
    expect(outcome.status).toBe("partial");
  });

  it("실행 기록 apiCalls.apiFootball — prod 실행이 25회를 남기면 같은 UTC 날 다음 실행의 허용량은 35", async () => {
    const live = {
      env: "prod" as const,
      llmMode: "live" as const,
    };
    const first = makeDeps(
      undefined,
      withApiFootball({ ...live, now: () => NOW }),
    );
    await runCollect(first.deps);
    const runs = RunsFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs.json"), "utf8")),
    );
    expect(runs.at(-1)!.apiCalls).toEqual({ footballData: 6, apiFootball: 25 });
    // 백업 실행(같은 날 21:40Z)
    const second = makeDeps(
      undefined,
      withApiFootball({
        ...live,
        now: () => new Date("2026-10-10T21:40:00.000Z"),
      }),
    );
    await runCollect(second.deps);
    expect(
      second.records.find((r) => r.event === "collect.matchdata.quota"),
    ).toMatchObject({
      cap: 60,
      usedOwn: 25,
      remaining: 35,
      limitedBy: "env-cap",
    });
  });

  it("errors.plan → 재시도 없이 FR-65 강등, 소스 이슈 사건 파일에 source-broken(api-football) 1건을 더한다, partial", async () => {
    const reportDir = mkdtempSync(
      path.join(os.tmpdir(), "euro-digest-af-issue-"),
    );
    const file = path.join(reportDir, "source-health.json");
    try {
      const { deps, afCalls, records } = makeDeps(
        undefined,
        withApiFootball({ healthReportPath: file }),
        () =>
          new Response(readAfFixture("errors-plan-date.json"), { status: 200 }),
      );
      const outcome = await runCollect(deps);
      expect(afCalls).toEqual(["/fixtures?date=2026-10-10"]);
      expect(
        records.find((r) => r.event === "collect.matchdata.degraded"),
      ).toMatchObject({
        fallback: "FR-65",
        endpoint: "date",
      });
      const events = JSON.parse(readFileSync(file, "utf8")) as unknown[];
      const af = events.filter(
        (e) => (e as { sourceId?: string }).sourceId === "api-football",
      );
      expect(af).toHaveLength(1);
      expect(SourceBrokenPayloadSchema.safeParse(af[0]).success).toBe(true);
      expect(af[0]).toMatchObject({
        errorType: "plan",
        sourceName: "API-Football",
      });
      expect(outcome.brief.state).toBe("done"); // 득점자 없이 브리핑은 진행(뉴스·브리핑 발행 계속)
      expect(outcome.status).toBe("partial");
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  });

  it("뉴스가 실패하면 API-Football도 취소 — 첫 요청 이하, 이월 파일을 쓰지 않는다", async () => {
    const gate = cancelGate();
    const afCalls: string[] = [];
    const records: LogRecord[] = [];
    const { deps } = makeDeps(
      undefined,
      withApiFootball({
        apiFootballSleep: gate.sleep,
        footballDataSleep: gate.sleep,
        fetch: async (url) => {
          if (url === BBC.url) return new Response("busy", { status: 503 });
          if (afPath(url) !== null) {
            afCalls.push(afPath(url)!);
            return afFixtureResponse(url)!;
          }
          return fdFixtureResponse(url)!;
        },
      }),
    );
    deps.logger = gate.logger(records);
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.brief).toMatchObject({
      state: "skipped",
      reason: "news-failed",
    });
    expect(afCalls.length).toBeLessThanOrEqual(1);
    expect(existsSync(path.join(dataDir, "cache", "af-pending.json"))).toBe(
      false,
    );
  });

  it("이월 파일이 손상돼 있으면 경고하고 빈 목록으로 진행, 새 파일로 고친다", async () => {
    mkdirSync(path.join(dataDir, "cache"), { recursive: true });
    writeFileSync(
      path.join(dataDir, "cache", "af-pending.json"),
      "{ broken",
      "utf8",
    );
    const { deps, records } = makeDeps(
      undefined,
      withApiFootball({ env: "prod" }),
    );
    await runCollect(deps);
    expect(
      records.find((r) => r.event === "collect.matchdata.pending-unreadable"),
    ).toMatchObject({ error: "JSON 파싱 실패" });
    expect(
      AfPendingFileSchema.safeParse(
        JSON.parse(
          readFileSync(path.join(dataDir, "cache", "af-pending.json"), "utf8"),
        ),
      ).success,
    ).toBe(true);
  });

  it("개발 실행은 06:00~08:00 KST(봇 수집 시간대)에 API-Football을 부르지 않는다(dev-quiet-hours) — prod는 같은 시각에 부른다", async () => {
    const dev = makeDeps(undefined, withApiFootball({ now: () => NOW })); // 06:30 KST
    const outcome = await runCollect(dev.deps);
    expect(dev.afCalls).toEqual([]);
    expect(outcome.matchData?.apiFootball).toMatchObject({
      state: "skipped",
      reason: "dev-quiet-hours",
    });
    expect(
      dev.records.find(
        (r) =>
          r.event === "collect.matchdata.skip" && r.provider === "api-football",
      ),
    ).toMatchObject({ reason: "dev-quiet-hours", kst: "06:00~08:00" });
    expect(outcome.status).toBe("success"); // 의도된 건너뜀 — partial 아님

    rmSync(path.join(dataDir, "runs-dev.json"), { force: true });
    const prod = makeDeps(
      undefined,
      withApiFootball({ env: "prod", now: () => NOW }),
    );
    await runCollect(prod.deps);
    expect(prod.afCalls).toHaveLength(25);
  });

  it("실행 기록(runs.json)을 읽지 못하면 fail-closed — 허용량 10(날짜 2 + 단건 8), 남은 brief 경기는 이월", async () => {
    writeFileSync(path.join(dataDir, "runs.json"), "{ broken", "utf8");
    const { deps, afCalls, records } = makeDeps(undefined, withApiFootball());
    const outcome = await runCollect(deps);
    expect(afCalls).toHaveLength(10);
    expect(
      records.find((r) => r.event === "collect.matchdata.runs-unreadable"),
    ).toMatchObject({ file: "runs.json" });
    expect(
      records.find((r) => r.event === "collect.matchdata.quota"),
    ).toMatchObject({
      remaining: 10,
      limitedBy: "runs-unreadable",
      runsUnreadable: true,
    });
    const md = outcome.matchData!;
    if (md.apiFootball.state !== "done") throw new Error("unreachable");
    expect(md.apiFootball.data.stage.stoppedBy).toBe("cap");
    expect(md.apiFootball.data.stage.details).toHaveLength(8);
  });

  it("mock·dev 실행도 데이터 API 호출 수를 runs-dev.json에 비용 0으로 남긴다 — 같은 UTC 날 다음 실행의 카운터에 잡힌다", async () => {
    const first = makeDeps(undefined, withApiFootball());
    const outcome = await runCollect(first.deps);
    expect(outcome.run).toMatchObject({
      env: "dev",
      costUsd: 0,
      summarized: 0,
      apiCalls: { footballData: 6, apiFootball: 25 },
    });
    const runs = RunsDevFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs-dev.json"), "utf8")),
    );
    expect(runs).toHaveLength(1);
    const second = makeDeps(
      undefined,
      withApiFootball({
        dry: true,
        now: () => new Date("2026-10-10T23:45:00.000Z"),
      }),
    );
    await runCollect(second.deps);
    expect(
      second.records.find((r) => r.event === "collect.matchdata.quota"),
    ).toMatchObject({
      cap: 50,
      usedOwn: 25,
      remaining: 25,
      limitedBy: "env-cap",
    });
  });

  it("뉴스 단계가 예상 밖 예외로 끝나도(던짐) 병렬로 시작한 경기 데이터를 취소한다(news-error)", async () => {
    const gate = cancelGate();
    const { deps, afCalls, fdCalls, records } = makeDeps(
      undefined,
      withApiFootball({
        apiFootballSleep: gate.sleep,
        footballDataSleep: gate.sleep,
        // 피드 수집 시작(onFeedsPlanned 뒤)에서 던진다
        feedClock: {
          now: () => {
            throw new Error("clock broken");
          },
          sleep: async () => undefined,
        },
      }),
    );
    deps.logger = gate.logger(records);
    await expect(runCollect(deps)).rejects.toThrow("clock broken");
    expect(
      records.find((r) => r.event === "collect.matchdata.cancel"),
    ).toMatchObject({ reason: "news-error" });
    // 취소 뒤 남은 비동기 작업이 끝날 시간을 준다 — 새 요청은 나가지 않는다
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(afCalls.length).toBeLessThanOrEqual(1);
    expect(fdCalls.length).toBeLessThanOrEqual(1);
  });
});

// ─── 경기 기록 원장 (M1-48b) ──────────────────────────────────────────────

describe("runCollect — 경기 기록 원장(M1-48b, D33)", () => {
  const ledgerFile = () => path.join(dataDir, "matches", "2026-10.json");
  const metaFile = () => path.join(dataDir, "matches", "meta.json");
  const readMeta = () =>
    MatchLedgerMetaSchema.parse(JSON.parse(readFileSync(metaFile(), "utf8")));
  /** 정기 운영 prod 실행(06:30 KST) — mock LLM */
  const regular = (over: Partial<CollectDeps> = {}) =>
    withApiFootball({
      env: "prod",
      ledgerEnabled: true,
      now: () => NOW,
      ...over,
    });
  const TRACKED_SLUGS = [
    "hwang-hee-chan",
    "jens-castrop",
    "jeong-woo-yeong",
    "kim-min-jae",
    "lee-jae-sung",
    "lee-kang-in",
    "seol-young-woo",
  ];
  const writeMeta = (meta: MatchLedgerMeta) => {
    mkdirSync(path.join(dataDir, "matches"), { recursive: true });
    writeFileSync(metaFile(), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  };

  it("첫 정기 실행: 받은 23경기를 원장에 쓰고 since = 받은 가장 이른 날(2026-10-09), 추적 선수 7명 playerSince = since", async () => {
    const { deps, records } = makeDeps(undefined, regular());
    const outcome = await runCollect(deps);
    const file = MatchLedgerFileSchema.parse(
      JSON.parse(readFileSync(ledgerFile(), "utf8")),
    );
    expect(file.matches).toHaveLength(23);
    const m = file.matches.find((x) => x.id === "af-1575180")!;
    expect(m.korean).toEqual([
      {
        player: 2897,
        side: "away",
        status: "bench",
        minutes: 0,
        goals: 0,
        assists: 0,
      },
      {
        player: 197985,
        side: "home",
        status: "start",
        minutes: 62,
        goals: 0,
        assists: 0,
      },
    ]);
    expect(m.home.formation).toBe("3-4-2-1");
    expect(readMeta()).toEqual({
      season: 2026,
      since: "2026-10-09",
      playerSince: Object.fromEntries(
        TRACKED_SLUGS.map((s) => [s, "2026-10-09"]),
      ),
      gaps: [],
    });
    expect(outcome.matchData?.ledger).toMatchObject({
      mode: "write",
      requeued: [],
      applied: { state: "started", errors: [] },
    });
    expect(
      records.find((r) => r.event === "collect.ledger.meta"),
    ).toMatchObject({ created: true, since: "2026-10-09", written: true });
    // 이월 목록 = INT 1경기 + 불완전 항목 16경기(합성 상세 — events·라인업 없음, 처음 받은 경기라 requeries 0)
    const incomplete = file.matches
      .filter(isIncompleteLedgerMatch)
      .map((x) => Number(x.id.slice(3)));
    expect(incomplete).toHaveLength(16);
    expect(outcome.matchData?.ledger?.incomplete).toEqual(
      [...incomplete].sort((a, b) => a - b),
    );
    const pending = AfPendingFileSchema.parse(
      JSON.parse(
        readFileSync(path.join(dataDir, "cache", "af-pending.json"), "utf8"),
      ),
    );
    expect(pending.fixtures.map((f) => f.id).sort((a, b) => a - b)).toEqual(
      [1570410, ...incomplete].sort((a, b) => a - b),
    );
    for (const f of pending.fixtures) {
      if (f.id !== 1570410)
        expect(f).toMatchObject({ status: "FT", requeries: 0 });
    }
    expect(outcome.status).toBe("success");
  });

  it("다음 실행(같은 날 백업): 완전한 7경기는 다시 받지 않고(known), 불완전 16경기만 이월 목록에 있어 다시 받는다 — 같은 내용이면 원장·메타는 그대로", async () => {
    await runCollect(makeDeps(undefined, regular()).deps);
    const ledgerText = readFileSync(ledgerFile(), "utf8");
    const metaText = readFileSync(metaFile(), "utf8");
    const second = makeDeps(
      undefined,
      regular({ now: () => new Date("2026-10-10T21:40:00.000Z") }),
    );
    const outcome = await runCollect(second.deps);
    expect(second.afCalls.slice(0, 2)).toEqual([
      "/fixtures?date=2026-10-10",
      "/fixtures?date=2026-10-09",
    ]);
    expect(second.afCalls).toHaveLength(2 + 16);
    for (const real of [1575180, 1575181, 1557418, 1570403]) {
      expect(second.afCalls).not.toContain(`/fixtures?id=${real}`);
    }
    const af = outcome.matchData!.apiFootball;
    if (af.state !== "done") throw new Error("unreachable");
    expect(af.data.stage.counts.known).toBe(7);
    expect(af.data.ledger.entries).toHaveLength(16);
    expect(readFileSync(ledgerFile(), "utf8")).toBe(ledgerText);
    expect(readFileSync(metaFile(), "utf8")).toBe(metaText);
    // 재조회 횟수를 이어 센다(0 → 1)
    const pending = AfPendingFileSchema.parse(
      JSON.parse(
        readFileSync(path.join(dataDir, "cache", "af-pending.json"), "utf8"),
      ),
    );
    expect(
      pending.fixtures.filter((f) => f.id !== 1570410).map((f) => f.requeries),
    ).toEqual(Array.from({ length: 16 }, () => 1));
  });

  it("불완전 항목(라인업 없음 → 한국 선수 행 unknown)은 다시 받아 완전해지면 덮어쓰고 이월 목록에서 빠진다", async () => {
    const noLineups = (url: string) => {
      if (!url.endsWith("id=1575180")) return afFixtureResponse(url)!;
      const doc = JSON.parse(afFixtureBody(1575180)) as {
        response: Array<Record<string, unknown>>;
      };
      doc.response[0] = { ...doc.response[0], lineups: [], players: [] };
      return new Response(JSON.stringify(doc), { status: 200 });
    };
    await runCollect(makeDeps(undefined, regular(), noLineups).deps);
    const before = MatchLedgerFileSchema.parse(
      JSON.parse(readFileSync(ledgerFile(), "utf8")),
    ).matches.find((m) => m.id === "af-1575180")!;
    expect(before.home.formation).toBeNull();
    expect(before.korean.map((r) => r.status)).toEqual(["unknown", "unknown"]);
    expect(isIncompleteLedgerMatch(before)).toBe(true);

    const second = makeDeps(
      undefined,
      regular({ now: () => new Date("2026-10-10T21:40:00.000Z") }),
    );
    await runCollect(second.deps);
    expect(second.afCalls).toContain("/fixtures?id=1575180");
    const after = MatchLedgerFileSchema.parse(
      JSON.parse(readFileSync(ledgerFile(), "utf8")),
    ).matches.find((m) => m.id === "af-1575180")!;
    expect(after.home.formation).toBe("3-4-2-1");
    expect(after.korean.map((r) => r.status)).toEqual(["bench", "start"]);
    const pending = AfPendingFileSchema.parse(
      JSON.parse(
        readFileSync(path.join(dataDir, "cache", "af-pending.json"), "utf8"),
      ),
    );
    expect(pending.fixtures.map((f) => f.id)).not.toContain(1575180);
  });

  it("COLLECT_ENABLED 꺼짐(정기 운영 전 수동 prod 실행)·dev·dry는 원장을 쓰지 않는다 — 항목·한국 선수 행은 메모리·로그로", async () => {
    const off = makeDeps(undefined, regular({ ledgerEnabled: false }));
    const offOutcome = await runCollect(off.deps);
    expect(existsSync(path.join(dataDir, "matches"))).toBe(false);
    expect(
      off.records.find((r) => r.event === "collect.ledger.skip"),
    ).toMatchObject({ reason: "ledger-disabled", entries: 23, koreanRows: 5 });
    expect(offOutcome.matchData?.ledger?.korean).toContainEqual({
      matchId: 1570403,
      player: "lee-kang-in",
      status: "sub",
      minutes: 33,
      goals: 0,
      assists: 0,
    });
    expect(
      off.records.filter((r) => r.event === "collect.ledger.korean"),
    ).toHaveLength(5);
    expect(
      off.records.find((r) => r.event === "collect.ledger.player-candidate"),
    ).toMatchObject({
      player: "kim-ji-soo",
      match: 1557418,
      lineup: true,
      candidates: [],
    });

    rmSync(path.join(dataDir, "runs.json"), { force: true });
    const dev = makeDeps(undefined, withApiFootball({ ledgerEnabled: true }));
    await runCollect(dev.deps);
    expect(
      dev.records.find((r) => r.event === "collect.ledger.skip"),
    ).toMatchObject({ reason: "dev" });

    const dry = makeDeps(undefined, regular({ dry: true }));
    await runCollect(dry.deps);
    expect(
      dry.records.find((r) => r.event === "collect.ledger.skip"),
    ).toMatchObject({ reason: "dry" });
    expect(existsSync(path.join(dataDir, "matches"))).toBe(false);
  });

  it("원장이 있는데 API-Football 단계가 돌지 않으면(키 없음) 그날 조회 날짜를 빠진 날(skipped)로 — 나중 실행이 받으면 지운다", async () => {
    const meta: MatchLedgerMeta = {
      season: 2026,
      since: "2026-10-01",
      playerSince: Object.fromEntries(
        TRACKED_SLUGS.map((s) => [s, "2026-10-01"]),
      ),
      gaps: [],
    };
    writeMeta(meta);
    const skipped = makeDeps(undefined, regular({ apiFootballApiKey: "" }));
    const outcome = await runCollect(skipped.deps);
    expect(outcome.matchData?.apiFootball).toMatchObject({
      state: "skipped",
      reason: "no-api-key",
    });
    // 오늘(UTC 10-10) 조회만 첫 기회 — 어제(10-09)는 마지막 기회라 새 공백을 만들지 않는다
    expect(readMeta().gaps).toEqual([
      { date: "2026-10-10", reason: "skipped", cause: "no-api-key" },
    ]);
    // 다음 실행이 그 날짜를 받으면 치유
    const next = makeDeps(undefined, regular());
    await runCollect(next.deps);
    expect(readMeta().gaps).toEqual([]);
    expect(readMeta().since).toBe("2026-10-01"); // since는 바꾸지 않는다
  });

  it("오늘 날짜 조회 실패(5xx 재시도까지) → 빠진 날 date-query(http), partial", async () => {
    writeMeta({ season: 2026, since: "2026-10-01", playerSince: {}, gaps: [] });
    const { deps } = makeDeps(undefined, regular(), (url) =>
      url.endsWith("date=2026-10-10")
        ? new Response("busy", { status: 503 })
        : afFixtureResponse(url)!,
    );
    const outcome = await runCollect(deps);
    expect(readMeta().gaps).toEqual([
      { date: "2026-10-10", reason: "date-query", cause: "http" },
    ]);
    // 이번 실행이 받은 날(10-09)부터 추적 선수 시작
    expect(readMeta().playerSince["kim-min-jae"]).toBe("2026-10-09");
    expect(outcome.status).toBe("partial");
  });

  it("어제 날짜 조회 실패(마지막 기회)는 새 빠진 날을 만들지 않는다 — 실행 상태는 partial", async () => {
    writeMeta({ season: 2026, since: "2026-10-01", playerSince: {}, gaps: [] });
    const { deps } = makeDeps(undefined, regular(), (url) =>
      url.endsWith("date=2026-10-09")
        ? new Response("busy", { status: 503 })
        : afFixtureResponse(url)!,
    );
    const outcome = await runCollect(deps);
    expect(readMeta().gaps).toEqual([]);
    expect(outcome.status).toBe("partial");
  });

  it("원장을 쓰지 못하면(달·메타 읽기 실패) 받은 경기를 이월 목록에 다시 넣는다 — partial", async () => {
    // data/matches 자리에 파일 — 폴더로 쓸 수 없다
    writeFileSync(path.join(dataDir, "matches"), "not a dir", "utf8");
    const { deps, records } = makeDeps(undefined, regular());
    const outcome = await runCollect(deps);
    expect(
      records.find((r) => r.event === "collect.ledger.read-fail"),
    ).toBeDefined();
    const ledger = outcome.matchData!.ledger!;
    expect(ledger.applied?.state).toBe("meta-unreadable");
    expect(ledger.requeued).toHaveLength(23);
    const pending = AfPendingFileSchema.parse(
      JSON.parse(
        readFileSync(path.join(dataDir, "cache", "af-pending.json"), "utf8"),
      ),
    );
    expect(pending.fixtures).toHaveLength(24); // 23 + INT
    expect(pending.fixtures.find((f) => f.id === 1575180)).toMatchObject({
      status: "FT",
      requeries: 1,
    });
    expect(outcome.status).toBe("partial");
  });

  it("브리핑 입력 goals — 브리핑 몫과 연결된 경기 중 득점 목록이 완전한 경기만(나머지 null)", async () => {
    const { deps, printed, records } = makeDeps(
      undefined,
      withApiFootball({ dry: true }),
    );
    await runCollect(deps);
    const block = printed.find((p) => p.startsWith("── [dry] 브리핑 입력"))!;
    const input = JSON.parse(block.slice(block.indexOf("\n") + 1)) as {
      matches: Array<{ id: string; goals: unknown[] | null }>;
    };
    const augsburg = input.matches.find((m) => m.id === "m565819")!;
    expect(augsburg.goals).toEqual([
      { min: "1", team: "Augsburg", player: "Robin Fellhauer" },
      {
        min: "55",
        team: "Bayern",
        player: "Ismael Saibari",
        assist: "Harry Kane",
      },
      expect.objectContaining({ min: "64", team: "Augsburg" }),
      expect.objectContaining({ min: "80" }),
    ]);
    const done = records.find((r) => r.event === "summarize.input.done")!;
    expect(done).toMatchObject({
      afBriefDetails: 23,
      linkedByTeamIds: 23,
      linkedByEvidence: 0,
    });
    // 득점자·도움은 사전 대표 표기로(M1-21 — 이 날 득점자는 사전에 없거나 이미 대표 표기라 0)
    expect(done.canonicalNames).toBe(0);
    // 합성 상세(fixture 파일 없음 — events 없음)는 득점 불완전 → null. 0-0 경기는 빈 배열
    const filled = input.matches.filter((m) => m.goals !== null).length;
    expect(done.goalsFilled).toBe(filled);
    expect(Number(done.goalsFilled) + Number(done.goalsIncomplete)).toBe(23);
  });

  it("같은 아침 두 번째 실행 — 원장에 있어 다시 받지 않은 경기의 득점자는 원장 항목으로 잇는다(M1-19, M1-48 이월)", async () => {
    const first = makeDeps(undefined, regular());
    await runCollect(first.deps);
    const firstDone = first.records.find(
      (r) => r.event === "summarize.input.done",
    )!;
    expect(firstDone).toMatchObject({ goalsFilled: 7, linkedFromLedger: 0 });

    // 백업 실행(06:40 KST) — 완전한 7경기는 원장에 있어 다시 받지 않는다(known). dry로 입력을 출력해 본다
    const second = makeDeps(
      undefined,
      regular({ now: () => new Date("2026-10-10T21:40:00.000Z"), dry: true }),
    );
    await runCollect(second.deps);
    expect(second.afCalls).not.toContain("/fixtures?id=1575180");
    const done = second.records.find(
      (r) => r.event === "summarize.input.done",
    )!;
    expect(done).toMatchObject({
      afBriefDetails: 16, // 이번 실행이 받은 것은 불완전 16경기뿐
      linkedFromLedger: 7,
      goalsFilled: 7,
    });
    const block = second.printed.find((p) =>
      p.startsWith("── [dry] 브리핑 입력"),
    )!;
    const input = JSON.parse(block.slice(block.indexOf("\n") + 1)) as {
      matches: Array<{ id: string; goals: unknown[] | null }>;
    };
    expect(input.matches.find((m) => m.id === "m565819")!.goals).toEqual([
      { min: "1", team: "Augsburg", player: "Robin Fellhauer" },
      {
        min: "55",
        team: "Bayern",
        player: "Ismael Saibari",
        assist: "Harry Kane",
      },
      expect.objectContaining({ min: "64", team: "Augsburg" }),
      expect.objectContaining({ min: "80" }),
    ]);
  });

  it("API-Football 단계가 돌지 않아도(키 없음) 원장의 완전 항목으로 득점자를 넣는다 — 템플릿 줄에도 쓰인다", async () => {
    await runCollect(makeDeps(undefined, regular()).deps);
    const { deps, records } = makeDeps(undefined, {
      env: "prod",
      ledgerEnabled: true,
      now: () => new Date("2026-10-10T21:40:00.000Z"),
    });
    const outcome = await runCollect(deps);
    expect(outcome.matchData?.apiFootball).toMatchObject({
      state: "skipped",
      reason: "no-api-key",
    });
    expect(
      records.find((r) => r.event === "summarize.input.done"),
    ).toMatchObject({
      afBriefDetails: null,
      linkedFromLedger: 23, // 원장 23경기 모두 대응표로 연결 — 득점 목록이 완전한 7경기만 goals 배열
      linkedByTeamIds: 23,
      linkedByEvidence: 0,
      goalsFilled: 7,
      goalsIncomplete: 16,
    });
    const brief = JSON.parse(
      readFileSync(path.join(dataDir, "briefs", "2026-10-11.json"), "utf8"),
    ) as { mode: string; lines: Array<{ text: string; refs: string[] }> };
    expect(brief.mode).toBe("template");
    // 득점자 서술(결승골·동점골·해트트릭)이 들어간 줄이 있다 — 원장 항목에서 온 득점 목록
    expect(brief.lines.some((l) => /결승골|동점골|해트트릭/.test(l.text))).toBe(
      true,
    );
  });

  it("API-Football 단계가 돌지 않은 실행은 D37 자동 연결을 끈다 — 날짜 조회 목록이 없어 '점수 모르는 후보' 차단을 확인할 수 없다(대응표만)", async () => {
    await runCollect(makeDeps(undefined, regular()).deps);
    // 대응표에서 Augsburg를 뺀 설정 — Augsburg 2-2 Bayern(m565819 ↔ af 1575180)은 강한 증거로만 이을 수 있다
    const root = mkdtempSync(path.join(os.tmpdir(), "euro-digest-noaug-"));
    try {
      cpSync(path.join(ROOT, "configs"), path.join(root, "configs"), {
        recursive: true,
      });
      cpSync(
        path.join(ROOT, "fixtures/llm/brief-inputs"),
        path.join(root, "fixtures/llm/brief-inputs"),
        { recursive: true },
      );
      const teamIdsPath = path.join(root, "configs", "team-ids.json");
      const teamIds = JSON.parse(readFileSync(teamIdsPath, "utf8")) as Record<
        string,
        unknown
      >;
      delete teamIds["augsburg"];
      writeFileSync(teamIdsPath, JSON.stringify(teamIds), "utf8");
      const inputOf = (printed: string[]) => {
        const block = printed.find((p) =>
          p.startsWith("── [dry] 브리핑 입력"),
        )!;
        return JSON.parse(block.slice(block.indexOf("\n") + 1)) as {
          matches: Array<{ id: string; goals: unknown[] | null }>;
        };
      };

      // 키 없음(snapshot 없음) — 원장 항목만, 자동 연결 끔
      const ledgerOnly = makeDeps(undefined, {
        rootDir: root,
        env: "prod",
        dry: true,
        now: () => new Date("2026-10-10T21:40:00.000Z"),
      });
      await runCollect(ledgerOnly.deps);
      expect(
        ledgerOnly.records.find((r) => r.event === "summarize.input.done"),
      ).toMatchObject({
        afBriefDetails: null,
        linkedByTeamIds: 22,
        linkedByEvidence: 0,
        goalsFilled: 6,
      });
      expect(
        inputOf(ledgerOnly.printed).matches.find((m) => m.id === "m565819")!
          .goals,
      ).toBeNull();

      // API-Football 단계가 돌면(날짜 조회 목록 있음) 같은 경기를 강한 증거로 잇는다
      const withAf = makeDeps(
        undefined,
        withApiFootball({ rootDir: root, dry: true }),
      );
      await runCollect(withAf.deps);
      expect(
        withAf.records.find((r) => r.event === "summarize.input.done"),
      ).toMatchObject({ linkedByEvidence: 1 });
      expect(
        inputOf(withAf.printed).matches.find((m) => m.id === "m565819")!.goals,
      ).not.toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
