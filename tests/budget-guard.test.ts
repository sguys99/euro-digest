/**
 * M1-22 비용 가드 — scripts/lib/budget-guard.ts + cost.ts(assessDevUsage·formatDevAlert·tryLoadRuns). 네트워크·실호출 없음.
 *
 * 필수 항목: 최악값 예상(첫 호출 + FR-29 재시도 × 출력 상한), 일·월 경계(KST 자정·월말 — 실행 시작 시각 귀속), dev+prod 합산
 * (월 항상 합산·일 prod 실행=prod만), 예산과 정확히 같을 때 허용, dev 50% 경계, runs 파일 없음(사용 0)·손상(판정 불가 → LLM 없이),
 * 실행 시작 알림(dev = 눈에 띄는 출력, prod = Actions 주석, 던지지 않음).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import type { RunEnv, RunLog } from "@/lib/schema";

import {
  BRIEF_MAX_ATTEMPTS,
  BRIEF_MAX_TOKENS,
  buildBriefRequest,
  estimateBriefCost,
  loadBriefPrompt,
} from "../scripts/lib/brief";
import type { BriefInput } from "../scripts/lib/brief-input";
import { BRIEF_DAILY_REQUEST_CAP } from "../scripts/lib/brief-publish";
import {
  announceBriefBudget,
  briefBudgetLogFields,
  briefBudgetSkip,
  decideBriefBudget,
  estimateBriefWorstCase,
  formatBriefBudget,
  guardBriefBudget,
  noticeMonthlyUsage,
  type BriefRequestShape,
  type DecideBriefBudgetInput,
} from "../scripts/lib/budget-guard";
import {
  assessDevUsage,
  CostConfigError,
  CostError,
  DEFAULT_DAILY_BUDGET_USD,
  DEFAULT_MONTHLY_BUDGET_USD,
  formatDevAlert,
  tryLoadRuns,
  type RunsFileIo,
  type RunsLoad,
} from "../scripts/lib/cost";
import { createLogger, type LogRecord } from "../scripts/lib/logger";

const MODEL = "claude-haiku-5-5";
const BUDGETS = {
  dailyBudgetUsd: DEFAULT_DAILY_BUDGET_USD,
  monthlyBudgetUsd: DEFAULT_MONTHLY_BUDGET_USD,
};

/**
 * 입력 어림 = 지시문 2,000(글자당 1) + 사용자 3,000자 ÷ 1.5 = 4,000토큰, 출력 상한 4,096(고정 시험값 — 함수는 요청의 maxTokens를
 * 쓴다. 실제 상한 BRIEF_MAX_TOKENS 16,384(D57)의 최악값은 아래 "D57" 시험)
 */
const REQUEST: BriefRequestShape = {
  system: "가".repeat(2000),
  user: "x".repeat(3000),
  maxTokens: 4_096,
};
/** 1회 = 4,000 × $0.10/M + 4,096 × $0.50/M = $0.002448 → 최악값(2회) $0.004896 */
const ONE_CALL_USD = 0.002448;
const WORST_USD = 0.004896;

function makeRun(
  over: Pick<RunLog, "runId" | "env" | "startedAt" | "costUsd">,
): RunLog {
  return {
    job: "collect",
    finishedAt: over.startedAt,
    collected: 0,
    clusters: 0,
    summarized: 0,
    downgraded: 0,
    tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    apiCalls: { footballData: 0, apiFootball: 0 },
    sources: [],
    status: "success",
    ...over,
  };
}

let seq = 0;
const run = (env: RunEnv, startedAt: string, costUsd: number): RunLog =>
  makeRun({ runId: `${env}-${(seq += 1)}`, env, startedAt, costUsd });

function loaded(runs: RunLog[]): RunsLoad {
  return {
    ok: true,
    prodRuns: runs.filter((r) => r.env === "prod"),
    devRuns: runs.filter((r) => r.env === "dev"),
  };
}

function decide(
  over: Partial<DecideBriefBudgetInput> & Pick<DecideBriefBudgetInput, "at">,
) {
  return decideBriefBudget({
    env: "prod",
    requests: [REQUEST],
    model: MODEL,
    budgets: BUDGETS,
    runs: loaded([]),
    ...over,
  });
}

