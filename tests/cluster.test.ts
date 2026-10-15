/**
 * M1-13 — 제목 유사도 클러스터링 (PRD FR-05 "일일 중복 카드 0건(샘플 검수)", CLAUDE.md §9.2 필수: 클러스터링).
 *
 * 순수 함수(scripts/lib/cluster.ts): 특징 추출(스코어 통일·머리표·발음 기호·약칭·복수·어간·한글 2-gram·한자·고유명사 구) ·
 * 묶음·해설 제목 · 쌍 규칙(국내·해외 비교 안 함 — D30, 언어 간 하한, 시각 차 가산·상한, 같은 매체 12시간, 공유 특징 수) ·
 * 완전 연결(사슬 없음) · 고정 묶음(anchor) · 결정성.
 * 회귀 표본: fixtures/rss(M0-33 손 판정 12묶음)와 fixtures/cluster(실제 피드 제목 + 사람 판정) — 오탐 0(알려진 1쌍 제외)과
 * 재현 수를 그대로 단언한다. 하한을 바꾸면 이 숫자가 바뀌는 것을 보고 판정한다.
 * 네트워크 없음.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { FeedItem } from "@/lib/schema";

import {
  DEFAULT_CLUSTER_POLICY,
  clusterDocs,
  isRoundupTitle,
  scorePairs,
  scriptOf,
  titleFeatureWeights,
  titleFeatures,
  type ClusterDoc,
} from "../scripts/lib/cluster";
import { dedupeFeedItems } from "../scripts/lib/dedup";
import { prepareSourceItems } from "../scripts/lib/feed-collect";
import { publisherNameOf } from "../scripts/lib/news-file";
import { parseFeedXml } from "../scripts/lib/rss";
import { urlHash } from "../scripts/lib/url-normalize";

import { configSources } from "./support/fixture-sources";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const SOURCES = configSources();
const PUBLISHER = new Map(SOURCES.map((s) => [s.id, publisherNameOf(s)]));

const H = 60 * 60 * 1000;
const T0 = Date.parse("2026-10-10T20:00:00.000Z");
const at = (hours: number) => new Date(T0 + hours * H).toISOString();
const doc = (
  title: string,
  lang = "en",
  hours = 0,
  more: Partial<ClusterDoc> = {},
): ClusterDoc => ({ title, lang, publishedAt: at(hours), ...more });

/** 클러스터 결과를 제목으로(묶음이 둘 이상인 것만) */
const multiTitles = (docs: readonly ClusterDoc[], clusters: number[][]) =>
  clusters.filter((c) => c.length > 1).map((c) => c.map((k) => docs[k]!.title));

// ─── 특징 ────────────────────────────────────────────────────────────────

