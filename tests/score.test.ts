/**
 * M1-14 — 뉴스 점수화 + 상위 N 선별 (scripts/lib/score.ts, PRD FR-06·FR-105 — CLAUDE.md §9.2 필수: 점수화).
 *
 * 곱 인자(소스 weight · Tier · 키워드 · 클러스터 크기 · 최신성 · 범위) · 이적 창 배수(연결 지점, 기본 중립) · 클러스터 → 신호
 * (클러스터 최고 Tier·최대 weight — 카드 tier 아님, 매체 수, 소스 대회 ∪ 제목 대회, 수집 시각으로 낮춘 기사의 최신성 불신) ·
 * 결정적 선별(같은 점수는 입력 순서) · 실데이터 회귀(fixtures/cluster 창 안 198건 → 상위 45). 네트워크 없음.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  type FeedItem,
  type Source,
  type TransferWindowsFile,
} from "@/lib/schema";

import { clampedItemKey } from "../scripts/lib/collect-window";
import { dedupeFeedItems } from "../scripts/lib/dedup";
import { analyzeCluster } from "../scripts/lib/classify";
import {
  planNewsClusters,
  toCluster,
  type NewsCluster,
} from "../scripts/lib/news-cluster";
import { buildKeywordIndex } from "../scripts/lib/news-keywords";
import { buildTagIndex } from "../scripts/lib/tag-names";
import {
  DEFAULT_SCORE_WEIGHTS,
  DOMESTIC_QUOTA_DIVISOR,
  NEUTRAL_TRANSFER_BOOST,
  clusterSignals,
  clusterSizeFactor,
  domesticQuotaOf,
  hasScopeEvidence,
  planSlots,
  recencyFactor,
  scoreCluster,
  scoreSignals,
  selectTopScored,
  selectWithQuota,
  transferWindowBoost,
  type ClusterScoreContext,
  type ScoreSignals,
} from "../scripts/lib/score";

import { configSources } from "./support/fixture-sources";
import { namesWithExtras } from "./support/names-extras";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

const SOURCES = configSources();
const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s] as const));
const KEYWORDS = buildKeywordIndex({
  names: NamesKoFileSchema.parse(readJson("configs/names.ko.json")),
  koreanPlayers: KoreanPlayersFileSchema.parse(
    readJson("configs/korean-players.json"),
  ),
});

const NOW = "2026-10-10T21:30:00.000Z";
const H = 60 * 60 * 1000;
const hoursAgo = (h: number) => new Date(Date.parse(NOW) - h * H).toISOString();

let seq = 0;
function item(
  source: string,
  title: string,
  ageHours: number,
  over: Partial<FeedItem> = {},
): FeedItem {
  seq += 1;
  const lang = SOURCE_BY_ID.get(source)?.lang ?? "en";
  return {
    title,
    url: `https://example.com/${source}/${seq}`,
    publishedAt: hoursAgo(ageHours),
    summary: null,
    source,
    author: null,
    authors: [],
    lang,
    ...over,
  };
}

/** 항목들 → 한 클러스터(같은 사건) */
function clusterOf(...items: FeedItem[]) {
  return toCluster(dedupeFeedItems(items).groups, SOURCE_BY_ID);
}

const CTX: ClusterScoreContext = {
  now: NOW,
  sourceById: SOURCE_BY_ID,
  keywords: KEYWORDS,
};

/** 기준 신호 — BBC Football 1곳, 키워드 없음, 범위 근거(EPL) 있음, 방금 */
const BASE: ScoreSignals = {
  maxWeight: 3,
  bestTier: 2,
  publishers: 1,
  comps: ["EPL"],
  koreanPlayers: [],
  bigClubs: [],
  transfer: false,
  ageHours: 0,
  clamped: false,
};

describe("가중치 — 코드 상수 한 곳(FR-06 '값은 설정으로 조정')", () => {
  it("Tier 1이 가장 높고, 키워드 배수는 1보다 크고, 범위 근거 없음은 1보다 작다", () => {
    const w = DEFAULT_SCORE_WEIGHTS;
    expect(w.tier[1]).toBeGreaterThan(w.tier[2]);
    expect(w.tier[2]).toBeGreaterThan(w.tier[3]);
    for (const k of [w.korean, w.bigClub, w.ucl, w.transfer]) {
      expect(k).toBeGreaterThan(1);
    }
    expect(w.korean).toBeGreaterThan(w.bigClub); // 한국 선수 기사가 가장 크게 오른다
    expect(w.noScope).toBeLessThan(1);
    expect(Object.isFrozen(w)).toBe(true);
    expect(NEUTRAL_TRANSFER_BOOST).toBe(1);
  });
});

