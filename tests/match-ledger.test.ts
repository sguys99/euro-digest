/**
 * M1-48b 경기 기록 원장(scripts/lib/match-ledger.ts, PRD §15 D33) — 네트워크·실호출 없음. 실응답 fixtures(M0-35·M1-48a)로 검증.
 *
 * 필수 항목: 원장 키·달(UTC 월 경계), 쓰기 조건(COLLECT_ENABLED 꺼짐/켜짐·dry·dev·취소), 한국 선수 행 상태(선발·교체·벤치·
 * 명단 제외·라인업 없음)·자책골·승부차기, id 없는 선수 이름 후보, 달 파일 upsert(덮어쓰기·정렬·내용 같으면 안 씀·다른 달 거부),
 * 메타(since 한 번만·playerSince·gaps 추가·치유·since 앞 무시), 원자적 쓰기·읽기 오류 시 쓰지 않고 unstored.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  LedgerMatchSchema,
  MatchLedgerFileSchema,
  MatchLedgerMetaSchema,
  TeamIdsFileSchema,
  type AfPendingEntry,
  type CompId,
  type LedgerMatch,
  type MatchLedgerMeta,
} from "@/lib/schema";

import {
  AF_PENDING_MAX_REQUERIES,
  afQueryDates,
  buildAfTargetConfig,
  nextAfPending,
  planAfFetches,
  requeueAfPending,
  type AfTaskOutcome,
} from "../scripts/lib/api-football-plan";
import type { MatchDetail } from "../scripts/lib/match-data";
import {
  afIdOfKey,
  afMatchKey,
  applyLedger,
  buildLedgerEntries,
  findKoreanNameCandidates,
  isIncompleteLedgerMatch,
  koreanPlayerTargets,
  koreanRowsOf,
  ledgerMetaPath,
  ledgerMonthOf,
  ledgerMonthPath,
  ledgerMonthsAround,
  ledgerPlanKnown,
  ledgerWriteMode,
  nameMatchBasis,
  nextLedgerMeta,
  playerStartDate,
  readLedgerWindow,
  resolveLedgerEnabled,
  serializeLedgerMonth,
  toLedgerMatch,
  upsertLedgerMonth,
  type LedgerRunFacts,
  type TrackedPlayer,
} from "../scripts/lib/match-ledger";
import {
  toAfFixture,
  toMatchDetail,
} from "../scripts/lib/providers/api-football";

import { readAfJson } from "./support/api-football-fake";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

const COMP_BY_LEAGUE = new Map<number, CompId>([
  [39, "EPL"],
  [140, "LALIGA"],
  [135, "SERIEA"],
  [78, "BUNDESLIGA"],
  [61, "LIGUE1"],
  [2, "UCL"],
]);
const FETCHED_AT = "2026-10-11T22:12:00.000Z";
/** 주입한 교체 선수의 등번호·포지션·grid(이 테스트는 이름 매칭만 본다) */
const NO_SHIRT = { number: null, pos: null, grid: null } as const;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function detailOf(id: number, mutate?: (raw: Record<string, unknown>) => void) {
  const raw = clone(
    readAfJson<{ response: Array<Record<string, unknown>> }>(
      `fixtures-id-${id}.json`,
    ).response[0]!,
  );
  mutate?.(raw);
  const r = toMatchDetail(raw, {
    compByLeague: COMP_BY_LEAGUE,
    fetchedAt: FETCHED_AT,
  });
  if (r.kind !== "finished") throw new Error(`종료 경기가 아니다: ${id}`);
  return r.detail;
}

const TARGETS = koreanPlayerTargets(
  KoreanPlayersFileSchema.parse(readJson("configs/korean-players.json")),
  TeamIdsFileSchema.parse(readJson("configs/team-ids.json")),
);

// ─── 키·달·쓰기 조건 ────────────────────────────────────────────────────

describe("원장 키·달 — af-<id>, 킥오프 UTC 달", () => {
  it("af-<id> 왕복, 형식이 아니면 null", () => {
    expect(afMatchKey(1575180)).toBe("af-1575180");
    expect(afIdOfKey("af-1575180")).toBe(1575180);
    expect(afIdOfKey("fd-1")).toBeNull();
    expect(afIdOfKey("af-01")).toBeNull();
  });

  it("달 경계는 UTC — 10-31 23:59:59Z는 10월(KST로는 11-01), 11-01 00:00Z는 11월", () => {
    expect(ledgerMonthOf("2026-10-31T23:59:59.000Z")).toBe("2026-10");
    expect(ledgerMonthOf("2026-11-01T00:00:00.000Z")).toBe("2026-11");
    // 유럽 서머타임 종료일(2026-10-25 01:00Z) 전후도 UTC 그대로
    expect(ledgerMonthOf("2026-10-25T00:30:00.000Z")).toBe("2026-10");
  });

  it("읽을 달 — 지금 앞 4일 ~ 뒤 1일이 걸친 달", () => {
    expect(ledgerMonthsAround("2026-10-15T22:00:00.000Z")).toEqual(["2026-10"]);
    expect(ledgerMonthsAround("2026-11-02T22:00:00.000Z")).toEqual([
      "2026-10",
      "2026-11",
    ]);
    expect(ledgerMonthsAround("2026-10-31T22:00:00.000Z")).toEqual([
      "2026-10",
      "2026-11",
    ]);
    expect(ledgerMonthsAround("2026-12-31T23:00:00.000Z")).toEqual([
      "2026-12",
      "2027-01",
    ]);
  });
});

describe("쓰기 조건 — COLLECT_ENABLED(정기 운영)인 prod·비dry 실행만", () => {
  it("COLLECT_ENABLED 값 해석(가드 parseFlag와 같은 규칙)", () => {
    expect(resolveLedgerEnabled("true")).toBe(true);
    expect(resolveLedgerEnabled(" TRUE ")).toBe(true);
    expect(resolveLedgerEnabled("false")).toBe(false);
    expect(resolveLedgerEnabled("")).toBe(false);
    expect(resolveLedgerEnabled(undefined)).toBe(false);
    expect(resolveLedgerEnabled("1")).toBe(false);
  });

  it.each([
    [{ env: "prod", dry: false, enabled: true, cancelled: false }, "write"],
    [
      { env: "prod", dry: false, enabled: false, cancelled: false },
      "ledger-disabled",
    ],
    [{ env: "prod", dry: true, enabled: true, cancelled: false }, "dry"],
    [{ env: "dev", dry: false, enabled: true, cancelled: false }, "dev"],
    [{ env: "dev", dry: true, enabled: false, cancelled: false }, "dry"],
    [{ env: "prod", dry: false, enabled: true, cancelled: true }, "cancelled"],
  ] as const)("%o → %s", (input, mode) => {
    expect(ledgerWriteMode(input)).toBe(mode);
  });
});

// ─── 한국 선수 행 ────────────────────────────────────────────────────────

