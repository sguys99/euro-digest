/**
 * M1-44 경기 데이터 단계 — runCollect 통합(scripts/lib/collect-run.ts). 네트워크·실호출 없음.
 *
 * 필수 항목: 프로바이더별 병렬·실패 격리(API-Football 자리는 no-adapter), 순위 호출 대상 선별(종료 경기가 있는 대회만),
 * football-data 실패 = 그날 브리핑 생략·뉴스 발행(D24), 순위 일부 실패 = 브리핑 진행·partial, 단계 시간 예산(150초),
 * 유럽 서머타임 종료 직후 겨울 슬롯(07:10 KST)의 입력 창, 실행 기록 apiCalls.footballData.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SourcesFileSchema } from "@/lib/schema";

import {
  runCollect,
  runStatus,
  SLICE_DEFAULT_LIMIT,
  type BriefOutcome,
  type CollectDeps,
} from "../scripts/lib/collect-run";
import { createLlmClient, type LlmClient } from "../scripts/lib/llm";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { isolateProvider } from "../scripts/lib/match-data";
import {
  FOOTBALL_DATA_BASE_URL,
  FOOTBALL_DATA_STAGE_BUDGET_MS,
} from "../scripts/lib/providers/football-data";
import { feedUserAgent, type FetchLike } from "../scripts/lib/rss";

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
) {
  const records: LogRecord[] = [];
  const printed: string[] = [];
  const fdCalls: string[] = [];
  let llmCalls = 0;
  const fetch: FetchLike = async (url) => {
    if (url === BBC.url) return new Response(BBC_XML, { status: 200 });
    if (url.startsWith(FOOTBALL_DATA_BASE_URL)) {
      fdCalls.push(fdPath(url)!);
      return fd(url);
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
  return { deps, records, printed, fdCalls, llmCalls: () => llmCalls };
}

describe("runCollect — 경기 데이터 단계(M1-44)", () => {
  it("football-data 경기 1 + 순위 5요청, API-Football 자리는 no-adapter, 브리핑 진행·success", async () => {
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
      reason: "no-adapter",
    });
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
    expect(summary).toContain("api-football: 건너뜀(no-adapter — M1-48)");
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
