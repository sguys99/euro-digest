/**
 * `npm run collect` 파이프라인 본체 (M1-01 얇은 수직 슬라이스, PRD §10, D23·D24·D28).
 *
 *   ① 뉴스: configs/sources.json의 일일 수집 대상 피드 전부(M1-02 로더 — enabled && terms_checked, rss·journalist·aggregator)
 *      → 소스별 격리 수집 → 수집 시간 창(M1-10, FR-07 — 직전 성공 실행 − 3시간 ~ 현재, 최대 51시간, 미래 시각 가드)
 *      → 합쳐서 정규화 URL 해시로 중복 제거(M1-12, FR-04 — 카드는 대표 소스 + 같은 URL을 낸 소스들의 대회 태그 합집합, dedup.ts)
 *      → 이미 카드가 된 URL 제외(seen-urls.json 90일 기억 ∪ 최근 발행 파일 — seen-urls.ts) → 최신순 상위 N건
 *      → 원제목 카드(최소 분류) → data/news/<KST 발행일>.json → 그 파일의 카드로 data/cache/seen-urls.json 갱신
 *      검색형 소스(M1-06): configs/search-queries.json의 활성 쿼리만 계획한다. 어댑터(M1-07)가 보류라 실행하지 않는다 —
 *      활성 쿼리 0개면 `collect.search.skip` 한 줄, 있으면 소스마다 경고 후 건너뛴다. 검색 설정 오류도 피드 수집을 멈추지 않는다.
 *   ② 경기 데이터(M1-44·M1-48): **뉴스와 병렬로 실행 시작 직후** 시작한다. 프로바이더별 단계도 병렬(호스트가 달라 분당
 *      한도가 따로)이고 각자 실패를 격리한다(scripts/lib/match-data.ts `isolateProvider`).
 *      - football-data = 전날(KST 창) 6개 대회 종료 경기 + 그 경기가 있는 대회의 현재 순위(최대 7요청, 단계 예산 150초 —
 *        providers/football-data.ts).
 *      - API-Football = 날짜 조회 D-1·D(UTC) → 대상 경기(6개 대회 + 한국 선수 소속팀 기타 대회) 상세를 브리핑 경기 먼저
 *        (단계 예산 6분, 브리핑 컷오프 4분, 하루 ≤ 60회 우리 쪽 카운터 — api-football-stage.ts·api-football-plan.ts).
 *        미종료·미수신 경기는 data/cache/af-pending.json으로 이월한다(dry는 쓰지 않음). errors.plan·일 한도·그 밖의 errors는
 *        소스 이슈 사건(`source:api-football`)으로 사건 파일에 더한다(이슈는 collect.yml 다음 단계가 만든다).
 *      - 경기 기록 원장(M1-48b, D33 — scripts/lib/match-ledger.ts): 받은 상세 → `data/matches/YYYY-MM.json`(득점·도움·포메이션 +
 *        등록 한국 선수 행) + `meta.json`(since·playerSince·gaps). 원장의 af-<id>는 이미 받은 경기라 다시 받지 않는다(모든 실행이
 *        읽는다). **쓰기는 정기 운영이 켜진 prod 실행만**(CollectDeps.ledgerEnabled = COLLECT_ENABLED) — dry·dev·정기 운영 전 실행은
 *        항목·한국 선수 행·이름 후보를 메모리에서 만들어 로그로만 남긴다. 원장에 넣지 못한 경기는 이월 목록에 다시 넣는다.
 *      병렬 근거: 뉴스(예산 90초)·football-data·API-Football은 호스트가 모두 달라 서로의 한도를 쓰지 않고, 겨울(07:10 수집 →
 *      07:20 브리핑 마감)에 뉴스 시간만큼 브리핑 경기를 더 받을 수 있다. 뉴스가 실패하면 취소 신호로 경기 데이터의 새 요청을
 *      멈추고(보내는 중인 요청 1건까지) 브리핑(LLM)은 부르지 않는다 — 커밋되지 않는 실행의 LLM 비용·API-Football 한도 낭비를
 *      최소로 한다(낭비 상한 = 뉴스가 끝날 때까지 보낸 요청, 최대 약 12건).
 *   ③ 브리핑: football-data 종료 경기 → 정형 입력 → `callSingle` 1요청 → **출력은 로그만**(저장 M1-19). 브리핑은
 *      football-data 결과 + API-Football 브리핑 몫(컷오프까지 받은 brief 계층)을 기다린 뒤 시작하고, 둘을 이어(대응표 확인 + D37
 *      강한 증거 — team-ids.ts linkMatchDetails) 득점 목록이 완전한 경기만 입력 `goals`에 득점자를 넣는다(M1-48b),
 *      API-Football 나머지는 브리핑과 동시에 계속 받는다. 실행 기록·이월 파일은 두 프로바이더가 모두 끝난 뒤 쓴다.
 *      football-data 단계가 실패하면 그날 브리핑만 생략하고 뉴스는 발행한다(D24). 순위 실패는 그 대회 순위만 빠진다(partial).
 *   ④ 실행 기록: LLM 실호출이 있었으면 dry여도 기록(prod → runs.json, dev → runs-dev.json). prod는 dry가 아니면 항상 기록.
 *
 * 실패 격리: 소스 하나의 실패(받기·파싱·예상 밖 오류)는 그 소스만 건너뛴다(상태 partial). 피드 받기는 scripts/lib/feed-collect.ts가
 * 호스트별 병렬·재시도(1회)·단계 시간 예산(90초)으로 하고, 결과는 설정 순서로 돌려준다(M1-03).
 * 소스 건강도(M1-11, FR-11, D35): 실행 기록의 소스별 `{id, ok, items, usable?, error?}`와 prod runs.json 이력으로
 * scripts/lib/source-health.ts가 연속 횟수·7일 집계·이슈로 낼 사건을 정한다. 이 파일은 소스별 한 줄 로그를 남기고, 사건 목록을
 * `healthReportPath`(Actions: `$RUNNER_TEMP`의 JSON — 환경변수 SOURCE_HEALTH_FILE)에 쓴다. 이슈 생성은 쓰기 토큰을 받는 별도
 * 워크플로 단계(scripts/report-issue.ts --kind source-broken)가 한다 — 이 단계(서드파티 코드가 도는 곳)에는 토큰을 env로
 * 넘기지 않는다(env 수준 격리 — 한계는 collect.yml 이슈 단계 주석).
 * 경로가 없으면(로컬) 파일 없이 "이슈로 낼 사건" 로그만 남긴다. 건강도 단계의 어떤 실패도 수집·발행을 멈추지 않는다.
 * 경기 데이터·브리핑 단계(프로바이더·브리핑 설정·예산·LLM·출력 형식)의 어떤 실패도 뉴스 발행을 멈추지 않는다(FR-26 정신).
 * 뉴스 단계가 통째로 실패하면(소스 설정 오류·수집 대상 0개·모든 소스 실패·기존 파일 손상) exitCode 1 — Actions가
 * 커밋하지 않고 이슈를 만든다.
 * 이때는 브리핑(LLM 호출)을 하지 않는다 — 커밋되지 않는 실행의 LLM 비용 기록이 사라지지 않게(M1-27까지). 병렬로 시작한
 * 경기 데이터는 취소 신호로 새 요청을 멈춘다(원장·이월 파일도 커밋되지 않으므로 API-Football 일 한도만 쓰게 된다).
 *
 * I/O(fetch·시각·파일 위치·LLM 클라이언트·출력)는 모두 주입한다 — 테스트는 fixtures와 임시 폴더로 네트워크 없이 돈다.
 * 공통 형식 정규화·검증(FR-03, 소스 `tz` — M1-09·D34)과 기자 채널 작성자 필터(`Source.author`, M1-04)는 feed-collect.ts가 한다.
 * 수집 시간 창(창 계산·항목 판정)은 scripts/lib/collect-window.ts(순수 함수)가 하고, 여기서는 prod runs.json을 읽어 넘긴다.
 * 다음 작업이 갈아끼울 자리: 클러스터링·점수화(M1-13·M1-14) · 카드 ID(M1-16 — 정규화 URL 해시) ·
 * 분류(M1-17) · 브리핑 입력·템플릿(M1-19) · 프롬프트(M1-20) · 검증·강등(M1-23·M1-45) · 비용 가드(M1-22) · runs 기록(M1-27) ·
 * 계절별 마감(M1-47 — 브리핑 컷오프 상수) · 브리핑 입력 한국 선수 출전(M3-03 — 원장 행에서).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  type AfPendingEntry,
  type CompetitionsFile,
  type LedgerMatch,
  type NewsCard,
  type NewsFile,
  type RunEnv,
  type RunLog,
  type SearchQueriesFile,
  type Source,
} from "@/lib/schema";
import { kstDate, nowUtcIso, utcDate } from "@/lib/time";

import {
  afPendingPath,
  afQueryDates,
  API_FOOTBALL_DEV_QUIET_HOURS,
  apiFootballCallAllowance,
  buildAfPendingFile,
  buildAfTargetConfig,
  isDevQuietHours,
  readAfPending,
  requeueAfPending,
  resolveApiFootballMaxCalls,
  sameAfPending,
  serializeAfPending,
  writeAfPending,
  type AfCallAllowance,
  type AfDropped,
  type AfPendingUpdate,
  type AfTargetBuild,
} from "./api-football-plan";
import {
  API_FOOTBALL_BRIEF_CUTOFF_MS,
  API_FOOTBALL_STAGE_BUDGET_MS,
  apiFootballIssuePayloads,
  runApiFootballStage,
  type AfBriefSnapshot,
  type AfStageResult,
} from "./api-football-stage";

import {
  BRIEF_MAX_MATCHES,
  briefInputWindow,
  buildBriefInput,
  serializeBriefInput,
  type BriefInput,
} from "./brief-input";
import {
  buildBriefRequest,
  estimateBriefCost,
  loadSlicePrompt,
  parseBriefOutput,
} from "./brief";
import type { LlmMode } from "./cli-args";
import { readConfigFile } from "./config-files";
import { dedupeFeedItems, groupSource } from "./dedup";
import {
  applyCollectWindow,
  ceilMinutes,
  planCollectWindow,
  windowLogFields,
  type CollectWindow,
  type RunsReadResult,
  type WindowStats,
} from "./collect-window";
import {
  checkBudgetFromFiles,
  formatEstimate,
  formatUsd,
  makeRunId,
  readRuns,
  recordRun,
  runsPathFor,
  type Budgets,
} from "./cost";
import {
  collectFeedSources,
  resolveFeedPolicy,
  type FeedClock,
  type FeedPolicy,
  type SourceOutcome,
} from "./feed-collect";
import type { IssuePayloadInput } from "./github-issues";
import {
  DEFAULT_LLM_MODEL,
  LlmMockFixtureError,
  type LlmClient,
  type LlmRequest,
  type LlmResult,
} from "./llm";
import type { Logger } from "./logger";
import {
  isolateProvider,
  type MatchDetail,
  type ProviderOutcome,
} from "./match-data";
import {
  afIdOfKey,
  applyLedger,
  buildLedgerEntries,
  isIncompleteLedgerMatch,
  koreanPlayerTargets,
  ledgerMonthsAround,
  ledgerPlanKnown,
  ledgerWriteMode,
  readLedgerWindow,
  type KoreanNameCheck,
  type KoreanPlayerTargets,
  type LedgerApplyResult,
  type LedgerSettleInput,
  type LedgerWindowRead,
  type LedgerWriteMode,
} from "./match-ledger";
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
  createApiFootballClient,
  type AfRateHeaders,
} from "./providers/api-football";
import {
  createFootballDataClient,
  fetchBriefFootballData,
  FOOTBALL_DATA_STAGE_BUDGET_MS,
  FootballDataError,
  type FootballDataBriefData,
} from "./providers/football-data";
import type { FetchLike } from "./rss";
import {
  buildSeenIndex,
  buildSeenUrlsFile,
  filterUnseen,
  readRecentNewsCards,
  readSeenUrls,
  sameSeen,
  SEEN_RECENT_DAYS,
  SEEN_URLS_REL_PATH,
  serializeSeenUrls,
  updateSeen,
  writeSeenUrls,
  type SeenIndex,
} from "./seen-urls";
import {
  countSearchExclusions,
  loadSearchQueries,
  planSearchQueries,
  SEARCH_EXCLUSION_WARN_REASONS,
  type SearchQueryExclusion,
} from "./search-queries";
import {
  assessSourceHealth,
  healthIssueKey,
  healthIssuePayloads,
  healthLogFields,
  type SourceHealth,
} from "./source-health";
import {
  buildTeamIdIndex,
  EMPTY_TEAM_ID_INDEX,
  linkMatchDetails,
  loadTeamIds,
  type MatchLinkResult,
  type TeamIdIndex,
} from "./team-ids";
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
  /** 검색 쿼리 설정 읽기 — 기본은 `<rootDir>/configs/search-queries.json`(loadSearchQueries). 테스트 주입용 */
  loadSearchQueries?: () => Promise<SearchQueriesFile>;
  now: () => Date;
  /** RSS·football-data 공용 fetch */
  fetch: FetchLike;
  userAgent: string;
  /** 피드 수집 정책 덮어쓰기(시간 예산·동시 상한·간격·재시도 대기) — 기본 feed-collect DEFAULT_FEED_POLICY */
  feedPolicy?: Partial<FeedPolicy>;
  /** 피드 수집 시각·대기(테스트 주입용) — 기본 실제 시계(Date.now·setTimeout) */
  feedClock?: FeedClock;
  /** FOOTBALL_DATA_API_KEY — 없으면 football-data 단계와 브리핑을 건너뛴다 */
  footballDataApiKey: string | undefined;
  /** football-data 호출 간격·재시도 대기(테스트 주입용) — 기본 setTimeout */
  footballDataSleep?: (ms: number) => Promise<void>;
  /** football-data 시계(ms) — 간격·단계 예산 계산(테스트 주입용). 기본 Date.now */
  footballDataNow?: () => number;
  /** API_FOOTBALL_KEY — 없으면 API-Football 단계를 건너뛴다(브리핑은 득점자 없이 — M1-48b) */
  apiFootballApiKey?: string;
  /** API_FOOTBALL_MAX_CALLS 원문(선택, 실행당 호출 상한 — dry·개발 실측용). 형식이 틀리면 API-Football 단계만 실패 */
  apiFootballMaxCalls?: string;
  /**
   * 정기 운영이 켜졌는가(저장소 변수 `COLLECT_ENABLED == 'true'` — collect.yml이 수집 단계 env로 넘긴다). 경기 기록 원장
   * (`data/matches`, M1-48b)은 이 값이 true인 prod·비dry 실행만 쓴다(scripts/lib/match-ledger.ts `ledgerWriteMode`). 기본 false.
   */
  ledgerEnabled?: boolean;
  /** API-Football 호출 간격·재시도 대기(테스트 주입용) — 기본 setTimeout */
  apiFootballSleep?: (ms: number) => Promise<void>;
  /** API-Football 시계(ms) — 간격·단계 예산·브리핑 컷오프 계산(테스트 주입용). 기본 Date.now */
  apiFootballNow?: () => number;
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
  /**
   * 소스 건강도 사건(이슈 payload 배열)을 쓸 파일 — Actions는 `$RUNNER_TEMP/source-health.json`(SOURCE_HEALTH_FILE).
   * 없으면(로컬) 파일을 쓰지 않고 로그만 남긴다. dry 실행도 쓰지 않는다. (M1-11)
   */
  healthReportPath?: string | null;
  /** 이번 Actions 실행 URL — 이슈 본문의 실행 링크(로컬이면 없음) */
  runUrl?: string;
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

