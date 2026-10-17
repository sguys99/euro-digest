/**
 * `npm run collect` 파이프라인 본체 (M1-01 얇은 수직 슬라이스, PRD §10, D23·D24·D28).
 *
 *   ① 뉴스: configs/sources.json의 일일 수집 대상 피드 전부(M1-02 로더 — enabled && terms_checked, rss·journalist·aggregator)
 *      → 소스별 격리 수집 → 수집 시간 창(M1-10, FR-07 — 직전 성공 실행 − 3시간 ~ 현재, 최대 51시간, 미래 시각 가드)
 *      → 합쳐서 정규화 URL 해시로 중복 제거(M1-12, FR-04 — 카드는 대표 소스 + 같은 URL을 낸 소스들의 대회 태그 합집합, dedup.ts)
 *      → 제목 유사도로 같은 사건 클러스터(M1-13, FR-05 — cluster.ts·news-cluster.ts: 다른 날 카드였던 URL이 든 클러스터는
 *        통째로 제외(seen-urls.json 90일 기억 ∪ 최근 발행 파일 — seen-urls.ts), 오늘 카드와 같은 사건이면 그 카드의 새 출처)
 *      → 점수화 선별(M1-14, FR-06 — score.ts: 소스 weight × Tier × 키워드 × 보도 매체 수 × 최신성 × 범위). 일일 상한은 그날
 *        파일 기준(D44 — 새 카드 자리 = MAX_ITEMS_PER_RUN − 오늘 파일 카드 수), 국내 최소 몫(상한의 1/3)을 먼저 채움
 *        → 원제목 카드(대표 + 클러스터 출처, 최소 분류 + 선별 점수 전달)
 *      → data/news/<KST 발행일>.json(파일 순서 = 화면 순서: 중요도 → 최신 출처 시각 — news-file.ts sortCards)
 *      → 그 파일의 카드로 data/cache/seen-urls.json 갱신
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
 *      - 시간 예산(M1-47): 실행 시작에 발행일 슬롯(src/lib/time.ts publishSlot)으로 브리핑 마감(공개 목표 − 10분 — 여름 06:50 ·
 *        겨울 07:20 KST, 수동·지연 실행은 시작 + 8분)을 정하고, 단계마다 시작 시점의 남은 시간으로 위 상수 예산을 줄인다
 *        (scripts/lib/collect-deadlines.ts — 정시 실행은 상수 그대로, 늦게 시작한 실행만 줄어든다).
 *      - 경기 기록 원장(M1-48b, D33 — scripts/lib/match-ledger.ts): 받은 상세 → `data/matches/YYYY-MM.json`(득점·도움·포메이션 +
 *        등록 한국 선수 행) + `meta.json`(since·playerSince·gaps). 원장의 af-<id>는 이미 받은 경기라 다시 받지 않는다(모든 실행이
 *        읽는다). **쓰기는 정기 운영이 켜진 prod 실행만**(CollectDeps.ledgerEnabled = COLLECT_ENABLED) — dry·dev·정기 운영 전 실행은
 *        항목·한국 선수 행·이름 후보를 메모리에서 만들어 로그로만 남긴다. 원장에 넣지 못한 경기는 이월 목록에 다시 넣는다.
 *      병렬 근거: 뉴스(예산 90초)·football-data·API-Football은 호스트가 모두 달라 서로의 한도를 쓰지 않고, 겨울(07:10 수집 →
 *      07:20 브리핑 마감)에 뉴스 시간만큼 브리핑 경기를 더 받을 수 있다. 뉴스가 실패하면 취소 신호로 경기 데이터의 새 요청을
 *      멈추고(보내는 중인 요청 1건까지) 브리핑(LLM)은 부르지 않는다 — 커밋되지 않는 실행의 LLM 비용·API-Football 한도 낭비를
 *      최소로 한다(낭비 상한 = 뉴스가 끝날 때까지 보낸 요청, 최대 약 12건).
 *   ③ 브리핑: football-data 종료 경기 + 현재 순위 → 정형 입력(M1-19 — brief-input.ts: 중요도 순 상한, 확정 순위표 상위 4위,
 *      연장·승부차기 표기) → `callSingle` 1요청(지시문 `configs/prompts/summarize.md` v0.1 — M1-20, 브리핑 마감까지 — 재시도
 *      대기만 묶음, 요청 타임아웃·마감 초과 템플릿은 M1-45) → 출력 스키마·관용 파싱(M1-20, D40 ⑤ — brief.ts)
 *      → **LLM 출력은 로그만** → `data/briefs/<KST 발행일>.json` 게시(M1-19, D38 — brief-file.ts). 검증(M1-23)·재시도·강등(M1-45)
 *      전이라 검증 안 된 LLM 줄은 저장하지 않고 같은 입력의 코드 템플릿 문장(brief-template.ts, `template`)을 게시한다. 경기가
 *      없으면 `empty`(호출 생략), 정형 입력이 없으면(football-data 키 없음·실패) 파일 없음. 그날 파일이 이미 `llm`·`mixed`면
 *      LLM을 부르지 않고 덮지 않는다(재실행 판정 — brief-file.ts `decideBriefWrite`). 브리핑은
 *      football-data 결과 + API-Football 브리핑 몫(컷오프까지 받은 brief 계층)을 기다린 뒤 시작하고, 둘을 이어(대응표 확인 + D37
 *      강한 증거 — team-ids.ts linkMatchDetails) 득점 목록이 완전한 경기만 입력 `goals`에 득점자를 넣는다(M1-48b). 같은 아침
 *      두 번째 실행은 브리핑 창 경기를 다시 받지 않으므로 원장(data/matches)의 같은 창 항목도 잇는다(M1-19 — M1-48 이월).
 *      API-Football 나머지는 브리핑과 동시에 계속 받는다. 실행 기록·이월 파일은 두 프로바이더가 모두 끝난 뒤 쓴다.
 *      football-data 단계가 실패하면 그날 브리핑만 생략하고 뉴스는 발행한다(D24). 순위 실패는 그 대회 순위만 빠진다(partial).
 *      고유명사(M1-21, FR-24 — names.ts): 입력의 득점자·도움을 configs/names.ko.json 대표 영문 표기로 바꿔 보내고(모델 축약 방지),
 *      템플릿은 같은 사전의 한글 이름 + 받침 기준 조사(josa.ts)로 쓴다. LLM 출력은 치환·조사 보정 뒤 문장을 출력에 남긴다(저장은
 *      M1-45). 사전에 없는 이름(입력의 팀·득점자·도움 + 치환 뒤 남은 출력 이름)은 data/cache/unknown-names.json에 적재한다 — prod·
 *      비dry만 쓰고 dev·dry는 로그만(unknown-names.ts). 사전을 읽지 못하면 영문 그대로·적재 생략(경고).
 *      비용 가드(M1-22, FR-27 — budget-guard.ts): live 실행은 호출 전에 최악값 예상(첫 호출 + FR-29 재시도, 출력 = max_tokens)을
 *      출력하고 실행 시작 KST 날짜·달의 사용액(월 prod+dev, 일 prod 실행=prod만)과 비교한다. 초과 예상이거나 runs 파일을 읽지 못하면
 *      LLM 없이 `skipped`·reason `budget` → 같은 입력의 템플릿 게시(M1-19). 실행 시작에는 이번 달 누적과 dev 50% 초과 경고를 남긴다.
 *   ④ 실행 기록: LLM 실호출이 있었으면 dry여도 기록(prod → runs.json, dev → runs-dev.json). prod는 dry가 아니면 항상 기록.
 *   (①보다 먼저) ⓪ data 원본 삭제(M1-25 — purge-stage.ts·purge-plan.ts): configs/takedowns.json 등록 카드(저장된 카드 ID, 모든 날짜
 *      파일)와 보존 기간이 지난 출처(Source.retentionDays — The Athletic 7일, 대표 출처면 카드)를 data/news에서 지우고 그 링크 해시를
 *      기억(seen-urls)에 남긴다. dry는 계획만 출력. 실패는 partial(발행 계속 — 빌드 제외가 공개 사이트를 지킨다).
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
 * 다음 작업이 갈아끼울 자리: 분류(M1-17 — 선별 점수 → 중요도, 팀→리그
 * 대회 근거를 점수화 `comps`로) · 이적 창 배수(M4-03 — score.ts `transferWindowBoost`) · 브리핑 입력·템플릿(M1-19) ·
 * 검증·강등(M1-23·M1-45) · runs 기록(M1-27) ·
 * 브리핑 입력 한국 선수 출전(M3-03 — 원장 행에서). 계절별 마감·단계 예산은 scripts/lib/collect-deadlines.ts(M1-47).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  type AfPendingEntry,
  type BriefFile,
  type BriefMode,
  type CompId,
  type CompetitionsFile,
  type FeedItem,
  type LedgerMatch,
  type NewsCard,
  type NewsFile,
  type RunEnv,
  type RunLog,
  type SearchQueriesFile,
  type Source,
} from "@/lib/schema";
import { kstDate, nowUtcIso, parseUtcIso, utcDate } from "@/lib/time";

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
  apiFootballIssuePayloads,
  runApiFootballStage,
  type AfBriefSnapshot,
  type AfStageResult,
} from "./api-football-stage";

import {
  briefInputWindow,
  buildBriefInput,
  mergeBriefDetails,
  serializeBriefInput,
  type BriefInput,
  type BriefInputBuild,
} from "./brief-input";
import {
  briefLinesOverLimit,
  briefPromptId,
  buildBriefRequest,
  loadBriefPrompt,
  parseBriefOutput,
} from "./brief";
import {
  buildBriefFile,
  decideBriefWrite,
  isKeptBriefMode,
  planBriefPublish,
  readBriefFile,
  serializeBriefFile,
  writeBriefFile,
  type BriefFileRead,
  type BriefPublishPlan,
} from "./brief-file";
import {
  briefCompLabel,
  briefNamesFromIndex,
  chooseBriefCompForm,
  ENGLISH_NAMES,
  templateBriefLines,
} from "./brief-template";
import {
  announceBriefBudget,
  briefBudgetSkip,
  guardBriefBudget,
  noticeMonthlyUsage,
  type BriefBudgetSkip,
} from "./budget-guard";
import type { LlmMode } from "./cli-args";
import { clusterDocs } from "./cluster";
import {
  deadlineLogFields,
  msUntil,
  planCollectDeadlines,
  stageBudgets,
  type CollectDeadlines,
} from "./collect-deadlines";
import { readConfigFile } from "./config-files";
import { dedupeFeedItems } from "./dedup";
import {
  applyCollectWindow,
  ceilMinutes,
  clampedItemKey,
  planCollectWindow,
  windowLogFields,
  type CollectWindow,
  type RunsReadResult,
  type WindowStats,
} from "./collect-window";
import {
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
  buildNameIndex,
  canonicalizeBriefInput,
  foldName,
  playerTeamsFrom,
  isKnownName,
  substituteNames,
  unknownBriefInputNames,
  unknownNamesInText,
  type NameIndex,
} from "./names";
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
  ledgerMatchToDetail,
  ledgerMonthOf,
  ledgerMonthsAround,
  ledgerPlanKnown,
  ledgerWriteMode,
  readLedgerMonth,
  readLedgerWindow,
  type KoreanNameCheck,
  type KoreanPlayerTargets,
  type LedgerApplyResult,
  type LedgerSettleInput,
  type LedgerWindowRead,
  type LedgerWriteMode,
} from "./match-ledger";
import {
  clusterCard,
  groupCardSource,
  planNewsClusters,
  singletonClusters,
  type ClusterFn,
  type ClusterPlanStats,
  type NewsCluster,
} from "./news-cluster";
import {
  buildNewsFile,
  mergeCards,
  type CardAttachment,
  newsFilePath,
  readNewsFile,
  serializeNewsFile,
  writeNewsFile,
} from "./news-file";
import {
  buildKeywordIndex,
  isKoLang,
  type KeywordIndex,
} from "./news-keywords";
import {
  purgeSummary,
  runPurgeStage,
  withPurgeStatus,
  type PurgeOutcome,
} from "./purge-stage";
import {
  createApiFootballClient,
  type AfRateHeaders,
} from "./providers/api-football";
import {
  createFootballDataClient,
  fetchBriefFootballData,
  FootballDataError,
  type FootballDataBriefData,
} from "./providers/football-data";
import type { FetchLike } from "./rss";
import {
  NEUTRAL_TRANSFER_BOOST,
  planSlots,
  roundScore,
  scoreCluster,
  selectTopScored,
  selectWithQuota,
  type Scored,
  type SlotPlan,
} from "./score";
import {
  buildSeenIndex,
  buildSeenUrlsFile,
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
import {
  mergeUnknownNames,
  readUnknownNames,
  unknownNamesPath,
  writeUnknownNames,
  type UnknownNameObservation,
} from "./unknown-names";

// ─── 설정 ────────────────────────────────────────────────────────────────

/** `MAX_ITEMS_PER_RUN` 기본값(일일 카드 선별 상한, CLAUDE.md §10 · PRD FR-06) */
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

