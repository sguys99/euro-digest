/**
 * M1-31 — 같은 사건 연결 줄의 짝(src/lib/news/link-pairs.ts, PRD §15 D30 · DECISIONS D0 §5 #10).
 *
 * 고정하는 것(규칙 경계)
 *   - 해외(lang ≠ ko) ↔ 국내(lang = ko)만 — 같은 쪽끼리는 잇지 않는다
 *   - 같은 팀 slug 2개 이상 또는 같은 선수 slug 1개 이상 — 팀 하나만 같으면 없음
 *   - 같은 분류(cat) — 다르면 없음
 *   - 대표 출처 시각(src[0].at) 차이 36시간 이내(경계 포함) — 35h59m 있음 · 36h 있음 · 36h01m 없음
 *   - 상대 카드가 양쪽 모두 정확히 1장 — 국내 후보 2장 · 해외 후보 2장이면 없음
 *   - fixtures/news-sample.json(혼합안과 같은 카드)에서 혼합안의 4쌍과 같다
 * 네트워크 없음.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  isLinkCandidate,
  LINK_WINDOW_MS,
  linkPairs,
} from "@/lib/news/link-pairs";
import { NewsFileSchema, type NewsCard } from "@/lib/schema/news";

const BASE_AT = Date.parse("2026-10-11T00:00:00Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** 짝 판정에 쓰는 필드만 채운 카드 */
function card(
  id: string,
  over: Partial<Pick<NewsCard, "lang" | "cat" | "teams" | "players">> & {
    atMs?: number;
  } = {},
): Pick<NewsCard, "id" | "lang" | "cat" | "teams" | "players" | "src"> {
  return {
    id,
    lang: over.lang ?? "en",
    cat: over.cat ?? "result",
    teams: over.teams ?? ["tottenham-hotspur", "manchester-united"],
    players: over.players ?? [],
    src: [
      {
        n: "출처",
        u: `https://example.com/${id}`,
        at: iso(over.atMs ?? BASE_AT),
        tier: 2,
      },
    ],
  };
}

const foreign = (id: string, over: Parameters<typeof card>[1] = {}) =>
  card(id, { lang: "en", ...over });
const domestic = (id: string, over: Parameters<typeof card>[1] = {}) =>
  card(id, { lang: "ko", ...over });

describe("isLinkCandidate — 같은 사건 후보(②·③·④)", () => {
  it("같은 팀 2개 + 같은 분류 + 같은 시각이면 후보", () => {
    expect(isLinkCandidate(foreign("f"), domestic("k"))).toBe(true);
  });

  it("팀이 하나만 같고 선수가 없으면 후보가 아니다", () => {
    expect(
      isLinkCandidate(
        foreign("f", { teams: ["chelsea", "arsenal"] }),
        domestic("k", { teams: ["chelsea", "liverpool"] }),
      ),
    ).toBe(false);
  });

  it("팀이 하나만 같아도 선수가 하나 같으면 후보", () => {
    expect(
      isLinkCandidate(
        foreign("f", { teams: ["chelsea"], players: ["cole-palmer"] }),
        domestic("k", { teams: ["chelsea"], players: ["cole-palmer"] }),
      ),
    ).toBe(true);
  });

  it("팀이 없어도 같은 선수면 후보(대표팀 카드)", () => {
    expect(
      isLinkCandidate(
        foreign("f", {
          cat: "national",
          teams: [],
          players: ["cristiano-ronaldo"],
        }),
        domestic("k", {
          cat: "national",
          teams: [],
          players: ["cristiano-ronaldo"],
        }),
      ),
    ).toBe(true);
  });

  it("같은 팀 slug가 한 카드에 두 번 있어도 하나로 센다", () => {
    expect(
      isLinkCandidate(
        foreign("f", { teams: ["chelsea", "chelsea"] }),
        domestic("k", { teams: ["chelsea", "chelsea"] }),
      ),
    ).toBe(false);
  });

  it("분류가 다르면 후보가 아니다", () => {
    expect(
      isLinkCandidate(foreign("f"), domestic("k", { cat: "transfer" })),
    ).toBe(false);
  });

  it.each([
    ["35시간 59분", 35 * HOUR + 59 * MINUTE, true],
    ["정확히 36시간(경계 포함)", 36 * HOUR, true],
    ["36시간 1분", 36 * HOUR + MINUTE, false],
  ])("대표 출처 시각 차이 %s → %s", (_label, gap, expected) => {
    expect(
      isLinkCandidate(foreign("f"), domestic("k", { atMs: BASE_AT + gap })),
    ).toBe(expected);
    // 방향과 무관(국내가 먼저여도 같다)
    expect(
      isLinkCandidate(foreign("f"), domestic("k", { atMs: BASE_AT - gap })),
    ).toBe(expected);
  });

  it("36시간 상한은 상수와 같다", () => {
    expect(LINK_WINDOW_MS).toBe(36 * HOUR);
  });
});

