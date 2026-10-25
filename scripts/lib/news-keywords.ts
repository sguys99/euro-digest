/**
 * 뉴스 제목 키워드 표 — 언어별(en·it·es·ko) 공용 위치 (PRD FR-06·FR-21, plan M1-14) — 순수 함수.
 *
 * 점수화(score.ts, FR-06 '키워드(빅클럽·한국 선수·UCL·이적)')가 처음 쓰고, 코드 분류(M1-17 — classify.ts 카테고리·spoiler 표,
 * news-scope.ts 범위 밖 표, tag-names.ts 팀·선수 태그)와 이적 추출(M1-18 — 상태 키워드)이 같은 표를 넓혀 쓴다. 표를 고치면
 * tests/news-keywords.test.ts·tests/classify.test.ts·tests/news-scope.test.ts의 언어별 사례를 함께 본다.
 * 입력은 **피드 원제목**이다(기사 본문 없음 — D23). 메모리 안 RSS 요약문(D39 ①)은 classify.ts(spoiler)·news-scope.ts(남기는 근거)가
 * 같은 맞춤 규칙으로 본다 — 요약문 규칙은 합성 문자열로 테스트한다.
 * 한국어 표는 **낱말 경계**로 맞춘다(M1-17 리뷰 — 공백을 지운 부분 문자열은 '가수'가 '김민재가 수비'에, '음원'이 '다음 원정'에,
 * '골프'가 '골 프라이부르크'에, '당구'가 '해당 구단'에 맞았다). '연패'(連霸·連敗)처럼 뜻이 갈리는 말은 넣지 않는다.
 *
 * ── 맞춰 보기 ──────────────────────────────────────────────────────────────
 *   라틴 문자(en·it·es·그 밖): NFKD로 발음 기호를 떼고(Atlético = Atletico, Barça = Barca) 소문자, 글자·숫자 밖은 공백 →
 *     표현이 **단어 경계**에 맞을 때만(‘sign’은 ‘signal’에 맞지 않는다). 어간 확장은 하지 않는다 — 활용형은 표에 따로 적는다.
 *   한국어: NFKC·소문자·공백 하나(`koSpacedText`) → 표현이 **낱말 앞**에서 시작할 때만(앞이 한글이 아니다 — `koTermRegex`).
 *     뒤는 열려 있어 조사가 붙는다('김민재가'·'이적설'). 표현 안의 띄어쓰기 자리는 공백이 있어도 없어도 된다('AT 마드리드' =
 *     'AT마드리드'), 띄어쓰기가 없는 자리에 공백이 끼면 맞지 않는다('음원' ≠ '다음 원정'). `koWhole`은 낱말 전체(뒤가 조사뿐 —
 *     '배우' ≠ '배우고'), `koInfix`는 합성어 안에서도('부산국제영화제'의 '영화제'). 한국어 제목 속 라틴 약칭(PSG·UCL·EPL·PL·ATM)은
 *     ko 표에 따로 적고, 한글이 없는 표현은 **앞뒤가 라틴 글자·숫자가 아닐 때만** 맞춘다('PL에서'·'[PL REVIEW]'는 맞고 'SPL'·'EPL'의
 *     'pl'·'ATMOSPHERE'의 'atm'은 아니다).
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
  /**
   * 한국어 제외 정규식(`koSpacedText`에 그대로 적용, `g` 플래그 필수) — 조사 뒤에 오는 말처럼 낱말 앞 경계로는 적을 수 없는 제외('후보로
   * 부상'의 부상 = 떠오르다, '팬들에게 웃었다'). 맞은 자리를 지운다.
   */
  excludeKoRe?: readonly RegExp[];
  /**
   * 한국어 **낱말 전체**로만 맞출 표현 — 뒤가 끝·글자 아님·조사(`KO_SUFFIXES`)일 때만('배우'는 '배우가'·'배우로서'에 맞고
   * '배우고'·'배우다'에는 맞지 않는다, '패'는 '울브스 패'에 맞고 '패스'에는 맞지 않는다). `terms.ko`는 낱말 앞부분만 본다.
   */
  koWhole?: readonly string[];
  /** 한국어 낱말 **안에서도** 맞출 표현(합성어 뒷부분 — '부산국제영화제'의 '영화제', '대역전극'의 '역전극'). 다른 말과 겹치지 않는 것만 */
  koInfix?: readonly string[];
}

/**
 * 한국어 낱말 뒤에 붙어도 되는 말 — 조사·경기 접미('토트넘전')·방향('뮌헨행'). 이어 붙는 것은 최대 3개('맨시티전에서는').
 * 낱말 전체 표현(`koWhole`)과 팀·선수 이름(tag-names.ts)의 뒤 경계다.
 */
export const KO_SUFFIXES: readonly string[] = [
  "에서는",
  "에서도",
  "에게서",
  "으로서",
  "이라는",
  "이었다",
  "에서",
  "에게",
  "한테",
  "으로",
  "까지",
  "부터",
  "보다",
  "처럼",
  "이다",
  "이며",
  "이자",
  "이나",
  "이랑",
  "라는",
  "였다",
  "로서",
  "에선",
  "마저",
  "조차",
  "와의",
  "과의",
  "이",
  "가",
  "은",
  "는",
  "을",
  "를",
  "의",
  "와",
  "과",
  "에",
  "서",
  "께",
  "도",
  "만",
  "로",
  "나",
  "랑",
  "전",
  "행",
  "측",
  "쪽",
  "엔",
  "선",
  "라",
  "인",
  "등",
];

/** 조사 이어 붙음(최대 3개) 정규식 조각 */
export const KO_SUFFIX_PATTERN = `(?:${KO_SUFFIXES.join("|")}){0,3}`;

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

/**
 * 한국어 비교 키 — NFKC·소문자, 글자/숫자 밖(공백·문장부호) 제거. 맞추기에는 쓰지 않는다(부분 문자열은 '가수'가 '김민재가 수비'에,
 * '음원'이 '다음 원정'에 맞는다 — M1-17 리뷰). 맞추기는 공백을 남긴 `koSpacedText` + 낱말 경계 정규식.
 */
export function koText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** 한국어 맞춤용 텍스트 — NFKC·소문자, 공백(NBSP·전각 공백 포함) 연속은 공백 하나 */
export function koSpacedText(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

/** 항목 언어 → 맞춤 방식(ko = 한국어 낱말 경계, 그 밖 = 라틴 단어 경계) */
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
  /** 한국어: 한글이 든 표현(낱말 앞 경계 정규식 — `koTermRegex`) */
  ko: readonly RegExp[];
  /** 한국어 제목 속 라틴 약칭(한글이 없는 표현) — 앞뒤가 라틴 글자·숫자가 아닐 때만 */
  koAscii: readonly RegExp[];
  /** 라틴 제외 표현(단어 경계 정규식 — 겹쳐 나와도 모두 지운다) */
  excludeLatin: readonly RegExp[];
  excludeByLang: Readonly<Record<"en" | "it" | "es", readonly RegExp[]>>;
  excludeKo: readonly RegExp[];
  excludeKoAscii: readonly RegExp[];
  /** 한국어 제외 정규식(`KeywordGroup.excludeKoRe` 그대로) */
  excludeKoRe: readonly RegExp[];
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

const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 한국어 표현(한글이 든 것) → 정규식(`koSpacedText`에 적용). **앞 경계**: 첫 글자가 한글이면 앞이 한글이 아니고, 라틴 글자면 앞이
 * 라틴 글자가 아니다(숫자로 시작하면 경계 없음 — '15도움'). 표현 안의 띄어쓰기 자리는 공백이 있어도 없어도 된다('예비 부부'·'FC서울'),
 * 띄어쓰기가 없는 자리에 공백이 끼면 맞지 않는다('음원' ≠ '다음 원정', '화보' ≠ '변화 보여준'). **뒤**: 기본은 열림(조사가 붙는다 —
 * '이적설'·'부상으로'), `whole`이면 끝·글자 아님·조사만(`KO_SUFFIXES`).
 */
export function koTermRegex(
  term: string,
  flags: "u" | "gu",
  whole = false,
  infix = false,
): RegExp | null {
  const t = term.normalize("NFKC").toLowerCase().trim();
  if (t === "") return null;
  const body = t.split(/\s+/u).map(escapeRe).join("\\s?");
  const first = t[0] ?? "";
  const lead = infix
    ? ""
    : /\p{Script=Hangul}/u.test(first)
      ? "(?<!\\p{Script=Hangul})"
      : /[a-z]/u.test(first)
        ? "(?<![a-z])"
        : "";
  const tail = whole
    ? `(?=${KO_SUFFIX_PATTERN}(?![\\p{Script=Hangul}a-z0-9]))`
    : "";
  return new RegExp(`${lead}${body}${tail}`, flags);
}

function compileKo(
  terms: readonly string[] | undefined,
  flags: "u" | "gu",
  whole = false,
  infix = false,
): RegExp[] {
  return uniq((terms ?? []).filter((t) => !withoutHangul(t))).flatMap((t) => {
    const re = koTermRegex(t, flags, whole, infix);
    return re ? [re] : [];
  });
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
    ko: [
      ...compileKo(terms.ko, "u"),
      ...compileKo(group.koWhole, "u", true),
      ...compileKo(group.koInfix, "u", false, true),
    ],
    koAscii: compileKoAscii(terms.ko, "u"),
    excludeLatin: compileLatinExcludes(exclude.latin),
    excludeByLang: {
      en: compileLatinExcludes(exclude.en),
      it: compileLatinExcludes(exclude.it),
      es: compileLatinExcludes(exclude.es),
    },
    excludeKo: compileKo(exclude.ko, "gu"),
    excludeKoAscii: compileKoAscii(exclude.ko, "gu"),
    excludeKoRe: (group.excludeKoRe ?? []).map((re) =>
      re.global ? re : new RegExp(re.source, `${re.flags}g`),
    ),
  };
}

/** 정규화한 제목 1건(라틴·한국어 둘 다 만들어 둔다 — 묶음마다 다시 만들지 않게) */
export interface TitleText {
  ko: boolean;
  lang: "en" | "it" | "es" | null;
  latin: string;
  /** NFKC·소문자·공백 하나(한국어 표현·라틴 약칭 맞춤용) */
  raw: string;
}

export function titleText(title: string, lang: string): TitleText {
  return {
    ko: isKoLang(lang),
    lang: latinLangKey(lang),
    latin: latinText(title),
    raw: koSpacedText(title),
  };
}

