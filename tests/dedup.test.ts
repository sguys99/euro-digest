/**
 * M1-12 — 같은 URL 중복 제거 + 소스 메타 합치기 (PRD FR-04, M1-02·M1-09 이월: 같은 링크를 합칠 때 대회 태그도 합친다).
 *
 * 필수 항목: 정규화 URL이 같은 항목은 한 묶음(추적 파라미터·http·www·AMP 차이) · 대표 = 처음 나온 항목(링크·제목 원문 그대로) ·
 * 소스 id 순서·중복 없음 · 다른 기사는 다른 묶음 · 소스 메타(카드 소스 = 대표 소스 + 대회 합집합, 카드 src의 매체명·tier는
 * 같은 출처 값 / 점수화 입력 = 최고 tier·최대 weight·최단 보존 기간) ·
 * 실제 configs(BBC Football + Premier League → EPL, 국내 섹션 ⊂ 전체기사).
 * 네트워크 없음 — 순수 함수.
 */
import { describe, expect, it } from "vitest";

import type { FeedItem, Source } from "@/lib/schema";

import {
  dedupeFeedItems,
  groupSource,
  mergeSourceMeta,
} from "../scripts/lib/dedup";
import { buildCard, publisherNameOf } from "../scripts/lib/news-file";
import { urlHash } from "../scripts/lib/url-normalize";

import { configSources } from "./support/fixture-sources";

const SOURCES = configSources();
const byId = (id: string): Source => {
  const source = SOURCES.find((s) => s.id === id);
  if (!source) throw new Error(`configs에 없는 소스: ${id}`);
  return source;
};
const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s] as const));

function item(
  source: string,
  url: string,
  publishedAt = "2026-10-10T20:00:00.000Z",
  title = `title ${url}`,
): FeedItem {
  return {
    title,
    url,
    publishedAt,
    summary: null,
    source,
    author: null,
    authors: [],
    lang: "en",
  };
}

const BBC_LINK =
  "https://www.bbc.co.uk/sport/football/articles/cqn73g3pvezdo?at_medium=RSS&at_campaign=rss";

describe("dedupeFeedItems — 정규화 URL 해시로 묶기", () => {
  it("빈 입력 → 묶음 없음", () => {
    expect(dedupeFeedItems([])).toEqual({ groups: [], duplicates: 0 });
  });

  it("같은 기사의 링크 변형(추적 파라미터·http·www·AMP·조각·끝 슬래시)은 한 묶음 — 대표는 처음 나온 항목 그대로", () => {
    const first = item(
      "bbc-sport-football",
      BBC_LINK,
      "2026-10-10T20:58:39.000Z",
      "Original title",
    );
    const variants = [
      item("bbc-sport-premier-league", BBC_LINK),
      item(
        "bbc-sport-european",
        "http://bbc.co.uk/sport/football/articles/cqn73g3pvezdo",
      ),
      item(
        "bbc-sport-football",
        "https://www.bbc.co.uk/sport/football/articles/cqn73g3pvezdo.amp?utm_source=x",
      ),
      item(
        "bbc-sport-champions-league",
        "https://www.bbc.co.uk/sport/football/articles/cqn73g3pvezdo/#comments",
      ),
    ];
    const { groups, duplicates } = dedupeFeedItems([first, ...variants]);
    expect(groups).toHaveLength(1);
    expect(duplicates).toBe(4);
    expect(groups[0]).toEqual({
      key: urlHash(BBC_LINK),
      item: first, // 링크·제목·시각은 피드 원문 그대로(정규화 URL은 키로만)
      sources: [
        "bbc-sport-football",
        "bbc-sport-premier-league",
        "bbc-sport-european",
        "bbc-sport-champions-league",
      ],
      count: 5,
    });
    expect(groups[0]!.item.url).toBe(BBC_LINK);
  });

  it("다른 기사는 다른 묶음, 묶음 순서 = 대표가 처음 나온 순서", () => {
    const items = [
      item(
        "interfootball-world",
        "https://www.interfootball.co.kr/news/articleView.html?idxno=2",
      ),
      item(
        "interfootball-world",
        "https://www.interfootball.co.kr/news/articleView.html?idxno=1",
      ),
      item(
        "interfootball-all",
        "https://www.interfootball.co.kr/news/articleView.html?idxno=2",
      ),
      item(
        "interfootball-all",
        "https://www.interfootball.co.kr/news/articleView.html?idxno=3",
      ),
    ];
    const { groups, duplicates } = dedupeFeedItems(items);
    expect(duplicates).toBe(1);
    expect(
      groups.map((g) => [g.item.url.slice(-1), g.sources, g.count]),
    ).toEqual([
      ["2", ["interfootball-world", "interfootball-all"], 2],
      ["1", ["interfootball-world"], 1],
      ["3", ["interfootball-all"], 1],
    ]);
  });

  it("같은 피드 안 중복(BBC)은 소스 id 하나 — count만 늘어난다", () => {
    const link =
      "https://www.bbc.co.uk/sport/football/articles/cqzjx3z4ljr0o?at_medium=RSS&at_campaign=rss";
    const { groups } = dedupeFeedItems([
      item("bbc-sport-football", link),
      item("bbc-sport-football", link),
    ]);
    expect(groups).toEqual([
      expect.objectContaining({ sources: ["bbc-sport-football"], count: 2 }),
    ]);
  });

  it("뒤에 나온 같은 링크가 더 최신이어도 대표는 처음 나온 항목(설정 순서 — 실행마다 같은 결과)", () => {
    const { groups } = dedupeFeedItems([
      item("a", "https://e.com/1", "2026-10-10T10:00:00.000Z"),
      item("b", "https://e.com/1", "2026-10-10T13:00:00.000Z"),
    ]);
    expect(groups[0]!.item).toMatchObject({
      source: "a",
      publishedAt: "2026-10-10T10:00:00.000Z",
    });
  });
});

