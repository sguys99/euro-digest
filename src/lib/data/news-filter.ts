/**
 * 뉴스 필터 화면 모델 로더 — 그 호 카드 → 목차·칩 건수와 필터 설정 (PRD FR-31·FR-32, plan M1-33)
 *
 * 대회(`configs/competitions.json` 순서·약칭·정식 이름 — src/lib/data/card-labels.ts `loadCompetitionLabels`)와 팀 한글 표기
 * (`configs/names.ko.json` — `loadTagLabels`)를 빌드 때(서버 컴포넌트) 읽어 순수 함수 `buildFilterView`(src/lib/news/filter.ts)에 넘긴다.
 * node:fs를 쓰는 로더를 부르므로 `"use client"` 파일에서 import하지 않는다 — 섬은 페이지에 실린 설정 JSON만 읽는다.
 * 카드가 없는 호(발행 전·0장)는 필터가 없다(undefined — 목차 열·칩 줄을 싣지 않는다).
 */
import { loadCompetitionLabels } from "@/lib/data/card-labels";
import { loadTagLabels } from "@/lib/data/names";
import { buildFilterView, type NewsFilterView } from "@/lib/news/filter";
import type { NewsFile } from "@/lib/schema/news";

export function loadNewsFilterView(
  news: NewsFile | null,
): NewsFilterView | undefined {
  if (!news || news.cards.length === 0) return undefined;
  const tags = loadTagLabels();
  return buildFilterView(news.cards, {
    competitions: [...loadCompetitionLabels()].map(([id, label]) => ({
      id,
      ...label,
    })),
    team: (slug) => tags.label("team", slug),
  });
}
