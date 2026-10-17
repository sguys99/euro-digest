/**
 * M1-17 — 엔티티 2단계 병합 (scripts/lib/entity-merge.ts·cluster-classify.ts, PRD FR-05·§15 D42 — CLAUDE.md §9.2 필수: 클러스터링).
 *
 * 수용 기준(FR-05 — D42): **잘못 합친 카드 0건** + 같은 사건 중복 감소. 고정하는 것
 *   - 대상: 경기 결과 · 팀 정확히 2개 · 여러 소식 묶음 아님 · **제목 스코어 있음**(국내·해외 같다 — M1-17 재리뷰, 오케스트레이터 결정:
 *     스코어 없는 기사는 D42 대상이 아니다, 재현율보다 잘못 합치기 0)
 *   - 같은 두 팀(순서 무관) · 12시간 창(사슬 없음) · 공통 스코어(다르면 합치지 않음) · 국내·해외 안 섞음(D30)
 *   - 오늘 카드(같은 날 재실행): 1장이면 출처로 붙인다(카드 id·제목 유지 — 붙는 쪽도 스코어 필요), 2장 이상이면 합치지 않는다
 *   - 재리뷰 재현 A~K(이적·추첨·발언·회담 제목, 오늘 카드 경로, U21 팀)는 tests/classify-review.test.ts
 *   - 실데이터: fixtures/cluster(사람 판정 must·ok·tolerated) window·older 잘못 합친 쌍 0, 같은 사건 재현이 늘어난다 — 사전이 늘어나도
 *     (D46 확정분 흉내) 0. fixtures/rss 손 판정 클러스터(cluster:*) 밖으로 합치지 않는다
 * 네트워크 없음.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  SourcesFileSchema,
  type FeedItem,
  type NamesKoFile,
  type NewsCard,
} from "@/lib/schema";

import type { ClassifyContext } from "../scripts/lib/classify";
import {
  classifyClusters,
  todayCardEntity,
} from "../scripts/lib/cluster-classify";
import { dedupeFeedItems, type DedupGroup } from "../scripts/lib/dedup";
import {
  ENTITY_MERGE_WINDOW_MS,
  entityOf,
  planEntityMerges,
  type EntityKey,
} from "../scripts/lib/entity-merge";
import { planNewsClusters } from "../scripts/lib/news-cluster";
import { buildKeywordIndex } from "../scripts/lib/news-keywords";
import { filterOutOfScope } from "../scripts/lib/news-scope";
import { prepareSourceItems } from "../scripts/lib/feed-collect";
import { parseFeedXml } from "../scripts/lib/rss";
import { buildTagIndex } from "../scripts/lib/tag-names";
import { urlHash } from "../scripts/lib/url-normalize";

import { fixtureFeedSources } from "./support/fixture-sources";
import { namesWithExtras } from "./support/names-extras";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const NAMES = NamesKoFileSchema.parse(readJson("configs/names.ko.json"));
const PLAYERS = KoreanPlayersFileSchema.parse(
  readJson("configs/korean-players.json"),
);
const SOURCES = SourcesFileSchema.parse(readJson("configs/sources.json"));
const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s] as const));
/** fixture 피드 14개를 켠 소스(ESPN 포함 — tests/support/fixture-sources.ts) */
const FEED_SOURCES = fixtureFeedSources();
const ctxOf = (names: NamesKoFile): ClassifyContext => ({
  keywords: buildKeywordIndex({ names, koreanPlayers: PLAYERS }),
  tags: buildTagIndex({ names, koreanPlayers: PLAYERS }),
  sourceById: SOURCE_BY_ID,
});
const CTX = ctxOf(NAMES);
const CTX_EXTRA = ctxOf(namesWithExtras(NAMES));

const H = 60 * 60 * 1000;
const T0 = Date.parse("2026-10-10T20:00:00.000Z");
const key = (
  pair: string,
  hours: number,
  scores: string[] = [],
  script: "ko" | "latin" = "latin",
): EntityKey => ({ pair, scores, script, atMs: T0 + hours * H });

