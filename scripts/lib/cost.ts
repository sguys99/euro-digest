/**
 * 비용 계산·기록·예산 가드 (M0-21) — 모델 단가는 이 파일 한 곳에서만 관리한다 (CLAUDE.md §6.2).
 *
 * 구성
 *   - 단가 표 `MODEL_PRICING`: 모델 ID → 단가. 표에 없는 모델은 오류(조용히 0원으로 계산하지 않는다).
 *   - 순수 함수: estimateCost(실행 전 예상) · costFromUsage / costFromResults(실측 usage → USD) ·
 *     todayTotal / monthToDate(prod+dev 합산, env별 분리) · checkBudget(가드) · pruneRuns(180일) ·
 *     formatEstimate(실행 전 출력 문구)
 *   - 얇은 I/O: readRuns · appendRun(원자적 쓰기) · recordRun · createRunRecorder / withRecordedRun
 *
 * 확인한 단가 (2026-10-10 확인)
 *   출처: https://platform.claude.com/docs/en/about-claude/pricing (Model pricing · Batch processing ·
 *         Long context pricing · Prompt caching) — https://claude.com/pricing 와 교차 확인
 *   - claude-haiku-5-5, 프롬프트 ≤ 100,000토큰: 입력 $0.10 · 5분 캐시 쓰기 $0.125 · 1시간 캐시 쓰기 $0.20 ·
 *     캐시 읽기 $0.01 · 출력 $0.50 (per MTok)
 *   - claude-haiku-5-5, 프롬프트 > 100,000토큰: 입력 $0.50 · $0.625 · $1 · $0.05 · 출력 $2.50
 *     프롬프트 길이 = 그 요청의 입력 전체(캐시 읽기·쓰기 포함). 요청마다 따로 판정한다.
 *   - Batches API: 모든 토큰 50% 할인. 캐시 배수와 겹쳐 적용된다(배치 캐시 읽기 = $0.005).
 *   - thinking 토큰은 output으로 과금된다(usage.output_tokens에 포함 — llm.ts TokenUsage.out).
 *   - 표는 1st-party API·global 라우팅 기준이다. `inference_geo: "us"`(×1.1)·Bedrock·Vertex는 쓰지 않는다.
 *
 * 계산 규칙
 *   - 단가를 "토큰당 피코달러(1e-12 USD)" 정수로 바꿔 정수로 더한 뒤 마지막에 한 번만 반올림한다.
 *     예) $0.10/MTok = 100,000 pUSD/token, 배치 캐시 읽기 $0.005/MTok = 5,000 pUSD/token.
 *   - 반올림: USD 소수 6자리(1 마이크로달러), 0.5는 올림(half up). 합계는 마이크로달러 정수로 더한다.
 *   - RunLog.tokens에는 캐시 쓰기 TTL 구분이 없다 → 기본 5분(1.25배)으로 계산한다(1시간 TTL은 옵션).
 *
 * 결정 사항 (M0-21, 2026-10-10)
 *   - 하루·한 달은 **KST 기준**(src/lib/time.ts kstDate·kstMonth). 실행은 startedAt으로 귀속한다.
 *     06:30 KST 발행 실행(UTC로 전날 21:30)이 그 발행일·그 달에 잡히고, 뉴스 파일 날짜(KST)와 맞는다.
 *   - 일일 예산: prod 실행은 그날 **prod 사용분만**, dev 실행은 그날 **prod+dev 합계**로 판단한다
 *     (개발 실험이 그날 발행 브리핑을 코드 템플릿으로 강등시키지 않게). 월 예산은 env와 무관하게 **항상 합산**.
 *   - dev 누적이 월 예산의 50%를 넘으면 devAlert(CLAUDE.md §6.3).
 *   - mock 실행은 기록하지 않는다(비용 0, 테스트가 data/를 건드리지 않게). live 실행은 dry여도 기록한다.
 */
import { randomBytes } from "node:crypto";
import * as fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RunLogSchema,
  RunsDevFileSchema,
  RunsFileSchema,
  type RunEnv,
  type RunLog,
} from "@/lib/schema";
import {
  kstDate,
  kstMonth,
  nowUtcIso,
  parseUtcIso,
  shiftDate,
} from "@/lib/time";

import type { LlmMode } from "./cli-args";
// 타입만 가져온다 — 런타임에 llm.ts(SDK)를 불러오지 않는다.
import type { LlmResult, TokenUsage, UsageSummary } from "./llm";

// ─── 오류 ────────────────────────────────────────────────────────────────

/** 비용 계산 입력 오류(호출부 버그) — 표에 없는 모델, 음수·소수 토큰 등 */
export class CostError extends Error {
  override name = "CostError";
}

/** 단가 표에 없는 모델 */
export class UnknownModelPricingError extends CostError {
  override name = "UnknownModelPricingError";
}

/** 예산 환경변수 형식 오류 */
export class CostConfigError extends Error {
  override name = "CostConfigError";
}

/** runs 파일 읽기·쓰기 규칙 위반(파일 이름·env 불일치·스키마·중복 runId) */
export class RunsFileError extends Error {
  override name = "RunsFileError";
}

// ─── 단가 표 ─────────────────────────────────────────────────────────────

