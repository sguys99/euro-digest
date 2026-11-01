/**
 * `npm run weekly` 본체 (M3-06 — PRD FR-90, §10 '월요일 weekly.yml', CLAUDE.md §6.1·§6.3, D49 정신).
 * 진입점 scripts/weekly.ts가 인자·환경변수를 읽어 의존성을 꾸리고, 이 파일은 순수 판정 + 주입받은 I/O로 단계를 돌린다.
 *
 * 흐름
 *   ⓪ 대상 주차 = 실행 시작 KST 날짜가 속한 ISO 주의 **바로 앞 주**(지난 월~일 — FR-90). 월요일 08:00 KST 정기 실행이면 어제 끝난
 *      주, 같은 주 화~일 수동 재실행도 같은 주차. `--week YYYY-WW`로 지난 주차를 지정할 수 있다(끝나지 않은 주는 거부).
 *      단계에 넘기는 집계 구간 `weekRange`는 **UTC 월 00:00 ~ 일 23:59:59.999**(PRD §15 D65 ① — 경기일 기준, time.ts isoWeekRangeUtc).
 *      '끝난 주' 판정은 KST 주 끝(일 24:00 KST)으로 한다 — 정기 실행(월 08:00 KST = 일 23:00 UTC)에는 UTC 일요일이 1시간 남아 있지만
 *      일요일 마지막 킥오프(보통 ~20:00 UTC)는 끝나 있다. 이때 `weekly.run.utc-week-open` 경고를 남기고, 단계는 원장 기준으로 집계한다
 *      (원장에는 종료 경기만 들어오므로 그 시각까지 끝나지 않은 경기는 빠진다 — 단계가 로그로 남긴다).
 *   ⓪-1 쓰기 여부(effectiveWeeklyDry): `--dry`면 미리보기. 로컬(dev)은 `--write`가 없으면 `--dry`와 같은 미리보기(data/에 쓰지
 *      않음 — 실행 기록·비용은 dry 규칙대로, 2026-11-01 리뷰). Actions(prod)는 그대로 쓴다.
 *   ① 실행 가드(decideWeeklyGuard): 그 주차 한국 선수 주간 리포트(`data/players/weekly/<주차>.json`)가 이미 있으면(= 그 단계가 성공하고
 *      검증·빌드를 통과해 커밋됐다) force 없이는 실행 전체를 건너뛴다 — 실행 기록도 남기지 않는다(성공 처리, exit 0).
 *      판정 근거를 실행 기록이 아니라 산출물 파일로 둔 이유: RunLog에는 주차 필드가 없어(스키마 변경은 사용자 확인 사항) 지난 주차를
 *      지정한 재실행의 기록이 시작 시각 기준 주차로 잘못 귀속될 수 있다. 파일은 커밋된 결과 그 자체라 어긋나지 않는다.
 *      M3-07 전에는 파일이 생기지 않으므로 가드가 건너뛰지 않는다(수동 재실행마다 미구현 단계만 다시 로그).
 *      파일이 있으면 출처(파일 generatedAt + 그 시각의 job weekly 실행 runId·env — describeWeeklyReportOrigin)를 가드 메시지(로그·Step
 *      Summary '실행 판단')에 붙인다. dev가 만든 파일인지 스키마로는 구분하지 않으므로 판정은 파일 존재 기준 그대로다.
 *   ② 단계 실행(runWeeklyStages): weekly-stages.ts `WEEKLY_STAGES`를 선언 순서대로 하나씩. 단계마다 try/catch + 시간 상한(abort) —
 *      한 단계의 실패가 다음 단계를 막지 않는다. `run: null`(미구현)은 "미구현 — 건너뜀" 로그만(성공 처리).
 *   ③ 실행 상태(weeklyRunStatus): 실패 0 → success · 실패와 성공이 섞임 → partial · 실패만 있음(성공한 단계 0) → failed.
 *      미구현 단계는 성공·실패 어느 쪽에도 세지 않는다(모두 미구현이면 success). dry 실행은 기록 상태 skipped(발행하지 않은 실행).
 *   ④ 실행 기록(job "weekly" — src/lib/schema/run.ts): live 실행이면 기록한다(prod → data/runs.json, dev → data/runs-dev.json).
 *      dry는 LLM 결과가 있을 때만(CLAUDE.md §1-4 — 부른 비용은 dry여도 남긴다). mock은 기록하지 않는다(테스트가 data/를 건드리지 않게).
 *      가드로 건너뛴 실행은 기록하지 않는다.
 *   ⑤ 종료 코드(weeklyExitCode): 0 = 건너뜀·success·partial · 1 = failed·준비 실패(인자·설정·가드 판정 불가)·실행 기록 실패.
 *      partial은 0이다 — 성공한 단계의 산출물은 검증·빌드를 거쳐 커밋·배포하고, 실패한 단계는 weekly.yml 마지막 단계 '단계 실패
 *      표시'가 job을 실패로 바꿔 실패 이슈(원인 키 `weekly:weekly/stages`)를 만든다. 실패한 단계의 산출물(`writes` 경로)은 단계 출력
 *      `discard`로 넘겨 커밋 전에 main 상태로 되돌린다.
 *
 * 단계 출력(`$GITHUB_OUTPUT` — WEEKLY_OUTPUT_KEYS, weekly.yml이 `steps.weekly.outputs.<키>`로 읽는다. 키를 바꾸면 워크플로도 함께 —
 * tests/weekly-workflow.test.ts가 대조): skipped · week · publish_date(실행 시작 KST 날짜 — 커밋 메시지) · run_id · status · run_recorded
 * (실패 실행 기록 보존 단계의 조건) · failed_stages(쉼표) · discard(공백 — 되돌릴 경로).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import type { RunEnv, RunLog, RunSource } from "@/lib/schema";
import {
  isoWeekOfDate,
  isoWeekRange,
  isoWeekRangeUtc,
  kstDate,
  nowUtcIso,
  shiftDate,
} from "@/lib/time";

import { noticeMonthlyUsage } from "./budget-guard";
import { resolveLlmMode, type LlmMode, type ParseResult } from "./cli-args";
import {
  buildRunLog,
  checkBudgetFromFiles,
  costFromResults,
  getModelPricing,
  makeRunId,
  readRuns,
  recordRun,
  runsPathFor,
  type Budgets,
} from "./cost";
import type { LlmClient } from "./llm";
import type { Logger } from "./logger";
import { feedUserAgent, type FetchLike } from "./rss";
import {
  WEEKLY_REPORT_DIR,
  type WeeklyBillableResult,
  type WeeklyStage,
  type WeeklyStageContext,
} from "./weekly-stages";

// ─── 인자 ────────────────────────────────────────────────────────────────

export interface WeeklyArgs {
  dry: boolean;
  /** 로컬(dev) 실행에서 data/에 쓴다 — 없으면 dev는 미리보기(effectiveWeeklyDry). prod(Actions)에는 영향 없음 */
  write: boolean;
  mock: boolean;
  force: boolean;
  /** 지정 주차 "YYYY-WW" — null이면 기본(지난 주) */
  week: string | null;
  llmMode: LlmMode;
  help: boolean;
}

