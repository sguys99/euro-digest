/**
 * M1-02 소스 로더 — `scripts/lib/sources.ts` 단위 테스트 (PRD FR-01·FR-10, D23·D32).
 *
 * - 수집 조건: enabled && terms_checked, crawl은 robots_checked도. 판정 순서와 제외 사유.
 * - type별 경로: rss·journalist·aggregator → 일일 RSS 루프, crawl → 크롤러 모듈이 있을 때만, search·analysis → 제외.
 * - `summarize` 값은 경로에 영향이 없다(D23).
 * - 현재 configs/sources.json 기준 수집 대상·제외 사유 스냅숏(설정이 바뀌면 이 테스트를 함께 고친다).
 * - 소스별 보존 기간(retentionDays) 조회, 설정 경고.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Source } from "@/lib/schema";

import { ConfigFileError } from "../scripts/lib/config-files";
import {
  CRAWLER_SOURCE_IDS,
  dailyRoute,
  isCollectable,
  loadSources,
  planDailySources,
  retentionBySource,
  retentionDaysOf,
  sourceConfigWarnings,
} from "../scripts/lib/sources";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** 수집 조건을 모두 통과하는 rss 소스 — 필드만 바꿔 경계 사례를 만든다 */
function source(over: Partial<Source> = {}): Source {
  return {
    id: "sample-feed",
    name: "Sample — Football",
    type: "rss",
    url: "https://example.com/feed.xml",
    lang: "en",
    enabled: true,
    summarize: false,
    weight: 1,
    tier: 2,
    competitions: [],
    terms_checked: true,
    robots_checked: true,
    ...over,
  };
}

describe("isCollectable — 수집 조건(FR-01)", () => {
  it("enabled && terms_checked면 수집, 하나라도 false면 거부", () => {
    expect(isCollectable(source())).toBe(true);
    expect(isCollectable(source({ enabled: false }))).toBe(false);
    expect(isCollectable(source({ terms_checked: false }))).toBe(false);
  });

  it("robots_checked는 crawl에만 필요하다", () => {
    expect(isCollectable(source({ robots_checked: false }))).toBe(true);
    expect(
      isCollectable(source({ type: "crawl", robots_checked: false })),
    ).toBe(false);
    expect(isCollectable(source({ type: "crawl" }))).toBe(true);
  });
});

describe("dailyRoute — 일일 수집 경로", () => {
  it.each(["rss", "journalist", "aggregator"] as const)(
    "%s는 일일 RSS 루프(feed)",
    (type) => {
      expect(dailyRoute(source({ type }))).toBe("feed");
    },
  );

  it("수집 조건을 먼저 본다 — enabled → terms_checked → robots_checked(crawl) 순으로 첫 사유", () => {
    expect(dailyRoute(source({ enabled: false, terms_checked: false }))).toBe(
      "disabled",
    );
    expect(dailyRoute(source({ terms_checked: false }))).toBe(
      "terms-unchecked",
    );
    expect(
      dailyRoute(
        source({ type: "crawl", terms_checked: false, robots_checked: false }),
      ),
    ).toBe("terms-unchecked");
    expect(dailyRoute(source({ type: "crawl", robots_checked: false }))).toBe(
      "robots-unchecked",
    );
    // search·analysis도 수집 조건이 먼저다
    expect(dailyRoute(source({ type: "search", enabled: false }))).toBe(
      "disabled",
    );
  });

  it("crawl은 크롤러 모듈이 등록돼 있을 때만 crawl, 없으면 no-crawler(지금은 등록된 크롤러 0개 — M1-05 보류)", () => {
    expect(CRAWLER_SOURCE_IDS.size).toBe(0);
    const crawl = source({ id: "list-site", type: "crawl" });
    expect(dailyRoute(crawl)).toBe("no-crawler");
    expect(dailyRoute(crawl, { crawlerIds: new Set(["list-site"]) })).toBe(
      "crawl",
    );
    expect(dailyRoute(crawl, { crawlerIds: new Set(["other"]) })).toBe(
      "no-crawler",
    );
  });

  it("search는 일일 RSS 루프 밖(M1-06·M1-07), analysis는 주 1회(FR-10)", () => {
    expect(dailyRoute(source({ type: "search" }))).toBe("search-type");
    expect(dailyRoute(source({ type: "analysis" }))).toBe("weekly-analysis");
  });

  it("summarize 값은 경로를 바꾸지 않는다(D23 — 어떤 소스든 원제목+링크)", () => {
    for (const type of [
      "rss",
      "journalist",
      "aggregator",
      "crawl",
      "search",
      "analysis",
    ] as const) {
      for (const enabled of [true, false]) {
        const base = source({ type, enabled });
        expect(dailyRoute({ ...base, summarize: true })).toBe(
          dailyRoute({ ...base, summarize: false }),
        );
      }
    }
  });
});