/** USD per 1M tokens */
export interface PriceTier {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

export interface ModelPricing {
  /** 기본 단가 */
  standard: PriceTier;
  /** 장문 프롬프트 단가 — 요청의 프롬프트(in + cacheRead + cacheWrite)가 thresholdTokens를 **넘으면** 적용 */
  longContext?: { thresholdTokens: number; tier: PriceTier };
  /** Batches API 배수(0.5 = 50% 할인). 캐시 읽기·쓰기를 포함한 모든 토큰에 적용 */
  batchMultiplier: number;
}

export type CacheWriteTtl = "5m" | "1h";

/**
 * 모델 ID → 단가 (2026-10-10 확인, 출처는 파일 머리말).
 * 모델을 바꾸려면(LLM_MODEL) 사용자 승인 후 그 시점의 공식 단가로 여기에 행을 추가한다(CLAUDE.md §1-3).
 */
export const MODEL_PRICING: Readonly<Record<string, Readonly<ModelPricing>>> =
  Object.freeze({
    "claude-haiku-5-5": Object.freeze({
      standard: Object.freeze({
        input: 0.1,
        output: 0.5,
        cacheWrite5m: 0.125,
        cacheWrite1h: 0.2,
        cacheRead: 0.01,
      }),
      longContext: Object.freeze({
        thresholdTokens: 100_000,
        tier: Object.freeze({
          input: 0.5,
          output: 2.5,
          cacheWrite5m: 0.625,
          cacheWrite1h: 1,
          cacheRead: 0.05,
        }),
      }),
      batchMultiplier: 0.5,
    }),
  });

/** 단가 확인 날짜·출처 — 운영 리포트·보고에 그대로 쓴다 */
export const PRICING_VERIFIED = Object.freeze({
  date: "2026-10-10",
  sources: Object.freeze([
    "https://platform.claude.com/docs/en/about-claude/pricing",
    "https://claude.com/pricing",
  ]),
});

/** 표에 없는 모델이면 UnknownModelPricingError (0원 계산 금지). */
export function getModelPricing(model: string): Readonly<ModelPricing> {
  if (!Object.hasOwn(MODEL_PRICING, model)) {
    throw new UnknownModelPricingError(
      `단가 표에 없는 모델: "${model}" — scripts/lib/cost.ts MODEL_PRICING에 공식 단가를 확인해 추가할 것 (등록: ${Object.keys(MODEL_PRICING).join(", ")})`,
    );
  }
  const pricing = MODEL_PRICING[model];
  if (!pricing)
    throw new UnknownModelPricingError(`단가 표 조회 실패: "${model}"`);
  return pricing;
}

// ─── 정수 금액 계산 ──────────────────────────────────────────────────────

const PICO_PER_MICRO = 1_000_000;
const MICRO_PER_USD = 1_000_000;

/** USD per MTok × 배수 → 토큰당 피코달러(정수) */
function picoPerToken(usdPerMTok: number, multiplier: number): number {
  return Math.round(usdPerMTok * multiplier * 1_000_000);
}

/** 피코달러 정수 → USD(소수 6자리, half up) */
function picoToUsd(pico: number): number {
  if (!Number.isSafeInteger(pico)) {
    throw new CostError(`금액이 정수 계산 범위를 넘었다 (${pico} pUSD)`);
  }
  return Math.round(pico / PICO_PER_MICRO) / MICRO_PER_USD;
}

/** USD → 마이크로달러 정수(합산·비교용) */
function toMicro(usd: number): number {
  return Math.round(usd * MICRO_PER_USD);
}

function fromMicro(micro: number): number {
  return micro / MICRO_PER_USD;
}

/** USD 값들을 마이크로달러 정수로 더한다(0.1 + 0.2 = 0.3). */
export function sumUsd(values: Iterable<number>): number {
  let micro = 0;
  for (const value of values) {
    assertUsd(value, "금액");
    micro += toMicro(value);
  }
  return fromMicro(micro);
}

/** USD 금액을 소수 6자리(half up)로 반올림 */
export function roundUsd(usd: number): number {
  assertUsd(usd, "금액");
  return fromMicro(toMicro(usd));
}

function assertUsd(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new CostError(
      `${label}은 0 이상의 유한한 수여야 한다 (받은 값: ${value})`,
    );
  }
}

function assertTokenCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CostError(
      `${label}는 0 이상의 정수여야 한다 (받은 값: ${value})`,
    );
  }
}

function assertTokenUsage(usage: TokenUsage, label: string): void {
  assertTokenCount(usage.in, `${label}.in`);
  assertTokenCount(usage.out, `${label}.out`);
  assertTokenCount(usage.cacheRead, `${label}.cacheRead`);
  assertTokenCount(usage.cacheWrite, `${label}.cacheWrite`);
}

/** 요청의 프롬프트 길이 = 입력 전체(캐시 안 된 입력 + 캐시 읽기 + 캐시 쓰기) — 장문 단가 판정 기준 */
export function promptTokens(usage: TokenUsage): number {
  return usage.in + usage.cacheRead + usage.cacheWrite;
}

function tierForPrompt(
  pricing: Readonly<ModelPricing>,
  prompt: number,
): PriceTier {
  const long = pricing.longContext;
  return long && prompt > long.thresholdTokens ? long.tier : pricing.standard;
}

function usagePico(
  usage: TokenUsage,
  tier: PriceTier,
  multiplier: number,
  ttl: CacheWriteTtl,
): number {
  const writePrice = ttl === "1h" ? tier.cacheWrite1h : tier.cacheWrite5m;
  return (
    usage.in * picoPerToken(tier.input, multiplier) +
    usage.out * picoPerToken(tier.output, multiplier) +
    usage.cacheRead * picoPerToken(tier.cacheRead, multiplier) +
    usage.cacheWrite * picoPerToken(writePrice, multiplier)
  );
}

export interface CostOptions {
  /** 캐시 쓰기 TTL — RunLog.tokens에 구분이 없어 기본 5분으로 계산 */
  cacheWriteTtl?: CacheWriteTtl;
}

