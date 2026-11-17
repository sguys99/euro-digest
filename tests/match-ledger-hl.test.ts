/**
 * M5-18 원장 `af-`·`hl-` 공존(PRD §15 D80 ②) — 네트워크 없음. Highlightly 실응답 발췌(fixtures/highlightly)로 만든 상세와 합성 항목으로
 * 검증한다. 필수 항목: 키 체계(af-·hl- 왕복·스키마), 달 파일 정렬(같은 킥오프 두 체계), 읽기(known은 그 프로바이더만), 한국 선수 행
 * (highlightlyId · team-ids hl), 선수 시작일(다른 체계 항목은 보지 않음), 백필 공백 유지(healDateGaps), 쓰기(applyLedger hl),
 * 소비자(한국 선수 로그·주간 표·포메이션·팀시트 — 항목 키로 id 체계 선택), 다른 프로바이더 원장과 같은 경기 판정.
 */
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  LedgerMatchSchema,
  MatchLedgerFileSchema,
  RunLogSchema,
  TeamLineupSchema,
  type CompId,
  type KoreanPlayer,
  type LedgerMatch,
  type TeamIdsFile,
} from "@/lib/schema";

import { crossProviderDuplicate } from "../scripts/lib/collect-run";
import {
  DEFAULT_DETAIL_PROVIDER,
  ledgerIdFor,
  ledgerMatchKey,
  parseLedgerMatchKey,
  playerIdFor,
  resolveDetailProvider,
  slugOfLedgerTeam,
  teamToSlugOf,
} from "../scripts/lib/detail-provider";
import {
  playerLedgerEntries,
  recordedTeamOf,
  teamMismatchOf,
} from "../scripts/lib/korean-players-data";
import type { MatchDetail } from "../scripts/lib/match-data";
import {
  afIdOfKey,
  applyLedger,
  buildLedgerEntries,
  koreanPlayerTargets,
  ledgerMatchToDetail,
  ledgerPlanKnown,
  nextLedgerMeta,
  playerStartDate,
  readLedgerMonth,
  readLedgerWindow,
  toLedgerMatch,
  upsertLedgerMonth,
} from "../scripts/lib/match-ledger";
import { toHlMatchDetail } from "../scripts/lib/providers/highlightly";
import {
  formationUsesByTeam,
  teamSheetsFromDetail,
} from "../scripts/lib/team-files";
import { buildWeeklyTable } from "../scripts/lib/weekly-kr";

import { readHlJson } from "./support/highlightly-fake";

const CTX = {
  compByLeague: new Map<number, CompId>([[67162, "BUNDESLIGA"]]),
  fetchedAt: "2026-11-17T22:12:00.000Z",
};
const MAINZ_HL = 140348;
const BAYERN_HL = 134391;

/** 마인츠 1–2 바이에른(1340510451) — 실측 상세·라인업·박스스코어 */
function mainzBayern(): MatchDetail {
  const r = toHlMatchDetail(
    {
      match: readHlJson<unknown[]>("match-1340510451.json")[0],
      lineups: readHlJson("lineups-1340510451.json"),
      box: readHlJson<unknown[]>("box-score-1340510451.json"),
    },
    CTX,
  );
  if (r.kind !== "finished") throw new Error("종료 상세가 아니다");
  return r.detail;
}

const PLAYERS = [
  {
    slug: "lee-jae-sung",
    nameKo: "이재성",
    nameEn: "Jae-sung Lee",
    team: "mainz",
    comp: "BUNDESLIGA",
    position: "MF",
    birthYear: 1992,
    apiFootballId: 2906,
    highlightlyId: 468020,
    active: true,
  },
  {
    slug: "kim-min-jae",
    nameKo: "김민재",
    nameEn: "Min-jae Kim",
    team: "bayern-munchen",
    comp: "BUNDESLIGA",
    position: "DF",
    birthYear: 1996,
    apiFootballId: 2897,
    highlightlyId: 466571,
    active: true,
  },
  {
    slug: "kim-ji-soo",
    nameKo: "김지수",
    nameEn: "Ji-soo Kim",
    team: "brentford",
    comp: "EPL",
    position: "DF",
    birthYear: 2004,
    apiFootballId: null,
    highlightlyId: 57354311,
    active: true,
  },
] as KoreanPlayer[];

