import { describe, expect, it } from "vitest";

import {
  BigmatchRulesFileSchema,
  CompetitionsFileSchema,
  FormationsFileSchema,
  NationalTeamFileSchema,
  SearchQueriesFileSchema,
  TeamColorsFileSchema,
  TransferWindowsFileSchema,
} from "@/lib/schema";

import {
  REJECTED_URLS,
  at,
  issueMessages,
  issuePaths,
  passes,
  validFixture,
} from "./helpers";

describe("configs/competitions.json (초안, M2-01)", () => {
  const comps = validFixture(
    CompetitionsFileSchema,
    "configs/competitions.json",
  );
  const epl = at(comps, 0);
  const ucl = at(comps, 1);

  it("fixture가 통과한다", () => {
    expect(epl.zones).toHaveLength(4);
  });

  it("구간이 겹치면 실패한다", () => {
    const zones = [
      ...epl.zones,
      { zone: "uel" as const, from: 4, to: 5, label: "겹침" },
    ];
    expect(
      issuePaths(CompetitionsFileSchema, [{ ...epl, zones }, ucl]),
    ).toEqual(["0.zones.4"]);
  });

  it("구간 끝이 팀 수를 넘거나 from > to면 실패한다", () => {
    const tooFar = [
      { zone: "relegation" as const, from: 18, to: 21, label: "강등" },
    ];
    expect(
      issuePaths(CompetitionsFileSchema, [{ ...epl, zones: tooFar }]),
    ).toEqual(["0.zones.0.to"]);
    const reversed = [{ zone: "ucl" as const, from: 4, to: 1, label: "챔스" }];
    expect(
      issuePaths(CompetitionsFileSchema, [{ ...epl, zones: reversed }]),
    ).toEqual(["0.zones.0.to"]);
  });

  it('구간 규칙에 "none"은 쓰지 않는다', () => {
    const none = [{ zone: "none", from: 7, to: 17, label: "중위권" }];
    expect(
      issuePaths(CompetitionsFileSchema, [{ ...epl, zones: none }]),
    ).toEqual(["0.zones.0.zone"]);
  });

  it("시즌 기간·대회 코드·중복을 검사한다", () => {
    expect(
      issuePaths(CompetitionsFileSchema, [{ ...epl, startDate: "2027-06-01" }]),
    ).toEqual(["0.endDate"]);
    expect(
      issuePaths(CompetitionsFileSchema, [{ ...epl, footballDataCode: "EPL" }]),
    ).toEqual(["0.footballDataCode"]);
    expect(
      issuePaths(CompetitionsFileSchema, [epl, { ...ucl, id: "EPL" }]),
    ).toEqual(["1.id"]);
    expect(
      issuePaths(CompetitionsFileSchema, [
        epl,
        { ...ucl, footballDataCode: "PL" },
      ]),
    ).toEqual(["1.footballDataCode"]);
  });
});

describe("configs/national-team.json (초안, F7)", () => {
  const nt = validFixture(NationalTeamFileSchema, "configs/national-team.json");
  const finished = at(nt.matches, 0);
  const scheduled = at(nt.matches, 1);

  it("fixture가 통과하고 kickoffTbd 기본값은 false", () => {
    expect(finished.kickoffTbd).toBe(false);
    expect(scheduled.kickoffTbd).toBe(true);
  });

  it("finished ⇔ result 있음", () => {
    expect(
      issuePaths(NationalTeamFileSchema, {
        ...nt,
        matches: [{ ...finished, result: null }, scheduled],
      }),
    ).toEqual(["matches.0.result"]);
    expect(
      issuePaths(NationalTeamFileSchema, {
        ...nt,
        matches: [finished, { ...scheduled, result: { kor: 1, opp: 0 } }],
      }),
    ).toEqual(["matches.1.result"]);
  });

  it("소집 명단이 없는 경기를 가리키면 실패한다", () => {
    const squad = at(nt.squads, 0);
    const bad = {
      ...nt,
      squads: [{ ...squad, matchIds: ["2099-01-01-friendly"] }],
    };
    expect(issuePaths(NationalTeamFileSchema, bad)).toEqual([
      "squads.0.matchIds.0",
    ]);
  });

  it("squads 생략 가능, 경기 id 중복은 실패", () => {
    expect(passes(NationalTeamFileSchema, { matches: nt.matches })).toBe(true);
    expect(
      issuePaths(NationalTeamFileSchema, { matches: [finished, finished] }),
    ).toEqual(["matches.1.id"]);
  });
});