describe("koreanPlayerTargets·koreanRowsOf — apiFootballId로만 매칭", () => {
  it("추적 = 활성 + id(7명), id 없는 활성 선수(김지수)는 이름 후보 대상, 비활성(홍현석)은 빠진다", () => {
    expect(TARGETS.tracked.map((p) => p.slug)).toEqual([
      "lee-kang-in",
      "kim-min-jae",
      "jeong-woo-yeong",
      "lee-jae-sung",
      "jens-castrop",
      "seol-young-woo",
      "hwang-hee-chan",
    ]);
    expect(TARGETS.unidentified).toEqual([
      { slug: "kim-ji-soo", nameEn: "Ji-soo Kim", teamAf: 55 },
    ]);
  });

  it("상태 4종 — 선발(설영우 62분)·벤치(김민재 0분) · 교체(황희찬 11분) · 명단 제외(카스트로프)", () => {
    expect(koreanRowsOf(detailOf(1575180), TARGETS.tracked)).toEqual([
      {
        player: 2897,
        side: "away",
        status: "bench",
        minutes: 0,
        goals: 0,
        assists: 0,
      },
      {
        player: 197985,
        side: "home",
        status: "start",
        minutes: 62,
        goals: 0,
        assists: 0,
      },
    ]);
    expect(koreanRowsOf(detailOf(1575179), TARGETS.tracked)).toEqual([
      {
        player: 24888,
        side: "away",
        status: "sub",
        minutes: 11,
        goals: 0,
        assists: 0,
      },
    ]);
    expect(koreanRowsOf(detailOf(1575183), TARGETS.tracked)).toEqual([
      {
        player: 280358,
        side: "away",
        status: "absent",
        minutes: null,
        goals: 0,
        assists: 0,
      },
    ]);
  });

  it("라인업이 없는 경기(커버리지 없는 대회)는 unknown — 출전 여부를 0으로 만들지 않는다", () => {
    const d = { ...detailOf(1575183), lineups: { home: null, away: null } };
    expect(koreanRowsOf(d, TARGETS.tracked)).toEqual([
      {
        player: 280358,
        side: "away",
        status: "unknown",
        minutes: null,
        goals: 0,
        assists: 0,
      },
    ]);
  });

  it("소속팀이 아니어도 라인업에 있으면 행(이적 단서) · 소속팀도 라인업도 아니면 행 없음", () => {
    const moved: TrackedPlayer = {
      slug: "x",
      apiFootballId: 2906,
      teamAf: 999,
    };
    expect(koreanRowsOf(detailOf(1575181), [moved])).toEqual([
      {
        player: 2906,
        side: "home",
        status: "sub",
        minutes: 20,
        goals: 0,
        assists: 0,
      },
    ]);
    expect(koreanRowsOf(detailOf(1575177), [moved])).toEqual([]);
  });

  it("자책골은 골로 세지 않는다 — 1552779 자책 선수(339417)를 추적 선수로 두면 행은 있지만 0골", () => {
    const d = detailOf(1552779);
    const rows = koreanRowsOf(d, [
      { slug: "demba", apiFootballId: 339417, teamAf: 95 },
    ]);
    expect(rows).toEqual([
      expect.objectContaining({ player: 339417, side: "away", goals: 0 }),
    ]);
    const entry = toLedgerMatch(d, rows);
    expect(entry.goals.find((g) => g.kind === "own-goal")).toEqual({
      minute: 45,
      extra: null,
      side: "home",
      kind: "own-goal",
      scorer: { id: 339417, name: "P. Demba" },
      assist: null,
    });
  });

  it("골·도움은 events에서 — 득점한 추적 선수 행", () => {
    const d = detailOf(1575177);
    const scorer = d.goals.find((g) => g.scorer.name.includes("Nkunku"))!;
    const rows = koreanRowsOf(d, [
      { slug: "nkunku", apiFootballId: scorer.scorer.id!, teamAf: 173 },
    ]);
    expect(rows[0]).toMatchObject({ goals: 3, side: "home" });
  });
});

describe("이름 후보 — apiFootballId 없는 활성 선수(김지수)", () => {
  it.each([
    ["Kim Ji-Soo", "full"],
    ["Ji-soo Kim", "full"],
    ["Jisoo Kim", "full"],
    ["Ji Soo Kim", "full"],
    ["J. Kim", "initial"],
    ["Kim Ji-soo ", "full"],
    ["K. Ji-soo", null],
    ["Kim Min-Jae", null],
    ["Kim", null],
    ["J. Kimmich", null],
  ] as const)("Ji-soo Kim ↔ %s → %s", (lineupName, basis) => {
    expect(nameMatchBasis("Ji-soo Kim", lineupName)).toBe(basis);
  });

  it("실응답 1557418(브렌트퍼드 라인업에 없음) — 후보 없음으로 남긴다(운영 리포트가 확인 못 함을 센다)", () => {
    const checks = findKoreanNameCandidates(
      detailOf(1557418),
      TARGETS.unidentified,
    );
    expect(checks).toEqual([
      {
        player: "kim-ji-soo",
        nameEn: "Ji-soo Kim",
        matchId: 1557418,
        kickoff: "2026-10-10T14:00:00.000Z",
        side: "away",
        lineup: true,
        candidates: [],
      },
    ]);
  });

  it("라인업에 이름이 맞는 선수가 있으면 후보(id·출전 상태) — 추적 중인 id는 빼고, 원장 행은 만들지 않는다", () => {
    const d = detailOf(1557418);
    const away = d.lineups.away!;
    const injected: MatchDetail = {
      ...d,
      lineups: {
        ...d.lineups,
        away: {
          ...away,
          substitutes: [
            ...away.substitutes,
            { id: 999001, name: "Kim Ji-Soo", minutes: 12, ...NO_SHIRT },
            { id: 999002, name: "J. Kim", minutes: null, ...NO_SHIRT },
            { id: 2897, name: "J. Kim", minutes: null, ...NO_SHIRT }, // 추적 중 id — 빼야 한다
          ],
        },
      },
    };
    const [check] = findKoreanNameCandidates(
      injected,
      TARGETS.unidentified,
      new Set([2897]),
    );
    expect(check?.candidates).toEqual([
      {
        id: 999001,
        name: "Kim Ji-Soo",
        basis: "full",
        status: "sub",
        minutes: 12,
      },
      {
        id: 999002,
        name: "J. Kim",
        basis: "initial",
        status: "bench",
        minutes: null,
      },
    ]);
    const build = buildLedgerEntries([injected], TARGETS);
    // id 없는 선수(후보 999001·999002)는 행이 없다 — 행은 라인업에 id로 들어 있는 추적 선수(2897)뿐
    expect(build.entries[0]!.korean.map((r) => r.player)).toEqual([2897]);
    expect(build.nameChecks).toHaveLength(1);
  });

  it("그 팀 라인업이 없으면 lineup false · 소속팀 경기가 아니면 대조하지 않는다", () => {
    const d = detailOf(1557418);
    expect(
      findKoreanNameCandidates(
        { ...d, lineups: { home: null, away: null } },
        TARGETS.unidentified,
      ),
    ).toEqual([expect.objectContaining({ lineup: false, candidates: [] })]);
    expect(
      findKoreanNameCandidates(detailOf(1575180), TARGETS.unidentified),
    ).toEqual([]);
  });
});

