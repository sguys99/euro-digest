/**
 * configs/ 파일 읽기 공용 헬퍼 — 경계에서 zod로 검증한다(CLAUDE.md §9.1). 사람이 관리하는 설정이라
 * 형식이 틀리면 실행을 멈추고 `npm run validate`로 위치를 확인하게 한다(오류 메시지에 파일 내용은 넣지 않는다).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { z } from "zod";

export class ConfigFileError extends Error {
  override readonly name = "ConfigFileError";
}

/** `<rootDir>/configs/<fileName>` → 스키마로 검증한 값 */
export async function readConfigFile<S extends z.ZodType>(
  rootDir: string,
  fileName: string,
  schema: S,
): Promise<z.infer<S>> {
  const file = path.join(rootDir, "configs", fileName);
  let json: unknown;
  try {
    json = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new ConfigFileError(
      `configs/${fileName} 읽기 실패: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
    );
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ConfigFileError(
      `configs/${fileName} 스키마 검증 실패(${parsed.error.issues.length}건) — npm run validate로 확인할 것`,
    );
  }
  return parsed.data;
}
