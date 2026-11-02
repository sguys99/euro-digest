import Link from "next/link";
import type { ReactNode } from "react";

import { Leader } from "@/components/about/leader";
import { FormChip, Score } from "@/components/competition/marks";
import {
  SpoilerCellButton,
  SpoilerFlap,
} from "@/components/spoiler/spoiler-parts";
import { TeamBadge } from "@/components/team/team-badge";
import { AiLabel } from "@/components/ui/ai-label";
import { StampChip } from "@/components/ui/chip";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { RunningHead, SectionHead } from "@/components/ui/section-head";
import { FORM_WORD } from "@/lib/competition-view";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/paths";
import { formatKst, formatUtcDayShort } from "@/lib/time";
import type {
  EvidenceView,
  MvpView,
  WeekRangeView,
  WeekStepView,
  WeeklyIndexEntry,
  WeeklyMatchView,
  WeeklyReportView,
  WeeklyRowView,
  WeeklyUpcomingView,
} from "@/lib/weekly-report-view";

import { OpponentName, PlayerLink } from "./player-marks";

/**
 * 한국 선수 주간 리포트 — C 주간 지면 + B 90분 막대 (PRD FR-90~93, D64 ③④⑥, D65 ①~③, DESIGN §9.3 D2 주간 지면 틀 · 주간 MVP 머리기사 ·
 * MVP 점수 · 출전 기록 박스 · 90분 막대 · 문단 블록 · AI 라벨 · 숫자 상태 규칙, DECISIONS D2 §4 C · §6 #13, plan M3-12)
 *
 * 확정 시안 `docs/design/d2/concept-mix.html` 화면 2. 서버 컴포넌트 — JS 0(섬 없음).
 * - **DOM 순서 = 1279 이하 순서**: 머리(키커 · 주 넘기기 · MVP) → MVP 점수 → 총평 → 출전 기록 표 → 다음 순위 → 출처 줄. `display: contents` ·
 *   `order` 없음. 1280 이상은 grid 2열(`1fr · --col-facing`) — 머리는 두 열에 걸치고, MVP 점수(2행) · 다음 순위(3행)가 옆단, 총평 · 표는
 *   2~3행에 걸친다(옆단 왼쪽 1px `--ink` 괘선은 두 칸의 왼쪽 테두리를 이어 그린다).
 * - **시각 위계 예외**(DECISIONS D2 §6 #13): 큰 한글 제목(`--text-hed-xl`)과 반전 머리 박스(`--ink` 면 머리 띠)는 이 화면에만.
 * - **결과 칸**(D64 ④): MVP 근거 줄의 골 분 · W/D/L · 스코어는 `data-slot="result-value"` 한 묶음 — 결과 가리기(M4-15)가 함께 가리고
 *   홈/원정 · 출전 글자는 남는다. 표의 골 · 도움 열은 집계값이라 가리지 않는다.
 */

/** 숫자 Barlow + tabular-nums */
const NUM = "font-numeric tabular-nums";

/** 주차 · 기간 한 줄 — "W43 · 10.19 ~ 10.25" 같은 짧은 표기(목차) */
function shortRange(range: WeekRangeView): string {
  return `${range.fromLabel.slice(0, 5)} ~ ${range.toLabel.slice(0, 5)}`;
}

// ─── 목차(1024 이상 왼쪽) · 아카이브 ────────────────────────────────────────

/**
 * 1024 이상 왼쪽 목차 — 주간 리포트 아카이브(최신 주 먼저). 발행 예정 주(빌드 날짜 이후 예정일만)는 꺼진 줄, 지금 주는 `aria-current`
 * (선수 상세 명단 목차와 같은 모양 — `--paper-2` 면 + 왼쪽 4px `--brand-accent`). 숫자 = 출전 선수 수.
 */