// ─── 원장 항목 ───────────────────────────────────────────────────────────

const ALL_IDS = [
  1552779, 1552780, 1557418, 1570403, 1575167, 1575177, 1575179, 1575180,
  1575181, 1575182, 1575183, 1639860,
];

describe("toLedgerMatch·buildLedgerEntries — D33 ① 필드만, 스키마 통과", () => {
  it("실응답 종료 경기 12건 모두 스키마 통과, 킥오프·id 순, 한국 선수 행 9개", () => {
    const build = buildLedgerEntries(
      ALL_IDS.map((id) => detailOf(id)),
      TARGETS,
    );
    expect(build.invalid).toEqual([]);
    expect(build.entries).toHaveLength(12);
    for (const e of build.entries) LedgerMatchSchema.parse(e);
    const kickoffs = build.entries.map((e) => Date.parse(e.kickoff));
    expect([...kickoffs].sort((a, b) => a - b)).toEqual(kickoffs);
    // 1575167(김민재 교체 45·정우영 선발 60) 2 · 1575180 2 · 1575179 1 · 1575183 1 · 1575181 1 · 1575182 1 · 1570403 1
    expect(build.koreanRows).toBe(9);
  });

  it("승부차기(1639860): PEN·pens 4-3, 승부차기 킥은 득점이 아니다(연장 득점 2건만), 라인업 없음 → 포메이션 null", () => {
    const e = toLedgerMatch(detailOf(1639860), []);
    expect(e).toMatchObject({
      id: "af-1639860",
      leagueId: 874,
      league: "Australia Cup",
      comp: null,
      status: "PEN",
      ft: { home: 1, away: 1 },
      pens: { home: 4, away: 3 },
      goalsComplete: true,
      home: { formation: null },
      away: { formation: null },
    });
    expect(e.goals.map((g) => [g.minute, g.side])).toEqual([
      [95, "away"],
      [117, "home"],
    ]);
  });

  it("전 선수 출전 시간·로고·사진은 저장하지 않는다 — 키는 D33 ① 범위", () => {
    const e = toLedgerMatch(detailOf(1575180), []);
    expect(Object.keys(e)).toEqual([
      "id",
      "leagueId",
      "league",
      "comp",
      "season",
      "round",
      "kickoff",
      "status",
      "home",
      "away",
      "ft",
      "pens",
      "goals",
      "goalsComplete",
      "korean",
      "fetchedAt",
    ]);
    const text = JSON.stringify(e);
    expect(text).not.toMatch(/logo|photo|minutes":\d+,"name|lineups|startXI/);
    expect(e.home).toEqual({
      id: 170,
      name: "FC Augsburg",
      formation: "3-4-2-1",
    });
  });

  it("스키마 위반은 원장에서 빼고 invalid로 돌려준다(이월 목록에 다시 넣는 대상)", () => {
    const bad = { ...detailOf(1575180), leagueId: 0 };
    const build = buildLedgerEntries([bad, detailOf(1575181)], TARGETS);
    expect(build.entries.map((e) => e.id)).toEqual(["af-1575181"]);
    expect(build.invalid).toEqual([
      { id: 1575180, error: expect.stringContaining("leagueId") },
    ]);
  });

  it("경기 1건 평균 크기(압축 JSON) — 실응답 12건 평균 1KB 안팎(D33 추정 1.7KB 이하)", () => {
    const build = buildLedgerEntries(
      ALL_IDS.map((id) => detailOf(id)),
      TARGETS,
    );
    const avg =
      build.entries.reduce((n, e) => n + JSON.stringify(e).length, 0) /
      build.entries.length;
    expect(avg).toBeLessThan(1_700);
  });
});

// ─── 달 파일 ─────────────────────────────────────────────────────────────

const entryOf = (id: number) =>
  buildLedgerEntries([detailOf(id)], TARGETS).entries[0]!;

describe("upsertLedgerMonth — af-<id> 덮어쓰기·킥오프·id 순·내용 같으면 안 씀", () => {
  const T1 = "2026-10-11T22:14:00.000Z";
  const T2 = "2026-10-12T22:14:00.000Z";

  it("새 파일 — 킥오프·id 순(입력 순서 무관)", () => {
    const u = upsertLedgerMonth(
      null,
      "2026-10",
      [entryOf(1575181), entryOf(1639860), entryOf(1575180)],
      T1,
    );
    expect(u.changed).toBe(true);
    expect(u.added).toHaveLength(3);
    // 1639860 08:35 → 1575180·1575181 13:30(같은 킥오프는 id 순)
    expect(u.file.matches.map((m) => m.id)).toEqual([
      "af-1639860",
      "af-1575180",
      "af-1575181",
    ]);
    expect(MatchLedgerFileSchema.parse(u.file).updatedAt).toBe(T1);
  });

  it("같은 내용 재조회(수집 시각만 다름)는 바뀌지 않는다 — updatedAt·기존 fetchedAt 유지", () => {
    const first = upsertLedgerMonth(null, "2026-10", [entryOf(1575180)], T1);
    const again = upsertLedgerMonth(
      first.file,
      "2026-10",
      [{ ...entryOf(1575180), fetchedAt: T2 }],
      T2,
    );
    expect(again.changed).toBe(false);
    expect(again.file).toEqual(first.file);
  });

  it("내용이 바뀐 경기는 덮어쓴다(replaced) — 다른 경기는 그대로", () => {
    const first = upsertLedgerMonth(
      null,
      "2026-10",
      [entryOf(1575180), entryOf(1575181)],
      T1,
    );
    const fixed: LedgerMatch = {
      ...entryOf(1575180),
      fetchedAt: T2,
      home: { ...entryOf(1575180).home, formation: "3-5-2" },
    };
    const u = upsertLedgerMonth(first.file, "2026-10", [fixed], T2);
    expect(u).toMatchObject({
      changed: true,
      added: [],
      replaced: ["af-1575180"],
    });
    expect(u.file.updatedAt).toBe(T2);
    expect(
      u.file.matches.find((m) => m.id === "af-1575180")?.home.formation,
    ).toBe("3-5-2");
    expect(u.file.matches.find((m) => m.id === "af-1575181")).toEqual(
      first.file.matches.find((m) => m.id === "af-1575181"),
    );
  });

  it("다른 달 경기는 거부한다(호출부 오류) · 스키마는 파일 달과 킥오프 달 불일치·정렬 위반을 잡는다", () => {
    expect(() =>
      upsertLedgerMonth(null, "2026-09", [entryOf(1575180)], T1),
    ).toThrow(/다른 달/);
    const sept = entryOf(1575167); // 2026-09-18
    expect(
      MatchLedgerFileSchema.safeParse({
        month: "2026-10",
        updatedAt: T1,
        matches: [sept],
      }).success,
    ).toBe(false);
    expect(
      MatchLedgerFileSchema.safeParse({
        month: "2026-10",
        updatedAt: T1,
        matches: [entryOf(1575181), entryOf(1639860)],
      }).success,
    ).toBe(false);
  });

  it("직렬화 — 경기 하나가 한 줄, 다시 읽으면 같다, 빈 파일도 유효", () => {
    const u = upsertLedgerMonth(
      null,
      "2026-10",
      [entryOf(1575180), entryOf(1575181)],
      T1,
    );
    const text = serializeLedgerMonth(u.file);
    expect(
      text.split("\n").filter((l) => l.startsWith('    {"id":"af-')),
    ).toHaveLength(2);
    expect(text.endsWith("\n")).toBe(true);
    expect(MatchLedgerFileSchema.parse(JSON.parse(text))).toEqual(u.file);
    const empty = serializeLedgerMonth({
      month: "2026-11",
      updatedAt: T1,
      matches: [],
    });
    expect(MatchLedgerFileSchema.parse(JSON.parse(empty)).matches).toEqual([]);
  });
});

