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

/**
 * 로딩 상태 화면(DESIGN §9.3 상태 화면 4종 ① — 혼합안 `.skel` "5줄 블록 + 카드 3장"): 섹션 머리 자리(3px 잉크 괘선 + 120×24 막대) + 5줄 행 3개 +
 * 카드 3장. 둘레가 `role="status"` + 화면 밖 "불러오는 중"(조각은 모두 `aria-hidden`).
 *
 * 쓰는 곳(M1-37 결정): **견본뿐**. 정적 export에서 `app/loading.tsx`로 클라이언트 이동 대기 화면에 쓰려 했으나, 로딩 경계가 생기면 정적 HTML이
 * 대기 화면을 먼저 내보내고 본문을 숨긴 채 인라인 스크립트로 바꿔 끼운다 — JS가 꺼진 브라우저에는 스켈레톤만 남았다(실측). 미리 받기(prefetch)
 * 덕에 이동은 120~170ms(느린 응답 400ms 지연에서도 이전 지면 유지 → 바로 교체, CLS 0)라 대기 화면이 필요 없다. 클라이언트에서 데이터를 받는
 * 화면(M4 검색 결과 등)이 생기면 그 자리에 쓴다.
 */
export function LoadingSkeleton({
  rows = 3,
  cards = 3,
  headClassName,
  className,
  ...props
}: ComponentProps<"div"> & {
  rows?: number;
  cards?: number;
  /** 머리 자리 여백(견본 틀 — 혼합안 `.frame .skel>.sec-h` 오른쪽 14px) */
  headClassName?: string;
}) {
  return (
    <div role="status" className={className} {...props}>
      <span className="sr-only">불러오는 중</span>
      <div
        aria-hidden="true"
        className={cn("border-t-3 border-ink pt-2.5", headClassName)}
      >
        <Skeleton className="h-6 w-30" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <BriefRowSkeleton key={`r${i}`} />
      ))}
      {Array.from({ length: cards }, (_, i) => (
        <CardSkeleton key={`c${i}`} />
      ))}
    </div>
  );
}
