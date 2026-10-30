/**
 * GitHub 이슈 자동 보고 — 같은 원인은 기존 이슈에 댓글 (M0-22, PRD FR-08·FR-11·FR-152·FR-155, CLAUDE.md §6.4).
 *
 * 구성
 *   - 순수 함수: issueFingerprint · defaultIssueKey · buildIssue · buildComment · findMatchingIssue ·
 *     extractFingerprints · parseNextLink
 *   - I/O: reportIssue(생성 또는 댓글) · tryReportIssue(던지지 않는 판) · previewReport(dry-run, 읽기만)
 *
 * "같은 원인" = 종류(kind) + 원인 키(key)
 *   - pipeline-failure  key `<워크플로>:<실패 job>[/<멈춘 단계>]` (예: `collect:collect/validate`, `collect:guard`,
 *                       `collect:deploy`) — job별·단계별로 다른 이슈(M1-27 — 검증 실패·빌드 실패·rebase 충돌이 한 이슈에 섞이지
 *                       않게). 단계는 job 출력 `step`(collect.yml `실패 단계 기록`)이 있을 때만 붙는다 — 없으면 `<워크플로>:<job>`.
 *   - pipeline-partial  key `<워크플로>:partial:<사유>` (예: `collect:partial:purge`) — 수집 단계 안에서 실패했지만 실행은 계속된
 *                       (수집 판정 partial — 발행 여부는 뒤 단계에 달림) 사람이 손봐야 하는 단계 오류(M1-27, FR-152 — 사유 목록 PIPELINE_PARTIAL_REASONS). 사유별 이슈 하나,
 *                       같은 사유는 댓글. 라벨은 pipeline-failure를 같이 쓴다(저장소에 미리 만든 라벨만 — fingerprint에 kind가
 *                       들어가므로 실패 이슈와 섞이지 않는다). 소스·데이터 API 문제는 이 kind가 아니라 source-broken이 맡는다.
 *   - source-broken     key `source:<소스 ID>` — **소스별 이슈 하나**(PRD §15 D35 ③, M1-11). 이번 실행의 소스 실패
 *                       (PRD §10 "수집 일부 실패 → 이슈", FR-08), 실패·빈 피드 3회 연속(FR-11), 새 기사 없음 7회 연속이
 *                       모두 같은 이슈에 쌓인다(새 이슈 또는 댓글, FR-152). 사건 판정은 scripts/lib/source-health.ts.
 *                       (M0-22의 별도 kind `source-health`는 D35로 이 kind에 합쳤다 — 같은 소스에 이슈가 둘 생기지 않게)
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

import {
  FEED_BODY_SHAPE_LABEL,
  FEED_BODY_SHAPES,
  FEED_MEDIA_TYPES,
  FEED_PARSE_ERROR_CODES,
  FEED_PARSE_ERROR_LABEL,
} from "./feed-diagnostics";
import { createLogger, sanitizeText, type Logger } from "./logger";

// ─── 종류·라벨 ───────────────────────────────────────────────────────────

export const ISSUE_KINDS = [
  "pipeline-failure",
  "pipeline-partial",
  "source-broken",
  "ops-report",
] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

export function isIssueKind(value: string): value is IssueKind {
  return (ISSUE_KINDS as readonly string[]).includes(value);
}

/**
 * 새 이슈에 붙이는 라벨 — 저장소에 미리 만들어 둔 것만 쓴다(M0-10에서 6종 생성: summary-error·takedown·source-broken·
 * source-health·pipeline-failure·ops-report). 소스 이슈는 D35 ③에 따라 `source-broken` 하나(`source-health` 라벨은
 * 자동 보고에 쓰지 않는다).
 */
export const ISSUE_LABELS: Readonly<Record<IssueKind, readonly string[]>> = {
  "pipeline-failure": ["pipeline-failure"],
  // 부분 실패도 운영 실패 라벨을 같이 쓴다(새 라벨을 만들지 않는다 — M1-27)
  "pipeline-partial": ["pipeline-failure"],
  "source-broken": ["source-broken"],
  "ops-report": ["ops-report"],
};

/** 열린 이슈를 찾을 때 거르는 라벨(종류마다 하나) */
export const SEARCH_LABEL: Readonly<Record<IssueKind, string>> = {
  "pipeline-failure": "pipeline-failure",
  "pipeline-partial": "pipeline-failure",
  "source-broken": "source-broken",
  "ops-report": "ops-report",
};

