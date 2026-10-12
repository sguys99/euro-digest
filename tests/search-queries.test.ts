/**
 * M1-06 검색형 소스 공통 — 검색 쿼리 로더 `scripts/lib/search-queries.ts` 단위 테스트 (PRD FR-02, §15 D25·D32).
 *
 * - 현재 configs 기준 활성 쿼리 0개 스냅숏(쿼리 9개 모두 enabled:false, gdelt-doc 비활성). 설정이 바뀌면 이 테스트를 함께 고친다.
 * - 활성 쿼리 = query.enabled && 소스가 type search && 수집 조건(enabled && terms_checked, sources.ts collectBlocker).
 * - 판정 순서·제외 사유, 소스별 묶음 순서, maxEnabled 방어(스키마 + 로더 두 겹).
 * 네트워크 없음 — 검색 요청 코드는 없다(M1-07 보류, D32).
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  SearchQueriesFileSchema,
  type SearchQueriesFile,
  type SearchQuery,
  type Source,
} from "@/lib/schema";

import { ConfigFileError } from "../scripts/lib/config-files";
import {
  countSearchExclusions,
  loadSearchQueries,
  planSearchQueries,
} from "../scripts/lib/search-queries";
import { loadSources } from "../scripts/lib/sources";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** 수집 조건을 모두 통과하는 검색형 소스 */
function searchSource(over: Partial<Source> = {}): Source {
  return {
    id: "search-on",
    name: "Search — on",
    type: "search",
    url: "https://search.example.com/api",
    lang: "mul",
    enabled: true,
    summarize: false,
    weight: 0.5,
    tier: 3,
    competitions: [],
    terms_checked: true,
    robots_checked: true,
    ...over,
  };
}

function query(id: string, over: Partial<SearchQuery> = {}): SearchQuery {
  return {
    id,
    source: "search-on",
    q: `"${id}"`,
    lang: "en",
    purpose: "general",
    enabled: true,
    ...over,
  };
}

/** 스키마를 거치지 않은 설정(로더 방어 확인용) */
function file(queries: SearchQuery[], maxEnabled = 10): SearchQueriesFile {
  return { maxEnabled, queries };
}

const SOURCES: Source[] = [
  searchSource(),
  searchSource({ id: "search-second", url: "https://two.example.com/api" }),
  searchSource({ id: "search-off", enabled: false }),
  searchSource({ id: "search-unchecked", terms_checked: false }),
  searchSource({
    id: "plain-feed",
    type: "rss",
    url: "https://feed.example.com/rss",
  }),
];

// ─── 현재 configs ────────────────────────────────────────────────────────

describe("현재 configs — 검색 대상 없음(D32)", () => {
  it("쿼리 9개가 모두 query-disabled이고 활성 쿼리는 0개다", async () => {
    const [queries, sources] = await Promise.all([
      loadSearchQueries(ROOT),
      loadSources(ROOT),
    ]);
    const plan = planSearchQueries(queries, sources);
    expect(plan.active).toBe(0);
    expect(plan.batches).toEqual([]);
    expect(plan.maxEnabled).toBe(10);
    expect(plan.excluded).toEqual([
      {
        id: "gd-ko-allow-domains",
        source: "gdelt-doc",
        reason: "query-disabled",
      },
      {
        id: "gd-ko-lee-kang-in",
        source: "gdelt-doc",
        reason: "query-disabled",
      },
      {
        id: "gd-en-lee-kang-in",
        source: "gdelt-doc",
        reason: "query-disabled",
      },
      {
        id: "gd-en-kim-min-jae",
        source: "gdelt-doc",
        reason: "query-disabled",
      },
      {
        id: "gd-en-transfer-epl",
        source: "gdelt-doc",
        reason: "query-disabled",
      },
      {
        id: "gd-es-transfer-laliga",
        source: "gdelt-doc",
        reason: "query-disabled",
      },
      {
        id: "gd-it-transfer-seriea",
        source: "gdelt-doc",
        reason: "query-disabled",
      },
      {
        id: "gd-mul-champions-league",
        source: "gdelt-doc",
        reason: "query-disabled",
      },
      {
        id: "gd-en-korea-national",
        source: "gdelt-doc",
        reason: "query-disabled",
      },
    ]);
    expect(countSearchExclusions(plan.excluded)).toEqual({
      "query-disabled": 9,
    });
  });

  it("쿼리를 모두 켜도 gdelt-doc이 비활성이라 여전히 0개(source-disabled)", async () => {
    const [queries, sources] = await Promise.all([
      loadSearchQueries(ROOT),
      loadSources(ROOT),
    ]);
    const allOn = {
      ...queries,
      queries: queries.queries.map((q) => ({ ...q, enabled: true })),
    };
    const plan = planSearchQueries(allOn, sources);
    expect(plan.active).toBe(0);
    expect(countSearchExclusions(plan.excluded)).toEqual({
      "source-disabled": 9,
    });
  });
});

