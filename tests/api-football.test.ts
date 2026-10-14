/**
 * M1-48 API-Football 경기 단건 어댑터 (scripts/lib/providers/api-football.ts) — 네트워크 없음, fixtures/football 원본 응답만.
 *
 * 필수 항목: 응답 경계 zod(정상 `errors: []` · errors 객체 · errors.plan · HTTP 200 오류 · 누락 필드), 시각 `+00:00` → `Z`,
 * 로고·사진 URL 버림, 선발 = startXI(games.substitute 무시), 골·도움 = events(goals.total 무시 · Missed Penalty·VAR 취소 제외),
 * 자책골 = 상대 팀 득점(라인업으로 선수 팀 판정), 승부차기 분리(score.penalty — football-data와 반대),
 * 한국 선수 = apiFootballId 매칭(이름 아님), 호출 정책(동시 1개 · 응답 후 6.5초 · 분당 10회 이하 · 5xx·타임아웃 10초 뒤 1회 ·
 * 연결 오류는 날짜 조회만 · 429·rateLimit 61초 · 호출 상한 · 단계 예산 · 취소).
 */
import { describe, expect, it } from "vitest";

import { playerAppearance, type MatchDetail } from "../scripts/lib/match-data";
import {
  AfEnvelopeSchema,
  afErrorsToError,
  afKickoffToUtc,
  API_FOOTBALL_BASE_URL,
  API_FOOTBALL_MIN_INTERVAL_MS,
  API_FOOTBALL_RATE_LIMIT_WAIT_MS,
  API_FOOTBALL_RATE_STOP_STREAK,
  API_FOOTBALL_RETRY_DELAY_MS,
  API_FOOTBALL_TIMEOUT_MS,
  ApiFootballError,
  createApiFootballClient,
  fixtureByIdPath,
  fixturesByDatePath,
  goalsMatchScore,
  isRetryableApiFootballError,
  isStageStoppingError,
  matchDetailToPairing,
  parseGoalEvents,
  readAfRateHeaders,
  toAfFixture,
  toAfMatchScore,
  toMatchDetail,
  type ApiFootballClientOptions,
} from "../scripts/lib/providers/api-football";
import type { FetchLike } from "../scripts/lib/rss";

import {
  AF_DATE_ITEMS,
  afEnvelope,
  afFixtureResponse,
  readAfFixture,
  readAfJson,
} from "./support/api-football-fake";

const COMP_BY_LEAGUE = new Map([
  [39, "EPL"],
  [140, "LALIGA"],
  [135, "SERIEA"],
  [78, "BUNDESLIGA"],
  [61, "LIGUE1"],
  [2, "UCL"],
] as const);
const FETCHED_AT = "2026-10-11T06:50:00.000Z";

interface Env {
  response: Array<Record<string, unknown>>;
}
const firstItem = (file: string) => readAfJson<Env>(file).response[0]!;

