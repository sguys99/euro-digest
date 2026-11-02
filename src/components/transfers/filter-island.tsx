"use client";

import { useEffect } from "react";

import {
  EMPTY_TRANSFER_FILTER,
  parseTransferFilterQuery,
  toggleTransferFilter,
  TRANSFER_FILTER_AXES,
  withTransferFilterQuery,
  type TransferFilterAxis,
  type TransferFilterState,
} from "@/lib/transfer-filter";
import {
  drawTransferFilter,
  openTransferTarget,
  XF,
} from "@/lib/transfer-filter-dom";

/**
 * 이적 필터 · 타임라인 섬 — `/transfers/`에 하나(렌더 결과 없음). 서버가 그린 버튼 · 행 · 건수의 속성만 바꾼다(DOM 약속은
 * src/lib/transfer-filter-dom.ts — 첫 페인트 전 부트 스크립트와 같은 함수로 그린다).
 *
 * - **마운트**: 주소 쿼리대로 필터를 그리고(부트가 이미 그렸으면 같은 결과), 주소 해시(`#xt-{카드 ID}` — 홈 핫 리스트)가 가리키는 타임라인을
 *   펼쳐 그 항목으로 굴린다. 앱 라우터 이동(next/link)은 인라인 스크립트를 실행하지 않고 `:target`도 바꾸지 않아 여기서 한다. `hashchange`도 같다.
 * - **누름**(위임 리스너 하나): 필터 버튼 → 다음 상태 → `history.replaceState`(기록 추가 없음) → 그리기 → 남은 행 찍힘(fast — 모션 줄이기면
 *   globals.css가 끈다). 결과 수 줄은 `aria-live`라 따로 알리지 않는다. 필터 해제 · 접힘 칩(1023 이하 칩 묶음) · 타임라인 펼침도 여기서.
 *   누른 버튼이 사라지거나 비활성이 되면(해제 · 0건 항목 끄기) 보이는 첫 필터 버튼으로 포커스를 옮긴다.
 *
 * `cn`을 쓰지 않는다(섬 번들 — DESIGN §9.4). import하는 모듈에 fs · zod가 없다.
 */

/** 페이지 버튼이 아는 축 값(DOM 순서 · 중복 없음) */
function knownValues(doc: Document): Record<TransferFilterAxis, string[]> {
  const known: Record<TransferFilterAxis, string[]> = {
    league: [],
    team: [],
    status: [],
    tier: [],
    kr: [],
  };
  for (const el of doc.querySelectorAll(`[${XF.axis}]`)) {
    const axis = el.getAttribute(XF.axis) as TransferFilterAxis;
    const value = el.getAttribute(XF.value) ?? "";
    if (TRANSFER_FILTER_AXES.includes(axis) && !known[axis].includes(value))
      known[axis].push(value);
  }
  return known;
}

function isVisible(el: Element): boolean {
  return el.getClientRects().length > 0;
}

/** 남은 행에 찍힘을 다시 건다(속성을 지웠다가 한 번의 리플로 뒤 다시 단다) */
function stampVisibleRows(doc: Document): void {
  const rows = [
    ...doc.querySelectorAll<HTMLElement>(`[${XF.row}]:not([hidden])`),
  ];
  for (const row of rows) row.removeAttribute(XF.enter);
  void doc.body.offsetWidth;
  for (const row of rows) row.setAttribute(XF.enter, "");
}

/** 해시가 가리키는 항목을 펼쳐 보이고(화면 밖이면) 굴린다 — 이미 보이면(브라우저 앵커 스크롤이 끝났으면) 그대로 둔다 */
function arrive(doc: Document, hash: string): void {
  const target = openTransferTarget(doc, hash);
  if (!target) return;
  requestAnimationFrame(() => {
    const { top } = target.getBoundingClientRect();
    if (top < 0 || top > window.innerHeight * 0.6)
      target.scrollIntoView({ block: "start" });
    target.focus({ preventScroll: true });
  });
}

export function TransferFilterIsland() {
  useEffect(() => {
    const doc = document;
    drawTransferFilter(doc, location.search);
    arrive(doc, location.hash);

    const commit = (next: TransferFilterState, origin: HTMLElement) => {
      const search = withTransferFilterQuery(location.search, next);
      try {
        window.history.replaceState(
          window.history.state,
          "",
          `${location.pathname}${search}${location.hash}`,
        );
      } catch {
        // 주소를 못 바꿔도 화면은 거른다(공유 · 새로고침만 못 한다)
      }
      drawTransferFilter(doc, search);
      stampVisibleRows(doc);
      if (
        !isVisible(origin) ||
        (origin instanceof HTMLButtonElement && origin.disabled)
      ) {
        const fallback = [
          ...doc.querySelectorAll<HTMLButtonElement>(`[${XF.axis}]`),
        ].find((b) => isVisible(b) && !b.disabled);
        fallback?.focus();
      }
    };

    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLElement>(
        `[${XF.axis}],[${XF.reset}],[${XF.panelToggle}],[${XF.tlToggle}]`,
      );
      if (!button) return;
      if (
        button.hasAttribute(XF.tlToggle) ||
        button.hasAttribute(XF.panelToggle)
      ) {
        const panel = doc.getElementById(
          button.getAttribute("aria-controls") ?? "",
        );
        if (!panel) return;
        const open = panel.hidden;
        panel.hidden = !open;
        button.setAttribute("aria-expanded", open ? "true" : "false");
        return;
      }
      if (button.hasAttribute(XF.reset)) {
        commit(EMPTY_TRANSFER_FILTER, button);
        return;
      }
      const axis = button.getAttribute(XF.axis) as TransferFilterAxis;
      const value = button.getAttribute(XF.value) ?? "";
      const known = knownValues(doc);
      const state = parseTransferFilterQuery(location.search, known);
      commit(toggleTransferFilter(state, axis, value, known), button);
    };
    // 찍힘이 끝나면 속성을 지운다(채움 both가 남아 쌓임 맥락이 생기지 않게)
    const onAnimationEnd = (event: AnimationEvent) => {
      if (
        event.target instanceof Element &&
        event.target.hasAttribute(XF.enter)
      )
        event.target.removeAttribute(XF.enter);
    };
    const onHashChange = () => arrive(doc, location.hash);
    doc.addEventListener("click", onClick);
    doc.addEventListener("animationend", onAnimationEnd);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      doc.removeEventListener("click", onClick);
      doc.removeEventListener("animationend", onAnimationEnd);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  return null;
}
