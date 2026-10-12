/**
 * M1-48 API-Football 수집 계획 (scripts/lib/api-football-plan.ts) — 네트워크 없음.
 *
 * 필수 항목: 대상 선별(6개 대회 league id · 이름 함정 · 한국 선수 소속팀 기타 대회 · 클럽 친선 667 제외), 날짜 조회 순서
 * (브리핑 날짜 먼저 — 유럽 서머타임 전환 직후 겨울 슬롯 포함), 일일 카운터(같은 UTC 날 runs 합 · prod 60 · dev 50 · 일 한도 100 ·
 * 실행당 상한), 종료 판정·요청 순서(brief → window → requery), 이월(미종료 저장 · 재조회 · 정리 3일·3회 · 경기 없이 끝남),
 * 이월 파일 읽기·쓰기.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AfPendingFileSchema,
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  TeamIdsFileSchema,
  type AfPendingEntry,
} from "@/lib/schema";

import { briefInputWindow } from "../scripts/lib/brief-input";
import {
  AF_PENDING_MAX_AGE_MS,
  AF_PENDING_MAX_REQUERIES,
  afPendingPath,
  afQueryDates,
  API_FOOTBALL_BOT_DAILY_CAP,
  API_FOOTBALL_DEV_DAILY_CAP,
  apiFootballCallAllowance,
  apiFootballUsedOn,
  buildAfPendingFile,
  buildAfTargetConfig,
  classifyAfTarget,
  CLUB_FRIENDLY_LEAGUE_IDS,
  isDevQuietHours,
  API_FOOTBALL_RUNS_UNREADABLE_CAP,
  nextAfPending,
  normalizeAfStatus,
  planAfFetches,
  readAfPending,
  resolveApiFootballMaxCalls,
  sameAfPending,
  writeAfPending,
  type AfFetchTask,
} from "../scripts/lib/api-football-plan";
import {
  toAfFixture,
  type AfFixture,
} from "../scripts/lib/providers/api-football";

import { readAfJson } from "./support/api-football-fake";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const COMPETITIONS = CompetitionsFileSchema.parse(
  readJson("configs/competitions.json"),
);
const KOREAN = KoreanPlayersFileSchema.parse(
  readJson("configs/korean-players.json"),
);
const TEAM_IDS = TeamIdsFileSchema.parse(readJson("configs/team-ids.json"));
const { targets: TARGETS } = buildAfTargetConfig({
  competitions: COMPETITIONS,
  koreanPlayers: KOREAN,
  teamIds: TEAM_IDS,
});

const fixturesOf = (file: string): AfFixture[] =>
  readAfJson<{ response: unknown[] }>(file).response.map((i) =>
    toAfFixture(i)!,
  );
const DATE_1010 = fixturesOf("fixtures-date-2026-10-10.json");
const DATE_1011 = fixturesOf("fixtures-date-2026-10-11.json");

/** 06:30 KST 2026-10-11 실행 — 브리핑 창 = UTC 2026-10-10 */
const NOW = "2026-10-10T21:30:00.000Z";
const WINDOW = briefInputWindow("2026-10-11");

function fixture(over: Partial<AfFixture> = {}): AfFixture {
  return {
    matchId: 9_000_001,
    leagueId: 81,
    leagueName: "DFB Pokal",
    season: 2026,
    round: "2nd Round",
    kickoff: "2026-10-10T18:45:00.000Z",
    status: "FT",
    home: { id: 157, name: "Bayern München" },
    away: { id: 4242, name: "Somewhere" },
    goals: { home: 3, away: 0 },
    ...over,
  };
}

function pendingEntry(over: Partial<AfPendingEntry> = {}): AfPendingEntry {
  return {
    id: 8_000_001,
    comp: "EPL",
    leagueId: 39,
    kickoff: "2026-10-09T19:00:00.000Z",
    status: "NS",
    firstSeen: "2026-10-09T21:30:00.000Z",
    requeries: 0,
    ...over,
  };
}

const ids = (tasks: readonly AfFetchTask[]) => tasks.map((t) => t.id);

