/**
 * `npm run collect` 파이프라인 본체 (M1-01 얇은 수직 슬라이스, PRD §10, D23·D24·D28).
 *
 *   ① 뉴스: configs/sources.json의 일일 수집 대상 피드 전부(M1-02 로더 — enabled && terms_checked, rss·journalist·aggregator)
 *      → 소스별 격리 수집 → 합쳐서 링크 중복 제거·최신순 상위 N건 → 원제목 카드(최소 분류) → data/news/<KST 발행일>.json
 *   ② 브리핑: football-data 6개 대회 전날 종료 경기 → 정형 입력 → `callSingle` 1요청 → **출력은 로그만**(저장 M1-19)
 *   ③ 실행 기록: LLM 실호출이 있었으면 dry여도 기록(prod → runs.json, dev → runs-dev.json). prod는 dry가 아니면 항상 기록.
 *
 * 실패 격리: 소스 하나의 실패(받기·파싱·예상 밖 오류)는 그 소스만 건너뛴다(상태 partial). 피드 받기는 scripts/lib/feed-collect.ts가
 * 호스트별 병렬·재시도(1회)·단계 시간 예산(90초)으로 하고, 결과는 설정 순서로 돌려준다(M1-03). 실패 소스 이슈는 만들지 않는다 —
 * 연속 실패·0건 이슈는 M1-11이 runs 기록의 소스별 `{id, ok, items}`로 판단한다.
 * 브리핑 단계(브리핑 설정·football-data·예산·LLM·출력 형식)의 어떤 실패도 뉴스 발행을 멈추지 않는다(FR-26 정신).
 * 뉴스 단계가 통째로 실패하면(소스 설정 오류·수집 대상 0개·모든 소스 실패·기존 파일 손상) exitCode 1 — Actions가
 * 커밋하지 않고 이슈를 만든다.
 * 이때는 브리핑(LLM 호출)도 하지 않는다 — 커밋되지 않는 실행의 LLM 비용 기록이 사라지지 않게(M1-27까지).
 *
 * I/O(fetch·시각·파일 위치·LLM 클라이언트·출력)는 모두 주입한다 — 테스트는 fixtures와 임시 폴더로 네트워크 없이 돈다.
 * 다음 작업이 갈아끼울 자리: 기자 채널 작성자 필터(M1-04) · 정규화(M1-09) · 소스 건강도 이슈(M1-11) · 중복제거~점수화(M1-10~14) ·
 * 분류(M1-17) · 브리핑 입력·템플릿(M1-19) · 프롬프트(M1-20) · 검증·강등(M1-23·M1-45) · 비용 가드(M1-22) · runs 기록(M1-27) ·
 * 계절별 마감(M1-47) · football-data 어댑터(M1-44).
 */
import {
  CompetitionsFileSchema,
  type NewsFile,
  type RunEnv,
  type RunLog,
  type Source,
} from "@/lib/schema";
import { kstDate, nowUtcIso } from "@/lib/time";

import {
  briefInputWindow,
  buildBriefInput,
  footballDataDateRange,
  serializeBriefInput,
  type BriefInput,
} from "./brief-input";
import {
  buildBriefRequest,
  estimateBriefCost,
  loadSlicePrompt,
  parseBriefOutput,
} from "./brief";
import { cardIdFor } from "./card-id";
import type { LlmMode } from "./cli-args";
import { readConfigFile } from "./config-files";
import {
  checkBudgetFromFiles,
  formatEstimate,
  formatUsd,
  makeRunId,
  recordRun,
  type Budgets,
} from "./cost";
import {
  collectFeedSources,
  resolveFeedPolicy,
  type FeedClock,
  type FeedPolicy,
  type SourceOutcome,
} from "./feed-collect";
import {
  DEFAULT_LLM_MODEL,
  LlmMockFixtureError,
  type LlmClient,
  type LlmRequest,
  type LlmResult,
} from "./llm";
import type { Logger } from "./logger";
import {
  buildCard,
  buildNewsFile,
  mergeCards,
  newsFilePath,
  readNewsFile,
  selectLatest,
  serializeNewsFile,
  writeNewsFile,
} from "./news-file";
import {
  createFootballDataClient,
  toFinishedResults,
} from "./providers/football-data";
import type { FetchLike } from "./rss";
import {
  loadSources,
  planDailySources,
  type DailySourcePlan,
  type SourceExclusion,
  type SourceExclusionReason,
} from "./sources";

