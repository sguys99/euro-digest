/**
 * `npm run collect` 진입점 — 수집 → 정제·분류 → 데이터 브리핑 (CLAUDE.md §6.1, PRD §10).
 *
 * M1-01 얇은 수직 슬라이스: BBC 피드 1개 → 원제목 카드 상위 5건(`--limit`) → data/news/<KST 발행일>.json,
 * 전날 경기 결과 → 브리핑 1요청(출력은 로그만). 파이프라인 본체는 scripts/lib/collect-run.ts(I/O 주입).
 * 이 파일은 인자·환경변수를 읽어 의존성을 꾸리고 종료 코드만 정한다.
 *
 * 환경변수는 package.json의 `node --env-file-if-exists=.env.local`이 로컬에서만 채운다(CI는 Actions가 주입).
 * 값은 읽기만 하고 출력하지 않는다. 실행 환경: Actions(GITHUB_ACTIONS=true) = prod → data/runs.json,
 * 로컬 = dev → data/runs-dev.json (CLAUDE.md §6.3).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { COLLECT_USAGE, parseCollectArgs } from "./lib/cli-args";
import {
  resolveCardLimit,
  resolveMaxItems,
  resolveRunEnv,
  runCollect,
} from "./lib/collect-run";
import { resolveBudgets } from "./lib/cost";
import { createLlmClient, resolveLlmModel } from "./lib/llm";
import { createLogger } from "./lib/logger";
import { feedUserAgent } from "./lib/rss";

const parsed = parseCollectArgs(process.argv.slice(2), process.env.LLM_MODE);

if (!parsed.ok) {
  console.error(`[collect] 인자 오류: ${parsed.error}`);
  console.error(COLLECT_USAGE);
  process.exit(1);
}

const args = parsed.value;

if (args.help) {
  console.log(COLLECT_USAGE);
  process.exit(0);
}

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const logger = createLogger({ scope: "collect" });

async function main(): Promise<number> {
  const env = process.env;
  const outcome = await runCollect({
    rootDir: ROOT_DIR,
    dataDir: path.join(ROOT_DIR, "data"),
    env: resolveRunEnv(env),
    llmMode: args.llmMode,
    dry: args.dry,
    limit: resolveCardLimit(args.limit, resolveMaxItems(env.MAX_ITEMS_PER_RUN)),
    now: () => new Date(),
    fetch: (input, init) => fetch(input, init),
    userAgent: feedUserAgent(env.CONTACT_EMAIL),
    footballDataApiKey: env.FOOTBALL_DATA_API_KEY,
    // 브리핑 전용 설정은 브리핑 단계 안에서 해석한다(잘못된 값이면 브리핑만 실패, 뉴스는 발행).
    resolveBriefConfig: () => ({
      model: resolveLlmModel(env),
      budgets: resolveBudgets(env),
    }),
    createLlm: (model) => createLlmClient({ mode: args.llmMode, model, env }),
    logger,
    print: (text) => console.log(text),
  });
  return outcome.exitCode;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    logger.error("collect.run.fail", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  },
);
