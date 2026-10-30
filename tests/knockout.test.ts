import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { TeamLookup } from "@/lib/competition-view";
import {
  buildTie,
  competitionPhaseOf,
  isKnockoutRound,
  isLeaguePhaseOver,
  knockoutStagesView,
  legOfRound,
  stageOfRound,
  tieAnchorId,
  tieNoteText,
  tiesOf,
} from "@/lib/knockout";
import {
  CompetitionFileSchema,
  MatchSchema,
  type Match,
} from "@/lib/schema/competition";

// UCL 단계 판정 · 녹아웃 대진 묶기(M2-12 — PRD FR-43). 순수 함수 — 지금 시각은 고정 값으로 넣는다.

const team: TeamLookup = (slug) => ({
  slug,
  name: `팀-${slug}`,
  latin: false,
  short: slug.slice(0, 3).toUpperCase(),
  colors: ["#123456", "#FFFFFF"],
});

let seq = 0;
function match(
  round: string,
  kickoff: string,
  home: string,
  away: string,
  score: Match["score"] = null,
  status: Match["status"] = score ? "finished" : "scheduled",
): Match {
  seq += 1;
  return MatchSchema.parse({
    id: `t-${String(seq).padStart(4, "0")}`,
    comp: "UCL",
    round,
    kickoff,
    home,
    away,
    score,
    status,
  });
}

const ms = (iso: string) => Date.parse(iso);
const name = (slug: string) => `팀-${slug}`;
const day = (m: Match) => m.kickoff.slice(5, 10);

/** 리그 페이즈 8라운드 두 경기(끝 = 2027-01-27 20:00Z 킥오프) */
function leaguePhase(finished: boolean): Match[] {
  return [
    match("7", "2027-01-20T20:00:00Z", "a", "b", { h: 1, a: 0 }),
    match(
      "8",
      "2027-01-27T20:00:00Z",
      "c",
      "d",
      finished ? { h: 2, a: 2 } : null,
    ),
  ];
}

describe("라운드 꼴", () => {
  it("녹아웃 라운드 · 단계 · 차전", () => {
    expect(isKnockoutRound("8")).toBe(false);
    expect(isKnockoutRound("ko-r16-1")).toBe(true);
    expect(stageOfRound("ko-playoff-2")).toBe("ko-playoff");
    expect(stageOfRound("ko-final")).toBe("ko-final");
    expect(stageOfRound("8")).toBeNull();
    expect(stageOfRound("ko-unknown-1")).toBeNull();
    expect(legOfRound("ko-sf-2")).toBe(2);
    expect(legOfRound("ko-final")).toBeNull();
    expect(legOfRound("3")).toBeNull();
  });

  it("앵커 id — 앞 팀 · 뒤 팀", () => {
    expect(tieAnchorId("ko-r16", "arsenal", "inter")).toBe(
      "tie-ko-r16-arsenal-inter",
    );
  });
});

