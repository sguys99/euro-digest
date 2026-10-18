/**
 * 실행 기록 로더 — data/runs.json (M1-30, src/lib/data/runs.ts)
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadProdRuns, RUNS_FILE } from "@/lib/data/runs";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "runs-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const RUN = {
  runId: "collect-prod-20261017T125647Z-8161",
  env: "prod",
  job: "collect",
  startedAt: "2026-10-17T12:56:47.182Z",
  finishedAt: "2026-10-17T12:58:22.800Z",
  collected: 1,
  clusters: 1,
  summarized: 0,
  downgraded: 0,
  tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
  costUsd: 0,
  apiCalls: { footballData: 0, apiFootball: 0 },
  sources: [],
  status: "success",
};

describe("loadProdRuns", () => {
  // 저장소 data/runs.json(봇이 매일 바꾸는 파일)은 읽지 않는다 — 경로만 본다. 내용 검증은 npm run validate
  it("기본 위치는 저장소 data/runs.json", () => {
    expect(path.relative(process.cwd(), RUNS_FILE)).toBe(
      path.join("data", "runs.json"),
    );
  });

  it("파일이 없으면 빈 배열", () => {
    expect(loadProdRuns(path.join(dir, "runs.json"))).toEqual([]);
  });

  it("검증한 실행 기록을 파일 순서대로 돌려준다", () => {
    const file = path.join(dir, "runs.json");
    writeFileSync(file, JSON.stringify([RUN]));
    expect(loadProdRuns(file)).toEqual([RUN]);
  });

  it("JSON이 깨졌으면 던진다(빌드 실패 — 마지막 방어선)", () => {
    const file = path.join(dir, "runs.json");
    writeFileSync(file, "[{");
    expect(() => loadProdRuns(file)).toThrow(/JSON을 읽을 수 없음/);
  });

  it("dev 실행이 섞이면 던진다(runs.json = prod만)", () => {
    const file = path.join(dir, "runs.json");
    writeFileSync(file, JSON.stringify([{ ...RUN, env: "dev" }]));
    expect(() => loadProdRuns(file)).toThrow(/스키마 검증 실패/);
  });
});
