/**
 * 피드 소스 수집 실행기 (M1-03, PRD FR-01·FR-11, CLAUDE.md §6.4) — 재시도·시간 상한·호스트별 병렬·소스별 실패 격리.
 * 요청 1회의 세부(UA·리다이렉트·크기 상한·타임아웃)는 scripts/lib/rss.ts `fetchFeed`가 맡는다.
 *
 * ── 재시도 (`fetchFeedWithRetry`) ───────────────────────────────────────
 *   일시 장애만 **1회** 다시 시도한다: 5xx · 429 · 네트워크 오류 · 타임아웃. 4xx(429 제외)·리다이렉트 거부·크기 초과·
 *   파싱 실패는 다시 보내도 결과가 같으니 재시도하지 않는다. 대기는 2초, 응답에 `Retry-After`가 있으면 그 값(더 길 때)을
 *   쓰되 10초를 넘으면 기다리지 않고 포기한다(서버가 요청한 간격보다 일찍 다시 두드리지 않게). 재시도는 소스별 시간
 *   (30초) 안에서만 한다 — 남은 시간이 대기 + 최소 시도 시간(2초)보다 짧으면 포기.
 *
 * ── 시간 상한·병렬 (`runByHost`) ────────────────────────────────────────
 *   - 단계 전체 시간 예산 90초(`FEED_STAGE_BUDGET_MS`). 예산이 끝나면 아직 시작하지 않은 소스는 요청하지 않고 `budget`으로
 *     기록하고, 진행 중인 요청은 예산 시점에 끊어 `budget`으로 기록한다(요청 1회 타임아웃을 남은 예산으로 줄인다).
 *   - 서로 다른 호스트는 동시에(상한 4), 같은 호스트는 설정 순서대로 하나씩 + 앞 요청이 끝난 뒤 1초 간격.
 *   - 결과는 **설정 순서**로 돌려준다(완료 순서와 무관) — 같은 응답이면 카드 선택이 실행마다 같다.
 *   근거: 일일 수집 대상 14개 피드 = 호스트 9개(BBC 4 · interfootball 2 · besteleven 2 · 나머지 1씩). 소스 1개가 최악
 *   30초(타임아웃 15초 + 대기 2초 + 재시도 13초)를 다 쓰면, 호스트마다 1개씩만 막혀도 ceil(9/4) = 3바퀴 × 30초 = 90초다.
 *   정상 실행은 수 초면 끝난다. 브리핑 마감(공개 목표 −10분, 수집 트리거 +20분 — D26)까지 Actions 준비·경기 데이터 수집
 *   (football-data, M1-48의 API-Football 6.5초 간격 다수 호출)·LLM·검증·빌드가 남아 있어 뉴스 단계는 짧게 묶는다.
 *   같은 호스트에 소스가 4개(BBC)라 그 호스트가 내내 느리면 뒤쪽 소스가 `budget`으로 빠진다 — 의도한 동작이다.
 *
 * ── 실패 격리·기록 ──────────────────────────────────────────────────────
 *   소스 1개의 어떤 실패(받기·파싱·예상 밖 예외)도 그 소스 결과로만 남고 다른 소스를 막지 않는다. 결과에는 오류 종류
 *   (`errorType`)·HTTP 상태·재시도 횟수·소요 시간을 담고, 구조화 로그로 남긴다. runs.json에는 호출부(collect-run.ts
 *   `runSourceEntries`)가 `{id, ok, items}` + 성공은 `usable`(수집 창 안 건수)·실패는 `error`(= errorType)를 남긴다
 *   (PRD §15 D35). 응답 본문·오류 메시지는 어디에도 남기지 않는다. 소스 실패·건강도 이슈는 이 모듈이 아니라
 *   scripts/lib/source-health.ts(판정) → collect.yml 이슈 단계(보고)가 맡는다(M1-11).
 *   **파싱 실패 진단**(M1-03 보강): `parse` 실패는 본문 대신 응답 겉모습(HTTP 상태·미디어 타입·바이트 수·본문 형태·최종
 *   호스트 일치·리다이렉트 수)과 파서 오류 코드·줄·열을 `parseDiagnostics`로 결과에 담고 `collect.source.fail` 로그에
 *   펼쳐 남긴다(scripts/lib/feed-diagnostics.ts — 모두 enum·숫자). runs.json에는 그대로 `error: "parse"`만 남는다.
 *
 * ── 정규화·공통 형식 (M1-09) ─────────────────────────────────────────────
 *   파싱한 항목은 scripts/lib/normalize.ts가 공통 형식(`FeedItemSchema`, FR-03 — 본문 필드 불가 FR-02)으로 바꾸고 항목마다
 *   검증한다. 시간대 없는 피드 날짜는 소스 `tz`(D34)로만 해석한다. 건너뛴 항목은 이유별로 `skipped`에 세고, `title-too-long`·
 *   `no-date`(소스 tz 포함)·`schema`(이슈 경로·코드만)는 `collect.item.skip` warn 로그를 남긴다 — 원제목·링크는 로그에 넣지 않는다.
 *
 * ── 작성자 필터 (M1-04) ─────────────────────────────────────────────────
 *   소스에 `author`가 있으면 정규화 직후 작성자 일치 항목만 남긴다(scripts/lib/author-filter.ts). 뺀 건수는 `skipped.author`로
 *   집계하고 `collect.item.skip`(reason author) 로그를 남긴다 — 쓸 수 있는 항목이 전부 빠지면 warn(피드 작성자 표기가 바뀌었을
 *   수 있다). 지금 수집 대상 중 `author`가 있는 소스는 없다.
 *
 * 시각·대기(`FeedClock`)와 fetch는 주입한다. 요청 타임아웃은 전역 setTimeout을 쓴다(테스트는 가짜 타이머).
 */
