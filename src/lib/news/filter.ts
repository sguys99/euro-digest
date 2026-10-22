/**
 * 뉴스 필터 — 상태·주소 쿼리·술어·건수 (PRD FR-31·FR-32, DESIGN.md §9.2 Chip·Tabs · §9.3, DECISIONS D0 §5 #11·#13, plan M1-33)
 *
 * 순수 모듈이다(DOM·fs·zod 없음 — 타입만 import). 서버 컴포넌트(목차·칩 건수, 부트 설정)와 필터 섬(상태 전환·주소 갱신)이 함께 쓴다.
 * DOM에 상태를 그리는 부분은 src/lib/news/filter-dom.ts, 첫 페인트 전 인라인 스크립트는 src/lib/news/filter-boot.ts.
 *
 * 필터 4종(FR-32) — 모두 AND로 겹친다.
 * | 필터 | 쿼리 | 값 | 고르는 곳 |
 * |------|------|----|-----------|
 * | 대회 | `comp` | 대회 ID 소문자(`epl`·`laliga`·`seriea`·`bundesliga`·`ligue1`·`ucl` — `/competitions/epl`과 같은 표기) | 1024 이상 목차(하나만, 다시 누르면 해제). 1023 이하는 진입점 없음 — 주소로만(DECISIONS #11) |
 * | 분류 | `cat` | 분류 ID(`result`·`transfer`·`injury`·`club`·`national`·`ucl`·`other` — FR-31) | 목차 분류 행·375 분류 칩(하나만 — "전체"가 기본, 눌린 칩을 다시 누르면 전체) |
 * | 팀 | `team` | 팀 slug(`names.ko.json`) — 그 호 카드에 태그로 실린 팀만 | 진입 UI 없음 — 주소로만(M2 팀 화면이 링크할 자리) |
 * | 한국 선수 | `kr` | `1` | 목차 "한국 선수 관련만"·375 "한국 선수만" 칩(켬·끔) |
 *
 * - 잘못된 값(모르는 대회·분류, 그 호에 없는 팀, `kr=1` 밖의 값)은 그 필터만 무시한다. 대소문자는 가리지 않고 읽고, 쓸 때는 위 표기로 쓴다.
 * - 쓰는 순서는 comp → cat → team → kr(PRD 예시 `?comp=epl&cat=transfer`). 필터가 아닌 쿼리(utm 등)와 `#앵커`는 그대로 둔다.
 * - 건수는 빌드 때 그 호 카드 전체로 센다(다른 필터와 겹친 건수가 아니다 — 시안 그대로). 0건인 항목은 비활성(눌린 상태면 끌 수 있게 활성).
 */
import type { Category, CompId } from "@/lib/schema/common";

import { CATEGORY_LABEL } from "./labels";

/** 주소 쿼리 이름 — 필터 4종 */
export const FILTER_PARAMS = ["comp", "cat", "team", "kr"] as const;
export type FilterParam = (typeof FILTER_PARAMS)[number];

/** 분류 순서(FR-31 — 칩·목차 순서) */
export const FILTER_CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];

/** 피드 부제 기본 설명(필터 없음 — 파일 순서 = 중요도 순) */
export const FILTER_DESC_DEFAULT = "중요도 순";
/** 한국 선수 필터 설명 */
export const FILTER_DESC_KOREAN = "한국 선수 관련";

export interface NewsFilterState {
  /** 대회(null = 전체) */
  comp: CompId | null;
  /** 분류(null = 전체) */
  cat: Category | null;
  /** 팀 slug(null = 전체) */
  team: string | null;
  /** 한국 선수 관련만 */
  kr: boolean;
}

export const EMPTY_FILTER: NewsFilterState = Object.freeze({
  comp: null,
  cat: null,
  team: null,
  kr: false,
});

/**
 * 필터 설정 — 고를 수 있는 값과 표시 이름. 서버가 만들어 페이지에 JSON으로 싣고(`<script type="application/json">`),
 * 부트 스크립트와 섬이 같은 값을 읽는다. 키를 짧게 둔다(HTML·RSC 페이로드에 두 번 실린다).
 */
export interface NewsFilterConfig {
  /** 대회 ID → { s: 약칭, n: 정식 이름 } — 설정 순서 */
  comps: Partial<Record<CompId, { s: string; n: string }>>;
  /** 분류 ID → 라벨 */
  cats: Record<Category, string>;
  /** 팀 slug → 한글 표기 — 그 호 카드에 태그로 실린 팀만 */
  teams: Record<string, string>;
  /** 필터 없음 설명("중요도 순") */
  d: string;
  /** 한국 선수 필터 설명("한국 선수 관련") */
  k: string;
}