function captureLogger() {
  const records: LogRecord[] = [];
  return {
    records,
    logger: createLogger({
      scope: "collect",
      format: "json",
      sink: (_line, record) => records.push(record),
    }),
  };
}

const tmpDirs: string[] = [];
function tmpDataDir(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-budget-"));
  tmpDirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), text, "utf8");
  }
  return dir;
}
afterEach(() => {
  while (tmpDirs.length > 0) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});
const json = (runs: RunLog[]) => `${JSON.stringify(runs, null, 2)}\n`;

// 10/20 12:00 KST
const NOON_1020 = new Date("2026-10-20T03:00:00.000Z");
// 10/20 06:30 KST(prod 아침 실행)
const PROD_1020 = "2026-10-19T21:30:00.000Z";
// 10/20 10:00 KST(dev)
const DEV_1020 = "2026-10-20T01:00:00.000Z";
// 10/05(dev, 같은 달 다른 날)
const DEV_1005 = "2026-10-05T05:00:00.000Z";

// ─── 최악값 예상 ─────────────────────────────────────────────────────────

const ROOT = fileURLToPath(new URL("../", import.meta.url));

describe("estimateBriefWorstCase — D57 max_tokens 16,384의 최악값", () => {
  it("같은 요청을 실제 상한(BRIEF_MAX_TOKENS 16,384)으로 보면 1회 $0.008592 · 최악값 $0.017184(일 예산의 17.2% — 8,192(D53)일 때 9.0%)", () => {
    expect(BRIEF_MAX_TOKENS).toBe(16_384);
    const worst = estimateBriefWorstCase(
      [{ ...REQUEST, maxTokens: BRIEF_MAX_TOKENS }],
      MODEL,
    );
    expect(worst.usd).toBeCloseTo(0.017184, 9);
    expect(worst.tokens).toMatchObject({ in: 8_000, out: 32_768 });
    expect(worst.usd / DEFAULT_DAILY_BUDGET_USD).toBeCloseTo(0.17184, 6);
    // 출력 몫만 — 16,384 × $0.50/M = 요청 1회 $0.008192
    expect(
      estimateBriefCost({ ...REQUEST, maxTokens: BRIEF_MAX_TOKENS }, MODEL).usd,
    ).toBeCloseTo(0.000_4 + 0.008_192, 9);
  });

  it("실제 지시문 + 골든셋 가장 큰 입력(10-11, 23경기 → 본문 15경기)도 최악값이 일 예산의 20% 아래 — 하루 상한 3요청(D56)을 모두 상한까지 써도 $0.03 아래", async () => {
    const system = await loadBriefPrompt(ROOT);
    const input = JSON.parse(
      readFileSync(
        path.join(ROOT, "fixtures/llm/golden/inputs/2026-10-11.json"),
        "utf8",
      ),
    ) as BriefInput;
    expect(input.matches).toHaveLength(23);
    const request = buildBriefRequest(input, system);
    expect(request.maxTokens).toBe(16_384);
    const worst = estimateBriefWorstCase([request], MODEL);
    expect(worst.tokens.out).toBe(2 * 16_384);
    expect(worst.usd).toBeLessThan(0.2 * DEFAULT_DAILY_BUDGET_USD);
    const dayCap = estimateBriefWorstCase(
      [request],
      MODEL,
      BRIEF_DAILY_REQUEST_CAP,
    );
    expect(dayCap.usd).toBeLessThan(0.03);
  });

  it("최악값이 커져도 가드가 브리핑을 막지 않는다 — 10-18처럼 prod가 이미 쓴 날(아침 2요청 $0.008195)·같은 날 재실행(앞 실행 2회가 모두 상한까지 쓴 경우)도 허용", () => {
    const today = "2026-10-20T00:00:00.000Z"; // 10/20 09:00 KST
    const at = new Date("2026-10-20T01:00:00.000Z");
    const request = { ...REQUEST, maxTokens: BRIEF_MAX_TOKENS };
    const typical = decide({
      at,
      requests: [request],
      runs: loaded([run("prod", today, 0.008195)]),
    });
    expect(typical).toMatchObject({ allowed: true, verdict: "ok" });
    const oneCallMax = estimateBriefCost(request, MODEL).usd;
    const rerun = decide({
      at,
      requests: [request],
      runs: loaded([run("prod", today, 2 * oneCallMax)]),
    });
    expect(rerun).toMatchObject({ allowed: true, verdict: "ok" });
    // 막히는 지점: 그날 prod 사용 + 최악값($0.017184)이 일 예산을 넘을 때 — 사용 $0.083 이상
    const blocked = decide({
      at,
      requests: [request],
      runs: loaded([run("prod", today, 0.083)]),
    });
    expect(blocked).toMatchObject({
      allowed: false,
      verdict: "daily_exceeded",
    });
  });
});

