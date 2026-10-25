/**
 * 일일 발행 관찰 (plan M1-41 · M1-42, PRD §15 D26·D48·D28·D43, NFR-05·FR-150) — 순수 함수만 둔다. GitHub 조회(gh)·파일 읽기·
 * 문서 쓰기는 scripts/observe.ts가 하고, 문서 렌더는 scripts/lib/observe-render.ts.
 *
 * 하루(발행일 D, KST)의 관찰 = 세 출처를 합친 기록(`DayObservation` — 문서 데이터 줄로 저장, 주간 요약이 다시 읽는다)
 *   ① GitHub Actions — 그 KST 하루에 만들어진 `collect.yml` 실행들: 트리거(schedule cron·dispatch slot·force — run-name에서),
 *      가드 판단(실행/건너뜀/실패 + 사유 — 건너뜀 사유는 가드 job의 notice 주석 "수집 건너뜀 (<사유>)"), collect·배포 job 결과.
 *      **공개 시각 = 그날 첫 `GitHub Pages 배포` 단계 완료.** 목표 시각(publishSlot) 대비 지연·판정(D48 ②), 계절 위반(M1-47).
 *   ② 공개한 실행(없으면 처음 수집이 돈 실행)의 collect job 로그 — JSON 로그 줄에서 정해진 이벤트의 숫자 필드만 꺼낸다(본문 전체는
 *      저장하지 않는다): 경기 데이터(football-data 종료·진행 중·미종료 → **수집 시점 경기 상태 분포**, M0-28), API-Football 상세,
 *      브리핑 시도(토큰·잘림·재시도)·게시 mode·예산 예상, LLM 단건 타임아웃(마감으로 줄인 요청).
 *   ③ data/ — `runs.json`(그날 KST prod collect 기록: status·비용·토큰·브리핑 요청·소스 실패), `briefs/D.json`(mode·줄 수),
 *      `news/D.json`(카드 수).
 * 경기 상태 분포: football-data `collect.matchdata.done` 로그의 `windowStatus`(창 안 경기의 상태 원문별 건수 + 미종료 경기의 대회·
 * 킥오프·상태 — providers/football-data.ts `windowStatusSummary`)로 종료·진행 중·그 밖 미종료와 "점수 지연 의심"(미종료인데 킥오프 뒤
 * `OVERDUE_MINUTES` 이상)을 센다. 이 필드가 생기기 전 로그(2026-10-18 이전)는 건수(finished·notFinished·inProgress)만 있어 지연은
 * 판정 불가로 남긴다.
 */
import { z } from "zod";

import {
  IsoDateSchema,
  IsoSchema,
  type BriefFile,
  type NewsFile,
  type RunLog,
} from "@/lib/schema";
import {
  kstDate,
  kstDayRangeUtc,
  kstWindowRangeUtc,
  publishSlot,
  PUBLISH_GRACE_MINUTES,
  type KstWindow,
  type UtcRange,
} from "@/lib/time";

import {
  COLLECT_JOB_NAME,
  normalizeCron,
  readTriggerSlot,
} from "./collect-guard";
import { EVAL_OUTPUT_ALERT_TOKENS } from "./eval-prompt-run";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "./llm";
import { isSeasonFirstDay, isTrialDate } from "./observation-doc";

// ─── 상수 ────────────────────────────────────────────────────────────────

/** collect.yml guard job 이름(`jobs.guard.name`) — tests/observe.test.ts가 워크플로와 같은지 확인한다 */
export const GUARD_JOB_NAME = "실행 판단 (계절 · 12시간 가드)";
/** collect.yml deploy job(`jobs.deploy.name`) + deploy.yml deploy job 이름 — 재사용 워크플로 job은 "호출 job / 호출된 job" */
export const DEPLOY_JOB_NAME = "배포 (GitHub Pages) / 배포 (GitHub Pages)";
/** deploy.yml의 Pages 배포 단계 — 이 단계 완료 = 공개 시각 */
export const DEPLOY_STEP_NAME = "GitHub Pages 배포";

/** 정기 트리거를 보는 아침 창(KST) — 여름 06:30·06:40, 겨울 07:10·07:20 트리거와 GitHub schedule 지연(실측 1~2시간)을 덮는다 */
export const MORNING_WINDOW_KST: Readonly<KstWindow> = Object.freeze({
  fromKst: "05:30",
  toKst: "10:00",
});

/** 허용 지연(D48 ② — 목표 +15분) — 단일 출처는 src/lib/time.ts(화면의 발행 지연 안내와 같은 값, M1-37) */
export { PUBLISH_GRACE_MINUTES };

/** 점수 지연 의심 — 미종료인데 킥오프 뒤 이만큼 지났다(정규 90분 + 하프타임 15분 + 추가 시간·여유) */
export const OVERDUE_MINUTES = 130;

/** football-data 상태 묶음(M0-28 상태 값 전체) */
const FD_FINISHED = new Set(["FINISHED", "AWARDED"]);
const FD_IN_PROGRESS = new Set([
  "IN_PLAY",
  "PAUSED",
  "LIVE",
  "EXTRA_TIME",
  "PENALTY_SHOOTOUT",
]);
const FD_CALLED_OFF = new Set(["POSTPONED", "SUSPENDED", "CANCELLED"]);

// ─── GitHub 응답 경계 (gh api JSON — 필요한 필드만) ─────────────────────

const GhRunSchema = z.object({
  id: z.number().int(),
  run_number: z.number().int(),
  event: z.string(),
  status: z.string().nullable(),
  conclusion: z.string().nullable(),
  created_at: IsoSchema,
  /** 이 시도(재실행이면 마지막 시도)의 시작 — 재실행은 만든 날과 다른 날일 수 있다 */
  run_started_at: IsoSchema.nullable().optional(),
  /** 시도 번호(1 = 첫 실행, 2 이상 = Re-run) */
  run_attempt: z.number().int().min(1).optional(),
  html_url: z.string(),
  display_title: z.string().optional(),
  head_branch: z.string().nullable().optional(),
});
export const GhRunsResponseSchema = z.object({
  workflow_runs: z.array(GhRunSchema),
});
export type GhRun = z.infer<typeof GhRunSchema>;

