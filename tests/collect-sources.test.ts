/**
 * M1-02 — `npm run collect` 뉴스 단계가 소스 로더의 수집 대상 피드 전부를 돌고, 소스별 실패를 격리하는지 검사한다.
 *
 * 네트워크·실호출 없음: 피드는 fixtures/rss/<소스 id>.xml(수집 대상 14개와 1:1 — tests/fixtures-rss.test.ts가 보장),
 * 경기는 fixtures/football/football-data/*, LLM은 fixtures/llm/mock 또는 가짜 transport. 파일 쓰기는 임시 폴더.
 *
 * 필수 항목: 수집 대상만 요청(제외 소스·검색형은 요청 없음) · 소스 1개 실패 격리 · 여러 소스의 같은 링크 중복 없음 ·
 * 모든 소스 실패 = 뉴스 실패(브리핑 생략) · RunLog.sources 기록 · `summarize` 값과 무관하게 LLM에 기사 미전송(D23).
 * M1-03: 호스트별 병렬(같은 호스트 하나씩·동시 상한 4) · 결과·카드는 설정 순서(완료 순서 무관) · 재시도·실패 종류 ·
 * 단계 시간 예산 초과 소스도 RunLog.sources에 `{id, ok:false, items:0}`로 남음. 시각·대기는 가상 시계(feedClock)로 주입한다 —
 * 시간 계산 자체는 tests/feed-collect.test.ts(가짜 타이머).
 * M1-09(D34): 국내 5피드는 시간대 없는 pubDate를 소스 `tz`(Asia/Seoul)로 해석해 모든 항목을 쓴다(공통 형식·시간대 세부는
 * tests/feed-item.test.ts). 섹션 피드 ⊂ 전체기사 피드라 국내 같은 링크 9쌍이 더해진다.
 * M1-10(FR-07): 수집 시간 창이 소스를 합치기 전에 적용된다 — 시각은 피드 스냅샷 직후(NOW 주석), 창 계산·미래 가드는
 * tests/collect-window.test.ts.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  NewsFileSchema,
  RunsDevFileSchema,
  SourcesFileSchema,
  type NewsFile,
  type Source,
} from "@/lib/schema";

import { cardIdFor } from "../scripts/lib/card-id";
import { runCollect, type CollectDeps } from "../scripts/lib/collect-run";
import { ConfigFileError } from "../scripts/lib/config-files";
import {
  createLlmClient,
  type LlmClient,
  type LlmRequest,
  type LlmTransport,
  type MessageParams,
} from "../scripts/lib/llm";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { hostKey, type FeedClock } from "../scripts/lib/feed-collect";
import { FOOTBALL_DATA_BASE_URL } from "../scripts/lib/providers/football-data";
import {
  feedUserAgent,
  parseFeedXml,
  type FetchLike,
} from "../scripts/lib/rss";
import { planDailySources } from "../scripts/lib/sources";

// ─── fixtures ────────────────────────────────────────────────────────────

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const SOURCES: Source[] = SourcesFileSchema.parse(
  JSON.parse(read("configs/sources.json")),
);
const PLAN = planDailySources(SOURCES);
const FEEDS = PLAN.feeds;
const byId = (id: string): Source => {
  const source = SOURCES.find((s) => s.id === id);
  if (!source) throw new Error(`configs에 없는 소스: ${id}`);
  return source;
};
const FEED_XML = new Map(
  FEEDS.map((s) => [s.id, read(`fixtures/rss/${s.id}.xml`)] as const),
);
const RSS_INDEX = JSON.parse(read("fixtures/rss/index.json")) as {
  sources: Array<{
    id: string;
    items: Array<{ title: string; link: string }>;
  }>;
};
const FD_MATCHES_1010 = read(
  "fixtures/football/football-data/matches-6comps-2026-10-10.json",
);

/**
 * 피드 fixture 스냅샷(fixtures/rss/index.json `collectedAt` 2026-10-11T06:17:17Z) 직후 = 15:20 KST 2026-10-11 —
 * 발행일 2026-10-11(mock 브리핑 fixture가 있는 날). 수집 시간 창(M1-10)이 생겨 시계가 스냅샷보다 이르면 스냅샷 항목이
 * "미래"가 된다 — 이 파일은 스냅샷과 같은 시점의 수집을 재현한다. runs.json이 없으므로 창은 51시간(첫 실행, D36):
 * [2026-10-09T03:20Z, 현재 + 5분] → 쓸 수 있는 69건 중 5건(10-07 이전)이 창 밖. 창 자체는 tests/collect-window.test.ts.
 */
