/**
 * 팀 → 대회 표 (2026-27 시즌, plan M1-17 → M2-04) — 순수 데이터. 코드 분류의 대회 태그·점수화 범위 근거이자, 팀 목록(M2-04)의
 * 대회 소속 정보 단일 출처다(팀 slug·두 API id는 `configs/team-ids.json`).
 *
 * 뉴스 카드의 대회 태그는 소스 대회(`Source.competitions`)만으로는 넓다 — BBC European 피드는 4개 리그가 붙고(라리가 기사에
 * 세리에 A·분데스·리그 1까지), BBC Football·국내 피드는 대회가 없다. 제목에서 찾은 팀(tag-names.ts — `configs/names.ko.json`·
 * 빅클럽 표)의 리그로 좁힌다(classify.ts). 점수화(score.ts)는 이 리그를 서비스 범위 근거로 쓴다(M1-14 이월 — 빅클럽 밖 EPL 기사의
 * 범위 감점 해제).
 *
 * 값: football-data.org `/v4/competitions/{code}/teams?season=2026`(fixtures/football/football-data/teams-*-2026.json, M2-04 —
 * 5대 리그 96팀 + UCL 36팀 중 5대 리그 밖 15팀 = 111팀). 리그 표의 순서는 2026-10-11 순위표 순서(M1-17)를 유지한다. slug는
 * `configs/team-ids.json`(PRD §15 D63 ③ 규칙 — scripts/lib/team-slugs.ts)과 같다. tests/team-leagues.test.ts가 teams fixtures·
 * team-ids·사전과 대조한다(어긋나면 실패 — 표를 함께 고친다).
 *
 * 팀 파일(`data/teams/<slug>.json` — TeamSchema `comp`·`alsoIn`)은 `teamCompetitions`로 대회를 정한다: 리그 팀은 리그 + (UCL 참가면)
 * alsoIn ["UCL"], 5대 리그 밖 UCL 팀은 comp "UCL". 시즌 전환(`/new-season` — 승강 팀·UCL 참가 팀) 때 이 표를 갱신한다
 * (scripts/fetch-competition-teams.ts → scripts/build-team-ids.ts --roster).
 */
import type { CompId } from "@/lib/schema";

/** 표의 리그(UCL 제외) */
export type LeagueId = Exclude<CompId, "UCL">;

/** 이 표의 시즌(시작 연도 — competitions.json `season`과 같다) */
export const TEAM_LEAGUES_SEASON = 2026;

/** 리그 → 팀 slug(2026-10-11 순위표 순서) */
export const TEAM_LEAGUES: Readonly<Record<LeagueId, readonly string[]>> = {
  EPL: [
    "manchester-city",
    "arsenal",
    "brighton",
    "brentford",
    "chelsea",
    "leeds-united",
    "liverpool",
    "everton",
    "ipswich-town",
    "hull-city",
    "newcastle-united",
    "manchester-united",
    "nottingham-forest",
    "aston-villa",
    "crystal-palace",
    "sunderland",
    "bournemouth",
    "tottenham-hotspur",
    "coventry-city",
    "fulham",
  ],
  LALIGA: [
    "barcelona",
    "atletico-madrid",
    "real-madrid",
    "real-betis",
    "sevilla",
    "alaves",
    "deportivo-la-coruna",
    "real-sociedad",
    "athletic",
    "villarreal",
    "espanyol",
    "rayo-vallecano",
    "getafe",
    "osasuna",
    "celta-vigo",
    "racing-santander",
    "levante",
    "elche",
    "malaga",
    "valencia",
  ],
  SERIEA: [
    "inter",
    "roma",
    "lazio",
    "cagliari",
    "milan",
    "napoli",
    "juventus",
    "como",
    "frosinone",
    "sassuolo",
    "atalanta",
    "lecce",
    "udinese",
    "torino",
    "monza",
    "genoa",
    "parma",
    "fiorentina",
    "bologna",
    "venezia",
  ],
  BUNDESLIGA: [
    "borussia-dortmund",
    "bayern-munchen",
    "freiburg",
    "leverkusen",
    "rb-leipzig",
    "augsburg",
    "werder-bremen",
    "mainz",
    "elversberg",
    "stuttgart",
    "hamburg",
    "schalke",
    "eintracht-frankfurt",
    "koln",
    "paderborn",
    "union-berlin",
    "hoffenheim",
    "borussia-monchengladbach",
  ],
  LIGUE1: [
    "monaco",
    "lille",
    "lyon",
    "paris-fc",
    "paris-saint-germain",
    "rennes",
    "brest",
    "lorient",
    "lens",
    "strasbourg",
    "angers",
    "le-mans",
    "toulouse",
    "auxerre",
    "nice",
    "troyes",
    "marseille",
    "le-havre",
  ],
};

