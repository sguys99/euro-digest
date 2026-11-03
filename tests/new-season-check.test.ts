/**
 * `/new-season` 읽기 전용 점검 (M5-11, FR-156) — scripts/lib/new-season-check.ts 순수 함수. 입력은 작은 합성 시즌(리그마다 2팀 ·
 * UCL 3팀)을 스키마로 파싱해 만든다(저장소 설정에 기대지 않는다 — 시즌이 바뀌어도 이 테스트는 그대로).
 */
import { describe, expect, it } from "vitest";

import {
  BigmatchRulesFileSchema,
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  MatchLedgerMetaSchema,
  NamesKoFileSchema,
  NationalTeamFileSchema,
  TeamColorsFileSchema,
  TeamIdsFileSchema,
  TransferWindowsFileSchema,
  type CompId,
} from "@/lib/schema";

import {
  checkNewSeason,
  formatNewSeasonReport,
  parseSeasonArg,
  seasonSpan,
  type NewSeasonInput,
  type NewSeasonReport,
} from "../scripts/lib/new-season-check";

type League = Exclude<CompId, "UCL">;

const LEAGUE_TEAMS: Record<League, [string, string]> = {
  EPL: ["arsenal", "chelsea"],
  LALIGA: ["barcelona", "real-madrid"],
  SERIEA: ["inter", "milan"],
  BUNDESLIGA: ["bayern-munchen", "borussia-dortmund"],
  LIGUE1: ["paris-saint-germain", "marseille"],
};
const UCL = ["arsenal", "porto", "psv"];
const ALL = [...Object.values(LEAGUE_TEAMS).flat(), "porto", "psv"];

const comp = (id: CompId, i: number, teamCount: number) => ({
  id,
  nameKo: id,
  nameEn: id,
  shortKo: id.slice(0, 6),
  footballDataCode: (["PL", "PD", "SA", "BL1", "FL1", "CL"] as const)[i]!,
  apiFootballLeagueId: i + 1,
  season: 2026,
  startDate: "2026-08-20",
  endDate: i === 5 ? "2027-06-05" : "2027-05-30",
  teamCount,
  zones: [],
});

function baseInput(): NewSeasonInput {
  const competitions = CompetitionsFileSchema.parse([
    ...(Object.keys(LEAGUE_TEAMS) as League[]).map((id, i) => comp(id, i, 2)),
    comp("UCL", 5, 3),
  ]);
  const teamIds = TeamIdsFileSchema.parse(
    Object.fromEntries(ALL.map((s, i) => [s, { fd: 100 + i, af: 500 + i }])),
  );
  const teamColors = TeamColorsFileSchema.parse(
    Object.fromEntries(
      ALL.map((s) => [s, { colors: ["#14213D", "#FFFFFF"], short: "ABC" }]),
    ),
  );
  const names = NamesKoFileSchema.parse({
    entries: ALL.map((s) => ({
      ko: `팀 ${s}`,
      en: [s],
      kind: "team",
      slug: s,
    })),
  });
  const koreanPlayers = KoreanPlayersFileSchema.parse([
    {
      slug: "kim-min-jae",
      nameKo: "김민재",
      nameEn: "Min-jae Kim",
      team: "bayern-munchen",
      comp: "BUNDESLIGA",
      position: "DF",
      birthYear: 1996,
      apiFootballId: 1,
      active: true,
    },
    {
      slug: "yang-min-hyeok",
      nameKo: "양민혁",
      nameEn: "Min-hyeok Yang",
      team: "westerlo",
      comp: "OTHER",
      position: "FW",
      birthYear: 2006,
      apiFootballId: 2,
      active: false,
    },
  ]);
  const window = (
    league: League,
    season: number,
    kind: "summer" | "winter",
    opensAt: string,
    closesAt: string,
    sourceUrl?: string,
  ) => ({
    comp: league,
    season,
    kind,
    opensAt,
    closesAt,
    ...(sourceUrl ? { sourceUrl } : {}),
  });
  const transferWindows = TransferWindowsFileSchema.parse({
    boost: 1.5,
    windows: (Object.keys(LEAGUE_TEAMS) as League[]).flatMap((l) => [
      window(
        l,
        2026,
        "winter",
        "2027-01-01T00:00:00.000Z",
        "2027-02-01T23:00:00.000Z",
        "https://example.com/w",
      ),
      window(
        l,
        2027,
        "summer",
        "2027-06-14T00:00:00.000Z",
        "2027-09-01T22:00:00.000Z",
      ),
    ]),
  });
  const nationalTeam = NationalTeamFileSchema.parse({
    matches: [
      {
        id: "2026-11-14-friendly",
        kickoff: "2026-11-14T11:00:00Z",
        opponent: "볼리비아",
        home: true,
        competition: "친선경기",
        status: "scheduled",
        result: null,
      },
    ],
  });
  const bigmatch = BigmatchRulesFileSchema.parse({
    window: { fromKst: "18:00", toKst: "07:00" },
    maxMatches: 5,
    minScore: 0,
    rules: {
      korean: { weight: 5 },
      ucl: { weight: 4 },
      topClash: { weight: 4, topN: 6 },
      derby: {
        weight: 4,
        list: [{ name: "밀라노 더비", teams: ["inter", "milan"] }],
      },
      closeRace: { weight: 2, maxPointsGap: 3 },
      bigClub: { weight: 1, teams: ["real-madrid", "barcelona"] },
    },
  });
  const ledgerMeta = MatchLedgerMetaSchema.parse({
    season: 2026,
    since: "2026-10-19",
    playerSince: { "kim-min-jae": "2026-10-19" },
    gaps: [],
  });
  return {
    competitions,
    teamIds,
    teamColors,
    names,
    koreanPlayers,
    transferWindows,
    nationalTeam,
    bigmatch,
    formations: {},
    table: { season: 2026, leagues: LEAGUE_TEAMS, ucl: UCL },
    knownPlayerTeams: { "harry-kane": "bayern-munchen" },
    bigClubs: ["real-madrid", "barcelona"],
    ledgerMeta,
    competitionFiles: competitions.map((c) => ({ comp: c.id, season: 2026 })),
    teamFiles: [...ALL].sort(),
    ogTeamImages: [...ALL].sort(),
  };
}

