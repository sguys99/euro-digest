// 실행 기록 180일 보존 (M5-10, PRD FR-158·§8.4, CLAUDE.md §8) — scripts/lib/cost.ts pruneRuns·appendRun
//
// 보존 정리는 appendRun이 쓸 때마다 한다(collect·weekly·preserve-run·dev 실호출 기록 모두 같은 경로). 이 파일은
// 정리가 "최근 데이터만 쓰는" 집계를 바꾸지 않는다는 것을 확인한다:
//   - 월 비용 가드(cost.ts monthToDate·todayTotal — prod+dev 합산, KST 달·날짜)
//   - 운영 지표(src/lib/ops-metrics.ts — /status 30일 실행 성공률·월 사용률·마지막 발행)
// 180일 > 한 달(최대 31일)·30일 창이므로 정리 전후 값이 같아야 한다.
import * as fsPromises from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  collectRunStats,
  lastPublication,
  monthBudgetUsage,
} from "@/lib/ops-metrics";
import { RunsFileSchema, type RunLog } from "@/lib/schema";
import { kstMonth, shiftDate } from "@/lib/time";

import {
  appendRun,
  monthToDate,
  pruneRuns,
  RUNS_RETENTION_DAYS,
  runsPathFor,
  todayTotal,
  type RunsFileIo,
} from "../scripts/lib/cost";

const DAY_MS = 24 * 60 * 60 * 1000;

function makeRun(
  over: Partial<RunLog> &
    Pick<RunLog, "runId" | "env" | "startedAt" | "costUsd">,
): RunLog {
  return {
    job: "collect",
    finishedAt: over.startedAt,
    collected: 0,
    clusters: 0,
    summarized: 0,
    downgraded: 0,
    tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    apiCalls: { footballData: 0, apiFootball: 0 },
    sources: [],
    status: "success",
    ...over,
  };
}

/**
 * 기준 시각 전 `days`일 동안 매일 06:30 KST(21:30Z 전날) prod collect 1건 + 사흘마다 dev 1건.
 * 닷새마다 failed, 이레마다 partial — 성공률이 1이 아니게. 비용은 날마다 달라 합이 우연히 같아지지 않게.
 */
function history(now: Date, days: number): RunLog[] {
  const runs: RunLog[] = [];
  for (let i = 0; i < days; i += 1) {
    const at = new Date(now.getTime() - (i + 1) * DAY_MS);
    at.setUTCHours(21, 30, 0, 0);
    const startedAt = at.toISOString();
    const status: RunLog["status"] =
      i % 5 === 0 ? "failed" : i % 7 === 0 ? "partial" : "success";
    runs.push(
      makeRun({
        runId: `prod-collect-${i}`,
        env: "prod",
        startedAt,
        finishedAt: new Date(at.getTime() + 4 * 60_000).toISOString(),
        costUsd: Math.round((0.001 + (i % 13) * 0.0007) * 1e6) / 1e6,
        status,
      }),
    );
    if (i % 3 === 0) {
      runs.push(
        makeRun({
          runId: `dev-${i}`,
          env: "dev",
          startedAt: new Date(at.getTime() + 2 * 60 * 60_000).toISOString(),
          costUsd: 0.0123,
        }),
      );
    }
  }
  return runs;
}

/** 기준 시각들 — 달 첫날·말일, 유럽 서머타임 전환 주변, 연말연시 */
const NOWS = [
  "2027-04-30T23:00:00.000Z", // 05-01 08:00 KST — KST 달 첫날
  "2027-03-31T14:00:00.000Z", // 03-31 23:00 KST — 말일
  "2027-03-28T00:30:00.000Z", // 서머타임 시작일
  "2026-10-25T02:00:00.000Z", // 서머타임 끝
  "2027-01-01T00:00:00.000Z", // 01-01 09:00 KST
].map((iso) => new Date(iso));