const GhStepSchema = z.object({
  name: z.string(),
  conclusion: z.string().nullable(),
  completed_at: IsoSchema.nullable().optional(),
});
const GhJobSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  status: z.string().nullable().optional(),
  conclusion: z.string().nullable(),
  started_at: IsoSchema.nullable().optional(),
  completed_at: IsoSchema.nullable().optional(),
  steps: z.array(GhStepSchema).optional(),
});
export const GhJobsResponseSchema = z.object({ jobs: z.array(GhJobSchema) });
export type GhJob = z.infer<typeof GhJobSchema>;

export const GhAnnotationsSchema = z.array(
  z.object({
    annotation_level: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
  }),
);
export type GhAnnotation = z.infer<typeof GhAnnotationsSchema>[number];

// ─── 저장 형식 (문서 데이터 줄) ──────────────────────────────────────────

const SeasonSchema = z.enum(["summer", "winter"]);

export const RunObsSchema = z.object({
  id: z.number().int(),
  url: z.string(),
  event: z.string(),
  createdAt: IsoSchema,
  /** 시도 번호 — 2 이상이면 Re-run(jobs는 마지막 시도 기준 — filter=latest). 옛 기록에는 없다 */
  runAttempt: z.number().int().min(1).optional(),
  /** 마지막 시도의 시작 */
  runStartedAt: IsoSchema.nullable().optional(),
  /** 아침 창(05:30~10:00 KST) 안에 만들어진 실행 */
  inMorningWindow: z.boolean(),
  cron: z.string().nullable(),
  /** dispatch 입력 slot(summer·winter) — run-name에서 */
  slot: z.string().nullable(),
  force: z.boolean(),
  /** 트리거가 가리키는 계절(cron·slot) — 수동 dispatch는 null */
  triggerSeason: SeasonSchema.nullable(),
  guard: z.enum(["run", "skip", "fail", "pending", "unknown"]),
  /** 가드 사유(collect-guard.ts GuardReason) — 모르면 null */
  guardReason: z.string().nullable(),
  /**
   * ok = 계절 맞음 또는 맞지 않는 트리거가 건너뜀 · violation = 맞지 않는 트리거가 수집 · unverified = 맞지 않는 트리거인데 가드
   * 판단을 확인하지 못함(가드 실패·진행 중·조회 실패 — ok로 세지 않는다) · n/a = 계절 없는 트리거(수동 dispatch)
   */
  seasonCheck: z.enum(["ok", "violation", "unverified", "n/a"]),
  collect: z
    .object({
      conclusion: z.string().nullable(),
      startedAt: IsoSchema.nullable(),
      completedAt: IsoSchema.nullable(),
    })
    .nullable(),
  /** Pages 배포 단계 완료(성공일 때만) */
  deployedAt: IsoSchema.nullable(),
  deployConclusion: z.string().nullable(),
  conclusion: z.string().nullable(),
});
export type RunObs = z.infer<typeof RunObsSchema>;

export const PublishVerdictSchema = z.enum([
  "on-time",
  "allowed",
  "late",
  "none",
  "unknown",
]);
export type PublishVerdict = z.infer<typeof PublishVerdictSchema>;

export const PublishObsSchema = z.object({
  runId: z.number().int().nullable(),
  publishedAt: IsoSchema.nullable(),
  /** 공개 − 목표(분, 소수 1자리 — 음수 = 일찍) */
  delayMinutes: z.number().nullable(),
  verdict: PublishVerdictSchema,
  /** 공개한 실행이 slot 없는 수동 dispatch */
  manual: z.boolean(),
  /** 공개한 실행이 아침 창 밖 */
  outsideWindow: z.boolean(),
});
export type PublishObs = z.infer<typeof PublishObsSchema>;

const BriefAttemptSchema = z.object({
  attempt: z.number().int(),
  ok: z.boolean(),
  errorType: z.string().nullable(),
  verdict: z.string().nullable(),
  tokensIn: z.number(),
  tokensOut: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  thinkingTokens: z.number().nullable(),
});

const FdWindowEntrySchema = z.object({
  comp: z.string(),
  kickoff: IsoSchema,
  status: z.string(),
});

export const LogFactsSchema = z.object({
  runId: z.string().nullable(),
  deadlineBasis: z.string().nullable(),
  briefDeadline: IsoSchema.nullable(),
  footballData: z
    .object({
      at: IsoSchema,
      fetched: z.number(),
      finished: z.number(),
      notFinished: z.number(),
      inProgress: z.record(z.string(), z.number()),
      /** 창 안 경기별 상태(로그에 있을 때만) */
      window: z
        .object({
          statuses: z.record(z.string(), z.number()),
          unfinished: z.array(FdWindowEntrySchema),
          /** 미종료 전체 수(목록은 상한 30에서 잘린다) */
          unfinishedTotal: z.number().optional(),
        })
        .nullable(),
    })
    .nullable(),
  apiFootball: z
    .object({
      targets: z.number(),
      details: z.number(),
      pending: z.number(),
      goalsIncomplete: z.number(),
      brief: z.string().nullable(),
      apiCalls: z.number(),
      stoppedBy: z.string().nullable(),
    })
    .nullable(),
  briefAttempts: z.array(BriefAttemptSchema),
  briefSkips: z.array(z.string()),
  briefBudget: z
    .object({ verdict: z.string(), estimatedUsd: z.number().nullable() })
    .nullable(),
  briefDone: z
    .object({
      verdict: z.string().nullable(),
      publishedAi: z.number().nullable(),
      publishedTemplate: z.number().nullable(),
      droppedOutputLines: z.number().nullable(),
    })
    .nullable(),
  briefPublish: z
    .object({
      mode: z.string(),
      reason: z.string().nullable(),
      action: z.string().nullable(),
    })
    .nullable(),
  llm: z.object({
    calls: z.number().int(),
    /** 요청 타임아웃 최솟값 — llm.ts 기본값(DEFAULT_REQUEST_TIMEOUT_MS)보다 짧으면 브리핑 마감으로 줄인 요청(M1-45 이월) */
    minTimeoutMs: z.number().nullable(),
    deadlineCut: z.number().int(),
  }),
  done: z
    .object({
      status: z.string(),
      exitCode: z.number().nullable(),
    })
    .nullable(),
});
export type LogFacts = z.infer<typeof LogFactsSchema>;

