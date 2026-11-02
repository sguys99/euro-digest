import type { Metadata } from "next";
import Link from "next/link";

import { DataSourceNote } from "@/components/data-source";
import {
  RosterContents,
  RosterTable,
} from "@/components/korean-players/roster";
import { AppShell } from "@/components/shell/app-shell";
import { ChevronRightIcon } from "@/components/ui/icons";
import { RunningHead } from "@/components/ui/section-head";
import { loadLatestIssue } from "@/lib/data/issue";
import { loadRosterSource, loadRosterView } from "@/lib/data/korean-players";
import { loadNationalTeamConfig } from "@/lib/data/national-team";
import { loadTransfersFile } from "@/lib/data/transfers";
import { listWeeklyWeeks } from "@/lib/data/weekly-report";
import { latestSquad, squadLabel } from "@/lib/national-team-view";
import { routes } from "@/lib/paths";
import { koreanPlayersDescription, pageMetadata } from "@/lib/seo";
import { formatKst } from "@/lib/time";
import { weekName } from "@/lib/weekly-report-view";

/*
 * `/korean-players/` 한국 선수 목록 (PRD FR-61·FR-64·FR-65, DESIGN §9.3 "D2 — 한국 선수·이적·마이 팀 화면" 선수 명단 행, DECISIONS D2 §4 A,
 * plan M3-09). 확정 시안 `docs/design/d2/concept-mix.html` 화면 1 목록 — 쪽 머리(키커 · 러닝 헤드 · h1 · 집계 시작일 부제) → 리그 구간 명단 표
 * (1023 이하 보기 탭) → 범례 → 데이터 출처 줄. 1024 이상 왼쪽 목차 = 리그별 구간 앵커.
 * - 읽는 것: `configs/korean-players.json`(명단·이름·포지션·소속) + `data/players/korean.json`(파생 현황 — 원장은 읽지 않는다, D33).
 * - 상태 4종(M1-37 관례): 로딩 — 정적 페이지라 없음 · 빈 상태 — 현황 파일 전이면 모든 선수 '기록 연결 전'(명단은 설정에서) · 오류 — 깨진
 *   파일은 빌드 실패(로더가 던진다 — 틀린 화면을 배포하지 않는다) · 오프라인 — 앱 셸 띠.
 * - 시각은 KST(src/lib/time.ts). 선수 이름은 상세(`/korean-players/{slug}/` — M3-10) 링크.
 */

const HEADING_ID = "kp-h";

export function generateMetadata(): Metadata {
  const view = loadRosterView();
  return pageMetadata({
    title: "한국 선수",
    description: koreanPlayersDescription(view.sinceLabel),
    canonical: routes.koreanPlayers(),
  });
}

export default function KoreanPlayersPage() {
  const view = loadRosterView();
  const { issue } = loadLatestIssue();
  const source = loadRosterSource(view);
  // 주간 리포트 진입(M3-12) — 1024 이상 목차 행 · 1023 이하 머리 아래 한 줄. 최신 주차가 없으면 색인(빈 상태)으로
  const latestWeek = listWeeklyWeeks().at(-1) ?? null;
  const weekly = { latest: latestWeek ? weekName(latestWeek).short : null };
  // 대표팀 진입(M3-13) — 같은 두 자리. `/national-team/`은 설정 유무와 관계없이 늘 생긴다 — 값은 최신 소집 명단 이름(없으면 null)
  const config = loadNationalTeamConfig();
  const squad = config ? latestSquad(config) : null;
  const national = { label: squad ? squadLabel(squad) : null };
  // 이적 진입(M4-04) — 같은 두 자리. `/transfers/`는 늘 생긴다(빈 상태 포함) — 값은 원장 건수
  const transfers = { count: loadTransfersFile()?.length ?? 0 };
  return (
    <AppShell
      current="korean"
      issue={issue}
      contents={
        view.groups.length > 0 ? (
          <RosterContents
            view={view}
            weekly={weekly}
            national={national}
            transfers={transfers}
          />
        ) : undefined
      }
      contentsLabel="한국 선수 목차"
    >
      <section aria-labelledby={HEADING_ID} data-slot="korean-players-page">
        <header className="grid gap-1.5 pt-1.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
            <span>
              등록 <span className="tabular-nums">{view.counts.total}</span> ·
              기록 연결{" "}
              <span className="tabular-nums">{view.counts.linked}</span>
            </span>
            <RunningHead className="ml-auto">SQUAD REGISTER</RunningHead>
          </p>
          <h1
            id={HEADING_ID}
            className="text-[32px] leading-[1.1] font-extrabold tracking-[-0.04em] lg:text-5xl"
          >
            한국 선수
          </h1>
          {view.sinceLabel || view.generatedAt ? (
            <p className="text-[13px] leading-normal text-ink-2">
              {view.sinceLabel ? (
                <b className="font-extrabold text-ink">{view.sinceLabel}</b>
              ) : null}
              {view.sinceLabel && view.generatedAt ? " · " : null}
              {view.generatedAt ? (
                <>
                  업데이트{" "}
                  <time dateTime={view.generatedAt} className="tabular-nums">
                    {formatKst(view.generatedAt, "short")}
                  </time>{" "}
                  KST
                </>
              ) : null}
            </p>
          ) : null}
          <p className="flex flex-wrap gap-x-5 lg:hidden">
            <Link
              href={routes.weeklyReport()}
              data-slot="korean-players-weekly-link"
              className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              주간 리포트
              {weekly.latest ? (
                <span className="font-numeric tabular-nums">
                  {weekly.latest}
                </span>
              ) : null}
              <ChevronRightIcon size={16} />
            </Link>
            <Link
              href={routes.nationalTeam()}
              data-slot="korean-players-national-link"
              className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              대표팀
              {national.label ? (
                <span className="font-normal">{national.label}</span>
              ) : null}
              <ChevronRightIcon size={16} />
            </Link>
            <Link
              href={routes.transfers()}
              data-slot="korean-players-transfers-link"
              className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              이적
              <span className="font-numeric font-normal tabular-nums">
                {transfers.count}
              </span>
              <span className="sr-only">건</span>
              <ChevronRightIcon size={16} />
            </Link>
          </p>
        </header>
        {view.groups.length > 0 ? (
          <RosterTable view={view} headingId={HEADING_ID} />
        ) : (
          <div data-slot="korean-players-empty" className="mt-6 pt-1 pb-2">
            <p className="text-[15px] font-extrabold">
              아직 등록된 한국 선수가 없어요.
            </p>
            <p className="mt-2 text-[13.5px] text-ink-2">
              명단이 정해지면 리그별로 이곳에 실립니다.
            </p>
          </div>
        )}
        <DataSourceNote
          source={source}
          covers="다음 경기 일정"
          apiFootball="출전·분·골·도움"
          scope="korean-players"
          className="mt-3.5"
        />
      </section>
    </AppShell>
  );
}
