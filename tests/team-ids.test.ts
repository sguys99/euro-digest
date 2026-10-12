/**
 * M1-44 팀 id 대응표 `configs/team-ids.json`(PRD §15 D33) — 스키마·짝짓기 도우미·초안 생성. 네트워크 없음.
 *
 * 필수 항목: 스키마(fd·af 각각 중복 금지 — 같은 숫자가 두 API에서 다른 팀일 수 있음, 둘 다 null 금지, slug 키, 모르는 키),
 * 짝짓기(대회·킥오프 ±5분·스코어 + 후보 1개, 대응표로 모호함 해소, 대응표와 어긋나면 충돌, 후보끼리 어긋나면 충돌,
 * 미종료 무시, 결정적), 초안(fixtures 원본에서 index.json 쌍을 다시 찾음, 기존 slug 재사용, 근거 약한 행 표시,
 * 한국 선수 소속팀 af 확인), 현재 configs/team-ids.json이 스키마·교차 검사를 통과.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  TeamIdsFileSchema,
  type CompId,
} from "@/lib/schema";

import {
  buildTeamIdIndex,
  EMPTY_TEAM_ID_INDEX,
  linkMatchDetails,
  suggestTeamIdPairs,
  type PairingMatch,
} from "../scripts/lib/team-ids";
import {
  afFixtureToPairing,
  toAfFixture,
  toMatchDetail,
} from "../scripts/lib/providers/api-football";
import { toFinishedResults } from "../scripts/lib/providers/football-data";
import type { MatchDetail } from "../scripts/lib/match-data";
import {
  buildTeamIdsDraft,
  FixtureIndexSchema,
  formatDraftReview,
  koreanTeamsFrom,
  M0_32_SQUAD_TEAM_IDS,
  namesLookSame,
  readAfFixtures,
  readFdFixtures,
  stripAccents,
  teamSlugFromName,
  type DraftInputs,
} from "../scripts/lib/team-ids-draft";
import { checkKoreanPlayerTeamIds } from "../scripts/lib/validate-crossref";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const readJsonDir = (rel: string, prefix = ""): unknown[] =>
  readdirSync(path.join(ROOT, rel))
    .filter((f) => f.endsWith(".json") && f.startsWith(prefix))
    .sort()
    .map((f) => readJson(`${rel}/${f}`));

const COMPETITIONS = CompetitionsFileSchema.parse(
  readJson("configs/competitions.json"),
);
const KOREAN = KoreanPlayersFileSchema.parse(
  readJson("configs/korean-players.json"),
);
const NAMES = NamesKoFileSchema.parse(readJson("configs/names.ko.json"));
const INDEX = FixtureIndexSchema.parse(
  readJson("fixtures/football/index.json"),
);
const IDX_RAW = readJson("fixtures/football/index.json") as {
  teamIdPairs: {
    idCollisions: Array<{ id: number; fdTeam: string; afTeam: string }>;
  };
};
const FD = readFdFixtures(
  readJsonDir("fixtures/football/football-data"),
  COMPETITIONS,
);
const AF = readAfFixtures(
  readJsonDir("fixtures/football/api-football", "fixtures-"),
  COMPETITIONS,
);

// ─── 스키마 ──────────────────────────────────────────────────────────────

describe("TeamIdsFileSchema — slug → { fd, af } (D33)", () => {
  const issues = (value: unknown) => {
    const r = TeamIdsFileSchema.safeParse(value);
    return r.success
      ? []
      : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  };

  it("유효 — 같은 숫자라도 fd와 af는 다른 체계(57 = fd 아스널, af 입스위치)", () => {
    expect(
      issues({
        arsenal: { fd: 57, af: 42 },
        "ipswich-town": { fd: 349, af: 57, note: "M0 idCollisions" },
        "only-fd": { fd: 1, af: null },
      }),
    ).toEqual([]);
  });

  it("fd·af 각각 중복 금지(null은 제외)", () => {
    expect(
      issues({
        a: { fd: 57, af: 42 },
        b: { fd: 57, af: 43 },
        c: { fd: 58, af: 42 },
        d: { fd: null, af: 44 },
        e: { fd: null, af: 45 },
      }),
    ).toEqual([
      'b.fd: fd id 57 중복 ("a"와 같음)',
      'c.af: af id 42 중복 ("a"와 같음)',
    ]);
  });

  it("둘 다 null·slug 형식·모르는 키·양의 정수 아님은 오류", () => {
    expect(issues({ a: { fd: null, af: null } })).toEqual([
      "a: fd·af가 둘 다 null — 둘 중 하나는 있어야 함",
    ]);
    expect(issues({ "Bad Slug": { fd: 1, af: 2 } })).toHaveLength(1);
    expect(issues({ a: { fd: 1, af: 2, fdName: "x" } })).toHaveLength(1);
    expect(issues({ a: { fd: 0, af: 2 } })).toHaveLength(1);
    expect(issues({ a: { fd: 1.5, af: 2 } })).toHaveLength(1);
    expect(issues({ a: { fd: 1 } })).toHaveLength(1); // af 키 필수(모르면 null)
  });
});

describe("configs/team-ids.json(현재 파일) — 스키마·교차 검사", () => {
  const file = TeamIdsFileSchema.parse(readJson("configs/team-ids.json"));

  it("활성 한국 선수 소속팀이 모두 있고 af가 M0-32 squads 확인값과 같다", () => {
    expect(checkKoreanPlayerTeamIds(KOREAN, file)).toEqual([]);
    for (const team of koreanTeamsFrom(KOREAN)) {
      expect([team.slug, file[team.slug]?.af]).toEqual([
        team.slug,
        M0_32_SQUAD_TEAM_IDS[team.slug],
      ]);
    }
  });

  it("M0 idCollisions — 같은 숫자의 fd 팀과 af 팀은 다른 slug다", () => {
    const index = buildTeamIdIndex(file);
    for (const c of IDX_RAW.teamIdPairs.idCollisions) {
      const fdSlug = index.byFd.get(c.id);
      const afSlug = index.byAf.get(c.id);
      if (fdSlug !== undefined && afSlug !== undefined) {
        expect(fdSlug).not.toBe(afSlug);
      }
    }
  });

  it("이 대응표로 fixtures를 다시 짝지으면 새 후보·충돌이 없다", () => {
    const report = suggestTeamIdPairs(FD.finished, AF, buildTeamIdIndex(file));
    expect(report.conflicts).toEqual([]);
    expect(report.candidates).toEqual([]);
  });
});

// ─── 짝짓기 도우미 ───────────────────────────────────────────────────────

function m(
  matchId: number,
  comp: CompId,
  kickoff: string,
  home: [number, string],
  away: [number, string],
  ft: [number, number] | null,
): PairingMatch {
  return {
    matchId,
    comp,
    kickoff,
    home: { id: home[0], name: home[1] },
    away: { id: away[0], name: away[1] },
    ft: ft && { home: ft[0], away: ft[1] },
  };
}

describe("suggestTeamIdPairs — 대회·킥오프(±5분)·스코어 + 후보 1개", () => {
  it("fixtures 원본: 종료 경기 24쌍을 다시 찾고, 팀 쌍 후보 46개(바이에른·우니온은 2경기)는 모두 index.json teamIdPairs에 있다", () => {
    const report = suggestTeamIdPairs(FD.finished, AF);
    expect(report.matchPairs).toHaveLength(24);
    expect(report.conflicts).toEqual([]);
    expect(report.ambiguous).toEqual([]);
    const indexKeys = new Set(
      INDEX.teamIdPairs.pairs.map((p) => `${p.fd}:${p.af}`),
    );
    // 52쌍 − 미종료·취소 경기에서만 나온 6팀(라요·아틀레틱·쾰른·묀헨글라트바흐·프라이부르크·샬케)
    expect(report.candidates).toHaveLength(46);
    for (const c of report.candidates) {
      expect(c.kind).toBe("new");
      expect(indexKeys.has(`${c.fd.id}:${c.af.id}`)).toBe(true);
    }
    // index.json matchIdPairs의 종료 경기 쌍이 모두 들어 있다
    const pairs = new Set(
      report.matchPairs.map((p) => `${p.fdMatchId}:${p.afMatchId}`),
    );
    for (const p of INDEX.matchIdPairs.pairs) {
      if (p.fdStatus === "FINISHED") {
        expect(pairs.has(`${p.fd}:${p.af}`)).toBe(true);
      }
    }
  });

  it("미종료(ft null)는 쓰지 않는다 · 킥오프 차 5분 초과는 짝 없음", () => {
    const fd = [
      m(
        1,
        "EPL",
        "2026-10-10T14:00:00Z",
        [57, "Arsenal"],
        [61, "Chelsea"],
        [1, 0],
      ),
      m(
        2,
        "EPL",
        "2026-10-10T16:30:00Z",
        [66, "Man United"],
        [73, "Tottenham"],
        null,
      ),
    ];
    const afOk = [
      m(
        901,
        "EPL",
        "2026-10-10T14:04:00.000Z",
        [42, "Arsenal"],
        [49, "Chelsea"],
        [1, 0],
      ),
      m(
        902,
        "EPL",
        "2026-10-10T16:30:00.000Z",
        [33, "Manchester United"],
        [47, "Tottenham"],
        [2, 2],
      ),
    ];
    expect(suggestTeamIdPairs(fd, afOk).matchPairs).toEqual([
      {
        fdMatchId: 1,
        afMatchId: 901,
        comp: "EPL",
        kickoff: "2026-10-10T14:00:00Z",
      },
    ]);
    const afLate = [{ ...afOk[0]!, kickoff: "2026-10-10T14:06:00.000Z" }];
    const late = suggestTeamIdPairs(fd, afLate);
    expect(late.matchPairs).toEqual([]);
    expect(late.unmatched).toEqual([1]);
    // 대회가 다르거나 스코어가 다르면 짝 없음
    expect(
      suggestTeamIdPairs(fd, [{ ...afOk[0]!, comp: "UCL" }]).unmatched,
    ).toEqual([1]);
    expect(
      suggestTeamIdPairs(fd, [{ ...afOk[0]!, ft: { home: 0, away: 1 } }])
        .unmatched,
    ).toEqual([1]);
  });

  it("같은 대회·시각·스코어 af 경기가 둘이면 모호(추측하지 않음) — 대응표가 한쪽을 알면 고른다", () => {
    const fd = [
      m(
        1,
        "EPL",
        "2026-10-10T14:00:00Z",
        [57, "Arsenal"],
        [61, "Chelsea"],
        [1, 1],
      ),
    ];
    const af = [
      m(
        901,
        "EPL",
        "2026-10-10T14:00:00.000Z",
        [42, "Arsenal"],
        [49, "Chelsea"],
        [1, 1],
      ),
      m(
        902,
        "EPL",
        "2026-10-10T14:00:00.000Z",
        [55, "Brentford"],
        [66, "Aston Villa"],
        [1, 1],
      ),
    ];
    const blind = suggestTeamIdPairs(fd, af);
    expect(blind.ambiguous).toEqual([1]);
    expect(blind.candidates).toEqual([]);

    const index = buildTeamIdIndex({ arsenal: { fd: 57, af: 42 } });
    const known = suggestTeamIdPairs(fd, af, index);
    expect(known.ambiguous).toEqual([]);
    expect(known.matchPairs.map((p) => p.afMatchId)).toEqual([901]);
    // 아는 쌍(Arsenal)은 후보로 내지 않고, 모르는 Chelsea만 new 후보
    expect(known.candidates.map((c) => [c.kind, c.fd.id, c.af.id])).toEqual([
      ["new", 61, 49],
    ]);
  });

  it("af가 비어 있는 항목은 fill-af 후보, fd가 비어 있는 항목은 fill-fd 후보", () => {
    const fd = [
      m(
        1,
        "BUNDESLIGA",
        "2026-10-10T13:30:00Z",
        [16, "Augsburg"],
        [5, "Bayern"],
        [0, 3],
      ),
    ];
    const af = [
      m(
        901,
        "BUNDESLIGA",
        "2026-10-10T13:30:00.000Z",
        [170, "FC Augsburg"],
        [157, "Bayern München"],
        [0, 3],
      ),
    ];
    const index = buildTeamIdIndex({
      augsburg: { fd: 16, af: null },
      "bayern-munchen": { fd: null, af: 157 },
    });
    const report = suggestTeamIdPairs(fd, af, index);
    expect(
      report.candidates.map((c) => [c.kind, c.slug, c.fd.id, c.af.id]),
    ).toEqual([
      ["fill-fd", "bayern-munchen", 5, 157], // 같은 경기 근거 → fd id 순
      ["fill-af", "augsburg", 16, 170],
    ]);
  });

  it("후보가 하나인데 대응표와 어긋나면 짝짓지 않고 충돌(table)로 보고 — 대응표 오류 가능성", () => {
    const fd = [
      m(
        1,
        "EPL",
        "2026-10-10T11:30:00Z",
        [57, "Arsenal"],
        [341, "Leeds United"],
        [2, 1],
      ),
    ];
    const af = [
      m(
        901,
        "EPL",
        "2026-10-10T11:30:00.000Z",
        [42, "Arsenal"],
        [63, "Leeds"],
        [2, 1],
      ),
    ];
    const wrong = buildTeamIdIndex({ arsenal: { fd: 57, af: 57 } }); // af 57은 입스위치
    const report = suggestTeamIdPairs(fd, af, wrong);
    expect(report.matchPairs).toEqual([]);
    expect(report.candidates).toEqual([]);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]).toMatchObject({ kind: "table" });
  });

  it("같은 fd 팀에 서로 다른 af 후보가 나오면 후보로 내지 않고 충돌(candidates)", () => {
    const fd = [
      m(
        1,
        "EPL",
        "2026-10-10T14:00:00Z",
        [57, "Arsenal"],
        [61, "Chelsea"],
        [1, 0],
      ),
      m(
        2,
        "EPL",
        "2026-10-17T14:00:00Z",
        [58, "Aston Villa"],
        [57, "Arsenal"],
        [2, 2],
      ),
    ];
    const af = [
      m(
        901,
        "EPL",
        "2026-10-10T14:00:00.000Z",
        [42, "Arsenal"],
        [49, "Chelsea"],
        [1, 0],
      ),
      m(
        902,
        "EPL",
        "2026-10-17T14:00:00.000Z",
        [66, "Aston Villa"],
        [999, "Not Arsenal"],
        [2, 2],
      ),
    ];
    const report = suggestTeamIdPairs(fd, af);
    expect(report.matchPairs).toHaveLength(2);
    expect(report.candidates.map((c) => c.fd.id).sort()).toEqual([58, 61]);
    expect(
      report.conflicts.map((c) => [c.kind, c.fd.id, c.af.id]).sort(),
    ).toEqual([
      ["candidates", 57, 42],
      ["candidates", 57, 999],
    ]);
  });

  it("결정적 — 입력 순서를 바꿔도 결과가 같다 · 대응표에 없는 팀이 있어도 던지지 않는다", () => {
    const a = suggestTeamIdPairs(FD.finished, AF, EMPTY_TEAM_ID_INDEX);
    const b = suggestTeamIdPairs([...FD.finished].reverse(), [...AF].reverse());
    expect(b).toEqual(a);
  });
});

// ─── 초안 ────────────────────────────────────────────────────────────────

describe("teamSlugFromName — M0-32 규칙(정식 이름 → 악센트 제거 → FC·AFC·CF·SC·SV·FSV·1.·Club 앞뒤 제거 → kebab)", () => {
  it.each([
    ["FC Bayern München", "bayern-munchen"],
    ["1. FSV Mainz 05", "mainz-05"],
    ["Club Atlético de Madrid", "atletico-de-madrid"],
    ["Brentford FC", "brentford"],
    ["1. FC Union Berlin", "union-berlin"],
    ["Borussia Mönchengladbach", "borussia-monchengladbach"],
    ["FC Schalke 04", "schalke-04"],
    ["FC Augsburg", "augsburg"],
    ["Brighton & Hove Albion FC", "brighton-hove-albion"],
    ["Paris Saint-Germain FC", "paris-saint-germain"],
    ["1. FC Köln", "koln"],
    ["SV 07 Elversberg", "07-elversberg"],
    ["FK Bodø/Glimt", "fk-bodo-glimt"],
    ["FC", "fc"],
  ])("%s → %s", (name, slug) => {
    expect(teamSlugFromName(name).slug).toBe(slug);
  });

  it("뗀 토큰을 돌려준다 · 악센트 제거", () => {
    expect(teamSlugFromName("Paris FC")).toEqual({
      slug: "paris",
      stripped: ["FC"],
    });
    expect(stripAccents("Alavés Barça Fenerbahçe Bodø Straße")).toBe(
      "Alaves Barca Fenerbahce Bodo Strasse",
    );
  });

  it("namesLookSame — 의미 토큰이 하나라도 겹치면 같은 팀으로 본다", () => {
    expect(namesLookSame(["FC Barcelona", "Barça"], "Barcelona")).toBe(true);
    expect(
      namesLookSame(["Club Atlético de Madrid", "Atleti"], "Atletico Madrid"),
    ).toBe(true);
    expect(namesLookSame(["FC Internazionale Milano", "Inter"], "Inter")).toBe(
      true,
    );
    expect(namesLookSame(["Ipswich Town FC", "Ipswich Town"], "Arsenal")).toBe(
      false,
    );
    expect(namesLookSame(["AS Monaco FC", null], "FC Lorient")).toBe(false);
  });
});

describe("afFixtureToPairing — API-Football 어댑터 경계(M1-48)를 거친 짝짓기 입력", () => {
  const compByLeague = new Map<number, CompId>(
    COMPETITIONS.map((c) => [c.apiFootballLeagueId, c.id]),
  );
  const items = (
    readJson(
      "fixtures/football/api-football/fixtures-date-2026-10-10.json",
    ) as {
      response: unknown[];
    }
  ).response;
  const toPairing = (item: unknown) => {
    const fixture = toAfFixture(item);
    return fixture ? afFixtureToPairing(fixture, compByLeague) : null;
  };

  it("대상 대회만(이름이 비슷한 다른 대회 제외), +00:00 → Z, 종료만 ft", () => {
    const parsed = items
      .map(toPairing)
      .filter((x): x is PairingMatch => x !== null);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.length).toBeLessThan(items.length);
    for (const p of parsed) {
      expect(p.kickoff).toMatch(/Z$/);
    }
    const arsenal = parsed.find((p) => p.matchId === 1557417)!;
    expect(arsenal).toEqual({
      matchId: 1557417,
      comp: "EPL",
      kickoff: "2026-10-10T11:30:00.000Z",
      home: { id: 42, name: "Arsenal" },
      away: { id: 63, name: "Leeds" },
      ft: { home: 2, away: 1 },
    });
    // INT(중단) 경기는 ft null
    expect(parsed.find((p) => p.matchId === 1570410)?.ft).toBeNull();
    expect(toPairing({ fixture: {} })).toBeNull();
    expect(toPairing(null)).toBeNull();
  });
});

describe("linkMatchDetails — football-data 종료 경기 ↔ API-Football 상세(M1-48, D33)", () => {
  const TABLE = TeamIdsFileSchema.parse(readJson("configs/team-ids.json"));
  const compByLeague = new Map<number, CompId>(
    COMPETITIONS.map((c) => [c.apiFootballLeagueId, c.id]),
  );
  const fdResults = toFinishedResults(
    (
      readJson(
        "fixtures/football/football-data/matches-6comps-2026-10-10.json",
      ) as { matches: unknown[] }
    ).matches,
    COMPETITIONS,
    { start: "2026-10-10T00:00:00.000Z", end: "2026-10-11T00:00:00.000Z" },
  ).results;
  const details: MatchDetail[] = readJsonDir(
    "fixtures/football/api-football",
    "fixtures-id-",
  ).flatMap((doc) => {
    const r = toMatchDetail((doc as { response: unknown[] }).response[0], {
      compByLeague,
      fetchedAt: "2026-10-11T06:50:00.000Z",
    });
    return r.kind === "finished" ? [r.detail] : [];
  });

  it("대응표로 두 팀이 확인된 쌍만 연결(득점자를 붙여도 됨) — 2026-10-10 상세 7경기 모두 연결", () => {
    const result = linkMatchDetails(
      fdResults,
      details,
      buildTeamIdIndex(TABLE),
    );
    const linked = result.links.map((l) => [l.fd.matchId, l.af.matchId]);
    expect(linked).toHaveLength(7);
    expect(linked).toContainEqual([565819, 1575180]);
    for (const l of result.links) {
      expect(l.fd.score.ft).toEqual(l.af.score.ft);
      expect(l.fd.comp).toBe(l.af.comp);
    }
    expect(result.unconfirmed).toEqual([]);
    // 상세가 없는 fd 종료 경기(16)는 짝 없음 — 득점자 없이 진행
    expect(result.report.unmatched).toHaveLength(fdResults.length - 7);
  });

  it("대응표에 없는 팀이 낀 쌍은 연결하지 않고(unconfirmed) 후보로만 낸다", () => {
    const { augsburg: _drop, ...rest } = TABLE;
    void _drop;
    const result = linkMatchDetails(fdResults, details, buildTeamIdIndex(rest));
    expect(result.links.map((l) => l.af.matchId)).not.toContain(1575180);
    expect(result.unconfirmed).toEqual([
      expect.objectContaining({ fdMatchId: 565819, afMatchId: 1575180 }),
    ]);
    expect(result.report.candidates).toEqual([
      expect.objectContaining({
        kind: "new",
        fd: expect.objectContaining({ id: 16 }),
        af: expect.objectContaining({ id: 170 }),
      }),
    ]);
  });

  it("근거 약했던 쾰른·프라이부르크(M1-44 메모) — 2026-10-11 종료 경기로 대응표 쌍이 확인된다(M1-48 실데이터)", () => {
    const fd = toFinishedResults(
      (
        readJson(
          "fixtures/football/football-data/matches-bl1-2026-10-11.json",
        ) as { matches: unknown[] }
      ).matches,
      COMPETITIONS,
      { start: "2026-10-11T00:00:00.000Z", end: "2026-10-12T00:00:00.000Z" },
    ).results;
    const result = linkMatchDetails(
      fd,
      details.filter((d) => d.matchId === 1575183 || d.matchId === 1575179),
      buildTeamIdIndex(TABLE),
    );
    expect(result.links.map((l) => [l.fd.matchId, l.af.matchId])).toEqual([
      [565814, 1575183],
      [565816, 1575179],
    ]);
    expect(result.unconfirmed).toEqual([]);
    expect(result.report.conflicts).toEqual([]);
    expect(TABLE.koln).toMatchObject({ fd: 1, af: 192 });
    expect(TABLE.freiburg).toMatchObject({ fd: 17, af: 160 });
  });

  it("빈 대응표면 연결 0 — 모든 쌍이 후보(실행은 계속)", () => {
    const result = linkMatchDetails(fdResults, details);
    expect(result.links).toEqual([]);
    expect(result.unconfirmed).toHaveLength(7);
  });
});

describe("buildTeamIdsDraft — fixtures 52쌍 + 한국 선수 소속팀", () => {
  const inputs: DraftInputs = {
    indexPairs: INDEX.teamIdPairs.pairs,
    fdTeams: FD.teams,
    fdMatchStatus: new Map(
      INDEX.matchIdPairs.pairs.map((p) => [p.fd, p.fdStatus]),
    ),
    afMatchStatus: new Map(
      INDEX.matchIdPairs.pairs.map((p) => [p.af, p.afStatus]),
    ),
    pairing: suggestTeamIdPairs(FD.finished, AF),
    koreanTeams: koreanTeamsFrom(KOREAN),
    nameSlugs: NAMES.entries.flatMap((e) =>
      e.kind === "team" && e.slug !== undefined
        ? [{ slug: e.slug, en: e.en }]
        : [],
    ),
    compOrder: COMPETITIONS.map((c) => c.id),
    draftDate: "2026-10-13",
  };
  const draft = buildTeamIdsDraft(inputs);
  const row = (slug: string) => draft.rows.find((r) => r.slug === slug)!;

  it("52행, 문제 없음, 스키마 통과, 한국 선수 소속팀 8개는 names.ko slug와 M0-32 af", () => {
    expect(draft.rows).toHaveLength(52);
    expect(draft.problems).toEqual([]);
    expect(TeamIdsFileSchema.safeParse(draft.file).success).toBe(true);
    expect(Object.keys(draft.file)).toEqual(
      [...Object.keys(draft.file)].sort(),
    );
    const korean = draft.rows.filter((r) => r.korean.length > 0);
    expect(korean.map((r) => r.slug).sort()).toEqual(
      Object.keys(M0_32_SQUAD_TEAM_IDS).sort(),
    );
    for (const r of korean) {
      expect(r.slugSource).toBe("names.ko");
      expect(r.af).toBe(M0_32_SQUAD_TEAM_IDS[r.slug]);
      expect(r.strength).toBe("strong");
    }
  });

  it("근거 약함 = 미종료·취소 경기에서만 나온 쌍(한국 선수 소속팀은 squads 확인으로 강함)", () => {
    expect(
      draft.rows
        .filter((r) => r.strength === "weak")
        .map((r) => r.fd)
        .sort((a, b) => a - b),
    ).toEqual([1, 17, 77, 87]); // 쾰른·프라이부르크·아틀레틱·라요
    expect(row("schalke-04").basis).toContain("TIMED/NS");
    expect(row("schalke-04").strength).toBe("strong");
    for (const r of draft.rows.filter((x) => x.strength === "weak")) {
      expect(r.flags[0]).toContain("근거 약함");
      expect(draft.file[r.slug]!.note).toContain("근거 약함");
    }
  });

  it("규칙이 어색한 slug는 표시만 한다(숫자 시작·이름 일부를 뗌·형태 토큰 남음)", () => {
    expect(row("07-elversberg").flags.join()).toContain("숫자로 시작");
    expect(row("paris").flags.join()).toContain('"FC"');
    expect(row("ssc-napoli").flags.join()).toContain("ssc");
    expect(row("arsenal").flags).toEqual([]);
    expect(row("arsenal").basis).toContain("560593↔1557417");
  });

  it("문제 감지 — slug 중복·한국 선수 af 불일치·index에 없는 짝·누락 소속팀", () => {
    const dup = buildTeamIdsDraft({
      ...inputs,
      indexPairs: [
        ...inputs.indexPairs,
        {
          fd: 999999,
          af: 999999,
          fdName: "Arsenal FC",
          afName: "Arsenal",
          evidence: "1↔2",
        },
      ],
    });
    expect(dup.problems.some((p) => p.includes('slug "arsenal" 중복'))).toBe(
      true,
    );

    const mismatch = buildTeamIdsDraft({
      ...inputs,
      koreanTeams: [
        { slug: "brentford", afTeamId: 54, players: ["kim-ji-soo"] },
        { slug: "midtjylland", afTeamId: null, players: ["hong-hyun-seok"] },
      ],
    });
    expect(mismatch.problems).toEqual([
      '"brentford" af 불일치: 초안 55 ↔ M0-32 54',
      '활성 한국 선수 소속팀 "midtjylland"(hong-hyun-seok)가 초안에 없음 — af 미확인',
    ]);

    const missing = buildTeamIdsDraft({
      ...inputs,
      indexPairs: inputs.indexPairs.filter((p) => p.fd !== 57),
    });
    expect(
      missing.problems.some((p) =>
        p.includes("index.json teamIdPairs에 없는 쌍 57:42"),
      ),
    ).toBe(true);
  });

  it("확인용 표 — 행마다 slug·fd·af·이름·근거·확인 필요, 끝에 문제 목록", () => {
    const md = formatDraftReview(draft);
    expect(md).toContain(
      "| 1 | `arsenal` | rule | EPL | 57 | Arsenal FC / Arsenal | 42 | Arsenal |",
    );
    expect(md).toContain("**약함**");
    expect(md.trim().endsWith("- 없음")).toBe(true);
    expect(md.split("\n").filter((l) => /^\| \d+ \|/.test(l))).toHaveLength(52);
  });
});
