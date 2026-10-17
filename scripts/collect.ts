/**
 * `npm run collect` 진입점 — 수집 → 정제·분류 → 데이터 브리핑 (CLAUDE.md §6.1, PRD §10).
 *
 * M1-01 수직 슬라이스 + M1-02 소스 로더 + M1-03 RSS 어댑터: configs/sources.json의 일일 수집 대상 피드 전부
 * (호스트별 병렬·재시도 1회·단계 시간 예산 90초, 소스별 실패 격리 — scripts/lib/feed-collect.ts) → 같은 URL 묶음(M1-12) → 같은 사건
 * 클러스터(M1-13 — 제목 유사도, 국내·해외 따로) → 점수화 상위 MAX_ITEMS_PER_RUN(기본 45, 소량 실행 `--limit` — M1-14, FR-06)
 * 원제목 카드 → data/news/<KST 발행일>.json,
 * M1-44 경기 데이터(football-data 전날 종료 경기 + 그 대회 순위, 프로바이더별 병렬·실패 격리) → 브리핑 1요청(출력은 로그만),
 * M1-48 API-Football 경기 단건(날짜 조회 D-1·D → 대상 경기 상세, 브리핑 경기 먼저 · 이월 data/cache/af-pending.json —
 * 뉴스와 병렬로 시작, API_FOOTBALL_MAX_CALLS로 실행당 호출 상한을 걸 수 있다) · M1-48b 경기 기록 원장 data/matches/
 * (COLLECT_ENABLED == "true"인 prod·비dry 실행만 쓴다 — 로컬 dev·dry는 메모리에서 만들어 로그만).
 * 파이프라인 본체는 scripts/lib/collect-run.ts(I/O 주입).
 * 이 파일은 인자·환경변수를 읽어 의존성을 꾸리고 종료 코드만 정한다.
 *
 * 환경변수는 package.json의 `node --env-file-if-exists=.env.local`이 로컬에서만 채운다(CI는 Actions가 주입).
 * 값은 읽기만 하고 출력하지 않는다. 실행 환경: Actions(GITHUB_ACTIONS=true) = prod → data/runs.json,
 * 로컬 = dev → data/runs-dev.json (CLAUDE.md §6.3).
 * SOURCE_HEALTH_FILE(선택, Actions가 `$RUNNER_TEMP/source-health.json`으로 준다): 소스 건강도 사건(이슈 payload 배열)을
 * 쓸 파일 — 이슈는 collect.yml의 다음 단계가 만든다(M1-11). 없으면(로컬) 사건을 로그로만 남긴다.
 * GITHUB_OUTPUT·GITHUB_STEP_SUMMARY(Actions 기본 제공 — M1-26): 실행이 끝나면 성공·실패와 상관없이 단계 출력(publish_date·run_id·
 * status·run_recorded — scripts/lib/collect-outputs.ts)을 쓴다. collect.yml의 검증 게이트·data 커밋이 이 발행일을 쓴다.
 * 단계 출력을 쓰지 못하면 exit 1(뒤 단계가 발행일을 몰라 검증할 수 없다 — 커밋하지 않는다). 로컬은 두 변수가 없어 쓰지 않는다.
 * RUN_ISSUES_FILE(선택, Actions가 `$RUNNER_TEMP/run-issues.json`으로 준다 — M1-27): 부분 실패 이슈 사건(`pipeline-partial` payload
 * 배열 — 삭제 단계·seen-urls·클러스터링·브리핑·브리핑 파일·runs 읽기·원장 오류, scripts/lib/run-issues.ts)을 쓸 파일. dry는 쓰지
 * 않는다. 없으면(로컬) 로그로만 남긴다. 쓰기 실패는 경고만(종료 코드에 영향 없음).
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { COLLECT_USAGE, parseCollectArgs } from "./lib/cli-args";
import {
  collectStepOutputsOf,
  writeCollectOutputs,
} from "./lib/collect-outputs";
import {
  resolveCardLimit,
  resolveMaxItems,
  resolveRunEnv,
  runCollect,
} from "./lib/collect-run";
import { resolveBudgets } from "./lib/cost";
import { actionsRunUrl } from "./lib/github-issues";
import { createLlmClient, resolveLlmModel } from "./lib/llm";
import { createLogger } from "./lib/logger";
import { resolveLedgerEnabled } from "./lib/match-ledger";
import { feedUserAgent } from "./lib/rss";
import { partialFindings, partialIssuePayloads } from "./lib/run-issues";

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
    apiFootballApiKey: env.API_FOOTBALL_KEY,
    // 실행당 API-Football 호출 상한(선택 — dry·개발 실측용). 일일 상한(봇 60·개발 50)은 실행 기록 카운터로 지킨다.
    apiFootballMaxCalls: env.API_FOOTBALL_MAX_CALLS,
    // 정기 운영(저장소 변수 COLLECT_ENABLED == 'true') — 경기 기록 원장(data/matches)은 이때의 prod·비dry 실행만 쓴다(M1-48b)
    ledgerEnabled: resolveLedgerEnabled(env.COLLECT_ENABLED),
    // 브리핑 전용 설정은 브리핑 단계 안에서 해석한다(잘못된 값이면 브리핑만 실패, 뉴스는 발행).
    resolveBriefConfig: () => ({
      model: resolveLlmModel(env),
      budgets: resolveBudgets(env),
    }),
    createLlm: (model) => createLlmClient({ mode: args.llmMode, model, env }),
    logger,
    print: (text) => console.log(text),
    healthReportPath: env.SOURCE_HEALTH_FILE?.trim() || null,
    runUrl: actionsRunUrl(env),
  });
  // 부분 실패 이슈 사건(M1-27, FR-152) — 수집 단계 안에서 실패했지만 실행은 계속된 단계 오류를 사유별 payload로. 이슈는 collect.yml 다음 단계가 만든다.
  const findings = partialFindings({
    purge: outcome.purge,
    news: outcome.news,
    brief: outcome.brief,
    briefFile: outcome.briefFile,
    ledger: outcome.matchData?.ledger ?? null,
  });
  for (const finding of findings) {
    logger.warn("collect.run.issue", {
      reason: finding.reason,
      key: `collect:partial:${finding.reason}`,
    });
  }
  const runIssuesFile = env.RUN_ISSUES_FILE?.trim() || null;
  const runUrl = actionsRunUrl(env);
  if (runIssuesFile !== null && !args.dry) {
    const payloads = partialIssuePayloads(findings, {
      workflow: "collect",
      runId: outcome.runId,
      publishDate: outcome.publishDate,
      occurredAt: new Date().toISOString(),
      ...(runUrl ? { runUrl } : {}),
    });
    try {
      mkdirSync(path.dirname(runIssuesFile), { recursive: true });
      writeFileSync(
        runIssuesFile,
        `${JSON.stringify(payloads, null, 2)}\n`,
        "utf8",
      );
      logger.info("collect.run.issue.write", {
        file: runIssuesFile,
        events: payloads.length,
      });
    } catch (error) {
      // 사건 파일을 못 쓰면 이번 실행의 부분 실패 이슈만 빠진다(같은 사유는 다음 실행이 다시 낸다)
      logger.warn("collect.run.issue.fail", {
        file: runIssuesFile,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  // 단계 출력(M1-26) — 검증 게이트 `--publish-date`·data 커밋 메시지가 이 발행일을 쓴다. 수집이 실패한 실행(exit 1)도 쓴다.
  const outputs = collectStepOutputsOf(outcome);
  const written = writeCollectOutputs({
    outputs,
    outputFile: env.GITHUB_OUTPUT?.trim() || null,
    summaryFile: env.GITHUB_STEP_SUMMARY?.trim() || null,
    append: (file, text) => appendFileSync(file, text, "utf8"),
  });
  if (written.summaryError !== null) {
    logger.warn("collect.outputs.summary.fail", {
      error: written.summaryError,
    });
  }
  if (!written.ok) {
    logger.error("collect.outputs.fail", {
      runId: outcome.runId,
      error: written.error,
    });
    return 1;
  }
  if (written.wroteOutputs) {
    logger.info("collect.outputs", {
      publishDate: outputs.publishDate,
      runId: outputs.runId,
      status: outputs.status,
      runRecorded: outputs.runRecorded,
    });
  }
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