export const WEEKLY_USAGE = [
  "사용법: npm run weekly -- [--dry] [--mock] [--force] [--week <YYYY-WW>]",
  "  --dry          data/에 쓰지 않고 결과만 출력 (LLM을 부른 단계가 있으면 비용은 기록)",
  "  --write        로컬(dev) 실행에서 data/에 쓴다 — 없으면 로컬 실행은 --dry와 같은 미리보기 (Actions(prod)는 항상 씀)",
  "  --mock         LLM 대신 fixtures/llm/ 응답 사용 (LLM_MODE=mock과 같음 — 실행 기록 안 함)",
  "  --force        그 주차 주간 리포트가 이미 있어도 실행 (단계의 '이미 했음' 판단도 무시)",
  "  --week <주차>  대상 ISO 주차 (기본: 실행 시작 KST 날짜가 속한 주의 바로 앞 주 — 지난 월~일). 끝나지 않은 주는 거부",
  "  --help, -h     이 도움말",
  "※ npm 뒤에 `--`를 빼면 npm이 옵션을 가져가 버린다.",
].join("\n");

const WEEK_FORMAT = /^\d{4}-\d{2}$/;

/** weekly 인자 파싱(순수). 주차의 범위·'끝난 주' 확인은 resolveTargetWeek가 실행 시각으로 한다 */
export function parseWeeklyArgs(
  argv: readonly string[],
  envLlmMode: string | undefined,
): ParseResult<WeeklyArgs> {
  let values: {
    dry?: boolean;
    write?: boolean;
    mock?: boolean;
    force?: boolean;
    week?: string;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: {
        dry: { type: "boolean", default: false },
        write: { type: "boolean", default: false },
        mock: { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        week: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const week = values.week?.trim();
  if (week !== undefined && !WEEK_FORMAT.test(week)) {
    return {
      ok: false,
      error: `--week는 YYYY-WW 형식이어야 합니다 (받은 값 길이 ${week.length})`,
    };
  }
  if (values.dry && values.write) {
    return { ok: false, error: "--dry와 --write는 함께 쓸 수 없습니다" };
  }
  const mock = values.mock ?? false;
  const llmMode = resolveLlmMode(mock, envLlmMode);
  if (!llmMode.ok) return llmMode;
  return {
    ok: true,
    value: {
      dry: values.dry ?? false,
      write: values.write ?? false,
      mock,
      force: values.force ?? false,
      week: week || null,
      llmMode: llmMode.value,
      help: values.help ?? false,
    },
  };
}

/** Actions(GITHUB_ACTIONS=true) = prod → data/runs.json, 로컬 = dev → data/runs-dev.json (collect와 같은 규칙) */
export function resolveWeeklyEnv(
  env: Readonly<Record<string, string | undefined>>,
): RunEnv {
  return env.GITHUB_ACTIONS === "true" ? "prod" : "dev";
}

/**
 * 실제로 data/에 쓸지(머리 주석 ⓪-1). dev(로컬)는 `--write`가 있을 때만 쓴다 — 2026-11-01 리뷰: W43 첫 호는 dev 실행으로 의도해
 * 만들었지만, 이후 로컬 실험이 실수로 주간 리포트·팀 파일을 만들어 다음 정기 실행의 가드(파일 존재)를 막지 않게. prod는 그대로.
 */
export function effectiveWeeklyDry(input: {
  env: RunEnv;
  dry: boolean;
  write: boolean;
}): { dry: boolean; reason: "flag" | "dev-preview" | null } {
  if (input.dry) return { dry: true, reason: "flag" };
  if (input.env === "dev" && !input.write)
    return { dry: true, reason: "dev-preview" };
  return { dry: false, reason: null };
}

// ─── 대상 주차 ───────────────────────────────────────────────────────────

/**
 * 기본 대상 주차 — 실행 순간의 **KST 날짜**가 속한 ISO 주의 바로 앞 주(지난 월~일, FR-90).
 * KST 기준인 이유: 정기 실행(월 08:00 KST)은 UTC로 일요일 23:00이라 UTC 날짜로 계산하면 두 주 전이 된다.
 * 예) 2026-11-01T23:00:00Z(월 08:00 KST) → "2026-44"(10-26~11-01) · 2027-01-03T23:00:00Z(월 01-04 KST) → "2026-53"
 */
export function defaultTargetWeek(nowIso: string): string {
  return isoWeekOfDate(shiftDate(kstDate(nowIso), -7));
}

export interface TargetWeek {
  week: string;
  /** 집계 구간 — UTC 월 00:00 ~ 일 23:59:59.999 (D65 ①) */
  range: { from: string; to: string };
}

/**
 * 지정 주차(없으면 기본) → 주차·UTC 집계 구간(D65 ①). 그해에 없는 주차·아직 끝나지 않은 주(**KST** 주 끝 > 지금 — 머리 주석 ⓪)는 오류
 */
export function resolveTargetWeek(
  requested: string | null,
  nowIso: string,
): ParseResult<TargetWeek> {
  const week = requested ?? defaultTargetWeek(nowIso);
  let range: TargetWeek["range"];
  let kstEnd: string;
  try {
    range = isoWeekRangeUtc(week);
    kstEnd = isoWeekRange(week).to;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (Date.parse(kstEnd) > Date.parse(nowIso)) {
    return {
      ok: false,
      error: `주차 ${week}는 아직 끝나지 않았습니다 (KST 일요일 24시 이후에 실행) — 주간 리포트는 지난 월~일 기준(FR-90)`,
    };
  }
  return { ok: true, value: { week, range } };
}

// ─── 실행 가드 ───────────────────────────────────────────────────────────

const REPORT_FILE = /^(\d{4}-\d{2})\.json$/;

/** 주간 리포트 폴더의 파일 이름들 → 발행된 주차(정렬·중복 제거). 형식 밖 이름은 무시 */
export function publishedWeeksOf(fileNames: readonly string[]): string[] {
  const weeks = new Set<string>();
  for (const name of fileNames) {
    const m = REPORT_FILE.exec(name);
    if (m?.[1]) weeks.add(m[1]);
  }
  return [...weeks].sort();
}

export type WeeklyGuardReason = "force" | "not-published" | "already-published";

export interface WeeklyGuardDecision {
  run: boolean;
  reason: WeeklyGuardReason;
  message: string;
}

/** 같은 주 재실행 가드(순수) — 머리 주석 ①. force가 먼저다 */
export function decideWeeklyGuard(input: {
  week: string;
  force: boolean;
  publishedWeeks: readonly string[];
}): WeeklyGuardDecision {
  if (input.force) {
    return {
      run: true,
      reason: "force",
      message: `force — 주차 ${input.week} 발행 여부와 관계없이 실행`,
    };
  }
  if (input.publishedWeeks.includes(input.week)) {
    return {
      run: false,
      reason: "already-published",
      message: `주차 ${input.week} 주간 리포트(${WEEKLY_REPORT_DIR}/${input.week}.json)가 이미 발행됨 — 건너뜀(다시 만들려면 force)`,
    };
  }
  return {
    run: true,
    reason: "not-published",
    message: `주차 ${input.week} 주간 리포트 없음 — 실행`,
  };
}

/**
 * 이미 있는 주간 리포트의 출처 한 줄 — 파일 `generatedAt` + 그 시각을 [startedAt, finishedAt] 안에 둔 job weekly 실행 기록(runs.json·
 * runs-dev.json)의 runId·env. 스키마에 생성 실행 필드가 없어(변경은 사용자 확인 사항) 시각으로 맞춘다. 가드 판정은 여전히 파일
 * 존재 기준이고, 이 줄은 로그·Step Summary에 '누가 만들었나'를 보여 준다(dev로 만든 파일이 정기 실행을 막았는지 확인용).
 * 던지지 않는다(읽지 못하면 그 사실을 적는다).
 */
export async function describeWeeklyReportOrigin(
  rootDir: string,
  dataDir: string,
  week: string,
): Promise<string> {
  let generatedAt: string;
  try {
    const json = JSON.parse(
      await readFile(
        path.join(rootDir, WEEKLY_REPORT_DIR, `${week}.json`),
        "utf8",
      ),
    ) as { generatedAt?: unknown };
    if (typeof json.generatedAt !== "string") return "생성 시각 없음";
    generatedAt = json.generatedAt;
  } catch (error) {
    return `리포트 파일을 읽지 못함(${firstLine(error)})`;
  }
  const at = Date.parse(generatedAt);
  const owners: string[] = [];
  for (const env of ["prod", "dev"] as const) {
    let runs: RunLog[];
    try {
      runs = await readRuns(runsPathFor(env, dataDir));
    } catch {
      continue;
    }
    for (const r of runs) {
      if (
        r.job === "weekly" &&
        Date.parse(r.startedAt) <= at &&
        at <= Date.parse(r.finishedAt)
      )
        owners.push(`${r.runId}(${env})`);
    }
  }
  return `생성 ${generatedAt} · runId ${owners.length > 0 ? owners.join(", ") : "실행 기록에서 찾지 못함"}`;
}

/** 주간 리포트 폴더의 파일 이름(없으면 []) — 그 밖의 읽기 오류는 던진다(가드 판정 불가 → 실행하지 않음) */
export async function listWeeklyReportFiles(
  rootDir: string,
): Promise<string[]> {
  try {
    return await readdir(path.join(rootDir, WEEKLY_REPORT_DIR));
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }
}

// ─── 단계 실행 ───────────────────────────────────────────────────────────

/** 단계 시간 상한 초과 — ctx.signal의 abort 사유이기도 하다 */
export class WeeklyStageTimeoutError extends Error {
  constructor(stageId: string, timeoutMs: number) {
    super(`단계 ${stageId}가 시간 상한 ${timeoutMs}ms를 넘었다`);
    this.name = "WeeklyStageTimeoutError";
  }
}

export type WeeklyStageOutcome = "success" | "failed" | "not-implemented";

export interface WeeklyStageResult {
  id: string;
  title: string;
  task: string;
  outcome: WeeklyStageOutcome;
  elapsedMs: number;
  /** 단계가 알린 산출물(저장소 상대 경로) */
  outputs: string[];
  counts?: Readonly<Record<string, number>>;
  note?: string;
  /** 실패 사유 한 줄(실패만) */
  error?: string;
  errorType?: "timeout" | "error";
}

/** 단계 문맥 중 러너가 단계마다 채우는 것(signal·logger)을 뺀 공통 부분 */
export type WeeklyBaseContext = Omit<WeeklyStageContext, "signal" | "logger">;

function firstLine(error: unknown): string {
  if (error instanceof Error) return error.message.split("\n")[0] ?? error.name;
  return String(error).split("\n")[0] ?? "";
}

/** path가 base 자신이거나 그 아래인가(저장소 상대 경로, `/` 구분) */
function isUnder(p: string, base: string): boolean {
  return p === base || p.startsWith(`${base}/`);
}

/** 단계 하나 — 예외·시간 초과를 결과로 바꾼다(던지지 않는다) */
async function runOneStage(
  stage: WeeklyStage,
  base: WeeklyBaseContext,
  logger: Logger,
): Promise<WeeklyStageResult> {
  const head = { id: stage.id, title: stage.title, task: stage.task };
  const log = logger.child({ stage: stage.id });
  if (stage.run === null) {
    log.info("weekly.stage.skip", {
      reason: "not-implemented",
      task: stage.task,
    });
    return { ...head, outcome: "not-implemented", elapsedMs: 0, outputs: [] };
  }
  const run = stage.run;
  const started = base.now().getTime();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new WeeklyStageTimeoutError(stage.id, stage.timeoutMs);
      controller.abort(error);
      reject(error);
    }, stage.timeoutMs);
  });
  log.info("weekly.stage.start", {
    task: stage.task,
    timeoutMs: stage.timeoutMs,
  });
  try {
    // 동기 throw도 거부된 Promise로 받는다
    const report = await Promise.race([
      Promise.resolve().then(() =>
        run({ ...base, signal: controller.signal, logger: log }),
      ),
      timeout,
    ]);
    const elapsedMs = base.now().getTime() - started;
    const outputs = [...(report?.outputs ?? [])];
    const undeclared = outputs.filter(
      (p) => !stage.writes.some((w) => isUnder(p, w)),
    );
    if (undeclared.length > 0) {
      // 실패 때 되돌릴 범위(writes) 밖에 썼다 — 이번엔 성공이라 그대로 두지만 등록을 고쳐야 한다
      log.warn("weekly.stage.outputs-undeclared", {
        paths: undeclared.slice(0, 10),
      });
    }
    log.info("weekly.stage.done", {
      elapsedMs,
      count: outputs.length,
      ...(report?.counts ? { counts: report.counts } : {}),
      ...(report?.note ? { note: report.note } : {}),
    });
    return {
      ...head,
      outcome: "success",
      elapsedMs,
      outputs,
      ...(report?.counts ? { counts: report.counts } : {}),
      ...(report?.note ? { note: report.note } : {}),
    };
  } catch (error) {
    const elapsedMs = base.now().getTime() - started;
    const errorType =
      error instanceof WeeklyStageTimeoutError ? "timeout" : "error";
    const message = firstLine(error);
    log.error("weekly.stage.fail", { errorType, error: message, elapsedMs });
    return {
      ...head,
      outcome: "failed",
      elapsedMs,
      outputs: [],
      error: message,
      errorType,
    };
  } finally {
    clearTimeout(timer);
    // 시간 초과가 아니어도 끝난 단계의 대기 작업은 멈추게 한다
    if (!controller.signal.aborted) controller.abort();
  }
}

