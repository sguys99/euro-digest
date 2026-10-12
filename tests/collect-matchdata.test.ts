/**
 * M1-44·M1-48 경기 데이터 단계 — runCollect 통합(scripts/lib/collect-run.ts). 네트워크·실호출 없음.
 *
 * 필수 항목: 프로바이더별 병렬·실패 격리, 순위 호출 대상 선별(종료 경기가 있는 대회만),
 * football-data 실패 = 그날 브리핑 생략·뉴스 발행(D24), 순위 일부 실패 = 브리핑 진행·partial, 단계 시간 예산(150초),
 * 유럽 서머타임 종료 직후 겨울 슬롯(07:10 KST)의 입력 창, 실행 기록 apiCalls.footballData·apiFootball,
 * API-Football(M1-48): 브리핑은 컷오프까지의 몫만 기다리고 나머지는 계속, 일일 카운터(runs 합) 상한 → 건너뜀·partial,
 * 이월 파일 쓰기(dry 제외), errors.plan → 이슈 사건 파일(source-broken), 짝짓기(대응표 확인 쌍만 연결).
 */
import {
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
  RunsDevFileSchema,
  RunsFileSchema,
  SourcesFileSchema,
} from "@/lib/schema";

import {
  runCollect,
  runStatus,
  SLICE_DEFAULT_LIMIT,
  type BriefOutcome,
  type CollectDeps,
} from "../scripts/lib/collect-run";
import { createLlmClient, type LlmClient } from "../scripts/lib/llm";
import { SourceBrokenPayloadSchema } from "../scripts/lib/github-issues";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { isolateProvider } from "../scripts/lib/match-data";
import {
  FOOTBALL_DATA_BASE_URL,
  FOOTBALL_DATA_STAGE_BUDGET_MS,
} from "../scripts/lib/providers/football-data";
import { feedUserAgent, type FetchLike } from "../scripts/lib/rss";

import {
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
    limit: SLICE_DEFAULT_LIMIT,
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
    // 이월 파일 — 중단(INT) 경기 1건
    const pending = AfPendingFileSchema.parse(
      JSON.parse(
        readFileSync(path.join(dataDir, "cache", "af-pending.json"), "utf8"),
      ),
    );
    expect(pending.fixtures.map((f) => [f.id, f.status, f.comp])).toEqual([
      [1570410, "INT", "LALIGA"],
    ]);
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
      pendingWritten: true,
      stoppedBy: null,
    });
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
    expect(summary).toContain("짝짓기: 연결 23(대응표 확인)");
    expect(existsSync(path.join(dataDir, "cache", "af-pending.json"))).toBe(
      false,
    );
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
    const { deps, records } = makeDeps(undefined, withApiFootball());
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
