import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { publishSlot, utcDate, zonedToUtcIso } from "@/lib/time";

import type { ParseResult } from "../scripts/lib/cli-args";
import {
  COLLECT_JOB_NAME,
  decideFromHistory,
  findCollectSuccess,
  formatGuardOutputs,
  formatGuardSummary,
  isFailureDecision,
  MAIN_REF,
  normalizeCron,
  parseFlag,
  parseWorkflowJobs,
  parseWorkflowRuns,
  precheck,
  readGuardEnv,
  readTriggerSlot,
  runJobsUrl,
  SCHEDULE_SEASONS,
  selectCandidateRuns,
  workflowRunsUrl,
  type GuardTrigger,
  type RecentSuccess,
  type TriggerSlot,
  type WorkflowJob,
  type WorkflowRun,
} from "../scripts/lib/collect-guard";

function unwrap<T>(result: ParseResult<T>): T {
  if (!result.ok) throw new Error(`예상치 못한 실패: ${result.error}`);
  return result.value;
}

function errorOf<T>(result: ParseResult<T>): string {
  if (result.ok) throw new Error("실패를 기대했지만 성공했다");
  return result.error;
}

// 기준 시각: 2026-10-11 06:45 KST (여름 — 유럽 서머타임 기간)
const NOW = new Date("2026-10-10T21:45:00Z");

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

/** 입력 없는 수동 dispatch가 기본(계절 슬롯 없음) */
function trigger(overrides: Partial<GuardTrigger> = {}): GuardTrigger {
  return {
    eventName: "workflow_dispatch",
    ref: MAIN_REF,
    collectEnabled: false,
    force: false,
    slot: null,
    slotError: null,
    ...overrides,
  };
}

/** 계절 트리거 4종 (FR-150, D26) */
const SUMMER_SCHEDULE: TriggerSlot = {
  season: "summer",
  source: "schedule",
  raw: "40 21 * * *",
};
const WINTER_SCHEDULE: TriggerSlot = {
  season: "winter",
  source: "schedule",
  raw: "20 22 * * *",
};
const SUMMER_DISPATCH: TriggerSlot = {
  season: "summer",
  source: "dispatch",
  raw: "summer",
};
const WINTER_DISPATCH: TriggerSlot = {
  season: "winter",
  source: "dispatch",
  raw: "winter",
};

/** KST 벽시계 → Date (테스트 기대값 계산용 — 변환은 time.ts) */
const kst = (local: string) => new Date(zonedToUtcIso(local, "Asia/Seoul"));

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 100,
    runNumber: 7,
    event: "workflow_dispatch",
    conclusion: "success",
    createdAt: hoursAgo(1),
    runStartedAt: hoursAgo(1),
    updatedAt: hoursAgo(0.5),
    htmlUrl: "https://github.com/sguys99/euro-digest/actions/runs/100",
    ...overrides,
  };
}

function job(overrides: Partial<WorkflowJob> = {}): WorkflowJob {
  return {
    name: COLLECT_JOB_NAME,
    conclusion: "success",
    completedAt: hoursAgo(0.6),
    ...overrides,
  };
}

describe("parseFlag", () => {
  it('"true"만 참으로 본다 (대소문자·공백 무시)', () => {
    expect(parseFlag("true")).toBe(true);
    expect(parseFlag(" TRUE ")).toBe(true);
    expect(parseFlag("false")).toBe(false);
    expect(parseFlag("1")).toBe(false);
    expect(parseFlag("yes")).toBe(false);
    expect(parseFlag("")).toBe(false);
    expect(parseFlag(undefined)).toBe(false);
  });
});

