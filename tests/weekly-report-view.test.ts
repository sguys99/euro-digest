import { describe, expect, it } from "vitest";

import type { TeamView } from "@/lib/competition-view";
import type {
  KoreanPlayer,
  KoreanPlayersDataFile,
  WeeklyReport,
  WeeklyReportMatch,
} from "@/lib/schema/player";
import { WeeklyReportSchema } from "@/lib/schema/player";
import {
  dayLabel,
  evidenceMatch,
  excludedGroups,
  nextIsoWeek,
  plannedPublishDate,
  prevIsoWeek,
  scoringText,
  upcomingWeek,
  weekName,
  weekRangeView,
  weeklyIndexEntry,
  weeklyPoints,
  weeklyReportView,
  type WeeklyViewContext,
} from "@/lib/weekly-report-view";

// 주간 리포트 화면 모델(M3-12 — PRD FR-90~93 · D65). fixture는 실제 W43 파일과 같은 모양.

const player = (
  slug: string,
  nameKo: string,
  over: Partial<KoreanPlayer> = {},
): KoreanPlayer => ({
  slug,
  nameKo,
  nameEn: slug,
  team: "mainz",
  comp: "BUNDESLIGA",
  position: "MF",
  birthYear: 1992,
  apiFootballId: 1,
  active: true,
  ...over,
});

const PLAYERS: KoreanPlayer[] = [
  player("lee-jae-sung", "이재성"),
  player("hwang-hee-chan", "황희찬", { team: "schalke" }),
  player("kim-ji-soo", "김지수", { comp: "EPL", apiFootballId: null }),
  player("park-seung-soo", "박승수", { comp: "EPL" }),
  player("hong-hyun-seok", "홍현석", { comp: "OTHER", active: false }),
  player("late-starter", "나중선수"),
];

const DATA: KoreanPlayersDataFile = {
  season: 2026,
  since: "2026-10-19",
  generatedAt: "2026-11-01T00:00:00.000Z",
  players: [
    ...["lee-jae-sung", "hwang-hee-chan"].map((slug) => ({
      slug,
      team: "mainz",
      provider: "api-football" as const,
      since: "2026-10-19",
      season: [],
      recent: [],
      next: null,
      updatedAt: "2026-11-01T00:00:00.000Z",
    })),
    {
      slug: "park-seung-soo",
      team: "newcastle",
      provider: "api-football",
      since: null,
      season: [],
      recent: [],
      next: null,
      updatedAt: "2026-11-01T00:00:00.000Z",
    },
    {
      slug: "late-starter",
      team: "mainz",
      provider: "api-football",
      since: "2026-11-02",
      season: [],
      recent: [],
      next: null,
      updatedAt: "2026-11-01T00:00:00.000Z",
    },
  ],
};

const team = (slug: string): TeamView => ({
  slug,
  name: { mainz: "마인츠", "werder-bremen": "브레멘" }[slug] ?? slug,
  latin: false,
  short: slug.slice(0, 3).toUpperCase(),
  colors: null,
});

const CTX: WeeklyViewContext = {
  players: PLAYERS,
  data: DATA,
  competitions: [{ id: "BUNDESLIGA", short: "분데스", name: "분데스리가" }],
  team,
  teamNameKo: (en) => (en === "Werder Bremen" ? "브레멘" : null),
  competitionNameKo: (en) => (en === "DFB Pokal" ? "DFB 포칼" : null),
};

const match = (over: Partial<WeeklyReportMatch> = {}): WeeklyReportMatch => ({
  matchId: "fd-1",
  kickoff: "2026-10-24T13:30:00.000Z",
  comp: "BUNDESLIGA",
  opponent: { slug: "werder-bremen", name: "Werder Bremen" },
  home: true,
  result: { for: 2, against: 3 },
  status: "start",
  minutes: 75,
  goals: 1,
  assists: 0,
  goalMinutes: ["63"],
  ...over,
});

const REPORT: WeeklyReport = WeeklyReportSchema.parse({
  week: "2026-43",
  from: "2026-10-19T00:00:00.000Z",
  to: "2026-10-25T23:59:59.999Z",
  rows: [
    {
      player: "lee-jae-sung",
      apps: 1,
      minutes: 75,
      goals: 1,
      assists: 0,
      matches: [match()],
    },
    {
      player: "hwang-hee-chan",
      apps: 1,
      minutes: 90,
      goals: 0,
      assists: 0,
      matches: [
        match({
          matchId: "fd-2",
          opponent: { slug: null, name: "1. FC Köln" },
          home: false,
          result: { for: 0, against: 0 },
          minutes: 90,
          goals: 0,
          goalMinutes: undefined,
        }),
        match({
          matchId: "fd-3",
          status: "absent",
          minutes: 0,
          goals: 0,
          goalMinutes: undefined,
        }),
      ],
    },
  ],
  mvp: "lee-jae-sung",
  summary: "이번 주 MVP는 이재성이다.",
  summaryAi: true,
  generatedAt: "2026-11-01T07:09:25.458Z",
});

