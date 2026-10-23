/**
 * 날짜 아카이브 화면 모델 — src/lib/news/archive.ts (PRD FR-33, plan M1-34)
 *
 * 이전·다음 호(결호 건너뜀·첫 호·최신 호 경계) · 달력(날 상태 4종·주 행·월말·달 이동 범위·해 넘김) · 정적 달 이동 · 표시 문자열.
 * 실데이터와 같은 발행일 목록(2026-10-12·13·14·17·18·20·21·22 — 결호 15·16·19)을 기준 사례로 쓴다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  archiveCalendar,
  archiveDateLabel,
  archiveNeighbors,
  archiveTitle,
  buildArchiveView,
  archiveHeading,
  beforeFirstLabel,
  calendarCellLabel,
  counterfoilDate,
  calendarMonth,
  daysInMonth,
  issueLinkLabel,
  monthBeforeFounding,
  monthJumpTarget,
  monthLabel,
  monthRange,
  shiftMonth,
  sortIssueDates,
  spokenDate,
  weekdayName,
  weekdayOf,
  type CalendarDay,
} from "@/lib/news/archive";

/** 실데이터 발행일(2026-10-22 기준) — 결호 10-15·16·19 */
const DATES = [
  "2026-10-12",
  "2026-10-13",
  "2026-10-14",
  "2026-10-17",
  "2026-10-18",
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
];

describe("sortIssueDates", () => {
  it("실제 달력 날짜만, 중복 없이 오름차순", () => {
    expect(
      sortIssueDates([
        "2026-10-21",
        "2026-10-12",
        "2026-10-21",
        "2026-02-30",
        "2026-13-01",
        "2026-1-5",
        "../2026-10-10",
        "2026-10-20",
      ]),
    ).toEqual(["2026-10-12", "2026-10-20", "2026-10-21"]);
  });
});

describe("archiveNeighbors — 이전·다음 호(발행된 호만)", () => {
  it("결호를 건너뛴다 — 10-14(제 3호) 다음 호는 10-17(제 6호), 10-20 이전 호는 10-18", () => {
    const at14 = archiveNeighbors(DATES, "2026-10-14")!;
    expect(at14.prev).toEqual({ date: "2026-10-13", no: 2 });
    expect(at14.next).toEqual({ date: "2026-10-17", no: 6 });
    const at17 = archiveNeighbors(DATES, "2026-10-17")!;
    expect(at17.prev).toEqual({ date: "2026-10-14", no: 3 });
    expect(archiveNeighbors(DATES, "2026-10-20")!.prev).toEqual({
      date: "2026-10-18",
      no: 7,
    });
  });

  it("첫 호는 이전 호가 없고, 최신 호는 다음 호가 없다", () => {
    const first = archiveNeighbors(DATES, "2026-10-12")!;
    expect(first.prev).toBeNull();
    expect(first.next).toEqual({ date: "2026-10-13", no: 2 });
    expect(first.isLatest).toBe(false);
    expect(first.position).toBe(1);
    const latest = archiveNeighbors(DATES, "2026-10-22")!;
    expect(latest.next).toBeNull();
    expect(latest.prev).toEqual({ date: "2026-10-21", no: 10 });
    expect(latest.isLatest).toBe(true);
    expect(latest.position).toBe(8);
    expect(latest.total).toBe(8);
    expect(latest.first).toEqual({ date: "2026-10-12", no: 1 });
    expect(latest.latest).toEqual({ date: "2026-10-22", no: 11 });
  });

  it("position은 발행된 호 순번(결호를 세지 않는다) — 호수와 다르다", () => {
    const at17 = archiveNeighbors(DATES, "2026-10-17")!;
    expect(at17.position).toBe(4);
    expect(at17.current.no).toBe(6);
  });

  it("호가 하나뿐이면 앞뒤 모두 null", () => {
    const only = archiveNeighbors(["2026-10-12"], "2026-10-12")!;
    expect([only.prev, only.next, only.isLatest]).toEqual([null, null, true]);
  });

  it("입력 순서·중복과 무관(정렬해 쓴다)", () => {
    const shuffled = [...DATES].reverse().concat(["2026-10-14"]);
    expect(archiveNeighbors(shuffled, "2026-10-14")).toEqual(
      archiveNeighbors(DATES, "2026-10-14"),
    );
  });

  it("발행된 호가 아닌 날짜(결호·범위 밖·형식 오류)는 null", () => {
    for (const date of ["2026-10-15", "2026-10-23", "2026-10-11", "x"])
      expect(archiveNeighbors(DATES, date)).toBeNull();
    expect(archiveNeighbors([], "2026-10-12")).toBeNull();
  });

  it("창간일 전 날짜(테스트 픽스처)는 호수가 null", () => {
    const n = archiveNeighbors(["2026-10-10", "2026-10-12"], "2026-10-12")!;
    expect(n.prev).toEqual({ date: "2026-10-10", no: null });
  });
});