describe("대진 묶기 — 합산 · 연장 · 승부차기 (원정 다득점 없음)", () => {
  it("합산이 같고 승부차기 자료 없음 → 판정 불가(원정 다득점 안 씀) — 앞 팀 = 1차전 홈, 입력 순서와 무관", () => {
    const leg2 = match("ko-r16-2", "2027-03-17T20:00:00Z", "b", "a", {
      h: 2,
      a: 0,
    });
    const leg1 = match("ko-r16-1", "2027-03-10T20:00:00Z", "a", "b", {
      h: 3,
      a: 1,
    });
    const tie = buildTie("ko-r16", [leg2, leg1]);
    expect(tie.first).toBe("a");
    expect(tie.second).toBe("b");
    expect(tie.legs.map((m) => m.round)).toEqual(["ko-r16-1", "ko-r16-2"]);
    expect(tie.aggregate).toEqual({ first: 3, second: 3 });
    // 3–3 · 승부차기 자료 없음 → 원정 다득점(a가 원정 0골·b가 원정 1골)으로 가리지 않는다
    expect(tie.state).toBe("unresolved");
    expect(tie.winner).toBeNull();
    expect(tieNoteText(tie, name, day)).toBe("진출 팀 자료 없음");
  });

  it("합산이 갈리면 진출 — 마지막 차전 정규 시간이면 '합산'", () => {
    const tie = buildTie("ko-qf", [
      match("ko-qf-1", "2027-04-07T19:00:00Z", "a", "b", { h: 1, a: 2 }),
      match("ko-qf-2", "2027-04-14T19:00:00Z", "b", "a", { h: 1, a: 1 }),
    ]);
    expect(tie.aggregate).toEqual({ first: 2, second: 3 });
    expect(tie.state).toBe("decided");
    expect(tie.winner).toBe("b");
    expect(tie.decidedBy).toBe("aggregate");
    expect(tieNoteText(tie, name, day)).toBe("팀-b 진출");
  });

  it("2차전 연장에서 갈림 → '연장 끝'", () => {
    const tie = buildTie("ko-r16", [
      match("ko-r16-1", "2027-03-10T20:00:00Z", "a", "b", { h: 2, a: 1 }),
      match("ko-r16-2", "2027-03-17T20:00:00Z", "b", "a", {
        h: 3,
        a: 1,
        aet: true,
      }),
    ]);
    expect(tie.winner).toBe("b");
    expect(tie.decidedBy).toBe("extra-time");
    expect(tieNoteText(tie, name, day)).toBe("연장 끝 · 팀-b 진출");
  });

  it("합산이 같으면 2차전 승부차기 — 진출 팀 · 탈락 팀 순 표기", () => {
    const tie = buildTie("ko-r16", [
      match("ko-r16-1", "2027-03-10T20:00:00Z", "a", "b", { h: 0, a: 0 }),
      match("ko-r16-2", "2027-03-17T20:00:00Z", "b", "a", {
        h: 1,
        a: 1,
        aet: true,
        pens: { h: 3, a: 4 },
      }),
    ]);
    expect(tie.aggregate).toEqual({ first: 1, second: 1 });
    expect(tie.winner).toBe("a");
    expect(tie.decidedBy).toBe("penalties");
    expect(tie.shootout).toEqual({ winner: 4, loser: 3 });
    expect(tieNoteText(tie, name, day)).toBe("승부차기 4–3 · 팀-a 진출");
  });

  it("1차전만 끝남 — 합산 = 1차전, 다음 차전 날짜", () => {
    const tie = buildTie("ko-playoff", [
      match("ko-playoff-1", "2027-02-17T20:00:00Z", "a", "b", { h: 2, a: 1 }),
      match("ko-playoff-2", "2027-02-24T20:00:00Z", "b", "a"),
    ]);
    expect(tie.state).toBe("in-progress");
    expect(tie.aggregate).toEqual({ first: 2, second: 1 });
    expect(tieNoteText(tie, name, day)).toBe("1차전 종료 · 2차전 02-24");
  });

  it("2차전 연기 · 2차전 일정 미정(데이터에 없음)", () => {
    const postponed = buildTie("ko-r16", [
      match("ko-r16-1", "2027-03-10T20:00:00Z", "a", "b", { h: 1, a: 0 }),
      match("ko-r16-2", "2027-03-17T20:00:00Z", "b", "a", null, "postponed"),
    ]);
    expect(postponed.state).toBe("in-progress");
    expect(tieNoteText(postponed, name, day)).toBe("1차전 종료 · 2차전 연기");

    const missing = buildTie("ko-r16", [
      match("ko-r16-1", "2027-03-10T20:00:00Z", "a", "b", { h: 1, a: 0 }),
    ]);
    expect(missing.legs).toHaveLength(1);
    expect(missing.state).toBe("in-progress");
    expect(tieNoteText(missing, name, day)).toBe(
      "1차전 종료 · 2차전 일정 미정",
    );
  });

  it("2차전만 있는 대진 — 앞 팀 = 2차전 원정", () => {
    const tie = buildTie("ko-r16", [
      match("ko-r16-2", "2027-03-17T20:00:00Z", "b", "a", { h: 1, a: 0 }),
    ]);
    expect(tie.first).toBe("a");
    expect(tie.second).toBe("b");
    expect(tieNoteText(tie, name, day)).toBe("2차전 종료 · 1차전 일정 미정");
  });

  it("두 차전 모두 예정 — 합산 없음, 보조 문구 없음", () => {
    const tie = buildTie("ko-qf", [
      match("ko-qf-1", "2027-04-07T19:00:00Z", "a", "b"),
      match("ko-qf-2", "2027-04-14T19:00:00Z", "b", "a"),
    ]);
    expect(tie.state).toBe("scheduled");
    expect(tie.aggregate).toBeNull();
    expect(tieNoteText(tie, name, day)).toBeNull();
  });

  it("결승은 단판 — 정규 · 승부차기 → '우승'", () => {
    const regular = buildTie("ko-final", [
      match("ko-final", "2027-05-29T19:00:00Z", "a", "b", { h: 0, a: 1 }),
    ]);
    expect(regular.legCount).toBe(1);
    expect(regular.winner).toBe("b");
    expect(tieNoteText(regular, name, day)).toBe("팀-b 우승");

    const shootout = buildTie("ko-final", [
      match("ko-final", "2027-05-29T19:00:00Z", "a", "b", {
        h: 1,
        a: 1,
        aet: true,
        pens: { h: 4, a: 3 },
      }),
    ]);
    expect(shootout.first).toBe("a");
    expect(shootout.winner).toBe("a");
    expect(tieNoteText(shootout, name, day)).toBe("승부차기 4–3 · 팀-a 우승");
  });
});

