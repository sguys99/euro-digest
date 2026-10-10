/**
 * LLM 전송 계층 (M0-20) — Anthropic SDK를 import하는 유일한 파일 (CLAUDE.md §6.2, ESLint가 강제).
 *
 * 이 파일은 "보내고 받는" 일만 한다. 호출 지점(뉴스 요약·분류 / 팀 한줄평+강점·약점 / 한국 선수 주간 총평,
 * CLAUDE.md §1-3)을 늘리지 않는다. 무엇을 몇 건 보낼지, 입력 500자 절단, 출력 zod 검증과 1회 재시도·강등,
 * 06:50 폴백 결정, 비용 가드는 호출부(M1-18~M1-22)와 cost.ts(M0-21)가 맡는다.
 *
 * 구성
 *   - 요청 검증: customId(Batches API 제약 `^[a-zA-Z0-9_-]{1,64}$`, 배치 안에서 유일), maxTokens 필수·상한
 *   - 배치: submitBatch → pollBatch(마감 시각까지) → collectBatchResults, 한 번에 돌리는 runBatch
 *   - 단건: callSingle — 06:50 폴백(상위 10건, M1-19)용 일반 Messages API 1건
 *   - 재시도: 429·5xx(529 overloaded 포함)만 지수 백오프. 서버가 요청을 처리하지 않은 경우라 다시 보내도
 *     중복 과금이 없다. 연결 오류·타임아웃은 쓰기 요청(메시지 생성·배치 제출)에서 재시도하지 않는다
 *     (서버가 이미 처리했을 수 있어 중복 과금 위험). 읽기(배치 조회·결과)는 연결 오류도 재시도한다.
 *     SDK 자체 재시도는 끈다(maxRetries: 0) — 재시도가 두 겹으로 쌓이지 않게.
 *   - usage: 응답 usage → RunLog.tokens 형태 `{ in, out, cacheRead, cacheWrite }`(plan.md 부록 A).
 *     배치/단건을 따로 합산해 cost.ts가 배치 50% 할인 단가를 나눠 적용할 수 있게 한다.
 *   - 모드: live(SDK) / mock(`fixtures/llm/mock/`, 결정적·무비용). 둘 다 같은 LlmTransport 뒤에 있어
 *     폴링·결과 변환 코드는 한 벌이다. 테스트는 가짜 LlmTransport를 주입한다.
 *
 * 확인한 API 사실 (claude-api 스킬 + platform.claude.com 문서, 2026-10-10 확인)
 *   - 배치: 최대 100,000건 또는 256MB. 대부분 1시간 안에 끝나고, 24시간 안에 못 끝난 요청은 expired.
 *     결과는 생성 후 29일 보관. 결과 순서는 입력 순서와 다를 수 있다(custom_id로 매칭).
 *     처리가 끝나기(ended) 전에는 결과를 받을 수 없다. errored·canceled·expired 요청은 과금되지 않는다.
 *     배치 요청에는 stream·speed·max_tokens 0을 쓸 수 없다. 토큰 단가는 일반 API의 50%.
 *   - claude-haiku-5-5: temperature는 기본값(1)만 허용하고 다른 값은 400 → 요청 타입에 넣지 않았다.
 *     적응형 thinking이 기본으로 켜져 있다. thinking 토큰은 output으로 과금되고 max_tokens 안에서 쓰인다
 *     (짧은 max_tokens는 thinking에 다 쓰여 stop_reason "max_tokens"로 끝날 수 있다). 조절은 effort(기본 medium).
 *   - 프롬프트 캐싱 최소 프리픽스: claude-haiku-5-5 512토큰. 미달이면 cache_control이 있어도 오류 없이
 *     캐싱되지 않는다(cache_creation_input_tokens 0).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from "@anthropic-ai/sdk";
import { z } from "zod";

import type { RunLog } from "@/lib/schema";

import { resolveLlmMode, type LlmMode } from "./cli-args";
import { createLogger, type Logger } from "./logger";

export type { LlmMode } from "./cli-args";

// ─── 상수 ────────────────────────────────────────────────────────────────

/** `LLM_MODEL` 미지정 시 기본 모델 (CLAUDE.md §3·§10, PRD FR-28). 바꾸려면 사용자 승인이 필요하다(§1-3). */
export const DEFAULT_LLM_MODEL = "claude-haiku-5-5";

/** Batches API `custom_id` 제약 — 영문·숫자·`_`·`-`, 1~64자 (공식 문서). 카드 ID `c_` + 16진수 10자리도 통과한다. */
export const CUSTOM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * 요청 1건의 max_tokens 절대 상한(전송 계층 안전망). 호출 지점별 실제 값은 M1-18에서 정하며, 올리려면
 * 사용자 승인이 필요하다(CLAUDE.md §1-3). 10~20건 묶음(FR-25) × 건당 출력 ~150토큰 + thinking 여유를 고려했다.
 */
export const MAX_TOKENS_CEILING = 8192;

/** 배치 1회 요청 수 상한(안전망 — API 한도는 100,000). 묶음 구성(FR-25) 기준 하루 수 건~수십 건이다. */
export const MAX_REQUESTS_PER_BATCH = 100;

/** 배치 상태 조회 간격 기본값·최솟값. 조회 자체는 무료지만 Batches API에도 요청 한도가 있다. */
export const DEFAULT_POLL_INTERVAL_MS = 30_000;
export const MIN_POLL_INTERVAL_MS = 5_000;

/** live 모드 HTTP 요청 1회 타임아웃 (SDK 기본 10분은 06:50~07:00 폴백 창에 비해 너무 길다). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export interface RetryPolicy {
  /** 첫 시도 뒤 추가 시도 횟수 (SDK 기본과 같은 2) */
  maxRetries: number;
  /** 첫 재시도 대기. 이후 2배씩 */
  baseDelayMs: number;
  /** 대기 상한 (retry-after 헤더 값도 이 값을 넘지 않는다) */
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: Readonly<RetryPolicy> = Object.freeze({
  maxRetries: 2,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
});

/** mock 응답 폴더 — 구조는 fixtures/llm/README.md */
export const DEFAULT_MOCK_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/llm/mock",
);

const MESSAGE_MAX_LENGTH = 300;

// ─── 오류 ────────────────────────────────────────────────────────────────

/** 잘못된 요청(호출부 버그). 프롬프트 본문은 메시지에 넣지 않는다. */
export class LlmRequestError extends Error {
  override readonly name = "LlmRequestError";
  readonly problems: readonly string[];
  constructor(message: string, problems: readonly string[] = []) {
    super(
      problems.length ? `${message}\n  - ${problems.join("\n  - ")}` : message,
    );
    this.problems = problems;
  }
}