// ─── 설정 ────────────────────────────────────────────────────────────────

/** M1-01 슬라이스 기본 카드 수(`--limit` 미지정). M1-14 선별이 들어오면 MAX_ITEMS_PER_RUN(45)으로 돌아간다 */
export const SLICE_DEFAULT_LIMIT = 5;

/** `MAX_ITEMS_PER_RUN` 기본값(일일 카드 선별 상한, CLAUDE.md §10) */
export const DEFAULT_MAX_ITEMS_PER_RUN = 45;

/** 실행 환경 — Actions(GITHUB_ACTIONS=true)면 prod(runs.json), 그 밖(로컬)은 dev(runs-dev.json) */
export function resolveRunEnv(
  env: Readonly<Record<string, string | undefined>>,
): RunEnv {
  return env.GITHUB_ACTIONS === "true" ? "prod" : "dev";
}

/** `MAX_ITEMS_PER_RUN` → 양의 정수(빈 값·미지정은 45). 형식이 틀리면 던진다 */
export function resolveMaxItems(raw: string | undefined): number {
  const value = raw?.trim();
  if (!value) return DEFAULT_MAX_ITEMS_PER_RUN;
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(
      `MAX_ITEMS_PER_RUN은 양의 정수여야 한다 (받은 값: "${value}")`,
    );
  }
  return Number(value);
}

/** 이번 실행의 카드 상한 — `--limit`(없으면 슬라이스 기본 5), MAX_ITEMS_PER_RUN을 넘지 않는다 */
export function resolveCardLimit(
  argLimit: number | null,
  maxItems: number,
): number {
  return Math.min(argLimit ?? SLICE_DEFAULT_LIMIT, maxItems);
}

// ─── 의존성·결과 ─────────────────────────────────────────────────────────

/** 브리핑 전용 설정 */
export interface BriefConfig {
  /** LLM_MODEL(기본 claude-haiku-5-5) */
  model: string;
  budgets: Budgets;
}

export interface CollectDeps {
  /** 저장소 루트(configs/·fixtures/ 프롬프트) */
  rootDir: string;
  /** data/ 폴더(테스트는 임시 폴더) */
  dataDir: string;
  env: RunEnv;
  llmMode: LlmMode;
  dry: boolean;
  /** 카드 상한(resolveCardLimit) */
  limit: number;
  /**
   * 소스 설정 읽기 — 기본은 `<rootDir>/configs/sources.json`(loadSources). 테스트가 소스 목록을 주입한다.
   * 주입해도 수집 조건(enabled && terms_checked …)·type별 경로 판정(planDailySources)은 그대로 거친다.
   */
  loadSources?: () => Promise<Source[]>;
  now: () => Date;
  /** RSS·football-data 공용 fetch */
  fetch: FetchLike;
  userAgent: string;
  /** 피드 수집 정책 덮어쓰기(시간 예산·동시 상한·간격·재시도 대기) — 기본 feed-collect DEFAULT_FEED_POLICY */
  feedPolicy?: Partial<FeedPolicy>;
  /** 피드 수집 시각·대기(테스트 주입용) — 기본 실제 시계(Date.now·setTimeout) */
  feedClock?: FeedClock;
  /** FOOTBALL_DATA_API_KEY — 없으면 브리핑을 건너뛴다 */
  footballDataApiKey: string | undefined;
  /** football-data 호출 간격 대기(테스트 주입용) */
  footballDataSleep?: (ms: number) => Promise<void>;
  /**
   * 브리핑 전용 설정(LLM_MODEL·DAILY_BUDGET_USD·MONTHLY_BUDGET_USD) 해석 — 브리핑 단계 안에서 부른다.
   * 값이 잘못돼 던져도 브리핑만 실패(partial)하고 뉴스 발행은 계속된다.
   */
  resolveBriefConfig: () => BriefConfig;
  /** LLM 클라이언트 — 브리핑을 실제로 보낼 때만 만든다(키가 없으면 여기서 던져도 브리핑만 실패) */
  createLlm: (model: string) => Pick<LlmClient, "callSingle" | "model">;
  logger: Logger;
  /** 사람이 읽는 출력(dry 산출물·브리핑 줄) — 구조화 로그와 분리 */
  print: (text: string) => void;
}

