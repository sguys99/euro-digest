/**
 * M2-02 football-data → 대회 파일 조각 변환 (scripts/lib/providers/football-data-competition.ts) — 네트워크 없음.
 *
 * 필수 항목: 변환(순위·경기·득점), 상태 매핑, UTC 킥오프(서머타임 경계 전후 그대로), 동순위 구간, 미등록 팀 건너뛰기,
 * 킥오프 미확정 판정(SCHEDULED·기본 슬롯·마지막 라운드 예외), UCL 녹아웃 라운드·차전, 도움·PK null 유지.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  MatchSchema,
  ScorerSchema,
  StandingRowSchema,
  TeamIdsFileSchema,
  type CompetitionConfig,
} from "@/lib/schema";

import { FootballDataError } from "../scripts/lib/providers/football-data";
import {
  isKnockoutRound,
  matchStatusOf,
  scoreOf,
  toCompetitionMatches,
  toCompetitionScorers,
  toStandingRows,
  type FdTeamLookup,
} from "../scripts/lib/providers/football-data-competition";
import { buildTeamIdIndex } from "../scripts/lib/team-ids";

import { readFdFixture } from "./support/football-data-fake";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const COMPETITIONS: CompetitionConfig[] = CompetitionsFileSchema.parse(
  JSON.parse(
    readFileSync(path.join(ROOT, "configs/competitions.json"), "utf8"),
  ),
);
const comp = (id: string) => COMPETITIONS.find((c) => c.id === id)!;
const TEAMS = buildTeamIdIndex(
  TeamIdsFileSchema.parse(
    JSON.parse(readFileSync(path.join(ROOT, "configs/team-ids.json"), "utf8")),
  ),
);
const fd = (name: string): unknown => JSON.parse(readFdFixture(name));

/** 대응표에서 fd id 몇 개를 뺀 조회 */
function without(...ids: number[]): FdTeamLookup {
  const byFd = new Map(TEAMS.byFd);
  for (const id of ids) byFd.delete(id);
  return { byFd };
}

/** 최소 경기 원문(시즌 경기 응답 항목) */
function rawMatch(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 990001,
    utcDate: "2026-11-07T15:00:00Z",
    status: "TIMED",
    matchday: 11,
    stage: "REGULAR_SEASON",
    competition: { code: "PL" },
    homeTeam: { id: 57, name: "Arsenal FC", shortName: "Arsenal" },
    awayTeam: { id: 61, name: "Chelsea FC", shortName: "Chelsea" },
    score: {
      duration: "REGULAR",
      fullTime: { home: null, away: null },
      halfTime: { home: null, away: null },
    },
    ...over,
  };
}

const envelope = (matches: unknown[], season: unknown = 2026) => ({
  filters: { season },
  matches,
});

// ─── 순위 ────────────────────────────────────────────────────────────────

describe("toStandingRows — 순위 → StandingRow", () => {
  it("라리가 동순위(19위 2팀)는 같은 구간(강등)이고 응답 순서를 지킨다", () => {
    const { rows, unknownTeams } = toStandingRows(
      fd("standings-pd-2026-10-11.json"),
      comp("LALIGA"),
      TEAMS,
    );
    expect(rows).toHaveLength(20);
    expect(unknownTeams).toEqual([]);
    const tail = rows.slice(-2);
    expect(tail.map((r) => [r.pos, r.team, r.zone])).toEqual([
      [19, "malaga", "relegation"],
      [19, "valencia", "relegation"],
    ]);
    expect(rows.find((r) => r.pos === 17)?.zone).toBe("none");
    expect(rows.find((r) => r.pos === 18)?.zone).toBe("relegation");
    for (const r of rows) expect(StandingRowSchema.parse(r)).toEqual(r);
  });

  it("prevPos null·form []로 둔다(M2-03이 채운다)", () => {
    const { rows } = toStandingRows(
      fd("standings-pl-2026-10-11.json"),
      comp("EPL"),
      TEAMS,
    );
    expect(rows[0]).toMatchObject({
      pos: 1,
      prevPos: null,
      form: [],
      team: "manchester-city",
    });
  });

  it("UCL 리그 페이즈 36팀 — 16강 직행·PO·구간 밖", () => {
    const { rows } = toStandingRows(
      fd("standings-cl-2026-10-10.json"),
      comp("UCL"),
      TEAMS,
    );
    expect(rows).toHaveLength(36);
    const zones = rows.map((r) => r.zone);
    expect(zones.filter((z) => z === "knockout")).toHaveLength(8);
    expect(zones.filter((z) => z === "playoff").length).toBeGreaterThanOrEqual(
      16,
    );
    expect(rows.at(-1)?.zone).toBe("none");
  });

  it("대응표에 없는 팀은 그 행만 건너뛰고 후보로 돌려준다", () => {
    const { rows, unknownTeams } = toStandingRows(
      fd("standings-pd-2026-10-11.json"),
      comp("LALIGA"),
      without(95),
    );
    expect(rows).toHaveLength(19);
    expect(rows.some((r) => r.team === "valencia")).toBe(false);
    expect(unknownTeams).toEqual([{ fd: 95, name: "Valencia CF" }]);
  });

  it("시즌이 설정과 다르면 던진다(그 조각만 이전 값 유지)", () => {
    expect(() =>
      toStandingRows(
        fd("standings-pl-2026-10-11.json"),
        { ...comp("EPL"), season: 2027 },
        TEAMS,
      ),
    ).toThrow(FootballDataError);
  });

  it("표가 둘 이상이면 던진다(단일 표만 지원)", () => {
    const raw = fd("standings-pl-2026-10-11.json") as {
      standings: unknown[];
    };
    const doubled = { ...raw, standings: [...raw.standings, ...raw.standings] };
    expect(() => toStandingRows(doubled, comp("EPL"), TEAMS)).toThrow(/2개/);
  });
});