export const MatchStatusSchema = z.object({
  /** window = 경기별 목록 · counts = 건수만 */
  source: z.enum(["window", "counts"]),
  /** football-data 받은 시각(로그 줄 시각) */
  at: IsoSchema,
  finished: z.number().int(),
  inProgress: z.number().int(),
  /** 그 밖의 미종료(미시작·연기·중단) */
  otherUnfinished: z.number().int(),
  /** 연기·중단·취소(경기별 목록이 있을 때만) */
  calledOff: z.number().int().nullable(),
  /** 점수 지연 의심(경기별 목록이 있을 때만) */
  overdue: z.number().int().nullable(),
  unfinished: z.array(
    FdWindowEntrySchema.extend({ minutesSinceKickoff: z.number().int() }),
  ),
  /** 미종료 전체 수 — unfinished 목록보다 크면 목록이 잘렸다(지연 의심은 목록 안에서만 셈) */
  unfinishedTotal: z.number().int().optional(),
});
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

export const RunRecordObsSchema = z.object({
  runId: z.string(),
  startedAt: IsoSchema,
  status: z.string(),
  collected: z.number(),
  clusters: z.number(),
  summarized: z.number(),
  downgraded: z.number(),
  costUsd: z.number(),
  tokens: z.object({
    in: z.number(),
    out: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
  }),
  requests: z.number().int(),
  unbilledRiskUsd: z.number().nullable(),
  apiCalls: z.object({ footballData: z.number(), apiFootball: z.number() }),
  failedSources: z.array(
    z.object({ id: z.string(), error: z.string().nullable() }),
  ),
});
export type RunRecordObs = z.infer<typeof RunRecordObsSchema>;

export const DataFactsSchema = z.object({
  runs: z.array(RunRecordObsSchema),
  runsError: z.string().nullable(),
  totals: z.object({
    costUsd: z.number(),
    requests: z.number().int(),
    in: z.number(),
    out: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
  }),
  brief: z
    .object({
      mode: z.string(),
      lines: z.number().int(),
      aiLines: z.number().int(),
      runId: z.string(),
    })
    .nullable(),
  briefError: z.string().nullable(),
  news: z.object({ cards: z.number().int(), runId: z.string() }).nullable(),
  newsError: z.string().nullable(),
});
export type DataFacts = z.infer<typeof DataFactsSchema>;

export const DayObservationSchema = z.object({
  v: z.literal(1),
  date: IsoDateSchema,
  observedAt: IsoSchema,
  season: SeasonSchema,
  publishTarget: IsoSchema,
  seasonFirstDay: z.boolean(),
  trial: z.boolean(),
  actions: z.object({
    ok: z.boolean(),
    error: z.string().nullable(),
    runs: z.array(RunObsSchema),
  }),
  publish: PublishObsSchema,
  /** 로그를 읽은 실행(Actions run id) */
  logRunId: z.number().int().nullable(),
  log: LogFactsSchema.nullable(),
  logError: z.string().nullable(),
  data: DataFactsSchema,
  matchStatus: MatchStatusSchema.nullable(),
  notes: z.array(z.string()),
});
export type DayObservation = z.infer<typeof DayObservationSchema>;

// ─── 날짜 창 ─────────────────────────────────────────────────────────────

/** 발행일의 KST 하루(UTC) — gh `created=` 필터 */
export function observeDayRange(date: string): UtcRange {
  return kstDayRangeUtc(date);
}

/** 발행일의 아침 창(UTC) */
export function morningWindow(date: string): UtcRange {
  return kstWindowRangeUtc(date, MORNING_WINDOW_KST);
}

/** gh `created` 필터 값(`a..b`, 초 단위 Z) */
export function createdFilter(range: UtcRange): string {
  const trim = (iso: string) => iso.replace(/\.\d{3}Z$/, "Z");
  return `${trim(range.start)}..${trim(range.end)}`;
}

// ─── 트리거·가드 ─────────────────────────────────────────────────────────

export interface RunTrigger {
  event: string;
  cron: string | null;
  slot: string | null;
  force: boolean;
  limit: string | null;
  season: "summer" | "winter" | null;
}

/**
 * run-name(`Collect (schedule 40 21 * * *)`·`Collect (workflow_dispatch, slot summer, force, limit 5)` — collect.yml `run-name`)
 * → 트리거. 계절은 collect-guard.ts `readTriggerSlot`과 같은 규칙(모르는 cron·slot이면 null).
 */
export function parseRunTrigger(
  event: string,
  title: string | undefined,
): RunTrigger {
  const inner = /^Collect \((.*)\)$/.exec(title?.trim() ?? "")?.[1] ?? "";
  const parts = inner === "" ? [] : inner.split(", ");
  const head = parts[0] ?? "";
  const cron =
    event === "schedule" && head.startsWith("schedule ")
      ? normalizeCron(head.slice("schedule ".length))
      : null;
  let slot: string | null = null;
  let force = false;
  let limit: string | null = null;
  for (const p of parts.slice(1)) {
    if (p.startsWith("slot ")) slot = p.slice(5).trim();
    else if (p === "force") force = true;
    else if (p.startsWith("limit ")) limit = p.slice(6).trim();
  }
  const read = readTriggerSlot(event, {
    SCHEDULE: cron ?? "",
    SLOT: slot ?? "",
  });
  return {
    event,
    cron,
    slot,
    force,
    limit,
    season: read.ok && read.value ? read.value.season : null,
  };
}

/**
 * 가드 job notice 주석 제목 `수집 건너뜀 (<사유>)`·재시도 제목 `수집 재시도 (results-pending-retry)`(결과 지연 백업 재시도 —
 * PRD §15 D60)·오류 제목 `수집 가드 설정 오류 (<사유>)` → 사유
 */
export function guardReasonFromAnnotations(
  annotations: readonly GhAnnotation[],
): string | null {
  for (const a of annotations) {
    const m = /^수집 (?:건너뜀|재시도|가드 설정 오류) \(([a-z-]+)\)$/.exec(
      a.title?.trim() ?? "",
    );
    if (m) return m[1]!;
  }
  for (const a of annotations) {
    if (a.title?.startsWith("수집 가드 이력 조회 실패")) return "history-error";
  }
  return null;
}

function findJob(jobs: readonly GhJob[], name: string): GhJob | undefined {
  return jobs.find((j) => j.name === name);
}

export interface RunInput {
  run: GhRun;
  /** null = jobs 조회 실패 */
  jobs: GhJob[] | null;
  /** 가드 주석 — 조회하지 않았거나 실패하면 null */
  annotations: GhAnnotation[] | null;
}

