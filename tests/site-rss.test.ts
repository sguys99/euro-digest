/**
 * 사이트 RSS (FR-122, plan M4-11) — scripts/lib/site-rss.ts 순수 함수 + 삭제 요청 로더 연결.
 * 생성한 XML은 rss-parser(수집과 같은 파서 — 엄격한 XML 파싱)로 다시 읽어 확인한다. 네트워크·LLM 없음.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Parser from "rss-parser";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadNewsIssue } from "@/lib/data/news";
import { createPaths } from "@/lib/paths";
import { NewsCardSchema, type NewsCard } from "@/lib/schema/news";

import {
  RSS_ITEM_LIMIT,
  buildSiteFeeds,
  channelDate,
  channelMeta,
  escapeXml,
  feedPredicate,
  issuesInWindow,
  renderRss,
  selectFeedEntries,
  type FeedCompetition,
  type FeedIssue,
} from "../scripts/lib/site-rss";

const PATHS = createPaths({ basePath: "/euro-digest", siteUrl: undefined });

const COMPETITIONS: FeedCompetition[] = [
  { id: "EPL", nameKo: "프리미어리그" },
  { id: "LALIGA", nameKo: "라리가" },
  { id: "SERIEA", nameKo: "세리에 A" },
  { id: "BUNDESLIGA", nameKo: "분데스리가" },
  { id: "LIGUE1", nameKo: "리그 1" },
  { id: "UCL", nameKo: "챔피언스리그" },
];
const compName = (id: string) =>
  COMPETITIONS.find((c) => c.id === id)?.nameKo ?? null;

let seq = 0;
/** 스키마를 통과하는 카드(필요한 필드만 덮어쓴다) */
function card(overrides: Partial<NewsCard> = {}): NewsCard {
  seq += 1;
  return NewsCardSchema.parse({
    id: `c_${seq.toString(16).padStart(10, "0")}`,
    t: `Title ${seq}`,
    s: [],
    cat: "other",
    comp: ["EPL"],
    teams: [],
    players: [],
    imp: 3,
    kr: false,
    spoiler: false,
    src: [
      {
        n: "BBC Sport",
        u: `https://www.bbc.co.uk/sport/football/articles/${seq}`,
        at: "2026-11-01T20:32:44Z",
        tier: 1,
      },
    ],
    lang: "en",
    ai: false,
    created: "2026-11-01T22:12:34Z",
    ...overrides,
  });
}

function issue(
  date: string,
  cards: NewsCard[],
  generatedAt?: string,
): FeedIssue {
  return { date, generatedAt: generatedAt ?? `${date}T00:00:00Z`, cards };
}

const parser = new Parser();

