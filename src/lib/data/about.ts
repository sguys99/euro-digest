/**
 * `/about` 소스 설정 로더 — `configs/sources.json`(지금 싣는 매체·출처 Tier) (PRD FR-140, M1-36)
 *
 * 규칙은 src/lib/data/config-file.ts `readConfigFile`(없으면 빈 배열 — 소스 이름을 지어내지 않는다, 깨지면 던짐, 프로세스 안 캐시).
 * 다루는 대회는 대회 설정 로더(src/lib/data/competitions.ts `loadCompetitionsConfig`)를 쓴다.
 */
import path from "node:path";

import { SourcesFileSchema, type SourcesFile } from "@/lib/schema/source";

import { readConfigFile } from "./config-file";

/** 소스 설정 위치(저장소 루트 기준) — `next build`·Vitest 모두 루트에서 실행한다 */
export const SOURCES_PATH = path.resolve("configs/sources.json");

/** 소스 설정 전체(설정 파일 순서) — 무엇을 싣는지는 src/lib/about.ts `outletsFrom`이 고른다 */
export function loadSourcesConfig(file: string = SOURCES_PATH): SourcesFile {
  return readConfigFile(file, SourcesFileSchema, "소스 설정", []);
}
