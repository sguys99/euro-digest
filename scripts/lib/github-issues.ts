/**
 * GitHub 이슈 자동 보고 — 같은 원인은 기존 이슈에 댓글 (M0-22, PRD FR-08·FR-11·FR-152·FR-155, CLAUDE.md §6.4).
 *
 * 구성
 *   - 순수 함수: issueFingerprint · defaultIssueKey · buildIssue · buildComment · findMatchingIssue ·
 *     extractFingerprints · parseNextLink
 *   - I/O: reportIssue(생성 또는 댓글) · tryReportIssue(던지지 않는 판) · previewReport(dry-run, 읽기만)
 *
 * "같은 원인" = 종류(kind) + 원인 키(key)
 *   - pipeline-failure  key `<워크플로>:<실패 job>` (예: `collect:collect`, `collect:deploy`) — job별로 다른 이슈
 *   - source-broken     key `<소스 ID>` — 피드 오류·파싱 실패 등으로 그 소스만 건너뛴 경우(FR-08)
 *   - source-health     key `<소스 ID>` — 3일 연속 0건(FR-11). source-broken과 다른 원인으로 본다
 *   - ops-report        key `<ISO 주>` (예: `2026-W41`) — 주간 운영 리포트(FR-155, M5에서 채움)
 *   fingerprint = sha256(`v1|kind|key`) 앞 12자리. 이슈 본문 끝에 숨김 마커
 *   `<!-- euro-digest:fingerprint=… -->`로 넣고, 다음 보고 때 이 마커로 같은 원인의 열린 이슈를 찾는다.
 *   사람이 연 이슈(마커 없음)는 자동 보고와 섞이지 않는다.
 *
 * 열린 이슈 검색 — REST `GET /repos/{repo}/issues?state=open&labels=<라벨>`(작성일 오름차순, 100건씩 페이지)
 *   - search API(`/search/issues`)를 쓰지 않는 이유: ① 검색 색인이 늦게 반영돼 방금 만든 이슈를 못 찾을 수 있다
 *     (연달아 실패하면 중복 이슈) ② HTML 주석 안 문자열이 검색되는지 보장되지 않는다 ③ 분당 30회 별도 한도.
 *   - 목록 API는 즉시 일관되고 본문(body)을 함께 주며, 라벨로 걸러 보통 1페이지(요청 1회)로 끝난다.
 *     GITHUB_TOKEN 한도(저장소당 시간당 1,000회)에 비해 실행당 수 회라 여유가 크다. 최대 MAX_PAGES까지만 본다.
 *   - 매칭: 열림 + 검색 라벨 보유 + 본문에 같은 fingerprint 마커. PR은 제외. 여럿이면 가장 오래된(번호가 작은) 것.
 *   - **닫힌 이슈는 찾지 않는다** — 닫힘 = 해결됨으로 보고, 같은 원인이 재발하면 새 이슈를 연다
 *     (닫힌 이슈에 댓글을 달면 아무도 보지 않는다. 새 이슈 본문에서 이전 이슈를 찾으려면 마커로 검색하면 된다).
 *
 * 실패 처리 — 이슈 보고는 부가 기능이라 파이프라인을 멈추지 않는다
 *   - 네트워크 오류·5xx·429·2차 한도(403 + retry-after/remaining 0)는 "검색 → 생성/댓글" 전체를 1~2회 다시 한다.
 *     다시 할 때 검색부터 하므로, 생성 요청이 서버에서 처리됐는데 응답만 잃은 경우 중복 이슈 대신 댓글이 된다.
 *   - 그래도 실패하면 IssueReportError를 던진다. 호출부는 이것만 잡으면 된다(tryReportIssue는 결과로 돌려준다).
 *   - 토큰은 Authorization 헤더에만 쓰고 로그·오류 메시지·본문에 넣지 않는다. 응답 본문도 로그에 남기지 않는다
 *     (오류 시 GitHub가 주는 짧은 message만 가려서·잘라서 쓴다).
 *   - 같은 실행 안에서 같은 fingerprint를 두 번 보고하면 메모리 캐시의 첫 결과를 돌려준다(deduped: true).
 *
 * 본문 안전 — payload 문자열(오류 메시지 등)은 비밀값을 가리고 자르며, `@멘션`은 알림이 가지 않게 끊고,
 *   표 칸의 `|`·줄바꿈을 이스케이프한다. 본문은 GitHub 한도(65,536자)보다 작게 자른다.
 */
import { createHash } from "node:crypto";

import { z } from "zod";

import { IsoSchema } from "@/lib/schema";
import { formatKst, kstDate, nowUtcIso } from "@/lib/time";

import { createLogger, sanitizeText, type Logger } from "./logger";

// ─── 종류·라벨 ───────────────────────────────────────────────────────────

export const ISSUE_KINDS = [
  "pipeline-failure",
  "source-broken",
  "source-health",
  "ops-report",
] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

export function isIssueKind(value: string): value is IssueKind {
  return (ISSUE_KINDS as readonly string[]).includes(value);
}

/** 새 이슈에 붙이는 라벨(M0-10에서 생성됨). source-health는 이슈 폼 규칙대로 source-broken과 함께 붙인다. */
export const ISSUE_LABELS: Readonly<Record<IssueKind, readonly string[]>> = {
  "pipeline-failure": ["pipeline-failure"],
  "source-broken": ["source-broken"],
  "source-health": ["source-broken", "source-health"],
  "ops-report": ["ops-report"],
};

/** 열린 이슈를 찾을 때 거르는 라벨(종류마다 하나) */
export const SEARCH_LABEL: Readonly<Record<IssueKind, string>> = {
  "pipeline-failure": "pipeline-failure",
  "source-broken": "source-broken",
  "source-health": "source-health",
  "ops-report": "ops-report",
};

/** `.github/ISSUE_TEMPLATE/source-broken.yml`의 증상 선택지 — 테스트가 이슈 폼과 같은지 확인한다. */
export const SOURCE_SYMPTOMS = [
  "0건 수집",
  "피드 URL 오류(4xx·5xx)",
  "파싱 실패",
  "중복·스팸",
  "약관·robots 변경",
  "기타",
] as const;

/** 이슈 폼 source-broken.yml의 항목 라벨 순서 — 자동 이슈 본문도 같은 `### <라벨>` 헤딩을 쓴다. */
export const SOURCE_FORM_HEADINGS = [
  "소스 ID",
  "증상",
  "처음 발생 날짜",
  "관련 실행 로그 링크",
  "메모",
] as const;

/** 이슈 폼이 빈 항목을 렌더링하는 문구(사람이 연 이슈와 같은 모양) */
const NO_RESPONSE = "_No response_";

