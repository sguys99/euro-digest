/**
 * M1-18 — 이적 추출 규칙 v0.1 (PRD FR-21·FR-100~103·F10 '정확도 한계', D23) — scripts/lib/transfer-extract.ts.
 *
 *   ① 단계 표(언어별 en·it·es·ko): rumor·negotiating·agreed·official·collapsed, 의문·부정·조건·잔류 → rumor, 임박 → negotiating 상한,
 *      제외 표현('cup exit'·'우승 무산'·'관심 집중'·'official statement')
 *   ② 문턱·선수: 재계약·묶음·에이전트 제목은 생략, 꾸미는 자리('Kane replacement'·'이강인 공격 파트너')를 뺀 선수가 정확히 1명
 *   ③ 방향(언어별): 'P to T'·'P joins T'·'T sign P'·'T striker P'·'from T1 to T2'·'P al T'·'P ficha por T'·'T행'·'T1에서 T2로'·'T1→T2' —
 *      부정·등위·옛 소속·파는 쪽·지난 이적('이적 후'·'이적 이끈')·지금 소속팀(한국 선수)은 방향이 아니다
 *   ④ 클러스터 결합: 선수 둘 → 생략, agreed 이상 승격 조건(Tier 2 이상 또는 매체 2곳), 결렬이 늦으면 collapsed, tier = 클러스터 최고 Tier
 *      (`clusterSourceMeta(cluster).bestTier`와 같다)
 *   ⑤ 카테고리 연동: transfer는 카테고리 '이적' 카드에만, '이강인 이적 설득한 코케, 부상 이탈' = 부상(M1-17 이월), 'T행' = 이적 화제
 *   ⑥ fixtures 손 판정 대비(오탐·잘못된 방향·과대 단계 0)
 *   ⑦·⑧·⑨ 리뷰 1·2·3회차 회귀(⑨ — 오케스트레이터 결정 A 움직임 근거·B 계약 길이·C 'here we go' agreed 상한·D '영입 추진' rumor, 인용·부인·
 *      다른 절·등위 팀·첫 절 머리표·묘사 허용 목록·도입구·보도 꼬리·닮은꼴·이모지·따옴표·금액·역추적·국내 꼬리표)
 *   ⑩ 리뷰 4회차 회귀(국내 다른 절은 닫힌 목록 꼴만·첫 절 건너뛰기는 목록 꼴 절만·'사이' 꼴 금액은 움직임 근거 아님)
 * 사전은 configs/names.ko.json(185항목)과 '사전 확장 흉내'(fixtures 이적 기사의 미등록 선수 성 별칭 — 테스트 자리값). 네트워크 없음.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  NewsCardSchema,
  NewsFileSchema,
  SourcesFileSchema,
  type CardTransfer,
  type FeedItem,
  type NamesKoFile,
  type Tier,
} from "@/lib/schema";

import {
  analyzeCluster,
  analyzeItems,
  textSignals,
  type ClassifyContext,
} from "../scripts/lib/classify";
import type { DedupGroup } from "../scripts/lib/dedup";
import { clusterSourceMeta, toCluster } from "../scripts/lib/news-cluster";
import { buildCard } from "../scripts/lib/news-file";
import {
  TRANSFER_TERMS,
  buildKeywordIndex,
  compileGroup,
  matchesGroup,
  titleText,
} from "../scripts/lib/news-keywords";
import { clusterSignals } from "../scripts/lib/score";
import { buildTagIndex, matchTitleTags } from "../scripts/lib/tag-names";
import {
  PROMOTION_RULE,
  bestTierOf,
  combineTransferClaims,
  gossipLead,
  koBoundForTeam,
  transferClaimOf,
  type TransferClaim,
  type TransferEvidence,
} from "../scripts/lib/transfer-extract";
import {
  STAGE_PATTERNS,
  matchStagePatterns,
  stripHeadNoise,
} from "../scripts/lib/transfer-patterns";

import {
  REVIEW_PROBES,
  type ReviewProbe,
} from "./support/transfer-review-probes";
import {
  REVIEW_PROBES_R3,
  REVIEW_PROBES_R3_EXTRA,
} from "./support/transfer-review-probes-r3";
import {
  REVIEW_PROBES_R4,
  REVIEW_PROBES_R4_EXTRA,
} from "./support/transfer-review-probes-r4";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const NAMES = NamesKoFileSchema.parse(readJson("configs/names.ko.json"));
const PLAYERS = KoreanPlayersFileSchema.parse(
  readJson("configs/korean-players.json"),
);
const SOURCES = SourcesFileSchema.parse(readJson("configs/sources.json"));
const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s] as const));

/**
 * 사전 확장 흉내 — fixtures 이적 기사의 미등록 선수(성 별칭)를 테스트 자리값 slug로 더한다(확정 표기는 names.ko.json이 정한다 — /add-name).
 * 현재 사전에서 이 선수들은 이적 정보 없이 카테고리만 이적이다(PRD F10 '미등록 선수').
 */
function namesWithPlayers(base: NamesKoFile): NamesKoFile {
  const extra: Array<[string, string, string[]]> = [
    ["test-balogun", "발로건", ["Balogun"]],
    ["test-sancho", "산초", ["Sancho"]],
    ["test-carvajal", "카르바할", ["Carvajal"]],
    ["test-alvarez", "알바레스", ["Alvarez"]],
    ["test-rojo", "로호", ["Rojo"]],
    ["test-scott", "스콧", ["Scott"]],
    ["test-mctominay", "맥토미니", ["McTominay"]],
    ["test-martinez", "마르티네스", ["Martinez"]],
  ];
  return NamesKoFileSchema.parse({
    ...base,
    entries: [
      ...base.entries,
      ...extra.map(([slug, ko, en]) => ({ ko, en, kind: "player", slug })),
    ],
  });
}

const ctxOf = (names: NamesKoFile): ClassifyContext => ({
  keywords: buildKeywordIndex({ names, koreanPlayers: PLAYERS }),
  tags: buildTagIndex({ names, koreanPlayers: PLAYERS }),
  sourceById: SOURCE_BY_ID,
});
const CTX = ctxOf(NAMES);
const CTX_EXT = ctxOf(namesWithPlayers(NAMES));

/** 언어 → 그 언어의 활성 소스(해외 Tier 2 · 국내 Tier 3) */
const SOURCE_FOR: Record<string, string> = {
  en: "bbc-sport-football",
  it: "di-marzio",
  es: "relevo",
  ko: "interfootball-world",
};

/** 제목 1건 클러스터의 분석(카테고리·transfer) */
function analyze(
  title: string,
  lang: string,
  ctx: ClassifyContext = CTX,
  source = SOURCE_FOR[lang]!,
) {
  return analyzeItems(
    [
      {
        title,
        lang,
        summary: null,
        sources: [source],
        publishedAt: "2026-10-17T00:00:00Z",
      },
    ],
    ctx,
  );
}

/** 제목 1건의 카드 transfer(카테고리 '이적'이 아니거나 생략이면 undefined) */
const tr = (title: string, lang: string, ctx: ClassifyContext = CTX) =>
  analyze(title, lang, ctx).transfer;

/** 제목 1건의 주장(카테고리와 무관 — 문턱부터) */
function claimOf(title: string, lang: string, ctx: ClassifyContext = CTX) {
  const s = textSignals(title, lang);
  const players = matchTitleTags(title, lang, ctx.tags).players.map(
    (p) => p.slug,
  );
  return transferClaimOf(
    {
      title,
      lang,
      players,
      transfer: s.transfer,
      renewal: s.renewal,
      roundup: s.roundup,
    },
    ctx.tags,
  );
}

