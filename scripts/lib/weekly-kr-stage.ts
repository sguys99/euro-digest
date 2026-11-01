/**
 * 주간 단계 korean-weekly — 한국 선수 주간 리포트 `data/players/weekly/{yyyy-ww}.json` (M3-07 — PRD FR-90~92, §15 D28·D65).
 * 규칙(표·MVP·LLM 입력·검증·템플릿)은 weekly-kr.ts 순수 함수, 여기는 읽기 → 판정 → LLM(Batches) → 쓰기만 한다.
 *
 * 흐름
 *   ① 읽기: configs(korean-players·names.ko·competitions) + 원장 meta·그 주 UTC 구간의 달 파일(data/matches). meta가 없거나 깨졌거나
 *      달 파일이 깨졌으면 던진다(단계 실패 — 표를 지어내지 않는다). 달 파일이 아직 없으면 빈 달로 본다(경고).
 *   ② 표·MVP(코드) — 항상 발행한다. 실행 시각에 UTC 주가 남아 있으면(정기 실행 월 08:00 KST = 일 23:00 UTC) 경고만 남긴다.
 *   ③ 총평(LLM 호출 지점 #3 — Message Batches API, D28): 출전 선수가 없으면 호출하지 않고 템플릿. 시도마다 최악값 예상(배치 50%)을
 *      출력하고 `ctx.budget.check`(runs.json + runs-dev.json — 판정 불가도 LLM 없이) → `runBatch`(단계 시작 + LLM 창 안에서 폴링).
 *      실패(배치 오류·만료·마감 초과·zod·코드 검증)면 남은 시간이 재시도 최소 시간 이상일 때 1회 재시도(합쳐 2회 — 2026-11-01 사용자
 *      결정) → 그래도 실패면 코드 템플릿(`summaryAi:false`). 마감을 넘긴 배치는 취소하고(남은 요청 과금 방지) 짧게 기다려 이미 처리된
 *      결과의 비용을 기록한다. 부른 결과는 성공·실패 모두 `ctx.llm.addResults`(dry여도 — CLAUDE.md §1-4).
 *   ④ 쓰기: dry가 아니면 끝에 한 번(임시 파일 → rename). 그 주차 파일이 이미 있으면 force 없이는 건너뛴다(러너 가드와 같은 근거).
 */
import { randomBytes } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  WeeklyReportSchema,
  type CompId,
  type LedgerMatch,
  type PlayerComp,
} from "@/lib/schema";
import { nowUtcIso, utcMonth } from "@/lib/time";

import { readConfigFile } from "./config-files";
import {
  LlmMockFixtureError,
  LlmRequestError,
  LlmTransportError,
  type LlmClient,
  type LlmResult,
} from "./llm";
import { readLedgerMeta, readLedgerMonth } from "./match-ledger";
import { buildNameIndex } from "./names";
import {
  WEEKLY_KR_MAX_ATTEMPTS,
  WEEKLY_REPORT_DIR,
  WEEKLY_KR_PROMPT_PATH,
  buildWeeklyReport,
  buildWeeklyRequest,
  buildWeeklyTable,
  checkWeeklySummary,
  estimateWeeklyWorstCase,
  parseWeeklyOutput,
  serializeWeeklyReport,
  weeklyLlmInput,
  weeklyTemplateSummary,
  type WeeklyCheckContext,
  type WeeklyTable,
} from "./weekly-kr";
import type { WeeklyStageContext, WeeklyStageReport } from "./weekly-stages";

// ─── 시간 상한 (단계 timeoutMs 10분 안 — weekly-stages.ts) ─────────────────

/** 단계 시작부터 LLM(배치 제출·폴링·재시도)에 쓰는 시간 — 남은 시간은 취소 유예·쓰기 */
export const KOREAN_WEEKLY_LLM_WINDOW_MS = 8 * 60_000;
/** 재시도 배치를 보낼 최소 남은 시간 — M0-30 배치 완료 1분 50초~6분 33초, 단건 요청 배치는 대개 짧다 */
export const KOREAN_WEEKLY_RETRY_MIN_MS = 3 * 60_000;
/** 배치 상태 조회 간격(llm.ts 최소 5초) */
export const KOREAN_WEEKLY_POLL_INTERVAL_MS = 15_000;
/** 마감 초과 배치 취소 뒤 끝나기를 기다리는 시간(처리된 결과 비용 기록용) */
export const KOREAN_WEEKLY_CANCEL_GRACE_MS = 45_000;

export type WeeklySummaryReason =
  | "llm" // LLM 총평 게시
  | "no-appearances" // 출전 0명 — 호출 생략
  | "budget" // 비용 가드 초과 예상
  | "budget-unreadable" // runs 파일·예산 설정 판정 불가
  | "prompt-unreadable"
  | "batch-timeout"
  | "batch-failed" // 제출 실패·결과 오류·만료·취소
  | "output-invalid" // zod·코드 검증 실패
  | "mock-missing";

