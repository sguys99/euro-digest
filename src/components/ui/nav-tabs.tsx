import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 링크 내비게이션 탭 — 하단 탭(1023 이하)·상단 내비(1024 이상) (DESIGN.md §9.2 Tabs, D0-12)
 *
 * ARIA 탭(`role="tablist"`)이 아니라 정적 페이지 사이를 오가는 `<nav>` + 링크다. 현재 페이지는 `aria-current="page"`이고
 * 색 외에 막대(3px --brand-accent)와 굵기로 표시한다. 비활성 상태는 없다 — 미완성 섹션은 탭을 숨긴다(plan §2.3).
 * 보이는 폭은 앱 셸(M1-30)이 정한다: 하단 탭 `lg:hidden`(sticky bottom, z 20), 상단 내비 `hidden lg:flex`.
 * 내부 링크는 `next/link`라 basePath가 붙는다(라우트는 `routes.*`로 만든다). 서버 컴포넌트.
 */

// ─── 하단 탭 ────────────────────────────────────────────────────────────────

/** 하단 탭 막대 — 탭 수만큼 같은 폭(M1 2개 → 최종 5개), 위 1px --ink 괘선, 면 --paper */
export function BottomTabs({
  className,
  "aria-label": ariaLabel = "하단 탭",
  ...props
}: ComponentProps<"nav">) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "grid auto-cols-fr grid-flow-col border-t border-ink bg-paper transition-colors duration-base ease-print",
        className,
      )}
      {...props}
    />
  );
}

export interface NavTabProps extends Omit<
  ComponentProps<typeof Link>,
  "children"
> {
  /** 현재 페이지면 `aria-current="page"` */
  current?: boolean;
  children: ReactNode;
}

/** 하단 탭 하나 — 아이콘 22px + 라벨 11px 800 --ink-2, 최소 58px. 현재 = 글자 --ink + 위쪽 3px 막대(좌우 24% 안쪽) */
export function BottomTab({
  current = false,
  icon,
  className,
  children,
  ...props
}: NavTabProps & { icon: ReactNode }) {
  return (
    <Link
      aria-current={current ? "page" : undefined}
      className={cn(
        "relative flex min-h-14.5 flex-col items-center justify-center gap-0.75 text-[11px] font-extrabold text-ink-2 no-underline",
        "transition-colors duration-fast ease-print hover:text-ink aria-[current=page]:text-ink",
        "before:absolute before:inset-x-6/25 before:-top-px before:hidden before:h-0.75 before:bg-brand-accent before:content-['']",
        "aria-[current=page]:before:block",
        className,
      )}
      {...props}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}

// ─── 상단 내비 ──────────────────────────────────────────────────────────────

/** 상단 내비(티켓 아래) — 간격 28px, 아래 1px --rule */
export function TopNav({
  className,
  "aria-label": ariaLabel = "주요 메뉴",
  ...props
}: ComponentProps<"nav">) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "flex items-center gap-7 border-b border-rule px-1",
        className,
      )}
      {...props}
    />
  );
}

/** 상단 내비 링크 — 15px 800 --ink-2, 최소 48px. 현재 = 글자 --ink + 아래 3px 막대 */
export function TopNavLink({
  current = false,
  className,
  children,
  ...props
}: NavTabProps) {
  return (
    <Link
      aria-current={current ? "page" : undefined}
      className={cn(
        "relative flex min-h-12 min-w-11 items-center justify-center text-[15px] font-extrabold text-ink-2 no-underline",
        "transition-colors duration-fast ease-print hover:text-ink aria-[current=page]:text-ink",
        "after:absolute after:inset-x-0 after:-bottom-px after:hidden after:h-0.75 after:bg-brand-accent after:content-['']",
        "aria-[current=page]:after:block",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
