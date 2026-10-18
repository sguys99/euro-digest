/**
 * football-data.org v4 어댑터 — 브리핑 입력용 최소 범위 (M1-44, PRD §15 D24 → M2-02가 대회 페이지용으로 확장).
 * 외부 응답은 이 파일의 경계에서 zod로 파싱해 내부 형식(scripts/lib/match-data.ts — `FinishedMatch`·`CompStandings`)으로
 * 바꾼다. 화면·data/·브리핑 입력은 football-data 키를 모른다(CLAUDE.md §6.4). 필요한 필드만 읽고 crest·emblem·odds·
 * referees는 스키마에 없어 버려진다.
 *
 * 하루 요청 (브리핑 입력 — 최대 7건)
 *   ① 교차 `/v4/matches?competitions=<6개 코드>&dateFrom&dateTo` 1건 → 입력 창 안에 킥오프한 종료(FINISHED) 경기
 *   ② `/v4/competitions/{code}/standings` — ①에서 **순위표에 영향을 주는 종료 경기가 있는 대회만**(0~6건, 설정 순서).
 *      UCL 녹아웃(PLAYOFFS·LAST_16 …) 경기만 있는 날은 순위표가 바뀌지 않아 부르지 않는다.
 *   경기별 득점자는 무료 플랜에 없다(M0-28) — API-Football 경기 단건 어댑터(M1-48)가 맡는다.
 *
 * 호출 정책 (M0-28 "레이트 리밋 설계", CLAUDE.md §6.4)
 *   - 분당 10회 → 동시 1개, **응답 후 6.5초 간격**. 응답 헤더 `X-Requests-Available-Minute`가 1 이하이면
 *     `X-RequestCounter-Reset` + 1초까지 기다린다(키 하나를 개발 호출과 나눠 쓰는 경우의 가드).
 *   - 요청 1회 타임아웃 **30초**(`FOOTBALL_DATA_TIMEOUT_MS`): 교차 `/v4/matches` 단건 실측이 M0-28 3.3~5.2초 → M1-03 Actions
 *     약 12초 → M1-44 dry 17.6초(2026-10-13 01:00 KST)로 늘어 기존 15초로는 끊긴다(대회별 엔드포인트는 0.8~1.9초). 30초 =
 *     관측 최대의 약 1.7배. M1 관찰 기간에 25초를 넘는 응답이 나오면 대회별 엔드포인트(M0-28 권고)로 바꾸거나 다시 올린다.
 *     단계 마감이 더 가까우면 남은 시간으로 줄인다.
 *   - 재시도는 **429·5xx·타임아웃만 1회**. 429는 `X-RequestCounter-Reset`(초) + 1초 → `Retry-After` → 기본 61초(60초 고정 창)를
 *     기다리되 65초보다 길면 다시 보내지 않는다. 5xx·타임아웃은 10초 뒤(M0-28 권고 ③, M1-48과 같은 값). 연결 오류·4xx·형식
 *     오류는 다시 보내도 결과가 같거나 원인이 우리 쪽이라 재시도하지 않는다. 대기 + 최소 시도 시간이 단계 마감을 넘으면
 *     재시도하지 않는다.
 *   - **단계 시간 예산 150초**(`FOOTBALL_DATA_STAGE_BUDGET_MS`) — 근거: 겨울(D26)은 07:10 수집 시작 → 07:20 브리핑 마감
 *     (공개 07:30 − 10분)까지 10분 안에 Actions 준비(가드 job + checkout·npm ci 약 1~2분), 뉴스 단계(예산 90초 — M1-03),
 *     경기 데이터, LLM 단건(요청 타임아웃 min(120초, 남은 시간) — D57, 그 전 60초 + 429·5xx 재시도, D28)이 모두 들어가야 한다. 평상시 7요청은 간격 6.5초 × 6 +
 *     응답(교차 3~18초, 순위 1~2초) ≈ 1분이고, 150초면 타임아웃 재시도 1회(10초 + 30초)까지 들어가면서 LLM 몫으로 4분 이상이
 *     남는다. 여름(06:30 → 06:50)은 20분이라 더 여유롭다. 실제 단계 마감 = min(시작 + 150초, 브리핑 마감)(M1-47 —
 *     `src/lib/time.ts` publishSlot·scripts/lib/collect-deadlines.ts). LLM 몫을 떼지 않는 이유: 템플릿 브리핑(M1-19)도 이
 *     데이터로 만들므로, 데이터가 늦으면 LLM 몫이 줄어 템플릿이 되고(FR-26) 데이터를 자르면 템플릿조차 만들 수 없다.
 *     마감까지 3분도 남지 않은 실행은 시작 + 8분을 마감으로 쓰므로(off-slot) 정시·수동 실행 모두 사실상 150초다.
 *   - 인증은 `X-Auth-Token` 헤더. 키 값은 로그·오류 메시지·요청 경로에 넣지 않는다. 응답 본문도 메시지에 넣지 않는다
 *     (오류 본문의 숫자 `errorCode`만 읽는다).
 *   - 실패하면 그 단계만 실패한다: ① 실패 = 그날 브리핑 생략(뉴스는 발행 — D24), ② 실패 = 그 대회 순위만 빠진다(브리핑은 진행).
 *
 * 응답 주의 (fixtures/football/README.md, M0-28)
 *   - 교차 `/v4/matches`는 `dateTo` 당일을 빼고 준다 → 창의 UTC 시작일·끝 날짜를 dateFrom·dateTo로 보내고, 받은 뒤 킥오프로
 *     창을 다시 거른다(`footballDataDateRange`).
 *   - `IN_PLAY`·`CANCELLED`에도 `score.fullTime`이 채워져 온다 → status로 거른다.
 *   - 승부차기 경기는 `score.fullTime`에 승부차기 골이 들어가고 `penalties`가 따로 붙는다(API-Football과 반대) → 내부 `ft`는
 *     승부차기 골을 뺀 값(match-data.ts 스코어 규칙). `penalties`가 없으면 ft를 알 수 없어 그 경기를 쓰지 않는다.
 *   - 순위표는 진행 중 경기 점수까지 반영한다 → 받은 시점의 진행 중 경기 수를 `CompStandings.inProgress`로 넘긴다.
 *   - 순위표 `form`은 항상 null, `prevPos`는 없다(M2-03이 계산). `TOTAL`만 쓴다. UCL은 리그 페이즈 36팀 단일 테이블.
 */
