/**
 * M1-02 — `npm run collect` 뉴스 단계가 소스 로더의 수집 대상 피드 전부를 돌고, 소스별 실패를 격리하는지 검사한다.
 *
 * 네트워크·실호출 없음: 피드는 fixtures/rss/<소스 id>.xml 14개, 소스는 configs/sources.json에서 fixture 피드만 켠 목록을
 * 주입한다(tests/support/fixture-sources.ts — 실제 configs의 enabled에 기대지 않는다. 2026-10-14 espn-soccer 비활성 뒤에도
 * 14개 그대로). 현재 configs의 수집 대상 스냅숏은 tests/sources.test.ts.
 * 경기는 fixtures/football/football-data/*, LLM은 fixtures/llm/mock 또는 가짜 transport. 파일 쓰기는 임시 폴더.
 *
 * 필수 항목: 수집 대상만 요청(제외 소스·검색형은 요청 없음) · 소스 1개 실패 격리 · 여러 소스의 같은 링크 중복 없음 ·
 * 모든 소스 실패 = 뉴스 실패(브리핑 생략) · RunLog.sources 기록 · `summarize` 값과 무관하게 LLM에 기사 미전송(D23).
 * M1-03: 호스트별 병렬(같은 호스트 하나씩·동시 상한 4) · 결과·카드는 설정 순서(완료 순서 무관) · 재시도·실패 종류 ·
 * 단계 시간 예산 초과 소스도 RunLog.sources에 `{id, ok:false, items:0}`로 남음. 시각·대기는 가상 시계(feedClock)로 주입한다 —
 * 시간 계산 자체는 tests/feed-collect.test.ts(가짜 타이머).
 * M1-09(D34): 국내 5피드는 시간대 없는 pubDate를 소스 `tz`(Asia/Seoul)로 해석해 모든 항목을 쓴다(공통 형식·시간대 세부는
 * tests/feed-item.test.ts). 섹션 피드 ⊂ 전체기사 피드라 국내 같은 링크 9쌍이 더해진다.
 * M1-10(FR-07): 수집 시간 창이 소스를 합치기 전에 적용된다 — 시각은 피드 스냅샷 직후(NOW 주석), 창 계산·미래 가드는
 * tests/collect-window.test.ts.
 * M1-13(FR-05): 고유 링크 52건 → 같은 사건 클러스터 45개(국내 3매체 2묶음 −4, BBC+Athletic 2묶음 −2, BBC+Relevo 1묶음 −1 —
 * Athletic 항목은 합성 제목·링크, D32·D42)
 * → 카드 = 클러스터. 유사도·계획 자체는 tests/cluster.test.ts·tests/news-cluster.test.ts.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  NewsFileSchema,
  RunsDevFileSchema,
  type NewsCard,
  type NewsFile,
  type Source,
} from "@/lib/schema";

import { cardIdFor } from "../scripts/lib/card-id";
import { runCollect, type CollectDeps } from "../scripts/lib/collect-run";
import { ConfigFileError } from "../scripts/lib/config-files";
import {
  createLlmClient,
  type LlmClient,
  type LlmRequest,
  type LlmTransport,
  type MessageParams,
} from "../scripts/lib/llm";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { hostKey, type FeedClock } from "../scripts/lib/feed-collect";
import {
  buildCard,
  buildNewsFile,
  newsFilePath,
  serializeNewsFile,
} from "../scripts/lib/news-file";
import { FOOTBALL_DATA_BASE_URL } from "../scripts/lib/providers/football-data";
import {
  feedUserAgent,
  parseFeedXml,
  type FetchLike,
} from "../scripts/lib/rss";
import { planDailySources } from "../scripts/lib/sources";

import { cancelGate } from "./support/cancel-gate";
import { fixtureFeedSources } from "./support/fixture-sources";
import { fdFixtureResponse } from "./support/football-data-fake";

// ─── fixtures ────────────────────────────────────────────────────────────

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** configs/sources.json + fixture 피드 14개 활성(테스트 전용) — makeDeps가 loadSources로 주입한다 */
const SOURCES: Source[] = fixtureFeedSources();
const PLAN = planDailySources(SOURCES);
const FEEDS = PLAN.feeds;
const byId = (id: string): Source => {
  const source = SOURCES.find((s) => s.id === id);
  if (!source) throw new Error(`configs에 없는 소스: ${id}`);
  return source;
};
const FEED_XML = new Map(
  FEEDS.map((s) => [s.id, read(`fixtures/rss/${s.id}.xml`)] as const),
);
const RSS_INDEX = JSON.parse(read("fixtures/rss/index.json")) as {
  sources: Array<{
    id: string;
    items: Array<{ title: string; link: string }>;
  }>;
};
const FD_MATCHES_1010 = read(
  "fixtures/football/football-data/matches-6comps-2026-10-10.json",
);

/**
 * 피드 fixture 스냅샷(fixtures/rss/index.json `collectedAt` 2026-10-11T06:17:17Z) 직후 = 15:20 KST 2026-10-11 —
 * 발행일 2026-10-11(mock 브리핑 fixture가 있는 날). 수집 시간 창(M1-10)이 생겨 시계가 스냅샷보다 이르면 스냅샷 항목이
 * "미래"가 된다 — 이 파일은 스냅샷과 같은 시점의 수집을 재현한다. runs.json이 없으므로 창은 51시간(첫 실행, D36):
 * [2026-10-09T03:20Z, 현재 + 5분] → 쓸 수 있는 69건 중 5건(10-07 이전)이 창 밖. 창 자체는 tests/collect-window.test.ts.
 */
const NOW = new Date("2026-10-11T06:20:00.000Z");

/**
 * fixture 피드 점수 상위 5장의 제목 머리(--limit 5). 국내 3매체 두 카드(분데스 김민재·설영우 / 라리가 이강인)의 제목은 사건
 * 대표(M1-15 — Tier 3·weight 1 동률에서 가장 최신인 베스트일레븐)의 원문이다(예전: 설정 순서상 처음인 인터풋볼 '[분데스 REVIEW]
 * 김민재는 결장!'·'[라리가 REVIEW] '발목 부상' 이강인').
 */
const LIMIT5_HEADS = [
  "Solanke scores in added time",
  "AC Milan keen on Scott",
  "“내 멍청한 실수였다”… 노이어",
  "‘이강인 33분 소화’",
  "이강인이 대체 뭘 잘못했길래",
];

const KOREAN_FEEDS = [
  "interfootball-world",
  "interfootball-all",
  "footballist-football",
  "besteleven-world",
  "besteleven-all",
];

// ─── 도우미 ──────────────────────────────────────────────────────────────

type Route = string | Response | Error | (() => Response);

interface FakeFetch {
  fetch: FetchLike;
  calls: string[];
  maxInFlight: () => number;
  /** 호스트 하나에 동시에 나간 요청 수의 최댓값 */
  maxPerHost: () => number;
}

