/**
 * 소스 건강도 판정 (M1-11, PRD FR-11·FR-151·FR-152·§10, §15 D35) — 순수 함수만 둔다.
 *
 * **위치**(M5-15): 판정·집계부는 화면(`/status` — P-1)도 쓰므로 src/lib에 둔다(화면 코드가 scripts/를 import하지 않는 관례).
 * 이슈 payload·로그 필드는 scripts/lib/source-health.ts에 남고, 그 파일이 이 모듈을 다시 내보낸다(동작 불변 —
 * tests/source-health.test.ts가 scripts 경로로 그대로 검사한다). 파싱 실패 진단 형식은 scripts 쪽 타입이라 여기서는 타입 매개변수 `D`로 받는다.
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
 *   **연속 횟수는 runs.json에 커밋된 실행 기록을 센다** — 발행되지 않은 실행(뉴스 실패 exit 1·검증·빌드·커밋 실패)도
 *   collect.yml `실패 실행 기록 보존` 단계가 상태 failed로 커밋하므로(M1-27) 그날도 연속·최근 7일 집계에 들어간다(실행 상태와
 *   무관하게 소스별 기록만 본다). 그 단계까지 실패한 실행(드묾 — 실패 이슈 메모에 남는다)만 빠진다.
 *
 * ── 이슈로 낼 사건 (이번 실행의 상태로 정한다 — 소스마다 최대 1건) ───────────
 *   failed 상태    → 실패·빈 피드 연속 ≥ 3이면 `failing-streak`, 아니면 `failed`(PRD §10 "수집 일부 실패 → 이슈")
 *   empty 상태     → 실패·빈 피드 연속 ≥ 3이면 `failing-streak`
 *   no-new 상태    → 새 기사 없음 연속 ≥ 7이면 `stale-streak`
 *   그 밖(fresh·budget·legacy-ok) → 사건 없음. budget 실행은 어느 쪽에도 세지 않으므로 사건도 내지 않는다.
 *   연속이 기준 이상인 동안은 매 실행 사건을 낸다 — 열린 이슈에는 댓글로 쌓이고(FR-152), 이슈를 닫았는데 그대로면 새 이슈.
 *   **전체 실패 실행**(이번 실행에서 성공한 소스가 0개 — budget은 성공이 아니다): 원인이 하나(러너 네트워크 등)이고
 *   뉴스 단계가 실패해 pipeline-failure 이슈가 이미 생기므로(collect-run.ts exit 1), FR-152(같은 원인은 하나)에 따라
 *   소스별 사건은 **모두** 내지 않는다(`suppressedEvent`에 남김 — `failed`·`failing-streak`). M1-27 전에는 `failed`만 뺐다 —
 *   전체 실패 실행이 커밋되지 않아 연속에 들어가지 않았기 때문이다. 이제 그 실행도 기록되므로 전체 장애가 3회 이어지면 모든
 *   소스가 동시에 `failing-streak`이 되어 소스 수만큼 이슈가 생긴다(같은 원인 이슈 남발). 장애가 풀린 뒤에도 실패하는 소스는
 *   다음 실행에서 전체 장애 기간까지 이어 센 연속으로 사건을 낸다(같은 `source:<id>` 이슈라 이슈 수는 늘지 않는다).
 *   (`stale-streak`은 성공 상태(no-new)에서만 나므로 전체 실패 실행에는 생기지 않는다.)
 *
 * ── 최근 7일 집계 (`sourceStats`) ────────────────────────────────────────
 *   기간 = 이번 실행의 KST 날짜와 그 앞 6일(KST 날짜 7개), 이번 실행 포함. 성공률 = ok / 시도(budget 제외).
 *   수집 건수 = 피드 원문 items 합 · 창 안 새 항목 usable 합(`usable`이 기록된 실행만). runs.json에 요약 필드를 따로
 *   저장하지 않고(D35) 운영 리포트(M5-09)·/status가 같은 함수로 계산한다.
 *
 * 파싱 실패 진단(M1-03 보강): 이번 실행이 `parse` 실패면 호출부가 넘긴 응답 진단(본문 없음 — enum·숫자만)을 payload
 * `parseDiagnostics`로 싣는다. 이슈 스키마(ParseDiagnosticsPayloadSchema)를 통과하는 값만 싣고, 맞지 않으면 그 필드만 뺀다
 * (진단 때문에 이슈 자체가 빠지지 않게). runs.json에는 남기지 않으므로 이번 실행 것만 있다.
 *
 * 기록 범위: prod·collect 실행만(runs-dev.json의 dev 실행은 보지 않는다 — 발행 기록이 아니다), 이번 실행보다 늦게
 * 시작한 기록(시계 오류)과 이번 실행과 같은 runId는 뺀다. 이번 실행에서 수집 대상이 아니었던 소스(비활성)는 판정하지 않는다.
 */
