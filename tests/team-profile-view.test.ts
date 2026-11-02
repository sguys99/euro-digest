import { describe, expect, it } from "vitest";

import { teamProfileView } from "@/lib/team-profile-view";

// 팀 한줄평 · 강점/약점 화면 모델(M4-06 화면 — PRD FR-53 · FR-56, D64 ⑥). 표시 조건 · 생성 날짜(KST) · 오래된 값 "n주 전".
const PROFILE = {
  oneLiner: "리그 2위로 승점 28을 쌓았고, 현재 7경기 무패를 이어 가고 있다.",
  strengths: ["리그 현재 7연승", "리그 최소 실점 8골 수비"],
  weaknesses: ["챔피언스리그 원정 2경기 무승", "챔피언스리그 3경기 4골"],
  generatedAt: "2026-11-02T04:39:32.702Z",
};
const at = (iso: string) => Date.parse(iso);

describe("teamProfileView", () => {
  it("profile이 null이면 숨긴다(블록 없음 — 자리 상자 없음)", () => {
    expect(teamProfileView(null, at("2026-11-02T22:00:00Z"))).toBeNull();
  });

  it("값을 그대로 싣고 생성 날짜는 KST 'MM.DD (요일)'(UTC 04:39 = KST 13:39 같은 날)", () => {
    const view = teamProfileView(PROFILE, at("2026-11-02T22:00:00Z"));
    expect(view).toEqual({
      oneLiner: PROFILE.oneLiner,
      strengths: PROFILE.strengths,
      weaknesses: PROFILE.weaknesses,
      generatedAt: PROFILE.generatedAt,
      dateText: "11.02 (월)",
      weeksAgo: null,
    });
  });

  it("KST 날짜 경계 — UTC 일요일 16:00 생성은 KST 월요일 01:00", () => {
    const view = teamProfileView(
      { ...PROFILE, generatedAt: "2026-11-01T16:00:00Z" },
      at("2026-11-02T00:00:00Z"),
    );
    expect(view?.dateText).toBe("11.02 (월)");
  });

  it("7일 미만은 'n주 전'을 붙이지 않고, 7일 이상 지난 값(실패 팀 — 이전 값 유지)은 주 수를 붙인다", () => {
    const gen = "2026-10-19T04:00:00Z";
    const p = { ...PROFILE, generatedAt: gen };
    expect(teamProfileView(p, at("2026-10-26T03:59:59Z"))?.weeksAgo).toBeNull();
    expect(teamProfileView(p, at("2026-10-26T04:00:00Z"))?.weeksAgo).toBe(1);
    expect(teamProfileView(p, at("2026-11-09T05:00:00Z"))?.weeksAgo).toBe(3);
    expect(teamProfileView(p, at("2026-11-09T05:00:00Z"))?.dateText).toBe(
      "10.19 (월)",
    );
  });

  it("빈 문장(공백만)이 있으면 지어내지 않고 숨긴다", () => {
    const now = at("2026-11-02T22:00:00Z");
    expect(teamProfileView({ ...PROFILE, oneLiner: "  " }, now)).toBeNull();
    expect(
      teamProfileView({ ...PROFILE, strengths: ["리그 7연승", " "] }, now),
    ).toBeNull();
  });
});
