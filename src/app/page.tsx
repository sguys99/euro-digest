import type { Metadata } from "next";

import { BriefMissing, TodayBrief } from "@/components/brief/today-brief";
import { DataSourceNote } from "@/components/data-source";
import { KoreanLastNight } from "@/components/home/korean-last-night";
import { MyNews } from "@/components/my/my-news";
import { LeagueMini } from "@/components/home/league-mini";
import { NationalHome } from "@/components/national-team/national-team";
import { TonightSection } from "@/components/home/tonight";
import { NewsFilterContents } from "@/components/news/news-filter";
import { NewsSection } from "@/components/news/news-section";
import { OnboardingSlot } from "@/components/onboarding/onboarding-slot";
import { AppShell } from "@/components/shell/app-shell";
import { JsonLd } from "@/components/seo/json-ld";
import { TransferHotList } from "@/components/transfers/hot-list";
import { loadBriefSlot } from "@/lib/data/brief";
import {
  loadLeagueMini,
  loadTonightWidget,
  loadWidgetsSource,
} from "@/lib/data/home-widgets";
import { loadLatestIssue } from "@/lib/data/issue";
import { loadLastNight } from "@/lib/data/korean-players";
import { loadMyNewsCandidates } from "@/lib/data/my-page";
import { loadKoreanPlayers } from "@/lib/data/team-page";
import { loadNewsFilterView } from "@/lib/data/news-filter";
import { loadNationalHome, nationalNewsTags } from "@/lib/data/national-page";
import { loadTransferWindowState } from "@/lib/data/transfer-windows";
import { loadHotTransfers, loadTransfersFile } from "@/lib/data/transfers";
import { issueLateWindows, issueNumber } from "@/lib/issue";
import { MY_NEWS_HOME } from "@/lib/my-view";
import { routes } from "@/lib/paths";
import { pageMetadata, SITE_DESCRIPTION } from "@/lib/seo";
import { siteJsonLd } from "@/lib/structured-data";
import { transferWindowLine } from "@/lib/transfer-window-view";
import { cn } from "@/lib/utils";