/** API-Football 단계 결과 (M1-48) */
export interface ApiFootballData {
  stage: AfStageResult;
  /** 이번 실행의 호출 허용량(우리 쪽 카운터) */
  allowance: AfCallAllowance;
  /** 보낸 요청 수(재시도·실패 포함) — runs.json apiCalls.apiFootball */
  calls: number;
  retries: number;
  /** 마지막 응답의 레이트 리밋 헤더(참고 — 일 남은 수는 일관되지 않다) */
  rate: AfRateHeaders;
  /** 활성 한국 선수 소속팀인데 team-ids.json `af`가 없는 팀 */
  unmappedTeams: string[];
  /** 경기 기록 원장(M1-48b) — 항목·한국 선수 행·이름 후보(메모리)와 쓰기 결과 */
  ledger: LedgerOutcome;
  pendingFile: {
    /** 읽기·형식 오류(빈 목록으로 진행) */
    readError: string | null;
    /** 내용이 바뀌었는가 */
    changed: boolean;
    /** 쓴 경로(dry·변화 없음·취소면 null) */
    written: string | null;
  };
}

/** 한국 선수 행 1개(로그·dry 출력용 — 원장에는 선수 API id만 저장한다) */
export interface KoreanRowView {
  matchId: number;
  player: string;
  status: string;
  minutes: number | null;
  goals: number;
  assists: number;
}

/** 경기 기록 원장 단계 결과 (M1-48b — scripts/lib/match-ledger.ts) */
export interface LedgerOutcome {
  /** write 외에는 쓰지 않은 이유(dry·dev·ledger-disabled·cancelled) */
  mode: LedgerWriteMode;
  /** 이번 상세 → 원장 항목(메모리 — dry·dev도 만든다) */
  entries: LedgerMatch[];
  /** 형식 오류로 뺀 경기 */
  invalid: Array<{ id: number; error: string }>;
  /** 등록 한국 선수 행 */
  korean: KoreanRowView[];
  /** apiFootballId 없는 활성 선수의 이름 대조(운영 리포트 M5-09) */
  nameChecks: KoreanNameCheck[];
  /** 원장에 있어 다시 받지 않은 경기 수(근처 달의 af-<id>) */
  known: number;
  /** 근처 달 원장 읽기 오류 */
  readErrors: Array<{ file: string; error: string }>;
  /** 쓰기 결과 — mode가 write일 때만 */
  applied: LedgerApplyResult | null;
  /** 원장에 넣지 못해(쓰기 실패·형식 오류) 이월 목록에 다시 넣은 경기 id */
  requeued: number[];
  /** 원장에 들어갔지만 불완전해 이월 목록에 올린 경기 id(다시 받는다 — 상한에 걸리면 확정) */
  incomplete: number[];
  /** 원장 단계가 고친 이월 목록(호출부가 단계 결과에 반영) — 고칠 것이 없으면 null */
  pending: AfPendingUpdate | null;
}

/**
 * 경기 데이터 단계 결과 — 프로바이더별(호스트가 달라 병렬, 각자 실패 격리). 뉴스와 병렬로 시작하고, 뉴스가 실패하면 취소된다.
 */
export interface MatchDataOutcome {
  footballData: ProviderOutcome<FootballDataBriefData>;
  /** API-Football 경기 단건(M1-48) — 최종 결과(브리핑 뒤에 끝난 몫 포함) */
  apiFootball: ProviderOutcome<ApiFootballData>;
  /** 브리핑이 기다린 API-Football 몫(컷오프 시점) — 건너뛰거나 실패했으면 null */
  apiFootballBrief: AfBriefSnapshot | null;
  /** football-data 종료 경기 ↔ API-Football 상세 연결(대응표 확인 + D37 강한 증거) — 둘 다 끝났을 때만(로그·후보용 — 브리핑
   * 득점자는 브리핑 시점의 몫으로 따로 잇는다) */
  pairing: MatchLinkResult | null;
  /**
   * 경기 기록 원장 — API-Football이 끝났으면 그 결과(ApiFootballData.ledger), 건너뛰었거나 실패했으면 정기 운영 prod 실행에서
   * 빠진 날(skipped)만 기록한 결과, 그 밖은 null
   */
  ledger: LedgerOutcome | null;
  /** 단계 전체(병렬) 소요 시간 */
  elapsedMs: number;
}

/** 브리핑 단계가 받는 경기 데이터 — football-data 결과 + API-Football 브리핑 몫 */
export type MatchDataBriefView = Pick<
  MatchDataOutcome,
  "footballData" | "apiFootballBrief"
>;

/** 검색형 소스 단계 결과(M1-06) — 지금은 계획만 하고 실행하지 않는다(어댑터 M1-07 보류, D32) */
export interface SearchStageOutcome {
  /** 활성 쿼리 수(쿼리·소스 조건과 maxEnabled 통과) */
  active: number;
  /** 활성 쿼리가 있지만 실행하지 못한 소스 — 어댑터 구현이 없어 지금은 항상 "no-adapter" */
  skippedSources: Array<{
    source: string;
    queries: number;
    reason: "no-adapter";
  }>;
  /** 활성에서 뺀 쿼리와 이유(설정 순서) */
  excluded: SearchQueryExclusion[];
  /** 검색 쿼리 설정 읽기 실패(피드 수집은 계속) */
  error?: string;
}

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
  /** 검색형 소스 단계 결과 — 소스 설정을 읽지 못했으면 null */
  search: SearchStageOutcome | null;
  /** 수집 시간 창(M1-10) — 소스 설정을 읽지 못했거나 수집 대상이 없으면 null */
  window: CollectWindow | null;
  /** 창 적용 집계(창 밖·미래 낮춤·미래 제외) — 피드를 받지 않았으면 null */
  windowStats: WindowStats | null;
  /** 같은 URL 중복 제거·이미 카드가 된 URL 제외(M1-12, FR-04) — 선별까지 가지 않았으면 null */
  dedup: DedupOutcome | null;
  /** `data/cache/seen-urls.json`(M1-12) — 선별까지 가지 않았으면 null */
  seen: SeenOutcome | null;
  error?: string;
}

/** 중복 제거 집계 (M1-12) */
export interface DedupOutcome {
  /** 창 안 항목 수 */
  items: number;
  /** 정규화 URL 기준 고유 묶음 수 */
  unique: number;
  /** 같은 정규화 URL이라 합친 항목 수(items − unique) */
  duplicates: number;
  /** 소스가 둘 이상인 묶음 수(소스 메타를 합친 묶음) */
  multiSource: number;
  /** 다른 날(또는 삭제 전) 이미 카드가 된 URL이라 뺀 묶음 수 */
  seenBefore: number;
}

/** seen-urls 기억 단계 결과 (M1-12 — scripts/lib/seen-urls.ts) */
export interface SeenOutcome {
  /** seen-urls.json 읽기·형식 오류(빈 기억 + 발행 파일로 다시 채워 진행) */
  readError: string | null;
  /** 이전 발행 파일(D-1~D-3) 중 깨진 파일 */
  recentErrors: Array<{ date: string; error: string }>;
  /** 정리 후 기억 크기(이번 실행 갱신 전) */
  size: number;
  /** 보존 기간(90일)이 지나 뺀 항목 수 */
  pruned: number;
  /** seen-urls.json에 없어 발행 파일에서 채운 키 수 */
  backfilled: number;
  /** 이번 실행이 새로 기억한 키 수(발행 파일 카드 기준 — 쓰지 않았으면 0) */
  added: number;
  /** 쓴 경로(dry·내용 같음·발행 파일 없음·쓰기 실패면 null) */
  written: string | null;
  /** 쓰기 실패(발행은 계속 — 실행 상태 partial) */
  writeError: string | null;
}

/** 소스 건강도 단계 결과 (M1-11) */
export interface HealthOutcome {
  /** 소스별 건강도(수집을 시도한 소스, 설정 순서) */
  sources: SourceHealth[];
  /** 이슈로 낼 사건 — `source-broken` payload(소스별 최대 1건) */
  reports: Array<IssuePayloadInput<"source-broken">>;
  /** 사건 파일을 쓴 경로(쓰지 않았으면 null) */
  file: string | null;
  /** runs.json을 읽지 못해 이번 실행만으로 판정했으면 그 오류 */
  historyError: string | null;
}