describe("선별 — 최근 호부터, 호 안은 파일 순서, 30건, 7일 창, 같은 카드 ID는 최근 호 것", () => {
  it("최신 호가 30건 이상이면 그 호의 상위 30건(파일 순서)", () => {
    const today = Array.from({ length: 45 }, () => card());
    const yesterday = Array.from({ length: 10 }, () => card());
    const entries = selectFeedEntries(
      [issue("2026-11-01", yesterday), issue("2026-11-02", today)],
      feedPredicate({ kind: "all" }),
    );
    expect(entries).toHaveLength(RSS_ITEM_LIMIT);
    expect(entries.map((e) => e.card.id)).toEqual(
      today.slice(0, 30).map((c) => c.id),
    );
    expect(new Set(entries.map((e) => e.date))).toEqual(
      new Set(["2026-11-02"]),
    );
  });

  it("모자라면 전날 호로 채우고, 같은 카드 ID는 최근 호 것만", () => {
    const shared = card();
    const today = [card(), shared];
    const yesterday = [{ ...shared, t: "older" }, card()];
    const entries = selectFeedEntries(
      [issue("2026-11-02", today), issue("2026-11-01", yesterday)],
      feedPredicate({ kind: "all" }),
    );
    expect(entries.map((e) => [e.card.id, e.date])).toEqual([
      [today[0]!.id, "2026-11-02"],
      [shared.id, "2026-11-02"],
      [yesterday[1]!.id, "2026-11-01"],
    ]);
  });

  it("최신 호 기준 7일(발행일) 밖의 호는 보지 않는다", () => {
    const issues = [
      issue("2026-11-02", [card()]),
      issue("2026-10-27", [card()]),
      issue("2026-10-26", [card()]),
    ];
    expect(issuesInWindow(issues).map((i) => i.date)).toEqual([
      "2026-11-02",
      "2026-10-27",
    ]);
    expect(
      selectFeedEntries(issues, feedPredicate({ kind: "all" })),
    ).toHaveLength(2);
  });

  it("대회 피드 = comp 포함 카드, 한국 선수 피드 = kr 카드", () => {
    const epl = card({ comp: ["EPL"] });
    const multi = card({ comp: ["UCL", "LALIGA"] });
    const kr = card({ comp: ["BUNDESLIGA"], kr: true });
    const issues = [issue("2026-11-02", [epl, multi, kr])];
    const ids = (feed: Parameters<typeof feedPredicate>[0]) =>
      selectFeedEntries(issues, feedPredicate(feed)).map((e) => e.card.id);
    expect(ids({ kind: "competition", comp: "EPL" })).toEqual([epl.id]);
    expect(ids({ kind: "competition", comp: "LALIGA" })).toEqual([multi.id]);
    expect(ids({ kind: "competition", comp: "LIGUE1" })).toEqual([]);
    expect(ids({ kind: "korean" })).toEqual([kr.id]);
  });

  it("채널 날짜 = 창 안 호의 generatedAt 최댓값, 호가 없으면 null", () => {
    expect(
      channelDate([
        issue("2026-11-01", [], "2026-11-01T22:00:00Z"),
        issue("2026-11-02", [], "2026-11-01T21:59:00.000Z"),
        issue("2026-10-20", [], "2026-11-05T00:00:00Z"), // 창 밖
      ]),
    ).toBe("2026-11-01T22:00:00Z");
    expect(channelDate([])).toBeNull();
  });
});

describe("XML 이스케이프", () => {
  it("& < > \" '를 엔티티로, XML 1.0에서 쓸 수 없는 문자는 지운다(한글·이모지는 그대로)", () => {
    expect(escapeXml(`A&B <i> "q" 'a'`)).toBe(
      "A&amp;B &lt;i&gt; &quot;q&quot; &apos;a&apos;",
    );
    expect(escapeXml("손흥민 ⚽ 골\u0000\u0008\u000B￾\uD800끝\t")).toBe(
      "손흥민 ⚽ 골끝\t",
    );
    expect(escapeXml("😀")).toBe("😀");
  });
});

