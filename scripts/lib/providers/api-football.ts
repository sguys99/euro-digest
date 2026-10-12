/**
 * API-Football v3 경기 단건 어댑터 — 클라이언트·응답 경계(zod)·내부 형식 변환 (M1-48, PRD §15 D27·D33).
 * 외부 응답은 이 파일의 경계에서 파싱해 내부 형식(scripts/lib/match-data.ts `MatchDetail`, 이 파일 `AfFixture`)으로 바꾼다.
 * 화면·data/·브리핑 입력은 API-Football 키 이름을 모른다(CLAUDE.md §6.4). 대상 선별·이월·호출 계획은
 * scripts/lib/api-football-plan.ts, 단계 실행(우선순위·브리핑 컷오프·시간 예산)은 scripts/lib/api-football-stage.ts.
 *
 * 무료 플랜에서 쓰는 요청 (M0-29 — 시즌 단위 `season=`·`ids=`·`next=`는 막혀 있다)
 *   ① `/fixtures?date=YYYY-MM-DD`(UTC 날짜, 대회 필터 없음 — 무료는 오늘 ±1일만) → 경기 목록(상태·스코어)
 *   ② `/fixtures?id=N` → 경기 1건의 이벤트·라인업·팀 통계·선수 기록(날짜 창 밖 경기도 열린다)
 *
 * 응답 경계 (fixtures/football/README.md "어댑터가 알아야 할 것")
 *   - **오류도 HTTP 200**: 정상 `errors: []`, 오류는 객체(`errors.plan`·`errors.requests` …). HTTP 200이면 상태 코드보다
 *     `errors`를 먼저 본다. `plan`은 재시도 없이 그 기능을 FR-65 폴백으로 강등(호출부 — 단계가 멈추고 이슈 사건을 낸다).
 *   - 시각 `fixture.date`는 `+00:00` 오프셋 → `Z`(src/lib/time.ts parseFeedDate — `IsoSchema` 통과 형식).
 *   - 선발은 `lineups[].startXI`(선수 기록의 `games.substitute`는 무시), 골·도움은 `events`(type Goal — Normal Goal·Penalty·
 *     Own Goal. Missed Penalty·승부차기 킥은 골이 아니다. 선수 기록의 `goals.total`은 0/null이 섞여 쓰지 않는다).
 *   - 승부차기 점수는 `score.penalty`에 따로 온다(`goals`에 없음 — football-data와 반대). 내부 `ft`는 `goals`(정규 + 연장),
 *     `pens`는 `score.penalty`(match-data.ts 공통 스코어 규칙).
 *   - 자책골은 득점한 선수의 **상대 팀** 득점이다 — 선수의 팀은 이벤트 `team`이 아니라 라인업에서 찾는다(1552779 실측: 자책골
 *     이벤트의 `team`은 득점 인정 팀이었다 — 1건 관찰이라 그 뜻에 기대지 않는다). 라인업에서 못 찾으면 득점 목록을
 *     불완전(`goalsComplete: false`)으로 둔다.
 *   - 승부차기 킥도 type Goal(detail Penalty·Missed Penalty) 이벤트로 온다 — `comments: "Penalty Shootout"`(1639860 실측,
 *     time.elapsed 120 · time.extra = 킥 순번)으로 거른다. 선수 id는 0·null로 오기도 한다 → null.
 *   - 로고·사진·국기 URL(`logo`·`photo`·`flag`)은 스키마에 없어 버려진다(CLAUDE.md §1-6). 원본 응답은 저장하지 않는다.
 *
 * 호출 정책 (M0-29 "하루 호출 계획", CLAUDE.md §6.4)
 *   - 분당 10회 → **동시 1개, 응답(또는 실패) 후 6.5초 간격** — 응답이 0초여도 요청 시작은 6.5초 이상 떨어져 어느 60초 창에도
 *     최대 10건(0·6.5·…·58.5초)이라 분당 한도(10회)를 넘지 않는다. 분당 한도 초과는 약관상 중대한 위반이라 간격을 줄이지
 *     않는다. 응답 헤더 `x-ratelimit-remaining`(분당 남은 수)이 0이거나 분당 초과 응답(429·`errors.rateLimit`)을 받으면 그때부터
 *     61초 동안 다음 요청을 보내지 않는다(키를 개발 호출과 나눠 쓰는 경우의 가드). 분당 초과 응답이 **연속 2회**면(재시도까지
 *     초과) 그 오류는 단계를 멈추는 오류다(`rateStreak` — `isStageStoppingError`).
 *   - **우리 쪽 호출 상한** `maxCalls` — 보낸 요청(재시도·실패 포함)이 이 수에 닿으면 더 보내지 않는다(`cap`). 일일 상한
 *     (봇 ≤ 60회)에서 오늘 쓴 수를 뺀 값을 단계가 넘긴다(헤더의 일일 남은 수는 일관되지 않아 참고만 — M0-29).
 *   - 요청 타임아웃 **15초**. 재시도는 **1회**: 5xx·타임아웃은 10초 뒤, 분당 초과(HTTP 429·`errors.rateLimit`)는 61초 뒤.
 *     연결 오류는 호출부가 고른다(`retryNetwork`) — 날짜 조회만 다시 보낸다(아래 근거). `plan`·`requests`(일일 한도)·그 밖의
 *     `errors`·4xx·형식 오류는 다시 보내도 같은 결과라 재시도하지 않는다. 키 오류(`errors.token`·`errors.access`·HTTP 401·403)는
 *     `auth`로 단계를 멈춘다(남은 요청도 같은 결과 — 이슈 사건). 대기 + 최소 시도 시간이 단계 마감을 넘거나 호출 상한에 닿으면
 *     재시도하지 않는다.
 *   - 연결 오류 재시도 근거: API-Football은 초과 과금이 없어(한도 도달 시 그날 정지 — M0-29) 다시 보내도 돈이 들지 않지만,
 *     요청이 서버에 닿았다면 일 한도를 한 번 더 쓴다. 날짜 조회는 실패하면 그날 경기 id를 모두 잃고(지난 날짜는 다시 받을 수
 *     없다 — D27) 날짜당 1건이라 다시 보낼 가치가 크다. 경기 단건은 실패하면 이월 목록에 남아 다음 실행이 id로 다시 받으므로
 *     (날짜 창 밖도 열림) 다시 보내지 않고 한도를 아낀다. 이 클라이언트는 보낸 요청을 모두 세므로(우리 쪽 카운터) 재시도도
 *     상한 안에 든다.
 *   - 인증은 `x-apisports-key` 헤더. 키 값은 로그·오류 메시지·요청 경로에 넣지 않는다. 응답 본문은 남기지 않고, `errors`의
 *     짧은 문구만(가려서·잘라서) 오류 메시지에 쓴다.
 */
