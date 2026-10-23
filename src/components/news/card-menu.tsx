import { ICON_BUTTON } from "@/components/ui/button-classes";
import { MoreIcon, ShareIcon } from "@/components/ui/icons";
import { cx } from "@/lib/cx";
import { CARD_MENU } from "@/lib/news/card-menu-dom";

/**
 * 카드 메뉴 — 메타 줄 오른쪽 끝의 가로 점 3개 버튼(카드마다) + 팝오버 메뉴(공유하기 · 오류 신고↗ — **피드마다 하나**)
 * (PRD FR-34·FR-36, DESIGN.md §9.3 카드 메뉴 · §2.3 popover, 혼합안 `.menu-wrap`·`.ibtn--sm`·`.menu`, plan M1-35)
 *
 * 서버 컴포넌트(JS 0)다. 메뉴는 피드 목록 뒤에 하나만 `hidden`으로 그리고, 버튼을 누르면 피드 섬(`FeedIsland`)이 그 카드의 메뉴 묶음
 * (`[data-card-menu]` — 혼합안 `.menu-wrap`) 안 버튼 뒤로 옮겨 연다(src/lib/news/card-menu-dom.ts). 옮긴 메뉴는 카드마다 그린 혼합안 DOM과
 * 계층·위치가 같다(묶음 기준 절대 위치). 카드마다 메뉴를 그리면 홈 DOM 노드의 23%·HTML gzip 약 +8.7KB였다(리뷰 반영 2026-10-23).
 *
 * - **버튼**(`CardMenuButton`): 아이콘 버튼 변형(44×44, hover 면 currentColor 12%, 열림 면 --paper-2 — DESIGN §9.2 Button 아이콘) +
 *   혼합안 `.ibtn--sm`(margin −8 / −10 / −10 / 0, 글자 --ink-2). 바깥 여백을 음수로 줘 메타 줄을 44px로 키우지 않는다(혼합안 메타 줄 높이).
 *   z 1 — 혼합안 간격에서 버튼 44px가 위 제목 링크의 빈 아래 패딩·아래 연결 줄 44px 영역과 겹치는 곳은 작은 버튼이 이긴다(DECISIONS D0 #29).
 *   `aria-controls`는 피드 메뉴(모든 버튼이 같다), `aria-describedby`는 카드 제목(45개 "카드 메뉴" 버튼을 구분), `data-card-id`는 섬이
 *   공유 URL·이슈 폼 URL의 카드 ID를 바꿀 값.
 * - **메뉴**(`CardMenuPanel`): 버튼 기준 위 36px(= 버튼 아래 끝) · 오른쪽 −10px(버튼 오른쪽 끝과 맞춤), 최소 160px, 면 `--popover`(지면) +
 *   1px --ink 테두리 + `--shadow-print`, z 5(DESIGN §4.4 — 하단 탭 20·달력 6 아래). 항목은 최소 44px, 14px 800, 사이 1px --rule, hover
 *   `--accent`(= --paper-2). 오른쪽 기준이라 375에서도 화면 오른쪽 밖으로 나가지 않는다(인덱스 탭 열 안쪽에서 끝난다).
 *   처음 값(공유 URL·이슈 폼 URL)은 피드 첫 카드 — 섬이 연 카드의 ID로 바꾼다(피드 = 한 호라 날짜는 같다).
 * - **접근성**(APG Menu Button): 버튼 `aria-haspopup="menu"`·`aria-expanded`·`aria-controls`, 메뉴 `role="menu"`(이름 = 연 버튼 —
 *   `aria-labelledby`를 섬이 바꾼다), 항목 `role="menuitem"`·`tabindex="-1"`(포커스는 섬이 옮긴다).
 * - **공유하기**: `data-share` = 그 호의 **날짜 페이지 앵커**(절대 URL — `cardShareUrl(호 날짜, 카드 ID)`). 홈·`/news/`에서 공유해도 날짜
 *   페이지로 간다 — 최신 호가 바뀌어도 링크가 그 카드를 가리킨다(FR-34).
 * - **오류 신고↗**: 카드 ID·발행 날짜를 채운 `summary-error` 이슈 폼(`summaryErrorIssueUrl`, FR-36), 새 창(↗ + 화면 밖 "(새 창)").
 *
 * 뉴스 카드 규칙(D23·D24) 그대로 — 메뉴 문구는 UI 안내뿐이고 원제목·요약·"AI 작성" 라벨을 싣지 않는다.
 * 섬이 찾는 표식은 src/lib/news/card-menu-dom.ts `CARD_MENU`가 단일 출처다. 섬이 import해도 되게 `cx`만 쓴다(DESIGN §9.4).
 */

