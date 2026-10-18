/**
 * football-data 창 안 경기 상태 분포 `windowStatusSummary` 단위 테스트 (plan M1-41 "수집 시점 경기 상태 분포 기록", M0-28).
 * 브리핑 입력에는 쓰지 않는 로그 전용 값 — collect `collect.matchdata.done`(football-data)의 `windowStatus` → npm run observe.
 *
 * - 창 [start, end) 안·대상 대회만 센다(창 밖·대상 밖·형식 오류 제외)
 * - 미종료(FINISHED·AWARDED 밖)만 킥오프 순 목록, 상한 30
 * - 실제 fixture(2026-10-10 6개 대회 경기)는 모두 종료 — 브리핑 결과 수와 같다
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CompetitionsFileSchema } from "@/lib/schema";

import { briefInputWindow } from "../scripts/lib/brief-input";
import {
  WINDOW_UNFINISHED_MAX,
  toFinishedResults,
  windowStatusSummary,
} from "../scripts/lib/providers/football-data";

import { readFdFixture } from "./support/football-data-fake";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const COMPETITIONS = CompetitionsFileSchema.parse(
  JSON.parse(
    readFileSync(path.join(ROOT, "configs/competitions.json"), "utf8"),
  ),
);
const WINDOW = briefInputWindow("2026-10-11"); // UTC 하루 2026-10-10

function rawMatch(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 999001,
    utcDate: "2026-10-10T14:00:00Z",
    status: "FINISHED",
    matchday: 6,
    stage: "REGULAR_SEASON",
    competition: { code: "PL" },
    homeTeam: { id: 57, name: "Arsenal FC", shortName: "Arsenal" },
    awayTeam: { id: 61, name: "Chelsea FC", shortName: "Chelsea" },
    score: {
      duration: "REGULAR",
      fullTime: { home: 1, away: 0 },
      halfTime: { home: 0, away: 0 },
    },
    ...over,
  };
}

describe("windowStatusSummary", () => {
  it("창 안·대상 대회만 상태별로 세고 미종료는 킥오프 순으로 적는다", () => {
    const s = windowStatusSummary(
      [
        rawMatch({ id: 1 }),
        rawMatch({ id: 2, status: "AWARDED" }),
        rawMatch({ id: 3, status: "IN_PLAY", utcDate: "2026-10-10T20:00:00Z" }),
        rawMatch({
          id: 4,
          status: "TIMED",
          utcDate: "2026-10-10T19:45:00Z",
          competition: { code: "PD" },
        }),
        rawMatch({
          id: 5,
          status: "POSTPONED",
          utcDate: "2026-10-10T18:00:00Z",
        }),
        rawMatch({ id: 6, status: "TIMED", utcDate: "2026-10-11T00:00:00Z" }), // 창 끝(제외)
        rawMatch({ id: 7, status: "TIMED", competition: { code: "XX" } }), // 대상 밖
        { id: "형식 오류" },
      ],
      COMPETITIONS,
      WINDOW,
    );
    expect(s.statuses).toEqual({
      FINISHED: 1,
      AWARDED: 1,
      IN_PLAY: 1,
      TIMED: 1,
      POSTPONED: 1,
    });
    expect(s.unfinished).toEqual([
      { comp: "EPL", kickoff: "2026-10-10T18:00:00Z", status: "POSTPONED" },
      { comp: "LALIGA", kickoff: "2026-10-10T19:45:00Z", status: "TIMED" },
      { comp: "EPL", kickoff: "2026-10-10T20:00:00Z", status: "IN_PLAY" },
    ]);
    expect(s.unfinishedTotal).toBe(3);
  });

  it("상태 원문이 객체 키 이름이어도(__proto__·constructor) 자기 속성으로만 센다", () => {
    const s = windowStatusSummary(
      [
        rawMatch({ id: 1, status: "__proto__" }),
        rawMatch({ id: 2, status: "constructor" }),
      ],
      COMPETITIONS,
      WINDOW,
    );
    expect(Object.getPrototypeOf(s.statuses)).toBe(Object.prototype);
    expect(Object.hasOwn(s.statuses, "__proto__")).toBe(true);
    expect(s.statuses.constructor).toBe(1);
    expect(JSON.parse(JSON.stringify(s.statuses))).toEqual(
      JSON.parse('{"__proto__":1,"constructor":1}'),
    );
    expect(s.unfinishedTotal).toBe(2);
  });

  it(`미종료 목록은 ${WINDOW_UNFINISHED_MAX}개까지(로그 한 줄 크기)`, () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      rawMatch({ id: i + 1, status: "TIMED" }),
    );
    const s = windowStatusSummary(many, COMPETITIONS, WINDOW);
    expect(s.statuses).toEqual({ TIMED: 40 });
    expect(s.unfinished).toHaveLength(WINDOW_UNFINISHED_MAX);
    expect(s.unfinishedTotal).toBe(40);
  });

  it("실제 fixture(2026-10-10): 모두 종료 — 브리핑 종료 경기 수와 같다", () => {
    const raw = (
      JSON.parse(readFdFixture("matches-6comps-2026-10-10.json")) as {
        matches: unknown[];
      }
    ).matches;
    const s = windowStatusSummary(raw, COMPETITIONS, WINDOW);
    const finished = toFinishedResults(raw, COMPETITIONS, WINDOW).results
      .length;
    expect((s.statuses.FINISHED ?? 0) + (s.statuses.AWARDED ?? 0)).toBe(
      finished,
    );
  });
});