describe("① 닫힌 문형 표(D54) — 언어 × 단계 × 문형 × 꼬리, 앵커드", () => {
  /** 문형 맞춤(주어 선수 slug를 준다) */
  const stages = (title: string, lang: string, player: string) =>
    matchStagePatterns({
      title,
      lang,
      playerSlug: player,
      tags: CTX.tags,
      sourceComps: SOURCE_BY_ID.get(SOURCE_FOR[lang]!)?.competitions ?? [],
    });
  const KANE = "harry-kane";
  const KMJ = "kim-min-jae";

  /** 문형마다 실제 꼴 예시 하나 이상 — 표 전체를 고정한다 */
  const EXAMPLES: Array<
    [
      id: string,
      title: string,
      lang: string,
      player: string,
      expect: {
        to?: string;
        from?: string;
        explicit?: boolean;
        /** 움직임 근거(3회차 결정 A — `needsMove` 꼴만 false가 될 수 있다) */
        moved?: boolean;
      },
    ]
  > = [
    [
      "en.official.confirm-signing",
      "Arsenal confirm signing of Bayern striker Harry Kane on loan",
      "en",
      KANE,
      { to: "arsenal", from: "bayern-munchen", explicit: true },
    ],
    [
      "en.official.officially-joins",
      "Harry Kane officially joins Arsenal",
      "en",
      KANE,
      { to: "arsenal", explicit: true },
    ],
    [
      "en.official.joins",
      "Harry Kane joins Arsenal on loan from Bayern Munich",
      "en",
      KANE,
      { to: "arsenal", from: "bayern-munchen", explicit: false },
    ],
    [
      "en.official.signs-for",
      "Harry Kane signs for Arsenal in a £100m deal",
      "en",
      KANE,
      { to: "arsenal", explicit: false },
    ],
    [
      "en.official.team-signs",
      "Arsenal sign Harry Kane on a free transfer",
      "en",
      KANE,
      { to: "arsenal", explicit: false },
    ],
    [
      "en.official.completes-move",
      "Harry Kane completes £100m move to Arsenal",
      "en",
      KANE,
      { to: "arsenal", explicit: false },
    ],
    [
      "en.official.complete-signing",
      "Arsenal complete signing of Harry Kane",
      "en",
      KANE,
      { to: "arsenal", explicit: false },
    ],
    [
      "en.agreed.agree-fee",
      "Arsenal agree £100m fee for Bayern striker Harry Kane",
      "en",
      KANE,
      { to: "arsenal", from: "bayern-munchen", moved: true },
    ],
    [
      "en.agreed.agrees-terms",
      "Harry Kane agrees personal terms with Arsenal on loan from Bayern Munich",
      "en",
      KANE,
      { to: "arsenal", from: "bayern-munchen", moved: true },
    ],
    [
      "en.agreed.medical",
      "Harry Kane undergoes medical at Arsenal",
      "en",
      KANE,
      { to: "arsenal" },
    ],
    [
      "en.agreed.here-we-go-head",
      "Here we go! Harry Kane to Arsenal",
      "en",
      KANE,
      { to: "arsenal" },
    ],
    [
      "en.agreed.here-we-go-tail",
      "Harry Kane to Arsenal, here we go - contract until 2030",
      "en",
      KANE,
      { to: "arsenal" },
    ],
    [
      "en.negotiating.talks",
      "Arsenal in advanced talks with Bayern Munich over Harry Kane",
      "en",
      KANE,
      { to: "arsenal", from: "bayern-munchen", moved: true },
    ],
    [
      "en.negotiating.bid",
      "Arsenal make £80m bid for Harry Kane",
      "en",
      KANE,
      { to: "arsenal" },
    ],
    [
      "en.negotiating.player-talks",
      "Harry Kane in transfer talks with Arsenal",
      "en",
      KANE,
      { to: "arsenal", moved: true },
    ],
    [
      "en.negotiating.close",
      "Arsenal close to signing Harry Kane",
      "en",
      KANE,
      { to: "arsenal", moved: true },
    ],
    [
      "en.collapsed.move-off",
      "Harry Kane's move to Arsenal collapses",
      "en",
      KANE,
      { to: "arsenal" },
    ],
    [
      "en.collapsed.team-pulls-out",
      "Arsenal pull out of race for Harry Kane",
      "en",
      KANE,
      { to: "arsenal" },
    ],
    [
      "en.collapsed.team-walks-away",
      "Arsenal walk away from deal for Harry Kane",
      "en",
      KANE,
      { to: "arsenal" },
    ],
    [
      "en.collapsed.team-abandons",
      "Arsenal abandon move for Harry Kane",
      "en",
      KANE,
      { to: "arsenal" },
    ],
    [
      "it.official.ufficializza",
      "Il Milan ufficializza Harry Kane",
      "it",
      KANE,
      { to: "milan", explicit: true },
    ],
    [
      "it.official.ufficialmente",
      "Harry Kane è ufficialmente del Milan",
      "it",
      KANE,
      { to: "milan", explicit: true },
    ],
    [
      "it.official.nuovo-giocatore",
      "Harry Kane è un nuovo giocatore del Milan",
      "it",
      KANE,
      { to: "milan", explicit: false },
    ],
    [
      "it.agreed.accordo-tra",
      "Accordo raggiunto tra il Milan e Harry Kane in prestito dal Bayern",
      "it",
      KANE,
      { to: "milan", from: "bayern-munchen", moved: true },
    ],
    [
      "it.negotiating.trattativa",
      "Milan, trattativa con il Bayern per Harry Kane",
      "it",
      KANE,
      { to: "milan", from: "bayern-munchen", moved: true },
    ],
    [
      "es.official.oficializa",
      "El Barcelona oficializa el fichaje de Harry Kane",
      "es",
      KANE,
      { to: "barcelona", explicit: true },
    ],
    [
      "es.official.anuncia",
      "El Barcelona anuncia el fichaje de Harry Kane",
      "es",
      KANE,
      { to: "barcelona", explicit: true },
    ],
    [
      "es.official.ficha-por",
      "Harry Kane ficha por el Barcelona cedido por el Bayern",
      "es",
      KANE,
      { to: "barcelona", from: "bayern-munchen", explicit: false },
    ],
    [
      "es.official.ficha-a",
      "El Barcelona ficha a Harry Kane",
      "es",
      KANE,
      { to: "barcelona", explicit: false },
    ],
    [
      "es.agreed.cierra-fichaje",
      "El Barcelona cierra el fichaje de Harry Kane",
      "es",
      KANE,
      { to: "barcelona" },
    ],
    [
      "es.agreed.acuerdo-entre",
      "Acuerdo total entre el Barcelona y Harry Kane, cedido por el Bayern",
      "es",
      KANE,
      { to: "barcelona", from: "bayern-munchen", moved: true },
    ],
    [
      "es.negotiating.negocia",
      "El Barcelona negocia con el Bayern por Harry Kane",
      "es",
      KANE,
      { to: "barcelona", from: "bayern-munchen", moved: true },
    ],
    [
      "ko.official.announce",
      "아스널, 김민재 영입 공식 발표",
      "ko",
      KMJ,
      { to: "arsenal", explicit: true },
    ],
    [
      "ko.official.head-signs",
      "[오피셜] 아스널, 김민재 영입",
      "ko",
      KMJ,
      { to: "arsenal", explicit: true },
    ],
    [
      "ko.official.head-moves",
      "[오피셜] 김민재, 아스널행",
      "ko",
      KMJ,
      { to: "arsenal", explicit: true },
    ],
    [
      "ko.official.move-confirmed",
      "김민재, 아스널 입단 확정",
      "ko",
      KMJ,
      { to: "arsenal", explicit: false },
    ],
    [
      "ko.official.sign-confirmed",
      "아스널, 김민재 완전 영입 완료",
      "ko",
      KMJ,
      { to: "arsenal", explicit: false },
    ],
    [
      "ko.agreed.move-agreed",
      "김민재, 아스널 이적 합의",
      "ko",
      KMJ,
      { to: "arsenal" },
    ],
    [
      "ko.agreed.medical",
      "김민재, 아스널 메디컬 테스트",
      "ko",
      KMJ,
      { to: "arsenal" },
    ],
    [
      "ko.agreed.here-we-go",
      "'HERE WE GO' 김민재, 아스널 이적 확정",
      "ko",
      KMJ,
      { to: "arsenal" },
    ],
    [
      "ko.negotiating.sign-talks",
      "아스널, 김민재 영입 협상 중",
      "ko",
      KMJ,
      { to: "arsenal" },
    ],
    [
      "ko.negotiating.move-talks",
      "김민재, 아스널 이적 임박",
      "ko",
      KMJ,
      { to: "arsenal" },
    ],
    [
      "ko.collapsed.move-off",
      "김민재 아스널 이적 무산",
      "ko",
      KMJ,
      { to: "arsenal" },
    ],
    [
      "ko.collapsed.sign-off",
      "아스널, 김민재 영입 포기",
      "ko",
      KMJ,
      { to: "arsenal" },
    ],
  ];

  it("표의 모든 문형에 실제 꼴 예시가 있고, 예시는 그 문형·단계·방향·명시 표현으로 맞는다", () => {
    const ids = Object.values(STAGE_PATTERNS)
      .flat()
      .map((p) => p.id);
    expect(new Set(EXAMPLES.map((e) => e[0]))).toEqual(new Set(ids));
    for (const [id, title, lang, player, want] of EXAMPLES) {
      const hit = stages(title, lang, player).find((m) => m.id === id);
      expect(hit, `${id} ← ${title}`).toBeDefined();
      const pattern = Object.values(STAGE_PATTERNS)
        .flat()
        .find((p) => p.id === id)!;
      expect(hit!.status, title).toBe(pattern.status);
      expect(hit!.to, title).toBe(want.to);
      expect(hit!.from, title).toBe(want.from);
      if (want.explicit !== undefined) {
        expect(hit!.explicit, title).toBe(want.explicit);
      }
      expect(hit!.moved, title).toBe(want.moved ?? true);
    }
  });

  it("표의 모든 문형은 transferClaimOf 주장까지 도달한다(M1-18 3회차 리뷰 권장 13 — 꾸미는 자리·문턱에 막혀 못 쓰는 문형이 없다)", () => {
    for (const [id, title, lang] of EXAMPLES) {
      const tags = matchTitleTags(title, lang, CTX.tags, {
        sourceComps: SOURCE_BY_ID.get(SOURCE_FOR[lang]!)?.competitions ?? [],
      });
      const s = textSignals(title, lang);
      const r = transferClaimOf(
        {
          title,
          lang,
          players: tags.players.map((p) => p.slug),
          transfer: true,
          renewal: s.renewal,
          roundup: s.roundup,
          sourceComps: SOURCE_BY_ID.get(SOURCE_FOR[lang]!)?.competitions ?? [],
        },
        CTX.tags,
      );
      expect(r.claim?.evidence ?? r, `${id} ← ${title}`).toContain(
        `pattern:${id}`,
      );
    }
  });

  it("앵커드 — 문형 앞뒤에 남는 말·예정·의문·꾸밈이 붙으면 맞지 않는다(높은 단계 없음)", () => {
    const none: Array<[string, string, string]> = [
      ["Arsenal to announce signing of Harry Kane", "en", KANE],
      ["Arsenal ready to confirm signing of Harry Kane", "en", KANE],
      ["Arsenal confirm signing of Harry Kane will not happen", "en", KANE],
      ["Harry Kane joins Arsenal in mourning", "en", KANE],
      ["Harry Kane joins Arsenal squad for US tour", "en", KANE],
      ["Harry Kane joins Arsenal: injury list grows to seven", "en", KANE],
      ["Harry Kane joins Arsenal - official?", "en", KANE],
      ["Harry Kane to Arsenal: here we go soon", "en", KANE],
      ["Not here we go yet: Harry Kane to Arsenal", "en", KANE],
      ["Harry Kane undergoes medical tests on knee", "en", KANE],
      ["Harry Kane signs for Arsenal until 2033", "en", KANE],
      ["Arsenal set to sign Harry Kane", "en", KANE],
      ["Arsenal close to agreeing deal for Bayern striker", "en", KANE],
      [
        "Lamine Yamal ficha por el Barcelona en la gala de los premios",
        "es",
        "lamine-yamal",
      ],
      ["Il Milan ufficializza il nuovo kit con Harry Kane", "it", KANE],
      ["아스널, 김민재 영입 발표 임박", "ko", KMJ],
      ["아스널, 김민재 영입 발표 앞둬", "ko", KMJ],
      ["김민재, 아스널 입단 확정 수순", "ko", KMJ],
      ["김민재, 아스널 이적 확정적", "ko", KMJ],
      ["김민재, 곧 아스널 입단 발표", "ko", KMJ],
      ["아스널, 김민재 닮은 수비수 영입 확정", "ko", KMJ],
      ["김민재 아스널 이적 무산설", "ko", KMJ],
      ["김민재, 아스널 이적 무산 위기", "ko", KMJ],
      // 머리표 없는 'P, T 이적'은 official 문형이 아니다
      ["김민재, 아스널 이적", "ko", KMJ],
    ];
    for (const [title, lang, player] of none) {
      expect(stages(title, lang, player), title).toEqual([]);
    }
  });

  it("머리말 잡음(이모지·[단독]·BREAKING·EXCL·Calciomercato·피드 꼬리)은 벗기고 맞춘다 — '[오피셜]'·'Official:'은 명시 표현", () => {
    expect(
      stripHeadNoise("🚨 BREAKING: Harry Kane joins Arsenal - BBC Sport", "en"),
    ).toEqual({
      text: "Harry Kane joins Arsenal",
      explicitHead: false,
    });
    expect(stripHeadNoise("Official: Harry Kane joins Arsenal", "en")).toEqual({
      text: "Harry Kane joins Arsenal",
      explicitHead: true,
    });
    expect(stripHeadNoise("[오피셜] [단독] 아스널, 김민재 영입", "ko")).toEqual(
      {
        text: "아스널, 김민재 영입",
        explicitHead: true,
      },
    );
    expect(
      stages("EXCL: Harry Kane joins Arsenal", "en", KANE).map((m) => [
        m.id,
        m.explicit,
      ]),
    ).toEqual([["en.official.joins", false]]);
    expect(
      stages("Official: Harry Kane joins Arsenal", "en", KANE)[0]?.explicit,
    ).toBe(true);
    // 따로 선 명시 표현 절
    expect(
      stages("Harry Kane ficha por el Barcelona: es oficial", "es", KANE)[0],
    ).toMatchObject({ id: "es.official.ficha-por", explicit: true });
  });

  it("국내 제목은 절(…·!·?) 하나 또는 쉼표 마디 묶음이 문형에 맞으면 된다 — 다른 절은 보지 않는다", () => {
    expect(
      stages("[오피셜] 김민재, 아스널 이적…이적료 5000만 유로", "ko", KMJ)[0],
    ).toMatchObject({ id: "ko.official.head-moves", to: "arsenal" });
    expect(
      stages("‘미쳤다’ 김민재, 아스널 입단 확정…등번호 3", "ko", KMJ)[0],
    ).toMatchObject({ id: "ko.official.move-confirmed" });
    expect(stages("김민재 결장…바이에른, 공격수 영입 확정", "ko", KMJ)).toEqual(
      [],
    );
  });

  it("rumor는 키워드 방식 그대로 — 선수가 든 절의 이적설 표현이 그 선수에게 걸릴 때만", () => {
    expect(tr("김민재 이적설", "ko")).toEqual({
      player: KMJ,
      status: "rumor",
      tier: 3,
    });
    expect(tr("엔드릭 겨울 임대설에 무리뉴 감독 경고", "ko")).toEqual({
      player: "endrick",
      status: "rumor",
      tier: 3,
    });
    expect(tr("Harry Kane linked with Arsenal transfer", "en")).toEqual({
      player: KANE,
      to: "arsenal",
      status: "rumor",
      tier: 2,
    });
    expect(tr("Calciomercato, Harry Kane nel mirino del Milan", "it")).toEqual({
      player: KANE,
      status: "rumor",
      tier: 2,
    });
    expect(
      tr("Harry Kane suena para el Barcelona tras el fichaje fallido", "es")
        ?.status,
    ).toBe("rumor");
    // 다른 사람 이야기
    expect(
      tr("Harry Kane praises Bayern Munich transfer target", "en"),
    ).toBeUndefined();
    expect(tr("이강인, 동료 이적설에 한마디", "ko")).toBeUndefined();
    expect(tr("이강인, 쿠보 레알 이적설에 '좋은 선수'", "ko")).toBeUndefined();
  });
});

describe("② 문턱·선수 — 확실할 때만", () => {
  it("재계약(이적 아님)·'new <팀> deal'·재계약 협상 단서는 생략", () => {
    expect(
      claimOf("Palmer signs new Chelsea contract until 2034", "en"),
    ).toEqual({
      skip: "renewal",
    });
    expect(
      claimOf(
        "Harry Kane signs new Bayern contract amid Arsenal transfer bid",
        "en",
      ).skip,
    ).toBe("renewal");
    expect(
      claimOf("Liverpool hold contract talks with Mohamed Salah transfer", "en")
        .skip,
    ).toBe("renewal");
    expect(claimOf("팔머, 첼시와 2034년까지 재계약", "ko").skip).toBe(
      "renewal",
    );
  });

  it("여러 소식 묶음(🚨 … & more)은 생략, BBC gossip은 앞 문장만 보고 rumor까지만", () => {
    expect(
      claimOf(
        "🚨 Haaland to Arsenal update, Liverpool want PL winger, Man United want ex-midfielder & more",
        "en",
      ).skip,
    ).toBe("roundup");
    expect(gossipLead("AC Milan keen on Scott - Sunday's gossip")).toBe(
      "AC Milan keen on Scott",
    );
    expect(gossipLead("Napoli back McTominay - gossip")).toBe(
      "Napoli back McTominay",
    );
    expect(gossipLead("Arsenal eye Kane")).toBeNull();
    expect(
      tr("AC Milan keen on Scott - Sunday's gossip", "en", CTX_EXT),
    ).toEqual({
      player: "test-scott",
      to: "milan",
      status: "rumor",
      tier: 2,
    });
    // gossip 앞 문장이 공식이어도 rumor(다른 신문 보도 모음)
    expect(
      tr("Arsenal complete signing of Scott - Monday's gossip", "en", CTX_EXT)
        ?.status,
    ).toBe("rumor");
  });

  it("에이전트 기사는 생략('로드리 에이전트와 계약 임박'·'busca nuevo agente') — 'free agent'(FA)는 에이전트가 아니다", () => {
    expect(
      claimOf(
        "아직도 ‘바르셀로나 드림’ 원하나? 알바레스, 로드리 에이전트와 계약 임박…“조만간 공식화 예상”",
        "ko",
      ).skip,
    ).toBe("agent");
    expect(
      claimOf("Harry Kane's agent holds talks with Arsenal over transfer", "en")
        .skip,
    ).toBe("agent");
    expect(
      tr("Getafe make offer to sign free agent Sancho", "en", CTX_EXT),
    ).toEqual({
      player: "test-sancho",
      to: "getafe",
      status: "negotiating",
      tier: 2,
    });
  });

  it("미등록 선수 기사는 카테고리만 이적(PRD F10) — 'Everton agree £40m fee for Monaco striker Balogun'", () => {
    const a = analyze(
      "Everton agree £40m fee for Monaco striker Balogun",
      "en",
    );
    expect(a.cat).toBe("transfer");
    expect(a.transfer).toBeUndefined();
  });

  it("꾸미는 자리의 선수는 주어가 아니다 — replacement·'s agent·replace·이강인 공격 파트너·킬패스·대체자·동료·처럼·따라", () => {
    expect(
      claimOf("Arsenal want replacement for Harry Kane as transfer looms", "en")
        .skip,
    ).toBe("no-player");
    expect(
      claimOf("Bayern eye Harry Kane replacement in transfer window", "en")
        .skip,
    ).toBe("no-player");
    expect(
      claimOf(
        "Bayern sign striker to replace Harry Kane in transfer swoop",
        "en",
      ).skip,
    ).toBe("no-player");
    expect(claimOf("이강인 공격 파트너 X, 아스널 이적 임박", "ko").skip).toBe(
      "no-player",
    );
    expect(
      claimOf(
        "‘우린 맨유처럼 돈 잔치 안해!’ 이강인 킬패스 기점→51초만 벼락골 주인공...“바이아웃 무려 7,500억”",
        "ko",
      ).skip,
    ).toBe("no-player");
    expect(claimOf("김민재 대체자 영입 추진하는 바이에른", "ko").skip).toBe(
      "no-player",
    );
    expect(claimOf("이강인 동료 X, 아스널 이적 임박", "ko").skip).toBe(
      "no-player",
    );
    expect(claimOf("[오피셜] 레알, 수비수 영입…김민재와 경쟁", "ko").skip).toBe(
      "no-player",
    );
    expect(
      claimOf(
        "'100일 넘게 FA' X, 이강인 따라 마드리드 간다...이적 협상 진행 중",
        "ko",
      ).skip,
    ).toBe("no-player");
  });

  it("주어 선수가 둘 이상이면 생략, 하나만 남으면 그 선수('카르바할처럼 … 산초, 헤타페행 가능성')", () => {
    expect(
      claimOf("Harry Kane and Bukayo Saka linked with Arsenal transfer", "en")
        .skip,
    ).toBe("players");
    expect(
      tr(
        "카르바할처럼 연봉 1/10만 받을까? 갈 곳 없는 ‘FA’ 산초, 이번엔 스페인 클럽 헤타페행 가능성 제기",
        "ko",
        CTX_EXT,
      ),
    ).toEqual({
      player: "test-sancho",
      to: "getafe",
      status: "rumor",
      tier: 3,
    });
  });

  it("단계는 선수가 든 절에서만 — 다른 절의 'agree fee'·'영입 확정'은 다른 사람 이야기일 수 있다", () => {
    expect(
      claimOf(
        "Harry Kane scores twice: Arsenal agree fee for Chelsea striker transfer",
        "en",
      ).skip,
    ).toBe("no-status");
    // 김민재는 그 절의 주어 근거도 없다('결장') — 주장 없음
    expect(
      claimOf("김민재 결장…바이에른, 공격수 영입 확정", "ko").claim,
    ).toBeUndefined();
    expect(
      claimOf("바이에른, 김민재 옆에 설 수비수 영입 임박", "ko").skip,
    ).toBe("no-player");
    expect(
      claimOf("이강인 이적 설득한 코케, 바르사 이적 임박", "ko").skip,
    ).toBe("no-player");
  });

  it("국내 머리표 '[오피셜]'·'Official:'·'here we go'는 선수가 든 절이 의문·부정·잔류·결렬 없이 이적을 말할 때만", () => {
    expect(tr("[오피셜] ‘이적료 1000억’…김민재, 아스널행", "ko")?.status).toBe(
      "negotiating",
    ); // official — 국내 Tier 3 1곳이라 승격 조건 미달
    expect(
      claimOf("[오피셜] ‘이적료 1000억’…김민재, 아스널행", "ko").claim?.status,
    ).toBe("official");
    // 결렬 문형 밖('…불발, 바이에른 잔류')이고 rumor 근거도 없다 — 주장 없음(D54)
    expect(
      claimOf("[오피셜] 김민재 이적 불발, 바이에른 잔류", "ko").claim,
    ).toBeUndefined();
    expect(tr("Official: Harry Kane joins Arsenal on loan", "en")).toEqual({
      player: "harry-kane",
      to: "arsenal",
      status: "official",
      tier: 2,
    });
    expect(
      tr("Here we go! Harry Kane to Arsenal, transfer done", "en"),
    ).toEqual({
      player: "harry-kane",
      to: "arsenal",
      status: "agreed",
      tier: 2,
    });
    // 물음표 제목은 문형을 쓰지 않는다 — 'P to T' 첫머리 꼴도 팀 뒤가 절 끝이 아니라 방향이 아니다
    expect(
      tr("Here we go? Harry Kane to Arsenal transfer could happen", "en"),
    ).toBeUndefined();
  });
});

