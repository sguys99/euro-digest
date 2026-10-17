/**
 * 실패 실행 기록 보존 CLI (M1-27 — FR-151·FR-152, CLAUDE.md §1-4) — collect.yml `실패 실행 기록 보존` 단계 전용 얇은 진입점.
 * 판단·검증은 scripts/lib/run-preserve.ts, git(fetch·worktree·commit·push)은 워크플로 셸이 한다.
 *
 *   node --import tsx scripts/preserve-run.ts save  --run-id <runId> --dir <보관 폴더>                 # 러너 작업 트리 → 보관 폴더
 *   node --import tsx scripts/preserve-run.ts apply --dir <보관 폴더> --root <main 작업 트리> [--with-ledger] [--result <파일>]
 *
 * save는 이 파일이 있는 저장소(러너 체크아웃)를 읽는다. apply는 `--root`(워크플로가 `git worktree add`로 만든 main 최신 작업
 * 트리)에 쓴다 — 코드는 러너 체크아웃의 것(이번 실행이 npm ci한 node_modules와 짝)으로 돈다(M1-27 리뷰 권장 2).
 * `--result`가 있으면 apply 결과 `record=<appended·already·none>`·`ledger=<copied·skipped·invalid·none>` 두 줄로 그 파일을 덮어쓴다
 * (워크플로가 재시도 뒤 한 번만 단계 출력으로 옮긴다).
 * 종료 코드: 0 성공 · 1 인자·파일 오류(보존 실패 — 실패 단계 기록이 이슈 메모에 남긴다). 토큰을 받지 않는다(워크플로가 이 프로세스
 * 전에 토큰 변수를 지운다). 실행 기록의 내용(토큰·비용)은 로그에 비용 합계만 남긴다.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { createLogger } from "./lib/logger";
import { applyPreserved, savePreserved } from "./lib/run-preserve";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const USAGE = [
  "사용법: node --import tsx scripts/preserve-run.ts <save|apply> [옵션]",
  "  save  --run-id <runId> --dir <보관 폴더>   러너 작업 트리의 이번 실행 기록(상태 failed)·원장·이월을 보관",
  "  apply --dir <보관 폴더> --root <main 작업 트리> [--with-ledger] [--result <파일>]",
  "        main 최신 작업 트리의 runs.json에 기록 1건을 더하고(이미 있으면 그대로), --with-ledger면 원장·이월도 덮음 — 멱등",
].join("\n");

const log = createLogger({ scope: "preserve" });

function fail(message: string): number {
  console.error(`[preserve-run] ${message}\n\n${USAGE}`);
  return 1;
}

async function main(): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      strict: true,
      allowPositionals: true,
      options: {
        "run-id": { type: "string" },
        dir: { type: "string" },
        root: { type: "string" },
        result: { type: "string" },
        "with-ledger": { type: "boolean", default: false },
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  const [stage, ...extra] = parsed.positionals;
  const dir =
    typeof parsed.values.dir === "string" ? parsed.values.dir.trim() : "";
  if (extra.length > 0) return fail("인자가 너무 많습니다");
  if (!dir) return fail("--dir가 필요합니다");

  if (stage === "save") {
    const runId =
      typeof parsed.values["run-id"] === "string"
        ? parsed.values["run-id"].trim()
        : "";
    if (!runId) return fail("save에는 --run-id가 필요합니다");
    const { manifest } = await savePreserved({
      rootDir: ROOT_DIR,
      runId,
      dir,
    });
    log.info("preserve.save", {
      runId,
      found: manifest.record !== null,
      originalStatus: manifest.originalStatus,
      costUsd: manifest.record?.costUsd ?? null,
      ledgerFiles: manifest.ledgerFiles.length,
      ledgerInvalid: manifest.ledgerInvalid,
    });
    if (manifest.ledgerInvalid !== null) {
      console.log(
        `::warning title=원장·이월 보존 안 함::스키마 검사를 통과하지 못해 실행 기록만 보존합니다 — ${manifest.ledgerInvalid.slice(0, 200)}`,
      );
    }
    return 0;
  }

  if (stage === "apply") {
    const root =
      typeof parsed.values.root === "string" ? parsed.values.root.trim() : "";
    if (!root)
      return fail("apply에는 --root(main 최신 작업 트리)가 필요합니다");
    if (path.resolve(root) === ROOT_DIR) {
      return fail(
        "--root는 러너 체크아웃이 아닌 main 최신 작업 트리여야 합니다",
      );
    }
    const result = await applyPreserved({
      rootDir: path.resolve(root),
      dir,
      withLedger: parsed.values["with-ledger"] === true,
    });
    log.info("preserve.apply", {
      runId: result.manifest.runId,
      record: result.record,
      ledger: result.ledger,
      written: result.written,
    });
    const resultFile =
      typeof parsed.values.result === "string"
        ? parsed.values.result.trim()
        : "";
    if (resultFile) {
      writeFileSync(
        resultFile,
        `record=${result.record}\nledger=${result.ledger}\n`,
        "utf8",
      );
    }
    return 0;
  }

  return fail(`단계는 save 또는 apply (받은 값: "${String(stage ?? "")}")`);
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    log.error("preserve.fail", {
      error:
        error instanceof Error ? error.message.split("\n")[0] : String(error),
    });
    process.exitCode = 1;
  },
);