const TODAY = "2026-11-03";

/** 심각도별 메시지(섹션 id 접두) */
function messages(report: NewSeasonReport, severity: string): string[] {
  return report.sections.flatMap((s) =>
    s.findings
      .filter((f) => f.severity === severity)
      .map((f) => `${s.id}: ${f.message}`),
  );
}

describe("checkNewSeason — 지금 시즌 정합성", () => {
  it("맞물린 입력은 오류·경고 0 → 준비됨, 섹션 8개 순서 고정", () => {
    const report = checkNewSeason(baseInput(), { target: 2026, today: TODAY });
    expect(report.sections.map((s) => s.id)).toEqual([
      "timing",
      "season",
      "teams",
      "korean",
      "bigmatch",
      "windows",
      "national",
      "derived",
    ]);
    expect(messages(report, "error")).toEqual([]);
    expect(messages(report, "warn")).toEqual([]);
    expect(report.current).toBe(2026);
    expect(report.ready).toBe(true);
    const lines = formatNewSeasonReport(report);
    expect(lines[0]).toContain(
      "대상 2026-27 · 설정 2026-27 · 기준일 2026-11-03",
    );
    expect(lines.at(-1)).toMatch(/오류 0 · 경고 0 · 참고 1 → 준비됨$/); // 비활성 선수 참고
    expect(lines).toContain(
      "✓ 팀 목록 — 6개 대회 12팀(5대 리그 10 + UCL만 2) · team-ids 12 · team-colors 12",
    );
  });

  it("모든 대회가 끝난 뒤 같은 시즌으로 돌리면 '다음 시즌 전환 차례' 경고", () => {
    const report = checkNewSeason(baseInput(), {
      target: 2026,
      today: "2027-06-06",
    });
    expect(messages(report, "warn")).toContainEqual(
      expect.stringMatching(
        /^timing: .*모든 대회가 끝났다\(2027-06-05\).*2027-28/,
      ),
    );
  });

  it("원장 meta가 없으면 참고만(정기 운영 전)", () => {
    const report = checkNewSeason(
      { ...baseInput(), ledgerMeta: null },
      { target: 2026, today: TODAY },
    );
    expect(messages(report, "info")).toContainEqual(
      expect.stringMatching(/^season: 경기 원장 meta 없음/),
    );
    expect(report.ready).toBe(true);
  });
});

