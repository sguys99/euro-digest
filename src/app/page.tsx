import type { Metadata } from "next";

import { BriefMissing, TodayBrief } from "@/components/brief/today-brief";
import { DataSourceNote } from "@/components/data-source";
import { LeagueMini } from "@/components/home/league-mini";
import { TonightSection } from "@/components/home/tonight";
import { NewsFilterContents } from "@/components/news/news-filter";
import { NewsSection } from "@/components/news/news-section";
import { AppShell } from "@/components/shell/app-shell";
import { loadBriefSlot } from "@/lib/data/brief";
import {
  loadLeagueMini,
  loadTonightWidget,
  loadWidgetsSource,
} from "@/lib/data/home-widgets";
import { loadLatestIssue } from "@/lib/data/issue";
import { loadNewsFilterView } from "@/lib/data/news-filter";
import { issueLateWindows } from "@/lib/issue";
import { routes } from "@/lib/paths";
import { pageMetadata, SITE_DESCRIPTION } from "@/lib/seo";
import { cn } from "@/lib/utils";

/*
 * 홈 (PRD §4.2, plan M1-32·M1-33) — 빌드 때 최신 호를 읽어 앱 셸(티켓 마스트헤드·내비·뒤표지, M1-30) 안에 싣는다.
 *   0. 발행 지연 안내(M1-37 — 평소 숨김, 앱 셸 main 맨 앞): 지금이 오늘 공개 목표 + 15분 뒤인데 이 빌드의 최신 호가 오늘보다 앞이면 보인다.
 *   1. 오늘의 5줄(최상단 — PRD §15 D2) — 그 호 날짜의 브리핑 파일(data/briefs, D38). 경기 없는 날(mode empty)은 블록을 두고 높이만 줄이고
 *      (D30 S4), 모든 대회가 시즌 밖이면 S4 자리에 비시즌 빈 상태(M1-37). 파일이 없는 호는 블록을 싣지 않되(D38 전 2026-10-12~14 — 사실 없는
 *      안내 금지), D38 뒤 호인데 그날 게시 실행 기록이 있으면 5줄 자리에 오류 상태(M1-37 — src/lib/brief-slot.ts). 필터와 무관하게 늘 맨 위다.
 *   2. 주요 뉴스 피드(M1-31 카드) — 5줄 아래 36px(≥1024 44px, DESIGN §4.3). id="news"는 S4 "주요 뉴스로 ↓"의 앵커.
 *      필터(M1-33 — 피드만 거른다): 1024 이상은 앱 셸 목차 열(대회·분류·한국 선수), 1023 이하는 부제 아래 분류 칩 줄. 주소 쿼리
 *      (`?comp=epl&cat=transfer`)와 같이 움직인다 — 혼합안 홈이 URL을 갱신하고 `/news/`와 같은 지면이라 홈도 공유·새로고침 때 유지한다.
 *   3. 오늘 밤 볼 경기(M2-14) → 리그 순위 미니(M2-15) — D1 확정 시안 화면 3(DESIGN §9.3). **위젯 두 자리**(DESIGN §11.4): 1279 이하는 지면 안
 *      피드 다음(`xl:hidden` — DECISIONS D0 §5 #16 순서 5줄 → 한국 선수 → 피드 → 오늘 밤 → 이적·순위), 1280 이상은 마주 보는 면(앱 셸 `facing`
 *      — 오늘 밤 → 순위). 같은 위젯을 두 번 그리고 `display`로 고른다(보조기술에는 한 번만 — 머리 id만 다르게).
 *      기준 시각 = 빌드 시각(오늘 밤 창은 빌드 시각의 KST 날짜 18:00 ~ 다음 날 07:00 — src/lib/tonight.ts). 두 위젯 아래 데이터 출처 줄
 *      하나(FR-45 — src/components/data-source.tsx, 갱신 시각 = 6개 대회 파일 중 가장 오래된 것, M2-16).
 * 그 밖의 홈 섹션(한국 선수·이적)은 해당 단계에서 싣는다(미완성 섹션 숨김, plan §2.3 — 자리를 그리지 않는다). 1024~1279는 목차 + 지면 2단,
 * 1280 이상은 목차 + 지면(688) + 마주 보는 면(296) 3단이다(DESIGN §4.3).
 */

// 제목 = 서비스 이름 단독, 설명 = 사이트 기본 설명(매일 바뀌는 호 정보는 넣지 않는다 — 날짜 페이지가 맡는다), canonical = 홈 자신(M1-38)
export const metadata: Metadata = pageMetadata({
  title: null,
  description: SITE_DESCRIPTION,
  canonical: routes.home(),
});

const NEWS_HEADING_ID = "news-h";

export default function HomePage() {
  const { news, issue } = loadLatestIssue();
  const slot = issue ? loadBriefSlot(issue.date) : null;
  const filter = loadNewsFilterView(news);
  const tonight = loadTonightWidget();
  const league = loadLeagueMini();
  const source = loadWidgetsSource();
  const widgets = (where: "flow" | "facing") => (
    <>
      <TonightSection
        widget={tonight}
        headingId={`tonight-${where}-h`}
        className={where === "flow" ? "mt-9 lg:mt-11" : undefined}
      />
      <LeagueMini
        panels={league}
        headingId={`league-mini-${where}-h`}
        className="mt-9"
      />
      {/* 두 위젯의 데이터 출처(FR-45 — 6개 대회 파일 중 가장 오래된 갱신 시각, M2-16) */}
      <DataSourceNote
        source={source}
        covers="일정·순위"
        scope="home"
        className="mt-4"
      />
    </>
  );

  return (
    <AppShell
      current="home"
      issue={issue}
      contents={filter ? <NewsFilterContents view={filter} /> : undefined}
      lateWindows={issue ? issueLateWindows(issue.date) : undefined}
      facing={widgets("facing")}
      facingLabel="오늘 밤 경기·리그 순위"
    >
      {slot?.kind === "brief" ? <TodayBrief brief={slot.brief} /> : null}
      {slot?.kind === "missing" ? <BriefMissing /> : null}
      <NewsSection
        id="news"
        news={news}
        filter={filter}
        heading="주요 뉴스"
        headingAs="h2"
        headingId={NEWS_HEADING_ID}
        titleAs="h3"
        className={cn(
          "scroll-mt-4",
          slot && slot.kind !== "none" && "mt-9 lg:mt-11",
        )}
      />
      {/* 1279 이하 — 지면 안 피드 다음(1280 이상은 마주 보는 면) */}
      <div data-slot="home-widgets" className="xl:hidden">
        {widgets("flow")}
      </div>
    </AppShell>
  );
}