export type BriefOutcome =
  | {
      state: "skipped";
      reason:
        | "news-failed"
        | "no-api-key"
        | "no-matches"
        | "budget"
        | "mock-fixture-missing";
      inputMatches: number;
    }
  | {
      state: "failed";
      reason: "football-data" | "llm" | "output" | "setup";
      detail: string;
      inputMatches: number;
    }
  | { state: "done"; inputMatches: number; lines: string[] };

export type { SourceErrorType, SourceOutcome } from "./feed-collect";

export interface NewsOutcome {
  ok: boolean;
  /** 피드 원문 항목 수(모든 소스 합) */
  feedItems: number;
  /** 이번 실행이 만든 카드 수(선별 후) */
  selected: number;
  /** 파일에 새로 더한 카드 수 */
  added: number;
  /** 쓴(또는 dry면 쓰려던) 파일 내용. 카드가 하나도 없으면 null */
  file: NewsFile | null;
  /** 실제로 쓴 경로(dry·빈 결과면 null) */
  path: string | null;
  /** 수집을 시도한 피드 소스별 결과(설정 파일 순서) */
  sources: SourceOutcome[];
  /** 일일 수집에서 뺀 소스와 이유 */
  excluded: SourceExclusion[];
  error?: string;
}

export interface CollectOutcome {
  runId: string;
  publishDate: string;
  news: NewsOutcome;
  brief: BriefOutcome;
  /** 기록한 실행 로그(기록하지 않았으면 null) */
  run: RunLog | null;
  runPath: string | null;
  status: RunLog["status"];
  exitCode: number;
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "")
    : String(error);
}

// ─── ① 뉴스 ──────────────────────────────────────────────────────────────

/** 일일 수집 계획을 구조화 로그로 남긴다 — 제외 소스는 id·type·사유 한 줄씩 */
function logSourcePlan(log: Logger, plan: DailySourcePlan): void {
  const byReason: Partial<Record<SourceExclusionReason, number>> = {};
  for (const ex of plan.excluded) {
    byReason[ex.reason] = (byReason[ex.reason] ?? 0) + 1;
    // 크롤러가 없어 못 도는 crawl 소스는 설정과 실행이 어긋난 것이라 warn, 나머지는 의도된 제외라 info.
    const level = ex.reason === "no-crawler" ? "warn" : "info";
    log[level]("collect.source.skip", {
      source: ex.id,
      type: ex.type,
      reason: ex.reason,
    });
  }
  // 크롤러 모듈은 있지만 수집 실행기가 아직 없다(M1-05) — 지금은 등록된 크롤러가 없어 나오지 않는다.
  for (const source of plan.crawls) {
    log.warn("collect.source.skip", {
      source: source.id,
      type: source.type,
      reason: "crawler-runner-pending",
    });
  }
  log.info("collect.sources.plan", {
    feeds: plan.feeds.length,
    crawls: plan.crawls.length,
    excluded: plan.excluded.length,
    byReason,
  });
}

