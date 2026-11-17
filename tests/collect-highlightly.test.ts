/**
 * M5-18 runCollect 통합 — 경기 상세 프로바이더 Highlightly(PRD §15 D80). 네트워크·실호출 없음(fixtures/highlightly 응답 라우터).
 *
 * 필수 항목: MATCH_DETAIL_PROVIDER = highlightly면 API-Football을 부르지 않는다, 호출 계획(날짜 × 6개 대회 + 상세·박스스코어·라인업 +
 * 날짜 조회에 없는 한국 선수 소속팀 최근 5경기), 원장 `hl-<id>` 항목·한국 선수 행(highlightlyId), 실행 기록 apiCalls.highlightly,
 * 키 없음 → 건너뜀(원장 공백 skipped — 브리핑 날짜 하나).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MatchLedgerFileSchema,
  MatchLedgerMetaSchema,
  RunsFileSchema,
  SourcesFileSchema,
} from "@/lib/schema";

import { runCollect, type CollectDeps } from "../scripts/lib/collect-run";
import { createLlmClient } from "../scripts/lib/llm";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { API_FOOTBALL_BASE_URL } from "../scripts/lib/providers/api-football";
import { HIGHLIGHTLY_BASE_URL } from "../scripts/lib/providers/highlightly";
import { feedUserAgent, type FetchLike } from "../scripts/lib/rss";

import { hlListBody, readHlJson } from "./support/highlightly-fake";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const SOURCES = SourcesFileSchema.parse(
  JSON.parse(read("configs/sources.json")),
);
const BBC = SOURCES.find((s) => s.id === "bbc-sport-football")!;
const BBC_XML = read("fixtures/rss/bbc-sport-football.xml");

/** 07:10 KST 2026-11-08(겨울 슬롯) — 발행일 2026-11-08, 브리핑 입력 창 = UTC 2026-11-07 */
const NOW = new Date("2026-11-07T22:10:00.000Z");
const MATCH_ID = 1340510451;

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-hl-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

/** Highlightly 라우터 — 분데스 2026-11-07에 마인츠–바이에른 1경기, 나머지 대회·최근 5경기는 빈 목록 */
function hlRoute(p: string): unknown {
  if (p.startsWith("/matches?")) {
    const list = readHlJson<{ data: Array<{ id: number }> }>(
      "matches-bundesliga-name-2026-11-07.json",
    );
    const data =
      p.includes("leagueId=67162") && p.includes("date=2026-11-07")
        ? list.data.filter((m) => m.id === MATCH_ID)
        : [];
    return hlListBody(data);
  }
  if (p === `/matches/${MATCH_ID}`) return readHlJson("match-1340510451.json");
  if (p === `/lineups/${MATCH_ID}`)
    return readHlJson("lineups-1340510451.json");
  if (p === `/box-score/${MATCH_ID}`)
    return readHlJson("box-score-1340510451.json");
  if (p.startsWith("/last-five-games?")) return [];
  return null;
}

function makeDeps(over: Partial<CollectDeps> = {}) {
  const records: LogRecord[] = [];
  const hlCalls: string[] = [];
  const afCalls: string[] = [];
  const fetch: FetchLike = async (url) => {
    if (url === BBC.url) return new Response(BBC_XML, { status: 200 });
    if (url.startsWith(API_FOOTBALL_BASE_URL)) {
      afCalls.push(url);
      return new Response("{}", { status: 500 });
    }
    if (url.startsWith(HIGHLIGHTLY_BASE_URL)) {
      const p = url.slice(HIGHLIGHTLY_BASE_URL.length);
      hlCalls.push(p);
      const body = hlRoute(p);
      return new Response(JSON.stringify(body ?? { message: "Not found" }), {
        status: body === null ? 404 : 200,
        headers: {
          "content-type": "application/json",
          "x-ratelimit-requests-limit": "100",
          "x-ratelimit-requests-remaining": "60",
        },
      });
    }
    throw new Error(`테스트에서 예상하지 못한 URL: ${url}`);
  };
  let t = 0;
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
    footballDataApiKey: undefined,
    apiFootballApiKey: "test-api-football-key",
    matchDetailProvider: "highlightly",
    highlightlyApiKey: "test-highlightly-key",
    highlightlyNow: () => t,
    highlightlySleep: async (ms) => {
      t += ms;
    },
    ledgerEnabled: true,
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
    print: () => undefined,
    ...over,
  };
  return { deps, records, hlCalls, afCalls };
}

