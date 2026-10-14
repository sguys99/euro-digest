/**
 * M1-44 football-data 최소 어댑터 (scripts/lib/providers/football-data.ts) — 네트워크 없음, fixtures/football 원본 응답만.
 *
 * 필수 항목: 경계 zod 파싱(정상·누락 필드·오류 응답), 스코어 규칙(승부차기 골 제외 — API-Football과 반대),
 * 입력 창 필터(KST 경계·유럽 서머타임 전환 전후), 종료 경기만·진행 중 집계, 순위 호출 대상 선별(UCL 리그 페이즈·녹아웃),
 * 순위 파싱(TOTAL·UCL 36팀 단일 테이블), 호출 정책(간격 6.5초·헤더 가드·429·5xx·타임아웃 재시도 1회·연결 오류 재시도 없음·
 * 단계 예산), 단계 실패 격리(경기 실패 = 던짐, 순위 실패 = 그 대회만).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CompetitionsFileSchema, type CompetitionConfig } from "@/lib/schema";

import { briefInputWindow } from "../scripts/lib/brief-input";
import {
  affectsStandings,
  createFootballDataClient,
  fetchBriefFootballData,
  FOOTBALL_DATA_BASE_URL,
  FOOTBALL_DATA_MIN_INTERVAL_MS,
  FOOTBALL_DATA_RATE_LIMIT_WAIT_MS,
  FOOTBALL_DATA_RETRY_DELAY_MS,
  FOOTBALL_DATA_STAGE_BUDGET_MS,
  FOOTBALL_DATA_TIMEOUT_MS,
  FootballDataError,
  footballDataDateRange,
  isRetryableFootballDataError,
  readRateLimitHeaders,
  standingsPath,
  standingsTargets,
  toCompStandings,
  toFinishedResults,
  toMatchScore,
  type FdMatch,
} from "../scripts/lib/providers/football-data";
import type { FetchLike } from "../scripts/lib/rss";

import {
  FD_MATCHES_1010,
  FD_STANDINGS_FILES,
  fdFixtureResponse,
  readFdFixture,
} from "./support/football-data-fake";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const COMPETITIONS: CompetitionConfig[] = CompetitionsFileSchema.parse(
  JSON.parse(
    readFileSync(path.join(ROOT, "configs/competitions.json"), "utf8"),
  ),
);
const comp = (id: string) => COMPETITIONS.find((c) => c.id === id)!;
const matchesOf = (file: string) =>
  (JSON.parse(readFdFixture(file)) as { matches: unknown[] }).matches;
const RAW_1010 = matchesOf("matches-6comps-2026-10-10.json");
const WINDOW_1011 = briefInputWindow("2026-10-11");

/** 최소 경기 원문 — 필요한 키만 덮어쓴다 */
function rawMatch(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 999001,
    utcDate: "2026-10-10T14:00:00Z",
    status: "FINISHED",
    matchday: 6,
    stage: "REGULAR_SEASON",
    competition: { code: "PL" },
    homeTeam: { id: 57, name: "Arsenal FC", shortName: "Arsenal" },
    awayTeam: { id: 61, name: "Chelsea FC", shortName: "Chelsea" },
    score: {
      duration: "REGULAR",
      fullTime: { home: 1, away: 0 },
      halfTime: { home: 0, away: 0 },
    },
    ...over,
  };
}

// ─── 시계·가짜 fetch ─────────────────────────────────────────────────────

/** 가짜 시계 — sleep은 시각만 앞으로 민다 */
function fakeClock(start = 1_000_000) {
  let t = start;
  const sleeps: number[] = [];
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

type Step =
  | Response
  | Error
  | ((url: string, init?: RequestInit) => Response | Promise<Response>);

/** 순서대로 응답하는 가짜 fetch(요청마다 소요 시간 `costMs`만큼 시계를 민다) */
function scriptedFetch(
  steps: Step[],
  clock?: { advance: (ms: number) => void },
  costMs = 0,
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await Promise.resolve();
      clock?.advance(costMs);
      const step = steps[Math.min(calls.length - 1, steps.length - 1)];
      if (step === undefined) throw new Error("응답 없음");
      if (step instanceof Error) throw step;
      if (step instanceof Response) return step.clone();
      return await step(url, init);
    } finally {
      inFlight -= 1;
    }
  };
  return { fetch, calls, maxInFlight: () => maxInFlight };
}

