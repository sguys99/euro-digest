/**
 * 순위 → 순위표 구간 판정 (FR-42, M2-01) — configs/competitions.json zones를 6개 대회 실제 순위 fixtures에 적용한다.
 *
 * - UCL 16강 직행 1–8 · PO 9–24 · 25위 이하 none
 * - EPL·라리가·세리에 강등 18–20, 분데스·리그1 강등 PO 16("강등 PO") + 강등 17–18("강등")
 * - 동순위는 순위 숫자로 판정(라리가 10.11 19위 2팀, UCL 9위 3팀·22위 3팀 — D1 scope §5-6)
 * - 유럽 대항전(ucl·uel·uecl) 진출 구간은 아직 없다(2027-03 전후 1차 출처로 추가 — plan §16)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  CompetitionsFileSchema,
  type CompetitionConfig,
  type StandingZone,
} from "@/lib/schema";
import { NO_ZONE, standingZoneOf } from "@/lib/standing-zone";

const CONFIGS = fileURLToPath(new URL("../configs/", import.meta.url));
const FD = fileURLToPath(
  new URL("../fixtures/football/football-data/", import.meta.url),
);

const competitions = CompetitionsFileSchema.parse(
  JSON.parse(readFileSync(`${CONFIGS}competitions.json`, "utf8")),
);

/** football-data 순위 응답에서 TOTAL 표의 (순위, 팀 tla)만 읽는다 */
const StandingsFixtureSchema = z.object({
  standings: z.array(
    z.object({
      type: z.string(),
      table: z.array(
        z.object({
          position: z.number().int(),
          team: z.object({ tla: z.string() }),
        }),
      ),
    }),
  ),
});

const FIXTURE_OF: Record<string, string> = {
  PL: "standings-pl-2026-10-11.json",
  PD: "standings-pd-2026-10-11.json",
  SA: "standings-sa-2026-10-11.json",
  BL1: "standings-bl1-2026-10-11.json",
  FL1: "standings-fl1-2026-10-11.json",
  CL: "standings-cl-2026-10-10.json",
};

function config(id: CompetitionConfig["id"]): CompetitionConfig {
  const c = competitions.find((x) => x.id === id);
  if (!c) throw new Error(`대회 설정 없음: ${id}`);
  return c;
}

/** 대회 fixture 순위표 → 행마다 (순위, 구간, 라벨) */
function zonedTable(id: CompetitionConfig["id"]) {
  const c = config(id);
  const raw = StandingsFixtureSchema.parse(
    JSON.parse(readFileSync(`${FD}${FIXTURE_OF[c.footballDataCode]}`, "utf8")),
  );
  const total = raw.standings.filter((s) => s.type === "TOTAL");
  expect(total).toHaveLength(1);
  return total[0]!.table.map((r) => ({
    pos: r.position,
    ...standingZoneOf(r.position, c.zones),
  }));
}

/** 구간별 행 수 */
function countByZone(rows: { zone: StandingZone }[]) {
  const out: Partial<Record<StandingZone, number>> = {};
  for (const r of rows) out[r.zone] = (out[r.zone] ?? 0) + 1;
  return out;
}

describe("standingZoneOf — 규칙 단위", () => {
  const rules = config("BUNDESLIGA").zones;

  it("from~to 포함 경계와 라벨", () => {
    expect(standingZoneOf(15, rules)).toEqual(NO_ZONE);
    expect(standingZoneOf(16, rules)).toEqual({
      zone: "relegation",
      label: "강등 PO",
    });
    expect(standingZoneOf(17, rules)).toEqual({
      zone: "relegation",
      label: "강등",
    });
    expect(standingZoneOf(18, rules)).toEqual({
      zone: "relegation",
      label: "강등",
    });
  });

  it("규칙 밖·잘못된 순위(0·음수·소수·NaN)·빈 규칙은 none, 라벨 null", () => {
    expect(standingZoneOf(19, rules)).toEqual(NO_ZONE);
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(standingZoneOf(bad, rules)).toEqual(NO_ZONE);
    }
    expect(standingZoneOf(1, [])).toEqual({ zone: "none", label: null });
  });
});

