/**
 * 운영 지표 — 순수 함수 (PRD FR-155 주간 운영 리포트 · P-1 `/status` 공개 상태 페이지, plan M5-09·M5-15, PRD §15 D26·D48·D49·D71)
 *
 * 입력은 실행 기록(`data/runs.json` prod · `data/runs-dev.json` dev — RunLog[])과 기준 시각 `asOf`뿐이다. 파일 읽기·현재 시각은
 * 호출부가 넘긴다(scripts/lib/ops-report-stage.ts · /status 빌드). 화면 코드가 scripts/를 import하지 않는 저장소 관례에 맞춰
 * src/lib에 두고, scripts는 `@/lib/ops-metrics`로 가져다 쓴다. 이 파일은 fs·zod·DOM을 쓰지 않는다(타입만 import).
 *
 * **기준 시각 `asOf`** — 모든 함수는 startedAt이 `asOf` 이하인 실행만 센다(`runsUpTo`). 주간 운영 리포트는 그 ISO 주의 KST 일요일
 * 23:59:59.999를 넘겨 재실행해도 같은 수치가 나오게 하고, `/status`는 빌드 시각을 넘긴다.
 *
 * 규칙
 * - **발행일** = 수집 실행 startedAt의 KST 날짜(collect의 발행일 — src/lib/issue.ts `isIssuePublishingRun`과 같다).
 * - **발행일 판정**(`publishDay`): 창간일(`FIRST_ISSUE_DATE`) 전 = prelaunch · 그 발행일에 게시한 실행(prod collect success·partial)이
 *   있으면 첫 발행(가장 이른 finishedAt — `issueMeta.publishedAt`과 같은 값)이 공개 목표(계절별 `publishSlot` — 여름 07:00 · 겨울
 *   07:30) + `PUBLISH_GRACE_MINUTES`(15분, NFR-05 · D48 ②) 이내면 ontime, 넘으면 late · 게시 실행이 없고 아직 목표 + 15분 전이면
 *   pending(오늘 발행 전) · 그 밖에 실패 실행(status failed — D49 보존 기록)이 있으면 failed · 아무것도 없으면 missed(결호).
 *   공개(배포 완료) 시각은 실행 기록에 없어 수집 완료 시각으로 판정한다 — 실제 공개는 보통 몇 분 뒤다(D3 시안과 같은 규칙).
 * - **실행 성공률**(`runStats`): 분모 = 그 구간에 시작한 prod 실행(그 job) 중 status skipped(prod dry 기록 — M1-27 ⑤)를 뺀 것,
 *   분자 = success + partial(게시한 실행). 발행일 단위가 아니라 실행 단위다(D71 — `/status` 성공률은 실행 기준).
 * - **비용**: 실행은 startedAt으로 귀속한다(scripts/lib/cost.ts와 같다 — 하루·달은 KST). 금액은 마이크로달러 정수로 더한다.
 *   월 사용률은 prod + dev 합산 ÷ 월 예산, dev 비율이 `DEV_ALERT_SHARE`(50%)를 **넘으면** 경고(CLAUDE.md §6.3 — cost.ts
 *   `assessDevUsage`와 같은 계산, tests/ops-metrics.test.ts가 대조).
 */
import { isIssuePublishingRun } from "@/lib/issue";
import type { RunLog } from "@/lib/schema/run";
import { FIRST_ISSUE_DATE } from "@/lib/site";
import {
  daysBetween,
  kstDate,
  kstMonth,
  publishSlot,
  PUBLISH_GRACE_MINUTES,
  shiftDate,
  type PublishSeason,
} from "@/lib/time";

/** dev 누적이 월 예산의 이 비율을 넘으면 알림 (CLAUDE.md §6.3) — scripts/lib/cost.ts가 다시 내보낸다(단일 출처) */
export const DEV_ALERT_SHARE = 0.5;

/**
 * 월 예산 기본값(USD — `MONTHLY_BUDGET_USD` 기본, CLAUDE.md §6.2·§10). scripts/lib/cost.ts가 다시 내보낸다(단일 출처, M5-15).
 * `/status`는 빌드 환경에 예산 변수를 두지 않으므로 이 값으로 사용률을 낸다.
 */