// ─── 메타 ────────────────────────────────────────────────────────────────

const NOW = "2026-10-10T21:30:00.000Z";
const TRACKED: TrackedPlayer[] = [
  { slug: "kim-min-jae", apiFootballId: 2897, teamAf: 157 },
  { slug: "seol-young-woo", apiFootballId: 197985, teamAf: 170 },
];

function facts(over: Partial<LedgerRunFacts> = {}): LedgerRunFacts {
  return {
    now: NOW,
    season: 2026,
    dates: [
      { date: "2026-10-10", ok: true },
      { date: "2026-10-09", ok: true },
    ],
    skipped: null,
    dropped: [],
    stored: new Set(),
    tracked: TRACKED,
    previous: [],
    ...over,
  };
}

const META: MatchLedgerMeta = {
  season: 2026,
  since: "2026-10-01",
  playerSince: { "kim-min-jae": "2026-10-01", "seol-young-woo": "2026-10-01" },
  gaps: [],
};

describe("nextLedgerMeta — since 한 번만·playerSince·gaps", () => {
  it("첫 정기 실행이 원장을 시작한다 — since = 받은 날짜 중 가장 이른 날, 추적 선수는 since부터", () => {
    const u = nextLedgerMeta(null, facts());
    expect(u).toMatchObject({ created: true, changed: true });
    expect(u.meta).toEqual({
      season: 2026,
      since: "2026-10-09",
      playerSince: {
        "kim-min-jae": "2026-10-09",
        "seol-young-woo": "2026-10-09",
      },
      gaps: [],
    });
  });

  it("어제 날짜 조회가 실패하면 since는 오늘 날짜 — 실패한 날은 since 앞이라 gaps에 남기지 않는다", () => {
    const u = nextLedgerMeta(
      null,
      facts({
        dates: [
          { date: "2026-10-10", ok: true },
          { date: "2026-10-09", ok: false, errorType: "network" },
        ],
      }),
    );
    expect(u.meta).toMatchObject({ since: "2026-10-10", gaps: [] });
  });

  it("날짜를 하나도 받지 못했거나 시즌을 모르면 시작하지 않는다(meta null)", () => {
    expect(
      nextLedgerMeta(
        null,
        facts({
          dates: [{ date: "2026-10-10", ok: false, errorType: "quota" }],
        }),
      ).meta,
    ).toBeNull();
    expect(nextLedgerMeta(null, facts({ season: null })).meta).toBeNull();
  });

  it("since·시즌은 바꾸지 않는다 — 설정 시즌이 달라도 seasonMismatch만, 같은 내용이면 changed false", () => {
    const u = nextLedgerMeta(META, facts({ season: 2027 }));
    expect(u.meta).toMatchObject({ since: "2026-10-01", season: 2026 });
    expect(u.seasonMismatch).toBe(true);
    expect(u.changed).toBe(false);
  });

  it("id를 나중에 채운 선수 — 이번 실행이 받은 가장 이른 날부터, 원장에 그 팀 경기가 행 없이 있으면 그 다음 날부터", () => {
    const newcomer: TrackedPlayer = {
      slug: "kim-ji-soo",
      apiFootballId: 777,
      teamAf: 55,
    };
    const brentfordStored: Pick<
      LedgerMatch,
      "kickoff" | "home" | "away" | "korean"
    > = {
      kickoff: "2026-10-10T14:00:00.000Z",
      home: { id: 66, name: "Aston Villa", formation: null },
      away: { id: 55, name: "Brentford", formation: null },
      korean: [],
    };
    // 그 팀 경기가 원장에 없으면 받은 날짜(10-09)부터
    expect(
      nextLedgerMeta(META, facts({ tracked: [...TRACKED, newcomer] }))
        .playersAdded,
    ).toEqual([{ slug: "kim-ji-soo", since: "2026-10-09" }]);
    // 10-10 경기가 그 선수 행 없이 이미 있다 → 다시 받지 않으므로 10-11부터
    const u = nextLedgerMeta(
      META,
      facts({ tracked: [...TRACKED, newcomer], previous: [brentfordStored] }),
    );
    expect(u.meta?.playerSince["kim-ji-soo"]).toBe("2026-10-11");
    expect(u.meta?.playerSince["kim-min-jae"]).toBe("2026-10-01"); // 기존 값은 그대로
    // 그 선수 행이 있는 경기(이미 추적)는 미루지 않는다
    expect(
      playerStartDate({
        player: newcomer,
        base: "2026-10-09",
        previous: [
          {
            ...brentfordStored,
            korean: [
              {
                player: 777,
                side: "away",
                status: "bench",
                minutes: 0,
                goals: 0,
                assists: 0,
              },
            ],
          },
        ],
        now: NOW,
      }),
    ).toBe("2026-10-09");
    // 소속팀 id를 모르면 내일(UTC)부터
    expect(
      playerStartDate({
        player: { ...newcomer, teamAf: null },
        base: "2026-10-09",
        previous: [],
        now: NOW,
      }),
    ).toBe("2026-10-11");
  });

  it("이번 실행이 날짜를 받지 못하면 선수를 더하지 않는다(행이 만들어지지 않는 실행)", () => {
    const u = nextLedgerMeta(
      { ...META, playerSince: {} },
      facts({
        dates: [],
        skipped: { dates: ["2026-10-10"], cause: "daily-cap" },
      }),
    );
    expect(u.meta?.playerSince).toEqual({});
  });

  it("빠진 날 — 날짜 조회 실패(date-query·plan이면 degraded)·단계 건너뜀(skipped)·이월 정리(dropped), 날짜·사유 순", () => {
    const u = nextLedgerMeta(
      META,
      facts({
        dates: [
          { date: "2026-10-10", ok: false, errorType: "plan" },
          { date: "2026-10-09", ok: false, errorType: "network" },
        ],
        dropped: [
          { id: 1570412, kickoff: "2026-10-07T19:00:00.000Z" },
          { id: 1570410, kickoff: "2026-10-07T12:00:00.000Z" },
          { id: 1500000, kickoff: "2026-09-20T12:00:00.000Z" }, // since 앞 — 남기지 않음
        ],
      }),
    );
    // 10-09는 이번 실행에서 어제 조회(마지막 기회) — 실패해도 새 공백을 만들지 않는다
    expect(u.meta?.gaps).toEqual([
      { date: "2026-10-07", reason: "dropped", matches: [1570410, 1570412] },
      { date: "2026-10-10", reason: "degraded", cause: "plan" },
    ]);
    expect(u.changed).toBe(true);
    const skipped = nextLedgerMeta(
      META,
      facts({
        dates: [],
        skipped: { dates: ["2026-10-10", "2026-10-09"], cause: "no-api-key" },
      }),
    );
    expect(skipped.meta?.gaps).toEqual([
      { date: "2026-10-10", reason: "skipped", cause: "no-api-key" },
    ]);
  });

  it("가짜 빈 날 방지 — 날짜 T의 첫 기회(R(T) 오늘 조회)만 공백을 만들고, 마지막 기회(R(T+1) 어제 조회)는 기존 공백만 유지한다", () => {
    const R_T = "2026-10-09T21:30:00.000Z"; // 10-09를 오늘로 조회
    const R_T1 = "2026-10-10T21:30:00.000Z"; // 10-09를 어제로 조회
    // ① 첫 기회 성공 → 마지막 기회 실패: 공백 없음(첫 기회에 받았다)
    const firstOk = nextLedgerMeta(
      META,
      facts({
        now: R_T,
        dates: [
          { date: "2026-10-09", ok: true },
          { date: "2026-10-08", ok: true },
        ],
      }),
    ).meta!;
    const lastFail = nextLedgerMeta(
      firstOk,
      facts({
        now: R_T1,
        dates: [
          { date: "2026-10-10", ok: true },
          { date: "2026-10-09", ok: false, errorType: "network" },
        ],
      }),
    );
    expect(lastFail.meta?.gaps).toEqual([]);
    expect(lastFail.gapsAdded).toEqual([]);
    // ② 첫 기회 실패 → 공백, 마지막 기회도 실패 → 그대로 남는다(사유·cause 그대로, 중복 없음)
    const firstFail = nextLedgerMeta(
      META,
      facts({
        now: R_T,
        dates: [
          { date: "2026-10-09", ok: false, errorType: "timeout" },
          { date: "2026-10-08", ok: true },
        ],
      }),
    ).meta!;
    expect(firstFail.gaps).toEqual([
      { date: "2026-10-09", reason: "date-query", cause: "timeout" },
    ]);
    const bothFail = nextLedgerMeta(
      firstFail,
      facts({
        now: R_T1,
        dates: [
          { date: "2026-10-10", ok: true },
          { date: "2026-10-09", ok: false, errorType: "network" },
        ],
      }),
    );
    expect(bothFail.meta?.gaps).toEqual([
      { date: "2026-10-09", reason: "date-query", cause: "timeout" },
    ]);
    expect(bothFail.changed).toBe(false);
    // ③ 첫 기회 실패 → 마지막 기회 성공: 치유
    const healed = nextLedgerMeta(
      firstFail,
      facts({
        now: R_T1,
        dates: [
          { date: "2026-10-10", ok: true },
          { date: "2026-10-09", ok: true },
        ],
      }),
    );
    expect(healed.meta?.gaps).toEqual([]);
    // ④ 마지막 기회의 건너뜀(skipped)도 새 공백을 만들지 않는다 — 오늘 날짜만
    const skipped = nextLedgerMeta(
      firstOk,
      facts({
        now: R_T1,
        dates: [],
        skipped: { dates: ["2026-10-10", "2026-10-09"], cause: "daily-cap" },
      }),
    );
    expect(skipped.meta?.gaps).toEqual([
      { date: "2026-10-10", reason: "skipped", cause: "daily-cap" },
    ]);
  });

  it("치유 — 나중 실행이 그 날짜를 받으면 날짜 단위 공백을 지우고, 원장에 들어온 경기는 dropped에서 지운다", () => {
    const withGaps: MatchLedgerMeta = {
      ...META,
      gaps: [
        { date: "2026-10-07", reason: "dropped", matches: [1570410, 1570412] },
        { date: "2026-10-08", reason: "date-query", cause: "network" },
        { date: "2026-10-09", reason: "date-query", cause: "network" },
        { date: "2026-10-09", reason: "skipped", cause: "daily-cap" },
      ],
    };
    const u = nextLedgerMeta(withGaps, facts({ stored: new Set([1570410]) }));
    expect(u.meta?.gaps).toEqual([
      { date: "2026-10-07", reason: "dropped", matches: [1570412] },
      { date: "2026-10-08", reason: "date-query", cause: "network" },
    ]);
    expect(u.gapsHealed.map((g) => `${g.date}:${g.reason}`)).toEqual([
      "2026-10-09:date-query",
      "2026-10-09:skipped",
    ]);
    // 다시 실패해도 같은 (날짜, 사유)는 하나 — 바뀐 것 없음
    const again = nextLedgerMeta(
      u.meta,
      facts({
        dates: [
          { date: "2026-10-10", ok: true },
          { date: "2026-10-08", ok: false, errorType: "timeout" },
        ],
      }),
    );
    expect(again.changed).toBe(false);
    expect(again.meta?.gaps).toEqual(u.meta?.gaps);
  });

  it("스키마 — playerSince·gaps는 since 이후, gaps는 날짜·사유 순 중복 금지, dropped만 matches", () => {
    expect(
      MatchLedgerMetaSchema.safeParse({
        ...META,
        playerSince: { "kim-min-jae": "2026-09-30" },
      }).success,
    ).toBe(false);
    expect(
      MatchLedgerMetaSchema.safeParse({
        ...META,
        gaps: [
          { date: "2026-10-09", reason: "skipped" },
          { date: "2026-10-09", reason: "skipped" },
        ],
      }).success,
    ).toBe(false);
    expect(
      MatchLedgerMetaSchema.safeParse({
        ...META,
        gaps: [{ date: "2026-10-09", reason: "date-query", matches: [1] }],
      }).success,
    ).toBe(false);
    expect(
      MatchLedgerMetaSchema.safeParse({
        ...META,
        gaps: [{ date: "2026-10-09", reason: "dropped" }],
      }).success,
    ).toBe(false);
  });
});

