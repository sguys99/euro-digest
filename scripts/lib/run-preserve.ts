/**
 * 실패 실행 기록 보존 (M1-27 — PRD FR-151·FR-152·FR-11, CLAUDE.md §1-4·§6.1·§6.3) — collect.yml `실패 실행 기록 보존` 단계가
 * 부르는 save → (git: main 최신으로) → apply 두 단계. 진입점은 scripts/preserve-run.ts, git 명령은 워크플로 셸이 한다.
 *
 * 왜: 발행되지 않은 prod 실행(뉴스 실패 exit 1 · 검증 게이트 · 빌드 · data 커밋 실패)은 커밋되지 않아 그 실행의 runs.json 기록이
 * 사라졌다 — ① LLM 비용 기록 누락(CLAUDE.md §1-4 — 백업 실행이 그 비용을 모른 채 다시 부른다) ② API-Football 일일 카운터 과소
 * 집계(우리 쪽 카운터 = 기록의 apiCalls, D27) ③ 소스 건강도 연속 횟수·7일 집계가 그 실행을 못 셈(M1-11 이월 — 전체 장애가 며칠
 * 이어져도 failing-streak이 안 됨) ④ 파이프라인 성공률(PRD §11.1)이 실패를 모름.
 *
 * 무엇을 커밋하나 (`PRESERVE_COMMIT_PATHS`)
 *   - data/runs.json — 이번 실행 기록 1건만, **상태를 failed로 바꿔서**(`failedRunRecord`). 판정값이 success·partial이어도 발행은
 *     되지 않았다 — 그대로 두면 수집 시간 창이 이 실행을 '직전 발행 실행'으로 보아(collect-window.ts isPublishedNewsRun) 다음
 *     실행이 이 실행 창의 기사를 건너뛴다(누락). 토큰·비용·호출 수·소스 결과는 그대로다. dry 기록(skipped)은 그대로 둔다.
 *   - data/matches/(원장)·data/cache/af-pending.json(이월) — **함께 커밋한다**(M1-48 이월). 근거: 호출 수는 기록에 남는데 받은
 *     결과를 버리면 같은 날 백업 실행이 그 경기를 다시 받아 일일 계획 상한(60) 안에서 받을 수 있는 경기가 그만큼 줄고, 다음 날은
 *     지난 날짜를 날짜 조회로 다시 받을 수 없다(D27). 원장은 화면이 읽지 않으므로(D33) 발행 게이트와 무관하고, 같은 아침 두 번째
 *     실행은 원장의 같은 창 항목으로 득점자를 잇는다(M1-19). 조건: 각 파일이 레지스트리 스키마를 통과(`checkJsonFile` — 검증 게이트와
 *     같은 스키마)하고, main의 그 경로가 이 실행의 기준 커밋 이후 바뀌지 않았을 때만(워크플로가 `git diff`로 확인 → `--with-ledger`).
 *     하나라도 어긋나면 원장·이월은 빼고 실행 기록만 커밋한다.
 *   - 커밋하지 않는 것(`NOT_PRESERVED_PATHS`): data/news·data/briefs(검증·빌드를 통과하지 못한 발행물), data/cache/seen-urls.json
 *     (커밋된 기억 ⊂ 커밋된 카드 — M1-12 이월: 카드 없이 기억만 남으면 그 기사가 다시는 카드가 되지 않는다),
 *     data/cache/unknown-names.json(다음 실행이 다시 관찰한다). 삭제 단계(M1-25)가 지운 카드·기억도 다음 실행이 다시 지운다.
 *
 * 같은 실행이 이미 main에 있으면(커밋 단계가 push까지 한 뒤 실패) 아무것도 하지 않는다 — 그 커밋에 실행 기록·원장이 이미 있다.
 *
 * 검증: 실행 기록은 cost.ts appendRun(RunLog 스키마·파일 env·중복 runId·180일 정리·정렬 — 파일 전체를 RunsFileSchema로 다시 검사),
 * 원장·이월은 checkJsonFile. 그래서 커밋된 트리의 이 파일들은 `npm run validate`의 data 스키마 검사를 통과한다(이 실행의 뉴스 파일이
 * 없으므로 발행 게이트의 그날 카드 수 하한도 그 실행 파일을 보지 않는다 — 다음 실행이 같은 발행일 파일을 새로 만든다).
 */
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { RunLogSchema, type RunLog } from "@/lib/schema";

import { appendRun, readRuns } from "./cost";
import { checkJsonFile } from "./validate-schema";

