/**
 * M1-04 — 기자 채널 작성자 필드·작성자 필터 (scripts/lib/rss.ts 파싱 · normalize.ts 정리 · author-filter.ts 필터 ·
 * feed-collect.ts 연결). 네트워크 없음 — fixtures/rss/*.xml과 짧은 합성 XML, fetch 주입.
 *
 * 고정하는 것
 *   - 피드별 작성자 필드 실측 형태(fixtures/rss, 2026-10-11 수집): the Daily Briefing(Substack)은 `dc:creator` CDATA 1개
 *     ('the Daily Briefing'·'Mark Brus'), Di Marzio는 작성자 요소 없음, Relevo·ESPN `dc:creator`, 국내 3사 RSS `author`
 *     ('임정훈 기자'처럼 "기자" 접미사), BBC·The Athletic 없음.
 *   - RSS 2.0 `author` · `dc:creator`(여러 개) · Atom `author/name`(여러 개)을 모두 담는다.
 *   - 필터: 대소문자·앞뒤 공백·NFC·연속 공백 무시, 작성자 없는 항목 제외, author 없는 소스는 전부 통과, 제외 건수 = skipped.author.
 *   - 원제목 무수정: 제목 앞 이모지(🚨)는 그대로.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SourcesFileSchema, type Source } from "@/lib/schema";

import {
  authorCandidateKeys,
  authorKey,
  filterByAuthor,
  matchesAuthor,
} from "../scripts/lib/author-filter";
import {
  collectFeedSources,
  prepareSourceItems,
} from "../scripts/lib/feed-collect";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { cleanAuthors, normalizeFeedItem } from "../scripts/lib/normalize";
import { parseFeedXml, type FetchLike } from "../scripts/lib/rss";
import { planDailySources } from "../scripts/lib/sources";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const SOURCES: Source[] = SourcesFileSchema.parse(
  JSON.parse(read("configs/sources.json")),
);
const FEEDS = planDailySources(SOURCES).feeds;
const byId = (id: string) => {
  const source = FEEDS.find((s) => s.id === id);
  if (!source) throw new Error(`수집 대상에 없는 소스: ${id}`);
  return source;
};
const DAILY_BRIEFING = byId("daily-briefing");
const DI_MARZIO = byId("di-marzio");
const DAILY_BRIEFING_XML = read("fixtures/rss/daily-briefing.xml");
const DI_MARZIO_XML = read("fixtures/rss/di-marzio.xml");

/** 합성 RSS 2.0 — 항목 XML 조각을 받는다 */
const rss = (items: string) =>
  `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>t</title>${items}</channel></rss>`;
const rssItem = (extra: string, n = 1) =>
  `<item><title>T${n}</title><link>https://example.com/${n}</link><pubDate>Sat, 10 Oct 2026 19:24:23 GMT</pubDate>${extra}</item>`;

// ─── 파싱: 피드별 작성자 필드 실측 형태 ───────────────────────────────────