/**
 * 수집 대상 피드 URL은 fixture XML(또는 소스 id별 덮어쓰기), football-data는 경기·순위 fixture를 돌려준다.
 * 그 밖의 URL은 실패시킨다(제외 소스를 요청하면 테스트가 잡는다). 동시 요청 수(전체·호스트별)도 잰다.
 * `delayMs`가 있으면 그 소스는 실제 시간으로 그만큼 늦게 응답한다(완료 순서 바꾸기용, 짧게).
 */
function fakeFetch(
  overrides: Record<string, Route> = {},
  sources: readonly Source[] = SOURCES,
  delayMs: (id: string) => number = () => 0,
): FakeFetch {
  const calls: string[] = [];
  let inFlight = 0;
  let max = 0;
  const perHost = new Map<string, number>();
  let maxPerHost = 0;
  const idByUrl = new Map(sources.map((s) => [s.url, s.id] as const));
  const respond = (route: Route): Response => {
    if (route instanceof Error) throw route;
    if (route instanceof Response) return route.clone();
    if (typeof route === "function") return route();
    return new Response(route, { status: 200 });
  };
  return {
    calls,
    maxInFlight: () => max,
    maxPerHost: () => maxPerHost,
    fetch: async (url) => {
      calls.push(url);
      const host = hostKey(url);
      inFlight += 1;
      max = Math.max(max, inFlight);
      perHost.set(host, (perHost.get(host) ?? 0) + 1);
      maxPerHost = Math.max(maxPerHost, perHost.get(host)!);
      try {
        await Promise.resolve();
        // football-data: 경기는 2026-10-10 fixture, 순위는 대회별 fixture(M1-44)
        const fd = fdFixtureResponse(url, FD_MATCHES_1010);
        if (fd) return fd;
        const id = idByUrl.get(url);
        if (id === undefined) {
          throw new Error(`테스트에서 예상하지 못한 URL: ${url}`);
        }
        const route = overrides[id] ?? FEED_XML.get(id);
        if (route === undefined) {
          throw new Error(`fixture가 없는 소스를 요청함: ${id}`);
        }
        const delay = delayMs(id);
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        return respond(route);
      } finally {
        inFlight -= 1;
        perHost.set(host, perHost.get(host)! - 1);
      }
    },
  };
}

/** 가상 시계 — 대기(같은 호스트 간격·재시도 대기)는 실제로 기다리지 않고 시각만 앞으로 민다 */
function virtualClock(): { clock: FeedClock; advance: (ms: number) => void } {
  let t = 0;
  return {
    clock: {
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-sources-run-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function makeDeps(
  over: Partial<CollectDeps> = {},
  fetcher: FakeFetch = fakeFetch(),
) {
  const printed: string[] = [];
  const records: LogRecord[] = [];
  const logger = createLogger({
    scope: "collect",
    format: "json",
    sink: (_line, record) => records.push(record),
  });
  const llmRequests: LlmRequest[] = [];
  let llmCreated = 0;
  const deps: CollectDeps = {
    rootDir: ROOT,
    dataDir,
    env: "dev",
    llmMode: "mock",
    dry: false,
    limit: 45,
    now: () => NOW,
    loadSources: async () => SOURCES,
    fetch: fetcher.fetch,
    userAgent: feedUserAgent("test@example.com"),
    feedClock: virtualClock().clock,
    footballDataApiKey: "test-football-data-key",
    footballDataSleep: async () => undefined,
    createLlm: () => {
      llmCreated += 1;
      const client = createLlmClient({ mode: "mock", logger: () => undefined });
      return spyClient(client, llmRequests);
    },
    resolveBriefConfig: () => ({
      model: "claude-haiku-5-5",
      budgets: { dailyBudgetUsd: 0.1, monthlyBudgetUsd: 3 },
    }),
    logger,
    print: (text) => printed.push(text),
    ...over,
  };
  return {
    deps,
    printed,
    records,
    fetcher,
    llmRequests,
    llmCreated: () => llmCreated,
  };
}

function spyClient(
  client: Pick<LlmClient, "callSingle" | "model">,
  requests: LlmRequest[],
): Pick<LlmClient, "callSingle" | "model"> {
  return {
    model: client.model,
    callSingle: (request, options) => {
      requests.push(request);
      return client.callSingle(request, options);
    },
  };
}

/** callSingle만 쓰는 가짜 live transport */
function fakeLiveTransport(text: string): {
  transport: LlmTransport;
  params: MessageParams[];
} {
  const params: MessageParams[] = [];
  const unused = () => {
    throw new Error("배치는 쓰지 않는다");
  };
  return {
    params,
    transport: {
      async createMessage(p) {
        params.push(p);
        return {
          content: [{ type: "text", text }],
          stop_reason: "end_turn",
          usage: {
            input_tokens: 6590,
            output_tokens: 3231,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        };
      },
      createBatch: unused,
      retrieveBatch: unused,
      cancelBatch: unused,
      batchResults: unused,
    },
  };
}

function readNews(date: string): NewsFile {
  return NewsFileSchema.parse(
    JSON.parse(
      readFileSync(path.join(dataDir, "news", `${date}.json`), "utf8"),
    ),
  );
}

function newsFiles(): string[] {
  try {
    return readdirSync(path.join(dataDir, "news"));
  } catch {
    return [];
  }
}

/** 오류 본문이 깨지는 응답 — fetchFeedXml이 감싸지 않는 예외(errorType "unexpected") */
function brokenBodyResponse(): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new Error("stream broken"));
      },
    }),
    { status: 200 },
  );
}

// ─── 수집 대상 전부 ──────────────────────────────────────────────────────

