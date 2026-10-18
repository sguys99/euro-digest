import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 항목 목록 — `<dl>` 한 줄 = 항목 이름(800) + 설명 (M1-36 `/about` 정책·AI 고지)
 *
 * 카드처럼 괘선 사이의 한 줄(DESIGN §1 원칙 2 "스쿼드 명단 한 줄")이다: 위 1px `--rule`로 시작해 줄마다 아래 1px `--rule`.
 * 1023 이하는 이름 위 · 설명 아래, 1024 이상은 이름 열(8.5em) · 설명 열 2단. 설명은 62ch로 줄 길이를 묶는다.
 */
export interface TermItem {
  term: string;
  description: ReactNode;
}

export function TermList({
  items,
  className,
}: {
  items: readonly TermItem[];
  className?: string;
}) {
  return (
    <dl className={cn("border-t border-rule", className)}>
      {items.map((item) => (
        <div
          key={item.term}
          className="grid gap-y-1 border-b border-rule py-3.5 lg:grid-cols-[8.5em_minmax(0,1fr)] lg:items-baseline lg:gap-x-6 lg:py-4"
        >
          <dt className="text-[15px] leading-[1.5] font-extrabold">
            {item.term}
          </dt>
          <dd className="max-w-[62ch] leading-[1.6]">{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}
