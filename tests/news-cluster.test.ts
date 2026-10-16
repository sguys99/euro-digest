/**
 * M1-13 — 뉴스 클러스터 계획 (PRD FR-04·FR-05) + 클러스터 카드·병합. ①~④는 plan 'M1-12 이월 메모'(M1-13 항목) 번호이고
 * scripts/lib/news-cluster.ts 머리 주석과 같다.
 *
 * 순수 함수(scripts/lib/news-cluster.ts):
 *   ① 입력은 같은 URL 묶음(DedupGroup) — 클러스터는 묶음 위의 단계
 *   ② 다른 날 카드였던 URL이 든 클러스터는 통째로 제외(그 URL + 같은 사건의 늦은 기사), 집계 `seenBeforeExtra`
 *   ③ 같은 날 재실행 — 오늘 카드와 같은 사건의 새 기사는 그 카드의 새 출처(카드 URL이 다시 들어온 묶음은 바로 붙고,
 *      제목이 비슷한 새 묶음도 붙는다). 서로 다른 오늘 카드는 합치지 않는다
 *   ④ 보도 매체 수 = 매체명(publisherNameOf) 수 — BBC 피드 4개·국내 섹션/전체기사는 한 매체
 * 카드: 대표 = Tier·weight·최신성 1위 묶음(M1-15 — 피드 원문 제목·링크 무수정, 세부는 tests/news-card.test.ts), 출처 = 묶음마다
 * 1건(대표 → Tier·최신 순), 대회 = 클러스터 소스 합집합.
 * 병합(news-file.ts mergeCards): 붙일 출처(attachments)·URL이 겹치는 새 카드의 나머지 출처를 기존 카드에 붙인다(id·created 유지).
 * 네트워크 없음.
 */
import { describe, expect, it } from "vitest";

import {
  NewsCardSchema,
  type FeedItem,
  type NewsCard,
  type Source,
} from "@/lib/schema";

import { cardIdFor } from "../scripts/lib/card-id";
import { dedupeFeedItems, type DedupGroup } from "../scripts/lib/dedup";
import {
  buildClusterCard,
  clusterPublishers,
  clusterSourceMeta,
  groupCardSource,
  planNewsClusters,
  toCluster,
} from "../scripts/lib/news-cluster";
import { buildCard, mergeCards } from "../scripts/lib/news-file";
import { buildKeywordIndex } from "../scripts/lib/news-keywords";
import { scoreCluster } from "../scripts/lib/score";
import { buildSeenIndex } from "../scripts/lib/seen-urls";
import { urlHash } from "../scripts/lib/url-normalize";

import { configSources } from "./support/fixture-sources";

const SOURCES = configSources();
const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s] as const));
const byId = (id: string): Source => {
  const source = SOURCE_BY_ID.get(id);
  if (!source) throw new Error(`configs에 없는 소스: ${id}`);
  return source;
};

const NOW = "2026-10-10T21:30:00.000Z";
const H = 60 * 60 * 1000;
const at = (hours: number) =>
  new Date(Date.parse("2026-10-10T20:00:00.000Z") + hours * H).toISOString();

function item(source: string, url: string, title: string, hours = 0): FeedItem {
  return {
    title,
    url,
    publishedAt: at(hours),
    summary: null,
    source,
    author: null,
    authors: [],
    lang: byId(source).lang,
  };
}

const groupsOf = (items: FeedItem[]): DedupGroup[] =>
  dedupeFeedItems(items).groups;

const NO_MEMORY = {
  seen: new Map<string, string>(),
  todayKeys: new Set<string>(),
};

// 같은 사건(맨시티 3-1 브렌트포드) — 해외 3건(BBC 두 피드에 같은 링크 + ESPN) · 국내 2건, 그리고 다른 소식
const BBC_A =
  "https://www.bbc.co.uk/sport/football/articles/c0haaland01o?at_medium=RSS&at_campaign=rss";