describe("대상 선별 — 6개 대회 ∪ 활성 한국 선수 소속팀(클럽 친선 제외)", () => {
  it("configs에서 대회 6개·한국 선수 소속팀 af id(활성만)를 만든다 — 빠진 팀 없음", () => {
    const built = buildAfTargetConfig({
      competitions: COMPETITIONS,
      koreanPlayers: KOREAN,
      teamIds: TEAM_IDS,
    });
    expect([...built.targets.compByLeague.entries()]).toEqual([
      [39, "EPL"],
      [140, "LALIGA"],
      [135, "SERIEA"],
      [78, "BUNDESLIGA"],
      [61, "LIGUE1"],
      [2, "UCL"],
    ]);
    // 활성 8명의 소속 8팀(홍현석 midtjylland는 비활성 — 제외)
    expect([...built.targets.koreanTeamIds].sort((a, b) => a - b)).toEqual([
      55, 157, 163, 164, 170, 174, 182, 530,
    ]);
    expect(built.unmappedTeams).toEqual([]);
    expect(CLUB_FRIENDLY_LEAGUE_IDS).toEqual([667]);
  });

  it("team-ids에 없거나 af가 null인 활성 선수 팀은 unmappedTeams로 알린다", () => {
    const built = buildAfTargetConfig({
      competitions: COMPETITIONS,
      koreanPlayers: [
        ...KOREAN,
        { ...KOREAN[1]!, slug: "new-player", team: "new-club" },
      ],
      teamIds: { ...TEAM_IDS, augsburg: { fd: 16, af: null } },
    });
    expect(built.unmappedTeams).toEqual(["augsburg", "new-club"]);
  });

  it("2026-10-10 날짜 응답 36개 → 대상 24(정답 태그 target-league), 이름 함정·근접 대회 제외", () => {
    const verdicts = DATE_1010.map(
      (f) => [f.matchId, classifyAfTarget(f, TARGETS)] as const,
    );
    const targetIds = verdicts.filter(([, v]) => v.target).map(([id]) => id);
    const index = readJson("fixtures/football/index.json") as {
      files: Array<{
        path: string;
        cases: Array<{ tag: string; ids: number[] }>;
      }>;
    };
    const file = index.files.find((f) =>
      f.path.endsWith("fixtures-date-2026-10-10.json"),
    )!;
    const tagged = (tag: string) => file.cases.find((c) => c.tag === tag)!.ids;
    expect(targetIds.sort()).toEqual([...tagged("target-league")].sort());
    for (const id of [...tagged("name-trap"), ...tagged("near-miss")]) {
      expect(verdicts.find(([x]) => x === id)?.[1]).toEqual({
        target: false,
        reason: "non-target",
      });
    }
  });

  it("한국 선수 소속팀의 다른 대회(DFB 포칼)는 comp null 대상, 클럽 친선(667·이름)은 제외", () => {
    expect(classifyAfTarget(fixture(), TARGETS)).toEqual({
      target: true,
      comp: null,
    });
    // 원정 팀이 한국 선수 소속팀이어도 같다
    expect(
      classifyAfTarget(
        fixture({
          home: { id: 4242, name: "X" },
          away: { id: 530, name: "Atletico Madrid" },
        }),
        TARGETS,
      ),
    ).toEqual({ target: true, comp: null });
    // fixtures-date-2026-10-11.json 1643234: league 667 "Friendlies Clubs"
    const friendly = DATE_1011.find((f) => f.matchId === 1643234)!;
    expect(friendly.leagueId).toBe(667);
    expect(friendly.leagueName).toBe("Friendlies Clubs");
    expect(
      classifyAfTarget(
        { ...friendly, home: { id: 157, name: "Bayern München" } },
        TARGETS,
      ),
    ).toEqual({ target: false, reason: "friendly" });
    expect(
      classifyAfTarget(
        fixture({ leagueId: 99_999, leagueName: "Club Friendlies 2" }),
        TARGETS,
      ),
    ).toEqual({ target: false, reason: "friendly" });
    // 한국 선수 소속팀이 아니면 친선이든 아니든 대상 밖
    expect(classifyAfTarget(friendly, TARGETS)).toEqual({
      target: false,
      reason: "non-target",
    });
    // 6개 대회는 팀과 무관하게 대상
    expect(
      classifyAfTarget(
        fixture({ leagueId: 2, leagueName: "UEFA Champions League" }),
        TARGETS,
      ),
    ).toEqual({ target: true, comp: "UCL" });
  });
});