import { z } from "zod";

import type { CompId } from "@/lib/schema";
import { parseFeedDate } from "@/lib/time";

import { sanitizeText } from "../logger";
import type {
  LineupPlayer,
  MatchDetail,
  MatchDuration,
  MatchGoal,
  MatchScore,
  PersonRef,
  Score,
  Side,
  TeamLineup,
} from "../match-data";
import type { FetchLike } from "../rss";
import type { PairingMatch } from "../team-ids";

// ─── 상수 ────────────────────────────────────────────────────────────────

export const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";

/** 응답(또는 실패) 후 다음 요청까지 최소 간격 — 요청 시작이 6.5초 이상 떨어져 어느 60초 창에도 최대 10건(분당 한도 10회, M0-29) */
export const API_FOOTBALL_MIN_INTERVAL_MS = 6_500;

/** 요청 1회 타임아웃 — 날짜 조회(약 0.65MB) 실측 0.5초, 경기 단건(약 76KB) 1초 안팎(M0-29) */
export const API_FOOTBALL_TIMEOUT_MS = 15_000;

/** 재시도 횟수 — 1회 고정 */
export const API_FOOTBALL_MAX_RETRIES = 1;

/** 5xx·타임아웃·(날짜 조회의) 연결 오류 재시도 전 대기(M0-29 권고) */
export const API_FOOTBALL_RETRY_DELAY_MS = 10_000;

/** 분당 한도 초과(429·errors.rateLimit)·분당 남은 수 0일 때 대기 — 60초 창 + 1초(M0-29 권고) */
export const API_FOOTBALL_RATE_LIMIT_WAIT_MS = 61_000;

/** 요청을 새로 시작할 최소 남은 시간 — 이보다 짧으면 시작하지 않는다 */
export const API_FOOTBALL_MIN_ATTEMPT_MS = 3_000;

/** 경기가 끝난 상태 — 이 상태만 상세를 받아 기록한다(D27) */
export const AF_FINISHED_STATUSES: ReadonlySet<string> = new Set([
  "FT",
  "AET",
  "PEN",
]);

/**
 * 경기가 열리지 않고 끝난 상태 — 상세를 받지 않고 이월 목록에서도 뺀다.
 * PST 연기 · CANC 취소 · ABD 중단(재개 경기는 새 일정으로 다시 잡힌다) · AWD 몰수(기권승 처리) · WO 부전승.
 * 연기·재개 경기는 새 날짜의 날짜 조회에 다시 나온다(같은 id).
 */
export const AF_VOID_STATUSES: ReadonlySet<string> = new Set([
  "PST",
  "CANC",
  "ABD",
  "AWD",
  "WO",
]);

// ─── 오류 ────────────────────────────────────────────────────────────────

/**
 * - timeout: 요청 타임아웃(재시도 대상) · network: 연결 오류(날짜 조회만 재시도) · http: HTTP 오류(5xx만 재시도)
 * - format: JSON·형식 오류 · budget: 단계 시간 예산 소진 · cap: 우리 쪽 호출 상한 도달 · cancelled: 호출부가 멈춤
 * - plan: `errors.plan`(무료 플랜 제한 — FR-65 강등) · rate: 분당 한도 초과(HTTP 429·`errors.rateLimit`)
 * - quota: `errors.requests`(일 한도 도달 — 그날 남은 시간 정지) · auth: 키 오류(`errors.token`·`errors.access`·HTTP 401·403)
 * - api: 그 밖의 `errors`(입력 검증 등)
 */
export type ApiFootballErrorKind =
  | "timeout"
  | "network"
  | "http"
  | "format"
  | "budget"
  | "cap"
  | "cancelled"
  | "plan"
  | "rate"
  | "quota"
  | "auth"
  | "api";

/** 재시도 대상이었지만 다시 보내지 않은 이유 */
export type ApiFootballRetrySkip =
  /** 대기 + 최소 시도 시간이 단계 마감을 넘는다 */
  | "no-time"
  /** 우리 쪽 호출 상한에 닿았다 */
  | "cap";

/** 어댑터 오류. 응답 본문·키는 메시지에 넣지 않는다(`errors` 문구만 가려서·잘라서). */
export class ApiFootballError extends Error {
  override readonly name = "ApiFootballError";
  readonly kind: ApiFootballErrorKind;
  readonly status: number | null;
  /** 응답 `errors` 객체의 키(plan·requests·token …) — 없으면 [] */
  readonly errorKeys: readonly string[];
  readonly retrySkipped: ApiFootballRetrySkip | null;
  /** rate 오류일 때 이 클라이언트가 연속으로 받은 분당 초과 응답 수(재시도 포함) — 그 밖은 0 */
  readonly rateStreak: number;
  constructor(
    kind: ApiFootballErrorKind,
    message: string,
    detail: {
      status?: number | null;
      errorKeys?: readonly string[];
      retrySkipped?: ApiFootballRetrySkip | null;
      rateStreak?: number;
    } = {},
  ) {
    super(message);
    this.kind = kind;
    this.status = detail.status ?? null;
    this.errorKeys = detail.errorKeys ?? [];
    this.retrySkipped = detail.retrySkipped ?? null;
    this.rateStreak = detail.rateStreak ?? 0;
  }
}

