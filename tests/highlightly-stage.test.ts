/**
 * M5-18 Highlightly 수집 계획·단계(scripts/lib/highlightly-plan.ts · highlightly-stage.ts, PRD §15 D80) — 네트워크·실호출 없음(가짜
 * 클라이언트). 필수 항목: 호출 계획(날짜 × 대회 조회 · 경기마다 상세 + 라인업 · 한국 선수 소속팀 경기만 박스스코어 · 브리핑 경기 먼저 —
 * 라인업은 컷오프 뒤), 일일 상한(봇 65 · 개발 30 · 일 한도 − 여유 · 기록 못 읽음 10), 날짜(브리핑 날짜 + 전날 공백), 탐색(최근 5경기 —
 * 6개 대회 밖 · 3일 안 · 친선 제외 · 다른 프로바이더 원장과 같은 경기 제외), 멈춤(plan 강등·호출 상한 → 이월), 백필(한국 선수 경기만).
 */
import { describe, expect, it } from "vitest";

import type {
  CompetitionConfig,
  KoreanPlayersFile,
  RunLog,
  TeamIdsFile,
} from "@/lib/schema";

import type { AfTargetConfig } from "../scripts/lib/api-football-plan";
import {
  HIGHLIGHTLY_BOT_DAILY_CAP,
  HIGHLIGHTLY_DEV_DAILY_CAP,
  buildHlTargetConfig,
  highlightlyCallAllowance,
  highlightlyUsedOn,
  hlDateRange,
  hlQueryDates,
  isKoreanTeamMatch,
  resolveHighlightlyMaxCalls,
} from "../scripts/lib/highlightly-plan";
import {
  highlightlyIssuePayloads,
  runHighlightlyStage,
  type HlStageInput,
} from "../scripts/lib/highlightly-stage";
import { playerAppearance } from "../scripts/lib/match-data";
import { HighlightlyError } from "../scripts/lib/providers/highlightly";

import { hlEvent, hlItem, readHlJson } from "./support/highlightly-fake";

// ─── 계획 ────────────────────────────────────────────────────────────────

const COMPS = [
  { id: "EPL", apiFootballLeagueId: 39, highlightlyLeagueId: 33973 },
  { id: "BUNDESLIGA", apiFootballLeagueId: 78, highlightlyLeagueId: 67162 },
  { id: "UCL", apiFootballLeagueId: 2 },
] as unknown as CompetitionConfig[];

const PLAYERS = [
  {
    slug: "a",
    team: "mainz",
    active: true,
    apiFootballId: 1,
    highlightlyId: 468020,
  },
  {
    slug: "b",
    team: "brentford",
    active: true,
    apiFootballId: null,
    highlightlyId: 57354311,
  },
  { slug: "c", team: "nowhere", active: true, apiFootballId: 3 },
  {
    slug: "d",
    team: "midtjylland",
    active: false,
    apiFootballId: null,
    highlightlyId: null,
  },
] as unknown as KoreanPlayersFile;

const TEAM_IDS: TeamIdsFile = {
  mainz: { fd: 15, af: 164, hl: 140348 },
  brentford: { fd: 402, af: 55, hl: 47589 },
  nowhere: { fd: 9, af: 9 },
};

describe("대상 선별 — Highlightly id 체계(highlightlyLeagueId · team-ids hl)", () => {
  it("날짜 조회 대회 · id 없는 대회 · 활성 한국 선수 소속팀 hl · hl 없는 팀", () => {
    const t = buildHlTargetConfig({
      competitions: COMPS,
      koreanPlayers: PLAYERS,
      teamIds: TEAM_IDS,
    });
    expect(t.leagues).toEqual([
      { comp: "EPL", leagueId: 33973 },
      { comp: "BUNDESLIGA", leagueId: 67162 },
    ]);
    expect(t.leaguesMissing).toEqual(["UCL"]);
    expect([...t.targets.compByLeague]).toEqual([
      [33973, "EPL"],
      [67162, "BUNDESLIGA"],
    ]);
    expect([...t.targets.koreanTeamIds].sort((a, b) => a - b)).toEqual([
      47589, 140348,
    ]);
    expect(t.unmappedTeams).toEqual(["nowhere"]);
    expect(
      isKoreanTeamMatch(
        { home: { id: 1 }, away: { id: 140348 } },
        t.targets.koreanTeamIds,
      ),
    ).toBe(true);
  });
});

