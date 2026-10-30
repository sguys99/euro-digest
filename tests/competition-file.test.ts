/**
 * M2-02 대회 파일 조립·실패 유지 (scripts/lib/competition-file.ts) + 단계 묶음 (scripts/lib/competitions-stage.ts) — 네트워크 없음.
 *
 * 필수 항목: 대회 단위 실패 격리(전일 파일·updatedAt 유지), 조각 단위 이전 값 유지, 시즌이 다른 이전 파일 무시,
 * 순위 보강(M2-03) 자리는 이번에 받은 순위에만, 파일 읽기·쓰기(원자적·검증), 18요청·미등록 팀 보고·클라이언트 경로.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CompetitionFileSchema,
  CompetitionsFileSchema,
  TeamIdsFileSchema,
  type CompetitionConfig,
  type CompetitionFile,
  type Match,
  type Scorer,
  type StandingRow,
} from "@/lib/schema";

import {
  competitionFilePath,
  mergeCompetitionFile,
  readCompetitionFile,
  serializeCompetitionFile,
  writeCompetitionFile,
  type CompetitionParts,
  type PartResult,
} from "../scripts/lib/competition-file";
import {
  fetchCompetitionFiles,
  parseCompArgs,
  SCORERS_LIMIT,
  type CompetitionsClient,
} from "../scripts/lib/competitions-stage";
import {
  createFootballDataClient,
  FOOTBALL_DATA_BASE_URL,
  FootballDataError,
} from "../scripts/lib/providers/football-data";
import { buildTeamIdIndex } from "../scripts/lib/team-ids";

import {
  FD_STANDINGS_FILES,
  readFdFixture,
} from "./support/football-data-fake";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const COMPETITIONS: CompetitionConfig[] = CompetitionsFileSchema.parse(
  JSON.parse(
    readFileSync(path.join(ROOT, "configs/competitions.json"), "utf8"),
  ),
);
const EPL = COMPETITIONS.find((c) => c.id === "EPL")!;
const TEAMS = buildTeamIdIndex(
  TeamIdsFileSchema.parse(
    JSON.parse(readFileSync(path.join(ROOT, "configs/team-ids.json"), "utf8")),
  ),
);

const T0 = "2026-10-29T22:10:00.000Z";
const T1 = "2026-10-30T22:10:00.000Z";

const row = (pos: number, team: string): StandingRow => ({
  pos,
  prevPos: null,
  team,
  played: 9,
  w: 5,
  d: 2,
  l: 2,
  gf: 15,
  ga: 9,
  pts: 17,
  form: [],
  zone: "none",
});
const match = (id: string, status: Match["status"] = "scheduled"): Match => ({
  id,
  comp: "EPL",
  round: "10",
  kickoff: "2026-11-07T15:00:00Z",
  home: "arsenal",
  away: "chelsea",
  score: status === "finished" ? { h: 1, a: 0 } : null,
  status,
});
const scorer = (player: string, goals: number): Scorer => ({
  player,
  team: "arsenal",
  goals,
  assists: null,
  penalties: null,
  played: null,
});

const previous: CompetitionFile = {
  comp: "EPL",
  season: 2026,
  provider: "football-data",
  updatedAt: T0,
  standings: [{ ...row(1, "arsenal"), prevPos: 2, form: ["W", "W"] }],
  matches: [match("fd-1", "finished")],
  scorers: [scorer("Old Name", 3)],
};

const ok = <T>(value: T): PartResult<T> => ({ ok: true, value });
const fail = <T>(): PartResult<T> => ({
  ok: false,
  errorType: "http",
  error: "football-data 응답 HTTP 500",
});
const fresh: CompetitionParts = {
  standings: ok([row(1, "chelsea"), row(2, "arsenal")]),
  matches: ok([match("fd-1", "finished"), match("fd-2")]),
  scorers: ok([scorer("New Name", 4)]),
};

// ─── 조립 ────────────────────────────────────────────────────────────────

describe("mergeCompetitionFile — 실패 시 이전 값 유지", () => {
  it("세 조각을 모두 받으면 이번 값·이번 시각", () => {
    const o = mergeCompetitionFile({
      comp: EPL,
      previous,
      parts: fresh,
      fetchedAt: T1,
    });
    expect(o.action).toBe("write");
    if (o.action !== "write") return;
    expect(o.file.updatedAt).toBe(T1);
    expect(o.file.provider).toBe("football-data");
    expect(o.file.standings.map((r) => r.team)).toEqual(["chelsea", "arsenal"]);
    expect(o.fresh).toEqual(["matches", "standings", "scorers"]);
    expect(o.kept).toEqual([]);
  });

  it("세 조각이 모두 실패하면 쓰지 않는다(전일 파일·updatedAt 유지)", () => {
    expect(
      mergeCompetitionFile({
        comp: EPL,
        previous,
        parts: { standings: fail(), matches: fail(), scorers: fail() },
        fetchedAt: T1,
      }),
    ).toEqual({ action: "keep", reason: "all-failed" });
  });

  it("일부만 실패하면 그 조각만 이전 값, updatedAt은 이전 시각(묵은 조각이 새것처럼 보이지 않게)", () => {
    const o = mergeCompetitionFile({
      comp: EPL,
      previous,
      parts: { ...fresh, scorers: fail() },
      fetchedAt: T1,
    });
    if (o.action !== "write") throw new Error("write 기대");
    expect(o.file.scorers).toEqual(previous.scorers);
    expect(o.file.matches).toHaveLength(2);
    expect(o.kept).toEqual(["scorers"]);
    expect(o.file.updatedAt).toBe(T0);
  });

  it("이전 파일이 없으면 실패 조각은 빈 배열, updatedAt은 이번 시각", () => {
    const o = mergeCompetitionFile({
      comp: EPL,
      previous: null,
      parts: { ...fresh, standings: fail() },
      fetchedAt: T1,
    });
    if (o.action !== "write") throw new Error("write 기대");
    expect(o.file.standings).toEqual([]);
    expect(o.empty).toEqual(["standings"]);
    expect(o.file.updatedAt).toBe(T1);
  });

  it("시즌·대회가 다른 이전 파일은 쓰지 않는다(시즌 전환)", () => {
    for (const prev of [
      { ...previous, season: 2025 },
      { ...previous, comp: "LALIGA" as const, matches: [] },
    ]) {
      const o = mergeCompetitionFile({
        comp: EPL,
        previous: prev,
        parts: { ...fresh, scorers: fail() },
        fetchedAt: T1,
      });
      if (o.action !== "write") throw new Error("write 기대");
      expect(o.file.scorers).toEqual([]);
      expect(o.file.updatedAt).toBe(T1);
    }
  });

  it("순위 보강(M2-03 자리)은 이번에 받은 순위에만 — 이전 파일·경기를 넘긴다", () => {
    const enrich = vi.fn(
      ({ rows }: { rows: readonly StandingRow[] }): StandingRow[] =>
        rows.map((r) => ({ ...r, prevPos: 9 })),
    );
    const o = mergeCompetitionFile({
      comp: EPL,
      previous,
      parts: fresh,
      fetchedAt: T1,
      enrichStandings: enrich,
    });
    if (o.action !== "write") throw new Error("write 기대");
    expect(enrich).toHaveBeenCalledTimes(1);
    expect(enrich.mock.calls[0]?.[0]).toMatchObject({ previous });
    expect(o.file.standings.every((r) => r.prevPos === 9)).toBe(true);

    enrich.mockClear();
    const kept = mergeCompetitionFile({
      comp: EPL,
      previous,
      parts: { ...fresh, standings: fail() },
      fetchedAt: T1,
      enrichStandings: enrich,
    });
    expect(enrich).not.toHaveBeenCalled();
    if (kept.action !== "write") throw new Error("write 기대");
    expect(kept.file.standings).toEqual(previous.standings);
  });

  it("결과가 스키마에 맞지 않으면 던진다(경기 id 중복)", () => {
    expect(() =>
      mergeCompetitionFile({
        comp: EPL,
        previous: null,
        parts: { ...fresh, matches: ok([match("fd-1"), match("fd-1")]) },
        fetchedAt: T1,
      }),
    ).toThrow();
  });
});

// ─── 파일 I/O ───────────────────────────────────────────────────────────

describe("대회 파일 읽기·쓰기", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "competition-file-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("쓰고 다시 읽으면 같다 — 파일명은 comp 소문자", async () => {
    const target = await writeCompetitionFile(dir, previous);
    expect(target).toBe(path.join(dir, "competitions", "epl.json"));
    expect(readFileSync(target, "utf8")).toBe(
      serializeCompetitionFile(previous),
    );
    expect(await readCompetitionFile(dir, "EPL")).toEqual({
      status: "ok",
      file: previous,
    });
  });

  it("없으면 missing, 형식이 틀리면 invalid(던지지 않는다)", async () => {
    expect(await readCompetitionFile(dir, "UCL")).toEqual({
      status: "missing",
    });
    await writeCompetitionFile(dir, previous);
    writeFileSync(competitionFilePath(dir, "EPL"), "{not json");
    expect((await readCompetitionFile(dir, "EPL")).status).toBe("invalid");
    writeFileSync(
      competitionFilePath(dir, "EPL"),
      JSON.stringify({ ...previous, season: "2026" }),
    );
    expect((await readCompetitionFile(dir, "EPL")).status).toBe("invalid");
  });

  it("스키마에 맞지 않는 파일은 쓰지 않는다", async () => {
    await expect(
      writeCompetitionFile(dir, {
        ...previous,
        updatedAt: "2026-10-30T07:10:00+09:00",
      }),
    ).rejects.toThrow();
    expect((await readCompetitionFile(dir, "EPL")).status).toBe("missing");
  });
});

// ─── 단계 묶음 ───────────────────────────────────────────────────────────

/** 대회 코드 → fixture(순위는 대회별 최신, 경기·득점은 있는 파일만) */
const MATCH_FILES: Record<string, string> = {
  PL: "season-pl-2026-10-30.json",
  PD: "season-pd-2026-10-30.json",
  CL: "season-cl-md1.json",
};
const SCORER_FILES: Record<string, string> = {
  PL: "scorers-pl-2026-10-10.json",
  PD: "scorers-pd-2026-10-10.json",
  SA: "scorers-sa-2026-10-10.json",
  BL1: "scorers-bl1-2026-10-10.json",
  FL1: "scorers-fl1-2026-10-10.json",
  CL: "scorers-cl-2026-10-10.json",
};
/** 경기 fixture가 없는 대회는 빈 시즌으로 */
const emptySeason = JSON.stringify({ filters: { season: 2026 }, matches: [] });

