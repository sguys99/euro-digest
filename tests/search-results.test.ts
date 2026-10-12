/**
 * M1-06 검색형 소스 공통 — 매체 도메인 허용 목록 필터 `scripts/lib/search-results.ts` 단위 테스트 (PRD FR-02, §15 D25).
 *
 * - allow만 통과, feed-only·deny·목록 없음·URL 오류는 제외하고 사유별로 센다.
 * - 판정은 결과 URL 호스트로(검색 서비스 domain 필드 무시), 하위 도메인·`www.`·대소문자·포트 처리, 카드가 될 수 없는 URL은 invalid-url.
 * - 실제 configs/publisher-domains.json 기준: fixtures/rss의 국내 매체(인터풋볼·풋볼리스트·베스트일레븐) 링크는 allow,
 *   BBC·ESPN 등 피드 한정 매체 링크는 feed-only로 검색 결과에서 빠진다.
 * - 검색 결과의 제목·시각은 카드 입력(FeedItem)으로 그대로 넘길 수 없다(M0-27 — 타입으로 확인).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FeedItemSchema,
  type FeedItem,
  type PublisherDomain,
} from "@/lib/schema";

import {
  filterSearchResults,
  loadPublisherDomains,
  searchResultHost,
  type SearchResultItem,
} from "../scripts/lib/search-results";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const RSS_INDEX = JSON.parse(
  readFileSync(path.join(ROOT, "fixtures/rss/index.json"), "utf8"),
) as { sources: Array<{ id: string; items: Array<{ link: string }> }> };

/** fixtures/rss의 소스 id → 그 피드의 원문 링크 전부 */
function fixtureLinks(sourceId: string): string[] {
  const entry = RSS_INDEX.sources.find((s) => s.id === sourceId);
  if (!entry)
    throw new Error(`fixtures/rss/index.json에 없는 소스: ${sourceId}`);
  return entry.items.map((item) => item.link);
}

function result(
  url: string,
  over: Partial<SearchResultItem> = {},
): SearchResultItem {
  return {
    sourceId: "gdelt-doc",
    queryId: "gd-test",
    url,
    titleFromSearch: "검색 서비스 제목 , 정규화 흔적",
    timeFromSearch: "2026-10-10T06:45:00.000Z",
    ...over,
  };
}

function domain(
  name: string,
  status: PublisherDomain["status"],
): PublisherDomain {
  return {
    domain: name,
    publisher: `매체 ${name}`,
    status,
    sourceIds: status === "feed-only" ? ["some-feed"] : [],
    basis: "테스트",
    basisUrl: "https://example.com/terms",
    checkedAt: "2026-10-12",
  };
}

const DOMAINS = [
  domain("interfootball.co.kr", "allow"),
  domain("besteleven.com", "allow"),
  domain("bbc.co.uk", "feed-only"),
  domain("theguardian.com", "deny"),
  domain("sky.de", "allow"),
  domain("sport.sky.de", "deny"),
];

// ─── 실제 configs·fixtures ───────────────────────────────────────────────

