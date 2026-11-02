"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { BUTTON_BASE, BUTTON_VARIANTS } from "@/components/ui/button-classes";
import { SearchIcon } from "@/components/ui/icons";

/**
 * 마스트헤드 검색 버튼 + 단축키 (PRD FR-132, DESIGN §9.3 티켓 마스트헤드 도구 · 검색 오버레이, plan M4-14) — 모든 페이지에 들어가는 작은 섬.
 *
 * - 1023 이하 = 아이콘 버튼 44×44, 1024 이상 = 상자형(1px `--ticket-fg-2` 테두리, "검색" 14px 800 + 키 상자 `⌘K`(Mac) · `Ctrl K`(그 밖)).
 *   접근 이름 "검색" + `aria-keyshortcuts="Control+K Meta+K"`.
 * - 단축키: ⌘K / Ctrl+K만(어디서나 — 브라우저 기본 동작은 막는다). **글자 하나 단축키 `/`는 뺐다**(2026-11-02 사용자 결정 — WCAG 2.1.4
 *   문자 키 단축키: 끌 수도 바꿀 수도 없어 음성 입력 · 실수 입력과 부딪힌다, DECISIONS D2 §8 #43).
 * - 키 상자 글자는 하이드레이션 뒤 플랫폼으로 정한다(`useSyncExternalStore` — 서버 · 하이드레이션 값 `Ctrl K`, Mac이면 그 뒤 `⌘K`). 상자 폭을
 *   고정해 글자가 바뀌어도 버튼 크기가 그대로다.
 * - 오버레이 본체(search-dialog.tsx)와 Pagefind 런타임은 **처음 열 때** 받는다(버튼에 마우스·포커스가 오면 본체를 미리 받는다) — 이 섬은
 *   버튼과 키 처리뿐이다(초기 JS 예산 — PRD §15 D21).
 * - 오버레이는 `document.body`에 포털로 그린다(티켓의 글자색·포커스 링 재정의를 물려받지 않게). 닫히면 연 요소(버튼 또는 단축키를 누를 때
 *   포커스가 있던 요소)로 포커스를 돌린다(DESIGN §10).
 */

const loadDialog = () => import("./search-dialog");
const SearchDialog = lazy(loadDialog);

/** ⌘K · Ctrl+K 판정(순수 — 테스트). 입력 필드 안에서도 연다 — 조합 키라 글자 입력과 겹치지 않는다 */
export function isSearchShortcut(
  e: Pick<
    KeyboardEvent,
    | "key"
    | "metaKey"
    | "ctrlKey"
    | "altKey"
    | "shiftKey"
    | "isComposing"
    | "defaultPrevented"
  >,
): boolean {
  if (e.isComposing || e.defaultPrevented) return false;
  return (
    (e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "k" || e.key === "K")
  );
}

/** Mac 계열(⌘) — 키 상자 글자만 정한다(판정은 ⌘ · Ctrl 둘 다 받는다) */
function isMacLike(): boolean {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent;
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}
const noSubscribe = () => () => {};

const BUTTON = `${BUTTON_BASE} ${BUTTON_VARIANTS.icon} lg:min-w-33 lg:justify-start lg:border lg:border-ticket-fg-2 lg:px-3`;

export function SearchButton({ index }: { index: ReactNode }) {
  const [open, setOpen] = useState(false);
  const mac = useSyncExternalStore(noSubscribe, isMacLike, () => false);
  const button = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const show = useCallback(() => {
    const focused = document.activeElement;
    opener.current =
      focused instanceof HTMLElement && focused !== document.body
        ? focused
        : button.current;
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    const back = opener.current ?? button.current;
    opener.current = null;
    // 오버레이가 사라진 다음 프레임에 — 판 안 요소가 포커스를 쥔 채 지워지면 body로 떨어진다
    window.requestAnimationFrame(() => back?.focus());
  }, []);

  useEffect(() => {
    if (open) return;
    function onKey(e: KeyboardEvent) {
      if (!isSearchShortcut(e)) return;
      e.preventDefault();
      show();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, show]);

  const prefetch = () => {
    loadDialog().catch(() => {});
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label="검색"
        aria-keyshortcuts="Control+K Meta+K"
        aria-haspopup="dialog"
        data-slot="search-button"
        onClick={show}
        onPointerEnter={prefetch}
        onFocus={prefetch}
        className={BUTTON}
      >
        <SearchIcon />
        <span className="hidden flex-1 text-left text-sm font-extrabold lg:inline">
          검색
        </span>
        <kbd
          aria-hidden="true"
          className="hidden min-w-12 border border-ticket-fg-2 px-1.5 pt-0.75 pb-0.5 text-center font-numeric text-[13px] leading-none font-semibold whitespace-nowrap text-ticket-fg-2 tabular-nums lg:inline-block"
        >
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      {open
        ? createPortal(
            <Suspense fallback={null}>
              <SearchDialog index={index} onClose={close} />
            </Suspense>,
            document.body,
          )
        : null}
    </>
  );
}