describe("날짜 조회 순서 — 브리핑 입력 창(UTC 하루)이 든 날짜 먼저", () => {
  it("06:30 KST(21:30Z) 실행: 오늘(UTC)이 브리핑 날짜 → [오늘, 어제]", () => {
    expect(afQueryDates(NOW, WINDOW)).toEqual(["2026-10-10", "2026-10-09"]);
  });

  it("서머타임 종료 직후 겨울 슬롯 07:10 KST(2026-10-26 = 2026-10-25T22:10Z)도 같은 규칙", () => {
    expect(
      afQueryDates("2026-10-25T22:10:00.000Z", briefInputWindow("2026-10-26")),
    ).toEqual(["2026-10-25", "2026-10-24"]);
  });

  it("낮 실행(KST 15:00 = 06:00Z): 브리핑 날짜는 UTC 어제 → [어제, 오늘]", () => {
    expect(
      afQueryDates("2026-10-13T06:00:00.000Z", briefInputWindow("2026-10-13")),
    ).toEqual(["2026-10-12", "2026-10-13"]);
  });
});

describe("일일 호출 카운터 — 실행 기록 apiCalls.apiFootball의 같은 UTC 날 합", () => {
  const run = (startedAt: string, apiFootball: number) => ({
    startedAt,
    apiCalls: { footballData: 0, apiFootball },
  });

  it("같은 UTC 날짜만 센다(리셋 00:00 UTC = 09:00 KST)", () => {
    const runs = [
      run("2026-10-09T21:30:00.000Z", 30), // 전날(UTC)
      run("2026-10-10T00:00:00.000Z", 5), // 리셋 직후
      run("2026-10-10T12:00:00.000Z", 7),
      run("2026-10-10T23:59:59.000Z", 1),
    ];
    expect(apiFootballUsedOn(runs, NOW)).toBe(13);
    expect(apiFootballUsedOn([], NOW)).toBe(0);
  });

  it("prod 상한 60 − 오늘 prod 사용, dev 상한 50 − 오늘 dev 사용, 둘 합은 일 한도 100 안", () => {
    expect(API_FOOTBALL_BOT_DAILY_CAP).toBe(60);
    expect(API_FOOTBALL_DEV_DAILY_CAP).toBe(50);
    const prod = apiFootballCallAllowance({
      env: "prod",
      prodRuns: [run("2026-10-10T21:30:00.000Z", 26)],
      devRuns: [run("2026-10-10T10:00:00.000Z", 12)],
      now: NOW,
    });
    expect(prod).toEqual({
      cap: 60,
      usedOwn: 26,
      usedTotal: 38,
      perRunCap: null,
      runsUnreadable: false,
      remaining: 34,
      limitedBy: "env-cap",
    });
    // 개발 호출이 많은 날 — 일 한도(100)가 먼저 막는다
    const busy = apiFootballCallAllowance({
      env: "prod",
      prodRuns: [],
      devRuns: [run("2026-10-10T10:00:00.000Z", 55)],
      now: NOW,
    });
    expect(busy).toMatchObject({ remaining: 45, limitedBy: "api-limit" });
    const dev = apiFootballCallAllowance({
      env: "dev",
      prodRuns: [],
      devRuns: [run("2026-10-10T10:00:00.000Z", 48)],
      now: NOW,
      perRunCap: 12,
    });
    expect(dev).toMatchObject({ cap: 50, remaining: 2, limitedBy: "env-cap" });
    const perRun = apiFootballCallAllowance({
      env: "dev",
      prodRuns: [],
      devRuns: [],
      now: NOW,
      perRunCap: 12,
    });
    expect(perRun).toMatchObject({ remaining: 12, limitedBy: "per-run" });
    // 넘쳐도 음수가 되지 않는다
    expect(
      apiFootballCallAllowance({
        env: "prod",
        prodRuns: [run(NOW, 70)],
        devRuns: [],
        now: NOW,
      }).remaining,
    ).toBe(0);
  });

  it("실행 기록을 읽지 못하면 fail-closed — 오늘 사용량을 모르므로 작은 상한(10 = 날짜 2 + 단건 8)", () => {
    expect(API_FOOTBALL_RUNS_UNREADABLE_CAP).toBe(10);
    const unknown = apiFootballCallAllowance({
      env: "prod",
      prodRuns: [],
      devRuns: [],
      now: NOW,
      runsUnreadable: true,
    });
    expect(unknown).toMatchObject({
      remaining: 10,
      limitedBy: "runs-unreadable",
      runsUnreadable: true,
    });
    // 더 작은 제약이 있으면 그것을 따른다
    expect(
      apiFootballCallAllowance({
        env: "dev",
        prodRuns: [],
        devRuns: [],
        now: NOW,
        perRunCap: 4,
        runsUnreadable: true,
      }),
    ).toMatchObject({ remaining: 4, limitedBy: "per-run" });
  });

  it("API_FOOTBALL_MAX_CALLS: 빈 값 null, 양의 정수만", () => {
    expect(resolveApiFootballMaxCalls(undefined)).toBeNull();
    expect(resolveApiFootballMaxCalls(" ")).toBeNull();
    expect(resolveApiFootballMaxCalls("12")).toBe(12);
    expect(() => resolveApiFootballMaxCalls("0")).toThrow();
    expect(() => resolveApiFootballMaxCalls("ten")).toThrow();
  });
});