describe("configs/bigmatch-rules.json (초안, F8)", () => {
  const rules = validFixture(
    BigmatchRulesFileSchema,
    "configs/bigmatch-rules.json",
  );

  it("fixture가 통과한다 (FR-80 18:00~07:00, 상위 5경기)", () => {
    expect(rules.window).toEqual({ fromKst: "18:00", toKst: "07:00" });
    expect(rules.maxMatches).toBe(5);
  });

  it("시각은 HH:MM 형식", () => {
    expect(
      issuePaths(BigmatchRulesFileSchema, {
        ...rules,
        window: { ...rules.window, fromKst: "18:00:00" },
      }),
    ).toEqual(["window.fromKst"]);
    expect(
      issuePaths(BigmatchRulesFileSchema, {
        ...rules,
        window: { ...rules.window, toKst: "7:00" },
      }),
    ).toEqual(["window.toKst"]);
  });

  it("가중치 0~10, topN 2 이상", () => {
    expect(
      issuePaths(BigmatchRulesFileSchema, {
        ...rules,
        rules: { ...rules.rules, ucl: { weight: 11 } },
      }),
    ).toEqual(["rules.ucl.weight"]);
    expect(
      issuePaths(BigmatchRulesFileSchema, {
        ...rules,
        rules: { ...rules.rules, topClash: { weight: 4, topN: 1 } },
      }),
    ).toEqual(["rules.topClash.topN"]);
  });

  it("더비는 서로 다른 팀 slug 2개", () => {
    const derby = (teams: string[]) => ({
      ...rules,
      rules: {
        ...rules.rules,
        derby: { weight: 4, list: [{ name: "x", teams }] },
      },
    });
    expect(
      issuePaths(
        BigmatchRulesFileSchema,
        derby(["sample-united", "sample-united"]),
      ),
    ).toEqual(["rules.derby.list.0.teams"]);
    expect(
      issuePaths(
        BigmatchRulesFileSchema,
        derby(["Sample United", "example-city"]),
      ),
    ).toEqual(["rules.derby.list.0.teams.0"]);
  });
});

describe("configs/search-queries.json (초안, M1-06·M1-07)", () => {
  const file = validFixture(
    SearchQueriesFileSchema,
    "configs/search-queries.json",
  );
  const query = at(file.queries, 0);

  it("fixture가 통과한다", () => {
    expect(file.queries).toHaveLength(2);
  });

  it("활성 쿼리 수가 maxEnabled를 넘으면 실패한다", () => {
    const over = {
      ...file,
      maxEnabled: 1,
      queries: [query, { ...query, id: "kr-hong-gil-dong-en" }],
    };
    expect(issuePaths(SearchQueriesFileSchema, over)).toEqual(["queries"]);
    expect(issueMessages(SearchQueriesFileSchema, over)[0]).toContain(
      "maxEnabled(1)",
    );
  });

  it("비활성 쿼리는 상한에 세지 않는다", () => {
    const ok = {
      ...file,
      maxEnabled: 1,
      queries: [query, { ...query, id: "off", enabled: false }],
    };
    expect(passes(SearchQueriesFileSchema, ok)).toBe(true);
  });

  it("국가 코드·목적·id 중복을 검사한다", () => {
    expect(
      issuePaths(SearchQueriesFileSchema, {
        ...file,
        queries: [{ ...query, region: "kr" }],
      }),
    ).toEqual(["queries.0.region"]);
    expect(
      issuePaths(SearchQueriesFileSchema, {
        ...file,
        queries: [{ ...query, purpose: "gossip" }],
      }),
    ).toEqual(["queries.0.purpose"]);
    expect(
      issuePaths(SearchQueriesFileSchema, { ...file, queries: [query, query] }),
    ).toEqual(["queries.1.id"]);
  });
});

describe("configs/formations.json (초안, FR-55)", () => {
  const file = validFixture(FormationsFileSchema, "configs/formations.json");
  const base = file["sample-united"];

  it("fixture가 통과한다", () => {
    expect(base?.shape).toBe("4-2-3-1");
  });

  it.each([
    ["합이 11", "4-4-3"],
    ["줄 2개", "4-6"],
    ["구분자 없음", "433"],
    ["0 포함", "4-3-3-0"],
  ])("포메이션 거부: %s", (_label, shape) => {
    // 형식·합계 검사가 함께 실패할 수 있어 경로 종류만 본다
    const paths = issuePaths(FormationsFileSchema, {
      "sample-united": { ...base, shape },
    });
    expect([...new Set(paths)]).toEqual(["sample-united.shape"]);
  });

  it("키는 팀 slug", () => {
    expect(issuePaths(FormationsFileSchema, { "Sample United": base })).toEqual(
      ["Sample United"],
    );
  });
});

describe("configs/team-colors.json (초안, DR-05)", () => {
  const file = validFixture(TeamColorsFileSchema, "configs/team-colors.json");
  const badge = file["sample-united"];

  it("fixture가 통과한다", () => {
    expect(badge?.short).toBe("SMU");
  });

  it.each(["#FFF", "red", "C8102E", "#C8102EFF"])(
    "잘못된 hex 거부: %s",
    (color) => {
      expect(
        issuePaths(TeamColorsFileSchema, {
          "sample-united": { ...badge, colors: [color, "#FFFFFF"] },
        }),
      ).toEqual(["sample-united.colors.0"]);
    },
  );

  it("주색·보조색이 같으면 실패한다 (대소문자 무시)", () => {
    expect(
      issuePaths(TeamColorsFileSchema, {
        "sample-united": { ...badge, colors: ["#ffffff", "#FFFFFF"] },
      }),
    ).toEqual(["sample-united.colors"]);
  });

  it.each(["smu", "SAMPL", "S"])("약어 거부: %s", (short) => {
    expect(
      issuePaths(TeamColorsFileSchema, {
        "sample-united": { ...badge, short },
      }),
    ).toEqual(["sample-united.short"]);
  });
});