describe("날짜 조회 — 브리핑 날짜 하나 + 전날 공백일 때만 전날", () => {
  const briefWindow = {
    start: "2026-11-17T00:00:00.000Z",
    end: "2026-11-18T00:00:00.000Z",
  };
  it("메타 없음·공백 없음 → 브리핑 날짜만", () => {
    expect(hlQueryDates({ briefWindow, meta: null })).toEqual(["2026-11-17"]);
    expect(
      hlQueryDates({ briefWindow, meta: { since: "2026-10-19", gaps: [] } }),
    ).toEqual(["2026-11-17"]);
  });
  it("전날이 날짜 단위 공백(date-query·skipped·degraded)이면 전날도 — dropped·since 앞은 아니다", () => {
    for (const reason of ["date-query", "skipped", "degraded"] as const) {
      expect(
        hlQueryDates({
          briefWindow,
          meta: { since: "2026-10-19", gaps: [{ date: "2026-11-16", reason }] },
        }),
      ).toEqual(["2026-11-17", "2026-11-16"]);
    }
    expect(
      hlQueryDates({
        briefWindow,
        meta: {
          since: "2026-10-19",
          gaps: [{ date: "2026-11-16", reason: "dropped", matches: [1] }],
        },
      }),
    ).toEqual(["2026-11-17"]);
    expect(
      hlQueryDates({
        briefWindow,
        meta: {
          since: "2026-11-17",
          gaps: [{ date: "2026-11-16", reason: "skipped" }],
        },
      }),
    ).toEqual(["2026-11-17"]);
  });
  it("백필 범위(양 끝 포함) · 거꾸로·형식 오류는 던진다", () => {
    expect(hlDateRange("2026-11-04", "2026-11-06")).toEqual([
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]);
    expect(() => hlDateRange("2026-11-06", "2026-11-04")).toThrow();
    expect(() => hlDateRange("2026/11/04", "2026-11-06")).toThrow();
  });
});

describe("일일 상한(우리 쪽 카운터 — runs.json·runs-dev.json apiCalls.highlightly 같은 UTC 날)", () => {
  const run = (startedAt: string, highlightly?: number) =>
    ({
      startedAt,
      apiCalls: {
        footballData: 3,
        apiFootball: 7,
        ...(highlightly !== undefined ? { highlightly } : {}),
      },
    }) as Pick<RunLog, "startedAt" | "apiCalls">;
  const now = "2026-11-17T22:10:00.000Z";

  it("봇 65 · 개발 30 = 100 − 여유 5 − 봇 65, 옛 기록(highlightly 없음)은 0", () => {
    expect(HIGHLIGHTLY_BOT_DAILY_CAP).toBe(65);
    expect(HIGHLIGHTLY_DEV_DAILY_CAP).toBe(30);
    expect(
      highlightlyUsedOn(
        [
          run(now),
          run("2026-11-16T22:10:00.000Z", 50),
          run("2026-11-17T01:00:00.000Z", 4),
        ],
        now,
      ),
    ).toBe(4);
    const prod = highlightlyCallAllowance({
      env: "prod",
      prodRuns: [],
      devRuns: [],
      now,
    });
    expect(prod).toMatchObject({
      cap: 65,
      remaining: 65,
      limitedBy: "env-cap",
    });
    const dev = highlightlyCallAllowance({
      env: "dev",
      prodRuns: [],
      devRuns: [run(now, 10)],
      now,
    });
    expect(dev).toMatchObject({
      cap: 30,
      usedOwn: 10,
      remaining: 20,
      limitedBy: "env-cap",
    });
  });

  it("prod + dev 합이 일 한도 − 여유를 넘지 않게 · 실행당 상한 · 기록 못 읽으면 10", () => {
    const tight = highlightlyCallAllowance({
      env: "prod",
      prodRuns: [run(now, 20)],
      devRuns: [run(now, 60)],
      now,
    });
    expect(tight).toMatchObject({ remaining: 15, limitedBy: "api-limit" });
    expect(
      highlightlyCallAllowance({
        env: "prod",
        prodRuns: [],
        devRuns: [],
        now,
        perRunCap: 7,
      }),
    ).toMatchObject({ remaining: 7, limitedBy: "per-run" });
    expect(
      highlightlyCallAllowance({
        env: "prod",
        prodRuns: [],
        devRuns: [],
        now,
        runsUnreadable: true,
      }),
    ).toMatchObject({ remaining: 10, limitedBy: "runs-unreadable" });
    expect(resolveHighlightlyMaxCalls(" 12 ")).toBe(12);
    expect(resolveHighlightlyMaxCalls("")).toBeNull();
    expect(() => resolveHighlightlyMaxCalls("0")).toThrow();
  });
});

