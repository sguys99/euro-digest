/**
 * 비용 가드 (M1-22, PRD FR-27, CLAUDE.md §6.2·§6.3) — 일일 브리핑 실행 전 판정 + 실행 시작 dev 사용률 알림.
 *
 * 단가·집계·예산 판정 자체는 cost.ts(estimateCost·checkBudget·assessDevUsage)를 그대로 쓴다. 이 파일은 그 위에
 *   ① 브리핑 요청의 **최악값** 예상, ② runs 파일을 읽지 못할 때의 처리(판정 불가), ③ 출력(사람용 문구·구조화 로그·Actions 주석)을 얹는다.
 *
 * 판정 기준 (2026-10-16)
 *   - 예상 비용 = 보수적 상한 추정("최악값"): 요청마다 (넉넉한 입력 어림 + `max_tokens` 16,384(D57) — thinking 포함 출력의 상한) ×
 *     BRIEF_MAX_ATTEMPTS(2 = 첫 호출 + FR-29 출력 재시도 1회). 출력·횟수는 진짜 상한이고, 입력은 상한이 아니라 넉넉한 어림이다
 *     (brief.ts estimateBriefInputTokens — M0-30·M0-34 실측 대비 약 +19%). 지시문 캐싱을 켠 요청은 지시문을 매번 캐시 쓰기
 *     (1.25배)로 센다(읽기 할인은 빼고 — 보수적). llm.ts 전송 재시도(429·5xx)는 usage가 0으로 기록돼 세지 않는다.
 *     근거: 판정이 "예산 초과 0회"(FR-27 수용 기준)를 보장하려면 이번 실행이 쓸 수 있는 최대 금액으로 비교해야 하고, 그러면 M1-45가
 *     재시도 직전에 예산을 다시 볼 필요가 없다. 대가는 작다 — 브리핑 1건 최악값이 약 $0.018(입력 ~5~10K + 출력 16,384, ×2 —
 *     D57. D53 8,192일 때 약 $0.009, 그 전 4,096일 때 약 $0.005)이라 일 $0.10 대비 20% 아래다. 그날 prod 사용이 약 $0.08을 넘어야
 *     막힌다(하루 상한 3요청 — D56 — 을 모두 상한까지 써도 약 $0.027).
 *   - 집계 칸 = 이번 실행 **시작 시각**(startedAt)의 KST 날짜·달. 실행 기록이 startedAt으로 귀속되므로(cost.ts — 발행일 = KST 날짜)
 *     판정과 기록이 같은 칸을 본다. 자정 직전에 시작해 자정 뒤에 브리핑을 부르는 실행도 시작한 날의 예산으로 판정한다.
 *   - 일일: prod 실행은 그날 prod만, dev 실행은 prod+dev / 월: 항상 prod+dev (cost.ts checkBudget, M0-21 결정).
 *     경계 포함 — 사용 + 예상 == 예산이면 허용.
 *   - runs 파일이 없으면 기록 전(사용 0). **JSON·스키마·I/O 오류로 읽지 못하거나 금액이 형식에 어긋나면(음수 costUsd 등 — 스키마는
 *     number만 본다) 판정 불가 → LLM을 부르지 않는다**(fail-closed, verdict `runs_unreadable`). 근거: ① 사용액을 모르면 예산 초과
 *     0회를 보장할 수 없다 ② 같은 파일에 이번 실행 비용을 이어 쓸 수도 없어(appendRun이 기존 내용을 검증한다) 부른 비용이 기록되지
 *     않는다(CLAUDE.md §1-4).
 *     "발행을 멈추지 않는다"는 **collect 단계 기준**이다 — 브리핑만 LLM 없이(템플릿은 M1-19) 가고 뉴스 단계는 끝까지 돈다. 그 뒤
 *     Actions 흐름에서는: runs-dev.json이 깨졌으면 collect는 partial(exit 0)로 끝나지만 다음 단계 `npm run validate`(schema
 *     registry가 data/runs.json·runs-dev.json을 검사)가 실패해 그날 커밋·배포가 되지 않는다(전날 사이트 유지). runs.json이 깨졌으면
 *     collect 마지막 실행 기록(recordRun → appendRun)이 던져 exit 1 — 역시 커밋되지 않고 실패 이슈가 생긴다. 어느 쪽이든 고칠 대상은
 *     runs 파일이다.
 *   - mock 실행은 비용이 0이라 판정하지 않는다(호출부가 live에서만 부른다).
 *
 * dev 사용 50% 알림 (CLAUDE.md §6.3)
 *   - 실행 시작에 이번 달 prod·dev 누적을 한 줄 로그로 남기고, dev 누적이 월 예산의 50%를 넘으면
 *     dev 실행 = 눈에 띄는 여러 줄 경고(print) + 경고 로그, prod 실행 = 경고 로그 + Actions 경고 주석(실행 요약 화면).
 *   - prod에서 GitHub 이슈는 만들지 않는다 — dev 사용은 로컬 dev 실행으로만 늘고 그때마다 시작 경고가 같은 사람(개발자)에게 보인다.
 *     봇은 dev 사용을 바꾸지 못하고, 돈은 월 합산 가드가 막는다. 이슈 kind·라벨·워크플로 단계가 새로 필요하기도 하다
 *     (월간 비용 요약은 운영 리포트 M5-09 몫).
 *   - 알림 단계의 어떤 실패도 실행을 멈추지 않는다(던지지 않는다).
 */