// ─── 파일 I/O ────────────────────────────────────────────────────────────

describe("applyLedger·readLedgerWindow — 원자적 쓰기, 읽기 오류면 쓰지 않음", () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-ledger-"));
  });
  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  const baseFacts = (): Omit<
    LedgerRunFacts,
    "stored" | "previous" | "now"
  > => ({
    season: 2026,
    dates: [
      { date: "2026-10-10", ok: true },
      { date: "2026-10-09", ok: true },
    ],
    skipped: null,
    dropped: [],
    tracked: TRACKED,
  });
  const writeMeta = (meta: MatchLedgerMeta) => {
    mkdirSync(path.join(dataDir, "matches"), { recursive: true });
    writeFileSync(
      ledgerMetaPath(dataDir),
      `${JSON.stringify(meta, null, 2)}\n`,
      "utf8",
    );
  };

  it("첫 실행: 달 파일 + 메타를 쓰고, 다시 읽으면 known, 같은 내용이면 다시 쓰지 않는다", async () => {
    const entries = [entryOf(1575180), entryOf(1575181)];
    const first = await applyLedger({
      dataDir,
      now: NOW,
      read: await readLedgerWindow(dataDir, ledgerMonthsAround(NOW)),
      entries,
      facts: baseFacts(),
    });
    expect(first).toMatchObject({ state: "started", unstored: [], errors: [] });
    expect(first.months).toEqual([
      {
        month: "2026-10",
        added: 2,
        replaced: 0,
        written: ledgerMonthPath(dataDir, "2026-10"),
        error: null,
      },
    ]);
    expect(first.meta?.created).toBe(true);
    const meta = MatchLedgerMetaSchema.parse(
      JSON.parse(readFileSync(ledgerMetaPath(dataDir), "utf8")),
    );
    expect(meta.since).toBe("2026-10-09");

    const read = await readLedgerWindow(dataDir, ledgerMonthsAround(NOW));
    expect([...read.known].sort()).toEqual([1575180, 1575181]);
    const mtime = statSync(ledgerMonthPath(dataDir, "2026-10")).mtimeMs;
    const metaText = readFileSync(ledgerMetaPath(dataDir), "utf8");
    const second = await applyLedger({
      dataDir,
      now: "2026-10-10T21:40:00.000Z",
      read,
      entries: [{ ...entries[0]!, fetchedAt: "2026-10-10T21:41:00.000Z" }],
      facts: baseFacts(),
    });
    expect(second.months[0]).toMatchObject({
      added: 0,
      replaced: 0,
      written: null,
    });
    expect(second.metaWritten).toBeNull();
    expect(statSync(ledgerMonthPath(dataDir, "2026-10")).mtimeMs).toBe(mtime);
    expect(readFileSync(ledgerMetaPath(dataDir), "utf8")).toBe(metaText);
  });

  it("원장이 없고 이번 실행이 날짜를 하나도 받지 못하면 시작하지 않는다(아무것도 쓰지 않음)", async () => {
    const r = await applyLedger({
      dataDir,
      now: NOW,
      read: await readLedgerWindow(dataDir, ["2026-10"]),
      entries: [entryOf(1575180)],
      facts: {
        ...baseFacts(),
        dates: [{ date: "2026-10-10", ok: false, errorType: "network" }],
      },
    });
    expect(r).toMatchObject({ state: "not-started", unstored: [], months: [] });
    expect(() => statSync(path.join(dataDir, "matches"))).toThrow();
  });

  it("손상된 달 파일은 덮어쓰지 않는다 — known에서 빠지고, 그 달 경기는 unstored(이월에 다시 넣음)", async () => {
    mkdirSync(path.join(dataDir, "matches"), { recursive: true });
    writeFileSync(ledgerMonthPath(dataDir, "2026-10"), "{ broken", "utf8");
    const read = await readLedgerWindow(dataDir, ["2026-10"]);
    expect(read.errors).toEqual([
      { file: "data/matches/2026-10.json", error: "JSON 파싱 실패" },
    ]);
    const r = await applyLedger({
      dataDir,
      now: NOW,
      read,
      entries: [entryOf(1575180)],
      facts: baseFacts(),
    });
    expect(r.unstored).toEqual([1575180]);
    expect(r.errors[0]).toContain("2026-10.json");
    expect(readFileSync(ledgerMonthPath(dataDir, "2026-10"), "utf8")).toBe(
      "{ broken",
    );
  });

  it("메타를 읽지 못하면 아무것도 쓰지 않고 모든 경기가 unstored", async () => {
    mkdirSync(path.join(dataDir, "matches"), { recursive: true });
    writeFileSync(
      ledgerMetaPath(dataDir),
      JSON.stringify({ since: "x" }),
      "utf8",
    );
    const r = await applyLedger({
      dataDir,
      now: NOW,
      read: await readLedgerWindow(dataDir, ["2026-10"]),
      entries: [entryOf(1575180), entryOf(1575181)],
      facts: baseFacts(),
    });
    expect(r.state).toBe("meta-unreadable");
    expect(r.unstored.sort()).toEqual([1575180, 1575181]);
    expect(() => statSync(ledgerMonthPath(dataDir, "2026-10"))).toThrow();
  });

  it("이미 시작된 원장 + 이번 실행이 날짜를 받지 못함(건너뜀) → 빠진 날만 기록", async () => {
    mkdirSync(path.join(dataDir, "matches"), { recursive: true });
    writeFileSync(ledgerMetaPath(dataDir), `${JSON.stringify(META)}\n`, "utf8");
    const r = await applyLedger({
      dataDir,
      now: NOW,
      read: await readLedgerWindow(dataDir, []),
      entries: [],
      facts: {
        season: null,
        dates: [],
        skipped: { dates: ["2026-10-10", "2026-10-09"], cause: "daily-cap" },
        dropped: [],
        tracked: [],
      },
    });
    expect(r.state).toBe("started");
    // 10-09는 어제 조회(마지막 기회) — 오늘(10-10)만 공백
    expect(
      MatchLedgerMetaSchema.parse(
        JSON.parse(readFileSync(ledgerMetaPath(dataDir), "utf8")),
      ).gaps,
    ).toEqual([{ date: "2026-10-10", reason: "skipped", cause: "daily-cap" }]);
  });

  it("새 원장: 메타(since)를 달 파일보다 먼저 쓴다 — 달 파일을 못 써도 메타는 남고 경기는 unstored(settle로 이월에 다시)", async () => {
    mkdirSync(ledgerMonthPath(dataDir, "2026-10"), { recursive: true }); // 달 파일 자리에 폴더 — 읽기 실패
    const settled: Array<{ unstored: number[]; incomplete: number[] }> = [];
    const r = await applyLedger({
      dataDir,
      now: NOW,
      read: await readLedgerWindow(dataDir, ["2026-10"]),
      entries: [entryOf(1575180)],
      facts: baseFacts(),
      settle: (x) => {
        settled.push({
          unstored: [...x.unstored],
          incomplete: [...x.incomplete],
        });
        return { dropped: [] };
      },
    });
    expect(r.state).toBe("started");
    expect(r.unstored).toEqual([1575180]);
    expect(settled).toEqual([{ unstored: [1575180], incomplete: [] }]);
    expect(
      MatchLedgerMetaSchema.parse(
        JSON.parse(readFileSync(ledgerMetaPath(dataDir), "utf8")),
      ).since,
    ).toBe("2026-10-09");
    expect(r.meta?.created).toBe(true);
  });

  it("킥오프가 since 앞인 경기는 원장에 넣지 않는다(beforeSince — 다시 받지도 않음)", async () => {
    writeMeta({
      season: 2026,
      since: "2026-10-11",
      playerSince: {
        "kim-min-jae": "2026-10-11",
        "seol-young-woo": "2026-10-11",
      },
      gaps: [],
    });
    const r = await applyLedger({
      dataDir,
      now: "2026-10-11T21:30:00.000Z",
      read: await readLedgerWindow(dataDir, ["2026-09", "2026-10"]),
      entries: [entryOf(1575167), entryOf(1575180), entryOf(1552779)], // 09-18 · 10-10 · 10-11
      facts: {
        ...baseFacts(),
        dates: [
          { date: "2026-10-11", ok: true },
          { date: "2026-10-10", ok: true },
        ],
      },
    });
    expect(r.beforeSince.sort()).toEqual([1575167, 1575180]);
    expect(r.unstored).toEqual([]);
    const file = MatchLedgerFileSchema.parse(
      JSON.parse(readFileSync(ledgerMonthPath(dataDir, "2026-10"), "utf8")),
    );
    expect(file.matches.map((m) => m.id)).toEqual(["af-1552779"]);
    expect(() => statSync(ledgerMonthPath(dataDir, "2026-09"))).toThrow();
  });

  it("settle — 달 파일 뒤·메타 앞에 불린다: 불완전 경기를 알리고, 돌려준 정리 경기는 빠진 날(dropped)에 남는다", async () => {
    writeMeta(META);
    const incomplete = { ...entryOf(1575181), goalsComplete: false };
    let calledBeforeMeta = false;
    const r = await applyLedger({
      dataDir,
      now: NOW,
      read: await readLedgerWindow(dataDir, ["2026-10"]),
      entries: [entryOf(1575180), incomplete],
      facts: baseFacts(),
      settle: (x) => {
        expect(x.incomplete).toEqual([1575181]);
        calledBeforeMeta = readFileSync(
          ledgerMetaPath(dataDir),
          "utf8",
        ).includes('"gaps": []');
        return {
          dropped: [{ id: 1570410, kickoff: "2026-10-07T12:00:00.000Z" }],
        };
      },
    });
    expect(calledBeforeMeta).toBe(true);
    expect(r.incomplete).toEqual([1575181]);
    expect(
      MatchLedgerMetaSchema.parse(
        JSON.parse(readFileSync(ledgerMetaPath(dataDir), "utf8")),
      ).gaps,
    ).toEqual([{ date: "2026-10-07", reason: "dropped", matches: [1570410] }]);
  });

  it("원장이 시작되지 않으면(not-started) settle을 부르지 않는다 — 집계 시작 전 경기는 이월에 다시 넣지 않는다", async () => {
    let called = false;
    const r = await applyLedger({
      dataDir,
      now: NOW,
      read: await readLedgerWindow(dataDir, ["2026-10"]),
      entries: [entryOf(1575180)],
      facts: { ...baseFacts(), dates: [] },
      settle: () => {
        called = true;
        return { dropped: [] };
      },
    });
    expect(r.state).toBe("not-started");
    expect(called).toBe(false);
  });
});