export const DEFAULT_MONTHLY_BUDGET_USD = 3;

/** 한 번에 펼치는 날짜·달 수 상한 — 잘못된 입력으로 큰 배열을 만들지 않게 */
const MAX_SPAN_DAYS = 3_660;

const MICRO_PER_USD = 1_000_000;

function toMicro(usd: number): number {
  return Math.round(usd * MICRO_PER_USD);
}

function fromMicro(micro: number): number {
  return micro / MICRO_PER_USD;
}

function ms(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new RangeError(`UTC ISO 시각이 아님: ${iso}`);
  return t;
}

// ─── 날짜 ────────────────────────────────────────────────────────────────

/** 달력 날짜 from ~ to(둘 다 포함, "YYYY-MM-DD") 오름차순. from > to면 빈 배열 */
export function datesBetween(from: string, to: string): string[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];
  if (span > MAX_SPAN_DAYS) {
    throw new RangeError(`날짜 구간이 너무 길다: ${from} ~ ${to}`);
  }
  return Array.from({ length: span + 1 }, (_, i) => shiftDate(from, i));
}

/** 달력 날짜 from ~ to가 걸치는 달 "YYYY-MM"(둘 다 포함) 오름차순. from > to면 빈 배열 */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (const date of datesBetween(from, to)) {
    const month = date.slice(0, 7);
    if (months.at(-1) !== month) months.push(month);
  }
  return months;
}

/** 달 "YYYY-MM"의 마지막 날 "YYYY-MM-DD" */
export function lastDateOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) {
    throw new RangeError(`달 형식(YYYY-MM)이 아님: ${month}`);
  }
  const nextFirst =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return shiftDate(nextFirst, -1);
}

/** startedAt이 asOf 이하인 실행만(입력 순서 유지) */
export function runsUpTo(
  runs: readonly RunLog[],
  asOf: string,
): readonly RunLog[] {
  const limit = ms(asOf);
  return runs.filter((run) => ms(run.startedAt) <= limit);
}

/** UTC 구간 [from, to] — 둘 다 포함(UTC ISO) */
export interface UtcSpan {
  from: string;
  to: string;
}

function inSpan(iso: string, span: UtcSpan): boolean {
  const t = ms(iso);
  return t >= ms(span.from) && t <= ms(span.to);
}

// ─── 발행일 ──────────────────────────────────────────────────────────────

/** 발행일 판정 — 머리 주석 규칙 */
export type PublishDayState =
  "ontime" | "late" | "missed" | "failed" | "prelaunch" | "pending";

/** 판정 순서 고정(표·집계 출력 순서) */
export const PUBLISH_DAY_STATES: readonly PublishDayState[] = Object.freeze([
  "ontime",
  "late",
  "missed",
  "failed",
  "pending",
  "prelaunch",
]);

export interface PublishDay {
  /** KST 발행일 "YYYY-MM-DD" */
  date: string;
  state: PublishDayState;
  season: PublishSeason;
  /** 공개 목표(UTC ISO — 계절별) */
  publishTarget: string;
  /** 정시 한도 = 공개 목표 + 15분(UTC ISO) */
  deadline: string;
  /** 첫 발행 실행의 수집 완료(UTC ISO) — 게시 실행이 없으면 null */
  publishedAt: string | null;
  /** 첫 발행 실행 runId — 없으면 null */
  publishRunId: string | null;
  /** 그 발행일 prod collect 실행 수(status skipped — dry 기록 — 제외) */
  runs: number;
  /** 그 가운데 실패 실행 수(status failed) */
  failedRuns: number;
}

/** 그 발행일 prod collect 실행(dry 제외, asOf까지) */
function dayRunsOf(runs: readonly RunLog[], date: string): readonly RunLog[] {
  return runs.filter(
    (run) =>
      run.env === "prod" &&
      run.job === "collect" &&
      run.status !== "skipped" &&
      kstDate(run.startedAt) === date,
  );
}

