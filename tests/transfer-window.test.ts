/**
 * M4-03 — 이적 창 모드 판정 (src/lib/transfer-window.ts, PRD FR-105). 순수 함수 — 네트워크·파일 없음.
 *
 * 경계: 창 [opensAt, closesAt) — 개장 순간 포함·마감 순간 제외 · 모드 = 리그 합집합(한 리그만 열려도 모드) · 리그별 개장·마감 차이 ·
 * 마감 뒤 유예 24시간(사용자 결정 2026-11-02 — 시작·끝 경계, 리그별 마감이 엇갈리면 모드 종료 시각 기준) · 남은 일수 = KST 달력 날짜 차이 ·
 * 유럽 서머타임 전환 앞뒤(판정은 UTC 순간 그대로 — 전환이 판정을 흔들지 않는다).
 */
import { describe, expect, it } from "vitest";

import {
  TRANSFER_WINDOW_GRACE_HOURS,
  isTransferWindowActive,
  isWindowOpenAt,
  transferWindowState,
  type TransferWindowInput,
} from "@/lib/transfer-window";
import { europeanSummerTimeTransitions, zonedToUtcIso } from "@/lib/time";

/** 2026-27 겨울 창(configs/transfer-windows.json과 같은 값 — 리그별 개장·마감이 다르다) */
const WINTER: TransferWindowInput[] = [
  {
    comp: "EPL",
    season: 2026,
    kind: "winter",
    opensAt: "2027-01-01T00:00:00.000Z",
    closesAt: "2027-02-01T23:00:00.000Z",
  },
  {
    comp: "LALIGA",
    season: 2026,
    kind: "winter",
    opensAt: "2027-01-01T23:00:00.000Z",
    closesAt: "2027-02-01T22:59:00.000Z",
  },
  {
    comp: "SERIEA",
    season: 2026,
    kind: "winter",
    opensAt: "2027-01-01T23:00:00.000Z",
    closesAt: "2027-02-01T19:00:00.000Z",
  },
  {
    comp: "BUNDESLIGA",
    season: 2026,
    kind: "winter",
    opensAt: "2026-12-31T23:00:00.000Z",
    closesAt: "2027-02-01T19:00:00.000Z",
  },
  {
    comp: "LIGUE1",
    season: 2026,
    kind: "winter",
    opensAt: "2026-12-31T23:00:00.000Z",
    closesAt: "2027-02-01T18:59:00.000Z",
  },
];

const SUMMER_EPL: TransferWindowInput = {
  comp: "EPL",
  season: 2027,
  kind: "summer",
  opensAt: "2027-06-13T23:00:00.000Z",
  closesAt: "2027-09-01T22:00:00.000Z",
};
const SUMMER_SERIEA: TransferWindowInput = {
  comp: "SERIEA",
  season: 2027,
  kind: "summer",
  opensAt: "2027-06-30T22:00:00.000Z",
  closesAt: "2027-09-01T18:00:00.000Z",
};

const ALL = [...WINTER, SUMMER_EPL, SUMMER_SERIEA];
const comps = (list: readonly { comp: string }[]) => list.map((w) => w.comp);

describe("창 하나 — [opensAt, closesAt)", () => {
  const epl = WINTER[0]!;
  it("개장 순간은 열림, 1ms 전은 닫힘", () => {
    expect(isWindowOpenAt(epl, "2027-01-01T00:00:00.000Z")).toBe(true);
    expect(isWindowOpenAt(epl, "2026-12-31T23:59:59.999Z")).toBe(false);
  });
  it("마감 순간은 닫힘, 1ms 전은 열림", () => {
    expect(isWindowOpenAt(epl, "2027-02-01T22:59:59.999Z")).toBe(true);
    expect(isWindowOpenAt(epl, "2027-02-01T23:00:00.000Z")).toBe(false);
  });
});

