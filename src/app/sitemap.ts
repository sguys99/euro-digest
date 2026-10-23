import type { MetadataRoute } from "next";

import { listIssueDates, loadIssue } from "@/lib/data/issue";
import { sitemapEntries } from "@/lib/seo";

/*
 * `/sitemap.xml` (PRD FR-124, plan M1-38) — 빌드 때 out/sitemap.xml 한 파일로 굳힌다(정적 export는 라우트 핸들러를 `force-static`으로만
 * 받는다 — 서버 런타임 없음, CLAUDE §1-10). 항목 규칙(홈 · `/about/` · 발행된 날짜 페이지 전부, `/news/` 별칭 제외)은 src/lib/seo.ts
 * `sitemapEntries`. 날짜 페이지 lastmod = 그 호 뉴스 파일의 generatedAt(로더 경유 — 삭제 요청 제외 규칙과 같은 읽기 경로).
 *
 * robots.txt는 만들지 않는다 — 프로젝트 사이트(basePath 아래)의 robots.txt는 크롤러가 읽지 않는다(호스트 루트만 유효).
 * Search Console sitemap 제출·색인 정책은 M5(정식 공개)에서 정한다(2026-10-18 사용자 결정).
 */

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const issues = listIssueDates().flatMap((date) => {
    const { news } = loadIssue(date);
    return news ? [{ date, generatedAt: news.generatedAt }] : [];
  });
  return sitemapEntries(issues);
}
