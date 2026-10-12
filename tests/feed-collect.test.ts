/**
 * M1-03 — scripts/lib/feed-collect.ts: 재시도(대상·비대상·Retry-After·소스별 시간) · 호스트별 병렬(같은 호스트 순차 + 간격,
 * 동시 상한) · 결과 순서 결정성 · 단계 시간 예산 초과 시 `budget` · 한 소스 실패가 다른 소스를 막지 않음.
 * 네트워크 없음(fetch 주입), 시간은 vitest 가짜 타이머(setTimeout·Date)로 돌린다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SourcesFileSchema, type Source } from "@/lib/schema";

import {
  collectFeedSources,
  DEFAULT_FEED_POLICY,
  FEED_HOST_CONCURRENCY,
  FEED_SAME_HOST_GAP_MS,
  FEED_STAGE_BUDGET_MS,
  fetchFeedWithRetry,
  hostKey,
  isRetryableFeedError,
  resolveFeedPolicy,
  runByHost,
  SYSTEM_FEED_CLOCK,
  type FeedPolicy,
} from "../scripts/lib/feed-collect";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { FeedFetchError, type FetchLike } from "../scripts/lib/rss";
import { planDailySources } from "../scripts/lib/sources";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const SOURCES: Source[] = SourcesFileSchema.parse(
  JSON.parse(read("configs/sources.json")),
);
const FEEDS = planDailySources(SOURCES).feeds;
const FEED_XML = new Map(
  FEEDS.map((s) => [s.id, read(`fixtures/rss/${s.id}.xml`)] as const),
);

const URL_A = "https://feeds.example.com/rss.xml";
const XML = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title></channel></rss>`;
const T0 = Date.parse("2026-10-10T21:30:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

/** 가짜 타이머 기준 경과 ms */
const elapsed = () => Date.now() - T0;

// ─── 가짜 응답 ───────────────────────────────────────────────────────────

type Step =
  | { kind: "ok"; body?: string; afterMs?: number }
  | { kind: "status"; status: number; headers?: Record<string, string> }
  | { kind: "network" }
  | { kind: "hang" };

interface Call {
  url: string;
  at: number;
}

/** URL별 단계 목록(차례로 소비, 마지막 단계 반복). 호출 시각·동시 요청 수(전체·호스트별)를 잰다. */
function scriptedFetch(
  script: Record<string, Step[]>,
  fallback: (url: string) => Step | undefined = () => undefined,
) {
  const calls: Call[] = [];
  const seen = new Map<string, number>();
  const inFlight = new Map<string, number>();
  let total = 0;
  let maxTotal = 0;
  let maxPerHost = 0;
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, at: elapsed() });
    const list = script[url];
    const n = seen.get(url) ?? 0;
    seen.set(url, n + 1);
    const step = list ? list[Math.min(n, list.length - 1)] : fallback(url);
    if (!step) return Promise.reject(new Error(`예상하지 못한 URL: ${url}`));
    const host = hostKey(url);
    total += 1;
    maxTotal = Math.max(maxTotal, total);
    inFlight.set(host, (inFlight.get(host) ?? 0) + 1);
    maxPerHost = Math.max(maxPerHost, inFlight.get(host)!);
    const done = () => {
      total -= 1;
      inFlight.set(host, inFlight.get(host)! - 1);
    };
    const settle = (): Promise<Response> => {
      switch (step.kind) {
        case "ok":
          return new Promise<Response>((resolve) => {
            const respond = () =>
              resolve(new Response(step.body ?? XML, { status: 200 }));
            if (step.afterMs) setTimeout(respond, step.afterMs);
            else respond();
          });
        case "status":
          return Promise.resolve(
            new Response("body", {
              status: step.status,
              headers: step.headers ?? {},
            }),
          );
        case "network":
          return Promise.reject(new TypeError("fetch failed"));
        case "hang":
          // 실제 fetch처럼 중단 신호에 AbortError로 거부한다
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          });
      }
    };
    return settle().finally(done);
  };
  return {
    fetch,
    calls,
    maxInFlight: () => maxTotal,
    maxPerHost: () => maxPerHost,
  };
}

