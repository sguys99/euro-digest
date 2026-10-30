/**
 * 팀 slug 규칙 (PRD §15 D63 ③, 2026-10-30 사용자 결정 — M2-04). I/O 없는 순수 데이터·함수.
 *
 * 팀 slug는 팀 페이지 URL(`/teams/<slug>/` — FR-50)·카드 태그(`NewsCard.teams`)·설정 파일 키(team-ids·names.ko·team-colors·
 * korean-players `team`)가 함께 쓰는 팀의 영구 식별자다. 한 번 공개 URL이 생기면 바꾸지 않는다.
 *
 * 규칙: **통용 영문 통칭 kebab**
 *   ① football-data 정식 이름(`team.name`)에서 악센트를 없앤다(ü→u, é→e, ø→o, ß→ss, Š→S)
 *   ② 숫자 토큰(창단 연도 1899·1907·1913·1901, 숫자 접미 04·05·07·29, "1.")을 어디서든 뺀다
 *   ③ 법인·형태 접두·접미사(`TEAM_SLUG_FORM_TOKENS` — FC·AFC·CF·SC·SV·FSV·AC·ACF·AS·SS·SSC·CFC·SCO·OSC·TSG·VfB·US·BC·RC·
 *      RCD·CA·UD·SK·ŠK·FK·KV·PAE·OGC·AJ·ES·Calcio·Club)를 이름 앞뒤에서 반복해 뗀다(가운데 토큰은 이름의 일부라 남긴다)
 *   ④ 나머지를 소문자 kebab으로 — 영어권 클럽의 United·City·Town·Hotspur·Forest 같은 이름 일부는 남긴다(통칭의 일부)
 *   ⑤ 규칙 결과가 통칭과 다르면 **예외표**(`TEAM_SLUG_OVERRIDES` — football-data 팀 id → slug + 이유)로 정한다. 예외는
 *      (a) 지명 수식어·부가어를 뗀 통칭(Atlético de Madrid → atletico-madrid, Real Betis Balompié → real-betis,
 *      Olympique Lyonnais → lyon, Bayer 04 Leverkusen → leverkusen 등) (b) 동명 충돌·모호성 회피(Paris FC → paris-fc —
 *      'paris'는 PSG와 헷갈림, Club Brugge KV → club-brugge — Cercle Brugge, PAE AEK → aek-athens — AEK 라르나카) 두 경우뿐이다.
 *   - 클럽 자국어 표기는 영어 이름으로 바꾸지 않는다(koln·bayern-munchen·slavia-praha — 악센트만 뗀다).
 *   - 영어권에서 클럽 이름 자체가 통칭인 경우(tottenham-hotspur·leeds-united·borussia-monchengladbach)는 줄이지 않는다.
 *
 * 새 팀(승격·UCL 새 참가 팀 — `/new-season`)은 `teamSlugFor`로 정하고, 규칙 결과가 통칭과 다를 때만 예외표에 이유와 함께 더한다.
 * 규칙·예외 문구는 configs/README.md "팀 slug 규칙"과 같다.
 */

/** ③ 앞뒤에서 떼는 법인·형태 토큰(소문자, 악센트 제거 후 비교) */
export const TEAM_SLUG_FORM_TOKENS: ReadonlySet<string> = new Set([
  "fc",
  "afc",
  "cf",
  "sc",
  "sv",
  "fsv",
  "ac",
  "acf",
  "as",
  "ss",
  "ssc",
  "cfc",
  "sco",
  "osc",
  "tsg",
  "vfb",
  "us",
  "bc",
  "rc",
  "rcd",
  "ca",
  "ud",
  "sk",
  "fk",
  "kv",
  "pae",
  "ogc",
  "aj",
  "es",
  "calcio",
  "club",
]);

const SPECIAL_LETTERS: Readonly<Record<string, string>> = {
  ø: "o",
  Ø: "O",
  ß: "ss",
  æ: "ae",
  Æ: "AE",
  œ: "oe",
  Œ: "OE",
  đ: "d",
  Đ: "D",
  ł: "l",
  Ł: "L",
};

/** 악센트 제거(NFKD + 결합 문자 제거, 분해되지 않는 글자는 표로) */
export function stripAccents(text: string): string {
  return text
    .replace(/[øØßæÆœŒđĐłŁ]/g, (ch) => SPECIAL_LETTERS[ch] ?? ch)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "");
}

export interface SlugRuleResult {
  slug: string;
  /** 뗀 토큰(원문 표기, 뗀 순서) — 숫자 토큰 포함 */
  stripped: string[];
}

const isNumberToken = (token: string) => /^\d+\.?$/.test(token);

/** 규칙 ①~④ — football-data 정식 이름 → slug(예외표 적용 전) */
export function teamSlugFromName(fullName: string): SlugRuleResult {
  const stripped: string[] = [];
  const tokens = stripAccents(fullName)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => {
      if (!isNumberToken(token)) return true;
      stripped.push(token);
      return false;
    });
  const isForm = (token: string | undefined) =>
    token !== undefined && TEAM_SLUG_FORM_TOKENS.has(token.toLowerCase());
  while (tokens.length > 1 && isForm(tokens[0])) stripped.push(tokens.shift()!);
  while (tokens.length > 1 && isForm(tokens.at(-1))) {
    stripped.push(tokens.pop()!);
  }
  const slug = tokens
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return { slug, stripped };
}

