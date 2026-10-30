/**
 * M1-17 — 팀 → 리그 표 (scripts/lib/team-leagues.ts) — 2026-27 시즌 5대 리그 96팀. M2-04 — UCL 36팀·teamCompetitions·allTeamSlugs와
 * teams fixtures(football-data `/competitions/{code}/teams?season=2026`) 대조.
 *
 * 순위표 fixture(football-data 2026-10-11)와 대조한다: 리그별 팀 수 = competitions.json `teamCount`, 순위표의 모든 팀이 표에 있고
 * (slug = 영문 표기가 football-data 이름과 같은 사전 항목 → team-ids.json → M0-32 slug 규칙), 사전 팀 항목의 slug가 표와 어긋나지 않는다
 * (사전에 팀이 더해질 때 slug가 다르면 여기서 실패 — 표를 함께 고친다). 네트워크 없음.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  NamesKoFileSchema,
  TeamIdsFileSchema,
} from "@/lib/schema";

import {
  LEAGUE_IDS,
  TEAM_LEAGUE_INDEX,
  TEAM_LEAGUES,
  TEAM_LEAGUES_SEASON,
  UCL_TEAMS,
  allTeamSlugs,
  buildTeamLeagueIndex,
  isLeagueId,
  teamCompetitions,
  type LeagueId,
} from "../scripts/lib/team-leagues";
import { teamSlugFromName } from "../scripts/lib/team-slugs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const NAMES = NamesKoFileSchema.parse(readJson("configs/names.ko.json"));
const TEAM_IDS = TeamIdsFileSchema.parse(readJson("configs/team-ids.json"));
const COMPETITIONS = CompetitionsFileSchema.parse(
  readJson("configs/competitions.json"),
);

const STANDINGS_CODE: Record<LeagueId, string> = {
  EPL: "pl",
  LALIGA: "pd",
  SERIEA: "sa",
  BUNDESLIGA: "bl1",
  LIGUE1: "fl1",
};

interface StandingsFixture {
  standings: Array<{
    table: Array<{ team: { id: number; name: string } }>;
  }>;
}

const standingsTeams = (league: LeagueId) =>
  (
    readJson(
      `fixtures/football/football-data/standings-${STANDINGS_CODE[league]}-2026-10-11.json`,
    ) as StandingsFixture
  ).standings[0]!.table.map((row) => row.team);

const slugByEn = new Map<string, string>();
for (const e of NAMES.entries) {
  if (e.kind !== "team" || e.slug === undefined) continue;
  for (const en of e.en) slugByEn.set(en.toLowerCase(), e.slug);
}
const slugByFd = new Map<number, string>();
for (const [slug, entry] of Object.entries(TEAM_IDS)) {
  if (entry.fd !== null) slugByFd.set(entry.fd, slug);
}

describe("TEAM_LEAGUES — 2026-27 시즌 5대 리그", () => {
  it("시즌·리그 id는 competitions.json과 같고, 리그별 팀 수 = teamCount, 팀 slug는 리그를 넘어 중복이 없다", () => {
    for (const league of LEAGUE_IDS) {
      const config = COMPETITIONS.find((c) => c.id === league)!;
      expect(config.season).toBe(TEAM_LEAGUES_SEASON);
      expect(TEAM_LEAGUES[league]).toHaveLength(config.teamCount);
    }
    const all = LEAGUE_IDS.flatMap((l) => TEAM_LEAGUES[l]);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(96);
    expect(TEAM_LEAGUE_INDEX.size).toBe(96);
  });

  it.each(LEAGUE_IDS.map((l) => [l] as const))(
    "%s: 순위표 fixture의 모든 팀 = 표의 팀(slug = 사전 영문 표기 → team-ids.json → slug 규칙)",
    (league) => {
      const expected = standingsTeams(league).map(
        (team) =>
          slugByEn.get(team.name.toLowerCase()) ??
          slugByFd.get(team.id) ??
          teamSlugFromName(team.name).slug,
      );
      expect([...TEAM_LEAGUES[league]].sort()).toEqual([...expected].sort());
    },
  );

  it("사전 팀 항목 중 5대 리그 팀은 slug가 표와 같다(사전이 늘어날 때 어긋나면 여기서 실패)", () => {
    for (const league of LEAGUE_IDS) {
      for (const team of standingsTeams(league)) {
        const slug = slugByEn.get(team.name.toLowerCase());
        if (slug === undefined) continue;
        expect(TEAM_LEAGUE_INDEX.get(slug), `${team.name} → ${slug}`).toBe(
          league,
        );
      }
    }
  });

  it("isLeagueId: 5대 리그만(UCL·OTHER는 아니다), buildTeamLeagueIndex: 처음 나온 리그", () => {
    expect(isLeagueId("EPL")).toBe(true);
    expect(isLeagueId("UCL")).toBe(false);
    expect(isLeagueId("OTHER")).toBe(false);
    const index = buildTeamLeagueIndex({
      EPL: ["a"],
      LALIGA: ["a", "b"],
      SERIEA: [],
      BUNDESLIGA: [],
      LIGUE1: [],
    });
    expect([...index]).toEqual([
      ["a", "EPL"],
      ["b", "LALIGA"],
    ]);
  });
});

/** teams fixture(M2-04)의 팀 id */
const fixtureTeamIds = (code: string): number[] =>
  (
    readJson(
      `fixtures/football/football-data/teams-${code}-${TEAM_LEAGUES_SEASON}.json`,
    ) as { teams: Array<{ id: number }> }
  ).teams.map((t) => t.id);

describe("팀 목록(M2-04) — teams fixtures·team-ids.json과 같다", () => {
  it.each(LEAGUE_IDS.map((l) => [l] as const))(
    "%s: TEAM_LEAGUES = teams fixture의 팀(team-ids.json fd → slug)",
    (league) => {
      const expected = fixtureTeamIds(STANDINGS_CODE[league]).map(
        (id) => slugByFd.get(id) ?? `fd:${id}`,
      );
      expect([...TEAM_LEAGUES[league]].sort()).toEqual(expected.sort());
    },
  );

  it("UCL_TEAMS = UCL teams fixture 36팀(slug 순) — 5대 리그 21 + 그 밖 15", () => {
    const expected = fixtureTeamIds("cl").map(
      (id) => slugByFd.get(id) ?? `fd:${id}`,
    );
    expect([...UCL_TEAMS]).toEqual([...expected].sort());
    expect(UCL_TEAMS).toHaveLength(36);
    expect(UCL_TEAMS.filter((s) => TEAM_LEAGUE_INDEX.has(s))).toHaveLength(21);
  });

  it("allTeamSlugs = team-ids.json 111팀(6개 대회 팀만 대응표에 있다)", () => {
    const all = allTeamSlugs();
    expect(all).toHaveLength(111);
    expect(new Set(all).size).toBe(111);
    expect([...all].sort()).toEqual(Object.keys(TEAM_IDS).sort());
  });

  it("teamCompetitions — 리그 팀은 리그(+UCL), 5대 리그 밖 UCL 팀은 UCL, 6개 대회 밖은 null", () => {
    expect(teamCompetitions("inter")).toEqual({
      comp: "SERIEA",
      alsoIn: ["UCL"],
    });
    expect(teamCompetitions("tottenham-hotspur")).toEqual({
      comp: "EPL",
      alsoIn: [],
    });
    expect(teamCompetitions("club-brugge")).toEqual({
      comp: "UCL",
      alsoIn: [],
    });
    expect(teamCompetitions("midtjylland")).toBeNull();
  });
});