describe("renderRss → rss-parser로 다시 읽기", () => {
  const tricky = card({
    t: `Ødegaard & Saka: "It's <not> over" — 손흥민 ⚽ 🇰🇷`,
    cat: "result",
    comp: ["EPL", "UCL", "EPL"],
    src: [
      {
        n: "Sky & Co",
        u: "https://example.com/a?x=1&y=%22q%22#frag",
        at: "2026-10-25T00:30:05.123Z",
        tier: 2,
      },
      {
        n: "BBC Sport",
        u: "https://example.com/b",
        at: "2026-10-25T01:00:00Z",
        tier: 1,
      },
      {
        n: "BBC Sport",
        u: "https://example.com/c",
        at: "2026-10-25T02:00:00Z",
        tier: 1,
      },
    ],
  });
  const domestic = card({
    t: "이강인, 시즌 2호 골… PSG 3-0 승리",
    lang: "ko",
    kr: true,
    comp: ["LIGUE1"],
    src: [
      {
        n: "연합뉴스",
        u: "https://www.yna.co.kr/view/AKR1",
        at: "2026-10-25T03:00:00Z",
        tier: 2,
      },
    ],
  });
  const sameOutlet = card({
    src: [
      {
        n: "BBC Sport",
        u: "https://example.com/d",
        at: "2026-10-25T03:00:00Z",
        tier: 1,
      },
      {
        n: "BBC Sport",
        u: "https://example.com/e",
        at: "2026-10-25T02:00:00Z",
        tier: 1,
      },
    ],
  });

  const xml = renderRss({
    channel: channelMeta({ kind: "all" }, PATHS, compName),
    entries: [
      { card: tricky, date: "2026-10-25" },
      { card: domestic, date: "2026-10-25" },
      { card: sameOutlet, date: "2026-10-24" },
    ],
    builtAt: "2026-10-24T21:52:10.482Z",
    paths: PATHS,
    competitionName: compName,
  });

  it("UTF-8 선언 + RSS 2.0 + atom:link self, CDATA 없음", () => {
    expect(
      xml.startsWith(
        '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
      ),
    ).toBe(true);
    expect(xml).toContain(
      '<atom:link href="https://sguys99.github.io/euro-digest/rss.xml" rel="self" type="application/rss+xml"/>',
    );
    expect(xml).not.toContain("CDATA");
    expect(xml.endsWith("</rss>\n")).toBe(true);
  });

  it("제목·링크는 원문 그대로(특수문자·이모지·한글), guid = 카드 ID, pubDate = 대표 출처 시각(RFC 822 UTC)", async () => {
    const feed = await parser.parseString(xml);
    expect(feed.title).toBe("유로 다이제스트");
    expect(feed.link).toBe("https://sguys99.github.io/euro-digest/");
    expect(feed.lastBuildDate).toBe("Sat, 24 Oct 2026 21:52:10 +0000");
    expect(feed.items).toHaveLength(3);
    const [a, b] = feed.items;
    expect(a?.title).toBe(tricky.t);
    expect(a?.link).toBe("https://example.com/a?x=1&y=%22q%22#frag");
    expect(a?.guid).toBe(tricky.id);
    expect(a?.pubDate).toBe("Sun, 25 Oct 2026 00:30:05 +0000");
    expect(a?.isoDate).toBe("2026-10-25T00:30:05.000Z");
    expect(a?.categories).toEqual([
      "프리미어리그",
      "챔피언스리그",
      "경기 결과",
    ]);
    expect(b?.title).toBe(domestic.t);
    expect(b?.link).toBe("https://www.yna.co.kr/view/AKR1");
    expect(xml).toContain(`<guid isPermaLink="false">${tricky.id}</guid>`);
  });

  it("description: 출처명 + 외 N곳/건 · 대회 · 분류 · 카드 앵커(basePath 포함) — 요약 줄 없음", async () => {
    const feed = await parser.parseString(xml);
    const [a, b, c] = feed.items;
    expect(a?.content).toBe(
      `<p>Sky &amp; Co 외 1곳 · 프리미어리그 · 챔피언스리그 · 경기 결과</p>` +
        `<p><a href="https://sguys99.github.io/euro-digest/news/2026-10-25/#${tricky.id}">유로 다이제스트에서 보기</a></p>`,
    );
    expect(b?.content).toContain("<p>연합뉴스 · 리그 1 · 기타</p>");
    expect(c?.content).toContain(
      "<p>BBC Sport 외 1건 · 프리미어리그 · 기타</p>",
    );
    expect(c?.content).toContain(
      `/euro-digest/news/2026-10-24/#${sameOutlet.id}`,
    );
    expect(xml).not.toContain("AI 작성");
  });

  it("ai:true 카드(지금은 없음 — D23)는 'AI 작성 제목'을 붙인다", async () => {
    const ai = card({ ai: true, t: "AI 한국어 제목" });
    const out = renderRss({
      channel: channelMeta({ kind: "all" }, PATHS, compName),
      entries: [{ card: ai, date: "2026-10-25" }],
      builtAt: null,
      paths: PATHS,
      competitionName: compName,
    });
    const feed = await parser.parseString(out);
    expect(feed.items[0]?.content).toMatch(/^<p>AI 작성 제목<\/p>/);
  });

  it("빈 피드도 유효한 RSS — 항목 0, 날짜 없으면 lastBuildDate 생략", async () => {
    const out = renderRss({
      channel: channelMeta({ kind: "korean" }, PATHS, compName),
      entries: [],
      builtAt: null,
      paths: PATHS,
      competitionName: compName,
    });
    const feed = await parser.parseString(out);
    expect(feed.items).toEqual([]);
    expect(feed.title).toBe("유로 다이제스트 — 한국 선수");
    expect(feed.link).toBe(
      "https://sguys99.github.io/euro-digest/korean-players/",
    );
    expect(out).not.toContain("lastBuildDate");
  });
});