function fakeClient(
  failures: Partial<
    Record<string, Array<"standings" | "matches" | "scorers">>
  > = {},
): CompetitionsClient & { log: string[] } {
  let calls = 0;
  const log: string[] = [];
  const boom = () => {
    throw new FootballDataError("http", "football-data 응답 HTTP 503", {
      status: 503,
    });
  };
  const hit = (code: string, part: "standings" | "matches" | "scorers") => {
    calls += 1;
    log.push(`${code}:${part}`);
    if (failures[code]?.includes(part)) boom();
  };
  return {
    log,
    get calls() {
      return calls;
    },
    retries: 0,
    async getStandings(code) {
      hit(code, "standings");
      return JSON.parse(readFdFixture(FD_STANDINGS_FILES[code]!));
    },
    async getCompetitionMatches(code) {
      hit(code, "matches");
      const file = MATCH_FILES[code];
      return JSON.parse(file ? readFdFixture(file) : emptySeason);
    },
    async getScorers(code, _season, limit) {
      hit(code, "scorers");
      expect(limit).toBe(SCORERS_LIMIT);
      return JSON.parse(readFdFixture(SCORER_FILES[code]!));
    },
  };
}

describe("fetchCompetitionFiles — 대회당 3요청, 실패 격리", () => {
  const now = () => new Date(T1);

  it("6개 대회 = 18요청, 모두 스키마에 맞는 파일", async () => {
    const client = fakeClient();
    const r = await fetchCompetitionFiles({
      client,
      competitions: COMPETITIONS,
      teams: TEAMS,
      readPrevious: async () => null,
      now,
    });
    expect(r.apiCalls).toBe(18);
    expect(client.log.slice(0, 3)).toEqual([
      "PL:standings",
      "PL:matches",
      "PL:scorers",
    ]);
    for (const res of r.results) {
      expect(res.failures, res.comp).toEqual([]);
      expect(res.outcome.action).toBe("write");
      if (res.outcome.action === "write") {
        expect(CompetitionFileSchema.parse(res.outcome.file)).toEqual(
          res.outcome.file,
        );
        expect(res.outcome.file.updatedAt).toBe(T1);
      }
    }
    const lal = r.results.find((x) => x.comp === "LALIGA")!;
    expect(
      [...lal.provisional.values()].filter((v) => v === "date"),
    ).toHaveLength(10);
    // 순위 보강 기본값(M2-03 standings-enrich.ts) — 폼은 그 대회 종료 경기에서, 첫 수집이라 prevPos는 모두 null
    for (const res of r.results) {
      if (res.outcome.action !== "write") continue;
      const { standings, matches } = res.outcome.file;
      expect(
        standings.every((s) => s.prevPos === null),
        res.comp,
      ).toBe(true);
      if (matches.some((m) => m.status === "finished")) {
        expect(
          standings.some((s) => s.form.length > 0),
          res.comp,
        ).toBe(true);
      }
    }
  });

  it("한 대회 조각 실패는 그 조각만 이전 값, 다른 대회는 영향 없음", async () => {
    const client = fakeClient({ PD: ["standings"] });
    const prevLaliga: CompetitionFile = {
      ...previous,
      comp: "LALIGA",
      matches: [],
      standings: [row(1, "barcelona")],
    };
    const r = await fetchCompetitionFiles({
      client,
      competitions: COMPETITIONS,
      teams: TEAMS,
      readPrevious: async (comp) => (comp === "LALIGA" ? prevLaliga : null),
      now,
    });
    expect(r.apiCalls).toBe(18);
    const lal = r.results.find((x) => x.comp === "LALIGA")!;
    expect(lal.failures).toEqual([
      {
        part: "standings",
        errorType: "http",
        error: "football-data 응답 HTTP 503",
      },
    ]);
    if (lal.outcome.action !== "write") throw new Error("write 기대");
    expect(lal.outcome.file.standings).toEqual(prevLaliga.standings);
    expect(lal.outcome.file.updatedAt).toBe(T0);
    const epl = r.results.find((x) => x.comp === "EPL")!;
    expect(epl.outcome.action === "write" && epl.outcome.file.updatedAt).toBe(
      T1,
    );
  });

  it("대회 전체 실패는 keep(파일을 쓰지 않음) — 다음 대회는 계속", async () => {
    const r = await fetchCompetitionFiles({
      client: fakeClient({ SA: ["standings", "matches", "scorers"] }),
      competitions: COMPETITIONS,
      teams: TEAMS,
      readPrevious: async () => null,
      now,
    });
    const sa = r.results.find((x) => x.comp === "SERIEA")!;
    expect(sa.outcome).toEqual({ action: "keep", reason: "all-failed" });
    expect(sa.failures).toHaveLength(3);
    expect(r.results.at(-1)?.outcome.action).toBe("write");
  });

  it("미등록 팀은 어느 조각에서 나왔는지와 함께 보고한다", async () => {
    const byFd = new Map(TEAMS.byFd);
    byFd.delete(65); // 맨체스터 시티
    const r = await fetchCompetitionFiles({
      client: fakeClient(),
      competitions: [EPL],
      teams: { byFd },
      readPrevious: async () => null,
      now,
    });
    expect(r.results[0]?.unknownTeams).toEqual([
      {
        fd: 65,
        name: "Manchester City FC",
        parts: ["standings", "matches", "scorers"],
      },
    ]);
  });
});

