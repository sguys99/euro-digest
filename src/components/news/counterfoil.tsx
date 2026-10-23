import Link from "next/link";
import type { ReactNode } from "react";

import { ICON_BUTTON } from "@/components/ui/button-classes";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
} from "@/components/ui/icons";
import {
  calendarCellLabel,
  calendarMonth,
  counterfoilDate,
  beforeFirstLabel,
  monthBeforeFounding,
  monthJumpTarget,
  shiftMonth,
  spokenDate,
  WEEKDAY_LABELS,
  weekdayName,
  type ArchiveView,
  type CalendarDay,
  type IssueLink,
} from "@/lib/news/archive";
import { routes } from "@/lib/paths";
import { cn } from "@/lib/utils";

import { CalendarIsland } from "./calendar-island";

/**
 * 티켓 꼬리표 + 월 달력 — 날짜 아카이브 이동 (PRD FR-33, DESIGN.md §9.3 티켓 꼬리표·달력, 시안 A "스텁 넘김"
 * `docs/design/m1-archive/concept-a.html` — 2026-10-23 사용자 선택, DECISIONS "M1-34 아카이브 날짜 이동", plan M1-34)
 *
 * 티켓 아래 두 번째 절취선 뒤의 꼬리표(counterfoil) 한 줄: ‹ 이전 호(제 N호·날짜) · 달력 버튼 · 다음 호 › — 결호는 건너뛴다. 끝에서는 링크 대신
 * 안내 글자("창간호예요"·"최신 호예요"). 달력은 꼬리표에서 뜯어 펼치는 월 격자다(375 지면을 밀어내는 시트 · 1024 이상 버튼 아래 팝오버).
 * 꼬리표는 `/news/`(최신 호)와 날짜 아카이브에만 단다 — 홈 티켓에는 없다(홈 375 첫 화면 5줄 4줄 유지, 사용자 결정).
 *
 * - 모두 서버 컴포넌트(정적 HTML) — 데이터는 화면 모델 src/lib/news/archive.ts `ArchiveView`. 펼침·닫기·키보드만 렌더 없는 섬
 *   (`CalendarIsland` — `aria-expanded`·`hidden`만 바꾼다)이 맡는다.
 * - 달력 칸: 발행 = 링크(보는 호 반전 + `aria-current="page"`, 최신 호 2px 테두리 + "최신"), 결호 = 점선 + 취소선 + "결호", 첫 호 전·최신 호 뒤 =
 *   흐린 숫자(--ink-2). 보이는 글자는 장식으로 숨기고 칸마다 화면 밖 글자(`calendarCellLabel`)가 뜻을 전한다 — 색만으로 뜻을 전하지 않는다.
 * - 달 이동은 그 달 첫 호로 가는 정적 링크(`monthJumpTarget` — 오케스트레이터 결정, 제자리 월 전환 섬 없음). 갈 달이 없으면 비활성 버튼.
 * - 달력 링크는 미리 받기를 끈다(`prefetch={false}` — 한 달 최대 31개 링크의 RSC 페이로드). 꼬리표 이전·다음 호는 기본값.
 * - 값은 시안 그대로(DESIGN 토큰 + 시안의 보조 크기 — 꼬리표 11.5·12.5·22px, 달력 칸 52px·20px, 팝오버 left = 목차 열 232 + 26px(달력 버튼 `lg:ml-6.5`와 같은 값)·폭 384px).
 */

/** 달력 판 id — 버튼 `aria-controls`·섬이 같은 값을 쓴다(페이지에 하나) */
export const CALENDAR_PANEL_ID = "archive-cal";
const CALENDAR_TITLE_ID = "archive-cal-t";

// ─── 꼬리표 ─────────────────────────────────────────────────────────────────

/** 꼬리표 한 쪽(이전 호 · 다음 호) — 링크 칸 */
const SIDE =
  "group/cf flex min-h-13 min-w-0 items-center gap-1 py-1 text-ticket-fg no-underline";