describe("buildSiteFeeds — 피드 묶음", () => {
  const issues = [
    issue(
      "2026-11-02",
      [card({ comp: ["EPL"] }), card({ comp: ["SERIEA"], kr: true })],
      "2026-11-01T22:12:40.340Z",
    ),
    issue("2026-11-01", [card({ comp: ["EPL"] })], "2026-10-31T22:00:00Z"),
  ];

  it("전체 · 대회 6개(설정 순서, 항목 없어도 생성) · 한국 선수 = 8개, 경로는 basePath 없는 산출물 경로", async () => {
    const feeds = buildSiteFeeds({
      issues,
      competitions: COMPETITIONS,
      paths: PATHS,
    });
    expect(feeds.map((f) => [f.path, f.items])).toEqual([
      ["/rss.xml", 3],
      ["/rss/epl.xml", 2],
      ["/rss/laliga.xml", 0],
      ["/rss/seriea.xml", 1],
      ["/rss/bundesliga.xml", 0],
      ["/rss/ligue1.xml", 0],
      ["/rss/ucl.xml", 0],
      ["/rss/korean.xml", 1],
    ]);
    for (const f of feeds) {
      const parsed = await parser.parseString(f.xml);
      expect(parsed.items).toHaveLength(f.items);
      expect(f.xml).toContain(
        `href="https://sguys99.github.io/euro-digest${f.path}"`,
      );
      expect(parsed.lastBuildDate).toBe("Sun, 01 Nov 2026 22:12:40 +0000");
    }
    const epl = await parser.parseString(feeds[1]!.xml);
    expect(epl.title).toBe("유로 다이제스트 — 프리미어리그");
    expect(epl.link).toBe(
      "https://sguys99.github.io/euro-digest/competitions/epl/",
    );
  });

  it("basePath·SITE_URL — 루트 배포와 다른 출처", () => {
    const root = createPaths({
      basePath: "",
      siteUrl: "http://127.0.0.1:4173",
    });
    const [all] = buildSiteFeeds({
      issues,
      competitions: COMPETITIONS,
      paths: root,
    });
    expect(all?.xml).toContain(
      '<atom:link href="http://127.0.0.1:4173/rss.xml"',
    );
    expect(all?.xml).toContain("<link>http://127.0.0.1:4173/</link>");
    expect(all?.xml).toContain(
      "href=&quot;http://127.0.0.1:4173/news/2026-11-02/#",
    );
    expect(all?.xml).not.toContain("euro-digest/");
  });

  it("결정성 — 같은 입력이면 현재 시각과 무관하게 같은 바이트", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-02T00:00:00Z"));
      const first = buildSiteFeeds({
        issues,
        competitions: COMPETITIONS,
        paths: PATHS,
      });
      vi.setSystemTime(new Date("2027-03-28T01:30:00Z"));
      const second = buildSiteFeeds({
        issues: [...issues].reverse(),
        competitions: COMPETITIONS,
        paths: PATHS,
      });
      expect(second).toEqual(first);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("삭제 요청 카드는 피드에 없다 — build-feeds와 같은 로더(loadNewsIssue) 경로", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("등록 카드 ID는 전체·대회·한국 선수 피드 어디에도 없다", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "euro-digest-rss-"));
    const kept = card({ kr: true });
    const taken = card({ kr: true });
    writeFileSync(
      path.join(dir, "2026-11-02.json"),
      JSON.stringify({
        date: "2026-11-02",
        generatedAt: "2026-11-01T22:12:40Z",
        runId: "r1",
        cards: [taken, kept],
      }),
    );
    const takedownsFile = path.join(dir, "takedowns.json");
    writeFileSync(
      takedownsFile,
      JSON.stringify([
        {
          id: taken.id,
          requestedAt: "2026-11-02T00:00:00Z",
          handledAt: null,
          reason: "삭제 요청 (#1)",
        },
      ]),
    );
    const loaded = loadNewsIssue("2026-11-02", dir, { takedownsFile });
    expect(loaded).not.toBeNull();
    const feeds = buildSiteFeeds({
      issues: [loaded!],
      competitions: COMPETITIONS,
      paths: PATHS,
    });
    for (const f of feeds) expect(f.xml).not.toContain(taken.id);
    const all = await parser.parseString(feeds[0]!.xml);
    expect(all.items.map((i) => i.guid)).toEqual([kept.id]);
    const korean = await parser.parseString(feeds.at(-1)!.xml);
    expect(korean.items.map((i) => i.guid)).toEqual([kept.id]);
  });
});
