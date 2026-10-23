"use client";

import { useEffect } from "react";

/**
 * 달력 펼침 섬 — 티켓 꼬리표의 달력 버튼과 월 달력 판(src/components/news/counterfoil.tsx, 시안 A `concept-a.html`, plan M1-34).
 * 렌더 결과는 없고, 서버가 그린 버튼·판의 속성만 바꾼다(`aria-expanded`·`hidden`·`data-tear`) — React가 다시 그리지 않는 자리다.
 *
 * - 버튼: 펼침·접힘. 펼치면 보는 호 칸(`aria-current="page"`, 없으면 첫 발행 칸)으로 포커스, 뜯김 200ms(모션 줄이기면 없음).
 * - 닫기: 판의 닫기 버튼 → 닫고 달력 버튼으로 포커스 복귀. Esc(판이 열려 있을 때)는 포커스가 판 안·버튼에 있으면 닫고 버튼으로 복귀,
 *   그 밖이면 닫기만 한다(포커스를 옮기지 않는다 — 375 시트에서 화면이 튀지 않게, 카드 메뉴 등 다른 Esc와 다투지 않게, M1-34 리뷰).
 * - 1024 이상(팝오버)은 바깥 클릭 · **포커스가 판·버튼 밖으로 나가면**(Tab) 닫는다 — 팝오버가 덮은 요소에 포커스가 숨지 않게(WCAG 2.4.11).
 *   375 시트는 지면을 밀어내는 흐름 요소라(아무것도 덮지 않는다) 바깥 클릭·포커스 이동으로 닫지 않는다.
 * - 화살표 키(발행 칸 링크 위): ← → 앞뒤 발행 칸 · Home·End 처음·끝 · ↑ ↓ 7일 전·후(그날이 발행 칸일 때만 — 결호·발행 전 칸은 링크가 아니다).
 * - 뜯김 속성은 끝나면 지운다 — 채움 모드(both)의 `clip-path`가 남으면 팝오버의 인쇄 그림자(판 밖 4px)가 잘린다.
 *
 * 섬 경계(DESIGN §9.4): react 말고는 import하지 않는다(`cn`·fs·zod 없음). 정적 export — 링크 이동은 next/link가 맡는다.
 */

const DAY = "a[data-cal-day]";

/** "YYYY-MM-DD"에 일수를 더한다(UTC 달력 계산) */
function shiftDay(date: string, days: number): string {
  const t = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)) + days,
  );
  return new Date(t).toISOString().slice(0, 10);
}

/** 화살표 키 → 옮겨 갈 발행 칸(없으면 null) */
export function calendarKeyTarget(
  panel: ParentNode,
  from: HTMLElement,
  key: string,
): HTMLElement | null {
  const links = [...panel.querySelectorAll<HTMLElement>(DAY)];
  const i = links.indexOf(from);
  if (i < 0) return null;
  switch (key) {
    case "ArrowLeft":
      return links[i - 1] ?? null;
    case "ArrowRight":
      return links[i + 1] ?? null;
    case "Home":
      return links[0] ?? null;
    case "End":
      return links.at(-1) ?? null;
    case "ArrowUp":
    case "ArrowDown": {
      const date = from.getAttribute("data-cal-day") ?? "";
      const to = shiftDay(date, key === "ArrowUp" ? -7 : 7);
      return panel.querySelector<HTMLElement>(`${DAY}[data-cal-day="${to}"]`);
    }
    default:
      return null;
  }
}

export function CalendarIsland({ panelId }: { panelId: string }) {
  useEffect(() => {
    const panel = document.getElementById(panelId);
    const button = document.querySelector<HTMLButtonElement>(
      `[aria-controls="${panelId}"]`,
    );
    if (!panel || !button) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    const set = (open: boolean, focusInside: boolean) => {
      button.setAttribute("aria-expanded", open ? "true" : "false");
      panel.hidden = !open;
      if (!open) {
        panel.removeAttribute("data-tear");
        return;
      }
      if (!reduce.matches) panel.setAttribute("data-tear", "");
      if (focusInside)
        (
          panel.querySelector<HTMLElement>(`${DAY}[aria-current="page"]`) ??
          panel.querySelector<HTMLElement>(DAY)
        )?.focus();
    };
    const close = () => {
      set(false, false);
      button.focus();
    };
    /** 판 안이거나 달력 버튼인가 */
    const inside = (node: EventTarget | null) =>
      node instanceof Node && (panel.contains(node) || button.contains(node));

    const onButton = () =>
      set(button.getAttribute("aria-expanded") !== "true", true);
    const onPanelClick = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-cal-close]")
      )
        close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (panel.hidden) return;
      if (event.key === "Escape") {
        if (inside(document.activeElement)) close();
        else set(false, false);
        return;
      }
      if (!(event.target instanceof HTMLElement)) return;
      const from = event.target.closest<HTMLElement>(DAY);
      if (!from || !panel.contains(from)) return;
      const to = calendarKeyTarget(panel, from, event.key);
      if (to) {
        event.preventDefault();
        to.focus();
      }
    };
    // 1024 이상 팝오버 — 바깥 클릭·바깥으로 간 포커스(Tab)면 닫는다(포커스는 옮기지 않는다 — 이미 바깥에 있다)
    const onOutside = (event: Event) => {
      if (panel.hidden || !wide.matches || inside(event.target)) return;
      set(false, false);
    };
    const onAnimationEnd = () => panel.removeAttribute("data-tear");

    button.addEventListener("click", onButton);
    panel.addEventListener("click", onPanelClick);
    panel.addEventListener("animationend", onAnimationEnd);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onOutside);
    document.addEventListener("focusin", onOutside);
    return () => {
      button.removeEventListener("click", onButton);
      panel.removeEventListener("click", onPanelClick);
      panel.removeEventListener("animationend", onAnimationEnd);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onOutside);
      document.removeEventListener("focusin", onOutside);
    };
  }, [panelId]);
  return null;
}
