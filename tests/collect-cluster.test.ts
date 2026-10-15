/**
 * M1-13 — 수집 실행(runCollect)에서 같은 사건 클러스터가 카드가 되는지 (PRD FR-04·FR-05, plan M1-12 이월 메모 ②·③).
 *
 *   - 여러 매체의 같은 소식 → 카드 1장(출처 = 묶음마다), 국내·해외는 따로(D30), 로그 `collect.select.done`에 클러스터 집계
 *   - 같은 날 재실행: 오늘 카드와 같은 사건의 새 기사는 그 카드의 새 출처(id·created 유지, 기억에도 더함) — 카드 URL이
 *     다시 들어온 경우·창 밖으로 빠진 경우(제목으로) 모두
 *   - 다음 날: 어제 카드와 같은 사건의 늦은 기사는 카드가 되지 않는다(클러스터 통째 제외), 다른 새 소식은 카드가 된다
 *   - 클러스터링 실패 격리: 예상 밖 오류면 같은 사건을 합치지 않은 채 발행(partial + 경고)
 *
 * 네트워크 없음 — 피드는 테스트가 만든 작은 RSS(제목·링크·날짜만), 경기는 빈 응답(브리핑 호출 생략), 파일은 임시 폴더.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  NewsFileSchema,
  SeenUrlsFileSchema,
  type NewsFile,
  type RunLog,
  type Source,
} from "@/lib/schema";

import { cardIdFor } from "../scripts/lib/card-id";
import {
  runCollect,
  runStatus,
  type BriefOutcome,
  type CollectDeps,
} from "../scripts/lib/collect-run";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { FOOTBALL_DATA_BASE_URL } from "../scripts/lib/providers/football-data";
import { feedUserAgent } from "../scripts/lib/rss";
import { urlHash } from "../scripts/lib/url-normalize";

import { fixtureFeedSources } from "./support/fixture-sources";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SOURCES = fixtureFeedSources();
const byId = (id: string): Source => {
  const source = SOURCES.find((s) => s.id === id);
  if (!source) throw new Error(`소스 없음: ${id}`);
  return source;
};
const BBC = byId("bbc-sport-football");
const ESPN = byId("espn-soccer");
const IF = byId("interfootball-world");
const FL = byId("footballist-football");
const FEEDS = [BBC, ESPN, IF, FL];

/** 1일차 06:30 KST 2026-10-11 */
const NOW = "2026-10-10T21:30:00.000Z";
/** 같은 KST 날 다시 실행(10:00 KST) */
const LATER = "2026-10-11T01:00:00.000Z";
/** 2일차 06:30 KST 2026-10-12 */
const DAY2 = "2026-10-11T21:30:00.000Z";

const BBC_A =
  "https://www.bbc.co.uk/sport/football/articles/c0haaland01o?at_medium=RSS&at_campaign=rss";
const BBC_C = "https://www.bbc.co.uk/sport/football/articles/c0chelsea01o";
const ESPN_B = "https://www.espn.com/soccer/story/_/id/1001/haaland-brentford";
const ESPN_D = "https://www.espn.com/soccer/story/_/id/1002/arsenal-winger";
const ESPN_E = "https://www.espn.com/soccer/story/_/id/1003/day-two";
const IF_K1 =
  "https://www.interfootball.co.kr/news/articleView.html?idxno=900001";
const FL_K2 =
  "https://www.footballist.co.kr/news/articleView.html?idxno=900002";

interface FeedEntry {
  title: string;
  link: string;
  at: string;
}