export interface WeeklyAttemptLog {
  attempt: number;
  customId: string;
  outcome:
    | "ok"
    | "budget"
    | "budget-unreadable"
    | "timeout"
    | "submit-failed"
    | "result-failed"
    | "json"
    | "schema"
    | "check"
    | "mock-missing";
  detail?: string;
  estimatedUsd?: number;
}

export interface KoreanWeeklySummary {
  summary: string;
  summaryAi: boolean;
  reason: WeeklySummaryReason;
  attempts: WeeklyAttemptLog[];
}

const errorText = (error: unknown) =>
  error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error);

// ─── 읽기 ────────────────────────────────────────────────────────────────

export interface KoreanWeeklyInputs {
  table: WeeklyTable;
  check: WeeklyCheckContext;
  /** 그 주 구간 원장 경기 수(전체 — 한국 선수 행 유무와 무관) */
  ledgerMatches: number;
  missingMonths: string[];
}

/** 설정·원장 → 표(던질 수 있다 — 단계 실패) */
export async function loadKoreanWeeklyInputs(
  ctx: Pick<WeeklyStageContext, "rootDir" | "dataDir" | "week" | "weekRange">,
): Promise<KoreanWeeklyInputs> {
  const [players, namesFile, competitions, meta] = await Promise.all([
    readConfigFile(ctx.rootDir, "korean-players.json", KoreanPlayersFileSchema),
    readConfigFile(ctx.rootDir, "names.ko.json", NamesKoFileSchema),
    readConfigFile(ctx.rootDir, "competitions.json", CompetitionsFileSchema),
    readLedgerMeta(ctx.dataDir),
  ]);
  if (meta.error !== null)
    throw new Error(`data/matches/meta.json ${meta.error}`);
  if (meta.value === null) {
    throw new Error(
      "data/matches/meta.json 없음 — 원장이 시작되지 않아 주간 표를 만들 수 없다",
    );
  }
  const months = [
    ...new Set([utcMonth(ctx.weekRange.from), utcMonth(ctx.weekRange.to)]),
  ];
  const ledger: LedgerMatch[] = [];
  const missingMonths: string[] = [];
  for (const month of months) {
    const read = await readLedgerMonth(ctx.dataDir, month);
    if (read.error !== null)
      throw new Error(`data/matches/${month}.json ${read.error}`);
    if (read.value === null) missingMonths.push(month);
    else ledger.push(...read.value.matches);
  }
  const compNames: Partial<Record<PlayerComp, string>> = {};
  for (const c of competitions) compNames[c.id] = c.nameEn;
  const table = buildWeeklyTable({
    week: ctx.week,
    range: ctx.weekRange,
    players,
    ledger,
    playerSince: meta.value.playerSince,
    compNames,
  });
  const from = Date.parse(ctx.weekRange.from);
  const to = Date.parse(ctx.weekRange.to);
  const nameKo = new Map<CompId, string>(
    competitions.map((c) => [c.id, c.nameKo]),
  );
  return {
    table,
    check: {
      names: buildNameIndex(namesFile, competitions),
      competitionLabel: (comp) => nameKo.get(comp) ?? comp,
    },
    ledgerMatches: ledger.filter((m) => {
      const t = Date.parse(m.kickoff);
      return t >= from && t <= to;
    }).length,
    missingMonths,
  };
}

// ─── 총평 ────────────────────────────────────────────────────────────────

/**
 * 총평 — LLM(Batches) 시도 → 실패면 템플릿(머리 주석 ③). 던지지 않는다(예상 밖 오류도 템플릿 — 표·MVP는 항상 발행).
 * `stageStartMs`: 단계 시작 시각(ctx.now 기준) — LLM 창 계산.
 */