/**
 * 실측 usage 합계 → USD. 배치(50%)와 단건(일반 단가)을 나눠 계산하고 캐시 읽기·쓰기를 반영한다.
 *
 * 집계값으로는 요청별 프롬프트 길이를 알 수 없다. 그래서 그룹(배치/단건)의 프롬프트 합계가 장문 기준
 * (Haiku 5.5: 100K)을 넘지 않을 때만 계산한다 — 그러면 모든 요청이 기준 이하라 기본 단가가 정확하다.
 * 넘으면 CostError → 요청별 결과로 계산하는 costFromResults를 쓴다(일일 뉴스 ~15K·주간 팀 ~35K로 평소엔 해당 없음).
 */
export function costFromUsage(
  model: string,
  usage: Pick<UsageSummary, "batch" | "single">,
  options: CostOptions = {},
): number {
  const pricing = getModelPricing(model);
  const ttl = options.cacheWriteTtl ?? "5m";
  let pico = 0;
  for (const [label, group, multiplier] of [
    ["batch", usage.batch, pricing.batchMultiplier],
    ["single", usage.single, 1],
  ] as const) {
    assertTokenUsage(group, label);
    const long = pricing.longContext;
    if (long && promptTokens(group) > long.thresholdTokens) {
      throw new CostError(
        `${label} 프롬프트 합계 ${promptTokens(group)}토큰이 장문 단가 기준(${long.thresholdTokens})을 넘어 요청별 판정이 필요하다 — costFromResults를 쓸 것`,
      );
    }
    pico += usagePico(group, pricing.standard, multiplier, ttl);
  }
  return picoToUsd(pico);
}

/** 요청별 결과 → USD. 요청마다 장문 단가 여부를 따로 판정한다(가장 정확한 경로). */
export function costFromResults(
  model: string,
  results: Iterable<Pick<LlmResult, "usage" | "batch">>,
  options: CostOptions = {},
): number {
  const pricing = getModelPricing(model);
  const ttl = options.cacheWriteTtl ?? "5m";
  let pico = 0;
  let index = 0;
  for (const result of results) {
    assertTokenUsage(result.usage, `results[${index}].usage`);
    const tier = tierForPrompt(pricing, promptTokens(result.usage));
    const multiplier = result.batch ? pricing.batchMultiplier : 1;
    pico += usagePico(result.usage, tier, multiplier, ttl);
    index += 1;
  }
  return picoToUsd(pico);
}

// ─── 실행 전 예상 ────────────────────────────────────────────────────────

export interface EstimateInput {
  model: string;
  /** 요청 수(배치 안의 요청 수 — 10~20건 묶음이면 묶음 수) */
  requests: number;
  /** 요청 1건의 평균 입력 토큰(시스템 프롬프트 포함) */
  avgInputTokens: number;
  /** 요청 1건의 평균 출력 토큰(thinking 포함). 보수적으로 잡으려면 max_tokens를 넣는다 */
  avgOutputTokens: number;
  batch: boolean;
  /** 입력 중 캐시에서 읽힐 비율 0~1 (기본 0) */
  cacheHitRatio?: number;
  /** 캐시에 새로 쓸 토큰 합계(기본 0) — 입력 중 캐시 읽기 외 부분에서 떼어 쓰기 단가를 적용 */
  cacheWriteTokens?: number;
  cacheWriteTtl?: CacheWriteTtl;
}

export interface CostEstimate {
  model: string;
  requests: number;
  batch: boolean;
  /** 예상 토큰 합계(RunLog.tokens 형태) */
  tokens: TokenUsage;
  usd: number;
}

/**
 * 실행 전 예상 비용. 모든 요청이 평균 크기라고 보고 장문 단가 여부를 평균 입력으로 판정한다.
 * 입력 합계 = round(requests × avgInputTokens) = in + cacheRead + cacheWrite.
 */
export function estimateCost(input: EstimateInput): CostEstimate {
  const pricing = getModelPricing(input.model);
  assertTokenCount(input.requests, "requests");
  for (const [label, value] of [
    ["avgInputTokens", input.avgInputTokens],
    ["avgOutputTokens", input.avgOutputTokens],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new CostError(
        `${label}는 0 이상의 수여야 한다 (받은 값: ${value})`,
      );
    }
  }
  const ratio = input.cacheHitRatio ?? 0;
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new CostError(`cacheHitRatio는 0~1이어야 한다 (받은 값: ${ratio})`);
  }
  const writeTokens = input.cacheWriteTokens ?? 0;
  assertTokenCount(writeTokens, "cacheWriteTokens");

  const totalIn = Math.round(input.requests * input.avgInputTokens);
  const cacheRead = Math.round(totalIn * ratio);
  const cacheWrite = Math.min(writeTokens, totalIn - cacheRead);
  const tokens: TokenUsage = {
    in: totalIn - cacheRead - cacheWrite,
    out: Math.round(input.requests * input.avgOutputTokens),
    cacheRead,
    cacheWrite,
  };
  const tier = tierForPrompt(pricing, input.avgInputTokens);
  const multiplier = input.batch ? pricing.batchMultiplier : 1;
  const usd = picoToUsd(
    usagePico(tokens, tier, multiplier, input.cacheWriteTtl ?? "5m"),
  );
  return {
    model: input.model,
    requests: input.requests,
    batch: input.batch,
    tokens,
    usd,
  };
}

// ─── 집계 (KST 하루·KST 달) ──────────────────────────────────────────────

export interface SpendTotals {
  /** 집계 키 — 하루 "YYYY-MM-DD" / 달 "YYYY-MM" (KST) */
  key: string;
  /** prod + dev */
  total: number;
  prod: number;
  dev: number;
}

