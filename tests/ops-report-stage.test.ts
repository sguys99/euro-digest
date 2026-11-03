/**
 * 주간 작업 단계 ④ 운영 리포트 (M5-09 — scripts/lib/ops-report-stage.ts, PRD FR-155)
 * 임시 data/ 폴더로 입력 읽기 → dry는 출력만 · payload 파일 기록(다음 워크플로 단계가 이슈) · 깨진 브리핑 격리 · 깨진 실행 기록은 단계 실패 ·
 * data/에 쓰지 않음 · LLM·네트워크·예산 조회 없음
 */
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildIssue,
  OpsReportPayloadSchema,
} from "../scripts/lib/github-issues";
import { createLogger } from "../scripts/lib/logger";
import { runOpsReport } from "../scripts/lib/ops-report-stage";
import {
  WEEKLY_STAGES,
  type WeeklyStageContext,
} from "../scripts/lib/weekly-stages";

import type { RunLog } from "@/lib/schema/run";

const NOW = new Date("2026-11-01T23:05:00.000Z");

function run(over: Partial<RunLog>): RunLog {
  return {
    runId: "collect-prod-20261027T221000Z-0001",
    env: "prod",
    job: "collect",
    startedAt: "2026-10-27T22:10:00.000Z",
    finishedAt: "2026-10-27T22:14:00.000Z",
    collected: 10,
    clusters: 10,
    summarized: 5,
    downgraded: 0,
    tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0.003,
    apiCalls: { footballData: 0, apiFootball: 0 },
    sources: [{ id: "alpha", ok: true, items: 10, usable: 3 }],
    status: "success",
    brief: { requests: 1 },
    ...over,
  };
}

let root: string;
let dataDir: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "ops-report-stage-"));
  dataDir = path.join(root, "data");
  await mkdir(path.join(dataDir, "briefs"), { recursive: true });
  await mkdir(path.join(dataDir, "cache"), { recursive: true });
  await writeFile(
    path.join(dataDir, "runs.json"),
    JSON.stringify([run({})]),
    "utf8",
  );
  await writeFile(path.join(dataDir, "runs-dev.json"), "[]", "utf8");
  await writeFile(
    path.join(dataDir, "briefs", "2026-10-28.json"),
    JSON.stringify({
      date: "2026-10-28",
      generatedAt: "2026-10-27T22:13:00.000Z",
      runId: "collect-prod-20261027T221000Z-0001",
      mode: "llm",
      lines: [{ text: "인테르가 이겼다.", ai: true, refs: ["m1001"] }],
    }),
    "utf8",
  );
  // 깨진 브리핑 — 그날만 '읽기 실패'
  await writeFile(path.join(dataDir, "briefs", "2026-10-29.json"), "{", "utf8");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function harness(over: { dry?: boolean; file?: string | null } = {}) {
  const printed: string[] = [];
  const logs: string[] = [];
  const ctx: WeeklyStageContext = {
    rootDir: root,
    dataDir,
    week: "2026-44",
    weekRange: {
      from: "2026-10-26T00:00:00.000Z",
      to: "2026-11-01T23:59:59.999Z",
    },
    env: "prod",
    llmMode: "mock",
    dry: over.dry ?? false,
    force: false,
    runId: "weekly-prod-20261101T230500Z-0000",
    startedAt: NOW.toISOString(),
    now: () => NOW,
    signal: new AbortController().signal,
    logger: createLogger({
      scope: "weekly",
      format: "json",
      env: {},
      sink: (line) => logs.push(line),
    }),
    print: (t) => printed.push(t),
    llm: {
      model: "claude-haiku-5-5",
      createClient: () => {
        throw new Error("운영 리포트는 LLM을 부르지 않는다");
      },
      addResults: () => {
        throw new Error("운영 리포트는 LLM 결과가 없다");
      },
      costSoFar: () => 0,
    },
    budget: {
      check: () =>
        Promise.reject(new Error("운영 리포트는 예산 가드를 부르지 않는다")),
      limits: () => ({ dailyBudgetUsd: 0.1, monthlyBudgetUsd: 2 }),
    },
    apiCalls: {
      add: () => {
        throw new Error("운영 리포트는 데이터 API를 부르지 않는다");
      },
    },
    http: {
      fetch: () =>
        Promise.reject(new Error("운영 리포트는 네트워크를 쓰지 않는다")),
      userAgent: "test",
    },
    sources: { add: () => {} },
    opsReportFile: over.file === undefined ? null : over.file,
  };
  return { ctx, printed, logs };
}