describe("configs/publisher-domains.json × fixtures/rss 링크", () => {
  const KOREAN = [
    "interfootball-world",
    "interfootball-all",
    "footballist-football",
    "besteleven-world",
    "besteleven-all",
  ];
  const FEED_ONLY = [
    "bbc-sport-football",
    "bbc-sport-premier-league",
    "bbc-sport-champions-league",
    "bbc-sport-european",
    "espn-soccer",
    "the-athletic-football",
    "daily-briefing",
    "di-marzio",
    "relevo",
  ];

  it("국내 매체(인터풋볼·풋볼리스트·베스트일레븐) 링크는 모두 allow — 매체명이 붙는다", async () => {
    const domains = await loadPublisherDomains(ROOT);
    const items = KOREAN.flatMap((id) =>
      fixtureLinks(id).map((u) => result(u)),
    );
    expect(items.length).toBeGreaterThan(0);
    const out = filterSearchResults(items, domains);
    expect(out.rejected).toEqual([]);
    expect(out.counts.allow).toBe(items.length);
    expect(new Set(out.allowed.map((a) => a.publisher))).toEqual(
      new Set(["인터풋볼", "풋볼리스트", "베스트일레븐"]),
    );
  });

  it("BBC·ESPN·The Athletic·Daily Briefing·Di Marzio·Relevo 링크는 feed-only로 검색 결과에서 빠진다", async () => {
    const domains = await loadPublisherDomains(ROOT);
    for (const id of FEED_ONLY) {
      const items = fixtureLinks(id).map((u) => result(u));
      const out = filterSearchResults(items, domains);
      expect(out.allowed, id).toEqual([]);
      expect(out.counts["feed-only"], id).toBe(items.length);
    }
  });

  it("BBC·ESPN 매칭 도메인 확인", async () => {
    const domains = await loadPublisherDomains(ROOT);
    const out = filterSearchResults(
      [...fixtureLinks("bbc-sport-football"), ...fixtureLinks("espn-soccer")]
        .slice(0, 50)
        .map((u) => result(u)),
      domains,
    );
    expect(new Set(out.rejected.map((r) => r.publisherDomain))).toEqual(
      new Set(["bbc.co.uk", "espn.com"]),
    );
  });
});

// ─── 사유별 집계 ─────────────────────────────────────────────────────────

describe("filterSearchResults — allow만 통과, 사유별 집계", () => {
  it("섞인 결과를 판정별로 나누고 입력 순서를 지킨다", () => {
    const items = [
      result("https://www.interfootball.co.kr/news/articleView.html?idxno=1"),
      result("https://www.bbc.co.uk/sport/football/articles/abc"),
      result("https://www.theguardian.com/football/2026/oct/10/x"),
      result("https://www.example-news.com/a"),
      result("https://m.besteleven.com/news/articleView.html?idxno=2"),
      result("https://example-news.com/b"),
      result("https://other.org/c"),
      result("ftp://www.interfootball.co.kr/file"),
      result("not a url"),
    ];
    const out = filterSearchResults(items, DOMAINS);
    expect(out.counts).toEqual({
      allow: 2,
      "feed-only": 1,
      deny: 1,
      "not-listed": 3,
      "invalid-url": 2,
    });
    expect(out.allowed.map((a) => [a.host, a.publisherDomain])).toEqual([
      ["www.interfootball.co.kr", "interfootball.co.kr"],
      ["m.besteleven.com", "besteleven.com"],
    ]);
    expect(
      out.rejected.map((r) => [r.reason, r.host, r.publisherDomain]),
    ).toEqual([
      ["feed-only", "www.bbc.co.uk", "bbc.co.uk"],
      ["deny", "www.theguardian.com", "theguardian.com"],
      ["not-listed", "www.example-news.com", null],
      ["not-listed", "example-news.com", null],
      ["not-listed", "other.org", null],
      ["invalid-url", null, null],
      ["invalid-url", null, null],
    ]);
    // 목록 없는 호스트 빈도 — www. 제외해 합치고 건수 내림차순 → 이름순
    expect(out.notListedHosts).toEqual([
      { host: "example-news.com", count: 2 },
      { host: "other.org", count: 1 },
    ]);
  });

  it("통과 결과는 입력 필드를 그대로 갖고 매체 정보를 덧붙인다(제목·URL 무수정)", () => {
    const item = result(
      "https://www.interfootball.co.kr/news/articleView.html?idxno=7",
      {
        domain: "interfootball.co.kr",
      },
    );
    const [allowed] = filterSearchResults([item], DOMAINS).allowed;
    expect(allowed).toEqual({
      ...item,
      host: "www.interfootball.co.kr",
      publisherDomain: "interfootball.co.kr",
      publisher: "매체 interfootball.co.kr",
    });
  });

  it("빈 입력 → 모두 0, 빈 목록 → 전부 not-listed(기본 차단)", () => {
    expect(filterSearchResults([], DOMAINS)).toEqual({
      allowed: [],
      rejected: [],
      counts: {
        allow: 0,
        "feed-only": 0,
        deny: 0,
        "not-listed": 0,
        "invalid-url": 0,
      },
      notListedHosts: [],
    });
    const out = filterSearchResults(
      [result("https://www.interfootball.co.kr/a")],
      [],
    );
    expect(out.counts["not-listed"]).toBe(1);
    expect(out.allowed).toEqual([]);
  });
});

