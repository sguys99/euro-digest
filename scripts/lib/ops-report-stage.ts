/**
 * 주간 작업 단계 ④ 운영 리포트 (M5-09 — PRD FR-155, scripts/lib/weekly-stages.ts 등록) + `npm run ops-report`가 함께 쓰는 입력 읽기.
 *
 * - 입력: data/runs.json · data/runs-dev.json(cost.ts `loadRuns` — 깨졌으면 던진다: 실행 기록 없이 운영 리포트는 의미가 없다 →
 *   단계 실패로 격리) · data/briefs/<그 주 발행일>.json(@/lib/data/brief `loadBrief` — 날짜별로 잡아 '읽기 실패'로 싣는다) ·
 *   data/cache/unknown-names.json(unknown-names.ts `readUnknownNames` — 던지지 않는다).
 * - 계산·본문: scripts/lib/ops-report.ts(순수 — LLM 0, 네트워크 0).
 * - 출력: **이슈는 이 단계에서 만들지 않는다**(쓰기 토큰을 서드파티 코드가 도는 주간 작업 단계에 넘기지 않는다 — weekly-stages.ts
 *   ④ 주석). dry(또는 로컬 미리보기)면 이슈 제목·본문을 출력만 하고, 아니면 payload를 `ctx.opsReportFile`(weekly.yml이
 *   `$RUNNER_TEMP/ops-report.json`으로 준다)에 쓴다 → weekly.yml '운영 리포트 이슈 보고' 단계가
 *   `scripts/report-issue.ts --kind ops-report --payload-file`로 이슈를 만들거나 같은 주차 열린 이슈의 본문을 바꾼다
 *   (github-issues.ts RECURRENCE_POLICY "update" — 멱등). data/에는 쓰지 않는다(`writes: []`).
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { loadBrief } from "@/lib/data/brief";
import { datesBetween } from "@/lib/ops-metrics";

import { DEFAULT_MONTHLY_BUDGET_USD, loadRuns } from "./cost";
import { buildIssue } from "./github-issues";
import {
  buildOpsReportPayload,
  opsReportWindow,
  type OpsBriefDay,
  type OpsReport,
  type OpsReportInput,
} from "./ops-report";
import { readUnknownNames } from "./unknown-names";
import type { WeeklyStageContext, WeeklyStageReport } from "./weekly-stages";

function firstLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split("\n")[0] ?? "";
}

/** 운영 리포트 입력 읽기 — 실행 기록이 깨졌으면 던진다(머리 주석) */
export async function loadOpsReportInput(input: {
  dataDir: string;
  week: string;
  monthlyBudget: number;
  now: Date;
}): Promise<OpsReportInput> {
  const window = opsReportWindow(input.week);
  const { prodRuns, devRuns } = await loadRuns(input.dataDir);
  const briefsDir = path.join(input.dataDir, "briefs");
  const briefs: OpsBriefDay[] = datesBetween(window.from, window.to).map(
    (date) => {
      try {
        return { date, brief: loadBrief(date, briefsDir), error: null };
      } catch (error) {
        return { date, brief: null, error: firstLine(error) };
      }
    },
  );
  const names = await readUnknownNames(input.dataDir);
  return {
    week: input.week,
    prodRuns,
    devRuns,
    briefs,
    unknownNames: { file: names.value, error: names.error },
    monthlyBudget: input.monthlyBudget,
    now: input.now,
  };
}

/** 미리보기 출력 — 이슈 제목·본문(buildIssue — 실제 이슈와 같은 틀) */
export function formatOpsReportPreview(report: OpsReport, now: Date): string {
  const issue = buildIssue("ops-report", report.payload, { now });
  return [
    `[ops-report] 미리보기 — ${report.window.issueWeek} (${report.window.from} ~ ${report.window.to}) · 이슈를 만들지 않음`,
    `  제목: ${issue.title}`,
    `  원인: ${issue.key} · fingerprint ${issue.fingerprint} · 라벨 ${issue.labels.join(", ")}`,
    "──── 이슈 본문 ────",
    issue.body,
    "──────────────────",
  ].join("\n");
}

/** 주간 작업 단계 ④ (weekly-stages.ts) */
export async function runOpsReport(
  ctx: WeeklyStageContext,
): Promise<WeeklyStageReport> {
  const now = ctx.now();
  const monthlyBudget =
    ctx.budget.limits?.().monthlyBudgetUsd ?? DEFAULT_MONTHLY_BUDGET_USD;
  const input = await loadOpsReportInput({
    dataDir: ctx.dataDir,
    week: ctx.week,
    monthlyBudget,
    now,
  });
  const report = buildOpsReportPayload(input);
  const unreadableBriefs = input.briefs.filter((b) => b.error !== null).length;
  ctx.logger.info("weekly.ops-report.built", {
    week: report.window.issueWeek,
    ...report.counts,
    unreadableBriefs,
    unknownNamesError: input.unknownNames.error !== null,
  });
  const file = ctx.opsReportFile ?? null;
  if (ctx.dry || file === null) {
    ctx.print(formatOpsReportPreview(report, now));
    return {
      counts: report.counts,
      note: ctx.dry
        ? "dry — 이슈 payload를 쓰지 않음(출력만)"
        : "OPS_REPORT_FILE 없음 — 이슈 payload를 쓰지 않음(출력만)",
    };
  }
  await writeFile(file, `${JSON.stringify(report.payload, null, 2)}\n`, "utf8");
  ctx.logger.info("weekly.ops-report.payload", {
    week: report.window.issueWeek,
    sections: report.payload.sections?.length ?? 0,
  });
  return {
    counts: report.counts,
    note: `이슈 payload 기록 — ${report.window.issueWeek} (다음 워크플로 단계가 이슈 생성·갱신)`,
  };
}