function withRetrySkipped(
  error: ApiFootballError,
  reason: ApiFootballRetrySkip,
): ApiFootballError {
  return new ApiFootballError(error.kind, error.message, {
    status: error.status,
    errorKeys: error.errorKeys,
    retrySkipped: reason,
    rateStreak: error.rateStreak,
  });
}

/** 분당 초과 응답이 이만큼 연속이면(첫 시도 + 61초 뒤 재시도 모두 초과) 단계를 멈춘다 — 다른 호출이 같은 키를 쓰는 중이다 */
export const API_FOOTBALL_RATE_STOP_STREAK = 2;

/** 재시도 대상 — 타임아웃·5xx·분당 초과, 그리고 `retryNetwork`면 연결 오류 */
export function isRetryableApiFootballError(
  error: Pick<ApiFootballError, "kind" | "status">,
  retryNetwork = false,
): boolean {
  switch (error.kind) {
    case "timeout":
    case "rate":
      return true;
    case "network":
      return retryNetwork;
    case "http":
      return error.status !== null && error.status >= 500;
    default:
      return false;
  }
}

/**
 * 단계를 더 진행해도 소용없는 오류 — 플랜 제한·일 한도·키 오류·호출 상한·예산·취소, 분당 초과 연속 2회
 * (남은 요청을 보내지 않는다)
 */
export function isStageStoppingError(
  error: Pick<ApiFootballError, "kind"> &
    Partial<Pick<ApiFootballError, "rateStreak">>,
): boolean {
  return (
    error.kind === "plan" ||
    error.kind === "quota" ||
    error.kind === "auth" ||
    error.kind === "cap" ||
    error.kind === "budget" ||
    error.kind === "cancelled" ||
    (error.kind === "rate" &&
      (error.rateStreak ?? 0) >= API_FOOTBALL_RATE_STOP_STREAK)
  );
}

// ─── 응답 헤더 ───────────────────────────────────────────────────────────

export interface AfRateHeaders {
  /** `x-ratelimit-remaining` — 이번 분에 남은 요청 수 */
  minuteRemaining: number | null;
  /** `x-ratelimit-requests-remaining` — 오늘 남은 요청 수(일관되지 않아 참고만 — M0-29) */
  dayRemaining: number | null;
  /** `x-ratelimit-requests-limit` — 일 한도(무료 100) */
  dayLimit: number | null;
}

function headerInt(headers: Headers, name: string): number | null {
  const raw = headers.get(name)?.trim();
  return raw && /^\d+$/.test(raw) ? Number(raw) : null;
}

/** 레이트 리밋 헤더(M0-29 실측 이름). 해석할 수 없으면 null — 오류 응답에는 헤더가 없을 수 있다 */
export function readAfRateHeaders(headers: Headers): AfRateHeaders {
  return {
    minuteRemaining: headerInt(headers, "x-ratelimit-remaining"),
    dayRemaining: headerInt(headers, "x-ratelimit-requests-remaining"),
    dayLimit: headerInt(headers, "x-ratelimit-requests-limit"),
  };
}

// ─── 응답 껍데기 ─────────────────────────────────────────────────────────

/** 응답 껍데기 — `errors`는 정상 `[]`, 오류는 객체(문자열 값). 필요한 키만 읽는다 */
export const AfEnvelopeSchema = z.object({
  errors: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]),
  results: z.number().int().nonnegative().optional(),
  paging: z
    .object({ current: z.number().int(), total: z.number().int() })
    .nullable()
    .optional(),
  response: z.unknown(),
});

const ERROR_TEXT_MAX = 200;

/** `errors` 값 → 짧은 문구(가리고 자름). 응답 본문 전체는 쓰지 않는다 */
function errorsText(errors: Record<string, unknown> | unknown[]): string {
  const values = Array.isArray(errors) ? errors : Object.values(errors);
  const text = values
    .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
    .join(" / ")
    // 키 모양(16진수 32자 이상)은 따로 가린다 — 두 데이터 API 키가 이 모양이다(fixtures 가드와 같은 기준)
    .replace(/\b[0-9a-f]{32,}\b/gi, "****");
  return sanitizeText(text, ERROR_TEXT_MAX);
}

/**
 * HTTP 200 응답 본문의 `errors` 검사 — 정상(`[]`·빈 객체)이면 null, 오류면 종류를 정한 ApiFootballError.
 * 키 이름: plan(무료 플랜 제한) · rateLimit(분당 초과) · requests(일 한도) · token·access(키 오류 — auth) ·
 * 그 밖(입력 검증 등)은 api.
 */
export function afErrorsToError(
  errors: Record<string, unknown> | unknown[],
  label: string,
): ApiFootballError | null {
  const keys = Array.isArray(errors) ? [] : Object.keys(errors);
  const empty = Array.isArray(errors) ? errors.length === 0 : keys.length === 0;
  if (empty) return null;
  const kind: ApiFootballErrorKind = keys.includes("plan")
    ? "plan"
    : keys.includes("rateLimit")
      ? "rate"
      : keys.includes("requests")
        ? "quota"
        : keys.includes("token") || keys.includes("access")
          ? "auth"
          : "api";
  return new ApiFootballError(
    kind,
    `API-Football ${label} 응답 errors${keys.length ? `.${keys.join(",")}` : ""}: ${errorsText(errors)}`,
    { status: 200, errorKeys: keys },
  );
}

// ─── 클라이언트 ──────────────────────────────────────────────────────────

export interface ApiFootballRetryEvent {
  /** 요청 경로(키 없음) */
  path: string;
  /** 몇 번째 재시도인가(1부터, 이 클라이언트 전체 기준) */
  retry: number;
  error: ApiFootballError;
  delayMs: number;
}

