import type { ReactNode } from "react";

import { SectionHead } from "@/components/ui/section-head";

/**
 * 고정 쪽의 절 — 섹션 머리(h2 + 러닝 헤드) + 내용 (`/about` M1-36 · `/privacy` M5-05).
 * 앵커로 도착하면(`:target`) 머리 위 3px 괘선이 레드로 바뀐다(현재 탭 막대와 같은 레드 — 색 면 전환 base). 앞에 고정 요소가 없어
 * 위 여백 16px만 남기고 멈춘다(scroll-margin). 서버 컴포넌트 — JS 0.
 */
export function DocSection({
  id,
  title,
  runningHead,
  children,
}: {
  id: string;
  title: string;
  runningHead: string;
  children: ReactNode;
}) {
  const headingId = `${id}-h`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="group/sec mt-12 scroll-mt-4 lg:mt-16"
    >
      <SectionHead
        heading={title}
        headingId={headingId}
        runningHead={runningHead}
        className="group-target/sec:border-brand-accent"
      />
      {children}
    </section>
  );
}
