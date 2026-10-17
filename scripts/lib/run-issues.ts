/**
 * 실행 이슈 사건 (M1-27 — PRD FR-151·FR-152, CLAUDE.md §6.4) — 순수 함수만 둔다. 실패(exit 1) 실행은 collect.yml
 * `report-failure`(pipeline-failure, 원인 키 `collect:<job>/<멈춘 단계>`)가 맡고, 여기서는 **수집 단계 안에서 실패했지만 실행은
 * 계속된(수집 판정 partial)** 사람이 손봐야 하는 단계 오류를 사유별 이슈 사건으로 바꾼다. 그 실행이 발행됐는지는 뒤 단계(검증·
 * 빌드·커밋)에 달려 있어 이슈 문구는 발행했다고 쓰지 않는다.
 *
 * ── 부분 실패 이슈 (`pipeline-partial`, 원인 키 `collect:partial:<사유>`) ───────────────────────────────
 *   사유(github-issues.ts PIPELINE_PARTIAL_REASONS)와 판정(collect-run.ts runStatus·withPurgeStatus가 partial로 보는 조건 중):
 *     purge            삭제 단계 오류 1건 이상(PurgeOutcome.errors — M1-25 이월: 이전에는 이슈 없음)
 *     seen             seen-urls.json 읽기·쓰기 오류(M1-12)
 *     cluster          클러스터링 예상 밖 오류(M1-13)
 *     classify         범위 판정·코드 분류·엔티티 병합 예상 밖 오류(M1-17 — 제외·병합 없이 최소 분류)
 *     brief            브리핑 단계 failed — reason llm·output·setup(M1-01 이월: partial·exit 0이라 이슈 없음), 고유명사 사전을 읽지
 *                      못해 LLM 없이 템플릿(skipped names-unreadable — M1-45). football-data는 데이터 API 문제라 아래 source-broken이
 *                      맡는다(같은 원인 이슈 둘 방지). 브리핑 마감 강등(skipped deadline · failed cause deadline — FR-26 설계된 폴백,
 *                      M1-45)·하루 요청 상한(skipped·cause daily-cap — FR-25 의도된 제한, D56)은 이슈를 만들지 않는다
 *     brief-file       브리핑 파일 검증·쓰기 실패 또는 깨진 기존 파일(M1-19)
 *     runs-unreadable  비용 가드가 runs 파일을 읽지 못함(M1-22 이월 — 기록 파일 수리 필요)
 *     ledger           원장 쓰기 오류·형식 오류 항목(M1-48b)
 *   사유마다 이슈 하나 — 같은 사유가 다시 나오면 열린 이슈에 댓글(FR-152, 남발 금지). 여러 사유가 함께 나면 사유별로 따로 낸다
 *   (원인이 다르면 다른 이슈 — 닫는 시점도 다르다).
 *   이슈를 만들지 않는 partial: 소스 일부 실패(source-health.ts가 소스별 source-broken) · API-Football 미완(날짜 조회 실패·시간
 *   예산·경기 단건 실패 — 이월로 다음 실행이 다시 받는다, errors.plan·일 한도·그 밖 errors는 api-football-stage.ts가 이미
 *   source-broken으로 낸다) · 예산 초과 예상(daily·monthly_exceeded — 의도된 강등, FR-27).
 *
 * ── 데이터 API 소스 이슈 (`source-broken`, 원인 키 `source:football-data`·`source:api-football`) ──────────────
 *   football-data: 단계 실패(시간 예산·취소 제외) · 키 없음(prod Secrets 미설정) · 순위 일부 실패 → 하나(우선순위 실패 > 키 없음 >
 *   순위). API-Football: 단계가 예상 밖 오류로 실패(isolateProvider) — errors.plan 등 응답 사건은 기존 경로가 낸다.
 *   collect-run.ts가 소스 건강도 사건 파일(SOURCE_HEALTH_FILE)에 함께 쓴다(collect.yml 이슈 단계가 보고).
 *
 * 문구는 오류 요약만 — 응답 본문·비밀값·기사 원문을 넣지 않는다(이슈 헬퍼가 한 번 더 가리고 자른다).
 */
