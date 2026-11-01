import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  BoxScore,
  MvpScore,
  RunnersUp,
  WeeklyContents,
  WeeklyHead,
  WeeklySourceNote,
  WeeklySummary,
} from "@/components/korean-players/weekly-report";
import { AppShell } from "@/components/shell/app-shell";
import { loadLatestIssue } from "@/lib/data/issue";
import {
  FIRST_WEEKLY_WEEK,
  listWeeklyWeeks,
  loadWeeklyPage,
  loadWeeklyReport,
} from "@/lib/data/weekly-report";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/paths";
import { pageMetadata, weeklyReportDescription } from "@/lib/seo";
import { weekName, weekRangeView } from "@/lib/weekly-report-view";

/*
 * `/korean-players/weekly/[week]/` 한국 선수 주간 리포트 한 주 (PRD FR-90~93 · §15 D64 · D65, DESIGN §9.3 D2 주간 지면 틀 · 화면별 배치
 * "주간 리포트", DECISIONS D2 §4 C · §8, plan M3-12). 확정 시안 `docs/design/d2/concept-mix.html` 화면 2.
 * - 정적 export: `generateStaticParams` = `data/players/weekly`의 발행된 주차 전부(`dynamicParams = false`). 발행된 주가 하나도 없으면(새 클론 ·
 *   첫 발행 전) 자리 주차 하나를 둔다 — `output: "export"`는 빈 배열을 "generateStaticParams 없음"으로 보고 빌드를 멈춘다. 그 페이지는
 *   파일이 없어 not-found를 그린다(뉴스 날짜 아카이브와 같은 방법).
 * - **DOM 순서 = 1279 이하 순서**: 머리 → MVP 점수 → 총평 → 출전 기록 → 다음 순위 → 출처 줄(DESIGN §9.3 화면별 배치). `display: contents` ·
 *   `order` 없음. 1280 이상 grid 2열 — 머리는 두 열, MVP 점수(2행) · 다음 순위(3행)는 옆단 열, 총평 · 표는 지면 열 2~3행, 출처 줄은 4행.
 * - 1024 이상 왼쪽 목차 = 주간 리포트 아카이브(최신 주 먼저 · 발행 예정 주 · 지금 주 표시).
 * - 상태: 로딩 — 정적이라 없음 · 빈 상태 — 색인 페이지(`/korean-players/weekly/`) · 오류 — 깨진 파일은 빌드 실패(로더가 던진다) · 오프라인 — 셸 띠.
 * - 시각은 KST(src/lib/time.ts), 기간은 경기일 기준 UTC 날짜(D65 ①).
 */

export const dynamicParams = false;

export function generateStaticParams(): { week: string }[] {
  const weeks = listWeeklyWeeks();
  return (weeks.length > 0 ? weeks : [FIRST_WEEKLY_WEEK]).map((week) => ({
    week,
  }));
}

/**
 * 메타: 제목 "주간 리포트 2026년 43주 — 한국 선수", 설명 = 기간 · 실린 것(출전 · 결과 수치 · MVP 이름 없음 — 결과 노출 0, 다른 한국 선수 화면과
 * 같은 규칙). canonical = 이 주 페이지 자신.
 */
export async function generateMetadata({
  params,
}: PageProps<"/korean-players/weekly/[week]">): Promise<Metadata> {
  const { week } = await params;
  const report = loadWeeklyReport(week);
  if (!report) return {};
  const name = weekName(week);
  const range = weekRangeView(report);
  return pageMetadata({
    title: `주간 리포트 ${name.long} — 한국 선수`,
    description: weeklyReportDescription(
      name.long,
      `${range.fromLabel} ~ ${range.toLabel}`,
    ),
    canonical: routes.weeklyReportArchive(week),
  });
}

const HEADING_ID = "wk-h";

/** 1280 이상 두 열 — 옆단 열 `--col-facing`(296px — 왼쪽 1px 괘선 + 안쪽 32px 포함), 지면 오른쪽 32px. 3행 = 남는 높이(다음 순위 칸이 늘어 괘선을 끝까지 잇는다), 4행 = 출처 줄(지면 열) */
const GRID =
  "xl:grid xl:grid-cols-[minmax(0,1fr)_var(--col-facing)] xl:grid-rows-[auto_auto_1fr_auto]";
const MAIN = "xl:col-start-1 xl:row-span-2 xl:row-start-2 xl:pr-8";
const SIDE = "xl:col-start-2 xl:min-w-0 xl:border-l xl:border-ink xl:pl-8";

export default async function WeeklyReportPage({
  params,
}: PageProps<"/korean-players/weekly/[week]">) {
  const { week } = await params;
  const page = loadWeeklyPage(week, new Date());
  if (!page) notFound();
  const { issue } = loadLatestIssue();
  const { view } = page;
  const hasRunnersUp = view.mvp !== null && view.runnersUp.length > 0;

  return (
    <AppShell
      current="korean"
      currentKind="section"
      issue={issue}
      contents={
        <WeeklyContents
          index={page.index}
          current={week}
          upcoming={page.upcoming}
        />
      }
      contentsLabel="주간 리포트 목차"
    >
      <article
        aria-labelledby={HEADING_ID}
        data-slot="weekly-page"
        data-week={week}
        className={GRID}
      >
        <div className="xl:col-span-2 xl:row-start-1">
          <WeeklyHead view={view} headingId={HEADING_ID} />
        </div>
        {view.score ? (
          <div
            className={cx(
              "mt-4 lg:mt-7 xl:row-start-2 xl:mt-9 xl:pb-8",
              SIDE,
              !hasRunnersUp && "xl:row-span-2",
            )}
          >
            <MvpScore score={view.score} headingId="wk-pt-h" />
          </div>
        ) : null}
        <div
          className={cx(
            "mt-8 lg:mt-11 xl:mt-9",
            view.score || hasRunnersUp ? MAIN : "xl:col-span-2 xl:row-start-2",
          )}
        >
          <WeeklySummary
            summary={view.summary}
            generatedAt={view.generatedAt}
            headingId="wk-sum-h"
          />
          <div className="mt-9 lg:mt-11">
            <BoxScore view={view} headingId="wk-tb-h" />
          </div>
        </div>
        {hasRunnersUp ? (
          <div className={cx("mt-9 lg:mt-11 xl:row-start-3 xl:mt-0", SIDE)}>
            <RunnersUp rows={view.runnersUp} headingId="wk-ru-h" />
          </div>
        ) : null}
        <WeeklySourceNote
          ai={view.summary.ai}
          className="mt-9 lg:mt-11 xl:col-start-1 xl:row-start-4 xl:mt-3.5 xl:pr-8"
        />
      </article>
    </AppShell>
  );
}
