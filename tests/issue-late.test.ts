/**
 * M1-37 — 발행 지연 안내 판정(src/lib/issue-late.ts `isIssueLate`·`issueLateScript`)과 구간 계산(src/lib/issue.ts `issueLateWindows`)
 * (PRD DR-07 · §15 D26 계절별 07:00/07:30 · D48 +15분 · D49 전날 사이트 유지, DESIGN §9.3 상태 화면 ③).
 *
 * - 계절 경계: 2026-10-25(일 — 전환일, 아침 발행은 여름 07:00) · 10-26(월 — 겨울 07:30), 2027-03-28(일 — 겨울) · 03-29(월 — 여름)
 * - +15분 경계(포함) · 자정~목표 + 15분 전은 안내 없음 · 최신 호 당일은 구간 없음 · 내다본 날수 뒤는 늦음
 * - 인라인 스크립트(첫 페인트 전)와 섬 함수가 같은 결과 — 스크립트 문자열을 가짜 document·Date.now로 돌려 비교한다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ISSUE_LATE_HORIZON_DAYS, issueLateWindows } from "@/lib/issue";
import {
  ISSUE_LATE_ATTR,
  isIssueLate,
  issueLateScript,
  type LateWindow,
} from "@/lib/issue-late";
import { PUBLISH_GRACE_MINUTES, zonedToUtcIso } from "@/lib/time";

const at = (iso: string) => Date.parse(iso);
const kst = (local: string) => at(zonedToUtcIso(local, "Asia/Seoul"));
const MIN = 60_000;

describe("issueLateWindows — [그날 공개 목표 + 15분, 다음 날 KST 00:00)", () => {
  it("허용 지연은 D48의 15분", () => {
    expect(PUBLISH_GRACE_MINUTES).toBe(15);
  });

  it("가을 전환: 10-25(일 — 여름 07:00 + 15) · 10-26(월 — 겨울 07:30 + 15)", () => {
    const [d25, d26] = issueLateWindows("2026-10-24");
    expect(d25).toEqual([
      at("2026-10-24T22:15:00.000Z"),
      at("2026-10-25T15:00:00.000Z"),
    ]);
    expect(d26).toEqual([
      at("2026-10-25T22:45:00.000Z"),
      at("2026-10-26T15:00:00.000Z"),
    ]);
    expect(d25![0]).toBe(kst("2026-10-25T07:15"));
    expect(d26![0]).toBe(kst("2026-10-26T07:45"));
  });

  it("봄 전환: 03-28(일 — 겨울 07:30 + 15) · 03-29(월 — 여름 07:00 + 15)", () => {
    const [d28, d29] = issueLateWindows("2027-03-27");
    expect(d28![0]).toBe(kst("2027-03-28T07:45"));
    expect(d29![0]).toBe(kst("2027-03-29T07:15"));
  });

  it("최신 호 다음 날부터 기본 14일, 시간순 · 날수가 1 미만·정수 아님이면 던진다", () => {
    const windows = issueLateWindows("2026-10-23");
    expect(windows).toHaveLength(ISSUE_LATE_HORIZON_DAYS);
    expect(windows[0]![0]).toBe(kst("2026-10-24T07:15"));
    expect(windows.at(-1)![1]).toBe(kst("2026-11-07T00:00"));
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i]![0]).toBeGreaterThan(windows[i - 1]![1]);
    }
    expect(() => issueLateWindows("2026-10-23", 0)).toThrow(RangeError);
    expect(() => issueLateWindows("2026-10-23", 1.5)).toThrow(RangeError);
  });
});

describe("isIssueLate — 지금이 늦음 구간인가", () => {
  const windows = issueLateWindows("2026-10-24", 3);

  it("최신 호 당일(낮·밤)은 늦지 않다 — 오늘 호가 있다", () => {
    expect(isIssueLate(kst("2026-10-24T12:00"), windows)).toBe(false);
    expect(isIssueLate(kst("2026-10-24T23:59"), windows)).toBe(false);
  });

  it("다음 날 자정~목표 + 15분 전은 안내 없음", () => {
    expect(isIssueLate(kst("2026-10-25T00:00"), windows)).toBe(false);
    expect(isIssueLate(kst("2026-10-25T07:00"), windows)).toBe(false);
    expect(isIssueLate(kst("2026-10-25T07:15") - 1, windows)).toBe(false);
  });

  it("+15분 경계부터(포함) 그날 자정 전까지 늦음", () => {
    expect(isIssueLate(kst("2026-10-25T07:15"), windows)).toBe(true);
    expect(isIssueLate(kst("2026-10-25T09:10"), windows)).toBe(true);
    expect(isIssueLate(kst("2026-10-26T00:00") - 1, windows)).toBe(true);
  });

  it("겨울 첫날(10-26)은 07:45부터 — 07:20·07:44는 아직(다른 날 호가 계속 없어도 그날 목표 기준)", () => {
    expect(isIssueLate(kst("2026-10-26T07:20"), windows)).toBe(false);
    expect(isIssueLate(kst("2026-10-26T07:45") - MIN, windows)).toBe(false);
    expect(isIssueLate(kst("2026-10-26T07:45"), windows)).toBe(true);
  });

  it("내다본 날수 뒤는 모두 늦음 · 구간이 없으면 늦지 않음", () => {
    const end = windows.at(-1)![1];
    expect(isIssueLate(end, windows)).toBe(true);
    expect(isIssueLate(end + 30 * 24 * 60 * MIN, windows)).toBe(true);
    expect(isIssueLate(kst("2026-10-25T09:00"), [])).toBe(false);
  });
});

describe("issueLateScript — 첫 페인트 전 인라인 스크립트 = isIssueLate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 스크립트를 가짜 document·Date.now로 실행하고 `<html>` 속성을 돌려준다 */
  function runScript(
    windows: readonly LateWindow[],
    now: number,
    start = false,
  ) {
    const attrs = new Set<string>(start ? [ISSUE_LATE_ATTR] : []);
    const root = {
      setAttribute: (name: string) => attrs.add(name),
      removeAttribute: (name: string) => attrs.delete(name),
    };
    vi.spyOn(Date, "now").mockReturnValue(now);
    new Function("document", issueLateScript(windows))({
      documentElement: root,
    });
    return attrs.has(ISSUE_LATE_ATTR);
  }

  const windows = issueLateWindows("2026-10-24", 4);
  const instants = [
    kst("2026-10-24T12:00"),
    kst("2026-10-25T00:00"),
    kst("2026-10-25T07:15") - 1,
    kst("2026-10-25T07:15"),
    kst("2026-10-25T23:59"),
    kst("2026-10-26T07:44"),
    kst("2026-10-26T07:45"),
    windows.at(-1)![1] - 1,
    windows.at(-1)![1],
    windows.at(-1)![1] + 86_400_000,
  ];

  it.each(instants.map((t) => [new Date(t).toISOString(), t]))(
    "%s — 섬 함수와 같은 결과(이전 속성과 무관)",
    (_label, t) => {
      const expected = isIssueLate(t as number, windows);
      expect(runScript(windows, t as number, false)).toBe(expected);
      expect(runScript(windows, t as number, true)).toBe(expected);
    },
  );

  it("구간이 비면 늦지 않음 · 스크립트에는 빌드 숫자만 들어간다", () => {
    expect(runScript([], kst("2026-10-25T09:00"), true)).toBe(false);
    const source = issueLateScript(windows);
    expect(source).toMatch(/^\(function\(\)\{try\{var w=\[\[\d+,\d+\]/);
    expect(source).not.toMatch(/<|location|innerHTML/);
  });
});
