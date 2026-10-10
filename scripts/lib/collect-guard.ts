/**
 * collect.yml 실행 가드 판단 로직 — I/O 없는 순수 함수 (M0-14, FR-150).
 * GitHub API 요청·출력·종료는 scripts/collect-guard.ts가 맡는다.
 *
 * 판단 순서 (앞에서 결정되면 뒤는 보지 않는다)
 *   1. schedule·workflow_dispatch가 아닌 이벤트 → 실행 안 함
 *   2. main이 아닌 ref → 실행 안 함 (data 커밋·Pages 배포는 main 전용. github-pages environment도 main만 허용)
 *   3. schedule인데 저장소 변수 COLLECT_ENABLED가 "true"가 아님 → 실행 안 함
 *      (M1 파이프라인 완성·M1-40 리허설 전에는 백업 schedule이 매일 빈 실행을 하지 않게 한다)
 *   4. workflow_dispatch + force → 실행 (12시간 가드 무시, 수동 재실행용)
 *   5. 최근 12시간 안에 "수집 job이 성공한" 실행이 있으면 실행 안 함, 없으면 실행
 *
 * "성공 이력" 정의 — 실행(run) 결론만 보지 않는 이유
 *   가드가 건너뛴 실행도 success로 끝난다. skip을 실패로 끝내면 매번 실패 이슈가 생기고 성공률 KPI가
 *   왜곡되기 때문이다. 그런데 run 결론 == success만 세면 skip된 실행이 성공 이력이 되어 연쇄가 생긴다:
 *     월 06:30 성공 → 월 18:00 수동 실행 skip(success) → 화 06:30이 "12시간 안 성공"으로 skip → 화 18:00 …
 *   그래서 (a) 실행 결론이 success이고 (b) 그 실행의 수집 job(COLLECT_JOB_NAME) 결론이 success인 실행만
 *   성공 이력으로 센다. skip된 실행의 수집 job은 skipped라 빠지고, 수집 후 배포가 실패한 실행은
 *   run 결론이 failure라 빠진다(다음 실행이 다시 시도하고, 실패 이슈가 따로 남는다).
 *   성공 시각은 수집 job의 completed_at(없으면 실행의 updated_at)이다.
 */
import type { ParseResult } from "./cli-args";

/**
 * collect.yml의 수집 job 표시 이름(`jobs.collect.name`). GitHub jobs API는 job ID가 아니라 이 이름을 돌려준다.
 * 워크플로에서 이름을 바꾸면 여기도 함께 바꾼다 — tests/collect-guard.test.ts가 두 값이 같은지 확인한다.
 */
export const COLLECT_JOB_NAME = "수집 · 검증 · 빌드 · 커밋 (collect)";

/** 이력을 조회할 워크플로 파일 이름 */
export const COLLECT_WORKFLOW_FILE = "collect.yml";

export const MAIN_REF = "refs/heads/main";

/** 이 시간 안에 수집 성공 이력이 있으면 건너뛴다 (FR-150) */
export const SUCCESS_WINDOW_HOURS = 12;

/**
 * 후보 실행을 고를 때 시작 시각 기준으로 더 거슬러 올라가는 여유.
 * 실행이 시작된 뒤 수집 job이 끝나기까지 concurrency 대기 + job 타임아웃(가드 5분·수집 30분)만큼 걸릴 수 있어서
 * "시작은 12시간 전이지만 수집 완료는 12시간 안"인 실행을 놓치지 않게 넉넉히 둔다.
 */
export const LOOKBACK_MARGIN_HOURS = 6;

/** 한 번에 살펴볼 최근 성공 실행 수 (하루 1~2회 실행 기준 열흘 남짓) */
export const RUNS_PER_PAGE = 20;

const HOUR_MS = 60 * 60 * 1000;

export type GuardReason =
  | "unsupported-event"
  | "not-main"
  | "schedule-disabled"
  | "forced"
  | "recent-success"
  | "no-recent-success";

/** 실행을 일으킨 이벤트와 입력 */
export interface GuardTrigger {
  eventName: string;
  ref: string;
  /** vars.COLLECT_ENABLED == "true" */
  collectEnabled: boolean;
  /** inputs.force (workflow_dispatch에서만 의미가 있다) */
  force: boolean;
}