/** UCL 2026-27 리그 페이즈 참가 36팀(slug 순) — 5대 리그 21팀 + 그 밖 15팀 */
export const UCL_TEAMS: readonly string[] = [
  "aek-athens",
  "arsenal",
  "aston-villa",
  "atletico-madrid",
  "barcelona",
  "bayern-munchen",
  "bodo-glimt",
  "borussia-dortmund",
  "club-brugge",
  "como",
  "fenerbahce",
  "feyenoord",
  "galatasaray",
  "inter",
  "lask",
  "lens",
  "lille",
  "liverpool",
  "manchester-city",
  "manchester-united",
  "napoli",
  "paris-saint-germain",
  "porto",
  "psv",
  "rb-leipzig",
  "real-betis",
  "real-madrid",
  "roma",
  "sabah",
  "shakhtar-donetsk",
  "slavia-praha",
  "slovan-bratislava",
  "sporting-cp",
  "stuttgart",
  "viking",
  "villarreal",
];

/** 표의 리그 id 목록 */
export const LEAGUE_IDS: readonly LeagueId[] = [
  "EPL",
  "LALIGA",
  "SERIEA",
  "BUNDESLIGA",
  "LIGUE1",
];

/** 5대 리그 id인가(korean-players.json `comp`의 OTHER·UCL 등은 아니다) */
export function isLeagueId(value: string): value is LeagueId {
  return (LEAGUE_IDS as readonly string[]).includes(value);
}

/** 팀 slug → 리그 */
export function buildTeamLeagueIndex(
  table: Readonly<Record<LeagueId, readonly string[]>> = TEAM_LEAGUES,
): ReadonlyMap<string, LeagueId> {
  const index = new Map<string, LeagueId>();
  for (const league of Object.keys(table) as LeagueId[]) {
    for (const slug of table[league]) {
      if (!index.has(slug)) index.set(slug, league);
    }
  }
  return index;
}

/** 기본 색인(TEAM_LEAGUES) */
export const TEAM_LEAGUE_INDEX: ReadonlyMap<string, LeagueId> =
  buildTeamLeagueIndex();

export interface TeamCompetitions {
  /** 대표 대회 — 리그 팀은 리그, 5대 리그 밖 UCL 팀은 UCL */
  comp: CompId;
  /** 함께 뛰는 대회(리그 팀의 UCL) */
  alsoIn: CompId[];
}

/** 팀 slug → 대표 대회·함께 뛰는 대회(TeamSchema `comp`·`alsoIn`). 6개 대회 밖 팀이면 null */
export function teamCompetitions(
  slug: string,
  leagueIndex: ReadonlyMap<string, LeagueId> = TEAM_LEAGUE_INDEX,
  uclTeams: readonly string[] = UCL_TEAMS,
): TeamCompetitions | null {
  const league = leagueIndex.get(slug);
  const inUcl = uclTeams.includes(slug);
  if (league !== undefined)
    return { comp: league, alsoIn: inUcl ? ["UCL"] : [] };
  return inUcl ? { comp: "UCL", alsoIn: [] } : null;
}

/** 6개 대회 전 팀 slug(리그 순 → UCL 밖 팀, 중복 없음) — 팀 목록(M2-04) */
export function allTeamSlugs(
  table: Readonly<Record<LeagueId, readonly string[]>> = TEAM_LEAGUES,
  uclTeams: readonly string[] = UCL_TEAMS,
): string[] {
  const seen = new Set<string>();
  for (const league of LEAGUE_IDS)
    for (const slug of table[league]) seen.add(slug);
  for (const slug of uclTeams) seen.add(slug);
  return [...seen];
}