describe("runOpsReport", () => {
  it("등록 — 단계 ④, LLM 없음, data/에 쓰지 않음", () => {
    const stage = WEEKLY_STAGES.find((s) => s.id === "ops-report");
    expect(stage).toMatchObject({ task: "M5-09", llm: false, writes: [] });
    expect(stage?.run).toBe(runOpsReport);
  });

  it("payload 파일을 쓰고(스키마 통과) data/는 그대로 — 월 예산은 ctx.budget.limits", async () => {
    const file = path.join(root, "ops-report.json");
    const before = (await readdir(dataDir, { recursive: true })).sort();
    const h = harness({ file });
    const report = await runOpsReport(h.ctx);
    expect(report.note).toContain("2026-W44");
    expect(h.printed).toEqual([]);
    const payload = OpsReportPayloadSchema.parse(
      JSON.parse(await readFile(file, "utf8")),
    );
    expect(payload.week).toBe("2026-W44");
    const cost = payload.sections.find((s) => s.heading === "비용")?.body ?? "";
    expect(cost).toContain("월 예산 대비");
    // 0.003 / 2 = 0.15%
    expect(cost).toContain(
      "| 2026-10 | 월 전체 | $0.003000 | $0.000000 | $0.003000 | 0.1% | 0.0% |",
    );
    const brief =
      payload.sections.find((s) => s.heading === "브리핑")?.body ?? "";
    expect(brief).toContain("| 10.28 (수) | LLM | 1 | 0 | 1 |");
    expect(brief).toContain("| 10.29 (목) | 읽기 실패 | 0 | 0 | 0 |");
    expect((await readdir(dataDir, { recursive: true })).sort()).toEqual(
      before,
    );
    expect(h.logs.some((l) => l.includes("weekly.ops-report.built"))).toBe(
      true,
    );
    expect(report.counts).toMatchObject({ ontime: 1, missed: 6 });
  });

  it("dry면 파일을 쓰지 않고 이슈 제목·본문을 출력", async () => {
    const file = path.join(root, "ops-report.json");
    const h = harness({ dry: true, file });
    const report = await runOpsReport(h.ctx);
    expect(report.note).toContain("dry");
    await expect(readFile(file, "utf8")).rejects.toThrow();
    expect(h.printed).toHaveLength(1);
    expect(h.printed[0]).toContain(
      "제목: [운영 리포트] 2026-W44 (2026-10-26 ~ 2026-11-01)",
    );
    expect(h.printed[0]).toContain("이슈를 만들지 않음");
  });

  it("파일 경로가 없으면(로컬) 출력만", async () => {
    const h = harness({ file: null });
    const report = await runOpsReport(h.ctx);
    expect(report.note).toContain("OPS_REPORT_FILE 없음");
    expect(h.printed[0]).toContain("[ops-report] 미리보기");
  });

  it("미리보기 본문은 buildIssue 본문과 같다", async () => {
    const file = path.join(root, "ops-report.json");
    await runOpsReport(harness({ file }).ctx);
    const payload = JSON.parse(await readFile(file, "utf8"));
    const dry = harness({ dry: true });
    await runOpsReport(dry.ctx);
    expect(dry.printed[0]).toContain(
      buildIssue("ops-report", payload, { now: NOW }).body,
    );
  });

  it("실행 기록이 깨졌으면 던진다(단계 실패로 격리)", async () => {
    await writeFile(path.join(dataDir, "runs.json"), "not json", "utf8");
    await expect(runOpsReport(harness().ctx)).rejects.toThrow();
  });
});
