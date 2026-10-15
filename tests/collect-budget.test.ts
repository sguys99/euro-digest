/**
 * M1-22 비용 가드 — runCollect 통합(scripts/lib/collect-run.ts 브리핑 단계·실행 시작 알림). 네트워크·실호출 없음.
 *
 * 필수 항목: runs 파일 손상 → LLM 없이(skipped·budget·runs_unreadable)·partial·뉴스 발행·prod 비용 기록 유지,
 * KST 자정을 넘긴 실행은 시작한 날의 예산으로 판정(실행 기록 귀속과 같은 칸), 실행 시작 dev 50% 경고(첫 출력),
 * 실행 전 최악값 예상 출력(요청은 1건만 보낸다), mock은 판정하지 않음.
 * 단위 판정(경계·합산·최악값)은 tests/budget-guard.test.ts, 기존 슬라이스 경로(일 예산 0 → 호출 안 함)는 tests/collect-slice.test.ts.
 */
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RunsDevFileSchema,
  RunsFileSchema,
  SourcesFileSchema,
  type RunEnv,
  type RunLog,
} from "@/lib/schema";

import {
  runCollect,
  SLICE_DEFAULT_LIMIT,
  type CollectDeps,
} from "../scripts/lib/collect-run";
import {
  createLlmClient,
  type LlmTransport,
  type MessageParams,
} from "../scripts/lib/llm";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { FOOTBALL_DATA_BASE_URL } from "../scripts/lib/providers/football-data";
import { feedUserAgent, type FetchLike } from "../scripts/lib/rss";

import { fdFixtureResponse } from "./support/football-data-fake";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const BBC_XML = read("fixtures/rss/bbc-sport-football.xml");
const BBC = SourcesFileSchema.parse(
  JSON.parse(read("configs/sources.json")),
).find((s) => s.id === "bbc-sport-football")!;

/** 06:30 KST 2026-10-11 = 2026-10-10T21:30Z — 발행일 2026-10-11, 입력 창 = UTC 하루 2026-10-10 */
const NOW = new Date("2026-10-10T21:30:00.000Z");

const BRIEF_TEXT_OK = JSON.stringify({
  l: [{ t: "Chelsea가 Bournemouth를 5-1로 꺾었다.", r: ["m560595"] }],
});

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-collect-budget-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function makeRun(
  env: RunEnv,
  runId: string,
  startedAt: string,
  costUsd: number,
): RunLog {
  return {
    runId,
    env,
    job: "collect",
    startedAt,
    finishedAt: startedAt,
    collected: 0,
    clusters: 0,
    summarized: 0,
    downgraded: 0,
    tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    costUsd,
    apiCalls: { footballData: 0, apiFootball: 0 },
    sources: [],
    status: "success",
  };
}

function writeData(name: string, text: string) {
  writeFileSync(path.join(dataDir, name), text, "utf8");
}

