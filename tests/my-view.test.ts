/**
 * M4-08 — `/my` 화면 모델(src/lib/my-view.ts) · 첫 페인트 전 팔로우 읽기(src/lib/follow-boot.ts) · 자료 파일 만들기(scripts/lib/follow-data.ts)
 * (PRD FR-110~112, DESIGN §9.3 D2 "`/my` 틀", PRD §15 D64 ③ · D67 ②)
 */
import { describe, expect, it } from "vitest";

import { playerFollowData, teamFollowData } from "../scripts/lib/follow-data";
import type { TeamLookup, TeamView } from "@/lib/competition-view";
import { parseFollows, type FollowState } from "@/lib/follow";
import { READ_FOLLOW_KEYS_ES5 } from "@/lib/follow-boot";
import {
  followKey,
  followKeySet,
  followSummary,
  mergeFixtures,
  mergeResults,
  MY_DATA_VERSION,
  parseEntityData,
  type MyDirectory,
  type MyEntityData,
  type MyEntityInput,
  type MyResultRowView,
} from "@/lib/my-view";
import type { FixtureRowView } from "@/lib/player-detail-view";
import type { Match } from "@/lib/schema/competition";

const team = (slug: string, name: string): FixtureRowView["home"] => ({
  name,
  latin: false,
  badge: { name, short: slug.slice(0, 3).toUpperCase(), colors: null },
  link: null,
});

function fixture(key: string, kickoff: string): FixtureRowView {
  return {
    key,
    kickoff,
    time: "05:00",
    day: "11.04 (수)",
    comp: {
      kind: "comp",
      comp: "UCL",
      short: "UCL",
      name: "UEFA 챔피언스리그",
    },
    round: "4차전",
    home: team("atletico-madrid", "아틀레티코 마드리드"),
    away: team("bayern-munchen", "바이에른 뮌헨"),
  };
}

function result(
  key: string,
  kickoff: string,
  teamSlug: string,
  player?: string,
): MyResultRowView {
  return {
    key,
    kickoff,
    date: "10.26",
    comp: {
      kind: "comp",
      comp: "BUNDESLIGA",
      short: "분데스",
      name: "분데스리가",
    },
    team: {
      slug: teamSlug,
      name: teamSlug,
      latin: false,
      short: "X",
      colors: null,
    },
    opponent: {
      name: "프라이부르크",
      latin: false,
      badge: { name: "프라이부르크", short: "SCF", colors: null },
    },
    home: false,
    result: { outcome: "W", for: 3, against: 1, pens: null },
    goals: player ? 1 : 0,
    assists: player ? 0 : null,
    ...(player ? { player } : {}),
  };
}

function data(
  kind: MyEntityData["kind"],
  slug: string,
  next: FixtureRowView[],
  recent: MyResultRowView[],
): MyEntityData {
  return { v: MY_DATA_VERSION, kind, slug, next, recent };
}

describe("팔로우 키", () => {
  it("팀 t: · 선수 p:(공유 URL 쿼리 이름과 같은 글자)", () => {
    expect(followKey("teams", "arsenal")).toBe("t:arsenal");
    expect(followKey("players", "kim-min-jae")).toBe("p:kim-min-jae");
    expect([
      ...followKeySet({ teams: ["arsenal"], players: ["kim-min-jae"] }),
    ]).toEqual(["t:arsenal", "p:kim-min-jae"]);
  });
});

describe("다음 경기 합치기 — 경기 id로 한 줄 + 걸린 팔로우(팔로우 순서), 킥오프 순", () => {
  it("겹치는 경기는 한 번만, 이름은 팀 → 선수 순서 그대로", () => {
    const ucl = fixture("fd-1", "2026-11-03T20:00:00Z");
    const entries: MyEntityInput[] = [
      {
        kind: "teams",
        slug: "bayern-munchen",
        name: "바이에른 뮌헨",
        data: data(
          "teams",
          "bayern-munchen",
          [ucl, fixture("fd-3", "2026-11-07T14:30:00Z")],
          [],
        ),
      },
      {
        kind: "teams",
        slug: "atletico-madrid",
        name: "아틀레티코 마드리드",
        data: data(
          "teams",
          "atletico-madrid",
          [fixture("fd-0", "2026-10-31T13:00:00Z"), ucl],
          [],
        ),
      },
      {
        kind: "players",
        slug: "kim-min-jae",
        name: "김민재",
        data: data("players", "kim-min-jae", [ucl], []),
      },
      { kind: "players", slug: "gone", name: "gone", data: null },
    ];
    const merged = mergeFixtures(entries);
    expect(merged.map((f) => f.row.key)).toEqual(["fd-0", "fd-1", "fd-3"]);
    expect(merged[1]?.why).toEqual([
      "바이에른 뮌헨",
      "아틀레티코 마드리드",
      "김민재",
    ]);
    expect(merged[0]?.why).toEqual(["아틀레티코 마드리드"]);
  });
});

