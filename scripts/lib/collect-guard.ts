/**
 * collect.yml 실행 가드 판단 로직 — I/O 없는 순수 함수 (M0-14, FR-150, M1-47 계절 가드 — PRD §15 D26).
 * GitHub API 요청·출력·종료는 scripts/collect-guard.ts가 맡는다. 현재 시각은 인자로 받는다.
 *
 * 판단 순서 (앞에서 결정되면 뒤는 보지 않는다)
 *   1. schedule·workflow_dispatch가 아닌 이벤트 → 실행 안 함
 *   2. main이 아닌 ref → 실행 안 함 (data 커밋·Pages 배포는 main 전용. github-pages environment도 main만 허용)
 *   3. schedule인데 저장소 변수 COLLECT_ENABLED가 "true"가 아님 → 실행 안 함
 *      (M1 파이프라인 완성·M1-40 리허설 전에는 백업 schedule이 매일 빈 실행을 하지 않게 한다)
 *   3a. 계절 슬롯을 읽지 못한 트리거(모르는 cron·빈 SCHEDULE·summer·winter 밖의 slot 입력) → **실패**(`invalid-trigger`,
 *      CLI exit 1 → 실패 이슈). 1~3 뒤에 판정한다 — 꺼져 있거나(COLLECT_ENABLED) main이 아닌 실행은 설정이 어긋나도 이슈를
 *      내지 않고 건너뛴다. 읽기 오류는 readGuardEnv가 `trigger.slotError`에 담아 둔다.
 *   4. 계절 슬롯이 붙은 트리거인데 오늘 발행일의 계절과 다름 → 실행 안 함(`off-season` — 실패 아님)
 *      트리거 계절: 백업 schedule = `github.event.schedule` cron 문자열(`SCHEDULE_SEASONS`), cron-job.org =
 *      workflow_dispatch 입력 `slot`(summer·winter). 입력 없는 수동 dispatch는 계절 판정 없이 5·6만 본다.
 *      오늘 계절 = `publishSlotAt(now).season`(src/lib/time.ts — 발행일 00:00 KST의 유럽 서머타임 여부, 전환일 아침은
 *      전환 전 계절). slot 입력은 force보다 먼저 본다 — slot은 "이 계절의 정기 트리거"라는 표시라 force로 넘기지 않는다.
 *      여름: 06:30 dispatch(summer)·06:40 schedule만 진행, 07:10 dispatch(winter)·07:20 schedule은 skip.
 *      겨울: 07:10 dispatch(winter)·07:20 schedule만 진행, 06:30 dispatch(summer)·06:40 schedule은 skip.
 *   5. workflow_dispatch + force → 실행 (12시간 가드 무시, 수동 재실행용)
 *   6. 최근 12시간 안에 "수집 job이 성공한" 실행이 있으면 실행 안 함, 없으면 실행
 *      6a. 결과 지연 백업 재시도(PRD §15 D60 — 2026-10-25 사용자 결정): 오늘 발행일(KST)의 브리핑 파일
 *          `data/briefs/<발행일>.json`이 mode `empty` + `emptyReason: "results-pending"`이면 **그 발행일의 수집 성공**을 성공
 *          이력으로 세지 않는다 → 다음 트리거(계절에 맞는 백업 — 1~4를 통과한 것)가 한 번 더 수집해 보충·브리핑을 시도한다.
 *          **한 번만**: 그 발행일의 수집 성공이 2건 이상(GitHub 이력)이거나 그 발행일 prod collect 실행 기록이 2건 이상
 *          (`data/runs.json` — 실패로 보존된 재시도 기록 포함, dry 기록 skipped 제외)이면 재시도를 이미 한 것으로 보고 6을 그대로
 *          적용한다(그 뒤엔 수동 force). 실행 기록을 읽지 못하면(시도 수를 모름) 재시도하지 않는다 — 중복 수집 쪽으로 열지 않는다.
 *          다른 발행일의 성공은 그대로 센다. 브리핑·실행 기록은 CLI가 main 최신 체크아웃(collect.yml guard job `ref: main`)에서
 *          읽는다 — concurrency로 기다리는 동안 앞 실행이 push한 data 커밋을 봐야 하므로 트리거 시점 SHA를 쓰지 않는다.
 *          발행일 = 수집 job 시작 시각의 KST 날짜(collect.ts 발행일 = 수집 시작 시각의 KST 날짜와 같다 — 자정 직전 시작만 하루
 *          어긋날 수 있다, 그때는 재시도하지 않는 쪽으로 어긋난다).
 *   계절 skip도 3의 skip과 같이 실행은 success, 수집 job은 skipped로 끝나 아래 정의상 성공 이력이 아니다.
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
import type { BriefFile, RunLog } from "@/lib/schema";
import {
  formatKst,
  kstDate,
  nowUtcIso,
  PUBLISH_SEASONS,
  publishSlotAt,
  type PublishSeason,
  type PublishSlot,
} from "@/lib/time";

import type { ParseResult } from "./cli-args";

/**
 * 백업 schedule cron(UTC, collect.yml `on.schedule[].cron`과 글자까지 같게) → 그 트리거의 계절 (FR-150, D26).
 * GitHub는 `github.event.schedule`에 실행을 일으킨 cron 문자열을 그대로 넣는다. cron은 UTC라 KST로는 다음 날 아침이다.
 * collect.yml의 schedule을 바꾸면 여기도 함께 바꾼다 — tests/collect-guard.test.ts가 집합·시각(publishSlot backupStart)을 확인한다.
 */
