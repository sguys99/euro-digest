"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";

/**
 * 대회 보기 탭 섬 — 순위표 · 일정·결과 · 득점 순위 · 뉴스 (PRD FR-41, DESIGN §9.3 대회 화면 틀 · §11.14 섬 ②, plan M2-10)
 *
 * 같은 페이지 안 패널 전환이라 §9.4 Tabs(자동 활성화, ←→ Home End)를 `view` 모양으로 쓴다. 네 패널은 서버가 모두 그린다(정적 HTML) —
 * 이 섬은 선택 상태만 가진다.
 * - **주소**: 탭을 바꿔도 주소를 바꾸지 않는다(2026-10-30 M2-10 결정 — 뒤로 가기가 탭 전환으로 채워지지 않게). 대신 주소의 `#앵커`가
 *   숨은 패널 안을 가리키면 그 패널을 연다 — 라운드 이동(`#round-9`, FR-44)·다른 화면에서 오는 팀 행(`#arsenal` — 순위표, 기본 패널)·
 *   패널 앵커(`#fixtures`·`#scorers`·`#news`). 열고 나서 그 요소로 스크롤한다(숨은 동안에는 브라우저가 스크롤하지 못한다).
 * - **모션**: 첫 로드·주소로 연 패널은 움직이지 않는다(D31). 사용자가 탭을 바꾼 뒤부터 패널이 나타날 때 찍힘(`animate-stamp`, fast).
 * - **JS 없음**: 페이지의 `<noscript>` 스타일이 숨은 패널을 모두 펼치고 탭 목록을 숨긴다(진보적 향상 — 내용은 그대로 읽힌다).
 * `cn`(tailwind-merge)을 쓰지 않는다(섬 번들, DESIGN §9.4).
 */

export interface CompetitionView {
  /** 패널 값 — 패널 요소 `data-view`(앵커로 패널을 찾는다) */
  value: string;
  /** 탭 글자 */
  label: string;
  content: ReactNode;
}

export function CompetitionViews({
  label,
  views,
}: {
  /** 탭 목록 접근 이름 — "{대회} 보기" */
  label: string;
  views: readonly CompetitionView[];
}) {
  const [value, setValue] = useState(views[0]?.value ?? "");
  const [interacted, setInteracted] = useState(false);
  const pendingScroll = useRef<string | null>(null);

  useEffect(() => {
    function openFromHash() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const target = document.getElementById(id);
      const panel = target?.closest<HTMLElement>("[data-view]");
      const next = panel?.dataset.view;
      if (!target || !next) return;
      if (panel.hidden) pendingScroll.current = id;
      setValue(next);
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  // 주소로 숨은 패널을 연 뒤 — 이제 보이는 앵커로 스크롤(브라우저 기본 스크롤은 숨은 요소에서 일어나지 않았다)
  useEffect(() => {
    const id = pendingScroll.current;
    if (!id) return;
    pendingScroll.current = null;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [value]);

  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        setInteracted(true);
        setValue(next);
      }}
    >
      <TabsList
        aria-label={label}
        variant="view"
        className="mt-4.5"
        data-slot="competition-tabs"
      >
        {views.map((view) => (
          <TabsTrigger key={view.value} value={view.value} variant="view">
            {view.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {views.map((view) => (
        <TabsPanel
          key={view.value}
          value={view.value}
          data-view={view.value}
          data-in={interacted ? "" : undefined}
          className="data-in:animate-stamp"
        >
          {view.content}
        </TabsPanel>
      ))}
    </Tabs>
  );
}
