import type { ReactNode } from "react";

/**
 * 고정 쪽 본문 문법 — `/about`(M1-36)과 `/privacy`(M5-05)가 같은 값을 쓴다 (DESIGN §3 `/about` 본문 · §9.1 텍스트 링크)
 *
 * 문단 3종(소개 문장 · 본문 · 보조 설명)과 텍스트 링크 2종(문장 속 · 줄 끝 44px), 외부 링크 표식, 문장 속 숫자.
 * 서버 컴포넌트에서만 쓴다(JS 0).
 */

/** 본문 문단 — 16px, 62ch(뒤표지 설명 문단과 같은 줄 길이) */
export const BODY = "mt-3 max-w-[62ch] leading-[1.6]";
/** 보조 설명 — 13px `--ink-2`(섹션 부제·필터 설명 크기) */
export const NOTE = "mt-3 max-w-[62ch] text-[13px] leading-[1.55] text-ink-2";
/** 절 첫 문단 — 오늘의 5줄 문장 크기(--text-brief) */
export const LEAD = "mt-4 max-w-[62ch] text-type-brief";
/** 본문 안 텍스트 링크 — 레드 800, 밑줄 1px(4px 띄움) → hover 2px(DESIGN §9.2 텍스트 링크, 문장 안이라 44px 높이 없이) */
export const INLINE_LINK =
  "font-extrabold text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2";
/** 줄 끝 텍스트 링크 — 누르는 높이 44px(DESIGN §9.1 텍스트 링크 최소 44px) */
export const ROW_LINK = `${INLINE_LINK} inline-flex min-h-11 items-center`;

/** 외부 링크 표식 ↗ + 화면 밖 "(새 창)" */
export function NewWindow() {
  return (
    <>
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (새 창)</span>
    </>
  );
}

/** 큰 숫자가 아닌 문장 속 숫자 — Barlow 600 1.16em(브리핑 문장 속 숫자 규칙, DESIGN §3.5) */
export function Num({ children }: { children: ReactNode }) {
  return (
    <span className="font-numeric text-[1.16em] leading-none font-semibold tracking-[0.01em] lining-nums tabular-nums">
      {children}
    </span>
  );
}
