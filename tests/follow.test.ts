/**
 * 팔로우 상태 모델 — src/lib/follow.ts · src/lib/schema/follow.ts (FR-110·FR-113·FR-114, PRD §15 D67 ②③, M4-07)
 *
 * 읽기 경계 정리(깨진 값 · 모르는 slug · 중복 · 한도), 추가 · 제거 · 토글 · 버튼 3상태(종류별 한도 팀 5 + 선수 5),
 * 가져오기(덮어쓰기 · 합치기), 공유 URL 쿼리 `t`·`p` 직렬화/파싱, 그리고 손 구현 정리 함수와 zod 스키마가 같은 규칙인지 본다.
 */
import { describe, expect, it } from "vitest";

import {
  addFollow,
  EMPTY_FOLLOWS,
  FOLLOW_LIMITS,
  FOLLOW_QUERY_PARAMS,
  FOLLOW_SLUG_PATTERN,
  FOLLOW_STORAGE_KEY,
  followButtonState,
  followQueryLists,
  followsFromQuery,
  followsToQuery,
  type FollowState,
  importFollows,
  isFollowAtLimit,
  isFollowEmpty,
  isFollowing,
  isFollowSlug,
  normalizeFollows,
  parseFollows,
  removeFollow,
  sameFollows,
  serializeFollows,
  toggleFollow,
} from "@/lib/follow";
import { FollowStateSchema, SlugSchema } from "@/lib/schema";

const TEAMS = [
  "arsenal",
  "liverpool",
  "bayern-munchen",
  "napoli",
  "psg",
  "inter",
  "milan",
];
const PLAYERS = [
  "kim-min-jae",
  "lee-kang-in",
  "hwang-hee-chan",
  "seol-young-woo",
  "lee-jae-sung",
  "jens-castrop",
];

function state(teams: string[] = [], players: string[] = []): FollowState {
  return { v: 1, teams, players };
}

describe("상수", () => {
  it("키 · 한도 · 쿼리 이름(D67 ②③)", () => {
    expect(FOLLOW_STORAGE_KEY).toBe("ed-follow");
    expect(FOLLOW_LIMITS).toEqual({ teams: 5, players: 5 });
    expect(FOLLOW_QUERY_PARAMS).toEqual({ teams: "t", players: "p" });
  });

  it("빈 상태는 얼어 있고 스키마를 통과한다", () => {
    expect(Object.isFrozen(EMPTY_FOLLOWS)).toBe(true);
    expect(Object.isFrozen(EMPTY_FOLLOWS.teams)).toBe(true);
    expect(FollowStateSchema.safeParse(EMPTY_FOLLOWS).success).toBe(true);
  });
});

describe("slug 형식 — SlugSchema와 같은 규칙", () => {
  const samples = [
    "arsenal",
    "kim-min-jae",
    "1-fc-koln",
    "a",
    "Arsenal",
    "kim_min_jae",
    "-arsenal",
    "arsenal-",
    "kim--min",
    "",
    " arsenal",
    "아스널",
    "a/b",
    "a,b",
  ];
  it.each(samples)("%j", (sample) => {
    expect(FOLLOW_SLUG_PATTERN.test(sample)).toBe(
      SlugSchema.safeParse(sample).success,
    );
  });

  it("64자까지만", () => {
    expect(isFollowSlug("a".repeat(64))).toBe(true);
    expect(isFollowSlug("a".repeat(65))).toBe(false);
    expect(isFollowSlug(1)).toBe(false);
    expect(isFollowSlug(null)).toBe(false);
  });
});

