/**
 * M5-18 Highlightly 어댑터(scripts/lib/providers/highlightly.ts, PRD §15 D80) — 네트워크·실호출 없음. 실응답 발췌(fixtures/highlightly)와
 * 합성 항목으로 검증한다.
 *
 * 필수 항목: 상태 원문 → 약어(FT·AET·PEN·미종료·경기 없음), 스코어·시각("90+2") 해석, 득점 이벤트(일반·PK·자책골 — 자책골은 라인업
 * 선수 팀의 상대 쪽, 못 찾으면 이벤트 team = 인정 팀 · VAR 취소·놓친 PK는 득점 아님 · 승부차기 보정), 교체 의미(나간 선수 player ·
 * 들어온 선수 assistingPlayerId → cameOn), 라인업 grid(행 = 줄, 칸 = 왼쪽부터)·포지션(G·D·M·F), 박스스코어 출전 시간 → 한국 선수 출전
 * 상태(start·sub·bench·absent·unknown), 로고 URL 미보존, 클라이언트(헤더·404·429 재시도·일 한도·plan 제한·호출 상한·쪽 넘김).
 */
import { describe, expect, it } from "vitest";

import type { CompId } from "@/lib/schema";

import { playerAppearance } from "../scripts/lib/match-data";
import {
  HIGHLIGHTLY_BASE_URL,
  HighlightlyError,
  createHighlightlyClient,
  hlLineupRows,
  hlPlanRestriction,
  hlPosition,
  hlStatusCode,
  hlSubstitutedIn,
  hlTeamLineup,
  isHighlightlyStageStoppingError,
  matchesListPath,
  parseHlGoalEvents,
  parseHlMinute,
  parseHlScore,
  toHlFixture,
  toHlMatchDetail,
  toHlMatchScore,
} from "../scripts/lib/providers/highlightly";

import {
  fakeHlFetch,
  hlEvent,
  hlItem,
  hlListBody,
  readHlJson,
} from "./support/highlightly-fake";

const COMP_BY_LEAGUE = new Map<number, CompId>([
  [33973, "EPL"],
  [67162, "BUNDESLIGA"],
  [2486, "UCL"],
]);
const CTX = {
  compByLeague: COMP_BY_LEAGUE,
  fetchedAt: "2026-11-17T22:12:00.000Z",
};
const MAINZ = 140348;
const BAYERN = 134391;
const LEE_JAE_SUNG = 468020;
const KIM_MIN_JAE = 466571;

const mainzBayern = (opts: { lineups?: boolean; box?: boolean } = {}) =>
  toHlMatchDetail(
    {
      match: readHlJson<unknown[]>("match-1340510451.json")[0],
      lineups:
        opts.lineups === false ? null : readHlJson("lineups-1340510451.json"),
      box:
        opts.box === false
          ? null
          : readHlJson<unknown[]>("box-score-1340510451.json"),
    },
    CTX,
  );

function finished(r: ReturnType<typeof toHlMatchDetail>) {
  if (r.kind !== "finished") throw new Error(`종료 상세가 아니다: ${r.kind}`);
  return r.detail;
}

// ─── 상태·스코어·시각 ──────────────────────────────────────────────────