const SIDE_PREV = "pr-1.5 pl-0.5 lg:col-start-1 lg:pl-1.5";
const SIDE_NEXT = "justify-end pr-0.5 pl-1.5 text-right lg:col-start-4";

/** "이전 호" + 날짜 — --ticket-fg-2 11.5px 800, 날짜는 Barlow 600 12.5px */
const SIDE_KEY =
  "text-[11.5px] leading-[1.2] font-extrabold whitespace-nowrap text-ticket-fg-2";
/** "제 N호" — 12.5px 800, 숫자 Barlow 800 22px */
const SIDE_VALUE =
  "text-[12.5px] leading-none font-extrabold whitespace-nowrap";

function CounterfoilSide({
  dir,
  link,
  edge,
}: {
  dir: "prev" | "next";
  link: IssueLink | null;
  /** 끝(링크 없음)의 안내 글자 */
  edge: string;
}) {
  const key = dir === "prev" ? "이전 호" : "다음 호";
  const side = dir === "prev" ? SIDE_PREV : SIDE_NEXT;
  const text = cn(
    "flex min-w-0 flex-col gap-1.25",
    dir === "next" && "items-end",
  );
  if (!link) {
    return (
      <span data-counterfoil={dir} className={cn(SIDE, side)}>
        <span className={text}>
          <span className={SIDE_KEY}>{key}</span>
          <span className={cn(SIDE_VALUE, "font-normal text-ticket-fg-2")}>
            {edge}
          </span>
        </span>
      </span>
    );
  }
  return (
    <Link
      href={routes.newsArchive(link.date)}
      rel={dir}
      data-counterfoil={dir}
      className={cn(SIDE, side)}
    >
      {dir === "prev" && <ChevronLeftIcon size={18} />}
      <span className={text}>
        <span className={SIDE_KEY}>
          {key}
          <span
            aria-hidden="true"
            className="ml-1.25 font-numeric text-[12.5px] leading-none font-semibold tracking-[0.02em] lining-nums tabular-nums"
          >
            {counterfoilDate(link.date)}
          </span>
        </span>
        <span
          className={cn(
            SIDE_VALUE,
            "group-hover/cf:underline group-hover/cf:decoration-2 group-hover/cf:underline-offset-4",
          )}
        >
          <span className="sr-only"> </span>
          {link.no === null ? (
            spokenDate(link.date)
          ) : (
            <>
              제<span className="sr-only"> </span>
              <span className="mx-0.5 font-numeric text-[22px] leading-[0.8] font-extrabold tracking-[-0.01em] lining-nums tabular-nums">
                {link.no}
              </span>
              호
            </>
          )}
        </span>
        <span className="sr-only">, {spokenDate(link.date)}</span>
      </span>
      {dir === "next" && <ChevronRightIcon size={18} />}
    </Link>
  );
}

/**
 * 꼬리표 — `<nav aria-label="호 넘기기">`. 375는 `1fr · auto · 1fr`(달력 버튼 좌우 2px 점선 칸), 1024 이상은 스텁 열(232 + 천공 4px) ·
 * 달력 상자 버튼 · 빈칸 · 다음 호. 마스트헤드가 티켓 격자의 마지막 줄에 놓는다.
 */