// ─── 규칙 ────────────────────────────────────────────────────────────────

describe("entityOf — 대상", () => {
  const base = {
    matchResult: true,
    roundup: false,
    teams: ["leeds-united", "arsenal"],
    scores: ["1-2"],
    script: "latin" as const,
  };
  it("경기 결과 · 팀 정확히 2개 · 묶음 아님 → 열쇠(두 팀 정렬)", () => {
    expect(entityOf(base, T0)).toEqual({
      script: "latin",
      pair: "arsenal|leeds-united",
      scores: ["1-2"],
      atMs: T0,
    });
  });
  it("결과가 아니거나 · 팀이 1개·3개 이상이거나 · 여러 소식 묶음이면 대상이 아니다", () => {
    expect(entityOf({ ...base, matchResult: false }, T0)).toBeNull();
    expect(entityOf({ ...base, teams: ["arsenal"] }, T0)).toBeNull();
    expect(entityOf({ ...base, teams: ["a", "b", "c"] }, T0)).toBeNull();
    expect(entityOf({ ...base, roundup: true }, T0)).toBeNull();
    expect(entityOf(base, Number.NaN)).toBeNull();
  });
});

describe("planEntityMerges — 합치는 조건(D42)", () => {
  it("같은 두 팀 + 같은 스코어 + 12시간 이내 → 합친다(입력 번호 오름차순)", () => {
    const plan = planEntityMerges({
      fresh: [
        key("a|b", 0, ["1-2"]),
        key("c|d", 0, ["0-0"]),
        key("a|b", 3, ["1-2"]),
      ],
    });
    expect(plan.merges).toEqual([[0, 2]]);
    expect(plan.stats).toMatchObject({
      eligible: 3,
      merges: 1,
      merged: 1,
      conflicts: 0,
    });
  });

  it("다른 두 팀·12시간 넘음은 합치지 않는다(창은 첫 클러스터 기준 — 사슬 없음)", () => {
    expect(
      planEntityMerges({
        fresh: [key("a|b", 0, ["1-2"]), key("a|c", 0, ["1-2"])],
      }).merges,
    ).toEqual([]);
    expect(
      planEntityMerges({
        fresh: [key("a|b", 0, ["1-2"]), key("a|b", 13, ["1-2"])],
      }).merges,
    ).toEqual([]);
    // 0·8·16시간 — 0과 8은 한 창, 16은 다음 창(8~16이 8시간이어도 0과 16은 16시간)
    expect(
      planEntityMerges({
        fresh: [
          key("a|b", 0, ["1-2"]),
          key("a|b", 8, ["1-2"]),
          key("a|b", 16, ["1-2"]),
        ],
      }).merges,
    ).toEqual([[0, 1]]);
    expect(ENTITY_MERGE_WINDOW_MS).toBe(12 * H);
  });

  it("스코어가 서로 다르면(진행 중 스코어 등) 그 창은 합치지 않는다 — 공통 스코어가 있으면 합친다('1-3→4-3')", () => {
    const conflict = planEntityMerges({
      fresh: [key("a|b", 0, ["0-1"]), key("a|b", 1, ["1-3"]), key("a|b", 2)],
    });
    expect(conflict.merges).toEqual([]);
    expect(conflict.stats.conflicts).toBe(1);
    expect(
      planEntityMerges({
        fresh: [key("a|b", 0, ["1-3", "3-4"]), key("a|b", 1, ["3-4"])],
      }).merges,
    ).toEqual([[0, 1]]);
  });

  // M1-17 재리뷰: 이전에는 해외 스코어 없는 클러스터를 스코어 기사보다 늦으면 합쳤다(⑤) — 두 팀 이름이 든 이적·추첨·발언 제목이 결과 카드
  // 밑으로 숨어(잘못 합치기) 국내처럼 스코어가 있는 구성원끼리만 합친다(오케스트레이터 결정). 아래 [[1, 2]] 단언을 []로 바꿨다
  it("스코어 없는 클러스터는 국내·해외 모두 대상이 아니다 — 스코어 있는 구성원끼리만 합친다", () => {
    expect(
      planEntityMerges({ fresh: [key("a|b", 0), key("a|b", 4)] }).merges,
    ).toEqual([]);
    // 스코어 있는 기사(2시간) 뒤의 스코어 없는 기사(4시간)도 합치지 않는다
    const late = planEntityMerges({
      fresh: [key("a|b", 0), key("a|b", 2, ["1-2"]), key("a|b", 4)],
    });
    expect(late.merges).toEqual([]);
    expect(late.stats.eligible).toBe(1);
    // 스코어 있는 둘 사이의 스코어 없는 기사는 빠지고 둘만 합친다
    expect(
      planEntityMerges({
        fresh: [key("a|b", 0, ["1-2"]), key("a|b", 1), key("a|b", 2, ["1-2"])],
      }).merges,
    ).toEqual([[0, 2]]);
    expect(
      planEntityMerges({
        fresh: [key("a|b", 0, [], "ko"), key("a|b", 4, [], "ko")],
      }).merges,
    ).toEqual([]);
    expect(
      planEntityMerges({
        fresh: [
          key("a|b", 0, ["2-4"], "ko"),
          key("a|b", 1, [], "ko"),
          key("a|b", 2, ["2-4"], "ko"),
        ],
      }).merges,
    ).toEqual([[0, 2]]);
  });

  it("국내·해외는 합치지 않는다(D30 — 연결 줄은 빌드 때, M1-31)", () => {
    expect(
      planEntityMerges({
        fresh: [key("a|b", 0, ["1-1"]), key("a|b", 1, ["1-1"], "ko")],
      }).merges,
    ).toEqual([]);
  });

  it("오늘 카드 1장 → 새 클러스터를 그 카드의 출처로(합치지 않는다), 2장 이상 → 그 창은 손대지 않는다, 스코어 조건은 같다(붙는 쪽도 스코어)", () => {
    // 스코어 없는 새 클러스터(3시간)는 붙지 않는다(M1-17 재리뷰 — 이전 단언 fresh [0, 1] → [0])
    const one = planEntityMerges({
      fresh: [key("a|b", 2, ["1-2"]), key("a|b", 3)],
      today: [{ cardId: "c_0000000001", key: key("a|b", 0, ["1-2"]) }],
    });
    expect(one.merges).toEqual([]);
    expect(one.attach).toEqual([{ cardId: "c_0000000001", fresh: [0] }]);
    expect(one.stats).toMatchObject({ attached: 1, eligibleToday: 1 });
    // 아침의 스코어 없는 오늘 카드는 대상이 아니다(결과 기사가 그 밑으로 숨지 않게)
    const early = planEntityMerges({
      fresh: [key("a|b", 6, ["1-2"])],
      today: [{ cardId: "c_0000000001", key: key("a|b", 0) }],
    });
    expect([early.merges, early.attach]).toEqual([[], []]);
    expect(early.stats.eligibleToday).toBe(0);
    const two = planEntityMerges({
      fresh: [key("a|b", 2, ["1-2"])],
      today: [
        { cardId: "c_0000000001", key: key("a|b", 0, ["1-2"]) },
        { cardId: "c_0000000002", key: key("a|b", 1, ["1-2"]) },
      ],
    });
    expect([two.merges, two.attach, two.stats.conflicts]).toEqual([[], [], 1]);
  });
});

