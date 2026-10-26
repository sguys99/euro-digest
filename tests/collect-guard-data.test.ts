/**
 * 수집 가드 data 읽기 — 결과 지연 재시도(판단 순서 6a, PRD §15 D60) 입력 `loadResultsPendingCheck`를 임시 data 폴더로 확인한다.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RunLog } from "@/lib/schema";

import {
  gitHeadCommit,
  loadResultsPendingCheck,
} from "../scripts/lib/collect-guard-data";

// 2026-10-27 07:25 KST(겨울) — 발행일 2026-10-27
const NOW = new Date("2026-10-26T22:25:00Z");
const DATE = "2026-10-27";
const COMMIT = "c307b8812345678901234567890123456789abcd";

let root: string;
let dataDir: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "guard-data-"));
  dataDir = path.join(root, "data");
  await mkdir(path.join(dataDir, "briefs"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function runLog(startedAt: string, status: RunLog["status"]): RunLog {
  return {
    runId: `collect-prod-${startedAt.replace(/[-:.]/g, "").slice(0, 15)}Z-ab12`,
    env: "prod",
    job: "collect",
    startedAt,
    finishedAt: startedAt,
    collected: 0,
    clusters: 0,
    summarized: 0,
    downgraded: 0,
    tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0,
    apiCalls: { footballData: 0, apiFootball: 0 },
    sources: [],
    status,
  };
}

async function writeBrief(content: string): Promise<void> {
  await writeFile(path.join(dataDir, "briefs", `${DATE}.json`), content);
}

async function writeRuns(content: string): Promise<void> {
  await writeFile(path.join(dataDir, "runs.json"), content);
}

const load = (readCommit: (dir: string) => string | null = () => COMMIT) =>
  loadResultsPendingCheck(NOW, { dataDir, readCommit });

describe("loadResultsPendingCheck", () => {
  it("결과 지연 브리핑 + 그날 기록 1건(다른 날·dry 기록은 빼고) → 재시도 입력, 커밋은 data 폴더의 부모에서 읽는다", async () => {
    await writeBrief(
      JSON.stringify({
        date: DATE,
        generatedAt: "2026-10-26T22:18:00.000Z",
        runId: "collect-prod-20261026T221030Z-ab12",
        mode: "empty",
        emptyReason: "results-pending",
        lines: [],
      }),
    );
    await writeRuns(
      JSON.stringify([
        runLog("2026-10-25T22:10:00.000Z", "success"), // 10-26
        runLog("2026-10-26T22:10:30.000Z", "success"), // 10-27 07:10 KST
        runLog("2026-10-26T22:12:00.000Z", "skipped"), // dry
      ]),
    );
    const seen: string[] = [];
    const check = await load((dir) => {
      seen.push(dir);
      return COMMIT;
    });
    expect(check).toEqual({
      brief: {
        date: DATE,
        state: "results-pending",
        detail: "empty(results-pending)",
      },
      attempts: 1,
      dataCommit: COMMIT,
    });
    expect(seen).toEqual([root]);
  });

  it("브리핑 파일·실행 기록이 없으면 missing · 시도 0건", async () => {
    expect(await load(() => null)).toEqual({
      brief: { date: DATE, state: "missing", detail: "파일 없음" },
      attempts: 0,
      dataCommit: null,
    });
  });

  it("깨진 브리핑은 unreadable(재시도 안 함), 깨진 runs.json은 attempts null + 오류 한 줄 — 던지지 않는다", async () => {
    await writeBrief("{ not json");
    await writeRuns("[{");
    const check = await load();
    expect(check.brief).toMatchObject({ state: "unreadable" });
    expect(check.brief.detail).toContain("JSON");
    expect(check.attempts).toBeNull();
    expect(check.runsError).toContain("runs.json");
    expect(check.runsError).not.toContain("\n");
  });

  it("다른 날짜를 담은 브리핑(파일명 불일치)도 unreadable", async () => {
    await writeBrief(
      JSON.stringify({
        date: "2026-10-26",
        generatedAt: "2026-10-26T22:18:00.000Z",
        runId: "x",
        mode: "empty",
        emptyReason: "results-pending",
        lines: [],
      }),
    );
    expect((await load()).brief.state).toBe("unreadable");
  });
});

describe("gitHeadCommit", () => {
  it("저장소면 40자리 커밋, 없는 폴더면 null", () => {
    const repo = path.dirname(
      path.dirname(fileURLToPath(new URL(import.meta.url))),
    );
    expect(gitHeadCommit(repo)).toMatch(/^[0-9a-f]{40}$/);
    expect(gitHeadCommit(path.join(root, "nowhere"))).toBeNull();
  });
});