describe("titleFeatures — 제목 특징", () => {
  it("스코어는 작은 수-큰 수 하나로(주어 팀 순서 무관), 한글이 붙어도 스코어 — 연도·인원·소수·분수는 스코어가 아니다", () => {
    expect(
      titleFeatures("[UCL REVIEW] 맨시티, PSG에 2-4 참패", "ko"),
    ).toContain("score:2-4");
    expect(titleFeatures("PSG, 맨시티에 4-2 승리", "ko")).toContain(
      "score:2-4",
    );
    expect(titleFeatures("Real Madrid 4–3 Roma", "en")).toContain("score:3-4");
    const none = titleFeatures(
      "2026-27 season: 10-man Spurs, U-21 side, 8.4초 1/10",
      "en",
    );
    expect(none.filter((f) => f.startsWith("score:"))).toEqual([]);
  });

  it("대괄호 머리표는 지운다 — 형식 표시([PL REVIEW]·[오피셜])가 서로 다른 기사를 잇지 않게", () => {
    expect(titleFeatures("[UCL REVIEW] 맨시티 참패", "ko")).toEqual([
      "맨시",
      "시티",
      "참패",
    ]);
    expect(titleFeatures("[오피셜] 클리말라 수상", "ko")).toEqual([
      "리말",
      "말라",
      "수상",
      "클리",
    ]);
  });

  it("라틴: 소문자·발음 기호 제거·약칭 통일·복수 s·앞 6글자 어간, 불용어(기능어·대회 이름·경기 일반어) 제거", () => {
    expect(
      titleFeatures(
        "Mbappé and Man Utd: Manchester United suspended scores",
        "en",
      ),
    ).toEqual(["man", "mbappe", "score", "suspen", "united"]);
    expect(titleFeatures("Kylian Mbappe suspension", "en")).toEqual([
      "kylian",
      "mbappe",
      "suspen",
    ]);
    expect(
      titleFeatures("Spurs and Barça in the Premier League", "en"),
    ).toEqual(["barcel", "totten"]);
    // 스페인어·이탈리아어 기능어도 뺀다
    expect(
      titleFeatures("Mourinho entierra el ruido sobre Mbappé", "es"),
    ).toEqual(["entier", "mbappe", "mourin", "ruido"]);
  });

  it("한글: 음절 2-gram(조사가 붙어도 이름 2-gram이 남는다), 한 음절·한자는 버린다", () => {
    expect(titleFeatures("‘韓 국가대표’ 부앙가에게 도움", "ko")).toEqual([
      "가대",
      "가에",
      "국가",
      "대표",
      "도움",
      "부앙",
      "앙가",
      "에게",
    ]);
    // 한국어 제목 안의 라틴 단어(LAFC)는 특징, 형식 약어(REVIEW·FC)는 아니다
    expect(titleFeatures("[MLS REVIEW] LAFC 손흥민 FC 무", "ko")).toEqual([
      "lafc",
      "손흥",
      "흥민",
    ]);
  });

  it("고유명사 구(대문자 시작 단어가 이어짐)는 단어마다 1/√k — 두 단어 이름이 특징 둘로 부풀지 않게", () => {
    const w = titleFeatureWeights(
      "Diego Simeone's Atletico Madrid future",
      "en",
    );
    expect(w.get("diego")).toBeCloseTo(Math.SQRT1_2);
    expect(w.get("simeon")).toBeCloseTo(Math.SQRT1_2);
    expect(w.get("atleti")).toBeCloseTo(Math.SQRT1_2); // 's에서 구가 끊긴다
    expect(w.get("future")).toBe(1);
    // 한국어 제목은 구 판정을 하지 않는다
    expect(titleFeatureWeights("PSG LAFC 손흥민", "ko").get("psg")).toBe(1);
  });

  it("문자 묶음: ko만 한국어, 나머지(en·es·it)는 라틴", () => {
    expect(["ko", "KO", "en", "es", "it"].map(scriptOf)).toEqual([
      "ko",
      "ko",
      "latin",
      "latin",
      "latin",
    ]);
  });
});

describe("isRoundupTitle — 묶음·해설 기사는 합치지 않는다", () => {
  it.each([
    "🚨 Arsenal want attacker, Liverpool to replace flop, Chelsea target & more.",
    "AC Milan keen on Scott - Sunday's gossip",
    "Graham Scott Q&A: Ask ex-referee about the red card",
    "Champions League briefing: Man Utd in crisis",
    "Will this be Diego Simeone's last season at Atletico Madrid?",
    "What do American fans think about the scandal?",
    "¿Qué pasa con Vinícius?",
    "Perché il Milan ha perso",
    "Arsenal, Chelsea, Liverpool, Spurs all chasing striker",
  ])("묶음·해설: %s", (title) => {
    expect(isRoundupTitle(title, "en")).toBe(true);
  });

  it.each([
    "Arsenal 2 Leeds 1: Guimaraes clinches win. How did they do it?",
    "Real Madrid stun Roma after dramatic late comeback",
    "Comeback kings: Real Madrid, Roma and a wild night",
  ])("경기·소식 기사(질문이 뒤에 있음·쉼표 2개 이하): %s", (title) => {
    expect(isRoundupTitle(title, "en")).toBe(false);
  });

  it("한국어 제목은 판정하지 않는다", () => {
    expect(isRoundupTitle("왜 손흥민인가, 이유는, 셋, 넷", "ko")).toBe(false);
  });
});