describe("③ 방향 — 언어별, 확실할 때만(잘못된 방향 0)", () => {
  it("영어 행선지 — 'P to T'(절 첫머리)·'P joins T'(official)·'P signs for T'·'move to'·'linked with'·'wanted by'·'medical at'", () => {
    expect(tr("Harry Kane to Arsenal: transfer latest", "en")).toEqual({
      player: "harry-kane",
      to: "arsenal",
      status: "rumor",
      tier: 2,
    });
    // D52 ① — 방향·완료 동사만인 단일 Tier 2 출처는 agreed까지
    expect(tr("Harry Kane joins Arsenal on loan", "en")).toMatchObject({
      to: "arsenal",
      status: "agreed",
    });
    expect(
      tr("Harry Kane joins Arsenal on loan from Bayern Munich", "en"),
    ).toMatchObject({
      to: "arsenal",
      from: "bayern-munchen",
      status: "agreed",
    });
    expect(
      tr("Harry Kane signs for Arsenal in record transfer", "en"),
    ).toMatchObject({
      to: "arsenal",
      status: "agreed",
    });
    expect(
      tr("Harry Kane completes £100m move to Arsenal in transfer", "en"),
    ).toMatchObject({ to: "arsenal", status: "agreed" });
    // 꼬리 슬롯 밖('in mourning'·'in Dubai')이면 'joins'는 방향도 단계도 아니다(D54 — 닫힌 문형만)
    expect(tr("Harry Kane joins Arsenal in Dubai", "en")).toBeUndefined();
    expect(
      tr("Harry Kane wanted by Arsenal in transfer race", "en"),
    ).toMatchObject({
      to: "arsenal",
      status: "rumor",
    });
    // 'ahead of transfer'는 메디컬 문형 꼬리 밖 — 'medical at T' 방향만(rumor)
    expect(
      tr("Harry Kane to undergo medical at Arsenal ahead of transfer", "en"),
    ).toMatchObject({ to: "arsenal", status: "rumor" });
    expect(tr("Harry Kane to undergo medical at Arsenal", "en")).toMatchObject({
      to: "arsenal",
      status: "agreed",
    });
    expect(
      tr("Harry Kane could join Arsenal in January transfer window", "en"),
    ).toMatchObject({ to: "arsenal", status: "rumor" });
  });

  it("영어 사는 쪽 — 'T sign P'(문형이면 단일 출처 agreed — D52 ①, 꼬리 밖이면 rumor)·'T eye P'·'T agree fee for T2 striker P'(출발 = T2)", () => {
    expect(tr("Arsenal sign Harry Kane on loan", "en")).toMatchObject({
      to: "arsenal",
      status: "agreed",
    });
    // 'in shock transfer'는 꼬리 슬롯 밖 — 문형이 아니라 사는 쪽 방향(rumor)만
    expect(tr("Arsenal sign Harry Kane in shock transfer", "en")).toMatchObject(
      {
        to: "arsenal",
        status: "rumor",
      },
    );
    expect(tr("Arsenal eye Harry Kane transfer", "en")).toMatchObject({
      to: "arsenal",
      status: "rumor",
    });
    expect(
      tr("Arsenal agree £100m fee for Bayern striker Harry Kane", "en"),
    ).toEqual({
      player: "harry-kane",
      from: "bayern-munchen",
      to: "arsenal",
      status: "agreed",
      tier: 2,
    });
  });

  it("영어 출발 — 'leaves T1 for T2'·\"P's T exit\"·\"T's P\"·'T star P'", () => {
    expect(
      tr("Harry Kane leaves Bayern for Arsenal in transfer swoop", "en"),
    ).toMatchObject({ from: "bayern-munchen", to: "arsenal" });
    // "P's T exit"·"P's T move" 같은 '팀 + 이적 명사'는 방향이 아니다(지난 이적·다른 사람 이야기가 섞인다 — 2회차 리뷰)
    expect(
      tr("Harry Kane's Bayern exit: Arsenal transfer talks open", "en"),
    ).toBeUndefined();
    expect(
      tr("Bayern's Harry Kane linked with Arsenal transfer", "en"),
    ).toMatchObject({ from: "bayern-munchen", to: "arsenal" });
    expect(
      tr("Bayern star Harry Kane linked with Arsenal transfer", "en"),
    ).toMatchObject({ from: "bayern-munchen", to: "arsenal" });
    // "Arsenal's Kane bid" — 소유 's 뒤 사는 쪽 명사면 T가 사는 쪽
    expect(
      tr("Arsenal's Harry Kane bid rejected by Bayern in transfer", "en"),
    ).toMatchObject({ to: "arsenal" });
  });

  it("영어 — 부정·등위·옛 소속·파는 쪽·절 첫머리 아닌 'to'·잔류는 방향이 아니다", () => {
    const noDir = (t: CardTransfer | undefined) => ({
      from: t?.from,
      to: t?.to,
    });
    expect(
      noDir(
        tr(
          "Harry Kane refuses to join Arsenal despite transfer interest",
          "en",
        ),
      ),
    ).toEqual({ from: undefined, to: undefined });
    expect(
      noDir(tr("Arsenal and Chelsea eye Harry Kane transfer", "en")),
    ).toEqual({
      from: undefined,
      to: undefined,
    });
    // 머리에 '옛 소속' 묘사가 붙으면 'P joins T' 문형이 아니고(앵커드), 'joins'는 방향 규칙이 보지 않는다
    expect(
      tr("Former Bayern star Harry Kane joins Arsenal", "en"),
    ).toBeUndefined();
    // 파는 쪽('accept bid'·'confirm … exit')을 사는 쪽으로 읽지 않는다
    expect(
      noDir(tr("Bayern accept bid for Harry Kane from Arsenal", "en")),
    ).toEqual({ from: undefined, to: undefined });
    expect(
      noDir(tr("Bayern confirm Harry Kane exit in transfer window", "en")),
    ).toEqual({ from: undefined, to: undefined });
    expect(
      noDir(
        tr(
          "Bayern want to keep Harry Kane amid Arsenal transfer interest",
          "en",
        ),
      ),
    ).toEqual({ from: undefined, to: undefined });
    expect(
      noDir(
        tr(
          "Why Harry Kane to Arsenal makes sense for the transfer window",
          "en",
        ),
      ),
    ).toEqual({ from: undefined, to: undefined });
  });

  it("이탈리아어 — 'P al T'·'P verso il T'·'T su P'·'P lascia il T'·'dal T1 al T2'·'arrivare al T'", () => {
    // 'accordo raggiunto per il trasferimento'은 문형('accordo raggiunto tra T e P') 밖 — 'P al T' 방향만(rumor)
    expect(
      tr("Harry Kane al Milan, accordo raggiunto per il trasferimento", "it"),
    ).toEqual({
      player: "harry-kane",
      to: "milan",
      status: "rumor",
      tier: 2,
    });
    expect(tr("Calciomercato, Harry Kane verso il Milan", "it")).toMatchObject({
      to: "milan",
      status: "rumor",
    });
    expect(
      tr("Calciomercato, Milan su Harry Kane: offerta pronta", "it"),
    ).toMatchObject({ to: "milan" });
    expect(
      tr(
        "Calciomercato, Harry Kane lascia il Bayern: trattativa con il Milan",
        "it",
      ),
    ).toMatchObject({ from: "bayern-munchen" });
    expect(
      tr("Calciomercato, Harry Kane dal Bayern al Milan: è ufficiale", "it"),
    ).toMatchObject({ from: "bayern-munchen", to: "milan" });
    expect(
      tr("Calciomercato, Harry Kane potrebbe arrivare al Milan", "it"),
    ).toMatchObject({ to: "milan", status: "rumor" });
    // 등위('Inter e Milan su Kane')는 방향이 아니다
    expect(
      tr("Calciomercato, Inter e Milan su Harry Kane", "it")?.to,
    ).toBeUndefined();
  });

  it("스페인어 — 'P ficha por el T'(official)·'T ficha a P'(official)·'T va a por P'·'P deja el T por el T2'·'P, delantero del T'", () => {
    expect(tr("Harry Kane ficha por el Barcelona: es oficial", "es")).toEqual({
      player: "harry-kane",
      to: "barcelona",
      status: "official",
      tier: 2,
    });
    // 'es oficial'이 따로 선 절이면 명시 표현(official), 방향 동사만이면 agreed(D52 ①)
    expect(tr("El Barcelona ficha a Harry Kane", "es")).toMatchObject({
      to: "barcelona",
      status: "agreed",
    });
    expect(tr("Fichaje: el Barcelona va a por Harry Kane", "es")).toMatchObject(
      {
        to: "barcelona",
        status: "rumor",
      },
    );
    expect(
      tr("Harry Kane deja el Bayern por el Barcelona: fichaje cerrado", "es"),
    ).toMatchObject({ from: "bayern-munchen", to: "barcelona" });
    // 'P, delantero del T, en la agenda del T2' — 쉼표를 건너는 관계·쉼표 뒤 역할 명사는 선수 이야기로 보지 않는다(D54 — 생략)
    expect(
      tr(
        "Harry Kane, delantero del Bayern, en la agenda del Barcelona para el fichaje",
        "es",
      ),
    ).toBeUndefined();
    // 'Gol de Kane al Barça' — 절 첫머리가 아닌 'al'은 행선지가 아니다
    expect(
      tr("Gol de Harry Kane al Barcelona tras su fichaje", "es"),
    ).toBeUndefined();
    expect(
      tr(
        "El Bayern no vende a Harry Kane: el Barcelona tantea su fichaje",
        "es",
      ),
    ).toBeUndefined();
  });

  it("한국어 행선지 — 'T행'(단계 문형 아님 — rumor + 방향)·'T(으)로 이적'·'T 이적설'·'T로부터 러브콜'·'T, P 영입'", () => {
    expect(tr("김민재, 아스널행 임박", "ko")).toEqual({
      player: "kim-min-jae",
      to: "arsenal",
      status: "rumor",
      tier: 3,
    });
    expect(tr("김민재, 아스널로 이적 확정", "ko")).toMatchObject({
      to: "arsenal",
    });
    expect(tr("김민재, 맨유로부터 러브콜", "ko")).toMatchObject({
      to: "manchester-united",
      status: "rumor",
    });
    // '영입 추진'은 rumor다(국내 기사에서 관심 단계에도 쓴다 — 3회차 결정 D, negotiating은 '영입 협상·제안'만)
    expect(tr("아스널, 김민재 영입 추진", "ko")).toMatchObject({
      to: "arsenal",
      status: "rumor",
    });
    expect(tr("아스널, 김민재 영입 협상 중", "ko", CTX)).toMatchObject({
      to: "arsenal",
      status: "negotiating",
    });
    expect(tr("엔드릭, 리옹 임대 이적 합의", "ko")).toMatchObject({
      player: "endrick",
      to: "lyon",
    });
  });

  it("한국어 출발 — 'T 떠난다'·'T1에서 T2로'·'T1→T2'·'T 수비수 P'", () => {
    expect(tr("김민재, 바이에른 떠난다…아스널 이적 합의", "ko")).toMatchObject({
      from: "bayern-munchen",
    });
    expect(tr("김민재, 바이에른에서 아스널로 이적", "ko")).toMatchObject({
      from: "bayern-munchen",
      to: "arsenal",
    });
    // 팀 둘('T1→T2')은 문형이 아니다 — 방향(rumor)만
    expect(tr("김민재 바이에른→아스널 이적 임박", "ko")).toMatchObject({
      from: "bayern-munchen",
      to: "arsenal",
      status: "rumor",
    });
    expect(tr("‘바이에른 수비수’ 김민재, 아스널 이적설", "ko")).toMatchObject({
      to: "arsenal",
      status: "rumor",
    });
  });

  it("한국어 — 지난 이적('이적 후'·'이적 이끈'·'이적하자마자')·부정('이적 거절')·등위('아스널·첼시')·파는 쪽('이적료 요구'·'임대 보낸다')은 방향이 아니다", () => {
    expect(
      tr(
        "“스카우팅 책임자가 영입 후보로 제시” 김민재, 21호 코리안 프리미어리거 등극하나…나폴리 이적 이끈 인물이 아스널에 직접 추천",
        "ko",
      ),
    ).toEqual({ player: "kim-min-jae", status: "rumor", tier: 3 });
    expect(tr("김민재, 아스널 이적 후 첫 골", "ko")).toBeUndefined();
    expect(tr("김민재, 아스널 이적 거절…바이에른 잔류", "ko")).toBeUndefined();
    expect(tr("아스널·첼시, 김민재 영입 경쟁", "ko")).toBeUndefined();
    expect(tr("바이에른, 김민재 이적료 요구", "ko")).toBeUndefined();
    expect(
      tr("레알, 엔드릭 임대 보낸다…리옹 임대 이적 합의", "ko"),
    ).toBeUndefined();
    // 절 첫머리 팀 + 의 + 선수 + 영입 = 사는 쪽('맨유의 김민재 영입') — '…, 협상 급물살'은 문형 밖(rumor)
    expect(tr("맨유의 김민재 영입, 협상 급물살", "ko")).toEqual({
      player: "kim-min-jae",
      to: "manchester-united",
      status: "rumor",
      tier: 3,
    });
  });

  it("한국 선수의 행선지가 설정의 지금 소속팀이면 주장을 만들지 않는다(이미 끝난 이적·모순 — 출발을 설정에서 채우지도 않는다)", () => {
    expect(claimOf("김민재, 바이에른 이적 가능성", "ko").skip).toBe(
      "current-team",
    );
    expect(claimOf("이강인, 아틀레티코 이적설 재점화", "ko").skip).toBe(
      "current-team",
    );
    // 실제 피드(10-17): 지난 이적('이적하자마자')은 이적 화제도 아니다 — 카테고리 이적이 아니고 transfer 없음
    const done = analyze(
      "PSG에서 UCL 2연패했는데도 떠난 이유 있었다…이강인, 아틀레티코 이적하자마자 주연 등극",
      "ko",
    );
    expect(done.cat).not.toBe("transfer");
    expect(done.transfer).toBeUndefined();
    expect(
      claimOf(
        "PSG에서 UCL 2연패했는데도 떠난 이유 있었다…이강인, 아틀레티코 이적 직후 주연 등극",
        "ko",
      ).claim,
    ).toBeUndefined();
    // 출발은 제목에 없으면 비운다(설정의 소속팀 = 바이에른이어도)
    expect(tr("김민재, 아스널 이적설", "ko")).toEqual({
      player: "kim-min-jae",
      to: "arsenal",
      status: "rumor",
      tier: 3,
    });
  });
});

