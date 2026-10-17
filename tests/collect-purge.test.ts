/**
 * 수집 실행의 data 원본 삭제 단계 연결 (M1-25 — collect-run.ts ⓪, purge-stage.ts) — 네트워크·LLM 없음.
 * 피드는 fixtures/rss/bbc-sport-football.xml, football-data 키 없음(브리핑 생략), 설정 루트는 임시 폴더(configs/takedowns.json).
 *
 * 확인: 뉴스 단계 **전에** 지운다 → 같은 날 재실행에서 삭제 요청 카드가 다시 카드가 되지 않는다(기억 키 + 오늘 파일에 없음),
 * 모든 날짜 파일의 같은 ID를 지운다, 보존 기간이 지난 출처를 지운다, dry는 계획만, 삭제 실패는 partial(발행 계속).
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  NewsFileSchema,
  SeenUrlsFileSchema,
  SourcesFileSchema,
  type NewsCard,
  type NewsFile,
  type Source,
} from "@/lib/schema";

import { runCollect, type CollectDeps } from "../scripts/lib/collect-run";
import { createLlmClient } from "../scripts/lib/llm";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { feedUserAgent, type FetchLike } from "../scripts/lib/rss";
import { partialFindings } from "../scripts/lib/run-issues";
import { urlHash } from "../scripts/lib/url-normalize";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(REPO, rel), "utf8");

const BBC_XML = read("fixtures/rss/bbc-sport-football.xml");
const SOURCES = SourcesFileSchema.parse(
  JSON.parse(read("configs/sources.json")),
);
const BBC_SOURCE = SOURCES.find((s) => s.id === "bbc-sport-football")!;
/** 수집하지 않는(비활성) Athletic — 보존 기간은 활성 여부와 무관하게 적용된다 */
const ATHLETIC_OFF: Source = {
  ...SOURCES.find((s) => s.id === "the-athletic-football")!,
  enabled: false,
};

/** 06:30 KST 2026-10-11 = 2026-10-10T21:30Z — 발행일 2026-10-11 */
const NOW = new Date("2026-10-10T21:30:00.000Z");

let root: string;
let dataDir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "euro-digest-collect-purge-"));
  dataDir = path.join(root, "data");
  mkdirSync(path.join(root, "configs"), { recursive: true });
  writeTakedowns([]);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeTakedowns(ids: string[]): void {
  writeFileSync(
    path.join(root, "configs", "takedowns.json"),
    JSON.stringify(
      ids.map((id) => ({
        id,
        requestedAt: "2026-10-10T12:00:00Z",
        handledAt: null,
        reason: "저작권자 삭제 요청 (#1)",
      })),
    ),
  );
}

const fetchBbc: FetchLike = async (url) => {
  if (url === BBC_SOURCE.url) return new Response(BBC_XML, { status: 200 });
  throw new Error(`테스트에서 예상하지 못한 URL: ${url}`);
};

function makeDeps(over: Partial<CollectDeps> = {}) {
  const records: LogRecord[] = [];
  const printed: string[] = [];
  const deps: CollectDeps = {
    rootDir: root, // configs/takedowns.json만 있다(키워드 설정 없음 — 코드 표로 점수화)
    dataDir,
    env: "dev",
    llmMode: "mock",
    dry: false,
    limit: 5,
    loadSources: async () => [BBC_SOURCE, ATHLETIC_OFF],
    now: () => NOW,
    fetch: fetchBbc,
    userAgent: feedUserAgent("test@example.com"),
    feedClock: { now: () => 0, sleep: async () => undefined },
    footballDataApiKey: undefined, // 브리핑 생략(프롬프트 파일도 rootDir에 없다)
    createLlm: () => createLlmClient({ mode: "mock", logger: () => undefined }),
    resolveBriefConfig: () => ({
      model: "claude-haiku-5-5",
      budgets: { dailyBudgetUsd: 0.1, monthlyBudgetUsd: 3 },
    }),
    logger: createLogger({
      scope: "collect",
      format: "json",
      sink: (_line, record) => records.push(record),
    }),
    print: (text) => printed.push(text),
    ...over,
  };
  return { deps, records, printed };
}

function readNews(date: string): NewsFile {
  return NewsFileSchema.parse(
    JSON.parse(
      readFileSync(path.join(dataDir, "news", `${date}.json`), "utf8"),
    ),
  );
}

function writeNews(date: string, cards: NewsCard[]): void {
  const target = path.join(dataDir, "news", `${date}.json`);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(
    target,
    JSON.stringify(
      NewsFileSchema.parse({
        date,
        generatedAt: `${date}T00:00:00.000Z`,
        runId: "prod-collect-old",
        cards,
      }),
    ),
  );
}

const allUrls = (file: NewsFile) =>
  file.cards.flatMap((c) => c.src.map((s) => urlHash(s.u)));

