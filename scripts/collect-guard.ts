/**
 * collect.yml `guard` job 진입점 (M0-14, FR-150) — 이번 실행에서 수집을 진행할지 판단해
 * `$GITHUB_OUTPUT`(run·reason)과 Step Summary에 남긴다. 판단 규칙은 scripts/lib/collect-guard.ts의 순수 함수.
 *
 * 환경변수
 *   GITHUB_EVENT_NAME · GITHUB_REF · GITHUB_REPOSITORY · GITHUB_RUN_ID · GITHUB_API_URL
 *   · GITHUB_OUTPUT · GITHUB_STEP_SUMMARY   Actions 기본 제공
 *   GH_TOKEN          이력 조회 토큰(github.token, actions: read). 없으면 비인증 요청(공개 저장소 로컬 확인용)
 *   COLLECT_ENABLED   vars.COLLECT_ENABLED — "true"일 때만 schedule 실행
 *   FORCE             inputs.force — "true"면 12시간 가드 무시
 *   COLLECT_WORKFLOW  이력을 볼 워크플로 파일(기본 collect.yml)
 *
 * 종료 코드: 판단 완료(실행·건너뜀 모두) 0, 환경변수 오류·GitHub API 조회 실패 1.
 * 조회 실패를 "실행"으로 넘기지 않는 이유: 06:30 실행 직후의 백업 실행이 중복 수집(LLM 비용 2배)하지 않게
 * 실패 쪽으로 닫고, 실패 이슈(report-failure job)로 사람이 보게 한다. 일시 오류는 재시도로 흡수한다.
 *
 * 로컬 확인 예:
 *   GITHUB_EVENT_NAME=workflow_dispatch GITHUB_REF=refs/heads/main GITHUB_REPOSITORY=sguys99/euro-digest \
 *     node --import tsx scripts/collect-guard.ts
 */
import { appendFileSync } from "node:fs";

import {
  decideFromHistory,
  findCollectSuccess,
  formatGuardOutputs,
  formatGuardSummary,
  parseWorkflowJobs,
  parseWorkflowRuns,
  precheck,
  readGuardEnv,
  runJobsUrl,
  selectCandidateRuns,
  workflowRunsUrl,
  type GuardDecision,
  type GuardEnv,
  type RecentSuccess,
} from "./lib/collect-guard";

const TAG = "[collect-guard]";
const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;

class GitHubApiError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "GitHubApiError";
    this.retryable = retryable;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GitHub REST API GET. 네트워크 오류·5xx·429는 재시도, 그 밖의 4xx는 바로 실패. 응답 본문은 로그에 남기지 않는다. */
async function getJson(
  url: string,
  token: string | undefined,
): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "euro-digest-collect-guard",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) return (await response.json()) as unknown;
      await response.body?.cancel();
      throw new GitHubApiError(
        `HTTP ${response.status} ${response.statusText}`.trim(),
        response.status >= 500 || response.status === 429,
      );
    } catch (error) {
      lastError = error;
      const retryable = !(error instanceof GitHubApiError) || error.retryable;
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      console.warn(
        `${TAG} GitHub API 재시도 ${attempt}/${MAX_ATTEMPTS - 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
}

/** 최근 성공 실행과 그 job을 조회해 12시간 안 수집 성공 목록을 만든다. */
async function loadRecentSuccesses(
  env: GuardEnv,
  token: string | undefined,
  now: Date,
): Promise<RecentSuccess[]> {
  const runs = parseWorkflowRuns(
    await getJson(
      workflowRunsUrl(env.apiUrl, env.repository, env.workflowFile),
      token,
    ),
  );
  if (!runs.ok) throw new Error(runs.error);

  const candidates = selectCandidateRuns(runs.value, {
    now,
    currentRunId: env.currentRunId,
  });
  console.log(
    `${TAG} 최근 성공 실행 ${runs.value.length}건 중 시간 범위 후보 ${candidates.length}건의 job 확인`,
  );

  const successes: RecentSuccess[] = [];
  for (const run of candidates) {
    const jobs = parseWorkflowJobs(
      await getJson(runJobsUrl(env.apiUrl, env.repository, run.id), token),
    );
    if (!jobs.ok) throw new Error(`실행 ${run.id}: ${jobs.error}`);
    const success = findCollectSuccess(run, jobs.value, now);
    if (success) successes.push(success);
  }
  return successes;
}

function writeResult(decision: GuardDecision, env: GuardEnv, now: Date): void {
  const outputs = formatGuardOutputs(decision);
  const summary = formatGuardSummary(decision, env.trigger, now);
  const outputFile = process.env.GITHUB_OUTPUT;
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (outputFile) appendFileSync(outputFile, outputs);
  else process.stdout.write(outputs);
  if (summaryFile) appendFileSync(summaryFile, summary);
  else console.log(`\n${summary}`);
}

async function main(): Promise<number> {
  const parsed = readGuardEnv(process.env);
  if (!parsed.ok) {
    console.error(`::error title=수집 가드 설정 오류::${parsed.error}`);
    return 1;
  }
  const env = parsed.value;
  const now = new Date();

  let decision = precheck(env.trigger);
  if (!decision) {
    try {
      decision = decideFromHistory(
        await loadRecentSuccesses(env, process.env.GH_TOKEN, now),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `::error title=수집 가드 이력 조회 실패::${env.workflowFile} 최근 실행을 확인하지 못해 수집을 진행하지 않습니다 (${message})`,
      );
      return 1;
    }
  }

  console.log(
    decision.run
      ? `${TAG} 실행 — ${decision.reason}: ${decision.message}`
      : `::notice title=수집 건너뜀 (${decision.reason})::${decision.message}`,
  );
  writeResult(decision, env, now);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`${TAG} 예기치 못한 오류:`, error);
    process.exitCode = 1;
  },
);
