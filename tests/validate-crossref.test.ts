/** configs 교차 참조 검사 (M0-17) — 순수 함수 단위 테스트. 입력은 fixtures/schema/configs의 유효 예시. */
import { describe, expect, it } from "vitest";

import {
  KoreanPlayersFileSchema,
  NationalTeamFileSchema,
  SearchQueriesFileSchema,
  SourcesFileSchema,
  schemaRegistry,
} from "@/lib/schema";

import {
  CROSSREF_FILES,
  checkSearchQueryPlayers,
  checkSearchQuerySources,
  checkSquadPlayers,
  pickCrossRefInput,
  runCrossRefChecks,
} from "../scripts/lib/validate-crossref";

import { at, validFixture } from "./schema/helpers";

const sources = validFixture(SourcesFileSchema, "configs/sources.json");
const searchQueries = validFixture(
  SearchQueriesFileSchema,
  "configs/search-queries.json",
);
const koreanPlayers = validFixture(
  KoreanPlayersFileSchema,
  "configs/korean-players.json",
);
const nationalTeam = validFixture(
  NationalTeamFileSchema,
  "configs/national-team.json",
);
const query = at(searchQueries.queries, 0);
const squad = at(nationalTeam.squads, 0);

describe("checkSearchQuerySources — queries[].source → type search 소스", () => {
  it("fixture는 통과", () => {
    expect(checkSearchQuerySources(searchQueries, sources)).toEqual([]);
  });

  it("없는 소스 id", () => {
    const issues = checkSearchQuerySources(
      { ...searchQueries, queries: [{ ...query, source: "gdelt" }] },
      sources,
    );
    expect(issues).toEqual([
      {
        severity: "error",
        stage: "crossref",
        file: "configs/search-queries.json",
        path: "queries[0].source",
        message: 'sources.json에 없는 소스 id "gdelt"',
      },
    ]);
  });

  it("type이 search가 아닌 소스(rss)", () => {
    const issues = checkSearchQuerySources(
      {
        ...searchQueries,
        queries: [query, { ...query, source: "bbc-football" }],
      },
      sources,
    );
    expect(issues.map((i) => [i.path, i.message])).toEqual([
      [
        "queries[1].source",
        '소스 "bbc-football"의 type이 "rss" — 검색 쿼리는 type "search" 소스만 참조',
      ],
    ]);
  });

  it("소스가 비활성이어도 참조 자체는 유효(수집 여부는 소스의 enabled·terms_checked가 정한다)", () => {
    expect(sources.find((s) => s.id === query.source)?.enabled).toBe(false);
    expect(checkSearchQuerySources(searchQueries, sources)).toEqual([]);
  });
});

describe("checkSearchQueryPlayers — queries[].player → korean-players slug", () => {
  it("fixture는 통과, player가 없는 쿼리는 검사하지 않는다", () => {
    expect(checkSearchQueryPlayers(searchQueries, koreanPlayers)).toEqual([]);
    expect(searchQueries.queries.some((q) => q.player === undefined)).toBe(
      true,
    );
  });

  it("등록되지 않은 선수 slug", () => {
    const issues = checkSearchQueryPlayers(
      { ...searchQueries, queries: [{ ...query, player: "lee-unknown" }] },
      koreanPlayers,
    );
    expect(issues.map((i) => `${i.file}:${i.path} — ${i.message}`)).toEqual([
      'configs/search-queries.json:queries[0].player — korean-players.json에 없는 선수 slug "lee-unknown"',
    ]);
  });
});

describe("checkSquadPlayers — squads[].playerSlugs → korean-players slug", () => {
  it("fixture는 통과(비활성 선수도 등록돼 있으면 유효)", () => {
    expect(checkSquadPlayers(nationalTeam, koreanPlayers)).toEqual([]);
    const withInactive = {
      ...nationalTeam,
      squads: [{ ...squad, playerSlugs: ["kim-cheol-su"] }],
    };
    expect(checkSquadPlayers(withInactive, koreanPlayers)).toEqual([]);
  });

  it("없는 slug마다 경로를 짚는다", () => {
    const issues = checkSquadPlayers(
      {
        ...nationalTeam,
        squads: [
          squad,
          {
            ...squad,
            id: "2026-11",
            playerSlugs: ["ghost", "hong-gil-dong", "nobody"],
          },
        ],
      },
      koreanPlayers,
    );
    expect(issues.map((i) => i.path)).toEqual([
      "squads[1].playerSlugs[0]",
      "squads[1].playerSlugs[2]",
    ]);
    expect(issues.every((i) => i.file === "configs/national-team.json")).toBe(
      true,
    );
  });
});

describe("runCrossRefChecks — 관련 파일이 모두 있을 때만 실행", () => {
  it("아무 파일도 없으면 3건 모두 건너뛴다", () => {
    const result = runCrossRefChecks({});
    expect(result.checked).toEqual([]);
    expect(result.skipped).toHaveLength(3);
    expect(result.issues).toEqual([]);
  });

  it("sources + search-queries만 있으면 source 검사만 실행", () => {
    const result = runCrossRefChecks({ sources, searchQueries });
    expect(result.checked).toEqual([
      "search-queries.source → sources(type search)",
    ]);
    expect(result.skipped).toEqual([
      "search-queries.player → korean-players",
      "national-team.squads.playerSlugs → korean-players",
    ]);
  });

  it("전부 있으면 3건 실행, 이슈를 모은다", () => {
    const result = runCrossRefChecks({
      sources: [],
      searchQueries,
      koreanPlayers: [],
      nationalTeam,
    });
    expect(result.checked).toHaveLength(3);
    // 쿼리 2개 source 없음 + 쿼리 1개 player 없음 + 명단 1명 없음
    expect(result.issues).toHaveLength(4);
  });
});

describe("pickCrossRefInput", () => {
  it("교차 참조 파일 경로만 고른다", () => {
    const input = pickCrossRefInput(
      new Map<string, unknown>([
        ["configs/sources.json", sources],
        ["configs/korean-players.json", koreanPlayers],
        ["configs/takedowns.json", []],
      ]),
    );
    expect(Object.keys(input).sort()).toEqual(["koreanPlayers", "sources"]);
    expect(input.sources).toBe(sources);
  });

  it("CROSSREF_FILES 경로는 모두 레지스트리 config 항목이다", () => {
    for (const file of Object.values(CROSSREF_FILES)) {
      const entry = schemaRegistry.find((e) => e.pattern === file);
      expect([file, entry?.kind]).toEqual([file, "config"]);
    }
  });
});