// ─── 제한값 ──────────────────────────────────────────────────────────────

/** GitHub 이슈·댓글 본문 한도 65,536자보다 여유 있게 */
export const MAX_BODY_LENGTH = 60_000;
/** 열린 이슈 목록을 최대 몇 페이지(×100건)까지 볼지 */
export const MAX_PAGES = 10;
export const PER_PAGE = 100;
/** 재발 횟수를 세려고 볼 댓글 페이지 수 상한 */
const MAX_COMMENT_PAGES = 5;
const KEY_MAX_LENGTH = 200;
const TEXT_MAX = 300;
const NOTE_MAX = 2_000;

export const DEFAULT_API_URL = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT = "euro-digest-issue-reporter";

export interface IssueRetryPolicy {
  /** 첫 시도 뒤 추가 시도 횟수(1~2) */
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_ISSUE_RETRY: Readonly<IssueRetryPolicy> = Object.freeze({
  maxRetries: 2,
  baseDelayMs: 1_000,
  maxDelayMs: 10_000,
});

// ─── 오류 ────────────────────────────────────────────────────────────────

export type IssueReportFailure = "payload" | "config" | "api";

/** 이슈 보고 실패 — 호출부가 잡고 계속 진행할 수 있게 이 타입 하나로 던진다. 토큰·응답 본문은 담지 않는다. */
export class IssueReportError extends Error {
  override readonly name = "IssueReportError";
  readonly reason: IssueReportFailure;
  readonly kind: string;
  readonly fingerprint: string | null;
  /** 마지막 HTTP 상태(응답을 못 받았으면 undefined) */
  readonly status: number | undefined;
  readonly retryable: boolean;
  readonly attempts: number;

  constructor(
    message: string,
    details: {
      reason: IssueReportFailure;
      kind: string;
      fingerprint?: string | null;
      status?: number;
      retryable?: boolean;
      attempts?: number;
    },
  ) {
    super(message);
    this.reason = details.reason;
    this.kind = details.kind;
    this.fingerprint = details.fingerprint ?? null;
    this.status = details.status;
    this.retryable = details.retryable ?? false;
    this.attempts = details.attempts ?? 0;
  }
}

/** payload가 스키마에 맞지 않음(호출부 버그 또는 잘못된 --payload-file) */
export class IssuePayloadError extends Error {
  override readonly name = "IssuePayloadError";
  readonly problems: readonly string[];
  constructor(kind: string, problems: readonly string[]) {
    super(`${kind} payload 오류:\n  - ${problems.join("\n  - ")}`);
    this.problems = problems;
  }
}

// ─── payload 스키마 ──────────────────────────────────────────────────────

const HttpsUrl = z.url({ protocol: /^https$/ });
const KstDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const ShortText = z.string().min(1).max(5_000);

const JobResultSchema = z.strictObject({
  job: z.string().min(1).max(100),
  result: z.string().min(1).max(40),
  /** 짧은 부가 정보(예: guard의 판단 사유) */
  note: z.string().max(200).optional(),
});

export const PipelineFailurePayloadSchema = z.strictObject({
  /** 워크플로 이름(파일명에서 .yml 뺀 것): collect · weekly · deploy … */
  workflow: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "소문자·숫자·하이픈"),
  /** 실패한 job id들. 비면 "알 수 없음" */
  failedJobs: z.array(z.string().min(1).max(100)).max(20).default([]),
  jobs: z.array(JobResultSchema).max(20).default([]),
  runUrl: HttpsUrl.optional(),
  runAttempt: z.number().int().positive().optional(),
  event: z.string().max(60).optional(),
  occurredAt: IsoSchema.optional(),
  note: ShortText.optional(),
});

export const SourceBrokenPayloadSchema = z.strictObject({
  sourceId: z.string().min(1).max(100),
  sourceName: z.string().max(100).optional(),
  symptoms: z.array(z.enum(SOURCE_SYMPTOMS)).min(1),
  /** 처음 발생 날짜(KST). 생략하면 occurredAt의 KST 날짜 */
  firstSeen: KstDateString.optional(),
  runUrl: HttpsUrl.optional(),
  runId: z.string().max(100).optional(),
  /** 짧은 오류 요약(예: `HTTP 503`, `XML 파싱 실패: …`). 응답 본문을 넣지 않는다 */
  error: ShortText.optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
  occurredAt: IsoSchema.optional(),
  note: ShortText.optional(),
});

const SourceRunSchema = z.strictObject({
  startedAt: IsoSchema,
  ok: z.boolean(),
  items: z.number().int().min(0),
  runId: z.string().max(100).optional(),
  runUrl: HttpsUrl.optional(),
});

export const SourceHealthPayloadSchema = z.strictObject({
  sourceId: z.string().min(1).max(100),
  sourceName: z.string().max(100).optional(),
  /** 연속 0건 일수(FR-11 기준 3 이상) */
  zeroDays: z.number().int().min(1),
  /** 최근 실행별 이 소스의 결과(오래된 것 → 최근 순으로 넘기면 그대로 표에 쓴다) */
  runs: z.array(SourceRunSchema).min(1).max(30),
  firstSeen: KstDateString.optional(),
  runUrl: HttpsUrl.optional(),
  occurredAt: IsoSchema.optional(),
  note: ShortText.optional(),
});

/** 주간 운영 리포트 — M5(FR-155)에서 비용·성공률·소스 건강도·미등록 고유명사 섹션을 채운다. 지금은 골격. */
export const OpsReportPayloadSchema = z.strictObject({
  week: z.string().regex(/^\d{4}-W\d{2}$/, "YYYY-Www"),
  from: KstDateString.optional(),
  to: KstDateString.optional(),
  sections: z
    .array(
      z.strictObject({
        heading: z.string().min(1).max(80),
        body: z.string().max(20_000),
      }),
    )
    .max(20)
    .default([]),
  occurredAt: IsoSchema.optional(),
});

export const ISSUE_PAYLOAD_SCHEMAS = {
  "pipeline-failure": PipelineFailurePayloadSchema,
  "source-broken": SourceBrokenPayloadSchema,
  "source-health": SourceHealthPayloadSchema,
  "ops-report": OpsReportPayloadSchema,
} as const satisfies Record<IssueKind, z.ZodType>;

/** 호출부가 넘기는 payload(기본값 있는 필드는 생략 가능) */
export type IssuePayloadInput<K extends IssueKind> = z.input<
  (typeof ISSUE_PAYLOAD_SCHEMAS)[K]
>;
type IssuePayload<K extends IssueKind> = z.output<
  (typeof ISSUE_PAYLOAD_SCHEMAS)[K]
>;

