import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  BRIEF_MAX_TOKENS,
  BRIEF_REQUEST_TIMEOUT_MS,
  buildBriefRequest,
} from "../scripts/lib/brief";
import {
  addTokenUsage,
  backoffDelayMs,
  batchEntryToResult,
  buildMessageParams,
  createLlmClient,
  CUSTOM_ID_PATTERN,
  DEADLINE_CUT_SLACK_MS,
  DEFAULT_LLM_MODEL,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_RETRY_POLICY,
  isRetryableErrorType,
  LlmConfigError,
  LlmMockFixtureError,
  LlmRequestError,
  LlmTransportError,
  MAX_REQUESTS_PER_BATCH,
  MAX_TOKENS_CEILING,
  messageToResult,
  MIN_POLL_INTERVAL_MS,
  mockRequestKey,
  normalizeErrorType,
  parseRetryAfterMs,
  resolveLlmModel,
  summarizeUsage,
  toTokenUsage,
  validateRequests,
  ZERO_USAGE,
  type BatchRequestCounts,
  type LlmClient,
  type LlmClientOptions,
  type LlmLogEvent,
  type LlmRequest,
  type LlmResult,
  type LlmTransport,
  type MessageParams,
  type TransportBatch,
  type TransportBatchRequest,
  type TransportBatchResult,
  type TransportMessage,
} from "../scripts/lib/llm";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPO_MOCK_DIR = path.join(REPO_ROOT, "fixtures/llm/mock");

// 기준 시각 2026-10-11 06:35 KST, 마감 06:50 KST
const START = Date.parse("2026-10-10T21:35:00Z");
const DEADLINE = new Date("2026-10-10T21:50:00Z");

// ─── 헬퍼 ────────────────────────────────────────────────────────────────

function request(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    customId: "c_0123456789",
    system: "고정 지시문",
    user: "Title: Sample United win\nSummary: sample",
    maxTokens: 600,
    ...overrides,
  };
}

function unwrapOk(result: LlmResult | undefined) {
  if (!result?.ok)
    throw new Error(`성공을 기대했다: ${JSON.stringify(result)}`);
  return result;
}

function unwrapFail(result: LlmResult | undefined) {
  if (!result || result.ok)
    throw new Error(`실패를 기대했다: ${JSON.stringify(result)}`);
  return result;
}

function message(
  text: string,
  overrides: Partial<TransportMessage> = {},
): TransportMessage {
  return {
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: 200, output_tokens: 100 },
    ...overrides,
  };
}

function succeeded(
  customId: string,
  text = "{}",
  usage = { input_tokens: 200, output_tokens: 100 },
): TransportBatchResult {
  return {
    custom_id: customId,
    result: { type: "succeeded", message: message(text, { usage }) },
  };
}

const ZERO_COUNTS: BatchRequestCounts = {
  processing: 0,
  succeeded: 0,
  errored: 0,
  canceled: 0,
  expired: 0,
};

function batch(
  status: TransportBatch["processing_status"],
  counts: Partial<BatchRequestCounts> = {},
): TransportBatch {
  return {
    id: "msgbatch_test",
    processing_status: status,
    request_counts: { ...ZERO_COUNTS, ...counts },
    expires_at: "2026-10-11T21:35:00Z",
    ended_at: status === "ended" ? "2026-10-10T21:36:00Z" : null,
  };
}

function rateLimited(retryAfterMs?: number) {
  return new LlmTransportError({
    status: 429,
    errorType: "rate_limit_error",
    message: "rate limited",
    retryAfterMs,
  });
}
const overloaded = () =>
  new LlmTransportError({
    status: 529,
    errorType: "overloaded_error",
    message: "overloaded",
  });
const connectionError = () =>
  new LlmTransportError({
    errorType: "connection_error",
    message: "연결 오류",
  });
const badRequest = () =>
  new LlmTransportError({
    status: 400,
    errorType: "invalid_request_error",
    message: "bad",
  });

interface FakeScript {
  /** retrieveBatch가 차례로 돌려줄 상태(마지막 값 반복). Error면 던진다 */
  retrieve?: Array<TransportBatch | Error>;
  results?: TransportBatchResult[];
  /** batchResults 호출 차례별 오류(없으면 정상) */
  resultsErrors?: Array<Error | undefined>;
  /** createBatch 호출 차례별 오류(없으면 정상) */
  createBatchErrors?: Array<Error | undefined>;
  /** createMessage가 차례로 돌려줄 응답(마지막 값 반복). Error면 던진다 */
  messages?: Array<TransportMessage | Error>;
}

function fakeTransport(script: FakeScript = {}) {
  const calls = {
    createBatch: [] as TransportBatchRequest[][],
    retrieve: 0,
    results: 0,
    cancel: 0,
    messages: [] as {
      params: MessageParams;
      customId: string;
      timeoutMs?: number;
    }[],
  };
  const pick = <T>(list: T[] | undefined, index: number): T | undefined =>
    list && list.length > 0
      ? list[Math.min(index, list.length - 1)]
      : undefined;

  const transport: LlmTransport = {
    async createMessage(params, meta) {
      const next = pick(script.messages, calls.messages.length);
      calls.messages.push({
        params,
        customId: meta.customId,
        timeoutMs: meta.timeoutMs,
      });
      if (next instanceof Error) throw next;
      if (!next)
        throw new Error("가짜 transport: 메시지 응답이 정의되지 않았다");
      return next;
    },
    async createBatch(requests) {
      const error = script.createBatchErrors?.[calls.createBatch.length];
      calls.createBatch.push([...requests]);
      if (error) throw error;
      return batch("in_progress", { processing: requests.length });
    },
    async retrieveBatch() {
      const next = pick(script.retrieve, calls.retrieve);
      calls.retrieve += 1;
      if (next instanceof Error) throw next;
      return next ?? batch("ended");
    },
    async cancelBatch() {
      calls.cancel += 1;
      return batch("canceling");
    },
    async batchResults() {
      const error = script.resultsErrors?.[calls.results];
      calls.results += 1;
      if (error) throw error;
      const results = script.results ?? [];
      return (async function* () {
        yield* results;
      })();
    },
  };
  return { transport, calls };
}

function harness(
  transport: LlmTransport,
  overrides: Partial<LlmClientOptions> = {},
) {
  let now = START;
  const sleeps: number[] = [];
  const logs: LlmLogEvent[] = [];
  const client = createLlmClient({
    mode: "live",
    env: {},
    transport,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    logger: (event) => logs.push(event),
    ...overrides,
  });
  return { client, sleeps, logs, advance: (ms: number) => (now += ms) };
}

// ─── 요청 검증 ───────────────────────────────────────────────────────────

