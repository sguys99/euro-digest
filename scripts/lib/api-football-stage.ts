/**
 * API-Football 경기 단건 단계 실행 — 날짜 조회 → 계획 → 상세 요청(브리핑 우선) → 이월 목록 (M1-48, D27).
 * 클라이언트는 주입한다(테스트는 가짜 fetch·시계). 계획·이월 규칙은 api-football-plan.ts, 응답 변환은 providers/api-football.ts.
 *
 * 브리핑 컷오프 (M1-44 이월 메모 — 겨울 07:10 수집 → 07:20 브리핑 마감)
 *   경기 데이터 단계는 두 프로바이더가 끝나야 브리핑으로 넘어갔다. API-Football 단계(예산 6분)를 다 기다리면 겨울에 LLM 몫이
 *   30초 남짓이라, 이 단계는 **브리핑에 필요한 경기(brief 계층)를 먼저** 받고 `onBriefReady`로 그때까지 받은 것을 한 번
 *   넘긴다. 신호 시점: ① brief 계층을 모두 처리했을 때 ② 다음 brief 요청을 컷오프 전에 끝낼 수 없을 때(현재 + 간격 +
 *   타임아웃 > 컷오프) ③ 단계가 멈추거나 끝났을 때. 신호 뒤에도 나머지(brief 잔여·기타 대회·이월 재조회)는 단계 예산 안에서
 *   계속 받는다 — 그 결과는 원장·이월(M1-48b)용이고 이번 브리핑에는 들어가지 않는다.
 *   판정은 요청 시작 전에만 하므로 진행 중인 요청 하나만큼 늦을 수 있다. 흔한 경우는 5xx·타임아웃 재시도(10초 대기 + 15초)로
 *   약 25초, **최악은 약 130초**다 — 직전 응답의 분당 가드(61초, 판정은 간격 6.5초만 셈) + 타임아웃 15초 + 분당 초과 재시도
 *   대기 61초 + 15초 − 슬롯 21.5초. 분당 초과가 두 번이면 단계가 멈추므로 그보다 길어지지는 않는다.
 *   TODO(M1-47): 브리핑 마감 함수와 함께 컷오프 판정에 클라이언트의 다음 요청 가능 시각(가드)을 넣고, 컷오프를 넘길 재시도는
 *   brief 몫에서 빼는 규칙을 정한다(겨울 LLM 여유가 4분이라 지금은 최악도 마감 안).
 *
 * 멈춤: `errors.plan`(FR-65 강등 — 재시도 없음)·일 한도(`errors.requests`)·키 오류(`errors.token`·`access`·401·403)·분당 초과
 * 연속 2회·우리 쪽 호출 상한·시간 예산·취소는 남은 요청을 보내지 않는다(받지 못한 경기는 이월). 요청 실패가 연속 3회면(차단기)
 * 남은 상세 요청을 멈춘다 — 러너 네트워크 장애 때 한도를 헛되이 쓰지 않게.
 */
import type { AfPendingEntry, CompId } from "@/lib/schema";
import type { UtcRange } from "@/lib/time";

import {
  nextAfPending,
  planAfFetches,
  type AfDropped,
  type AfPlanCounts,
  type AfTargetConfig,
  type AfTaskOutcome,
  type AfTaskTier,
} from "./api-football-plan";
import type { IssuePayloadInput } from "./github-issues";
import type { MatchDetail } from "./match-data";
import {
  afFixtureToPairing,
  AF_VOID_STATUSES,
  API_FOOTBALL_MIN_INTERVAL_MS,
  API_FOOTBALL_TIMEOUT_MS,
  ApiFootballError,
  isStageStoppingError,
  toAfFixture,
  toMatchDetail,
  type AfFixture,
  type ApiFootballClient,
  type ApiFootballErrorKind,
} from "./providers/api-football";
import type { PairingMatch } from "./team-ids";

// ─── 상수 ────────────────────────────────────────────────────────────────

/**
 * API-Football 단계 시간 예산 — 6분(D27 계획: 최악 약 35건 × 약 7.5초 ≈ 4.4분 + 재시도 여유). 넘으면 남은 경기는 이월.
 * 단계는 뉴스와 병렬로 실행 시작 직후 시작하므로(collect-run.ts) 겨울 07:10 수집 → 약 07:12 시작 → 07:18 전에 끝난다.
 */
export const API_FOOTBALL_STAGE_BUDGET_MS = 360_000;

