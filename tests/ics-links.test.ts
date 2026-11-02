import { describe, expect, it } from "vitest";

import { matchStateOf } from "@/lib/competition-view";
import {
  matchIcsFeed,
  nationalIcsFeed,
  teamIcsFeed,
  upcomingMatchIcsFeed,
  upcomingRowIcsFeed,
} from "@/lib/ics-links";
import { nationalMatchState } from "@/lib/national-team-view";
import { icsPath } from "@/lib/paths";
import type { Match } from "@/lib/schema/competition";

// .ics 버튼 노출 조건(M4-12 — PRD FR-59 · FR-83 · FR-123). 파일 규칙은 scripts/lib/site-ics.ts `matchFileEvents`(scheduled 전부 + next + 대표팀 scheduled).
const base: Match = {
  id: "538001",
  comp: "EPL",
  round: "11",
  kickoff: "2026-11-07T15:00:00Z",
  home: "arsenal",
  away: "chelsea",
  score: null,
  status: "scheduled",
};
const MORNING = Date.parse("2026-11-07T00:00:00Z");

describe("matchIcsFeed — 데이터 상태 scheduled만(파일이 있는 경기)", () => {
  it("scheduled → 경기별 파일, finished · postponed → 없음", () => {
    expect(matchIcsFeed(base)).toEqual({ kind: "match", matchId: "538001" });
    expect(icsPath(matchIcsFeed(base)!)).toBe(
      "/euro-digest/calendar/match/538001.ics",
    );
    expect(matchIcsFeed({ ...base, status: "finished" })).toBeNull();
    expect(matchIcsFeed({ ...base, status: "postponed" })).toBeNull();
  });
});

describe("upcomingMatchIcsFeed — 화면 예정 + 데이터 scheduled", () => {
  const at = (m: Match, now: number) =>
    upcomingMatchIcsFeed(matchStateOf(m, now), m);

  it("킥오프 전 예정 경기 → 링크", () => {
    expect(at(base, MORNING)).toEqual({ kind: "match", matchId: "538001" });
  });

  it("킥오프 미정(tbc) → 링크(파일은 종일 TENTATIVE)", () => {
    expect(
      at({ ...base, tbc: true }, Date.parse("2026-11-08T00:00:00Z")),
    ).toEqual({ kind: "match", matchId: "538001" });
  });

  it("킥오프 + 3시간이 지난 scheduled(결과 대기) · 종료 · 연기 → 없음", () => {
    expect(at(base, Date.parse("2026-11-07T18:30:00Z"))).toBeNull();
    expect(
      at({ ...base, status: "finished", score: { h: 1, a: 0 } }, MORNING),
    ).toBeNull();
    expect(at({ ...base, status: "postponed" }, MORNING)).toBeNull();
    // 화면이 연기 경기를 예정처럼 그리는 경우(오늘 밤 카드 폴백)에도 데이터 상태로 막는다
    expect(
      upcomingMatchIcsFeed("scheduled", { ...base, status: "postponed" }),
    ).toBeNull();
  });
});

describe("nationalIcsFeed · upcomingRowIcsFeed · teamIcsFeed", () => {
  it("대표팀 행: 예정(킥오프 전)만, 결과 대기 · 종료 · 연기는 없음", () => {
    const m = { status: "scheduled" as const, kickoff: "2026-11-14T11:00:00Z" };
    const before = nationalMatchState(m, Date.parse("2026-11-13T00:00:00Z"));
    const after = nationalMatchState(m, Date.parse("2026-11-14T12:00:00Z"));
    expect(nationalIcsFeed({ id: "kor-2026-11-14", state: before })).toEqual({
      kind: "match",
      matchId: "kor-2026-11-14",
    });
    expect(nationalIcsFeed({ id: "kor-2026-11-14", state: after })).toBeNull();
    expect(
      nationalIcsFeed({ id: "kor-2026-11-14", state: "finished" }),
    ).toBeNull();
    expect(
      nationalIcsFeed({ id: "kor-2026-11-14", state: "postponed" }),
    ).toBeNull();
  });

  it("선수 다음 경기 줄 · 팀 → 경로", () => {
    expect(icsPath(upcomingRowIcsFeed({ key: "af-1575300" }))).toBe(
      "/euro-digest/calendar/match/af-1575300.ics",
    );
    expect(icsPath(teamIcsFeed("atletico-madrid"))).toBe(
      "/euro-digest/calendar/atletico-madrid.ics",
    );
  });
});