// ─── 클러스터 단계 (cluster-classify.ts) ─────────────────────────────────────

let seq = 0;
const group = (
  title: string,
  source: string,
  at: string,
  lang = SOURCE_BY_ID.get(source)!.lang,
): DedupGroup => {
  seq += 1;
  return {
    key: `k${String(seq).padStart(4, "0")}`,
    item: {
      title,
      url: `https://example.com/${seq}`,
      publishedAt: at,
      summary: null,
      source,
      author: null,
      authors: [],
      lang,
    } satisfies FeedItem,
    sources: [source],
    count: 1,
  };
};
const singletons = (groups: DedupGroup[]) =>
  groups.map((g) => ({ members: [g], publishers: [] as string[] }));
const orderOf = (groups: DedupGroup[]) => {
  const order = new Map(groups.map((g, i) => [g.key, i] as const));
  return (g: DedupGroup) => order.get(g.key) ?? 0;
};

describe("classifyClusters — 분석 → 병합 → 다시 분석", () => {
  // 스코어 없는 같은 경기 기사('Man United held by Spurs, …')는 합치지 않는다(M1-17 재리뷰 — 스코어 있는 구성원끼리만). 이전에는 BBC 스코어
  // 기사 + ESPN 스코어 없는 기사를 합쳤다 — ESPN 제목을 스코어 있는 제목으로 바꾸고, 스코어 없는 제목은 따로 남는지 본다
  it("같은 경기 해외 두 클러스터(같은 스코어 기사 둘)를 합치고 합친 제목 전체로 다시 분석한다, 스코어 없는 같은 경기 기사는 따로", () => {
    const groups = [
      group(
        "Tottenham 1-1 Man Utd: Solanke rescues point in added time",
        "bbc-sport-football",
        "2026-10-10T19:24:00.000Z",
      ),
      group(
        "Getafe make offer to sign free agent Sancho",
        "bbc-sport-football",
        "2026-10-10T19:00:00.000Z",
      ),
      group(
        "Man United 1-1 Spurs: Amorim's side fall to worst start in 40 years",
        "espn-soccer",
        "2026-10-10T21:00:00.000Z",
      ),
      group(
        "Man United held by Spurs, fall to worst start in 40 years",
        "espn-soccer",
        "2026-10-10T21:30:00.000Z",
      ),
    ];
    const out = classifyClusters({
      fresh: singletons(groups),
      todayCards: [],
      ctx: CTX,
      groupOrder: orderOf(groups),
    });
    expect(out.fresh.map((c) => c.members.map((m) => m.key))).toEqual([
      [groups[0]!.key, groups[2]!.key],
      [groups[1]!.key],
      [groups[3]!.key],
    ]);
    expect(out.fresh[0]!.publishers).toEqual(["BBC Sport", "ESPN"]);
    expect(out.analysisOf(out.fresh[0]!)).toMatchObject({
      cat: "result",
      teams: ["tottenham-hotspur", "manchester-united"],
      comp: ["EPL"],
    });
    expect(out.stats).toMatchObject({ merges: 1, merged: 1 });
  });

  it("오늘 카드와 같은 경기 → 그 카드의 출처(카드 id·제목 유지 — 새 카드가 아니다)", () => {
    const groups = [
      group(
        "Chelsea fall to 2-1 defeat at Arsenal",
        "espn-soccer",
        "2026-10-11T00:30:00.000Z",
      ),
    ];
    const card = {
      id: "c_00000000aa",
      t: "Saka double helps Arsenal beat Chelsea 2-1",
      lang: "en",
      cat: "result" as const,
      teams: ["arsenal", "chelsea"],
      src: [
        {
          n: "BBC Sport",
          u: "https://www.bbc.co.uk/x",
          at: "2026-10-10T21:10:00.000Z",
          tier: 2 as const,
        },
      ],
    } satisfies Partial<NewsCard>;
    expect(todayCardEntity(card)).toMatchObject({
      pair: "arsenal|chelsea",
      scores: ["1-2"],
    });
    const out = classifyClusters({
      fresh: singletons(groups),
      todayCards: [card as NewsCard],
      ctx: CTX,
      groupOrder: orderOf(groups),
    });
    expect(out.fresh).toEqual([]);
    expect(out.attachments).toEqual([{ cardId: "c_00000000aa", groups }]);
    // M1-17 전 카드(teams []·cat other)·경기 결과가 아닌 카드는 대상이 아니다
    expect(todayCardEntity({ ...card, teams: [] })).toBeNull();
    expect(todayCardEntity({ ...card, cat: "other" })).toBeNull();
    // 아침의 경기 전 카드(결과 동사가 있어도 경기 전 표현) — 대상이 아니다(결과 기사가 그 밑으로 숨지 않게)
    expect(
      todayCardEntity({
        ...card,
        t: "Arteta: Arsenal can beat Chelsea without Odegaard",
      }),
    ).toBeNull();
  });
});

