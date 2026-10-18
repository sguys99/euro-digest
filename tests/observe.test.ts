/**
 * M1-41·M1-42 일일 발행 관찰 `scripts/lib/observe.ts`·`observe-render.ts` 단위 테스트 (PRD §15 D26·D48·D28, NFR-05·FR-150, M0-28).
 * 네트워크 없음 — fixtures/actions(2026-10-18 실제 gh 응답·collect 로그 줄)와 합성 값.
 *
 * - 워크플로 이름(가드 job·배포 job·Pages 배포 단계)이 collect.yml·deploy.yml과 같다
 * - 트리거(run-name → cron·slot·force·계절), 가드 판단(실행·건너뜀 사유 주석), 계절 위반, 공개 시각(Pages 배포 단계)
 * - 공개 판정 경계(목표 이전 정시 · +15분 허용 · 넘으면 지각) — 서머타임 전환 전후 목표(10-25 07:00 · 10-26 07:30)
 * - collect 로그 → 관찰 사실(경기 상태·브리핑 시도·예산·게시·LLM), 경기 상태 분포(건수만 / 경기별 목록 — 점수 지연 의심)
 * - data 사실(그날 KST prod collect만), 자동 메모, 주간 요약(정시 연속·캐시 적중·비용·mode·소스 실패)
 * - 문서 반영: 같은 날 교체(멱등)·메모 칸 보존·데이터 줄 왕복
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { RunLog } from "@/lib/schema";
import { publishSlot } from "@/lib/time";

import { COLLECT_JOB_NAME } from "../scripts/lib/collect-guard";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "../scripts/lib/llm";
import {
  DEPLOY_JOB_NAME,
  DEPLOY_STEP_NAME,
  GUARD_JOB_NAME,
  GhAnnotationsSchema,
  GhJobsResponseSchema,
  GhRunsResponseSchema,
  buildDayObservation,
  createdFilter,
  dataFacts,
  extractLogFacts,
  guardReasonFromAnnotations,
  judgePublish,
  logTarget,
  matchStatusFromLog,
  needsGuardAnnotations,
  observeDayRange,
  observeRun,
  parseRunTrigger,
  summarizeWeek,
  type DayObservation,
  type GhRun,
  type LogFacts,
  type RunObs,
} from "../scripts/lib/observe";
import {
  applyDayObservations,
  applyWeekSummary,
  readObservations,
  renderWeekSummary,
  triggerSummary,
} from "../scripts/lib/observe-render";
import {
  OBS_BLOCKS,
  datesInRange,
  isSeasonFirstDay,
  observationDocTemplate,
} from "../scripts/lib/observation-doc";
import { readBlock } from "../scripts/lib/research-doc";

import { readWorkflow } from "./support/workflow-text";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const fixture = (name: string) =>
  readFileSync(path.join(ROOT, "fixtures/actions", name), "utf8");

const RUNS = GhRunsResponseSchema.parse(
  JSON.parse(fixture("runs-2026-10-18.json")),
).workflow_runs;
const JOBS_SKIP = GhJobsResponseSchema.parse(
  JSON.parse(fixture("jobs-39078890352.json")),
).jobs;
const JOBS_RUN = GhJobsResponseSchema.parse(
  JSON.parse(fixture("jobs-39100995214.json")),
).jobs;
const ANNOTATIONS = GhAnnotationsSchema.parse(
  JSON.parse(fixture("annotations-guard-skip.json")),
);
const LOG = fixture("collect-log-2026-10-18.txt");

const runById = (id: number): GhRun => {
  const r = RUNS.find((x) => x.id === id);
  if (!r) throw new Error(`fixture에 없는 실행 ${id}`);
  return r;
};

describe("워크플로 이름 — collect.yml·deploy.yml과 같다", () => {
  it("가드 job·collect job·배포 job(호출 / 호출된 job)·Pages 배포 단계", () => {
    const collect = readWorkflow("collect.yml");
    const deploy = readWorkflow("deploy.yml");
    expect(collect).toContain(`name: ${GUARD_JOB_NAME}\n`);
    expect(collect).toContain(`name: ${COLLECT_JOB_NAME}\n`);
    const [caller, called] = DEPLOY_JOB_NAME.split(" / ");
    expect(collect).toContain(`name: ${caller}\n`);
    expect(deploy).toContain(`name: ${called}\n`);
    expect(deploy).toContain(`- name: ${DEPLOY_STEP_NAME}\n`);
    expect(collect).toMatch(/^run-name: "Collect \(/m);
  });
});

describe("parseRunTrigger — run-name", () => {
  it("schedule cron → 계절(collect-guard SCHEDULE_SEASONS)", () => {
    expect(
      parseRunTrigger("schedule", "Collect (schedule 40 21 * * *)"),
    ).toMatchObject({
      cron: "40 21 * * *",
      season: "summer",
      slot: null,
    });
    expect(
      parseRunTrigger("schedule", "Collect (schedule 20 22 * * *)").season,
    ).toBe("winter");
    expect(
      parseRunTrigger("schedule", "Collect (schedule 0 0 * * *)").season,
    ).toBeNull();
  });

  it("dispatch slot·force·limit — slot 없으면 수동(계절 없음)", () => {
    expect(
      parseRunTrigger(
        "workflow_dispatch",
        "Collect (workflow_dispatch, slot winter, force, limit 5)",
      ),
    ).toEqual({
      event: "workflow_dispatch",
      cron: null,
      slot: "winter",
      force: true,
      limit: "5",
      season: "winter",
    });
    expect(
      parseRunTrigger("workflow_dispatch", "Collect (workflow_dispatch)"),
    ).toMatchObject({ slot: null, force: false, season: null });
    expect(parseRunTrigger("workflow_dispatch", undefined).season).toBeNull();
  });
});

describe("가드 판단·실행 관찰 — 2026-10-18 실제 응답", () => {
  it("주석 제목에서 건너뜀 사유를 읽는다(러너 안내 주석은 무시)", () => {
    expect(guardReasonFromAnnotations(ANNOTATIONS)).toBe("schedule-disabled");
    expect(
      guardReasonFromAnnotations([
        { title: "수집 가드 설정 오류 (invalid-trigger)", message: "…" },
      ]),
    ).toBe("invalid-trigger");
    expect(guardReasonFromAnnotations([])).toBeNull();
  });

  it("건너뛴 schedule: 가드 skip(schedule-disabled), 아침 창 안(08:24 KST), 배포 없음", () => {
    expect(needsGuardAnnotations(JOBS_SKIP)).toBe(117531618517);
    const obs = observeRun(
      { run: runById(39078890352), jobs: JOBS_SKIP, annotations: ANNOTATIONS },
      "2026-10-18",
    );
    expect(obs).toMatchObject({
      event: "schedule",
      cron: "40 21 * * *",
      triggerSeason: "summer",
      guard: "skip",
      guardReason: "schedule-disabled",
      seasonCheck: "ok",
      inMorningWindow: true,
      deployedAt: null,
    });
  });

  it("수동 dispatch: 가드 run(no-recent-success), 공개 = Pages 배포 단계 완료, 아침 창 밖", () => {
    expect(needsGuardAnnotations(JOBS_RUN)).toBeNull();
    const obs = observeRun(
      { run: runById(39100995214), jobs: JOBS_RUN, annotations: null },
      "2026-10-18",
    );
    expect(obs).toMatchObject({
      guard: "run",
      guardReason: "no-recent-success",
      slot: null,
      triggerSeason: null,
      seasonCheck: "n/a",
      inMorningWindow: false,
      deployedAt: "2026-10-18T05:39:36.000Z",
      collect: { conclusion: "success" },
    });
    const target = logTarget([obs], new Map([[obs.id, JOBS_RUN]]));
    expect(target).toEqual({ runId: 39100995214, jobId: 117597140997 });
  });

  it("계절에 맞지 않는 트리거가 수집하면 계절 위반 — 건너뛰면 ok", () => {
    const run: GhRun = {
      ...runById(39100995214),
      display_title: "Collect (workflow_dispatch, slot winter)",
    };
    expect(
      observeRun({ run, jobs: JOBS_RUN, annotations: null }, "2026-10-18")
        .seasonCheck,
    ).toBe("violation");
    // 겨울 첫 발행일(10-26)에는 winter 슬롯이 맞는 계절
    expect(
      observeRun({ run, jobs: JOBS_RUN, annotations: null }, "2026-10-26")
        .seasonCheck,
    ).toBe("ok");
    const skipped = observeRun(
      {
        run: { ...runById(39081420176) },
        jobs: JOBS_SKIP,
        annotations: [{ title: "수집 건너뜀 (off-season)" }],
      },
      "2026-10-18",
    );
    expect(skipped).toMatchObject({
      triggerSeason: "winter",
      guard: "skip",
      guardReason: "off-season",
      seasonCheck: "ok",
    });
  });

  it("계절에 맞지 않는 트리거인데 가드 판단을 확인하지 못하면 ok가 아니라 unverified(가드 실패·jobs 없음)", () => {
    const winterSchedule = runById(39081420176); // schedule 20 22 * * * (겨울)
    const guardFailed = JOBS_SKIP.map((j) =>
      j.name === GUARD_JOB_NAME ? { ...j, conclusion: "failure" } : j,
    );
    const failed = observeRun(
      { run: winterSchedule, jobs: guardFailed, annotations: [] },
      "2026-10-18",
    );
    expect(failed).toMatchObject({ guard: "fail", seasonCheck: "unverified" });
    expect(
      observeRun(
        { run: winterSchedule, jobs: null, annotations: null },
        "2026-10-18",
      ).seasonCheck,
    ).toBe("unverified");
    expect(triggerSummary([failed])).toContain("계절 확인 불가 1");
  });

  it("날을 넘긴 재실행(run_attempt ≥ 2)은 시도·시작 시각을 남기고 메모한다", () => {
    const rerun: GhRun = {
      ...runById(39100995214),
      run_attempt: 2,
      run_started_at: "2026-10-19T03:00:00Z",
    };
    const obs = observeRun(
      { run: rerun, jobs: JOBS_RUN, annotations: null },
      "2026-10-18",
    );
    expect(obs).toMatchObject({
      runAttempt: 2,
      runStartedAt: "2026-10-19T03:00:00.000Z",
    });
    const dayObs = buildDayObservation({
      date: "2026-10-18",
      observedAt: "2026-10-19T04:00:00.000Z",
      actions: { runs: [obs] },
      logRunId: null,
      log: null,
      logError: null,
      data: dataFacts({
        date: "2026-10-18",
        runs: [],
        brief: null,
        news: null,
      }),
    });
    expect(dayObs.notes.join(" ")).toContain(
      "재실행(시도 2)이 2026-10-19에 시작",
    );
    // 첫 시도(fixture — run_attempt 1)는 메모 없음
    const first = observeRun(
      { run: runById(39100995214), jobs: JOBS_RUN, annotations: null },
      "2026-10-18",
    );
    expect(first.runAttempt).toBe(1);
  });

  it("jobs를 받지 못하면 가드는 확인 불가", () => {
    expect(
      observeRun(
        { run: runById(39078890352), jobs: null, annotations: null },
        "2026-10-18",
      ).guard,
    ).toBe("unknown");
  });

  it("gh created 필터 = KST 하루", () => {
    expect(createdFilter(observeDayRange("2026-10-18"))).toBe(
      "2026-10-17T15:00:00Z..2026-10-18T15:00:00Z",
    );
  });
});

describe("judgePublish — D48 ②(일찍 공개 허용, +15분까지 허용)", () => {
  it("서머타임 전환 전후 목표: 10-25 07:00 KST · 10-26 07:30 KST", () => {
    expect(publishSlot("2026-10-25").publishTarget).toBe(
      "2026-10-24T22:00:00.000Z",
    );
    expect(publishSlot("2026-10-26").publishTarget).toBe(
      "2026-10-25T22:30:00.000Z",
    );
    expect(isSeasonFirstDay("2026-10-26")).toBe(true);
    expect(isSeasonFirstDay("2026-10-25")).toBe(false);
    expect(isSeasonFirstDay("2027-03-29")).toBe(true);
  });

  it("경계: 이른 공개·정각 = 정시, +15:00 = 허용, +15:01 = 지각, 없음 = 미발행", () => {
    const target = "2026-10-25T22:30:00.000Z";
    expect(judgePublish("2026-10-25T22:05:30.000Z", target)).toEqual({
      delayMinutes: -24.5,
      verdict: "on-time",
    });
    expect(judgePublish(target, target).verdict).toBe("on-time");
    expect(judgePublish("2026-10-25T22:45:00.000Z", target)).toEqual({
      delayMinutes: 15,
      verdict: "allowed",
    });
    expect(judgePublish("2026-10-25T22:45:01.000Z", target).verdict).toBe(
      "late",
    );
    expect(judgePublish(null, target)).toEqual({
      delayMinutes: null,
      verdict: "none",
    });
  });
});

describe("extractLogFacts — collect job 로그(2026-10-18)", () => {
  const facts = extractLogFacts(LOG)!;

  it("정해진 이벤트의 숫자 필드만 — 형식이 다른 줄(머리 줄·BOM)은 건너뛴다", () => {
    expect(facts.runId).toBe("collect-prod-20261018T053453Z-77c1");
    expect(facts.deadlineBasis).toBe("off-slot");
    expect(facts.footballData).toMatchObject({
      at: "2026-10-18T05:35:29.841Z",
      fetched: 21,
      finished: 21,
      notFinished: 0,
      inProgress: {},
      window: null,
    });
    expect(facts.apiFootball).toMatchObject({
      targets: 40,
      details: 21,
      pending: 19,
      goalsIncomplete: 0,
      brief: "complete",
      apiCalls: 23,
    });
    expect(
      facts.briefAttempts.map((a) => [
        a.attempt,
        a.ok,
        a.errorType,
        a.tokensOut,
      ]),
    ).toEqual([
      [1, false, "max_tokens", 8192],
      [2, true, null, 4963],
    ]);
    expect(facts.briefBudget).toEqual({
      verdict: "ok",
      estimatedUsd: 0.010016,
    });
    expect(facts.briefPublish).toEqual({
      mode: "llm",
      reason: "verified",
      action: "written",
    });
    expect(facts.briefDone).toMatchObject({
      verdict: "ok",
      publishedAi: 5,
      publishedTemplate: 0,
    });
    expect(facts.llm).toEqual({
      calls: 2,
      minTimeoutMs: 60000,
      deadlineCut: 0,
    });
    expect(facts.done).toEqual({ status: "success", exitCode: 0 });
  });

  it("관찰 이벤트가 없으면 null", () => {
    expect(extractLogFacts('plain\n{"ts":"x"}\n')).toBeNull();
  });

  it("windowStatus가 있는 새 로그 줄은 경기별 목록으로 — 형식이 다르면 건수만 살린다", () => {
    const fdLine = LOG.split("\n").find((l) =>
      l.includes('"provider":"football-data"'),
    )!;
    const withWindow = fdLine.replace(
      '"inProgress":{}',
      '"inProgress":{"EPL":1},"windowStatus":{"statuses":{"FINISHED":20,"IN_PLAY":1},"unfinished":[{"comp":"EPL","kickoff":"2026-10-18T03:00:00Z","status":"IN_PLAY"}],"unfinishedTotal":4}',
    );
    const fd = extractLogFacts(withWindow)!.footballData!;
    expect(fd.window?.unfinished).toHaveLength(1);
    expect(matchStatusFromLog(fd)).toMatchObject({
      source: "window",
      finished: 20,
      inProgress: 1,
      overdue: 1, // 05:35Z 받음 — 킥오프 03:00Z 뒤 155분
      unfinishedTotal: 4, // 목록은 로그 상한에서 잘렸다
    });
    const broken = fdLine.replace(
      '"inProgress":{}',
      '"inProgress":{},"windowStatus":{"statuses":"?"}',
    );
    expect(extractLogFacts(broken)!.footballData).toMatchObject({
      finished: 21,
      window: null,
    });
  });
});

describe("matchStatusFromLog — 수집 시점 경기 상태(M0-28)", () => {
  it("건수만(지금 로그): 종료·진행 중 합·그 밖 미종료, 지연 판정 불가", () => {
    const m = matchStatusFromLog({
      at: "2026-10-24T21:35:00.000Z",
      fetched: 12,
      finished: 9,
      notFinished: 3,
      inProgress: { EPL: 1, LALIGA: 1 },
      window: null,
    })!;
    expect(m).toMatchObject({
      source: "counts",
      finished: 9,
      inProgress: 2,
      otherUnfinished: 1,
      overdue: null,
      calledOff: null,
    });
  });

  it("경기별 목록이 있으면 킥오프 뒤 130분 이상 미종료 = 점수 지연 의심(연기는 제외)", () => {
    const m = matchStatusFromLog({
      at: "2026-10-25T22:15:00.000Z", // 겨울 첫 발행 수집(07:15 KST 무렵)
      fetched: 6,
      finished: 3,
      notFinished: 3,
      inProgress: { UCL: 1 },
      window: {
        statuses: { FINISHED: 3, IN_PLAY: 1, TIMED: 1, POSTPONED: 1 },
        unfinished: [
          {
            comp: "UCL",
            kickoff: "2026-10-25T20:00:00.000Z",
            status: "IN_PLAY",
          },
          { comp: "EPL", kickoff: "2026-10-25T19:45:00.000Z", status: "TIMED" },
          {
            comp: "LIGUE1",
            kickoff: "2026-10-25T19:00:00.000Z",
            status: "POSTPONED",
          },
        ],
      },
    })!;
    expect(m).toMatchObject({
      source: "window",
      finished: 3,
      inProgress: 1,
      otherUnfinished: 2,
      calledOff: 1,
      overdue: 2,
    });
    expect(m.unfinished.map((u) => u.minutesSinceKickoff)).toEqual([
      135, 150, 195,
    ]);
    expect(m.unfinishedTotal).toBe(3); // 옛 형식(unfinishedTotal 없음)은 목록 길이
  });

  it("football-data 로그가 없으면 null", () => {
    expect(matchStatusFromLog(null)).toBeNull();
  });
});

function runLog(over: Partial<RunLog>): RunLog {
  return {
    runId: "collect-prod-x",
    env: "prod",
    job: "collect",
    startedAt: "2026-10-19T21:30:30.000Z",
    finishedAt: "2026-10-19T21:34:00.000Z",
    collected: 450,
    clusters: 45,
    summarized: 5,
    downgraded: 0,
    tokens: { in: 8000, out: 5000, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0.004,
    apiCalls: { footballData: 6, apiFootball: 20 },
    sources: [{ id: "bbc-sport-football", ok: true, items: 30 }],
    status: "success",
    ...over,
  };
}

describe("dataFacts — 그날 KST prod collect만", () => {
  it("KST 날짜로 고르고(06:30 KST = 전날 21:30Z) 합계·요청·소스 실패를 모은다", () => {
    const facts = dataFacts({
      date: "2026-10-20",
      runs: [
        runLog({
          runId: "a",
          brief: { requests: 2 },
          tokens: { in: 8000, out: 9000, cacheRead: 1500, cacheWrite: 0 },
        }),
        runLog({
          runId: "b",
          startedAt: "2026-10-20T03:00:00.000Z",
          costUsd: 0,
          sources: [{ id: "espn-soccer", ok: false, items: 0, error: "parse" }],
          status: "partial",
        }),
        runLog({ runId: "어제", startedAt: "2026-10-19T14:59:00.000Z" }),
        runLog({ runId: "weekly", job: "weekly" }),
      ],
      brief: {
        date: "2026-10-20",
        generatedAt: "2026-10-19T21:34:00.000Z",
        runId: "a",
        mode: "mixed",
        lines: [
          { text: "한 줄.", ai: true, refs: ["m1"] },
          { text: "템플릿 줄.", ai: false, refs: ["m2"] },
        ],
      },
      news: null,
    });
    expect(facts.runs.map((r) => r.runId)).toEqual(["a", "b"]);
    expect(facts.totals).toEqual({
      costUsd: 0.004,
      requests: 2,
      in: 16000,
      out: 14000,
      cacheRead: 1500,
      cacheWrite: 0,
    });
    expect(facts.runs[1]!.failedSources).toEqual([
      { id: "espn-soccer", error: "parse" },
    ]);
    expect(facts.brief).toEqual({
      mode: "mixed",
      lines: 2,
      aiLines: 1,
      runId: "a",
    });
    expect(facts.news).toBeNull();
  });

  it("읽기 오류는 오류 문자열로 남긴다", () => {
    const facts = dataFacts({
      date: "2026-10-20",
      runs: { error: "runs.json: JSON 파싱 실패" },
      brief: { error: "스키마 오류" },
      news: { error: "파싱 실패" },
    });
    expect(facts).toMatchObject({
      runs: [],
      runsError: "runs.json: JSON 파싱 실패",
      briefError: "스키마 오류",
      newsError: "파싱 실패",
    });
  });
});

const LOG_FACTS = extractLogFacts(LOG)!;

function runObs(over: Partial<RunObs>): RunObs {
  return {
    id: 1,
    url: "https://github.com/sguys99/euro-digest/actions/runs/1",
    event: "workflow_dispatch",
    createdAt: "2026-10-19T21:30:05.000Z",
    inMorningWindow: true,
    cron: null,
    slot: "summer",
    force: false,
    triggerSeason: "summer",
    guard: "run",
    guardReason: "no-recent-success",
    seasonCheck: "ok",
    collect: {
      conclusion: "success",
      startedAt: "2026-10-19T21:30:40.000Z",
      completedAt: "2026-10-19T21:35:00.000Z",
    },
    deployedAt: "2026-10-19T21:36:30.000Z",
    deployConclusion: "success",
    conclusion: "success",
    ...over,
  };
}

function day(
  date: string,
  runs: RunObs[],
  data: Partial<Parameters<typeof dataFacts>[0]> = {},
  log: LogFacts | null = LOG_FACTS,
): DayObservation {
  return buildDayObservation({
    date,
    observedAt: `${date}T01:00:00.000Z`,
    actions: { runs },
    logRunId: runs[0]?.id ?? null,
    log,
    logError: null,
    data: dataFacts({ date, runs: [], brief: null, news: null, ...data }),
  });
}

describe("buildDayObservation — 공개·자동 메모", () => {
  it("정기 실행 정시 공개(여름 06:36 KST) — 메모 없음(로그의 잘림 지표만)", () => {
    const o = day("2026-10-20", [runObs({})]);
    expect(o.publish).toMatchObject({
      runId: 1,
      publishedAt: "2026-10-19T21:36:30.000Z",
      delayMinutes: -23.5,
      verdict: "on-time",
      manual: false,
      outsideWindow: false,
    });
    expect(o.trial).toBe(false);
    expect(o.notes.some((n) => n.includes("max_tokens"))).toBe(true);
    expect(o.notes.some((n) => n.includes("수동"))).toBe(false);
    expect(o.matchStatus?.source).toBe("counts");
  });

  it("겨울 첫 발행(10-26) — 목표 07:30, 확인 메모, 계절 위반 메모", () => {
    const o = day(
      "2026-10-26",
      [
        runObs({
          createdAt: "2026-10-25T21:30:05.000Z",
          slot: "summer",
          seasonCheck: "violation",
          deployedAt: "2026-10-25T22:40:00.000Z",
        }),
      ],
      {},
      null,
    );
    expect(o.season).toBe("winter");
    expect(o.publish).toMatchObject({ verdict: "allowed", delayMinutes: 10 });
    expect(o.notes.join(" ")).toContain("겨울 첫 발행");
    expect(o.notes.join(" ")).toContain("계절 위반 1건");
  });

  it("마감으로 줄인 요청 타임아웃·마감 절단은 메모(기본값은 llm.ts 상수)", () => {
    const o = day(
      "2026-10-21",
      [runObs({})],
      {},
      {
        ...LOG_FACTS,
        llm: { calls: 1, minTimeoutMs: 30_000, deadlineCut: 1 },
      },
    );
    expect(o.notes.join(" ")).toContain("LLM 요청 타임아웃 30000ms");
    expect(o.notes.join(" ")).toContain("마감 절단 1회");
    const full = day(
      "2026-10-21",
      [runObs({})],
      {},
      {
        ...LOG_FACTS,
        llm: {
          calls: 1,
          minTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
          deadlineCut: 0,
        },
      },
    );
    expect(full.notes.join(" ")).not.toContain("LLM 요청");
  });

  it("관찰 전·수동 dispatch·아침 창 밖은 참고 메모, Actions 실패는 확인 불가", () => {
    const o = day("2026-10-18", [
      runObs({ slot: null, triggerSeason: null, inMorningWindow: false }),
    ]);
    expect(o.trial).toBe(true);
    expect(o.notes.join(" ")).toContain("수동 dispatch");
    const unknown = buildDayObservation({
      date: "2026-10-21",
      observedAt: "2026-10-21T01:00:00.000Z",
      actions: { error: "gh 실행 목록 조회 실패" },
      logRunId: null,
      log: null,
      logError: null,
      data: dataFacts({
        date: "2026-10-21",
        runs: [],
        brief: null,
        news: null,
      }),
    });
    expect(unknown.publish.verdict).toBe("unknown");
    expect(unknown.actions).toEqual({
      ok: false,
      error: "gh 실행 목록 조회 실패",
      runs: [],
    });
  });
});

describe("summarizeWeek — M1-42 입력", () => {
  it("정시 연속·평균 지연·비용·캐시 적중(요청 2개 이상인 날)·mode·소스 실패", () => {
    const week = datesInRange("2026-10-20", "2026-10-26");
    // 10-20: 한 실행이 2요청을 계획(재시도 없음 — 로그 시도 1뿐) → 캐시 적중을 본다
    const plannedLog: LogFacts = {
      ...LOG_FACTS,
      briefAttempts: LOG_FACTS.briefAttempts.filter((a) => a.attempt === 1),
    };
    const obs = [
      day(
        "2026-10-20",
        [runObs({})],
        {
          runs: [
            runLog({
              startedAt: "2026-10-19T21:30:30.000Z",
              brief: { requests: 2 },
              tokens: { in: 1, out: 1, cacheRead: 900, cacheWrite: 0 },
              costUsd: 0.005,
            }),
          ],
        },
        plannedLog,
      ),
      day("2026-10-21", [runObs({ deployedAt: "2026-10-20T22:20:00.000Z" })], {
        runs: [
          runLog({
            startedAt: "2026-10-20T21:30:30.000Z",
            brief: { requests: 2 },
            costUsd: 0.007,
            sources: [
              { id: "espn-soccer", ok: false, items: 0, error: "parse" },
            ],
          }),
        ],
      }),
      day("2026-10-22", [runObs({ deployedAt: "2026-10-21T21:59:00.000Z" })], {
        runs: [
          runLog({
            startedAt: "2026-10-21T21:30:30.000Z",
            brief: { requests: 1 },
            costUsd: 0.003,
          }),
        ],
      }),
      day("2026-10-18", [runObs({})]), // 기간 밖·관찰 전 시험
    ];
    const s = summarizeWeek(obs, "2026-10-20", "2026-10-26", week);
    expect(s.observed).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
    expect(s.missing).toEqual([
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
    ]);
    // 10-21: 07:20 KST(+20분) 지각 · 10-22: 2026-10-21T21:59Z(06:59 KST)는 그날 목표 07:00 이전
    expect(s.publish).toMatchObject({ "on-time": 2, late: 1, allowed: 0 });
    expect(s.longestStreak).toBe(1);
    expect(s.avgDelayMinutes).toBe(-1.5); // (-23.5 + 20 - 1) / 3
    expect(s.cost.totalUsd).toBe(0.015);
    expect(s.cost.avgUsd).toBe(0.005);
    expect(s.cost.monthlyProjectionUsd).toBe(0.15);
    // 10-21: 2요청 = 계획 1 + FR-29 재시도 1(로그 시도 2) → 캐싱 꺼짐이라 미적중이 정상(D28)
    expect(s.cache).toEqual({
      multiRequestDays: ["2026-10-20", "2026-10-21"],
      retryOnlyDays: ["2026-10-21"],
      plannedDays: ["2026-10-20"],
      hitDays: ["2026-10-20"],
    });
    expect(renderWeekSummary(s)).toContain("미적중이 정상(D28)");
    expect(s.sourceFailures).toEqual([
      { id: "espn-soccer", days: 1, errors: ["parse"] },
    ]);
    expect(s.briefTruncations).toBe(3);
    expect(s.briefRetries).toBe(2);
    expect(s.matchStatus.days).toBe(3);
  });

  it("관찰 전 시험 날은 기간을 넓혀도 넣지 않는다 · 계절 확인 불가는 따로 센다", () => {
    const obs = [
      day("2026-10-18", [runObs({})]),
      day("2026-10-20", [
        runObs({}),
        runObs({
          id: 2,
          slot: "winter",
          triggerSeason: "winter",
          guard: "fail",
          guardReason: null,
          seasonCheck: "unverified",
          deployedAt: null,
        }),
      ]),
    ];
    const s = summarizeWeek(
      obs,
      "2026-10-17",
      "2026-10-20",
      datesInRange("2026-10-17", "2026-10-20"),
    );
    expect(s.observed).toEqual(["2026-10-20"]);
    expect(s.missing).toEqual(["2026-10-17", "2026-10-18", "2026-10-19"]);
    expect(s.seasonUnverified).toBe(1);
    expect(s.seasonViolations).toBe(0);
    expect(renderWeekSummary(s)).toContain("확인 불가 1");
  });
});

describe("문서 반영 — 멱등·메모 보존", () => {
  it("같은 날 다시 반영하면 표·상세는 한 번, 메모 칸은 남고 데이터 줄로 왕복된다", () => {
    const o1 = day("2026-10-20", [runObs({})]);
    let doc = applyDayObservations(observationDocTemplate(), [o1]);
    const rowOf = (d: string) =>
      readBlock(d, OBS_BLOCKS.daily)!
        .split("\n")
        .filter((l) => l.startsWith("| 2026-10-20"));
    expect(rowOf(doc)).toHaveLength(1);
    expect(rowOf(doc)[0]).toContain("| 정시 |");
    doc = doc.replace(/(\| 2026-10-20 \|.*\| )— \|$/m, "$1러너 지연 메모 |");
    const o2 = day("2026-10-20", [
      runObs({ deployedAt: "2026-10-19T22:10:00.000Z" }),
    ]);
    doc = applyDayObservations(doc, [o2]);
    expect(rowOf(doc)).toHaveLength(1);
    expect(rowOf(doc)[0]).toContain("| 허용 |");
    expect(rowOf(doc)[0]).toContain("러너 지연 메모");
    expect(
      readBlock(doc, OBS_BLOCKS.details)!.match(/^### 2026-10-20/gm),
    ).toHaveLength(1);
    expect(readObservations(doc)).toEqual({ observations: [o2], errors: [] });

    const withWeek = applyWeekSummary(
      doc,
      summarizeWeek(
        [o2],
        "2026-10-20",
        "2026-10-26",
        datesInRange("2026-10-20", "2026-10-26"),
      ),
    );
    expect(readBlock(withWeek, OBS_BLOCKS.week)).toContain("1/7일");
    // 사람이 쓴 판정 기준 절은 그대로
    expect(withWeek).toContain("## 판정 기준");
  });
});
