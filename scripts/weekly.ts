/**
 * `npm run weekly` 진입점 — 매주 월요일 08:00 KST weekly.yml이 실행 (M3-06 — PRD FR-90, §10, CLAUDE.md §5·§6.1).
 * 한국 선수 주간 리포트(M3-07) · 분석 블로그(M3-08) · 팀 프로필(M4-06) · 운영 리포트(M5-09)를 단계별 실패 격리로 돌린다.
 * 단계 등록은 scripts/lib/weekly-stages.ts, 본체(가드·실행·상태·기록)는 scripts/lib/weekly-run.ts. 이 파일은 인자·환경변수를 읽어
 * 의존성을 꾸리고, 단계 출력·요약을 쓰고, 종료 코드만 정한다.
 *
 *   npm run weekly -- --dry          # data/에 쓰지 않음 — 분석 블로그 단계(M3-08)는 dry여도 피드를 실제로 받는다(LLM 없음)
 *   npm run weekly -- --write        # 로컬(dev)에서 data/에 쓴다 — 없으면 로컬 실행은 --dry와 같은 미리보기(Actions는 항상 씀)
 *   npm run weekly -- --force        # 그 주차 주간 리포트가 이미 있어도 실행
 *   npm run weekly -- --week 2026-44 # 지난 주차 지정
 *   npm run weekly -- --only team-profiles --force --write  # 개발용 — 그 단계만
 *
 * 환경변수는 package.json의 `node --env-file-if-exists=.env.local`이 로컬에서만 채운다(CI는 Actions가 주입). 값은 읽기만 하고
 * 출력하지 않는다. Actions(GITHUB_ACTIONS=true) = prod → data/runs.json, 로컬 = dev → data/runs-dev.json.
 * GITHUB_OUTPUT·GITHUB_STEP_SUMMARY(Actions 기본 제공): 끝나면 성공·실패와 상관없이 단계 출력(weekly-run.ts WEEKLY_OUTPUT_KEYS)과
 * 요약을 쓴다. 단계 출력을 쓰지 못하면 exit 1(뒤 단계가 건너뛸지·되돌릴 경로를 모른다).
 * 단계에 시간 상한이 걸려 끝나지 않은 작업이 남아 있을 수 있어 마지막에 process.exit로 끝낸다.
 */
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveBudgets } from "./lib/cost";
import { createLlmClient, resolveLlmModel } from "./lib/llm";
import { createLogger } from "./lib/logger";
import { feedUserAgent } from "./lib/rss";
import {
  WEEKLY_USAGE,
  formatWeeklyOutputs,
  formatWeeklySummary,
  parseWeeklyArgs,
  resolveWeeklyEnv,
  runWeekly,
} from "./lib/weekly-run";
import { WEEKLY_STAGES } from "./lib/weekly-stages";

const parsed = parseWeeklyArgs(process.argv.slice(2), process.env.LLM_MODE);
if (!parsed.ok) {
  console.error(`[weekly] 인자 오류: ${parsed.error}\n\n${WEEKLY_USAGE}`);
  process.exit(1);
}
const args = parsed.value;
if (args.help) {
  console.log(WEEKLY_USAGE);
  process.exit(0);
}

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const logger = createLogger({ scope: "weekly" });

async function main(): Promise<number> {
  const env = process.env;
  let model: string;
  try {
    model = resolveLlmModel(env);
  } catch (error) {
    console.error(
      `[weekly] 설정 오류: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
  // --only(개발용): 그 단계만 — 없는 id면 멈춘다
  const stages =
    args.only === null
      ? WEEKLY_STAGES
      : WEEKLY_STAGES.filter((s) => s.id === args.only);
  if (stages.length === 0) {
    console.error(
      `[weekly] --only ${args.only}: 등록된 단계가 아닙니다 (${WEEKLY_STAGES.map((s) => s.id).join(", ")})`,
    );
    return 1;
  }
  const outcome = await runWeekly({
    rootDir: ROOT_DIR,
    dataDir: path.join(ROOT_DIR, "data"),
    env: resolveWeeklyEnv(env),
    llmMode: args.llmMode,
    dry: args.dry,
    write: args.write,
    force: args.force,
    week: args.week,
    model,
    stages,
    now: () => new Date(),
    logger,
    print: (text) => console.log(text),
    createLlm: () => createLlmClient({ mode: args.llmMode, model, env }),
    resolveBudgets: () => resolveBudgets(env),
    // 분석 블로그 피드(M3-08) — User-Agent 연락처는 CONTACT_EMAIL(비밀값 아님)
    http: {
      fetch: (input, init) => fetch(input, init),
      userAgent: feedUserAgent(env.CONTACT_EMAIL),
    },
    // 운영 리포트 이슈 payload(M5-09) — weekly.yml이 $RUNNER_TEMP/ops-report.json을 준다. 로컬은 비워 두면 출력만
    opsReportFile: env.OPS_REPORT_FILE?.trim() || null,
  });

  for (const r of outcome.results) {
    const tail = r.error ?? r.note ?? "";
    console.log(
      `[weekly] ${r.id} (${r.task}) — ${r.outcome}${tail ? ` · ${tail}` : ""}`,
    );
  }
  if (outcome.setupError) {
    console.error(`[weekly] 준비 실패: ${outcome.setupError}`);
  }
  if (outcome.outputs.discard.length > 0 && env.GITHUB_ACTIONS !== "true") {
    console.warn(
      `[weekly] 실패한 단계의 산출물 경로(Actions에서는 커밋 전에 되돌림): ${outcome.outputs.discard.join(" ")}`,
    );
  }

  let exitCode: number = outcome.exitCode;
  const outputFile = env.GITHUB_OUTPUT?.trim() || null;
  if (outputFile) {
    try {
      appendFileSync(outputFile, formatWeeklyOutputs(outcome.outputs), "utf8");
    } catch (error) {
      console.error(
        `[weekly] 단계 출력 쓰기 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      exitCode = 1;
    }
  }
  const summaryFile = env.GITHUB_STEP_SUMMARY?.trim() || null;
  if (summaryFile) {
    try {
      appendFileSync(
        summaryFile,
        formatWeeklySummary(
          outcome.outputs,
          outcome.results,
          outcome.guard?.message ?? outcome.setupError ?? "",
        ),
        "utf8",
      );
    } catch {
      console.warn("[weekly] Step Summary 쓰기 실패 — 계속합니다");
    }
  }
  return exitCode;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(
      `[weekly] 예상 밖 오류: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  },
);