describe("곱 인자", () => {
  it("클러스터 크기: 1곳 = 1, 1곳마다 +0.5, 상한 3", () => {
    expect([0, 1, 2, 3, 5, 6, 20].map((n) => clusterSizeFactor(n))).toEqual([
      1, 1, 1.5, 2, 3, 3, 3,
    ]);
  });

  it("최신성: 반감기 24시간 — 0시간 1, 24시간 0.5, 48시간 0.25, 허용 오차 안 미래(음수)는 1", () => {
    expect(recencyFactor(0)).toBe(1);
    expect(recencyFactor(24)).toBeCloseTo(0.5, 10);
    expect(recencyFactor(48)).toBeCloseTo(0.25, 10);
    expect(recencyFactor(-0.05)).toBe(1);
    expect(recencyFactor(12)).toBeGreaterThan(recencyFactor(13));
  });

  it("범위 근거 = 대회 근거 · 빅클럽 · 등록 한국 선수 중 하나", () => {
    const none = { comps: [], bigClubs: [], koreanPlayers: [] };
    expect(hasScopeEvidence(none)).toBe(false);
    expect(hasScopeEvidence({ ...none, comps: ["LALIGA"] })).toBe(true);
    expect(hasScopeEvidence({ ...none, bigClubs: ["arsenal"] })).toBe(true);
    expect(hasScopeEvidence({ ...none, koreanPlayers: ["lee-kang-in"] })).toBe(
      true,
    );
  });

  it("점수 = weight × Tier × 키워드 × 클러스터 × 최신성 × 범위(인자 곱과 같다)", () => {
    const s = scoreSignals({
      ...BASE,
      maxWeight: 1.5,
      bestTier: 3,
      publishers: 3,
      koreanPlayers: ["kim-min-jae"],
      bigClubs: ["bayern-munchen"],
      comps: ["BUNDESLIGA", "UCL"],
      transfer: true,
      ageHours: 12,
    });
    const w = DEFAULT_SCORE_WEIGHTS;
    expect(s.factors).toEqual({
      weight: 1.5,
      tier: w.tier[3],
      keywords: w.korean * w.bigClub * w.ucl * w.transfer,
      cluster: 2,
      recency: recencyFactor(12),
      scope: 1,
    });
    const f = s.factors;
    expect(s.score).toBeCloseTo(
      f.weight * f.tier * f.keywords * f.cluster * f.recency * f.scope,
      12,
    );
  });

  it("키워드는 항목당 한 번 — 빅클럽 2곳·선수 2명이어도 배수는 하나", () => {
    const one = scoreSignals({ ...BASE, bigClubs: ["arsenal"] });
    const two = scoreSignals({ ...BASE, bigClubs: ["arsenal", "chelsea"] });
    expect(two.score).toBe(one.score);
  });

  it("Tier가 높을수록(숫자가 작을수록) 점수가 높다 — 다른 신호가 같으면", () => {
    const [t1, t2, t3] = ([1, 2, 3] as const).map(
      (bestTier) => scoreSignals({ ...BASE, bestTier }).score,
    );
    expect(t1).toBeGreaterThan(t2!);
    expect(t2).toBeGreaterThan(t3!);
  });

  it("범위 근거가 없으면 noScope 배수 — 하부 리그·다른 리그 기사가 근거 없이 위로 오지 않는다(제외는 하지 않는다)", () => {
    const inScope = scoreSignals(BASE);
    const out = scoreSignals({ ...BASE, comps: [] });
    expect(out.factors.scope).toBe(DEFAULT_SCORE_WEIGHTS.noScope);
    expect(out.score).toBeCloseTo(
      inScope.score * DEFAULT_SCORE_WEIGHTS.noScope,
      12,
    );
    expect(out.score).toBeGreaterThan(0);
  });

  it("weight 0 소스는 점수 0(맨 뒤)", () => {
    expect(scoreSignals({ ...BASE, maxWeight: 0 }).score).toBe(0);
  });

  it("가중치는 주입할 수 있다(코드 상수 기본값)", () => {
    const flat = {
      ...DEFAULT_SCORE_WEIGHTS,
      korean: 1,
      bigClub: 1,
      ucl: 1,
      transfer: 1,
    };
    const kr = { ...BASE, koreanPlayers: ["lee-kang-in"] };
    expect(scoreSignals(kr, { weights: flat }).score).toBe(
      scoreSignals(BASE, { weights: flat }).score,
    );
    expect(scoreSignals(kr).score).toBeGreaterThan(scoreSignals(BASE).score);
  });
});

