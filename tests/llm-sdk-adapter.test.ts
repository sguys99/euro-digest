// SDK 어댑터(live transport) 검증 — 실제 @anthropic-ai/sdk를 쓰되 fetch를 가짜로 바꿔 네트워크 없이
// 요청 형태·인증 헤더·오류 변환·재시도 횟수·JSONL 결과 파싱을 확인한다 (CLAUDE.md §6.3: 테스트는 실호출 금지).
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLlmClient,
  createSdkTransport,
  LlmConfigError,
  LlmTransportError,
  type LlmRequest,
} from "../scripts/lib/llm";

const API = "https://api.anthropic.com";
const TEST_KEY = "test-key-not-a-secret";

interface Recorded {
  method: string;
  url: string;
  headers: Headers;
  body: unknown;
}

type Route = (request: Recorded) => Response | Promise<Response>;

function fakeFetch(routes: Route[]) {
  const recorded: Recorded[] = [];
  const fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(init?.headers);
    const rawBody = init?.body;
    const record: Recorded = {
      method: init?.method ?? "GET",
      url,
      headers,
      body: typeof rawBody === "string" ? JSON.parse(rawBody) : undefined,
    };
    recorded.push(record);
    const route = routes[Math.min(recorded.length - 1, routes.length - 1)];
    if (!route) throw new Error("가짜 fetch: 경로가 정의되지 않았다");
    return route(record);
  };
  return { fetch, recorded };
}

const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const apiError = (
  status: number,
  type: string,
  headers: Record<string, string> = {},
) =>
  json(
    {
      type: "error",
      error: { type, message: `${type} sample` },
      request_id: "req_test",
    },
    status,
    headers,
  );

function messageBody(text: string) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text },
    ],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 210,
      output_tokens: 90,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 600,
      output_tokens_details: { thinking_tokens: 30 },
    },
  };
}

function batchBody(status: "in_progress" | "ended") {
  return {
    id: "msgbatch_test",
    type: "message_batch",
    processing_status: status,
    request_counts: {
      processing: status === "ended" ? 0 : 1,
      succeeded: status === "ended" ? 1 : 0,
      errored: 0,
      canceled: 0,
      expired: 0,
    },
    created_at: "2026-10-10T21:35:00Z",
    expires_at: "2026-10-11T21:35:00Z",
    ended_at: status === "ended" ? "2026-10-10T21:37:00Z" : null,
    archived_at: null,
    cancel_initiated_at: null,
    results_url:
      status === "ended"
        ? `${API}/v1/messages/batches/msgbatch_test/results`
        : null,
  };
}

const request: LlmRequest = {
  customId: "c_0123456789",
  system: "고정 지시문",
  user: "Title: Sample United win",
  maxTokens: 600,
  cacheSystem: true,
};