const ESPN_B = "https://www.espn.com/soccer/story/_/id/1001/haaland-brentford";
const BBC_C = "https://www.bbc.co.uk/sport/football/articles/c0chelsea01o";
const IF_K1 =
  "https://www.interfootball.co.kr/news/articleView.html?idxno=900001";
const FL_K2 =
  "https://www.footballist.co.kr/news/articleView.html?idxno=900002";
const HAALAND_EN = "Haaland double fires Manchester City past Brentford";
const HAALAND_EN2 = "Haaland scores twice as Man City beat Brentford";
const CHELSEA = "Chelsea sack manager after poor start";
const HAALAND_KO = "홀란드 멀티골 맨시티, 브렌트포드 3-1 격파";
const HAALAND_KO2 = "‘홀란 2골’ 맨시티, 브렌트포드에 3-1 승리";

const dayItems = () => [
  item("bbc-sport-football", BBC_A, HAALAND_EN, 0),
  item("bbc-sport-football", BBC_C, CHELSEA, -1),
  item("bbc-sport-premier-league", BBC_A, HAALAND_EN, 0),
  item("espn-soccer", ESPN_B, HAALAND_EN2, 1),
  item("interfootball-world", IF_K1, HAALAND_KO, 2),
  item("footballist-football", FL_K2, HAALAND_KO2, 2.5),
];

describe("④ clusterPublishers — 보도 매체 수는 매체명 기준", () => {
  it("BBC 피드 여러 개·국내 섹션/전체기사는 한 매체, 설정에 없는 소스는 건너뛴다", () => {
    const groups = groupsOf([
      item("bbc-sport-football", BBC_A, HAALAND_EN),
      item("bbc-sport-premier-league", BBC_A, HAALAND_EN),
      item("bbc-sport-european", BBC_C, HAALAND_EN),
      item("interfootball-world", IF_K1, HAALAND_KO),
      item("interfootball-all", IF_K1, HAALAND_KO),
    ]);
    expect(groups.map((g) => g.sources.length)).toEqual([2, 1, 2]);
    expect(clusterPublishers(groups, SOURCE_BY_ID)).toEqual([
      "BBC Sport",
      "인터풋볼",
    ]);
    expect(
      clusterPublishers(
        [{ sources: ["unknown-source", "espn-soccer"] }],
        SOURCE_BY_ID,
      ),
    ).toEqual(["ESPN"]);
  });
});

describe("① planNewsClusters — 같은 URL 묶음 위에서 새 클러스터(fresh)", () => {
  it("같은 사건은 한 클러스터(대표 = 입력 순서상 처음), 국내·해외는 따로(D30), 다른 소식은 따로", () => {
    const plan = planNewsClusters({
      groups: groupsOf(dayItems()),
      sourceById: SOURCE_BY_ID,
      index: NO_MEMORY,
      todayCards: [],
    });
    expect(plan.fresh.map((c) => c.members.map((g) => g.item.url))).toEqual([
      [BBC_A, ESPN_B],
      [BBC_C],
      [IF_K1, FL_K2],
    ]);
    expect(plan.fresh.map((c) => c.publishers)).toEqual([
      ["BBC Sport", "ESPN"],
      ["BBC Sport"],
      ["인터풋볼", "풋볼리스트"],
    ]);
    expect(plan.existing).toEqual([]);
    expect(plan.seenBefore).toEqual([]);
    expect(plan.stats).toEqual({
      groups: 5,
      fresh: 3,
      multi: 2,
      merged: 2,
      maxPublishers: 2,
      existing: 0,
      additions: 0,
      existingSeenBefore: 0,
      seenBefore: 0,
      seenBeforeGroups: 0,
      seenBeforeExtra: 0,
    });
  });

  it("빈 입력", () => {
    const plan = planNewsClusters({
      groups: [],
      sourceById: SOURCE_BY_ID,
      index: NO_MEMORY,
      todayCards: [],
    });
    expect(plan).toMatchObject({ fresh: [], existing: [], seenBefore: [] });
    expect(plan.stats.maxPublishers).toBe(0);
  });
});