describe("parseFeedXml — 작성자 필드(피드별 실측 형태)", () => {
  it("the Daily Briefing(Substack): dc:creator CDATA 1개 — 'the Daily Briefing'·'Mark Brus'", async () => {
    const items = await parseFeedXml(DAILY_BRIEFING_XML);
    expect(items.map((i) => i.authors)).toEqual([
      ["the Daily Briefing"],
      ["Mark Brus"],
      ["the Daily Briefing"],
    ]);
  });

  it("Di Marzio: 작성자 요소 없음 → 모든 항목 []", async () => {
    const items = await parseFeedXml(DI_MARZIO_XML);
    expect(items).toHaveLength(4);
    expect(items.every((i) => i.authors.length === 0)).toBe(true);
  });

  it("나머지 수집 대상 피드 — dc:creator(Relevo·ESPN) · RSS author(국내, '기자' 접미사) · 없음(BBC·The Athletic)", async () => {
    const distinct = async (id: string) => {
      const items = await parseFeedXml(read(`fixtures/rss/${id}.xml`));
      return [...new Set(items.flatMap((i) => i.authors))];
    };
    expect(await distinct("relevo")).toEqual([
      "Heath Chesters",
      "Marcos Durán",
    ]);
    expect(await distinct("espn-soccer")).toContain("ESPN News Services");
    expect(await distinct("besteleven-all")).toEqual([
      "임정훈 기자",
      "이창현 기자",
    ]);
    expect(await distinct("interfootball-world")).toContain("전준모");
    for (const id of [
      "bbc-sport-football",
      "bbc-sport-premier-league",
      "the-athletic-football",
    ]) {
      expect(await distinct(id)).toEqual([]);
    }
  });

  it("RSS 2.0 author(email (이름) 형식은 원문 그대로) · dc:creator 여러 개 · 둘 다 있으면 dc:creator → author 순서", async () => {
    const items = await parseFeedXml(
      rss(
        rssItem("<author>reporter@example.com (Jane Doe)</author>", 1) +
          rssItem(
            "<dc:creator>Mark Brus</dc:creator><dc:creator><![CDATA[Fabrizio Romano]]></dc:creator>",
            2,
          ) +
          rssItem(
            "<author>john@example.com (John Roe)</author><dc:creator>John Roe</dc:creator>",
            3,
          ),
      ),
    );
    expect(items.map((i) => i.authors)).toEqual([
      ["reporter@example.com (Jane Doe)"],
      ["Mark Brus", "Fabrizio Romano"],
      ["John Roe", "john@example.com (John Roe)"],
    ]);
  });

  it("속성 붙은 요소·비표준 <author><name>·빈 요소", async () => {
    const items = await parseFeedXml(
      rss(
        rssItem(
          '<dc:creator xml:lang="it">Gianluca Di Marzio</dc:creator>',
          1,
        ) +
          rssItem("<author><name>Name Child</name></author>", 2) +
          rssItem("<dc:creator></dc:creator><author/>", 3),
      ),
    );
    expect(items[0]!.authors).toEqual(["Gianluca Di Marzio"]);
    expect(items[1]!.authors).toEqual(["Name Child"]);
    // 빈 요소는 파서가 빈 문자열로 줄 수 있다 — 정리는 normalize.ts(cleanAuthors)가 한다
    expect(cleanAuthors(items[2]!.authors)).toEqual([]);
  });

  it("Atom: author/name을 모두(여러 명), email은 버린다, 작성자 없는 entry는 []", async () => {
    const atom = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom"><title>a</title><id>urn:x</id><updated>2026-10-10T19:00:00Z</updated>
        <entry><title>Two authors</title><link href="https://example.com/a"/><id>urn:a</id>
          <published>2026-10-10T19:24:23Z</published>
          <author><name>Ann Writer</name><email>ann@example.com</email></author>
          <author><name>Bob Writer</name></author></entry>
        <entry><title>No author</title><link href="https://example.com/b"/><id>urn:b</id>
          <updated>2026-10-10T18:00:00Z</updated></entry>
      </feed>`;
    const items = await parseFeedXml(atom);
    expect(items.map((i) => i.authors)).toEqual([
      ["Ann Writer", "Bob Writer"],
      [],
    ]);
    expect(JSON.stringify(items)).not.toContain("ann@example.com");
  });
});

// ─── 정규화: 작성자 정리 ────────────────────────────────────────────────

describe("normalize.ts — 작성자 정리(FR-03 author?)", () => {
  const source = { id: "sample", lang: "en" };
  const raw = (authors: string[]) => ({
    title: "T",
    link: "https://example.com/a",
    pubDate: "Sat, 10 Oct 2026 19:24:23 GMT",
    authors,
  });

  it("엔티티 디코딩·앞뒤 공백 정리, 빈 값 제거, 비교 키가 같은 이름은 처음 것만(안쪽 글자는 그대로)", () => {
    expect(
      cleanAuthors([
        "  Mark Brus ",
        "",
        "   ",
        "mark  brus",
        "Tom O&#8217;Neill",
        "Gianluca Di Marzio",
      ]),
    ).toEqual(["Mark Brus", "Tom O’Neill", "Gianluca Di Marzio"]);
  });

  it('FeedItem.author는 이름들을 ", "로 이은 한 줄(없으면 null), authors는 목록', () => {
    const two = normalizeFeedItem(raw(["Ann Writer", "Bob Writer"]), source);
    expect(two.ok && [two.item.author, two.item.authors]).toEqual([
      "Ann Writer, Bob Writer",
      ["Ann Writer", "Bob Writer"],
    ]);
    const none = normalizeFeedItem(raw(["  "]), source);
    expect(none.ok && [none.item.author, none.item.authors]).toEqual([
      null,
      [],
    ]);
  });
});

// ─── 비교 규칙 ──────────────────────────────────────────────────────────

describe("author-filter.ts — 비교 규칙", () => {
  it("authorKey: NFC · 연속 공백(NBSP 포함) 한 칸 · 앞뒤 공백 제거 · 소문자", () => {
    expect(authorKey("  Mark   Brus\t")).toBe("mark brus");
    expect(authorKey("Mark Brus")).toBe("mark brus");
    expect(authorKey("MARK BRUS")).toBe("mark brus");
    // 분해형(a + 결합 악센트)과 조합형(á)은 같은 키
    expect(authorKey("Marcos Durán")).toBe(authorKey("Marcos Durán"));
    expect(authorKey("   ")).toBe("");
  });

  it("대소문자·앞뒤 공백·연속 공백·NFC가 달라도 일치", () => {
    expect(matchesAuthor(["Mark Brus"], "mark brus")).toBe(true);
    expect(matchesAuthor([" mark  BRUS "], "Mark Brus")).toBe(true);
    expect(matchesAuthor(["Marcos Durán"], "Marcos Durán")).toBe(true);
    expect(
      matchesAuthor(["the Daily Briefing", "Mark Brus"], "Mark Brus"),
    ).toBe(true);
  });

  it("그 밖의 차이는 일치로 보지 않는다 — 일부 이름·악센트 제거·'기자' 접미사·다른 사람", () => {
    expect(matchesAuthor(["Mark Brus"], "Mark")).toBe(false);
    expect(matchesAuthor(["Marcos Durán"], "Marcos Duran")).toBe(false);
    expect(matchesAuthor(["임정훈 기자"], "임정훈")).toBe(false);
    expect(matchesAuthor(["the Daily Briefing"], "Mark Brus")).toBe(false);
  });

  it("작성자 없음·빈 필터 이름은 일치하지 않는다", () => {
    expect(matchesAuthor([], "Mark Brus")).toBe(false);
    expect(matchesAuthor([""], "Mark Brus")).toBe(false);
    expect(matchesAuthor(["Mark Brus"], "")).toBe(false);
    expect(matchesAuthor(["Mark Brus"], "   ")).toBe(false);
  });

  it("한 문자열 안 여러 이름(and·,·&·;·/)과 RSS 2.0 'email (이름)' 형식의 이름도 비교한다", () => {
    expect(
      matchesAuthor(["Mark Brus and Fabrizio Romano"], "Fabrizio Romano"),
    ).toBe(true);
    expect(matchesAuthor(["Ann Writer, Bob Writer"], "Bob Writer")).toBe(true);
    expect(matchesAuthor(["Ann Writer & Bob Writer"], "ann writer")).toBe(true);
    expect(matchesAuthor(["A One; B Two / C Three"], "C Three")).toBe(true);
    expect(
      matchesAuthor(
        ["romano@example.com (Fabrizio Romano)"],
        "Fabrizio Romano",
      ),
    ).toBe(true);
    // 문자열 전체도 비교한다(이름에 구분자가 들어간 채널명)
    expect(matchesAuthor(["Smith & Jones"], "smith & jones")).toBe(true);
  });

  it("단어 안의 'and'로는 나누지 않는다", () => {
    expect(authorCandidateKeys("Alexandre Anderson")).toEqual([
      "alexandre anderson",
    ]);
    expect(matchesAuthor(["Alexandre Anderson"], "Alex")).toBe(false);
  });
});

describe("filterByAuthor — author 없으면 전부 통과, 있으면 일치 항목만(작성자 없는 항목 제외)", () => {
  const items = [
    { id: 1, authors: ["Mark Brus"] },
    { id: 2, authors: [] },
    { id: 3, authors: ["the Daily Briefing"] },
    { id: 4, authors: ["MARK BRUS"] },
  ];

  it("wanted undefined → 전부 통과(작성자 없는 항목 포함), excluded 0", () => {
    expect(filterByAuthor(items, undefined)).toEqual({
      kept: items,
      excluded: 0,
    });
  });

  it("wanted 있음 → 일치 항목만, 순서 유지", () => {
    const result = filterByAuthor(items, "Mark Brus");
    expect(result.kept.map((i) => i.id)).toEqual([1, 4]);
    expect(result.excluded).toBe(2);
  });

  it("wanted가 빈 문자열이면 전부 제외(validate가 경고한다)", () => {
    expect(filterByAuthor(items, " ")).toEqual({ kept: [], excluded: 4 });
  });

  it("빈 입력", () => {
    expect(filterByAuthor([], "Mark Brus")).toEqual({ kept: [], excluded: 0 });
  });
});

// ─── 정규화 직후 필터: fixtures ─────────────────────────────────────────

describe("prepareSourceItems — 정규화 → 작성자 필터 (fixtures/rss)", () => {
  it("실제 설정의 the Daily Briefing·Di Marzio는 author가 없어 전부 통과한다(현재 필터 대상 없음)", async () => {
    expect(DAILY_BRIEFING.author).toBeUndefined();
    expect(DI_MARZIO.author).toBeUndefined();
    const db = prepareSourceItems(
      await parseFeedXml(DAILY_BRIEFING_XML),
      DAILY_BRIEFING,
    );
    expect(db.items).toHaveLength(3);
    expect(db.skipped).toEqual({});
    const dm = prepareSourceItems(await parseFeedXml(DI_MARZIO_XML), DI_MARZIO);
    expect(dm.items).toHaveLength(4);
    expect(dm.skipped).toEqual({});
  });

  it("가짜 소스에 author: 'Mark Brus' → 그 항목만 남고 나머지 2건은 skipped.author", async () => {
    const source = { ...DAILY_BRIEFING, author: "Mark Brus" };
    const { items, skipped } = prepareSourceItems(
      await parseFeedXml(DAILY_BRIEFING_XML),
      source,
    );
    expect(items.map((i) => i.url)).toEqual([
      "https://thedailybriefing.io/p/florian-wirtz-transfer-bayern-barcelona-real-madrid",
    ]);
    expect(items[0]!.authors).toEqual(["Mark Brus"]);
    expect(skipped).toEqual({ author: 2 });
  });

  it("작성자 필드가 없는 피드(Di Marzio)에 author를 주면 전부 제외", async () => {
    const { items, skipped } = prepareSourceItems(
      await parseFeedXml(DI_MARZIO_XML),
      { ...DI_MARZIO, author: "Gianluca Di Marzio" },
    );
    expect(items).toEqual([]);
    expect(skipped).toEqual({ author: 4 });
  });

  it("정규화에서 빠진 항목은 정규화 사유로만 센다(작성자 필터는 정규화를 통과한 항목에만)", async () => {
    const xml = rss(
      rssItem("<dc:creator>Mark Brus</dc:creator>", 1) +
        // 날짜 없음 → no-date (작성자가 맞아도 정규화에서 빠진다)
        `<item><title>T2</title><link>https://example.com/2</link><dc:creator>Mark Brus</dc:creator></item>` +
        rssItem("<dc:creator>Someone Else</dc:creator>", 3),
    );
    const { items, skipped } = prepareSourceItems(await parseFeedXml(xml), {
      id: "sample",
      lang: "en",
      author: "Mark Brus",
    });
    expect(items.map((i) => i.url)).toEqual(["https://example.com/1"]);
    expect(skipped).toEqual({ "no-date": 1, author: 1 });
  });

  it("원제목 무수정 — 제목 앞 이모지(🚨)는 그대로, 앞뒤 공백만 정리", async () => {
    const { items } = prepareSourceItems(
      await parseFeedXml(DAILY_BRIEFING_XML),
      DAILY_BRIEFING,
    );
    expect(items.every((i) => i.title.startsWith("🚨 "))).toBe(true);
    expect(items[0]!.title).toBe(
      "🚨 Maresca on Man City charges, SHOCK Liverpool exit, update on Kane’s Bayern future, Arsenal eye €60m star, Man Utd injury crisis, & more",
    );
    // 끝 공백이 있던 원제목은 앞뒤 공백만 정리
    expect(items[2]!.title.endsWith("& more.")).toBe(true);
  });
});

