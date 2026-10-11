import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * globals.css `@theme static`·`@theme inline`에 등록한 유틸리티 키 — Tailwind 테마 네임스페이스(`--<네임스페이스>-<키>`)별
 * (D0-10, DESIGN.md §11.2).
 *
 * tailwind-merge는 CSS를 읽지 않고 Tailwind 기본 테마만 안다. 등록하지 않으면 커스텀 유틸리티를 잘못 분류한다
 * (실측: 글자 크기 text-type-X·text-num-X를 색으로 봐서 뒤의 text-ink가 크기를 지우고, px-edge·shadow-print·
 * max-w-page·duration-base는 어느 그룹에도 못 넣어 같은 속성 유틸리티로 덮어쓰지 못했다).
 *
 * tests/utils.test.ts가 이 목록을 globals.css의 실제 키와 하나씩 대조한다 — globals.css에 키를 더하면 여기에도 더한다.
 * 이 파일은 Tailwind 클래스 탐색에서 뺀다(globals.css `@source not`). 색 이름 border·ring처럼 단독으로도 유틸리티인
 * 문자열이 CSS를 만들지 않게 하기 위해서다.
 */
export const THEME_KEYS = {
  /** `--color-*` — shadcn 의미 변수 18 + 프로젝트 토큰 44 */
  color: [
    "background",
    "foreground",
    "card",
    "card-foreground",
    "popover",
    "popover-foreground",
    "primary",
    "primary-foreground",
    "secondary",
    "secondary-foreground",
    "muted",
    "muted-foreground",
    "accent",
    "accent-foreground",
    "destructive",
    "border",
    "input",
    "ring",
    "paper",
    "paper-2",
    "paper-3",
    "ink",
    "ink-2",
    "ink-3",
    "ink-disabled",
    "rule",
    "hatch",
    "brand-accent",
    "brand-accent-text",
    "brand-accent-foreground",
    "ticket",
    "ticket-fg",
    "ticket-fg-2",
    "colophon",
    "colophon-fg",
    "colophon-fg-2",
    "competition-epl",
    "competition-epl-foreground",
    "competition-laliga",
    "competition-laliga-foreground",
    "competition-seriea",
    "competition-seriea-foreground",
    "competition-bundesliga",
    "competition-bundesliga-foreground",
    "competition-ligue1",
    "competition-ligue1-foreground",
    "competition-ucl",
    "competition-ucl-foreground",
    "result-win",
    "result-draw",
    "result-loss",
    "trend-up",
    "trend-down",
    "transfer-rumor",
    "transfer-negotiating",
    "transfer-agreed",
    "transfer-official",
    "transfer-collapsed",
    "transfer-progress",
    "tier-1",
    "tier-2",
    "tier-3",
  ],
  /** `--text-*` — 타입 스케일(크기 + 행간)과 숫자 크기. `--line-height` 짝은 유틸리티가 아니라 뺀다 */
  text: [
    "type-wordmark",
    "type-h2",
    "type-brief",
    "type-card",
    "type-card-latin",
    "type-lead",
    "type-lead-latin",
    "type-tag",
    "type-stamp",
    "type-meta",
    "type-rh",
    "num-issue",
    "num-brief-no",
    "num-score",
    "num-card-no",
    "num-meta",
  ],
  /** `--font-*` */
  font: ["sans", "numeric", "latin"],
  /** `--spacing-*` — 레이아웃 토큰 */
  spacing: ["edge", "gutter", "tab-w", "col-contents", "col-facing"],
  /** `--container-*` — 최대 폭 */
  container: ["page"],
  /** `--radius-*` — shadcn 배율(전부 0). tailwind-merge 기본값과 같지만 대조를 위해 적는다 */
  radius: ["sm", "md", "lg", "xl", "2xl", "3xl", "4xl"],
  /** `--shadow-*` — 인쇄 오프셋 */
  shadow: ["print", "print-accent"],
  /** `--ease-*` */
  ease: ["print"],
  /** `--transition-duration-*` */
  "transition-duration": ["fast", "base", "slow"],
} as const satisfies Readonly<Record<string, readonly string[]>>;

/** 테마와 무관하게 Tailwind가 늘 만드는 색 키워드 */
const COLOR_KEYWORDS = ["inherit", "current", "transparent"] as const;

const twMerge = extendTailwindMerge({
  override: {
    theme: {
      // 기본값은 "아무 이름이나 색"이라, 등록하지 않은 커스텀 유틸리티(글자 크기 등)를 색으로 묶어 지운다.
      // globals.css가 기본 팔레트를 지웠으므로(--color-*: initial) 실제로 있는 색 이름만 색으로 본다.
      color: [...THEME_KEYS.color, ...COLOR_KEYWORDS],
    },
  },
  extend: {
    theme: {
      text: THEME_KEYS.text,
      font: THEME_KEYS.font,
      spacing: THEME_KEYS.spacing,
      container: THEME_KEYS.container,
      radius: THEME_KEYS.radius,
      shadow: THEME_KEYS.shadow,
      ease: THEME_KEYS.ease,
    },
    classGroups: {
      // 전환 시간은 tailwind-merge에 테마 키가 없어 클래스 그룹에 바로 더한다
      duration: [{ duration: THEME_KEYS["transition-duration"] }],
    },
  },
});

/**
 * 조건부 클래스 이름을 합치고, 충돌하는 Tailwind 유틸리티는 뒤에 온 것만 남긴다.
 * shadcn/ui 컴포넌트가 공통으로 쓰는 헬퍼. 토큰 유틸리티(위 THEME_KEYS)도 같은 속성끼리만 덮는다 —
 * 예: 글자 크기 text-type-card와 색 text-ink는 함께 남고, px-edge 뒤의 px-4는 px-edge를 지운다.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
