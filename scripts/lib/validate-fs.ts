/**
 * `npm run validate` 검사 대상 수집 (M0-17) — 파일 시스템을 읽는 I/O 함수만 둔다.
 * 판정은 scripts/lib/validate-report.ts의 순수 함수가 한다.
 *
 * - configs/ 아래 모든 .json(하위 폴더 포함). configs/prompts/ 폴더는 통째로 뺀다.
 * - data/ 아래 모든 .json (`configsOnly`면 읽지 않는다).
 * - configs/prompts/의 PROMPT_FILES 중 있는 파일.
 * 확장자는 대소문자를 가리지 않는다(`Sources.JSON` 같은 오타도 미등록 파일로 잡히게).
 * 심볼릭 링크는 따라가지 않는다(out-dir.ts listFilesRecursive). 폴더가 없으면 빈 목록.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import { listFilesRecursive } from "./out-dir";
import {
  PROMPT_FILES,
  PROMPTS_DIR,
  type SnapshotFile,
  type ValidationSnapshot,
} from "./validate-report";

const CONFIGS_DIR = "configs";
const DATA_DIR = "data";

function isDirectory(absPath: string): boolean {
  try {
    return statSync(absPath).isDirectory();
  } catch {
    return false;
  }
}

function isFile(absPath: string): boolean {
  try {
    return statSync(absPath).isFile();
  } catch {
    return false;
  }
}

/** 파일 1개를 UTF-8로 읽는다. 실패해도 던지지 않고 readError로 남긴다(다른 파일 검사는 계속). */
function readSnapshotFile(rootDir: string, relPath: string): SnapshotFile {
  try {
    return { relPath, text: readFileSync(path.join(rootDir, relPath), "utf8") };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    return { relPath, readError: code || "알 수 없는 오류" };
  }
}

/** rootDir/dir 아래 .json 파일의 저장소 기준 상대 경로(정렬). excludeSubdir(dir 기준)는 뺀다. */
function listJsonFiles(
  rootDir: string,
  dir: string,
  excludeSubdir?: string,
): string[] {
  const absDir = path.join(rootDir, dir);
  if (!isDirectory(absDir)) return [];
  return listFilesRecursive(absDir)
    .filter((rel) => rel.toLowerCase().endsWith(".json"))
    .filter((rel) => !excludeSubdir || !rel.startsWith(`${excludeSubdir}/`))
    .map((rel) => `${dir}/${rel}`);
}

/**
 * 저장소 루트에서 검사 대상을 모은다.
 * @param rootDir 저장소 루트 절대 경로(테스트는 임시 폴더)
 */
export function readValidationSnapshot(
  rootDir: string,
  options: { configsOnly: boolean },
): ValidationSnapshot {
  const promptsSubdir = path.posix.relative(CONFIGS_DIR, PROMPTS_DIR);
  const configFiles = listJsonFiles(rootDir, CONFIGS_DIR, promptsSubdir).map(
    (rel) => readSnapshotFile(rootDir, rel),
  );
  const dataFiles = options.configsOnly
    ? []
    : listJsonFiles(rootDir, DATA_DIR).map((rel) =>
        readSnapshotFile(rootDir, rel),
      );
  const promptFiles = PROMPT_FILES.map((name) => `${PROMPTS_DIR}/${name}`)
    .filter((rel) => isFile(path.join(rootDir, rel)))
    .map((rel) => readSnapshotFile(rootDir, rel));
  return { configFiles, dataFiles, promptFiles };
}