describe("estimateBriefWorstCase — 첫 호출 + FR-29 재시도 × 출력 상한(max_tokens)", () => {
  it("요청 1건이 최대 2번 과금된다고 본다 — 단건 예상의 정확히 2배", () => {
    expect(BRIEF_MAX_ATTEMPTS).toBe(2);
    const single = estimateBriefCost(REQUEST, MODEL);
    expect(single.usd).toBe(ONE_CALL_USD);
    const worst = estimateBriefWorstCase([REQUEST], MODEL);
    expect(worst).toMatchObject({
      model: MODEL,
      requests: 2,
      batch: false, // D28 — 단건 정가
      tokens: { in: 8000, out: 8192, cacheRead: 0, cacheWrite: 0 },
      usd: WORST_USD,
    });
  });

  it("요청이 여럿이면 요청마다 더한다(하루 1~3요청 — D28)", () => {
    const worst = estimateBriefWorstCase([REQUEST, REQUEST, REQUEST], MODEL);
    expect(worst.requests).toBe(6);
    expect(worst.tokens).toMatchObject({ in: 24000, out: 24576 });
    expect(worst.usd).toBe(0.014688);
  });

  it("지시문 캐싱을 켠 요청은 지시문을 매번 캐시 쓰기(1.25배)로 센다 — 읽기 할인 없이 보수적", () => {
    const worst = estimateBriefWorstCase(
      [{ ...REQUEST, cacheSystem: true }],
      MODEL,
    );
    // 입력 8,000 중 지시문 2,000 × 2회 = 4,000 캐시 쓰기 → 4,000 × 0.10 + 4,000 × 0.125 + 8,192 × 0.50 (per M)
    expect(worst.tokens).toEqual({
      in: 4000,
      out: 8192,
      cacheRead: 0,
      cacheWrite: 4000,
    });
    expect(worst.usd).toBe(0.004996);
    expect(worst.usd).toBeGreaterThan(WORST_USD);
  });

  it("장문 단가(프롬프트 100K 초과)는 요청마다 판정한다 — 작은 요청과 섞여 평균으로 묻히지 않는다", () => {
    const big: BriefRequestShape = { ...REQUEST, system: "가".repeat(120_000) };
    // 122,000토큰 × 2회 × $0.50/M + 4,096 × 2회 × $2.50/M (장문 단가)
    expect(estimateBriefWorstCase([big], MODEL).usd).toBe(0.14248);
    const both = estimateBriefWorstCase([big, REQUEST], MODEL);
    expect(both.usd).toBe(0.147376); // 0.14248 + 0.004896
    expect(both.requests).toBe(4);
    expect(both.tokens).toMatchObject({ in: 252_000, out: 16_384 });
  });

  it("요청이 없으면 0원, 시도 횟수가 1 미만이면 오류, 단가 표에 없는 모델도 오류", () => {
    expect(estimateBriefWorstCase([], MODEL).usd).toBe(0);
    expect(() => estimateBriefWorstCase([REQUEST], MODEL, 0)).toThrow(
      RangeError,
    );
    expect(() => estimateBriefWorstCase([REQUEST], "claude-unknown")).toThrow(
      CostError,
    );
  });
});

// ─── 판정 ────────────────────────────────────────────────────────────────