/**
 * 이번 실행의 카드 상한 — `--limit`(소량 실행)이 있으면 그 값, 없으면 MAX_ITEMS_PER_RUN. 어느 쪽이든 MAX_ITEMS_PER_RUN을 넘지
 * 않는다(M1-14 — M1-01 슬라이스 기본 5건 폐지). 그날 파일 기준이다 — 새 카드 자리는 이 값에서 오늘 파일의 기존 카드 수를 뺀
 * 만큼(PRD §15 D44, score.ts `planSlots`).
 */
export function resolveCardLimit(
  argLimit: number | null,
  maxItems: number,
): number {
  return Math.min(argLimit ?? maxItems, maxItems);
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
  /** 같은 사건 클러스터링(M1-13) — 기본은 제목 유사도(cluster.ts `clusterDocs`). 테스트가 실패 경로를 주입한다 */
  clusterDocs?: ClusterFn;
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
        "news-failed" | "no-api-key" | "no-matches" | "mock-fixture-missing";
      inputMatches: number;
    }
  | {
      /**
       * 그날 브리핑 파일이 이미 검증 통과 LLM 브리핑(`llm`·`mixed`)이라 LLM을 부르지 않았다(M1-19 재실행 판정 — 덮지 않음,
       * brief-file.ts). M1-45 전에는 이 mode를 쓰는 실행이 없어 생기지 않는다.
       */
      state: "skipped";
      reason: "kept";
      existingMode: BriefMode;
      inputMatches: number;
    }
  | {
      /**
       * 비용 가드(M1-22, FR-27)가 LLM을 막았다 — 일·월 예산 초과 예상 또는 runs 파일을 읽지 못해 판정 불가.
       * 같은 입력의 템플릿 브리핑(M1-19)을 게시하고(verdict 셋 다), 실행 기록(M1-45)이 사유를 잇는다.
       */
      state: "skipped";
      reason: "budget";
      budget: BriefBudgetSkip;
      inputMatches: number;
    }
  | {
      state: "failed";
      reason: "football-data" | "llm" | "output" | "setup";
      detail: string;
      inputMatches: number;
    }
  /** LLM 출력이 임시 스키마를 통과했다 — 검증(M1-23·M1-45) 전이라 lines는 로그·dry 출력에만 쓰고 저장하지 않는다(M1-19) */
  | { state: "done"; inputMatches: number; lines: string[] };

/**
 * 브리핑 게시 결과(M1-19 — data/briefs/<KST 발행일>.json, D38). 브리핑 단계가 시작되지 않았으면(뉴스 실패) CollectOutcome.briefFile은
 * null이다.
 */
export interface BriefFileOutcome {
  /** 이번 실행의 게시 계획(brief-file.ts planBriefPublish) — mode null이면 파일을 만들지 않았다. 계획 중 예상 밖 오류면 null */
  plan: BriefPublishPlan | null;
  /**
   * written = 썼다 · unchanged = 기존과 내용이 같아 쓰지 않음 · kept = 기존 파일 유지(llm·mixed 또는 줄 있는 template을 empty로
   * 지우지 않음) · dry = 출력만 · none = 만들 파일이 없음(plan.mode null) · failed = 검증·쓰기 오류(이 실행은 partial)
   */
  action: "written" | "unchanged" | "kept" | "dry" | "none" | "failed";
  /** 만든 파일 내용(dry·테스트용) — 만들지 않았으면 null */
  file: BriefFile | null;
  /** 쓴 경로 — 쓰지 않았으면 null */
  path: string | null;
  /** 기존 파일 mode(없거나 깨졌으면 null) */
  existingMode: BriefMode | null;
  /** 기존 파일 읽기 오류(깨진 파일 — 새 파일로 고쳤으면 written과 함께) */
  readError: string | null;
  /** 검증·쓰기 오류 */
  error: string | null;
}

/** 미등록 고유명사 적재(M1-21 — data/cache/unknown-names.json, unknown-names.ts) */
export interface UnknownNamesOutcome {
  /** 이번 실행에서 본 미등록 이름(데이터 API 이름 → 브리핑 출력 이름 순, 같은 이름은 한 번) */
  observed: UnknownNameObservation[];
  /**
   * written = 썼다 · unchanged = 내용이 같아 쓰지 않음 · logged = dev·dry 실행이라 로그만(파일을 쓰지 않음) ·
   * skipped = 사전을 읽지 못해 판단 불가 · failed = 읽기·쓰기 오류(실행은 계속)
   */
  action: "written" | "unchanged" | "logged" | "skipped" | "failed";
  /** 파일에 처음 들어간 이름 */
  added: string[];
  /** 사전·무시 목록에 올라 파일에서 뺀 이름 */
  pruned: string[];
  path: string | null;
  error: string | null;
}

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
  /** 오늘 파일의 기존 카드에 새로 붙인 출처 수(같은 날 재실행 — M1-13) */
  attached: number;
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
  /** 같은 사건 클러스터 계획 집계(M1-13, FR-05 — news-cluster.ts) — 선별까지 가지 않았으면 null */
  cluster: ClusterPlanStats | null;
  /** 클러스터링 예상 밖 오류(클러스터 없이 발행 — 실행 상태 partial) */
  clusterError: string | null;
  /** 점수화 선별 집계(M1-14, FR-06 — score.ts) — 선별까지 가지 않았으면 null */
  score: ScoreOutcome | null;
  /** `data/cache/seen-urls.json`(M1-12) — 선별까지 가지 않았으면 null */
  seen: SeenOutcome | null;
  error?: string;
}