/** 12시간 안에 수집 job이 성공한 실행 */
export interface RecentSuccess {
  runId: number;
  runNumber: number;
  url: string;
  event: string;
  /** 수집 job 완료 시각 (ISO 8601, UTC) */
  completedAt: string;
}

export interface GuardDecision {
  run: boolean;
  reason: GuardReason;
  /** 사람이 읽는 설명 (Step Summary·로그) */
  message: string;
  recent?: RecentSuccess;
}

/** GitHub API workflow run에서 쓰는 필드만 */
export interface WorkflowRun {
  id: number;
  runNumber: number;
  event: string;
  conclusion: string | null;
  createdAt: string;
  /** 재실행(attempt 2+)이면 그 시도의 시작 시각 */
  runStartedAt: string | null;
  updatedAt: string;
  htmlUrl: string;
}

/** GitHub API job에서 쓰는 필드만 */
export interface WorkflowJob {
  name: string;
  conclusion: string | null;
  completedAt: string | null;
}

/** collect-guard CLI가 읽는 환경변수 */
export interface GuardEnv {
  trigger: GuardTrigger;
  repository: string;
  /** 현재 실행 ID — 이력에서 제외한다. 로컬 실행처럼 없으면 null */
  currentRunId: number | null;
  apiUrl: string;
  workflowFile: string;
}

/** 워크플로 입력·저장소 변수의 불리언 문자열: "true"(대소문자·앞뒤 공백 무시)만 참 */
export function parseFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/** `owner/repo` 형식만 허용 */
const REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/;

/** Actions가 주입하는 환경변수를 읽어 검증한다. */
export function readGuardEnv(
  env: Readonly<Record<string, string | undefined>>,
): ParseResult<GuardEnv> {
  const eventName = env.GITHUB_EVENT_NAME?.trim() ?? "";
  const ref = env.GITHUB_REF?.trim() ?? "";
  const repository = env.GITHUB_REPOSITORY?.trim() ?? "";
  if (!eventName || !ref) {
    return {
      ok: false,
      error:
        "GITHUB_EVENT_NAME·GITHUB_REF가 필요합니다 (Actions에서 실행하거나 직접 지정)",
    };
  }
  if (!REPOSITORY_PATTERN.test(repository)) {
    return {
      ok: false,
      error: `GITHUB_REPOSITORY는 owner/repo 형식이어야 합니다 (받은 값: "${repository}")`,
    };
  }

  let currentRunId: number | null = null;
  const rawRunId = env.GITHUB_RUN_ID?.trim();
  if (rawRunId) {
    const value = Number(rawRunId);
    if (!/^\d+$/.test(rawRunId) || !Number.isSafeInteger(value)) {
      return {
        ok: false,
        error: `GITHUB_RUN_ID가 올바르지 않습니다 (받은 값: "${rawRunId}")`,
      };
    }
    currentRunId = value;
  }

  return {
    ok: true,
    value: {
      trigger: {
        eventName,
        ref,
        collectEnabled: parseFlag(env.COLLECT_ENABLED),
        force: parseFlag(env.FORCE),
      },
      repository,
      currentRunId,
      apiUrl: (env.GITHUB_API_URL?.trim() || "https://api.github.com").replace(
        /\/+$/,
        "",
      ),
      workflowFile: env.COLLECT_WORKFLOW?.trim() || COLLECT_WORKFLOW_FILE,
    },
  };
}

/**
 * 이력 조회 없이 결정할 수 있는 경우를 판단한다(판단 순서 1~4).
 * null이면 이력(판단 순서 5)을 봐야 한다.
 */
