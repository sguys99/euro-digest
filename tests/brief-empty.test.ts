/**
 * M5-17 — 오늘의 5줄 빈 상태 판정(S4 가족 — src/lib/brief-empty.ts `briefEmptyState`, DECISIONS D3 #11 · #12, DESIGN §9.3 D3 "S4 가족",
 * PRD §15 D71 ④ · DR-07 · FR-71).
 *
 * 판정: 결과 지연 → 오류 상자 · 아카이브 → 경기 없음 · 홈 우선순위 비시즌 → A매치 휴식기 → 경기 없음. 휴식기 경기 = `nationalWindowOn(발행일)`
 * 기간의 경기(연기 제외, 킥오프 순), 지난 경기는 "끝남"(`past`)만 — 결과 필드 없음(결과 노출 0), `kickoffTbd`는 시각 없음 · 날짜로 지남 판정.
 * 설정은 합성 값(대회는 실제 설정 — 시즌 날짜만 쓴다)이라 configs/national-team.json이 바뀌어도 흔들리지 않는다.
 */
import { describe, expect, it } from "vitest";

import {
  briefEmptyState,
  briefRestMatch,
  type BriefEmptyInput,
} from "@/lib/brief-empty";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import {
  NationalTeamFileSchema,
  type NationalTeamFile,
} from "@/lib/schema/configs";
import { shiftDate } from "@/lib/time";

const competitions = loadCompetitionsConfig();
const lastEnd = competitions.reduce((a, b) =>
  b.endDate > a.endDate ? b : a,
).endDate;

type MatchInput = {
  id: string;
  kickoff: string;
  status?: "scheduled" | "finished" | "postponed";
  kickoffTbd?: boolean;
  home?: boolean;
  opponent?: string;
  result?: { kor: number; opp: number } | null;
};

function team(matches: MatchInput[]): NationalTeamFile {
  return NationalTeamFileSchema.parse({
    matches: matches.map((m) => ({
      id: m.id,
      kickoff: m.kickoff,
      kickoffTbd: m.kickoffTbd ?? false,
      opponent: m.opponent ?? "상대",
      home: m.home ?? false,
      competition: "친선경기",
      status: m.status ?? "scheduled",
      result: m.result ?? (m.status === "finished" ? { kor: 2, opp: 1 } : null),
    })),
  });
}

/** 11월 소집 — 11-13 23:30 KST(원정) · 11-17 23:00 KST(홈) → 기간 11-10 ~ 11-20 */
const NOVEMBER = team([
  {
    id: "2026-11-13-saudi-arabia",
    kickoff: "2026-11-13T14:30:00.000Z",
    opponent: "사우디아라비아",
  },
  {
    id: "2026-11-17-qatar",
    kickoff: "2026-11-17T14:00:00.000Z",
    opponent: "카타르",
    home: true,
  },
]);

const NOW = Date.parse("2026-11-11T22:00:00.000Z"); // 11-12 07:00 KST — 발행 빌드 시각

function input(over: Partial<BriefEmptyInput> = {}): BriefEmptyInput {
  return {
    date: "2026-11-12",
    emptyReason: "no-matches",
    scope: "today",
    competitions,
    nationalTeam: NOVEMBER,
    nowMs: NOW,
    ...over,
  };
}

describe("우선순위 — 결과 지연 → (아카이브) → 비시즌 → A매치 휴식기 → 경기 없음", () => {
  it("시즌 중 A매치 기간 + no-matches → 휴식기: 기간 11-10 ~ 11-20 · 경기 2건 킥오프 순", () => {
    const state = briefEmptyState(input());
    expect(state.kind).toBe("international");
    if (state.kind !== "international") return;
    expect(state.window).toEqual({ from: "2026-11-10", to: "2026-11-20" });
    expect(state.matches.map((m) => m.id)).toEqual([
      "2026-11-13-saudi-arabia",
      "2026-11-17-qatar",
    ]);
  });

  it("기간 첫날 · 끝날 포함, 그 밖은 경기 없음", () => {
    expect(briefEmptyState(input({ date: "2026-11-10" })).kind).toBe(
      "international",
    );
    expect(briefEmptyState(input({ date: "2026-11-20" })).kind).toBe(
      "international",
    );
    expect(briefEmptyState(input({ date: "2026-11-09" })).kind).toBe("rest");
    expect(briefEmptyState(input({ date: "2026-11-21" })).kind).toBe("rest");
  });

  it("비시즌이 A매치 기간보다 먼저 — 모든 대회가 끝난 뒤의 A매치 기간은 비시즌", () => {
    const date = shiftDate(lastEnd, 3);
    const summer = team([
      { id: "summer", kickoff: `${shiftDate(lastEnd, 4)}T11:00:00.000Z` },
    ]);
    const state = briefEmptyState(input({ date, nationalTeam: summer }));
    expect(state.kind).toBe("off-season");
    if (state.kind === "off-season") {
      expect(state.feature.phase).toBe("ended");
      expect(state.feature.date).toBe(lastEnd);
    }
  });

  it("결과 지연(results-pending — D60)은 A매치 기간 · 비시즌이어도 늘 오류 상자", () => {
    expect(
      briefEmptyState(input({ emptyReason: "results-pending" })).kind,
    ).toBe("pending");
    expect(
      briefEmptyState(
        input({
          emptyReason: "results-pending",
          date: shiftDate(lastEnd, 3),
        }),
      ).kind,
    ).toBe("pending");
    expect(
      briefEmptyState(input({ emptyReason: "results-pending", scope: "issue" }))
        .kind,
    ).toBe("pending");
  });

  it("날짜 아카이브(이날의 5줄 — scope issue)는 A매치 기간 · 비시즌이어도 경기 없음(지난 호를 지금 설정으로 다시 쓰지 않는다)", () => {
    expect(briefEmptyState(input({ scope: "issue" })).kind).toBe("rest");
    expect(
      briefEmptyState(input({ scope: "issue", date: shiftDate(lastEnd, 3) }))
        .kind,
    ).toBe("rest");
  });

  it("national-team.json이 없으면 A매치 기간이어도 경기 없음(근거 없는 안내 금지)", () => {
    expect(briefEmptyState(input({ nationalTeam: null })).kind).toBe("rest");
  });
});