/** 메뉴 항목 — 최소 44px, 좌우 14px, 14px 800 --ink, 아래 1px --rule(마지막 없음), hover --accent(--paper-2) */
const ITEM =
  "flex min-h-11 items-center gap-2 border-b border-rule bg-transparent px-3.5 text-left text-sm font-extrabold text-ink no-underline transition-colors duration-fast ease-print last:border-b-0 hover:bg-accent";

/** 피드 메뉴 id — 피드 목록 id + `-menu`(페이지 안에서 유일) */
export function cardMenuId(feedId: string): string {
  return `${feedId}-menu`;
}

export interface CardMenuButtonProps {
  /** 카드 ID — 버튼 id 앞부분·`data-card-id` */
  cardId: string;
  /** 카드 제목 요소 id — 버튼 설명(`aria-describedby`) */
  titleId: string;
  /** 피드 메뉴 id(`aria-controls`) */
  menuId: string;
}

/** 카드의 메뉴 묶음 + 버튼(혼합안 `.menu-wrap` — 메타 줄 flex의 오른쪽 끝, 안의 버튼은 인라인 플렉스라 줄 상자 높이가 혼합안과 같다) */
export function CardMenuButton({
  cardId,
  titleId,
  menuId,
}: CardMenuButtonProps) {
  return (
    <span {...{ [CARD_MENU.wrap]: "" }} className="relative ml-auto flex-none">
      <button
        type="button"
        id={`${cardId}-mb`}
        {...{ [CARD_MENU.button]: "", [CARD_MENU.card]: cardId }}
        aria-label="카드 메뉴"
        aria-describedby={titleId}
        aria-haspopup="menu"
        aria-expanded="false"
        aria-controls={menuId}
        className={cx(ICON_BUTTON, "z-1 -mt-2 -mr-2.5 -mb-2.5 text-ink-2")}
      >
        <MoreIcon />
      </button>
    </span>
  );
}

export interface CardMenuPanelProps {
  /** 피드 메뉴 id */
  id: string;
  /** 처음 공유 URL(피드 첫 카드 — 섬이 연 카드로 바꾼다) */
  shareUrl: string;
  /** 처음 이슈 폼 URL(피드 첫 카드 — 섬이 연 카드로 바꾼다) */
  reportUrl: string;
}

/** 피드 메뉴 하나 — 처음 `hidden`, 섬이 연 카드의 메뉴 묶음으로 옮긴다 */
export function CardMenuPanel({ id, shareUrl, reportUrl }: CardMenuPanelProps) {
  return (
    <span
      id={id}
      role="menu"
      aria-label="카드 메뉴"
      hidden
      className="absolute top-9 -right-2.5 z-5 flex min-w-40 scroll-mb-19 flex-col border border-ink bg-popover text-popover-foreground shadow-print lg:scroll-mb-4"
    >
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        {...{ [CARD_MENU.share]: shareUrl }}
        className={ITEM}
      >
        <ShareIcon size={18} />
        공유하기
      </button>
      <a
        role="menuitem"
        tabIndex={-1}
        href={reportUrl}
        target="_blank"
        rel="noopener"
        className={cx(ITEM, "justify-between")}
      >
        오류 신고
        <span aria-hidden="true">↗</span>
        <span className="sr-only">(새 창)</span>
      </a>
    </span>
  );
}
