/**
 * 실패 실행 기록 보존 (M1-27 — FR-151·FR-152·FR-11, CLAUDE.md §1-4) — scripts/lib/run-preserve.ts.
 * 러너 작업 트리(이번 실행이 쓴 data/)와 main 최신 작업 트리를 임시 폴더 두 개로 흉내 낸다. git 단계(fetch·reset·commit·push)는
 * 워크플로 셸이라 tests/collect-workflow.test.ts가 구조를 고정한다.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RunsFileSchema, type RunLog } from "@/lib/schema";

import { planCollectWindow } from "../scripts/lib/collect-window";
import { buildRunLog } from "../scripts/lib/cost";
import {
  applyPreserved,
  failedRunRecord,
  isLedgerPath,
  NOT_PRESERVED_PATHS,
  PRESERVE_COMMIT_PATHS,
  PRESERVE_PENDING_PATH,
  RUN_ID_PATTERN,
  savePreserved,
} from "../scripts/lib/run-preserve";
import { assessSourceHealth } from "../scripts/lib/source-health";
import { readValidationSnapshot } from "../scripts/lib/validate-fs";
import {
  buildValidationReport,
  validationExitCode,
} from "../scripts/lib/validate-report";
import { checkJsonFile } from "../scripts/lib/validate-schema";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const FIXTURE_DATA = path.join(ROOT, "fixtures/schema/data");

const PREV_ID = "collect-prod-20261015T213000Z-0a1b";
const RUN_ID = "collect-prod-20261016T213000Z-3fa2";

function run(
  over: Partial<RunLog> & Pick<RunLog, "runId" | "startedAt">,
): RunLog {
  return buildRunLog({
    env: "prod",
    job: "collect",
    model: "claude-haiku-5-5",
    runId: over.runId,
    startedAt: over.startedAt,
    finishedAt: over.finishedAt ?? over.startedAt,
    status: over.status ?? "success",
    collected: 120,
    clusters: 30,
    summarized: 0,
    downgraded: 0,
    usage: {
      batch: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
      single: { in: 3200, out: 1300, cacheRead: 0, cacheWrite: 0 },
    },
    apiCalls: over.apiCalls ?? { footballData: 7, apiFootball: 24 },
    sources: over.sources ?? [
      { id: "bbc-sport-football", ok: true, items: 80, usable: 12 },
      { id: "espn-soccer", ok: false, items: 0, error: "http-5xx" },
    ],
    now: new Date("2026-10-17T00:00:00.000Z"),
  });
}

const prev = run({
  runId: PREV_ID,
  startedAt: "2026-10-15T21:30:00.000Z",
});
const current = run({
  runId: RUN_ID,
  startedAt: "2026-10-16T21:30:00.000Z",
  status: "partial",
});

let tmp: string;
let runner: string;
let main: string;
let dir: string;

function write(root: string, rel: string, text: string): void {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text, "utf8");
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function read(root: string, rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function fixture(rel: string): string {
  return readFileSync(path.join(FIXTURE_DATA, rel), "utf8");
}

/** 기준 커밋(main) 상태 — 직전 실행 기록 + 원장·이월 */
function seedBase(root: string): void {
  write(root, "data/runs.json", json([prev]));
  write(root, "data/matches/meta.json", fixture("matches/meta.json"));
  write(root, "data/cache/af-pending.json", fixture("cache/af-pending.json"));
  write(root, "data/cache/seen-urls.json", fixture("cache/seen-urls.json"));
}

