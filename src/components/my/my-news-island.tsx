"use client";

import { useEffect } from "react";

import { followKeySet } from "@/lib/my-view";
import { applyMyNews } from "@/lib/my-news-dom";
import { useFollows } from "@/lib/use-follows";

/**
 * 내 팀 소식 섬 — 렌더 결과 없음 (plan M4-08). 첫 화면은 인라인 부트 스크립트가 이미 그렸다(src/lib/my-news-boot.ts).
 * 하이드레이션 뒤 팔로우가 바뀌면(같은 페이지의 팔로우 버튼 · 다른 탭 · 저장 차단 시 메모리 상태) 같은 규칙(`applyMyNews`)으로 다시 그린다.
 */
export function MyNewsIsland() {
  const { follows, ready } = useFollows();
  useEffect(() => {
    if (!ready) return;
    applyMyNews(document, followKeySet(follows));
  }, [follows, ready]);
  return null;
}