import { z } from "zod";

import { IsoSchema, type CompId, type CompetitionConfig } from "@/lib/schema";
import { parseUtcIso, type UtcRange } from "@/lib/time";

import type {
  CompStandings,
  FinishedMatch,
  MatchDuration,
  MatchScore,
  MatchSlot,
  Score,
  StandingsRow,
  StandingsTable,
  TeamRef,
} from "../match-data";
import { parseRetryAfterMs, type FetchLike } from "../rss";

// ─── 상수 ────────────────────────────────────────────────────────────────

export const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4";

/** 응답 후 다음 요청까지 최소 간격 — 분당 10회 한도 안(M0-28: 한 60초 창에 최대 8건) */
export const FOOTBALL_DATA_MIN_INTERVAL_MS = 6_500;

/** 요청 1회 타임아웃 — 근거는 파일 머리 주석(교차 엔드포인트 실측 최대 17.6초의 약 1.7배) */
export const FOOTBALL_DATA_TIMEOUT_MS = 30_000;

/** 재시도 횟수 — 1회 고정 */
export const FOOTBALL_DATA_MAX_RETRIES = 1;

/** 5xx·타임아웃 재시도 전 대기(M0-28 권고 ③) */
export const FOOTBALL_DATA_RETRY_DELAY_MS = 10_000;

/** 429인데 헤더로 대기 시간을 알 수 없을 때 — 60초 고정 창 + 1초(M0-28 실측) */
export const FOOTBALL_DATA_RATE_LIMIT_WAIT_MS = 61_000;

/** 429 대기 상한 — 서버가 이보다 오래 기다리라고 하면 다시 보내지 않는다(분 창보다 길면 일 한도 등 다른 원인) */
export const FOOTBALL_DATA_RATE_LIMIT_WAIT_MAX_MS = 65_000;

/** 요청을 새로 시작할 최소 남은 시간 — 이보다 짧으면 시작하지 않는다(대회별 응답 1~2초 · 교차 3~12초) */
export const FOOTBALL_DATA_MIN_ATTEMPT_MS = 3_000;

/** football-data 단계 전체 시간 예산 상한 — 근거는 파일 머리 주석(브리핑 마감이 더 가까우면 그때까지 — M1-47) */
export const FOOTBALL_DATA_STAGE_BUDGET_MS = 150_000;

/** 진행 중 상태 — 순위표가 이 경기의 현재 점수를 반영한다(M0-28) */
const IN_PROGRESS_STATUSES: ReadonlySet<string> = new Set([
  "IN_PLAY",
  "PAUSED",
  "LIVE",
  "EXTRA_TIME",
  "PENALTY_SHOOTOUT",
]);

/** 순위표에 반영되는 단계 — 이 밖(PLAYOFFS·LAST_16 …)은 녹아웃이라 순위 호출 대상이 아니다. stage가 없으면 반영으로 본다 */
const TABLE_STAGES: ReadonlySet<string> = new Set([
  "REGULAR_SEASON",
  "LEAGUE_STAGE",
  "GROUP_STAGE",
]);

// ─── 오류 ────────────────────────────────────────────────────────────────

/**
 * - timeout: 요청 타임아웃(재시도 대상) · network: 연결 오류(재시도 안 함)
 * - http: HTTP 오류(429·5xx만 재시도) · format: JSON·형식 오류(재시도 안 함)
 * - budget: 단계 시간 예산 소진(요청을 시작하지 않았거나 예산 때문에 끊음)
 * - cancelled: 호출부가 멈췄다(뉴스 단계 실패 — 경기 데이터는 뉴스와 병렬로 시작한다, M1-48)
 */
export type FootballDataErrorKind =
  "timeout" | "network" | "http" | "format" | "budget" | "cancelled";

/** 재시도 대상이었지만 다시 보내지 않은 이유 */
export type FootballDataRetrySkip =
  /** 대기 + 최소 시도 시간이 단계 마감을 넘는다 */
  | "no-time"
  /** 429 대기가 상한(65초)보다 길다 */
  | "wait-too-long";

