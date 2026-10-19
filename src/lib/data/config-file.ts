/**
 * 설정 파일 읽기 — 화면 빌드가 `configs/*.json`을 zod로 검증해 읽는 공용 도우미 (M1-31·M1-36)
 *
 * 빌드 때(서버 컴포넌트) Node fs로 읽는다. node:fs·zod를 쓰므로 `"use client"` 파일에서 import하지 않는다.
 * 규칙 — 설정 로더(card-labels·competitions·about)가 모두 따른다(names.ts와 같은 원칙)
 * - 파일이 없으면 `empty`(표시가 빠질 뿐 slug·ID 문자열이나 지어낸 이름을 보이지 않는다).
 * - JSON·스키마 검증에 실패하면 **던진다**(빌드 실패) — 사람이 고치는 설정이라 `npm run validate`(CI)가 먼저 막지만, 깨진 설정으로
 *   표시가 조용히 사라지거나 틀린 채 배포되지 않게 하는 마지막 방어선이다. 메시지: "<경로>: JSON을 읽을 수 없음" ·
 *   "<경로>: <label> 스키마 검증 실패".
 * - 같은 파일·같은 label은 한 번만 읽는다(프로세스 안 캐시 — 빌드 중 페이지마다 다시 읽지 않게).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

const cache = new Map<string, unknown>();

export function readConfigFile<T>(
  file: string,
  schema: z.ZodType<T>,
  label: string,
  empty: T,
): T {
  const key = `${label}\u0000${file}`;
  // 캐시 값은 같은 key(같은 label = 같은 스키마)로 넣은 T뿐이다
  if (cache.has(key)) return cache.get(key) as T;
  let value = empty;
  if (existsSync(file)) {
    const where = path.relative(process.cwd(), file) || file;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`${where}: JSON을 읽을 수 없음`, { cause: error });
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `${where}: ${label} 스키마 검증 실패\n${z.prettifyError(parsed.error)}`,
      );
    }
    value = parsed.data;
  }
  cache.set(key, value);
  return value;
}
