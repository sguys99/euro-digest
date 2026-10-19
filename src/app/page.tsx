import { TodayBrief } from "@/components/brief/today-brief";
import { NewsFeed } from "@/components/news-feed";
import { AppShell } from "@/components/shell/app-shell";
import { SectionHead } from "@/components/ui/section-head";
import { loadBrief } from "@/lib/data/brief";
import { loadLatestIssue } from "@/lib/data/issue";
import { cn } from "@/lib/utils";

/*
 * 홈 (PRD §4.2, plan M1-32) — 빌드 때 최신 호를 읽어 앱 셸(티켓 마스트헤드·내비·뒤표지, M1-30) 안에 싣는다.
 *   1. 오늘의 5줄(최상단 — PRD §15 D2) — 그 호 날짜의 브리핑 파일(data/briefs, D38). 파일이 없는 호(D38 전 2026-10-12~14 · D38 뒤 정형 입력 실패 — 오류 상태 표시는 M1-37 이월)는
 *      블록을 싣지 않는다(사실 없는 안내 금지). 경기 없는 날(mode empty)은 블록을 두고 높이만 줄인다(D30 S4).
 *   2. 주요 뉴스 피드(M1-31 카드) — 5줄 아래 36px(≥1024 44px, DESIGN §4.3). id="news"는 S4 "주요 뉴스로 ↓"의 앵커.
 * 그 밖의 홈 섹션(한국 선수·오늘 밤·이적·순위)은 해당 단계에서 싣는다(미완성 섹션 숨김, plan §2.3). 목차 열(필터)은 M1-33 —
 * 그 전까지 앱 셸 `contents`를 주지 않아 1024 이상도 지면 한 열이고, 5줄은 지면 최상단이다(DECISIONS D0 §4 "A → 1280 M1 상태").
 */

const NEWS_HEADING_ID = "news-h";

export default function HomePage() {
  const { news, issue } = loadLatestIssue();
  const brief = issue ? loadBrief(issue.date) : null;

  return (
    <AppShell current="home" issue={issue}>
      {brief ? <TodayBrief brief={brief} /> : null}
      <section
        id="news"
        aria-labelledby={NEWS_HEADING_ID}
        className={cn("scroll-mt-4", brief && "mt-9 lg:mt-11")}
      >
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