describe("이적 창 배수 (FR-105 연결 지점 — 기본 중립)", () => {
  const FILE: Pick<TransferWindowsFile, "boost" | "windows"> = {
    boost: 1.5,
    windows: [
      {
        comp: "EPL",
        season: 2026,
        kind: "winter",
        opensAt: "2027-01-01T00:00:00.000Z",
        closesAt: "2027-02-02T23:00:00.000Z",
      },
    ],
  };

  it("설정 파일이 없으면(null) 중립 1, 창 안 [opensAt, closesAt)이면 boost", () => {
    expect(transferWindowBoost("2027-01-15T00:00:00.000Z", null)).toBe(1);
    expect(transferWindowBoost("2027-01-15T00:00:00.000Z", FILE)).toBe(1.5);
    expect(transferWindowBoost("2027-01-01T00:00:00.000Z", FILE)).toBe(1.5);
    expect(transferWindowBoost("2027-02-02T23:00:00.000Z", FILE)).toBe(1);
    expect(transferWindowBoost("2026-12-31T23:59:59.000Z", FILE)).toBe(1);
  });

  it("배수는 이적 화제 기사에만 — 기본(중립)은 점수를 바꾸지 않는다", () => {
    const transfer = { ...BASE, transfer: true };
    expect(scoreSignals(transfer).score).toBe(
      scoreSignals(transfer, { transferBoost: NEUTRAL_TRANSFER_BOOST }).score,
    );
    expect(scoreSignals(transfer, { transferBoost: 1.5 }).score).toBeCloseTo(
      scoreSignals(transfer).score * 1.5,
      12,
    );
    expect(scoreSignals(BASE, { transferBoost: 1.5 }).score).toBe(
      scoreSignals(BASE).score,
    );
  });
});

describe("클러스터 → 신호 (M1-12·M1-13 입력)", () => {
  it("weight·Tier는 클러스터 최대·최고(카드 대표 소스 값이 아니다), 매체 수는 매체명 기준, 대회는 소스 ∪ 제목", () => {
    // 인터풋볼 전체기사(1, Tier 3) 대표 + 인터풋볼 해외축구(1.5 — 같은 매체) + BBC European(2.5, Tier 2, 4개 리그)
    const cluster = clusterOf(
      item("interfootball-all", "이강인, 챔스 데뷔", 2),
      item("interfootball-world", "이강인, 챔피언스리그 데뷔전", 3),
      item("bbc-sport-european", "Lee Kang-in makes debut", 4),
    );
    const s = clusterSignals(cluster, CTX);
    expect(s).toMatchObject({
      maxWeight: 2.5,
      bestTier: 2,
      publishers: 2, // 인터풋볼 · BBC Sport
      koreanPlayers: ["lee-kang-in"],
      transfer: false,
      clamped: false,
    });
    expect(s.comps).toEqual([
      "LALIGA",
      "SERIEA",
      "BUNDESLIGA",
      "LIGUE1",
      "UCL",
    ]);
    expect(s.ageHours).toBeCloseTo(2, 10); // 가장 최근 구성 기사
  });

  it("수집 시각으로 낮춘 기사는 최신성을 믿지 않는다 — 모두 낮췄으면 clampedAgeHours, 섞였으면 min(믿을 수 있는 나이, clampedAgeHours)", () => {
    const clamped = item("bbc-sport-football", "Arsenal beat Leeds", 0); // 발행 시각 = 실행 시작(낮춘 값)
    const isClamped = (i: FeedItem) =>
      clampedItemKey(i) === clampedItemKey(clamped);
    const ctx = { ...CTX, isClamped };
    const only = clusterSignals(clusterOf(clamped), ctx);
    expect(only).toMatchObject({
      clamped: true,
      ageHours: DEFAULT_SCORE_WEIGHTS.clampedAgeHours,
    });
    const mixed = clusterSignals(
      clusterOf(
        clamped,
        item("the-athletic-football", "Arsenal beat Leeds 2-1", 5),
      ),
      ctx,
    );
    expect(mixed.clamped).toBe(false);
    expect(mixed.ageHours).toBeCloseTo(5, 10);
    // 믿을 수 있는 기사가 낮춘 기사의 가정 나이(12시간)보다 오래됐으면 12시간
    const older = clusterSignals(
      clusterOf(
        clamped,
        item("the-athletic-football", "Arsenal beat Leeds 2-1", 20),
      ),
      ctx,
    );
    expect(older).toMatchObject({
      clamped: true,
      ageHours: DEFAULT_SCORE_WEIGHTS.clampedAgeHours,
    });
  });

  it("낮춘 기사가 최신순 맨 위를 차지하지 않는다 — 3시간 전 기사가 '방금'으로 낮춘 기사보다 위(M1-02·M1-10 이월)", () => {
    const clamped = item("bbc-sport-football", "Arsenal beat Leeds", 0);
    const real = item("bbc-sport-football", "Chelsea beat Fulham", 3);
    const ctx = {
      ...CTX,
      isClamped: (i: FeedItem) => i.url === clamped.url,
    };
    const ranked = selectTopScored(
      [clusterOf(clamped), clusterOf(real)],
      (c) => scoreCluster(c, ctx),
      2,
    );
    expect(ranked.map((r) => r.entry.members[0]!.item.title)).toEqual([
      "Chelsea beat Fulham",
      "Arsenal beat Leeds",
    ]);
    // 낮춘 표시가 없으면(이전 동작) 낮춘 기사가 위였다
    const naive = selectTopScored(
      [clusterOf(clamped), clusterOf(real)],
      (c) => scoreCluster(c, CTX),
      2,
    );
    expect(naive[0]!.entry.members[0]!.item.title).toBe("Arsenal beat Leeds");
  });

  it("대표 소스가 설정에 없으면 weight 0 → 점수 0", () => {
    const lost = item("no-such-source", "Arsenal sign striker", 1);
    expect(scoreCluster(clusterOf(lost), CTX).score).toBe(0);
  });

  it("보도 매체가 많을수록 위 — 같은 제목·시각이면 3곳 > 1곳", () => {
    const one = clusterOf(item("bbc-sport-football", "Wolves sack manager", 2));
    const three = clusterOf(
      item("bbc-sport-football", "Wolves sack manager", 2),
      item("the-athletic-football", "Wolves sack manager", 2),
      item("daily-briefing", "Wolves sack manager", 2),
    );
    expect(scoreCluster(three, CTX).score).toBeGreaterThan(
      scoreCluster(one, CTX).score * 1.9,
    );
  });
});