function retryOptions(
  fetch: FetchLike,
  over: { policy?: Partial<FeedPolicy>; stageBudgetMs?: number } = {},
) {
  const policy = resolveFeedPolicy(over.policy);
  return {
    fetch,
    userAgent: "UA/1",
    policy,
    clock: SYSTEM_FEED_CLOCK,
    stageDeadline: Date.now() + (over.stageBudgetMs ?? policy.stageBudgetMs),
  };
}

/** 약속을 시작해 두고 타이머를 끝까지 돌린 뒤 결과를 돌려준다 */
async function drain<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

// ─── 재시도 ──────────────────────────────────────────────────────────────

describe("isRetryableFeedError — 5xx·429·네트워크·타임아웃만", () => {
  it("종류·상태별 판정", () => {
    const e = (kind: FeedFetchError["kind"], status: number | null = null) =>
      new FeedFetchError(kind, "x", { status });
    expect(isRetryableFeedError(e("http-5xx", 503))).toBe(true);
    expect(isRetryableFeedError(e("http-4xx", 429))).toBe(true);
    expect(isRetryableFeedError(e("network"))).toBe(true);
    expect(isRetryableFeedError(e("timeout"))).toBe(true);
    for (const status of [400, 401, 403, 404, 410]) {
      expect(isRetryableFeedError(e("http-4xx", status))).toBe(false);
    }
    expect(isRetryableFeedError(e("redirect", 301))).toBe(false);
    expect(isRetryableFeedError(e("too-large", 200))).toBe(false);
    expect(isRetryableFeedError(e("budget"))).toBe(false);
  });
});

