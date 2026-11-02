/**
 * Pagefind JS API 지연 로더 + 유형별 검색 (PRD FR-130·FR-132, plan M4-14) — 클라이언트 전용.
 *
 * - `out/pagefind/pagefind.js`(빌드 산출물 — scripts/build-search.ts)를 **처음 쓸 때** 동적 import 한다. 번들러가 묶지 않게 주소를 변수로
 *   넘기고 묶음 제외 주석을 단다 → 초기 JS 예산(160KB) 밖. 실패하면 약속을 버려 다음에 다시 시도한다(오프라인 → 연결).
 * - Pagefind 기본 UI는 쓰지 않는다(JS API만 — 결과는 D2 혼합안 마크업으로 그린다).
 * - 유형마다 필터를 건 검색을 한 번씩(선수 · 팀 · 대회 · 뉴스 — 같은 색인 조각을 공유해 추가 내려받기는 거의 없다). 뉴스는 대표 출처 시각
 *   최신순(`sort: at desc`), 나머지는 Pagefind 관련도 순. 결과 데이터(`data()`)는 보여 줄 만큼만 받는다.
 */
import { withBasePath } from "@/lib/paths";

import {
  hitFromData,
  matchesQuery,
  resultText,
  SEARCH_SORT_AT,
  SEARCH_TYPE_FILTER,
  SEARCH_TYPES,
  type RawResultData,
  type SearchHit,
  type SearchType,
} from "./model";

interface PagefindResult {
  id: string;
  data(): Promise<RawResultData & { content?: string }>;
}

interface PagefindSearch {
  results: PagefindResult[];
}

/** 쓰는 부분만 — pagefind.js(1.5)의 내보내기 */
interface PagefindApi {
  options(options: Record<string, unknown>): Promise<void>;
  init(): Promise<void>;
  search(
    term: string,
    options?: {
      filters?: Record<string, string>;
      sort?: Record<string, "asc" | "desc">;
    },
  ): Promise<PagefindSearch | null>;
}

let loading: Promise<PagefindApi> | null = null;

/** pagefind.js 주소(basePath 포함) */
export function pagefindScriptUrl(): string {
  return withBasePath("/pagefind/pagefind.js");
}

/** Pagefind를 한 번만 불러 초기화한다(동시 호출은 같은 약속). 실패하면 다음 호출이 다시 시도한다 */
export function loadPagefind(): Promise<PagefindApi> {
  if (!loading) {
    const url = pagefindScriptUrl();
    loading = (async () => {
      const api = (await import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ url
      )) as PagefindApi;
      // 결과 URL 앞에 basePath — HTML 레코드는 out/ 기준 경로(`/teams/x/`), 뉴스 레코드도 basePath 없는 앵커로 넣었다
      await api.options({ baseUrl: withBasePath("/"), excerptLength: 0 });
      await api.init();
      return api;
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** 묶음 하나 — 전체 건수 + 지금까지 받은 결과 + 더 받기 */
export interface SearchGroup {
  type: SearchType;
  total: number;
  hits: SearchHit[];
}

export interface SearchOutcome {
  query: string;
  groups: SearchGroup[];
  /** 그 유형 결과를 `count`개 더 받는다(뉴스 더 보기) — 받은 결과까지 붙인 묶음 */
  more(type: SearchType, count: number): Promise<SearchGroup>;
}

/** 유형별 처음에 받을 결과 수 */
export type SearchLimits = Readonly<Record<SearchType, number>>;

async function hitsOf(
  type: SearchType,
  results: readonly PagefindResult[],
): Promise<SearchHit[]> {
  const data = await Promise.all(results.map((r) => r.data()));
  return data.flatMap((d) => {
    const hit = hitFromData(type, d);
    return hit ? [hit] : [];
  });
}

/** 묶음의 첫 결과가 검색어와 맞지 않으면(접두 되물림 — model.ts `matchesQuery`) 묶음을 비운다 */
async function relevant(
  query: string,
  results: readonly PagefindResult[],
): Promise<readonly PagefindResult[]> {
  const first = results[0];
  if (!first) return results;
  return matchesQuery(query, resultText(await first.data())) ? results : [];
}

/** 검색어 하나 → 유형 묶음(선수 · 팀 · 대회 · 뉴스 순) */
export async function searchAll(
  api: PagefindApi,
  query: string,
  limits: SearchLimits,
): Promise<SearchOutcome> {
  const searches = await Promise.all(
    SEARCH_TYPES.map(async (type) => {
      const found = await api.search(query, {
        filters: { [SEARCH_TYPE_FILTER]: type },
        ...(type === "news" ? { sort: { [SEARCH_SORT_AT]: "desc" } } : {}),
      });
      return relevant(query, found?.results ?? []);
    }),
  );
  const all = new Map<SearchType, readonly PagefindResult[]>();
  const loaded = new Map<SearchType, SearchHit[]>();
  /** 다음에 받을 결과 위치(깨진 결과를 건너뛰어도 같은 결과를 두 번 받지 않게 — 받은 수가 아니라 요청한 위치) */
  const nextFrom = new Map<SearchType, number>();
  const groups = await Promise.all(
    SEARCH_TYPES.map(async (type, i) => {
      const results = searches[i] ?? [];
      all.set(type, results);
      const hits = await hitsOf(type, results.slice(0, limits[type]));
      loaded.set(type, hits);
      return { type, total: results.length, hits };
    }),
  );
  return {
    query,
    groups,
    async more(type, count) {
      const results = all.get(type) ?? [];
      const have = loaded.get(type) ?? [];
      const from = Math.min(results.length, nextFrom.get(type) ?? limits[type]);
      nextFrom.set(type, from + count);
      const next = await hitsOf(type, results.slice(from, from + count));
      const hits = [...have, ...next];
      loaded.set(type, hits);
      return { type, total: results.length, hits };
    },
  };
}