async function runNewsStage(
  deps: CollectDeps,
  ctx: { runId: string; publishDate: string; startedAt: string },
): Promise<{ outcome: NewsOutcome; sources: RunLog["sources"] }> {
  const log = deps.logger;
  const empty: NewsOutcome = {
    ok: false,
    feedItems: 0,
    selected: 0,
    added: 0,
    file: null,
    path: null,
    sources: [],
    excluded: [],
  };

  // 소스 설정 → 일일 수집 계획. 설정 오류(소스·피드 수집 정책)·수집 대상 0개는 뉴스 단계 실패(exit 1 — 커밋하지 않고 이슈).
  let plan: DailySourcePlan;
  let feedPolicy: FeedPolicy;
  try {
    const sources = await (
      deps.loadSources ?? (() => loadSources(deps.rootDir))
    )();
    plan = planDailySources(sources);
    feedPolicy = resolveFeedPolicy(deps.feedPolicy);
  } catch (error) {
    log.error("collect.source.config", { error: errorText(error) });
    return { outcome: { ...empty, error: errorText(error) }, sources: [] };
  }
  logSourcePlan(log, plan);
  if (plan.feeds.length === 0) {
    const error =
      "수집 대상 피드 소스가 없다(enabled && terms_checked인 rss·journalist·aggregator 0개)";
    log.error("collect.source.config", {
      error,
      excluded: plan.excluded.length,
    });
    return {
      outcome: { ...empty, excluded: plan.excluded, error },
      sources: [],
    };
  }

  // 소스별 수집 — 다른 호스트는 동시에, 같은 호스트는 순서대로(간격), 단계 시간 예산 안에서(feed-collect.ts).
  // 결과·항목은 설정 순서 — 완료 순서와 무관하게 같은 응답이면 선별 결과가 같다. 한 소스의 실패가 다른 소스를 막지 않는다.
  const sourceById = new Map(plan.feeds.map((s) => [s.id, s] as const));
  const collected = await collectFeedSources(plan.feeds, {
    fetch: deps.fetch,
    userAgent: deps.userAgent,
    logger: log,
    policy: feedPolicy,
    clock: deps.feedClock,
  });
  const outcomes: SourceOutcome[] = collected.outcomes;
  const allItems = collected.items;
  const sources: RunLog["sources"] = outcomes.map((o) => ({
    id: o.id,
    ok: o.ok,
    items: o.items,
  }));
  const feedItems = outcomes.reduce((sum, o) => sum + o.items, 0);
  const failed = outcomes.filter((o) => !o.ok);
  const base = { feedItems, sources: outcomes, excluded: plan.excluded };
  if (failed.length === outcomes.length) {
    const error = `모든 피드 소스 수집 실패(${failed.length}개)`;
    log.error("collect.news.fail", {
      reason: "all-sources-failed",
      sources: failed.length,
    });
    return { outcome: { ...empty, ...base, error }, sources };
  }

  // 선별(슬라이스): 여러 소스를 합쳐 카드 ID(링크 해시)로 중복을 빼고 최신순 상위 N건 — 같은 링크는 설정 순서상 먼저 나온 소스가 갖는다.
  const uniqueLinks = new Set(allItems.map((item) => cardIdFor(item.link)));
  const cards = selectLatest(allItems, deps.limit).flatMap((item) => {
    const source = sourceById.get(item.sourceId);
    return source ? [buildCard(item, source, ctx.startedAt)] : [];
  });
  log.info("collect.select.done", {
    usable: allItems.length,
    unique: uniqueLinks.size,
    duplicateLinks: allItems.length - uniqueLinks.size,
    selected: cards.length,
    limit: deps.limit,
    failedSources: failed.length,
  });

  try {
    const filePath = newsFilePath(deps.dataDir, ctx.publishDate);
    const existing = await readNewsFile(filePath);
    const merged = mergeCards(existing?.cards ?? [], cards);
    // 새 카드가 없으면 파일을 다시 쓰지 않는다(generatedAt만 바뀐 불필요한 data 커밋 방지).
    const unchanged = existing !== null && merged.added === 0;
    if (merged.cards.length === 0) {
      log.warn("collect.news.empty", { date: ctx.publishDate });
      return { outcome: { ...empty, ...base, ok: true }, sources };
    }
    const file = buildNewsFile({
      date: ctx.publishDate,
      generatedAt: nowUtcIso(deps.now()),
      runId: ctx.runId,
      cards: merged.cards,
    });
    const fields = {
      date: ctx.publishDate,
      selected: cards.length,
      added: merged.added,
      duplicates: merged.duplicates,
      count: file.cards.length,
    };
    if (deps.dry) {
      log.info("collect.news.dry", fields);
      deps.print(
        `── [dry] data/news/${ctx.publishDate}.json — 쓰지 않음 (카드 ${file.cards.length}장, 새 카드 ${merged.added}장)\n${serializeNewsFile(file).trimEnd()}`,
      );
    } else if (unchanged) {
      log.info("collect.news.unchanged", fields);
    } else {
      await writeNewsFile(filePath, file);
      log.info("collect.news.write", fields);
    }
    return {
      outcome: {
        ...base,
        ok: true,
        selected: cards.length,
        added: merged.added,
        file: unchanged && !deps.dry ? existing : file,
        path: deps.dry || unchanged ? null : filePath,
      },
      sources,
    };
  } catch (error) {
    log.error("collect.news.fail", {
      date: ctx.publishDate,
      error: errorText(error),
    });
    return {
      outcome: {
        ...empty,
        ...base,
        selected: cards.length,
        error: errorText(error),
      },
      sources,
    };
  }
}

