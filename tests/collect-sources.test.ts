/**
 * M1-02 — `npm run collect` 뉴스 단계가 소스 로더의 수집 대상 피드 전부를 돌고, 소스별 실패를 격리하는지 검사한다.
 *
 * 네트워크·실호출 없음: 피드는 fixtures/rss/<소스 id>.xml(수집 대상 14개와 1:1 — tests/fixtures-rss.test.ts가 보장),
 * 경기는 fixtures/football/football-data/*, LLM은 fixtures/llm/mock 또는 가짜 transport. 파일 쓰기는 임시 폴더.
 *
 * 필수 항목: 수집 대상만 요청(제외 소스·검색형은 요청 없음) · 소스 1개 실패 격리 · 여러 소스의 같은 링크 중복 없음 ·
 * 모든 소스 실패 = 뉴스 실패(브리핑 생략) · RunLog.sources 기록 · `summarize` 값과 무관하게 LLM에 기사 미전송(D23).
 * 알려진 한계(M1-09): 국내 피드는 시간대 없는 날짜라 모든 항목이 `no-date`로 건너뛴다 — 여기서는 그 사실을 고정만 한다.
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

/** 06:30 KST 2026-10-11 = 2026-10-10T21:30Z — 발행일 2026-10-11(mock 브리핑 fixture가 있는 날) */
const NOW = new Date("2026-10-10T21:30:00.000Z");

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
}

/**
 * 수집 대상 피드 URL은 fixture XML(또는 소스 id별 덮어쓰기), football-data는 경기 fixture를 돌려준다.
 * 그 밖의 URL은 실패시킨다(제외 소스를 요청하면 테스트가 잡는다). 동시 요청 수도 잰다.
 */
function fakeFetch(
  overrides: Record<string, Route> = {},
  sources: readonly Source[] = SOURCES,
): FakeFetch {
  const calls: string[] = [];
  let inFlight = 0;
  let max = 0;
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
    fetch: async (url) => {
      calls.push(url);
      inFlight += 1;
      max = Math.max(max, inFlight);
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
        return respond(route);
      } finally {
        inFlight -= 1;
      }
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
  it("수집 대상 14개 피드만 설정 순서대로 하나씩 요청하고, 제외 소스·검색형은 요청하지 않는다", async () => {
    const { deps, fetcher, records } = makeDeps();
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("success");

    const feedCalls = fetcher.calls.filter(
      (url) => !url.startsWith(FOOTBALL_DATA_BASE_URL),
    );
    expect(feedCalls).toEqual(FEEDS.map((s) => s.url));
    expect(fetcher.maxInFlight()).toBe(1);
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

  it("소스별 결과 — 받은 항목·쓸 수 있는 항목, 국내 피드는 시간대 없는 날짜라 전부 no-date(M1-09 전 알려진 한계)", async () => {
    const { deps } = makeDeps();
    const outcome = await runCollect(deps);
    const sources = outcome.news.sources;
    expect(sources.map((s) => s.id)).toEqual(FEEDS.map((s) => s.id));
    expect(sources.every((s) => s.ok)).toBe(true);
    for (const s of sources) {
      const indexed = RSS_INDEX.sources.find((x) => x.id === s.id)!;
      expect(s.items).toBe(indexed.items.length);
      if (KOREAN_FEEDS.includes(s.id)) {
        expect(s.usable).toBe(0);
        expect(s.skipped).toEqual({ "no-date": s.items });
      } else {
        expect(s.usable).toBe(s.items);
        expect(s.skipped).toEqual({});
      }
    }
    expect(outcome.news.feedItems).toBe(
      RSS_INDEX.sources.reduce((sum, s) => sum + s.items.length, 0),
    );
    expect(outcome.news.excluded).toEqual(PLAN.excluded);
  });

  it("여러 소스의 같은 링크는 카드 1장 — 설정 순서상 먼저 나온 소스가 갖는다, 제목·링크는 피드 원문", async () => {
    const { deps, records } = makeDeps();
    const outcome = await runCollect(deps);
    const file = readNews("2026-10-11");
    const links = file.cards.map((c) => c.src[0]!.u);
    // 쓸 수 있는 41건 중 같은 링크 4쌍(BBC 피드 사이 3쌍 + BBC 피드 안 1쌍) → 37장
    expect(file.cards).toHaveLength(37);
    expect(new Set(links).size).toBe(file.cards.length);
    expect(new Set(file.cards.map((c) => c.id)).size).toBe(file.cards.length);
    expect(outcome.news.selected).toBe(37);
    expect(
      records.find((r) => r.event === "collect.select.done"),
    ).toMatchObject({
      usable: 41,
      unique: 37,
      duplicateLinks: 4,
      selected: 37,
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
    // Champions League(UCL)와 European(4개 리그)에 함께 있는 링크 → Champions League 카드
    const ucl = file.cards.find((c) =>
      c.src[0]!.u.includes("/articles/ckrey77jq1n7o"),
    )!;
    expect(ucl.comp).toEqual(["UCL"]);
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

    const failed = outcome.news.sources.filter((s) => !s.ok);
    expect(
      failed.map((s) => [s.id, s.errorType, s.status ?? null, s.items]),
    ).toEqual([
      ["bbc-sport-premier-league", "fetch", 503, 0],
      ["the-athletic-football", "fetch", null, 0],
      ["espn-soccer", "parse", null, 0],
      ["daily-briefing", "unexpected", null, 0],
    ]);
    expect(outcome.news.sources.filter((s) => s.ok)).toHaveLength(10);

    // 실패 소스의 카드는 없고, 성공 소스의 카드는 있다
    const file = readNews("2026-10-11");
    const hosts = new Set(file.cards.map((c) => new URL(c.src[0]!.u).host));
    expect(hosts.has("www.nytimes.com")).toBe(false);
    expect(hosts.has("www.espn.com")).toBe(false);
    expect(hosts.has("www.bbc.co.uk")).toBe(true);
    expect(hosts.has("www.gianlucadimarzio.com")).toBe(true);

    const fails = records.filter((r) => r.event === "collect.source.fail");
    expect(fails.map((r) => [r.source, r.errorType])).toEqual(
      failed.map((s) => [s.id, s.errorType]),
    );
    // 로그에 응답 본문을 남기지 않는다
    expect(JSON.stringify(fails)).not.toContain("not a feed");
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

  it("실행 기록(live·dry): RunLog.sources에 소스마다 id·ok·items, 상태 partial", async () => {
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
    expect(runs[0]!.sources).toEqual(
      outcome.news.sources.map((s) => ({ id: s.id, ok: s.ok, items: s.items })),
    );
    expect(runs[0]!.sources.find((s) => s.id === "relevo")).toEqual({
      id: "relevo",
      ok: false,
      items: 0,
    });
    expect(runs[0]!.collected).toBe(outcome.news.feedItems);
    expect(newsFiles()).toEqual([]);
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