describe("runCollect — 경기 상세 Highlightly(D80)", () => {
  it("API-Football을 부르지 않고 Highlightly로 원장 hl- 항목·한국 선수 행을 쓴다, 실행 기록 apiCalls.highlightly", async () => {
    const { deps, hlCalls, afCalls } = makeDeps();
    const outcome = await runCollect(deps);
    expect(afCalls).toEqual([]);
    expect(outcome.matchData?.apiFootball.provider).toBe("highlightly");
    // 날짜 1개 × 6개 대회 → 상세·박스스코어(한국 선수 경기)·라인업 → 날짜 조회에 없는 한국 선수 소속팀 최근 5경기
    expect(hlCalls.filter((p) => p.startsWith("/matches?"))).toHaveLength(6);
    expect(
      hlCalls.filter(
        (p) => !p.startsWith("/matches?") && !p.startsWith("/last-five"),
      ),
    ).toEqual([
      `/matches/${MATCH_ID}`,
      `/box-score/${MATCH_ID}`,
      `/lineups/${MATCH_ID}`,
    ]);
    const lastFive = hlCalls.filter((p) => p.startsWith("/last-five-games?"));
    expect(lastFive).toHaveLength(7); // 활성 한국 선수 소속 9팀 − 마인츠·바이에른
    expect(lastFive).not.toContain("/last-five-games?teamId=140348");

    const ledger = MatchLedgerFileSchema.parse(
      JSON.parse(
        readFileSync(path.join(dataDir, "matches", "2026-11.json"), "utf8"),
      ),
    );
    expect(ledger.matches.map((m) => m.id)).toEqual([`hl-${MATCH_ID}`]);
    const m = ledger.matches[0]!;
    expect(m).toMatchObject({
      leagueId: 67162,
      comp: "BUNDESLIGA",
      status: "FT",
      ft: { home: 1, away: 2 },
      goalsComplete: true,
      home: { id: 140348, formation: "3-5-2" },
      away: { id: 134391, formation: "4-2-3-1" },
    });
    expect(m.korean).toEqual([
      {
        player: 466571,
        side: "away",
        status: "bench",
        minutes: 0,
        goals: 0,
        assists: 0,
      },
      {
        player: 468020,
        side: "home",
        status: "start",
        minutes: 63,
        goals: 0,
        assists: 0,
      },
    ]);
    const meta = MatchLedgerMetaSchema.parse(
      JSON.parse(
        readFileSync(path.join(dataDir, "matches", "meta.json"), "utf8"),
      ),
    );
    expect(meta.since).toBe("2026-11-07");
    // 추적 선수 = 활성 + highlightlyId(김지수 포함 9명)
    expect(Object.keys(meta.playerSince)).toHaveLength(9);
    expect(meta.playerSince["kim-ji-soo"]).toBe("2026-11-07");

    const runs = RunsFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs.json"), "utf8")),
    );
    expect(runs.at(-1)!.apiCalls).toEqual({
      footballData: 0,
      apiFootball: 0,
      highlightly: hlCalls.length,
    });
    expect(hlCalls).toHaveLength(16);
    // 이월할 경기가 없으면 hl-pending.json을 만들지 않는다 · API-Football 이월 파일은 건드리지 않는다
    expect(existsSync(path.join(dataDir, "cache", "hl-pending.json"))).toBe(
      false,
    );
    expect(existsSync(path.join(dataDir, "cache", "af-pending.json"))).toBe(
      false,
    );
  });

  it("키가 없으면 건너뜀(no-api-key) — 요청 없음, 원장이 있으면 브리핑 날짜를 빠진 날(skipped)로", async () => {
    // 첫 실행으로 원장을 시작한다
    await runCollect(makeDeps().deps);
    const { deps, hlCalls, afCalls, records } = makeDeps({
      highlightlyApiKey: undefined,
      now: () => new Date("2026-11-08T22:10:00.000Z"),
    });
    const outcome = await runCollect(deps);
    expect(hlCalls).toEqual([]);
    expect(afCalls).toEqual([]);
    expect(outcome.matchData?.apiFootball).toMatchObject({
      provider: "highlightly",
      state: "skipped",
      reason: "no-api-key",
    });
    expect(
      records.find(
        (r) =>
          r.event === "collect.matchdata.skip" && r.provider === "highlightly",
      ),
    ).toMatchObject({ reason: "no-api-key", missing: "HIGHLIGHTLY_API_KEY" });
    const meta = MatchLedgerMetaSchema.parse(
      JSON.parse(
        readFileSync(path.join(dataDir, "matches", "meta.json"), "utf8"),
      ),
    );
    expect(meta.gaps).toEqual([
      { date: "2026-11-08", reason: "skipped", cause: "no-api-key" },
    ]);
  });

  it("MATCH_DETAIL_PROVIDER = api-football이면 Highlightly를 부르지 않는다(되돌리기)", async () => {
    const { deps, hlCalls, afCalls } = makeDeps({
      matchDetailProvider: "api-football",
      apiFootballNow: () => 0,
      apiFootballSleep: async () => undefined,
    });
    const outcome = await runCollect(deps);
    expect(hlCalls).toEqual([]);
    expect(afCalls.length).toBeGreaterThan(0);
    expect(outcome.matchData?.apiFootball.provider).toBe("api-football");
  });
});
