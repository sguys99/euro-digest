/**
 * `/status/` 공개 상태 페이지 화면 모델 — 순수 함수 (PRD P-1 · §15 D12 · D71 ③, DESIGN §9.3 D3 `/status`, DECISIONS D3 #10, plan M5-15)
 *
 * 입력은 실행 기록(prod `data/runs.json` + dev `data/runs-dev.json`), 소스 설정(이름 · Tier · 언어), 월 예산, 기준 시각 `asOf`(= 빌드 시각
 * — "이 쪽 기준")뿐이다. 파일 읽기는 src/lib/data/status.ts가 한다. 계산은 운영 리포트(M5-09)와 같은 함수를 다시 쓴다:
 * 발행일 판정 `publishDays` · 실행 성공률 `collectRunStats` · 월 사용률 `monthBudgetUsage` · 마지막 발행 `lastPublication`
 * (src/lib/ops-metrics.ts), 소스 건강도 `assessSourceHealth` · `sourceStats`(src/lib/source-health.ts).
 *
 * 공개 범위(D71 ③ — 사용자 결정): 비용은 **예산 대비 %만**(소수 두 자리, 금액 없음), 성공률은 **실행 기준 %**(소수 한 자리), 발행일은
 * 30칸 띠(정시 · 늦음 · 결호 · 실패 · 창간 전 + 오늘 발행 전). 실패 원인 · 소스 마지막 새 기사 시각은 넣지 않는다.
 * **배포 완료 시각**(2026-11-03 사용자 결정 — Deployments API): 이 빌드는 배포 *전에* 돌아 자기 배포 시각을 알 수 없다. deploy.yml이
 * github-pages 지난 배포의 성공 시각 목록(`deploys`)을 빌드 입력으로 넘기면, 발행일마다 **첫 발행 실행의 수집 완료 뒤 12시간 안에 끝난
 * 첫 배포**를 그 호의 배포 완료로 싣는다(`deployOf`). 오늘 호가 발행됐는데 그 배포가 아직 없으면 '배포 중'(이 빌드가 그 배포다).
 * 목록이 없으면(로컬 빌드 · API 실패) 칸을 숨기고, 목록 범위(최근 100건) 밖의 지난 날은 값 없이 둔다(지어내지 않는다).
 *
 * 그래프 좌표는 % 값(0~100)으로 낸다 — x는 30칸 열의 가운데, y는 KST 하루(0 ~ 24시, 위 = 늦음)의 수집 완료 시각.
 */
import {
  collectRunStats,
  countPublishDays,
  lastPublication,
  monthBudgetUsage,
  publishDays,
  runsUpTo,
  type PublishDayState,
} from "@/lib/ops-metrics";
import { issueNumber } from "@/lib/issue";
import type { Tier } from "@/lib/schema/common";
import type { RunLog } from "@/lib/schema/run";
import {
  assessSourceHealth,
  healthRuns,
  sourceHistory,
  sourceStats,
  STALE_STREAK_THRESHOLD,
} from "@/lib/source-health";
import {
  formatKst,
  kstDate,
  kstDayRangeUtc,
  kstMonth,
  publishSlot,
  shiftDate,
} from "@/lib/time";

/** 최근 며칠을 보이나(30칸 띠 · 점 그래프 · 성공률 구간) */
export const STATUS_WINDOW_DAYS = 30;
/** 소스 표 구간(KST 날짜 수, 오늘 포함) — 소스 건강도 이슈의 7일 집계와 같다 */
export const STATUS_SOURCE_DAYS = 7;

/** 발행일 상태 글자 — 띠 · 점의 뜻(기호와 함께, 색만으로 전하지 않는다) */
export const DAY_STATE_LABEL: Readonly<Record<PublishDayState, string>> = {
  ontime: "정시",
  late: "늦음",
  missed: "결호",
  failed: "실패",
  prelaunch: "창간 전",
  pending: "발행 전",
};