/** 실행 1건 → 관찰(순수 함수). `date` = 발행일(계절 판정) */
export function observeRun(input: RunInput, date: string): RunObs {
  const { run, jobs } = input;
  const trigger = parseRunTrigger(run.event, run.display_title);
  const window = morningWindow(date);
  const created = Date.parse(run.created_at);
  const guardJob = jobs ? findJob(jobs, GUARD_JOB_NAME) : undefined;
  const collectJob = jobs ? findJob(jobs, COLLECT_JOB_NAME) : undefined;
  const deployJob = jobs ? findJob(jobs, DEPLOY_JOB_NAME) : undefined;
  const annotated = input.annotations
    ? guardReasonFromAnnotations(input.annotations)
    : null;

  let guard: RunObs["guard"] = "unknown";
  let guardReason: string | null = annotated;
  if (guardJob) {
    if (guardJob.conclusion === null) guard = "pending";
    else if (guardJob.conclusion !== "success") guard = "fail";
    else if (collectJob && collectJob.conclusion !== "skipped") {
      guard = "run";
      // 가드가 진행시키는 사유는 force · 12시간 이력 없음 · 결과 지연 백업 재시도(collect-guard.ts precheck·decideFromHistory).
      // 재시도만 주석(`수집 재시도 (results-pending-retry)`)을 남긴다 — 주석이 없으면(조회 안 함·실패 포함) 앞의 둘로 본다.
      guardReason = trigger.force
        ? "forced"
        : annotated === "results-pending-retry"
          ? annotated
          : "no-recent-success";
    } else if (collectJob) guard = "skip";
  }

  const daySeason = publishSlot(date).season;
  const seasonCheck: RunObs["seasonCheck"] =
    trigger.season === null
      ? "n/a"
      : trigger.season === daySeason
        ? "ok"
        : guard === "run"
          ? "violation"
          : guard === "skip"
            ? "ok"
            : "unverified";

  // 공개 시각 = Pages 배포 단계 완료(단계 기록이 없으면 배포 job 완료)
  const deployStep = deployJob?.steps?.find((s) => s.name === DEPLOY_STEP_NAME);
  const stepDone =
    deployStep?.conclusion === "success"
      ? (deployStep.completed_at ?? null)
      : null;
  const deployedAt =
    deployJob?.conclusion === "success"
      ? (stepDone ?? deployJob.completed_at ?? null)
      : null;

  return {
    id: run.id,
    url: run.html_url,
    event: run.event,
    createdAt: new Date(created).toISOString(),
    runAttempt: run.run_attempt ?? 1,
    runStartedAt: run.run_started_at
      ? new Date(Date.parse(run.run_started_at)).toISOString()
      : null,
    inMorningWindow:
      created >= Date.parse(window.start) && created < Date.parse(window.end),
    cron: trigger.cron,
    slot: trigger.slot,
    force: trigger.force,
    triggerSeason: trigger.season,
    guard,
    guardReason,
    seasonCheck,
    collect: collectJob
      ? {
          conclusion: collectJob.conclusion,
          startedAt: collectJob.started_at ?? null,
          completedAt: collectJob.completed_at ?? null,
        }
      : null,
    deployedAt: deployedAt === null ? null : new Date(deployedAt).toISOString(),
    deployConclusion: deployJob?.conclusion ?? null,
    conclusion: run.conclusion,
  };
}

/**
 * 이 실행의 가드 사유를 알려면 주석을 봐야 하나 — 진입점이 주석 조회 여부를 정한다. 건너뜀·실패, 그리고 수집이 돈 실행(결과 지연
 * 백업 재시도인지 — 재시도 주석이 있다, D60). 가드가 끝나지 않았으면(진행 중) 보지 않는다.
 */
export function needsGuardAnnotations(jobs: readonly GhJob[]): number | null {
  const guardJob = findJob(jobs, GUARD_JOB_NAME);
  const collectJob = findJob(jobs, COLLECT_JOB_NAME);
  if (!guardJob) return null;
  if (guardJob.conclusion !== null && guardJob.conclusion !== "success") {
    return guardJob.id;
  }
  return guardJob.conclusion === "success" && collectJob ? guardJob.id : null;
}

/** 로그를 읽을 실행 — 공개한 실행, 없으면 처음 수집이 돈 실행. 그 collect job id */
export function logTarget(
  runs: readonly RunObs[],
  jobsByRun: ReadonlyMap<number, readonly GhJob[]>,
): { runId: number; jobId: number } | null {
  const sorted = [...runs].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const pick =
    sorted.find((r) => r.deployedAt !== null) ??
    sorted.find(
      (r) => r.collect !== null && r.collect.conclusion !== "skipped",
    );
  if (!pick) return null;
  const job = findJob(jobsByRun.get(pick.id) ?? [], COLLECT_JOB_NAME);
  return job ? { runId: pick.id, jobId: job.id } : null;
}

// ─── 공개 판정 ───────────────────────────────────────────────────────────

/** 공개 시각 − 목표 → 판정(D48 ② — 일찍 공개 허용) */
export function judgePublish(
  publishedAt: string | null,
  publishTarget: string,
): { delayMinutes: number | null; verdict: PublishVerdict } {
  if (publishedAt === null) return { delayMinutes: null, verdict: "none" };
  const delaySec = (Date.parse(publishedAt) - Date.parse(publishTarget)) / 1000;
  const delayMinutes = Math.round(delaySec / 6) / 10;
  const verdict: PublishVerdict =
    delaySec <= 0
      ? "on-time"
      : delaySec <= PUBLISH_GRACE_MINUTES * 60
        ? "allowed"
        : "late";
  return { delayMinutes, verdict };
}

/** 실행 관찰들 → 그날 공개(첫 배포) */
export function observePublish(
  runs: readonly RunObs[] | null,
  publishTarget: string,
): PublishObs {
  if (runs === null) {
    return {
      runId: null,
      publishedAt: null,
      delayMinutes: null,
      verdict: "unknown",
      manual: false,
      outsideWindow: false,
    };
  }
  const first = [...runs]
    .filter((r) => r.deployedAt !== null)
    .sort((a, b) => Date.parse(a.deployedAt!) - Date.parse(b.deployedAt!))[0];
  const judged = judgePublish(first?.deployedAt ?? null, publishTarget);
  return {
    runId: first?.id ?? null,
    publishedAt: first?.deployedAt ?? null,
    ...judged,
    manual: first
      ? first.event === "workflow_dispatch" && first.slot === null
      : false,
    outsideWindow: first ? !first.inMorningWindow : false,
  };
}

