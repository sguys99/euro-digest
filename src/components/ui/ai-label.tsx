import Link from "next/link";
import type { ComponentProps } from "react";

import { aboutHref } from "@/lib/about-sections";
import { cx } from "@/lib/cx";

/**
 * "AI 작성" 라벨 (PRD FR-35, D24, DESIGN.md §9.3 AI 작성 라벨 · §3.4, plan M1-32)
 *
 * LLM이 쓴 브리핑 줄(`ai:true`)마다 문장 끝에 붙는 작은 상자 링크 → `/about/#ai`(AI 작성 고지). 템플릿 줄(`ai:false`)과 뉴스 카드에는
 * 붙이지 않는다 — 붙일지는 부르는 쪽(src/components/brief/today-brief.tsx)이 줄의 `ai`로 정한다.
 * 모양: 1px --ink-2 테두리, 11px/1.35 800 0.02em --ink-2, 안쪽 2·5·1px, 기준선 위로 2px. hover 테두리·글자 --ink(fast).
 * 누르는 영역은 `::after`로 위아래 44px · 좌우 8px 넓힌다(DESIGN §9.1 터치 타깃). 링크 이름은 보이는 글자 "AI 작성" 그대로.
 * `next/link`라 클라이언트 이동이다 — `/about/#ai`의 `:target` 괘선은 걸리지 않는다(위치는 맞음, DESIGN §11.7 감수).
 *
 * `AiLabelMark`는 같은 모양의 링크 아닌 견본 — `/about#ai` 설명 문장 안("AI가 쓴 줄 끝에만 [AI 작성] 라벨을…", 같은 절로 가는 링크는
 * 뜻이 없다). 서버 컴포넌트 — JS 0(Link 런타임은 앱 셸 내비가 이미 싣는다). 결과 가림 섬(M4-15) 등 클라이언트 섬 안에서도 쓸 수 있게
 * `cn`(tailwind-merge) 대신 병합 없는 `cx`로 합친다(DESIGN §9.4) — 바깥 `className`은 여백만 준다.
 */

/** 라벨 상자 — 링크·견본 공통 */
const LABEL_BOX =
  "inline-block border border-ink-2 px-1.25 pt-0.5 pb-px align-[2px] text-[11px] leading-[1.35] font-extrabold tracking-[0.02em] whitespace-nowrap text-ink-2";

export type AiLabelProps = Omit<
  ComponentProps<typeof Link>,
  "href" | "children"
>;

/** 브리핑 줄 끝 "AI 작성" 링크 → /about/#ai. 바깥 `className`은 여백만(왼쪽 8px는 부르는 쪽이 준다) */
export function AiLabel({ className, ...props }: AiLabelProps) {
  return (
    <Link
      href={aboutHref("ai")}
      data-slot="ai-label"
      className={cx(
        LABEL_BOX,
        "relative no-underline transition-colors duration-fast ease-print hover:border-ink hover:text-ink",
        // 터치 타깃 44px — 위아래로 넓히고 좌우 8px(DESIGN §9.1)
        "after:absolute after:-inset-x-2 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']",
        className,
      )}
      {...props}
    >
      AI 작성
    </Link>
  );
}

/** 링크가 아닌 라벨 견본(같은 모양) — 설명 문장 안에서 라벨을 가리킬 때. 바깥 `className`은 여백만 */
export function AiLabelMark({
  className,
  ...props
}: Omit<ComponentProps<"span">, "children">) {
  return (
    <span className={cx(LABEL_BOX, className)} {...props}>
      AI 작성
    </span>
  );
}