export interface ApiFootballClientOptions {
  /** API_FOOTBALL_KEY — 출력하지 않는다 */
  apiKey: string;
  fetch: FetchLike;
  /** 테스트 주입용 */
  sleep?: (ms: number) => Promise<void>;
  /** 현재 시각(ms) — 테스트 주입용 */
  now?: () => number;
  minIntervalMs?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  rateLimitWaitMs?: number;
  minAttemptMs?: number;
  /** 단계 마감(now 기준 ms). 이 시각을 넘는 대기·요청은 하지 않고 `budget`으로 실패한다. 없으면 제한 없음 */
  deadline?: number | null;
  /** 보낼 수 있는 요청 수 상한(재시도·실패 포함 — 우리 쪽 카운터). 없으면 제한 없음 */
  maxCalls?: number | null;
  /** 이 신호가 켜지면 새 요청을 보내지 않는다(`cancelled`) — 보내는 중인 요청은 끝까지 기다린다 */
  signal?: AbortSignal;
  baseUrl?: string;
  /** 재시도 직전에 부른다(로그용) */
  onRetry?: (event: ApiFootballRetryEvent) => void;
}

export interface ApiFootballClient {
  /** `/fixtures?date=` — 경기 항목 원문 배열(항목 검증 전, 껍데기·errors만 검증). 연결 오류도 1회 재시도 */
  getFixturesByDate(date: string): Promise<unknown[]>;
  /** `/fixtures?id=` — 경기 1건 원문(없으면 null). 연결 오류는 재시도하지 않는다 */
  getFixtureById(id: number): Promise<unknown>;
  /** 이 클라이언트가 보낸 요청 수(실패·재시도 포함) — runs.json apiCalls.apiFootball */
  readonly calls: number;
  /** 재시도 횟수(calls에 포함) */
  readonly retries: number;
  /** 마지막으로 받은 레이트 리밋 헤더(받은 적 없으면 모두 null) */
  readonly rate: AfRateHeaders;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 날짜 조회 경로(키 없음) */
export function fixturesByDatePath(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiFootballError("format", `날짜 형식이 아니다: ${date}`);
  }
  return `/fixtures?date=${date}`;
}

/** 경기 단건 경로(키 없음) */
export function fixtureByIdPath(id: number): string {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiFootballError("format", `경기 id가 양의 정수가 아니다: ${id}`);
  }
  return `/fixtures?id=${id}`;
}

function isAbortLike(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  return name === "TimeoutError" || name === "AbortError";
}