describe("decideBriefBudget — 일 $0.10 / 월 $3, 최악값으로 판정", () => {
  it("runs 파일 없음(기록 전) = 사용 0 → 허용", () => {
    const d = decide({ at: NOON_1020 });
    expect(d).toMatchObject({
      allowed: true,
      verdict: "ok",
      attempts: 2,
      runsError: null,
    });
    expect(d.check?.daily).toMatchObject({ used: 0, projected: WORST_USD });
    expect(briefBudgetSkip(d)).toBeNull();
  });

  it("예산과 정확히 같으면 허용, 1마이크로달러라도 넘으면 LLM 없이(daily_exceeded)", () => {
    const at = decide({
      at: NOON_1020,
      runs: loaded([run("prod", PROD_1020, 0.095104)]),
    });
    expect(at.allowed).toBe(true);
    expect(at.check?.daily.projected).toBe(0.1);

    const over = decide({
      at: NOON_1020,
      runs: loaded([run("prod", PROD_1020, 0.095105)]),
    });
    expect(over.allowed).toBe(false);
    expect(over.verdict).toBe("daily_exceeded");
    expect(briefBudgetSkip(over)).toEqual({
      verdict: "daily_exceeded",
      estimatedUsd: WORST_USD,
      message: over.message,
    });
    expect(over.message).toContain("LLM 없이 진행");
  });

  it("단건 예상이면 통과했을 사용액도 최악값(재시도 포함)이 넘으면 막는다", () => {
    const runs = loaded([run("prod", PROD_1020, 0.096)]);
    // 0.096 + 0.002448 = 0.098448 ≤ 0.1 이지만 0.096 + 0.004896 = 0.100896 > 0.1
    expect(decide({ at: NOON_1020, runs, attempts: 1 }).allowed).toBe(true);
    expect(decide({ at: NOON_1020, runs }).verdict).toBe("daily_exceeded");
  });

  it("월 예산은 env와 무관하게 prod+dev 합산 — dev가 월 예산을 잠식하면 prod 브리핑도 템플릿", () => {
    const runs = loaded([
      run("dev", DEV_1005, 1.5),
      run("dev", DEV_1005, 1.496),
    ]);
    const prod = decide({ at: NOON_1020, runs });
    expect(prod.verdict).toBe("monthly_exceeded");
    expect(prod.check?.monthly).toMatchObject({
      key: "2026-10",
      scope: "prod+dev",
      used: 2.996,
      projected: 3.000896,
      dev: 2.996,
    });
    expect(prod.check?.devAlert).toBe(true);
  });

  it("일일 예산: prod 실행은 그날 prod만, dev 실행은 그날 prod+dev (M0-21 — dev 실험이 발행 브리핑을 막지 않는다)", () => {
    const runs = loaded([
      run("prod", PROD_1020, 0.05),
      run("dev", DEV_1020, 0.046),
    ]);
    const prod = decide({ at: NOON_1020, runs, env: "prod" });
    expect(prod.allowed).toBe(true);
    expect(prod.check?.daily).toMatchObject({ scope: "prod", used: 0.05 });
    const dev = decide({ at: NOON_1020, runs, env: "dev" });
    expect(dev.verdict).toBe("daily_exceeded");
    expect(dev.check?.daily).toMatchObject({ scope: "prod+dev", used: 0.096 });
  });

  it("KST 자정 경계 — 실행 시작 시각(at)의 KST 날짜로 판정한다(실행 기록 귀속과 같은 칸)", () => {
    const runs = loaded([run("prod", PROD_1020, 0.096)]);
    // 10/20 23:59:59 KST에 시작한 실행 → 10/20 사용분과 비교
    const before = decide({ at: new Date("2026-10-20T14:59:59.000Z"), runs });
    expect(before.check?.daily.key).toBe("2026-10-20");
    expect(before.verdict).toBe("daily_exceeded");
    // 10/21 00:00:00 KST에 시작한 실행 → 새 날
    const after = decide({ at: new Date("2026-10-20T15:00:00.000Z"), runs });
    expect(after.check?.daily.key).toBe("2026-10-21");
    expect(after.allowed).toBe(true);
    expect(after.at).toBe("2026-10-20T15:00:00.000Z");
  });

  it("KST 월말 경계 — 10/31 23:59:59 KST는 10월, 11/01 00:00 KST는 11월", () => {
    const runs = loaded([run("dev", DEV_1005, 2.999)]);
    const oct = decide({ at: new Date("2026-10-31T14:59:59.000Z"), runs });
    expect(oct.check?.monthly.key).toBe("2026-10");
    expect(oct.verdict).toBe("monthly_exceeded");
    const nov = decide({ at: new Date("2026-10-31T15:00:00.000Z"), runs });
    expect(nov.check?.monthly).toMatchObject({ key: "2026-11", used: 0 });
    expect(nov.allowed).toBe(true);
  });

  it("runs 파일을 읽지 못하면 판정 불가 → LLM 없이(fail-closed, runs_unreadable)", () => {
    const d = decide({
      at: NOON_1020,
      runs: {
        ok: false,
        file: "runs-dev.json",
        error: "runs-dev.json: JSON 파싱 실패",
      },
    });
    expect(d).toMatchObject({
      allowed: false,
      verdict: "runs_unreadable",
      check: null,
      runsError: {
        file: "runs-dev.json",
        error: "runs-dev.json: JSON 파싱 실패",
      },
    });
    expect(d.estimate.usd).toBe(WORST_USD);
    expect(d.message).toContain("runs-dev.json: JSON 파싱 실패");
    expect(d.message).toContain("LLM 없이 진행");
    expect(briefBudgetSkip(d)).toMatchObject({ verdict: "runs_unreadable" });
  });

  it("스키마는 통과하지만 금액이 틀린 기록(음수 costUsd)·env 섞임도 판정 불가(runs_unreadable)로 묶는다 — 던지지 않는다", async () => {
    const negative = decide({
      at: NOON_1020,
      runs: loaded([
        run("prod", PROD_1020, 0.001),
        makeRun({
          runId: "neg",
          env: "dev",
          startedAt: DEV_1020,
          costUsd: -0.01,
        }),
      ]),
    });
    expect(negative).toMatchObject({
      allowed: false,
      verdict: "runs_unreadable",
      check: null,
      runsError: {
        file: "runs-dev.json",
        error: expect.stringContaining("neg의 costUsd"),
      },
    });
    const mixed = decide({
      at: NOON_1020,
      runs: {
        ok: true,
        prodRuns: [run("dev", DEV_1020, 0.001)],
        devRuns: [],
      },
    });
    expect(mixed.runsError?.file).toBe("runs.json");
    // 파일에서 읽는 경로도 같다 — 스키마(number)는 음수를 통과시키지만 가드는 판정 불가로 본다
    const fromFile = await guardBriefBudget({
      env: "prod",
      requests: [REQUEST],
      model: MODEL,
      budgets: BUDGETS,
      at: NOON_1020,
      dataDir: tmpDataDir({
        "runs-dev.json": json([
          makeRun({
            runId: "neg",
            env: "dev",
            startedAt: DEV_1020,
            costUsd: -0.01,
          }),
        ]),
      }),
    });
    expect(fromFile.verdict).toBe("runs_unreadable");
    expect(briefBudgetSkip(fromFile)?.message).toContain("LLM 없이 진행");
  });

  it("예산 환경변수 값을 그대로 쓴다 — 일 예산 0이면 막고, 요청이 없으면(0원) 허용", () => {
    const zero = { dailyBudgetUsd: 0, monthlyBudgetUsd: 3 };
    expect(decide({ at: NOON_1020, budgets: zero }).verdict).toBe(
      "daily_exceeded",
    );
    expect(decide({ at: NOON_1020, budgets: zero, requests: [] }).allowed).toBe(
      true,
    );
  });
});

