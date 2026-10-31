/**
 * M2-09 축구 데이터 단계 — collect 통합(scripts/lib/football-stages.ts · collect-run.ts). 네트워크·실호출 없음(fixtures/football).
 *
 * 필수 항목: 단계 계획(스위치·뉴스 실패·dev·dry·09:00 KST 상한 — 서머타임 경계 전후), 라인업 백필 허용량(min(남은 몫, 5)·멈춘 단계),
 * 백필 캐시(추가·30일 정리·변화 없음), 미등록 이름 대회별 상위 n명, 단계 마감(예산·상한), 순서(대회 단계 첫 요청 ≥ 브리핑 쪽
 * football-data 마지막 응답 + 6.5초), 실패 격리(대회 조각 실패 → 전일 값 유지 · 팀 단계 실패 → 뉴스·브리핑 발행 계속 · exit 0),
 * 호출 수 합산(runs.json apiCalls.footballData·apiFootball), 커밋 경로(data/competitions·data/teams·data/cache/lineup-backfill.json),
 * 백필 계획(exclude·일일 상한 maxCalls·notBefore).
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CompetitionFileSchema,
  LineupBackfillFileSchema,
  RunsDevFileSchema,
  RunsFileSchema,
  SourcesFileSchema,
  UnknownNamesFileSchema,
  type LineupBackfillFile,
} from "@/lib/schema";

import { runCollect, type CollectDeps } from "../scripts/lib/collect-run";
import {
  COMPETITIONS_STAGE_BUDGET_MS,
  FOOTBALL_STAGES_GRACE_MS,
  LINEUP_BACKFILL_CACHE_DAYS,
  LINEUP_BACKFILL_PER_RUN,
  SCORER_NAMES_PER_COMP,
  footballStagesCapAt,
  lineupBackfillAllowance,
  nextClientNotBefore,
  planFootballStages,
  readLineupBackfillCache,
  resolveFootballStagesEnabled,
  runTeamsCollectStage,
  scorerNameObservations,
  stageDeadline,
  updateLineupBackfillCache,
} from "../scripts/lib/football-stages";
import { createLlmClient } from "../scripts/lib/llm";
import { apiFootballCallAllowance } from "../scripts/lib/api-football-plan";
import { recordBackfillApiCalls } from "../scripts/lib/team-files-io";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import {
  FOOTBALL_DATA_BASE_URL,
  FOOTBALL_DATA_MIN_INTERVAL_MS,
} from "../scripts/lib/providers/football-data";
import { feedUserAgent, type FetchLike } from "../scripts/lib/rss";
import { SourceBrokenPayloadSchema } from "../scripts/lib/github-issues";

import { afFixtureResponse, afPath } from "./support/api-football-fake";
import {
  fdFixtureResponse,
  fdPath,
  readFdFixture,
} from "./support/football-data-fake";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const SOURCES = SourcesFileSchema.parse(
  JSON.parse(read("configs/sources.json")),
);
const BBC = SOURCES.find((s) => s.id === "bbc-sport-football")!;
const BBC_XML = read("fixtures/rss/bbc-sport-football.xml");

/** 06:30 KST 2026-10-11(여름) — 브리핑 마감 06:50 KST, 09:00 KST 전 */
const NOW = new Date("2026-10-10T21:30:00.000Z");

let dataDir: string;
let healthFile: string;
beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-football-"));
  healthFile = path.join(
    dataDir,
    "..",
    `${path.basename(dataDir)}-health.json`,
  );
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(healthFile, { force: true });
});

// ─── 순수 함수 ───────────────────────────────────────────────────────────