describe("④ 클러스터 결합 — 선수 하나·agreed 이상 승격 조건·결렬·tier", () => {
  const ev = (
    claim: Partial<TransferClaim> & Pick<TransferClaim, "status">,
    publishers: string[],
    tier: Tier,
    atMs = 0,
  ): TransferEvidence => ({
    claim: { player: "harry-kane", evidence: [], ...claim },
    publishers,
    tier,
    atMs,
  });

  it("주장이 없으면 null, 서로 다른 선수면 null(같은 사건에 다른 선수 이적이 섞임)", () => {
    expect(combineTransferClaims([], 2)).toBeNull();
    expect(
      combineTransferClaims(
        [
          ev({ status: "rumor" }, ["BBC Sport"], 2),
          ev({ status: "rumor", player: "bukayo-saka" }, ["ESPN"], 2),
        ],
        2,
      ),
    ).toBeNull();
  });

  it("agreed 이상 승격 조건(PRD F10): Tier 2 이상 출처 또는 서로 다른 매체 2곳 — 못 미치면 negotiating", () => {
    expect(PROMOTION_RULE).toEqual({ maxTier: 2, minPublishers: 2 });
    // 국내(Tier 3) 1곳 — official·agreed 모두 negotiating까지
    expect(
      combineTransferClaims([ev({ status: "official" }, ["인터풋볼"], 3)], 3)
        ?.status,
    ).toBe("negotiating");
    expect(
      combineTransferClaims([ev({ status: "agreed" }, ["인터풋볼"], 3)], 3)
        ?.status,
    ).toBe("negotiating");
    // 같은 매체의 두 피드(인터풋볼 해외축구·전체기사)는 1곳
    expect(
      combineTransferClaims(
        [
          ev({ status: "official" }, ["인터풋볼"], 3),
          ev({ status: "official" }, ["인터풋볼"], 3),
        ],
        3,
      )?.status,
    ).toBe("negotiating");
    // 국내 매체 2곳 — official
    expect(
      combineTransferClaims(
        [
          ev({ status: "official" }, ["인터풋볼"], 3),
          ev({ status: "official" }, ["베스트일레븐"], 3),
        ],
        3,
      )?.status,
    ).toBe("official");
    // official 1곳 + agreed 1곳(Tier 3) — official 근거는 1곳이라 agreed
    expect(
      combineTransferClaims(
        [
          ev({ status: "official" }, ["인터풋볼"], 3),
          ev({ status: "agreed" }, ["베스트일레븐"], 3),
        ],
        3,
      )?.status,
    ).toBe("agreed");
    // 해외 Tier 2 1곳 — 그대로
    expect(
      combineTransferClaims([ev({ status: "agreed" }, ["BBC Sport"], 2)], 2)
        ?.status,
    ).toBe("agreed");
    // Tier 2 출처는 rumor만 말하고 Tier 3이 official — 카드 tier가 2여도 승격 근거는 official을 말한 기사의 출처
    expect(
      combineTransferClaims(
        [
          ev({ status: "rumor" }, ["BBC Sport"], 2),
          ev({ status: "official" }, ["인터풋볼"], 3),
        ],
        2,
      ),
    ).toMatchObject({ status: "negotiating", tier: 2 });
  });

  it("결렬이 가장 늦은 진행 주장보다 늦으면 collapsed, 이르면 진행 단계(FR-102 — 결렬 판정도 코드 규칙)", () => {
    expect(
      combineTransferClaims(
        [
          ev({ status: "negotiating" }, ["BBC Sport"], 2, 100),
          ev({ status: "collapsed" }, ["the Daily Briefing"], 2, 200),
        ],
        2,
      )?.status,
    ).toBe("collapsed");
    expect(
      combineTransferClaims(
        [
          ev({ status: "collapsed" }, ["BBC Sport"], 2, 100),
          ev(
            { status: "official", explicit: true },
            ["the Daily Briefing"],
            2,
            200,
          ),
        ],
        2,
      )?.status,
    ).toBe("official");
  });

  it("출발·행선지는 주장들의 합 — 역할마다 다른 팀이 나오면 생략, 같은 팀이 양쪽이면 둘 다 생략", () => {
    expect(
      combineTransferClaims(
        [
          ev({ status: "rumor", to: "arsenal" }, ["BBC Sport"], 2),
          ev({ status: "rumor", from: "bayern-munchen" }, ["ESPN"], 2),
        ],
        2,
      ),
    ).toEqual({
      player: "harry-kane",
      from: "bayern-munchen",
      to: "arsenal",
      status: "rumor",
      tier: 2,
    });
    expect(
      combineTransferClaims(
        [
          ev({ status: "rumor", to: "arsenal" }, ["BBC Sport"], 2),
          ev({ status: "rumor", to: "chelsea" }, ["ESPN"], 2),
        ],
        2,
      ),
    ).toEqual({ player: "harry-kane", status: "rumor", tier: 2 });
    expect(
      combineTransferClaims(
        [
          ev({ status: "rumor", to: "arsenal" }, ["BBC Sport"], 2),
          ev({ status: "rumor", from: "arsenal" }, ["ESPN"], 2),
        ],
        2,
      ),
    ).toEqual({ player: "harry-kane", status: "rumor", tier: 2 });
  });

  it("bestTierOf — 설정에 있는 소스 중 가장 높은 Tier(숫자 작은 쪽), 없으면 null", () => {
    expect(
      bestTierOf(["interfootball-all", "bbc-sport-football"], SOURCE_BY_ID),
    ).toBe(2);
    expect(bestTierOf(["interfootball-all"], SOURCE_BY_ID)).toBe(3);
    expect(bestTierOf(["unknown-source"], SOURCE_BY_ID)).toBeNull();
  });

  it("tier = 클러스터 최고 출처 Tier — `clusterSourceMeta(cluster).bestTier`와 같다(M1-13 이월), 국내 2곳이면 official 승격", () => {
    const group = (
      key: string,
      title: string,
      lang: string,
      sources: string[],
      at: string,
    ): DedupGroup => {
      const item: FeedItem = {
        title,
        url: `https://example.com/${key}`,
        publishedAt: at,
        summary: null,
        source: sources[0]!,
        author: null,
        authors: [],
        lang,
      };
      return { key, item, sources, count: sources.length };
    };
    const cluster = toCluster(
      [
        group(
          "a",
          "[오피셜] 김민재, 아스널 이적…이적료 5000만 유로",
          "ko",
          ["interfootball-world", "interfootball-all"],
          "2026-10-17T01:00:00.000Z",
        ),
        group(
          "b",
          "[오피셜] 김민재, 아스널 입단 확정",
          "ko",
          ["besteleven-world"],
          "2026-10-17T02:00:00.000Z",
        ),
      ],
      SOURCE_BY_ID,
    );
    const a = analyzeCluster(cluster, CTX);
    expect(a.transfer).toEqual({
      player: "kim-min-jae",
      to: "arsenal",
      status: "official",
      tier: 3,
    });
    expect(a.transfer?.tier).toBe(
      clusterSourceMeta(cluster, SOURCE_BY_ID)?.bestTier,
    );

    const mixed = toCluster(
      [
        cluster.members[0]!,
        group(
          "c",
          "Arsenal eye Kim Min-jae transfer",
          "en",
          ["bbc-sport-european"],
          "2026-10-17T03:00:00.000Z",
        ),
      ],
      SOURCE_BY_ID,
    );
    const m = analyzeCluster(mixed, CTX);
    expect(m.transfer?.tier).toBe(2);
    expect(m.transfer?.tier).toBe(
      clusterSourceMeta(mixed, SOURCE_BY_ID)?.bestTier,
    );
    // official을 말한 기사는 국내 1곳뿐 — 카드 tier가 2여도 negotiating
    expect(m.transfer?.status).toBe("negotiating");
  });
});

describe("⑤ 카테고리 연동", () => {
  it("transfer는 카테고리 '이적' 카드에만 — 대표팀·결과·부상 카드에는 없다", () => {
    const national = analyze(
      "England call up Arsenal's Bukayo Saka after transfer links",
      "en",
    );
    expect(national.cat).toBe("national");
    expect(national.transfer).toBeUndefined();
  });

  it("'이강인 이적 설득한 코케, 부상 이탈' — 지난 이적을 꾸미는 말은 이적 화제가 아니다(M1-17 이월) → 부상, transfer 없음", () => {
    const a = analyze(
      "[오피셜] ATM 대형 악재...'이강인 이적 설득한' 코케, 왼쪽 허벅지 부상으로 이탈!",
      "ko",
    );
    expect(a.cat).toBe("injury");
    expect(a.transfer).toBeUndefined();
    const topic = compileGroup(TRANSFER_TERMS);
    const has = (t: string) => matchesGroup(titleText(t, "ko"), topic);
    expect(has("이강인 이적 설득한 코케")).toBe(false);
    expect(has("나폴리 이적 이끈 인물")).toBe(false);
    expect(has("여름에 영입한 수비수")).toBe(false);
    expect(has("리버풀로 이적한 바르콜라")).toBe(false);
    expect(has("아틀레티코 이적하자마자 주연")).toBe(false);
    // 지금 소식은 그대로
    expect(has("김민재, 아스널로 이적한다")).toBe(true);
    expect(has("레알, 음바페 영입했다")).toBe(true);
    expect(has("김민재 이적설")).toBe(true);
  });

  it("국내 'T행'은 이적 화제(카테고리 이적) — 여행·원정('뮌헨행 비행기')은 아니다", () => {
    expect(analyze("김민재, 아스널행 임박", "ko").cat).toBe("transfer");
    const tags = (t: string) => matchTitleTags(t, "ko", CTX.tags).teams;
    expect(
      koBoundForTeam(
        "김민재, 아스널행 임박",
        "ko",
        tags("김민재, 아스널행 임박"),
      ),
    ).toBe(true);
    expect(
      koBoundForTeam(
        "대표팀, 뮌헨행 비행기 탑승",
        "ko",
        tags("대표팀, 뮌헨행 비행기 탑승"),
      ),
    ).toBe(false);
    expect(koBoundForTeam("Bayern bound for Munich", "en", [])).toBe(false);
  });

  it("스페인어 'ficha a'도 이적 화제('El Barcelona ficha a Kane')", () => {
    expect(analyze("El Barcelona ficha a Harry Kane", "es").cat).toBe(
      "transfer",
    );
  });

  it("카드에 들어간 transfer는 NewsCard 스키마(부록 A — player·from?·to?·status·tier)를 통과하고, 없으면 키 자체가 없다", () => {
    const item: FeedItem = {
      title: "Arsenal agree £100m fee for Bayern striker Harry Kane",
      url: "https://www.bbc.co.uk/sport/football/articles/c0kane01o",
      publishedAt: "2026-10-17T00:00:00.000Z",
      summary: null,
      source: "bbc-sport-football",
      author: null,
      authors: [],
      lang: "en",
    };
    const analysis = analyze(item.title, "en");
    const card = buildCard(
      item,
      SOURCE_BY_ID.get("bbc-sport-football")!,
      "2026-10-17T00:10:00.000Z",
      [],
      {
        score: {} as never,
        classification: {
          cat: analysis.cat,
          comp: analysis.comp,
          teams: analysis.teams,
          players: analysis.players,
          imp: 3,
          kr: analysis.kr,
          spoiler: analysis.spoiler,
          ...(analysis.transfer ? { transfer: analysis.transfer } : {}),
        },
      },
    );
    expect(NewsCardSchema.parse(card).transfer).toEqual({
      player: "harry-kane",
      from: "bayern-munchen",
      to: "arsenal",
      status: "agreed",
      tier: 2,
    });
    const plain = analyze("Arsenal beat Chelsea 2-1", "en");
    expect("transfer" in plain).toBe(false);
  });
});

describe("⑥ fixtures 손 판정 대비 — 오탐·잘못된 방향·과대 단계 0", () => {
  interface Row {
    id: string;
    source: string;
    lang: string;
    title: string;
  }
  const rows: Row[] = [];
  const cluster = readJson("fixtures/cluster/titles-2026-10-15.json") as {
    items: Array<{ id: string; source: string; lang: string; title: string }>;
  };
  for (const it of cluster.items) rows.push(it);
  const rssIndex = readJson("fixtures/rss/index.json") as {
    sources: Array<{
      id: string;
      lang: string;
      items: Array<{ pos: number; title: string; tags: string[] }>;
    }>;
  };
  const rssLabels = new Map<string, string>();
  for (const s of rssIndex.sources) {
    for (const it of s.items) {
      const id = `${s.id}#${it.pos}`;
      rows.push({ id, source: s.id, lang: s.lang, title: it.title });
      const label = it.tags.find((t) => t.startsWith("transfer:"));
      if (label) rssLabels.set(id, label.slice("transfer:".length));
    }
  }
  const sample = NewsFileSchema.parse(readJson("fixtures/news-sample.json"));
  const byPublisher = new Map(
    SOURCES.map((s) => [
      s.name.split(" — ")[0]!.replace(/\s*\([^)]*\)\s*$/u, ""),
      s.id,
    ]),
  );
  for (const c of sample.cards) {
    rows.push({
      id: c.id,
      source: byPublisher.get(c.src[0]!.n) ?? "bbc-sport-football",
      lang: c.lang,
      title: c.t,
    });
  }
  // 같은 제목은 처음 나온 행(cluster → rss → news-sample 순)만
  const firstRows = new Map<string, Row>();
  for (const r of rows) {
    const key = `${r.lang}|${r.title}`;
    if (!firstRows.has(key)) firstRows.set(key, r);
  }
  const unique = [...firstRows.values()];

  const transfersOf = (ctx: ClassifyContext) =>
    new Map(
      unique.flatMap((r) => {
        const a = analyzeItems(
          [
            {
              title: r.title,
              lang: r.lang,
              summary: null,
              sources: [r.source],
              publishedAt: "2026-10-15T00:00:00Z",
            },
          ],
          ctx,
        );
        return a.transfer ? [[r.id, a.transfer] as const] : [];
      }),
    );

  it(`현재 사전 — ${unique.length}건 중 이적 정보는 손 판정과 같은 3건뿐(오탐 0, 방향 손 판정 일치)`, () => {
    expect(unique.length).toBeGreaterThan(300);
    expect(Object.fromEntries(transfersOf(CTX))).toEqual({
      // ‘미쳤다’ 김민재 아스널 이적 가능성! — 행선지 아스널(‘T 이적’), 가능성 → rumor
      t088: { player: "kim-min-jae", to: "arsenal", status: "rumor", tier: 3 },
      // 김민재, 21호 코리안 프리미어리거 등극하나…나폴리 이적 이끈 인물이 — 나폴리는 지난 이적(방향 아님), 아스널은 방향 표현 없음
      t118: { player: "kim-min-jae", status: "rumor", tier: 3 },
      // 엔드릭 겨울 임대설 — 행선지 없음
      t156: { player: "endrick", status: "rumor", tier: 3 },
    });
  });

  it("사전 확장 흉내 — 미등록 선수 기사도 방향·단계가 손 판정을 넘지 않는다(rss 이적 손 판정 7건: 일치 2 · 생략 5)", () => {
    const got = transfersOf(CTX_EXT);
    // 손 판정(사람이 제목만 보고 — 방향은 제목에 있는 것만)
    expect(Object.fromEntries(got)).toEqual({
      t002: {
        player: "test-sancho",
        to: "getafe",
        status: "negotiating",
        tier: 2,
      },
      // t046 'Napoli back McTominay to stay amid Real links - gossip' — 'amid' 뒤(Real links)는 다른 절, 선수 절에 단계 근거 없음 → 생략
      t088: { player: "kim-min-jae", to: "arsenal", status: "rumor", tier: 3 },
      t118: { player: "kim-min-jae", status: "rumor", tier: 3 },
      t150: { player: "test-sancho", to: "getafe", status: "rumor", tier: 3 },
      t156: { player: "endrick", status: "rumor", tier: 3 },
      // t190 '[오피셜] 레알서 150억 받던 ‘레전드’ 카르바할, …' — 선수가 절 첫머리 주어가 아니라 머리표를 그 선수에게 걸지 않음 → 생략
      t195: { player: "test-scott", status: "rumor", tier: 3 },
      // 'Carvajal joins Getafe' — 방향 동사만인 단일 Tier 2 출처 → agreed(D52 ①)
      t236: {
        player: "test-carvajal",
        to: "getafe",
        status: "agreed",
        tier: 2,
      },
      "bbc-sport-football#2": {
        player: "test-scott",
        to: "milan",
        status: "rumor",
        tier: 2,
      },
      "bbc-sport-european#0": {
        player: "test-balogun",
        to: "everton",
        status: "agreed",
        tier: 2,
      },
      // interfootball-all#6 '[오피셜] 맨유에서 6년 반 뛴 로호, 아직 은퇴 안 했다…' — 로호가 절 첫머리 주어가 아님 → 생략(손 판정 official)
    });
    // rss 손 판정 대비: 과대 단계 0
    const rank = ["rumor", "negotiating", "agreed", "official"];
    for (const [id, label] of rssLabels) {
      const t = got.get(id);
      if (!t || label === "collapsed" || t.status === "collapsed") continue;
      expect(rank.indexOf(t.status), id).toBeLessThanOrEqual(
        rank.indexOf(label),
      );
    }
    // 생략 5건: daily-briefing 묶음·선수 없음 3 + 알바레스(에이전트 기사 — 결렬 손 판정) + 로호(주어 자리 아님 — official 손 판정)
    expect([...rssLabels.keys()].filter((id) => !got.has(id)).sort()).toEqual([
      "daily-briefing#0",
      "daily-briefing#1",
      "daily-briefing#2",
      "interfootball-all#6",
      "interfootball-all#7",
    ]);
  });

  it("news-sample 손 판정(M0-34)의 transfer와 어긋나지 않는다 — 현재 사전에서는 두 카드 모두 미등록 이름이라 생략", () => {
    const got = transfersOf(CTX);
    for (const c of sample.cards) {
      const t = got.get(c.id);
      if (c.transfer === undefined) {
        expect(t, c.t).toBeUndefined();
      } else if (t !== undefined) {
        expect(t.player).toBe(c.transfer.player);
      }
    }
    expect(sample.cards.filter((c) => c.transfer).length).toBe(2);
    expect(sample.cards.filter((c) => got.has(c.id)).length).toBe(0);
  });
});