export const SCHEDULE_SEASONS: Readonly<Record<string, PublishSeason>> =
  Object.freeze({
    "40 21 * * *": "summer", // 06:40 KST
    "20 22 * * *": "winter", // 07:20 KST
  });

/** 계절 이름(로그·Step Summary) */
export const SEASON_LABELS: Readonly<Record<PublishSeason, string>> =
  Object.freeze({
    summer: "여름(유럽 서머타임)",
    winter: "겨울(유럽 표준시)",
  });

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
  | "invalid-trigger"
  | "off-season"
  | "forced"
  | "recent-success"
  | "no-recent-success"
  | "results-pending-retry";

/** 트리거에 붙은 계절 슬롯 (M1-47) */
export interface TriggerSlot {
  season: PublishSeason;
  /** schedule = 백업 cron(`github.event.schedule`) · dispatch = cron-job.org가 보낸 입력 `slot` */
  source: "schedule" | "dispatch";
  /** 원문(정규화한 cron 문자열 또는 입력값) — 로그·Step Summary용 */
  raw: string;
}

/** 실행을 일으킨 이벤트와 입력 */
export interface GuardTrigger {
  eventName: string;
  ref: string;
  /** vars.COLLECT_ENABLED == "true" */
  collectEnabled: boolean;
  /** inputs.force (workflow_dispatch에서만 의미가 있다) */
  force: boolean;
  /** 계절 슬롯 — null이면 계절 판정 없음(입력 없는 수동 dispatch, 그 밖의 이벤트, 읽기 오류) */
  slot: TriggerSlot | null;
  /**
   * 계절 슬롯 읽기 오류(모르는 cron·빈 SCHEDULE·잘못된 slot 입력) — 있으면 precheck가 판단 순서 1~3 뒤에 실패(`invalid-trigger`)로
   * 판정한다. 없으면 null.
   */
  slotError: string | null;
}

/** 12시간 안에 수집 job이 성공한 실행 */
export interface RecentSuccess {
  runId: number;
  runNumber: number;
  url: string;
  event: string;
  /** 수집 job 완료 시각 (ISO 8601, UTC) */
  completedAt: string;
  /** 그 실행의 발행일(KST) — 수집 job 시작 시각(없으면 실행 시작 시각)의 KST 날짜. 결과 지연 재시도(6a)가 쓴다 */
  publishDate: string;
}

/**
 * 오늘 발행일 브리핑 파일 상태(6a — D60). CLI가 main 최신 체크아웃에서 읽은 결과(brief-file.ts `readBriefFile`)를
 * `todayBriefState`로 바꾼다. results-pending = mode empty + emptyReason results-pending · other = 그 밖의 유효한 파일 ·
 * missing = 파일 없음 · unreadable = 읽기·JSON·스키마 오류(재시도하지 않는다).
 */