describe("planFootballStages — 언제 도나", () => {
  const prod = {
    enabled: true,
    newsOk: true,
    hasMatchStage: true,
    env: "prod" as const,
    dry: false,
    startedAt: "2026-10-30T22:10:00.000Z", // 07:10 KST(겨울 정시)
    hasFootballDataKey: true,
  };

  it("prod·비dry·09:00 KST 전 = 대회 단계 + 팀 파일 쓰기", () => {
    expect(planFootballStages(prod)).toEqual({
      competitions: { run: true },
      teams: { run: true, mode: "write" },
    });
  });

  it("스위치 끔·뉴스 실패면 둘 다 건너뜀", () => {
    expect(planFootballStages({ ...prod, enabled: false })).toEqual({
      competitions: { run: false, reason: "disabled" },
      teams: { run: false, reason: "disabled" },
    });
    expect(planFootballStages({ ...prod, newsOk: false })).toEqual({
      competitions: { run: false, reason: "news-failed" },
      teams: { run: false, reason: "news-failed" },
    });
  });

  it("뉴스는 성공했지만 경기 데이터 단계가 없으면 no-match-stage(news-failed로 찍지 않는다)", () => {
    expect(planFootballStages({ ...prod, hasMatchStage: false })).toEqual({
      competitions: { run: false, reason: "no-match-stage" },
      teams: { run: false, reason: "no-match-stage" },
    });
    // 뉴스 실패가 먼저 — 둘 다 아니면 news-failed
    expect(
      planFootballStages({ ...prod, newsOk: false, hasMatchStage: false }),
    ).toEqual({
      competitions: { run: false, reason: "news-failed" },
      teams: { run: false, reason: "news-failed" },
    });
  });

  it("dev·dry는 football-data를 부르지 않고 팀 파일은 계산만(preview)", () => {
    expect(planFootballStages({ ...prod, env: "dev" })).toEqual({
      competitions: { run: false, reason: "dev" },
      teams: { run: true, mode: "preview" },
    });
    expect(planFootballStages({ ...prod, dry: true })).toEqual({
      competitions: { run: false, reason: "dry" },
      teams: { run: true, mode: "preview" },
    });
  });

  it("키가 없으면 대회 단계만 건너뛰고 팀 파일은 쓴다", () => {
    expect(planFootballStages({ ...prod, hasFootballDataKey: false })).toEqual({
      competitions: { run: false, reason: "no-api-key" },
      teams: { run: true, mode: "write" },
    });
  });

  it.each([
    // 서머타임 종료일(2026-10-25 일) 전후 — KST 판정이라 계절과 무관하게 09:00 KST가 경계
    ["2026-10-24T23:59:59.000Z", true], // 10-25 08:59:59 KST
    ["2026-10-25T00:00:00.000Z", false], // 10-25 09:00 KST
    ["2026-10-25T22:10:00.000Z", true], // 10-26 07:10 KST(겨울 첫 정시)
    // 서머타임 시작일(2027-03-28 일) 전후
    ["2027-03-27T21:30:00.000Z", true], // 03-28 06:30 KST(여름 첫 정시)
    ["2027-03-28T03:00:00.000Z", false], // 03-28 12:00 KST(수동 재실행)
    ["2026-10-30T15:00:00.000Z", true], // 10-31 00:00 KST
  ])("%s → 대회 단계 %s (09:00 KST 상한)", (startedAt, run) => {
    expect(planFootballStages({ ...prod, startedAt }).competitions.run).toBe(
      run,
    );
  });
});