/*
 * 홈 (PRD §4.2, plan M1-32·M1-33) — 빌드 때 최신 호를 읽어 앱 셸(티켓 마스트헤드·내비·뒤표지, M1-30) 안에 싣는다.
 *   0. 발행 지연 안내(M1-37 — 평소 숨김, 앱 셸 main 맨 앞): 지금이 오늘 공개 목표 + 15분 뒤인데 이 빌드의 최신 호가 오늘보다 앞이면 보인다.
 *   1. 오늘의 5줄(최상단 — PRD §15 D2) — 그 호 날짜의 브리핑 파일(data/briefs, D38). 경기 없는 날(mode empty)은 블록을 두고 높이만 줄이고
 *      (D30 S4), 이유 블록이 비시즌 → A매치 휴식기 → 경기 없음 순으로 바뀐다(S4 가족 — D3 #12, M5-17). 휴식기 변형의 "A매치 섹션으로 ↓"는
 *      아래 A매치 섹션(id="national")을 그린 빌드에서만 싣는다. 파일이 없는 호는 블록을 싣지 않되(D38 전 2026-10-12~14 — 사실 없는
 *      안내 금지), D38 뒤 호인데 그날 게시 실행 기록이 있으면 5줄 자리에 오류 상태(M1-37 — src/lib/brief-slot.ts). 필터와 무관하게 늘 맨 위다.
 *   2. 주요 뉴스 피드(M1-31 카드) — 5줄 아래 36px(≥1024 44px, DESIGN §4.3). id="news"는 S4 "주요 뉴스로 ↓"의 앵커.
 *      필터(M1-33 — 피드만 거른다): 1024 이상은 앱 셸 목차 열(대회·분류·한국 선수), 1023 이하는 부제 아래 분류 칩 줄. 주소 쿼리
 *      (`?comp=epl&cat=transfer`)와 같이 움직인다 — 혼합안 홈이 URL을 갱신하고 `/news/`와 같은 지면이라 홈도 공유·새로고침 때 유지한다.
 *   3. 오늘 밤 볼 경기(M2-14) → 리그 순위 미니(M2-15) — D1 확정 시안 화면 3(DESIGN §9.3). **위젯 두 자리**(DESIGN §11.4): 1279 이하는 지면 안
 *      피드 다음(`xl:hidden` — DECISIONS D0 §5 #16 순서 5줄 → 한국 선수 → 피드 → 오늘 밤 → 이적·순위), 1280 이상은 마주 보는 면(앱 셸 `facing`
 *      — 오늘 밤 → 순위). 같은 위젯을 두 번 그리고 `display`로 고른다(보조기술에는 한 번만 — 머리 id만 다르게).
 *      기준 시각 = 빌드 시각(오늘 밤 창은 빌드 시각의 KST 날짜 18:00 ~ 다음 날 07:00 — src/lib/tonight.ts). 두 위젯 아래 데이터 출처 줄
 *      하나(FR-45 — src/components/data-source.tsx, 갱신 시각 = 6개 대회 파일 중 가장 오래된 것, M2-16).
 *   4. 어젯밤 한국 선수(M3-11 — FR-58, DESIGN §9.3 D2 홈 위젯): 오늘의 5줄과 같은 경기일(발행일 − 1 UTC 하루)에 경기가 있던 등록 선수만,
 *      없으면 숨김. 1279 이하는 5줄 바로 아래(D0 #16), 1280 이상은 마주 보는 면 오늘 밤 다음(→ 순위). 같은 위젯을 두 번 그리고 `display`로 고른다.
 *   5. A매치(M3-13 — FR-71, DESIGN §9.3 D2 홈 위젯 A매치, PRD §4.2 순서 3): 빌드 시각의 KST 날짜가 A매치 기간(경기일 ±3일 —
 *      src/lib/national-team.ts)일 때만 — 그 기간 경기 · 소집 선수 · 대표팀 뉴스 행 3장. 위치는 모든 폭에서 지면 안 5줄 바로 아래(혼합안 화면 5 —
 *      내 팀 소식(M4) 다음 · 한국 선수 앞). 기간이 아니면 그리지 않는다(자리 없음). 매일 아침 발행 빌드가 판정을 다시 굳힌다.
 *   6. 이적 핫 리스트(M4-04 — PRD §4.2 7 · FR-104, DESIGN §9.3 D2 홈 위젯): 잠잠 제외 상위 5건(순위 규칙 src/lib/transfers-view.ts `hotTransfers`),
 *      실을 이적이 없으면 숨김. 평소 = 위젯 자리 맨 끝(1280 마주 보는 면 오늘 밤 → 한국 선수 → 순위 → 이적, 1279 이하 지면 안 같은 순서).
 *      **이적 창 모드**(FR-105 — 빌드 시각에 어느 리그든 창이 열려 있거나 마감 뒤 24시간, D68 ①): 위치만 위로 — 모든 폭에서 지면 안
 *      5줄 · A매치 바로 아래(한국 선수 · 피드 앞), 마주 보는 면에서는 뺀다(한 번만). 부제 앞에 창 상태("이적 창 열림 · 마감 D-n").
 *   7. 내 팀 소식(M4-08 — FR-112 · PRD §4.2 순서 2, DESIGN §9.3 D2 홈 위젯): 모든 폭에서 지면 안 5줄 바로 아래(A매치 앞). 팔로우는 브라우저에만 있어
 *      최신 호 후보 뉴스 행을 숨긴 채 싣고 첫 페인트 전 스크립트가 맞는 3장을 고른다(src/components/my/my-news.tsx) — 팔로우가 없거나 걸린 소식이
 *      없으면 섹션이 숨은 채라 자리가 생기지 않는다(CLS 0 — 숨은 섹션의 위 여백도 함께 숨는다).
 *   8. 첫 방문 온보딩 진입 줄(M4-09 — FR-113 · PRD §15 D64 ⑥, DESIGN §9.3 D2 "온보딩"): 5줄 바로 아래(내 팀 소식 앞) 한 줄 — 첫 방문 + 팔로우 0일 때만,
 *      모달 없음. 서버 HTML은 숨김이고 첫 페인트 전 스크립트가 연다(src/components/onboarding/onboarding-slot.tsx — 하이드레이션 뒤 펼침과의 CLS
 *      비교는 DECISIONS D2 §9). "시작"을 누르면 같은 자리에서 단계 목록으로 펼친다(단계 UI · 자료는 그때 받는다).
 * 1024~1279는 목차 + 지면 2단,
 * 1280 이상은 목차 + 지면(688) + 마주 보는 면(296) 3단이다(DESIGN §4.3).
 */