describe("fetchFeedWithRetry — 재시도 1회", () => {
  const retryable: Array<[string, Step]> = [
    ["500", { kind: "status", status: 500 }],
    ["503", { kind: "status", status: 503 }],
    ["429", { kind: "status", status: 429 }],
    ["네트워크 오류", { kind: "network" }],
    ["타임아웃", { kind: "hang" }],
  ];
  for (const [label, first] of retryable) {
    it(`${label} → 2초 뒤 1회 재시도해 성공`, async () => {
      const f = scriptedFetch({ [URL_A]: [first, { kind: "ok" }] });
      const result = await drain(
        fetchFeedWithRetry(URL_A, retryOptions(f.fetch)),
      );
      expect(result).toEqual({ ok: true, xml: XML, retries: 1 });
      expect(f.calls).toHaveLength(2);
      const firstEnd = first.kind === "hang" ? 15_000 : 0;
      expect(f.calls[1]!.at - firstEnd).toBe(2_000);
    });
  }

  const nonRetryable: Array<[string, Step, string]> = [
    ["403", { kind: "status", status: 403 }, "http-4xx"],
    ["404", { kind: "status", status: 404 }, "http-4xx"],
    ["410", { kind: "status", status: 410 }, "http-4xx"],
    [
      "다른 호스트 리다이렉트",
      {
        kind: "status",
        status: 301,
        headers: { location: "https://other.example.net/rss" },
      },
      "redirect",
    ],
  ];
  for (const [label, step, kind] of nonRetryable) {
    it(`${label} → 재시도하지 않는다`, async () => {
      const f = scriptedFetch({ [URL_A]: [step, { kind: "ok" }] });
      const result = await drain(
        fetchFeedWithRetry(URL_A, retryOptions(f.fetch)),
      );
      expect(result).toMatchObject({
        ok: false,
        retries: 0,
        retrySkipped: null,
        error: { kind },
      });
      expect(f.calls).toHaveLength(1);
    });
  }

  it("크기 초과 → 재시도하지 않는다", async () => {
    const f = scriptedFetch({
      [URL_A]: [{ kind: "ok", body: "x".repeat(2_000) }, { kind: "ok" }],
    });
    const result = await drain(
      fetchFeedWithRetry(
        URL_A,
        retryOptions(f.fetch, { policy: { maxBytes: 1_000 } }),
      ),
    );
    expect(result).toMatchObject({ ok: false, error: { kind: "too-large" } });
    expect(f.calls).toHaveLength(1);
  });

  it("재시도는 1회뿐 — 계속 503이면 2번 요청하고 실패(retries 1)", async () => {
    const f = scriptedFetch({ [URL_A]: [{ kind: "status", status: 503 }] });
    const result = await drain(
      fetchFeedWithRetry(URL_A, retryOptions(f.fetch)),
    );
    expect(result).toMatchObject({
      ok: false,
      retries: 1,
      retrySkipped: null,
      error: { kind: "http-5xx", status: 503 },
    });
    expect(f.calls).toHaveLength(2);
  });

  it("429 Retry-After가 기본 대기보다 길면 그만큼 기다린다(상한 안)", async () => {
    const f = scriptedFetch({
      [URL_A]: [
        { kind: "status", status: 429, headers: { "retry-after": "5" } },
        { kind: "ok" },
      ],
    });
    const result = await drain(
      fetchFeedWithRetry(URL_A, retryOptions(f.fetch)),
    );
    expect(result).toMatchObject({ ok: true, retries: 1 });
    expect(f.calls.map((c) => c.at)).toEqual([0, 5_000]);
  });

  it("Retry-After가 기본 대기보다 짧으면 기본 대기(2초)", async () => {
    const f = scriptedFetch({
      [URL_A]: [
        { kind: "status", status: 503, headers: { "retry-after": "1" } },
        { kind: "ok" },
      ],
    });
    await drain(fetchFeedWithRetry(URL_A, retryOptions(f.fetch)));
    expect(f.calls.map((c) => c.at)).toEqual([0, 2_000]);
  });

  it("Retry-After가 상한(10초)을 넘으면 기다리지 않고 포기한다", async () => {
    const f = scriptedFetch({
      [URL_A]: [
        { kind: "status", status: 429, headers: { "retry-after": "60" } },
        { kind: "ok" },
      ],
    });
    const result = await drain(
      fetchFeedWithRetry(URL_A, retryOptions(f.fetch)),
    );
    expect(result).toMatchObject({
      ok: false,
      retries: 0,
      retrySkipped: "retry-after-too-long",
      error: { kind: "http-4xx", status: 429, retryAfterMs: 60_000 },
    });
    expect(f.calls).toHaveLength(1);
    expect(elapsed()).toBe(0);
  });

  it("소스별 시간(30초) — 두 번 다 응답이 없으면 15초 + 대기 2초 + 남은 13초에서 끝난다", async () => {
    const f = scriptedFetch({ [URL_A]: [{ kind: "hang" }] });
    const result = await drain(
      fetchFeedWithRetry(URL_A, retryOptions(f.fetch)),
    );
    expect(result).toMatchObject({
      ok: false,
      retries: 1,
      error: { kind: "timeout" },
    });
    expect(f.calls.map((c) => c.at)).toEqual([0, 17_000]);
    expect(elapsed()).toBe(30_000);
  });

  it("재시도할 시간이 소스 시간 안에 없으면(대기 + 최소 시도 2초) 포기한다", async () => {
    const f = scriptedFetch({ [URL_A]: [{ kind: "hang" }, { kind: "ok" }] });
    const result = await drain(
      fetchFeedWithRetry(
        URL_A,
        retryOptions(f.fetch, { policy: { sourceBudgetMs: 18_000 } }),
      ),
    );
    expect(result).toMatchObject({
      ok: false,
      retries: 0,
      retrySkipped: "no-time",
      error: { kind: "timeout" },
    });
    expect(f.calls).toHaveLength(1);
  });

  it("단계 예산이 시도를 끊으면 timeout이 아니라 budget(재시도 없음)", async () => {
    const f = scriptedFetch({ [URL_A]: [{ kind: "hang" }, { kind: "ok" }] });
    const result = await drain(
      fetchFeedWithRetry(
        URL_A,
        retryOptions(f.fetch, { stageBudgetMs: 5_000 }),
      ),
    );
    expect(result).toMatchObject({
      ok: false,
      retries: 0,
      error: { kind: "budget" },
    });
    expect(f.calls).toHaveLength(1);
    expect(elapsed()).toBe(5_000);
  });
});