/** 설정 오류(모드·키·모델). 키 값은 절대 메시지에 넣지 않는다. */
export class LlmConfigError extends Error {
  override readonly name = "LlmConfigError";
}

/** mock 모드에서 fixture가 없거나 형식이 틀림 — 테스트가 빠진 fixture를 바로 알 수 있게 던진다. */
export class LlmMockFixtureError extends Error {
  override readonly name = "LlmMockFixtureError";
}

/** API가 오류 응답으로 돌려준 type (공식 문서 오류 표 + SDK ErrorType) */
export const API_ERROR_TYPES = [
  "invalid_request_error",
  "authentication_error",
  "billing_error",
  "permission_error",
  "not_found_error",
  "request_too_large",
  "rate_limit_error",
  "timeout_error",
  "api_error",
  "overloaded_error",
] as const;
export type ApiErrorType = (typeof API_ERROR_TYPES)[number];

/**
 * 실패 결과의 종류.
 *   - API 오류 type 그대로(위 목록)
 *   - connection_error: 응답을 받지 못함(연결 오류·타임아웃)
 *   - canceled·expired: 배치 결과 상태(과금 없음)
 *   - refusal·max_tokens·empty_output: 응답은 왔지만 쓸 수 없는 출력(토큰은 과금됨)
 *   - missing_result: 배치 결과에서 해당 customId를 받지 못함
 */
export type LlmErrorType =
  | ApiErrorType
  | "connection_error"
  | "canceled"
  | "expired"
  | "refusal"
  | "max_tokens"
  | "empty_output"
  | "missing_result";

/** 이 종류의 실패는 같은 요청을 다시 보내 볼 만하다(호출부 재시도 판단용 힌트, FR-29 판단은 호출부). */
const RETRYABLE_ERROR_TYPES: ReadonlySet<LlmErrorType> = new Set<LlmErrorType>([
  "rate_limit_error",
  "timeout_error",
  "api_error",
  "overloaded_error",
  "connection_error",
  "canceled",
  "expired",
  "missing_result",
]);

export function isRetryableErrorType(errorType: LlmErrorType): boolean {
  return RETRYABLE_ERROR_TYPES.has(errorType);
}

function isApiErrorType(value: string): value is ApiErrorType {
  return (API_ERROR_TYPES as readonly string[]).includes(value);
}

function errorTypeFromStatus(status: number | undefined): LlmErrorType {
  if (status === undefined) return "connection_error";
  switch (status) {
    case 400:
      return "invalid_request_error";
    case 401:
      return "authentication_error";
    case 402:
      return "billing_error";
    case 403:
      return "permission_error";
    case 404:
      return "not_found_error";
    case 413:
      return "request_too_large";
    case 429:
      return "rate_limit_error";
    case 504:
      return "timeout_error";
    case 529:
      return "overloaded_error";
    default:
      return "api_error";
  }
}

/**
 * 오류 type 문자열을 LlmErrorType으로 맞춘다. 모르는 값은 HTTP 상태로 추정하고, 상태도 없으면
 * 서버가 준 type이 있을 때 api_error(응답은 받았음), 둘 다 없을 때만 connection_error다.
 */
export function normalizeErrorType(
  raw: string | null | undefined,
  status?: number,
): LlmErrorType {
  if (raw && isApiErrorType(raw)) return raw;
  if (raw === "connection_error") return raw;
  if (status !== undefined) return errorTypeFromStatus(status);
  return raw ? "api_error" : "connection_error";
}

/** mock fixture의 errored type → HTTP 상태 (단건 호출에서 재시도 판단에 쓰인다) */
function statusFromErrorType(errorType: LlmErrorType): number | undefined {
  switch (errorType) {
    case "invalid_request_error":
      return 400;
    case "authentication_error":
      return 401;
    case "billing_error":
      return 402;
    case "permission_error":
      return 403;
    case "not_found_error":
      return 404;
    case "request_too_large":
      return 413;
    case "rate_limit_error":
      return 429;
    case "timeout_error":
      return 504;
    case "overloaded_error":
      return 529;
    case "connection_error":
      return undefined;
    default:
      return 500;
  }
}

/**
 * 전송 계층 오류. SDK 오류는 SDK 어댑터가 이 형태로 바꾸고, 가짜 transport(테스트)도 이것을 던진다.
 * status가 없으면 응답을 받지 못한 경우(연결 오류·타임아웃)다.
 */
export class LlmTransportError extends Error {
  override readonly name = "LlmTransportError";
  readonly status: number | undefined;
  readonly errorType: LlmErrorType;
  readonly retryAfterMs: number | undefined;
  constructor(init: {
    status?: number;
    errorType?: string;
    message: string;
    retryAfterMs?: number;
  }) {
    super(shortMessage(init.message));
    this.status = init.status;
    this.errorType = normalizeErrorType(init.errorType, init.status);
    this.retryAfterMs = init.retryAfterMs;
  }
  /** 429·5xx(529 overloaded 포함) — 서버가 처리하지 않은 요청이라 다시 보내도 중복 과금이 없다. */
  get retryable(): boolean {
    return (
      this.status !== undefined && (this.status === 429 || this.status >= 500)
    );
  }
}

/** 오류 메시지를 한 줄·고정 길이로 자른다(응답 본문 전체가 로그·결과에 남지 않게). */
function shortMessage(message: string): string {
  const oneLine = message.replace(/\s+/g, " ").trim();
  return oneLine.length > MESSAGE_MAX_LENGTH
    ? `${oneLine.slice(0, MESSAGE_MAX_LENGTH)}…`
    : oneLine;
}

// ─── 요청 ────────────────────────────────────────────────────────────────

/**
 * LLM 요청 1건. 입력 길이 상한(제목+요약 500자 등)은 호출부 책임이고, 여기서는 형식과 max_tokens만 강제한다.
 * temperature·top_p·top_k는 넣지 않는다 — claude-haiku-5-5는 기본값 외의 값을 400으로 거부한다.
 */
