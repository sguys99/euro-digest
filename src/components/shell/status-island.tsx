"use client";

import { useEffect } from "react";

import {
  ISSUE_LATE_ATTR,
  isIssueLate,
  type LateWindow,
} from "@/lib/issue-late";

/**
 * 셸 상태 섬 — 오프라인 띠 + 발행 지연 안내 (PRD DR-07, DESIGN.md §9.3 상태 화면 ③·④, plan M1-37)
 *
 * 그리는 것이 없다(`null`). 정적 HTML의 상자(src/components/shell/offline-band.tsx · issue-late-notice.tsx)는 `<html>` 속성에 걸린
 * CSS 변형(globals.css `offline:`·`issue-late:`)으로 보였다 숨는다 — 섬은 속성만 바꾼다(작게 — `cx`도 쓰지 않는다).
 *
 * 1. 오프라인: `online`·`offline` 이벤트, 마운트, `pageshow`(뒤로 가기 캐시에서 돌아옴 — 캐시에 있는 동안의 이벤트는 받지 못한다) 때
 *    `navigator.onLine`으로 `data-offline`을 단다. 띠 높이(`--offline-band-h` — 토스트·scroll-padding이 띠를 피한다, globals.css §8)와
 *    하단 탭 높이(`--bottom-tabs-h` — 띠가 탭 바로 위에 붙는다, 1024 이상은 탭이 없어 0)를 잰다. 서비스 워커는 없다(M4-D).
 * 2. 발행 지연: `late`(빌드가 계산한 늦음 구간)가 있으면 마운트 때 `data-issue-late`를 다시 정한다. 첫 로드는 상자 뒤 인라인 스크립트가
 *    이미 정했다 — 여기서는 클라이언트 이동(next/link — 인라인 스크립트가 실행되지 않음)으로 들어온 경우를 맡는다. 페이지를 열어 둔 채
 *    시각이 지나거나 뒤로 가기 캐시에서 돌아와도 다시 판정하지 않는다 — 입력 없이 지면이 밀리지 않게, 그리고 오래된 사본이 그사이 발행된
 *    호를 "늦어지고 있어요"라고 말하지 않게(새로고침·이동 때 반영 — 리뷰 반영).
 */

/** `<html>` 오프라인 속성 — CSS 변형 `offline:` */
export const OFFLINE_ATTR = "data-offline";
/** 띠 높이 CSS 변수(globals.css §8) */
export const OFFLINE_BAND_HEIGHT_VAR = "--offline-band-h";
/** 하단 탭 높이 CSS 변수(오프라인 띠 `bottom` — offline-band.tsx) */
export const BOTTOM_TABS_HEIGHT_VAR = "--bottom-tabs-h";

/** 요소 높이(소수 px)를 루트 CSS 변수로 */
function setHeightVar(name: string, el: HTMLElement | null): void {
  if (el) {
    document.documentElement.style.setProperty(
      name,
      `${el.getBoundingClientRect().height}px`,
    );
  }
}

export function StatusIsland({ late }: { late?: readonly LateWindow[] }) {
  useEffect(() => {
    const root = document.documentElement;
    const band = document.querySelector<HTMLElement>(
      '[data-slot="offline-band"]',
    );
    const tabs = document.querySelector<HTMLElement>(
      '[data-slot="bottom-tabs"]',
    );
    const sync = () => root.toggleAttribute(OFFLINE_ATTR, !navigator.onLine);
    const measure =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            setHeightVar(OFFLINE_BAND_HEIGHT_VAR, band);
            setHeightVar(BOTTOM_TABS_HEIGHT_VAR, tabs);
          })
        : null;
    for (const el of [band, tabs]) if (el) measure?.observe(el);
    sync();
    for (const type of ["online", "offline", "pageshow"])
      window.addEventListener(type, sync);
    return () => {
      for (const type of ["online", "offline", "pageshow"])
        window.removeEventListener(type, sync);
      measure?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!late) return;
    document.documentElement.toggleAttribute(
      ISSUE_LATE_ATTR,
      isIssueLate(Date.now(), late),
    );
  }, [late]);

  return null;
}