/** 어댑터 오류. 응답 본문·키는 메시지에 넣지 않는다. */
export class FootballDataError extends Error {
  override readonly name = "FootballDataError";
  readonly kind: FootballDataErrorKind;
  readonly status: number | null;
  /** football-data 오류 본문 `{message, errorCode}`의 errorCode — 없으면 null */
  readonly errorCode: number | null;
  /** 429 응답이 알려 준 대기 시간(ms) — 헤더가 없으면 undefined */
  readonly retryAfterMs: number | undefined;
  /** 재시도 대상인데 다시 보내지 않았으면 그 이유 */
  readonly retrySkipped: FootballDataRetrySkip | null;
  constructor(
    kind: FootballDataErrorKind,
    message: string,
    detail: {
      status?: number | null;
      errorCode?: number | null;
      retryAfterMs?: number;
      retrySkipped?: FootballDataRetrySkip | null;
    } = {},
  ) {
    super(message);
    this.kind = kind;
    this.status = detail.status ?? null;
    this.errorCode = detail.errorCode ?? null;
    this.retryAfterMs = detail.retryAfterMs;
    this.retrySkipped = detail.retrySkipped ?? null;
  }
}

function withRetrySkipped(
  error: FootballDataError,
  reason: FootballDataRetrySkip,
): FootballDataError {
  return new FootballDataError(error.kind, error.message, {
    status: error.status,
    errorCode: error.errorCode,
    retryAfterMs: error.retryAfterMs,
    retrySkipped: reason,
  });
}

/** 재시도 대상 — 타임아웃·429·5xx */
export function isRetryableFootballDataError(
  error: Pick<FootballDataError, "kind" | "status">,
): boolean {
  if (error.kind === "timeout") return true;
  if (error.kind !== "http" || error.status === null) return false;
  return error.status === 429 || error.status >= 500;
}

// ─── 응답 헤더 ───────────────────────────────────────────────────────────

export interface RateLimitHeaders {
  /** `X-Requests-Available-Minute` — 이번 60초 창에 남은 요청 수 */
  availableMinute: number | null;
  /** `X-RequestCounter-Reset` — 창이 초기화될 때까지 남은 초 */
  resetSeconds: number | null;
}

function headerInt(headers: Headers, name: string): number | null {
  const raw = headers.get(name)?.trim();
  return raw && /^\d+$/.test(raw) ? Number(raw) : null;
}

/** 레이트 리밋 헤더(M0-28 실측 이름 — 문서의 `X-RequestsAvailable`이 아니다). 해석할 수 없으면 null */
export function readRateLimitHeaders(headers: Headers): RateLimitHeaders {
  return {
    availableMinute: headerInt(headers, "X-Requests-Available-Minute"),
    resetSeconds: headerInt(headers, "X-RequestCounter-Reset"),
  };
}

// ─── 클라이언트 ──────────────────────────────────────────────────────────

export interface FootballDataRetryEvent {
  /** 요청 경로(키 없음) */
  path: string;
  /** 몇 번째 재시도인가(1부터) */
  retry: number;
  error: FootballDataError;
  delayMs: number;
}

export interface FootballDataClientOptions {
  /** FOOTBALL_DATA_API_KEY — 출력하지 않는다 */
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
  rateLimitWaitMaxMs?: number;
  minAttemptMs?: number;
  /** 단계 마감(now 기준 ms). 이 시각을 넘는 대기·요청은 하지 않고 `budget`으로 실패한다. 없으면 제한 없음 */
  deadline?: number | null;
  /** 이 신호가 켜지면 새 요청을 보내지 않는다(`cancelled`) — 보내는 중인 요청은 끝까지 기다린다 */
  signal?: AbortSignal;
  baseUrl?: string;
  /** 재시도 직전에 부른다(로그용) */
  onRetry?: (event: FootballDataRetryEvent) => void;
}

export interface MatchesQuery {
  /** football-data 대회 코드(PL·PD·SA·BL1·FL1·CL) */
  competitions: readonly string[];
  /** YYYY-MM-DD (UTC 날짜) */
  dateFrom: string;
  /** YYYY-MM-DD (UTC 날짜) — 교차 엔드포인트는 이 날을 빼고 준다 */
  dateTo: string;
}