import type { IssuePayloadInput, PipelinePartialReason } from "./github-issues";
import type { MatchProvider, ProviderOutcome } from "./match-data";

/** 오류 요약 최대 길이(이슈 스키마 ShortText 5,000자보다 훨씬 짧게 — 한 줄) */
const DETAIL_MAX = 300;

/** 데이터 API 소스 ID(이슈 원인 키 `source:<id>`) — API-Football은 api-football-stage.ts와 같은 값 */
export const MATCH_SOURCE_IDS: Readonly<Record<MatchProvider, string>> = {
  "football-data": "football-data",
  "api-football": "api-football",
};

const MATCH_SOURCE_NAMES: Readonly<Record<MatchProvider, string>> = {
  "football-data": "football-data.org",
  "api-football": "API-Football",
};

/** 소스 이슈로 내지 않는 프로바이더 실패 종류 — 시간 예산(늦은 실행·브리핑 마감, D35 budget과 같은 취급)·취소(뉴스 실패 — 실행 실패 이슈가 맡음) */
const NON_ISSUE_ERROR_TYPES: ReadonlySet<string> = new Set([
  "budget",
  "cancelled",
]);

// ─── 입력 (collect-run.ts CollectOutcome의 필요한 부분 — 구조 타입) ────────────────

export interface PartialFindingsInput {
  purge: {
    errors: ReadonlyArray<{ step: string; date?: string; error: string }>;
  } | null;
  news: {
    seen?: { readError: string | null; writeError: string | null } | null;
    clusterError?: string | null;
    classifyError?: string | null;
  };
  brief:
    | { state: "done" }
    | {
        state: "skipped";
        reason: string;
        budget?: { verdict: string; message: string };
      }
    | { state: "failed"; reason: string; detail: string; cause?: string };
  briefFile: {
    action: string;
    readError: string | null;
    error: string | null;
  } | null;
  ledger: {
    applied: { errors: readonly string[] } | null;
    invalid: ReadonlyArray<{ id: number; error: string }>;
  } | null;
}

/** 부분 실패 사유 하나 */
export interface PartialFinding {
  reason: PipelinePartialReason;
  /** 오류 요약 한 줄 */
  detail: string;
}

function oneLine(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= DETAIL_MAX ? line : `${line.slice(0, DETAIL_MAX - 1)}…`;
}

function withMore(first: string, total: number): string {
  return total > 1 ? `${first} (외 ${total - 1}건)` : first;
}

/**
 * 실행 결과 → 부분 실패 사유(사유 목록 순서 — PIPELINE_PARTIAL_REASONS). 실행 상태와 무관하게 조건만 본다 — 뉴스가 실패한
 * 실행(exit 1)에서도 삭제 단계 오류처럼 원인이 다른 문제는 따로 보고된다(실행 실패 이슈와 원인이 다르다).
 */
