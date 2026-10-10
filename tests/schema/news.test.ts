import { describe, expect, it } from "vitest";

import { AI_TITLE_MAX, NewsCardSchema, NewsFileSchema } from "@/lib/schema";

import {
  REJECTED_URLS,
  at,
  issueMessages,
  issuePaths,
  passes,
  validFixture,
} from "./helpers";

const file = validFixture(NewsFileSchema, "data/news/2026-10-10.json");
const aiCard = at(file.cards, 0); // AI 요약 + 이적 정보
const koCard = at(file.cards, 1); // 한국어 원문 카드 (ai:false)
const downgraded = at(file.cards, 2); // 강등 카드 (원제목 + 링크, s: [])

describe("NewsFile — data/news/YYYY-MM-DD.json", () => {
  it("fixture의 카드 3종(AI·한국어·강등)이 모두 통과한다", () => {
    expect(file.cards).toHaveLength(3);
    expect(aiCard.ai).toBe(true);
    expect(koCard.lang).toBe("ko");
    expect(downgraded.s).toEqual([]);
  });

  it("카드 ID가 겹치면 실패한다 (FR-04)", () => {
    const dup = { ...file, cards: [aiCard, { ...koCard, id: aiCard.id }] };
    expect(issuePaths(NewsFileSchema, dup)).toEqual(["cards.1.id"]);
  });

  it("date는 YYYY-MM-DD, generatedAt은 UTC, runId는 비어 있지 않아야 한다", () => {
    expect(issuePaths(NewsFileSchema, { ...file, date: "2026/10/10" })).toEqual(
      ["date"],
    );
    expect(
      issuePaths(NewsFileSchema, {
        ...file,
        generatedAt: "2026-10-10T06:52:10+09:00",
      }),
    ).toEqual(["generatedAt"]);
    expect(issuePaths(NewsFileSchema, { ...file, runId: "" })).toEqual([
      "runId",
    ]);
  });

  it("카드가 0장이어도 스키마는 통과한다 (하한 ≥10은 발행 게이트 FR-153 몫)", () => {
    expect(passes(NewsFileSchema, { ...file, cards: [] })).toBe(true);
  });
});

describe("NewsCard — 카드 ID", () => {
  it.each(["c_8f3a1b2c4", "c_8F3A1B2C4D", "card_8f3a1b2c4d", "c_8f3a1b2c4d0"])(
    "형식이 틀리면 실패: %s",
    (id) => {
      expect(issuePaths(NewsCardSchema, { ...aiCard, id })).toEqual(["id"]);
    },
  );
});

describe("NewsCard — 제목 상한 (PRD §15 D15)", () => {
  it(`AI 제목은 ${AI_TITLE_MAX}자까지 통과, 81자는 t 경로로 실패한다`, () => {
    expect(passes(NewsCardSchema, { ...aiCard, t: "가".repeat(80) })).toBe(
      true,
    );
    const over = { ...aiCard, t: "가".repeat(81) };
    expect(issuePaths(NewsCardSchema, over)).toEqual(["t"]);
    expect(issueMessages(NewsCardSchema, over)).toEqual([
      "AI 제목은 80자 이내",
    ]);
  });

  it("원제목·한국어 원문 카드(ai:false)는 200자까지 통과한다", () => {
    expect(passes(NewsCardSchema, { ...downgraded, t: "a".repeat(81) })).toBe(
      true,
    );
    expect(passes(NewsCardSchema, { ...koCard, t: "가".repeat(200) })).toBe(
      true,
    );
  });

  it("201자는 ai 여부와 상관없이 실패한다", () => {
    expect(
      issuePaths(NewsCardSchema, { ...downgraded, t: "a".repeat(201) }),
    ).toEqual(["t"]);
    // AI 카드는 200자 상한과 80자 refine이 둘 다 t에 이슈를 남긴다(문자열 길이 검사는 이후 검사를 막지 않음)
    const aiOver = { ...aiCard, t: "가".repeat(201) };
    expect(issuePaths(NewsCardSchema, aiOver)).toEqual(["t", "t"]);
    expect(issueMessages(NewsCardSchema, aiOver)).toContain(
      "AI 제목은 80자 이내",
    );
  });
});