describe("checkNewSeason — 다음 시즌 남은 일", () => {
  it("시즌 중에 다음 시즌을 보면 시기 경고 + 대회 시즌(한 줄로 묶음)·팀 표 시즌 오류, 원장 meta는 참고(다음 정기 수집이 새로 쓴다)", () => {
    const report = checkNewSeason(baseInput(), { target: 2027, today: TODAY });
    expect(messages(report, "warn")).toContainEqual(
      expect.stringMatching(
        /^timing: 설정 시즌 2026-27이 아직 시즌 중.*2027-06-05 뒤/,
      ),
    );
    expect(messages(report, "error")).toEqual([
      "season: competitions.json season 2026 ≠ 대상 2027: EPL·LALIGA·SERIEA·BUNDESLIGA·LIGUE1·UCL",
      "season: 팀 → 리그 표 TEAM_LEAGUES_SEASON 2026 ≠ 대상 2027",
    ]);
    expect(messages(report, "info")).toContainEqual(
      expect.stringMatching(
        /^season: 원장 meta\.season 2026\(since 2026-10-19\) — 설정을 2027로 바꾼 뒤 날짜를 받은 첫 정기 수집이 새 메타를 쓴다/,
      ),
    );
    expect(report.ready).toBe(false);
  });

  it("원장 meta가 대상보다 뒤 시즌이면 오류(설정 되돌림)", () => {
    const input = baseInput();
    const report = checkNewSeason(
      { ...input, ledgerMeta: { ...input.ledgerMeta!, season: 2027 } },
      { target: 2026, today: TODAY },
    );
    expect(messages(report, "error")).toContainEqual(
      expect.stringMatching(
        /^season: 원장 meta\.season 2027이 대상 2026보다 뒤/,
      ),
    );
  });

  it("시즌이 끝난 뒤면 시기는 참고(전환 시기)", () => {
    const report = checkNewSeason(baseInput(), {
      target: 2027,
      today: "2027-07-01",
    });
    expect(
      messages(report, "warn").filter((m) => m.startsWith("timing")),
    ).toEqual([]);
    expect(messages(report, "info")).toContainEqual(
      expect.stringMatching(
        /^timing: 모든 대회 종료\(마지막 2027-06-05\) — 전환 시기/,
      ),
    );
  });

  it("대상이 설정보다 이르면 오류", () => {
    const report = checkNewSeason(baseInput(), { target: 2025, today: TODAY });
    expect(messages(report, "error")).toContainEqual(
      "timing: 대상 2025-26이 설정 시즌 2026-27보다 이르다",
    );
  });

  it("시즌을 바꾸고 날짜 연도를 그대로 두면 startDate·endDate 연도 오류, 대회 시즌이 섞이면 오류", () => {
    const input = baseInput();
    const competitions = input.competitions.map((c) =>
      c.id === "EPL" ? { ...c, season: 2027 } : c,
    );
    const report = checkNewSeason(
      { ...input, competitions },
      { target: 2027, today: "2027-07-01" },
    );
    const errors = messages(report, "error");
    expect(errors).toContainEqual(
      expect.stringMatching(
        /^season: competitions\.json 대회 시즌이 섞여 있음\(2026·2027\)/,
      ),
    );
    expect(errors).toContain(
      "season: EPL startDate 2026-08-20의 연도가 시즌 시작 연도 2027가 아님",
    );
    expect(errors).toContain(
      "season: EPL endDate 2027-05-30의 연도가 2028이 아님",
    );
    // 대회 파일은 아직 지난 시즌 — 다음 수집이 다시 받는다(참고)
    expect(messages(report, "info")).toContainEqual(
      expect.stringMatching(
        /^season: data\/competitions\/epl\.json 시즌 2026 ≠ 설정 2027/,
      ),
    );
  });
});

