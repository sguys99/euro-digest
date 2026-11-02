/**
 * 검색 색인 모델 — 빌드(색인을 만드는 쪽)와 검색 섬(읽는 쪽)이 함께 쓰는 순수 규칙 (PRD FR-130·FR-131, plan M4-14)
 *
 * 색인은 Pagefind(빌드 후 `scripts/build-search.ts`)가 만든다. 레코드 하나 = 화면의 결과 한 줄이다.
 * - 선수·팀·대회: 그 페이지의 숨은 레코드(`SearchRecord` — `data-pagefind-body` + 별칭 글자 + 메타·필터 속성)를 Pagefind가 HTML에서 읽는다.
 * - 뉴스: 카드마다 사용자 정의 레코드(빌드 스크립트가 삭제 요청을 뺀 뉴스 로더로 만든다 — 페이지 하나에 카드가 수십 장이라 HTML 색인으로는
 *   카드 단위 결과가 나오지 않는다).
 * 화면은 Pagefind 결과의 `meta`(문자열 표)만 읽어 그린다 — 키·인코딩 규칙은 이 파일이 단일 출처다.
 *
 * 클라이언트 섬도 import한다 — 의존성 없음(zod·node:fs 금지, 초기 JS 예산).
 */
import type { CompId } from "@/lib/schema/common";

// ─── 유형 ───────────────────────────────────────────────────────────────────

