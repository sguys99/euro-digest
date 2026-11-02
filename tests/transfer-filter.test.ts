import { describe, expect, it } from "vitest";

import {
  EMPTY_TRANSFER_FILTER,
  isTransferFilterActive,
  matchesTransferFilter,
  parseTransferFilterQuery,
  toggleTransferFilter,
  transferFilterCounts,
  withTransferFilterQuery,
  type TransferFilterValues,
} from "@/lib/transfer-filter";

// 이적 필터 순수 규칙(M4-04 — FR-104, DESIGN §9.3 D2 "이적 필터"): 축 안 OR · 축 사이 AND, 주소 쿼리 왕복.

const KNOWN = {
  league: ["epl", "laliga", "seriea", "bundesliga", "ligue1"],
  team: ["arsenal", "bayern-munchen", "chelsea"],
  status: ["rumor", "negotiating", "agreed", "official", "collapsed"],
  tier: ["1", "2", "3"],
  kr: ["1"],
};

const row = (v: Partial<TransferFilterValues>): TransferFilterValues => ({
  league: [],
  team: [],
  status: [],
  tier: [],
  kr: [],
  ...v,
});

const KIM = row({
  league: ["epl", "bundesliga"],
  team: ["bayern-munchen", "arsenal"],
  status: ["rumor"],
  tier: ["3"],
  kr: ["1"],
});
const LEE = row({
  league: ["epl"],
  team: ["chelsea"],
  status: ["official"],
  tier: ["1"],
});

describe("matchesTransferFilter — 축 안 OR · 축 사이 AND", () => {
  it("고른 값이 없으면 모두 맞다", () => {
    expect(matchesTransferFilter(KIM, EMPTY_TRANSFER_FILTER)).toBe(true);
    expect(isTransferFilterActive(EMPTY_TRANSFER_FILTER)).toBe(false);
  });

  it("축 안 OR — 단계 루머 또는 공식이면 둘 다", () => {
    const s = { ...EMPTY_TRANSFER_FILTER, status: ["rumor", "official"] };
    expect(matchesTransferFilter(KIM, s)).toBe(true);
    expect(matchesTransferFilter(LEE, s)).toBe(true);
  });

  it("축 사이 AND — 리그 EPL 그리고 한국 선수", () => {
    const s = { ...EMPTY_TRANSFER_FILTER, league: ["epl"], kr: ["1"] };
    expect(matchesTransferFilter(KIM, s)).toBe(true);
    expect(matchesTransferFilter(LEE, s)).toBe(false);
    expect(isTransferFilterActive(s)).toBe(true);
  });

  it("행의 여러 값 중 하나만 맞아도(리그 · 팀은 소속 · 출발 · 행선지)", () => {
    const s = { ...EMPTY_TRANSFER_FILTER, team: ["arsenal"] };
    expect(matchesTransferFilter(KIM, s)).toBe(true);
    expect(
      matchesTransferFilter(KIM, {
        ...EMPTY_TRANSFER_FILTER,
        tier: ["1", "2"],
      }),
    ).toBe(false);
  });
});

describe("주소 쿼리", () => {
  it("쉼표 목록 · 소문자 · 아는 값만 · known 순서 · 중복 하나로", () => {
    expect(
      parseTransferFilterQuery(
        "?league=SERIEA,epl,xx,epl&status=official,rumor&tier=4&kr=1&team=",
        KNOWN,
      ),
    ).toEqual({
      league: ["epl", "seriea"],
      team: [],
      status: ["rumor", "official"],
      tier: [],
      kr: ["1"],
    });
  });

  it("상태 → 쿼리(다른 이름은 그대로, 빈 축은 지운다, 쉼표는 그대로) · 왕복", () => {
    const s = {
      ...EMPTY_TRANSFER_FILTER,
      league: ["epl", "laliga"],
      kr: ["1"],
    };
    const q = withTransferFilterQuery("?utm=x&status=rumor", s);
    expect(q).toBe("?utm=x&league=epl,laliga&kr=1");
    expect(parseTransferFilterQuery(q, KNOWN)).toEqual(s);
    expect(withTransferFilterQuery("?league=epl", EMPTY_TRANSFER_FILTER)).toBe(
      "",
    );
  });

  it("toggle — 켜면 known 순서로 끼우고, 다시 누르면 뺀다", () => {
    let s = toggleTransferFilter(
      EMPTY_TRANSFER_FILTER,
      "status",
      "official",
      KNOWN,
    );
    s = toggleTransferFilter(s, "status", "rumor", KNOWN);
    expect(s.status).toEqual(["rumor", "official"]);
    s = toggleTransferFilter(s, "status", "rumor", KNOWN);
    expect(s.status).toEqual(["official"]);
    expect(s.league).toEqual([]);
  });
});

describe("transferFilterCounts — 값별 행 수(행 안 중복은 한 번)", () => {
  it("리그 · Tier", () => {
    const dup = row({ league: ["epl", "epl"] });
    expect([...transferFilterCounts([KIM, LEE, dup], "league")]).toEqual([
      ["epl", 3],
      ["bundesliga", 1],
    ]);
    expect(transferFilterCounts([KIM, LEE], "kr").get("1")).toBe(1);
  });
});