describe("requeueAfPending — 원장에 넣지 못한 경기를 이월 목록에 다시(재조회 +1)", () => {
  it("받은 경기(fetched)만, 기존 이월 항목은 requeries를 이어 간다, 3회째는 정리", () => {
    const task = (id: number, pending: AfPendingEntry | null = null) => ({
      id,
      tier: "brief" as const,
      comp: "EPL" as const,
      leagueId: 39,
      kickoff: "2026-10-10T14:00:00.000Z",
      status: "FT",
      pending,
    });
    const old: AfPendingEntry = {
      id: 3,
      comp: "EPL",
      leagueId: 39,
      kickoff: "2026-10-10T14:00:00.000Z",
      status: "FT",
      firstSeen: "2026-10-09T22:00:00.000Z",
      requeries: 2,
    };
    const outcomes: AfTaskOutcome[] = [
      { task: task(1), result: { kind: "fetched" } },
      { task: task(2), result: { kind: "fetched" } },
      { task: task(3, old), result: { kind: "fetched" } },
      { task: task(4), result: { kind: "failed", errorType: "http" } },
    ];
    const r = requeueAfPending({
      pending: [],
      outcomes,
      ids: new Set([1, 3, 4]),
      now: NOW,
    });
    expect(r.fixtures.map((f) => [f.id, f.requeries, f.firstSeen])).toEqual([
      [1, 1, NOW],
    ]);
    expect(r.dropped).toEqual([
      { id: 3, status: "FT", reason: "requery-limit" },
    ]);
  });
});

