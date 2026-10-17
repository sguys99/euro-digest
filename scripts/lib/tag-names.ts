/**
 * 원제목 → 팀·선수 태그 (PRD FR-21·FR-24, plan M1-17) — 순수 함수.
 *
 * 카드의 `teams`·`players`는 slug만 담고(부록 A), 화면은 `configs/names.ko.json`으로 한글 이름을 찾는다(src/lib/data/names.ts —
 * 사전에 없는 slug는 그리지 않는다). 그래서 태그 slug = 사전 slug다. 표기 출처:
 *   - 팀: names.ko.json 팀 항목(`en` 영문 표기·`ko` 한글 표기) + 빅클럽 코드 표(news-keywords.ts `BIG_CLUBS` — 같은 slug면 합친다,
 *     국내 약칭 '맨시티'·'맨유'·'뮌헨'·'레알'처럼 사전 대표 표기에 없는 말)
 *   - 선수: names.ko.json 선수 항목 + 등록 한국 선수(`korean-players.json` nameEn·nameKo — 띄어 쓴 한국어 이름은 마지막 단어로도,
 *     news-keywords.ts `koNameTerms`). 성만 쓴 외국 선수 이름('Kane'·'케인')은 사전에 그 표기가 있을 때만 맞는다 — 같은 성의 다른
 *     선수가 흔해서다(fixtures: 아틀레티코의 '로메로'는 토트넘 크리스티안 로메로가 아니다).
 *
 * ── 맞춰 보기 ──────────────────────────────────────────────────────────────
 *   라틴(en·it·es·그 밖): 발음 기호를 떼고(대소문자는 남긴다) 글자·숫자 밖은 공백 → 표기가 **단어 경계**에 맞을 때(대소문자 무시).
 *   한국어 제목: NFKC, 공백 정리 → 표기 앞이 글자·숫자가 아니고 뒤가 끝·글자 아님·**조사**(이/가·은/는·과/와·전(경기) 등, 최대 3개 이어짐)일
 *     때만. 부분 문자열로 맞추면 '니스'가 '테니스'에, '랑스'가 '프랑스'에, '로마'가 '로마노'에, '포르투'가 '포르투갈'에 맞는다.
 *   제외 표현(여자팀 'Arsenal Women'·'첼시 위민', 빅클럽 표의 Inter Miami·레알 소시에다드 등)은 그 자리를 먼저 지운다.
 *
 * ── 일반어·도시와 겹치는 별칭 (`AMBIGUOUS_TAG_TERMS`, M1-21 리뷰) ─────────────────────
 *   Nice·Lens·Como·Angers·Athletic·Roma·Milan·Monza·Le Mans·Valencia·Sevilla·Cologne·Toulouse·Porto 등은 영어 단어(nice·lens·
 *   angers)·스페인어 단어('cómo' — 발음 기호를 떼면 Como)·도시·다른 종목(Monza·Le Mans 자동차 경주, Toulouse 럭비)과 겹친다.
 *   이 별칭은 ① 라틴 원문이 **대문자로 시작**하고 발음 기호가 없고('Cómo'는 아니다) 장소 앞말 뒤가 아닐 때('in Milan'·'a Roma'),
 *   그리고 ② 같은 제목에 **그 팀의 근거가 하나 더** 있을 때만 태그한다 — 같은 리그의 다른 팀 태그(겹치지 않는 표기) · 그 팀 리그의 대회
 *   표현 · 그 팀 리그가 한 리그만 다루는 소스의 대회(Di Marzio = 세리에 A의 'Roma'·'Milan') · 스코어를 사이에 둔 같은 리그의 다른 겹치는
 *   별칭('Valencia 1-1 Sevilla'·'Roma-Torino 1-0' — 서로가 근거, M1-17 재리뷰). 다른 리그 팀은 근거가 아니다('Nice touch: Saka inspires
 *   Arsenal'·'Milan fashion week: Chelsea star' — M1-17 리뷰). 'Milan, la probabile formazione contro il Sassuolo'는 사수올로가
 *   근거다. 'AC Milan'·'Como 1907'처럼 겹치지 않는 표기는 그대로 맞는다.
 *
 * ── 유소년·2군 팀 ─────────────────────────────────────────────────────────
 *   표기 바로 뒤에 유소년·2군 접미(U21·U-23·Under-21s·II·B·Castilla·Atlètic·Next Gen·Primavera·2군·B팀)가 오면 그 자리는 1군 팀 태그가
 *   아니다(태그를 붙이지 않는다 — 'Arsenal U21 2-1 Chelsea U21'이 1군 경기와 D42 병합되지 않게, M1-17 재리뷰).
 *
 * 입력은 원제목뿐이다(요약문으로 팀·선수 태그를 붙이지 않는다 — 다음 상대·친정팀처럼 기사 주제가 아닌 이름이 섞인다, classify.ts).
 */