describe("configs/transfer-windows.json (초안, FR-105)", () => {
  const file = validFixture(
    TransferWindowsFileSchema,
    "configs/transfer-windows.json",
  );
  const win = at(file.windows, 0);

  it("fixture가 통과한다", () => {
    expect(file.windows).toHaveLength(2);
  });

  it("UCL은 이적 창이 없다", () => {
    expect(
      issuePaths(TransferWindowsFileSchema, {
        ...file,
        windows: [{ ...win, comp: "UCL" }],
      }),
    ).toEqual(["windows.0.comp"]);
  });

  it("마감은 개장보다 뒤여야 한다 (같은 순간도 실패)", () => {
    expect(
      issuePaths(TransferWindowsFileSchema, {
        ...file,
        windows: [{ ...win, closesAt: "2027-01-01T00:00:00.000Z" }],
      }),
    ).toEqual(["windows.0.closesAt"]);
    expect(
      issuePaths(TransferWindowsFileSchema, {
        ...file,
        windows: [{ ...win, closesAt: "2026-12-31T00:00:00Z" }],
      }),
    ).toEqual(["windows.0.closesAt"]);
  });

  it("같은 리그·시즌·종류가 두 번 나오면 실패, boost는 1~3", () => {
    expect(
      issuePaths(TransferWindowsFileSchema, { ...file, windows: [win, win] }),
    ).toEqual(["windows.1.kind"]);
    expect(
      issuePaths(TransferWindowsFileSchema, { ...file, boost: 0.5 }),
    ).toEqual(["boost"]);
  });
});

describe("configs — 2026-10-10 결정 반영", () => {
  const comps = validFixture(
    CompetitionsFileSchema,
    "configs/competitions.json",
  );
  const nt = validFixture(NationalTeamFileSchema, "configs/national-team.json");
  const rules = validFixture(
    BigmatchRulesFileSchema,
    "configs/bigmatch-rules.json",
  );
  const queries = validFixture(
    SearchQueriesFileSchema,
    "configs/search-queries.json",
  );
  const windows = validFixture(
    TransferWindowsFileSchema,
    "configs/transfer-windows.json",
  );
  const formations = validFixture(
    FormationsFileSchema,
    "configs/formations.json",
  );

  it("UCL 구간 규칙은 knockout·playoff (Q4)", () => {
    expect(at(comps, 1).zones.map((z) => z.zone)).toEqual([
      "knockout",
      "playoff",
    ]);
  });

  it("중첩 객체까지 알 수 없는 키를 거부한다 (Q5)", () => {
    const epl = at(comps, 0);
    const zone = { ...at(epl.zones, 0), colour: "red" };
    expect(
      issuePaths(CompetitionsFileSchema, [{ ...epl, zones: [zone] }]),
    ).toEqual(["0.zones.0"]);
    expect(
      issuePaths(BigmatchRulesFileSchema, {
        ...rules,
        rules: { ...rules.rules, ucl: { weight: 3, wieght: 3 } },
      }),
    ).toEqual(["rules.ucl"]);
    expect(
      issuePaths(NationalTeamFileSchema, {
        ...nt,
        matches: [{ ...at(nt.matches, 0), score: "2-1" }, at(nt.matches, 1)],
      }),
    ).toEqual(["matches.0"]);
  });

  it.each(REJECTED_URLS)(
    "근거 URL(sourceUrl)은 http/https만 (Q3): %s",
    (sourceUrl) => {
      const win = { ...at(windows.windows, 0), sourceUrl };
      expect(
        issuePaths(TransferWindowsFileSchema, { ...windows, windows: [win] }),
      ).toEqual(["windows.0.sourceUrl"]);
      const base = formations["sample-united"];
      expect(
        issuePaths(FormationsFileSchema, {
          "sample-united": { ...base, sourceUrl },
        }),
      ).toEqual(["sample-united.sourceUrl"]);
    },
  );

  it("소집 명단은 등록 선수 slug만 (Q9)", () => {
    const squad = { ...at(nt.squads, 0), playerSlugs: ["홍길동"] };
    expect(
      issuePaths(NationalTeamFileSchema, { ...nt, squads: [squad] }),
    ).toEqual(["squads.0.playerSlugs.0"]);
  });

  it("검색 쿼리의 source는 sources.json id(slug) 형식 (Q8)", () => {
    const q = { ...at(queries.queries, 0), source: "Google News" };
    expect(
      issuePaths(SearchQueriesFileSchema, { ...queries, queries: [q] }),
    ).toEqual(["queries.0.source"]);
  });
});
