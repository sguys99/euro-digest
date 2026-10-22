"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";

import {
  EMPTY_FILTER,
  filterAnnouncement,
  filterKey,
  nextFilterState,
  parseFilterQuery,
  withFilterQuery,
  type FilterAction,
  type NewsFilterState,
} from "@/lib/news/filter";
import {
  ALL_CATEGORIES,
  applyFilterToDom,
  NF,
  readFilterConfig,
  revealPressedChip,
} from "@/lib/news/filter-dom";
import type { Category, CompId } from "@/lib/schema/common";

/**
 * 뉴스 필터 섬 — 페이지에 하나(홈·`/news/`). 렌더 결과는 없고, 서버가 그린 목차·칩·피드 머리·카드의 속성만 바꾼다(plan M1-33,
 * DOM 약속은 src/lib/news/filter-dom.ts). 상대 시간·'+N곳'은 피드 섬(`FeedIsland`)이 따로 맡는다.
 *
 * - **주소 → 상태**(`useSearchParams`): 첫 마운트와 주소 이동(같은 페이지 링크·뒤로 가기)마다 쿼리를 읽어 그린다. 모션·알림 없음 —
 *   첫 화면은 부트 스크립트가 이미 같은 결과를 그렸다(DESIGN §6.2 첫 로드 모션 없음). 보류 표시(`<html data-nf-pending>`)도 지운다.
 * - **클릭 → 상태 → 주소**: 칩·목차 행·해제·필터 해제(위임 리스너 하나) → 다음 상태를 그리고 `history.replaceState`(페이지 이동·
 *   기록 추가 없음 — Next 라우터가 같은 주소를 `useSearchParams`로 돌려주면 같은 상태라 다시 그리지 않는다).
 *   남은 카드는 찍힘(fast — 필터 결과 진입, 모션 줄이기면 건너뜀), 결과는 `aria-live`로 알린다("이적 4건").
 *   누른 버튼이 사라지거나 비활성이 되면(해제·필터 해제·눌린 채 들어온 0건 항목 끄기) 보이는 눌린 분류 칩·행으로 포커스를 옮기고, 목록 머리가 화면 위로 지나가 있었으면 피드 머리로 올린다.
 *
 * `cn`을 쓰지 않는다(섬 번들 — DESIGN §9.4). import하는 모듈에 fs·zod가 없다(src/lib/news 순수 모듈).
 */

const ACTIONABLE = `[${NF.key}],[${NF.clear}],[${NF.reset}]`;

/** 누른 버튼 → 필터 조작 */
export function filterActionOf(button: Element): FilterAction | null {
  if (button.hasAttribute(NF.reset)) return { type: "reset" };
  const clear = button.getAttribute(NF.clear);
  if (clear === "comp") return { type: "clear-comp" };
  if (clear === "team") return { type: "clear-team" };
  const value = button.getAttribute(NF.value);
  switch (button.getAttribute(NF.key)) {
    case "cat":
      return {
        type: "cat",
        value: value === ALL_CATEGORIES ? null : (value as Category),
      };
    case "comp":
      return value ? { type: "comp", value: value as CompId } : null;
    case "kr":
      return { type: "kr" };
    default:
      return null;
  }
}

function isVisible(el: Element): boolean {
  return el.getClientRects().length > 0;
}

/** 남은 카드에 찍힘을 다시 건다(속성을 지웠다가 한 번의 리플로 뒤 다시 단다) */
function stampVisibleCards(doc: Document): void {
  const cards = [
    ...doc.querySelectorAll<HTMLElement>(`[${NF.card}]:not([hidden])`),
  ];
  for (const li of cards) li.removeAttribute(NF.enter);
  void doc.body.offsetWidth;
  for (const li of cards) li.setAttribute(NF.enter, "");
}

export function NewsFilterIsland() {
  // App Router 밖(단위 테스트 렌더)에서는 null — 필터 없음으로 본다
  const params = useSearchParams() as ReturnType<typeof useSearchParams> | null;
  const search = params ? params.toString() : "";
  const stateRef = useRef<NewsFilterState>(EMPTY_FILTER);
  /** 마지막으로 그린 상태 키(null = 아직 그리지 않음) */
  const drawnRef = useRef<string | null>(null);

  // 주소 → 상태(첫 마운트·주소 이동) — 페인트 전에
  useLayoutEffect(() => {
    document.documentElement.removeAttribute(NF.pending);
    const config = readFilterConfig(document);
    if (!config) return;
    const state = parseFilterQuery(search, config);
    stateRef.current = state;
    const key = filterKey(state);
    if (key === drawnRef.current) return;
    drawnRef.current = key;
    applyFilterToDom(document, state, config);
    revealPressedChip(document);
  }, [search]);

  // 클릭 → 상태 → 주소
  useEffect(() => {
    const config = readFilterConfig(document);
    if (!config) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    const commit = (next: NewsFilterState, origin: HTMLElement) => {
      stateRef.current = next;
      const key = filterKey(next);
      if (key === drawnRef.current) return;
      drawnRef.current = key;
      const count = applyFilterToDom(document, next, config);
      if (!reduce.matches) stampVisibleCards(document);
      const live = document.querySelector(`[${NF.live}]`);
      if (live) live.textContent = filterAnnouncement(next, config, count);
      // 누른 버튼이 사라졌거나(해제·필터 해제) 비활성이 됐으면(주소로 눌린 채 들어온 0건 항목을 끈 경우 — 포커스가 body로 떨어진다)
      // 보이는 눌린 분류 칩·행으로
      if (
        !isVisible(origin) ||
        (origin instanceof HTMLButtonElement && origin.disabled)
      ) {
        const fallback = [
          ...document.querySelectorAll<HTMLElement>(
            `[${NF.key}="cat"][aria-pressed="true"]`,
          ),
        ].find(isVisible);
        fallback?.focus();
      }
      // 목록 머리가 화면 위로 지나가 있었으면(1024 이상 sticky 목차로 깊은 곳에서 거른 경우) 결과 첫 카드부터 보이게 피드 머리로
      const list = document.querySelector(`[${NF.card}]`)?.parentElement;
      const head = document.querySelector(`[${NF.head}]`);
      if (list && head && list.getBoundingClientRect().top < 0)
        head.scrollIntoView({ block: "start" });
      try {
        window.history.replaceState(
          null,
          "",
          `${location.pathname}${withFilterQuery(location.search, next)}${location.hash}`,
        );
      } catch {
        // 주소를 못 바꿔도 화면은 이미 걸렀다(공유·새로고침만 못 한다)
      }
    };

    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLElement>(ACTIONABLE);
      if (!button?.closest(`[${NF.scope}]`)) return;
      const action = filterActionOf(button);
      if (action) commit(nextFilterState(stateRef.current, action), button);
    };
    // 찍힘이 끝나면 속성을 지운다 — 채움(both)이 남으면 카드마다 쌓임 맥락이 생겨 카드 메뉴(M1-35)가 다음 카드 밑에 깔린다
    const onAnimationEnd = (event: AnimationEvent) => {
      if (
        event.target instanceof Element &&
        event.target.hasAttribute(NF.enter)
      )
        event.target.removeAttribute(NF.enter);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("animationend", onAnimationEnd);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("animationend", onAnimationEnd);
    };
  }, []);

  return null;
}