describe("formatBriefBudget · briefBudgetLogFields · announceBriefBudget", () => {
  it("실행 전 출력: 최악값 표시·예상 비용·오늘/이번 달 사용률·판정", () => {
    const text = formatBriefBudget(decide({ at: NOON_1020 }));
    expect(text).toContain("요청 2건(최악값");
    expect(text).toContain("$0.004896");
    expect(text).toContain("오늘(2026-10-20 KST, prod)");
    expect(text).toContain("이번 달(2026-10 KST, prod+dev)");
    expect(text).toContain("판정: 실행 가능");
  });

  it("판정 불가 출력: 예상 비용과 사유", () => {
    const text = formatBriefBudget(
      decide({
        at: NOON_1020,
        runs: {
          ok: false,
          file: "runs.json",
          error: "runs.json: 읽기 실패 (EACCES)",
        },
      }),
    );
    expect(text).toContain("$0.004896");
    expect(text).toContain("판정: 실행 기록을 읽지 못해");
    expect(text).toContain("runs.json: 읽기 실패 (EACCES)");
  });

  it("로그 필드는 금액·토큰·집계 칸만 — 프롬프트 본문 없음", () => {
    const fields = briefBudgetLogFields(
      decide({ at: NOON_1020, runs: loaded([run("prod", PROD_1020, 0.01)]) }),
    );
    expect(fields).toMatchObject({
      verdict: "ok",
      allowed: true,
      requests: 2,
      attempts: 2,
      estimatedUsd: WORST_USD,
      estimatedIn: 8000,
      estimatedOut: 8192,
      day: "2026-10-20",
      dailyUsed: 0.01,
      dailyLimit: 0.1,
      month: "2026-10",
      runsError: null,
    });
    expect(JSON.stringify(fields)).not.toContain("가가가");
  });

  it("허용: 출력 + summarize.brief.budget 로그만", () => {
    const { records, logger } = captureLogger();
    const printed: string[] = [];
    announceBriefBudget(decide({ at: NOON_1020 }), {
      env: "prod",
      logger,
      print: (t) => printed.push(t),
    });
    expect(printed).toHaveLength(1);
    expect(records.map((r) => r.event)).toEqual(["summarize.brief.budget"]);
    // 로거의 비밀값 가림(…Key 이름)에 걸리지 않는 필드 이름인지 — 날짜·달이 그대로 남는다
    expect(records[0]).toMatchObject({ day: "2026-10-20", month: "2026-10" });
  });

  it("prod에서 막으면 skip 경고 로그(reason budget) + Actions 경고 주석, dev는 주석 없음", () => {
    const blocked = decide({
      at: NOON_1020,
      runs: loaded([run("prod", PROD_1020, 0.099)]),
    });
    for (const env of ["prod", "dev"] as const) {
      const { records, logger } = captureLogger();
      const printed: string[] = [];
      announceBriefBudget(
        { ...blocked, env },
        { env, logger, print: (t) => printed.push(t) },
      );
      const skip = records.find((r) => r.event === "summarize.brief.skip");
      expect(skip).toMatchObject({
        level: "warn",
        reason: "budget",
        verdict: "daily_exceeded",
        estimatedUsd: WORST_USD,
      });
      const annotation = printed.find((t) => t.startsWith("::warning"));
      if (env === "prod") {
        expect(annotation).toContain("title=비용 가드");
      } else {
        expect(annotation).toBeUndefined();
      }
    }
  });
});

