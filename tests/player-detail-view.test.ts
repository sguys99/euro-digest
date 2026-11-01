import { describe, expect, it } from "vitest";

import type { TeamLookup } from "@/lib/competition-view";
import { lastNightDate, lastNightView } from "@/lib/korean-last-night";
import {
  LOG_SLOTS,
  nationalCallUpOf,
  playerDetailView,
  playerNews,
  playerNewsKind,
  seasonMinutesOf,
  transferTagOf,
  upcomingRows,
  type PlayerDetailInput,
} from "@/lib/player-detail-view";
import type { NationalTeamFile } from "@/lib/schema/configs";
import type { NewsCard } from "@/lib/schema/news";
import type {
  KoreanPlayer,
  KoreanPlayerRecord,
  KoreanPlayersDataFile,
  PlayerMatchLog,
} from "@/lib/schema/player";
import type { TeamFixtureView } from "@/lib/team-view";

// 한국 선수 상세(M3-10 — PRD FR-62·FR-64·FR-73) · 홈 어젯밤 한국 선수(M3-11 — FR-58) 화면 모델. 순수 함수.

const team: TeamLookup = (slug) => ({
  slug,
  name: `팀-${slug}`,
  latin: false,
  short: slug.slice(0, 3).toUpperCase(),
  colors: ["#123456", "#FFFFFF"],
  page: true,
});

const COMPS = [
  { id: "BUNDESLIGA" as const, short: "분데스", name: "분데스리가" },
  { id: "UCL" as const, short: "UCL", name: "UEFA 챔피언스리그" },
];

function player(slug: string, extra: Partial<KoreanPlayer> = {}): KoreanPlayer {
  return {
    slug,
    nameKo: `선수-${slug}`,
    nameEn: slug,
    team: "bayern",
    comp: "BUNDESLIGA",
    position: "DF",
    birthYear: 1996,
    apiFootballId: 1,
    active: true,
    ...extra,
  };
}

function log(extra: Partial<PlayerMatchLog> = {}): PlayerMatchLog {
  return {
    matchId: "fd-1",
    comp: "BUNDESLIGA",
    kickoff: "2026-10-31T17:30:00.000Z",
    opponent: { slug: "dortmund", name: "Borussia Dortmund" },
    home: true,
    result: { for: 2, against: 2 },
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
    team: "bayern",
    provider: "api-football",
    since: "2026-10-19",
    season: [],
    recent: [],
    next: null,
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...extra,
  };
}

function data(records: KoreanPlayerRecord[]): KoreanPlayersDataFile {
  return {
    season: 2026,
    since: "2026-10-19",
    generatedAt: "2026-11-01T04:56:14.815Z",
    players: records,
  };
}

const NOW = Date.parse("2026-11-01T06:00:00Z");

function input(
  p: KoreanPlayer,
  d: KoreanPlayersDataFile | null,
  extra: Partial<PlayerDetailInput> = {},
): PlayerDetailInput {
  return {
    player: p,
    data: d,
    competitions: COMPS,
    team,
    teamNameKo: (en) => (en === "1. FC Magdeburg" ? "마그데부르크" : null),
    competitionNameKo: (en) => (en === "DFB Pokal" ? "DFB 포칼" : null),
    roundOf: (id) => (id === "fd-1" ? "8라운드" : null),
    standing: { pos: 1, pts: 18 },
    fixtures: [],
    nowMs: NOW,
    ...extra,
  };
}

function fixture(
  id: string,
  kickoff: string,
  opponent: string,
  side: "home" | "away" = "home",
  extra: Partial<TeamFixtureView> = {},
): TeamFixtureView {
  return {
    match: {
      id,
      comp: "BUNDESLIGA",
      round: "9",
      kickoff,
      home: side === "home" ? "bayern" : opponent,
      away: side === "home" ? opponent : "bayern",
      score: null,
      status: "scheduled",
    },
    comp: "BUNDESLIGA",
    side,
    opponent: team(opponent),
    date: "",
    weekday: "",
    round: "9라운드",
    state: "scheduled",
    time: "23:30",
    result: null,
    extra: null,
    ...extra,
  } as TeamFixtureView;
}

