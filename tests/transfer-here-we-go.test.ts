/**
 * M4-02 — FR-103 'Here we go' 키워드 → agreed 가중(Tier 1 출처면 더 높게) (PRD §5.10, D23·D52·D54).
 *
 *   ① 단계(이미 M1-18이 함 — 여기서 고정): 의문·부정·임박 없는 'here we go' 제목은 agreed 근거, official은 아님(D52 ① 2026-10-17 사용자
 *      확인 — 'Here we go! … joins …'도 agreed 상한). 대소문자·'!'·':'·꼬리 위치·국내 'HERE WE GO'·'히어 위 고'. 의문('Here we go?')·
 *      부정('Not here we go yet')·임박('here we go soon')은 rumor. 승격 조건(F10): Tier 1·2 단일 출처 agreed, Tier 3 단일 출처 negotiating,
 *      Tier 3 매체 2곳 agreed.
 *   ② 가중(M4-02 구현): 위 조건을 넘은 'here we go' 카드만 분석 `hereWeGo` → score.ts `hereWeGo` 배수(Tier 1 > Tier 2·3). 키워드만 든
 *      의문·부정·임박·Tier 3 단독·결렬 카드는 가중 없음.
 *   ③ 현재 피드에 없는 꼴(이탈리아어·스페인어 문장 속 'Here we go', 따옴표로 감싼 영어 'Here we go')은 문형을 넓히지 않는다(D54 — 실제
 *      피드 제목 중심, 2026-10-12~11-02 data/news·fixtures에 'here we go' 제목 0건) — 지금 동작을 고정해 둔다.
 * 사전은 configs/names.ko.json·korean-players.json, 소스는 configs/sources.json(꺼진 Tier 1 소스 caughtoffside-romano를 Tier 1 자리값으로 쓴다
 * — 분류는 설정의 Tier만 본다). 네트워크 없음.
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
  type Source,
} from "@/lib/schema";

import { analyzeItems, type ClassifyContext } from "../scripts/lib/classify";
import { dedupeFeedItems } from "../scripts/lib/dedup";
import { toCluster } from "../scripts/lib/news-cluster";
import { buildKeywordIndex } from "../scripts/lib/news-keywords";
import {
  DEFAULT_SCORE_WEIGHTS,
  clusterSignals,
  scoreSignals,
  type ScoreSignals,
} from "../scripts/lib/score";
import { buildTagIndex } from "../scripts/lib/tag-names";
import {
  HERE_WE_GO_EVIDENCE,
  hereWeGoBacked,
  type TransferEvidence,
} from "../scripts/lib/transfer-extract";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const NAMES = NamesKoFileSchema.parse(readJson("configs/names.ko.json"));
const PLAYERS = KoreanPlayersFileSchema.parse(
  readJson("configs/korean-players.json"),
);
const SOURCES = SourcesFileSchema.parse(readJson("configs/sources.json"));
const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s] as const));
const CTX: ClassifyContext = {
  keywords: buildKeywordIndex({ names: NAMES, koreanPlayers: PLAYERS }),
  tags: buildTagIndex({ names: NAMES, koreanPlayers: PLAYERS }),
  sourceById: SOURCE_BY_ID,
};

/** Tier별 자리값 소스 — 설정의 Tier를 확인해 둔다(설정이 바뀌면 이 테스트가 먼저 알린다) */
const TIER1 = "caughtoffside-romano";
const TIER2 = "bbc-sport-football";
const TIER2_OTHER = "the-athletic-football";
const ROMANO = "daily-briefing"; // Romano Substack — 활성 Tier 2
const KO_A = "interfootball-world";
const KO_B = "footballist-football";

/** 묶음들(제목·언어·소스) → 분석 */
function analyze(items: Array<[title: string, lang: string, source: string]>) {
  return analyzeItems(
    items.map(([title, lang, source], i) => ({
      title,
      lang,
      summary: null,
      sources: [source],
      publishedAt: `2026-10-17T0${i}:00:00Z`,
    })),
    CTX,
  );
}
const one = (title: string, lang: string, source: string) =>
  analyze([[title, lang, source]]);

