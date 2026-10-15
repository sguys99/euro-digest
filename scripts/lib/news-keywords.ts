/**
 * 뉴스 제목 키워드 표 — 언어별(en·it·es·ko) 공용 위치 (PRD FR-06·FR-21, plan M1-14) — 순수 함수.
 *
 * 점수화(score.ts, FR-06 '키워드(빅클럽·한국 선수·UCL·이적)')가 처음 쓰고, 코드 분류(M1-17 — 카테고리·대회·팀·선수 태그)와
 * 이적 추출(M1-18 — 상태 키워드)이 같은 표를 넓혀 쓴다. 표를 고치면 tests/news-keywords.test.ts의 언어별 사례를 함께 본다.
 * 입력은 **피드 원제목**뿐이다(기사 텍스트·요약문 없음 — D23·D39. 요약문 키워드 규칙은 M1-17이 합성 문자열로 따로 다룬다).
 *
 * ── 맞춰 보기 ──────────────────────────────────────────────────────────────
 *   라틴 문자(en·it·es·그 밖): NFKD로 발음 기호를 떼고(Atlético = Atletico, Barça = Barca) 소문자, 글자·숫자 밖은 공백 →
 *     표현이 **단어 경계**에 맞을 때만(‘sign’은 ‘signal’에 맞지 않는다). 어간 확장은 하지 않는다 — 활용형은 표에 따로 적는다.
 *   한국어: NFKC·소문자, 글자·숫자 밖(공백·문장부호)을 모두 지우고 **부분 문자열**로(조사가 붙는다 — '김민재가', 'AT 마드리드' =
 *     'AT마드리드'). 한국어 제목 속 라틴 약칭(PSG·UCL·EPL·PL·ATM)은 ko 표에 따로 적고, 한글이 없는 표현은 **앞뒤가 라틴
 *     글자·숫자가 아닐 때만** 맞춘다('PL에서'·'[PL REVIEW]'는 맞고 'SPL'·'EPL'의 'pl'·'ATMOSPHERE'의 'atm'은 아니다).
 *   제외 표현(`exclude`): 그 자리를 먼저 지우고 맞춰 본다 — 'Inter Miami'의 Inter, '아시아 챔피언스리그'의 챔피언스리그.
 *   언어 → 표: `ko*` = ko, 그 밖 = `latin`(라틴 공통) ∪ 그 언어 표(en·it·es — 표에 없는 언어는 latin만).
 *
 * ── 설정 재사용 ────────────────────────────────────────────────────────────
 *   한국 선수 = `configs/korean-players.json`의 **활성 선수**(`active: true` — FR-60 '5대 리그 소속 기준', 5대 리그 밖으로 옮긴
 *   선수는 FR-64로 `active: false` — 미등록 손흥민(LAFC)과 같은 취급, `koreanKeywordPlayers`) + `configs/names.ko.json`의 같은 slug 표기.
 *   빅클럽 = 아래 `BIG_CLUBS`(코드 표) + `names.ko.json`의 같은 slug 팀 표기. 빅클럽 목록·별칭을 담는 설정 파일은 아직 없다 —
 *   `configs/bigmatch-rules.json` `rules.bigClub.teams`(M2-08, "FR-06 키워드와 공유 가능")와 names.ko 초기 사전(M1-21 —
 *   빅클럽 표기)이 생기면 그쪽으로 옮길 후보다. 대회 표현은 competitions.json 이름(nameKo '리그 1' 등)이 한국어 제목에서
 *   다른 말과 겹쳐('K리그1'·'리그 1위') 코드 표로 둔다 — 대회 id 집합은 tests가 competitions.json과 대조한다.
 */
import type { CompId, KoreanPlayersFile, NamesKoFile } from "@/lib/schema";

// ─── 표 형식 ─────────────────────────────────────────────────────────────

/** 표 언어 키 — latin은 라틴 문자 언어 공통(en·it·es·그 밖) */
export type TermLang = "latin" | "en" | "it" | "es" | "ko";

