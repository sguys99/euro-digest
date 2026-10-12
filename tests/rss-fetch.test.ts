/**
 * M1-03 — scripts/lib/rss.ts `fetchFeedXml`(요청 1회): 헤더 · 같은 호스트 리다이렉트만 직접 따라가기 · 크기 상한 스트리밍 검사 ·
 * HTTP 오류 종류 · 네트워크 오류 · 시도 타임아웃(가짜 타이머) · Retry-After 해석.
 * 네트워크 없음 — fetch는 가짜 응답을 돌려준다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FEED_MAX_BYTES,
  FEED_MAX_REDIRECTS,
  FeedFetchError,
  feedUserAgent,
  fetchFeedXml,
  parseRetryAfterMs,
  type FetchLike,
} from "../scripts/lib/rss";

const URL_A = "https://feeds.example.com/sport/rss.xml";
const XML = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title></channel></rss>`;
const UA = feedUserAgent("test@example.com");

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/** URL별 응답 목록(차례로 소비, 마지막은 반복). 목록에 없는 URL은 테스트 실패로 던진다. */
function routeFetch(
  routes: Record<string, Array<() => Response | Promise<Response>>>,
): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const seen = new Map<string, number>();
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      const list = routes[url];
      if (!list) throw new Error(`테스트에서 예상하지 못한 URL: ${url}`);
      const n = seen.get(url) ?? 0;
      seen.set(url, n + 1);
      const make = list[Math.min(n, list.length - 1)]!;
      return make();
    },
  };
}

const ok =
  (body = XML) =>
  () =>
    new Response(body, { status: 200 });
const redirect =
  (location: string | null, status = 301) =>
  () =>
    new Response(null, {
      status,
      headers: location === null ? {} : { location },
    });

/** pull 횟수·취소 여부를 세는 본문 스트림(highWaterMark 0 — 읽을 때만 pull) */
function countingStream(chunkSize: number, totalChunks: number | null) {
  const state = { pulls: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        state.pulls += 1;
        if (totalChunks !== null && state.pulls > totalChunks) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(chunkSize).fill(0x61));
      },
      cancel() {
        state.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, state };
}

async function rejection(promise: Promise<unknown>): Promise<FeedFetchError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof FeedFetchError) return error;
    throw error;
  }
  throw new Error("거부되지 않았다");
}

// ─── 요청 · 응답 ─────────────────────────────────────────────────────────

describe("fetchFeedXml — 요청 헤더·리다이렉트 방식", () => {
  it("User-Agent(서비스명·저장소·연락처)·Accept를 보내고, 리다이렉트는 manual + 중단 신호를 건다", async () => {
    const f = routeFetch({ [URL_A]: [ok()] });
    await expect(
      fetchFeedXml(URL_A, { fetch: f.fetch, userAgent: UA }),
    ).resolves.toBe(XML);
    expect(f.calls).toHaveLength(1);
    const init = f.calls[0]!.init!;
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(
      "EuroDigestBot/0.1 (+https://github.com/sguys99/euro-digest; test@example.com)",
    );
    expect(headers.Accept).toMatch(/rss\+xml/);
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("UTF-8 멀티바이트 문자가 청크 경계에서 갈라져도 그대로 이어 붙인다(BOM 제거)", async () => {
    const bytes = new TextEncoder().encode("﻿<t>한글 제목</t>");
    const cut = 6; // "한"(3바이트) 가운데
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });
    const f = routeFetch({ [URL_A]: [() => new Response(stream)] });
    await expect(
      fetchFeedXml(URL_A, { fetch: f.fetch, userAgent: UA }),
    ).resolves.toBe("<t>한글 제목</t>");
  });
});