describe("최근 결과 합치기 — 선수·팀 기준 행(D64 ③), 늦은 순", () => {
  it("팀 행과 그 팀 소속 선수 행이 같은 경기면 팀 행 하나만, 팀을 팔로우하지 않은 선수 행은 남는다", () => {
    const entries: MyEntityInput[] = [
      {
        kind: "teams",
        slug: "bayern-munchen",
        name: "바이에른 뮌헨",
        data: data(
          "teams",
          "bayern-munchen",
          [],
          [
            result("m1", "2026-10-25T16:30:00Z", "bayern-munchen"),
            result("m0", "2026-10-18T16:30:00Z", "bayern-munchen"),
          ],
        ),
      },
      {
        kind: "players",
        slug: "kim-min-jae",
        name: "김민재",
        data: data(
          "players",
          "kim-min-jae",
          [],
          [result("m1", "2026-10-25T16:30:00Z", "bayern-munchen", "김민재")],
        ),
      },
      {
        kind: "players",
        slug: "lee-kang-in",
        name: "이강인",
        data: data(
          "players",
          "lee-kang-in",
          [],
          [result("m2", "2026-10-26T19:00:00Z", "atletico-madrid", "이강인")],
        ),
      },
    ];
    const rows = mergeResults(entries);
    expect(rows.map((r) => [r.key, r.player ?? r.team.slug])).toEqual([
      ["m2", "이강인"],
      ["m1", "bayern-munchen"],
      ["m0", "bayern-munchen"],
    ]);
  });
});

describe("자료 파일 읽기 경계 · 머리 부제", () => {
  it("형식 · 종류 · slug가 다르면 null", () => {
    const ok = data("teams", "arsenal", [], []);
    expect(parseEntityData(ok, "teams", "arsenal")).toBe(ok);
    expect(parseEntityData(ok, "players", "arsenal")).toBeNull();
    expect(parseEntityData(ok, "teams", "chelsea")).toBeNull();
    expect(parseEntityData({ ...ok, v: 2 }, "teams", "arsenal")).toBeNull();
    expect(
      parseEntityData({ ...ok, next: null }, "teams", "arsenal"),
    ).toBeNull();
    expect(parseEntityData("x", "teams", "arsenal")).toBeNull();
  });

  it("팔로우 이름 — 디렉터리에 없으면 slug", () => {
    const dir: MyDirectory = {
      teams: { arsenal: { n: "아스널", s: "ARS", u: "EPL 2위" } },
      players: { "kim-min-jae": { n: "김민재", t: "바이에른 뮌헨" } },
    };
    expect(
      followSummary(dir, {
        teams: ["arsenal", "old-fc"],
        players: ["kim-min-jae"],
      }),
    ).toEqual({ teams: ["아스널", "old-fc"], players: ["김민재"] });
  });
});

describe("첫 페인트 전 팔로우 읽기(READ_FOLLOW_KEYS_ES5) ≡ parseFollows → followKeySet", () => {
  const read = (text: string | null, throws = false): string[] => {
    const storage = {
      getItem: () => {
        if (throws) throw new Error("blocked");
        return text;
      },
    };
    const fn = new Function(
      "window",
      `return (${READ_FOLLOW_KEYS_ES5})();`,
    ) as (w: unknown) => Record<string, number>;
    return Object.keys(fn({ localStorage: storage })).sort();
  };
  const expected = (text: string | null) =>
    [...followKeySet(parseFollows(text) as FollowState)].sort();

  it.each([
    null,
    "",
    "not json",
    "null",
    "[]",
    "1",
    JSON.stringify({ v: 2, teams: ["arsenal"] }),
    JSON.stringify({ v: 1 }),
    JSON.stringify({ v: 1, teams: "arsenal", players: ["kim-min-jae"] }),
    JSON.stringify({
      v: 1,
      teams: ["arsenal", "arsenal", "Bad Slug", 3, "-x"],
    }),
    JSON.stringify({
      v: 1,
      teams: ["a", "b", "c", "d", "e", "f", "g"],
      players: ["p1", "p2", "p3", "p4", "p5", "p6"],
    }),
    JSON.stringify({ v: 1, teams: ["constructor", "to-string", "__proto__"] }),
    JSON.stringify({ v: 1, teams: [`${"x".repeat(65)}`, "ok"] }),
  ])("%s", (text) => {
    expect(read(text)).toEqual(expected(text));
  });

  it("저장소가 던지면 빈 팔로우", () => {
    expect(read(null, true)).toEqual([]);
  });
});