import type { FeedItem, Source } from "@/lib/schema";

import {
  AUTHOR_SKIP_REASON,
  filterByAuthor,
  type AuthorSkipReason,
} from "./author-filter";
import type {
  FeedParseDiagnostics,
  FeedResponseInfo,
} from "./feed-diagnostics";
import type { Logger } from "./logger";
import { readsSummary } from "./source-policy";
import {
  normalizeFeedItems,
  type NormalizeSource,
  type SkipReason,
} from "./normalize";
import {
  FEED_MAX_BYTES,
  FEED_MAX_REDIRECTS,
  FEED_TIMEOUT_MS,
  FeedFetchError,
  FeedParseError,
  fetchFeed,
  parseFeedXml,
  type FeedFetchErrorKind,
  type FetchLike,
  type RawFeedItem,
} from "./rss";

// ─── 정책 ────────────────────────────────────────────────────────────────

/** 소스 1개(재시도·대기 포함)에 쓰는 최대 시간 */
export const FEED_SOURCE_BUDGET_MS = 30_000;

/** 피드 수집 단계 전체 시간 예산 — 근거는 파일 머리 주석 */
export const FEED_STAGE_BUDGET_MS = 90_000;

/** 동시에 요청하는 호스트 수 상한(호스트당 동시 요청은 항상 1개) */
export const FEED_HOST_CONCURRENCY = 4;

/** 같은 호스트의 다음 소스 요청 전 간격(앞 요청이 끝난 뒤부터) */
export const FEED_SAME_HOST_GAP_MS = 1_000;

/** 재시도 횟수 — 1회 고정(바꾸려면 근거와 함께 오케스트레이터 확인) */
export const FEED_MAX_RETRIES = 1;

/** 재시도 전 기본 대기 */
export const FEED_RETRY_DELAY_MS = 2_000;

/** `Retry-After`를 존중하는 상한 — 이보다 길게 기다리라는 응답이면 재시도하지 않는다 */
export const FEED_RETRY_AFTER_MAX_MS = 10_000;

/** 요청을 새로 시작할 최소 남은 시간 — 이보다 짧으면 시작하지 않는다(어차피 끝까지 못 받는다) */
export const FEED_MIN_ATTEMPT_MS = 2_000;