describe("readGuardEnv", () => {
  // schedule 실행은 github.event.schedule(SCHEDULE)이 늘 있다(M1-47 — 계절 판정)
  const base = {
    GITHUB_EVENT_NAME: "schedule",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: "sguys99/euro-digest",
    GITHUB_RUN_ID: "123456789",
    SCHEDULE: "40 21 * * *",
  };

  it("Actions 환경변수를 읽고 기본값을 채운다", () => {
    expect(
      unwrap(
        readGuardEnv({ ...base, COLLECT_ENABLED: "true", FORCE: "false" }),
      ),
    ).toEqual({
      trigger: {
        eventName: "schedule",
        ref: "refs/heads/main",
        collectEnabled: true,
        force: false,
        slot: SUMMER_SCHEDULE,
        slotError: null,
      },
      repository: "sguys99/euro-digest",
      currentRunId: 123456789,
      apiUrl: "https://api.github.com",
      workflowFile: "collect.yml",
    });
  });

  it("workflow_dispatch: SLOT이 비면 계절 슬롯 없음(수동 실행), summer·winter면 그 계절", () => {
    const dispatch = { ...base, GITHUB_EVENT_NAME: "workflow_dispatch" };
    delete (dispatch as Partial<typeof dispatch>).SCHEDULE;
    expect(unwrap(readGuardEnv(dispatch)).trigger.slot).toBeNull();
    expect(
      unwrap(readGuardEnv({ ...dispatch, SLOT: "" })).trigger.slot,
    ).toBeNull();
    expect(
      unwrap(readGuardEnv({ ...dispatch, SLOT: "winter" })).trigger.slot,
    ).toEqual(WINTER_DISPATCH);
    // 모르는 값은 조용히 수동 실행으로 바꾸지 않는다 — 읽기는 성공하고 오류를 trigger에 담는다(precheck 3a가 실패로 판정)
    const autumn = unwrap(
      readGuardEnv({ ...dispatch, SLOT: "autumn" }),
    ).trigger;
    expect(autumn.slot).toBeNull();
    expect(autumn.slotError).toContain("slot");
  });

  it("schedule: 모르는 cron·빈 SCHEDULE은 여기서 실패시키지 않고 slotError에 담는다(판정은 precheck — COLLECT_ENABLED 뒤)", () => {
    const unknown = unwrap(
      readGuardEnv({ ...base, SCHEDULE: "30 21 * * *" }),
    ).trigger;
    expect(unknown.slot).toBeNull();
    expect(unknown.slotError).toContain("SCHEDULE_SEASONS");
    expect(
      unwrap(readGuardEnv({ ...base, SCHEDULE: "" })).trigger.slotError,
    ).toContain("schedule cron");
  });

  it("GITHUB_API_URL 끝의 /를 떼고, COLLECT_WORKFLOW로 대상 워크플로를 바꾼다", () => {
    const env = unwrap(
      readGuardEnv({
        ...base,
        GITHUB_API_URL: "https://ghe.example.com/api/v3/",
        COLLECT_WORKFLOW: "ci.yml",
      }),
    );
    expect(env.apiUrl).toBe("https://ghe.example.com/api/v3");
    expect(env.workflowFile).toBe("ci.yml");
  });

  it("GITHUB_RUN_ID가 없으면 currentRunId는 null (로컬 실행)", () => {
    const { GITHUB_RUN_ID: _omit, ...rest } = base;
    void _omit;
    expect(unwrap(readGuardEnv(rest)).currentRunId).toBeNull();
  });

  it("필수 값이 없거나 형식이 틀리면 오류", () => {
    expect(errorOf(readGuardEnv({}))).toContain("GITHUB_EVENT_NAME");
    expect(
      errorOf(readGuardEnv({ ...base, GITHUB_REPOSITORY: "no-slash" })),
    ).toContain("owner/repo");
    expect(errorOf(readGuardEnv({ ...base, GITHUB_RUN_ID: "12a" }))).toContain(
      "GITHUB_RUN_ID",
    );
  });
});

describe("readTriggerSlot — 트리거 계절 (M1-47)", () => {
  it("백업 schedule cron 2개 → 여름(06:40 KST)·겨울(07:20 KST), 공백 차이는 정규화", () => {
    expect(
      unwrap(readTriggerSlot("schedule", { SCHEDULE: "40 21 * * *" })),
    ).toEqual(SUMMER_SCHEDULE);
    expect(
      unwrap(readTriggerSlot("schedule", { SCHEDULE: " 20  22 * * * " })),
    ).toEqual(WINTER_SCHEDULE);
    expect(normalizeCron("  20\t22  * * *\n")).toBe("20 22 * * *");
  });

  it("dispatch 입력은 대소문자·앞뒤 공백 무시, 다른 이벤트는 슬롯 없음", () => {
    expect(
      unwrap(readTriggerSlot("workflow_dispatch", { SLOT: " Summer " })),
    ).toEqual(SUMMER_DISPATCH);
    expect(unwrap(readTriggerSlot("workflow_dispatch", {}))).toBeNull();
    expect(unwrap(readTriggerSlot("push", { SLOT: "winter" }))).toBeNull();
  });

  it("Object 프로토타입 키 같은 값은 cron으로 받지 않는다", () => {
    expect(readTriggerSlot("schedule", { SCHEDULE: "constructor" }).ok).toBe(
      false,
    );
  });
});