describe("상태 원문 → 약어(이월·계획 규칙 공용 — api-football-plan.ts)", () => {
  it("종료 3종·미종료·경기 없음, 모르는 상태는 UNK", () => {
    expect(hlStatusCode("Finished")).toBe("FT");
    expect(hlStatusCode("Finished after extra time")).toBe("AET");
    expect(hlStatusCode("Finished after penalties")).toBe("PEN");
    expect(hlStatusCode("Not started")).toBe("NS");
    expect(hlStatusCode("Second half")).toBe("2H");
    expect(hlStatusCode("Half time")).toBe("HT");
    expect(hlStatusCode("Penalties")).toBe("P");
    expect(hlStatusCode("Postponed")).toBe("PST");
    expect(hlStatusCode("Cancelled")).toBe("CANC");
    expect(hlStatusCode("Abandoned")).toBe("ABD");
    expect(hlStatusCode("Awarded")).toBe("AWD");
    expect(hlStatusCode("Suspended")).toBe("SUSP");
    expect(hlStatusCode("  finished  ")).toBe("FT");
    expect(hlStatusCode("Something new")).toBe("UNK");
  });

  it('스코어 "1 - 2" · 시각 "14" · "90+2" · "45 + 5\'"', () => {
    expect(parseHlScore("1 - 2")).toEqual({ home: 1, away: 2 });
    expect(parseHlScore("10-0")).toEqual({ home: 10, away: 0 });
    expect(parseHlScore(null)).toBeNull();
    expect(parseHlScore("1 : 2")).toBeNull();
    expect(parseHlMinute("14")).toEqual({ minute: 14, extra: null });
    expect(parseHlMinute("90+2")).toEqual({ minute: 90, extra: 2 });
    expect(parseHlMinute("45 + 5'")).toEqual({ minute: 45, extra: 5 });
    expect(parseHlMinute("HT")).toBeNull();
  });

  it("공통 스코어 규칙 — FT는 90분 = 최종, AET·PEN은 90분 모름, PEN은 승부차기 스코어 필수", () => {
    const s = { home: 1, away: 1 };
    expect(toHlMatchScore("FT", s, null)).toMatchObject({
      ft: s,
      regular: s,
      pens: null,
      duration: "REGULAR",
    });
    expect(toHlMatchScore("AET", s, null)).toMatchObject({
      ft: s,
      regular: null,
      duration: "EXTRA_TIME",
    });
    expect(toHlMatchScore("PEN", s, "4 - 3")).toMatchObject({
      ft: s,
      pens: { home: 4, away: 3 },
      duration: "PENALTY_SHOOTOUT",
    });
    expect(toHlMatchScore("PEN", s, null)).toBeNull();
    // 승부차기 경기의 current에 승부차기 골이 섞였는지 모른다 — 비긴 스코어가 아니면 쓰지 않는다
    expect(toHlMatchScore("PEN", { home: 5, away: 4 }, "4 - 3")).toBeNull();
    expect(toHlMatchScore("FT", null, null)).toBeNull();
    expect(toHlMatchScore("2H", s, null)).toBeNull();
  });
});

// ─── 목록 ────────────────────────────────────────────────────────────────

describe("목록 항목 → 내부 형식(toHlFixture)", () => {
  it("실측 목록 — 킥오프 UTC `Z`, 상태 약어, 스코어, 로고 없음", () => {
    const list = readHlJson<{ data: unknown[] }>("matches-epl-2026-10-31.json");
    const fixtures = list.data.map(toHlFixture);
    expect(fixtures.every((f) => f !== null)).toBe(true);
    const brentford = fixtures.find((f) => f?.matchId === 1325389883)!;
    expect(brentford).toEqual({
      matchId: 1325389883,
      leagueId: 33973,
      leagueName: "Premier League",
      season: 2026,
      round: "Regular Season - 9",
      kickoff: "2026-10-31T15:00:00.000Z",
      status: "FT",
      home: { id: 47589, name: "Brentford" },
      away: { id: 56099, name: "Nottingham Forest" },
      goals: { home: 2, away: 0 },
    });
    expect(JSON.stringify(fixtures)).not.toMatch(/logo|https?:/);
  });

  it("leagueName 함정 — 'Bundesliga' 이름 조회에 오스트리아 리그(186302)가 섞인다 → 대회는 id로 거른다", () => {
    const list = readHlJson<{ data: unknown[] }>(
      "matches-bundesliga-name-2026-11-07.json",
    );
    const fixtures = list.data.map(toHlFixture).filter((f) => f !== null);
    const leagues = new Set(fixtures.map((f) => f!.leagueId));
    expect([...leagues].sort((a, b) => a - b)).toEqual([67162, 186302]);
    expect(
      fixtures.filter((f) => COMP_BY_LEAGUE.has(f!.leagueId)),
    ).toHaveLength(5);
  });

  it("시작 전 경기는 스코어 없음(null), 형식이 틀리면 null", () => {
    const ns = toHlFixture(
      hlItem({
        id: 1,
        leagueId: 33973,
        date: "2026-11-21T15:00:00.000Z",
        home: [1, "A"],
        away: [2, "B"],
        description: "Not started",
        score: null,
      }),
    );
    expect(ns).toMatchObject({ status: "NS", goals: null });
    expect(toHlFixture({ id: 1 })).toBeNull();
    expect(toHlFixture(null)).toBeNull();
  });
});

// ─── 득점·교체 ───────────────────────────────────────────────────────────