describe("⑦ 리뷰 1회차 회귀(M1-18) — 오탐 0 · D52 사용자 결정", () => {
  /** 제목 1건 — 주장(카테고리와 무관)과 카드 transfer가 모두 없다 */
  const none = (title: string, lang: string) => {
    expect(claimOf(title, lang).claim, title).toBeUndefined();
    expect(analyze(title, lang).transfer, title).toBeUndefined();
  };

  /** 구성 묶음 여러 개 클러스터의 분석 */
  const clusterOf = (
    rows: ReadonlyArray<
      [title: string, lang: string, source: string, at: string]
    >,
  ) =>
    analyzeItems(
      rows.map(([title, lang, source, at]) => ({
        title,
        lang,
        summary: null,
        sources: [source],
        publishedAt: at,
      })),
      CTX,
    );

  it("차단 1 — 'P joins T'·'P signs for T' 뒤 문맥이 이적이 아니면(부상 명단·스쿼드·투어·레전드·팬) 방향도 단계도 없다", () => {
    none("Jude Bellingham joins Real Madrid's injury list", "en");
    none("Erling Haaland joins Manchester City squad for US tour", "en");
    none("Mohamed Salah joins Liverpool legends in 250 club", "en");
    none("Lamine Yamal signs for Barcelona fans", "en");
    // 정상 — 'on loan from S'·'in £… deal'
    expect(
      tr("Harry Kane joins Arsenal on loan from Bayern Munich", "en"),
    ).toEqual({
      player: "harry-kane",
      from: "bayern-munchen",
      to: "arsenal",
      status: "agreed",
      tier: 2,
    });
    expect(tr("Harry Kane joins Arsenal in £100m deal", "en")?.to).toBe(
      "arsenal",
    );
  });

  it("차단 2 — 단계 표현이 그 선수의 것이 아니면(종속절·다른 주어·다른 역할 명사·꾸밈) 생략", () => {
    none(
      "Harry Kane scores as Bayern Munich confirm signing of defender",
      "en",
    );
    none("Erling Haaland watches on as Manchester City complete signing", "en");
    none("Bayern Munich complete signing of striker to rival Harry Kane", "en");
    none("Arsenal agree fee for winger who idolised Bukayo Saka", "en");
    none("Bukayo Saka reacts as Arsenal agree fee for winger", "en");
    none("Harry Kane segna e il Milan trova l'accordo con il Bayern", "it");
    none(
      "Lamine Yamal celebra el acuerdo del Barcelona con un nuevo delantero",
      "es",
    );
    none(
      "Gol de Lamine Yamal mientras el Barcelona cierra el fichaje de un central",
      "es",
    );
    none("김민재는 벤치, 바이에른은 수비수 영입 확정", "ko");
    // 매체 2곳이 같은 제목을 내도 생략(그 선수의 단계 근거가 없다)
    const two = clusterOf([
      [
        "김민재는 벤치, 바이에른은 수비수 영입 확정",
        "ko",
        "interfootball-world",
        "2026-10-17T01:00:00Z",
      ],
      [
        "김민재는 벤치, 바이에른은 수비수 영입 확정",
        "ko",
        "besteleven-world",
        "2026-10-17T01:10:00Z",
      ],
    ]);
    expect(two.transfer).toBeUndefined();
  });

  it("중요 3 — 'here we go'는 그 절에 의문·부정·임박이 없을 때만 agreed", () => {
    expect(tr("Not here we go yet: Harry Kane to Arsenal", "en")?.status).toBe(
      "rumor",
    );
    expect(
      tr(
        "No here we go yet - Harry Kane to Arsenal still being negotiated",
        "en",
      )?.status ?? "none",
    ).not.toBe("agreed");
    expect(tr("Harry Kane to Arsenal: here we go soon", "en")?.status).toBe(
      "rumor",
    );
    expect(
      tr("Here we go! Harry Kane to Arsenal, transfer done", "en")?.status,
    ).toBe("agreed");
  });

  it("중요 4 — 결렬 제외는 금액을 지우기 전 글로('8강 불발'), 최종 결렬이면 결렬 주장의 방향만(진행 주장의 행선지를 빌리지 않는다)", () => {
    const t = tr("김민재, 아스널 이적설 속 바이에른 8강 불발", "ko");
    expect(t?.status).not.toBe("collapsed");
    const c = clusterOf([
      [
        "첼시, 김민재 영입 추진",
        "ko",
        "footballist-football",
        "2026-10-17T01:00:00Z",
      ],
      [
        "김민재, 아스널 이적 무산",
        "ko",
        "interfootball-world",
        "2026-10-17T03:00:00Z",
      ],
      [
        "김민재, 아스널 이적 무산",
        "ko",
        "besteleven-world",
        "2026-10-17T03:10:00Z",
      ],
    ]);
    // 결렬 문형 자신의 행선지(아스널) — 진행 주장(첼시)을 빌리지 않는다
    expect(c.transfer).toEqual({
      player: "kim-min-jae",
      to: "arsenal",
      status: "collapsed",
      tier: 3,
    });
    expect(
      combineTransferClaims(
        [
          {
            claim: {
              player: "harry-kane",
              status: "rumor",
              to: "chelsea",
              evidence: [],
            },
            publishers: ["BBC Sport"],
            tier: 2,
            atMs: 100,
          },
          {
            claim: {
              player: "harry-kane",
              status: "collapsed",
              to: "arsenal",
              evidence: [],
            },
            publishers: ["the Daily Briefing"],
            tier: 2,
            atMs: 200,
          },
        ],
        2,
      ),
    ).toEqual({
      player: "harry-kane",
      to: "arsenal",
      status: "collapsed",
      tier: 2,
    });
  });

  it("중요 5 — 국내 지난 이적('PSG행 이후'·'PSG행 당시'·'영입 당시'·'이적 1주년')은 이적 정보도 이적 카테고리도 아니다", () => {
    for (const title of [
      "이강인 PSG행 이후 첫 골",
      "이강인 PSG행 당시 비화 공개",
      "PSG, 이강인 영입 당시 비화",
      "나폴리, 김민재 영입 당시 이적료 공개",
      "김민재 나폴리 이적 1주년",
    ]) {
      const a = analyze(title, "ko");
      expect(a.transfer, title).toBeUndefined();
      expect(a.cat, title).not.toBe("transfer");
    }
  });

  it("중요 6 — 'T행' 여행·경기 표현(결승·무대·전세기·열차·버스)이거나 같은 절에 단계 단서가 없으면 이적 화제가 아니다", () => {
    for (const title of [
      "이강인, 결승 앞두고 뮌헨행",
      "이강인, UCL 결승 무대 뮌헨행",
      "김민재, 리버풀행 전세기",
      "바르셀로나행 열차 탄 이강인",
      "이강인, 레알 마드리드행 버스 탑승",
      "이강인, 뮌헨행",
    ]) {
      const a = analyze(title, "ko");
      expect(a.cat, title).not.toBe("transfer");
      expect(a.transfer, title).toBeUndefined();
    }
    // 단서가 있으면 이적(손 판정 t150 '…헤타페행 가능성 제기')
    expect(
      analyze(
        "카르바할처럼 연봉 1/10만 받을까? 갈 곳 없는 ‘FA’ 산초, 이번엔 스페인 클럽 헤타페행 가능성 제기",
        "ko",
      ).cat,
    ).toBe("transfer");
    expect(tr("김민재, 아스널행?", "ko")?.to).toBe("arsenal");
  });

  it("중요 7 — 'T 이적 금지·자금·시장'(띄어 쓴 합성 명사)은 행선지가 아니다", () => {
    for (const title of [
      "김민재 아스널 이적 금지 징계",
      "김민재, 아스널 이적 자금 마련",
      "김민재, 아스널 이적 시장 최대어",
    ]) {
      expect(tr(title, "ko")?.to, title).toBeUndefined();
    }
  });

  it("중요 8 — 제목에 부상 낱말이 있으면 메디컬은 agreed 근거가 아니다", () => {
    for (const [title, lang] of [
      ["Harry Kane passes medical test after injury scare", "en"],
      ["Harry Kane undergoes medical tests on knee", "en"],
      ["Harry Kane, visite mediche per l'infortunio al ginocchio", "it"],
    ] as const) {
      expect(tr(title, lang)?.status ?? "none", title).not.toBe("agreed");
    }
    expect(tr("Harry Kane undergoes medical at Arsenal", "en")?.status).toBe(
      "agreed",
    );
  });

  it("권장 15 — 'signed off'(승인)은 official이 아니고, 계약 기간은 'signs for'·'joins'·'commits'·'new deal' 꼴에서만 재계약 단서('here we go'·'P to T'는 주장 — D54 결정)", () => {
    expect(
      tr("Liverpool have signed off on Alexander Isak bid", "en")?.status ??
        "none",
    ).not.toBe("official");
    expect(
      claimOf("Cole Palmer signs for Chelsea until 2033", "en").claim,
    ).toBeUndefined();
    expect(
      claimOf("Harry Kane joins Arsenal on loan until 2027", "en").claim,
    ).toBeUndefined();
    expect(
      tr("Here we go! Harry Kane to Arsenal, contract until 2030", "en"),
    ).toEqual({
      player: "harry-kane",
      to: "arsenal",
      status: "agreed",
      tier: 2,
    });
    // 한국 선수가 지금 소속(바이에른)이 아닌 팀으로 — 계약 기간이 있어도 이적
    expect(tr("김민재, 2030년까지 아스널 이적 합의", "ko")?.to).toBe("arsenal");
  });

  it("권장 12 — 붙여 쓴 합성어도 문형이 읽는다('완전이적 확정'·'전격영입 발표') — {팀} 슬롯은 있어야 한다", () => {
    expect(claimOf("김민재, 아스널 완전이적 확정", "ko").claim?.status).toBe(
      "official",
    );
    expect(claimOf("김민재, 완전이적 확정", "ko").claim).toBeUndefined();
    expect(claimOf("맨유, 김민재 전격영입 발표", "ko").claim).toMatchObject({
      status: "official",
      explicit: true,
      to: "manchester-united",
    });
  });

  it("권장 11 — 'T행' 이적 화제는 점수화 이적 배수도 받는다(score.ts `transferTopic`)", () => {
    const group = (title: string): DedupGroup => ({
      key: "k",
      item: {
        title,
        url: "https://example.com/a",
        publishedAt: "2026-10-17T00:00:00.000Z",
        summary: null,
        source: "interfootball-world",
        author: null,
        authors: [],
        lang: "ko",
      },
      sources: ["interfootball-world"],
      count: 1,
    });
    const cluster = toCluster([group("김민재, 아스널행 임박")], SOURCE_BY_ID);
    const base = {
      now: "2026-10-17T01:00:00.000Z",
      sourceById: SOURCE_BY_ID,
      keywords: CTX.keywords,
    };
    expect(clusterSignals(cluster, base).transfer).toBe(false);
    const a = analyzeCluster(cluster, CTX);
    expect(a.transferTopic).toBe(true);
    expect(
      clusterSignals(cluster, { ...base, transferTopic: () => a.transferTopic })
        .transfer,
    ).toBe(true);
  });

  describe("D52 사용자 결정(2026-10-17)", () => {
    it("① 방향·완료 동사만인 단일 Tier 2 출처 → agreed, 명시 표현 → official, 매체 2곳 → official", () => {
      expect(tr("Harry Kane joins Arsenal on loan", "en")?.status).toBe(
        "agreed",
      );
      expect(tr("Arsenal sign Harry Kane on loan", "en")?.status).toBe(
        "agreed",
      );
      expect(tr("Arsenal confirm signing of Harry Kane", "en")).toEqual({
        player: "harry-kane",
        to: "arsenal",
        status: "official",
        tier: 2,
      });
      expect(
        tr("Official: Harry Kane joins Arsenal on loan", "en")?.status,
      ).toBe("official");
      expect(
        tr("Harry Kane ficha por el Barcelona: es oficial", "es")?.status,
      ).toBe("official");
      // 매체 2곳(BBC·the Daily Briefing)이 방향 동사로 official을 말함 → official
      expect(
        clusterOf([
          [
            "Harry Kane joins Arsenal on loan",
            "en",
            "bbc-sport-football",
            "2026-10-17T01:00:00Z",
          ],
          [
            "Harry Kane signs for Arsenal on loan",
            "en",
            "daily-briefing",
            "2026-10-17T01:30:00Z",
          ],
        ]).transfer,
      ).toEqual({
        player: "harry-kane",
        to: "arsenal",
        status: "official",
        tier: 2,
      });
      // 같은 매체 두 피드(BBC Football·Premier League)는 1곳 — agreed
      expect(
        clusterOf([
          [
            "Harry Kane joins Arsenal on loan",
            "en",
            "bbc-sport-football",
            "2026-10-17T01:00:00Z",
          ],
          [
            "Harry Kane signs for Arsenal on loan",
            "en",
            "bbc-sport-premier-league",
            "2026-10-17T01:30:00Z",
          ],
        ]).transfer?.status,
      ).toBe("agreed");
      // 국내 명시 표현 1곳(Tier 3) — official·agreed 조건 모두 미달 → negotiating
      expect(
        tr("[오피셜] 김민재, 아스널 이적…이적료 5000만 유로", "ko"),
      ).toEqual({
        player: "kim-min-jae",
        to: "arsenal",
        status: "negotiating",
        tier: 3,
      });
    });

    it("② 결렬도 승격 조건 — 단일 Tier 3 결렬은 버리고 진행 단계 유지(결렬 주장뿐이면 생략), Tier 2·매체 2곳이면 collapsed", () => {
      expect(tr("김민재, 아스널 이적 무산", "ko")).toBeUndefined();
      expect(
        clusterOf([
          [
            "김민재, 아스널 이적설",
            "ko",
            "footballist-football",
            "2026-10-17T01:00:00Z",
          ],
          [
            "김민재, 아스널 이적 무산",
            "ko",
            "interfootball-world",
            "2026-10-17T03:00:00Z",
          ],
        ]).transfer,
      ).toEqual({
        player: "kim-min-jae",
        to: "arsenal",
        status: "rumor",
        tier: 3,
      });
      expect(tr("Harry Kane transfer to Arsenal falls through", "en")).toEqual({
        player: "harry-kane",
        to: "arsenal",
        status: "collapsed",
        tier: 2,
      });
    });

    it("③ 팀이 하나여도 방향 표현이 확실하면 행선지(출발은 제목에 없으면 비움)", () => {
      expect(tr("Harry Kane joins Arsenal on loan", "en")).toEqual({
        player: "harry-kane",
        to: "arsenal",
        status: "agreed",
        tier: 2,
      });
      expect(tr("김민재, 아스널행 임박", "ko")).toEqual({
        player: "kim-min-jae",
        to: "arsenal",
        status: "rumor",
        tier: 3,
      });
      expect(tr("김민재, 아스널 이적설", "ko")?.from).toBeUndefined();
    });
  });
});

