/**
 * 주간 작업 러너 (M3-06 — PRD FR-90, CLAUDE.md §6.1·§6.3, D49 정신): 대상 주차 · 같은 주 재실행 가드 · 단계별 실패 격리 · 상태 ·
 * 종료 코드 · 실행 기록 · 단계 출력. LLM·네트워크 호출 없음(mock 모드 + 임시 폴더).
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RunsDevFileSchema } from "@/lib/schema";

import type { Logger } from "../scripts/lib/logger";
import {
  WEEKLY_OUTPUT_KEYS,
  checkWeeklyStages,
  decideWeeklyGuard,
  defaultTargetWeek,
  discardPathsOf,
  formatWeeklyOutputs,
  isWeeklyWritePath,
  parseWeeklyArgs,
  publishedWeeksOf,
  recordedWeeklyStatus,
  resolveTargetWeek,
  runWeekly,
  runWeeklyStages,
  shouldRecordWeeklyRun,
  weeklyExitCode,
  weeklyRunStatus,
  type RunWeeklyDeps,
  type WeeklyBaseContext,
  type WeeklyStageResult,
} from "../scripts/lib/weekly-run";
import {
  WEEKLY_REPORT_DIR,
  WEEKLY_STAGES,
  type WeeklyStage,
} from "../scripts/lib/weekly-stages";

// ─── 도구 ────────────────────────────────────────────────────────────────

interface Captured {
  level: string;
  event: string;
  fields: Record<string, unknown>;
}

function captureLogger(): { logger: Logger; records: Captured[] } {
  const records: Captured[] = [];
  const make = (bindings: Record<string, unknown>): Logger => {
    const write =
      (level: string) => (event: string, fields?: Record<string, unknown>) =>
        records.push({ level, event, fields: { ...bindings, ...fields } });
    return {
      scope: "weekly",
      debug: write("debug"),
      info: write("info"),
      warn: write("warn"),
      error: write("error"),
      child: (fields) => make({ ...bindings, ...fields }),
    };
  };
  return { logger: make({}), records };
}

function stage(
  id: string,
  run: WeeklyStage["run"],
  extra: Partial<WeeklyStage> = {},
): WeeklyStage {
  return {
    id,
    title: id,
    task: "M0-00",
    llm: false,
    timeoutMs: 5_000,
    writes: [],
    run,
    ...extra,
  };
}

// 2026-11-02(월) 08:00 KST = 정기 실행 시각
const MONDAY_RUN = new Date("2026-11-01T23:00:00.000Z");

function baseContext(): WeeklyBaseContext {
  return {
    rootDir: "/tmp/none",
    dataDir: "/tmp/none/data",
    week: "2026-44",
    weekRange: { from: "", to: "" },
    env: "dev",
    llmMode: "mock",
    dry: true,
    force: false,
    runId: "weekly-dev-20261101T230000Z-0000",
    startedAt: MONDAY_RUN.toISOString(),
    now: () => MONDAY_RUN,
    print: () => {},
    llm: {
      model: "claude-haiku-5-5",
      createClient: () => {
        throw new Error("테스트에서 LLM 클라이언트를 만들지 않는다");
      },
      addResults: () => {},
      costSoFar: () => 0,
    },
    budget: {
      check: () => Promise.reject(new Error("테스트에서 예산을 읽지 않는다")),
    },
    apiCalls: { add: () => {} },
    http: {
      fetch: () =>
        Promise.reject(new Error("테스트에서 네트워크를 쓰지 않는다")),
      userAgent: "EuroDigestBot/0.1 (+test)",
    },
    sources: { add: () => {} },
  };
}

// ─── 인자 ────────────────────────────────────────────────────────────────

describe("parseWeeklyArgs", () => {
  it("기본값 — dry·force 없음, 주차 기본, LLM_MODE 반영", () => {
    const r = parseWeeklyArgs([], undefined);
    expect(r).toEqual({
      ok: true,
      value: {
        dry: false,
        mock: false,
        force: false,
        week: null,
        llmMode: "live",
        help: false,
      },
    });
  });

  it("--dry --force --week · --mock은 LLM_MODE보다 우선", () => {
    const r = parseWeeklyArgs(
      ["--dry", "--force", "--week", "2026-44", "--mock"],
      "live",
    );
    expect(r.ok && r.value).toMatchObject({
      dry: true,
      force: true,
      week: "2026-44",
      llmMode: "mock",
    });
  });

  it("모르는 옵션·주차 형식 오류·모르는 LLM_MODE는 거부", () => {
    expect(parseWeeklyArgs(["--limit", "5"], undefined).ok).toBe(false);
    expect(parseWeeklyArgs(["--week", "2026-W44"], undefined).ok).toBe(false);
    expect(parseWeeklyArgs([], "batch").ok).toBe(false);
  });
});

// ─── 대상 주차 ───────────────────────────────────────────────────────────

describe("defaultTargetWeek — 실행 KST 날짜가 속한 주의 바로 앞 주(지난 월~일, FR-90)", () => {
  it.each([
    // 정기 실행: 월 08:00 KST = UTC 일 23:00 — UTC 날짜로 계산하면 두 주 전(2026-43)이 된다
    ["2026-11-01T23:00:00.000Z", "2026-44"],
    // 같은 주 화~일 수동 재실행도 같은 주차
    ["2026-11-03T03:00:00.000Z", "2026-44"],
    ["2026-11-08T14:59:59.000Z", "2026-44"], // 일 23:59:59 KST
    ["2026-11-08T15:00:00.000Z", "2026-45"], // 다음 월 00:00 KST
    // 해 넘김 — 2026은 53주가 있는 해
    ["2027-01-03T23:00:00.000Z", "2026-53"], // 2027-01-04(월) 08:00 KST
    ["2026-12-27T23:00:00.000Z", "2026-52"], // 2026-12-28(월) 08:00 KST
    // 유럽 서머타임 종료 주(2026-10-25 01:00 UTC) — KST 기준이라 영향 없음
    ["2026-10-25T23:00:00.000Z", "2026-43"],
  ])("%s → %s", (now, week) => {
    expect(defaultTargetWeek(now)).toBe(week);
  });
});

describe("resolveTargetWeek", () => {
  const now = MONDAY_RUN.toISOString();

  it("기본 주차와 집계 구간(UTC 월 00:00 ~ 일 23:59:59.999 — D65 ①)", () => {
    expect(resolveTargetWeek(null, now)).toEqual({
      ok: true,
      value: {
        week: "2026-44",
        range: {
          from: "2026-10-26T00:00:00.000Z",
          to: "2026-11-01T23:59:59.999Z",
        },
      },
    });
  });

  it("'끝난 주'는 KST 주 끝으로 판정 — 월 08:00 KST(UTC 일요일 1시간 남음)에도 지난 주를 실행한다", () => {
    // 일 23:59 KST = 일 14:59 UTC → 아직 W44 진행 중
    expect(resolveTargetWeek("2026-44", "2026-11-01T14:59:00.000Z").ok).toBe(
      false,
    );
    // 월 00:00 KST = 일 15:00 UTC → W44 끝(KST) — UTC 구간 끝은 9시간 뒤
    expect(resolveTargetWeek("2026-44", "2026-11-01T15:00:00.000Z").ok).toBe(
      true,
    );
  });

  it("지난 주차 지정은 허용, 끝나지 않은 주·없는 주차는 거부", () => {
    expect(resolveTargetWeek("2026-40", now).ok).toBe(true);
    expect(resolveTargetWeek("2026-45", now).ok).toBe(false);
    expect(resolveTargetWeek("2025-53", now).ok).toBe(false);
  });
});

// ─── 실행 가드 ───────────────────────────────────────────────────────────

describe("같은 주 재실행 가드 (decideWeeklyGuard)", () => {
  it("그 주차 리포트가 있으면 건너뜀", () => {
    expect(
      decideWeeklyGuard({
        week: "2026-44",
        force: false,
        publishedWeeks: ["2026-43", "2026-44"],
      }),
    ).toMatchObject({ run: false, reason: "already-published" });
  });

  it("없으면 실행 — 다른 주차 리포트는 세지 않는다", () => {
    expect(
      decideWeeklyGuard({
        week: "2026-44",
        force: false,
        publishedWeeks: ["2026-43"],
      }),
    ).toMatchObject({ run: true, reason: "not-published" });
  });

  it("force는 발행 여부보다 먼저", () => {
    expect(
      decideWeeklyGuard({
        week: "2026-44",
        force: true,
        publishedWeeks: ["2026-44"],
      }),
    ).toMatchObject({ run: true, reason: "force" });
  });

  it("publishedWeeksOf — YYYY-WW.json만 주차로 센다", () => {
    expect(
      publishedWeeksOf([
        "2026-44.json",
        "2026-43.json",
        "README.md",
        "2026-44.json.tmp",
        ".gitkeep",
      ]),
    ).toEqual(["2026-43", "2026-44"]);
  });
});

// ─── 단계 격리 ───────────────────────────────────────────────────────────

describe("runWeeklyStages — 단계별 실패 격리", () => {
  it("한 단계가 던져도 다음 단계가 돈다 · 미구현은 건너뜀(성공 처리)", async () => {
    const ran: string[] = [];
    const { logger, records } = captureLogger();
    const results = await runWeeklyStages(
      [
        stage(
          "first",
          async () => {
            ran.push("first");
            return { outputs: ["data/a/x.json"], counts: { rows: 3 } };
          },
          { writes: ["data/a"] },
        ),
        stage("boom", async () => {
          ran.push("boom");
          throw new Error("배치 실패\n둘째 줄은 남기지 않는다");
        }),
        stage("sync-boom", () => {
          ran.push("sync-boom");
          throw new Error("동기 예외");
        }),
        stage("todo", null),
        stage("last", async () => {
          ran.push("last");
        }),
      ],
      baseContext(),
      logger,
    );
    expect(ran).toEqual(["first", "boom", "sync-boom", "last"]);
    expect(results.map((r) => [r.id, r.outcome])).toEqual([
      ["first", "success"],
      ["boom", "failed"],
      ["sync-boom", "failed"],
      ["todo", "not-implemented"],
      ["last", "success"],
    ]);
    expect(results[0]).toMatchObject({
      outputs: ["data/a/x.json"],
      counts: { rows: 3 },
    });
    expect(results[1]).toMatchObject({
      error: "배치 실패",
      errorType: "error",
    });
    // 구조화 로그 — 단계 id가 붙는다
    expect(
      records
        .filter((r) => r.event.startsWith("weekly.stage."))
        .map((r) => [r.event, r.fields.stage]),
    ).toEqual([
      ["weekly.stage.start", "first"],
      ["weekly.stage.done", "first"],
      ["weekly.stage.start", "boom"],
      ["weekly.stage.fail", "boom"],
      ["weekly.stage.start", "sync-boom"],
      ["weekly.stage.fail", "sync-boom"],
      ["weekly.stage.skip", "todo"],
      ["weekly.stage.start", "last"],
      ["weekly.stage.done", "last"],
    ]);
  });

  it("시간 상한을 넘은 단계는 abort·실패로 기록되고 다음 단계가 돈다", async () => {
    let aborted = false;
    const { logger } = captureLogger();
    const results = await runWeeklyStages(
      [
        stage(
          "hang",
          (ctx) =>
            new Promise(() => {
              ctx.signal.addEventListener("abort", () => {
                aborted = true;
              });
            }),
          { timeoutMs: 20 },
        ),
        stage("after", async () => ({ note: "done" })),
      ],
      baseContext(),
      logger,
    );
    expect(aborted).toBe(true);
    expect(results.map((r) => [r.id, r.outcome, r.errorType])).toEqual([
      ["hang", "failed", "timeout"],
      ["after", "success", undefined],
    ]);
  });

  it("writes 밖 산출물은 경고만(성공 유지)", async () => {
    const { logger, records } = captureLogger();
    const [result] = await runWeeklyStages(
      [
        stage("stray", async () => ({ outputs: ["data/other/x.json"] }), {
          writes: ["data/mine"],
        }),
      ],
      baseContext(),
      logger,
    );
    expect(result?.outcome).toBe("success");
    expect(
      records.some((r) => r.event === "weekly.stage.outputs-undeclared"),
    ).toBe(true);
  });
});

// ─── 상태·종료 코드 ──────────────────────────────────────────────────────

function result(
  id: string,
  outcome: WeeklyStageResult["outcome"],
): WeeklyStageResult {
  return { id, title: id, task: "M0-00", outcome, elapsedMs: 0, outputs: [] };
}

describe("상태·종료 코드 정책", () => {
  it.each([
    [[], "success"],
    [["not-implemented", "not-implemented"], "success"],
    [["success", "not-implemented"], "success"],
    [["success", "failed"], "partial"],
    [["failed", "not-implemented"], "failed"],
    [["failed", "failed"], "failed"],
  ] as const)("%j → %s", (outcomes, status) => {
    expect(weeklyRunStatus(outcomes.map((o, i) => result(`s${i}`, o)))).toBe(
      status,
    );
  });

  it("종료 코드: 건너뜀·success·partial = 0, failed·준비 실패·기록 실패 = 1", () => {
    expect(weeklyExitCode({ status: "skipped", recordFailed: false })).toBe(0);
    expect(weeklyExitCode({ status: "success", recordFailed: false })).toBe(0);
    expect(weeklyExitCode({ status: "partial", recordFailed: false })).toBe(0);
    expect(weeklyExitCode({ status: "failed", recordFailed: false })).toBe(1);
    expect(
      weeklyExitCode({ status: "setup-failed", recordFailed: false }),
    ).toBe(1);
    expect(weeklyExitCode({ status: "success", recordFailed: true })).toBe(1);
  });

  it("기록 상태 — dry는 skipped", () => {
    expect(recordedWeeklyStatus("partial", true)).toBe("skipped");
    expect(recordedWeeklyStatus("partial", false)).toBe("partial");
  });

  it("기록 여부 — live만, dry는 LLM 결과가 있을 때만(CLAUDE.md §1-4)", () => {
    expect(
      shouldRecordWeeklyRun({ llmMode: "mock", dry: false, llmResultCount: 3 }),
    ).toBe(false);
    expect(
      shouldRecordWeeklyRun({ llmMode: "live", dry: false, llmResultCount: 0 }),
    ).toBe(true);
    expect(
      shouldRecordWeeklyRun({ llmMode: "live", dry: true, llmResultCount: 0 }),
    ).toBe(false);
    expect(
      shouldRecordWeeklyRun({ llmMode: "live", dry: true, llmResultCount: 1 }),
    ).toBe(true);
  });

  it("되돌릴 경로 = 실패한 단계의 writes만", () => {
    const stages = [
      stage("a", null, { writes: ["data/players/weekly"] }),
      stage("b", null, { writes: ["data/blogs.json"] }),
    ];
    expect(
      discardPathsOf(stages, [result("a", "failed"), result("b", "success")]),
    ).toEqual(["data/players/weekly"]);
    expect(discardPathsOf(stages, [result("a", "success")])).toEqual([]);
  });
});

// ─── 등록 ────────────────────────────────────────────────────────────────

describe("단계 등록 (WEEKLY_STAGES)", () => {
  it("등록 검사 통과 — id·writes 형식·겹침 없음·data/runs.json 금지", () => {
    expect(checkWeeklyStages(WEEKLY_STAGES)).toEqual([]);
  });

  it("순서: 한국 선수 주간 리포트 → 분석 블로그 → 팀 프로필 → 운영 리포트", () => {
    expect(WEEKLY_STAGES.map((s) => [s.id, s.task])).toEqual([
      ["korean-weekly", "M3-07"],
      ["analysis-blogs", "M3-08"],
      ["team-profiles", "M4-06"],
      ["ops-report", "M5-09"],
    ]);
    // 가드가 보는 폴더 = 주간 리포트 단계가 쓰는 폴더
    expect(WEEKLY_STAGES[0]?.writes).toContain(WEEKLY_REPORT_DIR);
    // M3-07 — 한국 선수 주간 리포트 단계 구현됨(LLM 호출 지점 #3)
    expect(WEEKLY_STAGES[0]).toMatchObject({ id: "korean-weekly", llm: true });
    expect(WEEKLY_STAGES[0]?.run).not.toBeNull();
  });

  it("잘못된 등록을 잡는다", () => {
    expect(
      checkWeeklyStages([
        stage("Bad_Id", null),
        stage("dup", null, { writes: ["data/runs.json"] }),
        stage("dup", null, { writes: ["data/x"] }),
        stage("nested", null, { writes: ["data/x/y.json"] }),
        stage("zero", null, { timeoutMs: 0 }),
      ]),
    ).toHaveLength(5);
  });

  it("isWeeklyWritePath — data/·public/ 아래만, .. 금지", () => {
    expect(isWeeklyWritePath("data/players/weekly")).toBe(true);
    expect(isWeeklyWritePath("public/feeds/weekly.xml")).toBe(true);
    expect(isWeeklyWritePath("data")).toBe(false);
    expect(isWeeklyWritePath("data/../configs")).toBe(false);
    expect(isWeeklyWritePath("scripts/x.ts")).toBe(false);
    expect(isWeeklyWritePath("data/a b")).toBe(false);
    expect(isWeeklyWritePath("data/runs-dev.json")).toBe(false);
  });
});

// ─── 단계 출력 ───────────────────────────────────────────────────────────

describe("formatWeeklyOutputs", () => {
  const base = {
    skipped: false,
    week: "2026-44",
    publishDate: "2026-11-02",
    runId: "weekly-prod-20261101T230000Z-ab12",
    status: "partial" as const,
    runRecorded: true,
    failedStages: ["korean-weekly", "ops-report"],
    discard: ["data/players/weekly"],
  };

  it("키 순서·값", () => {
    expect(formatWeeklyOutputs(base)).toBe(
      [
        "skipped=false",
        "week=2026-44",
        "publish_date=2026-11-02",
        "run_id=weekly-prod-20261101T230000Z-ab12",
        "status=partial",
        "run_recorded=true",
        "failed_stages=korean-weekly,ops-report",
        "discard=data/players/weekly",
        "",
      ].join("\n"),
    );
    expect(WEEKLY_OUTPUT_KEYS).toHaveLength(8);
  });

  it("실패 단계·되돌릴 경로는 비어도 된다, 줄바꿈·형식 밖 경로는 던진다", () => {
    expect(
      formatWeeklyOutputs({ ...base, failedStages: [], discard: [] }),
    ).toContain("discard=\n");
    expect(() =>
      formatWeeklyOutputs({ ...base, week: "2026-44\nskipped=true" }),
    ).toThrow();
    expect(() =>
      formatWeeklyOutputs({ ...base, discard: ["../etc"] }),
    ).toThrow();
  });
});

// ─── 실행 전체 ───────────────────────────────────────────────────────────

describe("runWeekly — 가드·기록·종료 코드", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "weekly-run-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function deps(overrides: Partial<RunWeeklyDeps> = {}): RunWeeklyDeps {
    return {
      rootDir: root,
      dataDir: path.join(root, "data"),
      env: "dev",
      llmMode: "mock",
      dry: false,
      force: false,
      week: null,
      model: "claude-haiku-5-5",
      stages: WEEKLY_STAGES,
      now: () => MONDAY_RUN,
      logger: captureLogger().logger,
      print: () => {},
      listReportFiles: async () => [],
      createLlm: () => {
        throw new Error("테스트에서 LLM 클라이언트를 만들지 않는다");
      },
      resolveBudgets: () => ({ dailyBudgetUsd: 0.1, monthlyBudgetUsd: 3 }),
      ...overrides,
    };
  }

  // 실제 등록 단계(M3-07 korean-weekly)는 configs·원장을 읽는다 — 러너 동작은 미구현 골격으로 본다(단계는 weekly-kr-stage.test.ts)
  const SKELETON = WEEKLY_STAGES.map((s) => ({ ...s, run: null }));

  it("미구현 단계만 — 성공·exit 0, mock이라 기록 안 함", async () => {
    const outcome = await runWeekly(deps({ stages: SKELETON }));
    expect(outcome.exitCode).toBe(0);
    expect(outcome.outputs).toMatchObject({
      skipped: false,
      week: "2026-44",
      publishDate: "2026-11-02",
      status: "success",
      runRecorded: false,
      failedStages: [],
      discard: [],
    });
    expect(outcome.results.every((r) => r.outcome === "not-implemented")).toBe(
      true,
    );
    expect(outcome.run).toMatchObject({
      job: "weekly",
      status: "success",
      costUsd: 0,
    });
  });

  it("그 주차 리포트가 있으면 단계를 돌리지 않고 건너뜀(exit 0, 기록 없음) — force면 실행", async () => {
    let ran = 0;
    const stages = [stage("count", async () => void ran++)];
    const skipped = await runWeekly(
      deps({ stages, listReportFiles: async () => ["2026-44.json"] }),
    );
    expect(skipped.exitCode).toBe(0);
    expect(skipped.outputs).toMatchObject({ skipped: true, status: "skipped" });
    expect(skipped.run).toBeNull();
    expect(ran).toBe(0);

    const forced = await runWeekly(
      deps({
        stages,
        force: true,
        listReportFiles: async () => ["2026-44.json"],
      }),
    );
    expect(forced.outputs.skipped).toBe(false);
    expect(ran).toBe(1);
  });

  it("단계가 남긴 소스별 결과(ctx.sources — M3-08 분석 블로그)가 실행 기록 sources[]에 들어가고, http를 주입하지 않으면 요청이 거부된다", async () => {
    let rejected = false;
    const outcome = await runWeekly(
      deps({
        stages: [
          stage("feeds", async (ctx) => {
            ctx.sources.add([{ id: "blog", ok: true, items: 3, usable: 1 }]);
            await ctx.http.fetch("https://blog.example.com/feed/").catch(() => {
              rejected = true;
            });
          }),
        ],
      }),
    );
    expect(rejected).toBe(true);
    expect(outcome.run?.sources).toEqual([
      { id: "blog", ok: true, items: 3, usable: 1 },
    ]);
  });

  it("partial — exit 0, 실패 단계·되돌릴 경로 출력", async () => {
    const outcome = await runWeekly(
      deps({
        stages: [
          stage("ok", async () => {}),
          stage(
            "bad",
            async () => {
              throw new Error("x");
            },
            { writes: ["data/bad"] },
          ),
        ],
      }),
    );
    expect(outcome.exitCode).toBe(0);
    expect(outcome.outputs).toMatchObject({
      status: "partial",
      failedStages: ["bad"],
      discard: ["data/bad"],
    });
  });

  it("성공한 단계 없이 실패만 — exit 1", async () => {
    const outcome = await runWeekly(
      deps({
        stages: [
          stage("bad", async () => {
            throw new Error("x");
          }),
          stage("todo", null),
        ],
      }),
    );
    expect(outcome.exitCode).toBe(1);
    expect(outcome.outputs.status).toBe("failed");
  });

  it("live 비dry — data/runs-dev.json에 job weekly 기록(비용 0, LLM 호출 없음)", async () => {
    const outcome = await runWeekly(
      deps({ llmMode: "live", stages: SKELETON }),
    );
    expect(outcome.outputs.runRecorded).toBe(true);
    const runs = RunsDevFileSchema.parse(
      JSON.parse(
        await readFile(path.join(root, "data", "runs-dev.json"), "utf8"),
      ),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      runId: outcome.outputs.runId,
      env: "dev",
      job: "weekly",
      status: "success",
      costUsd: 0,
    });
    expect(outcome.outputs.runId).toMatch(
      /^weekly-dev-20261101T230000Z-[0-9a-f]{4}$/,
    );
  });

  it("live dry — LLM 결과가 없으면 기록하지 않는다", async () => {
    const outcome = await runWeekly(
      deps({ llmMode: "live", dry: true, stages: SKELETON }),
    );
    expect(outcome.outputs.runRecorded).toBe(false);
    expect(outcome.run?.status).toBe("skipped");
  });

  it("준비 실패 — 끝나지 않은 주차·잘못된 등록·모르는 모델·가드 판정 불가는 단계 없이 exit 1", async () => {
    for (const d of [
      deps({ week: "2026-45" }),
      deps({ stages: [stage("dup", null), stage("dup", null)] }),
      deps({ model: "unknown-model" }),
      deps({ listReportFiles: () => Promise.reject(new Error("EACCES")) }),
    ]) {
      const outcome = await runWeekly(d);
      expect(outcome.exitCode).toBe(1);
      expect(outcome.setupError).not.toBeNull();
      expect(outcome.results).toEqual([]);
    }
  });

  it("단계 문맥 — 대상 주차·구간·LLM 비용 합산·API 호출 수", async () => {
    let seen: { week: string; from: string; cost: number } | null = null;
    const outcome = await runWeekly(
      deps({
        llmMode: "live",
        stages: [
          stage("llm", async (ctx) => {
            ctx.llm.addResults([
              {
                usage: { in: 1000, out: 500, cacheRead: 0, cacheWrite: 0 },
                batch: true,
              },
            ]);
            ctx.apiCalls.add({ apiFootball: 2 });
            seen = {
              week: ctx.week,
              from: ctx.weekRange.from,
              cost: ctx.llm.costSoFar(),
            };
          }),
        ],
      }),
    );
    expect(seen).toMatchObject({
      week: "2026-44",
      from: "2026-10-26T00:00:00.000Z",
    });
    expect(seen!.cost).toBeGreaterThan(0);
    expect(outcome.run).toMatchObject({
      job: "weekly",
      apiCalls: { footballData: 0, apiFootball: 2 },
      tokens: { in: 1000, out: 500 },
    });
    expect(outcome.run!.costUsd).toBe(seen!.cost);
  });
});