describe("설정 전제", () => {
  it("자리값 소스의 Tier — Tier 1 1곳(꺼짐)·해외 Tier 2·국내 Tier 3", () => {
    expect(SOURCE_BY_ID.get(TIER1)?.tier).toBe(1);
    expect(SOURCE_BY_ID.get(TIER2)?.tier).toBe(2);
    expect(SOURCE_BY_ID.get(TIER2_OTHER)?.tier).toBe(2);
    expect(SOURCE_BY_ID.get(ROMANO)?.tier).toBe(2);
    expect(SOURCE_BY_ID.get(KO_A)?.tier).toBe(3);
    expect(SOURCE_BY_ID.get(KO_B)?.tier).toBe(3);
    // 활성(enabled && terms_checked) Tier 1 소스는 아직 없다 — Tier 1 가중은 코드로만 준비
    expect(
      SOURCES.filter(
        (s: Source) => s.enabled && s.terms_checked && s.tier === 1,
      ),
    ).toEqual([]);
  });
});

describe("① 단계 — 'here we go'는 agreed 근거(official 아님), 의문·부정·임박은 낮게", () => {
  const KANE_ARSENAL = { player: "harry-kane", to: "arsenal" };

  it.each([
    "Here we go! Harry Kane to Arsenal",
    "HERE WE GO! Harry Kane to Arsenal",
    "here we go: Harry Kane to Arsenal",
    "Harry Kane to Arsenal, here we go!",
    "Harry Kane to Arsenal, here we go - contract until 2030",
  ])("Tier 2 단일 출처 agreed + 가중: %s", (title) => {
    const a = one(title, "en", TIER2);
    expect(a.transfer).toEqual({ ...KANE_ARSENAL, status: "agreed", tier: 2 });
    expect(a.hereWeGo).toBe(true);
  });

  it("Romano Substack(the Daily Briefing, Tier 2) 꼬리 꼴도 같다", () => {
    const a = one("Harry Kane to Arsenal, here we go", "en", ROMANO);
    expect(a.transfer).toMatchObject({ status: "agreed", tier: 2 });
    expect(a.hereWeGo).toBe(true);
  });

  it("'Here we go! … joins …'(official 문형)도 agreed 상한 — Tier 1이어도 official이 아니다(D52 ①)", () => {
    for (const source of [TIER2, TIER1]) {
      const a = one("Here we go! Harry Kane joins Arsenal", "en", source);
      expect(a.transfer?.status, source).toBe("agreed");
      expect(a.hereWeGo, source).toBe(true);
    }
    // 매체 2곳이어도 그 제목들은 agreed 상한
    const two = analyze([
      ["Here we go! Harry Kane joins Arsenal", "en", TIER2],
      ["Here we go! Harry Kane joins Arsenal", "en", TIER2_OTHER],
    ]);
    expect(two.transfer?.status).toBe("agreed");
    expect(two.hereWeGo).toBe(true);
  });

  it("Tier 1 단일 출처 = agreed + 가중(카드 tier 1)", () => {
    const a = one("Here we go! Harry Kane to Arsenal", "en", TIER1);
    expect(a.transfer).toEqual({ ...KANE_ARSENAL, status: "agreed", tier: 1 });
    expect(a.hereWeGo).toBe(true);
  });

  it("국내 Tier 3 1곳이 옮긴 'HERE WE GO'·'히어 위 고'는 negotiating(승격 조건 미달) — 가중 없음, 매체 2곳이면 agreed + 가중", () => {
    for (const title of [
      "'HERE WE GO' 김민재, 아스널 이적 확정",
      "'히어 위 고' 김민재, 아스널 이적 확정",
    ]) {
      const a = one(title, "ko", KO_A);
      expect(a.transfer, title).toEqual({
        player: "kim-min-jae",
        to: "arsenal",
        status: "negotiating",
        tier: 3,
      });
      expect(a.hereWeGo, title).toBeUndefined();
    }
    const two = analyze([
      ["'HERE WE GO' 김민재, 아스널 이적 확정", "ko", KO_A],
      ["'HERE WE GO' 김민재, 아스널 이적 확정", "ko", KO_B],
    ]);
    expect(two.transfer).toMatchObject({ status: "agreed", tier: 3 });
    expect(two.hereWeGo).toBe(true);
  });

  it.each([
    ["Here we go? Harry Kane to Arsenal", "en"],
    ["HERE WE GO? Harry Kane to Arsenal", "en"],
    ["Not here we go yet: Harry Kane to Arsenal", "en"],
    ["Harry Kane to Arsenal: here we go soon", "en"],
    ["'HERE WE GO?' 김민재, 아스널 이적 확정", "ko"],
  ])("의문·부정·임박은 rumor — Tier 1이어도 가중 없음: %s", (title, lang) => {
    for (const source of [lang === "ko" ? KO_A : TIER2, TIER1]) {
      const a = one(title, lang, source);
      expect(a.transfer?.status, `${source} ← ${title}`).toBe("rumor");
      expect(a.hereWeGo, `${source} ← ${title}`).toBeUndefined();
    }
  });

  it("다른 절에서 부정된 'here we go'는 다른 절의 합의 꼴과 합쳐 agreed가 되지 않는다", () => {
    const a = one(
      "Not here we go yet, but Harry Kane agrees personal terms with Arsenal",
      "en",
      TIER1,
    );
    expect(a.transfer?.status ?? null).not.toBe("agreed");
    expect(a.hereWeGo).toBeUndefined();
  });

  it("③ 지금 피드에 없는 꼴은 넓히지 않는다(D54) — 이탈리아어·스페인어 문장 속 'Here we go'는 rumor, 따옴표로 감싼 영어는 생략", () => {
    expect(
      one("Here we go! Harry Kane all'Arsenal", "it", "di-marzio").transfer,
    ).toMatchObject({ status: "rumor" });
    expect(
      one("Here we go! Harry Kane al Arsenal", "es", "relevo").transfer,
    ).toMatchObject({ status: "rumor" });
    // 스페인어 'ficha por'는 문형(official) → 'here we go' 상한으로 agreed
    const es = one(
      "Here we go! Harry Kane ficha por el Arsenal",
      "es",
      "relevo",
    );
    expect(es.transfer).toMatchObject({ status: "agreed", to: "arsenal" });
    expect(es.hereWeGo).toBe(true);
    expect(
      one("'Here we go' Harry Kane to Arsenal", "en", TIER2).transfer,
    ).toBeUndefined();
  });

  it("'here we go'가 없는 agreed 카드는 가중 대상이 아니다", () => {
    const a = one("Harry Kane completes medical at Arsenal", "en", TIER1);
    expect(a.transfer?.status).toBe("agreed");
    expect(a.hereWeGo).toBeUndefined();
  });
});

