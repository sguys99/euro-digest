"use client";

import { useCallback, useEffect, useState } from "react";

import { ICON_BUTTON } from "@/components/ui/button-classes";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { cx } from "@/lib/cx";

/**
 * `/status` 날짜 선택 섬 (DESIGN §9.3 D3 `/status` 날짜 이동 줄, plan M5-15) — 페이지의 유일한 섬.
 *
 * ‹ › 44px 버튼("이전 날" · "다음 날")이 키보드 경로이고, 그래프 면 누름(x 좌표 → 칸)은 포인터 보조다(같은 기능). 고르면 상세 줄
 * (`aria-live="polite"` — 14px 800)이 그날 문장으로 바뀌고 그래프의 레드 선택 막대(서버가 그린 `#{id}-sel`)가 그 열로 옮겨 간다(fast).
 * 첫 로드는 서버가 그린 기본 선택(오늘)과 같고 모션 0 — 찍힘(`animate-stamp`)은 사용자가 고른 뒤부터, 모션 줄이기면 없음.
 * JS가 없으면 기본 선택 줄 + 화면 밖 30일 목록(서버)만 남는다. 문장은 서버가 만든 것(`lines`)만 쓴다.
 */
export function StatusDayPicker({
  id,
  lines,
  initial,
}: {
  /** 그래프 요소 id 머리 — `{id}-plot`(누름 영역) · `{id}-sel`(선택 막대) */
  id: string;
  lines: readonly string[];
  initial: number;
}) {
  const [index, setIndex] = useState(initial);
  const [moved, setMoved] = useState(false);
  const count = lines.length;

  const select = useCallback(
    (next: number) => {
      if (next < 0 || next >= count) return;
      setIndex(next);
      setMoved(true);
    },
    [count],
  );

  useEffect(() => {
    const bar = document.getElementById(`${id}-sel`);
    if (bar) bar.style.left = `${(100 * (index + 0.5)) / count}%`;
  }, [id, index, count]);

  useEffect(() => {
    const plot = document.getElementById(`${id}-plot`);
    if (!plot) return;
    const onClick = (event: MouseEvent) => {
      const r = plot.getBoundingClientRect();
      if (r.width <= 0) return;
      const i = Math.floor(((event.clientX - r.left) / r.width) * count);
      select(Math.min(count - 1, Math.max(0, i)));
    };
    plot.addEventListener("click", onClick);
    return () => plot.removeEventListener("click", onClick);
  }, [id, count, select]);

  const button = cx(ICON_BUTTON, "text-ink");
  return (
    <div
      data-slot="status-nav"
      className="mt-2 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 border-t border-b border-t-ink border-b-rule"
    >
      <button
        type="button"
        className={button}
        aria-label="이전 날"
        aria-disabled={index === 0}
        onClick={() => select(index - 1)}
      >
        <ChevronLeftIcon size={20} />
      </button>
      <p
        data-slot="status-line"
        aria-live="polite"
        className="py-2 text-center text-sm leading-[1.4] font-extrabold"
      >
        <span
          key={moved ? index : "initial"}
          className={cx(
            "block",
            moved && "animate-stamp motion-reduce:animate-none",
          )}
        >
          {lines[index]}
        </span>
      </p>
      <button
        type="button"
        className={button}
        aria-label="다음 날"
        aria-disabled={index === count - 1}
        onClick={() => select(index + 1)}
      >
        <ChevronRightIcon size={20} />
      </button>
    </div>
  );
}