describe("lineupBackfillAllowance — min(이번 실행 허용량 − 사용, 5)", () => {
  const afDone = (
    remaining: number,
    calls: number,
    stoppedBy: "budget" | null = null,
  ) => ({
    provider: "api-football" as const,
    state: "done" as const,
    data: {
      allowance: {
        cap: 60,
        usedOwn: 60 - remaining,
        usedTotal: 60 - remaining,
        perRunCap: null,
        remaining,
        runsUnreadable: false,
        limitedBy: "env-cap" as const,
      },
      calls,
      stage: { stoppedBy, degraded: null },
    },
    elapsedMs: 1,
  });
  const base = {
    env: "prod" as const,
    dry: false,
    ledgerEnabled: true,
    hasApiKey: true,
  };

  it("남은 몫이 넉넉하면 5, 모자라면 남은 만큼, 0이면 daily-cap", () => {
    expect(
      lineupBackfillAllowance({ ...base, apiFootball: afDone(60, 22) }),
    ).toEqual({
      count: LINEUP_BACKFILL_PER_RUN,
      reason: null,
    });
    expect(
      lineupBackfillAllowance({ ...base, apiFootball: afDone(25, 22) }),
    ).toEqual({
      count: 3,
      reason: null,
    });
    expect(
      lineupBackfillAllowance({ ...base, apiFootball: afDone(22, 22) }),
    ).toEqual({
      count: 0,
      reason: "daily-cap",
    });
  });

  it("API-Football 단계가 멈췄거나 끝나지 않았으면, dev·dry·정기 운영 전이면 하지 않는다", () => {
    expect(
      lineupBackfillAllowance({
        ...base,
        apiFootball: afDone(60, 10, "budget"),
      }),
    ).toEqual({ count: 0, reason: "af-stopped" });
    expect(lineupBackfillAllowance({ ...base, apiFootball: null })).toEqual({
      count: 0,
      reason: "af-not-done",
    });
    expect(
      lineupBackfillAllowance({
        ...base,
        apiFootball: {
          provider: "api-football",
          state: "skipped",
          reason: "daily-cap",
          elapsedMs: 0,
        },
      }),
    ).toEqual({ count: 0, reason: "af-not-done" });
    expect(
      lineupBackfillAllowance({
        ...base,
        env: "dev",
        apiFootball: afDone(50, 0),
      }),
    ).toEqual({ count: 0, reason: "not-write" });
    expect(
      lineupBackfillAllowance({
        ...base,
        dry: true,
        apiFootball: afDone(50, 0),
      }),
    ).toEqual({ count: 0, reason: "not-write" });
    expect(
      lineupBackfillAllowance({
        ...base,
        ledgerEnabled: false,
        apiFootball: afDone(50, 0),
      }),
    ).toEqual({ count: 0, reason: "ledger-disabled" });
    expect(
      lineupBackfillAllowance({
        ...base,
        hasApiKey: false,
        apiFootball: afDone(50, 0),
      }),
    ).toEqual({ count: 0, reason: "no-api-key" });
  });
});

describe("updateLineupBackfillCache — 받아 본 id 기억(30일)", () => {
  const NOW_ISO = "2026-10-30T22:15:00.000Z";

  it("처음이면 만들고, 없을 것이 없으면 null", () => {
    expect(updateLineupBackfillCache(null, [], NOW_ISO)).toEqual({
      file: null,
      changed: false,
      pruned: 0,
    });
    const first = updateLineupBackfillCache(null, [30, 10], NOW_ISO);
    expect(first.changed).toBe(true);
    expect(first.file).toEqual({
      updatedAt: NOW_ISO,
      fixtures: [
        { id: 10, at: NOW_ISO },
        { id: 30, at: NOW_ISO },
      ],
    });
    expect(LineupBackfillFileSchema.parse(first.file)).toEqual(first.file);
  });

  it("보존 기간이 지난 항목은 지우고, 바뀐 것이 없으면 다시 쓰지 않는다", () => {
    const old = "2026-09-29T22:14:59.000Z"; // 30일 + 1초 전
    const keep = "2026-10-01T00:00:00.000Z";
    const prev: LineupBackfillFile = {
      updatedAt: keep,
      fixtures: [
        { id: 1, at: old },
        { id: 2, at: keep },
      ],
    };
    const next = updateLineupBackfillCache(prev, [], NOW_ISO);
    expect(next.pruned).toBe(1);
    expect(next.file?.fixtures).toEqual([{ id: 2, at: keep }]);
    expect(LINEUP_BACKFILL_CACHE_DAYS).toBe(30);
    const same = updateLineupBackfillCache(next.file, [], NOW_ISO);
    expect(same.changed).toBe(false);
    expect(same.file?.updatedAt).toBe(next.file?.updatedAt);
  });
});

describe("scorerNameObservations — 대회별 상위 n명만", () => {
  it("파일 순서(순위) 상위 20명, 같은 이름은 한 번, kind player", () => {
    const file = (prefix: string, n: number) => ({
      scorers: Array.from({ length: n }, (_, i) => ({
        player: `${prefix} ${i}`,
        team: "arsenal",
        goals: n - i,
        assists: null,
        penalties: null,
        played: null,
      })),
    });
    const obs = scorerNameObservations([
      file("A", 100),
      file("B", 5),
      { scorers: [file("A", 1).scorers[0]!] },
    ]);
    expect(obs).toHaveLength(SCORER_NAMES_PER_COMP + 5);
    expect(obs[0]).toEqual({ name: "A 0", kind: "player" });
    expect(obs.map((o) => o.name)).not.toContain("A 20");
  });
});