describe("hereWeGoBacked — 카드 단계·승격 조건", () => {
  const ev = (
    over: Partial<TransferEvidence> & {
      status?: TransferEvidence["claim"]["status"];
      hwg?: boolean;
      player?: string;
    } = {},
  ): TransferEvidence => ({
    claim: {
      player: over.player ?? "harry-kane",
      status: over.status ?? "agreed",
      to: "arsenal",
      evidence: over.hwg === false ? [] : [HERE_WE_GO_EVIDENCE],
    },
    publishers: over.publishers ?? ["BBC Sport"],
    tier: over.tier ?? 2,
    atMs: 0,
  });
  const card = (
    status: "agreed" | "official" | "negotiating" | "collapsed",
  ) => ({
    player: "harry-kane",
    status,
  });

  it("카드 단계가 agreed·official이고 'here we go' 주장이 Tier 2 이상 또는 매체 2곳", () => {
    expect(hereWeGoBacked([ev()], card("agreed"))).toBe(true);
    expect(hereWeGoBacked([ev({ tier: 1 })], card("official"))).toBe(true);
    expect(hereWeGoBacked([ev({ tier: 3 })], card("agreed"))).toBe(false);
    expect(
      hereWeGoBacked(
        [
          ev({ tier: 3, publishers: ["인터풋볼"] }),
          ev({ tier: 3, publishers: ["풋볼리스트"] }),
        ],
        card("agreed"),
      ),
    ).toBe(true);
  });

  it("카드가 negotiating·collapsed거나 없으면, 또는 'here we go' 주장이 아니면 아님", () => {
    expect(hereWeGoBacked([ev()], card("negotiating"))).toBe(false);
    expect(hereWeGoBacked([ev()], card("collapsed"))).toBe(false);
    expect(hereWeGoBacked([ev()], null)).toBe(false);
    expect(hereWeGoBacked([ev({ hwg: false })], card("agreed"))).toBe(false);
    expect(hereWeGoBacked([ev({ status: "rumor" })], card("agreed"))).toBe(
      false,
    );
    expect(
      hereWeGoBacked([ev({ player: "bukayo-saka" })], card("agreed")),
    ).toBe(false);
  });
});