describe("validateRequests", () => {
  it("올바른 요청을 그대로 돌려준다", () => {
    const requests = [request(), request({ customId: "news-2026_10_10-01" })];
    expect(validateRequests(requests)).toEqual(requests);
  });

  it("카드 ID 형식(c_ + 16진수 10자리)과 64자 customId를 허용한다", () => {
    expect(CUSTOM_ID_PATTERN.test("c_0a1b2c3d4e")).toBe(true);
    expect(() =>
      validateRequests([request({ customId: "a".repeat(64) })]),
    ).not.toThrow();
  });

  it.each([
    ["빈 문자열", ""],
    ["65자", "a".repeat(65)],
    ["공백", "c 1"],
    ["점", "c.1"],
    ["슬래시", "c/1"],
    ["한글", "카드1"],
  ])("customId %s는 거부한다", (_label, customId) => {
    expect(() => validateRequests([request({ customId })])).toThrow(
      LlmRequestError,
    );
    expect(() => validateRequests([request({ customId })])).toThrow(/customId/);
  });

  it("배치 안 customId 중복을 거부한다", () => {
    expect(() => validateRequests([request(), request()])).toThrow(/중복/);
  });

  it.each([
    ["0", 0],
    ["소수", 1.5],
    ["상한 초과", MAX_TOKENS_CEILING + 1],
  ])("maxTokens %s는 거부한다", (_label, maxTokens) => {
    expect(() => validateRequests([request({ maxTokens })])).toThrow(
      /maxTokens/,
    );
  });

  it("maxTokens는 필수다", () => {
    const withoutMaxTokens: Partial<LlmRequest> = request();
    delete withoutMaxTokens.maxTokens;
    expect(() => validateRequests([withoutMaxTokens as LlmRequest])).toThrow(
      /maxTokens/,
    );
  });

  it("maxTokens 상한값 자체는 허용한다", () => {
    expect(() =>
      validateRequests([request({ maxTokens: MAX_TOKENS_CEILING })]),
    ).not.toThrow();
  });

  it("전송 계층 상한은 브리핑 max_tokens와 같은 16,384(D57) — 실제 브리핑 요청이 검증을 통과하고, 그보다 크면 거부한다", () => {
    expect(MAX_TOKENS_CEILING).toBe(16_384);
    expect(BRIEF_MAX_TOKENS).toBe(MAX_TOKENS_CEILING);
    const brief = buildBriefRequest(
      { briefDate: "2026-10-18", matches: [], standings: [] },
      "지시문",
    );
    expect(validateRequests([brief])).toEqual([brief]);
    expect(() => validateRequests([{ ...brief, maxTokens: 16_385 }])).toThrow(
      /maxTokens는 16384 이하/,
    );
  });

  it("0건과 상한 초과 건수를 거부한다", () => {
    expect(() => validateRequests([])).toThrow(/0건/);
    const many = Array.from({ length: MAX_REQUESTS_PER_BATCH + 1 }, (_, i) =>
      request({ customId: `c_${i}` }),
    );
    expect(() => validateRequests(many)).toThrow(/상한/);
  });

  it("빈 system·user와 모르는 필드(temperature)를 거부한다", () => {
    expect(() => validateRequests([request({ system: "" })])).toThrow(/system/);
    expect(() => validateRequests([request({ user: "" })])).toThrow(/user/);
    const withTemperature = { ...request(), temperature: 0 } as LlmRequest;
    expect(() => validateRequests([withTemperature])).toThrow(LlmRequestError);
  });

  it("오류 메시지에 프롬프트 본문을 넣지 않는다", () => {
    try {
      validateRequests([
        request({
          system: "SYSTEM_MARKER_TEXT",
          user: "USER_MARKER_TEXT",
          maxTokens: 0,
        }),
      ]);
      throw new Error("던져야 한다");
    } catch (error) {
      expect(error).toBeInstanceOf(LlmRequestError);
      const text = String((error as Error).message);
      expect(text).not.toContain("SYSTEM_MARKER_TEXT");
      expect(text).not.toContain("USER_MARKER_TEXT");
      expect((error as LlmRequestError).problems).toHaveLength(1);
    }
  });
});

describe("buildMessageParams", () => {
  it("system 블록·user 메시지·max_tokens를 만들고 선택 항목은 생략한다", () => {
    const params = buildMessageParams(request(), DEFAULT_LLM_MODEL);
    expect(params).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 600,
      system: [{ type: "text", text: "고정 지시문" }],
      messages: [
        { role: "user", content: "Title: Sample United win\nSummary: sample" },
      ],
    });
    expect(params).not.toHaveProperty("temperature");
  });

  it("cacheSystem이면 system 블록에 ephemeral cache_control을 붙인다", () => {
    const params = buildMessageParams(request({ cacheSystem: true }), "m");
    expect(params.system).toEqual([
      {
        type: "text",
        text: "고정 지시문",
        cache_control: { type: "ephemeral" },
      },
    ]);
  });

  it("effort·thinking을 output_config·thinking으로 옮긴다", () => {
    const params = buildMessageParams(
      request({ effort: "low", thinking: "disabled" }),
      "m",
    );
    expect(params.output_config).toEqual({ effort: "low" });
    expect(params.thinking).toEqual({ type: "disabled" });
  });
});

// ─── usage ───────────────────────────────────────────────────────────────

describe("usage 집계", () => {
  it("API usage를 RunLog.tokens 형태로 바꾸고 null 캐시 필드는 0으로 둔다", () => {
    expect(
      toTokenUsage({
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: null,
        cache_creation_input_tokens: null,
      }),
    ).toEqual({ in: 10, out: 20, cacheRead: 0, cacheWrite: 0 });
    expect(
      toTokenUsage({
        input_tokens: 1,
        output_tokens: 2,
        cache_read_input_tokens: 3,
        cache_creation_input_tokens: 4,
      }),
    ).toEqual({ in: 1, out: 2, cacheRead: 3, cacheWrite: 4 });
  });

  it("addTokenUsage는 필드별로 더한다", () => {
    expect(
      addTokenUsage(
        { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 },
        { in: 10, out: 20, cacheRead: 30, cacheWrite: 40 },
      ),
    ).toEqual({ in: 11, out: 22, cacheRead: 33, cacheWrite: 44 });
  });

  it("summarizeUsage는 배치·단건을 나눠 합산하고 total을 낸다", () => {
    const summary = summarizeUsage([
      {
        batch: true,
        usage: { in: 100, out: 50, cacheRead: 600, cacheWrite: 0 },
      },
      {
        batch: true,
        usage: { in: 120, out: 60, cacheRead: 600, cacheWrite: 0 },
      },
      { batch: true, usage: { ...ZERO_USAGE } },
      {
        batch: false,
        usage: { in: 300, out: 150, cacheRead: 0, cacheWrite: 700 },
      },
    ]);
    expect(summary.batch).toEqual({
      in: 220,
      out: 110,
      cacheRead: 1200,
      cacheWrite: 0,
    });
    expect(summary.single).toEqual({
      in: 300,
      out: 150,
      cacheRead: 0,
      cacheWrite: 700,
    });
    expect(summary.total).toEqual({
      in: 520,
      out: 260,
      cacheRead: 1200,
      cacheWrite: 700,
    });
    expect(summary.requests).toEqual({ batch: 3, single: 1 });
  });

  it("빈 목록은 0", () => {
    const summary = summarizeUsage([]);
    expect(summary.total).toEqual(ZERO_USAGE);
    expect(summary.requests).toEqual({ batch: 0, single: 0 });
  });
});