describe("득점 이벤트 해석 — 마인츠 1–2 바이에른(1340510451) 실측", () => {
  it("득점 3건(시간 순, 추가 시간 90+2) · VAR 취소(이재성 44분)는 득점이 아니다 · 도움 · goalsComplete", () => {
    const d = finished(mainzBayern());
    expect(d.provider).toBe("highlightly");
    expect(d.comp).toBe("BUNDESLIGA");
    expect(d.status).toBe("FT");
    expect(d.score.ft).toEqual({ home: 1, away: 2 });
    expect(
      d.goals.map((g) => [
        g.minute,
        g.extra,
        g.side,
        g.kind,
        g.scorer.id,
        g.assist?.id ?? null,
      ]),
    ).toEqual([
      [14, null, "away", "normal", 80976, 29778],
      [57, null, "away", "normal", 79555245, 29778],
      [90, 2, "home", "normal", 4213685, 26234460],
    ]);
    expect(d.goals.some((g) => g.scorer.id === LEE_JAE_SUNG)).toBe(false);
    expect(d.goalsComplete).toBe(true);
  });

  it("교체 이벤트: player = 나간 선수, assistingPlayerId = 들어온 선수(이재성 63분 → 네벨)", () => {
    const events = readHlJson<Array<{ events: unknown[] }>>(
      "match-1340510451.json",
    )[0]!.events;
    const cameOn = hlSubstitutedIn(events);
    expect(cameOn.has(32640650)).toBe(true); // 네벨(들어옴)
    expect(cameOn.has(LEE_JAE_SUNG)).toBe(false); // 이재성(나감)
    expect(cameOn.size).toBe(10);
  });
});

describe("자책골 — 브렌트퍼드 2–0 포리스트(1325389883) 실측: 이벤트 team = 득점 인정 팀", () => {
  const raw = () => readHlJson<unknown[]>("match-1325389883.json")[0];

  it("라인업으로 선수 팀(포리스트)을 찾아 그 상대(홈 브렌트퍼드) 득점 · 도움 없음", () => {
    const d = finished(
      toHlMatchDetail(
        {
          match: raw(),
          lineups: readHlJson("lineups-1325389883.json"),
          box: null,
        },
        CTX,
      ),
    );
    const og = d.goals.find((g) => g.kind === "own-goal")!;
    expect(og).toMatchObject({
      minute: 30,
      side: "home",
      scorer: { id: 453691, name: "Nikola Milenković" },
      assist: null,
    });
    expect(d.goalsComplete).toBe(true);
  });

  it("라인업이 없으면 이벤트 team(인정 팀 — 실측)으로 정한다 — 결과는 같다", () => {
    const d = finished(
      toHlMatchDetail({ match: raw(), lineups: null, box: null }, CTX),
    );
    expect(d.goals.map((g) => [g.side, g.kind])).toEqual([
      ["home", "own-goal"],
      ["home", "normal"],
    ]);
    expect(d.goalsComplete).toBe(true);
  });

  it("라인업이 있으면 라인업이 이긴다(이벤트 team과 어긋나도 선수 팀의 상대 쪽)", () => {
    const parsed = parseHlGoalEvents(
      [hlEvent({ team: 1, time: "30", type: "Own Goal", playerId: 9 })],
      {
        homeId: 1,
        awayId: 2,
        sideOfPlayer: (id) => (id === 9 ? "home" : null),
      },
    );
    expect(parsed.goals[0]!.side).toBe("away");
  });
});