describe("runCollect — 수집 대상 피드 전부(fixture 피드 14개 활성)", () => {
  it("수집 대상 14개 피드만 한 번씩 요청(다른 호스트 동시·같은 호스트 하나씩 설정 순서), 제외 소스·검색형은 요청하지 않는다", async () => {
    const { deps, fetcher, records } = makeDeps();
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("success");

    const feedCalls = fetcher.calls.filter(
      (url) => !url.startsWith(FOOTBALL_DATA_BASE_URL),
    );
    expect([...feedCalls].sort()).toEqual(FEEDS.map((s) => s.url).sort());
    // 호스트별 병렬(M1-03): 동시 요청은 2~4개, 호스트 하나에는 항상 1개
    expect(fetcher.maxInFlight()).toBeGreaterThan(1);
    expect(fetcher.maxInFlight()).toBeLessThanOrEqual(4);
    expect(fetcher.maxPerHost()).toBe(1);
    // 같은 호스트(BBC 4·interfootball 2·besteleven 2)는 설정 순서대로
    for (const host of new Set(FEEDS.map((s) => hostKey(s.url)))) {
      expect(feedCalls.filter((url) => hostKey(url) === host)).toEqual(
        FEEDS.filter((s) => hostKey(s.url) === host).map((s) => s.url),
      );
    }
    for (const ex of PLAN.excluded) {
      expect(fetcher.calls).not.toContain(byId(ex.id).url);
    }

    // 제외 사유는 소스마다 구조화 로그 한 줄
    const skips = records.filter((r) => r.event === "collect.source.skip");
    expect(skips.map((r) => [r.source, r.reason])).toEqual(
      PLAN.excluded.map((e) => [e.id, e.reason]),
    );
    expect(
      records.find((r) => r.event === "collect.sources.plan"),
    ).toMatchObject({
      feeds: 14,
      crawls: 0,
      excluded: 12,
      byReason: { disabled: 12 },
    });
  });

  it("소스별 결과 — 받은 항목 = 쓸 수 있는 항목(국내 5피드 포함 — tz Asia/Seoul, M1-09·D34), 건너뛴 항목 없음", async () => {
    const { deps, records } = makeDeps();
    const outcome = await runCollect(deps);
    const sources = outcome.news.sources;
    expect(sources.map((s) => s.id)).toEqual(FEEDS.map((s) => s.id));
    expect(sources.every((s) => s.ok)).toBe(true);
    for (const s of sources) {
      const indexed = RSS_INDEX.sources.find((x) => x.id === s.id)!;
      expect(s.items).toBe(indexed.items.length);
      expect(s.usable).toBe(s.items);
      expect(s.skipped).toEqual({});
    }
    const korean = sources.filter((s) => KOREAN_FEEDS.includes(s.id));
    expect(korean.map((s) => [s.id, s.usable])).toEqual([
      ["interfootball-world", 4],
      ["interfootball-all", 8],
      ["footballist-football", 4],
      ["besteleven-world", 5],
      ["besteleven-all", 7],
    ]);
    // 건너뛴 항목이 없으니 no-date·schema 경고도 없다
    expect(records.filter((r) => r.event === "collect.item.skip")).toEqual([]);
    expect(outcome.news.feedItems).toBe(
      RSS_INDEX.sources.reduce((sum, s) => sum + s.items.length, 0),
    );
    expect(outcome.news.excluded).toEqual(PLAN.excluded);
  });

  it("카드 상한(MAX_ITEMS_PER_RUN) — 쓸 수 있는 69건 → 창 안 64건(M1-10) → 고유 링크 52건 → 클러스터 45개(M1-13) → 점수 상위 N장(M1-14)", async () => {
    const { deps, records } = makeDeps({ limit: 40 });
    const outcome = await runCollect(deps);
    const file = readNews("2026-10-11");
    expect(file.cards).toHaveLength(40);
    expect(outcome.news.selected).toBe(40);
    expect(
      records.find((r) => r.event === "collect.select.done"),
    ).toMatchObject({
      usable: 69,
      inWindow: 64,
      unique: 52,
      duplicateLinks: 12,
      clusters: 45,
      clustered: 5,
      merged: 7,
      maxPublishers: 3,
      seenBefore: 0,
      seenBeforeExtra: 0,
      selected: 40,
      limit: 40,
      candidates: 45,
      existingCards: 0,
      slots: 40,
      ranked: 40,
      // 국내 몫 13 = floor(40 / 3) — 점수 순 상위 40에 국내 13장이 이미 있어 몫이 자리를 바꾸지 않는다
      selectedMix: expect.objectContaining({
        ko: 13,
        koQuota: 13,
        koByQuota: 0,
      }),
    });
    // 밀려난 5장 = 점수 하위 — 범위 근거 없는 K리그 기사 2건(충북청주·천안)·오래된(40시간+) 기사 3건
    const titles = file.cards.map((c) => c.t);
    expect(titles.some((t) => t.includes("충북청주"))).toBe(false);
    expect(titles.some((t) => t.includes("천안"))).toBe(false);
    expect(titles.some((t) => t.startsWith("Pochettino's youngsters"))).toBe(
      false,
    );
    // 파일 순서 = 카드의 가장 최근 출처 시각 내림차순(sortCards — 중요도가 모두 같을 때. 클러스터 카드는 대표 출처보다 늦은 출처가
    // 있을 수 있다)
    const times = file.cards.map((c) =>
      Math.max(...c.src.map((s) => Date.parse(s.at))),
    );
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("여러 소스의 같은 링크는 출처 1건 — 같은 링크의 대표는 설정 순서상 먼저 나온 소스, 대회 태그는 소스들의 합집합(M1-12), 같은 사건은 카드 1장(M1-13), 사건 대표는 Tier·weight·최신성(M1-15), 제목·링크는 피드 원문", async () => {
    // 상한을 넉넉히 줘서 클러스터 전부를 카드로 만든다(상한 적용은 위 테스트)
    const { deps, records } = makeDeps({ limit: 100 });
    const outcome = await runCollect(deps);
    const file = readNews("2026-10-11");
    const links = file.cards.flatMap((c) => c.src.map((s) => s.u));
    // 창 안 64건 중 같은 링크 12쌍(BBC 피드 사이 2쌍 + BBC 피드 안 1쌍 + 국내 섹션 ⊂ 전체기사 9쌍) → 고유 52건
    // → 같은 사건 7건이 다른 클러스터에 합쳐져 45장. 모든 고유 링크가 정확히 한 카드의 출처로 남는다.
    expect(file.cards).toHaveLength(45);
    expect(links).toHaveLength(52);
    expect(new Set(links).size).toBe(52);
    expect(new Set(file.cards.map((c) => c.id)).size).toBe(file.cards.length);
    expect(outcome.news.selected).toBe(45);
    expect(
      records.find((r) => r.event === "collect.select.done"),
    ).toMatchObject({
      usable: 69,
      inWindow: 64,
      unique: 52,
      duplicateLinks: 12,
      clusters: 45,
      selected: 45,
    });
    expect(outcome.news.cluster).toEqual({
      groups: 52,
      fresh: 45,
      multi: 5,
      merged: 7,
      maxPublishers: 3,
      existing: 0,
      additions: 0,
      existingSeenBefore: 0,
      seenBefore: 0,
      seenBeforeGroups: 0,
      seenBeforeExtra: 0,
    });

    // 원제목·링크 무수정(FR-20 수용 기준 — 엔티티 디코딩·공백 정리만) — 원문 항목은 fixture index에서 찾는다(`title`·`link`는
    // XML 파싱 값 = 원문). fixture 제목에는 파싱 뒤 남은 엔티티·줄바꿈·제어 문자가 없어 정리 결과 = 앞뒤 공백 정리뿐이다(전제 확인).
    // 출처마다 원문 링크. 해외·국내 모두 LLM을 거치지 않는다(ai:false, s:[] — D23).
    const indexByLink = new Map(
      RSS_INDEX.sources.flatMap((s) =>
        s.items.map((i) => [i.link, i] as const),
      ),
    );
    for (const card of file.cards) {
      const original = indexByLink.get(card.src[0]!.u);
      expect(original).toBeDefined();
      expect(original!.title).not.toMatch(/&[#a-zA-Z0-9]+;|[\t\n\r]|\p{Cc}/u);
      expect(card.t).toBe(original!.title.trim());
      expect(card.src[0]!.u).toBe(original!.link);
      expect(card.id).toBe(cardIdFor(original!.link));
      expect(card).toMatchObject({ ai: false, s: [] });
      for (const src of card.src) expect(indexByLink.has(src.u)).toBe(true);
    }

    // 대표(M1-15): 카드마다 src[0] = 출처 중 보존 기간 후순위(Athletic) → Tier → weight(같은 링크를 낸 소스 중 최대) → 최신 1위,
    // 나머지는 Tier → 최신 순.
    // 이 테스트가 소스 설정에서 따로 계산한다(card-lead.ts 함수를 쓰지 않음).
    const sourcesByLink = new Map<string, Source[]>();
    for (const s of RSS_INDEX.sources) {
      for (const i of s.items) {
        sourcesByLink.set(i.link, [
          ...(sourcesByLink.get(i.link) ?? []),
          byId(s.id),
        ]);
      }
    }
    const rankOf = (u: string, at: string) => {
      const srcs = sourcesByLink.get(u)!;
      return [
        srcs.some((x) => x.retentionDays !== undefined) ? 1 : 0, // 보존 기간 후순위(D32·M1-25)
        Math.min(...srcs.map((x) => x.tier)),
        -Math.max(...srcs.map((x) => x.weight)),
        -Date.parse(at),
      ];
    };
    const before = (a: number[], b: number[]) => {
      for (let k = 0; k < a.length; k += 1) {
        if (a[k] !== b[k]) return a[k]! < b[k]!;
      }
      return false;
    };
    for (const card of file.cards) {
      const [lead, ...rest] = card.src;
      for (const other of rest) {
        expect(
          before(rankOf(other.u, other.at), rankOf(lead!.u, lead!.at)),
        ).toBe(false);
      }
      for (let k = 1; k < rest.length; k += 1) {
        const [a, b] = [rest[k - 1]!, rest[k]!];
        expect(a.tier <= b.tier).toBe(true);
        if (a.tier === b.tier)
          expect(Date.parse(a.at) >= Date.parse(b.at)).toBe(true);
      }
      if (card.lang !== "ko")
        expect(card.lang).toBe(sourcesByLink.get(lead!.u)![0]!.lang);
    }
    // 대표가 클러스터 첫 묶음(설정 순서)과 달라진 카드 — 국내 3매체 2묶음(같은 Tier·weight에서 더 최신인 베스트일레븐)
    expect(
      records.find((r) => r.event === "collect.select.done"),
    ).toMatchObject({ leadReordered: 2 });
    expect(records.some((r) => r.event === "collect.card.skip")).toBe(false);

    // 같은 사건(M1-13): 국내 3매체가 함께 보도한 아틀레티코 2-1 알라베스 → 카드 1장, 출처 3건(매체마다 1건).
    // 대표(M1-15) = 셋 다 Tier 3 · weight는 인터풋볼 전체기사 1 = 베스트일레븐(WORLD 1·전체기사 0.5 중 최대 1) > 풋볼리스트 0.5
    // → 최신성: 베스트일레븐 01:14:40 KST > 인터풋볼 01:11:36 KST. 나머지는 최신순(풋볼리스트 01:19:02 → 인터풋볼).
    // 제목은 대표 출처의 피드 원문 그대로(예전 대표 = 설정 순서상 처음 인터풋볼 '[라리가 REVIEW] …').
    const alaves = file.cards.find((c) =>
      c.src.some(
        (s) =>
          s.u ===
          "https://www.interfootball.co.kr/news/articleView.html?idxno=696151",
      ),
    )!;
    expect(alaves.src.map((s) => s.n)).toEqual([
      "베스트일레븐",
      "풋볼리스트",
      "인터풋볼",
    ]);
    expect(alaves.src[0]!.u).toBe(
      "https://www.besteleven.com/news/articleView.html?idxno=313012",
    );
    expect(alaves.t).toBe(indexByLink.get(alaves.src[0]!.u)!.title);
    expect(alaves.t.startsWith("‘이강인 33분 소화’")).toBe(true);
    expect(alaves.id).toBe(cardIdFor(alaves.src[0]!.u));
    // 해외: BBC(경기 영상) + The Athletic 경기 기사(합성 제목 — fixtures/rss README, D32·D42) → 카드 1장.
    // 다른 언어(BBC 영어 + Relevo 스페인어)도 같은 사건이면 1장
    const spurs = file.cards.find((c) =>
      c.src.some((s) => s.u.includes("/videos/crz9zdl0g04zo")),
    )!;
    expect(spurs.src.map((s) => s.n)).toEqual(["BBC Sport", "The Athletic"]);
    const mbappe = file.cards.find((c) => c.t.startsWith("Mourinho calls"))!;
    expect(mbappe.src.map((s) => s.n)).toEqual(["BBC Sport", "Relevo"]);
    // 국내·해외 같은 사건(맨유 1-1 토트넘)은 합치지 않는다(D30 — 연결 줄은 M1-31)
    const spursKo = file.cards.find((c) => c.t.includes("솔란케 극장골로"))!;
    expect(spursKo.lang).toBe("ko");
    expect(spursKo.id).not.toBe(spurs.id);

    // BBC Football(대회 태그 없음)과 Premier League 피드(EPL)에 함께 있는 링크 → 먼저 나온 BBC Football 항목이 대표,
    // 대회 태그는 두 소스의 합집합(M1-02 이월 → M1-12: 예전에는 먼저 나온 소스의 [] 그대로라 EPL을 잃었다)
    const shared = file.cards.find((c) =>
      c.src[0]!.u.includes("/articles/cqn73g3pvezdo"),
    )!;
    expect(shared.comp).toEqual(["EPL"]);
    expect(shared.src).toEqual([
      {
        n: "BBC Sport",
        u: "https://www.bbc.co.uk/sport/football/articles/cqn73g3pvezdo?at_medium=RSS&at_campaign=rss",
        at: expect.any(String),
        tier: 2,
      },
    ]);
    expect(outcome.news.dedup).toEqual({
      items: 64,
      unique: 52,
      duplicates: 12,
      multiSource: 11, // 피드 안 중복(BBC Football cqzjx3z4ljr0o) 1쌍은 소스가 하나
      seenBefore: 0,
    });
    // Champions League(UCL)와 European(4개 리그)에 함께 있는 링크는 10-07 기사라 51시간 창 밖 — 카드 없음(M1-10)
    expect(
      file.cards.some((c) => c.src[0]!.u.includes("/articles/ckrey77jq1n7o")),
    ).toBe(false);
    expect(outcome.news.windowStats).toMatchObject({
      total: 69,
      inWindow: 64,
      outOfWindow: 5,
      futureClamped: 0,
      future: 0,
    });

    // 국내: 섹션 피드(설정 앞)와 전체기사 피드에 함께 있는 링크 → 섹션 피드 카드(출처명은 매체명), 발행 시각은 KST → UTC
    const interfootball = file.cards.find(
      (c) =>
        c.src[0]!.u ===
        "https://www.interfootball.co.kr/news/articleView.html?idxno=696174",
    )!;
    expect(interfootball).toMatchObject({
      lang: "ko",
      ai: false,
      s: [],
      src: [
        {
          n: "인터풋볼",
          u: "https://www.interfootball.co.kr/news/articleView.html?idxno=696174",
          at: "2026-10-11T04:55:17.000Z", // 2026-10-11 13:55:17 KST
          tier: 3,
        },
      ],
    });
  });

  it("카드 상한(--limit 5)은 소스를 합친 뒤 점수 순으로 적용한다(M1-14, FR-06) — 빅클럽·등록 한국 선수·보도 매체 수가 위로", async () => {
    const { deps, records } = makeDeps({ limit: 5 });
    const outcome = await runCollect(deps);
    const file = readNews("2026-10-11");
    expect(file.cards).toHaveLength(5);
    expect(outcome.news.selected).toBe(5);
    expect(outcome.news.score).toMatchObject({
      candidates: 45,
      existingCards: 0,
      slots: 5,
      domesticQuota: 1, // floor(5 / 3) — 순수 점수 순 상위 5에 국내가 3장이라 몫이 자리를 바꾸지 않는다
      ranked: 5,
      domesticByQuota: 0,
      transferBoost: 1,
      keywordsError: null,
    });
    const score = outcome.news.score!;
    expect(score.top!).toBeGreaterThanOrEqual(score.cutoff!);
    expect(score.cutoff!).toBeGreaterThanOrEqual(score.firstOut!);
    // 상위 5 = 맨유-토트넘(BBC+Athletic 2곳, 빅클럽 2) · AC 밀란 이적설(빅클럽+이적) · 김민재·설영우 분데스(국내 3곳, 한국 선수)
    // · 이강인 라리가(국내 3곳) · 이강인-레알(한국 선수+빅클럽). 최신순이었다면 ESPN 일괄 갱신 시각 기사 4건이 들었다.
    // 국내 3곳 두 카드의 제목은 대표(M1-15 — 같은 Tier·weight에서 가장 최신인 베스트일레븐) 원문이다.
    const titles = file.cards.map((c) => c.t);
    for (const head of LIMIT5_HEADS) {
      expect(titles.some((t) => t.startsWith(head))).toBe(true);
    }
    expect(file.cards.some((c) => c.src[0]!.n === "ESPN")).toBe(false);
    // 파일 순서 = 화면 순서: 중요도(지금은 모두 기본 3) → 가장 최근 출처 시각 내림차순
    expect(new Set(file.cards.map((c) => c.imp))).toEqual(new Set([3]));
    const times = file.cards.map((c) =>
      Math.max(...c.src.map((s) => Date.parse(s.at))),
    );
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(
      records.find((r) => r.event === "collect.select.done"),
    ).toMatchObject({
      candidates: 45,
      existingCards: 0,
      slots: 5,
      ranked: 5,
      selected: 5,
      limit: 5,
      scoreTop: score.top,
      scoreCutoff: score.cutoff,
      scoreFirstOut: score.firstOut,
      transferBoost: 1,
      selectedMix: {
        ko: 3,
        koQuota: 1,
        koByQuota: 0,
        korean: 3,
        bigClub: 5,
        ucl: 0,
        transfer: 1,
        multiPublisher: 3,
        noScope: 0,
        clamped: 0,
      },
    });
  });

  it("국내 최소 몫(D44): 상한의 1/3을 국내 클러스터 점수 순으로 먼저 채운다 — 순수 점수 순 15위(해외)가 국내 5번째에 자리를 내준다", async () => {
    const { deps, records } = makeDeps({ limit: 15 });
    const outcome = await runCollect(deps);
    const file = readNews("2026-10-11");
    expect(file.cards).toHaveLength(15);
    expect(outcome.news.score).toMatchObject({
      slots: 15,
      domesticQuota: 5,
      ranked: 15,
      domesticByQuota: 1,
    });
    expect(file.cards.filter((c) => c.lang === "ko")).toHaveLength(5);
    const titles = file.cards.map((c) => c.t);
    // 몫으로 들어온 국내 카드(점수는 자리 밖) · 그 대신 밀려난 해외 카드(점수로는 15위)
    expect(titles.some((t) => t.startsWith("‘친정팀’ 맨시티에"))).toBe(true);
    expect(
      titles.some((t) => t.startsWith("Palmer signs new Chelsea contract")),
    ).toBe(false);
    const score = outcome.news.score!;
    expect(score.cutoff!).toBeLessThan(score.firstOut!); // 몫 때문에 점수가 더 낮은 국내 카드가 들었다
    expect(
      records.find((r) => r.event === "collect.select.done"),
    ).toMatchObject({
      selectedMix: expect.objectContaining({
        ko: 5,
        koQuota: 5,
        koByQuota: 1,
      }),
    });
  });

  describe("같은 날 재실행 — 일일 카드 상한은 그날 파일 기준(D44)", () => {
    /** 오늘 파일에 기존 카드를 미리 쓴다 — 링크가 피드에 없어(수집 창 밖과 같다) 클러스터 후보로 다시 들어오지 않는다 */
    function seedToday(count: number, domestic: number): NewsCard[] {
      const bySource = (id: string) => SOURCES.find((s) => s.id === id)!;
      const cards = Array.from({ length: count }, (_, i) => {
        const ko = i < domestic;
        const source = bySource(
          ko ? "interfootball-world" : "bbc-sport-football",
        );
        return buildCard(
          {
            title: ko ? `오늘 아침 국내 기사 ${i}` : `Morning story ${i}`,
            url: `https://example.com/morning/${i}`,
            publishedAt: "2026-10-10T12:00:00.000Z",
            summary: null,
            source: source.id,
            author: null,
            authors: [],
            lang: source.lang,
          },
          source,
          "2026-10-10T21:30:00.000Z",
        );
      });
      writeFileSync(
        newsFilePath(dataDir, "2026-10-11"),
        serializeNewsFile(
          buildNewsFile({
            date: "2026-10-11",
            generatedAt: "2026-10-10T21:31:00.000Z",
            runId: "collect-prod-20261010T213000Z-0000",
            cards,
          }),
        ),
      );
      return cards;
    }

    beforeEach(() => {
      mkdirSync(path.join(dataDir, "news"), { recursive: true });
    });

    it("기존 카드 40장(모두 창 밖)이면 새 카드는 5장만 — 파일 45장, 국내 몫이 모자라 새 자리 5장이 모두 국내", async () => {
      const morning = seedToday(40, 0);
      const { deps, records } = makeDeps({ limit: 45 });
      const outcome = await runCollect(deps);
      const file = readNews("2026-10-11");
      expect(file.cards).toHaveLength(45);
      expect(outcome.news.added).toBe(5);
      expect(outcome.news.score).toMatchObject({
        candidates: 45,
        existingCards: 40,
        slots: 5,
        domesticQuota: 5, // 하루 몫 15 − 기존 국내 0, 자리 5 이하
        ranked: 5,
      });
      const added = file.cards.filter(
        (c) => !morning.some((m) => m.id === c.id),
      );
      expect(added.map((c) => c.lang)).toEqual(Array(5).fill("ko"));
      // 기존 카드는 그대로(id·created·제목)
      for (const card of morning) {
        expect(file.cards.find((c) => c.id === card.id)).toEqual(card);
      }
      expect(
        records.find((r) => r.event === "collect.select.done"),
      ).toMatchObject({
        existingCards: 40,
        slots: 5,
        selectedMix: expect.objectContaining({ ko: 5, koQuota: 5 }),
      });
    });

    it("기존 국내 카드가 하루 몫(15)을 채웠으면 남은 자리는 순수 점수 순 — 파일 45장", async () => {
      seedToday(40, 15);
      const { deps } = makeDeps({ limit: 45 });
      const outcome = await runCollect(deps);
      const file = readNews("2026-10-11");
      expect(file.cards).toHaveLength(45);
      expect(outcome.news.score).toMatchObject({
        slots: 5,
        domesticQuota: 0,
        domesticByQuota: 0,
      });
      // --limit 5 첫 실행과 같은 상위 5(국내 3·해외 2)
      const titles = file.cards.map((c) => c.t);
      for (const head of LIMIT5_HEADS) {
        expect(titles.some((t) => t.startsWith(head))).toBe(true);
      }
    });

    it("기존 카드가 상한 이상이면 새 카드 0장 — 파일은 그대로", async () => {
      seedToday(45, 0);
      const before = readFileSync(newsFilePath(dataDir, "2026-10-11"), "utf8");
      const { deps, records } = makeDeps({ limit: 45 });
      const outcome = await runCollect(deps);
      expect(outcome.exitCode).toBe(0);
      expect(outcome.news.added).toBe(0);
      expect(outcome.news.score).toMatchObject({ slots: 0, ranked: 0 });
      expect(readFileSync(newsFilePath(dataDir, "2026-10-11"), "utf8")).toBe(
        before,
      );
      expect(records.some((r) => r.event === "collect.news.unchanged")).toBe(
        true,
      );
    });
  });

  it("소스 결과·카드는 응답 완료 순서와 무관하다 — 설정 앞쪽 소스가 늦게 응답해도 같은 파일", async () => {
    const base = makeDeps();
    const baseOutcome = await runCollect(base.deps);
    const baseFile = readNews("2026-10-11");
    // 두 번째 실행을 같은 빈 상태에서 — 발행 파일과 그 카드의 기억(cache/seen-urls.json, M1-12)을 함께 지운다
    rmSync(path.join(dataDir, "news"), { recursive: true, force: true });
    rmSync(path.join(dataDir, "cache"), { recursive: true, force: true });

    // 설정 앞쪽일수록 늦게(실제 시간 수 ms) — 완료 순서가 설정 순서와 거꾸로
    const order = FEEDS.map((s) => s.id);
    const reversed = makeDeps(
      {},
      fakeFetch({}, SOURCES, (id) => (order.length - order.indexOf(id)) * 3),
    );
    const outcome = await runCollect(reversed.deps);
    const completion = reversed.records
      .filter((r) => r.event === "collect.source.fetch")
      .map((r) => r.source);
    expect(completion).not.toEqual(order);
    const strip = (o: { elapsedMs: number }) => ({ ...o, elapsedMs: 0 });
    expect(outcome.news.sources.map(strip)).toEqual(
      baseOutcome.news.sources.map(strip),
    );
    // runId만 실행마다 다르다(무작위 접미사) — 카드는 순서까지 같다
    expect(readNews("2026-10-11").cards).toEqual(baseFile.cards);
  });
});

// ─── 실패 격리 ───────────────────────────────────────────────────────────

describe("runCollect — 소스별 실패 격리", () => {
  const failures: Record<string, Route> = {
    "bbc-sport-premier-league": new Response("busy", { status: 503 }),
    "espn-soccer": "<html><body>not a feed</body></html>",
    "the-athletic-football": new TypeError("fetch failed"),
    "daily-briefing": () => brokenBodyResponse(),
  };

  it("실패한 소스만 건너뛰고 나머지 카드는 발행한다(partial, exit 0), 브리핑도 진행", async () => {
    const { deps, records, llmRequests } = makeDeps({}, fakeFetch(failures));
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("partial");
    expect(outcome.news.ok).toBe(true);
    expect(outcome.brief.state).toBe("done");
    expect(llmRequests).toHaveLength(1);

    // 503·네트워크·본문 끊김은 1회 재시도 후 실패, 파싱 실패는 재시도 없음(M1-03)
    const failed = outcome.news.sources.filter((s) => !s.ok);
    expect(
      failed.map((s) => [
        s.id,
        s.errorType,
        s.status ?? null,
        s.items,
        s.retries,
      ]),
    ).toEqual([
      ["bbc-sport-premier-league", "http-5xx", 503, 0, 1],
      ["the-athletic-football", "network", null, 0, 1],
      ["espn-soccer", "parse", null, 0, 0],
      ["daily-briefing", "network", 200, 0, 1],
    ]);
    expect(outcome.news.sources.filter((s) => s.ok)).toHaveLength(10);

    // 실패 소스의 카드는 없고, 성공 소스의 카드는 있다
    const file = readNews("2026-10-11");
    const hosts = new Set(file.cards.map((c) => new URL(c.src[0]!.u).host));
    expect(hosts.has("www.nytimes.com")).toBe(false);
    expect(hosts.has("www.espn.com")).toBe(false);
    expect(hosts.has("www.bbc.co.uk")).toBe(true);
    expect(hosts.has("www.gianlucadimarzio.com")).toBe(true);

    // 로그는 완료 순서로 나온다 — 집합으로 비교
    const fails = records.filter((r) => r.event === "collect.source.fail");
    expect(fails.map((r) => [r.source, r.errorType, r.retries]).sort()).toEqual(
      failed.map((s) => [s.id, s.errorType, s.retries]).sort(),
    );
    expect(
      records
        .filter((r) => r.event === "collect.source.retry")
        .map((r) => r.source)
        .sort(),
    ).toEqual([
      "bbc-sport-premier-league",
      "daily-briefing",
      "the-athletic-football",
    ]);
    // 로그에 응답 본문을 남기지 않는다
    expect(JSON.stringify(records)).not.toContain("not a feed");
    expect(JSON.stringify(records)).not.toContain('"busy"');
  });

  it("모든 피드가 실패하면 뉴스 실패(exit 1) — 브리핑(LLM)을 부르지 않고 경기 데이터는 취소, 파일도 쓰지 않는다", async () => {
    const all = Object.fromEntries(
      FEEDS.map((s) => [s.id, new Response("x", { status: 500 })] as const),
    );
    const fetcher = fakeFetch(all);
    const gate = cancelGate();
    const { deps, llmCreated, records } = makeDeps(
      { footballDataSleep: gate.sleep },
      fetcher,
    );
    deps.logger = gate.logger(records);
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.status).toBe("failed");
    expect(outcome.news.error).toMatch(/모든 피드 소스 수집 실패\(14개\)/);
    expect(outcome.news.sources).toHaveLength(14);
    expect(outcome.brief).toEqual({
      state: "skipped",
      reason: "news-failed",
      inputMatches: 0,
    });
    expect(llmCreated()).toBe(0);
    // 경기 데이터는 피드 수집과 병렬로 시작했다가 뉴스 실패로 취소된다(M1-48) — 첫 요청(경기) 이하, 순위는 요청하지 않는다
    const fdCalls = fetcher.calls.filter((url) =>
      url.startsWith(FOOTBALL_DATA_BASE_URL),
    );
    expect(fdCalls.length).toBeLessThanOrEqual(1);
    expect(fdCalls.some((url) => url.includes("/standings"))).toBe(false);
    expect(outcome.matchData).not.toBeNull();
    expect(newsFiles()).toEqual([]);
    expect(records.find((r) => r.event === "collect.news.fail")).toMatchObject({
      reason: "all-sources-failed",
      sources: 14,
    });
  });

  it("수집 대상 피드가 0개면(모두 비활성·검색형) 요청 없이 뉴스 실패(exit 1)", async () => {
    const fetcher = fakeFetch();
    const { deps } = makeDeps(
      {
        loadSources: async () => [
          byId("sky-sports-football"),
          byId("gdelt-doc"),
          { ...byId("gdelt-doc"), id: "gdelt-on", enabled: true },
        ],
      },
      fetcher,
    );
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.news.error).toMatch(/수집 대상 피드 소스가 없다/);
    expect(outcome.news.excluded.map((e) => [e.id, e.reason])).toEqual([
      ["sky-sports-football", "disabled"],
      ["gdelt-doc", "disabled"],
      ["gdelt-on", "search-type"],
    ]);
    expect(fetcher.calls).toEqual([]);
    // 수집 대상이 정해지기 전에 실패하면 경기 데이터 단계를 시작하지 않는다(M1-48 병렬 시작 지점)
    expect(outcome.matchData).toBeNull();
  });

  it("소스 설정을 읽지 못하면 뉴스 실패(exit 1)", async () => {
    const fetcher = fakeFetch();
    const { deps, records } = makeDeps(
      {
        loadSources: async () => {
          throw new ConfigFileError(
            "configs/sources.json 스키마 검증 실패(1건)",
          );
        },
      },
      fetcher,
    );
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.status).toBe("failed");
    expect(fetcher.calls).toEqual([]);
    expect(
      records.find((r) => r.event === "collect.source.config"),
    ).toBeDefined();
  });

  it("실행 기록(live·dry): RunLog.sources에 소스마다 id·ok·items + 성공은 usable(창 안 건수)·실패는 error(종류), 상태 partial (D35)", async () => {
    const fake = fakeLiveTransport(
      JSON.stringify({
        l: [{ t: "Chelsea가 Bournemouth를 5-1로 꺾었다.", r: ["m560595"] }],
      }),
    );
    const { deps } = makeDeps(
      {
        llmMode: "live",
        dry: true,
        createLlm: () =>
          createLlmClient({
            mode: "live",
            model: "claude-haiku-5-5",
            transport: fake.transport,
            logger: () => undefined,
          }),
      },
      fakeFetch({ relevo: new Response("gone", { status: 410 }) }),
    );
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(fake.params).toHaveLength(1);
    const runs = RunsDevFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs-dev.json"), "utf8")),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("partial");
    const inWindow = outcome.news.windowStats!.bySource;
    expect(runs[0]!.sources).toEqual(
      outcome.news.sources.map((s) =>
        s.ok
          ? {
              id: s.id,
              ok: true,
              items: s.items,
              usable: inWindow[s.id]?.inWindow ?? 0,
            }
          : { id: s.id, ok: false, items: 0, error: s.errorType },
      ),
    );
    expect(runs[0]!.sources.find((s) => s.id === "relevo")).toEqual({
      id: "relevo",
      ok: false,
      items: 0,
      error: "http-4xx",
    });
    // usable = 정규화·창 적용 뒤(중복 제거 전) — 원문 items보다 클 수 없고, 합은 창 안 전체와 같다
    for (const entry of runs[0]!.sources) {
      if (entry.ok) expect(entry.usable).toBeLessThanOrEqual(entry.items);
    }
    expect(runs[0]!.sources.reduce((sum, s) => sum + (s.usable ?? 0), 0)).toBe(
      outcome.news.windowStats!.inWindow,
    );
    expect(runs[0]!.collected).toBe(outcome.news.feedItems);
    expect(newsFiles()).toEqual([]);
  });

  it("단계 시간 예산을 넘으면 시작하지 못한 소스는 budget — 실행은 partial, RunLog.sources에 {id, ok:false, items:0, error:'budget'}", async () => {
    // 첫 소스 요청 순간 가상 시계가 예산(90초)을 넘긴다 → 나머지 13개는 시작하지 않는다
    const v = virtualClock();
    const fetcher = fakeFetch();
    const first = FEEDS[0]!;
    const fake = fakeLiveTransport(
      JSON.stringify({
        l: [{ t: "Chelsea가 Bournemouth를 5-1로 꺾었다.", r: ["m560595"] }],
      }),
    );
    const { deps, records } = makeDeps(
      {
        llmMode: "live",
        dry: true,
        feedClock: v.clock,
        fetch: (url, init) => {
          if (url === first.url) v.advance(100_000);
          return fetcher.fetch(url, init);
        },
        createLlm: () =>
          createLlmClient({
            mode: "live",
            model: "claude-haiku-5-5",
            transport: fake.transport,
            logger: () => undefined,
          }),
      },
      fetcher,
    );
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("partial");
    expect(
      outcome.news.sources.map((s) => [s.id, s.ok, s.errorType ?? null]),
    ).toEqual(
      FEEDS.map((s, i) =>
        i === 0 ? [s.id, true, null] : [s.id, false, "budget"],
      ),
    );
    // 시작하지 못한 소스는 요청하지 않았다
    const feedCalls = fetcher.calls.filter(
      (url) => !url.startsWith(FOOTBALL_DATA_BASE_URL),
    );
    expect(feedCalls).toEqual([first.url]);

    const runs = RunsDevFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs-dev.json"), "utf8")),
    );
    expect(runs[0]!.status).toBe("partial");
    expect(runs[0]!.sources).toEqual(
      FEEDS.map((s, i) =>
        i === 0
          ? {
              id: s.id,
              ok: true,
              items: outcome.news.sources[0]!.items,
              usable: outcome.news.windowStats!.bySource[s.id]?.inWindow ?? 0,
            }
          : { id: s.id, ok: false, items: 0, error: "budget" },
      ),
    );
    expect(runs[0]!.sources[0]!.items).toBeGreaterThan(0);
    expect(
      records.find((r) => r.event === "collect.feeds.budget"),
    ).toMatchObject({ sources: FEEDS.slice(1).map((s) => s.id) });
  });
});

