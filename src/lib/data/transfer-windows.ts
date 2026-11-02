/**
 * 이적 창 설정 로더 — `configs/transfer-windows.json` (PRD FR-105, §15 D68 ①②, plan M4-03 · M4-04)
 *
 * 규칙은 src/lib/data/config-file.ts `readConfigFile`(없으면 null, 깨지면 던짐 — 빌드 실패, 프로세스 안 캐시). 판정은 순수 함수
 * `transferWindowState`(src/lib/transfer-window.ts — 수집 선별 가중과 같은 판정), 기준 시각은 **빌드 시각**(매일 아침 발행 빌드가 다시 굳힌다 —
 * 홈 A매치 섹션과 같은 원칙). 파일이 없으면 판정하지 않는다(null — 홈은 평소 배치, `/transfers/` 머리 줄은 숨김).
 */
import path from "node:path";

import {
  TransferWindowsFileSchema,
  type TransferWindowsFile,
} from "@/lib/schema/configs";
import { nowUtcIso } from "@/lib/time";
import {
  transferWindowState,
  type TransferWindowState,
} from "@/lib/transfer-window";

import { readConfigFile } from "./config-file";

/** 이적 창 설정 위치(저장소 루트 기준) */
export const TRANSFER_WINDOWS_PATH = path.resolve(
  "configs/transfer-windows.json",
);

/** 이적 창 설정 전체 — 파일이 없으면 null */
export function loadTransferWindowsConfig(
  file: string = TRANSFER_WINDOWS_PATH,
): TransferWindowsFile | null {
  return readConfigFile(
    file,
    TransferWindowsFileSchema.nullable(),
    "이적 창 설정",
    null,
  );
}

/** 빌드 시각(`now`) 기준 이적 창 상태 — 설정이 없으면 null */
export function loadTransferWindowState(
  now: Date = new Date(),
  file: string = TRANSFER_WINDOWS_PATH,
): TransferWindowState | null {
  const config = loadTransferWindowsConfig(file);
  if (config === null) return null;
  return transferWindowState(nowUtcIso(now), config.windows);
}