export interface FootballDataClient {
  /** `/v4/matches` — 경기 항목 원문 배열(항목 검증 전, 껍데기만 검증) */
  getMatches(query: MatchesQuery): Promise<unknown[]>;
  /** `/v4/competitions/{code}/standings` — 응답 원문(검증은 `toCompStandings`) */
  getStandings(code: string): Promise<unknown>;
  /** 이 클라이언트가 보낸 요청 수(실패·재시도 포함) — runs.json apiCalls.footballData */
  readonly calls: number;
  /** 재시도 횟수(calls에 포함) */
  readonly retries: number;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 요청 경로(키 없음) — 로그에 남겨도 된다 */
export function matchesPath(query: MatchesQuery): string {
  const params = new URLSearchParams({
    competitions: query.competitions.join(","),
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  });
  // URLSearchParams는 쉼표를 %2C로 바꾼다 — 사람이 읽기 쉽게 되돌린다(서버는 둘 다 받는다).
  return `/matches?${params.toString().replace(/%2C/g, ",")}`;
}

/** 순위 경로(시즌 파라미터 없음 = 현재 시즌) */
export function standingsPath(code: string): string {
  return `/competitions/${encodeURIComponent(code)}/standings`;
}

/** UTC ISO → UTC 날짜 "YYYY-MM-DD" (시간대 변환 없음) */
function utcDateOf(iso: string): string {
  return parseUtcIso(iso).toISOString().slice(0, 10);
}

/**
 * 창 → 교차 `/v4/matches`의 dateFrom·dateTo. 이 엔드포인트는 dateTo 당일을 빼므로 창 끝의 UTC 날짜를 그대로 넣는다
 * (창 = UTC 하루 D-1이면 dateFrom D-1, dateTo D → D-1 경기). 받은 뒤 킥오프로 창을 다시 거른다.
 */
export function footballDataDateRange(window: UtcRange): {
  dateFrom: string;
  dateTo: string;
} {
  return { dateFrom: utcDateOf(window.start), dateTo: utcDateOf(window.end) };
}

/** 오류 본문 `{message, errorCode}`에서 숫자 errorCode만 — 본문은 남기지 않는다 */
async function readErrorCode(response: Response): Promise<number | null> {
  try {
    const body: unknown = await response.json();
    const parsed = z
      .object({ errorCode: z.number().int() })
      .safeParse(body ?? {});
    return parsed.success ? parsed.data.errorCode : null;
  } catch {
    return null;
  }
}

function isAbortLike(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  return name === "TimeoutError" || name === "AbortError";
}

export function createFootballDataClient(
  options: FootballDataClientOptions,
): FootballDataClient {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new FootballDataError("format", "FOOTBALL_DATA_API_KEY가 비어 있다");
  }
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;
  const minIntervalMs = options.minIntervalMs ?? FOOTBALL_DATA_MIN_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? FOOTBALL_DATA_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? FOOTBALL_DATA_RETRY_DELAY_MS;
  const rateLimitWaitMs =
    options.rateLimitWaitMs ?? FOOTBALL_DATA_RATE_LIMIT_WAIT_MS;
  const rateLimitWaitMaxMs =
    options.rateLimitWaitMaxMs ?? FOOTBALL_DATA_RATE_LIMIT_WAIT_MAX_MS;
  const minAttemptMs = options.minAttemptMs ?? FOOTBALL_DATA_MIN_ATTEMPT_MS;
  const deadline = options.deadline ?? null;
  const baseUrl = options.baseUrl ?? FOOTBALL_DATA_BASE_URL;
  let lastResponseAt: number | null = null;
  /** 레이트 리밋 헤더 가드 — 이 시각 전에는 보내지 않는다 */
  let guardUntil = 0;
  let calls = 0;
  let retries = 0;
  // 동시 1개 — 요청을 한 줄로 세운다.
  let queue: Promise<unknown> = Promise.resolve();

  const budgetError = (message: string) =>
    new FootballDataError("budget", message);

  /** 남은 시간이 대기 + 최소 시도 시간보다 짧은가 */
  const noTimeFor = (waitMs: number): boolean =>
    deadline !== null && now() + waitMs + minAttemptMs > deadline;

  /** 간격(응답 후 6.5초)·헤더 가드를 지킨다. 기다려도 마감 전에 시도할 수 없으면 budget */
  async function waitTurn(): Promise<void> {
    const readyAt = Math.max(
      lastResponseAt === null ? 0 : lastResponseAt + minIntervalMs,
      guardUntil,
    );
    const wait = readyAt - now();
    if (noTimeFor(Math.max(0, wait))) {
      throw budgetError("football-data 단계 시간 예산 소진 — 요청하지 않음");
    }
    if (wait > 0) await sleep(wait);
  }

  function noteRateHeaders(headers: Headers, at: number): RateLimitHeaders {
    const rate = readRateLimitHeaders(headers);
    if (
      rate.availableMinute !== null &&
      rate.availableMinute <= 1 &&
      rate.resetSeconds !== null
    ) {
      const waitMs = Math.min(
        (rate.resetSeconds + 1) * 1000,
        rateLimitWaitMaxMs,
      );
      guardUntil = Math.max(guardUntil, at + waitMs);
    }
    return rate;
  }

  function checkCancelled(): void {
    if (options.signal?.aborted) {
      throw new FootballDataError(
        "cancelled",
        "football-data 요청 중단(호출부 취소)",
      );
    }
  }

