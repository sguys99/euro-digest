/**
 * M2-04 — 팀 slug 규칙(scripts/lib/team-slugs.ts, PRD §15 D63 ③)·팀 목록 어댑터(providers/football-data.ts `toCompetitionTeams`)·
 * 로스터(scripts/lib/team-roster.ts). 입력은 fixtures/football/football-data/teams-*-2026.json(축약)과 configs. 네트워크 없음.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  SlugSchema,
  TeamIdsFileSchema,
  type CompId,
  type TeamIdsFile,
} from "@/lib/schema";

import {
  FootballDataError,
  teamsPath,
  toCompetitionTeams,
  type CompetitionTeam,
} from "../scripts/lib/providers/football-data";
import type { TeamPairCandidate } from "../scripts/lib/team-ids";
import {
  buildTeamRoster,
  formatRosterReview,
  type CompTeamsInput,
} from "../scripts/lib/team-roster";
import {
  TEAM_SLUG_FORM_TOKENS,
  TEAM_SLUG_OVERRIDES,
  teamSlugFor,
  teamSlugFromName,
} from "../scripts/lib/team-slugs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const COMPETITIONS = CompetitionsFileSchema.parse(
  readJson("configs/competitions.json"),
);
const TEAM_IDS = TeamIdsFileSchema.parse(readJson("configs/team-ids.json"));

/** 6개 대회 teams fixture(competitions.json 순서) */
const COMP_TEAMS: CompTeamsInput[] = COMPETITIONS.map((c) => ({
  comp: c.id,
  teams: toCompetitionTeams(
    readJson(
      `fixtures/football/football-data/teams-${c.footballDataCode.toLowerCase()}-${c.season}.json`,
    ),
  ).teams,
}));
const ALL_TEAMS = new Map<number, CompetitionTeam>();
for (const { teams } of COMP_TEAMS) {
  for (const t of teams) ALL_TEAMS.set(t.fd, t);
}

describe("toCompetitionTeams — football-data 팀 목록 어댑터", () => {
  it("6개 대회 = competitions.json teamCount(UCL 36), 시즌 시작일이 2026-27, 버린 항목 없음", () => {
    for (const c of COMPETITIONS) {
      const adapted = toCompetitionTeams(
        readJson(
          `fixtures/football/football-data/teams-${c.footballDataCode.toLowerCase()}-${c.season}.json`,
        ),
      );
      expect(adapted.code).toBe(c.footballDataCode);
      expect(adapted.teams).toHaveLength(c.teamCount);
      expect(adapted.dropped).toBe(0);
      expect(adapted.seasonStart?.startsWith("2026-")).toBe(true);
    }
    expect(ALL_TEAMS.size).toBe(111); // 5대 리그 96 + UCL 그 밖 15
  });

  it("tla 공백을 떼고 표시한다(스트라스부르 원문 'RC ') · 빈 값은 null · 형식이 틀린 항목만 버린다", () => {
    const strasbourg = ALL_TEAMS.get(576)!;
    expect(strasbourg).toMatchObject({ tla: "RC", tlaPadded: true });
    expect(ALL_TEAMS.get(57)).toMatchObject({ tla: "ARS", tlaPadded: false });
    const adapted = toCompetitionTeams({
      competition: { code: "PL" },
      season: null,
      teams: [
        { id: 2, name: "B FC", shortName: " ", tla: "", area: null },
        { id: "x", name: "bad" },
        { id: 1, name: " A FC ", shortName: "A", tla: "AAA" },
      ],
    });
    expect(adapted.dropped).toBe(1);
    expect(adapted.seasonStart).toBeNull();
    expect(adapted.teams).toEqual([
      {
        fd: 1,
        name: "A FC",
        shortName: "A",
        tla: "AAA",
        tlaPadded: false,
        area: null,
      },
      {
        fd: 2,
        name: "B FC",
        shortName: null,
        tla: null,
        tlaPadded: false,
        area: null,
      },
    ]);
    expect(() => toCompetitionTeams({ teams: [] })).toThrow(FootballDataError);
    expect(teamsPath("BL1", 2026)).toBe("/competitions/BL1/teams?season=2026");
  });
});