import type { RunLog, RunSource } from "@/lib/schema";
import { kstDate, kstDayRangeUtc, parseUtcIso, shiftDate } from "@/lib/time";

/**
 * 소스 건강도 사건 (M1-11, PRD §15 D35) — 이 파일이 판정한다(scripts/lib/github-issues.ts가 다시 내보내 이슈 스키마에 쓴다).
 *   - failed          이번 실행에서 소스 받기·파싱이 실패했다(시간 예산 초과 `budget`은 사건이 아니다) — PRD §10
 *   - failing-streak  요청 실패·빈 피드가 3회 이상 연속(이번 실행 포함) — FR-11
 *   - stale-streak    피드는 응답하지만 수집 창 안의 새 기사가 7회 이상 연속 0건(이번 실행 포함)
 */
export const SOURCE_EVENT_TYPES = [
  "failed",
  "failing-streak",
  "stale-streak",
] as const;
export type SourceEventType = (typeof SOURCE_EVENT_TYPES)[number];

/**
 * 실행 1회에서 소스의 상태 (runs.json `sources[]` 한 줄을 분류한 값 — `classifySourceRun`). scripts/lib/github-issues.ts가 다시 내보낸다.
 *   fresh 새 기사 있음 · no-new 응답했지만 창 안 새 기사 0건 · empty 빈 피드(원문 0건) · failed 실패 ·
 *   budget 시간 예산 초과로 건너뜀 · legacy-ok 성공했지만 `usable`이 없는 옛 기록(새 기사 수 모름)
 */
export const SOURCE_RUN_STATES = [
  "fresh",
  "no-new",
  "empty",
  "failed",
  "budget",
  "legacy-ok",
] as const;
export type SourceRunState = (typeof SOURCE_RUN_STATES)[number];

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

/** 소스 1개의 건강도 — `D` = 파싱 실패 진단 형식(scripts/lib/feed-diagnostics.ts `FeedParseDiagnostics` — 화면은 쓰지 않는다) */
export interface SourceHealth<D = unknown> {
  id: string;
  /** 이번 실행의 기록 */
  current: SourceRunRecord;
  /** 이번 실행의 HTTP 상태(받기 실패이고 응답이 있었을 때만) */
  httpStatus: number | null;
  /** 이번 실행의 파싱 실패 진단(`parse` 실패일 때만, 본문 내용 없음) */
  parseDiagnostics: D | null;
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
  /** 전체 실패 실행이라 내지 않은 사건(`failed`·`failing-streak`, 없으면 null — M1-27) */
  suppressedEvent: HealthEvent | null;
}

/** 이번 실행의 소스 결과 — runs.json에 남길 기록 + (있으면) HTTP 상태·파싱 실패 진단(runs.json에는 남기지 않는다) */
export type CurrentSourceResult<D = unknown> = RunSource & {
  httpStatus?: number | null;
  parseDiagnostics?: D | null;
};

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

export interface AssessInput<D = unknown> {
  /** 이번 실행 */
  run: { runId: string; startedAt: string };
  /** 이번 실행에서 수집을 시도한 소스(설정 순서) — 비활성 소스는 여기 없으므로 판정하지 않는다 */
  current: readonly CurrentSourceResult<D>[];
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
export function assessSourceHealth<D = unknown>(
  input: AssessInput<D>,
): SourceHealth<D>[] {
  const past = healthRuns(input.history, input.run);
  const wholeRunFailed = isWholeRunFailure(input.current);
  return input.current.map((entry) => {
    const current = toRecord(input.run, entry);
    const records = [...sourceHistory(past, entry.id), current];
    const fail = failStreak(records);
    const stale = staleStreak(records);
    const event = healthEvent(current.state, fail, stale, input.run.startedAt);
    // 전체 실패면 소스별 사건을 모두 뺀다 — pipeline-failure 이슈 하나가 맡는다(파일 머리 주석, M1-27)
    const suppress = wholeRunFailed && event !== null;
    return {
      id: entry.id,
      current,
      httpStatus: entry.httpStatus ?? null,
      parseDiagnostics: entry.parseDiagnostics ?? null,
      failStreak: fail,
      staleStreak: stale,
      stats: sourceStats(records, input.run.startedAt),
      recent: records.slice(-HEALTH_RECENT_MAX),
      event: suppress ? null : event,
      suppressedEvent: suppress ? event : null,
    };
  });
}

function assertNever(value: never): never {
  throw new Error(`알 수 없는 소스 상태: ${String(value)}`);
}