// ─── summarize 무관 LLM 미전송 (D23) ─────────────────────────────────────

describe("summarize 값과 무관하게 기사는 LLM에 보내지 않는다 (D23, plan M1-02)", () => {
  it("summarize:true인 소스가 있어도 원제목+링크 카드(ai:false, s:[])이고, 브리핑 요청에 피드 제목·링크가 없다", async () => {
    const bbcSummarize = { ...byId("bbc-sport-football"), summarize: true };
    const athletic = byId("the-athletic-football");
    const sources = [bbcSummarize, athletic];
    const { deps, llmRequests } = makeDeps(
      { loadSources: async () => sources },
      fakeFetch({}, sources),
    );
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.news.sources.map((s) => [s.id, s.ok])).toEqual([
      ["bbc-sport-football", true],
      ["the-athletic-football", true],
    ]);

    const file = readNews("2026-10-11");
    expect(file.cards.length).toBeGreaterThan(0);
    for (const card of file.cards) {
      expect(card).toMatchObject({ ai: false, s: [] });
    }

    // 브리핑은 정형 경기 데이터만 — 두 피드의 모든 원문 항목(선별되지 않은 것 포함)의 제목·링크가 요청에 없다
    expect(llmRequests).toHaveLength(1);
    const request = llmRequests[0]!;
    expect(Object.keys(JSON.parse(request.user))).toEqual([
      "briefDate",
      "matches",
    ]);
    const body = `${request.system}\n${request.user}`;
    for (const id of ["bbc-sport-football", "the-athletic-football"]) {
      for (const item of await parseFeedXml(FEED_XML.get(id)!)) {
        expect(body).not.toContain(item.title!.trim());
        expect(body).not.toContain(item.link!.trim());
      }
    }
    for (const host of ["bbc.co.uk", "nytimes.com", "/athletic/"]) {
      expect(request.user).not.toContain(host);
    }
  });
});