import type { RunEnv, RunLog } from "@/lib/schema";
import { nowUtcIso } from "@/lib/time";

import { BRIEF_MAX_ATTEMPTS, estimateBriefInputTokens } from "./brief";
import {
  assessDevUsage,
  checkBudget,
  estimateCost,
  formatDevAlert,
  formatEstimate,
  formatUsd,
  RUNS_FILE_NAMES,
  sumUsd,
  tryLoadRuns,
  type BudgetCheck,
  type BudgetReason,
  type Budgets,
  type CostEstimate,
  type DevUsage,
  type RunsFileIo,
  type RunsLoad,
} from "./cost";
import type { LlmRequest } from "./llm";
import { annotate, type Logger } from "./logger";

// ─── 최악값 예상 ─────────────────────────────────────────────────────────

/** 예상에 쓰는 요청 필드 */
export type BriefRequestShape = Pick<
  LlmRequest,
  "system" | "user" | "maxTokens" | "cacheSystem"
>;

/**
 * 브리핑 요청들의 최악값 예상 — 요청마다 attempts번 과금된다고 보고, 출력은 max_tokens 상한, 캐싱을 켠 지시문은 매번 캐시 쓰기.
 * 단건(일반 Messages API) 정가로 계산한다(D28 — 배치 할인 없음).
 */
export function estimateBriefWorstCase(
  requests: readonly BriefRequestShape[],
  model: string,
  attempts: number = BRIEF_MAX_ATTEMPTS,
): CostEstimate {
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new RangeError(
      `attempts는 1 이상의 정수여야 한다 (받은 값: ${attempts})`,
    );
  }
  // 요청마다 따로 계산해 더한다 — 장문 단가(프롬프트 100K 초과) 판정이 요청별이라 평균으로 묻히지 않게
  const parts = requests.map((request) =>
    estimateCost({
      model,
      requests: attempts,
      avgInputTokens: estimateBriefInputTokens(request),
      avgOutputTokens: request.maxTokens,
      batch: false,
      // estimateBriefInputTokens는 지시문을 글자당 1토큰으로 센다 — 같은 어림으로 캐시 쓰기 몫을 뗀다
      cacheWriteTokens: request.cacheSystem
        ? request.system.length * attempts
        : 0,
    }),
  );
  const sum = (pick: (e: CostEstimate) => number) =>
    parts.reduce((total, e) => total + pick(e), 0);
  return {
    // 모델이 단가 표에 없으면 요청이 없어도 실패한다(설정 오류를 일찍 드러낸다)
    ...estimateCost({
      model,
      requests: 0,
      avgInputTokens: 0,
      avgOutputTokens: 0,
      batch: false,
    }),
    requests: requests.length * attempts,
    tokens: {
      in: sum((e) => e.tokens.in),
      out: sum((e) => e.tokens.out),
      cacheRead: sum((e) => e.tokens.cacheRead),
      cacheWrite: sum((e) => e.tokens.cacheWrite),
    },
    usd: sumUsd(parts.map((e) => e.usd)),
  };
}

// ─── 판정 ────────────────────────────────────────────────────────────────

/** ok · 일/월 예산 초과 예상 · runs 파일을 읽지 못해 판정 불가 */
export type BriefBudgetVerdict = BudgetReason | "runs_unreadable";

