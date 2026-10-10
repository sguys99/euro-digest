/**
 * `scripts/report-issue.ts` 인자·환경변수 해석과 출력 문구 (M0-22) — I/O 없는 순수 함수만 둔다.
 *
 * 사용법
 *   node --import tsx scripts/report-issue.ts --kind <kind> [--key <원인 키>] [--payload-file <json>] [--dry-run]
 *   node --import tsx scripts/report-issue.ts --kind pipeline-failure --workflow collect   # Actions 환경변수로 payload 구성
 *
 * payload 출처 (둘 중 하나)
 *   --payload-file   kind별 payload JSON(scripts/lib/github-issues.ts의 *PayloadSchema)
 *   환경변수         pipeline-failure 전용 — Actions 기본 변수 + NEEDS_JSON(`${{ toJSON(needs) }}`)
 *                    · 실패 job = needs의 result가 failure인 job, 원인 키 기본값 = `<workflow>:<실패 job>`
 *                    · 실행 URL = GITHUB_SERVER_URL/GITHUB_REPOSITORY/actions/runs/GITHUB_RUN_ID
 *
 * 그 밖의 환경변수: GITHUB_TOKEN(또는 GH_TOKEN, issues: write) · GITHUB_REPOSITORY(owner/name) ·
 *   GITHUB_API_URL(기본 https://api.github.com). 토큰 값은 읽기만 하고 출력하지 않는다.
 */
import { parseArgs } from "node:util";

import { z } from "zod";

import type { ParseResult } from "./cli-args";
import {
  ISSUE_KINDS,
  isIssueKind,
  type IssueKind,
  type IssuePayloadInput,
  type PreviewResult,
  type ReportResult,
} from "./github-issues";

export const REPORT_ISSUE_USAGE = [
  "사용법: node --import tsx scripts/report-issue.ts --kind <kind> [옵션]",
  `  --kind <kind>          ${ISSUE_KINDS.join(" | ")}`,
  "  --key <원인 키>        같은 원인 판단 키 (생략하면 kind별 기본값 — pipeline-failure는 <workflow>:<실패 job>)",
  "  --payload-file <경로>  payload JSON 파일 (생략하면 pipeline-failure만 Actions 환경변수로 구성)",
  "  --workflow <이름>      pipeline-failure 환경변수 모드의 워크플로 이름 (예: collect)",
  "  --dry-run              만들 이슈·댓글을 출력만 (GitHub에는 GET만 — 생성·댓글 없음)",
  "  --help, -h             이 도움말",
  "환경변수: GITHUB_TOKEN(issues: write) · GITHUB_REPOSITORY · NEEDS_JSON(`${{ toJSON(needs) }}`)",
  "종료 코드: 생성·댓글·dry-run 성공 0, 인자·payload·API 오류 1",
].join("\n");

export interface ReportIssueArgs {
  kind: IssueKind;
  key: string | null;
  payloadFile: string | null;
  workflow: string | null;
  dryRun: boolean;
  help: boolean;
}

