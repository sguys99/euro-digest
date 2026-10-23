import type { ReactNode } from "react";

import { BottomTab, BottomTabs } from "@/components/ui/nav-tabs";
import { Toaster } from "@/components/ui/toast";
import type { IssueMeta } from "@/lib/issue";
import type { LateWindow } from "@/lib/issue-late";
import { cn } from "@/lib/utils";

import { Colophon } from "./colophon";
import { IssueLateNotice } from "./issue-late-notice";
import { Masthead } from "./masthead";
import { OfflineBand } from "./offline-band";
import { NAV_ITEMS, type NavKey } from "./site-nav";
import { StatusIsland } from "./status-island";

/**
 * 앱 셸 (M1-30 — PRD DR-01·FR-142·§4.1, DESIGN.md §4.3 그리드 · §4.4 고정 요소 · §9.3 · §10 랜드마크)
 *
 * 페이지마다 이 셸로 본문을 감싼다(서버 컴포넌트 — 현재 탭 `aria-current`와 워드마크 h1을 정적 HTML로 정한다. 루트 레이아웃에 두면
 * 경로를 알려고 클라이언트 섬이 필요하다). 건너뛰기 링크는 루트 레이아웃 `<body>` 첫 요소다.
 *
 * 구조(DOM 순서는 모든 폭에서 같다 — DESIGN §4.3)
 * ```
 * div(최대 1280 · 좌우 --edge · 위 12/24px · 세로 flex 화면 높이 이상 — 짧은 페이지도 뒤표지가 아래에)
 *   header   티켓 마스트헤드 + 상단 내비(1024 이상)                  — Masthead
 *   div      [nav 뉴스 필터(목차, 1024 이상)] · main#main · [aside(1280 이상)]   (flex-1)
 *   footer   뒤표지(1023 이하 화면 폭 전체)                           — Colophon
 *   div      오프라인 띠(평소 높이 0 — 끊기면 하단 탭 위·화면 아래 sticky, M1-37)  — OfflineBand
 *   nav      하단 탭(1023 이하, sticky bottom · z 20)
 * Toaster(aria-live 영역 하나) · StatusIsland(오프라인·발행 지연 속성, 그리는 것 없음)
 * ```
 * 발행 지연 안내(M1-37 — `lateWindows`를 준 페이지만: 홈·`/news/`)는 main 맨 앞에 둔다(평소 숨김 — src/components/shell/issue-late-notice.tsx).
 *
 * 그리드(D31) — 1023 이하 1단 · 1024~1279 `--col-contents · 1fr` 2단 · 1280 이상 `… · --col-facing` 3단.
 * **미완성 섹션 숨김**(plan §2.3): 열은 페이지가 채울 때만 생긴다. 목차(`contents` — M1-32·M1-33)를 주지 않으면 1024 이상도
 * 지면 한 열이고, 마주 보는 면(`facing` — M2·M3 위젯)을 주지 않으면 1280 이상에서 그 열을 빼 지면을 넓힌다(DECISIONS D0 §4
 * "A → 1280 M1 상태"). 1024~1279에서 마주 보는 면의 위젯은 페이지가 지면 안 1단 흐름에 넣는다(`xl:hidden` — DESIGN §11.4).
 */

export interface AppShellProps {
  /** 지금 페이지의 내비 항목 — 하단 탭·상단 내비 `aria-current="page"`. 홈이면 워드마크가 h1. 없으면(404 등) 현재 탭 없음 */
  current?: NavKey;
  /**
   * `current` 항목이 이 페이지 자신인가(`"page"`, 기본) · 그 섹션 안의 다른 페이지인가(`"section"` → `aria-current="true"` — 날짜 아카이브의
   * "뉴스" 탭은 `/news/`로 가는 링크라 이 페이지가 아니다, M1-34)
   */
  currentKind?: "page" | "section";
  /** 마스트헤드·뒤표지의 호(제 N호·날짜·발행·업데이트) — 발행 전이면 null */
  issue: IssueMeta | null;
  /**
   * 상단 내비·뒤표지 "마지막 업데이트"(사이트 기준 = 최신 호의 업데이트 시각, FR-142). 페이지 호가 최신 호가 아닐 때(날짜 아카이브) 준다 —
   * 주지 않으면 `issue.updatedAt`. 티켓 스텁의 발행·업데이트는 늘 그 호다(2026-10-23 오케스트레이터 결정)
   */
  siteUpdatedAt?: string;
  /**
   * 티켓 꼬리표 + 펼치는 판(M1-34 — `/news/`·날짜 아카이브만, 홈에는 없음). 페이지가 `counterfoilSlots(view)`
   * (src/components/news/counterfoil.tsx)로 만들어 넘긴다 — 셸이 꼬리표 모듈을 import하지 않아야 달력 섬이 꼬리표 없는 페이지(홈·404·소개)의
   * 초기 JS에 들어가지 않는다
   */
  counterfoil?: { strip: ReactNode; panel: ReactNode };
  /** 1024 이상 왼쪽 목차 열(232px, sticky top 16px) — 주지 않으면 열 없음 */
  contents?: ReactNode;
  /** 목차 랜드마크 이름(DESIGN §10 — 뉴스 화면은 "뉴스 필터") */
  contentsLabel?: string;
  /** 1280 이상 오른쪽 마주 보는 면(296px, 왼쪽 1px 잉크 괘선) — 주지 않으면 열 없음 */
  facing?: ReactNode;
  /** 마주 보는 면 랜드마크 이름(DESIGN §10) */
  facingLabel?: string;
  /**
   * 발행 지연 안내 구간(M1-37 — src/lib/issue.ts `issueLateWindows(최신 호 날짜)`). 주면 main 맨 앞에 안내 상자(평소 숨김)를 두고 지금 시각이
   * 구간 안이면 보인다. 최신 호를 싣는 페이지(홈·`/news/`)만 준다 — 날짜 아카이브(지난 호)·소개·404에는 없다
   */
  lateWindows?: readonly LateWindow[];
  children: ReactNode;
}