/** 경계 파싱 — 실패하면 IssuePayloadError */
export function parseIssuePayload<K extends IssueKind>(
  kind: K,
  payload: unknown,
): IssuePayload<K> {
  const result = ISSUE_PAYLOAD_SCHEMAS[kind].safeParse(payload);
  if (!result.success) {
    throw new IssuePayloadError(
      kind,
      result.error.issues.map(
        (issue) =>
          `${issue.path.length ? issue.path.join(".") : "(root)"}: ${issue.message}`,
      ),
    );
  }
  return result.data as IssuePayload<K>;
}

// ─── fingerprint ─────────────────────────────────────────────────────────

const FINGERPRINT_VERSION = "v1";
const MARKER_PREFIX = "euro-digest:fingerprint=";
const RECURRENCE_PREFIX = "euro-digest:recurrence=";
const FINGERPRINT_PATTERN = /<!-- euro-digest:fingerprint=([0-9a-f]{12}) -->/g;

/** 원인 키 정규화 — 앞뒤 공백 제거·소문자. 비었거나 너무 길거나 줄바꿈이 있으면 오류. */
export function normalizeIssueKey(key: string): string {
  const normalized = key.trim().toLowerCase();
  if (!normalized) throw new IssuePayloadError("key", ["원인 키가 비어 있다"]);
  if (normalized.length > KEY_MAX_LENGTH || /[\r\n]/.test(normalized)) {
    throw new IssuePayloadError("key", [
      `원인 키는 줄바꿈 없이 ${KEY_MAX_LENGTH}자 이하`,
    ]);
  }
  return normalized;
}

/**
 * 같은 원인을 가리키는 안정적 짧은 해시 — sha256(`v1|kind|key`)의 16진수 앞 12자리(48비트).
 * key는 normalizeIssueKey로 맞춘 뒤 해시한다(`Collect:Collect ` == `collect:collect`).
 * 규칙을 바꾸면 열린 이슈와 매칭이 끊기므로 FINGERPRINT_VERSION을 올리고 이유를 남긴다.
 */
export function issueFingerprint(kind: IssueKind, key: string): string {
  return createHash("sha256")
    .update(`${FINGERPRINT_VERSION}|${kind}|${normalizeIssueKey(key)}`)
    .digest("hex")
    .slice(0, 12);
}

export function fingerprintMarker(fingerprint: string): string {
  return `<!-- ${MARKER_PREFIX}${fingerprint} -->`;
}

function recurrenceMarker(fingerprint: string): string {
  return `<!-- ${RECURRENCE_PREFIX}${fingerprint} -->`;
}

/** 본문에서 fingerprint 마커를 모두 꺼낸다. */
export function extractFingerprints(body: string | null | undefined): string[] {
  if (!body) return [];
  return [...body.matchAll(FINGERPRINT_PATTERN)].map((m) => m[1] ?? "");
}

/** 종류별 기본 원인 키 — reportIssue에 key를 주지 않으면 이것을 쓴다. */
export function defaultIssueKey<K extends IssueKind>(
  kind: K,
  payload: IssuePayloadInput<K>,
): string {
  switch (kind) {
    case "pipeline-failure": {
      const p = parseIssuePayload("pipeline-failure", payload);
      return `${p.workflow}:${p.failedJobs.length ? [...p.failedJobs].sort().join("+") : "unknown"}`;
    }
    case "source-broken":
      return parseIssuePayload("source-broken", payload).sourceId;
    case "source-health":
      return parseIssuePayload("source-health", payload).sourceId;
    case "ops-report":
      return parseIssuePayload("ops-report", payload).week;
    default: {
      const unknownKind: never = kind;
      throw new IssuePayloadError(String(unknownKind), ["알 수 없는 kind"]);
    }
  }
}

// ─── 마크다운 안전 처리 ──────────────────────────────────────────────────

/** `@이름`이 멘션 알림을 보내지 않게 `@` 뒤에 폭 없는 공백을 넣는다. */
function neutralizeMentions(text: string): string {
  return text.replace(/@(?=[A-Za-z0-9])/g, "@​");
}

/** 한 줄 텍스트 — 가리기·자르기·줄바꿈 접기·멘션 끊기 */
export function inlineText(value: string, max: number = TEXT_MAX): string {
  return neutralizeMentions(
    sanitizeText(value.replace(/\s+/g, " ").trim(), max),
  );
}

/** 표 칸 — inlineText + `|` 이스케이프 */
export function tableCell(value: string, max: number = TEXT_MAX): string {
  return inlineText(value, max).replace(/\|/g, "\\|");
}

/** 코드 스팬 — 안의 백틱 개수보다 긴 울타리를 쓴다(멘션도 코드 안에서는 알림이 가지 않는다). */
export function codeSpan(value: string, max: number = TEXT_MAX): string {
  const text = sanitizeText(value.replace(/\s+/g, " ").trim(), max);
  const longest = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((s) => s.length),
  );
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** 여러 줄 메모 — 가리기·자르기·멘션 끊기(줄바꿈 유지) */
function noteText(value: string): string {
  return neutralizeMentions(sanitizeText(value.trim(), NOTE_MAX));
}

function link(label: string, url: string | undefined): string {
  return url ? `[${label.replace(/[[\]]/g, "")}](${url})` : label;
}

/** 실행 링크 표기 — `[실행 123456 (시도 2)](url)` */
function runLink(url: string | undefined, attempt?: number): string {
  if (!url) return "(실행 링크 없음)";
  const id = /\/runs\/(\d+)/.exec(url)?.[1];
  const label = `${id ? `실행 ${id}` : "실행"}${attempt ? ` (시도 ${attempt})` : ""}`;
  return link(label, url);
}

function kstDateTime(iso: string): string {
  return `${formatKst(iso, "fullDate")} ${formatKst(iso, "time")} KST`;
}

function capBody(body: string): string {
  if (body.length <= MAX_BODY_LENGTH) return body;
  const notice = "\n\n…(본문이 길어 잘렸습니다)\n";
  // 마커는 끝에 있으므로 잘라도 남도록 마지막 줄을 보존한다
  const lastLineStart = body.lastIndexOf("\n<!--");
  const tail = lastLineStart >= 0 ? body.slice(lastLineStart) : "";
  return `${body.slice(0, MAX_BODY_LENGTH - notice.length - tail.length)}${notice}${tail}`;
}

function footer(kind: IssueKind, key: string, fingerprint: string): string[] {
  return [
    "",
    "---",
    `<sub>자동 생성 · euro-digest 이슈 헬퍼(scripts/lib/github-issues.ts) · 원인 \`${kind}\` / \`${key.replace(/`/g, "")}\` — 이 이슈가 열려 있는 동안 같은 원인은 새 이슈 대신 댓글로 쌓입니다. 해결되면 닫아 주세요(닫힌 뒤 재발하면 새 이슈가 열립니다).</sub>`,
    "",
    fingerprintMarker(fingerprint),
  ];
}

