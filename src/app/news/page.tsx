import type { Metadata } from "next";

import { NewsFeed } from "@/components/news-feed";
import { AppShell } from "@/components/shell/app-shell";
import { SectionHead } from "@/components/ui/section-head";
import { loadLatestIssue } from "@/lib/data/issue";

/*
 * `/news/` 뉴스 피드 — M1-30 골격(하단 탭·상단 내비 "뉴스"가 깨진 링크가 되지 않게). 가장 최근 호의 카드를 홈과 같은 방식으로 싣는다.
 * 대회·팀·카테고리·한국 선수 필터와 URL 쿼리 동기화(목차 열 `contents` 포함)는 M1-33, 날짜 아카이브 `/news/[date]/`는 M1-34.
 * 워드마크가 h1이 아닌 페이지라 섹션 머리 "뉴스"가 이 페이지의 h1이다.
 */

export const metadata: Metadata = {
  title: "뉴스",
};

const HEADING_ID = "news-h";

export default function NewsPage() {
  const { news, issue } = loadLatestIssue();

  return (
    <AppShell current="news" issue={issue}>
      <section aria-labelledby={HEADING_ID}>
        <SectionHead
          heading="뉴스"
          headingAs="h1"
          headingId={HEADING_ID}
          runningHead="SQUAD"
        />
        {/* 페이지 h1 바로 아래라 카드 제목은 h2(홈은 h2 "주요 뉴스" 아래 h3) */}
        <NewsFeed news={news} titleAs="h2" />
      </section>
    </AppShell>
  );
}