describe("개발 실행 금지 시간대 — KST [06:00, 08:00)(봇 수집 시간대, CLAUDE.md §6.4)", () => {
  it.each([
    ["2026-10-12T20:59:59.000Z", false], // 05:59:59 KST
    ["2026-10-12T21:00:00.000Z", true], // 06:00 KST
    ["2026-10-12T22:59:59.000Z", true], // 07:59:59 KST
    ["2026-10-12T23:00:00.000Z", false], // 08:00 KST
    ["2026-10-25T21:30:00.000Z", true], // 서머타임 종료 직후 겨울 — KST는 그대로 06:30
  ])("%s → %s", (iso, expected) => {
    expect(isDevQuietHours(iso)).toBe(expected);
  });
});

describe("planAfFetches — 종료 판정·요청 순서·이월", () => {
  it("2026-10-10 응답: 종료 23경기 brief(킥오프 순), INT 1경기 이월, 대상 밖 12", () => {
    const plan = planAfFetches({
      fixtures: DATE_1010,
      pending: [],
      known: new Set(),
      targets: TARGETS,
      briefWindow: WINDOW,
      now: NOW,
    });
    expect(plan.counts).toEqual({
      listed: 36,
      targets: 24,
      koreanOther: 0,
      nonTarget: 12,
      friendly: 0,
      known: 0,
    });
    expect(plan.tasks).toHaveLength(23);
    expect(plan.tasks.every((t) => t.tier === "brief")).toBe(true);
    const kickoffs = plan.tasks.map((t) => Date.parse(t.kickoff));
    expect([...kickoffs].sort((a, b) => a - b)).toEqual(kickoffs);
    expect(plan.waiting).toEqual([
      {
        id: 1570410,
        comp: "LALIGA",
        leagueId: 140,
        kickoff: "2026-10-10T12:00:00.000Z",
        status: "INT",
        firstSeen: NOW,
        requeries: 0,
      },
    ]);
    expect(plan.dropped).toEqual([]);
  });

  it("2026-10-11 응답(모두 NS) → 요청 없음, 17경기 이월(대상 밖 진행 중·중단·취소는 무시)", () => {
    const plan = planAfFetches({
      fixtures: DATE_1011,
      pending: [],
      known: new Set(),
      targets: TARGETS,
      briefWindow: WINDOW,
      now: NOW,
    });
    expect(plan.tasks).toEqual([]);
    expect(plan.waiting).toHaveLength(17);
    expect(plan.waiting.every((w) => w.status === "NS")).toBe(true);
  });

  it("brief → window → requery 순서: 브리핑 창 밖 종료·한국 선수 기타 대회는 window, 날짜 조회에 없는 이월은 requery", () => {
    const plan = planAfFetches({
      fixtures: [
        fixture({ matchId: 1, kickoff: "2026-10-10T18:45:00.000Z" }), // DFB 포칼 — 창 안이어도 6개 대회가 아니라 window
        fixture({
          matchId: 2,
          leagueId: 39,
          leagueName: "Premier League",
          kickoff: "2026-10-09T19:00:00.000Z", // 창 밖(전날 UTC) 종료
        }),
        fixture({
          matchId: 3,
          leagueId: 39,
          leagueName: "Premier League",
          kickoff: "2026-10-10T19:00:00.000Z",
        }),
        fixture({
          matchId: 4,
          leagueId: 39,
          leagueName: "Premier League",
          kickoff: "2026-10-10T11:30:00.000Z",
        }),
      ],
      pending: [
        pendingEntry({ id: 50, kickoff: "2026-10-08T19:00:00.000Z" }), // 날짜 창 밖 → requery
      ],
      known: new Set(),
      targets: TARGETS,
      briefWindow: WINDOW,
      now: NOW,
    });
    expect(plan.tasks.map((t) => [t.id, t.tier])).toEqual([
      [4, "brief"],
      [3, "brief"],
      [2, "window"],
      [1, "window"],
      [50, "requery"],
    ]);
    expect(plan.tasks.find((t) => t.id === 50)?.pending).toMatchObject({
      id: 50,
    });
    expect(plan.counts.koreanOther).toBe(1);
  });

  it("이월 경기가 날짜 조회에서 종료로 나오면 요청(이월 항목 유지 — firstSeen·requeries), 아직이면 상태만 갱신", () => {
    const old = pendingEntry({
      id: 1570410,
      comp: "LALIGA",
      leagueId: 140,
      kickoff: "2026-10-10T12:00:00.000Z",
      status: "1H",
      firstSeen: "2026-10-10T17:00:00.000Z",
      requeries: 1,
    });
    const intPlan = planAfFetches({
      fixtures: DATE_1010,
      pending: [old],
      known: new Set(),
      targets: TARGETS,
      briefWindow: WINDOW,
      now: NOW,
    });
    expect(intPlan.waiting).toEqual([
      { ...old, status: "INT" }, // 날짜 조회 상태로 갱신, 재조회 수는 그대로(요청하지 않았다)
    ]);
    const finished = DATE_1010.map((f) =>
      f.matchId === 1570410
        ? { ...f, status: "FT", goals: { home: 1, away: 1 } }
        : f,
    );
    const ftPlan = planAfFetches({
      fixtures: finished,
      pending: [old],
      known: new Set(),
      targets: TARGETS,
      briefWindow: WINDOW,
      now: NOW,
    });
    const task = ftPlan.tasks.find((t) => t.id === 1570410)!;
    expect(task).toMatchObject({ tier: "brief", status: "FT", pending: old });
    expect(ftPlan.waiting).toEqual([]);
  });

  it("정리: 이미 받음(known) · 경기 없이 끝남(PST·CANC·ABD·AWD·WO) · 3일 지남 · 재조회 3회 · 대상 밖이 된 경기", () => {
    const plan = planAfFetches({
      fixtures: [
        fixture({
          matchId: 10,
          leagueId: 39,
          leagueName: "Premier League",
          status: "PST",
          goals: null,
        }),
        fixture({ matchId: 11, leagueId: 39, leagueName: "Premier League" }),
        fixture({
          matchId: 12,
          home: { id: 1, name: "A" },
          away: { id: 2, name: "B" },
        }), // 한국 선수 이적 → 대상 밖
      ],
      pending: [
        pendingEntry({ id: 10 }),
        pendingEntry({ id: 11 }),
        pendingEntry({ id: 12, comp: null, leagueId: 81 }),
        pendingEntry({
          id: 13,
          kickoff: new Date(
            Date.parse(NOW) - AF_PENDING_MAX_AGE_MS - 1,
          ).toISOString(),
        }),
        pendingEntry({ id: 14, requeries: AF_PENDING_MAX_REQUERIES }),
        pendingEntry({ id: 15 }),
      ],
      known: new Set([11, 15]),
      targets: TARGETS,
      briefWindow: WINDOW,
      now: NOW,
    });
    expect(plan.tasks).toEqual([]);
    expect(plan.dropped).toEqual([
      { id: 10, status: "PST", reason: "void" },
      { id: 11, status: "FT", reason: "known" },
      { id: 12, status: "FT", reason: "non-target" },
      { id: 13, status: "NS", reason: "expired" },
      { id: 14, status: "NS", reason: "requery-limit" },
      { id: 15, status: "NS", reason: "known" },
    ]);
    expect(plan.counts.known).toBe(1);
  });

  it("날짜 조회가 실패해도(목록 없음) 브리핑 창 안의 이월 6개 대회 경기는 brief 계층으로 재조회한다", () => {
    const plan = planAfFetches({
      fixtures: [],
      pending: [
        pendingEntry({ id: 21, kickoff: "2026-10-10T19:00:00.000Z" }),
        pendingEntry({
          id: 22,
          comp: null,
          leagueId: 81,
          kickoff: "2026-10-10T18:00:00.000Z",
        }),
      ],
      known: new Set(),
      targets: TARGETS,
      briefWindow: WINDOW,
      now: NOW,
    });
    expect(plan.tasks.map((t) => [t.id, t.tier])).toEqual([
      [21, "brief"],
      [22, "requery"],
    ]);
  });

  it("입력 순서와 무관하게 결정적이다(중복 id는 처음 것)", () => {
    const a = planAfFetches({
      fixtures: DATE_1010,
      pending: [],
      known: new Set(),
      targets: TARGETS,
      briefWindow: WINDOW,
      now: NOW,
    });
    const b = planAfFetches({
      fixtures: [...DATE_1010].reverse().concat(DATE_1010),
      pending: [],
      known: new Set(),
      targets: TARGETS,
      briefWindow: WINDOW,
      now: NOW,
    });
    expect(ids(b.tasks)).toEqual(ids(a.tasks));
    expect(b.waiting).toEqual(a.waiting);
  });

  it("상태 약어 정규화 — 이월 파일 형식(대문자·숫자 1~6자) 밖은 UNK", () => {
    expect(normalizeAfStatus("ft")).toBe("FT");
    expect(normalizeAfStatus(" 1H ")).toBe("1H");
    expect(normalizeAfStatus("Match Finished")).toBe("UNK");
  });
});

