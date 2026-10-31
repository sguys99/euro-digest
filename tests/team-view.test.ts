import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { TeamLookup } from "@/lib/competition-view";
import type { Match, StandingRow } from "@/lib/schema/competition";
import type { NewsCard } from "@/lib/schema/news";
import type { TeamSheetPlayer } from "@/lib/schema/team";
import {
  fixtureRoundLabel,
  fixtureWindow,
  keyPlayerViews,
  leagueContextRows,
  nextFixtureOf,
  pitchSpots,
  relatedIssues,
  relatedNewsSince,
  teamFixtureViews,
  teamFormAll,
  teamMatchesOf,
} from "@/lib/team-view";
import { parseUtcIso } from "@/lib/time";

// 팀 화면 모델(M2-13 — PRD FR-51·52·54·55·57, DESIGN §9.3 팀 화면). 순수 함수 — 지금 시각은 고정 값.

const team: TeamLookup = (slug) => ({
  slug,
  name: `팀-${slug}`,
  latin: false,
  short: slug.slice(0, 3).toUpperCase(),
  colors: ["#123456", "#FFFFFF"],
  page: true,
});

function match(
  id: string,
  kickoff: string,
  home: string,
  away: string,
  extra: Partial<Match> = {},
): Match {
  return {
    id,
    comp: "BUNDESLIGA",
    round: "9",
    kickoff,
    home,
    away,
    score: null,
    status: "scheduled",
    ...extra,
  };
}

const NOW = parseUtcIso("2026-10-30T00:00:00Z").getTime();

describe("일정·결과 — 경기 모으기·표기", () => {
  it("여러 대회 경기에서 이 팀 경기만, 같은 id는 한 번, 킥오프 순", () => {
    const bl = [
      match("b2", "2026-10-25T13:30:00Z", "fcb", "scf"),
      match("b1", "2026-10-18T13:30:00Z", "bvb", "fcb"),
      match("b3", "2026-10-18T13:30:00Z", "bvb", "s04"),
    ];
    const ucl = [
      match("u1", "2026-10-21T19:00:00Z", "fcb", "vik", { comp: "UCL" }),
      match("b1", "2026-10-18T13:30:00Z", "bvb", "fcb"),
    ];
    expect(teamMatchesOf([bl, ucl], "fcb").map((m) => m.id)).toEqual([
      "b1",
      "u1",
      "b2",
    ]);
  });

  it("라운드 표기 — 리그 n라운드 · UCL 리그 페이즈 n차전 · 녹아웃은 대회 화면과 같다", () => {
    expect(fixtureRoundLabel("BUNDESLIGA", "9")).toBe("9라운드");
    expect(fixtureRoundLabel("UCL", "3")).toBe("3차전");
    expect(fixtureRoundLabel("UCL", "ko-r16-1")).toBe("16강 1차전");
  });

  it("홈/원정 · 상대 · KST 날짜·요일 · 결과(승부차기는 무) · 임시 킥오프 · 연장/승부차기 글자", () => {
    const rows = teamFixtureViews(
      [
        match("a", "2026-10-25T13:30:00Z", "fcb", "scf", {
          status: "finished",
          score: { h: 2, a: 1 },
        }),
        match("b", "2026-10-21T19:00:00Z", "vik", "fcb", {
          comp: "UCL",
          round: "3",
          status: "finished",
          score: { h: 1, a: 1, aet: true, pens: { h: 4, a: 3 } },
        }),
        match("c", "2026-12-02T23:00:00Z", "fcb", "bvb", { tbc: true }),
      ],
      "fcb",
      team,
      NOW,
    );
    expect(rows[0]).toMatchObject({
      side: "home",
      date: "10.25",
      weekday: "일",
      round: "9라운드",
      result: "W",
      state: "finished",
      time: "22:30",
    });
    expect(rows[0]?.opponent.slug).toBe("scf");
    expect(rows[1]).toMatchObject({
      side: "away",
      round: "3차전",
      result: "D",
      extra: "연장 · 승부차기 4–3",
      date: "10.22",
      weekday: "목",
    });
    expect(rows[2]).toMatchObject({ time: null, state: "scheduled" });
  });

  it("킥오프가 3시간 넘게 지난 예정 경기는 결과 대기, 연기는 연기(대회 화면과 같은 판정)", () => {
    const rows = teamFixtureViews(
      [
        match("p", "2026-10-29T18:00:00Z", "fcb", "scf"),
        match("q", "2026-10-26T18:00:00Z", "fcb", "bvb", {
          status: "postponed",
        }),
      ],
      "fcb",
      team,
      NOW,
    );
    expect(rows.map((r) => r.state)).toEqual(["pending", "postponed"]);
  });
});