describe("⑧ 리뷰 2회차 회귀(D54 — 높은 단계는 닫힌 문형만) — 오탐 0", () => {
  const RANK: Record<string, number> = {
    rumor: 0,
    collapsed: 0,
    negotiating: 1,
    agreed: 2,
    official: 3,
  };
  /**
   * 리뷰어 판정과 구현 판정이 다른 항목(이유와 함께) — 오탐이 아니라 재현율 확인·해석 차이다.
   *   - '김민재, 아스널 이적설에 미소': 자기 이적설에 대한 반응 — 'T 이적설'은 그 선수의 행선지 루머(t088 '아스널 이적 가능성'과 같은 꼴)
   *   - 'Harry Kane al Milan fino al 2030'·'Marcus Rashford leaves …'·'Atletico Madrid eye …': 이적 화제 표(M1-17 `TRANSFER_TERMS`)에 없는
   *     꼴이라 카테고리부터 이적이 아니다(재현율 손실 — 'leaves'·'eye'·'al'은 화제 표에 넣기엔 너무 흔하다)
   */
  const INTENDED: Record<string, "none" | Partial<CardTransfer>> = {
    "김민재, 아스널 이적설에 미소": { to: "arsenal", status: "rumor" },
    "Harry Kane al Milan fino al 2030": "none",
    "Marcus Rashford leaves Manchester United for Manchester City": "none",
    "Atletico Madrid eye Real Madrid's Jude Bellingham": "none",
  };
  const run = (p: ReviewProbe) => {
    const items = p.items ?? [{ title: p.t!, lang: p.l!, source: p.src }];
    return analyzeItems(
      items.map((x, i) => ({
        title: x.title,
        lang: x.lang,
        summary: null,
        sources: Array.isArray(x.source)
          ? x.source
          : [x.source ?? SOURCE_FOR[x.lang]!],
        publishedAt:
          x.at ??
          new Date(
            Date.parse("2026-10-17T00:00:00Z") + i * 60000,
          ).toISOString(),
      })),
      CTX,
    ).transfer;
  };

  it(`리뷰 하네스 ${REVIEW_PROBES.length}문장 — 리뷰어 기대(생략·단계 상한·금지 행선지) 그대로, 다른 판정은 INTENDED에 이유와 함께`, () => {
    expect(REVIEW_PROBES.length).toBe(149);
    for (const p of REVIEW_PROBES) {
      const title = p.t ?? p.items!.map((i) => i.title).join(" ⟂ ");
      const t = run(p);
      const intended = INTENDED[title];
      if (intended !== undefined) {
        if (intended === "none") expect(t, title).toBeUndefined();
        else expect(t, title).toMatchObject(intended);
        continue;
      }
      const e = p.exp;
      if (e === "none") {
        expect(t, title).toBeUndefined();
        continue;
      }
      if (e.status) expect(t?.status, title).toBe(e.status);
      if (e.to !== undefined && (t || e.to !== null)) {
        expect(t?.to ?? null, title).toBe(e.to);
      }
      if (t) {
        if (e.max) {
          expect(RANK[t.status]!, title).toBeLessThanOrEqual(RANK[e.max]!);
        }
        if (e.notTo) expect(t.to, title).not.toBe(e.notTo);
      }
    }
  });

  it("차단 1 변형 — 'joins'·'signs for' 뒤가 꼬리 슬롯 밖이면(as ambassador·while injured·in Dubai·in the gala) 생략", () => {
    for (const [title, lang] of [
      ["Mohamed Salah joins Liverpool as club ambassador", "en"],
      ["Bukayo Saka joins Arsenal as injury blow hits England", "en"],
      ["Harry Kane joins Bayern Munich while injured", "en"],
      ["Bukayo Saka joins Arsenal in Dubai for warm-weather training", "en"],
      ["Lamine Yamal ficha por el Barcelona en la gala de los premios", "es"],
      ["Harry Kane joins Arsenal | official?", "en"],
      ["Kylian Mbappé joins Real Madrid - what does it mean?", "en"],
      ["Kylian Mbappé joins Real Madrid as Galactico", "en"],
    ] as const) {
      expect(tr(title, lang), title).toBeUndefined();
    }
    // 정상(꼬리 슬롯 안)
    expect(tr("Bukayo Saka joins Chelsea in £100m deal", "en")?.status).toBe(
      "agreed",
    );
  });

  it("차단 2 변형 — 문형 절의 선수에 꾸밈말(…'s younger brother·best friend·the next·hermano de·'제2의'·닮은·친형)이 붙거나 다른 사람 이야기면 생략", () => {
    for (const [title, lang] of [
      [
        "Real Madrid confirm signing of Jude Bellingham's younger brother",
        "en",
      ],
      [
        "Bayern Munich confirm signing of Harry Kane's new strike partner",
        "en",
      ],
      ["Arsenal complete signing of Bukayo Saka's England team-mate", "en"],
      ["Chelsea sign Bukayo Saka's best friend", "en"],
      ["Chelsea sign 'the next Bukayo Saka'", "en"],
      ["Chelsea sign the new Bukayo Saka", "en"],
      [
        "El Barcelona cierra el fichaje del hermano pequeño de Lamine Yamal",
        "es",
      ],
      [
        "Il Milan chiude la trattativa per il fratello minore di Harry Kane",
        "it",
      ],
      ["Bukayo Saka reacts to Arsenal transfer talks with winger", "en"],
      ["Harry Kane praises Bayern Munich transfer target", "en"],
      ["Harry Kane - Bayern Munich agree fee", "en"],
      ["이강인, 쿠보 레알 이적 확정에 축하", "ko"],
      ["김민재, 우파메카노 레알 이적 합의에 '아쉽다'", "ko"],
      ["아스널, '제2의 김민재' 영입 확정", "ko"],
      ["김민재 친형 아스널 입단 확정", "ko"],
      ["김민재·이강인, 나란히 아스널 이적설", "ko"],
      ["김민재 이어 이강인도 아스널 이적 임박", "ko"],
      ["Calciomercato, Harry Kane al Milan per una cena di beneficenza", "it"],
    ] as const) {
      expect(tr(title, lang), title).toBeUndefined();
    }
  });

  it("차단 3·4 — 예정·의문·부정('to announce'·'official?'·'발표 앞둬'·'확정적'·'확정 수순')은 높은 단계가 아니다(rumor 이하)", () => {
    for (const [title, lang] of [
      ["Arsenal will confirm signing of Bukayo Saka", "en"],
      ["Arsenal set to confirm signing of Bukayo Saka", "en"],
      ["Harry Kane transfer to Arsenal - official?", "en"],
      ["아스널, 김민재 영입 발표 앞둬", "ko"],
      ["김민재, 아스널 입단 확정 수순", "ko"],
      ["김민재, 아스널 영입 확정 단계", "ko"],
    ] as const) {
      const t = tr(title, lang);
      expect(t?.status ?? "none", title).not.toMatch(
        /^(?:negotiating|agreed|official)$/u,
      );
    }
  });

  it("결렬 오탐 — 결렬 문형 밖('…결렬설'·'불발 아쉬움 털고'·'pulls out of England squad')은 결렬이 아니다", () => {
    for (const [title, lang] of [
      ["Bukayo Saka pulls out of England squad, Chelsea transfer talk", "en"],
      ["김민재 아스널 이적 결렬설", "ko"],
      ["김민재, 이적 불발 아쉬움 털고 맹활약", "ko"],
      ["Bukayo Saka walks away from Arsenal contract talks", "en"],
    ] as const) {
      expect(tr(title, lang)?.status ?? "none", title).not.toBe("collapsed");
    }
    expect(tr("Bukayo Saka move to Chelsea collapses", "en")).toEqual({
      player: "bukayo-saka",
      to: "chelsea",
      status: "collapsed",
      tier: 2,
    });
  });

  it("'here we go'는 agreed 근거(FR-103 — official 아님), 계약 기간 꼬리도 허용", () => {
    for (const title of [
      "Here we go! Kylian Mbappé to Real Madrid, contract until 2029",
      "Kylian Mbappé to Real Madrid, here we go - contract until 2029",
      "Here we go! Kylian Mbappé to Real Madrid, five-year deal",
      "Kylian Mbappé to Real Madrid, here we go! Five-year contract signed",
    ]) {
      expect(tr(title, "en"), title).toEqual({
        player: "kylian-mbappe",
        to: "real-madrid",
        status: "agreed",
        tier: 2,
      });
    }
  });

  it("매체 2곳 — 같은 매체 두 피드(BBC Football·European, 인터풋볼 두 피드)는 1곳, 서로 다른 매체면 official(D52 ①)", () => {
    const pair = (a: [string, string], b: [string, string], lang: string) =>
      analyzeItems(
        [a, b].map(([title, source], i) => ({
          title,
          lang,
          summary: null,
          sources: [source],
          publishedAt: `2026-10-17T0${i}:00:00Z`,
        })),
        CTX,
      ).transfer?.status;
    const JOIN = "Bukayo Saka completes move to Chelsea";
    expect(
      pair([JOIN, "bbc-sport-football"], [JOIN, "bbc-sport-european"], "en"),
    ).toBe("agreed");
    expect(
      pair([JOIN, "bbc-sport-football"], [JOIN, "the-athletic-football"], "en"),
    ).toBe("official");
    const KO = "김민재, 아스널 입단 확정";
    expect(
      pair([KO, "interfootball-world"], [KO, "interfootball-all"], "ko"),
    ).toBe("negotiating");
    expect(
      pair([KO, "interfootball-world"], [KO, "footballist-football"], "ko"),
    ).toBe("official");
  });

  it("권장 13 — 같은 자리 긴 별칭·다른 팀 표기 안의 짧은 표기는 버림('Inter Milan'의 Milan)", () => {
    expect(
      matchTitleTags("Inter Milan eye Rafael Leão", "en", CTX.tags).teams.map(
        (t) => t.slug,
      ),
    ).toEqual(["inter"]);
    expect(tr("Rafael Leão joins Inter Milan", "en")).toMatchObject({
      to: "inter",
    });
  });

  it("권장 15 — 닫힌 문형에 맞는 제목은 이적 화제('Bukayo Saka completes move to Chelsea' — 이적 표에 'completes move'가 없다)", () => {
    expect(analyze("Bukayo Saka completes move to Chelsea", "en").cat).toBe(
      "transfer",
    );
  });
});