function timeoutError(): Error {
  const e = new Error("The operation was aborted due to timeout");
  e.name = "TimeoutError";
  return e;
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

const QUERY = {
  competitions: ["PL"],
  dateFrom: "2026-10-10",
  dateTo: "2026-10-11",
};

// ─── 경계 파싱 ───────────────────────────────────────────────────────────

describe("toFinishedResults — 경계 zod 파싱·종료 경기만", () => {
  it("2026-10-10 6개 대회: 종료 23경기(취소 1 제외), 팀 id·짧은 이름·정식 이름, 로고·심판·배당은 버림", () => {
    const { results, skipped, inProgress } = toFinishedResults(
      RAW_1010,
      COMPETITIONS,
      WINDOW_1011,
    );
    expect(results).toHaveLength(23);
    expect(skipped).toEqual({
      invalid: 0,
      notFinished: 1,
      outOfWindow: 0,
      unknownComp: 0,
    });
    expect(inProgress).toEqual({});
    expect(new Set(results.map((r) => r.comp))).toEqual(
      new Set(["EPL", "LALIGA", "SERIEA", "BUNDESLIGA", "LIGUE1"]),
    );
    const chelsea = results.find((r) => r.matchId === 560595)!;
    expect(chelsea.home).toEqual({
      id: 61,
      name: "Chelsea",
      fullName: "Chelsea FC",
    });
    expect(chelsea.score.ft).toEqual({ home: 5, away: 1 });
    const serialized = JSON.stringify(results);
    for (const key of ["crest", "referees", "odds", "winner", "lastUpdated"]) {
      expect(serialized).not.toContain(key);
    }
    // 킥오프·id 순
    const order = results.map((r) => `${r.kickoff}#${r.matchId}`);
    expect(order).toEqual([...order].sort());
  });

  it("진행 중 경기는 대회별로 센다(순위표가 진행 중 점수를 반영 — M0-28) · 예정·취소·연기·몰수는 종료가 아니다", () => {
    const pl = toFinishedResults(
      matchesOf("matches-pl-2026-10-07-to-13.json"),
      COMPETITIONS,
      WINDOW_1011,
    );
    expect(pl.results).toEqual([]);
    expect(pl.inProgress).toEqual({ EPL: 1 });

    const statuses = [
      "SCHEDULED",
      "TIMED",
      "IN_PLAY",
      "PAUSED",
      "EXTRA_TIME",
      "PENALTY_SHOOTOUT",
      "SUSPENDED",
      "POSTPONED",
      "CANCELLED",
      "AWARDED",
    ];
    const summary = toFinishedResults(
      statuses.map((status, i) => rawMatch({ id: 1000 + i, status })),
      COMPETITIONS,
      WINDOW_1011,
    );
    expect(summary.results).toEqual([]);
    expect(summary.skipped.notFinished).toBe(statuses.length);
    expect(summary.inProgress).toEqual({ EPL: 4 });
  });

  it("others — results 밖의 대상 대회 경기: 미종료·연기·점수 없음은 ft null, 창 밖 종료 경기는 스코어, 대상 밖 대회는 뺀다(D37 후보 수, M1-48b)", () => {
    const summary = toFinishedResults(
      [
        rawMatch({ id: 1, status: "IN_PLAY" }),
        rawMatch({
          id: 2,
          status: "POSTPONED",
          utcDate: "2026-10-10T13:00:00Z",
        }),
        rawMatch({ id: 3, utcDate: "2026-10-11T02:00:00Z" }), // 창 밖 종료
        rawMatch({ id: 4, homeTeam: { id: null, name: null } }), // 종료인데 팀 없음
        rawMatch({ id: 5, competition: { code: "XX" }, status: "IN_PLAY" }), // 대상 밖
        rawMatch({ id: 6 }), // 결과
      ],
      COMPETITIONS,
      WINDOW_1011,
    );
    expect(summary.results.map((r) => r.matchId)).toEqual([6]);
    expect(summary.others).toEqual([
      { matchId: 2, comp: "EPL", kickoff: "2026-10-10T13:00:00Z", ft: null },
      { matchId: 1, comp: "EPL", kickoff: "2026-10-10T14:00:00Z", ft: null },
      {
        matchId: 4,
        comp: "EPL",
        kickoff: "2026-10-10T14:00:00Z",
        ft: { home: 1, away: 0 },
      },
      {
        matchId: 3,
        comp: "EPL",
        kickoff: "2026-10-11T02:00:00Z",
        ft: { home: 1, away: 0 },
      },
    ]);
  });

  it("누락 필드·잘못된 값은 그 건만 invalid — 팀 id·이름·최종 점수 없음, 시각 오프셋 표기, 음수 점수", () => {
    const bad = [
      { id: "x" },
      rawMatch({ id: 1, homeTeam: { id: null, name: "TBD" } }),
      rawMatch({ id: 2, awayTeam: { id: 61, name: null, shortName: null } }),
      rawMatch({
        id: 3,
        score: { duration: "REGULAR", fullTime: { home: null, away: null } },
      }),
      rawMatch({ id: 4, utcDate: "2026-10-10T14:00:00+00:00" }),
      rawMatch({
        id: 5,
        score: { duration: "REGULAR", fullTime: { home: -1, away: 0 } },
      }),
      rawMatch({ id: 6, score: { fullTime: { home: 2, away: 2 } } }), // duration 없음 = REGULAR
      rawMatch({ id: 7, competition: { code: "DED" } }),
    ];
    const { results, skipped } = toFinishedResults(
      bad,
      COMPETITIONS,
      WINDOW_1011,
    );
    expect(results.map((r) => r.matchId)).toEqual([6]);
    expect(results[0]!.score.duration).toBe("REGULAR");
    expect(skipped).toEqual({
      invalid: 6,
      notFinished: 0,
      outOfWindow: 0,
      unknownComp: 1,
    });
  });
});

describe("toMatchScore — 승부차기 골은 ft에서 뺀다(API-Football과 같은 규칙)", () => {
  const score = (s: Partial<FdMatch["score"]>): FdMatch["score"] => ({
    fullTime: { home: 0, away: 0 },
    ...s,
  });

  it("승부차기: football-data 문서 예시(fullTime 7:6 = 정규 1:1 + 연장 0:0 + 승부차기 6:5) → ft 1:1, pens 6:5", () => {
    expect(
      toMatchScore(
        score({
          duration: "PENALTY_SHOOTOUT",
          fullTime: { home: 7, away: 6 },
          halfTime: { home: 1, away: 1 },
          regularTime: { home: 1, away: 1 },
          extraTime: { home: 0, away: 0 },
          penalties: { home: 6, away: 5 },
        }),
      ),
    ).toEqual({
      ft: { home: 1, away: 1 },
      ht: { home: 1, away: 1 },
      regular: { home: 1, away: 1 },
      pens: { home: 6, away: 5 },
      duration: "PENALTY_SHOOTOUT",
    });
  });

  it("2차전 승부차기는 그 경기 스코어가 동점이 아니어도 된다(합산 동점)", () => {
    expect(
      toMatchScore(
        score({
          duration: "PENALTY_SHOOTOUT",
          fullTime: { home: 5, away: 5 },
          penalties: { home: 3, away: 4 },
        }),
      )?.ft,
    ).toEqual({ home: 2, away: 1 });
  });

  it("연장: ft = 정규 + 연장, regular = 90분 스코어", () => {
    expect(
      toMatchScore(
        score({
          duration: "EXTRA_TIME",
          fullTime: { home: 2, away: 1 },
          regularTime: { home: 1, away: 1 },
          extraTime: { home: 1, away: 0 },
        }),
      ),
    ).toEqual({
      ft: { home: 2, away: 1 },
      ht: null,
      regular: { home: 1, away: 1 },
      pens: null,
      duration: "EXTRA_TIME",
    });
  });

  it("쓸 수 없는 스코어는 null — 승부차기인데 penalties 없음·빼면 음수·정규+연장과 어긋남·모르는 duration", () => {
    expect(
      toMatchScore(
        score({ duration: "PENALTY_SHOOTOUT", fullTime: { home: 5, away: 4 } }),
      ),
    ).toBeNull();
    expect(
      toMatchScore(
        score({
          duration: "PENALTY_SHOOTOUT",
          fullTime: { home: 1, away: 1 },
          penalties: { home: 4, away: 3 },
        }),
      ),
    ).toBeNull();
    expect(
      toMatchScore(
        score({
          duration: "PENALTY_SHOOTOUT",
          fullTime: { home: 7, away: 6 },
          regularTime: { home: 1, away: 1 },
          extraTime: { home: 1, away: 0 },
          penalties: { home: 6, away: 5 },
        }),
      ),
    ).toBeNull();
    expect(
      toMatchScore(score({ duration: "GOLDEN_GOAL" as string })),
    ).toBeNull();
  });

  it("toFinishedResults도 같은 규칙 — 승부차기 경기의 ft는 승부차기 골 제외", () => {
    const { results } = toFinishedResults(
      [
        rawMatch({
          id: 77,
          stage: "LAST_16",
          competition: { code: "CL" },
          score: {
            duration: "PENALTY_SHOOTOUT",
            fullTime: { home: 5, away: 4 },
            regularTime: { home: 1, away: 1 },
            extraTime: { home: 0, away: 0 },
            penalties: { home: 4, away: 3 },
          },
        }),
      ],
      COMPETITIONS,
      WINDOW_1011,
    );
    expect(results[0]!.score).toMatchObject({
      ft: { home: 1, away: 1 },
      pens: { home: 4, away: 3 },
      duration: "PENALTY_SHOOTOUT",
    });
  });
});

// ─── 입력 창 ─────────────────────────────────────────────────────────────

describe("입력 창 — KST [D-1 09:00, D 09:00) = UTC 하루 D-1, 유럽 서머타임과 무관", () => {
  const at = (utcDate: string, id: number) => rawMatch({ id, utcDate });

  it("KST 경계: 09:00 KST(00:00Z) 포함, 다음 날 09:00 KST 제외", () => {
    const { results, skipped } = toFinishedResults(
      [
        at("2026-10-09T23:59:59Z", 1), // KST 10-10 08:59:59 — 창 밖
        at("2026-10-10T00:00:00Z", 2), // KST 10-10 09:00 — 포함
        at("2026-10-10T23:59:59Z", 3), // KST 10-11 08:59:59 — 포함
        at("2026-10-11T00:00:00Z", 4), // KST 10-11 09:00 — 창 밖
      ],
      COMPETITIONS,
      WINDOW_1011,
    );
    expect(results.map((r) => r.matchId)).toEqual([2, 3]);
    expect(skipped.outOfWindow).toBe(2);
    expect(footballDataDateRange(WINDOW_1011)).toEqual({
      dateFrom: "2026-10-10",
      dateTo: "2026-10-11",
    });
  });

  it("서머타임 종료(2026-10-25 01:00Z) — 첫 겨울 발행일 10-26의 창은 UTC 10-25 하루, 전환 전후 경기가 모두 들어간다", () => {
    const window = briefInputWindow("2026-10-26");
    expect(window).toEqual({
      start: "2026-10-25T00:00:00.000Z",
      end: "2026-10-26T00:00:00.000Z",
    });
    expect(footballDataDateRange(window)).toEqual({
      dateFrom: "2026-10-25",
      dateTo: "2026-10-26",
    });
    const { results } = toFinishedResults(
      [
        at("2026-10-25T00:30:00Z", 1), // 전환 전(CEST 02:30)
        at("2026-10-25T20:00:00Z", 2), // 전환 후 21:00 CET = 05:00 KST 10-26
        at("2026-10-24T20:00:00Z", 3), // 전날(여름) 21:00 CEST — 10-25 발행분
      ],
      COMPETITIONS,
      window,
    );
    expect(results.map((r) => r.matchId)).toEqual([1, 2]);
    expect(briefInputWindow("2026-10-25")).toEqual({
      start: "2026-10-24T00:00:00.000Z",
      end: "2026-10-25T00:00:00.000Z",
    });
  });

  it("서머타임 시작(2027-03-28 01:00Z) — 발행일 03-29의 창은 UTC 03-28 하루", () => {
    const window = briefInputWindow("2027-03-29");
    expect(window).toEqual({
      start: "2027-03-28T00:00:00.000Z",
      end: "2027-03-29T00:00:00.000Z",
    });
    const { results } = toFinishedResults(
      [
        at("2027-03-28T00:59:59Z", 1), // 전환 직전
        at("2027-03-28T19:00:00Z", 2), // 전환 후 21:00 CEST
        at("2027-03-29T00:00:00Z", 3),
      ],
      COMPETITIONS,
      window,
    );
    expect(results.map((r) => r.matchId)).toEqual([1, 2]);
  });
});

// ─── 순위 ────────────────────────────────────────────────────────────────

describe("순위 호출 대상 — 창 안에 순위표에 영향을 주는 종료 경기가 있는 대회만(설정 순서)", () => {
  it("2026-10-10: 5대 리그만(UCL 경기 없음)", () => {
    const { results } = toFinishedResults(RAW_1010, COMPETITIONS, WINDOW_1011);
    expect(standingsTargets(results, COMPETITIONS).map((c) => c.id)).toEqual([
      "EPL",
      "LALIGA",
      "SERIEA",
      "BUNDESLIGA",
      "LIGUE1",
    ]);
  });

  it("UCL 리그 페이즈(LEAGUE_STAGE)는 대상, 녹아웃만 있으면 대상 아님, stage 없음은 대상", () => {
    const { results } = toFinishedResults(
      matchesOf("season-cl-md1.json"),
      COMPETITIONS,
      briefInputWindow("2026-09-10"),
    );
    expect(results.length).toBeGreaterThan(0);
    expect(standingsTargets(results, COMPETITIONS).map((c) => c.id)).toEqual([
      "UCL",
    ]);
    expect(
      standingsTargets([{ comp: "UCL", stage: "LAST_16" }], COMPETITIONS),
    ).toEqual([]);
    expect(
      standingsTargets([{ comp: "EPL", stage: null }], COMPETITIONS).map(
        (c) => c.id,
      ),
    ).toEqual(["EPL"]);
    expect(standingsTargets([], COMPETITIONS)).toEqual([]);
    expect(affectsStandings("PLAYOFFS")).toBe(false);
    expect(affectsStandings("GROUP_STAGE")).toBe(true);
  });
});

describe("toCompStandings — TOTAL 표만, 순위 순, 로고 버림", () => {
  const fetchedAt = "2026-10-10T21:31:00.000Z";

  it("6개 대회 fixture: 팀 수 = competitions.json teamCount, UCL은 리그 페이즈 36팀 단일 테이블", () => {
    for (const [code, file] of Object.entries(FD_STANDINGS_FILES)) {
      const config = COMPETITIONS.find((c) => c.footballDataCode === code)!;
      const s = toCompStandings(JSON.parse(readFdFixture(file)), config, {
        fetchedAt,
        inProgress: 0,
      });
      expect(s.comp).toBe(config.id);
      expect(s.season).toBe(2026);
      expect(s.tables).toHaveLength(1);
      const rows = s.tables[0]!.rows;
      expect(rows).toHaveLength(config.teamCount);
      // 공동 순위가 있다(PD 19위 2팀, UCL 6·9·13위 …) — 순위는 1부터 내림 없이, 팀 수를 넘지 않는다
      expect(rows[0]!.pos).toBe(1);
      rows.forEach((r, i) => {
        expect(r.pos).toBeLessThanOrEqual(i + 1);
        if (i > 0) expect(r.pos).toBeGreaterThanOrEqual(rows[i - 1]!.pos);
      });
      expect(new Set(rows.map((r) => r.team.id)).size).toBe(config.teamCount);
    }
    const ucl = toCompStandings(
      JSON.parse(readFdFixture("standings-cl-2026-10-10.json")),
      comp("UCL"),
      { fetchedAt, inProgress: 0 },
    );
    expect(ucl.tables[0]).toMatchObject({
      stage: "LEAGUE_STAGE",
      group: "League phase",
    });
    expect(ucl.currentMatchday).toBe(2);
    expect(ucl.tables[0]!.rows[0]).toEqual({
      pos: 1,
      team: { id: 524, name: "PSG", fullName: "Paris Saint-Germain FC" },
      played: 1,
      w: 1,
      d: 0,
      l: 0,
      pts: 3,
      gf: 6,
      ga: 1,
      gd: 5,
    });
  });

  it("로고 자리값(logo-key-kept)이 있어도 결과에 URL이 없다 · 진행 중 경기 수를 그대로 넘긴다", () => {
    const pl = toCompStandings(
      JSON.parse(readFdFixture("standings-pl-2026-10-11.json")),
      comp("EPL"),
      { fetchedAt, inProgress: 2 },
    );
    expect(JSON.stringify(pl)).not.toContain("example.invalid");
    expect(pl.inProgress).toBe(2);
    expect(pl.fetchedAt).toBe(fetchedAt);
  });

  it("형식 오류는 그 대회 순위 전체를 쓰지 않는다 — 다른 대회 응답·TOTAL 없음·행 누락 필드·껍데기 오류", () => {
    const raw = JSON.parse(readFdFixture("standings-pl-2026-10-11.json"));
    const opts = { fetchedAt, inProgress: 0 };
    const expectFormat = (value: unknown, pattern: RegExp) => {
      try {
        toCompStandings(value, comp("EPL"), opts);
        throw new Error("던지지 않음");
      } catch (error) {
        expect(error).toBeInstanceOf(FootballDataError);
        expect((error as FootballDataError).kind).toBe("format");
        expect((error as Error).message).toMatch(pattern);
      }
    };
    expectFormat({ ...raw, competition: { code: "PD" } }, /요청 PL, 응답 PD/);
    expectFormat(
      {
        ...raw,
        standings: raw.standings.map((s: object) => ({ ...s, type: "HOME" })),
      },
      /TOTAL 표가 없다/,
    );
    const broken = structuredClone(raw);
    delete broken.standings[0].table[3].points;
    expectFormat(broken, /행 형식 오류 1건/);
    expectFormat({ message: "x" }, /형식이 다르다/);
  });
});

// ─── 클라이언트 ──────────────────────────────────────────────────────────

describe("createFootballDataClient — 호출 정책", () => {
  it("상수: 간격 6.5초 · 타임아웃 30초(교차 엔드포인트 실측 최대 17.6초의 약 1.7배) · 재시도 대기 10초 · 단계 예산 150초", () => {
    expect(FOOTBALL_DATA_MIN_INTERVAL_MS).toBe(6_500);
    expect(FOOTBALL_DATA_TIMEOUT_MS).toBe(30_000);
    expect(FOOTBALL_DATA_RETRY_DELAY_MS).toBe(10_000);
    expect(FOOTBALL_DATA_STAGE_BUDGET_MS).toBe(150_000);
  });

  it("동시 1개 — 동시에 불러도 한 줄로 서고, 응답 후 6.5초 간격을 지킨다", async () => {
    const clock = fakeClock();
    const f = scriptedFetch([(url) => fdFixtureResponse(url)!], clock, 1_000);
    const client = createFootballDataClient({
      apiKey: "k-1",
      fetch: f.fetch,
      now: clock.now,
      sleep: clock.sleep,
    });
    await Promise.all([
      client.getStandings("PL"),
      client.getStandings("PD"),
      client.getMatches(QUERY),
    ]);
    expect(f.maxInFlight()).toBe(1);
    expect(client.calls).toBe(3);
    expect(clock.sleeps).toEqual([
      FOOTBALL_DATA_MIN_INTERVAL_MS,
      FOOTBALL_DATA_MIN_INTERVAL_MS,
    ]);
    expect(f.calls.map((c) => c.url)).toEqual([
      `${FOOTBALL_DATA_BASE_URL}${standingsPath("PL")}`,
      `${FOOTBALL_DATA_BASE_URL}${standingsPath("PD")}`,
      `${FOOTBALL_DATA_BASE_URL}/matches?competitions=PL&dateFrom=2026-10-10&dateTo=2026-10-11`,
    ]);
    for (const call of f.calls) {
      expect(call.url).not.toContain("k-1");
      expect(
        (call.init!.headers as Record<string, string>)["X-Auth-Token"],
      ).toBe("k-1");
    }
  });

  it("헤더 가드 — X-Requests-Available-Minute ≤ 1이면 X-RequestCounter-Reset + 1초까지 기다린다", async () => {
    const clock = fakeClock();
    const f = scriptedFetch([
      json(
        { matches: [] },
        {
          headers: {
            "X-Requests-Available-Minute": "1",
            "X-RequestCounter-Reset": "30",
          },
        },
      ),
      json({ matches: [] }),
    ]);
    const client = createFootballDataClient({
      apiKey: "k",
      fetch: f.fetch,
      now: clock.now,
      sleep: clock.sleep,
    });
    await client.getMatches(QUERY);
    await client.getMatches(QUERY);
    expect(clock.sleeps).toEqual([31_000]);
    expect(
      readRateLimitHeaders(
        new Headers({
          "X-Requests-Available-Minute": "9",
          "X-RequestCounter-Reset": "x",
        }),
      ),
    ).toEqual({ availableMinute: 9, resetSeconds: null });
  });

  it("429 — X-RequestCounter-Reset + 1초 뒤 1회 재시도, 헤더가 없으면 61초", async () => {
    for (const [headers, wait] of [
      [{ "X-RequestCounter-Reset": "20" }, 21_000],
      [{}, FOOTBALL_DATA_RATE_LIMIT_WAIT_MS],
      [{ "Retry-After": "12" }, 12_000],
    ] as const) {
      const clock = fakeClock();
      const f = scriptedFetch([
        json(
          { message: "You reached your request limit.", errorCode: 429 },
          { status: 429, headers },
        ),
        json({ matches: [rawMatch()] }),
      ]);
      const retries: number[] = [];
      const client = createFootballDataClient({
        apiKey: "k",
        fetch: f.fetch,
        now: clock.now,
        sleep: clock.sleep,
        onRetry: (e) => retries.push(e.delayMs),
      });
      await expect(client.getMatches(QUERY)).resolves.toHaveLength(1);
      expect(client.calls).toBe(2);
      expect(client.retries).toBe(1);
      expect(retries).toEqual([wait]);
    }
  });

  it("429 대기가 상한(65초)보다 길면 다시 보내지 않는다(retrySkipped wait-too-long)", async () => {
    const clock = fakeClock();
    const f = scriptedFetch([
      new Response("{}", { status: 429, headers: { "Retry-After": "90" } }),
    ]);
    const client = createFootballDataClient({
      apiKey: "k",
      fetch: f.fetch,
      now: clock.now,
      sleep: clock.sleep,
    });
    await expect(client.getMatches(QUERY)).rejects.toMatchObject({
      kind: "http",
      status: 429,
      retrySkipped: "wait-too-long",
    });
    expect(client.calls).toBe(1);
  });

  it("5xx·타임아웃은 10초 뒤 1회 재시도, 두 번째도 실패하면 던진다", async () => {
    for (const first of [
      new Response("err", { status: 503 }),
      timeoutError(),
    ]) {
      const clock = fakeClock();
      const f = scriptedFetch([first, json({ matches: [] })]);
      const client = createFootballDataClient({
        apiKey: "k",
        fetch: f.fetch,
        now: clock.now,
        sleep: clock.sleep,
      });
      await expect(client.getMatches(QUERY)).resolves.toEqual([]);
      expect(client.calls).toBe(2);
      expect(clock.sleeps).toEqual([FOOTBALL_DATA_RETRY_DELAY_MS]);
    }
    const clock = fakeClock();
    const always = scriptedFetch([timeoutError()]);
    const client = createFootballDataClient({
      apiKey: "k",
      fetch: always.fetch,
      now: clock.now,
      sleep: clock.sleep,
    });
    await expect(client.getMatches(QUERY)).rejects.toMatchObject({
      kind: "timeout",
      retrySkipped: null,
    });
    expect(client.calls).toBe(2);
  });

  it("연결 오류·400·403·형식 오류는 재시도하지 않는다(오류 본문은 errorCode만 읽는다)", async () => {
    const cases: Array<[Step, Record<string, unknown>]> = [
      [new TypeError("fetch failed"), { kind: "network", status: null }],
      [
        json(
          { message: "Wrong filter value: dateFrom", errorCode: 400 },
          { status: 400 },
        ),
        { kind: "http", status: 400, errorCode: 400 },
      ],
      [
        json(
          {
            message: "The resource you are looking for is restricted.",
            errorCode: 403,
          },
          { status: 403 },
        ),
        { kind: "http", status: 403, errorCode: 403 },
      ],
      [new Response("<html>", { status: 200 }), { kind: "format" }],
      [json({ message: "no matches key" }), { kind: "format" }],
    ];
    for (const [step, expected] of cases) {
      const clock = fakeClock();
      const client = createFootballDataClient({
        apiKey: "k",
        fetch: scriptedFetch([step]).fetch,
        now: clock.now,
        sleep: clock.sleep,
      });
      const error = await client.getMatches(QUERY).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(FootballDataError);
      expect(error).toMatchObject(expected);
      expect((error as Error).message).not.toContain("restricted");
      expect(client.calls).toBe(1);
    }
    expect(isRetryableFootballDataError({ kind: "http", status: 502 })).toBe(
      true,
    );
    expect(isRetryableFootballDataError({ kind: "budget", status: null })).toBe(
      false,
    );
  });

  it("단계 예산 — 남은 시간이 모자라면 요청하지 않고(budget), 재시도 대기가 마감을 넘으면 다시 보내지 않는다(no-time)", async () => {
    const clock = fakeClock(0);
    const f = scriptedFetch(
      [new Response("err", { status: 500 }), json({ matches: [] })],
      clock,
      2_000,
    );
    const client = createFootballDataClient({
      apiKey: "k",
      fetch: f.fetch,
      now: clock.now,
      sleep: clock.sleep,
      deadline: 12_000, // 첫 응답 2초 + 대기 10초 + 최소 시도 3초 > 12초
    });
    await expect(client.getMatches(QUERY)).rejects.toMatchObject({
      kind: "http",
      status: 500,
      retrySkipped: "no-time",
    });
    expect(client.calls).toBe(1);
    // 마감 직전(남은 2초 < 최소 시도 3초)에는 간격을 기다리지도, 요청하지도 않는다
    clock.advance(8_000);
    await expect(client.getStandings("PL")).rejects.toMatchObject({
      kind: "budget",
    });
    expect(client.calls).toBe(1);
  });

  it("마감 때문에 줄인 타임아웃으로 끊기면 timeout이 아니라 budget(재시도 없음)", async () => {
    const clock = fakeClock(0);
    const client = createFootballDataClient({
      apiKey: "k",
      fetch: scriptedFetch([timeoutError()]).fetch,
      now: clock.now,
      sleep: clock.sleep,
      deadline: 10_000, // 남은 10초 < 타임아웃 30초
    });
    await expect(client.getMatches(QUERY)).rejects.toMatchObject({
      kind: "budget",
    });
    expect(client.calls).toBe(1);
  });
});

// ─── 단계 ────────────────────────────────────────────────────────────────

describe("fetchBriefFootballData — 경기 1요청 + 대상 대회 순위", () => {
  const now = () => new Date("2026-10-10T21:31:00.000Z");

  it("2026-10-11 발행: 경기 1 + 순위 5요청, 종료 23경기·순위 5개 대회", async () => {
    const clock = fakeClock();
    const f = scriptedFetch([(url) => fdFixtureResponse(url)!]);
    const client = createFootballDataClient({
      apiKey: "k",
      fetch: f.fetch,
      now: clock.now,
      sleep: clock.sleep,
    });
    const data = await fetchBriefFootballData({
      client,
      competitions: COMPETITIONS,
      window: WINDOW_1011,
      now,
    });
    expect(client.calls).toBe(6);
    expect(data.fetched).toBe(24);
    expect(data.results).toHaveLength(23);
    expect(data.standings.map((s) => s.comp)).toEqual([
      "EPL",
      "LALIGA",
      "SERIEA",
      "BUNDESLIGA",
      "LIGUE1",
    ]);
    expect(data.standings.every((s) => s.inProgress === 0)).toBe(true);
    expect(data.standingsFailed).toEqual([]);
  });

  it("경기 요청 실패는 던진다(그날 브리핑 생략) — 순위는 부르지 않는다", async () => {
    const clock = fakeClock();
    const f = scriptedFetch([new TypeError("fetch failed")]);
    const client = createFootballDataClient({
      apiKey: "k",
      fetch: f.fetch,
      now: clock.now,
      sleep: clock.sleep,
    });
    await expect(
      fetchBriefFootballData({
        client,
        competitions: COMPETITIONS,
        window: WINDOW_1011,
        now,
      }),
    ).rejects.toMatchObject({ kind: "network" });
    expect(f.calls).toHaveLength(1);
  });

  it("순위 실패는 그 대회만 빠진다(재시도 후에도 5xx·형식 오류) — 나머지 순위와 경기 결과는 그대로", async () => {
    const clock = fakeClock();
    const f = scriptedFetch([
      (url) => {
        if (url.endsWith(standingsPath("PD"))) {
          return new Response("err", { status: 502 });
        }
        if (url.endsWith(standingsPath("SA"))) {
          return json({ competition: { code: "SA" }, standings: [] });
        }
        return fdFixtureResponse(url)!;
      },
    ]);
    const client = createFootballDataClient({
      apiKey: "k",
      fetch: f.fetch,
      now: clock.now,
      sleep: clock.sleep,
    });
    const data = await fetchBriefFootballData({
      client,
      competitions: COMPETITIONS,
      window: WINDOW_1011,
      now,
    });
    expect(data.results).toHaveLength(23);
    expect(data.standings.map((s) => s.comp)).toEqual([
      "EPL",
      "BUNDESLIGA",
      "LIGUE1",
    ]);
    expect(data.standingsFailed).toEqual([
      expect.objectContaining({ comp: "LALIGA", errorType: "http" }),
      expect.objectContaining({ comp: "SERIEA", errorType: "format" }),
    ]);
    expect(client.calls).toBe(7); // 경기 1 + 순위 5 + PD 재시도 1
  });

  it("단계 예산이 바닥나면 남은 대회 순위는 요청 없이 budget으로 빠진다", async () => {
    const clock = fakeClock(0);
    const f = scriptedFetch([(url) => fdFixtureResponse(url)!], clock, 20_000);
    const client = createFootballDataClient({
      apiKey: "k",
      fetch: f.fetch,
      now: clock.now,
      sleep: clock.sleep,
      deadline: 50_000, // 응답 20초 + 간격 6.5초 → 경기(20초)·PL(46.5초) 뒤 남은 시간 부족
    });
    const data = await fetchBriefFootballData({
      client,
      competitions: COMPETITIONS,
      window: WINDOW_1011,
      now,
    });
    expect(data.results).toHaveLength(23);
    expect(data.standings.map((s) => s.comp)).toEqual(["EPL"]);
    expect(data.standingsFailed.map((s) => [s.comp, s.errorType])).toEqual([
      ["LALIGA", "budget"],
      ["SERIEA", "budget"],
      ["BUNDESLIGA", "budget"],
      ["LIGUE1", "budget"],
    ]);
    expect(client.calls).toBe(2);
  });
});

describe("기존 fixture 회귀 — 브리핑 입력 수는 바뀌지 않는다", () => {
  it("2026-10-11 브리핑 입력 meta의 종료 경기 수(23)와 같다", () => {
    const meta = JSON.parse(
      readFileSync(
        path.join(ROOT, "fixtures/llm/brief-inputs/2026-10-11.meta.json"),
        "utf8",
      ),
    ) as { finished: number };
    expect(
      toFinishedResults(
        JSON.parse(FD_MATCHES_1010).matches,
        COMPETITIONS,
        WINDOW_1011,
      ).results,
    ).toHaveLength(meta.finished);
  });
});
