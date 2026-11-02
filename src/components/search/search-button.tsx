"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { BUTTON_BASE, BUTTON_VARIANTS } from "@/components/ui/button-classes";
import { SearchIcon } from "@/components/ui/icons";

/**
 * 마스트헤드 검색 버튼 + 단축키 (PRD FR-132, DESIGN §9.3 티켓 마스트헤드 도구 · 검색 오버레이, plan M4-14) — 모든 페이지에 들어가는 작은 섬.
 *
 * - 1023 이하 = 아이콘 버튼 44×44, 1024 이상 = 상자형(1px `--ticket-fg-2` 테두리, "검색" 14px 800 + `/` 키 상자). 접근 이름 "검색 (단축키 /)".
 * - 단축키: `/`(입력 필드·편집 영역 안에서는 무시 — 글자를 쳐야 하므로) · ⌘K / Ctrl+K(어디서나 — 브라우저 기본 동작은 막는다).
 * - 오버레이 본체(search-dialog.tsx)와 Pagefind 런타임은 **처음 열 때** 받는다(버튼에 마우스·포커스가 오면 본체를 미리 받는다) — 이 섬은
 *   버튼과 키 처리뿐이다(초기 JS 예산 — PRD §15 D21).
 * - 오버레이는 `document.body`에 포털로 그린다(티켓의 글자색·포커스 링 재정의를 물려받지 않게). 닫히면 연 요소(버튼 또는 단축키를 누를 때
 *   포커스가 있던 요소)로 포커스를 돌린다(DESIGN §10).
 */

const loadDialog = () => import("./search-dialog");
const SearchDialog = lazy(loadDialog);

/** 단축키를 무시할 대상 — 글자를 입력하는 곳 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return ![
    "checkbox",
    "radio",
    "button",
    "submit",
    "reset",
    "range",
    "color",
    "file",
  ].includes(type);
}

/** `/` · ⌘K · Ctrl+K 판정(순수 — 테스트) */
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
  typing: boolean,
): boolean {
  if (e.isComposing || e.defaultPrevented) return false;
  if (
    (e.metaKey || e.ctrlKey) &&
    !e.altKey &&
    (e.key === "k" || e.key === "K")
  ) {
    return true;
  }
  return e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey;
}

const BUTTON = `${BUTTON_BASE} ${BUTTON_VARIANTS.icon} lg:min-w-33 lg:justify-start lg:border lg:border-ticket-fg-2 lg:px-3`;

export function SearchButton({ index }: { index: ReactNode }) {
  const [open, setOpen] = useState(false);
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
      if (!isSearchShortcut(e, isTyping(e.target))) return;
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
        aria-label="검색 (단축키 /)"
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
        <kbd className="hidden border border-ticket-fg-2 px-1.5 pt-0.75 pb-0.5 font-numeric text-[13px] leading-none font-semibold text-ticket-fg-2 tabular-nums lg:inline">
          /
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
