/**
 * 팀 → 리그 표 (2026-27 시즌, plan M1-17 — 코드 분류의 대회 태그·점수화 범위 근거) — 순수 데이터.
 *
 * 뉴스 카드의 대회 태그는 소스 대회(`Source.competitions`)만으로는 넓다 — BBC European 피드는 4개 리그가 붙고(라리가 기사에
 * 세리에 A·분데스·리그 1까지), BBC Football·국내 피드는 대회가 없다. 제목에서 찾은 팀(tag-names.ts — `configs/names.ko.json`·
 * 빅클럽 표)의 리그로 좁힌다(classify.ts). 점수화(score.ts)는 이 리그를 서비스 범위 근거로 쓴다(M1-14 이월 — 빅클럽 밖 EPL 기사의
 * 범위 감점 해제).
 *
 * 값: football-data.org 5대 리그 순위표(fixtures/football/football-data/standings-*-2026-10-11.json, 2026-27 시즌 96팀). slug는
 * `configs/names.ko.json` 팀 항목(영문 표기가 football-data 이름과 같은 항목) → `configs/team-ids.json` → M0-32 slug 규칙
 * (team-ids-draft.ts `teamSlugFromName`) 순으로 정했다 — 사전에 아직 없는 팀도 사전에 들어오면(같은 slug) 바로 쓰인다.
 * tests/team-leagues.test.ts가 순위표 fixture·사전과 대조한다(사전 항목의 slug가 이 표와 다르면 실패 — 표를 함께 고친다).
 *
 * UCL은 리그가 아니라 넣지 않는다(UCL 태그는 제목 표현·소스 대회로만). 시즌 전환(`/new-season` — 승강 팀) 때 이 표를 갱신한다.
 * 리그 팀 목록을 담는 설정·데이터 파일(M2 data/competitions·teams)이 생기면 그쪽에서 읽는 것으로 옮길 후보다.
 */
import type { CompId } from "@/lib/schema";

/** 표의 리그(UCL 제외) */
export type LeagueId = Exclude<CompId, "UCL">;

/** 이 표의 시즌(시작 연도 — competitions.json `season`과 같다) */
export const TEAM_LEAGUES_SEASON = 2026;

/** 리그 → 팀 slug(순위표 순서 그대로 — 2026-10-11) */
export const TEAM_LEAGUES: Readonly<Record<LeagueId, readonly string[]>> = {
  EPL: [
    "manchester-city",
    "arsenal",
    "brighton-hove-albion",
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
    "atletico-de-madrid",
    "real-madrid",
    "real-betis-balompie",
    "sevilla",
    "deportivo-alaves",
    "rc-deportivo-la-coruna",
    "real-sociedad-de-futbol",
    "athletic",
    "villarreal",
    "rcd-espanyol-de-barcelona",
    "rayo-vallecano-de-madrid",
    "getafe",
    "ca-osasuna",
    "rc-celta-de-vigo",
    "real-racing-club-de-santander",
    "levante-ud",
    "elche",
    "malaga",
    "valencia",
  ],
  SERIEA: [
    "internazionale-milano",
    "as-roma",
    "ss-lazio",
    "cagliari-calcio",
    "ac-milan",
    "ssc-napoli",
    "juventus",
    "como-1907",
    "frosinone-calcio",
    "us-sassuolo-calcio",
    "atalanta-bc",
    "us-lecce",
    "udinese-calcio",
    "torino",
    "ac-monza",
    "genoa-cfc",
    "parma-calcio-1913",
    "acf-fiorentina",
    "bologna-fc-1909",
    "venezia",
  ],
  BUNDESLIGA: [
    "borussia-dortmund",
    "bayern-munchen",
    "freiburg",
    "bayer-04-leverkusen",
    "rb-leipzig",
    "augsburg",
    "werder-bremen",
    "mainz-05",
    "07-elversberg",
    "vfb-stuttgart",
    "hamburger",
    "schalke-04",
    "eintracht-frankfurt",
    "koln",
    "paderborn-07",
    "union-berlin",
    "tsg-1899-hoffenheim",
    "borussia-monchengladbach",
  ],
  LIGUE1: [
    "as-monaco",
    "lille-osc",
    "olympique-lyonnais",
    "paris",
    "paris-saint-germain",
    "stade-rennais-fc-1901",
    "stade-brestois-29",
    "lorient",
    "racing-club-de-lens",
    "rc-strasbourg-alsace",
    "angers-sco",
    "le-mans",
    "toulouse",
    "aj-auxerre",
    "ogc-nice",
    "es-troyes-ac",
    "olympique-de-marseille",
    "le-havre-ac",
  ],
};

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