describe("클라이언트 경로 — 시즌 경기·득점 순위", () => {
  it("대회별 엔드포인트에 시즌·limit을 붙이고 간격 규칙을 지킨다", async () => {
    const urls: string[] = [];
    const sleeps: number[] = [];
    let t = 0;
    const client = createFootballDataClient({
      apiKey: "test-key",
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
      fetch: async (url) => {
        urls.push(url);
        return new Response("{}", { status: 200 });
      },
    });
    await client.getCompetitionMatches("PL", 2026);
    await client.getScorers("CL", 2026, 100);
    expect(urls).toEqual([
      `${FOOTBALL_DATA_BASE_URL}/competitions/PL/matches?season=2026`,
      `${FOOTBALL_DATA_BASE_URL}/competitions/CL/scorers?season=2026&limit=100`,
    ]);
    expect(sleeps).toEqual([6_500]);
    expect(client.calls).toBe(2);
  });
});

describe("parseCompArgs — --comp", () => {
  it("쉼표·반복·대소문자를 받고 중복을 뺀다", () => {
    expect(parseCompArgs(["epl,ucl", "EPL", " laliga "])).toEqual({
      ok: true,
      comps: ["EPL", "UCL", "LALIGA"],
    });
    expect(parseCompArgs([])).toEqual({ ok: true, comps: [] });
  });

  it("모르는 대회는 오류", () => {
    expect(parseCompArgs(["EPL,MLS"])).toEqual({
      ok: false,
      error: '모르는 대회: "MLS"',
    });
  });
});