describe("단계 마감·간격", () => {
  it("마감 = min(예산, 상한까지 남은 시간), 상한이 지났으면 지금", () => {
    const capAt = footballStagesCapAt("2026-10-30T22:20:00.000Z");
    expect(capAt).toBe("2026-10-30T22:23:00.000Z");
    expect(FOOTBALL_STAGES_GRACE_MS).toBe(180_000);
    expect(
      stageDeadline({
        clockNow: 1_000,
        wallNow: new Date("2026-10-30T22:12:00.000Z"),
        budgetMs: COMPETITIONS_STAGE_BUDGET_MS,
        capAt,
      }),
    ).toBe(1_000 + COMPETITIONS_STAGE_BUDGET_MS);
    expect(
      stageDeadline({
        clockNow: 1_000,
        wallNow: new Date("2026-10-30T22:22:00.000Z"),
        budgetMs: COMPETITIONS_STAGE_BUDGET_MS,
        capAt,
      }),
    ).toBe(1_000 + 60_000);
    expect(
      stageDeadline({
        clockNow: 1_000,
        wallNow: new Date("2026-10-30T22:30:00.000Z"),
        budgetMs: COMPETITIONS_STAGE_BUDGET_MS,
        capAt,
      }),
    ).toBe(1_000);
  });

  it("다음 클라이언트 첫 요청 하한 = 앞 클라이언트 끝 + 6.5초", () => {
    expect(nextClientNotBefore(null)).toBeNull();
    expect(nextClientNotBefore(10_000)).toBe(
      10_000 + FOOTBALL_DATA_MIN_INTERVAL_MS,
    );
  });

  it("스위치: 비었거나 없으면 켬, off·false·0이면 끔", () => {
    expect(resolveFootballStagesEnabled(undefined)).toBe(true);
    expect(resolveFootballStagesEnabled("")).toBe(true);
    expect(resolveFootballStagesEnabled("on")).toBe(true);
    expect(resolveFootballStagesEnabled(" OFF ")).toBe(false);
    expect(resolveFootballStagesEnabled("false")).toBe(false);
    expect(resolveFootballStagesEnabled("0")).toBe(false);
  });
});

// ─── runCollect 통합 ─────────────────────────────────────────────────────

/** 대회 단계 가짜 — PL은 시즌 경기·득점 fixture, 그 밖 대회의 시즌 경기·득점은 500. 순위는 기존 가짜(fixture) */
function competitionsFake(url: string): Response {
  const p = fdPath(url)!;
  if (p === "/competitions/PL/matches?season=2026") {
    return new Response(readFdFixture("season-pl-2026-10-30.json"), {
      status: 200,
    });
  }
  if (p.startsWith("/competitions/PL/scorers?")) {
    return new Response(readFdFixture("scorers-pl-2026-10-10.json"), {
      status: 200,
    });
  }
  if (/^\/competitions\/[^/]+\/(matches\?season|scorers\?)/.test(p)) {
    return new Response('{"message":"boom","errorCode":500}', { status: 500 });
  }
  return fdFixtureResponse(url)!;
}