export const LlmRequestSchema = z.strictObject({
  /** 결과 매칭 키. 카드 ID·묶음 ID 등. Batches API 제약을 단건 호출에도 똑같이 적용한다 */
  customId: z
    .string()
    .regex(
      CUSTOM_ID_PATTERN,
      "customId는 영문·숫자·_·-만, 1~64자여야 한다 (Batches API custom_id 제약)",
    ),
  /** 고정 지시문(configs/prompts/*.md). cacheSystem이면 캐시 대상 */
  system: z.string().min(1, "system이 비어 있다"),
  /** 요청별 입력 */
  user: z.string().min(1, "user가 비어 있다"),
  /** 필수. thinking 토큰도 이 안에서 쓰인다 */
  maxTokens: z
    .number()
    .int("maxTokens는 정수여야 한다")
    .min(1, "maxTokens는 1 이상이어야 한다")
    .max(
      MAX_TOKENS_CEILING,
      `maxTokens는 ${MAX_TOKENS_CEILING} 이하여야 한다 (올리려면 사용자 승인 — CLAUDE.md §1-3)`,
    ),
  /**
   * system 블록에 `cache_control: {type:"ephemeral"}`(5분 TTL)을 붙인다.
   * - 모델 최소 프리픽스(claude-haiku-5-5 512토큰)에 못 미치면 효과가 없다(오류 없이 캐싱 안 됨).
   * - M1 첫 실측에서 `cache_read_input_tokens`가 0이면 이 옵션과 캐싱 코드를 빼고 PRD 비용 표를 갱신한다
   *   (CLAUDE.md §6.2, plan.md §14 B3).
   * - 1시간 TTL(문서는 배치에 권장, 쓰기 단가 2배)은 cost.ts 단가 분리가 필요해 지금은 지원하지 않는다.
   */
  cacheSystem: z.boolean().optional(),
  /** output_config.effort. 생략하면 모델 기본값(claude-haiku-5-5는 medium). xhigh·max는 막는다(비용) */
  effort: z.enum(["low", "medium", "high"]).optional(),
  /** thinking 설정. 생략하면 모델 기본값(claude-haiku-5-5는 적응형 thinking 켜짐) */
  thinking: z.enum(["adaptive", "disabled"]).optional(),
});
export type LlmRequest = z.infer<typeof LlmRequestSchema>;

/**
 * 요청 목록을 검증한다 — 각 요청 형식, 배치 안 customId 유일성, 건수(1 ~ MAX_REQUESTS_PER_BATCH).
 * 문제가 하나라도 있으면 전부 모아 LlmRequestError로 던진다. 프롬프트 본문은 메시지에 넣지 않는다.
 */
export function validateRequests(
  requests: readonly LlmRequest[],
): LlmRequest[] {
  if (requests.length === 0) {
    throw new LlmRequestError("요청이 0건이다");
  }
  if (requests.length > MAX_REQUESTS_PER_BATCH) {
    throw new LlmRequestError(
      `요청이 ${requests.length}건으로 상한 ${MAX_REQUESTS_PER_BATCH}건을 넘는다`,
    );
  }
  const problems: string[] = [];
  const valid: LlmRequest[] = [];
  const seen = new Set<string>();
  requests.forEach((request, index) => {
    const parsed = LlmRequestSchema.safeParse(request);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const where = issue.path.map((key) => `.${String(key)}`).join("");
        problems.push(`requests[${index}]${where}: ${issue.message}`);
      }
      return;
    }
    if (seen.has(parsed.data.customId)) {
      problems.push(
        `requests[${index}].customId: "${parsed.data.customId}" 중복 (배치 안에서 유일해야 한다)`,
      );
      return;
    }
    seen.add(parsed.data.customId);
    valid.push(parsed.data);
  });
  if (problems.length > 0) {
    throw new LlmRequestError(
      `LLM 요청 검증 실패 (${problems.length}건)`,
      problems,
    );
  }
  return valid;
}

export type MessageParams = Anthropic.MessageCreateParamsNonStreaming;

/** LlmRequest → Messages API 파라미터 (배치·단건 공용, 순수 함수) */
export function buildMessageParams(
  request: LlmRequest,
  model: string,
): MessageParams {
  const system: Anthropic.TextBlockParam = {
    type: "text",
    text: request.system,
  };
  if (request.cacheSystem) system.cache_control = { type: "ephemeral" };
  const params: MessageParams = {
    model,
    max_tokens: request.maxTokens,
    system: [system],
    messages: [{ role: "user", content: request.user }],
  };
  if (request.effort) params.output_config = { effort: request.effort };
  if (request.thinking) params.thinking = { type: request.thinking };
  return params;
}

/** `LLM_MODEL` → 모델 ID (빈 값·미지정은 기본 모델) */
export function resolveLlmModel(
  env: Readonly<Record<string, string | undefined>>,
): string {
  const model = env.LLM_MODEL?.trim() || DEFAULT_LLM_MODEL;
  if (/\s/.test(model)) {
    throw new LlmConfigError(`LLM_MODEL에 공백이 있다 (받은 값: "${model}")`);
  }
  return model;
}

// ─── usage ───────────────────────────────────────────────────────────────

/**
 * RunLog.tokens 형태(plan.md 부록 A).
 * `in`은 캐시 읽기·쓰기를 뺀 입력 토큰이다(API input_tokens). 전체 입력 = in + cacheRead + cacheWrite.
 * thinking 토큰은 `out`에 포함된다.
 */
export type TokenUsage = RunLog["tokens"];

export const ZERO_USAGE: Readonly<TokenUsage> = Object.freeze({
  in: 0,
  out: 0,
  cacheRead: 0,
  cacheWrite: 0,
});

/** 응답 usage 중 이 파일이 읽는 필드 (SDK Usage와 호환) */
export interface TransportUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  output_tokens_details?: { thinking_tokens: number } | null;
}

export function toTokenUsage(usage: TransportUsage): TokenUsage {
  return {
    in: usage.input_tokens,
    out: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
  };
}

export function addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    in: a.in + b.in,
    out: a.out + b.out,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  };
}

/**
 * 실행 1회의 usage 합계. `total`은 RunLog.tokens에 그대로 기록하고, `batch`·`single`은 cost.ts(M0-21)가
 * 배치 할인(50%) 단가와 일반 단가를 나눠 적용하는 데 쓴다(06:50 폴백이 있으면 한 실행에 둘이 섞인다).
 */
export interface UsageSummary {
  total: TokenUsage;
  batch: TokenUsage;
  single: TokenUsage;
  /** usage를 합산한 결과 수(과금되지 않은 실패 포함) */
  requests: { batch: number; single: number };
}

export function summarizeUsage(
  results: Iterable<Pick<LlmResult, "usage" | "batch">>,
): UsageSummary {
  let batch: TokenUsage = { ...ZERO_USAGE };
  let single: TokenUsage = { ...ZERO_USAGE };
  const requests = { batch: 0, single: 0 };
  for (const result of results) {
    if (result.batch) {
      batch = addTokenUsage(batch, result.usage);
      requests.batch += 1;
    } else {
      single = addTokenUsage(single, result.usage);
      requests.single += 1;
    }
  }
  return { total: addTokenUsage(batch, single), batch, single, requests };
}

