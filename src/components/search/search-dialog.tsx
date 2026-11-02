"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { ICON_BUTTON } from "@/components/ui/button-classes";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import { withBasePath } from "@/lib/paths";
import { normalizeQuery, type SearchType } from "@/lib/search/model";

import {
  countSummary,
  flatHits,
  ListboxGroups,
  NoResults,
  optionId,
  SearchProblem,
  SearchSkeleton,
} from "./search-results";
import { useSearch } from "./use-search";
import { useSpoiler } from "@/components/spoiler/use-spoiler";

/**
 * 검색 오버레이 (PRD FR-130~132, DESIGN §9.3 "검색 오버레이 · 색인" · §10 D2 화면, 혼합안 `docs/design/d2/concept-mix.html` `.sov`, plan M4-14)
 *
 * 마스트헤드 검색 버튼 섬(search-button.tsx)이 처음 열 때 **이 모듈을 지연 로드**한다(초기 JS 예산 밖). 열리면 Pagefind 런타임도 받기 시작한다.
 * - 판: 1023 이하 전면 · 1024 이상 폭 720px(위 56px, 1px `--ink` + `--shadow-print`), 뒤 막 = 뒤표지색 62%.
 * - 입력 줄 19px 800 + 아래 3px `--ink`(입력에 포커스면 `--brand-accent`). 입력 전 = 한국 선수 가나다 색인(서버가 그린 `index`).
 *   입력 후 = 유형 묶음(선수 · 팀 · 대회 · 뉴스 상위 3) + 요약 줄 "… — 전체 결과 보기"(`/search/?q=`). 아래 키 안내 줄(장식).
 * - **접근성**(§10): `role="dialog" aria-modal="true"` + 입력 `role="combobox"`(`aria-expanded` · `aria-controls` · `aria-activedescendant`) +
 *   listbox 안 group · option만. ↑↓(순환) · Enter(선택 옵션 열기 — 없으면 전체 결과) · Esc(닫기). Tab은 판 안에서 돈다(포커스 가둠).
 *   닫으면 연 요소로 포커스가 돌아간다(버튼 섬). 결과 건수는 요약 줄(`aria-live="polite"`)이 알린다.
 * - 상태 4종: 로딩(스켈레톤) · 빈 결과('0' 윤곽) · 오류(색인을 받지 못함 — 다시 시도) · 오프라인.
 * - 결과 가림(`data-spoiler="on"`)이면 spoiler 뉴스 제목은 빗금 띠(search-results.tsx).
 */

/** 오버레이에서 처음 보여 줄 수 */
const OVERLAY_LIMITS: Readonly<Record<SearchType, number>> = {
  player: 5,
  team: 5,
  competition: 3,
  news: 3,
};

const FOCUSABLE =
  'input:not([disabled]), button:not([disabled]), a[href]:not([tabindex="-1"])';

