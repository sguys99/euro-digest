/**
 * M1-09 — 수집 결과 공통 형식(FR-03) + "본문 필드 없음"(FR-02) + 피드 날짜 기본 시간대 `Source.tz`(PRD §15 D34).
 *
 * 네트워크 없음: 피드는 fixtures/rss/<소스 id>.xml(수집 대상 14개와 1:1), 소스는 configs/sources.json(실제 설정).
 *
 * 고정하는 것
 *   - FR-02: 실제 14개 피드를 파싱 → 정규화한 결과의 키 집합이 정확히 공통 형식 키(FEED_ITEM_KEYS)와 같다.
 *     `FeedItemSchema`(strictObject)는 본문·요약·이미지 키(`content:encoded`·`description`·`enclosure` …)를 거부한다.
 *     본문이 든 합성 피드도 정규화 결과에 본문 텍스트가 남지 않는다.
 *   - FR-03: 모든 결과가 `FeedItemSchema`를 통과하고 `summary`는 null(M1-09 — RSS description을 읽지 않음).
 *   - D34: 국내 5피드(`tz: "Asia/Seoul"`)가 이제 전부 쓸 수 있고(no-date 0), publishedAt = KST − 9시간(손계산 대조 포함).
 *     tz를 빼면 다시 전부 no-date(시간대 없는 날짜를 추측하는 다른 경로가 없다).
 *   - 공통 형식 zod 실패는 그 항목만 `schema` 사유로 건너뛰고 집계·로그(값 없이 경로·코드만), 다른 소스는 계속.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FEED_ITEM_KEYS,
  FEED_ITEM_SUMMARY_MAX,
  FEED_ITEM_TITLE_MAX,
  FeedItemSchema,
  SourcesFileSchema,
  type FeedItem,
  type Source,
} from "@/lib/schema";

import {
  collectFeedSources,
  prepareSourceItems,
} from "../scripts/lib/feed-collect";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import {
  normalizeFeedItem,
  normalizeFeedItems,
} from "../scripts/lib/normalize";
import { parseFeedXml, type FetchLike } from "../scripts/lib/rss";
import { planDailySources } from "../scripts/lib/sources";

import { issuePaths } from "./schema/helpers";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const SOURCES: Source[] = SourcesFileSchema.parse(
  JSON.parse(read("configs/sources.json")),
);
const FEEDS = planDailySources(SOURCES).feeds;
const byId = (id: string): Source => {
  const source = FEEDS.find((s) => s.id === id);
  if (!source) throw new Error(`수집 대상에 없는 소스: ${id}`);
  return source;
};
const xmlOf = (id: string) => read(`fixtures/rss/${id}.xml`);

const KOREAN_FEEDS = [
  "interfootball-world",
  "interfootball-all",
  "footballist-football",
  "besteleven-world",
  "besteleven-all",
];

const RSS_INDEX = JSON.parse(read("fixtures/rss/index.json")) as {
  sources: Array<{
    id: string;
    items: Array<{ title: string; link: string; pubDate: string }>;
  }>;
};
const indexItems = (id: string) => {
  const entry = RSS_INDEX.sources.find((s) => s.id === id);
  if (!entry) throw new Error(`fixtures/rss/index.json에 없는 소스: ${id}`);
  return entry.items;
};

const SORTED_KEYS = [...FEED_ITEM_KEYS].sort();

/** 유효한 공통 형식 1건(스키마 단위 테스트의 기준값) */
const VALID: FeedItem = {
  title: "‘친정팀’ 맨시티에 단호하게 선그은 아르테타",
  url: "https://www.interfootball.co.kr/news/articleView.html?idxno=696174",
  publishedAt: "2026-10-11T04:55:17.000Z",
  summary: null,
  source: "interfootball-world",
  author: "전준모",
  authors: ["전준모"],
  lang: "ko",
};

async function normalizedFixture(source: Source) {
  return prepareSourceItems(await parseFeedXml(xmlOf(source.id)), source);
}

// ─── 공통 형식 키 (FR-03) ───────────────────────────────────────────────

