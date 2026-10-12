import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { ROW_GRID } from "./card";

/**
 * Skeleton — 움직이지 않는 교정쇄 (DESIGN.md §9.2 Skeleton, D0-12)
 *
 * - 면 --paper-3(다크 값은 토큰이 바꾼다), 직각, **움직이지 않는다**. shadcn 기본 `animate-pulse rounded-md bg-accent`를
 *   쓰지 않는다(반짝임·무한 반복 금지, DESIGN §6.2).
 * - 장식이라 `aria-hidden="true"`. 로딩 안내는 둘레 영역의 `aria-busy="true"`와 상태 문구(예: 화면 밖 "불러오는 중")로 준다.
 * - 실제 5줄 행·카드와 같은 격자·여백이라 데이터가 들어와도 높이가 거의 바뀌지 않는다(CLS ≤ 0.05).
 * - 서버 컴포넌트라 JS를 만들지 않는다.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("bg-paper-3", className)}
      {...props}
    />
  );
}

/** 오늘의 5줄 한 행 — 번호 24×34 · 줄 16px 두 줄(둘째 72%) · 탭 --tab-w × 44 */
export function BriefRowSkeleton({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        ROW_GRID,
        "border-b border-rule pt-3.25 pb-3.5 lg:pt-3.5 lg:pb-3.75",
        className,
      )}
      {...props}
    >
      <Skeleton className="h-8.5 w-6" />
      <div>
        <Skeleton className="my-1.5 h-4" />
        <Skeleton className="my-1.5 h-4 w-18/25" />
      </div>
      <Skeleton className="h-11 w-tab-w" />
    </div>
  );
}

/** 뉴스 카드 한 장 — 번호 26×22 · 도장 64×20 · 제목 18px 두 줄(둘째 64%) · 메타 44%×13 · 탭, 최소 높이 118px */
export function CardSkeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        ROW_GRID,
        "min-h-29.5 border-b border-rule pt-3.75 pb-3.25 lg:pt-4.5 lg:pb-3.75",
        className,
      )}
      {...props}
    >
      <Skeleton className="h-5.5 w-6.5" />
      <div>
        <Skeleton className="h-5 w-16" />
        <Skeleton className="mt-2.5 h-4.5" />
        <Skeleton className="mt-1.5 h-4.5 w-16/25" />
        <Skeleton className="mt-3.5 h-3.25 w-11/25" />
      </div>
      <Skeleton className="h-11 w-tab-w" />
    </div>
  );
}
