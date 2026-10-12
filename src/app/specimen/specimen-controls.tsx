"use client";

import { useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button, Switch } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/chip";
import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import type { CompId } from "@/lib/schema/common";

/**
 * 견본 "동작" 칸(D0-12, SPECIMEN=1 빌드 전용 페이지에서만 쓰인다) — 실제로 눌러 보는 클라이언트 섬.
 * 테마 토글(티켓 면 위) · 결과 가리기 스위치(견본 — 속성은 바꾸지 않음, M4-15) · 토스트 3종 · 필터 칩 토글 ·
 * 대회 탭(패널 전환, 자동 활성화). e2e(tests/e2e-specimen)가 이 칸으로 동작을 검사한다.
 */

const CHIPS = [
  { key: "result", label: "경기 결과", count: 7 },
  { key: "transfer", label: "이적", count: 4 },
  { key: "injury", label: "부상", count: 1 },
] as const;

export function SpecimenControls({
  comps,
}: {
  comps: ReadonlyArray<{ id: CompId; short: string; name: string }>;
}) {
  const [spoiler, setSpoiler] = useState(false);
  const [pressed, setPressed] = useState<ReadonlySet<string>>(new Set());

  return (
    <div className="mr-3.5 grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-ticket px-3 py-1.5 text-ticket-fg [--ring:var(--ticket-fg)]">
        <span className="text-[13px] font-extrabold">티켓 도구</span>
        <div className="flex items-center gap-2.5">
          <span
            id="specimen-live-switch-label"
            className="text-[11.5px] font-extrabold text-ticket-fg-2"
          >
            결과 가리기(견본)
          </span>
          <Switch
            checked={spoiler}
            aria-labelledby="specimen-live-switch-label"
            onClick={() => {
              const next = !spoiler;
              setSpoiler(next);
              toast({
                message: next
                  ? "결과 가리기를 켰어요(견본)"
                  : "결과 가리기를 껐어요(견본)",
              });
            }}
          />
          <ThemeToggle />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          data-toast-trigger="news"
          onClick={() =>
            toast({
              kind: "새 소식",
              message: "새 소식이 있어요",
              action: {
                label: "새로고침",
                onClick: () =>
                  toast({ message: "견본이라 새로고침하지 않아요" }),
              },
            })
          }
        >
          새 소식 토스트
        </Button>
        <Button
          variant="secondary"
          data-toast-trigger="share"
          onClick={() => toast({ kind: "공유", message: "링크를 복사했어요" })}
        >
          링크 복사 토스트
        </Button>
        <Button
          variant="secondary"
          data-toast-trigger="dismissible"
          onClick={() =>
            toast({
              message: "닫기 버튼이 있는 알림",
              dismissible: true,
              duration: 6000,
            })
          }
        >
          닫기 버튼 토스트
        </Button>
      </div>

      <div
        role="group"
        aria-label="분류 필터 견본"
        className="flex flex-wrap gap-1.5"
      >
        {CHIPS.map((chip) => (
          <FilterChip
            key={chip.key}
            pressed={pressed.has(chip.key)}
            label={chip.label}
            count={chip.count}
            onClick={() =>
              setPressed((prev) => {
                const next = new Set(prev);
                if (next.has(chip.key)) next.delete(chip.key);
                else next.add(chip.key);
                return next;
              })
            }
          />
        ))}
        <FilterChip
          tone="korean"
          pressed={pressed.has("kr")}
          label="한국 선수만"
          count={5}
          onClick={() =>
            setPressed((prev) => {
              const next = new Set(prev);
              if (next.has("kr")) next.delete("kr");
              else next.add("kr");
              return next;
            })
          }
        />
      </div>

      <Tabs defaultValue={comps[0]?.id ?? null} data-specimen="live-tabs">
        <TabsList aria-label="순위 미니 대회 탭 견본(동작)">
          {comps.map((c) => (
            <TabsTrigger key={c.id} value={c.id} competition={c.id}>
              {c.short}
            </TabsTrigger>
          ))}
        </TabsList>
        {comps.map((c) => (
          <TabsPanel
            key={c.id}
            value={c.id}
            className="mt-2 border border-dashed border-ink-3 p-3 text-[13px] text-ink-2"
          >
            {c.name} 순위 자리(D1)
          </TabsPanel>
        ))}
      </Tabs>
    </div>
  );
}