const NOW = new Date("2026-10-11T06:20:00.000Z");

const KOREAN_FEEDS = [
  "interfootball-world",
  "interfootball-all",
  "footballist-football",
  "besteleven-world",
  "besteleven-all",
];

// ─── 도우미 ──────────────────────────────────────────────────────────────

type Route = string | Response | Error | (() => Response);

interface FakeFetch {
  fetch: FetchLike;
  calls: string[];
  maxInFlight: () => number;
  /** 호스트 하나에 동시에 나간 요청 수의 최댓값 */
  maxPerHost: () => number;
}

/**
 * 수집 대상 피드 URL은 fixture XML(또는 소스 id별 덮어쓰기), football-data는 경기 fixture를 돌려준다.
 * 그 밖의 URL은 실패시킨다(제외 소스를 요청하면 테스트가 잡는다). 동시 요청 수(전체·호스트별)도 잰다.
 * `delayMs`가 있으면 그 소스는 실제 시간으로 그만큼 늦게 응답한다(완료 순서 바꾸기용, 짧게).
 */
function fakeFetch(
  overrides: Record<string, Route> = {},
  sources: readonly Source[] = SOURCES,
  delayMs: (id: string) => number = () => 0,
): FakeFetch {
  const calls: string[] = [];
  let inFlight = 0;
  let max = 0;
  const perHost = new Map<string, number>();
  let maxPerHost = 0;
  const idByUrl = new Map(sources.map((s) => [s.url, s.id] as const));
  const respond = (route: Route): Response => {
    if (route instanceof Error) throw route;
    if (route instanceof Response) return route.clone();
    if (typeof route === "function") return route();
    return new Response(route, { status: 200 });
  };
  return {
    calls,
    maxInFlight: () => max,
    maxPerHost: () => maxPerHost,
    fetch: async (url) => {
      calls.push(url);
      const host = hostKey(url);
      inFlight += 1;
      max = Math.max(max, inFlight);
      perHost.set(host, (perHost.get(host) ?? 0) + 1);
      maxPerHost = Math.max(maxPerHost, perHost.get(host)!);
      try {
        await Promise.resolve();
        if (url.startsWith(FOOTBALL_DATA_BASE_URL)) {
          return respond(FD_MATCHES_1010);
        }
        const id = idByUrl.get(url);
        if (id === undefined) {
          throw new Error(`테스트에서 예상하지 못한 URL: ${url}`);
        }
        const route = overrides[id] ?? FEED_XML.get(id);
        if (route === undefined) {
          throw new Error(`fixture가 없는 소스를 요청함: ${id}`);
        }
        const delay = delayMs(id);
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        return respond(route);
      } finally {
        inFlight -= 1;
        perHost.set(host, perHost.get(host)! - 1);
      }
    },
  };
}