// ─── 템플릿 ──────────────────────────────────────────────────────────────

export interface BuiltIssue {
  title: string;
  body: string;
  labels: string[];
  fingerprint: string;
  key: string;
}

export interface BuildOptions {
  /** 원인 키 — 생략하면 defaultIssueKey */
  key?: string;
  /** payload.occurredAt이 없을 때 쓸 현재 시각 */
  now?: Date;
}

interface WorkflowInfo {
  label: string;
  notes: string[];
  rerun: string[];
}

/** 워크플로별 안내 — 모르는 워크플로는 일반 문구 */
const WORKFLOW_INFO: Readonly<Record<string, WorkflowInfo>> = {
  collect: {
    label: "일일 수집",
    notes: [
      "guard·collect가 실패했다면 data 커밋·배포는 일어나지 않았고 사이트는 전날 상태로 유지됩니다.",
      "collect가 커밋한 뒤 deploy만 실패했다면 data는 main에 있지만 사이트에는 아직 반영되지 않았습니다.",
    ],
    rerun: [
      "guard·collect 실패: Actions → Collect → Run workflow로 재실행 (12시간 안 성공 이력이 있으면 force)",
      "deploy만 실패: Actions → Deploy → Run workflow (Use workflow from: main, ref: main)",
    ],
  },
  weekly: {
    label: "주간 작업",
    notes: [
      "실패한 단계 이후의 팀 프로필·주간 리포트·운영 리포트는 갱신되지 않았습니다.",
    ],
    rerun: ["Actions → Weekly → Run workflow로 재실행"],
  },
};

function workflowInfo(workflow: string): WorkflowInfo {
  return (
    WORKFLOW_INFO[workflow] ?? {
      label: `${workflow} 워크플로`,
      notes: [],
      rerun: [`Actions → ${workflow} → Run workflow로 재실행`],
    }
  );
}

function jobTable(jobs: IssuePayload<"pipeline-failure">["jobs"]): string[] {
  if (jobs.length === 0) return [];
  return [
    "| job | 결과 |",
    "|---|---|",
    ...jobs.map(
      (j) =>
        `| ${tableCell(j.job, 100)} | ${tableCell(j.result, 40)}${j.note ? ` · ${tableCell(j.note, 200)}` : ""} |`,
    ),
  ];
}

function failedJobsText(failedJobs: readonly string[]): string {
  return failedJobs.length
    ? failedJobs.map((j) => inlineText(j, 100)).join(", ")
    : "알 수 없음";
}

function buildPipelineFailure(
  p: IssuePayload<"pipeline-failure">,
  occurredAt: string,
): { title: string; body: string[] } {
  const info = workflowInfo(p.workflow);
  const failed = failedJobsText(p.failedJobs);
  const title = `[${p.workflow}] ${info.label} 실패 (${failed}) — ${kstDate(occurredAt)}`;
  const body = [
    `${p.workflow}.yml ${info.label} 실행이 실패했습니다.`,
    "",
    "| 항목 | 값 |",
    "|---|---|",
    `| 실행 | ${runLink(p.runUrl, p.runAttempt)} |`,
    `| 트리거 | ${p.event ? tableCell(p.event, 60) : "?"} |`,
    `| 시각 (KST) | ${kstDateTime(occurredAt)} |`,
    `| 실패 job | ${tableCell(failed)} |`,
    "",
    ...(p.jobs.length ? [...jobTable(p.jobs), ""] : []),
    ...info.notes.map((n) => `- ${n}`),
    ...(info.notes.length ? [""] : []),
    ...(p.note ? [noteText(p.note), ""] : []),
    "### 다음 조치",
    "- [ ] 실행 로그에서 실패한 단계와 원인 확인 (비밀값·전체 응답 본문은 이슈에 붙이지 않는다)",
    "- [ ] 원인 수정 — 설정은 configs/, 코드는 scripts/ (data/는 손으로 고치지 않는다)",
    ...info.rerun.map((r) => `- [ ] ${r}`),
    "- [ ] 정상 실행 확인 후 이 이슈 닫기",
  ];
  return { title, body };
}

/** 이슈 폼과 같은 `### <라벨>` 블록 — 빈 값은 `_No response_` */
function formSections(values: readonly (string | undefined)[]): string[] {
  return SOURCE_FORM_HEADINGS.flatMap((heading, i) => {
    const value = values[i];
    return [
      `### ${heading}`,
      "",
      value && value.trim() ? value : NO_RESPONSE,
      "",
    ];
  });
}

function sourceLabel(p: {
  sourceId: string;
  sourceName?: string | undefined;
}): string {
  return p.sourceName
    ? `${inlineText(p.sourceName, 100)} (${inlineText(p.sourceId, 100)})`
    : inlineText(p.sourceId, 100);
}

function buildSourceBroken(
  p: IssuePayload<"source-broken">,
  occurredAt: string,
): { title: string; body: string[] } {
  const firstSeen = p.firstSeen ?? kstDate(occurredAt);
  const memo = [
    ...(p.error ? [`- 오류: ${codeSpan(p.error)}`] : []),
    ...(p.httpStatus ? [`- HTTP 상태: ${p.httpStatus}`] : []),
    ...(p.sourceName ? [`- 매체: ${inlineText(p.sourceName, 100)}`] : []),
    `- 발생 시각: ${kstDateTime(occurredAt)}`,
    "- 이 소스만 건너뛰고 나머지 수집은 계속했습니다 (소스 실패 격리, FR-08).",
    ...(p.note ? ["", noteText(p.note)] : []),
  ].join("\n");
  const symptom = p.symptoms[0] ?? "기타";
  return {
    title: `[소스 고장] ${inlineText(p.sourceId, 100)} — ${symptom}`,
    body: formSections([
      inlineText(p.sourceId, 100),
      p.symptoms.join(", "),
      firstSeen,
      p.runUrl ??
        (p.runId ? `runs.json 실행 ID ${inlineText(p.runId, 100)}` : undefined),
      memo,
    ]),
  };
}

function sourceRunsTable(
  runs: IssuePayload<"source-health">["runs"],
): string[] {
  return [
    "| 실행 (KST) | 결과 | 건수 |",
    "|---|---|---:|",
    ...runs.map((r) => {
      const when = `${formatKst(r.startedAt, "date")} ${formatKst(r.startedAt, "time")}`;
      return `| ${r.runUrl ? link(when, r.runUrl) : when} | ${r.ok ? "성공" : "실패"} | ${r.items} |`;
    }),
  ];
}

