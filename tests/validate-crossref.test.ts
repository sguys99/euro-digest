/** configs 교차 참조 검사 (M0-17) — 순수 함수 단위 테스트. 입력은 fixtures/schema/configs의 유효 예시. */
import { describe, expect, it } from "vitest";

import {
  KoreanPlayersDataFileSchema,
  KoreanPlayersFileSchema,
  MatchLedgerMetaSchema,
  NationalTeamFileSchema,
  PublisherDomainsFileSchema,
  SearchQueriesFileSchema,
  SourcesFileSchema,
  TeamColorsFileSchema,
  TeamIdsFileSchema,
  TeamSchema,
  schemaRegistry,
  type NewsCard,
  type NewsFile,
  type Team,
  type Transfer,
} from "@/lib/schema";

import {
  CROSSREF_FILES,
  checkKoreanPlayerTeamIds,
  checkKoreanPlayersData,
  checkPublisherDomainSources,
  checkSearchQueryPlayers,
  checkSearchQuerySources,
  checkSquadPlayers,
  checkTeamColors,
  checkTeamFiles,
  checkTransfersData,
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
const teamIds = validFixture(TeamIdsFileSchema, "configs/team-ids.json");
const teamColors = validFixture(
  TeamColorsFileSchema,
  "configs/team-colors.json",
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

describe("checkKoreanPlayerTeamIds — 활성 선수 소속팀 → team-ids(af) (D33)", () => {
  const active = at(koreanPlayers, 0); // hong-gil-dong — sample-united, 활성
  const inactive = at(koreanPlayers, 1); // kim-cheol-su — other-league-fc, 비활성

  it("fixture는 통과(비활성 선수의 팀은 대응표에 없어도 된다)", () => {
    expect(active.active).toBe(true);
    expect(inactive.active).toBe(false);
    expect(Object.hasOwn(teamIds, inactive.team)).toBe(false);
    expect(checkKoreanPlayerTeamIds(koreanPlayers, teamIds)).toEqual([]);
  });

  it("활성 선수의 팀이 대응표에 없으면 오류", () => {
    expect(
      checkKoreanPlayerTeamIds(
        [{ ...active, team: "no-such-team" }, inactive],
        teamIds,
      ),
    ).toEqual([
      {
        severity: "error",
        stage: "crossref",
        file: "configs/korean-players.json",
        path: "[0].team",
        message:
          '활성 선수 "hong-gil-dong"의 팀 "no-such-team"가 team-ids.json에 없음 — API-Football 팀 id(af)를 함께 등록할 것',
      },
    ]);
  });

  it("활성 선수의 팀 af가 null이면 오류(fd만 있어도 소속팀 경기 기록을 고르지 못함)", () => {
    const issues = checkKoreanPlayerTeamIds(
      [{ ...active, team: "example-city" }],
      teamIds,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: "error",
      path: "[0].team",
    });
    expect(issues[0]!.message).toContain("af(API-Football 팀 id)가 null");
  });

  it("비활성이 되면 같은 팀이어도 검사하지 않는다", () => {
    expect(
      checkKoreanPlayerTeamIds(
        [{ ...active, team: "no-such-team", active: false }],
        teamIds,
      ),
    ).toEqual([]);
  });

  it("객체 기본 키(toString 등)를 팀 slug로 착각하지 않는다", () => {
    expect(
      checkKoreanPlayerTeamIds([{ ...active, team: "constructor" }], teamIds),
    ).toHaveLength(1);
  });
});

describe("checkTeamColors — team-colors ↔ team-ids · 약어 대비 5.3 (D62 ④, M2-05)", () => {
  it("fixture는 통과", () => {
    expect(checkTeamColors(teamColors, teamIds)).toEqual([]);
  });

  it("team-ids에 없는 팀은 오류, team-colors에 없는 팀은 경고(폴백 배지)", () => {
    const issues = checkTeamColors(
      {
        "sample-united": teamColors["sample-united"]!,
        "old-slug": { colors: ["#034694", "#FFFFFF"], short: "OLD" },
      },
      teamIds,
    );
    expect(issues.map((i) => [i.severity, i.path])).toEqual([
      ["error", "old-slug"],
      ["warn", "example-city"],
    ]);
  });

  it("보정 전 원색(아스널 #EF0107 — 흰 글자 4.49)은 오류, 보정 값(#D70106)은 통과", () => {
    const raw = checkTeamColors(
      {
        ...teamColors,
        "sample-united": { colors: ["#EF0107", "#FFFFFF"], short: "SMU" },
      },
      teamIds,
    );
    expect(raw).toHaveLength(1);
    expect(raw[0]!.path).toBe("sample-united.colors[0]");
    expect(raw[0]!.message).toContain("4.49");
    expect(
      checkTeamColors(
        {
          ...teamColors,
          "sample-united": { colors: ["#D70106", "#FFFFFF"], short: "SMU" },
        },
        teamIds,
      ),
    ).toEqual([]);
  });
});

describe("checkTeamFiles — data/teams ↔ team-ids·team-colors·korean-players (M2-06·M2-07)", () => {
  const sample = validFixture(TeamSchema, "data/teams/sample-united.json");
  const city: Team = {
    ...sample,
    slug: "example-city",
    short: "EXC",
    colors: ["#6CABDD", "#1C2C5B"],
    koreanPlayers: [],
    lineup: null,
  };
  const files = (...teams: Team[]) =>
    new Map(teams.map((t) => [`data/teams/${t.slug}.json`, t]));

  it("fixture 두 팀은 통과", () => {
    expect(
      checkTeamFiles(files(sample, city), teamIds, teamColors, koreanPlayers),
    ).toEqual([]);
  });

  it("팀 파일이 없는 team-ids 팀·team-ids에 없는 파일·색 복사본 불일치는 오류", () => {
    const issues = checkTeamFiles(
      files({ ...sample, short: "SAM" }, { ...city, slug: "old-city" }),
      teamIds,
      teamColors,
      koreanPlayers,
    );
    expect(issues.map((i) => [i.severity, i.file, i.path])).toEqual([
      ["error", "data/teams/sample-united.json", "colors"],
      ["error", "data/teams/old-city.json", "slug"],
      ["error", "data/teams/example-city.json", undefined],
    ]);
  });

  it("한국 선수 slug — 설정에 없거나 소속이 다르면 오류, 활성 선수가 소속 팀 파일에 없으면 경고", () => {
    const lineup = sample.lineup!;
    const issues = checkTeamFiles(
      files(
        {
          ...sample,
          koreanPlayers: [],
          lineup: {
            ...lineup,
            opponent: "nowhere-fc",
            substitutes: [
              { name: "X", number: 99, pos: "F", grid: null, korean: "ghost" },
            ],
          },
        },
        { ...city, koreanPlayers: ["hong-gil-dong"] },
      ),
      teamIds,
      teamColors,
      koreanPlayers,
    );
    expect(issues.map((i) => [i.severity, i.file, i.path])).toEqual([
      ["error", "data/teams/sample-united.json", "lineup.opponent"],
      [
        "error",
        "data/teams/sample-united.json",
        "lineup.substitutes[0].korean",
      ],
      ["error", "data/teams/example-city.json", "koreanPlayers[0]"],
      ["warn", "data/teams/sample-united.json", "koreanPlayers"],
    ]);
  });

  it("data 범위 검사는 팀 파일이 있을 때만 실행 — pickCrossRefInput이 data/teams 경로를 모은다", () => {
    expect(
      runCrossRefChecks({ teamIds, teamColors, koreanPlayers }, "data"),
    ).toMatchObject({
      checked: [],
      skipped: [
        "data/teams → team-ids · team-colors · korean-players",
        "data/players/korean.json → korean-players · data/teams · 원장 메타",
        "data/news 일별 ↔ 월별 병합 날짜 중복",
        "data/transfers.json → data/news · takedowns",
      ],
    });
    const input = pickCrossRefInput(
      new Map<string, unknown>([
        ["configs/team-ids.json", teamIds],
        ["configs/team-colors.json", teamColors],
        ["configs/korean-players.json", koreanPlayers],
        ["data/teams/sample-united.json", sample],
        ["data/teams/example-city.json", city],
      ]),
    );
    expect([...(input.teams?.keys() ?? [])]).toEqual([
      "data/teams/sample-united.json",
      "data/teams/example-city.json",
    ]);
    expect(runCrossRefChecks(input, "data")).toMatchObject({
      checked: ["data/teams → team-ids · team-colors · korean-players"],
      issues: [],
    });
  });
});

describe("checkKoreanPlayersData — data/players/korean.json ↔ korean-players·data/teams·원장 메타 (M3-03)", () => {
  const data = validFixture(
    KoreanPlayersDataFileSchema,
    "data/players/korean.json",
  );
  const meta = validFixture(MatchLedgerMetaSchema, "data/matches/meta.json");
  const sample = validFixture(TeamSchema, "data/teams/sample-united.json");
  const city: Team = { ...sample, slug: "example-city" };
  const teams = new Map([
    ["data/teams/sample-united.json", sample],
    ["data/teams/example-city.json", city],
  ]);
  const shape = (issues: ReturnType<typeof checkKoreanPlayersData>) =>
    issues.map((i) => [i.severity, i.path ?? null]);

  it("레코드 slug ⊂ korean-players(오류) · 활성 선수 팀·상대 slug ⊂ data/teams(오류), 비활성은 팀 링크를 보지 않는다", () => {
    const players = [
      { ...data.players[0]!, slug: "ghost" },
      { ...data.players[0]!, slug: "hong-gil-dong", team: "nowhere-fc" },
      data.players[1]!,
    ];
    expect(
      shape(
        checkKoreanPlayersData(
          { ...data, players },
          koreanPlayers,
          teams,
          undefined,
        ),
      ),
    ).toEqual([
      ["error", "players[0].slug"],
      ["error", "players[1].team"],
    ]);
  });

  it("설정 선수 레코드 없음·집계 시작일 불일치는 경고(다음 수집이 다시 만든다 — 발행을 막지 않는다)", () => {
    const issues = checkKoreanPlayersData(
      { ...data, players: [data.players[0]!] },
      koreanPlayers,
      teams,
      meta,
    );
    expect(issues.every((i) => i.severity === "warn")).toBe(true);
    expect(issues.map((i) => i.message)).toEqual([
      expect.stringContaining("playerSince(null)"),
      expect.stringContaining('"kim-cheol-su"의 레코드가 없음'),
      expect.stringContaining("원장 메타"),
    ]);
  });
});

describe("runCrossRefChecks — 관련 파일이 모두 있을 때만 실행", () => {
  it("아무 파일도 없으면 6건 모두 건너뛴다", () => {
    const result = runCrossRefChecks({});
    expect(result.checked).toEqual([]);
    expect(result.skipped).toHaveLength(6);
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
      "korean-players.team(활성) → team-ids(af)",
      "team-colors → team-ids · 약어 대비 5.3",
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
        ["configs/team-ids.json", teamIds],
        ["configs/takedowns.json", []],
      ]),
    );
    // takedowns = 이적 트래커 교차 검사(M4-01 — 근거 카드가 삭제 요청에 있는지)
    expect(Object.keys(input).sort()).toEqual([
      "koreanPlayers",
      "publisherDomains",
      "sources",
      "takedowns",
      "teamIds",
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

describe("checkTransfersData — data/transfers.json ↔ data/news·takedowns (M4-01)", () => {
  const at1 = "2026-10-16T10:00:00.000Z";
  const at2 = "2026-10-29T10:00:00.000Z";
  const card = (id: string, transfer?: NewsCard["transfer"]): NewsCard => ({
    id,
    t: "제목",
    s: [],
    cat: "transfer",
    comp: [],
    teams: [],
    players: ["kim-min-jae"],
    imp: 3,
    kr: true,
    spoiler: false,
    ...(transfer ? { transfer } : {}),
    src: [{ n: "매체", u: "https://example.com/a", at: at1, tier: 3 }],
    lang: "ko",
    ai: false,
    created: at1,
  });
  const tr = {
    player: "kim-min-jae",
    to: "arsenal",
    status: "rumor",
    tier: 3,
  } as const;
  const news = new Map<string, NewsFile>([
    [
      "data/news/2026-10-30.json",
      {
        date: "2026-10-30",
        generatedAt: at2,
        runId: "r",
        cards: [
          card("c_000000000a", tr),
          card("c_000000000b", tr),
          card("c_000000000c"),
        ],
      },
    ],
  ]);
  const record: Transfer = {
    id: "kim-min-jae:arsenal",
    player: "kim-min-jae",
    to: "arsenal",
    status: "rumor",
    bestTier: 3,
    updated: at2,
    quiet: false,
    history: [
      { at: at1, status: "rumor", card: "c_000000000a" },
      { at: at2, status: "rumor", card: "c_000000000b" },
    ],
  };

  it("파이프라인 출력과 같은 레코드는 문제 없음", () => {
    expect(checkTransfersData([record], news, [])).toEqual([]);
  });

  it("근거가 빈 레코드만 오류, 나머지는 경고(발행을 막지 않는다)", () => {
    const issues = checkTransfersData(
      [
        { ...record, history: [] },
        {
          ...record,
          id: "kim-min-jae:-",
          history: [
            { at: at1, status: "rumor", card: "c_000000000a" }, // 다른 레코드(arsenal)의 카드
            { at: at1, status: "rumor", card: "c_000000000c" }, // transfer 없는 카드
            { at: at2, status: "rumor", card: "c_00000000ff" }, // data/news에 없음
            { at: at2, status: "rumor", card: "c_000000000b" }, // 삭제 요청
          ],
        },
      ],
      news,
      [
        {
          id: "c_000000000b",
          requestedAt: at2,
          handledAt: null,
          reason: "삭제 요청 (#1)",
        },
      ],
    );
    expect(issues.map((i) => [i.severity, i.path])).toEqual([
      ["error", "[0].history"],
      ["warn", "[1]"], // id ≠ 선수:행선지
      ["warn", "[1].history[0].card"],
      ["warn", "[1].history[1].card"],
      ["warn", "[1].history[2].card"],
      ["warn", "[1].history[3].card"],
      ["warn", "[1]"], // 파일 순서 — updated가 같으면 id 순('kim-min-jae:-' < 'kim-min-jae:arsenal')
    ]);
    expect(issues.every((i) => i.file === "data/transfers.json")).toBe(true);
  });

  it("M4-02 — 루머가 아닌데 quiet·파일 순서(잠잠 아님 → updated 내림차순 → id)가 깨지면 경고(FR-106 '목록 하단')", () => {
    const quietRumor: Transfer = { ...record, quiet: true };
    const agreed: Transfer = {
      ...record,
      id: "kim-min-jae:-",
      to: undefined,
      status: "agreed",
      history: [
        { at: at1, status: "rumor", card: "c_000000000a" },
        { at: at2, status: "agreed", card: "c_000000000b" },
      ],
    };
    delete agreed.to;
    // 순서 맞음(잠잠 아닌 것 먼저) — 근거 카드 대조 경고만 본다
    const ok = checkTransfersData([agreed, quietRumor], news, []);
    expect(ok.filter((i) => /파일 순서|quiet/.test(i.message))).toEqual([]);
    // 둘 다 quiet(합의인데 quiet → 레코드 경고) + 같은 updated에서 id 순 어긋남 → 순서 경고
    const bad = checkTransfersData(
      [quietRumor, { ...agreed, quiet: true }],
      news,
      [],
    );
    expect(
      bad
        .filter((i) => /파일 순서|quiet/.test(i.message))
        .map((i) => [i.severity, i.path]),
    ).toEqual([
      ["warn", "[1]"],
      ["warn", "[1]"],
    ]);
    expect(
      checkTransfersData([{ ...agreed, quiet: true }], news, []).some((i) =>
        i.message.includes("잠잠은 루머만"),
      ),
    ).toBe(true);
    expect(
      checkTransfersData([quietRumor, agreed], news, []).some((i) =>
        i.message.includes("파일 순서"),
      ),
    ).toBe(true);
  });

  it("pickCrossRefInput이 transfers·일별 뉴스·takedowns를 모으고 data 범위에서 실행한다", () => {
    const input = pickCrossRefInput(
      new Map<string, unknown>([
        ["data/transfers.json", [record]],
        ["data/news/2026-10-30.json", news.get("data/news/2026-10-30.json")],
        ["configs/takedowns.json", []],
      ]),
    );
    expect([...(input.news?.keys() ?? [])]).toEqual([
      "data/news/2026-10-30.json",
    ]);
    expect(runCrossRefChecks(input, "data")).toMatchObject({
      checked: ["data/transfers.json → data/news · takedowns"],
      issues: [],
    });
  });

  it("월별 병합 파일(M5-10) 안의 호도 근거 카드로 찾는다 — 키는 `<경로>#<날짜>`, 날짜 오름차순", () => {
    const issue = news.get("data/news/2026-10-30.json")!;
    const input = pickCrossRefInput(
      new Map<string, unknown>([
        ["data/transfers.json", [record]],
        [
          "data/news/2026-11-01.json",
          { ...issue, date: "2026-11-01", cards: [] },
        ],
        [
          "data/news/2026-10.json",
          { month: "2026-10", updatedAt: at2, issues: [issue] },
        ],
        ["configs/takedowns.json", []],
      ]),
    );
    expect([...(input.news?.keys() ?? [])]).toEqual([
      "data/news/2026-10.json#2026-10-30",
      "data/news/2026-11-01.json",
    ]);
    expect(runCrossRefChecks(input, "data")).toMatchObject({
      checked: [
        "data/news 일별 ↔ 월별 병합 날짜 중복",
        "data/transfers.json → data/news · takedowns",
      ],
      issues: [],
    });
  });

  it("같은 날짜가 일별·월별 파일에 함께 있으면 오류(병합 중간 상태)", () => {
    const issue = news.get("data/news/2026-10-30.json")!;
    const input = pickCrossRefInput(
      new Map<string, unknown>([
        ["data/news/2026-10-30.json", issue],
        [
          "data/news/2026-10.json",
          { month: "2026-10", updatedAt: at2, issues: [issue] },
        ],
      ]),
    );
    const result = runCrossRefChecks(input, "data");
    expect(
      result.issues.map((i) => `${i.severity} ${i.file}:${i.path}`),
    ).toEqual(["error data/news/2026-10.json:issues[0].date"]);
    expect(result.issues[0]!.message).toMatch(
      /호 2026-10-30가 일별 파일 data\/news\/2026-10-30\.json에도 있음/,
    );
  });
});
