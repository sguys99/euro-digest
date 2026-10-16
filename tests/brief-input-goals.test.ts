/**
 * M1-48b ⑥ 브리핑 입력 득점자(scripts/lib/brief-input.ts) — 연결된 경기(대응표·D37 증거) 중 득점 목록이 완전한 경기만 `goals`.
 * 네트워크·LLM 없음. 기준: M0-34 실측 입력(fixtures/llm/brief-inputs/2026-10-11.json — 같은 API-Football 응답으로 사람이 만든 것).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  TeamIdsFileSchema,
  type CompId,
} from "@/lib/schema";

import {
  BRIEF_MAX_MATCHES,
  briefGoalsOf,
  buildBriefInput,
  type BriefInputMatch,
} from "../scripts/lib/brief-input";
import type { FinishedMatch, MatchDetail } from "../scripts/lib/match-data";
import { toMatchDetail } from "../scripts/lib/providers/api-football";
import { toFinishedResults } from "../scripts/lib/providers/football-data";
import { buildTeamIdIndex, linkMatchDetails } from "../scripts/lib/team-ids";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

const COMPETITIONS = CompetitionsFileSchema.parse(
  readJson("configs/competitions.json"),
);
const COMP_BY_LEAGUE = new Map<number, CompId>(
  COMPETITIONS.map((c) => [c.apiFootballLeagueId, c.id]),
);
const FD_RESULTS = toFinishedResults(
  (
    readJson(
      "fixtures/football/football-data/matches-6comps-2026-10-10.json",
    ) as { matches: unknown[] }
  ).matches,
  COMPETITIONS,
  { start: "2026-10-10T00:00:00.000Z", end: "2026-10-11T00:00:00.000Z" },
).results;
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
const M0_34 = readJson("fixtures/llm/brief-inputs/2026-10-11.json") as {
  matches: Array<Pick<BriefInputMatch, "id" | "goals">>;
};

function linkedMap(
  index = buildTeamIdIndex(
    TeamIdsFileSchema.parse(readJson("configs/team-ids.json")),
  ),
) {
  const links = linkMatchDetails(FD_RESULTS, DETAILS, index).links;
  return new Map(links.map((l) => [l.fd.matchId, l.af] as const));
}

describe("buildBriefInput — 연결된 경기의 득점자(M1-48b ⑥)", () => {
  it("2026-10-10 연결 7경기의 goals가 M0-34 실측 입력과 같다(분·추가 시간·팀·득점자·도움·PK) — 나머지 16경기는 null", () => {
    const built = buildBriefInput({
      briefDate: "2026-10-11",
      results: FD_RESULTS,
      competitions: COMPETITIONS,
      maxMatches: BRIEF_MAX_MATCHES,
      linked: linkedMap(),
    });
    expect(built.goals).toEqual({ filled: 7, incomplete: 0 });
    const filled = built.input.matches.filter((m) => m.goals !== null);
    expect(filled.map((m) => m.id).sort()).toEqual(
      [
        "m559672",
        "m560601",
        "m564699",
        "m565812",
        "m565815",
        "m565817",
        "m565819",
      ].sort(),
    );
    for (const m of filled) {
      const ref = M0_34.matches.find((r) => r.id === m.id);
      expect([m.id, m.goals]).toEqual([m.id, ref?.goals]);
    }
    // 키 순서도 M0-30 표기(min·team·player·assist·type)
    const alaves = filled.find((m) => m.id === "m564699")!;
    expect(JSON.stringify(alaves.goals?.find((g) => g.type))).toBe(
      '{"min":"45+6","team":"Alavés","player":"Lucas Boyé","type":"penalty"}',
    );
    expect(built.input.matches.filter((m) => m.goals === null)).toHaveLength(
      16,
    );
  });

  it("D37 — 대응표가 비어도 강한 증거로 연결된 경기는 득점자를 넣는다", () => {
    const built = buildBriefInput({
      briefDate: "2026-10-11",
      results: FD_RESULTS,
      competitions: COMPETITIONS,
      linked: linkedMap(buildTeamIdIndex({})),
    });
    expect(built.goals.filled).toBe(7);
  });

  it("득점 목록이 불완전(goalsComplete false)하면 연결돼도 null — incomplete로 센다", () => {
    const map = linkedMap();
    const [first] = [...map.keys()];
    map.set(first!, { ...map.get(first!)!, goalsComplete: false });
    const built = buildBriefInput({
      briefDate: "2026-10-11",
      results: FD_RESULTS,
      competitions: COMPETITIONS,
      linked: map,
    });
    expect(built.goals).toEqual({ filled: 6, incomplete: 1 });
    expect(
      built.input.matches.find((m) => m.id === `m${first}`)?.goals,
    ).toBeNull();
  });

  it("연결 없이 부르면 기존처럼 모두 null(슬라이스 동작 유지)", () => {
    const built = buildBriefInput({
      briefDate: "2026-10-11",
      results: FD_RESULTS,
      competitions: COMPETITIONS,
    });
    expect(built.goals).toEqual({ filled: 0, incomplete: 0 });
    expect(built.input.matches.every((m) => m.goals === null)).toBe(true);
  });
});

describe("briefGoalsOf — 자책골·PK·0-0", () => {
  const fdNice: Pick<FinishedMatch, "home" | "away"> = {
    home: { id: 522, name: "Nice", fullName: null },
    away: { id: 576, name: "Strasbourg", fullName: null },
  };

  it("자책골(1552779): team = 득점 인정 팀(Nice), type own_goal, 도움 없음 — 득점자는 자책한 선수", () => {
    const d = DETAILS.find((x) => x.matchId === 1552779)!;
    expect(briefGoalsOf(fdNice, d)).toEqual([
      expect.objectContaining({ min: "41", team: "Strasbourg" }),
      { min: "45", team: "Nice", player: "P. Demba", type: "own_goal" },
      expect.objectContaining({ min: "81", team: "Nice" }),
    ]);
  });

  it("경기 중 PK는 type penalty, 놓친 PK는 득점이 아니다(1552780 PSG 3-1 — 3+1건)", () => {
    const d = DETAILS.find((x) => x.matchId === 1552780)!;
    const goals = briefGoalsOf(
      {
        home: { id: 524, name: "PSG", fullName: null },
        away: { id: 1, name: "Le Mans", fullName: null },
      },
      d,
    )!;
    expect(goals).toHaveLength(4);
    expect(goals.filter((g) => g.type === "penalty")).toHaveLength(1);
  });

  it("0-0 완전한 경기는 빈 배열(득점 없음이 사실), 불완전이면 null", () => {
    expect(briefGoalsOf(fdNice, { goals: [], goalsComplete: true })).toEqual(
      [],
    );
    expect(
      briefGoalsOf(fdNice, { goals: [], goalsComplete: false }),
    ).toBeNull();
  });
});