describe("② planNewsClusters — 다른 날 카드였던 사건은 통째로 제외(seenBefore)", () => {
  // 어제 카드: BBC_A(겹침 창으로 다시 들어옴). 오늘: 같은 사건 ESPN_B(어제 실행 뒤 보도) + 다른 소식 BBC_C
  const yesterday = buildCard(
    item("bbc-sport-football", BBC_A, HAALAND_EN, 0),
    byId("bbc-sport-football"),
    "2026-10-09T21:30:00.000Z",
  );
  const index = buildSeenIndex({
    stored: {},
    recentCards: [yesterday],
    todayCards: [],
    now: NOW,
  });

  it("어제 카드 URL과 같은 클러스터의 늦은 기사도 빠진다 — 그 URL 자신 + 같은 사건 1건, 다른 소식은 남는다", () => {
    const plan = planNewsClusters({
      groups: groupsOf([
        item("bbc-sport-football", BBC_A, HAALAND_EN, 0),
        item("bbc-sport-football", BBC_C, CHELSEA, -1),
        item("espn-soccer", ESPN_B, HAALAND_EN2, 1),
      ]),
      sourceById: SOURCE_BY_ID,
      index,
      todayCards: [],
    });
    expect(plan.fresh.map((c) => c.members.map((g) => g.item.url))).toEqual([
      [BBC_C],
    ]);
    expect(
      plan.seenBefore.map((c) => c.members.map((g) => g.item.url)),
    ).toEqual([[BBC_A, ESPN_B]]);
    expect(plan.stats).toMatchObject({
      seenBefore: 1,
      seenBeforeGroups: 2,
      seenBeforeExtra: 1,
    });
  });

  it("같은 사건이 아닌 새 기사는 어제 카드 URL이 다시 들어와도 그대로 새 카드 후보", () => {
    const plan = planNewsClusters({
      groups: groupsOf([
        item("bbc-sport-football", BBC_A, HAALAND_EN, 0),
        item(
          "espn-soccer",
          ESPN_B,
          "Arsenal agree deal for Brazilian winger",
          1,
        ),
      ]),
      sourceById: SOURCE_BY_ID,
      index,
      todayCards: [],
    });
    expect(plan.fresh.map((c) => c.members.map((g) => g.item.url))).toEqual([
      [ESPN_B],
    ]);
    expect(plan.stats).toMatchObject({
      seenBefore: 1,
      seenBeforeGroups: 1,
      seenBeforeExtra: 0,
    });
  });
});

