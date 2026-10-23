import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TodayBrief } from "@/components/brief/today-brief";
import { counterfoilSlots } from "@/components/news/counterfoil";
import { NewsFilterContents } from "@/components/news/news-filter";
import { NewsSection } from "@/components/news/news-section";
import { AppShell } from "@/components/shell/app-shell";
import { loadBrief } from "@/lib/data/brief";
import {
  listIssueDates,
  loadArchiveView,
  loadIssue,
  loadLatestIssue,
} from "@/lib/data/issue";
import { loadNewsFilterView } from "@/lib/data/news-filter";
import { archiveHeading, archiveTitle } from "@/lib/news/archive";
import { absoluteUrl, routes } from "@/lib/paths";
import { FIRST_ISSUE_DATE } from "@/lib/site";
import { cn } from "@/lib/utils";

/*
 * `/news/YYYY-MM-DD/` 날짜 아카이브 (PRD §4 IA·FR-33·FR-34, plan M1-34, 시안 A "스텁 넘김" `docs/design/m1-archive/concept-a.html` — 2026-10-23
 * 사용자 선택, DECISIONS "M1-34 아카이브 날짜 이동") — 발행된 호 하나를 그 호의 지면(이날의 5줄 + 뉴스)으로 싣는다.
 *
 * - 정적 export: `generateStaticParams`가 `data/news` 일별 파일의 발행일을 모두 만들고(`dynamicParams = false`), 그 밖의 날짜는
 *   페이지가 없어 GitHub Pages가 404.html을 404로 준다(결호 10-15·16·19 포함). 경로·basePath·끝 슬래시는 `routes.newsArchive`.
 * - 셸: 티켓은 **그 호**(제 N호·발행일·발행/업데이트 — `loadIssue(date)`) + 꼬리표(이전 호 · 달력 · 다음 호 — `archive`, 결호 건너뜀). 상단 내비·
 *   뒤표지 "마지막 업데이트"는 **사이트 기준**(최신 호의 업데이트 — FR-142, 2026-10-23 오케스트레이터 결정 — 다른 날이면 날짜를 붙인다).
 *   현재 탭은 뉴스 — 이 페이지가 `/news/` 자신은 아니라 섹션 표시(`aria-current="true"`, `/news/`에서만 `"page"`).
 * - 지면(시안 A): 화면 밖 h1 "제 9호 · 2026년 10월 20일 (화) 지면" → **이날의 5줄**(h2 — 그 호의 브리핑 파일, 없으면 블록 없음: M1-32 규칙,
 *   2026-10-23 사용자 결정) → 뉴스(h2 · 카드 h3 — 필터 M1-33: 목차·칩·주소 쿼리, 목차를 실으니 설정 JSON·부트도 함께). 카드
 *   `<article id="c_…">`가 공유 앵커다(FR-34 — `/news/{date}/#c_…`, 홈·`/news/`와 같은 저장된 ID). 7일 넘은 호 카드의 상대 시간은 그대로.
 * - canonical = 이 날짜 페이지 자신(영구 주소 — 공유 링크 FR-34가 가리키는 주소). `/news/`는 최신 호의 별칭이라 canonical을 최신 날짜
 *   페이지로 둔다(src/app/news/page.tsx).
 * - 공유 앵커(`#c_…`)와 필터 쿼리가 함께 와서 앵커 카드가 필터에 걸리면(M1-33 이월) 지금 규칙 그대로 **필터 우선**이다 — 공유 URL
 *   (`cardShareUrl`)에는 쿼리가 없고, 페이지 안 앵커(연결 줄)는 보이는 카드만 가리키므로(짝이 숨으면 줄도 숨음) 손으로 조합한 주소에서만 생긴다.
 */

export const dynamicParams = false;

/**
 * 발행된 호의 날짜 전부. 발행된 호가 하나도 없으면(새 클론 등 data/news가 빈 빌드) 창간일 한 칸을 둔다 — `output: "export"`는
 * 빈 배열을 "generateStaticParams 없음"으로 보고 빌드를 멈춘다. 그 페이지는 파일이 없어 not-found를 그린다.
 */
export function generateStaticParams(): { date: string }[] {
  const dates = listIssueDates();
  return (dates.length > 0 ? dates : [FIRST_ISSUE_DATE]).map((date) => ({
    date,
  }));
}

export async function generateMetadata({
  params,
}: PageProps<"/news/[date]">): Promise<Metadata> {
  const { date } = await params;
  // 발행된 호가 아니면(빈 data/news 빌드의 창간일 칸 — not-found) canonical을 두지 않는다
  if (!listIssueDates().includes(date)) return {};
  return {
    title: archiveTitle(date),
    alternates: { canonical: absoluteUrl(routes.newsArchive(date)) },
  };
}

export default async function NewsArchivePage({
  params,
}: PageProps<"/news/[date]">) {
  const { date } = await params;
  const { news, issue } = loadIssue(date);
  const archive = loadArchiveView(date);
  if (!news || !issue || !archive) notFound();
  const site = archive.isLatest ? issue : loadLatestIssue().issue;
  const brief = loadBrief(date);
  const filter = loadNewsFilterView(news);

  return (
    <AppShell
      current="news"
      currentKind="section"
      issue={issue}
      siteUpdatedAt={site?.updatedAt}
      counterfoil={counterfoilSlots(archive)}
      contents={filter ? <NewsFilterContents view={filter} /> : undefined}
    >
      <h1 className="sr-only">{archiveHeading(date)}</h1>
      {brief ? <TodayBrief brief={brief} variant="issue" /> : null}
      <NewsSection
        id="news"
        news={news}
        filter={filter}
        heading="뉴스"
        headingAs="h2"
        headingId="news-h"
        titleAs="h3"
        className={cn("scroll-mt-4", brief && "mt-9 lg:mt-11")}
      />
    </AppShell>
  );
}