/**
 * 브리핑 컷오프 — 경기 데이터 단계 시작 후 4분. 근거(겨울, D26): 07:10 트리거 → 가드 job·checkout·npm ci 약 1.5~2분 →
 * 단계 시작 약 07:12(뉴스와 병렬) → 컷오프 약 07:16 → 07:20 브리핑 마감까지 LLM 단건(요청 타임아웃 60초 + 429·5xx 재시도,
 * D28) 몫 약 4분. 4분이면 날짜 조회 2건 + 단건 약 30건(토요일 실측 brief 24경기 — 26요청 ≈ 3.3분)이 든다.
 * TODO(M1-47): 단계 시작 기준 상수 대신 브리핑 마감(공개 목표 − 10분, 계절별) − LLM 여유로 계산한다.
 */
export const API_FOOTBALL_BRIEF_CUTOFF_MS = 240_000;

/** 연속 요청 실패 차단기 — 이만큼 연속으로 실패하면 남은 상세 요청을 멈춘다 */
export const API_FOOTBALL_BREAKER_FAILURES = 3;

// ─── 결과 ────────────────────────────────────────────────────────────────

export interface AfDateResult {
  /** UTC 날짜 */
  date: string;
  ok: boolean;
  /** 응답 항목 수(형식 오류 포함) */
  listed: number;
  /** 형식이 틀려 버린 항목 */
  invalid: number;
  /** 실패 종류 — 단계가 먼저 멈춰 보내지 않았으면 그 이유(cap·budget·plan …) */
  errorType?: ApiFootballErrorKind | "unexpected";
  error?: string;
}

/** 브리핑이 쓸 몫 — 컷오프(또는 brief 계층 완료) 시점까지 받은 brief 계층 경기 */
export interface AfBriefSnapshot {
  /** complete = brief 계층을 모두 처리 · cutoff = 컷오프 전에 다 받지 못함 · stopped = 단계가 멈춤/끝남 */
  reason: "complete" | "cutoff" | "stopped";
  /** 받은 brief 계층 경기 상세(킥오프·id 순) */
  details: MatchDetail[];
  /** brief 계층인데 이 시점까지 받지 못한 경기 id */
  missing: number[];
  /**
   * 날짜 조회로 본 6개 대회 경기(짝짓기 입력 형식, 킥오프·id 순, 상태 무관 — 점수를 모르면 ft null) — 경기 연결(D37)이 "후보
   * 하나"를 셀 때 상세를 받지 않은 경기·아직 안 끝난 경기까지 센다(scripts/lib/team-ids.ts `afUniverse`). 날짜 조회가 끝난 뒤라
   * 브리핑 몫에도 다 들어 있다.
   */
  listed: PairingMatch[];
}

/** 이슈로 낼 사건(M1-11 소스 이슈 경로 재사용 — collect-run.ts가 사건 파일에 더한다) */
export interface AfIssueEvent {
  /**
   * plan = 무료 플랜 제한(FR-65 강등) · quota = 일 한도 도달 · auth = 키 오류 · rate = 분당 초과 연속 2회(멈춤) ·
   * api = 그 밖의 errors(입력 검증 등)
   */
  kind: "plan" | "quota" | "auth" | "rate" | "api";
  endpoint: "date" | "id";
  message: string;
}

export interface AfStageResult {
  dates: AfDateResult[];
  counts: AfPlanCounts;
  /** 계층별 요청 계획 수 */
  planned: Record<AfTaskTier, number>;
  /** 이번에 받은 종료 경기 상세(킥오프·id 순) */
  details: MatchDetail[];
  /** 날짜 조회로 본 6개 대회 경기(짝짓기 입력, 점수를 모르면 ft null — AfBriefSnapshot.listed와 같다) */
  listed: PairingMatch[];
  /** 요청 결과(계획 순서) */
  outcomes: AfTaskOutcome[];
  /** 다음 이월 목록 */
  pending: AfPendingEntry[];
  /** 이월에서 뺀 경기 */
  dropped: AfDropped[];
  /** 단계를 멈춘 이유 — 끝까지 갔으면 null */
  stoppedBy: ApiFootballErrorKind | "breaker" | null;
  /** errors.plan으로 FR-65 폴백 강등 — 경기 상세(득점자·라인업·한국 선수 기록)를 폴백으로 표시해야 한다 */
  degraded: AfIssueEvent | null;
  /** 이슈로 낼 사건(plan·quota·api) */
  issues: AfIssueEvent[];
  brief: AfBriefSnapshot;
}