describe("이적 창 모드 = 리그 합집합", () => {
  it("모드 아님 — 시즌 중(11월)·창 사이(3~5월)·빈 설정", () => {
    for (const at of [
      "2026-11-02T22:10:00.000Z",
      "2027-03-15T00:00:00.000Z",
      "2027-06-13T21:59:59.999Z",
    ]) {
      expect(isTransferWindowActive(at, ALL)).toBe(false);
      const state = transferWindowState(at, ALL);
      expect(state).toMatchObject({
        active: false,
        grace: false,
        open: [],
        closesAt: null,
        daysLeft: null,
      });
    }
    expect(transferWindowState("2027-01-15T00:00:00.000Z", [])).toEqual({
      active: false,
      grace: false,
      open: [],
      closesAt: null,
      daysLeft: null,
      closedAt: null,
      graceEndsAt: null,
      closedComps: [],
      upcoming: [],
    });
  });

  it("겨울 개장 — 분데스리가·리그 1(01-01 00:00 CET = 12-31 23:00Z)이 EPL(00:00 GMT)보다 1시간 먼저, 라리가·세리에 A는 하루 뒤", () => {
    const first = transferWindowState("2026-12-31T23:00:00.000Z", WINTER);
    expect(first.active).toBe(true);
    expect(comps(first.open).sort()).toEqual(["BUNDESLIGA", "LIGUE1"]);
    expect(comps(first.upcoming)).toEqual(["EPL", "LALIGA", "SERIEA"]);

    const jan1 = transferWindowState("2027-01-01T12:00:00.000Z", WINTER);
    expect(comps(jan1.open).sort()).toEqual(["BUNDESLIGA", "EPL", "LIGUE1"]);
    expect(comps(jan1.upcoming)).toEqual(["LALIGA", "SERIEA"]); // 개장 같은 시각 → comp 순

    const jan2 = transferWindowState("2027-01-01T23:00:00.000Z", WINTER);
    expect(jan2.open).toHaveLength(5);
    expect(jan2.upcoming).toEqual([]);
  });

  it("겨울 마감 — 리그별로 차례로 닫히고, 마지막 리그(EPL 23:00Z)가 닫히면 열린 창 없음(유예로 넘어감)", () => {
    const at = (iso: string) => comps(transferWindowState(iso, WINTER).open);
    expect(at("2027-02-01T18:58:59.999Z")).toEqual([
      "LIGUE1",
      "BUNDESLIGA",
      "SERIEA",
      "LALIGA",
      "EPL",
    ]); // 마감 이른 순 → 같은 마감은 comp 순
    expect(at("2027-02-01T18:59:00.000Z")).toEqual([
      "BUNDESLIGA",
      "SERIEA",
      "LALIGA",
      "EPL",
    ]);
    expect(at("2027-02-01T19:00:00.000Z")).toEqual(["LALIGA", "EPL"]);
    expect(at("2027-02-01T22:59:00.000Z")).toEqual(["EPL"]);
    const last = transferWindowState("2027-02-01T22:59:00.000Z", WINTER);
    expect(last.active).toBe(true);
    expect(last.closesAt).toBe("2027-02-01T23:00:00.000Z");
    expect(last.grace).toBe(false); // 열린 창이 있으면 유예가 아니다
    const closed = transferWindowState("2027-02-01T23:00:00.000Z", WINTER);
    expect(closed.open).toEqual([]);
    expect(closed.grace).toBe(true);
  });

  it("여름 — EPL만 열린 6월 중순도 모드(세리에 A는 아직 upcoming)", () => {
    const state = transferWindowState("2027-06-20T21:30:00.000Z", [
      SUMMER_EPL,
      SUMMER_SERIEA,
    ]);
    expect(state.active).toBe(true);
    expect(comps(state.open)).toEqual(["EPL"]);
    expect(comps(state.upcoming)).toEqual(["SERIEA"]);
    expect(state.upcoming[0]!.daysUntil).toBe(10); // 06-21 KST → 07-01 KST
  });

  it("지난 창은 open·upcoming 어디에도 없다", () => {
    const state = transferWindowState("2027-03-01T00:00:00.000Z", ALL);
    expect(comps(state.upcoming)).toEqual(["EPL", "SERIEA"]);
    expect(state.upcoming.every((w) => w.kind === "summer")).toBe(true);
  });
});

