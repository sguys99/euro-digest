import { describe, expect, it } from "vitest";

import {
  CompetitionFileSchema,
  MatchSchema,
  ScorerSchema,
  StandingRowSchema,
} from "@/lib/schema";

import { at, issueMessages, issuePaths, passes, validFixture } from "./helpers";

const file = validFixture(CompetitionFileSchema, "data/competitions/epl.json");
const row = at(file.standings, 0);
const match = at(file.matches, 0);

describe("StandingRow (부록 A, FR-42)", () => {
  it("첫 수집일 prevPos null을 허용한다", () => {
    expect(passes(StandingRowSchema, { ...row, prevPos: null })).toBe(true);
  });

  it("폼은 W/D/L 최대 5개", () => {
    expect(
      issuePaths(StandingRowSchema, {
        ...row,
        form: ["W", "W", "W", "W", "W", "W"],
      }),
    ).toEqual(["form"]);
    expect(issuePaths(StandingRowSchema, { ...row, form: ["W", "X"] })).toEqual(
      ["form.1"],
    );
  });

  it("UCL 리그 페이즈 구간 knockout·playoff를 받는다 (결정 Q4)", () => {
    const ucl = validFixture(
      CompetitionFileSchema,
      "data/competitions/ucl.json",
    );
    expect(ucl.standings.map((r) => r.zone)).toEqual([
      "knockout",
      "playoff",
      "none",
    ]);
    expect(passes(StandingRowSchema, { ...row, zone: "playoff" })).toBe(true);
  });

  it("그 밖의 구간 값은 실패한다", () => {
    expect(
      issuePaths(StandingRowSchema, { ...row, zone: "promotion" }),
    ).toEqual(["zone"]);
  });
});

describe("Match (부록 A, FR-44)", () => {
  it("예정 경기는 score null", () => {
    expect(passes(MatchSchema, at(file.matches, 1))).toBe(true);
  });

  it("상태 열거값·킥오프 UTC를 검사한다", () => {
    expect(issuePaths(MatchSchema, { ...match, status: "live" })).toEqual([
      "status",
    ]);
    expect(
      issuePaths(MatchSchema, {
        ...match,
        kickoff: "2026-10-04T23:00:00+09:00",
      }),
    ).toEqual(["kickoff"]);
  });
});

describe("Match 선택 필드 — tbc·score.pens·score.aet (2026-10-30 사용자 결정, M2-02)", () => {
  const ucl = validFixture(CompetitionFileSchema, "data/competitions/ucl.json");

  it("킥오프 미확정은 tbc: true, 확정 경기는 키 생략", () => {
    expect(at(file.matches, 1).tbc).toBe(true);
    expect("tbc" in match).toBe(false);
    expect(issuePaths(MatchSchema, { ...match, tbc: false })).toEqual(["tbc"]);
  });

  it("승부차기 경기는 pens + aet, 연장 종료는 aet만 — h·a는 승부차기 골 제외", () => {
    expect(at(ucl.matches, 1).score).toEqual({
      h: 2,
      a: 2,
      pens: { h: 4, a: 3 },
      aet: true,
    });
    expect(at(ucl.matches, 2).score).toEqual({ h: 1, a: 0, aet: true });
    expect(at(ucl.matches, 0).score).toEqual({ h: 3, a: 0 });
  });

  it("aet는 true만, pens는 h·a 숫자", () => {
    expect(
      issuePaths(MatchSchema, { ...match, score: { h: 1, a: 1, aet: false } }),
    ).toEqual(["score.aet"]);
    expect(
      issuePaths(MatchSchema, {
        ...match,
        score: { h: 1, a: 1, pens: { h: 4 } },
      }),
    ).toEqual(["score.pens.a"]);
  });
});

describe("CompetitionFile — data/competitions/{comp}.json (초안)", () => {
  it("fixture가 통과한다", () => {
    expect(file.comp).toBe("EPL");
    expect(file.scorers).toHaveLength(2);
  });

  it("scorers를 생략하면 []로 채운다", () => {
    const parsed = CompetitionFileSchema.parse({ ...file, scorers: undefined });
    expect(parsed.scorers).toEqual([]);
  });

  it("다른 대회 경기가 섞이면 실패한다", () => {
    const mixed = {
      ...file,
      matches: [match, { ...at(file.matches, 1), comp: "UCL" }],
    };
    expect(issuePaths(CompetitionFileSchema, mixed)).toEqual([
      "matches.1.comp",
    ]);
    expect(issueMessages(CompetitionFileSchema, mixed)[0]).toContain("EPL");
  });

  it("순위표 팀·경기 id 중복을 막는다", () => {
    expect(
      issuePaths(CompetitionFileSchema, { ...file, standings: [row, row] }),
    ).toEqual(["standings.1.team"]);
    expect(
      issuePaths(CompetitionFileSchema, { ...file, matches: [match, match] }),
    ).toEqual(["matches.1.id"]);
  });

  it("provider·updatedAt 형식을 검사한다", () => {
    expect(
      issuePaths(CompetitionFileSchema, { ...file, provider: "fbref" }),
    ).toEqual(["provider"]);
    expect(
      issuePaths(CompetitionFileSchema, { ...file, updatedAt: "어제" }),
    ).toEqual(["updatedAt"]);
  });
});

describe("Scorer (초안)", () => {
  const scorer = at(file.scorers, 0);

  it("도움·페널티·출전 수는 null 허용", () => {
    expect(passes(ScorerSchema, at(file.scorers, 1))).toBe(true);
  });

  it("골은 0 이상 정수", () => {
    expect(issuePaths(ScorerSchema, { ...scorer, goals: -1 })).toEqual([
      "goals",
    ]);
    expect(issuePaths(ScorerSchema, { ...scorer, goals: 1.5 })).toEqual([
      "goals",
    ]);
  });
});
