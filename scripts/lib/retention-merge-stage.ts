/**
 * 수집 실행의 월별 병합 단계 `retention-merge` (PRD FR-158·§8.4, plan M5-10 — 2026-11-03 사용자 결정 A안·T1).
 * 계획은 news-retention.ts 순수 함수, 이 파일은 읽기·쓰기·로그만 맡는다.
 *
 * 위치: `runCollect`가 **원본 삭제(purge) 단계 바로 뒤, 뉴스 단계 전에** 부른다(collect-run.ts). 삭제 요청·보존 기간 정리가 끝난 일별
 * 파일을 합치고, 뉴스 단계는 오늘 파일(일별)만 쓰므로 서로 겹치지 않는다. 합친 결과는 그날 발행 커밋(`git add -A -- data public`)에
 * 일별 파일 삭제와 함께 들어간다. 검증·빌드가 실패하면 뉴스 변경분이 커밋되지 않으므로(D49) 다음 실행이 다시 합친다.
 *
 * 순서(달마다 — 한 달의 실패는 그 달만)
 *   ① data/news 목록 → 합칠 때가 된 달(그 달 말일 + 90일 ≤ 오늘 KST 발행일, news-retention.ts `planMonthMerges`).
 *   ② 그 달 일별 파일 읽기(검증 + date = 파일명) · 기존 월별 파일 읽기 — 하나라도 깨졌으면 그 달을 건너뛴다(검증 게이트가 잡는다).
 *   ③ 병합(`mergeMonthFile`) — 같은 날짜가 양쪽에 있으면 충돌로 건너뛴다.
 *   ④ dry면 계획만 출력.
 *   ⑤ 월별 파일 쓰기(원자적) → 일별 파일 지우기. 지우다 실패하면 **되돌린다**(지운 일별 파일을 원래 바이트로 다시 쓰고 월별 파일을
 *      이전 내용으로 — 없었으면 지움). 같은 날짜가 양쪽에 남은 채로 두면 로더가 빌드를 멈추기 때문이다.
 *
 * 실패 정책 — **발행을 멈추지 않는다**. 던지지 않고, 실행 상태도 바꾸지 않는다(병합은 늦어져도 공개 사이트·카드에 영향이 없다 —
 * 일별 파일이 그대로 남을 뿐). 오류는 로그와 Actions 오류 주석(prod)으로 드러나고 다음 실행이 다시 시도한다.
 */
import * as fsPromises from "node:fs/promises";

import type { NewsFile, NewsMonthFile, RunEnv } from "@/lib/schema";
import { kstDate, nowUtcIso } from "@/lib/time";

import { annotate, type Logger } from "./logger";
import {
  listNewsDir,
  newsMonthFilePath,
  readNewsMonthFile,
  writeNewsMonthFile,
} from "./news-month-file";
import { newsFilePath, readNewsFile } from "./news-file";
import {
  mergeMonthFile,
  monthMergeDate,
  planMonthMerges,
  type MonthMergeTarget,
} from "./news-retention";

export interface RetentionMergeDeps {
  /** data/ 폴더 */
  dataDir: string;
  env: RunEnv;
  dry: boolean;
  /** 월별 파일 updatedAt 시계 */
  now: () => Date;
  logger: Logger;
  print: (text: string) => void;
  /** 일별 파일 지우기 — 기본 fs.rm(테스트에서 실패를 끼워 넣어 되돌리기를 확인한다) */
  removeFile?: (file: string) => Promise<void>;
}

export interface RetentionMergeError {
  step:
    | "list"
    | "read"
    | "conflict"
    | "write"
    | "remove"
    | "rollback"
    | "unexpected";
  month?: string;
  date?: string;
  error: string;
}

export interface RetentionMergeOutcome {
  /** done = 합칠 것을 합쳤다(일부 달 실패 포함 — errors) 또는 합칠 것이 없다 · dry = 계획만 출력 */
  state: "done" | "dry";
  /** 기준 KST 발행일 */
  today: string;
  /** 합칠 때가 된 달과 그 일별 날짜 */
  due: MonthMergeTarget[];
  /** 합친 달(dry면 합쳤을 달)과 옮긴 날짜 */
  merged: Array<{ month: string; dates: string[] }>;
  /** 남은 일별 파일 중 가장 이른 달의 병합 시작일(없으면 null) — dry·로그 참고용 */
  nextMergeDate: string | null;
  errors: RetentionMergeError[];
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "")
    : String(error);
}

