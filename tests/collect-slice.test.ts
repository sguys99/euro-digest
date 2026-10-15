/**
 * M1-01 얇은 수직 슬라이스 — `npm run collect` 파이프라인 (scripts/lib/collect-run.ts 외).
 *
 * 네트워크·실호출 없음: 피드는 fixtures/rss/bbc-sport-football.xml, 경기는 fixtures/football/football-data/*,
 * LLM은 fixtures/llm/mock(by-id brief-YYYY-MM-DD) 또는 가짜 transport. 파일 쓰기는 임시 폴더(dataDir 주입).
 * 소스는 BBC 1개만 주입한다(`loadSources`) — 여러 소스·실패 격리·로더는 tests/collect-sources.test.ts·tests/sources.test.ts.
 *
 * 필수 항목: 원제목·링크 = 피드 원문(엔티티 디코딩·앞뒤 공백 정리만), 200자 초과 건너뜀, 카드 ID 결정성·형식,
 * 같은 날 재실행 병합(중복 없음·앞선 카드 유지), 경기 없으면 브리핑 생략, 출력 파일 스키마 통과,
 * 브리핑 실패(football-data·LLM)가 뉴스 발행을 멈추지 않음, 실호출 비용 기록(dry 포함), 예산 초과 시 호출 안 함.
 */
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  NewsFileSchema,
  RunsDevFileSchema,
  RunsFileSchema,
  SourcesFileSchema,
  type FeedItem,
  type NewsFile,
} from "@/lib/schema";
import { kstWindowRangeUtc } from "@/lib/time";

import {
  briefInputWindow,
  buildBriefInput,
  roundLabel,
} from "../scripts/lib/brief-input";
import {
  BRIEF_MAX_TOKENS,
  buildBriefRequest,
  estimateBriefCost,
  parseBriefOutput,
} from "../scripts/lib/brief";
import { cardIdFor } from "../scripts/lib/card-id";
import { dedupeFeedItems } from "../scripts/lib/dedup";
import {
  resolveCardLimit,
  resolveMaxItems,
  resolveRunEnv,
  runCollect,
  runStatus,
  shouldRecordRun,
  type BriefOutcome,
  type CollectDeps,
} from "../scripts/lib/collect-run";
import {
  createLlmClient,
  type LlmClient,
  type LlmRequest,
  type LlmTransport,
  type MessageParams,
} from "../scripts/lib/llm";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { toCluster } from "../scripts/lib/news-cluster";
import {
  buildCard,
  mergeCards,
  publisherNameOf,
  sortCards,
} from "../scripts/lib/news-file";
import { buildKeywordIndex } from "../scripts/lib/news-keywords";
import {
  cleanTitle,
  decodeEntities,
  normalizeFeedItem,
  TITLE_MAX_LENGTH,
} from "../scripts/lib/normalize";
import {
  createFootballDataClient,
  FOOTBALL_DATA_BASE_URL,
  FOOTBALL_DATA_MIN_INTERVAL_MS,
  footballDataDateRange,
  matchesPath,
  toFinishedResults,
} from "../scripts/lib/providers/football-data";
import {
  FeedParseError,
  feedUserAgent,
  fetchFeedXml,
  parseFeedXml,
  type FetchLike,
} from "../scripts/lib/rss";
import { scoreCluster, selectTopScored } from "../scripts/lib/score";
import { readValidationSnapshot } from "../scripts/lib/validate-fs";
import {
  buildValidationReport,
  validationExitCode,
} from "../scripts/lib/validate-report";

import { cancelGate } from "./support/cancel-gate";
import { fdFixtureResponse, standingsCode } from "./support/football-data-fake";

// ─── fixtures ────────────────────────────────────────────────────────────

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const BBC_XML = read("fixtures/rss/bbc-sport-football.xml");
const SOURCES = SourcesFileSchema.parse(
  JSON.parse(read("configs/sources.json")),
);
const COMPETITIONS = JSON.parse(read("configs/competitions.json"));
const BBC_SOURCE = SOURCES.find((s) => s.id === "bbc-sport-football")!;
const RSS_INDEX = JSON.parse(read("fixtures/rss/index.json")) as {
  sources: Array<{
    id: string;
    items: Array<{ pos: number; title: string; link: string; pubDate: string }>;
  }>;
};
const BBC_INDEX_ITEMS = RSS_INDEX.sources.find(
  (s) => s.id === "bbc-sport-football",
)!.items;
const NEWS_SAMPLE = JSON.parse(read("fixtures/news-sample.json")) as NewsFile;
const FD_MATCHES_1010 = read(
  "fixtures/football/football-data/matches-6comps-2026-10-10.json",
);
const BRIEF_META_1011 = JSON.parse(
  read("fixtures/llm/brief-inputs/2026-10-11.meta.json"),
);

/** 06:30 KST 2026-10-11 = 2026-10-10T21:30Z — 발행일 2026-10-11, 입력 창 = UTC 하루 2026-10-10 */
const NOW = new Date("2026-10-10T21:30:00.000Z");

// ─── 도우미 ──────────────────────────────────────────────────────────────

type Route = string | Response | Error | (() => Response);

interface FakeFetch {
  fetch: FetchLike;
  calls: Array<{ url: string; init?: RequestInit }>;
}

/**
 * 피드 호스트와 football-data만 받는 가짜 fetch. 그 밖의 URL은 실패(실제 네트워크 차단).
 * football-data: 경기(`/matches`)는 `fd`, 순위(`/competitions/{code}/standings`)는 `standings`(없으면 fixture — M1-44).
 */
function fakeFetch(routes: {
  feed?: Route;
  fd?: Route;
  standings?: Route;
}): FakeFetch {
  const calls: FakeFetch["calls"] = [];
  const respond = (route: Route | undefined): Response => {
    if (route === undefined) return new Response("not found", { status: 404 });
    if (route instanceof Error) throw route;
    if (route instanceof Response) return route.clone();
    if (typeof route === "function") return route();
    return new Response(route, { status: 200 });
  };
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (url === BBC_SOURCE.url) return respond(routes.feed);
      if (standingsCode(url) !== null) {
        return routes.standings !== undefined
          ? respond(routes.standings)
          : fdFixtureResponse(url)!;
      }
      if (url.startsWith(FOOTBALL_DATA_BASE_URL)) return respond(routes.fd);
      throw new Error(`테스트에서 예상하지 못한 URL: ${url}`);
    },
  };
}

