// scripts/lib/news-retention.ts — 일별 뉴스 → 월별 병합 계획 (M5-10, PRD FR-158·§8.4, 2026-11-03 사용자 결정 A안·T1) — 순수 함수
import { describe, expect, it } from "vitest";

import { listNewsDates } from "@/lib/data/news";
import {
  NewsMonthFileSchema,
  type NewsCard,
  type NewsFile,
} from "@/lib/schema";

import {
  isMonthMergeDue,
  lastDateOfNewsMonth,
  mergeMonthFile,
  monthMergeDate,
  NEWS_DAILY_RETENTION_DAYS,
  planMonthMerges,
  replaceMonthIssues,
} from "../scripts/lib/news-retention";

function card(i: number): NewsCard {
  return {
    id: `c_${i.toString(16).padStart(10, "0")}`,
    t: `title ${i}`,
    s: [],
    cat: "other",
    comp: [],
    teams: [],
    players: [],
    imp: 3,
    kr: false,
    spoiler: false,
    src: [
      {
        n: "BBC Sport",
        u: `https://www.bbc.co.uk/sport/football/articles/${i}`,
        at: "2026-10-11T18:00:00.000Z",
        tier: 1,
      },
    ],
    lang: "en",
    ai: false,
    created: "2026-10-11T21:30:00.000Z",
  };
}

function issue(date: string, cards: NewsCard[] = [card(1)]): NewsFile {
  return {
    date,
    generatedAt: "2026-10-11T21:31:00.000Z",
    runId: `prod-collect-${date}`,
    cards,
  };
}

describe("병합 날짜 — 그 달 말일 + 90일(T1)", () => {
  it("보존 일수는 90일(PRD §8.4)", () => {
    expect(NEWS_DAILY_RETENTION_DAYS).toBe(90);
  });

  it("말일: 30·31일 달, 2월(평년·윤년), 12월", () => {
    expect(lastDateOfNewsMonth("2026-10")).toBe("2026-10-31");
    expect(lastDateOfNewsMonth("2026-11")).toBe("2026-11-30");
    expect(lastDateOfNewsMonth("2027-02")).toBe("2027-02-28");
    expect(lastDateOfNewsMonth("2028-02")).toBe("2028-02-29");
    expect(lastDateOfNewsMonth("2026-12")).toBe("2026-12-31");
    expect(() => lastDateOfNewsMonth("2026-13")).toThrow(RangeError);
  });

  it("창간 달 2026-10의 첫 병합일은 2027-01-29, 2026-11은 2027-02-28", () => {
    expect(monthMergeDate("2026-10")).toBe("2027-01-29");
    expect(monthMergeDate("2026-11")).toBe("2027-02-28");
    expect(monthMergeDate("2026-12")).toBe("2027-03-31");
  });

  it("병합일 당일부터(그날 포함) 합칠 때다", () => {
    expect(isMonthMergeDue("2026-10", "2027-01-28")).toBe(false);
    expect(isMonthMergeDue("2026-10", "2027-01-29")).toBe(true);
    expect(isMonthMergeDue("2026-10", "2027-06-01")).toBe(true);
  });

  it("저장소 실데이터: 첫 호(2026-10-12)의 달이 처음 합쳐지는 날은 2027-01-29, 오늘(2026-11-03)은 대상 0", () => {
    const dates = listNewsDates();
    expect(dates[0]).toBe("2026-10-12");
    expect(monthMergeDate(dates[0]!.slice(0, 7))).toBe("2027-01-29");
    expect(planMonthMerges(dates, "2026-11-03")).toEqual([]);
    expect(planMonthMerges(dates, "2027-01-28")).toEqual([]);
    const first = planMonthMerges(dates, "2027-01-29");
    expect(first.map((t) => t.month)).toEqual(["2026-10"]);
    expect(first[0]!.dates).toEqual(dates.filter((d) => d < "2026-11-01"));
  });
});