export interface FeedPolicy {
  /** 요청 1회(리다이렉트·본문 읽기 포함) 타임아웃 */
  timeoutMs: number;
  /** 소스 1개 시간 상한(재시도·대기 포함) */
  sourceBudgetMs: number;
  /** 단계 전체 시간 예산 */
  stageBudgetMs: number;
  /** 동시 호스트 상한 */
  concurrency: number;
  /** 같은 호스트 요청 간격 */
  sameHostGapMs: number;
  /** 재시도 기본 대기 */
  retryDelayMs: number;
  /** Retry-After 존중 상한 */
  retryAfterMaxMs: number;
  /** 요청을 시작할 최소 남은 시간 */
  minAttemptMs: number;
  /** 본문 상한(바이트) */
  maxBytes: number;
  /** 따라가는 리다이렉트 최대 횟수 */
  maxRedirects: number;
}

export const DEFAULT_FEED_POLICY: Readonly<FeedPolicy> = Object.freeze({
  timeoutMs: FEED_TIMEOUT_MS,
  sourceBudgetMs: FEED_SOURCE_BUDGET_MS,
  stageBudgetMs: FEED_STAGE_BUDGET_MS,
  concurrency: FEED_HOST_CONCURRENCY,
  sameHostGapMs: FEED_SAME_HOST_GAP_MS,
  retryDelayMs: FEED_RETRY_DELAY_MS,
  retryAfterMaxMs: FEED_RETRY_AFTER_MAX_MS,
  minAttemptMs: FEED_MIN_ATTEMPT_MS,
  maxBytes: FEED_MAX_BYTES,
  maxRedirects: FEED_MAX_REDIRECTS,
});

/** 기본 정책에 덮어쓰기를 합친다. 값은 0 이상의 유한수(동시 상한은 1 이상 정수)여야 한다. */
export function resolveFeedPolicy(over: Partial<FeedPolicy> = {}): FeedPolicy {
  const policy: FeedPolicy = { ...DEFAULT_FEED_POLICY, ...over };
  for (const [key, value] of Object.entries(policy)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `피드 수집 정책 ${key}는 0 이상의 수여야 한다 (받은 값: ${String(value)})`,
      );
    }
  }
  if (!Number.isInteger(policy.concurrency) || policy.concurrency < 1) {
    throw new Error(
      `피드 수집 정책 concurrency는 1 이상의 정수여야 한다 (받은 값: ${policy.concurrency})`,
    );
  }
  return policy;
}

// ─── 시계 ────────────────────────────────────────────────────────────────

/** 시각(ms)·대기 — 테스트가 주입한다 */
export interface FeedClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

/** 실제 시계. 호출할 때마다 전역 Date·setTimeout을 읽는다(가짜 타이머가 바꿔 끼운 것도 따른다). */
export const SYSTEM_FEED_CLOCK: FeedClock = Object.freeze({
  now: () => Date.now(),
  sleep: (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    }),
});

// ─── 재시도 ──────────────────────────────────────────────────────────────

/** 재시도 대상 — 5xx · 429 · 네트워크 · 타임아웃. 4xx(429 제외)·리다이렉트·크기 초과·예산 소진은 아니다. */
export function isRetryableFeedError(
  error: Pick<FeedFetchError, "kind" | "status">,
): boolean {
  switch (error.kind) {
    case "timeout":
    case "http-5xx":
    case "network":
      return true;
    case "http-4xx":
      return error.status === 429;
    case "redirect":
    case "too-large":
    case "budget":
      return false;
    default:
      return assertNever(error.kind);
  }
}

/** 재시도 대상이었지만 다시 보내지 않은 이유 */
export type RetrySkipReason =
  /** Retry-After가 존중 상한(10초)보다 길다 */
  | "retry-after-too-long"
  /** 소스 시간(또는 단계 예산) 안에 대기 + 최소 시도 시간이 들어가지 않는다 */
  | "no-time";