/**
 * 소스 건강도 사건 (M1-11, PRD §15 D35) — scripts/lib/source-health.ts가 판정한다.
 *   - failed          이번 실행에서 소스 받기·파싱이 실패했다(시간 예산 초과 `budget`은 사건이 아니다) — PRD §10
 *   - failing-streak  요청 실패·빈 피드가 3회 이상 연속(이번 실행 포함) — FR-11
 *   - stale-streak    피드는 응답하지만 수집 창 안의 새 기사가 7회 이상 연속 0건(이번 실행 포함)
 */
export const SOURCE_EVENT_TYPES = [
  "failed",
  "failing-streak",
  "stale-streak",
] as const;
export type SourceEventType = (typeof SOURCE_EVENT_TYPES)[number];

/**
 * 부분 실패 사유 (M1-27, FR-152) — 수집 단계 안에서 실패했지만 실행은 계속된(수집 판정 partial) 사람이 손봐야 하는 단계 오류.
 * 그 실행이 발행됐는지는 뒤 단계(검증·빌드·커밋)에 달려 있다 — 이슈 본문은 발행했다고 쓰지 않는다. 사유별로 이슈 하나
 * (원인 키 `<워크플로>:partial:<사유>`). 판정은 scripts/lib/run-issues.ts `partialFindings`.
 *   purge            data 원본 삭제 단계 오류(M1-25 — 삭제 요청·보존 기간 만료 카드가 data/에 남음)
 *   seen             카드 URL 기억(data/cache/seen-urls.json) 읽기·쓰기 오류(M1-12)
 *   cluster          같은 사건 클러스터링 오류(M1-13 — 합치지 않은 채 발행)
 *   classify         범위 밖 제외·코드 분류·엔티티 병합 오류(M1-17 — 제외·병합 없이 최소 분류로 발행)
 *   brief            브리핑 단계 실패(LLM·출력·설정 — 데이터 API 실패는 source-broken이 맡는다)
 *   brief-file       브리핑 파일(data/briefs) 검증·쓰기 오류 또는 깨진 기존 파일(M1-19)
 *   runs-unreadable  실행 기록(runs.json·runs-dev.json)을 읽지 못해 비용 가드가 판정 불가 → LLM 없이 템플릿(M1-22)
 *   ledger           경기 기록 원장(data/matches) 쓰기 오류·형식 오류 항목(M1-48b)
 *   football         대회·팀 데이터 단계(data/competitions·data/teams — M2-09)의 단계 실패·조립·설정·쓰기 오류
 * 이슈를 만들지 않는 partial: 소스 일부 실패(소스별 source-broken) · 데이터 API(football-data·API-Football — source-broken
 * `source:football-data`·`source:api-football`) · API-Football 미완(이월로 다음 실행이 받는다 — 운영 리포트 M5-09).
 */
export const PIPELINE_PARTIAL_REASONS = [
  "purge",
  "seen",
  "cluster",
  "classify",
  "brief",
  "brief-file",
  "runs-unreadable",
  "ledger",
  "football",
] as const;
export type PipelinePartialReason = (typeof PIPELINE_PARTIAL_REASONS)[number];

/**
 * 실행 1회에서 소스의 상태 (runs.json `sources[]` 한 줄을 분류한 값 — source-health.ts `classifySourceRun`).
 *   fresh 새 기사 있음 · no-new 응답했지만 창 안 새 기사 0건 · empty 빈 피드(원문 0건) · failed 실패 ·
 *   budget 시간 예산 초과로 건너뜀 · legacy-ok 성공했지만 `usable`이 없는 옛 기록(새 기사 수 모름)
 */
export const SOURCE_RUN_STATES = [
  "fresh",
  "no-new",
  "empty",
  "failed",
  "budget",
  "legacy-ok",
] as const;
export type SourceRunState = (typeof SOURCE_RUN_STATES)[number];

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
/** `owner/name` 저장소 형식 */
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
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

/**
 * Actions 실행 URL — `GITHUB_SERVER_URL/GITHUB_REPOSITORY/actions/runs/GITHUB_RUN_ID`(Actions 기본 변수).
 * 하나라도 없거나 형식이 틀리면 undefined(로컬 실행). 이슈 본문의 "관련 실행 로그 링크"에 쓴다.
 */
export function actionsRunUrl(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const server = env.GITHUB_SERVER_URL?.trim() || "https://github.com";
  const repo = env.GITHUB_REPOSITORY?.trim();
  const runId = env.GITHUB_RUN_ID?.trim();
  if (!repo || !REPO_PATTERN.test(repo) || !runId || !/^\d+$/.test(runId)) {
    return undefined;
  }
  return `${server.replace(/\/+$/, "")}/${repo}/actions/runs/${runId}`;
}

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