describe("checkNewSeason — 2단계 전환(리그 먼저, UCL은 추첨 뒤)", () => {
  it("5대 리그가 모두 대상이고 UCL만 한 시즌 뒤면 대회 시즌 오류 대신 경고 — 리그가 섞이면 오류", () => {
    const input = baseInput();
    const competitions = input.competitions.map((c) =>
      c.id === "UCL"
        ? c
        : {
            ...c,
            season: 2027,
            startDate: "2027-08-20",
            endDate: "2028-05-30",
          },
    );
    const lagging = checkNewSeason(
      {
        ...input,
        competitions,
        table: { ...input.table, season: 2027 },
        ledgerMeta: null,
      },
      { target: 2027, today: "2027-07-10" },
    );
    expect(messages(lagging, "error")).toEqual([]);
    expect(lagging.sections[0]!.summary).toBe(
      "설정 2027-28 · 개막 전(첫 개막 2027-08-20)",
    );
    expect(messages(lagging, "warn")).toContainEqual(
      expect.stringMatching(/^season: UCL만 2026-27 — 2단계 전환 대기/),
    );
    const mixed = checkNewSeason(
      {
        ...input,
        competitions: competitions.map((c) =>
          c.id === "LIGUE1"
            ? input.competitions.find((x) => x.id === "LIGUE1")!
            : c,
        ),
        table: { ...input.table, season: 2027 },
        ledgerMeta: null,
      },
      { target: 2027, today: "2027-07-10" },
    );
    expect(messages(mixed, "error")).toEqual([
      expect.stringMatching(
        /^season: competitions\.json 대회 시즌이 섞여 있음\(2026·2027\)/,
      ),
      "season: competitions.json season 2026 ≠ 대상 2027: LIGUE1·UCL",
    ]);
  });
});

describe("checkNewSeason — 승강 팀", () => {
  it("승격 팀이 팀 표에만 있고 강등 팀이 설정에 남으면: team-ids·team-colors 빠짐/남음 오류, 표기 경고, 팀 파일 경고·오류", () => {
    const input = baseInput();
    const leagues = {
      ...LEAGUE_TEAMS,
      EPL: ["arsenal", "sunderland"] as [string, string],
    };
    const report = checkNewSeason(
      { ...input, table: { ...input.table, leagues } },
      { target: 2026, today: TODAY },
    );
    const errors = messages(report, "error");
    expect(errors).toContainEqual(
      expect.stringMatching(
        /^teams: team-ids\.json에 없는 이번 시즌 팀 1: sunderland/,
      ),
    );
    expect(errors).toContainEqual(
      expect.stringMatching(
        /^teams: team-ids\.json에 이번 시즌 6개 대회 밖 팀 1: chelsea/,
      ),
    );
    expect(errors).toContainEqual(
      expect.stringMatching(
        /^teams: team-colors\.json에 없는 팀 1: sunderland/,
      ),
    );
    expect(errors).toContainEqual(
      expect.stringMatching(
        /^teams: team-colors\.json에 이번 시즌 밖 팀 1: chelsea/,
      ),
    );
    expect(messages(report, "warn")).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^teams: names\.ko\.json 팀 항목\(slug\)이 없는 팀 1: sunderland/,
        ),
        expect.stringMatching(
          /^derived: 팀 파일이 없는 이번 시즌 팀 1: sunderland/,
        ),
        // chelsea는 아직 team-ids에 있어 팀 파일은 경고(공개 URL 결정 대기)
        expect.stringMatching(
          /^derived: 이번 시즌 밖 팀 파일 1: chelsea\. 팀 페이지 URL/,
        ),
      ]),
    );
  });

  it("강등 팀을 team-ids에서 뺐는데 팀 파일이 남으면 오류(validate 교차 참조 7)", () => {
    const input = baseInput();
    const teamIds = Object.fromEntries(
      Object.entries(input.teamIds).filter(([slug]) => slug !== "chelsea"),
    );
    const report = checkNewSeason(
      {
        ...input,
        teamIds,
        table: {
          ...input.table,
          leagues: { ...LEAGUE_TEAMS, EPL: ["arsenal", "sunderland"] },
        },
      },
      { target: 2026, today: TODAY },
    );
    expect(messages(report, "error")).toContainEqual(
      expect.stringMatching(
        /^derived: 이번 시즌 밖 팀 파일 1: chelsea — team-ids에 없는 팀 파일은 validate 오류/,
      ),
    );
  });

  it("팀 수 ≠ teamCount, 두 리그에 든 팀, fd·af null, 시즌 밖 formations", () => {
    const input = baseInput();
    const report = checkNewSeason(
      {
        ...input,
        table: {
          ...input.table,
          leagues: {
            ...LEAGUE_TEAMS,
            LALIGA: ["barcelona", "real-madrid", "arsenal"],
          },
          ucl: ["arsenal", "porto"],
        },
        teamIds: {
          ...input.teamIds,
          porto: { fd: null, af: 900 },
          marseille: { fd: 901, af: null },
        },
        formations: {
          chelsea: { shape: "4-3-3", updated: "2026-10-01T00:00:00Z" },
          psv: { shape: "4-3-3", updated: "2026-10-01T00:00:00Z" },
        },
      },
      { target: 2026, today: TODAY },
    );
    const errors = messages(report, "error");
    expect(errors).toContain("teams: LALIGA 팀 표 3팀 ≠ teamCount 2");
    expect(errors).toContainEqual(
      expect.stringMatching(/^teams: UCL 팀 표 2팀 ≠ teamCount 3/),
    );
    expect(errors).toContain(
      "teams: 팀 표에서 두 리그에 든 팀: arsenal(EPL·LALIGA)",
    );
    expect(messages(report, "warn")).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^teams: football-data id\(fd\)가 null인 팀 1: porto/,
        ),
        expect.stringMatching(
          /^teams: API-Football id\(af\)가 null인 팀 1: marseille/,
        ),
      ]),
    );
    // psv는 이번 시즌 UCL 표에서 빠졌다 → formations·team-ids 남음
    expect(messages(report, "warn")).toContainEqual(
      expect.stringMatching(/^teams: formations\.json에 이번 시즌 밖 팀: psv/),
    );
  });
});