describe("FEED_ITEM_KEYS — FR-03 공통 형식 + 내부 필드 authors", () => {
  it("title·url·publishedAt·summary·source·author·lang + authors(M1-04)", () => {
    expect(SORTED_KEYS).toEqual(
      [
        "title",
        "url",
        "publishedAt",
        "summary",
        "source",
        "author",
        "lang",
        "authors",
      ].sort(),
    );
  });
});

// ─── FR-02 본문 필드 없음: 실제 fixture 14개 ─────────────────────────────

describe("FR-02 — 실제 수집 대상 14개 피드의 정규화 결과에 본문 필드가 없다", () => {
  it("수집 대상은 fixture 14개", () => {
    expect(FEEDS.map((s) => s.id).sort()).toEqual(
      RSS_INDEX.sources.map((s) => s.id).sort(),
    );
    expect(FEEDS).toHaveLength(14);
  });

  it.each(FEEDS.map((s) => [s.id] as const))(
    "%s: 모든 항목의 키 집합 = 공통 형식 키, FeedItemSchema 통과, summary null",
    async (id) => {
      const { items, skipped } = await normalizedFixture(byId(id));
      expect(items.length).toBe(indexItems(id).length);
      expect(skipped).toEqual({});
      for (const item of items) {
        expect(Object.keys(item).sort()).toEqual(SORTED_KEYS);
        expect(FeedItemSchema.safeParse(item).success).toBe(true);
        expect(item.summary).toBeNull();
        expect(item.source).toBe(id);
      }
    },
  );

  it("본문·요약·이미지가 든 합성 피드도 결과에 그 키·텍스트가 없다(파서 + strict 스키마 이중 차단)", async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel><title>t</title><image><url>https://example.com/logo.png</url></image>
        <item><title>Title</title><link>https://example.com/a</link><pubDate>2026-10-11 13:55:17</pubDate>
          <description>요약문 SUMMARY-TEXT</description>
          <content:encoded><![CDATA[<p>본문 BODY-TEXT</p>]]></content:encoded>
          <enclosure url="https://example.com/a.jpg" type="image/jpeg" length="1"/>
          <media:content url="https://example.com/m.jpg" medium="image"/>
          <media:thumbnail url="https://example.com/t.jpg"/>
          <dc:creator>Reporter</dc:creator></item>
      </channel></rss>`;
    const { items } = prepareSourceItems(await parseFeedXml(xml), {
      id: "sample-ko",
      lang: "ko",
      tz: "Asia/Seoul",
    });
    expect(items).toEqual([
      {
        title: "Title",
        url: "https://example.com/a",
        publishedAt: "2026-10-11T04:55:17.000Z",
        summary: null,
        source: "sample-ko",
        author: "Reporter",
        authors: ["Reporter"],
        lang: "ko",
      },
    ]);
    expect(JSON.stringify(items)).not.toMatch(
      /SUMMARY-TEXT|BODY-TEXT|요약문|본문|\.jpg|\.png/,
    );
  });
});

// ─── FeedItemSchema 단위 ────────────────────────────────────────────────

describe("FeedItemSchema — strictObject(본문 필드 불가)·필드 형식", () => {
  it("기준값은 통과하고 값이 바뀌지 않는다(변환 없음)", () => {
    expect(FeedItemSchema.parse(VALID)).toEqual(VALID);
  });

  it.each([
    "content",
    "content:encoded",
    "contentSnippet",
    "description",
    "body",
    "text",
    "html",
    "enclosure",
    "image",
    "imageUrl",
    "media:content",
    "media:thumbnail",
    "og:description",
    "ogImage",
    "isoDate",
    "link", // 공통 형식은 url — 이름이 다른 중복 필드도 막는다
  ])("모르는 키 %j는 거부한다(unrecognized_keys)", (key) => {
    const input = { ...VALID, [key]: "x" };
    expect(issuePaths(FeedItemSchema, input)).toEqual([""]);
    expect(FeedItemSchema.safeParse(input).error?.issues[0]?.code).toBe(
      "unrecognized_keys",
    );
  });

  it.each(FEED_ITEM_KEYS.map((key) => [key] as const))(
    "필수 키 %s가 빠지면 실패한다(summary·author도 null로 명시)",
    (key) => {
      const input: Record<string, unknown> = { ...VALID };
      delete input[key];
      expect(FeedItemSchema.safeParse(input).success).toBe(false);
    },
  );

  it(`title: 1~${FEED_ITEM_TITLE_MAX}자, 앞뒤 공백 없음`, () => {
    const at = "가".repeat(FEED_ITEM_TITLE_MAX);
    expect(FeedItemSchema.safeParse({ ...VALID, title: at }).success).toBe(
      true,
    );
    expect(issuePaths(FeedItemSchema, { ...VALID, title: `${at}가` })).toEqual([
      "title",
    ]);
    expect(issuePaths(FeedItemSchema, { ...VALID, title: "" })).toContain(
      "title",
    );
    expect(issuePaths(FeedItemSchema, { ...VALID, title: " T" })).toEqual([
      "title",
    ]);
  });

  it("url: http/https만, idxno 쿼리·http:// 원문 그대로", () => {
    for (const url of [
      "http://www.footballist.co.kr/news/articleView.html?idxno=123",
      "https://www.bbc.co.uk/sport/x?at_medium=RSS&at_campaign=rss",
    ]) {
      expect(FeedItemSchema.parse({ ...VALID, url }).url).toBe(url);
    }
    expect(
      issuePaths(FeedItemSchema, { ...VALID, url: "javascript:alert(1)" }),
    ).toEqual(["url"]);
  });

  it("publishedAt: UTC ISO(Z)만 — 오프셋·시간대 없는 값 거부", () => {
    for (const publishedAt of [
      "2026-10-11T13:55:17+09:00",
      "2026-10-11 13:55:17",
      "2026-10-11T13:55:17",
    ]) {
      expect(issuePaths(FeedItemSchema, { ...VALID, publishedAt })).toEqual([
        "publishedAt",
      ]);
    }
  });

  it(`summary: null 또는 ${FEED_ITEM_SUMMARY_MAX}자 이하 문자열(자리만 — M1-09는 항상 null)`, () => {
    expect(
      FeedItemSchema.safeParse({
        ...VALID,
        summary: "a".repeat(FEED_ITEM_SUMMARY_MAX),
      }).success,
    ).toBe(true);
    expect(
      issuePaths(FeedItemSchema, {
        ...VALID,
        summary: "a".repeat(FEED_ITEM_SUMMARY_MAX + 1),
      }),
    ).toEqual(["summary"]);
  });

  it("source는 소스 id(slug), lang은 빈 문자열 불가", () => {
    expect(
      issuePaths(FeedItemSchema, { ...VALID, source: "Inter Football" }),
    ).toEqual(["source"]);
    expect(issuePaths(FeedItemSchema, { ...VALID, lang: "" })).toEqual([
      "lang",
    ]);
  });

  it('author = authors를 ", "로 이은 값(없으면 null) — 어긋나면 실패', () => {
    expect(
      FeedItemSchema.safeParse({
        ...VALID,
        author: "Ann Writer, Bob Writer",
        authors: ["Ann Writer", "Bob Writer"],
      }).success,
    ).toBe(true);
    expect(
      FeedItemSchema.safeParse({ ...VALID, author: null, authors: [] }).success,
    ).toBe(true);
    expect(issuePaths(FeedItemSchema, { ...VALID, author: null })).toEqual([
      "author",
    ]);
    expect(
      issuePaths(FeedItemSchema, { ...VALID, author: "Someone Else" }),
    ).toEqual(["author"]);
    expect(
      issuePaths(FeedItemSchema, { ...VALID, authors: [" 전준모"] }),
    ).toEqual(expect.arrayContaining(["authors.0"]));
  });
});

// ─── D34: 국내 5피드 시간대 ─────────────────────────────────────────────

describe("국내 5피드 — tz Asia/Seoul로 시간대 없는 pubDate를 UTC로 (D34)", () => {
  it("configs: 국내 5피드에만 tz Asia/Seoul", () => {
    expect(
      SOURCES.filter((s) => s.tz !== undefined).map((s) => [s.id, s.tz]),
    ).toEqual(KOREAN_FEEDS.map((id) => [id, "Asia/Seoul"]));
  });

  it.each(KOREAN_FEEDS.map((id) => [id] as const))(
    "%s: usable > 0(no-date 0), publishedAt = pubDate(KST)에서 9시간 뺀 UTC",
    async (id) => {
      const { items, skipped } = await normalizedFixture(byId(id));
      const raw = indexItems(id);
      expect(items.length).toBeGreaterThan(0);
      expect(items).toHaveLength(raw.length);
      expect(skipped).toEqual({});
      items.forEach((item, i) => {
        // 독립 계산: 원문 "YYYY-MM-DD HH:mm:ss" + 명시 오프셋 +09:00 → Date
        const expected = new Date(
          `${raw[i]!.pubDate.replace(" ", "T")}+09:00`,
        ).toISOString();
        expect(item.publishedAt).toBe(expected);
        expect(item.url).toBe(raw[i]!.link); // 링크 원문(idxno 쿼리 보존)
      });
    },
  );

  it("손계산 대조 — 인터풋볼 해외축구 첫 항목 2026-10-11 13:55:17 KST = 2026-10-11T04:55:17Z", async () => {
    const { items } = await normalizedFixture(byId("interfootball-world"));
    expect(indexItems("interfootball-world")[0]!.pubDate).toBe(
      "2026-10-11 13:55:17",
    );
    expect(items[0]).toMatchObject({
      url: "https://www.interfootball.co.kr/news/articleView.html?idxno=696174",
      publishedAt: "2026-10-11T04:55:17.000Z",
      source: "interfootball-world",
      lang: "ko",
      summary: null,
    });
  });

  it("손계산 대조 — UTC로 전날이 되는 항목: 풋볼리스트 2026-10-11 00:33:44 KST = 2026-10-10T15:33:44Z", async () => {
    const { items } = await normalizedFixture(byId("footballist-football"));
    const raw = indexItems("footballist-football");
    const i = raw.findIndex((x) => x.pubDate === "2026-10-11 00:33:44");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(items[i]!.publishedAt).toBe("2026-10-10T15:33:44.000Z");
  });

  it.each(KOREAN_FEEDS.map((id) => [id] as const))(
    "%s: tz를 빼면 전부 no-date(시간대 없는 날짜를 추측하는 다른 경로가 없다)",
    async (id) => {
      const withoutTz: Source = { ...byId(id) };
      delete withoutTz.tz;
      const { items, skipped } = await normalizedFixture(withoutTz);
      expect(items).toEqual([]);
      expect(skipped).toEqual({ "no-date": indexItems(id).length });
    },
  );

  it("해외 피드에 tz를 줘도 시간대가 적힌 날짜는 그대로(BBC GMT·Di Marzio +0200·ESPN EST)", async () => {
    for (const id of ["bbc-sport-football", "di-marzio", "espn-soccer"]) {
      const base = await normalizedFixture(byId(id));
      const withTz = await normalizedFixture({ ...byId(id), tz: "Asia/Seoul" });
      expect(withTz.items).toEqual(base.items);
    }
  });
});

// ─── 스키마 실패 격리 ───────────────────────────────────────────────────

describe("공통 형식 zod 실패 — 그 항목만 schema 사유로 건너뛰고 나머지는 계속", () => {
  const raw = (
    over: Partial<Parameters<typeof normalizeFeedItem>[0]> = {},
  ) => ({
    title: "Title",
    link: "https://example.com/a",
    pubDate: "Sat, 10 Oct 2026 19:24:23 GMT",
    authors: [],
    ...over,
  });

  it("앞 규칙을 통과했는데 스키마에서 걸리면 reason schema + 이슈 경로·코드(값 없음)", () => {
    const result = normalizeFeedItem(raw(), { id: "sample", lang: "" });
    expect(result).toEqual({
      ok: false,
      reason: "schema",
      issues: ["lang:too_small"],
    });
  });

  it("normalizeFeedItems: 이유별 집계 + schemaIssues(중복 없음)", () => {
    const result = normalizeFeedItems(
      [raw(), raw({ pubDate: null }), raw({ link: "https://example.com/b" })],
      { id: "Bad Id", lang: "en" },
    );
    expect(result.items).toEqual([]);
    expect(result.skipped).toEqual({ schema: 2, "no-date": 1 });
    expect(result.schemaIssues).toEqual(["source:invalid_format"]);
  });

  it("collectFeedSources: 스키마 실패 소스는 skipped.schema + warn 로그(경로·코드만), 다른 소스는 그대로 수집", async () => {
    const records: LogRecord[] = [];
    const logger = createLogger({
      scope: "collect",
      format: "json",
      sink: (_line, record) => records.push(record),
    });
    const good = {
      ...byId("bbc-sport-football"),
      url: "https://a.example.com/rss",
    };
    const bad = {
      ...byId("di-marzio"),
      url: "https://b.example.com/rss",
      lang: "",
    };
    const xmlByUrl = new Map([
      [good.url, xmlOf("bbc-sport-football")],
      [bad.url, xmlOf("di-marzio")],
    ]);
    const fetch: FetchLike = (url) =>
      Promise.resolve(new Response(xmlByUrl.get(url) ?? "", { status: 200 }));
    const result = await collectFeedSources([good, bad], {
      fetch,
      userAgent: "UA/1",
      logger,
    });
    const [goodOutcome, badOutcome] = result.outcomes;
    expect(goodOutcome).toMatchObject({ ok: true, skipped: {} });
    expect(goodOutcome!.usable).toBeGreaterThan(0);
    expect(badOutcome).toMatchObject({
      ok: true,
      items: 4,
      usable: 0,
      skipped: { schema: 4 },
    });
    expect(result.items.every((i) => i.source === good.id)).toBe(true);
    const skip = records.find(
      (r) => r.event === "collect.item.skip" && r.reason === "schema",
    );
    expect(skip).toMatchObject({
      level: "warn",
      source: "di-marzio",
      count: 4,
      issues: ["lang:too_small"],
    });
    // 로그에 원제목·링크를 남기지 않는다
    const firstTitle = indexItems("di-marzio")[0]!.title;
    expect(JSON.stringify(records)).not.toContain(firstTitle);
  });

  it("collectFeedSources: tz 없는 국내 피드는 no-date warn 로그(tz: null)로 원인을 남긴다", async () => {
    const records: LogRecord[] = [];
    const logger = createLogger({
      scope: "collect",
      format: "json",
      sink: (_line, record) => records.push(record),
    });
    const source: Source = { ...byId("besteleven-world") };
    delete source.tz;
    const fetch: FetchLike = () =>
      Promise.resolve(new Response(xmlOf("besteleven-world"), { status: 200 }));
    const result = await collectFeedSources([source], {
      fetch,
      userAgent: "UA/1",
      logger,
    });
    expect(result.outcomes[0]).toMatchObject({
      ok: true,
      usable: 0,
      skipped: { "no-date": 5 },
    });
    expect(
      records.find(
        (r) => r.event === "collect.item.skip" && r.reason === "no-date",
      ),
    ).toMatchObject({
      level: "warn",
      source: "besteleven-world",
      count: 5,
      kept: 0,
      tz: null,
    });
  });

  it("소스 tz가 IANA 이름이 아니면(스키마 우회) 그 소스만 unexpected 실패 — 다른 소스는 계속", async () => {
    const logger = createLogger({
      scope: "collect",
      format: "json",
      sink: () => undefined,
    });
    const broken = {
      ...byId("interfootball-world"),
      url: "https://a.example.com/rss",
      tz: "KST",
    };
    const ok = {
      ...byId("besteleven-world"),
      url: "https://b.example.com/rss",
    };
    const xmlByUrl = new Map([
      [broken.url, xmlOf("interfootball-world")],
      [ok.url, xmlOf("besteleven-world")],
    ]);
    const fetch: FetchLike = (url) =>
      Promise.resolve(new Response(xmlByUrl.get(url) ?? "", { status: 200 }));
    const result = await collectFeedSources([broken, ok], {
      fetch,
      userAgent: "UA/1",
      logger,
    });
    expect(
      result.outcomes.map((o) => [o.id, o.ok, o.errorType ?? null]),
    ).toEqual([
      ["interfootball-world", false, "unexpected"],
      ["besteleven-world", true, null],
    ]);
    expect(result.items).toHaveLength(5);
  });
});