describe("득점 종류·불완전 판정(합성)", () => {
  const ctx = { homeId: 1, awayId: 2, sideOfPlayer: () => null };

  it("PK 성공은 penalty, 놓친 PK·VAR·카드·교체는 득점 아님", () => {
    const parsed = parseHlGoalEvents(
      [
        hlEvent({
          team: 1,
          time: "10",
          type: "Penalty",
          playerId: 5,
          player: "A",
        }),
        hlEvent({ team: 2, time: "20", type: "Missed Penalty", playerId: 6 }),
        hlEvent({
          team: 2,
          time: "30",
          type: "VAR Goal Cancelled",
          playerId: 6,
        }),
        hlEvent({
          team: 2,
          time: "31",
          type: "VAR Goal Confirmed",
          playerId: 6,
        }),
        hlEvent({ team: 1, time: "40", type: "Yellow Card", playerId: 7 }),
        hlEvent({
          team: 1,
          time: "50",
          type: "Substitution",
          playerId: 7,
          assistingPlayerId: 8,
        }),
      ],
      ctx,
    );
    expect(parsed.goals).toEqual([
      {
        minute: 10,
        extra: null,
        side: "home",
        kind: "penalty",
        scorer: { id: 5, name: "A" },
        assist: null,
      },
    ]);
    expect(parsed.unresolved).toBe(0);
  });

  it("VAR 취소 — 앞선 같은 선수 득점이 남아 오면 지운다 · 앞선 득점이 없으면 그대로 · 선수 id가 없으면 unresolved", () => {
    const parsed = parseHlGoalEvents(
      [
        hlEvent({
          team: 1,
          time: "10",
          type: "Goal",
          playerId: 5,
          player: "A",
        }),
        hlEvent({
          team: 1,
          time: "30",
          type: "Goal",
          playerId: 5,
          player: "A",
        }),
        hlEvent({
          team: 1,
          time: "31",
          type: "VAR Goal Cancelled",
          playerId: 5,
        }),
        hlEvent({
          team: 2,
          time: "40",
          type: "Goal",
          playerId: 6,
          player: "B",
        }),
        hlEvent({
          team: 1,
          time: "44",
          type: "VAR Goal Cancelled",
          playerId: 7,
        }),
      ],
      ctx,
    );
    expect(parsed.goals.map((g) => [g.scorer.id, g.minute])).toEqual([
      [5, 10],
      [6, 40],
    ]);
    expect(parsed.unresolved).toBe(0);
    const noId = parseHlGoalEvents(
      [
        hlEvent({
          team: 1,
          time: "31",
          type: "VAR Goal Cancelled",
          playerId: null,
        }),
      ],
      ctx,
    );
    expect(noId.unresolved).toBe(1);
  });

  it("팀을 모르거나 선수 이름이 없거나 시각을 못 읽는 득점은 unresolved", () => {
    const parsed = parseHlGoalEvents(
      [
        hlEvent({ team: 99, time: "10", type: "Goal" }),
        hlEvent({ team: 1, time: "20", type: "Goal", player: null }),
        hlEvent({ team: 1, time: "?", type: "Goal" }),
        { type: "Goal" },
      ],
      ctx,
    );
    expect(parsed.goals).toEqual([]);
    expect(parsed.unresolved).toBe(4);
  });

  it("승부차기 경기 — 120분 이후 PK 이벤트가 섞여 스코어와 다르면 빼고 맞춘다(맞지 않으면 불완전)", () => {
    const match = {
      ...hlItem({
        id: 77,
        leagueId: 2486,
        date: "2026-11-04T20:00:00.000Z",
        home: [1, "A"],
        away: [2, "B"],
        description: "Finished after penalties",
        score: "1 - 1",
        penalties: "4 - 3",
      }),
      events: [
        hlEvent({ team: 1, time: "30", type: "Goal", playerId: 11 }),
        hlEvent({ team: 2, time: "88", type: "Goal", playerId: 21 }),
        hlEvent({ team: 1, time: "120", type: "Penalty", playerId: 12 }),
        hlEvent({ team: 2, time: "120", type: "Penalty", playerId: 22 }),
      ],
    };
    const d = finished(
      toHlMatchDetail({ match, lineups: null, box: null }, CTX),
    );
    expect(d.status).toBe("PEN");
    expect(d.score.pens).toEqual({ home: 4, away: 3 });
    expect(d.goals).toHaveLength(2);
    expect(d.goalsComplete).toBe(true);
    const extra = {
      ...match,
      events: [
        ...match.events,
        hlEvent({ team: 1, time: "60", type: "Goal", playerId: 13 }),
      ],
    };
    expect(
      finished(toHlMatchDetail({ match: extra, lineups: null, box: null }, CTX))
        .goalsComplete,
    ).toBe(false);
  });

  it("미종료·경기 없음은 not-finished(머리만), 스코어 없는 종료는 invalid", () => {
    const base = {
      id: 5,
      leagueId: 33973,
      date: "2026-11-17T20:00:00.000Z",
      home: [1, "A"] as [number, string],
      away: [2, "B"] as [number, string],
    };
    expect(
      toHlMatchDetail(
        {
          match: hlItem({ ...base, description: "Second half" }),
          lineups: null,
          box: null,
        },
        CTX,
      ),
    ).toMatchObject({ kind: "not-finished", fixture: { status: "2H" } });
    expect(
      toHlMatchDetail(
        {
          match: hlItem({ ...base, description: "Postponed", score: null }),
          lineups: null,
          box: null,
        },
        CTX,
      ),
    ).toMatchObject({ kind: "not-finished", fixture: { status: "PST" } });
    expect(
      toHlMatchDetail(
        { match: hlItem({ ...base, score: null }), lineups: null, box: null },
        CTX,
      ).kind,
    ).toBe("invalid");
    expect(
      toHlMatchDetail({ match: {}, lineups: null, box: null }, CTX).kind,
    ).toBe("invalid");
  });
});

