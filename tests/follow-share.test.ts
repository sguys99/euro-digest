/**
 * M4-10 — 팔로우 공유 URL · 가져오기 계획 · 안내 문구 (src/lib/follow-share.ts — PRD FR-114, §15 D67 ②③)
 */
import { describe, expect, it } from "vitest";

import { EMPTY_FOLLOWS, type FollowKnown } from "@/lib/follow";
import {
  followCountLabel,
  followShareUrl,
  hasFollowQuery,
  importNoticeParts,
  importResultMessage,
  importSkipMessage,
  knownFromDirectory,
  planFollowImport,
  sharePathWithQuery,
  stripFollowQuery,
} from "@/lib/follow-share";
import { absoluteUrl } from "@/lib/paths";

const KNOWN: FollowKnown = {
  teams: new Set([
    "arsenal",
    "chelsea",
    "liverpool",
    "barcelona",
    "milan",
    "bayern-munchen",
    "napoli",
  ]),
  players: new Set(["kim-min-jae", "lee-kang-in", "son-heung-min"]),
};

const state = (teams: string[], players: string[] = []) => ({
  v: 1 as const,
  teams,
  players,
});

describe("followShareUrl", () => {
  it("절대 URL + 읽히는 쿼리(쉼표 인코딩 없음), 빈 종류는 뺀다", () => {
    expect(
      followShareUrl(state(["arsenal", "bayern-munchen"], ["kim-min-jae"])),
    ).toBe(`${absoluteUrl("/my/")}?t=arsenal,bayern-munchen&p=kim-min-jae`);
    expect(followShareUrl(state([], ["kim-min-jae"]))).toBe(
      `${absoluteUrl("/my/")}?p=kim-min-jae`,
    );
  });
  it("팔로우 0이면 null(버튼 비활성)", () => {
    expect(followShareUrl(EMPTY_FOLLOWS)).toBeNull();
  });
});

describe("hasFollowQuery", () => {
  it("t · p 중 하나라도 있으면(빈 값 포함) true", () => {
    expect(hasFollowQuery("?t=arsenal")).toBe(true);
    expect(hasFollowQuery("?p=")).toBe(true);
    expect(hasFollowQuery("?mine=1")).toBe(false);
    expect(hasFollowQuery("")).toBe(false);
  });
});

