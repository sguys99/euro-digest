/**
 * 소스 건강도 판정 (M1-11, PRD FR-11·FR-151·FR-152·§10, §15 D35) — 순수 함수만 둔다.
 *
 * 입력: prod `data/runs.json` 기록(이번 실행을 기록하기 전에 읽은 것) + 이번 실행의 소스별 결과(RunLog.sources 형식).
 * 출력: 소스별 상태·연속 횟수·최근 7일 집계 + 이슈로 낼 사건 → `source-broken` 이슈 payload(소스별 이슈 하나, 원인 키
 * `source:<id>`). 파일 읽기·쓰기·로그·GitHub 요청은 호출부(collect-run.ts · scripts/report-issue.ts)가 한다.
 *
 * ── 실행 1회의 소스 상태 (`classifySourceRun`) ──────────────────────────
 *   budget     ok:false && error === "budget" — 수집 시간 예산 초과로 건너뜀. 소스 장애가 아니다
 *   failed     ok:false (budget 제외, error가 없는 옛 기록 포함)
 *   empty      ok:true && items === 0 — 빈 피드
 *   legacy-ok  ok:true && items > 0 && usable 없음 — `usable`을 남기기 전(M1-11 이전)의 성공 기록
 *   no-new     ok:true && items > 0 && usable === 0 — 응답했지만 수집 창 안 새 기사 없음
 *   fresh      ok:true && items > 0 && usable > 0
 *
 * ── 연속 횟수 (이번 실행에서 거슬러 올라간다) ─────────────────────────────
 *   실패·빈 피드 연속(`failStreak`): failed·empty면 +1, budget은 건너뛰고(끊지도 늘리지도 않음) 앞 기록과 이어서 보며,
 *     그 밖(fresh·no-new·legacy-ok — 피드가 항목을 돌려줌)에서 끊는다.
 *   새 기사 없음 연속(`staleStreak`): no-new면 +1, fresh에서 끊는다. budget·failed·empty·legacy-ok는 건너뛴다 —
 *     실패한 날은 새 기사가 있었는지 알 수 없고(다음 성공 실행이 소스별 창으로 그 기간을 다시 받는다, M1-10),
 *     빈 피드는 실패·빈 피드 규칙이 맡으며, `usable`이 없는 옛 기록은 새 기사 수를 모른다(D35).
 *   실행 단위로 센다("3회 연속" — 하루 1회 실행 기준 = FR-11의 3일). 같은 날 재실행(force)도 1회로 센다.
 *   **연속 횟수는 커밋된 실행 기록만 센다** — 실패해(exit 1) 커밋되지 않은 실행은 runs.json에 없으므로 빠진다
 *   (예: 모든 소스가 실패한 날). TODO(M1-27): 실패 실행의 기록을 보존하면 그날도 연속에 들어간다. 최근 7일 집계도 같다.
 *
 * ── 이슈로 낼 사건 (이번 실행의 상태로 정한다 — 소스마다 최대 1건) ───────────
 *   failed 상태    → 실패·빈 피드 연속 ≥ 3이면 `failing-streak`, 아니면 `failed`(PRD §10 "수집 일부 실패 → 이슈")
 *   empty 상태     → 실패·빈 피드 연속 ≥ 3이면 `failing-streak`
 *   no-new 상태    → 새 기사 없음 연속 ≥ 7이면 `stale-streak`
 *   그 밖(fresh·budget·legacy-ok) → 사건 없음. budget 실행은 어느 쪽에도 세지 않으므로 사건도 내지 않는다.
 *   연속이 기준 이상인 동안은 매 실행 사건을 낸다 — 열린 이슈에는 댓글로 쌓이고(FR-152), 이슈를 닫았는데 그대로면 새 이슈.
 *   **전체 실패 실행**(이번 실행에서 성공한 소스가 0개 — budget은 성공이 아니다): 원인이 하나(러너 네트워크 등)이고
 *   뉴스 단계가 실패해 pipeline-failure 이슈가 이미 생기므로(collect-run.ts exit 1), FR-152(같은 원인은 하나)에 따라
 *   소스별 `failed` 사건은 내지 않는다(`suppressedEvent`에 남김). 연속 사건(`failing-streak`·`stale-streak`)은 그대로 낸다.
 *
 * ── 최근 7일 집계 (`sourceStats`) ────────────────────────────────────────
 *   기간 = 이번 실행의 KST 날짜와 그 앞 6일(KST 날짜 7개), 이번 실행 포함. 성공률 = ok / 시도(budget 제외).
 *   수집 건수 = 피드 원문 items 합 · 창 안 새 항목 usable 합(`usable`이 기록된 실행만). runs.json에 요약 필드를 따로
 *   저장하지 않고(D35) 운영 리포트(M5-09)·/status가 같은 함수로 계산한다.
 *
 * 기록 범위: prod·collect 실행만(runs-dev.json의 dev 실행은 보지 않는다 — 발행 기록이 아니다), 이번 실행보다 늦게
 * 시작한 기록(시계 오류)과 이번 실행과 같은 runId는 뺀다. 이번 실행에서 수집 대상이 아니었던 소스(비활성)는 판정하지 않는다.
 */