describe("playerDetailView — 선수 상세(M3-10)", () => {
  it("연결된 선수: 시즌 기록 행(컵은 사전 한글) · 합계 N1 · 로그(라운드 · 상태) · 집계 시작 전 칸 수", () => {
    const v = playerDetailView(
      input(
        player("kim"),
        data([
          record("kim", {
            season: [
              {
                comp: "BUNDESLIGA",
                apps: 1,
                minutes: 90,
                goals: 0,
                assists: 0,
              },
              { comp: "UCL", apps: 1, minutes: 45, goals: 0, assists: 0 },
              {
                comp: "OTHER",
                leagueRaw: "DFB Pokal",
                apps: 0,
                minutes: 0,
                goals: 0,
                assists: 0,
              },
            ],
            recent: [
              log(),
              log({
                matchId: "af-9",
                comp: "OTHER",
                leagueRaw: "DFB Pokal",
                opponent: { slug: null, name: "1. FC Magdeburg" },
                status: "bench",
                started: false,
                minutes: 0,
                result: { for: 6, against: 1 },
              }),
            ],
          }),
        ]),
      ),
    );
    expect(v.state).toBe("linked");
    expect(v.season.map((r) => r.comp)).toEqual([
      { kind: "comp", comp: "BUNDESLIGA", short: "분데스", name: "분데스리가" },
      { kind: "comp", comp: "UCL", short: "UCL", name: "UEFA 챔피언스리그" },
      { kind: "other", name: "DFB 포칼", latin: false },
    ]);
    expect(v.total).toEqual({ apps: 2, minutes: 135, goals: 0, assists: 0 });
    expect(v.minutes).toMatchObject({
      text: "135",
      tone: "on",
      unit: true,
      note: "10월 19일 이후 집계",
    });
    expect(
      v.log.map((r) => [r.round, r.appearance.label, r.opponent.name]),
    ).toEqual([
      ["8라운드", "선발", "팀-dortmund"],
      [null, "벤치", "마그데부르크"],
    ]);
    expect(v.logGap).toBe(LOG_SLOTS - 2);
    expect(v.ucl).toEqual({ apps: 1, minutes: 45 });
    expect(v.league).toMatchObject({ kind: "comp", comp: "BUNDESLIGA" });
  });

  it("기록 연결 전(id 없음 · 추적 전) — 표 · 로그 없이 N1 대시 + '기록 연결 전', 다음 경기는 싣는다", () => {
    const p = player("kim-ji-soo", { apiFootballId: null });
    const v = playerDetailView(
      input(p, data([record("kim-ji-soo", { since: null })]), {
        fixtures: [fixture("fd-2", "2026-11-08T14:00:00Z", "brighton", "away")],
      }),
    );
    expect(v.state).toBe("not-linked");
    expect(v.season).toEqual([]);
    expect(v.log).toEqual([]);
    expect(v.logGap).toBe(0);
    expect(v.minutes).toMatchObject({
      text: "–",
      tone: "null",
      note: "기록 연결 전",
    });
    expect(v.upcoming).toHaveLength(1);
    // 추적 전(id는 있으나 since null)도 같다
    const park = playerDetailView(
      input(player("park"), data([record("park", { since: null })])),
    );
    expect(park.state).toBe("not-linked");
  });

  it("기타 리그(FR-64) — 갱신 중단, 순위 · 다음 경기 없음, 대회 줄 '5대 리그 밖'", () => {
    const p = player("yang", {
      comp: "OTHER",
      active: false,
      apiFootballId: null,
    });
    const v = playerDetailView(
      input(p, data([record("yang", { since: null })]), {
        fixtures: [fixture("fd-2", "2026-11-08T14:00:00Z", "x")],
      }),
    );
    expect(v.state).toBe("other");
    expect(v.standing).toBeNull();
    expect(v.upcoming).toEqual([]);
    expect(v.minutes.note).toBe("기록 갱신 중단");
    expect(v.league).toEqual({
      kind: "other",
      name: "5대 리그 밖",
      latin: false,
    });
  });

  it("seasonMinutesOf — 0분은 윤곽, 폴백(분 null)은 대시", () => {
    expect(
      seasonMinutesOf(
        "linked",
        { apps: 0, minutes: 0, goals: 0, assists: 0 },
        "2026-10-19",
      ),
    ).toMatchObject({ text: "0", tone: "zero", unit: true });
    expect(
      seasonMinutesOf(
        "linked",
        { apps: 2, minutes: null, goals: 0, assists: null },
        "2026-10-19",
      ),
    ).toMatchObject({ text: "–", tone: "null", unit: false });
  });
});