/** 발행일 하나의 판정(머리 주석 규칙). runs에는 prod·dev를 섞어 넣어도 된다(prod만 본다) */
export function publishDay(
  date: string,
  runs: readonly RunLog[],
  asOf: string,
): PublishDay {
  const slot = publishSlot(date);
  const deadlineMs = ms(slot.publishTarget) + PUBLISH_GRACE_MINUTES * 60_000;
  const deadline = new Date(deadlineMs).toISOString();
  const dayRuns = dayRunsOf(runsUpTo(runs, asOf), date);
  const failedRuns = dayRuns.filter((run) => run.status === "failed").length;
  const first =
    dayRuns
      .filter((run) => isIssuePublishingRun(run, date))
      .sort((a, b) => ms(a.finishedAt) - ms(b.finishedAt))[0] ?? null;
  let state: PublishDayState;
  if (date < FIRST_ISSUE_DATE) state = "prelaunch";
  else if (first)
    state = ms(first.finishedAt) <= deadlineMs ? "ontime" : "late";
  else if (ms(asOf) < deadlineMs) state = "pending";
  else state = failedRuns > 0 ? "failed" : "missed";
  return {
    date,
    state,
    season: slot.season,
    publishTarget: slot.publishTarget,
    deadline,
    publishedAt: first?.finishedAt ?? null,
    publishRunId: first?.runId ?? null,
    runs: dayRuns.length,
    failedRuns,
  };
}

/** 발행일 from ~ to(KST, 둘 다 포함)의 판정 — 오름차순 */
export function publishDays(
  from: string,
  to: string,
  runs: readonly RunLog[],
  asOf: string,
): PublishDay[] {
  const upTo = runsUpTo(runs, asOf);
  return datesBetween(from, to).map((date) => publishDay(date, upTo, asOf));
}

/** 판정별 날수(모든 상태 키가 있다 — 없으면 0) */
export function countPublishDays(
  days: readonly Pick<PublishDay, "state">[],
): Record<PublishDayState, number> {
  const counts = Object.fromEntries(
    PUBLISH_DAY_STATES.map((s) => [s, 0]),
  ) as Record<PublishDayState, number>;
  for (const day of days) counts[day.state] += 1;
  return counts;
}

// ─── 실행 성공률 ─────────────────────────────────────────────────────────

export interface RunStats {
  /** 분모 — 구간에 시작한 prod 실행(그 job) 중 skipped 제외 */
  runs: number;
  success: number;
  partial: number;
  failed: number;
  /** success + partial */
  ok: number;
  /** ok / runs — 실행이 없으면 null */
  rate: number | null;
}

/** 구간(UTC, 둘 다 포함)에 시작한 prod 실행의 성공률 — 머리 주석 규칙 */
export function runStats(
  runs: readonly RunLog[],
  span: UtcSpan,
  job: RunLog["job"],
): RunStats {
  const counted = runs.filter(
    (run) =>
      run.env === "prod" &&
      run.job === job &&
      run.status !== "skipped" &&
      inSpan(run.startedAt, span),
  );
  const count = (status: RunLog["status"]) =>
    counted.filter((run) => run.status === status).length;
  const success = count("success");
  const partial = count("partial");
  const ok = success + partial;
  return {
    runs: counted.length,
    success,
    partial,
    failed: count("failed"),
    ok,
    rate: counted.length > 0 ? ok / counted.length : null,
  };
}

/** 일일 수집 실행 성공률(실행 기준 — D71) */
export function collectRunStats(
  runs: readonly RunLog[],
  span: UtcSpan,
): RunStats {
  return runStats(runs, span, "collect");
}

// ─── 비용 ────────────────────────────────────────────────────────────────

export interface Spend {
  prod: number;
  dev: number;
  /** prod + dev */
  total: number;
  /** job별 prod + dev */
  byJob: Record<RunLog["job"], number>;
}

/** 구간(UTC, 둘 다 포함)에 시작한 실행의 비용 합(USD) — prod·dev를 섞어 넣는다 */
export function spendInRange(runs: readonly RunLog[], span: UtcSpan): Spend {
  let prod = 0;
  let dev = 0;
  const byJob: Record<RunLog["job"], number> = { collect: 0, weekly: 0 };
  for (const run of runs) {
    if (!inSpan(run.startedAt, span)) continue;
    const micro = toMicro(run.costUsd);
    if (run.env === "prod") prod += micro;
    else dev += micro;
    byJob[run.job] += micro;
  }
  return {
    prod: fromMicro(prod),
    dev: fromMicro(dev),
    total: fromMicro(prod + dev),
    byJob: {
      collect: fromMicro(byJob.collect),
      weekly: fromMicro(byJob.weekly),
    },
  };
}