const NOW = new Date("2026-11-01T07:00:00.000Z"); // 11-01 16:00 KST

describe("주차 · 기간", () => {
  it("주차 이름 W43 · 2026년 43주", () => {
    expect(weekName("2026-43")).toEqual({
      week: "2026-43",
      short: "W43",
      long: "2026년 43주",
    });
    expect(weekName("2027-01").long).toBe("2027년 1주");
  });

  it("기간은 경기일 기준 UTC 날짜 — 끝(일 23:59:59.999Z)이 KST 월요일로 밀리지 않는다(D65 ①)", () => {
    const r = weekRangeView(REPORT);
    expect(r.fromLabel).toBe("10.19 (월)");
    expect(r.toLabel).toBe("10.25 (일)");
    expect(dayLabel("2026-12-31")).toBe("12.31 (목)");
  });

  it("이웃 주차 · 연말 53주 · 발행 예정일(다음 월요일)", () => {
    expect(nextIsoWeek("2026-43")).toBe("2026-44");
    expect(prevIsoWeek("2026-43")).toBe("2026-42");
    expect(nextIsoWeek("2026-53")).toBe("2027-01");
    expect(prevIsoWeek("2027-01")).toBe("2026-53");
    expect(plannedPublishDate("2026-44")).toBe("2026-11-02");
  });

  it("발행 예정 — 예정일이 빌드 날짜(KST) 이후일 때만", () => {
    expect(upcomingWeek("2026-43", NOW)).toEqual({
      name: weekName("2026-44"),
      date: "2026-11-02",
      label: "11.02 (월)",
    });
    // 11-02 월 07:00 KST(공개 전 빌드) — 그날도 예정
    expect(
      upcomingWeek("2026-43", new Date("2026-11-01T22:00:00Z"))?.date,
    ).toBe("2026-11-02");
    // 11-03 — 지난 예정일은 쓰지 않는다
    expect(
      upcomingWeek("2026-43", new Date("2026-11-03T00:00:00Z")),
    ).toBeNull();
    expect(upcomingWeek(null, NOW)).toBeNull();
  });
});

describe("점수 · 근거 줄", () => {
  it("MVP 점수 = 골×3 + 도움×2 + 출전(FR-92)", () => {
    expect(weeklyPoints({ goals: 1, assists: 0, apps: 1 })).toBe(4);
    expect(weeklyPoints({ goals: 0, assists: 2, apps: 2 })).toBe(6);
  });

  it("골 · 도움 글자 — 골 분이 있으면 분, 없으면 개수", () => {
    expect(scoringText({ goals: 1, assists: 0, goalMinutes: ["63"] })).toBe(
      "63분 골",
    );
    expect(
      scoringText({ goals: 2, assists: 1, goalMinutes: ["12", "45+2"] }),
    ).toBe("12분 · 45+2분 골 · 1도움");
    expect(scoringText({ goals: 1, assists: null })).toBe("1골");
    expect(scoringText({ goals: 0, assists: 0 })).toBeNull();
  });

  it("근거 경기 = 골×3 + 도움×2 → 분 → 이른 경기, 벤치 · 명단 제외 경기는 고르지 않는다", () => {
    const a = match({
      matchId: "a",
      goals: 0,
      goalMinutes: undefined,
      minutes: 60,
    });
    const b = match({
      matchId: "b",
      goals: 0,
      goalMinutes: undefined,
      minutes: 90,
    });
    const c = match({
      matchId: "c",
      status: "bench",
      minutes: 0,
      goals: 0,
      goalMinutes: undefined,
    });
    expect(evidenceMatch([a, b, c])?.matchId).toBe("b");
    expect(evidenceMatch([a, match({ matchId: "g" })])?.matchId).toBe("g");
    expect(evidenceMatch([c])).toBeNull();
  });
});