/** 언어별 표현 목록 */
export type LangTerms = Readonly<Partial<Record<TermLang, readonly string[]>>>;

/** 키워드 묶음 — 표현 중 하나라도 맞으면 맞음. 제외 표현의 자리는 먼저 지운다 */
export interface KeywordGroup {
  terms: LangTerms;
  exclude?: LangTerms;
}

// ─── 정규화 ───────────────────────────────────────────────────────────────

/** 라틴 맞춤용 텍스트 — 발음 기호 제거·소문자·글자/숫자 밖은 공백, 앞뒤에 공백 하나(단어 경계 비교용) */
export function latinText(text: string): string {
  const folded = text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
  const spaced = folded.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return spaced === "" ? " " : ` ${spaced} `;
}

/** 한국어 맞춤용 텍스트 — NFKC·소문자, 글자/숫자 밖(공백·문장부호) 제거 */
export function koText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** 항목 언어 → 맞춤 방식(ko = 한국어 부분 문자열, 그 밖 = 라틴 단어 경계) */
export function isKoLang(lang: string): boolean {
  return lang.toLowerCase().startsWith("ko");
}

/** 항목 언어 → 라틴 표 키(latin 공통 외에 볼 언어 표) — en·it·es가 아니면 null(latin만) */
function latinLangKey(lang: string): "en" | "it" | "es" | null {
  const base = lang.toLowerCase().split(/[-_]/)[0];
  return base === "en" || base === "it" || base === "es" ? base : null;
}

// ─── 컴파일 ───────────────────────────────────────────────────────────────

/** 정규화를 미리 해 둔 키워드 묶음 */
export interface CompiledGroup {
  /** 라틴: latin 공통 + 언어별(정규화된 ` 단어 … ` 형태) */
  latin: readonly string[];
  byLang: Readonly<Record<"en" | "it" | "es", readonly string[]>>;
  /** 한국어: 한글이 든 표현(부분 문자열) */
  ko: readonly string[];
  /** 한국어 제목 속 라틴 약칭(한글이 없는 표현) — 앞뒤가 라틴 글자·숫자가 아닐 때만 */
  koAscii: readonly RegExp[];
  /** 라틴 제외 표현(단어 경계 정규식 — 겹쳐 나와도 모두 지운다) */
  excludeLatin: readonly RegExp[];
  excludeByLang: Readonly<Record<"en" | "it" | "es", readonly RegExp[]>>;
  excludeKo: readonly string[];
  excludeKoAscii: readonly RegExp[];
}

const uniq = (values: readonly string[]): string[] => [...new Set(values)];

function compileLatin(terms: readonly string[] | undefined): string[] {
  return uniq((terms ?? []).map(latinText).filter((t) => t.trim() !== ""));
}

/**
 * 라틴 제외 표현 → 단어 경계 정규식. 정규화한 텍스트는 글자·숫자·공백뿐이라 정규식 특수 문자가 없다.
 * 앞뒤 공백을 소비하지 않아(lookaround) 'inter miami inter miami'처럼 이어 나와도 모두 지운다.
 */
function compileLatinExcludes(terms: readonly string[] | undefined): RegExp[] {
  return compileLatin(terms).map(
    (padded) => new RegExp(`(?<= )${padded.trim()}(?= )`, "gu"),
  );
}

/** 한글이 없는 표현인가(한국어 제목 속 라틴 약칭) */
function withoutHangul(term: string): boolean {
  return !/\p{Script=Hangul}/u.test(term);
}

function compileKo(terms: readonly string[] | undefined): string[] {
  return uniq(
    (terms ?? [])
      .filter((t) => !withoutHangul(t))
      .map(koText)
      .filter((t) => t !== ""),
  );
}

