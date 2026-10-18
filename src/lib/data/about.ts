/**
 * `/about` 설정 로더 — `configs/sources.json`(지금 싣는 매체·출처 Tier) · `configs/competitions.json`(다루는 대회) (PRD FR-140, M1-36)
 *
 * 빌드 때(서버 컴포넌트) Node fs로 읽는다. node:fs·zod를 쓰므로 `"use client"` 파일에서 import하지 않는다.
 * 규칙 — 다른 설정 로더(src/lib/data/names.ts)와 같다
 * - 파일이 없으면 빈 배열(목록 없이 렌더 — 소스 이름을 지어내지 않는다).
 * - JSON·스키마 검증에 실패하면 **던진다**(빌드 실패) — 사람이 고치는 설정이라 `npm run validate`(CI)가 먼저 막지만, 깨진 설정으로
 *   목록이 조용히 비거나 틀린 채 배포되지 않게 하는 마지막 방어선이다.
 * - 같은 경로는 한 번만 읽는다(프로세스 안 캐시).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  CompetitionsFileSchema,
  type CompetitionsFile,
} from "@/lib/schema/configs";
import { SourcesFileSchema, type SourcesFile } from "@/lib/schema/source";

/** 소스 설정 위치(저장소 루트 기준) — `next build`·Vitest 모두 루트에서 실행한다 */
export const SOURCES_PATH = path.resolve("configs/sources.json");

/** 대회 설정 위치(저장소 루트 기준) */
export const ABOUT_COMPETITIONS_PATH = path.resolve("configs/competitions.json");

const cache = new Map<string, unknown>();

function readConfig<T>(
  file: string,
  schema: z.ZodType<T>,
  label: string,
  empty: T,
): T {
  if (cache.has(file)) return cache.get(file) as T;
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
  cache.set(file, value);
  return value;
}

/** 소스 설정 전체(설정 파일 순서) — 무엇을 싣는지는 src/lib/about.ts `outletsFrom`이 고른다 */
export function loadSourcesConfig(file: string = SOURCES_PATH): SourcesFile {
  return readConfig(file, SourcesFileSchema, "소스 설정", []);
}

/** 대회 설정 전체(설정 파일 순서) */
export function loadCompetitionsConfig(
  file: string = ABOUT_COMPETITIONS_PATH,
): CompetitionsFile {
  return readConfig(file, CompetitionsFileSchema, "대회 설정", []);
}
