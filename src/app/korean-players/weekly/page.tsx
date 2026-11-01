import type { Metadata } from "next";
import Link from "next/link";

import {
  WeeklyArchiveList,
  WeeklyEmpty,
} from "@/components/korean-players/weekly-report";
import { AppShell } from "@/components/shell/app-shell";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { RunningHead } from "@/components/ui/section-head";
import { loadLatestIssue } from "@/lib/data/issue";
import { listWeeklyWeeks, loadWeeklyIndex } from "@/lib/data/weekly-report";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/paths";
import { WEEKLY_INDEX_DESCRIPTION, pageMetadata } from "@/lib/seo";
import { upcomingWeek } from "@/lib/weekly-report-view";

/*
 * `/korean-players/weekly/` 한국 선수 주간 리포트 색인 (PRD FR-90 · FR-93, DESIGN §9.3 D2 주간 지면 틀, plan M3-12)
 * - 쪽 머리(키커 · 러닝 헤드 · h1 32/48px · 발행 규칙 부제) → (발행 예정 줄) → 아카이브 목록(최신 주 먼저 — 주차 거터 · 기간(경기일 기준) ·
 *   MVP · 출전 수, 행 전체가 그 주 링크). 시안에 없는 화면이라 기존 문법만 쓴다(명단 · 로그 행 거터 · 괘선, 도장) — DECISIONS D2 §8.
 * - 빈 상태(발행된 주 0개): 사실만 — 첫 리포트가 월요일 아침에 나온다는 것과 기준.
 * - 서버 컴포넌트 — 섬 0. 기간은 경기일 기준 UTC 날짜(D65 ①), 시각은 KST(src/lib/time.ts).
 */

const HEADING_ID = "wki-h";

export function generateMetadata(): Metadata {
  return pageMetadata({
    title: "주간 리포트 — 한국 선수",
    description: WEEKLY_INDEX_DESCRIPTION,
    canonical: routes.weeklyReport(),
  });
}

const BACK =
  "-ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-sm font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2";

export default function WeeklyIndexPage() {
  const index = loadWeeklyIndex();
  const { issue } = loadLatestIssue();
  const upcoming = upcomingWeek(listWeeklyWeeks().at(-1) ?? null, new Date());
  return (
    <AppShell current="korean" currentKind="section" issue={issue}>
      <section aria-labelledby={HEADING_ID} data-slot="weekly-index">
        <p className="flex items-center justify-between gap-2 pt-1">
          <Link href={routes.koreanPlayers()} className={BACK}>
            <ChevronLeftIcon size={16} />
            한국 선수
          </Link>
          <RunningHead>WEEKLY ARCHIVE</RunningHead>
        </p>
        <header className="mt-1 grid gap-1.5">
          <h1
            id={HEADING_ID}
            className="text-[32px] leading-[1.1] font-extrabold tracking-[-0.04em] lg:text-5xl"
          >
            주간 리포트
          </h1>
          <p className="max-w-[46em] text-[13px] leading-normal text-ink-2">
            매주 월요일 아침, 지난 월~일(경기일 기준) 한국 선수의 출전 · 분 · 골
            · 도움을 모으고 이번 주 MVP(골×3 + 도움×2 + 출전)를 뽑아요.
          </p>
        </header>
        {upcoming && index.length > 0 ? (
          <p
            data-slot="weekly-upcoming"
            className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-b border-rule py-2.5 text-[13.5px] text-ink-2"
          >
            <b className="font-extrabold text-ink">다음 리포트</b>
            <span className="font-numeric font-extrabold text-ink tabular-nums">
              {upcoming.name.short}
            </span>
            <span>
              <span className="font-numeric text-[14px] font-semibold tabular-nums">
                {upcoming.label}
              </span>{" "}
              아침 발행 예정
            </span>
          </p>
        ) : null}
        {index.length > 0 ? (
          <div className={cx(upcoming ? "mt-7" : "mt-6", "lg:mt-9")}>
            <h2 id="wki-list-h" className="sr-only">
              지난 주간 리포트 {index.length}편 — 최신순
            </h2>
            <WeeklyArchiveList index={index} headingId="wki-list-h" />
          </div>
        ) : (
          <WeeklyEmpty />
        )}
      </section>
    </AppShell>
  );
}