// ─── 단계 ────────────────────────────────────────────────────────────────

const D = "2026-11-07";
const BRIEF = { start: `${D}T00:00:00.000Z`, end: "2026-11-08T00:00:00.000Z" };
const NOW = new Date("2026-11-07T22:10:00.000Z");
const MAINZ = 140348;
const BAYERN = 134391;
const BRENTFORD = 47589;
const TARGETS: AfTargetConfig = {
  compByLeague: new Map([
    [67162, "BUNDESLIGA"],
    [33973, "EPL"],
  ]),
  koreanTeamIds: new Set([MAINZ, BRENTFORD]),
  excludedLeagueIds: new Set(),
};
const LEAGUES = [
  { comp: "BUNDESLIGA" as const, leagueId: 67162 },
  { comp: "EPL" as const, leagueId: 33973 },
];

const MZ_BY = hlItem({
  id: 101,
  leagueId: 67162,
  date: `${D}T14:30:00.000Z`,
  home: [MAINZ, "Mainz"],
  away: [BAYERN, "Bayern"],
  score: "1 - 2",
});
const OTHER = hlItem({
  id: 102,
  leagueId: 67162,
  date: `${D}T17:30:00.000Z`,
  home: [1, "Stuttgart"],
  away: [2, "Bremen"],
  score: "1 - 0",
});
const LATE = hlItem({
  id: 103,
  leagueId: 33973,
  date: `${D}T20:00:00.000Z`,
  home: [3, "Forest"],
  away: [4, "City"],
  description: "Second half",
  score: "1 - 0",
});

function detailOf(item: Record<string, unknown>, events: unknown[] = []) {
  return [{ ...item, events }];
}

interface FakeClientOptions {
  lists?: Record<string, unknown[]>;
  details?: Record<number, unknown>;
  lastFive?: Record<number, unknown[]>;
  fail?: (kind: string, arg: string | number) => Error | null;
  /** 요청마다 시계를 이만큼 민다(ms) */
  tick?: number;
}

function fakeClient(opts: FakeClientOptions) {
  const calls: string[] = [];
  const t = { now: 0 };
  const run = async <T>(kind: string, arg: string | number, value: () => T) => {
    calls.push(`${kind}:${arg}`);
    t.now += opts.tick ?? 0;
    const error = opts.fail?.(kind, arg) ?? null;
    if (error) throw error;
    return value();
  };
  const client: HlStageInput["client"] = {
    listMatches: (q) =>
      run(
        "list",
        `${q.date}/${q.leagueId}`,
        () => opts.lists?.[`${q.date}/${q.leagueId}`] ?? [],
      ),
    lastFiveGames: (teamId) =>
      run("last5", teamId, () => opts.lastFive?.[teamId] ?? []),
    getMatch: (id) =>
      run(
        "match",
        id,
        () => (opts.details?.[id] as unknown[] | undefined)?.[0] ?? null,
      ),
    getLineups: (id) =>
      run("lineups", id, () => ({
        homeTeam: {
          formation: "4-4-2",
          initialLineup: [
            [{ id: id * 10, name: "GK", number: 1, position: "Goalkeeper" }],
          ],
          substitutes: [],
        },
        awayTeam: {
          formation: "4-4-2",
          initialLineup: [
            [
              {
                id: id * 10 + 1,
                name: "GK",
                number: 1,
                position: "Goalkeeper",
              },
            ],
          ],
          substitutes: [],
        },
      })),
    getBoxScore: (id) =>
      run("box", id, () => [
        {
          team: { id: MAINZ },
          players: [
            {
              id: 468020,
              name: "Jae-sung Lee",
              isSubstitute: false,
              minutesPlayed: 63,
            },
            { id: 9, name: "X", isSubstitute: true, minutesPlayed: 0 },
          ],
        },
      ]),
  };
  return { client, calls, t };
}

