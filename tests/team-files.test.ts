/**
 * 팀 파일 생성기 (scripts/lib/team-files.ts — M2-06·M2-07, PRD FR-50·FR-54·FR-55, §15 D27·D33·D63).
 * 포메이션 최빈값·동률(최근 우선)·수동 보조·없음 · 팀시트 추출(선발·교체·grid·한국 선수 매칭) · 주요 선수 정렬·상한·잘림 ·
 * 111팀 생성 스키마 적합 · 백필 계획. 네트워크 없음 — fixtures/football·configs만 읽는다.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionFileSchema,
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  TeamColorsFileSchema,
  TeamIdsFileSchema,
  TeamSchema,
  type CompId,
  type LedgerMatch,
  type Scorer,
  type Team,
  type TeamLineup,
} from "@/lib/schema";

import type { MatchDetail } from "../scripts/lib/match-data";
import { toMatchDetail } from "../scripts/lib/providers/api-football";
import {
  MIN_API_USES_OVER_MANUAL,
  afToSlugOf,
  buildTeamFiles,
  formationUsesByTeam,
  koreanByAfIdOf,
  lineupBackfillPriority,
  mainFormation,
  pickLineup,
  planLineupBackfill,
  resolveFormation,
  serializeTeamFile,
  teamSheetsFromDetail,
  topPlayersOf,
  type FormationUse,
  type TeamFilesInput,
} from "../scripts/lib/team-files";
import { allTeamSlugs } from "../scripts/lib/team-leagues";
import { readAfJson } from "./support/api-football-fake";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(`${ROOT}${rel}`, "utf8"));

const teamIds = TeamIdsFileSchema.parse(readJson("configs/team-ids.json"));
const names = NamesKoFileSchema.parse(readJson("configs/names.ko.json"));
const colors = TeamColorsFileSchema.parse(readJson("configs/team-colors.json"));
const koreanPlayers = KoreanPlayersFileSchema.parse(
  readJson("configs/korean-players.json"),
);
const afToSlug = afToSlugOf(teamIds);
const koreanByAfId = koreanByAfIdOf(koreanPlayers);

const BAYERN = 157; // bayern-munchen
const UNION = 182; // union-berlin

// ─── 원장 경기 만들기 ────────────────────────────────────────────────────

let nextId = 2_000_000;
function ledgerMatch(opts: {
  kickoff: string;
  home: [number, string | null];
  away: [number, string | null];
  comp?: CompId | null;
  season?: number | null;
  id?: number;
}): LedgerMatch {
  const id = opts.id ?? nextId++;
  return {
    id: `af-${id}`,
    leagueId: 78,
    league: "Bundesliga",
    comp: opts.comp === undefined ? "BUNDESLIGA" : opts.comp,
    season: opts.season === undefined ? 2026 : opts.season,
    round: "Regular Season - 1",
    kickoff: opts.kickoff,
    status: "FT",
    home: { id: opts.home[0], name: "H", formation: opts.home[1] },
    away: { id: opts.away[0], name: "A", formation: opts.away[1] },
    ft: { home: 0, away: 0 },
    pens: null,
    goals: [],
    goalsComplete: true,
    korean: [],
    fetchedAt: opts.kickoff,
  };
}

function use(
  shape: string,
  kickoff: string,
  match = `af-${nextId++}`,
): FormationUse {
  return {
    match,
    kickoff,
    shape,
    comp: "BUNDESLIGA",
    side: "home",
    opponent: "augsburg",
  };
}

// ─── 포메이션 ────────────────────────────────────────────────────────────

describe("mainFormation — 최빈값, 동률은 가장 최근 경기에 쓴 포메이션 (FR-55, D1 이월)", () => {
  it("가장 많이 쓴 포메이션", () => {
    const main = mainFormation([
      use("4-2-3-1", "2026-10-01T13:30:00Z"),
      use("3-4-2-1", "2026-10-08T13:30:00Z"),
      use("4-2-3-1", "2026-10-15T13:30:00Z"),
      use("3-4-2-1", "2026-10-22T13:30:00Z"),
      use("4-2-3-1", "2026-10-29T13:30:00Z"),
    ]);
    expect(main).toMatchObject({ shape: "4-2-3-1", count: 3, total: 5 });
    expect(main?.latest.kickoff).toBe("2026-10-29T13:30:00Z");
  });

  it("우니온 베를린 1:1 사례 — 동률이면 마지막 사용이 늦은 포메이션(입력 순서와 무관)", () => {
    const early = use("4-2-3-1", "2026-10-04T13:30:00Z");
    const late = use("4-1-4-1", "2026-10-18T15:30:00Z");
    expect(mainFormation([early, late])?.shape).toBe("4-1-4-1");
    expect(mainFormation([late, early])?.shape).toBe("4-1-4-1");
    // 2:2 — 각 포메이션의 마지막 사용끼리 비교
    expect(
      mainFormation([
        use("4-1-4-1", "2026-09-01T13:30:00Z"),
        use("4-2-3-1", "2026-09-08T13:30:00Z"),
        use("4-1-4-1", "2026-09-15T13:30:00Z"),
        use("4-2-3-1", "2026-09-22T13:30:00Z"),
      ])?.shape,
    ).toBe("4-2-3-1");
  });

  it("마지막 사용 킥오프까지 같으면 경기 id가 큰 쪽, 사용이 없으면 null", () => {
    const k = "2026-10-18T13:30:00Z";
    expect(
      mainFormation([use("3-5-2", k, "af-500"), use("4-4-2", k, "af-499")])
        ?.shape,
    ).toBe("3-5-2");
    expect(mainFormation([])).toBeNull();
  });
});

describe("formationUsesByTeam — 6개 대회·원장 시즌·형식이 맞는 포메이션만, 킥오프 순", () => {
  it("컵(comp null)·다른 시즌·형식 오류(합 9, null)·대응표 밖 팀은 세지 않는다", () => {
    const uses = formationUsesByTeam(
      [
        ledgerMatch({
          kickoff: "2026-10-25T16:30:00Z",
          home: [BAYERN, "4-2-3-1"],
          away: [UNION, "4-4-1"],
        }),
        ledgerMatch({
          kickoff: "2026-10-18T13:30:00Z",
          home: [UNION, "3-4-2-1"],
          away: [BAYERN, null],
        }),
        ledgerMatch({
          kickoff: "2026-10-28T19:45:00Z",
          home: [BAYERN, "3-5-2"],
          away: [UNION, "5-3-2"],
          comp: null, // DFB-Pokal
        }),
        ledgerMatch({
          kickoff: "2025-10-28T19:45:00Z",
          home: [BAYERN, "3-5-2"],
          away: [UNION, "5-3-2"],
          season: 2025,
        }),
        ledgerMatch({
          kickoff: "2026-10-26T19:45:00Z",
          home: [999_999, "4-3-3"],
          away: [UNION, " 4-1-4-1 "],
        }),
      ],
      { afToSlug, season: 2026 },
    );
    expect(uses.get("bayern-munchen")?.map((u) => u.shape)).toEqual([
      "4-2-3-1",
    ]);
    expect(uses.get("union-berlin")?.map((u) => [u.shape, u.opponent])).toEqual(
      [
        ["3-4-2-1", "bayern-munchen"],
        ["4-1-4-1", null],
      ],
    );
  });
});

describe("resolveFormation — 원장 최빈값(api) · 수동 보조(manual) · 없음(null)", () => {
  const manual = { shape: "4-3-3", updated: "2026-10-01T00:00:00Z" };
  const uses = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      use("4-2-3-1", `2026-10-${String(10 + i).padStart(2, "0")}T13:30:00Z`),
    );

  it("원장만 있으면 api — updated는 센 경기 중 가장 늦은 킥오프(실행 시각이 아니다)", () => {
    expect(resolveFormation(uses(2), undefined)).toEqual({
      shape: "4-2-3-1",
      source: "api",
      updated: "2026-10-11T13:30:00Z",
    });
  });

  it(`원장 경기가 ${MIN_API_USES_OVER_MANUAL}경기 미만이면 수동이 앞서고, 그 이상이면 원장`, () => {
    expect(resolveFormation([], manual)).toEqual({
      shape: "4-3-3",
      source: "manual",
      updated: "2026-10-01T00:00:00Z",
    });
    expect(
      resolveFormation(uses(MIN_API_USES_OVER_MANUAL - 1), manual)?.source,
    ).toBe("manual");
    expect(
      resolveFormation(uses(MIN_API_USES_OVER_MANUAL), manual)?.source,
    ).toBe("api");
  });

  it("둘 다 없으면 null(화면 미표시)", () => {
    expect(resolveFormation([], undefined)).toBeNull();
  });
});

// ─── 팀시트 ──────────────────────────────────────────────────────────────

const COMP_BY_LEAGUE = new Map<number, CompId>([
  [39, "EPL"],
  [140, "LALIGA"],
  [135, "SERIEA"],
  [78, "BUNDESLIGA"],
  [61, "LIGUE1"],
  [2, "UCL"],
]);

function detailOf(file: string): MatchDetail {
  const raw = readAfJson<{ response: unknown[] }>(file).response[0];
  const r = toMatchDetail(raw, {
    compByLeague: COMP_BY_LEAGUE,
    fetchedAt: "2026-10-30T02:30:00.000Z",
  });
  if (r.kind !== "finished") throw new Error(`${file} 종료 경기 아님`);
  return r.detail;
}

describe("teamSheetsFromDetail — 선발 11·교체 명단(이름·등번호·포지션·grid만), 한국 선수는 apiFootballId로", () => {
  const ctx = { afToSlug, koreanByAfId };
  const d = detailOf("fixtures-id-1575167.json"); // 바이에른 – 우니온 베를린

  it("1575167: 양 팀 팀시트 — 경기 맥락·선발 grid·교체 grid null·원문 이름", () => {
    const { sheets, skipped } = teamSheetsFromDetail(d, ctx);
    expect(skipped).toEqual([]);
    expect(sheets.map((s) => s.team)).toEqual([
      "bayern-munchen",
      "union-berlin",
    ]);
    const bayern = sheets[0]!.lineup;
    expect(bayern).toMatchObject({
      formation: "4-2-3-1",
      match: "af-1575167",
      kickoff: "2026-09-18T18:30:00.000Z",
      comp: "BUNDESLIGA",
      side: "home",
      opponent: "union-berlin",
    });
    expect(bayern.startXI).toHaveLength(11);
    expect(bayern.startXI[0]).toEqual({
      name: "M. Neuer",
      number: 1,
      pos: "G",
      grid: "1:1",
    });
    expect(bayern.startXI.every((p) => p.grid !== null)).toBe(true);
    expect(bayern.substitutes.every((p) => p.grid === null)).toBe(true);
    // 선수 기록·id는 담지 않는다(D63 ②)
    expect(JSON.stringify(sheets)).not.toMatch(/minutes|"id"/);
  });

  it("한국 선수 — 김민재(2897, 교체 명단)·정우영(512, 선발)만 korean slug, 이름은 응답 원문 그대로", () => {
    const { sheets } = teamSheetsFromDetail(d, ctx);
    const korean = sheets.flatMap((s) =>
      [...s.lineup.startXI, ...s.lineup.substitutes].filter((p) => p.korean),
    );
    expect(korean.map((p) => [p.korean, p.name])).toEqual([
      ["kim-min-jae", "Kim Min-Jae"],
      ["jeong-woo-yeong", expect.any(String)],
    ]);
  });

  it("grid가 없는 선발(커버리지 부족 응답)은 grid null로 둔다 — 팀시트는 유지", () => {
    const home = d.lineups.home!;
    const noGrid: MatchDetail = {
      ...d,
      lineups: {
        ...d.lineups,
        home: {
          ...home,
          startXI: home.startXI.map((p) => ({ ...p, grid: null })),
        },
      },
    };
    const { sheets } = teamSheetsFromDetail(noGrid, ctx);
    expect(sheets[0]!.lineup.startXI.every((p) => p.grid === null)).toBe(true);
  });

  it("건너뛰는 경우 — 6개 대회 밖·라인업 없음·포메이션 없음·선발 11명 아님·대응표 밖 팀·상대", () => {
    const reasons = (detail: MatchDetail) =>
      teamSheetsFromDetail(detail, ctx).skipped.map((s) => s.reason);
    expect(reasons({ ...d, comp: null })).toEqual(["not-6-comp", "not-6-comp"]);
    expect(reasons({ ...d, lineups: { home: null, away: null } })).toEqual([
      "no-lineup",
      "no-lineup",
    ]);
    expect(
      reasons({
        ...d,
        lineups: {
          home: { ...d.lineups.home!, formation: null },
          away: {
            ...d.lineups.away!,
            startXI: d.lineups.away!.startXI.slice(0, 10),
          },
        },
      }),
    ).toEqual(["no-formation", "start-xi"]);
    expect(reasons({ ...d, home: { ...d.home, id: 999_999 } })).toEqual([
      "unknown-team",
      "unknown-opponent",
    ]);
  });

  it("승부차기 1639860(커버리지 없는 대회 — lineups 빈 배열)은 팀시트 없음", () => {
    const pen = detailOf("fixtures-id-1639860.json");
    expect(teamSheetsFromDetail(pen, ctx).sheets).toEqual([]);
  });
});

describe("pickLineup — 주 포메이션과 같은 후보 중 가장 늦은 경기", () => {
  const base = teamSheetsFromDetail(detailOf("fixtures-id-1575167.json"), {
    afToSlug,
    koreanByAfId,
  }).sheets[0]!.lineup;
  const later: TeamLineup = {
    ...base,
    match: "af-1575198",
    kickoff: "2026-10-25T16:30:00.000Z",
  };
  const other: TeamLineup = {
    ...base,
    formation: "3-4-2-1",
    match: "af-1575300",
    kickoff: "2026-11-01T14:30:00.000Z",
  };
  const formation = {
    shape: "4-2-3-1",
    source: "api" as const,
    updated: "2026-10-25T16:30:00.000Z",
  };

  it("같은 포메이션이면 늦은 경기, 다른 포메이션은 더 늦어도 고르지 않는다", () => {
    expect(pickLineup(formation, [base, later, other])?.match).toBe(
      "af-1575198",
    );
    expect(pickLineup(formation, [other])).toBeNull();
    expect(pickLineup(null, [base])).toBeNull();
  });
});

// ─── 주요 선수 ───────────────────────────────────────────────────────────

describe("topPlayersOf — 골 ↓ → 도움 ↓(null 뒤) → 이름, 상위 3명, 잘린 마지막 골 수 제외 (FR-54)", () => {
  const s = (
    player: string,
    goals: number,
    assists: number | null,
    team = "bayern-munchen",
  ): Scorer => ({
    player,
    team,
    goals,
    assists,
    penalties: null,
    played: null,
  });

  it("정렬과 상한 3", () => {
    const scorers = [
      s("Luis Díaz", 4, 1),
      s("Harry Kane", 4, 4),
      s("Michael Olise", 6, 3),
      s("Serge Gnabry", 4, null),
      s("Other Team", 9, 0, "union-berlin"),
    ];
    expect(topPlayersOf("bayern-munchen", scorers, 100)).toEqual([
      { name: "Michael Olise", goals: 6, assists: 3 },
      { name: "Harry Kane", goals: 4, assists: 4 },
      { name: "Luis Díaz", goals: 4, assists: 1 },
    ]);
  });

  it("도움이 같으면 이름(코드 포인트 순), null 도움은 숫자 뒤", () => {
    expect(
      topPlayersOf(
        "bayern-munchen",
        [s("B", 2, null), s("C", 2, 0), s("A", 2, 0)],
        100,
      ).map((p) => p.name),
    ).toEqual(["A", "C", "B"]);
  });

  it("목록이 상한만큼 차 있으면 마지막 골 수(최솟값) 선수는 뺀다 — 덜 찼으면 둔다", () => {
    const full = [s("Kane", 3, 1), s("Musiala", 1, 2), s("X", 2, 0, "x")];
    expect(topPlayersOf("bayern-munchen", full, 3).map((p) => p.name)).toEqual([
      "Kane",
    ]);
    expect(topPlayersOf("bayern-munchen", full, 4).map((p) => p.name)).toEqual([
      "Kane",
      "Musiala",
    ]);
    expect(topPlayersOf("bayern-munchen", [], 100)).toEqual([]);
  });
});

// ─── 팀 파일 전체 ────────────────────────────────────────────────────────

function competitionWith(
  comp: CompId,
  scorers: Scorer[],
  standings: Array<[string, number]> = [],
) {
  return CompetitionFileSchema.parse({
    comp,
    season: 2026,
    provider: "football-data",
    updatedAt: "2026-10-30T02:18:39.937Z",
    standings: standings.map(([team, pos]) => ({
      pos,
      prevPos: null,
      team,
      played: 8,
      w: 0,
      d: 0,
      l: 0,
      gf: 0,
      ga: 0,
      pts: 0,
      form: [],
      zone: "none",
    })),
    matches: [],
    scorers,
  });
}

function baseInput(over: Partial<TeamFilesInput> = {}): TeamFilesInput {
  return {
    slugs: allTeamSlugs(),
    teamIds,
    names,
    colors,
    koreanPlayers,
    formations: {},
    ledger: [],
    season: 2026,
    competitions: {},
    previous: new Map(),
    sheets: [],
    ...over,
  };
}

describe("buildTeamFiles — 111팀 TeamSchema 적합 · configs 복사 · 이전 값 이어받기", () => {
  it("설정만으로 111팀 전부 만들고 스키마를 통과한다(포메이션·팀시트 없음 → null)", () => {
    const r = buildTeamFiles(baseInput());
    expect(r.problems).toEqual([]);
    expect(r.teams).toHaveLength(111);
    for (const t of r.teams) {
      expect(
        TeamSchema.safeParse(JSON.parse(serializeTeamFile(t))).success,
      ).toBe(true);
      expect([t.slug, t.colors, t.short]).toEqual([
        t.slug,
        colors[t.slug]!.colors,
        colors[t.slug]!.short,
      ]);
    }
    const bayern = r.teams.find((t) => t.slug === "bayern-munchen")!;
    expect(bayern).toMatchObject({
      nameKo: "바이에른 뮌헨",
      nameEn: "FC Bayern München",
      comp: "BUNDESLIGA",
      alsoIn: ["UCL"],
      formation: null,
      lineup: null,
      profile: null,
      reading: [],
      koreanPlayers: ["kim-min-jae"],
    });
    expect(r.teams.find((t) => t.slug === "psv")).toMatchObject({
      comp: "UCL",
      alsoIn: [],
    });
    expect(r.stats.koreanPlayers).toBe(
      new Set(koreanPlayers.filter((p) => p.active).map((p) => p.team)).size,
    );
  });

  it("원장 포메이션 + 이번에 받은 팀시트 → formation api·lineup, 주요 선수는 대표 대회 득점 순위", () => {
    const d = detailOf("fixtures-id-1575167.json");
    const sheets = teamSheetsFromDetail(d, { afToSlug, koreanByAfId }).sheets;
    const r = buildTeamFiles(
      baseInput({
        ledger: [
          ledgerMatch({
            id: 1575167,
            kickoff: d.kickoff,
            home: [BAYERN, "4-2-3-1"],
            away: [UNION, "4-2-3-1"],
          }),
        ],
        sheets,
        competitions: {
          BUNDESLIGA: competitionWith("BUNDESLIGA", [
            {
              player: "Harry Kane",
              team: "bayern-munchen",
              goals: 4,
              assists: 4,
              penalties: 1,
              played: 7,
            },
          ]),
        },
      }),
    );
    const bayern = r.teams.find((t) => t.slug === "bayern-munchen")!;
    expect(bayern.formation).toEqual({
      shape: "4-2-3-1",
      source: "api",
      updated: d.kickoff,
    });
    expect(bayern.lineup?.match).toBe("af-1575167");
    expect(bayern.topPlayers).toEqual([
      { name: "Harry Kane", goals: 4, assists: 4 },
    ]);
    expect(r.stats).toMatchObject({ lineup: 2, topPlayers: 1 });
  });

  it("이전 파일의 profile·reading·lineup을 이어받고, 주 포메이션이 바뀌어 맞는 팀시트가 없으면 lineup null", () => {
    const d = detailOf("fixtures-id-1575167.json");
    const sheet = teamSheetsFromDetail(d, { afToSlug, koreanByAfId })
      .sheets[0]!;
    const first = buildTeamFiles(
      baseInput({
        ledger: [
          ledgerMatch({
            id: 1575167,
            kickoff: d.kickoff,
            home: [BAYERN, "4-2-3-1"],
            away: [UNION, "4-2-3-1"],
          }),
        ],
        sheets: [sheet],
      }),
    ).teams.find((t) => t.slug === "bayern-munchen")!;
    const prev: Team = {
      ...first,
      reading: [
        { title: "읽을거리", url: "https://example.com/a", source: "Example" },
      ],
    };
    const keep = buildTeamFiles(
      baseInput({
        ledger: [
          ledgerMatch({
            id: 1575167,
            kickoff: d.kickoff,
            home: [BAYERN, "4-2-3-1"],
            away: [UNION, "4-2-3-1"],
          }),
        ],
        previous: new Map([["bayern-munchen", prev]]),
      }),
    ).teams.find((t) => t.slug === "bayern-munchen")!;
    expect(keep.lineup?.match).toBe("af-1575167");
    expect(keep.reading).toEqual(prev.reading);

    // 새 경기 2개가 3-4-2-1 → 최빈값이 바뀌었는데 그 라인업은 받지 못했다 → 팀시트 숨김
    const changed = buildTeamFiles(
      baseInput({
        ledger: [
          ledgerMatch({
            id: 1575167,
            kickoff: d.kickoff,
            home: [BAYERN, "4-2-3-1"],
            away: [UNION, "4-2-3-1"],
          }),
          ledgerMatch({
            kickoff: "2026-10-18T13:30:00Z",
            home: [BAYERN, "3-4-2-1"],
            away: [UNION, "4-2-3-1"],
          }),
          ledgerMatch({
            kickoff: "2026-10-25T13:30:00Z",
            home: [BAYERN, "3-4-2-1"],
            away: [UNION, "4-2-3-1"],
          }),
        ],
        previous: new Map([["bayern-munchen", prev]]),
      }),
    ).teams.find((t) => t.slug === "bayern-munchen")!;
    expect(changed.formation?.shape).toBe("3-4-2-1");
    expect(changed.lineup).toBeNull();
  });

  it("수동 포메이션(configs/formations.json) — 원장 경기가 없는 팀은 manual", () => {
    const r = buildTeamFiles(
      baseInput({
        formations: {
          psv: { shape: "4-3-3", updated: "2026-10-20T00:00:00Z" },
        },
      }),
    );
    expect(r.teams.find((t) => t.slug === "psv")?.formation).toEqual({
      shape: "4-3-3",
      source: "manual",
      updated: "2026-10-20T00:00:00Z",
    });
    expect(r.stats.formation).toEqual({ api: 0, manual: 1, none: 110 });
  });

  it("설정이 어긋난 팀(색 없음)은 만들지 않고 problems에 남긴다", () => {
    const rest = Object.fromEntries(
      Object.entries(colors).filter(([slug]) => slug !== "psv"),
    );
    const r = buildTeamFiles(baseInput({ colors: rest }));
    expect(r.problems).toEqual(["psv: team-colors.json 항목 없음"]);
    expect(r.teams).toHaveLength(110);
  });
});

// ─── 백필 ────────────────────────────────────────────────────────────────

describe("lineupBackfillPriority·planLineupBackfill — 한국 선수 소속팀 → 리그 상위권 → 나머지", () => {
  it("우선순위: 활성 한국 선수 팀(설정 순서) → 순위 오름차순(같은 순위는 리그 순서) → UCL만 뛰는 팀", () => {
    const order = lineupBackfillPriority({
      slugs: allTeamSlugs(),
      koreanPlayers,
      competitions: {
        EPL: competitionWith(
          "EPL",
          [],
          [
            ["arsenal", 1],
            ["chelsea", 2],
          ],
        ),
        BUNDESLIGA: competitionWith(
          "BUNDESLIGA",
          [],
          [["borussia-dortmund", 1]],
        ),
      },
    });
    const korean = [
      ...new Set(koreanPlayers.filter((p) => p.active).map((p) => p.team)),
    ];
    expect(order.slice(0, korean.length)).toEqual(korean);
    expect(order.slice(korean.length, korean.length + 3)).toEqual([
      "arsenal",
      "borussia-dortmund",
      "chelsea",
    ]);
    expect(order).toHaveLength(111);
    expect(order.at(-1)).toBe("viking"); // UCL만 뛰는 팀은 맨 뒤
  });

  it("주 포메이션의 마지막 원장 경기가 지금 팀시트와 다르면 대상 — 같은 경기는 한 번, 상한 넘으면 pending", () => {
    const ledger = [
      ledgerMatch({
        id: 101,
        kickoff: "2026-10-18T13:30:00Z",
        home: [BAYERN, "4-2-3-1"],
        away: [UNION, "4-2-3-1"],
      }),
      ledgerMatch({
        id: 102,
        kickoff: "2026-10-25T13:30:00Z",
        home: [BAYERN, "4-2-3-1"],
        away: [UNION, "3-4-2-1"], // 우니온 1:1 → 최근 3-4-2-1
      }),
    ];
    const r = buildTeamFiles(baseInput({ ledger }));
    const plan = planLineupBackfill({
      teams: r.teams,
      uses: r.uses,
      priority: ["union-berlin", "bayern-munchen"],
      limit: 1,
    });
    expect(plan.targets).toEqual([
      { matchId: 102, teams: ["union-berlin", "bayern-munchen"] },
    ]);
    expect(plan.pending).toEqual([]);
    expect(
      planLineupBackfill({
        teams: r.teams,
        uses: r.uses,
        priority: ["union-berlin", "bayern-munchen"],
        limit: 0,
      }),
    ).toEqual({ targets: [], pending: ["union-berlin", "bayern-munchen"] });
    // 이미 받아 본 경기(재조회 포메이션이 원장과 달라 채우지 못한 경기)는 다시 고르지 않는다
    expect(
      planLineupBackfill({
        teams: r.teams,
        uses: r.uses,
        priority: ["union-berlin", "bayern-munchen"],
        limit: 5,
        exclude: new Set([102]),
      }),
    ).toEqual({ targets: [], pending: [] });
  });
});