/** 등록 순서대로 하나씩 실행 — 한 단계의 실패가 다음 단계를 막지 않는다 */
export async function runWeeklyStages(
  stages: readonly WeeklyStage[],
  base: WeeklyBaseContext,
  logger: Logger,
): Promise<WeeklyStageResult[]> {
  const results: WeeklyStageResult[] = [];
  for (const stage of stages) {
    results.push(await runOneStage(stage, base, logger));
  }
  return results;
}

// ─── 상태·기록·종료 코드 ─────────────────────────────────────────────────

export type WeeklyStatus = "success" | "partial" | "failed";

/** 머리 주석 ③ */
export function weeklyRunStatus(
  results: readonly WeeklyStageResult[],
): WeeklyStatus {
  const failed = results.filter((r) => r.outcome === "failed").length;
  const succeeded = results.filter((r) => r.outcome === "success").length;
  if (failed === 0) return "success";
  return succeeded > 0 ? "partial" : "failed";
}

/** 기록하는 상태 — dry는 skipped(발행하지 않은 실행) */
export function recordedWeeklyStatus(
  status: WeeklyStatus,
  dry: boolean,
): RunLog["status"] {
  return dry ? "skipped" : status;
}

/** 머리 주석 ④ — live만, dry는 LLM 결과가 있을 때만 */
export function shouldRecordWeeklyRun(input: {
  llmMode: LlmMode;
  dry: boolean;
  llmResultCount: number;
}): boolean {
  if (input.llmMode !== "live") return false;
  return !input.dry || input.llmResultCount > 0;
}