describe("runCollect ⓪ — 삭제 요청 (FR-143)", () => {
  it("같은 날 재실행: 삭제 요청 카드를 오늘·지난 파일에서 지우고, 같은 기사가 피드에 있어도 다시 카드로 만들지 않는다", async () => {
    // 1차 실행 — 오늘 파일 5장
    const first = await runCollect(makeDeps().deps);
    expect(first.exitCode).toBe(0);
    expect(first.purge).toMatchObject({ state: "done", errors: [] });
    const today = readNews("2026-10-11");
    expect(today.cards).toHaveLength(5);
    const target = today.cards[1]!;
    // 같은 ID가 지난 파일에도 있다(M1-12 이전 재게시처럼 — ID는 날짜를 넘어 유일하지 않다)
    writeNews("2026-10-10", [
      { ...target, created: "2026-10-09T21:30:00.000Z" },
    ]);

    writeTakedowns([target.id]);
    const { deps, records } = makeDeps();
    const second = await runCollect(deps);

    expect(second.exitCode).toBe(0);
    expect(second.purge.state).toBe("done");
    expect(second.purge.plan.counts.takedownCards).toBe(2);
    expect(second.purge.written).toEqual(["2026-10-10", "2026-10-11"]);
    expect(readNews("2026-10-10").cards).toEqual([]);
    const after = readNews("2026-10-11");
    expect(after.cards.map((c) => c.id)).not.toContain(target.id);
    // 그 기사의 링크는 어떤 카드의 출처로도 다시 들어오지 않는다(기억에 있고 오늘 파일에 없음 — 클러스터째 제외)
    const targetKey = urlHash(target.src[0]!.u);
    expect(allUrls(after)).not.toContain(targetKey);
    const seen = SeenUrlsFileSchema.parse(
      JSON.parse(
        readFileSync(path.join(dataDir, "cache", "seen-urls.json"), "utf8"),
      ),
    );
    expect(Object.keys(seen.urls)).toContain(targetKey);
    // 실행 요약 로그에 삭제 결과 한 칸
    expect(records.find((r) => r.event === "collect.done")).toMatchObject({
      purge: "done:cards2/sources0",
    });
    // 삭제 단계가 뉴스 단계(소스 계획)보다 먼저 돈다
    const events = records.map((r) => r.event);
    expect(events.indexOf("collect.purge.done")).toBeGreaterThanOrEqual(0);
    expect(events.indexOf("collect.purge.done")).toBeLessThan(
      events.indexOf("collect.sources.plan"),
    );
  });

  it("dry: 계획만 출력하고 파일을 바꾸지 않는다", async () => {
    await runCollect(makeDeps().deps);
    const before = readFileSync(
      path.join(dataDir, "news", "2026-10-11.json"),
      "utf8",
    );
    const target = readNews("2026-10-11").cards[0]!;
    writeTakedowns([target.id]);

    const { deps, printed } = makeDeps({ dry: true });
    const outcome = await runCollect(deps);

    expect(outcome.purge.state).toBe("dry");
    expect(
      readFileSync(path.join(dataDir, "news", "2026-10-11.json"), "utf8"),
    ).toBe(before);
    expect(
      printed.some((l) =>
        l.startsWith("── [dry] data/news 원본 삭제 — 카드 1장"),
      ),
    ).toBe(true);
  });

  it("삭제 요청 설정이 깨져도 발행은 계속하고 실행 상태만 partial", async () => {
    writeFileSync(path.join(root, "configs", "takedowns.json"), "{ broken");
    const outcome = await runCollect(makeDeps().deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.news.ok).toBe(true);
    expect(outcome.purge.errors.map((e) => e.step)).toEqual(["takedowns"]);
    expect(outcome.status).toBe("partial");
    expect(readNews("2026-10-11").cards).toHaveLength(5);
    // 부분 실패 이슈 사유(M1-27 — M1-25 이월: 삭제 단계 오류는 이슈가 없었다). football-data 키 없음은 source-broken 몫
    const findings = partialFindings({
      purge: outcome.purge,
      news: outcome.news,
      brief: outcome.brief,
      briefFile: outcome.briefFile,
      ledger: outcome.matchData?.ledger ?? null,
    });
    expect(findings.map((f) => f.reason)).toEqual(["purge"]);
    expect(findings[0]!.detail).toMatch(/^takedowns: /);
  });
});

describe("runCollect ⓪ — 소스별 보존 기간 (D32)", () => {
  it("보존 기간이 지난 The Athletic 출처를 지난 파일에서 지운다(대표면 카드, 아니면 출처) — 비활성 소스도", async () => {
    const old = "2026-10-03T20:00:00.000Z"; // + 7일 = 10-10T20:00Z < NOW(21:30Z)
    const created = "2026-10-03T21:30:00.000Z";
    const lead: NewsCard = {
      id: "c_aaaaaaaaaa",
      t: "Athletic lead",
      s: [],
      cat: "other",
      comp: [],
      teams: [],
      players: [],
      imp: 3,
      kr: false,
      spoiler: false,
      src: [
        {
          n: "The Athletic",
          u: "https://www.nytimes.com/athletic/1/",
          at: old,
          tier: 1,
        },
      ],
      lang: "en",
      ai: false,
      created,
    };
    const tail: NewsCard = {
      ...lead,
      id: "c_bbbbbbbbbb",
      t: "BBC lead",
      src: [
        {
          n: "BBC Sport",
          u: "https://www.bbc.co.uk/sport/football/articles/x",
          at: old,
          tier: 1,
        },
        {
          n: "The Athletic",
          u: "https://www.nytimes.com/athletic/2/",
          at: old,
          tier: 1,
        },
      ],
    };
    writeNews("2026-10-04", [lead, tail]);

    const outcome = await runCollect(makeDeps().deps);

    expect(outcome.purge.retention).toEqual({ "The Athletic": 7 });
    expect(outcome.purge.plan.counts).toEqual({
      takedownCards: 0,
      retentionCards: 1,
      retentionSources: 1,
    });
    const file = readNews("2026-10-04");
    expect(file.cards.map((c) => c.id)).toEqual(["c_bbbbbbbbbb"]);
    expect(file.cards[0]!.src.map((s) => s.n)).toEqual(["BBC Sport"]);
    expect(outcome.status).toBe("partial"); // football-data 키 없음 — 삭제 단계 오류는 없다
    expect(outcome.purge.errors).toEqual([]);
  });
});