// ─── 실데이터 (사람 판정) ───────────────────────────────────────────────────

interface TitleSample {
  collectedAt: string;
  items: Array<{
    id: string;
    sample: "window" | "older";
    source: string;
    lang: string;
    publishedAt: string;
    title: string;
  }>;
  labels: { must: string[][]; ok: string[][]; tolerated: string[][] };
}
const SAMPLE = readJson(
  "fixtures/cluster/titles-2026-10-15.json",
) as TitleSample;
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const OK_PAIRS = new Set<string>();
for (const [a, b] of SAMPLE.labels.must) OK_PAIRS.add(pairKey(a!, b!));
for (const g of SAMPLE.labels.ok)
  for (const a of g)
    for (const b of g) if (a !== b) OK_PAIRS.add(pairKey(a, b));
for (const [a, b] of SAMPLE.labels.tolerated) OK_PAIRS.add(pairKey(a!, b!));

function runSample(
  name: "window" | "older",
  ctx: ClassifyContext,
  merge: boolean,
) {
  const groups: DedupGroup[] = SAMPLE.items
    .filter((i) => i.sample === name)
    .map((i) => ({
      key: i.id,
      item: {
        title: i.title,
        url: `https://example.com/${i.id}`,
        publishedAt: i.publishedAt,
        summary: null,
        source: i.source,
        author: null,
        authors: [],
        lang: i.lang,
      },
      sources: [i.source],
      count: 1,
    }));
  const kept = filterOutOfScope(groups, ctx).kept;
  const plan = planNewsClusters({
    groups: kept,
    sourceById: SOURCE_BY_ID,
    index: { seen: new Map(), todayKeys: new Set() },
    todayCards: [],
  });
  const clusters = merge
    ? classifyClusters({
        fresh: plan.fresh,
        todayCards: [],
        ctx,
        groupOrder: orderOf(kept),
      }).fresh
    : plan.fresh;
  const merged = new Set<string>();
  for (const c of clusters)
    for (const x of c.members)
      for (const y of c.members)
        if (x.key < y.key) merged.add(pairKey(x.key, y.key));
  const keptIds = new Set(kept.map((g) => g.key));
  const must = SAMPLE.labels.must.filter(
    ([a, b]) => keptIds.has(a!) && keptIds.has(b!),
  );
  return {
    clusters: clusters.length,
    falsePairs: [...merged].filter((p) => !OK_PAIRS.has(p)),
    mustHit: must.filter(([a, b]) => merged.has(pairKey(a!, b!))).length,
    mustTotal: must.length,
    okHit: [...merged].filter((p) => OK_PAIRS.has(p)).length,
  };
}

