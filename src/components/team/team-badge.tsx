import type { CSSProperties } from "react";

import type { TeamView } from "@/lib/competition-view";
import { kitTextColor } from "@/lib/kit-contrast";
import { cx } from "@/lib/cx";

/**
 * 팀 배지 — 팀 컬러 이니셜 배지 (PRD DR-05, CLAUDE §1-6 이미지 자산 금지, DESIGN §9.3 "팀 배지 (D1 보완)", D62 ②·④)
 *
 * 순위표(M2-11)·라운드·득점 순위(M2-10)·팀 화면(M2-13)·오늘 밤(M2-14)·순위 미니(M2-15)가 함께 쓰는 서버 컴포넌트.
 * - 위 3/5 상의 `--k1` + 약어(글자 `--kf`), 아래 2/5 하의 `--k2`, 1px `--rule` 안쪽 테두리, 직각.
 * - `--kf`는 빌드 때 `kitTextColor(상의)`(src/lib/kit-contrast.ts — 흰색·잉크 남색 중 대비가 큰 쪽)로 계산해 인라인 변수로 넣는다
 *   (2026-10-30 사용자 결정 — 데이터·토큰에 글자색 없음, DESIGN §11.14). 상의 색 보정(대비 5.3)은 데이터 단계에서 끝났다.
 * - 크기: m 40×44(약어 15px) · s 30×33(12px) · xs 24×27(10.5px) · `table` = s, 1024 이상 m(순위표 팀 칸) · `stub` = 팀 티켓 스텁(칸 채움,
 *   최소 150/190px · 약어 30/64px — M2-13). 모양은 globals.css §10
 *   유틸리티(`kit`·`kit-*` — 순위표·라운드에 수백 개가 반복돼 클래스 묶음을 짧게 했다).
 * - **접근성**: 옆에 한글 팀명이 늘 있는 표·목록 안 배지는 기본값 `aria-hidden`(이름이 두 번 읽히지 않게 — FCB·BRE 약어 충돌은 이름으로
 *   구분). 홀로 선 배지(팀 티켓 스텁·견본)만 `standalone` → `role="img"` + "{팀 한글명} 배지 {약어}".
 * - **폴백**(team-colors.json에 없는 팀): 면 없음 + 1px dashed `--ink-2`, 약어 `--ink-2` + 아래 dashed, 아래 2/5 `--hatch` 빗금.
 */

export type TeamBadgeSize = "m" | "s" | "xs" | "table" | "stub";

/** 크기 → 유틸리티(globals.css §10 `kit-*` — 반복이 많아 짧은 이름으로 묶었다) */
const SIZE: Readonly<Record<TeamBadgeSize, string>> = {
  m: "kit-m",
  s: "kit-s",
  xs: "kit-xs",
  table: "kit-s lg:kit-m",
  // 팀 티켓 스텁(M2-13 — 배지를 키운 것): 칸을 채우고 최소 150px(1024 이상 190px), 약어 30px(64px) 0.04em
  stub: "min-h-37.5 w-full lg:min-h-47.5 [&>b]:text-[30px] [&>b]:tracking-[0.04em] lg:[&>b]:text-[64px]",
};

export interface TeamBadgeProps {
  team: Pick<TeamView, "name" | "short" | "colors">;
  size?: TeamBadgeSize;
  /** 홀로 선 배지 — `role="img"` + 이름(머리 주석). 기본은 장식(`aria-hidden`) */
  standalone?: boolean;
  className?: string;
}

export function TeamBadge({
  team,
  size = "s",
  standalone = false,
  className,
}: TeamBadgeProps) {
  const a11y = standalone
    ? {
        role: "img" as const,
        "aria-label": `${team.name} 배지${team.short ? ` ${team.short}` : ""}`,
      }
    : { "aria-hidden": true as const };
  const style = team.colors
    ? ({
        "--k1": team.colors[0],
        "--k2": team.colors[1],
        "--kf": kitTextColor(team.colors[0]),
      } as CSSProperties)
    : undefined;
  return (
    <span
      style={style}
      className={cx("kit", SIZE[size], !team.colors && "kit-none", className)}
      {...a11y}
    >
      <b>{team.short}</b>
    </span>
  );
}
