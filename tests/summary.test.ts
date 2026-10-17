/**
 * M1-17 — RSS 요약문(description) 읽기 (PRD §15 D39 ① — 메모리 안 코드 분류 입력 전용, FR-02·FR-03).
 *
 *   - 파서(rss.ts): RSS `description`(CDATA HTML·인라인 HTML 요소·엔티티) → `summary` 원문, 없으면 Atom `summary`.
 *     본문(`content:encoded`·Atom `content`)은 읽지 않는다.
 *   - 정리(normalize.ts `cleanSummary`): 태그 제거·엔티티·제어 문자·공백 → 500자(JS 문자열 길이, 서로게이트 쌍은 자르지 않음), 빈 값 null
 *   - 공통 형식(FeedItemSchema)을 통과하고, 카드(buildCard)에는 들어가지 않는다
 *   - 위험 수용 소스(D48 — the Daily Briefing·Di Marzio·Relevo)는 요약문을 읽지 않는다(파서·정규화 이중 차단)
 * 요약문은 합성 문자열이다(공개 저장소 fixtures에는 넣지 않는다 — D25·D39). data/·로그에 없음은 tests/collect-classify.test.ts.
 */
import { describe, expect, it } from "vitest";

import { FEED_ITEM_SUMMARY_MAX, FeedItemSchema } from "@/lib/schema";

import { prepareSourceItems } from "../scripts/lib/feed-collect";
import { buildCard } from "../scripts/lib/news-file";
import { cleanSummary } from "../scripts/lib/normalize";
import { parseFeedXml } from "../scripts/lib/rss";
import {
  SUMMARY_UNREAD_SOURCE_IDS,
  readsSummary,
} from "../scripts/lib/source-policy";

import { fixtureFeedSources } from "./support/fixture-sources";

const BBC = fixtureFeedSources().find((s) => s.id === "bbc-sport-football")!;

describe("cleanSummary", () => {
  it("HTML 태그 제거·엔티티(이중 인코딩 포함)·제어 문자·공백 정리", () => {
    expect(
      cleanSummary(
        "<p>Arsenal &amp;amp; Chelsea&nbsp;drew</p>\n\t<img src='x.jpg'/>1-1\u0007",
      ),
    ).toBe("Arsenal & Chelsea drew 1-1");
    expect(cleanSummary("&lt;b&gt;굵게&lt;/b&gt; 요약")).toBe("굵게 요약");
  });

  it("빈 값·태그만 있는 값·null은 null", () => {
    expect(cleanSummary(null)).toBeNull();
    expect(cleanSummary(undefined)).toBeNull();
    expect(cleanSummary("  <br/> ")).toBeNull();
  });

  it(`${FEED_ITEM_SUMMARY_MAX}자(JS 문자열 길이)에서 자르고, 서로게이트 쌍 가운데서 자르지 않는다`, () => {
    const long = "가".repeat(FEED_ITEM_SUMMARY_MAX + 100);
    expect(cleanSummary(long)).toHaveLength(FEED_ITEM_SUMMARY_MAX);
    const emoji = `${"a".repeat(FEED_ITEM_SUMMARY_MAX - 1)}😀tail`;
    const cut = cleanSummary(emoji)!;
    expect(cut.length).toBeLessThanOrEqual(FEED_ITEM_SUMMARY_MAX);
    expect(/[\uD800-\uDBFF]$/u.test(cut)).toBe(false);
  });
});

