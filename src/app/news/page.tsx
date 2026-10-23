import type { Metadata } from "next";

import { counterfoilSlots } from "@/components/news/counterfoil";
import { NewsFilterContents } from "@/components/news/news-filter";
import { NewsSection } from "@/components/news/news-section";
import { AppShell } from "@/components/shell/app-shell";
import { loadArchiveView, loadLatestIssue } from "@/lib/data/issue";
import { loadNewsFilterView } from "@/lib/data/news-filter";
import { routes } from "@/lib/paths";
import { newsDescription, pageMetadata } from "@/lib/seo";

/*
 * `/news/` 뉴스 피드 (PRD §4 IA·FR-31·FR-32, plan M1-30·M1-33) — 가장 최근 호의 카드를 홈과 같은 방식으로 싣는다.
 * 필터: 1024 이상은 앱 셸 목차 열(대회 6 · 분류 7 · 한국 선수 관련만 + 건수), 1023 이하는 분류 칩 줄. 대회는 1023 이하에 진입점이 없고
 * 주소 쿼리(`?comp=`)로 들어오면 피드 머리 색 면으로 보인다(DECISIONS D0 §5 #11). 팀은 주소 쿼리(`?team=`)로만.
 * 워드마크가 h1이 아닌 페이지라 섹션 머리 "뉴스"가 이 페이지의 h1이다(카드 제목 h2).
 *
 * 날짜 아카이브(M1-34)와의 관계: 이 페이지는 **최신 호의 별칭**이고 같은 호의 영구 주소는 `/news/{최신 발행일}/`이다. 내용이 같으므로
 * canonical을 그 날짜 페이지로 둔다 — 날짜 페이지는 내용이 바뀌지 않는 영구 주소(카드 공유 링크 FR-34가 가리키는 주소)이고, 이 주소는
 * 매일 다른 호를 싣는다. 반대(최신 날짜 페이지 → `/news/`)로 두면 그 날짜 페이지의 canonical이 다음 날 자기 자신으로 바뀐다.
 * 티켓에 꼬리표(이전 호 · 달력 · "최신 호예요")를 단다(시안 A — `/news/`·날짜 아카이브만, 홈에는 없음, 2026-10-23 사용자 결정).
 */

// 메타(M1-38): 설명 = 최신 호의 호수·날짜·카드 수(사실만 — 원제목·스코어 없음), canonical·og:url = 최신 날짜 페이지(위 별칭 관계).
// 발행된 호가 없으면 canonical 없이 사이트 기본 설명.
export function generateMetadata(): Metadata {
  const { news } = loadLatestIssue();
  return pageMetadata({
    title: "뉴스",
    description: newsDescription(
      news ? { date: news.date, cards: news.cards.length } : null,
    ),
    canonical: news ? routes.newsArchive(news.date) : null,
  });
}

const HEADING_ID = "news-h";

export default function NewsPage() {
  const { news, issue } = loadLatestIssue();
  const filter = loadNewsFilterView(news);
  const archive = issue ? loadArchiveView(issue.date) : null;

  return (
    <AppShell
      current="news"
      issue={issue}
      counterfoil={archive ? counterfoilSlots(archive) : undefined}
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