export interface MonthBudgetUsage {
  /** KST 달 "YYYY-MM" */
  month: string;
  /** 집계 기준 KST 날짜 — asOf가 그 달 안이면 asOf 날짜, 지났으면 그 달 마지막 날 */
  through: string;
  /** 그 달 전체가 들어갔는지(asOf가 달 끝을 지남) */
  complete: boolean;
  prod: number;
  dev: number;
  total: number;
  monthlyBudget: number;
  /** total ÷ 월 예산 (예산 0이면 0) */
  share: number;
  /** dev ÷ 월 예산 (예산 0이면 0) */
  devShare: number;
  /** devShare가 DEV_ALERT_SHARE(50%)를 넘음 — 예산 0이면 dev 사용이 있을 때 */
  devAlert: boolean;
}

/**
 * KST 달의 asOf까지 사용률(prod + dev ÷ 월 예산, dev 50% 경고). 실행은 startedAt의 KST 달로 귀속한다.
 * runs에는 prod·dev를 섞어 넣는다.
 */
export function monthBudgetUsage(
  runs: readonly RunLog[],
  month: string,
  asOf: string,
  monthlyBudget: number,
): MonthBudgetUsage {
  if (!Number.isFinite(monthlyBudget) || monthlyBudget < 0) {
    throw new RangeError(`월 예산은 0 이상이어야 함: ${monthlyBudget}`);
  }
  const last = lastDateOfMonth(month);
  const asOfDate = kstDate(asOf);
  let prod = 0;
  let dev = 0;
  for (const run of runsUpTo(runs, asOf)) {
    if (kstMonth(run.startedAt) !== month) continue;
    if (run.env === "prod") prod += toMicro(run.costUsd);
    else dev += toMicro(run.costUsd);
  }
  const limit = toMicro(monthlyBudget);
  return {
    month,
    through: asOfDate < last ? asOfDate : last,
    complete: asOfDate >= last,
    prod: fromMicro(prod),
    dev: fromMicro(dev),
    total: fromMicro(prod + dev),
    monthlyBudget,
    share: limit > 0 ? (prod + dev) / limit : 0,
    devShare: limit > 0 ? dev / limit : 0,
    devAlert: limit > 0 ? dev > limit * DEV_ALERT_SHARE : dev > 0,
  };
}

// ─── 마지막 발행 ─────────────────────────────────────────────────────────

export interface LastPublication {
  /** KST 발행일 */
  date: string;
  /** 그 발행일 첫 발행 실행의 수집 완료(UTC ISO) — src/lib/issue.ts issueMeta.publishedAt과 같은 규칙 */
  publishedAt: string;
  /** 그 발행일 마지막 발행 실행의 수집 완료(UTC ISO) */
  updatedAt: string;
  /** 첫 발행 실행 runId */
  runId: string;
}

/** asOf까지 가장 최근 발행일과 그 발행 시각. 게시 실행이 없으면 null */
export function lastPublication(
  runs: readonly RunLog[],
  asOf: string,
): LastPublication | null {
  const published = runsUpTo(runs, asOf).filter((run) =>
    isIssuePublishingRun(run, kstDate(run.startedAt)),
  );
  if (published.length === 0) return null;
  const date = published
    .map((run) => kstDate(run.startedAt))
    .reduce((a, b) => (b > a ? b : a));
  const sameDay = published
    .filter((run) => kstDate(run.startedAt) === date)
    .sort((a, b) => ms(a.finishedAt) - ms(b.finishedAt));
  const first = sameDay[0] as RunLog;
  const last = sameDay[sameDay.length - 1] as RunLog;
  return {
    date,
    publishedAt: first.finishedAt,
    updatedAt: last.finishedAt,
    runId: first.runId,
  };
}
