import type { ComponentType } from "react";

import {
  HomeIcon,
  KitIcon,
  LeagueIcon,
  NewsIcon,
  type IconProps,
} from "@/components/ui/icons";
import { routes } from "@/lib/paths";

/**
 * 사이트 내비게이션 항목 — 하단 탭(1023 이하)·상단 내비(1024 이상)가 같은 목록을 쓴다 (PRD §4.1, DESIGN §9.2 Tabs, M1-30)
 *
 * 최종 5개(홈·뉴스·리그·한국 선수·마이) 중 **M3 공개 상태는 홈·뉴스·리그·한국 선수 4개**다(M1은 홈·뉴스 — 리그는 대회 페이지 M2-10,
 * 한국 선수는 목록 M3-09와 함께). 미완성 섹션은 탭을 숨긴다(plan §2.3) — 없는 페이지로 가는 링크를 만들지 않는다(e2e 링크 검사). 마이
 * `routes.my()`·`BookmarkIcon`은 M4에서 페이지와 함께 더한다.
 * 리그는 첫 대회(설정 순서 첫 항목 EPL — `/competitions/epl/`)로 간다 — 다른 대회 페이지에서는 섹션 표시(`aria-current="true"`).
 * 순서는 최종 5개 순서 그대로.
 *
 * **이적**(M4-04)은 상단 내비(1024 이상)에만 있다 — PRD §4.1 "하단 탭 바 5개 — 홈 · 뉴스 · 리그 · 한국 선수 · 마이(이적 · A매치 · 오늘 밤은
 * 홈 섹션과 상단 메뉴에서 진입)". 1023 이하 진입은 홈 이적 핫 리스트 "이적 n건 ›" · 한국 선수 목록 머리 링크(DECISIONS D2 §9).
 */

/** 리그 탭이 여는 대회(DESIGN D1 scope — 시안 `/competitions/epl/`) */
export const LEAGUE_NAV_COMP = "EPL" as const;

/** 내비 항목 키 — 페이지가 AppShell `current`로 넘겨 `aria-current="page"`를 정한다 */
export type NavKey = "home" | "news" | "league" | "korean" | "transfers";

export interface NavItem {
  key: NavKey;
  /** 탭·내비 글자(접근 이름) */
  label: string;
  /** `next/link` href(basePath 없음 — routes.*) */
  href: string;
  /** 하단 탭 아이콘(22px, 장식) */
  Icon: ComponentType<IconProps>;
  /** 하단 탭에도 있는가(false = 1024 이상 상단 내비에만 — 이적) */
  bottomTab: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: "home",
    label: "홈",
    href: routes.home(),
    Icon: HomeIcon,
    bottomTab: true,
  },
  {
    key: "news",
    label: "뉴스",
    href: routes.news(),
    Icon: NewsIcon,
    bottomTab: true,
  },
  {
    key: "league",
    label: "리그",
    href: routes.competition(LEAGUE_NAV_COMP),
    Icon: LeagueIcon,
    bottomTab: true,
  },
  // 한국 선수(M3-09) — 목록 `/korean-players/`. 선수 상세·주간 리포트에서는 섹션 표시(`aria-current="true"`)
  {
    key: "korean",
    label: "한국 선수",
    href: routes.koreanPlayers(),
    Icon: KitIcon,
    bottomTab: true,
  },
  // 이적(M4-04) — 상단 내비만(머리 주석). 아이콘은 쓰지 않지만 항목 모양을 맞춘다
  {
    key: "transfers",
    label: "이적",
    href: routes.transfers(),
    Icon: NewsIcon,
    bottomTab: false,
  },
];

/** 하단 탭 항목(1023 이하) — 상단 내비 전용 항목을 뺀다 */
export const BOTTOM_TAB_ITEMS: readonly NavItem[] = NAV_ITEMS.filter(
  (item) => item.bottomTab,
);
