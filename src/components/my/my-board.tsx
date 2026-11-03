"use client";

import Link from "next/link";
import { lazy, Suspense, useEffect, type ReactNode } from "react";

import { ChevronRightIcon } from "@/components/ui/icons";
import { cx } from "@/lib/cx";
import { FOLLOW_LIMITS, isFollowEmpty } from "@/lib/follow";
import {
  MY_FIXTURES_SHOWN,
  MY_RESULTS_SHOWN,
  mergeFixtures,
  mergeResults,
} from "@/lib/my-view";
import { routes } from "@/lib/paths";
import { useFollows } from "@/lib/use-follows";

import { directoryWhenReady, useMyData } from "./use-my-data";

/*
 * 목록 그리기(입장권 · 일정 행 · 결과 행 — fixture-ticket · player-marks · 결과 칸)는 지연 청크(./my-board-lists — M4-16 번들 절감,
 * `/my` 초기 JS −약 6KB). 자료 파일은 어차피 하이드레이션 뒤 받으므로, 팔로우가 있으면 받기와 **같은 때** 청크도 받기 시작해 그리는 시각은
 * 그대로다(둘 다 올 때까지 교정쇄). 청크는 서비스 워커가 `_next/static/**` 전부를 프리캐시하므로 오프라인에서도 열린다.
 * 받기 실패(배포 교체 중 옛 청크 등)는 페이지를 깨뜨리지 않고 구역마다 안내 줄로.
 */
let listsModule: Promise<typeof import("./my-board-lists") | null> | null =
  null;
function loadLists() {
  listsModule ??= import("./my-board-lists").catch(() => null);
  return listsModule;
}
const LazyFixtures = lazy(() =>
  loadLists().then((m) => ({ default: m?.MyFixtures ?? ListsFailed })),
);
const LazyResults = lazy(() =>
  loadLists().then((m) => ({ default: m?.MyResults ?? ListsFailed })),
);
function ListsFailed() {
  return <NoneLine>목록을 그리지 못했어요 — 새로고침해 주세요</NoneLine>;
}

/**
 * `/my` 다음 경기 · 최근 결과 (PRD FR-111, DESIGN §9.3 D2 "`/my` 틀" · "다음 경기 입장권" · "결과 칸 · 스코어 맥락", 혼합안 화면 4, plan M4-08)
 *
 * 클라이언트 섬. 팔로우(브라우저 저장소)로 팀·선수 자료 파일을 받아(src/components/my/use-my-data.ts) 합친다(src/lib/my-view.ts).
 * - **다음 경기**: 경기 id로 합친 줄(걸린 팔로우 이름 — 팔로우 순서) · 첫 경기 = 입장권 가로형(B), 나머지 = 일정 행. 처음 5줄, "모두 보기"로 나머지.
 * - **최근 결과**: 선수·팀 기준 행(D64 ③ — `[W/D/L] 기준 팀 득점-상대 · 홈/원정`, 선수 행은 골 · 도움 배지). 결과 값은 `data-slot="result-value"`
 *   (결과 가리기 M4-15가 이 묶음만 가리고 결과 가림 칸 "보기" — 이름 "{선수 }{M.DD} {상대}전 결과 보기", 펼치기는 스위치 섬의 위임 — FR-37).
 * - 1280 이상 = 다음 경기 · 최근 결과 2단(1.15fr · 1fr, 간격 40px — 혼합안), 그 아래는 쌓기.
 * - **상태 4종**: 하이드레이션 전 · 받는 중 = 움직이지 않는 교정쇄(`aria-busy`) · 팔로우 0 = 빈 상태(윤곽 '0' + 팔로우하는 곳 링크) ·
 *   받기 실패 = 안내 줄 + 다시 시도(오프라인이면 그 문구 — 앱 셸 오프라인 띠와 함께) · 자료 없음 = 구역마다 한 줄.
 * 구역 머리(섹션 머리 — 서버 컴포넌트)는 페이지가 넘긴다(`fixturesHead` · `resultsHead` — 섬 번들에 `cn`이 들어오지 않게).
 */
