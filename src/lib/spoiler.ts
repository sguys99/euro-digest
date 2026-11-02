/**
 * 결과 가리기 — 마크업 계약 · 가림 대상 판정 · 펼치기(이벤트 위임) (PRD FR-37 · §15 D3 · D24 · D64 ④ · D67 ④, DECISIONS 'M4 미니 게이트'
 * #1~#7, DESIGN §2.9 · §6.2 · §8 · §9.3 '결과 가림(줄·카드)' · '결과 가림 칸' · '결과 가림 — 순위표 · 경기 행 · 폼', plan M4-15)
 *
 * 켜고 끄기는 `<html data-spoiler="on">` 하나다(초기 스크립트가 첫 페인트 전에 `ed-spoiler`로 단다 — src/lib/theme.ts). 가림 자체는 CSS가 한다
 * (globals.css §13) — JS가 없거나 하이드레이션 전에도 깜빡임·레이아웃 이동 없이 가려져 있다. JS는 스위치와 '보기' 펼치기 위임 하나뿐이다.
 *
 * 마크업 계약(서버 컴포넌트가 단다 — 블러·투명도 없이 `display: none`이라 보조기술에서도 숨는다):
 * | 속성 | 뜻 |
 * |------|----|
 * | `data-slot="result-value"` · `data-spoil-value` | 가릴 값. 켜지면 숨는다 — 단 펼친 단위(`data-spoil-open`) 안이면 보인다 |
 * | `data-spoil-mask` | 가림 표식(띠 · 결과 가림 칸 · 빗금 자리 · 안내 띠). 켜졌고 펼치지 않았을 때만 보인다 |
 * | `data-spoil="stamp"·"tear"` | 펼치는 단위(칸 하나 · 줄 하나 · 카드 하나 · 표 하나). 값이 드러날 때 모션 — 찍힘(fast) · 뜯김(base) |
 * | `data-spoil-open` | 펼친 단위(위임 섬이 단다). 그 안의 값은 모두 보이고 표식은 모두 숨는다 — 단위가 겹치면 바깥을 펴면 안쪽도 펴진다 |
 * | `data-spoil-reveal` | '보기' 버튼 — 가장 가까운 단위를 편다 |
 * | `data-spoil-focus` | 펼친 뒤 포커스를 받을 요소(없으면 단위 안 첫 값 — 그 안의 링크·버튼, 없으면 값 자체에 `tabindex=-1`) |
 *
 * 스위치를 끄면(또 켜면) 펼친 표시를 모두 지운다 — 다시 켜면 처음처럼 다 가린다(DESIGN §9.3 '스위치를 끄면 모두 원래대로').
 * 이 파일은 zod·React 없이 DOM 표준만 쓴다(섬 번들 — 스위치 섬이 import한다).
 */
import type { SafeStorage } from "@/lib/safe-storage";
import {
  SPOILER_ATTRIBUTE,
  SPOILER_ON,
  SPOILER_STORAGE_KEY,
} from "@/lib/theme";

/** 펼치는 단위 속성 — 값은 드러날 때의 모션(찍힘 · 뜯김) */
export const SPOIL_SCOPE = "data-spoil";
/** 펼친 단위 */
export const SPOIL_OPEN = "data-spoil-open";
/** 가림 표식 */
export const SPOIL_MASK = "data-spoil-mask";
/** '보기' 버튼 */
export const SPOIL_REVEAL = "data-spoil-reveal";
/** 펼친 뒤 포커스 대상 */
export const SPOIL_FOCUS = "data-spoil-focus";
/** 가릴 값(`data-slot="result-value"`를 달 수 없는 요소 — 5줄 문장 · 카드 제목) */
export const SPOIL_VALUE = "data-spoil-value";

/** 가릴 값 선택자 — 선수 기록과 같은 `result-value` 묶음(DECISIONS M4 #7) + 줄·카드 본문 */
export const SPOIL_VALUE_SELECTOR = `[data-slot="result-value"],[${SPOIL_VALUE}]`;

/** 단위가 드러날 때의 모션 — 칸(값 하나)은 찍힘 fast, 줄·카드(본문)는 뜯김 base(DESIGN §6.2) */
export type SpoilMotion = "stamp" | "tear";

/** 스위치 전환 안내 토스트(DESIGN §9.2 Toast — D0 혼합안 문구) */
export const SPOILER_TOAST = {
  on: "결과 가리기를 켰어요. 결과가 담긴 줄과 카드를 접었어요.",
  off: "결과 가리기를 껐어요.",
} as const;

export function spoilerToastMessage(on: boolean): string {
  return on ? SPOILER_TOAST.on : SPOILER_TOAST.off;
}

// ─── 가림 대상 판정 ──────────────────────────────────────────────────────────

/**
 * 근거 id 접두 중 결과를 담는 것 — `m` 경기(스코어 · 득점자) · `s` 순위표(밤사이 순위 변동 — FR-37 '순위표 변동') · `k` 한국 선수
 * (그 경기의 골 · 도움 · 결과 — D64 ④). 브리핑 입력은 전날 경기 결과·순위 변동·한국 선수 출전뿐이라(D24) 지금 접두는 모두 결과다.
 * 모르는 새 접두(없음 — 스키마는 접두 목록을 고정하지 않는다)는 결과로 보지 않는다.
 */
