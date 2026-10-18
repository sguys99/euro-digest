/**
 * M1-31 — 뉴스 피드 화면 모델(src/lib/news/feed-view.ts, PRD FR-30·FR-21·FR-31, D23·D30, DESIGN.md §9.3).
 *
 * 고정하는 것
 *   - 머리기사 선택: imp 최고 1장, 동점이면 파일 순서상 앞, 필터 결과(lead:false)에는 없음, 카드 0장이면 없음
 *   - 게재 번호 06부터 파일 순서(머리기사가 있어도 번호 체계가 그대로)
 *   - 태그 표기: 사전에 없는 slug는 빼고(slug 노출 금지) 팀 → 선수 순서, 한국 선수만 굵게, 중복 slug 한 번
 *   - 대회 탭: 카드 순서, 같은 대회 한 번, 설정에 없는 대회 제외
 *   - 출처 스택(사용자 결정 2026-10-19): 다른 매체가 있으면 '+N곳'(서로 다른 출처명 수 − 1), 추가 출처가 모두 같은 매체면 '+N건'
 *     (추가 기사 수), 섞이면 '+N곳'이고 목록은 기사 전부(파일 순서), 출처 1건이면 없음
 *   - 화면 모델 모듈(src/lib/news/)은 fs·zod·로더를 런타임 import하지 않는다(필터 섬이 가져다 써도 깨지지 않게 — M1-31 리뷰)
 *   - 연결 줄: 짝 게재 번호·대표 출처·방향(↓/↑)·종류(국내/해외)
 *   - 원제목·출처는 고치지 않는다(D23)
 * 네트워크 없음.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { tagLabelsFrom } from "@/lib/news/tag-labels";
import {
  buildFeed,
  cardCompetitions,
  cardTags,
  FIRST_CARD_NO,
  leadIndex,
  sourceNameLang,
  sourceStack,
  type CardLabels,
} from "@/lib/news/feed-view";
import type { CompId } from "@/lib/schema/common";
import { NewsFileSchema, type NewsCard } from "@/lib/schema/news";

const sample = NewsFileSchema.parse(
  JSON.parse(readFileSync(path.resolve("fixtures/news-sample.json"), "utf8")),
);

const COMPS: Partial<Record<CompId, { short: string; name: string }>> = {
  EPL: { short: "EPL", name: "프리미어리그" },
  BUNDESLIGA: { short: "분데스", name: "분데스리가" },
  LALIGA: { short: "라리가", name: "라리가" },
};

const LABELS: CardLabels = {
  tags: tagLabelsFrom({
    entries: [
      {
        ko: "토트넘",
        en: ["Tottenham"],
        kind: "team",
        slug: "tottenham-hotspur",
      },
      { ko: "맨유", en: ["Man Utd"], kind: "team", slug: "manchester-united" },
      {
        ko: "솔란케",
        en: ["Solanke"],
        kind: "player",
        slug: "dominic-solanke",
      },
      {
        ko: "김민재",
        en: ["Kim Min-jae"],
        kind: "player",
        slug: "kim-min-jae",
      },
      {
        ko: "설영우",
        en: ["Seol Young-woo"],
        kind: "player",
        slug: "seol-young-woo",
      },
    ],
  }),
  isKoreanPlayer: (slug) => slug === "kim-min-jae" || slug === "seol-young-woo",
  competition: (id) => COMPS[id] ?? null,
};

function src(
  n: string,
  at = "2026-10-11T00:00:00Z",
  u = `https://example.com/${encodeURIComponent(n)}/${at}`,
): NewsCard["src"][number] {
  return { n, u, at, tier: 2 };
}

function base(over: Partial<NewsCard> = {}): NewsCard {
  return {
    id: "c_0000000001",
    t: "Title",
    s: [],
    cat: "other",
    comp: [],
    teams: [],
    players: [],
    imp: 2,
    kr: false,
    spoiler: false,
    src: [src("BBC Sport")],
    lang: "en",
    ai: false,
    created: "2026-10-11T00:00:00Z",
    ...over,
  };
}

describe("leadIndex — 머리기사(D30)", () => {
  it("imp 최고 1장, 동점이면 앞", () => {
    expect(leadIndex([{ imp: 3 }, { imp: 5 }, { imp: 5 }, { imp: 4 }])).toBe(1);
    expect(leadIndex([{ imp: 4 }, { imp: 4 }])).toBe(0);
  });

  it("imp 5가 없는 날도 최고 imp(파일 순서상 첫 카드 = 최신)", () => {
    expect(leadIndex([{ imp: 3 }, { imp: 3 }, { imp: 2 }])).toBe(0);
  });

  it("카드가 없으면 -1", () => {
    expect(leadIndex([])).toBe(-1);
  });

  it("파이프라인 파일(중요도 내림차순)에서는 늘 첫 카드", () => {
    expect(leadIndex(sample.cards)).toBe(0);
  });
});

describe("sourceStack — '+N곳'과 펼친 목록", () => {
  it("출처 1건이면 +0, 목록 없음", () => {
    const stack = sourceStack(base());
    expect(stack.more).toBe(0);
    expect(stack.unit).toBe("articles");
    expect(stack.rows).toEqual([]);
    expect(stack.lead).toMatchObject({ name: "BBC Sport", lang: "en" });
  });

  it("서로 다른 출처명 수 − 1, 목록은 출처 전부(파일 순서)", () => {
    const stack = sourceStack(
      base({
        src: [
          src("BBC Sport", "2026-10-11T01:00:00Z"),
          src("The Athletic", "2026-10-11T02:00:00Z"),
          src("ESPN", "2026-10-11T03:00:00Z"),
        ],
      }),
    );
    expect(stack.more).toBe(2);
    expect(stack.unit).toBe("outlets");
    expect(stack.rows.map((r) => [r.name, r.at])).toEqual([
      ["BBC Sport", "2026-10-11T01:00:00Z"],
      ["The Athletic", "2026-10-11T02:00:00Z"],
      ["ESPN", "2026-10-11T03:00:00Z"],
    ]);
  });

  it("섞인 경우(다른 매체 + 같은 매체 기사)는 '+N곳' — 같은 매체 기사는 '곳'으로 세지 않고 목록에는 모든 기사", () => {
    const stack = sourceStack(
      base({
        lang: "ko",
        src: [
          src("인터풋볼", "2026-10-17T11:19:21Z"),
          src("베스트일레븐", "2026-10-17T11:14:39Z"),
          src("인터풋볼", "2026-10-17T05:10:00Z"),
        ],
      }),
    );
    expect(stack.more).toBe(1);
    expect(stack.unit).toBe("outlets");
    expect(stack.rows.map((r) => r.name)).toEqual([
      "인터풋볼",
      "베스트일레븐",
      "인터풋볼",
    ]);
  });

  it("추가 출처가 모두 같은 매체면 '+N건'(추가 기사 수) — 같은 목록을 연다(사용자 결정 2026-10-19)", () => {
    const two = sourceStack(
      base({
        src: [src("BBC Sport", "2026-10-17T21:18:26Z"), src("BBC Sport")],
      }),
    );
    expect(two).toMatchObject({ more: 1, unit: "articles" });
    expect(two.rows.map((r) => r.at)).toEqual([
      "2026-10-17T21:18:26Z",
      "2026-10-11T00:00:00Z",
    ]);
    const three = sourceStack(
      base({
        src: [
          src("Gianluca Di Marzio", "2026-10-17T21:40:20Z"),
          src("Gianluca Di Marzio", "2026-10-17T20:25:41Z"),
          src("Gianluca Di Marzio", "2026-10-17T19:00:00Z"),
        ],
      }),
    );
    expect(three).toMatchObject({ more: 2, unit: "articles" });
    expect(three.rows).toHaveLength(3);
  });

  it("출처명·링크를 고치지 않는다", () => {
    const card = sample.cards[0] as NewsCard;
    const stack = sourceStack(card);
    expect(stack.rows.map((r) => [r.name, r.url])).toEqual(
      card.src.map((s) => [s.n, s.u]),
    );
  });
});

describe("sourceNameLang — 출처명 lang", () => {
  it.each([
    ["인터풋볼", "ko", "ko"],
    ["BBC Sport", "en", "en"],
    ["Gianluca Di Marzio", "it", "it"],
    ["BBC Sport", "ko", "en"],
  ])("%s (카드 %s) → %s", (name, cardLang, expected) => {
    expect(sourceNameLang(name, cardLang)).toBe(expected);
  });
});

describe("cardTags · cardCompetitions — 한국어 태그·대회 탭", () => {
  it("팀 → 선수 순서, 사전에 없는 slug는 뺀다(slug 노출 금지), 한국 선수만 굵게", () => {
    const tags = cardTags(
      base({
        teams: ["tottenham-hotspur", "no-such-team", "manchester-united"],
        players: ["dominic-solanke", "kim-min-jae", "no-such-player"],
      }),
      LABELS,
    );
    expect(tags).toEqual([
      { slug: "tottenham-hotspur", label: "토트넘", korean: false },
      { slug: "manchester-united", label: "맨유", korean: false },
      { slug: "dominic-solanke", label: "솔란케", korean: false },
      { slug: "kim-min-jae", label: "김민재", korean: true },
    ]);
  });

  it("태그가 모두 사전 밖이면 빈 목록", () => {
    expect(
      cardTags(base({ teams: ["x-fc"], players: ["y-player"] }), LABELS),
    ).toEqual([]);
  });

  it("같은 slug는 한 번", () => {
    expect(
      cardTags(base({ players: ["kim-min-jae", "kim-min-jae"] }), LABELS),
    ).toHaveLength(1);
  });

  it("대회: 카드 순서, 같은 대회 한 번, 설정에 없는 대회 제외, 대회 없으면 []", () => {
    expect(
      cardCompetitions(
        base({ comp: ["BUNDESLIGA", "EPL", "EPL", "UCL"] }),
        LABELS,
      ),
    ).toEqual([
      { id: "BUNDESLIGA", short: "분데스", name: "분데스리가" },
      { id: "EPL", short: "EPL", name: "프리미어리그" },
    ]);
    expect(cardCompetitions(base({ comp: [] }), LABELS)).toEqual([]);
  });
});

describe("buildFeed — 카드별 화면 모델", () => {
  const views = buildFeed(sample.cards, { lead: true, labels: LABELS });

  it("게재 번호 06부터 파일 순서, 카드를 옮기거나 두 번 그리지 않는다", () => {
    expect(FIRST_CARD_NO).toBe(6);
    expect(views.map((v) => v.no)).toEqual(sample.cards.map((_, i) => 6 + i));
    expect(views.map((v) => v.card.id)).toEqual(sample.cards.map((c) => c.id));
  });

  it("머리기사는 1장(첫 카드) — 필터 결과(lead:false)에는 없고 번호는 그대로", () => {
    expect(views.filter((v) => v.lead).map((v) => v.no)).toEqual([6]);
    const filtered = buildFeed(sample.cards, { lead: false, labels: LABELS });
    expect(filtered.some((v) => v.lead)).toBe(false);
    expect(filtered.map((v) => v.no)).toEqual(views.map((v) => v.no));
  });

  it("원제목은 그대로, 분류 도장 라벨", () => {
    expect(views.map((v) => v.card.t)).toEqual(sample.cards.map((c) => c.t));
    const byId = new Map(views.map((v) => [v.card.id, v]));
    expect(byId.get("c_f598c95798")?.category).toBe("경기 결과");
    expect(byId.get("c_c19e60220d")?.category).toBe("이적");
    expect(byId.get("c_d8ecc21d28")?.category).toBe("감독·구단");
    expect(byId.get("c_8630993971")?.category).toBe("대표팀");
  });

  it("이적 단계는 transfer가 있을 때만(이적 분류여도 없으면 null)", () => {
    const byId = new Map(views.map((v) => [v.card.id, v]));
    expect(byId.get("c_c19e60220d")?.transfer).toEqual({
      status: "collapsed",
      tier: 3,
    });
    expect(byId.get("c_c4f20b673e")?.transfer).toEqual({
      status: "official",
      tier: 3,
    });
    // c_c2061f1944: 이적 분류 · transfer 없음 → 도장만
    expect(byId.get("c_c2061f1944")?.category).toBe("이적");
    expect(byId.get("c_c2061f1944")?.transfer).toBeNull();
  });

  it("연결 줄 — 혼합안처럼 '06 → 14 인터풋볼 ↓', '14 → 06 BBC Sport ↑'", () => {
    const byId = new Map(views.map((v) => [v.card.id, v]));
    expect(byId.get("c_f598c95798")?.link).toEqual({
      targetId: "c_744396ca78",
      targetNo: 14,
      targetSource: expect.objectContaining({ name: "인터풋볼", lang: "ko" }),
      targetKind: "domestic",
      direction: "down",
    });
    expect(byId.get("c_744396ca78")?.link).toEqual({
      targetId: "c_f598c95798",
      targetNo: 6,
      targetSource: expect.objectContaining({ name: "BBC Sport", lang: "en" }),
      targetKind: "foreign",
      direction: "up",
    });
    expect(views.filter((v) => v.link).map((v) => v.no)).toEqual([
      6, 7, 9, 12, 14, 19, 25, 26,
    ]);
  });

  it("첫 번호를 바꿔도 연결 줄 번호가 같은 체계를 따른다", () => {
    const shifted = buildFeed(sample.cards, {
      lead: true,
      labels: LABELS,
      firstNo: 1,
    });
    expect(shifted[0]?.link?.targetNo).toBe(9);
  });

  it("카드 0장이면 빈 목록", () => {
    expect(buildFeed([], { lead: true, labels: LABELS })).toEqual([]);
  });
});

describe("화면 모델 모듈 — fs·zod 없는 순수 모듈(M1-31 리뷰)", () => {
  const dir = path.resolve("src/lib/news");
  const files = readdirSync(dir).filter((name) => name.endsWith(".ts"));

  it.each(files)("%s는 런타임 import에 node:·zod·@/lib/data가 없다", (name) => {
    const text = readFileSync(path.join(dir, name), "utf8");
    const runtimeImports = [
      ...text.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gms),
    ].map((m) => m[1]);
    expect(
      runtimeImports.filter(
        (spec) =>
          spec?.startsWith("node:") ||
          spec === "zod" ||
          spec?.startsWith("@/lib/data") ||
          spec?.startsWith("@/lib/schema"),
      ),
    ).toEqual([]);
  });
});