// ─── 결과 ────────────────────────────────────────────────────────────────

interface LlmResultBase {
  customId: string;
  /** 배치로 처리됐는지(true) 단건 API인지(false) — 단가가 다르다 */
  batch: boolean;
  /** 과금 토큰. errored·canceled·expired·연결 실패는 0 */
  usage: TokenUsage;
  /** usage.out 중 thinking 토큰(응답이 알려 준 경우, 아니면 0) — thinking 비용 실측용(M0-30) */
  thinkingTokens: number;
}

export interface LlmSuccess extends LlmResultBase {
  ok: true;
  /** 텍스트 블록을 이어 붙인 원문 출력. JSON 파싱·zod 검증은 호출부가 한다 */
  text: string;
  stopReason: "end_turn" | "stop_sequence";
}

export interface LlmFailure extends LlmResultBase {
  ok: false;
  errorType: LlmErrorType;
  /** 짧은 사람용 설명(최대 300자). 응답 본문·프롬프트는 넣지 않는다 */
  message: string;
  /** 같은 요청을 다시 보내 볼 만한지(힌트) */
  retryable: boolean;
}

export type LlmResult = LlmSuccess | LlmFailure;

function failure(
  base: LlmResultBase,
  errorType: LlmErrorType,
  message: string,
): LlmFailure {
  return {
    ...base,
    ok: false,
    errorType,
    message: shortMessage(message),
    retryable: isRetryableErrorType(errorType),
  };
}

function unbilled(customId: string, batch: boolean): LlmResultBase {
  return { customId, batch, usage: { ...ZERO_USAGE }, thinkingTokens: 0 };
}

/** 응답 메시지 중 이 파일이 읽는 필드 (SDK Message와 호환) */
export interface TransportMessage {
  content: ReadonlyArray<{ type: string; text?: string }>;
  stop_reason: string | null;
  usage: TransportUsage;
}

/**
 * 응답 메시지 → 결과. thinking 블록은 버리고 text 블록만 이어 붙인다.
 * refusal·max_tokens(잘림)·빈 출력은 실패로 돌려주되 usage는 남긴다(과금됨).
 */
export function messageToResult(
  customId: string,
  message: TransportMessage,
  batch: boolean,
): LlmResult {
  const base: LlmResultBase = {
    customId,
    batch,
    usage: toTokenUsage(message.usage),
    thinkingTokens: message.usage.output_tokens_details?.thinking_tokens ?? 0,
  };
  const stopReason = message.stop_reason;
  if (stopReason === "refusal") {
    return failure(
      base,
      "refusal",
      "모델이 요청을 거절했다 (stop_reason: refusal)",
    );
  }
  if (
    stopReason === "max_tokens" ||
    stopReason === "model_context_window_exceeded"
  ) {
    return failure(
      base,
      "max_tokens",
      `출력이 잘렸다 (stop_reason: ${stopReason}) — thinking 토큰도 max_tokens 안에서 쓰인다`,
    );
  }
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
  if (
    (stopReason !== "end_turn" && stopReason !== "stop_sequence") ||
    text.trim() === ""
  ) {
    return failure(
      base,
      "empty_output",
      `쓸 수 있는 텍스트 출력이 없다 (stop_reason: ${stopReason ?? "null"})`,
    );
  }
  return { ...base, ok: true, text, stopReason };
}

// ─── 전송 계층 인터페이스 ────────────────────────────────────────────────

export interface BatchRequestCounts {
  processing: number;
  succeeded: number;
  errored: number;
  canceled: number;
  expired: number;
}

/** 배치 객체 중 이 파일이 읽는 필드 (SDK MessageBatch와 호환) */
export interface TransportBatch {
  id: string;
  processing_status: "in_progress" | "canceling" | "ended";
  request_counts: BatchRequestCounts;
  expires_at: string;
  ended_at: string | null;
}

/** 배치 결과 한 줄 (SDK MessageBatchIndividualResponse와 호환) */
export interface TransportBatchResult {
  custom_id: string;
  result:
    | { type: "succeeded"; message: TransportMessage }
    | { type: "errored"; error: { error: { type: string; message: string } } }
    | { type: "canceled" }
    | { type: "expired" };
}

export interface TransportBatchRequest {
  custom_id: string;
  params: MessageParams;
}

/**
 * LLM 전송 계층. live는 SDK 어댑터, mock은 fixture 어댑터, 테스트는 가짜 구현을 쓴다.
 * 실패는 LlmTransportError로 던진다(그 밖의 오류는 버그로 보고 그대로 전파된다).
 */
export interface LlmTransport {
  createMessage(
    params: MessageParams,
    meta: { customId: string },
  ): Promise<TransportMessage>;
  createBatch(
    requests: readonly TransportBatchRequest[],
  ): Promise<TransportBatch>;
  retrieveBatch(batchId: string): Promise<TransportBatch>;
  cancelBatch(batchId: string): Promise<TransportBatch>;
  /** 배치가 ended일 때만 유효하다 */
  batchResults(batchId: string): Promise<AsyncIterable<TransportBatchResult>>;
}

export interface BatchSnapshot {
  batchId: string;
  status: TransportBatch["processing_status"];
  counts: BatchRequestCounts;
  /** 생성 24시간 뒤 — 이때까지 처리되지 않은 요청은 expired */
  expiresAt: string;
  endedAt: string | null;
}

function toSnapshot(batch: TransportBatch): BatchSnapshot {
  return {
    batchId: batch.id,
    status: batch.processing_status,
    counts: { ...batch.request_counts },
    expiresAt: batch.expires_at,
    endedAt: batch.ended_at,
  };
}

/** 끝난 배치의 요청이 전부 만료(24시간)됐는지 */
function isFullyExpired(snapshot: BatchSnapshot): boolean {
  const { succeeded, errored, canceled, expired } = snapshot.counts;
  return expired > 0 && succeeded + errored + canceled === 0;
}

// ─── SDK 어댑터 (live) ───────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** `retry-after` 헤더(초) → ms. 날짜 형식·이상값은 무시한다. */
export function parseRetryAfterMs(
  value: string | null | undefined,
): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return Math.round(seconds * 1000);
}

/** SDK 오류 → LlmTransportError. SDK 오류가 아니면 그대로 돌려준다. */
function fromSdkError(error: unknown): unknown {
  // APIConnectionError는 APIError의 하위 클래스라 먼저 본다
  if (error instanceof APIConnectionError) {
    return new LlmTransportError({
      errorType: "connection_error",
      message:
        error instanceof APIConnectionTimeoutError
          ? "요청 시간 초과"
          : "연결 오류",
    });
  }
  if (error instanceof APIError) {
    const body: unknown = error.error;
    const nested =
      isRecord(body) &&
      isRecord(body.error) &&
      typeof body.error.message === "string"
        ? body.error.message
        : undefined;
    return new LlmTransportError({
      status: error.status,
      errorType: error.type ?? undefined,
      message: nested ?? error.message,
      retryAfterMs: parseRetryAfterMs(error.headers?.get("retry-after")),
    });
  }
  return error;
}

