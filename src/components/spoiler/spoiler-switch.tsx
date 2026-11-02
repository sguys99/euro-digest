"use client";

import { useEffect } from "react";

import { toast } from "@/components/ui/toast";
import { cx } from "@/lib/cx";
import { safeLocalStorage } from "@/lib/safe-storage";
import {
  handleSpoilerClick,
  setSpoiler,
  spoilerOn,
  spoilerToastMessage,
} from "@/lib/spoiler";

import { useSpoiler } from "./use-spoiler";

/**
 * 결과 가리기 스위치 — 마스트헤드 티켓의 switch 칸(DESIGN §9.2 Button '2칸 스위치' · §9.3 티켓 마스트헤드 · §8, PRD FR-37 · D3 기본 꺼짐, M4-15)
 *
 * 이 섬 하나가 결과 가리기의 JS 전부다(DECISIONS M4 #7 — 스위치 + 펼치기 위임 하나):
 * - 스위치: `<html data-spoiler>`를 켜고 끄고 `ed-spoiler`를 안전한 저장소에 남긴다(src/lib/spoiler.ts `setSpoiler` — 저장이 막혀도 이번
 *   방문에는 적용). 펼친 칸은 모두 접힌 상태로 돌아간다. 전환 안내 토스트(§9.2 — "결과 가리기를 켰어요. …" · "결과 가리기를 껐어요.").
 * - 펼치기: 문서 수준 클릭 위임 하나(`handleSpoilerClick`) — 모든 화면의 '보기' · '모두 보기' · '변동 보기'를 받는다.
 *
 * 모양(선택 칸 반전)은 `aria-checked`가 아니라 `<html data-spoiler>` 속성으로 CSS가 정한다(`spoiler-on:` 변형) — 초기 스크립트가 첫 페인트 전에
 * 단 상태가 하이드레이션 전에도 맞게 보인다(서버 렌더는 꺼짐). `aria-checked`는 하이드레이션 뒤 속성을 따라간다(`useSpoiler`).
 * 접근성: `role="switch"` + 보이는 라벨 "결과 가리기"(`aria-labelledby`), 누름 영역 위아래 8 · 좌우 4px 넓혀 46×76px.
 */

/** 칸 — 최소 34px, 좌우 8px. 선택 칸 = `--ticket-fg` 면 + `--ticket` 글자(끔이 기본 선택 — 켜지면 켬 칸으로) */
const CELL =
  "grid min-w-8.5 place-items-center px-2 transition-colors duration-fast ease-print";

export function SpoilerSwitch({
  labelId = "spoiler-switch-label",
}: {
  labelId?: string;
}) {
  const on = useSpoiler();

  useEffect(() => {
    function onClick(event: MouseEvent) {
      handleSpoilerClick(event);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  function handleToggle() {
    const root = document.documentElement;
    const next = !spoilerOn(root);
    setSpoiler(root, document, safeLocalStorage, next);
    toast({ kind: "알림", message: spoilerToastMessage(next) });
  }

  return (
    <>
      <span
        id={labelId}
        className="text-[11.5px] leading-[1.2] font-extrabold whitespace-nowrap text-ticket-fg-2"
      >
        결과 가리기
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelId}
        data-slot="spoiler-switch"
        onClick={handleToggle}
        className="relative inline-grid h-7.5 grid-cols-2 border border-ticket-fg bg-transparent p-0 text-[12.5px] font-extrabold text-ticket-fg after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']"
      >
        <span
          className={cx(
            CELL,
            "bg-ticket-fg text-ticket spoiler-on:bg-transparent spoiler-on:text-ticket-fg",
          )}
        >
          끔
        </span>
        <span
          className={cx(CELL, "spoiler-on:bg-ticket-fg spoiler-on:text-ticket")}
        >
          켬
        </span>
      </button>
    </>
  );
}
