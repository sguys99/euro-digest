"use client";

import { useState, type ReactNode } from "react";

import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";
import type { CompId } from "@/lib/schema/common";

/**
 * 순위 미니 대회 탭 섬 (DESIGN §9.3 "홈 리그 순위 미니" · §11.14 섬 ②, plan M2-15)
 *
 * 같은 페이지 안 패널 전환이라 §9.4 Tabs(자동 활성화, ←→ Home End)를 `grid` 모양(3열 × 2줄)으로 쓴다. 여섯 패널은 서버가 모두 그린다
 * (정적 HTML) — 이 섬은 선택 상태만 가진다. 첫 패널(설정 순서 첫 대회 — EPL)이 기본이고 주소는 바꾸지 않는다.
 * 탭을 바꾸면 선택 면 색 전환(base — Tabs)과 새 패널 찍힘(`animate-stamp`, fast)이 있다 — 첫 로드는 움직이지 않는다(D31).
 * `cn`(tailwind-merge)을 쓰지 않는다(섬 번들, DESIGN §9.4).
 */

export interface LeagueMiniTab {
  value: CompId;
  /** 탭 글자(약칭) */
  label: string;
  content: ReactNode;
}

export function LeagueMiniTabs({
  label,
  panels,
}: {
  /** 탭 목록 접근 이름 */
  label: string;
  panels: readonly LeagueMiniTab[];
}) {
  const [value, setValue] = useState<string>(panels[0]?.value ?? "");
  const [interacted, setInteracted] = useState(false);
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
        variant="grid"
        className="mt-3"
        data-slot="league-mini-tabs"
      >
        {panels.map((panel) => (
          <TabsTrigger
            key={panel.value}
            value={panel.value}
            competition={panel.value}
            variant="grid"
          >
            {panel.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {panels.map((panel) => (
        <TabsPanel
          key={panel.value}
          value={panel.value}
          data-comp={panel.value}
          data-in={interacted ? "" : undefined}
          className="data-in:animate-stamp"
        >
          {panel.content}
        </TabsPanel>
      ))}
    </Tabs>
  );
}