// ─── runs 파일 읽기(던지지 않음) ─────────────────────────────────────────

describe("tryLoadRuns — 없음은 사용 0, 손상·I/O 오류는 판정 불가", () => {
  it("두 파일이 없으면 빈 기록", async () => {
    expect(await tryLoadRuns(tmpDataDir())).toEqual({
      ok: true,
      prodRuns: [],
      devRuns: [],
    });
  });

  it("두 파일을 env별로 읽는다", async () => {
    const dir = tmpDataDir({
      "runs.json": json([run("prod", PROD_1020, 0.001)]),
      "runs-dev.json": json([run("dev", DEV_1020, 0.002)]),
    });
    const result = await tryLoadRuns(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prodRuns.map((r) => r.costUsd)).toEqual([0.001]);
    expect(result.devRuns.map((r) => r.costUsd)).toEqual([0.002]);
  });

  it("깨진 JSON·스키마 위반(env 섞임)은 그 파일 이름과 함께 ok:false", async () => {
    const broken = await tryLoadRuns(
      tmpDataDir({ "runs-dev.json": "{ not json" }),
    );
    expect(broken).toEqual({
      ok: false,
      file: "runs-dev.json",
      error: "runs-dev.json: JSON 파싱 실패",
    });
    const mixed = await tryLoadRuns(
      tmpDataDir({ "runs.json": json([run("dev", DEV_1020, 0.001)]) }),
    );
    expect(mixed).toMatchObject({ ok: false, file: "runs.json" });
    if (!mixed.ok) expect(mixed.error).toContain("스키마 검증 실패");
  });

  it("I/O 오류(권한 등)는 전체 경로 없이 오류 코드만", async () => {
    const io: RunsFileIo = {
      readFile: async (file) => {
        if (path.basename(file) === "runs.json") {
          throw Object.assign(
            new Error(`EACCES: permission denied, open '${file}'`),
            { code: "EACCES" },
          );
        }
        return fsPromises.readFile(file, "utf8");
      },
      writeFile: async () => undefined,
      rename: async () => undefined,
      rm: async () => undefined,
      mkdir: async () => undefined,
    };
    const dir = tmpDataDir();
    const result = await tryLoadRuns(dir, io);
    expect(result).toEqual({
      ok: false,
      file: "runs.json",
      error: "runs.json: 읽기 실패 (EACCES)",
    });
    if (!result.ok) expect(result.error).not.toContain(dir);
  });

  it("guardBriefBudget — 파일에서 읽어 판정, 깨진 파일이면 runs_unreadable(던지지 않음)", async () => {
    const ok = await guardBriefBudget({
      env: "dev",
      requests: [REQUEST],
      model: MODEL,
      budgets: BUDGETS,
      at: NOON_1020,
      dataDir: tmpDataDir({
        "runs.json": json([run("prod", PROD_1020, 0.05)]),
        "runs-dev.json": json([run("dev", DEV_1020, 0.046)]),
      }),
    });
    expect(ok.verdict).toBe("daily_exceeded"); // dev 실행 = 그날 prod+dev 0.096 + 최악값
    const broken = await guardBriefBudget({
      env: "prod",
      requests: [REQUEST],
      model: MODEL,
      budgets: BUDGETS,
      at: NOON_1020,
      dataDir: tmpDataDir({ "runs.json": "[" }),
    });
    expect(broken).toMatchObject({
      allowed: false,
      verdict: "runs_unreadable",
    });
  });
});