describe("selectTopScored — 결정적 선별", () => {
  const score = (n: number) => scoreSignals({ ...BASE, maxWeight: n });

  it("점수 내림차순, 같은 점수는 입력 순서, limit 0 이하는 [], limit이 크면 전부", () => {
    const entries = ["a", "b", "c", "d"];
    const weightOf: Record<string, number> = { a: 1, b: 2, c: 1, d: 3 };
    const ids = (limit: number) =>
      selectTopScored(entries, (e) => score(weightOf[e]!), limit).map(
        (r) => r.entry,
      );
    expect(ids(10)).toEqual(["d", "b", "a", "c"]);
    expect(ids(2)).toEqual(["d", "b"]);
    expect(ids(0)).toEqual([]);
    expect(ids(-1)).toEqual([]);
  });
});

describe("그날 파일 기준 자리 · 국내 최소 몫 (PRD §15 D44)", () => {
  it("하루 국내 몫 = floor(상한 / 3) — 45면 15", () => {
    expect(DOMESTIC_QUOTA_DIVISOR).toBe(3);
    expect([45, 40, 15, 5, 2, 0, -1].map(domesticQuotaOf)).toEqual([
      15, 13, 5, 1, 0, 0, 0,
    ]);
  });

  it("새 자리 = max(0, 상한 − 기존 카드), 국내 몫 = min(자리, 하루 몫 − 기존 국내 카드) — 재실행은 모자란 만큼만", () => {
    const plan = (
      limit: number,
      existingCards: number,
      existingDomestic: number,
    ) => planSlots({ limit, existingCards, existingDomestic });
    expect(plan(45, 0, 0)).toEqual({ slots: 45, domesticQuota: 15 });
    expect(plan(45, 40, 0)).toEqual({ slots: 5, domesticQuota: 5 });
    expect(plan(45, 40, 12)).toEqual({ slots: 5, domesticQuota: 3 });
    expect(plan(45, 40, 15)).toEqual({ slots: 5, domesticQuota: 0 });
    expect(plan(45, 20, 20)).toEqual({ slots: 25, domesticQuota: 0 });
    expect(plan(45, 50, 0)).toEqual({ slots: 0, domesticQuota: 0 });
    expect(plan(5, 0, 0)).toEqual({ slots: 5, domesticQuota: 1 });
  });

  /** 점수·국내 여부만 있는 후보(점수 내림차순) */
  const ranked = (spec: ReadonlyArray<[string, number, boolean]>) =>
    spec.map(([id, n, ko]) => ({
      entry: { id, ko },
      score: scoreSignals({ ...BASE, maxWeight: n }),
    }));
  const pick = (
    list: ReturnType<typeof ranked>,
    slots: number,
    quota: number,
  ) => {
    const r = selectWithQuota(list, {
      slots,
      quota,
      inQuota: (e) => e.ko,
    });
    return { ids: r.selected.map((x) => x.entry.id), byQuota: r.byQuota };
  };
  const LIST = ranked([
    ["en1", 9, false],
    ["en2", 8, false],
    ["ko1", 7, true],
    ["en3", 6, false],
    ["en4", 5, false],
    ["ko2", 4, true],
    ["ko3", 3, true],
  ]);

  it("몫 대상 상위를 먼저 자리에 넣고 나머지는 점수 순 — 결과는 점수 순서 그대로", () => {
    expect(pick(LIST, 4, 3)).toEqual({
      ids: ["en1", "ko1", "ko2", "ko3"],
      byQuota: 2,
    });
    expect(pick(LIST, 4, 1)).toEqual({
      ids: ["en1", "en2", "ko1", "en3"],
      byQuota: 0,
    });
    expect(pick(LIST, 4, 0)).toEqual({
      ids: ["en1", "en2", "ko1", "en3"],
      byQuota: 0,
    });
  });

  it("몫 대상이 모자라면 나머지로 채운다, 몫은 자리를 넘지 않는다, 자리 0이면 []", () => {
    const fewKo = ranked([
      ["en1", 9, false],
      ["ko1", 2, true],
      ["en2", 8, false],
      ["en3", 7, false],
    ]).sort((a, b) => b.score.score - a.score.score);
    expect(pick(fewKo, 3, 3)).toEqual({
      ids: ["en1", "en2", "ko1"],
      byQuota: 1,
    });
    expect(pick(LIST, 2, 5)).toEqual({ ids: ["ko1", "ko2"], byQuota: 2 }); // 순수 점수 순 2위 안에는 국내가 없다
    expect(pick(LIST, 0, 3)).toEqual({ ids: [], byQuota: 0 });
    expect(pick(LIST, 20, 2).ids).toHaveLength(LIST.length);
  });
});