describe("checkNewSeason — 한국 선수·오늘 밤", () => {
  it("소속팀이 시즌 밖·UCL만·comp 불일치·af null은 오류, apiFootballId null·축약 별칭 표의 시즌 밖 팀은 경고", () => {
    const input = baseInput();
    const base = input.koreanPlayers[0]!;
    const players = KoreanPlayersFileSchema.parse([
      { ...base, slug: "a", team: "westerlo" },
      { ...base, slug: "b", team: "porto" },
      { ...base, slug: "c", team: "inter", comp: "EPL" },
      { ...base, slug: "d", team: "psv" },
      {
        ...base,
        slug: "e",
        team: "milan",
        comp: "SERIEA",
        apiFootballId: null,
      },
    ]);
    const report = checkNewSeason(
      {
        ...input,
        koreanPlayers: players,
        teamIds: { ...input.teamIds, psv: { fd: 5, af: null } },
        table: {
          ...input.table,
          leagues: { ...LEAGUE_TEAMS, EPL: ["arsenal", "psv"] },
        },
        knownPlayerTeams: { "harry-kane": "tottenham-hotspur" },
      },
      { target: 2026, today: TODAY },
    );
    const korean = (sev: string) =>
      messages(report, sev).filter((m) => m.startsWith("korean"));
    expect(korean("error")).toEqual([
      "korean: 활성 선수 a의 소속 westerlo가 이번 시즌 6개 대회 팀이 아님",
      "korean: 활성 선수 b의 소속 porto는 UCL에만 있는 5대 리그 밖 팀",
      "korean: 활성 선수 c comp EPL ≠ 소속 inter의 리그 SERIEA",
      "korean: 활성 선수 d comp BUNDESLIGA ≠ 소속 psv의 리그 EPL",
      expect.stringMatching(/^korean: 활성 선수 d의 소속 psv af id가 null/),
    ]);
    expect(korean("warn")).toEqual([
      "korean: 활성 선수 e apiFootballId null — 기록 연결 전",
      "korean: 축약 별칭 소속팀 표에 이번 시즌 밖 팀: harry-kane→tottenham-hotspur",
    ]);
  });

  it("더비 팀이 다른 리그(강등)면 오류, 빅클럽이 시즌 밖이면 경고(두 표 합쳐 한 줄)", () => {
    const input = baseInput();
    const bigmatch = BigmatchRulesFileSchema.parse({
      ...input.bigmatch,
      rules: {
        ...input.bigmatch.rules,
        derby: {
          weight: 4,
          list: [
            { name: "밀라노 더비", teams: ["inter", "milan"] },
            { name: "가짜 더비", teams: ["arsenal", "barcelona"] },
            { name: "강등 더비", teams: ["arsenal", "tottenham-hotspur"] },
          ],
        },
        bigClub: { weight: 1, teams: ["real-madrid", "juventus"] },
      },
    });
    const report = checkNewSeason(
      { ...input, bigmatch, bigClubs: ["juventus", "real-madrid"] },
      { target: 2026, today: TODAY },
    );
    expect(
      messages(report, "error").filter((m) => m.startsWith("bigmatch")),
    ).toEqual([
      expect.stringMatching(/^bigmatch: 더비 "가짜 더비"\(arsenal·barcelona\)/),
      expect.stringMatching(
        /^bigmatch: 더비 "강등 더비"\(arsenal·tottenham-hotspur\)/,
      ),
    ]);
    expect(messages(report, "warn")).toContain(
      "bigmatch: 빅클럽 중 이번 시즌 밖 팀: juventus",
    );
  });
});