// ─── ② 브리핑 ────────────────────────────────────────────────────────────

async function runBriefStage(
  deps: CollectDeps,
  ctx: { publishDate: string },
  sink: {
    results: LlmResult[];
    apiCalls: { footballData: number };
    /** 브리핑 설정을 해석했으면 그 모델(실행 기록 단가용) */
    model: string | null;
  },
): Promise<BriefOutcome> {
  const log = deps.logger;
  if (!deps.footballDataApiKey?.trim()) {
    log.warn("summarize.brief.skip", {
      reason: "no-api-key",
      missing: "FOOTBALL_DATA_API_KEY",
    });
    return { state: "skipped", reason: "no-api-key", inputMatches: 0 };
  }

  // 전날 경기 결과 (football-data 1요청)
  let input: BriefInput;
  try {
    const competitions = await readConfigFile(
      deps.rootDir,
      "competitions.json",
      CompetitionsFileSchema,
    );
    const window = briefInputWindow(ctx.publishDate);
    const client = createFootballDataClient({
      apiKey: deps.footballDataApiKey,
      fetch: deps.fetch,
      sleep: deps.footballDataSleep,
    });
    let raw: unknown[];
    try {
      raw = await client.getMatches({
        competitions: competitions.map((c) => c.footballDataCode),
        ...footballDataDateRange(window),
      });
    } finally {
      sink.apiCalls.footballData += client.calls;
    }
    const { results, skipped } = toFinishedResults(raw, competitions, window);
    const built = buildBriefInput(ctx.publishDate, results, competitions);
    input = built.input;
    log.info("summarize.input.done", {
      date: ctx.publishDate,
      windowStart: window.start,
      windowEnd: window.end,
      fetched: raw.length,
      finished: results.length,
      matches: input.matches.length,
      skipped,
      excluded: built.excluded,
      apiCalls: client.calls,
    });
  } catch (error) {
    log.error("summarize.input.fail", {
      source: "football-data",
      errorType: error instanceof Error ? error.name : "unknown",
      error: errorText(error),
    });
    return {
      state: "failed",
      reason: "football-data",
      detail: errorText(error),
      inputMatches: 0,
    };
  }

  const inputMatches = input.matches.length;
  if (inputMatches === 0) {
    // 종료 경기가 없으면 LLM을 부르지 않는다(D24).
    log.info("summarize.brief.skip", {
      reason: "no-matches",
      date: ctx.publishDate,
    });
    return { state: "skipped", reason: "no-matches", inputMatches };
  }
  if (deps.dry) {
    deps.print(
      `── [dry] 브리핑 입력 (경기 ${inputMatches}개, 기사 텍스트 없음)\n${serializeBriefInput(input)}`,
    );
  }

  // 설정 해석 · 요청 준비 · 실행 전 예상 비용 · 예산 가드(live만 — mock은 비용 0)
  let request: LlmRequest;
  let config: BriefConfig;
  try {
    config = deps.resolveBriefConfig();
    sink.model = config.model;
    request = buildBriefRequest(input, await loadSlicePrompt(deps.rootDir));
    if (deps.llmMode === "live") {
      const estimate = estimateBriefCost(request, config.model);
      const budget = await checkBudgetFromFiles({
        env: deps.env,
        estimatedUsd: estimate.usd,
        now: deps.now(),
        dataDir: deps.dataDir,
        budgets: config.budgets,
      });
      deps.print(formatEstimate(estimate, budget));
      if (!budget.allowed) {
        // 템플릿 브리핑(M1-19)은 아직 없다 — 슬라이스는 건너뛴다.
        log.warn("summarize.brief.skip", {
          reason: "budget",
          budgetReason: budget.reason,
        });
        return { state: "skipped", reason: "budget", inputMatches };
      }
    }
  } catch (error) {
    log.error("summarize.brief.fail", {
      stage: "setup",
      error: errorText(error),
    });
    return {
      state: "failed",
      reason: "setup",
      detail: errorText(error),
      inputMatches,
    };
  }

  // 단건 1요청 (D28). 재시도는 llm.ts 정책(429·5xx만). 마감 시각은 M1-45·M1-47.
  let result: LlmResult;
  try {
    const llm = deps.createLlm(config.model);
    result = await llm.callSingle(request);
  } catch (error) {
    if (error instanceof LlmMockFixtureError) {
      log.warn("summarize.brief.skip", {
        reason: "mock-fixture-missing",
        customId: request.customId,
      });
      return { state: "skipped", reason: "mock-fixture-missing", inputMatches };
    }
    log.error("summarize.brief.fail", {
      stage: "llm",
      error: errorText(error),
    });
    return {
      state: "failed",
      reason: "llm",
      detail: errorText(error),
      inputMatches,
    };
  }
  sink.results.push(result);
  const usageFields = {
    tokensIn: result.usage.in,
    tokensOut: result.usage.out,
    cacheRead: result.usage.cacheRead,
    cacheWrite: result.usage.cacheWrite,
    thinkingTokens: result.thinkingTokens,
  };
  if (!result.ok) {
    log.error("summarize.brief.fail", {
      stage: "llm",
      errorType: result.errorType,
      ...usageFields,
    });
    return {
      state: "failed",
      reason: "llm",
      detail: `${result.errorType}: ${result.message}`,
      inputMatches,
    };
  }

  const parsed = parseBriefOutput(result.text);
  if (!parsed.ok) {
    log.error("summarize.brief.fail", {
      stage: "output",
      reason: parsed.reason,
      ...usageFields,
    });
    return {
      state: "failed",
      reason: "output",
      detail: `출력 형식 오류(${parsed.reason})`,
      inputMatches,
    };
  }
  const lines = parsed.lines.map((line) => line.t);
  log.info("summarize.brief.done", {
    date: ctx.publishDate,
    matches: inputMatches,
    lines: lines.length,
    ...usageFields,
  });
  // 저장 스키마(M1-19) 전이라 사람이 읽는 출력으로만 남긴다 — 화면·data/에는 아직 나가지 않는다.
  deps.print(
    [
      `── 브리핑 출력 (${ctx.publishDate}, ${deps.llmMode}, 저장 안 함 — M1-19 전, 검증·고유명사 치환 전 원문)`,
      ...parsed.lines.map(
        (line, i) => `${i + 1}. ${line.t}  [${line.r.join(",")}]`,
      ),
    ].join("\n"),
  );
  return { state: "done", inputMatches, lines };
}