export interface StatusDay {
  /** KST 발행일 "YYYY-MM-DD" */
  date: string;
  /** "11.02" */
  md: string;
  state: PublishDayState;
  /** 호수 — 창간 전이면 null */
  no: number | null;
  /** 공개 목표 KST "07:30"(계절별 — D26) */
  target: string;
  /** 첫 발행 실행의 수집 완료 KST "07:18" — 발행 기록이 없으면 null */
  finished: string | null;
  /** 실패한 실행(그 발행일에 시작한 prod collect status failed)의 시작 KST "00:33" — 시각 순 */
  failedRuns: string[];
  /** 열 가운데 x(%) */
  x: number;
  /** 수집 완료 점 y(% — 위 0 = 24시) — 발행 기록이 없으면 null */
  y: number | null;
  /** 공개 목표 y(%) */
  targetY: number;
  /** 실패한 실행 ✕ y(%) — failedRuns와 같은 순서 */
  failedY: number[];
  /** 그 호의 배포 — 완료 KST "07:21"(다음 날이면 date) · 오늘 '배포 중' · 모름(null) */
  deploy: StatusDeploy;
  /** 날짜 이동 상세 줄 · 화면 밖 목록 한 줄 */
  line: string;
}

/** 배포 완료 — `deployOf` 규칙(머리 주석). null = 모름(목록 없음 · 범위 밖 · 발행 없음) */
export type StatusDeploy =
  | { kind: "done"; at: string; nextDay: string | null }
  | { kind: "pending" }
  | null;

export interface StatusLast {
  date: string;
  no: number | null;
  /** "11월 2일 (월)" */
  dateLabel: string;
  /** 수집 완료 KST "07:18" */
  finished: string;
  /** 그날 공개 목표 KST "07:30" */
  target: string;
  /** 표시 분 단위로 잰 목표 − 완료(양수 = 앞, 음수 = 뒤) */
  leadMinutes: number;
  /** 그 호의 배포 완료 · 배포 중 · 모름 */
  deploy: StatusDeploy;
}

export interface StatusRunRate {
  runs: number;
  ok: number;
  failed: number;
  /** "96.0"(소수 한 자리) */
  pct: string;
  /** ok가 0이면 true — 윤곽 숫자(값 0) */
  zero: boolean;
}

export interface StatusCost {
  /** KST 달 "YYYY-MM" */
  month: string;
  /** "3.56"(소수 두 자리, prod + dev ÷ 월 예산) */
  pct: string;
  zero: boolean;
  /** 지난달(실행 기록이 있을 때만) */
  previous: { month: string; pct: string } | null;
}

export interface StatusSourceRow {
  id: string;
  /** 설정 이름 — 설정에 없으면 id */
  name: string;
  /** 설정 Tier — 설정에 없으면 null */
  tier: Tier | null;
  lang: string | null;
  /** 최근 7일 성공(응답) 횟수 / 시도(시간 예산 초과 제외) */
  ok: number;
  attempts: number;
  /** 최근 7일 새 기사 합 — `usable`을 남긴 실행이 없으면 null(값 없음) */
  fresh: number | null;
  /** 새 기사 없음 연속(실행 단위) */
  stale: number;
  /** 없음 연속이 이슈 기준(7) 이상 */
  flagged: boolean;
}

export interface StatusAxisLabel {
  x: number;
  md: string;
  /** 마지막 열 — 오른쪽 맞춤 */
  end: boolean;
}

export interface StatusView {
  /** 이 쪽 기준(빌드 시각, UTC ISO) */
  asOf: string;
  /** "11월 3일 (화) 17:44" */
  asOfLabel: string;
  from: string;
  to: string;
  last: StatusLast | null;
  runRate: StatusRunRate | null;
  cost: StatusCost;
  days: StatusDay[];
  counts: Record<PublishDayState, number>;
  /** 구간 안 실패한 실행 수(그래프 ✕) */
  failedRunCount: number;
  /** 창간 전 칸 수(왼쪽부터 이어진다) */
  prelaunchDays: number;
  /** 공개 목표 계단선 SVG path(viewBox 0 0 100 100) — 창간 전 칸 제외, 그릴 칸이 없으면 "" */
  targetPath: string;
  /** 계단선 라벨 자리(첫 창간 후 칸) — 없으면 null */
  targetLabel: { x: number; y: number } | null;
  axis: StatusAxisLabel[];
  /** 기본 선택 칸(마지막 = 오늘) */
  selected: number;
  sources: StatusSourceRow[];
  /** 소스 표 구간 */
  sourceFrom: string;
  sourceTo: string;
}

