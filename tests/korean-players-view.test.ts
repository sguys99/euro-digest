import { describe, expect, it } from "vitest";

import type { TeamLookup } from "@/lib/competition-view";
import {
  appearanceOf,
  resultOf,
  rosterAnchor,
  rosterStateOf,
  rosterView,
  seasonTotalOf,
  sinceLabel,
  type RosterInput,
} from "@/lib/korean-players-view";
import type {
  KoreanPlayer,
  KoreanPlayerRecord,
  PlayerMatchLog,
} from "@/lib/schema/player";

// 한국 선수 목록 화면 모델(M3-09 — PRD FR-61·FR-64·FR-65, DESIGN §9.3 D2 선수 명단 행 · 숫자 상태 규칙 · 결과 칸). 순수 함수.

const team: TeamLookup = (slug) => ({
  slug,
  name: slug === "unknown-fc" ? "Unknown Fc" : `팀-${slug}`,
  latin: slug === "unknown-fc",
  short: slug.slice(0, 3).toUpperCase(),
  colors: ["#123456", "#FFFFFF"],
  page: true,
});

function player(
  slug: string,
  comp: KoreanPlayer["comp"],
  extra: Partial<KoreanPlayer> = {},
): KoreanPlayer {
  return {
    slug,
    nameKo: `선수-${slug}`,
    nameEn: slug,
    team: `${slug}-fc`,
    comp,
    position: "MF",
    birthYear: 2000,
    apiFootballId: 1,
    active: true,
    ...extra,
  };
}

function log(extra: Partial<PlayerMatchLog> = {}): PlayerMatchLog {
  return {
    matchId: "fd-1",
    comp: "BUNDESLIGA",
    kickoff: "2026-10-31T14:30:00.000Z",
    opponent: { slug: "koln", name: "1. FC Köln" },
    home: true,
    result: { for: 2, against: 1 },
    status: "start",
    started: true,
    minutes: 90,
    goals: 0,
    assists: 0,
    ...extra,
  };
}

function record(
  slug: string,
  extra: Partial<KoreanPlayerRecord> = {},
): KoreanPlayerRecord {
  return {
    slug,
    team: `${slug}-fc`,
    provider: "api-football",
    since: "2026-10-19",
    season: [],
    recent: [],
    next: null,
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...extra,
  };
}

function input(
  players: KoreanPlayer[],
  records: KoreanPlayerRecord[] | null,
  extra: Partial<RosterInput> = {},
): RosterInput {
  return {
    players,
    data: records
      ? {
          season: 2026,
          since: "2026-10-19",
          generatedAt: "2026-11-01T04:17:30.987Z",
          players: records,
        }
      : null,
    competitions: [
      { id: "EPL", short: "EPL", name: "프리미어리그" },
      { id: "LALIGA", short: "라리가", name: "라리가" },
      { id: "BUNDESLIGA", short: "분데스", name: "분데스리가" },
      { id: "UCL", short: "UCL", name: "UEFA 챔피언스리그" },
    ],
    team,
    teamNameKo: (en) => (en === "1. FC Magdeburg" ? "마그데부르크" : null),
    competitionNameKo: () => null,
    ...extra,
  };
}

describe("집계 시작일 문구", () => {
  it("UTC 날짜 → 'M월 D일 이후 집계'(앞 0 없음)", () => {
    expect(sinceLabel("2026-10-19")).toBe("10월 19일 이후 집계");
    expect(sinceLabel("2026-11-01")).toBe("11월 1일 이후 집계");
  });
});

describe("선수 상태(FR-64 · 기록 연결 전)", () => {
  it("기타 리그·비활성 → other, id 없음·추적 전 → not-linked, 그 밖 linked", () => {
    const base = { comp: "EPL" as const, active: true, apiFootballId: 1 };
    expect(rosterStateOf({ ...base, comp: "OTHER" }, null)).toBe("other");
    expect(
      rosterStateOf({ ...base, active: false }, { since: "2026-10-19" }),
    ).toBe("other");
    expect(
      rosterStateOf({ ...base, apiFootballId: null }, { since: null }),
    ).toBe("not-linked");
    // id는 있는데 아직 추적을 시작하지 않았다(파생 파일 since null)
    expect(rosterStateOf(base, { since: null })).toBe("not-linked");
    expect(rosterStateOf(base, null)).toBe("not-linked");
    expect(rosterStateOf(base, { since: "2026-10-19" })).toBe("linked");
  });
});