function buildSourceHealth(
  p: IssuePayload<"source-health">,
  occurredAt: string,
): { title: string; body: string[] } {
  const firstZero = p.runs.find((r) => r.items === 0)?.startedAt;
  const firstSeen = p.firstSeen ?? kstDate(firstZero ?? occurredAt);
  const memo = [
    `${sourceLabel(p)}에서 **${p.zeroDays}일 연속 0건**이 수집됐습니다 (소스 건강도, FR-11).`,
    "",
    "최근 실행별 수집 건수:",
    "",
    ...sourceRunsTable(p.runs),
    "",
    "- 피드 URL·구조 변경, 약관·robots.txt 변경, 매체 휴간 여부를 확인해 주세요.",
    "- 대체 소스가 필요하면 `/add-source` 절차로 추가합니다.",
    ...(p.note ? ["", noteText(p.note)] : []),
  ].join("\n");
  return {
    title: `[소스 고장] ${inlineText(p.sourceId, 100)} — ${p.zeroDays}일 연속 0건`,
    body: formSections([
      inlineText(p.sourceId, 100),
      "0건 수집",
      firstSeen,
      p.runUrl,
      memo,
    ]),
  };
}

/** FR-155 주간 운영 리포트 기본 섹션 — M5에서 코드로 채운다(LLM 미사용) */
const OPS_REPORT_SECTIONS = [
  "비용",
  "실행 성공률",
  "소스 건강도",
  "미등록 고유명사",
] as const;

function buildOpsReport(
  p: IssuePayload<"ops-report">,
  occurredAt: string,
): { title: string; body: string[] } {
  const range = p.from && p.to ? ` (${p.from} ~ ${p.to})` : "";
  const given = new Map(p.sections.map((s) => [s.heading, s.body]));
  const headings = [
    ...OPS_REPORT_SECTIONS,
    ...p.sections
      .map((s) => s.heading)
      .filter((h) => !(OPS_REPORT_SECTIONS as readonly string[]).includes(h)),
  ];
  return {
    title: `[운영 리포트] ${p.week}${range}`,
    body: [
      `${p.week}${range} 주간 운영 리포트입니다. 생성 시각 ${kstDateTime(occurredAt)}. (코드 생성, LLM 미사용)`,
      "",
      ...headings.flatMap((h) => [
        `### ${inlineText(h, 80)}`,
        "",
        given.has(h)
          ? neutralizeMentions(sanitizeText(given.get(h) ?? "", 20_000))
          : "_M5(FR-155)에서 채운다_",
        "",
      ]),
    ],
  };
}

/** 새 이슈 { title, body, labels } — 본문 끝에 fingerprint 마커. payload는 여기서 zod로 검증한다. */
export function buildIssue<K extends IssueKind>(
  kind: K,
  payload: IssuePayloadInput<K>,
  options: BuildOptions = {},
): BuiltIssue {
  const key = normalizeIssueKey(options.key ?? defaultIssueKey(kind, payload));
  const fingerprint = issueFingerprint(kind, key);
  const parsed = parseIssuePayload(kind, payload);
  const occurredAt = parsed.occurredAt ?? nowUtcIso(options.now ?? new Date());
  let built: { title: string; body: string[] };
  switch (kind) {
    case "pipeline-failure":
      built = buildPipelineFailure(
        parsed as IssuePayload<"pipeline-failure">,
        occurredAt,
      );
      break;
    case "source-broken":
      built = buildSourceBroken(
        parsed as IssuePayload<"source-broken">,
        occurredAt,
      );
      break;
    case "source-health":
      built = buildSourceHealth(
        parsed as IssuePayload<"source-health">,
        occurredAt,
      );
      break;
    case "ops-report":
      built = buildOpsReport(parsed as IssuePayload<"ops-report">, occurredAt);
      break;
    default: {
      const unknownKind: never = kind;
      throw new IssuePayloadError(String(unknownKind), ["알 수 없는 kind"]);
    }
  }
  return {
    title: truncateTitle(built.title),
    body: capBody(
      [...built.body, ...footer(kind, key, fingerprint)].join("\n"),
    ),
    labels: [...ISSUE_LABELS[kind]],
    fingerprint,
    key,
  };
}

/** GitHub 제목 한도(256자)보다 짧게 */
function truncateTitle(title: string): string {
  return title.length <= 200 ? title : `${title.slice(0, 199)}…`;
}

export interface CommentOptions extends BuildOptions {
  /** 이번이 몇 번째 발생인지(원래 이슈 = 1). 모르면 생략 */
  occurrence?: number;
}

/** 재발 댓글 — 발생 시각·실행 링크·(알면) 누적 횟수. 끝에 재발 마커(횟수 집계용). */
export function buildComment<K extends IssueKind>(
  kind: K,
  payload: IssuePayloadInput<K>,
  options: CommentOptions = {},
): string {
  const key = normalizeIssueKey(options.key ?? defaultIssueKey(kind, payload));
  const fingerprint = issueFingerprint(kind, key);
  const parsed = parseIssuePayload(kind, payload);
  const occurredAt = parsed.occurredAt ?? nowUtcIso(options.now ?? new Date());
  const nth = options.occurrence ? ` · ${options.occurrence}번째` : "";
  let lines: string[];
  switch (kind) {
    case "pipeline-failure": {
      const p = parsed as IssuePayload<"pipeline-failure">;
      lines = [
        `### 다시 실패 — ${kstDateTime(occurredAt)}${nth}`,
        "",
        `- 실행: ${runLink(p.runUrl, p.runAttempt)}`,
        `- 트리거: ${p.event ? inlineText(p.event, 60) : "?"}`,
        `- 실패 job: ${failedJobsText(p.failedJobs)}`,
        ...(p.jobs.length ? ["", ...jobTable(p.jobs)] : []),
        ...(p.note ? ["", noteText(p.note)] : []),
      ];
      break;
    }
    case "source-broken": {
      const p = parsed as IssuePayload<"source-broken">;
      lines = [
        `### 다시 발생 — ${kstDateTime(occurredAt)}${nth}`,
        "",
        `- 증상: ${p.symptoms.join(", ")}`,
        ...(p.error ? [`- 오류: ${codeSpan(p.error)}`] : []),
        ...(p.httpStatus ? [`- HTTP 상태: ${p.httpStatus}`] : []),
        `- 실행: ${p.runUrl ? runLink(p.runUrl) : p.runId ? `runs.json 실행 ID ${inlineText(p.runId, 100)}` : "(실행 링크 없음)"}`,
        ...(p.note ? ["", noteText(p.note)] : []),
      ];
      break;
    }
    case "source-health": {
      const p = parsed as IssuePayload<"source-health">;
      lines = [
        `### 여전히 0건 — ${kstDateTime(occurredAt)} · ${p.zeroDays}일 연속${nth}`,
        "",
        ...sourceRunsTable(p.runs),
        ...(p.runUrl ? ["", `- 실행: ${runLink(p.runUrl)}`] : []),
        ...(p.note ? ["", noteText(p.note)] : []),
      ];
      break;
    }
    case "ops-report": {
      const built = buildOpsReport(
        parsed as IssuePayload<"ops-report">,
        occurredAt,
      );
      lines = [
        `### 리포트 다시 생성 — ${kstDateTime(occurredAt)}${nth}`,
        "",
        ...built.body,
      ];
      break;
    }
    default: {
      const unknownKind: never = kind;
      throw new IssuePayloadError(String(unknownKind), ["알 수 없는 kind"]);
    }
  }
  return capBody([...lines, "", recurrenceMarker(fingerprint)].join("\n"));
}

