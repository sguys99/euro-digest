/**
 * 실행 기록 로더 — `data/runs.json`(prod, 봇) (PRD FR-151, 부록 A)
 *
 * 빌드 때(서버 컴포넌트) Node fs로 읽는다. 마스트헤드의 발행·업데이트 시각(src/lib/issue.ts — src/lib/data/issue.ts가 부름)과
 * 공개 상태 페이지(`/status` — src/lib/data/status.ts, M5-15)가 쓴다. dev 실행(`runs-dev.json`)은 `/status` 비용 사용률(prod + dev
 * 합산 — CLAUDE §6.3)에만 쓴다(`loadDevRuns`).
 * `"use client"` 파일에서 import하지 않는다(node:fs·zod가 클라이언트 번들에 들어간다).
 *
 * 규칙 — 뉴스 로더(src/lib/data/news.ts)와 같다
 * - 파일이 없으면 빈 배열(실행 기록이 아직 없는 저장소).
 * - JSON·스키마(`RunsFileSchema` — prod 실행만) 검증에 실패하면 **던진다**(빌드 실패). 1차 방어는 발행 검증 게이트
 *   (`npm run validate`)이고 이것은 빌드 단계의 마지막 방어선이다.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  RunsDevFileSchema,
  RunsFileSchema,
  type RunLog,
} from "@/lib/schema/run";

/** 봇 실행 기록 위치(저장소 루트 기준). `next build`·Vitest 모두 루트에서 실행한다 */
export const RUNS_FILE = path.resolve("data/runs.json");

/** 개발 실행 기록 위치 — `/status` 비용 사용률만 쓴다 */
export const RUNS_DEV_FILE = path.resolve("data/runs-dev.json");

/** prod 실행 기록 전체(파일 순서 그대로). 파일이 없으면 빈 배열, 깨졌으면 던진다 */
export function loadProdRuns(file: string = RUNS_FILE): RunLog[] {
  return loadRunsFile(file, RunsFileSchema);
}

/** dev 실행 기록 전체(파일 순서 그대로) — 규칙은 `loadProdRuns`와 같다(env "dev"만) */
export function loadDevRuns(file: string = RUNS_DEV_FILE): RunLog[] {
  return loadRunsFile(file, RunsDevFileSchema);
}

function loadRunsFile(
  file: string,
  schema: typeof RunsFileSchema,
): RunLog[] {
  if (!existsSync(file)) return [];
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
      `${where}: 실행 기록 스키마 검증 실패\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}
