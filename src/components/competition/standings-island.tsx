"use client";

import { useEffect } from "react";

/**
 * 순위표 행 펼침 섬 — 1023 이하 5열 표의 승점 칸 버튼 (DESIGN §9.3 순위표 "375 펼침" · §11.14 섬 ①, plan M2-11)
 *
 * 서버 컴포넌트가 표와 펼침 행(`hidden`)을 모두 그린다. 이 섬은 표마다 위임 리스너 하나로 상태 속성만 바꾼다 — React가 다시 그리지 않는다.
 * - 펼침 버튼(`button[data-row-toggle]`): `aria-expanded` · 행 `data-open` · 펼침 행 `hidden` · 펼침 내용 `data-tear`(뜯김 모션 — 열 때만,
 *   모션 줄이기면 전역 규칙이 0으로 만든다).
 * - 행 어디를 눌러도(링크·버튼 제외) 같은 버튼을 누른 것이다 — 버튼이 보일 때(1023 이하)만. 1024 이상은 버튼이 없고 행 누름도 없다.
 * - 버튼은 네이티브라 Enter·Space가 그대로 동작한다. `cn`을 쓰지 않는다(섬 번들, DESIGN §9.4).
 */
export function StandingsIsland({ tableId }: { tableId: string }) {
  useEffect(() => {
    const table = document.getElementById(tableId);
    if (!table) return;

    function toggle(button: HTMLButtonElement) {
      const row = button.closest("tr");
      const detailId = button.getAttribute("aria-controls");
      const detail = detailId ? document.getElementById(detailId) : null;
      if (!row || !detail) return;
      const open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", open ? "true" : "false");
      row.toggleAttribute("data-open", open);
      detail.hidden = !open;
      const body = detail.querySelector<HTMLElement>("[data-detail-body]");
      if (body) {
        body.removeAttribute("data-tear");
        if (open) {
          void body.offsetWidth; // 다시 열 때도 모션이 처음부터 돌게
          body.setAttribute("data-tear", "");
        }
      }
    }

    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element) || !table) return;
      const button = target.closest<HTMLButtonElement>(
        "button[data-row-toggle]",
      );
      if (button && table.contains(button)) {
        toggle(button);
        return;
      }
      if (target.closest("a, button")) return;
      const row = target.closest("tr[data-row]");
      if (!row || !table.contains(row)) return;
      const rowButton = row.querySelector<HTMLButtonElement>(
        "button[data-row-toggle]",
      );
      if (rowButton && getComputedStyle(rowButton).display !== "none") {
        toggle(rowButton);
      }
    }

    table.addEventListener("click", onClick);
    return () => table.removeEventListener("click", onClick);
  }, [tableId]);
  return null;
}
