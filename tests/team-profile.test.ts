/**
 * 팀 프로필 순수 함수 (M4-05·M4-06 — PRD FR-53·FR-56, §9.1): 대상 판정·지표(홈/원정·연속·득점 분포·순위표 불일치) · 익명 입력 ·
 * 20팀 균등 묶음 · 출력 파싱(팀 단위) · 코드 검증(이름·주제·숫자·단위·서술·형식) · 묶음 판정 · 이전 값 유지 규칙. LLM·네트워크 없음.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  NamesKoFileSchema,
  type CompetitionFile,
  type Match,
  type StandingRow,
} from "@/lib/schema";

import { buildNameIndex } from "../scripts/lib/names";
import {
  TEAM_PROFILE_GROUP_SIZE,
  TEAM_PROFILE_MAX_TOKENS,
  bandOf,
  buildProfileRequest,
  buildTeamMetrics,
  checkTeamProfile,
  chunkEvenly,
  decideProfile,
  estimateProfileWorstCase,
  groupTeams,
  judgeGroup,
  parseTeamProfileOutput,
  profileNameList,
  profileOf,
  serializeGroupInput,
  type ProfileCheckContext,
  type ProfileItem,
  type TeamMetrics,
} from "../scripts/lib/team-profile";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = async (rel: string) =>
  JSON.parse(await readFile(path.join(ROOT, rel), "utf8")) as unknown;
const NAMES = NamesKoFileSchema.parse(await read("configs/names.ko.json"));
const COMPS = CompetitionsFileSchema.parse(
  await read("configs/competitions.json"),
);
const CHECK: ProfileCheckContext = {
  names: profileNameList(buildNameIndex(NAMES, COMPS)),
};

// ─── 합성 대회 ───────────────────────────────────────────────────────────

let seq = 0;
function match(
  home: string,
  away: string,
  h: number | null,
  a: number | null,
  day: number,
): Match {
  seq += 1;
  return {
    id: `m${seq}`,
    comp: "EPL",
    round: "1",
    kickoff: `2026-09-${String(day).padStart(2, "0")}T15:00:00.000Z`,
    home,
    away,
    score: h === null || a === null ? null : { h, a },
    status: h === null ? "scheduled" : "finished",
  };
}

function row(
  over: Partial<StandingRow> & { team: string; pos: number },
): StandingRow {
  return {
    prevPos: null,
    played: 0,
    w: 0,
    d: 0,
    l: 0,
    gf: 0,
    ga: 0,
    pts: 0,
    form: [],
    zone: "none",
    ...over,
  };
}

/** 'alpha' 6경기: 홈 3(W 2-0, W 3-1, D 1-1) · 원정 3(L 0-1, W 4-0, W 1-0) → 4승 1무 1패, 11득 3실, 현재 2연승·3경기 무패 */
const MATCHES: Match[] = [
  match("alpha", "b1", 2, 0, 1),
  match("b2", "alpha", 1, 0, 2),
  match("alpha", "b3", 3, 1, 3),
  match("alpha", "b4", 1, 1, 4),
  match("b5", "alpha", 0, 4, 5),
  match("b6", "alpha", 0, 1, 6),
  match("alpha", "b7", null, null, 7),
];

const FILE: CompetitionFile = {
  comp: "EPL",
  season: 2026,
  provider: "football-data",
  updatedAt: "2026-11-01T22:00:00.000Z",
  standings: [
    row({
      team: "alpha",
      pos: 1,
      played: 6,
      w: 4,
      d: 1,
      l: 1,
      gf: 11,
      ga: 3,
      pts: 13,
      form: ["L", "W", "D", "W", "W"],
    }),
    row({ team: "b1", pos: 2, played: 6, gf: 12, ga: 5, pts: 12 }),
    row({ team: "b2", pos: 3, played: 6, gf: 6, ga: 3, pts: 10 }),
    row({ team: "b3", pos: 4, played: 6, gf: 5, ga: 9, pts: 8 }),
    row({ team: "b4", pos: 5, played: 6, gf: 4, ga: 9, pts: 6 }),
    row({
      team: "b5",
      pos: 6,
      played: 4, // 경기 수 미달
      gf: 2,
      ga: 10,
      pts: 1,
      zone: "relegation",
    }),
  ],
  matches: MATCHES,
  scorers: [],
};