/** 단계 id — collect.yml step id(`install`·`collect`·`validate`·`build`·`commit`·`setup`) 형식 */
const StepIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "소문자·숫자·하이픈")
  .max(40);

const JobResultSchema = z.strictObject({
  job: z.string().min(1).max(100),
  result: z.string().min(1).max(40),
  /** 짧은 부가 정보(예: guard의 판단 사유) */
  note: z.string().max(200).optional(),
  /** 실패한 job이 멈춘 단계 id(job 출력 `step`, M1-27) — 원인 키에 붙는다 */
  step: StepIdSchema.optional(),
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

/** 부분 실패(M1-27) — 실행 1회의 사유 하나. 응답 본문·비밀값을 넣지 않는다(오류 요약만) */
export const PipelinePartialPayloadSchema = z.strictObject({
  workflow: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "소문자·숫자·하이픈"),
  reason: z.enum(PIPELINE_PARTIAL_REASONS),
  /** 짧은 오류 요약(예: `write(2026-10-15): EACCES`) */
  detail: ShortText.optional(),
  /** runs.json 실행 ID */
  runId: z.string().max(100).optional(),
  runUrl: HttpsUrl.optional(),
  /** 발행일(KST) */
  publishDate: KstDateString.optional(),
  occurredAt: IsoSchema.optional(),
});

const Count = z.number().int().min(0);
/** 실패 종류 — runs.json `sources[].error`(예: `timeout`·`http-5xx`·`parse`) */
const ErrorTypeSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "소문자·숫자·하이픈")
  .max(40);

/** 최근 7일(KST 날짜 7개) 집계 — runs.json 기록에서 계산한 값(source-health.ts `sourceStats`) */
const SourceStatsPayloadSchema = z.strictObject({
  /** 기간 첫 날·마지막 날(KST) */
  from: KstDateString,
  to: KstDateString,
  /** 시도 횟수 — 시간 예산 초과(`budget`)로 건너뛴 실행은 빼고 센다 */
  attempts: Count,
  /** 받기·파싱에 성공한 횟수 */
  ok: Count,
  /** 시간 예산 초과로 건너뛴 횟수(성공률 계산에서 뺌) */
  budget: Count,
  /** 피드 원문 항목 수 합 */
  items: Count,
  /** 수집 창 안 새 항목 수 합(`usable`이 기록된 실행만) */
  usable: Count,
  /** `usable`이 기록된 실행 수 */
  usableRuns: Count,
});

/** 최근 실행 1회의 이 소스 결과(표 한 줄) */
const SourceRecentRunSchema = z.strictObject({
  startedAt: IsoSchema,
  state: z.enum(SOURCE_RUN_STATES),
  items: Count,
  usable: Count.optional(),
  error: ErrorTypeSchema.optional(),
});

/** 위치(줄·열, 1부터) — 파서가 주지 않았으면 null */
const ParsePosition = z.number().int().min(0).max(1_000_000_000).nullable();

/**
 * 파싱 실패 진단(M1-03 보강 — scripts/lib/feed-diagnostics.ts). 응답 본문 대신 겉모습만 — **정해진 enum·숫자·참거짓만**
 * 받는다(자유 문자열 칸이 없어 본문 조각이 들어갈 자리가 없다).
 */