export interface BriefBudgetDecision {
  /** LLM을 불러도 되는가 — false면 LLM 없이 진행(브리핑은 코드 템플릿, FR-27) */
  allowed: boolean;
  verdict: BriefBudgetVerdict;
  env: RunEnv;
  /** 요청 1건이 과금될 수 있는 최대 횟수(첫 호출 + FR-29 재시도) */
  attempts: number;
  /** 최악값 예상(요청 수 × attempts) */
  estimate: CostEstimate;
  /** 집계 기준 시각(이번 실행 시작, UTC ISO) — 이 시각의 KST 날짜·달로 판정한다 */
  at: string;
  /** cost.ts 판정 — runs 파일을 읽지 못했으면 null */
  check: BudgetCheck | null;
  /** runs 파일을 읽지 못한 사유(파일 이름 + 한 줄) */
  runsError: { file: string; error: string } | null;
  /** 사람용 한 줄 */
  message: string;
}

/** 예산 때문에 LLM을 건너뛴 브리핑 결과에 남기는 사유(M1-19 템플릿 게시·M1-45 실행 기록이 잇는다) */
export interface BriefBudgetSkip {
  verdict: Exclude<BriefBudgetVerdict, "ok">;
  estimatedUsd: number;
  message: string;
}

export interface DecideBriefBudgetInput {
  env: RunEnv;
  requests: readonly BriefRequestShape[];
  model: string;
  budgets: Budgets;
  runs: RunsLoad;
  /** 이번 실행 시작 시각 — 실행 기록이 귀속되는 KST 날짜·달 */
  at: Date;
  attempts?: number;
}

const NO_LLM = "LLM 없이 진행 (브리핑은 코드 템플릿)";

/**
 * runs 내용 중 판정에 쓸 수 없는 첫 항목 — 금액이 0 이상의 유한한 수가 아니거나(스키마는 number만 본다) 파일과 env가 섞였다.
 * checkBudget이 CostError·RunsFileError로 던질 경우를 미리 잡아 `runs_unreadable`(판정 불가)로 묶는다. 없으면 null.
 */
function invalidRunsOf(
  prodRuns: readonly RunLog[],
  devRuns: readonly RunLog[],
): { file: string; error: string } | null {
  for (const [env, runs] of [
    ["prod", prodRuns],
    ["dev", devRuns],
  ] as const) {
    const file = RUNS_FILE_NAMES[env];
    for (const run of runs) {
      if (run.env !== env) {
        return {
          file,
          error: `${file}: env "${run.env}" 실행이 섞였다 (runId ${run.runId})`,
        };
      }
      if (!Number.isFinite(run.costUsd) || run.costUsd < 0) {
        return {
          file,
          error: `${file}: 실행 ${run.runId}의 costUsd가 0 이상의 수가 아니다 (${run.costUsd})`,
        };
      }
    }
  }
  return null;
}

/** 브리핑 실행 전 판정(순수 함수). 기준은 파일 머리 주석. */
export function decideBriefBudget(
  input: DecideBriefBudgetInput,
): BriefBudgetDecision {
  const attempts = input.attempts ?? BRIEF_MAX_ATTEMPTS;
  const estimate = estimateBriefWorstCase(
    input.requests,
    input.model,
    attempts,
  );
  const base = {
    env: input.env,
    attempts,
    estimate,
    at: nowUtcIso(input.at),
  };
  const unreadable = (runsError: {
    file: string;
    error: string;
  }): BriefBudgetDecision => ({
    ...base,
    allowed: false,
    verdict: "runs_unreadable",
    check: null,
    runsError,
    message: `실행 기록을 읽지 못해 예산을 확인할 수 없다 (${runsError.error}) → ${NO_LLM}`,
  });
  if (!input.runs.ok) {
    return unreadable({ file: input.runs.file, error: input.runs.error });
  }
  const invalid = invalidRunsOf(input.runs.prodRuns, input.runs.devRuns);
  if (invalid !== null) return unreadable(invalid);
  // 위에서 금액·env를 확인했으므로 checkBudget이 runs 때문에 던지지 않는다(예산 값 오류는 설정 오류로 호출부 setup 실패)
  const check = checkBudget({
    env: input.env,
    estimatedUsd: estimate.usd,
    prodRuns: input.runs.prodRuns,
    devRuns: input.runs.devRuns,
    now: input.at,
    dailyBudget: input.budgets.dailyBudgetUsd,
    monthlyBudget: input.budgets.monthlyBudgetUsd,
  });
  return {
    ...base,
    allowed: check.allowed,
    verdict: check.reason,
    check,
    runsError: null,
    message: check.message,
  };
}