describe("runs 180일 보존 — 월 비용·30일 성공률은 정리 전후가 같다 (M5-10)", () => {
  it("보존 일수는 180일이다(PRD §8.4)", () => {
    expect(RUNS_RETENTION_DAYS).toBe(180);
  });

  for (const now of NOWS) {
    it(`기준 ${now.toISOString()}: 250일 기록 중 180일 밖만 빠지고 집계는 그대로`, () => {
      const all = history(now, 250);
      const kept = pruneRuns(all, now);
      // 정리가 실제로 일어났다(대조가 공허하지 않게)
      expect(kept.length).toBeLessThan(all.length);
      expect(kept.length).toBeGreaterThan(0);
      const oldestKept = shiftDate(
        new Date(now.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 10),
        -(RUNS_RETENTION_DAYS - 1),
      );
      for (const run of kept) {
        const kst = new Date(Date.parse(run.startedAt) + 9 * 60 * 60_000)
          .toISOString()
          .slice(0, 10);
        expect(kst >= oldestKept).toBe(true);
      }

      // 월 비용 가드 · 오늘 사용액(cost.ts)
      expect(monthToDate(kept, now)).toEqual(monthToDate(all, now));
      expect(todayTotal(kept, now)).toEqual(todayTotal(all, now));
      // 이번 달 사용액이 0이 아니어야 대조가 의미 있다(달 첫날 08:00 KST는 그날 실행 전이라 0일 수 있어 전날 달도 본다)
      const asOf = now.toISOString();
      const thisMonth = kstMonth(asOf);
      const prevMonth = kstMonth(
        new Date(now.getTime() - 3 * DAY_MS).toISOString(),
      );
      for (const month of new Set([thisMonth, prevMonth])) {
        const before = monthBudgetUsage(all, month, asOf, 3);
        expect(monthBudgetUsage(kept, month, asOf, 3)).toEqual(before);
      }
      expect(monthBudgetUsage(all, prevMonth, asOf, 3).total).toBeGreaterThan(
        0,
      );

      // /status 30일 실행 성공률(실행 기준 — D71) · 마지막 발행
      const span = {
        from: new Date(now.getTime() - 30 * DAY_MS).toISOString(),
        to: asOf,
      };
      const stats = collectRunStats(all, span);
      expect(stats.runs).toBeGreaterThanOrEqual(29);
      expect(stats.rate).not.toBe(1);
      expect(collectRunStats(kept, span)).toEqual(stats);
      expect(lastPublication(kept, asOf)).toEqual(lastPublication(all, asOf));
    });
  }
});

describe("appendRun — 쓸 때마다 180일 밖 기록을 지운다 (M5-10)", () => {
  const tmpDirs: string[] = [];
  afterEach(() => {
    while (tmpDirs.length > 0) {
      rmSync(tmpDirs.pop()!, { recursive: true, force: true });
    }
  });
  const realIo: RunsFileIo = {
    readFile: (f, e) => fsPromises.readFile(f, e),
    writeFile: (f, d, e) => fsPromises.writeFile(f, d, e),
    rename: (a, b) => fsPromises.rename(a, b),
    rm: (f, o) => fsPromises.rm(f, o),
    mkdir: (d, o) => fsPromises.mkdir(d, o),
  };

  it("오래된 prod 기록이 있는 runs.json에 1건 추가 → 180일 밖만 빠지고 이번 달 합계는 같다", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-retention-"));
    tmpDirs.push(dir);
    const now = new Date("2027-04-30T23:00:00.000Z");
    const prior = history(now, 250).filter((r) => r.env === "prod");
    const file = runsPathFor("prod", dir);
    await fsPromises.writeFile(file, `${JSON.stringify(prior, null, 2)}\n`);

    const entry = makeRun({
      runId: "prod-collect-new",
      env: "prod",
      startedAt: "2027-04-30T21:30:00.000Z",
      costUsd: 0.0042,
    });
    const result = await appendRun(file, entry, { now, io: realIo });
    const expectedKept = pruneRuns([...prior, entry], now);
    expect(result.pruned).toBe(prior.length + 1 - expectedKept.length);
    expect(result.pruned).toBeGreaterThan(0);

    const written = RunsFileSchema.parse(
      JSON.parse(await fsPromises.readFile(file, "utf8")),
    );
    expect(written.map((r) => r.runId).sort()).toEqual(
      expectedKept.map((r) => r.runId).sort(),
    );
    expect(monthToDate(written, now)).toEqual(
      monthToDate([...prior, entry], now),
    );
  });
});
