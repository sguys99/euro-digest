/**
 * `npm run eval:prompt` 진입점 — 브리핑 골든셋 회귀 평가 (M1-24, CLAUDE.md §6.3·PRD §9.2).
 * 프롬프트 수정 전후 출력 diff·사실성 검사(M1-23) 결과를 비교한다. 기본은 실제 LLM 호출(골든셋 10요청, dev) → data/runs-dev.json 기록.
 * 흐름·옵션은 scripts/lib/eval-prompt-run.ts. `--mock`(fixtures)·`--dry`(예상만)·`--limit`·`--dates`로 줄인다.
 * `--team-profile`이면 팀 프로필 골든 10팀(M4-06 — scripts/lib/team-profile-eval.ts)으로 나뉜다(인자·흐름이 달라 먼저 나눈다).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EVAL_USAGE,
  parseEvalArgs,
  runEvalPrompt,
} from "./lib/eval-prompt-run";
import { createLlmClient, resolveLlmModel } from "./lib/llm";
import { createLogger } from "./lib/logger";
import {
  TEAM_EVAL_USAGE,
  parseTeamEvalArgs,
  runTeamProfileEval,
} from "./lib/team-profile-eval";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const env = process.env;
const logger = createLogger({ scope: "eval-prompt", minLevel: "warn" });

/** 개발자 도구 — 봇(Actions)에서 실호출하지 않는다(dev 비용 기록 전제) */
function refuseLiveInActions(live: boolean): void {
  if (live && env.GITHUB_ACTIONS === "true") {
    console.error(
      "eval:prompt 실호출은 로컬 dev 전용이다 — Actions에서는 --mock 또는 --dry",
    );
    process.exit(1);
  }
}

/** 브리핑 골든셋(M1-24) */
async function briefMain(): Promise<number> {
  const parsed = parseEvalArgs(process.argv.slice(2), env.LLM_MODE);
  if (!parsed.ok) {
    console.error(parsed.error);
    console.error(EVAL_USAGE);
    return 1;
  }
  const args = parsed.value;
  if (args.help) {
    console.log(EVAL_USAGE);
    return 0;
  }
  refuseLiveInActions(args.llmMode === "live" && !args.dry);
  const model = resolveLlmModel(env);
  const outcome = await runEvalPrompt({
    rootDir: ROOT_DIR,
    dataDir: path.join(ROOT_DIR, "data"),
    args,
    env,
    model,
    createLlm: (m) => createLlmClient({ mode: args.llmMode, model: m, env }),
    now: () => new Date(),
    clock: () => performance.now(),
    logger,
    print: (text) => console.log(text),
  });
  return outcome.exitCode;
}

/** 팀 프로필 골든 10팀(M4-06) */
async function teamProfileMain(): Promise<number> {
  const parsed = parseTeamEvalArgs(process.argv.slice(2), env.LLM_MODE);
  if (!parsed.ok) {
    console.error(parsed.error);
    console.error(TEAM_EVAL_USAGE);
    return 1;
  }
  const args = parsed.value;
  if (args.help) {
    console.log(TEAM_EVAL_USAGE);
    return 0;
  }
  refuseLiveInActions(
    args.llmMode === "live" && !args.dry && !args.buildGolden,
  );
  const model = resolveLlmModel(env);
  const outcome = await runTeamProfileEval({
    rootDir: ROOT_DIR,
    dataDir: path.join(ROOT_DIR, "data"),
    args,
    env,
    model,
    createLlm: (m) => createLlmClient({ mode: args.llmMode, model: m, env }),
    now: () => new Date(),
    logger,
    print: (text) => console.log(text),
  });
  return outcome.exitCode;
}

(process.argv.includes("--team-profile")
  ? teamProfileMain()
  : briefMain()
).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