export interface StatusInput {
  prodRuns: readonly RunLog[];
  devRuns: readonly RunLog[];
  asOf: string;
  monthlyBudget: number;
  /** 소스 설정(configs/sources.json) — id · 이름 · Tier · 언어 */
  sources: readonly { id: string; name: string; tier: Tier; lang: string }[];
  /** github-pages 배포 성공 시각(UTC ISO, 순서 무관) — deploy.yml이 넘긴다. 없으면(null · 생략) 배포 칸 숨김 */
  deploys?: readonly string[] | null;
}

/** 첫 발행 실행의 수집 완료 뒤 이 시간 안에 끝난 첫 배포를 그 호의 배포로 본다 */
export const DEPLOY_MATCH_HOURS = 12;

/**
 * 발행일 하나의 배포 완료(머리 주석 규칙) — `deploys` = 배포 성공 시각(UTC ISO), `publishedAt` = 첫 발행 실행의 수집 완료,
 * 오늘(asOf의 KST 날짜)이면 못 찾았을 때 '배포 중'. asOf 뒤의 배포는 보지 않는다.
 */
export function deployOf(
  date: string,
  publishedAt: string | null,
  deploys: readonly string[] | null | undefined,
  asOf: string,
): StatusDeploy {
  if (!deploys || publishedAt === null) return null;
  const from = Date.parse(publishedAt);
  const until = Math.min(
    from + DEPLOY_MATCH_HOURS * 3_600_000,
    Date.parse(asOf) + 1,
  );
  const hit = deploys
    .map((iso) => Date.parse(iso))
    .filter((t) => Number.isFinite(t) && t >= from && t < until)
    .sort((a, b) => a - b)[0];
  if (hit !== undefined) {
    const iso = new Date(hit).toISOString();
    const day = kstDate(iso);
    return {
      kind: "done",
      at: formatKst(iso, "time"),
      nextDay: day === date ? null : day,
    };
  }
  return date === kstDate(asOf) ? { kind: "pending" } : null;
}

// ─── 숫자 형식 ───────────────────────────────────────────────────────────

/** 비율(0~1) → "96.0" — 소수 한 자리 반올림 */
export function formatRatePct(rate: number): string {
  return (Math.round(rate * 1000) / 10).toFixed(1);
}

/** 비율(0~1) → "3.56" — 소수 두 자리 반올림(비용 — 금액은 쓰지 않는다) */
export function formatSharePct(share: number): string {
  return (Math.round(share * 10_000) / 100).toFixed(2);
}

/** 분 차이(부호 무시) → 숫자 · 단위 조각 — 12 → [12분] · 65 → [1시간, 5분] · 120 → [2시간] */
export function durationParts(
  minutes: number,
): { n: number; unit: "시간" | "분" }[] {
  const m = Math.abs(minutes);
  if (m < 60) return [{ n: m, unit: "분" }];
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0
    ? [{ n: h, unit: "시간" }]
    : [
        { n: h, unit: "시간" },
        { n: rest, unit: "분" },
      ];
}

/** "YYYY-MM-DD" → "11.02" */
function monthDot(date: string): string {
  return date.slice(5).replace("-", ".");
}

/** 직전 달 "YYYY-MM" */
function previousMonth(month: string): string {
  return shiftDate(`${month}-01`, -1).slice(0, 7);
}

// ─── 좌표 ────────────────────────────────────────────────────────────────

const DAY_MINUTES = 24 * 60;

/** 발행일 0시(KST)부터 그 시각까지 분(표시 분 단위 — 초 버림). 다음 날로 넘어가면 24시에서 멈춘다 */
function minutesInto(date: string, iso: string): number {
  const start = Date.parse(kstDayRangeUtc(date).start);
  const minutes =
    Math.floor(Date.parse(iso) / 60_000) - Math.floor(start / 60_000);
  return Math.min(DAY_MINUTES, Math.max(0, minutes));
}