export function createApiFootballClient(
  options: ApiFootballClientOptions,
): ApiFootballClient {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new ApiFootballError("format", "API_FOOTBALL_KEY가 비어 있다");
  }
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;
  const minIntervalMs = options.minIntervalMs ?? API_FOOTBALL_MIN_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? API_FOOTBALL_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? API_FOOTBALL_RETRY_DELAY_MS;
  const rateLimitWaitMs =
    options.rateLimitWaitMs ?? API_FOOTBALL_RATE_LIMIT_WAIT_MS;
  const minAttemptMs = options.minAttemptMs ?? API_FOOTBALL_MIN_ATTEMPT_MS;
  const deadline = options.deadline ?? null;
  const maxCalls = options.maxCalls ?? null;
  const baseUrl = options.baseUrl ?? API_FOOTBALL_BASE_URL;
  let lastResponseAt: number | null = null;
  /** 분당 남은 수 0 가드 — 이 시각 전에는 보내지 않는다 */
  let guardUntil = 0;
  let calls = 0;
  let retries = 0;
  /** 연속으로 받은 분당 초과 응답 수 — 초과가 아닌 응답을 받으면 0 */
  let rateStreak = 0;
  let rate: AfRateHeaders = {
    minuteRemaining: null,
    dayRemaining: null,
    dayLimit: null,
  };
  // 동시 1개 — 요청을 한 줄로 세운다.
  let queue: Promise<unknown> = Promise.resolve();

  const budgetError = (message: string) =>
    new ApiFootballError("budget", message);

  const noTimeFor = (waitMs: number): boolean =>
    deadline !== null && now() + waitMs + minAttemptMs > deadline;

  const capReached = () => maxCalls !== null && calls >= maxCalls;

  function checkCancelled(): void {
    if (options.signal?.aborted) {
      throw new ApiFootballError(
        "cancelled",
        "API-Football 요청 중단(호출부 취소)",
      );
    }
  }

  /** 간격(응답 후 6.5초)·분당 가드를 지킨다. 기다려도 마감 전에 시도할 수 없으면 budget */
  async function waitTurn(): Promise<void> {
    const readyAt = Math.max(
      lastResponseAt === null ? 0 : lastResponseAt + minIntervalMs,
      guardUntil,
    );
    const wait = readyAt - now();
    if (noTimeFor(Math.max(0, wait))) {
      throw budgetError("API-Football 단계 시간 예산 소진 — 요청하지 않음");
    }
    if (wait > 0) await sleep(wait);
  }

  function noteRateHeaders(headers: Headers, at: number): void {
    const next = readAfRateHeaders(headers);
    // 오류 응답에는 헤더가 없을 수 있다(M0-29) — 받은 값만 갱신
    rate = {
      minuteRemaining: next.minuteRemaining ?? rate.minuteRemaining,
      dayRemaining: next.dayRemaining ?? rate.dayRemaining,
      dayLimit: next.dayLimit ?? rate.dayLimit,
    };
    if (next.minuteRemaining === 0) {
      guardUntil = Math.max(guardUntil, at + rateLimitWaitMs);
    }
  }

  /** 요청 1회(재시도 없음) → 응답 `response` 원문 */
  async function attempt(pathAndQuery: string, label: string) {
    checkCancelled();
    if (capReached()) {
      throw new ApiFootballError(
        "cap",
        `API-Football 호출 상한(${maxCalls}회) 도달 — 요청하지 않음`,
      );
    }
    await waitTurn();
    checkCancelled();
    const start = now();
    let attemptTimeout = timeoutMs;
    let boundByDeadline = false;
    if (deadline !== null) {
      const remaining = deadline - start;
      if (remaining < minAttemptMs) {
        throw budgetError("API-Football 단계 시간 예산 소진 — 요청하지 않음");
      }
      if (remaining <= timeoutMs) {
        attemptTimeout = remaining;
        boundByDeadline = true;
      }
    }
    const timedOut = () =>
      boundByDeadline
        ? budgetError(
            `API-Football 단계 시간 예산 소진으로 요청 중단 (${attemptTimeout}ms)`,
          )
        : new ApiFootballError(
            "timeout",
            `API-Football ${label} 요청 시간 초과 (${attemptTimeout}ms)`,
          );
    calls += 1;
    // 분당 초과 응답 — 61초 가드를 걸고 연속 횟수를 센다. 초과가 아닌 응답이면 finally에서 연속 횟수를 0으로
    const flag = { rated: false };
    const rateError = (
      message: string,
      detail: { status: number; errorKeys?: readonly string[] },
    ) => {
      flag.rated = true;
      rateStreak += 1;
      guardUntil = Math.max(guardUntil, now() + rateLimitWaitMs);
      return new ApiFootballError("rate", message, { ...detail, rateStreak });
    };
    let response: Response;
    try {
      response = await options.fetch(`${baseUrl}${pathAndQuery}`, {
        headers: { "x-apisports-key": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(attemptTimeout),
      });
    } catch (error) {
      lastResponseAt = now();
      if (isAbortLike(error)) throw timedOut();
      throw new ApiFootballError(
        "network",
        `API-Football ${label} 요청 실패(연결 오류)`,
      );
    }
    try {
      noteRateHeaders(response.headers, now());
      if (!response.ok) {
        const status = response.status;
        if (status === 429) {
          throw rateError(
            `API-Football ${label} 응답 HTTP 429(분당 한도 초과)`,
            { status },
          );
        }
        throw new ApiFootballError(
          status === 401 || status === 403 ? "auth" : "http",
          `API-Football ${label} 응답 HTTP ${status}`,
          { status },
        );
      }
      let json: unknown;
      try {
        json = await response.json();
      } catch (error) {
        if (isAbortLike(error)) throw timedOut();
        throw new ApiFootballError(
          "format",
          `API-Football ${label} 응답 JSON 파싱 실패`,
          { status: response.status },
        );
      }
      const envelope = AfEnvelopeSchema.safeParse(json);
      if (!envelope.success) {
        throw new ApiFootballError(
          "format",
          `API-Football ${label} 응답 형식이 다르다(errors·response 없음)`,
          { status: response.status },
        );
      }
      // HTTP 200이어도 errors를 먼저 본다(M0-29 — 플랜 제한·입력 오류가 200으로 온다)
      const apiError = afErrorsToError(envelope.data.errors, label);
      if (apiError?.kind === "rate") {
        throw rateError(apiError.message, {
          status: 200,
          errorKeys: apiError.errorKeys,
        });
      }
      if (apiError) throw apiError;
      return envelope.data.response;
    } finally {
      lastResponseAt = now();
      if (!flag.rated) rateStreak = 0;
    }
  }

  /** 재시도 대상 오류면 1회 다시 보낸다 */
  async function request(
    pathAndQuery: string,
    label: string,
    retryNetwork: boolean,
  ): Promise<unknown> {
    for (let attempted = 0; ; attempted += 1) {
      try {
        return await attempt(pathAndQuery, label);
      } catch (error) {
        if (!(error instanceof ApiFootballError)) throw error;
        if (
          attempted >= API_FOOTBALL_MAX_RETRIES ||
          !isRetryableApiFootballError(error, retryNetwork)
        ) {
          throw error;
        }
        const base = error.kind === "rate" ? rateLimitWaitMs : retryDelayMs;
        // 간격 규칙(응답 후 6.5초)보다 짧게 기다리지 않는다
        const delayMs = Math.max(base, minIntervalMs);
        if (noTimeFor(delayMs)) throw withRetrySkipped(error, "no-time");
        if (capReached()) throw withRetrySkipped(error, "cap");
        retries += 1;
        options.onRetry?.({
          path: pathAndQuery,
          retry: retries,
          error,
          delayMs,
        });
        await sleep(delayMs);
      }
    }
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    async getFixturesByDate(date) {
      const path = fixturesByDatePath(date);
      const response = await enqueue(() => request(path, "날짜 조회", true));
      if (!Array.isArray(response)) {
        throw new ApiFootballError(
          "format",
          "API-Football 날짜 조회 응답의 response가 배열이 아니다",
        );
      }
      return response;
    },
    async getFixtureById(id) {
      const path = fixtureByIdPath(id);
      const response = await enqueue(() => request(path, "경기 단건", false));
      if (!Array.isArray(response)) {
        throw new ApiFootballError(
          "format",
          "API-Football 경기 단건 응답의 response가 배열이 아니다",
        );
      }
      return response[0] ?? null;
    },
    get calls() {
      return calls;
    },
    get retries() {
      return retries;
    },
    get rate() {
      return rate;
    },
  };
}

// ─── 응답 경계 스키마 (필요한 필드만 — logo·photo·flag·venue·referee·statistics 등은 버려진다) ─────

const PositiveId = z.number().int().positive();
/** 선수 id — 응답에 이름 모를 선수가 0·null로 온다(1575182 실측) → 양수가 아니면 null */
const NullableId = z
  .number()
  .int()
  .nullable()
  .transform((v) => (v !== null && v > 0 ? v : null));

