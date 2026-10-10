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