describe("checkNewSeason — 이적 창·대표팀", () => {
  it("다음 시즌: 겨울 창 없음은 경고, 그다음 여름 창 없음은 참고, 곧 열리는 추정 창은 경고, 지난 여름 창은 보지 않는다", () => {
    const input = baseInput();
    const competitions = input.competitions.map((c) => ({
      ...c,
      season: 2027,
      startDate: "2027-08-20",
      endDate: c.id === "UCL" ? "2028-06-05" : "2028-05-30",
    }));
    const report = checkNewSeason(
      { ...input, competitions },
      { target: 2027, today: "2027-05-15" },
    );
    const windows = (sev: string) =>
      messages(report, sev).filter((m) => m.startsWith("windows"));
    expect(windows("warn")).toEqual([
      "windows: 이적 창 2027-28 겨울 없음: EPL·LALIGA·SERIEA·BUNDESLIGA·LIGUE1",
      expect.stringMatching(
        /^windows: 45일 안에 열리는 추정 창\(sourceUrl 없음\): EPL 2027 여름\(개장 2027-06-14\)/,
      ),
    ]);
    expect(windows("info")).toEqual([
      "windows: 이적 창 2028 여름 없음: EPL·LALIGA·SERIEA·BUNDESLIGA·LIGUE1",
    ]);
    // 시즌이 시작한 뒤에는 그 시즌 여름 창이 없어도 묻지 않는다(지금 시즌 2026 — baseInput에 2026 여름 창 없음)
    const now = checkNewSeason(input, { target: 2026, today: TODAY });
    expect(
      messages(now, "warn").filter((m) => m.startsWith("windows")),
    ).toEqual([]);
  });

  it("기준일 뒤 A매치가 없으면 참고", () => {
    const report = checkNewSeason(baseInput(), {
      target: 2026,
      today: "2026-11-20",
    });
    expect(messages(report, "info")).toContainEqual(
      expect.stringMatching(/^national: 기준일 뒤 A매치 일정 없음/),
    );
  });
});

describe("checkNewSeason — 팀 OG", () => {
  it("구울 것·지울 것은 참고(build:og가 처리)", () => {
    const input = baseInput();
    const report = checkNewSeason(
      {
        ...input,
        ogTeamImages: [
          ...input.ogTeamImages.filter((s) => s !== "psv"),
          "old-team",
        ],
      },
      { target: 2026, today: TODAY },
    );
    expect(messages(report, "info")).toContain(
      "derived: 팀 OG — 구울 것 1(psv) · 지울 것 1(old-team)",
    );
  });
});

describe("parseSeasonArg · seasonSpan", () => {
  it.each([
    ["2027", 2027],
    ["2027-28", 2027],
    [" 2099-00 ", 2099],
    ["2027-29", null],
    ["27-28", null],
    ["1999", null],
    ["2027/28", null],
  ] as const)("%j → %j", (raw, expected) => {
    expect(parseSeasonArg(raw)).toBe(expected);
  });

  it("seasonSpan — 2026 → 2026-27, 2099 → 2099-00", () => {
    expect(seasonSpan(2026)).toBe("2026-27");
    expect(seasonSpan(2099)).toBe("2099-00");
  });
});