/**
 * 한국어 표의 라틴 약칭 → 정규식(NFKC·소문자 원문에 적용). 앞뒤가 라틴 글자·숫자가 아니어야 맞는다 — 한글 조사·문장부호·
 * 공백은 경계다. 여러 단어면 사이 공백은 하나 이상. `flags`: 검사용 "u", 지우기용 "gu".
 */
function compileKoAscii(
  terms: readonly string[] | undefined,
  flags: "u" | "gu",
): RegExp[] {
  const bodies = uniq(
    (terms ?? [])
      .filter(withoutHangul)
      .map((t) => t.normalize("NFKC").toLowerCase().trim())
      .filter((t) => /[a-z0-9]/.test(t)),
  );
  return bodies.map((body) => {
    const pattern = body
      .split(/\s+/)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    return new RegExp(`(?<![a-z0-9])${pattern}(?![a-z0-9])`, flags);
  });
}

/** 키워드 묶음을 맞춤용으로 정규화한다 */
export function compileGroup(group: KeywordGroup): CompiledGroup {
  const { terms, exclude = {} } = group;
  return {
    latin: compileLatin(terms.latin),
    byLang: {
      en: compileLatin(terms.en),
      it: compileLatin(terms.it),
      es: compileLatin(terms.es),
    },
    ko: compileKo(terms.ko),
    koAscii: compileKoAscii(terms.ko, "u"),
    excludeLatin: compileLatinExcludes(exclude.latin),
    excludeByLang: {
      en: compileLatinExcludes(exclude.en),
      it: compileLatinExcludes(exclude.it),
      es: compileLatinExcludes(exclude.es),
    },
    excludeKo: compileKo(exclude.ko),
    excludeKoAscii: compileKoAscii(exclude.ko, "gu"),
  };
}

/** 정규화한 제목 1건(라틴·한국어 둘 다 만들어 둔다 — 묶음마다 다시 만들지 않게) */
export interface TitleText {
  ko: boolean;
  lang: "en" | "it" | "es" | null;
  latin: string;
  hangul: string;
  /** NFKC·소문자 원문(한국어 제목 속 라틴 약칭 맞춤용) */
  raw: string;
}

export function titleText(title: string, lang: string): TitleText {
  return {
    ko: isKoLang(lang),
    lang: latinLangKey(lang),
    latin: latinText(title),
    hangul: koText(title),
    raw: title.normalize("NFKC").toLowerCase(),
  };
}

/** 제외 표현 자리를 지운다(그 자리는 글자가 아닌 표시로 — 단어 경계 유지) */
function stripLatin(text: string, excludes: readonly RegExp[]): string {
  let out = text;
  for (const ex of excludes) out = out.replace(ex, "\u0000");
  return out;
}

function stripKo(text: string, excludes: readonly string[]): string {
  let out = text;
  for (const ex of excludes) out = out.split(ex).join("\u0000");
  return out;
}

/** 제목이 묶음에 맞는가 */
export function matchesGroup(text: TitleText, group: CompiledGroup): boolean {
  if (text.ko) {
    if (group.ko.length === 0 && group.koAscii.length === 0) return false;
    const hay = stripKo(text.hangul, group.excludeKo);
    if (group.ko.some((term) => hay.includes(term))) return true;
    const raw = stripLatin(text.raw, group.excludeKoAscii);
    return group.koAscii.some((re) => re.test(raw));
  }
  const langTerms = text.lang ? group.byLang[text.lang] : [];
  if (group.latin.length === 0 && langTerms.length === 0) return false;
  const excludes = text.lang
    ? [...group.excludeLatin, ...group.excludeByLang[text.lang]]
    : group.excludeLatin;
  const hay = stripLatin(text.latin, excludes);
  return (
    group.latin.some((term) => hay.includes(term)) ||
    langTerms.some((term) => hay.includes(term))
  );
}

// ─── 표: 이적 ─────────────────────────────────────────────────────────────