const AfScorePairSchema = z.object({
  home: z.number().int().nonnegative().nullable(),
  away: z.number().int().nonnegative().nullable(),
});

const AfTeamSchema = z.object({ id: PositiveId, name: z.string().min(1) });

/** 경기 목록·단건 공통 머리 — `fixture`·`league`·`teams`·`goals`·`score` */
export const AfFixtureCoreSchema = z.object({
  fixture: z.object({
    id: PositiveId,
    date: z.string(),
    status: z.object({ short: z.string().min(1) }),
  }),
  league: z.object({
    id: PositiveId,
    name: z.string(),
    season: z.number().int().nullable().optional(),
    round: z.string().nullable().optional(),
  }),
  teams: z.object({ home: AfTeamSchema, away: AfTeamSchema }),
  goals: AfScorePairSchema,
  score: z
    .object({
      halftime: AfScorePairSchema.nullable().optional(),
      fulltime: AfScorePairSchema.nullable().optional(),
      extratime: AfScorePairSchema.nullable().optional(),
      penalty: AfScorePairSchema.nullable().optional(),
    })
    .nullable()
    .optional(),
});
type AfFixtureCore = z.infer<typeof AfFixtureCoreSchema>;

const AfPersonSchema = z.object({
  id: NullableId,
  name: z.string().nullable(),
});

/** 팀 id(이벤트) — 없으면 null */
const NullableTeamId = z.number().int().positive().nullable();

/** events[] 한 건 */
export const AfEventSchema = z.object({
  time: z.object({
    elapsed: z.number().int().nonnegative(),
    extra: z.number().int().nullable().optional(),
  }),
  team: z.object({ id: NullableTeamId }),
  player: AfPersonSchema,
  assist: AfPersonSchema.nullable().optional(),
  type: z.string(),
  detail: z.string().nullable(),
  comments: z.string().nullable().optional(),
});

const AfLineupPlayersSchema = z.array(
  z.object({
    player: z.object({ id: NullableId, name: z.string().nullable() }),
  }),
);

/** lineups[] 한 건 */
export const AfLineupSchema = z.object({
  team: z.object({ id: PositiveId }),
  formation: z.string().nullable().optional(),
  startXI: AfLineupPlayersSchema.nullable().optional(),
  substitutes: AfLineupPlayersSchema.nullable().optional(),
});

/** players[] 한 건(팀별 선수 기록) — 선수는 하나씩 검증한다(한 선수가 틀려도 나머지 출전 시간은 쓴다) */
export const AfPlayersBlockSchema = z.object({
  team: z.object({ id: PositiveId }),
  players: z.array(z.unknown()),
});

/** 선수 기록 1명 — 출전 시간만 읽는다(goals.total·games.substitute는 믿을 수 없다 — M0-29) */
export const AfPlayerStatsSchema = z.object({
  player: z.object({ id: NullableId }),
  statistics: z
    .array(
      z.object({
        games: z
          .object({ minutes: z.number().int().nonnegative().nullable() })
          .partial()
          .nullable()
          .optional(),
      }),
    )
    .nullable()
    .optional(),
});

/** 경기 단건 응답 1건 — 머리 + events·lineups·players(항목은 하나씩 검증 — 한 건이 틀려도 나머지는 쓴다) */
export const AfFixtureDetailSchema = AfFixtureCoreSchema.extend({
  events: z.array(z.unknown()).nullable().optional(),
  lineups: z.array(z.unknown()).nullable().optional(),
  players: z.array(z.unknown()).nullable().optional(),
});

// ─── 내부 형식 변환 (순수 함수) ──────────────────────────────────────────

/** API-Football 팀 — id·원문 이름(로고 없음) */
export interface AfTeam {
  id: number;
  name: string;
}

/** 경기 목록 항목(날짜 조회·단건 머리)의 내부 형식 */
export interface AfFixture {
  matchId: number;
  leagueId: number;
  leagueName: string;
  season: number | null;
  round: string | null;
  /** 킥오프(UTC ISO, `Z`) */
  kickoff: string;
  /** fixture.status.short(NS·1H·FT·PEN·PST …) */
  status: string;
  home: AfTeam;
  away: AfTeam;
  /** 정규시간 + 연장 스코어(승부차기 제외) — 둘 다 있을 때만, 없으면 null(시작 전·취소 등) */
  goals: Score | null;
}

function toScore(
  pair: z.infer<typeof AfScorePairSchema> | null | undefined,
): Score | null {
  if (!pair || pair.home === null || pair.away === null) return null;
  return { home: pair.home, away: pair.away };
}

/** `+00:00` 오프셋 시각 → UTC `Z`(time.ts) — 해석할 수 없으면 null */
export function afKickoffToUtc(raw: string): string | null {
  return parseFeedDate(raw);
}

function coreToFixture(core: AfFixtureCore): AfFixture | null {
  const kickoff = afKickoffToUtc(core.fixture.date);
  if (kickoff === null) return null;
  return {
    matchId: core.fixture.id,
    leagueId: core.league.id,
    leagueName: core.league.name,
    season: core.league.season ?? null,
    round: core.league.round ?? null,
    kickoff,
    status: core.fixture.status.short,
    home: { id: core.teams.home.id, name: core.teams.home.name },
    away: { id: core.teams.away.id, name: core.teams.away.name },
    goals: toScore(core.goals),
  };
}

/** 경기 목록 항목 원문 → 내부 형식. 형식이 틀리거나 팀 id·이름·킥오프가 없으면 null */
export function toAfFixture(raw: unknown): AfFixture | null {
  const parsed = AfFixtureCoreSchema.safeParse(raw);
  return parsed.success ? coreToFixture(parsed.data) : null;
}

/** 종료 상태 → 경기 방식 */
function durationOf(status: string): MatchDuration | null {
  switch (status) {
    case "FT":
      return "REGULAR";
    case "AET":
      return "EXTRA_TIME";
    case "PEN":
      return "PENALTY_SHOOTOUT";
    default:
      return null;
  }
}