export interface AfStageInput {
  client: Pick<ApiFootballClient, "getFixturesByDate" | "getFixtureById">;
  targets: AfTargetConfig;
  pending: readonly AfPendingEntry[];
  /** 이미 상세를 받은 경기 id(원장 — M1-48b) */
  known: ReadonlySet<number>;
  briefWindow: UtcRange;
  /** 날짜 조회 순서(afQueryDates — 브리핑 날짜 먼저) */
  dates: readonly string[];
  /** 저장용 시각(fetchedAt·firstSeen) */
  now: () => Date;
  /** 단계 시계(ms) — 컷오프 판단(클라이언트 now와 같은 시계) */
  clock: () => number;
  /** 브리핑 컷오프(clock 기준 ms) — null이면 brief 계층이 끝날 때 신호 */
  briefCutoffAt: number | null;
  /** 요청 1회가 차지할 수 있는 최대 시간(간격 + 타임아웃) — 기본 6.5초 + 15초 */
  requestSlotMs?: number;
  breakerFailures?: number;
  /** 브리핑 몫 신호(한 번만 부른다) */
  onBriefReady?: (snapshot: AfBriefSnapshot) => void;
}

function errorTypeOf(error: unknown): ApiFootballErrorKind | "unexpected" {
  return error instanceof ApiFootballError ? error.kind : "unexpected";
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "")
    : String(error);
}

const byKickoffId = (a: MatchDetail, b: MatchDetail) =>
  Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.matchId - b.matchId;

/** 사건으로 낼 오류인가(plan·quota·auth·api, 단계를 멈춘 분당 초과) */
function issueOf(
  error: unknown,
  endpoint: AfIssueEvent["endpoint"],
): AfIssueEvent | null {
  if (!(error instanceof ApiFootballError)) return null;
  const message = errorText(error);
  switch (error.kind) {
    case "plan":
    case "quota":
    case "auth":
    case "api":
      return { kind: error.kind, endpoint, message };
    case "rate":
      return isStageStoppingError(error)
        ? { kind: "rate", endpoint, message }
        : null;
    default:
      return null;
  }
}

/**
 * API-Football 단계: 날짜 조회(브리핑 날짜 먼저) → 계획 → 상세 요청(brief → window → requery) → 다음 이월 목록.
 * 던지지 않는다 — 요청 실패는 결과에 담는다(예상 밖 예외만 호출부의 isolateProvider가 잡는다).
 */