async function sdkCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw fromSdkError(error);
  }
}

async function* sdkIterate<T>(source: AsyncIterable<T>): AsyncGenerator<T> {
  try {
    for await (const item of source) yield item;
  } catch (error) {
    throw fromSdkError(error);
  }
}

export interface SdkTransportOptions {
  apiKey: string;
  timeoutMs?: number;
  /**
   * HTTP 구현 주입 — 테스트에서 가짜 fetch로 SDK 어댑터(요청 형태·오류 변환·JSONL 결과)를 네트워크 없이
   * 검증한다. Vitest 안에서는 필수다(실호출 방지).
   */
  fetch?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
}

/** SDK 기반 transport(live). 보통은 createLlmClient가 만들고, 직접 쓰는 곳은 어댑터 테스트뿐이다. */
export function createSdkTransport({
  apiKey,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  fetch: fetchImpl,
}: SdkTransportOptions): LlmTransport {
  if (process.env.VITEST && !fetchImpl) {
    throw new LlmConfigError(
      "Vitest 안에서는 가짜 fetch 없이 SDK transport를 만들지 않는다",
    );
  }
  // authToken: null — ANTHROPIC_AUTH_TOKEN이 함께 설정돼 있어도 API 키만 쓴다(둘 다 보내면 401).
  // maxRetries: 0 — 재시도는 이 파일의 정책(429·5xx만)으로 한 번만 한다.
  const client = new Anthropic({
    apiKey,
    authToken: null,
    maxRetries: 0,
    timeout: timeoutMs,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
  return {
    createMessage: (params) => sdkCall(() => client.messages.create(params)),
    createBatch: (requests) =>
      sdkCall(() =>
        client.messages.batches.create({
          requests: requests.map((request) => ({
            custom_id: request.custom_id,
            params: request.params,
          })),
        }),
      ),
    retrieveBatch: (batchId) =>
      sdkCall(() => client.messages.batches.retrieve(batchId)),
    cancelBatch: (batchId) =>
      sdkCall(() => client.messages.batches.cancel(batchId)),
    batchResults: async (batchId) =>
      sdkIterate(await sdkCall(() => client.messages.batches.results(batchId))),
  };
}

function createLiveTransport(
  env: Readonly<Record<string, string | undefined>>,
  timeoutMs: number,
): LlmTransport {
  // 테스트에서 실수로 live 클라이언트를 만들지 않게 한다(CLAUDE.md §6.3 — 테스트는 네트워크·실호출 금지).
  if (env.VITEST) {
    throw new LlmConfigError(
      "Vitest 안에서는 live 모드 SDK 클라이언트를 만들지 않는다 — transport를 주입하거나 mock 모드를 쓴다",
    );
  }
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new LlmConfigError(
      "ANTHROPIC_API_KEY가 설정되지 않았다 — live 모드에는 API 키가 필요하다 " +
        "(로컬은 .env.local, CI는 Actions Secrets). LLM 없이 실행하려면 --mock 또는 LLM_MODE=mock",
    );
  }
  return createSdkTransport({ apiKey, timeoutMs });
}

// ─── mock 어댑터 ─────────────────────────────────────────────────────────

const MockUsageSchema = z.strictObject({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cache_read_input_tokens: z.number().int().nonnegative().optional(),
  cache_creation_input_tokens: z.number().int().nonnegative().optional(),
});

const MockNoteSchema = z.string().optional();

/** `fixtures/llm/mock/**.json` 한 파일 (형식은 fixtures/llm/README.md) */
export const MockFixtureSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("succeeded"),
    note: MockNoteSchema,
    text: z.string(),
    stop_reason: z
      .enum(["end_turn", "stop_sequence", "max_tokens", "refusal"])
      .default("end_turn"),
    /** 없으면 0 — 비용 계산 테스트에 쓰려면 기록한다 */
    usage: MockUsageSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("errored"),
    note: MockNoteSchema,
    error: z.strictObject({ type: z.string().min(1), message: z.string() }),
  }),
  z.strictObject({ type: z.literal("canceled"), note: MockNoteSchema }),
  z.strictObject({ type: z.literal("expired"), note: MockNoteSchema }),
]);
export type MockFixture = z.infer<typeof MockFixtureSchema>;

/**
 * 요청 해시 키 — customId로 fixture를 못 찾을 때 쓰는 두 번째 키.
 * system + user만 해시한다(모델·max_tokens가 바뀌어도 같은 fixture를 쓰게).
 */
export function mockRequestKey(request: Pick<LlmRequest, "system" | "user">) {
  const digest = createHash("sha256")
    .update(`${request.system}\u0000${request.user}`)
    .digest("hex");
  return `h_${digest.slice(0, 16)}`;
}

/** buildMessageParams가 만든 파라미터에서 system·user 문자열을 되찾는다 */
function promptOf(params: MessageParams): { system: string; user: string } {
  const system =
    typeof params.system === "string"
      ? params.system
      : (params.system ?? []).map((block) => block.text).join("");
  const first = params.messages[0]?.content;
  const user =
    typeof first === "string"
      ? first
      : (first ?? [])
          .map((block) => (block.type === "text" ? block.text : ""))
          .join("");
  return { system, user };
}

function readOptional(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return null;
    throw error;
  }
}

function displayPath(file: string): string {
  return path.relative(process.cwd(), file) || file;
}

function fixtureToMessage(
  fixture: Extract<MockFixture, { type: "succeeded" }>,
): TransportMessage {
  return {
    content: [{ type: "text", text: fixture.text }],
    stop_reason: fixture.stop_reason,
    usage: fixture.usage ?? { input_tokens: 0, output_tokens: 0 },
  };
}

function fixtureToBatchResult(
  customId: string,
  fixture: MockFixture,
): TransportBatchResult {
  switch (fixture.type) {
    case "succeeded":
      return {
        custom_id: customId,
        result: { type: "succeeded", message: fixtureToMessage(fixture) },
      };
    case "errored":
      return {
        custom_id: customId,
        result: { type: "errored", error: { error: fixture.error } },
      };
    case "canceled":
    case "expired":
      return { custom_id: customId, result: { type: fixture.type } };
  }
}