describe("fetchFeedXml — 리다이렉트(같은 호스트만, 최대 3회)", () => {
  it("같은 호스트의 상대 경로 리다이렉트를 따라가고 헤더를 다시 보낸다", async () => {
    const next = "https://feeds.example.com/sport/v2/rss.xml";
    const f = routeFetch({
      [URL_A]: [redirect("/sport/v2/rss.xml", 308)],
      [next]: [ok()],
    });
    await expect(
      fetchFeedXml(URL_A, { fetch: f.fetch, userAgent: UA }),
    ).resolves.toBe(XML);
    expect(f.calls.map((c) => c.url)).toEqual([URL_A, next]);
    for (const call of f.calls) {
      expect((call.init!.headers as Record<string, string>)["User-Agent"]).toBe(
        UA,
      );
      expect(call.init!.redirect).toBe("manual");
    }
  });

  it("http → https 같은 호스트 승격은 따라간다", async () => {
    const http = "http://feeds.example.com/rss.xml";
    const https = "https://feeds.example.com/rss.xml";
    const f = routeFetch({ [http]: [redirect(https)], [https]: [ok()] });
    await expect(
      fetchFeedXml(http, { fetch: f.fetch, userAgent: UA }),
    ).resolves.toBe(XML);
    expect(f.calls.map((c) => c.url)).toEqual([http, https]);
  });

  it(`${FEED_MAX_REDIRECTS}회까지는 따라가고, 그다음 리다이렉트는 요청하지 않고 redirect 오류`, async () => {
    const hop = (n: number) => `https://feeds.example.com/hop${n}`;
    const three = routeFetch({
      [URL_A]: [redirect(hop(1))],
      [hop(1)]: [redirect(hop(2))],
      [hop(2)]: [redirect(hop(3))],
      [hop(3)]: [ok()],
    });
    await expect(
      fetchFeedXml(URL_A, { fetch: three.fetch, userAgent: UA }),
    ).resolves.toBe(XML);
    expect(three.calls).toHaveLength(4);

    const four = routeFetch({
      [URL_A]: [redirect(hop(1))],
      [hop(1)]: [redirect(hop(2))],
      [hop(2)]: [redirect(hop(3))],
      [hop(3)]: [redirect(hop(4))],
      [hop(4)]: [ok()],
    });
    const error = await rejection(
      fetchFeedXml(URL_A, { fetch: four.fetch, userAgent: UA }),
    );
    expect(error).toMatchObject({ kind: "redirect", status: 301 });
    expect(four.calls.map((c) => c.url)).not.toContain(hop(4));
    expect(four.calls).toHaveLength(4);
  });

  it("다른 호스트로 가는 리다이렉트는 그 호스트에 요청을 보내지 않고 거부한다", async () => {
    const other = "https://evil.example.net/rss.xml";
    const f = routeFetch({ [URL_A]: [redirect(other, 302)], [other]: [ok()] });
    const error = await rejection(
      fetchFeedXml(URL_A, { fetch: f.fetch, userAgent: UA }),
    );
    expect(error).toMatchObject({ kind: "redirect", status: 302 });
    expect(error.message).toContain("feeds.example.com");
    expect(error.message).toContain("evil.example.net");
    expect(f.calls.map((c) => c.url)).toEqual([URL_A]);
  });

  it("서브도메인만 달라도 다른 호스트다(www 유무 포함)", async () => {
    const f = routeFetch({
      [URL_A]: [redirect("https://example.com/sport/rss.xml")],
    });
    const error = await rejection(
      fetchFeedXml(URL_A, { fetch: f.fetch, userAgent: UA }),
    );
    expect(error.kind).toBe("redirect");
    expect(f.calls).toHaveLength(1);
  });

  it("https → http 강등·Location 없음·따라가지 않는 3xx는 redirect 오류", async () => {
    for (const make of [
      redirect("http://feeds.example.com/sport/rss.xml"),
      redirect(null),
      redirect("   "),
      () => new Response(null, { status: 304 }),
      () => new Response(null, { status: 300, headers: { location: "/x" } }),
    ]) {
      const f = routeFetch({ [URL_A]: [make] });
      const error = await rejection(
        fetchFeedXml(URL_A, { fetch: f.fetch, userAgent: UA }),
      );
      expect(error.kind).toBe("redirect");
      expect(f.calls).toHaveLength(1);
    }
  });
});