// ─── 호스트별 병렬 ───────────────────────────────────────────────────────

describe("runByHost — 같은 호스트 순차 + 간격, 다른 호스트 병렬(상한), 결과는 입력 순서", () => {
  interface Item {
    id: string;
    host: string;
    ms: number;
  }
  const lanes = (over: Partial<Parameters<typeof runByHost>[2]> = {}) => ({
    concurrency: 4,
    sameHostGapMs: 1_000,
    deadline: Date.now() + 90_000,
    minStartMs: 2_000,
    clock: SYSTEM_FEED_CLOCK,
    ...over,
  });

  function tracker() {
    const starts: Record<string, number> = {};
    const ends: Record<string, number> = {};
    const active = new Map<string, number>();
    let total = 0;
    let maxTotal = 0;
    let maxPerHost = 0;
    const run = async (item: Item) => {
      starts[item.id] = elapsed();
      total += 1;
      maxTotal = Math.max(maxTotal, total);
      active.set(item.host, (active.get(item.host) ?? 0) + 1);
      maxPerHost = Math.max(maxPerHost, active.get(item.host)!);
      await new Promise((resolve) => setTimeout(resolve, item.ms));
      total -= 1;
      active.set(item.host, active.get(item.host)! - 1);
      ends[item.id] = elapsed();
      return `done:${item.id}`;
    };
    return {
      run,
      starts,
      ends,
      maxTotal: () => maxTotal,
      maxPerHost: () => maxPerHost,
    };
  }
  const handlers = (run: (item: Item) => Promise<string>) => ({
    run,
    skip: (item: Item) => `skip:${item.id}`,
    fail: (item: Item, _i: number, error: unknown) =>
      `fail:${item.id}:${(error as Error).message}`,
  });

  it("같은 호스트는 앞 항목이 끝나고 1초 뒤에 시작, 다른 호스트는 동시에 시작", async () => {
    const items: Item[] = [
      { id: "a1", host: "a", ms: 500 },
      { id: "b1", host: "b", ms: 300 },
      { id: "a2", host: "a", ms: 500 },
      { id: "a3", host: "a", ms: 500 },
    ];
    const t = tracker();
    const results = await drain(
      runByHost(items, (i) => i.host, lanes(), handlers(t.run)),
    );
    expect(results).toEqual(["done:a1", "done:b1", "done:a2", "done:a3"]);
    expect(t.starts).toEqual({ a1: 0, b1: 0, a2: 1_500, a3: 3_000 });
    expect(t.maxPerHost()).toBe(1);
  });

  it(`동시 호스트 상한(${FEED_HOST_CONCURRENCY}) — 호스트 6개면 4개 먼저, 빈 자리에 나머지`, async () => {
    const items: Item[] = ["h1", "h2", "h3", "h4", "h5", "h6"].map((h) => ({
      id: h,
      host: h,
      ms: 1_000,
    }));
    const t = tracker();
    await drain(
      runByHost(
        items,
        (i) => i.host,
        lanes({ concurrency: FEED_HOST_CONCURRENCY }),
        handlers(t.run),
      ),
    );
    expect(t.maxTotal()).toBe(4);
    expect(t.starts).toEqual({
      h1: 0,
      h2: 0,
      h3: 0,
      h4: 0,
      h5: 1_000,
      h6: 1_000,
    });
  });

  it("완료 순서가 거꾸로여도 결과는 입력 순서", async () => {
    const items: Item[] = [
      { id: "slow", host: "a", ms: 3_000 },
      { id: "mid", host: "b", ms: 2_000 },
      { id: "fast", host: "c", ms: 1_000 },
    ];
    const t = tracker();
    const results = await drain(
      runByHost(items, (i) => i.host, lanes(), handlers(t.run)),
    );
    expect(t.ends).toEqual({ fast: 1_000, mid: 2_000, slow: 3_000 });
    expect(results).toEqual(["done:slow", "done:mid", "done:fast"]);
  });

  it("한 항목이 던져도 그 항목만 fail, 같은 호스트의 다음 항목과 다른 호스트는 계속", async () => {
    const items: Item[] = [
      { id: "a1", host: "a", ms: 100 },
      { id: "a2", host: "a", ms: 100 },
      { id: "b1", host: "b", ms: 100 },
    ];
    const t = tracker();
    const results = await drain(
      runByHost(
        items,
        (i) => i.host,
        lanes(),
        handlers(async (item) => {
          if (item.id === "a1") throw new Error("boom");
          return t.run(item);
        }),
      ),
    );
    expect(results).toEqual(["fail:a1:boom", "done:a2", "done:b1"]);
  });

  it("마감까지 최소 시작 시간이 남지 않은 항목은 시작하지 않고 skip", async () => {
    const items: Item[] = [
      { id: "a1", host: "a", ms: 5_000 },
      { id: "a2", host: "a", ms: 5_000 },
      { id: "a3", host: "a", ms: 5_000 },
      { id: "b1", host: "b", ms: 100 },
    ];
    const t = tracker();
    const results = await drain(
      runByHost(
        items,
        (i) => i.host,
        lanes({ deadline: Date.now() + 9_000 }),
        handlers(t.run),
      ),
    );
    // a1 0~5초, 간격 1초 → a2 6초 시작(남은 3초 ≥ 2초) ~11초, a3는 남은 시간이 없어 skip
    expect(results).toEqual(["done:a1", "done:a2", "skip:a3", "done:b1"]);
    expect(Object.keys(t.starts).sort()).toEqual(["a1", "a2", "b1"]);
  });
});