/** 러너 작업 트리 — 기준 + 이번 실행이 쓴 파일(실행 기록·새 달 원장·뉴스·브리핑·기억) */
function seedRunner(root: string): void {
  seedBase(root);
  write(root, "data/runs.json", json([prev, current]));
  write(root, "data/matches/2026-10.json", fixture("matches/2026-10.json"));
  // M2-09 팀시트 백필 기억 — 결과(data/teams)가 보존되지 않으므로 기억도 보존하지 않는다(NOT_PRESERVED_PATHS)
  write(
    root,
    "data/cache/lineup-backfill.json",
    json({
      updatedAt: "2026-10-30T22:12:00Z",
      fixtures: [{ id: 1639860, at: "2026-10-30T22:12:00Z" }],
    }),
  );
  write(root, "data/news/2026-10-17.json", fixture("news/2026-10-10.json"));
  write(root, "data/briefs/2026-10-17.json", '{"date":"2026-10-17"}\n');
  write(root, "data/cache/seen-urls.json", '{"changed":true}\n');
  write(root, "data/cache/unknown-names.json", '{"changed":true}\n');
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "run-preserve-"));
  runner = path.join(tmp, "runner");
  main = path.join(tmp, "main");
  dir = path.join(tmp, "preserve");
  seedRunner(runner);
  seedBase(main);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("failedRunRecord — 발행되지 않은 실행의 기록", () => {
  it("success·partial은 failed로, failed·skipped(prod dry)는 그대로 — 나머지 필드(토큰·비용·호출 수·소스)는 그대로", () => {
    for (const status of ["success", "partial", "failed"] as const) {
      const record = failedRunRecord({ ...current, status });
      expect(record).toEqual({ ...current, status: "failed" });
    }
    const dry = { ...current, status: "skipped" as const };
    expect(failedRunRecord(dry)).toBe(dry);
  });

  it("상태를 바꾼 기록은 수집 시간 창의 '직전 발행 실행'이 되지 않는다 — 그대로 두면 다음 실행이 이 실행 창의 기사를 건너뛴다", () => {
    const now = "2026-10-17T21:30:00.000Z";
    const sourceIds = ["bbc-sport-football"];
    const asIs = planCollectWindow({
      now,
      runs: { ok: true, runs: [prev, current] },
      sourceIds,
    });
    const preserved = planCollectWindow({
      now,
      runs: { ok: true, runs: [prev, failedRunRecord(current)] },
      sourceIds,
    });
    expect(asIs.lastRun?.runId).toBe(RUN_ID);
    expect(preserved.lastRun?.runId).toBe(PREV_ID);
    expect(preserved.start).toBe("2026-10-15T18:30:00.000Z"); // 직전 발행 − 겹침 3시간
  });

  it("소스 건강도는 보존한 실패 실행도 센다(M1-11 이월 — 실패 실행이 연속에서 빠지지 않게)", () => {
    const failing = (runId: string, startedAt: string): RunLog =>
      failedRunRecord(
        run({
          runId,
          startedAt,
          sources: [
            { id: "espn-soccer", ok: false, items: 0, error: "http-5xx" },
            { id: "bbc-sport-football", ok: true, items: 80, usable: 3 },
          ],
        }),
      );
    const [espn] = assessSourceHealth({
      run: { runId: "now", startedAt: "2026-10-17T21:30:00.000Z" },
      current: [
        { id: "espn-soccer", ok: false, items: 0, error: "http-5xx" },
        { id: "bbc-sport-football", ok: true, items: 80, usable: 5 },
      ],
      history: [
        failing(
          "collect-prod-20261015T213000Z-aaaa",
          "2026-10-15T21:30:00.000Z",
        ),
        failing(
          "collect-prod-20261016T213000Z-bbbb",
          "2026-10-16T21:30:00.000Z",
        ),
      ],
    });
    expect(espn!.event).toMatchObject({ type: "failing-streak", streak: 3 });
  });
});

