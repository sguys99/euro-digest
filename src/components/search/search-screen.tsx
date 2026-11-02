"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";

import { SearchIcon } from "@/components/ui/icons";
import { cx } from "@/lib/cx";
import {
  normalizeQuery,
  queryFromSearch,
  SEARCH_TYPE_LABEL,
  type SearchType,
} from "@/lib/search/model";
import type { SearchGroup } from "@/lib/search/pagefind-client";

import {
  countSummary,
  groupAnchor,
  NoResults,
  PageGroups,
  SearchProblem,
  SearchSkeleton,
} from "./search-results";
import { useSearch, type SearchState } from "./use-search";
import { useSpoiler } from "@/components/spoiler/use-spoiler";

/**
 * `/search/?q=` 전체 결과 (PRD FR-130·FR-131, DESIGN §9.3 "검색 오버레이 · 색인" — `/search/`는 같은 묶음, 머리 `--text-h2` + 3px, 혼합안 화면 4,
 * plan M4-14). 정적 페이지라 검색어는 클라이언트가 주소에서 읽는다(CLAUDE §7.1). 폼은 JS 없이도 GET으로 같은 주소에 실린다.
 *
 * - 머리: "검색 · INDEX" + h1 "“{q}” 색인"(검색어 없으면 "검색") + 입력 상자 + "찾기" + 건수 줄.
 * - 묶음: 선수 · 팀(전부) · 대회(찾았을 때만) · 뉴스(20건씩 — "더 보기"). 0건 묶음도 머리는 남긴다. 전부 0건이면 '0' 윤곽.
 * - 1024 이상 목차 열(`SearchToc` — 앱 셸 `contents`)에 유형별 건수 + 묶음 앵커. 두 섬은 이 모듈의 작은 저장소로 결과를 나눈다.
 * - 새 검색은 주소를 바꾼다(`history.pushState` — 뒤로 가기로 앞 검색어).
 */

const PAGE_LIMITS: Readonly<Record<SearchType, number>> = {
  player: 30,
  team: 30,
  competition: 6,
  news: 20,
};

/** 뉴스 더 보기 단위 */
const NEWS_PAGE = 20;

// ─── 주소 검색어 ────────────────────────────────────────────────────────────

const LOCATION_EVENT = "ed:search-location";

function subscribeLocation(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(LOCATION_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(LOCATION_EVENT, onChange);
  };
}

function useLocationQuery(): string {
  return useSyncExternalStore(
    subscribeLocation,
    () => queryFromSearch(window.location.search),
    () => "",
  );
}

// ─── 목차와 나누는 결과 ─────────────────────────────────────────────────────

let shared: SearchState | null = null;
const listeners = new Set<() => void>();

function publish(state: SearchState | null) {
  shared = state;
  listeners.forEach((l) => l());
}

function subscribeShared(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** 1024 이상 목차 — "결과 RESULTS" + 유형별 건수(묶음 앵커). 결과가 없으면 비운다 */
export function SearchToc() {
  const state = useSyncExternalStore(
    subscribeShared,
    () => shared,
    () => null,
  );
  const groups: readonly SearchGroup[] =
    state?.status === "ready" ? state.groups : [];
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 border-t-3 border-ink pt-2.5">
        <p className="text-type-h2 font-extrabold tracking-[-0.025em]">결과</p>
        <span
          lang="en"
          aria-hidden="true"
          className="flex-none font-numeric text-type-rh font-semibold tracking-[0.14em] text-brand-accent-text"
        >
          RESULTS
        </span>
      </div>
      {groups.length > 0 ? (
        <ul role="list" className="mt-2">
          {groups
            .filter((g) => g.type !== "competition" || g.total > 0)
            .map((g) => (
              <li key={g.type}>
                <a
                  href={`#${groupAnchor(g.type)}`}
                  className={cx(
                    "group/row flex min-h-11 items-center gap-2 border-b border-rule text-sm no-underline",
                    g.total === 0 ? "text-ink-2" : "text-ink",
                  )}
                >
                  <span className="underline-offset-3 group-hover/row:underline">
                    {SEARCH_TYPE_LABEL[g.type]}
                  </span>
                  <span
                    aria-hidden="true"
                    className="min-w-4 flex-1 translate-y-1 self-center border-b-2 border-dotted border-ink-3"
                  />
                  <span className="font-numeric text-[17px] leading-none font-semibold text-ink-2 tabular-nums">
                    {g.total}
                  </span>
                </a>
              </li>
            ))}
        </ul>
      ) : (
        <p className="mt-3 text-[12.5px] leading-normal text-ink-2">
          검색하면 유형별 건수가 여기에 나와요
        </p>
      )}
    </>
  );
}

// ─── 본문 ───────────────────────────────────────────────────────────────────

