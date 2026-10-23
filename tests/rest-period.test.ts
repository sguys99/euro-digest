/**
 * M1-37 — 비시즌 빈 상태에 싣는 대회(src/lib/rest-period.ts `offSeasonFeature`·`seasonLabel`)
 * (PRD DR-07 빈 상태 "비시즌·휴식기", DESIGN §9.3 상태 화면 ② — 평탄 탭 + 시즌명 + 날짜, `configs/competitions.json` 실값만).
 * 휴식기 판정 `restPeriodOf` 자체는 발행 게이트 테스트(tests/publish-gate.test.ts — 같은 함수를 다시 내보냄)가 본다.
 */
import { describe, expect, it } from "vitest";

import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { offSeasonFeature, restPeriodOf, seasonLabel } from "@/lib/rest-period";
import type { CompetitionsFile } from "@/lib/schema/configs";

const real = loadCompetitionsConfig();

function comp(
  id: CompetitionsFile[number]["id"],
  startDate: string,
  endDate: string,
): CompetitionsFile[number] {
  const base = real.find((c) => c.id === id);
  if (!base) throw new Error(`configs/competitions.json에 ${id} 없음`);
  return { ...base, startDate, endDate };
}

describe("offSeasonFeature", () => {
  it("시즌 중인 대회가 하나라도 있으면 null(S4 그대로)", () => {
    expect(offSeasonFeature("2026-10-25", real)).toBeNull();
    // 리그가 끝나도 UCL 결승 전이면 시즌 중
    const ucl = real.find((c) => c.id === "UCL")!;
    expect(offSeasonFeature(ucl.endDate, real)).toBeNull();
  });

  it("모두 끝났으면 가장 늦게 끝난 대회의 종료일(설정 실값)", () => {
    const latestEnd = real.reduce((a, b) => (b.endDate > a.endDate ? b : a));
    const after = "2027-07-01";
    expect(restPeriodOf(after, { competitions: real }).reasons).toContain(
      "off-season",
    );
    expect(offSeasonFeature(after, real)).toEqual({
      comp: latestEnd,
      phase: "ended",
      date: latestEnd.endDate,
    });
  });

  it("개막 전 대회가 있으면 가장 먼저 개막하는 대회의 개막일(일부가 끝났어도)", () => {
    const earliest = real.reduce((a, b) => (b.startDate < a.startDate ? b : a));
    expect(offSeasonFeature("2026-08-01", real)).toEqual({
      comp: earliest,
      phase: "upcoming",
      date: earliest.startDate,
    });
    const mixed: CompetitionsFile = [
      comp("EPL", "2026-08-21", "2027-05-30"),
      comp("LALIGA", "2027-08-15", "2028-05-28"),
      comp("UCL", "2027-09-14", "2028-05-27"),
    ];
    expect(offSeasonFeature("2027-07-01", mixed)).toMatchObject({
      phase: "upcoming",
      date: "2027-08-15",
      comp: { id: "LALIGA" },
    });
  });

  it("같은 날짜면 설정 파일 순서 · 대회가 없으면 null", () => {
    const tie: CompetitionsFile = [
      comp("EPL", "2026-08-21", "2027-05-30"),
      comp("LALIGA", "2026-08-16", "2027-05-30"),
    ];
    expect(offSeasonFeature("2027-06-10", tie)?.comp.id).toBe("EPL");
    expect(offSeasonFeature("2027-06-10", [])).toBeNull();
  });
});

describe("seasonLabel", () => {
  it("시작 연도 → 'YYYY-YY 시즌'(세기 경계 두 자리)", () => {
    expect(seasonLabel(2026)).toBe("2026-27 시즌");
    expect(seasonLabel(2099)).toBe("2099-00 시즌");
    expect(seasonLabel(2008)).toBe("2008-09 시즌");
  });
});