export function partialFindings(input: PartialFindingsInput): PartialFinding[] {
  const found: PartialFinding[] = [];
  const purgeErrors = input.purge?.errors ?? [];
  const firstPurge = purgeErrors[0];
  if (firstPurge) {
    found.push({
      reason: "purge",
      detail: oneLine(
        withMore(
          `${firstPurge.step}${firstPurge.date ? `(${firstPurge.date})` : ""}: ${firstPurge.error}`,
          purgeErrors.length,
        ),
      ),
    });
  }
  const seen = input.news.seen;
  if (seen?.readError || seen?.writeError) {
    found.push({
      reason: "seen",
      detail: oneLine(
        [
          seen.readError ? `읽기: ${seen.readError}` : null,
          seen.writeError ? `쓰기: ${seen.writeError}` : null,
        ]
          .filter((part): part is string => part !== null)
          .join(" · "),
      ),
    });
  }
  if (input.news.clusterError) {
    found.push({ reason: "cluster", detail: oneLine(input.news.clusterError) });
  }
  if (input.news.classifyError) {
    found.push({
      reason: "classify",
      detail: oneLine(input.news.classifyError),
    });
  }
  const brief = input.brief;
  if (
    brief.state === "failed" &&
    brief.reason !== "football-data" &&
    brief.cause !== "deadline" &&
    brief.cause !== "daily-cap"
  ) {
    found.push({
      reason: "brief",
      detail: oneLine(
        `${brief.reason}${brief.cause ? `(${brief.cause})` : ""}: ${brief.detail}`,
      ),
    });
  } else if (brief.state === "skipped" && brief.reason === "names-unreadable") {
    found.push({
      reason: "brief",
      detail:
        "고유명사 사전(configs/names.ko.json)을 읽지 못해 LLM 없이 템플릿 브리핑을 게시했다",
    });
  }
  const file = input.briefFile;
  if (file && (file.action === "failed" || file.readError)) {
    found.push({
      reason: "brief-file",
      detail: oneLine(
        [
          file.action === "failed" && file.error
            ? `쓰기·검증: ${file.error}`
            : null,
          file.readError ? `기존 파일 읽기: ${file.readError}` : null,
        ]
          .filter((part): part is string => part !== null)
          .join(" · ") || "브리핑 파일 단계 실패",
      ),
    });
  }
  if (
    brief.state === "skipped" &&
    brief.reason === "budget" &&
    brief.budget?.verdict === "runs_unreadable"
  ) {
    found.push({
      reason: "runs-unreadable",
      detail: oneLine(brief.budget.message),
    });
  }
  const ledgerErrors = input.ledger?.applied?.errors ?? [];
  const invalid = input.ledger?.invalid ?? [];
  if (ledgerErrors.length > 0 || invalid.length > 0) {
    const firstInvalid = invalid[0];
    found.push({
      reason: "ledger",
      detail: oneLine(
        [
          ledgerErrors[0]
            ? `쓰기: ${withMore(ledgerErrors[0], ledgerErrors.length)}`
            : null,
          firstInvalid
            ? `형식 오류 경기 ${invalid.length}건(첫 경기 ${firstInvalid.id}: ${firstInvalid.error})`
            : null,
        ]
          .filter((part): part is string => part !== null)
          .join(" · "),
      ),
    });
  }
  return found;
}

export interface RunIssueContext {
  /** 워크플로 이름(이슈 원인 키 앞부분) — collect */
  workflow: string;
  runId: string;
  publishDate: string;
  occurredAt: string;
  runUrl?: string;
}

/** 부분 실패 사유 → `pipeline-partial` 이슈 payload(사유마다 하나) */
export function partialIssuePayloads(
  findings: readonly PartialFinding[],
  ctx: RunIssueContext,
): Array<IssuePayloadInput<"pipeline-partial">> {
  return findings.map((finding) => ({
    workflow: ctx.workflow,
    reason: finding.reason,
    ...(finding.detail ? { detail: finding.detail } : {}),
    runId: ctx.runId,
    publishDate: ctx.publishDate,
    occurredAt: ctx.occurredAt,
    ...(ctx.runUrl ? { runUrl: ctx.runUrl } : {}),
  }));
}

// ─── 데이터 API 소스 이슈 ────────────────────────────────────────────────

/** 이슈 스키마의 실패 종류 형식(소문자·숫자·하이픈, 40자)으로 — 맞지 않으면 unexpected */
export function issueErrorType(raw: string): string {
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return /^[a-z0-9][a-z0-9-]*$/.test(value) ? value : "unexpected";
}

export interface MatchDataIssueInput {
  footballData?: ProviderOutcome<{
    standingsFailed: ReadonlyArray<{
      comp: string;
      errorType: string;
      error: string;
    }>;
  }> | null;
  apiFootball?: ProviderOutcome<unknown> | null;
}