export type FeedFetchResult =
  | {
      ok: true;
      xml: string;
      /** 응답 겉모습(본문 내용 없음) — 파싱 실패 진단에 쓴다 */
      info: FeedResponseInfo;
      retries: number;
    }
  | {
      ok: false;
      error: FeedFetchError;
      retries: number;
      /** 재시도 대상 오류인데 다시 보내지 않았으면 그 이유 */
      retrySkipped: RetrySkipReason | null;
    };

export interface RetryEvent {
  /** 몇 번째 재시도인가(1부터) */
  retry: number;
  error: FeedFetchError;
  delayMs: number;
}

export interface FetchWithRetryOptions {
  fetch: FetchLike;
  userAgent: string;
  policy: FeedPolicy;
  clock: FeedClock;
  /** 단계 예산이 끝나는 시각(clock 기준 ms) */
  stageDeadline: number;
  /** 재시도 직전에 부른다(로그용) */
  onRetry?: (event: RetryEvent) => void;
}

/**
 * 피드 1개를 받는다 — 재시도 대상 오류면 1회 다시 시도. 받기 실패는 결과로 돌려주고 던지지 않는다
 * (FeedFetchError가 아닌 예외 — 프로그래밍 오류 — 만 던진다).
 * 요청 1회 타임아웃 = min(정책 타임아웃, 소스 남은 시간, 단계 남은 시간). 단계 예산 때문에 끊긴 시도는 `budget`.
 */
export async function fetchFeedWithRetry(
  url: string,
  options: FetchWithRetryOptions,
): Promise<FeedFetchResult> {
  const { policy, clock, stageDeadline } = options;
  const sourceDeadline = Math.min(
    clock.now() + policy.sourceBudgetMs,
    stageDeadline,
  );
  let retries = 0;
  for (;;) {
    const attemptStart = clock.now();
    const remaining = sourceDeadline - attemptStart;
    if (remaining <= 0) {
      return {
        ok: false,
        error: budgetError("요청 전에 시간 예산 소진"),
        retries,
        retrySkipped: null,
      };
    }
    const timeoutMs = Math.min(policy.timeoutMs, remaining);
    // 이 시도를 묶는 것이 단계 예산이면(소스 시간·정책 타임아웃보다 먼저 끝나면) 시간 초과는 예산 소진이다.
    const stageBound = stageDeadline - attemptStart <= timeoutMs;
    let failure: FeedFetchError;
    try {
      const { text, info } = await fetchFeed(url, {
        fetch: options.fetch,
        userAgent: options.userAgent,
        timeoutMs,
        maxBytes: policy.maxBytes,
        maxRedirects: policy.maxRedirects,
        now: () => clock.now(),
      });
      return { ok: true, xml: text, info, retries };
    } catch (error) {
      if (!(error instanceof FeedFetchError)) throw error;
      failure =
        error.kind === "timeout" && stageBound
          ? budgetError(`수집 시간 예산 소진으로 요청 중단 (${timeoutMs}ms)`)
          : error;
    }

    if (retries >= FEED_MAX_RETRIES || !isRetryableFeedError(failure)) {
      return { ok: false, error: failure, retries, retrySkipped: null };
    }
    const retryAfter = failure.retryAfterMs;
    if (retryAfter !== undefined && retryAfter > policy.retryAfterMaxMs) {
      return {
        ok: false,
        error: failure,
        retries,
        retrySkipped: "retry-after-too-long",
      };
    }
    const delayMs = Math.max(policy.retryDelayMs, retryAfter ?? 0);
    if (clock.now() + delayMs + policy.minAttemptMs > sourceDeadline) {
      return { ok: false, error: failure, retries, retrySkipped: "no-time" };
    }
    retries += 1;
    options.onRetry?.({ retry: retries, error: failure, delayMs });
    await clock.sleep(delayMs);
  }
}

function budgetError(message: string): FeedFetchError {
  return new FeedFetchError("budget", message);
}