export async function runApiFootballStage(
  input: AfStageInput,
): Promise<AfStageResult> {
  const nowIso = () => input.now().toISOString();
  const slot =
    input.requestSlotMs ??
    API_FOOTBALL_MIN_INTERVAL_MS + API_FOOTBALL_TIMEOUT_MS;
  const breakerAt = input.breakerFailures ?? API_FOOTBALL_BREAKER_FAILURES;
  // 클로저가 바꾸는 상태는 객체에 둔다(지역 let 좁히기가 클로저 대입을 놓치지 않게)
  const state: {
    stoppedBy: AfStageResult["stoppedBy"];
    degraded: AfIssueEvent | null;
    brief: AfBriefSnapshot | null;
  } = { stoppedBy: null, degraded: null, brief: null };
  const issues: AfIssueEvent[] = [];

  const noteError = (error: unknown, endpoint: AfIssueEvent["endpoint"]) => {
    const issue = issueOf(error, endpoint);
    if (issue) {
      issues.push(issue);
      if (issue.kind === "plan" && state.degraded === null) {
        state.degraded = issue;
      }
    }
    if (error instanceof ApiFootballError && isStageStoppingError(error)) {
      state.stoppedBy ??= error.kind;
    }
  };

  // ① 날짜 조회 — 브리핑 날짜 먼저. 한 날짜의 실패가 다른 날짜를 막지 않는다(멈춤 오류는 예외)
  const dates: AfDateResult[] = [];
  const fixtures: AfFixture[] = [];
  for (const date of input.dates) {
    const stopped = state.stoppedBy;
    if (stopped !== null) {
      dates.push({
        date,
        ok: false,
        listed: 0,
        invalid: 0,
        errorType: stopped === "breaker" ? "unexpected" : stopped,
        error: "단계가 멈춰 요청하지 않음",
      });
      continue;
    }
    try {
      const raw = await input.client.getFixturesByDate(date);
      let invalid = 0;
      for (const item of raw) {
        const fixture = toAfFixture(item);
        if (fixture) fixtures.push(fixture);
        else invalid += 1;
      }
      dates.push({ date, ok: true, listed: raw.length, invalid });
    } catch (error) {
      noteError(error, "date");
      dates.push({
        date,
        ok: false,
        listed: 0,
        invalid: 0,
        errorType: errorTypeOf(error),
        error: errorText(error),
      });
    }
  }

  // ② 계획
  const compByLeague: ReadonlyMap<number, CompId> = input.targets.compByLeague;
  // 6개 대회 경기(날짜 조회, 상태 무관 — 미종료·연기·중단은 ft null) — 경기 연결의 후보 수 세기용(D37). 같은 id는 한 번만
  const listedById = new Map<number, PairingMatch>();
  for (const fixture of fixtures) {
    const pairing = afFixtureToPairing(fixture, compByLeague);
    if (pairing && !listedById.has(pairing.matchId)) {
      listedById.set(pairing.matchId, pairing);
    }
  }
  const listed = [...listedById.values()].sort(
    (a, b) =>
      Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.matchId - b.matchId,
  );
  const plan = planAfFetches({
    fixtures,
    pending: input.pending,
    known: input.known,
    targets: input.targets,
    briefWindow: input.briefWindow,
    now: nowIso(),
  });
  const planned: Record<AfTaskTier, number> = {
    brief: 0,
    window: 0,
    requery: 0,
  };
  for (const task of plan.tasks) planned[task.tier] += 1;

  // ③ 상세 요청 — brief 계층 먼저, 컷오프에 맞춰 브리핑 몫을 한 번 넘긴다
  const details: MatchDetail[] = [];
  const briefDetails: MatchDetail[] = [];
  const outcomes: AfTaskOutcome[] = [];
  const sendBrief = (reason: AfBriefSnapshot["reason"]) => {
    if (state.brief) return;
    const got = new Set(briefDetails.map((d) => d.matchId));
    const snapshot: AfBriefSnapshot = {
      reason,
      details: [...briefDetails].sort(byKickoffId),
      missing: plan.tasks
        .filter((t) => t.tier === "brief" && !got.has(t.id))
        .map((t) => t.id),
      listed,
    };
    state.brief = snapshot;
    input.onBriefReady?.(snapshot);
  };
  if (planned.brief === 0) {
    sendBrief(state.stoppedBy !== null ? "stopped" : "complete");
  }

  let consecutiveFailures = 0;
  for (const task of plan.tasks) {
    if (state.stoppedBy !== null) {
      sendBrief("stopped");
      outcomes.push({ task, result: { kind: "deferred" } });
      continue;
    }
    if (!state.brief && task.tier !== "brief") sendBrief("complete");
    if (
      !state.brief &&
      input.briefCutoffAt !== null &&
      input.clock() + slot > input.briefCutoffAt
    ) {
      sendBrief("cutoff");
    }
    try {
      const raw = await input.client.getFixtureById(task.id);
      consecutiveFailures = 0;
      if (raw === null || raw === undefined) {
        outcomes.push({ task, result: { kind: "missing" } });
        continue;
      }
      const converted = toMatchDetail(raw, {
        compByLeague,
        fetchedAt: nowIso(),
      });
      if (converted.kind === "finished") {
        details.push(converted.detail);
        if (task.tier === "brief" && !state.brief) {
          briefDetails.push(converted.detail);
        }
        outcomes.push({ task, result: { kind: "fetched" } });
      } else if (converted.kind === "not-finished") {
        const status = converted.fixture.status;
        outcomes.push({
          task,
          result: AF_VOID_STATUSES.has(status)
            ? { kind: "void", status }
            : {
                kind: "unfinished",
                status,
                kickoff: converted.fixture.kickoff,
              },
        });
      } else {
        outcomes.push({
          task,
          result: { kind: "failed", errorType: "format" },
        });
      }
    } catch (error) {
      noteError(error, "id");
      if (state.stoppedBy !== null) {
        // 멈춤 오류(plan·quota·cap·budget·cancelled) — 이 경기도 보내지 못한 것으로 본다(재조회 수를 올리지 않는다)
        outcomes.push({ task, result: { kind: "deferred" } });
        continue;
      }
      consecutiveFailures += 1;
      outcomes.push({
        task,
        result: { kind: "failed", errorType: errorTypeOf(error) },
      });
      if (consecutiveFailures >= breakerAt) state.stoppedBy = "breaker";
    }
  }
  sendBrief(state.stoppedBy !== null ? "stopped" : "complete");

  // ④ 다음 이월 목록
  const update = nextAfPending({ plan, outcomes, now: nowIso() });
  return {
    dates,
    counts: plan.counts,
    planned,
    details: details.sort(byKickoffId),
    listed,
    outcomes,
    pending: update.fixtures,
    dropped: update.dropped,
    stoppedBy: state.stoppedBy,
    degraded: state.degraded,
    issues,
    brief: state.brief ?? {
      reason: "stopped",
      details: [],
      missing: [],
      listed,
    },
  };
}