/** 머리 주석 ⑤ */
export function weeklyExitCode(input: {
  status: WeeklyStatus | "skipped" | "setup-failed";
  recordFailed: boolean;
}): 0 | 1 {
  if (input.recordFailed) return 1;
  return input.status === "failed" || input.status === "setup-failed" ? 1 : 0;
}

/** 실패한 단계의 writes(정렬·중복 제거) — Actions가 커밋 전에 되돌린다 */
export function discardPathsOf(
  stages: readonly WeeklyStage[],
  results: readonly WeeklyStageResult[],
): string[] {
  const failed = new Set(
    results.filter((r) => r.outcome === "failed").map((r) => r.id),
  );
  const paths = new Set<string>();
  for (const stage of stages) {
    if (failed.has(stage.id)) for (const p of stage.writes) paths.add(p);
  }
  return [...paths].sort();
}

/** 러너가 쓰는 실행 기록 파일 — 단계 writes에 넣을 수 없다 */
export const RUNNER_OWNED_PATHS = ["data/runs.json", "data/runs-dev.json"];

const WRITE_PATH =
  /^(?:data|public)\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

/** 단계 writes로 쓸 수 있는 경로인가 — data/·public/ 아래, `..`·공백 없음, 러너 소유 파일 아님(weekly.yml 셸도 같은 형식을 다시 본다) */
export function isWeeklyWritePath(p: string): boolean {
  return (
    WRITE_PATH.test(p) && !p.includes("..") && !RUNNER_OWNED_PATHS.includes(p)
  );
}

