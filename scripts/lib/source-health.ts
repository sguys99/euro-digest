/**
 * 소스 건강도 판정 (M1-11, PRD FR-11·FR-151·FR-152·§10, §15 D35) — 순수 함수만 둔다.
 *
 * **판정·집계부는 src/lib/source-health.ts로 옮겼다**(M5-15 — `/status` 화면이 같은 함수를 쓴다, 동작 불변). 이 파일은 그것을
 * 다시 내보내고(파싱 실패 진단 형식을 `FeedParseDiagnostics`로 고정한 타입 포함) 이슈 payload·로그 필드만 둔다. 규칙은 아래 그대로다.
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
import {
  assessSourceHealth as assessSourceHealthBase,
  type AssessInput as AssessInputBase,
  type CurrentSourceResult as CurrentSourceResultBase,
  type HealthEvent,
  type SourceHealth as SourceHealthBase,
  type SourceRunRecord,
} from "@/lib/source-health";
import { kstDate, parseUtcIso } from "@/lib/time";

import type { FeedParseDiagnostics } from "./feed-diagnostics";
import {
  ParseDiagnosticsPayloadSchema,
  SOURCE_SYMPTOMS,
  sourceIssueKey,
  type IssuePayloadInput,
} from "./github-issues";

export {
  BUDGET_ERROR,
  classifySourceRun,
  FAIL_STREAK_THRESHOLD,
  failStreak,
  HEALTH_RECENT_MAX,
  HEALTH_STATS_DAYS,
  healthEvent,
  healthRuns,
  isWholeRunFailure,
  sourceHistory,
  sourceStats,
  STALE_STREAK_THRESHOLD,
  staleStreak,
  type HealthEvent,
  type SourceEventType,
  type SourceRunRecord,
  type SourceRunState,
  type SourceStats,
  type Streak,
} from "@/lib/source-health";

/** 소스 1개의 건강도(파싱 실패 진단 = `FeedParseDiagnostics`) */
export type SourceHealth = SourceHealthBase<FeedParseDiagnostics>;
/** 이번 실행의 소스 결과 — runs.json에 남길 기록 + (있으면) HTTP 상태·파싱 실패 진단(runs.json에는 남기지 않는다) */
export type CurrentSourceResult = CurrentSourceResultBase<FeedParseDiagnostics>;
export type AssessInput = AssessInputBase<FeedParseDiagnostics>;

/** 소스별 건강도 — 입력 순서(설정 순서) 그대로(src/lib/source-health.ts) */
export const assessSourceHealth: (input: AssessInput) => SourceHealth[] =
  assessSourceHealthBase;

function ms(iso: string): number {
  return parseUtcIso(iso).getTime();
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
  const diagnostics = issueParseDiagnostics(health);
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
    ...(diagnostics ? { parseDiagnostics: diagnostics } : {}),
  };
}

/**
 * 이슈에 실을 파싱 실패 진단 — 이번 실행이 `parse` 실패이고 진단이 스키마(enum·숫자만)를 통과할 때만.
 * 스키마에 없는 키는 버린다(strict 스키마로 다시 고르므로 본문 조각이 섞여 들어올 자리가 없다).
 */
function issueParseDiagnostics(
  health: SourceHealth,
): IssuePayloadInput<"source-broken">["parseDiagnostics"] | undefined {
  const d = health.parseDiagnostics;
  if (
    !d ||
    health.current.state !== "failed" ||
    health.current.error !== "parse"
  ) {
    return undefined;
  }
  const parsed = ParseDiagnosticsPayloadSchema.safeParse({
    status: d.status,
    mediaType: d.mediaType,
    bytes: d.bytes,
    shape: d.shape,
    sameHost: d.sameHost,
    redirects: d.redirects,
    parser: d.parser,
    line: d.line,
    column: d.column,
  });
  return parsed.success ? parsed.data : undefined;
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