// ─── 이슈 사건 ───────────────────────────────────────────────────────────

/** 이슈 원인 키 `source:api-football`(소스별 이슈 하나 — D35 ③와 같은 규칙) */
export const API_FOOTBALL_ISSUE_SOURCE_ID = "api-football";

const ISSUE_NOTES: Readonly<Record<AfIssueEvent["kind"], string>> = {
  plan: "API-Football 무료 플랜 제한 응답(errors.plan)을 받아 재시도 없이 경기 단건 데이터(득점자·라인업·한국 선수 기록)를 FR-65 폴백으로 강등했습니다(실행·발행은 계속). 확인할 것: 무료 플랜 변경 공지·대시보드, 날짜 창(오늘 UTC ±1일)·id 단건 허용 여부. 지난 날짜는 다시 받을 수 없습니다(D27).",
  quota:
    "API-Football 일 한도(하루 100회, 00:00 UTC 리셋)에 닿아 남은 요청을 보내지 않았습니다. 확인할 것: 같은 UTC 날의 개발 호출 수(하루 50건 이내), 봇 수집 시간대 수동 호출, 우리 쪽 카운터(runs.json·runs-dev.json apiCalls.apiFootball). 받지 못한 경기는 이월 목록(data/cache/af-pending.json)에 남습니다.",
  auth: "API-Football이 키 오류(errors.token·access 또는 HTTP 401·403)를 돌려줘 남은 요청을 보내지 않았습니다. 확인할 것: API_FOOTBALL_KEY(Actions Secrets) 값·계정 상태(대시보드). 받지 못한 경기는 이월 목록에 남습니다.",
  rate: "분당 한도 초과 응답이 연속 2회(61초 뒤 재시도까지) 와서 남은 요청을 멈췄습니다 — 분당 초과는 약관상 중대한 위반입니다. 확인할 것: 같은 키를 쓰는 다른 호출(개발 호출·봇 수집 시간대 06:00~08:00 KST 수동 호출). 받지 못한 경기는 이월 목록에 남습니다.",
  api: "API-Football이 errors 객체로 오류를 돌려줬습니다(HTTP 200). 확인할 것: 요청 파라미터(입력 검증 문구). 받지 못한 경기는 이월 목록에 남습니다.",
};

/**
 * 단계 결과 → `source-broken` 이슈 payload(종류별 1건, M1-11 사건 파일 경로 재사용 — 이슈 생성은 수집 단계가 아니라
 * collect.yml의 다음 단계가 한다). 응답 본문은 넣지 않고 `errors` 문구(가리고 자른 것)만 넣는다.
 */
export function apiFootballIssuePayloads(
  issues: readonly AfIssueEvent[],
  ctx: { occurredAt: string; runId?: string; runUrl?: string },
): Array<IssuePayloadInput<"source-broken">> {
  const byKind = new Map<AfIssueEvent["kind"], AfIssueEvent>();
  for (const issue of issues)
    if (!byKind.has(issue.kind)) byKind.set(issue.kind, issue);
  return [...byKind.values()].map((issue) => ({
    sourceId: API_FOOTBALL_ISSUE_SOURCE_ID,
    sourceName: "API-Football",
    symptoms: ["기타"],
    errorType: issue.kind,
    error: `${issue.endpoint === "date" ? "/fixtures?date=" : "/fixtures?id="} — ${issue.message}`,
    occurredAt: ctx.occurredAt,
    ...(ctx.runId ? { runId: ctx.runId } : {}),
    ...(ctx.runUrl ? { runUrl: ctx.runUrl } : {}),
    note: ISSUE_NOTES[issue.kind],
  }));
}
