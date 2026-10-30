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
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BriefFileSchema,
  NewsFileSchema,
  RunsDevFileSchema,
  RunsFileSchema,
  SourcesFileSchema,
  UnknownNamesFileSchema,
  type BriefFile,
  type FeedItem,
  type NewsFile,
} from "@/lib/schema";
import { kstWindowRangeUtc } from "@/lib/time";

import {
  BRIEF_LLM_MAX_MATCHES,
  briefInputWindow,
  buildBriefInput,
  roundLabel,
  type BriefInput,
} from "../scripts/lib/brief-input";
import {
  BRIEF_MAX_TOKENS,
  BRIEF_REQUEST_TIMEOUT_MS,
  buildBriefRequest,
  estimateBriefCost,
  BRIEF_PROMPT_PATH,
  parseBriefOutput,
} from "../scripts/lib/brief";
import { cardIdFor } from "../scripts/lib/card-id";
import { BRIEF_LLM_MIN_ATTEMPT_MS } from "../scripts/lib/collect-deadlines";
import { dedupeFeedItems } from "../scripts/lib/dedup";
import {
  briefLineCounts,
  recordedRunStatus,
  resolveCardLimit,
  resolveMaxItems,
  resolveRunEnv,
  runCollect,
  runStatus,
  shouldRecordRun,
  type BriefOutcome,
  type CollectDeps,
} from "../scripts/lib/collect-run";
import { isPublishedNewsRun } from "../scripts/lib/collect-window";
import {
  createLlmClient,
  LlmTransportError,
  type CallSingleOptions,
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
import { partialFindings } from "../scripts/lib/run-issues";
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

function briefFiles(): string[] {
  try {
    return readdirSync(path.join(dataDir, "briefs"));
  } catch {
    return [];
  }
}

function readBrief(date: string): BriefFile {
  return BriefFileSchema.parse(
    JSON.parse(
      readFileSync(path.join(dataDir, "briefs", `${date}.json`), "utf8"),
    ),
  );
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
  // M1-17(D39 ①): 요약문(description)은 `summary`로 꺼낸다(메모리 안 분류 입력 전용) — fixture에는 요약문이 없어 null
  it("BBC 피드 fixture에서 제목·링크·날짜(+ 요약문 자리)만 꺼낸다(본문·이미지 필드 없음)", async () => {
    const items = await parseFeedXml(BBC_XML);
    expect(items).toHaveLength(BBC_INDEX_ITEMS.length);
    items.forEach((item, i) => {
      expect(Object.keys(item).sort()).toEqual(
        ["authors", "link", "pubDate", "summary", "title"].sort(),
      );
      expect(item.summary).toBeNull();
      expect(item.title).toBe(BBC_INDEX_ITEMS[i]!.title);
      expect(item.link).toBe(BBC_INDEX_ITEMS[i]!.link);
      expect(item.pubDate).toBe(BBC_INDEX_ITEMS[i]!.pubDate);
    });
  });

  // M1-17(D39 ①): description은 `summary` 원문으로만(분류 입력 전용) — 본문·이미지는 여전히 담지 않는다
  it("content:encoded·enclosure는 결과에 담지 않고, description은 요약문 원문(summary)으로만 꺼낸다", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>t</title>
      <item><title>Title</title><link>https://example.com/a</link><pubDate>Sat, 10 Oct 2026 19:24:23 GMT</pubDate>
      <description>요약문</description><content:encoded><![CDATA[<p>본문</p>]]></content:encoded>
      <enclosure url="https://example.com/a.jpg" type="image/jpeg" length="1"/></item></channel></rss>`;
    const [item] = await parseFeedXml(xml);
    expect(item).toEqual({
      title: "Title",
      link: "https://example.com/a",
      pubDate: "Sat, 10 Oct 2026 19:24:23 GMT",
      summary: "요약문",
      authors: [],
    });
    expect(JSON.stringify(item)).not.toMatch(/본문|a\.jpg/);
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

  it("앞뒤 공백을 정리하고 안쪽 일반 공백은 그대로 둔다(줄바꿈·탭·제어 문자·이중 인코딩 규칙은 tests/news-card.test.ts)", () => {
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

// 카드 ID 규칙(M1-16 — 정규화 URL 해시, 옛 규칙 카드와 섞인 병합)은 tests/card-id.test.ts

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

  it("병합: 원문 링크가 추적 파라미터만 다른 같은 기사는 같은 ID이고 두 번 들어가지 않는다(정규화 URL — M1-12·M1-16)", () => {
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
    expect(aPlain.id).toBe(a.id); // 카드 ID = 정규화 URL 해시(M1-16) — 옛 규칙 ID와 섞인 경우는 tests/card-id.test.ts
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

  it("경기 결과만 넣는다 — 기사 텍스트·득점자 없음(goals: null), 연장·승부차기는 aet·regular·pens로 넣는다(M1-19)", () => {
    const raw = JSON.parse(FD_MATCHES_1010).matches as unknown[];
    const window = briefInputWindow("2026-10-11");
    const { results } = toFinishedResults(raw, COMPETITIONS, window);
    const base = results[0]!;
    const shootout = {
      ...base,
      matchId: 1,
      score: {
        ft: { home: 1, away: 1 },
        ht: { home: 0, away: 1 },
        regular: { home: 1, away: 1 },
        pens: { home: 4, away: 3 },
        duration: "PENALTY_SHOOTOUT" as const,
      },
    };
    const extraTime = {
      ...base,
      matchId: 2,
      score: {
        ft: { home: 2, away: 1 },
        ht: null,
        regular: null, // 응답에 90분 점수가 없으면 regular 키 없음
        pens: null,
        duration: "EXTRA_TIME" as const,
      },
    };
    const built = buildBriefInput({
      briefDate: "2026-10-11",
      results: [...results, shootout, extraTime],
      competitions: COMPETITIONS,
    });
    const { input, excluded } = built;
    expect(input.briefDate).toBe("2026-10-11");
    expect(input.matches).toHaveLength(25);
    expect(excluded).toEqual({ overCap: 0 });
    expect(built.extraTime).toBe(2);
    expect(input.standings).toEqual([]); // 순위를 넘기지 않았다
    expect(input.matches.find((m) => m.id === "m560593")).toEqual({
      id: "m560593",
      comp: "Premier League",
      round: "Matchday 6",
      home: "Arsenal",
      away: "Leeds United",
      ft: "2-1",
      ht: "0-0",
      goals: null,
    });
    const pso = input.matches.find((m) => m.id === "m1")!;
    expect(JSON.stringify(pso)).toBe(
      JSON.stringify({
        id: "m1",
        comp: "Premier League",
        round: "Matchday 6",
        home: "Arsenal",
        away: "Leeds United",
        ft: "1-1",
        ht: "0-1",
        aet: true,
        regular: "1-1",
        pens: "4-3",
        goals: null,
      }),
    );
    expect(input.matches.find((m) => m.id === "m2")).toEqual(
      expect.objectContaining({ ft: "2-1", aet: true }),
    );
    expect(input.matches.find((m) => m.id === "m2")).not.toHaveProperty(
      "regular",
    );
    for (const m of input.matches) {
      expect(
        Object.keys(m).every((k) =>
          [
            "id",
            "comp",
            "round",
            "home",
            "away",
            "ft",
            "ht",
            "aet",
            "regular",
            "pens",
            "goals",
          ].includes(k),
        ),
      ).toBe(true);
    }
    expect(
      buildBriefInput({
        briefDate: "2026-10-11",
        results,
        competitions: COMPETITIONS,
        maxMatches: 5,
      }).excluded.overCap,
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

  it("라운드 표기는 stage 우선 — 녹아웃 2차전(matchday 2)도 stage 원문, stage가 없으면 리그로 짐작하지 않는다(M1-23 리뷰 3회차 차단 1)", () => {
    expect(roundLabel({ stage: "PLAYOFFS", matchday: 2 })).toBe("PLAYOFFS");
    expect(roundLabel({ stage: "LAST_16", matchday: 1 })).toBe("LAST_16");
    expect(roundLabel({ stage: "FINAL", matchday: null })).toBe("FINAL");
    expect(roundLabel({ stage: null, matchday: 6 })).toBe("");
  });
});

describe("brief.ts — 요청 설정(D28)·출력 파싱", () => {
  const input = { briefDate: "2026-10-11", matches: [], standings: [] };

  it("단건 요청 — max_tokens 16,384(D57 — D53 8,192에서 상향), thinking 적응형 + effort medium 명시, 1요청이라 캐싱 끔", () => {
    const request = buildBriefRequest(input, "지시문");
    expect(request).toEqual({
      customId: "brief-2026-10-11",
      system: "지시문",
      user: JSON.stringify(input),
      maxTokens: BRIEF_MAX_TOKENS,
      effort: "medium",
      thinking: "adaptive",
    });
    expect(BRIEF_MAX_TOKENS).toBe(16_384);
    expect(BRIEF_REQUEST_TIMEOUT_MS).toBe(120_000);
    expect(request.cacheSystem).toBeUndefined();
  });

  it("예상 비용은 출력 상한(max_tokens)으로 잡아 실측보다 크다", () => {
    const request = buildBriefRequest(input, "가".repeat(2000));
    const estimate = estimateBriefCost(request, "claude-haiku-5-5");
    expect(estimate.tokens.out).toBe(16_384);
    expect(estimate.tokens.in).toBeGreaterThanOrEqual(2000);
    expect(estimate.usd).toBeGreaterThan(0);
    // 1회 최악값 = 입력 어림 + 출력 16,384 × $0.50/M($0.008192)
    expect(estimate.usd).toBeLessThan(0.01);
  });

  it("확정 출력 스키마로 줄을 꺼낸다(M1-20 — 코드블록은 벗기고 스키마로 판정, D40 ⑤)", () => {
    expect(parseBriefOutput(BRIEF_TEXT_OK)).toMatchObject({
      ok: true,
      fenced: false,
      droppedLines: 0,
    });
    // M0-30 슬라이스는 코드블록을 json 실패로 봤다 — D40 ⑤로 벗긴 뒤 스키마 판정(빈 객체 → schema)
    expect(parseBriefOutput("```json\n{}\n```")).toEqual({
      ok: false,
      reason: "schema",
      fenced: true,
    });
    expect(parseBriefOutput('{"l":[]}')).toEqual({
      ok: false,
      reason: "schema",
      fenced: false,
    });
    expect(parseBriefOutput("브리핑: {")).toEqual({
      ok: false,
      reason: "json",
      fenced: false,
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
    // 같은 5건(10/9 하이라이트 제외). 파일 순서 = 중요도(M1-17 — 점수 구간) → 최신 출처 시각 — 범위 근거 없는 'Naderi … Rangers'
    // (pos 3, 스코틀랜드)는 중요도가 가장 낮아 맨 뒤(M1-17 전에는 모두 imp 3이라 시각 순 2, 1, 3, 0, 4)
    const positions = file.cards.map((c) => byLink.get(c.src[0]!.u)!.pos);
    expect([...positions].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(positions.at(-1)).toBe(3);
    for (let i = 1; i < file.cards.length; i += 1) {
      const [a, b] = [file.cards[i - 1]!, file.cards[i]!];
      expect(a.imp).toBeGreaterThanOrEqual(b.imp);
      if (a.imp === b.imp) {
        expect(Date.parse(a.src[0]!.at)).toBeGreaterThanOrEqual(
          Date.parse(b.src[0]!.at),
        );
      }
    }
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

describe("runCollect — 전날 경기 결과 → 브리핑 단건(FR-29 판정) → data/briefs 게시(M1-19·M1-45)", () => {
  it("mock: football-data 경기 1요청 + 순위 5요청 → 종료 23경기 입력 → callSingle 1회(D28 설정) → 줄 출력, 입력이 다른 mock(입력 E)은 줄마다 강등 → 전체 템플릿", async () => {
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
      maxTokens: 16_384,
      effort: "medium",
      thinking: "adaptive",
    });
    expect(request.cacheSystem).toBeUndefined();
    // 지시문 = configs/prompts/summarize.md(M1-20 — M1-01 이월: 슬라이스 fixture 지시문에서 교체)
    expect(request.system).toBe(read(BRIEF_PROMPT_PATH).trim());
    // 기사 텍스트(제목·링크)는 브리핑 입력에 없다(D23·D24). 현재 순위는 입력 경기 대회의 확정 순위표(M1-19 — 중요도 순)
    // LLM 요청 본문은 중요도 순 앞 15경기(D51) — 23경기 중 리그 1 경기는 모두 잘려 리그 1 순위(sL1)도 본문에서 빠진다(템플릿·검사기는 전체 입력)
    const user = JSON.parse(request.user) as BriefInput;
    expect(Object.keys(user)).toEqual(["briefDate", "matches", "standings"]);
    expect(user.matches).toHaveLength(BRIEF_LLM_MAX_MATCHES);
    expect(user.standings.map((s) => s.id)).toEqual([
      "sBL",
      "sLL",
      "sPL",
      "sSA",
    ]);
    expect(request.user).not.toContain("bbc.co.uk");
    for (const card of outcome.news.file!.cards) {
      expect(request.user).not.toContain(card.t);
    }

    // 출력은 줄마다 치환·조사 보정 뒤 문장 + 원문(M1-21) — 제목 1줄 + 5줄 × 2
    const out = printed.find((p) => p.startsWith("── 브리핑 출력"));
    expect(out?.split("\n")).toHaveLength(11);
    expect(out).toContain(
      "1. 아틀레티코 마드리드가 알라베스 원정에서 1-2로 이겼고 이강인은",
    );
    expect(out).toContain("   원문: Atleti가 Alavés 원정에서");
    // 브리핑 파일(M1-19·M1-45, D38): mock 출력(M0-34 입력 E 원문)은 이 입력과 근거가 맞지 않아 5줄 모두 줄 단위 강등 → 통과 줄이
    // 없으면 같은 입력의 전체 템플릿(all-lines-downgraded — 줄마다 템플릿을 끼우는 것보다 경기 4줄 + 순위 줄 구성이 낫다).
    // 데이터 API를 불렀으므로 mock이어도 runs-dev.json에 호출 수를 비용 0으로 남긴다(M1-48). cache/ = seen-urls 기억(M1-12)
    expect(readdirSync(dataDir).sort()).toEqual([
      "briefs",
      "cache",
      "news",
      "runs-dev.json",
    ]);
    const briefFile = readBrief("2026-10-11");
    expect(briefFile).toMatchObject({
      date: "2026-10-11",
      runId: outcome.runId,
      mode: "template",
      generatedAt: NOW.toISOString(),
    });
    expect(briefFile.lines).toHaveLength(5);
    const ids = new Set([
      ...user.matches.map((m) => m.id),
      ...user.standings.map((s) => s.id),
    ]);
    for (const line of briefFile.lines) {
      expect(line.ai).toBe(false);
      for (const ref of line.refs) expect(ids.has(ref), ref).toBe(true);
      // 강등된 LLM 줄은 파일에 없다
      expect(outcome.brief.lines).not.toContain(line.text);
    }
    expect(outcome.briefFile).toMatchObject({
      action: "written",
      plan: { mode: "template", reason: "all-lines-downgraded" },
      existingMode: null,
      error: null,
    });
    // 템플릿은 사전 한글 이름 + 받침 기준 조사, 주어 팀 점수 먼저(M1-21 — D39 ②·D45 ④)
    // (중요도 순 — 한국 선수 소속팀 경기가 앞: 설영우 아우크스부르크·김민재 바이에른 뮌헨, 이강인 아틀레티코, 이재성 마인츠)
    expect(briefFile.lines.map((l) => l.text)).toEqual([
      "아우크스부르크와 바이에른 뮌헨이 분데스리가에서 2-2로 비겼다.",
      "아틀레티코 마드리드가 라리가 원정에서 알라베스를 2-1로 꺾었다.",
      "맨체스터 유나이티드와 토트넘이 프리미어리그에서 1-1로 비겼다.",
      "레버쿠젠이 분데스리가 원정에서 마인츠를 4-3으로 꺾었다.",
      "도르트문트가 승점 13으로 분데스리가 선두, 바이에른 뮌헨이 승점 11로 2위다.",
    ]);
    // 템플릿 줄도 게시할 때 refs로 대회를 채운다(D58 — 경기 m… → 입력 경기 대회, 순위 s… → 약칭표)
    expect(briefFile.lines.map((l) => l.comps)).toEqual([
      ["BUNDESLIGA"],
      ["LALIGA"],
      ["EPL"],
      ["BUNDESLIGA"],
      ["BUNDESLIGA"],
    ]);
    // dev 실행은 미등록 이름을 로그만 남긴다(unknown-names.json 없음 — M1-21)
    expect(readdirSync(path.join(dataDir, "cache"))).toEqual([
      "seen-urls.json",
    ]);
    expect(outcome.unknownNames).toMatchObject({ action: "logged" });
    // 2026-10-10 입력의 팀(23경기 + 순위표)은 모두 사전에 있다(D46 확정 반영 — 템플릿에 영문 팀명이 남지 않는다)
    expect(outcome.unknownNames!.observed).toEqual([]);
    for (const line of briefFile.lines) {
      expect(line.text, line.text).not.toMatch(/\p{Script=Latin}/u);
    }
    expect(outcome.run).toMatchObject({
      env: "dev",
      costUsd: 0,
      tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
      summarized: 0, // mock 줄은 LLM이 쓴 줄이 아니다
      apiCalls: { footballData: 6, apiFootball: 0 },
    });
    expect(outcome.status).toBe("success");
  });

  it("코드 검증(M1-23): summarize.brief.done·dry 출력에 FR-29 판정과 줄별 사유 코드 — 통과 줄 0이면 전체 템플릿(M1-45)", async () => {
    const { deps, printed, records } = makeDeps();
    const outcome = await runCollect(deps);
    expect(outcome.brief).toMatchObject({ state: "done" });
    const done = records.find((r) => r.event === "summarize.brief.done");
    // mock 출력(M0-34 입력 E의 원문)은 이 실행의 입력(football-data만 — 한국 선수 블록·득점자 없음)과 근거가 맞지 않는다 → 모든 줄 강등
    expect(done).toMatchObject({
      verdict: "downgrade-line:1,2,3,4,5",
      checkStage: "line",
      wholeReasons: [],
    });
    const lineReasons = done?.lineReasons as Record<string, string[]>;
    expect(lineReasons["1"]).toContain("ref-unknown"); // k927 — korean 블록 없음
    expect(lineReasons["5"]).toContain("latin-token"); // Christopher Nkunku — 득점자 없는 입력
    // 로그에는 문장 원문이 없다(사유 코드·짧은 근거만)
    expect(JSON.stringify(done)).not.toContain("Nkunku는");
    const out = printed.find((p) => p.startsWith("── 브리핑 출력"))!;
    expect(out.split("\n")[0]).toContain("판정 downgrade-line:1,2,3,4,5");
    expect(out).toMatch(/1\. .+ → 강등 대상 — ref-unknown\(k927\)/u);
    expect(out).toMatch(/1\. .+ → 강등 대상 — ref-unknown\(k927\).* ⇒ /u);
    expect(done).toMatchObject({
      attempts: 1,
      publishedAi: 0,
      grammar: {},
    });
    expect(readBrief("2026-10-11")).toMatchObject({ mode: "template" });
    expect(outcome.briefFile).toMatchObject({
      plan: { mode: "template", reason: "all-lines-downgraded" },
    });
  });

  it("검사기가 예상 밖 오류를 내도 브리핑 단계는 멈추지 않는다 — 판정 없는 출력은 게시하지 않고(재시도 없음) 템플릿, partial(이슈 brief)", async () => {
    const { deps, printed, records, llmRequests } = makeDeps({
      judgeBrief: () => {
        throw new Error("검사기 오류(시험)");
      },
    });
    const outcome = await runCollect(deps);
    // M1-45: 판정 없음 = downgrade-all(같은 코드가 다시 던지므로 재시도하지 않는다) → 같은 입력의 템플릿, 원인 check-error
    expect(outcome.brief).toMatchObject({
      state: "failed",
      reason: "llm",
      cause: "check-error",
      attempts: 1,
    });
    expect(llmRequests).toHaveLength(1);
    expect(
      records.find((r) => r.event === "summarize.brief.check-fail"),
    ).toMatchObject({ error: expect.stringContaining("검사기 오류") });
    expect(
      records.find((r) => r.event === "summarize.brief.done"),
    ).toMatchObject({ verdict: null, lineReasons: null });
    const out = printed.find((p) => p.startsWith("── 브리핑 출력"))!;
    expect(out).toContain("판정 없음(검사기 오류)");
    expect(out).toContain("1. 아틀레티코 마드리드가 알라베스 원정에서");
    expect(readBrief("2026-10-11")).toMatchObject({ mode: "template" });
    expect(outcome.briefFile?.plan).toMatchObject({ reason: "check-failed" });
    expect(outcome.status).toBe("partial");
    expect(
      partialFindings({
        purge: outcome.purge,
        news: outcome.news,
        brief: outcome.brief,
        briefFile: outcome.briefFile,
        ledger: null,
      }).map((f) => f.reason),
    ).toEqual(["brief"]);
  });

  it("종료 경기가 없으면 LLM을 부르지 않는다(호출 생략), 뉴스는 발행 — 창 안 경기가 없으면 no-matches, 모두 미종료면 results-pending(D60)", async () => {
    for (const [fd, reason] of [
      ['{"matches":[]}', "no-matches"],
      // 10-25 호 사건과 같은 모양 — 창 안 경기가 모두 TIMED(API-Football 키 없음 → 보충 불가). "끝난 경기가 없었다"가 아니다(D60)
      [
        JSON.stringify({
          matches: JSON.parse(FD_MATCHES_1010).matches.map((m: object) => ({
            ...m,
            status: "TIMED",
          })),
        }),
        "results-pending",
      ],
    ] as const) {
      const { deps, llmCreated, records } = makeDeps({
        fetch: fakeFetch({ feed: BBC_XML, fd }).fetch,
      });
      const outcome = await runCollect(deps);
      expect(outcome.brief).toEqual({
        state: "skipped",
        reason,
        inputMatches: 0,
      });
      expect(llmCreated()).toBe(0);
      expect(outcome.exitCode).toBe(0);
      expect(outcome.status).toBe("success");
      expect(
        records.find((r) => r.event === "summarize.brief.skip"),
      ).toMatchObject({ reason });
      // 경기 없는 날도 5줄 블록을 유지할 수 있게 empty 브리핑을 게시한다(D30·D38) — 이유는 emptyReason(D60)
      expect(readBrief("2026-10-11")).toMatchObject({
        mode: "empty",
        emptyReason: reason,
        lines: [],
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
    // 정형 입력이 없으면 브리핑 파일을 만들지 않는다(템플릿도 만들 수 없다)
    expect(briefFiles()).toEqual([]);
    expect(outcome.briefFile).toMatchObject({
      action: "none",
      plan: { mode: null, reason: "no-input" },
    });
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
    // 브리핑 설정이 틀려도 정형 입력이 있으니 템플릿을 게시한다(FR-26 정신)
    expect(readBrief("2026-10-11").mode).toBe("template");
    expect(outcome.briefFile?.plan).toMatchObject({ reason: "setup-failed" });
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
    expect(briefFiles()).toEqual([]);
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
    expect(readBrief("2026-10-12").mode).toBe("template");
    expect(skipped.briefFile?.plan).toMatchObject({ reason: "mock-missing" });

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
    expect(failed.briefFile).toMatchObject({
      action: "written",
      plan: { mode: "template", reason: "llm-failed" },
    });

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
    // 앞 실행과 같은 입력이라 템플릿 내용이 같다 — 다시 쓰지 않는다
    expect(bad.briefFile).toMatchObject({
      action: "unchanged",
      plan: { mode: "template", reason: "output-failed" },
      existingMode: "template",
    });
  });

  it("같은 날 재실행 — 그날 파일이 llm·mixed면 LLM을 부르지 않고 덮지 않는다(M1-19 재실행 판정)", async () => {
    for (const mode of ["llm", "mixed"] as const) {
      const lines = [
        {
          text: "아스널이 첼시를 2-1로 꺾었다.",
          ai: true,
          refs: ["m560593"],
        },
        ...(mode === "mixed"
          ? [
              {
                text: "프리미어리그 Chelsea 5-1 Bournemouth, 홈팀이 4골 차로 이겼다.",
                ai: false,
                refs: ["m560595"],
              },
            ]
          : []),
      ];
      const existing = BriefFileSchema.parse({
        date: "2026-10-11",
        generatedAt: "2026-10-10T21:31:00.000Z",
        runId: "collect-prod-20261010T213000Z-0000",
        mode,
        lines,
      });
      const target = path.join(dataDir, "briefs", "2026-10-11.json");
      mkdirSync(path.dirname(target), { recursive: true });
      const text = `${JSON.stringify(existing, null, 2)}\n`;
      writeFileSync(target, text, "utf8");
      const { deps, llmCreated, records } = makeDeps();
      const outcome = await runCollect(deps);
      expect(outcome.brief).toEqual({
        state: "skipped",
        reason: "kept",
        existingMode: mode,
        inputMatches: 23,
      });
      expect(llmCreated()).toBe(0);
      expect(readFileSync(target, "utf8")).toBe(text);
      expect(outcome.briefFile).toMatchObject({
        action: "none",
        plan: { mode: null, reason: "kept" },
        existingMode: mode,
      });
      expect(outcome.status).toBe("success");
      expect(
        records.find((r) => r.event === "summarize.brief.skip"),
      ).toMatchObject({ reason: "kept", existingMode: mode });
    }
  });

  it("같은 날 재실행 — template은 같은 내용이면 다시 쓰지 않고, 깨진 파일은 새 템플릿으로 고친다(partial)", async () => {
    await runCollect(makeDeps().deps);
    const target = path.join(dataDir, "briefs", "2026-10-11.json");
    const before = readFileSync(target, "utf8");
    const mtime = statSync(target).mtimeMs;
    const later = () => new Date("2026-10-10T22:10:00.000Z"); // 같은 KST 날(07:10)
    const again = await runCollect(makeDeps({ now: later }).deps);
    expect(again.briefFile?.action).toBe("unchanged");
    expect(readFileSync(target, "utf8")).toBe(before);
    expect(statSync(target).mtimeMs).toBe(mtime);
    // 늦은 재실행이 경기를 덜 받아 줄이 줄어든 템플릿이면 공개된 브리핑을 바꾸지 않는다
    const fewer = JSON.stringify({
      matches: JSON.parse(FD_MATCHES_1010).matches.slice(0, 2),
    });
    const shrunk = await runCollect(
      makeDeps({
        now: later,
        fetch: fakeFetch({ feed: BBC_XML, fd: fewer }).fetch,
      }).deps,
    );
    expect(shrunk.briefFile).toMatchObject({
      action: "kept",
      existingMode: "template",
    });
    expect(shrunk.briefFile!.file!.lines.length).toBeLessThan(5);
    expect(readFileSync(target, "utf8")).toBe(before);

    writeFileSync(target, "{ broken", "utf8");
    const fixed = await runCollect(makeDeps({ now: later }).deps);
    expect(fixed.briefFile).toMatchObject({
      action: "written",
      readError: "JSON 형식 오류",
      existingMode: null,
    });
    expect(readBrief("2026-10-11").mode).toBe("template");
    expect(fixed.status).toBe("partial");
    expect(fixed.exitCode).toBe(0);
  });

  it("브리핑 파일을 쓰지 못해도 뉴스는 발행한다(partial)", async () => {
    writeFileSync(path.join(dataDir, "briefs"), "not a directory", "utf8");
    const { deps, records } = makeDeps();
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("partial");
    expect(outcome.briefFile).toMatchObject({
      action: "failed",
      plan: { mode: "template" },
    });
    expect(readNews("2026-10-11").cards).toHaveLength(5);
    expect(
      records.find((r) => r.event === "summarize.brief.publish.fail"),
    ).toMatchObject({ stage: "write" });
    expect(
      runStatus({ ok: true }, outcome.brief, null, {
        action: "written",
        readError: null,
      }),
    ).toBe("success");
  });

  it("--dry: 브리핑 파일을 쓰지 않고 내용을 출력한다(스키마 통과)", async () => {
    const { deps, printed } = makeDeps({ dry: true });
    const outcome = await runCollect(deps);
    expect(briefFiles()).toEqual([]);
    expect(outcome.briefFile?.action).toBe("dry");
    const out = printed.find((p) =>
      p.startsWith(
        "── [dry] data/briefs/2026-10-11.json (template · all-lines-downgraded, 5줄",
      ),
    );
    expect(out).toBeDefined();
    const json = JSON.parse(out!.slice(out!.indexOf("\n") + 1));
    expect(BriefFileSchema.parse(json).lines).toHaveLength(5);
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
      max_tokens: 16_384,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
    });
    expect(params[0]!.system).toEqual([
      {
        type: "text",
        text: read(BRIEF_PROMPT_PATH).trim(),
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
      // 게시 줄 기준(M1-45, FR-151): L1 통과(ai:true) · L2 '접전을 벌였다'는 문형 밖(grammar-unknown) → 같은 근거 템플릿 줄
      summarized: 1,
      downgraded: 1,
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

  it("출력 관용 파싱(M1-20, D40 ⑤): 코드블록을 벗기고 앞 5줄만 읽으며, 치환 뒤 80자 초과 줄은 강등 대상으로 표시만 한다", async () => {
    const long = `Chelsea가 홈에서 Bournemouth를 5-1로 꺾었고 ${"Bournemouth는 끝까지 따라붙지 못했고 ".repeat(3)}경기를 마쳤다.`;
    const lines = [
      { t: long, r: ["m560595"] },
      ...["m565812", "m560601", "m560593", "m565815", "m559672"].map((id) => ({
        t: "정상 길이의 브리핑 문장이다.",
        r: [id],
      })),
    ];
    const fake = fakeLiveTransport(
      "```json\n" + JSON.stringify({ l: lines }) + "\n```",
    );
    const { deps, printed, records } = makeDeps({
      llmMode: "live",
      dry: true,
      createLlm: () =>
        createLlmClient({
          mode: "live",
          model: "claude-haiku-5-5",
          transport: fake.transport,
          logger: () => undefined,
        }),
    });
    const outcome = await runCollect(deps);
    expect(outcome.brief).toMatchObject({ state: "done" });
    if (outcome.brief?.state !== "done") throw new Error("브리핑 미완료");
    expect(outcome.brief.lines).toHaveLength(5);
    const done = records.find((r) => r.event === "summarize.brief.done");
    expect(done).toMatchObject({
      lines: 5,
      fenced: true,
      droppedLines: 1,
      overLimitLines: 1,
    });
    expect(String(done?.prompt)).toMatch(/^p_[0-9a-f]{12}$/);
    const out = printed.find((p) => p.startsWith("── 브리핑 출력"));
    expect(out).toContain("코드블록을 벗겨 읽음");
    expect(out).toContain("5줄 넘는 1줄은 버림");
    expect(out?.match(/80자 초과, 강등 대상/g)).toHaveLength(1);
  });

  it("prod(Actions): runs.json에 기록하고 data/news도 쓴다", async () => {
    const { deps } = liveDeps({ env: "prod" });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    // cache/seen-urls.json = 발행 파일 카드의 기억(M1-12), briefs/ = 일일 브리핑(M1-19)
    expect(readdirSync(dataDir).sort()).toEqual([
      "briefs",
      "cache",
      "news",
      "runs.json",
    ]);
    const runs = RunsFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs.json"), "utf8")),
    );
    expect(runs[0]).toMatchObject({ runId: outcome.runId, env: "prod" });
    expect(readNews("2026-10-11").runId).toBe(outcome.runId);
  });

  it("prod + --dry(M1-10 이월 → M1-27): LLM 비용은 runs.json에 남기되 상태는 skipped — 수집 시간 창이 발행 실행으로 보지 않는다, data/news는 쓰지 않음", async () => {
    const { deps } = liveDeps({ env: "prod", dry: true });
    const outcome = await runCollect(deps);
    expect(outcome.status).toBe("success"); // 판정값은 로그·단계 출력에 그대로
    expect(newsFiles()).toEqual([]);
    const runs = RunsFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs.json"), "utf8")),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      runId: outcome.runId,
      env: "prod",
      status: "skipped",
      summarized: 1,
      downgraded: 1,
      tokens: { in: 6590, out: 3231 },
    });
    expect(runs[0]!.costUsd).toBeGreaterThan(0);
    expect(isPublishedNewsRun(runs[0]!)).toBe(false);
    expect(outcome.run?.status).toBe("skipped");
  });

  it("기록 상태: prod dry만 skipped, dev dry·비dry는 판정값 그대로", () => {
    expect(recordedRunStatus("success", { env: "prod", dry: true })).toBe(
      "skipped",
    );
    expect(recordedRunStatus("partial", { env: "prod", dry: true })).toBe(
      "skipped",
    );
    expect(recordedRunStatus("partial", { env: "prod", dry: false })).toBe(
      "partial",
    );
    expect(recordedRunStatus("partial", { env: "dev", dry: true })).toBe(
      "partial",
    );
  });

  /** 저장소 사본(configs — 브리핑 지시문 configs/prompts/summarize.md 포함) — 사본의 사전을 고쳐도 실제 configs는 그대로 */
  function copyRepo(repo: string): void {
    cpSync(path.join(ROOT, "configs"), path.join(repo, "configs"), {
      recursive: true,
    });
    expect(existsSync(path.join(repo, BRIEF_PROMPT_PATH))).toBe(true);
  }

  /** 저장소 사본의 names.ko.json에서 팀 항목을 뺀다 — 미등록 이름이 생기게 */
  function dropTeams(repo: string, slugs: readonly string[]): object[] {
    const namesPath = path.join(repo, "configs", "names.ko.json");
    const names = JSON.parse(readFileSync(namesPath, "utf8")) as {
      entries: Array<{ kind: string; slug?: string }>;
    };
    const dropped = names.entries.filter(
      (e) => e.kind === "team" && slugs.includes(e.slug ?? ""),
    );
    names.entries = names.entries.filter((e) => !dropped.includes(e));
    writeFileSync(namesPath, JSON.stringify(names));
    return dropped;
  }

  it("npm run validate(configs·data 스키마·교차 검사)가 새 data 파일(news·briefs·runs.json·cache/seen-urls.json·cache/unknown-names.json)을 통과시킨다", async () => {
    const repo = path.join(dataDir, "repo");
    copyRepo(repo);
    dropTeams(repo, ["inter"]); // 미등록 이름 1개(Inter) → unknown-names.json이 생긴다
    const { deps, params } = liveDeps({
      env: "prod",
      rootDir: repo,
      dataDir: path.join(repo, "data"),
    });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(params).toHaveLength(1); // 사본에서도 브리핑 1요청(지시문 복사)
    const report = buildValidationReport(
      readValidationSnapshot(repo, { configsOnly: false }),
      { configsOnly: false },
    );
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(validationExitCode(report)).toBe(0);
    expect(report.counts.data).toBe(5); // news·briefs·runs.json·cache/seen-urls.json·cache/unknown-names.json 모두 스키마 검사 대상
    // 검증 통과 줄 + 템플릿 강등이 섞인 브리핑(M1-45 — mixed)도 게이트를 통과한다
    const brief = BriefFileSchema.parse(
      JSON.parse(
        readFileSync(
          path.join(repo, "data", "briefs", "2026-10-11.json"),
          "utf8",
        ),
      ),
    );
    expect(brief.mode).toBe("mixed");
    expect(readdirSync(path.join(repo, "data")).sort()).toEqual([
      "briefs",
      "cache",
      "news",
      "runs.json",
    ]);
    expect(readdirSync(path.join(repo, "data", "cache")).sort()).toEqual([
      "seen-urls.json",
      "unknown-names.json",
    ]);
  });

  it("prod: 미등록 고유명사를 data/cache/unknown-names.json에 적재 — 실행당 1회, 사전 등록 이름은 다음 실행이 뺀다(M1-21)", async () => {
    const repo = path.join(dataDir, "repo-names");
    copyRepo(repo);
    // 사본 사전에서 인테르·브라이턴을 빼 미등록 이름을 만든다
    const [inter] = dropTeams(repo, ["inter"]);
    dropTeams(repo, ["brighton"]);
    const run = async () => {
      const { deps } = liveDeps({
        env: "prod",
        rootDir: repo,
        dataDir: path.join(repo, "data"),
      });
      return runCollect(deps);
    };
    const first = await run();
    expect(first.exitCode).toBe(0);
    expect(first.unknownNames).toMatchObject({ action: "written" });
    const file = path.join(repo, "data", "cache", "unknown-names.json");
    const read = () =>
      UnknownNamesFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    const before = read();
    // 데이터 API 이름(입력 팀) — 사전에 없는 팀만, 등록 팀(Man City 등)은 없다
    expect(before.names.Inter).toEqual({
      count: 1,
      firstSeen: NOW.toISOString(),
      lastSeen: NOW.toISOString(),
      kind: "team",
      cards: [],
    });
    expect(Object.keys(before.names)).toEqual(["Brighton Hove", "Inter"]);
    expect(before.names["Man City"]).toBeUndefined();
    expect(Object.keys(before.names)).toEqual(
      [...Object.keys(before.names)].sort(),
    );

    // 사람이 인테르를 사전에 다시 넣으면 다음 실행이 캐시에서 뺀다
    const namesPath = path.join(repo, "configs", "names.ko.json");
    const names = JSON.parse(readFileSync(namesPath, "utf8")) as {
      entries: object[];
    };
    names.entries.push(inter!);
    writeFileSync(namesPath, JSON.stringify(names));
    const second = await run();
    expect(second.unknownNames?.pruned).toEqual(["Inter"]);
    const after = read();
    expect(after.names.Inter).toBeUndefined();
    expect(after.names["Brighton Hove"]!.count).toBe(2);
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

  it("예산 초과가 예상되면 LLM을 부르지 않고 같은 입력의 템플릿을 게시한다(M1-22 이월)", async () => {
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
    const file = readBrief("2026-10-11");
    expect(file.mode).toBe("template");
    expect(file.lines.length).toBeGreaterThan(0);
    expect(file.lines.every((l) => !l.ai)).toBe(true);
    expect(outcome.briefFile?.plan).toMatchObject({ reason: "budget" });
    // 예산 생략 실행도 게시한 템플릿 줄 수를 downgraded로 남긴다(M1-22 이월 → M1-45)
    expect(outcome.run).toMatchObject({
      summarized: 0,
      downgraded: file.lines.length,
      costUsd: 0,
    });
  });
});

// ─── M1-45 브리핑 게시 — FR-29 재시도·줄 강등·마감·예산·사전 실패 ─────────────────

/**
 * mock 클라이언트 + 시도 customId 경로(이 실행의 brief-2026-10-11 · brief-2026-10-11-r1 → fixture id). 입력 일치 mock(slice-*)과
 * 실패 사례(brief-case-*)를 이 실행의 발행일 요청에 붙인다 — 경로에 없는 id는 그대로(없으면 LlmMockFixtureError).
 */
function routedMock(
  routes: Readonly<Record<string, string>>,
  requests: LlmRequest[],
  options: CallSingleOptions[] = [],
): Pick<LlmClient, "callSingle" | "model"> {
  const client = createLlmClient({ mode: "mock", logger: () => undefined });
  return {
    model: client.model,
    callSingle: (request, opts) => {
      requests.push(request);
      options.push(opts ?? {});
      return client.callSingle(
        { ...request, customId: routes[request.customId] ?? request.customId },
        opts,
      );
    },
  };
}

/** 단계별 응답을 돌려주는 가짜 live transport — 요청마다 customId·요청 타임아웃을 남기고, 시계를 밀 수 있다 */
type ScriptStep =
  | {
      text: string;
      stop?: "end_turn" | "max_tokens" | "refusal";
      advanceMs?: number;
    }
  | { error: LlmTransportError; advanceMs?: number };

function scriptedTransport(
  steps: readonly ScriptStep[],
  clock?: { t: number },
): {
  transport: LlmTransport;
  calls: Array<{ customId: string; timeoutMs: number | undefined }>;
} {
  const calls: Array<{ customId: string; timeoutMs: number | undefined }> = [];
  const unused = () => {
    throw new Error("배치는 쓰지 않는다");
  };
  return {
    calls,
    transport: {
      async createMessage(_params, meta) {
        const step = steps[Math.min(calls.length, steps.length - 1)]!;
        calls.push({ customId: meta.customId, timeoutMs: meta.timeoutMs });
        if (clock && step.advanceMs) clock.t += step.advanceMs;
        if ("error" in step) throw step.error;
        return {
          content: [{ type: "text", text: step.text }],
          stop_reason: step.stop ?? "end_turn",
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

const SLICE_LLM = JSON.parse(
  read("fixtures/llm/mock/by-id/slice-2026-10-11-llm.json"),
) as { text: string };
const SLICE_MIXED = JSON.parse(
  read("fixtures/llm/mock/by-id/slice-2026-10-11-mixed.json"),
) as { text: string };
const ENGLISH_OUTPUT = JSON.parse(
  read("fixtures/llm/mock/by-id/brief-case-english.json"),
) as { text: string };

/** slice-2026-10-11-llm의 치환·조사 보정 뒤 문장(검사기가 80자를 잰 문장 = 게시 문장) */
const SLICE_LLM_TEXTS = [
  "아우크스부르크와 바이에른 뮌헨이 2-2로 비겼다.",
  "아틀레티코 마드리드가 알라베스 원정에서 2-1로 이겼다.",
  "맨체스터 유나이티드와 토트넘이 1-1로 비겼다.",
  "레버쿠젠이 마인츠 원정에서 7골을 주고받은 끝에 4-3으로 이겼다.",
  "첼시가 본머스를 5-1로 완파했다.",
];

/** 발행일 2026-10-11 여름 slot 실행 — 06:46 KST 시작(마감 06:50까지 4분 ≥ 3분 → slot 기준, D41) */
const LATE_SLOT = Date.parse("2026-10-10T21:46:00.000Z");
const SLOT_DEADLINE = Date.parse("2026-10-10T21:50:00.000Z");

/** 움직이는 시계 + football-data 응답이 늦는 가짜 fetch — 경기 결과 응답에서 시계를 밀어 브리핑 시작 시 남은 시간을 정한다 */
function lateClock(remainingAtBriefMs: number) {
  const clock = { t: LATE_SLOT };
  const fetcher = fakeFetch({
    feed: BBC_XML,
    fd: () => {
      clock.t = SLOT_DEADLINE - remainingAtBriefMs;
      return new Response(FD_MATCHES_1010, { status: 200 });
    },
  });
  return { clock, fetch: fetcher.fetch, now: () => new Date(clock.t) };
}

/** 부분 실패 이슈 사유(collect.ts가 만드는 것과 같은 입력) */
function issueReasons(outcome: Awaited<ReturnType<typeof runCollect>>) {
  return partialFindings({
    purge: outcome.purge,
    news: outcome.news,
    brief: outcome.brief,
    briefFile: outcome.briefFile,
    ledger: outcome.matchData?.ledger ?? null,
  }).map((f) => f.reason);
}

describe("runCollect — 브리핑 게시(M1-45 — FR-29 재시도·줄 강등·마감)", () => {
  it("llm: 입력 일치 응답(5줄 모두 통과) → mode llm, 줄 = 치환·조사 보정 뒤 문장(ai:true)·모델 근거, 실행 success", async () => {
    const requests: LlmRequest[] = [];
    const { deps, records, printed } = makeDeps({
      createLlm: () =>
        routedMock({ "brief-2026-10-11": "slice-2026-10-11-llm" }, requests),
    });
    const outcome = await runCollect(deps);
    expect(outcome.brief).toMatchObject({
      state: "done",
      attempts: 1,
      verdict: "ok",
    });
    expect(requests.map((r) => r.customId)).toEqual(["brief-2026-10-11"]);
    const file = readBrief("2026-10-11");
    expect(file.mode).toBe("llm");
    // 줄 대회(D58)는 게시할 때 refs로 코드가 채운다(brief-comps.ts — mock 응답에는 comps가 없다)
    expect(file.lines).toEqual(
      SLICE_LLM_TEXTS.map((text, i) => ({
        text,
        ai: true,
        refs: [["m565819", "m564699", "m560600", "m565812", "m560595"][i]!],
        comps: [["BUNDESLIGA", "LALIGA", "EPL", "BUNDESLIGA", "EPL"][i]!],
      })),
    );
    expect(outcome.briefFile).toMatchObject({
      action: "written",
      plan: { mode: "llm", reason: "verified" },
    });
    expect(
      records.find((r) => r.event === "summarize.brief.done"),
    ).toMatchObject({
      verdict: "ok",
      attempts: 1,
      publishedAi: 5,
      publishedTemplate: 0,
      droppedOutputLines: 0,
      grammar: { draw: 2, win: 3 }, // 게시 줄 문형 분포(M1-23 이월)
    });
    expect(
      records.find((r) => r.event === "summarize.brief.publish"),
    ).toMatchObject({ mode: "llm", aiLines: 5, action: "written" });
    expect(printed.find((p) => p.startsWith("── 브리핑 출력"))).toContain(
      "1. 아우크스부르크와 바이에른 뮌헨이 2-2로 비겼다.  [m565819]  → 통과 ⇒ 게시(AI)",
    );
    expect(outcome.status).toBe("success");
    // mock 줄은 LLM이 쓴 줄이 아니다 — 실행 기록 줄 수 0(live만 센다)
    expect(outcome.run).toMatchObject({ summarized: 0, downgraded: 0 });
  });

  it("mixed(live·dry): 줄 단위 불일치(L3 점수)는 재시도 없이 그 줄만 같은 근거의 템플릿 줄 — runs-dev summarized 4·downgraded 1(게시 줄 기준)", async () => {
    const script = scriptedTransport([{ text: SLICE_MIXED.text }]);
    const { deps, printed } = makeDeps({
      llmMode: "live",
      dry: true,
      createLlm: (model) =>
        createLlmClient({
          mode: "live",
          model,
          transport: script.transport,
          logger: () => undefined,
        }),
    });
    const outcome = await runCollect(deps);
    expect(script.calls).toHaveLength(1);
    expect(outcome.brief).toMatchObject({
      state: "done",
      verdict: "downgrade-line:3",
    });
    expect(outcome.briefFile?.action).toBe("dry");
    const file = outcome.briefFile!.file!;
    expect(file.mode).toBe("mixed");
    expect(file.lines).toEqual([
      {
        text: "아우크스부르크와 바이에른 뮌헨이 2-2로 비겼다.",
        ai: true,
        refs: ["m565819"],
        comps: ["BUNDESLIGA"],
      },
      {
        text: "아틀레티코 마드리드가 알라베스 원정에서 2-1로 이겼다.",
        ai: true,
        refs: ["m564699"],
        comps: ["LALIGA"],
      },
      // 'Leverkusen이 Mainz를 4-2로 꺾었다'(입력 4-3) → 같은 근거 m565812의 템플릿 줄 — 강등 줄도 같은 규칙으로 대회(D58)
      {
        text: "레버쿠젠이 분데스리가 원정에서 마인츠를 4-3으로 꺾었다.",
        ai: false,
        refs: ["m565812"],
        comps: ["BUNDESLIGA"],
      },
      {
        text: "첼시가 본머스를 5-1로 완파했다.",
        ai: true,
        refs: ["m560595"],
        comps: ["EPL"],
      },
      {
        text: "도르트문트가 승점 13으로 분데스리가 선두다.",
        ai: true,
        refs: ["sBL"],
        comps: ["BUNDESLIGA"],
      },
    ]);
    expect(BriefFileSchema.parse(file)).toEqual(file);
    expect(
      printed.find((p) =>
        p.startsWith(
          "── [dry] data/briefs/2026-10-11.json (mixed · verified, 5줄",
        ),
      ),
    ).toBeDefined();
    expect(briefFiles()).toEqual([]);
    const runs = RunsDevFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs-dev.json"), "utf8")),
    );
    expect(runs[0]).toMatchObject({
      summarized: 4,
      downgraded: 1,
      tokens: { in: 6590, out: 3231 },
    });
  });

  it("FR-29 재시도: 출력 전체 실패(영어 출력) → 같은 입력·같은 지시문으로 brief-<날짜>-r1 1회 → 통과하면 그 출력 게시", async () => {
    const requests: LlmRequest[] = [];
    const { deps, records } = makeDeps({
      createLlm: () =>
        routedMock(
          {
            "brief-2026-10-11": "brief-case-english",
            "brief-2026-10-11-r1": "slice-2026-10-11-llm",
          },
          requests,
        ),
    });
    const outcome = await runCollect(deps);
    expect(requests.map((r) => r.customId)).toEqual([
      "brief-2026-10-11",
      "brief-2026-10-11-r1",
    ]);
    expect(requests[1]!.system).toBe(requests[0]!.system);
    expect(requests[1]!.user).toBe(requests[0]!.user);
    expect(requests[1]!.maxTokens).toBe(BRIEF_MAX_TOKENS);
    expect(outcome.brief).toMatchObject({
      state: "done",
      attempts: 2,
      verdict: "ok",
    });
    expect(readBrief("2026-10-11").mode).toBe("llm");
    expect(
      records
        .filter((r) => r.event === "summarize.brief.attempt")
        .map((r) => [r.attempt, r.verdict, r.checkStage]),
    ).toEqual([
      [1, "retry", "whole"],
      [2, "ok", "none"],
    ]);
    expect(
      records.find((r) => r.event === "summarize.brief.retry"),
    ).toMatchObject({ attempt: 2, customId: "brief-2026-10-11-r1" });
    expect(outcome.status).toBe("success");
  });

  it("FR-29 재시도: zod 실패(JSON 아님)도 같은 1회 안에서 — r1이 줄 단위 강등이면 mixed", async () => {
    const requests: LlmRequest[] = [];
    const { deps } = makeDeps({
      createLlm: () =>
        routedMock(
          {
            "brief-2026-10-11": "brief-case-json-invalid",
            "brief-2026-10-11-r1": "slice-2026-10-11-mixed",
          },
          requests,
        ),
    });
    const outcome = await runCollect(deps);
    expect(requests).toHaveLength(2);
    expect(outcome.brief).toMatchObject({ state: "done", attempts: 2 });
    expect(readBrief("2026-10-11").mode).toBe("mixed");
  });

  it("재시도도 출력 전체 실패면 템플릿(output-failed) — 요청은 BRIEF_MAX_ATTEMPTS(2)를 넘지 않고, partial·이슈 brief", async () => {
    const requests: LlmRequest[] = [];
    const { deps, records } = makeDeps({
      createLlm: () =>
        routedMock(
          {
            "brief-2026-10-11": "brief-case-english",
            "brief-2026-10-11-r1": "brief-case-han",
          },
          requests,
        ),
    });
    const outcome = await runCollect(deps);
    expect(requests).toHaveLength(2);
    expect(outcome.brief).toMatchObject({
      state: "failed",
      reason: "output",
      cause: "output",
      attempts: 2,
    });
    expect(
      records
        .filter((r) => r.event === "summarize.brief.attempt")
        .map((r) => r.verdict),
    ).toEqual(["retry", "downgrade-all"]);
    expect(readBrief("2026-10-11").mode).toBe("template");
    expect(outcome.briefFile?.plan).toMatchObject({ reason: "output-failed" });
    expect(outcome.status).toBe("partial");
    expect(issueReasons(outcome)).toEqual(["brief"]);
  });

  it("max_tokens(D40 ①·D53): 출력 전체 실패라 1회 재시도 — 같은 지시문이라 다시 잘리면 템플릿, 두 시도 토큰 모두 기록(live)", async () => {
    const script = scriptedTransport([
      { text: '{"l":[{"t":"', stop: "max_tokens" },
    ]);
    const { deps } = makeDeps({
      llmMode: "live",
      createLlm: (model) =>
        createLlmClient({
          mode: "live",
          model,
          transport: script.transport,
          logger: () => undefined,
        }),
    });
    const outcome = await runCollect(deps);
    expect(script.calls.map((c) => c.customId)).toEqual([
      "brief-2026-10-11",
      "brief-2026-10-11-r1",
    ]);
    expect(outcome.brief).toMatchObject({
      state: "failed",
      reason: "output",
      cause: "max-tokens",
      attempts: 2,
    });
    const file = readBrief("2026-10-11");
    expect(file.mode).toBe("template");
    expect(outcome.briefFile?.plan).toMatchObject({ reason: "output-failed" });
    // 잘린 출력도 과금된다 — 두 시도의 usage가 모두 기록되고, 게시 줄은 모두 템플릿
    expect(outcome.run).toMatchObject({
      tokens: { in: 6590 * 2, out: 3231 * 2 },
      summarized: 0,
      downgraded: file.lines.length,
    });
    expect(outcome.run!.costUsd).toBeGreaterThan(0);
  });

  it("max_tokens 뒤 재시도가 통과하면 그 출력을 게시한다", async () => {
    const requests: LlmRequest[] = [];
    const { deps } = makeDeps({
      createLlm: () =>
        routedMock(
          {
            "brief-2026-10-11": "brief-case-max-tokens",
            "brief-2026-10-11-r1": "slice-2026-10-11-llm",
          },
          requests,
        ),
    });
    const outcome = await runCollect(deps);
    expect(requests).toHaveLength(2);
    expect(outcome.brief).toMatchObject({ state: "done", attempts: 2 });
    expect(readBrief("2026-10-11").mode).toBe("llm");
  });

  it("refusal(D40 ①): 재시도 없이 바로 템플릿(refusal) — partial·이슈 brief", async () => {
    const requests: LlmRequest[] = [];
    const { deps } = makeDeps({
      createLlm: () =>
        routedMock({ "brief-2026-10-11": "brief-case-refusal" }, requests),
    });
    const outcome = await runCollect(deps);
    expect(requests).toHaveLength(1);
    expect(outcome.brief).toMatchObject({
      state: "failed",
      reason: "llm",
      cause: "refusal",
      attempts: 1,
    });
    expect(readBrief("2026-10-11").mode).toBe("template");
    expect(outcome.briefFile?.plan).toMatchObject({ reason: "refusal" });
    expect(outcome.status).toBe("partial");
    expect(issueReasons(outcome)).toEqual(["brief"]);
  });

  it("전송 실패(529 — llm.ts가 이미 재시도)·연결 오류는 FR-29 재시도 없이 템플릿(llm-failed)", async () => {
    for (const id of [
      "brief-case-errored-overloaded",
      "brief-case-errored-timeout",
    ]) {
      const requests: LlmRequest[] = [];
      const { deps, records } = makeDeps({
        createLlm: () => routedMock({ "brief-2026-10-11": id }, requests),
      });
      const outcome = await runCollect(deps);
      expect(requests, id).toHaveLength(1);
      expect(outcome.brief, id).toMatchObject({
        state: "failed",
        reason: "llm",
        cause: "transport",
      });
      // 응답 없는 연결 오류는 과금됐을 수 있다 — 추정(입력 어림 + max_tokens)을 경고로 남긴다(실측 비용은 0 그대로, 리뷰 권장 3)
      const risk = records.find(
        (r) => r.event === "summarize.brief.unbilled-risk",
      );
      if (id === "brief-case-errored-timeout") {
        expect(risk, id).toMatchObject({
          attempt: 1,
          estimatedOutputTokensMax: BRIEF_MAX_TOKENS,
        });
        expect(Number(risk!.estimatedUsdMax)).toBeGreaterThan(0);
      } else {
        expect(risk, id).toBeUndefined(); // 529는 서버가 처리하지 않은 응답(과금 없음)
      }
      expect(outcome.briefFile?.plan, id).toMatchObject({
        mode: "template",
        reason: "llm-failed",
      });
      expect(issueReasons(outcome), id).toEqual(["brief"]);
      rmSync(path.join(dataDir, "briefs"), { recursive: true, force: true });
    }
  });

  it("재시도 mock이 없으면(개발 mock 실행) 템플릿(mock-missing) — 첫 시도 mock이 없으면 지금처럼 건너뜀", async () => {
    const requests: LlmRequest[] = [];
    const { deps } = makeDeps({
      createLlm: () =>
        routedMock({ "brief-2026-10-11": "brief-case-english" }, requests),
    });
    const outcome = await runCollect(deps);
    expect(requests.map((r) => r.customId)).toEqual([
      "brief-2026-10-11",
      "brief-2026-10-11-r1",
    ]);
    expect(outcome.brief).toMatchObject({
      state: "failed",
      cause: "mock-missing",
      attempts: 1,
    });
    expect(outcome.briefFile?.plan).toMatchObject({ reason: "mock-missing" });
  });

  it("마감 부족: 남은 35초(40초 미만 — 출력 상한 8,192 ≈ 36초)면 LLM을 부르지 않고, 남은 45초면 부른다(BRIEF_LLM_MIN_ATTEMPT_MS)", async () => {
    for (const [remaining, called] of [
      [35_000, false],
      [45_000, true],
    ] as const) {
      const late = lateClock(remaining);
      const requests: LlmRequest[] = [];
      const { deps } = makeDeps({
        now: late.now,
        fetch: late.fetch,
        createLlm: () =>
          routedMock({ "brief-2026-10-11": "slice-2026-10-11-llm" }, requests),
      });
      const outcome = await runCollect(deps);
      expect(requests.length > 0, String(remaining)).toBe(called);
      expect(outcome.brief.state, String(remaining)).toBe(
        called ? "done" : "skipped",
      );
      rmSync(path.join(dataDir, "briefs"), { recursive: true, force: true });
    }
    expect(BRIEF_LLM_MIN_ATTEMPT_MS).toBe(40_000);
  });

  it("마감 부족: 브리핑 시작 때 남은 시간이 40초 미만이면 LLM을 부르지 않는다 — 예산 판정은 먼저, 템플릿(deadline), partial이지만 이슈 없음", async () => {
    const late = lateClock(20_000);
    const { deps, params, llmCreated, printed, records } = (() => {
      const fake = fakeLiveTransport(BRIEF_TEXT_OK);
      const made = makeDeps({
        llmMode: "live",
        now: late.now,
        fetch: late.fetch,
        createLlm: () =>
          createLlmClient({
            mode: "live",
            model: "claude-haiku-5-5",
            transport: fake.transport,
            logger: () => undefined,
          }),
      });
      return { ...made, params: fake.params };
    })();
    const outcome = await runCollect(deps);
    expect(records.find((r) => r.event === "collect.deadline")).toMatchObject({
      basis: "slot",
      briefDeadline: "2026-10-10T21:50:00.000Z",
    });
    expect(outcome.brief).toEqual({
      state: "skipped",
      reason: "deadline",
      remainingMs: 20_000,
      inputMatches: 23,
    });
    expect(params).toHaveLength(0);
    expect(llmCreated()).toBe(0);
    // 예산 판정(M1-22)이 마감 확인보다 먼저다 — 예상 비용을 출력한 뒤 마감으로 건너뛴다
    expect(printed.some((p) => p.startsWith("[cost] 예상"))).toBe(true);
    const file = readBrief("2026-10-11");
    expect(file.mode).toBe("template");
    expect(outcome.briefFile?.plan).toMatchObject({ reason: "deadline" });
    expect(outcome.status).toBe("partial");
    expect(issueReasons(outcome)).toEqual([]);
    expect(outcome.run).toMatchObject({
      summarized: 0,
      downgraded: file.lines.length,
    });
  });

  it("마감 부족과 예산 초과가 겹치면 예산 생략으로 기록한다(예산 판정이 먼저 — M1-22 이월)", async () => {
    const late = lateClock(20_000);
    const { deps } = makeDeps({
      llmMode: "live",
      now: late.now,
      fetch: late.fetch,
      resolveBriefConfig: () => ({
        model: "claude-haiku-5-5",
        budgets: { dailyBudgetUsd: 0, monthlyBudgetUsd: 3 },
      }),
      createLlm: () => {
        throw new Error("부르면 안 된다");
      },
    });
    const outcome = await runCollect(deps);
    expect(outcome.brief).toMatchObject({ state: "skipped", reason: "budget" });
    expect(outcome.briefFile?.plan).toMatchObject({ reason: "budget" });
  });

  it("요청 타임아웃 = min(120초(D57), 마감 − 현재) — 여유 있는 정시 실행은 120초, 남은 90초면 90초(D57 전 60초 상한이면 60초), 45초면 45초(M0-36 ①)", async () => {
    for (const [remaining, expected] of [
      [null, 120_000],
      [120_000, 120_000],
      [90_000, 90_000],
      [45_000, 45_000],
    ] as const) {
      const late = remaining === null ? null : lateClock(remaining);
      const script = scriptedTransport([{ text: SLICE_LLM.text }]);
      const { deps } = makeDeps({
        llmMode: "live",
        ...(late ? { now: late.now, fetch: late.fetch } : {}),
        createLlm: (model, clock) =>
          createLlmClient({
            mode: "live",
            model,
            transport: script.transport,
            now: clock.now,
            logger: () => undefined,
          }),
      });
      const outcome = await runCollect(deps);
      expect(script.calls.map((c) => c.timeoutMs)).toEqual([expected]);
      expect(outcome.brief).toMatchObject({ state: "done" });
      rmSync(path.join(dataDir, "briefs"), { recursive: true, force: true });
      rmSync(path.join(dataDir, "runs-dev.json"), { force: true });
    }
  });

  it("재시도도 마감 안에서만 — 첫 시도가 40초 걸려 남은 시간이 20초면 r1을 보내지 않고 템플릿(deadline, 이슈 없음)", async () => {
    const late = lateClock(60_000);
    const script = scriptedTransport(
      [{ text: ENGLISH_OUTPUT.text, advanceMs: 40_000 }],
      late.clock,
    );
    const { deps, records } = makeDeps({
      llmMode: "live",
      now: late.now,
      fetch: late.fetch,
      createLlm: (model, clock) =>
        createLlmClient({
          mode: "live",
          model,
          transport: script.transport,
          now: clock.now,
          logger: () => undefined,
        }),
    });
    const outcome = await runCollect(deps);
    expect(script.calls).toHaveLength(1);
    expect(script.calls[0]!.timeoutMs).toBe(60_000); // 남은 60초 < 상한 120초(D57) — 마감이 타임아웃을 줄인다
    expect(
      records.find((r) => r.event === "summarize.brief.retry.skip"),
    ).toMatchObject({ reason: "deadline", attempt: 2, remainingMs: 20_000 });
    expect(outcome.brief).toMatchObject({
      state: "failed",
      cause: "deadline",
      attempts: 1,
    });
    expect(outcome.briefFile?.plan).toMatchObject({
      mode: "template",
      reason: "deadline",
    });
    expect(outcome.status).toBe("partial");
    expect(issueReasons(outcome)).toEqual([]);
  });

  it("10-18 재현(D57): 첫 요청이 상한까지 thinking하다 잘려도(70초) 재시도 타임아웃 = min(120초, 남은 시간) — 겨울 정시 LLM 몫 4분이면 120초, 2분 30초면 80초", async () => {
    for (const [remaining, retryTimeout] of [
      [240_000, 120_000],
      [150_000, 80_000],
    ] as const) {
      const late = lateClock(remaining);
      const script = scriptedTransport(
        [
          { text: '{"l":[{"t":"', stop: "max_tokens", advanceMs: 70_000 },
          { text: SLICE_LLM.text, advanceMs: 25_000 },
        ],
        late.clock,
      );
      const { deps } = makeDeps({
        llmMode: "live",
        now: late.now,
        fetch: late.fetch,
        createLlm: (model, clock) =>
          createLlmClient({
            mode: "live",
            model,
            transport: script.transport,
            now: clock.now,
            logger: () => undefined,
          }),
      });
      const outcome = await runCollect(deps);
      expect(script.calls).toEqual([
        { customId: "brief-2026-10-11", timeoutMs: BRIEF_REQUEST_TIMEOUT_MS },
        { customId: "brief-2026-10-11-r1", timeoutMs: retryTimeout },
      ]);
      expect(outcome.brief).toMatchObject({ state: "done", attempts: 2 });
      rmSync(path.join(dataDir, "briefs"), { recursive: true, force: true });
      rmSync(path.join(dataDir, "runs-dev.json"), { force: true });
    }
  });

  it("마감에 걸려 끊긴 요청(줄인 타임아웃 → 연결 오류)은 마감 강등 — 재시도 없음, 이슈 없음", async () => {
    const late = lateClock(45_000);
    const script = scriptedTransport(
      [
        {
          error: new LlmTransportError({
            errorType: "connection_error",
            message: "요청 시간 초과",
          }),
          advanceMs: 45_000,
        },
      ],
      late.clock,
    );
    const { deps } = makeDeps({
      llmMode: "live",
      now: late.now,
      fetch: late.fetch,
      createLlm: (model, clock) =>
        createLlmClient({
          mode: "live",
          model,
          transport: script.transport,
          now: clock.now,
          logger: () => undefined,
        }),
    });
    const outcome = await runCollect(deps);
    expect(script.calls).toEqual([
      { customId: "brief-2026-10-11", timeoutMs: 45_000 },
    ]);
    expect(outcome.brief).toMatchObject({
      state: "failed",
      reason: "llm",
      cause: "deadline",
    });
    expect(outcome.briefFile?.plan).toMatchObject({ reason: "deadline" });
    expect(issueReasons(outcome)).toEqual([]);
  });

  it("사전 실패: configs/names.ko.json을 읽지 못하면 LLM을 부르지 않고 영문 이름 템플릿 — partial·이슈 brief(M1-45 결정)", async () => {
    const repo = path.join(dataDir, "repo-broken-names");
    cpSync(path.join(ROOT, "configs"), path.join(repo, "configs"), {
      recursive: true,
    });
    writeFileSync(path.join(repo, "configs", "names.ko.json"), "{ broken");
    const { deps, llmCreated } = makeDeps({
      rootDir: repo,
      dataDir: path.join(repo, "data"),
    });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(llmCreated()).toBe(0);
    expect(outcome.brief).toEqual({
      state: "skipped",
      reason: "names-unreadable",
      inputMatches: 23,
    });
    expect(outcome.briefFile).toMatchObject({
      action: "written",
      plan: { mode: "template", reason: "names-unreadable" },
    });
    // 사전 없이 만든 템플릿 — 영문 이름 그대로(M1-19 동작)
    expect(outcome.briefFile!.file!.lines[0]!.text).toContain("Augsburg");
    expect(outcome.status).toBe("partial");
    expect(issueReasons(outcome)).toEqual(["brief"]);
  });

  it("같은 날 재실행: 아침 템플릿(refusal) 뒤 LLM이 통과하면 llm으로 갱신, 그 뒤 실행은 LLM을 부르지 않는다(kept)", async () => {
    const first = await runCollect(
      makeDeps({
        createLlm: () =>
          routedMock({ "brief-2026-10-11": "brief-case-refusal" }, []),
      }).deps,
    );
    expect(first.briefFile).toMatchObject({
      action: "written",
      plan: { mode: "template" },
    });
    const later = () => new Date("2026-10-10T22:10:00.000Z"); // 같은 KST 날 07:10
    // 두 번째 실행은 live(과금 토큰이 있는 기록) — mock이 쓴 llm 파일은 kept로 치지 않는다(아래 테스트)
    const script = scriptedTransport([{ text: SLICE_LLM.text }]);
    const second = await runCollect(
      makeDeps({
        now: later,
        llmMode: "live",
        createLlm: (model) =>
          createLlmClient({
            mode: "live",
            model,
            transport: script.transport,
            logger: () => undefined,
          }),
      }).deps,
    );
    expect(second.briefFile).toMatchObject({
      action: "written",
      existingMode: "template",
      plan: { mode: "llm" },
    });
    expect(readBrief("2026-10-11").mode).toBe("llm");
    const third = makeDeps({ now: later });
    const kept = await runCollect(third.deps);
    expect(third.llmCreated()).toBe(0);
    expect(kept.brief).toMatchObject({ state: "skipped", reason: "kept" });
    expect(readBrief("2026-10-11").lines.map((l) => l.text)).toEqual(
      SLICE_LLM_TEXTS,
    );
  });

  it("mock 비dry 실행이 쓴 llm·mixed는 kept로 치지 않는다 — 쓸 때 경고, 같은 날 다음 live 실행이 LLM을 불러 덮는다(리뷰 권장 5)", async () => {
    const first = makeDeps({
      createLlm: () =>
        routedMock({ "brief-2026-10-11": "slice-2026-10-11-llm" }, []),
    });
    const mocked = await runCollect(first.deps);
    expect(mocked.briefFile).toMatchObject({
      action: "written",
      plan: { mode: "llm" },
    });
    expect(
      first.records.find((r) => r.event === "summarize.brief.mock-ai-lines"),
    ).toMatchObject({ mode: "llm", aiLines: 5 });
    // mock 실행 기록(데이터 API 호출 수만, LLM 토큰 0)이 runs-dev.json에 있다
    expect(mocked.run).toMatchObject({
      runId: readBrief("2026-10-11").runId,
      tokens: { in: 0, out: 0 },
    });

    const later = () => new Date("2026-10-10T22:10:00.000Z");
    const script = scriptedTransport([{ text: SLICE_MIXED.text }]);
    const second = makeDeps({
      now: later,
      llmMode: "live",
      createLlm: (model) =>
        createLlmClient({
          mode: "live",
          model,
          transport: script.transport,
          logger: () => undefined,
        }),
    });
    const live = await runCollect(second.deps);
    expect(script.calls).toHaveLength(1);
    expect(
      second.records.find((r) => r.event === "summarize.brief.mock-existing"),
    ).toMatchObject({ existingMode: "llm" });
    expect(live.briefFile).toMatchObject({
      action: "written",
      existingMode: "llm",
      plan: { mode: "mixed" },
    });
    expect(readBrief("2026-10-11").runId).toBe(live.runId);
    expect(
      second.records.some((r) => r.event === "summarize.brief.mock-ai-lines"),
    ).toBe(false);

    // live가 쓴 mixed는 그다음 실행이 지킨다(kept)
    const third = makeDeps({ now: later });
    const kept = await runCollect(third.deps);
    expect(third.llmCreated()).toBe(0);
    expect(kept.brief).toMatchObject({ state: "skipped", reason: "kept" });
  });
});

// ─── D56 하루 요청 상한·요청 기록 ──────────────────────────────────────────

describe("runCollect — 하루 브리핑 요청 상한·요청 기록(D56 — FR-25 하루 1~3요청)", () => {
  /** live 실행(가짜 transport, 전송 재시도 대기 없음) */
  function liveRun(
    steps: readonly ScriptStep[],
    over: Partial<CollectDeps> = {},
  ) {
    const script = scriptedTransport(steps);
    const made = makeDeps({
      llmMode: "live",
      createLlm: (model) =>
        createLlmClient({
          mode: "live",
          model,
          transport: script.transport,
          sleep: async () => undefined,
          logger: () => undefined,
        }),
      ...over,
    });
    return { ...made, script };
  }
  const devRuns = () =>
    RunsDevFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs-dev.json"), "utf8")),
    );
  const ENGLISH = { text: ENGLISH_OUTPUT.text };

  it("같은 날 두 실행이 2 + 1 = 3요청을 쓰면 세 번째 실행은 LLM 없이 템플릿(daily-cap) — 두 번째는 재시도 몫이 없어 1요청만, 이슈 없음", async () => {
    // ① 06:30 — 영어 출력 → FR-29 재시도 → 또 영어 → 템플릿(2요청)
    const first = liveRun([ENGLISH]);
    const a = await runCollect(first.deps);
    expect(first.script.calls).toHaveLength(2);
    expect(a.run?.brief).toEqual({ requests: 2 });

    // ② 07:10 — 남은 몫 1 → 시도 1회, 재시도가 필요하면 보내지 않고 템플릿(cause daily-cap)
    const second = liveRun([ENGLISH], {
      now: () => new Date("2026-10-10T22:10:00.000Z"),
    });
    const b = await runCollect(second.deps);
    expect(second.script.calls).toHaveLength(1);
    expect(
      second.records.find((r) => r.event === "summarize.brief.daily-cap"),
    ).toMatchObject({ used: 2, remaining: 1, attemptsAllowed: 1, cap: 3 });
    expect(b.brief).toMatchObject({
      state: "failed",
      reason: "output",
      cause: "daily-cap",
      attempts: 1,
    });
    expect(b.briefFile?.plan).toMatchObject({
      mode: "template",
      reason: "daily-cap",
    });
    expect(b.status).toBe("success"); // 의도된 제한 — 예산 생략과 같다
    expect(issueReasons(b)).toEqual([]);
    expect(b.run?.brief).toEqual({ requests: 1 });

    // ③ 08:30 — 3요청을 다 썼다 → LLM 클라이언트도 만들지 않는다
    const third = liveRun([ENGLISH], {
      now: () => new Date("2026-10-10T23:30:00.000Z"),
    });
    const c = await runCollect(third.deps);
    expect(third.llmCreated()).toBe(0);
    expect(third.script.calls).toHaveLength(0);
    expect(c.brief).toEqual({
      state: "skipped",
      reason: "daily-cap",
      used: 3,
      cap: 3,
      inputMatches: 23,
    });
    expect(
      third.records.find((r) => r.event === "summarize.brief.daily-cap"),
    ).toMatchObject({ used: 3, remaining: 0, attemptsAllowed: 0 });
    expect(c.status).toBe("success");
    expect(issueReasons(c)).toEqual([]);
    expect(c.run?.brief).toBeUndefined(); // 보낸 요청 0건 = 필드 없음
    expect(devRuns().map((r) => r.brief?.requests ?? 0)).toEqual([2, 1, 0]);

    // 다른 날짜는 따로 센다 — tests/brief-publish.test.ts briefDailyAllowance(이 입력 fixture는 2026-10-11 발행일 경기뿐)
  });

  it("옛 기록(brief 필드 없음)은 0건 — 같은 날 LLM 토큰이 있는 옛 기록이 있어도 시도 2회를 그대로 쓴다", async () => {
    const old = {
      runId: "collect-dev-20261010T213000Z-0001",
      env: "dev",
      job: "collect",
      startedAt: "2026-10-10T21:20:00.000Z",
      finishedAt: "2026-10-10T21:25:00.000Z",
      collected: 7,
      clusters: 5,
      summarized: 5,
      downgraded: 0,
      tokens: { in: 6590, out: 3231, cacheRead: 0, cacheWrite: 0 },
      costUsd: 0.002275,
      apiCalls: { footballData: 6, apiFootball: 0 },
      sources: [],
      status: "success",
    };
    writeFileSync(
      path.join(dataDir, "runs-dev.json"),
      `${JSON.stringify([old, { ...old, runId: "collect-dev-20261010T213000Z-0002" }])}\n`,
    );
    const run = liveRun([ENGLISH]);
    await runCollect(run.deps);
    expect(run.script.calls).toHaveLength(2);
    expect(
      run.records.find((r) => r.event === "summarize.brief.daily-cap"),
    ).toMatchObject({ used: 0, attemptsAllowed: 2 });
  });

  it("runs 파일을 읽지 못하면 live에서는 비용 가드가 먼저 LLM을 생략한다(runs_unreadable) — 하루 상한 판정까지 가지 않는다", async () => {
    writeFileSync(path.join(dataDir, "runs-dev.json"), "{ broken");
    const run = liveRun([ENGLISH]);
    const outcome = await runCollect(run.deps);
    expect(run.script.calls).toHaveLength(0);
    expect(outcome.brief).toMatchObject({
      state: "skipped",
      reason: "budget",
      budget: { verdict: "runs_unreadable" },
    });
    expect(
      run.records.some((r) => r.event === "summarize.brief.daily-cap"),
    ).toBe(false);
  });

  it("전송 재시도(529 → 재전송 → 성공)는 요청 1건, 응답 없이 끊긴 연결 오류는 1건 + unbilledRisk(실측 비용 0과 따로)", async () => {
    const overloaded = new LlmTransportError({
      status: 529,
      errorType: "overloaded_error",
      message: "overloaded",
    });
    const retried = liveRun([{ error: overloaded }, { text: SLICE_LLM.text }]);
    const ok = await runCollect(retried.deps);
    expect(retried.script.calls).toHaveLength(2); // HTTP 2회(llm.ts 전송 재시도)
    expect(ok.brief).toMatchObject({ state: "done", attempts: 1 });
    expect(ok.run?.brief).toEqual({ requests: 1 });

    rmSync(path.join(dataDir, "briefs"), { recursive: true, force: true });
    const cut = liveRun([
      {
        error: new LlmTransportError({
          errorType: "connection_error",
          message: "요청 시간 초과",
        }),
      },
    ]);
    const lost = await runCollect(cut.deps);
    expect(cut.script.calls).toHaveLength(1);
    expect(lost.run?.costUsd).toBe(0);
    expect(lost.run?.brief).toMatchObject({
      requests: 1,
      unbilledRisk: { requests: 1, outputTokensMax: BRIEF_MAX_TOKENS },
    });
    const risk = lost.run!.brief!.unbilledRisk!;
    expect(risk.inputTokens).toBeGreaterThan(0);
    expect(risk.usdMax).toBeGreaterThan(0);
    // 저장된 기록도 같은 값(스키마가 새 필드를 받는다 — validate). 두 실행의 startedAt이 같아(deps.now 고정) 파일 순서는 runId의
    // 무작위 접미사로 갈린다(cost.ts sortRuns) — 위치가 아니라 runId로 찾는다
    const saved = devRuns();
    expect(saved.map((r) => r.runId).sort()).toEqual(
      [ok.runId, lost.runId].sort(),
    );
    expect(saved.find((r) => r.runId === ok.runId)!.brief).toEqual({
      requests: 1,
    });
    expect(saved.find((r) => r.runId === lost.runId)!.brief).toEqual(
      lost.run!.brief,
    );
  });

  it("mock 실행은 요청을 기록하지 않고(LLM 비용 0 — mock 줄은 실제 요청이 아니다) 하루 상한도 보지 않는다", async () => {
    const { deps, records } = makeDeps();
    const outcome = await runCollect(deps);
    expect(outcome.run?.brief).toBeUndefined();
    expect(records.some((r) => r.event === "summarize.brief.daily-cap")).toBe(
      false,
    );
  });
});

describe("collect-run.ts — 설정 해석", () => {
  it("실행 기록 브리핑 줄 수(M1-45, FR-151): 게시 줄 기준 — written·unchanged·dry만, live만, ai:true = summarized·ai:false = downgraded", () => {
    const file = BriefFileSchema.parse({
      date: "2026-10-11",
      generatedAt: "2026-10-10T21:31:00.000Z",
      runId: "collect-dev-20261010T213000Z-0000",
      mode: "mixed",
      lines: [
        {
          text: "첼시가 본머스를 5-1로 완파했다.",
          ai: true,
          refs: ["m560595"],
        },
        {
          text: "아스널이 리즈 유나이티드를 2-1로 꺾었다.",
          ai: false,
          refs: ["m560593"],
        },
        {
          text: "인테르가 파르마를 3-0으로 완파했다.",
          ai: true,
          refs: ["m558582"],
        },
      ],
    });
    for (const action of ["written", "unchanged", "dry"] as const) {
      expect(briefLineCounts({ action, file }, true)).toEqual({
        summarized: 2,
        downgraded: 1,
      });
      expect(briefLineCounts({ action, file }, false)).toEqual({
        summarized: 0,
        downgraded: 0,
      });
    }
    for (const action of ["kept", "none", "failed"] as const) {
      expect(briefLineCounts({ action, file }, true)).toEqual({
        summarized: 0,
        downgraded: 0,
      });
    }
    expect(briefLineCounts(null, true)).toEqual({
      summarized: 0,
      downgraded: 0,
    });
  });

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
