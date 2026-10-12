/**
 * 검색형 소스 공통 — 검색 쿼리 로더 (M1-06, PRD FR-02, §15 D25·D32).
 *
 * `configs/search-queries.json`을 zod로 읽고(`SearchQueriesFileSchema`), 이번 실행에서 돌릴 **활성 쿼리**를
 * 검색형 소스별로 묶는다(순수 함수 `planSearchQueries`).
 *
 * 활성 쿼리 = `query.enabled` **그리고** `query.source`가 sources.json의 type "search" 소스이면서 수집 조건
 * (`enabled && terms_checked` — scripts/lib/sources.ts `collectBlocker` 재사용)을 통과한 것. 판정 순서:
 *   query-disabled → source-missing → source-not-search → source-<수집 조건 사유> → over-max-enabled
 * `maxEnabled`는 스키마가 이미 막는다(enabled 쿼리 수 ≤ maxEnabled). 로더도 한 번 더 막는다 — 스키마를 거치지 않은
 * 입력이 와도 설정 순서로 앞의 `maxEnabled`개만 활성으로 두고 나머지는 "over-max-enabled"로 뺀다.
 *
 * 범위(D32): 로더·계획과 어댑터 **인터페이스 타입**만 둔다. 검색 요청(GDELT 어댑터 M1-07)과 og:title·게시 시각 보충
 * (M1-08)은 보류다 — 어댑터 구현이 없으므로 활성 쿼리가 생겨도 수집 단계(collect-run.ts)는 경고 로그만 남기고 건너뛴다.
 * 현재 설정(2026-10-12): 쿼리 9개 모두 enabled:false, 검색형 소스(gdelt-doc·google-news-ko/en) 모두 비활성 → 대상 없음.
 *
 * 검색 결과의 매체 도메인 허용 목록 필터는 scripts/lib/search-results.ts.
 */
import {
  SearchQueriesFileSchema,
  type SearchQueriesFile,
  type SearchQuery,
  type Source,
} from "@/lib/schema";

import { readConfigFile } from "./config-files";
import type { Logger } from "./logger";
import type { FetchLike } from "./rss";
import type { SearchResultItem } from "./search-results";
import { collectBlocker, type CollectBlocker } from "./sources";

/** `<rootDir>/configs/search-queries.json` → 검증한 설정(스키마 오류면 ConfigFileError) */
export function loadSearchQueries(rootDir: string): Promise<SearchQueriesFile> {
  return readConfigFile(
    rootDir,
    "search-queries.json",
    SearchQueriesFileSchema,
  );
}

// ─── 활성 쿼리 계획 ──────────────────────────────────────────────────────

/** 활성 쿼리에서 뺀 이유 */
export type SearchQueryExclusionReason =
  /** query.enabled:false */
  | "query-disabled"
  /** query.source가 sources.json에 없다(validate 교차 참조가 먼저 잡는다 — 방어) */
  | "source-missing"
  /** query.source가 type "search"가 아니다(validate 교차 참조가 먼저 잡는다 — 방어) */
  | "source-not-search"
  /** 소스가 수집 조건을 통과하지 못했다 — source-disabled · source-terms-unchecked (sources.ts collectBlocker) */
  | `source-${CollectBlocker}`
  /** 활성 쿼리가 maxEnabled를 넘었다(스키마를 거치지 않은 입력 방어) */
  | "over-max-enabled";

export interface SearchQueryExclusion {
  /** 쿼리 id */
  id: string;
  /** 쿼리가 가리키는 소스 id */
  source: string;
  reason: SearchQueryExclusionReason;
}

/** 검색형 소스 1개와 그 소스로 돌릴 활성 쿼리(설정 순서) — M1-07 어댑터가 받는 단위 */
export interface SearchSourceBatch {
  source: Source;
  queries: SearchQuery[];
}

export interface SearchQueryPlan {
  /** 소스별 활성 쿼리 — 소스는 search-queries.json에서 처음 나온 순서, 쿼리는 설정 순서 */
  batches: SearchSourceBatch[];
  /** 활성 쿼리 수(batches 합) */
  active: number;
  /** 설정 상한 */
  maxEnabled: number;
  /** 활성에서 뺀 쿼리와 이유(설정 순서) */
  excluded: SearchQueryExclusion[];
}