/**
 * 종료 경기 스코어(공통 규칙 — match-data.ts). `goals`(정규 + 연장, 승부차기 제외)를 ft로, 승부차기 경기는 `score.penalty`를
 * pens로. 쓸 수 없으면 null: goals 없음 · 승부차기 경기인데 penalty 없음.
 * regular(90분)는 정규시간 종료면 ft, 연장 경기면 `score.fulltime`(1639860 실측 — fulltime 0-0·extratime 1-1·goals 1-1).
 */
export function toAfMatchScore(
  status: string,
  goals: Score | null,
  score: AfFixtureCore["score"],
): MatchScore | null {
  const duration = durationOf(status);
  if (duration === null || goals === null) return null;
  const ht = toScore(score?.halftime);
  if (duration === "REGULAR") {
    return { ft: goals, ht, regular: goals, pens: null, duration };
  }
  const regular = toScore(score?.fulltime);
  if (duration === "EXTRA_TIME") {
    return { ft: goals, ht, regular, pens: null, duration };
  }
  const pens = toScore(score?.penalty);
  if (!pens) return null;
  return { ft: goals, ht, regular, pens, duration };
}

function personOf(p: z.infer<typeof AfPersonSchema> | null | undefined) {
  const name = p?.name?.trim();
  if (!p || !name) return null;
  return { id: p.id, name } satisfies PersonRef;
}

const GOAL_KIND_BY_DETAIL: Readonly<Record<string, MatchGoal["kind"]>> = {
  "normal goal": "normal",
  penalty: "penalty",
  "own goal": "own-goal",
};

/** 승부차기 킥 이벤트인가 — 경기 중 득점이 아니다(comments "Penalty Shootout" — fixtures-id-1639860 실측) */
function isShootoutEvent(event: z.infer<typeof AfEventSchema>): boolean {
  return /shoot-?out/i.test(event.comments ?? "");
}

/** 라인업에서 선수의 팀 쪽 */
function lineupSideOf(
  lineups: MatchDetail["lineups"],
  playerId: number | null,
): Side | null {
  if (playerId === null) return null;
  for (const side of ["home", "away"] as const) {
    const lineup = lineups[side];
    if (
      lineup &&
      (lineup.startXI.some((p) => p.id === playerId) ||
        lineup.substitutes.some((p) => p.id === playerId))
    ) {
      return side;
    }
  }
  return null;
}

const otherSide = (side: Side): Side => (side === "home" ? "away" : "home");

export interface GoalsParse {
  goals: MatchGoal[];
  /** 해석하지 못한 득점 이벤트 수(형식 오류·팀을 알 수 없음·자책골 선수의 팀을 라인업에서 못 찾음) */
  unresolved: number;
}

/**
 * events 원문 → 경기 중 득점(시간 순). 득점 = type Goal + detail Normal Goal·Penalty·Own Goal, 승부차기 킥 제외.
 * 일반·PK 득점은 이벤트 `team`의 쪽, 자책골은 라인업에서 찾은 선수 팀의 **상대** 쪽.
 * 형식이 틀린 이벤트가 득점인지 알 수 없으면 `unresolved`로 센다.
 */
export function parseGoalEvents(
  rawEvents: readonly unknown[],
  ctx: {
    homeId: number;
    awayId: number;
    lineups: MatchDetail["lineups"];
  },
): GoalsParse {
  const goals: Array<{ goal: MatchGoal; order: number }> = [];
  let unresolved = 0;
  rawEvents.forEach((raw, order) => {
    const parsed = AfEventSchema.safeParse(raw);
    if (!parsed.success) {
      // 득점 이벤트였는지 알 수 없는 형식 오류 — type이 Goal이면 득점 목록이 불완전하다
      const type = (raw as { type?: unknown } | null)?.type;
      if (typeof type !== "string" || type.toLowerCase() === "goal") {
        unresolved += 1;
      }
      return;
    }
    const e = parsed.data;
    if (e.type.toLowerCase() !== "goal" || isShootoutEvent(e)) return;
    const kind = GOAL_KIND_BY_DETAIL[(e.detail ?? "").trim().toLowerCase()];
    if (kind === undefined) return; // Missed Penalty 등 — 골이 아니다
    const scorer = personOf(e.player);
    if (!scorer) {
      unresolved += 1;
      return;
    }
    let side: Side | null;
    if (kind === "own-goal") {
      const playerSide = lineupSideOf(ctx.lineups, scorer.id);
      side = playerSide === null ? null : otherSide(playerSide);
    } else {
      side =
        e.team.id === ctx.homeId
          ? "home"
          : e.team.id === ctx.awayId
            ? "away"
            : null;
    }
    if (side === null) {
      unresolved += 1;
      return;
    }
    goals.push({
      goal: {
        minute: e.time.elapsed,
        extra: e.time.extra ?? null,
        side,
        kind,
        scorer,
        assist: kind === "own-goal" ? null : personOf(e.assist),
      },
      order,
    });
  });
  goals.sort(
    (a, b) =>
      a.goal.minute - b.goal.minute ||
      (a.goal.extra ?? 0) - (b.goal.extra ?? 0) ||
      a.order - b.order,
  );
  return { goals: goals.map((g) => g.goal), unresolved };
}

/** 득점 목록이 최종 스코어와 맞는가(양 팀 모두) */
export function goalsMatchScore(goals: readonly MatchGoal[], ft: Score) {
  const home = goals.filter((g) => g.side === "home").length;
  const away = goals.filter((g) => g.side === "away").length;
  return home === ft.home && away === ft.away;
}