// ─── 경로 ────────────────────────────────────────────────────────────────

export const PRESERVE_RUNS_PATH = "data/runs.json";
export const PRESERVE_LEDGER_DIR = "data/matches";
export const PRESERVE_PENDING_PATH = "data/cache/af-pending.json";

/** 실패 실행 커밋 대상(저장소 상대 경로) — collect.yml 단계의 git add 대상과 같다(tests/collect-workflow.test.ts가 대조) */
export const PRESERVE_COMMIT_PATHS = [
  PRESERVE_RUNS_PATH,
  PRESERVE_LEDGER_DIR,
  PRESERVE_PENDING_PATH,
] as const;

/** 실패 실행에서 커밋하지 않는 산출물(머리 주석) */
export const NOT_PRESERVED_PATHS = [
  "data/news",
  "data/briefs",
  "data/cache/seen-urls.json",
  "data/cache/unknown-names.json",
] as const;

/** cost.ts makeRunId 형식 — `<job>-<env>-<시작 UTC>-<4자리 16진수>` */
export const RUN_ID_PATTERN =
  /^(?:collect|weekly)-(?:prod|dev)-\d{8}T\d{6}Z-[0-9a-f]{4}$/;

const MANIFEST_FILE = "manifest.json";
const FILES_DIR = "files";

// ─── 순수 함수 ───────────────────────────────────────────────────────────

/**
 * 발행되지 않은 실행의 기록 — 상태만 failed로(dry 기록 skipped는 그대로). 나머지 필드(토큰·비용·호출 수·소스 결과·시각)는 그대로다.
 */
export function failedRunRecord(run: RunLog): RunLog {
  return run.status === "skipped" ? run : { ...run, status: "failed" };
}

/** 원장 폴더 바로 아래 JSON 파일 하나(하위 폴더·`..` 없음) */
const LEDGER_FILE = /^data\/matches\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.json$/;

/** 원장·이월 경로인가(저장소 상대 경로, `/` 구분) — 원장 폴더 바로 아래 JSON 또는 이월 파일 */
export function isLedgerPath(relPath: string): boolean {
  return (
    relPath === PRESERVE_PENDING_PATH ||
    (LEDGER_FILE.test(relPath) && !relPath.includes(".."))
  );
}

// ─── 보관(save) ─────────────────────────────────────────────────────────

const ManifestSchema = z.strictObject({
  version: z.literal(1),
  runId: z.string().regex(RUN_ID_PATTERN),
  /** 러너 runs.json에서 찾은 이번 실행 기록(상태 failed로 바꾼 것) — 없으면 null */
  record: RunLogSchema.nullable(),
  /** 원래 판정 상태(로그용) */
  originalStatus: RunLogSchema.shape.status.nullable(),
  /** 보관한 원장·이월 파일(저장소 상대 경로) — 검증에 실패했으면 [] */
  ledgerFiles: z.array(z.string()),
  /** 원장·이월을 보관하지 않은 이유(검증 실패) — 보관했거나 파일이 없으면 null */
  ledgerInvalid: z.string().nullable(),
});
export type PreserveManifest = z.infer<typeof ManifestSchema>;

export interface PreserveSaveInput {
  /** 러너 작업 트리(저장소 루트) */
  rootDir: string;
  runId: string;
  /** 보관 폴더(러너 임시 폴더 — 저장소 밖) */
  dir: string;
}

export interface PreserveSaveResult {
  manifest: PreserveManifest;
}

function toRel(...parts: string[]): string {
  return parts.join("/");
}