/** 판정 → 브리핑 결과의 건너뜀 사유. 허용이면 null */
export function briefBudgetSkip(
  decision: BriefBudgetDecision,
): BriefBudgetSkip | null {
  if (decision.allowed || decision.verdict === "ok") return null;
  return {
    verdict: decision.verdict,
    estimatedUsd: decision.estimate.usd,
    message: decision.message,
  };
}

export interface GuardBriefBudgetInput extends Omit<
  DecideBriefBudgetInput,
  "runs"
> {
  /** data/ 폴더(runs.json·runs-dev.json) */
  dataDir: string;
  io?: RunsFileIo;
}

/** runs 두 파일을 읽어(던지지 않음) 판정한다. 모델이 단가 표에 없으면 던진다(호출부 설정 오류). */
export async function guardBriefBudget(
  input: GuardBriefBudgetInput,
): Promise<BriefBudgetDecision> {
  const runs = await tryLoadRuns(input.dataDir, input.io);
  return decideBriefBudget({ ...input, runs });
}

// ─── 출력 ────────────────────────────────────────────────────────────────

/** 실행 전 출력 문구(CLAUDE.md §6.3) — 최악값 예상·오늘/이번 달 사용률·판정. 여러 줄, 끝 개행 없음 */
export function formatBriefBudget(decision: BriefBudgetDecision): string {
  // attempts 1(골든셋 eval:prompt — 재시도 없음, M1-24)이면 재시도를 세지 않는다
  const note =
    decision.attempts > 1
      ? `최악값 — 요청마다 첫 호출 + FR-29 재시도, 출력 = max_tokens`
      : `최악값 — 요청마다 1회(재시도 없음), 출력 = max_tokens`;
  if (decision.check) {
    return formatEstimate(decision.estimate, decision.check, note);
  }
  const e = decision.estimate;
  return [
    `[cost] 예상 — ${e.model} · ${e.batch ? "배치(50% 할인)" : "단건"} · 요청 ${e.requests}건(${note}) · env ${decision.env}`,
    `[cost]   예상 비용: ${formatUsd(e.usd)}`,
    `[cost]   판정: ${decision.message}`,
  ].join("\n");
}

/** 구조화 로그 필드(`summarize.brief.budget`) — 금액·토큰·집계 칸만(프롬프트·비밀값 없음) */
export function briefBudgetLogFields(
  decision: BriefBudgetDecision,
): Record<string, unknown> {
  const c = decision.check;
  return {
    verdict: decision.verdict,
    allowed: decision.allowed,
    env: decision.env,
    at: decision.at,
    requests: decision.estimate.requests,
    attempts: decision.attempts,
    estimatedUsd: decision.estimate.usd,
    estimatedIn: decision.estimate.tokens.in,
    estimatedOut: decision.estimate.tokens.out,
    day: c?.daily.key ?? null,
    dailyScope: c?.daily.scope ?? null,
    dailyUsed: c?.daily.used ?? null,
    dailyLimit: c?.daily.limit ?? null,
    month: c?.monthly.key ?? null,
    monthlyUsed: c?.monthly.used ?? null,
    monthlyLimit: c?.monthly.limit ?? null,
    monthlyProd: c?.monthly.prod ?? null,
    monthlyDev: c?.monthly.dev ?? null,
    devShare: c?.devShare ?? null,
    devAlert: c?.devAlert ?? null,
    runsError: decision.runsError?.error ?? null,
  };
}

export interface AnnounceDeps {
  env: RunEnv;
  logger: Logger;
  /** 사람이 읽는 출력 — prod(Actions)에서는 경고 주석(`::warning`)도 이 출력으로 쓴다 */
  print: (text: string) => void;
}

/**
 * 판정을 알린다: 실행 전 문구(print) + `summarize.brief.budget` 로그. LLM을 건너뛰면 `summarize.brief.skip`(reason budget) 경고
 * 로그와, prod면 Actions 경고 주석(실행 요약 화면에 보인다)을 더한다.
 */
export function announceBriefBudget(
  decision: BriefBudgetDecision,
  deps: AnnounceDeps,
): void {
  deps.print(formatBriefBudget(decision));
  deps.logger.info("summarize.brief.budget", briefBudgetLogFields(decision));
  if (decision.allowed) return;
  deps.logger.warn("summarize.brief.skip", {
    reason: "budget",
    verdict: decision.verdict,
    estimatedUsd: decision.estimate.usd,
    runsError: decision.runsError?.error ?? null,
  });
  if (deps.env === "prod") {
    annotate(
      "warning",
      decision.message,
      { title: "비용 가드 — 브리핑 LLM 생략 (FR-27)" },
      { ci: true, write: deps.print },
    );
  }
}