export function MyBoard({
  fixturesHead,
  resultsHead,
  fixturesHeadingId,
  resultsHeadingId,
}: {
  fixturesHead: ReactNode;
  resultsHead: ReactNode;
  fixturesHeadingId: string;
  resultsHeadingId: string;
}) {
  const { follows, ready } = useFollows();
  const dir = directoryWhenReady(ready);
  const data = useMyData(follows, ready, dir);
  const hasFollows = ready && !isFollowEmpty(follows);
  useEffect(() => {
    if (hasFollows) void loadLists();
  }, [hasFollows]);
  // 첫 페인트 전 표시(src/lib/my-empty-boot.ts `MY_EMPTY_ATTR`)는 하이드레이션 전 모양에만 쓴다 — 뒤로는 섬이 그리므로 지운다
  // (클라이언트 이동으로 다시 들어왔을 때 지난 값이 남지 않게. 부트 모듈을 import하면 스크립트 원문이 번들에 들어와 글자로 쓴다)
  useEffect(() => {
    if (ready) document.documentElement.removeAttribute("data-my-empty");
  }, [ready]);

  if (ready && isFollowEmpty(follows)) return <MyEmpty />;

  const loading = !ready || !data.settled;
  const fixtures = loading ? [] : mergeFixtures(data.entries);
  const results = loading ? [] : mergeResults(data.entries);

  const board = (
    <div
      data-slot="my-board"
      aria-busy={loading || undefined}
      className={cx(
        "mt-9 grid gap-9 lg:mt-11 lg:gap-11 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:items-start xl:gap-x-10",
        !ready && "my-empty:hidden",
      )}
    >
      {!loading && data.failed > 0 ? (
        <FetchNotice failed={data.failed} retry={data.retry} />
      ) : null}
      <section aria-labelledby={fixturesHeadingId} data-slot="my-fixtures">
        {fixturesHead}
        <p className="mt-0.75 text-[13px] leading-normal text-ink-2">
          KST · 홈 팀 먼저 · 팔로우가 겹치는 경기는 한 번만
        </p>
        {loading ? (
          <FixturesSkeleton />
        ) : fixtures.length > 0 ? (
          <Suspense fallback={<FixturesSkeleton />}>
            <LazyFixtures fixtures={fixtures} headingId={fixturesHeadingId} />
          </Suspense>
        ) : (
          <NoneLine>예정된 경기 자료가 없어요</NoneLine>
        )}
      </section>
      <section aria-labelledby={resultsHeadingId} data-slot="my-results">
        {resultsHead}
        <p className="mt-0.75 text-[13px] leading-normal text-ink-2">
          팔로우 기준 — 결과는 기준 팀 득점 먼저
        </p>
        {loading ? (
          <RowsSkeleton rows={MY_RESULTS_SHOWN} />
        ) : results.length > 0 ? (
          <Suspense fallback={<RowsSkeleton rows={MY_RESULTS_SHOWN} />}>
            <LazyResults results={results} />
          </Suspense>
        ) : (
          <NoneLine>최근 결과 자료가 없어요</NoneLine>
        )}
      </section>
    </div>
  );
  if (ready) return board;
  // 하이드레이션 전 — 교정쇄 + 숨긴 빈 상태. 첫 페인트 전 스크립트가 팔로우 0을 알리면(`<html data-my-empty>`) 빈 상태를 보이고 교정쇄를
  // 숨긴다(src/lib/my-empty-boot.ts). 하이드레이션 뒤 섬이 같은 빈 상태를 그려 이동이 없다(M4-16 — 전에는 375 첫 로드 CLS 0.27)
  return (
    <>
      {board}
      <div className="hidden my-empty:block">
        <MyEmpty />
      </div>
    </>
  );
}

function NoneLine({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 border-t border-rule pt-3 text-[13.5px] leading-normal text-ink-2">
      {children}
    </p>
  );
}

