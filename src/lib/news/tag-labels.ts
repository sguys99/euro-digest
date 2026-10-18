/**
 * 뉴스 카드 태그의 한글 표시 — 순수 부분 (PRD FR-24, plan M1-21 → M1-31 리뷰에서 fs 로더와 분리)
 *
 * `configs/names.ko.json` 사전 내용 → slug별 한글 표기 표, 카드 slug 목록 → 표시할 태그. 파일 읽기(node:fs·zod 검증)는
 * src/lib/data/names.ts `loadTagLabels`가 맡고, 이 모듈은 fs·zod를 import하지 않는다(타입만) — 화면 모델(src/lib/news/feed-view.ts)과
 * 나중의 필터 섬(M1-33)이 클라이언트 번들에 fs를 끌어들이지 않고 쓸 수 있다. 원제목 텍스트는 바꾸지 않는다(D23).
 */
import type { NamesKoFile } from "@/lib/schema/names";

/** 태그 종류 — 카드 `teams`(kind team)·`players`(kind player) */
export type TagKind = "team" | "player";

/** slug → 한글 표시 이름(사전에 없으면 null) */
export interface TagLabels {
  label(kind: TagKind, slug: string): string | null;
}

/** 사전 내용 → 태그 표(순수 함수). 같은 유형·slug가 둘이면 앞 항목(스키마가 중복을 막는다) */
export function tagLabelsFrom(file: Pick<NamesKoFile, "entries">): TagLabels {
  const byKey = new Map<string, string>();
  for (const entry of file.entries) {
    if (entry.slug === undefined) continue;
    if (entry.kind !== "team" && entry.kind !== "player") continue;
    const key = `${entry.kind}:${entry.slug}`;
    if (!byKey.has(key)) byKey.set(key, entry.ko);
  }
  return {
    label: (kind, slug) => byKey.get(`${kind}:${slug}`) ?? null,
  };
}

/** 표시할 태그 1개 */
export interface TagLabel {
  slug: string;
  label: string;
}

/**
 * 카드 태그 slug 목록 → 표시할 태그(입력 순서, 같은 slug는 한 번). 사전에 없는 slug는 뺀다 — slug 문자열을 화면에 보이지 않는다.
 */
export function labelTags(
  slugs: readonly string[],
  kind: TagKind,
  labels: TagLabels,
): TagLabel[] {
  const out: TagLabel[] = [];
  const seen = new Set<string>();
  for (const slug of slugs) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    const label = labels.label(kind, slug);
    if (label !== null) out.push({ slug, label });
  }
  return out;
}