// ─── collect 로그 ────────────────────────────────────────────────────────

const num = z.number();
const LogLineSchema = z.object({ ts: IsoSchema, event: z.string() });
const FdDoneSchema = z.object({
  provider: z.literal("football-data"),
  fetched: num,
  finished: num,
  skipped: z.object({ notFinished: num }),
  inProgress: z.record(z.string(), num),
  /** 창 안 경기별 상태 — 형식이 달라도 건수는 살리게 따로 파싱한다(FdWindowStatusSchema) */
  windowStatus: z.unknown().optional(),
});
/** 창 안 경기별 상태(providers/football-data.ts windowStatusSummary) — 이 필드가 생기기 전 로그에는 없다 */
const FdWindowStatusSchema = z.object({
  statuses: z.record(z.string(), num),
  unfinished: z.array(FdWindowEntrySchema),
  unfinishedTotal: num.optional(),
});
const AfDoneSchema = z.object({
  provider: z.literal("api-football"),
  targets: num,
  details: num,
  pending: num,
  goalsIncomplete: num,
  brief: z.string().nullable().optional(),
  apiCalls: num,
  stoppedBy: z.string().nullable().optional(),
});
const AttemptLineSchema = z.object({
  attempt: z.number().int(),
  ok: z.boolean(),
  errorType: z.string().nullable().optional(),
  verdict: z.string().nullable().optional(),
  tokensIn: num.optional(),
  tokensOut: num.optional(),
  cacheRead: num.optional(),
  cacheWrite: num.optional(),
  thinkingTokens: num.nullable().optional(),
});

/**
 * collect job 로그 텍스트(줄마다 `<Actions 시각> <로그 줄>`) → 관찰 사실. JSON 로그 줄(logger.ts — CI는 JSON)만 보고, 정해진 이벤트의
 * 숫자·짧은 식별자 필드만 꺼낸다. 형식이 다른 줄은 건너뛴다. 이벤트가 하나도 없으면 null.
 */
export function extractLogFacts(text: string): LogFacts | null {
  const facts: LogFacts = {
    runId: null,
    deadlineBasis: null,
    briefDeadline: null,
    footballData: null,
    apiFootball: null,
    briefAttempts: [],
    briefSkips: [],
    briefBudget: null,
    briefDone: null,
    briefPublish: null,
    llm: { calls: 0, minTimeoutMs: null, deadlineCut: 0 },
    done: null,
  };
  let seen = 0;
  for (const raw of text.split("\n")) {
    const brace = raw.indexOf("{");
    if (brace < 0) continue;
    let json: unknown;
    try {
      json = JSON.parse(raw.slice(brace));
    } catch {
      continue;
    }
    const head = LogLineSchema.safeParse(json);
    if (!head.success) continue;
    const { ts, event } = head.data;
    const record = json as Record<string, unknown>;
    switch (event) {
      case "collect.start": {
        const p = z.object({ runId: z.string() }).safeParse(record);
        if (p.success) facts.runId = p.data.runId;
        break;
      }
      case "collect.deadline": {
        const p = z
          .object({ basis: z.string(), briefDeadline: IsoSchema })
          .safeParse(record);
        if (p.success) {
          facts.deadlineBasis = p.data.basis;
          facts.briefDeadline = p.data.briefDeadline;
        }
        break;
      }
      case "collect.matchdata.done": {
        const fd = FdDoneSchema.safeParse(record);
        if (fd.success) {
          facts.footballData = {
            at: new Date(Date.parse(ts)).toISOString(),
            fetched: fd.data.fetched,
            finished: fd.data.finished,
            notFinished: fd.data.skipped.notFinished,
            inProgress: fd.data.inProgress,
            window:
              FdWindowStatusSchema.safeParse(fd.data.windowStatus).data ?? null,
          };
          break;
        }
        const af = AfDoneSchema.safeParse(record);
        if (af.success) {
          facts.apiFootball = {
            targets: af.data.targets,
            details: af.data.details,
            pending: af.data.pending,
            goalsIncomplete: af.data.goalsIncomplete,
            brief: af.data.brief ?? null,
            apiCalls: af.data.apiCalls,
            stoppedBy: af.data.stoppedBy ?? null,
          };
        }
        break;
      }
      case "summarize.brief.attempt": {
        const p = AttemptLineSchema.safeParse(record);
        if (p.success) {
          facts.briefAttempts.push({
            attempt: p.data.attempt,
            ok: p.data.ok,
            errorType: p.data.errorType ?? null,
            verdict: p.data.verdict ?? null,
            tokensIn: p.data.tokensIn ?? 0,
            tokensOut: p.data.tokensOut ?? 0,
            cacheRead: p.data.cacheRead ?? 0,
            cacheWrite: p.data.cacheWrite ?? 0,
            thinkingTokens: p.data.thinkingTokens ?? null,
          });
        }
        break;
      }
      case "summarize.brief.skip": {
        const p = z.object({ reason: z.string() }).safeParse(record);
        if (p.success) facts.briefSkips.push(p.data.reason);
        break;
      }
      case "summarize.brief.budget": {
        const p = z
          .object({ verdict: z.string(), estimatedUsd: num.optional() })
          .safeParse(record);
        if (p.success) {
          facts.briefBudget = {
            verdict: p.data.verdict,
            estimatedUsd: p.data.estimatedUsd ?? null,
          };
        }
        break;
      }
      case "summarize.brief.done": {
        const p = z
          .object({
            verdict: z.string().nullable().optional(),
            publishedAi: num.nullable().optional(),
            publishedTemplate: num.nullable().optional(),
            droppedOutputLines: num.nullable().optional(),
          })
          .safeParse(record);
        if (p.success) {
          facts.briefDone = {
            verdict: p.data.verdict ?? null,
            publishedAi: p.data.publishedAi ?? null,
            publishedTemplate: p.data.publishedTemplate ?? null,
            droppedOutputLines: p.data.droppedOutputLines ?? null,
          };
        }
        break;
      }
      case "summarize.brief.publish": {
        const p = z
          .object({
            mode: z.string(),
            reason: z.string().nullable().optional(),
            action: z.string().nullable().optional(),
          })
          .safeParse(record);
        if (p.success) {
          facts.briefPublish = {
            mode: p.data.mode,
            reason: p.data.reason ?? null,
            action: p.data.action ?? null,
          };
        }
        break;
      }
      case "llm.single.done": {
        const p = z
          .object({
            timeoutMs: num.optional(),
            deadlineCut: z.boolean().optional(),
          })
          .safeParse(record);
        if (p.success) {
          facts.llm.calls += 1;
          if (p.data.deadlineCut) facts.llm.deadlineCut += 1;
          if (p.data.timeoutMs !== undefined) {
            facts.llm.minTimeoutMs =
              facts.llm.minTimeoutMs === null
                ? p.data.timeoutMs
                : Math.min(facts.llm.minTimeoutMs, p.data.timeoutMs);
          }
        }
        break;
      }
      case "collect.done": {
        const p = z
          .object({ status: z.string(), exitCode: num.nullable().optional() })
          .safeParse(record);
        if (p.success) {
          facts.done = {
            status: p.data.status,
            exitCode: p.data.exitCode ?? null,
          };
        }
        break;
      }
      default:
        continue;
    }
    seen += 1;
  }
  return seen === 0 ? null : facts;
}

