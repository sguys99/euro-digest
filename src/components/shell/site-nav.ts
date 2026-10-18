import type { ComponentType } from "react";

import { HomeIcon, NewsIcon, type IconProps } from "@/components/ui/icons";
import { routes } from "@/lib/paths";

/**
 * 사이트 내비게이션 항목 — 하단 탭(1023 이하)·상단 내비(1024 이상)가 같은 목록을 쓴다 (PRD §4.1, DESIGN §9.2 Tabs, M1-30)
 *
 * 최종 5개(홈·뉴스·리그·한국 선수·마이) 중 **M1 공개 상태는 홈·뉴스 2개**다. 미완성 섹션은 탭을 숨긴다(plan §2.3) —
 * 없는 페이지로 가는 링크를 만들지 않는다(e2e 링크 검사). 나머지는 해당 마일스톤에서 페이지와 함께 이 목록에 더한다:
 * 리그 `routes.competition(…)`·`LeagueIcon`(M2) · 한국 선수 `routes.koreanPlayers()`·`KitIcon`(M3) · 마이 `routes.my()`·`BookmarkIcon`(M4).
 * 2개여도 하단 탭 바를 유지한다(위치 기억 — DESIGN §9.2). 순서는 최종 5개 순서 그대로.
 */

/** 내비 항목 키 — 페이지가 AppShell `current`로 넘겨 `aria-current="page"`를 정한다 */
export type NavKey = "home" | "news";

export interface NavItem {
  key: NavKey;
  /** 탭·내비 글자(접근 이름) */
  label: string;
  /** `next/link` href(basePath 없음 — routes.*) */
  href: string;
  /** 하단 탭 아이콘(22px, 장식) */
  Icon: ComponentType<IconProps>;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "home", label: "홈", href: routes.home(), Icon: HomeIcon },
  { key: "news", label: "뉴스", href: routes.news(), Icon: NewsIcon },
];