/** live LLM(가짜 transport) + BBC 피드 + football-data fixture. API-Football 키 없음(건너뜀) */
function liveDeps(over: Partial<CollectDeps> = {}) {
  const records: LogRecord[] = [];
  const printed: string[] = [];
  const params: MessageParams[] = [];
  let llmCreated = 0;
  const unused = () => {
    throw new Error("배치는 쓰지 않는다");
  };
  const transport: LlmTransport = {
    async createMessage(p) {
      params.push(p);
      return {
        content: [{ type: "text", text: BRIEF_TEXT_OK }],
        stop_reason: "end_turn",
        usage: {
          input_tokens: 6590,
          output_tokens: 3231,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      };
    },
    createBatch: unused,
    retrieveBatch: unused,
    cancelBatch: unused,
    batchResults: unused,
  };
  const fetch: FetchLike = async (url) => {
    if (url === BBC.url) return new Response(BBC_XML, { status: 200 });
    if (url.startsWith(FOOTBALL_DATA_BASE_URL)) return fdFixtureResponse(url)!;
    throw new Error(`테스트에서 예상하지 못한 URL: ${url}`);
  };
  const deps: CollectDeps = {
    rootDir: ROOT,
    dataDir,
    env: "dev",
    llmMode: "live",
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
      llmCreated += 1;
      return createLlmClient({
        mode: "live",
        model: "claude-haiku-5-5",
        transport,
        logger: () => undefined,
      });
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
  return { deps, records, printed, params, llmCreated: () => llmCreated };
}

const event = (records: LogRecord[], name: string) =>
  records.filter((r) => r.event === name);

describe("runCollect — 비용 가드(M1-22)", () => {
  it("prod + runs-dev.json 손상: LLM 없이(runs_unreadable)·partial·뉴스 발행, runs.json 기록은 그대로", async () => {
    writeData("runs-dev.json", "{ not json");
    const { deps, records, printed, params, llmCreated } = liveDeps({
      env: "prod",
    });
    const outcome = await runCollect(deps);

    expect(params).toHaveLength(0);
    expect(llmCreated()).toBe(0);
    expect(outcome.brief).toEqual({
      state: "skipped",
      reason: "budget",
      budget: {
        verdict: "runs_unreadable",
        estimatedUsd: expect.any(Number),
        message: expect.stringContaining("runs-dev.json: JSON 파싱 실패"),
      },
      inputMatches: expect.any(Number),
    });
    expect(outcome.brief.inputMatches).toBeGreaterThan(0);
    expect(outcome.status).toBe("partial");
    expect(outcome.exitCode).toBe(0);
    expect(outcome.news.ok).toBe(true);
    expect(readdirSync(path.join(dataDir, "news"))).toEqual([
      "2026-10-11.json",
    ]);

    const runs = RunsFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs.json"), "utf8")),
    );
    expect(runs).toEqual([
      expect.objectContaining({ costUsd: 0, status: "partial" }),
    ]);
    // 손상 파일은 건드리지 않는다
    expect(readFileSync(path.join(dataDir, "runs-dev.json"), "utf8")).toBe(
      "{ not json",
    );

    expect(event(records, "cost.month.unavailable")).toEqual([
      expect.objectContaining({ level: "warn", reason: "runs-unreadable" }),
    ]);
    expect(event(records, "summarize.brief.budget")).toEqual([
      expect.objectContaining({ verdict: "runs_unreadable", allowed: false }),
    ]);
    expect(event(records, "summarize.brief.skip")).toEqual([
      expect.objectContaining({ reason: "budget", verdict: "runs_unreadable" }),
    ]);
    expect(event(records, "collect.done")[0]).toMatchObject({
      brief: "skipped:budget",
      llmCalls: 0,
    });
    expect(printed.some((t) => t.startsWith("::warning title=비용 가드"))).toBe(
      true,
    );
  });

  it("KST 자정을 넘긴 실행은 시작한 날의 예산으로 판정한다(실행 기록도 그날로 귀속)", async () => {
    // 10/11 23:59:30 KST 시작 → 첫 시각 뒤로는 10/12 00:00:30 KST
    const start = new Date("2026-10-11T14:59:30.000Z");
    const later = new Date("2026-10-11T15:00:30.000Z");
    let calls = 0;
    const clock = () => (calls++ === 0 ? start : later);
    // 10/11 KST dev 사용 0.096 — 최악값(약 $0.005)을 더하면 일 예산 $0.10을 넘는다. 10/12에는 사용이 없다.
    writeData(
      "runs-dev.json",
      `${JSON.stringify([makeRun("dev", "d-1011", "2026-10-11T03:00:00.000Z", 0.096)])}\n`,
    );
    const { deps, params, records } = liveDeps({ now: clock });
    const outcome = await runCollect(deps);

    expect(outcome.publishDate).toBe("2026-10-11");
    expect(outcome.brief).toMatchObject({
      state: "skipped",
      reason: "budget",
      budget: { verdict: "daily_exceeded" },
    });
    expect(params).toHaveLength(0);
    expect(event(records, "summarize.brief.budget")[0]).toMatchObject({
      at: "2026-10-11T14:59:30.000Z",
      day: "2026-10-11",
      dailyScope: "prod+dev",
      dailyUsed: 0.096,
    });
    // 예산 초과 예상은 의도된 강등 — success(뉴스 발행)
    expect(outcome.status).toBe("success");
    const devRuns = RunsDevFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs-dev.json"), "utf8")),
    );
    expect(devRuns.map((r) => r.startedAt)).toEqual([
      "2026-10-11T03:00:00.000Z",
      "2026-10-11T14:59:30.000Z",
    ]);
  });

  it("반대로 자정 뒤(10/12 KST) 사용분은 10/11에 시작한 실행의 판정에 들어가지 않는다 — LLM을 부른다", async () => {
    const start = new Date("2026-10-11T14:59:30.000Z"); // 10/11 23:59:30 KST
    const later = new Date("2026-10-11T15:00:30.000Z"); // 10/12 00:00:30 KST
    let calls = 0;
    const clock = () => (calls++ === 0 ? start : later);
    // 10/12 00:00:10 KST dev 사용 0.096 — 현재 시각(10/12)으로 판정했다면 막혔을 금액
    writeData(
      "runs-dev.json",
      `${JSON.stringify([makeRun("dev", "d-1012", "2026-10-11T15:00:10.000Z", 0.096)])}\n`,
    );
    const { deps, params, records } = liveDeps({ now: clock });
    const outcome = await runCollect(deps);
    expect(event(records, "summarize.brief.budget")[0]).toMatchObject({
      day: "2026-10-11",
      dailyUsed: 0,
      allowed: true,
    });
    expect(params).toHaveLength(1);
    expect(outcome.brief.state).toBe("done");
  });

  it("dev 사용이 월 예산 50%를 넘으면 실행 시작에 경고(첫 출력), 브리핑은 최악값 예상 출력 후 1요청만 보낸다", async () => {
    writeData(
      "runs-dev.json",
      `${JSON.stringify([makeRun("dev", "d-1005", "2026-10-05T05:00:00.000Z", 1.6)])}\n`,
    );
    const { deps, printed, params, records } = liveDeps();
    const outcome = await runCollect(deps);

    expect(printed[0]).toContain("50%를 넘었다");
    expect(printed[0]).toContain("dev $1.60");
    expect(event(records, "cost.month.dev-alert")).toHaveLength(1);
    const estimate = printed.find((t) => t.includes("요청 2건(최악값"));
    expect(estimate).toBeDefined();
    expect(estimate).toContain("판정: 실행 가능");
    expect(estimate).toContain("경고: 이번 달 dev 사용이 월 예산의 53.3%");
    expect(params).toHaveLength(1); // 최악값은 판정용 — 실제 요청은 1건
    expect(outcome.brief.state).toBe("done");
    // 예상(최악값)이 실측보다 크다
    const fields = event(records, "summarize.brief.budget")[0]!;
    expect(fields.estimatedUsd as number).toBeGreaterThan(outcome.run!.costUsd);
  });

  it("mock 실행은 비용 0이라 판정하지 않는다(실행 시작 누적 로그만)", async () => {
    writeData("runs-dev.json", "{ not json");
    const { deps, records } = liveDeps({
      llmMode: "mock",
      createLlm: () =>
        createLlmClient({ mode: "mock", logger: () => undefined }),
    });
    const outcome = await runCollect(deps);
    expect(event(records, "summarize.brief.budget")).toEqual([]);
    expect(
      outcome.brief.state === "skipped" && outcome.brief.reason === "budget",
    ).toBe(false);
    expect(event(records, "cost.month.unavailable")).toHaveLength(1);
  });
});