describe("출전 분 거터 — 숫자 상태 규칙(실선 · 윤곽 · 대시)", () => {
  it("선발·교체는 실선 + 분, 0은 윤곽 '미출전', null은 대시(0으로 바꾸지 않는다)", () => {
    expect(appearanceOf({ started: true, minutes: 67 }, false)).toMatchObject({
      text: "67",
      tone: "on",
      label: "선발",
      strong: true,
      sr: "선발 67분",
    });
    expect(appearanceOf({ started: false, minutes: 13 }, false)).toMatchObject({
      tone: "on",
      label: "교체",
    });
    expect(appearanceOf({ started: false, minutes: 0 }, false)).toMatchObject({
      text: "0",
      tone: "zero",
      label: "미출전",
      strong: false,
    });
    expect(appearanceOf({ started: null, minutes: null }, false)).toMatchObject(
      { text: "–", tone: "null", label: "라인업 없음" },
    );
    // 폴백(FR-65)
    expect(appearanceOf({ started: null, minutes: null }, true).label).toBe(
      "기록 없음",
    );
  });
});

describe("출전 분 거터 — 로그 status가 있으면 먼저(벤치 0 윤곽 · 명단 제외 대시)", () => {
  it("start · sub · bench · absent · unknown", () => {
    expect(
      appearanceOf({ status: "start", started: true, minutes: 45 }, false),
    ).toMatchObject({ text: "45", tone: "on", label: "선발" });
    expect(
      appearanceOf({ status: "sub", started: false, minutes: 13 }, false),
    ).toMatchObject({ text: "13", tone: "on", label: "교체" });
    expect(
      appearanceOf({ status: "bench", started: false, minutes: 0 }, false),
    ).toMatchObject({ text: "0", tone: "zero", label: "벤치", sr: "벤치 0분" });
    // 명단 제외 — 데이터 분이 0이어도 값 없음(대시, 0으로 그리지 않는다)
    expect(
      appearanceOf({ status: "absent", started: false, minutes: 0 }, false),
    ).toMatchObject({ text: "–", tone: "null", label: "명단 제외" });
    expect(
      appearanceOf({ status: "unknown", started: null, minutes: null }, false),
    ).toMatchObject({ text: "–", tone: "null", label: "라인업 없음" });
  });
});

describe("결과 칸 — 소속팀 득점 먼저 · 승부차기", () => {
  it("W/D/L은 정규시간 + 연장으로, 승부차기는 무 + 스코어 따로(소속팀 먼저)", () => {
    expect(resultOf(log({ result: { for: 6, against: 1 } }))).toEqual({
      outcome: "W",
      for: 6,
      against: 1,
      pens: null,
    });
    expect(resultOf(log({ result: { for: 0, against: 2 } }))?.outcome).toBe(
      "L",
    );
    expect(
      resultOf(
        log({
          result: { for: 1, against: 1, pens: { for: 4, against: 3 } },
        }),
      ),
    ).toEqual({
      outcome: "D",
      for: 1,
      against: 1,
      pens: { for: 4, against: 3 },
    });
    expect(resultOf(log({ result: null }))).toBeNull();
  });
});

describe("시즌 누적 합", () => {
  it("대회별 행을 더하고, 분·도움은 한 행이라도 null이면 null(폴백 — 대시)", () => {
    expect(seasonTotalOf([])).toBeNull();
    expect(
      seasonTotalOf([
        { comp: "BUNDESLIGA", apps: 1, minutes: 90, goals: 1, assists: 0 },
        { comp: "UCL", apps: 1, minutes: 45, goals: 0, assists: 1 },
        {
          comp: "OTHER",
          leagueRaw: "DFB Pokal",
          apps: 0,
          minutes: 0,
          goals: 0,
          assists: 0,
        },
      ]),
    ).toEqual({ apps: 2, minutes: 135, goals: 1, assists: 1 });
    expect(
      seasonTotalOf([
        { comp: "EPL", apps: 2, minutes: null, goals: 1, assists: null },
        { comp: "UCL", apps: 1, minutes: 30, goals: 0, assists: 0 },
      ]),
    ).toEqual({ apps: 3, minutes: null, goals: 1, assists: null });
  });
});

