/**
 * 검색 색인 빌드(scripts/build-search.ts)의 순수 부분 (plan M4-14) — 테스트가 import한다(진입점은 실행 부작용이 있어 따로 둔다).
 */

/** 쓰지 않는 Pagefind 기본 UI 파일 접두 — 검색 섬은 JS API만 쓴다(기본 UI·하이라이트 스크립트는 배포하지 않는다) */
export const UNUSED_PAGEFIND_PREFIXES: readonly string[] = [
  "pagefind-ui.",
  "pagefind-component-ui.",
  "pagefind-modular-ui.",
  "pagefind-highlight.",
];

/**
 * `pagefind-entry.json` → 색인 레코드 수. 언어가 `ko` 하나가 아니면 -1(forceLanguage가 깨졌다 — 페이지 lang과 색인이 갈리면 검색이 비어 보인다)
 */
export function indexedRecordCount(entryJson: string): number {
  const entry = JSON.parse(entryJson) as {
    languages?: Record<string, { page_count?: number }>;
  };
  const languages = Object.entries(entry.languages ?? {});
  if (languages.length !== 1 || languages[0]?.[0] !== "ko") return -1;
  return languages[0][1].page_count ?? -1;
}