export function precheck(trigger: GuardTrigger): GuardDecision | null {
  const { eventName, ref } = trigger;
  if (eventName !== "schedule" && eventName !== "workflow_dispatch") {
    return {
      run: false,
      reason: "unsupported-event",
      message: `지원하지 않는 이벤트(${eventName}) — schedule·workflow_dispatch에서만 수집한다`,
    };
  }
  if (ref !== MAIN_REF) {
    return {
      run: false,
      reason: "not-main",
      message: `main이 아닌 ref(${ref})에서 실행됨 — data 커밋·Pages 배포는 main에서만 한다. "Use workflow from"을 main으로 두고 다시 실행할 것`,
    };
  }
  if (eventName === "schedule" && !trigger.collectEnabled) {
    return {
      run: false,
      reason: "schedule-disabled",
      message:
        '백업 schedule 비활성 — 저장소 변수 COLLECT_ENABLED가 "true"가 아니다 (M1-40 리허설 후 활성화)',
    };
  }
  if (eventName === "workflow_dispatch" && trigger.force) {
    return {
      run: true,
      reason: "forced",
      message: `force 입력 — ${SUCCESS_WINDOW_HOURS}시간 가드를 건너뛰고 실행한다`,
    };
  }
  return null;
}

/** 이 워크플로의 최근 성공 실행 목록 API 주소 (최신순) */
export function workflowRunsUrl(
  apiUrl: string,
  repository: string,
  workflowFile: string,
): string {
  const params = new URLSearchParams({
    status: "success",
    per_page: String(RUNS_PER_PAGE),
    exclude_pull_requests: "true",
  });
  return `${apiUrl}/repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?${params}`;
}

