import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cx } from "@/lib/cx";

import { BUTTON_BASE, BUTTON_BOX, BUTTON_VARIANTS } from "./button-classes";

/**
 * Button (DESIGN.md §9.2 Button, D0-12) — shadcn Button의 코드 패턴(cva + 클래스 합치기)만 빌리고 모양은 DESIGN 규칙이다.
 * 서버 컴포넌트(상태·이벤트 없음)라 JS를 만들지 않는다. 클릭 처리가 필요하면 클라이언트 섬에서 onClick을 넘긴다.
 * 섬 안에서도 쓰이므로 tailwind-merge(`cn`) 대신 `cx`(병합 없음)로 합친다 — 바깥 `className`은 변형과 겹치지 않는
 * 여백·배치만 준다(src/lib/cx.ts). 그래서 변형끼리도 같은 속성 클래스가 겹치지 않게 적는다.
 *
 * | 변형        | shadcn 대응 | 기본                               | hover                         | 선택                      | 비활성 |
 * |-------------|-------------|------------------------------------|-------------------------------|---------------------------|--------|
 * | `primary`   | default     | 면·테두리 --ink, 글자 --paper      | 면·테두리 --brand-accent       | (토글은 Switch)            | 면 없음 · --ink-disabled 글자 · 점선 |
 * | `secondary` | outline     | 면 없음, 1px --ink                 | 면 --ink, 글자 --paper(반전)   | aria-pressed = hover 반전  | 같음 |
 * | `link`      | link        | --brand-accent-text 800 13px, 밑줄 1px(4px 띄움) | 밑줄 2px          | –                         | 글자 --ink-disabled |
 * | `icon`      | ghost       | 44×44, 면 없음, 글자 상속           | 면 currentColor 12%           | aria-expanded = 면 --paper-2 | 글자 --ink-disabled · 점선 |
 *
 * - `box`(아이콘 상자형): 1px --ink-2 테두리 + --ink 글자, 열림(aria-expanded)이면 테두리 --ink.
 * - 모서리 0, 블러 그림자 없음, 투명도로 흐리게 하지 않는다(DESIGN §9.1). 포커스 링은 globals.css `:focus-visible`
 *   (3px --ring, 2px 띄움)을 그대로 쓰고, 색 면 안에서는 바깥 요소가 `--ring`을 바꾼다.
 * - 주·보조는 최소 높이 44px · 좌우 18px · 14px 800, 누르면 1px 내려간다(fast).
 * - `aria-disabled="true"`도 `disabled`와 같은 모양이다(포커스는 남기고 동작만 막을 때 — 동작 막기는 호출하는 쪽 책임).
 * - `<a>`·`next/link`에는 `buttonVariants()` 클래스를 그대로 쓴다(예: 텍스트 링크).
 * - 변형 문자열의 단일 출처는 `button-classes.ts`다(클라이언트 섬은 cva 없이 `ICON_BUTTON` 등을 바로 쓴다).
 */

export const buttonVariants = cva(BUTTON_BASE, {
  variants: {
    variant: BUTTON_VARIANTS,
    box: { true: BUTTON_BOX, false: "" },
  },
  defaultVariants: { variant: "primary", box: false },
});

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export interface ButtonProps
  extends ComponentProps<"button">, ButtonVariantProps {}

/** 버튼. `type` 기본값은 "button"(폼 제출 아님). */
export function Button({
  variant,
  box,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(buttonVariants({ variant, box }), className)}
      {...props}
    />
  );
}

/**
 * 2칸 스위치(DESIGN §9.2 Button — 결과 가리기 스위치). 티켓 면 위에 놓이는 모양이다:
 * 높이 30px 2칸("끔"·"켬"), 테두리 1px --ticket-fg, 선택 칸 면 --ticket-fg + 글자 --ticket. 누르는 영역은 위아래 8px·
 * 좌우 4px 넓혀 44px 이상(`::after`).
 *
 * 접근성: `role="switch"` + `aria-checked`. 접근 이름은 보이는 라벨을 `aria-labelledby`로 이어서 준다(필수).
 * 상태는 `checked`로 받는 제어 컴포넌트다 — 클릭 처리는 클라이언트 섬이 onClick으로 넘긴다(M4-15).
 */
export interface SwitchProps extends Omit<
  ComponentProps<"button">,
  "role" | "aria-checked"
> {
  checked: boolean;
  /** 접근 이름 — 보이는 라벨의 id */
  "aria-labelledby": string;
  /** 끈 칸 글자(기본 "끔") */
  offLabel?: string;
  /** 켠 칸 글자(기본 "켬") */
  onLabel?: string;
}

const SWITCH_CELL =
  "grid min-w-8.5 place-items-center px-2 transition-colors duration-fast ease-print";
const SWITCH_CELL_ON = "bg-ticket-fg text-ticket";

export function Switch({
  checked,
  offLabel = "끔",
  onLabel = "켬",
  className,
  type = "button",
  ...props
}: SwitchProps) {
  return (
    <button
      type={type}
      role="switch"
      aria-checked={checked}
      className={cx(
        "relative inline-grid h-7.5 grid-cols-2 border border-ticket-fg bg-transparent p-0 text-[12.5px] font-extrabold text-ticket-fg",
        "after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']",
        className,
      )}
      {...props}
    >
      <span className={cx(SWITCH_CELL, !checked && SWITCH_CELL_ON)}>
        {offLabel}
      </span>
      <span className={cx(SWITCH_CELL, checked && SWITCH_CELL_ON)}>
        {onLabel}
      </span>
    </button>
  );
}