function makeDeps(over: Partial<CollectDeps> = {}) {
  const records: LogRecord[] = [];
  const printed: string[] = [];
  const fdCalls: Array<{ path: string; at: number }> = [];
  const afCalls: string[] = [];
  let t = 0; // football-data 가상 시계 — 간격 대기는 시각만 민다
  const fetch: FetchLike = async (url) => {
    if (url === BBC.url) return new Response(BBC_XML, { status: 200 });
    if (url.startsWith(FOOTBALL_DATA_BASE_URL)) {
      fdCalls.push({ path: fdPath(url)!, at: t });
      return competitionsFake(url);
    }
    if (afPath(url) !== null) {
      afCalls.push(afPath(url)!);
      return afFixtureResponse(url)!;
    }
    throw new Error(`테스트에서 예상하지 못한 URL: ${url}`);
  };
  const deps: CollectDeps = {
    rootDir: ROOT,
    dataDir,
    env: "prod",
    llmMode: "mock",
    dry: false,
    limit: 5,
    loadSources: async () => [BBC],
    now: () => NOW,
    fetch,
    userAgent: feedUserAgent("test@example.com"),
    feedClock: { now: () => 0, sleep: async () => undefined },
    footballDataApiKey: "test-football-data-key",
    footballDataNow: () => t,
    footballDataSleep: async (ms) => {
      t += ms;
    },
    createLlm: () => createLlmClient({ mode: "mock", logger: () => undefined }),
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
    healthReportPath: healthFile,
    footballStages: true,
    ...over,
  };
  return { deps, records, printed, fdCalls, afCalls };
}

const COMP_PATH = /^\/competitions\/[^/]+\/(matches\?season|scorers\?)/;

