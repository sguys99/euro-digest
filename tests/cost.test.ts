import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import * as fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { RunsDevFileSchema, RunsFileSchema, type RunLog } from "@/lib/schema";

import {
  appendRun,
  buildRunLog,
  checkBudget,
  checkBudgetFromFiles,
  costFromResults,
  costFromUsage,
  CostConfigError,
  CostError,
  createRunRecorder,
  DEFAULT_DAILY_BUDGET_USD,
  DEFAULT_MONTHLY_BUDGET_USD,
  envForRunsPath,
  estimateCost,
  formatEstimate,
  formatUsd,
  getModelPricing,
  makeRunId,
  MODEL_PRICING,
  monthToDate,
  parseUsdEnv,
  PRICING_VERIFIED,
  promptTokens,
  pruneRuns,
  readRuns,
  recordRun,
  resolveBudgets,
  roundUsd,
  RUNS_FILE_NAMES,
  RunsFileError,
  runsPathFor,
  sortRuns,
  sumUsd,
  todayTotal,
  UnknownModelPricingError,
  withRecordedRun,
  type RunsFileIo,
} from "../scripts/lib/cost";
import type { LlmResult, TokenUsage } from "../scripts/lib/llm";

const MODEL = "claude-haiku-5-5";
const ZERO: TokenUsage = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };

function usage(partial: Partial<TokenUsage>): TokenUsage {
  return { ...ZERO, ...partial };
}

function result(
  partial: Partial<TokenUsage>,
  batch: boolean,
): Pick<LlmResult, "usage" | "batch"> {
  return { usage: usage(partial), batch };
}

function makeRun(
  over: Partial<RunLog> &
    Pick<RunLog, "runId" | "env" | "startedAt" | "costUsd">,
): RunLog {
  return {
    job: "collect",
    finishedAt: over.startedAt,
    collected: 0,
    clusters: 0,
    summarized: 0,
    downgraded: 0,
    tokens: { ...ZERO },
    apiCalls: { footballData: 0, apiFootball: 0 },
    sources: [],
    status: "success",
    ...over,
  };
}

const tmpDirs: string[] = [];
function tmpDataDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-cost-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length > 0) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

const realIo: RunsFileIo = {
  readFile: (f, e) => fsPromises.readFile(f, e),
  writeFile: (f, d, e) => fsPromises.writeFile(f, d, e),
  rename: (a, b) => fsPromises.rename(a, b),
  rm: (f, o) => fsPromises.rm(f, o),
  mkdir: (d, o) => fsPromises.mkdir(d, o),
};

// ─── 단가 표 ─────────────────────────────────────────────────────────────

describe("단가 표 — claude-haiku-5-5 (2026-10-10 공식 단가)", () => {
  it("기본·장문·배치 단가가 공식 표와 같다", () => {
    const p = getModelPricing(MODEL);
    expect(p.standard).toEqual({
      input: 0.1,
      output: 0.5,
      cacheWrite5m: 0.125,
      cacheWrite1h: 0.2,
      cacheRead: 0.01,
    });
    expect(p.longContext).toEqual({
      thresholdTokens: 100_000,
      tier: {
        input: 0.5,
        output: 2.5,
        cacheWrite5m: 0.625,
        cacheWrite1h: 1,
        cacheRead: 0.05,
      },
    });
    expect(p.batchMultiplier).toBe(0.5);
    expect(PRICING_VERIFIED.date).toBe("2026-10-10");
  });

  it("표에 없는 모델은 오류 — 0원으로 계산하지 않는다", () => {
    expect(() => getModelPricing("claude-sonnet-5-5")).toThrow(
      UnknownModelPricingError,
    );
    expect(() => getModelPricing("toString")).toThrow(UnknownModelPricingError);
    expect(() =>
      costFromUsage("claude-opus-5-5", { batch: ZERO, single: ZERO }),
    ).toThrow(UnknownModelPricingError);
    expect(() =>
      estimateCost({
        model: "gpt-x",
        requests: 1,
        avgInputTokens: 1,
        avgOutputTokens: 1,
        batch: true,
      }),
    ).toThrow(UnknownModelPricingError);
  });

  it("단가 표는 고정(frozen)", () => {
    expect(Object.isFrozen(MODEL_PRICING)).toBe(true);
    expect(Object.isFrozen(MODEL_PRICING[MODEL]?.standard)).toBe(true);
  });
});

// ─── 실측 usage → USD ────────────────────────────────────────────────────