describe("지표·대상", () => {
  it("순위 구간 3등분", () => {
    // 20팀: 위 7팀 top, 아래 7팀 bottom
    expect([1, 7, 8, 13, 14, 20].map((p) => bandOf(p, 20))).toEqual([
      "top",
      "top",
      "mid",
      "mid",
      "bottom",
      "bottom",
    ]);
    expect(bandOf(6, 18)).toBe("top");
    expect(bandOf(13, 18)).toBe("bottom");
  });

  it("순위표 + 경기 목록 파생 값(홈/원정·연속·무실점·무득점·3골 이상)", () => {
    const r = buildTeamMetrics({ slug: "alpha", comp: "EPL" }, { EPL: FILE });
    expect(r.reason).toBe("ok");
    const lg = r.metrics!.lg;
    expect(lg).toMatchObject({
      pos: 1,
      n: 6,
      p: 6,
      gd: 8,
      gfR: 2, // b1이 12골
      gaR: 1, // b2와 같은 3실점 — 같은 순위
      band: "top",
      form: ["L", "W", "D", "W", "W"],
      home: { p: 3, w: 2, d: 1, l: 0, gf: 6, ga: 2 },
      away: { p: 3, w: 2, d: 0, l: 1, gf: 5, ga: 1 },
      run: { r: "W", n: 2 },
      unb: 4,
      cs: 3,
      fts: 1,
      big: 2,
    });
    expect(lg.wl).toBeUndefined();
    expect(lg.zone).toBeUndefined();
    expect(r.metrics!.ucl).toBeNull();
  });

  it("경기 목록이 순위표와 어긋나면(D60) 파생 값을 넣지 않는다", () => {
    const stale: CompetitionFile = {
      ...FILE,
      standings: FILE.standings.map((s) =>
        s.team === "alpha" ? { ...s, played: 7, w: 5, gf: 13, pts: 16 } : s,
      ),
    };
    const lg = buildTeamMetrics({ slug: "alpha", comp: "EPL" }, { EPL: stale })
      .metrics!.lg;
    expect(lg.p).toBe(7);
    expect(lg.home).toBeUndefined();
    expect(lg.cs).toBeUndefined();
    expect(lg.run).toBeUndefined();
  });

  it("대상 밖 — 대회 파일 없음·순위표에 없음·경기 수 미달", () => {
    expect(
      buildTeamMetrics({ slug: "alpha", comp: "LALIGA" }, { EPL: FILE }).reason,
    ).toBe("no-competition");
    expect(
      buildTeamMetrics({ slug: "zzz", comp: "EPL" }, { EPL: FILE }).reason,
    ).toBe("no-standing");
    expect(
      buildTeamMetrics({ slug: "b5", comp: "EPL" }, { EPL: FILE }).reason,
    ).toBe("few-matches");
  });

  it("5대 리그 팀의 UCL 블록 — 1경기 이상이면 붙고 zone 이름이 바뀐다", () => {
    const ucl: CompetitionFile = {
      ...FILE,
      comp: "UCL",
      standings: [
        row({ team: "alpha", pos: 30, played: 3, l: 3, ga: 7, zone: "none" }),
      ],
      matches: [],
    };
    const m = buildTeamMetrics(
      { slug: "alpha", comp: "EPL" },
      { EPL: FILE, UCL: ucl },
    ).metrics!;
    expect(m.ucl).toMatchObject({ pos: 30, zone: "out", p: 3 });
    expect(m.ucl!.home).toBeUndefined(); // 경기 목록 없음 → 순위표와 어긋남
  });
});

// ─── 묶음·요청 ───────────────────────────────────────────────────────────

