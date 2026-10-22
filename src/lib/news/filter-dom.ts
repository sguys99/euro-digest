/**
 * 뉴스 필터 — DOM 약속과 그리기 (PRD FR-31·FR-32, DESIGN.md §6.2 찍힘·색 면 · §9.2 · §9.3 연결 줄·상태 화면 ②, plan M1-33)
 *
 * 필터 화면은 서버 컴포넌트가 그린 정적 HTML이다(목차·칩·피드 머리·카드). 필터 상태는 그 DOM의 속성·글자만 바꿔 그린다 —
 * 첫 페인트 전에는 인라인 부트 스크립트(src/lib/news/filter-boot.ts — 이 파일과 같은 규칙의 ES5 문자열, 단위 테스트가 결과를 대조)가,
 * 하이드레이션 뒤에는 필터 섬(src/components/news/filter-island.tsx)이 이 파일의 `applyFilterToDom`으로 그린다.
 * React가 그 자리를 다시 그리지 않도록 바꾸는 요소에는 `suppressHydrationWarning`을 단다(속성·글자를 하이드레이션 전에 바꾼다).
 *
 * DOM 약속(`NF` — 서버 컴포넌트·부트 스크립트·섬·테스트가 같은 이름을 쓴다)
 * | 속성 | 요소 | 뜻 |
 * |------|------|----|
 * | `data-nf-scope` | 목차 묶음 · 뉴스 섹션 | 필터가 그리는 범위 — 쿼리로 들어온 첫 화면에서 부트가 끝날 때까지 그리지 않는다(`<html data-nf-pending>`) |
 * | `data-nf-key` + `data-nf-value` | 칩·목차 행 `<button>` | `cat`(값 `all`·분류 ID) · `comp`(대회 ID) · `kr`(값 `1`) → `aria-pressed` |
 * | `data-nf-zero` | 0건 칩·행 | 눌리지 않았으면 `disabled`(눌린 채 들어오면 끌 수 있게 활성) |
 * | `data-nf-card` + `data-nf-cat`·`data-nf-comps`·`data-nf-teams`·`data-nf-kr` | 카드 `<li>` | 술어 입력(대회·팀은 공백 구분) → 맞지 않으면 `hidden` |
 * | `data-nf-lead` | 머리기사 `<article>` | 필터가 없을 때만 `data-lead`(머리기사 모양 — 필터 결과에는 없음, DECISIONS #13) |
 * | `data-nf-link` | 연결 줄 `<a href="#짝">` | 짝 카드가 숨으면 줄도 `hidden` + 카드 `data-paired` 끔(아래 여백이 돌아온다) |
 * | `data-nf-head` | 피드 머리 | `data-comp="{대회 ID}"`(색 면) · `data-team`(팀 상자) |
 * | `data-nf-comp-badge` · `data-nf-team-badge` | 머리 상자 | 약칭 · 팀 한글 표기 |
 * | `data-nf-count` · `data-nf-desc` | 피드 부제 | 결과 건수 · 설명("프리미어리그 · 이적" / "중요도 순") |
 * | `data-nf-empty` | 0건 빈 상태 | 결과가 0건일 때만 보인다 |
 * | `data-nf-clear`(`comp`·`team`) · `data-nf-reset` | 해제 버튼 · 필터 해제 | 섬이 듣는다 |
 * | `data-nf-chips` | 375 분류 칩 줄 | 눌린 칩이 가로 스크롤 밖이면 보이게 민다 |
 * | `data-nf-in` | 카드 `<li>` | 섬이 잠깐 단다 — 필터 결과 진입 찍힘(fast) |
 *
 * DOM 타입만 쓴다(fs·zod 없음) — 섬 번들에 들어간다.
 */
import type { Category } from "@/lib/schema/common";

import {
  cardMatchesFilter,
  filterDescription,
  isFilterActive,
  type NewsFilterConfig,
  type NewsFilterState,
} from "./filter";

export const NF = {
  scope: "data-nf-scope",
  pending: "data-nf-pending",
  key: "data-nf-key",
  value: "data-nf-value",
  zero: "data-nf-zero",
  card: "data-nf-card",
  cat: "data-nf-cat",
  comps: "data-nf-comps",
  teams: "data-nf-teams",
  kr: "data-nf-kr",
  lead: "data-nf-lead",
  link: "data-nf-link",
  head: "data-nf-head",
  compBadge: "data-nf-comp-badge",
  teamBadge: "data-nf-team-badge",
  count: "data-nf-count",
  desc: "data-nf-desc",
  empty: "data-nf-empty",
  clear: "data-nf-clear",
  reset: "data-nf-reset",
  chips: "data-nf-chips",
  live: "data-nf-live",
  enter: "data-nf-in",
} as const;

/** 필터 설정 JSON 요소 id(`<script type="application/json">`) — 페이지에 하나 */
export const FILTER_CONFIG_ID = "news-filter-config";

/** "전체" 분류 값(`data-nf-value`) */
export const ALL_CATEGORIES = "all";

/** 칩·목차 행의 값 — `data-nf-value` */
export function controlValue(
  key: "cat" | "comp" | "kr",
  value: Category | string | null,
): string {
  if (key === "kr") return "1";
  return value ?? ALL_CATEGORIES;
}

/** 페이지의 필터 설정(서버가 실은 JSON). 없거나 깨졌으면 null */
export function readFilterConfig(doc: Document): NewsFilterConfig | null {
  const el = doc.getElementById(FILTER_CONFIG_ID);
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as NewsFilterConfig;
  } catch {
    return null;
  }
}