const A: FeedEntry = {
  title: "Haaland double fires Manchester City past Brentford",
  link: BBC_A,
  at: "2026-10-10T20:00:00.000Z", // 1일차 실행 − 1.5시간(다음 날 겹침 창 안)
};
const B: FeedEntry = {
  title: "Haaland scores twice as Man City beat Brentford",
  link: ESPN_B,
  at: "2026-10-10T21:10:00.000Z",
};
const C: FeedEntry = {
  title: "Chelsea sack manager after poor start",
  link: BBC_C,
  at: "2026-10-10T19:00:00.000Z",
};
const D: FeedEntry = {
  title: "Arsenal agree deal for Brazilian winger",
  link: ESPN_D,
  at: "2026-10-10T23:30:00.000Z",
};
const E: FeedEntry = {
  title: "Liverpool confirm long-term injury to defender",
  link: ESPN_E,
  at: "2026-10-11T20:00:00.000Z",
};
const K1: FeedEntry = {
  title: "홀란드 멀티골 맨시티, 브렌트포드 3-1 격파",
  link: IF_K1,
  at: "2026-10-10T20:40:00.000Z",
};
const K2: FeedEntry = {
  title: "‘홀란 2골’ 맨시티, 브렌트포드에 3-1 승리",
  link: FL_K2,
  at: "2026-10-10T21:00:00.000Z",
};