function totalsBy(
  runs: readonly RunLog[],
  key: string,
  keyOf: (iso: string) => string,
): SpendTotals {
  let prod = 0;
  let dev = 0;
  for (const run of runs) {
    if (keyOf(run.startedAt) !== key) continue;
    assertUsd(run.costUsd, `runs[${run.runId}].costUsd`);
    if (run.env === "prod") prod += toMicro(run.costUsd);
    else dev += toMicro(run.costUsd);
  }
  return {
    key,
    total: fromMicro(prod + dev),
    prod: fromMicro(prod),
    dev: fromMicro(dev),
  };
}

/** 오늘(KST) 사용액 — 실행은 startedAt의 KST 날짜로 귀속. runs에는 prod·dev를 섞어 넣어도 된다. */
export function todayTotal(runs: readonly RunLog[], now: Date): SpendTotals {
  return totalsBy(runs, kstDate(nowUtcIso(now)), kstDate);
}

/** 이번 달(KST) 누적 — 실행은 startedAt의 KST 달로 귀속. */
export function monthToDate(runs: readonly RunLog[], now: Date): SpendTotals {
  return totalsBy(runs, kstMonth(nowUtcIso(now)), kstMonth);
}

// ─── 예산 가드 ───────────────────────────────────────────────────────────

export const DEFAULT_DAILY_BUDGET_USD = 0.1;
export const DEFAULT_MONTHLY_BUDGET_USD = 3;
/** dev 누적이 월 예산의 이 비율을 넘으면 알림 (CLAUDE.md §6.3) */
export const DEV_ALERT_SHARE = 0.5;

export interface Budgets {
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
}

export type BudgetReason = "ok" | "daily_exceeded" | "monthly_exceeded";

export interface BudgetWindow {
  /** KST 날짜 "YYYY-MM-DD" 또는 달 "YYYY-MM" */
  key: string;
  /** 판단에 쓴 범위 — 일일 예산의 prod 실행만 "prod", 나머지는 "prod+dev" */
  scope: "prod" | "prod+dev";
  /** 이미 쓴 금액(scope 기준) */
  used: number;
  /** used + 이번 예상 */
  projected: number;
  limit: number;
  /** limit − used (음수 가능) */
  remaining: number;
  /** 참고용 env별 분리 값 */
  prod: number;
  dev: number;
}

export interface BudgetCheck {
  /** 이번 실행에서 LLM을 불러도 되는지. false면 LLM 없이 진행 — 일일 브리핑은 코드 템플릿 문장으로 게시(FR-27) */
  allowed: boolean;
  reason: BudgetReason;
  /** 사람용 한 줄 설명 */
  message: string;
  env: RunEnv;
  estimatedUsd: number;
  daily: BudgetWindow;
  monthly: BudgetWindow;
  /** 이번 달 dev 누적 ÷ 월 예산 */
  devShare: number;
  /** devShare가 50%를 넘음 → 사용자에게 알림 */
  devAlert: boolean;
}

export interface CheckBudgetInput {
  /** 지금 판단하는 실행의 env */
  env: RunEnv;
  estimatedUsd: number;
  /** data/runs.json 내용(prod만) */
  prodRuns: readonly RunLog[];
  /** data/runs-dev.json 내용(dev만) */
  devRuns: readonly RunLog[];
  now: Date;
  dailyBudget: number;
  monthlyBudget: number;
}

function assertRunsEnv(runs: readonly RunLog[], env: RunEnv, label: string) {
  for (const run of runs) {
    if (run.env !== env) {
      throw new RunsFileError(
        `${label}에는 env "${env}" 실행만 넣는다 (runId ${run.runId}: "${run.env}")`,
      );
    }
  }
}

/**
 * 예산 가드. 월 예산은 prod+dev 합산, 일일 예산은 prod 실행이면 prod만·dev 실행이면 prod+dev.
 * 경계는 포함(used + 예상 == 예산이면 허용). 금액 비교는 마이크로달러 정수로 한다.
 */
export function checkBudget(input: CheckBudgetInput): BudgetCheck {
  assertUsd(input.estimatedUsd, "estimatedUsd");
  assertUsd(input.dailyBudget, "dailyBudget");
  assertUsd(input.monthlyBudget, "monthlyBudget");
  assertRunsEnv(input.prodRuns, "prod", "prodRuns");
  assertRunsEnv(input.devRuns, "dev", "devRuns");

  const all = [...input.prodRuns, ...input.devRuns];
  const today = todayTotal(all, input.now);
  const month = monthToDate(all, input.now);
  const est = toMicro(input.estimatedUsd);

  const dailyScope = input.env === "prod" ? "prod" : "prod+dev";
  const dailyUsed = toMicro(input.env === "prod" ? today.prod : today.total);
  const dailyLimit = toMicro(input.dailyBudget);
  const monthlyUsed = toMicro(month.total);
  const monthlyLimit = toMicro(input.monthlyBudget);

  const makeWindow = (
    key: string,
    scope: BudgetWindow["scope"],
    used: number,
    limit: number,
    totals: SpendTotals,
  ): BudgetWindow => ({
    key,
    scope,
    used: fromMicro(used),
    projected: fromMicro(used + est),
    limit: fromMicro(limit),
    remaining: fromMicro(limit - used),
    prod: totals.prod,
    dev: totals.dev,
  });
  const daily = makeWindow(today.key, dailyScope, dailyUsed, dailyLimit, today);
  const monthly = makeWindow(
    month.key,
    "prod+dev",
    monthlyUsed,
    monthlyLimit,
    month,
  );

  // 예상 0원(LLM을 부르지 않는 실행)은 막을 것이 없다.
  const monthlyOver = est > 0 && monthlyUsed + est > monthlyLimit;
  const dailyOver = est > 0 && dailyUsed + est > dailyLimit;
  const reason: BudgetReason = monthlyOver
    ? "monthly_exceeded"
    : dailyOver
      ? "daily_exceeded"
      : "ok";

  const devMicro = toMicro(month.dev);
  const devShare = monthlyLimit > 0 ? devMicro / monthlyLimit : 0;
  const devAlert = monthlyLimit > 0 ? devShare > DEV_ALERT_SHARE : devMicro > 0;

  const message =
    reason === "monthly_exceeded"
      ? `월 예산 초과 예상 (${month.key} KST, prod+dev ${formatUsd(monthly.used)} + 예상 ${formatUsd(input.estimatedUsd)} > ${formatUsd(monthly.limit)}) → LLM 없이 진행 (브리핑은 코드 템플릿)`
      : reason === "daily_exceeded"
        ? `일일 예산 초과 예상 (${today.key} KST, ${dailyScope} ${formatUsd(daily.used)} + 예상 ${formatUsd(input.estimatedUsd)} > ${formatUsd(daily.limit)}) → LLM 없이 진행 (브리핑은 코드 템플릿)`
        : `예산 안 (오늘 ${formatUsd(daily.projected)} / ${formatUsd(daily.limit)}, 이번 달 ${formatUsd(monthly.projected)} / ${formatUsd(monthly.limit)})`;

  return {
    allowed: reason === "ok",
    reason,
    message,
    env: input.env,
    estimatedUsd: fromMicro(est),
    daily,
    monthly,
    devShare,
    devAlert,
  };
}