const TEAM_IDS: TeamIdsFile = {
  mainz: { fd: 15, af: 164, hl: MAINZ_HL },
  "bayern-munchen": { fd: 5, af: 157, hl: BAYERN_HL },
  brentford: { fd: 402, af: 55, hl: 47589 },
};

/** 원장 항목(합성) */
function entry(
  id: string,
  kickoff: string,
  home: number,
  away: number,
  extra: Partial<LedgerMatch> = {},
): LedgerMatch {
  return LedgerMatchSchema.parse({
    id,
    leagueId: 1,
    league: "Bundesliga",
    comp: "BUNDESLIGA",
    season: 2026,
    round: null,
    kickoff,
    status: "FT",
    home: { id: home, name: "H", formation: "4-4-2" },
    away: { id: away, name: "A", formation: "4-4-2" },
    ft: { home: 0, away: 0 },
    pens: null,
    goals: [],
    goalsComplete: true,
    korean: [],
    fetchedAt: "2026-11-17T22:12:00.000Z",
    ...extra,
  });
}

describe("키 체계 — af-·hl- 공존(D80 ②)", () => {
  it("왕복 · 다른 체계 id는 null · 형식 밖은 null", () => {
    expect(ledgerMatchKey("highlightly", 1340510451)).toBe("hl-1340510451");
    expect(ledgerMatchKey("api-football", 1575180)).toBe("af-1575180");
    expect(parseLedgerMatchKey("hl-1340510451")).toEqual({
      provider: "highlightly",
      id: 1340510451,
    });
    expect(parseLedgerMatchKey("xx-1")).toBeNull();
    expect(ledgerIdFor("hl-5", "api-football")).toBeNull();
    expect(afIdOfKey("hl-5")).toBeNull();
    expect(afIdOfKey("af-5")).toBe(5);
  });

  it("스키마 — hl- 키 통과, 다른 접두사는 오류 · 실행 기록 apiCalls.highlightly는 선택", () => {
    expect(
      LedgerMatchSchema.safeParse(
        entry("hl-1340510451", "2026-11-07T14:30:00.000Z", 1, 2),
      ).success,
    ).toBe(true);
    expect(
      LedgerMatchSchema.safeParse({
        ...entry("af-1", "2026-11-07T14:30:00.000Z", 1, 2),
        id: "xx-1",
      }).success,
    ).toBe(false);
    const run = {
      runId: "collect-prod-20261117T221000Z-1a2b",
      env: "prod",
      job: "collect",
      startedAt: "2026-11-17T22:10:00.000Z",
      finishedAt: "2026-11-17T22:16:00.000Z",
      collected: 1,
      clusters: 1,
      summarized: 0,
      downgraded: 0,
      tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
      costUsd: 0,
      sources: [],
      status: "success",
    };
    expect(
      RunLogSchema.safeParse({
        ...run,
        apiCalls: { footballData: 1, apiFootball: 0 },
      }).success,
    ).toBe(true);
    expect(
      RunLogSchema.safeParse({
        ...run,
        apiCalls: { footballData: 1, apiFootball: 0, highlightly: 42 },
      }).success,
    ).toBe(true);
  });

  it("MATCH_DETAIL_PROVIDER — 기본 highlightly, api-football로 되돌릴 수 있다, 오타는 던진다", () => {
    expect(DEFAULT_DETAIL_PROVIDER).toBe("highlightly");
    expect(resolveDetailProvider(undefined)).toBe("highlightly");
    expect(resolveDetailProvider(" API-Football ")).toBe("api-football");
    expect(() => resolveDetailProvider("highlighty")).toThrow(
      /MATCH_DETAIL_PROVIDER/,
    );
  });

  it("달 파일 — 같은 킥오프의 af·hl 항목은 키 숫자 → 키 문자열 순, 파일 스키마 통과", () => {
    const at = "2026-11-07T14:30:00.000Z";
    const update = upsertLedgerMonth(
      null,
      "2026-11",
      [
        entry("hl-1340510451", at, 1, 2),
        entry("af-1575200", at, 3, 4),
        entry("hl-5", at, 5, 6),
      ],
      "2026-11-17T22:12:00.000Z",
    );
    expect(update.file.matches.map((m) => m.id)).toEqual([
      "hl-5",
      "af-1575200",
      "hl-1340510451",
    ]);
    expect(MatchLedgerFileSchema.safeParse(update.file).success).toBe(true);
  });
});

