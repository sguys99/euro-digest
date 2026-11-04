/**
 * `/status/` 공개 상태 페이지 · 뒤표지 '발행 상태' 링크 데이터 (PRD P-1 · §15 D71 ③, plan M5-15)
 *
 * 빌드 때(서버 컴포넌트)만 쓴다 — node:fs를 쓰는 로더를 부르므로 `"use client"` 파일에서 import하지 않는다.
 * 계산은 순수 모듈 src/lib/status-view.ts. 기준 시각 = 빌드 시각("이 쪽 기준") — 프로세스 안에서 한 번 정해 같은 빌드의
 * 페이지(뒤표지 링크 숫자)와 `/status`가 같은 값을 쓴다. 월 예산은 기본값(`DEFAULT_MONTHLY_BUDGET_USD` — 빌드 환경에 예산 변수 없음).
 *
 * 배포 완료 시각(2026-11-03 사용자 결정): deploy.yml '배포 기록 읽기' 단계가 github-pages 배포 기록 배열(JSON — 한 건
 * `{ at: 성공 시각, commitAt: 그 배포를 만든 실행의 커밋 시각 | null }`, UTC ISO — M5-13)을 파일로 쓰고 경로를 `STATUS_DEPLOYS_FILE`로
 * 넘긴다. 옛 형식(시각 문자열 배열 — M5-13 전 deploy.yml)은 형식이 달라 null이다. 변수가 없거나(로컬 · ci 빌드) 파일이 없거나 형식이 다르면 **던지지 않고** null — 칸을 숨긴다
 * (API 실패가 발행을 멈추지 않게).
 */
import { existsSync, readFileSync } from "node:fs";

import { z } from "zod";

import { loadSourcesConfig } from "@/lib/data/about";
import { loadDevRuns, loadProdRuns } from "@/lib/data/runs";
import { DEFAULT_MONTHLY_BUDGET_USD } from "@/lib/ops-metrics";
import {
  buildStatusView,
  statusRunRatePct,
  type StatusDeployRecord,
  type StatusView,
} from "@/lib/status-view";
import { IsoSchema } from "@/lib/schema";
import { nowUtcIso } from "@/lib/time";

let buildAsOf: string | null = null;

/** 이 빌드의 기준 시각(UTC ISO) — 처음 부를 때 정한다 */
export function statusAsOf(): string {
  buildAsOf ??= nowUtcIso();
  return buildAsOf;
}

const DeployRecordsSchema = z
  .array(z.object({ at: IsoSchema, commitAt: IsoSchema.nullable() }))
  .max(1_000);

/** 배포 기록 목록 — 머리 주석 규칙(실패하면 null) */
export function loadDeployTimes(
  file: string | undefined = process.env.STATUS_DEPLOYS_FILE,
): StatusDeployRecord[] | null {
  if (!file || !existsSync(file)) return null;
  try {
    const parsed = DeployRecordsSchema.safeParse(
      JSON.parse(readFileSync(file, "utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** `/status/` 화면 모델 */
export function loadStatusView(asOf: string = statusAsOf()): StatusView {
  return buildStatusView({
    prodRuns: loadProdRuns(),
    devRuns: loadDevRuns(),
    asOf,
    monthlyBudget: DEFAULT_MONTHLY_BUDGET_USD,
    deploys: loadDeployTimes(),
    sources: loadSourcesConfig().map((s) => ({
      id: s.id,
      name: s.name,
      tier: s.tier,
      lang: s.lang,
    })),
  });
}

const rateCache = new Map<string, string | null>();

/** 뒤표지 '발행 상태 {n}%' 숫자 — `/status` 숫자판과 같은 계산. 실행 기록이 없으면 null */
export function loadStatusRunRate(asOf: string = statusAsOf()): string | null {
  if (!rateCache.has(asOf)) {
    rateCache.set(asOf, statusRunRatePct(loadProdRuns(), asOf));
  }
  return rateCache.get(asOf) ?? null;
}
