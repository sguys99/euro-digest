/**
 * M5-18 팀 id 대응표 Highlightly 열(`hl`) 채우기(scripts/lib/team-ids-hl.ts, PRD §15 D80) — 네트워크 없음. Highlightly UCL 2026-11-04
 * 목록 실측(fixtures/highlightly)과 합성 football-data 대회 파일 경기로 검증한다. 필수 항목: 짝짓기 근거(대회·킥오프·스코어 + 후보 하나),
 * 같은 시각·같은 스코어 경기 모호 → 앞 회에 채운 팀으로 좁혀 되풀이, 기존 hl 유지·불일치 보고, 키 순서·note 근거, 스키마 통과,
 * 현재 configs/team-ids.json이 6개 대회 111팀 모두 hl을 가진다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  TeamIdsFileSchema,
  type CompetitionsFile,
  type Match,
  type TeamIdsFile,
} from "@/lib/schema";

import {
  fdPairingFromCompetitionFiles,
  fillHighlightlyTeamIds,
  fillHighlightlyTeamIdsIterative,
  hlPairingFromLists,
} from "../scripts/lib/team-ids-hl";

import { hlItem, readHlJson } from "./support/highlightly-fake";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const COMPS = [
  { id: "UCL", highlightlyLeagueId: 2486 },
  { id: "EPL", highlightlyLeagueId: 33973 },
] as unknown as CompetitionsFile;

const fdMatch = (
  id: number,
  kickoff: string,
  home: string,
  away: string,
  h: number,
  a: number,
): Match => ({
  id: `fd-${id}`,
  comp: "UCL",
  round: "4",
  kickoff,
  home,
  away,
  score: { h, a },
  status: "finished",
});

const AT = "2026-11-04T20:00:00Z";
const FD = {
  UCL: {
    matches: [
      fdMatch(1, AT, "slavia-praha", "arsenal", 1, 2),
      fdMatch(2, AT, "psv", "club-brugge", 1, 2),
      // 나중 경기(합성) — 아스널만 따로 나오는 칸
      fdMatch(3, "2026-11-25T20:00:00Z", "arsenal", "porto", 3, 0),
    ],
  },
};
const TEAM_IDS: TeamIdsFile = {
  "slavia-praha": { fd: 930, af: 560 },
  arsenal: { fd: 57, af: 42 },
  psv: { fd: 674, af: 197 },
  "club-brugge": { fd: 851, af: 569, note: "기존 메모" },
  porto: { fd: 503, af: 212 },
};

const hlLists = () => [
  readHlJson("matches-ucl-2026-11-04.json"),
  {
    data: [
      hlItem({
        id: 9,
        leagueId: 2486,
        date: "2026-11-25T20:00:00.000Z",
        home: [36526, "Arsenal"],
        away: [181196, "FC Porto"],
        score: "3 - 0",
      }),
    ],
  },
];

describe("짝짓기 입력", () => {
  it("대회 파일 종료 경기 → fd id(대응표 slug), fd id 모르는 경기·미종료는 뺀다", () => {
    const pairs = fdPairingFromCompetitionFiles(
      {
        UCL: {
          matches: [
            ...FD.UCL.matches,
            { ...fdMatch(4, AT, "nobody", "arsenal", 0, 0) },
            {
              ...fdMatch(5, AT, "psv", "porto", 0, 0),
              status: "scheduled",
              score: null,
            },
          ],
        },
      },
      TEAM_IDS,
    );
    expect(pairs.map((p) => [p.matchId, p.home.id, p.away.id, p.ft])).toEqual([
      [1, 930, 57, { home: 1, away: 2 }],
      [2, 674, 851, { home: 1, away: 2 }],
      [3, 57, 503, { home: 3, away: 0 }],
    ]);
  });

  it("Highlightly 목록(껍데기·배열 모두) → 6개 대회 경기만, 같은 id는 한 번", () => {
    const pairs = hlPairingFromLists(
      [...hlLists(), readHlJson("matches-ucl-2026-11-04.json")],
      COMPS,
    );
    expect(pairs).toHaveLength(10);
    expect(pairs.every((p) => p.comp === "UCL")).toBe(true);
  });
});

describe("hl 채우기", () => {
  it("같은 시각·같은 스코어(슬라비아 1–2 아스널 · PSV 1–2 브뤼허) — 한 번으로는 모호해 못 채운다", () => {
    const one = fillHighlightlyTeamIds({
      teamIds: TEAM_IDS,
      fd: fdPairingFromCompetitionFiles(FD, TEAM_IDS),
      hl: hlPairingFromLists(hlLists(), COMPS),
      source: "테스트",
      date: "2026-11-17",
    });
    expect(one.filled.map((f) => f.slug).sort()).toEqual(["arsenal", "porto"]);
    expect(one.missing.sort()).toEqual(["club-brugge", "psv", "slavia-praha"]);
  });

  it("되풀이 — 앞 회에 채운 아스널이 같은 칸 후보를 하나로 좁혀 모두 채운다 · 키 순서 fd·af·hl·note · 스키마 통과", () => {
    const result = fillHighlightlyTeamIdsIterative({
      teamIds: TEAM_IDS,
      fd: fdPairingFromCompetitionFiles(FD, TEAM_IDS),
      hl: hlPairingFromLists(hlLists(), COMPS),
      source: "테스트",
      date: "2026-11-17",
    });
    expect(result.missing).toEqual([]);
    expect(result.problems).toEqual([]);
    expect(
      Object.fromEntries(
        Object.entries(result.file).map(([s, e]) => [s, e.hl]),
      ),
    ).toEqual({
      "slavia-praha": 477344,
      arsenal: 36526,
      psv: 168431,
      "club-brugge": 485003,
      porto: 181196,
    });
    expect(Object.keys(result.file["club-brugge"]!)).toEqual([
      "fd",
      "af",
      "hl",
      "note",
    ]);
    expect(result.file["club-brugge"]!.note).toMatch(
      /^기존 메모 · hl 485003 근거 — 종료 경기 1건/,
    );
    expect(TeamIdsFileSchema.safeParse(result.file).success).toBe(true);
  });

  it("이미 있는 hl은 바꾸지 않고, 후보와 다르면 문제로 보고한다", () => {
    const result = fillHighlightlyTeamIds({
      teamIds: { ...TEAM_IDS, porto: { fd: 503, af: 212, hl: 1 } },
      fd: fdPairingFromCompetitionFiles(FD, TEAM_IDS),
      hl: hlPairingFromLists(hlLists(), COMPS),
      source: "테스트",
      date: "2026-11-17",
    });
    expect(result.file.porto!.hl).toBe(1);
  });
});

describe("현재 configs/team-ids.json — 111팀 모두 hl(2026-11-17 --hl 실행)", () => {
  it("hl이 모두 있고 중복이 없다 · 6개 대회 Highlightly league id", () => {
    const teamIds = TeamIdsFileSchema.parse(
      JSON.parse(
        readFileSync(path.join(ROOT, "configs/team-ids.json"), "utf8"),
      ),
    );
    const entries = Object.values(teamIds);
    expect(entries).toHaveLength(111);
    expect(entries.every((e) => typeof e.hl === "number")).toBe(true);
    expect(new Set(entries.map((e) => e.hl)).size).toBe(111);
    expect(teamIds["bayern-munchen"]!.hl).toBe(134391);
    expect(teamIds.mainz!.hl).toBe(140348);
    const comps = CompetitionsFileSchema.parse(
      JSON.parse(
        readFileSync(path.join(ROOT, "configs/competitions.json"), "utf8"),
      ),
    );
    expect(
      Object.fromEntries(comps.map((c) => [c.id, c.highlightlyLeagueId])),
    ).toEqual({
      EPL: 33973,
      LALIGA: 119924,
      SERIEA: 115669,
      BUNDESLIGA: 67162,
      LIGUE1: 52695,
      UCL: 2486,
    });
  });
});