describe("costFromUsage — 배치/단건 · 캐시 읽기/쓰기", () => {
  const one = (u: Partial<TokenUsage>, batch: boolean) =>
    costFromUsage(MODEL, {
      batch: batch ? usage(u) : ZERO,
      single: batch ? ZERO : usage(u),
    });

  it("단건: 입력 $0.10 · 출력 $0.50 · 캐시 읽기 $0.01 · 5분 쓰기 $0.125 (per MTok)", () => {
    expect(one({ in: 100_000 }, false)).toBe(0.01);
    expect(one({ out: 1_000_000 }, false)).toBe(0.5); // 출력은 프롬프트 길이에 들어가지 않는다
    expect(one({ cacheRead: 100_000 }, false)).toBe(0.001);
    expect(one({ cacheWrite: 100_000 }, false)).toBe(0.0125);
  });

  it("배치는 모든 토큰 50% (캐시 읽기·쓰기 포함)", () => {
    expect(one({ in: 100_000 }, true)).toBe(0.005);
    expect(one({ out: 1_000_000 }, true)).toBe(0.25);
    expect(one({ cacheRead: 100_000 }, true)).toBe(0.0005);
    expect(one({ cacheWrite: 100_000 }, true)).toBe(0.00625);
  });

  it("1시간 TTL 캐시 쓰기는 2배 단가(옵션)", () => {
    const u = { batch: ZERO, single: usage({ cacheWrite: 100_000 }) };
    expect(costFromUsage(MODEL, u, { cacheWriteTtl: "1h" })).toBe(0.02);
    const b = { batch: usage({ cacheWrite: 100_000 }), single: ZERO };
    expect(costFromUsage(MODEL, b, { cacheWriteTtl: "1h" })).toBe(0.01);
  });

  it("배치 + 06:50 폴백 단건이 섞인 실행 — 소수 6자리 반올림", () => {
    // 배치: 562.5M + 1687.5M + 10.24M + 64M = 2324.24M pUSD, 단건: 250M + 750M = 1000M pUSD
    // 합 3324.24 µUSD → $0.003324
    const summary = {
      batch: { in: 11_250, out: 6_750, cacheRead: 2_048, cacheWrite: 1_024 },
      single: { in: 2_500, out: 1_500, cacheRead: 0, cacheWrite: 0 },
    };
    expect(costFromUsage(MODEL, summary)).toBe(0.003324);
    // 1시간 TTL이면 배치 캐시 쓰기 +38.4M pUSD → 3362.64 µUSD → $0.003363
    expect(costFromUsage(MODEL, summary, { cacheWriteTtl: "1h" })).toBe(
      0.003363,
    );
  });

  it("반올림은 1 마이크로달러 단위 half up", () => {
    expect(one({ in: 5 }, false)).toBe(0.000001); // 0.5 µUSD → 1
    expect(one({ in: 4 }, false)).toBe(0); // 0.4 µUSD → 0
    expect(one({}, false)).toBe(0);
  });

  it("그룹 프롬프트 합계가 장문 기준(100K)을 넘으면 요청별 계산을 요구한다", () => {
    expect(() => one({ in: 100_001 }, true)).toThrow(CostError);
    expect(() => one({ in: 60_000, cacheRead: 40_001 }, false)).toThrow(
      /costFromResults/,
    );
    expect(one({ in: 100_000 }, false)).toBe(0.01);
  });

  it("음수·소수·NaN 토큰은 오류", () => {
    expect(() => one({ in: -1 }, false)).toThrow(CostError);
    expect(() => one({ out: 1.5 }, true)).toThrow(CostError);
    expect(() => one({ cacheRead: Number.NaN }, true)).toThrow(CostError);
  });
});

describe("costFromResults — 요청별 장문 단가 판정 · thinking", () => {
  it("프롬프트 100,000 이하는 기본, 초과는 장문 단가(입력·출력·캐시 모두)", () => {
    expect(
      costFromResults(MODEL, [result({ in: 100_000, out: 1_000 }, false)]),
    ).toBe(0.0105);
    // 150K × $0.50 + 1K × $2.50 = $0.0775
    expect(
      costFromResults(MODEL, [result({ in: 150_000, out: 1_000 }, false)]),
    ).toBe(0.0775);
    // 배치면 절반
    expect(
      costFromResults(MODEL, [result({ in: 150_000, out: 1_000 }, true)]),
    ).toBe(0.03875);
  });

  it("장문 기준의 프롬프트 길이에는 캐시 읽기·쓰기가 포함된다", () => {
    const u = { in: 60_000, cacheRead: 50_000 };
    expect(promptTokens(usage(u))).toBe(110_000);
    // 장문: 60K × $0.50 + 50K × $0.05 = $0.0325 (기본 단가였다면 $0.0065)
    expect(costFromResults(MODEL, [result(u, false)])).toBe(0.0325);
  });

  it("요청마다 따로 판정한다 — 작은 요청은 기본 단가 유지", () => {
    const results = [
      result({ in: 150_000 }, false), // 장문 $0.075
      result({ in: 10_000 }, false), // 기본 $0.001
    ];
    expect(costFromResults(MODEL, results)).toBe(0.076);
  });

  it("thinking 토큰은 out에 이미 포함 — 출력 단가로 한 번만 과금", () => {
    const withThinking: Pick<LlmResult, "usage" | "batch"> & {
      thinkingTokens: number;
    } = {
      usage: usage({ in: 1_000, out: 800 }),
      batch: true,
      thinkingTokens: 600,
    };
    // 1,000 × $0.05 + 800 × $0.25 (per MTok) = $0.00025
    expect(costFromResults(MODEL, [withThinking])).toBe(0.00025);
  });

  it("thinking으로 출력이 늘면 비용이 출력 단가만큼 는다", () => {
    const base = costFromResults(MODEL, [result({ in: 250, out: 150 }, true)]);
    const doubled = costFromResults(MODEL, [
      result({ in: 250, out: 300 }, true),
    ]);
    expect(base).toBe(0.00005); // 12.5 + 37.5 = 50 pUSD×1e6 → 50 µUSD
    expect(doubled).toBe(0.000088); // 12.5 + 75 = 87.5 → 88 µUSD (half up)
  });

  it("과금되지 않은 실패(usage 0)는 0원", () => {
    expect(costFromResults(MODEL, [result({}, true), result({}, false)])).toBe(
      0,
    );
  });
});

// ─── 실행 전 예상 ────────────────────────────────────────────────────────