export async function composeKoreanWeeklySummary(
  ctx: WeeklyStageContext,
  inputs: Pick<KoreanWeeklyInputs, "table" | "check">,
  stageStartMs: number,
): Promise<KoreanWeeklySummary> {
  const { table } = inputs;
  const log = ctx.logger;
  const template = (
    reason: WeeklySummaryReason,
    attempts: WeeklyAttemptLog[],
  ) => {
    log.info("weekly.korean-weekly.summary.template", {
      reason,
      attempts: attempts.length,
    });
    return {
      summary: weeklyTemplateSummary(table),
      summaryAi: false,
      reason,
      attempts,
    };
  };
  if (!table.rows.some((r) => r.apps > 0))
    return template("no-appearances", []);

  let system: string;
  try {
    system = (
      await readFile(path.join(ctx.rootDir, WEEKLY_KR_PROMPT_PATH), "utf8")
    ).trim();
    if (!system) throw new Error(`${WEEKLY_KR_PROMPT_PATH}가 비어 있다`);
  } catch (error) {
    log.error("weekly.korean-weekly.prompt.fail", { error: errorText(error) });
    return template("prompt-unreadable", []);
  }

  const input = weeklyLlmInput(table);
  const deadlineMs = stageStartMs + KOREAN_WEEKLY_LLM_WINDOW_MS;
  const attempts: WeeklyAttemptLog[] = [];
  let lastReason: WeeklySummaryReason = "batch-failed";
  let client: LlmClient | null = null;

  for (let attempt = 1; attempt <= WEEKLY_KR_MAX_ATTEMPTS; attempt += 1) {
    const remaining = deadlineMs - ctx.now().getTime();
    if (
      ctx.signal.aborted ||
      remaining < (attempt === 1 ? 60_000 : KOREAN_WEEKLY_RETRY_MIN_MS)
    ) {
      log.info("weekly.korean-weekly.attempt.skip", {
        attempt,
        remainingMs: remaining,
      });
      if (attempt === 1) lastReason = "batch-timeout";
      break;
    }
    const request = buildWeeklyRequest(input, system, attempt);
    const estimate = estimateWeeklyWorstCase(request, ctx.llm.model);
    ctx.print(
      `[weekly] 주간 총평 시도 ${attempt}/${WEEKLY_KR_MAX_ATTEMPTS} (Batches, ${ctx.llm.model}) — 예상 최악: 입력 약 ${estimate.tokens.in.toLocaleString("en-US")}토큰 · 출력 상한 ${estimate.tokens.out.toLocaleString("en-US")}토큰 · $${estimate.usd.toFixed(6)}`,
    );
    const entry: WeeklyAttemptLog = {
      attempt,
      customId: request.customId,
      outcome: "ok",
      estimatedUsd: estimate.usd,
    };
    attempts.push(entry);

    try {
      const verdict = await ctx.budget.check(estimate.usd);
      if (!verdict.allowed) {
        entry.outcome = "budget";
        entry.detail = verdict.reason;
        log.warn("weekly.korean-weekly.budget.skip", {
          attempt,
          reason: verdict.reason,
          estimatedUsd: estimate.usd,
        });
        return template("budget", attempts);
      }
    } catch (error) {
      entry.outcome = "budget-unreadable";
      entry.detail = errorText(error);
      log.error("weekly.korean-weekly.budget.unreadable", {
        error: entry.detail,
      });
      return template("budget-unreadable", attempts);
    }

    let result: LlmResult | undefined;
    try {
      client ??= ctx.llm.createClient();
      const outcome = await client.runBatch([request], {
        deadline: new Date(deadlineMs),
        intervalMs: KOREAN_WEEKLY_POLL_INTERVAL_MS,
      });
      if (outcome.timedOut) {
        entry.outcome = "timeout";
        lastReason = "batch-timeout";
        log.warn("weekly.korean-weekly.batch.timeout", {
          attempt,
          batchId: outcome.batchId,
        });
        await cancelAndRecord(ctx, client, outcome.batchId);
        break; // 마감을 넘겼다 — 재시도할 시간이 없다
      }
      ctx.llm.addResults(outcome.results.values());
      result = outcome.results.get(request.customId);
      log.info("weekly.korean-weekly.batch.done", {
        attempt,
        batchId: outcome.batchId,
        state: outcome.state,
        ok: result?.ok ?? false,
        tokens: outcome.usage.total,
      });
    } catch (error) {
      if (error instanceof LlmMockFixtureError) {
        entry.outcome = "mock-missing";
        lastReason = "mock-missing";
        log.warn("weekly.korean-weekly.mock-missing", {
          attempt,
          customId: request.customId,
        });
        break;
      }
      entry.outcome = "submit-failed";
      entry.detail =
        error instanceof LlmTransportError || error instanceof LlmRequestError
          ? errorText(error)
          : `예상 밖 오류: ${errorText(error)}`;
      lastReason = "batch-failed";
      log.error("weekly.korean-weekly.batch.fail", {
        attempt,
        error: entry.detail,
      });
      continue;
    }

    if (!result || !result.ok) {
      entry.outcome = "result-failed";
      entry.detail = result && !result.ok ? result.errorType : "no-result";
      lastReason = "batch-failed";
      continue;
    }
    const parsed = parseWeeklyOutput(result.text);
    if (!parsed.ok) {
      entry.outcome = parsed.reason;
      entry.detail = parsed.detail;
      lastReason = "output-invalid";
      log.warn("weekly.korean-weekly.output.invalid", {
        attempt,
        reason: parsed.reason,
        detail: parsed.detail,
      });
      continue;
    }
    const checked = checkWeeklySummary(parsed.sentences, table, inputs.check);
    if (!checked.ok) {
      entry.outcome = "check";
      entry.detail = checked.issues
        .slice(0, 5)
        .map((i) => `${i.code}@${i.sentence}${i.detail ? `(${i.detail})` : ""}`)
        .join(" · ");
      lastReason = "output-invalid";
      log.warn("weekly.korean-weekly.check.fail", {
        attempt,
        issues: entry.detail,
      });
      ctx.print(
        `[weekly] 총평 시도 ${attempt} 검증 실패: ${entry.detail}\n  ${checked.sentences.join("\n  ")}`,
      );
      continue;
    }
    log.info("weekly.korean-weekly.summary.llm", {
      attempt,
      sentences: checked.sentences.length,
    });
    return {
      summary: checked.sentences.join(" "),
      summaryAi: true,
      reason: "llm",
      attempts,
    };
  }
  return template(lastReason, attempts);
}