describe("tiesOf — 단계별 묶음", () => {
  it("같은 단계·같은 두 팀만 한 대진, 리그 페이즈는 무시, 단계 진행 순 · 첫 차전 순", () => {
    const stages = tiesOf([
      ...leaguePhase(true),
      match("ko-r16-1", "2027-03-11T20:00:00Z", "e", "f", { h: 1, a: 0 }),
      match("ko-r16-1", "2027-03-10T20:00:00Z", "a", "b", { h: 1, a: 0 }),
      match("ko-r16-2", "2027-03-17T20:00:00Z", "b", "a"),
      match("ko-playoff-1", "2027-02-17T20:00:00Z", "a", "z", { h: 1, a: 0 }),
      match("ko-playoff-2", "2027-02-24T20:00:00Z", "z", "a", { h: 0, a: 0 }),
    ]);
    expect(stages.map((s) => s.stage)).toEqual(["ko-playoff", "ko-r16"]);
    expect(stages[0]!.decided).toBe(1);
    expect(stages[1]!.ties.map((t) => t.first)).toEqual(["a", "e"]);
    expect(stages[1]!.ties[0]!.legs).toHaveLength(2);
  });
});

describe("단계 판정 — 빌드 시각 기준", () => {
  it("리그 페이즈 진행 중(마지막 라운드 예정) → league", () => {
    const matches = leaguePhase(false);
    expect(competitionPhaseOf(matches, ms("2027-01-21T00:00:00Z"))).toEqual({
      kind: "league",
    });
  });

  it("리그 페이즈 종료 직후 · 대진 미정(녹아웃 경기 없음) → between", () => {
    expect(
      competitionPhaseOf(leaguePhase(true), ms("2027-01-28T00:00:00Z")),
    ).toEqual({ kind: "between" });
  });

  it("마지막 경기 결과가 늦어도(킥오프 + 3시간 지난 예정 = 결과 대기) 리그 페이즈는 끝난 것으로", () => {
    const matches = leaguePhase(false);
    expect(isLeaguePhaseOver(matches, ms("2027-01-27T22:59:00Z"))).toBe(false);
    expect(isLeaguePhaseOver(matches, ms("2027-01-27T23:00:00Z"))).toBe(true);
  });

  it("연기된 리그 경기는 끝을 막지 않는다 · 리그 경기가 없으면 끝이 아니다", () => {
    const matches = [
      match("8", "2027-01-27T20:00:00Z", "c", "d", null, "postponed"),
      match("8", "2027-01-27T20:00:00Z", "e", "f", { h: 0, a: 0 }),
    ];
    expect(isLeaguePhaseOver(matches, ms("2027-01-27T21:00:00Z"))).toBe(true);
    expect(isLeaguePhaseOver([], ms("2027-01-27T21:00:00Z"))).toBe(false);
    expect(competitionPhaseOf([], ms("2027-01-27T21:00:00Z"))).toEqual({
      kind: "league",
    });
  });

  it("녹아웃 PO 대진 발표(경기 예정) → knockout · ko-playoff", () => {
    const matches = [
      ...leaguePhase(true),
      match("ko-playoff-1", "2027-02-16T20:00:00Z", "x", "y"),
      match("ko-playoff-2", "2027-02-23T20:00:00Z", "y", "x"),
    ];
    expect(competitionPhaseOf(matches, ms("2027-01-31T00:00:00Z"))).toEqual({
      kind: "knockout",
      stage: "ko-playoff",
      stageDone: false,
    });
  });

  it("녹아웃 경기가 있어도 리그 페이즈가 덜 끝났으면(데이터 이상) league", () => {
    const matches = [
      ...leaguePhase(false),
      match("ko-playoff-1", "2027-02-16T20:00:00Z", "x", "y"),
    ];
    expect(competitionPhaseOf(matches, ms("2027-01-21T00:00:00Z"))).toEqual({
      kind: "league",
    });
  });

  it("PO 모두 결정 · 16강 대진 발표 전 → PO 종료(stageDone)", () => {
    const matches = [
      ...leaguePhase(true),
      match("ko-playoff-1", "2027-02-16T20:00:00Z", "x", "y", { h: 1, a: 0 }),
      match("ko-playoff-2", "2027-02-23T20:00:00Z", "y", "x", { h: 0, a: 0 }),
    ];
    expect(competitionPhaseOf(matches, ms("2027-02-25T00:00:00Z"))).toEqual({
      kind: "knockout",
      stage: "ko-playoff",
      stageDone: true,
    });
  });

  it("16강 1차전 뒤 → ko-r16 진행 중, 8강 대진 일부가 먼저 실려도 지금 단계는 16강", () => {
    const r16 = [
      ...leaguePhase(true),
      match("ko-r16-1", "2027-03-09T20:00:00Z", "a", "b", { h: 1, a: 0 }),
      match("ko-r16-2", "2027-03-16T20:00:00Z", "b", "a", { h: 0, a: 2 }),
      match("ko-r16-1", "2027-03-10T20:00:00Z", "c", "d", { h: 2, a: 2 }),
      match("ko-r16-2", "2027-03-17T20:00:00Z", "d", "c"),
    ];
    expect(competitionPhaseOf(r16, ms("2027-03-11T00:00:00Z"))).toEqual({
      kind: "knockout",
      stage: "ko-r16",
      stageDone: false,
    });
    const early = [...r16, match("ko-qf-1", "2027-04-06T19:00:00Z", "a", "e")];
    expect(competitionPhaseOf(early, ms("2027-03-17T00:00:00Z"))).toMatchObject(
      { kind: "knockout", stage: "ko-r16" },
    );
  });

  it("결승 뒤 → ko-final 종료", () => {
    const matches = [
      ...leaguePhase(true),
      match("ko-sf-1", "2027-04-27T19:00:00Z", "a", "b", { h: 1, a: 0 }),
      match("ko-sf-2", "2027-05-04T19:00:00Z", "b", "a", { h: 0, a: 0 }),
      match("ko-final", "2027-05-29T19:00:00Z", "a", "c", { h: 2, a: 1 }),
    ];
    expect(competitionPhaseOf(matches, ms("2027-05-30T00:00:00Z"))).toEqual({
      kind: "knockout",
      stage: "ko-final",
      stageDone: true,
    });
  });
});