function has(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** 주소 쿼리 → 필터 상태. 잘못된 값은 그 필터만 무시한다(머리 주석) */
export function parseFilterQuery(
  search: string | URLSearchParams,
  config: Pick<NewsFilterConfig, "comps" | "cats" | "teams">,
): NewsFilterState {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  const comp = (q.get("comp") ?? "").toUpperCase();
  const cat = (q.get("cat") ?? "").toLowerCase();
  const team = (q.get("team") ?? "").toLowerCase();
  return {
    comp: has(config.comps, comp) ? (comp as CompId) : null,
    cat: has(config.cats, cat) ? (cat as Category) : null,
    team: has(config.teams, team) ? team : null,
    kr: q.get("kr") === "1",
  };
}

/** 필터 상태 → 쿼리 쌍(comp → cat → team → kr 순서, 켜진 것만) */
export function filterQueryPairs(
  state: NewsFilterState,
): Array<[FilterParam, string]> {
  const out: Array<[FilterParam, string]> = [];
  if (state.comp) out.push(["comp", state.comp.toLowerCase()]);
  if (state.cat) out.push(["cat", state.cat]);
  if (state.team) out.push(["team", state.team]);
  if (state.kr) out.push(["kr", "1"]);
  return out;
}

/**
 * 지금 주소(`search`)에 필터 상태를 쓴 새 쿼리 문자열("?…" 또는 ""). 필터가 아닌 쿼리는 앞에 그대로 두고 필터 4종은 지운 뒤
 * 정해진 순서로 다시 붙인다.
 */
export function withFilterQuery(
  search: string,
  state: NewsFilterState,
): string {
  const q = new URLSearchParams(search);
  for (const name of FILTER_PARAMS) q.delete(name);
  for (const [name, value] of filterQueryPairs(state)) q.append(name, value);
  const text = q.toString();
  return text ? `?${text}` : "";
}

export function isFilterActive(state: NewsFilterState): boolean {
  return (
    state.comp !== null || state.cat !== null || state.team !== null || state.kr
  );
}

/** 상태 비교용 키(같으면 다시 그리지 않는다) */
export function filterKey(state: NewsFilterState): string {
  return filterQueryPairs(state)
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
}

/** 필터가 보는 카드 값 — 화면은 `<li data-nf-*>`에 같은 값을 싣는다 */
export interface FilterableCard {
  cat: Category;
  comps: readonly string[];
  teams: readonly string[];
  kr: boolean;
}

/** 카드가 필터를 모두 만족하는가(AND) */
export function cardMatchesFilter(
  card: FilterableCard,
  state: NewsFilterState,
): boolean {
  return (
    (state.cat === null || card.cat === state.cat) &&
    (state.comp === null || card.comps.includes(state.comp)) &&
    (state.team === null || card.teams.includes(state.team)) &&
    (!state.kr || card.kr)
  );
}

/** 피드 부제 설명 조각 — 대회 이름 · 팀 · 분류 · 한국 선수 관련(시안 순서에 팀을 대회 뒤에). 필터가 없으면 [] */
export function filterDescriptionParts(
  state: NewsFilterState,
  config: NewsFilterConfig,
): string[] {
  const parts: string[] = [];
  const comp = state.comp ? config.comps[state.comp] : undefined;
  if (comp) parts.push(comp.n);
  if (state.team && has(config.teams, state.team))
    parts.push(config.teams[state.team] as string);
  if (state.cat) parts.push(config.cats[state.cat]);
  if (state.kr) parts.push(config.k);
  return parts;
}

/** 피드 부제 설명("프리미어리그 · 이적" 또는 "중요도 순") */
export function filterDescription(
  state: NewsFilterState,
  config: NewsFilterConfig,
): string {
  const parts = filterDescriptionParts(state, config);
  return parts.length > 0 ? parts.join(" · ") : config.d;
}

/** 결과 알림 문장(섬이 `aria-live`에 쓴다) — "프리미어리그 · 이적 4건" · 필터가 없으면 "전체 23건" */
export function filterAnnouncement(
  state: NewsFilterState,
  config: NewsFilterConfig,
  count: number,
): string {
  const parts = filterDescriptionParts(state, config);
  return parts.length > 0
    ? `${parts.join(" · ")} ${count}건`
    : `전체 ${count}건`;
}

/** 필터 조작 */
export type FilterAction =
  | { type: "cat"; value: Category | null }
  | { type: "comp"; value: CompId }
  | { type: "kr" }
  | { type: "clear-comp" }
  | { type: "clear-team" }
  | { type: "reset" };

/**
 * 조작 → 다음 상태. 분류: 고른 분류(눌린 분류를 다시 누르면 전체, "전체"는 전체) · 대회: 고른 대회(눌린 대회를 다시 누르면 해제 — 시안) ·
 * 한국 선수: 켬·끔 · 해제: 그 필터만 · 필터 해제(0건 빈 상태): 모두
 */
export function nextFilterState(
  state: NewsFilterState,
  action: FilterAction,
): NewsFilterState {
  switch (action.type) {
    case "cat":
      return {
        ...state,
        cat:
          action.value === null || action.value === state.cat
            ? null
            : action.value,
      };
    case "comp":
      return {
        ...state,
        comp: action.value === state.comp ? null : action.value,
      };
    case "kr":
      return { ...state, kr: !state.kr };
    case "clear-comp":
      return { ...state, comp: null };
    case "clear-team":
      return { ...state, team: null };
    case "reset":
      return EMPTY_FILTER;
  }
}

// ─── 목차·칩 화면 모델(빌드 때) ─────────────────────────────────────────────

/** 필터가 보는 카드 원본 값 — 뉴스 카드(`NewsCard`)의 일부 */
export interface FilterSourceCard {
  cat: Category;
  comp: readonly CompId[];
  teams: readonly string[];
  kr: boolean;
}

export interface FilterOptionView<T extends string> {
  id: T;
  label: string;
  count: number;
}

export interface CompetitionOptionView extends FilterOptionView<CompId> {
  short: string;
}

/** 목차(1024 이상)·칩 줄(1023 이하)이 그리는 값 — 건수는 그 호 카드 전체 기준 */
export interface NewsFilterView {
  /** 전체 카드 수("전체" 행·칩) */
  total: number;
  /** 대회 행(설정 순서) */
  comps: CompetitionOptionView[];
  /** 분류 행·칩(FR-31 순서) */
  cats: Array<FilterOptionView<Category>>;
  /** 한국 선수 관련 카드 수 */
  kr: number;
  /** 부트 스크립트·섬 설정 */
  config: NewsFilterConfig;
}

export interface FilterLabels {
  /** 대회(설정 순서) */
  competitions: ReadonlyArray<{ id: CompId; short: string; name: string }>;
  /** 팀 slug → 한글 표기(사전에 없으면 null — 그 팀은 필터 값이 아니다) */
  team(slug: string): string | null;
}

/** 직렬화 키로 쓸 수 없는 slug(객체 원형 이름) — 사전 slug 규칙상 나오지 않지만 설정 JSON을 지킨다 */
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** 그 호 카드 → 목차·칩 건수와 필터 설정(순수 함수) */
export function buildFilterView(
  cards: readonly FilterSourceCard[],
  labels: FilterLabels,
): NewsFilterView {
  const comps: NewsFilterConfig["comps"] = {};
  for (const c of labels.competitions) comps[c.id] = { s: c.short, n: c.name };
  const teams: Record<string, string> = {};
  for (const card of cards) {
    for (const slug of card.teams) {
      if (has(teams, slug) || RESERVED_KEYS.has(slug)) continue;
      const label = labels.team(slug);
      if (label !== null) teams[slug] = label;
    }
  }
  const countWhere = (pred: (card: FilterSourceCard) => boolean) =>
    cards.reduce((n, card) => n + (pred(card) ? 1 : 0), 0);
  return {
    total: cards.length,
    comps: labels.competitions.map((c) => ({
      id: c.id,
      short: c.short,
      label: c.name,
      count: countWhere((card) => card.comp.includes(c.id)),
    })),
    cats: FILTER_CATEGORIES.map((id) => ({
      id,
      label: CATEGORY_LABEL[id],
      count: countWhere((card) => card.cat === id),
    })),
    kr: countWhere((card) => card.kr),
    config: {
      comps,
      cats: { ...CATEGORY_LABEL },
      teams,
      d: FILTER_DESC_DEFAULT,
      k: FILTER_DESC_KOREAN,
    },
  };
}