describe("일정·결과 — 펼칠 구간 · 다음 경기 · 전 대회 폼", () => {
  const rows = teamFixtureViews(
    Array.from({ length: 12 }, (_, i) =>
      match(
        `m${i}`,
        new Date(Date.UTC(2026, 9, 1 + i * 5, 18))
          .toISOString()
          .replace(".000", ""),
        i % 2 ? "fcb" : "bvb",
        i % 2 ? "bvb" : "fcb",
        i < 6 ? { status: "finished", score: { h: i % 3, a: 1 } } : {},
      ),
    ),
    "fcb",
    team,
    NOW,
  );

  it("지난 경기 최근 4 + 다가올 경기 4를 펼치고 나머지는 앞뒤로 접는다", () => {
    const w = fixtureWindow(rows, NOW);
    // 10.01 … 10.26 = 지난 6경기(10.26까지), 10.31부터 다가올 6경기
    expect(w.earlier.map((r) => r.match.id)).toEqual(["m0", "m1"]);
    expect(w.shown.map((r) => r.match.id)).toEqual([
      "m2",
      "m3",
      "m4",
      "m5",
      "m6",
      "m7",
      "m8",
      "m9",
    ]);
    expect(w.later.map((r) => r.match.id)).toEqual(["m10", "m11"]);
  });

  it("시즌 끝(다가올 경기 없음)은 지난 경기만, 시즌 전은 다가올 경기만 — 다른 쪽으로 채우지 않는다", () => {
    const end = fixtureWindow(
      rows,
      parseUtcIso("2027-06-01T00:00:00Z").getTime(),
    );
    expect(end.shown).toHaveLength(4);
    expect(end.later).toHaveLength(0);
    const start = fixtureWindow(
      rows,
      parseUtcIso("2026-08-01T00:00:00Z").getTime(),
    );
    expect(start.earlier).toHaveLength(0);
    expect(start.shown).toHaveLength(4);
    expect(start.later).toHaveLength(8);
  });

  it("다음 경기 = 지금 이후 예정 중 가장 이른 것(결과 대기·연기 제외, 임시 킥오프 포함)", () => {
    const list = teamFixtureViews(
      [
        match("pending", "2026-10-29T12:00:00Z", "fcb", "scf"),
        match("post", "2026-10-31T12:00:00Z", "fcb", "bvb", {
          status: "postponed",
        }),
        match("tbc", "2026-11-04T00:00:00Z", "fcb", "s04", { tbc: true }),
        match("later", "2026-11-08T14:30:00Z", "fcb", "rbl"),
      ],
      "fcb",
      team,
      NOW,
    );
    expect(nextFixtureOf(list, NOW)?.match.id).toBe("tbc");
    expect(nextFixtureOf([], NOW)).toBeNull();
  });

  it("전 대회 폼 — 종료 경기 최근 5개, 읽는 이름은 '최근 경기(전 대회)'", () => {
    const form = teamFormAll(rows);
    expect(form.count).toBe(5);
    expect(form.cells).toHaveLength(5);
    expect(
      form.label.startsWith("최근 경기(전 대회) 5경기 (오래된 순): "),
    ).toBe(true);
    const none = teamFormAll([]);
    expect(none.label).toBe("최근 경기(전 대회) 자료 없음");
  });
});

describe("팀시트 피치 좌표 — API-Football grid(행 = 골문 → 공격, 열 1 = 왼쪽)", () => {
  // 혼합안 시안의 바이에른 4-2-3-1(10.10 아우크스부르크 원정) — 같은 grid에서 같은 좌표가 나와야 한다
  const raw = JSON.parse(
    readFileSync(
      "fixtures/football/api-football/fixtures-id-1575180.json",
      "utf8",
    ),
  ) as {
    response: Array<{
      lineups: Array<{
        team: { name: string };
        startXI: Array<{
          player: { name: string; number: number; pos: string; grid: string };
        }>;
      }>;
    }>;
  };
  const bayern = raw.response[0]!.lineups.find(
    (l) => l.team.name === "Bayern München",
  )!;
  const startXI: TeamSheetPlayer[] = bayern.startXI.map(({ player }) => ({
    name: player.name,
    number: player.number,
    pos: player.pos as TeamSheetPlayer["pos"],
    grid: player.grid,
  }));

  it("혼합안 좌표와 같다(GK 91 · 수비 71.5 · 18.5/39.5/60.5/81.5 · 최전방 13) + 같은 줄 간격 w = 84 / 인원", () => {
    const spots = pitchSpots(startXI)!;
    const byName = Object.fromEntries(
      startXI.map((p, i) => [p.name, spots[i]]),
    );
    expect(byName["M. Neuer"]).toEqual({ a: 91, c: 50, w: 84 });
    expect(byName["A. Davies"]).toEqual({ a: 71.5, c: 18.5, w: 21 });
    expect(byName["J. Tah"]).toEqual({ a: 71.5, c: 39.5, w: 21 });
    expect(byName["J. Stanišić"]).toEqual({ a: 71.5, c: 81.5, w: 21 });
    expect(byName["A. Pavlović"]).toEqual({ a: 52, c: 29, w: 42 });
    expect(byName["L. Díaz"]).toEqual({ a: 32.5, c: 22, w: 28 });
    expect(byName["M. Olise"]).toEqual({ a: 32.5, c: 78, w: 28 });
    expect(byName["H. Kane"]).toEqual({ a: 13, c: 50, w: 84 });
  });

  it("grid가 하나라도 없으면 null(피치 없이 명단만)", () => {
    const broken = startXI.map((p, i) => (i === 3 ? { ...p, grid: null } : p));
    expect(pitchSpots(broken)).toBeNull();
    expect(pitchSpots([])).toBeNull();
  });

  it("4줄 포메이션(4-4-2)은 GK 91 → 최전방 13을 3등분", () => {
    const grids = [
      "1:1",
      "2:1",
      "2:2",
      "2:3",
      "2:4",
      "3:1",
      "3:2",
      "3:3",
      "3:4",
      "4:1",
      "4:2",
    ];
    const spots = pitchSpots(
      grids.map((grid, i) => ({
        name: `p${i}`,
        number: i + 1,
        pos: null,
        grid,
      })),
    )!;
    expect([...new Set(spots.map((s) => s.a))]).toEqual([91, 65, 39, 13]);
    expect(spots.slice(9).map((s) => s.c)).toEqual([29, 71]);
  });
});