describe("fetchFeedXml — 크기 상한(읽는 중 검사)", () => {
  it("Content-Length가 상한을 넘으면 본문을 한 번도 읽지 않고 too-large", async () => {
    const { stream, state } = countingStream(1024, null);
    const f = routeFetch({
      [URL_A]: [
        () =>
          new Response(stream, {
            headers: { "content-length": String(FEED_MAX_BYTES + 1) },
          }),
      ],
    });
    const error = await rejection(
      fetchFeedXml(URL_A, { fetch: f.fetch, userAgent: UA }),
    );
    expect(error).toMatchObject({ kind: "too-large", status: 200 });
    expect(error.message).toContain("Content-Length");
    expect(state.pulls).toBe(0);
    expect(state.cancelled).toBe(true);
  });

  it("Content-Length 없이 계속 오는 본문은 상한을 넘는 순간 읽기를 멈추고 스트림을 취소한다", async () => {
    const { stream, state } = countingStream(300, null); // 끝없이 온다
    const f = routeFetch({ [URL_A]: [() => new Response(stream)] });
    const error = await rejection(
      fetchFeedXml(URL_A, { fetch: f.fetch, userAgent: UA, maxBytes: 1000 }),
    );
    expect(error.kind).toBe("too-large");
    // 300·600·900·1200 — 네 번째 청크에서 멈춘다
    expect(state.pulls).toBe(4);
    await Promise.resolve();
    expect(state.cancelled).toBe(true);
  });

  it("Content-Length가 작게 적혀 있어도(압축 전송 등) 실제로 읽은 바이트로 다시 검사한다", async () => {
    const { stream, state } = countingStream(600, null);
    const f = routeFetch({
      [URL_A]: [
        () => new Response(stream, { headers: { "content-length": "100" } }),
      ],
    });
    const error = await rejection(
      fetchFeedXml(URL_A, { fetch: f.fetch, userAgent: UA, maxBytes: 1000 }),
    );
    expect(error.kind).toBe("too-large");
    expect(state.pulls).toBe(2);
  });

  it("상한과 같은 크기까지는 받는다", async () => {
    const { stream } = countingStream(250, 4); // 정확히 1000바이트
    const f = routeFetch({ [URL_A]: [() => new Response(stream)] });
    const text = await fetchFeedXml(URL_A, {
      fetch: f.fetch,
      userAgent: UA,
      maxBytes: 1000,
    });
    expect(text).toHaveLength(1000);
  });
});

describe("fetchFeedXml — HTTP·네트워크 오류 종류", () => {
  it("4xx → http-4xx, 5xx → http-5xx (상태 보존, 본문은 메시지에 없음)", async () => {
    for (const [status, kind] of [
      [403, "http-4xx"],
      [404, "http-4xx"],
      [410, "http-4xx"],
      [429, "http-4xx"],
      [500, "http-5xx"],
      [503, "http-5xx"],
    ] as const) {
      const f = routeFetch({
        [URL_A]: [() => new Response("secret body text", { status })],
      });
      const error = await rejection(
        fetchFeedXml(URL_A, { fetch: f.fetch, userAgent: UA }),
      );
      expect(error).toMatchObject({ name: "FeedFetchError", kind, status });
      expect(error.message).not.toContain("secret body text");
      expect(error.retryAfterMs).toBeUndefined();
    }
  });

  it("Retry-After(초·HTTP-date)를 오류에 담는다", async () => {
    const seconds = routeFetch({
      [URL_A]: [
        () =>
          new Response("", { status: 429, headers: { "retry-after": "7" } }),
      ],
    });
    expect(
      await rejection(
        fetchFeedXml(URL_A, { fetch: seconds.fetch, userAgent: UA }),
      ),
    ).toMatchObject({ kind: "http-4xx", status: 429, retryAfterMs: 7000 });

    const now = Date.parse("2026-10-10T21:30:00.000Z");
    const date = routeFetch({
      [URL_A]: [
        () =>
          new Response("", {
            status: 503,
            headers: { "retry-after": "Sat, 10 Oct 2026 21:30:05 GMT" },
          }),
      ],
    });
    expect(
      await rejection(
        fetchFeedXml(URL_A, {
          fetch: date.fetch,
          userAgent: UA,
          now: () => now,
        }),
      ),
    ).toMatchObject({ kind: "http-5xx", status: 503, retryAfterMs: 5000 });
  });

  it("연결 실패·본문을 읽다 끊김 → network", async () => {
    const refused = routeFetch({
      [URL_A]: [
        () => {
          throw new TypeError("fetch failed");
        },
      ],
    });
    expect(
      await rejection(
        fetchFeedXml(URL_A, { fetch: refused.fetch, userAgent: UA }),
      ),
    ).toMatchObject({ kind: "network", status: null });

    const broken = routeFetch({
      [URL_A]: [
        () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new Error("socket hang up"));
              },
            }),
          ),
      ],
    });
    expect(
      await rejection(
        fetchFeedXml(URL_A, { fetch: broken.fetch, userAgent: UA }),
      ),
    ).toMatchObject({ kind: "network", status: 200 });
  });
});

