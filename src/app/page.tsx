import { NewsFeed } from "@/components/news-feed";
import { AppShell } from "@/components/shell/app-shell";
import { SectionHead } from "@/components/ui/section-head";
import { loadLatestIssue } from "@/lib/data/issue";

/*
 * 홈 — 빌드 때 data/news의 가장 최근 호를 읽어 앱 셸(티켓 마스트헤드·내비·뒤표지, M1-30) 안에 주요 뉴스 피드를 싣는다.
 * 오늘의 5줄·홈 구성(M1-32), 카드 변형 6종(M1-31), 목차 필터(M1-33)는 뒤 작업이다 — 그 전까지 목차 열은 비워 두지 않고
 * 빼고(앱 셸 `contents` 없음) 지면 한 열로 싣는다(미완성 섹션 숨김, plan §2.3).
 */

const NEWS_HEADING_ID = "news-h";

export default function HomePage() {
  const { news, issue } = loadLatestIssue();

  return (
    <AppShell current="home" issue={issue}>
      <section aria-labelledby={NEWS_HEADING_ID}>
        <SectionHead
          heading="주요 뉴스"
          headingId={NEWS_HEADING_ID}
          runningHead="SQUAD"
        />
        <NewsFeed news={news} />
      </section>
    </AppShell>
  );
}