/** 결과 유형 — 묶음 순서 그대로(선수 · 팀 · 대회 · 뉴스) */
export const SEARCH_TYPES = ["player", "team", "competition", "news"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/** 묶음 머리 글자 */
export const SEARCH_TYPE_LABEL: Readonly<Record<SearchType, string>> = {
  player: "선수",
  team: "팀",
  competition: "대회",
  news: "뉴스",
};

/** Pagefind 필터 이름 — 유형 */
export const SEARCH_TYPE_FILTER = "type";

/** Pagefind 정렬 키 — 뉴스 대표 출처 시각(UTC ISO — 문자열 순서 = 시각 순서) */
export const SEARCH_SORT_AT = "at";

/** 결과 가림 메타 값(M4-15 — spoiler 카드) */
export const SPOILER_META = "1";

/**
 * 메타 키 — Pagefind는 키를 소문자로 다룬다. `title`은 Pagefind 기본 메타(제목)다.
 * 선수: title · en · team · pos · 배지(short · k1 · k2 · kf) / 팀: title · en · sub · 배지 / 대회: title · en · short · comp
 * 뉴스: title · link · src · srclang · lang · at · abs · cat · tags · kr · spoiler · comp
 */
export const META = {
  title: "title",
  en: "en",
  team: "team",
  pos: "pos",
  sub: "sub",
  short: "short",
  k1: "k1",
  k2: "k2",
  kf: "kf",
  comp: "comp",
  link: "link",
  src: "src",
  srcLang: "srclang",
  lang: "lang",
  at: "at",
  abs: "abs",
  cat: "cat",
  tags: "tags",
  kr: "kr",
  spoiler: "spoiler",
} as const;

// ─── 결과 ───────────────────────────────────────────────────────────────────

/** 팀 배지(팀 컬러 이니셜 — DR-05). 색이 없는 팀은 null(폴백 배지) */
export interface KitMark {
  short: string;
  /** [상의, 하의, 상의 위 글자] */
  colors: readonly [string, string, string] | null;
}

export interface PlayerHit {
  type: "player";
  url: string;
  name: string;
  en: string;
  /** 소속팀 한글 이름 */
  team: string;
  pos: string;
  kit: KitMark | null;
}

export interface TeamHit {
  type: "team";
  url: string;
  name: string;
  en: string;
  /** 오른쪽 보조 글자 — "김민재 소속" 또는 대회 이름 */
  sub: string;
  kit: KitMark | null;
}

export interface CompetitionHit {
  type: "competition";
  url: string;
  name: string;
  en: string;
  short: string;
  comp: CompId | null;
}

export interface NewsTag {
  label: string;
  /** 한국 선수 태그(800 --ink) */
  korean: boolean;
}

export interface NewsHit {
  type: "news";
  /** 카드 앵커(날짜 아카이브 `#카드 ID` — basePath 포함) */
  url: string;
  /** 원문 링크(대표 출처) */
  link: string;
  title: string;
  lang: string;
  src: string;
  srcLang: string;
  /** 대표 출처 시각(UTC ISO) */
  at: string;
  /** 절대 시각 KST("10.31 00:35" — 빌드 때 계산) */
  abs: string;
  /** 분류 도장 글자 */
  cat: string;
  tags: NewsTag[];
  kr: boolean;
  spoiler: boolean;
}

export type SearchHit = PlayerHit | TeamHit | CompetitionHit | NewsHit;

/** Pagefind `result.data()`에서 쓰는 부분 */
export interface RawResultData {
  url: string;
  meta: Readonly<Record<string, string | undefined>>;
}

const COMP_IDS: readonly CompId[] = [
  "EPL",
  "LALIGA",
  "SERIEA",
  "BUNDESLIGA",
  "LIGUE1",
  "UCL",
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const HTTP_URL = /^https?:\/\//;

function text(meta: RawResultData["meta"], key: string): string {
  return (meta[key] ?? "").trim();
}

function kitOf(meta: RawResultData["meta"]): KitMark | null {
  const short = text(meta, META.short);
  if (!short) return null;
  const k1 = text(meta, META.k1);
  const k2 = text(meta, META.k2);
  const kf = text(meta, META.kf);
  const colors =
    HEX.test(k1) && HEX.test(k2) && HEX.test(kf)
      ? ([k1, k2, kf] as const)
      : null;
  return { short, colors };
}

/**
 * 결과 데이터 → 화면 결과. 필수 값(제목·URL — 뉴스는 원문 링크 http(s))이 없으면 null(그 결과를 그리지 않는다 — 색인은 우리 빌드가 만들지만
 * 경계라서 검사한다).
 */
export function hitFromData(
  type: SearchType,
  data: RawResultData,
): SearchHit | null {
  const { meta } = data;
  const title = text(meta, META.title);
  if (!title || !data.url) return null;
  switch (type) {
    case "player":
      return {
        type,
        url: data.url,
        name: title,
        en: text(meta, META.en),
        team: text(meta, META.team),
        pos: text(meta, META.pos),
        kit: kitOf(meta),
      };
    case "team":
      return {
        type,
        url: data.url,
        name: title,
        en: text(meta, META.en),
        sub: text(meta, META.sub),
        kit: kitOf(meta),
      };
    case "competition": {
      const comp = text(meta, META.comp);
      return {
        type,
        url: data.url,
        name: title,
        en: text(meta, META.en),
        short: text(meta, META.short),
        comp: COMP_IDS.find((id) => id === comp) ?? null,
      };
    }
    case "news": {
      const link = text(meta, META.link);
      if (!HTTP_URL.test(link)) return null;
      return {
        type,
        url: data.url,
        link,
        title,
        lang: text(meta, META.lang) || "ko",
        src: text(meta, META.src),
        srcLang: text(meta, META.srcLang) || "ko",
        at: text(meta, META.at),
        abs: text(meta, META.abs),
        cat: text(meta, META.cat),
        tags: decodeTags(text(meta, META.tags)),
        kr: text(meta, META.kr) === "1",
        spoiler: text(meta, META.spoiler) === SPOILER_META,
      };
    }
  }
}

// ─── 태그 인코딩 ────────────────────────────────────────────────────────────

const TAG_SEP = "|";
const KOREAN_MARK = "*";

/** 태그 → 메타 문자열("바이에른 뮌헨|*김민재" — 한국 선수 앞에 `*`). 구분 글자는 이름에서 지운다 */
export function encodeTags(tags: readonly NewsTag[]): string {
  return tags
    .map((t) => {
      const label = t.label.replaceAll(TAG_SEP, " ").replace(/^\*+/, "").trim();
      return label ? `${t.korean ? KOREAN_MARK : ""}${label}` : "";
    })
    .filter(Boolean)
    .join(TAG_SEP);
}

export function decodeTags(value: string): NewsTag[] {
  if (!value) return [];
  return value
    .split(TAG_SEP)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part.startsWith(KOREAN_MARK)
        ? { label: part.slice(1), korean: true }
        : { label: part, korean: false },
    )
    .filter((t) => t.label.length > 0);
}

// ─── 한글 색인(입력 전 — 한국 선수 가나다) ────────────────────────────────────

const CHOSEONG = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
] as const;