/**
 * fixture 기반 transport (mock 모드). 조회 순서: `by-id/<customId>.json` → `by-hash/<mockRequestKey>.json`.
 * 배치는 제출 즉시 ended 상태가 된다. 없는 fixture는 LlmMockFixtureError로 즉시 알린다.
 */
export function createMockTransport(
  mockDir: string = DEFAULT_MOCK_DIR,
): LlmTransport {
  const batches = new Map<string, TransportBatchResult[]>();
  let batchCounter = 0;

  /** fixture를 찾는다. 없으면 null + 찾아본 경로 */
  const lookup = (
    customId: string,
    params: MessageParams,
  ): { fixture: MockFixture } | { missing: string[] } => {
    const candidates = [
      path.join(mockDir, "by-id", `${customId}.json`),
      path.join(mockDir, "by-hash", `${mockRequestKey(promptOf(params))}.json`),
    ];
    for (const file of candidates) {
      const raw = readOptional(file);
      if (raw === null) continue;
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new LlmMockFixtureError(
          `mock fixture JSON 파싱 실패: ${displayPath(file)}`,
        );
      }
      const parsed = MockFixtureSchema.safeParse(json);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map(
            (issue) => `${issue.path.join(".") || "(루트)"}: ${issue.message}`,
          )
          .join("; ");
        throw new LlmMockFixtureError(
          `mock fixture 형식 오류: ${displayPath(file)} — ${issues}`,
        );
      }
      return { fixture: parsed.data };
    }
    return { missing: candidates.map(displayPath) };
  };

  const missingMessage = (entries: string[]): string =>
    `mock fixture 없음 (${entries.length}건) — 아래 중 한 파일을 만든다 (fixtures/llm/README.md):\n  - ${entries.join("\n  - ")}`;

  const snapshotOf = (
    id: string,
    results: TransportBatchResult[],
  ): TransportBatch => {
    const counts: BatchRequestCounts = {
      processing: 0,
      succeeded: 0,
      errored: 0,
      canceled: 0,
      expired: 0,
    };
    for (const entry of results) counts[entry.result.type] += 1;
    return {
      id,
      processing_status: "ended",
      request_counts: counts,
      expires_at: "9999-12-31T00:00:00.000Z",
      ended_at: "1970-01-01T00:00:00.000Z",
    };
  };

  const getBatch = (batchId: string): TransportBatchResult[] => {
    const results = batches.get(batchId);
    if (!results) {
      throw new LlmTransportError({
        status: 404,
        message: `mock 배치 없음: ${batchId}`,
      });
    }
    return results;
  };

  return {
    async createMessage(params, meta) {
      const found = lookup(meta.customId, params);
      if ("missing" in found) {
        throw new LlmMockFixtureError(
          missingMessage([`${meta.customId}: ${found.missing.join(" 또는 ")}`]),
        );
      }
      const { fixture } = found;
      if (fixture.type === "succeeded") return fixtureToMessage(fixture);
      if (fixture.type === "errored") {
        const errorType = normalizeErrorType(fixture.error.type);
        throw new LlmTransportError({
          status: statusFromErrorType(errorType),
          errorType,
          message: fixture.error.message,
        });
      }
      throw new LlmMockFixtureError(
        `단건 호출 fixture에는 type "${fixture.type}"을 쓸 수 없다 (succeeded·errored만): ${meta.customId}`,
      );
    },
    async createBatch(requests) {
      const results: TransportBatchResult[] = [];
      const missing: string[] = [];
      for (const request of requests) {
        const found = lookup(request.custom_id, request.params);
        if ("missing" in found) {
          missing.push(`${request.custom_id}: ${found.missing.join(" 또는 ")}`);
        } else {
          results.push(fixtureToBatchResult(request.custom_id, found.fixture));
        }
      }
      if (missing.length > 0) {
        throw new LlmMockFixtureError(missingMessage(missing));
      }
      batchCounter += 1;
      const id = `mock_batch_${batchCounter}`;
      batches.set(id, results);
      return snapshotOf(id, results);
    },
    async retrieveBatch(batchId) {
      return snapshotOf(batchId, getBatch(batchId));
    },
    async cancelBatch(batchId) {
      return snapshotOf(batchId, getBatch(batchId));
    },
    async batchResults(batchId) {
      const results = getBatch(batchId);
      return (async function* () {
        yield* results;
      })();
    },
  };
}

// ─── 클라이언트 ──────────────────────────────────────────────────────────

/** 구조화 로그 한 줄. 단계·건수·소요 시간만 — 프롬프트·출력 텍스트·키·응답 본문은 넣지 않는다. */
export interface LlmLogEvent {
  stage: string;
  [key: string]: string | number | boolean | null;
}
export type LlmLogger = (event: LlmLogEvent) => void;

/** 재시도·오류·마감 계열 단계는 warn, 나머지는 info */
function llmLogLevel(stage: string): "info" | "warn" {
  return /\.(?:retry|error|deadline|unexpected)$/.test(stage) ? "warn" : "info";
}

/**
 * 공용 구조화 로거(scripts/lib/logger.ts)로 보내는 LlmLogger — createLlmClient의 기본값.
 * 이벤트 이름은 `llm.<stage>`(예: `llm.batch.submit`), 나머지 필드는 그대로(단계·건수·소요 시간뿐).
 * 호출부(M1 summarize)가 자기 로거로 묶고 싶으면 `createLlmLogger(log.child({ runId }))`처럼 넘긴다.
 */
export function createLlmLogger(
  logger: Logger = createLogger({ scope: "llm" }),
): LlmLogger {
  return ({ stage, ...fields }) => {
    logger[llmLogLevel(stage)](`llm.${stage}`, fields);
  };
}

export interface LlmClientOptions {
  /** 생략하면 env.LLM_MODE (cli-args.ts resolveLlmMode 규칙: 빈 값·미지정 = live). --mock은 호출부가 반영해 넘긴다 */
  mode?: LlmMode;
  /** 생략하면 env.LLM_MODEL → 기본 claude-haiku-5-5 */
  model?: string;
  /** 기본 process.env. 키 값은 읽기만 하고 출력하지 않는다 */
  env?: Readonly<Record<string, string | undefined>>;
  /** 테스트용 전송 계층 주입. 주면 모드와 관계없이 이것을 쓴다 */
  transport?: LlmTransport;
  /** mock fixture 폴더 (기본 fixtures/llm/mock) */
  mockDir?: string;
  logger?: LlmLogger;
  /** 현재 시각(ms) — 테스트 주입용 */
  now?: () => number;
  /** 대기 — 테스트 주입용. mock 모드 기본값은 즉시 반환 */
  sleep?: (ms: number) => Promise<void>;
  retry?: Partial<RetryPolicy>;
  /** live HTTP 요청 1회 타임아웃 */
  requestTimeoutMs?: number;
}

