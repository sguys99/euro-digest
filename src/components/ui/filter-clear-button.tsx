import type { ComponentProps } from "react";

import { cx } from "@/lib/cx";

import { CloseIcon } from "./icons";

/**
 * 대회 필터 "해제" 버튼 (DESIGN.md §9.2 Tabs "필터 머리 색 면", D0-12) — 44×44, 13px 800 밑줄(3px 띄움, hover 2px) + × 16px.
 * 화면 밖 " 대회 필터"로 접근 이름을 "해제 대회 필터"로 만든다(`target` — 팀 필터 칸은 "팀 필터", M1-33). 색·포커스 링은 바깥 색 면
 * (`SectionHead filter`·`liveFilter`)이 준다.
 *
 * 서버 컴포넌트(JS 0)지만 필터 섬(M1-33)이 import해 onClick을 넘긴다 → 섬 번들에 tailwind-merge(`cn`, gzip 약 9KB)가
 * 들어가지 않도록 `section-head.tsx`(cn 사용)와 파일을 나누고 병합 없는 `cx`로 합친다(DESIGN §9.4, D0-12 리뷰).
 * 바깥 `className`은 여백·배치만 준다(src/lib/cx.ts).
 */
export function FilterClearButton({
  target = "대회 필터",
  className,
  type = "button",
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  /** 무엇을 해제하는지 — 화면 밖 글자(기본 "대회 필터") */
  target?: string;
}) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex min-h-11 min-w-11 items-center gap-1 bg-transparent px-2.5 text-[13px] font-extrabold underline underline-offset-3 hover:decoration-2",
        className,
      )}
      {...props}
    >
      해제<span className="sr-only"> {target}</span>
      <CloseIcon size={16} />
    </button>
  );
}