export function SearchScreen({ action }: { action: string }) {
  const query = useLocationQuery();
  const [draft, setDraft] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => new Date());
  const spoiler = useSpoiler();
  // 결과 가리기 스위치를 켜거나 끄면 펼친 카드를 잊는다(M4-15 — 다른 화면의 '보기'와 같은 규칙: 다시 켜면 처음처럼 다 가린다)
  const [seenSpoiler, setSeenSpoiler] = useState(spoiler);
  if (seenSpoiler !== spoiler) {
    setSeenSpoiler(spoiler);
    setRevealed(new Set());
  }
  const { state, more, retry } = useSearch(query, PAGE_LIMITS);

  useEffect(() => {
    publish(state);
  }, [state]);
  useEffect(() => () => publish(null), []);

  const onSubmit = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = normalizeQuery(
      String(new FormData(e.currentTarget).get("q") ?? ""),
    );
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("q", next);
    else url.searchParams.delete("q");
    url.hash = "";
    window.history.pushState(null, "", url);
    window.dispatchEvent(new Event(LOCATION_EVENT));
    setDraft(null);
  }, []);

  const news = state.groups.find((g) => g.type === "news");
  const loadMore = async () => {
    setBusy(true);
    try {
      await more("news", NEWS_PAGE);
    } finally {
      setBusy(false);
    }
  };
  const any = state.groups.some((g) => g.total > 0);
  const inputValue = draft ?? query;

  return (
    <section aria-labelledby="search-h" data-slot="search-page">
      <header className="grid gap-1.5 pt-1.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
          <span>검색</span>
          <span
            lang="en"
            aria-hidden="true"
            className="ml-auto flex-none font-numeric text-type-rh font-semibold tracking-[0.14em] text-brand-accent-text"
          >
            INDEX
          </span>
        </p>
        <h1
          id="search-h"
          className="text-[32px] leading-[1.1] font-extrabold tracking-[-0.04em] [overflow-wrap:anywhere] lg:text-5xl"
        >
          {query ? `“${query}” 색인` : "검색"}
        </h1>
      </header>
      <form
        role="search"
        action={action}
        method="get"
        onSubmit={onSubmit}
        className="mt-3.5 flex items-center gap-2.5 border border-ink py-1 pr-1 pl-3 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ring"
      >
        <label htmlFor="search-q" className="sr-only">
          검색어
        </label>
        <SearchIcon />
        <input
          id="search-q"
          name="q"
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          spellCheck={false}
          maxLength={60}
          placeholder="이름 · 팀 · 기사 제목"
          value={inputValue}
          onChange={(e) => setDraft(e.target.value)}
          className="h-11 min-w-0 flex-1 border-0 bg-transparent text-[19px] leading-none font-extrabold text-ink placeholder:font-normal placeholder:text-ink-2 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        <button
          type="submit"
          className="relative inline-flex min-h-11 items-center justify-center border border-ink px-4.5 text-sm font-extrabold text-ink transition-colors duration-fast ease-print hover:bg-ink hover:text-paper active:translate-y-px"
        >
          찾기
        </button>
      </form>
      <p
        aria-live="polite"
        className="mt-2 text-[13px] leading-normal text-ink-2"
      >
        {state.status === "ready" && any ? (
          <>
            {countSummary(state.groups)} — 선수 · 팀은 한글 · 영문 이름이 같은
            항목으로 모여요
          </>
        ) : null}
        {state.status === "idle"
          ? "선수 · 팀은 한글이나 영문 이름으로, 뉴스는 제목과 태그로 찾아요"
          : null}
      </p>

      {state.status === "loading" ? <SearchSkeleton /> : null}
      {state.status === "error" || state.status === "offline" ? (
        <SearchProblem offline={state.status === "offline"} onRetry={retry} />
      ) : null}
      {state.status === "ready" && !any ? (
        <NoResults query={state.query} />
      ) : null}
      {state.status === "ready" && any ? (
        <PageGroups
          groups={state.groups}
          spoiler={spoiler}
          now={now}
          revealed={revealed}
          onReveal={(url) => setRevealed((prev) => new Set(prev).add(url))}
          moreBusy={busy}
          moreNews={
            news && news.total > news.hits.length ? (
              <p className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[12.5px] text-ink-2">
                  <span className="tabular-nums">{news.hits.length}</span> /{" "}
                  <span className="tabular-nums">{news.total}</span> · 대표 출처
                  시각 최신순
                </span>
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={busy}
                  className="relative inline-flex min-h-11 items-center justify-center border border-ink px-4.5 text-sm font-extrabold text-ink hover:bg-ink hover:text-paper disabled:border-dashed disabled:border-ink-disabled disabled:text-ink-disabled"
                >
                  뉴스 더 보기
                </button>
              </p>
            ) : null
          }
        />
      ) : null}
    </section>
  );
}