interface MatchIssueEvent {
  errorType: string;
  error: string;
  note: string;
}

function footballDataEvent(
  fd: NonNullable<MatchDataIssueInput["footballData"]>,
): MatchIssueEvent | null {
  if (fd.state === "failed") {
    if (NON_ISSUE_ERROR_TYPES.has(fd.errorType)) return null;
    return {
      errorType: issueErrorType(fd.errorType),
      error: oneLine(fd.error),
      note: "전날 경기 데이터를 받지 못해 그날 브리핑을 생략했습니다(뉴스는 발행 — PRD §10 데이터 API 실패). 며칠 이어지면 football-data.org 상태·키·요금제를 확인하세요.",
    };
  }
  if (fd.state === "skipped") {
    if (fd.reason !== "no-api-key") return null;
    return {
      errorType: "no-api-key",
      error: "FOOTBALL_DATA_API_KEY가 없다",
      note: "Actions Secrets에 FOOTBALL_DATA_API_KEY가 없어 경기 데이터·브리핑을 건너뛰었습니다. 키를 등록하면 다음 실행부터 정상입니다.",
    };
  }
  const failed = fd.data.standingsFailed.filter(
    (s) => !NON_ISSUE_ERROR_TYPES.has(s.errorType),
  );
  const first = failed[0];
  if (!first) return null;
  return {
    errorType: "standings",
    error: oneLine(
      `순위 ${failed.length}개 대회 실패(${failed.map((s) => s.comp).join(", ")}) — ${first.errorType}: ${first.error}`,
    ),
    note: "그 대회 순위만 빠지고 브리핑은 진행했습니다. 며칠 이어지면 football-data.org 순위 응답을 확인하세요.",
  };
}

function apiFootballEvent(
  af: NonNullable<MatchDataIssueInput["apiFootball"]>,
): MatchIssueEvent | null {
  if (af.state !== "failed" || NON_ISSUE_ERROR_TYPES.has(af.errorType)) {
    return null;
  }
  return {
    errorType: issueErrorType(af.errorType),
    error: oneLine(af.error),
    note: "API-Football 단계가 예상 밖 오류로 멈췄습니다 — 브리핑은 득점자 없이, 원장·이월은 이번 실행 몫이 빠졌습니다. 설정(API_FOOTBALL_MAX_CALLS 등)·코드 오류를 확인하세요.",
  };
}

/**
 * 경기 데이터 단계 결과 → 데이터 API 소스 이슈 payload(프로바이더마다 최대 1건). API-Football의 응답 사건(errors.plan·일 한도·
 * 그 밖 errors)은 api-football-stage.ts `apiFootballIssuePayloads`가 따로 낸다 — 여기서는 단계 자체의 실패만.
 */
export function matchDataIssuePayloads(
  matchData: MatchDataIssueInput | null,
  ctx: { occurredAt: string; runId: string; runUrl?: string },
): Array<IssuePayloadInput<"source-broken">> {
  if (matchData === null) return [];
  const events: Array<[MatchProvider, MatchIssueEvent | null]> = [
    [
      "football-data",
      matchData.footballData ? footballDataEvent(matchData.footballData) : null,
    ],
    [
      "api-football",
      matchData.apiFootball ? apiFootballEvent(matchData.apiFootball) : null,
    ],
  ];
  return events.flatMap(([provider, event]) =>
    event === null
      ? []
      : [
          {
            sourceId: MATCH_SOURCE_IDS[provider],
            sourceName: MATCH_SOURCE_NAMES[provider],
            symptoms: ["기타" as const],
            errorType: event.errorType,
            error: event.error,
            occurredAt: ctx.occurredAt,
            runId: ctx.runId,
            ...(ctx.runUrl ? { runUrl: ctx.runUrl } : {}),
            note: event.note,
          },
        ],
  );
}