// ─── GitHub 응답 파싱·매칭 (순수) ────────────────────────────────────────

const LabelSchema = z.union([
  z.string(),
  z.object({ name: z.string().nullish() }),
]);

/** 목록 API의 이슈 1건 — 필요한 필드만(나머지는 무시) */
export const GitHubIssueSchema = z.object({
  number: z.number().int().positive(),
  html_url: z.string(),
  state: z.string(),
  body: z.string().nullish(),
  comments: z.number().int().nonnegative().optional(),
  labels: z.array(LabelSchema).default([]),
  pull_request: z.unknown().optional(),
});
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;

const GitHubIssueListSchema = z.array(z.unknown());
const CreatedIssueSchema = z.object({
  number: z.number().int().positive(),
  html_url: z.string(),
});
const CreatedCommentSchema = z.object({ html_url: z.string() });
const CommentListSchema = z.array(z.object({ body: z.string().nullish() }));

function labelNames(issue: GitHubIssue): string[] {
  return issue.labels.flatMap((l) =>
    typeof l === "string" ? [l] : l.name ? [l.name] : [],
  );
}

/**
 * 같은 원인의 열린 이슈를 고른다 — 열림 + 라벨 + 본문 마커. PR은 제외. 여럿이면 번호가 가장 작은 것.
 * 닫힌 이슈는 해결된 것으로 보고 고르지 않는다(재발하면 새 이슈).
 */
export function findMatchingIssue(
  issues: readonly GitHubIssue[],
  match: { fingerprint: string; label: string },
): GitHubIssue | null {
  const candidates = issues.filter(
    (issue) =>
      issue.state === "open" &&
      issue.pull_request === undefined &&
      labelNames(issue).includes(match.label) &&
      extractFingerprints(issue.body).includes(match.fingerprint),
  );
  candidates.sort((a, b) => a.number - b.number);
  return candidates[0] ?? null;
}

/** Link 헤더의 rel="next" URL. 다른 호스트를 가리키면 따라가지 않는다(토큰을 다른 곳에 보내지 않게). */
export function parseNextLink(
  linkHeader: string | null,
  apiUrl: string,
): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="([^"]+)"/.exec(part.trim());
    if (!match || !match[2]?.split(/\s+/).includes("next")) continue;
    const url = match[1] ?? "";
    try {
      return new URL(url).origin === new URL(apiUrl).origin ? url : null;
    } catch {
      return null;
    }
  }
  return null;
}

// ─── HTTP ────────────────────────────────────────────────────────────────

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** 내부 HTTP 오류 — 메시지에는 상태·GitHub의 짧은 message만(가리고 자름) */
class GitHubHttpError extends Error {
  override readonly name = "GitHubHttpError";
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly retryable: boolean,
    readonly retryAfterMs: number | undefined,
  ) {
    super(message);
  }
}

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

interface HttpContext {
  fetch: FetchLike;
  apiUrl: string;
  token: string | undefined;
}