function fakeMetrics(
  i: number,
  comp: TeamMetrics["comp"] = "EPL",
): TeamMetrics {
  const m = buildTeamMetrics(
    { slug: "alpha", comp: "EPL" },
    { EPL: FILE },
  ).metrics!;
  return {
    ...m,
    slug: `team-${String(i).padStart(3, "0")}`,
    comp,
    lg: { ...m.lg, pos: (i % 20) + 1 },
  };
}

describe("묶음·요청", () => {
  it("균등 분할 — 96 → 20·19·19·19·19, 111 → 6묶음, 20 → 1묶음", () => {
    const sizes = (n: number) =>
      chunkEvenly([...Array(n).keys()], TEAM_PROFILE_GROUP_SIZE).map(
        (c) => c.length,
      );
    expect(sizes(96)).toEqual([20, 19, 19, 19, 19]);
    expect(sizes(111)).toEqual([19, 19, 19, 18, 18, 18]);
    expect(sizes(20)).toEqual([20]);
    expect(sizes(0)).toEqual([]);
  });

  it("묶음 — 대회 → 순위 순, 기호 t01… · customId 시도별", () => {
    const list = [fakeMetrics(5, "UCL"), fakeMetrics(3), fakeMetrics(1)];
    const [g] = groupTeams(list, "2026-44");
    expect(g!.customId).toBe("team-profile-2026-44-g1");
    expect(g!.teams.map((t) => [t.id, t.metrics.slug])).toEqual([
      ["t01", "team-001"],
      ["t02", "team-003"],
      ["t03", "team-005"],
    ]);
    expect(groupTeams(list, "2026-44", 2)[0]!.customId).toBe(
      "team-profile-2026-44-r1-g1",
    );
  });

  it("입력에 팀 이름·slug가 없다(익명 기호만)", () => {
    const [g] = groupTeams([fakeMetrics(1)], "x");
    const text = serializeGroupInput(g!);
    expect(text).not.toContain("team-001");
    expect(text).not.toContain("alpha");
    expect(JSON.parse(text)).toMatchObject({
      t: [{ id: "t01", lg: { pos: 2 } }],
    });
  });

  it("요청 설정 — 캐싱 켬·max_tokens 16,384·thinking 적응형·effort medium, 최악값은 배치 단가", () => {
    const [g] = groupTeams([fakeMetrics(1), fakeMetrics(2)], "x");
    const req = buildProfileRequest(g!, "지시문".repeat(200));
    expect(req).toMatchObject({
      cacheSystem: true,
      maxTokens: TEAM_PROFILE_MAX_TOKENS,
      thinking: "adaptive",
      effort: "medium",
    });
    const est = estimateProfileWorstCase([req, req], "claude-haiku-5-5");
    expect(est.requests).toBe(2);
    expect(est.batch).toBe(true);
    expect(est.tokens.out).toBe(2 * TEAM_PROFILE_MAX_TOKENS);
    expect(est.usd).toBeGreaterThan(0);
    expect(est.usd).toBeLessThan(0.02);
  });
});

// ─── 출력·검증 ───────────────────────────────────────────────────────────

const ALPHA = buildTeamMetrics(
  { slug: "alpha", comp: "EPL" },
  { EPL: FILE },
).metrics!;
const GOOD: ProfileItem = {
  id: "t01",
  o: "6경기 4승 1무 1패, 승점 13으로 리그 선두를 달리고 있다.",
  s: ["리그 최소 3실점의 수비", "홈 3경기 무패"],
  w: ["원정 1패", "무득점 1경기"],
};