// ─── 불완전 항목 재조회 (오케스트레이터 결정 2026-10-14) ──────────────────

describe("불완전 원장 항목 — 이월 목록에 있는 동안만 다시 받고, 상한에 걸리면 확정", () => {
  it("isIncompleteLedgerMatch — 득점 불완전 · 한국 선수 행 unknown · 양 팀 포메이션 없음", () => {
    const full = entryOf(1575180);
    expect(isIncompleteLedgerMatch(full)).toBe(false);
    expect(isIncompleteLedgerMatch({ ...full, goalsComplete: false })).toBe(
      true,
    );
    expect(
      isIncompleteLedgerMatch({
        ...full,
        korean: [{ ...full.korean[0]!, status: "unknown", minutes: null }],
      }),
    ).toBe(true);
    expect(
      isIncompleteLedgerMatch({
        ...full,
        home: { ...full.home, formation: null },
      }),
    ).toBe(false); // 한쪽만 없으면 완전으로 본다
    expect(
      isIncompleteLedgerMatch({
        ...full,
        home: { ...full.home, formation: null },
        away: { ...full.away, formation: null },
      }),
    ).toBe(true);
    // 실응답: 라인업 커버리지가 없는 승부차기 경기(1639860)는 포메이션이 없어 불완전
    expect(isIncompleteLedgerMatch(entryOf(1639860))).toBe(true);
  });

  it("ledgerPlanKnown — 불완전 + 이월 목록에 있음만 빼고 나머지 원장 경기는 이미 받음", () => {
    const read = { known: new Set([1, 2, 3]), incomplete: new Set([2, 3]) };
    expect([...ledgerPlanKnown(read, new Set([2, 9]))].sort()).toEqual([1, 3]);
    expect([...ledgerPlanKnown(read, new Set())].sort()).toEqual([1, 2, 3]);
  });

  it("readLedgerWindow — 불완전 항목 id를 따로 모은다", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-ledger-"));
    try {
      mkdirSync(path.join(dir, "matches"), { recursive: true });
      const u = upsertLedgerMonth(
        null,
        "2026-10",
        [entryOf(1575180), entryOf(1639860)],
        NOW,
      );
      writeFileSync(
        ledgerMonthPath(dir, "2026-10"),
        serializeLedgerMonth(u.file),
        "utf8",
      );
      const read = await readLedgerWindow(dir, ["2026-10"]);
      expect([...read.known].sort()).toEqual([1575180, 1639860]);
      expect([...read.incomplete]).toEqual([1639860]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("requeueAfPending incomplete — 처음 받은 경기는 0부터, 이월에서 온 요청은 +1, 원장 실패(ids)는 +1", () => {
    const task = (id: number, pending: AfPendingEntry | null) => ({
      id,
      tier: "window" as const,
      comp: "EPL" as const,
      leagueId: 39,
      kickoff: "2026-10-10T14:00:00.000Z",
      status: "FT",
      pending,
    });
    const old: AfPendingEntry = {
      id: 2,
      comp: "EPL",
      leagueId: 39,
      kickoff: "2026-10-10T14:00:00.000Z",
      status: "FT",
      firstSeen: "2026-10-10T21:30:00.000Z",
      requeries: 1,
    };
    const r = requeueAfPending({
      pending: [],
      outcomes: [
        { task: task(1, null), result: { kind: "fetched" } },
        { task: task(2, old), result: { kind: "fetched" } },
        { task: task(3, null), result: { kind: "fetched" } },
      ],
      ids: new Set([3]),
      incomplete: new Set([1, 2]),
      now: NOW,
    });
    expect(r.fixtures.map((f) => [f.id, f.requeries])).toEqual([
      [1, 0],
      [2, 2],
      [3, 1],
    ]);
  });

  /** 실행을 여러 번 흉내 낸다 — 날짜 조회(1575180이 든 2026-10-10 목록) → 계획 → 받기 → 이월 → 원장 */
  function simulate(runs: readonly string[], completeOnFetch: number | null) {
    const competitions = CompetitionsFileSchema.parse(
      readJson("configs/competitions.json"),
    );
    const targets = buildAfTargetConfig({
      competitions,
      koreanPlayers: KoreanPlayersFileSchema.parse(
        readJson("configs/korean-players.json"),
      ),
      teamIds: TeamIdsFileSchema.parse(readJson("configs/team-ids.json")),
    }).targets;
    const item = readAfJson<{ response: unknown[] }>(
      "fixtures-date-2026-10-10.json",
    ).response.find(
      (raw) => (raw as { fixture: { id: number } }).fixture.id === 1575180,
    );
    const fixture = toAfFixture(item)!;
    const window = {
      start: "2026-10-10T00:00:00.000Z",
      end: "2026-10-11T00:00:00.000Z",
    };
    let pending: AfPendingEntry[] = [];
    let stored = false;
    let incomplete = false;
    let fetches = 0;
    const perRun: number[] = [];
    for (const now of runs) {
      const listed = afQueryDates(now, window).includes("2026-10-10");
      const known = ledgerPlanKnown(
        {
          known: new Set(stored ? [1575180] : []),
          incomplete: new Set(stored && incomplete ? [1575180] : []),
        },
        new Set(pending.map((p) => p.id)),
      );
      const plan = planAfFetches({
        fixtures: listed ? [fixture] : [],
        pending,
        known,
        targets,
        briefWindow: window,
        now,
      });
      const outcomes: AfTaskOutcome[] = plan.tasks.map((t) => ({
        task: t,
        result: { kind: "fetched" },
      }));
      fetches += outcomes.length;
      perRun.push(outcomes.length);
      const next = nextAfPending({ plan, outcomes, now });
      if (outcomes.length > 0) {
        stored = true;
        incomplete = completeOnFetch === null || fetches < completeOnFetch;
      }
      pending = requeueAfPending({
        pending: next.fixtures,
        outcomes,
        ids: new Set(),
        incomplete: new Set(outcomes.length > 0 && incomplete ? [1575180] : []),
        now,
      }).fixtures;
    }
    return { fetches, perRun, pending, incomplete };
  }

  // 킥오프 2026-10-10 13:30Z — 10-11 21:30Z 실행까지 날짜 조회(어제)에 나온다
  const RUNS = [
    "2026-10-10T21:30:00.000Z", // 오늘 조회 — 처음 받음
    "2026-10-11T03:30:00.000Z", // 어제 조회 — 수동·백업 실행이 같은 창 안에 여러 번
    "2026-10-11T09:30:00.000Z",
    "2026-10-11T15:30:00.000Z",
    "2026-10-11T21:30:00.000Z", // 여전히 날짜 조회에 나오지만 확정됐다
    "2026-10-12T21:30:00.000Z",
    "2026-10-13T21:30:00.000Z",
  ];

  it("계속 불완전하면 처음 1회 + 재조회 3회 = 4회 뒤 확정 — 날짜 창 안에서 더 실행해도 다시 받지 않는다(횟수가 0으로 돌아가지 않음)", () => {
    const r = simulate(RUNS, null);
    expect(r.perRun).toEqual([1, 1, 1, 1, 0, 0, 0]);
    expect(r.fetches).toBe(1 + AF_PENDING_MAX_REQUERIES);
    expect(r.pending).toEqual([]);
    // 실행을 더 늘려도 같다
    expect(simulate([...RUNS, ...RUNS.slice(4)], null).fetches).toBe(4);
  });

  it("두 번째 받기에서 완전해지면 덮어쓰고 그 뒤로 받지 않는다", () => {
    const r = simulate(RUNS, 2);
    expect(r.perRun).toEqual([1, 1, 0, 0, 0, 0, 0]);
    expect(r.incomplete).toBe(false);
    expect(r.pending).toEqual([]);
  });

  it("날짜 창을 벗어난 뒤에도 이월 재조회로 받는다 — 하루 한 번 실행이면 킥오프 후 3일 정리 규칙까지", () => {
    const daily = [
      "2026-10-10T21:30:00.000Z",
      "2026-10-11T21:30:00.000Z",
      "2026-10-12T21:30:00.000Z", // 날짜 창 밖 — 이월 재조회
      "2026-10-13T21:30:00.000Z", // 킥오프 + 3일 지남 → 정리(확정)
      "2026-10-14T21:30:00.000Z",
    ];
    const r = simulate(daily, null);
    expect(r.perRun).toEqual([1, 1, 1, 0, 0]);
    expect(r.pending).toEqual([]);
  });
});