/**
 * 로그의 football-data 사실 → 수집 시점 경기 상태 분포(M0-28). 경기별 목록(`window`)이 있으면 상태 묶음·지연 의심을 경기 단위로,
 * 없으면 건수만(종료 · 진행 중 합 · 그 밖 미종료 = notFinished − 진행 중). 교차 `/v4/matches`는 dateTo 당일을 빼고 주므로
 * (providers/football-data.ts) 받은 경기 = 창(UTC 하루 D-1) 경기다.
 */
export function matchStatusFromLog(
  fd: LogFacts["footballData"],
): MatchStatus | null {
  if (!fd) return null;
  const at = Date.parse(fd.at);
  if (fd.window) {
    let finished = 0;
    let inProgress = 0;
    let calledOff = 0;
    let other = 0;
    for (const [status, count] of Object.entries(fd.window.statuses)) {
      if (FD_FINISHED.has(status)) finished += count;
      else if (FD_IN_PROGRESS.has(status)) inProgress += count;
      else {
        other += count;
        if (FD_CALLED_OFF.has(status)) calledOff += count;
      }
    }
    const unfinished = fd.window.unfinished.map((u) => ({
      ...u,
      minutesSinceKickoff: Math.floor((at - Date.parse(u.kickoff)) / 60_000),
    }));
    const overdue = unfinished.filter(
      (u) =>
        !FD_CALLED_OFF.has(u.status) &&
        u.minutesSinceKickoff >= OVERDUE_MINUTES,
    ).length;
    return {
      source: "window",
      at: fd.at,
      finished,
      inProgress,
      otherUnfinished: other,
      calledOff,
      overdue,
      unfinished,
      unfinishedTotal: fd.window.unfinishedTotal ?? unfinished.length,
    };
  }
  const inProgress = Object.values(fd.inProgress).reduce((s, n) => s + n, 0);
  return {
    source: "counts",
    at: fd.at,
    finished: fd.finished,
    inProgress,
    otherUnfinished: Math.max(0, fd.notFinished - inProgress),
    calledOff: null,
    overdue: null,
    unfinished: [],
  };
}

// ─── data/ ───────────────────────────────────────────────────────────────