describe("normalizeFollows · parseFollows — 읽기 경계", () => {
  it("정상 값은 그대로", () => {
    const value = state(["arsenal"], ["kim-min-jae"]);
    expect(normalizeFollows(value)).toEqual(value);
    expect(parseFollows(JSON.stringify(value))).toEqual(value);
  });

  it.each([
    ["null", null],
    ["문자열", "arsenal"],
    ["숫자", 1],
    ["배열", ["arsenal"]],
    ["버전 없음", { teams: ["arsenal"], players: [] }],
    ["다른 버전", { v: 2, teams: ["arsenal"], players: [] }],
    ["문자열 버전", { v: "1", teams: ["arsenal"], players: [] }],
  ])("%s → 빈 상태", (_label, raw) => {
    expect(normalizeFollows(raw)).toBe(EMPTY_FOLLOWS);
  });

  it("깨진 JSON · null · 빈 문자열 → 빈 상태(던지지 않음)", () => {
    for (const text of [
      null,
      "",
      "{",
      "undefined",
      '{"v":1,"teams":["a"',
    ] as const) {
      expect(parseFollows(text)).toBe(EMPTY_FOLLOWS);
    }
  });

  it("배열이 아닌 목록은 빈 목록, 형식이 틀린 slug는 버린다", () => {
    expect(
      normalizeFollows({
        v: 1,
        teams: [
          "arsenal",
          "Arsenal",
          3,
          null,
          "",
          "bad slug",
          "a".repeat(65),
          "liverpool",
        ],
        players: "kim-min-jae",
      }),
    ).toEqual(state(["arsenal", "liverpool"], []));
  });

  it("중복은 처음 것만", () => {
    expect(
      normalizeFollows({
        v: 1,
        teams: ["arsenal", "liverpool", "arsenal"],
        players: ["kim-min-jae", "kim-min-jae"],
      }),
    ).toEqual(state(["arsenal", "liverpool"], ["kim-min-jae"]));
  });

  it("한도를 넘으면 앞에서부터 종류별 5개", () => {
    const got = normalizeFollows({ v: 1, teams: TEAMS, players: PLAYERS });
    expect(got.teams).toEqual(TEAMS.slice(0, 5));
    expect(got.players).toEqual(PLAYERS.slice(0, 5));
  });

  it("중복을 버린 뒤에 한도를 센다", () => {
    const got = normalizeFollows({
      v: 1,
      teams: ["a", "a", "b", "b", "c", "d", "e", "f"],
      players: [],
    });
    expect(got.teams).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("모르는 키는 버린다(저장 형식은 v · teams · players만)", () => {
    expect(
      normalizeFollows({ v: 1, teams: ["arsenal"], players: [], extra: true }),
    ).toEqual(state(["arsenal"]));
  });

  it("known을 주면 모르는 slug를 버린다 — 한도는 버린 뒤에 센다", () => {
    const known = {
      teams: new Set([
        "liverpool",
        "napoli",
        "psg",
        "inter",
        "milan",
        "arsenal",
      ]),
      players: new Set(["kim-min-jae"]),
    };
    const got = normalizeFollows(
      {
        v: 1,
        teams: ["gone-fc", ...TEAMS],
        players: ["retired", "kim-min-jae"],
      },
      known,
    );
    expect(got.teams).toEqual([
      "arsenal",
      "liverpool",
      "napoli",
      "psg",
      "inter",
    ]);
    expect(got.players).toEqual(["kim-min-jae"]);
  });

  it("모두 버려져 비면 빈 상태 객체", () => {
    expect(normalizeFollows({ v: 1, teams: ["BAD"], players: [] })).toBe(
      EMPTY_FOLLOWS,
    );
  });
});

describe("serializeFollows", () => {
  it("키 순서 v · teams · players, parse와 왕복", () => {
    const value = state(["arsenal", "napoli"], ["kim-min-jae"]);
    const text = serializeFollows(value);
    expect(text).toBe(
      '{"v":1,"teams":["arsenal","napoli"],"players":["kim-min-jae"]}',
    );
    expect(parseFollows(text)).toEqual(value);
  });

  it("다른 속성이 섞인 객체여도 저장 형식만 쓴다", () => {
    const value = { ...state(["arsenal"]), extra: 1 } as FollowState;
    expect(serializeFollows(value)).toBe(
      '{"v":1,"teams":["arsenal"],"players":[]}',
    );
  });
});

describe("추가 · 제거 · 토글", () => {
  it("추가는 끝에 붙이고 원래 객체를 바꾸지 않는다", () => {
    const before = state(["arsenal"]);
    const after = addFollow(before, "teams", "napoli");
    expect(after).toEqual(state(["arsenal", "napoli"]));
    expect(before).toEqual(state(["arsenal"]));
  });

  it("이미 팔로우 중 · 형식 오류 · 한도면 같은 객체", () => {
    const one = state(["arsenal"]);
    expect(addFollow(one, "teams", "arsenal")).toBe(one);
    expect(addFollow(one, "teams", "Bad Slug")).toBe(one);
    const full = state(TEAMS.slice(0, 5));
    expect(addFollow(full, "teams", "milan")).toBe(full);
  });

  it("한도는 종류별 — 팀이 꽉 차도 선수는 더할 수 있다", () => {
    const full = state(TEAMS.slice(0, 5));
    expect(addFollow(full, "players", "kim-min-jae").players).toEqual([
      "kim-min-jae",
    ]);
  });

  it("제거 · 없는 것 제거는 같은 객체", () => {
    const value = state(["arsenal", "napoli"], ["kim-min-jae"]);
    expect(removeFollow(value, "teams", "arsenal")).toEqual(
      state(["napoli"], ["kim-min-jae"]),
    );
    expect(removeFollow(value, "players", "kim-min-jae")).toEqual(
      state(["arsenal", "napoli"], []),
    );
    expect(removeFollow(value, "teams", "milan")).toBe(value);
    // 같은 slug라도 다른 종류면 건드리지 않는다
    expect(removeFollow(value, "players", "arsenal")).toBe(value);
  });

  it("토글 켜기 ↔ 끄기, 한도에서 꺼진 것을 켜면 그대로", () => {
    const empty = EMPTY_FOLLOWS;
    const on = toggleFollow(empty, "players", "kim-min-jae");
    expect(isFollowing(on, "players", "kim-min-jae")).toBe(true);
    expect(toggleFollow(on, "players", "kim-min-jae").players).toEqual([]);
    const full = state([], PLAYERS.slice(0, 5));
    expect(toggleFollow(full, "players", "jens-castrop")).toBe(full);
    // 한도여도 켜진 것은 끌 수 있다
    expect(toggleFollow(full, "players", "kim-min-jae").players).toHaveLength(
      4,
    );
  });
});

describe("한도 판정 · 버튼 3상태(DESIGN §9.3)", () => {
  it("isFollowAtLimit · isFollowEmpty", () => {
    expect(isFollowEmpty(EMPTY_FOLLOWS)).toBe(true);
    expect(isFollowEmpty(state([], ["kim-min-jae"]))).toBe(false);
    expect(isFollowAtLimit(state(TEAMS.slice(0, 4)), "teams")).toBe(false);
    expect(isFollowAtLimit(state(TEAMS.slice(0, 5)), "teams")).toBe(true);
    expect(isFollowAtLimit(state(TEAMS.slice(0, 5)), "players")).toBe(false);
  });

  it("켜짐(한도여도) · 한도(그 종류의 꺼진 것만) · 꺼짐", () => {
    const value = state(TEAMS.slice(0, 5), ["kim-min-jae"]);
    expect(followButtonState(value, "teams", "arsenal")).toBe("on");
    expect(followButtonState(value, "teams", "milan")).toBe("limit");
    expect(followButtonState(value, "players", "lee-kang-in")).toBe("off");
    expect(followButtonState(value, "players", "kim-min-jae")).toBe("on");
    expect(followButtonState(EMPTY_FOLLOWS, "teams", "arsenal")).toBe("off");
  });
});

describe("가져오기 — 덮어쓰기 · 합치기(D67 ③)", () => {
  const current = state(["arsenal", "liverpool", "napoli"], ["kim-min-jae"]);

  it("덮어쓰기: 들어온 것만", () => {
    const got = importFollows(
      current,
      state(["milan"], ["lee-kang-in"]),
      "replace",
    );
    expect(got.state).toEqual(state(["milan"], ["lee-kang-in"]));
    expect(got.dropped).toEqual({ teams: [], players: [] });
  });

  it("덮어쓰기로 모두 비우면 빈 상태 객체", () => {
    expect(importFollows(current, state(), "replace").state).toBe(
      EMPTY_FOLLOWS,
    );
  });

  it("합치기: 지금 것 먼저, 중복 없이, 한도를 넘는 들어온 것은 dropped", () => {
    const got = importFollows(
      current,
      state(
        ["napoli", "psg", "inter", "milan"],
        ["kim-min-jae", "lee-kang-in"],
      ),
      "merge",
    );
    expect(got.state).toEqual(
      state(
        ["arsenal", "liverpool", "napoli", "psg", "inter"],
        ["kim-min-jae", "lee-kang-in"],
      ),
    );
    expect(got.dropped).toEqual({ teams: ["milan"], players: [] });
  });

  it("정리 전 목록(URL 쿼리)도 받는다 — 형식 오류는 버리고 한도 초과만 dropped로 센다", () => {
    const got = importFollows(
      EMPTY_FOLLOWS,
      { teams: [...TEAMS, "BAD", "arsenal"], players: [] },
      "replace",
    );
    expect(got.state.teams).toEqual(TEAMS.slice(0, 5));
    expect(got.dropped.teams).toEqual(["inter", "milan"]);
  });

  it("known을 주면 모르는 slug는 버리고 dropped에 넣지 않는다", () => {
    const known = { teams: new Set(["arsenal"]), players: new Set<string>() };
    const got = importFollows(
      EMPTY_FOLLOWS,
      { teams: ["gone-fc", "arsenal"], players: ["x"] },
      "merge",
      known,
    );
    expect(got.state).toEqual(state(["arsenal"]));
    expect(got.dropped).toEqual({ teams: [], players: [] });
  });

  it("sameFollows는 순서까지 본다", () => {
    expect(sameFollows(state(["a", "b"]), state(["a", "b"]))).toBe(true);
    expect(sameFollows(state(["a", "b"]), state(["b", "a"]))).toBe(false);
    expect(sameFollows(state(["a"]), state(["a"], ["x"]))).toBe(false);
  });
});

describe("공유 URL 쿼리 t · p(D67 ③)", () => {
  it("직렬화: 쉼표를 인코딩하지 않는 읽히는 쿼리, 빈 종류는 뺀다", () => {
    expect(
      followsToQuery(state(["arsenal", "bayern-munchen"], ["kim-min-jae"])),
    ).toBe("t=arsenal,bayern-munchen&p=kim-min-jae");
    expect(followsToQuery(state([], ["kim-min-jae"]))).toBe("p=kim-min-jae");
    expect(followsToQuery(state(["arsenal"]))).toBe("t=arsenal");
    expect(followsToQuery(EMPTY_FOLLOWS)).toBe("");
  });

  it("왕복", () => {
    const value = state(["arsenal", "napoli"], ["kim-min-jae", "lee-kang-in"]);
    expect(followsFromQuery(followsToQuery(value))).toEqual(value);
    expect(followsFromQuery(`?${followsToQuery(value)}`)).toEqual(value);
  });

  it("t · p 둘 다 없으면 null(가져올 것 없음)", () => {
    expect(followsFromQuery("")).toBeNull();
    expect(followsFromQuery("?utm_source=x")).toBeNull();
    expect(followQueryLists("?q=1")).toBeNull();
  });

  it("빈 값이 있으면 가져오기(빈 상태)", () => {
    expect(followsFromQuery("?t=")).toBe(EMPTY_FOLLOWS);
  });

  it("%2C · 반복 이름 · 공백 · 형식 오류 · 중복 · 한도", () => {
    expect(
      followsFromQuery(
        "?t=arsenal%2Cnapoli&t=psg&p=kim-min-jae,,Bad,kim-min-jae",
      ),
    ).toEqual(state(["arsenal", "napoli", "psg"], ["kim-min-jae"]));
    expect(followsFromQuery(`?t=${TEAMS.join(",")}`)?.teams).toEqual(
      TEAMS.slice(0, 5),
    );
    expect(followsFromQuery("?t=%20arsenal%20")?.teams).toEqual(["arsenal"]);
  });

  it("URLSearchParams도 받는다", () => {
    expect(followsFromQuery(new URLSearchParams("p=kim-min-jae"))).toEqual(
      state([], ["kim-min-jae"]),
    );
  });

  it("followQueryLists는 한도 전 목록(형식 검사만)", () => {
    expect(followQueryLists(`?t=${TEAMS.join(",")},BAD&p=`)).toEqual({
      teams: TEAMS,
      players: [],
    });
  });
});

describe("손 구현 정리 ↔ zod FollowStateSchema", () => {
  const corpus: unknown[] = [
    null,
    undefined,
    0,
    "x",
    [],
    {},
    { v: 1 },
    { v: 1, teams: [], players: [] },
    { v: 1, teams: ["arsenal"], players: ["kim-min-jae"] },
    { v: 1, teams: TEAMS, players: PLAYERS },
    { v: 1, teams: ["a", "a"], players: [] },
    { v: 1, teams: ["A"], players: [1, null, "ok"] },
    { v: 1, teams: "arsenal", players: {} },
    { v: 1, teams: ["a".repeat(64), "b".repeat(65)], players: [] },
    { v: 2, teams: ["arsenal"], players: [] },
    { v: 1, teams: ["arsenal"], players: [], extra: 1 },
    { v: 1, teams: TEAMS.slice(0, 5), players: PLAYERS.slice(0, 5) },
  ];

  it.each(corpus.map((raw) => [JSON.stringify(raw) ?? "undefined", raw]))(
    "정리 결과는 스키마 통과, 스키마를 통과하던 값은 그대로 — %s",
    (_label, raw) => {
      const normalized = normalizeFollows(raw);
      expect(FollowStateSchema.safeParse(normalized).success).toBe(true);
      if (FollowStateSchema.safeParse(raw).success) {
        expect(normalized).toEqual(raw);
      }
    },
  );

  it("추가 · 토글 · 가져오기 결과도 늘 스키마를 통과한다", () => {
    let value: FollowState = EMPTY_FOLLOWS;
    for (const slug of [...TEAMS, "Bad"])
      value = addFollow(value, "teams", slug);
    for (const slug of PLAYERS) value = toggleFollow(value, "players", slug);
    expect(FollowStateSchema.safeParse(value).success).toBe(true);
    const merged = importFollows(
      value,
      { teams: TEAMS, players: PLAYERS },
      "merge",
    ).state;
    expect(FollowStateSchema.safeParse(merged).success).toBe(true);
  });
});