import type { CompId, KoreanPlayersFile, NamesKoFile } from "@/lib/schema";

import {
  BIG_CLUBS,
  COMPETITION_TERMS,
  KO_OCCUPATION_NOUNS,
  KO_SUFFIX_PATTERN,
  compileGroup,
  isKoLang,
  koNameTerms,
  matchesGroup,
  titleText,
  womenTeamExcludes,
  type CompiledGroup,
} from "./news-keywords";
import { TEAM_LEAGUE_INDEX, isLeagueId, type LeagueId } from "./team-leagues";

// ─── 일반어·도시 별칭 ─────────────────────────────────────────────────────

/**
 * 일반어·도시·다른 종목과 겹치는 별칭(머리 주석) — 비교 키(라틴 = 발음 기호 제거·소문자, 한국어 = 공백 제거). 코드 상수(스키마 불변).
 * 표기 사전에 같은 말이 별칭으로 들어오면 자동으로 이 규칙을 받는다.
 */
export const AMBIGUOUS_TAG_TERMS: Readonly<{
  latin: readonly string[];
  ko: readonly string[];
}> = {
  latin: [
    "nice",
    "lens",
    "como",
    "angers",
    "athletic",
    "roma",
    "milan",
    "monza",
    "le mans",
    "valencia",
    "sevilla",
    "cologne",
    "toulouse",
    "porto",
    "santander",
    "brest",
    "levante",
    "torino",
    "genoa",
    "monaco",
  ],
  ko: [
    "로마",
    "니스",
    "렌",
    "릴",
    "랑스",
    "코모",
    "몬차",
    "르망",
    "발렌시아",
    "세비야",
    "툴루즈",
    "포르투",
    "밀란",
    "모나코",
    "토리노",
    "레반테",
    "브레스트",
  ],
};

// ─── 정규화 ───────────────────────────────────────────────────────────────

/** 라틴 맞춤용 — NFKD로 발음 기호를 떼고(대소문자 유지) 글자·숫자 밖은 공백, 앞뒤 공백 하나 */
export function latinSpaced(text: string): string {
  const folded = text.normalize("NFKD").replace(/\p{M}+/gu, "");
  const spaced = folded.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return spaced === "" ? " " : ` ${spaced} `;
}

/** 비교 키 — 라틴: 발음 기호 제거·소문자·단어 사이 공백 하나 */
function latinKey(term: string): string {
  return latinSpaced(term).trim().toLowerCase();
}

/** 비교 키 — 한국어: NFKC·소문자·공백 제거 */
function koKey(term: string): string {
  return term.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}