// ─── 쌍 규칙 ─────────────────────────────────────────────────────────────

const HAALAND_EN = "Haaland double fires Manchester City past Brentford";
const HAALAND_EN2 = "Haaland scores twice as Man City beat Brentford";
const HAALAND_KO = "홀란드 멀티골 맨시티, 브렌트포드 3-1 격파";
const HAALAND_KO2 = "‘홀란 2골’ 맨시티, 브렌트포드에 3-1 승리";

describe("scorePairs·clusterDocs — 쌍 규칙", () => {
  it("같은 사건의 다른 매체 기사는 한 클러스터, 다른 소식은 따로", () => {
    const docs = [
      doc(HAALAND_EN, "en", 0, { publisher: "BBC Sport" }),
      doc(HAALAND_EN2, "en", 1, { publisher: "ESPN" }),
      doc("Chelsea sack manager after poor start", "en", -1),
      doc(HAALAND_KO, "ko", 2, { publisher: "인터풋볼" }),
      doc(HAALAND_KO2, "ko", 2.5, { publisher: "풋볼리스트" }),
      doc("손흥민 시즌 10호골 폭발 LAFC 2-0 승리", "ko", 1),
    ];
    expect(clusterDocs(docs)).toEqual([[0, 1], [2], [3, 4], [5]]);
  });

  it("국내(ko)·해외 기사는 비교하지 않는다 — 같은 스코어·이름이라도 합치지 않음(D30, 연결 줄은 M1-31)", () => {
    const docs = [
      doc("Haaland PSG 2-4 Man City Etihad", "en"),
      doc("Haaland PSG 2-4 Man City Etihad", "ko"),
    ];
    expect(scorePairs(docs)).toEqual([]);
    expect(clusterDocs(docs)).toEqual([[0], [1]]);
  });

  it("라틴 언어 사이(en↔es)는 더 높은 하한(latinCross) — 같은 언어는 latinSame", () => {
    const docs = [
      doc("Mourinho calls criticism of Mbappe 'ridiculous'", "en"),
      doc(
        "Mourinho entierra el ruido mediático sobre Mbappé: «Es ridículo»",
        "es",
      ),
      doc("Mourinho defends Mbappe again", "en"),
    ];
    const pairs = scorePairs(docs);
    expect(pairs.find((p) => p.i === 0 && p.j === 1)?.threshold).toBe(
      DEFAULT_CLUSTER_POLICY.latinCross,
    );
    expect(pairs.find((p) => p.i === 0 && p.j === 2)?.threshold).toBe(
      DEFAULT_CLUSTER_POLICY.latinSame,
    );
    // 동계어(ridiculous·ridículo)까지 겹친 같은 사건은 언어가 달라도 합쳐진다
    expect(pairs.find((p) => p.i === 0 && p.j === 1)?.shared).toEqual([
      "mbappe",
      "mourin",
      "ridicu",
    ]);
  });

  it("시각 차: 8시간까지 하한 그대로, 24시간까지 +0.1 선형, 48시간 넘으면 비교 안 함", () => {
    const base = DEFAULT_CLUSTER_POLICY.latinSame;
    const thresholdAt = (hours: number) =>
      scorePairs([doc(HAALAND_EN, "en", 0), doc(HAALAND_EN2, "en", hours)])[0]
        ?.threshold;
    expect(thresholdAt(8)).toBeCloseTo(base);
    expect(thresholdAt(16)).toBeCloseTo(base + 0.05);
    expect(thresholdAt(24)).toBeCloseTo(base + 0.1);
    expect(thresholdAt(48)).toBeCloseTo(base + 0.1);
    expect(thresholdAt(48.5)).toBeUndefined();
    // 1시간 차는 합쳐지고, 같은 쌍이 하루 벌어지면(하한 +0.1) 합쳐지지 않는다
    expect(clusterDocs([doc(HAALAND_EN), doc(HAALAND_EN2, "en", 1)])).toEqual([
      [0, 1],
    ]);
    expect(clusterDocs([doc(HAALAND_EN), doc(HAALAND_EN2, "en", 24)])).toEqual([
      [0],
      [1],
    ]);
  });

  it("같은 매체 두 기사는 12시간 안에서만 비교 — 다른 매체면 그대로 비교", () => {
    const pair = (hours: number, a: string, b: string) =>
      scorePairs([
        doc(HAALAND_KO, "ko", 0, { publisher: a }),
        doc(HAALAND_KO2, "ko", hours, { publisher: b }),
      ]);
    expect(pair(12, "인터풋볼", "인터풋볼")).toHaveLength(1);
    expect(pair(12.5, "인터풋볼", "인터풋볼")).toEqual([]);
    expect(pair(12.5, "인터풋볼", "풋볼리스트")).toHaveLength(1);
  });

  it("공유 특징 수 하한 — 이름 하나만 겹치면 유사도가 높아도 잇지 않는다(라틴 2·한국어 3)", () => {
    const latin = scorePairs([doc("Haaland injured"), doc("Haaland returns")]);
    expect(latin[0]).toMatchObject({ shared: ["haalan"], linked: false });
    expect(latin[0]!.similarity).toBeGreaterThan(
      DEFAULT_CLUSTER_POLICY.latinSame,
    );
    const ko = scorePairs([doc("손흥민 부상", "ko"), doc("손흥민 복귀", "ko")]);
    expect(ko[0]).toMatchObject({ shared: ["손흥", "흥민"], linked: false });
  });

  it("묶음·해설 제목은 같은 제목이어도 합치지 않는다", () => {
    const title = "🚨 Arsenal want attacker, Liverpool to replace flop & more.";
    expect(clusterDocs([doc(title), doc(title, "en", 1)])).toEqual([[0], [1]]);
  });
});