export default function SearchDialog({
  index,
  onClose,
}: {
  /** 입력 전 색인(서버 렌더 — 한국 선수 가나다) */
  index: ReactNode;
  onClose(): void;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const inputId = `${uid}-q`;
  const listId = `${uid}-r`;
  const headingId = `${uid}-h`;
  const [value, setValue] = useState("");
  const [active, setActive] = useState(-1);
  const [now] = useState(() => new Date());
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const spoiler = useSpoiler();
  const { state, query, retry } = useSearch(value, OVERLAY_LIMITS, {
    debounceMs: 120,
    preload: true,
  });

  const groups = state.status === "ready" ? state.groups : [];
  const hits = flatHits(groups);
  const ids = groups.flatMap((g) =>
    g.hits.map((_, i) => optionId(uid, g.type, i)),
  );
  const expanded = hits.length > 0;
  const selected = active >= 0 && active < hits.length ? active : -1;

  // 열리면 입력에 포커스 + 뒤 페이지 스크롤 잠금(닫히면 되돌림)
  useEffect(() => {
    input.current?.focus();
    const body = document.body;
    const before = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = before;
    };
  }, []);

  // 선택 옵션이 보이게
  useEffect(() => {
    if (selected < 0) return;
    document
      .getElementById(ids[selected] ?? "")
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, ids]);

  const fullHref = withBasePath(
    `/search/?q=${encodeURIComponent(normalizeQuery(value))}`,
  );

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (hits.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive(
        selected < 0
          ? step > 0
            ? 0
            : hits.length - 1
          : (selected + step + hits.length) % hits.length,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target =
        selected >= 0 ? document.getElementById(ids[selected] ?? "") : null;
      if (target) target.click();
      else if (query) window.location.assign(fullHref);
    }
  }

  function onPanelKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const items = Array.from(
      panel.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // 같은 탭에서 여는 링크(색인 · 선수 · 팀 · 전체 결과)를 누르면 닫는다 — 새 창(뉴스 원문)은 그대로
  function onPanelClick(e: MouseEvent<HTMLDivElement>) {
    const link = (e.target as Element).closest("a[href]");
    if (link && link.getAttribute("target") !== "_blank") onClose();
  }

  const newsGroup = groups.find((g) => g.type === "news");
  const shownNews = newsGroup?.hits.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center lg:px-8 lg:py-14">
      <div
        aria-hidden="true"
        data-search-backdrop=""
        onClick={onClose}
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--colophon)_62%,transparent)]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        data-slot="search-dialog"
        onKeyDown={onPanelKey}
        onClick={onPanelClick}
        className="relative flex h-full w-full min-w-0 flex-col bg-paper text-ink lg:h-auto lg:max-h-[calc(100dvh-112px)] lg:max-w-180 lg:border lg:border-ink lg:shadow-print"
      >
        <h2 id={headingId} className="sr-only">
          검색
        </h2>
        <div className="flex items-center gap-2.5 border-b-3 border-ink py-1.5 pr-1.5 pl-3.5 focus-within:shadow-[inset_0_-3px_0_var(--brand-accent)] lg:py-2 lg:pr-2.5 lg:pl-5">
          <SearchIcon />
          <label htmlFor={inputId} className="sr-only">
            검색어
          </label>
          <input
            ref={input}
            id={inputId}
            type="search"
            role="combobox"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={selected >= 0 ? ids[selected] : undefined}
            autoComplete="off"
            enterKeyHint="search"
            spellCheck={false}
            maxLength={60}
            placeholder="이름 · 팀 · 기사 제목"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setActive(-1);
            }}
            onKeyDown={onInputKey}
            className="h-11 min-w-0 flex-1 border-0 bg-transparent text-[19px] leading-none font-extrabold tracking-[-0.02em] text-ink placeholder:font-normal placeholder:text-ink-2 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          <button
            type="button"
            aria-label="검색 닫기"
            onClick={onClose}
            className={ICON_BUTTON}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          {state.status === "idle" ? index : null}
          {state.status === "loading" ? (
            <SearchSkeleton className="px-3.5 lg:px-5.5" />
          ) : null}
          <ListboxGroups
            id={listId}
            prefix={uid}
            groups={groups}
            active={selected}
            spoiler={spoiler}
            now={now}
            onHover={setActive}
          />
          <div aria-live="polite" className="px-3.5 lg:px-5.5">
            {state.status === "ready" && expanded ? (
              <p className="mt-2.5 mb-2 text-[12.5px] text-ink-2">
                {countSummary(groups)}
                {newsGroup && newsGroup.total > shownNews ? (
                  <>
                    {" "}
                    (상위 <span className="tabular-nums">{shownNews}</span>)
                  </>
                ) : null}{" "}
                —{" "}
                <a
                  href={fullHref}
                  className="relative inline-flex min-h-11 items-center text-[13px] font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
                >
                  전체 결과 보기
                </a>
              </p>
            ) : null}
            {state.status === "ready" && !expanded ? (
              <NoResults query={state.query} />
            ) : null}
            {state.status === "error" || state.status === "offline" ? (
              <SearchProblem
                offline={state.status === "offline"}
                onRetry={retry}
              />
            ) : null}
          </div>
        </div>

        <p
          aria-hidden="true"
          className="flex flex-wrap gap-x-3.5 gap-y-1 border-t border-ink px-3.5 py-2.5 text-xs text-ink-2 lg:px-5.5"
        >
          <span>
            <Key>↑</Key>
            <Key>↓</Key>이동
          </span>
          <span>
            <Key>Enter</Key>열기
          </span>
          <span>
            <Key>Esc</Key>닫기
          </span>
          <span>
            <Key>/</Key>열기
          </span>
        </p>
      </div>
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="mr-1 border border-ink-2 px-1.25 pt-0.5 pb-px font-numeric text-[12.5px] leading-none font-semibold text-ink">
      {children}
    </kbd>
  );
}