describe("nextAfPending — 요청 결과 → 다음 이월 목록", () => {
  const task = (id: number, over: Partial<AfFetchTask> = {}): AfFetchTask => ({
    id,
    tier: "window",
    comp: "EPL",
    leagueId: 39,
    kickoff: "2026-10-10T19:00:00.000Z",
    status: "FT",
    pending: null,
    ...over,
  });

  it("받음·경기 없음은 빠지고, 미종료·실패·0건은 재조회 +1, 보내지 못함은 그대로, 새 항목은 firstSeen = 지금", () => {
    const carried = pendingEntry({
      id: 6,
      requeries: 1,
      kickoff: "2026-10-09T19:00:00.000Z",
    });
    const update = nextAfPending({
      plan: {
        waiting: [pendingEntry({ id: 7, kickoff: "2026-10-11T15:00:00.000Z" })],
        dropped: [],
      },
      outcomes: [
        { task: task(1), result: { kind: "fetched" } },
        { task: task(2), result: { kind: "void", status: "CANC" } },
        {
          task: task(3),
          result: {
            kind: "unfinished",
            status: "INT",
            kickoff: "2026-10-10T19:05:00.000Z",
          },
        },
        { task: task(4), result: { kind: "failed", errorType: "timeout" } },
        { task: task(5), result: { kind: "deferred" } },
        {
          task: task(6, { tier: "requery", pending: carried, status: "NS" }),
          result: { kind: "missing" },
        },
      ],
      now: NOW,
    });
    // 킥오프·id 순
    expect(update.fixtures).toEqual([
      { ...carried, requeries: 2 },
      {
        id: 4,
        comp: "EPL",
        leagueId: 39,
        kickoff: "2026-10-10T19:00:00.000Z",
        status: "FT",
        firstSeen: NOW,
        requeries: 1,
      },
      {
        id: 5,
        comp: "EPL",
        leagueId: 39,
        kickoff: "2026-10-10T19:00:00.000Z",
        status: "FT",
        firstSeen: NOW,
        requeries: 0,
      },
      {
        id: 3,
        comp: "EPL",
        leagueId: 39,
        kickoff: "2026-10-10T19:05:00.000Z",
        status: "INT",
        firstSeen: NOW,
        requeries: 1,
      },
      pendingEntry({ id: 7, kickoff: "2026-10-11T15:00:00.000Z" }),
    ]);
    expect(update.dropped).toEqual([{ id: 2, status: "CANC", reason: "void" }]);
    // 스키마를 통과한다
    expect(
      AfPendingFileSchema.safeParse(buildAfPendingFile(update.fixtures, NOW))
        .success,
    ).toBe(true);
  });

  it("재조회가 상한(3회)에 닿으면 이번에 정리한다", () => {
    const update = nextAfPending({
      plan: { waiting: [], dropped: [] },
      outcomes: [
        {
          task: task(9, {
            tier: "requery",
            pending: pendingEntry({
              id: 9,
              requeries: AF_PENDING_MAX_REQUERIES - 1,
            }),
          }),
          result: {
            kind: "unfinished",
            status: "SUSP",
            kickoff: "2026-10-09T19:00:00.000Z",
          },
        },
      ],
      now: NOW,
    });
    expect(update.fixtures).toEqual([]);
    expect(update.dropped).toEqual([
      { id: 9, status: "SUSP", reason: "requery-limit" },
    ]);
  });
});