describe("마감 뒤 유예 24시간 — [마지막 closesAt, + 24h)", () => {
  it("상수는 24시간", () => {
    expect(TRANSFER_WINDOW_GRACE_HOURS).toBe(24);
  });

  it("유예 시작 — 마지막 마감 순간부터 모드 유지(열린 창 없음, 남은 일수 없음)", () => {
    const at = "2027-02-01T23:00:00.000Z";
    expect(isTransferWindowActive(at, WINTER)).toBe(true);
    expect(transferWindowState(at, WINTER)).toEqual({
      active: true,
      grace: true,
      open: [],
      closesAt: null,
      daysLeft: null,
      closedAt: "2027-02-01T23:00:00.000Z",
      graceEndsAt: "2027-02-02T23:00:00.000Z",
      closedComps: ["EPL"],
      upcoming: [],
    });
  });

  it("유예 끝 — closesAt + 24h 1ms 전까지 모드, 그 순간부터 모드 아님", () => {
    expect(isTransferWindowActive("2027-02-02T22:59:59.999Z", WINTER)).toBe(
      true,
    );
    expect(isTransferWindowActive("2027-02-02T23:00:00.000Z", WINTER)).toBe(
      false,
    );
    expect(
      transferWindowState("2027-02-02T23:00:00.000Z", WINTER),
    ).toMatchObject({
      active: false,
      grace: false,
      closedAt: null,
      graceEndsAt: null,
      closedComps: [],
    });
  });

  it("리그별 마감이 엇갈리면 유예는 모드 종료 시각(EPL 23:00Z) 기준 — 먼저 닫힌 리그 마감 + 24h가 지나도 유지", () => {
    // 리그 1 18:59Z·분데스리가·세리에 A 19:00Z 마감 + 24h를 지났지만, EPL 마감(23:00Z) + 24h 전
    const state = transferWindowState("2027-02-02T19:30:00.000Z", WINTER);
    expect(state).toMatchObject({
      active: true,
      grace: true,
      closedAt: "2027-02-01T23:00:00.000Z",
      graceEndsAt: "2027-02-02T23:00:00.000Z",
      closedComps: ["EPL"],
    });
    // 다른 리그가 열려 있는 동안 먼저 닫힌 리그는 유예가 아니라 열린 모드
    const mid = transferWindowState("2027-02-01T19:30:00.000Z", WINTER);
    expect(mid).toMatchObject({ active: true, grace: false, closedAt: null });
    expect(comps(mid.open)).toEqual(["LALIGA", "EPL"]);
  });

  it("마감 다음 날 아침 발행(02-03 07:10 KST = 02-02 22:10Z)이 유예 안 — 마감 뒤 공식 발표를 싣는 실행", () => {
    expect(isTransferWindowActive("2027-02-02T22:10:00.000Z", WINTER)).toBe(
      true,
    );
    expect(isTransferWindowActive("2027-02-03T22:10:00.000Z", WINTER)).toBe(
      false,
    ); // 02-04 아침은 모드 아님
  });

  it("같은 마감 시각에 닫힌 리그는 모두 closedComps(comp 순)", () => {
    const sameClose: TransferWindowInput[] = [
      { ...SUMMER_SERIEA },
      { ...SUMMER_SERIEA, comp: "BUNDESLIGA" },
    ];
    expect(
      transferWindowState("2027-09-01T20:00:00.000Z", sameClose).closedComps,
    ).toEqual(["BUNDESLIGA", "SERIEA"]);
  });

  it("유예 중에도 다가오는 창은 upcoming에 남는다", () => {
    const state = transferWindowState("2027-02-02T00:00:00.000Z", ALL);
    expect(state.grace).toBe(true);
    expect(comps(state.upcoming)).toEqual(["EPL", "SERIEA"]);
  });
});

