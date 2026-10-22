import type { ComponentProps, ReactNode } from "react";

import type { CompId } from "@/lib/schema/common";
import { cn } from "@/lib/utils";

import {
  COMPETITION_HEAD,
  COMPETITION_HEAD_LIVE,
  COMPETITION_RING,
} from "./competition";

/**
 * 섹션 머리 + 필터 머리 색 면 (DESIGN.md §9.3 섹션 머리 · §9.2 Tabs "필터 머리 색 면", D0-12)
 *
 * 기본: 위 3px --ink 괘선(얇은 머리는 1px), 위 10px, 제목 --text-h2 800 + 러닝 헤드(영문 대문자, 장식). 기준선 정렬, 양끝 배치.
 * 대회 필터(`filter`) — 1024 이상 목차·`?comp=`에서만: 면·위 괘선 = 대회 색, 글자 = 면 위 글자색, 러닝 헤드 숨김,
 * 오른쪽에 약칭 상자 + "해제" 버튼. 색 면 안 포커스 링은 면 위 글자색. 색 면 전환은 base(DESIGN §6.2 색 면).
 * 서버 컴포넌트 — "해제" 버튼은 `filter-clear-button.tsx`(`FilterClearButton`, `cx` — 섬이 import해도 tailwind-merge가
 * 들어가지 않게 이 파일과 나눴다)를 `filter.clear`로 넘긴다.
 *
 * `liveFilter`(M1-33 뉴스 피드 머리): 서버 HTML은 기본 머리이고, 필터 부트 스크립트·섬이 머리 요소의 속성만 바꿔 모양을 고른다 —
 * `data-comp="{대회 ID}"` = 대회 색 면(위 `filter`와 같은 값) + `liveFilter.comp` 칸, `data-team` = 팀 칸(색 면 없음 — 대회 색이
 * 아니라서). 둘 다 켜지면 색 면에 두 칸. 칸이 켜지면 러닝 헤드는 숨기고, 좁은 폭에서 넘치면 다음 줄로 내려간다(flex-wrap).
 */

export interface SectionHeadProps extends Omit<
  ComponentProps<"div">,
  "children"
> {
  /** 제목 */
  heading: ReactNode;
  /** 제목 요소(기본 h2). 섹션 머리가 그 페이지의 제목이면 h1(예: `/news/` "뉴스" — 워드마크가 h1이 아닌 페이지) */
  headingAs?: "h1" | "h2" | "h3" | "p";
  headingId?: string;
  /** 러닝 헤드(영문 대문자 원문 — STARTING FIVE·SQUAD …). 장식이라 `aria-hidden`·`lang="en"` */
  runningHead?: string;
  /** 얇은 머리(위 1px, 제목 16px · ≥1024 17px) */
  thin?: boolean;
  /** 대회 필터 색 면 — 약칭 상자 + 해제 버튼(`clear`) */
  filter?: { comp: CompId; short: string; clear: ReactNode };
  /**
   * 속성으로 바뀌는 필터 머리(M1-33) — `comp`: 머리에 `data-comp`가 붙으면 보이는 칸(약칭 상자 + 해제), `team`: `data-team`이면
   * 보이는 칸(팀 상자 + 해제). 머리 요소의 속성은 부르는 쪽(필터 섬)이 바꾼다
   */
  liveFilter?: { comp: ReactNode; team: ReactNode };
}

export function SectionHead({
  heading,
  headingAs: Heading = "h2",
  headingId,
  runningHead,
  thin = false,
  filter,
  liveFilter,
  className,
  ...props
}: SectionHeadProps) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 border-t-3 border-ink pt-2.5",
        "transition-[background-color,border-color,color] duration-base ease-print",
        thin && "border-t",
        filter && [
          "items-center py-1.5 pr-1 pl-3",
          COMPETITION_HEAD[filter.comp],
          COMPETITION_RING[filter.comp],
        ],
        liveFilter && [
          "group/head flex-wrap gap-y-1",
          // 대회 색 면(위 `filter`와 같은 여백) · 팀 칸(색 면 없이 세로 가운데만)
          "data-comp:items-center data-comp:py-1.5 data-comp:pr-1 data-comp:pl-3",
          "data-team:items-center data-team:py-1.5 data-team:pr-1",
          COMPETITION_HEAD_LIVE,
        ],
        className,
      )}
      {...props}
    >
      <Heading
        id={headingId}
        className={cn(
          "font-extrabold",
          thin
            ? "text-base lg:text-[17px]"
            : "text-type-h2 tracking-[-0.025em]",
        )}
      >
        {heading}
      </Heading>
      {filter ? (
        <span className="inline-flex items-center gap-1">
          <FilterBadge>{filter.short}</FilterBadge>
          {filter.clear}
        </span>
      ) : liveFilter ? (
        <>
          {runningHead ? (
            <RunningHead className="group-data-comp/head:hidden group-data-team/head:hidden">
              {runningHead}
            </RunningHead>
          ) : null}
          <span className="hidden flex-wrap items-center justify-end gap-x-2 gap-y-1 group-data-comp/head:inline-flex group-data-team/head:inline-flex">
            <span className="hidden items-center gap-1 group-data-comp/head:inline-flex">
              {liveFilter.comp}
            </span>
            <span className="hidden items-center gap-1 group-data-team/head:inline-flex">
              {liveFilter.team}
            </span>
          </span>
        </>
      ) : runningHead ? (
        <RunningHead>{runningHead}</RunningHead>
      ) : null}
    </div>
  );
}

/** 러닝 헤드 — --text-rh Barlow 600, 자간 0.14em, --brand-accent-text. `text-transform` 없이 원문 대문자 */
export function RunningHead({
  className,
  ...props
}: Omit<ComponentProps<"span">, "lang" | "aria-hidden">) {
  return (
    <span
      lang="en"
      aria-hidden="true"
      className={cn(
        "flex-none font-numeric text-type-rh font-semibold tracking-[0.14em] text-brand-accent-text tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

/** 필터 머리의 약칭 상자 — 1.5px 현재 글자색 테두리, 최소 28px, 14px 800 */
export function FilterBadge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center border-[1.5px] border-current px-2 text-sm leading-none font-extrabold",
        className,
      )}
      {...props}
    />
  );
}