describe("이월 파일 data/cache/af-pending.json", () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-af-pending-"));
  });
  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("없으면 빈 목록(오류 아님), 쓰고 다시 읽으면 같다(2칸 들여쓰기 + 끝 개행)", async () => {
    expect(await readAfPending(dataDir)).toEqual({
      fixtures: [],
      exists: false,
      error: null,
    });
    const entries = [
      pendingEntry({ id: 1 }),
      pendingEntry({ id: 2, comp: null, leagueId: 81 }),
    ];
    const file = await writeAfPending(
      dataDir,
      buildAfPendingFile(entries, NOW),
    );
    expect(file).toBe(afPendingPath(dataDir));
    const text = readFileSync(file, "utf8");
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "fixtures": [');
    const read = await readAfPending(dataDir);
    expect(read).toEqual({ fixtures: entries, exists: true, error: null });
    expect(sameAfPending(read.fixtures, entries)).toBe(true);
    expect(sameAfPending(read.fixtures, [entries[0]!])).toBe(false);
    // 같은 순간의 다른 표기(초 단위 Z)는 같은 항목으로 본다
    expect(
      sameAfPending(
        [{ ...entries[0]!, kickoff: "2026-10-09T19:00:00Z" }],
        [entries[0]!],
      ),
    ).toBe(true);
  });

  it("JSON·스키마 오류는 던지지 않고 오류 + 빈 목록(수집을 멈추지 않는다)", async () => {
    await writeAfPending(dataDir, buildAfPendingFile([], NOW));
    writeFileSync(afPendingPath(dataDir), "{ broken", "utf8");
    expect(await readAfPending(dataDir)).toMatchObject({
      fixtures: [],
      exists: true,
      error: "JSON 파싱 실패",
    });
    writeFileSync(
      afPendingPath(dataDir),
      JSON.stringify({ updatedAt: NOW, fixtures: [{ id: "x" }] }),
      "utf8",
    );
    expect((await readAfPending(dataDir)).error).toMatch(/스키마 검증 실패/);
  });

  it("스키마: 경기 id 중복·시각 오프셋·상태 형식 오류는 실패", () => {
    const ok = { updatedAt: NOW, fixtures: [pendingEntry()] };
    expect(AfPendingFileSchema.safeParse(ok).success).toBe(true);
    expect(
      AfPendingFileSchema.safeParse({
        ...ok,
        fixtures: [pendingEntry(), pendingEntry()],
      }).success,
    ).toBe(false);
    expect(
      AfPendingFileSchema.safeParse({
        ...ok,
        fixtures: [pendingEntry({ kickoff: "2026-10-10T19:00:00+00:00" })],
      }).success,
    ).toBe(false);
    expect(
      AfPendingFileSchema.safeParse({
        ...ok,
        fixtures: [pendingEntry({ status: "Not Started" })],
      }).success,
    ).toBe(false);
  });
});