// ─── 경기 상태 ───────────────────────────────────────────────────────────

describe("matchStatusOf — 상태 매핑 표", () => {
  it.each([
    ["SCHEDULED", "scheduled", true],
    ["TIMED", "scheduled", true],
    ["IN_PLAY", "scheduled", true],
    ["PAUSED", "scheduled", true],
    ["EXTRA_TIME", "scheduled", true],
    ["PENALTY_SHOOTOUT", "scheduled", true],
    ["FINISHED", "finished", true],
    ["AWARDED", "finished", true],
    ["POSTPONED", "postponed", true],
    ["SUSPENDED", "postponed", true],
    ["CANCELLED", "postponed", true],
    ["2026-12-02 20:00:00Z", "scheduled", false],
    ["", "scheduled", false],
  ])("%s → %s", (raw, status, known) => {
    expect(matchStatusOf(raw)).toEqual({ status, known });
  });
});

// ─── 경기 ────────────────────────────────────────────────────────────────

describe("toCompetitionMatches — 실제 fixture", () => {
  it("라리가: SCHEDULED는 날짜만(provisional date), 취소는 postponed·score null, 종료는 스코어", () => {
    const conv = toCompetitionMatches(
      fd("season-pd-2026-10-30.json"),
      comp("LALIGA"),
      TEAMS,
    );
    expect(conv.matches).toHaveLength(23);
    expect(conv.skipped).toEqual({
      invalid: 0,
      otherComp: 0,
      tbd: 0,
      unknownTeam: 0,
      unknownStage: 0,
    });
    for (const m of conv.matches) expect(MatchSchema.parse(m)).toEqual(m);
    const cancelled = conv.matches.find((m) => m.id === "fd-564698");
    expect(cancelled).toMatchObject({
      status: "postponed",
      score: null,
      round: "8",
    });
    const md14 = conv.matches.filter((m) => m.round === "14");
    expect(md14).toHaveLength(10);
    for (const m of md14) {
      expect(m.status).toBe("scheduled");
      expect(m.kickoff).toBe("2026-11-29T00:00:00Z");
      expect(conv.provisional.get(m.id)).toBe("date");
      expect(m.tbc).toBe(true);
    }
    // 11라운드는 시각이 서로 다른 TIMED — 확정
    for (const m of conv.matches.filter((x) => x.round === "11")) {
      expect(conv.provisional.has(m.id)).toBe(false);
      expect("tbc" in m).toBe(false);
    }
    const finished = conv.matches.filter((m) => m.status === "finished");
    expect(finished.length).toBeGreaterThan(0);
    for (const m of finished) expect(m.score).not.toBeNull();
  });

  it("EPL: 상태값 이상은 scheduled + 로그, 21라운드 기본 슬롯은 provisional time, 마지막 38라운드는 확정", () => {
    const conv = toCompetitionMatches(
      fd("season-pl-2026-10-30.json"),
      comp("EPL"),
      TEAMS,
    );
    expect(conv.matches).toHaveLength(30);
    expect(conv.unknownStatusCount).toBe(10);
    expect(conv.unknownStatuses).toContain("2026-12-02 20:00:00Z");
    const byRound = (r: string) => conv.matches.filter((m) => m.round === r);
    for (const m of byRound("13")) {
      expect(m.status).toBe("scheduled");
      expect(conv.provisional.has(m.id)).toBe(false);
      expect("tbc" in m).toBe(false);
    }
    for (const m of byRound("21")) {
      expect(conv.provisional.get(m.id)).toBe("time");
      expect(m.tbc).toBe(true);
    }
    for (const m of byRound("38")) {
      expect(conv.provisional.has(m.id)).toBe(false);
      expect("tbc" in m).toBe(false);
    }
  });

  it("UCL 리그 페이즈: 라운드는 matchday 숫자, 녹아웃 아님", () => {
    const conv = toCompetitionMatches(
      fd("season-cl-md1.json"),
      comp("UCL"),
      TEAMS,
    );
    expect(conv.matches).toHaveLength(18);
    expect(new Set(conv.matches.map((m) => m.round))).toEqual(new Set(["1"]));
    expect(conv.matches.some((m) => isKnockoutRound(m.round))).toBe(false);
    expect(conv.matches[0]).toMatchObject({
      id: "fd-575323",
      comp: "UCL",
      home: "club-brugge",
      away: "aston-villa",
      score: { h: 2, a: 3 },
      status: "finished",
    });
  });

  it("킥오프·id 순으로 정렬한다", () => {
    const conv = toCompetitionMatches(
      fd("season-pd-2026-10-30.json"),
      comp("LALIGA"),
      TEAMS,
    );
    const keys = conv.matches.map((m) => [Date.parse(m.kickoff), m.id]);
    const sorted = [...keys].sort(
      (a, b) =>
        (a[0] as number) - (b[0] as number) ||
        Number(String(a[1]).slice(3)) - Number(String(b[1]).slice(3)),
    );
    expect(keys).toEqual(sorted);
  });
});