import type { RunLog, RunSource } from "@/lib/schema";
import { kstDate, kstDayRangeUtc, parseUtcIso, shiftDate } from "@/lib/time";

import {
  SOURCE_SYMPTOMS,
  sourceIssueKey,
  type IssuePayloadInput,
  type SourceEventType,
  type SourceRunState,
} from "./github-issues";

export type { SourceEventType, SourceRunState } from "./github-issues";

// ─── 기준 ────────────────────────────────────────────────────────────────

/** 요청 실패·빈 피드가 이만큼 연속이면 이슈 (FR-11 "3일 연속 0건", D35) */
export const FAIL_STREAK_THRESHOLD = 3;
/** 피드는 응답하지만 새 기사가 이만큼 연속 0건이면 이슈 (D35 — 갱신이 드문 피드의 오탐 방지) */
export const STALE_STREAK_THRESHOLD = 7;
/** 성공률·수집 건수 집계 기간(KST 날짜 수, 이번 실행 날짜 포함) */
export const HEALTH_STATS_DAYS = 7;
/** 이슈 본문 표에 싣는 최근 실행 수(이번 실행 포함) */
export const HEALTH_RECENT_MAX = 10;
/** 시간 예산 초과 실패 종류 — 건강도 계산에서 뺀다 (feed-collect.ts `budget`) */
export const BUDGET_ERROR = "budget";

// ─── 타입 ────────────────────────────────────────────────────────────────

/** 실행 1회의 이 소스 기록 */
export interface SourceRunRecord {
  runId: string;
  startedAt: string;
  ok: boolean;
  items: number;
  usable?: number;
  error?: string;
  state: SourceRunState;
}

export interface Streak {
  /** 연속 횟수(0이면 연속 아님) */
  count: number;
  /** 연속이 시작된 실행의 시작 시각(UTC ISO) — count 0이면 null */
  since: string | null;
}

/** 최근 7일 집계 */
export interface SourceStats {
  /** 기간 첫 KST 날짜 */
  fromDate: string;
  /** 기간 마지막 KST 날짜(= 이번 실행 날짜) */
  toDate: string;
  /** 기간 안 기록 수(budget 포함) */
  runs: number;
  /** 시도 횟수(budget 제외) */
  attempts: number;
  /** 성공(ok:true) 횟수 */
  ok: number;
  /** 시간 예산 초과로 건너뛴 횟수 */
  budget: number;
  /** ok / attempts(소수 셋째 자리) — 시도가 없으면 null */
  successRate: number | null;
  /** 피드 원문 항목 수 합 */
  items: number;
  /** 수집 창 안 새 항목 수 합(`usable`이 있는 기록만) */
  usable: number;
  /** `usable`이 기록된 실행 수 */
  usableRuns: number;
}

export interface HealthEvent {
  type: SourceEventType;
  /** 사건의 연속 횟수(failed는 실패·빈 피드 연속 — 1~2) */
  streak: number;
  /** 연속이 시작된 실행 시각(UTC ISO) */
  since: string;
}

/** 소스 1개의 건강도 */
export interface SourceHealth {
  id: string;
  /** 이번 실행의 기록 */
  current: SourceRunRecord;
  /** 이번 실행의 HTTP 상태(받기 실패이고 응답이 있었을 때만) */
  httpStatus: number | null;
  /** 실패·빈 피드 연속(budget 건너뜀) */
  failStreak: Streak;
  /** 새 기사 없음 연속(budget·실패·빈 피드·옛 기록 건너뜀) */
  staleStreak: Streak;
  /** 최근 7일 집계(이번 실행 포함) */
  stats: SourceStats;
  /** 최근 기록(오래된 → 최근, 마지막이 이번 실행, 최대 HEALTH_RECENT_MAX) */
  recent: SourceRunRecord[];
  /** 이슈로 낼 사건(없으면 null) */
  event: HealthEvent | null;
  /** 전체 실패 실행이라 내지 않은 사건(`failed`만 해당, 없으면 null) */
  suppressedEvent: HealthEvent | null;
}

