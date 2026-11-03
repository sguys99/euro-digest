import type { ReactNode } from "react";

import { Leader } from "@/components/about/leader";
import { SectionHead } from "@/components/ui/section-head";
import { TierBadge } from "@/components/ui/tier-badge";
import { cn } from "@/lib/utils";
import type { PublishDayState } from "@/lib/ops-metrics";
import {
  DAY_STATE_LABEL,
  durationParts,
  type StatusDay,
  type StatusSourceRow,
  type StatusView,
} from "@/lib/status-view";

import { StatusDayPicker } from "./status-day-picker";

/*
 * `/status/` 지면 (PRD P-1 · §15 D71 ③, DESIGN §9.3 D3 `/status`, 확정 시안 `docs/design/d3/concept-mix.html` 화면 5 — C 숫자판 +
 * 점 그래프 + 30칸 발행일 띠 + 소스 표, plan M5-15). 서버 컴포넌트 — 섬은 날짜 선택(`StatusDayPicker`) 하나.
 *
 * 순서: 쪽 머리(h1 "발행 상태" · STATUS) + "이 쪽 기준 {빌드 시각} KST" → **숫자판** `<dl>`(위 2px `--ink`, 1024 이상 3열 · 사이 1px
 * `--rule`): 마지막 발행 · 수집 완료 · 최근 30일 실행 성공률 · 이번 달 비용(예산 대비 %만 — 금액 없음) → **최근 30일**(위 1px `--ink`):
 * 점 그래프(y = 수집 완료 시각 0 ~ 24시, 공개 목표 계단선 — 계절 전환 반영) + 30칸 발행일 띠 + 날짜 이동 줄 + 범례 + 화면 밖 30일 목록
 * → **소스 건강도**(최근 7일 표).
 * 숫자 상태 규칙(DESIGN §9.3 D2): 값 = 실선, 0 = 윤곽, 값 없음 = 대시. 점 · 띠 · 기호는 `aria-hidden`이고 뜻은 화면 밖 목록 · 범례 글자 ·
 * 상세 줄이 맡는다(색만으로 전하지 않음 — 모양 ● □ — ⊘ ◌ ✕). 첫 로드 모션 0.
 * 배포 완료 시각 칸은 없다(실행 기록에 그 시각이 없다 — 시안의 '자리'는 숨김, plan M5-15 메모).
 */

const N1 =
  "font-numeric text-num-n1 leading-[0.84] font-extrabold tracking-[-0.02em] lining-nums tabular-nums";
/** 캡션 안 숫자 — Barlow 600 14.5px `--ink` */
const CAP_NUM =
  "font-numeric text-[14.5px] leading-none font-semibold text-ink lining-nums tabular-nums";
/** 보조 설명 — 13px `--ink-2` */
const SUB = "mt-0.75 text-[13px] text-ink-2";
const DEF = "mt-2.5 max-w-[70ch] text-[12.5px] leading-[1.55] text-ink-2";

export const STATUS_SECTIONS = [
  { id: "st-n", title: "숫자판" },
  { id: "st-30", title: "최근 30일" },
  { id: "st-src", title: "소스" },
] as const;