/** 된소리는 예사소리 칸에 모은다(책 뒤 색인 관례 — ㄲ → ㄱ) */
const FOLD: Readonly<Record<string, string>> = {
  ㄲ: "ㄱ",
  ㄸ: "ㄷ",
  ㅃ: "ㅂ",
  ㅆ: "ㅅ",
  ㅉ: "ㅈ",
};

/** 이름 첫 글자의 초성(색인 칸). 첫 글자가 한글 음절이 아니면 그 글자를 대문자로("#"은 비었을 때) */
export function indexInitial(name: string): string {
  const first = name.trim().charAt(0);
  if (!first) return "#";
  const code = first.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jamo = CHOSEONG[Math.floor((code - 0xac00) / 588)]!;
    return FOLD[jamo] ?? jamo;
  }
  return first.toUpperCase();
}

export interface IndexEntry {
  slug: string;
  nameKo: string;
  nameEn: string;
}

export interface IndexGroup<T extends IndexEntry = IndexEntry> {
  initial: string;
  entries: T[];
}

/** 가나다순 → 초성 칸으로 묶는다(칸 순서도 가나다) */
export function groupByInitial<T extends IndexEntry>(
  entries: readonly T[],
): IndexGroup<T>[] {
  const sorted = [...entries].sort(
    (a, b) =>
      a.nameKo.localeCompare(b.nameKo, "ko") || a.slug.localeCompare(b.slug),
  );
  const groups: IndexGroup<T>[] = [];
  for (const entry of sorted) {
    const initial = indexInitial(entry.nameKo);
    const last = groups.at(-1);
    if (last && last.initial === initial) last.entries.push(entry);
    else groups.push({ initial, entries: [entry] });
  }
  return groups;
}

// ─── 질의 ───────────────────────────────────────────────────────────────────

/** 검색어 정리 — 앞뒤 공백 제거, 공백 하나로, 너무 긴 입력은 자른다(색인 조회 비용) */
export const MAX_QUERY_LENGTH = 60;

export function normalizeQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

/** `/search/?q=` 쿼리 문자열 → 검색어 */
export function queryFromSearch(search: string): string {
  try {
    return normalizeQuery(new URLSearchParams(search).get("q") ?? "");
  } catch {
    return "";
  }
}

// ─── 접두 되물림 거르기 ─────────────────────────────────────────────────────

/** 비교용 낱말 — 소문자, 악센트 제거(München = munchen), 글자·숫자 아닌 것으로 자른다(Pagefind 낱말 경계와 같은 쪽) */
export function searchTokens(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** 짧은 쪽 접두 일치를 받아들이는 최소 비율(검색어 낱말 길이 대비) — '김민재가' → '김민재'(3/4) ○, 'Magdeburg' → 'ma'(2/9) ✗ */
export const MIN_PREFIX_RATIO = 0.6;

/**
 * 결과가 검색어와 정말 맞는가 — Pagefind는 검색어 낱말이 색인에 없으면 **가장 긴 접두 낱말**로 되물러 찾는다('Magdeburg' → 'ma'가 든 이탈리아어
 * 기사, 'zzzz' → 'z…' 팀 — 실측). 검색어 낱말마다 결과 글자(본문 + 메타)에 ① 그 낱말로 시작하는 낱말이 있거나 ② 그 낱말의 접두이면서 길이가
 * 낱말의 60% 이상인 낱말이 있으면 맞다(한국어 조사 '김민재가' → '김민재'는 살린다). 되물림은 결과 묶음 전체에 같으므로 묶음의 첫 결과로 판정한다.
 */
export function matchesQuery(query: string, haystack: string): boolean {
  const terms = searchTokens(query);
  if (terms.length === 0) return false;
  const words = searchTokens(haystack);
  return terms.every((term) =>
    words.some(
      (word) =>
        word.startsWith(term) ||
        (term.startsWith(word) &&
          word.length >= Math.ceil(term.length * MIN_PREFIX_RATIO)),
    ),
  );
}

/** 결과 데이터의 비교 글자 — 본문 + 메타 값 */
export function resultText(data: RawResultData & { content?: string }): string {
  return [data.content ?? "", ...Object.values(data.meta)].join(" ");
}
