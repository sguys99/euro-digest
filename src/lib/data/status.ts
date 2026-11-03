/**
 * `/status/` 공개 상태 페이지 · 뒤표지 '발행 상태' 링크 데이터 (PRD P-1 · §15 D71 ③, plan M5-15)
 *
 * 빌드 때(서버 컴포넌트)만 쓴다 — node:fs를 쓰는 로더를 부르므로 `"use client"` 파일에서 import하지 않는다.
 * 계산은 순수 모듈 src/lib/status-view.ts. 기준 시각 = 빌드 시각("이 쪽 기준") — 프로세스 안에서 한 번 정해 같은 빌드의
 * 페이지(뒤표지 링크 숫자)와 `/status`가 같은 값을 쓴다. 월 예산은 기본값(`DEFAULT_MONTHLY_BUDGET_USD` — 빌드 환경에 예산 변수 없음).
 */
import { loadSourcesConfig } from "@/lib/data/about";
import { loadDevRuns, loadProdRuns } from "@/lib/data/runs";
import { DEFAULT_MONTHLY_BUDGET_USD } from "@/lib/ops-metrics";
import {
  buildStatusView,
  statusRunRatePct,
  type StatusView,
} from "@/lib/status-view";
import { nowUtcIso } from "@/lib/time";

let buildAsOf: string | null = null;

/** 이 빌드의 기준 시각(UTC ISO) — 처음 부를 때 정한다 */
export function statusAsOf(): string {
  buildAsOf ??= nowUtcIso();
  return buildAsOf;
}

/** `/status/` 화면 모델 */
export function loadStatusView(asOf: string = statusAsOf()): StatusView {
  return buildStatusView({
    prodRuns: loadProdRuns(),
    devRuns: loadDevRuns(),
    asOf,
    monthlyBudget: DEFAULT_MONTHLY_BUDGET_USD,
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
