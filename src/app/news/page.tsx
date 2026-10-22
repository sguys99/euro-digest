import type { Metadata } from "next";

import { NewsFilterContents } from "@/components/news/news-filter";
import { NewsSection } from "@/components/news/news-section";
import { AppShell } from "@/components/shell/app-shell";
import { loadLatestIssue } from "@/lib/data/issue";
import { loadNewsFilterView } from "@/lib/data/news-filter";

/*
 * `/news/` 뉴스 피드 (PRD §4 IA·FR-31·FR-32, plan M1-30·M1-33) — 가장 최근 호의 카드를 홈과 같은 방식으로 싣는다.
 * 필터: 1024 이상은 앱 셸 목차 열(대회 6 · 분류 7 · 한국 선수 관련만 + 건수), 1023 이하는 분류 칩 줄. 대회는 1023 이하에 진입점이 없고
 * 주소 쿼리(`?comp=`)로 들어오면 피드 머리 색 면으로 보인다(DECISIONS D0 §5 #11). 팀은 주소 쿼리(`?team=`)로만. 날짜 아카이브 `/news/[date]/`는 M1-34.
 * 워드마크가 h1이 아닌 페이지라 섹션 머리 "뉴스"가 이 페이지의 h1이다(카드 제목 h2).
 */

export const metadata: Metadata = {
  title: "뉴스",
};

const HEADING_ID = "news-h";

export default function NewsPage() {
  const { news, issue } = loadLatestIssue();
  const filter = loadNewsFilterView(news);

  return (
    <AppShell
      current="news"
      issue={issue}
      contents={filter ? <NewsFilterContents view={filter} /> : undefined}
    >
      <NewsSection
        news={news}
        filter={filter}
        heading="뉴스"
        headingAs="h1"
        headingId={HEADING_ID}
        titleAs="h2"
      />
    </AppShell>
  );
}