export function Counterfoil({ view }: { view: ArchiveView }) {
  return (
    <nav
      aria-label="호 넘기기"
      data-slot="counterfoil"
      className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch px-1.5 pt-1.5 pb-2 lg:grid-cols-[calc(var(--col-contents)+4px)_auto_minmax(0,1fr)_auto] lg:pt-2 lg:pr-3.5 lg:pb-3 lg:pl-0"
    >
      <CounterfoilSide
        dir="prev"
        link={view.prev}
        edge={view.first.no === 1 ? "창간호예요" : "가장 오래된 호예요"}
      />
      <button
        type="button"
        aria-expanded="false"
        aria-controls={CALENDAR_PANEL_ID}
        data-cal-button=""
        className={cn(
          "group/cal flex min-h-13 min-w-14.5 flex-col items-center justify-center gap-0.75 border-x-2 border-dotted border-ticket-fg-2 bg-transparent px-2 py-1",
          "text-[11.5px] leading-none font-extrabold text-ticket-fg transition-colors duration-fast ease-print aria-expanded:bg-ticket-fg aria-expanded:text-ticket",
          "lg:col-start-2 lg:ml-6.5 lg:min-h-11 lg:flex-row lg:gap-2 lg:self-center lg:border lg:border-solid lg:py-0 lg:pr-3.5 lg:pl-2.5 lg:text-sm",
        )}
      >
        <CalendarIcon />
        <span className="group-hover/cal:underline group-hover/cal:decoration-2 group-hover/cal:underline-offset-3">
          달력<span className="sr-only"> — 날짜로 지난 호 찾기</span>
        </span>
      </button>
      <CounterfoilSide dir="next" link={view.next} edge="최신 호예요" />
    </nav>
  );
}

// ─── 달력 ───────────────────────────────────────────────────────────────────

/** 달 이동 — 1px --ink-2 상자 44px, 13px 800 + 16px 꺾쇠. 비활성은 점선 + --ink-disabled(DESIGN 비활성 규칙) */
const MONTH =
  "inline-flex min-h-11 min-w-11 items-center gap-0.5 border border-ink-2 bg-transparent px-2 text-[13px] font-extrabold text-ink no-underline disabled:border-dashed disabled:border-ink-disabled disabled:text-ink-disabled";

function MonthJump({
  dir,
  target,
  adjacent,
}: {
  dir: "prev" | "next";
  /** 그 쪽으로 발행된 호가 있는 가장 가까운 달과 그 달 첫 호 — 없으면 비활성 */
  target: { month: string; date: string } | null;
  /** 바로 옆 달 "YYYY-MM"(비활성 안내용) */
  adjacent: string;
}) {
  const month = target?.month ?? adjacent;
  const label = `${Number(month.slice(5, 7))}월`;
  const side = dir === "prev" ? "이전 달" : "다음 달";
  const icon =
    dir === "prev" ? (
      <ChevronLeftIcon size={16} />
    ) : (
      <ChevronRightIcon size={16} />
    );
  const body = (reason: string) => (
    <>
      {dir === "prev" && icon}
      <span aria-hidden="true">{label}</span>
      {dir === "next" && icon}
      <span className="sr-only">
        {side} — {month.slice(0, 4)}년 {label}
        {reason}
      </span>
    </>
  );
  if (!target) {
    return (
      <button type="button" disabled data-cal-month={dir} className={MONTH}>
        {body(
          dir === "next"
            ? "은 아직 발행 전"
            : monthBeforeFounding(month)
              ? "은 창간 전"
              : "은 발행 기록 없음",
        )}
      </button>
    );
  }
  return (
    <Link
      href={routes.newsArchive(target.date)}
      prefetch={false}
      data-cal-month={dir}
      className={MONTH}
    >
      {body(" 첫 호로")}
    </Link>
  );
}

/** 칸 공통 — 세로 가운데 52px, 일 숫자 위 · 아래 "N호" 등 */
const CELL =
  "relative flex min-h-13 flex-col items-center justify-center gap-1.25 no-underline transition-colors duration-fast ease-print";
/** 일 숫자 — Barlow 800 20px */
const DAY =
  "font-numeric text-[20px] leading-none font-extrabold lining-nums tabular-nums";
/** "N호" — Barlow 600 12px */
const ISSUE_NO =
  "font-numeric text-[12px] leading-none font-semibold tracking-[0.02em] whitespace-nowrap lining-nums tabular-nums";
/** "최신"·"결호" — 11px 800 */
const WORD = "text-[11px] leading-none font-extrabold whitespace-nowrap";