export function WeeklyContents({
  index,
  current,
  upcoming,
}: {
  index: readonly WeeklyIndexEntry[];
  current: string | null;
  upcoming: WeeklyUpcomingView | null;
}) {
  return (
    <>
      <SectionHead
        heading={
          <Link
            href={routes.weeklyReport()}
            className="relative text-inherit no-underline decoration-brand-accent decoration-2 underline-offset-3 after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] hover:underline"
          >
            주간 리포트
          </Link>
        }
        headingAs="p"
        runningHead="ARCHIVE"
      />
      <ul role="list" className="mt-2">
        {upcoming ? (
          <li>
            <span className="flex min-h-11 items-center gap-2 border-b border-rule text-sm text-ink-2">
              <span className={cx(NUM, "text-[15px] font-extrabold")}>
                {upcoming.name.short}
              </span>
              <Leader />
              <span className="text-[12.5px] whitespace-nowrap">
                <span className={NUM}>{upcoming.label}</span> 발행 예정
              </span>
            </span>
          </li>
        ) : null}
        {index.map((e) => {
          const me = e.name.week === current;
          return (
            <li key={e.name.week}>
              <Link
                href={routes.weeklyReportArchive(e.name.week)}
                aria-current={me ? "page" : undefined}
                className={cx(
                  "group/row flex min-h-11 items-center gap-2 border-b border-rule text-sm text-ink no-underline",
                  me &&
                    "bg-paper-2 pl-2 font-extrabold shadow-[inset_4px_0_0_var(--brand-accent)]",
                )}
              >
                <span className="min-w-0 underline-offset-3 group-hover/row:underline">
                  <span className={cx(NUM, "text-[15px] font-extrabold")}>
                    {e.name.short}
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span className={cx(NUM, "text-[13px]")}>
                    {shortRange(e.range)}
                  </span>
                </span>
                <Leader />
                <span
                  className={cx(
                    NUM,
                    "text-[17px] leading-none font-semibold text-ink-2",
                  )}
                >
                  {e.appeared}
                  <span className="sr-only">명 출전</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[12.5px] leading-normal text-ink-2">
        숫자 = 그 주 출전 선수 수 · 경기일 기준
      </p>
    </>
  );
}

/**
 * 아카이브 색인(`/korean-players/weekly/`) — 주마다 한 줄 `[주차 거터 │ 기간 · MVP │ 출전 수 ›]`, 최신 주에 '최신' 도장. 행 전체가 링크
 * (최소 44px). 명단 · 로그 행과 같은 거터(`--gutter-date`) · 괘선(위 1px `--ink`, 행 아래 1px `--rule`).
 */
export function WeeklyArchiveList({
  index,
  headingId,
}: {
  index: readonly WeeklyIndexEntry[];
  headingId: string;
}) {
  return (
    <ol
      aria-labelledby={headingId}
      data-slot="weekly-archive"
      className="mt-2 border-t border-ink"
    >
      {index.map((e, i) => (
        <li key={e.name.week} className="border-b border-rule">
          <Link
            href={routes.weeklyReportArchive(e.name.week)}
            className="group/row grid min-h-11 grid-cols-[var(--gutter-date)_minmax(0,1fr)_auto] items-center gap-x-3 py-3 text-ink no-underline lg:gap-x-4 lg:py-3.5"
          >
            <span className="grid gap-1">
              <span
                className={cx(
                  NUM,
                  "text-num-n4 leading-[0.95] font-extrabold tracking-[-0.01em]",
                )}
              >
                {e.name.short}
              </span>
              <span className={cx(NUM, "text-xs text-ink-2")}>
                {e.name.week.slice(0, 4)}
              </span>
            </span>
            <span className="grid min-w-0 gap-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {i === 0 ? <StampChip>최신</StampChip> : null}
                <span className="text-[15px] font-extrabold underline-offset-3 group-hover/row:underline">
                  <span className={NUM}>{e.range.fromLabel}</span> ~{" "}
                  <span className={NUM}>{e.range.toLabel}</span>
                </span>
                {/* 1023 이하는 늘 다음 줄(375에서도 그 자리) — 폭 400~420px에서 웹폰트 교체 중에만 줄이 바뀌어 행이 20px 밀렸다(CLS 0.16, M3-14) */}
                <span className="w-full text-xs text-ink-2 lg:w-auto">
                  경기일 기준
                </span>
              </span>
              <span className="text-[13.5px] text-ink-2">
                {e.mvpName ? (
                  <>
                    <b className="font-extrabold text-ink">
                      {e.mvpCount > 1 ? "공동 MVP" : "MVP"} {e.mvpName}
                    </b>
                    {e.mvpCount > 1 ? ` 외 ${e.mvpCount - 1}명` : null}
                    {e.points !== null ? (
                      <>
                        {" "}
                        · <span className={NUM}>{e.points}</span>점
                      </>
                    ) : null}
                  </>
                ) : (
                  "출전한 선수가 없는 주"
                )}
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-ink-2">
              <span className="text-right text-xs leading-tight">
                <span
                  className={cx(
                    NUM,
                    "block text-num-n5 leading-none font-extrabold text-ink",
                  )}
                >
                  {e.appeared}
                </span>
                명 출전
              </span>
              <ChevronRightIcon size={16} />
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** 빈 상태(발행된 주 0개) — 사실만: 첫 리포트가 나오는 때와 기준 */
export function WeeklyEmpty() {
  return (
    <div
      data-slot="weekly-empty"
      className="mt-6 border-t border-ink pt-4 pb-2"
    >
      <p className="text-[15px] font-extrabold">
        첫 주간 리포트는 월요일 아침에 발행돼요.
      </p>
      <p className="mt-2 text-[13.5px] text-ink-2">
        지난 월~일 경기일 기준으로 한국 선수의 출전 기록을 모아 실어요.
      </p>
    </div>
  );
}

// ─── 머리 — 키커 · 주 넘기기 · MVP 머리기사 ─────────────────────────────────

/** 주 넘기기 한쪽 — 발행된 주는 1px `--ink-2` 상자 링크(`rel`), 없으면 dashed `--ink-disabled` 꺼진 상자 + 화면 밖 이유 */
function WeekStep({ step, dir }: { step: WeekStepView; dir: "prev" | "next" }) {
  const label = (
    <span className={cx(NUM, "text-[15px] leading-none tracking-[0.04em]")}>
      {step.name.short}
    </span>
  );
  const icon =
    dir === "prev" ? (
      <ChevronLeftIcon size={16} />
    ) : (
      <ChevronRightIcon size={16} />
    );
  const box =
    "inline-flex min-h-11 items-center gap-1 border px-2.5 text-sm font-extrabold";
  if (step.kind === "link") {
    return (
      <Link
        href={routes.weeklyReportArchive(step.name.week)}
        rel={dir}
        className={cx(
          box,
          "border-ink-2 text-ink no-underline transition-colors duration-fast ease-print hover:border-ink",
        )}
      >
        {dir === "prev" ? icon : null}
        <span className="sr-only">
          {dir === "prev" ? "이전 주 " : "다음 주 "}
        </span>
        {label}
        {dir === "next" ? icon : null}
      </Link>
    );
  }
  return (
    <span
      aria-disabled="true"
      className={cx(box, "border-dashed border-ink-disabled text-ink-2")}
    >
      {dir === "prev" ? icon : null}
      <span className="sr-only">
        {dir === "prev" ? "이전 주 " : "다음 주 "}
      </span>
      {label}
      <span className="sr-only"> — {step.reason}</span>
      {dir === "next" ? icon : null}
    </span>
  );
}

/** "MVP 근거 줄" 결과 묶음 — 골 · 도움 글자 + W/D/L + 스코어(소속팀 먼저), 홈/원정은 묶음 밖 */
function EvidenceLine({ evidence }: { evidence: EvidenceView }) {
  const { result, scoring } = evidence;
  return (
    <>
      <time
        dateTime={evidence.kickoff}
        className={cx(NUM, "text-[1.05em] font-semibold")}
      >
        {formatKst(evidence.kickoff, "dayShort")}{" "}
        {formatKst(evidence.kickoff, "time")}
      </time>
      <span>
        <OpponentName opponent={evidence.opponent} badge={false} />전
      </span>
      <span
        data-slot="result-cell"
        {...(scoring || result ? { "data-spoil": "stamp" } : {})}
        className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1"
      >
        {scoring || result ? (
          <span
            data-slot="result-value"
            data-outcome={result?.outcome}
            className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1"
          >
            {scoring ? <b className="font-extrabold">{scoring}</b> : null}
            {result ? (
              <>
                <FormChip result={result.outcome} />
                <span className="sr-only">{FORM_WORD[result.outcome]} </span>
                <Score
                  h={result.for}
                  a={result.against}
                  className={cx(
                    NUM,
                    "gap-0 text-[1.15em] leading-none tracking-[0.04em]",
                  )}
                />
                {result.pens ? (
                  <span className="text-[0.75em] font-extrabold text-ink-2">
                    승부차기{" "}
                    <span className={NUM}>
                      {result.pens.for}
                      <span aria-hidden="true">–</span>
                      <span className="sr-only">대</span>
                      {result.pens.against}
                    </span>
                  </span>
                ) : null}
              </>
            ) : null}
          </span>
        ) : null}
        {scoring || result ? (
          <SpoilerCellButton
            label={`${formatKst(evidence.kickoff, "monthDay")} ${evidence.opponent.name}전 결과 보기`}
          />
        ) : null}
        {scoring ? null : <b className="font-extrabold">{evidence.played}</b>}
        <span className="text-xs font-extrabold text-ink-2 before:mr-1.5 before:font-normal before:content-['·']">
          {evidence.home ? "홈" : "원정"}
        </span>
      </span>
    </>
  );
}

/** MVP 팀 줄 — 배지 xs + 팀 · 포지션 */
function MvpTeam({ mvp }: { mvp: MvpView }) {
  return (
    <span className="inline-flex items-center gap-2">
      {mvp.team.name ? <TeamBadge team={mvp.team} size="s" /> : null}
      <span lang={mvp.team.latin ? "en" : undefined}>{mvp.team.name}</span>
      {mvp.position ? (
        <>
          <span aria-hidden="true">·</span>
          <span lang="en">{mvp.position}</span>
        </>
      ) : null}
    </span>
  );
}

const MVP_STAMP =
  "inline-flex flex-none items-center border border-brand-accent-text px-1.5 pt-0.75 pb-0.5 text-type-stamp font-extrabold tracking-[0.01em] text-brand-accent-text";

/**
 * 쪽 머리 — 키커(한국 선수 · 주간 리포트 · {주차}) + 러닝 헤드 → 주 넘기기 → MVP 머리기사(도장 + 팀 → 이름 h1 60/112px → dek 근거 줄 →
 * 공동 MVP 줄 → 발행 · 기록 기간, 아래 1px `--ink`). 출전 0명이면 큰 이름 대신 쪽 머리 h1 32/48px + "출전 0명"(윤곽 0 — 숫자 상태 규칙)
 */
export function WeeklyHead({
  view,
  headingId,
}: {
  view: WeeklyReportView;
  headingId: string;
}) {
  const { mvp, coMvp, name, range } = view;
  return (
    <header data-slot="weekly-head" className="pt-1.5 lg:pt-1">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
        <span>
          <Link
            href={routes.koreanPlayers()}
            className="relative text-inherit underline decoration-1 underline-offset-3 after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] hover:decoration-2"
          >
            한국 선수
          </Link>
          {" · "}
          <Link
            href={routes.weeklyReport()}
            className="relative text-inherit underline decoration-1 underline-offset-3 after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] hover:decoration-2"
          >
            주간 리포트
          </Link>
          {" · "}
          {name.long}
        </span>
        <RunningHead className="ml-auto">WEEKLY REPORT</RunningHead>
      </p>
      <nav
        aria-label="주 넘기기"
        className="mt-3 flex items-center justify-between gap-2 border-b border-rule pb-3"
      >
        <WeekStep step={view.prev} dir="prev" />
        <p className="grid justify-items-center gap-1 text-center text-[12.5px] text-ink-2">
          <b
            className={cx(
              NUM,
              "text-num-n4 leading-none font-extrabold tracking-[0.02em] text-ink",
            )}
          >
            {name.short}
          </b>
          <span className={cx(NUM, "text-[13px] font-semibold")}>
            {range.fromLabel} ~ {range.toLabel}
          </span>
        </p>
        <WeekStep step={view.next} dir="next" />
      </nav>
      {mvp ? (
        <div className="mt-5">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13.5px] font-extrabold">
            <span className="inline-flex items-center gap-1.5">
              <span className={MVP_STAMP}>이번 주 MVP</span>
              {coMvp.length > 0 ? (
                <span className={MVP_STAMP}>공동</span>
              ) : null}
            </span>
            <MvpTeam mvp={mvp} />
          </p>
          <h1
            id={headingId}
            className="mt-2.5 text-type-hed-xl font-extrabold tracking-[-0.055em] break-keep"
          >
            <span className="sr-only">
              {name.short} {coMvp.length > 0 ? "공동 MVP" : "MVP"}{" "}
            </span>
            <PlayerLink
              slug={mvp.slug}
              className="decoration-3 underline-offset-8"
            >
              {mvp.nameKo}
            </PlayerLink>
          </h1>
          {mvp.evidence ? (
            <p
              data-slot="weekly-dek"
              className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-type-dek"
            >
              <EvidenceLine evidence={mvp.evidence} />
            </p>
          ) : null}
          {coMvp.length > 0 ? (
            <ul
              role="list"
              data-slot="weekly-co-mvp"
              className="mt-2.5 grid gap-2"
            >
              {coMvp.map((c) => (
                <li
                  key={c.slug}
                  className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-rule pt-2 text-[15px] lg:text-base"
                >
                  <span className="inline-flex items-center gap-2 font-extrabold">
                    <span className={MVP_STAMP}>공동 MVP</span>
                    <PlayerLink
                      slug={c.slug}
                      className="text-[17px] lg:text-xl"
                    >
                      {c.nameKo}
                    </PlayerLink>
                    <span className="text-[13px] text-ink-2">
                      <MvpTeam mvp={c} />
                    </span>
                  </span>
                  {c.evidence ? <EvidenceLine evidence={c.evidence} /> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="mt-5">
          <h1
            id={headingId}
            className="text-[32px] leading-[1.1] font-extrabold tracking-[-0.04em] lg:text-5xl"
          >
            {name.long} 주간 리포트
          </h1>
          <p className="mt-3 flex items-center gap-3 text-[15px] font-extrabold">
            <span
              aria-hidden="true"
              className={cx(
                NUM,
                "text-num-n3 leading-[0.86] text-transparent [-webkit-text-stroke:1.5px_var(--ink-2)]",
              )}
            >
              0
            </span>
            이번 주 출전한 선수가 없어요
          </p>
        </div>
      )}
      <p className="mt-3.5 flex flex-wrap gap-x-3.5 gap-y-1 border-b border-ink pb-3 text-[12.5px] text-ink-2 lg:pb-4">
        <span>
          <time
            dateTime={view.generatedAt}
            className={cx(NUM, "text-[13px] font-semibold")}
          >
            {formatKst(view.generatedAt, "dayShort")}
          </time>{" "}
          발행
        </span>
        <span>
          출전 기록{" "}
          <span className={cx(NUM, "text-[13px] font-semibold")}>
            {range.fromLabel} ~ {range.toLabel}
          </span>{" "}
          경기일 기준
        </span>
      </p>
    </header>
  );
}

// ─── MVP 점수 ───────────────────────────────────────────────────────────────

/** 반전 머리 띠(1024 이상) — `--ink` 면 · `--paper` 글자 13.5px 800 + 러닝 헤드 Barlow 600 12px 0.16em */
const BAND =
  "lg:flex lg:items-baseline lg:justify-between lg:gap-2.5 lg:bg-ink lg:px-3 lg:pt-2 lg:pb-1.75 lg:text-[13.5px] lg:leading-[1.3] lg:text-paper";

function BandRunningHead({ children }: { children: string }) {
  return (
    <span
      lang="en"
      aria-hidden="true"
      className={cx(
        NUM,
        "hidden text-xs leading-none font-semibold tracking-[0.16em] lg:inline",
      )}
    >
      {children}
    </span>
  );
}

/**
 * MVP 점수 박스 — 1024 이상 1px `--ink` 상자 + 반전 머리 띠 → N1 점수(`--brand-accent-text`) + "점" → 산식 줄(숫자 N4, 위 1px `--ink` ·
 * 아래 1px `--rule`) → 규칙 문장. 1023 이하 = 머리 띠 · 상자 없이 한 줄("MVP 점수 · N2 · 산식", 규칙 문장 숨김 — 시안 혼합 조정)
 */
export function MvpScore({
  score,
  headingId,
}: {
  score: NonNullable<WeeklyReportView["score"]>;
  headingId: string;
}) {
  return (
    <section
      aria-labelledby={headingId}
      data-slot="weekly-score"
      className="flex flex-wrap items-center gap-x-3.5 gap-y-0.5 border-b border-rule pt-1 pb-2.25 lg:block lg:border lg:border-ink lg:bg-paper lg:p-0"
    >
      <h2 id={headingId} className={cx("text-[13px] font-extrabold", BAND)}>
        <span>MVP 점수</span>
        <BandRunningHead>SCORE</BandRunningHead>
      </h2>
      <p className="flex items-baseline gap-1 lg:px-3.5 lg:pt-3">
        <b
          className={cx(
            NUM,
            "text-num-n2 leading-[0.82] font-extrabold tracking-[-0.03em] text-brand-accent-text lg:text-num-n1",
          )}
        >
          {score.points}
        </b>
        <span className="text-sm font-extrabold lg:text-lg">점</span>
      </p>
      <p className="flex flex-[1_1_180px] flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] font-extrabold text-ink-2 lg:mx-3.5 lg:mt-3 lg:border-t lg:border-b lg:border-t-ink lg:border-b-rule lg:py-2.5">
        <span>
          <b className={cx(NUM, "mr-px text-num-n4 leading-none text-ink")}>
            {score.goals}
          </b>
          골 ×<span className={NUM}>3</span>
        </span>
        <span aria-hidden="true" className="font-normal">
          +
        </span>
        <span className="sr-only">더하기</span>
        <span>
          <b className={cx(NUM, "mr-px text-num-n4 leading-none text-ink")}>
            {score.assists}
          </b>
          도움 ×<span className={NUM}>2</span>
        </span>
        <span aria-hidden="true" className="font-normal">
          +
        </span>
        <span className="sr-only">더하기</span>
        <span>
          <b className={cx(NUM, "mr-px text-num-n4 leading-none text-ink")}>
            {score.apps}
          </b>
          출전
        </span>
      </p>
      <p className="hidden text-[12.5px] leading-normal text-ink-2 lg:block lg:px-3.5 lg:pt-2.5 lg:pb-3.5">
        골×3 + 도움×2 + 출전 경기 수 — 동점이면 출전 시간 · 골 순, 그래도 같으면
        공동 MVP
      </p>
    </section>
  );
}

/** 다음 순위 — 이름 · 리더 점선 · 점수(Barlow 800 18px) + "점" */
export function RunnersUp({
  rows,
  headingId,
}: {
  rows: WeeklyReportView["runnersUp"];
  headingId: string;
}) {
  return (
    <section aria-labelledby={headingId} data-slot="weekly-runners-up">
      <SectionHead heading="다음 순위" headingId={headingId} sideAtXl />
      <ol className="mt-1.5">
        {rows.map((r) => (
          <li
            key={r.slug}
            className="flex min-h-9 items-baseline gap-2 border-b border-rule pt-2 pb-1.25 text-[13.5px] font-extrabold"
          >
            <span>{r.nameKo}</span>
            <Leader />
            <b className={cx(NUM, "text-lg leading-none font-extrabold")}>
              {r.points}
            </b>
            {/* 혼합안 `.ru__u` — 숫자에 붙인다(간격 8 − 6 = 2px), 11.5px `--ink-2` */}
            <span
              data-slot="points-unit"
              className="-ml-1.5 text-[11.5px] text-ink-2"
            >
              점
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ─── 총평 ───────────────────────────────────────────────────────────────────

/**
 * 총평 단 — 구역 머리(3px + "총평" + REMARKS) → (LLM 총평이면) 머리 줄 'AI 작성' 라벨 한 번 + 생성 날짜 → 문단 16.5 / 19px(`max-width: 46em`).
 * 코드 템플릿으로 강등된 총평(`summaryAi` false)에는 라벨 · 생성 날짜를 붙이지 않는다(D64 ⑥ · D24)
 *
 * 결과 가림(M4-15): 총평 문단은 그 주 경기의 스코어 · 승패를 문장으로 담는다(입력 = 출전 기록 — 결과 포함) → 5줄 결과 줄과 같은 띠로 접는다
 * (문단이 펼치는 단위 — 뜯김). 'AI 작성' 라벨 · 생성 날짜 머리 줄은 결과가 아니라 그대로 둔다.
 */
export function WeeklySummary({
  summary,
  generatedAt,
  headingId,
}: {
  summary: WeeklyReportView["summary"];
  generatedAt: string;
  headingId: string;
}) {
  return (
    <section
      aria-labelledby={headingId}
      data-slot="weekly-summary"
      data-ai={summary.ai}
      data-spoil="tear"
    >
      <SectionHead heading="총평" headingId={headingId} runningHead="REMARKS" />
      {summary.ai ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-2">
          <AiLabel />
          <span>
            <time
              dateTime={generatedAt}
              className={cx(NUM, "text-[13px] font-semibold")}
            >
              {formatKst(generatedAt, "dayShort")}
            </time>{" "}
            생성
          </span>
        </p>
      ) : null}
      <SpoilerFlap className="mt-3">총평 — 이번 주 경기 결과 포함</SpoilerFlap>
      <p
        data-spoil-value=""
        data-spoil-focus=""
        className="mt-3 max-w-[46em] text-type-dek break-keep"
      >
        {summary.text}
      </p>
    </section>
  );
}

// ─── 출전 기록 박스 표 ──────────────────────────────────────────────────────

/** 90분 막대 — 경기마다 20×6 / 28×7px, 1px `--ink-2` 테두리 + 왼쪽부터 `--ink` 채움, 벤치 빈 막대, 값 없음 1px dashed `--ink-3`(장식) */
function MinuteBars({ matches }: { matches: readonly WeeklyMatchView[] }) {
  return (
    <span aria-hidden="true" className="mt-1.75 flex justify-end gap-0.5">
      {matches.map((m) => (
        <i
          key={m.key}
          data-bar={m.bar}
          className={cx(
            "block h-1.5 w-5 border lg:h-1.75 lg:w-7",
            m.bar === "none" ? "border-dashed border-ink-3" : "border-ink-2",
          )}
          style={{
            background:
              m.bar === "played"
                ? `linear-gradient(var(--ink), var(--ink)) left / ${m.fill}% 100% no-repeat`
                : undefined,
          }}
        />
      ))}
    </span>
  );
}

/**
 * 경기 줄(1024 이상) — "10.24 (토) 분데스 · 브레멘 · **선발** 75분"(혼합안 `.wt__ms` — 한 줄 글자, 상태 글자만 800).
 * 대회는 평탄 탭이 아니라 글자(6개 대회 = 줄임 이름, 컵 = 대회 이름) — 표 행마다 색 면이 쌓이지 않게(M3-14).
 * 날짜 = 경기일(UTC 날짜, 시각 없음 — 기간 표기와 같은 기준, D2 §8 #31)
 */
function MatchLines({ matches }: { matches: readonly WeeklyMatchView[] }) {
  return (
    <ul
      role="list"
      data-slot="weekly-match-lines"
      className="mt-1.5 hidden gap-0.5 text-xs leading-[1.45] font-normal tracking-normal text-ink-2 lg:grid"
    >
      {matches.map((m) => (
        <li key={m.key}>
          <time
            dateTime={m.kickoff}
            className={cx(NUM, "text-[12.5px] font-semibold")}
          >
            {formatUtcDayShort(m.kickoff)}
          </time>{" "}
          {m.comp.kind === "comp" ? (
            <span title={m.comp.name}>{m.comp.short}</span>
          ) : (
            <span lang={m.comp.latin ? "en" : undefined}>{m.comp.name}</span>
          )}
          {" · "}
          <OpponentName opponent={m.opponent} badge={false} />
          {" · "}
          <b
            className={cx(
              "font-extrabold",
              m.appearance.strong ? "text-ink" : "text-ink-2",
            )}
          >
            {m.appearance.label}
          </b>
          {m.appearance.tone === "on" ? (
            <>
              {" "}
              <span className={NUM}>{m.appearance.text}</span>분
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** 표 숫자 칸 — N5 Barlow 800, 0 = `--ink-2`, 골 > 0 = `--brand-accent-text` */
function NumCell({
  value,
  goal = false,
  children,
}: {
  value: number;
  goal?: boolean;
  children?: ReactNode;
}) {
  return (
    <td
      className={cx(
        NUM,
        "px-1.5 py-3 text-right align-top text-num-n5 leading-none font-extrabold",
        value === 0
          ? "text-ink-2"
          : goal
            ? "text-brand-accent-text"
            : "text-ink",
      )}
    >
      {value}
      {children}
    </td>
  );
}

function BoxRow({ row }: { row: WeeklyRowView }) {
  return (
    <tr
      data-mvp={row.mvp || undefined}
      className="border-b border-rule last:border-b-0"
    >
      <th
        scope="row"
        className={cx(
          "py-3 pr-1.5 pl-3 text-left align-top font-normal",
          row.mvp && "shadow-[inset_4px_0_0_var(--brand-accent)]",
        )}
      >
        <span className="flex flex-wrap items-center gap-1.5 text-base font-extrabold tracking-[-0.02em]">
          {row.mvp ? <span className={MVP_STAMP}>MVP</span> : null}
          <PlayerLink slug={row.slug}>{row.nameKo}</PlayerLink>
        </span>
        <span className="mt-1.5 flex items-center gap-1.5 text-xs font-extrabold text-ink-2">
          {row.team.name ? <TeamBadge team={row.team} size="xs" /> : null}
          <span lang={row.team.latin ? "en" : undefined}>{row.team.name}</span>
        </span>
        {row.matches ? <MatchLines matches={row.matches} /> : null}
      </th>
      <NumCell value={row.apps} />
      <NumCell value={row.minutes}>
        {row.matches && row.matches.length > 0 ? (
          <MinuteBars matches={row.matches} />
        ) : null}
      </NumCell>
      <NumCell value={row.goals} goal />
      <NumCell value={row.assists} />
      <td
        className={cx(
          NUM,
          "py-3 pr-3 pl-1.5 text-right align-top text-num-n5 leading-none font-extrabold",
          row.points === 0 ? "text-ink-2" : "text-ink",
        )}
      >
        {row.points}
      </td>
    </tr>
  );
}

/**
 * 출전 기록 박스 — 1px `--ink` 상자 + 반전 머리 띠("출전 기록 · n명" + BOX SCORE) → 표(선수 · 경기 | 출전 | 분 + 90분 막대 | 골 | 도움 |
 * 점수, MVP 점수 순) → 각주(막대 뜻 · 표 밖 선수). 1024 이상은 이름 아래 경기별 줄. 반전 머리 띠는 1023 이하에도 쓴다(시안 375 그대로)
 */
export function BoxScore({
  view,
  headingId,
}: {
  view: WeeklyReportView;
  headingId: string;
}) {
  const head =
    "pt-2.5 pb-2 text-[11.5px] font-extrabold whitespace-nowrap text-ink-2";
  const num = cx(head, "px-1.5 text-right");
  return (
    <section
      aria-labelledby={headingId}
      data-slot="weekly-box"
      className="border border-ink bg-paper"
    >
      <h2
        id={headingId}
        className="flex items-baseline justify-between gap-2.5 bg-ink px-3 pt-2 pb-1.75 text-[13.5px] leading-[1.3] font-extrabold text-paper"
      >
        <span>
          출전 기록 · <span className={NUM}>{view.rows.length}</span>명
        </span>
        <span
          lang="en"
          aria-hidden="true"
          className={cx(
            NUM,
            "text-xs leading-none font-semibold tracking-[0.16em]",
          )}
        >
          BOX SCORE
        </span>
      </h2>
      {view.rows.length > 0 ? (
        <table className="w-full text-[13.5px]">
          <caption className="sr-only">
            {view.name.short} 한국 선수 출전 기록 — MVP 점수 순. 분 아래 막대는
            경기마다 출전 시간 / 90분
          </caption>
          <thead>
            <tr className="border-b border-ink">
              <th scope="col" className={cx(head, "pr-1.5 pl-3 text-left")}>
                선수 · 경기
                {/* 경기 줄 날짜 기준(1024 이상만 경기 줄이 보인다 — D2 §8 #31) */}
                <span className="hidden font-semibold lg:inline">
                  {" "}
                  · 경기일 기준
                </span>
              </th>
              <th scope="col" className={num}>
                출전
              </th>
              <th scope="col" className={num}>
                분
              </th>
              <th scope="col" className={num}>
                골
              </th>
              <th scope="col" className={num}>
                도움
              </th>
              <th scope="col" className={cx(head, "pr-3 pl-1.5 text-right")}>
                점수
              </th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <BoxRow key={row.slug} row={row} />
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-3 py-4 text-[15px] font-extrabold">
          이 주에 기록을 집계한 선수가 없어요.
        </p>
      )}
      <div className="border-t border-rule px-3 pt-2.5 pb-3 text-[12.5px] leading-normal text-ink-2">
        {view.rows.some((r) => r.matches && r.matches.length > 0) ? (
          <p>
            <span aria-hidden="true" className="mr-1.5 inline-flex align-[1px]">
              <i className="block h-1.75 w-7 border border-ink-2 bg-ink" />
            </span>
            막대 = 경기마다 출전 시간 / 90분 · 벤치는 빈 막대, 명단 제외 ·
            라인업 없음은 점선
          </p>
        ) : null}
        {view.excluded.length > 0 ? (
          <p data-slot="weekly-excluded" className="mt-1">
            표 밖 선수 —{" "}
            {view.excluded.map((g, i) => (
              <span key={g.reason}>
                {i > 0 ? ", " : null}
                {g.reason}(
                <b className="font-extrabold text-ink">{g.names.join(" · ")}</b>
                )
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** 출처 줄 — 출전 기록은 API-Football 경기 기록, 점수는 코드 계산, 총평은 LLM 또는 코드 문장 */
export function WeeklySourceNote({
  ai,
  className,
}: {
  ai: boolean;
  className?: string;
}) {
  return (
    <p
      data-slot="weekly-source"
      className={cx("text-[12.5px] leading-normal text-ink-2", className)}
    >
      <b className="font-extrabold text-ink">데이터</b> 출전·분·골·도움·결과
      API-Football · MVP 점수는 골×3 + 도움×2 + 출전으로 계산 ·{" "}
      {ai
        ? "총평은 같은 기록만 넣어 AI가 쓴 문장"
        : "총평은 기록으로 만든 문장"}{" "}
      · 시각 KST
    </p>
  );
}