describe("목록 화면 모델", () => {
  const players = [
    player("epl-a", "EPL", { apiFootballId: null }),
    player("bl-a", "BUNDESLIGA"),
    player("ll-a", "LALIGA"),
    player("bl-b", "BUNDESLIGA"),
    player("other-a", "OTHER", { active: false, apiFootballId: null }),
    player("epl-b", "EPL"),
  ];
  const records = [
    record("bl-a", {
      recent: [
        log({
          comp: "OTHER",
          leagueRaw: "DFB Pokal",
          opponent: { slug: null, name: "1. FC Magdeburg" },
          status: "bench",
          started: false,
          minutes: 0,
          result: { for: 6, against: 1 },
        }),
      ],
      season: [
        { comp: "BUNDESLIGA", apps: 1, minutes: 90, goals: 0, assists: 0 },
        { comp: "UCL", apps: 1, minutes: 45, goals: 0, assists: 0 },
      ],
      next: {
        matchId: "fd-2",
        comp: "UCL",
        kickoff: "2026-11-03T20:00:00Z",
        opponent: { slug: "atletico-madrid", name: "Club Atlético de Madrid" },
        home: false,
      },
    }),
    record("bl-b", {
      recent: [log({ opponent: { slug: "unknown-fc", name: "Unknown FC" } })],
    }),
    record("ll-a", { since: "2026-11-01" }),
    record("epl-a", { since: null }),
    record("epl-b", { since: null }),
    record("other-a", {
      since: null,
      recent: [log()],
      next: {
        matchId: "x",
        comp: "OTHER",
        kickoff: "2026-11-03T20:00:00Z",
        opponent: { slug: null, name: "X" },
        home: true,
      },
    }),
  ];
  const view = rosterView(input(players, records));

  it("구간 = 선수 수 많은 순(같으면 대회 설정 순) · 기타 리그 맨 끝, 구간 안은 설정 순서", () => {
    expect(view.groups.map((g) => [g.key, g.rows.map((r) => r.slug)])).toEqual([
      ["EPL", ["epl-a", "epl-b"]],
      ["BUNDESLIGA", ["bl-a", "bl-b"]],
      ["LALIGA", ["ll-a"]],
      ["OTHER", ["other-a"]],
    ]);
    expect(view.groups.map((g) => [g.label, g.short, g.anchor])).toEqual([
      ["프리미어리그", "EPL", "kp-epl"],
      ["분데스리가", "분데스", "kp-bundesliga"],
      ["라리가", "라리가", "kp-laliga"],
      ["기타 리그", "기타", "kp-other"],
    ]);
    expect(rosterAnchor("OTHER")).toBe("kp-other");
  });

  it("머리 수치 · 집계 시작일 · 생성 시각", () => {
    expect(view.counts).toEqual({ total: 6, linked: 3 });
    expect(view.sinceLabel).toBe("10월 19일 이후 집계");
    expect(view.generatedAt).toBe("2026-11-01T04:17:30.987Z");
  });

  it("컵 경기 — 대회는 '기타' + 원문(사전에 없으면 latin), 사전에 있는 상대는 한글 + 폴백 배지", () => {
    const row = view.groups[1]!.rows[0]!;
    expect(row.appearance).toMatchObject({
      text: "0",
      tone: "zero",
      label: "벤치",
    });
    expect(row.recent?.comp).toEqual({
      kind: "other",
      name: "DFB Pokal",
      latin: true,
    });
    expect(row.recent?.opponent).toEqual({
      name: "마그데부르크",
      latin: false,
      badge: { name: "마그데부르크", short: "", colors: null },
    });
    expect(row.season).toEqual({ apps: 2, minutes: 135, goals: 0, assists: 0 });
    expect(row.ucl).toEqual({ apps: 1, minutes: 45 });
    expect(row.next?.comp).toMatchObject({ kind: "comp", comp: "UCL" });
    expect(row.next?.opponent.name).toBe("팀-atletico-madrid");
  });

  it("데이터 팀인데 사전에 없으면 API 원문 이름(latin)", () => {
    const row = view.groups[1]!.rows[1]!;
    expect(row.recent?.opponent).toMatchObject({
      name: "Unknown FC",
      latin: true,
    });
    expect(row.ucl).toBeNull();
  });

  it("집계 시작일이 다른 선수만 sinceNote, 경기가 없으면 noMatches + '경기 없음' 대시", () => {
    const row = view.groups[2]!.rows[0]!;
    expect(row.sinceNote).toBe("11월 1일 이후 집계");
    expect(row.noMatches).toBe(true);
    expect(row.appearance).toMatchObject({ tone: "null", label: "경기 없음" });
    expect(view.groups[1]!.rows[0]!.sinceNote).toBeNull();
  });

  it("기록 연결 전 — 거터 대시 '연결 전', 최근 경기 없음(다음 경기는 그대로)", () => {
    const row = view.groups[0]!.rows[0]!;
    expect(row.state).toBe("not-linked");
    expect(row.appearance).toMatchObject({ text: "–", label: "연결 전" });
    expect(row.recent).toBeNull();
    expect(row.noMatches).toBe(false);
  });

  it("기타 리그 — 마지막 기록·다음 경기를 내세우지 않는다(갱신 중단)", () => {
    const row = view.groups[3]!.rows[0]!;
    expect(row.state).toBe("other");
    expect(row.appearance.label).toBe("갱신 중단");
    expect(row.recent).toBeNull();
    expect(row.next).toBeNull();
  });

  it("현황 파일 전이면 모든 선수 '기록 연결 전'(명단은 설정에서)", () => {
    const empty = rosterView(input(players.slice(0, 2), null));
    expect(empty.sinceLabel).toBeNull();
    expect(empty.generatedAt).toBeNull();
    expect(empty.groups.flatMap((g) => g.rows.map((r) => r.state))).toEqual([
      "not-linked",
      "not-linked",
    ]);
  });
});