export interface CollectOutcome {
  runId: string;
  publishDate: string;
  news: NewsOutcome;
  /** 소스 건강도 — 수집을 시도한 소스가 없거나(설정 오류) 단계가 실패했으면 null */
  health: HealthOutcome | null;
  /**
   * 경기 데이터 — 뉴스 피드 수집과 병렬로 돌고 뉴스가 실패하면 취소된다(그 결과도 담는다). 뉴스 설정 오류·수집 대상 0개로
   * 시작하지 않았거나 예상 밖 오류로 끝나지 않았으면 null
   */
  matchData: MatchDataOutcome | null;
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

/**
 * 검색형 소스 단계(M1-06) — 활성 쿼리를 계획하고 로그만 남긴다. 검색 요청은 하지 않는다(M1-07 보류, D32).
 *   - 활성 쿼리 0개 → `collect.search.skip`(info, reason "no-active-queries") 한 줄. 쿼리별 제외는 debug(기본 출력 안 함)
 *   - 설정과 실행이 어긋난 제외(source-missing·source-not-search·over-max-enabled) → 쿼리마다 warn
 *   - 활성 쿼리가 있는 소스 → 어댑터가 없으므로 소스마다 `collect.search.skip`(warn, reason "no-adapter")
 * 설정 읽기 실패는 `collect.search.fail`(error)로 남기고 피드 수집을 계속한다 — `npm run validate` 게이트가 커밋 전에 잡는다.
 */
async function runSearchStage(
  deps: CollectDeps,
  sources: readonly Source[],
): Promise<SearchStageOutcome> {
  const log = deps.logger;
  let file: SearchQueriesFile;
  try {
    file = await (
      deps.loadSearchQueries ?? (() => loadSearchQueries(deps.rootDir))
    )();
  } catch (error) {
    log.error("collect.search.fail", {
      reason: "config",
      error: errorText(error),
    });
    return {
      active: 0,
      skippedSources: [],
      excluded: [],
      error: errorText(error),
    };
  }

  const plan = planSearchQueries(file, sources);
  for (const ex of plan.excluded) {
    const level = SEARCH_EXCLUSION_WARN_REASONS.has(ex.reason)
      ? "warn"
      : "debug";
    log[level]("collect.search.query.skip", {
      query: ex.id,
      source: ex.source,
      reason: ex.reason,
    });
  }
  const outcome: SearchStageOutcome = {
    active: plan.active,
    skippedSources: [],
    excluded: plan.excluded,
  };
  if (plan.active === 0) {
    log.info("collect.search.skip", {
      reason: "no-active-queries",
      queries: file.queries.length,
      maxEnabled: plan.maxEnabled,
      byReason: countSearchExclusions(plan.excluded),
    });
    return outcome;
  }
  // 어댑터 구현이 없다(M1-07 보류) — 활성 쿼리를 켰다면 설정이 실행보다 앞선 것이라 warn.
  for (const batch of plan.batches) {
    log.warn("collect.search.skip", {
      source: batch.source.id,
      type: batch.source.type,
      queries: batch.queries.length,
      reason: "no-adapter",
    });
    outcome.skippedSources.push({
      source: batch.source.id,
      queries: batch.queries.length,
      reason: "no-adapter",
    });
  }
  return outcome;
}

/**
 * 창 계산용 prod runs.json(dev 실행도 prod 기록을 본다). 파일이 없으면 [](첫 실행).
 * JSON·스키마 오류는 던지지 않고 값으로 돌려준다 — 창은 51시간(상한)으로 넓히고 경고한다(collect-window.ts).
 */
async function readProdRunsForWindow(dataDir: string): Promise<RunsReadResult> {
  try {
    return { ok: true, runs: await readRuns(runsPathFor("prod", dataDir)) };
  } catch (error) {
    return { ok: false, error: errorText(error) };
  }
}

/** 창 계획 로그 — 시작·끝(UTC·KST)·근거. runs.json 오류·미래 기록은 warn */
function logWindowPlan(log: Logger, window: CollectWindow): void {
  if (window.runsError !== null) {
    log.warn("collect.window.runs-unreadable", {
      file: "runs.json",
      error: window.runsError,
      fallbackHours: windowLogFields(window).maxHours,
    });
  }
  if (window.ignoredFutureRuns > 0) {
    // 현재보다 미래에 시작한 발행 기록 — 시계 오류. 그 기록으로 창을 열면 비어 버려 무시한다.
    log.warn("collect.window.future-runs", {
      file: "runs.json",
      count: window.ignoredFutureRuns,
      now: window.now,
    });
  }
  log.info("collect.window.plan", windowLogFields(window));
}

/** 창 적용 로그 — 합계 + 소스별(미래 낮춤 info · 미래 제외 warn — 시간대 설정 확인) */
function logWindowApply(log: Logger, stats: WindowStats): void {
  for (const [source, per] of Object.entries(stats.bySource)) {
    const aheadMaxMin =
      per.maxAheadMs === null ? null : ceilMinutes(per.maxAheadMs);
    if (per.futureClamped > 0) {
      log.info("collect.item.clamp", {
        source,
        reason: "future-clamped",
        count: per.futureClamped,
        aheadMaxMin,
      });
    }
    if (per.future > 0) {
      log.warn("collect.item.skip", {
        source,
        reason: "future",
        count: per.future,
        kept: per.inWindow,
        aheadMaxMin,
      });
    }
  }
  log.info("collect.window.apply", {
    items: stats.total,
    inWindow: stats.inWindow,
    outOfWindow: stats.outOfWindow,
    futureClamped: stats.futureClamped,
    future: stats.future,
    // 소스별 창 안 건수 — 피드는 받았는데 창 안이 0건이면 갱신이 멈춘 피드일 수 있다(건강도 판단은 M1-11)
    inWindowBySource: Object.fromEntries(
      Object.entries(stats.bySource).map(([source, per]) => [
        source,
        per.inWindow,
      ]),
    ),
  });
}

/** 뉴스 단계 결과 + 건강도 단계에 넘길 것 */
interface NewsStageResult {
  outcome: NewsOutcome;
  /** 실행 기록에 남길 소스별 결과(설정 순서) */
  sources: RunLog["sources"];
  /** 창 계산에 쓴 prod runs.json 읽기 결과(건강도 이력도 같은 값) — 수집 대상이 없으면 null */
  runsRead: RunsReadResult | null;
  /** 수집 대상 소스 id → 이름 */
  sourceNames: Map<string, string>;
}

/**
 * 실행 기록의 소스별 결과(D35) — 성공: `usable` = 수집 창 안 항목 수(정규화·작성자 필터·창 적용 뒤, 중복 제거 전),
 * 실패: `error` = 실패 종류(budget 포함). 응답 본문·오류 메시지는 남기지 않는다.
 */
export function runSourceEntries(
  outcomes: readonly SourceOutcome[],
  stats: Pick<WindowStats, "bySource">,
): RunLog["sources"] {
  return outcomes.map((o) =>
    o.ok
      ? {
          id: o.id,
          ok: true,
          items: o.items,
          usable: stats.bySource[o.id]?.inWindow ?? 0,
        }
      : { id: o.id, ok: false, items: 0, error: o.errorType ?? "unexpected" },
  );
}

async function runNewsStage(
  deps: CollectDeps,
  ctx: { runId: string; publishDate: string; startedAt: string },
  hooks: {
    /** 수집 대상이 정해져 피드를 받기 직전 — 경기 데이터 단계를 여기서 병렬로 시작한다(설정 오류면 부르지 않는다) */
    onFeedsPlanned?: () => void;
  } = {},
): Promise<NewsStageResult> {
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
    search: null,
    window: null,
    windowStats: null,
    dedup: null,
    seen: null,
  };

  // 소스 설정 → 일일 수집 계획. 설정 오류(소스·피드 수집 정책)·수집 대상 0개는 뉴스 단계 실패(exit 1 — 커밋하지 않고 이슈).
  let configSources: Source[];
  let plan: DailySourcePlan;
  let feedPolicy: FeedPolicy;
  try {
    configSources = await (
      deps.loadSources ?? (() => loadSources(deps.rootDir))
    )();
    plan = planDailySources(configSources);
    feedPolicy = resolveFeedPolicy(deps.feedPolicy);
  } catch (error) {
    log.error("collect.source.config", { error: errorText(error) });
    return {
      outcome: { ...empty, error: errorText(error) },
      sources: [],
      runsRead: null,
      sourceNames: new Map(),
    };
  }
  logSourcePlan(log, plan);
  const search = await runSearchStage(deps, configSources);
  if (plan.feeds.length === 0) {
    const error =
      "수집 대상 피드 소스가 없다(enabled && terms_checked인 rss·journalist·aggregator 0개)";
    log.error("collect.source.config", {
      error,
      excluded: plan.excluded.length,
    });
    return {
      outcome: { ...empty, excluded: plan.excluded, search, error },
      sources: [],
      runsRead: null,
      sourceNames: new Map(),
    };
  }

  // 수집 시간 창(M1-10, FR-07) — prod runs.json의 직전 성공 실행 기준. dev·dry도 같은 규칙. 읽기 실패는 51시간 + 경고.
  // 같은 읽기 결과를 소스 건강도 이력(M1-11)에도 쓴다 — 이번 실행을 기록하기 전의 runs.json이다.
  const runsRead = await readProdRunsForWindow(deps.dataDir);
  const sourceNames = new Map(plan.feeds.map((s) => [s.id, s.name] as const));
  const window = planCollectWindow({
    now: ctx.startedAt,
    runs: runsRead,
    sourceIds: plan.feeds.map((s) => s.id),
  });
  logWindowPlan(log, window);

  // 소스별 수집 — 다른 호스트는 동시에, 같은 호스트는 순서대로(간격), 단계 시간 예산 안에서(feed-collect.ts).
  // 결과·항목은 설정 순서 — 완료 순서와 무관하게 같은 응답이면 선별 결과가 같다. 한 소스의 실패가 다른 소스를 막지 않는다.
  const sourceById = new Map(plan.feeds.map((s) => [s.id, s] as const));
  hooks.onFeedsPlanned?.();
  const collected = await collectFeedSources(plan.feeds, {
    fetch: deps.fetch,
    userAgent: deps.userAgent,
    logger: log,
    policy: feedPolicy,
    clock: deps.feedClock,
  });
  const outcomes: SourceOutcome[] = collected.outcomes;
  // 창 적용: 창 밖·3시간 넘는 미래는 빼고, 5분~3시간 미래는 수집 시각으로 낮춘다(카드 src.at도 낮춘 값).
  // 겹침(직전 실행 − 3시간) 구간의 항목은 어제 카드일 수 있다 — 아래 seen-urls 기억(M1-12)이 뺀다.
  const windowed = applyCollectWindow(collected.items, window);
  logWindowApply(log, windowed.stats);
  const allItems = windowed.items;
  const sources = runSourceEntries(outcomes, windowed.stats);
  const stage = { sources, runsRead, sourceNames };
  const feedItems = outcomes.reduce((sum, o) => sum + o.items, 0);
  const failed = outcomes.filter((o) => !o.ok);
  const base = {
    feedItems,
    sources: outcomes,
    excluded: plan.excluded,
    search,
    window,
    windowStats: windowed.stats,
  };
  if (failed.length === outcomes.length) {
    const error = `모든 피드 소스 수집 실패(${failed.length}개)`;
    log.error("collect.news.fail", {
      reason: "all-sources-failed",
      sources: failed.length,
    });
    return { outcome: { ...empty, ...base, error }, ...stage };
  }

  // 오늘 발행 파일 — 깨져 있으면 덮어쓰지 않고 뉴스 단계 실패(exit 1).
  const filePath = newsFilePath(deps.dataDir, ctx.publishDate);
  let existing: NewsFile | null;
  try {
    existing = await readNewsFile(filePath);
  } catch (error) {
    log.error("collect.news.fail", {
      date: ctx.publishDate,
      error: errorText(error),
    });
    return {
      outcome: { ...empty, ...base, error: errorText(error) },
      ...stage,
    };
  }

  // 중복 제거(M1-12, FR-04): 정규화 URL 해시로 묶는다 — 대표 = 설정 순서상 처음 나온 항목(링크는 피드 원문), 묶음 소스의
  // 대회 태그는 카드를 만들 때 합친다(dedup.ts). 다른 날 이미 카드가 된 URL은 기억(seen-urls.ts)으로 뺀다.
  const deduped = dedupeFeedItems(allItems);
  const seenLoad = await loadSeen(deps, ctx, existing);
  const unseen = filterUnseen(deduped.groups, seenLoad.index);
  const dedup: DedupOutcome = {
    items: allItems.length,
    unique: deduped.groups.length,
    duplicates: deduped.duplicates,
    multiSource: deduped.groups.filter((g) => g.sources.length > 1).length,
    seenBefore: unseen.seenBefore.length,
  };

  // 선별(슬라이스): 최신순 상위 N건 → 원제목 카드. 카드 소스 = 대표 소스(출처명·tier 그대로) + 묶음 대회 합집합.
  // 묶음 최고 tier·최대 weight(meta.bestTier·maxWeight)는 점수화(M1-14) 입력 — 카드에는 쓰지 않는다.
  const cards = selectLatest(unseen.kept, deps.limit).flatMap((group) => {
    const meta = groupSource(group, sourceById);
    return meta ? [buildCard(group.item, meta.card, ctx.startedAt)] : [];
  });
  log.info("collect.select.done", {
    usable: collected.items.length,
    inWindow: allItems.length,
    unique: dedup.unique,
    duplicateLinks: dedup.duplicates,
    multiSource: dedup.multiSource,
    seenBefore: dedup.seenBefore,
    selected: cards.length,
    limit: deps.limit,
    failedSources: failed.length,
  });

  let seen: SeenOutcome = seenLoad.outcome;
  try {
    const merged = mergeCards(existing?.cards ?? [], cards);
    // 새 카드가 없으면 파일을 다시 쓰지 않는다(generatedAt만 바뀐 불필요한 data 커밋 방지).
    const unchanged = existing !== null && merged.added === 0;
    if (merged.cards.length === 0) {
      log.warn("collect.news.empty", { date: ctx.publishDate });
      return {
        outcome: { ...empty, ...base, ok: true, dedup, seen },
        ...stage,
      };
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
    // 기억 갱신(M1-12) — 발행 파일(이번에 쓴 것 또는 그대로 둔 것)의 카드로만. 발행 파일 쓰기가 실패하면 여기 오지 않는다.
    seen = await saveSeen(deps, seenLoad, merged.cards);
    return {
      outcome: {
        ...base,
        ok: true,
        selected: cards.length,
        added: merged.added,
        file: unchanged && !deps.dry ? existing : file,
        path: deps.dry || unchanged ? null : filePath,
        dedup,
        seen,
      },
      ...stage,
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
        dedup,
        seen,
        error: errorText(error),
      },
      ...stage,
    };
  }
}

// ─── ①-b 이미 카드가 된 URL 기억 (M1-12 — scripts/lib/seen-urls.ts) ────────

/** 로그·출력에 쓰는 기억 파일 이름 */
const SEEN_URLS_LABEL = `data/${SEEN_URLS_REL_PATH.split(path.sep).join("/")}`;

/** 기억 읽기 결과 — 쓰기 단계가 그대로 이어 쓴다 */
interface SeenLoad {
  index: SeenIndex;
  /** seen-urls.json의 urls(읽지 못했으면 {}) — 내용이 같으면 다시 쓰지 않는다 */
  storedUrls: Readonly<Record<string, string>>;
  /** 파일이 있었고 형식이 맞았는가 */
  storedOk: boolean;
  outcome: SeenOutcome;
}

/**
 * 기억 = seen-urls.json(90일 정리) ∪ 최근 발행 파일(D-1~D-3) ∪ 오늘 발행 파일. 읽기 오류는 경고만 하고 진행한다 —
 * 기억이 비어도 최근 발행 파일이 수집 창이 닿는 날짜의 중복을 막는다(seen-urls.ts 머리 주석).
 */