/** 이번 실행의 소스 결과 — runs.json에 남길 기록 + (있으면) HTTP 상태 */
export type CurrentSourceResult = RunSource & { httpStatus?: number | null };

// ─── 분류·이력 ───────────────────────────────────────────────────────────

/** runs.json `sources[]` 한 줄 → 상태 (규칙은 파일 머리 주석) */
export function classifySourceRun(
  entry: Pick<RunSource, "ok" | "items" | "usable" | "error">,
): SourceRunState {
  if (!entry.ok) return entry.error === BUDGET_ERROR ? "budget" : "failed";
  if (entry.items === 0) return "empty";
  if (entry.usable === undefined) return "legacy-ok";
  return entry.usable === 0 ? "no-new" : "fresh";
}

function toRecord(
  run: Pick<RunLog, "runId" | "startedAt">,
  entry: RunSource,
): SourceRunRecord {
  return {
    runId: run.runId,
    startedAt: run.startedAt,
    ok: entry.ok,
    items: entry.items,
    ...(entry.usable !== undefined ? { usable: entry.usable } : {}),
    ...(entry.error !== undefined ? { error: entry.error } : {}),
    state: classifySourceRun(entry),
  };
}

function ms(iso: string): number {
  return parseUtcIso(iso).getTime();
}

/** 건강도에 쓰는 기록 — prod·collect, 이번 실행보다 늦지 않고 이번 runId가 아닌 것 (시작 시각 오름차순, 같으면 입력 순서) */
export function healthRuns(
  runs: readonly RunLog[],
  current: { runId: string; startedAt: string },
): RunLog[] {
  const nowMs = ms(current.startedAt);
  return runs
    .map((run, index) => ({ run, index }))
    .filter(
      ({ run }) =>
        run.env === "prod" &&
        run.job === "collect" &&
        run.runId !== current.runId &&
        ms(run.startedAt) <= nowMs,
    )
    .sort(
      (a, b) => ms(a.run.startedAt) - ms(b.run.startedAt) || a.index - b.index,
    )
    .map(({ run }) => run);
}

/** 이 소스가 들어 있는 기록만(오래된 → 최근). 소스가 없는 실행(그때 수집 대상이 아님)은 건너뛴다 */
export function sourceHistory(
  runs: readonly RunLog[],
  sourceId: string,
): SourceRunRecord[] {
  return runs.flatMap((run) => {
    const entry = run.sources.find((s) => s.id === sourceId);
    return entry ? [toRecord(run, entry)] : [];
  });
}

// ─── 연속 ────────────────────────────────────────────────────────────────

function countBackward(
  records: readonly SourceRunRecord[],
  rule: (state: SourceRunState) => "count" | "skip" | "stop",
): Streak {
  let count = 0;
  let since: string | null = null;
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i] as SourceRunRecord;
    const verdict = rule(record.state);
    if (verdict === "stop") break;
    if (verdict === "count") {
      count += 1;
      since = record.startedAt;
    }
  }
  return { count, since };
}

/** 실패·빈 피드 연속 — failed·empty 셈, budget 건너뜀, 나머지에서 끊음 */
export function failStreak(records: readonly SourceRunRecord[]): Streak {
  return countBackward(records, (state) => {
    switch (state) {
      case "failed":
      case "empty":
        return "count";
      case "budget":
        return "skip";
      case "fresh":
      case "no-new":
      case "legacy-ok":
        return "stop";
      default:
        return assertNever(state);
    }
  });
}

/** 새 기사 없음 연속 — no-new 셈, fresh에서 끊음, 나머지(budget·failed·empty·legacy-ok) 건너뜀 */
export function staleStreak(records: readonly SourceRunRecord[]): Streak {
  return countBackward(records, (state) => {
    switch (state) {
      case "no-new":
        return "count";
      case "fresh":
        return "stop";
      case "budget":
      case "failed":
      case "empty":
      case "legacy-ok":
        return "skip";
      default:
        return assertNever(state);
    }
  });
}

// ─── 최근 7일 ────────────────────────────────────────────────────────────