function clientWith(fetch: ReturnType<typeof fakeFetch>["fetch"]) {
  let now = Date.parse("2026-10-10T21:35:00Z");
  const sleeps: number[] = [];
  const client = createLlmClient({
    mode: "live",
    env: {},
    transport: createSdkTransport({ apiKey: TEST_KEY, fetch }),
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    logger: () => {},
  });
  return { client, sleeps };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SDK 어댑터 (가짜 fetch)", () => {
  it("Vitest 안에서는 가짜 fetch 없이 만들 수 없다", () => {
    expect(() => createSdkTransport({ apiKey: TEST_KEY })).toThrow(
      LlmConfigError,
    );
  });

  it("단건: Messages API 요청 형태·API 키 헤더·응답 변환", async () => {
    // AUTH_TOKEN이 환경에 있어도 Authorization 헤더를 보내지 않는다(authToken: null)
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "should-not-be-sent");
    const { fetch, recorded } = fakeFetch([
      () => json(messageBody('{"ok":1}')),
    ]);
    const { client } = clientWith(fetch);
    const result = await client.callSingle(request);

    expect(result).toMatchObject({
      ok: true,
      text: '{"ok":1}',
      batch: false,
      thinkingTokens: 30,
      usage: { in: 210, out: 90, cacheRead: 600, cacheWrite: 0 },
    });
    expect(recorded).toHaveLength(1);
    const [sent] = recorded;
    expect(sent?.method).toBe("POST");
    expect(sent?.url).toBe(`${API}/v1/messages`);
    expect(sent?.headers.get("x-api-key")).toBe(TEST_KEY);
    expect(sent?.headers.get("authorization")).toBeNull();
    expect(sent?.headers.get("anthropic-version")).toBeTruthy();
    expect(sent?.body).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 600,
      system: [
        {
          type: "text",
          text: "고정 지시문",
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: "Title: Sample United win" }],
    });
  });

  it("429는 SDK가 아니라 이 파일의 정책으로만 재시도하고 retry-after를 따른다", async () => {
    const { fetch, recorded } = fakeFetch([
      () => apiError(429, "rate_limit_error", { "retry-after": "2" }),
      () => apiError(429, "rate_limit_error", { "retry-after": "2" }),
      () => json(messageBody("{}")),
    ]);
    const { client, sleeps } = clientWith(fetch);
    const result = await client.callSingle(request);
    expect(result.ok).toBe(true);
    expect(recorded).toHaveLength(3);
    expect(sleeps).toEqual([2_000, 2_000]);
  });

  it("오류 응답을 LlmTransportError로 바꾼다 (529 overloaded·400·연결 실패)", async () => {
    const transport = (route: Route) =>
      createSdkTransport({ apiKey: TEST_KEY, fetch: fakeFetch([route]).fetch });
    const params = {
      model: "claude-haiku-5-5",
      max_tokens: 10,
      messages: [{ role: "user" as const, content: "x" }],
    };

    const overloaded = await transport(() => apiError(529, "overloaded_error"))
      .createMessage(params, { customId: "c_1" })
      .catch((error: unknown) => error);
    expect(overloaded).toBeInstanceOf(LlmTransportError);
    expect(overloaded).toMatchObject({
      status: 529,
      errorType: "overloaded_error",
      retryable: true,
    });
    expect((overloaded as Error).message).toBe("overloaded_error sample");

    const invalid = await transport(() =>
      apiError(400, "invalid_request_error"),
    )
      .createMessage(params, { customId: "c_1" })
      .catch((error: unknown) => error);
    expect(invalid).toMatchObject({
      status: 400,
      errorType: "invalid_request_error",
      retryable: false,
    });

    const offline = await transport(() => {
      throw new TypeError("fetch failed");
    })
      .createMessage(params, { customId: "c_1" })
      .catch((error: unknown) => error);
    expect(offline).toMatchObject({
      status: undefined,
      errorType: "connection_error",
      retryable: false,
    });
  });

  it("배치: 제출 → 조회(진행 → 완료) → JSONL 결과를 끝까지 SDK로 처리한다", async () => {
    const resultLine = {
      custom_id: "c_0123456789",
      result: { type: "succeeded", message: messageBody('{"b":1}') },
    };
    const { fetch, recorded } = fakeFetch([
      () => json(batchBody("in_progress")), // POST /v1/messages/batches
      () => json(batchBody("in_progress")), // GET 조회 1
      () => json(batchBody("ended")), // GET 조회 2
      () => json(batchBody("ended")), // results()가 내부에서 다시 조회
      () =>
        new Response(`${JSON.stringify(resultLine)}\n`, {
          status: 200,
          headers: { "content-type": "application/binary" },
        }),
    ]);
    const { client, sleeps } = clientWith(fetch);
    const outcome = await client.runBatch([request], {
      deadline: new Date("2026-10-10T21:50:00Z"),
    });

    if (outcome.timedOut) throw new Error("timedOut이면 안 된다");
    expect(outcome.batchId).toBe("msgbatch_test");
    expect(outcome.results.get("c_0123456789")).toMatchObject({
      ok: true,
      text: '{"b":1}',
      batch: true,
    });
    expect(outcome.usage.batch).toEqual({
      in: 210,
      out: 90,
      cacheRead: 600,
      cacheWrite: 0,
    });
    expect(sleeps).toHaveLength(1);

    expect(recorded.map((entry) => `${entry.method} ${entry.url}`)).toEqual([
      `POST ${API}/v1/messages/batches`,
      `GET ${API}/v1/messages/batches/msgbatch_test`,
      `GET ${API}/v1/messages/batches/msgbatch_test`,
      `GET ${API}/v1/messages/batches/msgbatch_test`,
      `GET ${API}/v1/messages/batches/msgbatch_test/results`,
    ]);
    expect(recorded[0]?.body).toEqual({
      requests: [
        {
          custom_id: "c_0123456789",
          params: {
            model: "claude-haiku-5-5",
            max_tokens: 600,
            system: [
              {
                type: "text",
                text: "고정 지시문",
                cache_control: { type: "ephemeral" },
              },
            ],
            messages: [{ role: "user", content: "Title: Sample United win" }],
          },
        },
      ],
    });
  });
});