async function loadSeen(
  deps: CollectDeps,
  ctx: { publishDate: string; startedAt: string },
  existing: NewsFile | null,
): Promise<SeenLoad> {
  const log = deps.logger;
  const todayCards = existing?.cards ?? [];
  let readError: string | null = null;
  let recentErrors: SeenOutcome["recentErrors"] = [];
  let storedUrls: Readonly<Record<string, string>> = {};
  let storedOk = false;
  let index: SeenIndex;
  try {
    const stored = await readSeenUrls(deps.dataDir);
    readError = stored.error;
    storedUrls = stored.urls;
    storedOk = stored.exists && stored.error === null;
    if (stored.error !== null) {
      log.warn("collect.seen.unreadable", {
        file: SEEN_URLS_LABEL,
        error: stored.error,
      });
    }
    const recent = await readRecentNewsCards(
      deps.dataDir,
      ctx.publishDate,
      SEEN_RECENT_DAYS,
    );
    recentErrors = recent.errors;
    for (const failure of recent.errors) {
      log.warn("collect.seen.recent-unreadable", {
        date: failure.date,
        error: failure.error,
      });
    }
    index = buildSeenIndex({
      stored: stored.urls,
      recentCards: recent.cards,
      todayCards,
      now: ctx.startedAt,
    });
    log.info("collect.seen.load", {
      file: SEEN_URLS_LABEL,
      exists: stored.exists,
      stored: index.stored,
      pruned: index.pruned,
      backfilled: index.backfilled,
      recentDates: recent.dates,
      count: index.seen.size,
      todayKeys: index.todayKeys.size,
    });
  } catch (error) {
    // 방어선 — 기억 단계의 예상 밖 오류도 발행을 멈추지 않는다(오늘 파일 기준 중복 제거만 남는다)
    readError = errorText(error);
    log.warn("collect.seen.unreadable", {
      file: SEEN_URLS_LABEL,
      stage: "unexpected",
      error: readError,
    });
    index = buildSeenIndex({
      stored: {},
      recentCards: [],
      todayCards,
      now: ctx.startedAt,
    });
    storedOk = false;
  }
  return {
    index,
    storedUrls,
    storedOk,
    outcome: {
      readError,
      recentErrors,
      size: index.seen.size,
      pruned: index.pruned,
      backfilled: index.backfilled,
      added: 0,
      written: null,
      writeError: null,
    },
  };
}

/**
 * 발행 파일의 카드로 기억을 갱신해 쓴다 — dry는 쓰지 않고 출력만, 내용(updatedAt 제외)이 같으면 쓰지 않는다.
 * 쓰기 실패는 던지지 않고 결과에 남긴다(발행은 계속 — 실행 상태 partial).
 */
async function saveSeen(
  deps: CollectDeps,
  load: SeenLoad,
  cards: readonly NewsCard[],
): Promise<SeenOutcome> {
  const log = deps.logger;
  // 갱신·비교·쓰기 전부 try 안 — 발행 파일은 이미 썼으므로 기억 단계의 어떤 오류도 뉴스 단계를 실패시키지 않는다
  try {
    const { seen, added } = updateSeen(load.index.seen, cards);
    const outcome: SeenOutcome = { ...load.outcome, added };
    const fields = {
      file: SEEN_URLS_LABEL,
      count: seen.size,
      added,
      pruned: load.outcome.pruned,
      backfilled: load.outcome.backfilled,
    };
    if (load.storedOk && sameSeen(load.storedUrls, seen)) {
      log.info("collect.seen.unchanged", fields);
      return outcome;
    }
    const file = buildSeenUrlsFile(seen, nowUtcIso(deps.now()));
    if (deps.dry) {
      log.info("collect.seen.dry", fields);
      deps.print(
        `── [dry] ${SEEN_URLS_LABEL} — 쓰지 않음 (기억 ${seen.size}개, 새로 ${added}개, 정리 ${load.outcome.pruned}개, 발행 파일에서 채움 ${load.outcome.backfilled}개, ${serializeSeenUrls(file).length}바이트)`,
      );
      return outcome;
    }
    try {
      const written = await writeSeenUrls(deps.dataDir, file);
      log.info("collect.seen.write", fields);
      return { ...outcome, written };
    } catch (error) {
      const writeError = errorText(error);
      log.warn("collect.seen.fail", { ...fields, error: writeError });
      return { ...outcome, writeError };
    }
  } catch (error) {
    // 방어선 — 갱신·검증의 예상 밖 오류(쓰기 전)
    const writeError = errorText(error);
    log.warn("collect.seen.fail", {
      file: SEEN_URLS_LABEL,
      stage: "unexpected",
      error: writeError,
    });
    return { ...load.outcome, writeError };
  }
}

// ─── ② 경기 데이터 (M1-44·M1-48) ──────────────────────────────────────────

/** 경기 데이터 단계가 호출 수를 더하는 곳(실행 기록 apiCalls) */
interface ApiCallSink {
  apiCalls: { footballData: number; apiFootball: number };
}

/** football-data 단계 — 전날(KST 창) 종료 경기 + 그 경기가 있는 대회의 현재 순위. 던지지 않는다 */
async function runFootballDataProvider(
  deps: CollectDeps,
  ctx: { publishDate: string },
  sink: ApiCallSink,
  signal: AbortSignal,
): Promise<ProviderOutcome<FootballDataBriefData>> {
  const log = deps.logger;
  const now = deps.footballDataNow ?? Date.now;
  const started = now();
  const elapsed = () => Math.max(0, now() - started);
  const apiKey = deps.footballDataApiKey?.trim();
  if (!apiKey) {
    log.warn("collect.matchdata.skip", {
      provider: "football-data",
      reason: "no-api-key",
      missing: "FOOTBALL_DATA_API_KEY",
    });
    return {
      provider: "football-data",
      state: "skipped",
      reason: "no-api-key",
      elapsedMs: 0,
    };
  }
  let competitions: CompetitionsFile;
  try {
    competitions = await readConfigFile(
      deps.rootDir,
      "competitions.json",
      CompetitionsFileSchema,
    );
  } catch (error) {
    log.error("collect.matchdata.fail", {
      provider: "football-data",
      stage: "setup",
      errorType: "setup",
      error: errorText(error),
    });
    return {
      provider: "football-data",
      state: "failed",
      errorType: "setup",
      error: errorText(error),
      elapsedMs: elapsed(),
    };
  }
  const window = briefInputWindow(ctx.publishDate);
  // 단계 시간 예산(150초) — 근거는 providers/football-data.ts 머리 주석. TODO(M1-47): 브리핑 마감에서 거꾸로 계산
  const client = createFootballDataClient({
    apiKey,
    fetch: deps.fetch,
    sleep: deps.footballDataSleep,
    now,
    deadline: started + FOOTBALL_DATA_STAGE_BUDGET_MS,
    signal,
    onRetry: (event) =>
      log.warn("collect.matchdata.retry", {
        provider: "football-data",
        path: event.path,
        retry: event.retry,
        errorType: event.error.kind,
        status: event.error.status,
        delayMs: event.delayMs,
      }),
  });
  let data: FootballDataBriefData;
  try {
    data = await fetchBriefFootballData({
      client,
      competitions,
      window,
      now: deps.now,
    });
  } catch (error) {
    const errorType =
      error instanceof FootballDataError ? error.kind : "unexpected";
    log.error("collect.matchdata.fail", {
      provider: "football-data",
      stage: "matches",
      errorType,
      status: error instanceof FootballDataError ? error.status : null,
      retrySkipped:
        error instanceof FootballDataError ? error.retrySkipped : null,
      error: errorText(error),
      apiCalls: client.calls,
      elapsedMs: elapsed(),
    });
    return {
      provider: "football-data",
      state: "failed",
      errorType,
      error: errorText(error),
      elapsedMs: elapsed(),
    };
  } finally {
    sink.apiCalls.footballData += client.calls;
  }
  for (const failed of data.standingsFailed) {
    // 그 대회 순위만 빠진다 — 브리핑은 진행(순위를 입력에 넣는 것은 M1-19)
    log.warn("collect.standings.fail", {
      provider: "football-data",
      comp: failed.comp,
      errorType: failed.errorType,
      error: failed.error,
    });
  }
  log.info("collect.matchdata.done", {
    provider: "football-data",
    date: ctx.publishDate,
    windowStart: window.start,
    windowEnd: window.end,
    fetched: data.fetched,
    finished: data.results.length,
    skipped: data.skipped,
    inProgress: data.inProgress,
    standings: data.standings.map((s) => s.comp),
    standingsRows: data.standings.reduce(
      (sum, s) => sum + s.tables.reduce((n, t) => n + t.rows.length, 0),
      0,
    ),
    standingsFailed: data.standingsFailed.map((f) => f.comp),
    apiCalls: client.calls,
    retries: client.retries,
    elapsedMs: elapsed(),
  });
  return {
    provider: "football-data",
    state: "done",
    data,
    elapsedMs: elapsed(),
  };
}

/** runs 파일 읽기 — 오류는 던지지 않고 빈 기록 + 오류(카운터는 기록된 만큼만 센다) */
async function readRunsQuiet(
  env: RunEnv,
  dataDir: string,
): Promise<{ runs: RunLog[]; error: string | null }> {
  try {
    return { runs: await readRuns(runsPathFor(env, dataDir)), error: null };
  } catch (error) {
    return { runs: [], error: errorText(error) };
  }
}

/**
 * API-Football 경기 단건 단계(M1-48) — 날짜 조회 D-1·D → 대상 경기 상세(브리핑 경기 먼저) → 이월 목록. 던지지 않는다.
 * `onBrief`는 브리핑 몫(컷오프까지 받은 brief 계층)을 한 번 넘긴다 — 건너뛰거나 실패하면 부르지 않는다(호출부가 null로 마감).
 * 호출 수는 `sink.apiCalls.apiFootball`에 더한다(실행 기록 → 다음 실행의 일일 카운터).
 */