/** 최근 KST 날짜 `days`개(이번 실행 날짜 포함) 안의 기록으로 성공률·수집 건수를 센다 */
export function sourceStats(
  records: readonly SourceRunRecord[],
  now: string,
  days: number = HEALTH_STATS_DAYS,
): SourceStats {
  const toDate = kstDate(now);
  const fromDate = shiftDate(toDate, -(days - 1));
  const fromMs = ms(kstDayRangeUtc(fromDate).start);
  const nowMs = ms(now);
  const inRange = records.filter((r) => {
    const t = ms(r.startedAt);
    return t >= fromMs && t <= nowMs;
  });
  const budget = inRange.filter((r) => r.state === "budget").length;
  const attempts = inRange.length - budget;
  const ok = inRange.filter((r) => r.ok).length;
  const withUsable = inRange.filter((r) => r.usable !== undefined);
  return {
    fromDate,
    toDate,
    runs: inRange.length,
    attempts,
    ok,
    budget,
    successRate:
      attempts > 0 ? Math.round((ok / attempts) * 1000) / 1000 : null,
    items: inRange.reduce((sum, r) => sum + r.items, 0),
    usable: withUsable.reduce((sum, r) => sum + (r.usable ?? 0), 0),
    usableRuns: withUsable.length,
  };
}

// ─── 판정 ────────────────────────────────────────────────────────────────

/** 이번 실행의 상태와 연속 횟수로 사건을 정한다 (규칙은 파일 머리 주석) */
export function healthEvent(
  state: SourceRunState,
  fail: Streak,
  stale: Streak,
  startedAt: string,
): HealthEvent | null {
  switch (state) {
    case "failed":
      return {
        type: fail.count >= FAIL_STREAK_THRESHOLD ? "failing-streak" : "failed",
        streak: Math.max(1, fail.count),
        since: fail.since ?? startedAt,
      };
    case "empty":
      return fail.count >= FAIL_STREAK_THRESHOLD
        ? {
            type: "failing-streak",
            streak: fail.count,
            since: fail.since ?? startedAt,
          }
        : null;
    case "no-new":
      return stale.count >= STALE_STREAK_THRESHOLD
        ? {
            type: "stale-streak",
            streak: stale.count,
            since: stale.since ?? startedAt,
          }
        : null;
    case "fresh":
    case "budget":
    case "legacy-ok":
      return null;
    default:
      return assertNever(state);
  }
}

export interface AssessInput {
  /** 이번 실행 */
  run: { runId: string; startedAt: string };
  /** 이번 실행에서 수집을 시도한 소스(설정 순서) — 비활성 소스는 여기 없으므로 판정하지 않는다 */
  current: readonly CurrentSourceResult[];
  /** prod runs.json 기록(이번 실행을 기록하기 전) — 읽지 못했으면 [](이번 실행만으로 판정) */
  history: readonly RunLog[];
}

/**
 * 전체 실패 실행인가 — 수집을 시도한 소스가 있고 그중 성공(ok:true)이 0개. budget은 성공이 아니므로
 * "실패 + budget"만 있어도 전체 실패다(시간 예산 소진도 같은 원인 — 응답이 느린 러너 네트워크 등 — 에서 온다).
 * collect-run.ts가 뉴스 단계를 실패(all-sources-failed, exit 1)로 끝내는 조건과 같다.
 */
export function isWholeRunFailure(
  current: readonly Pick<RunSource, "ok">[],
): boolean {
  return current.length > 0 && current.every((entry) => !entry.ok);
}

/** 소스별 건강도 — 입력 순서(설정 순서) 그대로 */
export function assessSourceHealth(input: AssessInput): SourceHealth[] {
  const past = healthRuns(input.history, input.run);
  const wholeRunFailed = isWholeRunFailure(input.current);
  return input.current.map((entry) => {
    const current = toRecord(input.run, entry);
    const records = [...sourceHistory(past, entry.id), current];
    const fail = failStreak(records);
    const stale = staleStreak(records);
    const event = healthEvent(current.state, fail, stale, input.run.startedAt);
    // 전체 실패면 이번 실행 실패 사건(failed)만 뺀다 — 연속 사건은 그대로(파일 머리 주석)
    const suppress = wholeRunFailed && event?.type === "failed";
    return {
      id: entry.id,
      current,
      httpStatus: entry.httpStatus ?? null,
      failStreak: fail,
      staleStreak: stale,
      stats: sourceStats(records, input.run.startedAt),
      recent: records.slice(-HEALTH_RECENT_MAX),
      event: suppress ? null : event,
      suppressedEvent: suppress ? event : null,
    };
  });
}

// ─── 이슈 payload ────────────────────────────────────────────────────────

type Symptom = (typeof SOURCE_SYMPTOMS)[number];

/** 기록 1건 → 이슈 폼 증상 */
export function symptomOf(
  record: Pick<SourceRunRecord, "state" | "error">,
): Symptom | null {
  switch (record.state) {
    case "empty":
    case "no-new":
      return "0건 수집";
    case "failed":
      if (record.error === "http-4xx" || record.error === "http-5xx") {
        return "피드 URL 오류(4xx·5xx)";
      }
      return record.error === "parse" ? "파싱 실패" : "기타";
    case "fresh":
    case "budget":
    case "legacy-ok":
      return null;
    default:
      return assertNever(record.state);
  }
}

