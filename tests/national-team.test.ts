/**
 * M3-05 — A매치 기간 판정(src/lib/national-team.ts, PRD FR-71)과 대표팀 설정 로더(src/lib/data/national-team.ts).
 * 경계: 경기일(KST) ±3일 양 끝 포함 · 이어지는 기간 합치기 · KST 날짜 넘김(UTC 저녁 킥오프) · 유럽 서머타임 전환과 무관 · 연기 경기 제외.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadNationalTeamConfig,
  loadNationalTeamToday,
} from "@/lib/data/national-team";
import {
  NATIONAL_WINDOW_DAYS,
  isNationalWindow,
  nationalMatchDay,
  nationalWindowOn,
  nationalWindows,
  type NationalWindowMatch,
} from "@/lib/national-team";
import { restPeriodOf } from "@/lib/rest-period";
import { NationalTeamFileSchema } from "@/lib/schema/configs";

const m = (
  id: string,
  kickoff: string,
  status: NationalWindowMatch["status"] = "scheduled",
): NationalWindowMatch => ({ id, kickoff, status });

describe("nationalMatchDay — 경기일은 킥오프의 KST 날짜", () => {
  it("UTC 15:00 이후 킥오프는 KST 다음 날", () => {
    expect(nationalMatchDay(m("a", "2026-11-13T14:59:00Z"))).toBe("2026-11-13");
    expect(nationalMatchDay(m("a", "2026-11-13T15:00:00Z"))).toBe("2026-11-14");
  });

  it("연기 경기는 기간을 만들지 않는다", () => {
    expect(
      nationalMatchDay(m("a", "2026-11-13T11:00:00Z", "postponed")),
    ).toBeNull();
    expect(
      nationalWindows([m("a", "2026-11-13T11:00:00Z", "postponed")]),
    ).toEqual([]);
  });
});

describe("nationalWindows — ±3일 · 이어지는 기간 합치기", () => {
  it("한 경기 = 경기일 −3 ~ +3일(양 끝 포함)", () => {
    expect(NATIONAL_WINDOW_DAYS).toBe(3);
    const matches = [m("one", "2026-11-14T11:00:00Z")];
    expect(nationalWindows(matches)).toEqual([
      { from: "2026-11-11", to: "2026-11-17", matchIds: ["one"] },
    ]);
    expect(isNationalWindow("2026-11-10", matches)).toBe(false);
    expect(isNationalWindow("2026-11-11", matches)).toBe(true);
    expect(isNationalWindow("2026-11-17", matches)).toBe(true);
    expect(isNationalWindow("2026-11-18", matches)).toBe(false);
  });

  it("겹치는 두 경기는 한 기간", () => {
    const w = nationalWindows([
      m("b", "2026-11-17T14:00:00Z"),
      m("a", "2026-11-13T14:30:00Z"),
    ]);
    expect(w).toEqual([
      { from: "2026-11-10", to: "2026-11-20", matchIds: ["a", "b"] },
    ]);
  });

  it("바로 이어지는 기간(앞 끝 다음 날 = 뒤 시작)도 합친다 — 하루라도 비면 나눈다", () => {
    // 11-01 → 10-29~11-04 · 11-08 → 11-05~11-11 (이어짐)
    expect(
      nationalWindows([
        m("a", "2026-11-01T11:00:00Z"),
        m("b", "2026-11-08T11:00:00Z"),
      ]),
    ).toEqual([{ from: "2026-10-29", to: "2026-11-11", matchIds: ["a", "b"] }]);
    // 11-01 → ~11-04 · 11-09 → 11-06~ (11-05 비어 있음)
    const split = nationalWindows([
      m("a", "2026-11-01T11:00:00Z"),
      m("b", "2026-11-09T11:00:00Z"),
    ]);
    expect(split).toEqual([
      { from: "2026-10-29", to: "2026-11-04", matchIds: ["a"] },
      { from: "2026-11-06", to: "2026-11-12", matchIds: ["b"] },
    ]);
    const gapMatches = [
      m("a", "2026-11-01T11:00:00Z"),
      m("b", "2026-11-09T11:00:00Z"),
    ];
    expect(nationalWindowOn("2026-11-05", gapMatches)).toBeNull();
    expect(nationalWindowOn("2026-11-06", gapMatches)?.matchIds).toEqual(["b"]);
  });

  it("세 경기 연속 창 — 가운데 경기가 양쪽을 잇는다", () => {
    const w = nationalWindows([
      m("a", "2027-03-20T11:00:00Z"),
      m("c", "2027-03-31T11:00:00Z"),
      m("b", "2027-03-26T11:00:00Z"),
    ]);
    expect(w).toEqual([
      { from: "2027-03-17", to: "2027-04-03", matchIds: ["a", "b", "c"] },
    ]);
  });

  it("유럽 서머타임 전환(2026-10-25 · 2027-03-28)과 무관 — KST 날짜만 본다", () => {
    expect(nationalWindows([m("a", "2026-10-25T11:00:00Z")])).toEqual([
      { from: "2026-10-22", to: "2026-10-28", matchIds: ["a"] },
    ]);
    expect(nationalWindows([m("a", "2027-03-28T00:30:00Z")])).toEqual([
      { from: "2027-03-25", to: "2027-03-31", matchIds: ["a"] },
    ]);
  });

  it("월말·연말 경계", () => {
    expect(nationalWindows([m("a", "2026-12-30T11:00:00Z")])).toEqual([
      { from: "2026-12-27", to: "2027-01-02", matchIds: ["a"] },
    ]);
  });

  it("경기 없음 → 기간 없음", () => {
    expect(nationalWindows([])).toEqual([]);
    expect(isNationalWindow("2026-11-15", [])).toBe(false);
  });
});

describe("configs/national-team.json 실값 — 11월 도하 2경기", () => {
  const config = loadNationalTeamConfig();

  it("설정이 스키마를 통과하고 11월 기간은 11-10 ~ 11-20(KST)", () => {
    expect(config).not.toBeNull();
    const windows = nationalWindows(config!.matches);
    expect(windows.at(-1)).toEqual({
      from: "2026-11-10",
      to: "2026-11-20",
      matchIds: ["2026-11-13-saudi-arabia", "2026-11-17-qatar"],
    });
    expect(isNationalWindow("2026-11-09", config!.matches)).toBe(false);
    expect(isNationalWindow("2026-11-21", config!.matches)).toBe(false);
  });

  it("발행 게이트 휴식기 판정(restPeriodOf)도 같은 기간", () => {
    const at = (date: string) =>
      restPeriodOf(date, { nationalTeam: config! }).reasons;
    expect(at("2026-11-09")).toEqual([]);
    expect(at("2026-11-10")).toEqual(["international-window"]);
    expect(at("2026-11-20")).toEqual(["international-window"]);
    expect(at("2026-11-21")).toEqual([]);
  });

  it("loadNationalTeamToday — 빌드 시각의 KST 날짜로 판정", () => {
    // 2026-11-09T15:00Z = 11-10 00:00 KST → 기간 첫날
    const first = loadNationalTeamToday(new Date("2026-11-09T15:00:00Z"));
    expect(first.date).toBe("2026-11-10");
    expect(first.window?.from).toBe("2026-11-10");
    expect(first.matches.map((x) => x.id)).toEqual([
      "2026-11-13-saudi-arabia",
      "2026-11-17-qatar",
    ]);
    // 2026-11-09T14:59Z = 11-09 23:59 KST → 평시
    const before = loadNationalTeamToday(new Date("2026-11-09T14:59:00Z"));
    expect(before).toEqual({ date: "2026-11-09", window: null, matches: [] });
  });
});

describe("loadNationalTeamConfig — 파일 없음·깨짐", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "national-team-"));

  it("파일이 없으면 null · 판정은 평시", () => {
    const missing = path.join(dir, "missing.json");
    expect(loadNationalTeamConfig(missing)).toBeNull();
    expect(
      loadNationalTeamToday(new Date("2026-11-12T00:00:00Z"), missing),
    ).toEqual({ date: "2026-11-12", window: null, matches: [] });
  });

  it("스키마 검증 실패면 던진다(빌드 실패)", () => {
    const broken = path.join(dir, "broken.json");
    writeFileSync(broken, JSON.stringify({ matches: [{ id: "x" }] }));
    expect(() => loadNationalTeamConfig(broken)).toThrow(/스키마 검증 실패/);
  });

  it("스키마 기본값 — kickoffTbd 생략 시 false, squads 생략 시 빈 배열", () => {
    const parsed = NationalTeamFileSchema.parse({
      matches: [
        {
          id: "2026-11-13-saudi-arabia",
          kickoff: "2026-11-13T14:30:00Z",
          opponent: "사우디아라비아",
          home: false,
          competition: "친선경기",
          status: "scheduled",
          result: null,
        },
      ],
    });
    expect(parsed.matches[0]!.kickoffTbd).toBe(false);
    expect(parsed.squads).toEqual([]);
  });
});