describe("③ planNewsClusters — 같은 날 재실행: 오늘 카드의 새 출처(existing)", () => {
  const morning = buildCard(
    item("bbc-sport-football", BBC_A, HAALAND_EN, 0),
    byId("bbc-sport-football"),
    NOW,
  );
  const indexFor = (cards: NewsCard[]) =>
    buildSeenIndex({
      stored: {},
      recentCards: [],
      todayCards: cards,
      now: NOW,
    });

  it("오늘 카드 URL이 다시 들어오고 같은 사건의 새 기사가 있으면 → 그 카드 클러스터, 새 기사만 additions", () => {
    const plan = planNewsClusters({
      groups: groupsOf([
        item("bbc-sport-football", BBC_A, HAALAND_EN, 0),
        item("espn-soccer", ESPN_B, HAALAND_EN2, 1),
        item("bbc-sport-football", BBC_C, CHELSEA, -1),
      ]),
      sourceById: SOURCE_BY_ID,
      index: indexFor([morning]),
      todayCards: [morning],
    });
    expect(plan.existing).toHaveLength(1);
    expect(plan.existing[0]).toMatchObject({ cardId: morning.id });
    expect(plan.existing[0]!.members.map((g) => g.item.url)).toEqual([
      BBC_A,
      ESPN_B,
    ]);
    expect(plan.existing[0]!.additions.map((g) => g.item.url)).toEqual([
      ESPN_B,
    ]);
    expect(plan.existing[0]!.publishers).toEqual(["BBC Sport", "ESPN"]);
    expect(plan.fresh.map((c) => c.members.map((g) => g.item.url))).toEqual([
      [BBC_C],
    ]);
    expect(plan.stats).toMatchObject({
      existing: 1,
      additions: 1,
      seenBefore: 0,
    });
  });

  it("오늘 카드 URL이 창 밖으로 빠졌어도 제목이 비슷한 새 기사는 그 카드에 붙는다(카드 제목이 고정 묶음)", () => {
    const plan = planNewsClusters({
      groups: groupsOf([item("espn-soccer", ESPN_B, HAALAND_EN2, 1)]),
      sourceById: SOURCE_BY_ID,
      index: indexFor([morning]),
      todayCards: [morning],
    });
    expect(plan.fresh).toEqual([]);
    expect(
      plan.existing.map((c) => [c.cardId, c.additions.map((g) => g.item.url)]),
    ).toEqual([[morning.id, [ESPN_B]]]);
  });

  it("다시 들어온 오늘 카드 URL만 있으면 그 카드 클러스터(선별 자리 유지) — 붙일 출처 없음", () => {
    const plan = planNewsClusters({
      groups: groupsOf([item("bbc-sport-football", BBC_A, HAALAND_EN, 0)]),
      sourceById: SOURCE_BY_ID,
      index: indexFor([morning]),
      todayCards: [morning],
    });
    expect(
      plan.existing.map((c) => [
        c.cardId,
        c.members.length,
        c.additions.length,
      ]),
    ).toEqual([[morning.id, 1, 0]]);
  });

  it("후보가 없는 오늘 카드는 계획에 나오지 않는다", () => {
    const plan = planNewsClusters({
      groups: groupsOf([item("bbc-sport-football", BBC_C, CHELSEA, -1)]),
      sourceById: SOURCE_BY_ID,
      index: indexFor([morning]),
      todayCards: [morning],
    });
    expect(plan.existing).toEqual([]);
    expect(plan.fresh).toHaveLength(1);
  });

  it("서로 다른 오늘 카드 둘(클러스터링 이전 발행분 등)은 합치지 않는다 — 새 기사는 한 카드에만 붙는다", () => {
    const other = buildCard(
      item(
        "espn-soccer",
        "https://www.espn.com/soccer/story/_/id/1000/x",
        HAALAND_EN,
        0,
      ),
      byId("espn-soccer"),
      NOW,
    );
    const plan = planNewsClusters({
      groups: groupsOf([item("espn-soccer", ESPN_B, HAALAND_EN2, 1)]),
      sourceById: SOURCE_BY_ID,
      index: indexFor([morning, other]),
      todayCards: [morning, other],
    });
    expect(plan.existing).toHaveLength(1);
    expect(plan.existing[0]!.additions.map((g) => g.item.url)).toEqual([
      ESPN_B,
    ]);
  });

  it("다른 날 카드였던 URL은 오늘 카드 클러스터에 들어와도 출처로 붙이지 않는다", () => {
    const yesterday = buildCard(
      item("espn-soccer", ESPN_B, HAALAND_EN2, 1),
      byId("espn-soccer"),
      "2026-10-09T21:30:00.000Z",
    );
    const plan = planNewsClusters({
      groups: groupsOf([item("espn-soccer", ESPN_B, HAALAND_EN2, 1)]),
      sourceById: SOURCE_BY_ID,
      index: buildSeenIndex({
        stored: {},
        recentCards: [yesterday],
        todayCards: [morning],
        now: NOW,
      }),
      todayCards: [morning],
    });
    expect(plan.existing.map((c) => c.additions)).toEqual([[]]);
    expect(plan.seenBefore).toEqual([]);
    // 출처로 붙이지 않고 뺀 다른 날 URL도 집계한다(수집 실행 dedup.seenBefore에 더해진다 — M1-12 집계보다 줄지 않게)
    expect(plan.stats).toMatchObject({
      existing: 1,
      additions: 0,
      existingSeenBefore: 1,
      seenBeforeGroups: 0,
    });
  });
});