/** 쿼리 1개의 판정 — 활성이면 그 소스, 아니면 이유(maxEnabled는 계획 단계에서 따로 본다) */
function queryRoute(
  query: SearchQuery,
  sourceById: ReadonlyMap<string, Source>,
): { source: Source } | { reason: SearchQueryExclusionReason } {
  if (!query.enabled) return { reason: "query-disabled" };
  const source = sourceById.get(query.source);
  if (!source) return { reason: "source-missing" };
  if (source.type !== "search") return { reason: "source-not-search" };
  const blocker = collectBlocker(source);
  if (blocker !== null) return { reason: `source-${blocker}` };
  return { source };
}

/** 쿼리 설정 + 소스 설정 → 소스별 활성 쿼리·제외 목록. 순수 함수. */
export function planSearchQueries(
  file: SearchQueriesFile,
  sources: readonly Source[],
): SearchQueryPlan {
  const sourceById = new Map(sources.map((s) => [s.id, s] as const));
  const batchBySource = new Map<string, SearchSourceBatch>();
  const plan: SearchQueryPlan = {
    batches: [],
    active: 0,
    maxEnabled: file.maxEnabled,
    excluded: [],
  };
  for (const query of file.queries) {
    const route = queryRoute(query, sourceById);
    if ("reason" in route) {
      plan.excluded.push({
        id: query.id,
        source: query.source,
        reason: route.reason,
      });
      continue;
    }
    if (plan.active >= file.maxEnabled) {
      plan.excluded.push({
        id: query.id,
        source: query.source,
        reason: "over-max-enabled",
      });
      continue;
    }
    let batch = batchBySource.get(route.source.id);
    if (!batch) {
      batch = { source: route.source, queries: [] };
      batchBySource.set(route.source.id, batch);
      plan.batches.push(batch);
    }
    batch.queries.push(query);
    plan.active += 1;
  }
  return plan;
}

/** 제외 사유별 건수(로그용) */
export function countSearchExclusions(
  excluded: readonly SearchQueryExclusion[],
): Partial<Record<SearchQueryExclusionReason, number>> {
  const counts: Partial<Record<SearchQueryExclusionReason, number>> = {};
  for (const ex of excluded) counts[ex.reason] = (counts[ex.reason] ?? 0) + 1;
  return counts;
}

/**
 * 설정과 실행이 어긋난 제외 사유 — 수집 단계가 warn으로 남긴다. 나머지(쿼리·소스를 꺼 둔 것)는 의도된 제외라 debug.
 * source-missing·source-not-search는 쿼리를 켰을 때만 나온다(query-disabled를 먼저 보므로).
 */
export const SEARCH_EXCLUSION_WARN_REASONS: ReadonlySet<SearchQueryExclusionReason> =
  new Set<SearchQueryExclusionReason>([
    "source-missing",
    "source-not-search",
    "over-max-enabled",
  ]);

// ─── 어댑터 인터페이스 (구현 없음 — M1-07 보류, D32) ─────────────────────

/** 어댑터가 받는 I/O — 수집 진입점이 주입한다(테스트는 가짜 fetch) */
export interface SearchAdapterContext {
  fetch: FetchLike;
  userAgent: string;
  logger: Logger;
}

/** 어댑터 한 번 실행의 결과 */
export interface SearchAdapterOutcome {
  /** 검색 결과(허용 목록 필터 전) — 제목·시각은 표시용이 아니다(search-results.ts) */
  items: SearchResultItem[];
  /** 쿼리별 결과 — 소스 건강도·runs 기록용 */
  queries: Array<{ id: string; ok: boolean; items: number }>;
}

/**
 * 검색형 소스 어댑터 — **인터페이스만** 둔다(M1-06). 구현·등록은 M1-07(GDELT, 보류 — M1-46 재측정 통과 시 착수).
 *
 * 구현할 때 지킬 것:
 *   - 한 소스의 활성 쿼리 묶음을 받아 차례로 요청한다(레이트 리밋·요청 간격은 어댑터 책임 — GDELT는 429 다발, M0-27).
 *   - 허용 목록 판정은 하지 않는다. 수집 단계가 결과 전체에 `filterSearchResults`(search-results.ts)를 적용한다.
 *   - 외부 응답은 어댑터 경계에서 zod로 파싱하고 `SearchResultItem`으로만 내보낸다. 본문·요약문 필드는 만들지 않는다(FR-02).
 */
export interface SearchAdapter {
  /** 처리하는 sources.json 검색형 소스 id(예: "gdelt-doc") */
  readonly sourceId: string;
  search(
    batch: SearchSourceBatch,
    context: SearchAdapterContext,
  ): Promise<SearchAdapterOutcome>;
}
