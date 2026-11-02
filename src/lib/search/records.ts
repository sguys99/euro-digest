/**
 * 검색 레코드 만들기 — 별칭(FR-131)·메타·뉴스 사용자 정의 레코드 (PRD FR-130·FR-131, plan M4-14). 순수 함수(빌드·서버 컴포넌트에서만 쓴다).
 *
 * 별칭 규칙(색인 글자 — 화면에 보이지 않는다)
 * - 선수: 한글 이름 + **이름(성 뺀 2글자)** + 영문 대표 표기 + `names.ko.json`의 영문 변형 전부("Min-jae Kim" · "Kim Min-jae" · "Minjae Kim")
 *   + 소속팀 한글 이름. Pagefind는 한국어를 공백으로만 자르고 **낱말 앞부분 일치**만 하므로('김민' → 김민재 ○, '민재' → 김민재 ✗) 이름을
 *   따로 넣어 '민재'로도 찾게 한다(실측 — DESIGN §11 M4-14). 영문 붙임표 낱말은 Pagefind가 이어 쓴 꼴('minjae')도 함께 색인한다.
 * - 팀: 한글 이름 + 영문 이름(팀 파일·사전 변형 전부 — "Bayern" · "Bayern Munich" · "FC Bayern München") + 배지 약어 + 이 팀 한국 선수(한글 ·
 *   이름 · 영문) + 이 팀 화면에 실린 선수 이름(주요 선수 · 팀시트 — 사전에 있으면 한글도). 악센트는 Pagefind가 접는다(München = Munchen).
 * - 대회: 한글 이름 · 약칭 · 영문 이름 · 대회 ID.
 * - 뉴스: 원제목 + 분류 글자 + 태그(팀·선수) 한글 + 그 태그의 영문 변형 + 대표 출처명 — 'Arsenal'로 한국어 기사를, '김민재'로 영문 기사를 찾는다.
 *   원제목은 바꾸지 않는다(D23 — 색인 글자에 덧붙일 뿐).
 * 입력에 없는 사실은 만들지 않는다 — 별칭은 설정·데이터에 있는 이름과 그 이름을 자른 꼴뿐이다.
 */
import { kitTextColor } from "@/lib/kit-contrast";
import type { NewsCard } from "@/lib/schema/news";

import {
  encodeTags,
  META,
  SEARCH_SORT_AT,
  SEARCH_TYPE_FILTER,
  SPOILER_META,
  type NewsTag,
  type SearchType,
} from "./model";

/** 페이지 레코드(선수·팀·대회) — `SearchRecord` 컴포넌트가 숨은 HTML로 그린다 */
export interface PageSearchRecord {
  type: Exclude<SearchType, "news">;
  /** 메타 [키, 값] — 값이 빈 것은 뺀 뒤 */
  meta: ReadonlyArray<readonly [string, string]>;
  /** 별칭 글자(중복 제거 — 대소문자 무시) */
  aliases: readonly string[];
}

/** Pagefind 사용자 정의 레코드(뉴스 카드 1장) — `pagefind` Node API `addCustomRecord` 입력과 같은 모양 */
export interface NewsSearchRecord {
  url: string;
  content: string;
  language: "ko";
  meta: Record<string, string>;
  filters: Record<string, string[]>;
  sort: Record<string, string>;
}

// ─── 별칭 ───────────────────────────────────────────────────────────────────

const HANGUL_NAME_3 = /^[가-힣]{3}$/;

/**
 * 한글 세 글자 이름의 이름 부분("김민재" → "민재"). 띄어 쓴 이름("옌스 카스트로프")은 낱말마다 앞부분 일치가 되므로 null, 두 글자·네 글자
 * (복성 여부를 알 수 없다)도 null.
 */
export function koreanGivenName(name: string): string | null {
  const trimmed = name.trim();
  return HANGUL_NAME_3.test(trimmed) ? trimmed.slice(1) : null;
}

/** 별칭 목록 — 공백 정리, 빈 값 제거, 대소문자 무시 중복 제거(처음 나온 꼴 유지) */
export function aliasList(
  ...parts: ReadonlyArray<string | null | undefined | readonly string[]>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (value: string | null | undefined) => {
    const v = (value ?? "").replace(/\s+/g, " ").trim();
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };
  for (const part of parts) {
    if (typeof part === "string" || part == null) add(part);
    else part.forEach(add);
  }
  return out;
}

function metaEntries(
  entries: ReadonlyArray<readonly [string, string | null | undefined]>,
): Array<readonly [string, string]> {
  return entries.flatMap(([k, v]) => {
    const value = (v ?? "").replace(/\s+/g, " ").trim();
    return value ? [[k, value] as const] : [];
  });
}

/** 팀 배지 메타(약어 · 상의 · 하의 · 상의 위 글자색 — 빌드 때 계산, src/lib/kit-contrast.ts) */
function kitMeta(
  short: string,
  colors: readonly [string, string] | null,
): Array<readonly [string, string | null]> {
  return [
    [META.short, short],
    [META.k1, colors ? colors[0] : null],
    [META.k2, colors ? colors[1] : null],
    [META.kf, colors ? kitTextColor(colors[0]) : null],
  ];
}

// ─── 선수 · 팀 · 대회 ───────────────────────────────────────────────────────