// ─── 라인업·출전 ─────────────────────────────────────────────────────────

describe("라인업 → grid·포지션(팀시트 — 칸 1 = 왼쪽, 1:1 골키퍼)", () => {
  it("마인츠 3-5-2: 골키퍼 1:1 · 수비 2:1~2:3 · 미드 3:1~3:5(이재성 3:4) · 공격 4:1~4:2, 출전 시간은 박스스코어", () => {
    const home = finished(mainzBayern()).lineups.home!;
    expect(home.formation).toBe("3-5-2");
    expect(home.startXI).toHaveLength(11);
    expect(home.startXI.map((p) => p.grid)).toEqual([
      "1:1",
      "2:1",
      "2:2",
      "2:3",
      "3:1",
      "3:2",
      "3:3",
      "3:4",
      "3:5",
      "4:1",
      "4:2",
    ]);
    expect(home.startXI[0]).toMatchObject({
      pos: "G",
      number: 27,
      minutes: 90,
    });
    expect(home.startXI.find((p) => p.id === LEE_JAE_SUNG)).toMatchObject({
      grid: "3:4",
      pos: "M",
      number: 7,
      minutes: 63,
    });
    expect(home.substitutes.every((p) => p.grid === null)).toBe(true);
    expect(JSON.stringify(home)).not.toMatch(/logo|https?:/);
  });

  it("행 안 순서 = 왼쪽 → 오른쪽(브렌트퍼드 4백 Lewis-Potter 2:1 … Kayode 2:4 — 실측)", () => {
    const d = finished(
      toHlMatchDetail(
        {
          match: readHlJson<unknown[]>("match-1325389883.json")[0],
          lineups: readHlJson("lineups-1325389883.json"),
          box: null,
        },
        CTX,
      ),
    );
    const back = d.lineups.home!.startXI.filter((p) =>
      p.grid?.startsWith("2:"),
    );
    expect(back.map((p) => `${p.grid} ${p.name}`)).toEqual([
      "2:1 K. Lewis-Potter",
      "2:2 K. Ajer",
      "2:3 S. van den Berg",
      "2:4 M. Kayode",
    ]);
  });

  it("평평한 initialLineup은 포메이션 숫자대로 나누고, 합이 안 맞으면 grid 없음", () => {
    const players = Array.from({ length: 11 }, (_, i) => ({
      id: i + 1,
      name: `P${i + 1}`,
      number: i + 1,
      position: i === 0 ? "Goalkeeper" : "Defender",
    }));
    const split = hlLineupRows(players, "4-4-2");
    expect(split.gridded).toBe(true);
    expect(split.rows.map((r) => r.length)).toEqual([1, 4, 4, 2]);
    expect(hlLineupRows(players, "4-4-3").gridded).toBe(false);
    expect(hlPosition("Attacker")).toBe("F");
    expect(hlPosition("Forward")).toBe("F");
    expect(hlPosition("Coach")).toBeNull();
  });

  it("라인업 응답 없이 박스스코어만 — 선발(isSubstitute false)·교체 명단, 포메이션·grid 없음", () => {
    const d = finished(mainzBayern({ lineups: false }));
    expect(d.lineups.home!.formation).toBeNull();
    expect(d.lineups.home!.startXI).toHaveLength(11);
    expect(d.lineups.home!.startXI.every((p) => p.grid === null)).toBe(true);
    expect(
      d.lineups.away!.substitutes.find((p) => p.id === KIM_MIN_JAE),
    ).toMatchObject({
      minutes: 0,
      number: 3,
      pos: "D",
    });
  });

  it("박스스코어 없이 라인업만 — 출전 시간 null, 교체로 들어온 선수는 cameOn", () => {
    const team = hlTeamLineup({
      lineup: {
        formation: "4-4-2",
        initialLineup: [
          [{ id: 1, name: "GK", number: 1, position: "Goalkeeper" }],
        ],
        substitutes: [
          { id: 20, name: "Sub In", number: 20, position: "Forward" },
          { id: 21, name: "Sub Bench", number: 21, position: "Forward" },
        ],
      },
      box: null,
      cameOn: new Set([20]),
    })!;
    expect(team.startXI[0]).toMatchObject({ minutes: null, grid: "1:1" });
    expect(
      team.substitutes.map((p) => [p.id, p.minutes, p.cameOn ?? false]),
    ).toEqual([
      [20, null, true],
      [21, null, false],
    ]);
  });
  it("박스스코어가 있어도 교체 이벤트로 들어온 선수의 0분은 모름(null) — 90+n분 투입(박스스코어는 90 − 투입 분)", () => {
    const lineup = {
      formation: "4-4-2",
      initialLineup: [
        [{ id: 1, name: "GK", number: 1, position: "Goalkeeper" }],
      ],
      substitutes: [
        { id: 20, name: "Late Sub", number: 20, position: "Forward" },
        { id: 21, name: "Bench", number: 21, position: "Forward" },
      ],
    };
    const box = {
      players: [
        { id: 1, name: "GK", isSubstitute: false, minutesPlayed: 90 },
        { id: 20, name: "Late Sub", isSubstitute: true, minutesPlayed: 0 },
        { id: 21, name: "Bench", isSubstitute: true, minutesPlayed: 0 },
      ],
    };
    const withLineup = hlTeamLineup({ lineup, box, cameOn: new Set([20]) })!;
    expect(
      withLineup.substitutes.map((p) => [p.id, p.minutes, p.cameOn ?? false]),
    ).toEqual([
      [20, null, true],
      [21, 0, false],
    ]);
    const boxOnly = hlTeamLineup({ lineup: null, box, cameOn: new Set([20]) })!;
    expect(
      boxOnly.substitutes.map((p) => [p.id, p.minutes, p.cameOn ?? false]),
    ).toEqual([
      [20, null, true],
      [21, 0, false],
    ]);
    const detail = {
      home: { id: 1, name: "H", fullName: null },
      away: { id: 2, name: "A", fullName: null },
      lineups: { home: withLineup, away: null },
      goals: [],
    };
    expect(playerAppearance(detail, 20, 1)).toMatchObject({
      status: "sub",
      minutes: null,
    });
    expect(playerAppearance(detail, 21, 1)).toMatchObject({
      status: "bench",
      minutes: 0,
    });
  });
});