/** 하루 안 분 → y(%) — 위 0 = 24시 */
function yOf(minutes: number): number {
  return round2(100 * (1 - minutes / DAY_MINUTES));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 열 i의 가운데 x(%) */
export function columnX(index: number, columns = STATUS_WINDOW_DAYS): number {
  return round2((100 * (index + 0.5)) / columns);
}

/** 가로축 날짜 라벨 — 첫 칸 + 오늘에서 7일 간격(첫 칸과 3칸 안으로 붙으면 뺀다) */
function axisLabels(days: readonly StatusDay[]): StatusAxisLabel[] {
  const last = days.length - 1;
  if (last < 0) return [];
  const picks = new Set<number>([0]);
  for (let i = last; i >= 0; i -= 7) {
    if (i === 0 || i >= 3) picks.add(i);
  }
  return [...picks]
    .sort((a, b) => a - b)
    .map((i) => ({
      x: columnX(i, days.length),
      md: (days[i] as StatusDay).md,
      end: i === last,
    }));
}

// ─── 화면 모델 ───────────────────────────────────────────────────────────

function dayLine(day: Omit<StatusDay, "line">, finishedDate: string | null) {
  const dow = formatKst(kstDayRangeUtc(day.date).start, "dayShort").slice(6);
  const parts = [`${day.md} ${dow}`];
  if (day.no !== null) parts.push(`제 ${day.no}호`);
  parts.push(DAY_STATE_LABEL[day.state]);
  if (day.finished !== null) {
    const nextDay =
      finishedDate !== null && finishedDate !== day.date
        ? `(${monthDot(finishedDate)})`
        : "";
    parts.push(`수집 완료 ${day.finished}${nextDay}`);
  }
  if (day.deploy?.kind === "done") {
    const next = day.deploy.nextDay ? `(${monthDot(day.deploy.nextDay)})` : "";
    parts.push(`배포 완료 ${day.deploy.at}${next}`);
  } else if (day.deploy?.kind === "pending") {
    parts.push("배포 중");
  }
  if (day.state !== "prelaunch") parts.push(`공개 목표 ${day.target}`);
  if (day.failedRuns.length > 0) {
    parts.push(
      `실패한 실행 ${day.failedRuns.length}회(${day.failedRuns.join(", ")})`,
    );
  }
  return parts.join(" · ");
}

/** 공개 상태 화면 모델 — 머리 주석 규칙 */
export function buildStatusView(input: StatusInput): StatusView {
  const { asOf } = input;
  const prod = runsUpTo(input.prodRuns, asOf);
  const dev = runsUpTo(input.devRuns, asOf);
  const to = kstDate(asOf);
  const from = shiftDate(to, -(STATUS_WINDOW_DAYS - 1));

  // ── 30칸 발행일 ──
  const judged = publishDays(from, to, prod, asOf);
  const days: StatusDay[] = judged.map((d, i) => {
    const target = formatKst(d.publishTarget, "time");
    const failed = prod
      .filter(
        (run) =>
          run.env === "prod" &&
          run.job === "collect" &&
          run.status === "failed" &&
          kstDate(run.startedAt) === d.date,
      )
      .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
    const base = {
      date: d.date,
      md: monthDot(d.date),
      state: d.state,
      no: issueNumber(d.date),
      target,
      finished: d.publishedAt ? formatKst(d.publishedAt, "time") : null,
      failedRuns: failed.map((run) => formatKst(run.startedAt, "time")),
      x: columnX(i, judged.length),
      y: d.publishedAt ? yOf(minutesInto(d.date, d.publishedAt)) : null,
      targetY: yOf(minutesInto(d.date, publishSlot(d.date).publishTarget)),
      failedY: failed.map((run) => yOf(minutesInto(d.date, run.startedAt))),
      deploy: deployOf(d.date, d.publishedAt, input.deploys, asOf),
    };
    return {
      ...base,
      line: dayLine(base, d.publishedAt ? kstDate(d.publishedAt) : null),
    };
  });
  const prelaunchDays = days.filter((d) => d.state === "prelaunch").length;
  let targetPath = "";
  for (const [i, d] of days.entries()) {
    if (d.state === "prelaunch") continue;
    const x0 = round2((100 * i) / days.length);
    const x1 = round2((100 * (i + 1)) / days.length);
    targetPath += `${targetPath ? "L" : "M"}${x0} ${d.targetY}L${x1} ${d.targetY}`;
  }
  const firstLive = days.find((d) => d.state !== "prelaunch");

  // ── 숫자판 ──
  const published = lastPublication(prod, asOf);
  let last: StatusLast | null = null;
  if (published) {
    const target = publishSlot(published.date).publishTarget;
    last = {
      date: published.date,
      no: issueNumber(published.date),
      dateLabel: formatKst(kstDayRangeUtc(published.date).start, "date"),
      finished: formatKst(published.publishedAt, "time"),
      target: formatKst(target, "time"),
      leadMinutes:
        Math.floor(Date.parse(target) / 60_000) -
        Math.floor(Date.parse(published.publishedAt) / 60_000),
      deploy: deployOf(
        published.date,
        published.publishedAt,
        input.deploys,
        asOf,
      ),
    };
  }
  const stats = recentRunStats(prod, asOf);
  const runRate: StatusRunRate | null =
    stats.rate === null
      ? null
      : {
          runs: stats.runs,
          ok: stats.ok,
          failed: stats.runs - stats.ok,
          pct: formatRatePct(stats.rate),
          zero: stats.ok === 0,
        };
  const all = [...prod, ...dev];
  const month = kstMonth(asOf);
  const usage = monthBudgetUsage(all, month, asOf, input.monthlyBudget);
  const prevMonth = previousMonth(month);
  const prevRuns = all.some((run) => kstMonth(run.startedAt) === prevMonth);
  const cost: StatusCost = {
    month,
    pct: formatSharePct(usage.share),
    zero: usage.total === 0,
    previous: prevRuns
      ? {
          month: prevMonth,
          pct: formatSharePct(
            monthBudgetUsage(all, prevMonth, asOf, input.monthlyBudget).share,
          ),
        }
      : null,
  };

  // ── 소스 ──
  const sourceFrom = shiftDate(to, -(STATUS_SOURCE_DAYS - 1));
  const history = healthRuns(prod, { runId: "", startedAt: asOf });
  const current = history.filter((run) => run.status !== "skipped").at(-1);
  const config = new Map(input.sources.map((s) => [s.id, s]));
  const sources: StatusSourceRow[] = current
    ? assessSourceHealth({
        run: current,
        current: current.sources,
        history,
      }).map((h) => {
        const week = sourceStats(
          sourceHistory(history, h.id),
          asOf,
          STATUS_SOURCE_DAYS,
        );
        const c = config.get(h.id);
        return {
          id: h.id,
          name: c?.name ?? h.id,
          tier: c?.tier ?? null,
          lang: c?.lang ?? null,
          ok: week.ok,
          attempts: week.attempts,
          fresh: week.usableRuns > 0 ? week.usable : null,
          stale: h.staleStreak.count,
          flagged: h.staleStreak.count >= STALE_STREAK_THRESHOLD,
        };
      })
    : [];

  return {
    asOf,
    asOfLabel: formatKst(asOf, "datetime"),
    from,
    to,
    last,
    runRate,
    cost,
    days,
    counts: countPublishDays(days),
    failedRunCount: days.reduce((n, d) => n + d.failedRuns.length, 0),
    prelaunchDays,
    targetPath,
    targetLabel: firstLive
      ? {
          x: round2((100 * days.indexOf(firstLive)) / days.length),
          y: firstLive.targetY,
        }
      : null,
    axis: axisLabels(days),
    selected: days.length - 1,
    sources,
    sourceFrom,
    sourceTo: to,
  };
}

/** 최근 30일(KST 날짜 30개 — 오늘 포함, asOf까지) prod 수집 실행 성공률(실행 기준 — D71) */
function recentRunStats(prodRuns: readonly RunLog[], asOf: string) {
  const to = kstDate(asOf);
  const from = shiftDate(to, -(STATUS_WINDOW_DAYS - 1));
  return collectRunStats(runsUpTo(prodRuns, asOf), {
    from: kstDayRangeUtc(from).start,
    to: asOf,
  });
}

/** 뒤표지 링크 숫자 — `/status` 숫자판과 같은 계산(`recentRunStats` 하나). 실행이 없으면 null */
export function statusRunRatePct(
  prodRuns: readonly RunLog[],
  asOf: string,
): string | null {
  const { rate } = recentRunStats(prodRuns, asOf);
  return rate === null ? null : formatRatePct(rate);
}