/** 러너의 원장·이월 파일 목록(저장소 상대 경로, 정렬) — 없으면 [] */
async function listLedgerFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const names = await readdir(path.join(rootDir, PRESERVE_LEDGER_DIR));
    for (const name of [...names].sort()) {
      if (name.endsWith(".json")) files.push(toRel(PRESERVE_LEDGER_DIR, name));
    }
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  try {
    await readFile(path.join(rootDir, PRESERVE_PENDING_PATH), "utf8");
    files.push(PRESERVE_PENDING_PATH);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  return files;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * 러너 작업 트리 → 보관 폴더. 이번 실행 기록(상태 failed)과, 스키마를 통과하면 원장·이월 파일을 옮겨 둔다. 러너 runs.json을
 * 읽지 못하면 던진다(보존할 기록을 정할 수 없다 — 단계 실패로 이슈 메모에 남는다).
 */
export async function savePreserved(
  input: PreserveSaveInput,
): Promise<PreserveSaveResult> {
  if (!RUN_ID_PATTERN.test(input.runId)) {
    throw new Error(
      `runId 형식이 아니다(길이 ${input.runId.length}) — 보존하지 않는다`,
    );
  }
  const runs = await readRuns(path.join(input.rootDir, PRESERVE_RUNS_PATH));
  const found = runs.find((run) => run.runId === input.runId) ?? null;

  let ledgerFiles: string[] = [];
  let ledgerInvalid: string | null = null;
  if (found !== null) {
    const candidates = await listLedgerFiles(input.rootDir);
    const texts = new Map<string, string>();
    for (const rel of candidates) {
      const text = await readFile(path.join(input.rootDir, rel), "utf8");
      const check = checkJsonFile(rel, text, { stage: "data" });
      const error = check.issues.find((issue) => issue.severity === "error");
      if (error) {
        ledgerInvalid = `${rel}: ${error.path ? `${error.path} ` : ""}${error.message}`;
        break;
      }
      texts.set(rel, text);
    }
    if (ledgerInvalid === null) {
      for (const [rel, text] of texts) {
        const target = path.join(input.dir, FILES_DIR, rel);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, text, "utf8");
      }
      ledgerFiles = [...texts.keys()];
    }
  }

  const manifest: PreserveManifest = {
    version: 1,
    runId: input.runId,
    record: found === null ? null : failedRunRecord(found),
    originalStatus: found?.status ?? null,
    ledgerFiles,
    ledgerInvalid,
  };
  await mkdir(input.dir, { recursive: true });
  await writeFile(
    path.join(input.dir, MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return { manifest };
}

// ─── 적용(apply) ────────────────────────────────────────────────────────

export interface PreserveApplyInput {
  /** main 최신으로 맞춘 작업 트리(저장소 루트) */
  rootDir: string;
  dir: string;
  /** main의 원장·이월 경로가 기준 커밋 이후 그대로다(워크플로가 git diff로 확인) — 아니면 원장·이월을 덮지 않는다 */
  withLedger: boolean;
  /** 180일 정리 기준 시각(테스트 주입용) */
  now?: Date;
}

export interface PreserveApplyResult {
  /** appended = 실행 기록을 더했다 · already = main에 이미 있다(커밋 단계가 push함) · none = 보관된 기록이 없다 */
  record: "appended" | "already" | "none";
  /** copied = 원장·이월을 덮었다 · skipped = main이 바뀌어(또는 기준 커밋을 몰라) 덮지 않음 · invalid = 스키마 오류로 보관하지 않음 · none = 덮을 것 없음 */
  ledger: "copied" | "skipped" | "invalid" | "none";
  /** 쓴 파일(저장소 상대 경로) */
  written: string[];
  manifest: PreserveManifest;
}

/** 보관 폴더 → main 최신 작업 트리. 실행 기록은 main의 runs.json에 1건 더하고, 원장·이월은 조건이 맞을 때만 덮는다. */
export async function applyPreserved(
  input: PreserveApplyInput,
): Promise<PreserveApplyResult> {
  const manifest = ManifestSchema.parse(
    JSON.parse(await readFile(path.join(input.dir, MANIFEST_FILE), "utf8")),
  );
  const record = manifest.record;
  if (record === null) {
    return { record: "none", ledger: "none", written: [], manifest };
  }
  const runsPath = path.join(input.rootDir, PRESERVE_RUNS_PATH);
  const existing = await readRuns(runsPath);
  if (existing.some((run) => run.runId === record.runId)) {
    return { record: "already", ledger: "none", written: [], manifest };
  }
  await appendRun(runsPath, record, input.now ? { now: input.now } : {});
  const written: string[] = [PRESERVE_RUNS_PATH];

  let ledger: PreserveApplyResult["ledger"];
  if (manifest.ledgerInvalid !== null) {
    ledger = "invalid";
  } else if (manifest.ledgerFiles.length === 0) {
    ledger = "none";
  } else if (!input.withLedger) {
    ledger = "skipped";
  } else {
    for (const rel of manifest.ledgerFiles) {
      if (!isLedgerPath(rel)) {
        throw new Error(`원장·이월 경로가 아니다: ${rel}`);
      }
      const target = path.join(input.rootDir, rel);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(input.dir, FILES_DIR, rel), target);
      written.push(rel);
    }
    ledger = "copied";
  }
  return { record: "appended", ledger, written, manifest };
}