/** 가상 시계 — 대기(같은 호스트 간격·재시도 대기)는 실제로 기다리지 않고 시각만 앞으로 민다 */
function virtualClock(): { clock: FeedClock; advance: (ms: number) => void } {
  let t = 0;
  return {
    clock: {
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-sources-run-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function makeDeps(
  over: Partial<CollectDeps> = {},
  fetcher: FakeFetch = fakeFetch(),
) {
  const printed: string[] = [];
  const records: LogRecord[] = [];
  const logger = createLogger({
    scope: "collect",
    format: "json",
    sink: (_line, record) => records.push(record),
  });
  const llmRequests: LlmRequest[] = [];
  let llmCreated = 0;
  const deps: CollectDeps = {
    rootDir: ROOT,
    dataDir,
    env: "dev",
    llmMode: "mock",
    dry: false,
    limit: 45,
    now: () => NOW,
    fetch: fetcher.fetch,
    userAgent: feedUserAgent("test@example.com"),
    feedClock: virtualClock().clock,
    footballDataApiKey: "test-football-data-key",
    footballDataSleep: async () => undefined,
    createLlm: () => {
      llmCreated += 1;
      const client = createLlmClient({ mode: "mock", logger: () => undefined });
      return spyClient(client, llmRequests);
    },
    resolveBriefConfig: () => ({
      model: "claude-haiku-5-5",
      budgets: { dailyBudgetUsd: 0.1, monthlyBudgetUsd: 3 },
    }),
    logger,
    print: (text) => printed.push(text),
    ...over,
  };
  return {
    deps,
    printed,
    records,
    fetcher,
    llmRequests,
    llmCreated: () => llmCreated,
  };
}

function spyClient(
  client: Pick<LlmClient, "callSingle" | "model">,
  requests: LlmRequest[],
): Pick<LlmClient, "callSingle" | "model"> {
  return {
    model: client.model,
    callSingle: (request, options) => {
      requests.push(request);
      return client.callSingle(request, options);
    },
  };
}

/** callSingle만 쓰는 가짜 live transport */
function fakeLiveTransport(text: string): {
  transport: LlmTransport;
  params: MessageParams[];
} {
  const params: MessageParams[] = [];
  const unused = () => {
    throw new Error("배치는 쓰지 않는다");
  };
  return {
    params,
    transport: {
      async createMessage(p) {
        params.push(p);
        return {
          content: [{ type: "text", text }],
          stop_reason: "end_turn",
          usage: {
            input_tokens: 6590,
            output_tokens: 3231,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        };
      },
      createBatch: unused,
      retrieveBatch: unused,
      cancelBatch: unused,
      batchResults: unused,
    },
  };
}

function readNews(date: string): NewsFile {
  return NewsFileSchema.parse(
    JSON.parse(
      readFileSync(path.join(dataDir, "news", `${date}.json`), "utf8"),
    ),
  );
}

function newsFiles(): string[] {
  try {
    return readdirSync(path.join(dataDir, "news"));
  } catch {
    return [];
  }
}

/** 오류 본문이 깨지는 응답 — fetchFeedXml이 감싸지 않는 예외(errorType "unexpected") */
function brokenBodyResponse(): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new Error("stream broken"));
      },
    }),
    { status: 200 },
  );
}

// ─── 수집 대상 전부 ──────────────────────────────────────────────────────