// ─── 보존·정렬 ───────────────────────────────────────────────────────────

/** 실행 로그 보존 기간(일) — CLAUDE.md §8 */
export const RUNS_RETENTION_DAYS = 180;

/**
 * 보존 기간이 지난 실행을 뺀다. 오늘(KST)을 포함한 최근 `days`일(KST 날짜 기준)에 시작한 실행만 남긴다.
 * 예) now = 2026-10-10 KST, days 180 → 2026-04-14 KST 이후 시작분만. 순서는 유지한다.
 */
export function pruneRuns(
  runs: readonly RunLog[],
  now: Date,
  days: number = RUNS_RETENTION_DAYS,
): RunLog[] {
  if (!Number.isSafeInteger(days) || days < 1) {
    throw new CostError(
      `보존 일수는 1 이상의 정수여야 한다 (받은 값: ${days})`,
    );
  }
  const oldestKept = shiftDate(kstDate(nowUtcIso(now)), -(days - 1));
  return runs.filter((run) => kstDate(run.startedAt) >= oldestKept);
}

/** startedAt(시각 값) 오름차순, 같으면 runId 순 — 파일 내용이 결정적이도록 */
export function sortRuns(runs: readonly RunLog[]): RunLog[] {
  return [...runs].sort((a, b) => {
    const diff =
      parseUtcIso(a.startedAt).getTime() - parseUtcIso(b.startedAt).getTime();
    if (diff !== 0) return diff;
    return a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0;
  });
}

// ─── 출력 문구 ───────────────────────────────────────────────────────────

/** 비용 표시: $1 미만은 소수 6자리, 이상은 2자리 */
export function formatUsd(usd: number): string {
  return usd < 1 ? `$${usd.toFixed(6)}` : `$${usd.toFixed(2)}`;
}

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

function formatPercent(part: number, whole: number): string {
  if (whole <= 0) return part > 0 ? "한도 0" : "0.0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/**
 * 실행 전 출력 문구(CLAUDE.md §6.3) — 예상 토큰·비용·오늘/이번 달 사용률·판정·dev 50% 경고.
 * 비밀값·프롬프트 본문은 넣지 않는다. 여러 줄 문자열(끝 개행 없음).
 */
export function formatEstimate(
  estimate: CostEstimate,
  budget: BudgetCheck,
): string {
  const t = estimate.tokens;
  const lines = [
    `[cost] 예상 — ${estimate.model} · ${estimate.batch ? "배치(50% 할인)" : "단건"} · 요청 ${formatInt(estimate.requests)}건 · env ${budget.env}`,
    `[cost]   토큰: 입력 ${formatInt(t.in)} · 캐시 읽기 ${formatInt(t.cacheRead)} · 캐시 쓰기 ${formatInt(t.cacheWrite)} · 출력 ${formatInt(t.out)}(thinking 포함)`,
    `[cost]   예상 비용: ${formatUsd(estimate.usd)}`,
    `[cost]   오늘(${budget.daily.key} KST, ${budget.daily.scope}): ${formatUsd(budget.daily.used)} → ${formatUsd(budget.daily.projected)} / ${formatUsd(budget.daily.limit)} (${formatPercent(budget.daily.projected, budget.daily.limit)})`,
    `[cost]   이번 달(${budget.monthly.key} KST, prod+dev): ${formatUsd(budget.monthly.used)} → ${formatUsd(budget.monthly.projected)} / ${formatUsd(budget.monthly.limit)} (${formatPercent(budget.monthly.projected, budget.monthly.limit)}) · prod ${formatUsd(budget.monthly.prod)} · dev ${formatUsd(budget.monthly.dev)}`,
    `[cost]   판정: ${budget.allowed ? "실행 가능" : budget.message}`,
  ];
  if (budget.devAlert) {
    lines.push(
      `[cost]   경고: 이번 달 dev 사용이 월 예산의 ${(budget.devShare * 100).toFixed(1)}% — 50%를 넘었다. 사용자에게 알릴 것 (CLAUDE.md §6.3)`,
    );
  }
  return lines.join("\n");
}

// ─── 환경변수 ────────────────────────────────────────────────────────────

const USD_PATTERN = /^\d+(?:\.\d+)?$/;

/** "0.10"·"3" 같은 0 이상 10진수만. 빈 값·미지정은 기본값. 부호·지수·통화 기호는 오류. */
export function parseUsdEnv(
  name: string,
  raw: string | undefined,
  fallback: number,
): number {
  const value = raw?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!USD_PATTERN.test(value) || !Number.isFinite(parsed)) {
    throw new CostConfigError(
      `${name}은 0 이상의 10진수 USD여야 한다 (예: 0.10, 받은 값: "${value}")`,
    );
  }
  return parsed;
}