const RESULT_REF_PREFIXES = ["m", "s", "k"] as const;

/**
 * '오늘의 5줄'의 경기 결과 줄인가(FR-37). 근거(`refs`) 중 하나라도 결과 접두면 결과 줄이다. 근거를 모르는 입력(화면 모델에 refs가 없는
 * 옛 호출)은 가리는 쪽으로 판정한다 — 새는 것보다 한 번 더 누르는 편이 낫다.
 */
export function isBriefResultLine(
  refs: readonly string[] | undefined,
): boolean {
  if (refs === undefined) return true;
  return refs.some((ref) =>
    RESULT_REF_PREFIXES.some((prefix) => ref.startsWith(prefix)),
  );
}

/** 5줄 블록의 가림 요약 — 줄마다 결과 여부 + 모든 줄이 결과면 안내 띠('모두 보기') */
export function briefSpoilerPlan(
  lines: ReadonlyArray<{ refs?: readonly string[] }>,
): { results: boolean[]; all: boolean } {
  const results = lines.map((line) => isBriefResultLine(line.refs));
  return {
    results,
    all: results.length > 0 && results.every(Boolean),
  };
}

// ─── 켜고 끄기 ───────────────────────────────────────────────────────────────

/** `<html>`에서 쓰는 부분 */
export interface SpoilerRoot {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/** 펼친 표시를 지울 범위(`document`) */
export interface SpoilerTree {
  querySelectorAll(
    selectors: string,
  ): ArrayLike<{ removeAttribute(name: string): void }>;
}

/** 지금 켜져 있는가 */
export function spoilerOn(root: Pick<SpoilerRoot, "getAttribute">): boolean {
  return root.getAttribute(SPOILER_ATTRIBUTE) === SPOILER_ON;
}

/** 펼친 표시를 모두 지운다(스위치를 끄거나 켤 때) */
export function resetRevealed(tree: SpoilerTree): void {
  const opened = tree.querySelectorAll(`[${SPOIL_OPEN}]`);
  for (let i = 0; i < opened.length; i++)
    opened[i]!.removeAttribute(SPOIL_OPEN);
}

/**
 * 켬/끔 적용 — 속성은 늘 바꾸고(이번 방문에는 반드시 적용), 저장은 안전한 저장소(`ed-spoiler` = `on`, 끄면 지움). 펼친 표시는 지운다.
 * @returns 저장소에 남았으면 true(메모리에만 남았으면 false — 새로 고치면 사라짐)
 */
export function setSpoiler(
  root: SpoilerRoot,
  tree: SpoilerTree,
  storage: SafeStorage,
  on: boolean,
): boolean {
  if (on) root.setAttribute(SPOILER_ATTRIBUTE, SPOILER_ON);
  else root.removeAttribute(SPOILER_ATTRIBUTE);
  resetRevealed(tree);
  return on
    ? storage.set(SPOILER_STORAGE_KEY, SPOILER_ON)
    : storage.remove(SPOILER_STORAGE_KEY);
}

// ─── 펼치기 ──────────────────────────────────────────────────────────────────

const FOCUSABLE = "a[href],button:not([disabled]),[tabindex]";

/**
 * 펼친 뒤 포커스 대상 — `data-spoil-focus`가 있으면 그 요소 그대로(5줄 문장 · 표), 없으면 첫 값(값 안에 링크·버튼이 있으면 그것 —
 * 카드 제목 링크)
 */
export function revealFocusTarget(scope: Element): HTMLElement | null {
  const marked = scope.querySelector<HTMLElement>(`[${SPOIL_FOCUS}]`);
  if (marked) return marked;
  const value = scope.querySelector<HTMLElement>(SPOIL_VALUE_SELECTOR);
  if (!value) return null;
  if (value.matches(FOCUSABLE)) return value;
  return (
    value.querySelector<HTMLElement>("a[href],button:not([disabled])") ?? value
  );
}

/**
 * 단위 하나를 편다 — `data-spoil-open`을 달고(값이 다시 그려지며 CSS 모션이 한 번 돈다 — reduced-motion이면 0) 드러난 값으로 포커스를
 * 옮긴다(DESIGN §9.3). 포커스를 받을 수 없는 값에는 `tabindex=-1`을 단다.
 */
export function revealScope(scope: Element, focus = true): void {
  scope.setAttribute(SPOIL_OPEN, "");
  if (!focus) return;
  const target = revealFocusTarget(scope);
  if (!target) return;
  if (!target.matches(FOCUSABLE)) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

/**
 * 문서 수준 클릭 위임 — '보기'(`data-spoil-reveal`)를 누르면 가장 가까운 단위를 편다. 처리했으면 true.
 * 가림이 꺼져 있으면 버튼이 보이지 않으므로 누를 수 없다(그래도 들어오면 무시).
 */
export function handleSpoilerClick(event: Pick<Event, "target">): boolean {
  const target = event.target;
  if (!target || !(target as Element).closest) return false;
  const button = (target as Element).closest(`[${SPOIL_REVEAL}]`);
  if (!button) return false;
  const root = button.ownerDocument?.documentElement;
  if (root && !spoilerOn(root)) return false;
  const scope = button.closest(`[${SPOIL_SCOPE}]`);
  if (!scope) return false;
  revealScope(scope);
  return true;
}