describe("휴식기 경기 — 연기 제외 · 킥오프 순", () => {
  it("연기(postponed) 경기는 기간을 만들지 않고 목록에도 없다", () => {
    const withPostponed = team([
      ...NOVEMBER.matches.map((m) => ({ ...m, result: m.result })),
      {
        id: "2026-11-15-postponed",
        kickoff: "2026-11-15T11:00:00.000Z",
        status: "postponed",
      },
    ]);
    const state = briefEmptyState(input({ nationalTeam: withPostponed }));
    expect(state.kind).toBe("international");
    if (state.kind === "international") {
      expect(state.matches.map((m) => m.id)).not.toContain(
        "2026-11-15-postponed",
      );
      expect(state.matches).toHaveLength(2);
    }
  });

  it("연기 경기만 있는 날은 A매치 기간이 아니다 → 경기 없음", () => {
    const onlyPostponed = team([
      {
        id: "2026-11-13-postponed",
        kickoff: "2026-11-13T14:30:00.000Z",
        status: "postponed",
      },
    ]);
    expect(briefEmptyState(input({ nationalTeam: onlyPostponed })).kind).toBe(
      "rest",
    );
  });

  it("설정 순서가 거꾸로여도 킥오프 순 — 같은 시각이면 설정 순", () => {
    const reversed = team([
      { id: "late", kickoff: "2026-11-17T14:00:00.000Z" },
      { id: "same-b", kickoff: "2026-11-13T14:30:00.000Z" },
      { id: "same-a", kickoff: "2026-11-13T14:30:00.000Z" },
    ]);
    const state = briefEmptyState(input({ nationalTeam: reversed }));
    expect(
      state.kind === "international" ? state.matches.map((m) => m.id) : [],
    ).toEqual(["same-b", "same-a", "late"]);
  });
});

describe("경기 표기 — 끝남 · 시각 미정 · 결과 노출 0", () => {
  it("표기: 날짜 MM.DD · 화면 밖 'M월 D일' · 요일 · HH:MM(KST) · 상대 · 홈/원정 · 대회", () => {
    const state = briefEmptyState(input());
    if (state.kind !== "international") throw new Error("휴식기 아님");
    expect(state.matches[0]).toEqual({
      id: "2026-11-13-saudi-arabia",
      kickoff: "2026-11-13T14:30:00.000Z",
      date: "11.13",
      dateLabel: "11월 13일",
      weekday: "금",
      time: "23:30",
      opponent: "사우디아라비아",
      home: false,
      competition: "친선경기",
      past: false,
    });
    expect(state.matches[1]).toMatchObject({
      date: "11.17",
      weekday: "화",
      time: "23:00",
      home: true,
    });
  });

  it("킥오프가 지난 경기만 past(끝남) — 기준은 빌드 시각, 킥오프 그 순간부터", () => {
    const kickoff = Date.parse("2026-11-13T14:30:00.000Z");
    const at = (nowMs: number) => {
      const state = briefEmptyState(input({ date: "2026-11-15", nowMs }));
      return state.kind === "international"
        ? state.matches.map((m) => m.past)
        : [];
    };
    expect(at(kickoff - 1)).toEqual([false, false]);
    expect(at(kickoff)).toEqual([true, false]);
    expect(at(Date.parse("2026-11-17T14:00:00.000Z"))).toEqual([true, true]);
  });

  it("설정이 finished면(결과가 적혀 있어도) past만 — 화면 모델에 스코어 · 결과 필드가 없다", () => {
    const finished = team([
      {
        id: "2026-11-13-saudi-arabia",
        kickoff: "2026-11-13T14:30:00.000Z",
        status: "finished",
        result: { kor: 9, opp: 9 },
      },
    ]);
    const state = briefEmptyState(
      input({ nationalTeam: finished, nowMs: NOW }),
    );
    if (state.kind !== "international") throw new Error("휴식기 아님");
    const [m] = state.matches;
    expect(m?.past).toBe(true);
    expect(Object.keys(m ?? {}).sort()).toEqual(
      [
        "competition",
        "date",
        "dateLabel",
        "home",
        "id",
        "kickoff",
        "opponent",
        "past",
        "time",
        "weekday",
      ].sort(),
    );
    expect(JSON.stringify(state)).not.toMatch(/"(?:score|result|kor|opp)"/);
  });

  it("kickoffTbd: 시각 없음(null) · 지남은 KST 날짜로만 — 같은 날은 아직, 다음 날부터 끝남", () => {
    const tbd = {
      id: "tbd",
      kickoff: "2026-11-13T00:00:00.000Z", // 날짜만 의미(KST 11-13 09:00 — 시각은 자리값)
      kickoffTbd: true,
      opponent: "미정",
      home: true,
      competition: "친선경기",
      status: "scheduled" as const,
      result: null,
    };
    expect(
      briefRestMatch(tbd, Date.parse("2026-11-13T10:00:00.000Z")),
    ).toMatchObject({
      time: null,
      date: "11.13",
      weekday: "금",
      past: false,
    });
    expect(
      briefRestMatch(tbd, Date.parse("2026-11-13T15:00:00.000Z")).past,
    ).toBe(true); // 11-14 00:00 KST
  });
});