  /** 요청 1회(재시도 없음) */
  async function attempt(pathAndQuery: string): Promise<unknown> {
    checkCancelled();
    await waitTurn();
    checkCancelled();
    const start = now();
    let attemptTimeout = timeoutMs;
    let boundByDeadline = false;
    if (deadline !== null) {
      const remaining = deadline - start;
      if (remaining < minAttemptMs) {
        throw budgetError("football-data 단계 시간 예산 소진 — 요청하지 않음");
      }
      if (remaining <= timeoutMs) {
        attemptTimeout = remaining;
        boundByDeadline = true;
      }
    }
    const timedOut = () =>
      boundByDeadline
        ? budgetError(
            `football-data 단계 시간 예산 소진으로 요청 중단 (${attemptTimeout}ms)`,
          )
        : new FootballDataError(
            "timeout",
            `football-data 요청 시간 초과 (${attemptTimeout}ms)`,
          );
    calls += 1;
    let response: Response;
    try {
      response = await options.fetch(`${baseUrl}${pathAndQuery}`, {
        headers: { "X-Auth-Token": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(attemptTimeout),
      });
    } catch (error) {
      lastResponseAt = now();
      if (isAbortLike(error)) throw timedOut();
      throw new FootballDataError(
        "network",
        "football-data 요청 실패(연결 오류)",
      );
    }
    try {
      const rate = noteRateHeaders(response.headers, now());
      if (!response.ok) {
        const status = response.status;
        const errorCode = await readErrorCode(response);
        let retryAfterMs: number | undefined;
        if (status === 429) {
          retryAfterMs =
            rate.resetSeconds !== null
              ? (rate.resetSeconds + 1) * 1000
              : parseRetryAfterMs(response.headers.get("Retry-After"), now());
        }
        throw new FootballDataError(
          "http",
          `football-data 응답 HTTP ${status}${errorCode !== null ? ` (errorCode ${errorCode})` : ""}`,
          { status, errorCode, retryAfterMs },
        );
      }
      try {
        return await response.json();
      } catch (error) {
        if (isAbortLike(error)) throw timedOut();
        throw new FootballDataError(
          "format",
          "football-data 응답 JSON 파싱 실패",
          { status: response.status },
        );
      }
    } finally {
      lastResponseAt = now();
    }
  }

  /** 재시도 대상 오류면 1회 다시 보낸다 */
  async function request(pathAndQuery: string): Promise<unknown> {
    for (let attempted = 0; ; attempted += 1) {
      try {
        return await attempt(pathAndQuery);
      } catch (error) {
        if (!(error instanceof FootballDataError)) throw error;
        if (
          attempted >= FOOTBALL_DATA_MAX_RETRIES ||
          !isRetryableFootballDataError(error)
        ) {
          throw error;
        }
        let delayMs = retryDelayMs;
        if (error.status === 429) {
          delayMs = error.retryAfterMs ?? rateLimitWaitMs;
          if (delayMs > rateLimitWaitMaxMs) {
            throw withRetrySkipped(error, "wait-too-long");
          }
        }
        // 간격 규칙(응답 후 6.5초)보다 짧게 기다리지 않는다
        delayMs = Math.max(delayMs, minIntervalMs);
        if (noTimeFor(delayMs)) throw withRetrySkipped(error, "no-time");
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
    async getMatches(query) {
      const json = await enqueue(() => request(matchesPath(query)));
      const parsed = FdMatchesResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new FootballDataError(
          "format",
          "football-data 경기 응답 형식이 다르다(matches 배열 없음)",
        );
      }
      return parsed.data.matches;
    },
    getStandings(code) {
      return enqueue(() => request(standingsPath(code)));
    },
    get calls() {
      return calls;
    },
    get retries() {
      return retries;
    },
  };
}

// ─── 응답 경계 스키마 (필요한 필드만 — 나머지 키는 무시) ─────────────────────

const ScorePairSchema = z.object({
  home: z.number().int().nonnegative().nullable(),
  away: z.number().int().nonnegative().nullable(),
});

const TeamSchema = z.object({
  id: z.number().int().positive().nullable(),
  name: z.string().nullable(),
  shortName: z.string().nullable().optional(),
});

/** `/v4/matches` 응답의 경기 1건 */
export const FdMatchSchema = z.object({
  id: z.number().int().positive(),
  utcDate: IsoSchema,
  status: z.string(),
  matchday: z.number().int().nullable().optional(),
  stage: z.string().nullable().optional(),
  competition: z.object({ code: z.string() }),
  homeTeam: TeamSchema,
  awayTeam: TeamSchema,
  score: z.object({
    duration: z.string().nullable().optional(),
    fullTime: ScorePairSchema,
    halfTime: ScorePairSchema.nullable().optional(),
    regularTime: ScorePairSchema.nullable().optional(),
    extraTime: ScorePairSchema.nullable().optional(),
    penalties: ScorePairSchema.nullable().optional(),
  }),
});
export type FdMatch = z.infer<typeof FdMatchSchema>;

/** 경기 응답 껍데기 — 경기 항목은 하나씩 검증한다(한 건이 틀려도 나머지는 쓴다). */
export const FdMatchesResponseSchema = z.object({
  matches: z.array(z.unknown()),
});

/** 순위표 1행 */
export const FdStandingRowSchema = z.object({
  position: z.number().int().min(1),
  team: TeamSchema,
  playedGames: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
  draw: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
  points: z.number().int(), // 승점 삭감으로 음수가 될 수 있다
  goalsFor: z.number().int().nonnegative(),
  goalsAgainst: z.number().int().nonnegative(),
});

/** `/v4/competitions/{code}/standings` 응답 — 행은 표마다 하나씩 검증한다 */
export const FdStandingsResponseSchema = z.object({
  filters: z
    .object({ season: z.union([z.string(), z.number()]).optional() })
    .nullable()
    .optional(),
  competition: z.object({ code: z.string() }),
  season: z
    .object({
      startDate: z.string().nullable().optional(),
      currentMatchday: z.number().int().nullable().optional(),
    })
    .nullable()
    .optional(),
  standings: z.array(
    z.object({
      stage: z.string().nullable().optional(),
      type: z.string(),
      group: z.string().nullable().optional(),
      table: z.array(z.unknown()),
    }),
  ),
});

// ─── 내부 형식 변환 (순수 함수) ──────────────────────────────────────────

export interface ResultsSkipped {
  /** 형식이 틀리거나 팀·스코어가 비어 쓸 수 없는 항목 */
  invalid: number;
  /** FINISHED가 아닌 경기(예정·진행 중·취소·연기·몰수) */
  notFinished: number;
  /** 입력 창 밖 킥오프 */
  outOfWindow: number;
  /** configs/competitions.json에 없는 대회 코드 */
  unknownComp: number;
}

export interface ResultsSummary {
  /** 창 안에 킥오프한 종료 경기(킥오프·id 순) */
  results: FinishedMatch[];
  skipped: ResultsSkipped;
  /** 대회별 진행 중 경기 수(창과 무관 — 순위표 확정 여부 판단용). 0인 대회는 키가 없다 */
  inProgress: Partial<Record<CompId, number>>;
  /**
   * results 밖의 대상 대회 경기(킥오프·id 순) — 미종료·연기·중단·점수 없음은 ft null, 창 밖 종료 경기는 최종 스코어. 경기 연결(D37)이
   * "그 af 경기에 맞는 fd 경기가 하나"인지 셀 때 쓴다(M1-48b 리뷰 — 점수를 모르는 같은 칸 경기가 있으면 자동 연결하지 않는다).
   */
  others: MatchSlot[];
}

function teamRef(team: z.infer<typeof TeamSchema>): TeamRef | null {
  const fullName = team.name?.trim() || null;
  const name = team.shortName?.trim() || fullName;
  if (team.id === null || !name) return null;
  return { id: team.id, name, fullName };
}

function toScore(pair: z.infer<typeof ScorePairSchema> | null | undefined) {
  if (!pair || pair.home === null || pair.away === null) return null;
  return { home: pair.home, away: pair.away };
}

function isDuration(value: string): value is MatchDuration {
  return (
    value === "REGULAR" ||
    value === "EXTRA_TIME" ||
    value === "PENALTY_SHOOTOUT"
  );
}

/**
 * football-data `score` → 내부 스코어(승부차기 골 제외). 쓸 수 없으면 null:
 * fullTime 없음 · 모르는 duration · 승부차기 경기인데 penalties 없음 · 빼면 음수 · regularTime + extraTime과 어긋남.
 * 두 경기 합산 녹아웃의 2차전은 그 경기 스코어가 동점이 아니어도 승부차기로 갈 수 있어 동점 여부는 보지 않는다.
 */
export function toMatchScore(score: FdMatch["score"]): MatchScore | null {
  const fullTime = toScore(score.fullTime);
  if (!fullTime) return null;
  const duration = score.duration ?? "REGULAR";
  if (!isDuration(duration)) return null;
  const ht = toScore(score.halfTime);
  const regular = toScore(score.regularTime);
  if (duration === "REGULAR") {
    return { ft: fullTime, ht, regular: fullTime, pens: null, duration };
  }
  if (duration === "EXTRA_TIME") {
    return { ft: fullTime, ht, regular, pens: null, duration };
  }
  const pens = toScore(score.penalties);
  if (!pens) return null;
  const ft: Score = {
    home: fullTime.home - pens.home,
    away: fullTime.away - pens.away,
  };
  if (ft.home < 0 || ft.away < 0) return null;
  const extra = toScore(score.extraTime);
  if (
    regular &&
    extra &&
    (regular.home + extra.home !== ft.home ||
      regular.away + extra.away !== ft.away)
  ) {
    return null;
  }
  return { ft, ht, regular, pens, duration };
}

/**
 * 경기 원문 배열 → 창 [start, end) 안에 킥오프한 종료 경기(킥오프·id 순). 형식이 틀리거나 팀 id·이름·최종 점수가
 * 없는 항목은 invalid로 센다. 진행 중 경기는 창과 관계없이 대회별로 센다(순위표 확정 여부).
 */
export function toFinishedResults(
  rawMatches: readonly unknown[],
  competitions: readonly CompetitionConfig[],
  window: UtcRange,
): ResultsSummary {
  const compByCode = new Map<string, CompId>(
    competitions.map((c) => [c.footballDataCode, c.id]),
  );
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  const skipped: ResultsSkipped = {
    invalid: 0,
    notFinished: 0,
    outOfWindow: 0,
    unknownComp: 0,
  };
  const inProgress: Partial<Record<CompId, number>> = {};
  const results: FinishedMatch[] = [];
  const others: MatchSlot[] = [];
  /** 점수를 쓸 수 있으면 최종 스코어, 아니면 null */
  const ftOf = (m: FdMatch): Score | null =>
    m.status === "FINISHED" ? (toMatchScore(m.score)?.ft ?? null) : null;
  for (const raw of rawMatches) {
    const parsed = FdMatchSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.invalid += 1;
      continue;
    }
    const m = parsed.data;
    const comp = compByCode.get(m.competition.code);
    const other = (): void => {
      if (comp) {
        others.push({ matchId: m.id, comp, kickoff: m.utcDate, ft: ftOf(m) });
      }
    };
    if (m.status !== "FINISHED") {
      skipped.notFinished += 1;
      if (comp && IN_PROGRESS_STATUSES.has(m.status)) {
        inProgress[comp] = (inProgress[comp] ?? 0) + 1;
      }
      other();
      continue;
    }
    const kickoffMs = Date.parse(m.utcDate);
    if (kickoffMs < start || kickoffMs >= end) {
      skipped.outOfWindow += 1;
      other();
      continue;
    }
    if (!comp) {
      skipped.unknownComp += 1;
      continue;
    }
    const home = teamRef(m.homeTeam);
    const away = teamRef(m.awayTeam);
    const score = toMatchScore(m.score);
    if (!home || !away || !score) {
      skipped.invalid += 1;
      other();
      continue;
    }
    results.push({
      provider: "football-data",
      matchId: m.id,
      comp,
      kickoff: m.utcDate,
      matchday: m.matchday ?? null,
      stage: m.stage ?? null,
      home,
      away,
      score,
    });
  }
  const byKickoffId = (
    a: Pick<MatchSlot, "kickoff" | "matchId">,
    b: Pick<MatchSlot, "kickoff" | "matchId">,
  ) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.matchId - b.matchId;
  results.sort(byKickoffId);
  others.sort(byKickoffId);
  return { results, skipped, inProgress, others };
}

/** 미종료 경기 목록 상한(로그 한 줄 크기 — 바쁜 날 창 경기는 25경기 안팎) */
export const WINDOW_UNFINISHED_MAX = 30;

/** 입력 창 안 대상 대회 경기의 상태 분포(수집 시점) — 로그 전용(M1-41 관찰, M0-28) */
export interface WindowStatusSummary {
  /** football-data 상태 원문별 건수(FINISHED·IN_PLAY·TIMED·POSTPONED …) */
  statuses: Record<string, number>;
  /** FINISHED·AWARDED가 아닌 경기 — 킥오프 순, 상한 WINDOW_UNFINISHED_MAX */
  unfinished: Array<{ comp: CompId; kickoff: string; status: string }>;
  /** 미종료 경기 전체 수(상한에 잘리기 전) */
  unfinishedTotal: number;
}

/**
 * 경기 원문 배열 → 창 [start, end) 안에 킥오프한 **대상 대회** 경기의 상태 분포. 형식이 틀린 항목·대상 밖 대회는 뺀다.
 * 브리핑 입력(종료 경기만)에는 쓰지 않고, 수집 시점에 끝나지 않은 경기(진행 중·점수 지연 의심)를 관찰 도구가 세게 로그에만 남긴다
 * (plan M1-41 "수집 시점의 경기 상태 분포(미종료·점수 지연)를 기록" — scripts/lib/observe.ts matchStatusFromLog).
 */
export function windowStatusSummary(
  rawMatches: readonly unknown[],
  competitions: readonly CompetitionConfig[],
  window: UtcRange,
): WindowStatusSummary {
  const compByCode = new Map<string, CompId>(
    competitions.map((c) => [c.footballDataCode, c.id]),
  );
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  // 상태 원문은 외부 값이라 Map으로 센다(`__proto__` 같은 키가 객체 프로토타입을 건드리지 않게) — 출력은 fromEntries(자기 속성)
  const statuses = new Map<string, number>();
  const unfinished: WindowStatusSummary["unfinished"] = [];
  for (const raw of rawMatches) {
    const parsed = FdMatchSchema.safeParse(raw);
    if (!parsed.success) continue;
    const m = parsed.data;
    const comp = compByCode.get(m.competition.code);
    const kickoffMs = Date.parse(m.utcDate);
    if (!comp || kickoffMs < start || kickoffMs >= end) continue;
    statuses.set(m.status, (statuses.get(m.status) ?? 0) + 1);
    if (m.status !== "FINISHED" && m.status !== "AWARDED") {
      unfinished.push({ comp, kickoff: m.utcDate, status: m.status });
    }
  }
  unfinished.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  return {
    statuses: Object.fromEntries(statuses),
    unfinished: unfinished.slice(0, WINDOW_UNFINISHED_MAX),
    unfinishedTotal: unfinished.length,
  };
}

/** `windowStatusSummary`를 던지지 않게 — 실패하면 undefined(로그 필드만 빠지고 그날 브리핑에는 영향 없음) */
function safeWindowStatus(
  rawMatches: readonly unknown[],
  competitions: readonly CompetitionConfig[],
  window: UtcRange,
): WindowStatusSummary | undefined {
  try {
    return windowStatusSummary(rawMatches, competitions, window);
  } catch {
    return undefined;
  }
}

/** 이 단계의 경기가 순위표를 바꾸는가 — 녹아웃(PLAYOFFS·LAST_16 …)은 아니다, stage가 없으면 바꾼다고 본다 */
export function affectsStandings(stage: string | null): boolean {
  return stage === null || TABLE_STAGES.has(stage);
}

/**
 * 순위를 받을 대회 — 창 안에 순위표에 영향을 주는 종료 경기가 있는 대회만(설정 순서). 호출 수를 줄인다:
 * 경기가 없는 대회의 순위는 어제와 같고, 녹아웃 경기는 순위표를 바꾸지 않는다.
 */
export function standingsTargets(
  results: readonly Pick<FinishedMatch, "comp" | "stage">[],
  competitions: readonly CompetitionConfig[],
): CompetitionConfig[] {
  const comps = new Set(
    results.filter((r) => affectsStandings(r.stage)).map((r) => r.comp),
  );
  return competitions.filter((c) => comps.has(c.id));
}

function seasonOf(
  data: z.infer<typeof FdStandingsResponseSchema>,
): number | null {
  const raw = data.filters?.season ?? data.season?.startDate?.slice(0, 4);
  const year = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

/**
 * 순위 응답 원문 → 내부 순위(TOTAL 표만, 행은 순위 순). 표 하나라도 형식이 틀리면 그 대회 순위 전체를 쓰지 않는다
 * (`FootballDataError` format) — 일부 행만 빠진 순위표는 틀린 사실이 된다.
 */
export function toCompStandings(
  raw: unknown,
  comp: Pick<CompetitionConfig, "id" | "footballDataCode">,
  ctx: { fetchedAt: string; inProgress: number },
): CompStandings {
  const parsed = FdStandingsResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new FootballDataError(
      "format",
      `football-data ${comp.footballDataCode} 순위 응답 형식이 다르다`,
    );
  }
  const data = parsed.data;
  if (data.competition.code !== comp.footballDataCode) {
    throw new FootballDataError(
      "format",
      `football-data 순위 응답 대회가 다르다(요청 ${comp.footballDataCode}, 응답 ${data.competition.code})`,
    );
  }
  const totals = data.standings.filter((s) => s.type === "TOTAL");
  if (totals.length === 0) {
    throw new FootballDataError(
      "format",
      `football-data ${comp.footballDataCode} 순위 응답에 TOTAL 표가 없다`,
    );
  }
  const tables: StandingsTable[] = totals.map((s) => {
    const rows: StandingsRow[] = [];
    let invalid = 0;
    for (const rawRow of s.table) {
      const row = FdStandingRowSchema.safeParse(rawRow);
      const team = row.success ? teamRef(row.data.team) : null;
      if (!row.success || !team) {
        invalid += 1;
        continue;
      }
      const r = row.data;
      rows.push({
        pos: r.position,
        team,
        played: r.playedGames,
        w: r.won,
        d: r.draw,
        l: r.lost,
        pts: r.points,
        gf: r.goalsFor,
        ga: r.goalsAgainst,
        gd: r.goalsFor - r.goalsAgainst,
      });
    }
    if (invalid > 0 || rows.length === 0) {
      throw new FootballDataError(
        "format",
        `football-data ${comp.footballDataCode} 순위표 행 형식 오류 ${invalid}건(행 ${s.table.length}개)`,
      );
    }
    // 공동 순위(같은 position)는 응답 순서를 그대로 둔다(안정 정렬) — UCL 리그 페이즈에 흔하다
    rows.sort((a, b) => a.pos - b.pos);
    return { stage: s.stage ?? null, group: s.group ?? null, rows };
  });
  return {
    comp: comp.id,
    season: seasonOf(data),
    currentMatchday: data.season?.currentMatchday ?? null,
    tables,
    fetchedAt: ctx.fetchedAt,
    inProgress: ctx.inProgress,
  };
}

// ─── 단계 (클라이언트 주입) ──────────────────────────────────────────────

export interface FootballDataBriefData {
  window: UtcRange;
  /** 경기 응답 항목 수(창·상태 거르기 전) */
  fetched: number;
  results: FinishedMatch[];
  skipped: ResultsSkipped;
  inProgress: Partial<Record<CompId, number>>;
  /** results 밖의 대상 대회 경기 — 경기 연결(D37) 후보 수 세기용(ResultsSummary.others) */
  others: MatchSlot[];
  /** 창 안 대상 대회 경기의 상태 분포 — 로그 전용(M1-41 관찰) */
  windowStatus?: WindowStatusSummary;
  /** 받은 순위(설정 순서) */
  standings: CompStandings[];
  /** 순위를 받지 못한 대회 — 그 대회 순위만 빠지고 브리핑은 진행한다 */
  standingsFailed: Array<{
    comp: CompId;
    errorType: FootballDataErrorKind | "unexpected";
    error: string;
  }>;
}

export interface FetchBriefFootballDataInput {
  client: Pick<FootballDataClient, "getMatches" | "getStandings">;
  competitions: readonly CompetitionConfig[];
  window: UtcRange;
  /** 순위 받은 시각 기록용 */
  now: () => Date;
}

/**
 * 브리핑 입력용 football-data 단계: 경기 1요청 → 순위(대상 대회만, 순서대로). 경기 요청이 실패하면 던진다(그날 브리핑 생략 —
 * 호출부가 잡는다). 순위 실패는 대회별로 모아 돌려준다(던지지 않는다).
 */
export async function fetchBriefFootballData(
  input: FetchBriefFootballDataInput,
): Promise<FootballDataBriefData> {
  const { client, competitions, window } = input;
  const raw = await client.getMatches({
    competitions: competitions.map((c) => c.footballDataCode),
    ...footballDataDateRange(window),
  });
  const summary = toFinishedResults(raw, competitions, window);
  const standings: CompStandings[] = [];
  const standingsFailed: FootballDataBriefData["standingsFailed"] = [];
  for (const comp of standingsTargets(summary.results, competitions)) {
    try {
      const json = await client.getStandings(comp.footballDataCode);
      standings.push(
        toCompStandings(json, comp, {
          fetchedAt: input.now().toISOString(),
          inProgress: summary.inProgress[comp.id] ?? 0,
        }),
      );
    } catch (error) {
      standingsFailed.push({
        comp: comp.id,
        errorType:
          error instanceof FootballDataError ? error.kind : "unexpected",
        error:
          error instanceof Error
            ? (error.message.split("\n")[0] ?? "")
            : String(error),
      });
    }
  }
  return {
    window,
    fetched: raw.length,
    results: summary.results,
    skipped: summary.skipped,
    inProgress: summary.inProgress,
    others: summary.others,
    windowStatus: safeWindowStatus(raw, competitions, window),
    standings,
    standingsFailed,
  };
}