describe("teamSlugFor — D63 ③ 규칙 + 예외표", () => {
  it("configs/team-ids.json 111팀의 slug = teamSlugFor(football-data id·정식 이름) — 새 팀도 같은 규칙으로", () => {
    const byFd = new Map(
      Object.entries(TEAM_IDS).map(([slug, e]) => [e.fd, slug]),
    );
    expect(byFd.size).toBe(111);
    for (const [fd, team] of ALL_TEAMS) {
      expect(byFd.get(fd), team.name).toBe(teamSlugFor(team));
    }
  });

  it("예외표는 이번 시즌 팀만 가리키고, 규칙 결과와 다를 때만 있다 · 이유가 있다 · slug 형식", () => {
    for (const [fd, o] of Object.entries(TEAM_SLUG_OVERRIDES)) {
      const team = ALL_TEAMS.get(Number(fd));
      expect(team, `fd ${fd}`).toBeDefined();
      expect(teamSlugFromName(team!.name).slug, team!.name).not.toBe(o.slug);
      expect(o.reason.length).toBeGreaterThan(5);
      expect(SlugSchema.safeParse(o.slug).success).toBe(true);
    }
    expect(Object.keys(TEAM_SLUG_OVERRIDES)).toHaveLength(24);
  });

  it("D63 ③ 확정 예(사용자 결정 2026-10-30)", () => {
    const slugOf = (fd: number) => teamSlugFor(ALL_TEAMS.get(fd)!);
    expect(slugOf(113)).toBe("napoli");
    expect(slugOf(108)).toBe("inter");
    expect(slugOf(1045)).toBe("paris-fc");
    expect(slugOf(7)).toBe("hamburg");
    expect(slugOf(719)).toBe("elversberg");
    expect(slugOf(524)).toBe("paris-saint-germain"); // psg로 줄이지 않는다
  });

  it("남은 slug에 숫자 토큰·앞뒤 법인 토큰이 없다", () => {
    for (const slug of Object.keys(TEAM_IDS)) {
      const parts = slug.split("-");
      expect(
        parts.some((p) => /^\d+$/.test(p)),
        slug,
      ).toBe(false);
      // 예외표의 충돌 회피 slug는 형태 토큰을 남긴다(paris-fc — PSG, club-brugge — Cercle Brugge)
      if (slug === "paris-fc" || slug === "club-brugge") continue;
      expect(TEAM_SLUG_FORM_TOKENS.has(parts[0]!), slug).toBe(false);
      expect(TEAM_SLUG_FORM_TOKENS.has(parts.at(-1)!), slug).toBe(false);
    }
  });
});

// ─── 로스터 ──────────────────────────────────────────────────────────────

function team(fd: number, name: string, tla: string | null): CompetitionTeam {
  return { fd, name, shortName: null, tla, tlaPadded: false, area: null };
}

function candidate(
  fd: number,
  af: number,
  kind: TeamPairCandidate["kind"] = "new",
): TeamPairCandidate {
  return {
    fd: { id: fd, name: `fd${fd}` },
    af: { id: af, name: `af${af}` },
    kind,
    slug: null,
    evidence: [
      {
        fdMatchId: 9000 + fd,
        afMatchId: 8000 + af,
        comp: "EPL",
        kickoff: "2026-10-20T19:00:00.000Z",
      },
    ],
  };
}