describe("합성 fixture(fixtures/competitions/ucl-knockout.json) — 견본과 같은 입력", () => {
  const raw = JSON.parse(
    readFileSync(
      path.resolve("fixtures/competitions/ucl-knockout.json"),
      "utf8",
    ),
  ) as {
    now: string;
    file: unknown;
    final: { now: string; matches: unknown[] };
  };
  const file = CompetitionFileSchema.parse(raw.file);
  const finalMatches = MatchSchema.array().parse(raw.final.matches);

  it("16강 진행 중 — 대진 보기는 최신 단계부터, 16강 상태가 고루 있다", () => {
    const now = ms(raw.now);
    expect(competitionPhaseOf(file.matches, now)).toEqual({
      kind: "knockout",
      stage: "ko-r16",
      stageDone: false,
    });
    const stages = knockoutStagesView(file.matches, team, now);
    expect(stages.map((s) => s.label)).toEqual(["16강", "녹아웃 PO"]);
    expect(stages.map((s) => s.summary)).toEqual([
      "대진 8 · 결정 3",
      "대진 8 · 결정 8",
    ]);
    const r16 = stages[0]!.ties;
    expect(r16.map((t) => t.tie.decidedBy)).toEqual([
      "aggregate",
      "extra-time",
      "penalties",
      null,
      null,
      null,
      null,
      null,
    ]);
    // 2차전 킥오프 + 3시간이 지난 예정 경기 = 결과 대기(라운드 줄과 같은 규칙) · 연기
    expect(r16[3]!.legs[1]!.view.state).toBe("pending");
    expect(r16[6]!.legs[1]!.view.state).toBe("postponed");
    expect(r16[6]!.note).toBe("1차전 종료 · 2차전 연기");
  });

  it("결승 뒤 시나리오 — 우승", () => {
    const now = ms(raw.final.now);
    expect(competitionPhaseOf(finalMatches, now)).toEqual({
      kind: "knockout",
      stage: "ko-final",
      stageDone: true,
    });
    const [final, semis] = knockoutStagesView(finalMatches, team, now);
    expect(final!.ties[0]!.note).toBe(
      "승부차기 4–3 · 팀-paris-saint-germain 우승",
    );
    expect(semis!.ties.map((t) => t.tie.decidedBy)).toEqual([
      "aggregate",
      "extra-time",
    ]);
  });
});