/** 제목·링크·날짜만 있는 RSS 2.0 */
function rss(entries: readonly FeedEntry[]): string {
  const items = entries
    .map(
      (e) =>
        `<item><title><![CDATA[${e.title}]]></title><link>${e.link.replace(/&/g, "&amp;")}</link><pubDate>${new Date(e.at).toUTCString()}</pubDate></item>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title><link>https://example.com/</link><description>d</description>${items}</channel></rss>`;
}

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-cluster-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function makeDeps(
  now: string,
  feeds: Partial<Record<string, readonly FeedEntry[]>>,
  over: Partial<CollectDeps> = {},
) {
  const records: LogRecord[] = [];
  const deps: CollectDeps = {
    rootDir: ROOT,
    dataDir,
    env: "dev",
    llmMode: "mock",
    dry: false,
    limit: 45,
    loadSources: async () => FEEDS,
    now: () => new Date(now),
    fetch: async (input) => {
      const url = String(input);
      if (url.startsWith(FOOTBALL_DATA_BASE_URL)) {
        return new Response('{"matches":[]}', { status: 200 }); // 경기 없음 → 브리핑 호출 생략
      }
      const source = FEEDS.find((s) => s.url === url);
      if (source === undefined) throw new Error(`예상하지 못한 URL: ${url}`);
      return new Response(rss(feeds[source.id] ?? []), { status: 200 });
    },
    userAgent: feedUserAgent("test@example.com"),
    feedClock: { now: () => 0, sleep: async () => undefined },
    footballDataApiKey: "test-football-data-key",
    footballDataSleep: async () => undefined,
    createLlm: () => {
      throw new Error("경기가 없으면 LLM을 만들지 않는다");
    },
    resolveBriefConfig: () => ({
      model: "claude-haiku-5-5",
      budgets: { dailyBudgetUsd: 0.1, monthlyBudgetUsd: 3 },
    }),
    logger: createLogger({
      scope: "collect",
      format: "json",
      sink: (_line, record) => records.push(record),
    }),
    print: () => undefined,
    ...over,
  };
  return { deps, records };
}

function readNews(date: string): NewsFile {
  return NewsFileSchema.parse(
    JSON.parse(
      readFileSync(path.join(dataDir, "news", `${date}.json`), "utf8"),
    ),
  );
}

function readSeenKeys(): string[] {
  return Object.keys(
    SeenUrlsFileSchema.parse(
      JSON.parse(
        readFileSync(path.join(dataDir, "cache", "seen-urls.json"), "utf8"),
      ),
    ).urls,
  );
}

/** 1일차 실행이 커밋됐다고 보고 prod runs.json에 남긴다(다음 날 수집 창 = 1일차 − 3시간 ~ 현재) */
function writeProdRun(startedAt: string): void {
  const run: RunLog = {
    runId: `collect-prod-${startedAt.replace(/[-:]|\.\d+/g, "")}-0000`,
    env: "prod",
    job: "collect",
    startedAt,
    finishedAt: startedAt,
    collected: 4,
    clusters: 3,
    summarized: 0,
    downgraded: 0,
    tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0,
    apiCalls: { footballData: 1, apiFootball: 0 },
    sources: FEEDS.map((s) => ({ id: s.id, ok: true, items: 1 })),
    status: "success",
  };
  writeFileSync(
    path.join(dataDir, "runs.json"),
    `${JSON.stringify([run], null, 2)}\n`,
    "utf8",
  );
}

const srcLinks = (file: NewsFile) =>
  file.cards.map((c) => c.src.map((s) => s.u));

describe("runCollect — 같은 사건 클러스터 → 카드 (M1-13, FR-05)", () => {
  it("여러 매체의 같은 소식은 카드 1장(대표 = 설정 순서상 처음, 출처 = 매체마다), 국내·해외는 따로, 다른 소식은 따로", async () => {
    const { deps, records } = makeDeps(NOW, {
      [BBC.id]: [A, C],
      [ESPN.id]: [B],
      [IF.id]: [K1],
      [FL.id]: [K2],
    });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    const file = readNews("2026-10-11");
    // 최신 출처 시각 순: 맨시티(ESPN 21:10Z) · 국내 맨시티(21:00Z) · 첼시(19:00Z)
    expect(srcLinks(file)).toEqual([[BBC_A, ESPN_B], [IF_K1, FL_K2], [BBC_C]]);
    const city = file.cards[0]!;
    expect(city).toMatchObject({
      id: cardIdFor(BBC_A),
      t: A.title,
      lang: "en",
      ai: false,
      s: [],
      created: NOW,
    });
    expect(city.src).toEqual([
      { n: "BBC Sport", u: BBC_A, at: A.at, tier: 2 },
      { n: "ESPN", u: ESPN_B, at: B.at, tier: 2 },
    ]);
    expect(file.cards[1]!.src.map((s) => s.n)).toEqual([
      "인터풋볼",
      "풋볼리스트",
    ]);
    expect(outcome.news).toMatchObject({ selected: 3, added: 3, attached: 0 });
    expect(outcome.news.cluster).toMatchObject({
      groups: 5,
      fresh: 3,
      multi: 2,
      merged: 2,
      maxPublishers: 2,
    });
    expect(
      records.find((r) => r.event === "collect.select.done"),
    ).toMatchObject({
      unique: 5,
      clusters: 3,
      clustered: 2,
      merged: 2,
      maxPublishers: 2,
      seenBefore: 0,
      seenBeforeExtra: 0,
      selected: 3,
    });
    // 기억에는 카드의 모든 출처 URL(클러스터 구성 기사 포함)
    expect(readSeenKeys().sort()).toEqual(
      [BBC_A, ESPN_B, BBC_C, IF_K1, FL_K2].map(urlHash).sort(),
    );
  });

  it("같은 날 다시 실행 — 오늘 카드와 같은 사건의 새 기사는 새 카드가 아니라 그 카드의 출처(id·created 유지), 다른 새 소식은 카드", async () => {
    await runCollect(makeDeps(NOW, { [BBC.id]: [A, C] }).deps);
    const before = readNews("2026-10-11");
    const city = before.cards.find((c) => c.src[0]!.u === BBC_A)!;
    expect(city.src).toHaveLength(1);

    const again = makeDeps(LATER, {
      [BBC.id]: [A, C],
      [ESPN.id]: [B, D],
    });
    const outcome = await runCollect(again.deps);
    expect(outcome.exitCode).toBe(0);
    const after = readNews("2026-10-11");
    expect(after.cards).toHaveLength(3);
    const city2 = after.cards.find((c) => c.id === city.id)!;
    expect(city2).toMatchObject({ created: NOW, t: A.title });
    expect(city2.src.map((s) => s.u)).toEqual([BBC_A, ESPN_B]);
    expect(after.cards.some((c) => c.src[0]!.u === ESPN_D)).toBe(true);
    expect(outcome.news).toMatchObject({ added: 1, attached: 1 });
    expect(outcome.news.cluster).toMatchObject({
      existing: 2, // 다시 들어온 두 오늘 카드(맨시티·첼시)
      additions: 1,
      fresh: 1,
    });
    expect(readSeenKeys()).toContain(urlHash(ESPN_B));
  });

  it("같은 날 다시 실행 — 오늘 카드 URL이 피드에서 빠졌어도 제목이 같은 사건이면 그 카드에 붙는다", async () => {
    await runCollect(makeDeps(NOW, { [BBC.id]: [A] }).deps);
    const outcome = await runCollect(makeDeps(LATER, { [ESPN.id]: [B] }).deps);
    const file = readNews("2026-10-11");
    expect(srcLinks(file)).toEqual([[BBC_A, ESPN_B]]);
    expect(outcome.news).toMatchObject({ added: 0, attached: 1 });
  });

  it("같은 날 다시 실행해도 새 기사가 없으면 파일을 다시 쓰지 않는다", async () => {
    await runCollect(makeDeps(NOW, { [BBC.id]: [A], [ESPN.id]: [B] }).deps);
    const text = readFileSync(
      path.join(dataDir, "news", "2026-10-11.json"),
      "utf8",
    );
    const again = makeDeps(LATER, { [BBC.id]: [A], [ESPN.id]: [B] });
    const outcome = await runCollect(again.deps);
    expect(outcome.news).toMatchObject({ added: 0, attached: 0, path: null });
    expect(
      readFileSync(path.join(dataDir, "news", "2026-10-11.json"), "utf8"),
    ).toBe(text);
    expect(
      again.records.find((r) => r.event === "collect.news.unchanged"),
    ).toBeDefined();
  });

  it("다음 날 — 어제 카드와 같은 사건의 늦은 기사는 카드가 되지 않는다(클러스터 통째 제외), 다른 새 소식은 카드가 된다", async () => {
    // 1일차: A(BBC)만 카드
    await runCollect(makeDeps(NOW, { [BBC.id]: [A] }).deps);
    expect(srcLinks(readNews("2026-10-11"))).toEqual([[BBC_A]]);
    writeProdRun(NOW);

    // 2일차: 겹침 창으로 A가 다시 들어오고, 같은 사건의 ESPN B(1일차 실행 뒤 보도)와 다른 소식 D·E
    const day2 = makeDeps(DAY2, {
      [BBC.id]: [A],
      [ESPN.id]: [{ ...B, at: "2026-10-10T23:00:00.000Z" }, D, E],
    });
    const outcome = await runCollect(day2.deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.news.window?.start).toBe("2026-10-10T18:30:00.000Z");
    const file2 = readNews("2026-10-12");
    expect(srcLinks(file2)).toEqual([[ESPN_E], [ESPN_D]]);
    expect(outcome.news.dedup).toMatchObject({ unique: 4, seenBefore: 2 });
    expect(
      day2.records.find((r) => r.event === "collect.select.done"),
    ).toMatchObject({
      clusters: 2,
      seenBefore: 2,
      seenBeforeClusters: 1,
      seenBeforeExtra: 1,
      selected: 2,
    });
    // B는 카드가 되지 않았으니 기억에도 없다(다음에 다시 후보가 되면 같은 규칙으로 판정)
    expect(readSeenKeys()).not.toContain(urlHash(ESPN_B));
  });
});

describe("runCollect — 클러스터링 실패 격리 (M1-13)", () => {
  it("클러스터링이 예상 밖 오류로 실패해도 같은 사건을 합치지 않은 채 발행한다(partial + 경고)", async () => {
    const { deps, records } = makeDeps(
      NOW,
      { [BBC.id]: [A, C], [ESPN.id]: [B] },
      {
        clusterDocs: () => {
          throw new Error("boom");
        },
      },
    );
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("partial");
    expect(outcome.news).toMatchObject({ ok: true, clusterError: "boom" });
    expect(srcLinks(readNews("2026-10-11"))).toEqual([
      [ESPN_B],
      [BBC_A],
      [BBC_C],
    ]);
    expect(
      records.find((r) => r.event === "collect.cluster.fail"),
    ).toMatchObject({ level: "warn", error: "boom" });
  });

  it("상태: 클러스터링 오류 = partial(발행은 됨), 뉴스 실패가 우선", () => {
    const done: BriefOutcome = { state: "done", inputMatches: 1, lines: ["a"] };
    expect(runStatus({ ok: true, clusterError: null }, done)).toBe("success");
    expect(runStatus({ ok: true, clusterError: "boom" }, done)).toBe("partial");
    expect(runStatus({ ok: false, clusterError: "boom" }, done)).toBe("failed");
  });
});