/** 점수화 선별 집계 (M1-14·D44 — 로그 `collect.select.done`과 같은 값) */
export interface ScoreOutcome {
  /** 줄 세운 후보 = 새 클러스터 수(오늘 카드 클러스터는 출처만 붙고 후보가 아니다) */
  candidates: number;
  /** 오늘 파일의 기존 카드 수 */
  existingCards: number;
  /** 새 카드 자리 = max(0, 상한 − 기존 카드 수) — 그날 파일 기준(D44) */
  slots: number;
  /** 이번 실행의 국내 몫(하루 몫 − 기존 국내 카드, 자리 이하) */
  domesticQuota: number;
  /** 자리에 든 클러스터 수 */
  ranked: number;
  /** 그중 국내 몫 때문에 들어간 수(순수 점수 순이면 자리 밖) */
  domesticByQuota: number;
  /** 이적 창 배수(FR-105 — 지금은 항상 중립 1) */
  transferBoost: number;
  /** 자리에 든 최고·최저 점수(반올림) — 없으면 null. 국내 몫 때문에 최저가 firstOut보다 낮을 수 있다 */
  top: number | null;
  cutoff: number | null;
  /** 자리 밖으로 밀린 후보 중 최고 점수(반올림) — 없으면 null */
  firstOut: number | null;
  /** 키워드 설정(names.ko.json·korean-players.json) 읽기 오류 — 코드 표(빅클럽·대회·이적)만으로 점수화했다 */
  keywordsError: string | null;
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
  /**
   * 다른 날(또는 삭제 전) 이미 카드가 된 사건이라 뺀 묶음 수 — 그 URL 자신 + 같은 클러스터의 늦은 기사(M1-13,
   * 내역은 `NewsOutcome.cluster.seenBeforeExtra`)
   */
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
  /** data 원본 삭제(M1-25 — 삭제 요청·보존 기간, purge-stage.ts) — 뉴스 단계 전에 돈다 */
  purge: PurgeOutcome;
  news: NewsOutcome;
  /** 소스 건강도 — 수집을 시도한 소스가 없거나(설정 오류) 단계가 실패했으면 null */
  health: HealthOutcome | null;
  /**
   * 경기 데이터 — 뉴스 피드 수집과 병렬로 돌고 뉴스가 실패하면 취소된다(그 결과도 담는다). 뉴스 설정 오류·수집 대상 0개로
   * 시작하지 않았거나 예상 밖 오류로 끝나지 않았으면 null
   */
  matchData: MatchDataOutcome | null;
  brief: BriefOutcome;
  /** 브리핑 게시(M1-19) — 브리핑 단계가 돌지 않았으면(뉴스 실패) null */
  briefFile: BriefFileOutcome | null;
  /** 미등록 고유명사 적재(M1-21) — 브리핑 단계가 돌지 않았으면(뉴스 실패) null */
  unknownNames: UnknownNamesOutcome | null;
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
    attached: 0,
    file: null,
    path: null,
    sources: [],
    excluded: [],
    search: null,
    window: null,
    windowStats: null,
    dedup: null,
    cluster: null,
    clusterError: null,
    score: null,
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
  // 대회 태그는 카드를 만들 때 합친다(dedup.ts).
  // 같은 사건 클러스터(M1-13, FR-05): 제목 유사도로 묶음을 묶는다(news-cluster.ts). 다른 날 카드였던 URL이 든 클러스터는
  // 통째로 빼고(seen-urls.ts 기억), 오늘 파일 카드와 같은 사건이면 그 카드의 새 출처가 된다(같은 날 재실행).
  const deduped = dedupeFeedItems(allItems);
  const seenLoad = await loadSeen(deps, ctx, existing);
  // 제목 유사도 단계(ClusterFn — 특징 추출·유사도·병합, 기본 cluster.ts `clusterDocs`)의 예상 밖 오류만 여기서 막는다:
  // 같은 사건을 합치지 않은 채(문서마다 혼자 — singletonClusters) 나머지 규칙(기억·오늘 카드)으로 계속하고 실행 상태 partial.
  // 계획 자체(planNewsClusters의 기억·오늘 카드 분류)의 오류는 막지 않는다 — 수집 실행 실패(exit 1, 커밋 안 함)로 끝난다.
  const failure: { error: string | null } = { error: null };
  const titleClusters = deps.clusterDocs ?? clusterDocs;
  const clusters = planNewsClusters(
    {
      groups: deduped.groups,
      sourceById,
      index: seenLoad.index,
      todayCards: existing?.cards ?? [],
    },
    (docs, policy) => {
      try {
        return titleClusters(docs, policy);
      } catch (error) {
        failure.error = errorText(error);
        log.warn("collect.cluster.fail", { error: failure.error });
        return singletonClusters(docs, policy);
      }
    },
  );
  const clusterError = failure.error;
  const dedup: DedupOutcome = {
    items: allItems.length,
    unique: deduped.groups.length,
    duplicates: deduped.duplicates,
    multiSource: deduped.groups.filter((g) => g.sources.length > 1).length,
    // 뺀 묶음 = 다른 날 사건 클러스터의 묶음 + 오늘 카드 클러스터에 든 다른 날 카드 URL(M1-12 집계보다 줄지 않는다)
    seenBefore:
      clusters.stats.seenBeforeGroups + clusters.stats.existingSeenBefore,
  };

  // 선별(M1-14, FR-06 — score.ts): 새 클러스터를 점수 순으로 줄 세우고, 일일 상한은 그날 파일 기준(D44) — 새 카드 자리 =
  // max(0, 상한 − 오늘 파일 카드 수). 기존 카드가 수집 창 밖이어도 파일 카드로 세므로 같은 날 재실행이 파일을 상한 너머로 키우지
  // 않는다. 그 자리 안에서 국내(ko) 몫(하루 상한의 1/3 − 기존 국내 카드)을 국내 점수 순으로 먼저 채우고 나머지는 전체 점수 순
  // (국내 후보가 모자라면 해외로). 오늘 카드의 새 출처는 자리와 무관하게 붙인다(카드 수가 늘지 않는다). 점수가 같으면 클러스터
  // 첫 묶음의 입력 순서(설정 순서 — 결정적). 수집 시각으로 낮춘 기사(창 단계 clampedKeys)는 최신성을 믿지 않는다. 이적 창 배수는
  // 중립(FR-105 — M4-03이 연결).
  // 카드(M1-15, FR-20 — news-cluster.ts `clusterCard`): 대표 = 클러스터 묶음 중 Tier·weight·최신성 1위(card-lead.ts — 낮춘 시각은
  // 최신성을 믿지 않는다, 200자 초과·설정에 없는 소스는 다음 후보)의 피드 원문 제목·링크, 출처 = 대표 + 나머지(Tier → 최신 → URL),
  // 카드 소스 = 대표 소스 + 클러스터 대회 합집합, `ai:false`·`s:[]`(LLM 없음 — D23). 오늘 카드는 대표를 다시 고르지 않는다.
  // 선별 점수는 카드 생성(분류 — M1-17 중요도)까지 넘긴다. 카드·파일에는 저장하지 않는다.
  const keywordLoad = await loadKeywordIndex(deps);
  const scoreCtx = {
    now: window.now,
    sourceById,
    keywords: keywordLoad.index,
    isClamped: (item: FeedItem) =>
      windowed.clampedKeys.has(clampedItemKey(item)),
    transferBoost: NEUTRAL_TRANSFER_BOOST,
  };
  const order = new Map(deduped.groups.map((g, i) => [g.key, i] as const));
  const firstIndex = (c: NewsCluster) =>
    Math.min(...c.members.map((g) => order.get(g.key) ?? 0));
  const todayCards = existing?.cards ?? [];
  const slotPlan = planSlots({
    limit: deps.limit,
    existingCards: todayCards.length,
    existingDomestic: todayCards.filter((c) => isKoLang(c.lang)).length,
  });
  const candidates = [...clusters.fresh].sort(
    (a, b) => firstIndex(a) - firstIndex(b),
  );
  const byScore = selectTopScored(
    candidates,
    (cluster) => scoreCluster(cluster, scoreCtx),
    candidates.length,
  );
  const quotaPick = selectWithQuota(byScore, {
    slots: slotPlan.slots,
    quota: slotPlan.domesticQuota,
    inQuota: isDomesticCluster,
  });
  const ranked = quotaPick.selected;
  const leadStats = { reordered: 0, unknownSource: 0, titleTooLong: 0 };
  const cards = ranked.flatMap(({ entry, score }) => {
    const built = clusterCard(
      entry,
      sourceById,
      ctx.startedAt,
      { score },
      { isClamped: scoreCtx.isClamped },
    );
    if (built.reordered) leadStats.reordered += 1;
    leadStats.unknownSource += built.skipped.unknownSource;
    leadStats.titleTooLong += built.skipped.titleTooLong;
    return built.card ? [built.card] : [];
  });
  if (leadStats.unknownSource > 0 || leadStats.titleTooLong > 0) {
    // 대표 후보에서 뺀 묶음(방어선 — 정규화·설정에서 이미 걸러져 평소 0). 카드가 안 된 클러스터 수 = ranked − selected
    log.warn("collect.card.skip", {
      unknownSource: leadStats.unknownSource,
      titleTooLong: leadStats.titleTooLong,
      clustersWithoutCard: ranked.length - cards.length,
    });
  }
  const scoreOutcome = summarizeScores({
    byScore,
    ranked,
    slotPlan,
    existingCards: todayCards.length,
    domesticByQuota: quotaPick.byQuota,
    transferBoost: scoreCtx.transferBoost,
    keywordsError: keywordLoad.error,
  });
  const attachments: CardAttachment[] = clusters.existing.map((c) => ({
    id: c.cardId,
    src: c.additions.flatMap((g) => {
      const src = groupCardSource(g, sourceById);
      return src ? [src] : [];
    }),
  }));
  log.info("collect.select.done", {
    usable: collected.items.length,
    inWindow: allItems.length,
    unique: dedup.unique,
    duplicateLinks: dedup.duplicates,
    multiSource: dedup.multiSource,
    clusters: clusters.stats.fresh,
    clustered: clusters.stats.multi,
    merged: clusters.stats.merged,
    maxPublishers: clusters.stats.maxPublishers,
    todayCards: clusters.stats.existing,
    additions: clusters.stats.additions,
    // seenBefore = 뺀 묶음 수(M1-12와 같은 뜻) — 그중 같은 클러스터라서 빠진 늦은 기사가 seenBeforeExtra,
    // 오늘 카드 클러스터에 들어 출처로 붙이지 않은 다른 날 카드 URL이 existingSeenBefore
    seenBefore: dedup.seenBefore,
    seenBeforeClusters: clusters.stats.seenBefore,
    seenBeforeExtra: clusters.stats.seenBeforeExtra,
    existingSeenBefore: clusters.stats.existingSeenBefore,
    candidates: scoreOutcome.candidates,
    existingCards: scoreOutcome.existingCards,
    slots: scoreOutcome.slots,
    ranked: scoreOutcome.ranked,
    selected: cards.length,
    // 대표가 클러스터 첫 묶음(설정 순서)이 아닌 카드 수 — Tier·weight·최신성 규칙이 대표를 바꾼 수(M1-15)
    leadReordered: leadStats.reordered,
    limit: deps.limit,
    scoreTop: scoreOutcome.top,
    scoreCutoff: scoreOutcome.cutoff,
    scoreFirstOut: scoreOutcome.firstOut,
    transferBoost: scoreOutcome.transferBoost,
    // 자리에 든 클러스터의 구성·점수 근거 수 — 국내(ko)와 국내 몫(koQuota)·몫 때문에 든 수(koByQuota), 키워드, 범위 근거 없음
    // (감점), 낮춘 시각(최신성 불신)
    selectedMix: selectedMix(ranked, scoreOutcome),
    failedSources: failed.length,
  });

