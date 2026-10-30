/**
 * 대회 데이터 로더 — `data/competitions/{comp}.json` (PRD F4 FR-40~45, plan M2-10 — M2-08 `tonight.ts` 안에 있던 로더를 공용으로 뺐다)
 *
 * 빌드 때(서버 컴포넌트 — 대회 페이지 M2-10 · "오늘 밤 볼 경기" M2-08·M2-14 · 팀 페이지 M2-13 · 순위 미니 M2-15) Node fs로 읽는다.
 * node:fs·zod를 쓰므로 `"use client"` 파일에서 import하지 않는다.
 *
 * 규칙(설정 로더 `config-file.ts`·뉴스 로더 `news.ts`와 같은 원칙)
 * - 파일 이름은 대회 ID 소문자(`epl.json` — URL 세그먼트와 같다, src/lib/paths.ts `compSegment`).
 * - 파일이 없으면 null(CI·첫 수집 전 — 화면은 빈 상태), JSON·스키마 검증에 실패하면 **던진다**(빌드 실패 — 깨진 데이터로 조용히
 *   틀린 순위·선별을 배포하지 않는다).
 * - 같은 경로는 한 번만 읽는다(프로세스 안 캐시 — 빌드 중 페이지마다 다시 읽지 않게). 테스트는 다른 경로(`dataDir`)를 준다.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { COMPETITIONS_PATH, loadCompetitionsConfig } from "@/lib/data/competitions";
import { CompetitionFileSchema, type CompetitionFile } from "@/lib/schema";
import type { CompId } from "@/lib/schema/common";

/** 대회 데이터 디렉터리(저장소 루트 기준) — `next build`·Vitest 모두 루트에서 실행한다 */
export const COMPETITION_DATA_DIR = path.resolve("data/competitions");

const cache = new Map<string, CompetitionFile | null>();

/** 대회 데이터 파일 경로 — `{dataDir}/{comp 소문자}.json` */
export function competitionDataPath(
  comp: CompId,
  dataDir: string = COMPETITION_DATA_DIR,
): string {
  return path.join(dataDir, `${comp.toLowerCase()}.json`);
}

/** 대회 데이터 파일 1개 — 없으면 null, 깨졌으면 던진다(머리 주석 규칙) */
export function readCompetitionFile(file: string): CompetitionFile | null {
  if (cache.has(file)) return cache.get(file) ?? null;
  let value: CompetitionFile | null = null;
  if (existsSync(file)) {
    const where = path.relative(process.cwd(), file) || file;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`${where}: JSON을 읽을 수 없음`, { cause: error });
    }
    const parsed = CompetitionFileSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `${where}: 대회 데이터 스키마 검증 실패\n${z.prettifyError(parsed.error)}`,
      );
    }
    value = parsed.data;
  }
  cache.set(file, value);
  return value;
}

/** 대회 하나의 데이터 — 없으면 null */
export function loadCompetitionData(
  comp: CompId,
  dataDir: string = COMPETITION_DATA_DIR,
): CompetitionFile | null {
  return readCompetitionFile(competitionDataPath(comp, dataDir));
}

export interface CompetitionDataPaths {
  /** 대회 설정(`configs/competitions.json`) — 순서와 대상 대회 */
  competitions?: string;
  /** 대회 데이터 디렉터리 */
  dataDir?: string;
}

/** 설정 순서대로 데이터가 있는 대회 전부(없는 대회는 건너뛴다) */
export function loadAllCompetitionData(
  paths: CompetitionDataPaths = {},
): CompetitionFile[] {
  return loadCompetitionsConfig(paths.competitions ?? COMPETITIONS_PATH)
    .map((c) => loadCompetitionData(c.id, paths.dataDir))
    .filter((c): c is CompetitionFile => c !== null);
}