// 제목 = 서비스 이름 단독, 설명 = 사이트 기본 설명(매일 바뀌는 호 정보는 넣지 않는다 — 날짜 페이지가 맡는다), canonical = 홈 자신(M1-38)
export const metadata: Metadata = pageMetadata({
  title: null,
  description: SITE_DESCRIPTION,
  canonical: routes.home(),
});

const NEWS_HEADING_ID = "news-h";
/** 홈 A매치 섹션 앵커 — 5줄 A매치 휴식기 변형의 "A매치 섹션으로 ↓"(M5-17) */
const NATIONAL_ID = "national";

export default function HomePage() {
  const { news, issue } = loadLatestIssue();
  const slot = issue ? loadBriefSlot(issue.date) : null;
  const filter = loadNewsFilterView(news);
  const tonight = loadTonightWidget();
  const league = loadLeagueMini();
  const source = loadWidgetsSource();
  const lastNight = loadLastNight(issue?.date ?? null);
  const national = loadNationalHome(new Date());
  const hasBrief = slot !== null && slot.kind !== "none";
  // 이적 핫 리스트(M4-04) · 이적 창 모드(FR-105 — 빌드 시각 기준)
  const hot = loadHotTransfers();
  const transferTotal = loadTransfersFile()?.length ?? 0;
  const windowState = loadTransferWindowState(new Date());
  const windowLine =
    windowState?.active === true ? transferWindowLine(windowState) : null;
  const hotTop = hot.length > 0 && windowLine !== null;
  const hotList = (where: "top" | "flow" | "facing", className?: string) => (
    <TransferHotList
      items={hot}
      total={transferTotal}
      windowLine={windowLine}
      headingId={`transfer-hot-${where}-h`}
      className={className}
    />
  );
  const korean = (where: "flow" | "facing", className: string) =>
    lastNight ? (
      <KoreanLastNight
        view={lastNight}
        issueNo={issue ? issueNumber(issue.date) : null}
        total={loadKoreanPlayers().length}
        headingId={`last-night-${where}-h`}
        className={className}
      />
    ) : null;
  const widgets = (where: "flow" | "facing") => (
    <>
      <TonightSection
        widget={tonight}
        headingId={`tonight-${where}-h`}
        className={where === "flow" ? "mt-9 lg:mt-11" : undefined}
      />
      {/* 1280 마주 보는 면 — 오늘 밤 → 한국 선수 → 순위(DESIGN §9.3 D2 홈 위젯). 1279 이하는 5줄 바로 아래(D0 #16 흐름) */}
      {where === "facing" ? korean("facing", "mt-9") : null}
      <LeagueMini
        panels={league}
        headingId={`league-mini-${where}-h`}
        className="mt-9"
      />
      {/* 이적 핫 리스트 — 평소 자리(순위 다음). 이적 창 모드면 지면 위로 옮겨 여기서는 뺀다 */}
      {hot.length > 0 && !hotTop ? hotList(where, "mt-9") : null}
      {/* 위젯의 데이터 출처(FR-45 — 6개 대회 파일 중 가장 오래된 갱신 시각, M2-16 · 한국 선수 출전·결과는 API-Football — M3-11) */}
      <DataSourceNote
        source={source}
        covers="일정·순위"
        apiFootball={lastNight ? "한국 선수 출전·결과" : null}
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
      facingLabel={
        hot.length > 0 && !hotTop
          ? "오늘 밤 경기·리그 순위·이적"
          : "오늘 밤 경기·리그 순위"
      }
    >
      {slot?.kind === "brief" ? (
        <TodayBrief
          brief={slot.brief}
          nationalHref={national ? `#${NATIONAL_ID}` : undefined}
        />
      ) : null}
      {slot?.kind === "missing" ? <BriefMissing /> : null}
      {/* 첫 방문 온보딩 진입 줄(M4-09 — FR-113 · D64 ⑥): 첫 방문 + 팔로우 0일 때만 5줄 바로 아래 한 줄(첫 페인트 전 스크립트). 팔로우 0이면 아래
          '내 팀 소식'은 숨으므로 둘은 함께 보이지 않는다 — 온보딩에서 팀 · 선수를 고르면 그 자리 아래에 내 팀 소식이 나타난다 */}
      <OnboardingSlot className={hasBrief ? "mt-7" : "mb-9 lg:mb-11"} />
      {/* 내 팀 소식(M4-08 — FR-112): 팔로우가 있고 오늘 호에 걸린 소식이 있을 때만 보인다(첫 페인트 전 스크립트 — PRD §4.2 순서 2) */}
      <MyNews
        candidates={loadMyNewsCandidates(news)}
        issueNo={issue ? issueNumber(issue.date) : null}
        limit={MY_NEWS_HOME}
        variant="home"
        headingId="home-my-news-h"
        className={hasBrief ? "mt-9 lg:mt-11" : undefined}
      />
      {/* A매치 기간에만(FR-71) — 모든 폭에서 5줄 바로 아래(PRD §4.2 순서 3) */}
      {national ? (
        <NationalHome
          data={national}
          id={NATIONAL_ID}
          headingId="home-national-h"
          tagsOf={nationalNewsTags()}
          className={cn("scroll-mt-4", hasBrief && "mt-9 lg:mt-11")}
        />
      ) : null}
      {/* 이적 창 모드(FR-105) — 모든 폭에서 5줄 · A매치 바로 아래 이적 핫 리스트 */}
      {hotTop
        ? hotList("top", hasBrief || national ? "mt-9 lg:mt-11" : undefined)
        : null}
      {/* 1279 이하 — 5줄 바로 아래 어젯밤 한국 선수(D0 #16 흐름 5줄 → 한국 선수 → 피드, M3-11). 1280 이상은 마주 보는 면 */}
      {lastNight ? (
        <div data-slot="home-korean-flow" className="xl:hidden">
          {korean(
            "flow",
            hasBrief || national || hotTop ? "mt-9 lg:mt-11" : "",
          )}
        </div>
      ) : null}
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
          (hasBrief || national || hotTop || lastNight) && "mt-9 lg:mt-11",
          // 1280 이상은 한국 선수 위젯이 마주 보는 면에 있어 5줄 · A매치 · (창 모드) 이적 바로 아래가 피드다(모두 없으면 위 여백 없음)
          lastNight && !(hasBrief || national || hotTop) && "xl:mt-0",
        )}
      />
      {/* 1279 이하 — 지면 안 피드 다음(1280 이상은 마주 보는 면) */}
      <div data-slot="home-widgets" className="xl:hidden">
        {widgets("flow")}
      </div>
      {/* 구조화 데이터(NFR-03 — M5-03): 사이트 전역 WebSite + Organization은 홈에만(검색 potentialAction 없음 — src/lib/structured-data.ts) */}
      <JsonLd data={siteJsonLd()} />
    </AppShell>
  );
}
