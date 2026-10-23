/**
 * M1-37 — 5줄 자리 상태(src/lib/brief-slot.ts `briefSlotOf`, 로더 src/lib/data/brief.ts `loadBriefSlot`·`listBriefDates`)
 * (PRD DR-07 오류 상태 · §15 D38, DESIGN §9.3 상태 화면 ③ — M1-32 이월 메모).
 *
 * 오류 상태(`missing`)는 **사실이 확인될 때만**: 브리핑 파일 없음 + 그 호가 첫 브리핑 파일 날짜 뒤 + 그날 게시 실행(prod collect
 * success·partial, startedAt의 KST 날짜 = 발행일) 기록 있음. 그 밖(D38 전 호 · 브리핑 파일이 하나도 없음 · 실행 기록 없음 · 실패·건너뛴
 * 실행만 · dev 실행)은 블록 없음.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { briefSlotOf } from "@/lib/brief-slot";
import { listBriefDates, loadBriefSlot } from "@/lib/data/brief";
import type { BriefFile } from "@/lib/schema/brief";
import type { RunLog } from "@/lib/schema/run";

function run(over: Partial<RunLog>): RunLog {
  return {
    runId: "collect-prod-20261024T221000Z-0001",
    env: "prod",
    job: "collect",
    // 2026-10-25 07:10 KST — 발행일 10-25
    startedAt: "2026-10-24T22:10:00.000Z",
    finishedAt: "2026-10-24T22:14:00.000Z",
    collected: 30,
    clusters: 30,
    summarized: 0,
    downgraded: 0,
    tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0,
    apiCalls: { footballData: 1, apiFootball: 0 },
    sources: [],
    status: "partial",
    ...over,
  };
}

const BRIEF: BriefFile = {
  date: "2026-10-25",
  generatedAt: "2026-10-24T22:12:00.000Z",
  runId: "collect-prod-20261024T221000Z-0001",
  mode: "empty",
  lines: [],
};

const DATES = ["2026-10-17", "2026-10-18", "2026-10-24"];

describe("briefSlotOf", () => {
  it("파일이 있으면 브리핑(실행 기록과 무관)", () => {
    expect(
      briefSlotOf({
        date: "2026-10-25",
        brief: BRIEF,
        briefDates: [],
        runs: [],
      }),
    ).toEqual({ kind: "brief", brief: BRIEF });
  });

  it("파일 없음 + 첫 브리핑 날짜 뒤 + 그날 게시 실행(partial·success) = 오류 상태", () => {
    for (const status of ["partial", "success"] as const) {
      expect(
        briefSlotOf({
          date: "2026-10-25",
          brief: null,
          briefDates: DATES,
          runs: [run({ status })],
        }),
      ).toEqual({ kind: "missing" });
    }
  });

  it("D38 전 호(첫 브리핑 파일 날짜 이하)는 블록 없음 — 날짜는 데이터에서", () => {
    for (const date of ["2026-10-12", "2026-10-14", "2026-10-17"]) {
      expect(
        briefSlotOf({
          date,
          brief: null,
          briefDates: DATES,
          runs: [run({ startedAt: `${date}T00:10:00.000Z` })],
        }),
      ).toEqual({ kind: "none" });
    }
  });

  it("확인되지 않으면 블록 없음 — 실행 기록 없음·다른 날·실패·건너뜀·weekly·브리핑 파일이 하나도 없는 저장소", () => {
    const none = { kind: "none" };
    const base = { date: "2026-10-25", brief: null, briefDates: DATES };
    expect(briefSlotOf({ ...base, runs: [] })).toEqual(none);
    // 10-24 15:00Z = 10-25 00:00 KST 직전(10-24 발행일 실행)
    expect(
      briefSlotOf({
        ...base,
        runs: [run({ startedAt: "2026-10-24T14:59:59.000Z" })],
      }),
    ).toEqual(none);
    expect(briefSlotOf({ ...base, runs: [run({ status: "failed" })] })).toEqual(
      none,
    );
    expect(
      briefSlotOf({ ...base, runs: [run({ status: "skipped" })] }),
    ).toEqual(none);
    expect(briefSlotOf({ ...base, runs: [run({ job: "weekly" })] })).toEqual(
      none,
    );
    expect(briefSlotOf({ ...base, briefDates: [], runs: [run({})] })).toEqual(
      none,
    );
  });
});

describe("loadBriefSlot · listBriefDates (data/briefs 폴더)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "briefs-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("폴더가 없으면 빈 목록 · 날짜 파일만 오름차순", () => {
    expect(listBriefDates(path.join(dir, "none"))).toEqual([]);
    mkdirSync(path.join(dir, "b"));
    for (const name of [
      "2026-10-24.json",
      "2026-10-17.json",
      "README.md",
      "x.json",
    ]) {
      writeFileSync(path.join(dir, "b", name), "{}");
    }
    expect(listBriefDates(path.join(dir, "b"))).toEqual([
      "2026-10-17",
      "2026-10-24",
    ]);
  });

  it("파일이 있으면 브리핑, 없으면 목록·실행 기록으로 판정", () => {
    writeFileSync(
      path.join(dir, "2026-10-24.json"),
      JSON.stringify({ ...BRIEF, date: "2026-10-24" }),
    );
    expect(loadBriefSlot("2026-10-24", dir, () => []).kind).toBe("brief");
    expect(loadBriefSlot("2026-10-25", dir, () => [run({})])).toEqual({
      kind: "missing",
    });
    expect(loadBriefSlot("2026-10-25", dir, () => [])).toEqual({
      kind: "none",
    });
  });
});