/**
 * 이적 화제(FR-06 키워드 '이적', FR-105 이적 창 가중 대상). 상태(rumor~official) 판정이 아니다 — 상태 표·의문·부정형은
 * M1-18이 이 옆에 둔다. 너무 흔한 말(deal·talks·move·target·join 계열 일부)은 오탐이 많아 넣지 않았다.
 */
export const TRANSFER_TERMS: KeywordGroup = {
  terms: {
    latin: ["here we go"],
    en: [
      "transfer",
      "transfers",
      "sign",
      "signs",
      "signed",
      "signing",
      "signings",
      "loan",
      "loaned",
      "bid",
      "bids",
      "offer",
      "fee",
      "release clause",
      "free agent",
      "medical",
      "contract",
      "new deal",
      "swap",
      "linked",
      "joins",
      "agreement",
      "agree terms",
      "agrees terms",
      "agreed terms",
      "agreed fee",
      "gossip", // BBC 'gossip' = 이적설 모음
    ],
    it: [
      "calciomercato",
      "mercato",
      "trattativa",
      "trattative",
      "accordo",
      "cessione",
      "acquisto",
      "prestito",
      "firma",
      "rinnovo",
      "offerta",
      "visite mediche",
      "contratto",
      "clausola",
      "trasferimento",
      "ingaggio",
    ],
    es: [
      "fichaje",
      "fichajes",
      "fichar",
      "ficha por",
      "traspaso",
      "cesion",
      "cedido",
      "oferta",
      "renovacion",
      "renueva",
      "renovar",
      "contrato",
      "clausula",
      "acuerdo",
      "negociacion",
      "negocia",
      "agente libre",
      "prestamo",
    ],
    ko: [
      "이적",
      "영입",
      "임대",
      "재계약",
      "계약",
      "협상",
      "합의",
      "바이아웃",
      "방출",
      "메디컬",
      "히어 위 고",
      "자유계약",
      "러브콜",
    ],
  },
  // 이적이 아닌 흔한 쓰임 — 배수가 1.2라 자주 나오는 것만(무리하게 늘리지 않는다)
  exclude: {
    en: [
      "title bid",
      "world cup bid",
      "hosting bid",
      "bid to host",
      "shows signs",
      "signs of",
      "medical staff",
      "medical team",
      "medical emergency",
      "medical attention",
      "offer hope",
      "offers hope",
    ],
    it: [
      "firma il gol",
      "firma la rete",
      "firma il pareggio",
      "firma il raddoppio",
      "firma la doppietta",
      "firma la tripletta",
      "firma la vittoria",
      "firma il successo",
    ],
  },
};

// ─── 표: 대회(범위 근거) ───────────────────────────────────────────────────

/**
 * 대회 표현 — 제목에 서비스 범위 대회(5대 리그·UCL)가 나오면 대회 근거(점수화의 범위 판단, M1-17 대회 태그 후보).
 * 한국어 '리그1'·'리그 1'은 'K리그1'·'리그 1위'·'리그 10경기'와 겹쳐 쓰지 않고 '리그앙'·'프랑스 리그'만 쓴다.
 */