describe("standingZoneOf — 6개 대회 fixtures 순위 (competitions.json zones)", () => {
  it("EPL 2026-10-11: 18–20위만 강등", () => {
    const rows = zonedTable("EPL");
    expect(rows).toHaveLength(20);
    expect(
      rows.filter((r) => r.zone === "relegation").map((r) => r.pos),
    ).toEqual([18, 19, 20]);
    expect(countByZone(rows)).toEqual({ none: 17, relegation: 3 });
    expect(
      new Set(rows.filter((r) => r.zone !== "none").map((r) => r.label)),
    ).toEqual(new Set(["강등"]));
  });

  it("라리가 2026-10-11: 동순위 19위 2팀 모두 강등 — 18·19·19 (순위 숫자 기준)", () => {
    const rows = zonedTable("LALIGA");
    expect(rows).toHaveLength(20);
    expect(
      rows.filter((r) => r.zone === "relegation").map((r) => r.pos),
    ).toEqual([18, 19, 19]);
    expect(
      rows.filter((r) => r.pos === 19).every((r) => r.label === "강등"),
    ).toBe(true);
    expect(countByZone(rows)).toEqual({ none: 17, relegation: 3 });
  });

  it("세리에 A 2026-10-11: 18–20위 강등", () => {
    const rows = zonedTable("SERIEA");
    expect(
      rows.filter((r) => r.zone === "relegation").map((r) => r.pos),
    ).toEqual([18, 19, 20]);
    expect(countByZone(rows)).toEqual({ none: 17, relegation: 3 });
  });

  it.each(["BUNDESLIGA", "LIGUE1"] as const)(
    "%s 2026-10-11: 16위 강등 PO · 17–18위 강등 (18팀)",
    (id) => {
      const rows = zonedTable(id);
      expect(rows).toHaveLength(18);
      expect(
        rows
          .filter((r) => r.zone === "relegation")
          .map((r) => [r.pos, r.label]),
      ).toEqual([
        [16, "강등 PO"],
        [17, "강등"],
        [18, "강등"],
      ]);
      expect(countByZone(rows)).toEqual({ none: 15, relegation: 3 });
    },
  );

  it("UCL 리그 페이즈 2026-10-10: 1–8위 16강 직행 8팀 · 9–24위 PO 16팀(동순위 9위 3팀·22위 3팀 포함) · 25위 이하 12팀 none", () => {
    const rows = zonedTable("UCL");
    expect(rows).toHaveLength(36);
    expect(countByZone(rows)).toEqual({ knockout: 8, playoff: 16, none: 12 });
    expect(rows.filter((r) => r.pos === 9).map((r) => r.zone)).toEqual([
      "playoff",
      "playoff",
      "playoff",
    ]);
    // 22위 3팀(22·23·24위 자리)은 순위 숫자 22라 모두 PO, 다음 순위 25부터 none
    expect(
      rows.filter((r) => r.pos === 22).every((r) => r.zone === "playoff"),
    ).toBe(true);
    expect(
      rows.filter((r) => r.pos >= 25).every((r) => r.zone === "none"),
    ).toBe(true);
    expect(standingZoneOf(8, config("UCL").zones).label).toBe("16강 직행");
    expect(standingZoneOf(24, config("UCL").zones).label).toBe("PO");
  });

  it("유럽 대항전 진출 구간(ucl·uel·uecl)은 아직 어떤 대회에도 없다 — 2027-03 전후 1차 출처로만 추가(관행값 금지)", () => {
    const zones = competitions.flatMap((c) => c.zones.map((z) => z.zone));
    for (const z of ["ucl", "uel", "uecl"] as const) {
      expect(zones).not.toContain(z);
    }
  });
});
