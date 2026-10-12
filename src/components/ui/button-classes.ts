/**
 * Button 변형 클래스 문자열 (DESIGN.md §9.2 Button, D0-12) — button.tsx의 `buttonVariants`(cva)가 이 문자열로 만들어진다.
 *
 * 클라이언트 섬(토스트 닫기·테마 토글)은 cva·clsx 없이 이 문자열만 가져다 쓴다(섬 번들 1~2KB 목표). 문자열은 병합하지
 * 않고 이어 붙이므로(src/lib/cx.ts) 한 변형 안에서 같은 속성 클래스가 겹치지 않게 적는다(tests/ui-class-conflicts.test.tsx).
 */

/**
 * 공통 — 인라인 플렉스, 800, 피드백 전환 fast.
 * 밑줄 여부(`no-underline`·`underline`)는 변형마다 정한다 — 공통에 `no-underline`을 두면 텍스트 링크 변형의 `underline`과
 * 같은 속성이 겹쳐 CSS 순서에 따라 결과가 갈린다(cx는 병합하지 않는다, tests/ui-class-conflicts.test.tsx).
 */
export const BUTTON_BASE =
  "relative inline-flex items-center gap-2 font-extrabold select-none transition-[background-color,border-color,color,transform] duration-fast ease-print";

/** 주·보조 공통 — 최소 44px, 좌우 18px, 14px 800, 1px 테두리, 누르면 1px 내려감. `<a>`에 써도 밑줄 없음 */
const BOX =
  "min-h-11 justify-center border px-4.5 text-sm no-underline active:translate-y-px";

/** 비활성 — 면 없음 + --ink-disabled 글자·점선 테두리(opacity 금지, DESIGN §9.1) */
const DISABLED_BOX =
  "disabled:border-dashed disabled:border-ink-disabled disabled:bg-transparent disabled:text-ink-disabled aria-disabled:border-dashed aria-disabled:border-ink-disabled aria-disabled:bg-transparent aria-disabled:text-ink-disabled";

export const BUTTON_VARIANTS = {
  /** 주(shadcn default) — 잉크 면 → hover 레드 면 */
  primary: `${BOX} border-ink bg-ink text-paper hover:border-brand-accent hover:bg-brand-accent hover:text-brand-accent-foreground ${DISABLED_BOX}`,
  /** 보조(shadcn outline) — 1px 잉크 테두리 → hover·aria-pressed 반전 */
  secondary: `${BOX} border-ink bg-transparent text-ink hover:bg-ink hover:text-paper aria-pressed:bg-ink aria-pressed:text-paper ${DISABLED_BOX}`,
  /** 텍스트 링크(shadcn link) — 레드 글자 800 13px, 밑줄 1px(4px 띄움) → hover 2px, 최소 44px */
  link: "min-h-11 bg-transparent text-[13px] text-brand-accent-text underline decoration-1 underline-offset-4 hover:decoration-2 disabled:text-ink-disabled aria-disabled:text-ink-disabled",
  /** 아이콘(shadcn ghost) — 44×44, 면 없음 → hover 면 currentColor 12%, 열림 면 --paper-2 */
  icon: "h-11 min-w-11 justify-center bg-transparent px-2.5 no-underline hover:bg-current/12 aria-expanded:bg-paper-2 disabled:border-dashed disabled:bg-transparent disabled:text-ink-disabled aria-disabled:border-dashed aria-disabled:bg-transparent aria-disabled:text-ink-disabled",
} as const;

/** 아이콘 상자형 — 1px --ink-2 테두리 + --ink 글자, 열림이면 테두리 --ink(아이콘 변형에만 쓴다) */
export const BUTTON_BOX =
  "border border-ink-2 text-ink aria-expanded:border-ink";

/** 아이콘 버튼(상자 없음) 전체 클래스 — `buttonVariants({ variant: "icon" })`와 같다 */
export const ICON_BUTTON = `${BUTTON_BASE} ${BUTTON_VARIANTS.icon}`;