/** 등록 검사(순수) — id 형식·중복, writes 형식·단계 사이 겹침, 시간 상한. 문제 목록(없으면 []) */
export function checkWeeklyStages(stages: readonly WeeklyStage[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const owners: Array<{ path: string; id: string }> = [];
  for (const stage of stages) {
    if (!/^[a-z][a-z0-9-]*$/.test(stage.id) || stage.id.length > 40) {
      problems.push(`단계 id 형식: ${stage.id}`);
    }
    if (ids.has(stage.id)) problems.push(`단계 id 중복: ${stage.id}`);
    ids.add(stage.id);
    if (!Number.isInteger(stage.timeoutMs) || stage.timeoutMs <= 0) {
      problems.push(`${stage.id}: timeoutMs는 양의 정수`);
    }
    for (const p of stage.writes) {
      if (!isWeeklyWritePath(p)) problems.push(`${stage.id}: writes 경로 ${p}`);
      const other = owners.find(
        (o) => isUnder(p, o.path) || isUnder(o.path, p),
      );
      if (other && other.id !== stage.id) {
        problems.push(
          `${stage.id}: writes ${p}가 ${other.id}의 ${other.path}와 겹침`,
        );
      }
      owners.push({ path: p, id: stage.id });
    }
  }
  return problems;
}

// ─── 단계 출력 ───────────────────────────────────────────────────────────

/** weekly.yml이 참조하는 단계 출력 키(순서 = 출력 순서) */
export const WEEKLY_OUTPUT_KEYS = [
  "skipped",
  "week",
  "publish_date",
  "run_id",
  "status",
  "run_recorded",
  "failed_stages",
  "discard",
] as const;

export type WeeklyOutputKey = (typeof WEEKLY_OUTPUT_KEYS)[number];

export interface WeeklyStepOutputs {
  /** 가드가 건너뜀(검증·빌드·커밋도 건너뛴다) */
  skipped: boolean;
  week: string;
  publishDate: string;
  runId: string;
  /** 판정 상태 — 가드 skip은 skipped, 준비 실패는 failed */
  status: WeeklyStatus | "skipped";
  runRecorded: boolean;
  failedStages: readonly string[];
  discard: readonly string[];
}

/** 빈 값을 허용하는 키(실패 단계·되돌릴 경로가 없을 때) */
const OPTIONAL_OUTPUT_KEYS: ReadonlySet<WeeklyOutputKey> = new Set([
  "failed_stages",
  "discard",
]);

/** `$GITHUB_OUTPUT`에 덧붙일 문자열(key=value 줄). 줄바꿈·빈 필수 값·형식 밖 경로는 던진다(출력 주입 방지) */
export function formatWeeklyOutputs(o: WeeklyStepOutputs): string {
  for (const p of o.discard) {
    if (!isWeeklyWritePath(p)) {
      throw new Error(
        `weekly 단계 출력 discard에 형식 밖 경로가 있다 (${p.length}자)`,
      );
    }
  }
  const values: Record<WeeklyOutputKey, string> = {
    skipped: o.skipped ? "true" : "false",
    week: o.week,
    publish_date: o.publishDate,
    run_id: o.runId,
    status: o.status,
    run_recorded: o.runRecorded ? "true" : "false",
    failed_stages: o.failedStages.join(","),
    discard: o.discard.join(" "),
  };
  return WEEKLY_OUTPUT_KEYS.map((key) => {
    const value = values[key];
    if (
      /[\r\n]/.test(value) ||
      (value === "" && !OPTIONAL_OUTPUT_KEYS.has(key))
    ) {
      throw new Error(
        `weekly 단계 출력 ${key}가 비었거나 줄바꿈을 포함한다 — 출력하지 않는다`,
      );
    }
    return `${key}=${value}\n`;
  }).join("");
}

const OUTCOME_LABEL: Readonly<Record<WeeklyStageOutcome, string>> = {
  success: "성공",
  failed: "실패",
  "not-implemented": "미구현 — 건너뜀",
};

/** `$GITHUB_STEP_SUMMARY` 마크다운 — 단계별 결과 표 */
export function formatWeeklySummary(
  o: WeeklyStepOutputs,
  results: readonly WeeklyStageResult[],
  guardMessage: string,
): string {
  const cell = (v: string) => v.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  const lines = [
    "## 주간 작업 결과",
    "",
    "| 항목 | 값 |",
    "|---|---|",
    `| 주차 | ${cell(o.week)} |`,
    `| 실행 판단 | ${cell(guardMessage)} |`,
    `| runId | \`${cell(o.runId)}\` |`,
    `| 상태 | ${cell(o.status)} |`,
    `| 실행 기록 | ${o.runRecorded ? "기록함" : "기록 안 함"} |`,
  ];
  if (results.length > 0) {
    lines.push(
      "",
      "| 단계 | 작업 | 결과 | 소요 | 산출물 | 메모 |",
      "|---|---|---|---|---|---|",
      ...results.map(
        (r) =>
          `| ${cell(r.title)} (\`${r.id}\`) | ${cell(r.task)} | ${OUTCOME_LABEL[r.outcome]} | ${(r.elapsedMs / 1000).toFixed(1)}초 | ${r.outputs.length} | ${cell(r.error ?? r.note ?? "")} |`,
      ),
    );
  }
  if (o.discard.length > 0) {
    lines.push(
      "",
      `실패 단계 산출물 되돌림: ${o.discard.map((p) => `\`${p}\``).join(" ")}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

// ─── 실행 전체 ───────────────────────────────────────────────────────────

export interface RunWeeklyDeps {
  rootDir: string;
  dataDir: string;
  env: RunEnv;
  llmMode: LlmMode;
  dry: boolean;
  /** dev에서 data/에 쓴다(--write — effectiveWeeklyDry). 생략 = false(dev는 미리보기) */
  write?: boolean;
  force: boolean;
  /** 지정 주차(--week) — null이면 기본 */
  week: string | null;
  model: string;
  stages: readonly WeeklyStage[];
  now: () => Date;
  logger: Logger;
  print: (text: string) => void;
  /** 주간 리포트 폴더 파일 이름 — 기본 listWeeklyReportFiles(rootDir) */
  listReportFiles?: () => Promise<string[]>;
  /** 이미 있는 주간 리포트의 출처 한 줄 — 기본 describeWeeklyReportOrigin */
  describeReport?: (week: string) => Promise<string>;
  createLlm: () => LlmClient;
  /** DAILY_BUDGET_USD·MONTHLY_BUDGET_USD 해석(잘못된 값이면 던진다) */
  resolveBudgets: () => Budgets;
  /** 외부 HTTP(분석 블로그 피드 — M3-08). 생략하면 요청을 거부하는 fetch(테스트에서 네트워크를 쓰지 않게) */
  http?: { fetch: FetchLike; userAgent: string };
}

/** http를 주입하지 않은 실행의 fetch — 요청하면 거부한다 */
const NO_HTTP: FetchLike = () =>
  Promise.reject(new Error("외부 HTTP가 주입되지 않았다(RunWeeklyDeps.http)"));

export interface WeeklyOutcome {
  outputs: WeeklyStepOutputs;
  results: WeeklyStageResult[];
  guard: WeeklyGuardDecision | null;
  /** 준비 단계 오류(인자·설정·가드 판정 불가) — 있으면 단계는 돌지 않았다 */
  setupError: string | null;
  recordError: string | null;
  run: RunLog | null;
  exitCode: 0 | 1;
}

/** 대상 주차 → 가드 → 단계 → 실행 기록. 던지지 않는다(예상 밖 오류는 setupError·recordError로) */
export async function runWeekly(deps: RunWeeklyDeps): Promise<WeeklyOutcome> {
  const startedAt = nowUtcIso(deps.now());
  const runId = makeRunId({ env: deps.env, job: "weekly", startedAt });
  const publishDate = kstDate(startedAt);
  const log = deps.logger;
  const blank = (week: string): WeeklyStepOutputs => ({
    skipped: false,
    week,
    publishDate,
    runId,
    status: "failed",
    runRecorded: false,
    failedStages: [],
    discard: [],
  });
  const setupFailed = (week: string, error: string): WeeklyOutcome => {
    log.error("weekly.run.setup-fail", { runId, error });
    return {
      outputs: blank(week),
      results: [],
      guard: null,
      setupError: error,
      recordError: null,
      run: null,
      exitCode: weeklyExitCode({ status: "setup-failed", recordFailed: false }),
    };
  };

  const target = resolveTargetWeek(deps.week, startedAt);
  if (!target.ok) return setupFailed(deps.week ?? "unknown", target.error);
  const { week, range } = target.value;

  const problems = checkWeeklyStages(deps.stages);
  if (problems.length > 0) {
    return setupFailed(week, `단계 등록 오류: ${problems.join(" · ")}`);
  }
  try {
    getModelPricing(deps.model); // 단가 표에 없는 모델이면 단계 전에 멈춘다(기록할 수 없다)
  } catch (error) {
    return setupFailed(week, firstLine(error));
  }

  let publishedWeeks: string[];
  try {
    publishedWeeks = publishedWeeksOf(
      await (
        deps.listReportFiles ?? (() => listWeeklyReportFiles(deps.rootDir))
      )(),
    );
  } catch (error) {
    return setupFailed(
      week,
      `주간 리포트 폴더를 읽지 못해 재실행 가드를 판정할 수 없다: ${firstLine(error)}`,
    );
  }
  let guard = decideWeeklyGuard({ week, force: deps.force, publishedWeeks });
  if (publishedWeeks.includes(week)) {
    // 가드는 파일 존재 기준 그대로 — 출처(생성 시각·runId)만 덧붙인다(머리 주석 ①)
    const origin = await (
      deps.describeReport ??
      ((w: string) => describeWeeklyReportOrigin(deps.rootDir, deps.dataDir, w))
    )(week).catch((error: unknown) => `출처 확인 실패(${firstLine(error)})`);
    guard = { ...guard, message: `${guard.message} · 이미 있음 — ${origin}` };
    log.info("weekly.guard.existing", { week, force: deps.force, origin });
  }
  const effective = effectiveWeeklyDry({
    env: deps.env,
    dry: deps.dry,
    write: deps.write ?? false,
  });
  const dry = effective.dry;
  log.info("weekly.run.start", {
    runId,
    env: deps.env,
    week,
    dry,
    dryReason: effective.reason,
    force: deps.force,
    llmMode: deps.llmMode,
    guard: guard.reason,
    stages: deps.stages.length,
    implemented: deps.stages.filter((s) => s.run !== null).length,
  });
  if (Date.parse(range.to) >= Date.parse(startedAt)) {
    // 정기 실행(월 08:00 KST = 일 23:00 UTC) — UTC 일요일이 아직 남았다(머리 주석 ⓪). 원장 기준으로 집계한다
    log.warn("weekly.run.utc-week-open", {
      week,
      utcWeekEnd: range.to,
      remainingMinutes: Math.ceil(
        (Date.parse(range.to) + 1 - Date.parse(startedAt)) / 60_000,
      ),
    });
  }
  if (effective.reason === "dev-preview") {
    deps.print(
      "[weekly] 로컬(dev) 실행 — 미리보기(data/에 쓰지 않음, --dry와 같다). data/에 쓰려면 --write",
    );
  }
  if (!guard.run) {
    log.info("weekly.guard.skip", { week, reason: guard.reason });
    deps.print(`[weekly] ${guard.message}`);
    return {
      outputs: { ...blank(week), skipped: true, status: "skipped" },
      results: [],
      guard,
      setupError: null,
      recordError: null,
      run: null,
      exitCode: weeklyExitCode({ status: "skipped", recordFailed: false }),
    };
  }

  // 실행 시작 월 사용량 알림(dev 50% 경고 — CLAUDE.md §6.3) — LLM 단계가 구현돼 있고 live일 때만
  if (
    deps.llmMode === "live" &&
    deps.stages.some((s) => s.llm && s.run !== null)
  ) {
    await noticeMonthlyUsage({
      env: deps.env,
      logger: log,
      print: deps.print,
      dataDir: deps.dataDir,
      at: new Date(startedAt),
      resolveBudgets: deps.resolveBudgets,
    });
  }

  const llmResults: WeeklyBillableResult[] = [];
  const apiCalls: RunLog["apiCalls"] = { footballData: 0, apiFootball: 0 };
  const sources: RunSource[] = [];
  const costSoFar = () => costFromResults(deps.model, llmResults);
  const base: WeeklyBaseContext = {
    rootDir: deps.rootDir,
    dataDir: deps.dataDir,
    week,
    weekRange: range,
    env: deps.env,
    llmMode: deps.llmMode,
    dry,
    force: deps.force,
    runId,
    startedAt,
    now: deps.now,
    print: deps.print,
    llm: {
      model: deps.model,
      createClient: deps.createLlm,
      addResults: (results) => {
        for (const r of results) llmResults.push(r);
      },
      costSoFar,
    },
    budget: {
      check: (estimatedUsd) =>
        checkBudgetFromFiles({
          env: deps.env,
          estimatedUsd: estimatedUsd + costSoFar(),
          now: new Date(startedAt),
          dataDir: deps.dataDir,
          budgets: deps.resolveBudgets(),
        }),
    },
    apiCalls: {
      add: (calls) => {
        apiCalls.footballData += calls.footballData ?? 0;
        apiCalls.apiFootball += calls.apiFootball ?? 0;
      },
    },
    http: deps.http ?? { fetch: NO_HTTP, userAgent: feedUserAgent(undefined) },
    sources: {
      add: (entries) => {
        for (const e of entries) sources.push(e);
      },
    },
  };

  const results = await runWeeklyStages(deps.stages, base, log);
  const status = weeklyRunStatus(results);
  const failedStages = results
    .filter((r) => r.outcome === "failed")
    .map((r) => r.id);
  const discard = discardPathsOf(deps.stages, results);

  let run: RunLog | null = null;
  let recordError: string | null = null;
  let runRecorded = false;
  const recordInput = {
    env: deps.env,
    job: "weekly" as const,
    model: deps.model,
    startedAt,
    finishedAt: nowUtcIso(deps.now()),
    runId,
    results: llmResults,
    status: recordedWeeklyStatus(status, dry),
    apiCalls,
    // 분석 블로그 소스별 결과(M3-08 — 주간 건강도 근거). 없으면 넣지 않는다(기본 [])
    ...(sources.length > 0 ? { sources } : {}),
    dataDir: deps.dataDir,
    now: deps.now(),
  };
  try {
    if (
      shouldRecordWeeklyRun({
        llmMode: deps.llmMode,
        dry,
        llmResultCount: llmResults.length,
      })
    ) {
      run = (await recordRun(recordInput)).run;
      runRecorded = true;
    } else {
      run = buildRunLog(recordInput);
    }
  } catch (error) {
    recordError = firstLine(error);
    log.error("weekly.run.record-fail", { runId, error: recordError });
  }

  log.info("weekly.run.done", {
    runId,
    week,
    status,
    succeeded: results.filter((r) => r.outcome === "success").length,
    failed: failedStages.length,
    notImplemented: results.filter((r) => r.outcome === "not-implemented")
      .length,
    elapsedMs: Date.parse(nowUtcIso(deps.now())) - Date.parse(startedAt),
    costUsd: run?.costUsd ?? costSoFar(),
    runRecorded,
    ...(discard.length > 0 ? { discard } : {}),
  });

  return {
    outputs: {
      skipped: false,
      week,
      publishDate,
      runId,
      status,
      runRecorded,
      failedStages,
      discard,
    },
    results,
    guard,
    setupError: null,
    recordError,
    run,
    exitCode: weeklyExitCode({ status, recordFailed: recordError !== null }),
  };
}