/** 받기 실패 안내 — 2단(1280 이상)에서는 두 칸에 걸친다 */
function FetchNotice({ failed, retry }: { failed: number; retry: () => void }) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <p
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-paper-2 px-3 py-2 text-[13px] leading-[1.45] text-ink-2 shadow-[inset_4px_0_0_var(--brand-accent)] xl:col-span-2"
    >
      <span>
        {offline
          ? "오프라인이라 팀·선수 자료를 받지 못했어요."
          : `팀·선수 자료 ${failed}개를 받지 못했어요.`}
      </span>
      <button
        type="button"
        onClick={retry}
        className="inline-flex min-h-11 items-center bg-transparent text-[13px] font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
      >
        다시 시도
      </button>
    </p>
  );
}

/** 교정쇄(움직이지 않음 — DESIGN §9.2 Skeleton) — 입장권 + 일정 행 */
function FixturesSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mt-2.5 grid h-33 grid-cols-[104px_minmax(0,1fr)] gap-4 border-[1.5px] border-rule p-3.5 lg:grid-cols-[150px_minmax(0,1fr)]">
        <div className="bg-paper-3" />
        <div className="grid content-start gap-2.5">
          <div className="h-3.5 w-1/3 bg-paper-3" />
          <div className="h-5 w-2/3 bg-paper-3" />
          <div className="h-5 w-3/5 bg-paper-3" />
        </div>
      </div>
      <RowsSkeleton rows={MY_FIXTURES_SHOWN - 1} tall />
    </div>
  );
}

function RowsSkeleton({
  rows,
  tall = false,
}: {
  rows: number;
  tall?: boolean;
}) {
  return (
    <div aria-hidden="true" className="mt-2 border-t border-rule">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={cx(
            "grid grid-cols-[var(--gutter-date)_minmax(0,1fr)] gap-x-2.5 border-b border-rule py-2.75",
            tall ? "h-23" : "h-16",
          )}
        >
          <div className="h-5 w-10 bg-paper-3" />
          <div className="grid content-start gap-2">
            <div className="h-3.5 w-2/5 bg-paper-3" />
            <div className="h-4 w-3/5 bg-paper-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 팔로우 0 — 윤곽 '0' + 안내 + 팔로우하는 곳(DESIGN §9.3 상태 화면 ② 문법) */
function MyEmpty() {
  return (
    <div
      data-slot="my-empty"
      className="mt-9 grid grid-cols-[var(--gutter-date)_minmax(0,1fr)] gap-x-2.5 border-t border-ink pt-4 pb-3.5 lg:mt-11 lg:gap-x-3.5"
    >
      <span
        aria-hidden="true"
        className="font-numeric text-num-n3 leading-[0.9] font-extrabold text-transparent tabular-nums [-webkit-text-stroke:1.5px_var(--ink-2)]"
      >
        0
      </span>
      <div className="text-sm leading-normal text-ink-2">
        <p className="text-[15px] font-extrabold text-ink">
          아직 팔로우한 팀·선수가 없어요
        </p>
        <p className="mt-1 max-w-measure">
          팀 화면이나 한국 선수 화면에서 ‘팔로우’를 누르면 다음 경기 · 최근 결과
          · 오늘 호의 소식이 여기 모여요. 팀{" "}
          <span className="font-numeric tabular-nums">
            {FOLLOW_LIMITS.teams}
          </span>
          개 · 선수{" "}
          <span className="font-numeric tabular-nums">
            {FOLLOW_LIMITS.players}
          </span>
          명까지, 이 기기에만 저장돼요.
        </p>
        <p className="mt-1 flex flex-wrap gap-x-5">
          <Link
            href={routes.koreanPlayers()}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            한국 선수에서 고르기
            <ChevronRightIcon size={18} />
          </Link>
          <Link
            href={routes.competition("EPL")}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            리그 순위에서 팀 고르기
            <ChevronRightIcon size={18} />
          </Link>
        </p>
      </div>
    </div>
  );
}