/** 병합 단계 — 머리 주석 순서. 던지지 않는다 */
export async function runRetentionMergeStage(
  deps: RetentionMergeDeps,
  ctx: { startedAt: string },
): Promise<RetentionMergeOutcome> {
  const today = kstDate(ctx.startedAt);
  try {
    return finish(deps, await merge(deps, today));
  } catch (error) {
    deps.logger.error("collect.retention.fail", {
      stage: "unexpected",
      error: errorText(error),
    });
    return finish(deps, {
      state: deps.dry ? "dry" : "done",
      today,
      due: [],
      merged: [],
      nextMergeDate: null,
      errors: [{ step: "unexpected", error: errorText(error) }],
    });
  }
}

async function merge(
  deps: RetentionMergeDeps,
  today: string,
): Promise<RetentionMergeOutcome> {
  const log = deps.logger;
  const startMs = Date.now();
  const errors: RetentionMergeError[] = [];
  const state = deps.dry ? "dry" : "done";

  // ① 목록 · 계획
  let daily: string[] = [];
  try {
    daily = (await listNewsDir(deps.dataDir)).daily;
  } catch (error) {
    errors.push({ step: "list", error: errorText(error) });
    log.error("collect.retention.read", {
      stage: "list",
      error: errorText(error),
    });
  }
  const due = planMonthMerges(daily, today);
  const merged: RetentionMergeOutcome["merged"] = [];
  const dueMonths = new Set(due.map((d) => d.month));
  const remaining = daily.filter((d) => !dueMonths.has(d.slice(0, 7)));
  const firstMonth = remaining[0]?.slice(0, 7);
  const nextMergeDate =
    firstMonth === undefined ? null : monthMergeDate(firstMonth);

  for (const target of due) {
    const result = await mergeOne(deps, target, errors);
    if (result) merged.push({ month: target.month, dates: result });
  }

  const fields = {
    today,
    dailyFiles: daily.length,
    dueMonths: due.length,
    dueFiles: due.reduce((n, d) => n + d.dates.length, 0),
    mergedMonths: merged.length,
    mergedFiles: merged.reduce((n, m) => n + m.dates.length, 0),
    nextMergeDate,
    errors: errors.length,
    elapsedMs: Date.now() - startMs,
  };
  if (deps.dry) {
    if (merged.length === 0) {
      deps.print(
        `── [dry] data/news 월별 병합 — 대상 없음(일별 ${daily.length}개${nextMergeDate ? ` · 다음 병합 ${firstMonth} → ${nextMergeDate}` : ""})`,
      );
    } else {
      deps.print(
        `── [dry] data/news 월별 병합 — ${merged.length}달 · 일별 ${fields.mergedFiles}개 — 쓰지 않음`,
      );
      for (const m of merged) {
        deps.print(
          `   ${m.month}.json ← ${m.dates.length}개(${m.dates[0]} ~ ${m.dates.at(-1)})`,
        );
      }
    }
    log.info("collect.retention.dry", fields);
  } else {
    log.info("collect.retention.done", fields);
  }
  return { state, today, due, merged, nextMergeDate, errors };
}

