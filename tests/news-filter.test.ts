/**
 * M1-33 — 뉴스 필터 순수 모델 (src/lib/news/filter.ts, PRD FR-31·FR-32, DECISIONS D0 §5 #11·#13)
 *
 * 주소 쿼리 읽기·쓰기(잘못된 값 무시 · 순서 comp → cat → team → kr · 필터 아닌 쿼리 보존), 술어(AND), 설명·알림 문장, 조작 → 다음 상태,
 * 목차·칩 건수(fixtures 23장 = 혼합안 홈 목차의 숫자). DOM에 그리는 부분과 부트 스크립트 대조는 tests/news-filter-dom.test.tsx.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadNewsFilterView } from "@/lib/data/news-filter";
import { CATEGORY_LABEL } from "@/lib/news/labels";
import {
  buildFilterView,
  cardMatchesFilter,
  EMPTY_FILTER,
  FILTER_CATEGORIES,
  FILTER_DESC_DEFAULT,
  FILTER_PARAMS,
  filterAnnouncement,
  filterDescription,
  filterKey,
  filterQueryPairs,
  isFilterActive,
  nextFilterState,
  parseFilterQuery,
  withFilterQuery,
  type FilterableCard,
  type NewsFilterConfig,
  type NewsFilterState,
} from "@/lib/news/filter";
import { CategorySchema, CompIdSchema } from "@/lib/schema/common";
import { NewsFileSchema } from "@/lib/schema/news";

const sample = NewsFileSchema.parse(
  JSON.parse(readFileSync(path.resolve("fixtures/news-sample.json"), "utf8")),
);

const CONFIG: NewsFilterConfig = {
  comps: {
    EPL: { s: "EPL", n: "프리미어리그" },
    LALIGA: { s: "라리가", n: "라리가" },
    LIGUE1: { s: "리그1", n: "리그 1" },
  },
  cats: { ...CATEGORY_LABEL },
  teams: { chelsea: "첼시", "tottenham-hotspur": "토트넘 홋스퍼" },
  d: FILTER_DESC_DEFAULT,
  k: "한국 선수 관련",
};

function state(partial: Partial<NewsFilterState>): NewsFilterState {
  return { ...EMPTY_FILTER, ...partial };
}

describe("필터 이름·분류 순서", () => {
  it("쿼리 이름은 comp·cat·team·kr(PRD 예시 ?comp=epl&cat=transfer)", () => {
    expect(FILTER_PARAMS).toEqual(["comp", "cat", "team", "kr"]);
  });

  it("분류는 FR-31 7종을 스키마 순서대로", () => {
    expect(FILTER_CATEGORIES).toEqual(CategorySchema.options);
  });
});

describe("parseFilterQuery — 주소 쿼리 → 상태", () => {
  it("PRD 예시 ?comp=epl&cat=transfer", () => {
    expect(parseFilterQuery("?comp=epl&cat=transfer", CONFIG)).toEqual(
      state({ comp: "EPL", cat: "transfer" }),
    );
  });

  it("빈 쿼리·필터 아닌 쿼리 = 필터 없음", () => {
    expect(parseFilterQuery("", CONFIG)).toEqual(EMPTY_FILTER);
    expect(parseFilterQuery("?utm_source=x&stage=m1", CONFIG)).toEqual(
      EMPTY_FILTER,
    );
  });

  it("대소문자는 가리지 않고 읽는다", () => {
    expect(
      parseFilterQuery("comp=EpL&cat=TRANSFER&team=Chelsea", CONFIG),
    ).toEqual(state({ comp: "EPL", cat: "transfer", team: "chelsea" }));
  });

  it("잘못된 값은 그 필터만 무시한다 — 모르는 대회·분류, 설정에 없는 팀, kr=1 밖의 값", () => {
    expect(
      parseFilterQuery("comp=mls&cat=transfer&team=unknown-fc&kr=true", CONFIG),
    ).toEqual(state({ cat: "transfer" }));
    expect(parseFilterQuery("comp=epl&cat=gossip&kr=1", CONFIG)).toEqual(
      state({ comp: "EPL", kr: true }),
    );
    expect(parseFilterQuery("cat=all", CONFIG)).toEqual(EMPTY_FILTER);
    expect(parseFilterQuery("comp=&cat=&team=&kr=", CONFIG)).toEqual(
      EMPTY_FILTER,
    );
  });

  it("설정 JSON의 원형 이름(constructor·__proto__·toString)은 값이 아니다", () => {
    for (const bad of [
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
    ])
      expect(
        parseFilterQuery(`comp=${bad}&cat=${bad}&team=${bad}`, CONFIG),
      ).toEqual(EMPTY_FILTER);
  });

  it("설정에 없는 대회(competitions.json 밖)는 무시한다", () => {
    expect(parseFilterQuery("comp=ucl", CONFIG).comp).toBeNull();
  });

  it("같은 이름이 둘이면 앞 값", () => {
    expect(parseFilterQuery("cat=injury&cat=transfer", CONFIG).cat).toBe(
      "injury",
    );
  });

  it("URLSearchParams도 받는다", () => {
    expect(parseFilterQuery(new URLSearchParams("kr=1"), CONFIG)).toEqual(
      state({ kr: true }),
    );
  });
});

describe("withFilterQuery — 상태 → 주소 쿼리", () => {
  it("comp → cat → team → kr 순서, 대회는 소문자", () => {
    expect(
      withFilterQuery(
        "",
        state({ kr: true, team: "chelsea", cat: "transfer", comp: "EPL" }),
      ),
    ).toBe("?comp=epl&cat=transfer&team=chelsea&kr=1");
  });

  it("필터 없음 = 빈 문자열(물음표 없음)", () => {
    expect(withFilterQuery("?cat=transfer", EMPTY_FILTER)).toBe("");
  });

  it("필터 아닌 쿼리는 앞에 그대로 두고, 필터 4종은 지운 뒤 다시 붙인다", () => {
    expect(
      withFilterQuery("?kr=1&utm_source=x&cat=injury", state({ cat: "club" })),
    ).toBe("?utm_source=x&cat=club");
  });

  it("왕복 — 모든 조합이 같은 상태로 돌아온다", () => {
    const comps = [null, "EPL", "LIGUE1"] as const;
    const cats = [null, ...FILTER_CATEGORIES];
    const teams = [null, "chelsea"];
    for (const comp of comps)
      for (const cat of cats)
        for (const team of teams)
          for (const kr of [false, true]) {
            const s = state({ comp, cat, team, kr });
            expect(parseFilterQuery(withFilterQuery("", s), CONFIG)).toEqual(s);
          }
  });

  it("filterQueryPairs·filterKey — 켜진 필터만, 같은 상태면 같은 키", () => {
    expect(filterQueryPairs(EMPTY_FILTER)).toEqual([]);
    expect(filterKey(EMPTY_FILTER)).toBe("");
    expect(filterKey(state({ cat: "ucl", comp: "UCL" }))).toBe(
      "comp=ucl&cat=ucl",
    );
  });
});

describe("cardMatchesFilter — 필터 4종 AND", () => {
  const card: FilterableCard = {
    cat: "transfer",
    comps: ["EPL", "BUNDESLIGA"],
    teams: ["arsenal", "bayern-munchen"],
    kr: false,
  };

  it("필터 없음이면 모두", () => {
    expect(cardMatchesFilter(card, EMPTY_FILTER)).toBe(true);
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
  });

  it("분류·대회(여러 대회 중 하나)·팀(여러 팀 중 하나)·한국 선수", () => {
    expect(cardMatchesFilter(card, state({ cat: "transfer" }))).toBe(true);
    expect(cardMatchesFilter(card, state({ cat: "result" }))).toBe(false);
    expect(cardMatchesFilter(card, state({ comp: "BUNDESLIGA" }))).toBe(true);
    expect(cardMatchesFilter(card, state({ comp: "LALIGA" }))).toBe(false);
    expect(cardMatchesFilter(card, state({ team: "arsenal" }))).toBe(true);
    expect(cardMatchesFilter(card, state({ team: "chelsea" }))).toBe(false);
    expect(cardMatchesFilter(card, state({ kr: true }))).toBe(false);
    expect(cardMatchesFilter({ ...card, kr: true }, state({ kr: true }))).toBe(
      true,
    );
  });

  it("하나라도 맞지 않으면 숨긴다(AND)", () => {
    expect(
      cardMatchesFilter(card, state({ cat: "transfer", comp: "EPL" })),
    ).toBe(true);
    expect(
      cardMatchesFilter(card, state({ cat: "transfer", comp: "LALIGA" })),
    ).toBe(false);
    expect(
      cardMatchesFilter(
        card,
        state({ comp: "EPL", team: "arsenal", kr: true }),
      ),
    ).toBe(false);
  });
});

describe("설명·알림 문장", () => {
  it("대회 이름 · 팀 · 분류 · 한국 선수 관련(시안 순서), 없으면 '중요도 순'", () => {
    expect(filterDescription(EMPTY_FILTER, CONFIG)).toBe("중요도 순");
    expect(filterDescription(state({ comp: "EPL" }), CONFIG)).toBe(
      "프리미어리그",
    );
    expect(
      filterDescription(
        state({ comp: "LIGUE1", team: "chelsea", cat: "ucl", kr: true }),
        CONFIG,
      ),
    ).toBe("리그 1 · 첼시 · UCL · 한국 선수 관련");
  });

  it("결과 알림 — '이적 4건' · 필터가 없으면 '전체 23건'", () => {
    expect(filterAnnouncement(state({ cat: "transfer" }), CONFIG, 4)).toBe(
      "이적 4건",
    );
    expect(filterAnnouncement(EMPTY_FILTER, CONFIG, 23)).toBe("전체 23건");
    expect(
      filterAnnouncement(state({ comp: "LIGUE1", cat: "ucl" }), CONFIG, 0),
    ).toBe("리그 1 · UCL 0건");
  });
});

describe("nextFilterState — 조작 → 다음 상태", () => {
  it("분류: 고른 분류 · 눌린 분류를 다시 누르면 전체 · '전체'는 전체", () => {
    const s1 = nextFilterState(EMPTY_FILTER, { type: "cat", value: "injury" });
    expect(s1.cat).toBe("injury");
    expect(nextFilterState(s1, { type: "cat", value: "club" }).cat).toBe(
      "club",
    );
    expect(
      nextFilterState(s1, { type: "cat", value: "injury" }).cat,
    ).toBeNull();
    expect(nextFilterState(s1, { type: "cat", value: null }).cat).toBeNull();
  });

  it("대회: 하나만 · 다시 누르면 해제(시안)", () => {
    const s1 = nextFilterState(EMPTY_FILTER, { type: "comp", value: "EPL" });
    expect(s1.comp).toBe("EPL");
    expect(nextFilterState(s1, { type: "comp", value: "UCL" }).comp).toBe(
      "UCL",
    );
    expect(nextFilterState(s1, { type: "comp", value: "EPL" }).comp).toBeNull();
  });

  it("한국 선수 켬·끔, 해제는 그 필터만, 필터 해제는 모두", () => {
    const full = state({
      comp: "EPL",
      cat: "transfer",
      team: "chelsea",
      kr: true,
    });
    expect(nextFilterState(full, { type: "kr" }).kr).toBe(false);
    expect(nextFilterState(full, { type: "clear-comp" })).toEqual({
      ...full,
      comp: null,
    });
    expect(nextFilterState(full, { type: "clear-team" })).toEqual({
      ...full,
      team: null,
    });
    expect(nextFilterState(full, { type: "reset" })).toEqual(EMPTY_FILTER);
  });

  it("상태를 고치지 않는다(새 객체)", () => {
    const s = state({ cat: "club" });
    nextFilterState(s, { type: "cat", value: "injury" });
    expect(s.cat).toBe("club");
  });
});

describe("buildFilterView — 목차·칩 건수와 설정(빌드 때)", () => {
  it("fixtures 23장 = 혼합안 홈 목차 숫자(대회 8·6·3·3·0·0, 분류 7·4·1·4·4·0·3, 한국 선수 5)", () => {
    const view = loadNewsFilterView(sample);
    if (!view) throw new Error("필터 없음");
    expect(view.total).toBe(23);
    expect(view.comps.map((c) => [c.id, c.short, c.label, c.count])).toEqual([
      ["EPL", "EPL", "프리미어리그", 8],
      ["LALIGA", "라리가", "라리가", 6],
      ["SERIEA", "세리에A", "세리에 A", 3],
      ["BUNDESLIGA", "분데스", "분데스리가", 3],
      ["LIGUE1", "리그1", "리그 1", 0],
      ["UCL", "UCL", "UEFA 챔피언스리그", 0],
    ]);
    expect(view.cats.map((c) => [c.id, c.label, c.count])).toEqual([
      ["result", "경기 결과", 7],
      ["transfer", "이적", 4],
      ["injury", "부상", 1],
      ["club", "감독·구단", 4],
      ["national", "대표팀", 4],
      ["ucl", "UCL", 0],
      ["other", "기타", 3],
    ]);
    expect(view.kr).toBe(5);
  });

  it("설정 — 대회는 competitions.json 전부, 분류 7종, 팀은 그 호 카드에 태그로 실린(사전에 있는) 팀만", () => {
    const view = loadNewsFilterView(sample);
    if (!view) throw new Error("필터 없음");
    expect(Object.keys(view.config.comps)).toEqual(CompIdSchema.options);
    expect(view.config.cats).toEqual(CATEGORY_LABEL);
    const issueTeams = new Set(sample.cards.flatMap((c) => c.teams));
    expect(Object.keys(view.config.teams).length).toBeGreaterThan(0);
    for (const slug of Object.keys(view.config.teams))
      expect(issueTeams.has(slug)).toBe(true);
    expect(view.config.teams["tottenham-hotspur"]).toBeTruthy();
    expect(view.config.d).toBe("중요도 순");
    expect(view.config.k).toBe("한국 선수 관련");
  });

  it("사전에 없는 팀 slug·원형 이름은 팀 값이 아니다", () => {
    const view = buildFilterView(
      [
        {
          cat: "other",
          comp: [],
          teams: ["known", "unknown", "__proto__"],
          kr: false,
        },
      ],
      {
        competitions: [],
        team: (slug) => (slug === "unknown" ? null : `팀 ${slug}`),
      },
    );
    expect(view.config.teams).toEqual({ known: "팀 known" });
    expect(Object.getPrototypeOf(view.config.teams)).toBe(Object.prototype);
  });

  it("카드가 없는 호는 필터가 없다(목차·칩 줄을 싣지 않는다)", () => {
    expect(loadNewsFilterView(null)).toBeUndefined();
    expect(loadNewsFilterView({ ...sample, cards: [] })).toBeUndefined();
  });
});