describe("planDailySources", () => {
  it("설정 순서를 지키고 피드·크롤러 대상·제외를 나눈다", () => {
    const plan = planDailySources(
      [
        source({ id: "a" }),
        source({ id: "b", enabled: false }),
        source({ id: "c", type: "journalist", author: "Writer" }),
        source({ id: "d", type: "crawl" }),
        source({ id: "e", type: "crawl" }),
        source({ id: "f", type: "search" }),
        source({ id: "g", type: "analysis" }),
        source({ id: "h", type: "aggregator", summarize: true }),
      ],
      { crawlerIds: new Set(["e"]) },
    );
    expect(plan.feeds.map((s) => s.id)).toEqual(["a", "c", "h"]);
    expect(plan.crawls.map((s) => s.id)).toEqual(["e"]);
    expect(plan.excluded).toEqual([
      { id: "b", type: "rss", reason: "disabled" },
      { id: "d", type: "crawl", reason: "no-crawler" },
      { id: "f", type: "search", reason: "search-type" },
      { id: "g", type: "analysis", reason: "weekly-analysis" },
    ]);
  });

  it("빈 설정이면 모두 빈 목록", () => {
    expect(planDailySources([])).toEqual({
      feeds: [],
      crawls: [],
      excluded: [],
    });
  });

  it("현재 configs/sources.json — 수집 대상 피드 14개(BBC 4·The Athletic·ESPN·the Daily Briefing·Di Marzio·Relevo·국내 5), 나머지 제외 사유", async () => {
    const plan = planDailySources(await loadSources(ROOT));
    expect(plan.feeds.map((s) => `${s.id} (${s.type}, ${s.lang})`)).toEqual([
      "bbc-sport-football (rss, en)",
      "bbc-sport-premier-league (rss, en)",
      "bbc-sport-champions-league (rss, en)",
      "bbc-sport-european (rss, en)",
      "the-athletic-football (rss, en)",
      "espn-soccer (rss, en)",
      "daily-briefing (journalist, en)",
      "di-marzio (journalist, it)",
      "relevo (rss, es)",
      "interfootball-world (rss, ko)",
      "interfootball-all (rss, ko)",
      "footballist-football (rss, ko)",
      "besteleven-world (rss, ko)",
      "besteleven-all (rss, ko)",
    ]);
    expect(plan.crawls).toEqual([]);
    expect(
      Object.fromEntries(plan.excluded.map((e) => [e.id, e.reason])),
    ).toEqual({
      "sky-sports-football": "disabled",
      "guardian-football": "disabled",
      "caughtoffside-romano": "disabled",
      caughtoffside: "disabled",
      "football-italia": "disabled",
      "football-espana": "disabled",
      "uefa-ucl-news": "disabled",
      "sportalkorea-all": "disabled",
      "yna-sports": "disabled",
      "google-news-ko": "disabled",
      "google-news-en": "disabled",
      "gdelt-doc": "disabled",
    });
    // 수집 대상은 모두 원제목+링크 전용(D23) — summarize:true 소스가 생기면 이 테스트가 알린다
    expect(plan.feeds.every((s) => !s.summarize)).toBe(true);
  });
});

describe("retentionDaysOf · retentionBySource — 소스별 보존 기간(D32)", () => {
  it("설정이 없으면 null(PRD §8.4 기본 보존), 있으면 그 값", () => {
    expect(retentionDaysOf(source())).toBeNull();
    expect(retentionDaysOf(source({ retentionDays: 7 }))).toBe(7);
  });

  it("보존 기간을 둔 소스만 표에 담는다(비활성 소스 포함 — 과거 카드도 지워야 한다)", () => {
    const table = retentionBySource([
      source({ id: "a" }),
      source({ id: "b", retentionDays: 7 }),
      source({ id: "c", retentionDays: 30, enabled: false }),
    ]);
    expect([...table]).toEqual([
      ["b", 7],
      ["c", 30],
    ]);
  });

  it("현재 configs: the-athletic-football 7일만", async () => {
    expect([...retentionBySource(await loadSources(ROOT))]).toEqual([
      ["the-athletic-football", 7],
    ]);
  });
});

describe("sourceConfigWarnings — 오류는 아닌 설정 모순(npm run validate 경고)", () => {
  it("현재 configs/sources.json은 경고 없음", async () => {
    expect(sourceConfigWarnings(await loadSources(ROOT))).toEqual([]);
  });

  it("crawl + enabled + robots_checked:false · enabled + terms_checked:false · summarize:true", () => {
    const warnings = sourceConfigWarnings([
      source({ id: "ok" }),
      source({ id: "list", type: "crawl", robots_checked: false }),
      source({ id: "unchecked", terms_checked: false }),
      source({ id: "summary", summarize: true }),
      // 꺼져 있으면 robots·terms 모순은 경고하지 않는다
      source({
        id: "off",
        type: "crawl",
        enabled: false,
        robots_checked: false,
        terms_checked: false,
      }),
    ]);
    expect(warnings.map((w) => [w.index, w.field])).toEqual([
      [1, "robots_checked"],
      [2, "terms_checked"],
      [3, "summarize"],
    ]);
    expect(warnings[0]!.message).toContain('"list"');
    expect(warnings[2]!.message).toContain("D23");
  });
});

describe("loadSources — configs/sources.json 경계 검증", () => {
  it("저장소 설정을 읽는다(competitions 기본값 등 zod 출력)", async () => {
    const sources = await loadSources(ROOT);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((s) => Array.isArray(s.competitions))).toBe(true);
  });

  it("스키마에 맞지 않으면 ConfigFileError(파일 내용은 메시지에 넣지 않음)", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-sources-"));
    try {
      mkdirSync(path.join(dir, "configs"));
      writeFileSync(
        path.join(dir, "configs", "sources.json"),
        JSON.stringify([{ ...source(), retentionDays: 0 }]),
      );
      await expect(loadSources(dir)).rejects.toThrow(ConfigFileError);
      await expect(loadSources(dir)).rejects.toThrow(/스키마 검증 실패/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