/** 열 구성별 그리드 — Tailwind가 읽도록 완성된 클래스 문자열로 둔다. `lg:`·`xl:`만(DESIGN §7.1) */
const LAYOUT_GRID = {
  none: "",
  contents:
    "lg:grid lg:grid-cols-[var(--col-contents)_minmax(0,1fr)] lg:items-start",
  facing:
    "xl:grid xl:grid-cols-[minmax(0,1fr)_var(--col-facing)] xl:items-start",
  both: "lg:grid lg:grid-cols-[var(--col-contents)_minmax(0,1fr)] lg:items-start xl:grid-cols-[var(--col-contents)_minmax(0,1fr)_var(--col-facing)]",
} as const;

export type LayoutColumns = keyof typeof LAYOUT_GRID;

/** 페이지가 채운 슬롯으로 열 구성을 정한다 */
export function layoutColumns(
  hasContents: boolean,
  hasFacing: boolean,
): LayoutColumns {
  if (hasContents && hasFacing) return "both";
  if (hasContents) return "contents";
  if (hasFacing) return "facing";
  return "none";
}

export function AppShell({
  current,
  currentKind = "page",
  issue,
  siteUpdatedAt,
  counterfoil,
  contents,
  contentsLabel = "뉴스 필터",
  facing,
  facingLabel = "오늘 밤 경기·한국 선수·순위",
  lateWindows,
  children,
}: AppShellProps) {
  const columns = layoutColumns(contents != null, facing != null);
  return (
    <>
      {/* 세로 flex + 화면 높이 이상: 본문이 짧은 페이지(404 등)에서도 뒤표지가 화면 아래에 붙는다 */}
      <div className="mx-auto flex min-h-dvh max-w-page flex-col px-edge pt-3 lg:pt-6">
        <Masthead
          issue={issue}
          current={current}
          currentKind={currentKind}
          wordmarkAs={current === "home" ? "h1" : "p"}
          lastUpdated={siteUpdatedAt}
          counterfoil={counterfoil?.strip}
          counterfoilPanel={counterfoil?.panel}
        />
        <div
          data-columns={columns}
          className={cn("flex-1", LAYOUT_GRID[columns])}
        >
          {contents != null && (
            <nav
              aria-label={contentsLabel}
              className="hidden lg:sticky lg:top-4 lg:mt-7 lg:mr-9 lg:block"
            >
              {contents}
            </nav>
          )}
          <main id="main" tabIndex={-1} className="min-w-0 pt-6 lg:pt-7">
            {issue && lateWindows ? (
              <IssueLateNotice issue={issue} windows={lateWindows} />
            ) : null}
            {children}
          </main>
          {facing != null && (
            <aside
              aria-label={facingLabel}
              className="hidden xl:mt-7 xl:block xl:self-stretch xl:border-l xl:border-ink xl:pl-8"
            >
              {facing}
            </aside>
          )}
        </div>
        <Colophon issue={issue} lastUpdated={siteUpdatedAt} />
        {/* 오프라인 띠(M1-37) — 하단 탭 바로 앞. 평소 높이 0, 끊기면 하단 탭 위(1024 이상 화면 아래)에 sticky */}
        <OfflineBand />
        {/* 하단 탭(1023 이하) — 화면 아래 sticky. 셸의 마지막 흐름 요소라 끝까지 내리면 뒤표지 바로 아래에 놓여 아무것도 가리지 않는다.
            홈 표시줄(safe area)만큼 아래 여백을 더한다(viewport-fit=cover가 아니면 0) */}
        <BottomTabs
          data-slot="bottom-tabs"
          className="sticky bottom-0 z-20 -mx-edge pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {NAV_ITEMS.map(({ key, label, href, Icon }) => (
            <BottomTab
              key={key}
              href={href}
              icon={<Icon />}
              current={
                key === current &&
                (currentKind === "section" ? "section" : true)
              }
            >
              {label}
            </BottomTab>
          ))}
        </BottomTabs>
      </div>
      <Toaster />
      <StatusIsland late={issue && lateWindows ? lateWindows : undefined} />
    </>
  );
}
