import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { ParseResult } from "../scripts/lib/cli-args";
import {
  COLLECT_JOB_NAME,
  decideFromHistory,
  findCollectSuccess,
  formatGuardOutputs,
  formatGuardSummary,
  MAIN_REF,
  parseFlag,
  parseWorkflowJobs,
  parseWorkflowRuns,
  precheck,
  readGuardEnv,
  runJobsUrl,
  selectCandidateRuns,
  workflowRunsUrl,
  type GuardTrigger,
  type RecentSuccess,
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

// 기준 시각: 2026-10-11 06:45 KST
const NOW = new Date("2026-10-10T21:45:00Z");

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function trigger(overrides: Partial<GuardTrigger> = {}): GuardTrigger {
  return {
    eventName: "workflow_dispatch",
    ref: MAIN_REF,
    collectEnabled: false,
    force: false,
    ...overrides,
  };
}

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
  const base = {
    GITHUB_EVENT_NAME: "schedule",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: "sguys99/euro-digest",
    GITHUB_RUN_ID: "123456789",
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
      },
      repository: "sguys99/euro-digest",
      currentRunId: 123456789,
      apiUrl: "https://api.github.com",
      workflowFile: "collect.yml",
    });
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

describe("precheck", () => {
  it("schedule·workflow_dispatch 밖의 이벤트는 실행하지 않는다", () => {
    expect(precheck(trigger({ eventName: "push" }))).toMatchObject({
      run: false,
      reason: "unsupported-event",
    });
  });

  it("main이 아닌 ref는 실행하지 않는다 (force여도)", () => {
    expect(
      precheck(trigger({ ref: "refs/heads/feature", force: true })),
    ).toMatchObject({ run: false, reason: "not-main" });
  });

  it("schedule은 COLLECT_ENABLED가 아니면 건너뛴다", () => {
    expect(precheck(trigger({ eventName: "schedule" }))).toMatchObject({
      run: false,
      reason: "schedule-disabled",
    });
  });

  it("schedule + COLLECT_ENABLED면 이력 확인으로 넘긴다", () => {
    expect(
      precheck(trigger({ eventName: "schedule", collectEnabled: true })),
    ).toBeNull();
  });

  it("schedule에는 force가 적용되지 않는다 (입력이 없는 이벤트)", () => {
    expect(
      precheck(
        trigger({ eventName: "schedule", collectEnabled: true, force: true }),
      ),
    ).toBeNull();
  });

  it("workflow_dispatch는 COLLECT_ENABLED와 무관하게 이력 확인으로 넘긴다", () => {
    expect(precheck(trigger({ collectEnabled: false }))).toBeNull();
  });

  it("workflow_dispatch + force는 가드 없이 실행한다", () => {
    expect(precheck(trigger({ force: true }))).toMatchObject({
      run: true,
      reason: "forced",
    });
  });
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
      job({ name: "실행 판단 (12시간 가드)", conclusion: "success" }),
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
        job({ name: "실행 판단 (12시간 가드)", completedAt: hoursAgo(12.7) }),
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
      trigger({ eventName: "schedule", collectEnabled: true }),
      NOW,
    );
    expect(summary).toContain("**건너뜀** (성공 종료)");
    expect(summary).toContain("`recent-success` — a\\|b");
    expect(summary).toContain("schedule · `refs/heads/main`");
    expect(summary).toContain(
      "[#7](https://github.com/sguys99/euro-digest/actions/runs/100)",
    );
    expect(summary).toContain(NOW.toISOString());
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

  it("백업 schedule은 06:40 KST(21:40 UTC), concurrency 그룹은 collect", () => {
    expect(workflow).toContain('- cron: "40 21 * * *"');
    expect(workflow).toMatch(/^concurrency:\n {2}group: collect\n/m);
    expect(workflow).not.toMatch(/group: pages/);
  });
});