async function runApiFootballProvider(
  deps: CollectDeps,
  ctx: { publishDate: string },
  sink: ApiCallSink,
  signal: AbortSignal,
  onBrief: (snapshot: AfBriefSnapshot) => void,
): Promise<ProviderOutcome<ApiFootballData>> {
  const log = deps.logger;
  const now = deps.apiFootballNow ?? Date.now;
  const started = now();
  const elapsed = () => Math.max(0, now() - started);
  const skip = (
    reason: "no-api-key" | "daily-cap" | "cancelled" | "dev-quiet-hours",
  ) =>
    ({
      provider: "api-football",
      state: "skipped",
      reason,
      elapsedMs: elapsed(),
    }) as const;
  const apiKey = deps.apiFootballApiKey?.trim();
  if (!apiKey) {
    log.warn("collect.matchdata.skip", {
      provider: "api-football",
      reason: "no-api-key",
      missing: "API_FOOTBALL_KEY",
    });
    return skip("no-api-key");
  }
  // 개발 실행은 봇 수집 시간대(06:00~08:00 KST)에 API-Football을 부르지 않는다 — 분당·일 한도를 봇과 나눠 쓴다(CLAUDE.md §6.4)
  if (deps.env === "dev" && isDevQuietHours(nowUtcIso(deps.now()))) {
    log.warn("collect.matchdata.skip", {
      provider: "api-football",
      reason: "dev-quiet-hours",
      kst: `${API_FOOTBALL_DEV_QUIET_HOURS.fromKst}~${API_FOOTBALL_DEV_QUIET_HOURS.toKst}`,
    });
    return skip("dev-quiet-hours");
  }

  // 설정 — 대상(6개 대회 + 활성 한국 선수 소속팀 af)·실행당 상한·원장 한국 선수·시즌. 실패하면 이 프로바이더만 실패(브리핑은
  // 득점자 없이)
  let target: AfTargetBuild;
  let perRunCap: number | null;
  let players: KoreanPlayerTargets;
  let season: number | null;
  try {
    perRunCap = resolveApiFootballMaxCalls(deps.apiFootballMaxCalls);
    const [competitions, koreanPlayers, teamIds] = await Promise.all([
      readConfigFile(deps.rootDir, "competitions.json", CompetitionsFileSchema),
      readConfigFile(
        deps.rootDir,
        "korean-players.json",
        KoreanPlayersFileSchema,
      ),
      loadTeamIds(deps.rootDir),
    ]);
    target = buildAfTargetConfig({ competitions, koreanPlayers, teamIds });
    players = koreanPlayerTargets(koreanPlayers, teamIds);
    season =
      competitions.length > 0
        ? Math.max(...competitions.map((c) => c.season))
        : null;
  } catch (error) {
    log.error("collect.matchdata.fail", {
      provider: "api-football",
      stage: "setup",
      errorType: "setup",
      error: errorText(error),
    });
    return {
      provider: "api-football",
      state: "failed",
      errorType: "setup",
      error: errorText(error),
      elapsedMs: elapsed(),
    };
  }
  if (target.unmappedTeams.length > 0) {
    // 그 팀의 기타 대회 경기를 고르지 못한다(지난 날짜는 다시 받을 수 없다) — validate 교차 검사가 커밋 전에 막는 경우
    log.warn("collect.matchdata.korean-team-unmapped", {
      provider: "api-football",
      teams: target.unmappedTeams,
      file: "configs/team-ids.json",
    });
  }

  // 우리 쪽 일일 카운터 — runs.json·runs-dev.json apiCalls.apiFootball의 같은 UTC 날 합(API 리셋 00:00 UTC)
  const nowIso = nowUtcIso(deps.now());
  const [prod, dev] = await Promise.all([
    readRunsQuiet("prod", deps.dataDir),
    readRunsQuiet("dev", deps.dataDir),
  ]);
  for (const [file, read] of [
    ["runs.json", prod],
    ["runs-dev.json", dev],
  ] as const) {
    if (read.error !== null) {
      log.warn("collect.matchdata.runs-unreadable", {
        provider: "api-football",
        file,
        error: read.error,
      });
    }
  }
  // 기록을 읽지 못하면 오늘 사용량을 모른다 — fail-closed로 작은 상한(API_FOOTBALL_RUNS_UNREADABLE_CAP)을 건다
  const allowance = apiFootballCallAllowance({
    env: deps.env,
    prodRuns: prod.runs,
    devRuns: dev.runs,
    now: nowIso,
    perRunCap,
    runsUnreadable: prod.error !== null || dev.error !== null,
  });
  log.info("collect.matchdata.quota", {
    provider: "api-football",
    env: deps.env,
    utcDate: utcDate(nowIso),
    cap: allowance.cap,
    usedOwn: allowance.usedOwn,
    usedTotal: allowance.usedTotal,
    perRunCap: allowance.perRunCap,
    remaining: allowance.remaining,
    limitedBy: allowance.limitedBy,
    runsUnreadable: allowance.runsUnreadable,
  });
  if (allowance.remaining <= 0) {
    log.warn("collect.matchdata.skip", {
      provider: "api-football",
      reason: "daily-cap",
      limitedBy: allowance.limitedBy,
    });
    return skip("daily-cap");
  }
  if (signal.aborted) return skip("cancelled");

  const pendingRead = await readAfPending(deps.dataDir);
  if (pendingRead.error !== null) {
    // 빈 목록으로 진행 — 이번 쓰기가 새 파일로 고친다(이월 경기는 날짜 창 안이면 날짜 조회로 다시 들어온다)
    log.warn("collect.matchdata.pending-unreadable", {
      provider: "api-football",
      file: "data/cache/af-pending.json",
      error: pendingRead.error,
    });
  }
  // 원장(M1-48b) — 근처 달의 af-<id>는 이미 받은 경기라 다시 받지 않는다(이월 정리 "원장에 있음"). 읽지 못한 달은 known에서
  // 빠지고(다시 받는다) 그 달은 쓰지 않는다 — 검증 게이트가 손상 파일의 커밋을 막으므로 드문 경우다.
  const ledgerRead = await readLedgerWindow(
    deps.dataDir,
    ledgerMonthsAround(nowIso),
  );
  for (const e of ledgerRead.errors) {
    log.warn("collect.ledger.read-fail", {
      provider: "api-football",
      file: e.file,
      error: e.error,
    });
  }
  const briefWindow = briefInputWindow(ctx.publishDate);
  const dates = afQueryDates(nowIso, briefWindow);
  const client = createApiFootballClient({
    apiKey,
    fetch: deps.fetch,
    sleep: deps.apiFootballSleep,
    now,
    deadline: started + API_FOOTBALL_STAGE_BUDGET_MS,
    maxCalls: allowance.remaining,
    signal,
    onRetry: (event) =>
      log.warn("collect.matchdata.retry", {
        provider: "api-football",
        path: event.path,
        retry: event.retry,
        errorType: event.error.kind,
        status: event.error.status,
        delayMs: event.delayMs,
      }),
  });
  let stage: AfStageResult;
  try {
    stage = await runApiFootballStage({
      client,
      targets: target.targets,
      pending: pendingRead.fixtures,
      // 원장(data/matches/YYYY-MM.json)의 af-<id> — 이미 받은 경기는 다시 받지 않는다. 단 불완전 항목이 이월 목록에 있으면
      // 빼서 다시 받는다(ledgerPlanKnown — 상한에 걸려 이월에서 빠지면 확정). 원장은 정기 운영 prod 실행만 쓰므로 개발·정기 운영
      // 전 실행에서는 대개 비어 있다(날짜 창의 종료 대상 경기를 실행마다 다시 받는다 — 상한 안).
      known: ledgerPlanKnown(
        ledgerRead,
        new Set(pendingRead.fixtures.map((f) => f.id)),
      ),
      briefWindow,
      dates,
      now: deps.now,
      clock: now,
      // TODO(M1-47): 브리핑 마감(계절별) − LLM 여유로 계산
      briefCutoffAt: started + API_FOOTBALL_BRIEF_CUTOFF_MS,
      onBriefReady: (snapshot) => {
        log.info("collect.matchdata.brief-ready", {
          provider: "api-football",
          reason: snapshot.reason,
          details: snapshot.details.length,
          missing: snapshot.missing.length,
          apiCalls: client.calls,
          elapsedMs: elapsed(),
        });
        onBrief(snapshot);
      },
    });
  } finally {
    sink.apiCalls.apiFootball += client.calls;
  }

  for (const d of stage.dates) {
    if (d.ok) continue;
    log.warn("collect.matchdata.date.fail", {
      provider: "api-football",
      date: d.date,
      errorType: d.errorType ?? null,
      error: d.error ?? null,
    });
  }
  if (stage.degraded) {
    // FR-65: 재시도 없이 경기 상세(득점자·라인업·한국 선수 기록)를 폴백으로 강등 — 실행·발행은 계속
    log.error("collect.matchdata.degraded", {
      provider: "api-football",
      fallback: "FR-65",
      endpoint: stage.degraded.endpoint,
      error: stage.degraded.message,
    });
  }
  const results = stage.outcomes.reduce<Record<string, number>>((acc, o) => {
    acc[o.result.kind] = (acc[o.result.kind] ?? 0) + 1;
    return acc;
  }, {});
  for (const o of stage.outcomes) {
    if (o.result.kind !== "failed") continue;
    log.warn("collect.matchdata.fixture.fail", {
      provider: "api-football",
      fixture: o.task.id,
      tier: o.task.tier,
      errorType: o.result.errorType,
    });
  }

  // 원장(M1-48b) — 항목·한국 선수 행·이름 후보는 늘 만들고(로그·dry 출력), 정기 운영 prod 실행만 쓴다. 이월 목록보다 먼저 —
  // 원장에 넣지 못한 경기는 이월 목록에 다시 넣는다(받은 경기가 원장·이월 어디에도 없이 사라지지 않게).
  const ledger = await runLedgerStep(deps, {
    nowIso: nowUtcIso(deps.now()),
    stage,
    read: ledgerRead,
    players,
    season,
    pendingBefore: pendingRead.fixtures,
    cancelled: signal.aborted,
  });
  if (ledger.pending) {
    stage = {
      ...stage,
      pending: ledger.pending.fixtures,
      dropped: [...stage.dropped, ...ledger.pending.dropped].sort(
        (a, b) => a.id - b.id,
      ),
    };
  }

  // 이월 목록 — prod·비dry만 쓴다(dev 실행은 쓰지 않음 — 리뷰 권장 4, 원장과 같은 기준), 취소(뉴스 실패 → 커밋 안 됨)도 쓰지 않는다.
  // 내용이 같으면 다시 쓰지 않는다(불필요한 data 커밋 방지)
  const changed =
    !sameAfPending(pendingRead.fixtures, stage.pending) ||
    pendingRead.error !== null;
  let written: string | null = null;
  const writable =
    deps.env === "prod" &&
    !deps.dry &&
    stage.stoppedBy !== "cancelled" &&
    changed &&
    (pendingRead.exists || stage.pending.length > 0);
  if (writable) {
    try {
      written = await writeAfPending(
        deps.dataDir,
        buildAfPendingFile(stage.pending, nowUtcIso(deps.now())),
      );
    } catch (error) {
      // 이월 목록을 못 쓰면 다음 실행이 날짜 창 밖 미종료 경기를 놓칠 수 있다 — 수집·발행은 계속
      log.error("collect.matchdata.pending.fail", {
        provider: "api-football",
        file: afPendingPath(deps.dataDir),
        error: errorText(error),
      });
    }
  }
  log.info("collect.matchdata.done", {
    provider: "api-football",
    date: ctx.publishDate,
    dates: stage.dates.map((d) => `${d.date}:${d.ok ? d.listed : "fail"}`),
    targets: stage.counts.targets,
    koreanOther: stage.counts.koreanOther,
    friendly: stage.counts.friendly,
    planned: stage.planned,
    results,
    details: stage.details.length,
    goalsIncomplete: stage.details.filter((d) => !d.goalsComplete).length,
    brief: stage.brief.reason,
    briefDetails: stage.brief.details.length,
    pending: stage.pending.length,
    dropped: stage.dropped.length,
    pendingWritten: written !== null,
    stoppedBy: stage.stoppedBy,
    apiCalls: client.calls,
    retries: client.retries,
    // 응답 헤더의 남은 한도(참고 — 일 남은 수는 일관되지 않아 상한은 우리 쪽 카운터로 지킨다, M0-29)
    dayRemaining: client.rate.dayRemaining,
    minuteRemaining: client.rate.minuteRemaining,
    elapsedMs: elapsed(),
  });
  return {
    provider: "api-football",
    state: "done",
    data: {
      stage,
      allowance,
      calls: client.calls,
      retries: client.retries,
      rate: client.rate,
      unmappedTeams: target.unmappedTeams,
      ledger,
      pendingFile: { readError: pendingRead.error, changed, written },
    },
    elapsedMs: elapsed(),
  };
}

// ─── 경기 기록 원장 (M1-48b) ──────────────────────────────────────────────

/** 원장 쓰기 결과 로그(달·메타·오류) */
function logLedgerApplied(log: Logger, applied: LedgerApplyResult): void {
  for (const m of applied.months) {
    log[m.error ? "error" : "info"]("collect.ledger.month", {
      month: m.month,
      added: m.added,
      replaced: m.replaced,
      written: m.written !== null,
      error: m.error,
    });
  }
  const meta = applied.meta;
  log[applied.state === "started" ? "info" : "warn"]("collect.ledger.meta", {
    state: applied.state,
    created: meta?.created ?? false,
    changed: meta?.changed ?? false,
    written: applied.metaWritten !== null,
    since: meta?.meta?.since ?? null,
    playersAdded: (meta?.playersAdded ?? []).map((p) => `${p.slug}:${p.since}`),
    gapsAdded: (meta?.gapsAdded ?? []).map(
      (g) => `${g.date}:${g.reason}${g.cause ? `(${g.cause})` : ""}`,
    ),
    gapsHealed: (meta?.gapsHealed ?? []).map((g) => `${g.date}:${g.reason}`),
    gaps: meta?.meta?.gaps.length ?? null,
    seasonMismatch: meta?.seasonMismatch ?? false,
  });
  if (applied.errors.length > 0) {
    log.error("collect.ledger.fail", { errors: applied.errors });
  }
}

/**
 * 원장 단계(API-Football이 끝난 실행) — 상세 → 원장 항목·한국 선수 행·이름 후보(메모리, 로그), 정기 운영 prod 실행이면 달 파일 →
 * 이월 목록 갱신 → 메타 쓰기. 이월 목록 갱신(`pending`)은 호출부가 받아 쓴다:
 *   - 원장에 넣지 못한 경기·형식 오류 경기 → 다시 받는다(재조회 +1)
 *   - 원장에 들어갔지만 불완전한 경기(득점 불완전·라인업 없음) → 이월 목록에 올려 다시 받는다(처음 0, 재조회 +1 — 상한에 걸리면 확정)
 *   - 이 갱신에서 정리 규칙(3일·재조회 3회)으로 버린 경기도 빠진 날(dropped)에 남긴다(메타보다 먼저 갱신하는 이유)
 * 던지지 않는다.
 */
async function runLedgerStep(
  deps: CollectDeps,
  ctx: {
    nowIso: string;
    stage: AfStageResult;
    read: LedgerWindowRead;
    players: KoreanPlayerTargets;
    season: number | null;
    pendingBefore: readonly AfPendingEntry[];
    cancelled: boolean;
  },
): Promise<LedgerOutcome> {
  const log = deps.logger;
  const build = buildLedgerEntries(ctx.stage.details, ctx.players);
  const slugById = new Map(
    ctx.players.tracked.map((p) => [p.apiFootballId, p.slug] as const),
  );
  const korean: KoreanRowView[] = build.entries.flatMap((e) =>
    e.korean.map((r) => ({
      matchId: afIdOfKey(e.id) ?? 0,
      player: slugById.get(r.player) ?? String(r.player),
      status: r.status,
      minutes: r.minutes,
      goals: r.goals,
      assists: r.assists,
    })),
  );
  for (const row of korean) log.info("collect.ledger.korean", { ...row });
  // apiFootballId 없는 활성 선수 — 소속팀 경기 라인업 이름 대조 후보(운영 리포트 M5-09 입력, 사람이 확인해 configs에 id를 채운다)
  for (const check of build.nameChecks) {
    log[check.candidates.length > 0 ? "warn" : "info"](
      "collect.ledger.player-candidate",
      {
        player: check.player,
        match: check.matchId,
        side: check.side,
        lineup: check.lineup,
        candidates: check.candidates.map(
          (c) =>
            `${c.name}(${c.id ?? "id 없음"}) ${c.basis} ${c.status}${c.minutes !== null ? ` ${c.minutes}분` : ""}`,
        ),
      },
    );
  }
  for (const bad of build.invalid) {
    log.error("collect.ledger.entry.invalid", {
      fixture: bad.id,
      error: bad.error,
    });
  }
  const mode = ledgerWriteMode({
    env: deps.env,
    dry: deps.dry,
    enabled: deps.ledgerEnabled ?? false,
    cancelled: ctx.cancelled || ctx.stage.stoppedBy === "cancelled",
  });
  const outcome: LedgerOutcome = {
    mode,
    entries: build.entries,
    invalid: build.invalid,
    korean,
    nameChecks: build.nameChecks,
    known: ctx.stage.counts.known,
    readErrors: ctx.read.errors,
    applied: null,
    requeued: [],
    incomplete: [],
    pending: null,
  };
  if (mode !== "write") {
    log.info("collect.ledger.skip", {
      reason: mode,
      entries: build.entries.length,
      koreanRows: korean.length,
      known: outcome.known,
      incomplete: build.entries.filter(isIncompleteLedgerMatch).length,
    });
    return outcome;
  }
  // 이월 정리로 버린 경기(3일·재조회 3회)의 킥오프 — 빠진 날(dropped)
  const kickoffById = new Map<number, string>();
  for (const p of ctx.pendingBefore) kickoffById.set(p.id, p.kickoff);
  for (const o of ctx.stage.outcomes)
    kickoffById.set(o.task.id, o.task.kickoff);
  const droppedWithKickoff = (dropped: readonly AfDropped[]) =>
    dropped.flatMap((d) => {
      if (d.reason !== "expired" && d.reason !== "requery-limit") return [];
      const kickoff = kickoffById.get(d.id);
      return kickoff === undefined ? [] : [{ id: d.id, kickoff }];
    });
  /** 원장 사정으로 이월 목록에 다시 넣기(달 파일 뒤·메타 앞) */
  const requeue = (r: LedgerSettleInput): AfPendingUpdate | null => {
    const ids = new Set([...r.unstored, ...build.invalid.map((i) => i.id)]);
    const incomplete = new Set(r.incomplete);
    outcome.requeued = [...ids].sort((a, b) => a - b);
    outcome.incomplete = [...incomplete].sort((a, b) => a - b);
    if (ids.size === 0 && incomplete.size === 0) return null;
    return requeueAfPending({
      pending: ctx.stage.pending,
      outcomes: ctx.stage.outcomes,
      ids,
      incomplete,
      now: ctx.nowIso,
    });
  };
  try {
    const applied = await applyLedger({
      dataDir: deps.dataDir,
      now: ctx.nowIso,
      read: ctx.read,
      entries: build.entries,
      facts: {
        season: ctx.season,
        dates: ctx.stage.dates.map((d) => ({
          date: d.date,
          ok: d.ok,
          ...(d.errorType ? { errorType: d.errorType } : {}),
        })),
        skipped: null,
        dropped: droppedWithKickoff(ctx.stage.dropped),
        tracked: ctx.players.tracked,
      },
      settle: (r) => {
        outcome.pending = requeue(r);
        return { dropped: droppedWithKickoff(outcome.pending?.dropped ?? []) };
      },
    });
    outcome.applied = applied;
    logLedgerApplied(log, applied);
  } catch (error) {
    // 방어선 — applyLedger는 던지지 않는다. 여기 오면 원장 쓰기 전체를 실패로 남기고 받은 경기를 이월에 다시 넣는다
    log.error("collect.ledger.fail", { errors: [errorText(error)] });
    const all = build.entries.flatMap((e) => {
      const id = afIdOfKey(e.id);
      return id === null ? [] : [id];
    });
    outcome.applied = {
      state: "started",
      months: [],
      unstored: all,
      incomplete: [],
      beforeSince: [],
      meta: null,
      metaWritten: null,
      errors: [errorText(error)],
    };
    outcome.pending = requeue({ unstored: all, incomplete: [] });
  }
  if (outcome.requeued.length > 0 || outcome.incomplete.length > 0) {
    log[outcome.requeued.length > 0 ? "warn" : "info"](
      "collect.ledger.requeue",
      {
        provider: "api-football",
        unstored: outcome.requeued,
        incomplete: outcome.incomplete,
        droppedByRule: (outcome.pending?.dropped ?? []).map(
          (d) => `${d.id}:${d.reason}`,
        ),
      },
    );
  }
  return outcome;
}