export interface NameAliases {
  ko: string;
  /** 영문 대표 표기 + 변형 */
  en: readonly string[];
}

export interface PlayerRecordInput {
  nameKo: string;
  nameEn: string;
  /** `names.ko.json` 영문 변형(없으면 빈 배열) */
  enVariants: readonly string[];
  position: string;
  team: {
    name: string;
    short: string;
    colors: readonly [string, string] | null;
  };
}

export function playerSearchRecord(input: PlayerRecordInput): PageSearchRecord {
  return {
    type: "player",
    meta: metaEntries([
      [META.title, input.nameKo],
      [META.en, input.nameEn],
      [META.team, input.team.name],
      [META.pos, input.position],
      ...kitMeta(input.team.short, input.team.colors),
    ]),
    aliases: aliasList(
      input.nameKo,
      koreanGivenName(input.nameKo),
      input.nameEn,
      input.enVariants,
      input.team.name,
    ),
  };
}

export interface TeamRecordInput {
  nameKo: string;
  /** 팀 파일 영문 이름("FC Bayern München") */
  nameEn: string;
  enVariants: readonly string[];
  short: string;
  colors: readonly [string, string] | null;
  /** 이 팀 한국 선수(설정 순서) */
  korean: ReadonlyArray<{
    nameKo: string;
    nameEn: string;
    enVariants: readonly string[];
  }>;
  /** 이 팀 화면의 선수 이름(주요 선수 · 팀시트 — 영문 원문과 사전 한글) */
  squad: readonly string[];
}

/**
 * 팀 보조 글자 — 한국 선수가 있으면 "김민재 소속"(여럿이면 가운뎃점), 없으면 빈 글자(화면은 영문 이름만). 대회 이름은 넣지 않는다 — Pagefind는
 * 메타 값도 찾는 글자로 쓰므로 '프리미어리그'로 찾으면 그 리그 팀이 모두 걸린다(실측 18팀 — 한국 선수 팀은 빠져 들쭉날쭉).
 */
export function teamSubText(input: Pick<TeamRecordInput, "korean">): string {
  if (input.korean.length === 0) return "";
  return `${input.korean.map((p) => p.nameKo).join(" · ")} 소속`;
}

export function teamSearchRecord(input: TeamRecordInput): PageSearchRecord {
  return {
    type: "team",
    meta: metaEntries([
      [META.title, input.nameKo],
      [META.en, input.nameEn],
      [META.sub, teamSubText(input)],
      ...kitMeta(input.short, input.colors),
    ]),
    aliases: aliasList(
      input.nameKo,
      input.nameEn,
      input.enVariants,
      input.short,
      input.korean.flatMap((p) => [
        p.nameKo,
        koreanGivenName(p.nameKo) ?? "",
        p.nameEn,
        ...p.enVariants,
      ]),
      input.squad,
    ),
  };
}

export interface CompetitionRecordInput {
  id: string;
  nameKo: string;
  nameEn: string;
  shortKo: string;
}

export function competitionSearchRecord(
  input: CompetitionRecordInput,
): PageSearchRecord {
  return {
    type: "competition",
    meta: metaEntries([
      [META.title, input.nameKo],
      [META.en, input.nameEn],
      [META.short, input.shortKo],
      [META.comp, input.id],
    ]),
    aliases: aliasList(input.nameKo, input.shortKo, input.nameEn, input.id),
  };
}

// ─── 뉴스 ───────────────────────────────────────────────────────────────────

export interface NewsRecordInput {
  card: Pick<NewsCard, "id" | "t" | "lang" | "kr" | "spoiler" | "src">;
  /** 카드 앵커(basePath 없음 — `routes.card(date, id)`) */
  url: string;
  /** 분류 도장 글자 */
  category: string;
  /** 태그(팀 → 선수, 한국 선수 굵게) — 화면 표시 그대로 */
  tags: readonly NewsTag[];
  /** 태그 대상의 영문 변형(색인 글자만) */
  tagAliases: readonly string[];
  /** 대표 출처명의 `lang` */
  sourceLang: string;
  /** 대표 출처 절대 시각 KST("10.31 00:35") */
  abs: string;
}

export function newsSearchRecord(input: NewsRecordInput): NewsSearchRecord {
  const { card } = input;
  const lead = card.src[0];
  if (!lead) throw new Error(`카드 ${card.id}: 출처가 없음`);
  const meta = Object.fromEntries(
    metaEntries([
      [META.title, card.t],
      [META.link, lead.u],
      [META.src, lead.n],
      [META.srcLang, input.sourceLang],
      [META.lang, card.lang],
      [META.at, lead.at],
      [META.abs, input.abs],
      [META.cat, input.category],
      [META.tags, encodeTags(input.tags)],
      [META.kr, card.kr ? "1" : null],
      [META.spoiler, card.spoiler ? SPOILER_META : null],
    ]),
  );
  return {
    url: input.url,
    content: aliasList(
      card.t,
      input.category,
      input.tags.map((t) => t.label),
      input.tagAliases,
      lead.n,
    ).join(" "),
    language: "ko",
    meta,
    filters: { [SEARCH_TYPE_FILTER]: ["news"], lang: [card.lang] },
    sort: { [SEARCH_SORT_AT]: lead.at },
  };
}