/** 1024 이상 왼쪽 목차 열 "이 쪽" — 같은 쪽 앵커(일반 `<a>`) */
export function StatusToc() {
  return (
    <>
      <SectionHead heading="이 쪽" headingAs="p" runningHead="CONTENTS" />
      <ul role="list" className="mt-1.5">
        {STATUS_SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="group/row flex min-h-11 items-center gap-1.75 border-b border-rule text-sm leading-[1.3] text-ink no-underline"
            >
              <span className="min-w-0 underline-offset-3 group-hover/row:underline">
                {s.title}
              </span>
              <Leader className="min-w-2" />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function Num({ children }: { children: ReactNode }) {
  return <span className={CAP_NUM}>{children}</span>;
}

/** 숫자판 큰 숫자 — 값 = 실선, 0 = 윤곽(2px `--ink-2`), 값 없음 = 대시 `--ink-2`. 장식(뜻은 화면 밖 글자) */
function BoardNumber({
  value,
  tone,
  unit,
  sr,
}: {
  value: string | null;
  tone: "on" | "zero";
  unit: string;
  sr: string;
}) {
  return (
    <dd className="mt-2.5 flex items-baseline gap-1.5">
      <span
        aria-hidden="true"
        data-tone={value === null ? "null" : tone}
        className={cn(
          N1,
          value === null
            ? "text-ink-2"
            : tone === "zero"
              ? "text-transparent [-webkit-text-stroke:2px_var(--ink-2)]"
              : "text-ink",
        )}
      >
        {value ?? "–"}
      </span>
      {value !== null ? (
        <span
          aria-hidden="true"
          className="font-numeric text-[20px] leading-none font-extrabold tracking-[0.04em] text-ink-2 lg:text-[26px]"
        >
          {unit}
        </span>
      ) : null}
      <span className="sr-only">{sr}</span>
    </dd>
  );
}

const CELL =
  "border-b border-rule pt-3.5 pb-4 lg:border-b-0 lg:pt-4.5 lg:pr-6 lg:pb-5 lg:[&+&]:border-l lg:[&+&]:pl-6";
const DT = "text-[13px] font-extrabold text-ink-2";
const CAPTION = "mt-2.5 text-[13px] leading-[1.6] text-ink-2";

function Board({ view }: { view: StatusView }) {
  const { last, runRate, cost } = view;
  const lead = last?.leadMinutes ?? 0;
  return (
    <dl
      id="st-n"
      data-slot="status-board"
      className="mt-5 grid scroll-mt-4 border-t-2 border-ink lg:grid-cols-3"
    >
      <div className={CELL}>
        <dt className={DT}>마지막 발행 · 수집 완료</dt>
        <BoardNumber
          value={last?.finished ?? null}
          tone="on"
          unit="KST"
          sr={last ? `${last.finished} KST` : "기록 없음"}
        />
        <dd className={CAPTION}>
          {last ? (
            <>
              {last.dateLabel}
              {last.no !== null ? (
                <>
                  {" "}
                  제 <Num>{last.no}</Num>호
                </>
              ) : null}{" "}
              · 공개 목표 <Num>{last.target}</Num>
              {lead === 0 ? (
                " 정각"
              ) : (
                <>
                  보다
                  {durationParts(lead).map((part) => (
                    <span key={part.unit}>
                      {" "}
                      <Num>{part.n}</Num>
                      {part.unit}
                    </span>
                  ))}{" "}
                  {lead > 0 ? "앞" : "뒤"}
                </>
              )}
            </>
          ) : (
            "아직 발행한 호가 없어요"
          )}
        </dd>
      </div>
      <div className={CELL}>
        <dt className={DT}>최근 30일 실행 성공률</dt>
        <BoardNumber
          value={runRate?.pct ?? null}
          tone={runRate?.zero ? "zero" : "on"}
          unit="%"
          sr={runRate ? `${runRate.pct}%` : "실행 기록 없음"}
        />
        <dd className={CAPTION}>
          {runRate ? (
            <>
              prod 수집 <Num>{runRate.runs}</Num>회 중 <Num>{runRate.ok}</Num>회
              · 실패 <Num>{runRate.failed}</Num>회
            </>
          ) : (
            "최근 30일에 수집 실행이 없어요"
          )}
        </dd>
      </div>
      <div className={CELL}>
        <dt className={DT}>이번 달 비용 · 월 예산 대비</dt>
        <BoardNumber
          value={cost.pct}
          tone={cost.zero ? "zero" : "on"}
          unit="%"
          sr={`${cost.pct}%`}
        />
        <dd className={CAPTION}>
          운영 + 개발 실험 합
          {cost.previous ? (
            <>
              {" "}
              · {Number(cost.previous.month.slice(5))}월{" "}
              <Num>{cost.previous.pct}</Num>%
            </>
          ) : null}
        </dd>
      </div>
    </dl>
  );
}

// ─── 최근 30일 ───────────────────────────────────────────────────────────

/** 실패한 실행 ✕(레드 — 그래프 · 범례) */
function CrossMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 10 10"
      aria-hidden="true"
      focusable="false"
      className={cn("block size-2.5 text-brand-accent", className)}
    >
      <path
        d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5"
        stroke="currentColor"
        strokeWidth="2.5"
      />
    </svg>
  );
}

/** 꽉 찬 원(정시 ●) — 원은 border-radius가 아니라 SVG로 그린다(DESIGN §9.1 rounded-* 금지) */
function Disc({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 10 10"
      aria-hidden="true"
      focusable="false"
      className={cn("block text-ink", className)}
    >
      <circle cx="5" cy="5" r="5" fill="currentColor" />
    </svg>
  );
}

/**
 * 발행일 기호 — 정시 ● · 늦음 □ · 결호 — · 실패 ⊘ · 창간 전 점선 작은 원 · 발행 전(오늘, 목표 + 15분 전) 없음.
 * `band` = 띠 칸(1023 이하 7px · 1024 이상 11px), `legend` = 범례(9px). 모양이 뜻이고 색은 `--ink` 계열뿐이다.
 */
function DayMark({
  state,
  size,
}: {
  state: PublishDayState;
  size: "band" | "legend";
}) {
  const band = size === "band";
  const box = band ? "size-[9px] lg:size-[13px]" : "size-[11px]";
  const dot = band ? "size-[7px] lg:size-[11px]" : "size-[9px]";
  let mark: ReactNode = null;
  switch (state) {
    case "ontime":
      mark = <Disc className={dot} />;
      break;
    case "late":
      mark = (
        <i
          className={cn(
            "block border-ink",
            dot,
            band ? "border-[1.5px] lg:border-[1.75px]" : "border-[1.75px]",
          )}
        />
      );
      break;
    case "missed":
      mark = (
        <i
          className={cn(
            "block bg-ink-2",
            band
              ? "h-0.5 w-[7px] lg:h-[2.5px] lg:w-[11px]"
              : "h-[2.5px] w-[9px]",
          )}
        />
      );
      break;
    case "failed":
      mark = (
        <svg
          viewBox="0 0 10 10"
          focusable="false"
          className={cn(
            "block text-ink",
            band ? "size-2 lg:size-2.5" : "size-2.5",
          )}
        >
          <circle
            cx="5"
            cy="5"
            r="4.25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M2 8L8 2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
      break;
    case "prelaunch":
      // 점선 작은 원(`--ink-3` — 비텍스트 대비 3.89 · 4.08, DESIGN §2.10 D3)
      mark = (
        <svg
          viewBox="0 0 10 10"
          focusable="false"
          className={cn(
            "block overflow-visible text-ink-3",
            band ? "size-[5px] lg:size-1.5" : "size-1.5",
          )}
        >
          <circle
            cx="5"
            cy="5"
            r="4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="3 1.2"
          />
        </svg>
      );
      break;
    case "pending":
      mark = null;
      break;
  }
  return (
    <i
      aria-hidden="true"
      data-mark={state}
      className={cn("inline-grid flex-none place-items-center", box)}
    >
      {mark}
    </i>
  );
}

/** 점 그래프 한 칸의 점 — 정시 ● · 늦음 □ · 결호 바닥 선 · 실패한 실행 ✕ */
function DayPoints({ day }: { day: StatusDay }) {
  const at = (y: number) => ({ left: `${day.x}%`, top: `${y}%` });
  return (
    <>
      {day.y !== null && day.state === "ontime" ? (
        <span
          data-point="ontime"
          style={at(day.y)}
          className="absolute -mt-[4.5px] -ml-[4.5px]"
        >
          <Disc className="size-[9px]" />
        </span>
      ) : null}
      {day.y !== null && day.state === "late" ? (
        <i
          data-point="late"
          style={at(day.y)}
          className="absolute -mt-[4.5px] -ml-[4.5px] block size-[9px] border-[1.75px] border-ink bg-paper"
        />
      ) : null}
      {day.state === "missed" ? (
        <i
          data-point="missed"
          style={at(97)}
          className="absolute -mt-px -ml-[4.5px] block h-[2.5px] w-[9px] bg-ink-2"
        />
      ) : null}
      {day.failedY.map((y, k) => (
        <span
          key={k}
          data-point="failed-run"
          style={at(y)}
          className="absolute -mt-1.25 -ml-1.25"
        >
          <CrossMark />
        </span>
      ))}
    </>
  );
}

const PLOT_H = "h-50 lg:h-60";
const HOURS = [0, 6, 12, 18, 24] as const;

function Chart({ view, id }: { view: StatusView; id: string }) {
  const n = view.days.length;
  const pre = (100 * view.prelaunchDays) / n;
  const selX = view.days[view.selected]?.x ?? 0;
  return (
    <div aria-hidden="true" className="relative mt-3.5 mb-1.5 pb-5.5 pl-6.5">
      <div
        id={`${id}-plot`}
        data-slot="status-plot"
        className={cn("relative lg:cursor-pointer", PLOT_H)}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          {HOURS.map((h) => {
            const y = 100 * (1 - h / 24);
            return (
              <line
                key={h}
                x1="0"
                x2="100"
                y1={y}
                y2={y}
                className="stroke-rule"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {view.prelaunchDays > 0 ? (
            <rect
              x="0"
              y="0"
              width={pre}
              height="100"
              className="fill-paper-2"
            />
          ) : null}
          {view.targetPath ? (
            <path
              d={view.targetPath}
              data-slot="status-target"
              fill="none"
              className="stroke-ink"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        <div className="pointer-events-none absolute inset-0">
          {view.days.map((day) => (
            <DayPoints key={day.date} day={day} />
          ))}
          <i
            id={`${id}-sel`}
            data-slot="status-sel"
            style={{ left: `${selX}%` }}
            className="absolute top-0 bottom-0 -ml-px block w-0.5 bg-brand-accent transition-[left] duration-fast ease-print motion-reduce:transition-none"
          />
        </div>
      </div>
      <div
        className={cn(
          "pointer-events-none absolute top-0 right-0 left-6.5",
          PLOT_H,
        )}
      >
        {HOURS.map((h) => (
          <span
            key={h}
            style={{ top: `${100 * (1 - h / 24)}%` }}
            className="absolute -left-6.5 -translate-y-1/2 font-numeric text-xs leading-none font-semibold text-ink-2 tabular-nums"
          >
            {String(h).padStart(2, "0")}
          </span>
        ))}
        {view.prelaunchDays >= 3 ? (
          <span
            style={{ width: `${pre}%` }}
            className="absolute top-2 left-0 text-center text-[11px] font-extrabold text-ink-2"
          >
            창간 전
          </span>
        ) : null}
        {view.targetLabel ? (
          <span
            style={{
              left: `${view.targetLabel.x}%`,
              top: `${view.targetLabel.y}%`,
            }}
            className="absolute translate-x-1.5 translate-y-[calc(-100%_-_4px)] text-[11px] font-extrabold whitespace-nowrap text-ink"
          >
            공개 목표
          </span>
        ) : null}
        {view.axis.map((a) => (
          <span
            key={a.md}
            style={{ left: `${a.x}%` }}
            className={cn(
              "absolute top-[calc(100%_+_8px)] font-numeric text-xs leading-none font-semibold whitespace-nowrap text-ink-2 tabular-nums",
              a.end ? "-translate-x-full" : "-translate-x-1/2",
            )}
          >
            {a.md}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 30칸 발행일 띠 — 그래프 열과 같은 격자, 왼쪽 세로 라벨 "발행일" */
function Band({ days }: { days: readonly StatusDay[] }) {
  return (
    <div
      aria-hidden="true"
      data-slot="status-band"
      className="mt-0.5 grid grid-cols-[26px_minmax(0,1fr)] items-center border-y border-rule py-2"
    >
      <span className="justify-self-start text-[11px] font-extrabold tracking-[-0.05em] text-ink-2 [text-orientation:upright] [writing-mode:vertical-rl]">
        발행일
      </span>
      <ol
        className="grid h-4 items-center justify-items-center"
        style={{
          gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
        }}
      >
        {days.map((d) => (
          <li key={d.date} className="contents">
            <DayMark state={d.state} size="band" />
          </li>
        ))}
      </ol>
    </div>
  );
}

const LEGEND_STATES: readonly PublishDayState[] = [
  "ontime",
  "late",
  "missed",
  "failed",
  "prelaunch",
];

function Legend({ view }: { view: StatusView }) {
  const states = [
    ...LEGEND_STATES,
    ...(view.counts.pending > 0 ? (["pending"] as const) : []),
  ];
  return (
    <ul
      role="list"
      data-slot="status-legend"
      className="mt-3 flex flex-wrap gap-x-4.5 gap-y-2 text-[12.5px] text-ink-2"
    >
      {states.map((state) => {
        const count = view.counts[state];
        return (
          <li key={state} className="inline-flex items-center gap-1.5">
            {state === "pending" ? null : (
              <DayMark state={state} size="legend" />
            )}
            {DAY_STATE_LABEL[state]}{" "}
            <span
              className={cn(
                "font-numeric leading-none tabular-nums",
                count === 0
                  ? "text-[15px] font-extrabold text-transparent [-webkit-text-stroke:1.25px_var(--ink-2)]"
                  : "text-sm font-semibold text-ink",
              )}
            >
              {count}
            </span>
            {state === "failed" ? "일" : null}
          </li>
        );
      })}
      <li className="inline-flex items-center gap-1.5">
        <CrossMark />
        <span>
          실패한 실행{" "}
          <span
            className={cn(
              "font-numeric leading-none tabular-nums",
              view.failedRunCount === 0
                ? "text-[15px] font-extrabold text-transparent [-webkit-text-stroke:1.25px_var(--ink-2)]"
                : "text-sm font-semibold text-ink",
            )}
          >
            {view.failedRunCount}
          </span>
          회 — 그래프에만
        </span>
      </li>
    </ul>
  );
}

function Recent({ view, id }: { view: StatusView; id: string }) {
  const lines = view.days.map((d) => d.line);
  return (
    <section id="st-30" aria-labelledby="st-30-h" className="mt-10 scroll-mt-4">
      <SectionHead
        heading="최근 30일 — 수집 완료 시각"
        headingId="st-30-h"
        runningHead="30 DAYS"
        className="border-t"
      />
      <p className={SUB}>
        점 = 그날 첫 발행 실행의 수집 완료(KST) · 선 = 공개 목표(여름{" "}
        <Num>07:00</Num> → 겨울 <Num>07:30</Num>)
      </p>
      <Chart view={view} id={id} />
      <Band days={view.days} />
      <StatusDayPicker id={id} lines={lines} initial={view.selected} />
      <Legend view={view} />
      <ol className="sr-only" aria-label="최근 30일 발행일">
        {lines.map((line, i) => (
          <li key={view.days[i]?.date ?? i}>{line}</li>
        ))}
      </ol>
      <p className={DEF}>
        <b className="font-extrabold text-ink">성공률</b>은 실행 기준(운영
        리포트와 같은 셈), <b className="font-extrabold text-ink">점</b>과 띠는
        발행일 기준이다. 정시 = 공개 목표 + 15분 안. 공개(배포 완료)는 보통 수집
        완료 몇 분 뒤라, 점은 수집 완료 시각으로 그린다.
      </p>
    </section>
  );
}

// ─── 소스 ────────────────────────────────────────────────────────────────

/** 표 숫자 — Barlow 800 18px(1023 이하 16px — Tier 열도 1024 이상만: 브레이크포인트는 lg · xl만, DESIGN §7.1). 0 윤곽(`zeroOutline`), null 대시 */
function TableNum({
  value,
  zeroOutline = false,
  flag = false,
}: {
  value: number | null;
  zeroOutline?: boolean;
  flag?: boolean;
}) {
  if (value === null) {
    return (
      <span className="font-numeric text-lg leading-none font-extrabold text-ink-2">
        <span aria-hidden="true">–</span>
        <span className="sr-only">기록 없음</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "font-numeric text-base leading-none font-extrabold tabular-nums lg:text-lg",
        zeroOutline && value === 0
          ? "text-transparent [-webkit-text-stroke:1.25px_var(--ink-2)]"
          : flag
            ? "text-brand-accent-text"
            : "text-ink",
      )}
    >
      {value}
    </span>
  );
}

const TH =
  "pt-0 pb-2.5 pl-2.5 text-xs font-extrabold whitespace-nowrap text-ink-2";

function SourceTable({ rows }: { rows: readonly StatusSourceRow[] }) {
  return (
    <div className="mt-3">
      <table data-slot="status-sources" className="w-full text-[13.5px]">
        <caption className="sr-only">소스 건강도 — 최근 7일</caption>
        <thead>
          <tr className="border-b border-ink">
            <th scope="col" className={cn(TH, "pl-0 text-left")}>
              매체
            </th>
            <th
              scope="col"
              className={cn(TH, "hidden text-right lg:table-cell")}
            >
              Tier
            </th>
            <th scope="col" className={cn(TH, "text-right")}>
              응답
            </th>
            <th scope="col" className={cn(TH, "text-right")}>
              새 기사
            </th>
            <th scope="col" className={cn(TH, "text-right")}>
              없음 연속
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-flagged={row.flagged || undefined}
              className="border-b border-rule"
            >
              <th
                scope="row"
                className="py-2.5 text-left align-baseline font-extrabold"
              >
                <span
                  lang={row.lang && row.lang !== "ko" ? row.lang : undefined}
                >
                  {row.name}
                </span>
              </th>
              <td className="hidden py-2.5 pl-2.5 text-right align-baseline lg:table-cell">
                {row.tier !== null ? (
                  <TierBadge tier={row.tier} compact />
                ) : (
                  <span className="text-ink-2">–</span>
                )}
              </td>
              <td className="py-2.5 pl-2.5 text-right align-baseline whitespace-nowrap">
                <TableNum value={row.ok} />
                <span className="font-numeric text-[13px] leading-none font-semibold text-ink-2 tabular-nums">
                  /{row.attempts}
                </span>
              </td>
              <td className="py-2.5 pl-2.5 text-right align-baseline">
                <TableNum value={row.fresh} />
              </td>
              <td className="py-2.5 pl-2.5 text-right align-baseline">
                <TableNum value={row.stale} zeroOutline flag={row.flagged} />
                {row.flagged ? (
                  <span className="sr-only"> (점검 기준 이상)</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sources({ view }: { view: StatusView }) {
  const md = (d: string) => d.slice(5).replace("-", ".");
  return (
    <section
      id="st-src"
      aria-labelledby="st-src-h"
      className="mt-10 scroll-mt-4"
    >
      <SectionHead
        heading="소스 건강도"
        headingId="st-src-h"
        runningHead="SOURCES"
        className="border-t"
      />
      <p className={SUB}>
        최근 7일{" "}
        <Num>
          {md(view.sourceFrom)} – {md(view.sourceTo)}
        </Num>
        {view.sources.length > 0 ? (
          <>
            {" "}
            · 수집 <Num>{view.sources.length}</Num>곳
          </>
        ) : null}
      </p>
      {view.sources.length > 0 ? (
        <>
          <SourceTable rows={view.sources} />
          <p className={DEF}>
            응답 = 성공 / 시도(시간 예산 초과 제외). 없음 연속 = 응답은 했지만
            새 기사가 없던 실행이 이어진 횟수(7 이상이면 점검 이슈). 0은 윤곽
            숫자.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm leading-[1.55] text-ink-2">
          아직 소스를 수집한 실행 기록이 없어요.
        </p>
      )}
    </section>
  );
}

// ─── 지면 ────────────────────────────────────────────────────────────────

/** `/status` 지면 전체(쪽 머리 → 숫자판 → 최근 30일 → 소스). `id` = 날짜 선택 섬이 찾는 그래프 id 머리(견본에서 여러 벌일 때 구분) */
export function StatusBody({
  view,
  id = "st",
  headingAs = "h1",
}: {
  view: StatusView;
  id?: string;
  headingAs?: "h1" | "h2";
}) {
  const empty = view.last === null && view.runRate === null;
  return (
    <section aria-labelledby={`${id}-h`} data-slot="status-page">
      <SectionHead
        heading="발행 상태"
        headingAs={headingAs}
        headingId={`${id}-h`}
        runningHead="STATUS"
      />
      <p className="mt-1.5 text-[13px] text-ink-2">
        이 쪽 기준{" "}
        <time dateTime={view.asOf} className="font-extrabold text-ink">
          {view.asOfLabel} KST
        </time>{" "}
        · 발행할 때마다 다시 만든다
      </p>
      <Board view={view} />
      {empty ? (
        <p
          data-slot="status-empty"
          className="mt-8 max-w-[46ch] text-sm leading-[1.55] text-ink-2"
        >
          아직 실행 기록이 없어요. 첫 호를 발행하면 최근 30일 발행일과 소스
          건강도가 이 쪽에 채워져요.
        </p>
      ) : (
        <>
          <Recent view={view} id={id} />
          <Sources view={view} />
        </>
      )}
    </section>
  );
}