// ─── 자료 파일 만들기 ────────────────────────────────────────────────────────

const VIEWS: Record<string, TeamView> = {
  "bayern-munchen": {
    slug: "bayern-munchen",
    name: "바이에른 뮌헨",
    latin: false,
    short: "FCB",
    colors: ["#D3052B", "#FFFFFF"],
    page: true,
  },
  freiburg: {
    slug: "freiburg",
    name: "프라이부르크",
    latin: false,
    short: "SCF",
    colors: ["#E2001A", "#000000"],
    page: true,
  },
};
const lookup: TeamLookup = (slug) =>
  VIEWS[slug] ?? { slug, name: slug, latin: true, short: "", colors: null };

function match(over: Partial<Match> & Pick<Match, "id" | "kickoff">): Match {
  return {
    comp: "BUNDESLIGA",
    round: "8",
    home: "bayern-munchen",
    away: "freiburg",
    status: "scheduled",
    score: null,
    tbc: false,
    ...over,
  } as Match;
}

describe("팀 자료 파일(scripts/lib/follow-data.ts)", () => {
  const now = Date.parse("2026-11-02T00:00:00Z");
  const matches: Match[] = [
    match({
      id: "fd-1",
      kickoff: "2026-10-25T16:30:00Z",
      home: "freiburg",
      away: "bayern-munchen",
      status: "finished",
      score: { h: 1, a: 3 },
    }),
    match({
      id: "fd-2",
      kickoff: "2026-10-28T19:00:00Z",
      status: "finished",
      score: { h: 2, a: 2, aet: true, pens: { h: 4, a: 3 } },
    }),
    match({ id: "fd-3", kickoff: "2026-11-07T14:30:00Z" }),
    match({ id: "fd-4", kickoff: "2026-11-21T19:30:00Z", tbc: true }),
  ];
  const out = teamFollowData("bayern-munchen", {
    matchLists: [matches],
    team: lookup,
    competitions: [{ id: "BUNDESLIGA", short: "분데스", name: "분데스리가" }],
    nowMs: now,
  });

  it("다음 경기 — 지금 이후 예정(임시 포함), 킥오프 순, 팀 링크 · 배지 밖 필드는 뺀다", () => {
    expect(out.next.map((f) => [f.key, f.time])).toEqual([
      ["fd-3", "23:30"],
      ["fd-4", null],
    ]);
    expect(out.next[0]?.home.link).toBeNull();
    expect(Object.keys(out.next[0]?.home.badge ?? {}).sort()).toEqual([
      "colors",
      "name",
      "short",
    ]);
  });

  it("최근 결과 — 늦은 순, 기준 팀 득점 먼저 + 홈/원정, 승부차기는 무(D)와 기준 팀 먼저", () => {
    expect(
      out.recent.map((r) => [
        r.key,
        r.home,
        r.result?.outcome,
        r.result?.for,
        r.result?.against,
      ]),
    ).toEqual([
      ["fd-2", true, "D", 2, 2],
      ["fd-1", false, "W", 3, 1],
    ]);
    expect(out.recent[0]?.result?.pens).toEqual({ for: 4, against: 3 });
    expect(out.recent[1]?.date).toBe("10.26");
  });

  it("선수 자료 — 로그를 늦은 순 선수 행으로(선수 이름 · 골 · 도움)", () => {
    const p = playerFollowData({
      slug: "kim-min-jae",
      nameKo: "김민재",
      team: VIEWS["bayern-munchen"]!,
      upcoming: [],
      log: [
        {
          key: "fd-1",
          kickoff: "2026-10-25T16:30:00Z",
          comp: {
            kind: "comp",
            comp: "BUNDESLIGA",
            short: "분데스",
            name: "분데스리가",
          },
          round: "8라운드",
          opponent: {
            name: "프라이부르크",
            latin: false,
            badge: VIEWS.freiburg!,
          },
          home: false,
          result: { outcome: "W", for: 3, against: 1, pens: null },
          goals: 1,
          assists: 0,
          appearance: {
            text: "90",
            tone: "on",
            label: "선발",
            strong: true,
            sr: "선발 90분",
          },
        },
      ],
    });
    expect(p.recent[0]).toMatchObject({
      key: "fd-1",
      player: "김민재",
      goals: 1,
      assists: 0,
      team: { slug: "bayern-munchen" },
    });
    expect(Object.keys(p.recent[0]?.opponent.badge ?? {}).sort()).toEqual([
      "colors",
      "name",
      "short",
    ]);
  });
});