describe("planMonthMerges", () => {
  const dates = ["2026-11-01", "2026-10-31", "2026-10-12", "2026-12-01"];

  it("때가 된 달만, 달·날짜 오름차순", () => {
    expect(planMonthMerges(dates, "2027-02-28")).toEqual([
      { month: "2026-10", dates: ["2026-10-12", "2026-10-31"] },
      { month: "2026-11", dates: ["2026-11-01"] },
    ]);
    expect(planMonthMerges(dates, "2027-02-27")).toEqual([
      { month: "2026-10", dates: ["2026-10-12", "2026-10-31"] },
    ]);
    expect(planMonthMerges([], "2030-01-01")).toEqual([]);
  });
});

describe("mergeMonthFile", () => {
  const AT = "2027-01-28T21:31:00.000Z";

  it("새 월별 파일 — 호는 일별 값 그대로(deep-equal), 날짜 오름차순, 스키마 통과", () => {
    const a = issue("2026-10-31", [card(2), card(3)]);
    const b = issue("2026-10-12");
    const result = mergeMonthFile({
      month: "2026-10",
      existing: null,
      daily: [a, b],
      updatedAt: AT,
    });
    if (!result.ok) throw new Error("충돌을 기대하지 않음");
    expect(result.added).toEqual(["2026-10-12", "2026-10-31"]);
    expect(result.file).toEqual({
      month: "2026-10",
      updatedAt: AT,
      issues: [b, a],
    });
    expect(NewsMonthFileSchema.safeParse(result.file).success).toBe(true);
  });

  it("같은 카드 ID가 다른 날짜 호에 있어도 합친다(호 안에서만 유일 — M1-16)", () => {
    const result = mergeMonthFile({
      month: "2026-10",
      existing: null,
      daily: [issue("2026-10-12"), issue("2026-10-13")],
      updatedAt: AT,
    });
    expect(result.ok).toBe(true);
  });

  it("기존 월별 파일에 늦게 남은 일별 호를 더한다", () => {
    const existing = NewsMonthFileSchema.parse({
      month: "2026-10",
      updatedAt: "2027-01-28T00:00:00.000Z",
      issues: [issue("2026-10-12"), issue("2026-10-31")],
    });
    const result = mergeMonthFile({
      month: "2026-10",
      existing,
      daily: [issue("2026-10-20")],
      updatedAt: AT,
    });
    if (!result.ok) throw new Error("충돌을 기대하지 않음");
    expect(result.file.issues.map((i) => i.date)).toEqual([
      "2026-10-12",
      "2026-10-20",
      "2026-10-31",
    ]);
    expect(result.added).toEqual(["2026-10-20"]);
  });

  it("같은 날짜가 양쪽에 있으면 충돌(파일을 만들지 않음)", () => {
    const existing = NewsMonthFileSchema.parse({
      month: "2026-10",
      updatedAt: AT,
      issues: [issue("2026-10-12")],
    });
    expect(
      mergeMonthFile({
        month: "2026-10",
        existing,
        daily: [issue("2026-10-12"), issue("2026-10-13")],
        updatedAt: AT,
      }),
    ).toEqual({ ok: false, conflicts: ["2026-10-12"] });
  });

  it("다른 달 호를 넘기면 던진다(계획 오류)", () => {
    expect(() =>
      mergeMonthFile({
        month: "2026-10",
        existing: null,
        daily: [issue("2026-11-01")],
        updatedAt: AT,
      }),
    ).toThrow(RangeError);
  });
});

describe("replaceMonthIssues — 삭제 요청 원본 삭제(purge)용", () => {
  const file = NewsMonthFileSchema.parse({
    month: "2026-10",
    updatedAt: "2027-01-28T21:31:00.000Z",
    issues: [issue("2026-10-12", [card(1), card(2)]), issue("2026-10-13")],
  });

  it("바뀐 호만 갈아 끼우고 updatedAt 갱신", () => {
    const changed = issue("2026-10-12", [card(2)]);
    const next = replaceMonthIssues(
      file,
      new Map([["2026-10-12", changed]]),
      "2027-02-01T21:31:00.000Z",
    );
    expect(next.updatedAt).toBe("2027-02-01T21:31:00.000Z");
    expect(next.issues).toEqual([changed, file.issues[1]]);
  });

  it("없는 날짜면 던진다", () => {
    expect(() =>
      replaceMonthIssues(
        file,
        new Map([["2026-10-14", issue("2026-10-14")]]),
        "2027-02-01T21:31:00.000Z",
      ),
    ).toThrow(RangeError);
  });
});