describe("NewsCard — 3줄 요약", () => {
  it("3줄까지 통과, 4줄은 실패한다", () => {
    expect(passes(NewsCardSchema, { ...aiCard, s: ["a", "b", "c"] })).toBe(
      true,
    );
    expect(
      issuePaths(NewsCardSchema, { ...aiCard, s: ["a", "b", "c", "d"] }),
    ).toEqual(["s"]);
  });

  it("한 줄 80자까지 통과, 81자는 그 줄 경로로 실패한다", () => {
    expect(passes(NewsCardSchema, { ...aiCard, s: ["가".repeat(80)] })).toBe(
      true,
    );
    expect(
      issuePaths(NewsCardSchema, { ...aiCard, s: ["ok", "가".repeat(81)] }),
    ).toEqual(["s.1"]);
  });
});

describe("NewsCard — 기타 필드", () => {
  it.each([0, 6, 3.5])("imp %s는 실패한다 (정수 1~5)", (imp) => {
    expect(issuePaths(NewsCardSchema, { ...aiCard, imp })).toEqual(["imp"]);
  });

  it("imp 1·5는 통과한다", () => {
    expect(passes(NewsCardSchema, { ...aiCard, imp: 1 })).toBe(true);
    expect(passes(NewsCardSchema, { ...aiCard, imp: 5 })).toBe(true);
  });

  it("출처가 없으면 실패한다 (FR-30 — 모든 카드에 출처·원문 링크)", () => {
    expect(issuePaths(NewsCardSchema, { ...aiCard, src: [] })).toEqual(["src"]);
  });

  it("출처의 URL·시각·Tier 형식을 검사한다", () => {
    const first = at(aiCard.src, 0);
    expect(
      issuePaths(NewsCardSchema, {
        ...aiCard,
        src: [{ ...first, u: "not a url" }],
      }),
    ).toEqual(["src.0.u"]);
    expect(
      issuePaths(NewsCardSchema, {
        ...aiCard,
        src: [{ ...first, at: "2026-10-10T05:10:00+09:00" }],
      }),
    ).toEqual(["src.0.at"]);
    expect(
      issuePaths(NewsCardSchema, { ...aiCard, src: [{ ...first, tier: 4 }] }),
    ).toEqual(["src.0.tier"]);
  });

  it("created가 UTC가 아니면 실패한다", () => {
    expect(
      issuePaths(NewsCardSchema, {
        ...aiCard,
        created: "2026-10-10T06:40:00+09:00",
      }),
    ).toEqual(["created"]);
  });

  it("이적 정보: status none·Tier 4는 실패, transfer 생략은 통과", () => {
    const transfer = aiCard.transfer;
    if (!transfer) throw new Error("fixture 이적 정보 없음");
    expect(
      issuePaths(NewsCardSchema, {
        ...aiCard,
        transfer: { ...transfer, status: "none" },
      }),
    ).toEqual(["transfer.status"]);
    expect(
      issuePaths(NewsCardSchema, {
        ...aiCard,
        transfer: { ...transfer, tier: 4 },
      }),
    ).toEqual(["transfer.tier"]);
    expect(passes(NewsCardSchema, { ...aiCard, transfer: undefined })).toBe(
      true,
    );
  });

  it("카테고리·대회 ID는 열거값만", () => {
    expect(issuePaths(NewsCardSchema, { ...aiCard, cat: "rumor" })).toEqual([
      "cat",
    ]);
    expect(issuePaths(NewsCardSchema, { ...aiCard, comp: ["epl"] })).toEqual([
      "comp.0",
    ]);
  });
});

describe("NewsCard — 2026-10-10 결정 반영", () => {
  it.each(REJECTED_URLS)("원문 링크는 http/https만 (Q3): %s", (u) => {
    const src = [{ ...at(aiCard.src, 0), u }];
    expect(issuePaths(NewsCardSchema, { ...aiCard, src })).toEqual(["src.0.u"]);
  });

  it("카드 태그(teams·players)에는 slug 형식 검사를 걸지 않는다 (Q7 — 발행 차단 방지)", () => {
    expect(
      passes(NewsCardSchema, {
        ...aiCard,
        teams: ["Sample United"],
        players: ["X Y"],
      }),
    ).toBe(true);
  });

  it("data/ 산출물은 알 수 없는 키를 막지 않고 버린다 (Q5 — strict는 configs만)", () => {
    const parsed = NewsCardSchema.parse({ ...aiCard, extra: 1 });
    expect(parsed).not.toHaveProperty("extra");
  });
});
