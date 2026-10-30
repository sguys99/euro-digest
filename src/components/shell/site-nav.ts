import type { ComponentType } from "react";

import {
  HomeIcon,
  LeagueIcon,
  NewsIcon,
  type IconProps,
} from "@/components/ui/icons";
import { routes } from "@/lib/paths";

/**
 * 사이트 내비게이션 항목 — 하단 탭(1023 이하)·상단 내비(1024 이상)가 같은 목록을 쓴다 (PRD §4.1, DESIGN §9.2 Tabs, M1-30)
 *
 * 최종 5개(홈·뉴스·리그·한국 선수·마이) 중 **M2 공개 상태는 홈·뉴스·리그 3개**다(M1은 홈·뉴스 — 리그는 대회 페이지 M2-10과 함께,
 * D1 scope §1). 미완성 섹션은 탭을 숨긴다(plan §2.3) — 없는 페이지로 가는 링크를 만들지 않는다(e2e 링크 검사). 나머지는 해당
 * 마일스톤에서 페이지와 함께 이 목록에 더한다: 한국 선수 `routes.koreanPlayers()`·`KitIcon`(M3) · 마이 `routes.my()`·`BookmarkIcon`(M4).
 * 리그는 첫 대회(설정 순서 첫 항목 EPL — `/competitions/epl/`)로 간다 — 다른 대회 페이지에서는 섹션 표시(`aria-current="true"`).
 * 순서는 최종 5개 순서 그대로.
 */

/** 리그 탭이 여는 대회(DESIGN D1 scope — 시안 `/competitions/epl/`) */
export const LEAGUE_NAV_COMP = "EPL" as const;

/** 내비 항목 키 — 페이지가 AppShell `current`로 넘겨 `aria-current="page"`를 정한다 */
export type NavKey = "home" | "news" | "league";

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
  {
    key: "league",
    label: "리그",
    href: routes.competition(LEAGUE_NAV_COMP),
    Icon: LeagueIcon,
  },
];