/** DAILY_BUDGET_USD(기본 0.10)·MONTHLY_BUDGET_USD(기본 3) */
export function resolveBudgets(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Budgets {
  return {
    dailyBudgetUsd: parseUsdEnv(
      "DAILY_BUDGET_USD",
      env.DAILY_BUDGET_USD,
      DEFAULT_DAILY_BUDGET_USD,
    ),
    monthlyBudgetUsd: parseUsdEnv(
      "MONTHLY_BUDGET_USD",
      env.MONTHLY_BUDGET_USD,
      DEFAULT_MONTHLY_BUDGET_USD,
    ),
  };
}

// ─── runs 파일 I/O ───────────────────────────────────────────────────────

/** 저장소의 data/ 폴더 */
export const DEFAULT_DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../data",
);

/** env별 파일 — runs.json은 prod만, runs-dev.json은 dev만 (plan.md 부록 A) */
export const RUNS_FILE_NAMES: Readonly<Record<RunEnv, string>> = Object.freeze({
  prod: "runs.json",
  dev: "runs-dev.json",
});

export function runsPathFor(env: RunEnv, dataDir: string = DEFAULT_DATA_DIR) {
  return path.join(dataDir, RUNS_FILE_NAMES[env]);
}

/** 파일 이름으로 그 파일에 들어갈 env를 정한다. 다른 이름은 오류. */
export function envForRunsPath(filePath: string): RunEnv {
  const base = path.basename(filePath);
  if (base === RUNS_FILE_NAMES.prod) return "prod";
  if (base === RUNS_FILE_NAMES.dev) return "dev";
  throw new RunsFileError(
    `runs 파일 이름은 ${RUNS_FILE_NAMES.prod} 또는 ${RUNS_FILE_NAMES.dev}여야 한다 (받은 값: ${base})`,
  );
}

/** 테스트에서 실패를 주입하기 위한 최소 fs 인터페이스 */
export interface RunsFileIo {
  readFile(file: string, encoding: "utf8"): Promise<string>;
  writeFile(file: string, data: string, encoding: "utf8"): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(file: string, options: { force: boolean }): Promise<void>;
  mkdir(dir: string, options: { recursive: true }): Promise<unknown>;
}

const nodeIo: RunsFileIo = {
  readFile: (file, encoding) => fsPromises.readFile(file, encoding),
  writeFile: (file, data, encoding) =>
    fsPromises.writeFile(file, data, encoding),
  rename: (from, to) => fsPromises.rename(from, to),
  rm: (file, options) => fsPromises.rm(file, options),
  mkdir: (dir, options) => fsPromises.mkdir(dir, options),
};

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function zodSummary(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
) {
  return issues
    .slice(0, 3)
    .map(
      (issue) =>
        `${issue.path.map(String).join(".") || "(루트)"}: ${issue.message}`,
    )
    .join(" / ");
}

/** runs 파일을 읽어 zod로 검증한다. 파일이 없으면 [] (첫 기록 전). */
export async function readRuns(
  filePath: string,
  io: RunsFileIo = nodeIo,
): Promise<RunLog[]> {
  const env = envForRunsPath(filePath);
  let text: string;
  try {
    text = await io.readFile(filePath, "utf8");
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new RunsFileError(`${path.basename(filePath)}: JSON 파싱 실패`);
  }
  const schema = env === "prod" ? RunsFileSchema : RunsDevFileSchema;
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new RunsFileError(
      `${path.basename(filePath)}: 스키마 검증 실패 — ${zodSummary(parsed.error.issues)}`,
    );
  }
  return parsed.data;
}

