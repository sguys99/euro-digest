"use client";

import { useEffect } from "react";

/**
 * 이적 타임라인 펼침 섬 — 필터가 없는 곳(한국 선수 상세 '이적설' 구역 — M4-16)에 하나(렌더 결과 없음).
 *
 * `/transfers/`의 필터 섬(filter-island.tsx)은 필터 · 주소 쿼리 · 해시 도착까지 맡아 무겁다. 여기서는 원장 행의 '타임라인' 버튼
 * (`data-xt-toggle` — src/lib/transfer-filter-dom.ts `XF.tlToggle`, tests가 같은 글자인지 확인)만 위임 리스너 하나로 듣는다:
 * `aria-controls` 묶음의 `hidden`과 `aria-expanded`를 함께 뒤집는다(필터 섬과 같은 동작). 그 모듈은 첫 페인트 전 부트 스크립트 원문까지
 * 실어 크므로 import하지 않는다.
 */
export const TIMELINE_TOGGLE_ATTR = "data-xt-toggle";

export function TimelineToggleIsland() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest(`[${TIMELINE_TOGGLE_ATTR}]`);
      if (!button) return;
      const panel = document.getElementById(
        button.getAttribute("aria-controls") ?? "",
      );
      if (!panel) return;
      const open = panel.hidden;
      panel.hidden = !open;
      button.setAttribute("aria-expanded", open ? "true" : "false");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