// ─── 전체 ────────────────────────────────────────────────────────────────

/** 실행 상태 — 뉴스 실패 = failed, 일부 소스 실패·브리핑 실패·키 없음 = partial, 그 밖 = success */
export function runStatus(
  news: { ok: boolean; sources?: readonly { ok: boolean }[] },
  brief: BriefOutcome,
): RunLog["status"] {
  if (!news.ok) return "failed";
  if (news.sources?.some((source) => !source.ok)) return "partial";
  if (brief.state === "failed") return "partial";
  if (brief.state === "skipped" && brief.reason === "no-api-key") {
    return "partial";
  }
  return "success";
}

/** 실행 기록 여부 — mock은 기록하지 않는다. live는 LLM을 불렀으면(dry여도) 기록, prod는 dry가 아니면 항상 기록 */
export function shouldRecordRun(input: {
  llmMode: LlmMode;
  env: RunEnv;
  dry: boolean;
  llmCalls: number;
}): boolean {
  if (input.llmMode !== "live") return false;
  if (input.llmCalls > 0) return true;
  return input.env === "prod" && !input.dry;
}

export async function runCollect(deps: CollectDeps): Promise<CollectOutcome> {
  const log = deps.logger;
  const startedAt = nowUtcIso(deps.now());
  const publishDate = kstDate(startedAt);
  const runId = makeRunId({ env: deps.env, job: "collect", startedAt });
  log.info("collect.start", {
    runId,
    env: deps.env,
    llmMode: deps.llmMode,
    dry: deps.dry,
    limit: deps.limit,
    date: publishDate,
  });

  const { outcome: news, sources } = await runNewsStage(deps, {
    runId,
    publishDate,
    startedAt,
  });

  const sink = {
    results: [] as LlmResult[],
    apiCalls: { footballData: 0 },
    model: null as string | null,
  };
  let brief: BriefOutcome;
  try {
    if (!news.ok) {
      // 뉴스가 실패하면 exit 1 → Actions가 커밋하지 않아 이번 실행의 runs.json 기록(LLM 비용)이 사라지고, 백업 실행이
      // 그 비용을 모른 채 다시 부를 수 있다(CLAUDE.md §1-4·§6.3). 그래서 브리핑(LLM 호출)을 하지 않는다.
      // TODO(M1-27): 실패한 실행의 runs 기록을 보존하는 경로(실패 시에도 runs.json 커밋 등)를 정한다.
      log.warn("summarize.brief.skip", { reason: "news-failed" });
      brief = { state: "skipped", reason: "news-failed", inputMatches: 0 };
    } else {
      brief = await runBriefStage(deps, { publishDate }, sink);
    }
  } catch (error) {
    // 방어선 — 브리핑 단계의 예상 밖 오류도 발행을 멈추지 않는다.
    log.error("summarize.brief.fail", {
      stage: "unexpected",
      error: errorText(error),
    });
    brief = {
      state: "failed",
      reason: "setup",
      detail: errorText(error),
      inputMatches: 0,
    };
  }

  const status = runStatus(news, brief);
  let exitCode = news.ok ? 0 : 1;
  let run: RunLog | null = null;
  let runPath: string | null = null;
  if (
    shouldRecordRun({
      llmMode: deps.llmMode,
      env: deps.env,
      dry: deps.dry,
      llmCalls: sink.results.length,
    })
  ) {
    try {
      const recorded = await recordRun({
        env: deps.env,
        job: "collect",
        // LLM을 부르지 않았거나 설정 해석 전에 끝났으면 기본 모델(비용 0 — 단가 표 확인용)
        model: sink.model ?? DEFAULT_LLM_MODEL,
        runId,
        startedAt,
        now: deps.now(),
        results: sink.results,
        status,
        collected: news.feedItems,
        clusters: news.selected,
        // 슬라이스: 모델이 쓴(임시 스키마를 통과한) 줄 수. 아직 게시하지 않는다 — 검증·강등 뒤 기록은 M1-45.
        summarized: brief.state === "done" ? brief.lines.length : 0,
        downgraded: 0,
        apiCalls: { footballData: sink.apiCalls.footballData, apiFootball: 0 },
        sources,
        dataDir: deps.dataDir,
      });
      run = recorded.run;
      runPath = recorded.path;
      log.info("collect.run.record", {
        runId,
        env: deps.env,
        costUsd: recorded.run.costUsd,
        file: deps.env === "prod" ? "runs.json" : "runs-dev.json",
      });
      if (recorded.run.costUsd > 0) {
        deps.print(
          `[cost] 실측 — ${formatUsd(recorded.run.costUsd)} · 입력 ${recorded.run.tokens.in} · 출력 ${recorded.run.tokens.out} · 캐시 읽기 ${recorded.run.tokens.cacheRead} · 캐시 쓰기 ${recorded.run.tokens.cacheWrite} → data/${deps.env === "prod" ? "runs.json" : "runs-dev.json"} (${runId})`,
        );
      }
    } catch (error) {
      // 비용 기록 실패는 조용히 넘기지 않는다(CLAUDE.md §1-4) — 실행을 실패로 끝내 이슈가 생기게 한다.
      log.error("collect.run.fail", { runId, error: errorText(error) });
      exitCode = 1;
    }
  }

  log.info("collect.done", {
    runId,
    status,
    collected: news.feedItems,
    clusters: news.selected,
    added: news.added,
    sourcesOk: news.sources.filter((s) => s.ok).length,
    sourcesFailed: news.sources.filter((s) => !s.ok).length,
    brief: brief.state === "done" ? "done" : `${brief.state}:${brief.reason}`,
    briefMatches: brief.inputMatches,
    briefLines: brief.state === "done" ? brief.lines.length : 0,
    apiCalls: sink.apiCalls.footballData,
    llmCalls: sink.results.length,
    exitCode,
  });

  return { runId, publishDate, news, brief, run, runPath, status, exitCode };
}