// ─── 호스트별 병렬 ───────────────────────────────────────────────────────

/** 요청 호스트(소문자, 포트 포함). URL이 아니면 문자열 그대로(그 항목만의 묶음이 된다). */
export function hostKey(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return url;
  }
}

export interface HostLaneOptions {
  concurrency: number;
  sameHostGapMs: number;
  /** 이 시각(clock 기준 ms)이 지나면 새 항목을 시작하지 않는다 */
  deadline: number;
  /** 남은 시간이 이보다 짧으면 시작하지 않는다 */
  minStartMs: number;
  clock: FeedClock;
}

export interface HostLaneHandlers<T, R> {
  /** 항목 처리 */
  run: (item: T, index: number) => Promise<R>;
  /** 시간 예산이 끝나 시작하지 않은 항목 */
  skip: (item: T, index: number) => R;
  /** run이 던진 예외 — 이 항목만의 결과로 바꾼다(다른 항목은 계속) */
  fail: (item: T, index: number, error: unknown) => R;
}

/**
 * 항목을 호스트별로 묶어 처리한다 — 다른 호스트는 동시에(상한 `concurrency`), 같은 호스트는 입력 순서대로 하나씩 +
 * 앞 항목이 끝난 뒤 `sameHostGapMs` 간격. 호스트 묶음은 처음 나온 순서대로 빈 자리에 들어간다.
 * 결과는 **입력 순서**의 배열이다(완료 순서와 무관).
 */
export async function runByHost<T, R>(
  items: readonly T[],
  keyOf: (item: T) => string,
  options: HostLaneOptions,
  handlers: HostLaneHandlers<T, R>,
): Promise<R[]> {
  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(index);
    else groups.set(key, [index]);
  });
  const queue = [...groups.values()];
  const results = new Array<R>(items.length);
  const { clock, deadline } = options;
  const canStart = (extraMs = 0) =>
    deadline - (clock.now() + extraMs) >= options.minStartMs;

  let next = 0;
  async function lane(): Promise<void> {
    for (let group = queue[next++]; group; group = queue[next++]) {
      for (const [position, index] of group.entries()) {
        const item = items[index] as T;
        if (position > 0 && options.sameHostGapMs > 0) {
          // 간격을 기다린 뒤에도 시작할 수 없으면 기다리지 않고 건너뛴다.
          if (!canStart(options.sameHostGapMs)) {
            results[index] = handlers.skip(item, index);
            continue;
          }
          await clock.sleep(options.sameHostGapMs);
        }
        if (!canStart()) {
          results[index] = handlers.skip(item, index);
          continue;
        }
        try {
          results[index] = await handlers.run(item, index);
        } catch (error) {
          results[index] = handlers.fail(item, index, error);
        }
      }
    }
  }
  const lanes = Math.max(1, Math.min(options.concurrency, queue.length));
  await Promise.all(Array.from({ length: lanes }, () => lane()));
  return results;
}

// ─── 소스 수집 ───────────────────────────────────────────────────────────

/** 항목을 건너뛴 이유 — 정규화(normalize.ts SkipReason) · 작성자 필터(`author`, M1-04) */
export type ItemSkipReason = SkipReason | AuthorSkipReason;

/** 소스 실패 종류 — 받기(rss.ts FeedFetchErrorKind, 예산 소진 `budget` 포함) · 파싱(깨진 XML) · 그 밖의 예외 */
export type SourceErrorType = FeedFetchErrorKind | "parse" | "unexpected";