export const COMPETITION_TERMS: Readonly<Record<CompId, KeywordGroup>> = {
  EPL: {
    terms: {
      latin: ["premier league", "epl"],
      en: ["pl"], // 'Liverpool want PL winger'
      // 'PL'은 국내 제목의 프리미어리그 약칭('[PL REVIEW]'·'PL 올해의 선수') — 라틴 경계로만 맞춰 'SPL'·'EPL'과 겹치지 않는다
      ko: ["프리미어리그", "프리미어리거", "epl", "pl"],
    },
  },
  LALIGA: {
    terms: { latin: ["laliga", "la liga"], ko: ["라리가"] },
    exclude: {
      latin: ["laliga hypermotion", "laliga 2", "la liga 2", "liga f"],
    },
  },
  SERIEA: {
    terms: { latin: ["serie a"], ko: ["세리에 a"] },
  },
  BUNDESLIGA: {
    terms: { latin: ["bundesliga"], ko: ["분데스리가", "분데스"] },
    exclude: {
      latin: ["2 bundesliga", "frauen bundesliga"],
      ko: ["2분데스리가", "분데스리가2"],
    },
  },
  LIGUE1: {
    terms: { latin: ["ligue 1"], ko: ["리그앙", "프랑스 리그"] },
    exclude: { latin: ["ligue 1 feminine"], ko: ["프랑스 리그2"] },
  },
  UCL: {
    terms: {
      latin: ["champions league", "ucl"],
      it: ["champions"],
      es: ["champions", "liga de campeones"],
      ko: ["챔피언스리그", "챔스", "ucl"],
    },
    exclude: {
      latin: [
        "afc champions league",
        "caf champions league",
        "concacaf champions",
        "women s champions league",
        "champions cup",
      ],
      it: ["champions femminile", "champions league femminile"],
      es: [
        "liga de campeones de la concacaf",
        "liga de campeones de concacaf",
        "liga de campeones de la afc",
        "liga de campeones de la caf",
        "liga de campeones femenina",
        "champions femenina",
        "champions league femenina",
      ],
      ko: [
        "아시아 챔피언스리그",
        "아시아 챔스",
        "afc 챔피언스리그",
        "afc 챔스",
        "여자 챔피언스리그",
      ],
    },
  },
};

// ─── 표: 빅클럽 ───────────────────────────────────────────────────────────

/** 빅클럽 1개 — slug는 names.ko.json·team-ids.json과 같은 값(있으면 그 표기를 합친다) */
export interface BigClub {
  slug: string;
  terms: LangTerms;
  exclude?: LangTerms;
}

/**
 * 빅클럽(FR-06 키워드) — 5대 리그 전통 강호 16곳. 범위·값은 코드 상수(transfer-windows.json `boost` 외 점수화 가중치는
 * 코드 상수 — configs.ts 주석). names.ko.json에 같은 slug 팀이 있으면 그 표기(en·ko)를 더한다(지금 바이에른 뮌헨·
 * 아틀레티코 마드리드). 짧은 별칭의 오탐은 제외 표현으로 막는다(Inter Miami·Inter Milan의 Milan·레알 소시에다드·
 * Juve Stabia). 여자팀('Arsenal Women'·'Barcelona Femení'·'첼시 위민')은 서비스 범위(남자 5대 리그·UCL) 밖이라 색인이 모든
 * 별칭에 여자팀 표현을 붙여 제외한다(`womenTeamExcludes`).
 */
export const BIG_CLUBS: readonly BigClub[] = [
  {
    slug: "real-madrid",
    terms: { latin: ["real madrid"], ko: ["레알 마드리드", "레알"] },
    exclude: {
      ko: [
        "레알 소시에다드",
        "레알 베티스",
        "레알 마요르카",
        "레알 바야돌리드",
        "레알 오비에도",
      ],
    },
  },
  {
    slug: "barcelona",
    terms: {
      latin: ["barcelona", "barca"],
      ko: ["바르셀로나", "바르사", "바르샤"],
    },
  },
  {
    slug: "atletico-de-madrid",
    terms: {
      latin: ["atletico madrid", "atletico de madrid", "atleti"],
      ko: ["아틀레티코", "at 마드리드", "atm"],
    },
  },
  {
    slug: "manchester-city",
    terms: {
      latin: ["manchester city", "man city"],
      ko: ["맨체스터 시티", "맨시티"],
    },
  },
  {
    slug: "manchester-united",
    terms: {
      latin: ["manchester united", "man utd", "man united"],
      ko: ["맨체스터 유나이티드", "맨유"],
    },
  },
  { slug: "liverpool", terms: { latin: ["liverpool"], ko: ["리버풀"] } },
  { slug: "arsenal", terms: { latin: ["arsenal"], ko: ["아스널"] } },
  { slug: "chelsea", terms: { latin: ["chelsea"], ko: ["첼시"] } },
  {
    slug: "tottenham-hotspur",
    terms: { latin: ["tottenham", "spurs"], ko: ["토트넘"] },
  },
  {
    slug: "bayern-munchen",
    terms: { latin: ["bayern"], ko: ["바이에른", "뮌헨"] },
    exclude: { ko: ["뮌헨글라트바흐"] }, // 묀헨글라트바흐의 다른 표기
  },
  {
    slug: "borussia-dortmund",
    terms: { latin: ["dortmund", "bvb"], ko: ["도르트문트"] },
  },
  {
    slug: "paris-saint-germain",
    terms: {
      latin: ["paris saint germain", "paris st germain", "psg"],
      ko: ["파리 생제르맹", "psg"],
    },
  },
  {
    slug: "juventus",
    terms: { latin: ["juventus", "juve"], ko: ["유벤투스"] },
    exclude: { latin: ["juve stabia"] },
  },
  {
    slug: "internazionale-milano",
    terms: {
      latin: ["inter milan", "internazionale", "inter"],
      ko: ["인터 밀란", "인테르"],
    },
    exclude: { latin: ["inter miami", "inter de miami"] },
  },
  {
    slug: "milan",
    terms: { latin: ["ac milan", "milan"], ko: ["ac 밀란", "밀란"] },
    exclude: { latin: ["inter milan"], ko: ["인터 밀란"] },
  },
  { slug: "ssc-napoli", terms: { latin: ["napoli"], ko: ["나폴리"] } },
];