/** 임시 파일에 쓴 뒤 rename — 쓰는 도중 실패해도 원래 파일이 반쯤 쓰인 채로 남지 않는다. */
async function writeJsonAtomic(
  filePath: string,
  data: unknown,
  io: RunsFileIo,
): Promise<void> {
  await io.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await io.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await io.rename(tmp, filePath);
  } catch (error) {
    await io.rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

export interface AppendRunOptions {
  /** 보존 기간 기준 시각(기본 현재) */
  now?: Date;
  retentionDays?: number;
  io?: RunsFileIo;
}

export interface AppendRunResult {
  path: string;
  /** 쓴 뒤의 파일 내용 */
  runs: RunLog[];
  /** 보존 기간이 지나 빠진 실행 수 */
  pruned: number;
}

/**
 * 실행 1건을 runs 파일에 추가한다: 파일 규칙(env) 검증 → 기존 내용 읽기·검증 → 중복 runId 거부 →
 * 180일 prune → startedAt 정렬 → 원자적 쓰기(2칸 들여쓰기 + 끝 개행).
 * 동시에 두 프로세스가 같은 파일에 쓰는 경우는 다루지 않는다(prod는 concurrency: collect, dev는 1인).
 */
export async function appendRun(
  filePath: string,
  run: RunLog,
  options: AppendRunOptions = {},
): Promise<AppendRunResult> {
  const io = options.io ?? nodeIo;
  const now = options.now ?? new Date();
  const fileEnv = envForRunsPath(filePath);
  const parsed = RunLogSchema.safeParse(run);
  if (!parsed.success) {
    throw new RunsFileError(
      `실행 기록 스키마 검증 실패 — ${zodSummary(parsed.error.issues)}`,
    );
  }
  const entry = parsed.data;
  if (entry.env !== fileEnv) {
    throw new RunsFileError(
      `env "${entry.env}" 실행을 ${path.basename(filePath)}에 쓸 수 없다 — ${RUNS_FILE_NAMES[entry.env]}에 기록할 것`,
    );
  }
  const existing = await readRuns(filePath, io);
  if (existing.some((r) => r.runId === entry.runId)) {
    throw new RunsFileError(`이미 기록된 runId: ${entry.runId}`);
  }
  const kept = pruneRuns([...existing, entry], now, options.retentionDays);
  if (!kept.some((r) => r.runId === entry.runId)) {
    throw new RunsFileError(
      `보존 기간 밖의 실행은 기록하지 않는다 (runId ${entry.runId}, startedAt ${entry.startedAt})`,
    );
  }
  const next = sortRuns(kept);
  const schema = fileEnv === "prod" ? RunsFileSchema : RunsDevFileSchema;
  schema.parse(next);
  await writeJsonAtomic(filePath, next, io);
  return {
    path: filePath,
    runs: next,
    pruned: existing.length + 1 - kept.length,
  };
}

/** prod·dev 실행 로그를 함께 읽는다(가드는 두 파일 합산). */
export async function loadRuns(
  dataDir: string = DEFAULT_DATA_DIR,
  io: RunsFileIo = nodeIo,
): Promise<{ prodRuns: RunLog[]; devRuns: RunLog[] }> {
  const [prodRuns, devRuns] = await Promise.all([
    readRuns(runsPathFor("prod", dataDir), io),
    readRuns(runsPathFor("dev", dataDir), io),
  ]);
  return { prodRuns, devRuns };
}

export interface CheckBudgetFromFilesInput {
  env: RunEnv;
  estimatedUsd: number;
  now?: Date;
  dataDir?: string;
  /** 생략하면 resolveBudgets(process.env) */
  budgets?: Budgets;
  io?: RunsFileIo;
}

/** runs.json + runs-dev.json을 읽어 checkBudget — 호출부(collect·weekly·eval-prompt)용 */
export async function checkBudgetFromFiles(
  input: CheckBudgetFromFilesInput,
): Promise<BudgetCheck> {
  const budgets = input.budgets ?? resolveBudgets();
  const { prodRuns, devRuns } = await loadRuns(input.dataDir, input.io);
  return checkBudget({
    env: input.env,
    estimatedUsd: input.estimatedUsd,
    prodRuns,
    devRuns,
    now: input.now ?? new Date(),
    dailyBudget: budgets.dailyBudgetUsd,
    monthlyBudget: budgets.monthlyBudgetUsd,
  });
}

// ─── 고수준 기록 ─────────────────────────────────────────────────────────

/** UTC ISO → "20261010T213000Z" */
function compactUtc(iso: string): string {
  return parseUtcIso(iso)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");
}

/**
 * 실행 ID — `<job>-<env>-<시작 UTC>-<4자리 16진수>`. 예) collect-prod-20261010T213000Z-3fa2
 * 실행 시작 때 만들어 NewsFile.runId와 RunLog.runId에 같이 쓴다.
 */
export function makeRunId(input: {
  env: RunEnv;
  job: RunLog["job"];
  startedAt: string;
  suffix?: string;
}): string {
  const suffix = input.suffix ?? randomBytes(2).toString("hex");
  return `${input.job}-${input.env}-${compactUtc(input.startedAt)}-${suffix}`;
}

type BillableResult = Pick<LlmResult, "usage" | "batch">;

/** RunLog 중 recordRun이 채우지 않는(호출부가 아는) 필드 */
export interface RunFields {
  status: RunLog["status"];
  collected?: number;
  clusters?: number;
  summarized?: number;
  downgraded?: number;
  apiCalls?: RunLog["apiCalls"];
  sources?: RunLog["sources"];
}

export interface RecordRunInput extends RunFields {
  env: RunEnv;
  job: RunLog["job"];
  model: string;
  startedAt: string;
  /** 생략하면 now */
  finishedAt?: string;
  /** 생략하면 makeRunId */
  runId?: string;
  /** 요청별 결과(권장 — 장문 단가를 요청마다 판정). usage와 함께 줄 수 없다 */
  results?: Iterable<BillableResult>;
  /** usage 합계(llm.ts summarizeUsage / runBatch outcome.usage) */
  usage?: Pick<UsageSummary, "batch" | "single">;
  cacheWriteTtl?: CacheWriteTtl;
  dataDir?: string;
  now?: Date;
  retentionDays?: number;
  io?: RunsFileIo;
}

export interface RecordRunResult {
  run: RunLog;
  path: string;
  pruned: number;
}

function sumTokens(usages: Iterable<TokenUsage>): TokenUsage {
  const total = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };
  for (const u of usages) {
    total.in += u.in;
    total.out += u.out;
    total.cacheRead += u.cacheRead;
    total.cacheWrite += u.cacheWrite;
  }
  return total;
}