// ─── 실행 시작 알림 ──────────────────────────────────────────────────────

export type MonthlyUsageNotice =
  | {
      state: "ok" | "alert";
      usage: DevUsage;
      /** 이번 달 prod+dev 누적 */
      total: number;
    }
  | {
      state: "unavailable";
      reason: "config" | "runs-unreadable";
      error: string;
    };

export interface MonthlyUsageNoticeDeps extends AnnounceDeps {
  dataDir: string;
  /** 이번 실행 시작 시각 — 이 시각의 KST 달로 집계 */
  at: Date;
  /** MONTHLY_BUDGET_USD 해석(잘못된 값이면 던진다 — 알림만 건너뛴다) */
  resolveBudgets: () => Budgets;
  io?: RunsFileIo;
}

function errorLine(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? error.name)
    : String(error);
}

/**
 * 실행 시작 알림 — 이번 달 prod·dev 누적 한 줄(`cost.month.usage`), dev 50% 초과면 경고(dev = 여러 줄 print, prod = Actions 주석)와
 * `cost.month.dev-alert` 경고 로그. 던지지 않는다 — 예산 설정·runs 파일을 읽지 못하면 `cost.month.unavailable` 경고만 남긴다
 * (그 실행의 브리핑 판정은 guardBriefBudget이 따로 한다).
 */
export async function noticeMonthlyUsage(
  deps: MonthlyUsageNoticeDeps,
): Promise<MonthlyUsageNotice> {
  let monthlyBudget: number;
  try {
    monthlyBudget = deps.resolveBudgets().monthlyBudgetUsd;
  } catch (error) {
    const notice: MonthlyUsageNotice = {
      state: "unavailable",
      reason: "config",
      error: errorLine(error),
    };
    deps.logger.warn("cost.month.unavailable", {
      reason: notice.reason,
      error: notice.error,
    });
    return notice;
  }
  let runs: RunsLoad;
  try {
    runs = await tryLoadRuns(deps.dataDir, deps.io);
  } catch (error) {
    // tryLoadRuns는 던지지 않는다 — 방어선
    runs = { ok: false, file: "runs", error: errorLine(error) };
  }
  if (!runs.ok) {
    const notice: MonthlyUsageNotice = {
      state: "unavailable",
      reason: "runs-unreadable",
      error: runs.error,
    };
    deps.logger.warn("cost.month.unavailable", {
      reason: notice.reason,
      file: runs.file,
      error: notice.error,
    });
    return notice;
  }
  let usage: DevUsage;
  try {
    usage = assessDevUsage(
      [...runs.prodRuns, ...runs.devRuns],
      deps.at,
      monthlyBudget,
    );
  } catch (error) {
    // 금액 형식 오류(음수 등 — 스키마는 number만 본다) — 알림만 건너뛴다
    const notice: MonthlyUsageNotice = {
      state: "unavailable",
      reason: "runs-unreadable",
      error: errorLine(error),
    };
    deps.logger.warn("cost.month.unavailable", {
      reason: notice.reason,
      error: notice.error,
    });
    return notice;
  }
  const fields = {
    env: deps.env,
    month: usage.key,
    prod: usage.prod,
    dev: usage.dev,
    limit: usage.monthlyBudget,
    devShare: usage.share,
    devAlert: usage.alert,
  };
  deps.logger.info("cost.month.usage", fields);
  const total = sumUsd([usage.prod, usage.dev]);
  if (!usage.alert) return { state: "ok", usage, total };

  deps.logger.warn("cost.month.dev-alert", fields);
  if (deps.env === "dev") {
    deps.print(formatDevAlert(usage));
  } else {
    annotate(
      "warning",
      `${usage.key}(KST) dev LLM 사용 ${formatUsd(usage.dev)} — 월 예산 ${formatUsd(usage.monthlyBudget)}의 ${(usage.share * 100).toFixed(1)}% (50% 초과, CLAUDE.md §6.3)`,
      { title: "비용 — dev 사용 50% 초과" },
      { ci: true, write: deps.print },
    );
  }
  return { state: "alert", usage, total };
}