function detailOf(file: string): MatchDetail {
  const r = toMatchDetail(firstItem(file), {
    compByLeague: COMP_BY_LEAGUE,
    fetchedAt: FETCHED_AT,
  });
  if (r.kind !== "finished") throw new Error(`종료 경기가 아니다: ${r.kind}`);
  return r.detail;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ─── 시계·가짜 fetch ─────────────────────────────────────────────────────

interface CallLog {
  url: string;
  /** 요청 시작(가상 시각) */
  at: number;
  /** 응답 끝(가상 시각) */
  end: number;
  headers: Record<string, string>;
}

/**
 * 가상 시계 + 가짜 fetch. handler가 응답(또는 던짐)을 정한다. 요청마다 `latencyMs`만큼 시각이 흐른다.
 * AbortSignal.timeout은 실제 시간이라 가상 시계로는 터지지 않는다 — 타임아웃은 TimeoutError를 던지는 handler로 흉내 낸다.
 */
function harness(
  handler: (url: string, n: number) => Response | Promise<Response>,
  latencyMs = 500,
) {
  let t = 1_000_000;
  const calls: CallLog[] = [];
  const sleeps: number[] = [];
  const fetch: FetchLike = async (url, init) => {
    const entry: CallLog = {
      url,
      at: t,
      end: t,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(entry);
    try {
      return await handler(url, calls.length);
    } finally {
      t += latencyMs;
      entry.end = t;
    }
  };
  const options = (
    over: Partial<ApiFootballClientOptions> = {},
  ): ApiFootballClientOptions => ({
    apiKey: "test-api-football-key",
    fetch,
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    ...over,
  });
  return {
    calls,
    sleeps,
    options,
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

const ok = (body: unknown = []) =>
  new Response(afEnvelope(body), { status: 200 });

function timeoutError(): Error {
  const e = new Error("The operation was aborted due to timeout");
  e.name = "TimeoutError";
  return e;
}

// ─── 응답 경계 ───────────────────────────────────────────────────────────

describe("응답 경계 — errors 먼저(HTTP 200 오류), 껍데기", () => {
  it("정상 errors [] · 빈 객체는 오류가 아니다", () => {
    expect(afErrorsToError([], "x")).toBeNull();
    expect(afErrorsToError({}, "x")).toBeNull();
  });

  it("errors 객체 키로 종류를 정한다 — plan · rateLimit · requests · 그 밖(api)", () => {
    const plan = readAfJson<{ errors: Record<string, string> }>(
      "errors-plan-date.json",
    ).errors;
    const e = afErrorsToError(plan, "날짜 조회")!;
    expect(e.kind).toBe("plan");
    expect(e.errorKeys).toEqual(["plan"]);
    expect(e.status).toBe(200);
    expect(e.message).toContain("Free plans do not have access to this date");
    expect(afErrorsToError({ rateLimit: "Too many" }, "x")?.kind).toBe("rate");
    expect(afErrorsToError({ requests: "limit" }, "x")?.kind).toBe("quota");
    const search = readAfJson<{ errors: Record<string, string> }>(
      "errors-search.json",
    ).errors;
    expect(afErrorsToError(search, "x")?.kind).toBe("api");
    expect(afErrorsToError(["something"], "x")?.kind).toBe("api");
  });

  it("errors 문구는 가리고 자른다(비밀값 모양·긴 본문을 남기지 않는다)", () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const e = afErrorsToError(
      { token: `bad key ${secret} ${"x".repeat(500)}` },
      "x",
    )!;
    expect(e.message).not.toContain(secret);
    expect(e.message.length).toBeLessThan(300);
  });

  it("껍데기 스키마: errors·response가 없으면 실패", () => {
    expect(AfEnvelopeSchema.safeParse({ response: [] }).success).toBe(false);
    expect(AfEnvelopeSchema.safeParse({ errors: [] }).success).toBe(false);
    expect(
      AfEnvelopeSchema.safeParse({ errors: [], response: {} }).success,
    ).toBe(true); // response 모양은 엔드포인트별로 호출부가 확인(배열)
    expect(
      AfEnvelopeSchema.safeParse(readAfJson("errors-plan-season.json")).success,
    ).toBe(true);
  });

  it("레이트 헤더(분·일) — 숫자가 아니면 null", () => {
    const h = new Headers({
      "x-ratelimit-remaining": "3",
      "x-ratelimit-requests-remaining": "87",
      "x-ratelimit-requests-limit": "100",
    });
    expect(readAfRateHeaders(h)).toEqual({
      minuteRemaining: 3,
      dayRemaining: 87,
      dayLimit: 100,
    });
    expect(
      readAfRateHeaders(new Headers({ "x-ratelimit-remaining": "?" })),
    ).toEqual({ minuteRemaining: null, dayRemaining: null, dayLimit: null });
  });

  it("경로: 날짜·id 형식을 확인하고 키를 넣지 않는다", () => {
    expect(fixturesByDatePath("2026-10-10")).toBe("/fixtures?date=2026-10-10");
    expect(fixtureByIdPath(1575180)).toBe("/fixtures?id=1575180");
    expect(() => fixturesByDatePath("2026-10-10&season=2026")).toThrow(
      ApiFootballError,
    );
    expect(() => fixtureByIdPath(0)).toThrow(ApiFootballError);
  });
});

// ─── 경기 목록 항목 ──────────────────────────────────────────────────────

describe("toAfFixture — 경기 목록 항목(날짜 조회)", () => {
  const items = readAfJson<Env>("fixtures-date-2026-10-10.json").response;

  it("36개 모두 파싱 — 시각 +00:00 → Z, 로고 키 없음", () => {
    const fixtures = items.map(toAfFixture);
    expect(fixtures.every((f) => f !== null)).toBe(true);
    for (const f of fixtures) {
      expect(f!.kickoff).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
      expect(JSON.stringify(f)).not.toMatch(/logo|flag|photo/);
    }
    expect(afKickoffToUtc("2026-10-10T11:30:00+00:00")).toBe(
      "2026-10-10T11:30:00.000Z",
    );
    expect(afKickoffToUtc("not a date")).toBeNull();
  });

  it("상태별 goals: 종료는 스코어, 시작 전·취소는 null, 승부차기 경기는 승부차기 골 제외", () => {
    const byId = new Map(
      items.map((i) => {
        const f = toAfFixture(i)!;
        return [f.matchId, f] as const;
      }),
    );
    expect(byId.get(1557417)).toMatchObject({
      leagueId: 39,
      status: "FT",
      home: { id: 42, name: "Arsenal" },
      goals: { home: 2, away: 1 },
    });
    expect(byId.get(1640026)?.goals).toBeNull(); // NS
    expect(byId.get(1621360)?.goals).toBeNull(); // CANC
    // 1639860 PEN — goals 1-1(승부차기 4-3은 score.penalty)
    expect(byId.get(1639860)).toMatchObject({
      status: "PEN",
      goals: { home: 1, away: 1 },
    });
  });

  it("누락 필드(팀 id·이름·킥오프·상태) → null", () => {
    const base = clone(items[5]!) as {
      teams: { home: { id: unknown; name: unknown } };
      fixture: { date: unknown; status: { short: unknown } };
    };
    expect(toAfFixture(base)).not.toBeNull();
    const noId = clone(base);
    noId.teams.home.id = null;
    expect(toAfFixture(noId)).toBeNull();
    const noName = clone(base);
    noName.teams.home.name = "";
    expect(toAfFixture(noName)).toBeNull();
    const badDate = clone(base);
    badDate.fixture.date = "yesterday";
    expect(toAfFixture(badDate)).toBeNull();
    const noStatus = clone(base);
    noStatus.fixture.status.short = "";
    expect(toAfFixture(noStatus)).toBeNull();
    expect(toAfFixture(null)).toBeNull();
    expect(toAfFixture({ fixture: {} })).toBeNull();
  });
});

// ─── 경기 상세 ───────────────────────────────────────────────────────────

describe("toMatchDetail — 경기 단건(이벤트·라인업·선수 기록)", () => {
  it("1575180 아우크스부르크 2-2 바이에른: VAR 취소 골 제외, 포메이션, 로고·사진 URL 버림", () => {
    const d = detailOf("fixtures-id-1575180.json");
    expect(d).toMatchObject({
      provider: "api-football",
      matchId: 1575180,
      leagueId: 78,
      leagueName: "Bundesliga",
      comp: "BUNDESLIGA",
      season: 2026,
      round: "Regular Season - 5",
      kickoff: "2026-10-10T13:30:00.000Z",
      status: "FT",
      home: { id: 170, name: "FC Augsburg", fullName: null },
      away: { id: 157, name: "Bayern München", fullName: null },
      score: {
        ft: { home: 2, away: 2 },
        ht: { home: 1, away: 0 },
        regular: { home: 2, away: 2 },
        pens: null,
        duration: "REGULAR",
      },
      goalsComplete: true,
      fetchedAt: FETCHED_AT,
    });
    expect(d.goals).toHaveLength(4);
    expect(d.goals[0]).toEqual({
      minute: 1,
      extra: null,
      side: "home",
      kind: "normal",
      scorer: { id: 143831, name: "Robin Fellhauer" },
      assist: null,
    });
    // 51분 Var/Goal cancelled(루이스 디아스)는 골이 아니다
    expect(
      d.goals.some((g) => g.scorer.name === "Luis Díaz" && g.minute === 51),
    ).toBe(false);
    expect(d.lineups.home?.formation).toBe("3-4-2-1");
    expect(d.lineups.away?.formation).toBe("4-2-3-1");
    expect(d.lineups.home?.startXI).toHaveLength(11);
    // 자리값 이미지 URL(logo-key-kept 파일)이 내부 형식에 남지 않는다
    const json = JSON.stringify(d);
    expect(json).not.toContain("example.invalid");
    expect(json).not.toMatch(/"(logo|photo|flag)"/);
  });

  it("1575167 바이에른 7-0: goals.total null이어도 events로 7골, 39분 PK", () => {
    const d = detailOf("fixtures-id-1575167.json");
    expect(d.score.ft).toEqual({ home: 7, away: 0 });
    expect(d.goals).toHaveLength(7);
    expect(d.goals.every((g) => g.side === "home")).toBe(true);
    expect(d.goals.filter((g) => g.kind === "penalty")).toEqual([
      expect.objectContaining({ minute: 39, kind: "penalty" }),
    ]);
    expect(d.goalsComplete).toBe(true);
    // 시간 순
    const minutes = d.goals.map((g) => g.minute);
    expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
  });

  it("1570403: 45+6분 PK는 minute 45·extra 6, 1552780: Missed Penalty는 골이 아니다", () => {
    const d = detailOf("fixtures-id-1570403.json");
    expect(d.goals).toContainEqual(
      expect.objectContaining({ minute: 45, extra: 6, kind: "penalty" }),
    );
    expect(goalsMatchScore(d.goals, d.score.ft)).toBe(true);
    const missed = detailOf("fixtures-id-1552780.json");
    expect(missed.score.ft).toEqual({ home: 3, away: 1 });
    expect(missed.goals).toHaveLength(4);
    expect(missed.goalsComplete).toBe(true);
  });

  it("8개 경기 단건 fixture 모두 events 득점 수가 스코어와 맞는다", () => {
    for (const id of [
      1552780, 1557418, 1570403, 1575167, 1575177, 1575180, 1575181, 1575182,
    ]) {
      const d = detailOf(`fixtures-id-${id}.json`);
      expect([id, d.goalsComplete]).toEqual([id, true]);
    }
  });

  it("종료가 아니면 not-finished(머리만), 스코어를 만들 수 없으면 invalid, 머리 형식 오류도 invalid", () => {
    const int = toMatchDetail(AF_DATE_ITEMS.get(1570410), {
      compByLeague: COMP_BY_LEAGUE,
      fetchedAt: FETCHED_AT,
    });
    expect(int).toMatchObject({
      kind: "not-finished",
      fixture: { matchId: 1570410, status: "INT" },
    });
    const pen = clone(AF_DATE_ITEMS.get(1639860)!) as {
      score: { penalty: unknown };
    };
    pen.score.penalty = { home: null, away: null };
    expect(
      toMatchDetail(pen, {
        compByLeague: COMP_BY_LEAGUE,
        fetchedAt: FETCHED_AT,
      }).kind,
    ).toBe("invalid");
    expect(
      toMatchDetail(
        { fixture: { id: 1 } },
        {
          compByLeague: COMP_BY_LEAGUE,
          fetchedAt: FETCHED_AT,
        },
      ).kind,
    ).toBe("invalid");
  });

  it("events·lineups가 없는 단건(커버리지 없음) — 0-0이 아니면 득점 불완전, 라인업 null", () => {
    const item = { ...AF_DATE_ITEMS.get(1557417)!, events: [], lineups: [] };
    const r = toMatchDetail(item, {
      compByLeague: COMP_BY_LEAGUE,
      fetchedAt: FETCHED_AT,
    });
    if (r.kind !== "finished") throw new Error("unreachable");
    expect(r.detail.goals).toEqual([]);
    expect(r.detail.goalsComplete).toBe(false); // 2-1인데 득점 이벤트 0
    expect(r.detail.lineups).toEqual({ home: null, away: null });
  });

  it("6개 대회 밖 경기는 comp null(한국 선수 소속팀 기타 대회) — 짝짓기 입력에서 빠진다", () => {
    const item = clone(firstItem("fixtures-id-1575180.json")) as {
      league: { id: number; name: string };
    };
    item.league = { ...item.league, id: 81, name: "DFB Pokal" };
    const r = toMatchDetail(item, {
      compByLeague: COMP_BY_LEAGUE,
      fetchedAt: FETCHED_AT,
    });
    if (r.kind !== "finished") throw new Error("unreachable");
    expect(r.detail.comp).toBeNull();
    expect(r.detail.leagueId).toBe(81);
    expect(matchDetailToPairing(r.detail)).toBeNull();
    expect(matchDetailToPairing(detailOf("fixtures-id-1575180.json"))).toEqual({
      matchId: 1575180,
      comp: "BUNDESLIGA",
      kickoff: "2026-10-10T13:30:00.000Z",
      home: { id: 170, name: "FC Augsburg" },
      away: { id: 157, name: "Bayern München" },
      ft: { home: 2, away: 2 },
    });
  });
});

describe("스코어 규칙 — 연장·승부차기(API-Football: 승부차기 골은 score.penalty에만)", () => {
  it("FT: regular = ft, AET: regular = score.fulltime, PEN: pens 분리", () => {
    expect(toAfMatchScore("FT", { home: 2, away: 1 }, null)).toMatchObject({
      ft: { home: 2, away: 1 },
      regular: { home: 2, away: 1 },
      pens: null,
      duration: "REGULAR",
    });
    expect(
      toAfMatchScore(
        "AET",
        { home: 2, away: 1 },
        {
          fulltime: { home: 1, away: 1 },
          extratime: { home: 1, away: 0 },
          halftime: { home: 0, away: 1 },
        },
      ),
    ).toEqual({
      ft: { home: 2, away: 1 },
      ht: { home: 0, away: 1 },
      regular: { home: 1, away: 1 },
      pens: null,
      duration: "EXTRA_TIME",
    });
    // 1639860 실측 모양: goals 1-1, fulltime 0-0, extratime 1-1, penalty 4-3
    const pen = AF_DATE_ITEMS.get(1639860)! as {
      score: Parameters<typeof toAfMatchScore>[2];
    };
    expect(toAfMatchScore("PEN", { home: 1, away: 1 }, pen.score)).toEqual({
      ft: { home: 1, away: 1 },
      ht: { home: 0, away: 0 },
      regular: { home: 0, away: 0 },
      pens: { home: 4, away: 3 },
      duration: "PENALTY_SHOOTOUT",
    });
    expect(toAfMatchScore("PEN", { home: 1, away: 1 }, null)).toBeNull();
    expect(toAfMatchScore("FT", null, null)).toBeNull();
    expect(toAfMatchScore("NS", { home: 0, away: 0 }, null)).toBeNull();
  });

  it("승부차기 킥 이벤트(comments Penalty Shootout)는 경기 중 득점이 아니다", () => {
    const lineups = { home: null, away: null };
    const ev = (over: Record<string, unknown>) => ({
      time: { elapsed: 120, extra: null },
      team: { id: 1 },
      player: { id: 10, name: "A" },
      assist: { id: null, name: null },
      type: "Goal",
      detail: "Penalty",
      comments: "Penalty Shootout",
      ...over,
    });
    const parsed = parseGoalEvents(
      [
        ev({
          time: { elapsed: 95, extra: null },
          detail: "Normal Goal",
          comments: null,
        }),
        ev({}),
        ev({ team: { id: 2 }, player: { id: 20, name: "B" } }),
        ev({ detail: "Missed Penalty" }),
      ],
      { homeId: 1, awayId: 2, lineups },
    );
    expect(parsed.unresolved).toBe(0);
    expect(parsed.goals).toEqual([
      {
        minute: 95,
        extra: null,
        side: "home",
        kind: "normal",
        scorer: { id: 10, name: "A" },
        assist: null,
      },
    ]);
  });
});

describe("M1-48 보강 fixture(실응답) — 승부차기 이벤트·자책골·미종료 재조회·한국 선수", () => {
  it("1639860 Australia Cup 결승(PEN): 승부차기 킥 10건(comments Penalty Shootout)은 빼고 연장 득점 2건만, pens 4-3 분리", () => {
    const d = detailOf("fixtures-id-1639860.json");
    expect(d).toMatchObject({
      status: "PEN",
      comp: null,
      leagueId: 874,
      score: {
        ft: { home: 1, away: 1 },
        regular: { home: 0, away: 0 },
        pens: { home: 4, away: 3 },
        duration: "PENALTY_SHOOTOUT",
      },
      goalsComplete: true,
      lineups: { home: null, away: null }, // 커버리지 없는 대회 — 빈 배열
    });
    expect(d.goals.map((g) => [g.minute, g.side, g.scorer.name])).toEqual([
      [95, "away", "D. Genreau"],
      [117, "home", "M. Mikkola"],
    ]);
    expect(d.goals[0]!.assist).toEqual({ id: 416998, name: "J. Inserra" });
  });

  it("1552779 니스 2-1 스트라스부르: 자책골 이벤트 team은 득점 인정 팀(84)이지만 선수(라인업 95)의 상대 쪽으로 센다 — 결과 같음", () => {
    const d = detailOf("fixtures-id-1552779.json");
    expect(d.goals).toEqual([
      expect.objectContaining({ minute: 41, side: "away", kind: "normal" }),
      {
        minute: 45,
        extra: null,
        side: "home",
        kind: "own-goal",
        scorer: { id: 339417, name: "P. Demba" },
        assist: null,
      },
      expect.objectContaining({ minute: 81, side: "home", kind: "normal" }),
    ]);
    expect(d.goalsComplete).toBe(true);
    expect(playerAppearance(d, 339417)?.goals).toBe(0); // 자책골은 그 선수의 골이 아니다
  });

  it("1570410 재조회: INT → ABD(경기 중단) — not-finished(머리만), 이월에서 뺄 상태", () => {
    const r = toMatchDetail(firstItem("fixtures-id-1570410.json"), {
      compByLeague: COMP_BY_LEAGUE,
      fetchedAt: FETCHED_AT,
    });
    expect(r).toMatchObject({
      kind: "not-finished",
      fixture: { matchId: 1570410, status: "ABD", goals: { home: 0, away: 0 } },
    });
  });

  it("1575183 카스트로프(280358) 명단 제외(absent) · 1575179 황희찬(24888) 교체 11분", () => {
    expect(
      playerAppearance(detailOf("fixtures-id-1575183.json"), 280358, 163),
    ).toMatchObject({ side: "away", status: "absent", minutes: null });
    expect(
      playerAppearance(detailOf("fixtures-id-1575179.json"), 24888, 174),
    ).toMatchObject({ side: "away", status: "sub", minutes: 11 });
  });
});

describe("자책골 — 득점한 선수의 상대 팀 득점(선수 팀은 라인업에서)", () => {
  // 1575182 우니온 베를린 1-0 엘버스베르크 — 유일한 골을 엘버스베르크 선수의 자책골로 바꿔 본다
  const base = firstItem("fixtures-id-1575182.json") as {
    events: Array<Record<string, unknown>>;
    lineups: Array<{
      team: { id: number };
      startXI: Array<{ player: { id: number; name: string } }>;
    }>;
  };
  const awayPlayer = base.lineups.find((l) => l.team.id === 1660)!.startXI[3]!
    .player;
  const withOwnGoal = (teamId: number, scorer = awayPlayer) => {
    const item = clone(base);
    const goal = item.events.find((e) => e.type === "Goal")!;
    goal.detail = "Own Goal";
    goal.team = { id: teamId, name: "x", logo: null };
    goal.player = { id: scorer.id, name: scorer.name };
    goal.assist = { id: null, name: null };
    return toMatchDetail(item, {
      compByLeague: COMP_BY_LEAGUE,
      fetchedAt: FETCHED_AT,
    });
  };

  it.each([
    ["이벤트 team = 자책한 선수 팀", 1660],
    ["이벤트 team = 득점 인정 팀", 182],
  ])("%s이어도 홈(상대) 득점으로 센다", (_label, teamId) => {
    const r = withOwnGoal(teamId);
    if (r.kind !== "finished") throw new Error("unreachable");
    expect(r.detail.goals).toEqual([
      expect.objectContaining({
        side: "home",
        kind: "own-goal",
        scorer: { id: awayPlayer.id, name: awayPlayer.name },
        assist: null,
      }),
    ]);
    expect(r.detail.goalsComplete).toBe(true);
    // 자책골은 그 선수의 득점이 아니다
    expect(playerAppearance(r.detail, awayPlayer.id)?.goals).toBe(0);
  });

  it("자책한 선수가 라인업에 없으면 팀을 정하지 못한다 → 득점 불완전(득점자를 사실로 쓰지 않는다)", () => {
    const r = withOwnGoal(1660, { id: 999999, name: "Unknown" });
    if (r.kind !== "finished") throw new Error("unreachable");
    expect(r.detail.goals).toEqual([]);
    expect(r.detail.goalsComplete).toBe(false);
  });
});

describe("playerAppearance — 선발 = startXI, apiFootballId로만 매칭", () => {
  it("1575167: 김민재(2897) 교체 45분(games.substitute true 무시), 정우영(512) 선발 60분", () => {
    const d = detailOf("fixtures-id-1575167.json");
    expect(playerAppearance(d, 2897)).toEqual({
      side: "home",
      status: "sub",
      minutes: 45,
      goals: 0,
      assists: 0,
    });
    expect(playerAppearance(d, 512)).toMatchObject({
      side: "away",
      status: "start",
      minutes: 60,
    });
  });

  it("1575180: 설영우(197985) 선발 62분, 김민재 벤치(0분), 2026-10-11 응답의 substitute 전원 false여도 같다", () => {
    const d = detailOf("fixtures-id-1575180.json");
    expect(playerAppearance(d, 197985)).toMatchObject({
      side: "home",
      status: "start",
      minutes: 62,
    });
    expect(playerAppearance(d, 2897)).toMatchObject({
      side: "away",
      status: "bench",
      minutes: 0,
    });
  });

  it("1570403 이강인(927) 교체 33분 · 1575181 이재성(2906) 교체 20분 · 1575182 정우영 선발 78분(id 0·null 선수가 섞인 응답)", () => {
    expect(
      playerAppearance(detailOf("fixtures-id-1570403.json"), 927),
    ).toMatchObject({ status: "sub", minutes: 33 });
    expect(
      playerAppearance(detailOf("fixtures-id-1575181.json"), 2906),
    ).toMatchObject({ status: "sub", minutes: 20 });
    expect(
      playerAppearance(detailOf("fixtures-id-1575182.json"), 512),
    ).toMatchObject({ status: "start", minutes: 78 });
  });

  it("골·도움은 events에서: 1575177 은쿤쿠 3골", () => {
    const d = detailOf("fixtures-id-1575177.json");
    const scorer = d.goals.find((g) => g.scorer.name.includes("Nkunku"))!;
    expect(playerAppearance(d, scorer.scorer.id!)?.goals).toBe(3);
    const assist = d.goals.find((g) => g.assist?.id != null)!;
    expect(playerAppearance(d, assist.assist!.id!)?.assists).toBeGreaterThan(0);
  });

  it("1557418: 김지수(id 없음)는 매칭할 수 없다 — 팀 id로 부르면 명단 제외(absent), 다른 경기 팀이면 null", () => {
    const d = detailOf("fixtures-id-1557418.json");
    // 브렌트퍼드(55) 경기 — 라인업은 있지만 이 선수 id는 모른다
    expect(playerAppearance(d, 424242, 55)).toEqual({
      side: "away",
      status: "absent",
      minutes: null,
      goals: 0,
      assists: 0,
    });
    expect(playerAppearance(d, 424242, 157)).toBeNull();
    expect(playerAppearance(d, 424242)).toBeNull();
    const noLineup = { ...d, lineups: { home: null, away: null } };
    expect(playerAppearance(noLineup, 424242, 55)?.status).toBe("unknown");
  });
});

// ─── 클라이언트 (호출 정책) ──────────────────────────────────────────────

describe("createApiFootballClient — 호출 정책", () => {
  it("키는 x-apisports-key 헤더로만, 경로·오류 메시지에 넣지 않는다", async () => {
    const h = harness(() => new Response("{}", { status: 500 }));
    const client = createApiFootballClient(h.options());
    await expect(client.getFixtureById(1)).rejects.toThrow(ApiFootballError);
    expect(h.calls[0]!.url).toBe(`${API_FOOTBALL_BASE_URL}/fixtures?id=1`);
    expect(h.calls[0]!.headers["x-apisports-key"]).toBe(
      "test-api-football-key",
    );
    expect(h.calls.every((c) => !c.url.includes("test-api-football-key"))).toBe(
      true,
    );
    try {
      await client.getFixturesByDate("2026-10-10");
    } catch (error) {
      expect(String(error)).not.toContain("test-api-football-key");
    }
    expect(() =>
      createApiFootballClient({ ...h.options(), apiKey: "  " }),
    ).toThrow(ApiFootballError);
  });

  it("HTTP 200 + errors.plan → 재시도 없이 plan(호출 1회)", async () => {
    const h = harness(
      () =>
        new Response(readAfFixture("errors-plan-date.json"), { status: 200 }),
    );
    const client = createApiFootballClient(h.options());
    const error = await client
      .getFixturesByDate("2026-09-09")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiFootballError);
    expect(error).toMatchObject({ kind: "plan", status: 200 });
    expect(isStageStoppingError(error as ApiFootballError)).toBe(true);
    expect(h.calls).toHaveLength(1);
    expect(client.retries).toBe(0);
  });

  it("HTTP 200인데 JSON·껍데기 형식이 다르면 format(재시도 없음)", async () => {
    for (const body of ["not json", '{"foo":1}', afEnvelope({ a: 1 })]) {
      const h = harness(() => new Response(body, { status: 200 }));
      const client = createApiFootballClient(h.options());
      await expect(
        client.getFixturesByDate("2026-10-10"),
      ).rejects.toMatchObject({ kind: "format" });
      expect(h.calls).toHaveLength(1);
    }
  });

  it("5xx → 10초 뒤 1회 재시도 후 성공(호출 2회, 재시도 1)", async () => {
    const h = harness((_url, n) =>
      n === 1 ? new Response("x", { status: 503 }) : ok([]),
    );
    const client = createApiFootballClient(h.options());
    await expect(client.getFixturesByDate("2026-10-10")).resolves.toEqual([]);
    expect(h.calls).toHaveLength(2);
    expect(client.retries).toBe(1);
    expect(h.calls[1]!.at - h.calls[0]!.end).toBe(API_FOOTBALL_RETRY_DELAY_MS);
  });

  it("5xx 두 번이면 재시도 1회 뒤 http 오류", async () => {
    const h = harness(() => new Response("x", { status: 502 }));
    const client = createApiFootballClient(h.options());
    await expect(client.getFixtureById(5)).rejects.toMatchObject({
      kind: "http",
      status: 502,
    });
    expect(h.calls).toHaveLength(2);
  });

  it("타임아웃 → 10초 뒤 1회 재시도", async () => {
    const h = harness((_url, n) => {
      if (n === 1) throw timeoutError();
      return ok([]);
    });
    const client = createApiFootballClient(h.options());
    await expect(client.getFixtureById(1)).resolves.toBeNull();
    expect(h.calls).toHaveLength(2);
    expect(isRetryableApiFootballError({ kind: "timeout", status: null })).toBe(
      true,
    );
  });

  it("연결 오류: 날짜 조회는 1회 재시도, 경기 단건은 재시도하지 않는다(이월 → 다음 실행 id 재조회)", async () => {
    const h1 = harness((_url, n) => {
      if (n === 1) throw new TypeError("fetch failed");
      return ok([]);
    });
    const c1 = createApiFootballClient(h1.options());
    await expect(c1.getFixturesByDate("2026-10-10")).resolves.toEqual([]);
    expect(h1.calls).toHaveLength(2);

    const h2 = harness(() => {
      throw new TypeError("fetch failed");
    });
    const c2 = createApiFootballClient(h2.options());
    await expect(c2.getFixtureById(7)).rejects.toMatchObject({
      kind: "network",
    });
    expect(h2.calls).toHaveLength(1);
  });

  it("4xx·errors.requests(일 한도)·키 오류·그 밖 errors는 재시도하지 않는다 — 키 오류(token·access·401·403)는 auth(멈춤)", async () => {
    for (const [res, kind] of [
      [new Response("x", { status: 404 }), "http"],
      [new Response("x", { status: 401 }), "auth"],
      [new Response("x", { status: 403 }), "auth"],
      [
        new Response(afEnvelope([], { requests: "limit" }), { status: 200 }),
        "quota",
      ],
      [
        new Response(
          afEnvelope([], { token: "Error/Missing application key." }),
          { status: 200 },
        ),
        "auth",
      ],
      [
        new Response(afEnvelope([], { access: "Your account is suspended" }), {
          status: 200,
        }),
        "auth",
      ],
      [
        new Response(
          afEnvelope([], { id: "The Id field must contain an integer." }),
          { status: 200 },
        ),
        "api",
      ],
    ] as const) {
      const h = harness(() => res.clone());
      const client = createApiFootballClient(h.options());
      const error = (await client
        .getFixtureById(1)
        .catch((e: unknown) => e)) as ApiFootballError;
      expect(error.kind).toBe(kind);
      expect(isStageStoppingError(error)).toBe(
        kind === "auth" || kind === "quota",
      );
      expect(h.calls).toHaveLength(1);
    }
  });

  it("분당 초과(HTTP 429 · errors.rateLimit) → 61초 뒤 1회 재시도", async () => {
    for (const first of [
      new Response("x", { status: 429 }),
      new Response(afEnvelope([], { rateLimit: "Too many requests" }), {
        status: 200,
      }),
    ]) {
      const h = harness((_url, n) => (n === 1 ? first.clone() : ok([])));
      const client = createApiFootballClient(h.options());
      await client.getFixtureById(1);
      expect(h.calls).toHaveLength(2);
      expect(h.calls[1]!.at - h.calls[0]!.end).toBe(
        API_FOOTBALL_RATE_LIMIT_WAIT_MS,
      );
    }
  });

  it("분당 초과 두 번(첫 시도 + 재시도) → rateStreak 2·단계 멈춤 오류, 다음 요청은 마지막 초과 응답 후 61초 이상 뒤", async () => {
    const h = harness((_url, n) =>
      n <= 2 ? new Response("x", { status: 429 }) : ok([]),
    );
    const client = createApiFootballClient(h.options());
    const error = (await client
      .getFixtureById(1)
      .catch((e: unknown) => e)) as ApiFootballError;
    expect(error).toMatchObject({ kind: "rate", rateStreak: 2 });
    expect(isStageStoppingError(error)).toBe(true);
    // 호출부가 멈추지 않고 다음 요청을 보내도 61초 가드를 지킨다
    await client.getFixtureById(2);
    expect(h.calls).toHaveLength(3);
    expect(h.calls[2]!.at - h.calls[1]!.end).toBeGreaterThanOrEqual(
      API_FOOTBALL_RATE_LIMIT_WAIT_MS,
    );
    expect(API_FOOTBALL_RATE_STOP_STREAK).toBe(2);
  });

  it("분당 초과 1회 뒤 재시도 성공이면 연속 횟수는 0으로 — 다음 초과 1회는 멈춤 오류가 아니고, 그 뒤 요청도 61초 가드", async () => {
    const h = harness((_url, n) =>
      n === 1 || n === 3
        ? new Response(afEnvelope([], { rateLimit: "Too many requests" }), {
            status: 200,
          })
        : ok([]),
    );
    const client = createApiFootballClient(h.options({ maxCalls: 3 }));
    await client.getFixtureById(1); // 초과 → 61초 뒤 재시도 성공(연속 0)
    const error = (await client
      .getFixtureById(2)
      .catch((e: unknown) => e)) as ApiFootballError; // 초과 1회, 상한으로 재시도 없음
    expect(error).toMatchObject({
      kind: "rate",
      rateStreak: 1,
      retrySkipped: "cap",
    });
    expect(isStageStoppingError(error)).toBe(false);
    expect(h.calls[1]!.at - h.calls[0]!.end).toBeGreaterThanOrEqual(
      API_FOOTBALL_RATE_LIMIT_WAIT_MS,
    );
  });

  it("간격 고정: 응답 후 6.5초 · 동시 1개 · 어느 60초 창에도 요청 10회 이하(약관상 분당 초과는 중대한 위반)", async () => {
    // 응답이 거의 즉시(10ms)여도 간격이 줄지 않는다
    const h = harness(() => ok([]), 10);
    const client = createApiFootballClient(h.options());
    // 동시에 부르면 한 줄로 선다
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => client.getFixtureById(i + 1)),
    );
    expect(h.calls).toHaveLength(25);
    for (let i = 1; i < h.calls.length; i += 1) {
      expect(h.calls[i]!.at - h.calls[i - 1]!.end).toBeGreaterThanOrEqual(
        API_FOOTBALL_MIN_INTERVAL_MS,
      );
      // 앞 요청이 끝나기 전에 시작하지 않는다(동시 1개)
      expect(h.calls[i]!.at).toBeGreaterThanOrEqual(h.calls[i - 1]!.end);
    }
    for (const c of h.calls) {
      const inWindow = h.calls.filter(
        (x) => x.at >= c.at && x.at < c.at + 60_000,
      ).length;
      expect(inWindow).toBeLessThanOrEqual(10);
    }
  });

  it("재시도 대기도 6.5초 간격보다 짧지 않다 · 분당 남은 수 0이면 61초 기다린다", async () => {
    const h = harness(
      (_url, n) =>
        new Response(afEnvelope([]), {
          status: 200,
          headers: { "x-ratelimit-remaining": n === 1 ? "0" : "5" },
        }),
    );
    const client = createApiFootballClient(h.options({ retryDelayMs: 1_000 }));
    await client.getFixtureById(1);
    await client.getFixtureById(2);
    expect(h.calls[1]!.at - h.calls[0]!.end).toBe(
      API_FOOTBALL_RATE_LIMIT_WAIT_MS,
    );
    expect(client.rate.minuteRemaining).toBe(5);

    const h2 = harness((_url, n) =>
      n === 1 ? new Response("x", { status: 500 }) : ok([]),
    );
    const c2 = createApiFootballClient(h2.options({ retryDelayMs: 1_000 }));
    await c2.getFixtureById(1);
    expect(h2.calls[1]!.at - h2.calls[0]!.end).toBe(
      API_FOOTBALL_MIN_INTERVAL_MS,
    );
  });

  it("우리 쪽 호출 상한(maxCalls) — 재시도·실패 포함 세고, 닿으면 요청하지 않는다(cap)", async () => {
    const h = harness((_url, n) =>
      n === 2 ? new Response("x", { status: 500 }) : ok([]),
    );
    const client = createApiFootballClient(h.options({ maxCalls: 3 }));
    await client.getFixtureById(1); // 1
    await client.getFixtureById(2); // 2(500) → 재시도 3
    await expect(client.getFixtureById(3)).rejects.toMatchObject({
      kind: "cap",
    });
    expect(h.calls).toHaveLength(3);
    expect(client.calls).toBe(3);

    // 재시도할 차례에 상한이면 재시도하지 않는다
    const h2 = harness(() => new Response("x", { status: 500 }));
    const c2 = createApiFootballClient(h2.options({ maxCalls: 1 }));
    await expect(c2.getFixtureById(1)).rejects.toMatchObject({
      kind: "http",
      retrySkipped: "cap",
    });
    expect(h2.calls).toHaveLength(1);
  });

  it("단계 예산: 마감 전에 시도할 수 없으면 요청하지 않는다(budget), 재시도 대기가 마감을 넘으면 no-time", async () => {
    const h = harness(() => ok([]));
    const client = createApiFootballClient(
      h.options({ deadline: h.now() + 8_000 }),
    );
    await client.getFixtureById(1); // 0.5초 → 다음은 응답 후 6.5초 = 7초 지점, 남은 1초 < 최소 3초
    await expect(client.getFixtureById(2)).rejects.toMatchObject({
      kind: "budget",
    });
    expect(h.calls).toHaveLength(1);

    const h2 = harness(() => new Response("x", { status: 503 }));
    const c2 = createApiFootballClient(
      h2.options({ deadline: h2.now() + 5_000 }),
    );
    await expect(c2.getFixtureById(1)).rejects.toMatchObject({
      kind: "http",
      retrySkipped: "no-time",
    });
  });

  it("취소 신호: 켜져 있으면 요청하지 않고, 간격 대기 중에 켜지면 다음 요청을 보내지 않는다", async () => {
    const controller = new AbortController();
    const h = harness(() => ok([]));
    const client = createApiFootballClient(
      h.options({
        signal: controller.signal,
        sleep: async () => {
          controller.abort();
        },
      }),
    );
    await client.getFixtureById(1);
    await expect(client.getFixtureById(2)).rejects.toMatchObject({
      kind: "cancelled",
    });
    expect(h.calls).toHaveLength(1);
    await expect(client.getFixturesByDate("2026-10-10")).rejects.toMatchObject({
      kind: "cancelled",
    });
  });

  it("경기 단건 응답 0건 → null, 날짜 조회는 항목 원문 배열", async () => {
    const h = harness((url) => afFixtureResponse(url)!);
    const client = createApiFootballClient(h.options());
    const list = await client.getFixturesByDate("2026-10-10");
    expect(list).toHaveLength(36);
    expect(await client.getFixtureById(1575180)).toMatchObject({
      fixture: { id: 1575180 },
    });
    expect(await client.getFixtureById(1)).toBeNull();
    expect(client.rate).toEqual({
      minuteRemaining: 9,
      dayRemaining: 90,
      dayLimit: 100,
    });
    expect(API_FOOTBALL_TIMEOUT_MS).toBe(15_000);
  });
});