export interface PollOptions {
  /** 이 시각까지 끝나지 않으면 state "deadline"으로 돌아온다(예: 06:50 KST — 호출부가 time.ts로 계산) */
  deadline: Date;
  /** 조회 간격(기본 30초, 최소 5초) */
  intervalMs?: number;
}

export type PollResult =
  /** 처리 끝 — 결과를 받을 수 있다(succeeded·errored·canceled·expired가 섞일 수 있음) */
  | { state: "ended"; snapshot: BatchSnapshot }
  /** 24시간 만료로 끝남 — 모든 요청이 expired(과금 없음) */
  | { state: "expired"; snapshot: BatchSnapshot }
  /** 우리 마감 초과 — 배치는 계속 진행 중. 마지막 조회에 실패했으면 snapshot null */
  | { state: "deadline"; snapshot: BatchSnapshot | null };

export type RunBatchOptions = PollOptions;

export type RunBatchOutcome =
  | {
      timedOut: false;
      batchId: string;
      state: "ended" | "expired";
      /** 요청 순서대로 모든 customId의 결과(받지 못한 것은 missing_result 실패) */
      results: Map<string, LlmResult>;
      usage: UsageSummary;
    }
  | {
      /**
       * 마감 초과. 처리 중인 배치의 결과는 API가 주지 않는다(ended 이후에만) — 부분 결과가 필요하면
       * cancelBatch → pollBatch(짧은 유예) → collectBatchResults 순서로 받는다(취소 전 처리분만 과금).
       * 취소하지 않으면 배치는 계속 처리되고 과금된다. 06:50 폴백 결정은 호출부(M1-19)가 한다.
       */
      timedOut: true;
      batchId: string;
      snapshot: BatchSnapshot | null;
    };

export interface CallSingleOptions {
  /** 재시도 대기가 이 시각을 넘기면 더 기다리지 않고 실패로 돌려준다 */
  deadline?: Date;
}

export interface LlmClient {
  readonly mode: LlmMode;
  readonly model: string;
  /** 요청 검증 → 배치 제출 → batchId. 429·5xx는 재시도, 그 밖의 실패는 LlmTransportError를 던진다 */
  submitBatch(requests: readonly LlmRequest[]): Promise<string>;
  /** ended(또는 마감)까지 상태를 조회한다. 조회 중 일시 오류는 기록만 하고 계속 조회한다 */
  pollBatch(batchId: string, options: PollOptions): Promise<PollResult>;
  /** 끝난 배치의 결과를 customId별로 받는다(받은 순서대로, 입력 순서와 다를 수 있음) */
  collectBatchResults(batchId: string): Promise<Map<string, LlmResult>>;
  /** 처리 중인 배치 취소 요청 — 취소 전에 처리된 요청은 과금되고 결과로 남는다 */
  cancelBatch(batchId: string): Promise<BatchSnapshot>;
  /** 제출 → 폴링 → 결과. 제출 실패는 던지고, 결과 수거 실패는 전부 missing_result로 돌려준다 */
  runBatch(
    requests: readonly LlmRequest[],
    options: RunBatchOptions,
  ): Promise<RunBatchOutcome>;
  /** 일반 Messages API 1건. API 실패는 던지지 않고 LlmFailure로 돌려준다(요청 형식 오류만 던진다) */
  callSingle(
    request: LlmRequest,
    options?: CallSingleOptions,
  ): Promise<LlmResult>;
}