describe("savePreserved → applyPreserved", () => {
  it("러너의 이번 실행 기록(상태 failed)·원장·이월만 보관하고, 뉴스·브리핑·seen-urls·unknown-names는 보관하지 않는다", async () => {
    const { manifest } = await savePreserved({
      rootDir: runner,
      runId: RUN_ID,
      dir,
    });
    expect(manifest).toMatchObject({
      runId: RUN_ID,
      originalStatus: "partial",
      record: { runId: RUN_ID, status: "failed", costUsd: current.costUsd },
      ledgerFiles: [
        "data/matches/2026-10.json",
        "data/matches/meta.json",
        PRESERVE_PENDING_PATH,
      ],
      ledgerInvalid: null,
    });
    const saved = readdirSync(path.join(dir, "files"), {
      recursive: true,
    }).map(String);
    for (const kept of NOT_PRESERVED_PATHS) {
      expect(saved.some((f) => f.startsWith(kept.replace(/^data\//, "")))).toBe(
        false,
      );
    }
    expect(manifest.ledgerFiles.every(isLedgerPath)).toBe(true);
  });

  it("apply(--with-ledger): main runs.json에 1건 더하고(정렬·스키마), 원장·이월을 러너 내용으로 — 결과 파일이 검증 게이트의 data 스키마를 통과", async () => {
    await savePreserved({ rootDir: runner, runId: RUN_ID, dir });
    const result = await applyPreserved({
      rootDir: main,
      dir,
      withLedger: true,
      now: new Date("2026-10-17T00:00:00.000Z"),
    });
    expect(result).toMatchObject({
      record: "appended",
      ledger: "copied",
      written: [
        "data/runs.json",
        "data/matches/2026-10.json",
        "data/matches/meta.json",
        PRESERVE_PENDING_PATH,
      ],
    });
    const runs = RunsFileSchema.parse(JSON.parse(read(main, "data/runs.json")));
    expect(runs.map((r) => [r.runId, r.status])).toEqual([
      [PREV_ID, "success"],
      [RUN_ID, "failed"],
    ]);
    expect(runs[1]).toEqual({ ...current, status: "failed" });
    for (const rel of result.written) {
      const check = checkJsonFile(rel, read(main, rel), { stage: "data" });
      expect([rel, check.issues]).toEqual([rel, []]);
      expect(read(main, rel)).toBe(
        rel === "data/runs.json" ? read(main, rel) : read(runner, rel),
      );
    }
    // 커밋하지 않는 산출물은 main 작업 트리에 생기지 않는다(커밋된 기억 ⊂ 커밋된 카드)
    expect(existsSync(path.join(main, "data/news"))).toBe(false);
    expect(existsSync(path.join(main, "data/briefs"))).toBe(false);
    expect(read(main, "data/cache/seen-urls.json")).toBe(
      fixture("cache/seen-urls.json"),
    );
    expect(existsSync(path.join(main, "data/cache/unknown-names.json"))).toBe(
      false,
    );
    expect(
      result.written.every((rel) =>
        PRESERVE_COMMIT_PATHS.some((p) => rel === p || rel.startsWith(`${p}/`)),
      ),
    ).toBe(true);
  });

  it("보존 커밋 뒤의 main 트리는 `npm run validate`(ci.yml과 같은 — 발행일 지정 없음)를 통과한다 — 검증 게이트에 실패한 실행의 기록도", async () => {
    cpSync(path.join(ROOT, "configs"), path.join(main, "configs"), {
      recursive: true,
    });
    await savePreserved({ rootDir: runner, runId: RUN_ID, dir });
    await applyPreserved({ rootDir: main, dir, withLedger: true });
    const report = buildValidationReport(
      readValidationSnapshot(main, { configsOnly: false }),
      { configsOnly: false, now: new Date("2026-10-16T21:40:00.000Z") },
    );
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(validationExitCode(report)).toBe(0);
  });

  it("apply(--with-ledger 없음 — main의 원장·이월이 기준 커밋 뒤로 바뀜): 실행 기록만 더하고 원장·이월은 덮지 않는다", async () => {
    await savePreserved({ rootDir: runner, runId: RUN_ID, dir });
    const before = read(main, PRESERVE_PENDING_PATH);
    const result = await applyPreserved({
      rootDir: main,
      dir,
      withLedger: false,
    });
    expect(result).toMatchObject({
      record: "appended",
      ledger: "skipped",
      written: ["data/runs.json"],
    });
    expect(read(main, PRESERVE_PENDING_PATH)).toBe(before);
    expect(existsSync(path.join(main, "data/matches/2026-10.json"))).toBe(
      false,
    );
  });

  it("main에 이미 같은 실행이 있으면(커밋 단계가 push한 뒤 실패) 아무것도 쓰지 않는다", async () => {
    await savePreserved({ rootDir: runner, runId: RUN_ID, dir });
    write(main, "data/runs.json", json([prev, current]));
    const before = read(main, "data/runs.json");
    const result = await applyPreserved({
      rootDir: main,
      dir,
      withLedger: true,
    });
    expect(result).toMatchObject({
      record: "already",
      ledger: "none",
      written: [],
    });
    expect(read(main, "data/runs.json")).toBe(before);
    expect(existsSync(path.join(main, "data/matches/2026-10.json"))).toBe(
      false,
    );
  });

  it("러너 runs.json에 그 실행이 없으면 보관할 기록이 없다 — apply는 none", async () => {
    const other = "collect-prod-20261016T220000Z-ffff";
    const { manifest } = await savePreserved({
      rootDir: runner,
      runId: other,
      dir,
    });
    expect(manifest).toMatchObject({ record: null, ledgerFiles: [] });
    const before = read(main, "data/runs.json");
    const result = await applyPreserved({
      rootDir: main,
      dir,
      withLedger: true,
    });
    expect(result).toMatchObject({
      record: "none",
      ledger: "none",
      written: [],
    });
    expect(read(main, "data/runs.json")).toBe(before);
  });

  it("원장·이월 중 하나라도 스키마를 통과하지 못하면 원장·이월은 보관하지 않고 실행 기록만(깨진 파일을 main에 넣지 않는다)", async () => {
    write(runner, "data/matches/meta.json", '{"season":"broken"}\n');
    const { manifest } = await savePreserved({
      rootDir: runner,
      runId: RUN_ID,
      dir,
    });
    expect(manifest.ledgerFiles).toEqual([]);
    expect(manifest.ledgerInvalid).toMatch(/^data\/matches\/meta\.json: /);
    const result = await applyPreserved({
      rootDir: main,
      dir,
      withLedger: true,
    });
    expect(result).toMatchObject({
      record: "appended",
      ledger: "invalid",
      written: ["data/runs.json"],
    });
    expect(read(main, "data/matches/meta.json")).toBe(
      fixture("matches/meta.json"),
    );
  });

  it("원장·이월이 없는 실행(정기 운영 전 — COLLECT_ENABLED 꺼짐)은 실행 기록만", async () => {
    rmSync(path.join(runner, "data/matches"), { recursive: true });
    rmSync(path.join(runner, PRESERVE_PENDING_PATH));
    const { manifest } = await savePreserved({
      rootDir: runner,
      runId: RUN_ID,
      dir,
    });
    expect(manifest.ledgerFiles).toEqual([]);
    const result = await applyPreserved({
      rootDir: main,
      dir,
      withLedger: true,
    });
    expect(result).toMatchObject({ record: "appended", ledger: "none" });
  });

  it("runId 형식이 아니면 보관하지 않는다(출력 주입·오타 방지), 러너 runs.json이 깨졌으면 던진다", async () => {
    expect(RUN_ID_PATTERN.test(RUN_ID)).toBe(true);
    expect(RUN_ID_PATTERN.test("collect-prod-20261016T213000Z-3fa2\nx")).toBe(
      false,
    );
    await expect(
      savePreserved({ rootDir: runner, runId: "../../etc", dir }),
    ).rejects.toThrow(/runId 형식/);
    write(runner, "data/runs.json", "{broken");
    await expect(
      savePreserved({ rootDir: runner, runId: RUN_ID, dir }),
    ).rejects.toThrow(/JSON 파싱 실패/);
  });

  it("보관 목록에 원장·이월 밖 경로가 끼어들면 덮지 않고 던진다(보관 폴더 변조 방지)", async () => {
    await savePreserved({ rootDir: runner, runId: RUN_ID, dir });
    const manifestPath = path.join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      ledgerFiles: string[];
    };
    manifest.ledgerFiles.push("data/cache/seen-urls.json");
    writeFileSync(manifestPath, json(manifest), "utf8");
    await expect(
      applyPreserved({ rootDir: main, dir, withLedger: true }),
    ).rejects.toThrow(/원장·이월 경로가 아니다/);
    expect(isLedgerPath("data/cache/seen-urls.json")).toBe(false);
    expect(isLedgerPath("data/matches/../news/2026-10-17.json")).toBe(false);
    expect(isLedgerPath("data/matches/sub/2026-10.json")).toBe(false);
    expect(isLedgerPath("data/matches/2026-10.json")).toBe(true);
  });
});