// ─── 수집 단계 전체 ──────────────────────────────────────────────────────

describe("collectFeedSources — 수집 대상 14개 피드", () => {
  const urlOf = new Map(FEEDS.map((s) => [s.url, s.id] as const));
  const BBC = FEEDS.filter((s) => hostKey(s.url) === "feeds.bbci.co.uk");

  function capture() {
    const records: LogRecord[] = [];
    const logger = createLogger({
      scope: "collect",
      format: "json",
      sink: (_line, record) => records.push(record),
    });
    return { records, logger };
  }

  /** 기본: 모든 피드가 fixture XML을 바로 돌려준다 */
  const fixtureStep = (url: string): Step | undefined => {
    const id = urlOf.get(url);
    return id ? { kind: "ok", body: FEED_XML.get(id)! } : undefined;
  };

  it("정상: 호스트 9개를 동시 4개까지, 같은 호스트는 하나씩 — 결과는 설정 순서, BBC 4개는 1초 간격", async () => {
    expect(FEEDS).toHaveLength(14);
    expect(new Set(FEEDS.map((s) => hostKey(s.url))).size).toBe(9);
    const f = scriptedFetch({}, fixtureStep);
    const { records, logger } = capture();
    const result = await drain(
      collectFeedSources(FEEDS, { fetch: f.fetch, userAgent: "UA/1", logger }),
    );
    expect(result.outcomes.map((o) => o.id)).toEqual(FEEDS.map((s) => s.id));
    expect(result.outcomes.every((o) => o.ok && o.retries === 0)).toBe(true);
    expect(f.calls.map((c) => c.url).sort()).toEqual(
      FEEDS.map((s) => s.url).sort(),
    );
    expect(f.maxPerHost()).toBe(1);
    expect(f.maxInFlight()).toBeGreaterThan(1);
    expect(f.maxInFlight()).toBeLessThanOrEqual(FEED_HOST_CONCURRENCY);
    // 같은 호스트는 설정 순서대로, 앞 요청이 끝난 뒤 1초 간격(응답이 즉시라 0·1·2·3초)
    const bbcCalls = f.calls.filter((c) => urlOf.get(c.url)?.startsWith("bbc"));
    expect(bbcCalls.map((c) => urlOf.get(c.url))).toEqual(BBC.map((s) => s.id));
    expect(bbcCalls.map((c) => c.at)).toEqual(
      [0, 1, 2, 3].map((n) => n * FEED_SAME_HOST_GAP_MS),
    );
    expect(result.elapsedMs).toBe(3 * FEED_SAME_HOST_GAP_MS);
    expect(records.find((r) => r.event === "collect.feeds.done")).toMatchObject(
      {
        sources: 14,
        ok: 14,
        failed: 0,
        retried: 0,
        budget: 0,
        hosts: 9,
        concurrency: 4,
        budgetMs: FEED_STAGE_BUDGET_MS,
      },
    );
  });

  it("항목 순서는 완료 순서와 무관하다 — 응답 지연을 거꾸로 줘도 같은 결과", async () => {
    const quick = scriptedFetch({}, fixtureStep);
    const base = await drain(
      collectFeedSources(FEEDS, {
        fetch: quick.fetch,
        userAgent: "UA/1",
        logger: capture().logger,
      }),
    );
    // 설정 앞쪽일수록 늦게 응답
    const reversed = scriptedFetch({}, (url) => {
      const id = urlOf.get(url);
      if (!id) return undefined;
      const index = FEEDS.findIndex((s) => s.id === id);
      return {
        kind: "ok",
        body: FEED_XML.get(id)!,
        afterMs: (FEEDS.length - index) * 300,
      };
    });
    const slow = await drain(
      collectFeedSources(FEEDS, {
        fetch: reversed.fetch,
        userAgent: "UA/1",
        logger: capture().logger,
      }),
    );
    expect(slow.items).toEqual(base.items);
    const strip = (o: { elapsedMs: number }) => ({ ...o, elapsedMs: 0 });
    expect(slow.outcomes.map(strip)).toEqual(base.outcomes.map(strip));
  });

  it("단계 예산(90초) 초과: 응답 없는 BBC 호스트는 뒤쪽 소스가 budget, 다른 호스트는 막히지 않는다", async () => {
    const script: Record<string, Step[]> = Object.fromEntries(
      BBC.map((s): [string, Step[]] => [s.url, [{ kind: "hang" }]]),
    );
    const f = scriptedFetch(script, fixtureStep);
    const { records, logger } = capture();
    const result = await drain(
      collectFeedSources(FEEDS, { fetch: f.fetch, userAgent: "UA/1", logger }),
    );
    const byId = new Map(result.outcomes.map((o) => [o.id, o] as const));
    // BBC: ① 0~30초 timeout(재시도 1) ② 31~61초 timeout(재시도 1)
    //      ③ 62초 시작 → 77초 timeout → 79초 재시도가 90초 예산에 끊김 = budget ④ 시작 못 함 = budget(요청 없음)
    expect(
      BBC.map((s) => {
        const o = byId.get(s.id)!;
        return [s.id, o.ok, o.errorType, o.retries, o.items];
      }),
    ).toEqual([
      ["bbc-sport-football", false, "timeout", 1, 0],
      ["bbc-sport-premier-league", false, "timeout", 1, 0],
      ["bbc-sport-champions-league", false, "budget", 1, 0],
      ["bbc-sport-european", false, "budget", 0, 0],
    ]);
    expect(f.calls.map((c) => c.url)).not.toContain(BBC[3]!.url);
    expect(
      f.calls.filter((c) => c.url === BBC[2]!.url).map((c) => c.at),
    ).toEqual([62_000, 79_000]);
    expect(result.elapsedMs).toBe(FEED_STAGE_BUDGET_MS);

    // 나머지 10개는 성공, 몇 초 안에 끝났다(한 호스트가 막혀도 기다리지 않음)
    const others = result.outcomes.filter((o) => !o.id.startsWith("bbc-"));
    expect(others).toHaveLength(10);
    for (const o of others) {
      expect(o).toMatchObject({ ok: true, retries: 0 });
      expect(o.elapsedMs).toBeLessThan(5_000);
    }
    // 결과는 설정 순서
    expect(result.outcomes.map((o) => o.id)).toEqual(FEEDS.map((s) => s.id));

    // 구조화 로그: 실패 4건 모두 collect.source.fail, 재시도 3건, 예산 요약
    const fails = records.filter((r) => r.event === "collect.source.fail");
    expect(fails.map((r) => [r.source, r.errorType]).sort()).toEqual(
      BBC.map((s) => [s.id, byId.get(s.id)!.errorType]).sort(),
    );
    expect(
      records.filter((r) => r.event === "collect.source.retry"),
    ).toHaveLength(3);
    expect(
      records.find((r) => r.event === "collect.feeds.budget"),
    ).toMatchObject({
      sources: ["bbc-sport-champions-league", "bbc-sport-european"],
    });
    expect(records.find((r) => r.event === "collect.feeds.done")).toMatchObject(
      {
        sources: 14,
        ok: 10,
        failed: 4,
        retried: 3,
        budget: 2,
      },
    );
  });

  it("실패 종류·재시도 기록 — 로그에 응답 본문 없음", async () => {
    const [a, b, c, d, e] = [
      FEEDS.find((s) => s.id === "relevo")!,
      FEEDS.find((s) => s.id === "espn-soccer")!,
      FEEDS.find((s) => s.id === "di-marzio")!,
      FEEDS.find((s) => s.id === "the-athletic-football")!,
      FEEDS.find((s) => s.id === "daily-briefing")!,
    ];
    const f = scriptedFetch(
      {
        [a.url]: [{ kind: "status", status: 410 }],
        [b.url]: [{ kind: "ok", body: "<html><body>not a feed</body></html>" }],
        [c.url]: [
          { kind: "status", status: 503 },
          { kind: "ok", body: FEED_XML.get(c.id)! },
        ],
        [d.url]: [{ kind: "network" }],
        [e.url]: [
          {
            kind: "status",
            status: 301,
            headers: { location: "https://elsewhere.example.net/feed" },
          },
        ],
      },
      fixtureStep,
    );
    const { records, logger } = capture();
    const result = await drain(
      collectFeedSources(FEEDS, { fetch: f.fetch, userAgent: "UA/1", logger }),
    );
    const pick = (id: string) => {
      const o = result.outcomes.find((x) => x.id === id)!;
      return [o.ok, o.errorType ?? null, o.status ?? null, o.retries];
    };
    expect(pick("relevo")).toEqual([false, "http-4xx", 410, 0]);
    expect(pick("espn-soccer")).toEqual([false, "parse", null, 0]);
    expect(pick("di-marzio")).toEqual([true, null, null, 1]);
    expect(pick("the-athletic-football")).toEqual([false, "network", null, 1]);
    expect(pick("daily-briefing")).toEqual([false, "redirect", 301, 0]);
    expect(f.calls.map((x) => x.url)).not.toContain(
      "https://elsewhere.example.net/feed",
    );
    expect(result.outcomes.filter((o) => o.ok)).toHaveLength(10);
    expect(JSON.stringify(records)).not.toContain("not a feed");
    expect(JSON.stringify(records)).not.toContain('"body"');
  });
});

describe("resolveFeedPolicy", () => {
  it("기본값 · 덮어쓰기 · 잘못된 값은 던진다", () => {
    expect(resolveFeedPolicy()).toEqual(DEFAULT_FEED_POLICY);
    expect(resolveFeedPolicy({ stageBudgetMs: 60_000 }).stageBudgetMs).toBe(
      60_000,
    );
    expect(() => resolveFeedPolicy({ concurrency: 0 })).toThrow(/concurrency/);
    expect(() => resolveFeedPolicy({ concurrency: 1.5 })).toThrow(
      /concurrency/,
    );
    expect(() => resolveFeedPolicy({ stageBudgetMs: -1 })).toThrow(
      /stageBudgetMs/,
    );
    expect(() => resolveFeedPolicy({ timeoutMs: Number.NaN })).toThrow(
      /timeoutMs/,
    );
  });
});