describe("runCollect — 축구 데이터 단계(M2-09)", () => {
  it("브리핑 뒤 대회 단계(18요청) → 팀 파일, 호출 수 합산·대회 실패 격리(전일 값 유지)·발행 계속", async () => {
    // 전일 라리가 파일(실데이터) — 이번 실행은 시즌 경기·득점이 실패해 그 조각을 유지해야 한다
    const prevLaliga = CompetitionFileSchema.parse(
      JSON.parse(read("data/competitions/laliga.json")),
    );
    mkdirSync(path.join(dataDir, "competitions"), { recursive: true });
    writeFileSync(
      path.join(dataDir, "competitions", "laliga.json"),
      `${JSON.stringify(prevLaliga, null, 2)}\n`,
    );
    const { deps, fdCalls, records } = makeDeps();
    const outcome = await runCollect(deps);

    // 발행은 그대로 — 뉴스·브리핑 파일, exit 0
    expect(outcome.exitCode).toBe(0);
    expect(existsSync(path.join(dataDir, "news", "2026-10-11.json"))).toBe(
      true,
    );
    expect(existsSync(path.join(dataDir, "briefs", "2026-10-11.json"))).toBe(
      true,
    );

    // 순서: 브리핑 쪽 football-data(경기 1 + 순위 5) → 대회 단계 18요청, 첫 대회 요청은 마지막 브리핑 응답 + 6.5초 이후
    expect(fdCalls[0]!.path.startsWith("/matches?")).toBe(true);
    // 대회 단계 = 순위 → 시즌 경기 → 득점(대회 순서), 500은 1회 재시도(5대 리그 밖 PL 제외 5개 대회 × 2조각 × 2회)
    const compStart =
      fdCalls.findIndex(
        (x) => x.path === "/competitions/PL/matches?season=2026",
      ) - 1;
    expect(compStart).toBe(6);
    expect(fdCalls[compStart]!.path).toBe("/competitions/PL/standings");
    expect([...new Set(fdCalls.slice(compStart).map((c) => c.path))]).toEqual(
      ["PL", "PD", "SA", "BL1", "FL1", "CL"].flatMap((code) => [
        `/competitions/${code}/standings`,
        `/competitions/${code}/matches?season=2026`,
        `/competitions/${code}/scorers?season=2026&limit=100`,
      ]),
    );
    expect(fdCalls.length - compStart).toBe(18 + 10);
    expect(
      fdCalls[compStart]!.at - fdCalls[compStart - 1]!.at,
    ).toBeGreaterThanOrEqual(FOOTBALL_DATA_MIN_INTERVAL_MS);
    // 대회 파일: EPL은 새 값, 라리가는 순위만 새 값 + 경기·득점은 전일 값, 나머지는 순위만(전일 파일 없음 → 빈 배열)
    const c = outcome.football!.competitions;
    expect(c.state).toBe("done");
    if (c.state !== "done") throw new Error("unreachable");
    expect(c.apiCalls).toBe(28);
    const epl = CompetitionFileSchema.parse(
      JSON.parse(
        readFileSync(path.join(dataDir, "competitions", "epl.json"), "utf8"),
      ),
    );
    expect(epl.matches.length).toBeGreaterThan(0);
    expect(epl.scorers.length).toBeGreaterThan(0);
    const laliga = CompetitionFileSchema.parse(
      JSON.parse(
        readFileSync(path.join(dataDir, "competitions", "laliga.json"), "utf8"),
      ),
    );
    expect(laliga.matches).toEqual(prevLaliga.matches);
    expect(laliga.scorers).toEqual(prevLaliga.scorers);
    expect(c.results.find((r) => r.comp === "LALIGA")!.kept).toEqual([
      "matches",
      "scorers",
    ]);

    // 팀 파일 111개(prod·비dry) — 주요 선수는 방금 쓴 EPL 득점 순위에서
    const t = outcome.football!.teams;
    expect(t.state).toBe("done");
    if (t.state !== "done") throw new Error("unreachable");
    expect(t.mode).toBe("write");
    expect(t.problems).toEqual([]);
    expect(readdirSync(path.join(dataDir, "teams")).length).toBe(111);
    expect(t.backfill.state).toBe("skipped"); // API-Football 키 없음 → 단계 not done

    // 실행 기록 — 브리핑 6 + 대회 28(재시도 포함)
    const runs = RunsFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs.json"), "utf8")),
    );
    expect(runs.at(-1)!.apiCalls).toEqual({ footballData: 34, apiFootball: 0 });
    expect(outcome.status).toBe("partial"); // 대회 조각 실패(HTTP 500) — source:football-data

    // 이슈: football-data 원인 키 하나(대회 단계 사건), 부분 실패 이슈 없음
    const health = JSON.parse(readFileSync(healthFile, "utf8")) as unknown[];
    const fdIssues = health
      .map((p) => SourceBrokenPayloadSchema.parse(p))
      .filter((p) => p.sourceId === "football-data");
    expect(fdIssues).toHaveLength(1);
    expect(fdIssues[0]!.errorType).toBe("competitions");

    // 미등록 이름: 대회별 상위 20명만(브리핑 입력 이름과 합쳐 쓴다)
    const names = UnknownNamesFileSchema.parse(
      JSON.parse(
        readFileSync(path.join(dataDir, "cache", "unknown-names.json"), "utf8"),
      ),
    );
    const eplTop = new Set(
      epl.scorers.slice(0, SCORER_NAMES_PER_COMP).map((s) => s.player),
    );
    const eplRest = epl.scorers
      .slice(SCORER_NAMES_PER_COMP)
      .map((s) => s.player);
    expect(Object.keys(names.names).some((n) => eplTop.has(n))).toBe(true);
    expect(eplRest.filter((n) => n in names.names && !eplTop.has(n))).toEqual(
      [],
    );

    const done = records.find((r) => r.event === "collect.done")!;
    expect(done).toMatchObject({
      competitions: "done:6/6",
      competitionsCalls: 28,
      apiCalls: 34,
    });
  });

  it("스위치를 끄면(COLLECT_FOOTBALL_STAGES=off) 대회 요청도 팀 파일도 없다 — 기존 흐름 그대로", async () => {
    const { deps, fdCalls } = makeDeps({ footballStages: false });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(fdCalls.some((c) => COMP_PATH.test(c.path))).toBe(false);
    expect(outcome.football?.plan.competitions).toEqual({
      run: false,
      reason: "disabled",
    });
    expect(existsSync(path.join(dataDir, "teams"))).toBe(false);
    expect(existsSync(path.join(dataDir, "competitions"))).toBe(false);
    expect(outcome.status).toBe("success");
  });

  it("dry는 football-data 대회 요청을 하지 않고 팀 파일을 쓰지 않는다(요약만 출력)", async () => {
    const { deps, fdCalls, printed } = makeDeps({ dry: true, env: "dev" });
    const outcome = await runCollect(deps);
    expect(fdCalls.some((c) => COMP_PATH.test(c.path))).toBe(false);
    expect(outcome.football?.teams.state).toBe("done");
    expect(existsSync(path.join(dataDir, "teams"))).toBe(false);
    expect(printed.some((p) => p.includes("[dry] 축구 데이터 단계"))).toBe(
      true,
    );
  });

  it("팀 단계가 실패해도(원장 손상) 뉴스·브리핑은 발행되고 exit 0 · partial(부분 실패 이슈 football)", async () => {
    mkdirSync(path.join(dataDir, "matches"), { recursive: true });
    writeFileSync(path.join(dataDir, "matches", "meta.json"), "{ broken");
    const { deps } = makeDeps();
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(existsSync(path.join(dataDir, "news", "2026-10-11.json"))).toBe(
      true,
    );
    expect(outcome.football?.teams.state).toBe("failed");
    expect(outcome.status).toBe("partial");
  });

  it("09:00 KST 뒤 실행은 대회 단계를 건너뛴다(다음 날 ▲▼ 기준 보호) — 팀 파일은 쓴다", async () => {
    const late = new Date("2026-10-11T03:00:00.000Z"); // 12:00 KST
    const { deps, fdCalls } = makeDeps({ now: () => late });
    const outcome = await runCollect(deps);
    expect(outcome.football?.plan.competitions).toEqual({
      run: false,
      reason: "after-cutoff",
    });
    expect(fdCalls.some((c) => COMP_PATH.test(c.path))).toBe(false);
    expect(outcome.football?.teams.state).toBe("done");
  });
});