describe("박스스코어 출전 시간 → 한국 선수 출전 상태(start·sub·bench·absent·unknown)", () => {
  it("이재성 선발 63분 · 김민재 교체 명단 0분 = 벤치(실측)", () => {
    const d = finished(mainzBayern());
    expect(playerAppearance(d, LEE_JAE_SUNG, MAINZ)).toEqual({
      side: "home",
      status: "start",
      minutes: 63,
      goals: 0,
      assists: 0,
    });
    expect(playerAppearance(d, KIM_MIN_JAE, BAYERN)).toEqual({
      side: "away",
      status: "bench",
      minutes: 0,
      goals: 0,
      assists: 0,
    });
  });

  it("교체 출전 = 박스스코어 분 > 0(네벨 27분) · 박스스코어 없으면 교체 이벤트(cameOn)로 sub, 분은 null", () => {
    expect(
      playerAppearance(finished(mainzBayern()), 32640650, MAINZ),
    ).toMatchObject({
      status: "sub",
      minutes: 27,
    });
    expect(
      playerAppearance(finished(mainzBayern({ box: false })), 32640650, MAINZ),
    ).toMatchObject({ status: "sub", minutes: null });
    expect(
      playerAppearance(
        finished(mainzBayern({ box: false })),
        KIM_MIN_JAE,
        BAYERN,
      ),
    ).toMatchObject({ status: "bench", minutes: null });
  });

  it("명단에 없으면 absent(그 팀 라인업 있음), 라인업·박스스코어 모두 없으면 unknown", () => {
    expect(playerAppearance(finished(mainzBayern()), 1, MAINZ)).toMatchObject({
      status: "absent",
      minutes: null,
    });
    expect(
      playerAppearance(
        finished(mainzBayern({ lineups: false, box: false })),
        LEE_JAE_SUNG,
        MAINZ,
      ),
    ).toMatchObject({ status: "unknown", minutes: null });
  });
});

// ─── 클라이언트 ──────────────────────────────────────────────────────────

const clock = () => {
  let t = 1_000_000;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    get t() {
      return t;
    },
  };
};