/** 피드 소스 1개의 수집 결과 (RunLog.sources에는 id·ok·items + usable(창 적용 뒤)·error(= errorType)만 기록한다) */
export interface SourceOutcome {
  id: string;
  ok: boolean;
  /** 피드 원문 항목 수(받기·파싱 실패면 0) */
  items: number;
  /** 정규화·작성자 필터를 통과한 항목 수 */
  usable: number;
  /** 정규화·작성자 필터에서 건너뛴 이유별 건수 */
  skipped: Partial<Record<ItemSkipReason, number>>;
  /** 재시도 횟수(0 또는 1) */
  retries: number;
  /** 소스 처리에 걸린 시간(시작하지 않았으면 0) */
  elapsedMs: number;
  errorType?: SourceErrorType;
  /** HTTP 상태(받기 실패이고 응답이 있었을 때) */
  status?: number | null;
  /** 재시도 대상 오류인데 다시 보내지 않은 이유 */
  retrySkipped?: RetrySkipReason;
  error?: string;
  /** 파싱 실패(`parse`)일 때만 — 응답 겉모습 + 파서 오류 코드·줄·열(본문 내용 없음, M1-03 보강) */
  parseDiagnostics?: FeedParseDiagnostics;
}

export interface FeedCollectDeps {
  fetch: FetchLike;
  userAgent: string;
  logger: Logger;
  /** 정책 덮어쓰기(기본 DEFAULT_FEED_POLICY) */
  policy?: Partial<FeedPolicy>;
  /** 시각·대기(기본 SYSTEM_FEED_CLOCK) */
  clock?: FeedClock;
}

export interface FeedCollectResult {
  /** 소스별 결과(입력 = 설정 순서) */
  outcomes: SourceOutcome[];
  /** 정규화·작성자 필터를 통과한 항목(설정 순서 → 피드 순서) */
  items: FeedItem[];
  elapsedMs: number;
}

interface SourceRun {
  outcome: SourceOutcome;
  items: FeedItem[];
}

/**
 * 피드 소스들을 받아 파싱·정규화한다. 어떤 소스의 실패도 밖으로 던지지 않는다 — 실패는 그 소스 결과로 남는다.
 * 정책 값이 잘못됐을 때만 던진다(설정 오류).
 */
export async function collectFeedSources(
  sources: readonly Source[],
  deps: FeedCollectDeps,
): Promise<FeedCollectResult> {
  const policy = resolveFeedPolicy(deps.policy);
  const clock = deps.clock ?? SYSTEM_FEED_CLOCK;
  const log = deps.logger;
  const startedAt = clock.now();
  const stageDeadline = startedAt + policy.stageBudgetMs;

  const runs = await runByHost<Source, SourceRun>(
    sources,
    (source) => hostKey(source.url),
    {
      concurrency: policy.concurrency,
      sameHostGapMs: policy.sameHostGapMs,
      deadline: stageDeadline,
      minStartMs: policy.minAttemptMs,
      clock,
    },
    {
      run: (source) =>
        collectOne(source, { ...deps, policy, clock, stageDeadline }),
      skip: (source) => {
        const error = `수집 시간 예산(${policy.stageBudgetMs}ms) 소진 — 요청하지 않음`;
        log.error("collect.source.fail", {
          source: source.id,
          errorType: "budget",
          started: false,
          error,
          elapsedMs: 0,
        });
        return {
          outcome: failedOutcome(source.id, "budget", { error }),
          items: [],
        };
      },
      fail: (source, _index, error) => {
        log.error("collect.source.fail", {
          source: source.id,
          errorType: "unexpected",
          error: errorText(error),
        });
        return {
          outcome: failedOutcome(source.id, "unexpected", {
            error: errorText(error),
          }),
          items: [],
        };
      },
    },
  );

  const outcomes = runs.map((r) => r.outcome);
  const items = runs.flatMap((r) => r.items);
  const elapsedMs = clock.now() - startedAt;
  const failed = outcomes.filter((o) => !o.ok);
  const budget = outcomes.filter((o) => o.errorType === "budget");
  const fields = {
    sources: outcomes.length,
    ok: outcomes.length - failed.length,
    failed: failed.length,
    retried: outcomes.filter((o) => o.retries > 0).length,
    budget: budget.length,
    hosts: new Set(sources.map((s) => hostKey(s.url))).size,
    concurrency: policy.concurrency,
    budgetMs: policy.stageBudgetMs,
    elapsedMs,
  };
  if (budget.length > 0) {
    log.warn("collect.feeds.budget", {
      budgetMs: policy.stageBudgetMs,
      sources: budget.map((o) => o.id),
      elapsedMs,
    });
  }
  log.info("collect.feeds.done", fields);
  return { outcomes, items, elapsedMs };
}