/** 제외 표현 자리를 지운다(그 자리는 글자가 아닌 표시로 — 단어 경계 유지) */
function stripLatin(text: string, excludes: readonly RegExp[]): string {
  let out = text;
  for (const ex of excludes) out = out.replace(ex, "\u0000");
  return out;
}

/** 한국어 제외 표현 자리를 같은 길이의 글자 아닌 표시로 지운다 */
function stripKo(text: string, excludes: readonly RegExp[]): string {
  let out = text;
  for (const ex of excludes) {
    out = out.replace(ex, (m) => "\u0000".repeat(m.length));
  }
  return out;
}

/** 제목이 묶음에 맞는가 */
export function matchesGroup(text: TitleText, group: CompiledGroup): boolean {
  if (text.ko) {
    if (group.ko.length === 0 && group.koAscii.length === 0) return false;
    const hay = stripLatin(
      stripKo(stripKo(text.raw, group.excludeKoRe), group.excludeKo),
      group.excludeKoAscii,
    );
    return (
      group.ko.some((re) => re.test(hay)) ||
      group.koAscii.some((re) => re.test(hay))
    );
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
 * 이적 합성어(붙여 쓴 꾸밈말 + 이적·영입) — 이적 표(`TRANSFER_TERMS`)와 이적 자체 표(`TRANSFER_STRONG_TERMS`)의 `koInfix`. '이적'·'영입'을
 * 합성어 안에서 통째로 맞추면 다른 말과 겹칠 수 있어 꾸밈말을 붙인 꼴만 적는다.
 */
const KO_TRANSFER_COMPOUNDS: readonly string[] = [
  "완전이적",
  "깜짝이적",
  "전격이적",
  "자유이적",
  "임대이적",
  "완전영입",
  "깜짝영입",
  "전격영입",
  "재영입",
  "임대영입",
];

/**
 * 지난 이적을 꾸미는 관형형(국내 제목 — `koSpacedText`에 적용) — ① '이적한'·'이적했던'·'영입된'·'임대된'·'이적시킨'·'이적해 온'·
 * '이적하자마자' ② '이적(을)
 * 설득한'·'영입을 주도한'·'이적 성사시킨'·'이적 거절한' ③ '이적(을) 이끈'·'이적 도운'·'이적 막은' ④ '이적 당시'·'영입 당시'·'이적
 * 시절'·'이적 1주년'·'이적 이후'. 뒤가 한글이면 맞지 않는다('이적한다'·
 * '영입했다'는 지금 소식). 합성어 꾸밈말('완전이적한')도 같은 자리다.
 */
export const KO_PAST_TRANSFER_RE: readonly RegExp[] = [
  /(?:이적|영입|임대)(?:한|했던|된|됐던|되었던|시킨|시켰던|해\s?온|해\s?간|하자마자)(?![\p{Script=Hangul}])/gu,
  /(?:이적|영입|임대)\s?(?:을|를)?\s?(?:설득|주도|성사|권유|만류|반대|성공|거절)(?:한|했던|시킨|시켰던)(?![\p{Script=Hangul}])/gu,
  /(?:이적|영입|임대)\s?(?:을|를)?\s?(?:이끈|이끌었던|도운|도왔던|막은|막았던)(?![\p{Script=Hangul}])/gu,
  // ④ 때·기념일 — '이적 당시'·'영입 당시 이적료'·'이적 시절'·'이적 1주년'·'이적 이후'(M1-18 리뷰)
  /(?:이적|영입|임대|입단)\s?(?:\d+\s?)?(?:주년|당시|시절|이후|직후)(?:\s?이적료)?(?![\p{Script=Hangul}])/gu,
];

/**
 * 이적 화제(FR-06 키워드 '이적', FR-105 이적 창 가중 대상, FR-21 카테고리). 단계(rumor~official·collapsed) 판정이 아니다 — 단계 표·
 * 의문·부정형은 아래 '표: 이적 단계'(M1-18 — `TRANSFER_RUMOR_TERMS` 등, transfer-extract.ts)다. 너무 흔한 말(deal·talks·move·target·join
 * 계열 일부)은 오탐이 많아 넣지 않았다. 국내 제목의 **지난 이적을 꾸미는 말**('이강인 이적 설득한 코케'·'나폴리 이적 이끈 인물'·'여름에
 * 영입한 수비수'·'리버풀로 이적한 바르콜라')은 지금 이적 소식이 아니다(`KO_PAST_TRANSFER_RE` — M1-17 이월).
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
      // 성사된 이적('All done deals in September & October 2026' — M1-43 실데이터)
      "done deal",
      "done deals",
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
      "ficha a",
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
      "입단",
      // 친정 복귀 이적설('아놀드, 리버풀 리턴설?' — M1-43 실데이터, '구단'으로 감독·구단이 됐다)
      "리턴설",
    ],
  },
  // 붙여 쓴 합성어('이강인, 완전이적 임박'·'맨유, 전격영입 발표') — 낱말 앞 경계로는 맞지 않는다(M1-17 재리뷰)
  koInfix: KO_TRANSFER_COMPOUNDS,
  // 지난 이적을 꾸미는 말(관형형 — '이적한'·'영입된'·'이적 설득한'·'이적 이끈')은 지운다(M1-18 — '이강인 이적 설득한 코케, 부상 이탈'이
  // 이적으로 분류됐다, M1-17 이월). '이적한다'·'영입했다'(지금 소식)는 지우지 않는다
  excludeKoRe: KO_PAST_TRANSFER_RE,
  // 이적이 아닌 흔한 쓰임 — 배수가 1.2라 자주 나오는 것만(무리하게 늘리지 않는다)
  exclude: {
    en: [
      "title bid",
      "world cup bid",
      "hosting bid",
      "bid to host",
      "shows signs",
      "signs of",
      // '... a sign of Premier League power'(조짐) — M1-43 실데이터, 결과 기사가 이적이 됐다
      "sign of",
      // 중계권 입찰('SPFL invites bids for new Scottish Premiership TV deal' — M1-43 실데이터). 'Man Utd invite bids for Rashford'(선수
      // 입찰 받기)는 이적이라 중계권·새 계약 문형만 지운다(M1-43 리뷰)
      "invites bids for new",
      "invite bids for new",
      "invited bids for new",
      "bids for tv rights",
      "bids for broadcast rights",
      "bids for broadcasting rights",
      "bids for media rights",
      "tv rights bids",
      "broadcast rights bids",
      // 성사 부정('far from a done deal'·'not a done deal' — M1-43 리뷰)
      "far from a done deal",
      "not a done deal",
      "not yet a done deal",
      "isn t a done deal",
      "no done deal",
      "medical staff",
      "medical team",
      "medical emergency",
      "medical attention",
      "offer hope",
      "offers hope",
      // 순위·우승 도전('Howe talks up top-four bid' — 이적 입찰이 아니다, M1-17 3차 리뷰)
      "top four bid",
      "top 4 bid",
      "top six bid",
      "promotion bid",
      "survival bid",
      "treble bid",
      "double bid",
    ],
    // '리버풀 이적 후 첫 골' — 이적한 뒤의 활약(이적 소식이 아니다)
    // '나폴리, 김민재 영입 당시 이적료 공개' — 지난 이적의 이적료(M1-18 리뷰)
    // M1-43 실데이터: '이른 교체엔 “사전에 합의된 것”'(경기 운영 합의) · '영입생이 선수단 수준 끌어올렸어'(새로 온 선수 — 지금 이적
    // 소식이 아니다)
    ko: [
      "이적 후",
      "이적 이후",
      "이적 뒤",
      "당시 이적료",
      // 경기 운영 합의만('사전에 합의된 것'·'사전에 합의한 교체') — '보스만 사전 합의'(자유계약 선수 사전 계약)는 이적이다(M1-43 리뷰)
      "사전에 합의된",
      "사전에 합의한",
      "영입생",
      "이적생",
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
 * 코드 상수 — configs.ts 주석). names.ko.json에 같은 slug 팀이 있으면 그 표기(en·ko)를 더한다(M1-21 초기 사전 — 16곳 중
 * 표기 확인 대기인 인테르를 뺀 15곳). 짧은 별칭의 오탐은 제외 표현으로 막는다(Inter Miami·Inter Milan의 Milan·레알 소시에다드·
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
    // slug = football-data 'AC Milan'의 M0-32 규칙 결과(team-ids-draft.ts teamSlugFromName — 'AC'는 떼는 토큰이 아니다, M1-21)
    slug: "ac-milan",
    terms: { latin: ["ac milan", "milan"], ko: ["ac 밀란", "밀란"] },
    exclude: { latin: ["inter milan"], ko: ["인터 밀란"] },
  },
  { slug: "ssc-napoli", terms: { latin: ["napoli"], ko: ["나폴리"] } },
];

// ─── 표: 분류 카테고리 (M1-17, FR-21·FR-31) ──────────────────────────────────

/**
 * 재계약(이적이 아님 — M0-34 손 판정: 'Palmer signs new Chelsea contract' = 감독·구단). 재계약 표현이 있고 아래 `TRANSFER_STRONG_TERMS`가
 * 없으면 카테고리는 이적이 아니라 감독·구단이다(classify.ts). 이적 단계 판정(M1-18)도 이 표를 이어받는다.
 */
export const RENEWAL_TERMS: KeywordGroup = {
  terms: {
    en: [
      "new contract",
      "new deal",
      "contract extension",
      "extends contract",
      "extend contract",
      "extended contract",
      "signs new",
      "renews",
      "renewed",
    ],
    it: ["rinnovo", "rinnova", "rinnovato", "prolungamento"],
    es: [
      "renovacion",
      "renueva",
      "renovar",
      "renovado",
      "amplia su contrato",
      "ampliacion de contrato",
    ],
    ko: ["재계약", "계약 연장", "연장 계약"],
  },
};

/** 재계약 표현과 함께 나와도 이적으로 보는 말(이적 자체를 가리키는 말 — 계약·협상·합의처럼 재계약에도 쓰는 말은 뺐다) */
export const TRANSFER_STRONG_TERMS: KeywordGroup = {
  terms: {
    latin: ["here we go"],
    en: [
      "transfer",
      "transfers",
      "loan",
      "loaned",
      "bid",
      "bids",
      "fee",
      "release clause",
      "free agent",
      "joins",
      "swap",
      "gossip",
    ],
    it: [
      "calciomercato",
      "mercato",
      "cessione",
      "acquisto",
      "prestito",
      "trasferimento",
    ],
    es: [
      "fichaje",
      "fichajes",
      "fichar",
      "ficha por",
      "ficha a",
      "traspaso",
      "cesion",
      "cedido",
      "prestamo",
      "agente libre",
    ],
    ko: [
      "이적",
      "영입",
      "임대",
      "방출",
      "바이아웃",
      "메디컬",
      "히어 위 고",
      "자유계약",
      "러브콜",
      "입단",
    ],
  },
  koInfix: KO_TRANSFER_COMPOUNDS,
  exclude: TRANSFER_TERMS.exclude,
  excludeKoRe: KO_PAST_TRANSFER_RE,
};

/** 여러 소식 묶음 제목(🚨 'X want Y, Z eye W & more')의 이적 동사 — 묶음 제목에만 쓴다(한 소식 제목에는 너무 흔한 말) */
export const TRANSFER_ROUNDUP_TERMS: KeywordGroup = {
  terms: {
    en: [
      "want",
      "wants",
      "target",
      "targets",
      "eye",
      "eyes",
      "linked",
      "race for",
      "chasing",
      "chase",
      "interest",
      "swoop",
      "suitors",
      "exit",
      "replace",
      "shortlist",
    ],
  },
};

// ─── 표: 이적 rumor·문턱 (M1-18, FR-21·FR-100~103, D23·D54 — transfer-extract.ts) ───────────────────────────
//
// 이적 단계는 부록 A `TransferStatus`(rumor < negotiating < agreed < official, 그리고 결렬 collapsed)다. **negotiating 이상·결렬은 닫힌 문형만**
// (PRD §15 D54 — transfer-patterns.ts `STAGE_PATTERNS`, 언어 × 단계 × 문형 × 꼬리 슬롯)이고, 이 절의 표는 rumor 근거(`TRANSFER_RUMOR_TERMS` —
// 키워드 방식)와 문턱(잔류·에이전트·재계약 단서)뿐이다. 이적 화제(`TRANSFER_TERMS` — 점수화·카테고리)와는 따로다.

/** hold 동사 꼴 — 결과 표의 회담 제외(`HOLD_MEETING_EXCLUDES` — 'hold talks'는 결과가 아니다)가 쓴다 */
const HOLD_FORMS: readonly string[] = ["hold", "holds", "held", "holding"];

/** hold와 회담 명사 사이 꾸밈말(0~1개 — '' = 없음) */
const HOLD_TALK_MODIFIERS: readonly string[] = [
  "",
  "a",
  "an",
  "fresh",
  "further",
  "new",
  "more",
  "contract",
  "transfer",
  "advanced",
  "positive",
  "initial",
  "formal",
  "informal",
  "urgent",
  "crunch",
  "emergency",
  "crisis",
  "secret",
  "private",
  "direct",
  "exploratory",
  "preliminary",
  "detailed",
  "constructive",
  "board",
  "face to face",
];

/**
 * rumor 근거 — 관심·연결·물망·이적설. 주어(팀)와 선수 사이의 동사('Arsenal eye Kane')·명사('김민재 이적설'·'아스널 관심') 모두.
 * 제외: 경기 탈락('cup exit')·연계 플레이('link up')·'target man', 국내 '관심 집중'·'우승 노린다' 같은 목표 표현.
 */
export const TRANSFER_RUMOR_TERMS: KeywordGroup = {
  terms: {
    en: [
      "linked",
      "links",
      "link",
      "eye",
      "eyes",
      "eyeing",
      "want",
      "wants",
      "wanted by",
      "keen on",
      "keen",
      "interest",
      "interested",
      "admirers",
      "suitors",
      "monitor",
      "monitoring",
      "monitored",
      "scout",
      "scouts",
      "scouted",
      "scouting",
      "consider",
      "considering",
      "weigh",
      "weighs",
      "weighing",
      "plot",
      "plots",
      "plotting",
      "target",
      "targets",
      "targeted",
      "targeting",
      "chase",
      "chases",
      "chasing",
      "race for",
      "race to sign",
      "battle for",
      "swoop",
      "swoops",
      "approach",
      "approached",
      "shortlist",
      "shortlisted",
      "tipped",
      "rumour",
      "rumours",
      "rumoured",
      "rumor",
      "rumors",
      "rumored",
      "speculation",
      "exit",
      "exits",
      "move for",
      "dream move",
    ],
    it: [
      "interesse",
      "interessa",
      "piace",
      "nel mirino",
      "mirino",
      "obiettivo",
      "sondaggio",
      "sondaggi",
      "sonda",
      "idea",
      "pensa a",
      "accostato",
      "accostata",
      "corteggia",
      "corteggiamento",
      "occhi su",
      "osserva",
      "osservato",
      "monitora",
      "tentazione",
      "suggestione",
      "pista",
      "punta su",
      "vuole",
      "voci",
      "indiscrezione",
      "ipotesi",
      "candidato",
    ],
    es: [
      "interesa",
      "interes",
      "interesado",
      "interesados",
      "en la agenda",
      "objetivo",
      "sondea",
      "sondeo",
      "piensa en",
      "quiere",
      "pretende",
      "suena",
      "suena para",
      "en el radar",
      "tienta",
      "tentado",
      "candidato",
      "opcion",
      "persigue",
      "vigila",
      "rumor",
      "rumores",
      "posible fichaje",
    ],
    ko: [
      "이적설",
      "임대설",
      "영입설",
      "관심",
      "눈독",
      "노린다",
      "노려",
      "노리는",
      "원한다",
      "원해",
      "원하는",
      "탐낸다",
      "탐내",
      "군침",
      "러브콜",
      "물망",
      "영입 후보",
      "거론",
      "연결됐",
      "연결된",
      "연결되",
      "연결돼",
      "링크",
      "타깃",
      "타겟",
      "표적",
      "주시",
      "레이더",
      "관찰",
      "스카우트",
      "스카우터",
      "이적 가능성",
      "영입 추진",
      "이적 추진",
      "구애",
      "영입 리스트",
      "영입 명단",
      "점찍",
      "만지작",
      "이적 루머",
      "영입 루머",
      "매물",
      "영입에 나서",
      "영입 나서",
    ],
  },
  exclude: {
    en: [
      "cup exit",
      "league exit",
      "group stage exit",
      "knockout exit",
      "link up",
      "links up",
      "linked up",
      "target man",
    ],
    ko: [
      "관심 집중",
      "관심이 쏠",
      "관심 쏠",
      "관심을 모",
      "관심 모",
      "관심을 끈",
      "관심 끈",
      "관심사",
    ],
  },
  // 목표 표현('우승 노린다'·'첫 승 노려'·'반등 원한다') — 선수를 노리는 말이 아니다
  excludeKoRe: [
    /(?:우승|승리|연승|첫\s?승|반등|복수|설욕|트레블|더블|1위|선두|득점왕|대기록|기록|탈출|역전|승점|잔류|본선|16강|8강|4강|결승|진출)\s?(?:을|를)?\s?(?:노린다|노려|노리는|원한다|원해|원하는)/gu,
  ],
};

/**
 * 잔류 — 떠나지 않는다는 말. 같은 절의 단계를 rumor로 낮추고(부정형과 같다) 그 제목에서는 출발·행선지를 정하지 않는다('Napoli back
 * McTominay to stay amid Real links'). 'keep tabs on'(주시 — rumor 근거)은 잔류가 아니다.
 */
export const TRANSFER_STAY_TERMS: KeywordGroup = {
  terms: {
    en: [
      "stay",
      "stays",
      "staying",
      "remain",
      "remains",
      "remaining",
      "keep",
      "keeps",
      "retain",
      "retains",
      "commit",
      "commits",
      "committed",
      "loyal",
      "not for sale",
      "stays put",
    ],
    it: [
      "resta",
      "restare",
      "rimane",
      "rimanere",
      "permanenza",
      "incedibile",
      "blindato",
      "blinda",
    ],
    es: [
      "se queda",
      "quedarse",
      "seguira",
      "continuidad",
      "permanencia",
      "intransferible",
    ],
    ko: ["잔류", "남는다", "남을", "남기로", "붙잡", "판매 불가", "이적 불가"],
  },
  exclude: {
    en: [
      "keep tabs",
      "keeps tabs",
      "keeping tabs",
      "keep an eye",
      "keeps an eye",
      "keeping an eye",
      "keep track",
    ],
  },
};

/**
 * 에이전트 기사 — 선수의 에이전트 교체·계약('알바레스, 로드리 에이전트와 계약 임박'·'Álvarez deja a Hidalgo y busca nuevo agente')은
 * 이적이 아니다. 이 표현이 있는 제목은 이적 정보를 만들지 않는다(보수적 — 에이전트가 협상하는 이적 기사도 건너뛴다). 'free agent'(FA)는
 * 에이전트가 아니다.
 */
export const TRANSFER_AGENT_TERMS: KeywordGroup = {
  terms: {
    en: [
      "agent",
      "agents",
      "agency",
      "representative",
      "representatives",
      "intermediary",
      "intermediaries",
    ],
    it: ["agente", "agenti", "procuratore", "procuratori"],
    es: ["agente", "agentes", "representante", "representantes"],
    ko: ["에이전트", "대리인"],
  },
  exclude: {
    en: ["free agent", "free agents"],
    it: ["svincolato"],
    es: ["agente libre", "agentes libres"],
  },
};

/**
 * 재계약 협상 단서 — 재계약 표(`RENEWAL_TERMS`)에 없는 협상 표현('hold contract talks'·'contract negotiations'). 이 표현이 있는 제목은
 * 이적 정보를 만들지 않는다(재계약 협상을 이적 협상으로 읽지 않게 — 보수적).
 */
export const TRANSFER_RENEWAL_HINT_TERMS: KeywordGroup = {
  terms: {
    en: [
      "contract talks",
      "contract negotiations",
      "contract discussions",
      "contract extension",
      "extension talks",
      "new terms",
      "extension",
      "renewal",
      "extends",
      "extend",
      "extended",
    ],
    it: ["prolungamento", "rinnovo", "rinnova", "prolunga"],
    es: ["renovacion", "renueva", "ampliacion", "amplia"],
    ko: ["재계약", "계약 연장", "연장 계약", "연장 협상"],
  },
};

/**
 * 대표팀(카테고리 national) — 강한 표현: 클럽 팀 이름이 같이 나와도 대표팀 기사('England call up Arsenal's Saka').
 * 약한 표현(`NATIONAL_WEAK_TERMS`)은 클럽 팀 태그가 없을 때만 — 국내 제목은 '국대 수비수'처럼 선수 수식어로 쓴다.
 */
export const NATIONAL_STRONG_TERMS: KeywordGroup = {
  terms: {
    en: [
      "national team",
      "national side",
      "nations league",
      "world cup qualifier",
      "world cup qualifiers",
      "world cup qualifying",
      "euro qualifier",
      "euro qualifiers",
      "euro qualifying",
      "call up",
      "called up",
      "international duty",
      "fa launches",
    ],
    // 클럽 소집 명단('i convocati di Chivu'·'convocatoria del Madrid')·클럽 감독('il ct del Milan?')·UCL 토너먼트('las eliminatorias de la
    // Champions')와 겹치는 말은 넣지 않는다(M1-17 리뷰)
    it: ["nazionale", "qualificazioni mondiali", "commissario tecnico"],
    es: [
      "seleccion",
      "seleccionador",
      "eliminatorias sudamericanas",
      "eliminatorias mundialistas",
      "eliminatorias del mundial",
    ],
    // 발탁·소집·명단 — K리그 선수 기사여도 대표팀 기사다(오케스트레이터 결정 2026-10-17 — A매치는 서비스 범위, news-scope.ts)
    ko: [
      "모레노호",
      "홍명보호",
      "a매치",
      "대표팀 명단",
      "대표팀 최종 명단",
      "대표팀 소집",
      "대표팀 발탁",
      "대표팀 첫 발탁",
      "대표팀 재발탁",
      "대표팀 승선",
      "국가대표 명단",
      "국가대표 소집",
      "국가대표 발탁",
      "국가대표 첫 발탁",
      "국가대표 재발탁",
      "국가대표 승선",
      "월드컵 예선",
      "월드컵 최종예선",
      "아시안컵 예선",
      "평가전",
    ],
  },
};

/** 대표팀 약한 표현 — 클럽 팀 태그가 없을 때만 대표팀(국가 이름은 `NATIONAL_COUNTRIES`) */
export const NATIONAL_WEAK_TERMS: KeywordGroup = {
  terms: {
    en: ["world cup", "international", "internationals"],
    es: ["mundial"],
    it: ["mondiale", "mondiali", "azzurri"],
    // '국대 수비수'·'韓 국가대표 에이스'처럼 선수 수식어로 쓰는 말은 넣지 않는다
    ko: ["대표팀", "월드컵", "아시안컵", "축구협회"],
  },
  exclude: {
    en: ["women s world cup", "club world cup", "international break"],
    es: ["mundial de clubes", "mundial de gimnasia"],
    it: ["mondiale per club"],
    ko: ["클럽 월드컵", "여자 월드컵"],
  },
};

/**
 * 국가 이름(대표팀 약한 근거 — 클럽 팀 태그가 없을 때만, 'Highlights: Albania 0-1 Wales'·'Ronaldo suspended by Portugal').
 * 다른 뜻과 겹치는 이름(Jordan·Georgia·Chile 등)은 넣지 않았다.
 */
export const NATIONAL_COUNTRIES: KeywordGroup = {
  terms: {
    en: [
      "england",
      "scotland",
      "wales",
      "northern ireland",
      "republic of ireland",
      "france",
      "germany",
      "spain",
      "italy",
      "portugal",
      "netherlands",
      "belgium",
      "croatia",
      "serbia",
      "albania",
      "poland",
      "ukraine",
      "denmark",
      "sweden",
      "norway",
      "switzerland",
      "austria",
      "turkey",
      "czech republic",
      "czechia",
      "hungary",
      "romania",
      "greece",
      "iceland",
      "finland",
      "slovakia",
      "slovenia",
      "bosnia",
      "montenegro",
      "kosovo",
      "north macedonia",
      "bulgaria",
      "brazil",
      "argentina",
      "uruguay",
      "colombia",
      "mexico",
      "usa",
      "usmnt",
      "canada",
      "japan",
      "south korea",
      "australia",
      "morocco",
      "senegal",
      "nigeria",
      "egypt",
      "ghana",
      "cameroon",
      "algeria",
      "tunisia",
      "saudi arabia",
      "qatar",
      "iran",
      "ecuador",
      "paraguay",
    ],
    es: [
      "espana",
      "argentina",
      "brasil",
      "portugal",
      "francia",
      "alemania",
      "italia",
      "uruguay",
      "colombia",
      "mexico",
      "la roja",
    ],
    it: [
      "italia",
      "francia",
      "germania",
      "spagna",
      "portogallo",
      "inghilterra",
      "brasile",
      "argentina",
    ],
    ko: [
      "대한민국",
      "일본 대표",
      "우루과이전",
      "브라질전",
      "파라과이전",
      "우즈벡전",
      "이라크전",
      "요르단전",
      "한일전",
    ],
  },
  exclude: { ko: ["미니 한일전"] },
};

/**
 * 경기 결과(카테고리 result·spoiler) — 승패·무승부 동사, 경기 기사 머리표. 스코어 패턴은 classify.ts(`titleScores`)가 따로 본다.
 * '연패'는 넣지 않는다 — 連敗(연속 패배)와 連霸(연속 우승 — 'UCL 2연패', '올해의 선수상 2연패 도전')가 같은 글자다.
 * 'draw'(무승부)는 **추첨**('Champions League draw: Arsenal face Bayern'·'FA Cup third-round draw'·'draw ceremony')과 겹친다 — 추첨
 * 표현이면 classify.ts가 제목의 draw를 지우고 맞춘다(`isDrawLottery` — 결과·spoiler·D42 병합 근거가 아니다, PRD §15 D47 ②: UCL 조 추첨은
 * UCL 칩, 컵 추첨은 기타). 'hold'·'held by'는 주어가 있어야 결과다(`RESULT_CONTEXT_TERMS` — 'Fans hold protest').
 */
export const RESULT_TERMS: KeywordGroup = {
  terms: {
    en: [
      "beat",
      "beats",
      "beaten",
      "thrash",
      "thrashes",
      "thrashed",
      "hammer",
      "hammers",
      "hammered",
      "rout",
      "routs",
      "routed",
      "crush",
      "crushes",
      "crushed",
      "stun",
      "stuns",
      "stunned",
      "edge past",
      "edges past",
      "edged past",
      "edge out",
      "edges out",
      "win",
      "wins",
      "won",
      "victory",
      "victories",
      "defeat",
      "defeats",
      "defeated",
      "draw",
      "draws",
      "drew",
      "equaliser",
      "equalizer",
      "late winner",
      "comeback",
      "fight back",
      "fights back",
      "fightback",
      "come from behind",
      "cruise past",
      "cruise to",
      "see off",
      "sees off",
      "fall to",
      "falls to",
      "lose",
      "loses",
      "lost",
      "loss",
      "triumph",
      "snatch",
      "snatches",
      "fall short",
      "falls short",
      "score six",
      "score three",
      "highlights",
      "ease past",
      "eases past",
      "eased past",
      "brush aside",
      "brushes aside",
      "brushed aside",
      "demolish",
      "demolishes",
      "demolished",
      "outclass",
      "outclasses",
      "outclassed",
      "earn point",
      "earn a point",
      "earns point",
      "earns a point",
      "earned a point",
      "stumble at",
      "stumbles at",
      "stumble to",
      "stumbles to",
      "rally to",
      "from two goals down",
      "bragging rights",
      // M1-43 실데이터('PSG come out on top in six-goal thriller against Barcelona')
      "come out on top",
      "comes out on top",
      "came out on top",
    ],
    it: [
      "vince",
      "vincono",
      "vittoria",
      "pareggio",
      "pareggia",
      "sconfitta",
      "battuto",
      "batte",
      "travolge",
      "rimonta",
      "tris",
      "poker",
      "manita",
      "cinquina",
      "espugna",
      "successo",
    ],
    es: [
      "gana",
      "ganan",
      "gano",
      "victoria",
      "vence",
      "vencen",
      "derrota",
      "empate",
      "empata",
      "golea",
      "goleada",
      "remontada",
      "remonta",
      "cae ante",
      "caen ante",
      "triunfo",
      "tumba",
      "arrolla",
      "pierde ante",
    ],
    ko: [
      "승리",
      "무승부",
      "패배",
      "제압",
      "대승",
      "완승",
      "신승",
      "역전승",
      "역전패",
      "극장승",
      "꺾고",
      "꺾었다",
      "꺾으며",
      // 낱말 앞 경계라 '리옹을 격파'·'도르트문트 격파'·'격파했다' 모두(조사로 시작하는 표현 '을 격파'는 앞이 한글이라 맞지 않는다 — M1-17 재리뷰)
      "격파",
      "패했다",
      "비겼다",
      "참패",
      "완패",
      "충격패",
      "홈패배",
      "원정패배",
      // 뜻이 분명한 승패 동사(M1-17 3차 리뷰 — 국내 제목에 자주 쓰는데 빠져 spoiler가 false였다)
      "완파",
      "대파",
      "격침",
      "이겼다",
      "비기며",
      "비기고",
      "패하며",
      "패해",
      "연승",
      "승전고",
      "무승 탈출",
      // 무승 행진(지난 경기에서도 못 이겼다 — M1-43 실데이터 '맨유, 7경기 연속 무승→캐릭은 …'). 경기 전 기사 표현과 함께면 약한
      // 표현이다(`RESULT_WEAK_TERMS` — '연승'과 같다)
      "연속 무승",
      "무승 수렁",
      "무승 늪",
      "리뷰",
      "review",
    ],
  },
  // 낱말 전체 — '비겨'(≠ '비겨야')·'비긴'(≠ '비긴다')·'고배'(≠ '고배당')·'첫 승'(≠ '첫 승부')·'꺾어'(≠ '꺾어야')
  koWhole: ["비겨", "비긴", "고배", "첫 승", "꺾어"],
  // 합성어 뒷부분 — '기적의 대역전극'
  koInfix: ["역전극", "역전승"],
  exclude: {
    // "won't"(won t)·시상식 — 결과가 아니다
    en: ["won t", "win award", "wins award", "won award", "title bid"],
    es: ["gana enteros", "gana terreno", "gana peso", "gana fuerza"],
    // 경기 전 기사(예상·도전) — '승리 시 홈 4연승'·'베티스 꺾으면'
    ko: [
      "승리 시",
      "승리하면",
      "승리 도전",
      "승리를 노",
      "승리 노",
      "꺾으면",
      "연승 도전",
      "연승 정조준",
      "비겨도",
      "첫 승 도전",
      "첫 승 사냥",
      "첫 승을 노",
      "첫 승 노",
    ],
  },
};

/**
 * 회담·회의를 '여는' hold — 결과가 아니다. hold + (꾸밈말 0~1개) + talks·meeting·discussions·negotiations·press conference(꾸밈말 목록만 —
 * 사이에 팀 이름이 오면 결과 'Liverpool hold Arsenal as title talks heat up'). 그 밖의 고정 구('minute s silence').
 */
const HOLD_MEETING_EXCLUDES: readonly string[] = (() => {
  const modifiers = HOLD_TALK_MODIFIERS;
  const nouns = [
    "talks",
    "meeting",
    "meetings",
    "discussions",
    "negotiations",
    "press conference",
    "minute s silence",
  ];
  return HOLD_FORMS.flatMap((verb) =>
    modifiers.flatMap((mod) =>
      nouns.map((noun) => [verb, mod, noun].filter(Boolean).join(" ")),
    ),
  );
})();

/**
 * 추첨 'draw' 표현(라틴 원문 — 쌍점을 봐야 해서 정규화 전 제목에 적용) — 대회·라운드 이름 바로 뒤 draw + 쌍점·세로줄('Champions League
 * draw: Arsenal face Bayern'·'FA Cup third-round draw: Man Utd host Arsenal'·'Champions League play-off draw: Celtic face Bayern'), 또는
 * draw + 추첨 말('draw ceremony'·'draw in full'·'draw pairs'). 쌍점 없는 'FA Cup draw'·'league phase draw'는 무승부일 수 있어('Man Utd
 * held to FA Cup draw by Leeds'·'Real Madrid held to league phase draw') 넣지 않는다(M1-17 3차 리뷰).
 */
const DRAW_LOTTERY_PATTERNS: readonly RegExp[] = [
  /\b(?:league|cup|round|group|stage|phase|play-?offs?|knockout|last[- ](?:16|32|eight|four)|quarter-?finals?|semi-?finals?)\s+draws?\s*[:|]/iu,
  /\bdraws?\s+(?:ceremony|made|pots|date|in full|pairs|throws up|live|results)\b/iu,
];

/**
 * 무승부 문맥 — 추첨 표현과 함께 나와도 이 말이 있으면 경기 결과다('Spurs earn last-16 draw'·'held to goalless draw'·'play out draw').
 * 스코어도 같다(classify.ts `titleScores`가 따로 보지만 여기서도 숫자-숫자를 본다).
 */
const DRAW_RESULT_CONTEXT =
  /\b(?:held|hold|holds|earn|earns|earned|play(?:s|ed)? out|goalless|scoreless|settle(?:s|d)? for|snatch(?:es|ed)?|salvage(?:s|d)?|rescue(?:s|d)?|grab(?:s|bed)?|battle(?:s|d)? to|fight(?:s)? back|stalemate|share the spoils)\b|\b\d{1,2}\s?[-–]\s?\d{1,2}\b/iu;

/**
 * 추첨 제목인가(라틴 원문 — `DRAW_LOTTERY_PATTERNS`이 맞고 무승부 문맥 `DRAW_RESULT_CONTEXT`가 없다). 카테고리·D42 병합 근거만 이
 * 판정으로 draw를 지운다 — spoiler는 지우지 않은 원제목으로 본다(추첨 제목이 spoiler가 되는 것은 보수적이라 괜찮다, classify.ts).
 */
export function isDrawLottery(title: string): boolean {
  const text = title.normalize("NFKC");
  return (
    DRAW_LOTTERY_PATTERNS.some((re) => re.test(text)) &&
    !DRAW_RESULT_CONTEXT.test(text)
  );
}

/** 추첨 제목이면 'draw'·'draws'를 지운 제목(카테고리·병합 근거 표가 무승부로 읽지 않게), 아니면 그대로 */
export function maskDrawLottery(title: string): string {
  return isDrawLottery(title)
    ? title.normalize("NFKC").replace(/\bdraws?\b/giu, " ")
    : title;
}

/**
 * 'humbled by' + 감사 대상(지지·팬·후보 지명·수상·환대 …) — 겸손한 감사 표현이지 패배가 아니다('humbled by the support', M1-43 리뷰).
 * 'humbled by' 바로 뒤가 팀 이름이면 결과다('Man Utd humbled by four-goal Como').
 */
const HUMBLED_GRATITUDE_EXCLUDES: readonly string[] = (() => {
  const determiners = ["", "the", "all the", "his", "her", "their", "such"];
  const nouns = [
    "support",
    "fans",
    "nomination",
    "award",
    "reception",
    "response",
    "messages",
    "tributes",
    "gesture",
    "honour",
    "honor",
    "love",
    "recognition",
  ];
  return determiners.flatMap((det) =>
    nouns.map((noun) => ["humbled by", det, noun].filter(Boolean).join(" ")),
  );
})();

/**
 * 주어가 있어야 결과로 보는 승패 표현 — 혼자서는 다른 뜻이 흔하다('down'·'sink'·'overcome'·'hold'·'cade'·'잡았다'·'패'). 같은 제목에 팀
 * 태그 또는 등록 한국 선수가 있을 때만 결과(classify.ts — 'Bayern sink Dortmund'·'Arsenal down Chelsea to go top'·'Liverpool hold
 * Arsenal'·'Tottenham held by Chelsea'·'Il Napoli cade a Torino'·'El Madrid se impone al Betis'·'이강인 PSG, 리옹에 덜미'·'뮌헨, 원정서
 * 웃었다'·'황희찬 결장… 울브스 패').
 * 주어가 있어도 결과가 아닌 구는 제외 표현으로 지운다(M1-17 재리뷰 — 두 팀 이름이 든 이적·발언 제목이 '경기 결과'가 되어 D42 병합
 * 근거가 됐다): 'turn down'·'track down'·'play down'·'shut down'·'back down'·'step down' 계열, 'edge closer'·'the edge', 'hold (꾸밈말)
 * talks'(`HOLD_MEETING_EXCLUDES` — 'hold fresh talks with Chelsea'. hold 바로 뒤가 팀 이름이면 결과다: 'Liverpool hold Arsenal as title
 * talks heat up', M1-17 3차 리뷰), '팬들에게 웃었다'.
 */
export const RESULT_CONTEXT_TERMS: KeywordGroup = {
  terms: {
    en: [
      "sink",
      "sinks",
      "sank",
      "down",
      "downs",
      "downed",
      "overcome",
      "overcomes",
      "overcame",
      "edge",
      "edges",
      "edged",
      "hold",
      "holds",
      "held by",
      // 무실점 승리·역전·선두(주어가 있을 때 — M1-17 3차 리뷰 권장)
      "shut out",
      "shuts out",
      "turn the tables on",
      "turns the tables on",
      "turned the tables on",
      "go top",
      "goes top",
      "went top",
      "move top",
      "moves top",
      "moved top",
      // M1-43 실데이터 — 'Arsenal held at home by Birmingham'·'Man Utd humbled by four-goal Como'·'Haaland nets double as Man City go …'·
      // 'Guirassy double helps Dortmund past Sabah'
      "held at home",
      "humbled by",
      "nets double",
      "nets brace",
      "double helps",
      "brace helps",
    ],
    it: [
      "cade",
      "cadono",
      "frena",
      "frenano",
      "si impone",
      "si impongono",
      "ferma",
      "fermano",
      // 뒤집다·승점 3을 안기다(M1-43 실데이터 — 'i cambi di Chivu ribaltano il Bologna'·'Simeone … regala tre punti al Torino').
      // '(torna) alla ribalta'(주목받다)는 제외
      "ribalta",
      "ribaltano",
      "regala tre punti",
      "regala i tre punti",
    ],
    es: ["se impone", "se imponen", "cae", "caen", "frena", "se lleva"],
    // 다른 뜻도 있는 승패 동사 — 주어(팀·등록 선수)가 있을 때만('메시 제치고 도움 1위'·'머리채 잡고 퇴장'은 주어가 없다, M1-17 3차 리뷰)
    ko: [
      "덜미",
      "웃었다",
      "잡았다",
      "졌다",
      "울었다",
      "잡고",
      "누르고",
      "눌렀다",
      "제치고",
      "지고",
      "이기고",
      "물리쳐",
      "물리쳤다",
      "쓴맛",
      // 결승골·극장골은 경기가 끝난 뒤의 말(M1-43 실데이터 — '마두에케, 아스널 구한 극장 결승골'). 주어가 있어야 결과, 경기 전 기사
      // 표현('노린다')이면 아니다. spoiler는 경기 중 사건 표(`MATCH_EVENT_TERMS`)가 이미 본다
      "결승골",
      "극장골",
    ],
  },
  // 낱말 전체 — '패스'·'패배'는 아니다
  koWhole: ["패"],
  // '김민재, 팬들에게 웃었다'(사람에게 웃다 — 결과가 아니다). '원정서 웃었다'·'막판에 웃었다'는 결과
  excludeKoRe: [/(?<=에게|에게도|한테|께)\s?웃었다/gu],
  exclude: {
    // '(torna) alla ribalta'(주목받다)·판결·결정 뒤집기('ribalta la sentenza' — M1-43 리뷰)
    it: [
      "alla ribalta",
      "ribalta la sentenza",
      "ribalta il verdetto",
      "ribalta la decisione",
      "ribaltano la sentenza",
      "ribaltano il verdetto",
      "ribaltano la decisione",
    ],
    en: [
      // 감사 표현('humbled by the support'·'humbled by nomination' — M1-43 리뷰)
      ...HUMBLED_GRATITUDE_EXCLUDES,
      // 분석·해설('Breaking down Man Utd's tactics after …' — M1-43 실데이터, 결과가 됐다)·협상 결렬은 구로만 지운다 — 맨 'break down'은
      // 결과 숙어다('Arsenal finally break down stubborn Burnley' — M1-43 리뷰)
      "breaking down",
      "broken down",
      "talks break down",
      "talks breaks down",
      "talks broke down",
      "negotiations break down",
      "negotiations broke down",
      "deal breaks down",
      "deal broke down",
      "move breaks down",
      "move broke down",
      "two goals down",
      "down to ten",
      "down to 10",
      "down to the wire",
      "let down",
      "lets down",
      // 구동사 — 거절·추적·발언·사임·항복·폐쇄·진정('turn down'·'track down'·'play down'·'shut down'·'back down'·'step down')
      "turn down",
      "turns down",
      "turned down",
      "turning down",
      "track down",
      "tracks down",
      "tracked down",
      "tracking down",
      "play down",
      "plays down",
      "played down",
      "playing down",
      "shut down",
      "shuts down",
      "shutting down",
      "back down",
      "backs down",
      "backed down",
      "backing down",
      "step down",
      "steps down",
      "stepped down",
      "stepping down",
      "stand down",
      "stands down",
      "stood down",
      "standing down",
      "calm down",
      "calms down",
      "calmed down",
      "slow down",
      "slows down",
      "slowed down",
      "lay down",
      "lays down",
      "laid down",
      "hand down",
      "hands down",
      "handed down",
      "climb down",
      "climbs down",
      "climbed down",
      "crack down",
      "cracks down",
      "cracked down",
      "clamp down",
      "clamps down",
      "clamped down",
      "close down",
      "closes down",
      "closed down",
      "knuckle down",
      "knuckles down",
      "knuckled down",
      "settle down",
      "settles down",
      "settled down",
      "wind down",
      "winds down",
      "wound down",
      "cool down",
      "cools down",
      "cooled down",
      "put down",
      "puts down",
      "putting down",
      "write down",
      "writes down",
      "wrote down",
      "written down",
      "talk down",
      "talks down",
      "talked down",
      "talking down",
      "edge of",
      "edge closer",
      "edges closer",
      "edged closer",
      "edging closer",
      "edge towards",
      "edges towards",
      "edge toward",
      "edges toward",
      "the edge",
      "an edge",
      "cutting edge",
      "on edge",
      "sink in",
      "sinks in",
      "sank in",
      // 회담·회의 — 'hold talks'·'hold fresh talks'·'held further contract talks'(꾸밈말만 — 'Liverpool hold Arsenal as title talks heat
      // up'은 결과, M1-17 3차 리뷰)
      ...HOLD_MEETING_EXCLUDES,
      "hold out",
      "holds out",
      "hold on",
      "holds on",
      "hold onto",
      "hold firm",
      "holds firm",
      "hold fire",
      "hold the key",
      "holds the key",
      "hold key",
      "holds key",
      "hold the record",
      "holds the record",
      "held by police",
    ],
  },
};

/** 법조동사 + 승패 동사 — 경기 전 기사('Arteta: Arsenal can beat Chelsea')·물음 */
const MODAL_RESULT_PHRASES: readonly string[] = [
  "can",
  "could",
  "will",
  "would",
  "must",
  "should",
  "might",
  "can t",
  "aim to",
  "hope to",
  "need to",
  "needs to",
  "bid to",
  "how to",
  "plan to",
  "strategy to",
  "set to",
  "expected to",
].flatMap((modal) =>
  [
    "beat",
    "win",
    "stun",
    "sink",
    "down",
    "overcome",
    "lose",
    "draw",
    "hold",
    "go top",
    // 'Arsenal can come out on top' — 경기 전 기사(M1-43 리뷰 — 'come out on top'을 결과 표에 넣으며)
    "come out on top",
  ].map((verb) => `${modal} ${verb}`),
);

/**
 * 경기 전 기사 표현 — 이 표현이 있으면 승패 표현·스코어를 결과로 보지 않는다('승리 시 홈 4연승'·'3연승 정조준'·'must win'·
 * '2-1 승리 예상'·'원정 떠난다'·'[EPL 프리뷰]'). spoiler는 보수적으로 그대로 본다(classify.ts). 'ahead of'는 약한 표현이다
 * (`PREVIEW_WEAK_TERMS`).
 */
export const PREVIEW_TERMS: KeywordGroup = {
  terms: {
    en: [
      "preview",
      "predictions",
      "prediction",
      "team news",
      "how to watch",
      ...MODAL_RESULT_PHRASES,
    ],
    it: [
      "vigilia",
      "probabile formazione",
      "probabili formazioni",
      "pronostico",
      "pronostici",
    ],
    es: [
      "previa",
      "antes del duelo",
      "pronostico",
      "alineaciones probables",
      "posibles alineaciones",
    ],
    ko: [
      "승리 시",
      "승리하면",
      "도전!",
      "도전한다",
      "노린다",
      "정조준",
      "할까",
      "될까",
      "이뤄낼까",
      "프리뷰",
      "preview",
      "원정 떠난다",
      "원정길",
      "맞대결 전망",
      "경기 전망",
      "승리 예상",
      "선발 예상",
      "예상 선발",
      "예상 라인업",
      "관전 포인트",
      "출격 예정",
    ],
  },
};

/**
 * 경기 전 기사의 **약한** 표현 — 다음 경기를 말하지만 지난 경기 결과와 함께 나오는 일이 흔하다('Arsenal beat Chelsea ahead of UCL
 * clash'·'UCL 앞둔 아스널, 첼시에 2-1 승리'). 이 표현만 있으면 스코어·강한 승패 표현(`RESULT_TERMS`에서 `RESULT_WEAK_TERMS`를 뺀 것)·
 * 주어 있는 승패 표현은 결과로 두고, 약한 승패 표현(win·victory·draw·승리·무승부 — 'Arsenal seek win ahead of derby'·'첼시전 앞두고
 * 승리 다짐')만 결과로 보지 않는다(classify.ts `isResultLike`, M1-17 재리뷰·3차 리뷰). D42 병합 대상은 아니다(지난 경기 회고일 수 있다).
 */
export const PREVIEW_WEAK_TERMS: KeywordGroup = {
  terms: { en: ["ahead of"], ko: ["앞뒀다", "앞둬", "앞두고", "앞둔"] },
};

/** 경기 전 기사의 약한 표현과 함께면 결과로 보지 않는 승패 표현(명사·현재형 — 'seek win'·'face defeat'·'승리 다짐') */
export const RESULT_WEAK_TERMS: Readonly<
  Record<"en" | "ko", readonly string[]>
> = {
  en: [
    "win",
    "wins",
    "victory",
    "victories",
    "defeat",
    "defeats",
    "draw",
    "draws",
    "lose",
    "loses",
    "loss",
    "comeback",
    "triumph",
  ],
  ko: ["승리", "무승부", "패배", "연승", "연속 무승", "무승 수렁", "무승 늪"],
};

/**
 * 경기 중 사건(spoiler만 — 카테고리는 바꾸지 않는다): 골·퇴장·페널티 등. 결과를 직접 말하지 않아도 경기 내용이 드러난다
 * (M0-34 손 판정: 'Follia di Vinicius: gol, espulsione…' spoiler true). 보수적으로 넓게 둔다(결과 가리기에서 더 가려질 뿐이다).
 */
export const MATCH_EVENT_TERMS: KeywordGroup = {
  terms: {
    en: [
      "sent off",
      "red card",
      "scores",
      "scored",
      "goal",
      "goals",
      "equaliser",
      "equalizer",
      "late winner",
      "hat trick",
      "brace",
      "penalty",
      "own goal",
      "stoppage time",
      "added time",
      "ten man",
      "10 man",
    ],
    it: [
      "gol",
      "espulsione",
      "espulso",
      "rigore",
      "doppietta",
      "tripletta",
      "raddoppia",
      "in dieci",
    ],
    es: [
      "gol",
      "goles",
      "expulsion",
      "expulsado",
      "roja",
      "penalti",
      "doblete",
      "hat trick",
    ],
    ko: [
      "결승골",
      "동점골",
      "선제골",
      "극장골",
      "멀티골",
      "해트트릭",
      "퇴장",
      "레드카드",
      "페널티킥",
      "자책골",
      "득점",
      "1골",
      "2골",
      "3골",
      "1도움",
      "2도움",
      "3도움",
      "4도움",
      "5도움",
      "벼락골",
      "실점",
    ],
  },
};

/** 부상(카테고리 injury) */
export const INJURY_TERMS: KeywordGroup = {
  terms: {
    en: [
      "injury",
      "injuries",
      "injured",
      "knee",
      "hamstring",
      "ankle",
      "groin",
      "acl",
      "surgery",
      "ruled out",
      "sidelined",
      "setback",
      "fracture",
      "concussion",
      "fitness",
      // M1-43 실데이터 — 'Chelsea's Martinez taken to hospital …'·'Arsenal fear Saka could be out for two months'·'Haaland a doubt,
      // Semenyo out'. 'out for'만으로는 넣지 않는다('out for revenge') — 기간·조동사가 붙은 꼴만
      "taken to hospital",
      "hospitalised",
      "hospitalized",
      "could be out for",
      "will be out for",
      "out for two",
      "out for three",
      "out for four",
      "out for five",
      "out for six",
      "out for eight",
      "out for several",
      "out for up to",
      "out for weeks",
      "out for months",
      "out for the season",
      "out for the rest of",
      "a doubt",
    ],
    it: [
      "infortunio",
      "infortunato",
      "infortuni",
      "lesione",
      "stiramento",
      "crociato",
      "operazione",
      "operato",
      // M1-43 실데이터 — 'Atalanta, Giacomo Raspadori fuori per 20 giorni'·'Problemi alla coscia per Dembele'
      "fuori per",
      "coscia",
      "polpaccio",
      "flessore",
      "flessori",
      "adduttore",
      "affaticamento",
      "distorsione",
      "contusione",
      "problema muscolare",
      "problemi muscolari",
    ],
    es: [
      "lesion",
      "lesiones",
      "lesionado",
      "lesionada",
      "rotura",
      "operado",
      "quirofano",
      "molestias",
      "pierde a",
    ],
    ko: [
      "부상",
      "재부상",
      "수술",
      "햄스트링",
      "십자인대",
      "골절",
      "재활",
      "전치",
      // M1-43 실데이터 — '허벅지 타박상에 출전 불발'·'허벅지 타박→UCL 결장'·'허벅지 통증 털고'·'흐비차 시즌 아웃 가능성'·'콤파니, 바이러스
      // 감염'·'쓰러져 구급차 이송'('타박'만은 '타박하다'(나무라다)와 겹쳐 부위를 붙인 꼴만)
      "타박상",
      "허벅지 타박",
      "무릎 타박",
      "발목 타박",
      "통증",
      "시즌 아웃", // 띄어쓰기 자리는 공백이 없어도 맞는다('시즌아웃')
      "감염",
      "구급차",
      "병원 이송",
    ],
  },
  // 붙여 쓴 합성어('김민재, 무릎부상으로 이탈'·'황희찬 발목부상 회복') — '부상'을 합성어 안에서 통째로 맞추면 '세부상황'·'내부상황'과
  // 겹쳐 부위를 붙인 꼴만 적는다(M1-17 재리뷰)
  koInfix: [
    "무릎부상",
    "발목부상",
    "허벅지부상",
    "햄스트링부상",
    "종아리부상",
    "근육부상",
    "어깨부상",
    "허리부상",
    "발등부상",
    "사타구니부상",
    "손목부상",
    "머리부상",
    "갈비뼈부상",
    "장기부상",
    // 여러 선수 부상('PSG 핵심 선수 3명 줄부상' — M1-43 실데이터, '감독'으로 감독·구단이 됐다)
    "줄부상",
  ],
  // 떠오르다(浮上) — '급부상', '차기 사령탑 후보로 부상'·'PSG 핵심으로 부상했다'(조사 '(으)로' 바로 뒤, 낱말 앞 경계로는 적을 수
  // 없어 정규식 — M1-17 재리뷰). 뒤에 부상 소식 말('부상을 당해'·'부상 이탈'·'부상으로')이 오면 다친 것이다('태클로 부상을 당했다')
  exclude: {
    ko: ["급부상"],
    // 무릎 꿇기(인종차별 반대 의식 — 'Guehi among players not to take knee' M1-43 실데이터) · 확신·의심 표현 · 각오('out for revenge') ·
    // 징계·전술·개인 사유 결장(M1-43 리뷰)
    en: [
      "take knee",
      "take the knee",
      "take a knee",
      "takes the knee",
      "takes a knee",
      "taking the knee",
      "taking a knee",
      "took the knee",
      "took a knee",
      "taken the knee",
      "without a doubt",
      "beyond a doubt",
      "shadow of a doubt",
      "never a doubt",
      "not a doubt",
      "cast a doubt",
      "casts a doubt",
      "casting a doubt",
      "out for revenge",
      "out for blood",
      "out for redemption",
    ],
    it: [
      "fuori per scelta",
      "fuori per squalifica",
      "fuori per somma",
      "fuori per turnover",
      "fuori per mano",
      "fuori per motivi",
      "fuori per un soffio",
      "fuori per lutto",
    ],
  },
  excludeKoRe: [
    /(?<=로)\s?부상(?!\s?(?:을|이|으로|당|이탈|교체|악화|우려|공백|결장|아웃|회복|복귀|재발|치료|여파|부위))/gu,
  ],
};

/** 감독·구단(카테고리 club) — 감독·이사회·구단 운영·징계·재계약·성명 */
export const CLUB_TERMS: KeywordGroup = {
  terms: {
    en: [
      "manager",
      "boss",
      "head coach",
      "coach",
      "sacked",
      "sack",
      "sacking",
      "appointed",
      "appointment",
      "resigns",
      "resigned",
      "takeover",
      "owner",
      "owners",
      "chairman",
      "board",
      "ceo",
      "sporting director",
      "stadium",
      "finances",
      "financial",
      "revenue",
      "charges",
      "charged",
      "fined",
      "ban",
      "banned",
      "regulator",
      "press conference",
      "apologises",
      "apologizes",
      "fans",
      "supporters",
      "academy",
      "job cuts",
      // M1-43 실데이터 — 'Real demand Tebas resign'·'Turkish FA bans 147 officials'·'Ronaldo given 30-day suspension'·'Ex-Arsenal
      // director of football Edu'·'Southampton technical director'·'Ferguson returns to management'·'Fernandes to stay captain'
      "resign",
      "bans",
      "suspension",
      "suspended",
      "director of football",
      "football director",
      "technical director",
      // 감독 일(구만 — 'game/load/squad/time management'는 아니다, M1-43 리뷰)
      "returns to management",
      "return to management",
      "returned to management",
      "returning to management",
      "back into management",
      "into management",
      "management career",
      "captaincy",
      "stay captain",
      "remain captain",
    ],
    it: [
      "allenatore",
      "tecnico",
      "esonero",
      "esonerato",
      "panchina",
      "presidente",
      "societa",
      "stadio",
      "bilancio",
      "conferenza",
      "squalifica",
      "squalificato",
      "multa",
      "tifosi",
      "dirigenza",
      // 감독 신임(M1-43 실데이터 — 'Udinese, confermata la fiducia a Kosta Runjaic'·'Juventus, fiducia a Spalletti dopo il ko'). 'con
      // fiducia'(자신 있게)는 아니다
      "fiducia a",
      "fiducia al",
      "direttore sportivo",
    ],
    es: [
      "entrenador",
      "tecnico",
      "destitucion",
      "destituido",
      "cese",
      "presidente",
      "junta",
      "estadio",
      "accionista",
      "propietario",
      "rueda de prensa",
      "sancion",
      "sancionado",
      "multa",
      "aficion",
      "quiebra",
      "regulador",
    ],
    ko: [
      "감독",
      "사령탑",
      "경질",
      "선임",
      "부임",
      "사임",
      "사퇴",
      "구단",
      "수뇌부",
      "수뇌진",
      "회장",
      "구단주",
      "단장",
      "스태프",
      "기자회견",
      "징계",
      "성명",
      "구조조정",
      "감원",
      "매출",
      "스캔들",
      "인종차별",
      "벌금",
      "출전 정지",
      "선수단",
      "저격",
    ],
  },
  // 경기 중단·형사 집행유예는 징계가 아니다('match suspended'·'suspension of play'·'suspended sentence' — M1-43 리뷰)
  exclude: {
    en: [
      "match suspended",
      "game suspended",
      "play suspended",
      "temporarily suspended",
      "suspension of play",
      "suspended sentence",
    ],
  },
};

// ─── 표: 서비스 범위 밖 기사 (M1-17 — 클러스터링 전 제외, news-scope.ts) ──────────────

/**
 * 축구가 아닌 종목 — **강한 표현**(리그·대회·단체 이름: NFL·NBA·F1·Euroliga·Wimbledon …). 라틴 제목에서는 팀 이름이 있어도 축구 기사로
 * 보지 않는다('Eagles-Jaguars en Tottenham: la NFL' — NFL 런던 경기, 'El Real Madrid de baloncesto') — 축구 표현·대회 표현·등록 한국 선수·
 * 사전 선수가 있어야 남긴다(news-scope.ts). 국내 제목은 사전 팀 태그도 남기는 근거다(M1-17 리뷰).
 */
export const NON_FOOTBALL_STRONG_TERMS: KeywordGroup = {
  terms: {
    latin: [
      "nfl",
      "nba",
      "wnba",
      "mlb",
      "nhl",
      "f1",
      "motogp",
      "nascar",
      "indycar",
      "ufc",
      "mma",
      "atp",
      "wta",
      "rugby",
      // 유럽 농구 리그(언어별 표기 — 영어 제목에도 'Euroliga'가 온다)
      "euroliga",
      "eurolega",
    ],
    en: [
      "formula 1",
      "formula one",
      "grand prix",
      "six nations",
      "wimbledon",
      "roland garros",
      "ryder cup",
      "tour de france",
      "super bowl",
      "touchdown",
      "quarterback",
      "euroleague",
    ],
    es: [
      "baloncesto",
      "euroliga",
      "acb",
      "formula 1",
      "motociclismo",
      "automovilismo",
      "copa davis",
      "roland garros",
      "gran premio",
    ],
    it: ["basket", "pallavolo", "formula 1", "giro d italia", "gran premio"],
    ko: [
      "ufc",
      "mma",
      "kbo",
      "mlb",
      "nba",
      "nfl",
      "kbl",
      "lpga",
      "klpga",
      "pga",
      "f1",
      "lck",
      "롤드컵",
    ],
  },
};

/**
 * 붙여 쓴 다른 종목 합성어 — 앞말(프로·여자·남자·실업·고교·대학) + 종목('프로야구 LG 우승'·'여자배구 흥국생명'·'남자골프 세계 1위'·
 * '프로당구 PBA'), 예능 프로그램 이름('불꽃야구'·'최강야구'). 종목 이름을 합성어 안에서 통째로 맞추면 '지배구조'(배구)·'배당구조'·
 * '해당구단'(당구)과 겹친다(M1-17 3차 리뷰 — 2차 반영의 koInfix 회귀).
 */
const KO_SPORT_COMPOUNDS: readonly string[] = [
  ...["프로", "여자", "남자", "실업", "고교", "대학"].flatMap((prefix) =>
    ["야구", "농구", "배구", "골프", "당구"].map((sport) => prefix + sport),
  ),
  "사회인야구",
  "불꽃야구",
  "최강야구",
];

/**
 * 축구가 아닌 종목 — **약한 표현**(종목 이름: tennis·golf·마라톤 …). 축구 기사에도 지나가며 나온다('Man Utd squad enjoy golf day before
 * derby') — 강한 표현의 남기는 근거에 더해 사전 팀 태그(라틴 제목 포함)도 남기는 근거다(news-scope.ts).
 */
export const NON_FOOTBALL_WEAK_TERMS: KeywordGroup = {
  terms: {
    en: [
      "tennis",
      "golf",
      "cricket",
      "boxing",
      "snooker",
      "darts",
      "cycling",
      "athletics",
      "swimming",
      "gymnastics",
      "netball",
      "ice hockey",
      "basketball",
      "baseball",
      "volleyball",
      "horse racing",
      "esports",
    ],
    es: [
      "tenis",
      "golf",
      "ciclismo",
      "atletismo",
      "maraton",
      "natacion",
      "gimnasia",
      "boxeo",
      "balonmano",
      "voleibol",
      "padel",
      "rally",
      "triatlon",
      "esqui",
    ],
    it: ["tennis", "ciclismo", "nuoto", "atletica leggera", "boxe"],
    ko: [
      // 종목 이름은 낱말 앞 경계('야구장'·'골프장'은 맞고 '지배구조'의 배구·'해당구단'의 당구는 아니다), 붙여 쓴 합성어는 앞말 + 종목으로만
      // (`KO_SPORT_COMPOUNDS` — M1-17 3차 리뷰)
      "야구",
      "농구",
      "배구",
      "골프",
      "당구",
      ...KO_SPORT_COMPOUNDS,
      "테니스",
      "e스포츠",
      "복싱",
      "격투기",
      "씨름",
      "마라톤",
      "육상",
      "피겨",
      "쇼트트랙",
      "스피드스케이팅",
      "탁구",
      "배드민턴",
      "양궁",
      "펜싱",
      "태권도",
      "레슬링",
    ],
  },
  // 축구에서도 쓰는 말 — Boxing Day 경기, 이적 '마라톤 협상'
  exclude: { en: ["boxing day", "golf club"], ko: ["마라톤 협상"] },
};

/** 축구 기사라는 명시적 표현 — 다른 종목 표현과 함께 나와도 축구 기사로 남기는 근거(news-scope.ts). 팀 이름은 넣지 않는다 */
export const FOOTBALL_CONTEXT_TERMS: KeywordGroup = {
  // '[해외축구]'·'유소년축구' — 합성어 안의 '축구'도 축구다
  koInfix: ["축구"],
  terms: {
    en: [
      "football",
      "footballer",
      "footballers",
      "soccer",
      "striker",
      "midfielder",
      "goalkeeper",
      "defender",
      "pitch",
      "derby",
      "squad",
      "manager",
      "referee",
      "var",
      "penalty",
    ],
    es: [
      "futbol",
      "futbolista",
      "futbolistas",
      "delantero",
      "centrocampista",
      "portero",
    ],
    it: [
      "calcio",
      "calciatore",
      "calciatori",
      "attaccante",
      "centrocampista",
      "portiere",
    ],
    ko: [
      "축구",
      "풋볼",
      "득점",
      "결승골",
      "동점골",
      "선제골",
      "극장골",
      "멀티골",
      "해트트릭",
      "골키퍼",
      "미드필더",
      "공격수",
      "수비수",
      "이적시장",
      "a매치",
      "챔스",
    ],
  },
};

/**
 * K리그·국내 축구(국내 제외 대상 — 서비스 범위는 5대 리그·UCL + 한국 선수·A매치). 강한 표현은 'K리그'·푸볼리스트 K리그 머리표
 * ([케리뷰]·[케현장])·코리아컵이고, 구단 이름은 국내 전체기사·축구 피드의 K리그 기사(머리표 없음)를 잡는다. 도시 이름만으로는
 * 다른 뜻과 겹치는 곳(서울·부산·인천·수원·대전·제주·화성·김포)은 구단 표기로만 적는다. 국내 제목에만 적용(한국어 표).
 */
export const K_LEAGUE_STRONG_TERMS: KeywordGroup = {
  terms: {
    ko: [
      "k리그",
      "케리뷰",
      "케현장",
      "코리아컵",
      "파이널a",
      "파이널b",
      "k3리그",
      "k4리그",
      "wk리그",
    ],
  },
};

/** K리그 구단 표기(국내 제목 — 낱말 앞 경계, 뒤에 조사·'전'이 붙는다) */
export const K_LEAGUE_CLUB_TERMS: KeywordGroup = {
  terms: {
    ko: [
      "울산",
      "포항",
      "전북",
      "강원",
      "김천",
      "안양",
      "부천",
      "천안",
      "충북청주",
      "충남아산",
      "성남",
      "경남",
      "안산",
      "김해",
      "파주",
      "용인 fc",
      "광주",
      "fc 서울",
      "서울 이랜드",
      "수원 삼성",
      "수원 fc",
      "부산 아이파크",
      "대전 하나",
      "하나시티즌",
      "인천 유나이티드",
      "전남 드래곤즈",
      "제주 sk",
      "제주 유나이티드",
      "대구 fc",
      "화성 fc",
      "김포 fc",
    ],
  },
};

/**
 * 연예 기사(인터풋볼 전체기사 피드의 콘서트·결혼·영화제·K-pop — 10-15 수집분 50건 중 10여 건). 국내 제목에만 적용. '♥'는 글자가 아니라
 * news-scope.ts가 원문에서 따로 본다. 낱말 경계로 맞춘다('가수' ≠ '김민재가 수비', '음원' ≠ '다음 원정', '방송인' ≠ '방송 인터뷰',
 * '화보' ≠ '변화 보여준'). 축구 제목에도 쓰는 말은 넣지 않거나 낱말 전체·구로만 — '배우'는 낱말 전체('배우고 싶다' — 배우다는 아니다),
 * '드라마'는 '새 드라마'·'드라마 출연' 같은 구로만('한 편의 드라마'), '방송'은 '첫 방송'으로만(중계), '결혼'·'컴백'·'소속사'는 넣지 않는다
 * (선수 결혼·부상 복귀·선수 매니지먼트). 동명이인(배우 김지수·가수 정우영 — 등록 선수 이름)은 news-scope.ts가 다룬다.
 */
export const ENTERTAINMENT_TERMS: KeywordGroup = {
  terms: {
    ko: [
      "콘서트",
      "앨범",
      "신곡",
      "신보",
      "음원",
      "음악",
      "뮤직비디오",
      "아이돌",
      "걸그룹",
      "보이그룹",
      "트로트",
      "여배우",
      "배우로서",
      "배우 출신",
      "주연 배우",
      "새 드라마",
      "드라마 출연",
      "드라마 주연",
      "드라마 촬영",
      "드라마·영화",
      "주말 드라마",
      "첫 방송",
      "방송 첫",
      "첫 회",
      "출연",
      "연극",
      "팬사인회",
      "팬 사인회",
      "예능",
      "팬미팅",
      "열애",
      "상견례",
      "예비 부부",
      "전속계약",
      "화보",
      "시청률",
      "ost",
      "케이팝",
      "k-pop",
      "뮤지컬",
      "쇼케이스",
      "숏필름",
      "오디션",
      "개그맨",
      "방송인",
      "캐스팅",
      "y터뷰",
      "y현장",
    ],
  },
  koWhole: ["배우", "가수", "주연"],
  koInfix: ["영화제"],
};

/** '데뷔'는 축구 꼴로만 — '가수 데뷔'·'솔로 데뷔'·'연극 무대 데뷔'는 축구가 아니다(M1-17 3차 리뷰) */
const KO_FOOTBALL_DEBUT: readonly string[] = [
  "데뷔전",
  "데뷔골",
  "1군 데뷔",
  "선발 데뷔",
  "리그 데뷔",
  "프로 데뷔",
  "a매치 데뷔",
];

/**
 * 선수 기사 문맥어(국내 제목) — 등록 선수 이름이 연예인과 같을 때(김지수·정우영) 이 말이 함께 있으면 축구 기사로 본다(classify.ts kr
 * 근거). 짧은 말은 낱말 전체('골' ≠ '골프', '경기' ≠ '경기도', '팀' ≠ '팀장'). 일반어('출전'·'원정'·'시즌'·'도움')가 섞여 있어 **연예
 * 표현이 함께 있는 제목**에서는 이 표 대신 `FOOTBALL_PLAYER_CONTEXT_TERMS`만 근거다('김지수, 오디션 프로그램 출전'·'정우영 원정 콘서트').
 */
export const PLAYER_CONTEXT_TERMS: KeywordGroup = {
  terms: {
    ko: [
      "선발",
      "출전",
      "원정",
      "홈경기",
      ...KO_FOOTBALL_DEBUT,
      "풀타임",
      "결장",
      "교체",
      "주전",
      "시즌",
      "리그",
      "득점",
      "도움",
      "수비",
      "공격",
      "감독",
      "이적",
      "영입",
      "훈련",
      "소속팀",
      "부상",
      "복귀전",
      "벤치",
      "명단",
      "대표팀",
      "국가대표",
      "모레노호",
      "a매치",
      "멀티골",
      "결승골",
      "동점골",
      "선제골",
      "프리미어리거",
      "분데스리거",
    ],
  },
  koWhole: ["골", "경기", "팀", "골문"],
};

/**
 * 축구에만 쓰는 선수 기사 문맥어(국내 제목) — 연예 표현이 함께 있는 제목에서 등록 선수를 축구 선수로 보는 근거(news-scope.ts 연예 판정의
 * 남기는 근거, classify.ts 동명이인 kr 근거). `PLAYER_CONTEXT_TERMS`의 일반어(출전·원정·시즌·도움·이적·영입·부상)는 뺐다.
 */
export const FOOTBALL_PLAYER_CONTEXT_TERMS: KeywordGroup = {
  terms: {
    ko: [
      ...KO_FOOTBALL_DEBUT,
      "선발 출전",
      "교체 출전",
      "풀타임",
      "결장",
      "홈경기",
      "원정 경기",
      "소속팀",
      "득점",
      "멀티골",
      "결승골",
      "동점골",
      "선제골",
      "프리미어리거",
      "분데스리거",
      "대표팀",
      "국가대표",
      "모레노호",
      "a매치",
    ],
  },
  koWhole: ["골", "골문"],
};

/**
 * 직업 명사(국내 제목) — 이름 **바로 앞뒤**에 붙으면 그 이름은 등록 선수가 아니다('배우 김민재'·'가수 정우영'·'정우영 배우'·'가수 겸 배우
 * 김지수'·'이재성 의원' — 동명이인, 선수 기사 문맥어와 관계없이, M1-17 3차 리뷰). 쓰는 곳: tag-names.ts `matchTitleTags`(선수 태그를
 * 빼고 `occupationPlayers`로 알린다). '감독'·'기자'는 넣지 않는다(축구 감독·기사 머리).
 */
export const KO_OCCUPATION_NOUNS: readonly string[] = [
  "배우",
  "여배우",
  "가수",
  "방송인",
  "아이돌",
  "모델",
  "개그맨",
  "개그우먼",
  "코미디언",
  "래퍼",
  "아나운서",
  "유튜버",
  "성우",
  "탤런트",
  "뮤지션",
  "싱어송라이터",
  "크리에이터",
  "인플루언서",
  "국회의원",
  "의원",
  "장관",
  "교수",
  "mc",
  "dj",
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
 * 동명이인이 확인된 등록 한국 선수(slug) — 국내 제목에 이름만 나오면 연예인일 수 있다(배우 김지수·가수 정우영 — 인터풋볼 전체기사 피드
 * 실측, M1-14 이월). 이 선수들만 같은 제목에 축구 근거가 있을 때 kr·선수 태그·한국 선수 배수를 준다(classify.ts — 점수화도 분류 결과를
 * 쓴다). 다른 등록 선수는 이름만으로 kr이다('괴물' 김민재·'이강인 근황' — M1-17 재리뷰). 코드 상수(스키마 불변) — 새 동명이인이
 * 확인되면 여기에 더한다.
 */
export const KOREAN_HOMONYM_PLAYERS: ReadonlySet<string> = new Set([
  "kim-ji-soo",
  "jeong-woo-yeong",
]);

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