// ─── 호스트 매칭 ─────────────────────────────────────────────────────────

describe("filterSearchResults — 호스트 매칭(URL 호스트 기준)", () => {
  it.each([
    ["https://interfootball.co.kr/a", "allow"],
    ["https://www.interfootball.co.kr/a", "allow"],
    ["https://WWW.InterFootball.CO.KR/a", "allow"], // 대소문자
    ["https://www.interfootball.co.kr:8443/a", "allow"], // 포트
    ["https://www.interfootball.co.kr./a", "invalid-url"], // 끝 점 — 카드 링크 스키마(HttpUrlSchema)가 받지 않는 URL은 통과시키지 않는다
    ["  https://www.interfootball.co.kr/a  ", "allow"], // 앞뒤 공백
    ["http://news.besteleven.com/a", "allow"], // 하위 도메인
    ["https://www.sky.de/fussball", "allow"],
    ["https://sport.sky.de/fussball", "deny"], // 가장 긴 항목 우선
    ["https://live.sport.sky.de/x", "deny"],
    ["https://news.bbc.co.uk/sport", "feed-only"],
    ["https://notinterfootball.co.kr/a", "not-listed"], // 접미사만 같은 도메인
    ["https://interfootball.co.kr.evil.com/a", "not-listed"],
    ["https://interfootball.co.kr@evil.com/a", "not-listed"], // userinfo로 위장 — 실제 호스트는 evil.com
    ["https://co.kr/a", "not-listed"],
    ["mailto:desk@interfootball.co.kr", "invalid-url"],
    ["javascript:alert(1)", "invalid-url"],
    ["", "invalid-url"],
  ])("%j → %s", (url, expected) => {
    const out = filterSearchResults([result(url)], DOMAINS);
    const verdict =
      out.allowed.length === 1 ? "allow" : out.rejected[0]?.reason;
    expect(verdict).toBe(expected);
  });

  it("검색 서비스의 domain 필드는 판정에 쓰지 않는다", () => {
    const out = filterSearchResults(
      [
        result("https://www.bbc.co.uk/sport/x", {
          domain: "interfootball.co.kr",
        }),
      ],
      DOMAINS,
    );
    expect(out.allowed).toEqual([]);
    expect(out.rejected[0]?.reason).toBe("feed-only");
  });

  it("searchResultHost — http/https만, 정규화한 호스트", () => {
    expect(searchResultHost("https://WWW.BBC.CO.UK:8443/x")).toBe(
      "www.bbc.co.uk",
    );
    expect(searchResultHost("ftp://bbc.co.uk/x")).toBeNull();
    expect(searchResultHost("bbc.co.uk/x")).toBeNull();
  });
});

// ─── 검색 제목·시각은 표시용 아님 (M0-27) ────────────────────────────────

describe("검색 결과 제목·시각 — 카드 입력으로 그대로 쓸 수 없다", () => {
  it("통과 결과에는 title·publishedAt이 없다 — FeedItem에 대입하면 타입 오류이고 공통 형식 zod도 거부(RSS 제목·og:title로 교체 필요)", () => {
    const [allowed] = filterSearchResults(
      [result("https://www.interfootball.co.kr/news/articleView.html?idxno=9")],
      DOMAINS,
    ).allowed;
    if (!allowed) throw new Error("통과 결과가 있어야 한다");
    // @ts-expect-error -- 검색 결과 제목은 표시용이 아니다(M0-27): AllowedSearchResult는 FeedItem이 아니다
    const card: FeedItem = allowed;
    expect(card).not.toHaveProperty("title");
    expect(card).not.toHaveProperty("link");
    expect(card).not.toHaveProperty("publishedAt");
    expect(FeedItemSchema.safeParse(allowed).success).toBe(false);
    expect(card).toHaveProperty("titleFromSearch");
    expect(card).toHaveProperty("timeFromSearch");
  });
});
