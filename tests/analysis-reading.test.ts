/**
 * 분석 블로그 → 팀 "더 읽을거리" 순수 규칙 (M3-08 — PRD FR-10·FR-57, D23·D47·D48) — scripts/lib/analysis-reading.ts
 * - 대상 소스: 수집 조건 통과 + type analysis만, 일일 수집 경로에는 없다(FR-10 주 1회)
 * - 팀 연결: 원제목만(요약문 무시), 팀 파일이 있는 slug만, 팀 0건 글은 버림
 * - 병합: 새 글(최신순) 앞 · URL(정규화) 중복 제거 · 최대 5건 · 삭제 요청 제외 · 제목·URL 원문 그대로
 * - 주간 건강도: '새 글 없음' 주간 연속(실패는 건너뜀, 새 글에서 끊음)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  type FeedItem,
  type RunLog,
  type Source,
} from "@/lib/schema";

import {
  ANALYSIS_STALE_WEEKS,
  READING_LIMIT,
  READING_MAX_AGE_DAYS,
  analysisStaleStreak,
  blockedPublishers,
  buildReadingUpdates,
  matchPostTeams,
  matchPosts,
  mergeReading,
  newPostCount,
  planAnalysisSources,
  type ReadingEntry,
} from "../scripts/lib/analysis-reading";
import { cardIdFor } from "../scripts/lib/card-id";
import { planDailySources } from "../scripts/lib/sources";
import { buildTagIndex } from "../scripts/lib/tag-names";
import { configSources } from "./support/fixture-sources";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) =>
  JSON.parse(readFileSync(`${ROOT}${rel}`, "utf8")) as unknown;
const INDEX = buildTagIndex({
  names: NamesKoFileSchema.parse(read("configs/names.ko.json")),
  koreanPlayers: KoreanPlayersFileSchema.parse(
    read("configs/korean-players.json"),
  ),
});
const TEAMS = new Set([
  "arsenal",
  "chelsea",
  "liverpool",
  "bayern-munchen",
  "borussia-dortmund",
  "inter",
  "napoli",
  "psv",
]);
const NOW = "2026-11-01T23:00:00.000Z";

function item(over: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Arsenal’s rest-defence",
    url: "https://spielverlagerung.com/fixture/synthetic-0/",
    publishedAt: "2026-10-30T18:12:00.000Z",
    summary: null,
    source: "spielverlagerung-en",
    author: null,
    authors: [],
    lang: "en",
    ...over,
  };
}

function source(over: Partial<Source> = {}): Source {
  return {
    id: "blog",
    name: "Blog — English",
    type: "analysis",
    url: "https://blog.example.com/feed/",
    lang: "en",
    enabled: true,
    summarize: false,
    weight: 1,
    tier: 3,
    competitions: [],
    terms_checked: true,
    robots_checked: true,
    ...over,
  };
}

const entry = (n: number, over: Partial<ReadingEntry> = {}): ReadingEntry => ({
  title: `Post ${n}`,
  url: `https://blog.example.com/p/${n}/`,
  source: "Blog",
  ...over,
});

describe("planAnalysisSources — 주 1회 대상(FR-10)", () => {
  it("type analysis + 수집 조건(enabled && terms_checked)만", () => {
    const plan = planAnalysisSources([
      source({ id: "a" }),
      source({ id: "b", enabled: false }),
      source({ id: "c", terms_checked: false }),
      source({ id: "d", type: "rss" }),
    ]);
    expect(plan.map((s) => s.id)).toEqual(["a"]);
  });

  it("현재 configs — Spielverlagerung 영문 하나, 일일 수집 경로(feeds)에는 없다", () => {
    const sources = configSources();
    expect(planAnalysisSources(sources).map((s) => s.id)).toEqual([
      "spielverlagerung-en",
    ]);
    const daily = planDailySources(sources);
    expect(daily.feeds.some((s) => s.type === "analysis")).toBe(false);
    expect(
      daily.excluded.find((e) => e.id === "spielverlagerung-en")?.reason,
    ).toBe("weekly-analysis");
  });
});

describe("matchPostTeams · matchPosts — 원제목으로 팀 찾기", () => {
  it("제목의 팀만(요약문에 팀 이름이 있어도 쓰지 않는다 — D47 ①)", () => {
    expect(
      matchPostTeams(
        item({
          title: "Positional play in the modern game – part 3",
          summary: "SYNTH Liverpool Arsenal",
        }),
        INDEX,
        TEAMS,
      ),
    ).toEqual([]);
    expect(
      matchPostTeams(
        item({ title: "Bayern – Dortmund: pressing traps" }),
        INDEX,
        TEAMS,
      ),
    ).toEqual(["bayern-munchen", "borussia-dortmund"]);
  });

  it("팀 파일이 없는 팀은 남기지 않는다", () => {
    expect(
      matchPostTeams(
        item({ title: "Arsenal and Real Madrid" }),
        INDEX,
        new Set(["arsenal"]),
      ),
    ).toEqual(["arsenal"]);
  });

  it("여자팀·겹치는 별칭(근거 없음)은 팀이 아니다", () => {
    expect(
      matchPostTeams(item({ title: "Arsenal Women: 4-3-3" }), INDEX, TEAMS),
    ).toEqual([]);
    expect(
      matchPostTeams(item({ title: "Nice ideas: triggers" }), INDEX, TEAMS),
    ).toEqual([]);
  });

  it("버린 이유 — 기간 밖·미래·삭제 요청·팀 없음, 같은 URL(정규화)은 처음 것만", () => {
    const old = new Date(
      Date.parse(NOW) - (READING_MAX_AGE_DAYS + 1) * 86_400_000,
    ).toISOString();
    const takedown = "https://spielverlagerung.com/fixture/takedown/";
    const result = matchPosts({
      items: [
        item(),
        item({
          url: "https://www.spielverlagerung.com/fixture/synthetic-0/?utm_source=rss",
        }),
        item({ url: "https://s.example.com/old/", publishedAt: old }),
        item({
          url: "https://s.example.com/future/",
          publishedAt: "2026-11-03T00:00:00.000Z",
        }),
        item({ url: takedown }),
        item({ url: "https://s.example.com/none/", title: "Zonal marking" }),
      ],
      index: INDEX,
      teamSlugs: TEAMS,
      now: NOW,
      takedownIds: new Set([cardIdFor(takedown)]),
    });
    expect(result.map((m) => [m.teams, m.skipped])).toEqual([
      [["arsenal"], null],
      [[], "too-old"],
      [[], "future"],
      [[], "takedown"],
      [[], "no-team"],
    ]);
  });
});

describe("mergeReading — 새 글 앞, 중복 제거, 최대 5건", () => {
  it("새 글이 앞, 이전 목록은 순서 그대로 뒤, 5건에서 자른다", () => {
    const prev = [entry(1), entry(2), entry(3), entry(4)];
    const fresh = [entry(9), entry(8)];
    expect(mergeReading(prev, fresh).map((e) => e.title)).toEqual([
      "Post 9",
      "Post 8",
      "Post 1",
      "Post 2",
      "Post 3",
    ]);
    expect(READING_LIMIT).toBe(5);
  });

  it("URL은 정규화해 비교하고(www·추적 파라미터), 같은 글이면 이번 피드의 제목·URL 원문이 이긴다", () => {
    const prev = [entry(1, { title: "Old title" })];
    const fresh = [
      entry(1, {
        title: "Fixed title",
        url: "https://www.blog.example.com/p/1/?utm_source=rss",
      }),
    ];
    expect(mergeReading(prev, fresh)).toEqual([
      {
        title: "Fixed title",
        url: "https://www.blog.example.com/p/1/?utm_source=rss",
        source: "Blog",
      },
    ]);
  });

  it("삭제 요청 URL은 이전 목록에서도 뺀다", () => {
    const prev = [entry(1), entry(2)];
    expect(
      mergeReading(prev, [], {
        takedownIds: new Set([cardIdFor(entry(1).url)]),
      }).map((e) => e.title),
    ).toEqual(["Post 2"]);
  });
});

describe("blockedPublishers — 수집을 멈춘 분석 블로그 매체", () => {
  it("끈 analysis 소스의 매체명, 같은 매체의 켜진 피드가 있으면 빼지 않는다, 다른 type은 보지 않는다", () => {
    expect([
      ...blockedPublishers([
        source({ id: "a", name: "Alpha — English" }),
        source({ id: "b", name: "Alpha — Deutsch", enabled: false }),
        source({ id: "c", name: "Beta", terms_checked: false }),
        source({ id: "d", name: "Gamma", type: "rss", enabled: false }),
      ]),
    ]).toEqual(["Beta"]);
    expect([...blockedPublishers(configSources())]).toEqual([]);
  });

  it("mergeReading dropSources — 이전 목록에서 그 매체 글을 뺀다", () => {
    expect(
      mergeReading([entry(1), entry(2, { source: "Beta" })], [], {
        dropSources: new Set(["Beta"]),
      }).map((e) => e.title),
    ).toEqual(["Post 1"]);
  });
});

describe("buildReadingUpdates — 팀별 갱신", () => {
  const sources = new Map([
    ["spielverlagerung-en", { name: "Spielverlagerung — English" }],
  ]);

  it("팀마다 발행 최신순, 출처는 매체명, 바뀐 팀만(slug 순)", () => {
    const matches = matchPosts({
      items: [
        item({
          url: "https://s.example.com/a/",
          publishedAt: "2026-08-01T00:00:00.000Z",
        }),
        item({
          url: "https://s.example.com/b/",
          title: "Arsenal – Chelsea: the midfield box",
          publishedAt: "2026-10-01T00:00:00.000Z",
        }),
      ],
      index: INDEX,
      teamSlugs: TEAMS,
      now: NOW,
    });
    const updates = buildReadingUpdates({
      matches,
      sources,
      teams: new Map([
        ["arsenal", { slug: "arsenal", reading: [] }],
        ["chelsea", { slug: "chelsea", reading: [] }],
        ["liverpool", { slug: "liverpool", reading: [entry(1)] }],
      ]),
    });
    expect(updates.map((u) => [u.slug, u.after.map((e) => e.url)])).toEqual([
      ["arsenal", ["https://s.example.com/b/", "https://s.example.com/a/"]],
      ["chelsea", ["https://s.example.com/b/"]],
    ]);
    expect(updates[0]?.after[0]).toEqual({
      title: "Arsenal – Chelsea: the midfield box",
      url: "https://s.example.com/b/",
      source: "Spielverlagerung",
    });
  });

  it("같은 피드를 다시 넣어도 바뀌지 않는다(멱등)", () => {
    const matches = matchPosts({
      items: [item()],
      index: INDEX,
      teamSlugs: TEAMS,
      now: NOW,
    });
    const first = buildReadingUpdates({
      matches,
      sources,
      teams: new Map([["arsenal", { slug: "arsenal", reading: [] }]]),
    });
    const again = buildReadingUpdates({
      matches,
      sources,
      teams: new Map([
        ["arsenal", { slug: "arsenal", reading: first[0]!.after }],
      ]),
    });
    expect(first).toHaveLength(1);
    expect(again).toEqual([]);
  });
});

describe("주간 건강도 — 새 글 수 · '새 글 없음' 연속", () => {
  it("newPostCount — 지난 7일 안(미래 1시간 허용)", () => {
    expect(
      newPostCount(
        [
          { publishedAt: "2026-10-30T00:00:00.000Z" },
          { publishedAt: "2026-10-25T23:00:00.000Z" }, // 정확히 7일 전 — 밖
          { publishedAt: "2026-09-01T00:00:00.000Z" },
        ],
        NOW,
      ),
    ).toBe(1);
  });

  function run(
    startedAt: string,
    sources: RunLog["sources"],
    over: Partial<RunLog> = {},
  ): Pick<RunLog, "runId" | "env" | "job" | "startedAt" | "sources"> {
    return {
      runId: `weekly-prod-${startedAt}`,
      env: "prod",
      job: "weekly",
      startedAt,
      sources,
      ...over,
    };
  }
  const zero = { id: "blog", ok: true, items: 25, usable: 0 };

  it("새 글 없음 주를 세고, 새 글에서 끊고, 실패·usable 없는 기록·다른 job·dev는 건너뛴다", () => {
    const history = [
      run("2026-09-06T23:00:00.000Z", [{ ...zero, usable: 2 }]),
      run("2026-09-13T23:00:00.000Z", [zero]),
      run("2026-09-20T23:00:00.000Z", [
        { id: "blog", ok: false, items: 0, error: "http-5xx" },
      ]),
      run("2026-09-27T23:00:00.000Z", [{ id: "blog", ok: true, items: 25 }]),
      run("2026-10-04T23:00:00.000Z", [zero]),
      run("2026-10-05T07:00:00.000Z", [zero], { job: "collect" }),
      run("2026-10-11T23:00:00.000Z", [zero], { env: "dev" }),
    ];
    expect(
      analysisStaleStreak(history, "blog", {
        runId: "now",
        startedAt: NOW,
        entry: zero,
      }),
    ).toBe(3); // 09-13 · 10-04 · 이번
  });

  it(`${ANALYSIS_STALE_WEEKS}주 연속이면 기준에 닿는다`, () => {
    const history = Array.from({ length: ANALYSIS_STALE_WEEKS - 1 }, (_, i) =>
      run(new Date(Date.parse(NOW) - (i + 1) * 7 * 86_400_000).toISOString(), [
        zero,
      ]),
    );
    expect(
      analysisStaleStreak(history, "blog", {
        runId: "now",
        startedAt: NOW,
        entry: zero,
      }),
    ).toBe(ANALYSIS_STALE_WEEKS);
  });
});