function lineupPlayers(
  raw: z.infer<typeof AfLineupPlayersSchema> | null | undefined,
  minutes: ReadonlyMap<number, number | null>,
): LineupPlayer[] {
  return (raw ?? []).flatMap(({ player }) => {
    const name = player.name?.trim();
    if (!name) return [];
    return [
      {
        id: player.id,
        name,
        minutes: player.id === null ? null : (minutes.get(player.id) ?? null),
      },
    ];
  });
}

/** players[] 원문 → 선수 id → 출전 시간(첫 statistics의 games.minutes) */
function minutesById(
  rawBlocks: readonly unknown[],
): Map<number, number | null> {
  const minutes = new Map<number, number | null>();
  for (const raw of rawBlocks) {
    const block = AfPlayersBlockSchema.safeParse(raw);
    if (!block.success) continue;
    for (const rawPlayer of block.data.players) {
      const p = AfPlayerStatsSchema.safeParse(rawPlayer);
      if (!p.success || p.data.player.id === null) continue;
      minutes.set(
        p.data.player.id,
        p.data.statistics?.[0]?.games?.minutes ?? null,
      );
    }
  }
  return minutes;
}

/** lineups[] 원문 → 홈·원정 라인업(팀 id로 쪽을 정한다 — 형식이 틀리거나 팀이 다르면 그쪽은 null) */
export function toLineups(
  rawLineups: readonly unknown[],
  rawPlayers: readonly unknown[],
  homeId: number,
  awayId: number,
): MatchDetail["lineups"] {
  const minutes = minutesById(rawPlayers);
  const lineups: MatchDetail["lineups"] = { home: null, away: null };
  for (const raw of rawLineups) {
    const parsed = AfLineupSchema.safeParse(raw);
    if (!parsed.success) continue;
    const l = parsed.data;
    const side: Side | null =
      l.team.id === homeId ? "home" : l.team.id === awayId ? "away" : null;
    if (side === null || lineups[side] !== null) continue;
    const lineup: TeamLineup = {
      formation: l.formation?.trim() || null,
      startXI: lineupPlayers(l.startXI, minutes),
      substitutes: lineupPlayers(l.substitutes, minutes),
    };
    lineups[side] = lineup;
  }
  return lineups;
}

export type AfDetailResult =
  | { kind: "finished"; detail: MatchDetail }
  /** 아직 끝나지 않았거나 경기 없이 끝난 상태 — 머리만 돌려준다(이월·정리 판단) */
  | { kind: "not-finished"; fixture: AfFixture }
  | { kind: "invalid"; reason: string };

/**
 * 경기 단건 응답 원문 → 종료 경기 상세. 종료(FT·AET·PEN)가 아니면 `not-finished`(머리만), 머리 형식이 틀리거나
 * 스코어를 만들 수 없으면 `invalid`. events·lineups·players 항목은 하나씩 검증한다.
 */
export function toMatchDetail(
  raw: unknown,
  ctx: { compByLeague: ReadonlyMap<number, CompId>; fetchedAt: string },
): AfDetailResult {
  const parsed = AfFixtureDetailSchema.safeParse(raw);
  if (!parsed.success) {
    return { kind: "invalid", reason: "경기 머리 형식이 다르다" };
  }
  const core = parsed.data;
  const fixture = coreToFixture(core);
  if (fixture === null) {
    return { kind: "invalid", reason: "킥오프 시각을 해석할 수 없다" };
  }
  if (!AF_FINISHED_STATUSES.has(fixture.status)) {
    return { kind: "not-finished", fixture };
  }
  const score = toAfMatchScore(fixture.status, fixture.goals, core.score);
  if (score === null) {
    return {
      kind: "invalid",
      reason: `종료(${fixture.status}) 경기 스코어가 없다(goals·score.penalty)`,
    };
  }
  const lineups = toLineups(
    core.lineups ?? [],
    core.players ?? [],
    fixture.home.id,
    fixture.away.id,
  );
  const { goals, unresolved } = parseGoalEvents(core.events ?? [], {
    homeId: fixture.home.id,
    awayId: fixture.away.id,
    lineups,
  });
  return {
    kind: "finished",
    detail: {
      provider: "api-football",
      matchId: fixture.matchId,
      leagueId: fixture.leagueId,
      leagueName: fixture.leagueName,
      comp: ctx.compByLeague.get(fixture.leagueId) ?? null,
      season: fixture.season,
      round: fixture.round,
      kickoff: fixture.kickoff,
      status: fixture.status as MatchDetail["status"],
      home: { ...fixture.home, fullName: null },
      away: { ...fixture.away, fullName: null },
      score,
      goals,
      goalsComplete: unresolved === 0 && goalsMatchScore(goals, score.ft),
      lineups,
      fetchedAt: ctx.fetchedAt,
    },
  };
}

// ─── 짝짓기 입력 ─────────────────────────────────────────────────────────

/**
 * 경기 목록 항목 → 짝짓기 입력(scripts/lib/team-ids.ts). 6개 대회 경기만(아니면 null), 종료(FT·AET·PEN)일 때만
 * `goals`(승부차기 제외)를 ft로 쓴다.
 */
export function afFixtureToPairing(
  fixture: AfFixture,
  compByLeague: ReadonlyMap<number, CompId>,
): PairingMatch | null {
  const comp = compByLeague.get(fixture.leagueId);
  if (!comp) return null;
  return {
    matchId: fixture.matchId,
    comp,
    kickoff: fixture.kickoff,
    home: fixture.home,
    away: fixture.away,
    ft: AF_FINISHED_STATUSES.has(fixture.status) ? fixture.goals : null,
  };
}

/** 경기 상세 → 짝짓기 입력(6개 대회 경기만) */
export function matchDetailToPairing(detail: MatchDetail): PairingMatch | null {
  if (detail.comp === null) return null;
  return {
    matchId: detail.matchId,
    comp: detail.comp,
    kickoff: detail.kickoff,
    home: { id: detail.home.id, name: detail.home.name },
    away: { id: detail.away.id, name: detail.away.name },
    ft: detail.score.ft,
  };
}