/**
 * 파싱한 항목 → 정규화(공통 형식 zod 검증, 소스 `tz`로 시간대 없는 날짜 해석 — M1-09) → 작성자 필터(소스에 `author`가
 * 있을 때). 순수 함수. 건너뛴 이유별 건수는 정규화 사유 + `author`(필터로 뺀 수, 0이면 키 없음)다.
 * `schemaIssues`는 `schema` 사유로 뺀 항목의 이슈 경로·코드(로그용, 값 없음).
 */
export function prepareSourceItems(
  raws: readonly RawFeedItem[],
  source: NormalizeSource & Pick<Source, "author">,
): {
  items: FeedItem[];
  skipped: Partial<Record<ItemSkipReason, number>>;
  schemaIssues: string[];
} {
  const normalized = normalizeFeedItems(raws, source);
  const filtered = filterByAuthor(normalized.items, source.author);
  const skipped: Partial<Record<ItemSkipReason, number>> = {
    ...normalized.skipped,
  };
  if (filtered.excluded > 0) skipped[AUTHOR_SKIP_REASON] = filtered.excluded;
  return {
    items: filtered.kept,
    skipped,
    schemaIssues: normalized.schemaIssues,
  };
}

/** 소스 1개 — 받기(재시도) → 파싱 → 정규화 → 작성자 필터. 받기·파싱 실패는 결과로, 그 밖의 예외는 던진다(runByHost가 격리). */
async function collectOne(
  source: Source,
  ctx: FeedCollectDeps & {
    policy: FeedPolicy;
    clock: FeedClock;
    stageDeadline: number;
  },
): Promise<SourceRun> {
  const log = ctx.logger;
  const { clock } = ctx;
  const started = clock.now();
  const fetched = await fetchFeedWithRetry(source.url, {
    fetch: ctx.fetch,
    userAgent: ctx.userAgent,
    policy: ctx.policy,
    clock,
    stageDeadline: ctx.stageDeadline,
    onRetry: ({ retry, error, delayMs }) => {
      log.warn("collect.source.retry", {
        source: source.id,
        errorType: error.kind,
        status: error.status,
        retry,
        delayMs,
        ...(error.retryAfterMs !== undefined
          ? { retryAfterMs: error.retryAfterMs }
          : {}),
      });
    },
  });

  if (!fetched.ok) {
    const { error, retries, retrySkipped } = fetched;
    const elapsedMs = clock.now() - started;
    log.error("collect.source.fail", {
      source: source.id,
      errorType: error.kind,
      status: error.status,
      retries,
      ...(retrySkipped ? { retrySkipped } : {}),
      error: errorText(error),
      elapsedMs,
    });
    return {
      outcome: failedOutcome(source.id, error.kind, {
        status: error.status,
        retries,
        elapsedMs,
        error: errorText(error),
        ...(retrySkipped ? { retrySkipped } : {}),
      }),
      items: [],
    };
  }

  let raws: Awaited<ReturnType<typeof parseFeedXml>>;
  try {
    // 위험 수용 소스(D48)는 요약문(description)을 꺼내지 않는다 — source-policy.ts
    raws = await parseFeedXml(fetched.xml, {
      summaries: readsSummary(source.id),
    });
  } catch (error) {
    if (!(error instanceof FeedParseError)) throw error;
    const elapsedMs = clock.now() - started;
    const parseDiagnostics: FeedParseDiagnostics = {
      ...fetched.info,
      ...error.info,
    };
    log.error("collect.source.fail", {
      source: source.id,
      errorType: "parse",
      retries: fetched.retries,
      error: errorText(error),
      elapsedMs,
      ...parseDiagnosticFields(parseDiagnostics),
    });
    return {
      outcome: failedOutcome(source.id, "parse", {
        retries: fetched.retries,
        elapsedMs,
        error: errorText(error),
        parseDiagnostics,
      }),
      items: [],
    };
  }

  const { items, skipped, schemaIssues } = prepareSourceItems(raws, source);
  const elapsedMs = clock.now() - started;
  log.info("collect.source.fetch", {
    source: source.id,
    items: raws.length,
    usable: items.length,
    skipped,
    retries: fetched.retries,
    elapsedMs,
  });
  if (skipped["title-too-long"]) {
    log.warn("collect.item.skip", {
      source: source.id,
      reason: "title-too-long",
      count: skipped["title-too-long"],
    });
  }
  if (skipped["no-date"]) {
    // 날짜 없음·시간대 없는 날짜(소스에 tz 없음)·모르는 약어 — 한 소스가 통째로 빠지면 tz 설정을 확인한다(D34)
    log.warn("collect.item.skip", {
      source: source.id,
      reason: "no-date",
      count: skipped["no-date"],
      kept: items.length,
      tz: source.tz ?? null,
    });
  }
  if (skipped.schema) {
    // 공통 형식(FR-03) 검증 실패 — 앞 규칙을 통과했는데 걸린 방어선. 경로·코드만 남긴다(값·원문 없음)
    log.warn("collect.item.skip", {
      source: source.id,
      reason: "schema",
      count: skipped.schema,
      issues: schemaIssues,
    });
  }
  const authorSkipped = skipped[AUTHOR_SKIP_REASON];
  if (authorSkipped) {
    // 쓸 수 있는 항목이 전부 빠졌으면 피드의 작성자 표기가 바뀌었을 수 있다 → warn
    const fields = {
      source: source.id,
      reason: AUTHOR_SKIP_REASON,
      count: authorSkipped,
      kept: items.length,
      author: source.author,
    };
    if (items.length === 0) log.warn("collect.item.skip", fields);
    else log.info("collect.item.skip", fields);
  }
  return {
    outcome: {
      id: source.id,
      ok: true,
      items: raws.length,
      usable: items.length,
      skipped,
      retries: fetched.retries,
      elapsedMs,
    },
    items,
  };
}