describe("남은 일수 — KST 달력 날짜 차이(화면 'D-n')", () => {
  it("겨울 마감 주간: 아침 수집 시각(겨울 07:10 KST) 기준", () => {
    // 01-31 07:10 KST = 01-30 22:10Z
    const jan31 = transferWindowState("2027-01-30T22:10:00.000Z", WINTER);
    expect(jan31.daysLeft).toBe(2); // 모드 끝 EPL 02-01 23:00Z = 02-02 08:00 KST
    expect(jan31.open.find((w) => w.comp === "LIGUE1")!.daysLeft).toBe(2); // 02-01 18:59Z = 02-02 03:59 KST
    // 02-02 07:10 KST = 02-01 22:10Z — EPL·라리가만 남았고 둘 다 오늘(KST) 마감
    const feb2 = transferWindowState("2027-02-01T22:10:00.000Z", WINTER);
    expect(comps(feb2.open)).toEqual(["LALIGA", "EPL"]);
    expect(feb2.daysLeft).toBe(0);
    expect(feb2.open.map((w) => w.daysLeft)).toEqual([0, 0]);
  });

  it("모드 마감 = 가장 늦은 마감(가장 이른 마감이 아니다)", () => {
    const state = transferWindowState("2027-01-15T00:00:00.000Z", WINTER);
    expect(state.closesAt).toBe("2027-02-01T23:00:00.000Z");
    expect(state.open[0]!.comp).toBe("LIGUE1");
    expect(state.daysLeft).toBe(18); // 01-15 09:00 KST → 02-02 KST
  });
});

describe("유럽 서머타임 전환 앞뒤 — 판정은 UTC 순간 그대로", () => {
  // 가상의 창: 마드리드 현지 2026-10-25 02:30(서머타임 종료로 두 번 오는 시각 — 먼저 오는 CEST 쪽)에 마감
  const end = europeanSummerTimeTransitions(2026).end; // 2026-10-25T01:00Z
  const fold: TransferWindowInput = {
    comp: "LALIGA",
    season: 2026,
    kind: "summer",
    opensAt: "2026-10-01T00:00:00.000Z",
    closesAt: zonedToUtcIso("2026-10-25T02:30", "Europe/Madrid"),
  };
  it("현지 fold 시각을 UTC로 적은 마감 앞뒤로 정확히 닫힌다", () => {
    expect(fold.closesAt).toBe("2026-10-25T00:30:00.000Z");
    expect(isWindowOpenAt(fold, "2026-10-25T00:29:59.999Z")).toBe(true);
    expect(isWindowOpenAt(fold, "2026-10-25T00:30:00.000Z")).toBe(false);
    expect(isWindowOpenAt(fold, end)).toBe(false); // 전환 순간(01:00Z)엔 이미 닫힘
  });

  // 가상의 창: 런던 현지 2027-03-28 01:30(서머타임 시작으로 없는 시각 — 전환 전 GMT로 해석 → 01:30Z)에 개장
  const gap: TransferWindowInput = {
    comp: "EPL",
    season: 2026,
    kind: "winter",
    opensAt: zonedToUtcIso("2027-03-28T01:30", "Europe/London"),
    closesAt: "2027-04-30T00:00:00.000Z",
  };
  it("현지 gap 시각을 UTC로 적은 개장 앞뒤로 정확히 열린다(전환 순간 01:00Z는 아직 닫힘)", () => {
    expect(gap.opensAt).toBe("2027-03-28T01:30:00.000Z");
    const start = europeanSummerTimeTransitions(2027).start; // 2027-03-28T01:00Z
    expect(isWindowOpenAt(gap, start)).toBe(false);
    expect(isWindowOpenAt(gap, "2027-03-28T01:29:59.999Z")).toBe(false);
    expect(isWindowOpenAt(gap, "2027-03-28T01:30:00.000Z")).toBe(true);
  });

  it("KST는 서머타임이 없어 남은 일수가 전환 앞뒤로 튀지 않는다", () => {
    const before = transferWindowState("2026-10-25T00:00:00.000Z", [fold]);
    const justBefore = transferWindowState("2026-10-25T00:29:00.000Z", [fold]);
    expect(before.daysLeft).toBe(0); // 10-25 09:00 KST, 마감 10-25 09:30 KST
    expect(justBefore.daysLeft).toBe(0);
  });
});