describe("upcomingRows — 다음 경기(입장권 + 일정 행)", () => {
  const base = {
    nowMs: NOW,
    team,
    teamNameKo: () => null,
    competitionNameKo: (en: string) => (en === "DFB Pokal" ? "DFB 포칼" : null),
    roundOf: () => null,
    competitions: COMPS,
  };
  const self = team("bayern");

  it("빌드 시각 이후 예정 경기만, 킥오프 순 최대 3개 · 홈 팀 먼저", () => {
    const rows = upcomingRows(
      {
        ...base,
        fixtures: [
          fixture("old", "2026-10-31T17:30:00Z", "dortmund", "home", {
            state: "finished",
          }),
          fixture("a", "2026-11-07T14:30:00Z", "mainz", "away"),
          fixture("b", "2026-11-03T20:00:00Z", "atletico", "away"),
          fixture("c", "2026-11-21T19:30:00Z", "koln", "home"),
          fixture("d", "2026-11-29T19:30:00Z", "x", "home"),
        ],
      },
      self,
      null,
    );
    expect(rows.map((r) => r.key)).toEqual(["b", "a", "c"]);
    expect(rows[0]!.home.name).toBe("팀-atletico");
    expect(rows[0]!.away.name).toBe("팀-bayern");
  });

  it("현황 파일 next(컵)는 대회 데이터에 없을 때만 더한다 — 같은 경기(±3시간 · 같은 상대)는 한 번", () => {
    const cup = {
      matchId: "af-1",
      comp: "OTHER" as const,
      leagueRaw: "DFB Pokal",
      kickoff: "2026-11-02T19:45:00Z",
      opponent: { slug: null, name: "Karlsruher SC" },
      home: true,
    };
    const rows = upcomingRows(
      { ...base, fixtures: [fixture("a", "2026-11-07T14:30:00Z", "mainz")] },
      self,
      cup,
    );
    expect(rows.map((r) => r.key)).toEqual(["af-1", "a"]);
    expect(rows[0]!.comp).toEqual({
      kind: "other",
      name: "DFB 포칼",
      latin: false,
    });
    expect(rows[0]!.away).toMatchObject({
      name: "Karlsruher SC",
      latin: true,
      link: null,
    });
    const dup = upcomingRows(
      { ...base, fixtures: [fixture("fd-9", "2026-11-07T14:30:00Z", "mainz")] },
      self,
      {
        matchId: "fd-9",
        comp: "BUNDESLIGA",
        kickoff: "2026-11-07T14:30:00Z",
        opponent: { slug: "mainz", name: "Mainz" },
        home: true,
      },
    );
    expect(dup).toHaveLength(1);
  });
});

function card(id: string, extra: Partial<NewsCard> = {}): NewsCard {
  return {
    id,
    t: `제목 ${id}`,
    s: [],
    cat: "club",
    comp: [],
    teams: [],
    players: ["kim"],
    imp: 3,
    kr: true,
    spoiler: false,
    src: [
      {
        n: "인터풋볼",
        u: `https://example.com/${id}`,
        at: "2026-10-30T00:00:00Z",
        tier: 2,
      },
    ],
    lang: "ko",
    ai: false,
    created: "2026-10-30T00:00:00Z",
    ...extra,
  };
}

describe("playerNews — 관련 뉴스 · 이적설 · 대표팀(선수 태그, 분류로 나눔)", () => {
  const issues = [
    {
      date: "2026-11-01",
      cards: [
        card("c_0000000001"),
        card("c_0000000002", { lang: "en" }),
        card("c_0000000003", {
          cat: "transfer",
          transfer: { player: "kim", to: "arsenal", status: "rumor", tier: 3 },
          src: [
            {
              n: "A",
              u: "https://a.example/1",
              at: "2026-10-31T10:00:00Z",
              tier: 3,
            },
          ],
        }),
        card("c_0000000004", { players: ["other"] }),
      ],
    },
    {
      date: "2026-10-31",
      cards: [
        card("c_0000000001"), // 같은 카드가 앞 호에도 — 최신 호의 것만
        card("c_0000000005", { cat: "national" }),
        card("c_0000000006", {
          cat: "transfer",
          src: [
            {
              n: "B",
              u: "https://b.example/1",
              at: "2026-10-31T12:00:00Z",
              tier: 3,
            },
          ],
        }),
      ],
    },
    { date: "2026-09-01", cards: [card("c_0000000007")] }, // 기간 밖
  ];
  const v = playerNews(issues, "kim", "2026-10-03", { related: 8, side: 5 });

  it("분류별 구역 — 같은 카드는 한 구역 · 한 번, 기간 밖 호는 빼고 건수는 기간 전체", () => {
    expect(v.ko.issues.map((g) => [g.news.date, g.ids])).toEqual([
      ["2026-11-01", ["c_0000000001"]],
    ]);
    expect(v.ko.total).toBe(1);
    expect(v.en.total).toBe(1);
    // 이적설은 대표 출처 시각 최신순
    expect(v.transfer.items.map((i) => i.card.id)).toEqual([
      "c_0000000006",
      "c_0000000003",
    ]);
    expect(v.national.items.map((i) => i.card.id)).toEqual(["c_0000000005"]);
    expect(playerNewsKind({ cat: "result", lang: "en" })).toBe("related-en");
  });

  it("관련 뉴스는 최신 limit건(호별 묶음), 전체 건수는 따로", () => {
    const many = [
      {
        date: "2026-11-01",
        cards: Array.from({ length: 12 }, (_, i) =>
          card(`c_${String(i).padStart(10, "0")}`),
        ),
      },
    ];
    const w = playerNews(many, "kim", "2026-10-03", { related: 8 });
    expect(w.ko.issues[0]!.ids).toHaveLength(8);
    expect(w.ko.total).toBe(12);
  });

  it("transferTagOf — 코드가 이 선수 이적으로 판정한 최신 카드(단계 · 행선지), 없으면 null", () => {
    const tag = transferTagOf(v.transfer.items, "kim", team);
    expect(tag).toMatchObject({ status: "rumor", tier: 3 });
    expect(tag!.to!.name).toBe("팀-arsenal");
    expect(transferTagOf(v.transfer.items, "lee", team)).toBeNull();
  });
});