// ─── 색인 ────────────────────────────────────────────────────────────────

export interface SlugGroup {
  slug: string;
  group: CompiledGroup;
}

/** 설정에서 만든 키워드 색인 */
export interface KeywordIndex {
  transfer: CompiledGroup;
  competitions: ReadonlyArray<{ comp: CompId; group: CompiledGroup }>;
  bigClubs: readonly SlugGroup[];
  koreanPlayers: readonly SlugGroup[];
}

/** names.ko.json 항목 중 그 slug·유형의 표기(en·ko) */
function namesOf(
  names: NamesKoFile | null | undefined,
  slug: string,
  kind: "team" | "player",
): { en: string[]; ko: string[] } {
  const entries = (names?.entries ?? []).filter(
    (e) => e.slug === slug && e.kind === kind,
  );
  return {
    en: entries.flatMap((e) => e.en),
    ko: entries.map((e) => e.ko),
  };
}

/**
 * 한국어 이름의 맞춤 표현 — 띄어 쓴 이름('옌스 카스트로프')은 마지막 단어(3글자 이상 — '카스트로프')로도 맞춘다
 * (국내 제목은 성만 쓰는 일이 잦다). 한 단어 이름은 그대로.
 */
export function koNameTerms(name: string): string[] {
  const words = name.trim().split(/\s+/);
  const last = words.at(-1) ?? "";
  return words.length > 1 && last.length >= 3 ? [name, last] : [name];
}

/** 여자팀 표현(별칭 뒤에 붙는 말) — 빅클럽 배수·범위 근거에서 뺀다 */
const WOMEN_SUFFIXES: Readonly<Record<"latin" | "ko", readonly string[]>> = {
  latin: [
    "women",
    "ladies",
    "femeni",
    "femenino",
    "femenil",
    "femminile",
    "feminine",
    "feminin",
    "frauen",
  ],
  ko: ["위민", "여자팀", "여자 축구", "페메니"],
};

/** 별칭마다 여자팀 표현을 붙인 제외 표현('arsenal women'·'첼시 위민') */
export function womenTeamExcludes(terms: LangTerms): LangTerms {
  return {
    latin: (terms.latin ?? []).flatMap((t) =>
      WOMEN_SUFFIXES.latin.map((w) => `${t} ${w}`),
    ),
    ko: (terms.ko ?? []).flatMap((t) =>
      WOMEN_SUFFIXES.ko.map((w) => `${t} ${w}`),
    ),
  };
}

