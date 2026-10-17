/**
 * M1-15 — 카드 생성 경로 (PRD FR-20, D23): 원제목+링크 카드의 제목 정리 경계 · 200자 판정 · 사건 대표 선정 · 출처 순서 ·
 * `ai:false`/`s:[]` 불변식 · 같은 날 재실행 병합.
 *
 *   ① 제목 정리(normalize.ts `cleanTitle`) — D23 '무수정'의 경계(보이는 글자 불변 — 사용자 확정 2026-10-16): 엔티티 디코딩
 *      (이중 인코딩 포함, 최대 3회 — 여분 3겹까지 멱등, 숫자 0x80~0x9F는 HTML5 Windows-1252 대응표) · 줄바꿈·탭 구간 → 공백 1칸 ·
 *      제어 문자 제거 · 앞뒤 공백 정리만. 안쪽 일반 공백 연속·NBSP 글자·ZWJ·따옴표·이모지·머리표는 그대로
 *   ② 200자 판정은 정리가 끝난 제목(카드 `t`에 저장될 문자열, UTF-16 길이) 기준 — 디코딩 전 길이가 아니다
 *   ③ 대표(card-lead.ts) = 보존 기간 후순위(retentionDays 소스 — D32·M1-25, 다른 후보가 있으면 맨 뒤) → Tier → weight(같은 링크
 *      소스 중 최대) → 최신(낮춘 시각은 뒤) → 입력 순서, 200자 초과·설정에 없는 소스는 다음 후보. 언어가 섞인 클러스터는 대표가
 *      `lang`을 정한다
 *   ④ 출처 순서 = 대표 → Tier 오름차순 → 시각 내림차순 → URL. 같은 날 재실행 병합도 같은 규칙(`src[0]`·id·제목 유지)
 *   ⑤ 카드는 항상 `ai:false`·`s:[]`, 요약문(description)·본문은 카드에 없다(D23·D39)
 * 클러스터 계획·병합 자체는 tests/news-cluster.test.ts, 수집 실행 전 구간은 tests/collect-cluster.test.ts·collect-sources.test.ts.
 * 네트워크 없음.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  NewsCardSchema,
  type CardSource,
  type FeedItem,
  type NewsCard,
} from "@/lib/schema";

import { cardIdFor } from "../scripts/lib/card-id";
import {
  compareCardSources,
  orderCardSources,
  pickClusterLead,
} from "../scripts/lib/card-lead";
import { dedupeFeedItems, type DedupGroup } from "../scripts/lib/dedup";
import { buildClusterCard, clusterCard } from "../scripts/lib/news-cluster";
import { buildCard, mergeCards } from "../scripts/lib/news-file";
import {
  ENTITY_DECODE_MAX_PASSES,
  WINDOWS_1252_C1_SIZE,
  TITLE_MAX_LENGTH,
  cleanTitle,
  decodeEntitiesFully,
  normalizeFeedItem,
  normalizeFeedItems,
} from "../scripts/lib/normalize";
import { parseFeedXml } from "../scripts/lib/rss";

import { configSources } from "./support/fixture-sources";

const SOURCES = configSources();
const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s] as const));
const sourceOf = (id: string) => {
  const source = SOURCE_BY_ID.get(id);
  if (!source) throw new Error(`configs에 없는 소스: ${id}`);
  return source;
};

const NOW = "2026-10-10T21:30:00.000Z";
const H = 60 * 60 * 1000;
const at = (hours: number) =>
  new Date(Date.parse("2026-10-10T12:00:00.000Z") + hours * H).toISOString();

function item(source: string, url: string, title: string, hours = 0): FeedItem {
  return {
    title,
    url,
    publishedAt: at(hours),
    summary: null,
    source,
    author: null,
    authors: [],
    lang: sourceOf(source).lang,
  };
}

const groupsOf = (items: FeedItem[]): DedupGroup[] =>
  dedupeFeedItems(items).groups;

const leadUrl = (members: DedupGroup[]) =>
  buildClusterCard({ members, publishers: [] }, SOURCE_BY_ID, NOW)?.src[0]?.u;

// ─── ① 제목 정리 경계 ─────────────────────────────────────────────────────

describe("① cleanTitle — D23 '무수정'의 경계(엔티티 디코딩·공백 정리만)", () => {
  it("엔티티: 이중 인코딩까지 푼다(XML 파싱 뒤 남은 `&amp;amp;`·`&amp;#8217;`) — 최대 3회", () => {
    expect(cleanTitle("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(cleanTitle("Tom &amp;amp; Jerry")).toBe("Tom & Jerry");
    expect(cleanTitle("It&amp;#8217;s &amp;quot;over&amp;quot;")).toBe(
      'It’s "over"',
    );
    expect(cleanTitle("Arteta &#8211; &#x201C;calm&#x201D;")).toBe(
      "Arteta – “calm”",
    );
    // 3회 상한: 파싱 뒤 네 겹(`&amp;amp;amp;amp;`)은 한 겹이 남는다 — 무한 반복·과잉 해석 방지
    expect(ENTITY_DECODE_MAX_PASSES).toBe(3);
    expect(decodeEntitiesFully("&amp;amp;amp;")).toBe("&");
    expect(decodeEntitiesFully("&amp;amp;amp;amp;")).toBe("&amp;");
    // 모르는 이름·범위 밖 코드 포인트·세미콜론 없는 &는 그대로
    expect(cleanTitle("Mbapp&eacute; &#0; AT&T Q&A")).toBe(
      "Mbapp&eacute; &#0; AT&T Q&A",
    );
  });

  it("줄바꿈·탭이 든 공백 구간은 공백 1칸(XML 들여쓰기·CMS 줄바꿈 — 화면에서는 원래 공백 1칸으로 보인다)", () => {
    expect(
      cleanTitle("\n    Bayern strike late\n    to avoid defeat\n  "),
    ).toBe("Bayern strike late to avoid defeat");
    expect(cleanTitle("A\tB")).toBe("A B");
    expect(cleanTitle("A \r\n B")).toBe("A B");
    expect(cleanTitle("A\u2028B\u2029C")).toBe("A B C");
    // 줄바꿈 옆 NBSP·전각 공백은 보이는 글자라 남는다(구간에는 ASCII 공백만 넣는다)
    expect(cleanTitle("A\u00a0\n  B")).toBe("A\u00a0 B");
    expect(cleanTitle("A\n\u3000B")).toBe("A \u3000B");
    expect(cleanTitle("A&#10;B")).toBe("A B"); // 엔티티로 들어온 줄바꿈도
  });

  it("보이지 않는 제어 문자(C0·DEL·C1)는 지운다(사이트 RSS XML에서 허용되지 않음)", () => {
    expect(cleanTitle("Spurs\u0001 draw")).toBe("Spurs draw");
    expect(cleanTitle("Spurs\u007f draw\u0090")).toBe("Spurs draw");
    // CDATA 안 숫자 엔티티 `&#1;`은 XML 파서를 지나 우리 디코딩에서 제어 문자가 된다 → 지운다
    expect(cleanTitle("Spurs&#1; draw")).toBe("Spurs draw");
  });

  it("숫자 엔티티 0x80~0x9F는 HTML5 Windows-1252 대응표(27자) — 표에 없는 값은 원문 그대로", () => {
    expect(cleanTitle("Arteta&#146;s men &#133; &#150; done")).toBe(
      "Arteta’s men … – done",
    );
    expect(cleanTitle("&#x92;&#X93;q&#x94; &#128;5m &#153;")).toBe(
      "’“q” €5m ™",
    );
    expect(WINDOWS_1252_C1_SIZE).toBe(27);
    // 표에 없는 5개(0x81·0x8D·0x8F·0x90·0x9D)는 엔티티 원문 그대로 — 제어 문자로 풀어 지우지 않는다
    for (const code of [0x81, 0x8d, 0x8f, 0x90, 0x9d]) {
      expect(cleanTitle(`a&#${code};b`)).toBe(`a&#${code};b`);
      expect(cleanTitle(`a&#x${code.toString(16)};b`)).toBe(
        `a&#x${code.toString(16)};b`,
      );
    }
    // 0x80~0x9F 모든 값: 결과에 C1 제어 문자가 남지 않는다
    for (let code = 0x80; code <= 0x9f; code += 1) {
      expect(cleanTitle(`a&#${code};b`)).not.toMatch(/[\u0080-\u009f]/u);
    }
    // 이중 인코딩도 같은 표(`&amp;#146;` → `&#146;` → ’)
    expect(cleanTitle("Arteta&amp;#146;s")).toBe("Arteta’s");
  });

  it("글자로 들어온 C1(XML 파서가 CDATA 밖 `&#146;`를 U+0092로 푼 것)도 같은 대응표 — U+0085는 줄바꿈이 아니라 …", async () => {
    expect(cleanTitle("Arteta\u0092s men \u0085 \u0096 done")).toBe(
      "Arteta’s men … – done",
    );
    expect(cleanTitle("a\u0081b")).toBe("ab"); // 표에 없는 C1 글자는 제어 문자로 지운다
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
      <item><title>Arteta&#146;s men &#133; &#x96; done</title><link>https://example.com/a</link><pubDate>Sat, 10 Oct 2026 19:24:23 GMT</pubDate></item>
      <item><title><![CDATA[Arteta&#146;s men &#133; &#129;]]></title><link>https://example.com/b</link><pubDate>Sat, 10 Oct 2026 19:00:00 GMT</pubDate></item>
      </channel></rss>`;
    const raws = await parseFeedXml(xml);
    expect(raws[0]!.title).toBe("Arteta\u0092s men \u0085 \u0096 done"); // 파서가 이미 C1 글자로 푼다
    const { items } = normalizeFeedItems(raws, {
      id: "bbc-sport-football",
      lang: "en",
    });
    expect(items.map((i) => i.title)).toEqual([
      "Arteta’s men … – done",
      "Arteta’s men … &#129;",
    ]);
  });

  it("멱등 범위: XML 파싱 뒤 여분 인코딩 3겹까지는 완전히 풀리고 다시 정리해도 같다 — 4겹은 한 겹 남는다(상한)", () => {
    const intended = "It’s & co";
    const once = "It&#8217;s &amp; co"; // HTML 한 겹
    const layered = (k: number) => {
      let text = once;
      for (let i = 1; i < k; i += 1) text = text.replace(/&/g, "&amp;");
      return text;
    };
    for (const k of [1, 2, 3]) {
      expect(cleanTitle(layered(k))).toBe(intended);
      expect(cleanTitle(cleanTitle(layered(k)))).toBe(intended);
    }
    expect(cleanTitle(layered(4))).toBe(once);
    expect(cleanTitle(cleanTitle(layered(4)))).toBe(intended);
  });

  it("그대로 두는 것: 안쪽 일반 공백 연속·NBSP 글자·ZWJ·따옴표·대시·이모지·머리표·대소문자·끝 문장부호", () => {
    for (const title of [
      "'윌리안 결승골' 천안, 13경기 무승 탈출! 경남 발목 잡고 '234일 만에 승전고'  [케리뷰]", // 실제 풋볼리스트 제목(두 칸)
      "A\u00a0B", // NBSP 글자(엔티티가 아니면 그대로)
      "👨\u200d👩\u200d👧 family 🚨 HERE WE GO",
      "‘이강인 33분 소화’… “끝까지” — [오피셜] VAR?",
      "Real Madrid's Mbappé: 'ridículo' – Di Marzio.",
      "Zero\u200bwidth", // 보이지 않는 서식 문자(Cf)는 제어 문자(Cc)가 아니다
    ]) {
      expect(cleanTitle(title)).toBe(title);
    }
    // `&nbsp;` 엔티티는 NBSP 글자(U+00A0) — 엔티티가 가리키는 글자 그대로(일반 공백으로 바꾸지 않는다)
    expect(cleanTitle("Man&nbsp;City")).toBe("Man\u00a0City");
    // 앞뒤의 유니코드 공백·BOM은 정리
    expect(cleanTitle("\ufeff\u00a0 Title \u3000")).toBe("Title");
  });

  it("fixture 피드 69건: 정리 결과 = 앞뒤 공백 정리뿐(파싱 뒤 엔티티·줄바꿈·제어 문자 없음), 두 번 정리해도 같다", async () => {
    const index = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../fixtures/rss/index.json", import.meta.url)),
        "utf8",
      ),
    ) as { sources: Array<{ id: string; items: Array<{ title: string }> }> };
    let n = 0;
    for (const s of index.sources) {
      const xml = readFileSync(
        fileURLToPath(new URL(`../fixtures/rss/${s.id}.xml`, import.meta.url)),
        "utf8",
      );
      const raws = await parseFeedXml(xml);
      const titles = raws.map((r) => r.title ?? "");
      expect(titles).toEqual(s.items.map((i) => i.title)); // index title = XML 파싱 값
      for (const title of titles) {
        expect(cleanTitle(title)).toBe(title.trim());
        expect(cleanTitle(cleanTitle(title))).toBe(cleanTitle(title));
        n += 1;
      }
    }
    expect(n).toBe(69);
  });

  it("XML → 파싱 → 정규화: 제목은 정리만, 링크는 XML 엔티티만 풀린 원문(추적 파라미터 유지), 본문은 결과에 없고 요약문은 summary로만", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>t</title>
      <item><title>
        Haaland double fires
        Man City past Brentford&#x7f;
      </title><link> https://www.bbc.co.uk/sport/football/articles/c0x?at_medium=RSS&amp;at_campaign=rss </link><pubDate>Sat, 10 Oct 2026 19:24:23 GMT</pubDate>
      <description>합성-요약문-DESC</description><content:encoded><![CDATA[<p>합성-본문-BODY</p>]]></content:encoded></item>
      <item><title>Arteta: &amp;#8216;We&amp;#8217;re ready&amp;#8217; &amp;amp; calm</title><link>https://example.com/b</link><pubDate>Sat, 10 Oct 2026 19:00:00 GMT</pubDate></item>
      <item><title><![CDATA[Chelsea &amp;amp; Spurs &#8211; derby  preview]]></title><link>https://example.com/c</link><pubDate>Sat, 10 Oct 2026 18:00:00 GMT</pubDate></item>
      </channel></rss>`;
    const { items } = normalizeFeedItems(await parseFeedXml(xml), {
      id: "bbc-sport-football",
      lang: "en",
    });
    expect(items.map((i) => [i.title, i.url])).toEqual([
      [
        "Haaland double fires Man City past Brentford",
        "https://www.bbc.co.uk/sport/football/articles/c0x?at_medium=RSS&at_campaign=rss",
      ],
      ["Arteta: ‘We’re ready’ & calm", "https://example.com/b"],
      ["Chelsea & Spurs – derby  preview", "https://example.com/c"],
    ]);
    // M1-17(D39 ①): 요약문은 메모리 안 분류 입력(summary)으로만 — 카드에 넣지 않는 것은 buildCard 테스트·tests/collect-classify.test.ts
    expect(items.map((i) => i.summary)).toEqual([
      "합성-요약문-DESC",
      null,
      null,
    ]);
    expect(JSON.stringify(items)).not.toMatch(/합성-본문/);
  });
});

// ─── ② 200자 판정 ────────────────────────────────────────────────────────

describe("② 200자 판정 — 정리가 끝난 제목(카드 t) 기준, 자르지 않고 그 항목만 건너뜀", () => {
  const source = { id: "bbc-sport-football", lang: "en" };
  const raw = (title: string) => ({
    title,
    link: "https://example.com/a",
    pubDate: "Sat, 10 Oct 2026 19:24:23 GMT",
    authors: [],
  });
  const result = (title: string) => normalizeFeedItem(raw(title), source);

  it("디코딩·줄바꿈 정리 뒤 200자면 통과(원문 문자열은 200자 넘음)", () => {
    const decoded = result(`${"a".repeat(199)}&amp;amp;`); // 원문 208자 → 200자
    expect(decoded.ok && decoded.item.title).toBe(`${"a".repeat(199)}&`);
    const folded = result(`${"a".repeat(100)}\n        ${"b".repeat(99)}`); // 원문 208자 → 200자
    expect(folded.ok && folded.item.title.length).toBe(TITLE_MAX_LENGTH);
  });

  it("정리 뒤 201자면 건너뜀(자르지 않음) — 길이는 UTF-16 코드 유닛(이모지 2)", () => {
    expect(result(`${"a".repeat(200)}&amp;`)).toEqual({
      ok: false,
      reason: "title-too-long",
    });
    expect(result(`🚨${"a".repeat(199)}`)).toEqual({
      ok: false,
      reason: "title-too-long",
    });
    const hangul = result("가".repeat(200)); // 한글 음절 1자
    expect(hangul.ok).toBe(true);
  });
});

// ─── ③ 대표 ──────────────────────────────────────────────────────────────

describe("③ 대표 — 보존 기간 후순위 → Tier → weight → 최신 → 입력 순서 (card-lead.ts)", () => {
  const U = (k: string) => `https://example.com/${k}`;

  it("⓪ 보존 기간이 짧은 소스(The Athletic 7일 — D32·M1-25)는 다른 후보가 있으면 맨 뒤: Athletic + BBC → BBC", () => {
    expect(sourceOf("the-athletic-football").retentionDays).toBe(7);
    const athletic = item(
      "the-athletic-football",
      "https://www.nytimes.com/athletic/fixture/synthetic-a/",
      "Arsenal fight back to beat Leeds",
      5, // 가장 최신
    );
    const bbc = item(
      "bbc-sport-football",
      U("bbc"),
      "Arsenal fight back to beat Leeds 2-1",
      0,
    );
    const card = buildClusterCard(
      { members: groupsOf([athletic, bbc]), publishers: [] },
      SOURCE_BY_ID,
      NOW,
    )!;
    expect(card).toMatchObject({ id: cardIdFor(U("bbc")), t: bbc.title });
    // 나머지 출처 순서 규칙(Tier → 최신)은 그대로 — Athletic은 출처로 남는다(만료 때 그 출처만 빠진다)
    expect(card.src.map((s) => s.n)).toEqual(["BBC Sport", "The Athletic"]);
  });

  it("⓪ weight·Tier보다 먼저: Athletic(weight 1.5) + Relevo(weight 1) → Relevo, 보존 기간 있는 Tier 1 소스(가상)도 Tier 2 뒤", () => {
    const athletic = item(
      "the-athletic-football",
      "https://www.nytimes.com/athletic/fixture/synthetic-b/",
      "Vinicius sent off",
      3,
    );
    const relevo = item("relevo", U("relevo"), "Vinicius, expulsado", 0);
    expect(leadUrl(groupsOf([athletic, relevo]))).toBe(U("relevo"));
    const limitedTier1 = new Map(SOURCE_BY_ID);
    limitedTier1.set("uefa-ucl-news", {
      ...sourceOf("uefa-ucl-news"),
      retentionDays: 7,
    });
    const pick = pickClusterLead(
      groupsOf([
        item("uefa-ucl-news", U("uefa"), "Kane scores", 2),
        item("bbc-sport-football", U("bbc"), "Kane scores again", 0),
      ]),
      limitedTier1,
    );
    expect(pick.lead?.item.url).toBe(U("bbc"));
  });

  it("⓪ 다른 후보가 없으면 지금처럼 대표: Athletic만 → Athletic(그 안에서는 ①~④ — 최신)", () => {
    const older = item(
      "the-athletic-football",
      "https://www.nytimes.com/athletic/fixture/synthetic-c/",
      "Man United 1-1 Tottenham",
      0,
    );
    const newer = item(
      "the-athletic-football",
      "https://www.nytimes.com/athletic/fixture/synthetic-d/",
      "Man United 1-1 Tottenham: Solanke",
      2,
    );
    expect(leadUrl(groupsOf([older]))).toBe(older.url);
    expect(leadUrl(groupsOf([older, newer]))).toBe(newer.url);
    // 다른 후보가 대표가 될 수 없으면(설정에 없는 소스) Athletic이 대표
    const lost: DedupGroup = {
      key: "lost",
      item: item("espn-soccer", U("lost"), "Man United 1-1 Tottenham"),
      sources: ["gone-source"],
      count: 1,
    };
    expect(leadUrl([lost, ...groupsOf([older])])).toBe(older.url);
  });

  it("Tier가 weight·최신성보다 먼저: Tier 1(UEFA, weight 1.5, 가장 오래됨) > Tier 2(BBC Football, weight 3, 최신)", () => {
    const groups = groupsOf([
      item("bbc-sport-football", U("bbc"), "Bayern beat Augsburg late", 5),
      item("uefa-ucl-news", U("uefa"), "Bayern beat Augsburg late on", 0),
    ]);
    const card = buildClusterCard(
      { members: groups, publishers: [] },
      SOURCE_BY_ID,
      NOW,
    )!;
    expect(card.id).toBe(cardIdFor(U("uefa")));
    expect(card.t).toBe("Bayern beat Augsburg late on");
    expect(card.src.map((s) => [s.u, s.tier])).toEqual([
      [U("uefa"), 1],
      [U("bbc"), 2],
    ]);
  });

  it("같은 Tier면 weight: 언어가 섞인 클러스터는 대표가 카드 lang(제목 언어)을 정한다", () => {
    const relevo = item("relevo", U("es"), "Mbappé, ridículo", 3); // es, weight 1, 최신
    const marzio = item("di-marzio", U("it"), "Mbappé, ridicolo", 2); // it, weight 2
    const bbc = item("bbc-sport-football", U("en"), "Mbappe ridiculous", 0); // en, weight 3, 가장 오래됨
    const all = buildClusterCard(
      { members: groupsOf([relevo, marzio, bbc]), publishers: [] },
      SOURCE_BY_ID,
      NOW,
    )!;
    expect(all).toMatchObject({ t: bbc.title, lang: "en" });
    // 나머지 = 같은 Tier 2 → 최신 먼저(Relevo 3시 → Di Marzio 2시)
    expect(all.src.map((s) => s.u)).toEqual([U("en"), U("es"), U("it")]);
    const noBbc = buildClusterCard(
      { members: groupsOf([relevo, marzio]), publishers: [] },
      SOURCE_BY_ID,
      NOW,
    )!;
    expect(noBbc).toMatchObject({ t: marzio.title, lang: "it" });
  });

  it("weight는 같은 링크를 낸 소스 중 최대 — UCL(1)+European(2.5) 피드 공통 링크 > Premier League(2) 최신 기사", () => {
    const shared = U("shared");
    const groups = groupsOf([
      item("bbc-sport-champions-league", shared, "Kane hat-trick", 0),
      item("bbc-sport-premier-league", U("pl"), "Kane hat-trick again", 4),
      item("bbc-sport-european", shared, "Kane hat-trick", 0),
    ]);
    expect(groups.map((g) => g.sources)).toEqual([
      ["bbc-sport-champions-league", "bbc-sport-european"],
      ["bbc-sport-premier-league"],
    ]);
    const card = buildClusterCard(
      { members: groups, publishers: [] },
      SOURCE_BY_ID,
      NOW,
    )!;
    expect(card.src[0]).toEqual({
      n: "BBC Sport",
      u: shared,
      at: at(0),
      tier: 2,
    });
    // 대회 = 클러스터 소스 합집합(대표 소스 먼저)
    expect(card.comp).toEqual([
      "UCL",
      "LALIGA",
      "SERIEA",
      "BUNDESLIGA",
      "LIGUE1",
      "EPL",
    ]);
  });

  it("같은 Tier·weight면 최신 기사, 시각도 같으면 입력 순서 — reordered는 대표가 첫 묶음이 아닐 때만", () => {
    const old = item("bbc-sport-football", U("old"), "Spurs draw", 0);
    const fresh = item("bbc-sport-football", U("new"), "Spurs draw late", 2);
    const pick = pickClusterLead(groupsOf([old, fresh]), SOURCE_BY_ID);
    expect(pick.lead?.item.url).toBe(U("new"));
    expect(pick.reordered).toBe(true);
    expect(pick.rest.map((g) => g.item.url)).toEqual([U("old")]);
    const tie = pickClusterLead(
      groupsOf([old, { ...fresh, publishedAt: old.publishedAt }]),
      SOURCE_BY_ID,
    );
    expect(tie.lead?.item.url).toBe(U("old"));
    expect(tie.reordered).toBe(false);
  });

  it("수집 시각으로 낮춘 기사는 발행 시각을 믿지 않는다 — 같은 Tier·weight에서 시각을 아는 기사 뒤", () => {
    const trusted = item("espn-soccer", U("trusted"), "Arsenal win", 0);
    const clamped = item("espn-soccer", U("clamped"), "Arsenal win big", 9);
    const isClamped = (i: FeedItem) => i.url === U("clamped");
    const groups = groupsOf([clamped, trusted]);
    expect(pickClusterLead(groups, SOURCE_BY_ID).lead?.item.url).toBe(
      U("clamped"),
    );
    expect(
      pickClusterLead(groups, SOURCE_BY_ID, { isClamped }).lead?.item.url,
    ).toBe(U("trusted"));
    // 모두 낮춘 기사면 입력 순서
    expect(
      pickClusterLead(groups, SOURCE_BY_ID, { isClamped: () => true }).lead
        ?.item.url,
    ).toBe(U("clamped"));
    // 낮춘 기사도 Tier·weight가 높으면 대표(최신성만 믿지 않는다)
    const bbcClamped = item("bbc-sport-football", U("bbc"), "Arsenal win", 9);
    expect(
      pickClusterLead(groupsOf([trusted, bbcClamped]), SOURCE_BY_ID, {
        isClamped: () => true,
      }).lead?.item.url,
    ).toBe(U("bbc"));
  });

  it("200자 초과 제목(방어선 — 스키마를 우회한 입력)은 대표가 되지 않고 다음 후보가 대표, 그 기사는 출처로 남는다", () => {
    const long = item("bbc-sport-football", U("long"), "L".repeat(201), 5);
    const ok = item("espn-soccer", U("ok"), "Short title", 0);
    const outcome = clusterCard(
      { members: groupsOf([long, ok]), publishers: [] },
      SOURCE_BY_ID,
      NOW,
    );
    expect(outcome.card).toMatchObject({ t: "Short title", ai: false });
    expect(outcome.card!.src.map((s) => s.u)).toEqual([U("ok"), U("long")]);
    expect(outcome.skipped).toEqual({ unknownSource: 0, titleTooLong: 1 });
    expect(outcome.reordered).toBe(true);
    expect(NewsCardSchema.safeParse(outcome.card).success).toBe(true);
    // 후보가 없으면 카드 없음(그 클러스터만 건너뛴다 — 뉴스 파일 검증 실패로 번지지 않는다)
    const none = clusterCard(
      { members: groupsOf([long]), publishers: [] },
      SOURCE_BY_ID,
      NOW,
    );
    expect(none).toEqual({
      card: null,
      reordered: false,
      skipped: { unknownSource: 0, titleTooLong: 1 },
    });
  });

  it("결정적: 구성 묶음 입력 순서를 바꿔도 같은 카드(대표·출처 순서), 입력 배열은 바꾸지 않는다", () => {
    const items = [
      item("relevo", U("r"), "Vinicius red card", 4),
      item("bbc-sport-european", U("e"), "Vinicius sent off", 1),
      item("the-athletic-football", U("a"), "Vinicius sent off again", 3),
      item("bbc-sport-football", U("f"), "Vinicius red", 2),
    ];
    const expected = buildClusterCard(
      { members: groupsOf(items), publishers: [] },
      SOURCE_BY_ID,
      NOW,
    );
    expect(expected!.src.map((s) => s.u)).toEqual([
      U("f"), // weight 3
      U("r"), // 나머지 최신순: 4시
      U("a"), // 3시
      U("e"), // 1시
    ]);
    const orders = [
      [3, 2, 1, 0],
      [1, 3, 0, 2],
      [2, 0, 3, 1],
    ];
    for (const order of orders) {
      const members = groupsOf(order.map((k) => items[k]!));
      const snapshot = JSON.stringify(members);
      expect(leadUrl(members)).toBe(U("f"));
      expect(
        buildClusterCard({ members, publishers: [] }, SOURCE_BY_ID, NOW),
      ).toEqual(expected);
      expect(JSON.stringify(members)).toBe(snapshot);
    }
  });
});

// ─── ④ 출처 순서 ─────────────────────────────────────────────────────────

describe("④ 출처 순서 — 대표 → Tier 오름차순 → 시각 내림차순 → URL", () => {
  const src = (u: string, hours: number, tier: 1 | 2 | 3 = 2): CardSource => ({
    n: "X",
    u: `https://example.com/${u}`,
    at: at(hours),
    tier,
  });

  it("compareCardSources·orderCardSources: 대표는 맨 앞 그대로(더 오래됐거나 Tier가 낮아도), 입력 배열은 바꾸지 않는다", () => {
    const lead = src("lead", 0, 3);
    const rest = [src("b", 1), src("t1", 0, 1), src("a", 1), src("new", 5)];
    const copy = [...rest];
    expect(orderCardSources(lead, rest).map((s) => s.u.slice(20))).toEqual([
      "lead",
      "t1", // Tier 1
      "new", // Tier 2 · 5시
      "a", // Tier 2 · 1시 · URL a < b
      "b",
    ]);
    expect(rest).toEqual(copy);
    expect(compareCardSources(src("a", 1), src("a", 1))).toBe(0);
  });

  it("buildCard: 나머지 출처(more)도 같은 규칙으로 줄 세운다", () => {
    const card = buildCard(
      item("bbc-sport-football", "https://example.com/lead", "Lead", 0),
      sourceOf("bbc-sport-football"),
      NOW,
      [src("older", 1), src("newer", 3)],
    );
    expect(card.src.map((s) => s.u.slice(20))).toEqual([
      "lead",
      "newer",
      "older",
    ]);
  });
});

// ─── ⑤ ai:false · s:[] · 요약문 없음 ───────────────────────────────────────

describe("⑤ 카드는 항상 원제목+링크 — ai:false, s:[], 요약문·본문 없음 (D23·D39)", () => {
  const CARD_KEYS = [
    "ai",
    "cat",
    "comp",
    "created",
    "id",
    "imp",
    "kr",
    "lang",
    "players",
    "s",
    "spoiler",
    "src",
    "t",
    "teams",
  ];

  it("fixture 피드 14개 전 항목(해외 41·국내 28): 카드 t·src[0].u = 정규화 항목 원문, ai:false·s:[], 키 고정, 스키마 통과", async () => {
    let foreign = 0;
    let domestic = 0;
    for (const source of SOURCES) {
      let xml: string;
      try {
        xml = readFileSync(
          fileURLToPath(
            new URL(`../fixtures/rss/${source.id}.xml`, import.meta.url),
          ),
          "utf8",
        );
      } catch {
        continue; // fixture 없는 소스
      }
      const { items } = normalizeFeedItems(await parseFeedXml(xml), source);
      for (const feedItem of items) {
        const card = buildCard(feedItem, source, NOW);
        expect(NewsCardSchema.parse(card)).toEqual(card);
        expect(Object.keys(card).sort()).toEqual(CARD_KEYS);
        expect(card).toMatchObject({
          t: feedItem.title,
          s: [],
          ai: false,
          lang: source.lang,
          id: cardIdFor(feedItem.url),
        });
        expect(card.src).toEqual([
          {
            n: expect.any(String),
            u: feedItem.url,
            at: feedItem.publishedAt,
            tier: source.tier,
          },
        ]);
        if (source.lang === "ko") domestic += 1;
        else foreign += 1;
      }
    }
    expect({ foreign, domestic }).toEqual({ foreign: 41, domestic: 28 });
  });

  it("요약문(summary)이 있는 항목이 와도 카드·직렬화 결과에 넣지 않는다(분류 입력 전용 — D39, 합성 문자열)", () => {
    const withSummary: FeedItem = {
      ...item("interfootball-world", "https://example.com/k", "홀란드 멀티골"),
      summary: "합성-요약문-SUMMARY",
    };
    const card = buildCard(withSummary, sourceOf("interfootball-world"), NOW);
    expect(card).toMatchObject({ s: [], ai: false, lang: "ko" });
    expect(JSON.stringify(card)).not.toContain("합성-요약문");
  });
});

// ─── 같은 날 재실행 병합 ─────────────────────────────────────────────────

describe("같은 날 재실행 — 오늘 카드의 대표(id·제목·src[0])는 다시 고르지 않고, 붙인 출처는 같은 규칙으로 줄 세운다", () => {
  const espn = item(
    "espn-soccer",
    "https://www.espn.com/soccer/story/_/id/1/x",
    "Haaland scores twice as Man City beat Brentford",
    1,
  );
  const morning: NewsCard = buildCard(espn, sourceOf("espn-soccer"), NOW);
  const bbc: CardSource = {
    n: "BBC Sport",
    u: "https://www.bbc.co.uk/sport/football/articles/c0x",
    at: at(0),
    tier: 2,
  };
  const athletic: CardSource = {
    n: "The Athletic",
    u: "https://www.nytimes.com/athletic/fixture/synthetic-x/",
    at: at(3),
    tier: 2,
  };

  it("더 높은 weight(BBC 3 > ESPN 1)의 기사가 나중에 붙어도 id·제목·created·src[0] 유지, 나머지는 최신순", () => {
    const merged = mergeCards(
      [morning],
      [],
      [{ id: morning.id, src: [bbc, athletic] }],
    );
    expect(merged).toMatchObject({ added: 0, attached: 2 });
    const card = merged.cards[0]!;
    expect(card).toMatchObject({
      id: morning.id,
      t: morning.t,
      created: morning.created,
      ai: false,
    });
    expect(card.src.map((s) => s.n)).toEqual([
      "ESPN",
      "The Athletic", // 3시
      "BBC Sport", // 0시
    ]);
    // 두 번에 나눠 붙여도 같은 순서
    const first = mergeCards([morning], [], [{ id: morning.id, src: [bbc] }]);
    const second = mergeCards(
      first.cards,
      [],
      [{ id: morning.id, src: [athletic] }],
    );
    expect(second.cards[0]!.src).toEqual(card.src);
  });

  it("출처가 붙지 않은 카드는 순서를 건드리지 않는다(예전 규칙으로 쓰인 오늘 파일 카드 포함)", () => {
    const legacy: NewsCard = {
      ...morning,
      src: [morning.src[0]!, bbc, athletic],
    }; // 입력 순서(예전 규칙)
    const merged = mergeCards([legacy], []);
    expect(merged.cards[0]!.src).toEqual(legacy.src);
    // 붙으면 나머지를 다시 줄 세운다(src[0] 그대로)
    const touched = mergeCards(
      [legacy],
      [],
      [
        {
          id: legacy.id,
          src: [
            {
              ...bbc,
              u: "https://www.bbc.co.uk/sport/football/videos/v1",
              at: at(2),
            },
          ],
        },
      ],
    );
    expect(touched.cards[0]!.src.map((s) => s.at)).toEqual([
      at(1),
      at(3),
      at(2),
      at(0),
    ]);
  });
});