/**
 * API-Football 단계가 끝나지 않은 실행(건너뜀·실패)의 원장 — 정기 운영 prod 실행이면 이번에 조회했어야 할 날짜 중 첫 기회인 오늘(UTC)
 * 날짜만 빠진 날(skipped)로 남긴다(어제 날짜는 마지막 기회라 기존 공백만 유지 — match-ledger.ts nextLedgerMeta). 원장이 이미 시작됐을
 * 때만, 나중 실행이 그 날짜를 받으면 지운다. 그 밖은 null. 던지지 않는다.
 */
async function runLedgerForUnfinishedStage(
  deps: CollectDeps,
  ctx: { publishDate: string },
  af: ProviderOutcome<ApiFootballData>,
  signal: AbortSignal,
): Promise<LedgerOutcome | null> {
  if (af.state === "done") return af.data.ledger;
  const cause = af.state === "skipped" ? af.reason : af.errorType;
  const mode = ledgerWriteMode({
    env: deps.env,
    dry: deps.dry,
    enabled: deps.ledgerEnabled ?? false,
    cancelled: signal.aborted || cause === "cancelled",
  });
  if (mode !== "write") return null;
  const log = deps.logger;
  const nowIso = nowUtcIso(deps.now());
  const dates = afQueryDates(nowIso, briefInputWindow(ctx.publishDate));
  const outcome: LedgerOutcome = {
    mode,
    entries: [],
    invalid: [],
    korean: [],
    nameChecks: [],
    known: 0,
    readErrors: [],
    applied: null,
    requeued: [],
    incomplete: [],
    pending: null,
  };
  try {
    outcome.applied = await applyLedger({
      dataDir: deps.dataDir,
      now: nowIso,
      read: await readLedgerWindow(deps.dataDir, []),
      entries: [],
      facts: {
        season: null,
        dates: [],
        skipped: { dates, cause },
        dropped: [],
        tracked: [],
      },
    });
    logLedgerApplied(log, outcome.applied);
  } catch (error) {
    log.error("collect.ledger.fail", { errors: [errorText(error)] });
  }
  return outcome;
}

/** football-data 종료 경기 ↔ API-Football 상세 연결 + 대응표 후보 로그(운영 리포트 M5-09가 모은다). 던지지 않는다 */
async function pairMatchData(
  deps: CollectDeps,
  fd: ProviderOutcome<FootballDataBriefData>,
  af: ProviderOutcome<ApiFootballData>,
): Promise<MatchLinkResult | null> {
  if (fd.state !== "done" || af.state !== "done") return null;
  const log = deps.logger;
  try {
    const index = buildTeamIdIndex(await loadTeamIds(deps.rootDir));
    const result = linkMatchDetails(
      fd.data.results,
      af.data.stage.details,
      index,
      { afUniverse: af.data.stage.listed, fdUniverse: fd.data.others },
    );
    log.info("collect.matchdata.pairing", {
      fdFinished: fd.data.results.length,
      afDetails: af.data.stage.details.filter((d) => d.comp !== null).length,
      afListed: af.data.stage.listed.length,
      fdOthers: fd.data.others.length,
      linked: result.links.length,
      linkedByTeamIds: result.links.filter((l) => l.linkedBy === "team-ids")
        .length,
      linkedByEvidence: result.links.filter((l) => l.linkedBy === "evidence")
        .length,
      unconfirmed: result.unconfirmed.length,
      unconfirmedReasons: result.unconfirmed.map(
        (u) => `${u.fdMatchId}↔${u.afMatchId}:${u.reason}`,
      ),
      candidates: result.report.candidates.length,
      conflicts: result.report.conflicts.length,
      ambiguous: result.report.ambiguous.length,
      unmatched: result.report.unmatched.length,
    });
    // D37 — 강한 증거로 자동 연결한 팀 쌍. configs/team-ids.json은 고치지 않는다(사람이 모아서 옮긴다 — 운영 리포트 M5-09 후보)
    for (const a of result.autoLinked) {
      log.info("collect.teamids.auto-link", {
        kind: a.kind,
        slug: a.slug,
        fd: `${a.fd.name}(${a.fd.id})`,
        af: `${a.af.name}(${a.af.id})`,
        evidence: a.evidence.map((e) => `${e.fdMatchId}↔${e.afMatchId}`),
      });
    }
    // 대응표에 없는 팀 — 후보를 알린다(D33, 사람이 확인해 team-ids.json에 넣는다). 자동 연결된 쌍이면 autoLinked
    const autoKeys = new Set(
      result.autoLinked.map((a) => `${a.fd.id}:${a.af.id}`),
    );
    for (const c of result.report.candidates) {
      log.info("collect.teamids.candidate", {
        kind: c.kind,
        slug: c.slug,
        fd: `${c.fd.name}(${c.fd.id})`,
        af: `${c.af.name}(${c.af.id})`,
        autoLinked: autoKeys.has(`${c.fd.id}:${c.af.id}`),
        evidence: c.evidence.map((e) => `${e.fdMatchId}↔${e.afMatchId}`),
      });
    }
    for (const c of result.report.conflicts) {
      log.warn("collect.teamids.conflict", {
        kind: c.kind,
        fd: `${c.fd.name}(${c.fd.id})`,
        af: `${c.af.name}(${c.af.id})`,
        detail: c.detail,
      });
    }
    return result;
  } catch (error) {
    log.warn("collect.matchdata.pairing.fail", { error: errorText(error) });
    return null;
  }
}

/** 경기 데이터 단계 핸들 — 브리핑이 기다릴 몫과 전체 완료를 따로 돌려준다 */
interface MatchDataStage {
  /** football-data 결과 + API-Football 브리핑 몫(컷오프 시점) */
  briefView: Promise<MatchDataBriefView>;
  /** 두 프로바이더가 모두 끝난 최종 결과(짝짓기 포함) */
  done: Promise<MatchDataOutcome>;
}

/**
 * 경기 데이터 단계 시작 — 프로바이더별 병렬, 한 프로바이더의 실패(예상 밖 예외 포함)는 그 프로바이더만 실패로 남긴다.
 * `signal`이 켜지면(뉴스 실패) 두 프로바이더가 새 요청을 보내지 않는다. 던지지 않는다.
 */
function startMatchDataStage(
  deps: CollectDeps,
  ctx: { publishDate: string },
  sink: ApiCallSink,
  signal: AbortSignal,
): MatchDataStage {
  const now = deps.footballDataNow ?? Date.now;
  const started = now();
  const footballData = isolateProvider(
    "football-data",
    () => runFootballDataProvider(deps, ctx, sink, signal),
    now,
  );
  let resolveBrief: (snapshot: AfBriefSnapshot | null) => void = () =>
    undefined;
  const apiFootballBrief = new Promise<AfBriefSnapshot | null>((resolve) => {
    resolveBrief = resolve;
  });
  const apiFootball = isolateProvider(
    "api-football",
    () =>
      runApiFootballProvider(deps, ctx, sink, signal, (s) => resolveBrief(s)),
    deps.apiFootballNow ?? Date.now,
  ).finally(() => resolveBrief(null)); // 건너뜀·실패·예상 밖 예외 — 브리핑은 API-Football 몫 없이 진행

  // football-data가 끝나지 않았으면(실패·건너뜀) 브리핑은 생략되므로 API-Football 몫을 기다리지 않는다
  const briefView = footballData.then(async (fd) => ({
    footballData: fd,
    apiFootballBrief: fd.state === "done" ? await apiFootballBrief : null,
  }));
  const done = Promise.all([footballData, apiFootball, apiFootballBrief]).then(
    async ([fd, af, brief]) => {
      for (const outcome of [fd, af]) {
        if (outcome.state === "failed" && outcome.errorType === "unexpected") {
          deps.logger.error("collect.matchdata.fail", {
            provider: outcome.provider,
            stage: "unexpected",
            error: outcome.error,
          });
        }
      }
      const outcome: MatchDataOutcome = {
        footballData: fd,
        apiFootball: af,
        apiFootballBrief: brief,
        pairing: await pairMatchData(deps, fd, af),
        ledger: await runLedgerForUnfinishedStage(deps, ctx, af, signal),
        elapsedMs: Math.max(0, now() - started),
      };
      if (deps.dry) deps.print(formatMatchDataSummary(outcome));
      return outcome;
    },
  );
  return { briefView, done };
}

