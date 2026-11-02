"use client";

import { useSyncExternalStore } from "react";

import { SPOILER_ATTRIBUTE, SPOILER_ON } from "@/lib/theme";

/**
 * 결과 가리기가 켜졌는가(`<html data-spoiler="on">` — 초기 스크립트·스위치(spoiler-switch.tsx)가 단다). 속성이 바뀌면 따라간다(MutationObserver).
 * 서버 렌더는 꺼짐 — 검색 결과(M4-14)는 클라이언트에서만 그리고, 스위치는 aria-checked만 하이드레이션 뒤 맞춘다(모양은 CSS가 속성으로 — 깜빡임 없음).
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [SPOILER_ATTRIBUTE],
  });
  return () => observer.disconnect();
}

function getSnapshot(): boolean {
  return (
    document.documentElement.getAttribute(SPOILER_ATTRIBUTE) === SPOILER_ON
  );
}

function getServerSnapshot(): boolean {
  return false;
}

export function useSpoiler(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