describe("실데이터 회귀 — fixtures/cluster 창 안 198건(2026-10-15 수집) → 상위 45", () => {
  const fx = readJson("fixtures/cluster/titles-2026-10-15.json") as {
    collectedAt: string;
    items: Array<{
      id: string;
      sample: string;
      source: string;
      lang: string;
      publishedAt: string;
      title: string;
    }>;
  };
  const order = new Map(SOURCES.map((s, i) => [s.id, i] as const));
  const items: FeedItem[] = fx.items
    .filter((i) => i.sample === "window")
    .map((i) => ({
      title: i.title,
      url: `https://example.com/${i.id}`,
      publishedAt: i.publishedAt,
      summary: null,
      source: i.source,
      author: null,
      authors: [],
      lang: i.lang,
    }))
    .sort((a, b) => order.get(a.source)! - order.get(b.source)!);
  const plan = planNewsClusters({
    groups: dedupeFeedItems(items).groups,
    sourceById: SOURCE_BY_ID as ReadonlyMap<string, Source>,
    index: { seen: new Map(), todayKeys: new Set() },
    todayCards: [],
  });
  const ctx = { ...CTX, now: fx.collectedAt };
  const ranked = selectTopScored(
    plan.fresh,
    (c) => scoreCluster(c, ctx),
    plan.fresh.length,
  );
  const idsOf = (list: typeof ranked) =>
    list.flatMap((r) =>
      r.entry.members.map((m) => m.item.url.split("/").pop()!),
    );
  const top = ranked.slice(0, 45);
  const topIds = new Set(idsOf(top));

  it("후보 190 클러스터, 결정적(두 번 계산해도 같은 순서)", () => {
    expect(plan.fresh).toHaveLength(190);
    const again = selectTopScored(plan.fresh, (c) => scoreCluster(c, ctx), 45);
    expect(idsOf(again)).toEqual(idsOf(top));
  });

  it("상위 10에 등록 한국 선수 기사(이강인·김민재 — 국내 매체)가 들고, 국내 카드는 45건 중 10건 이상", () => {
    const top10 = new Set(idsOf(ranked.slice(0, 10)));
    for (const id of ["t084", "t088", "t093"]) expect(top10.has(id)).toBe(true);
    const ko = top.filter((r) => r.entry.members[0]!.item.lang === "ko");
    expect(ko.length).toBeGreaterThanOrEqual(10);
  });

  it("범위 근거 없는 기사는 45건 중 10건 이하, K리그·연예 기사는 상위 45 밖(제외는 M1-17 — 여기서는 감점만)", () => {
    expect(
      top.filter((r) => r.score.factors.scope < 1).length,
    ).toBeLessThanOrEqual(10);
    // K리그(시상·경기 전망)·연예(콘서트·결혼·영화제)
    for (const id of [
      "t110",
      "t133",
      "t135",
      "t169",
      "t176",
      "t100",
      "t103",
      "t109",
      "t116",
    ]) {
      expect(topIds.has(id)).toBe(false);
    }
  });

  it("빅클럽 UCL 밤 경기 기사(BBC)는 상위 45 안, 하루 넘은 범위 밖 기사는 밖", () => {
    for (const id of ["t007", "t011", "t013", "t015", "t017", "t019"]) {
      expect(topIds.has(id)).toBe(true);
    }
    for (const id of ["t044", "t047", "t050"])
      expect(topIds.has(id)).toBe(false); // 38~49시간 전 · 범위 밖
  });
});