// ─── 팀 단계 + 라인업 백필 ───────────────────────────────────────────────

describe("runTeamsCollectStage — 라인업 백필(exclude·상한·간격·캐시)", () => {
  function seedRealData() {
    for (const dir of ["matches", "competitions", "teams"]) {
      cpSync(path.join(ROOT, "data", dir), path.join(dataDir, dir), {
        recursive: true,
      });
    }
  }

  function teamDeps() {
    const records: LogRecord[] = [];
    const calls: Array<{ path: string; at: number }> = [];
    let t = 100_000;
    const deps = {
      rootDir: ROOT,
      dataDir,
      env: "prod" as const,
      dry: false,
      ledgerEnabled: true,
      now: () => new Date("2026-10-30T22:16:00.000Z"),
      fetch: (async (url: string) => {
        calls.push({ path: afPath(url)!, at: t });
        return afFixtureResponse(url)!;
      }) as FetchLike,
      footballDataApiKey: undefined,
      apiFootballApiKey: "test-api-football-key",
      apiFootballNow: () => t,
      apiFootballSleep: async (ms: number) => {
        t += ms;
      },
      logger: createLogger({
        scope: "collect",
        format: "json",
        sink: (_line, record) => records.push(record),
      }),
    };
    return { deps, calls, records };
  }

  it("허용 건수만 받고(첫 요청 ≥ notBefore), 받아 본 id를 캐시에 남겨 다음 실행이 다른 경기를 고른다", async () => {
    seedRealData();
    const sink = { apiCalls: { apiFootball: 0 } };
    const first = teamDeps();
    const r1 = await runTeamsCollectStage(first.deps, {
      mode: "write",
      details: [],
      ledgerExtra: [],
      backfill: { count: 3, reason: null },
      afNotBefore: 120_000,
      capAt: "2026-10-30T22:23:00.000Z",
      sink,
    });
    expect(r1.state).toBe("done");
    if (r1.state !== "done") throw new Error("unreachable");
    expect(r1.backfill.state).toBe("done");
    expect(r1.backfill.planned).toBe(3);
    expect(first.calls).toHaveLength(3);
    expect(first.calls.every((c) => c.path.startsWith("/fixtures?id="))).toBe(
      true,
    );
    expect(first.calls[0]!.at).toBeGreaterThanOrEqual(120_000);
    expect(sink.apiCalls.apiFootball).toBe(3);
    expect(r1.backfill.cacheWritten).toBe(true);
    const cache = await readLineupBackfillCache(dataDir);
    const triedIds = cache.value!.fixtures.map((f) => f.id);
    expect(triedIds).toHaveLength(3);
    expect(first.calls.map((c) => Number(c.path.split("=")[1])).sort()).toEqual(
      [...triedIds].sort(),
    );

    const second = teamDeps();
    const r2 = await runTeamsCollectStage(second.deps, {
      mode: "write",
      details: [],
      ledgerExtra: [],
      backfill: { count: 3, reason: null },
      afNotBefore: null,
      capAt: "2026-10-30T22:23:00.000Z",
      sink,
    });
    if (r2.state !== "done") throw new Error("unreachable");
    expect(r2.backfill.excluded).toBe(3);
    const secondIds = second.calls.map((c) => Number(c.path.split("=")[1]));
    expect(secondIds.some((id) => triedIds.includes(id))).toBe(false);
    expect(sink.apiCalls.apiFootball).toBe(3 + second.calls.length);
  });

  it("백필 0건이면 API를 부르지 않고 캐시도 쓰지 않는다(preview는 팀 파일도 쓰지 않음)", async () => {
    seedRealData();
    const before = readFileSync(
      path.join(dataDir, "teams", "arsenal.json"),
      "utf8",
    );
    const { deps, calls } = teamDeps();
    const r = await runTeamsCollectStage(deps, {
      mode: "preview",
      details: [],
      ledgerExtra: [],
      backfill: { count: 0, reason: "not-write" },
      afNotBefore: null,
      capAt: "2026-10-30T22:23:00.000Z",
      sink: { apiCalls: { apiFootball: 0 } },
    });
    expect(r.state).toBe("done");
    expect(calls).toEqual([]);
    expect(
      existsSync(path.join(dataDir, "cache", "lineup-backfill.json")),
    ).toBe(false);
    expect(
      readFileSync(path.join(dataDir, "teams", "arsenal.json"), "utf8"),
    ).toBe(before);
  });

  it("실데이터 재생성은 결정적이다(쓴 파일 0 — 봇 커밋에 불필요한 diff 없음)", async () => {
    seedRealData();
    const { deps } = teamDeps();
    const r = await runTeamsCollectStage(deps, {
      mode: "write",
      details: [],
      ledgerExtra: [],
      backfill: { count: 0, reason: "not-write" },
      afNotBefore: null,
      capAt: "2026-10-30T22:23:00.000Z",
      sink: { apiCalls: { apiFootball: 0 } },
    });
    if (r.state !== "done") throw new Error("unreachable");
    expect(r.written).toBe(0);
    expect(r.problems).toEqual([]);
    expect(r.stats.teams).toBe(111);
  });
});