function stageInput(
  fake: ReturnType<typeof fakeClient>,
  extra: Partial<HlStageInput> = {},
): HlStageInput {
  return {
    client: fake.client,
    targets: TARGETS,
    leagues: LEAGUES,
    pending: [],
    known: new Set(),
    briefWindow: BRIEF,
    dates: [D],
    now: () => NOW,
    clock: () => fake.t.now,
    briefCutoffAt: null,
    ...extra,
  };
}

describe("탐색 응답 실측(우니온 베를린 최근 5경기 — 2026-11-17)", () => {
  it("껍데기 없는 배열 · 친선(568401)은 제외 · DFB Pokal(6개 대회 밖)만 3일 안이면 대상 · 다른 프로바이더 원장과 같은 경기는 제외", async () => {
    const UNION = 155666;
    const items = readHlJson<unknown[]>("last-five-games-155666.json");
    expect(items).toHaveLength(5);
    const targets: AfTargetConfig = {
      ...TARGETS,
      koreanTeamIds: new Set([UNION]),
      excludedLeagueIds: new Set(
        buildHlTargetConfig({
          competitions: COMPS,
          koreanPlayers: [],
          teamIds: {},
        }).targets.excludedLeagueIds,
      ),
    };
    const fake = fakeClient({ lastFive: { [UNION]: items } });
    const run = (now: string, isDuplicate?: HlStageInput["isDuplicate"]) =>
      runHighlightlyStage({
        ...stageInput(fake, {
          leagues: [],
          dates: [],
          now: () => new Date(now),
        }),
        targets,
        ...(isDuplicate ? { isDuplicate } : {}),
      });
    // 11-13 기준 — 3일 안 경기는 11-12 친선뿐(제외)
    await run("2026-11-13T22:10:00.000Z");
    expect(fake.calls).toEqual([`last5:${UNION}`]);
    // 10-29 기준이라면 — 10-27 DFB Pokal(69715)을 받는다(6개 대회 분데스는 날짜 조회 몫)
    fake.calls.length = 0;
    await run("2026-10-29T22:10:00.000Z");
    expect(fake.calls).toEqual([`last5:${UNION}`, "match:1394417897"]);
    // 같은 경기가 원장에 af-로 있으면(교체 전) 받지 않는다
    fake.calls.length = 0;
    await run("2026-10-29T22:10:00.000Z", (f) => f.matchId === 1394417897);
    expect(fake.calls).toEqual([`last5:${UNION}`]);
  });
});