function CalendarCell({ day, latest }: { day: CalendarDay; latest: string }) {
  const sr = <span className="sr-only">{calendarCellLabel(day, latest)}</span>;
  if (day.state === "published") {
    const isLatest = day.date === latest;
    return (
      <Link
        href={routes.newsArchive(day.date)}
        prefetch={false}
        aria-current={day.current ? "page" : undefined}
        data-cal-day={day.date}
        className={cn(
          CELL,
          // 누름 영역 — 375 칸 링크는 42px 폭(표 7칸 − 칸 안쪽 2px×2)이라 칸 안쪽 여백까지 ::after로 좌우 2px 넓혀 46px(이웃 칸과 겹치지 않음, 모양 그대로)
          "group/cd after:absolute after:-inset-x-0.5 after:inset-y-0 after:content-['']",
          day.current ? "bg-ink text-paper" : "text-ink hover:bg-(--cal-hover)",
          isLatest && "shadow-[inset_0_0_0_2px_var(--ink)]",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            DAY,
            "group-hover/cd:underline group-hover/cd:decoration-brand-accent group-hover/cd:decoration-2 group-hover/cd:underline-offset-3",
          )}
        >
          {day.day}
        </span>
        {isLatest ? (
          <span
            aria-hidden="true"
            className={cn(WORD, day.current ? "text-paper" : "text-ink")}
          >
            최신
          </span>
        ) : day.no !== null ? (
          <span
            aria-hidden="true"
            className={cn(ISSUE_NO, day.current ? "text-paper" : "text-ink-2")}
          >
            {day.no}호
          </span>
        ) : null}
        {sr}
      </Link>
    );
  }
  if (day.state === "missing") {
    return (
      <span
        data-cal-gap=""
        className={cn(
          CELL,
          "text-ink outline-1 -outline-offset-4 outline-ink-2 outline-dashed",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(DAY, "font-semibold text-ink-2")}
        >
          <s className="decoration-2">{day.day}</s>
        </span>
        <span aria-hidden="true" className={cn(WORD, "text-ink-2")}>
          결호
        </span>
        {sr}
      </span>
    );
  }
  return (
    <span className={CELL}>
      <span aria-hidden="true" className={cn(DAY, "font-semibold text-ink-2")}>
        {day.day}
      </span>
      {sr}
    </span>
  );
}

/** 범례 견본 — 14px 칸 */
const SWATCH = "inline-grid size-3.5 flex-none place-items-center";

/**
 * 월 달력 판 — 처음엔 `hidden`(꼬리표 달력 버튼이 연다). 375: 티켓 아래 지면을 밀어내는 시트(--paper-2, 위 가장자리 천공 자국 `perf-edge`),
 * 1024 이상: 버튼 아래 팝오버(지면 + 1px 잉크 테두리 + 인쇄 그림자, z 6 — 카드 메뉴 5 위 · 하단 탭 20 아래). 펼칠 때 뜯김 200ms(`data-tear`).
 * 헤드(이전 달 · "2026년 10월" · 다음 달 · 닫기) → 요일 머리 표(일요일 시작) → 범례(장식).
 */
export function ArchiveCalendar({ view }: { view: ArchiveView }) {
  const { calendar, latest } = view;
  const month = calendarMonth(calendar, calendar.currentMonth);
  if (!month) return null;
  // 범례 흐린 숫자 항목 — 그 달에 있는 표기만(시안 10월 "창간 전·발행 전"). 없으면 항목을 싣지 않는다
  const dimmed = [
    ...new Set(
      month.days
        .filter((d) => d.state === "before" || d.state === "after")
        .map((d) =>
          d.state === "after" ? "발행 전" : beforeFirstLabel(d.date),
        ),
    ),
  ];
  const title = (
    <>
      <span className="font-numeric text-[19px] leading-none font-extrabold tracking-normal lining-nums tabular-nums">
        {month.year}
      </span>
      년{" "}
      <span className="font-numeric text-[19px] leading-none font-extrabold tracking-normal lining-nums tabular-nums">
        {month.monthNumber}
      </span>
      월
    </>
  );
  return (
    <>
      <div
        id={CALENDAR_PANEL_ID}
        hidden
        role="group"
        aria-labelledby={CALENDAR_TITLE_ID}
        data-cal-panel=""
        data-month={month.month}
        className={cn(
          "relative bg-paper-2 px-2.5 pt-5.5 pb-3 text-ink [--cal-hover:var(--paper)] data-tear:animate-tear",
          "before:absolute before:inset-x-0 before:top-0 before:h-1.5 before:perf-edge before:content-['']",
          "lg:absolute lg:top-[calc(100%+6px)] lg:left-[calc(var(--col-contents)+--spacing(6.5))] lg:z-6 lg:w-96 lg:border lg:border-ink lg:bg-paper lg:px-3.5 lg:pt-3.5 lg:pb-3 lg:shadow-print lg:[--cal-hover:var(--paper-2)] lg:before:hidden",
        )}
      >
        <div className="mb-2.5 flex items-center gap-1.5">
          <MonthJump
            dir="prev"
            target={monthJumpTarget(calendar, month.month, -1)}
            adjacent={shiftMonth(month.month, -1)}
          />
          <p
            id={CALENDAR_TITLE_ID}
            className="flex-1 text-center text-[15px] font-extrabold tracking-[-0.02em] whitespace-nowrap"
          >
            {title}
          </p>
          <MonthJump
            dir="next"
            target={monthJumpTarget(calendar, month.month, 1)}
            adjacent={shiftMonth(month.month, 1)}
          />
          <button
            type="button"
            data-cal-close=""
            aria-label="달력 닫기"
            className={cn(ICON_BUTTON, "-mr-1.5 text-ink")}
          >
            <CloseIcon />
          </button>
        </div>
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">
            {month.year}년 {month.monthNumber}월 발행 달력 — 발행된 날만 링크
          </caption>
          <thead>
            <tr>
              {calendar.weekdays.map((weekday) => (
                <th
                  key={weekday}
                  scope="col"
                  abbr={weekdayName(weekday)}
                  className="border-b border-rule pb-1.5 text-center text-[11.5px] font-extrabold text-ink-2"
                >
                  {WEEKDAY_LABELS[weekday]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {month.weeks.map((week, row) => (
              <tr key={week.find((d) => d)?.date ?? row}>
                {week.map((day, col) => (
                  <td
                    key={day?.date ?? `${row}-${col}`}
                    className={cn("p-0.5 text-center", row === 0 && "pt-1.5")}
                  >
                    {day && <CalendarCell day={day} latest={latest.date} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <ul
          aria-hidden="true"
          className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-0.5 text-[12px] leading-[1.5] text-ink-2"
        >
          <li className="inline-flex items-center gap-1.5">
            <span className={cn(SWATCH, "bg-ink")} />
            보는 호
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span
              className={cn(SWATCH, "shadow-[inset_0_0_0_2px_var(--ink)]")}
            />
            최신 호
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                SWATCH,
                "bg-[linear-gradient(var(--ink-2),var(--ink-2))] bg-[length:70%_2px] bg-center bg-no-repeat outline-1 -outline-offset-1 outline-ink-2 outline-dashed",
              )}
            />
            결호
          </li>
          {dimmed.length > 0 && (
            <li className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  SWATCH,
                  "font-numeric text-[12px] leading-none font-semibold text-ink-2",
                )}
              >
                7
              </span>
              {dimmed.join("·")}
            </li>
          )}
        </ul>
      </div>
      <CalendarIsland panelId={CALENDAR_PANEL_ID} />
    </>
  );
}

/** 앱 셸 `counterfoil` 슬롯 — 티켓 마지막 줄의 꼬리표 + 티켓 뒤의 달력 판(섬 포함). 꼬리표를 다는 페이지만 이 모듈을 import한다 */
export function counterfoilSlots(view: ArchiveView): {
  strip: ReactNode;
  panel: ReactNode;
} {
  return {
    strip: <Counterfoil view={view} />,
    panel: <ArchiveCalendar view={view} />,
  };
}