/** 인자 파싱. --help면 kind 없이도 통과. */
export function parseReportIssueArgs(
  argv: readonly string[],
): ParseResult<ReportIssueArgs> {
  let values: {
    kind?: string;
    key?: string;
    "payload-file"?: string;
    workflow?: string;
    "dry-run"?: boolean;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: {
        kind: { type: "string" },
        key: { type: "string" },
        "payload-file": { type: "string" },
        workflow: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const help = values.help ?? false;
  const kind = values.kind?.trim() ?? "";
  if (!help) {
    if (!kind) return { ok: false, error: "--kind가 필요합니다" };
    if (!isIssueKind(kind)) {
      return {
        ok: false,
        error: `--kind는 ${ISSUE_KINDS.join(" | ")} 중 하나 (받은 값: "${kind.slice(0, 40)}")`,
      };
    }
  }
  const key = values.key?.trim() || null;
  if (values.key !== undefined && !key) {
    return { ok: false, error: "--key가 비어 있습니다" };
  }
  return {
    ok: true,
    value: {
      kind: (isIssueKind(kind) ? kind : "pipeline-failure") as IssueKind,
      key,
      payloadFile: values["payload-file"]?.trim() || null,
      workflow: values.workflow?.trim() || null,
      dryRun: values["dry-run"] ?? false,
      help,
    },
  };
}

type Env = Readonly<Record<string, string | undefined>>;

const NeedsSchema = z.record(
  z.string(),
  z.object({
    result: z.string(),
    outputs: z.record(z.string(), z.string()).optional(),
  }),
);

export interface NeedsJob {
  job: string;
  result: string;
  note?: string;
}

/**
 * `${{ toJSON(needs) }}` → job 결과 목록. 출력값 중 `reason`(guard의 판단 사유)만 메모로 쓴다 —
 * 다른 출력(커밋 SHA 등)은 이슈에 옮기지 않는다.
 */
export function parseNeedsJson(
  raw: string | undefined,
): ParseResult<NeedsJob[]> {
  if (!raw || !raw.trim()) return { ok: true, value: [] };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "NEEDS_JSON이 JSON이 아닙니다" };
  }
  const parsed = NeedsSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "NEEDS_JSON 형식이 needs 컨텍스트({job: {result, outputs}})와 다릅니다",
    };
  }
  return {
    ok: true,
    value: Object.entries(parsed.data).map(([job, value]) => {
      const reason = value.outputs?.reason?.trim();
      return reason
        ? { job, result: value.result, note: reason.slice(0, 200) }
        : { job, result: value.result };
    }),
  };
}

/** 워크플로 이름 — --workflow > GITHUB_WORKFLOW(표시 이름)를 소문자·하이픈으로 */
export function resolveWorkflowName(
  flag: string | null,
  env: Env,
): ParseResult<string> {
  const raw = flag ?? env.GITHUB_WORKFLOW ?? "";
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/\.ya?ml$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    return {
      ok: false,
      error:
        "--workflow(또는 GITHUB_WORKFLOW)가 필요합니다 (예: --workflow collect)",
    };
  }
  return { ok: true, value: slug };
}

/** pipeline-failure payload를 Actions 환경변수에서 만든다. */
export function pipelineFailurePayloadFromEnv(
  env: Env,
  workflow: string,
  now: Date,
): ParseResult<IssuePayloadInput<"pipeline-failure">> {
  const needs = parseNeedsJson(env.NEEDS_JSON);
  if (!needs.ok) return needs;
  const failedJobs = needs.value
    .filter((j) => j.result === "failure")
    .map((j) => j.job);
  const server = env.GITHUB_SERVER_URL?.trim() || "https://github.com";
  const repo = env.GITHUB_REPOSITORY?.trim();
  const runId = env.GITHUB_RUN_ID?.trim();
  const runUrl =
    repo && runId && /^\d+$/.test(runId)
      ? `${server.replace(/\/+$/, "")}/${repo}/actions/runs/${runId}`
      : undefined;
  const attempt = Number(env.GITHUB_RUN_ATTEMPT);
  return {
    ok: true,
    value: {
      workflow,
      failedJobs,
      jobs: needs.value,
      ...(runUrl ? { runUrl } : {}),
      ...(Number.isSafeInteger(attempt) && attempt > 0
        ? { runAttempt: attempt }
        : {}),
      ...(env.GITHUB_EVENT_NAME ? { event: env.GITHUB_EVENT_NAME } : {}),
      occurredAt: now.toISOString(),
    },
  };
}

export interface ReportInput {
  kind: IssueKind;
  key: string | undefined;
  payload: unknown;
}

/**
 * kind·key·payload를 정한다. payload 파일 내용(문자열)은 진입점이 읽어서 넘긴다.
 * payload 형식 검증은 github-issues.ts가 한다(여기서는 JSON 파싱만).
 */