describe("nationalCallUpOf — 최신 소집 명단에 있을 때만", () => {
  const config: Pick<NationalTeamFile, "squads" | "matches"> = {
    matches: [
      {
        id: "2026-11-13-saudi-arabia",
        kickoff: "2026-11-13T14:30:00.000Z",
        kickoffTbd: false,
        opponent: "사우디아라비아",
        home: false,
        competition: "친선경기",
        status: "scheduled",
        result: null,
      },
    ],
    squads: [
      {
        id: "2026-10",
        announcedAt: "2026-09-20T00:00:00.000Z",
        matchIds: ["2026-11-13-saudi-arabia"],
        playerSlugs: ["old-only"],
      },
      {
        id: "2026-11",
        announcedAt: "2026-10-29T04:58:00.000Z",
        matchIds: ["2026-11-13-saudi-arabia", "missing-id"],
        playerSlugs: ["kim"],
      },
    ],
  };
  it("최신 명단 → '11월 소집' + 설정에 있는 경기만, 지난 명단만 있는 선수는 null", () => {
    const c = nationalCallUpOf(config, "kim");
    expect(c?.label).toBe("11월 소집");
    expect(c?.matches.map((m) => m.id)).toEqual(["2026-11-13-saudi-arabia"]);
    expect(nationalCallUpOf(config, "old-only")).toBeNull();
    expect(nationalCallUpOf(null, "kim")).toBeNull();
  });
});

describe("lastNightView — 홈 어젯밤 한국 선수(M3-11)", () => {
  const players = [
    player("a"),
    player("b"),
    player("c"),
    player("d", { apiFootballId: null }),
    player("e", { comp: "OTHER", active: false }),
  ];
  const day = "2026-10-31T14:30:00.000Z"; // 발행일 11-01의 창(UTC 10-31)
  const d = data([
    record("a", {
      recent: [
        log({ kickoff: day, status: "bench", started: false, minutes: 0 }),
      ],
    }),
    record("b", { recent: [log({ kickoff: day, minutes: 67, goals: 1 })] }),
    record("c", { recent: [log({ kickoff: "2026-10-30T19:30:00.000Z" })] }), // 창 밖
    record("d", { since: null, recent: [log({ kickoff: day })] }), // 연결 전
    record("e", { recent: [log({ kickoff: day })] }), // 기타 리그
  ]);
  const base = {
    players,
    data: d,
    issueDate: "2026-11-01",
    competitions: COMPS,
    team,
    teamNameKo: () => null,
    competitionNameKo: () => null,
  };

  it("창 = 발행일 − 1 UTC 하루 · 연결된 선수만 · 점수(골×3 + 도움×2 + 출전) → 분 → 설정 순", () => {
    expect(lastNightDate("2026-11-01")).toBe("2026-10-31");
    const v = lastNightView(base)!;
    expect(v.matchDate).toBe("2026-10-31");
    expect(v.rows.map((r) => r.slug)).toEqual(["b", "a"]);
    expect(v.appeared).toBe(1);
    expect(v.rows[0]!.result).toMatchObject({
      outcome: "D",
      for: 2,
      against: 2,
    });
    expect(v.rows[1]!.appearance.label).toBe("벤치");
  });

  it("창에 경기가 있던 선수가 없거나 호가 없으면 null(위젯 숨김)", () => {
    expect(lastNightView({ ...base, issueDate: "2026-10-20" })).toBeNull();
    expect(lastNightView({ ...base, data: null })).toBeNull();
  });
});