/** usage → RunLog 한 건(쓰지 않음). 비용은 cost.ts가 계산한다 — 사람이 적지 않는다. */
export function buildRunLog(input: RecordRunInput): RunLog {
  if (input.results !== undefined && input.usage !== undefined) {
    throw new CostError("results와 usage는 하나만 준다 (이중 집계 방지)");
  }
  const now = input.now ?? new Date();
  let tokens: TokenUsage;
  let costUsd: number;
  if (input.results !== undefined) {
    const results = [...input.results];
    costUsd = costFromResults(input.model, results, input);
    tokens = sumTokens(results.map((r) => r.usage));
  } else if (input.usage !== undefined) {
    costUsd = costFromUsage(input.model, input.usage, input);
    tokens = sumTokens([input.usage.batch, input.usage.single]);
  } else {
    // LLM을 부르지 않은 실행(예: 예산 초과로 브리핑을 템플릿으로 강등). 모델이 단가 표에 있는지는 확인한다.
    getModelPricing(input.model);
    costUsd = 0;
    tokens = sumTokens([]);
  }
  const run: RunLog = {
    runId:
      input.runId ??
      makeRunId({ env: input.env, job: input.job, startedAt: input.startedAt }),
    env: input.env,
    job: input.job,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt ?? nowUtcIso(now),
    collected: input.collected ?? 0,
    clusters: input.clusters ?? 0,
    summarized: input.summarized ?? 0,
    downgraded: input.downgraded ?? 0,
    tokens,
    costUsd,
    apiCalls: input.apiCalls ?? { footballData: 0, apiFootball: 0 },
    sources: input.sources ?? [],
    status: input.status,
  };
  return RunLogSchema.parse(run);
}

/**
 * 실행 1회를 기록한다: 비용 계산 → RunLog → env에 맞는 파일(prod → runs.json, dev → runs-dev.json)에 추가.
 * live 실행에서 LLM을 불렀다면 dry여도 반드시 부른다(CLAUDE.md §1-4). mock 실행에는 쓰지 않는다
 * (createRunRecorder가 mock이면 건너뛴다).
 */
export async function recordRun(
  input: RecordRunInput,
): Promise<RecordRunResult> {
  const run = buildRunLog(input);
  const result = await appendRun(runsPathFor(run.env, input.dataDir), run, {
    now: input.now,
    retentionDays: input.retentionDays,
    io: input.io,
  });
  return { run, path: result.path, pruned: result.pruned };
}

export interface RunRecorderOptions {
  env: RunEnv;
  job: RunLog["job"];
  model: string;
  /** mock이면 기록하지 않는다(비용 0, 테스트가 data/를 건드리지 않게) */
  mode: LlmMode;
  runId?: string;
  /** 생략하면 생성 시각 */
  startedAt?: string;
  cacheWriteTtl?: CacheWriteTtl;
  dataDir?: string;
  /** 현재 시각 — 테스트 주입용 */
  clock?: () => Date;
  retentionDays?: number;
  io?: RunsFileIo;
}

export interface RunRecorderFinish {
  run: RunLog;
  /** 기록한 파일. mock이면 null */
  path: string | null;
  persisted: boolean;
}

export interface RunRecorder {
  readonly runId: string;
  readonly startedAt: string;
  /** LLM 결과(성공·실패 모두 — 실패는 usage 0)를 더한다. 배치·단건·재시도 결과를 모두 넣는다 */
  addResults(results: Iterable<BillableResult>): void;
  /** 지금까지 쌓인 비용(USD) */
  costSoFar(): number;
  /** 한 번만 부를 수 있다 */
  finish(fields: RunFields): Promise<RunRecorderFinish>;
}

/**
 * 실행 기록기 — 시작할 때 만들고, LLM 결과가 나올 때마다 addResults, 끝에 finish.
 * 실행이 중간에 예외로 끝나도 기록되게 하려면 withRecordedRun을 쓴다.
 */
export function createRunRecorder(options: RunRecorderOptions): RunRecorder {
  const clock = options.clock ?? (() => new Date());
  const startedAt = options.startedAt ?? nowUtcIso(clock());
  const runId =
    options.runId ??
    makeRunId({ env: options.env, job: options.job, startedAt });
  getModelPricing(options.model); // 표에 없는 모델이면 LLM을 부르기 전에 실패
  const results: BillableResult[] = [];
  let finished = false;

  return {
    runId,
    startedAt,
    addResults(batch) {
      if (finished) throw new CostError("finish 뒤에는 결과를 더할 수 없다");
      for (const result of batch) {
        assertTokenUsage(result.usage, "result.usage");
        results.push({ usage: { ...result.usage }, batch: result.batch });
      }
    },
    costSoFar() {
      return costFromResults(options.model, results, options);
    },
    async finish(fields) {
      if (finished) throw new CostError("finish는 한 번만 부른다");
      finished = true;
      const now = clock();
      const input: RecordRunInput = {
        ...fields,
        env: options.env,
        job: options.job,
        model: options.model,
        startedAt,
        finishedAt: nowUtcIso(now),
        runId,
        results,
        cacheWriteTtl: options.cacheWriteTtl,
        dataDir: options.dataDir,
        now,
        retentionDays: options.retentionDays,
        io: options.io,
      };
      if (options.mode === "mock") {
        return { run: buildRunLog(input), path: null, persisted: false };
      }
      const recorded = await recordRun(input);
      return { run: recorded.run, path: recorded.path, persisted: true };
    },
  };
}

/**
 * body를 실행하고 결과와 관계없이 기록한다. body가 던지면 status "failed"로 기록한 뒤 원래 오류를 다시 던진다
 * (기록도 실패하면 둘을 AggregateError로 묶는다). LLM을 부르는 모든 실행의 기본 진입점.
 */
export async function withRecordedRun<T>(
  options: RunRecorderOptions,
  body: (recorder: RunRecorder) => Promise<{ value: T; fields: RunFields }>,
): Promise<{ value: T; record: RunRecorderFinish }> {
  const recorder = createRunRecorder(options);
  let outcome: { value: T; fields: RunFields };
  try {
    outcome = await body(recorder);
  } catch (error) {
    try {
      await recorder.finish({ status: "failed" });
    } catch (recordError) {
      throw new AggregateError(
        [error, recordError],
        "실행 실패 + 비용 기록 실패 — runs 파일을 확인할 것",
      );
    }
    throw error;
  }
  const record = await recorder.finish(outcome.fields);
  return { value: outcome.value, record };
}