describe("한국 선수 행 — highlightlyId · team-ids hl", () => {
  it("추적 선수(provider highlightly) — 김지수(af id 없음)도 hl id로 추적, 행은 hl 선수 id", () => {
    const targets = koreanPlayerTargets(PLAYERS, TEAM_IDS, "highlightly");
    expect(targets.tracked).toEqual([
      {
        slug: "lee-jae-sung",
        apiFootballId: 468020,
        teamAf: MAINZ_HL,
        provider: "highlightly",
      },
      {
        slug: "kim-min-jae",
        apiFootballId: 466571,
        teamAf: BAYERN_HL,
        provider: "highlightly",
      },
      {
        slug: "kim-ji-soo",
        apiFootballId: 57354311,
        teamAf: 47589,
        provider: "highlightly",
      },
    ]);
    expect(targets.unidentified).toEqual([]);
    // API-Football 체계로는 김지수가 id 없음(옛 동작 그대로)
    expect(
      koreanPlayerTargets(PLAYERS, TEAM_IDS).unidentified.map((p) => p.slug),
    ).toEqual(["kim-ji-soo"]);

    const build = buildLedgerEntries([mainzBayern()], targets);
    expect(build.invalid).toEqual([]);
    const m = build.entries[0]!;
    expect(m.id).toBe("hl-1340510451");
    expect(m.home.formation).toBe("3-5-2");
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
    expect(JSON.stringify(m)).not.toMatch(/logo|https?:/);
    // 원장 항목 → 상세(브리핑 재사용) — 프로바이더·id 유지
    expect(ledgerMatchToDetail(m)).toMatchObject({
      provider: "highlightly",
      matchId: 1340510451,
    });
    expect(playerIdFor(PLAYERS[2]!, "api-football")).toBeNull();
  });

  it("선수 시작일 — 다른 체계(af-) 항목은 보지 않는다(팀 id 체계가 달라 행이 있을 수 없다)", () => {
    const player = {
      slug: "kim-ji-soo",
      apiFootballId: 57354311,
      teamAf: 47589,
      provider: "highlightly" as const,
    };
    const previous = [
      { ...entry("af-1", "2026-11-05T15:00:00.000Z", 47589, 1) }, // af 숫자가 우연히 같은 팀 id여도 무시
      { ...entry("hl-2", "2026-11-06T15:00:00.000Z", 47589, 1) }, // 같은 체계 · 행 없음 → 다음 날부터
    ];
    expect(
      playerStartDate({
        player,
        base: "2026-11-04",
        previous,
        now: "2026-11-17T22:00:00.000Z",
      }),
    ).toBe("2026-11-07");
  });

  it("백필(한국 선수 경기만)은 날짜 공백을 지우지 않는다(healDateGaps false) — 선수 시작일은 정한다", () => {
    const meta = {
      season: 2026,
      since: "2026-10-19",
      playerSince: {},
      gaps: [
        { date: "2026-11-07", reason: "date-query" as const, cause: "auth" },
      ],
    };
    const facts = {
      now: "2026-11-17T13:00:00.000Z",
      season: 2026,
      dates: [{ date: "2026-11-07", ok: true }],
      skipped: null,
      dropped: [],
      stored: new Set<number>(),
      tracked: koreanPlayerTargets(PLAYERS, TEAM_IDS, "highlightly").tracked,
      previous: [],
    };
    const kept = nextLedgerMeta(meta, { ...facts, healDateGaps: false });
    expect(kept.meta!.gaps).toEqual(meta.gaps);
    expect(kept.meta!.playerSince["kim-ji-soo"]).toBe("2026-11-07");
    const healed = nextLedgerMeta(meta, facts);
    expect(healed.meta!.gaps).toEqual([]);
  });
});