describe("clusterDocs — 완전 연결·고정 묶음·결정성", () => {
  it("사슬 효과 없음: A~B, B~C라도 A·C가 비슷하지 않으면 A·B·C를 한 클러스터로 만들지 않는다", () => {
    const docs = [
      doc("alpha bravo charlie delta"),
      doc("alpha bravo echo foxtrot"),
      doc("echo foxtrot golf hotel"),
    ];
    const pairs = scorePairs(docs);
    expect(pairs.map((p) => [p.i, p.j, p.linked])).toEqual([
      [0, 1, true],
      [1, 2, true],
    ]);
    // 유사도가 같으면 앞 번호 쌍 먼저 → {A,B}, C는 A와 비교되는 쌍이 없어 혼자
    expect(clusterDocs(docs)).toEqual([[0, 1], [2]]);
  });

  it("교차 쌍 하나라도 비교할 수 없으면(같은 매체 12시간 초과) 합치지 않는다", () => {
    const docs = [
      doc(HAALAND_KO, "ko", 0, { publisher: "인터풋볼" }),
      doc(HAALAND_KO2, "ko", 7, { publisher: "풋볼리스트" }),
      doc("홀란드 멀티골 맨시티, 브렌트포드 3-1 격파 후기", "ko", 13, {
        publisher: "인터풋볼",
      }),
    ];
    // 0·1과 1·2는 이을 수 있지만 0·2(같은 매체 13시간)는 비교하지 않는 쌍 → 셋을 한 클러스터로 만들지 않는다
    expect(
      clusterDocs(docs).every((c) => !(c.includes(0) && c.includes(2))),
    ).toBe(true);
  });

  it("고정 묶음(anchor)이 다른 두 문서는 같은 제목이어도 한 클러스터가 되지 않고, 새 문서는 한쪽에만 붙는다", () => {
    const docs = [
      doc(HAALAND_EN, "en", 0, { anchor: "c_0000000001" }),
      doc(HAALAND_EN, "en", 0, { anchor: "c_0000000002" }),
      doc(HAALAND_EN2, "en", 1),
    ];
    const clusters = clusterDocs(docs);
    expect(clusters).toHaveLength(2);
    expect(clusters.find((c) => c.includes(0))).not.toContain(1);
    expect(clusters.filter((c) => c.includes(2))).toHaveLength(1);
    // 고정 묶음이 하나뿐이거나 같으면 합쳐진다
    expect(
      clusterDocs([
        doc(HAALAND_EN, "en", 0, { anchor: "c_0000000001" }),
        doc(HAALAND_EN2),
      ]),
    ).toEqual([[0, 1]]);
  });

  it("결정적이다 — 같은 입력이면 같은 결과, 구성원·클러스터는 입력 번호 순", () => {
    const docs = [
      doc("Chelsea sack manager after poor start"),
      doc(HAALAND_EN2, "en", 1),
      doc(HAALAND_KO2, "ko", 2),
      doc(HAALAND_EN),
      doc(HAALAND_KO, "ko", 2),
    ];
    const first = clusterDocs(docs);
    expect(clusterDocs(docs)).toEqual(first);
    expect(first).toEqual([[0], [1, 3], [2, 4]]);
  });

  it("빈 입력·한 건", () => {
    expect(clusterDocs([])).toEqual([]);
    expect(clusterDocs([doc(HAALAND_EN)])).toEqual([[0]]);
  });
});