function headersFor(
  token: string | undefined,
  json: boolean,
): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": USER_AGENT,
    ...(json ? { "content-type": "application/json" } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

function retryAfterMs(response: Response): number | undefined {
  const raw = response.headers.get("retry-after");
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

async function errorFromResponse(response: Response): Promise<GitHubHttpError> {
  let detail = "";
  try {
    const parsed = z
      .object({ message: z.string() })
      .safeParse(await response.json());
    if (parsed.success) detail = ` — ${sanitizeText(parsed.data.message, 120)}`;
  } catch {
    // 본문이 JSON이 아니면 상태만 쓴다(본문은 남기지 않는다)
  }
  const status = response.status;
  const wait = retryAfterMs(response);
  const rateLimited =
    status === 429 ||
    (status === 403 &&
      (wait !== undefined ||
        response.headers.get("x-ratelimit-remaining") === "0"));
  return new GitHubHttpError(
    `HTTP ${status}${response.statusText ? ` ${response.statusText}` : ""}${detail}`,
    status,
    status >= 500 || rateLimited,
    wait,
  );
}

async function request(
  ctx: HttpContext,
  method: "GET" | "POST",
  url: string,
  body?: unknown,
): Promise<{ data: unknown; link: string | null }> {
  let response: Response;
  try {
    response = await ctx.fetch(url, {
      method,
      headers: headersFor(ctx.token, body !== undefined),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    throw new GitHubHttpError(
      `연결 실패 — ${sanitizeText(message, 120)}`,
      undefined,
      true,
      undefined,
    );
  }
  if (!response.ok) throw await errorFromResponse(response);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new GitHubHttpError(
      `HTTP ${response.status} 응답이 JSON이 아님`,
      response.status,
      false,
      undefined,
    );
  }
  return { data, link: response.headers.get("link") };
}

function apiBase(apiUrl: string, repo: string): string {
  return `${apiUrl.replace(/\/+$/, "")}/repos/${repo}`;
}

/** 열린 이슈 검색 — 라벨로 거른 목록을 작성일 오름차순으로 넘기며 첫 매칭에서 멈춘다. */
async function findOpenIssue(
  ctx: HttpContext,
  repo: string,
  match: { fingerprint: string; label: string },
): Promise<{ issue: GitHubIssue | null; pages: number }> {
  const params = new URLSearchParams({
    state: "open",
    labels: match.label,
    sort: "created",
    direction: "asc",
    per_page: String(PER_PAGE),
  });
  let url: string | null = `${apiBase(ctx.apiUrl, repo)}/issues?${params}`;
  let pages = 0;
  while (url && pages < MAX_PAGES) {
    const page = await request(ctx, "GET", url);
    pages += 1;
    const list = GitHubIssueListSchema.safeParse(page.data);
    if (!list.success) {
      throw new GitHubHttpError(
        "이슈 목록 응답 형식이 예상과 다름",
        undefined,
        false,
        undefined,
      );
    }
    const issues = list.data.flatMap((item) => {
      const parsed = GitHubIssueSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
    const found = findMatchingIssue(issues, match);
    if (found) return { issue: found, pages };
    url = parseNextLink(page.link, ctx.apiUrl);
  }
  return { issue: null, pages };
}

/** 지금까지의 재발 댓글 수 — 실패하면 undefined(횟수 없이 댓글만 단다) */
async function countRecurrences(
  ctx: HttpContext,
  repo: string,
  issue: GitHubIssue,
  fingerprint: string,
): Promise<number | undefined> {
  if (issue.comments === 0) return 0;
  const marker = recurrenceMarker(fingerprint);
  let url: string | null =
    `${apiBase(ctx.apiUrl, repo)}/issues/${issue.number}/comments?per_page=${PER_PAGE}`;
  let count = 0;
  let pages = 0;
  try {
    while (url && pages < MAX_COMMENT_PAGES) {
      const page = await request(ctx, "GET", url);
      pages += 1;
      const list = CommentListSchema.safeParse(page.data);
      if (!list.success) return undefined;
      count += list.data.filter((c) => c.body?.includes(marker)).length;
      url = parseNextLink(page.link, ctx.apiUrl);
    }
    return url ? undefined : count;
  } catch {
    return undefined;
  }
}

// ─── 보고 (I/O) ──────────────────────────────────────────────────────────

export interface ReportIssueOptions<K extends IssueKind = IssueKind> {
  kind: K;
  /** 원인 키 — 생략하면 defaultIssueKey(kind, payload) */
  key?: string;
  payload: IssuePayloadInput<K>;
  /** `owner/name` */
  repo: string;
  /** issues: write 권한 토큰. 로그·오류에 남기지 않는다 */
  token: string;
  fetch?: FetchLike;
  apiUrl?: string;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  logger?: Logger;
  retry?: Partial<IssueRetryPolicy>;
  /** 같은 실행 안 중복 방지 캐시 — 기본은 모듈 전역 */
  cache?: ReportCache;
}

export interface ReportResult {
  action: "created" | "commented";
  /** 이슈 번호 */
  number: number;
  /** 이슈 URL */
  url: string;
  /** 댓글이면 댓글 URL */
  commentUrl?: string;
  fingerprint: string;
  key: string;
  /** 이번이 몇 번째 발생인지(알 때만, 새 이슈 = 1) */
  occurrence?: number;
  /** 같은 실행에서 이미 보고한 원인이라 캐시 결과를 돌려줌(요청 없음) */
  deduped: boolean;
}

export type ReportCache = Map<string, Promise<ReportResult>>;

const DEFAULT_CACHE: ReportCache = new Map();

/** 모듈 전역 중복 방지 캐시를 비운다(테스트·한 프로세스에서 여러 실행을 돌릴 때) */
export function clearReportCache(): void {
  DEFAULT_CACHE.clear();
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function delayFor(
  retryNumber: number,
  policy: IssueRetryPolicy,
  hint?: number,
): number {
  const exponential = policy.baseDelayMs * 2 ** (retryNumber - 1);
  return Math.min(Math.max(exponential, hint ?? 0), policy.maxDelayMs);
}

interface Prepared {
  kind: IssueKind;
  key: string;
  fingerprint: string;
  label: string;
}

function prepare<K extends IssueKind>(
  kind: K,
  key: string | undefined,
  payload: IssuePayloadInput<K>,
): Prepared {
  if (!isIssueKind(kind)) {
    throw new IssueReportError(
      `알 수 없는 kind: ${inlineText(String(kind), 40)}`,
      {
        reason: "payload",
        kind: String(kind),
      },
    );
  }
  try {
    const normalizedKey = normalizeIssueKey(
      key ?? defaultIssueKey(kind, payload),
    );
    parseIssuePayload(kind, payload);
    return {
      kind,
      key: normalizedKey,
      fingerprint: issueFingerprint(kind, normalizedKey),
      label: SEARCH_LABEL[kind],
    };
  } catch (error) {
    if (error instanceof IssuePayloadError) {
      throw new IssueReportError(error.message, { reason: "payload", kind });
    }
    throw error;
  }
}

function checkRepo(repo: string, kind: string): void {
  if (!REPO_PATTERN.test(repo)) {
    throw new IssueReportError(
      `저장소 형식이 owner/name이 아님: ${inlineText(repo, 100)}`,
      {
        reason: "config",
        kind,
      },
    );
  }
}

/**
 * 같은 원인의 열린 이슈가 있으면 댓글, 없으면 새 이슈. 실패하면 IssueReportError(파이프라인은 잡고 계속).
 * 같은 실행 안에서 같은 fingerprint는 한 번만 요청한다(두 번째부터 deduped: true).
 */
export async function reportIssue<K extends IssueKind>(
  options: ReportIssueOptions<K>,
): Promise<ReportResult> {
  const prepared = prepare(options.kind, options.key, options.payload);
  checkRepo(options.repo, prepared.kind);
  if (!options.token) {
    throw new IssueReportError(
      "GitHub 토큰이 없다 (GITHUB_TOKEN, issues: write)",
      {
        reason: "config",
        kind: prepared.kind,
        fingerprint: prepared.fingerprint,
      },
    );
  }
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  const cache = options.cache ?? DEFAULT_CACHE;
  const cacheKey = `${apiUrl}|${options.repo}|${prepared.fingerprint}`;
  const log = options.logger ?? createLogger({ scope: "issues" });

  const cached = cache.get(cacheKey);
  if (cached) {
    const first = await cached;
    log.info("issues.dedupe", {
      kind: prepared.kind,
      fingerprint: prepared.fingerprint,
      number: first.number,
    });
    return { ...first, deduped: true };
  }

  const pending = runReport(options, prepared, apiUrl, log);
  cache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    // 실패한 원인은 같은 실행에서 다시 시도할 수 있게 캐시에서 뺀다
    cache.delete(cacheKey);
    throw error;
  }
}

async function runReport<K extends IssueKind>(
  options: ReportIssueOptions<K>,
  prepared: Prepared,
  apiUrl: string,
  log: Logger,
): Promise<ReportResult> {
  const ctx: HttpContext = {
    fetch: options.fetch ?? fetch,
    apiUrl,
    token: options.token,
  };
  const policy: IssueRetryPolicy = { ...DEFAULT_ISSUE_RETRY, ...options.retry };
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? (() => new Date());
  const { kind, key, fingerprint, label } = prepared;

  for (let attempt = 1; ; attempt += 1) {
    try {
      const { issue, pages } = await findOpenIssue(ctx, options.repo, {
        fingerprint,
        label,
      });
      log.info("issues.search", {
        kind,
        fingerprint,
        label,
        pages,
        found: issue?.number ?? null,
      });
      if (issue) {
        const previous = await countRecurrences(
          ctx,
          options.repo,
          issue,
          fingerprint,
        );
        const occurrence = previous === undefined ? undefined : previous + 2;
        const body = buildComment(options.kind, options.payload, {
          key,
          now: now(),
          ...(occurrence ? { occurrence } : {}),
        });
        const created = CreatedCommentSchema.parse(
          (
            await request(
              ctx,
              "POST",
              `${apiBase(apiUrl, options.repo)}/issues/${issue.number}/comments`,
              { body },
            )
          ).data,
        );
        log.info("issues.comment", {
          kind,
          fingerprint,
          number: issue.number,
          occurrence: occurrence ?? null,
          attempt,
        });
        return {
          action: "commented",
          number: issue.number,
          url: issue.html_url,
          commentUrl: created.html_url,
          fingerprint,
          key,
          ...(occurrence ? { occurrence } : {}),
          deduped: false,
        };
      }
      const built = buildIssue(options.kind, options.payload, {
        key,
        now: now(),
      });
      const created = CreatedIssueSchema.parse(
        (
          await request(
            ctx,
            "POST",
            `${apiBase(apiUrl, options.repo)}/issues`,
            {
              title: built.title,
              body: built.body,
              labels: built.labels,
            },
          )
        ).data,
      );
      log.info("issues.create", {
        kind,
        fingerprint,
        number: created.number,
        attempt,
      });
      return {
        action: "created",
        number: created.number,
        url: created.html_url,
        fingerprint,
        key,
        occurrence: 1,
        deduped: false,
      };
    } catch (error) {
      const http = error instanceof GitHubHttpError ? error : null;
      const retryable = http?.retryable ?? false;
      if (!retryable || attempt > policy.maxRetries) {
        const message =
          http?.message ??
          (error instanceof z.ZodError
            ? "GitHub 응답 형식이 예상과 다름"
            : error instanceof Error
              ? sanitizeText(error.message, 200)
              : "알 수 없는 오류");
        log.warn("issues.fail", {
          kind,
          fingerprint,
          status: http?.status ?? null,
          retryable,
          attempts: attempt,
          message,
        });
        throw new IssueReportError(
          `이슈 보고 실패 (${kind}, ${attempt}회 시도): ${message}`,
          {
            reason: "api",
            kind,
            fingerprint,
            ...(http?.status !== undefined ? { status: http.status } : {}),
            retryable,
            attempts: attempt,
          },
        );
      }
      const delayMs = delayFor(attempt, policy, http?.retryAfterMs);
      log.warn("issues.retry", {
        kind,
        fingerprint,
        status: http?.status ?? null,
        attempt,
        delayMs,
      });
      await sleep(delayMs);
    }
  }
}

export type TryReportResult =
  { ok: true; result: ReportResult } | { ok: false; error: IssueReportError };

/** 던지지 않는 판 — 파이프라인 단계에서 `if (!r.ok) …`로 이어서 진행할 때. 예상 밖 오류도 IssueReportError로 감싼다. */
export async function tryReportIssue<K extends IssueKind>(
  options: ReportIssueOptions<K>,
): Promise<TryReportResult> {
  try {
    return { ok: true, result: await reportIssue(options) };
  } catch (error) {
    if (error instanceof IssueReportError) return { ok: false, error };
    return {
      ok: false,
      error: new IssueReportError(
        `이슈 보고 중 예상 밖 오류: ${error instanceof Error ? sanitizeText(error.message, 200) : "알 수 없음"}`,
        { reason: "api", kind: String(options.kind) },
      ),
    };
  }
}

// ─── dry-run (읽기만) ────────────────────────────────────────────────────

export interface PreviewOptions<K extends IssueKind = IssueKind> {
  kind: K;
  key?: string;
  payload: IssuePayloadInput<K>;
  /** 없으면 검색을 건너뛰고 새 이슈 모양만 보여 준다 */
  repo?: string;
  /** 없어도 된다(공개 저장소는 비인증 GET, 시간당 60회) */
  token?: string;
  fetch?: FetchLike;
  apiUrl?: string;
  now?: () => Date;
}

export type PreviewResult =
  | {
      action: "would-create";
      lookup: "searched" | "skipped";
      issue: BuiltIssue;
    }
  | {
      action: "would-comment";
      lookup: "searched";
      number: number;
      url: string;
      comment: string;
      fingerprint: string;
      key: string;
    };

/**
 * 만들 이슈·댓글을 미리 본다 — GET만 보내고 생성·댓글 요청은 절대 보내지 않는다(재시도도 없음).
 * repo가 없으면 검색 없이 새 이슈 모양만 돌려준다.
 */
export async function previewReport<K extends IssueKind>(
  options: PreviewOptions<K>,
): Promise<PreviewResult> {
  const prepared = prepare(options.kind, options.key, options.payload);
  const now = (options.now ?? (() => new Date()))();
  const issue = buildIssue(options.kind, options.payload, {
    key: prepared.key,
    now,
  });
  if (!options.repo)
    return { action: "would-create", lookup: "skipped", issue };
  checkRepo(options.repo, prepared.kind);
  const ctx: HttpContext = {
    fetch: options.fetch ?? fetch,
    apiUrl: options.apiUrl ?? DEFAULT_API_URL,
    token: options.token || undefined,
  };
  let found: GitHubIssue | null;
  try {
    found = (await findOpenIssue(ctx, options.repo, prepared)).issue;
  } catch (error) {
    throw new IssueReportError(
      `dry-run 검색 실패: ${error instanceof Error ? error.message : "알 수 없음"}`,
      {
        reason: "api",
        kind: prepared.kind,
        fingerprint: prepared.fingerprint,
        ...(error instanceof GitHubHttpError && error.status !== undefined
          ? { status: error.status }
          : {}),
      },
    );
  }
  if (!found) return { action: "would-create", lookup: "searched", issue };
  const previous = await countRecurrences(
    ctx,
    options.repo,
    found,
    prepared.fingerprint,
  );
  const occurrence = previous === undefined ? undefined : previous + 2;
  return {
    action: "would-comment",
    lookup: "searched",
    number: found.number,
    url: found.html_url,
    comment: buildComment(options.kind, options.payload, {
      key: prepared.key,
      now,
      ...(occurrence ? { occurrence } : {}),
    }),
    fingerprint: prepared.fingerprint,
    key: prepared.key,
  };
}