describe("읽기·쓰기 — known은 그 프로바이더 항목만, 쓰기는 hl 키", () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it("af 원장 위에 hl 항목을 쓴다 — 기존 af 항목은 그대로, hl known·incomplete는 hl id", async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-ledger-hl-"));
    const af = entry("af-1575200", "2026-11-02T14:30:00.000Z", 164, 157);
    const now = "2026-11-17T22:12:00.000Z";
    // 원장 시작(af) — 메타 + 달 파일
    const first = await applyLedger({
      dataDir: dir,
      now,
      read: await readLedgerWindow(dir, ["2026-11"]),
      entries: [af],
      facts: {
        season: 2026,
        dates: [{ date: "2026-11-02", ok: true }],
        skipped: null,
        dropped: [],
        tracked: [],
      },
    });
    expect(first.state).toBe("started");

    const hlRead = await readLedgerWindow(dir, ["2026-11"], "highlightly");
    expect([...hlRead.known]).toEqual([]);
    expect(hlRead.previous.map((m) => m.id)).toEqual(["af-1575200"]);
    const targets = koreanPlayerTargets(PLAYERS, TEAM_IDS, "highlightly");
    const build = buildLedgerEntries([mainzBayern()], targets);
    const second = await applyLedger({
      dataDir: dir,
      now,
      read: hlRead,
      entries: build.entries,
      facts: {
        season: 2026,
        dates: [{ date: "2026-11-07", ok: true }],
        skipped: null,
        dropped: [],
        tracked: targets.tracked,
      },
    });
    expect(second.errors).toEqual([]);
    expect(second.unstored).toEqual([]);
    expect(second.months).toEqual([
      expect.objectContaining({ month: "2026-11", added: 1, replaced: 0 }),
    ]);
    const month = await readLedgerMonth(dir, "2026-11");
    expect(month.value!.matches.map((m) => m.id)).toEqual([
      "af-1575200",
      "hl-1340510451",
    ]);

    const afAgain = await readLedgerWindow(dir, ["2026-11"]);
    const hlAgain = await readLedgerWindow(dir, ["2026-11"], "highlightly");
    expect([...afAgain.known]).toEqual([1575200]);
    expect([...hlAgain.known]).toEqual([1340510451]);
    expect([...ledgerPlanKnown(hlAgain, new Set())]).toEqual([1340510451]);
  });
});