// ─── 회귀 표본 ───────────────────────────────────────────────────────────

/** fixtures/rss(M0-33) 전 항목 → 정규화 → 같은 URL 묶음 → 클러스터 문서 + 손 판정 태그 */
async function rssFixtureDocs() {
  const index = JSON.parse(read("fixtures/rss/index.json")) as {
    sources: Array<{
      id: string;
      items: Array<{ link: string; tags: string[] }>;
    }>;
  };
  const items: FeedItem[] = [];
  const label = new Map<string, string>();
  for (const s of index.sources) {
    const source = SOURCES.find((x) => x.id === s.id)!;
    const raws = await parseFeedXml(read(`fixtures/rss/${s.id}.xml`));
    items.push(
      ...prepareSourceItems(raws, { ...source, author: undefined }).items,
    );
    for (const it of s.items) {
      const tag = it.tags.find((t) => t.startsWith("cluster:"));
      if (tag) label.set(urlHash(it.link.trim()), tag.slice("cluster:".length));
    }
  }
  const { groups } = dedupeFeedItems(items);
  const docs: ClusterDoc[] = groups.map((g) => ({
    title: g.item.title,
    lang: g.item.lang,
    publishedAt: g.item.publishedAt,
    publisher: PUBLISHER.get(g.sources[0]!) ?? null,
  }));
  return { docs, labels: groups.map((g) => label.get(g.key) ?? null) };
}

// The Athletic 5건은 합성 제목·링크(D32·D42) — 손 판정 태그(mun-tot-result·arsenal-leeds가 BBC와 같은 사건)는 그대로 지킨다
describe("회귀 — fixtures/rss 손 판정 클러스터(M0-33)", () => {
  it("합쳐진 쌍은 모두 같은 손 판정 클러스터(오탐 0), 국내·해외는 합치지 않음, 같은 언어 안 7쌍 + 언어 간 1쌍을 합친다", async () => {
    const { docs, labels } = await rssFixtureDocs();
    expect(docs).toHaveLength(56);
    const clusters = clusterDocs(docs);
    const merged = clusters.filter((c) => c.length > 1);
    for (const c of merged) {
      const label = labels[c[0]!];
      expect(label).not.toBeNull();
      expect(c.every((k) => labels[k] === label)).toBe(true);
      expect(new Set(c.map((k) => scriptOf(docs[k]!.lang))).size).toBe(1);
    }
    expect(merged.map((c) => [labels[c[0]!], c.length]).sort()).toEqual([
      ["arsenal-leeds", 2],
      ["atletico-alaves", 3],
      ["augsburg-bayern", 3],
      ["mourinho-mbappe", 2],
      ["mun-tot-result", 2],
    ]);
  });
});