describe("클러스터 카드 — 대표 원문 무수정, 출처는 묶음마다, 대회는 소스 합집합", () => {
  it("buildClusterCard: id·제목·링크는 대표 묶음 원문(BBC weight 3 > ESPN 1), 출처 순서 = 대표 → 나머지, 스키마 통과", () => {
    const plan = planNewsClusters({
      groups: groupsOf(dayItems()),
      sourceById: SOURCE_BY_ID,
      index: NO_MEMORY,
      todayCards: [],
    });
    const card = buildClusterCard(plan.fresh[0]!, SOURCE_BY_ID, NOW)!;
    expect(NewsCardSchema.parse(card)).toEqual(card);
    expect(card).toMatchObject({
      id: cardIdFor(BBC_A),
      t: HAALAND_EN,
      s: [],
      ai: false,
      lang: "en",
      created: NOW,
      comp: ["EPL"], // BBC Football(없음) + Premier League(EPL) 같은 링크 + ESPN(없음)
    });
    expect(card.src).toEqual([
      { n: "BBC Sport", u: BBC_A, at: at(0), tier: 2 },
      { n: "ESPN", u: ESPN_B, at: at(1), tier: 2 },
    ]);
    const ko = buildClusterCard(plan.fresh[2]!, SOURCE_BY_ID, NOW)!;
    expect(ko.t).toBe(HAALAND_KO);
    expect(ko.src.map((s) => s.n)).toEqual(["인터풋볼", "풋볼리스트"]);
  });

  it("buildClusterCard: 선별 점수(M1-14)는 분류로 넘기기만 하고 카드에 저장하지 않는다(스키마 변경 없음 — 중요도 구간은 M1-17)", () => {
    const plan = planNewsClusters({
      groups: groupsOf(dayItems()),
      sourceById: SOURCE_BY_ID,
      index: NO_MEMORY,
      todayCards: [],
    });
    const cluster = plan.fresh[0]!;
    const score = scoreCluster(cluster, {
      now: NOW,
      sourceById: SOURCE_BY_ID,
      keywords: buildKeywordIndex({}),
    });
    expect(score.score).toBeGreaterThan(0);
    const withScore = buildClusterCard(cluster, SOURCE_BY_ID, NOW, { score })!;
    expect(withScore).toEqual(buildClusterCard(cluster, SOURCE_BY_ID, NOW));
    expect(Object.keys(withScore)).not.toContain("score");
    expect(withScore.imp).toBe(3); // 기본 중요도 — 점수 구간은 M1-17
  });

  it("clusterSourceMeta: 카드 소스 = 대표 소스 + 대회 합집합, 점수화 입력 = 클러스터 최고 tier·최대 weight·최단 보존", () => {
    const cluster = toCluster(
      groupsOf([
        item("bbc-sport-football", BBC_A, HAALAND_EN),
        item("bbc-sport-european", BBC_A, HAALAND_EN),
        item(
          "the-athletic-football",
          "https://www.nytimes.com/athletic/fixture/synthetic-x/",
          HAALAND_EN2,
        ),
        item("relevo", "https://www.relevo.com/futbol/x", HAALAND_EN2),
      ]),
      SOURCE_BY_ID,
    );
    const meta = clusterSourceMeta(cluster, SOURCE_BY_ID)!;
    expect(meta.card.id).toBe("bbc-sport-football");
    expect(meta.card.competitions).toEqual([
      "LALIGA",
      "SERIEA",
      "BUNDESLIGA",
      "LIGUE1",
    ]);
    expect(meta).toMatchObject({
      bestTier: 2,
      maxWeight: 3,
      minRetentionDays: 7,
    });
    expect(cluster.publishers).toEqual(["BBC Sport", "The Athletic", "Relevo"]);
  });

  it("소스가 설정에 없는 묶음은 대표가 될 수 없고(다음 후보가 대표 — M1-15) 출처에서도 빠진다, 후보가 없으면 카드 없음", () => {
    const lost: DedupGroup = {
      key: urlHash("https://example.com/a"),
      item: item("espn-soccer", "https://example.com/a", HAALAND_EN),
      sources: ["gone-source"],
      count: 1,
    };
    const ok: DedupGroup = {
      key: urlHash(ESPN_B),
      item: item("espn-soccer", ESPN_B, HAALAND_EN2),
      sources: ["espn-soccer"],
      count: 1,
    };
    // M1-13까지는 첫 묶음 소스가 설정에 없으면 클러스터 전체를 건너뛰었다 — 대표를 고르는 지금은 다음 후보가 대표가 된다
    expect(
      buildClusterCard({ members: [lost], publishers: [] }, SOURCE_BY_ID, NOW),
    ).toBeNull();
    expect(groupCardSource(lost, SOURCE_BY_ID)).toBeNull();
    for (const members of [
      [lost, ok],
      [ok, lost],
    ]) {
      const card = buildClusterCard(
        { members, publishers: [] },
        SOURCE_BY_ID,
        NOW,
      )!;
      expect(card.id).toBe(cardIdFor(ESPN_B));
      expect(card.src.map((s) => s.u)).toEqual([ESPN_B]);
    }
  });
});