describe("runCollect — configs의 수집 대상 피드 전부", () => {
  it("수집 대상 14개 피드만 한 번씩 요청(다른 호스트 동시·같은 호스트 하나씩 설정 순서), 제외 소스·검색형은 요청하지 않는다", async () => {
    const { deps, fetcher, records } = makeDeps();
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("success");

    const feedCalls = fetcher.calls.filter(
      (url) => !url.startsWith(FOOTBALL_DATA_BASE_URL),
    );
    expect([...feedCalls].sort()).toEqual(FEEDS.map((s) => s.url).sort());
    // 호스트별 병렬(M1-03): 동시 요청은 2~4개, 호스트 하나에는 항상 1개
    expect(fetcher.maxInFlight()).toBeGreaterThan(1);
    expect(fetcher.maxInFlight()).toBeLessThanOrEqual(4);
    expect(fetcher.maxPerHost()).toBe(1);
    // 같은 호스트(BBC 4·interfootball 2·besteleven 2)는 설정 순서대로
    for (const host of new Set(FEEDS.map((s) => hostKey(s.url)))) {
      expect(feedCalls.filter((url) => hostKey(url) === host)).toEqual(
        FEEDS.filter((s) => hostKey(s.url) === host).map((s) => s.url),
      );
    }
    for (const ex of PLAN.excluded) {
      expect(fetcher.calls).not.toContain(byId(ex.id).url);
    }

    // 제외 사유는 소스마다 구조화 로그 한 줄
    const skips = records.filter((r) => r.event === "collect.source.skip");
    expect(skips.map((r) => [r.source, r.reason])).toEqual(
      PLAN.excluded.map((e) => [e.id, e.reason]),
    );
    expect(
      records.find((r) => r.event === "collect.sources.plan"),
    ).toMatchObject({
      feeds: 14,
      crawls: 0,
      excluded: 12,
      byReason: { disabled: 12 },
    });
  });

  it("소스별 결과 — 받은 항목 = 쓸 수 있는 항목(국내 5피드 포함 — tz Asia/Seoul, M1-09·D34), 건너뛴 항목 없음", async () => {
    const { deps, records } = makeDeps();
    const outcome = await runCollect(deps);
    const sources = outcome.news.sources;
    expect(sources.map((s) => s.id)).toEqual(FEEDS.map((s) => s.id));
    expect(sources.every((s) => s.ok)).toBe(true);
    for (const s of sources) {
      const indexed = RSS_INDEX.sources.find((x) => x.id === s.id)!;
      expect(s.items).toBe(indexed.items.length);
      expect(s.usable).toBe(s.items);
      expect(s.skipped).toEqual({});
    }
    const korean = sources.filter((s) => KOREAN_FEEDS.includes(s.id));
    expect(korean.map((s) => [s.id, s.usable])).toEqual([
      ["interfootball-world", 4],
      ["interfootball-all", 8],
      ["footballist-football", 4],
      ["besteleven-world", 5],
      ["besteleven-all", 7],
    ]);
    // 건너뛴 항목이 없으니 no-date·schema 경고도 없다
    expect(records.filter((r) => r.event === "collect.item.skip")).toEqual([]);
    expect(outcome.news.feedItems).toBe(
      RSS_INDEX.sources.reduce((sum, s) => sum + s.items.length, 0),
    );
    expect(outcome.news.excluded).toEqual(PLAN.excluded);
  });

  it("카드 상한 45(MAX_ITEMS_PER_RUN) — 쓸 수 있는 69건 → 창 안 64건(M1-10) → 고유 링크 52건 → 최신순 45장", async () => {
    const { deps, records } = makeDeps();
    const outcome = await runCollect(deps);
    const file = readNews("2026-10-11");
    expect(file.cards).toHaveLength(45);
    expect(outcome.news.selected).toBe(45);
    expect(
      records.find((r) => r.event === "collect.select.done"),
    ).toMatchObject({
      usable: 69,
      inWindow: 64,
      unique: 52,
      duplicateLinks: 12,
      selected: 45,
      limit: 45,
    });
    const times = file.cards.map((c) => Date.parse(c.src[0]!.at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("여러 소스의 같은 링크는 카드 1장 — 설정 순서상 먼저 나온 소스가 갖는다, 제목·링크는 피드 원문", async () => {
    // 상한을 넉넉히 줘서 고유 링크 전부를 카드로 만든다(상한 적용은 위 테스트)
    const { deps, records } = makeDeps({ limit: 100 });
    const outcome = await runCollect(deps);
    const file = readNews("2026-10-11");
    const links = file.cards.map((c) => c.src[0]!.u);
    // 창 안 64건 중 같은 링크 12쌍(BBC 피드 사이 2쌍 + BBC 피드 안 1쌍 + 국내 섹션 ⊂ 전체기사 9쌍) → 52장
    expect(file.cards).toHaveLength(52);
    expect(new Set(links).size).toBe(file.cards.length);
    expect(new Set(file.cards.map((c) => c.id)).size).toBe(file.cards.length);
    expect(outcome.news.selected).toBe(52);
    expect(
      records.find((r) => r.event === "collect.select.done"),
    ).toMatchObject({
      usable: 69,
      inWindow: 64,
      unique: 52,
      duplicateLinks: 12,
      selected: 52,
    });

    // 원제목·링크 무수정(엔티티 디코딩·앞뒤 공백 정리만) — 원문 항목은 fixture index에서 찾는다
    const indexByLink = new Map(
      RSS_INDEX.sources.flatMap((s) =>
        s.items.map((i) => [i.link, i] as const),
      ),
    );
    for (const card of file.cards) {
      const original = indexByLink.get(card.src[0]!.u);
      expect(original).toBeDefined();
      expect(card.id).toBe(cardIdFor(original!.link));
      expect(card).toMatchObject({ ai: false, s: [] });
    }

    // BBC Football(대회 태그 없음)과 Premier League 피드(EPL)에 함께 있는 링크 → 먼저 나온 BBC Football 카드
    const shared = file.cards.find((c) =>
      c.src[0]!.u.includes("/articles/cqn73g3pvezdo"),
    )!;
    expect(shared.comp).toEqual([]);
    // Champions League(UCL)와 European(4개 리그)에 함께 있는 링크는 10-07 기사라 51시간 창 밖 — 카드 없음(M1-10)
    expect(
      file.cards.some((c) => c.src[0]!.u.includes("/articles/ckrey77jq1n7o")),
    ).toBe(false);
    expect(outcome.news.windowStats).toMatchObject({
      total: 69,
      inWindow: 64,
      outOfWindow: 5,
      futureClamped: 0,
      future: 0,
    });

    // 국내: 섹션 피드(설정 앞)와 전체기사 피드에 함께 있는 링크 → 섹션 피드 카드(출처명은 매체명), 발행 시각은 KST → UTC
    const interfootball = file.cards.find(
      (c) =>
        c.src[0]!.u ===
        "https://www.interfootball.co.kr/news/articleView.html?idxno=696174",
    )!;
    expect(interfootball).toMatchObject({
      lang: "ko",
      ai: false,
      s: [],
      src: [
        {
          n: "인터풋볼",
          u: "https://www.interfootball.co.kr/news/articleView.html?idxno=696174",
          at: "2026-10-11T04:55:17.000Z", // 2026-10-11 13:55:17 KST
          tier: 3,
        },
      ],
    });
  });

  it("카드 상한(슬라이스 기본 5)은 소스를 합친 뒤 최신순으로 적용한다", async () => {
    const { deps } = makeDeps({ limit: 5 });
    const outcome = await runCollect(deps);
    const file = readNews("2026-10-11");
    expect(file.cards).toHaveLength(5);
    expect(outcome.news.selected).toBe(5);
    const times = file.cards.map((c) => Date.parse(c.src[0]!.at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("소스 결과·카드는 응답 완료 순서와 무관하다 — 설정 앞쪽 소스가 늦게 응답해도 같은 파일", async () => {
    const base = makeDeps();
    const baseOutcome = await runCollect(base.deps);
    const baseFile = readNews("2026-10-11");
    rmSync(path.join(dataDir, "news"), { recursive: true, force: true });

    // 설정 앞쪽일수록 늦게(실제 시간 수 ms) — 완료 순서가 설정 순서와 거꾸로
    const order = FEEDS.map((s) => s.id);
    const reversed = makeDeps(
      {},
      fakeFetch({}, SOURCES, (id) => (order.length - order.indexOf(id)) * 3),
    );
    const outcome = await runCollect(reversed.deps);
    const completion = reversed.records
      .filter((r) => r.event === "collect.source.fetch")
      .map((r) => r.source);
    expect(completion).not.toEqual(order);
    const strip = (o: { elapsedMs: number }) => ({ ...o, elapsedMs: 0 });
    expect(outcome.news.sources.map(strip)).toEqual(
      baseOutcome.news.sources.map(strip),
    );
    // runId만 실행마다 다르다(무작위 접미사) — 카드는 순서까지 같다
    expect(readNews("2026-10-11").cards).toEqual(baseFile.cards);
  });
});

// ─── 실패 격리 ───────────────────────────────────────────────────────────

describe("runCollect — 소스별 실패 격리", () => {
  const failures: Record<string, Route> = {
    "bbc-sport-premier-league": new Response("busy", { status: 503 }),
    "espn-soccer": "<html><body>not a feed</body></html>",
    "the-athletic-football": new TypeError("fetch failed"),
    "daily-briefing": () => brokenBodyResponse(),
  };

  it("실패한 소스만 건너뛰고 나머지 카드는 발행한다(partial, exit 0), 브리핑도 진행", async () => {
    const { deps, records, llmRequests } = makeDeps({}, fakeFetch(failures));
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("partial");
    expect(outcome.news.ok).toBe(true);
    expect(outcome.brief.state).toBe("done");
    expect(llmRequests).toHaveLength(1);

    // 503·네트워크·본문 끊김은 1회 재시도 후 실패, 파싱 실패는 재시도 없음(M1-03)
    const failed = outcome.news.sources.filter((s) => !s.ok);
    expect(
      failed.map((s) => [
        s.id,
        s.errorType,
        s.status ?? null,
        s.items,
        s.retries,
      ]),
    ).toEqual([
      ["bbc-sport-premier-league", "http-5xx", 503, 0, 1],
      ["the-athletic-football", "network", null, 0, 1],
      ["espn-soccer", "parse", null, 0, 0],
      ["daily-briefing", "network", 200, 0, 1],
    ]);
    expect(outcome.news.sources.filter((s) => s.ok)).toHaveLength(10);

    // 실패 소스의 카드는 없고, 성공 소스의 카드는 있다
    const file = readNews("2026-10-11");
    const hosts = new Set(file.cards.map((c) => new URL(c.src[0]!.u).host));
    expect(hosts.has("www.nytimes.com")).toBe(false);
    expect(hosts.has("www.espn.com")).toBe(false);
    expect(hosts.has("www.bbc.co.uk")).toBe(true);
    expect(hosts.has("www.gianlucadimarzio.com")).toBe(true);

    // 로그는 완료 순서로 나온다 — 집합으로 비교
    const fails = records.filter((r) => r.event === "collect.source.fail");
    expect(fails.map((r) => [r.source, r.errorType, r.retries]).sort()).toEqual(
      failed.map((s) => [s.id, s.errorType, s.retries]).sort(),
    );
    expect(
      records
        .filter((r) => r.event === "collect.source.retry")
        .map((r) => r.source)
        .sort(),
    ).toEqual([
      "bbc-sport-premier-league",
      "daily-briefing",
      "the-athletic-football",
    ]);
    // 로그에 응답 본문을 남기지 않는다
    expect(JSON.stringify(records)).not.toContain("not a feed");
    expect(JSON.stringify(records)).not.toContain('"busy"');
  });

  it("모든 피드가 실패하면 뉴스 실패(exit 1) — 브리핑(football-data·LLM)을 부르지 않고 파일도 쓰지 않는다", async () => {
    const all = Object.fromEntries(
      FEEDS.map((s) => [s.id, new Response("x", { status: 500 })] as const),
    );
    const fetcher = fakeFetch(all);
    const { deps, llmCreated, records } = makeDeps({}, fetcher);
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.status).toBe("failed");
    expect(outcome.news.error).toMatch(/모든 피드 소스 수집 실패\(14개\)/);
    expect(outcome.news.sources).toHaveLength(14);
    expect(outcome.brief).toEqual({
      state: "skipped",
      reason: "news-failed",
      inputMatches: 0,
    });
    expect(llmCreated()).toBe(0);
    expect(
      fetcher.calls.some((url) => url.startsWith(FOOTBALL_DATA_BASE_URL)),
    ).toBe(false);
    expect(newsFiles()).toEqual([]);
    expect(records.find((r) => r.event === "collect.news.fail")).toMatchObject({
      reason: "all-sources-failed",
      sources: 14,
    });
  });

  it("수집 대상 피드가 0개면(모두 비활성·검색형) 요청 없이 뉴스 실패(exit 1)", async () => {
    const fetcher = fakeFetch();
    const { deps } = makeDeps(
      {
        loadSources: async () => [
          byId("sky-sports-football"),
          byId("gdelt-doc"),
          { ...byId("gdelt-doc"), id: "gdelt-on", enabled: true },
        ],
      },
      fetcher,
    );
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.news.error).toMatch(/수집 대상 피드 소스가 없다/);
    expect(outcome.news.excluded.map((e) => [e.id, e.reason])).toEqual([
      ["sky-sports-football", "disabled"],
      ["gdelt-doc", "disabled"],
      ["gdelt-on", "search-type"],
    ]);
    expect(fetcher.calls).toEqual([]);
  });

  it("소스 설정을 읽지 못하면 뉴스 실패(exit 1)", async () => {
    const fetcher = fakeFetch();
    const { deps, records } = makeDeps(
      {
        loadSources: async () => {
          throw new ConfigFileError(
            "configs/sources.json 스키마 검증 실패(1건)",
          );
        },
      },
      fetcher,
    );
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.status).toBe("failed");
    expect(fetcher.calls).toEqual([]);
    expect(
      records.find((r) => r.event === "collect.source.config"),
    ).toBeDefined();
  });

  it("실행 기록(live·dry): RunLog.sources에 소스마다 id·ok·items + 성공은 usable(창 안 건수)·실패는 error(종류), 상태 partial (D35)", async () => {
    const fake = fakeLiveTransport(
      JSON.stringify({
        l: [{ t: "Chelsea가 Bournemouth를 5-1로 꺾었다.", r: ["m560595"] }],
      }),
    );
    const { deps } = makeDeps(
      {
        llmMode: "live",
        dry: true,
        createLlm: () =>
          createLlmClient({
            mode: "live",
            model: "claude-haiku-5-5",
            transport: fake.transport,
            logger: () => undefined,
          }),
      },
      fakeFetch({ relevo: new Response("gone", { status: 410 }) }),
    );
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(fake.params).toHaveLength(1);
    const runs = RunsDevFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs-dev.json"), "utf8")),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("partial");
    const inWindow = outcome.news.windowStats!.bySource;
    expect(runs[0]!.sources).toEqual(
      outcome.news.sources.map((s) =>
        s.ok
          ? {
              id: s.id,
              ok: true,
              items: s.items,
              usable: inWindow[s.id]?.inWindow ?? 0,
            }
          : { id: s.id, ok: false, items: 0, error: s.errorType },
      ),
    );
    expect(runs[0]!.sources.find((s) => s.id === "relevo")).toEqual({
      id: "relevo",
      ok: false,
      items: 0,
      error: "http-4xx",
    });
    // usable = 정규화·창 적용 뒤(중복 제거 전) — 원문 items보다 클 수 없고, 합은 창 안 전체와 같다
    for (const entry of runs[0]!.sources) {
      if (entry.ok) expect(entry.usable).toBeLessThanOrEqual(entry.items);
    }
    expect(runs[0]!.sources.reduce((sum, s) => sum + (s.usable ?? 0), 0)).toBe(
      outcome.news.windowStats!.inWindow,
    );
    expect(runs[0]!.collected).toBe(outcome.news.feedItems);
    expect(newsFiles()).toEqual([]);
  });

  it("단계 시간 예산을 넘으면 시작하지 못한 소스는 budget — 실행은 partial, RunLog.sources에 {id, ok:false, items:0, error:'budget'}", async () => {
    // 첫 소스 요청 순간 가상 시계가 예산(90초)을 넘긴다 → 나머지 13개는 시작하지 않는다
    const v = virtualClock();
    const fetcher = fakeFetch();
    const first = FEEDS[0]!;
    const fake = fakeLiveTransport(
      JSON.stringify({
        l: [{ t: "Chelsea가 Bournemouth를 5-1로 꺾었다.", r: ["m560595"] }],
      }),
    );
    const { deps, records } = makeDeps(
      {
        llmMode: "live",
        dry: true,
        feedClock: v.clock,
        fetch: (url, init) => {
          if (url === first.url) v.advance(100_000);
          return fetcher.fetch(url, init);
        },
        createLlm: () =>
          createLlmClient({
            mode: "live",
            model: "claude-haiku-5-5",
            transport: fake.transport,
            logger: () => undefined,
          }),
      },
      fetcher,
    );
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("partial");
    expect(
      outcome.news.sources.map((s) => [s.id, s.ok, s.errorType ?? null]),
    ).toEqual(
      FEEDS.map((s, i) =>
        i === 0 ? [s.id, true, null] : [s.id, false, "budget"],
      ),
    );
    // 시작하지 못한 소스는 요청하지 않았다
    const feedCalls = fetcher.calls.filter(
      (url) => !url.startsWith(FOOTBALL_DATA_BASE_URL),
    );
    expect(feedCalls).toEqual([first.url]);

    const runs = RunsDevFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs-dev.json"), "utf8")),
    );
    expect(runs[0]!.status).toBe("partial");
    expect(runs[0]!.sources).toEqual(
      FEEDS.map((s, i) =>
        i === 0
          ? {
              id: s.id,
              ok: true,
              items: outcome.news.sources[0]!.items,
              usable: outcome.news.windowStats!.bySource[s.id]?.inWindow ?? 0,
            }
          : { id: s.id, ok: false, items: 0, error: "budget" },
      ),
    );
    expect(runs[0]!.sources[0]!.items).toBeGreaterThan(0);
    expect(
      records.find((r) => r.event === "collect.feeds.budget"),
    ).toMatchObject({ sources: FEEDS.slice(1).map((s) => s.id) });
  });
});

// ─── summarize 무관 LLM 미전송 (D23) ─────────────────────────────────────

describe("summarize 값과 무관하게 기사는 LLM에 보내지 않는다 (D23, plan M1-02)", () => {
  it("summarize:true인 소스가 있어도 원제목+링크 카드(ai:false, s:[])이고, 브리핑 요청에 피드 제목·링크가 없다", async () => {
    const bbcSummarize = { ...byId("bbc-sport-football"), summarize: true };
    const athletic = byId("the-athletic-football");
    const sources = [bbcSummarize, athletic];
    const { deps, llmRequests } = makeDeps(
      { loadSources: async () => sources },
      fakeFetch({}, sources),
    );
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.news.sources.map((s) => [s.id, s.ok])).toEqual([
      ["bbc-sport-football", true],
      ["the-athletic-football", true],
    ]);

    const file = readNews("2026-10-11");
    expect(file.cards.length).toBeGreaterThan(0);
    for (const card of file.cards) {
      expect(card).toMatchObject({ ai: false, s: [] });
    }

    // 브리핑은 정형 경기 데이터만 — 두 피드의 모든 원문 항목(선별되지 않은 것 포함)의 제목·링크가 요청에 없다
    expect(llmRequests).toHaveLength(1);
    const request = llmRequests[0]!;
    expect(Object.keys(JSON.parse(request.user))).toEqual([
      "briefDate",
      "matches",
    ]);
    const body = `${request.system}\n${request.user}`;
    for (const id of ["bbc-sport-football", "the-athletic-football"]) {
      for (const item of await parseFeedXml(FEED_XML.get(id)!)) {
        expect(body).not.toContain(item.title!.trim());
        expect(body).not.toContain(item.link!.trim());
      }
    }
    for (const host of ["bbc.co.uk", "nytimes.com", "/athletic/"]) {
      expect(request.user).not.toContain(host);
    }
  });
});

// ─── 검색형 소스 (M1-06 — 계획만, 실행 없음) ─────────────────────────────

describe("runCollect — 검색형 소스는 계획만 하고 요청하지 않는다 (M1-06, D32)", () => {
  const GDELT_URL = byId("gdelt-doc").url;
  const searchRecords = (records: LogRecord[]) =>
    records.filter((r) => r.event.startsWith("collect.search."));

  it("현재 configs — 활성 쿼리 0개면 collect.search.skip 한 줄로 끝난다", async () => {
    const { deps, records, fetcher } = makeDeps();
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("success");
    expect(searchRecords(records)).toEqual([
      expect.objectContaining({
        level: "info",
        event: "collect.search.skip",
        reason: "no-active-queries",
        queries: 9,
        maxEnabled: 10,
        byReason: { "query-disabled": 9 },
      }),
    ]);
    expect(outcome.news.search).toMatchObject({
      active: 0,
      skippedSources: [],
    });
    expect(outcome.news.search?.excluded).toHaveLength(9);
    expect(fetcher.calls.some((url) => url.startsWith(GDELT_URL))).toBe(false);
  });

  it("활성 쿼리가 생겨도 어댑터가 없으면 경고만 남기고 건너뛴다 — 검색 요청 없음, 발행·상태는 그대로", async () => {
    const sources = SOURCES.map((s) =>
      s.id === "gdelt-doc" ? { ...s, enabled: true } : s,
    );
    const { deps, records, fetcher } = makeDeps(
      {
        loadSources: async () => sources,
        loadSearchQueries: async () => ({
          maxEnabled: 10,
          queries: [
            {
              id: "gd-on",
              source: "gdelt-doc",
              q: '"Lee Kang-in"',
              lang: "en",
              purpose: "korean",
              enabled: true,
            },
            {
              id: "gd-off",
              source: "gdelt-doc",
              q: '"Kim Min-jae"',
              lang: "en",
              purpose: "korean",
              enabled: false,
            },
            {
              id: "wrong-source",
              source: "bbc-sport-football",
              q: "transfer",
              lang: "en",
              purpose: "transfer",
              enabled: true,
            },
          ],
        }),
      },
      fakeFetch({}, sources),
    );
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("success");
    expect(outcome.news.ok).toBe(true);
    // 꺼 둔 쿼리(gd-off)는 debug라 기본 출력에 없다. 설정이 어긋난 쿼리·어댑터 없는 소스는 warn
    expect(
      searchRecords(records).map((r) => [
        r.level,
        r.event,
        r.source,
        r.reason,
        r.query ?? r.queries,
      ]),
    ).toEqual([
      [
        "warn",
        "collect.search.query.skip",
        "bbc-sport-football",
        "source-not-search",
        "wrong-source",
      ],
      ["warn", "collect.search.skip", "gdelt-doc", "no-adapter", 1],
    ]);
    expect(outcome.news.search).toMatchObject({
      active: 1,
      skippedSources: [
        { source: "gdelt-doc", queries: 1, reason: "no-adapter" },
      ],
    });
    expect(fetcher.calls.some((url) => url.startsWith(GDELT_URL))).toBe(false);
  });

  it("검색 쿼리 설정을 읽지 못해도 피드 수집·발행은 계속된다(collect.search.fail)", async () => {
    const { deps, records } = makeDeps({
      loadSearchQueries: async () => {
        throw new ConfigFileError(
          "configs/search-queries.json 스키마 검증 실패(1건) — npm run validate로 확인할 것",
        );
      },
    });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.news.ok).toBe(true);
    expect(outcome.news.added).toBeGreaterThan(0);
    expect(outcome.news.search?.error).toMatch(/search-queries\.json/);
    expect(searchRecords(records)).toEqual([
      expect.objectContaining({
        level: "error",
        event: "collect.search.fail",
        reason: "config",
      }),
    ]);
  });
});
