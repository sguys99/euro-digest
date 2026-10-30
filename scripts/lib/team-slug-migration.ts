/**
 * 팀 slug 일회성 이전 (M2-04, PRD §15 D63 ③ — "이미 발행된 data/news 카드의 옛 slug는 마이그레이션 스크립트로 한 번에 치환, 카드 ID 불변").
 * I/O 없는 순수 함수. 진입점은 scripts/migrate-team-slugs.ts.
 *
 * 옛 slug = M0-32 규칙(football-data 정식 이름 kebab — FC·AFC·CF·SC·SV·FSV·1.·Club만 뗌)으로 정한 slug(names.ko·team-leagues·
 * team-ids). 새 slug = scripts/lib/team-slugs.ts(D63 ③). 표는 `scripts/build-team-ids.ts --roster --renames`가 만든 값을 옮겼다
 * (2026-10-30, 111팀 중 63팀이 바뀜 — 나머지 48팀은 그대로).
 *
 * 바꾸는 곳은 팀 slug 자리만이다(값이 우연히 같은 다른 문자열은 건드리지 않는다).
 *   - 일별 뉴스(`data/news/*.json`, `fixtures/news-sample.json`): `cards[].teams[]`·`cards[].transfer.from`·`transfer.to`
 *   - `fixtures/news-sample.meta.json`: `labels.teams`의 키
 *   - `configs/names.ko.json`: `entries[]` 중 kind team의 `slug`
 *   - `configs/korean-players.json`: `[].team`
 * 카드 ID(`c_` + 대표 URL 해시 — card-id.ts)는 URL에서 만들므로 slug와 무관하다 — 카드의 다른 필드는 바꾸지 않는다.
 * JSON 키 순서는 그대로 둔다(파싱 → 제자리 치환 → 같은 직렬화).
 */

/** 옛 slug → 새 slug (M2-04, 2026-10-30 — 63건) */
export const TEAM_SLUG_RENAMES_M2_04: Readonly<Record<string, string>> = {
  "07-elversberg": "elversberg",
  "ac-milan": "milan",
  "ac-monza": "monza",
  "acf-fiorentina": "fiorentina",
  "aj-auxerre": "auxerre",
  "angers-sco": "angers",
  "as-monaco": "monaco",
  "as-roma": "roma",
  "atalanta-bc": "atalanta",
  "atletico-de-madrid": "atletico-madrid",
  "bayer-04-leverkusen": "leverkusen",
  "bologna-fc-1909": "bologna",
  "brighton-hove-albion": "brighton",
  "brugge-kv": "club-brugge",
  "ca-osasuna": "osasuna",
  "cagliari-calcio": "cagliari",
  "como-1907": "como",
  "deportivo-alaves": "alaves",
  "es-troyes-ac": "troyes",
  "fenerbahce-sk": "fenerbahce",
  "feyenoord-rotterdam": "feyenoord",
  "fk-bodo-glimt": "bodo-glimt",
  "fk-shakhtar-donetsk": "shakhtar-donetsk",
  "frosinone-calcio": "frosinone",
  "galatasaray-sk": "galatasaray",
  "genoa-cfc": "genoa",
  hamburger: "hamburg",
  "internazionale-milano": "inter",
  "lask-linz": "lask",
  "le-havre-ac": "le-havre",
  "levante-ud": "levante",
  "lille-osc": "lille",
  "mainz-05": "mainz",
  "ogc-nice": "nice",
  "olympique-de-marseille": "marseille",
  "olympique-lyonnais": "lyon",
  "paderborn-07": "paderborn",
  "pae-aek": "aek-athens",
  paris: "paris-fc",
  "parma-calcio-1913": "parma",
  "racing-club-de-lens": "lens",
  "rayo-vallecano-de-madrid": "rayo-vallecano",
  "rc-celta-de-vigo": "celta-vigo",
  "rc-deportivo-la-coruna": "deportivo-la-coruna",
  "rc-strasbourg-alsace": "strasbourg",
  "rcd-espanyol-de-barcelona": "espanyol",
  "real-betis-balompie": "real-betis",
  "real-racing-club-de-santander": "racing-santander",
  "real-sociedad-de-futbol": "real-sociedad",
  "sabah-fk": "sabah",
  "schalke-04": "schalke",
  "sk-slavia-praha": "slavia-praha",
  "sk-slovan-bratislava": "slovan-bratislava",
  "sporting-clube-de-portugal": "sporting-cp",
  "ss-lazio": "lazio",
  "ssc-napoli": "napoli",
  "stade-brestois-29": "brest",
  "stade-rennais-fc-1901": "rennes",
  "tsg-1899-hoffenheim": "hoffenheim",
  "udinese-calcio": "udinese",
  "us-lecce": "lecce",
  "us-sassuolo-calcio": "sassuolo",
  "vfb-stuttgart": "stuttgart",
};