describe.each([
  ["현재 사전", CTX],
  ["사전 + D46 확정분 흉내", CTX_EXTRA],
] as const)("실데이터 — fixtures/cluster 사람 판정 (%s)", (_label, ctx) => {
  // 제목 유사도(1단계)가 이미 합친 must 6쌍은 그대로. 엔티티 병합은 더 합치지 않는다 — 스코어 있는 경기 기사 셋(🚨 'PSG 3-0 up
  // already' — 진행 중 스코어, 국내 PSG 4-2 맨시티 두 기사 — 1단계가 이미 한 클러스터)뿐이다. M1-17 1차 반영 때 합쳤던 맨시티-PSG
  // 해외('PSG 3-0 up already' + 그 뒤의 스코어 없는 'Man City show fight but fall short of fightback')는 스코어 없는 기사라 대상이 아니다
  // (M1-17 재리뷰 — 오케스트레이터 결정: 재현율보다 잘못 합치기 0, 이전 단언 okHit 7·클러스터 −1 → 6·0). 남은 must 8쌍은 경기 결과가
  // 아니다(발언·이적·징계 — D42 대상 밖)
  it("window(범위 밖 제외 뒤 155건): 잘못 합친 쌍 0, 스코어 없는 기사는 합치지 않는다(합친 쌍 6 → 6)", () => {
    const before = runSample("window", ctx, false);
    const after = runSample("window", ctx, true);
    expect(before.falsePairs).toEqual([]);
    expect(after.falsePairs).toEqual([]);
    expect([before.mustHit, after.mustHit, after.mustTotal]).toEqual([
      6, 6, 14,
    ]);
    expect([before.okHit, after.okHit]).toEqual([6, 6]);
    expect(before.clusters - after.clusters).toBe(0);
  });

  // 'Doku delights as Manchester City cruise past 10-man Liverpool' + 'How big star Doku delivered … in win at Liverpool'(손 판정 must)는
  // 둘 다 스코어가 없어 합치지 않는다(D42 ⑤ — 해외 스코어 없는 기사는 스코어 기사보다 늦은 것만, M1-17 리뷰)
  it("older(54건): 잘못 합친 쌍 0(tolerated는 1단계 쌍), 스코어 없는 기사끼리는 합치지 않는다", () => {
    const before = runSample("older", ctx, false);
    const after = runSample("older", ctx, true);
    expect(after.falsePairs).toEqual([]); // tolerated는 OK_PAIRS에 넣었다
    expect([before.mustHit, after.mustHit, after.mustTotal]).toEqual([0, 0, 1]);
    expect(before.clusters).toBe(after.clusters);
  });
});