describe("클라이언트 — 헤더·경로·간격·오류 분류", () => {
  it("x-rapidapi-key 헤더(RapidAPI 호스트 헤더 없음) · 목록 경로 date·timezone·leagueId·limit·offset · 응답 뒤 3초 간격", async () => {
    const c = clock();
    const sleeps: number[] = [];
    const { fetch, calls } = fakeHlFetch((p) =>
      p.startsWith("/matches?") ? { body: hlListBody([]) } : null,
    );
    const client = createHighlightlyClient({
      apiKey: "test-key",
      fetch,
      now: c.now,
      sleep: async (ms) => {
        sleeps.push(ms);
        await c.sleep(ms);
      },
    });
    await client.listMatches({ date: "2026-11-07", leagueId: 67162 });
    await client.listMatches({ date: "2026-11-07", leagueId: 33973 });
    expect(calls.map((x) => x.path)).toEqual([
      "/matches?date=2026-11-07&timezone=UTC&leagueId=67162&limit=100&offset=0",
      "/matches?date=2026-11-07&timezone=UTC&leagueId=33973&limit=100&offset=0",
    ]);
    expect(calls[0]!.headers["x-rapidapi-key"]).toBe("test-key");
    expect(Object.keys(calls[0]!.headers)).not.toContain("x-rapidapi-host");
    expect(sleeps).toEqual([3000]);
    expect(client.calls).toBe(2);
    expect(client.rate).toEqual({ dayRemaining: 50, dayLimit: 100 });
    expect(() => matchesListPath({})).toThrow(HighlightlyError);
    expect(() => matchesListPath({ date: "2026/11/07" })).toThrow(/날짜/);
  });

  it("목록 404는 0경기가 아니라 api 오류(경로·API 변경을 조용히 넘기지 않는다)", async () => {
    const { fetch } = fakeHlFetch(() => null);
    const c = clock();
    const client = createHighlightlyClient({
      apiKey: "k",
      fetch,
      now: c.now,
      sleep: c.sleep,
    });
    await expect(
      client.listMatches({ date: "2026-11-07", leagueId: 67162 }),
    ).rejects.toMatchObject({ kind: "api", status: 404 });
  });

  it("상세는 배열 첫 원소(객체도 받는다) · 404는 null(라인업·박스스코어 없음)", async () => {
    const { fetch } = fakeHlFetch((p) =>
      p === "/matches/1"
        ? { body: [{ id: 1 }] }
        : p === "/matches/2"
          ? { body: { id: 2 } }
          : p === "/box-score/3"
            ? { body: [{ team: { id: 1 }, players: [] }] }
            : null,
    );
    const c = clock();
    const client = createHighlightlyClient({
      apiKey: "k",
      fetch,
      now: c.now,
      sleep: c.sleep,
    });
    expect(await client.getMatch(1)).toEqual({ id: 1 });
    expect(await client.getMatch(2)).toEqual({ id: 2 });
    expect(await client.getLineups(9)).toBeNull();
    expect(await client.getBoxScore(9)).toBeNull();
    expect(await client.getBoxScore(3)).toHaveLength(1);
  });

  it("429는 61초 뒤 1회 재시도 — 연속 2회면 단계 멈춤 오류(rate)", async () => {
    const c = clock();
    const { fetch, calls } = fakeHlFetch(() => ({
      status: 429,
      body: { message: "Too many" },
    }));
    const client = createHighlightlyClient({
      apiKey: "k",
      fetch,
      now: c.now,
      sleep: c.sleep,
    });
    const error = await client.getMatch(1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HighlightlyError);
    expect((error as HighlightlyError).kind).toBe("rate");
    expect((error as HighlightlyError).rateStreak).toBe(2);
    expect(isHighlightlyStageStoppingError(error as HighlightlyError)).toBe(
      true,
    );
    expect(calls).toHaveLength(2);
    expect(client.retries).toBe(1);
  });

  it("429 + 일 남은 수 0은 일 한도(quota) — 재시도하지 않고, 남은 수 0을 본 뒤에는 보내지 않는다", async () => {
    const c = clock();
    let n = 0;
    const { fetch, calls } = fakeHlFetch(() => {
      n += 1;
      return n === 1
        ? {
            body: [{ id: 1 }],
            headers: { "x-ratelimit-requests-remaining": "0" },
          }
        : { status: 429, headers: { "x-ratelimit-requests-remaining": "0" } };
    });
    const client = createHighlightlyClient({
      apiKey: "k",
      fetch,
      now: c.now,
      sleep: c.sleep,
    });
    await client.getMatch(1);
    const error = await client.getMatch(2).catch((e: unknown) => e);
    expect((error as HighlightlyError).kind).toBe("quota");
    expect(calls).toHaveLength(1);
  });

  it("401·403은 auth, 400은 api(재시도 없음), 5xx는 10초 뒤 재시도", async () => {
    const c = clock();
    for (const [status, kind, sent] of [
      [401, "auth", 1],
      [403, "auth", 1],
      [400, "api", 1],
      [500, "http", 2],
    ] as const) {
      const { fetch, calls } = fakeHlFetch(() => ({
        status,
        body: { message: "x" },
      }));
      const client = createHighlightlyClient({
        apiKey: "k",
        fetch,
        now: c.now,
        sleep: c.sleep,
      });
      const error = await client.getMatch(1).catch((e: unknown) => e);
      expect([status, (error as HighlightlyError).kind]).toEqual([
        status,
        kind,
      ]);
      expect(calls).toHaveLength(sent);
    }
  });

  it("목록 plan.message가 제한을 알리면 plan(FR-65 강등 — 단계 멈춤), 정상 문구는 통과", async () => {
    expect(
      hlPlanRestriction({
        tier: "BASIC",
        message: "All data available with current plan.",
      }),
    ).toBeNull();
    expect(hlPlanRestriction(null)).toBeNull();
    expect(hlPlanRestriction({ message: "Upgrade to access this date" })).toBe(
      "Upgrade to access this date",
    );
    const c = clock();
    const { fetch } = fakeHlFetch(() => ({
      body: hlListBody([], "Limited data — upgrade your plan"),
    }));
    const client = createHighlightlyClient({
      apiKey: "k",
      fetch,
      now: c.now,
      sleep: c.sleep,
    });
    const error = await client
      .listMatches({ date: "2026-11-07", leagueId: 1 })
      .catch((e: unknown) => e);
    expect((error as HighlightlyError).kind).toBe("plan");
    expect(isHighlightlyStageStoppingError(error as HighlightlyError)).toBe(
      true,
    );
  });

  it("우리 쪽 호출 상한(maxCalls)에 닿으면 cap — 보내지 않는다", async () => {
    const c = clock();
    const { fetch, calls } = fakeHlFetch(() => ({ body: [{ id: 1 }] }));
    const client = createHighlightlyClient({
      apiKey: "k",
      fetch,
      now: c.now,
      sleep: c.sleep,
      maxCalls: 1,
    });
    await client.getMatch(1);
    const error = await client.getMatch(2).catch((e: unknown) => e);
    expect((error as HighlightlyError).kind).toBe("cap");
    expect(calls).toHaveLength(1);
  });

  it("목록이 한 쪽(100)을 넘으면 offset으로 다음 쪽 — 전체 수에 닿으면 멈춘다", async () => {
    const c = clock();
    const page = (n: number, offset: number) =>
      Array.from({ length: n }, (_, i) =>
        hlItem({
          id: offset + i + 1,
          leagueId: 102053,
          date: "2026-08-01T15:00:00.000Z",
          home: [1, "A"],
          away: [2, "B"],
        }),
      );
    const { fetch, calls } = fakeHlFetch((p) => {
      const offset = Number(/offset=(\d+)/.exec(p)![1]);
      const data = offset === 0 ? page(100, 0) : page(32, 100);
      return {
        body: {
          data,
          plan: {
            tier: "BASIC",
            message: "All data available with current plan.",
          },
          pagination: { totalCount: 132, offset, limit: 100 },
        },
      };
    });
    const client = createHighlightlyClient({
      apiKey: "k",
      fetch,
      now: c.now,
      sleep: c.sleep,
    });
    const items = await client.listMatches({ leagueId: 102053, season: 2026 });
    expect(items).toHaveLength(132);
    expect(calls.map((x) => /offset=(\d+)/.exec(x.path)![1])).toEqual([
      "0",
      "100",
    ]);
  });

  it("키가 비어 있으면 만들지 않는다 · 요청 URL은 직접 접근 base", () => {
    expect(() =>
      createHighlightlyClient({
        apiKey: " ",
        fetch: async () => new Response(""),
      }),
    ).toThrow(/HIGHLIGHTLY_API_KEY/);
    expect(HIGHLIGHTLY_BASE_URL).toBe("https://soccer.highlightly.net");
  });
});
