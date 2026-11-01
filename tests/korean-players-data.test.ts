/**
 * M3-02·M3-03 한국 선수 현황 파생 파일(scripts/lib/korean-players-data.ts — PRD FR-61·FR-62·FR-64·FR-65, §15 D27·D33·D65).
 * 네트워크·실호출 없음 — 합성 원장·대회 파일 발췌(fixtures/players/korean-build.json).
 *
 * 필수 항목: 로그 추출(선발·교체·벤치·제외·unknown, 홈/원정·소속팀 기준 스코어, 자책골·PK, 승부차기 경기), 시즌 집계(playerSince
 * 경계·UTC 날짜, 분을 모르는 출전 → null, OTHER 대회 여럿 = leagueRaw 키), 다음 경기 선택, 기록 시점 소속·이적 단서, active:false,
 * 폴백(errors.plan 강등 = 메타 gaps degraded), updatedAt·generatedAt 유지, 미등록 이름 후보.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  CompetitionFileSchema,
  KoreanPlayersDataFileSchema,
  KoreanPlayersFileSchema,
  MatchLedgerFileSchema,
  MatchLedgerMetaSchema,
  TeamIdsFileSchema,
  type CompId,
  type LedgerMatch,
} from "@/lib/schema";

import {
  appearanceOf,
  appearedIn,
  buildKoreanPlayersFile,
  fallbackOf,
  nextMatchOf,
  playerLedgerEntries,
  playerMatchLogOf,
  recordedTeamOf,
  seasonStatsOf,
  teamMismatchOf,
  type KoreanPlayersBuildInput,
  type LogContext,
} from "../scripts/lib/korean-players-data";
import type { MatchDetail } from "../scripts/lib/match-data";
import {
  koreanPlayerTargets,
  koreanRowsOf,
  toLedgerMatch,
} from "../scripts/lib/match-ledger";
import { afToSlugOf } from "../scripts/lib/team-files";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const FixtureSchema = z.object({
  now: z.string(),
  players: KoreanPlayersFileSchema,
  teamIds: TeamIdsFileSchema,
  teamNames: z.record(z.string(), z.string()),
  meta: MatchLedgerMetaSchema,
  ledger: z.array(MatchLedgerFileSchema),
  competitions: z.record(
    z.string(),
    z.object({ matches: CompetitionFileSchema.shape.matches }),
  ),
});
const FX = FixtureSchema.parse(
  JSON.parse(
    readFileSync(path.join(ROOT, "fixtures/players/korean-build.json"), "utf8"),
  ),
);
const LEDGER: LedgerMatch[] = FX.ledger.flatMap((f) => f.matches);
const COMPS = FX.competitions as Partial<
  Record<CompId, { matches: (typeof FX.competitions)[string]["matches"] }>
>;
const AF_TO_SLUG = afToSlugOf(FX.teamIds);
const CTX: LogContext = { afToSlug: AF_TO_SLUG, competitions: COMPS };
const TEAM_NAMES = new Map(Object.entries(FX.teamNames));

function input(
  over: Partial<KoreanPlayersBuildInput> = {},
): KoreanPlayersBuildInput {
  return {
    players: FX.players,
    teamIds: FX.teamIds,
    ledger: LEDGER,
    meta: FX.meta,
    competitions: COMPS,
    teamNames: TEAM_NAMES,
    previous: null,
    now: FX.now,
    ...over,
  };
}

const byId = (id: string) => {
  const m = LEDGER.find((x) => x.id === id);
  if (!m) throw new Error(`fixture에 ${id} 없음`);
  return m;
};
const logOf = (id: string) => {
  const m = byId(id);
  return playerMatchLogOf(m, m.korean[0]!, CTX);
};

describe("appearanceOf — 출전 상태 → started·minutes (D33 ②)", () => {
  it("선발·교체는 원장 분, 벤치·제외는 0, 라인업 없음은 null", () => {
    expect(appearanceOf({ status: "start", minutes: 90 })).toEqual({
      started: true,
      minutes: 90,
    });
    expect(appearanceOf({ status: "sub", minutes: 13 })).toEqual({
      started: false,
      minutes: 13,
    });
    expect(appearanceOf({ status: "bench", minutes: 0 })).toEqual({
      started: false,
      minutes: 0,
    });
    expect(appearanceOf({ status: "absent", minutes: null })).toEqual({
      started: false,
      minutes: 0,
    });
    expect(appearanceOf({ status: "unknown", minutes: null })).toEqual({
      started: null,
      minutes: null,
    });
  });
});

describe("playerMatchLogOf — 원장 행 → 경기 로그 (FR-62)", () => {
  it("홈 선발 — 대회 파일 경기 id(fd-)로 잇고 상대 slug·소속팀 기준 스코어", () => {
    expect(logOf("af-11")).toEqual({
      matchId: "fd-11",
      comp: "BUNDESLIGA",
      kickoff: "2026-10-19T13:30:00.000Z",
      opponent: { slug: "example-city", name: "Example City" },
      home: true,
      result: { for: 2, against: 1 },
      status: "start",
      started: true,
      minutes: 90,
      goals: 1,
      assists: 1,
    });
  });

  it("원정 교체 — 스코어를 소속팀 기준으로 뒤집는다", () => {
    expect(logOf("af-12")).toMatchObject({
      matchId: "fd-12",
      comp: "UCL",
      home: false,
      result: { for: 1, against: 1 },
      status: "sub",
      started: false,
      minutes: 20,
    });
    expect(logOf("af-15")).toMatchObject({
      matchId: "fd-15",
      home: false,
      result: { for: 0, against: 1 },
      // 명단 제외 — 원장 분 null도 0으로(벤치와 같은 started·minutes, status로만 나뉜다 — 2026-11-01)
      status: "absent",
      started: false,
      minutes: 0,
      goals: 0,
    });
  });

  it("컵 대회(comp null) — OTHER + leagueRaw 원문, 대응표 밖 상대는 slug null + 원문 이름, 원장 키를 id로", () => {
    expect(logOf("af-14")).toEqual({
      matchId: "af-14",
      comp: "OTHER",
      leagueRaw: "DFB Pokal",
      kickoff: "2026-10-28T17:00:00.000Z",
      opponent: { slug: null, name: "Lower League FC" },
      home: false,
      // 승부차기 경기 — 스코어는 정규시간 + 연장(승부차기 제외, match-data.ts 공통 규칙), 승부차기는 pens(소속팀 기준 — M3-07)
      result: { for: 1, against: 1, pens: { for: 4, against: 3 } },
      status: "bench",
      started: false,
      minutes: 0,
      goals: 0,
      assists: 0,
    });
  });

  it("라인업 없음(unknown) — 출전 여부·분은 null, 골은 원장 값", () => {
    expect(logOf("af-16")).toMatchObject({
      comp: "OTHER",
      leagueRaw: "League Cup",
      status: "unknown",
      started: null,
      minutes: null,
      goals: 1,
    });
  });

  it("킥오프 차가 3시간을 넘거나 팀 slug를 모르면 원장 키를 쓴다", () => {
    const m = byId("af-13");
    expect(
      playerMatchLogOf(
        { ...m, kickoff: "2026-10-25T18:00:00.000Z" },
        m.korean[0]!,
        CTX,
      ).matchId,
    ).toBe("af-13");
    expect(logOf("af-13").matchId).toBe("fd-13");
  });

  it("승부차기 경기는 result.pens = 소속팀 기준 승부차기 스코어, 아니면 키 없음 (M3-07)", () => {
    const m = byId("af-16");
    const away = { ...m.korean[0]!, side: "away" as const };
    const pk: LedgerMatch = {
      ...m,
      status: "PEN",
      ft: { home: 1, away: 1 },
      pens: { home: 5, away: 4 },
      korean: [away],
    };
    expect(playerMatchLogOf(pk, away, CTX).result).toEqual({
      for: 1,
      against: 1,
      pens: { for: 4, against: 5 },
    });
    expect(logOf("af-16").result).not.toHaveProperty("pens");
  });

  it("자책골은 골이 아니고 PK는 골이다 — 경기 상세 → 원장 행(koreanRowsOf) → 로그", () => {
    const player = (id: number, name: string, minutes: number) => ({
      id,
      name,
      minutes,
      number: null,
      pos: null,
      grid: null,
    });
    const detail: MatchDetail = {
      provider: "api-football",
      matchId: 77,
      leagueId: 78,
      leagueName: "Bundesliga",
      comp: "BUNDESLIGA",
      season: 2026,
      round: "Regular Season - 9",
      kickoff: "2026-10-31T14:30:00.000Z",
      status: "FT",
      home: { id: 101, name: "Sample United", fullName: null },
      away: { id: 102, name: "Example City", fullName: null },
      score: {
        ft: { home: 1, away: 1 },
        ht: null,
        regular: { home: 1, away: 1 },
        pens: null,
        duration: "REGULAR",
      },
      goals: [
        {
          minute: 30,
          extra: null,
          side: "away",
          kind: "own-goal",
          scorer: { id: 9001, name: "T. Player" },
          assist: null,
        },
        {
          minute: 88,
          extra: null,
          side: "home",
          kind: "penalty",
          scorer: { id: 9001, name: "T. Player" },
          assist: null,
        },
      ],
      goalsComplete: true,
      lineups: {
        home: {
          formation: "4-4-2",
          startXI: [player(9001, "T. Player", 90)],
          substitutes: [],
        },
        away: { formation: "4-4-2", startXI: [], substitutes: [] },
      },
      fetchedAt: "2026-11-01T00:00:00.000Z",
    };
    const { tracked } = koreanPlayerTargets(FX.players, FX.teamIds);
    const rows = koreanRowsOf(detail, tracked);
    const ledger = toLedgerMatch(detail, rows);
    const log = playerMatchLogOf(ledger, ledger.korean[0]!, CTX);
    expect(log).toMatchObject({ started: true, minutes: 90, goals: 1 });
  });
});

describe("playerLedgerEntries — 집계 범위(playerSince·시즌, UTC 날짜)", () => {
  it("최신순, playerSince(UTC 날짜) 앞 경기는 뺀다 — 10-18 UTC 경기 제외", () => {
    const ids = playerLedgerEntries(LEDGER, 9001, {
      season: 2026,
      since: "2026-10-19",
    }).map((e) => e.match.id);
    expect(ids).toEqual(["af-16", "af-15", "af-14", "af-13", "af-12", "af-11"]);
  });

  it("경계는 KST가 아니라 UTC 날짜 — 10-18 23:30Z(KST 10-19 08:30)는 빼고 10-19 00:30Z는 넣는다", () => {
    const base = byId("af-11");
    const late = { ...base, id: "af-90", kickoff: "2026-10-18T23:30:00.000Z" };
    const early = { ...base, id: "af-91", kickoff: "2026-10-19T00:30:00.000Z" };
    const ids = playerLedgerEntries([late, early], 9001, {
      season: 2026,
      since: "2026-10-19",
    }).map((e) => e.match.id);
    expect(ids).toEqual(["af-91"]);
  });

  it("다른 시즌 경기는 뺀다(season null은 넣는다)", () => {
    const base = byId("af-11");
    const ids = playerLedgerEntries(
      [
        { ...base, id: "af-92", season: 2025 },
        { ...base, id: "af-93", season: null },
      ],
      9001,
      { season: 2026, since: "2026-10-01" },
    ).map((e) => e.match.id);
    expect(ids).toEqual(["af-93"]);
  });
});

describe("seasonStatsOf — 대회별 시즌 누적 (FR-61 자체 집계)", () => {
  const logs = playerLedgerEntries(LEDGER, 9001, {
    season: 2026,
    since: "2026-10-19",
  }).map((e) => playerMatchLogOf(e.match, e.row, CTX));

  it("설정 리그 → UCL → OTHER(leagueRaw 순), 벤치·제외만 있는 대회도 apps 0 행, 분을 모르는 출전이 있으면 minutes null", () => {
    expect(seasonStatsOf(logs, "BUNDESLIGA")).toEqual([
      { comp: "BUNDESLIGA", apps: 2, minutes: 160, goals: 1, assists: 1 },
      { comp: "UCL", apps: 1, minutes: 20, goals: 0, assists: 0 },
      {
        comp: "OTHER",
        leagueRaw: "DFB Pokal",
        apps: 0,
        minutes: 0,
        goals: 0,
        assists: 0,
      },
      {
        comp: "OTHER",
        leagueRaw: "League Cup",
        apps: 1,
        minutes: null,
        goals: 1,
        assists: 0,
      },
    ]);
  });

  it("출전 판정 — 선발·분 > 0·골·도움", () => {
    expect(
      appearedIn({ started: false, minutes: 0, goals: 0, assists: 0 }),
    ).toBe(false);
    expect(
      appearedIn({ started: null, minutes: null, goals: 0, assists: 1 }),
    ).toBe(true);
    expect(
      appearedIn({ started: true, minutes: null, goals: 0, assists: 0 }),
    ).toBe(true);
  });
});

describe("nextMatchOf — football-data 일정의 다음 경기 (FR-61)", () => {
  it("예정 경기 중 지금 뒤 가장 이른 경기(대회 무관) — 지난 예정 경기(갱신 안 된 표)는 건너뛴다", () => {
    expect(nextMatchOf("sample-united", COMPS, TEAM_NAMES, FX.now)).toEqual({
      matchId: "fd-22",
      comp: "UCL",
      kickoff: "2026-11-04T20:00:00Z",
      opponent: { slug: "example-city", name: "Example City FC" },
      home: true,
    });
    expect(
      nextMatchOf("sample-united", COMPS, TEAM_NAMES, "2026-10-31T12:00:00Z")
        ?.matchId,
    ).toBe("fd-20");
  });

  it("일정이 없으면 null", () => {
    expect(nextMatchOf("nobody-fc", COMPS, TEAM_NAMES, FX.now)).toBeNull();
  });
});

describe("recordedTeamOf · teamMismatchOf — 기록 시점 소속·이적 단서 (FR-63 입력)", () => {
  const entries = playerLedgerEntries(LEDGER, 9001, {
    season: 2026,
    since: "2026-10-19",
  });

  it("라인업에 있던 최근 경기(제외·unknown 행은 근거 아님)의 팀 — 설정과 같으면 단서 없음", () => {
    const r = recordedTeamOf(entries, "sample-united", AF_TO_SLUG);
    expect(r.team).toBe("sample-united");
    expect(r.evidence?.matchId).toBe("af-14");
    expect(
      teamMismatchOf({ slug: "test-player", team: "sample-united" }, r, 101),
    ).toBeNull();
  });

  it("다른 팀 라인업에 있으면 그 팀 slug + 단서", () => {
    const moved = {
      ...byId("af-13"),
      id: "af-95",
      kickoff: "2026-11-01T18:00:00.000Z",
      korean: [
        {
          player: 9001,
          side: "away" as const,
          status: "start" as const,
          minutes: 90,
          goals: 0,
          assists: 0,
        },
      ],
    };
    const e = playerLedgerEntries([...LEDGER, moved], 9001, {
      season: 2026,
      since: "2026-10-19",
    });
    const r = recordedTeamOf(e, "sample-united", AF_TO_SLUG);
    expect(r.team).toBe("example-city");
    expect(
      teamMismatchOf({ slug: "test-player", team: "sample-united" }, r, 101),
    ).toEqual({
      player: "test-player",
      configTeam: "sample-united",
      observedTeam: "example-city",
      observedTeamName: "Example City",
      matchId: "af-95",
      kickoff: "2026-11-01T18:00:00.000Z",
    });
  });
});

describe("fallbackOf — FR-65 폴백(errors.plan 강등 = 메타 gaps degraded)", () => {
  const logs = [{ matchId: "fd-15", kickoff: "2026-10-31T14:30:00Z" }];
  const comps = {
    BUNDESLIGA: {
      matches: [
        ...COMPS.BUNDESLIGA!.matches,
        {
          id: "fd-31",
          comp: "BUNDESLIGA" as const,
          round: "11",
          kickoff: "2026-11-02T14:30:00Z",
          home: "sample-united",
          away: "example-city",
          score: { h: 1, a: 1 },
          status: "finished" as const,
        },
      ],
    },
  };

  it("강등된 날 소속팀 종료 경기가 원장에 없고 마지막 로그보다 새것이면 폴백", () => {
    expect(
      fallbackOf({
        team: "sample-united",
        since: "2026-10-19",
        logs,
        degraded: new Set(["2026-11-02"]),
        competitions: comps,
      }),
    ).toBe(true);
  });

  it("강등이 없거나, 그날 원장 로그가 있거나, 더 새 원장 로그가 있으면 폴백 아님", () => {
    const base = {
      team: "sample-united",
      since: "2026-10-19",
      competitions: comps,
    };
    expect(fallbackOf({ ...base, logs, degraded: new Set() })).toBe(false);
    expect(
      fallbackOf({
        ...base,
        logs: [...logs, { matchId: "fd-31", kickoff: "2026-11-02T14:30:00Z" }],
        degraded: new Set(["2026-11-02"]),
      }),
    ).toBe(false);
    expect(
      fallbackOf({
        ...base,
        logs: [...logs, { matchId: "af-99", kickoff: "2026-11-05T14:30:00Z" }],
        degraded: new Set(["2026-11-02"]),
      }),
    ).toBe(false);
  });

  it("파일 — 강등된 날이 메타 gaps에 있으면 provider fallback(출전·골을 지어내지 않고 로그는 원장 것만)", () => {
    const build = buildKoreanPlayersFile(
      input({
        meta: {
          ...FX.meta,
          gaps: [{ date: "2026-11-02", reason: "degraded", cause: "plan" }],
        },
        competitions: { ...COMPS, ...comps },
        now: "2026-11-03T00:00:00.000Z",
      }),
    );
    const rec = build.file.players.find((p) => p.slug === "test-player")!;
    expect(rec.provider).toBe("fallback");
    expect(rec.recent.map((l) => l.matchId)).not.toContain("fd-31");
    expect(build.fallback).toEqual(["test-player"]);
  });
});

describe("buildKoreanPlayersFile — data/players/korean.json (M3-03)", () => {
  it("설정 순서로 전원 — 집계 시작일 복사, 최근 5경기(최신순), 시즌 누적, 다음 경기", () => {
    const build = buildKoreanPlayersFile(input());
    const file = KoreanPlayersDataFileSchema.parse(build.file);
    expect(file.season).toBe(2026);
    expect(file.since).toBe("2026-10-18");
    expect(file.players.map((p) => p.slug)).toEqual([
      "test-player",
      "no-id-player",
      "gone-player",
    ]);
    const rec = file.players[0]!;
    expect(rec.since).toBe("2026-10-19");
    expect(rec.team).toBe("sample-united");
    expect(rec.provider).toBe("api-football");
    expect(rec.recent.map((l) => l.matchId)).toEqual([
      "af-16",
      "fd-15",
      "af-14",
      "fd-13",
      "fd-12",
    ]);
    expect(rec.season).toHaveLength(4);
    expect(rec.next?.matchId).toBe("fd-22");
    expect(rec.updatedAt).toBe(FX.now);
    expect(build.teamMismatches).toEqual([]);
  });

  it("id 없는 선수는 기록 없이(since null) 다음 경기만", () => {
    const rec = buildKoreanPlayersFile(input()).file.players[1]!;
    expect(rec).toMatchObject({
      slug: "no-id-player",
      team: "example-city",
      since: null,
      season: [],
      recent: [],
    });
    expect(rec.next).toMatchObject({ matchId: "fd-22", home: false });
  });

  it("active:false(FR-64) — 이전 레코드를 그대로 두고, 없으면 빈 레코드", () => {
    const first = buildKoreanPlayersFile(input()).file;
    expect(first.players[2]).toEqual({
      slug: "gone-player",
      team: "faraway-fc",
      provider: "api-football",
      since: null,
      season: [],
      recent: [],
      next: null,
      updatedAt: FX.now,
    });
    const kept = {
      ...first.players[2]!,
      season: [
        { comp: "OTHER" as const, apps: 3, minutes: 200, goals: 1, assists: 0 },
      ],
      updatedAt: "2026-08-31T00:00:00.000Z",
    };
    const previous = {
      ...first,
      players: [first.players[0]!, first.players[1]!, kept],
    };
    const build = buildKoreanPlayersFile(
      input({ previous, now: "2026-11-05T00:00:00.000Z" }),
    );
    expect(build.file.players[2]).toEqual(kept);
    expect(build.frozen).toEqual(["gone-player"]);
  });

  it("다시 만들어도 같으면 updatedAt·generatedAt 유지, 바뀌지 않음(changed false)", () => {
    const first = buildKoreanPlayersFile(input()).file;
    const again = buildKoreanPlayersFile(
      input({ previous: first, now: "2026-11-02T22:00:00.000Z" }),
    );
    expect(again.changed).toBe(false);
    expect(again.updated).toEqual([]);
    expect(again.file).toEqual(first);
  });

  it("다음 경기만 바뀌면 updatedAt은 그대로(로그가 바뀔 때만 갱신), 새 경기가 원장에 들어오면 그 선수만 갱신", () => {
    const first = buildKoreanPlayersFile(input()).file;
    const later = "2026-11-05T00:00:00.000Z";
    const nextOnly = buildKoreanPlayersFile(
      input({ previous: first, now: later }),
    );
    expect(nextOnly.changed).toBe(true);
    expect(nextOnly.updated).toEqual([]);
    const rec = nextOnly.file.players[0]!;
    expect(rec.next?.matchId).toBe("fd-21");
    expect(rec.updatedAt).toBe(FX.now);
    expect(nextOnly.file.generatedAt).toBe(later);

    const newMatch = {
      ...byId("af-13"),
      id: "af-96",
      kickoff: "2026-11-04T20:00:00.000Z",
    };
    const withMatch = buildKoreanPlayersFile(
      input({ previous: first, now: later, ledger: [...LEDGER, newMatch] }),
    );
    expect(withMatch.updated).toEqual(["test-player"]);
    expect(withMatch.file.players[0]!.updatedAt).toBe(later);
    expect(withMatch.file.players[1]!.updatedAt).toBe(FX.now);
  });

  it("미등록 이름 후보 — slug 없는 상대 팀(team)·컵 대회 원문(competition), 사전에 있는 이름은 뺀다", () => {
    const build = buildKoreanPlayersFile(
      input({ isKnownName: (n) => n === "Other Town" }),
    );
    expect(build.unknownNames).toEqual([
      { name: "League Cup", kind: "competition" },
      { name: "Lower League FC", kind: "team" },
      { name: "DFB Pokal", kind: "competition" },
    ]);
    expect(buildKoreanPlayersFile(input()).unknownNames).toEqual([]);
  });
});
