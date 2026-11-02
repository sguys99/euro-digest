"use client";

import { useSyncExternalStore } from "react";

import { SPOILER_ATTRIBUTE, SPOILER_ON } from "@/lib/theme";

/**
 * 결과 가리기가 켜졌는가(`<html data-spoiler="on">` — 초기 스크립트·M4-15 스위치가 단다). 속성이 바뀌면 따라간다(MutationObserver).
 * 서버 렌더는 꺼짐(검색 결과는 클라이언트에서만 그린다).
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
