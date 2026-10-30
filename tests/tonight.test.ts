/**
 * M2-08 — "오늘 밤 볼 경기" 선별(src/lib/tonight.ts, FR-80~82·FR-84)과 로더(src/lib/data/tonight.ts), 실제 configs/bigmatch-rules.json.
 *   - 규칙 ①~⑤ + 빅클럽 가중 합산, 상한 maxMatches, minScore, 빈 날
 *   - 창 경계(KST 18:00 포함 · 익일 07:00 제외), 유럽 서머타임 전후(2026-10-25 종료 · 2027-03-28 시작)
 *   - 동점 정렬(점수 → 킥오프 → 대회 순서 → id), tbc·연기 제외, 한국 선수 비활성
 *   - 이유 태그 = 데이터로 확인되는 사실만(D62 ③): "{선수} 소속"·더비 이름·"a·b위 맞대결"·"승점 차 n · a·b위"
 * 네트워크 없음(임시 폴더·저장소 configs만).
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadTonight } from "@/lib/data/tonight";
import {
  BigmatchRulesFileSchema,
  TeamIdsFileSchema,
  type BigmatchRulesFile,
  type KoreanPlayersFile,
  type Match,
  type StandingRow,
} from "@/lib/schema";
import {
  selectTonight,
  tonightBaseDate,
  type TonightCompetition,
  type TonightInput,
} from "@/lib/tonight";
import { zonedToUtcIso } from "@/lib/time";

import { BIG_CLUBS } from "../scripts/lib/news-keywords";
import { TEAM_LEAGUE_INDEX } from "../scripts/lib/team-leagues";

// ─── 합성 입력 ──────────────────────────────────────────────────────────────

const RULES: BigmatchRulesFile = {
  window: { fromKst: "18:00", toKst: "07:00" },
  maxMatches: 5,
  minScore: 0,
  rules: {
    korean: { weight: 5 },
    ucl: { weight: 4 },
    topClash: { weight: 4, topN: 6 },
    derby: {
      weight: 4,
      list: [
        { name: "노스런던 더비", teams: ["arsenal", "tottenham-hotspur"] },
      ],
    },
    closeRace: { weight: 2, maxPointsGap: 3 },
    bigClub: { weight: 1, teams: ["arsenal", "liverpool"] },
  },
};

const KOREAN: KoreanPlayersFile = [
  {
    slug: "kim-min-jae",
    nameKo: "김민재",
    nameEn: "Min-jae Kim",
    team: "bayern-munchen",
    comp: "BUNDESLIGA",
    position: "DF",
    birthYear: 1996,
    apiFootballId: 2897,
    active: true,
  },
  {
    slug: "lee-jae-sung",
    nameKo: "이재성",
    nameEn: "Jae-sung Lee",
    team: "mainz",
    comp: "BUNDESLIGA",
    position: "MF",
    birthYear: 1992,
    apiFootballId: 2906,
    active: true,
  },
  {
    slug: "hong-hyun-seok",
    nameKo: "홍현석",
    nameEn: "Hyun-seok Hong",
    team: "augsburg",
    comp: "OTHER",
    position: "MF",
    birthYear: 1999,
    apiFootballId: null,
    active: false,
  },
];

const BASE = "2026-10-31"; // 토요일 — 창 [2026-10-31T09:00Z, 2026-10-31T22:00Z)

function row(team: string, pos: number, pts: number, played = 9): StandingRow {
  return {
    pos,
    prevPos: null,
    team,
    played,
    w: 0,
    d: 0,
    l: 0,
    gf: 0,
    ga: 0,
    pts,
    form: [],
    zone: "none",
  };
}

let seq = 0;
function match(
  home: string,
  away: string,
  kickoff: string,
  extra: Partial<Match> = {},
): Match {
  seq += 1;
  return {
    id: `m-${String(seq).padStart(3, "0")}`,
    comp: "EPL",
    round: "10",
    kickoff,
    home,
    away,
    score: null,
    status: "scheduled",
    ...extra,
  };
}

const EPL_TABLE: StandingRow[] = [
  row("manchester-city", 1, 24),
  row("arsenal", 2, 22),
  row("liverpool", 3, 20),
  row("chelsea", 4, 15),
  row("brighton", 5, 14),
  row("brentford", 6, 13),
  row("everton", 7, 12),
  row("tottenham-hotspur", 12, 9),
  row("fulham", 13, 8),
  row("sunderland", 20, 2),
];

function input(
  competitions: TonightCompetition[],
  over: Partial<TonightInput> = {},
): TonightInput {
  return {
    rules: RULES,
    competitions,
    koreanPlayers: KOREAN,
    baseKstDate: BASE,
    ...over,
  };
}

const T = "2026-10-31T15:00:00Z"; // KST 11-01 00:00 — 창 안

// ─── 규칙·가중치 ────────────────────────────────────────────────────────────

describe("selectTonight — 규칙 ①~⑤ 점수·이유 태그 (FR-81·FR-82, D62 ③)", () => {
  it("① 한국 선수 소속 — '{선수} 소속', 두 팀 모두면 태그 2개·가중 1회", () => {
    const m = match("bayern-munchen", "mainz", T, { comp: "BUNDESLIGA" });
    const [pick] = selectTonight(
      input([{ comp: "BUNDESLIGA", standings: [], matches: [m] }]),
    ).picks;
    expect(pick?.score).toBe(5);
    expect(pick?.rules).toEqual(["korean"]);
    expect(pick?.reasons).toEqual([
      {
        kind: "korean",
        player: "kim-min-jae",
        team: "bayern-munchen",
        label: "김민재 소속",
      },
      {
        kind: "korean",
        player: "lee-jae-sung",
        team: "mainz",
        label: "이재성 소속",
      },
    ]);
  });

  it("① 비활성 선수(active false — FR-64)는 규칙·태그 없음", () => {
    const m = match("augsburg", "freiburg", T, { comp: "BUNDESLIGA" });
    const [pick] = selectTonight(
      input([{ comp: "BUNDESLIGA", standings: [], matches: [m] }]),
    ).picks;
    expect(pick).toMatchObject({ score: 0, rules: [], reasons: [] });
  });

  it("② UCL — 점수만, 이유 태그 없음(대회는 카드가 표시). ③⑤는 UCL 순위로 보지 않는다", () => {
    const m = match("arsenal", "liverpool", T, { comp: "UCL" });
    const table = [row("arsenal", 1, 9, 3), row("liverpool", 2, 9, 3)];
    const [pick] = selectTonight(
      input([{ comp: "UCL", standings: table, matches: [m] }]),
    ).picks;
    expect(pick).toMatchObject({
      score: 4 + 1,
      rules: ["ucl", "bigClub"],
      reasons: [],
    });
  });

  it("③ 상위 6위 맞대결 + ⑤ 승점 차 — 'a·b위 맞대결'(작은 순위 먼저) + '승점 차 n'(순위 반복 없음)", () => {
    const m = match("brentford", "chelsea", T);
    const [pick] = selectTonight(
      input([{ comp: "EPL", standings: EPL_TABLE, matches: [m] }]),
    ).picks;
    expect(pick?.score).toBe(4 + 2);
    expect(pick?.reasons).toEqual([
      { kind: "topClash", pos: [4, 6], label: "4·6위 맞대결" },
      { kind: "closeRace", gap: 2, pos: [4, 6], label: "승점 차 2" },
    ]);
  });

  it("③ topN 밖(7위)이 끼면 맞대결 아님 · ⑤만 — '승점 차 n · a·b위'", () => {
    const m = match("everton", "brighton", T);
    const [pick] = selectTonight(
      input([{ comp: "EPL", standings: EPL_TABLE, matches: [m] }]),
    ).picks;
    expect(pick?.rules).toEqual(["closeRace"]);
    expect(pick?.reasons).toEqual([
      { kind: "closeRace", gap: 2, pos: [5, 7], label: "승점 차 2 · 5·7위" },
    ]);
  });

  it("⑤ 승점 같음 → '승점 동률 · a·b위', 차 4는 규칙 밖", () => {
    const table = [...EPL_TABLE, row("fulham-b", 14, 8)];
    const tie = match("fulham", "fulham-b", T);
    const far = match("liverpool", "chelsea", T); // 20 vs 15 — 차 5, 둘 다 6위 안
    const picks = selectTonight(
      input([{ comp: "EPL", standings: table, matches: [tie, far] }]),
    ).picks;
    const byId = new Map(picks.map((p) => [p.match.id, p]));
    expect(byId.get(tie.id)?.reasons).toEqual([
      {
        kind: "closeRace",
        gap: 0,
        pos: [13, 14],
        label: "승점 동률 · 13·14위",
      },
    ]);
    expect(byId.get(far.id)?.rules).toEqual(["topClash", "bigClub"]);
  });

  it("③⑤는 두 팀 모두 순위표에 있고 1경기 이상 치렀을 때만", () => {
    const table = [row("manchester-city", 1, 0, 0), row("arsenal", 2, 0, 0)];
    const opening = match("manchester-city", "arsenal", T);
    const unknown = match("liverpool", "promoted-fc", T);
    const picks = selectTonight(
      input([
        { comp: "EPL", standings: table, matches: [opening] },
        { comp: "LALIGA", standings: EPL_TABLE, matches: [unknown] },
      ]),
    ).picks;
    expect(picks.map((p) => p.rules)).toEqual([["bigClub"], ["bigClub"]]);
  });

  it("④ 더비 — 순서 무관, 태그는 더비 이름", () => {
    const m = match("tottenham-hotspur", "arsenal", T);
    const [pick] = selectTonight(
      input([{ comp: "EPL", standings: EPL_TABLE, matches: [m] }]),
    ).picks;
    expect(pick?.rules).toEqual(["derby", "bigClub"]);
    expect(pick?.score).toBe(4 + 1);
    expect(pick?.reasons).toEqual([
      { kind: "derby", name: "노스런던 더비", label: "노스런던 더비" },
    ]);
  });

  it("전 규칙 합산 · 태그 순서 korean → derby → topClash → closeRace", () => {
    const rules: BigmatchRulesFile = {
      ...RULES,
      rules: {
        ...RULES.rules,
        derby: {
          weight: 4,
          list: [
            {
              name: "데어 클라시커",
              teams: ["bayern-munchen", "borussia-dortmund"],
            },
          ],
        },
        bigClub: { weight: 1, teams: ["bayern-munchen"] },
      },
    };
    const table = [
      row("bayern-munchen", 1, 17),
      row("borussia-dortmund", 2, 17),
    ];
    const m = match("bayern-munchen", "borussia-dortmund", T, {
      comp: "BUNDESLIGA",
    });
    const [pick] = selectTonight(
      input([{ comp: "BUNDESLIGA", standings: table, matches: [m] }], {
        rules,
      }),
    ).picks;
    expect(pick?.score).toBe(5 + 4 + 4 + 2 + 1);
    expect(pick?.rules).toEqual([
      "korean",
      "topClash",
      "derby",
      "closeRace",
      "bigClub",
    ]);
    expect(pick?.reasons.map((r) => r.label)).toEqual([
      "김민재 소속",
      "데어 클라시커",
      "1·2위 맞대결",
      "승점 동률",
    ]);
  });

  it("weight 0 규칙은 끈 것 — 점수·태그 모두 없음", () => {
    const rules: BigmatchRulesFile = {
      ...RULES,
      rules: {
        ...RULES.rules,
        korean: { weight: 0 },
        derby: { ...RULES.rules.derby, weight: 0 },
      },
    };
    const picks = selectTonight(
      input(
        [
          {
            comp: "EPL",
            standings: EPL_TABLE,
            matches: [
              match("tottenham-hotspur", "arsenal", T),
              match("bayern-munchen", "x", T),
            ],
          },
        ],
        { rules },
      ),
    ).picks;
    expect(picks.map((p) => [p.rules, p.reasons])).toEqual([
      [["bigClub"], []],
      [[], []],
    ]);
  });

  it("이유 태그에 추정 문구('출전'·'예상')가 없다", () => {
    const m = match("bayern-munchen", "mainz", T, { comp: "BUNDESLIGA" });
    const [pick] = selectTonight(
      input([{ comp: "BUNDESLIGA", standings: [], matches: [m] }]),
    ).picks;
    for (const r of pick?.reasons ?? [])
      expect(r.label).not.toMatch(/출전|예상/);
  });
});

// ─── 상한·minScore·빈 날·정렬 ──────────────────────────────────────────────

describe("selectTonight — 상한·빈 날·동점 정렬", () => {
  it("상위 maxMatches(5)까지만", () => {
    const matches = Array.from({ length: 8 }, (_, i) =>
      match(`team-${i}`, `team-${i}-b`, T),
    );
    const result = selectTonight(
      input([{ comp: "EPL", standings: [], matches }]),
    );
    expect(result.picks).toHaveLength(5);
  });

  it("창 안 경기가 없으면 빈 배열(빈 상태)", () => {
    const m = match("arsenal", "chelsea", "2026-11-01T15:00:00Z");
    expect(
      selectTonight(
        input([{ comp: "EPL", standings: EPL_TABLE, matches: [m] }]),
      ).picks,
    ).toEqual([]);
    expect(selectTonight(input([])).picks).toEqual([]);
  });

  it("minScore 미만은 뺀다(1이면 규칙 없는 경기 제외)", () => {
    const plain = match("fulham", "sunderland", T); // 승점 차 6, 규칙 없음
    const big = match("arsenal", "sunderland", T);
    const picks = selectTonight(
      input([{ comp: "EPL", standings: EPL_TABLE, matches: [plain, big] }], {
        rules: { ...RULES, minScore: 1 },
      }),
    ).picks;
    expect(picks.map((p) => p.match.id)).toEqual([big.id]);
  });

  it("동점 정렬: 점수 → 킥오프 이른 순 → 대회 순서(입력 순) → 경기 id", () => {
    const late = match("a1", "a2", "2026-10-31T19:00:00Z", { id: "z-late" });
    const earlyB = match("b1", "b2", "2026-10-31T14:00:00Z", {
      id: "b-early",
      comp: "LALIGA",
    });
    const earlyA2 = match("c1", "c2", "2026-10-31T14:00:00Z", {
      id: "a-early-2",
    });
    const earlyA1 = match("d1", "d2", "2026-10-31T14:00:00Z", {
      id: "a-early-1",
    });
    const top = match("arsenal", "e2", "2026-10-31T20:00:00Z", { id: "top" });
    const picks = selectTonight(
      input([
        { comp: "EPL", standings: [], matches: [late, earlyA2, earlyA1, top] },
        { comp: "LALIGA", standings: [], matches: [earlyB] },
      ]),
    ).picks;
    expect(picks.map((p) => p.match.id)).toEqual([
      "top", // 빅클럽 1점
      "a-early-1", // 0점 · 14:00 · EPL · id
      "a-early-2",
      "b-early", // 같은 시각 LALIGA(입력 뒤)
      "z-late",
    ]);
  });
});

// ─── 대상 경기: 창 경계·서머타임·tbc·연기 ─────────────────────────────────

describe("selectTonight — 대상 창 (FR-80 당일 18:00 ~ 익일 07:00 KST)", () => {
  function ids(kickoffs: string[], base = BASE, extra: Partial<Match> = {}) {
    const matches = kickoffs.map((k, i) =>
      match(`h${i}`, `a${i}`, k, { id: k, ...extra }),
    );
    return selectTonight(
      input([{ comp: "EPL", standings: [], matches }], {
        baseKstDate: base,
        rules: { ...RULES, maxMatches: 10 },
      }),
    ).picks.map((p) => p.match.id);
  }

  it("18:00 KST 정각 포함 · 익일 07:00 정각 제외 · 17:59 제외 · 06:59 포함", () => {
    const at1800 = zonedToUtcIso(`${BASE}T18:00`, "Asia/Seoul"); // 09:00Z
    const at1759 = zonedToUtcIso(`${BASE}T17:59`, "Asia/Seoul");
    const at0659 = zonedToUtcIso("2026-11-01T06:59", "Asia/Seoul");
    const at0700 = zonedToUtcIso("2026-11-01T07:00", "Asia/Seoul"); // 22:00Z
    expect(at1800).toBe("2026-10-31T09:00:00.000Z");
    expect(at0700).toBe("2026-10-31T22:00:00.000Z");
    expect(ids([at1759, at1800, at0659, at0700]).sort()).toEqual(
      [at1800, at0659].sort(),
    );
  });

  it("결과 window는 UTC [start, end)", () => {
    expect(selectTonight(input([])).window).toEqual({
      start: "2026-10-31T09:00:00.000Z",
      end: "2026-10-31T22:00:00.000Z",
    });
  });

  it("서머타임 종료(2026-10-25) 전후: 런던 20:00 킥오프 KST 04:00 → 05:00, 둘 다 그 전날 창 안", () => {
    const before = zonedToUtcIso("2026-10-24T20:00", "Europe/London"); // BST → 19:00Z = KST 04:00
    const after = zonedToUtcIso("2026-10-25T20:00", "Europe/London"); // GMT → 20:00Z = KST 05:00
    expect(ids([before], "2026-10-24")).toEqual([before]);
    expect(ids([after], "2026-10-25")).toEqual([after]);
    expect(ids([after], "2026-10-24")).toEqual([]);
  });

  it("서머타임 시작(2027-03-28) 전후: 마드리드 21:00 킥오프 KST 05:00 → 04:00, 둘 다 창 안", () => {
    const before = zonedToUtcIso("2027-03-27T21:00", "Europe/Madrid"); // CET → 20:00Z = KST 05:00
    const after = zonedToUtcIso("2027-03-28T21:00", "Europe/Madrid"); // CEST → 19:00Z = KST 04:00
    expect(ids([before], "2027-03-27")).toEqual([before]);
    expect(ids([after], "2027-03-28")).toEqual([after]);
  });

  it("마드리드 23:00(CET) 킥오프 = KST 07:00 → 창 밖(끝 제외), 서머타임이면 KST 06:00 → 창 안", () => {
    const winter = zonedToUtcIso("2027-03-27T23:00", "Europe/Madrid");
    const summer = zonedToUtcIso("2027-03-28T23:00", "Europe/Madrid");
    expect(ids([winter], "2027-03-27")).toEqual([]);
    expect(ids([summer], "2027-03-28")).toEqual([summer]);
  });

  it("tbc(킥오프 미확정)·연기 경기는 창 안이어도 뺀다, 끝난 경기는 남긴다", () => {
    expect(ids([T], BASE, { tbc: true })).toEqual([]);
    expect(ids([T], BASE, { status: "postponed" })).toEqual([]);
    expect(
      ids([T], BASE, { status: "finished", score: { h: 1, a: 0 } }),
    ).toEqual([T]);
  });

  it("기준 날짜 = 빌드 시각의 KST 날짜(06:59 KST 빌드도 그날 호)", () => {
    expect(tonightBaseDate("2026-10-30T21:59:00Z")).toBe("2026-10-31"); // KST 06:59
    expect(tonightBaseDate("2026-10-30T14:59:00Z")).toBe("2026-10-30"); // KST 23:59
    expect(tonightBaseDate("2026-10-30T15:00:00Z")).toBe("2026-10-31"); // KST 00:00
  });
});

// ─── 로더 ─────────────────────────────────────────────────────────────────

describe("loadTonight — 설정·대회 데이터 로더", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tonight-"));
  const dataDir = path.join(dir, "competitions");
  mkdirSync(dataDir);
  const rulesFile = path.join(dir, "bigmatch-rules.json");
  writeFileSync(rulesFile, JSON.stringify(RULES));
  const koreanFile = path.join(dir, "korean-players.json");
  writeFileSync(koreanFile, JSON.stringify(KOREAN));
  const compsFile = path.resolve("configs/competitions.json");
  const now = new Date("2026-10-30T22:30:00Z"); // KST 10-31 07:30 발행 빌드

  function competitionFile(comp: string, matches: Match[]) {
    return {
      comp,
      season: 2026,
      provider: "football-data",
      updatedAt: "2026-10-30T22:00:00Z",
      standings: [],
      matches,
      scorers: [],
    };
  }

  it("configs/competitions.json 순서로 있는 대회만 읽어 선별한다", () => {
    writeFileSync(
      path.join(dataDir, "bundesliga.json"),
      JSON.stringify(
        competitionFile("BUNDESLIGA", [
          match("bayern-munchen", "x", T, { comp: "BUNDESLIGA", id: "fd-1" }),
        ]),
      ),
    );
    const result = loadTonight(now, {
      rules: rulesFile,
      koreanPlayers: koreanFile,
      competitions: compsFile,
      dataDir,
    });
    expect(result.baseKstDate).toBe("2026-10-31");
    expect(result.picks.map((p) => [p.match.id, p.reasons[0]?.label])).toEqual([
      ["fd-1", "김민재 소속"],
    ]);
  });

  it("선별 규칙 파일이 없으면 window null · 빈 배열", () => {
    expect(
      loadTonight(now, {
        rules: path.join(dir, "missing.json"),
        koreanPlayers: koreanFile,
        competitions: compsFile,
        dataDir,
      }),
    ).toEqual({ baseKstDate: "2026-10-31", window: null, picks: [] });
  });

  it("대회 데이터가 깨졌으면 던진다(빌드 실패)", () => {
    const badDir = path.join(dir, "bad");
    mkdirSync(badDir);
    writeFileSync(
      path.join(badDir, "epl.json"),
      JSON.stringify({ comp: "EPL" }),
    );
    expect(() =>
      loadTonight(now, {
        rules: rulesFile,
        koreanPlayers: koreanFile,
        competitions: compsFile,
        dataDir: badDir,
      }),
    ).toThrow(/대회 데이터 스키마 검증 실패/);
  });
});

// ─── 실제 configs/bigmatch-rules.json ─────────────────────────────────────

describe("configs/bigmatch-rules.json (M2-08)", () => {
  const rules = BigmatchRulesFileSchema.parse(
    JSON.parse(readFileSync("configs/bigmatch-rules.json", "utf8")),
  );
  const teamIds = TeamIdsFileSchema.parse(
    JSON.parse(readFileSync("configs/team-ids.json", "utf8")),
  );

  it("FR-80 창 18:00~07:00 · FR-81 상위 5경기 · 상위 6위 · 승점 차 3", () => {
    expect(rules.window).toEqual({ fromKst: "18:00", toKst: "07:00" });
    expect(rules.maxMatches).toBe(5);
    expect(rules.rules.topClash.topN).toBe(6);
    expect(rules.rules.closeRace.maxPointsGap).toBe(3);
  });

  it("가중치는 FR-81 순서(① 한국 ≥ ② UCL ≥ ③ 상위 맞대결 ≥ ④ 더비 ≥ ⑤ 승점 차 ≥ 빅클럽)", () => {
    const r = rules.rules;
    const order = [
      r.korean.weight,
      r.ucl.weight,
      r.topClash.weight,
      r.derby.weight,
      r.closeRace.weight,
      r.bigClub.weight,
    ];
    expect([...order].sort((a, b) => b - a)).toEqual(order);
  });

  it("더비 팀 slug는 team-ids.json에 있고, 두 팀이 같은 리그(2026-27 TEAM_LEAGUES)", () => {
    for (const derby of rules.rules.derby.list) {
      for (const team of derby.teams)
        expect(teamIds, derby.name).toHaveProperty([team]);
      const [a, b] = derby.teams;
      expect(TEAM_LEAGUE_INDEX.get(a), derby.name).toBeDefined();
      expect(TEAM_LEAGUE_INDEX.get(a), derby.name).toBe(
        TEAM_LEAGUE_INDEX.get(b),
      );
    }
  });

  it("더비 이름·팀 쌍 중복 없음", () => {
    const names = rules.rules.derby.list.map((d) => d.name);
    const pairs = rules.rules.derby.list.map((d) =>
      [...d.teams].sort().join("|"),
    );
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("빅클럽 = 뉴스 점수화 BIG_CLUBS 16곳과 같은 slug(FR-06 공유 — 한쪽만 고치지 않게)", () => {
    expect([...rules.rules.bigClub.teams].sort()).toEqual(
      BIG_CLUBS.map((c) => c.slug).sort(),
    );
    for (const team of rules.rules.bigClub.teams)
      expect(teamIds).toHaveProperty([team]);
  });
});