function setFlag(el: Element, name: string, on: boolean): void {
  if (el.hasAttribute(name) !== on) el.toggleAttribute(name, on);
}

function setHidden(el: HTMLElement, hidden: boolean): void {
  if (el.hidden !== hidden) el.hidden = hidden;
}

function setText(el: Element | null, text: string): void {
  if (el && el.textContent !== text) el.textContent = text;
}

function words(el: Element, name: string): string[] {
  return (el.getAttribute(name) ?? "").split(" ").filter(Boolean);
}

/** 카드 `<li>`의 술어 입력 */
function cardOf(li: Element) {
  return {
    cat: li.getAttribute(NF.cat) as Category,
    comps: words(li, NF.comps),
    teams: words(li, NF.teams),
    kr: li.hasAttribute(NF.kr),
  };
}

/** 요소를 품은 카드 `<li>`가 숨었는가(카드 밖이면 false) */
function inHiddenCard(el: Element): boolean {
  const li = el.closest(`[${NF.card}]`);
  return li instanceof HTMLElement && li.hidden === true;
}

/**
 * 필터 상태를 문서에 그린다 — 카드 숨김 · 연결 줄 · 머리기사 · 칩·행 눌림 · 피드 머리 · 부제 · 빈 상태. 보이는 카드 수를 돌려준다.
 * 같은 상태로 다시 불러도 결과가 같다(멱등). 모션·알림·포커스는 섬이 따로 맡는다.
 */
export function applyFilterToDom(
  doc: Document,
  state: NewsFilterState,
  config: NewsFilterConfig,
): number {
  const active = isFilterActive(state);
  let count = 0;
  for (const li of doc.querySelectorAll<HTMLElement>(`[${NF.card}]`)) {
    const ok = cardMatchesFilter(cardOf(li), state);
    setHidden(li, !ok);
    if (ok) count++;
  }
  for (const link of doc.querySelectorAll<HTMLElement>(`[${NF.link}]`)) {
    const target = doc.getElementById(
      (link.getAttribute("href") ?? "").slice(1),
    );
    const hide = !target || inHiddenCard(target);
    setHidden(link, hide);
    const article = link.closest("article");
    if (article) setFlag(article, "data-paired", !hide);
  }
  for (const article of doc.querySelectorAll(`[${NF.lead}]`)) {
    setFlag(article, "data-lead", !active);
  }
  for (const button of doc.querySelectorAll<HTMLButtonElement>(`[${NF.key}]`)) {
    const key = button.getAttribute(NF.key);
    const value = button.getAttribute(NF.value);
    const pressed =
      key === "cat"
        ? value === (state.cat ?? ALL_CATEGORIES)
        : key === "comp"
          ? value === state.comp
          : key === "kr" && state.kr;
    const text = pressed ? "true" : "false";
    if (button.getAttribute("aria-pressed") !== text)
      button.setAttribute("aria-pressed", text);
    if (button.hasAttribute(NF.zero) && button.disabled === pressed)
      button.disabled = !pressed;
  }
  const head = doc.querySelector(`[${NF.head}]`);
  if (head) {
    if (state.comp) {
      if (head.getAttribute("data-comp") !== state.comp)
        head.setAttribute("data-comp", state.comp);
    } else if (head.hasAttribute("data-comp")) {
      head.removeAttribute("data-comp");
    }
    setFlag(head, "data-team", state.team !== null);
  }
  const comp = state.comp ? config.comps[state.comp] : undefined;
  setText(doc.querySelector(`[${NF.compBadge}]`), comp ? comp.s : "");
  setText(
    doc.querySelector(`[${NF.teamBadge}]`),
    state.team ? (config.teams[state.team] ?? "") : "",
  );
  setText(doc.querySelector(`[${NF.count}]`), String(count));
  setText(doc.querySelector(`[${NF.desc}]`), filterDescription(state, config));
  const empty = doc.querySelector<HTMLElement>(`[${NF.empty}]`);
  if (empty) setHidden(empty, count !== 0);
  return count;
}

/** 칩 줄에서 보이게 할 칩 — 눌린 칩 중 "전체"가 아닌 첫 칩(분류가 먼저, 다음 한국 선수만). "전체"는 줄 맨 앞이라 늘 보인다 */
export const REVEAL_CHIP_SELECTOR = `[aria-pressed="true"]:not([${NF.value}="${ALL_CATEGORIES}"])`;

/**
 * 375 칩 줄에서 눌린 칩이 가로 스크롤 밖이면 칩 줄만 밀어 보이게 한다(페이지는 움직이지 않는다 — 쿼리로 들어온 첫 화면·주소 이동).
 * 칩 줄이 없거나(1024 이상 — `display: none`이라 폭 0) 이미 보이면 그대로.
 */
export function revealPressedChip(doc: Document): void {
  const row = doc.querySelector<HTMLElement>(`[${NF.chips}]`);
  if (!row || row.clientWidth === 0) return;
  const chip = row.querySelector<HTMLElement>(REVEAL_CHIP_SELECTOR);
  if (!chip) return;
  // 칩 줄 좌우 안쪽 여백(--edge)만큼 띄워 화면 가장자리에 붙지 않게
  const pad = parseFloat(getComputedStyle(row).paddingLeft) || 0;
  const r = row.getBoundingClientRect();
  const c = chip.getBoundingClientRect();
  if (c.left < r.left + pad) row.scrollLeft -= r.left + pad - c.left;
  else if (c.right > r.right - pad) row.scrollLeft += c.right - (r.right - pad);
}