// ─── dev 50% 알림 ────────────────────────────────────────────────────────

describe("assessDevUsage · formatDevAlert — dev 사용이 월 예산 50%를 넘으면 알림", () => {
  it("정확히 50%는 알리지 않고, 1마이크로달러라도 넘으면 알린다", () => {
    const at50 = assessDevUsage([run("dev", DEV_1005, 1.5)], NOON_1020, 3);
    expect(at50).toMatchObject({
      key: "2026-10",
      dev: 1.5,
      share: 0.5,
      alert: false,
    });
    const over = assessDevUsage([run("dev", DEV_1005, 1.500001)], NOON_1020, 3);
    expect(over.alert).toBe(true);
  });

  it("prod 사용은 비율에 넣지 않는다(참고로만) · 지난달 dev는 이번 달에 들어가지 않는다", () => {
    const usage = assessDevUsage(
      [
        run("prod", PROD_1020, 2),
        run("dev", DEV_1020, 0.5),
        run("dev", "2026-09-30T14:59:59.000Z", 1.4), // 9/30 23:59:59 KST
      ],
      NOON_1020,
      3,
    );
    expect(usage).toMatchObject({ prod: 2, dev: 0.5, alert: false });
    expect(usage.share).toBeCloseTo(1 / 6, 10);
  });

  it("10/31 15:00Z(= 11/01 00:00 KST) 실행은 11월 dev 사용", () => {
    const usage = assessDevUsage(
      [run("dev", "2026-10-31T15:00:00.000Z", 1.6)],
      new Date("2026-11-02T00:00:00.000Z"),
      3,
    );
    expect(usage).toMatchObject({ key: "2026-11", dev: 1.6, alert: true });
  });

  it("월 예산 0이면 dev 사용이 조금이라도 있으면 알림, 음수 예산은 오류", () => {
    expect(
      assessDevUsage([run("dev", DEV_1005, 0.000001)], NOON_1020, 0),
    ).toMatchObject({
      share: 0,
      alert: true,
    });
    expect(assessDevUsage([], NOON_1020, 0).alert).toBe(false);
    expect(() => assessDevUsage([], NOON_1020, -1)).toThrow(CostError);
  });

  it("경고 문구: 알림 대상이 아니면 빈 문자열, 넘으면 비율·금액·조치", () => {
    expect(formatDevAlert(assessDevUsage([], NOON_1020, 3))).toBe("");
    const text = formatDevAlert(
      assessDevUsage([run("dev", DEV_1005, 1.6)], NOON_1020, 3),
    );
    expect(text).toContain("2026-10(KST) dev LLM 사용이 월 예산의 53.3%");
    expect(text).toContain("dev $1.60");
    expect(text).toContain("--mock");
    expect(text.split("\n")[0]).toMatch(/^!{20,}$/);
  });
});