// ─── 결과 변환 ───────────────────────────────────────────────────────────

describe("messageToResult · batchEntryToResult", () => {
  it("thinking 블록을 건너뛰고 text 블록을 이어 붙인다", () => {
    const result = unwrapOk(
      messageToResult(
        "c_1",
        {
          content: [
            { type: "thinking" },
            { type: "text", text: '{"a":' },
            { type: "text", text: "1}" },
          ],
          stop_reason: "end_turn",
          usage: {
            input_tokens: 10,
            output_tokens: 40,
            output_tokens_details: { thinking_tokens: 25 },
          },
        },
        false,
      ),
    );
    expect(result.text).toBe('{"a":1}');
    expect(result.thinkingTokens).toBe(25);
    expect(result.usage).toEqual({
      in: 10,
      out: 40,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(result.batch).toBe(false);
  });

  it("refusal·max_tokens·빈 출력은 실패지만 usage(과금)는 남긴다", () => {
    const refusal = unwrapFail(
      messageToResult("c_1", message("", { stop_reason: "refusal" }), true),
    );
    expect(refusal.errorType).toBe("refusal");
    expect(refusal.retryable).toBe(false);
    expect(refusal.usage.out).toBe(100);

    const truncated = unwrapFail(
      messageToResult(
        "c_1",
        message('{"a":', { stop_reason: "max_tokens" }),
        true,
      ),
    );
    expect(truncated.errorType).toBe("max_tokens");
    expect(truncated.usage.in).toBe(200);

    const empty = unwrapFail(messageToResult("c_1", message("  "), true));
    expect(empty.errorType).toBe("empty_output");
  });

  it("errored는 API 오류 type을 살리고 과금 0, 재시도 힌트를 단다", () => {
    const invalid = unwrapFail(
      batchEntryToResult({
        custom_id: "c_1",
        result: {
          type: "errored",
          error: { error: { type: "invalid_request_error", message: "bad" } },
        },
      }),
    );
    expect(invalid).toMatchObject({
      errorType: "invalid_request_error",
      retryable: false,
      batch: true,
    });
    expect(invalid.usage).toEqual(ZERO_USAGE);

    const server = unwrapFail(
      batchEntryToResult({
        custom_id: "c_2",
        result: {
          type: "errored",
          error: { error: { type: "api_error", message: "oops" } },
        },
      }),
    );
    expect(server).toMatchObject({ errorType: "api_error", retryable: true });

    const unknown = unwrapFail(
      batchEntryToResult({
        custom_id: "c_3",
        result: {
          type: "errored",
          error: { error: { type: "brand_new_error", message: "?" } },
        },
      }),
    );
    expect(unknown.errorType).toBe("api_error");
  });

  it("canceled·expired는 과금 0, 재시도 가능", () => {
    for (const type of ["canceled", "expired"] as const) {
      const result = unwrapFail(
        batchEntryToResult({ custom_id: "c_1", result: { type } }),
      );
      expect(result).toMatchObject({ errorType: type, retryable: true });
      expect(result.usage).toEqual(ZERO_USAGE);
    }
  });

  it("normalizeErrorType은 모르는 type을 HTTP 상태로 추정한다", () => {
    expect(normalizeErrorType("overloaded_error")).toBe("overloaded_error");
    expect(normalizeErrorType(undefined, 529)).toBe("overloaded_error");
    expect(normalizeErrorType(null, 429)).toBe("rate_limit_error");
    expect(normalizeErrorType("weird", 503)).toBe("api_error");
    // 상태 없이 서버가 준 type만 있으면(배치 errored 결과) 응답은 받은 것이므로 api_error
    expect(normalizeErrorType("weird")).toBe("api_error");
    expect(normalizeErrorType(undefined, undefined)).toBe("connection_error");
  });
});

// ─── 배치 ────────────────────────────────────────────────────────────────

describe("배치: 제출 → 폴링 → 결과", () => {
  it("진행 중 → 완료 후 결과를 요청 순서대로 돌려주고 usage를 배치로 합산한다", async () => {
    const { transport, calls } = fakeTransport({
      retrieve: [
        batch("in_progress", { processing: 2 }),
        batch("in_progress", { processing: 2 }),
        batch("ended", { succeeded: 2 }),
      ],
      // 결과는 입력 순서와 다르게 온다
      results: [
        succeeded("c_b", '{"b":1}', { input_tokens: 300, output_tokens: 120 }),
        succeeded("c_a", '{"a":1}'),
      ],
    });
    const { client, sleeps } = harness(transport);
    const outcome = await client.runBatch(
      [
        request({ customId: "c_a", cacheSystem: true }),
        request({ customId: "c_b" }),
      ],
      { deadline: DEADLINE },
    );

    expect(outcome.timedOut).toBe(false);
    if (outcome.timedOut) return;
    expect(outcome.state).toBe("ended");
    expect([...outcome.results.keys()]).toEqual(["c_a", "c_b"]);
    expect(unwrapOk(outcome.results.get("c_a")).text).toBe('{"a":1}');
    expect(unwrapOk(outcome.results.get("c_b")).batch).toBe(true);
    expect(outcome.usage.batch).toEqual({
      in: 500,
      out: 220,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(outcome.usage.single).toEqual(ZERO_USAGE);

    expect(sleeps).toEqual([
      DEFAULT_POLL_INTERVAL_MS,
      DEFAULT_POLL_INTERVAL_MS,
    ]);
    expect(calls.retrieve).toBe(3);
    expect(calls.createBatch).toHaveLength(1);
    const [first] = calls.createBatch[0] ?? [];
    expect(first?.custom_id).toBe("c_a");
    expect(first?.params.model).toBe(DEFAULT_LLM_MODEL);
    expect(first?.params.system).toEqual([
      {
        type: "text",
        text: "고정 지시문",
        cache_control: { type: "ephemeral" },
      },
    ]);
  });

  it("errored·canceled·expired·누락 결과를 각각 실패로 돌려준다", async () => {
    const { transport } = fakeTransport({
      retrieve: [batch("ended", { succeeded: 1, errored: 1, expired: 1 })],
      results: [
        succeeded("c_ok"),
        {
          custom_id: "c_err",
          result: {
            type: "errored",
            error: { error: { type: "invalid_request_error", message: "bad" } },
          },
        },
        { custom_id: "c_exp", result: { type: "expired" } },
        { custom_id: "c_stranger", result: { type: "canceled" } },
      ],
    });
    const { client, logs } = harness(transport);
    const outcome = await client.runBatch(
      ["c_ok", "c_err", "c_exp", "c_missing"].map((customId) =>
        request({ customId }),
      ),
      { deadline: DEADLINE },
    );
    if (outcome.timedOut) throw new Error("timedOut이면 안 된다");
    expect(outcome.results.size).toBe(4);
    expect(outcome.results.get("c_ok")?.ok).toBe(true);
    expect(unwrapFail(outcome.results.get("c_err")).errorType).toBe(
      "invalid_request_error",
    );
    expect(unwrapFail(outcome.results.get("c_exp")).errorType).toBe("expired");
    expect(unwrapFail(outcome.results.get("c_missing")).errorType).toBe(
      "missing_result",
    );
    expect(outcome.results.has("c_stranger")).toBe(false);
    expect(
      logs.some((event) => event.stage === "batch.results.unexpected"),
    ).toBe(true);
    expect(outcome.usage.requests.batch).toBe(4);
  });

  it("모든 요청이 만료된 배치는 state expired", async () => {
    const { transport } = fakeTransport({
      retrieve: [batch("ended", { expired: 1 })],
      results: [{ custom_id: "c_0123456789", result: { type: "expired" } }],
    });
    const { client } = harness(transport);
    const polled = await client.pollBatch("msgbatch_test", {
      deadline: DEADLINE,
    });
    expect(polled.state).toBe("expired");
    const outcome = await client.runBatch([request()], { deadline: DEADLINE });
    if (outcome.timedOut) throw new Error("timedOut이면 안 된다");
    expect(outcome.state).toBe("expired");
    expect(outcome.usage.total).toEqual(ZERO_USAGE);
  });

  it("마감까지 끝나지 않으면 timedOut — 마감을 넘겨 기다리지 않고 결과를 받지 않는다", async () => {
    const { transport, calls } = fakeTransport({
      retrieve: [batch("in_progress", { processing: 1 })],
    });
    const { client, sleeps, logs } = harness(transport);
    const deadline = new Date(START + 70_000);
    const outcome = await client.runBatch([request()], { deadline });
    expect(outcome).toMatchObject({ timedOut: true, batchId: "msgbatch_test" });
    if (!outcome.timedOut) return;
    expect(outcome.snapshot?.status).toBe("in_progress");
    expect(sleeps).toEqual([30_000, 30_000, 10_000]);
    expect(calls.retrieve).toBe(4);
    expect(calls.results).toBe(0);
    expect(calls.cancel).toBe(0);
    expect(logs.at(-1)?.stage).toBe("batch.deadline");
  });

  it("조회 간격은 최솟값 아래로 내려가지 않는다", async () => {
    const { transport } = fakeTransport({
      retrieve: [batch("in_progress"), batch("ended", { succeeded: 1 })],
    });
    const { client, sleeps } = harness(transport);
    await client.pollBatch("msgbatch_test", {
      deadline: DEADLINE,
      intervalMs: 10,
    });
    expect(sleeps).toEqual([MIN_POLL_INTERVAL_MS]);
  });

  it("조회 중 일시 오류(529·연결)는 기록하고 계속 조회한다", async () => {
    const { transport } = fakeTransport({
      retrieve: [
        overloaded(),
        connectionError(),
        batch("ended", { succeeded: 1 }),
      ],
    });
    const { client, logs } = harness(transport);
    const polled = await client.pollBatch("msgbatch_test", {
      deadline: DEADLINE,
    });
    expect(polled.state).toBe("ended");
    expect(
      logs.filter((event) => event.stage === "batch.poll.error"),
    ).toHaveLength(2);
  });

  it("조회 중 영구 오류(401)는 던진다", async () => {
    const { transport } = fakeTransport({
      retrieve: [
        new LlmTransportError({ status: 401, message: "unauthorized" }),
      ],
    });
    const { client } = harness(transport);
    await expect(
      client.pollBatch("msgbatch_test", { deadline: DEADLINE }),
    ).rejects.toMatchObject({
      errorType: "authentication_error",
    });
  });

  it("마감 직전 조회가 모두 실패하면 snapshot null로 돌아온다", async () => {
    const { transport } = fakeTransport({ retrieve: [overloaded()] });
    const { client } = harness(transport);
    const polled = await client.pollBatch("msgbatch_test", {
      deadline: new Date(START + 10_000),
    });
    expect(polled).toEqual({ state: "deadline", snapshot: null });
  });

  it("제출 429·529는 재시도하고, 연결 오류는 중복 제출 위험 때문에 재시도하지 않는다", async () => {
    const retried = fakeTransport({
      createBatchErrors: [overloaded()],
      retrieve: [batch("ended", { succeeded: 1 })],
      results: [succeeded("c_0123456789")],
    });
    const first = harness(retried.transport);
    const outcome = await first.client.runBatch([request()], {
      deadline: DEADLINE,
    });
    expect(outcome.timedOut).toBe(false);
    expect(retried.calls.createBatch).toHaveLength(2);
    expect(first.sleeps[0]).toBe(DEFAULT_RETRY_POLICY.baseDelayMs);

    const dropped = fakeTransport({ createBatchErrors: [connectionError()] });
    const second = harness(dropped.transport);
    await expect(second.client.submitBatch([request()])).rejects.toMatchObject({
      errorType: "connection_error",
    });
    expect(dropped.calls.createBatch).toHaveLength(1);
  });

  it("마감이 이미 지났으면 제출하지 않는다", async () => {
    const { transport, calls } = fakeTransport();
    const { client } = harness(transport);
    await expect(
      client.runBatch([request()], { deadline: new Date(START) }),
    ).rejects.toThrow(LlmRequestError);
    expect(calls.createBatch).toHaveLength(0);
  });

  it("잘못된 요청은 제출 전에 막는다", async () => {
    const { transport, calls } = fakeTransport();
    const { client } = harness(transport);
    await expect(
      client.submitBatch([request({ customId: "bad id" })]),
    ).rejects.toThrow(LlmRequestError);
    expect(calls.createBatch).toHaveLength(0);
  });

  it("결과 수거는 연결 오류도 재시도한다(읽기)", async () => {
    const { transport, calls } = fakeTransport({
      retrieve: [batch("ended", { succeeded: 1 })],
      resultsErrors: [connectionError()],
      results: [succeeded("c_0123456789")],
    });
    const { client } = harness(transport);
    const results = await client.collectBatchResults("msgbatch_test");
    expect(results.get("c_0123456789")?.ok).toBe(true);
    expect(calls.results).toBe(2);
  });

  it("결과 수거가 끝내 실패하면 runBatch는 던지지 않고 전부 missing_result로 돌려준다", async () => {
    const { transport } = fakeTransport({
      retrieve: [batch("ended", { succeeded: 2 })],
      resultsErrors: [overloaded(), overloaded(), overloaded()],
    });
    const { client, logs } = harness(transport);
    const outcome = await client.runBatch(
      [request({ customId: "c_1" }), request({ customId: "c_2" })],
      { deadline: DEADLINE },
    );
    if (outcome.timedOut) throw new Error("timedOut이면 안 된다");
    for (const result of outcome.results.values()) {
      const failed = unwrapFail(result);
      expect(failed.errorType).toBe("missing_result");
      expect(failed.message).toContain("batchId");
    }
    expect(logs.some((event) => event.stage === "batch.results.error")).toBe(
      true,
    );
  });

  it("cancelBatch는 상태 스냅숏을 돌려준다", async () => {
    const { transport, calls } = fakeTransport();
    const { client } = harness(transport);
    const snapshot = await client.cancelBatch("msgbatch_test");
    expect(snapshot.status).toBe("canceling");
    expect(calls.cancel).toBe(1);
  });
});

// ─── 단건 ────────────────────────────────────────────────────────────────

describe("callSingle (일일 브리핑 단건 일반 API — D28)", () => {
  it("429를 지수 백오프로 재시도해 성공한다", async () => {
    const { transport, calls } = fakeTransport({
      messages: [rateLimited(), rateLimited(), message('{"ok":1}')],
    });
    const { client, sleeps, logs } = harness(transport);
    const result = unwrapOk(await client.callSingle(request()));
    expect(result.text).toBe('{"ok":1}');
    expect(result.batch).toBe(false);
    expect(calls.messages).toHaveLength(3);
    expect(sleeps).toEqual([1_000, 2_000]);
    expect(logs.find((event) => event.stage === "single.done")).toMatchObject({
      ok: true,
      attempts: 3,
    });
  });

  it("retry-after 헤더가 더 길면 그만큼 기다린다", async () => {
    const { transport } = fakeTransport({
      messages: [rateLimited(5_000), message("{}")],
    });
    const { client, sleeps } = harness(transport);
    await client.callSingle(request());
    expect(sleeps).toEqual([5_000]);
  });

  it("400은 재시도하지 않고 실패 결과로 돌려준다", async () => {
    const { transport, calls } = fakeTransport({ messages: [badRequest()] });
    const { client, sleeps } = harness(transport);
    const result = unwrapFail(await client.callSingle(request()));
    expect(result).toMatchObject({
      errorType: "invalid_request_error",
      retryable: false,
      batch: false,
    });
    expect(result.usage).toEqual(ZERO_USAGE);
    expect(calls.messages).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("529가 계속되면 최대 재시도 후 실패(재시도 가능 힌트)로 돌려준다", async () => {
    const { transport, calls } = fakeTransport({ messages: [overloaded()] });
    const { client, sleeps } = harness(transport);
    const result = unwrapFail(await client.callSingle(request()));
    expect(result).toMatchObject({
      errorType: "overloaded_error",
      retryable: true,
    });
    expect(calls.messages).toHaveLength(1 + DEFAULT_RETRY_POLICY.maxRetries);
    expect(sleeps).toEqual([1_000, 2_000]);
  });

  it("연결 오류·타임아웃은 중복 과금 위험 때문에 재시도하지 않고, 결과의 retryable 힌트도 false다(M0-36 ② → M1-45)", async () => {
    const { transport, calls } = fakeTransport({
      messages: [connectionError()],
    });
    const { client } = harness(transport);
    const result = unwrapFail(await client.callSingle(request()));
    expect(result.errorType).toBe("connection_error");
    expect(result.retryable).toBe(false);
    expect(isRetryableErrorType("connection_error")).toBe(false);
    expect(calls.messages).toHaveLength(1);
  });

  it("마감이 있으면 요청마다 타임아웃 = min(requestTimeoutMs, 마감 − 현재) — 재시도 대기 뒤 요청은 그만큼 줄어든다(M0-36 ① → M1-45)", async () => {
    const { transport, calls } = fakeTransport({
      messages: [overloaded(), message("{}")],
    });
    const { client, sleeps, logs } = harness(transport);
    const result = await client.callSingle(request(), {
      deadline: new Date(START + 10_000),
    });
    expect(result.ok).toBe(true);
    expect(sleeps).toEqual([1_000]);
    expect(calls.messages.map((c) => c.timeoutMs)).toEqual([10_000, 9_000]);
    expect(logs.find((l) => l.stage === "single.done")).toMatchObject({
      attempts: 2,
      timeoutMs: 9_000,
    });
  });

  it("마감이 멀면 상한 그대로(기본 60초·requestTimeoutMs), 마감이 없으면 transport 기본 타임아웃(요청 옵션 없음)", async () => {
    const far = new Date(START + 10 * 60_000);
    const run = async (
      options: Parameters<LlmClient["callSingle"]>[1],
      over: Partial<LlmClientOptions> = {},
    ) => {
      const { transport, calls } = fakeTransport({ messages: [message("{}")] });
      const { client } = harness(transport, over);
      await client.callSingle(request(), options);
      return calls.messages.map((c) => c.timeoutMs);
    };
    // 다른 경로(배치·요청별 상한 없는 단건)의 기본값은 60초 그대로(D57은 브리핑 요청별 상한만 120초)
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(60_000);
    expect(await run({ deadline: far })).toEqual([DEFAULT_REQUEST_TIMEOUT_MS]);
    expect(await run({ deadline: far }, { requestTimeoutMs: 20_000 })).toEqual([
      20_000,
    ]);
    expect(await run(undefined)).toEqual([undefined]);
  });

  it("요청별 상한 requestTimeoutMs(D57 — 브리핑 120초)는 클라이언트 상한보다 우선하고, 마감이 있으면 min(상한, 마감 − 현재), 마감이 없어도 transport에 넘긴다", async () => {
    const run = async (
      options: Parameters<LlmClient["callSingle"]>[1],
      over: Partial<LlmClientOptions> = {},
    ) => {
      const { transport, calls } = fakeTransport({ messages: [message("{}")] });
      const { client, logs } = harness(transport, over);
      await client.callSingle(request(), options);
      return {
        timeouts: calls.messages.map((c) => c.timeoutMs),
        logged: logs.find((l) => l.stage === "single.done")?.timeoutMs,
      };
    };
    const far = new Date(START + 10 * 60_000);
    // 마감이 멀면 요청별 상한 그대로(기본 60초가 아니라 120초)
    expect(
      await run({ deadline: far, requestTimeoutMs: BRIEF_REQUEST_TIMEOUT_MS }),
    ).toEqual({ timeouts: [120_000], logged: 120_000 });
    // 클라이언트 옵션(20초)보다 요청별 옵션이 우선
    expect(
      (
        await run(
          { deadline: far, requestTimeoutMs: 120_000 },
          { requestTimeoutMs: 20_000 },
        )
      ).timeouts,
    ).toEqual([120_000]);
    // 마감까지 90초 — 60초 상한이면 60초였을 요청이 90초를 받는다
    expect(
      (await run({ budgetMs: 90_000, requestTimeoutMs: 120_000 })).timeouts,
    ).toEqual([90_000]);
    // 마감까지 45초 — 마감이 줄인다
    expect(
      (await run({ budgetMs: 45_000, requestTimeoutMs: 120_000 })).timeouts,
    ).toEqual([45_000]);
    // 마감 없음(eval) — 클라이언트 기본(60초)에 걸리지 않게 요청마다 넘긴다
    expect((await run({ requestTimeoutMs: 120_000 })).timeouts).toEqual([
      120_000,
    ]);
    // 요청별 상한이 없으면 그 전과 같다(마감 없음 → 요청 옵션 없음)
    expect((await run({})).timeouts).toEqual([undefined]);
  });

  it("요청별 상한이 양의 정수가 아니면 보내지 않고 던진다(호출부 버그)", async () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { transport, calls } = fakeTransport({ messages: [message("{}")] });
      const { client } = harness(transport);
      await expect(
        client.callSingle(request(), { requestTimeoutMs: bad }),
      ).rejects.toThrow(LlmRequestError);
      expect(calls.messages).toHaveLength(0);
    }
  });

  it("요청별 상한 120초에서도 마감으로 줄인 타임아웃에 끊긴 연결 오류만 deadlineCut — 120초 상한 그대로 끊긴 것은 아님", async () => {
    const run = async (budgetMs: number, advanceMs: number) => {
      const clock = { t: START };
      const transport: LlmTransport = {
        ...fakeTransport().transport,
        async createMessage() {
          clock.t += advanceMs;
          throw connectionError();
        },
      };
      const client = createLlmClient({
        mode: "live",
        env: {},
        transport,
        now: () => clock.t,
        sleep: async () => undefined,
        logger: () => undefined,
      });
      return unwrapFail(
        await client.callSingle(request(), {
          budgetMs,
          requestTimeoutMs: BRIEF_REQUEST_TIMEOUT_MS,
        }),
      );
    };
    // 남은 90초(타임아웃 90초로 줄어듦 — 60초 상한 때는 60초) — 90초에 끊김 = 마감 강등
    expect((await run(90_000, 90_000)).deadlineCut).toBe(true);
    // 남은 10분 — 상한 120초에 끊긴 것은 마감 때문이 아니다(응답 지연 — 브리핑 실패)
    expect((await run(600_000, 120_000)).deadlineCut).toBeUndefined();
  });

  it("상대 마감 budgetMs = 호출 시작 + budgetMs(클라이언트 시계), deadline과 함께면 이른 쪽", async () => {
    const run = async (options: Parameters<LlmClient["callSingle"]>[1]) => {
      const { transport, calls } = fakeTransport({ messages: [message("{}")] });
      const { client } = harness(transport);
      await client.callSingle(request(), options);
      return calls.messages.map((c) => c.timeoutMs);
    };
    expect(await run({ budgetMs: 5_000 })).toEqual([5_000]);
    expect(
      await run({ budgetMs: 5_000, deadline: new Date(START + 3_000) }),
    ).toEqual([3_000]);
    expect(
      await run({ budgetMs: 90_000, deadline: new Date(START + 120_000) }),
    ).toEqual([DEFAULT_REQUEST_TIMEOUT_MS]);
  });

  it("남은 시간이 minAttemptMs보다 짧거나 마감이 지났으면 보내지 않고 deadline 실패(과금 0, retryable false)", async () => {
    for (const options of [
      { deadline: new Date(START + 20_000), minAttemptMs: 30_000 },
      { deadline: new Date(START - 1) },
      { budgetMs: 0 },
    ]) {
      const { transport, calls } = fakeTransport({ messages: [message("{}")] });
      const { client, logs } = harness(transport);
      const result = unwrapFail(await client.callSingle(request(), options));
      expect(result).toMatchObject({
        errorType: "deadline",
        retryable: false,
        batch: false,
      });
      expect(result.usage).toEqual(ZERO_USAGE);
      expect(calls.messages).toHaveLength(0);
      expect(logs.some((l) => l.stage === "single.deadline")).toBe(true);
    }
  });

  it("마감으로 줄인 타임아웃에 마감 1초 안에서 끊긴 연결 오류는 deadlineCut(호출부 마감 강등) — 상한 타임아웃·마감 전 연결 오류는 아님", async () => {
    // 가짜 transport가 요청마다 시계를 민 뒤 연결 오류를 던진다(타임아웃 흉내)
    const run = async (budgetMs: number, advanceMs: number) => {
      const clock = { t: START };
      const transport: LlmTransport = {
        ...fakeTransport().transport,
        async createMessage() {
          clock.t += advanceMs;
          throw connectionError();
        },
      };
      const client = createLlmClient({
        mode: "live",
        env: {},
        transport,
        now: () => clock.t,
        sleep: async () => undefined,
        logger: () => undefined,
      });
      return unwrapFail(await client.callSingle(request(), { budgetMs }));
    };
    // 남은 45초(타임아웃 45초로 줄어듦) — 45초에 끊김, 타이머가 몇 ms 일찍 울린 경우도
    expect((await run(45_000, 45_000)).deadlineCut).toBe(true);
    expect((await run(45_000, 44_996)).deadlineCut).toBe(true);
    // 마감 한참 전 연결 오류(10초에 끊김) — 마감 강등이 아니다
    expect((await run(45_000, 10_000)).deadlineCut).toBeUndefined();
    // 남은 10분(타임아웃은 상한 60초 그대로) — 60초에 끊긴 것은 마감 때문이 아니다
    expect((await run(600_000, 60_000)).deadlineCut).toBeUndefined();
    expect(DEADLINE_CUT_SLACK_MS).toBe(1_000);
  });

  it("429·5xx 재시도는 (대기 + minAttemptMs)가 마감 안일 때만 — 아니면 마지막 실패를 돌려준다", async () => {
    // 남은 30.5초: 1초 대기 + 30초 > 30.5초 → 재시도 없음
    const tight = fakeTransport({ messages: [overloaded()] });
    const a = harness(tight.transport);
    const first = unwrapFail(
      await a.client.callSingle(request(), {
        deadline: new Date(START + 30_500),
        minAttemptMs: 30_000,
      }),
    );
    expect(first.errorType).toBe("overloaded_error");
    expect(tight.calls.messages).toHaveLength(1);
    expect(a.sleeps).toEqual([]);
    // 남은 32초: 1초 대기 뒤 1회(31초 < 32초), 다음 2초 대기는 33초 > 32초라 멈춘다
    const roomy = fakeTransport({ messages: [overloaded()] });
    const b = harness(roomy.transport);
    await b.client.callSingle(request(), {
      deadline: new Date(START + 32_000),
      minAttemptMs: 30_000,
    });
    expect(roomy.calls.messages.map((c) => c.timeoutMs)).toEqual([
      32_000, 31_000,
    ]);
    expect(b.sleeps).toEqual([1_000]);
  });

  it("재시도 대기가 마감을 넘기면 더 기다리지 않는다", async () => {
    const { transport, calls } = fakeTransport({ messages: [overloaded()] });
    const { client, sleeps } = harness(transport);
    const result = await client.callSingle(request(), {
      deadline: new Date(START + 1_500),
    });
    expect(result.ok).toBe(false);
    expect(calls.messages).toHaveLength(2);
    expect(sleeps).toEqual([1_000]);
  });

  it("재시도 횟수는 옵션으로 바꿀 수 있다", async () => {
    const { transport, calls } = fakeTransport({ messages: [overloaded()] });
    const { client } = harness(transport, { retry: { maxRetries: 0 } });
    await client.callSingle(request());
    expect(calls.messages).toHaveLength(1);
  });

  it("전송 계층 오류가 아닌 예외(버그)는 그대로 던진다", async () => {
    const { transport } = fakeTransport({ messages: [new TypeError("boom")] });
    const { client } = harness(transport);
    await expect(client.callSingle(request())).rejects.toThrow(TypeError);
  });

  it("모델은 LLM_MODEL을 따르고 요청 파라미터에 실린다", async () => {
    const { transport, calls } = fakeTransport({ messages: [message("{}")] });
    const { client } = harness(transport, {
      env: { LLM_MODEL: "claude-test-model" },
    });
    await client.callSingle(request());
    expect(client.model).toBe("claude-test-model");
    expect(calls.messages[0]?.params.model).toBe("claude-test-model");
    expect(calls.messages[0]?.customId).toBe("c_0123456789");
  });
});

describe("backoffDelayMs · parseRetryAfterMs", () => {
  it("지수 백오프·retry-after·상한", () => {
    expect(backoffDelayMs(1, DEFAULT_RETRY_POLICY)).toBe(1_000);
    expect(backoffDelayMs(2, DEFAULT_RETRY_POLICY)).toBe(2_000);
    expect(backoffDelayMs(3, DEFAULT_RETRY_POLICY)).toBe(4_000);
    expect(backoffDelayMs(1, DEFAULT_RETRY_POLICY, 7_000)).toBe(7_000);
    expect(backoffDelayMs(10, DEFAULT_RETRY_POLICY)).toBe(
      DEFAULT_RETRY_POLICY.maxDelayMs,
    );
    expect(backoffDelayMs(1, DEFAULT_RETRY_POLICY, 120_000)).toBe(
      DEFAULT_RETRY_POLICY.maxDelayMs,
    );
  });

  it("retry-after 초 단위만 읽는다", () => {
    expect(parseRetryAfterMs("3")).toBe(3_000);
    expect(parseRetryAfterMs("0.5")).toBe(500);
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT")).toBeUndefined();
    expect(parseRetryAfterMs("-1")).toBeUndefined();
  });

  it("LlmTransportError.retryable은 429·5xx만", () => {
    expect(rateLimited().retryable).toBe(true);
    expect(overloaded().retryable).toBe(true);
    expect(new LlmTransportError({ status: 500, message: "x" }).retryable).toBe(
      true,
    );
    expect(badRequest().retryable).toBe(false);
    expect(connectionError().retryable).toBe(false);
  });

  it("LlmTransportError는 긴 메시지를 한 줄 300자로 자른다", () => {
    const error = new LlmTransportError({
      status: 500,
      message: `a\n${"b".repeat(1000)}`,
    });
    expect(error.message.length).toBeLessThanOrEqual(301);
    expect(error.message).not.toContain("\n");
  });
});

// ─── mock 모드 ───────────────────────────────────────────────────────────

describe("mock 모드 (fixtures/llm/mock)", () => {
  const tempDirs: string[] = [];
  afterEach(() => {
    for (const dir of tempDirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  function tempMockDir(files: Record<string, unknown>): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), "llm-mock-"));
    tempDirs.push(dir);
    for (const [relative, content] of Object.entries(files)) {
      const file = path.join(dir, relative);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(
        file,
        typeof content === "string" ? content : JSON.stringify(content),
      );
    }
    return dir;
  }

  const quiet = { logger: () => {} };

  it("Vitest에서는 LLM_MODE=mock이 강제되어 옵션 없이 만들면 mock 클라이언트가 된다", () => {
    expect(process.env.LLM_MODE).toBe("mock");
    expect(createLlmClient(quiet).mode).toBe("mock");
  });

  it("customId(by-id) fixture를 찾고 기록된 usage를 쓴다", async () => {
    const client = createLlmClient({
      mode: "mock",
      mockDir: REPO_MOCK_DIR,
      ...quiet,
    });
    const result = unwrapOk(
      await client.callSingle(request({ customId: "m0_sample_ok" })),
    );
    expect(JSON.parse(result.text)).toEqual({
      sample: true,
      team: "sample-united",
    });
    expect(result.usage).toEqual({
      in: 250,
      out: 150,
      cacheRead: 600,
      cacheWrite: 0,
    });
    expect(result.batch).toBe(false);
  });

  it("errored fixture는 단건 호출에서 실패 결과가 된다", async () => {
    const client = createLlmClient({
      mode: "mock",
      mockDir: REPO_MOCK_DIR,
      ...quiet,
    });
    const result = unwrapFail(
      await client.callSingle(request({ customId: "m0_sample_errored" })),
    );
    expect(result).toMatchObject({
      errorType: "invalid_request_error",
      retryable: false,
    });
  });

  it("runBatch를 fixture로 끝까지 돌리고 usage를 배치로 합산한다", async () => {
    const client = createLlmClient({
      mode: "mock",
      mockDir: REPO_MOCK_DIR,
      ...quiet,
    });
    const outcome = await client.runBatch(
      [
        request({ customId: "m0_sample_ok" }),
        request({ customId: "m0_sample_errored" }),
      ],
      { deadline: new Date(Date.now() + 60_000) },
    );
    if (outcome.timedOut) throw new Error("mock 배치는 즉시 끝나야 한다");
    expect(outcome.state).toBe("ended");
    expect(outcome.batchId).toBe("mock_batch_1");
    expect(outcome.results.get("m0_sample_ok")?.ok).toBe(true);
    expect(unwrapFail(outcome.results.get("m0_sample_errored")).usage).toEqual(
      ZERO_USAGE,
    );
    expect(outcome.usage.batch).toEqual({
      in: 250,
      out: 150,
      cacheRead: 600,
      cacheWrite: 0,
    });
    expect(outcome.usage.requests).toEqual({ batch: 2, single: 0 });
  });

  it("customId로 못 찾으면 요청 해시(by-hash)로 찾고, usage가 없으면 0", async () => {
    const req = request({ customId: "c_aaaaaaaaaa" });
    const dir = tempMockDir({
      [`by-hash/${mockRequestKey(req)}.json`]: {
        type: "succeeded",
        text: "hash-hit",
      },
    });
    const client = createLlmClient({ mode: "mock", mockDir: dir, ...quiet });
    const result = unwrapOk(await client.callSingle(req));
    expect(result.text).toBe("hash-hit");
    expect(result.usage).toEqual(ZERO_USAGE);
    // 같은 내용이면 customId·maxTokens가 달라도 같은 fixture
    const again = await client.callSingle({
      ...req,
      customId: "c_bbbbbbbbbb",
      maxTokens: 300,
    });
    expect(again.ok).toBe(true);
  });

  it("mockRequestKey는 system·user에만 의존하는 결정적 키", () => {
    const key = mockRequestKey(request());
    expect(key).toMatch(/^h_[0-9a-f]{16}$/);
    expect(mockRequestKey(request({ customId: "other", maxTokens: 1 }))).toBe(
      key,
    );
    expect(mockRequestKey(request({ user: "다른 입력" }))).not.toBe(key);
    expect(mockRequestKey({ system: "a", user: "bc" })).not.toBe(
      mockRequestKey({ system: "ab", user: "c" }),
    );
  });

  it("fixture가 없으면 찾아본 경로를 담아 바로 던진다", async () => {
    const dir = tempMockDir({});
    const client = createLlmClient({ mode: "mock", mockDir: dir, ...quiet });
    await expect(
      client.callSingle(request({ customId: "c_missing" })),
    ).rejects.toThrow(LlmMockFixtureError);
    await expect(
      client.callSingle(request({ customId: "c_missing" })),
    ).rejects.toThrow(
      /by-id[\\/]c_missing\.json.*by-hash[\\/]h_[0-9a-f]{16}\.json/,
    );
    await expect(
      client.runBatch(
        [
          request({ customId: "c_x1" }),
          request({ customId: "c_x2", user: "다른 기사" }),
        ],
        { deadline: new Date(Date.now() + 60_000) },
      ),
    ).rejects.toThrow(/fixture 없음 \(2건\)/);
  });

  it("형식이 틀린 fixture는 파일 경로와 함께 던진다", async () => {
    const dir = tempMockDir({
      "by-id/c_bad.json": { type: "succeeded" },
      "by-id/c_broken.json": "{ not json",
    });
    const client = createLlmClient({ mode: "mock", mockDir: dir, ...quiet });
    await expect(
      client.callSingle(request({ customId: "c_bad" })),
    ).rejects.toThrow(/형식 오류.*c_bad\.json/);
    await expect(
      client.callSingle(request({ customId: "c_broken" })),
    ).rejects.toThrow(/JSON 파싱 실패/);
  });

  it("expired fixture만 있는 배치는 state expired", async () => {
    const dir = tempMockDir({ "by-id/c_old.json": { type: "expired" } });
    const client = createLlmClient({ mode: "mock", mockDir: dir, ...quiet });
    const outcome = await client.runBatch([request({ customId: "c_old" })], {
      deadline: new Date(Date.now() + 60_000),
    });
    if (outcome.timedOut) throw new Error("mock 배치는 즉시 끝나야 한다");
    expect(outcome.state).toBe("expired");
  });

  it("단건 호출에 expired fixture는 쓸 수 없다", async () => {
    const dir = tempMockDir({ "by-id/c_old.json": { type: "expired" } });
    const client = createLlmClient({ mode: "mock", mockDir: dir, ...quiet });
    await expect(
      client.callSingle(request({ customId: "c_old" })),
    ).rejects.toThrow(LlmMockFixtureError);
  });
});

// ─── 설정·보안 ───────────────────────────────────────────────────────────

describe("설정 · live 가드 · 로그", () => {
  it("live 모드에 키가 없으면 명확한 오류(키 이름만, 값 없음)", () => {
    expect(() => createLlmClient({ mode: "live", env: {} })).toThrow(
      LlmConfigError,
    );
    expect(() =>
      createLlmClient({ mode: "live", env: { ANTHROPIC_API_KEY: "  " } }),
    ).toThrow(/ANTHROPIC_API_KEY가 설정되지 않았다/);
  });

  it("Vitest 안에서는 키가 있어도 live SDK 클라이언트를 만들지 않고, 키 값을 메시지에 넣지 않는다", () => {
    const fakeKey = "sk-ant-test-0000000000000000";
    try {
      createLlmClient({
        mode: "live",
        env: { VITEST: "true", ANTHROPIC_API_KEY: fakeKey },
      });
      throw new Error("던져야 한다");
    } catch (error) {
      expect(error).toBeInstanceOf(LlmConfigError);
      expect(String((error as Error).message)).not.toContain(fakeKey);
    }
  });

  it("transport를 주입하면 live 모드도 키 없이 만든다", () => {
    const { transport } = fakeTransport();
    expect(
      createLlmClient({ mode: "live", env: {}, transport, logger: () => {} })
        .mode,
    ).toBe("live");
  });

  it("LLM_MODE 값이 잘못되면 설정 오류", () => {
    expect(() => createLlmClient({ env: { LLM_MODE: "prod" } })).toThrow(
      LlmConfigError,
    );
  });

  it("resolveLlmModel: 기본값·환경변수·공백 거부", () => {
    expect(resolveLlmModel({})).toBe(DEFAULT_LLM_MODEL);
    expect(resolveLlmModel({ LLM_MODEL: " " })).toBe(DEFAULT_LLM_MODEL);
    expect(resolveLlmModel({ LLM_MODEL: "claude-haiku-5-5" })).toBe(
      "claude-haiku-5-5",
    );
    expect(() => resolveLlmModel({ LLM_MODEL: "claude haiku" })).toThrow(
      LlmConfigError,
    );
  });

  it("로그에는 단계·건수만 남고 프롬프트·출력 텍스트는 남지 않는다", async () => {
    const marker = {
      system: "SYS_MARKER_123",
      user: "USER_MARKER_456",
      output: "OUTPUT_MARKER_789",
    };
    const { transport } = fakeTransport({
      retrieve: [batch("in_progress"), batch("ended", { succeeded: 1 })],
      results: [succeeded("c_log", marker.output)],
      messages: [rateLimited(), message(marker.output)],
    });
    const { client, logs } = harness(transport);
    const req = request({
      customId: "c_log",
      system: marker.system,
      user: marker.user,
    });
    await client.runBatch([req], { deadline: DEADLINE });
    await client.callSingle(req);

    const stages = logs.map((event) => event.stage);
    expect(stages).toEqual(
      expect.arrayContaining([
        "batch.submit",
        "batch.poll",
        "batch.ended",
        "batch.results",
        "single.retry",
        "single.done",
      ]),
    );
    const serialized = JSON.stringify(logs);
    for (const value of Object.values(marker))
      expect(serialized).not.toContain(value);
  });
});