export type SlugRenames = Readonly<Record<string, string>>;

/** 이전 결과 — `json`은 입력을 복사해 바꾼 값(입력은 그대로) */
export interface MigrationResult<T> {
  json: T;
  /** 바꾼 slug 자리 수 */
  changed: number;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rename(
  value: unknown,
  renames: SlugRenames,
): { value: unknown; hit: boolean } {
  if (typeof value === "string" && Object.hasOwn(renames, value)) {
    return { value: renames[value], hit: true };
  }
  return { value, hit: false };
}

const clone = <T>(value: T): T => structuredClone(value);

/** 일별 뉴스 파일(원문 JSON) — 카드의 teams·transfer.from·transfer.to만 */
export function migrateNewsJson(
  input: unknown,
  renames: SlugRenames = TEAM_SLUG_RENAMES_M2_04,
): MigrationResult<unknown> {
  const json = clone(input);
  let changed = 0;
  if (!isObject(json) || !Array.isArray(json.cards)) return { json, changed };
  for (const card of json.cards) {
    if (!isObject(card)) continue;
    if (Array.isArray(card.teams)) {
      card.teams = card.teams.map((slug) => {
        const r = rename(slug, renames);
        if (r.hit) changed += 1;
        return r.value;
      });
    }
    if (isObject(card.transfer)) {
      for (const key of ["from", "to"] as const) {
        const r = rename(card.transfer[key], renames);
        if (r.hit) {
          card.transfer[key] = r.value;
          changed += 1;
        }
      }
    }
  }
  return { json, changed };
}

/** `fixtures/news-sample.meta.json` — labels.teams 키(순서 유지) */
export function migrateNewsMetaJson(
  input: unknown,
  renames: SlugRenames = TEAM_SLUG_RENAMES_M2_04,
): MigrationResult<unknown> {
  const json = clone(input);
  let changed = 0;
  if (!isObject(json) || !isObject(json.labels)) return { json, changed };
  const teams = json.labels.teams;
  if (!isObject(teams)) return { json, changed };
  const next: JsonObject = {};
  for (const [key, value] of Object.entries(teams)) {
    const r = rename(key, renames);
    if (r.hit) changed += 1;
    next[r.value as string] = value;
  }
  json.labels.teams = next;
  return { json, changed };
}

/** `configs/names.ko.json` — kind team 항목의 slug */
export function migrateNamesKoJson(
  input: unknown,
  renames: SlugRenames = TEAM_SLUG_RENAMES_M2_04,
): MigrationResult<unknown> {
  const json = clone(input);
  let changed = 0;
  if (!isObject(json) || !Array.isArray(json.entries)) return { json, changed };
  for (const entry of json.entries) {
    if (!isObject(entry) || entry.kind !== "team") continue;
    const r = rename(entry.slug, renames);
    if (r.hit) {
      entry.slug = r.value;
      changed += 1;
    }
  }
  return { json, changed };
}

/** `configs/korean-players.json` — 선수의 소속 팀 slug */
export function migrateKoreanPlayersJson(
  input: unknown,
  renames: SlugRenames = TEAM_SLUG_RENAMES_M2_04,
): MigrationResult<unknown> {
  const json = clone(input);
  let changed = 0;
  if (!Array.isArray(json)) return { json, changed };
  for (const player of json) {
    if (!isObject(player)) continue;
    const r = rename(player.team, renames);
    if (r.hit) {
      player.team = r.value;
      changed += 1;
    }
  }
  return { json, changed };
}

/** 이전 뒤 남은 옛 slug(따옴표로 둘러싼 정확한 값) — 검사용 */
export function findOldSlugs(
  text: string,
  renames: SlugRenames = TEAM_SLUG_RENAMES_M2_04,
): string[] {
  return Object.keys(renames).filter((old) => text.includes(`"${old}"`));
}

/** 프로젝트 JSON 직렬화(2칸 들여쓰기 + 끝 줄바꿈 — news-file.ts와 같다) */
export function serializeJson(json: unknown): string {
  return `${JSON.stringify(json, null, 2)}\n`;
}