describe("toCompetitionMatches — 경계 사례", () => {
  const EPL = comp("EPL");

  it("진행 중 경기는 scheduled·score null, 진행 중 수를 센다", () => {
    const conv = toCompetitionMatches(
      envelope([
        rawMatch({
          status: "IN_PLAY",
          score: { duration: "REGULAR", fullTime: { home: 1, away: 0 } },
        }),
      ]),
      EPL,
      TEAMS,
    );
    expect(conv.matches[0]).toMatchObject({ status: "scheduled", score: null });
    expect(conv.inProgress).toBe(1);
  });

  it("승부차기 경기 스코어는 승부차기 골을 뺀 값, AWARDED는 종료", () => {
    const conv = toCompetitionMatches(
      envelope([
        rawMatch({
          id: 1,
          status: "FINISHED",
          score: {
            duration: "PENALTY_SHOOTOUT",
            fullTime: { home: 5, away: 4 },
            regularTime: { home: 1, away: 1 },
            extraTime: { home: 0, away: 0 },
            penalties: { home: 4, away: 3 },
          },
        }),
        rawMatch({
          id: 2,
          utcDate: "2026-11-08T15:00:00Z",
          status: "AWARDED",
          score: { duration: "REGULAR", fullTime: { home: 3, away: 0 } },
        }),
      ]),
      EPL,
      TEAMS,
    );
    expect(conv.matches.map((m) => [m.status, m.score])).toEqual([
      ["finished", { h: 1, a: 1, pens: { h: 4, a: 3 }, aet: true }],
      ["finished", { h: 3, a: 0 }],
    ]);
  });

  it("연장 종료는 aet만, 정규 종료는 pens·aet 키 없음 (scoreOf — M1-44 toMatchScore 규칙)", () => {
    expect(
      scoreOf({
        score: {
          duration: "EXTRA_TIME",
          fullTime: { home: 2, away: 1 },
          regularTime: { home: 1, away: 1 },
          extraTime: { home: 1, away: 0 },
        },
      }),
    ).toEqual({ h: 2, a: 1, aet: true });
    expect(
      scoreOf({
        score: { duration: "REGULAR", fullTime: { home: 0, away: 2 } },
      }),
    ).toEqual({ h: 0, a: 2 });
    // 승부차기 경기인데 penalties가 없으면 정규·연장 스코어를 알 수 없다 → null
    expect(
      scoreOf({
        score: {
          duration: "PENALTY_SHOOTOUT",
          fullTime: { home: 5, away: 4 },
        },
      }),
    ).toBeNull();
  });

  it("FINISHED인데 스코어가 없으면 score null + scoreMissing", () => {
    const conv = toCompetitionMatches(
      envelope([rawMatch({ status: "FINISHED" })]),
      EPL,
      TEAMS,
    );
    expect(conv.matches[0]).toMatchObject({ status: "finished", score: null });
    expect(conv.scoreMissing).toBe(1);
  });

  it("연기·중단·취소는 postponed — 채워진 0:0을 버린다", () => {
    const filled = { duration: "REGULAR", fullTime: { home: 0, away: 0 } };
    const conv = toCompetitionMatches(
      envelope(
        ["POSTPONED", "SUSPENDED", "CANCELLED"].map((status, i) =>
          rawMatch({ id: 10 + i, status, score: filled }),
        ),
      ),
      EPL,
      TEAMS,
    );
    for (const m of conv.matches) {
      expect(m).toMatchObject({ status: "postponed", score: null });
    }
  });

  it("킥오프는 UTC Z 그대로 — 유럽 서머타임 종료(2026-10-25) 전후로 바꾸지 않는다", () => {
    const conv = toCompetitionMatches(
      envelope([
        rawMatch({ id: 21, utcDate: "2026-10-24T14:00:00Z" }),
        rawMatch({ id: 22, utcDate: "2026-10-25T15:00:00Z" }),
      ]),
      EPL,
      TEAMS,
    );
    expect(conv.matches.map((m) => m.kickoff)).toEqual([
      "2026-10-24T14:00:00Z",
      "2026-10-25T15:00:00Z",
    ]);
  });

  it("오프셋 시각·matchday 없는 리그 경기·형식 오류는 invalid로 건너뛴다", () => {
    const conv = toCompetitionMatches(
      envelope([
        rawMatch({ id: 31, utcDate: "2026-11-07T15:00:00+00:00" }),
        rawMatch({ id: 32, matchday: null }),
        { id: "x" },
        rawMatch({ id: 33 }),
      ]),
      EPL,
      TEAMS,
    );
    expect(conv.skipped.invalid).toBe(3);
    expect(conv.matches.map((m) => m.id)).toEqual(["fd-33"]);
  });

  it("미등록 팀 경기는 건너뛰고 후보로, 다른 대회 코드는 otherComp", () => {
    const conv = toCompetitionMatches(
      envelope([
        rawMatch({
          id: 41,
          homeTeam: { id: 999999, name: "Nowhere FC", shortName: "Nowhere" },
        }),
        rawMatch({ id: 42, competition: { code: "ELC" } }),
      ]),
      EPL,
      TEAMS,
    );
    expect(conv.matches).toEqual([]);
    expect(conv.skipped).toMatchObject({ unknownTeam: 1, otherComp: 1 });
    expect(conv.unknownTeams).toEqual([{ fd: 999999, name: "Nowhere FC" }]);
  });

  it("시즌이 설정과 다르거나 껍데기가 틀리면 던진다", () => {
    expect(() =>
      toCompetitionMatches(envelope([], "2025"), EPL, TEAMS),
    ).toThrow(/시즌/);
    expect(() => toCompetitionMatches({ nope: [] }, EPL, TEAMS)).toThrow(
      FootballDataError,
    );
  });

  it("같은 킥오프 라운드라도 경기가 3개 미만이면 자리값으로 보지 않는다", () => {
    const conv = toCompetitionMatches(
      envelope([
        rawMatch({ id: 51, matchday: 20 }),
        rawMatch({
          id: 52,
          matchday: 20,
          homeTeam: { id: 65, name: "Manchester City FC" },
          awayTeam: { id: 66, name: "Manchester United FC" },
        }),
        rawMatch({ id: 53, matchday: 38, utcDate: "2027-05-30T15:00:00Z" }),
      ]),
      EPL,
      TEAMS,
    );
    expect(conv.provisional.size).toBe(0);
  });
});