function captureLogger() {
  const records: LogRecord[] = [];
  return {
    records,
    logger: createLogger({
      scope: "collect",
      format: "json",
      sink: (_line, record) => records.push(record),
    }),
  };
}

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-collect-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function makeDeps(over: Partial<CollectDeps> = {}) {
  const printed: string[] = [];
  const { records, logger } = captureLogger();
  let llmCreated = 0;
  const llmRequests: LlmRequest[] = [];
  const fetcher = fakeFetch({ feed: BBC_XML, fd: FD_MATCHES_1010 });
  const deps: CollectDeps = {
    rootDir: ROOT,
    dataDir,
    env: "dev",
    llmMode: "mock",
    dry: false,
    limit: 5, // 소량 실행(--limit 5) — 피드 6건 중 5건이 남는 상한
    loadSources: async () => [BBC_SOURCE],
    now: () => NOW,
    fetch: fetcher.fetch,
    userAgent: feedUserAgent("test@example.com"),
    // 피드 재시도 대기(2초)·같은 호스트 간격을 실제로 기다리지 않는다(M1-03 — 시간 계산은 tests/feed-collect.test.ts)
    feedClock: { now: () => 0, sleep: async () => undefined },
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

/** callSingle만 쓰는 가짜 live transport — 실측과 비슷한 usage를 돌려준다 */
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

const BRIEF_TEXT_OK = JSON.stringify({
  l: [
    { t: "Chelsea가 Bournemouth를 5-1로 꺾었다.", r: ["m560595"] },
    { t: "Mainz와 Leverkusen은 3-4 접전을 벌였다.", r: ["m565812"] },
  ],
});

function newsFiles(): string[] {
  try {
    return readdirSync(path.join(dataDir, "news"));
  } catch {
    return [];
  }
}

function readNews(date: string): NewsFile {
  return NewsFileSchema.parse(
    JSON.parse(
      readFileSync(path.join(dataDir, "news", `${date}.json`), "utf8"),
    ),
  );
}

// ─── RSS 파싱·정규화 ─────────────────────────────────────────────────────

describe("rss.ts — 피드 파싱", () => {
  it("BBC 피드 fixture에서 제목·링크·날짜만 꺼낸다(본문·요약·이미지 필드 없음)", async () => {
    const items = await parseFeedXml(BBC_XML);
    expect(items).toHaveLength(BBC_INDEX_ITEMS.length);
    items.forEach((item, i) => {
      expect(Object.keys(item).sort()).toEqual(
        ["authors", "link", "pubDate", "title"].sort(),
      );
      expect(item.title).toBe(BBC_INDEX_ITEMS[i]!.title);
      expect(item.link).toBe(BBC_INDEX_ITEMS[i]!.link);
      expect(item.pubDate).toBe(BBC_INDEX_ITEMS[i]!.pubDate);
    });
  });

  it("description·content:encoded·enclosure가 있어도 결과에 담지 않는다", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>t</title>
      <item><title>Title</title><link>https://example.com/a</link><pubDate>Sat, 10 Oct 2026 19:24:23 GMT</pubDate>
      <description>요약문</description><content:encoded><![CDATA[<p>본문</p>]]></content:encoded>
      <enclosure url="https://example.com/a.jpg" type="image/jpeg" length="1"/></item></channel></rss>`;
    const [item] = await parseFeedXml(xml);
    expect(item).toEqual({
      title: "Title",
      link: "https://example.com/a",
      pubDate: "Sat, 10 Oct 2026 19:24:23 GMT",
      authors: [],
    });
    expect(JSON.stringify(item)).not.toMatch(/요약문|본문|a\.jpg/);
  });

  it("빈 피드는 항목 0건", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title></channel></rss>`;
    await expect(parseFeedXml(xml)).resolves.toEqual([]);
  });

  it("깨진 XML·RSS가 아닌 문서는 FeedParseError", async () => {
    await expect(parseFeedXml("<rss version='2.0'><channel>")).rejects.toThrow(
      FeedParseError,
    );
    await expect(parseFeedXml("<html><body>x</body></html>")).rejects.toThrow(
      FeedParseError,
    );
  });

  it("fetchFeedXml — User-Agent·Accept·redirect manual을 보내고 HTTP 오류는 FeedFetchError", async () => {
    const ok = fakeFetch({ feed: BBC_XML });
    await expect(
      fetchFeedXml(BBC_SOURCE.url, { fetch: ok.fetch, userAgent: "UA/1" }),
    ).resolves.toBe(BBC_XML);
    const headers = ok.calls[0]!.init!.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("UA/1");
    expect(headers.Accept).toMatch(/rss\+xml/);
    expect(ok.calls[0]!.init!.redirect).toBe("manual");

    const bad = fakeFetch({ feed: new Response("x", { status: 503 }) });
    await expect(
      fetchFeedXml(BBC_SOURCE.url, { fetch: bad.fetch, userAgent: "UA/1" }),
    ).rejects.toMatchObject({
      name: "FeedFetchError",
      kind: "http-5xx",
      status: 503,
    });
  });

  it("User-Agent는 서비스명·저장소·연락처 형식", () => {
    expect(feedUserAgent("me@example.com")).toBe(
      "EuroDigestBot/0.1 (+https://github.com/sguys99/euro-digest; me@example.com)",
    );
    expect(feedUserAgent(undefined)).toBe(
      "EuroDigestBot/0.1 (+https://github.com/sguys99/euro-digest)",
    );
  });
});

describe("normalize.ts — 원제목·링크 무수정(엔티티 디코딩·앞뒤 공백 정리만)", () => {
  const source = { id: "bbc-sport-football", lang: "en" };
  const raw = (over: Partial<Parameters<typeof normalizeFeedItem>[0]>) => ({
    title: "Title",
    link: "https://example.com/a",
    pubDate: "Sat, 10 Oct 2026 19:24:23 GMT",
    authors: [],
    ...over,
  });

  it("엔티티는 한 번만 푼다", () => {
    expect(decodeEntities("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(decodeEntities("&amp;amp;")).toBe("&amp;");
    expect(
      decodeEntities("it&#8217;s &#x2014; &quot;q&quot; &apos;a&#39;"),
    ).toBe("it’s — \"q\" 'a'");
    expect(decodeEntities("&unknown; &#0; &#xD800;")).toBe(
      "&unknown; &#0; &#xD800;",
    );
  });

  it("앞뒤 공백만 정리하고 안쪽 글자는 그대로 둔다", () => {
    expect(cleanTitle("  Bayern strike late  ")).toBe("Bayern strike late");
    expect(cleanTitle("A  -  B")).toBe("A  -  B");
  });

  it(`제목 ${TITLE_MAX_LENGTH}자까지는 통과, 넘으면 건너뛴다(자르지 않음)`, () => {
    const at = normalizeFeedItem(raw({ title: "a".repeat(200) }), source);
    expect(at.ok && at.item.title.length).toBe(200);
    expect(normalizeFeedItem(raw({ title: "a".repeat(201) }), source)).toEqual({
      ok: false,
      reason: "title-too-long",
    });
    // 공백 정리 후 길이로 판단한다
    expect(
      normalizeFeedItem(raw({ title: ` ${"a".repeat(200)} ` }), source).ok,
    ).toBe(true);
  });

  it("제목 없음·잘못된 링크·시간대 없는 날짜(소스에 tz 없음)는 건너뛴다", () => {
    expect(normalizeFeedItem(raw({ title: "  " }), source)).toEqual({
      ok: false,
      reason: "no-title",
    });
    expect(
      normalizeFeedItem(raw({ link: "javascript:alert(1)" }), source),
    ).toEqual({ ok: false, reason: "bad-link" });
    expect(
      normalizeFeedItem(raw({ pubDate: "2026-10-10 19:24" }), source),
    ).toEqual({ ok: false, reason: "no-date" });
  });

  it("링크는 앞뒤 공백만 정리하고 추적 파라미터를 남긴다", () => {
    const result = normalizeFeedItem(
      raw({
        link: "\n https://www.bbc.co.uk/x?at_medium=RSS&at_campaign=rss \n",
      }),
      source,
    );
    expect(result.ok && result.item.url).toBe(
      "https://www.bbc.co.uk/x?at_medium=RSS&at_campaign=rss",
    );
  });
});

// ─── 카드 ID·카드·선별·병합 ───────────────────────────────────────────────

describe("card-id.ts — c_ + 16진수 10자리, 결정적", () => {
  it("형식과 결정성", () => {
    const url = "https://www.bbc.co.uk/sport/football/articles/x?at_medium=RSS";
    expect(cardIdFor(url)).toMatch(/^c_[0-9a-f]{10}$/);
    expect(cardIdFor(url)).toBe(cardIdFor(url));
    expect(cardIdFor(url)).not.toBe(cardIdFor(`${url}&x=1`));
  });

  it("M0-34 원제목 카드 샘플(임시 sha256(링크 원문))과 같은 링크면 같은 ID", () => {
    const bbcCards = NEWS_SAMPLE.cards.filter((c) =>
      c.src.some((s) => s.n === "BBC Sport"),
    );
    expect(bbcCards.length).toBeGreaterThan(0);
    for (const card of bbcCards) {
      // 대표 출처(첫 출처)의 링크가 ID 입력이다
      expect(cardIdFor(card.src[0]!.u)).toBe(card.id);
    }
  });
});

describe("news-file.ts — 카드·선별·병합", () => {
  const item = (url: string, publishedAt: string, title = "T"): FeedItem => ({
    title,
    url,
    publishedAt,
    summary: null,
    source: "bbc-sport-football",
    author: null,
    authors: [],
    lang: "en",
  });

  it("출처명은 매체명만(섹션·괄호 설명 제거)", () => {
    expect(publisherNameOf({ name: "BBC Sport — Football" })).toBe("BBC Sport");
    expect(publisherNameOf({ name: "인터풋볼 — 해외축구" })).toBe("인터풋볼");
    expect(
      publisherNameOf({ name: "the Daily Briefing (Fabrizio Romano)" }),
    ).toBe("the Daily Briefing");
    expect(publisherNameOf({ name: "Relevo" })).toBe("Relevo");
  });

  it("카드는 원제목+링크(ai:false, s:[]), 최소 분류 기본값", () => {
    const card = buildCard(
      item(
        "https://example.com/a",
        "2026-10-10T19:24:23.000Z",
        "Original title",
      ),
      BBC_SOURCE,
      NOW.toISOString(),
    );
    expect(card).toMatchObject({
      id: cardIdFor("https://example.com/a"),
      t: "Original title",
      s: [],
      cat: "other",
      comp: [],
      teams: [],
      players: [],
      imp: 3,
      kr: false,
      spoiler: false,
      lang: "en",
      ai: false,
      created: NOW.toISOString(),
      src: [
        {
          n: "BBC Sport",
          u: "https://example.com/a",
          at: "2026-10-10T19:24:23.000Z",
          tier: 2,
        },
      ],
    });
    expect(card.transfer).toBeUndefined();
  });

  it("선별: 같은 링크는 한 번만(중복 제거 dedupeFeedItems — M1-12), 점수 상위 N건(M1-14 — 같은 소스·키워드 없음이면 최신성 순)", () => {
    const items = [
      item("https://e.com/1", "2026-10-10T10:00:00.000Z"),
      item("https://e.com/2", "2026-10-10T12:00:00.000Z"),
      item("https://e.com/1", "2026-10-10T13:00:00.000Z"), // 같은 링크 — 먼저 나온 것 유지
      item("https://e.com/3", "2026-10-10T11:00:00.000Z"),
    ];
    const { groups } = dedupeFeedItems(items);
    const sourceById = new Map([[BBC_SOURCE.id, BBC_SOURCE] as const]);
    const ctx = {
      now: "2026-10-10T21:30:00.000Z",
      sourceById,
      keywords: buildKeywordIndex({}),
    };
    const top = (limit: number) =>
      selectTopScored(
        groups.map((g) => toCluster([g], sourceById)),
        (c) => scoreCluster(c, ctx),
        limit,
      ).map(({ entry }) => entry.members[0]!.item.url);
    expect(top(2)).toEqual(["https://e.com/2", "https://e.com/3"]);
    // 먼저 나온 항목(10:00)이 대표 — 뒤에 나온 같은 링크(13:00)가 최신성으로 맨 앞을 차지하지 않는다
    expect(top(10)).toEqual([
      "https://e.com/2",
      "https://e.com/3",
      "https://e.com/1",
    ]);
    expect(top(0)).toEqual([]);
  });

  it("병합: 원문 링크가 추적 파라미터만 달라 ID가 다른 같은 기사도 두 번 들어가지 않는다(정규화 URL — M1-12)", () => {
    const a = buildCard(
      item(
        "https://www.bbc.co.uk/sport/football/articles/a1?at_medium=RSS&at_campaign=rss",
        "2026-10-10T10:00:00.000Z",
      ),
      BBC_SOURCE,
      "2026-10-10T21:00:00.000Z",
    );
    const aPlain = buildCard(
      item(
        "https://www.bbc.co.uk/sport/football/articles/a1",
        "2026-10-10T10:00:00.000Z",
      ),
      BBC_SOURCE,
      "2026-10-10T22:00:00.000Z",
    );
    expect(aPlain.id).not.toBe(a.id); // 카드 ID는 아직 원문 링크 해시(M1-16에서 정규화 URL로)
    const result = mergeCards([a], [aPlain]);
    expect(result).toMatchObject({ added: 0, duplicates: 1 });
    expect(result.cards).toEqual([a]);
  });

  it("병합: 기존 카드를 그대로 두고 새 ID만 더한다", () => {
    const a = buildCard(
      item("https://e.com/a", "2026-10-10T10:00:00.000Z"),
      BBC_SOURCE,
      "2026-10-10T21:00:00.000Z",
    );
    const b = buildCard(
      item("https://e.com/b", "2026-10-10T11:00:00.000Z"),
      BBC_SOURCE,
      "2026-10-10T21:00:00.000Z",
    );
    const aAgain = { ...a, created: "2026-10-10T22:00:00.000Z", t: "다른 값" };
    const result = mergeCards([a], [aAgain, b]);
    expect(result.added).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(result.cards.map((c) => c.id)).toEqual([b.id, a.id]); // 최신 출처 시각 순
    expect(result.cards.find((c) => c.id === a.id)).toEqual(a); // 기존 카드 유지
  });

  it("파일 순서 = 화면 순서: 중요도(imp) 내림차순 → 최신 출처 시각 내림차순 → ID(M1-14 — PRD §4.2 '중요도·시각 순')", () => {
    const card = (url: string, at: string, imp: number) => ({
      ...buildCard(item(url, at), BBC_SOURCE, "2026-10-10T21:00:00.000Z"),
      imp,
    });
    const oldHigh = card(
      "https://e.com/old-high",
      "2026-10-10T08:00:00.000Z",
      5,
    );
    const newLow = card("https://e.com/new-low", "2026-10-10T20:00:00.000Z", 2);
    const midA = card("https://e.com/mid-a", "2026-10-10T12:00:00.000Z", 3);
    const midB = card("https://e.com/mid-b", "2026-10-10T15:00:00.000Z", 3);
    const sameTime = card("https://e.com/mid-c", "2026-10-10T15:00:00.000Z", 3);
    const sorted = sortCards([newLow, midA, sameTime, oldHigh, midB]);
    const tie = [midB, sameTime].sort((x, y) => (x.id < y.id ? -1 : 1));
    expect(sorted.map((c) => c.id)).toEqual([
      oldHigh.id,
      ...tie.map((c) => c.id),
      midA.id,
      newLow.id,
    ]);
    // 같은 날 재실행 병합도 같은 규칙(기존 카드·새 카드 구분 없이)
    expect(
      mergeCards([newLow, midA], [oldHigh]).cards.map((c) => c.id),
    ).toEqual([oldHigh.id, midA.id, newLow.id]);
  });
});

// ─── football-data 어댑터·브리핑 입력 ─────────────────────────────────────

describe("providers/football-data.ts", () => {
  const window = briefInputWindow("2026-10-11");

  it("교차 /v4/matches 경로 — 6개 대회 코드 + 창의 UTC 날짜", () => {
    expect(
      matchesPath({
        competitions: ["PL", "PD", "SA", "BL1", "FL1", "CL"],
        ...footballDataDateRange(window),
      }),
    ).toBe(
      "/matches?competitions=PL,PD,SA,BL1,FL1,CL&dateFrom=2026-10-10&dateTo=2026-10-11",
    );
  });

  it("종료 경기만, 창 안의 킥오프만 — CANCELLED(점수가 채워져 와도)는 뺀다", () => {
    const raw = JSON.parse(FD_MATCHES_1010).matches as unknown[];
    const { results, skipped } = toFinishedResults(raw, COMPETITIONS, window);
    expect(results).toHaveLength(BRIEF_META_1011.finished); // 23
    expect(skipped).toEqual({
      invalid: 0,
      notFinished: 1,
      outOfWindow: 0,
      unknownComp: 0,
    });
    expect(results.map((r) => r.matchId)).not.toContain(564698);
    const arsenal = results.find((r) => r.matchId === 560593)!;
    expect(arsenal).toEqual({
      provider: "football-data",
      matchId: 560593,
      comp: "EPL",
      kickoff: "2026-10-10T11:30:00Z",
      matchday: 6,
      stage: "REGULAR_SEASON",
      home: { id: 57, name: "Arsenal", fullName: "Arsenal FC" },
      away: { id: 341, name: "Leeds United", fullName: "Leeds United FC" },
      score: {
        ft: { home: 2, away: 1 },
        ht: { home: 0, away: 0 },
        regular: { home: 2, away: 1 },
        pens: null,
        duration: "REGULAR",
      },
    });
    // 다른 날 창이면 전부 창 밖
    const other = toFinishedResults(
      raw,
      COMPETITIONS,
      briefInputWindow("2026-10-13"),
    );
    expect(other.results).toEqual([]);
    expect(other.skipped.outOfWindow).toBe(23);
  });

  it("형식이 틀린 항목은 그 건만 invalid로 센다", () => {
    const raw = JSON.parse(FD_MATCHES_1010).matches as unknown[];
    const { results, skipped } = toFinishedResults(
      [{ id: "x" }, ...raw.slice(0, 1)],
      COMPETITIONS,
      window,
    );
    expect(results).toHaveLength(1);
    expect(skipped.invalid).toBe(1);
  });

  it("클라이언트 — X-Auth-Token 헤더, 응답 후 6.5초 간격, 호출 수 집계, HTTP 오류는 FootballDataError(재시도 1회 포함)", async () => {
    const fetcher = fakeFetch({ fd: FD_MATCHES_1010 });
    let clock = 1_000_000;
    const sleeps: number[] = [];
    const client = createFootballDataClient({
      apiKey: "k-123",
      fetch: fetcher.fetch,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });
    const query = {
      competitions: ["PL"],
      dateFrom: "2026-10-10",
      dateTo: "2026-10-11",
    };
    await client.getMatches(query);
    clock += 1_000; // 응답 후 1초 뒤 다음 요청
    await client.getMatches(query);
    expect(client.calls).toBe(2);
    expect(sleeps).toEqual([FOOTBALL_DATA_MIN_INTERVAL_MS - 1_000]);
    const headers = fetcher.calls[0]!.init!.headers as Record<string, string>;
    expect(headers["X-Auth-Token"]).toBe("k-123");
    expect(fetcher.calls[0]!.url).not.toContain("k-123");

    // 429는 1회 재시도(대기는 주입한 sleep — 실제로 기다리지 않는다), 두 번째도 429면 실패
    const failing = createFootballDataClient({
      apiKey: "k",
      fetch: fakeFetch({ fd: new Response("{}", { status: 429 }) }).fetch,
      sleep: async () => undefined,
    });
    await expect(failing.getMatches(query)).rejects.toMatchObject({
      name: "FootballDataError",
      kind: "http",
      status: 429,
    });
    expect(failing.calls).toBe(2);
    expect(failing.retries).toBe(1);
  });
});

describe("brief-input.ts — 정형 입력(M0-34 창)", () => {
  it("발행일 D의 창 = KST [D-1 09:00, D 09:00) = UTC 하루 D-1 (M0-34 meta와 같다)", () => {
    expect(briefInputWindow("2026-10-11")).toEqual(
      kstWindowRangeUtc(
        BRIEF_META_1011.window.base,
        BRIEF_META_1011.window.kst,
      ),
    );
    expect(briefInputWindow("2026-10-11")).toEqual({
      start: "2026-10-10T00:00:00.000Z",
      end: "2026-10-11T00:00:00.000Z",
    });
    expect(footballDataDateRange(briefInputWindow("2026-10-11"))).toEqual({
      dateFrom: "2026-10-10",
      dateTo: "2026-10-11",
    });
  });

  it("경기 결과만 넣는다 — 기사 텍스트·득점자 없음(goals: null), 연장·승부차기는 뺀다", () => {
    const raw = JSON.parse(FD_MATCHES_1010).matches as unknown[];
    const window = briefInputWindow("2026-10-11");
    const { results } = toFinishedResults(raw, COMPETITIONS, window);
    const withPens = [
      ...results,
      {
        ...results[0]!,
        matchId: 1,
        score: {
          ...results[0]!.score,
          pens: { home: 4, away: 3 },
          duration: "PENALTY_SHOOTOUT" as const,
        },
      },
    ];
    const { input, excluded } = buildBriefInput(
      "2026-10-11",
      withPens,
      COMPETITIONS,
    );
    expect(input.briefDate).toBe("2026-10-11");
    expect(input.matches).toHaveLength(23);
    expect(excluded).toEqual({ nonRegular: 1, overCap: 0 });
    expect(input.matches[0]).toEqual({
      id: "m560593",
      comp: "Premier League",
      round: "Matchday 6",
      home: "Arsenal",
      away: "Leeds United",
      ft: "2-1",
      ht: "0-0",
      goals: null,
    });
    for (const m of input.matches) {
      expect(
        Object.keys(m).every((k) =>
          ["id", "comp", "round", "home", "away", "ft", "ht", "goals"].includes(
            k,
          ),
        ),
      ).toBe(true);
    }
    expect(
      buildBriefInput("2026-10-11", results, COMPETITIONS, 5).excluded.overCap,
    ).toBe(18);
  });

  it("라운드 표기 — 리그 Matchday n, UCL 리그 페이즈 League phase MD n", () => {
    expect(roundLabel({ stage: "REGULAR_SEASON", matchday: 6 })).toBe(
      "Matchday 6",
    );
    expect(roundLabel({ stage: "LEAGUE_STAGE", matchday: 1 })).toBe(
      "League phase MD 1",
    );
    expect(roundLabel({ stage: "LAST_16", matchday: null })).toBe("LAST_16");
  });
});

describe("brief.ts — 요청 설정(D28)·출력 파싱", () => {
  const input = { briefDate: "2026-10-11", matches: [] };

  it("단건 요청 — max_tokens 4096, thinking 적응형 + effort medium 명시, 1요청이라 캐싱 끔", () => {
    const request = buildBriefRequest(input, "지시문");
    expect(request).toEqual({
      customId: "brief-2026-10-11",
      system: "지시문",
      user: JSON.stringify(input),
      maxTokens: BRIEF_MAX_TOKENS,
      effort: "medium",
      thinking: "adaptive",
    });
    expect(BRIEF_MAX_TOKENS).toBe(4096);
    expect(request.cacheSystem).toBeUndefined();
  });

  it("예상 비용은 출력 상한(max_tokens)으로 잡아 실측보다 크다", () => {
    const request = buildBriefRequest(input, "가".repeat(2000));
    const estimate = estimateBriefCost(request, "claude-haiku-5-5");
    expect(estimate.tokens.out).toBe(4096);
    expect(estimate.tokens.in).toBeGreaterThanOrEqual(2000);
    expect(estimate.usd).toBeGreaterThan(0);
    expect(estimate.usd).toBeLessThan(0.01);
  });

  it("M0-30 임시 출력 스키마로 줄을 꺼낸다(엄격 JSON만)", () => {
    expect(parseBriefOutput(BRIEF_TEXT_OK)).toMatchObject({ ok: true });
    expect(parseBriefOutput("```json\n{}\n```")).toEqual({
      ok: false,
      reason: "json",
    });
    expect(parseBriefOutput('{"l":[]}')).toEqual({
      ok: false,
      reason: "schema",
    });
  });
});

// ─── 파이프라인 전체 ─────────────────────────────────────────────────────

describe("runCollect — BBC 피드 → 원제목 카드 → data/news/<KST 발행일>.json", () => {
  it("상위 5건 카드를 쓰고, 제목·링크가 피드 원문과 같으며 NewsFileSchema를 통과한다", async () => {
    const { deps, records } = makeDeps();
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.publishDate).toBe("2026-10-11");
    expect(newsFiles()).toEqual(["2026-10-11.json"]);

    const file = readNews("2026-10-11");
    expect(file.date).toBe("2026-10-11");
    expect(file.runId).toBe(outcome.runId);
    expect(file.runId).toMatch(/^collect-dev-20261010T213000Z-[0-9a-f]{4}$/);
    expect(file.cards).toHaveLength(5);

    // 피드 7건 중 같은 링크 1쌍 → 6건, 최신 5건(10/9 하이라이트 제외)
    // 같은 링크는 먼저 나온 항목(pos 3 — pos 6은 피드 안 중복)
    const byLink = new Map(
      [...BBC_INDEX_ITEMS].reverse().map((i) => [i.link, i] as const),
    );
    expect(file.cards.map((c) => byLink.get(c.src[0]!.u)!.pos)).toEqual([
      2, 1, 3, 0, 4,
    ]);
    for (const card of file.cards) {
      const original = byLink.get(card.src[0]!.u)!;
      expect(card.t).toBe(original.title.trim()); // 무수정(앞뒤 공백만)
      expect(card.src[0]!.u).toBe(original.link); // 추적 파라미터 포함 원문 그대로
      expect(card.id).toBe(cardIdFor(original.link));
      expect(card.id).toMatch(/^c_[0-9a-f]{10}$/);
      expect(card).toMatchObject({
        ai: false,
        s: [],
        lang: "en",
        created: NOW.toISOString(),
      });
      expect(card.src[0]!.n).toBe("BBC Sport");
    }
    // 끝 공백이 있던 원제목(Bayern …)은 정리됨
    expect(file.cards.find((c) => c.t.startsWith("Bayern"))!.t).toBe(
      "Bayern strike late to avoid shock defeat at Augsburg",
    );
    expect(records.some((r) => r.event === "collect.news.write")).toBe(true);
    // 국내 몫(floor(5/3) = 1)이 있어도 국내 후보가 없으면 해외로 채운다(D44)
    expect(outcome.news.score).toMatchObject({
      slots: 5,
      domesticQuota: 1,
      ranked: 5,
      domesticByQuota: 0,
    });
    expect(
      records.find((r) => r.event === "collect.select.done"),
    ).toMatchObject({
      selectedMix: expect.objectContaining({ ko: 0, koQuota: 1 }),
    });
  });

  it("같은 날 다시 실행해도 앞선 카드를 잃지 않고 ID가 겹치지 않는다(새 카드가 없으면 파일을 다시 쓰지 않음)", async () => {
    const first = makeDeps({ limit: 2 });
    const run1 = await runCollect(first.deps);
    const after1 = readNews("2026-10-11");
    expect(after1.cards).toHaveLength(2);

    const later = new Date("2026-10-10T22:10:00.000Z"); // 같은 KST 날(07:10)
    const second = makeDeps({ limit: 5, now: () => later });
    const run2 = await runCollect(second.deps);
    const after2 = readNews("2026-10-11");
    expect(after2.cards).toHaveLength(5);
    expect(new Set(after2.cards.map((c) => c.id)).size).toBe(5);
    expect(after2.runId).toBe(run2.runId);
    expect(after2.runId).not.toBe(run1.runId);
    for (const old of after1.cards) {
      expect(after2.cards.find((c) => c.id === old.id)).toEqual(old); // created 유지
    }
    expect(run2.news.added).toBe(3);
    // 그날 파일 기준 상한(D44): 새 자리 = 5 − 기존 2
    expect(run2.news.score).toMatchObject({ existingCards: 2, slots: 3 });

    const filePath = path.join(dataDir, "news", "2026-10-11.json");
    const mtime = statSync(filePath).mtimeMs;
    const before = readFileSync(filePath, "utf8");
    const third = makeDeps({ limit: 5, now: () => later });
    const run3 = await runCollect(third.deps);
    expect(run3.news.added).toBe(0);
    expect(run3.news.score).toMatchObject({ existingCards: 5, slots: 0 });
    expect(readFileSync(filePath, "utf8")).toBe(before);
    expect(statSync(filePath).mtimeMs).toBe(mtime);
    expect(
      third.records.some((r) => r.event === "collect.news.unchanged"),
    ).toBe(true);
  });

  it("키워드 설정(names.ko.json·korean-players.json)을 읽지 못해도 경고만 하고 코드 표로 점수화해 발행한다(M1-14)", async () => {
    const emptyRoot = mkdtempSync(
      path.join(os.tmpdir(), "euro-digest-noconf-"),
    );
    try {
      const { deps, records } = makeDeps({
        rootDir: emptyRoot, // configs/ 없음
        footballDataApiKey: undefined, // 브리핑(프롬프트 파일)도 rootDir를 읽으므로 뺀다
      });
      const outcome = await runCollect(deps);
      expect(outcome.exitCode).toBe(0);
      expect(readNews("2026-10-11").cards).toHaveLength(5);
      expect(outcome.news.score?.keywordsError).toMatch(
        /names\.ko\.json|korean-players\.json/,
      );
      expect(
        records.find((r) => r.event === "collect.score.keywords"),
      ).toMatchObject({ level: "warn" });
      // 빅클럽은 코드 표라 그대로 잡힌다(Spurs·Man Utd·Bayern·AC Milan)
      expect(
        records.find((r) => r.event === "collect.select.done"),
      ).toMatchObject({
        selectedMix: expect.objectContaining({ korean: 0, bigClub: 4 }),
      });
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  it("200자 초과 원제목은 카드로 만들지 않고 로그에 남긴다", async () => {
    const long = "L".repeat(201);
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
      <item><title>${long}</title><link>https://www.bbc.co.uk/sport/football/articles/long</link><pubDate>Sat, 10 Oct 2026 20:00:00 GMT</pubDate></item>
      <item><title>${"M".repeat(200)}</title><link>https://www.bbc.co.uk/sport/football/articles/max</link><pubDate>Sat, 10 Oct 2026 19:00:00 GMT</pubDate></item>
      </channel></rss>`;
    const { deps, records } = makeDeps({
      fetch: fakeFetch({ feed: xml, fd: '{"matches":[]}' }).fetch,
    });
    await runCollect(deps);
    const file = readNews("2026-10-11");
    expect(file.cards.map((c) => c.t)).toEqual(["M".repeat(200)]);
    const skip = records.find((r) => r.event === "collect.item.skip");
    expect(skip).toMatchObject({
      level: "warn",
      reason: "title-too-long",
      count: 1,
    });
  });

  it("--dry: data/news를 쓰지 않고 파일 내용을 출력한다(스키마 통과)", async () => {
    const { deps, printed } = makeDeps({ dry: true });
    const outcome = await runCollect(deps);
    expect(newsFiles()).toEqual([]);
    expect(outcome.news.path).toBeNull();
    expect(NewsFileSchema.safeParse(outcome.news.file).success).toBe(true);
    const dryOut = printed.find((p) =>
      p.startsWith("── [dry] data/news/2026-10-11.json"),
    );
    expect(dryOut).toBeDefined();
    expect(dryOut).toContain(outcome.news.file!.cards[0]!.id);
  });

  it("기존 파일이 깨져 있으면 덮어쓰지 않고 실패(exitCode 1)", async () => {
    const { deps } = makeDeps();
    await runCollect(deps); // 정상 파일 생성
    const filePath = path.join(dataDir, "news", "2026-10-11.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(filePath, "{ broken", "utf8");
    const again = makeDeps();
    const outcome = await runCollect(again.deps);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.status).toBe("failed");
    expect(readFileSync(filePath, "utf8")).toBe("{ broken");
  });

  it("피드 실패: 뉴스 실패(exitCode 1)면 브리핑(LLM)을 부르지 않고 경기 데이터는 취소한다 — 커밋되지 않는 실행의 비용 기록 유실 방지", async () => {
    const fetcher = fakeFetch({
      feed: new Response("busy", { status: 503 }),
      fd: FD_MATCHES_1010,
    });
    const gate = cancelGate();
    const { deps, records, llmCreated } = makeDeps({
      fetch: fetcher.fetch,
      footballDataSleep: gate.sleep,
    });
    deps.logger = gate.logger(records);
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.status).toBe("failed");
    expect(outcome.news.ok).toBe(false);
    expect(newsFiles()).toEqual([]);
    expect(outcome.brief).toEqual({
      state: "skipped",
      reason: "news-failed",
      inputMatches: 0,
    });
    expect(llmCreated()).toBe(0);
    // 경기 데이터는 피드 수집과 병렬로 시작했다가 뉴스 실패로 취소된다(M1-48) — 첫 요청(경기) 이하, 순위는 요청하지 않는다
    const fdCalls = fetcher.calls.filter((c) =>
      c.url.startsWith(FOOTBALL_DATA_BASE_URL),
    );
    expect(fdCalls.length).toBeLessThanOrEqual(1);
    expect(fdCalls.some((c) => c.url.includes("/standings"))).toBe(false);
    expect(
      records.find((r) => r.event === "collect.matchdata.cancel"),
    ).toMatchObject({ reason: "news-failed" });
    expect(
      records.find((r) => r.event === "collect.source.fail"),
    ).toMatchObject({
      source: "bbc-sport-football",
      errorType: "http-5xx",
      status: 503,
      retries: 1,
    });
  });
});

describe("runCollect — 전날 경기 결과 → 브리핑 1요청(출력은 로그만)", () => {
  it("mock: football-data 경기 1요청 + 순위 5요청 → 종료 23경기 입력 → callSingle 1회(D28 설정) → 줄 출력, 저장 파일 없음", async () => {
    const { deps, printed, fetcher, llmRequests } = makeDeps();
    const outcome = await runCollect(deps);
    expect(outcome.brief).toMatchObject({ state: "done", inputMatches: 23 });
    if (outcome.brief.state !== "done") throw new Error("unreachable");
    expect(outcome.brief.lines).toHaveLength(5);

    const fdCalls = fetcher.calls.filter((c) =>
      c.url.startsWith(FOOTBALL_DATA_BASE_URL),
    );
    // 순위는 종료 경기가 있는 대회만(2026-10-10: UCL 경기 없음) — M1-44
    expect(
      fdCalls.map((c) => c.url.slice(FOOTBALL_DATA_BASE_URL.length)),
    ).toEqual([
      "/matches?competitions=PL,PD,SA,BL1,FL1,CL&dateFrom=2026-10-10&dateTo=2026-10-11",
      "/competitions/PL/standings",
      "/competitions/PD/standings",
      "/competitions/SA/standings",
      "/competitions/BL1/standings",
      "/competitions/FL1/standings",
    ]);
    expect(outcome.matchData?.footballData).toMatchObject({ state: "done" });
    // API_FOOTBALL_KEY가 없으면 API-Football은 건너뛰고 브리핑은 그대로 간다(M1-48 — 연결은 tests/collect-matchdata.test.ts)
    expect(outcome.matchData?.apiFootball).toMatchObject({
      state: "skipped",
      reason: "no-api-key",
    });
    expect(outcome.status).toBe("success");
    expect(
      (fdCalls[0]!.init!.headers as Record<string, string>)["X-Auth-Token"],
    ).toBe("test-football-data-key");

    expect(llmRequests).toHaveLength(1);
    const request = llmRequests[0]!;
    expect(request).toMatchObject({
      customId: "brief-2026-10-11",
      maxTokens: 4096,
      effort: "medium",
      thinking: "adaptive",
    });
    expect(request.cacheSystem).toBeUndefined();
    expect(request.system).toBe(
      read("fixtures/llm/brief-inputs/prompt-m0-30-long.md").trim(),
    );
    // 기사 텍스트(제목·링크)는 브리핑 입력에 없다(D23·D24)
    const user = JSON.parse(request.user);
    expect(Object.keys(user)).toEqual(["briefDate", "matches"]);
    expect(request.user).not.toContain("bbc.co.uk");
    for (const card of outcome.news.file!.cards) {
      expect(request.user).not.toContain(card.t);
    }

    const out = printed.find((p) => p.startsWith("── 브리핑 출력"));
    expect(out?.split("\n")).toHaveLength(6);
    // 브리핑 저장 파일은 만들지 않는다. 데이터 API를 불렀으므로 mock이어도 runs-dev.json에 호출 수를 비용 0으로 남긴다(M1-48).
    // cache/ = 발행 파일 카드의 seen-urls 기억(M1-12)
    expect(readdirSync(dataDir).sort()).toEqual([
      "cache",
      "news",
      "runs-dev.json",
    ]);
    expect(readdirSync(path.join(dataDir, "cache"))).toEqual([
      "seen-urls.json",
    ]);
    expect(outcome.run).toMatchObject({
      env: "dev",
      costUsd: 0,
      tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
      summarized: 0, // mock 줄은 LLM이 쓴 줄이 아니다
      apiCalls: { footballData: 6, apiFootball: 0 },
    });
    expect(outcome.status).toBe("success");
  });

  it("종료 경기가 없으면 LLM을 부르지 않는다(호출 생략), 뉴스는 발행", async () => {
    for (const fd of [
      '{"matches":[]}',
      JSON.stringify({
        matches: JSON.parse(FD_MATCHES_1010).matches.map((m: object) => ({
          ...m,
          status: "TIMED",
        })),
      }),
    ]) {
      const { deps, llmCreated, records } = makeDeps({
        fetch: fakeFetch({ feed: BBC_XML, fd }).fetch,
      });
      const outcome = await runCollect(deps);
      expect(outcome.brief).toEqual({
        state: "skipped",
        reason: "no-matches",
        inputMatches: 0,
      });
      expect(llmCreated()).toBe(0);
      expect(outcome.exitCode).toBe(0);
      expect(outcome.status).toBe("success");
      expect(
        records.find((r) => r.event === "summarize.brief.skip"),
      ).toMatchObject({
        reason: "no-matches",
      });
    }
    expect(newsFiles()).toEqual(["2026-10-11.json"]);
  });

  it("football-data 실패는 브리핑만 건너뛰고 뉴스는 발행한다(partial)", async () => {
    const { deps, llmCreated } = makeDeps({
      fetch: fakeFetch({
        feed: BBC_XML,
        fd: new Response("err", { status: 500 }),
      }).fetch,
    });
    const outcome = await runCollect(deps);
    expect(outcome.brief).toMatchObject({
      state: "failed",
      reason: "football-data",
    });
    expect(llmCreated()).toBe(0);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("partial");
    expect(readNews("2026-10-11").cards).toHaveLength(5);
  });

  it("브리핑 설정(LLM_MODEL·예산 env)이 잘못돼도 브리핑만 실패하고 뉴스는 발행한다(partial)", async () => {
    const { deps, llmCreated, records } = makeDeps({
      resolveBriefConfig: () => {
        throw new Error("DAILY_BUDGET_USD은 0 이상의 10진수 USD여야 한다");
      },
    });
    const outcome = await runCollect(deps);
    expect(outcome.brief).toMatchObject({ state: "failed", reason: "setup" });
    expect(llmCreated()).toBe(0);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("partial");
    expect(readNews("2026-10-11").cards).toHaveLength(5);
    expect(
      records.find((r) => r.event === "summarize.brief.fail"),
    ).toMatchObject({ stage: "setup" });
  });

  it("FOOTBALL_DATA_API_KEY가 없으면 football-data를 부르지 않는다", async () => {
    const { deps, fetcher } = makeDeps({ footballDataApiKey: undefined });
    const outcome = await runCollect(deps);
    expect(outcome.brief).toMatchObject({
      state: "skipped",
      reason: "no-api-key",
    });
    expect(
      fetcher.calls.some((c) => c.url.startsWith(FOOTBALL_DATA_BASE_URL)),
    ).toBe(false);
    expect(outcome.exitCode).toBe(0);
  });

  it("LLM 실패·출력 형식 오류도 발행을 멈추지 않는다", async () => {
    // mock fixture가 없는 발행일(brief-2026-10-12) → 건너뜀
    const noFixture = makeDeps({
      now: () => new Date("2026-10-11T21:30:00.000Z"),
      fetch: fakeFetch({
        feed: BBC_XML,
        fd: JSON.stringify({
          matches: JSON.parse(FD_MATCHES_1010).matches.map(
            (m: { utcDate: string }) => ({
              ...m,
              utcDate: m.utcDate.replace("2026-10-10", "2026-10-11"),
            }),
          ),
        }),
      }).fetch,
    });
    const skipped = await runCollect(noFixture.deps);
    expect(skipped.brief).toMatchObject({
      state: "skipped",
      reason: "mock-fixture-missing",
    });
    expect(skipped.exitCode).toBe(0);

    // createLlm 자체가 던짐(예: live 키 없음)
    const throwing = makeDeps({
      createLlm: () => {
        throw new Error("ANTHROPIC_API_KEY가 설정되지 않았다");
      },
    });
    const failed = await runCollect(throwing.deps);
    expect(failed.brief).toMatchObject({ state: "failed", reason: "llm" });
    expect(failed.exitCode).toBe(0);
    expect(failed.status).toBe("partial");

    // 출력이 JSON이 아님
    const badOutput = makeDeps({
      createLlm: () =>
        createLlmClient({
          mode: "live",
          transport: fakeLiveTransport("브리핑을 쓸 수 없습니다").transport,
          logger: () => undefined,
        }),
    });
    const bad = await runCollect(badOutput.deps);
    expect(bad.brief).toMatchObject({ state: "failed", reason: "output" });
    expect(readNews("2026-10-11").cards.length).toBeGreaterThan(0);
  });
});

describe("runCollect — 실호출 비용 기록(cost.ts 경로 재사용)", () => {
  function liveDeps(over: Partial<CollectDeps> = {}) {
    const fake = fakeLiveTransport(BRIEF_TEXT_OK);
    const made = makeDeps({
      llmMode: "live",
      createLlm: () =>
        createLlmClient({
          mode: "live",
          model: "claude-haiku-5-5",
          transport: fake.transport,
          logger: () => undefined,
        }),
      ...over,
    });
    return { ...made, params: fake.params };
  }

  it("dev + --dry: data/news는 쓰지 않지만 runs-dev.json에 실측 비용을 남긴다", async () => {
    const { deps, printed, params } = liveDeps({ dry: true });
    const outcome = await runCollect(deps);
    expect(params).toHaveLength(1);
    expect(params[0]).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
    });
    expect(params[0]!.system).toEqual([
      {
        type: "text",
        text: read("fixtures/llm/brief-inputs/prompt-m0-30-long.md").trim(),
      },
    ]); // cache_control 없음(1요청)
    expect(newsFiles()).toEqual([]);
    expect(readdirSync(dataDir)).toEqual(["runs-dev.json"]);

    const runs = RunsDevFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs-dev.json"), "utf8")),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      runId: outcome.runId,
      env: "dev",
      job: "collect",
      collected: 7,
      clusters: 5,
      summarized: 2,
      downgraded: 0,
      tokens: { in: 6590, out: 3231, cacheRead: 0, cacheWrite: 0 },
      costUsd: 0.002275, // M0-34 실측과 같은 usage → 같은 비용
      apiCalls: { footballData: 6, apiFootball: 0 }, // 경기 1 + 순위 5(M1-44)
      sources: [{ id: "bbc-sport-football", ok: true, items: 7 }],
      status: "success",
    });
    // 실행 전 예상 비용 출력
    expect(printed.some((p) => p.startsWith("[cost] 예상"))).toBe(true);
    expect(printed.some((p) => p.startsWith("[cost] 실측"))).toBe(true);
  });

  it("prod(Actions): runs.json에 기록하고 data/news도 쓴다", async () => {
    const { deps } = liveDeps({ env: "prod" });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    // cache/seen-urls.json = 발행 파일 카드의 기억(M1-12)
    expect(readdirSync(dataDir).sort()).toEqual(["cache", "news", "runs.json"]);
    const runs = RunsFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs.json"), "utf8")),
    );
    expect(runs[0]).toMatchObject({ runId: outcome.runId, env: "prod" });
    expect(readNews("2026-10-11").runId).toBe(outcome.runId);
  });

  it("npm run validate(configs·data 스키마·교차 검사)가 새 data 파일(news·runs.json·cache/seen-urls.json)을 통과시킨다", async () => {
    const repo = path.join(dataDir, "repo");
    cpSync(path.join(ROOT, "configs"), path.join(repo, "configs"), {
      recursive: true,
    });
    const { deps } = liveDeps({
      env: "prod",
      dataDir: path.join(repo, "data"),
    });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    const report = buildValidationReport(
      readValidationSnapshot(repo, { configsOnly: false }),
      { configsOnly: false },
    );
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(validationExitCode(report)).toBe(0);
    expect(report.counts.data).toBe(3); // news·runs.json·cache/seen-urls.json 모두 스키마 검사 대상
    expect(readdirSync(path.join(repo, "data")).sort()).toEqual([
      "cache",
      "news",
      "runs.json",
    ]);
    expect(readdirSync(path.join(repo, "data", "cache"))).toEqual([
      "seen-urls.json",
    ]);
  });

  it("prod는 LLM을 부르지 않은 실행도 기록한다(경기 없음), dev도 데이터 API를 불렀으면 비용 0으로 기록한다(M1-48 카운터)", async () => {
    const quiet = {
      fetch: fakeFetch({ feed: BBC_XML, fd: '{"matches":[]}' }).fetch,
    };
    const prod = liveDeps({ env: "prod", ...quiet });
    await runCollect(prod.deps);
    const runs = RunsFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs.json"), "utf8")),
    );
    expect(runs[0]).toMatchObject({
      costUsd: 0,
      status: "success",
      summarized: 0,
    });

    rmSync(path.join(dataDir, "runs.json"));
    const dev = liveDeps({ env: "dev", ...quiet });
    await runCollect(dev.deps);
    const devRuns = RunsDevFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs-dev.json"), "utf8")),
    );
    expect(devRuns).toEqual([
      expect.objectContaining({
        env: "dev",
        costUsd: 0,
        apiCalls: { footballData: 1, apiFootball: 0 },
      }),
    ]);
  });

  it("dev에서 데이터 API도 LLM도 부르지 않은 실행(키 없음)은 기록하지 않는다", async () => {
    const dev = liveDeps({ env: "dev", footballDataApiKey: undefined });
    await runCollect(dev.deps);
    expect(readdirSync(dataDir).sort()).toEqual(["cache", "news"]); // cache/ = seen-urls 기억(M1-12)
  });

  it("예산 초과가 예상되면 LLM을 부르지 않는다", async () => {
    const { deps, params, llmCreated } = liveDeps({
      resolveBriefConfig: () => ({
        model: "claude-haiku-5-5",
        budgets: { dailyBudgetUsd: 0, monthlyBudgetUsd: 3 },
      }),
    });
    const outcome = await runCollect(deps);
    expect(outcome.brief).toMatchObject({ state: "skipped", reason: "budget" });
    expect(params).toHaveLength(0);
    expect(llmCreated()).toBe(0);
    expect(outcome.exitCode).toBe(0);
  });
});

describe("collect-run.ts — 설정 해석", () => {
  it("실행 환경: Actions면 prod, 아니면 dev", () => {
    expect(resolveRunEnv({ GITHUB_ACTIONS: "true" })).toBe("prod");
    expect(resolveRunEnv({})).toBe("dev");
    expect(resolveRunEnv({ GITHUB_ACTIONS: "false" })).toBe("dev");
  });

  it("카드 상한: --limit(없으면 MAX_ITEMS_PER_RUN — M1-14, 슬라이스 기본 5건 폐지), MAX_ITEMS_PER_RUN을 넘지 않음", () => {
    expect(resolveCardLimit(null, 45)).toBe(45);
    expect(resolveCardLimit(null, 30)).toBe(30);
    expect(resolveCardLimit(10, 45)).toBe(10);
    expect(resolveCardLimit(100, 45)).toBe(45);
    expect(resolveMaxItems(undefined)).toBe(45);
    expect(resolveMaxItems("30")).toBe(30);
    expect(() => resolveMaxItems("0")).toThrow();
    expect(() => resolveMaxItems("abc")).toThrow();
  });

  it("기록 여부: 데이터 API 호출이 있으면 mock·dry·dev도 기록(M1-48 일일 카운터)", () => {
    for (const apiCalls of [
      { footballData: 1, apiFootball: 0 },
      { footballData: 0, apiFootball: 12 },
    ]) {
      expect(
        shouldRecordRun({
          llmMode: "mock",
          env: "dev",
          dry: true,
          llmCalls: 0,
          apiCalls,
        }),
      ).toBe(true);
    }
    expect(
      shouldRecordRun({
        llmMode: "mock",
        env: "dev",
        dry: true,
        llmCalls: 1,
        apiCalls: { footballData: 0, apiFootball: 0 },
      }),
    ).toBe(false);
  });

  it("기록 여부: mock 안 함 · live LLM 호출 시 dry여도 기록 · prod 비dry는 항상", () => {
    expect(
      shouldRecordRun({
        llmMode: "mock",
        env: "prod",
        dry: false,
        llmCalls: 1,
      }),
    ).toBe(false);
    expect(
      shouldRecordRun({ llmMode: "live", env: "dev", dry: true, llmCalls: 1 }),
    ).toBe(true);
    expect(
      shouldRecordRun({ llmMode: "live", env: "dev", dry: false, llmCalls: 0 }),
    ).toBe(false);
    expect(
      shouldRecordRun({
        llmMode: "live",
        env: "prod",
        dry: false,
        llmCalls: 0,
      }),
    ).toBe(true);
    expect(
      shouldRecordRun({ llmMode: "live", env: "prod", dry: true, llmCalls: 0 }),
    ).toBe(false);
  });

  it("상태: 뉴스 실패 = failed, 브리핑 실패·키 없음 = partial", () => {
    const done: BriefOutcome = { state: "done", inputMatches: 1, lines: ["a"] };
    expect(runStatus({ ok: false }, done)).toBe("failed");
    expect(runStatus({ ok: true }, done)).toBe("success");
    expect(
      runStatus(
        { ok: true },
        { state: "failed", reason: "llm", detail: "", inputMatches: 1 },
      ),
    ).toBe("partial");
    expect(
      runStatus(
        { ok: true },
        { state: "skipped", reason: "no-api-key", inputMatches: 0 },
      ),
    ).toBe("partial");
    expect(
      runStatus(
        { ok: true },
        { state: "skipped", reason: "no-matches", inputMatches: 0 },
      ),
    ).toBe("success");
  });

  it("상태: seen-urls 기억 읽기·쓰기 오류 = partial(발행은 됨, M1-12), 뉴스 실패가 우선", () => {
    const done: BriefOutcome = { state: "done", inputMatches: 1, lines: ["a"] };
    const seen = (readError: string | null, writeError: string | null) => ({
      readError,
      writeError,
    });
    expect(runStatus({ ok: true, seen: seen(null, null) }, done)).toBe(
      "success",
    );
    expect(runStatus({ ok: true, seen: null }, done)).toBe("success");
    expect(
      runStatus({ ok: true, seen: seen("JSON 파싱 실패", null) }, done),
    ).toBe("partial");
    expect(runStatus({ ok: true, seen: seen(null, "EACCES") }, done)).toBe(
      "partial",
    );
    expect(
      runStatus({ ok: false, seen: seen("JSON 파싱 실패", null) }, done),
    ).toBe("failed");
  });
});