/** 사람이 읽는 경기 데이터 요약(dry 출력) */
export function formatMatchDataSummary(outcome: MatchDataOutcome): string {
  const lines = [`── [dry] 경기 데이터 (${outcome.elapsedMs}ms, 병렬)`];
  const fd = outcome.footballData;
  if (fd.state === "done") {
    const standings = fd.data.standings.map((s) => {
      const rows = s.tables.reduce((n, t) => n + t.rows.length, 0);
      return `${s.comp} ${rows}팀${s.inProgress > 0 ? `(진행 중 ${s.inProgress}경기 반영)` : ""}`;
    });
    lines.push(
      `football-data: 응답 ${fd.data.fetched}경기 → 창 안 종료 ${fd.data.results.length}경기 · 순위 ${standings.length > 0 ? standings.join(", ") : "없음"}${fd.data.standingsFailed.length > 0 ? ` · 순위 실패 ${fd.data.standingsFailed.map((f) => `${f.comp}(${f.errorType})`).join(", ")}` : ""} · ${fd.elapsedMs}ms`,
    );
  } else if (fd.state === "failed") {
    lines.push(`football-data: 실패(${fd.errorType}) ${fd.error}`);
  } else {
    lines.push(`football-data: 건너뜀(${fd.reason})`);
  }
  const af = outcome.apiFootball;
  if (af.state === "done") {
    const { stage, allowance } = af.data;
    const kinds = stage.outcomes.reduce<Record<string, number>>((acc, o) => {
      acc[o.result.kind] = (acc[o.result.kind] ?? 0) + 1;
      return acc;
    }, {});
    lines.push(
      `api-football: 날짜 ${stage.dates.map((d) => `${d.date} ${d.ok ? `${d.listed}경기` : `실패(${d.errorType})`}`).join(" · ")} → 대상 ${stage.counts.targets}경기(기타 대회 ${stage.counts.koreanOther} · 친선 제외 ${stage.counts.friendly}) · 요청 계획 brief ${stage.planned.brief}/window ${stage.planned.window}/requery ${stage.planned.requery} · 결과 ${
        Object.entries(kinds)
          .map(([k, n]) => `${k} ${n}`)
          .join(", ") || "없음"
      }`,
    );
    lines.push(
      `  상세 ${stage.details.length}경기(득점 불완전 ${stage.details.filter((d) => !d.goalsComplete).length}) · 브리핑 몫 ${stage.brief.reason}(${stage.brief.details.length}경기, 못 받음 ${stage.brief.missing.length}) · 이월 ${stage.pending.length}경기 · 정리 ${stage.dropped.length} · 멈춤 ${stage.stoppedBy ?? "없음"}${stage.degraded ? ` · FR-65 강등(${stage.degraded.message})` : ""}`,
    );
    lines.push(
      `  호출 ${af.data.calls}회(재시도 ${af.data.retries}) · 허용 ${allowance.remaining}(오늘 ${allowance.usedOwn}/${allowance.cap}, 제약 ${allowance.limitedBy}) · 헤더 일 남은 수 ${af.data.rate.dayRemaining ?? "?"}/${af.data.rate.dayLimit ?? "?"} · ${af.elapsedMs}ms`,
    );
    for (const d of stage.details) {
      const scorers = d.goals
        .map(
          (g) =>
            `${g.minute}${g.extra ? `+${g.extra}` : ""}' ${g.scorer.name}${g.kind === "penalty" ? "(PK)" : g.kind === "own-goal" ? "(OG)" : ""}`,
        )
        .join(", ");
      const pens = d.score.pens
        ? ` (PK ${d.score.pens.home}-${d.score.pens.away})`
        : "";
      lines.push(
        `  · af ${d.matchId} ${d.comp ?? `league ${d.leagueId}`} ${d.home.name}(${d.home.id}) ${d.score.ft.home}-${d.score.ft.away} ${d.away.name}(${d.away.id})${pens} [${d.status}] ${d.lineups.home?.formation ?? "?"}/${d.lineups.away?.formation ?? "?"}${d.goalsComplete ? "" : " [득점 불완전]"} — ${scorers || "득점 없음"}`,
      );
    }
    lines.push(
      `  [dry] data/cache/af-pending.json — 쓰지 않음${af.data.pendingFile.changed ? " (변경 있음)" : " (변경 없음)"}\n${serializeAfPending(buildAfPendingFile(stage.pending, "1970-01-01T00:00:00.000Z")).trimEnd()}`,
    );
  } else if (af.state === "failed") {
    lines.push(`api-football: 실패(${af.errorType}) ${af.error}`);
  } else {
    lines.push(`api-football: 건너뜀(${af.reason})`);
  }
  const pairing = outcome.pairing;
  if (pairing) {
    const byTable = pairing.links.filter(
      (l) => l.linkedBy === "team-ids",
    ).length;
    lines.push(
      `짝짓기: 연결 ${pairing.links.length}(대응표 ${byTable} · 증거 ${pairing.links.length - byTable}) · 미확인 ${pairing.unconfirmed.length} · 후보 ${pairing.report.candidates.length} · 충돌 ${pairing.report.conflicts.length} · 모호 ${pairing.report.ambiguous.length} · fd 짝 없음 ${pairing.report.unmatched.length}`,
    );
    const autoKeys = new Set(
      pairing.autoLinked.map((a) => `${a.fd.id}:${a.af.id}`),
    );
    for (const c of pairing.report.candidates) {
      lines.push(
        `  후보(${c.kind}${c.slug ? ` ${c.slug}` : ""}${autoKeys.has(`${c.fd.id}:${c.af.id}`) ? " · 자동 연결 D37" : ""}): fd ${c.fd.name}(${c.fd.id}) ↔ af ${c.af.name}(${c.af.id}) — ${c.evidence.map((e) => `${e.fdMatchId}↔${e.afMatchId}`).join(", ")}`,
      );
    }
    for (const u of pairing.unconfirmed) {
      lines.push(`  미확인: ${u.fdMatchId}↔${u.afMatchId} (${u.reason})`);
    }
  }
  const ledger = outcome.ledger;
  if (ledger) {
    const write =
      ledger.mode === "write"
        ? `씀(${ledger.applied?.state ?? "?"}${ledger.applied?.meta?.meta ? `, since ${ledger.applied.meta.meta.since}` : ""})`
        : `쓰지 않음(${ledger.mode})`;
    lines.push(
      `원장: ${write} · 항목 ${ledger.entries.length}경기(이미 받음 ${ledger.known} · 형식 오류 ${ledger.invalid.length} · 불완전 ${ledger.entries.filter(isIncompleteLedgerMatch).length}) · 한국 선수 행 ${ledger.korean.length}`,
    );
    for (const r of ledger.korean) {
      lines.push(
        `  · af ${r.matchId} ${r.player} ${r.status}${r.minutes !== null ? ` ${r.minutes}분` : ""} ${r.goals}골 ${r.assists}도움`,
      );
    }
    for (const c of ledger.nameChecks) {
      lines.push(
        `  이름 대조(${c.player}, id 없음): af ${c.matchId} ${c.side} — ${c.lineup ? (c.candidates.length > 0 ? c.candidates.map((x) => `${x.name}(${x.id ?? "?"}) ${x.basis} ${x.status}`).join(", ") : "후보 없음") : "라인업 없음"}`,
      );
    }
  }
  return lines.join("\n");
}

// ─── ③ 브리핑 ────────────────────────────────────────────────────────────

/** 브리핑 득점자 연결 결과(M1-48b) */
interface BriefGoalLinks {
  /** football-data 경기 id → 연결된 API-Football 상세 */
  byFd: Map<number, MatchDetail>;
  byTeamIds: number;
  byEvidence: number;
  /** 대회·킥오프·스코어는 맞지만 연결하지 않은 쌍(이유) */
  unconfirmed: string[];
}

/**
 * 브리핑 몫(컷오프까지 받은 brief 계층 상세)을 football-data 종료 경기에 잇는다 — 대응표 확인 + D37 강한 증거(후보 수는 날짜 조회
 * 목록·football-data 결과 밖 경기까지 센다). 대응표를 읽지 못하면 자동 연결도 끈다(대응표와 어긋나는지 확인할 수 없다 — 리뷰
 * 권장 5) — 그날은 득점자 없이. 던지지 않는다 — 실패하면 득점자 없이(goals null).
 */
async function linkBriefGoals(
  deps: CollectDeps,
  fd: Pick<FootballDataBriefData, "results" | "others">,
  snapshot: AfBriefSnapshot | null,
): Promise<BriefGoalLinks> {
  const empty: BriefGoalLinks = {
    byFd: new Map(),
    byTeamIds: 0,
    byEvidence: 0,
    unconfirmed: [],
  };
  if (snapshot === null || snapshot.details.length === 0) return empty;
  let index: TeamIdIndex = EMPTY_TEAM_ID_INDEX;
  let autoLink = true;
  try {
    index = buildTeamIdIndex(await loadTeamIds(deps.rootDir));
  } catch (error) {
    autoLink = false;
    deps.logger.warn("summarize.input.team-ids-unreadable", {
      file: "configs/team-ids.json",
      error: errorText(error),
      autoLink,
    });
  }
  try {
    const linked = linkMatchDetails(fd.results, snapshot.details, index, {
      afUniverse: snapshot.listed,
      fdUniverse: fd.others,
      autoLink,
    });
    return {
      byFd: new Map(linked.links.map((l) => [l.fd.matchId, l.af] as const)),
      byTeamIds: linked.links.filter((l) => l.linkedBy === "team-ids").length,
      byEvidence: linked.links.filter((l) => l.linkedBy === "evidence").length,
      unconfirmed: linked.unconfirmed.map(
        (u) => `${u.fdMatchId}↔${u.afMatchId}:${u.reason}`,
      ),
    };
  } catch (error) {
    deps.logger.warn("summarize.input.goals-fail", { error: errorText(error) });
    return empty;
  }
}