/** n번째 재시도(1부터) 전 대기 — 지수 백오프, retry-after가 더 길면 그 값, 상한 maxDelayMs */
export function backoffDelayMs(
  retryNumber: number,
  policy: RetryPolicy,
  retryAfterMs?: number,
): number {
  const exponential = policy.baseDelayMs * 2 ** (retryNumber - 1);
  return Math.min(Math.max(exponential, retryAfterMs ?? 0), policy.maxDelayMs);
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
const noSleep = (): Promise<void> => Promise.resolve();

export function createLlmClient(options: LlmClientOptions = {}): LlmClient {
  const env = options.env ?? process.env;

  let mode: LlmMode;
  if (options.mode) {
    mode = options.mode;
  } else {
    const resolved = resolveLlmMode(false, env.LLM_MODE);
    if (!resolved.ok) throw new LlmConfigError(resolved.error);
    mode = resolved.value;
  }
  const model = options.model?.trim() || resolveLlmModel(env);
  const log = options.logger ?? createLlmLogger();
  const now = options.now ?? Date.now;
  const usesFixtures = mode === "mock" && !options.transport;
  const sleep = options.sleep ?? (usesFixtures ? noSleep : realSleep);
  const retry: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...options.retry };
  const transport =
    options.transport ??
    (mode === "mock"
      ? createMockTransport(options.mockDir)
      : createLiveTransport(
          env,
          options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        ));

  /**
   * 재시도 래퍼. 429·5xx는 항상, 연결 오류는 retryConnectionErrors일 때만(읽기 요청) 다시 시도한다.
   * deadline이 있으면 대기가 그 시각을 넘길 때 포기한다.
   */
  async function withRetry<T>(
    call: () => Promise<T>,
    context: {
      stage: string;
      retryConnectionErrors: boolean;
      deadline?: Date;
      customId?: string;
    },
  ): Promise<T> {
    for (let retryNumber = 1; ; retryNumber += 1) {
      try {
        return await call();
      } catch (error) {
        if (!(error instanceof LlmTransportError)) throw error;
        const retryable =
          error.retryable ||
          (context.retryConnectionErrors &&
            error.errorType === "connection_error");
        if (!retryable || retryNumber > retry.maxRetries) throw error;
        const delayMs = backoffDelayMs(retryNumber, retry, error.retryAfterMs);
        if (context.deadline && now() + delayMs >= context.deadline.getTime()) {
          throw error;
        }
        log({
          stage: `${context.stage}.retry`,
          ...(context.customId ? { customId: context.customId } : {}),
          retry: retryNumber,
          errorType: error.errorType,
          status: error.status ?? null,
          delayMs,
        });
        await sleep(delayMs);
      }
    }
  }

  async function submitBatch(requests: readonly LlmRequest[]): Promise<string> {
    const valid = validateRequests(requests);
    const startedAt = now();
    const payload = valid.map((request) => ({
      custom_id: request.customId,
      params: buildMessageParams(request, model),
    }));
    const batch = await withRetry(() => transport.createBatch(payload), {
      stage: "batch.submit",
      retryConnectionErrors: false,
    });
    log({
      stage: "batch.submit",
      batchId: batch.id,
      requests: valid.length,
      model,
      elapsedMs: now() - startedAt,
    });
    return batch.id;
  }

  async function pollBatch(
    batchId: string,
    { deadline, intervalMs = DEFAULT_POLL_INTERVAL_MS }: PollOptions,
  ): Promise<PollResult> {
    const interval = Math.max(intervalMs, MIN_POLL_INTERVAL_MS);
    const startedAt = now();
    let last: BatchSnapshot | null = null;
    for (;;) {
      try {
        last = toSnapshot(await transport.retrieveBatch(batchId));
        log({
          stage: "batch.poll",
          batchId,
          status: last.status,
          processing: last.counts.processing,
          elapsedMs: now() - startedAt,
        });
        if (last.status === "ended") {
          const state = isFullyExpired(last) ? "expired" : "ended";
          log({
            stage: "batch.ended",
            batchId,
            state,
            ...last.counts,
            elapsedMs: now() - startedAt,
          });
          return { state, snapshot: last };
        }
      } catch (error) {
        const transient =
          error instanceof LlmTransportError &&
          (error.retryable || error.errorType === "connection_error");
        if (!transient) throw error;
        log({
          stage: "batch.poll.error",
          batchId,
          errorType: error.errorType,
          status: error.status ?? null,
        });
      }
      const remaining = deadline.getTime() - now();
      if (remaining <= 0) {
        log({
          stage: "batch.deadline",
          batchId,
          status: last?.status ?? null,
          processing: last?.counts.processing ?? null,
          elapsedMs: now() - startedAt,
        });
        return { state: "deadline", snapshot: last };
      }
      await sleep(Math.min(interval, remaining));
    }
  }

  async function collectBatchResults(
    batchId: string,
  ): Promise<Map<string, LlmResult>> {
    const startedAt = now();
    const results = await withRetry(
      async () => {
        const collected = new Map<string, LlmResult>();
        for await (const entry of await transport.batchResults(batchId)) {
          collected.set(entry.custom_id, batchEntryToResult(entry));
        }
        return collected;
      },
      { stage: "batch.results", retryConnectionErrors: true },
    );
    let ok = 0;
    for (const result of results.values()) if (result.ok) ok += 1;
    log({
      stage: "batch.results",
      batchId,
      ok,
      failed: results.size - ok,
      elapsedMs: now() - startedAt,
    });
    return results;
  }

  async function cancelBatch(batchId: string): Promise<BatchSnapshot> {
    const snapshot = toSnapshot(
      await withRetry(() => transport.cancelBatch(batchId), {
        stage: "batch.cancel",
        retryConnectionErrors: false,
      }),
    );
    log({ stage: "batch.cancel", batchId, status: snapshot.status });
    return snapshot;
  }

  async function runBatch(
    requests: readonly LlmRequest[],
    { deadline, intervalMs }: RunBatchOptions,
  ): Promise<RunBatchOutcome> {
    const valid = validateRequests(requests);
    if (now() >= deadline.getTime()) {
      throw new LlmRequestError(
        "마감 시각이 이미 지나 배치를 제출하지 않는다 — 폴백 여부는 호출부가 정한다",
      );
    }
    const batchId = await submitBatch(valid);
    const polled = await pollBatch(batchId, { deadline, intervalMs });
    if (polled.state === "deadline") {
      return { timedOut: true, batchId, snapshot: polled.snapshot };
    }

    let collected = new Map<string, LlmResult>();
    let missingMessage = "배치 결과에 이 customId가 없다";
    try {
      collected = await collectBatchResults(batchId);
    } catch (error) {
      if (!(error instanceof LlmTransportError)) throw error;
      // 결과는 29일 보관되므로 batchId로 나중에 다시 받을 수 있다(이미 과금된 요청 포함)
      missingMessage = `배치 결과 수거 실패(${error.errorType}) — batchId로 다시 받을 수 있다`;
      log({
        stage: "batch.results.error",
        batchId,
        errorType: error.errorType,
        status: error.status ?? null,
      });
    }

    const results = new Map<string, LlmResult>();
    for (const request of valid) {
      results.set(
        request.customId,
        collected.get(request.customId) ??
          failure(
            unbilled(request.customId, true),
            "missing_result",
            missingMessage,
          ),
      );
    }
    const unexpected = [...collected.keys()].filter((id) => !results.has(id));
    if (unexpected.length > 0) {
      log({
        stage: "batch.results.unexpected",
        batchId,
        count: unexpected.length,
      });
    }
    return {
      timedOut: false,
      batchId,
      state: polled.state,
      results,
      usage: summarizeUsage(results.values()),
    };
  }

  async function callSingle(
    request: LlmRequest,
    { deadline }: CallSingleOptions = {},
  ): Promise<LlmResult> {
    const [valid] = validateRequests([request]);
    if (!valid) throw new LlmRequestError("요청이 0건이다");
    const customId = valid.customId;
    const params = buildMessageParams(valid, model);
    const startedAt = now();
    let attempts = 0;
    let result: LlmResult;
    try {
      const message = await withRetry(
        () => {
          attempts += 1;
          return transport.createMessage(params, { customId });
        },
        { stage: "single", retryConnectionErrors: false, deadline, customId },
      );
      result = messageToResult(customId, message, false);
    } catch (error) {
      if (!(error instanceof LlmTransportError)) throw error;
      result = failure(
        unbilled(customId, false),
        error.errorType,
        error.message,
      );
    }
    log({
      stage: "single.done",
      customId,
      ok: result.ok,
      errorType: result.ok ? null : result.errorType,
      attempts,
      model,
      elapsedMs: now() - startedAt,
    });
    return result;
  }

  return {
    mode,
    model,
    submitBatch,
    pollBatch,
    collectBatchResults,
    cancelBatch,
    runBatch,
    callSingle,
  };
}

/** 배치 결과 한 줄 → 결과 (errored·canceled·expired는 과금 없음) */
export function batchEntryToResult(entry: TransportBatchResult): LlmResult {
  const { custom_id: customId, result } = entry;
  switch (result.type) {
    case "succeeded":
      return messageToResult(customId, result.message, true);
    case "errored": {
      const errorType = normalizeErrorType(result.error.error.type);
      return failure(
        unbilled(customId, true),
        errorType,
        result.error.error.message,
      );
    }
    case "canceled":
      return failure(
        unbilled(customId, true),
        "canceled",
        "배치가 취소돼 처리되지 않았다",
      );
    case "expired":
      return failure(
        unbilled(customId, true),
        "expired",
        "배치 24시간 만료 전에 처리되지 않았다",
      );
  }
}