/** 마감 초과 배치 — 취소(남은 요청 과금 방지) → 짧게 기다려 처리된 결과의 비용만 기록. 던지지 않는다 */
async function cancelAndRecord(
  ctx: WeeklyStageContext,
  client: LlmClient,
  batchId: string,
): Promise<void> {
  try {
    await client.cancelBatch(batchId);
    const polled = await client.pollBatch(batchId, {
      deadline: new Date(ctx.now().getTime() + KOREAN_WEEKLY_CANCEL_GRACE_MS),
      intervalMs: 5_000,
    });
    if (polled.state !== "deadline") {
      ctx.llm.addResults((await client.collectBatchResults(batchId)).values());
    } else {
      ctx.logger.warn("weekly.korean-weekly.cancel.pending", {
        batchId,
        note: "취소 처리 중 — 비용은 batchId로 나중에 확인",
      });
    }
  } catch (error) {
    ctx.logger.error("weekly.korean-weekly.cancel.fail", {
      batchId,
      error: errorText(error),
    });
  }
}

// ─── 단계 ────────────────────────────────────────────────────────────────

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function writeAtomic(target: string, text: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, text, "utf8");
    await rename(tmp, target);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** 단계 함수(weekly-stages.ts korean-weekly) */
export async function runKoreanWeekly(
  ctx: WeeklyStageContext,
): Promise<WeeklyStageReport> {
  const started = ctx.now().getTime();
  const rel = `${WEEKLY_REPORT_DIR}/${ctx.week}.json`;
  const target = path.join(ctx.rootDir, rel);
  if (!ctx.force && !ctx.dry && (await exists(target))) {
    return {
      outputs: [],
      note: `${rel} 이미 있음 — 건너뜀(다시 만들려면 force)`,
    };
  }
  const inputs = await loadKoreanWeeklyInputs(ctx);
  const { table } = inputs;
  const log = ctx.logger;
  if (inputs.missingMonths.length > 0) {
    log.warn("weekly.korean-weekly.ledger.month-missing", {
      months: inputs.missingMonths,
    });
  }
  if (Date.parse(ctx.weekRange.to) >= started) {
    log.warn("weekly.korean-weekly.ledger.week-open", {
      utcWeekEnd: ctx.weekRange.to,
      note: "UTC 일요일이 남아 있다 — 원장(종료 경기)만 집계, 끝나지 않은 경기는 빠진다",
    });
  }
  log.info("weekly.korean-weekly.table", {
    week: ctx.week,
    ledgerMatches: inputs.ledgerMatches,
    rows: table.rows.length,
    appeared: table.rows.filter((r) => r.apps > 0).length,
    mvp: table.mvp,
    coMvp: table.coMvp,
    excluded: table.excluded,
    unknownMinutes: table.unknownMinutes,
  });

  const summary = await composeKoreanWeeklySummary(ctx, inputs, started);
  if (ctx.signal.aborted) throw new Error("단계 시간 상한 — 쓰지 않는다");
  const report = WeeklyReportSchema.parse(
    buildWeeklyReport({
      table,
      summary: summary.summary,
      summaryAi: summary.summaryAi,
      generatedAt: nowUtcIso(ctx.now()),
    }),
  );
  const text = serializeWeeklyReport(report);
  if (ctx.dry) {
    ctx.print(`[weekly] (dry) ${rel} — 쓰지 않음\n${text}`);
  } else {
    await writeAtomic(target, text);
  }
  return {
    outputs: [rel],
    counts: {
      rows: report.rows.length,
      appeared: table.rows.filter((r) => r.apps > 0).length,
      llmAttempts: summary.attempts.length,
      summaryAi: summary.summaryAi ? 1 : 0,
    },
    note: `MVP ${[report.mvp, ...(report.coMvp ?? [])].filter(Boolean).join("·") || "없음"} · 총평 ${summary.summaryAi ? "LLM" : `템플릿(${summary.reason})`}${ctx.dry ? " · dry" : ""}`,
  };
}
