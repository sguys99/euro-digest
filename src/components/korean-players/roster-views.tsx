"use client";

import { useState, type ReactNode } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * 한국 선수 명단 보기 탭 섬 — 1023 이하 "최근 경기 · 시즌 누적 · 다음 경기" (PRD FR-61, DESIGN §9.3 D2 선수 명단 행 · §6.2 찍힘, plan M3-09)
 *
 * 명단은 표 한 장이고(서버가 모든 열을 그린다), 1023 이하에서 보기마다 열 묶음만 바꾼다(가로 스크롤 없음). 이 섬은 선택 값만 가지고
 * 표를 감싼 요소의 `data-roster-view`를 바꾼다 — 숨길 열은 globals.css §12가 정한다(`data-col`). 1024 이상은 모든 열을 보이고 탭을 숨긴다.
 * - 탭은 §9.4 Tabs(`view` 모양 · 자동 활성화 · ←→ Home End). 세 탭이 같은 표를 바꾸므로 탭 패널이 따로 없고 `aria-controls`는 표 id다.
 * - 서버 HTML은 "최근 경기"(첫 화면 — 모션 없음, D31). 사용자가 탭을 바꾼 뒤부터 리그 구간이 찍힘(fast)으로 나타난다.
 * - 주소는 바꾸지 않는다(대회 보기 탭과 같은 규칙 — M2-10). JS가 없으면 페이지의 `<noscript>` 스타일이 탭을 숨긴다(최근 경기 보기 그대로).
 * `cn`(tailwind-merge)을 쓰지 않는다(섬 번들, DESIGN §9.4).
 */

export const ROSTER_VIEWS = [
  { value: "recent", label: "최근 경기" },
  { value: "season", label: "시즌 누적" },
  { value: "next", label: "다음 경기" },
] as const;

export type RosterViewValue = (typeof ROSTER_VIEWS)[number]["value"];

export function RosterViews({
  tableId,
  children,
}: {
  /** 보기가 바꾸는 표의 id(`aria-controls`) */
  tableId: string;
  children: ReactNode;
}) {
  const [view, setView] = useState<RosterViewValue>("recent");
  const [interacted, setInteracted] = useState(false);
  return (
    <>
      <Tabs
        value={view}
        onValueChange={(next) => {
          setInteracted(true);
          setView(next as RosterViewValue);
        }}
      >
        <TabsList
          aria-label="명단 보기"
          variant="view"
          className="mt-2.5 lg:hidden"
          data-slot="roster-tabs"
        >
          {ROSTER_VIEWS.map((v) => (
            <TabsTrigger
              key={v.value}
              value={v.value}
              variant="view"
              aria-controls={tableId}
            >
              {v.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {/* 탭을 바꿀 때마다 감싼 요소를 새로 붙여 찍힘이 다시 돈다(첫 화면은 key·data-in 없이 — 모션 없음) */}
      <div
        key={interacted ? view : "first"}
        data-slot="roster-view"
        data-roster-view={view}
        data-in={interacted ? "" : undefined}
        className="data-in:[&_tbody]:animate-stamp"
      >
        {children}
      </div>
    </>
  );
}
