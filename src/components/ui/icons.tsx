import type { ReactNode, SVGProps } from "react";

import { cx } from "@/lib/cx";

/**
 * 인라인 SVG 아이콘 (DESIGN.md §9.1 아이콘, D0-12) — 아이콘 라이브러리를 쓰지 않는다(새 런타임 의존성 없음).
 *
 * - 24 격자, 선 1.75, 각진 끝(`stroke-linecap="square"`·`stroke-linejoin="miter"`), 색은 글자색(`currentColor`).
 *   둥근 끝은 점을 찍을 때만(카드 메뉴의 가로 점 3개).
 * - 장식이다: `aria-hidden`·`focusable="false"`. 뜻은 버튼의 `aria-label`이나 옆 글자로 준다.
 * - 크기: 기본 22px, 메뉴 18px, 결과 가림·해제 16px(`size`로 바꾼다).
 * - 경로는 혼합안(`docs/design/d0/concept-mix.html`)의 아이콘 그대로다. 서버 컴포넌트라 JS를 만들지 않는다.
 */
export interface IconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children" | "width" | "height"
> {
  /** 한 변(px). 기본 22 */
  size?: number;
}

function Icon({
  size = 22,
  className,
  children,
  ...props
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={cx("block flex-none", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

/** 검색(돋보기) */
export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 20.5 20.5" />
    </Icon>
  );
}

/** 테마(반쯤 채운 원) — DESIGN §8 토글 */
export function ThemeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v16" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** 공유(위 화살표 + 상자) */
export function ShareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
      <path d="M5 12v8h14v-8" />
    </Icon>
  );
}

/** 더 보기(가로 점 3개) — 점이라 둥근 끝(DESIGN §9.1 예외) */
export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M5 12h.01M12 12h.01M19 12h.01"
        strokeWidth={3.2}
        strokeLinecap="round"
      />
    </Icon>
  );
}

/** 닫기·해제(×) */
export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
    </Icon>
  );
}

/** 아래 꺾쇠(결과 가림 "보기") */
export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

/** 왼쪽 꺾쇠(티켓 꼬리표 이전 호 · 달력 이전 달 — M1-34, `docs/design/m1-archive/concept-a.html`) */
export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m14.5 6-6 6 6 6" />
    </Icon>
  );
}

/** 오른쪽 꺾쇠(티켓 꼬리표 다음 호 · 달력 다음 달 — M1-34) */
export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9.5 6 6 6-6 6" />
    </Icon>
  );
}

/** 달력(티켓 꼬리표 달력 버튼 — M1-34) */
export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6h16v14H4z" />
      <path d="M4 10.5h16M8.5 3.5v4.5M15.5 3.5v4.5" />
      <path d="M8 14h2M11 14h2M14 14h2M8 17h2M11 17h2" />
    </Icon>
  );
}

/** 하단 탭 · 홈 */
export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 10.5 12 4l8.5 6.5V20h-5.5v-6h-6v6H3.5z" />
    </Icon>
  );
}

/** 하단 탭 · 뉴스 */
export function NewsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5h16v14H4z" />
      <path d="M8 9h8M8 12.5h8M8 16h5" />
    </Icon>
  );
}

/** 하단 탭 · 리그(순위표) */
export function LeagueIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5h16M4 10h16M4 15h16M4 20h16" />
      <path d="M8.5 5v15" />
    </Icon>
  );
}

/** 하단 탭 · 한국 선수(유니폼) */
export function KitIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 3.5 3.5 6.5 5.5 10.5 7.5 9.5V20.5h9V9.5l2 1 2-4L16 3.5c-.6 1.7-2.2 2.8-4 2.8S8.6 5.2 8 3.5z" />
    </Icon>
  );
}

/** 하단 탭 · 마이(책갈피) */
export function BookmarkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3.5h12v17l-6-4.5-6 4.5z" />
    </Icon>
  );
}
