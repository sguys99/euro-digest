"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { normalizeQuery, type SearchType } from "@/lib/search/model";
import {
  loadPagefind,
  searchAll,
  type SearchGroup,
  type SearchLimits,
  type SearchOutcome,
} from "@/lib/search/pagefind-client";

/**
 * 검색 상태 훅 — 오버레이·`/search/`가 함께 쓴다 (plan M4-14, DESIGN §9.3 상태 화면 4종).
 *
 * 상태: `idle`(검색어 없음 — 오버레이는 입력 전 색인) · `loading`(색인을 처음 받거나 검색 중 — 스켈레톤) · `ready`(묶음) ·
 * `error`(색인을 받지 못함 — 다시 시도) · `offline`(받지 못했는데 기기가 오프라인). 늦게 끝난 앞 검색은 버린다(순번).
 */

export type SearchStatus = "idle" | "loading" | "ready" | "error" | "offline";

export interface SearchState {
  status: SearchStatus;
  /** 지금 결과가 가리키는 검색어(ready일 때) */
  query: string;
  groups: SearchGroup[];
}

const IDLE: SearchState = { status: "idle", query: "", groups: [] };

/**
 * 화면 상태 — 검색어가 없으면 idle, 끝난 검색이 지금 검색어면 그대로, 아니면 앞 결과가 있으면 새 결과가 올 때까지 앞 결과를 둔다(글자를 칠
 * 때마다 스켈레톤으로 깜빡이지 않게), 없으면 loading(순수 — 테스트)
 */
export function viewState(query: string, settled: SearchState): SearchState {
  if (!query) return IDLE;
  if (settled.query === query) return settled;
  if (settled.status === "ready") return settled;
  return { status: "loading", query, groups: [] };
}

/** `limits`는 모듈 상수로 넘긴다(바뀌면 다시 검색한다) */
export function useSearch(
  rawQuery: string,
  limits: SearchLimits,
  {
    debounceMs = 0,
    preload = false,
  }: { debounceMs?: number; preload?: boolean } = {},
) {
  const query = normalizeQuery(rawQuery);
  // 마지막으로 끝난 검색(결과 · 오류) — 화면 상태는 이것과 지금 검색어로 정한다(효과 안에서 상태를 바로 바꾸지 않는다)
  const [settled, setSettled] = useState<SearchState>(IDLE);
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);
  const outcome = useRef<SearchOutcome | null>(null);

  // 오버레이를 열면 곧 쓸 색인을 미리 받는다(첫 입력 지연을 줄임) — 실패는 검색할 때 다시 드러난다
  useEffect(() => {
    if (preload) loadPagefind().catch(() => {});
  }, [preload]);

  useEffect(() => {
    const id = ++seq.current;
    if (!query) {
      outcome.current = null;
      return;
    }
    const timer = window.setTimeout(() => {
      loadPagefind()
        .then((api) => searchAll(api, query, limits))
        .then((result) => {
          if (id !== seq.current) return;
          outcome.current = result;
          setSettled({ status: "ready", query, groups: result.groups });
        })
        .catch(() => {
          if (id !== seq.current) return;
          outcome.current = null;
          const offline =
            typeof navigator !== "undefined" && navigator.onLine === false;
          setSettled({
            status: offline ? "offline" : "error",
            query,
            groups: [],
          });
        });
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [query, limits, debounceMs, attempt]);

  const state = viewState(query, settled);

  /** 그 유형 결과를 더 받는다(뉴스 더 보기) */
  const more = useCallback(async (type: SearchType, count: number) => {
    const current = outcome.current;
    if (!current) return;
    const id = seq.current;
    const group = await current.more(type, count);
    if (id !== seq.current) return;
    setSettled((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.type === type ? group : g)),
    }));
  }, []);

  const retry = useCallback(() => {
    setSettled(IDLE);
    setAttempt((n) => n + 1);
  }, []);

  return { state, query, more, retry };
}