describe("mergeSourceMeta · groupSource — 같은 링크를 낸 소스들의 메타 합치기", () => {
  it("BBC Football(대회 없음) + Premier League(EPL) → 카드 소스는 BBC Football 그대로 + 대회 [EPL] (M1-02 이월)", () => {
    const meta = mergeSourceMeta([
      byId("bbc-sport-football"),
      byId("bbc-sport-premier-league"),
    ]);
    expect(meta.card).toEqual({
      ...byId("bbc-sport-football"),
      competitions: ["EPL"],
    });
    expect(meta).toMatchObject({ bestTier: 2, maxWeight: 3 });
    expect(meta.sources.map((s) => s.id)).toEqual([
      "bbc-sport-football",
      "bbc-sport-premier-league",
    ]);
  });

  it("대회 합집합은 처음 나온 순서·중복 없음", () => {
    const meta = mergeSourceMeta([
      byId("bbc-sport-champions-league"), // UCL
      byId("bbc-sport-european"), // LALIGA·SERIEA·BUNDESLIGA·LIGUE1
      byId("relevo"), // LALIGA
      byId("di-marzio"), // SERIEA
    ]);
    expect(meta.card.competitions).toEqual([
      "UCL",
      "LALIGA",
      "SERIEA",
      "BUNDESLIGA",
      "LIGUE1",
    ]);
  });

  it("카드 소스의 출처명·tier·weight는 대표 소스 자신의 값 — 묶음 최고 tier·최대 weight는 점수화 입력(bestTier·maxWeight)으로만", () => {
    const lead: Source = { ...byId("interfootball-all"), tier: 3, weight: 1 };
    const other: Source = {
      ...byId("relevo"),
      tier: 1,
      weight: 2.5,
    };
    const meta = mergeSourceMeta([lead, other]);
    expect(meta.card).toMatchObject({
      id: "interfootball-all",
      name: lead.name,
      lang: "ko",
      tier: 3, // 다른 매체(tier 1)의 등급을 가져오지 않는다 — src[].n과 src[].tier가 같은 출처를 가리키게
      weight: 1,
    });
    expect(meta).toMatchObject({ bestTier: 1, maxWeight: 2.5 });
  });

  it("카드 출처 src[0]은 대표 소스의 매체명·tier 짝 — 묶음 최고 tier가 섞이지 않는다", () => {
    const lead: Source = { ...byId("interfootball-all"), tier: 3 };
    const other: Source = { ...byId("bbc-sport-premier-league"), tier: 1 };
    const meta = mergeSourceMeta([lead, other]);
    const card = buildCard(
      item(
        lead.id,
        "https://www.interfootball.co.kr/news/articleView.html?idxno=1",
      ),
      meta.card,
      "2026-10-10T21:30:00.000Z",
    );
    expect(card.src).toEqual([
      {
        n: publisherNameOf(lead),
        u: "https://www.interfootball.co.kr/news/articleView.html?idxno=1",
        at: "2026-10-10T20:00:00.000Z",
        tier: 3,
      },
    ]);
    expect(card.comp).toEqual(["EPL"]); // 대회 태그만 합집합
  });

  it("보존 기간: 카드 소스는 대표 소스 값 그대로, 묶음 최단 값은 minRetentionDays(보관 제한 출처가 섞이면 엄격한 쪽 — D32), 아무도 없으면 null", () => {
    const athletic = byId("the-athletic-football");
    expect(athletic.retentionDays).toBe(7);
    const plain = byId("bbc-sport-football");
    const mixed = mergeSourceMeta([plain, athletic]);
    expect(mixed.minRetentionDays).toBe(7);
    expect(mixed.card).not.toHaveProperty("retentionDays");
    expect(
      mergeSourceMeta([{ ...plain, retentionDays: 30 }, athletic])
        .minRetentionDays,
    ).toBe(7);
    expect(
      mergeSourceMeta([plain, byId("bbc-sport-premier-league")])
        .minRetentionDays,
    ).toBeNull();
  });

  it("소스 하나면 카드 소스는 같은 값의 복사본(원본을 바꾸지 않음)", () => {
    const source = byId("bbc-sport-premier-league");
    const meta = mergeSourceMeta([source]);
    expect(meta.card).toEqual(source);
    expect(meta.card).not.toBe(source);
    expect(meta).toMatchObject({
      bestTier: source.tier,
      maxWeight: source.weight,
      minRetentionDays: null,
    });
    meta.card.competitions.push("UCL");
    expect(source.competitions).toEqual(["EPL"]);
  });

  it("groupSource — 대표 소스가 설정에 없으면 null, 대표가 아닌 모르는 소스는 빼고 합친다", () => {
    expect(
      groupSource({ sources: ["no-such-source"] }, SOURCE_BY_ID),
    ).toBeNull();
    expect(groupSource({ sources: [] }, SOURCE_BY_ID)).toBeNull();
    const meta = groupSource(
      {
        sources: [
          "bbc-sport-football",
          "no-such-source",
          "bbc-sport-premier-league",
        ],
      },
      SOURCE_BY_ID,
    );
    expect(meta?.card).toMatchObject({
      id: "bbc-sport-football",
      competitions: ["EPL"],
    });
    expect(meta?.sources.map((s) => s.id)).toEqual([
      "bbc-sport-football",
      "bbc-sport-premier-league",
    ]);
  });
});