describe("③ mergeCards — 기존 카드에 새 출처 붙이기(news-file.ts)", () => {
  const morning = buildCard(
    item("bbc-sport-football", BBC_A, HAALAND_EN, 0),
    byId("bbc-sport-football"),
    NOW,
  );
  const espnSrc = { n: "ESPN", u: ESPN_B, at: at(1), tier: 2 as const };

  it("attachments: id·created·제목 유지, 출처만 뒤에 붙는다(이미 어느 카드에든 있는 URL은 건너뜀), 원본 카드는 바꾸지 않는다", () => {
    const merged = mergeCards(
      [morning],
      [],
      [
        {
          id: morning.id,
          src: [espnSrc, { ...espnSrc, u: `${ESPN_B}?utm_source=x` }],
        },
        { id: "c_ffffffffff", src: [espnSrc] }, // 없는 카드 — 무시
      ],
    );
    expect(merged).toMatchObject({ added: 0, duplicates: 0, attached: 1 });
    expect(merged.cards).toHaveLength(1);
    expect(merged.cards[0]).toMatchObject({
      id: morning.id,
      created: morning.created,
      t: morning.t,
    });
    expect(merged.cards[0]!.src.map((s) => s.u)).toEqual([BBC_A, ESPN_B]);
    expect(morning.src).toHaveLength(1);
  });

  it("출처 URL이 겹치는 새 카드는 더하지 않고 그 카드에 없는 출처만 기존 카드에 붙인다(예전: 통째로 건너뜀)", () => {
    const incoming = buildCard(
      item("bbc-sport-football", `${BBC_A}&utm_medium=social`, HAALAND_EN, 0),
      byId("bbc-sport-football"),
      "2026-10-10T23:00:00.000Z",
      [espnSrc],
    );
    // M1-16: 추적 파라미터만 다른 링크는 같은 ID(정규화 URL 해시). ID가 다른 옛 규칙 카드와의 병합은 tests/card-id.test.ts ④
    expect(incoming.id).toBe(morning.id);
    const merged = mergeCards([morning], [incoming]);
    expect(merged).toMatchObject({ added: 0, duplicates: 1, attached: 1 });
    expect(merged.cards.map((c) => [c.id, c.created, c.src.length])).toEqual([
      [morning.id, NOW, 2],
    ]);
  });

  it("새 출처가 더 최근이면 카드 정렬도 바뀐다(최신 출처 시각 순)", () => {
    const older = buildCard(
      item("bbc-sport-football", BBC_C, CHELSEA, 0.5),
      byId("bbc-sport-football"),
      NOW,
    );
    const before = mergeCards([morning, older], []);
    expect(before.cards.map((c) => c.id)).toEqual([older.id, morning.id]);
    const after = mergeCards(
      [morning, older],
      [],
      [{ id: morning.id, src: [espnSrc] }],
    );
    expect(after.cards.map((c) => c.id)).toEqual([morning.id, older.id]);
  });
});
