import type { Metadata } from "next";

import { SearchScreen, SearchToc } from "@/components/search/search-screen";
import { AppShell } from "@/components/shell/app-shell";
import { loadLatestIssue } from "@/lib/data/issue";
import { routes, withBasePath } from "@/lib/paths";
import { pageMetadata } from "@/lib/seo";

/*
 * `/search/?q=` 검색 전체 결과 (PRD §4 IA `/search` · FR-130~132, DESIGN §9.3 "검색 오버레이 · 색인", plan M4-14)
 *
 * 정적 페이지 하나 — 검색어는 클라이언트가 주소에서 읽고(CLAUDE §7.1) Pagefind 색인(`/pagefind/`)으로 찾는다. 오버레이와 같은 결과 조각
 * (src/components/search/search-results.tsx). 1024 이상 목차 열 = 유형별 건수. 검색 결과 페이지라 검색 엔진 색인에서 뺀다(noindex · canonical 없음 —
 * sitemap에도 없음).
 */

export const metadata: Metadata = {
  ...pageMetadata({
    title: "검색",
    description:
      "한국 선수 · 팀 · 대회 · 뉴스를 한글이나 영문 이름으로 찾아요.",
    canonical: null,
  }),
  // 404와 같은 규칙(tests/e2e/seo.spec.ts) — noindex 페이지는 canonical·og:url 없이 robots 메타 하나
  robots: { index: false },
};

export default function SearchPage() {
  const { issue } = loadLatestIssue();
  return (
    <AppShell
      issue={issue}
      contents={<SearchToc />}
      contentsLabel="검색 결과 유형"
    >
      <SearchScreen action={withBasePath(routes.search())} />
    </AppShell>
  );
}
