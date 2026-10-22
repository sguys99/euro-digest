import { NewsFeed } from "@/components/news-feed";
import { SectionHead } from "@/components/ui/section-head";
import type { NewsFilterView } from "@/lib/news/filter";
import type { NewsFile } from "@/lib/schema/news";

import { NewsFilterHead } from "./news-filter";

/**
 * 뉴스 피드 섹션 — 섹션 머리 + 피드 (홈 "주요 뉴스" · `/news/` "뉴스", plan M1-30·M1-33)
 *
 * 필터(`filter`)가 있으면 섹션이 필터 범위(`data-nf-scope`)가 되고 머리는 필터가 바꾸는 머리(대회 색 면·팀 칸 — `NewsFilterHead`)다.
 * 목차 열(1024 이상)은 페이지가 앱 셸 `contents`에 `NewsFilterContents`로 따로 싣는다(DOM이 지면보다 앞).
 * 서버 컴포넌트 — 제목 단계는 페이지가 정한다(홈 h2 → 카드 h3 · `/news/` h1 → 카드 h2).
 */
export function NewsSection({
  news,
  filter,
  heading,
  headingAs,
  headingId,
  titleAs,
  id,
  className,
}: {
  news: NewsFile | null;
  filter: NewsFilterView | undefined;
  heading: string;
  headingAs: "h1" | "h2";
  headingId: string;
  titleAs: "h2" | "h3";
  id?: string;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      {...(filter ? { "data-nf-scope": "" } : {})}
      className={className}
    >
      {filter ? (
        <NewsFilterHead
          heading={heading}
          headingAs={headingAs}
          headingId={headingId}
          runningHead="SQUAD"
        />
      ) : (
        <SectionHead
          heading={heading}
          headingAs={headingAs}
          headingId={headingId}
          runningHead="SQUAD"
        />
      )}
      <NewsFeed news={news} titleAs={titleAs} filter={filter} />
    </section>
  );
}