// ─── 수집 실행기 연결 ───────────────────────────────────────────────────

describe("collectFeedSources — 작성자 필터 결과·로그", () => {
  const FEED_URL = "https://feeds.example.com/journalist.xml";

  function run(source: Source) {
    const records: LogRecord[] = [];
    const logger = createLogger({
      scope: "collect",
      format: "json",
      sink: (_line, record) => records.push(record),
    });
    const fetch: FetchLike = () =>
      Promise.resolve(new Response(DAILY_BRIEFING_XML, { status: 200 }));
    return collectFeedSources([{ ...source, url: FEED_URL }], {
      fetch,
      userAgent: "UA/1",
      logger,
    }).then((result) => ({ result, records }));
  }

  it("author 일치 항목만 items로, 제외 건수는 outcome.skipped.author와 collect.item.skip(info) 로그", async () => {
    const { result, records } = await run({
      ...DAILY_BRIEFING,
      author: "mark brus",
    });
    const [outcome] = result.outcomes;
    expect(outcome).toMatchObject({
      ok: true,
      items: 3,
      usable: 1,
      skipped: { author: 2 },
    });
    expect(result.items.map((i) => i.authors)).toEqual([["Mark Brus"]]);
    const skip = records.filter(
      (r) => r.event === "collect.item.skip" && r.reason === "author",
    );
    expect(skip).toHaveLength(1);
    expect(skip[0]).toMatchObject({
      level: "info",
      source: "daily-briefing",
      count: 2,
      kept: 1,
      author: "mark brus",
    });
    expect(
      records.find((r) => r.event === "collect.source.fetch"),
    ).toMatchObject({ usable: 1, skipped: { author: 2 } });
  });

  it("전부 제외되면 warn(피드 작성자 표기가 바뀌었을 수 있다)", async () => {
    const { result, records } = await run({
      ...DAILY_BRIEFING,
      author: "Fabrizio Romano",
    });
    expect(result.outcomes[0]).toMatchObject({
      ok: true,
      usable: 0,
      skipped: { author: 3 },
    });
    expect(
      records.find(
        (r) => r.event === "collect.item.skip" && r.reason === "author",
      ),
    ).toMatchObject({ level: "warn", count: 3, kept: 0 });
  });

  it("author 없는 소스는 전부 통과하고 author 로그가 없다", async () => {
    const { result, records } = await run(DAILY_BRIEFING);
    expect(result.outcomes[0]).toMatchObject({ usable: 3, skipped: {} });
    expect(
      records.some(
        (r) => r.event === "collect.item.skip" && r.reason === "author",
      ),
    ).toBe(false);
  });
});