describe("출력 파싱", () => {
  it("팀 항목마다 따로 — 형식 오류 항목·중복 기호만 빠진다", () => {
    const parsed = parseTeamProfileOutput(
      "```json\n" +
        JSON.stringify({
          t: [
            GOOD,
            { id: "t02", o: "한 문장이다.", s: ["하나"], w: ["둘", "셋"] },
            { ...GOOD, id: "t03" },
            { ...GOOD, id: "t03" },
          ],
        }) +
        "\n```",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect([...parsed.items.keys()]).toEqual(["t01"]);
    expect(parsed.invalid.map((i) => i.id)).toEqual(["t02", "t03"]);
  });

  it("JSON 아님·감싼 형식 틀림", () => {
    expect(parseTeamProfileOutput("Here you go")).toMatchObject({
      ok: false,
      reason: "json",
    });
    expect(parseTeamProfileOutput('{"teams":[]}')).toMatchObject({
      ok: false,
      reason: "schema",
    });
  });
});

describe("코드 검증", () => {
  const issues = (item: Partial<ProfileItem>) =>
    checkTeamProfile({ ...GOOD, ...item }, ALPHA, CHECK).issues.map(
      (i) => `${i.code}:${i.detail ?? ""}`,
    );

  it("입력과 맞는 출력은 통과", () => {
    expect(checkTeamProfile(GOOD, ALPHA, CHECK)).toEqual({
      ok: true,
      issues: [],
    });
  });

  it("영어·한자·형식", () => {
    expect(issues({ o: "Top of the league with 13 points." })).toContain(
      "latin:",
    );
    expect(issues({ o: "리그 선두를 달리는 強팀이다." })).toContain("han:");
    expect(issues({ o: "리그 선두다. 승점 13이다." })).toContain(
      "sentence-form:",
    );
    expect(issues({ o: "리그 선두를 달리고 있음" })).toContain(
      "sentence-form:",
    );
    expect(issues({ s: ["리그 최소 3실점이다", "홈 3경기 무패"] })).toContain(
      "bullet-form:",
    );
    expect(
      issues({ s: ["리그 최소 3실점의 수비.", "홈 3경기 무패"] }),
    ).toContain("bullet-form:");
    expect(issues({ w: ["원정 1패", "원정 1패"] })).toContain("duplicate:");
    expect(
      issues({
        s: [
          "홈 3경기 무패로 버티는 아주 단단하고 촘촘하며 끈질기고 흔들림 없는 수비 조직력",
          "홈 3경기 무패",
        ],
      }).some((x) => x.startsWith("too-long")),
    ).toBe(true);
  });

  it("입력 밖 이름·지표 밖 주제", () => {
    expect(
      issues({ o: "이강인의 득점으로 리그 선두를 달리고 있다." }),
    ).toContain("name:이강인");
    expect(
      issues({ o: "프랑스식 수비로 리그 선두를 달리고 있다." }).some((x) =>
        x.startsWith("name"),
      ),
    ).toBe(false);
    expect(issues({ s: ["주전 공격수의 결정력", "홈 3경기 무패"] })).toEqual(
      expect.arrayContaining(["topic:주전", "topic:공격수"]),
    );
    expect(issues({ w: ["부상자가 많은 일정", "무득점 1경기"] })).toContain(
      "topic:부상",
    );
    expect(issues({ o: "우승 경쟁에 나선 리그 선두다." })).toContain(
      "topic:우승",
    );
  });

  it("숫자·단위 — 지표에 없는 수, 단위가 맞지 않는 수", () => {
    expect(issues({ o: "7경기 5승으로 리그 선두를 달리고 있다." })).toEqual(
      expect.arrayContaining(["number:7", "unit:7경기"]),
    );
    expect(
      issues({ s: ["리그 최소 4실점의 수비", "홈 3경기 무패"] }),
    ).toContain("unit:4실점");
    expect(issues({ o: "승점 11로 리그 선두를 달리고 있다." })).toContain(
      "unit:11승점",
    );
    expect(issues({ s: ["3연승의 흐름", "홈 3경기 무패"] })).toContain(
      "unit:3연승",
    );
    expect(issues({ s: ["2연승의 흐름", "홈 3경기 무패"] })).toEqual([]);
    expect(issues({ s: ["4경기 무패", "홈 3경기 무패"] })).toEqual([]);
    expect(issues({ s: ["6경기 무패", "홈 3경기 무패"] })).toContain(
      "unit:6경기 무패",
    );
  });

  it("'16강'은 수 근거에서 빼고 zone으로 대조한다", () => {
    const ucl = {
      ...ALPHA,
      ucl: { ...ALPHA.lg, pos: 7, n: 36, zone: "knockout" as const },
    };
    const item = {
      ...GOOD,
      o: "리그 선두이며 챔피언스리그 16강 직행권에 있다.",
    };
    expect(checkTeamProfile(item, ucl, CHECK).ok).toBe(true);
    expect(
      issues({ o: "리그 선두이며 챔피언스리그 16강 직행권에 있다." }),
    ).toContain("claim:16강");
  });

  it("서술 대조 — 선두·최다 득점·하위권·강등·홈/원정 무패·연패·무실점", () => {
    expect(issues({ s: ["리그 최다 득점의 공격", "홈 3경기 무패"] })).toContain(
      "claim:최다 득점",
    );
    expect(issues({ o: "하위권에 머물러 있다." })).toContain("claim:하위권");
    expect(issues({ w: ["강등권과 가까운 순위", "무득점 1경기"] })).toContain(
      "claim:강등",
    );
    expect(issues({ w: ["원정 무패 실패", "무득점 1경기"] })).toContain(
      "claim:원정 무패",
    );
    expect(issues({ w: ["최근 연패", "무득점 1경기"] })).toContain(
      "claim:연패",
    );
    expect(issues({ o: "6경기 4승 1무 1패로 리그 최하위다." })).toContain(
      "claim:최하위",
    );
    const noVenue = {
      ...ALPHA,
      lg: { ...ALPHA.lg, home: undefined, away: undefined },
    };
    delete noVenue.lg.home;
    delete noVenue.lg.away;
    expect(
      checkTeamProfile(GOOD, noVenue, CHECK).issues.some(
        (i) => i.code === "claim" && i.detail === "홈·원정",
      ),
    ).toBe(true);
  });
});

describe("묶음 판정·반영", () => {
  const [group] = groupTeams(
    [ALPHA, { ...ALPHA, slug: "beta", lg: { ...ALPHA.lg, pos: 2 } }],
    "w",
  );

  it("팀 단위 — 한 팀 실패가 다른 팀을 버리지 않는다", () => {
    const text = JSON.stringify({
      t: [GOOD, { ...GOOD, id: "t02", o: "Second place." }],
    });
    const out = judgeGroup(group!, { text }, CHECK);
    expect(out.map((o) => [o.slug, o.reason])).toEqual([
      ["alpha", "ok"],
      ["beta", "check"],
    ]);
  });

  it("빠진 팀·결과 실패·JSON 실패", () => {
    expect(
      judgeGroup(group!, { text: JSON.stringify({ t: [GOOD] }) }, CHECK).map(
        (o) => o.reason,
      ),
    ).toEqual(["ok", "missing"]);
    expect(
      judgeGroup(group!, { failure: "max_tokens" }, CHECK).map((o) => o.reason),
    ).toEqual(["result-failed", "result-failed"]);
    expect(
      judgeGroup(group!, { text: "oops" }, CHECK).map((o) => o.reason),
    ).toEqual(["json", "json"]);
  });

  it("반영 — 새 값 · 이전 값 21일 안 유지 · 넘으면 비움 · 없으면 그대로 null", () => {
    const now = new Date("2026-11-09T00:00:00Z");
    const fresh = profileOf(GOOD, "2026-11-09T00:00:00.000Z");
    expect(fresh).toEqual({
      oneLiner: GOOD.o,
      strengths: GOOD.s,
      weaknesses: GOOD.w,
      generatedAt: "2026-11-09T00:00:00.000Z",
    });
    const old = (iso: string) => ({ ...fresh, generatedAt: iso });
    expect(decideProfile({ previous: null, fresh, now }).action).toBe("new");
    expect(
      decideProfile({
        previous: old("2026-10-20T00:00:00.000Z"),
        fresh: null,
        now,
      }),
    ).toMatchObject({ action: "kept" });
    expect(
      decideProfile({
        previous: old("2026-10-18T00:00:00.000Z"),
        fresh: null,
        now,
      }),
    ).toEqual({ profile: null, action: "cleared" });
    expect(decideProfile({ previous: null, fresh: null, now })).toEqual({
      profile: null,
      action: "none",
    });
  });
});