export function resolveReportInput(
  args: ReportIssueArgs,
  env: Env,
  payloadText: string | null,
  now: Date,
): ParseResult<ReportInput> {
  if (payloadText !== null) {
    try {
      return {
        ok: true,
        value: {
          kind: args.kind,
          key: args.key ?? undefined,
          payload: JSON.parse(payloadText),
        },
      };
    } catch {
      return { ok: false, error: "--payload-file이 올바른 JSON이 아닙니다" };
    }
  }
  if (args.kind !== "pipeline-failure") {
    return {
      ok: false,
      error: `${args.kind}는 --payload-file이 필요합니다 (환경변수 모드는 pipeline-failure만)`,
    };
  }
  const workflow = resolveWorkflowName(args.workflow, env);
  if (!workflow.ok) return workflow;
  const payload = pipelineFailurePayloadFromEnv(env, workflow.value, now);
  if (!payload.ok) return payload;
  return {
    ok: true,
    value: {
      kind: args.kind,
      key: args.key ?? undefined,
      payload: payload.value,
    },
  };
}

export interface ReportEnv {
  token: string | undefined;
  repo: string | undefined;
  apiUrl: string | undefined;
}

/** GITHUB_TOKEN(없으면 GH_TOKEN)·GITHUB_REPOSITORY·GITHUB_API_URL. 토큰은 값을 돌려줄 뿐 출력하지 않는다. */
export function readReportEnv(env: Env): ReportEnv {
  return {
    token: env.GITHUB_TOKEN?.trim() || env.GH_TOKEN?.trim() || undefined,
    repo: env.GITHUB_REPOSITORY?.trim() || undefined,
    apiUrl: env.GITHUB_API_URL?.trim() || undefined,
  };
}

/** dry-run 출력 */
export function formatPreview(preview: PreviewResult): string {
  if (preview.action === "would-comment") {
    return [
      `[report-issue] dry-run — 열린 이슈 #${preview.number}에 댓글을 남길 예정 (생성·댓글 요청 없음)`,
      `  이슈: ${preview.url}`,
      `  원인: ${preview.key} · fingerprint ${preview.fingerprint}`,
      "──── 댓글 본문 ────",
      preview.comment,
      "──────────────────",
    ].join("\n");
  }
  const { issue } = preview;
  return [
    `[report-issue] dry-run — 새 이슈를 만들 예정 (${preview.lookup === "searched" ? "같은 원인의 열린 이슈 없음" : "검색 생략 — GITHUB_REPOSITORY 없음"}, 생성 요청 없음)`,
    `  원인: ${issue.key} · fingerprint ${issue.fingerprint}`,
    `  라벨: ${issue.labels.join(", ")}`,
    `  제목: ${issue.title}`,
    "──── 이슈 본문 ────",
    issue.body,
    "──────────────────",
  ].join("\n");
}

/** 실제 보고 결과 한 줄 */
export function formatReportResult(result: ReportResult): string {
  const nth = result.occurrence ? ` (${result.occurrence}번째 발생)` : "";
  return result.action === "created"
    ? `[report-issue] 새 이슈 #${result.number} 생성 — ${result.url}`
    : `[report-issue] 열린 이슈 #${result.number}에 댓글${nth} — ${result.commentUrl ?? result.url}`;
}

/** Step Summary 마크다운 */
export function formatReportSummary(result: ReportResult): string {
  const nth = result.occurrence ? ` · ${result.occurrence}번째 발생` : "";
  const line =
    result.action === "created"
      ? `- 새 이슈 [#${result.number}](${result.url}) 생성`
      : `- 열린 이슈 [#${result.number}](${result.commentUrl ?? result.url})에 댓글${nth}`;
  return [
    "## 실패 이슈 보고",
    "",
    line,
    `- 원인 키 \`${result.key}\` · fingerprint \`${result.fingerprint}\``,
    "",
  ].join("\n");
}