describe("소비자 — 항목 키의 체계로 팀·선수 id를 고른다", () => {
  const afToSlug = teamToSlugOf(TEAM_IDS, "api-football");
  const hlToSlug = teamToSlugOf(TEAM_IDS, "highlightly");
  const hlEntry = buildLedgerEntries(
    [mainzBayern()],
    koreanPlayerTargets(PLAYERS, TEAM_IDS, "highlightly"),
  ).entries[0]!;
  const afEntry = entry("af-1575200", "2026-11-02T14:30:00.000Z", 164, 157, {
    korean: [
      {
        player: 2906,
        side: "home",
        status: "sub",
        minutes: 20,
        goals: 1,
        assists: 0,
      },
    ],
  });

  it("팀 slug — af 항목은 af 열, hl 항목은 hl 열(hl 지도가 없으면 모른다)", () => {
    expect(slugOfLedgerTeam({ afToSlug, hlToSlug }, "hl-1", MAINZ_HL)).toBe(
      "mainz",
    );
    expect(slugOfLedgerTeam({ afToSlug, hlToSlug }, "af-1", 164)).toBe("mainz");
    expect(slugOfLedgerTeam({ afToSlug }, "hl-1", MAINZ_HL)).toBeUndefined();
  });

  it("한국 선수 로그 — 이재성 af 행(apiFootballId)과 hl 행(highlightlyId)을 둘 다 찾고, 근거 팀은 hl 체계로 비교", () => {
    const entries = playerLedgerEntries([afEntry, hlEntry], 2906, {
      season: 2026,
      since: "2026-10-19",
      hlId: 468020,
    });
    expect(entries.map((e) => [e.match.id, e.row.status])).toEqual([
      ["hl-1340510451", "start"],
      ["af-1575200", "sub"],
    ]);
    expect(
      playerLedgerEntries([afEntry, hlEntry], 2906, {
        season: 2026,
        since: "2026-10-19",
      }).map((e) => e.match.id),
    ).toEqual(["af-1575200"]);
    const recorded = recordedTeamOf(entries, "mainz", afToSlug, hlToSlug);
    expect(recorded).toMatchObject({
      team: "mainz",
      evidence: {
        matchId: "hl-1340510451",
        teamAf: MAINZ_HL,
        provider: "highlightly",
        slug: "mainz",
      },
    });
    expect(
      teamMismatchOf(
        { slug: "lee-jae-sung", team: "mainz" },
        recorded,
        164,
        MAINZ_HL,
      ),
    ).toBeNull();
    expect(
      teamMismatchOf(
        { slug: "lee-jae-sung", team: "mainz" },
        recorded,
        164,
        999,
      ),
    ).toMatchObject({ observedTeam: "mainz" });
  });

  it("주간 표 — apiFootballId가 없어도 highlightlyId가 있으면 표 행(기록 연결), hl 항목의 경기 줄", () => {
    const table = buildWeeklyTable({
      week: "2026-45",
      range: {
        from: "2026-11-02T15:00:00.000Z",
        to: "2026-11-09T14:59:59.999Z",
      },
      players: PLAYERS,
      ledger: [afEntry, hlEntry],
      playerSince: {
        "lee-jae-sung": "2026-10-19",
        "kim-min-jae": "2026-10-19",
        "kim-ji-soo": "2026-11-04",
      },
      compNames: { BUNDESLIGA: "Bundesliga" },
      links: { afToSlug, hlToSlug, competitions: {} },
    });
    const lee = table.rows.find((r) => r.player.slug === "lee-jae-sung")!;
    expect(
      lee.matches.map((l) => [l.matchId, l.opponentSlug, l.minutes]),
    ).toEqual([["hl-1340510451", "bayern-munchen", 63]]);
    // 김지수 — af id 없음 → 옛 규칙이면 no-api-id, 이제 hl id로 추적(그 주 경기 없음)
    expect(table.excluded.find((e) => e.slug === "kim-ji-soo")).toBeUndefined();
  });

  it("포메이션·팀시트 — hl 항목 팀 slug는 hl 열, 팀시트 경기 키는 hl-<id>, 한국 선수는 highlightlyId", () => {
    const uses = formationUsesByTeam([afEntry, hlEntry], {
      afToSlug,
      hlToSlug,
      season: 2026,
    });
    expect(uses.get("mainz")!.map((u) => [u.match, u.shape])).toEqual([
      ["af-1575200", "4-4-2"],
      ["hl-1340510451", "3-5-2"],
    ]);
    const sheets = teamSheetsFromDetail(mainzBayern(), {
      afToSlug,
      koreanByAfId: new Map([[2906, "lee-jae-sung"]]),
      hlToSlug,
      koreanByHlId: new Map([
        [468020, "lee-jae-sung"],
        [466571, "kim-min-jae"],
      ]),
    });
    expect(sheets.skipped).toEqual([]);
    const mainz = sheets.sheets.find((s) => s.team === "mainz")!;
    expect(TeamLineupSchema.safeParse(mainz.lineup).success).toBe(true);
    expect(mainz.lineup).toMatchObject({
      match: "hl-1340510451",
      formation: "3-5-2",
      opponent: "bayern-munchen",
      side: "home",
    });
    expect(
      mainz.lineup.startXI.find((p) => p.korean === "lee-jae-sung"),
    ).toMatchObject({ grid: "3:4", number: 7 });
    const bayern = sheets.sheets.find((s) => s.team === "bayern-munchen")!;
    expect(
      bayern.lineup.substitutes.find((p) => p.korean === "kim-min-jae"),
    ).toMatchObject({ number: 3, grid: null });
  });

  it("다른 프로바이더 원장과 같은 경기 — 같은 킥오프 + 한쪽 팀 slug(af 원장 ↔ hl 목록)", () => {
    const isDup = crossProviderDuplicate({
      previous: [afEntry],
      teamIds: TEAM_IDS,
    });
    expect(
      isDup({
        kickoff: "2026-11-02T14:30:00.000Z",
        home: { id: MAINZ_HL },
        away: { id: 1 },
      }),
    ).toBe(true);
    expect(
      isDup({
        kickoff: "2026-11-02T17:30:00.000Z",
        home: { id: MAINZ_HL },
        away: { id: 1 },
      }),
    ).toBe(false);
    expect(
      isDup({
        kickoff: "2026-11-02T14:30:00.000Z",
        home: { id: 1 },
        away: { id: 2 },
      }),
    ).toBe(false);
    // hl 항목은 비교 대상이 아니다
    expect(
      crossProviderDuplicate({ previous: [hlEntry], teamIds: TEAM_IDS })({
        kickoff: hlEntry.kickoff,
        home: { id: MAINZ_HL },
        away: { id: BAYERN_HL },
      }),
    ).toBe(false);
    expect(toLedgerMatch(mainzBayern(), []).id).toBe("hl-1340510451");
  });
});