describe("precheck", () => {
  it("schedule·workflow_dispatch 밖의 이벤트는 실행하지 않는다", () => {
    expect(precheck(trigger({ eventName: "push" }), NOW)).toMatchObject({
      run: false,
      reason: "unsupported-event",
    });
  });

  it("main이 아닌 ref는 실행하지 않는다 (force여도)", () => {
    expect(
      precheck(trigger({ ref: "refs/heads/feature", force: true }), NOW),
    ).toMatchObject({ run: false, reason: "not-main" });
  });

  it("schedule은 COLLECT_ENABLED가 아니면 건너뛴다 (계절과 무관하게 이 이유가 먼저)", () => {
    for (const slot of [SUMMER_SCHEDULE, WINTER_SCHEDULE]) {
      expect(
        precheck(trigger({ eventName: "schedule", slot }), NOW),
      ).toMatchObject({ run: false, reason: "schedule-disabled" });
    }
  });

  it("schedule + COLLECT_ENABLED + 계절이 맞으면 이력 확인으로 넘긴다", () => {
    expect(
      precheck(
        trigger({
          eventName: "schedule",
          collectEnabled: true,
          slot: SUMMER_SCHEDULE,
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("schedule에는 force가 적용되지 않는다 (입력이 없는 이벤트)", () => {
    expect(
      precheck(
        trigger({
          eventName: "schedule",
          collectEnabled: true,
          force: true,
          slot: SUMMER_SCHEDULE,
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("workflow_dispatch는 COLLECT_ENABLED와 무관하게 이력 확인으로 넘긴다", () => {
    expect(precheck(trigger({ collectEnabled: false }), NOW)).toBeNull();
  });

  it("workflow_dispatch + force는 가드 없이 실행한다", () => {
    expect(precheck(trigger({ force: true }), NOW)).toMatchObject({
      run: true,
      reason: "forced",
    });
  });

  it("입력 없는 수동 dispatch는 계절 판정 없이 지금과 같다 — 어느 계절·시각이든 이력 확인, force면 실행", () => {
    for (const now of [
      NOW, // 여름 06:45
      kst("2026-10-11T07:15"), // 여름인데 겨울 수집 시각
      kst("2026-12-01T06:35"), // 겨울인데 여름 수집 시각
      kst("2026-12-01T14:00"),
    ]) {
      expect(precheck(trigger(), now)).toBeNull();
      expect(precheck(trigger({ force: true }), now)).toMatchObject({
        run: true,
        reason: "forced",
      });
    }
  });

  it("계절에 맞지 않는 트리거는 off-season으로 건너뛴다 — 여름(10-11)의 07:10 dispatch·07:20 schedule", () => {
    const winterDispatch = precheck(
      trigger({ slot: WINTER_DISPATCH }),
      kst("2026-10-11T07:10"),
    );
    expect(winterDispatch).toMatchObject({ run: false, reason: "off-season" });
    expect(winterDispatch?.message).toContain("2026-10-11");
    expect(winterDispatch?.message).toContain("06:30 수집 → 07:00 공개");
    expect(winterDispatch?.message).toContain("slot=winter");
    expect(
      precheck(
        trigger({
          eventName: "schedule",
          collectEnabled: true,
          slot: WINTER_SCHEDULE,
        }),
        kst("2026-10-11T07:20"),
      ),
    ).toMatchObject({ run: false, reason: "off-season" });
  });

  it("slot이 있으면 force보다 계절 판정이 먼저다(정기 트리거 표시), 계절이 맞으면 force가 적용된다", () => {
    expect(
      precheck(trigger({ slot: WINTER_DISPATCH, force: true }), NOW),
    ).toMatchObject({ run: false, reason: "off-season" });
    expect(
      precheck(trigger({ slot: SUMMER_DISPATCH, force: true }), NOW),
    ).toMatchObject({ run: true, reason: "forced" });
  });

  describe("계절 슬롯 읽기 오류(3a) — 이벤트·main·COLLECT_ENABLED 판정 뒤에 실패", () => {
    const env = (over: Record<string, string>) =>
      unwrap(
        readGuardEnv({
          GITHUB_EVENT_NAME: "schedule",
          GITHUB_REF: MAIN_REF,
          GITHUB_REPOSITORY: "sguys99/euro-digest",
          SCHEDULE: "30 21 * * *", // SCHEDULE_SEASONS에 없는 cron
          ...over,
        }),
      ).trigger;

    it("COLLECT_ENABLED=false + 모르는 cron → schedule-disabled 건너뛰기(실패 아님, exit 0)", () => {
      const decision = precheck(env({ COLLECT_ENABLED: "false" }), NOW);
      expect(decision).toMatchObject({
        run: false,
        reason: "schedule-disabled",
      });
      expect(isFailureDecision(decision!)).toBe(false);
      // 빈 SCHEDULE도 같다
      expect(
        precheck(env({ COLLECT_ENABLED: "false", SCHEDULE: "" }), NOW)?.reason,
      ).toBe("schedule-disabled");
    });

    it("main이 아닌 ref + 모르는 cron → not-main 건너뛰기", () => {
      const decision = precheck(
        env({ COLLECT_ENABLED: "true", GITHUB_REF: "refs/heads/feature" }),
        NOW,
      );
      expect(decision?.reason).toBe("not-main");
      expect(isFailureDecision(decision!)).toBe(false);
    });

    it("main + COLLECT_ENABLED + 모르는 cron → invalid-trigger 실패(exit 1)", () => {
      const decision = precheck(env({ COLLECT_ENABLED: "true" }), NOW);
      expect(decision).toMatchObject({
        run: false,
        reason: "invalid-trigger",
      });
      expect(decision?.message).toContain("SCHEDULE_SEASONS");
      expect(isFailureDecision(decision!)).toBe(true);
    });

    it("dispatch의 잘못된 slot 입력 → main이면 force여도 실패, main이 아니면 not-main", () => {
      const dispatch = (over: Record<string, string>) =>
        env({
          GITHUB_EVENT_NAME: "workflow_dispatch",
          SLOT: "autumn",
          ...over,
        });
      const forced = precheck(dispatch({ FORCE: "true" }), NOW);
      expect(forced?.reason).toBe("invalid-trigger");
      expect(isFailureDecision(forced!)).toBe(true);
      expect(
        precheck(dispatch({ GITHUB_REF: "refs/heads/feature" }), NOW)?.reason,
      ).toBe("not-main");
    });

    it("다른 판단은 실패가 아니다", () => {
      for (const reason of [
        "unsupported-event",
        "not-main",
        "schedule-disabled",
        "off-season",
        "forced",
        "recent-success",
        "no-recent-success",
      ] as const) {
        expect(isFailureDecision({ run: false, reason, message: "x" })).toBe(
          false,
        );
      }
    });
  });

  it("계절은 시계가 아니라 발행일로 — 늦게 시작한 여름 06:40 schedule(10-25 10:30 KST, 전환 순간 뒤)도 그날은 여름이라 진행", () => {
    expect(
      precheck(
        trigger({
          eventName: "schedule",
          collectEnabled: true,
          slot: SUMMER_SCHEDULE,
        }),
        kst("2026-10-25T10:30"),
      ),
    ).toBeNull();
  });
});

describe("계절 가드 — 서머타임 전환 경계의 트리거 4종 (PRD §15 D26, FR-150)", () => {
  /** [발행일, 그날 진행하는 트리거] — 나머지 둘은 off-season */
  const DAYS: Array<[string, "summer" | "winter"]> = [
    ["2026-10-24", "summer"],
    ["2026-10-25", "summer"], // 전환일(일) 아침은 전환 전 — 여름
    ["2026-10-26", "winter"], // 첫 07:10 수집
    ["2027-03-27", "winter"],
    ["2027-03-28", "winter"], // 전환일(일) 아침은 전환 전 — 겨울
    ["2027-03-29", "summer"], // 첫 06:30 수집
  ];
  const TRIGGERS: Array<[string, string, GuardTrigger]> = [
    ["06:30 dispatch(summer)", "06:30", trigger({ slot: SUMMER_DISPATCH })],
    [
      "06:40 schedule",
      "06:40",
      trigger({
        eventName: "schedule",
        collectEnabled: true,
        slot: SUMMER_SCHEDULE,
      }),
    ],
    ["07:10 dispatch(winter)", "07:10", trigger({ slot: WINTER_DISPATCH })],
    [
      "07:20 schedule",
      "07:20",
      trigger({
        eventName: "schedule",
        collectEnabled: true,
        slot: WINTER_SCHEDULE,
      }),
    ],
  ];

  for (const [date, season] of DAYS) {
    it(`${date} — ${season === "summer" ? "06:30·06:40만" : "07:10·07:20만"} 진행`, () => {
      const result = TRIGGERS.map(([label, hhmm, t]) => [
        label,
        precheck(t, kst(`${date}T${hhmm}`))?.reason ?? "history",
      ]);
      expect(result).toEqual(
        TRIGGERS.map(([label, , t]) => [
          label,
          t.slot?.season === season ? "history" : "off-season",
        ]),
      );
    });
  }
});

describe("API 주소", () => {
  it("성공 실행 목록과 job 목록 주소를 만든다", () => {
    expect(
      workflowRunsUrl(
        "https://api.github.com",
        "sguys99/euro-digest",
        "collect.yml",
      ),
    ).toBe(
      "https://api.github.com/repos/sguys99/euro-digest/actions/workflows/collect.yml/runs?status=success&per_page=20&exclude_pull_requests=true",
    );
    expect(
      runJobsUrl("https://api.github.com", "sguys99/euro-digest", 42),
    ).toBe(
      "https://api.github.com/repos/sguys99/euro-digest/actions/runs/42/jobs?filter=latest&per_page=100",
    );
  });
});

describe("parseWorkflowRuns", () => {
  const apiRun = {
    id: 100,
    run_number: 7,
    event: "schedule",
    status: "completed",
    conclusion: "success",
    created_at: "2026-10-10T21:40:05Z",
    run_started_at: "2026-10-10T21:40:06Z",
    updated_at: "2026-10-10T21:44:00Z",
    html_url: "https://github.com/sguys99/euro-digest/actions/runs/100",
    extra: { ignored: true },
  };

  it("필요한 필드만 꺼낸다", () => {
    expect(
      unwrap(parseWorkflowRuns({ total_count: 1, workflow_runs: [apiRun] })),
    ).toEqual<WorkflowRun[]>([
      {
        id: 100,
        runNumber: 7,
        event: "schedule",
        conclusion: "success",
        createdAt: "2026-10-10T21:40:05Z",
        runStartedAt: "2026-10-10T21:40:06Z",
        updatedAt: "2026-10-10T21:44:00Z",
        htmlUrl: "https://github.com/sguys99/euro-digest/actions/runs/100",
      },
    ]);
  });

  it("run_started_at이 없으면 null", () => {
    const { run_started_at: _omit, ...rest } = apiRun;
    void _omit;
    expect(
      unwrap(parseWorkflowRuns({ workflow_runs: [rest] }))[0]?.runStartedAt,
    ).toBeNull();
  });

  it("형식이 다르면 오류", () => {
    expect(errorOf(parseWorkflowRuns(null))).toContain("workflow_runs");
    expect(errorOf(parseWorkflowRuns({ workflow_runs: {} }))).toContain(
      "workflow_runs",
    );
    expect(
      errorOf(parseWorkflowRuns({ workflow_runs: [{ ...apiRun, id: "100" }] })),
    ).toContain("workflow_runs[0]");
    expect(
      errorOf(
        parseWorkflowRuns({
          workflow_runs: [{ ...apiRun, created_at: "어제" }],
        }),
      ),
    ).toContain("workflow_runs[0]");
  });
});

describe("parseWorkflowJobs", () => {
  it("이름·결론·완료 시각을 꺼낸다 (진행 중 job은 null)", () => {
    expect(
      unwrap(
        parseWorkflowJobs({
          total_count: 2,
          jobs: [
            {
              name: COLLECT_JOB_NAME,
              status: "completed",
              conclusion: "skipped",
              completed_at: "2026-10-10T21:40:30Z",
            },
            {
              name: "실패 이슈 보고",
              status: "in_progress",
              conclusion: null,
              completed_at: null,
            },
          ],
        }),
      ),
    ).toEqual<WorkflowJob[]>([
      {
        name: COLLECT_JOB_NAME,
        conclusion: "skipped",
        completedAt: "2026-10-10T21:40:30Z",
      },
      { name: "실패 이슈 보고", conclusion: null, completedAt: null },
    ]);
  });

  it("형식이 다르면 오류", () => {
    expect(errorOf(parseWorkflowJobs({}))).toContain("jobs");
    expect(errorOf(parseWorkflowJobs({ jobs: [{ name: 1 }] }))).toContain(
      "jobs[0]",
    );
  });
});

describe("selectCandidateRuns", () => {
  it("성공·현재 실행 아님·시간 범위(12h + 여유 6h) 안인 실행만 고른다", () => {
    const runs = [
      run({ id: 1 }),
      run({ id: 2, conclusion: "failure" }),
      run({ id: 3 }), // 현재 실행 (재실행 시도 등)
      run({ id: 4, createdAt: hoursAgo(17.9), runStartedAt: hoursAgo(17.9) }),
      run({ id: 5, createdAt: hoursAgo(18.1), runStartedAt: hoursAgo(18.1) }),
    ];
    expect(
      selectCandidateRuns(runs, { now: NOW, currentRunId: 3 }).map((r) => r.id),
    ).toEqual([1, 4]);
  });

  it("재실행이면 처음 생성 시각보다 그 시도의 시작 시각(run_started_at)을 본다", () => {
    const rerun = run({
      id: 9,
      createdAt: hoursAgo(30),
      runStartedAt: hoursAgo(2),
    });
    expect(
      selectCandidateRuns([rerun], { now: NOW, currentRunId: null }),
    ).toHaveLength(1);
  });

  it("run_started_at이 없으면 created_at을 쓴다", () => {
    const old = run({ id: 9, createdAt: hoursAgo(30), runStartedAt: null });
    expect(
      selectCandidateRuns([old], { now: NOW, currentRunId: null }),
    ).toHaveLength(0);
  });
});

describe("findCollectSuccess", () => {
  it("수집 job이 12시간 안에 success로 끝났으면 최근 성공", () => {
    expect(
      findCollectSuccess(run(), [job({ completedAt: hoursAgo(11.9) })], NOW),
    ).toEqual<RecentSuccess>({
      runId: 100,
      runNumber: 7,
      url: "https://github.com/sguys99/euro-digest/actions/runs/100",
      event: "workflow_dispatch",
      completedAt: hoursAgo(11.9),
    });
  });

  it("가드가 건너뛴 실행(수집 job skipped)은 실행이 success여도 성공 이력이 아니다", () => {
    const skippedRun = run();
    const jobs = [
      job({ name: "실행 판단 (계절 · 12시간 가드)", conclusion: "success" }),
      job({ conclusion: "skipped" }),
      job({ name: "배포 (GitHub Pages)", conclusion: "skipped" }),
    ];
    expect(findCollectSuccess(skippedRun, jobs, NOW)).toBeNull();
  });

  it("12시간 이상 지난 성공은 세지 않는다", () => {
    expect(
      findCollectSuccess(run(), [job({ completedAt: hoursAgo(12) })], NOW),
    ).toBeNull();
  });

  it("job 이름이 다르면 찾지 않는다 (이름 변경 시 테스트로 잡는다)", () => {
    expect(
      findCollectSuccess(run(), [job({ name: "collect" })], NOW),
    ).toBeNull();
  });

  it("job 완료 시각이 없으면 실행의 updated_at을 쓴다", () => {
    expect(
      findCollectSuccess(
        run({ updatedAt: hoursAgo(3) }),
        [job({ completedAt: null })],
        NOW,
      )?.completedAt,
    ).toBe(hoursAgo(3));
  });

  it("러너 시계가 앞서 완료 시각이 미래여도 최근 성공으로 본다", () => {
    expect(
      findCollectSuccess(run(), [job({ completedAt: hoursAgo(-0.05) })], NOW),
    ).not.toBeNull();
  });
});

describe("decideFromHistory", () => {
  const success = (runNumber: number, hours: number): RecentSuccess => ({
    runId: runNumber * 10,
    runNumber,
    url: `https://github.com/sguys99/euro-digest/actions/runs/${runNumber * 10}`,
    event: "workflow_dispatch",
    completedAt: hoursAgo(hours),
  });

  it("성공 이력이 없으면 실행", () => {
    expect(decideFromHistory([])).toMatchObject({
      run: true,
      reason: "no-recent-success",
    });
  });

  it("성공 이력이 있으면 건너뛰고 가장 최근 성공을 근거로 든다", () => {
    const decision = decideFromHistory([success(5, 8), success(6, 0.2)]);
    expect(decision).toMatchObject({
      run: false,
      reason: "recent-success",
      recent: { runNumber: 6 },
    });
    expect(decision.message).toContain("#6");
    expect(decision.message).toContain("force");
  });
});

describe("12시간 가드 시나리오", () => {
  /** API 응답을 흉내 낸 실행 + job 목록으로 판단까지 한 번에 돌린다 */
  function decide(
    history: { run: WorkflowRun; jobs: WorkflowJob[] }[],
    currentRunId: number,
  ) {
    const candidates = selectCandidateRuns(
      history.map((entry) => entry.run),
      { now: NOW, currentRunId },
    );
    const successes = candidates
      .map((candidate) => {
        const entry = history.find((h) => h.run.id === candidate.id);
        return entry ? findCollectSuccess(entry.run, entry.jobs, NOW) : null;
      })
      .filter((s): s is RecentSuccess => s !== null);
    return decideFromHistory(successes);
  }

  it("06:30 수집 성공 직후 06:40 백업 실행은 건너뛴다", () => {
    const morning = {
      run: run({
        id: 1,
        createdAt: hoursAgo(0.25),
        runStartedAt: hoursAgo(0.25),
      }),
      jobs: [job({ completedAt: hoursAgo(0.05) })],
    };
    expect(decide([morning], 2)).toMatchObject({
      run: false,
      reason: "recent-success",
    });
  });

  it("skip이 skip을 부르지 않는다: 전날 06:30 성공(24h 전) + 전날 18:00 skip(12.75h 전) → 오늘 06:30은 실행", () => {
    const yesterdayMorning = {
      run: run({
        id: 1,
        createdAt: hoursAgo(24.25),
        runStartedAt: hoursAgo(24.25),
      }),
      jobs: [job({ completedAt: hoursAgo(24) })],
    };
    const yesterdayEveningSkip = {
      run: run({
        id: 2,
        createdAt: hoursAgo(12.75),
        runStartedAt: hoursAgo(12.75),
      }),
      jobs: [
        job({
          name: "실행 판단 (계절 · 12시간 가드)",
          completedAt: hoursAgo(12.7),
        }),
        job({ conclusion: "skipped", completedAt: hoursAgo(12.7) }),
      ],
    };
    const recentSkip = {
      run: run({ id: 3, createdAt: hoursAgo(2), runStartedAt: hoursAgo(2) }),
      jobs: [job({ conclusion: "skipped", completedAt: hoursAgo(2) })],
    };
    expect(
      decide([recentSkip, yesterdayEveningSkip, yesterdayMorning], 4),
    ).toMatchObject({ run: true, reason: "no-recent-success" });
  });

  it("겨울 아침: 06:30 dispatch·06:40 schedule이 계절 skip(수집 job skipped)돼도 성공 이력이 아니다 → 07:10은 실행", () => {
    // NOW(06:45)를 07:10 실행으로 보고 앞선 두 실행을 40분·30분 전에 둔다(가드가 off-season으로 끝냄)
    const offSeason = (id: number, hours: number, event: string) => ({
      run: run({
        id,
        event,
        createdAt: hoursAgo(hours),
        runStartedAt: hoursAgo(hours),
        updatedAt: hoursAgo(hours - 0.02),
      }),
      jobs: [
        job({
          name: "실행 판단 (계절 · 12시간 가드)",
          completedAt: hoursAgo(hours - 0.02),
        }),
        job({ conclusion: "skipped", completedAt: hoursAgo(hours - 0.02) }),
        job({
          name: "배포 (GitHub Pages)",
          conclusion: "skipped",
          completedAt: hoursAgo(hours - 0.02),
        }),
      ],
    });
    expect(
      decide(
        [
          offSeason(1, 40 / 60, "workflow_dispatch"),
          offSeason(2, 30 / 60, "schedule"),
        ],
        3,
      ),
    ).toMatchObject({ run: true, reason: "no-recent-success" });
  });
});

describe("출력 형식", () => {
  it("GITHUB_OUTPUT에 run·reason 두 줄", () => {
    expect(
      formatGuardOutputs({
        run: false,
        reason: "schedule-disabled",
        message: "x",
      }),
    ).toBe("run=false\nreason=schedule-disabled\n");
  });

  it("Step Summary 표에 판단·트리거·최근 성공을 남기고 | 를 이스케이프한다", () => {
    const summary = formatGuardSummary(
      {
        run: false,
        reason: "recent-success",
        message: "a|b",
        recent: {
          runId: 100,
          runNumber: 7,
          url: "https://github.com/sguys99/euro-digest/actions/runs/100",
          event: "workflow_dispatch",
          completedAt: "2026-10-10T21:44:00Z",
        },
      },
      trigger({
        eventName: "schedule",
        collectEnabled: true,
        slot: SUMMER_SCHEDULE,
      }),
      NOW,
    );
    expect(summary).toContain("**건너뜀** (성공 종료)");
    expect(summary).toContain("`recent-success` — a\\|b");
    expect(summary).toContain("schedule · `refs/heads/main`");
    expect(summary).toContain(
      "| 계절 슬롯 | 백업 schedule `40 21 * * *` → 여름(유럽 서머타임) |",
    );
    expect(summary).toContain(
      "| 발행일 계절 | 2026-10-11 · 여름(유럽 서머타임) 06:30 수집 → 07:00 공개 · 브리핑 마감 06:50 (KST) |",
    );
    expect(summary).toContain(
      "[#7](https://github.com/sguys99/euro-digest/actions/runs/100)",
    );
    expect(summary).toContain(NOW.toISOString());
  });

  it("Step Summary — 슬롯 없는 수동 실행·겨울 발행일", () => {
    const summary = formatGuardSummary(
      { run: true, reason: "no-recent-success", message: "x" },
      trigger(),
      kst("2026-10-26T07:12"),
    );
    expect(summary).toContain(
      "| 계절 슬롯 | 없음 — 계절 판정 없이 12시간 가드만 |",
    );
    expect(summary).toContain(
      "2026-10-26 · 겨울(유럽 표준시) 07:10 수집 → 07:30 공개 · 브리핑 마감 07:20 (KST)",
    );
  });

  it("Step Summary — 슬롯 읽기 오류(invalid-trigger)는 실패로 표시", () => {
    const summary = formatGuardSummary(
      { run: false, reason: "invalid-trigger", message: "x" },
      trigger({
        eventName: "schedule",
        collectEnabled: true,
        slotError: "알 수 없는 schedule cron",
      }),
      NOW,
    );
    expect(summary).toContain("| 결과 | **실패** (exit 1 — 실패 이슈) |");
    expect(summary).toContain(
      "| 계절 슬롯 | **읽기 오류** — 알 수 없는 schedule cron |",
    );
  });
});

describe("collect.yml과의 동기화", () => {
  const workflow = readFileSync(
    fileURLToPath(new URL("../.github/workflows/collect.yml", import.meta.url)),
    "utf8",
  );

  it("collect job의 name이 COLLECT_JOB_NAME과 같다 (가드가 성공 이력을 찾는 기준)", () => {
    const match = /^ {2}collect:\n(?: {4}#.*\n)* {4}name: (.+)$/m.exec(
      workflow,
    );
    expect(match?.[1]).toBe(COLLECT_JOB_NAME);
  });

  it("백업 schedule은 06:40 KST(21:40 UTC)·07:20 KST(22:20 UTC), concurrency 그룹은 collect", () => {
    expect(workflow).toContain('- cron: "40 21 * * *"');
    expect(workflow).toContain('- cron: "20 22 * * *"');
    expect(workflow).toMatch(/^concurrency:\n {2}group: collect\n/m);
    expect(workflow).not.toMatch(/group: pages/);
  });

  it("schedule cron 목록 = SCHEDULE_SEASONS 키 (계절 판정 표와 글자까지 같다)", () => {
    const crons = [...workflow.matchAll(/^ {4}- cron: "([^"]+)"/gm)].map(
      (m) => m[1],
    );
    expect(crons.sort()).toEqual(Object.keys(SCHEDULE_SEASONS).sort());
  });

  it("각 cron의 UTC 시각 = 그 계절 발행 슬롯의 backupStart(publishSlot — 여름 06:40·겨울 07:20 KST)", () => {
    // 그 계절의 아무 발행일: 여름 2026-08-01 · 겨울 2026-12-01 — cron은 발행일 전날(UTC) 실행
    const sample = { summer: "2026-08-01", winter: "2026-12-01" } as const;
    for (const [cron, season] of Object.entries(SCHEDULE_SEASONS)) {
      const slot = publishSlot(sample[season]);
      const [minute, hour] = cron.split(" ");
      const at = new Date(slot.backupStart);
      expect([cron, at.getUTCHours(), at.getUTCMinutes()]).toEqual([
        cron,
        Number(hour),
        Number(minute),
      ]);
      expect(utcDate(slot.backupStart) < slot.date).toBe(true);
    }
  });

  it("guard 단계가 SCHEDULE(github.event.schedule)·SLOT(inputs.slot)을 env로 넘기고, dispatch 입력 slot이 있다", () => {
    const guard = workflow.slice(
      workflow.indexOf("  guard:"),
      workflow.indexOf("  collect:\n"),
    );
    expect(guard).toContain("SCHEDULE: ${{ github.event.schedule }}");
    expect(guard).toContain("SLOT: ${{ inputs.slot }}");
    expect(guard).toContain("FORCE: ${{ inputs.force }}");
    expect(workflow).toMatch(
      /^ {6}slot:\n(?: {8}.*\n)*? {8}type: string\n(?: {8}.*\n)*? {8}default: ""$/m,
    );
  });
});