describe("parseRetryAfterMs", () => {
  const now = Date.parse("2026-10-10T21:30:00.000Z");
  it("초 정수·HTTP-date·지난 날짜·해석 불가", () => {
    expect(parseRetryAfterMs("0", now)).toBe(0);
    expect(parseRetryAfterMs(" 12 ", now)).toBe(12_000);
    expect(parseRetryAfterMs("Sat, 10 Oct 2026 21:31:00 GMT", now)).toBe(
      60_000,
    );
    expect(parseRetryAfterMs("Sat, 10 Oct 2026 21:00:00 GMT", now)).toBe(0);
    for (const bad of [null, undefined, "", "1.5", "-3", "soon", "12abc"]) {
      expect(parseRetryAfterMs(bad, now)).toBeUndefined();
    }
  });
});

// ─── 타임아웃 (가짜 타이머) ──────────────────────────────────────────────

describe("fetchFeedXml — 시도 타임아웃(가짜 타이머)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** 응답하지 않는 fetch — signalAware면 중단 신호에 AbortError로 거부, 아니면 영원히 대기 */
  function hangingFetch(signalAware: boolean): FetchLike {
    return (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        if (signalAware) {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }
      });
  }

  for (const signalAware of [true, false]) {
    it(`응답이 없으면 정확히 timeoutMs에 timeout (fetch가 신호를 ${signalAware ? "따름" : "무시함"})`, async () => {
      let settled = false;
      const promise = fetchFeedXml(URL_A, {
        fetch: hangingFetch(signalAware),
        userAgent: UA,
        timeoutMs: 15_000,
      }).finally(() => {
        settled = true;
      });
      const result = rejection(promise);
      await vi.advanceTimersByTimeAsync(14_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await result).toMatchObject({ kind: "timeout", status: null });
      expect(vi.getTimerCount()).toBe(0);
    });
  }

  it("헤더는 왔지만 본문이 멈추면 같은 시도 타임아웃으로 끊는다", async () => {
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("<rss>"));
      },
      // pull이 더 이상 데이터를 주지 않는다
    });
    const f = routeFetch({ [URL_A]: [() => new Response(stalled)] });
    const result = rejection(
      fetchFeedXml(URL_A, { fetch: f.fetch, userAgent: UA, timeoutMs: 5_000 }),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await result).toMatchObject({ kind: "timeout" });
  });

  it("리다이렉트를 따라가는 요청까지 한 시도의 시간으로 센다", async () => {
    const next = "https://feeds.example.com/next";
    const f = routeFetch({
      [URL_A]: [
        () =>
          new Promise<Response>((resolve) =>
            setTimeout(() => resolve(redirect(next)()), 4_000),
          ),
      ],
      [next]: [
        () =>
          new Promise<Response>((resolve) =>
            setTimeout(() => resolve(ok()()), 4_000),
          ),
      ],
    });
    const result = rejection(
      fetchFeedXml(URL_A, { fetch: f.fetch, userAgent: UA, timeoutMs: 6_000 }),
    );
    await vi.advanceTimersByTimeAsync(6_000);
    expect(await result).toMatchObject({ kind: "timeout" });
    expect(f.calls.map((c) => c.url)).toEqual([URL_A, next]);
  });
});