/**
 * 파싱 실패 진단 → `collect.source.fail` 로그 필드. 이름은 로그 필드 규칙을 따른다 — HTTP 상태는 `status`,
 * 본문 형태는 `bodyShape`, 파서 오류 코드는 `parseError`(`error`는 짧은 메시지, `errorType`은 `parse`).
 */
export function parseDiagnosticFields(diagnostics: FeedParseDiagnostics) {
  return {
    status: diagnostics.status,
    mediaType: diagnostics.mediaType,
    bytes: diagnostics.bytes,
    bodyShape: diagnostics.shape,
    sameHost: diagnostics.sameHost,
    redirects: diagnostics.redirects,
    parseError: diagnostics.parser,
    line: diagnostics.line,
    column: diagnostics.column,
  };
}

function failedOutcome(
  id: string,
  errorType: SourceErrorType,
  extra: Partial<
    Pick<
      SourceOutcome,
      | "status"
      | "retries"
      | "elapsedMs"
      | "retrySkipped"
      | "error"
      | "parseDiagnostics"
    >
  >,
): SourceOutcome {
  return {
    id,
    ok: false,
    items: 0,
    usable: 0,
    skipped: {},
    retries: extra.retries ?? 0,
    elapsedMs: extra.elapsedMs ?? 0,
    errorType,
    status: extra.status ?? null,
    ...(extra.retrySkipped ? { retrySkipped: extra.retrySkipped } : {}),
    ...(extra.error !== undefined ? { error: extra.error } : {}),
    ...(extra.parseDiagnostics
      ? { parseDiagnostics: extra.parseDiagnostics }
      : {}),
  };
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "")
    : String(error);
}

function assertNever(value: never): never {
  throw new Error(`알 수 없는 피드 오류 종류: ${String(value)}`);
}
