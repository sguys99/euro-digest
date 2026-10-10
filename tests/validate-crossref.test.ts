/** configs 교차 참조 검사 (M0-17) — 순수 함수 단위 테스트. 입력은 fixtures/schema/configs의 유효 예시. */
import { describe, expect, it } from "vitest";

import {
  KoreanPlayersFileSchema,
  NationalTeamFileSchema,
  PublisherDomainsFileSchema,
  SearchQueriesFileSchema,
  SourcesFileSchema,
  schemaRegistry,
} from "@/lib/schema";

import {
  CROSSREF_FILES,
  checkPublisherDomainSources,
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
const publisherDomains = validFixture(
  PublisherDomainsFileSchema,
  "configs/publisher-domains.json",
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

describe("checkPublisherDomainSources — domains[].sourceIds → sources, 판정 일치", () => {
  const allowEntry = at(publisherDomains.domains, 0);
  const feedOnlyEntry = at(publisherDomains.domains, 1);
  const denyEntry = at(publisherDomains.domains, 2);

  it("fixture는 통과(sourceIds가 없는 allow·deny 항목도 유효)", () => {
    expect(allowEntry.sourceIds).toEqual([]);
    expect(checkPublisherDomainSources(publisherDomains, sources)).toEqual([]);
  });

  it("없는 소스 id", () => {
    const issues = checkPublisherDomainSources(
      {
        domains: [{ ...feedOnlyEntry, sourceIds: ["bbc-football", "ghost"] }],
      },
      sources,
    );
    expect(issues).toEqual([
      {
        severity: "error",
        stage: "crossref",
        file: "configs/publisher-domains.json",
        path: "domains[0].sourceIds[1]",
        message: 'sources.json에 없는 소스 id "ghost"',
      },
    ]);
  });

  it("판정이 소스의 terms_checked와 엇갈리면 오류", () => {
    const issues = checkPublisherDomainSources(
      {
        domains: [
          { ...feedOnlyEntry, sourceIds: ["google-news-ko"] }, // terms_checked:false인데 feed-only
          { ...denyEntry, sourceIds: ["bbc-football"] }, // terms_checked:true인데 deny
        ],
      },
      sources,
    );
    expect(issues.map((i) => [i.path, i.message])).toEqual([
      [
        "domains[0].sourceIds[0]",
        '"feed-only" 도메인 "bbc.co.uk"의 근거 소스 "google-news-ko"가 terms_checked:false — 판정이 엇갈림',
      ],
      [
        "domains[1].sourceIds[0]",
        '"deny" 도메인 "news.google.com"의 근거 소스 "bbc-football"가 terms_checked:true — 판정이 엇갈림',
      ],
    ]);
  });

  it("수집 대상 소스의 피드 호스트가 deny 도메인에 속하면 오류(하위 도메인 포함)", () => {
    const issues = checkPublisherDomainSources(
      {
        domains: [
          {
            ...denyEntry,
            domain: "bbci.co.uk",
            publisher: "BBC (가정)",
            sourceIds: [],
          },
        ],
      },
      sources,
    );
    expect(issues.map((i) => `${i.file}:${i.path} — ${i.message}`)).toEqual([
      'configs/sources.json:[0].url — 수집 대상 소스 "bbc-football"의 호스트 feeds.bbci.co.uk가 publisher-domains.json의 deny 도메인 "bbci.co.uk"에 속함',
    ]);
  });

  it("꺼진 소스(enabled:false)의 호스트는 deny 도메인이어도 통과", () => {
    expect(
      sources
        .filter((s) => s.url.startsWith("https://news.google.com/"))
        .every((s) => !s.enabled),
    ).toBe(true);
    expect(checkPublisherDomainSources(publisherDomains, sources)).toEqual([]);
  });
});

describe("runCrossRefChecks — 관련 파일이 모두 있을 때만 실행", () => {
  it("아무 파일도 없으면 4건 모두 건너뛴다", () => {
    const result = runCrossRefChecks({});
    expect(result.checked).toEqual([]);
    expect(result.skipped).toHaveLength(4);
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
      "publisher-domains.sourceIds → sources",
    ]);
  });

  it("전부 있으면 4건 실행, 이슈를 모은다", () => {
    const result = runCrossRefChecks({
      sources: [],
      searchQueries,
      koreanPlayers: [],
      nationalTeam,
      publisherDomains,
    });
    expect(result.checked).toHaveLength(4);
    // 쿼리 2개 source 없음 + 쿼리 1개 player 없음 + 명단 1명 없음 + 도메인 sourceIds 3개 없음
    expect(result.issues).toHaveLength(7);
  });
});

describe("pickCrossRefInput", () => {
  it("교차 참조 파일 경로만 고른다", () => {
    const input = pickCrossRefInput(
      new Map<string, unknown>([
        ["configs/sources.json", sources],
        ["configs/korean-players.json", koreanPlayers],
        ["configs/publisher-domains.json", publisherDomains],
        ["configs/takedowns.json", []],
      ]),
    );
    expect(Object.keys(input).sort()).toEqual([
      "koreanPlayers",
      "publisherDomains",
      "sources",
    ]);
    expect(input.sources).toBe(sources);
  });

  it("CROSSREF_FILES 경로는 모두 레지스트리 config 항목이다", () => {
    for (const file of Object.values(CROSSREF_FILES)) {
      const entry = schemaRegistry.find((e) => e.pattern === file);
      expect([file, entry?.kind]).toEqual([file, "config"]);
    }
  });
});