  let seen: SeenOutcome = seenLoad.outcome;
  try {
    const merged = mergeCards(existing?.cards ?? [], cards, attachments);
    if (merged.idCollisions.length > 0) {
      // 카드 ID 40비트 해시 충돌(M1-16 — 평소 없음): 출처 링크가 겹치지 않는데 ID가 같은 새 카드는 넣지 않았다
      log.warn("collect.card.id-collision", {
        date: ctx.publishDate,
        ids: merged.idCollisions,
      });
    }
    // 새 카드도 새 출처도 없으면 파일을 다시 쓰지 않는다(generatedAt만 바뀐 불필요한 data 커밋 방지).
    const unchanged =
      existing !== null && merged.added === 0 && merged.attached === 0;
    if (merged.cards.length === 0) {
      log.warn("collect.news.empty", { date: ctx.publishDate });
      return {
        outcome: {
          ...empty,
          ...base,
          ok: true,
          dedup,
          cluster: clusters.stats,
          clusterError,
          score: scoreOutcome,
          seen,
        },
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
      attached: merged.attached,
      count: file.cards.length,
    };
    if (deps.dry) {
      log.info("collect.news.dry", fields);
      deps.print(
        `── [dry] data/news/${ctx.publishDate}.json — 쓰지 않음 (카드 ${file.cards.length}장, 새 카드 ${merged.added}장, 기존 카드에 붙인 출처 ${merged.attached}건)\n${serializeNewsFile(file).trimEnd()}`,
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
        attached: merged.attached,
        file: unchanged && !deps.dry ? existing : file,
        path: deps.dry || unchanged ? null : filePath,
        dedup,
        cluster: clusters.stats,
        clusterError,
        score: scoreOutcome,
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
        cluster: clusters.stats,
        clusterError,
        score: scoreOutcome,
        seen,
        error: errorText(error),
      },
      ...stage,
    };
  }
}

// ─── ①-a 점수화 선별 도우미 (M1-14 — scripts/lib/score.ts) ────────────────

/**
 * 점수화 키워드 색인 — configs/names.ko.json·korean-players.json(news-keywords.ts). 읽기·형식 오류는 경고만 하고 코드 표
 * (빅클럽·대회·이적)만으로 점수화한다 — 발행은 계속하고, 설정 오류 자체는 같은 실행의 검증 게이트(`npm run validate`)가 잡아
 * 커밋되지 않는다.
 */
async function loadKeywordIndex(
  deps: Pick<CollectDeps, "rootDir" | "logger">,
): Promise<{ index: KeywordIndex; error: string | null }> {
  try {
    const [names, koreanPlayers] = await Promise.all([
      readConfigFile(deps.rootDir, "names.ko.json", NamesKoFileSchema),
      readConfigFile(
        deps.rootDir,
        "korean-players.json",
        KoreanPlayersFileSchema,
      ),
    ]);
    return { index: buildKeywordIndex({ names, koreanPlayers }), error: null };
  } catch (error) {
    deps.logger.warn("collect.score.keywords", { error: errorText(error) });
    return { index: buildKeywordIndex({}), error: errorText(error) };
  }
}

/** 국내 클러스터인가 — 첫 묶음 언어(D30 — 국내·해외는 한 클러스터가 되지 않아 카드 대표의 언어와 같다) */
function isDomesticCluster(cluster: NewsCluster): boolean {
  return isKoLang(cluster.members[0]?.item.lang ?? "");
}

type ScoredCluster = Scored<NewsCluster>;

/** 점수화 선별 집계 — `byScore` = 후보 전체(점수 순), `ranked` = 그중 자리에 든 것(점수 순) */
function summarizeScores(input: {
  byScore: readonly ScoredCluster[];
  ranked: readonly ScoredCluster[];
  slotPlan: SlotPlan;
  existingCards: number;
  domesticByQuota: number;
  transferBoost: number;
  keywordsError: string | null;
}): ScoreOutcome {
  const { byScore, ranked } = input;
  const rounded = (value: number | undefined) =>
    value === undefined ? null : roundScore(value);
  const inRanked = new Set(ranked.map((r) => r.entry));
  return {
    candidates: byScore.length,
    existingCards: input.existingCards,
    slots: input.slotPlan.slots,
    domesticQuota: input.slotPlan.domesticQuota,
    ranked: ranked.length,
    domesticByQuota: input.domesticByQuota,
    transferBoost: input.transferBoost,
    top: rounded(ranked.at(0)?.score.score),
    cutoff: rounded(ranked.at(-1)?.score.score),
    firstOut: rounded(byScore.find((r) => !inRanked.has(r.entry))?.score.score),
    keywordsError: input.keywordsError,
  };
}

/** 자리에 든 클러스터의 구성·점수 근거 수(로그 — 관찰 주간 M1-43 검수용, 제목은 남기지 않는다) */
function selectedMix(
  ranked: readonly ScoredCluster[],
  outcome: Pick<ScoreOutcome, "domesticQuota" | "domesticByQuota">,
) {
  const count = (pred: (r: ScoredCluster) => boolean) =>
    ranked.filter(pred).length;
  return {
    ko: count((r) => isDomesticCluster(r.entry)),
    koQuota: outcome.domesticQuota,
    koByQuota: outcome.domesticByQuota,
    korean: count((r) => r.score.signals.koreanPlayers.length > 0),
    bigClub: count((r) => r.score.signals.bigClubs.length > 0),
    ucl: count((r) => r.score.signals.comps.includes("UCL")),
    transfer: count((r) => r.score.signals.transfer),
    multiPublisher: count((r) => r.score.signals.publishers > 1),
    noScope: count((r) => r.score.factors.scope < 1),
    clamped: count((r) => r.score.signals.clamped),
  };
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

/** 경기 데이터·브리핑 단계가 받는 실행 정보 — 발행일(KST)과 이번 실행의 브리핑 마감(UTC ISO, collect-deadlines.ts) */
interface StageCtx {
  publishDate: string;
  briefDeadline: string;
  /** 실행 시작(UTC ISO) — 비용 가드가 이 시각의 KST 날짜·달로 판정한다(실행 기록 귀속과 같은 칸, M1-22) */
  startedAt: string;
}

/** football-data 단계 — 전날(KST 창) 종료 경기 + 그 경기가 있는 대회의 현재 순위. 던지지 않는다 */
async function runFootballDataProvider(
  deps: CollectDeps,
  ctx: StageCtx,
  sink: ApiCallSink,
  signal: AbortSignal,
): Promise<ProviderOutcome<FootballDataBriefData>> {
  const log = deps.logger;
  const now = deps.footballDataNow ?? Date.now;
  const started = now();
  const elapsed = () => Math.max(0, now() - started);
  // 단계 예산 = min(150초, 브리핑 마감까지 남은 시간) — 마감은 벽시계(deps.now), 예산은 단계 시계(now)에 더한다(M1-47)
  const budget = stageBudgets(msUntil(ctx.briefDeadline, deps.now()));
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
  // 단계 시간 예산(150초, 브리핑 마감이 더 가까우면 그때까지) — 근거는 providers/football-data.ts 머리 주석·collect-deadlines.ts
  const client = createFootballDataClient({
    apiKey,
    fetch: deps.fetch,
    sleep: deps.footballDataSleep,
    now,
    deadline: started + budget.footballDataMs,
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
  ctx: StageCtx,
  sink: ApiCallSink,
  signal: AbortSignal,
  onBrief: (snapshot: AfBriefSnapshot) => void,
): Promise<ProviderOutcome<ApiFootballData>> {
  const log = deps.logger;
  const now = deps.apiFootballNow ?? Date.now;
  const started = now();
  const elapsed = () => Math.max(0, now() - started);
  // 단계 예산 6분·브리핑 컷오프 4분을 브리핑 마감까지 남은 시간으로 줄인다(M1-47 — collect-deadlines.ts stageBudgets)
  const budget = stageBudgets(msUntil(ctx.briefDeadline, deps.now()));
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
    deadline: started + budget.apiFootballStageMs,
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
      // min(시작 + 4분, 브리핑 마감 − LLM 몫 4분) — 근거는 collect-deadlines.ts 머리 주석(M1-47)
      briefCutoffAt: started + budget.apiFootballBriefCutoffMs,
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
  ctx: StageCtx,
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

/** 브리핑 득점자 연결 결과(M1-48b · 원장 항목 M1-19) */
interface BriefGoalLinks {
  /** football-data 경기 id → 연결된 API-Football 상세 */
  byFd: Map<number, MatchDetail>;
  byTeamIds: number;
  byEvidence: number;
  /** 대회·킥오프·스코어는 맞지만 연결하지 않은 쌍(이유) */
  unconfirmed: string[];
  /** 이번 실행이 받지 않아 원장(data/matches)에서 보탠 상세 수 */
  fromLedger: number;
}

/** 브리핑이 쓰는 팀 id 대응표 — 읽지 못하면 빈 색인 + 자동 연결 끔(대응표와 어긋나는지 확인할 수 없다 — M1-48b 리뷰 권장 5) */
interface BriefTeamIndex {
  index: TeamIdIndex;
  autoLink: boolean;
}

async function loadBriefTeamIndex(deps: CollectDeps): Promise<BriefTeamIndex> {
  try {
    return {
      index: buildTeamIdIndex(await loadTeamIds(deps.rootDir)),
      autoLink: true,
    };
  } catch (error) {
    deps.logger.warn("summarize.input.team-ids-unreadable", {
      file: "configs/team-ids.json",
      error: errorText(error),
      autoLink: false,
    });
    return { index: EMPTY_TEAM_ID_INDEX, autoLink: false };
  }
}

/**
 * 중요도 입력 — 활성 한국 선수 소속팀의 football-data 팀 id(korean-players.json → team-ids.json). 읽지 못하면 빈 집합(중요도에서
 * 한국 선수 가중치만 빠진다 — 경고).
 */
async function briefKoreanTeamIds(
  deps: CollectDeps,
  index: TeamIdIndex,
): Promise<Set<number>> {
  try {
    const players = await readConfigFile(
      deps.rootDir,
      "korean-players.json",
      KoreanPlayersFileSchema,
    );
    const ids = new Set<number>();
    for (const p of players) {
      if (!p.active) continue;
      const fd = index.bySlug.get(p.team)?.fd;
      if (fd !== null && fd !== undefined) ids.add(fd);
    }
    return ids;
  } catch (error) {
    deps.logger.warn("summarize.input.korean-players-unreadable", {
      file: "configs/korean-players.json",
      error: errorText(error),
    });
    return new Set();
  }
}

/**
 * 선수 slug → 소속팀 slug(M1-21 — 첫 글자 축약 별칭 'H. Kane'을 대표 표기로 바꿀 때 소속팀 확인, names.ts playerTeamsFrom).
 * 등록 한국 선수(활성·비활성 모두) + 코드 표. 던지지 않는다 — 읽지 못하면 코드 표만.
 */
async function briefPlayerTeams(
  deps: CollectDeps,
): Promise<Map<string, string>> {
  try {
    return playerTeamsFrom(
      await readConfigFile(
        deps.rootDir,
        "korean-players.json",
        KoreanPlayersFileSchema,
      ),
    );
  } catch {
    // 중요도 계산(briefKoreanTeamIds)이 같은 파일 오류를 이미 경고한다
    return playerTeamsFrom();
  }
}

/**
 * 원장(data/matches)의 브리핑 창 항목 → 경기 상세(6개 대회만 — football-data와 짝짓는 대상). 같은 아침 두 번째 실행은 브리핑 창
 * 경기를 다시 받지 않으므로 이 항목으로 득점자를 잇는다(M1-48 이월). 원장은 정기 운영 prod 실행만 쓰므로 개발 실행에서는 대개 없다.
 * 던지지 않는다 — 읽지 못하면 경고하고 빈 목록.
 */
async function readBriefLedgerDetails(
  deps: CollectDeps,
  window: { start: string; end: string },
): Promise<MatchDetail[]> {
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  const months = [
    ...new Set([
      ledgerMonthOf(window.start),
      ledgerMonthOf(new Date(end - 1).toISOString()),
    ]),
  ];
  const details: MatchDetail[] = [];
  for (const month of months) {
    const read = await readLedgerMonth(deps.dataDir, month);
    if (read.error !== null) {
      deps.logger.warn("summarize.input.ledger-unreadable", {
        file: `data/matches/${month}.json`,
        error: read.error,
      });
      continue;
    }
    for (const m of read.value?.matches ?? []) {
      const kickoff = Date.parse(m.kickoff);
      if (m.comp === null || kickoff < start || kickoff >= end) continue;
      const detail = ledgerMatchToDetail(m);
      if (detail) details.push(detail);
    }
  }
  return details;
}

/**
 * 브리핑 몫(컷오프까지 받은 brief 계층 상세) + 원장의 같은 창 항목을 football-data 종료 경기에 잇는다 — 대응표 확인 + D37 강한
 * 증거(후보 수는 날짜 조회 목록·football-data 결과 밖 경기까지 센다). 대응표를 읽지 못했거나 API-Football 단계가 돌지 않아 날짜
 * 조회 목록이 없으면(원장 항목만) 자동 연결을 끈다 — 그날은 대응표로 확인된 경기만. 던지지 않는다 — 실패하면 득점자 없이(goals null).
 */
async function linkBriefGoals(
  deps: CollectDeps,
  fd: Pick<FootballDataBriefData, "results" | "others" | "window">,
  snapshot: AfBriefSnapshot | null,
  team: BriefTeamIndex,
): Promise<BriefGoalLinks> {
  const empty: BriefGoalLinks = {
    byFd: new Map(),
    byTeamIds: 0,
    byEvidence: 0,
    unconfirmed: [],
    fromLedger: 0,
  };
  try {
    const merged = mergeBriefDetails(
      snapshot?.details ?? [],
      await readBriefLedgerDetails(deps, fd.window),
    );
    if (merged.details.length === 0) return empty;
    // API-Football 단계가 돌지 않았으면(snapshot null — 키 없음·일 한도·실패) 날짜 조회 목록이 없어 D37의 '같은 칸에 점수 모르는
    // 후보가 있으면 차단'을 확인할 수 없다 → 자동 연결을 끄고 대응표로 확인된 경기만 잇는다(M1-48b 원칙)
    const linked = linkMatchDetails(fd.results, merged.details, team.index, {
      afUniverse: snapshot?.listed ?? [],
      fdUniverse: fd.others,
      autoLink: team.autoLink && snapshot !== null,
    });
    const ledgerIds = new Set(
      merged.details
        .slice(merged.details.length - merged.fromLedger)
        .map((d) => d.matchId),
    );
    return {
      byFd: new Map(linked.links.map((l) => [l.fd.matchId, l.af] as const)),
      byTeamIds: linked.links.filter((l) => l.linkedBy === "team-ids").length,
      byEvidence: linked.links.filter((l) => l.linkedBy === "evidence").length,
      unconfirmed: linked.unconfirmed.map(
        (u) => `${u.fdMatchId}↔${u.afMatchId}:${u.reason}`,
      ),
      fromLedger: linked.links.filter((l) => ledgerIds.has(l.af.matchId))
        .length,
    };
  } catch (error) {
    deps.logger.warn("summarize.input.goals-fail", { error: errorText(error) });
    return empty;
  }
}

/** 브리핑 단계 결과 — LLM 결과 + 게시(publishBrief)·미등록 이름 적재(recordUnknownNames)에 쓸 정형 입력·설정 */
interface BriefStageRun {
  outcome: BriefOutcome;
  /** 정형 입력(LLM에 보낸 그대로 — 득점자는 사전 대표 표기, M1-21) — 만들지 못했으면 null(football-data 키 없음·실패, 설정 읽기 실패) */
  input: BriefInput | null;
  /** 대회 설정(템플릿 대회 표기) */
  competitions: CompetitionsFile | null;
  /** 그날 기존 브리핑 파일(입력을 만든 뒤 읽는다) */
  existing: BriefFileRead | null;
  /** 고유명사 사전 색인(M1-21) — 사전을 읽지 못했으면 null(이름은 영문 그대로, 미등록 적재 생략) */
  names: NameIndex | null;
  /** LLM 출력을 치환한 뒤에도 남은 이름 후보(미등록 적재 — M1-21). LLM이 돌지 않았으면 빈 배열 */
  outputNames: string[];
}

/**
 * 고유명사 사전 색인(M1-21 — names.ts). 읽기·형식 오류는 경고하고 null — 브리핑은 영문 이름으로 계속(템플릿·입력 정리 없이),
 * 미등록 이름 적재는 건너뛴다(무엇이 등록됐는지 판단할 수 없다). 던지지 않는다.
 */
async function loadBriefNameIndex(
  deps: CollectDeps,
  competitions: CompetitionsFile,
): Promise<NameIndex | null> {
  try {
    return buildNameIndex(
      await readConfigFile(deps.rootDir, "names.ko.json", NamesKoFileSchema),
      competitions,
    );
  } catch (error) {
    deps.logger.warn("summarize.brief.names-unreadable", {
      file: "configs/names.ko.json",
      error: errorText(error),
    });
    return null;
  }
}

/** 한글 글자가 라틴 글자보다 적지 않은가 — 통째로 영어인 줄(M0-30)에서 미등록 이름을 거두지 않는다 */
function mostlyHangul(text: string): boolean {
  const hangul = text.match(/[가-힣]/g)?.length ?? 0;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  return hangul >= latin;
}

/**
 * 브리핑 단계 — 정형 입력을 만들고 LLM 1요청을 보낸다(던지지 않는다 — 예상 밖 오류는 호출부 방어선). 출력은 로그·dry 출력에만
 * 남긴다(M1-19 — 검증·강등 M1-45 전). 게시는 publishBrief가 이 결과의 입력으로 한다.
 */
async function runBriefStage(
  deps: CollectDeps,
  ctx: StageCtx,
  matchData: MatchDataBriefView,
  sink: {
    results: LlmResult[];
    /** 브리핑 설정을 해석했으면 그 모델(실행 기록 단가용) */
    model: string | null;
  },
): Promise<BriefStageRun> {
  const log = deps.logger;
  const fd = matchData.footballData;
  const noInput = (outcome: BriefOutcome): BriefStageRun => ({
    outcome,
    input: null,
    competitions: null,
    existing: null,
    names: null,
    outputNames: [],
  });
  if (fd.state === "skipped") {
    log.warn("summarize.brief.skip", {
      reason: "no-api-key",
      missing: "FOOTBALL_DATA_API_KEY",
    });
    return noInput({ state: "skipped", reason: "no-api-key", inputMatches: 0 });
  }
  if (fd.state === "failed") {
    // 경기 결과가 없으면 그날 브리핑은 생략한다 — 뉴스는 발행(D24)
    log.error("summarize.input.fail", {
      source: "football-data",
      errorType: fd.errorType,
      error: fd.error,
    });
    return noInput({
      state: "failed",
      reason: "football-data",
      detail: fd.error,
      inputMatches: 0,
    });
  }

  // 전날 경기 결과 + 현재 순위 + 연결된 경기의 득점자(M1-48b, 원장 항목 M1-19) → 정형 입력(M1-19 — 중요도 순)
  // → 득점자·도움을 사전 대표 영문 표기로(M1-21 — 모델이 입력 표기를 옮기면 사전 키와 같아 치환된다, M0-30)
  let input: BriefInput;
  let competitions: CompetitionsFile;
  let built: BriefInputBuild;
  let names: NameIndex | null = null;
  try {
    competitions = await readConfigFile(
      deps.rootDir,
      "competitions.json",
      CompetitionsFileSchema,
    );
    names = await loadBriefNameIndex(deps, competitions);
    const team = await loadBriefTeamIndex(deps);
    const goalLinks = await linkBriefGoals(
      deps,
      fd.data,
      matchData.apiFootballBrief,
      team,
    );
    built = buildBriefInput({
      briefDate: ctx.publishDate,
      results: fd.data.results,
      competitions,
      standings: fd.data.standings,
      linked: goalLinks.byFd,
      koreanTeamIds: await briefKoreanTeamIds(deps, team.index),
    });
    const canonical = names
      ? canonicalizeBriefInput(built.input, names, {
          playerTeams: await briefPlayerTeams(deps),
        })
      : { input: built.input, replaced: 0 };
    input = canonical.input;
    log.info("summarize.input.done", {
      date: ctx.publishDate,
      finished: fd.data.results.length,
      matches: input.matches.length,
      excluded: built.excluded,
      extraTime: built.extraTime,
      // 순위 — 확정 순위표만(진행 중 경기가 있는 대회는 빼서 순위 문장 금지), 상위 4위
      standings: built.standings.included,
      standingsInProgress: built.standings.inProgress,
      standingsMultiTable: built.standings.multiTable,
      // 득점자 — 연결(대응표·증거) 중 득점 목록이 완전한 경기만 goals 배열, 나머지는 null
      afBriefDetails: matchData.apiFootballBrief?.details.length ?? null,
      linkedByTeamIds: goalLinks.byTeamIds,
      linkedByEvidence: goalLinks.byEvidence,
      linkedFromLedger: goalLinks.fromLedger,
      unconfirmed: goalLinks.unconfirmed,
      goalsFilled: built.goals.filled,
      goalsIncomplete: built.goals.incomplete,
      // 득점자·도움을 사전 대표 표기로 바꾼 수(M1-21) — 사전을 읽지 못했으면 null
      canonicalNames: names ? canonical.replaced : null,
      inputChars: serializeBriefInput(input).length,
    });
  } catch (error) {
    log.error("summarize.input.fail", {
      source: "brief-input",
      errorType: error instanceof Error ? error.name : "unknown",
      error: errorText(error),
    });
    return noInput({
      state: "failed",
      reason: "setup",
      detail: errorText(error),
      inputMatches: 0,
    });
  }

  const inputMatches = input.matches.length;
  // 그날 기존 브리핑 — 이미 검증 통과 LLM 브리핑(llm·mixed)이면 LLM을 부르지 않는다(덮지 않음 — brief-file.ts 재실행 판정)
  const existing = await readBriefFile(deps.dataDir, ctx.publishDate);
  const withInput = (
    outcome: BriefOutcome,
    outputNames: string[] = [],
  ): BriefStageRun => ({
    outcome,
    input,
    competitions,
    existing,
    names,
    outputNames,
  });
  if (existing.value && isKeptBriefMode(existing.value.mode)) {
    log.info("summarize.brief.skip", {
      reason: "kept",
      date: ctx.publishDate,
      existingMode: existing.value.mode,
    });
    return withInput({
      state: "skipped",
      reason: "kept",
      existingMode: existing.value.mode,
      inputMatches,
    });
  }
  if (inputMatches === 0) {
    // 종료 경기가 없으면 LLM을 부르지 않는다(D24) — 게시는 empty
    log.info("summarize.brief.skip", {
      reason: "no-matches",
      date: ctx.publishDate,
    });
    return withInput({ state: "skipped", reason: "no-matches", inputMatches });
  }
  if (deps.dry) {
    deps.print(
      `── [dry] 브리핑 입력 (경기 ${inputMatches}개, 기사 텍스트 없음)\n${serializeBriefInput(input)}`,
    );
  }

  // 설정 해석 · 요청 준비 · 비용 가드(M1-22 — live만, mock은 비용 0): 최악값(첫 호출 + FR-29 재시도, 출력 = max_tokens) 예상을
  // 출력하고, 실행 시작 KST 날짜·달의 prod+dev 사용과 비교한다. runs 파일을 읽지 못하면 판정 불가로 LLM을 부르지 않는다.
  let request: LlmRequest;
  let config: BriefConfig;
  try {
    config = deps.resolveBriefConfig();
    sink.model = config.model;
    request = buildBriefRequest(input, await loadBriefPrompt(deps.rootDir));
    if (deps.llmMode === "live") {
      const decision = await guardBriefBudget({
        env: deps.env,
        requests: [request],
        model: config.model,
        budgets: config.budgets,
        at: parseUtcIso(ctx.startedAt),
        dataDir: deps.dataDir,
      });
      announceBriefBudget(decision, deps);
      const skip = briefBudgetSkip(decision);
      if (skip !== null) {
        // 같은 입력의 템플릿 브리핑을 게시한다(publishBrief — verdict 셋 다, M1-22 이월)
        return withInput({
          state: "skipped",
          reason: "budget",
          budget: skip,
          inputMatches,
        });
      }
    }
  } catch (error) {
    log.error("summarize.brief.fail", {
      stage: "setup",
      error: errorText(error),
    });
    return withInput({
      state: "failed",
      reason: "setup",
      detail: errorText(error),
      inputMatches,
    });
  }

  // 단건 1요청 (D28). 재시도는 llm.ts 정책(429·5xx만)이고 브리핑 마감(M1-47 — 공개 목표 −10분, 수동·지연 실행은 시작 + 8분)을
  // 넘길 재시도 대기는 하지 않는다. 요청 타임아웃을 남은 시간으로 줄이고 마감까지 실패하면 템플릿을 게시하는 것은 M1-45.
  // deadline은 벽시계 기준이다 — createLlm이 만드는 클라이언트의 시계(llm.ts now, 운영은 Date.now)와 deps.now가 같아야 한다.
  let result: LlmResult;
  try {
    const llm = deps.createLlm(config.model);
    result = await llm.callSingle(request, {
      deadline: parseUtcIso(ctx.briefDeadline),
    });
  } catch (error) {
    if (error instanceof LlmMockFixtureError) {
      log.warn("summarize.brief.skip", {
        reason: "mock-fixture-missing",
        customId: request.customId,
      });
      return withInput({
        state: "skipped",
        reason: "mock-fixture-missing",
        inputMatches,
      });
    }
    log.error("summarize.brief.fail", {
      stage: "llm",
      error: errorText(error),
    });
    return withInput({
      state: "failed",
      reason: "llm",
      detail: errorText(error),
      inputMatches,
    });
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
    return withInput({
      state: "failed",
      reason: "llm",
      detail: `${result.errorType}: ${result.message}`,
      inputMatches,
    });
  }

  // 출력 스키마(M1-20 확정) + 관용 파싱(D40 ⑤ — 전체 코드블록 벗김·앞 5줄)
  const parsed = parseBriefOutput(result.text);
  const prompt = briefPromptId(request.system);
  if (!parsed.ok) {
    log.error("summarize.brief.fail", {
      stage: "output",
      reason: parsed.reason,
      fenced: parsed.fenced,
      prompt,
      ...usageFields,
    });
    return withInput({
      state: "failed",
      reason: "output",
      detail: `출력 형식 오류(${parsed.reason})`,
      inputMatches,
    });
  }
  const lines = parsed.lines.map((line) => line.t);
  // 고유명사 치환 + 조사 보정(M1-21, FR-24) — 대회 표기는 같은 입력의 템플릿과 같은 브리핑 단위 표기(D30·D45 ④).
  // 치환 뒤에도 남은 이름 후보는 미등록 적재로(통째로 영어인 줄은 빼고 — recordUnknownNames)
  const form = chooseBriefCompForm(input, {
    competitions,
    names: names ? briefNamesFromIndex(names) : ENGLISH_NAMES,
  });
  const competitionLabel = (comp: CompId): string => {
    const config = competitions.find((c) => c.id === comp);
    return config
      ? briefCompLabel(config.nameEn, { competitions }, form)
      : comp;
  };
  const substituted = parsed.lines.map((line) =>
    names
      ? substituteNames(line.t, names, { competitionLabel })
      : { text: line.t, masked: line.t, replaced: [], particleFixes: 0 },
  );
  const outputNames = names
    ? [
        ...new Set(
          substituted
            .filter((r) => mostlyHangul(r.text))
            // 치환이 넣은 한글 표기('AC 밀란'·'UEFA 챔피언스리그') 속 라틴 낱말은 후보가 아니다 — 가린 텍스트에서 찾는다
            .flatMap((r) => unknownNamesInText(r.masked, names)),
        ),
      ]
    : [];
  // 80자 초과(D40 ⑤)는 치환·조사 보정 뒤 문장으로 잰다 — 강등 대상 표시만(실제 강등은 M1-45)
  const overLimit = briefLinesOverLimit(substituted.map((r) => r.text));
  log.info("summarize.brief.done", {
    date: ctx.publishDate,
    matches: inputMatches,
    lines: lines.length,
    prompt,
    fenced: parsed.fenced,
    droppedLines: parsed.droppedLines,
    overLimitLines: overLimit.length,
    namesReplaced: substituted.reduce((n, r) => n + r.replaced.length, 0),
    particleFixes: substituted.reduce((n, r) => n + r.particleFixes, 0),
    outputUnknownNames: outputNames.length,
    ...usageFields,
  });
  // 검증(M1-23)·강등(M1-45) 전이라 사람이 읽는 출력으로만 남긴다 — data/briefs에는 같은 입력의 템플릿을 게시한다(publishBrief).
  deps.print(
    [
      `── 브리핑 출력 (${ctx.publishDate}, ${deps.llmMode}, 저장 안 함 — 검증(M1-23·M1-45) 전, 고유명사 치환·조사 보정 뒤 / 원문)`,
      ...(parsed.fenced ? ["   (코드블록을 벗겨 읽음 — D40 ⑤)"] : []),
      ...(parsed.droppedLines > 0
        ? [`   (5줄 넘는 ${parsed.droppedLines}줄은 버림 — D40 ⑤)`]
        : []),
      ...parsed.lines.map((line, i) => {
        const text = substituted[i]!.text;
        const flag = overLimit.includes(i + 1)
          ? `  (${text.length}자 — 80자 초과, 강등 대상(D40 ⑤))`
          : "";
        return `${i + 1}. ${text}  [${line.r.join(",")}]${flag}\n   원문: ${line.t}`;
      }),
    ].join("\n"),
  );
  return withInput({ state: "done", inputMatches, lines }, outputNames);
}

/**
 * 브리핑 게시(M1-19 — data/briefs/<KST 발행일>.json, D38). 계획은 brief-file.ts `planBriefPublish`(M1-45 전에는 LLM이 성공해도
 * 템플릿), 같은 날 재실행은 `decideBriefWrite`. dry는 내용만 출력한다. 던지지 않는다 — 검증·쓰기 오류는 failed(실행은 partial).
 */
async function publishBrief(
  deps: CollectDeps,
  ctx: StageCtx & { runId: string },
  stage: BriefStageRun,
): Promise<BriefFileOutcome> {
  const log = deps.logger;
  const templateLines =
    stage.input && stage.competitions && stage.input.matches.length > 0
      ? templateBriefLines(stage.input, {
          competitions: stage.competitions,
          // 브리핑 단계가 읽은 사전(M1-21) — 읽지 못했으면 영문 그대로
          names: stage.names ? briefNamesFromIndex(stage.names) : ENGLISH_NAMES,
        })
      : [];
  const plan = planBriefPublish({
    brief: stage.outcome,
    inputMatches: stage.input?.matches.length ?? null,
    templateLines,
  });
  const existing = stage.existing;
  const base = {
    plan,
    existingMode: existing?.value?.mode ?? null,
    readError: existing?.error ?? null,
  };
  if (existing?.error) {
    // 깨진 기존 파일은 새 파일로 고친다(검증 게이트가 깨진 파일의 커밋을 막으므로 드문 경우) — 실행은 partial
    log.warn("summarize.brief.file-unreadable", {
      file: `data/briefs/${ctx.publishDate}.json`,
      error: existing.error,
    });
  }
  if (plan.mode === null) {
    log.info("summarize.brief.publish", {
      date: ctx.publishDate,
      mode: null,
      reason: plan.reason,
      action: "none",
    });
    return { ...base, action: "none", file: null, path: null, error: null };
  }
  let file: BriefFile;
  try {
    file = buildBriefFile({
      date: ctx.publishDate,
      generatedAt: nowUtcIso(deps.now()),
      runId: ctx.runId,
      mode: plan.mode,
      lines: plan.lines,
    });
  } catch (error) {
    log.error("summarize.brief.publish.fail", {
      date: ctx.publishDate,
      stage: "build",
      error: errorText(error),
    });
    return {
      ...base,
      action: "failed",
      file: null,
      path: null,
      error: errorText(error),
    };
  }
  const fields = {
    date: ctx.publishDate,
    mode: file.mode,
    reason: plan.reason,
    lines: file.lines.length,
    existingMode: base.existingMode,
  };
  if (deps.dry) {
    deps.print(
      `── [dry] data/briefs/${ctx.publishDate}.json (${file.mode} · ${plan.reason}, ${file.lines.length}줄 — 쓰지 않음)\n${serializeBriefFile(file)}`,
    );
    log.info("summarize.brief.publish", { ...fields, action: "dry" });
    return { ...base, action: "dry", file, path: null, error: null };
  }
  const decision = decideBriefWrite(existing?.value ?? null, file);
  if (decision.action !== "write") {
    const action = decision.action === "keep" ? "kept" : "unchanged";
    log.info("summarize.brief.publish", {
      ...fields,
      action,
      keepReason: decision.action === "keep" ? decision.reason : null,
    });
    return { ...base, action, file, path: null, error: null };
  }
  try {
    const written = await writeBriefFile(deps.dataDir, file);
    log.info("summarize.brief.publish", {
      ...fields,
      action: "written",
      file: `data/briefs/${ctx.publishDate}.json`,
    });
    return { ...base, action: "written", file, path: written, error: null };
  } catch (error) {
    log.error("summarize.brief.publish.fail", {
      date: ctx.publishDate,
      stage: "write",
      error: errorText(error),
    });
    return {
      ...base,
      action: "failed",
      file,
      path: null,
      error: errorText(error),
    };
  }
}

// ─── 미등록 고유명사 (M1-21) ───────────────────────────────────────────────

/** 미등록 이름 로그에 남기는 최대 개수(전체 수는 따로) */
const UNKNOWN_NAMES_LOG_MAX = 20;

/**
 * 미등록 고유명사 적재(M1-21, FR-24 — unknown-names.ts 머리 주석). 데이터 API 이름(브리핑 입력의 팀·득점자·도움 중 사전·무시 목록에
 * 없는 것) + 브리핑 출력 이름(치환 뒤 남은 후보 — 입력 이름과 같으면 그 유형). **prod·비dry만 파일을 쓴다** — dev·dry는 로그만.
 * 사전에 오른 이름은 이번 실행이 파일에서 뺀다. 던지지 않는다 — 실패해도 발행은 계속(캐시라 다음 실행이 다시 모은다).
 */
async function recordUnknownNames(
  deps: CollectDeps,
  ctx: { startedAt: string },
  stage: BriefStageRun,
): Promise<UnknownNamesOutcome> {
  const log = deps.logger;
  const names = stage.names;
  const base = { added: [], pruned: [], path: null, error: null };
  if (names === null) {
    log.info("summarize.names.skip", { reason: "names-unreadable" });
    return { ...base, observed: [], action: "skipped" };
  }
  const fromInput = stage.input
    ? unknownBriefInputNames(stage.input, names)
    : [];
  const inputKind = new Map(fromInput.map((n) => [foldName(n.name), n.kind]));
  const observed: UnknownNameObservation[] = [...fromInput];
  for (const name of stage.outputNames) {
    if (observed.some((o) => o.name === name)) continue;
    const kind = inputKind.get(foldName(name));
    observed.push(kind ? { name, kind } : { name });
  }
  const fields = {
    observed: observed.length,
    fromInput: fromInput.length,
    fromOutput: observed.length - fromInput.length,
    names: observed.slice(0, UNKNOWN_NAMES_LOG_MAX).map((o) => o.name),
  };
  // dev 실행이 횟수를 부풀리지 않게, dry는 data/를 쓰지 않으므로 — 로그만(af-pending 이월 목록과 같은 기준)
  if (deps.env !== "prod" || deps.dry) {
    log.info("summarize.names.unknown", { ...fields, action: "logged" });
    if (deps.dry && observed.length > 0) {
      deps.print(
        `── [dry] 미등록 고유명사 ${observed.length}개 (data/cache/unknown-names.json — 쓰지 않음)\n${observed
          .map((o) => `- ${o.name}${o.kind ? ` (${o.kind})` : ""}`)
          .join("\n")}`,
      );
    }
    return { ...base, observed, action: "logged" };
  }
  const read = await readUnknownNames(deps.dataDir);
  if (read.error !== null) {
    // 깨진 캐시는 새 파일로 고친다(검증 게이트가 깨진 파일의 커밋을 막으므로 드묾) — 누적 횟수는 잃는다
    log.warn("summarize.names.file-unreadable", {
      file: "data/cache/unknown-names.json",
      error: read.error,
    });
  }
  const merged = mergeUnknownNames(read.value, observed, {
    now: ctx.startedAt,
    isKnown: (name) => isKnownName(names, name),
  });
  const outcomeBase = {
    observed,
    added: merged.added,
    pruned: merged.pruned,
  };
  if (merged.file === null || (!merged.changed && read.error === null)) {
    log.info("summarize.names.unknown", { ...fields, action: "unchanged" });
    return { ...outcomeBase, action: "unchanged", path: null, error: null };
  }
  try {
    const written = await writeUnknownNames(deps.dataDir, merged.file);
    log.info("summarize.names.unknown", {
      ...fields,
      action: "written",
      added: merged.added.length,
      seenAgain: merged.seenAgain.length,
      pruned: merged.pruned.length,
      total: Object.keys(merged.file.names).length,
      file: "data/cache/unknown-names.json",
    });
    return { ...outcomeBase, action: "written", path: written, error: null };
  } catch (error) {
    log.error("summarize.names.fail", {
      file: unknownNamesPath(deps.dataDir),
      error: errorText(error),
    });
    return {
      ...outcomeBase,
      action: "failed",
      path: null,
      error: errorText(error),
    };
  }
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
 * 원장 쓰기 오류·원장 형식 오류 항목(M1-48b)·seen-urls 기억 읽기·쓰기 오류(M1-12)·클러스터링 오류(M1-13)·브리핑 파일 쓰기 오류·깨진
 * 기존 브리핑 파일(M1-19) = partial, 그 밖 = success.
 * partial도 뉴스는 발행된 실행이다(수집 창 기준 — collect-window.ts).
 */
export function runStatus(
  news: {
    ok: boolean;
    sources?: readonly { ok: boolean }[];
    seen?: Pick<SeenOutcome, "readError" | "writeError"> | null;
    clusterError?: string | null;
  },
  brief: BriefOutcome,
  matchData:
    | (Pick<MatchDataOutcome, "footballData"> &
        Partial<Pick<MatchDataOutcome, "apiFootball" | "ledger">>)
    | null = null,
  briefFile: Pick<BriefFileOutcome, "action" | "readError"> | null = null,
): RunLog["status"] {
  if (!news.ok) return "failed";
  if (news.sources?.some((source) => !source.ok)) return "partial";
  // 기억 파일이 깨졌거나(발행 파일로 다시 채워 진행) 쓰지 못했다(다음 실행은 최근 발행 파일로 중복을 막는다) — M1-12
  if (news.seen?.readError || news.seen?.writeError) return "partial";
  // 클러스터링 실패 — 같은 사건을 합치지 않은 채 발행했다(M1-13)
  if (news.clusterError) return "partial";
  if (brief.state === "failed") return "partial";
  const fd = matchData?.footballData;
  if (fd?.state === "done" && fd.data.standingsFailed.length > 0) {
    return "partial";
  }
  if (brief.state === "skipped" && brief.reason === "no-api-key") {
    return "partial";
  }
  // 비용 기록(runs 파일)을 읽지 못해 예산을 확인할 수 없었다 — LLM 없이 진행했지만 기록 파일을 고쳐야 한다(M1-22).
  // 예산 초과 예상(daily·monthly_exceeded)은 의도된 강등이라 success로 둔다(FR-27).
  if (
    brief.state === "skipped" &&
    brief.reason === "budget" &&
    brief.budget.verdict === "runs_unreadable"
  ) {
    return "partial";
  }
  if (matchData?.apiFootball && apiFootballIncomplete(matchData.apiFootball)) {
    return "partial";
  }
  // 원장 쓰기 오류(달 파일·메타)·형식 오류 항목 — 받은 경기는 이월 목록에 다시 넣었지만 실행 상태에 드러낸다(M1-48b)
  if ((matchData?.ledger?.applied?.errors.length ?? 0) > 0) return "partial";
  if ((matchData?.ledger?.invalid.length ?? 0) > 0) return "partial";
  // 브리핑 파일 검증·쓰기 실패, 또는 깨진 기존 파일을 고쳐 썼다(M1-19) — 뉴스는 발행됐다
  if (briefFile?.action === "failed" || briefFile?.readError) return "partial";
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
  // 브리핑 마감(M1-47) — 발행일 슬롯(계절)의 공개 목표 − 10분, 수동·지연 실행은 시작 + 8분. 경기 데이터 단계 예산과 LLM 재시도를
  // 이 안으로 묶는다(scripts/lib/collect-deadlines.ts).
  const deadlines: CollectDeadlines = planCollectDeadlines(startedAt);
  log.info("collect.deadline", deadlineLogFields(deadlines, startedAt));
  // 비용(M1-22) — 이번 달 prod·dev 누적 한 줄, dev 사용이 월 예산 50%를 넘으면 경고(dev = 눈에 띄는 출력, prod = Actions 주석).
  // 던지지 않는다. 예산 설정은 브리핑 설정 해석을 빌리고, 잘못된 값이면 알림만 건너뛴다(브리핑 판정은 브리핑 단계가 따로 한다).
  await noticeMonthlyUsage({
    env: deps.env,
    dataDir: deps.dataDir,
    at: parseUtcIso(startedAt),
    resolveBudgets: () => deps.resolveBriefConfig().budgets,
    logger: log,
    print: deps.print,
  });
  const stageCtx = {
    publishDate,
    briefDeadline: deadlines.briefDeadline,
    startedAt,
  };

  // ⓪ data 원본 삭제(M1-25 — 삭제 요청·소스별 보존 기간, purge-stage.ts). 뉴스 단계 **전에** 지워야 뉴스 단계가 지운 뒤의 오늘 파일·
  // 최근 발행 파일·기억을 읽는다(지운 카드가 같은 실행에서 다시 카드가 되지 않음). 던지지 않는다 — 실패는 partial(발행 계속).
  const purge = await runPurgeStage(
    {
      rootDir: deps.rootDir,
      dataDir: deps.dataDir,
      env: deps.env,
      dry: deps.dry,
      now: deps.now,
      ...(deps.loadSources ? { loadSources: deps.loadSources } : {}),
      logger: log,
      print: deps.print,
    },
    { runId, startedAt },
  );

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
      stageCtx,
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
  let briefStage: BriefStageRun | null = null;
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
      briefStage = await runBriefStage(deps, stageCtx, view, sink);
      brief = briefStage.outcome;
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
  // 브리핑 게시(M1-19) — data/briefs/<KST 발행일>.json. 실패해도 뉴스 발행은 계속(partial)
  let briefFile: BriefFileOutcome | null = null;
  if (briefStage !== null) {
    try {
      briefFile = await publishBrief(deps, { ...stageCtx, runId }, briefStage);
    } catch (error) {
      // 방어선 — publishBrief는 던지지 않는다. 여기 오면 템플릿 생성의 예상 밖 오류다.
      log.error("summarize.brief.publish.fail", {
        stage: "unexpected",
        error: errorText(error),
      });
      briefFile = {
        plan: null,
        action: "failed",
        file: null,
        path: null,
        existingMode: briefStage.existing?.value?.mode ?? null,
        readError: briefStage.existing?.error ?? null,
        error: errorText(error),
      };
    }
  }

  // 미등록 고유명사(M1-21) — 브리핑 입력·출력의 사전에 없는 이름. prod·비dry만 파일을 쓴다. 실패해도 발행은 계속
  let unknownNames: UnknownNamesOutcome | null = null;
  if (briefStage !== null) {
    try {
      unknownNames = await recordUnknownNames(deps, stageCtx, briefStage);
    } catch (error) {
      // 방어선 — recordUnknownNames는 던지지 않는다
      log.error("summarize.names.fail", {
        stage: "unexpected",
        error: errorText(error),
      });
    }
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

  // 삭제 단계 오류(M1-25)는 runStatus 바깥에서 partial로 덧씌운다
  const status = withPurgeStatus(
    runStatus(news, brief, matchData, briefFile),
    purge,
  );
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
    purge: purgeSummary(purge),
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
    briefFile: briefFile
      ? `${briefFile.plan?.mode ?? "none"}:${briefFile.action}`
      : null,
    unknownNames: unknownNames
      ? `${unknownNames.observed.length}:${unknownNames.action}`
      : null,
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
    purge,
    news,
    health,
    matchData,
    brief,
    briefFile,
    unknownNames,
    run,
    runPath,
    status,
    exitCode,
  };
}