describe("⑨ 리뷰 3회차 회귀(오케스트레이터 결정 A~D·차단 1~3·중요 4~10·권장 11~15) — 오탐 0", () => {
  const RANK: Record<string, number> = {
    rumor: 0,
    collapsed: 0,
    negotiating: 1,
    agreed: 2,
    official: 3,
  };
  const KO2 = ["interfootball-world", "footballist-football"];
  /** 묶음 하나(소스 여러 곳일 수 있다)의 카드 transfer */
  const run = (p: ReviewProbe) => {
    const items = p.items ?? [{ title: p.t!, lang: p.l!, source: p.src }];
    return analyzeItems(
      items.map((x, i) => ({
        title: x.title,
        lang: x.lang,
        summary: null,
        sources: Array.isArray(x.source)
          ? x.source
          : [x.source ?? SOURCE_FOR[x.lang]!],
        publishedAt:
          x.at ??
          new Date(
            Date.parse("2026-10-17T00:00:00Z") + i * 60000,
          ).toISOString(),
      })),
      CTX,
    ).transfer;
  };
  const one = (title: string, lang: string, source?: string | string[]) =>
    run({ g: "", t: title, l: lang, src: source, exp: "none" });
  /**
   * 리뷰어 판정과 구현 판정이 다른 항목(이유와 함께).
   *   - '김민재, 아스널 이적 확정 (종합)': 묶음 하나를 국내 매체 2곳(KO2)이 냈다 — D52 ①(매체 2곳)으로 official이 맞다. 꼬리표 '(종합)'을
   *     벗긴 결과는 '김민재, 아스널 이적 확정'(KO2)과 같다(권장 15 재현율 확인)
   */
  const INTENDED_R3: Record<string, "none" | Partial<CardTransfer>> = {
    "김민재, 아스널 이적 확정 (종합)": { to: "arsenal", status: "official" },
  };

  it(`리뷰 하네스 r3 ${REVIEW_PROBES_R3.length}문장 + 표시용 ${REVIEW_PROBES_R3_EXTRA.length}문장 — 기대(생략·단계 상한·금지 행선지·금지 출발) 그대로`, () => {
    expect(REVIEW_PROBES_R3.length).toBe(80);
    for (const p of [...REVIEW_PROBES_R3, ...REVIEW_PROBES_R3_EXTRA]) {
      const title = p.t ?? p.items!.map((i) => i.title).join(" ⟂ ");
      const t = run(p);
      const intended = INTENDED_R3[title];
      if (intended !== undefined) {
        if (intended === "none") expect(t, title).toBeUndefined();
        else expect(t, title).toMatchObject(intended);
        continue;
      }
      const e = p.exp;
      if (e === "none") {
        expect(t, title).toBeUndefined();
        continue;
      }
      if (e.status) expect(t?.status, title).toBe(e.status);
      if (e.to !== undefined && (t || e.to !== null)) {
        expect(t?.to ?? null, title).toBe(e.to);
      }
      if (t) {
        if (e.max) {
          expect(RANK[t.status]!, title).toBeLessThanOrEqual(RANK[e.max]!);
        }
        if (e.notTo) expect(t.to, title).not.toBe(e.notTo);
        if (e.notFrom) expect(t.from, title).not.toBe(e.notFrom);
      }
    }
  });

  it("결정 A (c) — 움직임 근거(from·금액·움직임 낱말·DESC의 다른 팀)가 없는 합의·협상 꼴에만 맞은 제목은 주장이 없다(카테고리는 이적 화제)", () => {
    const kane = (title: string, lang = "en") =>
      matchStagePatterns({
        title,
        lang,
        playerSlug: "harry-kane",
        tags: CTX.tags,
        sourceComps: SOURCE_BY_ID.get(SOURCE_FOR[lang]!)?.competitions ?? [],
      }).map((m) => [m.id, m.moved] as const);
    // 움직임 근거 없음 — 맞아도 moved=false(이적 화제 근거일 뿐)
    for (const [title, lang] of [
      ["Arsenal agree fee for Harry Kane", "en"],
      ["Arsenal agree deal for Harry Kane", "en"],
      ["Harry Kane agrees terms with Arsenal", "en"],
      ["Arsenal in talks over Harry Kane", "en"],
      ["Arsenal hold talks over Harry Kane", "en"],
      ["Harry Kane in talks with Arsenal", "en"],
      ["Arsenal close to deal for Harry Kane", "en"],
      ["Accordo raggiunto tra il Milan e Harry Kane", "it"],
      ["Milan, trattativa per Harry Kane", "it"],
      ["Acuerdo total entre el Barcelona y Harry Kane", "es"],
      ["El Barcelona negocia por Harry Kane", "es"],
    ] as const) {
      const got = kane(title, lang);
      expect(got.length, title).toBeGreaterThan(0);
      expect(
        got.every(([, moved]) => !moved),
        title,
      ).toBe(true);
      // 같은 말에서 나온 방향 규칙('deal for' 사는 쪽)도 근거가 아니다 — 주장 없음, 카테고리는 이적(마무리 조정)
      expect(tr(title, lang), title).toBeUndefined();
      expect(analyze(title, lang).cat, title).toBe("transfer");
    }
    // 리뷰 재현('Bayern Munich agree deal for Harry Kane'·'Barcelona close to deal for Lamine Yamal') — 주장 없음
    const withTopic = (title: string, lang: string) => {
      const s = textSignals(title, lang);
      return transferClaimOf(
        {
          title,
          lang,
          players: matchTitleTags(title, lang, CTX.tags).players.map(
            (p) => p.slug,
          ),
          transfer: true,
          renewal: s.renewal,
          roundup: s.roundup,
        },
        CTX.tags,
      );
    };
    // 이적 화제로 넘겨도(문턱 통과) 주장이 없다 — 움직임 근거 없는 꼴에만 맞았고 선수에게 걸린 rumor 표현이 없다
    for (const title of [
      "Bayern Munich agree deal for Harry Kane",
      "Barcelona close to deal for Lamine Yamal",
      "Harry Kane agrees terms with Arsenal",
      "Arsenal in talks over Harry Kane",
    ]) {
      expect(withTopic(title, "en").claim, title).toBeUndefined();
    }
    for (const title of [
      "Bayern Munich agree deal for Harry Kane",
      "Barcelona close to deal for Lamine Yamal",
      // 문형 밖(나이 꼬리)이어도 'fee for'·'deal for'는 사는 쪽 근거가 아니다('fee'는 움직임 낱말이 아니다)
      "Arsenal agree fee for Bukayo Saka, 23",
    ]) {
      expect(tr(title, "en"), title).toBeUndefined();
    }
    // 'bid for'·'move for'는 사는 쪽 그대로
    expect(tr("Arsenal make bid for Bukayo Saka, 23", "en")).toMatchObject({
      to: "arsenal",
      status: "rumor",
    });
    // 움직임 근거 있음 — 단계
    for (const [title, lang, status] of [
      ["Arsenal agree £100m fee for Harry Kane", "en", "agreed"],
      ["Arsenal agree fee with Bayern Munich for Harry Kane", "en", "agreed"],
      ["Arsenal agree loan deal for Harry Kane", "en", "agreed"],
      ["Arsenal agree fee for Bayern striker Harry Kane", "en", "agreed"],
      ["Harry Kane agrees terms with Arsenal on loan", "en", "agreed"],
      ["Arsenal in transfer talks over Harry Kane", "en", "negotiating"],
      ["Arsenal close to signing Harry Kane", "en", "negotiating"],
      ["El Barcelona negocia el fichaje de Harry Kane", "es", "negotiating"],
      [
        "Acuerdo total entre el Barcelona y Harry Kane, cedido por el Bayern",
        "es",
        "agreed",
      ],
    ] as const) {
      expect(tr(title, lang)?.status, title).toBe(status);
    }
    // 금액·DESC 다른 팀이 움직임 근거('Everton agree £40m fee for Monaco striker Balogun' — 사전 확장 흉내)
    expect(
      tr("Everton agree £40m fee for Monaco striker Balogun", "en", CTX_EXT),
    ).toEqual({
      player: "test-balogun",
      to: "everton",
      status: "agreed",
      tier: 2,
    });
  });

  it("결정 B — signs-form 꼴('T sign P'·'signs for'·'commits'·'new deal')의 'on a N-year contract' 꼬리는 재계약 단서(생략), 새 팀 합류 동사('joins'·'officially joins'·'ficha por')는 빼고, from·금액이 있으면 이적, here we go·'P to T'는 예외", () => {
    for (const title of [
      "Arsenal sign Bukayo Saka on a five-year contract",
      "Cole Palmer signs for Chelsea on nine-year contract",
      "Arsenal sign Bukayo Saka on a two-and-a-half-year contract",
      "Bukayo Saka commits to Arsenal on a long-term deal",
      "Bukayo Saka signs new five-year deal with Arsenal",
    ]) {
      expect(tr(title, "en"), title).toBeUndefined();
    }
    // 새 팀 합류 동사는 계약 길이가 있어도 문형대로(마무리 조정 — 단일 Tier 2 출처면 agreed까지, 명시 표현이면 official)
    expect(tr("Harry Kane joins Arsenal on a five-year deal", "en")).toEqual({
      player: "harry-kane",
      to: "arsenal",
      status: "agreed",
      tier: 2,
    });
    expect(
      tr("Harry Kane officially joins Arsenal on a five-year deal", "en"),
    ).toMatchObject({ to: "arsenal", status: "official" });
    // 계약 기간('until 2030'·'hasta 2030')은 합류 동사에서도 재계약 단서(D54 그대로)
    for (const [title, lang] of [
      ["Harry Kane joins Arsenal until 2030", "en"],
      ["Harry Kane ficha por el Barcelona hasta 2030", "es"],
    ] as const) {
      expect(tr(title, lang), title).toBeUndefined();
    }
    expect(
      tr(
        "Harry Kane joins Arsenal from Bayern Munich on a five-year deal",
        "en",
      ),
    ).toEqual({
      player: "harry-kane",
      from: "bayern-munchen",
      to: "arsenal",
      status: "agreed",
      tier: 2,
    });
    expect(
      tr("Arsenal sign Harry Kane in £100m deal on a five-year contract", "en")
        ?.status,
    ).toBe("agreed");
    expect(
      tr("Here we go! Harry Kane to Arsenal, five-year deal signed", "en"),
    ).toMatchObject({ to: "arsenal", status: "agreed" });
    expect(
      tr("Here we go! Kylian Mbappé to Real Madrid, contract until 2029", "en"),
    ).toMatchObject({ to: "real-madrid", status: "agreed" });
  });

  it("결정 C — 제목에 'here we go'(·'HERE WE GO'·'히어 위 고')가 있으면 그 제목은 agreed가 상한(FR-103)", () => {
    expect(one("'HERE WE GO' 김민재, 아스널 이적 확정", "ko", KO2)).toEqual({
      player: "kim-min-jae",
      to: "arsenal",
      status: "agreed",
      tier: 3,
    });
    expect(one("Here we go! Harry Kane joins Arsenal", "en")).toMatchObject({
      status: "agreed",
    });
    // 매체 2곳이어도 그 제목들은 agreed 상한
    expect(
      run({
        g: "",
        items: [
          {
            title: "Here we go! Harry Kane joins Arsenal",
            lang: "en",
            source: "bbc-sport-football",
          },
          {
            title: "Here we go! Harry Kane joins Arsenal",
            lang: "en",
            source: "the-athletic-football",
          },
        ],
        exp: "none",
      })?.status,
    ).toBe("agreed");
    // '임박'은 HWG 국내 문형 꼬리에서 뺐다(중요 7 — negotiating 상한)
    expect(
      RANK[
        one("'히어 위 고' 김민재, 아스널행 임박", "ko", KO2)?.status ?? "rumor"
      ],
    ).toBeLessThanOrEqual(RANK.negotiating!);
  });

  it("결정 D — 국내 '영입 추진'은 rumor(negotiating은 '영입 협상·제안'만)", () => {
    expect(one("아스널, 김민재 영입 추진", "ko", KO2)).toMatchObject({
      to: "arsenal",
      status: "rumor",
    });
    expect(one("첼시, 김민재 영입 추진 중", "ko", KO2)?.status).toBe("rumor");
    expect(one("아스널, 김민재 영입 제안", "ko", KO2)?.status).toBe(
      "negotiating",
    );
  });

  it("차단 2 — 국내: 통째로 인용한 절·중립 감탄이 아닌 머리 인용·다른 절의 부인/보도/유보·등위 팀이면 문형을 쓰지 않는다", () => {
    const kmj = (title: string) =>
      matchStagePatterns({
        title,
        lang: "ko",
        playerSlug: "kim-min-jae",
        tags: CTX.tags,
      });
    for (const title of [
      "'김민재, 아스널 이적 확정'…바이에른은 부인",
      "‘김민재, 아스널 이적 확정’",
      "김민재, ‘아스널 이적 확정’",
      "'사실무근' 김민재, 아스널 이적 확정",
      "'오보' 김민재 아스널 이적 합의",
      "'아직 아니다' 김민재, 아스널 이적 임박",
      "‘이적료 1000억’ 김민재, 아스널 이적 확정",
      "김민재, 아스널 이적 확정…바이에른은 '사실무근'",
      "김민재, 아스널 이적 확정, 바이에른은 부인",
      "아스널, 김민재 영입 확정…바이에른 '오보다'",
      "김민재, 아스널 이적 확정…현지 보도",
      "김민재, 아스널 이적 확정…쿠보 이적설도",
      "김민재, 아스널 이적 확정 가능성",
      "현지 매체 주장, 김민재, 아스널 이적 확정",
      "아스널, 첼시, 김민재 영입 확정",
      "아스널·첼시, 김민재 영입 확정",
      "아스널과 첼시, 김민재 영입 확정",
    ]) {
      expect(kmj(title), title).toEqual([]);
    }
    // 중립 감탄 머리 인용은 벗긴다(재현율)
    for (const title of [
      "‘미쳤다’ 김민재, 아스널 이적 확정",
      "‘충격’ 김민재, 아스널 이적 확정",
      "'대박' 김민재, 아스널 입단 확정",
    ]) {
      expect(kmj(title)[0], title).toMatchObject({
        id: "ko.official.move-confirmed",
        to: "arsenal",
      });
    }
    // 라틴도 — 다른 절의 부인·보도
    for (const title of [
      "Bukayo Saka joins Chelsea, Arsenal deny",
      "Bukayo Saka joins Chelsea - report",
      "Bukayo Saka joins Chelsea, per Sky Sports",
      "Bukayo Saka joins Chelsea - sources",
      "Bukayo Saka joins Chelsea: claims rubbished",
      "Arsenal and Chelsea agree £100m fee for Bukayo Saka",
    ]) {
      expect(one(title, "en")?.status ?? "none", title).not.toMatch(
        /^(?:negotiating|agreed|official)$/u,
      );
    }
  });

  it("차단 3 — 머리표('[오피셜]'·'Official:')는 첫 절에만 건다(앞의 인용 꼬리표·감탄·무해한 꼬리 절은 건너뛴다)", () => {
    for (const title of [
      "[오피셜] 쿠보, 레알 이적 완료…이강인은 PSG행",
      "[오피셜] 손흥민 LAFC 이적…김민재, 아스널행",
      "[오피셜] 바이에른, 수비수 보강…아스널은 김민재 영입",
    ]) {
      expect(
        RANK[one(title, "ko", KO2)?.status ?? "rumor"]!,
        title,
      ).toBeLessThanOrEqual(RANK.agreed!);
    }
    expect(one("[오피셜] 김민재, 아스널행", "ko", KO2)).toMatchObject({
      status: "official",
      to: "arsenal",
    });
    expect(
      claimOf("[오피셜] ‘이적료 1000억’…김민재, 아스널행", "ko").claim,
    ).toMatchObject({ status: "official", explicit: true, to: "arsenal" });
    expect(
      matchStagePatterns({
        title: "[오피셜] 드디어! 김민재, 아스널행",
        lang: "ko",
        playerSlug: "kim-min-jae",
        tags: CTX.tags,
      })[0],
    ).toMatchObject({ id: "ko.official.head-moves", explicit: true });
    expect(one("[오피셜] 드디어! 김민재, 아스널행", "ko", KO2)).toMatchObject({
      status: "official",
      to: "arsenal",
    });
    expect(
      tr("Official: Done deal - Bukayo Saka joins Chelsea", "en"),
    ).toMatchObject({ status: "official", to: "chelsea" });
    expect(
      tr("Official: Arsenal sign defender - Bukayo Saka joins Chelsea", "en"),
    ).toBeUndefined();
  });

  it("중요 4 — 선수 앞 묘사의 자유 낱말은 허용 목록만('T-linked·-bound·-target·-born·-owned'·'next'·'new'·'rival'은 아니다)", () => {
    for (const title of [
      "Arsenal sign Tottenham-linked star Bukayo Saka",
      "Chelsea complete signing of Arsenal-linked winger Bukayo Saka",
      "Chelsea confirm signing of Arsenal-bound winger Bukayo Saka",
      "Chelsea sign Arsenal-target winger Bukayo Saka",
      "Chelsea sign Arsenal-owned winger Bukayo Saka",
      "Real Madrid confirm signing of Arsenal-born star Bukayo Saka",
    ]) {
      const t = one(title, "en");
      expect(t?.from, title).toBeUndefined();
      expect(RANK[t?.status ?? "rumor"]!, title).toBe(0);
    }
    expect(one("Chelsea sign next star Bukayo Saka", "en")).toBeUndefined();
    // 허용 목록(꾸밈말·국적·태그하지 않은 겹치는 팀 별칭)과 '{T} 역할'은 그대로
    expect(tr("Arsenal sign young striker Harry Kane", "en")?.status).toBe(
      "agreed",
    );
    expect(tr("Arsenal sign England striker Harry Kane", "en")?.status).toBe(
      "agreed",
    );
    expect(tr("Arsenal sign Bayern striker Harry Kane", "en")).toMatchObject({
      from: "bayern-munchen",
      to: "arsenal",
      status: "agreed",
    });
  });

  it("중요 5·6 — 라틴 도입구는 after·following·despite·having·tras·dopo만(연도·가정 낱말 없이), 'report(s)'는 무해한 꼬리가 아니다", () => {
    for (const title of [
      "In 2019, Bukayo Saka joins Chelsea",
      "On this day in 2023, Harry Kane joins Bayern Munich",
      "In FIFA 27 career mode, Bukayo Saka joins Chelsea",
      "In a perfect world, Bukayo Saka signs for Real Madrid",
      "In an alternate reality, Arsenal agree fee for Bukayo Saka",
      "After 2019 heartbreak, Harry Kane joins Arsenal",
      "If talks go well, Harry Kane joins Arsenal",
    ]) {
      expect(one(title, "en"), title).toBeUndefined();
    }
    for (const title of [
      "After talks collapse, Bukayo Saka joins Chelsea",
      "Following talks, Harry Kane joins Arsenal",
      "Despite injury, Harry Kane joins Arsenal",
    ]) {
      expect(one(title, "en")?.status, title).toBe("agreed");
    }
    expect(one("Bukayo Saka joins Chelsea - report", "en")).toBeUndefined();
    expect(one("Bukayo Saka joins Chelsea: deal agreed", "en")?.status).toBe(
      "agreed",
    );
  });

  it("중요 9 — 팀 뒤 사람 명사(fans·legend·boss)는 사는 쪽이 아니고, 닮은꼴('a Saka type'·'Saka-like'·'김민재 스타일')은 그 선수가 아니며, 선수 계약 결렬은 재계약이다", () => {
    expect(one("Chelsea fans want Bukayo Saka transfer", "en")?.to).not.toBe(
      "chelsea",
    );
    expect(one("Chelsea legend wants Bukayo Saka transfer", "en")?.to).not.toBe(
      "chelsea",
    );
    expect(one("Chelsea boss wants Bukayo Saka transfer", "en")?.to).not.toBe(
      "chelsea",
    );
    for (const [title, lang] of [
      ["Chelsea want a Bukayo Saka type in transfer window", "en"],
      ["Chelsea target Bukayo Saka-like winger in transfer window", "en"],
      ["Chelsea eye Bukayo Saka-style winger", "en"],
      ["첼시, 김민재 스타일 수비수 영입 추진", "ko"],
      ["첼시, 김민재 유형 센터백 노린다", "ko"],
      ["Arsenal pull out of talks for Bukayo Saka contract", "en"],
      [
        "Arsenal walk away from talks over Bukayo Saka contract extension",
        "en",
      ],
    ] as const) {
      expect(one(title, lang), title).toBeUndefined();
    }
    // 정상 — 사는 쪽
    expect(one("Chelsea want Bukayo Saka transfer", "en")).toMatchObject({
      to: "chelsea",
      status: "rumor",
    });
  });

  it("중요 10·권장 11 — 무산·의문 이모지·따옴표 안 핵심어면 문형을 쓰지 않고, 금액은 통화 기호·단위가 있을 때만", () => {
    for (const title of [
      "Bukayo Saka joins Chelsea ❌",
      "Bukayo Saka joins Chelsea 🤔",
      "Bukayo Saka joins Chelsea ⁉️",
      "Bukayo Saka 'joins' Chelsea",
      "Bukayo Saka “joins” Chelsea",
      '"Bukayo Saka joins Chelsea" - fake news',
      "Bukayo Saka joins Chelsea for 2",
    ]) {
      expect(one(title, "en")?.status ?? "none", title).not.toMatch(
        /^(?:negotiating|agreed|official)$/u,
      );
    }
    expect(
      RANK[one("김민재, 아스널 이적 확정 ❌", "ko", KO2)?.status ?? "rumor"],
    ).toBe(0);
    // 소유 아포스트로피("Saka's")·통화 금액은 그대로
    expect(one("Bukayo Saka's move to Chelsea collapses", "en")?.status).toBe(
      "collapsed",
    );
    expect(one("Harry Kane’s move to Arsenal collapses", "en")?.status).toBe(
      "collapsed",
    );
    for (const title of [
      "Bukayo Saka joins Chelsea for £100m",
      "Bukayo Saka joins Chelsea for 100m",
      "Bukayo Saka joins Chelsea in €100 million deal",
    ]) {
      expect(one(title, "en")?.status, title).toBe("agreed");
    }
  });

  it("권장 12 — 꼬리 슬롯 반복은 역추적이 늘지 않는다(300·500·1,000자 제목도 짧게 끝난다)", () => {
    const rep = (x: string, n: number) =>
      Array.from({ length: n }, () => x).join("");
    for (const len of [300, 500, 1000]) {
      for (const [unit, head] of [
        [", deal done", "Here we go! Harry Kane to Arsenal"],
        [" contract signed", "Harry Kane to Arsenal, here we go"],
        [" on loan", "Harry Kane joins Arsenal"],
        [", in a £100m deal", "Harry Kane joins Arsenal"],
      ] as const) {
        const n = Math.ceil((len - head.length) / unit.length);
        const title = `${head}${rep(unit, n)} x`.slice(0, len);
        const t0 = performance.now();
        matchStagePatterns({
          title,
          lang: "en",
          playerSlug: "harry-kane",
          tags: CTX.tags,
        });
        // 지수 역추적이면 300자에서 수 초(리뷰 실측 299자 0.76s, 2낱말마다 4배) — 넉넉한 상한으로 회귀만 잡는다
        expect(performance.now() - t0, `${len}자 ${unit}`).toBeLessThan(1500);
      }
    }
  });

  it("권장 15 — 국내 꼬리표('(종합)'·'[영상]'·'(인터뷰)'·'(속보)'·'[포토]')는 벗기고 맞춘다", () => {
    for (const title of [
      "김민재, 아스널 이적 확정 (종합)",
      "김민재, 아스널 이적 확정 (종합2보)",
      "김민재, 아스널 이적 확정 [영상]",
      "김민재, 아스널 이적 확정 (인터뷰)",
      "김민재, 아스널 이적 확정 (속보)",
      "김민재, 아스널 이적 확정 [포토]",
      "[영상] 김민재, 아스널 이적 확정",
    ]) {
      expect(stripHeadNoise(title, "ko").text, title).toBe(
        "김민재, 아스널 이적 확정",
      );
      expect(one(title, "ko", KO2), title).toMatchObject({
        status: "official",
        to: "arsenal",
      });
    }
  });
});