describe("toCompetitionMatches — UCL 녹아웃 (M2-12가 쓰는 라운드 표기)", () => {
  const UCL = comp("UCL");
  const ko = (
    id: number,
    stage: string,
    utcDate: string,
    home: number,
    away: number,
  ) =>
    rawMatch({
      id,
      stage,
      matchday: null,
      utcDate,
      competition: { code: "CL" },
      homeTeam: { id: home, name: `T${home}` },
      awayTeam: { id: away, name: `T${away}` },
    });

  it("차전은 같은 단계·같은 두 팀의 킥오프 순, 결승은 단판", () => {
    const conv = toCompetitionMatches(
      envelope([
        ko(2, "LAST_16", "2027-03-17T20:00:00Z", 5, 86), // 2차전(홈·원정 바뀜)
        ko(1, "LAST_16", "2027-03-10T20:00:00Z", 86, 5),
        ko(3, "PLAYOFFS", "2027-02-17T20:00:00Z", 64, 524),
        ko(4, "FINAL", "2027-06-05T19:00:00Z", 81, 5),
      ]),
      UCL,
      TEAMS,
    );
    expect(conv.matches.map((m) => [m.id, m.round])).toEqual([
      ["fd-3", "ko-playoff-1"],
      ["fd-1", "ko-r16-1"],
      ["fd-2", "ko-r16-2"],
      ["fd-4", "ko-final"],
    ]);
    expect(conv.matches.every((m) => isKnockoutRound(m.round))).toBe(true);
  });

  it("대진 미정(팀 id null)은 tbd, 모르는 단계는 unknownStage로 건너뛴다", () => {
    const conv = toCompetitionMatches(
      envelope([
        rawMatch({
          id: 61,
          stage: "QUARTER_FINALS",
          matchday: null,
          competition: { code: "CL" },
          homeTeam: { id: null, name: null },
          awayTeam: { id: null, name: null },
        }),
        rawMatch({
          id: 62,
          stage: "QUALIFICATION_ROUND_3",
          matchday: null,
          competition: { code: "CL" },
        }),
      ]),
      UCL,
      TEAMS,
    );
    expect(conv.matches).toEqual([]);
    expect(conv.skipped).toMatchObject({ tbd: 1, unknownStage: 1 });
  });
});