// ─── 검색형 소스 (M1-06 — 계획만, 실행 없음) ─────────────────────────────

describe("runCollect — 검색형 소스는 계획만 하고 요청하지 않는다 (M1-06, D32)", () => {
  const GDELT_URL = byId("gdelt-doc").url;
  const searchRecords = (records: LogRecord[]) =>
    records.filter((r) => r.event.startsWith("collect.search."));

  it("현재 configs — 활성 쿼리 0개면 collect.search.skip 한 줄로 끝난다", async () => {
    const { deps, records, fetcher } = makeDeps();
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("success");
    expect(searchRecords(records)).toEqual([
      expect.objectContaining({
        level: "info",
        event: "collect.search.skip",
        reason: "no-active-queries",
        queries: 9,
        maxEnabled: 10,
        byReason: { "query-disabled": 9 },
      }),
    ]);
    expect(outcome.news.search).toMatchObject({
      active: 0,
      skippedSources: [],
    });
    expect(outcome.news.search?.excluded).toHaveLength(9);
    expect(fetcher.calls.some((url) => url.startsWith(GDELT_URL))).toBe(false);
  });

  it("활성 쿼리가 생겨도 어댑터가 없으면 경고만 남기고 건너뛴다 — 검색 요청 없음, 발행·상태는 그대로", async () => {
    const sources = SOURCES.map((s) =>
      s.id === "gdelt-doc" ? { ...s, enabled: true } : s,
    );
    const { deps, records, fetcher } = makeDeps(
      {
        loadSources: async () => sources,
        loadSearchQueries: async () => ({
          maxEnabled: 10,
          queries: [
            {
              id: "gd-on",
              source: "gdelt-doc",
              q: '"Lee Kang-in"',
              lang: "en",
              purpose: "korean",
              enabled: true,
            },
            {
              id: "gd-off",
              source: "gdelt-doc",
              q: '"Kim Min-jae"',
              lang: "en",
              purpose: "korean",
              enabled: false,
            },
            {
              id: "wrong-source",
              source: "bbc-sport-football",
              q: "transfer",
              lang: "en",
              purpose: "transfer",
              enabled: true,
            },
          ],
        }),
      },
      fakeFetch({}, sources),
    );
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("success");
    expect(outcome.news.ok).toBe(true);
    // 꺼 둔 쿼리(gd-off)는 debug라 기본 출력에 없다. 설정이 어긋난 쿼리·어댑터 없는 소스는 warn
    expect(
      searchRecords(records).map((r) => [
        r.level,
        r.event,
        r.source,
        r.reason,
        r.query ?? r.queries,
      ]),
    ).toEqual([
      [
        "warn",
        "collect.search.query.skip",
        "bbc-sport-football",
        "source-not-search",
        "wrong-source",
      ],
      ["warn", "collect.search.skip", "gdelt-doc", "no-adapter", 1],
    ]);
    expect(outcome.news.search).toMatchObject({
      active: 1,
      skippedSources: [
        { source: "gdelt-doc", queries: 1, reason: "no-adapter" },
      ],
    });
    expect(fetcher.calls.some((url) => url.startsWith(GDELT_URL))).toBe(false);
  });

  it("검색 쿼리 설정을 읽지 못해도 피드 수집·발행은 계속된다(collect.search.fail)", async () => {
    const { deps, records } = makeDeps({
      loadSearchQueries: async () => {
        throw new ConfigFileError(
          "configs/search-queries.json 스키마 검증 실패(1건) — npm run validate로 확인할 것",
        );
      },
    });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.news.ok).toBe(true);
    expect(outcome.news.added).toBeGreaterThan(0);
    expect(outcome.news.search?.error).toMatch(/search-queries\.json/);
    expect(searchRecords(records)).toEqual([
      expect.objectContaining({
        level: "error",
        event: "collect.search.fail",
        reason: "config",
      }),
    ]);
  });
});