describe("estimateCost", () => {
  it("뉴스 45건 × (입력 250 + 출력 150) 배치 → $0.00225, 단건 → $0.0045", () => {
    const batch = estimateCost({
      model: MODEL,
      requests: 45,
      avgInputTokens: 250,
      avgOutputTokens: 150,
      batch: true,
    });
    expect(batch.tokens).toEqual({
      in: 11_250,
      out: 6_750,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(batch.usd).toBe(0.00225);
    expect(
      estimateCost({
        model: MODEL,
        requests: 45,
        avgInputTokens: 250,
        avgOutputTokens: 150,
        batch: false,
      }).usd,
    ).toBe(0.0045);
  });

  it("cacheHitRatio·cacheWriteTokens로 입력을 나눈다", () => {
    const base = {
      model: MODEL,
      requests: 3,
      avgInputTokens: 3_750,
      avgOutputTokens: 2_250,
      batch: true,
    };
    const hit = estimateCost({ ...base, cacheHitRatio: 0.5 });
    expect(hit.tokens).toEqual({
      in: 5_625,
      out: 6_750,
      cacheRead: 5_625,
      cacheWrite: 0,
    });
    expect(hit.usd).toBe(0.001997); // 1996.875 µUSD → half up
    const withWrite = estimateCost({
      ...base,
      cacheHitRatio: 0.5,
      cacheWriteTokens: 1_000,
    });
    expect(withWrite.tokens).toEqual({
      in: 4_625,
      out: 6_750,
      cacheRead: 5_625,
      cacheWrite: 1_000,
    });
    expect(withWrite.usd).toBe(0.002009);
  });

  it("평균 입력이 100K를 넘으면 장문 단가", () => {
    expect(
      estimateCost({
        model: MODEL,
        requests: 1,
        avgInputTokens: 120_000,
        avgOutputTokens: 0,
        batch: false,
      }).usd,
    ).toBe(0.06);
  });

  it("잘못된 입력은 오류", () => {
    const base = {
      model: MODEL,
      requests: 1,
      avgInputTokens: 1,
      avgOutputTokens: 1,
      batch: true,
    };
    expect(() => estimateCost({ ...base, requests: -1 })).toThrow(CostError);
    expect(() => estimateCost({ ...base, requests: 1.5 })).toThrow(CostError);
    expect(() => estimateCost({ ...base, avgInputTokens: -1 })).toThrow(
      CostError,
    );
    expect(() => estimateCost({ ...base, cacheHitRatio: 1.1 })).toThrow(
      CostError,
    );
    expect(() => estimateCost({ ...base, cacheWriteTokens: -5 })).toThrow(
      CostError,
    );
  });
});

// ─── 집계: KST 하루·KST 달 ────────────────────────────────────────────────

describe("monthToDate / todayTotal — KST 기준 (월 경계 10/31 15:00Z = 11/01 00:00 KST)", () => {
  const runs = [
    makeRun({
      runId: "a",
      env: "prod",
      startedAt: "2026-10-31T14:59:59.000Z",
      costUsd: 0.01,
    }), // 10/31 23:59:59 KST
    makeRun({
      runId: "b",
      env: "dev",
      startedAt: "2026-10-31T15:00:00.000Z",
      costUsd: 0.02,
    }), // 11/01 00:00 KST
    makeRun({
      runId: "c",
      env: "dev",
      startedAt: "2026-10-31T23:30:00.000Z",
      costUsd: 0.03,
    }), // 11/01 08:30 KST
    makeRun({
      runId: "d",
      env: "prod",
      startedAt: "2026-10-31T21:30:00.000Z",
      costUsd: 0.004,
    }), // 11/01 06:30 KST 발행
  ];

  it("10/31 23:30 UTC는 KST 11월로 집계된다 (UTC 기준이었다면 10월)", () => {
    const now = new Date("2026-11-01T00:30:00Z"); // 11/01 09:30 KST
    expect(monthToDate(runs, now)).toEqual({
      key: "2026-11",
      total: 0.054,
      prod: 0.004,
      dev: 0.05,
    });
    expect(todayTotal(runs, now)).toEqual({
      key: "2026-11-01",
      total: 0.054,
      prod: 0.004,
      dev: 0.05,
    });
  });

  it("10/31 23:00 KST에는 10월·10/31만 보인다", () => {
    const now = new Date("2026-10-31T14:00:00Z");
    expect(monthToDate(runs, now)).toEqual({
      key: "2026-10",
      total: 0.01,
      prod: 0.01,
      dev: 0,
    });
    expect(todayTotal(runs, now).key).toBe("2026-10-31");
  });

  it("06:30 KST 발행 실행(UTC 전날 21:30)은 KST 발행일·발행 달에 잡힌다", () => {
    const now = new Date("2026-10-31T22:00:00Z"); // 11/01 07:00 KST
    const t = todayTotal(runs, now);
    expect(t.key).toBe("2026-11-01");
    expect(t.prod).toBe(0.004);
  });

  it("합계는 마이크로달러 정수로 더한다 (0.1 + 0.2 = 0.3)", () => {
    const r = [
      makeRun({
        runId: "x",
        env: "dev",
        startedAt: "2026-10-10T00:00:00.000Z",
        costUsd: 0.1,
      }),
      makeRun({
        runId: "y",
        env: "dev",
        startedAt: "2026-10-10T01:00:00.000Z",
        costUsd: 0.2,
      }),
    ];
    expect(monthToDate(r, new Date("2026-10-10T02:00:00Z")).total).toBe(0.3);
    expect(sumUsd([0.1, 0.2])).toBe(0.3);
    expect(roundUsd(0.0000015)).toBe(0.000002);
  });
});

// ─── 예산 가드 ───────────────────────────────────────────────────────────

describe("checkBudget — 월은 prod+dev 합산, 일은 prod 실행=prod만 · dev 실행=합산", () => {
  const now = new Date("2026-10-20T03:00:00Z"); // 10/20 12:00 KST
  const base = {
    now,
    dailyBudget: DEFAULT_DAILY_BUDGET_USD,
    monthlyBudget: DEFAULT_MONTHLY_BUDGET_USD,
  };
  const prodToday = (cost: number) =>
    makeRun({
      runId: `p-${cost}`,
      env: "prod",
      startedAt: "2026-10-19T21:30:00.000Z",
      costUsd: cost,
    }); // 10/20 06:30 KST
  const devToday = (cost: number) =>
    makeRun({
      runId: `d-${cost}`,
      env: "dev",
      startedAt: "2026-10-20T01:00:00.000Z",
      costUsd: cost,
    });
  const devEarlier = (id: string, cost: number) =>
    makeRun({
      runId: id,
      env: "dev",
      startedAt: "2026-10-05T05:00:00.000Z",
      costUsd: cost,
    });

  it("예산 안이면 허용", () => {
    const b = checkBudget({
      ...base,
      env: "prod",
      estimatedUsd: 0.005,
      prodRuns: [prodToday(0.003)],
      devRuns: [],
    });
    expect(b.allowed).toBe(true);
    expect(b.reason).toBe("ok");
    expect(b.daily).toMatchObject({
      key: "2026-10-20",
      scope: "prod",
      used: 0.003,
      projected: 0.008,
      limit: 0.1,
    });
    expect(b.monthly).toMatchObject({
      key: "2026-10",
      scope: "prod+dev",
      used: 0.003,
      limit: 3,
    });
  });

  it("dev가 월 예산을 잠식하면 prod 실행도 막힌다 (합산)", () => {
    const b = checkBudget({
      ...base,
      env: "prod",
      estimatedUsd: 0.02,
      prodRuns: [],
      devRuns: [devEarlier("d1", 1.5), devEarlier("d2", 1.49)],
    });
    expect(b.allowed).toBe(false);
    expect(b.reason).toBe("monthly_exceeded");
    expect(b.monthly.used).toBe(2.99);
    expect(b.monthly.projected).toBe(3.01);
    expect(b.monthly.dev).toBe(2.99);
    expect(b.message).toContain("LLM 없이 진행");
    expect(b.devAlert).toBe(true);
  });

  it("지난달 사용분은 이번 달에 들어가지 않는다 (9/30 23:59 KST)", () => {
    const b = checkBudget({
      ...base,
      env: "dev",
      estimatedUsd: 0.01,
      prodRuns: [],
      devRuns: [
        makeRun({
          runId: "sep",
          env: "dev",
          startedAt: "2026-09-30T14:59:59.000Z",
          costUsd: 2.99,
        }),
      ],
    });
    expect(b.allowed).toBe(true);
    expect(b.monthly.used).toBe(0);
  });

  it("일일 예산: prod 실행은 그날 prod 사용분만 본다 — dev 실험이 발행을 막지 않는다", () => {
    const args = {
      ...base,
      estimatedUsd: 0.01,
      prodRuns: [prodToday(0.003)],
      devRuns: [devToday(0.09)],
    };
    const prod = checkBudget({ ...args, env: "prod" });
    expect(prod.allowed).toBe(true);
    expect(prod.daily.used).toBe(0.003);
    expect(prod.daily.dev).toBe(0.09);

    const dev = checkBudget({ ...args, env: "dev" });
    expect(dev.allowed).toBe(false);
    expect(dev.reason).toBe("daily_exceeded");
    expect(dev.daily.scope).toBe("prod+dev");
    expect(dev.daily.used).toBe(0.093);
  });

  it("일일 예산: prod 사용분만으로 넘으면 prod도 막힌다", () => {
    const b = checkBudget({
      ...base,
      env: "prod",
      estimatedUsd: 0.01,
      prodRuns: [prodToday(0.095)],
      devRuns: [],
    });
    expect(b.allowed).toBe(false);
    expect(b.reason).toBe("daily_exceeded");
  });

  it("경계 포함: 사용 + 예상 == 예산이면 허용 (부동소수 오차 없이)", () => {
    const b = checkBudget({
      ...base,
      env: "prod",
      estimatedUsd: 0.01,
      prodRuns: [prodToday(0.09)],
      devRuns: [],
    });
    expect(b.allowed).toBe(true);
    expect(b.daily.projected).toBe(0.1);
  });

  it("월·일 모두 넘으면 월 초과를 먼저 알린다", () => {
    const b = checkBudget({
      ...base,
      env: "dev",
      estimatedUsd: 0.2,
      prodRuns: [],
      devRuns: [devEarlier("d1", 2.9)],
    });
    expect(b.reason).toBe("monthly_exceeded");
  });

  it("dev 50% 알림: 정확히 50%는 알리지 않고, 넘으면 알린다", () => {
    const at50 = checkBudget({
      ...base,
      env: "dev",
      estimatedUsd: 0,
      prodRuns: [],
      devRuns: [devEarlier("d1", 1.5)],
    });
    expect(at50.devShare).toBe(0.5);
    expect(at50.devAlert).toBe(false);
    const over = checkBudget({
      ...base,
      env: "dev",
      estimatedUsd: 0,
      prodRuns: [],
      devRuns: [devEarlier("d1", 1.500001)],
    });
    expect(over.devAlert).toBe(true);
  });

  it("예상 0원(LLM 미호출)은 예산을 넘어도 허용", () => {
    const b = checkBudget({
      ...base,
      env: "prod",
      estimatedUsd: 0,
      prodRuns: [],
      devRuns: [devEarlier("d1", 3.5)],
    });
    expect(b.allowed).toBe(true);
    expect(b.monthly.remaining).toBe(-0.5);
  });

  it("파일 규칙 위반(prodRuns에 dev 실행)·잘못된 금액은 오류", () => {
    expect(() =>
      checkBudget({
        ...base,
        env: "prod",
        estimatedUsd: 0.01,
        prodRuns: [devToday(0.01)],
        devRuns: [],
      }),
    ).toThrow(RunsFileError);
    expect(() =>
      checkBudget({
        ...base,
        env: "prod",
        estimatedUsd: -0.01,
        prodRuns: [],
        devRuns: [],
      }),
    ).toThrow(CostError);
  });
});

// ─── 보존 ────────────────────────────────────────────────────────────────

describe("pruneRuns — 최근 180일(KST 날짜, 오늘 포함)", () => {
  const now = new Date("2026-10-10T00:00:00Z"); // 10/10 09:00 KST → 가장 오래 남는 날 04-14 KST

  it("04-14 00:00 KST(04-13 15:00Z) 이후만 남긴다", () => {
    const keep = makeRun({
      runId: "keep",
      env: "dev",
      startedAt: "2026-04-13T15:00:00.000Z",
      costUsd: 0,
    });
    const drop = makeRun({
      runId: "drop",
      env: "dev",
      startedAt: "2026-04-13T14:59:59.000Z",
      costUsd: 0,
    });
    const recent = makeRun({
      runId: "recent",
      env: "dev",
      startedAt: "2026-10-09T00:00:00.000Z",
      costUsd: 0,
    });
    expect(pruneRuns([drop, keep, recent], now).map((r) => r.runId)).toEqual([
      "keep",
      "recent",
    ]);
  });

  it("days를 바꿀 수 있고, 잘못된 값은 오류", () => {
    const today = makeRun({
      runId: "t",
      env: "dev",
      startedAt: "2026-10-09T15:00:00.000Z",
      costUsd: 0,
    });
    const yesterday = makeRun({
      runId: "y",
      env: "dev",
      startedAt: "2026-10-09T14:59:59.000Z",
      costUsd: 0,
    });
    expect(pruneRuns([today, yesterday], now, 1).map((r) => r.runId)).toEqual([
      "t",
    ]);
    expect(() => pruneRuns([], now, 0)).toThrow(CostError);
    expect(() => pruneRuns([], now, 1.5)).toThrow(CostError);
  });

  it("sortRuns: 시각 값 기준(밀리초 표기 섞여도), 같으면 runId 순", () => {
    const a = makeRun({
      runId: "b",
      env: "dev",
      startedAt: "2026-10-10T00:00:00Z",
      costUsd: 0,
    });
    const b = makeRun({
      runId: "a",
      env: "dev",
      startedAt: "2026-10-10T00:00:00.000Z",
      costUsd: 0,
    });
    const c = makeRun({
      runId: "c",
      env: "dev",
      startedAt: "2026-10-09T23:59:59.999Z",
      costUsd: 0,
    });
    expect(sortRuns([a, b, c]).map((r) => r.runId)).toEqual(["c", "a", "b"]);
  });
});

// ─── 파일 I/O ────────────────────────────────────────────────────────────

describe("runs 파일 — 경로·읽기", () => {
  it("env → 파일 이름, 파일 이름 → env", () => {
    expect(RUNS_FILE_NAMES).toEqual({
      prod: "runs.json",
      dev: "runs-dev.json",
    });
    expect(runsPathFor("dev", "/x/data")).toBe(
      path.join("/x/data", "runs-dev.json"),
    );
    expect(envForRunsPath("/a/runs.json")).toBe("prod");
    expect(envForRunsPath("/a/runs-dev.json")).toBe("dev");
    expect(() => envForRunsPath("/a/runs-prod.json")).toThrow(RunsFileError);
  });

  it("파일이 없으면 [], 깨진 JSON·스키마 위반·env 혼입은 오류", async () => {
    const dir = tmpDataDir();
    expect(await readRuns(path.join(dir, "runs-dev.json"))).toEqual([]);

    writeFileSync(path.join(dir, "runs-dev.json"), "{ broken");
    await expect(readRuns(path.join(dir, "runs-dev.json"))).rejects.toThrow(
      /JSON 파싱 실패/,
    );

    writeFileSync(path.join(dir, "runs.json"), JSON.stringify([{ runId: 1 }]));
    await expect(readRuns(path.join(dir, "runs.json"))).rejects.toThrow(
      /스키마 검증 실패/,
    );

    const dev = makeRun({
      runId: "d",
      env: "dev",
      startedAt: "2026-10-10T00:00:00.000Z",
      costUsd: 0,
    });
    writeFileSync(path.join(dir, "runs.json"), JSON.stringify([dev]));
    await expect(readRuns(path.join(dir, "runs.json"))).rejects.toThrow(
      RunsFileError,
    );
  });
});

describe("appendRun — 파일 규칙 · prune · 정렬 · 원자적 쓰기", () => {
  const now = new Date("2026-10-10T03:00:00Z");

  it("없으면 만들고, 2칸 들여쓰기 + 끝 개행, 스키마 통과", async () => {
    const dir = tmpDataDir();
    const file = path.join(dir, "nested", "runs-dev.json");
    const run = makeRun({
      runId: "r1",
      env: "dev",
      startedAt: "2026-10-10T01:00:00.000Z",
      costUsd: 0.000123,
    });
    const res = await appendRun(file, run, { now });
    const text = readFileSync(file, "utf8");
    // 키 순서는 스키마(부록 A) 순서로 고정된다 — 파일 diff가 결정적
    expect(text).toBe(
      `${JSON.stringify(RunsDevFileSchema.parse([run]), null, 2)}\n`,
    );
    expect(
      text.startsWith('[\n  {\n    "runId": "r1",\n    "env": "dev",'),
    ).toBe(true);
    expect(RunsDevFileSchema.parse(JSON.parse(text))).toEqual([run]);
    expect(res).toMatchObject({ path: file, pruned: 0 });
  });

  it("startedAt 순으로 정렬하고 180일 지난 실행을 뺀다", async () => {
    const dir = tmpDataDir();
    const file = path.join(dir, "runs.json");
    const old = makeRun({
      runId: "old",
      env: "prod",
      startedAt: "2026-03-01T00:00:00.000Z",
      costUsd: 0.001,
    });
    const newer = makeRun({
      runId: "newer",
      env: "prod",
      startedAt: "2026-10-09T21:30:00.000Z",
      costUsd: 0.002,
    });
    writeFileSync(file, `${JSON.stringify([old, newer], null, 2)}\n`);
    const earlier = makeRun({
      runId: "earlier",
      env: "prod",
      startedAt: "2026-10-08T21:30:00.000Z",
      costUsd: 0.003,
    });
    const res = await appendRun(file, earlier, { now });
    expect(res.pruned).toBe(1);
    const saved = RunsFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    expect(saved.map((r) => r.runId)).toEqual(["earlier", "newer"]);
  });

  it("prod 실행을 runs-dev.json에, dev 실행을 runs.json에 쓰면 오류 — 파일은 그대로", async () => {
    const dir = tmpDataDir();
    const devFile = path.join(dir, "runs-dev.json");
    const prodRun = makeRun({
      runId: "p",
      env: "prod",
      startedAt: "2026-10-10T00:00:00.000Z",
      costUsd: 0,
    });
    await expect(appendRun(devFile, prodRun, { now })).rejects.toThrow(
      /runs\.json에 기록할 것/,
    );
    expect(readdirSync(dir)).toEqual([]);

    const devRun = makeRun({
      runId: "d",
      env: "dev",
      startedAt: "2026-10-10T00:00:00.000Z",
      costUsd: 0,
    });
    await expect(
      appendRun(path.join(dir, "runs.json"), devRun, { now }),
    ).rejects.toThrow(RunsFileError);
    await expect(
      appendRun(path.join(dir, "other.json"), devRun, { now }),
    ).rejects.toThrow(RunsFileError);
  });

  it("중복 runId·스키마 위반·보존 기간 밖 실행은 거부", async () => {
    const dir = tmpDataDir();
    const file = path.join(dir, "runs-dev.json");
    const run = makeRun({
      runId: "dup",
      env: "dev",
      startedAt: "2026-10-10T00:00:00.000Z",
      costUsd: 0,
    });
    await appendRun(file, run, { now });
    await expect(appendRun(file, run, { now })).rejects.toThrow(
      /이미 기록된 runId/,
    );
    await expect(
      appendRun(
        file,
        { ...run, runId: "bad", startedAt: "2026-10-10" },
        { now },
      ),
    ).rejects.toThrow(/스키마 검증 실패/);
    await expect(
      appendRun(
        file,
        makeRun({
          runId: "ancient",
          env: "dev",
          startedAt: "2025-01-01T00:00:00.000Z",
          costUsd: 0,
        }),
        { now },
      ),
    ).rejects.toThrow(/보존 기간 밖/);
  });

  it("rename이 실패하면 원래 파일이 그대로 남고 임시 파일도 지운다", async () => {
    const dir = tmpDataDir();
    const file = path.join(dir, "runs-dev.json");
    const first = makeRun({
      runId: "first",
      env: "dev",
      startedAt: "2026-10-10T00:00:00.000Z",
      costUsd: 0.001,
    });
    await appendRun(file, first, { now });
    const before = readFileSync(file, "utf8");

    const failingIo: RunsFileIo = {
      ...realIo,
      rename: async () => {
        throw new Error("디스크 오류 흉내");
      },
    };
    const second = makeRun({
      runId: "second",
      env: "dev",
      startedAt: "2026-10-10T01:00:00.000Z",
      costUsd: 0.002,
    });
    await expect(
      appendRun(file, second, { now, io: failingIo }),
    ).rejects.toThrow("디스크 오류 흉내");
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(readdirSync(dir)).toEqual(["runs-dev.json"]);
  });

  it("임시 파일 쓰기 도중 실패해도 원래 파일은 바뀌지 않는다", async () => {
    const dir = tmpDataDir();
    const file = path.join(dir, "runs-dev.json");
    const first = makeRun({
      runId: "first",
      env: "dev",
      startedAt: "2026-10-10T00:00:00.000Z",
      costUsd: 0.001,
    });
    await appendRun(file, first, { now });
    const before = readFileSync(file, "utf8");
    const failingIo: RunsFileIo = {
      ...realIo,
      writeFile: async (f, d, e) => {
        await fsPromises.writeFile(f, d.slice(0, 10), e); // 반쯤 쓰다 실패
        throw new Error("쓰기 중단");
      },
    };
    const second = makeRun({
      runId: "second",
      env: "dev",
      startedAt: "2026-10-10T01:00:00.000Z",
      costUsd: 0.002,
    });
    await expect(
      appendRun(file, second, { now, io: failingIo }),
    ).rejects.toThrow("쓰기 중단");
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(readdirSync(dir)).toEqual(["runs-dev.json"]);
  });
});

// ─── 고수준 기록 ─────────────────────────────────────────────────────────

describe("makeRunId", () => {
  it("<job>-<env>-<시작 UTC>-<suffix>", () => {
    expect(
      makeRunId({
        env: "prod",
        job: "collect",
        startedAt: "2026-10-10T21:30:00.000Z",
        suffix: "3fa2",
      }),
    ).toBe("collect-prod-20261010T213000Z-3fa2");
    expect(
      makeRunId({
        env: "dev",
        job: "weekly",
        startedAt: "2026-10-12T00:00:05Z",
      }),
    ).toMatch(/^weekly-dev-20261012T000005Z-[0-9a-f]{4}$/);
  });
});

describe("recordRun / buildRunLog", () => {
  const now = new Date("2026-10-10T03:00:00Z");

  it("요청별 결과로 비용·토큰을 계산해 env에 맞는 파일에 쓴다", async () => {
    const dataDir = tmpDataDir();
    const results = [
      result({ in: 3_750, out: 2_250, cacheWrite: 600 }, true),
      result({ in: 3_750, out: 2_250, cacheRead: 600 }, true),
      result({ in: 1_250, out: 750 }, false),
    ];
    const res = await recordRun({
      env: "dev",
      job: "collect",
      model: MODEL,
      startedAt: "2026-10-10T02:00:00.000Z",
      runId: "collect-dev-test",
      results,
      collected: 120,
      clusters: 60,
      summarized: 5,
      status: "success",
      dataDir,
      now,
    });
    expect(res.path).toBe(path.join(dataDir, "runs-dev.json"));
    expect(res.run.tokens).toEqual({
      in: 8_750,
      out: 5_250,
      cacheRead: 600,
      cacheWrite: 600,
    });
    expect(res.run.costUsd).toBe(costFromResults(MODEL, results));
    expect(res.run.finishedAt).toBe("2026-10-10T03:00:00.000Z");
    expect(res.run.apiCalls).toEqual({ footballData: 0, apiFootball: 0 });
    const saved = await readRuns(res.path);
    expect(saved).toEqual([res.run]);
  });

  it("usage 합계로도 기록할 수 있고, results와 함께 주면 오류", () => {
    const summary = { batch: usage({ in: 100_000 }), single: ZERO };
    const run = buildRunLog({
      env: "prod",
      job: "weekly",
      model: MODEL,
      startedAt: "2026-10-12T00:00:00.000Z",
      runId: "w",
      usage: summary,
      status: "success",
      now,
    });
    expect(run.costUsd).toBe(0.005);
    expect(run.tokens.in).toBe(100_000);
    expect(() =>
      buildRunLog({
        env: "prod",
        job: "weekly",
        model: MODEL,
        startedAt: "2026-10-12T00:00:00.000Z",
        usage: summary,
        results: [],
        status: "success",
      }),
    ).toThrow(CostError);
  });

  it("LLM을 부르지 않은 실행은 0원, 표에 없는 모델은 오류", () => {
    const run = buildRunLog({
      env: "prod",
      job: "collect",
      model: MODEL,
      startedAt: "2026-10-10T00:00:00.000Z",
      status: "partial",
      downgraded: 45,
      now,
    });
    expect(run.costUsd).toBe(0);
    expect(run.tokens).toEqual(ZERO);
    expect(() =>
      buildRunLog({
        env: "prod",
        job: "collect",
        model: "claude-unknown",
        startedAt: "2026-10-10T00:00:00.000Z",
        status: "success",
      }),
    ).toThrow(UnknownModelPricingError);
  });
});

describe("createRunRecorder / withRecordedRun — LLM을 부른 실행은 빠짐없이 기록", () => {
  const clock = () => new Date("2026-10-10T03:00:00Z");

  it("live dev 실행은 runs-dev.json에, prod는 runs.json에 기록", async () => {
    const dataDir = tmpDataDir();
    const dev = createRunRecorder({
      env: "dev",
      job: "collect",
      model: MODEL,
      mode: "live",
      dataDir,
      clock,
    });
    dev.addResults([result({ in: 1_000, out: 500 }, true)]);
    expect(dev.costSoFar()).toBe(0.000175);
    const devDone = await dev.finish({ status: "success", summarized: 1 });
    expect(devDone.persisted).toBe(true);
    expect(devDone.path).toBe(path.join(dataDir, "runs-dev.json"));
    expect(devDone.run.runId).toBe(dev.runId);

    const prod = createRunRecorder({
      env: "prod",
      job: "collect",
      model: MODEL,
      mode: "live",
      dataDir,
      clock,
    });
    await prod.finish({ status: "skipped" });
    expect((await readRuns(path.join(dataDir, "runs.json"))).length).toBe(1);
    await expect(prod.finish({ status: "success" })).rejects.toThrow(CostError);
    expect(() => prod.addResults([])).toThrow(CostError);
  });

  it("mock 실행은 기록하지 않는다 (data/를 건드리지 않음)", async () => {
    const dataDir = tmpDataDir();
    const rec = createRunRecorder({
      env: "dev",
      job: "collect",
      model: MODEL,
      mode: "mock",
      dataDir,
      clock,
    });
    rec.addResults([result({ in: 100, out: 50 }, true)]);
    const done = await rec.finish({ status: "success" });
    expect(done).toMatchObject({ persisted: false, path: null });
    expect(done.run.tokens).toEqual({
      in: 100,
      out: 50,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(readdirSync(dataDir)).toEqual([]);
  });

  it("표에 없는 모델이면 LLM을 부르기 전에 실패", () => {
    expect(() =>
      createRunRecorder({
        env: "dev",
        job: "collect",
        model: "claude-x",
        mode: "live",
        clock,
      }),
    ).toThrow(UnknownModelPricingError);
  });

  it("body가 던져도 그때까지의 비용을 status failed로 기록하고 오류를 다시 던진다", async () => {
    const dataDir = tmpDataDir();
    await expect(
      withRecordedRun(
        {
          env: "dev",
          job: "collect",
          model: MODEL,
          mode: "live",
          dataDir,
          clock,
          runId: "boom",
        },
        async (rec) => {
          rec.addResults([result({ in: 2_000, out: 1_000 }, true)]);
          throw new Error("요약 단계 실패");
        },
      ),
    ).rejects.toThrow("요약 단계 실패");
    const saved = await readRuns(path.join(dataDir, "runs-dev.json"));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      runId: "boom",
      status: "failed",
      costUsd: 0.00035,
    });
  });

  it("정상 종료면 body가 돌려준 필드로 기록", async () => {
    const dataDir = tmpDataDir();
    const out = await withRecordedRun(
      { env: "dev", job: "weekly", model: MODEL, mode: "live", dataDir, clock },
      async (rec) => {
        rec.addResults([result({ in: 10, out: 10 }, false)]);
        return { value: 42, fields: { status: "success", summarized: 1 } };
      },
    );
    expect(out.value).toBe(42);
    expect(out.record.run).toMatchObject({
      job: "weekly",
      summarized: 1,
      status: "success",
    });
  });
});

// ─── 예산 파일 연동·환경변수·문구 ─────────────────────────────────────────

describe("checkBudgetFromFiles — 두 파일 합산", () => {
  it("runs.json + runs-dev.json을 읽어 판단", async () => {
    const dataDir = tmpDataDir();
    const now = new Date("2026-10-20T03:00:00Z");
    await appendRun(
      runsPathFor("dev", dataDir),
      makeRun({
        runId: "d",
        env: "dev",
        startedAt: "2026-10-02T00:00:00.000Z",
        costUsd: 2.995,
      }),
      { now },
    );
    await appendRun(
      runsPathFor("prod", dataDir),
      makeRun({
        runId: "p",
        env: "prod",
        startedAt: "2026-10-19T21:30:00.000Z",
        costUsd: 0.004,
      }),
      { now },
    );
    const b = await checkBudgetFromFiles({
      env: "prod",
      estimatedUsd: 0.002,
      now,
      dataDir,
      budgets: { dailyBudgetUsd: 0.1, monthlyBudgetUsd: 3 },
    });
    expect(b.monthly.used).toBe(2.999);
    expect(b.allowed).toBe(false);
    expect(b.reason).toBe("monthly_exceeded");
  });
});

describe("resolveBudgets — DAILY_BUDGET_USD·MONTHLY_BUDGET_USD", () => {
  it("기본값 0.10 · 3, 빈 값도 기본값", () => {
    expect(resolveBudgets({})).toEqual({
      dailyBudgetUsd: 0.1,
      monthlyBudgetUsd: 3,
    });
    expect(
      resolveBudgets({ DAILY_BUDGET_USD: " ", MONTHLY_BUDGET_USD: "" }),
    ).toEqual({
      dailyBudgetUsd: 0.1,
      monthlyBudgetUsd: 3,
    });
  });

  it("10진수 값을 읽는다 (0은 LLM 차단용으로 허용)", () => {
    expect(
      resolveBudgets({ DAILY_BUDGET_USD: "0.25", MONTHLY_BUDGET_USD: "5" }),
    ).toEqual({
      dailyBudgetUsd: 0.25,
      monthlyBudgetUsd: 5,
    });
    expect(parseUsdEnv("X", "0", 1)).toBe(0);
  });

  it.each(["abc", "-1", "1e-1", "0x10", "$3", "1,000", "Infinity", ".5"])(
    "잘못된 값 %s 는 오류",
    (raw) => {
      expect(() => resolveBudgets({ DAILY_BUDGET_USD: raw })).toThrow(
        CostConfigError,
      );
    },
  );
});

describe("formatEstimate — 실행 전 출력", () => {
  const now = new Date("2026-10-20T03:00:00Z");
  const estimate = estimateCost({
    model: MODEL,
    requests: 5,
    avgInputTokens: 250,
    avgOutputTokens: 150,
    batch: true,
  });

  it("예상 토큰·비용·사용률을 보여 준다", () => {
    const budget = checkBudget({
      env: "dev",
      estimatedUsd: estimate.usd,
      prodRuns: [],
      devRuns: [],
      now,
      dailyBudget: 0.1,
      monthlyBudget: 3,
    });
    const text = formatEstimate(estimate, budget);
    expect(text).toContain(
      "claude-haiku-5-5 · 배치(50% 할인) · 요청 5건 · env dev",
    );
    expect(text).toContain("입력 1,250");
    expect(text).toContain("출력 750");
    expect(text).toContain("예상 비용: $0.000250");
    expect(text).toContain("오늘(2026-10-20 KST, prod+dev)");
    expect(text).toContain("이번 달(2026-10 KST, prod+dev)");
    expect(text).toContain("판정: 실행 가능");
    expect(text).not.toContain("경고");
  });

  it("예산 초과·dev 50% 경고를 표시한다", () => {
    const budget = checkBudget({
      env: "dev",
      estimatedUsd: 1.6,
      prodRuns: [],
      devRuns: [
        makeRun({
          runId: "d",
          env: "dev",
          startedAt: "2026-10-02T00:00:00.000Z",
          costUsd: 1.6,
        }),
      ],
      now,
      dailyBudget: 0.1,
      monthlyBudget: 3,
    });
    const text = formatEstimate(estimate, budget);
    expect(text).toContain("월 예산 초과 예상");
    expect(text).toContain("경고: 이번 달 dev 사용이 월 예산의 53.3%");
  });

  it("formatUsd: $1 미만 6자리, 이상 2자리", () => {
    expect(formatUsd(0.00225)).toBe("$0.002250");
    expect(formatUsd(3)).toBe("$3.00");
  });
});