async function runBriefStage(
  deps: CollectDeps,
  ctx: { publishDate: string },
  matchData: MatchDataBriefView,
  sink: {
    results: LlmResult[];
    /** 브리핑 설정을 해석했으면 그 모델(실행 기록 단가용) */
    model: string | null;
  },
): Promise<BriefOutcome> {
  const log = deps.logger;
  const fd = matchData.footballData;
  if (fd.state === "skipped") {
    log.warn("summarize.brief.skip", {
      reason: "no-api-key",
      missing: "FOOTBALL_DATA_API_KEY",
    });
    return { state: "skipped", reason: "no-api-key", inputMatches: 0 };
  }
  if (fd.state === "failed") {
    // 경기 결과가 없으면 그날 브리핑은 생략한다 — 뉴스는 발행(D24)
    log.error("summarize.input.fail", {
      source: "football-data",
      errorType: fd.errorType,
      error: fd.error,
    });
    return {
      state: "failed",
      reason: "football-data",
      detail: fd.error,
      inputMatches: 0,
    };
  }

  // 전날 경기 결과 + 연결된 경기의 득점자(M1-48b) → 정형 입력(순위는 M1-19가 입력에 넣는다)
  let input: BriefInput;
  try {
    const competitions = await readConfigFile(
      deps.rootDir,
      "competitions.json",
      CompetitionsFileSchema,
    );
    const goalLinks = await linkBriefGoals(
      deps,
      fd.data,
      matchData.apiFootballBrief,
    );
    const built = buildBriefInput(
      ctx.publishDate,
      fd.data.results,
      competitions,
      BRIEF_MAX_MATCHES,
      goalLinks.byFd,
    );
    input = built.input;
    log.info("summarize.input.done", {
      date: ctx.publishDate,
      finished: fd.data.results.length,
      matches: input.matches.length,
      excluded: built.excluded,
      // 득점자 — 연결(대응표·증거) 중 득점 목록이 완전한 경기만 goals 배열, 나머지는 null
      afBriefDetails: matchData.apiFootballBrief?.details.length ?? null,
      linkedByTeamIds: goalLinks.byTeamIds,
      linkedByEvidence: goalLinks.byEvidence,
      unconfirmed: goalLinks.unconfirmed,
      goalsFilled: built.goals.filled,
      goalsIncomplete: built.goals.incomplete,
    });
  } catch (error) {
    log.error("summarize.input.fail", {
      source: "brief-input",
      errorType: error instanceof Error ? error.name : "unknown",
      error: errorText(error),
    });
    return {
      state: "failed",
      reason: "setup",
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

// ─── 소스 건강도 (M1-11) ──────────────────────────────────────────────────

/**
 * 소스 건강도 — 소스별 한 줄 로그 + 이슈로 낼 사건 목록. 사건 파일은 `healthReportPath`가 있고 dry가 아닐 때만 쓴다
 * (파일 내용 = `source-broken` payload 배열, scripts/report-issue.ts --kind source-broken --payload-file로 넘긴다).
 * 판정은 scripts/lib/source-health.ts(순수). 이 단계의 실패는 수집·발행을 멈추지 않는다(호출부가 잡는다).
 * 연속 횟수는 커밋된 실행 기록(runs.json)만 센다 — 실패해 커밋되지 않은 실행은 빠진다(TODO(M1-27)에서 보완).
 * 전체 실패 실행(성공 소스 0개)은 소스별 `failed` 사건을 내지 않는다 — pipeline-failure 이슈 하나가 원인을 맡는다(FR-152).
 */
async function runHealthStage(
  deps: CollectDeps,
  ctx: {
    runId: string;
    startedAt: string;
    sources: RunLog["sources"];
    outcomes: readonly SourceOutcome[];
    runsRead: RunsReadResult;
    sourceNames: ReadonlyMap<string, string>;
  },
): Promise<HealthOutcome> {
  const log = deps.logger;
  const historyError = ctx.runsRead.ok ? null : ctx.runsRead.error;
  if (historyError !== null) {
    // 연속 횟수를 이번 실행만으로 센다 — 이번 실행의 실패 사건은 그대로 낸다(연속 사건은 다음 실행부터 다시 셈)
    log.warn("collect.health.history-unavailable", {
      file: "runs.json",
      error: historyError,
    });
  }
  const outcomeById = new Map(ctx.outcomes.map((o) => [o.id, o] as const));
  const health = assessSourceHealth({
    run: { runId: ctx.runId, startedAt: ctx.startedAt },
    // runs.json 기록 + HTTP 상태·파싱 실패 진단(M1-03 보강 — 이슈 payload에만, runs.json에는 남기지 않는다)
    current: ctx.sources.map((entry) => {
      const outcome = outcomeById.get(entry.id);
      return {
        ...entry,
        httpStatus: outcome?.status ?? null,
        parseDiagnostics: outcome?.parseDiagnostics ?? null,
      };
    }),
    history: ctx.runsRead.ok ? ctx.runsRead.runs : [],
  });
  // 소스별 한 줄 요약 — 사건이 있거나 뺐으면 warn
  for (const h of health) {
    log[h.event || h.suppressedEvent ? "warn" : "info"](
      "collect.source.health",
      healthLogFields(h),
    );
  }
  const suppressed = health.filter((h) => h.suppressedEvent !== null);
  if (suppressed.length > 0) {
    // 전체 실패 — 원인이 하나라 소스별 실패 이슈 대신 pipeline-failure 이슈 하나로 보고된다(FR-152)
    log.warn("collect.health.suppress", {
      reason: "all-sources-failed",
      healthEvent: "failed",
      sources: suppressed.length,
      kept: health.filter((h) => h.event !== null).length,
    });
  }
  const reports = healthIssuePayloads(health, {
    sourceNames: ctx.sourceNames,
    ...(deps.runUrl ? { runUrl: deps.runUrl } : {}),
  });
  // 이슈로 낼 사건 — 로컬 실행에서는 이 로그가 결과의 전부다(이슈를 만들지 않는다)
  for (const report of reports) {
    log.warn("collect.health.issue", {
      source: report.sourceId,
      healthEvent: report.event ?? null,
      streak: report.streak ?? null,
      errorType: report.errorType ?? null,
      key: healthIssueKey(report.sourceId),
    });
  }
  const byEvent: Record<string, number> = {};
  for (const report of reports) {
    const key = report.event ?? "unknown";
    byEvent[key] = (byEvent[key] ?? 0) + 1;
  }
  const summary = {
    sources: health.length,
    events: reports.length,
    byEvent,
    history: historyError === null ? "runs.json" : "unavailable",
  };

  const target = deps.healthReportPath?.trim() || null;
  if (target === null || deps.dry) {
    log.info("collect.health.done", {
      ...summary,
      file: null,
      reason: target === null ? "no-report-path" : "dry",
    });
    return { sources: health, reports, file: null, historyError };
  }
  try {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(reports, null, 2)}\n`, "utf8");
  } catch (error) {
    // 사건 파일을 못 쓰면 이번 실행의 소스 이슈만 빠진다 — 수집·발행은 계속(연속 사건은 다음 실행이 다시 낸다)
    log.error("collect.health.fail", {
      stage: "write",
      file: target,
      error: errorText(error),
    });
    return { sources: health, reports, file: null, historyError };
  }
  log.info("collect.health.done", { ...summary, file: target });
  return { sources: health, reports, file: target, historyError };
}

// ─── API-Football 이슈 사건 (M1-48) ───────────────────────────────────────

/**
 * API-Football 사건(errors.plan → FR-65 강등 · 일 한도 · 그 밖의 errors)을 소스 이슈 사건 파일에 더한다 — M1-11 경로 재사용
 * (`source-broken`, 원인 키 `source:api-football`). 이슈 생성은 collect.yml의 다음 단계(쓰기 토큰을 받는 단계)가 한다.
 * 건강도 단계가 이미 쓴 사건과 합쳐 다시 쓴다. dry·경로 없음(로컬)은 로그만 남긴다. 던지면 호출부가 잡는다.
 */
async function reportApiFootballIssues(
  deps: CollectDeps,
  ctx: { runId: string; health: HealthOutcome | null },
  matchData: MatchDataOutcome | null,
): Promise<number> {
  const af = matchData?.apiFootball;
  if (af?.state !== "done" || af.data.stage.issues.length === 0) return 0;
  const payloads = apiFootballIssuePayloads(af.data.stage.issues, {
    occurredAt: nowUtcIso(deps.now()),
    runId: ctx.runId,
    ...(deps.runUrl ? { runUrl: deps.runUrl } : {}),
  });
  for (const payload of payloads) {
    deps.logger.warn("collect.matchdata.issue", {
      source: payload.sourceId,
      errorType: payload.errorType ?? null,
      key: healthIssueKey(payload.sourceId),
    });
  }
  const target = deps.healthReportPath?.trim() || null;
  if (target === null || deps.dry) return payloads.length;
  const all = [...(ctx.health?.reports ?? []), ...payloads];
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(all, null, 2)}\n`, "utf8");
  deps.logger.info("collect.matchdata.issue.write", {
    file: target,
    events: payloads.length,
    total: all.length,
  });
  return payloads.length;
}

// ─── 전체 ────────────────────────────────────────────────────────────────

/**
 * API-Football 단계가 그날 데이터를 다 받지 못했는가 — 실패·일일 상한 · 날짜 조회 실패 · FR-65 강등 · 단계가 멈춤
 * (일 한도·호출 상한·시간 예산·연속 실패) · 경기 단건 실패. 받지 못한 경기는 이월되지만 지난 날짜는 다시 받을 수 없어
 * 실행 상태에 드러낸다. 키 없음(로컬·Secrets 미설정)은 설정 상태라, 개발 실행 금지 시간대(dev-quiet-hours)는 의도된
 * 건너뜀이라 넣지 않는다(경고 로그 — 브리핑은 득점자 없이 그대로). 뉴스 실패로 취소된 경우는 실행이 이미 failed다.
 */
export function apiFootballIncomplete(
  af: ProviderOutcome<ApiFootballData>,
): boolean {
  if (af.state === "failed") return true;
  if (af.state === "skipped") return af.reason === "daily-cap";
  const stage = af.data.stage;
  return (
    stage.dates.some((d) => !d.ok) ||
    stage.degraded !== null ||
    (stage.stoppedBy !== null && stage.stoppedBy !== "cancelled") ||
    stage.outcomes.some((o) => o.result.kind === "failed")
  );
}

/**
 * 실행 상태 — 뉴스 실패 = failed, 일부 소스 실패·브리핑 실패·키 없음·순위 일부 실패·API-Football 미완(apiFootballIncomplete)·
 * 원장 쓰기 오류·원장 형식 오류 항목(M1-48b)·seen-urls 기억 읽기·쓰기 오류(M1-12) = partial, 그 밖 = success.
 * partial도 뉴스는 발행된 실행이다(수집 창 기준 — collect-window.ts).
 */
export function runStatus(
  news: {
    ok: boolean;
    sources?: readonly { ok: boolean }[];
    seen?: Pick<SeenOutcome, "readError" | "writeError"> | null;
  },
  brief: BriefOutcome,
  matchData:
    | (Pick<MatchDataOutcome, "footballData"> &
        Partial<Pick<MatchDataOutcome, "apiFootball" | "ledger">>)
    | null = null,
): RunLog["status"] {
  if (!news.ok) return "failed";
  if (news.sources?.some((source) => !source.ok)) return "partial";
  // 기억 파일이 깨졌거나(발행 파일로 다시 채워 진행) 쓰지 못했다(다음 실행은 최근 발행 파일로 중복을 막는다) — M1-12
  if (news.seen?.readError || news.seen?.writeError) return "partial";
  if (brief.state === "failed") return "partial";
  const fd = matchData?.footballData;
  if (fd?.state === "done" && fd.data.standingsFailed.length > 0) {
    return "partial";
  }
  if (brief.state === "skipped" && brief.reason === "no-api-key") {
    return "partial";
  }
  if (matchData?.apiFootball && apiFootballIncomplete(matchData.apiFootball)) {
    return "partial";
  }
  // 원장 쓰기 오류(달 파일·메타)·형식 오류 항목 — 받은 경기는 이월 목록에 다시 넣었지만 실행 상태에 드러낸다(M1-48b)
  if ((matchData?.ledger?.applied?.errors.length ?? 0) > 0) return "partial";
  if ((matchData?.ledger?.invalid.length ?? 0) > 0) return "partial";
  return "success";
}

/**
 * 실행 기록 여부 —
 *   ① 데이터 API를 한 번이라도 불렀으면 mock·dry·env와 무관하게 기록한다(M1-48 — `apiCalls`가 다음 실행의 API-Football 일일
 *      카운터다. 기록하지 않으면 개발 호출이 과소 집계돼 같은 UTC 날 봇이 일 한도 100을 넘길 수 있다). mock 실행은 LLM 비용 0.
 *   ② 그 밖에는 mock은 기록하지 않고, live는 LLM을 불렀으면(dry여도) 기록, prod는 dry가 아니면 항상 기록.
 * TODO(M1-27): prod에서 커밋되지 않는 실행(뉴스 실패 exit 1·검증·빌드 실패)은 runs.json 기록이 사라진다 — 백업 실행의 카운터가
 * 그만큼 적게 센다(계획 상한 60 + 유실분이 100 안이라 지금은 감수). 실패한 실행의 기록 보존 경로와 함께 정한다.
 */
export function shouldRecordRun(input: {
  llmMode: LlmMode;
  env: RunEnv;
  dry: boolean;
  llmCalls: number;
  apiCalls?: RunLog["apiCalls"];
}): boolean {
  if (
    input.apiCalls &&
    (input.apiCalls.footballData > 0 || input.apiCalls.apiFootball > 0)
  ) {
    return true;
  }
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

  // ② 경기 데이터는 뉴스 피드 수집과 병렬로 시작한다(머리 주석 "병렬 근거") — 수집 대상이 정해진 뒤(설정 오류·대상 0개면
  // 시작하지 않는다). 뉴스가 실패하면 취소 신호로 새 요청을 멈춘다.
  const sink = {
    results: [] as LlmResult[],
    apiCalls: { footballData: 0, apiFootball: 0 },
    model: null as string | null,
  };
  const cancelMatchData = new AbortController();
  // 시작 여부는 콜백이 정하므로 객체에 둔다(지역 let 좁히기가 콜백 대입을 놓치지 않게)
  const match: { stage: MatchDataStage | null } = { stage: null };
  const startMatchData = (): MatchDataStage => {
    match.stage ??= startMatchDataStage(
      deps,
      { publishDate },
      sink,
      cancelMatchData.signal,
    );
    return match.stage;
  };

  let newsStage: NewsStageResult | null = null;
  try {
    newsStage = await runNewsStage(
      deps,
      { runId, publishDate, startedAt },
      { onFeedsPlanned: startMatchData },
    );
  } finally {
    // 뉴스가 실패했거나 예상 밖 예외로 끝났으면(던짐) 병렬로 시작한 경기 데이터의 새 요청을 멈춘다
    if (match.stage !== null && !newsStage?.outcome.ok) {
      cancelMatchData.abort();
      log.warn("collect.matchdata.cancel", {
        reason: newsStage === null ? "news-error" : "news-failed",
      });
    }
  }
  const { outcome: news, sources, runsRead, sourceNames } = newsStage;

  // 소스 건강도(M1-11) — 수집을 시도한 소스가 있을 때만. 뉴스 단계가 실패해도(모든 소스 실패) 판정한다.
  let health: HealthOutcome | null = null;
  if (runsRead !== null && sources.length > 0) {
    try {
      health = await runHealthStage(deps, {
        runId,
        startedAt,
        sources,
        outcomes: news.sources,
        runsRead,
        sourceNames,
      });
    } catch (error) {
      // 방어선 — 건강도 판정의 예상 밖 오류도 수집·발행을 멈추지 않는다.
      log.error("collect.health.fail", {
        stage: "unexpected",
        error: errorText(error),
      });
    }
  }

  let matchData: MatchDataOutcome | null = null;
  let brief: BriefOutcome;
  try {
    if (!news.ok) {
      // 뉴스가 실패하면 exit 1 → Actions가 커밋하지 않아 이번 실행의 runs.json 기록(LLM 비용)이 사라지고, 백업 실행이
      // 그 비용을 모른 채 다시 부를 수 있다(CLAUDE.md §1-4·§6.3). 그래서 브리핑(LLM 호출)을 하지 않는다(경기 데이터는 취소).
      // TODO(M1-27): 실패한 실행의 runs 기록을 보존하는 경로(실패 시에도 runs.json 커밋 등)를 정한다.
      log.warn("summarize.brief.skip", { reason: "news-failed" });
      brief = { state: "skipped", reason: "news-failed", inputMatches: 0 };
    } else {
      // football-data 결과 + API-Football 브리핑 몫(컷오프까지)만 기다린다 — API-Football 나머지는 브리핑과 동시에 계속 받는다
      const view = await startMatchData().briefView;
      brief = await runBriefStage(deps, { publishDate }, view, sink);
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

  // 경기 데이터 마무리 — API-Football 나머지·이월 파일·짝짓기. 실행 기록(호출 수 = 다음 실행의 일일 카운터) 전에 기다린다.
  try {
    // 뉴스 설정 오류로 시작하지 않았으면 null(경기 데이터 요청 없음)
    matchData = match.stage === null ? null : await match.stage.done;
  } catch (error) {
    // 방어선 — 프로바이더는 던지지 않는다(isolateProvider). 여기 오면 짝짓기·요약 출력의 예상 밖 오류다.
    log.error("collect.matchdata.fail", {
      stage: "unexpected",
      error: errorText(error),
    });
  }
  try {
    await reportApiFootballIssues(deps, { runId, health }, matchData);
  } catch (error) {
    log.error("collect.matchdata.issue.fail", { error: errorText(error) });
  }

  const status = runStatus(news, brief, matchData);
  let exitCode = news.ok ? 0 : 1;
  let run: RunLog | null = null;
  let runPath: string | null = null;
  if (
    shouldRecordRun({
      llmMode: deps.llmMode,
      env: deps.env,
      dry: deps.dry,
      llmCalls: sink.results.length,
      apiCalls: sink.apiCalls,
    })
  ) {
    // mock LLM 응답은 실제 호출이 아니다 — 비용·작성 줄 수 0으로 남긴다(데이터 API 호출 수만 의미가 있다)
    const live = deps.llmMode === "live";
    try {
      const recorded = await recordRun({
        env: deps.env,
        job: "collect",
        // LLM을 부르지 않았거나 설정 해석 전에 끝났으면 기본 모델(비용 0 — 단가 표 확인용)
        model: sink.model ?? DEFAULT_LLM_MODEL,
        runId,
        startedAt,
        now: deps.now(),
        results: live ? sink.results : [],
        status,
        collected: news.feedItems,
        clusters: news.selected,
        // 슬라이스: 모델이 쓴(임시 스키마를 통과한) 줄 수. 아직 게시하지 않는다 — 검증·강등 뒤 기록은 M1-45.
        summarized: live && brief.state === "done" ? brief.lines.length : 0,
        downgraded: 0,
        apiCalls: {
          footballData: sink.apiCalls.footballData,
          apiFootball: sink.apiCalls.apiFootball,
        },
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
    windowBasis: news.window?.basis ?? null,
    inWindow: news.windowStats?.inWindow ?? 0,
    sourcesOk: news.sources.filter((s) => s.ok).length,
    sourcesFailed: news.sources.filter((s) => !s.ok).length,
    brief: brief.state === "done" ? "done" : `${brief.state}:${brief.reason}`,
    briefMatches: brief.inputMatches,
    briefLines: brief.state === "done" ? brief.lines.length : 0,
    footballData: matchData?.footballData.state ?? null,
    apiFootball: matchData?.apiFootball.state ?? null,
    matchDataMs: matchData?.elapsedMs ?? null,
    apiCalls: sink.apiCalls.footballData,
    apiFootballCalls: sink.apiCalls.apiFootball,
    llmCalls: sink.results.length,
    healthEvents: health?.reports.length ?? null,
    exitCode,
  });

  return {
    runId,
    publishDate,
    news,
    health,
    matchData,
    brief,
    run,
    runPath,
    status,
    exitCode,
  };
}