describe("달력 기초 계산", () => {
  it("daysInMonth — 30·31일 달, 2월 평년 28 · 윤년 29", () => {
    expect(daysInMonth("2026-10")).toBe(31);
    expect(daysInMonth("2026-11")).toBe(30);
    expect(daysInMonth("2027-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
  });

  it("weekdayOf — 0 = 일요일(2026-10-12 월 · 2026-10-18 일 · 2026-11-01 일)", () => {
    expect(weekdayOf("2026-10-12")).toBe(1);
    expect(weekdayOf("2026-10-18")).toBe(0);
    expect(weekdayOf("2026-11-01")).toBe(0);
    expect(weekdayOf("2026-10-31")).toBe(6);
  });

  it("monthRange — 양 끝 포함, 해 넘김", () => {
    expect(monthRange("2026-10", "2026-10")).toEqual(["2026-10"]);
    expect(monthRange("2026-11", "2027-02")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(monthRange("2026-11", "2026-10")).toEqual([]);
  });
});

/** 날 하나의 상태 */
function stateOf(days: CalendarDay[], date: string) {
  return days.find((d) => d.date === date)?.state;
}

describe("archiveCalendar — 달력 모델", () => {
  const cal = archiveCalendar(DATES, "2026-10-17")!;
  const oct = calendarMonth(cal, "2026-10")!;

  it("첫 호의 달 ~ 최신 호의 달 — 실데이터는 2026-10 한 달, 앞뒤 달 이동 없음", () => {
    expect(cal.months.map((m) => m.month)).toEqual(["2026-10"]);
    expect(cal.currentMonth).toBe("2026-10");
    expect([oct.prevMonth, oct.nextMonth]).toEqual([null, null]);
    expect([oct.year, oct.monthNumber]).toEqual([2026, 10]);
  });

  it("날 상태 4종 — 발행(링크) · 결호 · 첫 호 전 · 최신 호 뒤", () => {
    expect(oct.days).toHaveLength(31);
    expect(
      oct.days.filter((d) => d.state === "published").map((d) => d.date),
    ).toEqual(DATES);
    expect(
      oct.days.filter((d) => d.state === "missing").map((d) => d.date),
    ).toEqual(["2026-10-15", "2026-10-16", "2026-10-19"]);
    expect(stateOf(oct.days, "2026-10-01")).toBe("before");
    expect(stateOf(oct.days, "2026-10-11")).toBe("before");
    expect(stateOf(oct.days, "2026-10-23")).toBe("after");
    expect(stateOf(oct.days, "2026-10-31")).toBe("after");
    expect(oct.issues).toEqual(DATES);
  });

  it("보고 있는 호 하나만 current, 호수는 날짜 기준(결호에도 번호 — D29), 창간일 전은 null", () => {
    expect(oct.days.filter((d) => d.current).map((d) => d.date)).toEqual([
      "2026-10-17",
    ]);
    expect(oct.days.find((d) => d.date === "2026-10-15")?.no).toBe(4);
    expect(oct.days.find((d) => d.date === "2026-10-11")?.no).toBeNull();
    expect(oct.days.find((d) => d.date === "2026-10-22")?.no).toBe(11);
  });

  it("주 행 — 일요일 시작 7칸, 1일(목) 앞 빈칸 4 · 31일(토)로 끝 — 5주", () => {
    expect(cal.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(oct.weeks).toHaveLength(5);
    for (const week of oct.weeks) expect(week).toHaveLength(7);
    expect(oct.weeks[0]!.slice(0, 4)).toEqual([null, null, null, null]);
    expect(oct.weeks[0]![4]?.date).toBe("2026-10-01");
    expect(oct.weeks[4]![6]?.date).toBe("2026-10-31");
    // 모든 날이 자기 요일 열에 있다
    for (const week of oct.weeks)
      week.forEach((day, col) => {
        if (day) expect(day.weekday).toBe(cal.weekdays[col]);
      });
  });

  it("월요일 시작(weekStartsOn: 1) — 열 순서 월~일, 1일(목) 앞 빈칸 3", () => {
    const mon = archiveCalendar(DATES, "2026-10-17", { weekStartsOn: 1 })!;
    expect(mon.weekdays).toEqual([1, 2, 3, 4, 5, 6, 0]);
    const m = mon.months[0]!;
    expect(m.weeks[0]!.slice(0, 3)).toEqual([null, null, null]);
    expect(m.weeks[0]![3]?.date).toBe("2026-10-01");
    for (const week of m.weeks)
      week.forEach((day, col) => {
        if (day) expect(day.weekday).toBe(mon.weekdays[col]);
      });
  });

  it("월말 칸 채움 — 2026-11(30일, 1일 일요일)은 5주 · 마지막 주 29·30일 뒤 빈칸 5, 2027-02(28일, 1일 월요일)는 4주 + 1", () => {
    const c = archiveCalendar(["2026-11-30", "2027-02-01"], "2026-11-30")!;
    const nov = calendarMonth(c, "2026-11")!;
    expect(nov.days).toHaveLength(30);
    expect(nov.weeks[0]![0]?.date).toBe("2026-11-01");
    expect(nov.weeks.at(-1)!.filter((d) => d === null)).toHaveLength(5);
    expect(nov.weeks.at(-1)![0]?.date).toBe("2026-11-29");
    expect(nov.weeks.at(-1)![1]?.date).toBe("2026-11-30");
    const feb = calendarMonth(c, "2027-02")!;
    expect(feb.days).toHaveLength(28);
    expect(feb.weeks).toHaveLength(5);
    expect(feb.weeks[0]![1]?.date).toBe("2027-02-01");
  });

  it("달 경계·해 넘김 — 이동 범위는 첫 호 달 ~ 최신 호 달, 발행 없는 달(12·1월)도 이어서 둔다", () => {
    const c = archiveCalendar(
      ["2026-10-31", "2026-11-01", "2027-02-03"],
      "2026-11-01",
    )!;
    expect(c.months.map((m) => m.month)).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(c.currentMonth).toBe("2026-11");
    const [oct, nov, dec, jan, feb] = c.months;
    expect([oct!.prevMonth, oct!.nextMonth]).toEqual([null, "2026-11"]);
    expect([dec!.prevMonth, dec!.nextMonth]).toEqual(["2026-11", "2027-01"]);
    expect([feb!.prevMonth, feb!.nextMonth]).toEqual(["2027-01", null]);
    expect(dec!.issues).toEqual([]);
    expect(dec!.days.every((d) => d.state === "missing")).toBe(true);
    expect(jan!.days.every((d) => d.state === "missing")).toBe(true);
    expect(stateOf(oct!.days, "2026-10-30")).toBe("before");
    expect(stateOf(oct!.days, "2026-10-31")).toBe("published");
    expect(stateOf(nov!.days, "2026-11-02")).toBe("missing");
    expect(stateOf(feb!.days, "2027-02-04")).toBe("after");
    expect(nov!.days.find((d) => d.current)?.date).toBe("2026-11-01");
  });

  it("보고 있는 날짜가 발행된 호가 아니면 null", () => {
    expect(archiveCalendar(DATES, "2026-10-15")).toBeNull();
    expect(archiveCalendar([], "2026-10-12")).toBeNull();
  });
});

describe("monthJumpTarget — 정적 달 이동(발행된 호가 있는 가장 가까운 달의 첫 호 — 2026-10-23 오케스트레이터 결정)", () => {
  const c = archiveCalendar(
    ["2026-10-12", "2026-10-28", "2026-11-02", "2026-11-20", "2027-02-03"],
    "2026-11-02",
  )!;

  it("앞 달·뒤 달 모두 그 달의 첫 호", () => {
    expect(monthJumpTarget(c, "2026-11", -1)).toEqual({
      month: "2026-10",
      date: "2026-10-12",
    });
    expect(monthJumpTarget(c, "2026-10", 1)).toEqual({
      month: "2026-11",
      date: "2026-11-02",
    });
  });

  it("발행 없는 달(12·1월)은 건너뛴다", () => {
    expect(monthJumpTarget(c, "2026-11", 1)).toEqual({
      month: "2027-02",
      date: "2027-02-03",
    });
    expect(monthJumpTarget(c, "2027-02", -1)).toEqual({
      month: "2026-11",
      date: "2026-11-02",
    });
  });

  it("범위 끝·범위 밖 달은 null", () => {
    expect(monthJumpTarget(c, "2026-10", -1)).toBeNull();
    expect(monthJumpTarget(c, "2027-02", 1)).toBeNull();
    expect(monthJumpTarget(c, "2026-09", 1)).toBeNull();
    const one = archiveCalendar(DATES, "2026-10-12")!;
    expect(monthJumpTarget(one, "2026-10", -1)).toBeNull();
    expect(monthJumpTarget(one, "2026-10", 1)).toBeNull();
  });
});

describe("buildArchiveView", () => {
  it("앞뒤 호 + 달력을 합친다 — 발행된 호가 아니면 null", () => {
    const view = buildArchiveView(DATES, "2026-10-18")!;
    expect(view.prev?.date).toBe("2026-10-17");
    expect(view.next?.date).toBe("2026-10-20");
    expect(view.calendar.currentMonth).toBe("2026-10");
    expect(buildArchiveView(DATES, "2026-10-19")).toBeNull();
  });
});

describe("표시 문자열", () => {
  it("archiveDateLabel — 같은 해면 연도 생략, 기준이 없거나 해가 다르면 연도", () => {
    expect(archiveDateLabel("2026-10-21", "2026-10-22")).toBe("10월 21일 (수)");
    expect(archiveDateLabel("2026-10-21")).toBe("2026년 10월 21일 (수)");
    expect(archiveDateLabel("2026-12-31", "2027-01-01")).toBe(
      "2026년 12월 31일 (목)",
    );
  });

  it("issueLinkLabel — '제 N호 · 날짜', 호수가 없으면 날짜만", () => {
    expect(issueLinkLabel({ date: "2026-10-21", no: 10 }, "2026-10-22")).toBe(
      "제 10호 · 10월 21일 (수)",
    );
    expect(issueLinkLabel({ date: "2026-10-10", no: null }, "2026-10-12")).toBe(
      "10월 10일 (토)",
    );
  });

  it("calendarCellLabel — 칸의 화면 밖 글자(발행 · 최신 호 · 결호 · 창간 전 · 발행 전)", () => {
    const oct = archiveCalendar(
      ["2026-10-10", "2026-10-12", "2026-10-21"],
      "2026-10-12",
    )!.months[0]!;
    const day = (d: number) => oct.days[d - 1]!;
    const latest = "2026-10-21";
    expect(calendarCellLabel(day(12), latest)).toBe("제 1호, 10월 12일 월요일");
    expect(calendarCellLabel(day(21), latest)).toBe(
      "제 10호, 10월 21일 수요일, 최신 호",
    );
    expect(calendarCellLabel(day(10), latest)).toBe("10월 10일 토요일");
    expect(calendarCellLabel(day(15), latest)).toBe("10월 15일, 결호");
    expect(calendarCellLabel(day(1), latest)).toBe("10월 1일, 창간 전");
    expect(calendarCellLabel(day(31), latest)).toBe("10월 31일, 발행 전");
  });

  it("spokenDate·counterfoilDate — 꼬리표 '10.18 (일)'(두 자리 월·일) · 읽기 '10월 18일 일요일'", () => {
    expect(counterfoilDate("2026-10-18")).toBe("10.18 (일)");
    expect(counterfoilDate("2026-11-02")).toBe("11.02 (월)");
    expect(spokenDate("2026-10-18")).toBe("10월 18일 일요일");
    expect(spokenDate("2026-11-02")).toBe("11월 2일 월요일");
  });

  it("beforeFirstLabel·monthBeforeFounding — 창간일(2026-10-12) 전만 '창간 전', 그 뒤 첫 호 전 칸은 '발행 기록 없음'", () => {
    expect(beforeFirstLabel("2026-10-11")).toBe("창간 전");
    expect(beforeFirstLabel("2026-10-12")).toBe("발행 기록 없음");
    expect(beforeFirstLabel("2026-11-01")).toBe("발행 기록 없음");
    expect(monthBeforeFounding("2026-09")).toBe(true);
    expect(monthBeforeFounding("2026-10")).toBe(false);
    const nov = archiveCalendar(["2026-11-03"], "2026-11-03")!.months[0]!;
    expect(calendarCellLabel(nov.days[0]!, "2026-11-03")).toBe(
      "11월 1일, 발행 기록 없음",
    );
  });

  it("shiftMonth — 해 넘김", () => {
    expect(shiftMonth("2026-10", -1)).toBe("2026-09");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-10", 15)).toBe("2028-01");
  });

  it("archiveHeading — 화면 밖 h1 '제 9호 · 2026년 10월 20일 (화) 지면'", () => {
    expect(archiveHeading("2026-10-20")).toBe(
      "제 9호 · 2026년 10월 20일 (화) 지면",
    );
    expect(archiveHeading("2026-10-10")).toBe("2026년 10월 10일 (토) 지면");
  });

  it("monthLabel·weekdayName·archiveTitle", () => {
    expect(monthLabel("2026-10")).toBe("2026년 10월");
    expect(monthLabel("2027-01")).toBe("2027년 1월");
    expect(weekdayName(0)).toBe("일요일");
    expect(weekdayName(3)).toBe("수요일");
    expect(archiveTitle("2026-10-21")).toBe(
      "2026년 10월 21일 (수) 뉴스 · 제 10호",
    );
    expect(archiveTitle("2026-10-10")).toBe("2026년 10월 10일 (토) 뉴스");
  });
});

describe("순수 모듈 — fs·zod·DOM 없음(시안이 달 넘김 섬을 고르면 섬이 import한다)", () => {
  it("import가 time·issue뿐이고 issue.ts는 스키마를 타입으로만 가져온다", () => {
    const source = readFileSync(
      path.resolve("src/lib/news/archive.ts"),
      "utf8",
    );
    const imports = [...source.matchAll(/^import .* from "(.+)";$/gm)].map(
      (m) => m[1],
    );
    expect(imports.sort()).toEqual(["@/lib/issue", "@/lib/time"]);
    const issue = readFileSync(path.resolve("src/lib/issue.ts"), "utf8");
    for (const line of issue.match(/^import .*$/gm) ?? [])
      if (line.includes("@/lib/schema")) expect(line).toMatch(/^import type /);
  });
});