export interface TodayBrief {
  /** 발행일(KST) = 파일명 */
  date: string;
  state: "results-pending" | "other" | "missing" | "unreadable";
  /** 사람이 읽는 설명(Step Summary) — "empty(results-pending)" · "mode llm" · "파일 없음" · 오류 문구 */
  detail: string;
}

/** 결과 지연 재시도(6a) 판단 입력 — 오늘 브리핑 상태 + 그 발행일 prod collect 실행 기록 수 */
export interface ResultsPendingCheck {
  brief: TodayBrief;
  /**
   * `data/runs.json`의 그 발행일 prod collect 실행 기록 수(`countCollectAttempts` — 성공·부분·실패로 보존된 기록, dry 기록 skipped
   * 제외). 읽지 못했으면 null — 시도 수를 몰라 재시도하지 않는다.
   */
  attempts: number | null;
  /** 실행 기록 읽기 오류(attempts가 null일 때 — Step Summary) */
  runsError?: string | null;
}

/** 결과 지연 재시도(6a) 판단 결과 — Step Summary·로그용 */
export interface ResultsPendingNote {
  /** 그 발행일 성공을 성공 이력에서 뺐는가(재시도) */
  applied: boolean;
  /** 사람이 읽는 설명 */
  note: string;
  /** 성공 이력에서 뺀 그 발행일 성공(applied일 때) */
  ignored?: RecentSuccess;
}

export interface GuardDecision {
  run: boolean;
  reason: GuardReason;
  /** 사람이 읽는 설명 (Step Summary·로그) */
  message: string;
  recent?: RecentSuccess;
  /** 오늘 브리핑 상태(6a 입력 — 이력까지 본 판단에만) */
  brief?: TodayBrief;
  /** 오늘 브리핑이 결과 지연일 때 재시도 판단(6a) */
  pendingRetry?: ResultsPendingNote;
}

