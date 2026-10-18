import { SectionHead } from "@/components/ui/section-head";
import { ABOUT_SECTIONS } from "@/lib/about-sections";
import { cn } from "@/lib/utils";

import { Leader } from "./leader";

/**
 * `/about` 차례 (M1-36) — 인쇄물 차례 문법: 절 이름 + 리더 점선 + 절 번호(Barlow 600 17px `--ink-2`, 2자리).
 * 행은 1024 이상 목차 행(DESIGN §9.2 Chip "대회 목차 행" — 최소 44px, 14px, 아래 1px `--rule`, hover 이름 밑줄)과 같은 모양의 링크다.
 *
 * - `contents` — 1024 이상 왼쪽 목차 열(앱 셸 `contents` 슬롯: 232px, sticky top 16px, `<nav aria-label="소개 차례">`).
 *   머리는 섹션 머리 + 러닝 헤드 CONTENTS(뉴스 목차와 같은 자리). 페이지 h1보다 DOM이 앞이라 제목 요소가 아니다(p).
 * - `inline` — 1023 이하 본문 머리(소개 아래)에 두는 차례. 얇은 머리(1px) + 2열(세로로 01~03 · 04~06). 1024 이상에서는 숨긴다.
 * 링크는 같은 페이지 앵커(`#ai`)라 `next/link`가 아닌 일반 `<a>`다 — 브라우저 기본 이동이라 `:target`(절 머리 레드 괘선)과 scroll-margin이
 * 그대로 걸린다(`next/link`의 history.pushState 이동은 `:target`을 갱신하지 않는다). 차례는 `/about/`에만 있다.
 * 서버 컴포넌트 — JS 0. 지금 읽는 절 표시(스크롤 위치)는 하지 않는다.
 */
export function AboutToc({ variant }: { variant: "contents" | "inline" }) {
  const inline = variant === "inline";
  return (
    <>
      <SectionHead
        heading="차례"
        headingAs="p"
        runningHead={inline ? undefined : "CONTENTS"}
        thin={inline}
      />
      <ol
        role="list"
        className={cn(
          "mt-1.5",
          inline && "grid grid-flow-col grid-cols-2 grid-rows-3 gap-x-6",
        )}
      >
        {ABOUT_SECTIONS.map((section, index) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="group/row flex min-h-11 items-center gap-1.75 border-b border-rule text-sm leading-[1.3] text-ink no-underline"
            >
              <span className="min-w-0 underline-offset-3 group-hover/row:underline">
                {section.title}
              </span>
              <Leader className="min-w-2" />
              <span
                aria-hidden="true"
                className="min-w-4.5 text-right font-numeric text-[17px] leading-none font-semibold text-ink-2 lining-nums tabular-nums"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </>
  );
}
