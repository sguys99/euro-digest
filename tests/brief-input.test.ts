/**
 * M1-19 브리핑 정형 입력(scripts/lib/brief-input.ts) — 중요도 순 상한·현재 순위(상위 4위·공동 순위·진행 중 대회 제외)·연장/승부차기
 * 표기·원장 항목 득점자(M1-48 이월 — 같은 아침 두 번째 실행). 네트워크·LLM 없음 — fixtures/football 실응답으로 만든다.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  TeamIdsFileSchema,
  type CompId,
  type LedgerMatch,
} from "@/lib/schema";

import {
  BRIEF_IMPORTANCE,
  BRIEF_STANDINGS_TOP_POS,
  briefGoalsOf,
  buildBriefInput,
  isBigClub,
  matchImportance,
  mergeBriefDetails,
  serializeBriefInput,
  standingsPositions,
  standingsRefId,
  STANDINGS_NOTE,
} from "../scripts/lib/brief-input";
import {
  BRIEF_PROMPT_PATH,
  estimateBriefInputTokens,
} from "../scripts/lib/brief";
import type {
  CompStandings,
  FinishedMatch,
  MatchDetail,
} from "../scripts/lib/match-data";
import {
  ledgerMatchToDetail,
  toLedgerMatch,
} from "../scripts/lib/match-ledger";
import { toMatchDetail } from "../scripts/lib/providers/api-football";
import {
  toCompStandings,
  toFinishedResults,
} from "../scripts/lib/providers/football-data";
import { buildTeamIdIndex, linkMatchDetails } from "../scripts/lib/team-ids";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const COMPETITIONS = CompetitionsFileSchema.parse(
  readJson("configs/competitions.json"),
);
const TEAM_INDEX = buildTeamIdIndex(
  TeamIdsFileSchema.parse(readJson("configs/team-ids.json")),
);
const KOREAN_TEAM_IDS = new Set(
  KoreanPlayersFileSchema.parse(readJson("configs/korean-players.json"))
    .filter((p) => p.active)
    .map((p) => TEAM_INDEX.bySlug.get(p.team)?.fd)
    .filter((id): id is number => typeof id === "number"),
);
const RESULTS = toFinishedResults(
  (
    readJson(
      "fixtures/football/football-data/matches-6comps-2026-10-10.json",
    ) as { matches: unknown[] }
  ).matches,
  COMPETITIONS,
  { start: "2026-10-10T00:00:00.000Z", end: "2026-10-11T00:00:00.000Z" },
).results;
const STANDINGS: CompStandings[] = (
  ["pl", "pd", "sa", "bl1", "fl1"] as const
).map((code) =>
  toCompStandings(
    readJson(
      `fixtures/football/football-data/standings-${code}-2026-10-11.json`,
    ),
    COMPETITIONS.find((c) => c.footballDataCode.toLowerCase() === code)!,
    { fetchedAt: "2026-10-11T06:45:00.000Z", inProgress: 0 },
  ),
);
const COMP_BY_LEAGUE = new Map<number, CompId>(
  COMPETITIONS.map((c) => [c.apiFootballLeagueId, c.id]),
);
const DETAILS: MatchDetail[] = readdirSync(
  path.join(ROOT, "fixtures/football/api-football"),
)
  .filter((f) => f.startsWith("fixtures-id-"))
  .sort()
  .flatMap((f) => {
    const doc = readJson(`fixtures/football/api-football/${f}`) as {
      response: unknown[];
    };
    const r = toMatchDetail(doc.response[0], {
      compByLeague: COMP_BY_LEAGUE,
      fetchedAt: "2026-10-11T06:50:00.000Z",
    });
    return r.kind === "finished" ? [r.detail] : [];
  });

function build(over: Partial<Parameters<typeof buildBriefInput>[0]> = {}) {
  return buildBriefInput({
    briefDate: "2026-10-11",
    results: RESULTS,
    competitions: COMPETITIONS,
    standings: STANDINGS,
    koreanTeamIds: KOREAN_TEAM_IDS,
    ...over,
  });
}

describe("중요도 순(matchImportance — 코드 규칙)", () => {
  it("빅클럽 이름 맞춤 — 짧은 이름·정식 이름, 비슷한 이름은 아니다", () => {
    const team = (name: string, fullName: string | null = null) => ({
      name,
      fullName,
    });
    for (const name of [
      "Man City",
      "Barça",
      "Bayern",
      "Inter",
      "Milan",
      "PSG",
      "Real Madrid",
      "Tottenham",
      "Dortmund",
      "Atleti",
    ]) {
      expect(isBigClub(team(name)), name).toBe(true);
    }
    for (const name of ["Real Betis", "Paris FC", "Inter Miami", "Bremen"]) {
      expect(isBigClub(team(name)), name).toBe(false);
    }
    expect(isBigClub(team("FCB", "FC Bayern München"))).toBe(true);
  });

  it("가중치 — 한국 선수 소속팀 +3 · UCL +3 · 빅클럽 1팀당 +2 · 리그 기본 · 상위 4위 맞대결 +1 · 대승·다득점 +1", () => {
    const base = RESULTS.find((r) => r.matchId === 565812)!; // Mainz 3-4 Leverkusen(분데스, 이재성 소속 Mainz)
    const ctx = { koreanTeamIds: KOREAN_TEAM_IDS, positions: new Map() };
    expect(matchImportance(base, ctx)).toBe(
      BRIEF_IMPORTANCE.korean + BRIEF_IMPORTANCE.league.BUNDESLIGA + 1, // 7골 → 다득점
    );
    expect(matchImportance(base, { ...ctx, koreanTeamIds: new Set() })).toBe(
      BRIEF_IMPORTANCE.league.BUNDESLIGA + 1,
    );
    const clasico: FinishedMatch = {
      ...base,
      comp: "LALIGA",
      home: { id: 86, name: "Real Madrid", fullName: null },
      away: { id: 81, name: "Barça", fullName: null },
      score: { ...base.score, ft: { home: 1, away: 0 } },
    };
    const positions = new Map([
      [
        "LALIGA" as CompId,
        new Map([
          [86, 3],
          [81, 1],
        ]),
      ],
    ]);
    expect(matchImportance(clasico, { ...ctx, positions })).toBe(
      1 + 2 * BRIEF_IMPORTANCE.bigClub + BRIEF_IMPORTANCE.topClash,
    );
    expect(
      matchImportance({ ...clasico, comp: "UCL" }, { ...ctx, positions }),
    ).toBe(BRIEF_IMPORTANCE.ucl + 2 * BRIEF_IMPORTANCE.bigClub); // 순위표는 대회별 — UCL 표가 없으면 맞대결 가점 없음
  });

  it("입력 경기는 중요도 내림차순 → 킥오프 → id(2026-10-10 23경기)", () => {
    const { input } = build();
    expect(input.matches.slice(0, 5).map((m) => m.id)).toEqual([
      "m565819", // Augsburg 2-2 Bayern — 한국 선수(설영우·김민재) + 빅클럽 + 분데스
      "m564699", // Alavés 1-2 Atleti — 한국 선수(이강인) + 빅클럽 + 라리가
      "m560600", // Man United 1-1 Tottenham — 빅클럽 둘 + EPL
      "m565812", // Mainz 3-4 Leverkusen — 한국 선수(이재성) + 분데스 + 다득점
      "m560595", // Chelsea 5-1 Bournemouth — 빅클럽 + EPL + 대승
    ]);
    expect(input.matches).toHaveLength(23);
  });

  it("상한은 중요도 순으로 자른다(킥오프 순이 아님)", () => {
    const built = build({ maxMatches: 3 });
    expect(built.input.matches.map((m) => m.id)).toEqual([
      "m565819",
      "m564699",
      "m560600",
    ]);
    expect(built.excluded).toEqual({ overCap: 20 });
    // 남은 경기가 없는 대회(세리에 A·리그 1·…)의 순위는 넣지 않는다
    expect(built.input.standings.map((s) => s.id)).toEqual([
      "sBL",
      "sLL",
      "sPL",
    ]);
  });
});

describe("현재 순위(standings)", () => {
  it("입력 경기 대회의 확정 순위표 상위 4위 — 대회 순서는 그 대회 첫 경기 순, id는 s + 약칭", () => {
    const { input, standings } = build();
    expect(input.standings.map((s) => s.id)).toEqual([
      "sBL",
      "sLL",
      "sPL",
      "sSA",
      "sL1",
    ]);
    expect(standings).toEqual({
      included: ["BUNDESLIGA", "LALIGA", "EPL", "SERIEA", "LIGUE1"],
      inProgress: [],
      unsettled: [],
      multiTable: [],
    });
    const pl = input.standings.find((s) => s.id === "sPL")!;
    expect(pl).toEqual({
      id: "sPL",
      comp: "Premier League",
      note: STANDINGS_NOTE,
      rows: [
        { pos: 1, team: "Man City", played: 5, pts: 15, gd: 8 },
        { pos: 2, team: "Arsenal", played: 6, pts: 15, gd: 5 },
        { pos: 3, team: "Brighton Hove", played: 6, pts: 13, gd: 13 },
        { pos: 4, team: "Brentford", played: 6, pts: 10, gd: 6 },
      ],
    });
    expect(STANDINGS_NOTE).toBe("current table, top 4 positions only");
    expect(standingsRefId("UCL")).toBe("sUCL");
    for (const s of input.standings) {
      expect(s.rows.every((r) => r.pos <= BRIEF_STANDINGS_TOP_POS)).toBe(true);
    }
  });

  it("공동 순위는 같은 순위 팀을 모두 넣고 응답 순서를 유지한다(M1-44 이월)", () => {
    const pl = STANDINGS[0]!;
    const rows = pl.tables[0]!.rows.map((r, i) =>
      i === 4 ? { ...r, pos: 4 } : r,
    ); // 5번째 팀(Chelsea)을 4위 공동으로
    const tied: CompStandings = { ...pl, tables: [{ ...pl.tables[0]!, rows }] };
    const { input } = build({ standings: [tied] });
    expect(input.standings[0]!.rows.map((r) => [r.pos, r.team])).toEqual([
      [1, "Man City"],
      [2, "Arsenal"],
      [3, "Brighton Hove"],
      [4, "Brentford"],
      [4, "Chelsea"],
    ]);
  });

  it("진행 중 경기가 있는 대회(inProgress > 0)는 순위를 넣지 않는다 — 순위 문장 금지(M1-44 이월)", () => {
    const live = STANDINGS.map((s) =>
      s.comp === "EPL" ? { ...s, inProgress: 1 } : s,
    );
    const built = build({ standings: live });
    expect(built.input.standings.map((s) => s.id)).not.toContain("sPL");
    expect(built.standings.inProgress).toEqual(["EPL"]);
    // 진행 중 표는 중요도의 맞대결 가점에도 쓰지 않는다
    expect(standingsPositions(live).has("EPL")).toBe(false);
  });

  it("결과를 기다리는 football-data 경기가 있는 대회(unsettledComps — 보충 포함, D60)는 순위를 넣지 않고 맞대결 가점에도 쓰지 않는다", () => {
    const unsettledComps = new Set<CompId>(["LALIGA"]);
    const built = build({ unsettledComps });
    expect(built.input.standings.map((s) => s.id)).not.toContain("sLL");
    expect(built.standings.unsettled).toEqual(["LALIGA"]);
    expect(built.standings.included).not.toContain("LALIGA");
    expect(standingsPositions(STANDINGS, unsettledComps).has("LALIGA")).toBe(
      false,
    );
    // 진행 중 판정이 먼저 — 두 조건이 겹치면 inProgress로 센다
    const live = STANDINGS.map((s) =>
      s.comp === "LALIGA" ? { ...s, inProgress: 1 } : s,
    );
    const both = build({ standings: live, unsettledComps });
    expect(both.standings.inProgress).toEqual(["LALIGA"]);
    expect(both.standings.unsettled).toEqual([]);
  });

  it("표가 여러 개인 대회(그룹 스테이지)는 넣지 않는다", () => {
    const bl = STANDINGS.find((s) => s.comp === "BUNDESLIGA")!;
    const grouped = { ...bl, tables: [bl.tables[0]!, bl.tables[0]!] };
    const built = build({
      standings: STANDINGS.map((s) => (s === bl ? grouped : s)),
    });
    expect(built.standings.multiTable).toEqual(["BUNDESLIGA"]);
    expect(built.input.standings.map((s) => s.id)).not.toContain("sBL");
  });

  it("순위를 넘기지 않으면 빈 배열 — 키는 늘 있다", () => {
    const { input } = build({ standings: undefined });
    expect(input.standings).toEqual([]);
    expect(Object.keys(input)).toEqual(["briefDate", "matches", "standings"]);
  });
});

describe("득점자 — 원장 항목(같은 아침 두 번째 실행, M1-48 이월)", () => {
  const linked = (details: readonly MatchDetail[]) =>
    new Map(
      linkMatchDetails(RESULTS, details, TEAM_INDEX).links.map(
        (l) => [l.fd.matchId, l.af] as const,
      ),
    );

  it("원장 항목 → 상세 변환은 득점 목록·스코어·끝난 방식을 그대로 옮긴다(briefGoalsOf 결과가 같다)", () => {
    for (const detail of DETAILS) {
      const entry: LedgerMatch = toLedgerMatch(detail, []);
      const back = ledgerMatchToDetail(entry)!;
      expect(back.matchId).toBe(detail.matchId);
      expect(back.score.ft).toEqual(detail.score.ft);
      expect(back.score.pens).toEqual(detail.score.pens);
      expect(back.score.duration).toBe(detail.score.duration);
      expect(back.goalsComplete).toBe(detail.goalsComplete);
      expect(back.lineups).toEqual({ home: null, away: null }); // 원장은 한국 선수 행만 — 라인업 없음
      const match = { home: detail.home, away: detail.away };
      expect(briefGoalsOf(match, back)).toEqual(briefGoalsOf(match, detail));
    }
    expect(
      ledgerMatchToDetail({ ...toLedgerMatch(DETAILS[0]!, []), id: "x-1" }),
    ).toBeNull();
  });

  it("이번 실행이 받지 않은 경기는 원장 항목으로 잇는다 — 같은 id는 이번 실행 상세가 먼저", () => {
    const ledger = DETAILS.map((d) =>
      ledgerMatchToDetail(toLedgerMatch(d, []))!,
    );
    // 두 번째 실행: 브리핑 몫이 비었다(원장의 경기는 다시 받지 않음)
    const merged = mergeBriefDetails([], ledger);
    expect(merged.fromLedger).toBe(ledger.length);
    const second = build({ linked: linked(merged.details) });
    const first = build({ linked: linked(DETAILS) });
    expect(second.goals).toEqual(first.goals);
    expect(second.goals.filled).toBe(7);
    expect(second.input.matches).toEqual(first.input.matches);
    // 이번 실행 상세가 있으면 그쪽(더 새 응답)
    const fresh = { ...DETAILS[0]!, goalsComplete: false };
    const both = mergeBriefDetails([fresh], ledger);
    expect(both.details[0]).toBe(fresh);
    expect(both.fromLedger).toBe(ledger.length - 1);
  });
});

describe("입력 크기 — 비용 가드 입력 어림(M1-22·M1-20 이월)", () => {
  it("실측 비율(영문 JSON 약 1.89자/토큰, 한국어 지시문 0.96토큰/자 — M0-30 긴 판 2,119자 → 2,034토큰)보다 넉넉하게 잡는다", () => {
    // 지시문 v0.1(configs/prompts/summarize.md)은 M0-30 긴 판과 글자 구성이 같다(tests/brief-prompt.test.ts가 지킨다)
    const system = read(BRIEF_PROMPT_PATH).trim();
    const user = serializeBriefInput(build({ linked: new Map() }).input);
    const estimate = estimateBriefInputTokens({ system, user });
    const measuredLike = system.length * (2034 / 2119) + user.length / 1.89;
    expect(estimate).toBeGreaterThan(measuredLike * 1.1);
    // 23경기 + 5개 리그 상위 4위 — M0-34 입력 E(8,619자, 한국 선수 블록 포함)보다 작다
    expect(user.length).toBeLessThan(8619);
  });
});