/** 실패로 끝내야 하는 판단인가 — CLI가 exit 1로 끝내 실패 이슈(report-failure)를 남긴다. 건너뛰기는 실패가 아니다. */
export function isFailureDecision(decision: GuardDecision): boolean {
  return decision.reason === "invalid-trigger";
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
  /** job 시작 시각 — 대기 중이거나 응답에 없으면 null */
  startedAt: string | null;
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

/** `owner/repo` 형식만 허용 — observe의 --repo 검사도 이것을 쓴다 */
export const REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/;

/** cron 문자열 비교용 — 앞뒤 공백 제거, 필드 사이 공백 1칸 */
export function normalizeCron(raw: string): string {
  return raw.trim().split(/\s+/).join(" ");
}

/**
 * 이벤트별 계절 슬롯을 읽는다 (M1-47).
 * - schedule: `SCHEDULE`(= github.event.schedule)이 `SCHEDULE_SEASONS`에 있어야 한다. 없거나 모르는 cron이면 오류 —
 *   collect.yml과 이 파일이 어긋난 설정 오류라 조용히 넘기지 않는다(readGuardEnv가 trigger.slotError에 담고, precheck가
 *   판단 순서 1~3 뒤에 실패 `invalid-trigger`로 판정 → 가드 exit 1 → 실패 이슈).
 * - workflow_dispatch: `SLOT`(= inputs.slot)이 비어 있으면 null(수동 실행 — 계절 판정 없음), summer·winter(대소문자·앞뒤
 *   공백 무시)면 그 계절, 그 밖은 오류(cron-job.org 본문 오타를 조용히 수동 실행으로 바꾸지 않는다).
 * - 그 밖의 이벤트: null(판단 순서 1이 거른다).
 */
export function readTriggerSlot(
  eventName: string,
  env: Readonly<Record<string, string | undefined>>,
): ParseResult<TriggerSlot | null> {
  if (eventName === "schedule") {
    const cron = normalizeCron(env.SCHEDULE ?? "");
    const season = Object.hasOwn(SCHEDULE_SEASONS, cron)
      ? SCHEDULE_SEASONS[cron]
      : undefined;
    if (!season) {
      return {
        ok: false,
        error: `알 수 없는 schedule cron("${cron}") — SCHEDULE(github.event.schedule)이 scripts/lib/collect-guard.ts SCHEDULE_SEASONS(${Object.keys(SCHEDULE_SEASONS).join(" · ")})에 없다. collect.yml의 schedule과 함께 고칠 것`,
      };
    }
    return { ok: true, value: { season, source: "schedule", raw: cron } };
  }
  if (eventName === "workflow_dispatch") {
    const raw = (env.SLOT ?? "").trim().toLowerCase();
    if (raw === "") return { ok: true, value: null };
    const season = PUBLISH_SEASONS.find((s) => s === raw);
    if (!season) {
      return {
        ok: false,
        error: `workflow_dispatch 입력 slot은 비우거나 ${PUBLISH_SEASONS.join("·")} 중 하나여야 합니다 (받은 값: "${raw.slice(0, 32)}")`,
      };
    }
    return { ok: true, value: { season, source: "dispatch", raw } };
  }
  return { ok: true, value: null };
}

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
  // 슬롯 읽기 오류는 여기서 실패시키지 않고 trigger에 담는다 — COLLECT_ENABLED가 꺼졌거나 main이 아닌 실행은 precheck가
  // 먼저 건너뛰고, 그 뒤에야 실패(invalid-trigger)로 판정한다(판단 순서 3a).
  const slot = readTriggerSlot(eventName, env);

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
        slot: slot.ok ? slot.value : null,
        slotError: slot.ok ? null : slot.error,
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

/** 슬롯을 사람이 읽는 형태로 — "여름(유럽 서머타임) 06:30 수집 → 07:00 공개" */
export function describeSlot(slot: PublishSlot): string {
  return `${SEASON_LABELS[slot.season]} ${formatKst(slot.collectStart, "time")} 수집 → ${formatKst(slot.publishTarget, "time")} 공개`;
}

/** 트리거 슬롯 원문 표시 — "schedule `40 21 * * *` → 여름" */
function describeTriggerSlot(slot: TriggerSlot): string {
  const label = SEASON_LABELS[slot.season];
  return slot.source === "schedule"
    ? `백업 schedule \`${slot.raw}\` → ${label}`
    : `dispatch 입력 slot=${slot.raw} → ${label}`;
}

/**
 * 이력 조회 없이 결정할 수 있는 경우를 판단한다(판단 순서 1~5). `now`는 계절 판정(4)에 쓴다 — 그 순간의 KST 발행일 계절.
 * null이면 이력(판단 순서 6)을 봐야 한다. `invalid-trigger`(3a)는 건너뛰기가 아니라 실패다 — `isFailureDecision`.
 */
export function precheck(
  trigger: GuardTrigger,
  now: Date,
): GuardDecision | null {
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
  if (trigger.slotError !== null) {
    // 판단 순서 3a — 실패(isFailureDecision). force로도 넘기지 않는다(계절을 모르는 정기 트리거가 아무 때나 수집하지 않게)
    return {
      run: false,
      reason: "invalid-trigger",
      message: `계절 슬롯을 읽지 못한 트리거 — ${trigger.slotError}`,
    };
  }
  if (trigger.slot !== null) {
    const today = publishSlotAt(nowUtcIso(now));
    if (trigger.slot.season !== today.season) {
      return {
        run: false,
        reason: "off-season",
        message: `계절에 맞지 않는 트리거 — 발행일 ${today.date}: ${describeSlot(today)} / 이 실행: ${describeTriggerSlot(trigger.slot)}. 건너뛴다(실패 아님, 성공 이력 아님 — PRD §15 D26)`,
      };
    }
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
      !isOptionalTimestamp(item.started_at) ||
      !isOptionalTimestamp(item.completed_at)
    ) {
      return { ok: false, error: `jobs[${index}]의 형식이 예상과 다릅니다` };
    }
    jobs.push({
      name: item.name,
      conclusion: item.conclusion,
      startedAt: item.started_at ?? null,
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
    publishDate: kstDateOf(job.startedAt ?? run.runStartedAt ?? run.createdAt),
  };
}

/** GitHub 시각(검증된 ISO — 밀리초 없음 가능) → KST 날짜. time.ts가 받는 형식으로 한 번 정규화한다 */
function kstDateOf(timestamp: string): string {
  return kstDate(nowUtcIso(new Date(Date.parse(timestamp))));
}

// ─── 결과 지연 백업 재시도 (6a — PRD §15 D60) ──────────────────────────────

/** 브리핑 파일 읽기 결과(brief-file.ts `BriefFileRead`와 같은 모양 — 필요한 필드만) → 6a 입력 상태 */
export function todayBriefState(
  date: string,
  read: {
    exists: boolean;
    value: Pick<BriefFile, "mode" | "emptyReason"> | null;
    error: string | null;
  },
): TodayBrief {
  if (!read.exists) return { date, state: "missing", detail: "파일 없음" };
  if (read.value === null) {
    return {
      date,
      state: "unreadable",
      detail: `읽기 오류 — ${read.error ?? "알 수 없음"}`,
    };
  }
  const { mode, emptyReason } = read.value;
  if (mode === "empty") {
    // 키 없는 옛 empty는 no-matches(src/lib/schema/brief.ts)
    const reason = emptyReason ?? "no-matches";
    return {
      date,
      state: reason === "results-pending" ? "results-pending" : "other",
      detail: `empty(${reason})`,
    };
  }
  return { date, state: "other", detail: `mode ${mode}` };
}

/**
 * 그 발행일(KST)의 prod collect 실행 기록 수 — 재시도를 이미 했는지(6a 한 번만) 판단용. 기록 시작 시각(startedAt)의 KST 날짜 =
 * 발행일(src/lib/schema/run.ts). 성공·부분·실패로 보존된 기록(M1-27)을 모두 센다 — 실패한 재시도도 재시도다. dry 실행 기록
 * (status skipped — collect-run.ts recordedRunStatus)은 발행 시도가 아니라 뺀다.
 */
export function countCollectAttempts(
  runs: readonly Pick<RunLog, "env" | "job" | "status" | "startedAt">[],
  date: string,
): number {
  return runs.filter(
    (run) =>
      run.env === "prod" &&
      run.job === "collect" &&
      run.status !== "skipped" &&
      kstDate(run.startedAt) === date,
  ).length;
}

/** 가장 최근 성공(완료 시각 기준) */
function latestSuccess(
  successes: readonly RecentSuccess[],
): RecentSuccess | undefined {
  return [...successes].sort(
    (a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt),
  )[0];
}

/**
 * 결과 지연 재시도(6a)를 적용할지 — 오늘 브리핑이 results-pending이고 그 발행일의 성공이 있을 때만 판단한다(아니면 null).
 * 적용 조건: 그 발행일 성공 1건 + 실행 기록 시도 수 ≤ 1(재시도 전). 실행 기록을 읽지 못하면 적용하지 않는다.
 */
function judgeResultsPending(
  successes: readonly RecentSuccess[],
  check: ResultsPendingCheck,
): ResultsPendingNote | null {
  const { date } = check.brief;
  if (check.brief.state !== "results-pending") return null;
  const sameDay = successes.filter((s) => s.publishDate === date);
  const [ignored] = sameDay;
  if (!ignored) return null;
  if (check.attempts === null) {
    return {
      applied: false,
      note: `발행일 ${date} 브리핑이 결과 지연(results-pending)이지만 실행 기록(data/runs.json)을 읽지 못해 재시도했는지 알 수 없다 — 재시도하지 않는다${check.runsError ? ` (${check.runsError})` : ""}`,
    };
  }
  const tried = Math.max(sameDay.length, check.attempts);
  if (tried >= 2) {
    return {
      applied: false,
      note: `발행일 ${date} 브리핑이 결과 지연(results-pending)이지만 그날 수집을 이미 ${tried}번 시도했다(성공 ${sameDay.length} · 실행 기록 ${check.attempts}) — 백업 재시도는 한 번만, 더 돌리려면 force`,
    };
  }
  return {
    applied: true,
    note: `발행일 ${date} 브리핑이 결과 지연(results-pending) — 그날 수집 성공(실행 #${ignored.runNumber})을 ${SUCCESS_WINDOW_HOURS}시간 가드의 성공 이력으로 세지 않는다(PRD §15 D60 백업 재시도 — 한 번만)`,
    ignored,
  };
}

/**
 * 이력 확인 결과로 최종 판단한다(판단 순서 6·6a). 여러 건이면 가장 최근 성공을 근거로 든다.
 * `check`(오늘 브리핑 상태·실행 기록 시도 수)가 있고 브리핑이 결과 지연이면 6a 규칙으로 그 발행일 성공을 뺄 수 있다.
 */
export function decideFromHistory(
  successes: readonly RecentSuccess[],
  check: ResultsPendingCheck | null = null,
): GuardDecision {
  const pendingRetry = check ? judgeResultsPending(successes, check) : null;
  const ignoredDate = pendingRetry?.applied ? check?.brief.date : undefined;
  const counted =
    ignoredDate === undefined
      ? successes
      : successes.filter((s) => s.publishDate !== ignoredDate);
  const extra = {
    ...(check ? { brief: check.brief } : {}),
    ...(pendingRetry ? { pendingRetry } : {}),
  };
  const recent = latestSuccess(counted);
  if (recent) {
    const retryNote = pendingRetry ? ` · ${pendingRetry.note}` : "";
    return {
      run: false,
      reason: "recent-success",
      message: `최근 ${SUCCESS_WINDOW_HOURS}시간 안에 수집 성공 이력이 있다(실행 #${recent.runNumber}, ${recent.completedAt} 완료) — 건너뛴다. 다시 돌리려면 force를 켜고 수동 실행할 것${retryNote}`,
      recent,
      ...extra,
    };
  }
  if (pendingRetry?.applied) {
    return {
      run: true,
      reason: "results-pending-retry",
      message: `${pendingRetry.note} → 한 번 다시 수집해 보충·브리핑을 시도한다`,
      ...extra,
    };
  }
  return {
    run: true,
    reason: "no-recent-success",
    message: `최근 ${SUCCESS_WINDOW_HOURS}시간 안에 수집 성공 이력이 없다 — 실행한다`,
    ...extra,
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
  const today = publishSlotAt(nowUtcIso(now));
  const rows: [string, string][] = [
    [
      "결과",
      decision.run
        ? "**실행**"
        : isFailureDecision(decision)
          ? "**실패** (exit 1 — 실패 이슈)"
          : "**건너뜀** (성공 종료)",
    ],
    ["이유", `\`${decision.reason}\` — ${cell(decision.message)}`],
    ["트리거", `${cell(trigger.eventName)} · \`${cell(trigger.ref)}\``],
    [
      "계절 슬롯",
      trigger.slotError !== null
        ? `**읽기 오류** — ${cell(trigger.slotError)}`
        : trigger.slot === null
          ? "없음 — 계절 판정 없이 12시간 가드만"
          : cell(describeTriggerSlot(trigger.slot)),
    ],
    [
      "발행일 계절",
      `${today.date} · ${describeSlot(today)} · 브리핑 마감 ${formatKst(today.briefDeadline, "time")} (KST)`,
    ],
    ["COLLECT_ENABLED", String(trigger.collectEnabled)],
    ["force", String(trigger.force)],
  ];
  const successCell = ({ runNumber, url, event, completedAt }: RecentSuccess) =>
    `[#${runNumber}](${url}) · ${event} · ${completedAt} (UTC)`;
  if (decision.recent) {
    rows.push(["최근 수집 성공", successCell(decision.recent)]);
  }
  if (decision.brief) {
    rows.push([
      "발행일 브리핑",
      `${decision.brief.date} · ${cell(decision.brief.detail)}`,
    ]);
  }
  if (decision.pendingRetry) {
    rows.push([
      "결과 지연 재시도 (D60)",
      `${decision.pendingRetry.applied ? "**적용**" : "적용 안 함"} — ${cell(decision.pendingRetry.note)}`,
    ]);
    if (decision.pendingRetry.ignored) {
      rows.push(["세지 않은 성공", successCell(decision.pendingRetry.ignored)]);
    }
  }
  rows.push(["판단 시각 (UTC)", now.toISOString()]);
  return [
    "## 수집 가드 (계절 슬롯 · 12시간 성공 이력 · 결과 지연 재시도)",
    "",
    "| 항목 | 값 |",
    "|---|---|",
    ...rows.map(([key, value]) => `| ${key} | ${value} |`),
    "",
  ].join("\n");
}
