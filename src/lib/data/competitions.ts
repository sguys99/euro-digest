/**
 * 대회 설정 로더 — `configs/competitions.json` (뉴스 카드 인덱스 탭 약칭(M1-31) · `/about` 다루는 대회(M1-36))
 *
 * 규칙은 src/lib/data/config-file.ts `readConfigFile`(없으면 빈 배열, 깨지면 던짐, 프로세스 안 캐시).
 * 대회 설정을 읽는 화면 코드는 이 로더 하나를 쓴다(카드 표시 이름 표는 card-labels.ts가 이것으로 만든다).
 */
import path from "node:path";

import {
  CompetitionsFileSchema,
  type CompetitionsFile,
} from "@/lib/schema/configs";

import { readConfigFile } from "./config-file";

/** 대회 설정 위치(저장소 루트 기준) — `next build`·Vitest 모두 루트에서 실행한다 */
export const COMPETITIONS_PATH = path.resolve("configs/competitions.json");

/** 대회 설정 전체(설정 파일 순서) */
export function loadCompetitionsConfig(
  file: string = COMPETITIONS_PATH,
): CompetitionsFile {
  return readConfigFile(file, CompetitionsFileSchema, "대회 설정", []);
}