/** 실행 하나의 job 목록 API 주소 (최신 시도만) */
export function runJobsUrl(
  apiUrl: string,
  repository: string,
  runId: number,
): string {
  return `${apiUrl}/repos/${repository}/actions/runs/${runId}/jobs?filter=latest&per_page=100`;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isOptionalTimestamp(value: unknown): value is string | null {
  return value === undefined || value === null || isTimestamp(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** `GET …/workflows/{file}/runs` 응답을 검증해 필요한 필드만 꺼낸다. */
export function parseWorkflowRuns(
  payload: unknown,
): ParseResult<WorkflowRun[]> {
  if (!isObject(payload) || !Array.isArray(payload.workflow_runs)) {
    return {
      ok: false,
      error: "workflow runs 응답에 workflow_runs 배열이 없습니다",
    };
  }
  const runs: WorkflowRun[] = [];
  for (const [index, item] of payload.workflow_runs.entries()) {
    if (
      !isObject(item) ||
      typeof item.id !== "number" ||
      typeof item.run_number !== "number" ||
      typeof item.event !== "string" ||
      !isNullableString(item.conclusion) ||
      !isTimestamp(item.created_at) ||
      !isOptionalTimestamp(item.run_started_at) ||
      !isTimestamp(item.updated_at) ||
      typeof item.html_url !== "string"
    ) {
      return {
        ok: false,
        error: `workflow_runs[${index}]의 형식이 예상과 다릅니다`,
      };
    }
    runs.push({
      id: item.id,
      runNumber: item.run_number,
      event: item.event,
      conclusion: item.conclusion,
      createdAt: item.created_at,
      runStartedAt: item.run_started_at ?? null,
      updatedAt: item.updated_at,
      htmlUrl: item.html_url,
    });
  }
  return { ok: true, value: runs };
}

/** `GET …/runs/{id}/jobs` 응답을 검증해 필요한 필드만 꺼낸다. */
export function parseWorkflowJobs(
  payload: unknown,
): ParseResult<WorkflowJob[]> {
  if (!isObject(payload) || !Array.isArray(payload.jobs)) {
    return { ok: false, error: "jobs 응답에 jobs 배열이 없습니다" };
  }
  const jobs: WorkflowJob[] = [];
  for (const [index, item] of payload.jobs.entries()) {
    if (
      !isObject(item) ||
      typeof item.name !== "string" ||
      !isNullableString(item.conclusion) ||
      !isOptionalTimestamp(item.completed_at)
    ) {
      return { ok: false, error: `jobs[${index}]의 형식이 예상과 다릅니다` };
    }
    jobs.push({
      name: item.name,
      conclusion: item.conclusion,
      completedAt: item.completed_at ?? null,
    });
  }
  return { ok: true, value: jobs };
}

export interface CandidateOptions {
  now: Date;
  currentRunId: number | null;
  windowHours?: number;
  marginHours?: number;
}

/**
 * job까지 확인할 후보 실행을 고른다: 결론 success, 현재 실행 아님,
 * 시작 시각(재실행이면 그 시도의 시작)이 (12시간 + 여유) 안.
 */
export function selectCandidateRuns(
  runs: readonly WorkflowRun[],
  {
    now,
    currentRunId,
    windowHours = SUCCESS_WINDOW_HOURS,
    marginHours = LOOKBACK_MARGIN_HOURS,
  }: CandidateOptions,
): WorkflowRun[] {
  const since = now.getTime() - (windowHours + marginHours) * HOUR_MS;
  return runs.filter(
    (run) =>
      run.conclusion === "success" &&
      run.id !== currentRunId &&
      Date.parse(run.runStartedAt ?? run.createdAt) >= since,
  );
}

/**
 * 실행 하나가 "12시간 안 수집 성공"인지 본다. 수집 job이 없거나(이름 불일치) success가 아니면 null.
 * 실행 결론 success는 selectCandidateRuns에서 이미 걸렀다.
 */
export function findCollectSuccess(
  run: WorkflowRun,
  jobs: readonly WorkflowJob[],
  now: Date,
  windowHours = SUCCESS_WINDOW_HOURS,
): RecentSuccess | null {
  const job = jobs.find(
    (candidate) =>
      candidate.name === COLLECT_JOB_NAME && candidate.conclusion === "success",
  );
  if (!job) return null;

  const completedAt = job.completedAt ?? run.updatedAt;
  // 러너 시계가 조금 앞서 미래 시각이 나와도(나이 음수) 최근 성공으로 본다.
  if (now.getTime() - Date.parse(completedAt) >= windowHours * HOUR_MS) {
    return null;
  }
  return {
    runId: run.id,
    runNumber: run.runNumber,
    url: run.htmlUrl,
    event: run.event,
    completedAt,
  };
}

/** 이력 확인 결과로 최종 판단한다(판단 순서 5). 여러 건이면 가장 최근 성공을 근거로 든다. */
export function decideFromHistory(
  successes: readonly RecentSuccess[],
): GuardDecision {
  const recent = [...successes].sort(
    (a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt),
  )[0];
  if (recent) {
    return {
      run: false,
      reason: "recent-success",
      message: `최근 ${SUCCESS_WINDOW_HOURS}시간 안에 수집 성공 이력이 있다(실행 #${recent.runNumber}, ${recent.completedAt} 완료) — 건너뛴다. 다시 돌리려면 force를 켜고 수동 실행할 것`,
      recent,
    };
  }
  return {
    run: true,
    reason: "no-recent-success",
    message: `최근 ${SUCCESS_WINDOW_HOURS}시간 안에 수집 성공 이력이 없다 — 실행한다`,
  };
}

/** `$GITHUB_OUTPUT`에 덧붙일 내용 (값은 고정 문자열이라 여러 줄 구분자가 필요 없다) */
export function formatGuardOutputs(decision: GuardDecision): string {
  return `run=${decision.run}\nreason=${decision.reason}\n`;
}

/** `$GITHUB_STEP_SUMMARY`에 덧붙일 마크다운 */
export function formatGuardSummary(
  decision: GuardDecision,
  trigger: GuardTrigger,
  now: Date,
): string {
  const cell = (value: string) => value.replace(/\|/g, "\\|");
  const rows: [string, string][] = [
    ["결과", decision.run ? "**실행**" : "**건너뜀** (성공 종료)"],
    ["이유", `\`${decision.reason}\` — ${cell(decision.message)}`],
    ["트리거", `${cell(trigger.eventName)} · \`${cell(trigger.ref)}\``],
    ["COLLECT_ENABLED", String(trigger.collectEnabled)],
    ["force", String(trigger.force)],
  ];
  if (decision.recent) {
    const { runNumber, url, event, completedAt } = decision.recent;
    rows.push([
      "최근 수집 성공",
      `[#${runNumber}](${url}) · ${event} · ${completedAt} (UTC)`,
    ]);
  }
  rows.push(["판단 시각 (UTC)", now.toISOString()]);
  return [
    "## 수집 가드 (12시간 성공 이력)",
    "",
    "| 항목 | 값 |",
    "|---|---|",
    ...rows.map(([key, value]) => `| ${key} | ${value} |`),
    "",
  ].join("\n");
}
