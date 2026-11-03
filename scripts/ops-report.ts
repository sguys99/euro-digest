/**
 * 운영 리포트 진입점 (M5-09 — PRD FR-155, CLAUDE.md §12) — 주간 운영 리포트(비용·실행 성공률·브리핑·소스 건강도·미등록 고유명사)를
 * 코드로 만들어(LLM 미사용) 미리 보거나 GitHub 이슈로 낸다. 정기 운영에서는 월요일 weekly.yml의 주간 작업 단계 ④(scripts/lib/
 * ops-report-stage.ts)가 같은 계산으로 payload를 쓰고 다음 워크플로 단계가 이슈를 만든다 — 이 CLI는 로컬 확인·수동 재생성용이다.
 *
 *   npm run ops-report -- --dry                  # 지난 주(KST) 리포트 제목·본문만 출력 — 네트워크 없음
 *   npm run ops-report -- --week 2026-44 --dry   # 지정 주차
 *   GITHUB_TOKEN=… GITHUB_REPOSITORY=sguys99/euro-digest npm run ops-report -- --week 2026-44
 *                                                # 이슈 생성(같은 주차 열린 이슈가 있으면 본문 교체 — 멱등)
 *
 * 수치는 그 주 KST 일요일 끝까지의 기록만 쓴다(재실행해도 같다 — scripts/lib/ops-report.ts 머리 주석). 월 예산은 MONTHLY_BUDGET_USD
 * (기본 3). 환경변수 값·토큰은 출력하지 않는다. 종료 코드: 성공 0 · 인자·입력·이슈 API 오류 1.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { nowUtcIso } from "@/lib/time";

import { resolveBudgets } from "./lib/cost";
import { IssueReportError, reportIssue } from "./lib/github-issues";
import { createLogger } from "./lib/logger";
import {
  OPS_REPORT_USAGE,
  buildOpsReportPayload,
  parseOpsReportArgs,
} from "./lib/ops-report";
import {
  formatOpsReportPreview,
  loadOpsReportInput,
} from "./lib/ops-report-stage";
import { formatReportResult, readReportEnv } from "./lib/report-issue-cli";
import { resolveTargetWeek } from "./lib/weekly-run";

const TAG = "[ops-report]";
const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function main(): Promise<number> {
  const parsed = parseOpsReportArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`${TAG} 인자 오류: ${parsed.error}\n\n${OPS_REPORT_USAGE}`);
    return 1;
  }
  const args = parsed.value;
  if (args.help) {
    console.log(OPS_REPORT_USAGE);
    return 0;
  }
  const now = new Date();
  const target = resolveTargetWeek(args.week, nowUtcIso(now));
  if (!target.ok) {
    console.error(`${TAG} 주차 오류: ${target.error}`);
    return 1;
  }
  let monthlyBudget: number;
  try {
    monthlyBudget = resolveBudgets(process.env).monthlyBudgetUsd;
  } catch (error) {
    console.error(
      `${TAG} 설정 오류: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
  const input = await loadOpsReportInput({
    dataDir: path.join(ROOT_DIR, "data"),
    week: target.value.week,
    monthlyBudget,
    now,
  });
  const report = buildOpsReportPayload(input);
  if (args.dry) {
    console.log(formatOpsReportPreview(report, now));
    return 0;
  }
  const env = readReportEnv(process.env);
  if (!env.repo || !env.token) {
    console.error(
      `${TAG} 이슈를 만들려면 GITHUB_TOKEN(또는 GH_TOKEN)과 GITHUB_REPOSITORY가 필요합니다 — 미리보기는 --dry`,
    );
    return 1;
  }
  try {
    const result = await reportIssue({
      kind: "ops-report",
      payload: report.payload,
      repo: env.repo,
      token: env.token,
      ...(env.apiUrl ? { apiUrl: env.apiUrl } : {}),
      now: () => now,
      logger: createLogger({ scope: "issues" }),
    });
    console.log(formatReportResult(result));
    return 0;
  } catch (error) {
    if (!(error instanceof IssueReportError)) throw error;
    console.error(`${TAG} 이슈 보고 실패: ${error.message}`);
    return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(
      `${TAG} 예상 밖 오류: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
    );
    process.exit(1);
  },
);