// ─── 득점 순위 ───────────────────────────────────────────────────────────

describe("toCompetitionScorers — 득점 순위 → Scorer", () => {
  it("도움·PK null은 null 그대로(0으로 바꾸지 않는다), 골 내림차순", () => {
    const { scorers, invalid, unknownTeams } = toCompetitionScorers(
      fd("scorers-pl-2026-10-10.json"),
      comp("EPL"),
      TEAMS,
    );
    expect(invalid).toBe(0);
    expect(unknownTeams).toEqual([]);
    expect(scorers).toHaveLength(10);
    expect(scorers[0]).toEqual({
      player: "Erling Haaland",
      team: "manchester-city",
      goals: 5,
      assists: null,
      penalties: null,
      played: 5,
    });
    for (const s of scorers) expect(ScorerSchema.parse(s)).toEqual(s);
    const goals = scorers.map((s) => s.goals);
    expect(goals).toEqual([...goals].sort((a, b) => b - a));
  });

  it("6개 대회 fixture가 모두 변환된다", () => {
    for (const [id, file] of [
      ["EPL", "scorers-pl-2026-10-10.json"],
      ["LALIGA", "scorers-pd-2026-10-10.json"],
      ["SERIEA", "scorers-sa-2026-10-10.json"],
      ["BUNDESLIGA", "scorers-bl1-2026-10-10.json"],
      ["LIGUE1", "scorers-fl1-2026-10-10.json"],
      ["UCL", "scorers-cl-2026-10-10.json"],
    ] as const) {
      const conv = toCompetitionScorers(fd(file), comp(id), TEAMS);
      expect(conv.scorers.length + conv.unknownTeam, id).toBe(10);
    }
  });

  it("미등록 팀 소속 선수는 건너뛰고 후보로", () => {
    const conv = toCompetitionScorers(
      fd("scorers-pl-2026-10-10.json"),
      comp("EPL"),
      without(65),
    );
    expect(conv.scorers.some((s) => s.team === "manchester-city")).toBe(false);
    expect(conv.unknownTeam).toBeGreaterThan(0);
    expect(conv.unknownTeams.map((t) => t.fd)).toEqual([65]);
  });

  it("값이 있으면 그대로, 골이 없으면 invalid", () => {
    const raw = {
      filters: { season: "2026" },
      competition: { code: "PL" },
      scorers: [
        {
          player: { id: 1, name: " Bukayo Saka " },
          team: { id: 57, name: "Arsenal FC" },
          playedMatches: 9,
          goals: 4,
          assists: 0,
          penalties: 1,
        },
        {
          player: { id: 2, name: "No Goals" },
          team: { id: 57 },
          goals: null,
        },
      ],
    };
    const conv = toCompetitionScorers(raw, comp("EPL"), TEAMS);
    expect(conv.scorers).toEqual([
      {
        player: "Bukayo Saka",
        team: "arsenal",
        goals: 4,
        assists: 0,
        penalties: 1,
        played: 9,
      },
    ]);
    expect(conv.invalid).toBe(1);
  });

  it("대회·시즌이 다르면 던진다", () => {
    const raw = fd("scorers-pl-2026-10-10.json");
    expect(() => toCompetitionScorers(raw, comp("LALIGA"), TEAMS)).toThrow(
      /대회가 다르다/,
    );
    expect(() =>
      toCompetitionScorers(raw, { ...comp("EPL"), season: 2025 }, TEAMS),
    ).toThrow(/시즌/);
  });
});