// ─── 활성 쿼리 선별 ──────────────────────────────────────────────────────

describe("planSearchQueries — 활성 쿼리 선별", () => {
  it("수집 가능한 검색형 소스의 켠 쿼리만 활성, 소스별로 묶는다(소스는 처음 나온 순서·쿼리는 설정 순서)", () => {
    const plan = planSearchQueries(
      file([
        query("second-a", { source: "search-second" }),
        query("on-a"),
        query("on-off", { enabled: false }),
        query("second-b", { source: "search-second" }),
        query("on-b"),
      ]),
      SOURCES,
    );
    expect(plan.active).toBe(4);
    expect(
      plan.batches.map((b) => [b.source.id, b.queries.map((q) => q.id)]),
    ).toEqual([
      ["search-second", ["second-a", "second-b"]],
      ["search-on", ["on-a", "on-b"]],
    ]);
    expect(plan.excluded).toEqual([
      { id: "on-off", source: "search-on", reason: "query-disabled" },
    ]);
  });

  it("소스가 비활성·약관 미확인·없음·검색형 아님이면 제외하고 사유를 남긴다", () => {
    const plan = planSearchQueries(
      file([
        query("q-off", { source: "search-off" }),
        query("q-unchecked", { source: "search-unchecked" }),
        query("q-missing", { source: "no-such-source" }),
        query("q-feed", { source: "plain-feed" }),
        query("q-ok"),
      ]),
      SOURCES,
    );
    expect(plan.active).toBe(1);
    expect(plan.excluded.map((e) => [e.id, e.reason])).toEqual([
      ["q-off", "source-disabled"],
      ["q-unchecked", "source-terms-unchecked"],
      ["q-missing", "source-missing"],
      ["q-feed", "source-not-search"],
    ]);
  });

  it("판정 순서 — 꺼진 쿼리는 소스 상태와 무관하게 query-disabled", () => {
    const plan = planSearchQueries(
      file([
        query("a", { source: "search-off", enabled: false }),
        query("b", { source: "no-such-source", enabled: false }),
      ]),
      SOURCES,
    );
    expect(plan.excluded.map((e) => e.reason)).toEqual([
      "query-disabled",
      "query-disabled",
    ]);
  });

  it("검색형 소스는 robots_checked를 요구하지 않는다(crawl만 — sources.ts 판정 재사용)", () => {
    const plan = planSearchQueries(file([query("q")]), [
      searchSource({ robots_checked: false }),
    ]);
    expect(plan.active).toBe(1);
  });

  it("쿼리가 없으면 빈 계획", () => {
    expect(planSearchQueries(file([]), SOURCES)).toEqual({
      batches: [],
      active: 0,
      maxEnabled: 10,
      excluded: [],
    });
  });
});

// ─── maxEnabled 방어 ─────────────────────────────────────────────────────

describe("maxEnabled — 스키마와 로더 두 겹", () => {
  const over = file([query("q1"), query("q2"), query("q3")], 2);

  it("스키마가 켠 쿼리 수 > maxEnabled를 거부한다", () => {
    const parsed = SearchQueriesFileSchema.safeParse(over);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.path.join("."))).toEqual([
      "queries",
    ]);
  });

  it("로더 — 스키마를 거치지 않은 입력이어도 설정 순서로 maxEnabled개만 활성, 나머지는 over-max-enabled", () => {
    const plan = planSearchQueries(over, SOURCES);
    expect(plan.active).toBe(2);
    expect(plan.batches[0]?.queries.map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(plan.excluded).toEqual([
      { id: "q3", source: "search-on", reason: "over-max-enabled" },
    ]);
  });

  it("상한은 실제로 돌릴 쿼리만 센다 — 소스가 막힌 쿼리는 자리를 차지하지 않는다", () => {
    const plan = planSearchQueries(
      file(
        [query("blocked", { source: "search-off" }), query("q1"), query("q2")],
        2,
      ),
      SOURCES,
    );
    expect(plan.active).toBe(2);
    expect(plan.excluded.map((e) => [e.id, e.reason])).toEqual([
      ["blocked", "source-disabled"],
    ]);
  });

  it("loadSearchQueries — 상한을 넘는 파일·없는 파일은 ConfigFileError", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-search-q-"));
    try {
      await expect(loadSearchQueries(dir)).rejects.toBeInstanceOf(
        ConfigFileError,
      );
      mkdirSync(path.join(dir, "configs"));
      writeFileSync(
        path.join(dir, "configs", "search-queries.json"),
        JSON.stringify(over),
      );
      await expect(loadSearchQueries(dir)).rejects.toThrow(
        /search-queries\.json 스키마 검증 실패/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