describe("recordBackfillApiCalls — 단독 백필 호출 기록(봇 일일 카운터 입력)", () => {
  it("dev 호출을 runs-dev.json에 RunLog 한 건으로 남기고, 봇 허용량이 같은 UTC 날 dev 사용을 합산한다", async () => {
    const startedAt = "2026-10-30T02:31:00.000Z"; // 11:31 KST
    const recorded = await recordBackfillApiCalls({
      env: "dev",
      dataDir,
      startedAt,
      finishedAt: "2026-10-30T02:36:00.000Z",
      apiFootballCalls: 41,
      now: new Date("2026-10-30T03:00:00.000Z"),
    });
    expect(recorded).not.toBeNull();
    const runs = RunsDevFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs-dev.json"), "utf8")),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      env: "dev",
      job: "collect",
      status: "skipped",
      startedAt,
      costUsd: 0,
      apiCalls: { footballData: 0, apiFootball: 41 },
      tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    });
    expect(runs[0]!.runId.startsWith("collect-dev-20261030T023100Z-")).toBe(
      true,
    );
    expect(existsSync(path.join(dataDir, "runs.json"))).toBe(false);
    // 다음 아침 봇(07:10 KST = 같은 UTC 날 22:10) — min(60, 100 − 5 − 41) = 54
    const bot = apiFootballCallAllowance({
      env: "prod",
      prodRuns: [],
      devRuns: runs,
      now: "2026-10-30T22:10:00.000Z",
    });
    expect(bot).toMatchObject({
      usedTotal: 41,
      remaining: 54,
      limitedBy: "api-limit",
    });
  });

  it("호출 0건이면 기록하지 않는다", async () => {
    expect(
      await recordBackfillApiCalls({
        env: "dev",
        dataDir,
        startedAt: "2026-10-30T02:31:00.000Z",
        apiFootballCalls: 0,
      }),
    ).toBeNull();
    expect(existsSync(path.join(dataDir, "runs-dev.json"))).toBe(false);
  });
});