describe("parseFeedXml — 요약문 원문(본문은 읽지 않는다)", () => {
  it("RSS description: CDATA HTML·엔티티·인라인 HTML 요소(xml2js 객체)도 글자로", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>t</title>
      <item><title>A</title><link>https://e.com/a</link><description><![CDATA[<p>Hello <b>World</b></p>]]></description><content:encoded><![CDATA[<p>BODY-A</p>]]></content:encoded></item>
      <item><title>B</title><link>https://e.com/b</link><description>Plain &amp; text</description></item>
      <item><title>C</title><link>https://e.com/c</link><description><p>inline <b>html</b></p></description></item>
      <item><title>D</title><link>https://e.com/d</link><content:encoded><![CDATA[<p>BODY-D</p>]]></content:encoded></item>
      <item><title>E</title><link>https://e.com/e</link><description>MIXED-HEAD <b>bold child</b> MIXED-TAIL <a href="https://e.com/x">link child</a></description></item>
      </channel></rss>`;
    const items = await parseFeedXml(xml);
    expect(items.map((i) => i.summary)).toEqual([
      "<p>Hello <b>World</b></p>",
      "Plain & text",
      expect.stringContaining("inline"),
      null,
      expect.any(String),
    ]);
    // CDATA 없이 HTML 요소가 섞인 요약문 — 자식 요소 글자도 남는다(M1-17 재리뷰: rss-parser가 `_`만 남겨 'bold child'가 빠졌다).
    // 분류 입력이라 순서는 보지 않는다. 속성(href)은 글자가 아니다
    const [c, e] = [items[2]!.summary!, items[4]!.summary!];
    expect(c).toContain("html");
    for (const part of [
      "MIXED-HEAD",
      "MIXED-TAIL",
      "bold child",
      "link child",
    ]) {
      expect(e).toContain(part);
    }
    expect(e).not.toContain("https://e.com/x");
    expect(JSON.stringify(items)).not.toMatch(/BODY-A|BODY-D/);
  });

  it("Atom: summary는 읽고 content(본문)는 읽지 않는다", async () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>t</title>
      <entry><title>E</title><link href="https://e.com/e"/><id>1</id><updated>2026-10-10T00:00:00Z</updated>
        <summary type="html">&lt;p&gt;Short summary&lt;/p&gt;</summary><content type="html">ATOM-BODY</content></entry>
      <entry><title>F</title><link href="https://e.com/f"/><id>2</id><updated>2026-10-10T00:00:00Z</updated>
        <content type="html">ATOM-BODY-ONLY</content></entry></feed>`;
    const items = await parseFeedXml(xml);
    expect(items.map((i) => i.summary)).toEqual(["<p>Short summary</p>", null]);
    expect(JSON.stringify(items)).not.toMatch(/ATOM-BODY/);
  });
});

describe("정규화 → 공통 형식 → 카드", () => {
  it("요약문은 FeedItem.summary(정리 뒤)로 남고 FeedItemSchema를 통과한다 — 카드에는 들어가지 않는다", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
      <item><title>Arsenal news</title><link>https://www.bbc.co.uk/sport/football/articles/c0sum01o</link><pubDate>Sat, 10 Oct 2026 19:24:23 GMT</pubDate>
      <description><![CDATA[<p>SYNTH-SUMMARY Arsenal beat Chelsea 2-1</p>]]></description></item></channel></rss>`;
    const { items } = prepareSourceItems(await parseFeedXml(xml), BBC);
    expect(items).toHaveLength(1);
    expect(items[0]!.summary).toBe("SYNTH-SUMMARY Arsenal beat Chelsea 2-1");
    expect(FeedItemSchema.safeParse(items[0]).success).toBe(true);
    const card = buildCard(items[0]!, BBC, "2026-10-10T21:30:00.000Z");
    expect(JSON.stringify(card)).not.toContain("SYNTH-SUMMARY");
    expect(card.s).toEqual([]);
  });
});

describe("D48 — 위험 수용 소스(the Daily Briefing·Di Marzio·Relevo)는 요약문을 읽지 않는다", () => {
  const XML = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
      <item><title>Napoli news</title><link>https://www.gianlucadimarzio.com/a</link><pubDate>Sat, 10 Oct 2026 19:24:23 GMT</pubDate>
      <description>D48-SUMMARY gol e vittoria del Napoli</description></item></channel></rss>`;

  it("source-policy: 세 소스만 요약문을 읽지 않는다(sources.json note의 'description 읽지 않음' 조건)", () => {
    expect([...SUMMARY_UNREAD_SOURCE_IDS].sort()).toEqual([
      "daily-briefing",
      "di-marzio",
      "relevo",
    ]);
    expect(readsSummary("di-marzio")).toBe(false);
    expect(readsSummary("bbc-sport-football")).toBe(true);
    expect(readsSummary("interfootball-world")).toBe(true);
  });

  it("파서 `summaries: false`는 요약문을 꺼내지 않고, 정규화도 그 소스의 summary를 null로 둔다(이중 차단)", async () => {
    const off = await parseFeedXml(XML, { summaries: false });
    expect(off.map((i) => i.summary)).toEqual([null]);
    // 파서가 꺼냈더라도 정규화가 막는다
    const on = await parseFeedXml(XML);
    expect(on[0]!.summary).toContain("D48-SUMMARY");
    for (const id of ["daily-briefing", "di-marzio", "relevo"]) {
      const source = fixtureFeedSources().find((s) => s.id === id)!;
      const { items } = prepareSourceItems(on, source);
      expect(items[0]!.summary, id).toBeNull();
    }
    const { items } = prepareSourceItems(on, BBC);
    expect(items[0]!.summary).toBe("D48-SUMMARY gol e vittoria del Napoli");
  });
});