describe("② 점수 가중 — score.ts `hereWeGo`(Tier 1이 더 높게)", () => {
  const BASE: ScoreSignals = {
    maxWeight: 3,
    bestTier: 2,
    publishers: 1,
    comps: ["EPL"],
    koreanPlayers: [],
    bigClubs: ["arsenal"],
    transfer: true,
    ageHours: 0,
    clamped: false,
  };

  it("가중 없음이 기본 — 키가 없거나 false면 이전 점수 그대로", () => {
    const base = scoreSignals(BASE).score;
    expect(scoreSignals({ ...BASE, hereWeGo: false }).score).toBe(base);
  });

  it("배수 = hereWeGo[bestTier], 키워드 인자에 곱한다 · Tier 1 > Tier 2 = Tier 3", () => {
    const w = DEFAULT_SCORE_WEIGHTS.hereWeGo;
    expect(w[1]).toBeGreaterThan(w[2]);
    expect(w[2]).toBeGreaterThan(1);
    expect(w[3]).toBe(w[2]);
    for (const tier of [1, 2, 3] as const) {
      const off = scoreSignals({ ...BASE, bestTier: tier });
      const on = scoreSignals({ ...BASE, bestTier: tier, hereWeGo: true });
      expect(on.factors.keywords).toBeCloseTo(
        off.factors.keywords * w[tier],
        10,
      );
      expect(on.score).toBeCloseTo(off.score * w[tier], 10);
    }
    const t1 = scoreSignals({ ...BASE, bestTier: 1, hereWeGo: true }).score;
    const t2 = scoreSignals({ ...BASE, bestTier: 2, hereWeGo: true }).score;
    const rumor = scoreSignals({ ...BASE, bestTier: 2 }).score;
    expect(t1).toBeGreaterThan(t2);
    expect(t2).toBeGreaterThan(rumor);
  });

  it("clusterSignals는 분류 결과(ctx.hereWeGo)가 true일 때만 신호를 켠다 — 제목 키워드만으로는 켜지 않는다", () => {
    const item: FeedItem = {
      title: "Here we go? Harry Kane to Arsenal",
      url: "https://example.com/bbc/1",
      publishedAt: "2026-10-17T00:00:00.000Z",
      summary: null,
      source: TIER2,
      author: null,
      authors: [],
      lang: "en",
    };
    const cluster = toCluster(dedupeFeedItems([item]).groups, SOURCE_BY_ID);
    const ctx = {
      now: "2026-10-17T00:00:00Z",
      sourceById: SOURCE_BY_ID,
      keywords: CTX.keywords,
    };
    expect(clusterSignals(cluster, ctx).hereWeGo).toBeUndefined();
    expect(
      clusterSignals(cluster, { ...ctx, hereWeGo: () => false }).hereWeGo,
    ).toBeUndefined();
    expect(
      clusterSignals(cluster, { ...ctx, hereWeGo: () => true }).hereWeGo,
    ).toBe(true);
  });
});