export const ParseDiagnosticsPayloadSchema = z.strictObject({
  /** 최종 응답 HTTP 상태 */
  status: z.number().int().min(100).max(599),
  /** `Content-Type` 미디어 타입(목록 밖 `other`, 헤더 없음 `none`) */
  mediaType: z.enum(FEED_MEDIA_TYPES),
  /** 본문 바이트 길이 */
  bytes: Count,
  /** 본문 형태 */
  shape: z.enum(FEED_BODY_SHAPES),
  /** 최종 응답 호스트가 피드 호스트와 같은가 */
  sameHost: z.boolean(),
  /** 따라간 리다이렉트 수(같은 호스트만) */
  redirects: z.number().int().min(0).max(20),
  /** 파서 오류 코드 */
  parser: z.enum(FEED_PARSE_ERROR_CODES),
  line: ParsePosition,
  column: ParsePosition,
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
  // ── 자동 건강도 보고(M1-11, D35) — 사람이 만든 보고에는 없다 ──
  /** 사건 종류. 있으면 제목·본문이 사건 기준으로 바뀐다 */
  event: z.enum(SOURCE_EVENT_TYPES).optional(),
  /** 연속 횟수 — failed·failing-streak는 실패·빈 피드 연속, stale-streak는 새 기사 없음 연속(이번 실행 포함) */
  streak: z.number().int().min(1).max(10_000).optional(),
  /** 이번 실행의 실패 종류(runs.json `sources[].error`) */
  errorType: ErrorTypeSchema.optional(),
  /** 최근 7일 성공률·수집 건수 */
  stats7d: SourceStatsPayloadSchema.optional(),
  /** 최근 실행(오래된 → 최근, 마지막이 이번 실행) */
  recent: z.array(SourceRecentRunSchema).max(30).optional(),
  /** 이번 실행이 파싱 실패(`parse`)일 때 응답 진단 — 본문 내용 없음 */
  parseDiagnostics: ParseDiagnosticsPayloadSchema.optional(),
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
  "pipeline-partial": PipelinePartialPayloadSchema,
  "source-broken": SourceBrokenPayloadSchema,
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

/** 소스 이슈의 원인 키 — `source:<소스 ID>` (소스별 이슈 하나, D35 ③) */
export function sourceIssueKey(sourceId: string): string {
  return `source:${sourceId}`;
}

/** 부분 실패 이슈의 원인 키 — `<워크플로>:partial:<사유>` (사유별 이슈 하나, M1-27) */
export function partialIssueKey(
  workflow: string,
  reason: PipelinePartialReason,
): string {
  return `${workflow}:partial:${reason}`;
}

/**
 * 실패 job별 원인 키 조각(정렬) — job 결과에 멈춘 단계(`step`)가 있으면 `<job>/<step>`, 없으면 `<job>`(M1-27 이전 키와 같다).
 */
function failedJobKeys(p: IssuePayload<"pipeline-failure">): string[] {
  const stepOf = new Map(
    p.jobs.flatMap((j) => (j.step ? [[j.job, j.step] as const] : [])),
  );
  return [...p.failedJobs].sort().map((job) => {
    const step = stepOf.get(job);
    return step ? `${job}/${step}` : job;
  });
}

/** 종류별 기본 원인 키 — reportIssue에 key를 주지 않으면 이것을 쓴다. */
export function defaultIssueKey<K extends IssueKind>(
  kind: K,
  payload: IssuePayloadInput<K>,
): string {
  switch (kind) {
    case "pipeline-failure": {
      const p = parseIssuePayload("pipeline-failure", payload);
      return `${p.workflow}:${p.failedJobs.length ? failedJobKeys(p).join("+") : "unknown"}`;
    }
    case "pipeline-partial": {
      const p = parseIssuePayload("pipeline-partial", payload);
      return partialIssueKey(p.workflow, p.reason);
    }
    case "source-broken":
      return sourceIssueKey(
        parseIssuePayload("source-broken", payload).sourceId,
      );
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

/** 실패 job 표기 — 멈춘 단계가 있으면 `collect/validate`처럼 원인 키 조각과 같게(M1-27) */
function failedJobsText(p: IssuePayload<"pipeline-failure">): string {
  return p.failedJobs.length
    ? failedJobKeys(p)
        .map((j) => inlineText(j, 100))
        .join(", ")
    : "알 수 없음";
}

function buildPipelineFailure(
  p: IssuePayload<"pipeline-failure">,
  occurredAt: string,
): { title: string; body: string[] } {
  const info = workflowInfo(p.workflow);
  const failed = failedJobsText(p);
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

// ── 부분 실패 (M1-27) ──

interface PartialReasonInfo {
  /** 제목·본문의 사유 이름 */
  label: string;
  /** 이번 실행에 생긴 일(발행은 됐다는 전제 아래) */
  effect: string;
  /** 확인할 것 */
  checks: string[];
}

/** 사유별 문구 — 영향·확인할 것(코드 문구, LLM 미사용) */
const PARTIAL_REASON_INFO: Readonly<
  Record<PipelinePartialReason, PartialReasonInfo>
> = {
  purge: {
    label: "data 원본 삭제 단계 오류",
    effect:
      "삭제 요청·보존 기간 만료 카드(출처)가 data/news에 남았을 수 있습니다. 공개 사이트는 빌드 제외(takedowns.json)로 보호되며, 다음 수집 실행이 다시 지웁니다.",
    checks: [
      "실행 로그 `collect.purge.*`에서 실패 단계(takedowns·sources·list·read·seen·write) 확인",
      "삭제 요청 접수 72시간 기한이 다가오면 `/takedown` 절차로 수동 확인 (CLAUDE.md §12)",
    ],
  },
  seen: {
    label: "카드 URL 기억(seen-urls.json) 읽기·쓰기 오류",
    effect:
      "최근 발행 파일(3일)로 날짜 간 중복을 막고 계속 진행했습니다. 기억이 계속 고쳐지지 않으면 오래된 기사가 다시 카드가 될 수 있습니다.",
    checks: [
      "실행 로그 `collect.seen.*` 확인",
      "`npm run validate`로 data/cache/seen-urls.json 형식 확인 (data/는 손으로 고치지 않는다 — 원인을 스크립트에서 고친다)",
    ],
  },
  cluster: {
    label: "같은 사건 클러스터링 오류",
    effect:
      "같은 사건 기사를 합치지 않은 채(같은 URL 중복 제거만) 카드를 만들었습니다 — 발행됐다면 비슷한 카드가 여러 장일 수 있습니다.",
    checks: [
      "실행 로그 `collect.cluster.*`의 오류 확인 — 코드 버그일 가능성이 큽니다",
    ],
  },
  classify: {
    label: "범위 밖 제외·코드 분류 오류",
    effect:
      "범위 밖 기사(축구 외·K리그·연예) 제외나 코드 분류·같은 경기 병합을 하지 못한 채 카드를 만들었습니다 — 발행됐다면 범위 밖 카드가 섞였거나 카테고리·태그가 기본값(기타, 소스 대회)일 수 있습니다.",
    checks: [
      "실행 로그 `collect.filter.fail`·`collect.classify.fail`의 오류 확인 — 코드 버그일 가능성이 큽니다",
      "키워드·표기 설정(configs/names.ko.json·korean-players.json)을 바꾼 직후라면 `npm run validate`로 형식 확인",
    ],
  },
  brief: {
    label: "브리핑 단계 실패",
    effect:
      "오늘의 5줄은 코드 템플릿 문장으로 만들었거나(LLM 없이) 생략했습니다. 뉴스 카드 단계는 계속 진행했습니다.",
    checks: [
      "실행 로그 `summarize.brief.*`에서 실패 종류(llm·output·setup) 확인",
      "LLM 오류가 며칠 이어지면 모델·키·요금 상태 확인, 출력 오류면 지시문(configs/prompts/summarize.md)·출력 스키마 확인",
    ],
  },
  "brief-file": {
    label: "브리핑 파일 검증·쓰기 오류",
    effect:
      "그날 data/briefs 파일을 쓰지 못했거나, 깨진 기존 파일을 새로 썼습니다 — 홈의 오늘의 5줄이 비었을 수 있습니다.",
    checks: [
      "실행 로그 `summarize.brief.publish.*` 확인",
      "`npm run validate`로 data/briefs 파일 확인",
    ],
  },
  "runs-unreadable": {
    label: "실행 기록(runs 파일)을 읽지 못함",
    effect:
      "비용 가드가 이번 달·오늘 사용액을 확인하지 못해 브리핑을 LLM 없이 코드 템플릿으로 만들었습니다(FR-27). 고칠 때까지 매일 같습니다.",
    checks: [
      "`npm run validate`로 data/runs.json·data/runs-dev.json 형식 확인 — runs-dev.json은 개발자가 커밋한다",
      "실행 로그 `summarize.brief.budget` 확인",
    ],
  },
  ledger: {
    label: "경기 기록 원장 쓰기·형식 오류",
    effect:
      "받은 경기 일부를 원장(data/matches)에 넣지 못해 이월 목록(af-pending)에 다시 넣었습니다 — 다음 실행이 다시 받습니다(API-Football 호출을 다시 씀).",
    checks: [
      "실행 로그 `collect.ledger.*` 확인",
      "`npm run validate`로 data/matches 파일 확인",
    ],
  },
  football: {
    label: "대회·팀 데이터 단계 오류",
    effect:
      "대회 파일(data/competitions)이나 팀 파일(data/teams) 일부를 갱신하지 못해 전일 값을 그대로 두었습니다 — 순위·일정·팀 화면이 하루 늦을 수 있습니다. 뉴스·브리핑은 영향이 없습니다.",
    checks: [
      "실행 로그 `collect.competitions.*`·`collect.competition.*`·`collect.teams.*` 확인",
      "팀 설정 문제(`collect.teams.problem`)면 configs/team-ids·names.ko·team-colors를 맞춘 뒤 `npm run build:teams`로 확인",
      "`npm run validate`로 data/competitions·data/teams 파일 확인",
    ],
  },
};

const PARTIAL_WORKFLOW_LABEL: Readonly<Record<string, string>> = {
  collect: "일일 수집",
};

function buildPipelinePartial(
  p: IssuePayload<"pipeline-partial">,
  occurredAt: string,
): { title: string; body: string[] } {
  const info = PARTIAL_REASON_INFO[p.reason];
  const workflowLabel =
    PARTIAL_WORKFLOW_LABEL[p.workflow] ?? `${p.workflow} 워크플로`;
  return {
    title: `[${p.workflow} 부분 실패] ${info.label} — ${p.publishDate ?? kstDate(occurredAt)}`,
    body: [
      `${p.workflow}.yml ${workflowLabel} 실행 중 아래 단계가 실패했습니다(실행은 계속됨). 이번 실행이 발행됐는지는 실행 링크와 같은 시각의 실패 이슈(pipeline-failure — 있으면)로 확인하세요.`,
      "",
      "| 항목 | 값 |",
      "|---|---|",
      `| 실행 | ${runLink(p.runUrl)} |`,
      `| 실행 ID | ${p.runId ? codeSpan(p.runId, 100) : "?"} |`,
      `| 발행일 (KST) | ${p.publishDate ?? "?"} |`,
      `| 시각 (KST) | ${kstDateTime(occurredAt)} |`,
      `| 사유 | ${tableCell(info.label)} (\`${p.reason}\`) |`,
      ...(p.detail ? [`| 오류 | ${codeSpan(p.detail)} |`] : []),
      "",
      `- ${info.effect}`,
      "",
      "### 확인할 것",
      ...info.checks.map((c) => `- [ ] ${c}`),
      "- [ ] 원인 수정 — 설정은 configs/, 코드는 scripts/ (data/는 손으로 고치지 않는다)",
      "- [ ] 다음 실행에서 같은 사유가 다시 나오지 않으면 이 이슈 닫기",
    ],
  };
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

// ── 소스 건강도 사건 문구 (M1-11, D35) ──

/** 사건 제목 — `수집 실패 (timeout)` · `실패·빈 피드 3회 연속` · `새 기사 없음 7회 연속` */
function sourceEventTitle(p: IssuePayload<"source-broken">): string | null {
  switch (p.event) {
    case undefined:
      return null;
    case "failed":
      return `수집 실패${p.errorType ? ` (${p.errorType})` : ""}`;
    case "failing-streak":
      return `실패·빈 피드 ${p.streak ?? "?"}회 연속`;
    case "stale-streak":
      return `새 기사 없음 ${p.streak ?? "?"}회 연속`;
    default: {
      const unknownEvent: never = p.event;
      return String(unknownEvent);
    }
  }
}

/** 사건 한 줄 설명(기준 포함) */
function sourceEventLine(p: IssuePayload<"source-broken">): string | null {
  switch (p.event) {
    case undefined:
      return null;
    case "failed":
      return `이번 실행에서 이 소스를 받지 못했습니다 — 실패·빈 피드 ${p.streak ?? 1}회 연속 (3회 연속이면 건강도 경보, FR-11)`;
    case "failing-streak":
      return `요청 실패·빈 피드가 **${p.streak ?? "?"}회 연속**입니다 (기준 3회, FR-11)`;
    case "stale-streak":
      return `피드는 응답하지만 수집 창 안의 새 기사가 **${p.streak ?? "?"}회 연속** 0건입니다 (기준 7회 — 갱신이 드문 피드의 오탐 방지, D35)`;
    default: {
      const unknownEvent: never = p.event;
      return String(unknownEvent);
    }
  }
}

const SOURCE_STATE_LABEL: Readonly<Record<SourceRunState, string>> = {
  fresh: "새 기사 있음",
  "no-new": "새 기사 없음",
  empty: "빈 피드",
  failed: "실패",
  budget: "건너뜀(시간 예산)",
  "legacy-ok": "성공(새 항목 수 미기록)",
};

/** `6/7 (86%)` — 시도가 없으면 `기록 없음` */
export function formatSuccessRate(ok: number, attempts: number): string {
  if (attempts <= 0) return "기록 없음";
  return `${ok}/${attempts} (${Math.round((ok / attempts) * 100)}%)`;
}

function statsLines(stats: IssuePayload<"source-broken">["stats7d"]): string[] {
  if (!stats) return [];
  const budget =
    stats.budget > 0
      ? ` · 시간 예산 초과로 건너뜀 ${stats.budget}회(성공률에서 뺌)`
      : "";
  const usable =
    stats.usableRuns > 0
      ? `수집 창 안 새 항목 ${stats.usable}건(기록 ${stats.usableRuns}회)`
      : "수집 창 안 새 항목 기록 없음";
  return [
    `- 최근 7일(${stats.from} ~ ${stats.to}, KST) 성공률: ${formatSuccessRate(stats.ok, stats.attempts)}${budget}`,
    `- 최근 7일 수집 건수: 피드 원문 ${stats.items}건 · ${usable}`,
  ];
}

function recentTable(
  recent: IssuePayload<"source-broken">["recent"],
): string[] {
  if (!recent || recent.length === 0) return [];
  return [
    "| 실행 (KST) | 결과 | 원문 | 창 안 새 항목 | 오류 |",
    "|---|---|---:|---:|---|",
    ...recent.map((r) => {
      const when = `${formatKst(r.startedAt, "date")} ${formatKst(r.startedAt, "time")}`;
      return `| ${when} | ${SOURCE_STATE_LABEL[r.state]} | ${r.items} | ${r.usable ?? "—"} | ${r.error ? codeSpan(r.error, 40) : ""} |`;
    }),
  ];
}

/**
 * 파싱 실패 진단 표 — 값은 모두 enum·숫자라 그대로 싣는다(본문 내용 없음).
 * 리다이렉트 0회·같은 호스트가 정상이다.
 */
export function parseDiagnosticsTable(
  d: IssuePayload<"source-broken">["parseDiagnostics"],
): string[] {
  if (!d) return [];
  const position =
    d.line !== null
      ? ` (줄 ${d.line}${d.column !== null ? ` · 열 ${d.column}` : ""})`
      : "";
  const mediaNote =
    d.mediaType === "none"
      ? " (헤더 없음)"
      : d.mediaType === "other"
        ? " (목록 밖 형식)"
        : "";
  const host = d.sameHost
    ? "피드 호스트와 같음"
    : "**피드 호스트와 다름** (다른 곳으로 넘어감)";
  return [
    "응답 진단 (파싱 실패 — 응답 본문은 싣지 않습니다):",
    "",
    "| 항목 | 값 |",
    "|---|---|",
    `| HTTP 상태 | ${d.status} |`,
    `| Content-Type | \`${d.mediaType}\`${mediaNote} |`,
    `| 본문 크기 | ${d.bytes}바이트 |`,
    `| 본문 형태 | \`${d.shape}\` — ${FEED_BODY_SHAPE_LABEL[d.shape]} |`,
    `| 최종 호스트 | ${host} · 리다이렉트 ${d.redirects}회 |`,
    `| 파서 오류 | \`${d.parser}\` — ${FEED_PARSE_ERROR_LABEL[d.parser]}${position} |`,
  ];
}

/** 사건별 확인 항목 */
function sourceEventChecklist(p: IssuePayload<"source-broken">): string[] {
  const common = [
    "- [ ] 원인 수정 — 피드 주소·설정은 configs/sources.json, 코드는 scripts/ (data/는 손으로 고치지 않는다)",
    "- [ ] 대체 소스가 필요하면 `/add-source` 절차로 추가",
    "- [ ] 정상 수집 확인 후 이 이슈 닫기 (닫힌 뒤 같은 소스에 사건이 다시 생기면 새 이슈가 열립니다)",
  ];
  if (p.event === "stale-streak") {
    return [
      "- [ ] 피드가 갱신을 멈췄는지·주소가 옮겨 옛 피드에 머무는지 확인 (매체 휴간·비시즌이면 그대로 두어도 됨)",
      "- [ ] 작성자 필터(`author`)·시간대(`tz`) 설정 때문에 항목이 빠지는지 실행 로그(`collect.item.skip`) 확인",
      ...common,
    ];
  }
  return [
    "- [ ] 실행 로그의 `collect.source.fail`에서 오류 종류·HTTP 상태(파싱 실패면 미디어 타입·본문 크기·본문 형태·파서 오류) 확인 (응답 본문·비밀값은 이슈에 붙이지 않는다)",
    "- [ ] 피드 URL·구조 변경, 약관·robots.txt 변경 여부 확인",
    ...common,
  ];
}

function runRef(p: IssuePayload<"source-broken">): string | undefined {
  return (
    p.runUrl ??
    (p.runId ? `runs.json 실행 ID ${inlineText(p.runId, 100)}` : undefined)
  );
}

function buildSourceBroken(
  p: IssuePayload<"source-broken">,
  occurredAt: string,
): { title: string; body: string[] } {
  const firstSeen = p.firstSeen ?? kstDate(occurredAt);
  const eventTitle = sourceEventTitle(p);
  const eventLine = sourceEventLine(p);
  const table = recentTable(p.recent);
  const diagnostics = parseDiagnosticsTable(p.parseDiagnostics);
  const memo = [
    ...(eventLine ? [`**${eventTitle}** — ${eventLine}`, ""] : []),
    ...(p.errorType ? [`- 오류 종류: ${codeSpan(p.errorType, 40)}`] : []),
    ...(p.error ? [`- 오류: ${codeSpan(p.error)}`] : []),
    ...(p.httpStatus ? [`- HTTP 상태: ${p.httpStatus}`] : []),
    ...(p.sourceName ? [`- 매체: ${inlineText(p.sourceName, 100)}`] : []),
    ...statsLines(p.stats7d),
    `- 발생 시각: ${kstDateTime(occurredAt)}`,
    p.event === "stale-streak"
      ? "- 피드는 정상 응답해 이번 실행도 그대로 발행했습니다."
      : "- 이 소스만 건너뛰고 나머지 수집은 계속했습니다 (소스 실패 격리, FR-08).",
    ...(diagnostics.length ? ["", ...diagnostics] : []),
    ...(table.length ? ["", "최근 실행:", "", ...table] : []),
    ...(p.event ? ["", "확인할 것:", "", ...sourceEventChecklist(p)] : []),
    ...(p.note ? ["", noteText(p.note)] : []),
  ].join("\n");
  const symptom = p.symptoms[0] ?? "기타";
  return {
    title: `[소스 고장] ${inlineText(p.sourceId, 100)} — ${eventTitle ?? symptom}`,
    body: formSections([
      inlineText(p.sourceId, 100),
      p.symptoms.join(", "),
      firstSeen,
      runRef(p),
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
    case "pipeline-partial":
      built = buildPipelinePartial(
        parsed as IssuePayload<"pipeline-partial">,
        occurredAt,
      );
      break;
    case "source-broken":
      built = buildSourceBroken(
        parsed as IssuePayload<"source-broken">,
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
        `- 실패 job: ${failedJobsText(p)}`,
        ...(p.jobs.length ? ["", ...jobTable(p.jobs)] : []),
        ...(p.note ? ["", noteText(p.note)] : []),
      ];
      break;
    }
    case "pipeline-partial": {
      const p = parsed as IssuePayload<"pipeline-partial">;
      lines = [
        `### 다시 발생 — ${kstDateTime(occurredAt)}${nth}`,
        "",
        `- 실행: ${runLink(p.runUrl)}${p.runId ? ` · 실행 ID ${codeSpan(p.runId, 100)}` : ""}`,
        ...(p.publishDate ? [`- 발행일: ${p.publishDate}`] : []),
        `- 사유: ${inlineText(PARTIAL_REASON_INFO[p.reason].label)} (\`${p.reason}\`)`,
        ...(p.detail ? [`- 오류: ${codeSpan(p.detail)}`] : []),
      ];
      break;
    }
    case "source-broken": {
      const p = parsed as IssuePayload<"source-broken">;
      const eventTitle = sourceEventTitle(p);
      const eventLine = sourceEventLine(p);
      const streakEvent =
        p.event === "failing-streak" || p.event === "stale-streak";
      const table = streakEvent ? recentTable(p.recent) : [];
      const diagnostics = parseDiagnosticsTable(p.parseDiagnostics);
      lines = [
        `### ${eventTitle ?? "다시 발생"} — ${kstDateTime(occurredAt)}${nth}`,
        "",
        ...(eventLine ? [`- 사건: ${eventLine}`] : []),
        `- 증상: ${p.symptoms.join(", ")}`,
        ...(p.errorType ? [`- 오류 종류: ${codeSpan(p.errorType, 40)}`] : []),
        ...(p.error ? [`- 오류: ${codeSpan(p.error)}`] : []),
        ...(p.httpStatus ? [`- HTTP 상태: ${p.httpStatus}`] : []),
        ...statsLines(p.stats7d),
        `- 실행: ${p.runUrl ? runLink(p.runUrl) : p.runId ? `runs.json 실행 ID ${inlineText(p.runId, 100)}` : "(실행 링크 없음)"}`,
        ...(diagnostics.length ? ["", ...diagnostics] : []),
        ...(table.length ? ["", ...table] : []),
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