/**
 * 한국 선수 키워드 대상 — 활성 선수만(`active: true`). FR-60 명단은 '5대 리그 소속 기준'이고, 5대 리그 밖으로 옮기면 FR-64로
 * `active: false`('기타 리그' — 목록에는 남지만 기록 갱신 중단)가 된다. 그런 선수의 기사는 미등록 선수(손흥민 LAFC 등)처럼
 * 한국 선수 배수·범위 근거를 받지 않는다 — M1-17 `kr` 판정도 이 함수와 같은 기준을 쓴다.
 */
export function koreanKeywordPlayers(
  players: KoreanPlayersFile | null | undefined,
): KoreanPlayersFile {
  return (players ?? []).filter((p) => p.active);
}

/**
 * 키워드 색인을 만든다 — 한국 선수는 `koreanKeywordPlayers`(활성 등록 선수), 빅클럽·대회·이적은 코드 표 + names.ko 표기.
 * 설정이 없으면(null — 읽기 실패) 코드 표만 쓴다.
 */
export function buildKeywordIndex(input: {
  names?: NamesKoFile | null;
  koreanPlayers?: KoreanPlayersFile | null;
}): KeywordIndex {
  const { names, koreanPlayers } = input;
  return {
    transfer: compileGroup(TRANSFER_TERMS),
    competitions: (Object.keys(COMPETITION_TERMS) as CompId[]).map((comp) => ({
      comp,
      group: compileGroup(COMPETITION_TERMS[comp]),
    })),
    bigClubs: BIG_CLUBS.map((club) => {
      const extra = namesOf(names, club.slug, "team");
      const terms: LangTerms = {
        ...club.terms,
        latin: [...(club.terms.latin ?? []), ...extra.en],
        ko: [...(club.terms.ko ?? []), ...extra.ko],
      };
      const women = womenTeamExcludes(terms);
      return {
        slug: club.slug,
        group: compileGroup({
          terms,
          exclude: {
            ...club.exclude,
            latin: [...(club.exclude?.latin ?? []), ...(women.latin ?? [])],
            ko: [...(club.exclude?.ko ?? []), ...(women.ko ?? [])],
          },
        }),
      };
    }),
    koreanPlayers: koreanKeywordPlayers(koreanPlayers).map((player) => {
      const extra = namesOf(names, player.slug, "player");
      return {
        slug: player.slug,
        group: compileGroup({
          terms: {
            latin: [player.nameEn, ...extra.en],
            ko: [player.nameKo, ...extra.ko].flatMap(koNameTerms),
          },
        }),
      };
    }),
  };
}

/** 제목 1건(또는 여러 건)의 키워드 결과 */
export interface TitleHits {
  /** 제목에 나온 범위 대회(COMPETITION_TERMS 순서) */
  comps: CompId[];
  /** 빅클럽 slug(BIG_CLUBS 순서) */
  bigClubs: string[];
  /** 활성 등록 한국 선수 slug(korean-players.json 순서) */
  koreanPlayers: string[];
  /** 이적 화제 */
  transfer: boolean;
}

/** 제목들(같은 사건 클러스터의 구성 기사)의 키워드 결과 — 하나라도 맞으면 맞음(합집합) */
export function matchTitles(
  titles: ReadonlyArray<{ title: string; lang: string }>,
  index: KeywordIndex,
): TitleHits {
  const texts = titles.map((t) => titleText(t.title, t.lang));
  const matchesAny = (group: CompiledGroup) =>
    texts.some((text) => matchesGroup(text, group));
  return {
    comps: index.competitions
      .filter((c) => matchesAny(c.group))
      .map((c) => c.comp),
    bigClubs: index.bigClubs
      .filter((c) => matchesAny(c.group))
      .map((c) => c.slug),
    koreanPlayers: index.koreanPlayers
      .filter((p) => matchesAny(p.group))
      .map((p) => p.slug),
    transfer: matchesAny(index.transfer),
  };
}