/** 한국어 맞춤용 — NFKC, 공백(NBSP·전각 공백 포함) 연속은 공백 하나 */
export function koSpaced(text: string): string {
  return text.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─── 컴파일 ───────────────────────────────────────────────────────────────

interface CompiledTerm {
  re: RegExp;
  ambiguous: boolean;
}

/** 태그 대상 1개(팀 또는 선수) */
export interface CompiledTag {
  slug: string;
  kind: "team" | "player";
  latin: readonly CompiledTerm[];
  ko: readonly CompiledTerm[];
  excludeLatin: readonly RegExp[];
  excludeKo: readonly RegExp[];
  /** 여자팀 표현('Arsenal Women'·'Barcelona Femení'·'첼시 위민') — 맞으면 그 제목은 여자팀 기사(팀 태그를 붙이지 않는다) */
  womenLatin: readonly RegExp[];
  womenKo: readonly RegExp[];
}

/** 라틴 표기 → 정규식(라틴 맞춤 텍스트의 단어 경계, 대소문자 무시) */
function latinTermRe(term: string, flags: "giu"): RegExp | null {
  const key = latinSpaced(term).trim();
  if (key === "") return null;
  const body = key.split(" ").map(escapeRe).join(" ");
  return new RegExp(`(?<= )${body}(?= )`, flags);
}

/** 한국어 표기 → 정규식(앞은 글자·숫자 아님, 뒤는 조사* + 글자·숫자 아님). 띄어쓰기는 있어도 없어도 된다 */
function koTermRe(term: string, flags: "giu"): RegExp | null {
  const words = term.normalize("NFKC").trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return null;
  const body = words.map(escapeRe).join("\\s?");
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${body}(?=${KO_SUFFIX_PATTERN}(?![\\p{L}\\p{N}]))`,
    flags,
  );
}

/** 한국어 제목에 쓰는 라틴 약칭(PSG·ATM)도 같은 경계로 — 한글이 없는 표기 */
function compileTerms(
  terms: readonly string[],
  mode: "latin" | "ko",
): CompiledTerm[] {
  const ambiguous = new Set(
    mode === "latin" ? AMBIGUOUS_TAG_TERMS.latin : AMBIGUOUS_TAG_TERMS.ko,
  );
  const seen = new Set<string>();
  const out: CompiledTerm[] = [];
  for (const term of terms) {
    const key = mode === "latin" ? latinKey(term) : koKey(term);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    const re =
      mode === "latin" ? latinTermRe(term, "giu") : koTermRe(term, "giu");
    if (re) out.push({ re, ambiguous: ambiguous.has(key) });
  }
  return out;
}

function compileExcludes(
  terms: readonly string[],
  mode: "latin" | "ko",
): RegExp[] {
  return [...new Set(terms)].flatMap((term) => {
    const re =
      mode === "latin" ? latinTermRe(term, "giu") : koTermRe(term, "giu");
    return re ? [re] : [];
  });
}

/** 태그 대상 명세 */
export interface TagSpec {
  slug: string;
  kind: "team" | "player";
  latin: readonly string[];
  ko: readonly string[];
  excludeLatin?: readonly string[];
  excludeKo?: readonly string[];
  womenLatin?: readonly string[];
  womenKo?: readonly string[];
}

export function compileTag(spec: TagSpec): CompiledTag {
  return {
    slug: spec.slug,
    kind: spec.kind,
    latin: compileTerms(spec.latin, "latin"),
    ko: compileTerms(spec.ko, "ko"),
    excludeLatin: compileExcludes(spec.excludeLatin ?? [], "latin"),
    excludeKo: compileExcludes(spec.excludeKo ?? [], "ko"),
    womenLatin: compileExcludes(spec.womenLatin ?? [], "latin"),
    womenKo: compileExcludes(spec.womenKo ?? [], "ko"),
  };
}

/**
 * 같은 종류(팀끼리·선수끼리)에서 둘 이상의 대상이 쓰는 표기는 뺀다 — 누구인지 모른다(예: 한국 선수 이름 마지막 단어가 다른 선수
 * 표기와 같을 때). 사전 스키마는 영문 표기 중복을 막지만 빅클럽 표·한국 선수 표와 섞이면 겹칠 수 있다.
 */
export function dropSharedTerms(specs: readonly TagSpec[]): TagSpec[] {
  const owners = (mode: "latin" | "ko") => {
    const map = new Map<string, Set<string>>();
    for (const spec of specs) {
      for (const term of mode === "latin" ? spec.latin : spec.ko) {
        const key = mode === "latin" ? latinKey(term) : koKey(term);
        const set = map.get(key) ?? new Set<string>();
        set.add(spec.slug);
        map.set(key, set);
      }
    }
    return map;
  };
  const latin = owners("latin");
  const ko = owners("ko");
  return specs.map((spec) => ({
    ...spec,
    latin: spec.latin.filter((t) => (latin.get(latinKey(t))?.size ?? 0) < 2),
    ko: spec.ko.filter((t) => (ko.get(koKey(t))?.size ?? 0) < 2),
  }));
}

// ─── 색인 ────────────────────────────────────────────────────────────────

/** 태그 색인 */
export interface TagIndex {
  teams: readonly CompiledTag[];
  players: readonly CompiledTag[];
  /** 팀 slug → 리그(team-leagues.ts) */
  teamLeague: ReadonlyMap<string, LeagueId>;
  /** 활성 등록 한국 선수 slug → 소속 리그(korean-players.json `comp` — 5대 리그만) */
  playerLeague: ReadonlyMap<string, LeagueId>;
  /** 대회 표현(같은 제목 대회 근거 — 겹치는 별칭의 확인용) */
  competitions: ReadonlyArray<{ comp: CompId; group: CompiledGroup }>;
}

/**
 * 태그 색인을 만든다 — 팀: names.ko 팀 항목 ∪ 빅클럽 표(같은 slug면 합침, 사전 순서 → 사전에 없는 빅클럽), 선수: names.ko 선수 항목 ∪
 * 등록 한국 선수(같은 slug면 합침). 모든 팀 표기에 여자팀 제외 표현을 붙인다. 설정이 없으면(null) 빅클럽 표만.
 */
export function buildTagIndex(input: {
  names?: NamesKoFile | null;
  koreanPlayers?: KoreanPlayersFile | null;
  teamLeague?: ReadonlyMap<string, LeagueId>;
}): TagIndex {
  const entries = input.names?.entries ?? [];
  const teams = new Map<string, TagSpec>();
  const addTeam = (
    slug: string,
    latin: readonly string[],
    ko: readonly string[],
    exclude: { latin?: readonly string[]; ko?: readonly string[] } = {},
  ) => {
    const prev = teams.get(slug);
    teams.set(slug, {
      slug,
      kind: "team",
      latin: [...(prev?.latin ?? []), ...latin],
      ko: [...(prev?.ko ?? []), ...ko],
      excludeLatin: [...(prev?.excludeLatin ?? []), ...(exclude.latin ?? [])],
      excludeKo: [...(prev?.excludeKo ?? []), ...(exclude.ko ?? [])],
    });
  };
  for (const e of entries) {
    if (e.kind === "team" && e.slug !== undefined)
      addTeam(e.slug, e.en, [e.ko]);
  }
  for (const club of BIG_CLUBS) {
    addTeam(
      club.slug,
      [
        ...(club.terms.latin ?? []),
        ...(club.terms.en ?? []),
        ...(club.terms.it ?? []),
        ...(club.terms.es ?? []),
      ],
      club.terms.ko ?? [],
      {
        latin: [
          ...(club.exclude?.latin ?? []),
          ...(club.exclude?.en ?? []),
          ...(club.exclude?.it ?? []),
          ...(club.exclude?.es ?? []),
        ],
        ko: club.exclude?.ko ?? [],
      },
    );
  }
  const teamTags = dropSharedTerms([...teams.values()]).map((spec) => {
    const women = womenTeamExcludes({ latin: spec.latin, ko: spec.ko });
    return compileTag({
      ...spec,
      womenLatin: women.latin ?? [],
      womenKo: women.ko ?? [],
    });
  });

  const players = new Map<string, TagSpec>();
  const addPlayer = (
    slug: string,
    latin: readonly string[],
    ko: readonly string[],
  ) => {
    const prev = players.get(slug);
    players.set(slug, {
      slug,
      kind: "player",
      latin: [...(prev?.latin ?? []), ...latin],
      ko: [...(prev?.ko ?? []), ...ko],
    });
  };
  for (const e of entries) {
    if (e.kind === "player" && e.slug !== undefined) {
      addPlayer(e.slug, e.en, [e.ko]);
    }
  }
  const playerLeague = new Map<string, LeagueId>();
  for (const p of input.koreanPlayers ?? []) {
    addPlayer(p.slug, [p.nameEn], koNameTerms(p.nameKo));
    if (p.active && isLeagueId(p.comp)) playerLeague.set(p.slug, p.comp);
  }
  const playerTags = dropSharedTerms([...players.values()]).map(compileTag);

  return {
    teams: teamTags,
    players: playerTags,
    teamLeague: input.teamLeague ?? TEAM_LEAGUE_INDEX,
    playerLeague,
    competitions: (Object.keys(COMPETITION_TERMS) as CompId[]).map((comp) => ({
      comp,
      group: compileGroup(COMPETITION_TERMS[comp]),
    })),
  };
}

// ─── 맞추기 ──────────────────────────────────────────────────────────────

/** 태그 1개 — 제목 안 처음 나온 자리(정렬용) */
export interface TagHit {
  slug: string;
  pos: number;
}

/** 제목 1건의 태그 */
export interface TitleTags {
  teams: TagHit[];
  players: TagHit[];
  /** 제목에 나온 범위 대회 표현 */
  comps: CompId[];
  /**
   * 이름 바로 앞뒤에 직업 명사가 붙어 선수 태그에서 뺀 slug('배우 김민재'·'가수 정우영' — news-keywords.ts `KO_OCCUPATION_NOUNS`, 국내
   * 제목만). 키워드 색인(kr·범위 근거)도 이 slug를 그 선수로 보지 않는다(classify.ts·news-scope.ts).
   */
  occupationPlayers: string[];
}

/** 제목 태그 맞춤 맥락 */
export interface TitleTagContext {
  /** 그 기사 소스의 대회(겹치는 별칭의 확인 근거 — Di Marzio = SERIEA) */
  sourceComps?: readonly CompId[];
}

interface RawHit {
  slug: string;
  pos: number;
  /** 맞은 표기의 끝 자리(맞춤 텍스트 기준 — 두 별칭 사이 스코어 확인용) */
  end: number;
  ambiguous: boolean;
}

/**
 * 유소년·2군 접미(팀 표기 바로 뒤 — 'Arsenal U21'·'Arsenal Under-21s'·'Bayern II'·'Real Madrid B'·'Real Madrid Castilla'·'Barça
 * Atlètic'·'Juventus Next Gen'·'Roma Primavera'·'아스널 U-21'·'레알 2군'·'레알 B팀') — 이 자리의 표기는 1군 팀 태그가 아니다(M1-17
 * 재리뷰: 'Arsenal U21 2-1 Chelsea U21'이 1군 경기와 합쳐졌다). 라틴은 `latinSpaced` 텍스트(하이픈은 공백), 한국어는 `koSpaced` 텍스트.
 * 'reserve(s)'는 뒤에 스코어·v·제목 끝이 올 때만('Chelsea reserve keeper Kepa'는 1군 첼시), 국내 'B'는 띄어 쓴 낱말일 때만('아스널 B조'·
 * '레알 B플랜'은 아니다), 쌍점 뒤('Arsenal 2-1 Chelsea: U21 graduate')는 접미가 아니다(`LATIN_BREAK` — M1-17 3차 리뷰).
 */
const YOUTH_SUFFIX_LATIN =
  /^ (?:(?:u ?(?:1[5-9]|2[0-3])s?|under ?(?:1[5-9]|2[0-3])s?|ii|b|castilla|atletic|next gen|primavera)(?= )|reserves?(?= \d| v | vs |\s*$))/iu;
const YOUTH_SUFFIX_KO =
  /^\s?(?:u-?(?:1[5-9]|2[0-3])(?!\d)|2군|b팀|b(?=\s|$)|ii(?=\s|$)|카스티야|리저브|프리마베라)/iu;

/**
 * 라틴 제목의 쌍점·세로줄 자리 표시(글자 — `latinSpaced`가 지우지 않는다). 유소년 접미 판정이 쌍점 너머를 보지 않게 맞춤 텍스트에
 * 낱말 하나로 넣는다('Chelsea: U21 graduate'). 팀·선수 표기에는 쓰이지 않는 글자(U+01C2).
 */
const LATIN_BREAK = "\u01c2";

/** 직업 명사 정규식(이름 앞 — 사이에 공백·따옴표·가운뎃점만, 이름 뒤 — 조사 허용) */
const OCCUPATION = KO_OCCUPATION_NOUNS.map(escapeRe).join("|");
const OCCUPATION_BEFORE = new RegExp(
  `(?<=^|[^\\p{L}\\p{N}]|겸)(?:${OCCUPATION})[\\s'"‘’“”\`·,]*$`,
  "iu",
);
const OCCUPATION_AFTER = new RegExp(
  `^[\\s'"‘’“”·]*(?:${OCCUPATION})${KO_SUFFIX_PATTERN}(?![\\p{L}\\p{N}])`,
  "iu",
);

/**
 * 대상 1개의 첫 자리 — 제외 표현 자리를 글자가 아닌 표시로 지운 뒤 표기마다 첫 맞춤. 겹치는 별칭은 `capitalOk`(라틴 대문자 시작)를
 * 지나는 첫 맞춤만. 겹치지 않는 표기의 맞춤이 있으면 그것이 우선(확인 근거가 필요 없다), 같은 종류끼리는 앞자리.
 */
function firstHit(
  tag: CompiledTag,
  ko: boolean,
  text: string,
  capitalOk: (match: RegExpMatchArray) => boolean,
  youthCheck = false,
): RawHit | null {
  const youth = ko ? YOUTH_SUFFIX_KO : YOUTH_SUFFIX_LATIN;
  const terms = ko ? tag.ko : tag.latin;
  // 표기가 하나도 없으면 제외 표현을 지울 필요가 없다(대부분의 제목·대상 — 비용 절약)
  if (!terms.some((term) => text.search(term.re) >= 0)) return null;
  let hay = text;
  for (const ex of ko ? tag.excludeKo : tag.excludeLatin) {
    hay = hay.replace(ex, (m) => "\u0000".repeat(m.length));
  }
  // 유소년·2군 팀 표기('Arsenal U21'·'레알 마드리드 카스티야')가 시작하는 자리 — 그 자리의 짧은 별칭('레알')도 그 팀이 아니다
  const youthAt = new Set<number>();
  if (youthCheck) {
    for (const term of terms) {
      for (const m of hay.matchAll(term.re)) {
        if (youth.test(hay.slice(m.index + m[0].length))) youthAt.add(m.index);
      }
    }
  }
  let best: RawHit | null = null;
  for (const term of terms) {
    for (const m of hay.matchAll(term.re)) {
      if (term.ambiguous && !capitalOk(m)) continue;
      // 유소년·2군 팀 자리는 건너뛰고 다음 맞춤을 본다
      if (youthAt.has(m.index)) continue;
      const end = m.index + m[0].length;
      const hit = {
        slug: tag.slug,
        pos: m.index,
        end,
        ambiguous: term.ambiguous,
      };
      if (
        best === null ||
        (best.ambiguous && !hit.ambiguous) ||
        (best.ambiguous === hit.ambiguous && hit.pos < best.pos)
      ) {
        best = hit;
      }
      break;
    }
  }
  return best;
}

/**
 * 장소 앞말 — 겹치는 별칭이 이 말 뒤에 오면 도시(장소)로 본다('Inter Milan fans in Milan', 'El Barça viaja a Roma', 'draw at Lens').
 * 비교 키(발음 기호 제거·소문자).
 */
export const LOCATIVE_WORDS: ReadonlySet<string> = new Set([
  "in",
  "at",
  "to",
  "from",
  "near",
  "outside",
  "around",
  "into",
  "across",
  "en",
  "a",
  "desde",
  "hacia",
  "da",
  "verso",
]);

/** 라틴 원문 낱말(발음 기호 유지 — `latinSpaced`와 같은 낱말 나눔) */
function originalWords(title: string): string[] {
  return title
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim()
    .split(" ");
}

/**
 * 제목 1건 → 팀·선수 태그(제목 안 순서) + 대회 표현. 국내 제목은 한국어 표기만, 그 밖은 라틴 표기만 본다.
 *   - 겹치는 별칭(`AMBIGUOUS_TAG_TERMS`)만 맞은 팀은 ① 라틴 원문이 대문자로 시작하고 ② 원문에 발음 기호가 없고('Cómo'는 Como가 아니다)
 *     ③ 앞말이 장소 앞말(`LOCATIVE_WORDS`)이 아니고 ④ 같은 제목에 확인 근거 — **같은 리그의 다른 팀**(겹치지 않는 표기) · 그 팀 리그의
 *     대회 표현 · 그 팀 리그가 **한 리그만 다루는** 소스의 대회(Di Marzio = 세리에 A — BBC European 4개 리그는 아니다) — 가 있을 때만 남긴다(M1-17 리뷰: 'Nice touch: Saka inspires Arsenal'·'Milan fashion week:
 *     Chelsea star'는 다른 리그 팀이라 근거가 아니다). 제목 첫 낱말의 대문자는 ①을 지나지만 근거는 아니다(④가 있어야 한다).
 *   - 여자팀 표현('Arsenal Women'·'Barcelona Femení'·'첼시 위민')이 하나라도 맞으면 그 제목은 여자팀 기사 — 팀 태그를 붙이지 않는다
 *     (서비스 범위 밖, 같은 제목의 상대 팀도 여자팀이다).
 */
export function matchTitleTags(
  title: string,
  lang: string,
  index: TagIndex,
  ctx: TitleTagContext = {},
): TitleTags {
  const ko = isKoLang(lang);
  // 라틴 쌍점·세로줄은 낱말 하나(LATIN_BREAK)로 남긴다 — 유소년 접미가 쌍점 너머를 보지 않게
  const broken = ko ? title : title.replace(/\s*[:|]\s*/gu, ` ${LATIN_BREAK} `);
  const text = ko ? koSpaced(title) : latinSpaced(broken);
  const words = ko ? [] : text.trim().split(" ");
  const origWords = ko ? [] : originalWords(broken);
  const aligned = words.length === origWords.length;
  const wordIndexAt = (pos: number) =>
    (text.slice(0, pos).match(/ /gu) ?? []).length - 1;
  // 라틴 겹치는 별칭: 대문자 시작 · 발음 기호 없음 · 장소 앞말 뒤가 아님(정규식은 대소문자·발음 기호 무시)
  const capitalOk = (m: RegExpMatchArray) => {
    if (ko) return true;
    const first = m[0]?.[0] ?? "";
    if (first === first.toLowerCase()) return false;
    const wi = wordIndexAt(m.index ?? 0);
    if (aligned && /\p{M}/u.test((origWords[wi] ?? "").normalize("NFD"))) {
      return false;
    }
    const prev = (words[wi - 1] ?? "").toLowerCase();
    return !LOCATIVE_WORDS.has(prev);
  };
  const tt = titleText(title, lang);
  const comps = index.competitions
    .filter((c) => matchesGroup(tt, c.group))
    .map((c) => c.comp);

  let women = false;
  const teamRaw = index.teams.flatMap((tag) => {
    const hit = firstHit(tag, ko, text, capitalOk, true);
    if (hit === null) return [];
    const womenRes = ko ? tag.womenKo : tag.womenLatin;
    if (womenRes.some((re) => text.search(re) >= 0)) women = true;
    return [hit];
  });
  const confirmed = teamRaw.filter((h) => !h.ambiguous).map((h) => h.slug);
  // 소스 대회는 한 리그만 다루는 소스일 때만 근거(Di Marzio = 세리에 A) — BBC European(4개 리그)은 근거가 아니다
  const sourceLeagues = (ctx.sourceComps ?? []).filter((c) => c !== "UCL");
  const sourceLeague = sourceLeagues.length === 1 ? sourceLeagues[0] : null;
  // 같은 리그의 겹치는 별칭 둘이 스코어를 사이에 두고 나오면('Valencia 1-1 Sevilla'·'Roma-Torino 1-0') 서로가 확인 근거다(경기 결과
  // 제목 — BBC European 실데이터, M1-17 재리뷰)
  const scoreBetween = (a: RawHit, b: RawHit): boolean => {
    const [x, y] = a.pos < b.pos ? [a, b] : [b, a];
    if (x.end > y.pos) return false;
    const between = text.slice(x.end, y.pos);
    const after = text.slice(y.end);
    return ko
      ? /^\s?\d{1,2}\s?[-–:]\s?\d{1,2}\s?$/u.test(between) ||
          (/^\s?[-–]\s?$/u.test(between) &&
            /^\s?\d{1,2}\s?[-–:]\s?\d{1,2}(?!\d)/u.test(after))
      : /^ \d{1,2} \d{1,2} $/u.test(between) ||
          (between === " " && /^ \d{1,2} \d{1,2}(?= )/u.test(after));
  };
  const teams = women
    ? []
    : teamRaw.filter((h) => {
        if (!h.ambiguous) return true;
        const league = index.teamLeague.get(h.slug);
        if (league === undefined) return false;
        const sameLeagueTeam = confirmed.some(
          (s) => s !== h.slug && index.teamLeague.get(s) === league,
        );
        const scoredPair = teamRaw.some(
          (o) =>
            o.ambiguous &&
            o.slug !== h.slug &&
            index.teamLeague.get(o.slug) === league &&
            scoreBetween(h, o),
        );
        return (
          sameLeagueTeam ||
          scoredPair ||
          comps.includes(league) ||
          sourceLeague === league
        );
      });
  // 국내 제목: 이름 바로 앞뒤에 직업 명사('배우 김민재'·'정우영 배우')가 붙으면 그 선수가 아니다(동명이인 — M1-17 3차 리뷰)
  const occupationPlayers: string[] = [];
  const players = index.players.flatMap((tag) => {
    const hit = firstHit(tag, ko, text, () => true);
    if (hit === null) return [];
    if (
      ko &&
      (OCCUPATION_BEFORE.test(text.slice(0, hit.pos)) ||
        OCCUPATION_AFTER.test(text.slice(hit.end)))
    ) {
      occupationPlayers.push(hit.slug);
      return [];
    }
    return [hit];
  });
  const byPos = (a: TagHit, b: TagHit) => a.pos - b.pos;
  return {
    teams: teams.map(({ slug, pos }) => ({ slug, pos })).sort(byPos),
    players: players.map(({ slug, pos }) => ({ slug, pos })).sort(byPos),
    comps,
    occupationPlayers,
  };
}

/** 여러 제목 태그의 합집합(앞 제목 먼저, 제목 안 순서 — 중복 없음) */
export function unionTags(lists: readonly (readonly TagHit[])[]): string[] {
  const out: string[] = [];
  for (const list of lists) {
    for (const hit of list) if (!out.includes(hit.slug)) out.push(hit.slug);
  }
  return out;
}

/** 태그의 리그(팀 → team-leagues, 활성 등록 한국 선수 → 소속 리그) — 중복 없음, 처음 나온 순서 */
export function tagLeagues(
  teams: readonly string[],
  players: readonly string[],
  index: Pick<TagIndex, "teamLeague" | "playerLeague">,
): LeagueId[] {
  const out: LeagueId[] = [];
  const push = (league: LeagueId | undefined) => {
    if (league !== undefined && !out.includes(league)) out.push(league);
  };
  for (const slug of teams) push(index.teamLeague.get(slug));
  for (const slug of players) push(index.playerLeague.get(slug));
  return out;
}