describe("한 주 화면 모델", () => {
  const view = weeklyReportView(REPORT, ["2026-43"], CTX, NOW);

  it("MVP 머리기사 — 이름 · 팀 · 근거 줄(골 분 + 결과, 소속팀 득점 먼저)", () => {
    expect(view.mvp?.nameKo).toBe("이재성");
    expect(view.mvp?.team.name).toBe("마인츠");
    expect(view.mvp?.evidence).toMatchObject({
      scoring: "63분 골",
      result: { outcome: "L", for: 2, against: 3 },
      home: true,
      opponent: { name: "브레멘", latin: false },
    });
    expect(view.coMvp).toEqual([]);
    expect(view.score).toEqual({ points: 4, goals: 1, assists: 0, apps: 1 });
  });

  it("표 — 행 순서 그대로, 점수 · MVP 표시 · 90분 막대(출전 채움 · 명단 제외 점선)", () => {
    expect(view.rows.map((r) => [r.slug, r.points, r.mvp])).toEqual([
      ["lee-jae-sung", 4, true],
      ["hwang-hee-chan", 1, false],
    ]);
    const bars = view.rows[1]!.matches!.map((m) => [m.bar, m.fill]);
    expect(bars).toEqual([
      ["played", 100],
      ["none", 0],
    ]);
    expect(view.rows[1]!.matches![1]!.appearance.label).toBe("명단 제외");
    expect(view.rows[1]!.matches![0]!.opponent).toMatchObject({
      name: "1. FC Köln",
      latin: true,
    });
    expect(view.appeared).toBe(2);
    expect(view.runnersUp).toEqual([
      { slug: "hwang-hee-chan", nameKo: "황희찬", points: 1 },
    ]);
  });

  it("주 이동 — 앞 주 없음 · 뒤 주는 발행 예정", () => {
    expect(view.prev).toEqual({
      kind: "off",
      name: weekName("2026-42"),
      reason: "리포트 없음",
    });
    expect(view.next).toEqual({
      kind: "off",
      name: weekName("2026-44"),
      reason: "11.02 (월) 발행 예정",
    });
  });

  it("주 이동 — 빠진 주를 건너뛴 발행된 이웃 주로", () => {
    const v = weeklyReportView(
      REPORT,
      ["2026-40", "2026-43", "2026-46"],
      CTX,
      NOW,
    );
    expect(v.prev).toEqual({ kind: "link", name: weekName("2026-40") });
    expect(v.next).toEqual({ kind: "link", name: weekName("2026-46") });
  });

  it("표 밖 선수 — 기록 연결 전 · 그 주 뒤 집계 시작 · 5대 리그 밖(지금 상태로 이유)", () => {
    expect(view.excluded).toEqual([
      { reason: "기록 연결 전", names: ["김지수", "박승수"] },
      { reason: "11월 2일부터 집계", names: ["나중선수"] },
      { reason: "5대 리그 밖", names: ["홍현석"] },
    ]);
    // 현황 파일이 없으면 집계 시작일을 모른다 — 연결 전으로
    expect(
      excludedGroups(REPORT, { players: PLAYERS, data: null }).map(
        (g) => g.reason,
      ),
    ).toEqual(["기록 연결 전", "5대 리그 밖"]);
  });
});

describe("공동 MVP · 템플릿 총평 · 출전 0명 · 옛 파일", () => {
  it("공동 MVP — 큰 이름은 mvp(가나다 첫 선수), 나머지는 coMvp 순서로(D65 ②)", () => {
    const co = WeeklyReportSchema.parse({
      ...REPORT,
      rows: [
        { ...REPORT.rows[0]!, player: "hwang-hee-chan" },
        { ...REPORT.rows[0]! },
      ],
      mvp: "lee-jae-sung",
      coMvp: ["hwang-hee-chan"],
    });
    const v = weeklyReportView(co, ["2026-43"], CTX, NOW);
    expect(v.mvp?.slug).toBe("lee-jae-sung");
    expect(v.coMvp.map((c) => [c.nameKo, c.evidence?.scoring])).toEqual([
      ["황희찬", "63분 골"],
    ]);
    expect(v.rows.every((r) => r.mvp)).toBe(true);
    expect(v.runnersUp).toEqual([]);
    expect(weeklyIndexEntry(co, CTX)).toMatchObject({
      mvpName: "이재성",
      mvpCount: 2,
      points: 4,
    });
  });

  it("summaryAi false — 총평은 그대로, ai 표시 꺼짐", () => {
    const t = WeeklyReportSchema.parse({ ...REPORT, summaryAi: false });
    expect(weeklyReportView(t, ["2026-43"], CTX, NOW).summary).toEqual({
      text: REPORT.summary,
      ai: false,
    });
  });

  it("출전 0명 — MVP · 점수 없음, 다음 순위 없음", () => {
    const none = WeeklyReportSchema.parse({
      ...REPORT,
      rows: [
        {
          player: "lee-jae-sung",
          apps: 0,
          minutes: 0,
          goals: 0,
          assists: 0,
          matches: [
            match({
              status: "bench",
              minutes: 0,
              goals: 0,
              goalMinutes: undefined,
            }),
          ],
        },
      ],
      mvp: null,
    });
    const v = weeklyReportView(none, ["2026-43"], CTX, NOW);
    expect(v.mvp).toBeNull();
    expect(v.score).toBeNull();
    expect(v.appeared).toBe(0);
    expect(v.rows[0]!.matches![0]!.bar).toBe("bench");
    expect(weeklyIndexEntry(none, CTX)).toMatchObject({
      mvpName: null,
      mvpCount: 0,
      points: null,
    });
  });

  it("경기 줄 없는 옛 파일 — 막대 · 근거 줄 없음", () => {
    const old = WeeklyReportSchema.parse({
      ...REPORT,
      rows: REPORT.rows.map((r) => ({ ...r, matches: undefined })),
    });
    const v = weeklyReportView(old, ["2026-43"], CTX, NOW);
    expect(v.rows.every((r) => r.matches === null)).toBe(true);
    expect(v.mvp?.evidence).toBeNull();
  });
});