// ─── M1-17: 팀 → 리그 범위 근거 (extraComps) ─────────────────────────────────

describe("M1-17 — 제목 팀·등록 한국 선수의 리그가 범위 근거(extraComps, classify.ts 분석 leagues)", () => {
  const names = namesWithExtras(
    NamesKoFileSchema.parse(readJson("configs/names.ko.json")),
  );
  const players = KoreanPlayersFileSchema.parse(
    readJson("configs/korean-players.json"),
  );
  const classifyCtx = {
    keywords: buildKeywordIndex({ names, koreanPlayers: players }),
    tags: buildTagIndex({ names, koreanPlayers: players }),
    sourceById: SOURCE_BY_ID,
  };
  const withLeagues: ClusterScoreContext = {
    ...CTX,
    keywords: classifyCtx.keywords,
    extraComps: (cluster) =>
      analyzeCluster(cluster as NewsCluster, classifyCtx).leagues,
  };

  it("BBC Football(대회 없음)의 빅클럽 밖 EPL 기사는 팀 리그로 범위 감점에서 풀린다 — 5대 리그 밖 팀(Wolves·Rangers)은 그대로 감점", () => {
    const villa = clusterOf(
      item(
        "bbc-sport-football",
        "Jackson steps up again as Aston Villa revival continues",
        1,
      ),
    );
    const before = scoreCluster(villa, CTX);
    const after = scoreCluster(villa, withLeagues);
    expect(before.factors.scope).toBe(DEFAULT_SCORE_WEIGHTS.noScope);
    expect(after.factors.scope).toBe(1);
    expect(after.signals.comps).toEqual(["EPL"]);
    // 2026-27 시즌 5대 리그 밖(team-leagues.ts — Wolves는 순위표에 없다)
    const wolves = clusterOf(
      item(
        "bbc-sport-football",
        "Wolves striker Jimenez to have knee surgery",
        1,
      ),
    );
    expect(scoreCluster(wolves, withLeagues).factors.scope).toBe(
      DEFAULT_SCORE_WEIGHTS.noScope,
    );
    const rangers = clusterOf(
      item(
        "bbc-sport-football",
        "'Reminds me of Muller' - Naderi proving worth in Rangers revival",
        1,
      ),
    );
    expect(scoreCluster(rangers, withLeagues).factors.scope).toBe(
      DEFAULT_SCORE_WEIGHTS.noScope,
    );
  });

  it("extraComps가 없으면 M1-14 동작 그대로(소스 대회 ∪ 제목 대회 표현)", () => {
    const c = clusterOf(
      item("bbc-sport-football", "Brentford extend unbeaten start", 1),
    );
    expect(scoreCluster(c, CTX).signals.comps).toEqual([]);
    expect(scoreCluster(c, withLeagues).signals.comps).toEqual(["EPL"]);
  });
});