describe("단계 — 호출 순서(브리핑 몫 먼저: 상세 + 한국 선수 경기 박스스코어 → 라인업 → 나머지 → 탐색)", () => {
  it("날짜 × 대회 조회 → 상세·박스(한국)·상세 → [브리핑 신호] → 라인업 → 미종료는 이월 · 박스스코어는 한국 선수 경기만", async () => {
    const fake = fakeClient({
      lists: { [`${D}/67162`]: [MZ_BY, OTHER], [`${D}/33973`]: [LATE] },
      details: { 101: detailOf(MZ_BY), 102: detailOf(OTHER) },
      lastFive: { [BRENTFORD]: [] },
    });
    const order: string[] = [];
    const result = await runHighlightlyStage(
      stageInput(fake, {
        onBriefReady: (s) =>
          order.push(
            `brief:${s.reason}:${s.details.map((d) => d.matchId).join(",")}`,
          ),
      }),
    );
    expect(fake.calls).toEqual([
      `list:${D}/67162`,
      `list:${D}/33973`,
      "match:101",
      "box:101",
      "match:102",
      "lineups:101",
      "lineups:102",
      `last5:${BRENTFORD}`, // 마인츠는 날짜 조회에 나왔다 — 브렌트퍼드만 탐색
    ]);
    expect(order).toEqual(["brief:complete:101,102"]);
    expect(result.planned).toEqual({ brief: 2, window: 0, requery: 0 });
    expect(result.dates).toEqual([
      { date: D, ok: true, listed: 3, invalid: 0 },
    ]);
    expect(result.details.map((d) => [d.matchId, d.provider, d.comp])).toEqual([
      [101, "highlightly", "BUNDESLIGA"],
      [102, "highlightly", "BUNDESLIGA"],
    ]);
    expect(result.pending.map((p) => [p.id, p.status, p.comp])).toEqual([
      [103, "2H", "EPL"],
    ]);
    expect(result.listed.map((l) => [l.matchId, l.ft])).toEqual([
      [101, { home: 1, away: 2 }],
      [102, { home: 1, away: 0 }],
      [103, null],
    ]);
    // 브리핑 몫의 한국 선수 경기 — 박스스코어로 출전 상태(라인업 전)
    const brief = result.brief.details.find((d) => d.matchId === 101)!;
    expect(playerAppearance(brief, 468020, MAINZ)).toMatchObject({
      status: "start",
      minutes: 63,
    });
    // 최종 상세 — 라인업(포메이션) + 박스스코어 분
    const full = result.details.find((d) => d.matchId === 101)!;
    expect(full.lineups.home?.formation).toBe("4-4-2");
    expect(result.stoppedBy).toBeNull();
  });

  it("컷오프 — 다음 요청이 컷오프 안에 끝나지 않으면 그때까지 받은 몫만 넘기고 나머지는 계속 받는다", async () => {
    const fake = fakeClient({
      lists: { [`${D}/67162`]: [MZ_BY, OTHER] },
      details: { 101: detailOf(MZ_BY), 102: detailOf(OTHER) },
      tick: 1000,
    });
    const snaps: string[] = [];
    const result = await runHighlightlyStage(
      stageInput(fake, {
        // 목록 2건(2초) + 상세 101(3초) 뒤 → 박스 101 시작 전 3s + 슬롯 2s > 4.5s
        briefCutoffAt: 4_500,
        requestSlotMs: 2_000,
        discover: false,
        onBriefReady: (s) =>
          snaps.push(`${s.reason}:${s.details.length}:${s.missing.join(",")}`),
      }),
    );
    expect(snaps).toEqual(["cutoff:1:102"]);
    expect(result.details).toHaveLength(2);
    expect(result.brief.reason).toBe("cutoff");
  });

  it("컷오프 — 목록 조회만으로 컷오프를 넘기면 득점자 없이 브리핑을 먼저 보내고(상세 0) 목록·상세는 계속 받는다", async () => {
    const fake = fakeClient({
      lists: { [`${D}/67162`]: [MZ_BY, OTHER] },
      details: { 101: detailOf(MZ_BY), 102: detailOf(OTHER) },
      tick: 1000,
    });
    const snaps: string[] = [];
    const result = await runHighlightlyStage(
      stageInput(fake, {
        // 첫 목록 요청 전 0s + 슬롯 2s > 1.5s → 목록 단계에서 바로 컷오프
        briefCutoffAt: 1_500,
        requestSlotMs: 2_000,
        discover: false,
        onBriefReady: (s) =>
          snaps.push(`${s.reason}:${s.details.length}:${s.missing.join(",")}`),
      }),
    );
    expect(snaps).toEqual(["cutoff:0:"]);
    expect(result.brief.reason).toBe("cutoff");
    expect(result.details).toHaveLength(2);
  });

  it("탐색 — 날짜 조회에 없는 한국 선수 소속팀의 최근 5경기 중 6개 대회 밖·3일 안·종료·친선 아님·원장에 없는 경기만", async () => {
    const cup = hlItem({
      id: 201,
      leagueId: 70001,
      leagueName: "FA Cup",
      date: "2026-11-06T19:45:00.000Z",
      home: [BRENTFORD, "Brentford"],
      away: [5, "Luton"],
      score: "2 - 1",
    });
    const old = hlItem({
      id: 202,
      leagueId: 70001,
      leagueName: "FA Cup",
      date: "2026-11-01T19:45:00.000Z",
      home: [BRENTFORD, "Brentford"],
      away: [6, "Bury"],
    });
    const friendly = hlItem({
      id: 203,
      leagueId: 70002,
      leagueName: "Club Friendlies",
      date: "2026-11-06T12:00:00.000Z",
      home: [BRENTFORD, "Brentford"],
      away: [7, "X"],
    });
    const league = hlItem({
      id: 204,
      leagueId: 33973,
      date: "2026-11-06T15:00:00.000Z",
      home: [BRENTFORD, "Brentford"],
      away: [8, "Y"],
    });
    const dup = hlItem({
      id: 205,
      leagueId: 70003,
      leagueName: "EFL Cup",
      date: "2026-11-05T19:45:00.000Z",
      home: [BRENTFORD, "Brentford"],
      away: [9, "Z"],
    });
    const fake = fakeClient({
      lists: { [`${D}/67162`]: [MZ_BY] },
      details: {
        101: detailOf(MZ_BY),
        201: detailOf(cup, [
          hlEvent({ team: BRENTFORD, time: "10", type: "Goal", playerId: 1 }),
          hlEvent({ team: BRENTFORD, time: "50", type: "Goal", playerId: 2 }),
          hlEvent({ team: 5, time: "70", type: "Goal", playerId: 3 }),
        ]),
      },
      lastFive: { [BRENTFORD]: [cup, old, friendly, league, dup] },
    });
    const result = await runHighlightlyStage(
      stageInput(fake, { isDuplicate: (f) => f.matchId === 205 }),
    );
    expect(fake.calls.slice(-4)).toEqual([
      `last5:${BRENTFORD}`,
      "match:201",
      "box:201",
      "lineups:201",
    ]);
    const found = result.details.find((d) => d.matchId === 201)!;
    expect(found).toMatchObject({
      comp: null,
      leagueName: "FA Cup",
      goalsComplete: true,
    });
    expect(result.counts.koreanOther).toBe(1);
    expect(result.counts.known).toBe(1); // 205 — 다른 프로바이더 원장과 같은 경기
    expect(result.planned.window).toBe(1);
  });

  it("목록 plan 제한 → FR-65 강등(재시도 없음) · 남은 요청 없음 · 날짜 실패 · 이슈 source:highlightly", async () => {
    const fake = fakeClient({
      fail: (kind) =>
        kind === "list"
          ? new HighlightlyError(
              "plan",
              "Highlightly 목록 조회 응답 plan 제한: upgrade",
            )
          : null,
    });
    const result = await runHighlightlyStage(stageInput(fake));
    expect(fake.calls).toEqual([`list:${D}/67162`]);
    expect(result.stoppedBy).toBe("plan");
    expect(result.degraded).toMatchObject({ kind: "plan", endpoint: "date" });
    expect(result.dates).toEqual([
      expect.objectContaining({ date: D, ok: false, errorType: "plan" }),
    ]);
    expect(result.brief.reason).toBe("stopped");
    const payloads = highlightlyIssuePayloads(result.issues, {
      occurredAt: NOW.toISOString(),
      runId: "r",
    });
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      sourceId: "highlightly",
      sourceName: "Highlightly",
      errorType: "plan",
    });
  });

  it("우리 쪽 호출 상한(cap) — 그 뒤 경기는 보내지 않고(deferred) 이월에 남는다", async () => {
    const fake = fakeClient({
      lists: { [`${D}/67162`]: [MZ_BY, OTHER] },
      details: { 101: detailOf(MZ_BY), 102: detailOf(OTHER) },
      fail: (kind, arg) =>
        kind === "match" && arg === 102
          ? new HighlightlyError("cap", "상한")
          : null,
    });
    const result = await runHighlightlyStage(
      stageInput(fake, { leagues: [LEAGUES[0]!] }),
    );
    expect(result.stoppedBy).toBe("cap");
    expect(result.outcomes.map((o) => [o.task.id, o.result.kind])).toEqual([
      [101, "fetched"],
      [102, "deferred"],
    ]);
    expect(result.pending.map((p) => [p.id, p.requeries])).toEqual([[102, 0]]);
    // 받은 101은 라인업 없이(멈춤) — 원장이 불완전 항목으로 다시 받는다
    expect(
      result.details.find((d) => d.matchId === 101)!.lineups.home?.formation ??
        null,
    ).toBeNull();
  });

  it("백필(한국 선수 경기만) — 소속팀이 없는 경기는 받지 않는다 · 탐색 끔", async () => {
    const fake = fakeClient({
      lists: { [`${D}/67162`]: [MZ_BY, OTHER] },
      details: { 101: detailOf(MZ_BY) },
    });
    const result = await runHighlightlyStage(
      stageInput(fake, { koreanOnly: true, discover: false }),
    );
    expect(fake.calls).toEqual([
      `list:${D}/67162`,
      `list:${D}/33973`,
      "match:101",
      "box:101",
      "lineups:101",
    ]);
    expect(result.details.map((d) => d.matchId)).toEqual([101]);
  });

  it("백필 팀 시즌 목록(teamSeason) — 팀마다 홈·원정 2건(모든 대회), 날짜 범위 안 경기만 · 라인업 생략(skipLineups)", async () => {
    const cup = hlItem({
      id: 301,
      leagueId: 69715,
      leagueName: "DFB Pokal",
      date: "2026-11-05T19:45:00.000Z",
      home: [7, "Köln"],
      away: [MAINZ, "Mainz"],
      score: "0 - 2",
    });
    const outside = hlItem({
      id: 302,
      leagueId: 67162,
      date: "2026-10-31T14:30:00.000Z",
      home: [MAINZ, "Mainz"],
      away: [8, "X"],
    });
    const calls: string[] = [];
    const client: HlStageInput["client"] = {
      listMatches: async (q) => {
        calls.push(
          `list:${q.season}/${q.homeTeamId ?? "-"}/${q.awayTeamId ?? "-"}`,
        );
        return q.homeTeamId === MAINZ ? [MZ_BY, outside] : [cup];
      },
      lastFiveGames: async () => [],
      getMatch: async (id) => {
        calls.push(`match:${id}`);
        return id === 101 ? MZ_BY : id === 301 ? cup : null;
      },
      getLineups: async (id) => {
        calls.push(`lineups:${id}`);
        return null;
      },
      getBoxScore: async (id) => {
        calls.push(`box:${id}`);
        return null;
      },
    };
    const result = await runHighlightlyStage({
      ...stageInput(fakeClient({}), {
        dates: ["2026-11-05", "2026-11-06", "2026-11-07"],
        briefWindow: { start: NOW.toISOString(), end: NOW.toISOString() },
        teamSeason: { season: 2026, teamIds: [MAINZ] },
        koreanOnly: true,
        discover: false,
        skipLineups: true,
      }),
      client,
    });
    expect(calls).toEqual([
      `list:2026/${MAINZ}/-`,
      `list:2026/-/${MAINZ}`,
      "match:301",
      "box:301",
      "match:101",
      "box:101",
    ]);
    expect(result.dates.map((d) => [d.date, d.ok, d.listed])).toEqual([
      ["2026-11-05", true, 1],
      ["2026-11-06", true, 0],
      ["2026-11-07", true, 1],
    ]);
    expect(result.details.map((d) => [d.matchId, d.comp])).toEqual([
      [301, null],
      [101, "BUNDESLIGA"],
    ]);
    expect(result.planned).toEqual({ brief: 0, window: 2, requery: 0 });
  });

  it("이미 받은 경기(원장 hl-)·다른 프로바이더 원장과 같은 경기는 다시 받지 않는다", async () => {
    const fake = fakeClient({
      lists: { [`${D}/67162`]: [MZ_BY, OTHER] },
      details: { 102: detailOf(OTHER) },
    });
    const result = await runHighlightlyStage(
      stageInput(fake, {
        leagues: [LEAGUES[0]!],
        known: new Set([101]),
        discover: false,
      }),
    );
    expect(fake.calls).toEqual([`list:${D}/67162`, "match:102", "lineups:102"]);
    expect(result.counts.known).toBe(1);
    const dup = fakeClient({ lists: { [`${D}/67162`]: [MZ_BY] } });
    await runHighlightlyStage(
      stageInput(dup, {
        leagues: [LEAGUES[0]!],
        discover: false,
        isDuplicate: () => true,
      }),
    );
    expect(dup.calls).toEqual([`list:${D}/67162`]);
  });

  it("연속 실패 3회면 차단기(breaker)로 멈춘다", async () => {
    const items = [101, 102, 104, 105].map((id) =>
      hlItem({
        id,
        leagueId: 67162,
        date: `${D}T12:00:00.000Z`,
        home: [id, "H"],
        away: [id + 1000, "A"],
      }),
    );
    const fake = fakeClient({
      lists: { [`${D}/67162`]: items },
      fail: (kind) =>
        kind === "match" ? new HighlightlyError("timeout", "느림") : null,
    });
    const result = await runHighlightlyStage(
      stageInput(fake, { leagues: [LEAGUES[0]!], discover: false }),
    );
    expect(result.stoppedBy).toBe("breaker");
    expect(result.outcomes.map((o) => o.result.kind)).toEqual([
      "failed",
      "failed",
      "failed",
      "deferred",
    ]);
  });
});