describe("실데이터 — fixtures/rss 손 판정 클러스터(M0-33 cluster:*)", () => {
  it("범위 밖 제외 → 제목 유사도 → 엔티티 병합 뒤 여러 묶음 클러스터는 모두 같은 손 판정 클러스터(오탐 0), 국내·해외 안 섞음", async () => {
    const index = readJson("fixtures/rss/index.json") as {
      sources: Array<{
        id: string;
        items: Array<{ link: string; tags: string[] }>;
      }>;
    };
    const items: FeedItem[] = [];
    const label = new Map<string, string>();
    for (const s of index.sources) {
      const source = FEED_SOURCES.find((x) => x.id === s.id)!;
      const raws = await parseFeedXml(
        readFileSync(path.join(ROOT, `fixtures/rss/${s.id}.xml`), "utf8"),
      );
      items.push(
        ...prepareSourceItems(raws, { ...source, author: undefined }).items,
      );
      for (const it of s.items) {
        const tag = it.tags.find((t) => t.startsWith("cluster:"));
        if (tag)
          label.set(urlHash(it.link.trim()), tag.slice("cluster:".length));
      }
    }
    const { groups } = dedupeFeedItems(items);
    const kept = filterOutOfScope(groups, CTX).kept;
    const sourceById = new Map(FEED_SOURCES.map((s) => [s.id, s] as const));
    const plan = planNewsClusters({
      groups: kept,
      sourceById,
      index: { seen: new Map(), todayKeys: new Set() },
      todayCards: [],
    });
    const out = classifyClusters({
      fresh: plan.fresh,
      todayCards: [],
      ctx: { ...CTX, sourceById },
      groupOrder: orderOf(kept),
    });
    const multi = out.fresh.filter((c) => c.members.length > 1);
    for (const c of multi) {
      const labels = c.members.map((m) => label.get(m.key) ?? null);
      expect(labels[0]).not.toBeNull();
      expect(new Set(labels).size).toBe(1);
      expect(new Set(c.members.map((m) => m.item.lang === "ko")).size).toBe(1);
    }
    // 1단계 5묶음 + 엔티티 병합으로 맨유 1-1 토트넘 국내(인터풋볼 + 베스트일레븐 — 같은 스코어)가 더 합쳐졌다. 해외(BBC·Athletic + ESPN
    // 'held by Spurs')는 셋 다 스코어가 없어 합치지 않는다(D42 ⑤)
    expect(plan.fresh.length - out.fresh.length).toBe(1);
    expect(out.stats).toMatchObject({ merges: 1, merged: 1, conflicts: 0 });
  });
});