/** 한 달 병합(②~⑤). 옮긴 날짜(dry면 옮겼을 날짜)를 돌려주고, 실패면 null(errors에 남김) */
async function mergeOne(
  deps: RetentionMergeDeps,
  target: MonthMergeTarget,
  errors: RetentionMergeError[],
): Promise<string[] | null> {
  const log = deps.logger;
  const { month } = target;
  const monthPath = newsMonthFilePath(deps.dataDir, month);

  // ② 읽기 — 원래 바이트도 둔다(되돌리기용)
  const issues: NewsFile[] = [];
  const rawDaily = new Map<string, string>();
  let existing: NewsMonthFile | null;
  let rawMonth: string | null;
  try {
    for (const date of target.dates) {
      const filePath = newsFilePath(deps.dataDir, date);
      const raw = await fsPromises.readFile(filePath, "utf8");
      const file = await readNewsFile(filePath);
      if (file === null) throw new Error(`${date}.json이 사라짐`);
      if (file.date !== date) {
        throw new Error(`${date}.json: date(${file.date})가 파일명과 다름`);
      }
      issues.push(file);
      rawDaily.set(date, raw);
    }
    existing = await readNewsMonthFile(monthPath);
    rawMonth =
      existing === null ? null : await fsPromises.readFile(monthPath, "utf8");
  } catch (error) {
    errors.push({ step: "read", month, error: errorText(error) });
    log.warn("collect.retention.read", { month, error: errorText(error) });
    return null;
  }

  // ③ 병합
  const result = mergeMonthFile({
    month,
    existing,
    daily: issues,
    updatedAt: nowUtcIso(deps.now()),
  });
  if (!result.ok) {
    const error = `같은 날짜가 일별·월별 파일에 함께 있음: ${result.conflicts.join(", ")}`;
    errors.push({ step: "conflict", month, error });
    log.error("collect.retention.conflict", {
      month,
      dates: result.conflicts,
    });
    return null;
  }

  // ④ dry
  if (deps.dry) return result.added;

  // ⑤ 쓰기 → 지우기 (실패하면 되돌리기)
  try {
    await writeNewsMonthFile(monthPath, result.file);
  } catch (error) {
    errors.push({ step: "write", month, error: errorText(error) });
    log.error("collect.retention.fail", {
      month,
      stage: "write",
      error: errorText(error),
    });
    return null;
  }
  const removed: string[] = [];
  for (const date of result.added) {
    try {
      await (deps.removeFile ?? ((file) => fsPromises.rm(file)))(
        newsFilePath(deps.dataDir, date),
      );
      removed.push(date);
    } catch (error) {
      errors.push({ step: "remove", month, date, error: errorText(error) });
      log.error("collect.retention.fail", {
        month,
        date,
        stage: "remove",
        error: errorText(error),
      });
      await rollback(
        deps,
        { month, monthPath, rawMonth, rawDaily, removed },
        errors,
      );
      return null;
    }
  }
  log.info("collect.retention.write", {
    month,
    issues: result.file.issues.length,
    added: result.added.length,
    from: result.added[0] ?? null,
    to: result.added.at(-1) ?? null,
  });
  return result.added;
}

async function rollback(
  deps: RetentionMergeDeps,
  state: {
    month: string;
    monthPath: string;
    rawMonth: string | null;
    rawDaily: ReadonlyMap<string, string>;
    removed: readonly string[];
  },
  errors: RetentionMergeError[],
): Promise<void> {
  try {
    for (const date of state.removed) {
      const raw = state.rawDaily.get(date);
      if (raw !== undefined) {
        await fsPromises.writeFile(
          newsFilePath(deps.dataDir, date),
          raw,
          "utf8",
        );
      }
    }
    if (state.rawMonth === null) {
      await fsPromises.rm(state.monthPath, { force: true });
    } else {
      await fsPromises.writeFile(state.monthPath, state.rawMonth, "utf8");
    }
    deps.logger.warn("collect.retention.rollback", {
      month: state.month,
      restored: state.removed.length,
    });
  } catch (error) {
    errors.push({
      step: "rollback",
      month: state.month,
      error: errorText(error),
    });
    deps.logger.error("collect.retention.rollback", {
      month: state.month,
      error: errorText(error),
      action:
        "같은 날짜가 일별·월별 파일에 함께 남았을 수 있음 — 검증 게이트·빌드가 커밋을 막는다",
    });
  }
}

/** 오류가 있으면 prod는 Actions 오류 주석 — 발행은 계속 */
function finish(
  deps: RetentionMergeDeps,
  result: RetentionMergeOutcome,
): RetentionMergeOutcome {
  if (result.errors.length > 0 && deps.env === "prod") {
    const steps = [...new Set(result.errors.map((e) => e.step))].join("·");
    annotate(
      "error",
      `data/news 월별 병합 오류 ${result.errors.length}건(${steps}). 일별 파일은 그대로 두고 발행은 계속한다 — 다음 수집 실행이 다시 시도한다`,
      { title: "data/news 월별 병합 (FR-158)" },
      { ci: true, write: deps.print },
    );
  }
  return result;
}

/**
 * 실행 요약 로그(`collect.done`) 한 칸 — `<state>:months<n>/files<m>`, 오류가 있으면 `/errors<k>`.
 * 예) `done:months0/files0` · `done:months1/files31` · `dry:months1/files31` · `done:months0/files0/errors1`
 */
export function retentionMergeSummary(
  outcome: Pick<RetentionMergeOutcome, "state" | "merged" | "errors">,
): string {
  const files = outcome.merged.reduce((n, m) => n + m.dates.length, 0);
  const errors =
    outcome.errors.length > 0 ? `/errors${outcome.errors.length}` : "";
  return `${outcome.state}:months${outcome.merged.length}/files${files}${errors}`;
}