describe("⑩ 리뷰 4회차 회귀(국내 다른 절은 닫힌 목록 꼴만·첫 절 건너뛰기·'사이' 꼴 금액) — 오탐 0", () => {
  const RANK: Record<string, number> = {
    rumor: 0,
    collapsed: 0,
    negotiating: 1,
    agreed: 2,
    official: 3,
  };
  const KO2 = ["interfootball-world", "footballist-football"];
  const one = (title: string, lang: string, source?: string | string[]) =>
    analyzeItems(
      [
        {
          title,
          lang,
          summary: null,
          sources: Array.isArray(source)
            ? source
            : [source ?? SOURCE_FOR[lang]!],
          publishedAt: "2026-10-17T00:00:00Z",
        },
      ],
      CTX,
    ).transfer;

  it(`리뷰 하네스 r4 ${REVIEW_PROBES_R4.length}문장 + 표시용 ${REVIEW_PROBES_R4_EXTRA.length}문장 — 오탐 시도·재현율 확인 모두 기대대로`, () => {
    expect(REVIEW_PROBES_R4.length).toBe(53);
    for (const p of [...REVIEW_PROBES_R4, ...REVIEW_PROBES_R4_EXTRA]) {
      const t = one(p.title, p.lang, p.src);
      const x = p.exp;
      if (x === "none") {
        expect(t, p.title).toBeUndefined();
        continue;
      }
      if (x.status || x.to || x.from) expect(t, p.title).toBeDefined();
      if (!t) continue;
      if (x.max) {
        expect(RANK[t.status]!, p.title).toBeLessThanOrEqual(RANK[x.max]!);
      }
      if (x.status) expect(t.status, p.title).toBe(x.status);
      if (x.notTo) expect(t.to, p.title).not.toBe(x.notTo);
      if (x.notFrom) expect(t.from, p.title).not.toBe(x.notFrom);
      if (x.to !== undefined) expect(t.to ?? null, p.title).toBe(x.to);
      if (x.from !== undefined) expect(t.from ?? null, p.title).toBe(x.from);
    }
  });

  it("차단 1 — 국내 문형 절 밖의 다른 절·쉼표 마디가 닫힌 목록 꼴이 아니면 문형을 쓰지 않는다(부인·반박·출처 꼬리 → rumor 이하)", () => {
    const kmj = (title: string) =>
      matchStagePatterns({
        title,
        lang: "ko",
        playerSlug: "kim-min-jae",
        tags: CTX.tags,
      });
    for (const title of [
      "김민재, 아스널 이적 확정…바이에른 반박",
      "김민재, 아스널 이적 확정…바이에른은 선 그어",
      "김민재, 아스널 이적 확정…바이에른 '근거 없다'",
      "김민재, 아스널 이적 확정…바이에른 '사실 아니었다'",
      "김민재, 아스널 이적 확정…'말도 안 돼'",
      "김민재, 아스널 이적 확정…'사실과 달라'",
      "김민재, 아스널 이적 확정…'틀렸다'",
      "김민재, 아스널 이적 확정…'노코멘트'",
      "아스널, 김민재 영입 확정…바이에른은 손사래",
      "김민재, 아스널 이적 합의…바이에른은 선 그어",
      "김민재, 아스널 이적 합의…바이에른 반박",
      "김민재, 아스널 이적 합의…'협상 없었다'",
      "김민재, 아스널 이적 확정…현지 매체 전해",
      "김민재, 아스널 이적 확정…獨 빌트",
      "김민재, 아스널 이적 합의…獨 키커",
      "김민재, 아스널 이적 합의…로마노",
      // 쉼표 마디로 붙여도 같다
      "김민재, 아스널 이적 확정, 바이에른 반박",
      "현지 매체 전해, 김민재, 아스널 이적 확정",
      "김민재, 아스널 이적 확정! 바이에른은 선 그어",
    ]) {
      expect(kmj(title), title).toEqual([]);
      for (const src of [KO2, "interfootball-world"]) {
        expect(
          RANK[one(title, "ko", src)?.status ?? "rumor"]!,
          `${title} ${String(src)}`,
        ).toBe(0);
      }
    }
    // 목록 꼴(등번호·이적료·금액·계약 기간·N년 계약·메디컬·입단식·발표·오피셜·중립 감탄)은 그대로
    for (const title of [
      "김민재, 아스널 이적 확정…등번호 3번",
      "김민재, 아스널 이적 확정…등번호 3",
      "김민재, 아스널 이적 확정…이적료 1000억",
      "김민재, 아스널 이적 확정…이적료 5000만 유로",
      "김민재, 아스널 이적 확정…‘이적료 1000억’",
      "김민재, 아스널 이적 확정…2030년까지",
      "김민재, 아스널 이적 확정…5년 계약",
      "김민재, 아스널 이적 확정…메디컬 통과",
      "김민재, 아스널 이적 확정…입단식",
      "김민재, 아스널 이적 확정…공식 발표",
      "김민재, 아스널 이적 확정…오피셜",
      "김민재, 아스널 이적 확정…드디어!",
      "김민재, 아스널 이적 확정, 등번호 3번",
      "김민재, 아스널 이적 확정…등번호 3번, 5년 계약",
    ]) {
      expect(one(title, "ko", KO2), title).toMatchObject({
        status: "official",
        to: "arsenal",
      });
    }
    // 'here we go' 꼬리 절은 목록 꼴이지만 그 제목은 agreed 상한(결정 C)
    expect(one("김민재, 아스널 이적 확정…here we go", "ko", KO2)?.status).toBe(
      "agreed",
    );
  });

  it("중요 2 — 첫 절 건너뛰기는 목록 꼴 절만(단계 낱말이 든 인용 절 '쿠보 영입 완료'는 건너뛰지 않는다)", () => {
    for (const title of [
      "[오피셜] '쿠보 영입 완료'…이강인, PSG행",
      "[오피셜] ‘레알, 쿠보 영입 확정’…이강인, PSG행",
      "[오피셜] '레알 소시에다드' 쿠보…이강인, PSG행",
      "[오피셜] 충격…쿠보 레알 이적…이강인, PSG행",
    ]) {
      expect(RANK[one(title, "ko", KO2)?.status ?? "rumor"]!, title).toBe(0);
    }
    expect(
      claimOf("[오피셜] ‘이적료 1000억’…김민재, 아스널행", "ko").claim,
    ).toMatchObject({ status: "official", explicit: true, to: "arsenal" });
    for (const title of [
      "[오피셜] 드디어…김민재, 아스널행",
      "[오피셜] 1000억…김민재, 아스널행",
    ]) {
      expect(one(title, "ko", KO2), title).toMatchObject({
        status: "official",
        to: "arsenal",
      });
    }
  });

  it("중요 3 — 선수-구단 '사이' 꼴(acuerdo-entre·accordo-tra·agrees-terms·talks)의 금액은 움직임 근거가 아니다(연봉 재계약일 수 있다)", () => {
    for (const [title, lang] of [
      ["Accordo totale tra il Milan e Rafael Leão per 7 milioni", "it"],
      ["Acuerdo total entre el Barça y Lamine Yamal por 20 millones", "es"],
      ["Bukayo Saka agrees terms with Arsenal in £300k-a-week deal", "en"],
      ["Bukayo Saka agrees terms with Arsenal for £10m", "en"],
      ["Harry Kane agrees personal terms with Arsenal in £100m deal", "en"],
    ] as const) {
      expect(one(title, lang), title).toBeUndefined();
    }
    // 'T agree £X fee for P'는 그대로(사이 꼴이 아니다) · 사이 꼴도 from·움직임 낱말이면 단계
    expect(one("Arsenal agree £100m fee for Bukayo Saka", "en")).toMatchObject({
      to: "arsenal",
      status: "agreed",
    });
    expect(
      one(
        "Acuerdo total entre el Barcelona y Harry Kane, cedido por el Bayern",
        "es",
      ),
    ).toMatchObject({ from: "bayern-munchen", status: "agreed" });
    expect(one("Harry Kane in transfer talks with Arsenal", "en")?.status).toBe(
      "negotiating",
    );
  });

  it("권장 — '설'은 이적·영입·합의·결렬·무산 바로 뒤만, '보도자료'·머리 인용 '주장'(캡틴)은 의심 낱말이 아니고, 머리 인용 안 '!'는 절 경계가 아니다 · 꼬리의 출발 팀이 둘이면 출발 없음", () => {
    expect(
      one("아스널, 보도자료 통해 김민재 영입 발표", "ko", KO2),
    ).toMatchObject({ status: "official", to: "arsenal" });
    expect(one("'주장' 김민재, 아스널 이적 확정", "ko", KO2)).toMatchObject({
      status: "official",
      to: "arsenal",
    });
    expect(one("'대박!' 김민재, 아스널 이적 확정", "ko", KO2)).toMatchObject({
      status: "official",
      to: "arsenal",
    });
    // '이적설'·'영입설'은 그대로 의심 낱말
    for (const title of [
      "김민재, 아스널 이적 확정에 바이에른 이적설 일축",
      "아스널, 김민재 영입 확정…쿠보 영입설도",
    ]) {
      expect(
        matchStagePatterns({
          title,
          lang: "ko",
          playerSlug: "kim-min-jae",
          tags: CTX.tags,
        }),
        title,
      ).toEqual([]);
    }
    expect(
      one(
        "Bukayo Saka joins Chelsea from Arsenal on loan from Real Madrid",
        "en",
      ),
    ).toEqual({
      player: "bukayo-saka",
      to: "chelsea",
      status: "agreed",
      tier: 2,
    });
  });
});
