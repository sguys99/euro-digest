"use client";

import { useEffect } from "react";

/**
 * 팀시트 하이라이트 섬 — 명단 ↔ 피치 hover (DESIGN §9.3 "팀시트" 하이라이트 · §11.14 섬 ③, plan M2-13)
 *
 * 서버 컴포넌트가 명단 행·피치 칸에 같은 키(`data-no`)를 단다. 이 섬은 팀시트마다 `mouseover` 위임 하나 + `mouseleave`로 같은 키의 요소에
 * `data-hl`만 켜고 끈다(모양은 Tailwind `data-hl:` — 명단 행 `--paper-2` 면, 피치 칸 링 + 이름 밑줄, fast). 마우스 전용 보조라 포커스·터치
 * 이벤트는 없다(같은 정보가 명단에 있다 — DESIGN §10). 모션 줄이기는 전역 규칙이 전환을 0으로 만든다. `cn`을 쓰지 않는다(섬 번들).
 */
export function TeamSheetIsland({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    let current: string | null = null;

    function mark(key: string | null) {
      if (key === current || !root) return;
      current = key;
      for (const el of root.querySelectorAll<HTMLElement>("[data-no]")) {
        el.toggleAttribute("data-hl", key !== null && el.dataset.no === key);
      }
    }

    function onOver(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const item = target.closest<HTMLElement>("[data-no]");
      mark(item && root?.contains(item) ? (item.dataset.no ?? null) : null);
    }

    function onLeave() {
      mark(null);
    }

    root.addEventListener("mouseover", onOver);
    root.addEventListener("mouseleave", onLeave);
    return () => {
      root.removeEventListener("mouseover", onOver);
      root.removeEventListener("mouseleave", onLeave);
    };
  }, [rootId]);
  return null;
}