describe("linkPairs — 양쪽 모두 유일한 해외 ↔ 국내 짝", () => {
  it("짝 1쌍은 양방향으로 들어간다", () => {
    const pairs = linkPairs([foreign("f"), domestic("k")]);
    expect(pairs.get("f")).toBe("k");
    expect(pairs.get("k")).toBe("f");
    expect(pairs.size).toBe(2);
  });

  it("국내 후보가 2장이면 잇지 않는다", () => {
    const pairs = linkPairs([foreign("f"), domestic("k1"), domestic("k2")]);
    expect(pairs.size).toBe(0);
  });

  it("해외 후보가 2장이면(국내 쪽이 유일하지 않으면) 잇지 않는다", () => {
    const pairs = linkPairs([foreign("f1"), foreign("f2"), domestic("k")]);
    expect(pairs.size).toBe(0);
  });

  it("해외끼리·국내끼리는 잇지 않는다", () => {
    expect(linkPairs([foreign("f1"), foreign("f2")]).size).toBe(0);
    expect(linkPairs([domestic("k1"), domestic("k2")]).size).toBe(0);
  });

  it("이탈리아어·스페인어 카드도 해외 쪽이다", () => {
    const pairs = linkPairs([foreign("f", { lang: "it" }), domestic("k")]);
    expect(pairs.get("f")).toBe("k");
  });

  it("다른 분류의 후보는 유일성 계산에 들지 않는다", () => {
    const pairs = linkPairs([
      foreign("f"),
      domestic("k"),
      domestic("k-other", { cat: "club" }),
    ]);
    expect(pairs.get("f")).toBe("k");
  });

  it("서로 다른 사건의 짝 두 쌍은 따로 잇는다", () => {
    const pairs = linkPairs([
      foreign("f1"),
      domestic("k1"),
      foreign("f2", { teams: ["arsenal", "leeds-united"] }),
      domestic("k2", { teams: ["arsenal", "leeds-united"] }),
    ]);
    expect(Object.fromEntries(pairs)).toEqual({
      f1: "k1",
      k1: "f1",
      f2: "k2",
      k2: "f2",
    });
  });

  it("fixtures/news-sample.json — 혼합안의 연결 줄 4쌍과 같다", () => {
    const sample = NewsFileSchema.parse(
      JSON.parse(
        readFileSync(path.resolve("fixtures/news-sample.json"), "utf8"),
      ),
    );
    const pairs = linkPairs(sample.cards);
    expect(Object.fromEntries(pairs)).toEqual({
      // 06 Solanke ↔ 14 인터풋볼 · 07 Bayern ↔ 09 베스트일레븐 · 12 Ronaldo ↔ 25 인터풋볼 · 19 Palmer ↔ 26 베스트일레븐
      c_f598c95798: "c_744396ca78",
      c_744396ca78: "c_f598c95798",
      c_6fa142d217: "c_d8eac2777b",
      c_d8eac2777b: "c_6fa142d217",
      c_8630993971: "c_fcf6ac5c90",
      c_fcf6ac5c90: "c_8630993971",
      c_d8ecc21d28: "c_329c1cd794",
      c_329c1cd794: "c_d8ecc21d28",
    });
  });
});