describe("planFollowImport", () => {
  it("쿼리가 없으면 null", () => {
    expect(planFollowImport("?x=1", EMPTY_FOLLOWS, KNOWN)).toBeNull();
  });

  it("빈 값 · 중복 · 대문자 · 공백을 다듬고, 모르는 항목을 센다", () => {
    const plan = planFollowImport(
      "?t=Arsenal,%20chelsea%20,,arsenal,Not_A_Slug,unknown-fc&p=KIM-MIN-JAE&p=kim-min-jae",
      EMPTY_FOLLOWS,
      KNOWN,
    );
    expect(plan).toMatchObject({
      kind: "confirm",
      incoming: { teams: ["arsenal", "chelsea"], players: ["kim-min-jae"] },
      unknown: 2,
    });
  });

  it("합치기 = 지금 것 우선 + 한도 초과분 dropped, 덮어쓰기 = 들어온 것만", () => {
    const current = state(
      ["arsenal", "chelsea", "liverpool", "barcelona"],
      ["kim-min-jae"],
    );
    const plan = planFollowImport(
      "?t=milan,napoli,bayern-munchen&p=lee-kang-in",
      current,
      KNOWN,
    );
    expect(plan?.kind).toBe("confirm");
    if (plan?.kind !== "confirm") return;
    expect(plan.outcomes.merge.state.teams).toEqual([
      "arsenal",
      "chelsea",
      "liverpool",
      "barcelona",
      "milan",
    ]);
    expect(plan.outcomes.merge.state.players).toEqual([
      "kim-min-jae",
      "lee-kang-in",
    ]);
    expect(plan.outcomes.merge.dropped).toBe(2);
    expect(plan.outcomes.replace.state).toEqual(
      state(["milan", "napoli", "bayern-munchen"], ["lee-kang-in"]),
    );
    expect(plan.outcomes.replace.dropped).toBe(0);
  });

  it("덮어쓰기도 한도 — 팀 6개가 오면 1개가 빠진다", () => {
    const plan = planFollowImport(
      "?t=arsenal,chelsea,liverpool,barcelona,milan,napoli",
      EMPTY_FOLLOWS,
      KNOWN,
    );
    if (plan?.kind !== "confirm") throw new Error("confirm 기대");
    expect(plan.outcomes.replace.dropped).toBe(1);
    expect(plan.outcomes.replace.state.teams).toHaveLength(5);
  });

  it("덮어써도 같은 집합이면 same(순서 무관)", () => {
    const current = state(["arsenal", "chelsea"], ["kim-min-jae"]);
    expect(
      planFollowImport("?p=kim-min-jae&t=chelsea,arsenal", current, KNOWN),
    ).toEqual({ kind: "same", unknown: 0 });
    expect(
      planFollowImport(
        "?t=chelsea,arsenal,ghost&p=kim-min-jae",
        current,
        KNOWN,
      ),
    ).toEqual({ kind: "same", unknown: 1 });
  });

  it("부분 집합은 same이 아니다(덮어쓰면 줄어든다)", () => {
    const current = state(["arsenal", "chelsea"]);
    expect(planFollowImport("?t=arsenal", current, KNOWN)?.kind).toBe(
      "confirm",
    );
  });

  it("들어올 것이 없으면 empty(빈 값 · 모르는 항목뿐)", () => {
    expect(planFollowImport("?t=&p=", EMPTY_FOLLOWS, KNOWN)).toEqual({
      kind: "empty",
      unknown: 0,
    });
    expect(planFollowImport("?t=ghost,x y", EMPTY_FOLLOWS, KNOWN)).toEqual({
      kind: "empty",
      unknown: 2,
    });
  });
});

describe("주소 · 문구", () => {
  it("stripFollowQuery — t · p만 지우고 다른 쿼리 · 해시는 남긴다", () => {
    expect(stripFollowQuery("https://x.test/euro-digest/my/?t=a&p=b")).toBe(
      "/euro-digest/my/",
    );
    expect(stripFollowQuery("https://x.test/my/?t=a&x=1#fx")).toBe(
      "/my/?x=1#fx",
    );
  });

  it("sharePathWithQuery — 지금 출처에서 여는 경로 + 쿼리", () => {
    expect(
      sharePathWithQuery("https://sguys99.github.io/euro-digest/my/?t=arsenal"),
    ).toBe("/euro-digest/my/?t=arsenal");
    expect(sharePathWithQuery("not a url")).toBeNull();
  });

  it("dropped · 모르는 항목 문구", () => {
    expect(importNoticeParts(0, 0)).toEqual([]);
    expect(importResultMessage("merge", 2, 1)).toBe(
      "팔로우를 합쳤어요 · 한도 때문에 2개가 빠졌어요 · 모르는 항목 1개",
    );
    expect(importResultMessage("replace", 0, 0)).toBe("팔로우를 덮어썼어요");
    expect(importSkipMessage({ kind: "same", unknown: 0 })).toBe(
      "이미 같은 팔로우예요",
    );
    expect(importSkipMessage({ kind: "empty", unknown: 3 })).toBe(
      "가져올 팔로우가 없어요 · 모르는 항목 3개",
    );
  });

  it("followCountLabel · knownFromDirectory", () => {
    expect(followCountLabel(state(["a", "b"], ["c"]))).toBe("팀 2 · 선수 1");
    expect(followCountLabel(state([], ["c"]))).toBe("선수 1");
    expect(followCountLabel(EMPTY_FOLLOWS)).toBe("없음");
    const known = knownFromDirectory({ teams: { arsenal: {} }, players: {} });
    expect([...known.teams]).toEqual(["arsenal"]);
    expect(known.players.size).toBe(0);
  });
});