export interface TeamSlugOverride {
  slug: string;
  /** 규칙 결과 대신 이 slug를 쓰는 이유 */
  reason: string;
}

/**
 * ⑤ 예외표 — football-data 팀 id → slug (2026-27 시즌 6개 대회 111팀 중 24팀). 키가 football-data id라 이름 철자가 바뀌어도 유지된다.
 * 이유: 통칭 = 그 팀을 부르는 영문 통칭(football-data `shortName`·국내 표기와 대조), 충돌 = 동명·모호성 회피.
 */
export const TEAM_SLUG_OVERRIDES: Readonly<Record<number, TeamSlugOverride>> = {
  397: {
    slug: "brighton",
    reason: "통칭 'Brighton'(규칙 brighton-hove-albion — '&'가 빠진 정식 이름)",
  },
  78: {
    slug: "atletico-madrid",
    reason: "통칭 'Atlético Madrid'(규칙 atletico-de-madrid — 지명 전치사)",
  },
  80: {
    slug: "espanyol",
    reason: "통칭 'Espanyol'(규칙 espanyol-de-barcelona — 지명 수식어)",
  },
  87: {
    slug: "rayo-vallecano",
    reason:
      "통칭 'Rayo Vallecano'(규칙 rayo-vallecano-de-madrid — 지명 수식어)",
  },
  90: {
    slug: "real-betis",
    reason:
      "통칭 'Real Betis'(규칙 real-betis-balompie — 'Balompié'는 '축구'라는 부가어)",
  },
  92: {
    slug: "real-sociedad",
    reason: "통칭 'Real Sociedad'(규칙 real-sociedad-de-futbol — 부가어)",
  },
  263: {
    slug: "alaves",
    reason:
      "통칭 'Alavés'(규칙 deportivo-alaves — 'Deportivo'는 형태어, 데포르티보 라코루냐와 혼동)",
  },
  558: {
    slug: "celta-vigo",
    reason: "통칭 'Celta Vigo'(규칙 celta-de-vigo — 지명 전치사)",
  },
  5335: {
    slug: "racing-santander",
    reason:
      "통칭 'Racing Santander'(규칙 real-racing-club-de-santander — 형태어 가운데 위치)",
  },
  108: {
    slug: "inter",
    reason: "통칭 'Inter'(규칙 internazionale-milano — D63 ③ 확정 예)",
  },
  3: {
    slug: "leverkusen",
    reason:
      "통칭 'Leverkusen'(football-data shortName·국내 '레버쿠젠', 규칙 bayer-leverkusen — 모기업명)",
  },
  7: {
    slug: "hamburg",
    reason: "통칭 'Hamburg'(규칙 hamburger — 형용사형, D63 ③ 확정 예)",
  },
  512: {
    slug: "brest",
    reason: "통칭 'Brest'(규칙 stade-brestois — 형용사형)",
  },
  516: {
    slug: "marseille",
    reason:
      "통칭 'Marseille'(규칙 olympique-de-marseille — 'Olympique' 부가어)",
  },
  523: {
    slug: "lyon",
    reason: "통칭 'Lyon'(규칙 olympique-lyonnais — 형용사형)",
  },
  529: {
    slug: "rennes",
    reason: "통칭 'Rennes'(규칙 stade-rennais — 형용사형)",
  },
  546: {
    slug: "lens",
    reason: "통칭 'Lens'(규칙 racing-club-de-lens — 형태어 가운데 위치)",
  },
  576: {
    slug: "strasbourg",
    reason: "통칭 'Strasbourg'(규칙 strasbourg-alsace — 지역명 부가)",
  },
  1045: {
    slug: "paris-fc",
    reason: "충돌 — 규칙 'paris'는 파리 생제르맹과 헷갈림(D63 ③ 확정 예)",
  },
  498: {
    slug: "sporting-cp",
    reason:
      "통칭 'Sporting CP'(규칙 sporting-clube-de-portugal) · 충돌 — 'sporting'은 스포르팅 히혼 등과 겹침",
  },
  675: {
    slug: "feyenoord",
    reason: "통칭 'Feyenoord'(규칙 feyenoord-rotterdam — 지명 부가)",
  },
  851: {
    slug: "club-brugge",
    reason:
      "충돌 — 규칙 'brugge'는 세르클러 브뤼헤와 헷갈림, 통칭 'Club Brugge'",
  },
  1899: {
    slug: "aek-athens",
    reason: "충돌 — 규칙 'aek'는 AEK 라르나카와 겹침, 통칭 'AEK Athens'",
  },
  2016: {
    slug: "lask",
    reason: "통칭 'LASK'(규칙 lask-linz — 지명 부가, LASK = Linzer ASK)",
  },
};

/** 팀 slug — 예외표가 있으면 그 값, 없으면 규칙 결과 */
export function teamSlugFor(team: { fd: number; name: string }): string {
  return TEAM_SLUG_OVERRIDES[team.fd]?.slug ?? teamSlugFromName(team.name).slug;
}