interface TitleSample {
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

describe("회귀 — fixtures/cluster 실제 피드 제목 표본(M1-13 튜닝)", () => {
  const sample = JSON.parse(
    read("fixtures/cluster/titles-2026-10-15.json"),
  ) as TitleSample;
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const okPairs = new Set<string>();
  for (const [a, b] of sample.labels.must) okPairs.add(key(a!, b!));
  for (const group of sample.labels.ok) {
    for (const a of group)
      for (const b of group) if (a !== b) okPairs.add(key(a, b));
  }
  const tolerated = new Set(
    sample.labels.tolerated.map(([a, b]) => key(a!, b!)),
  );

  function run(name: "window" | "older") {
    const items = sample.items.filter((i) => i.sample === name);
    const clusters = clusterDocs(
      items.map((i) => ({
        title: i.title,
        lang: i.lang,
        publishedAt: i.publishedAt,
        publisher: PUBLISHER.get(i.source) ?? null,
      })),
    );
    const merged = new Set<string>();
    for (const c of clusters) {
      for (const x of c)
        for (const y of c)
          if (x < y) merged.add(key(items[x]!.id, items[y]!.id));
    }
    const ids = new Set(items.map((i) => i.id));
    const must = sample.labels.must.filter(
      ([a, b]) => ids.has(a!) && ids.has(b!),
    );
    return {
      items,
      clusters,
      falsePairs: [...merged].filter((p) => !okPairs.has(p)),
      mustHit: must.filter(([a, b]) => merged.has(key(a!, b!))).length,
      mustTotal: must.length,
    };
  }

  it("표본 크기와 판정 id가 맞다", () => {
    const ids = new Set(sample.items.map((i) => i.id));
    expect(ids.size).toBe(sample.items.length);
    for (const pair of [
      ...sample.labels.must,
      ...sample.labels.ok,
      ...sample.labels.tolerated,
    ]) {
      for (const id of pair) expect(ids.has(id)).toBe(true);
    }
    // The Athletic은 넣지 않는다(PRD §15 D32 보관 금지), 링크도 없다
    expect(sample.items.some((i) => i.source === "the-athletic-football")).toBe(
      false,
    );
    expect(JSON.stringify(sample)).not.toMatch(/https?:\/\//);
  });

  it("window(51시간 창, 198건): 오탐 0 — 같은 사건 9쌍을 합치고 클러스터 6개(묶음 8건 감소)", () => {
    const r = run("window");
    expect(r.items).toHaveLength(198);
    expect(r.falsePairs).toEqual([]);
    expect([r.mustHit, r.mustTotal]).toEqual([9, 20]);
    expect(r.clusters.filter((c) => c.length > 1)).toHaveLength(6);
    expect(r.items.length - r.clusters.length).toBe(8);
  });

  it("older(51~400시간, 54건): 알려진 오탐 1쌍(같은 퇴장 사건의 다른 사람 반응)만", () => {
    const r = run("older");
    expect(r.items).toHaveLength(54);
    expect(r.falsePairs.filter((p) => !tolerated.has(p))).toEqual([]);
    expect(r.falsePairs).toHaveLength(1);
  });

  it("국내 3매체 같은 사건(클리말라 이달의 선수상)은 3건이 한 클러스터", () => {
    const r = run("window");
    const titles = multiTitles(
      r.items.map((i) => ({
        title: i.title,
        lang: i.lang,
        publishedAt: i.publishedAt,
      })),
      r.clusters,
    );
    const klimala = titles.find((c) => c.some((t) => t.includes("클리말라")));
    expect(klimala).toHaveLength(3);
  });
});