describe("리그 맥락 — 이 팀 앞뒤 2팀(양 끝은 반대쪽으로 채움)", () => {
  const standings = Array.from({ length: 18 }, (_, i) => ({
    pos: i + 1,
    team: `t${i + 1}`,
  })) as unknown as StandingRow[];
  const slugs = (rows: StandingRow[]) => rows.map((r) => r.team);

  it("가운데 · 1위 · 2위 · 꼴찌 · 순위표에 없음", () => {
    expect(slugs(leagueContextRows(standings, "t9"))).toEqual([
      "t7",
      "t8",
      "t9",
      "t10",
      "t11",
    ]);
    expect(slugs(leagueContextRows(standings, "t1"))).toEqual([
      "t1",
      "t2",
      "t3",
      "t4",
      "t5",
    ]);
    expect(slugs(leagueContextRows(standings, "t2"))).toEqual([
      "t1",
      "t2",
      "t3",
      "t4",
      "t5",
    ]);
    expect(slugs(leagueContextRows(standings, "t18"))).toEqual([
      "t14",
      "t15",
      "t16",
      "t17",
      "t18",
    ]);
    expect(leagueContextRows(standings, "nope")).toEqual([]);
    expect(slugs(leagueContextRows(standings.slice(0, 3), "t2"))).toEqual([
      "t1",
      "t2",
      "t3",
    ]);
  });
});

describe("주요 선수 — 공동 순위 · 표기(D63 ①)", () => {
  it("같은 골은 같은 순위, 사전 정확 일치만 한글(그 밖은 원어 lang=en)", () => {
    const views = keyPlayerViews(
      [
        { name: "Michael Olise", goals: 6, assists: 3 },
        { name: "Harry Kane", goals: 4, assists: 4 },
        { name: "Luis Díaz", goals: 4, assists: null },
      ],
      (en) => ({ "Harry Kane": "해리 케인" })[en] ?? null,
    );
    expect(views).toEqual([
      { rank: 1, name: "Michael Olise", latin: true, goals: 6, assists: 3 },
      { rank: 2, name: "해리 케인", latin: false, goals: 4, assists: 4 },
      { rank: 2, name: "Luis Díaz", latin: true, goals: 4, assists: null },
    ]);
  });
});

describe("관련 뉴스 — 최근 30일 · 최신 호 먼저 · 최대 n장", () => {
  const card = (id: string, teams: string[]) =>
    ({ id, teams }) as unknown as NewsCard;
  const issues = [
    { date: "2026-09-29", cards: [card("c_0000000001", ["fcb"])] },
    {
      date: "2026-10-01",
      cards: [card("c_0000000002", ["fcb"]), card("c_0000000003", ["bvb"])],
    },
    { date: "2026-10-29", cards: [card("c_0000000004", ["bvb"])] },
    {
      date: "2026-10-30",
      cards: [
        card("c_0000000005", ["fcb", "bvb"]),
        card("c_0000000006", ["fcb"]),
        card("c_0000000007", ["fcb"]),
      ],
    },
  ];

  it("기간 첫날 = 오늘 포함 30일", () => {
    expect(relatedNewsSince("2026-10-30")).toBe("2026-10-01");
  });

  it("기간 밖·카드 없는 호는 빼고, 호 안은 게재 순, 상한에서 자른다", () => {
    const got = relatedIssues(issues, "fcb", "2026-10-01", 3);
    expect(got.map((g) => [g.news.date, g.ids])).toEqual([
      ["2026-10-30", ["c_0000000005", "c_0000000006", "c_0000000007"]],
    ]);
    const all = relatedIssues(issues, "fcb", "2026-10-01");
    expect(all.map((g) => [g.news.date, g.ids])).toEqual([
      ["2026-10-30", ["c_0000000005", "c_0000000006", "c_0000000007"]],
      ["2026-10-01", ["c_0000000002"]],
    ]);
    expect(relatedIssues(issues, "zzz", "2026-10-01")).toEqual([]);
  });
});