describe("buildTeamRoster — 팀 목록 → 대응표·옛 slug 표", () => {
  const base = {
    afCandidateSource: "원장 대조",
    date: "2026-10-30",
  };
  const compTeams: CompTeamsInput[] = [
    {
      comp: "SERIEA" as CompId,
      teams: [
        team(113, "SSC Napoli", "NAP"),
        team(98, "AC Milan", "MIL"),
        team(470, "Frosinone Calcio", "FRO"),
      ],
    },
    {
      comp: "LIGUE1" as CompId,
      teams: [team(512, "Stade Brestois 29", "BRE")],
    },
    {
      comp: "UCL" as CompId,
      teams: [
        team(113, "SSC Napoli", "NAP"),
        team(851, "Club Brugge KV", "BRE"),
      ],
    },
  ];
  const existing: TeamIdsFile = {
    "ssc-napoli": { fd: 113, af: 492, note: "확인 필요 · 근거 강함 — x" },
    "frosinone-calcio": { fd: 470, af: null },
  };

  it("slug·대회·af(대응표 → 원장 후보 → null)·note·옛 slug 표·약어 충돌", () => {
    const roster = buildTeamRoster({
      ...base,
      compTeams,
      existing,
      afCandidates: [candidate(98, 489), candidate(851, 569)],
      nameSlugs: [{ slug: "ac-milan", en: ["AC Milan", "Milan"] }],
    });
    expect(roster.problems).toEqual([]);
    expect(roster.rows.map((r) => [r.comp, r.slug, r.alsoIn])).toEqual([
      ["SERIEA", "frosinone", []],
      ["SERIEA", "milan", []],
      ["SERIEA", "napoli", ["UCL"]],
      ["LIGUE1", "brest", []],
      ["UCL", "club-brugge", []],
    ]);
    expect(Object.keys(roster.file)).toEqual([
      "brest",
      "club-brugge",
      "frosinone",
      "milan",
      "napoli",
    ]);
    expect(roster.file.napoli).toEqual({
      fd: 113,
      af: 492,
      note: "근거 강함 — x · slug D63 ③ 확정(M2-04 2026-10-30 · 옛 slug ssc-napoli)",
    });
    expect(roster.file.milan!.af).toBe(489);
    expect(roster.file.milan!.note).toContain("9098↔8489");
    expect(roster.file.brest).toMatchObject({ fd: 512, af: null });
    expect(roster.file.brest!.note).toMatch(/^af 미확인/);
    expect(roster.renames).toEqual({
      "ac-milan": "milan",
      "frosinone-calcio": "frosinone",
      "ssc-napoli": "napoli",
    });
    expect(roster.tlaCollisions).toEqual([
      { tla: "BRE", slugs: ["brest", "club-brugge"] },
    ]);
    expect(roster.rows.find((r) => r.slug === "milan")).toMatchObject({
      slugSource: "rule",
      afSource: "ledger",
      oldSlug: null,
    });
    expect(roster.rows.find((r) => r.slug === "brest")!.slugSource).toBe(
      "override",
    );
    const md = formatRosterReview(roster);
    expect(md).toContain("| SERIEA | **`napoli`** | `ssc-napoli` | 규칙 |");
    expect(md).toContain("- BRE: brest, club-brugge");
  });

  it("문제 감지 — 대응표 af와 다른 후보·같은 fd 후보 둘·빠진 팀·af 중복", () => {
    const roster = buildTeamRoster({
      ...base,
      compTeams,
      existing: {
        ...existing,
        "old-team": { fd: 999, af: 1 },
      },
      afCandidates: [
        candidate(113, 500),
        candidate(98, 489),
        candidate(98, 490),
        candidate(851, 492),
      ],
    });
    expect(roster.problems).toEqual([
      '대응표 "old-team"(fd 999)가 이번 시즌 6개 대회 팀 목록에 없음 — 빠짐',
      "fd 98 af 후보가 둘: 489 · 490 — 넣지 않음",
      '"napoli" af 불일치: 대응표 492 ↔ 원장 후보 500 — 대응표 유지',
      "af 492 중복: napoli · club-brugge",
    ]);
    expect(roster.file.napoli!.af).toBe(492);
  });

  it("실제 입력: 6개 대회 teams fixtures + 지금 대응표 → configs/team-ids.json과 같은 slug·id(문제 없음)", () => {
    const roster = buildTeamRoster({
      ...base,
      compTeams: COMP_TEAMS,
      existing: TEAM_IDS,
      afCandidates: [],
    });
    expect(roster.problems).toEqual([]);
    expect(roster.renames).toEqual({});
    expect(roster.rows).toHaveLength(111);
    for (const [slug, entry] of Object.entries(roster.file)) {
      expect({ fd: entry.fd, af: entry.af }, slug).toEqual({
        fd: TEAM_IDS[slug]?.fd,
        af: TEAM_IDS[slug]?.af,
      });
    }
    expect(roster.tlaCollisions).toEqual([
      { tla: "BRE", slugs: ["brentford", "brest"] },
      { tla: "FCB", slugs: ["barcelona", "bayern-munchen"] },
    ]);
    expect(roster.rows.filter((r) => r.comp === "UCL")).toHaveLength(15);
    expect(roster.rows.filter((r) => r.alsoIn.includes("UCL"))).toHaveLength(
      21,
    );
  });
});