describe("noticeMonthlyUsage — 실행 시작 알림(던지지 않음)", () => {
  function deps(
    env: RunEnv,
    dataDir: string,
    over: { resolveBudgets?: () => typeof BUDGETS } = {},
  ) {
    const { records, logger } = captureLogger();
    const printed: string[] = [];
    return {
      records,
      printed,
      deps: {
        env,
        dataDir,
        at: NOON_1020,
        resolveBudgets: () => BUDGETS,
        logger,
        print: (t: string) => printed.push(t),
        ...over,
      },
    };
  }

  it("50% 이하: 이번 달 누적 한 줄 로그만(출력 없음)", async () => {
    const t = deps(
      "dev",
      tmpDataDir({
        "runs.json": json([run("prod", PROD_1020, 0.004)]),
        "runs-dev.json": json([run("dev", DEV_1020, 0.011)]),
      }),
    );
    const notice = await noticeMonthlyUsage(t.deps);
    expect(notice).toMatchObject({ state: "ok", total: 0.015 });
    expect(t.printed).toEqual([]);
    expect(t.records).toEqual([
      expect.objectContaining({
        event: "cost.month.usage",
        level: "info",
        month: "2026-10",
        prod: 0.004,
        dev: 0.011,
        limit: 3,
        devAlert: false,
      }),
    ]);
  });

  it("dev 실행 + 50% 초과: 눈에 띄는 여러 줄 경고 출력 + 경고 로그", async () => {
    const t = deps(
      "dev",
      tmpDataDir({ "runs-dev.json": json([run("dev", DEV_1005, 1.6)]) }),
    );
    const notice = await noticeMonthlyUsage(t.deps);
    expect(notice.state).toBe("alert");
    expect(t.printed).toHaveLength(1);
    expect(t.printed[0]).toContain("50%를 넘었다");
    expect(t.printed[0]).not.toContain("::warning");
    expect(t.records.map((r) => [r.event, r.level])).toEqual([
      ["cost.month.usage", "info"],
      ["cost.month.dev-alert", "warn"],
    ]);
  });

  it("prod 실행 + 50% 초과: 경고 로그 + Actions 경고 주석(이슈는 만들지 않는다)", async () => {
    const t = deps(
      "prod",
      tmpDataDir({ "runs-dev.json": json([run("dev", DEV_1005, 1.6)]) }),
    );
    expect((await noticeMonthlyUsage(t.deps)).state).toBe("alert");
    expect(t.printed).toHaveLength(1);
    expect(t.printed[0]).toMatch(
      /^::warning title=비용 — dev 사용 50%25 초과::/,
    );
    expect(t.records.some((r) => r.event === "cost.month.dev-alert")).toBe(
      true,
    );
  });

  it("예산 설정 오류·깨진 runs 파일은 경고만 남기고 넘어간다", async () => {
    const badConfig = deps("dev", tmpDataDir(), {
      resolveBudgets: () => {
        throw new CostConfigError("MONTHLY_BUDGET_USD 형식 오류");
      },
    });
    expect(await noticeMonthlyUsage(badConfig.deps)).toEqual({
      state: "unavailable",
      reason: "config",
      error: "MONTHLY_BUDGET_USD 형식 오류",
    });
    expect(badConfig.records).toEqual([
      expect.objectContaining({
        event: "cost.month.unavailable",
        level: "warn",
      }),
    ]);

    const broken = deps("prod", tmpDataDir({ "runs-dev.json": "{" }));
    expect(await noticeMonthlyUsage(broken.deps)).toMatchObject({
      state: "unavailable",
      reason: "runs-unreadable",
      error: "runs-dev.json: JSON 파싱 실패",
    });
    expect(broken.printed).toEqual([]);
  });
});
