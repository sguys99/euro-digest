import type { CompId } from "@/lib/schema/common";

/**
 * 대회 6색 클래스 (DESIGN.md §2.4, D0-12) — 칩·탭·필터 머리가 함께 쓴다.
 *
 * Tailwind는 소스의 클래스 문자열을 그대로 찾아 CSS를 만들기 때문에 `bg-competition-${id}`처럼 조립하지 않고
 * 대회마다 완성된 문자열로 적는다. 색 면에는 항상 약칭 글자를 같이 쓰고(D29), 색 면 안의 포커스 링은 면 위 글자색이다
 * (DESIGN §9.1 포커스 링 지역 재정의).
 *
 * 타입만 import하므로(zod 없음) 클라이언트 번들에 스키마가 들어가지 않는다.
 */

/** 면 + 면 위 글자(인덱스 탭·평탄 탭) */
export const COMPETITION_SURFACE: Readonly<Record<CompId, string>> = {
  EPL: "bg-competition-epl text-competition-epl-foreground",
  LALIGA: "bg-competition-laliga text-competition-laliga-foreground",
  SERIEA: "bg-competition-seriea text-competition-seriea-foreground",
  BUNDESLIGA:
    "bg-competition-bundesliga text-competition-bundesliga-foreground",
  LIGUE1: "bg-competition-ligue1 text-competition-ligue1-foreground",
  UCL: "bg-competition-ucl text-competition-ucl-foreground",
};

/** 색 면 안 포커스 링 = 면 위 글자색 */
export const COMPETITION_RING: Readonly<Record<CompId, string>> = {
  EPL: "[--ring:var(--competition-epl-foreground)]",
  LALIGA: "[--ring:var(--competition-laliga-foreground)]",
  SERIEA: "[--ring:var(--competition-seriea-foreground)]",
  BUNDESLIGA: "[--ring:var(--competition-bundesliga-foreground)]",
  LIGUE1: "[--ring:var(--competition-ligue1-foreground)]",
  UCL: "[--ring:var(--competition-ucl-foreground)]",
};

/** 필터 머리 색 면 — 면·글자 + 위 괘선도 같은 색(DESIGN §9.2 Tabs) */
export const COMPETITION_HEAD: Readonly<Record<CompId, string>> = {
  EPL: "border-t-competition-epl bg-competition-epl text-competition-epl-foreground",
  LALIGA:
    "border-t-competition-laliga bg-competition-laliga text-competition-laliga-foreground",
  SERIEA:
    "border-t-competition-seriea bg-competition-seriea text-competition-seriea-foreground",
  BUNDESLIGA:
    "border-t-competition-bundesliga bg-competition-bundesliga text-competition-bundesliga-foreground",
  LIGUE1:
    "border-t-competition-ligue1 bg-competition-ligue1 text-competition-ligue1-foreground",
  UCL: "border-t-competition-ucl bg-competition-ucl text-competition-ucl-foreground",
};

/** 선택된 대회 탭(ARIA Tabs) — 면·테두리 대회 색, 글자 면 위 글자색. 링은 --ink(탭 밖 지면에 그려진다) */
export const COMPETITION_SELECTED_TAB: Readonly<Record<CompId, string>> = {
  EPL: "aria-selected:border-competition-epl aria-selected:bg-competition-epl aria-selected:text-competition-epl-foreground",
  LALIGA:
    "aria-selected:border-competition-laliga aria-selected:bg-competition-laliga aria-selected:text-competition-laliga-foreground",
  SERIEA:
    "aria-selected:border-competition-seriea aria-selected:bg-competition-seriea aria-selected:text-competition-seriea-foreground",
  BUNDESLIGA:
    "aria-selected:border-competition-bundesliga aria-selected:bg-competition-bundesliga aria-selected:text-competition-bundesliga-foreground",
  LIGUE1:
    "aria-selected:border-competition-ligue1 aria-selected:bg-competition-ligue1 aria-selected:text-competition-ligue1-foreground",
  UCL: "aria-selected:border-competition-ucl aria-selected:bg-competition-ucl aria-selected:text-competition-ucl-foreground",
};