/** 그날(KST) prod collect 기록 — 시작 순 */
export function runsOfDay(runs: readonly RunLog[], date: string): RunLog[] {
  return runs
    .filter(
      (r) =>
        r.env === "prod" &&
        r.job === "collect" &&
        kstDate(r.startedAt) === date,
    )
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

export interface DataInput {
  date: string;
  /** runs.json 전체 — 읽지 못했으면 오류 문자열 */
  runs: readonly RunLog[] | { error: string };
  /** 그날 브리핑 — 없으면 null, 오류면 문자열 */
  brief: BriefFile | null | { error: string };
  news: NewsFile | null | { error: string };
}

function isError(v: unknown): v is { error: string } {
  return typeof v === "object" && v !== null && "error" in v;
}

/** data/ 파일 → 그날 사실(순수 함수) */
export function dataFacts(input: DataInput): DataFacts {
  const records = isError(input.runs) ? [] : runsOfDay(input.runs, input.date);
  const runs: RunRecordObs[] = records.map((r) => ({
    runId: r.runId,
    startedAt: r.startedAt,
    status: r.status,
    collected: r.collected,
    clusters: r.clusters,
    summarized: r.summarized,
    downgraded: r.downgraded,
    costUsd: r.costUsd,
    tokens: { ...r.tokens },
    requests: r.brief?.requests ?? 0,
    unbilledRiskUsd: r.brief?.unbilledRisk?.usdMax ?? null,
    apiCalls: { ...r.apiCalls },
    failedSources: r.sources
      .filter((s) => !s.ok)
      .map((s) => ({ id: s.id, error: s.error ?? null })),
  }));
  const totals = runs.reduce(
    (t, r) => ({
      costUsd: t.costUsd + r.costUsd,
      requests: t.requests + r.requests,
      in: t.in + r.tokens.in,
      out: t.out + r.tokens.out,
      cacheRead: t.cacheRead + r.tokens.cacheRead,
      cacheWrite: t.cacheWrite + r.tokens.cacheWrite,
    }),
    { costUsd: 0, requests: 0, in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
  );
  totals.costUsd = Math.round(totals.costUsd * 1e6) / 1e6;
  const brief =
    isError(input.brief) || input.brief === null ? null : input.brief;
  const news = isError(input.news) || input.news === null ? null : input.news;
  return {
    runs,
    runsError: isError(input.runs) ? input.runs.error : null,
    totals,
    brief: brief
      ? {
          mode: brief.mode,
          lines: brief.lines.length,
          aiLines: brief.lines.filter((l) => l.ai).length,
          runId: brief.runId,
        }
      : null,
    briefError: isError(input.brief) ? input.brief.error : null,
    news: news ? { cards: news.cards.length, runId: news.runId } : null,
    newsError: isError(input.news) ? input.news.error : null,
  };
}

// ─── 하루 관찰 조립 ──────────────────────────────────────────────────────

export interface DayInput {
  date: string;
  observedAt: string;
  /** Actions 실행 관찰 — 조회 실패면 오류 */
  actions: { runs: RunObs[] } | { error: string };
  logRunId: number | null;
  log: LogFacts | null;
  logError: string | null;
  data: DataFacts;
}

/** 세 출처 → 하루 관찰(자동 메모 포함) */
export function buildDayObservation(input: DayInput): DayObservation {
  const slot = publishSlot(input.date);
  const runs = isError(input.actions) ? null : input.actions.runs;
  const publish = observePublish(runs, slot.publishTarget);
  const notes: string[] = [];
  const trial = isTrialDate(input.date);
  if (trial) notes.push("관찰 전 시험(관찰 기간 밖 — 주간 판정 제외)");
  if (publish.manual || publish.outsideWindow) {
    notes.push(
      `처음 공개한 실행이 ${publish.manual ? "slot 없는 수동 dispatch" : ""}${publish.manual && publish.outsideWindow ? "·" : ""}${publish.outsideWindow ? "아침 창(05:30~10:00 KST) 밖" : ""} — 정시 판정은 참고용`,
    );
  }
  const seasonFirstDay = isSeasonFirstDay(input.date);
  if (seasonFirstDay) {
    notes.push(
      `${slot.season === "winter" ? "겨울" : "여름"} 첫 발행 — 발행 시각 변경과 경기 시각 KST 표시를 화면에서 확인(M1-41)`,
    );
  }
  // 날을 넘긴 재실행 — jobs·배포·로그는 마지막 시도 기준이라 그날 공개로 보면 안 될 수 있다
  for (const r of runs ?? []) {
    if ((r.runAttempt ?? 1) < 2 || !r.runStartedAt) continue;
    const startedDay = kstDate(r.runStartedAt);
    if (startedDay !== kstDate(r.createdAt)) {
      notes.push(
        `실행 #${r.id} 재실행(시도 ${r.runAttempt})이 ${startedDay}에 시작 — 가드·배포·로그는 그 시도 기준(공개 판정 확인)`,
      );
    }
  }
  const unverified = runs?.filter((r) => r.seasonCheck === "unverified") ?? [];
  if (unverified.length > 0) {
    notes.push(
      `계절 확인 불가 ${unverified.length}건 — 계절에 맞지 않는 트리거의 가드 판단을 확인하지 못함(가드 실패·진행 중·조회 실패)`,
    );
  }
  const violations = runs?.filter((r) => r.seasonCheck === "violation") ?? [];
  if (violations.length > 0) {
    notes.push(
      `계절 위반 ${violations.length}건 — 계절에 맞지 않는 트리거가 수집함(M1-47 가드 확인)`,
    );
  }
  if (publish.publishedAt !== null && input.data.runs.length === 0) {
    notes.push(
      "배포는 있는데 로컬 runs.json에 그날 기록이 없다 — git pull 후 다시 실행",
    );
  }
  const maxTokens = input.log?.briefAttempts.filter(
    (a) => a.errorType === "max_tokens",
  ).length;
  if (maxTokens)
    notes.push(`브리핑 max_tokens 잘림 ${maxTokens}회(M1-20 이월 지표)`);
  const overOut = input.log?.briefAttempts.filter(
    (a) => a.tokensOut > EVAL_OUTPUT_ALERT_TOKENS,
  ).length;
  if (overOut)
    notes.push(
      `출력 ${EVAL_OUTPUT_ALERT_TOKENS.toLocaleString("en-US")}토큰 초과 ${overOut}회(eval.output-over-alert 기준)`,
    );
  // 타임아웃은 기본값과 비교한다 — 기본값을 바꾸기 전 실행의 로그면 '변경 전'일 수 있어 단정하지 않는다
  const minTimeoutMs = input.log?.llm.minTimeoutMs ?? null;
  if (minTimeoutMs !== null && minTimeoutMs < DEFAULT_REQUEST_TIMEOUT_MS) {
    notes.push(
      `LLM 요청 타임아웃 ${minTimeoutMs}ms — 기본 ${DEFAULT_REQUEST_TIMEOUT_MS}ms보다 짧음(브리핑 마감으로 줄인 요청 또는 기본값 변경 전 실행, M1-45 이월)`,
    );
  }
  const deadlineCut = input.log?.llm.deadlineCut ?? 0;
  if (deadlineCut > 0) {
    notes.push(
      `LLM 요청 마감 절단 ${deadlineCut}회(llm.single.done deadlineCut)`,
    );
  }
  for (const reason of input.log?.briefSkips ?? []) {
    notes.push(`브리핑 생략 사유 ${reason}`);
  }
  return {
    v: 1,
    date: input.date,
    observedAt: input.observedAt,
    season: slot.season,
    publishTarget: slot.publishTarget,
    seasonFirstDay,
    trial,
    actions: isError(input.actions)
      ? { ok: false, error: input.actions.error, runs: [] }
      : { ok: true, error: null, runs: input.actions.runs },
    publish,
    logRunId: input.logRunId,
    log: input.log,
    logError: input.logError,
    data: input.data,
    matchStatus: matchStatusFromLog(input.log?.footballData ?? null),
    notes,
  };
}

// ─── 주간 요약 ───────────────────────────────────────────────────────────

export interface WeekSummary {
  from: string;
  to: string;
  /** 기간 날짜 수 */
  periodDays: number;
  /** 관찰 기록이 있는 날(시험 측정 포함 여부는 호출부가 거른다) */
  observed: string[];
  missing: string[];
  publish: Record<PublishVerdict, number>;
  /** 목표 +15분 이내(정시·허용) 연속 일수의 최댓값 */
  longestStreak: number;
  avgDelayMinutes: number | null;
  maxDelayMinutes: number | null;
  seasonViolations: number;
  /** 계절에 맞지 않는 트리거인데 가드 판단을 확인하지 못한 실행 수 */
  seasonUnverified: number;
  offSeasonSkips: number;
  cost: {
    perDay: Array<{
      date: string;
      usd: number;
      requests: number;
      cacheRead: number;
      cacheWrite: number;
      out: number;
    }>;
    totalUsd: number;
    avgUsd: number | null;
    /** 평균 × 30 — 월 예산 $3과 비교(PRD §9.3) */
    monthlyProjectionUsd: number | null;
  };
  /**
   * 캐시 적중(M1-42, D28) — 요청 2개 이상인 날을 둘로 나눈다. 실행마다 계획 요청은 1건이고 지시문 캐싱은 같은 실행에서 2요청 이상
   * 계획할 때만 켜므로(brief.ts), FR-29 재시도·같은 날 재실행으로 생긴 2요청은 **미적중이 정상**이다(retryOnlyDays). 같은 실행이 2요청
   * 이상을 계획한 날(plannedDays)만 적중을 본다(hitDays ⊂ plannedDays).
   */
  cache: {
    multiRequestDays: string[];
    retryOnlyDays: string[];
    plannedDays: string[];
    hitDays: string[];
  };
  briefModes: Record<string, number>;
  briefTruncations: number;
  briefRetries: number;
  sourceFailures: Array<{ id: string; days: number; errors: string[] }>;
  matchStatus: {
    days: number;
    finished: number;
    inProgress: number;
    otherUnfinished: number;
    overdue: number | null;
  };
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** 기간 관찰 → 주간 요약(M1-42 입력). 날짜는 [from, to] 안의 관찰만 쓴다 */
export function summarizeWeek(
  observations: readonly DayObservation[],
  from: string,
  to: string,
  periodDates: readonly string[],
): WeekSummary {
  // 관찰 전 시험(trial) 날은 기간을 넓혀도 넣지 않는다(정시·비용 판정 왜곡 방지)
  const days = observations
    .filter((o) => !o.trial && o.date >= from && o.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const byDate = new Map(days.map((d) => [d.date, d] as const));
  const publish: Record<PublishVerdict, number> = {
    "on-time": 0,
    allowed: 0,
    late: 0,
    none: 0,
    unknown: 0,
  };
  let streak = 0;
  let longestStreak = 0;
  for (const date of periodDates) {
    const v = byDate.get(date)?.publish.verdict;
    if (v === "on-time" || v === "allowed") {
      streak += 1;
      longestStreak = Math.max(longestStreak, streak);
    } else streak = 0;
  }
  const delays: number[] = [];
  let seasonViolations = 0;
  let seasonUnverified = 0;
  let offSeasonSkips = 0;
  const perDay: WeekSummary["cost"]["perDay"] = [];
  const multiRequestDays: string[] = [];
  const retryOnlyDays: string[] = [];
  const plannedDays: string[] = [];
  const hitDays: string[] = [];
  const briefModes: Record<string, number> = {};
  let briefTruncations = 0;
  let briefRetries = 0;
  const failures = new Map<
    string,
    { days: Set<string>; errors: Set<string> }
  >();
  const ms = {
    days: 0,
    finished: 0,
    inProgress: 0,
    otherUnfinished: 0,
    overdue: null as number | null,
  };
  for (const d of days) {
    publish[d.publish.verdict] += 1;
    if (d.publish.delayMinutes !== null) delays.push(d.publish.delayMinutes);
    for (const r of d.actions.runs) {
      if (r.seasonCheck === "violation") seasonViolations += 1;
      if (r.seasonCheck === "unverified") seasonUnverified += 1;
      if (r.guardReason === "off-season") offSeasonSkips += 1;
    }
    const t = d.data.totals;
    perDay.push({
      date: d.date,
      usd: t.costUsd,
      requests: t.requests,
      cacheRead: t.cacheRead,
      cacheWrite: t.cacheWrite,
      out: t.out,
    });
    if (t.requests >= 2) {
      multiRequestDays.push(d.date);
      // 재시도(로그의 시도 2 이상)를 빼고, 브리핑 요청을 보낸 실행 수보다 많으면 한 실행이 2요청 이상을 계획한 것
      const retries =
        d.log?.briefAttempts.filter((a) => a.attempt > 1).length ?? 0;
      const requestingRuns = d.data.runs.filter((r) => r.requests > 0).length;
      if (t.requests - retries > Math.max(1, requestingRuns)) {
        plannedDays.push(d.date);
        if (t.cacheRead > 0) hitDays.push(d.date);
      } else {
        retryOnlyDays.push(d.date);
      }
    }
    const mode = d.data.brief?.mode ?? "없음";
    briefModes[mode] = (briefModes[mode] ?? 0) + 1;
    briefTruncations +=
      d.log?.briefAttempts.filter((a) => a.errorType === "max_tokens").length ??
      0;
    briefRetries +=
      d.log?.briefAttempts.filter((a) => a.attempt > 1).length ?? 0;
    for (const run of d.data.runs) {
      for (const f of run.failedSources) {
        const entry = failures.get(f.id) ?? {
          days: new Set<string>(),
          errors: new Set<string>(),
        };
        entry.days.add(d.date);
        if (f.error) entry.errors.add(f.error);
        failures.set(f.id, entry);
      }
    }
    if (d.matchStatus) {
      ms.days += 1;
      ms.finished += d.matchStatus.finished;
      ms.inProgress += d.matchStatus.inProgress;
      ms.otherUnfinished += d.matchStatus.otherUnfinished;
      if (d.matchStatus.overdue !== null) {
        ms.overdue = (ms.overdue ?? 0) + d.matchStatus.overdue;
      }
    }
  }
  const totalUsd = round(
    perDay.reduce((s, p) => s + p.usd, 0),
    6,
  );
  const avgUsd =
    perDay.length === 0 ? null : round(totalUsd / perDay.length, 6);
  return {
    from,
    to,
    periodDays: periodDates.length,
    observed: days.map((d) => d.date),
    missing: periodDates.filter((date) => !byDate.has(date)),
    publish,
    longestStreak,
    avgDelayMinutes:
      delays.length === 0
        ? null
        : round(delays.reduce((s, n) => s + n, 0) / delays.length, 1),
    maxDelayMinutes: delays.length === 0 ? null : Math.max(...delays),
    seasonViolations,
    seasonUnverified,
    offSeasonSkips,
    cost: {
      perDay,
      totalUsd,
      avgUsd,
      monthlyProjectionUsd: avgUsd === null ? null : round(avgUsd * 30, 4),
    },
    cache: { multiRequestDays, retryOnlyDays, plannedDays, hitDays },
    briefModes,
    briefTruncations,
    briefRetries,
    sourceFailures: [...failures]
      .map(([id, e]) => ({
        id,
        days: e.days.size,
        errors: [...e.errors].sort(),
      }))
      .sort((a, b) => b.days - a.days || (a.id < b.id ? -1 : 1)),
    matchStatus: ms,
  };
}