/** 사건에 해당하는 기록들의 증상(이슈 폼 선택지 순서, 중복 없음) */
export function eventSymptoms(
  records: readonly SourceRunRecord[],
  event: HealthEvent,
): Symptom[] {
  const sinceMs = ms(event.since);
  const counted = records.filter((r) => {
    if (ms(r.startedAt) < sinceMs) return false;
    return event.type === "stale-streak"
      ? r.state === "no-new"
      : r.state === "failed" || r.state === "empty";
  });
  const found = new Set(counted.flatMap((r) => symptomOf(r) ?? []));
  const ordered = SOURCE_SYMPTOMS.filter((s) => found.has(s));
  return ordered.length > 0 ? ordered : ["기타"];
}

export interface IssueContext {
  /** 소스 id → 표시 이름(configs/sources.json `name`) */
  sourceNames: ReadonlyMap<string, string>;
  /** Actions 실행 URL(로컬이면 없음) */
  runUrl?: string;
}

/** 사건 1건 → `source-broken` 이슈 payload(원인 키는 기본값 `source:<id>`) */
export function healthIssuePayload(
  health: SourceHealth,
  context: IssueContext,
): IssuePayloadInput<"source-broken"> | null {
  const { event, current, stats } = health;
  if (!event) return null;
  const name = context.sourceNames.get(health.id);
  const errorType =
    current.error && /^[a-z0-9][a-z0-9-]*$/.test(current.error)
      ? current.error.slice(0, 40)
      : undefined;
  const { httpStatus } = health;
  return {
    sourceId: health.id,
    ...(name ? { sourceName: name.slice(0, 100) } : {}),
    symptoms: eventSymptoms(health.recent, event),
    firstSeen: kstDate(event.since),
    ...(context.runUrl ? { runUrl: context.runUrl } : {}),
    runId: current.runId.slice(0, 100),
    occurredAt: current.startedAt,
    event: event.type,
    streak: event.streak,
    ...(errorType ? { errorType } : {}),
    ...(httpStatus !== null &&
    Number.isInteger(httpStatus) &&
    httpStatus >= 100 &&
    httpStatus <= 599
      ? { httpStatus }
      : {}),
    stats7d: {
      from: stats.fromDate,
      to: stats.toDate,
      attempts: stats.attempts,
      ok: stats.ok,
      budget: stats.budget,
      items: Math.max(0, Math.round(stats.items)),
      usable: stats.usable,
      usableRuns: stats.usableRuns,
    },
    recent: health.recent.map((r) => ({
      startedAt: r.startedAt,
      state: r.state,
      items: Math.max(0, Math.round(r.items)),
      ...(r.usable !== undefined ? { usable: r.usable } : {}),
      ...(r.error && /^[a-z0-9][a-z0-9-]*$/.test(r.error)
        ? { error: r.error.slice(0, 40) }
        : {}),
    })),
  };
}

/** 사건이 있는 소스만 payload로 (입력 순서) */
export function healthIssuePayloads(
  health: readonly SourceHealth[],
  context: IssueContext,
): Array<IssuePayloadInput<"source-broken">> {
  return health.flatMap((h) => {
    const payload = healthIssuePayload(h, context);
    return payload ? [payload] : [];
  });
}

/** 사건의 원인 키(로그용) — github-issues.ts 기본 키와 같다 */
export function healthIssueKey(sourceId: string): string {
  return sourceIssueKey(sourceId);
}

// ─── 로그 ────────────────────────────────────────────────────────────────

/** 소스별 한 줄 요약 필드(`collect.source.health`) */
export function healthLogFields(health: SourceHealth) {
  const { current, stats } = health;
  return {
    source: health.id,
    state: current.state,
    items: current.items,
    usable: current.usable ?? null,
    error: current.error ?? null,
    failStreak: health.failStreak.count,
    staleStreak: health.staleStreak.count,
    successRate7d: stats.successRate,
    ok7d: stats.ok,
    attempts7d: stats.attempts,
    budget7d: stats.budget,
    items7d: stats.items,
    usable7d: stats.usable,
    // 로그 레코드의 `event`(이벤트 이름)와 겹치지 않게 다른 이름을 쓴다
    healthEvent: health.event?.type ?? null,
    suppressedEvent: health.suppressedEvent?.type ?? null,
  };
}

function assertNever(value: never): never {
  throw new Error(`알 수 없는 소스 상태: ${String(value)}`);
}
