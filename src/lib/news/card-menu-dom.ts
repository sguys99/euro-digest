/**
 * 카드 메뉴 — DOM 약속과 여닫기 (PRD FR-34·FR-36, DESIGN.md §9.3 카드 메뉴, plan M1-35)
 *
 * **메뉴 마크업은 피드마다 하나**다(서버 컴포넌트 src/components/news/card-menu.tsx `CardMenuPanel`, 처음 `hidden`·피드 목록 뒤). 카드에는
 * 메뉴 버튼만 있고(`CardMenuButton`), 버튼을 누르면 피드 섬(src/components/news/feed-island.tsx)이 이 파일의 함수로 메뉴를 **그 카드의 메뉴
 * 묶음(`[data-card-menu]`) 자리로 옮기고** "공유하기"의 공유 URL·"오류 신고"의 이슈 폼 URL에서 카드 ID만 바꾼 뒤 연다(리뷰 반영 2026-10-23 —
 * 카드마다 메뉴를 그리면 홈 DOM의 23%·HTML gzip +8.7KB였다). 옮긴 자리의 모양·위치는 카드마다 그린 메뉴와 같다(버튼 기준 절대 위치).
 * 닫으면 원래 자리로 돌려보낸다(React가 그린 노드라 — `restoreCardMenu`).
 *
 * | 속성 | 요소 | 뜻 |
 * |------|------|----|
 * | `data-card-menu` | 카드의 메뉴 묶음 `<span>` | 메뉴를 옮겨 붙이는 자리 · 바깥 클릭·포커스 판정의 경계 |
 * | `data-menu-button` + `data-card-id` | 가로 점 3개 `<button>` | `aria-controls` = 피드 메뉴 id(모든 버튼이 같다), `aria-expanded`는 연 버튼만 true |
 * | `role="menu"` · `role="menuitem"` | 피드 메뉴 · 항목 | 항목은 `tabindex="-1"` — 포커스는 섬이 옮긴다(APG Menu Button) |
 * | `data-share` | "공유하기" 항목 | 값 = 공유 URL(절대 — 그 호의 날짜 페이지 앵커). 연 카드의 ID로 앵커만 바꾼다 |
 * | `a[href]` 항목 | "오류 신고" | `summary-error` 이슈 폼 URL. 연 카드의 ID로 `card` 값만 바꾼다(쿼리 순서 그대로) |
 *
 * URL은 서버가 src/lib/paths.ts 빌더(`cardShareUrl`·`summaryErrorIssueUrl`)로 만든 값(피드 = 한 호라 날짜가 같다)에서 카드 ID만 바꾼다 —
 * 빌더를 섬에서 부르면 `cardShareUrl`이 `createPaths` 전체를 끌어와 섬이 gzip 약 2.4KB 커진다(실측). 열린 메뉴는 문서 전체에서 하나라
 * 모듈 변수 하나로 든다(목록을 다시 훑지 않는다).
 *
 * DOM 타입만 쓴다(fs·zod·React 없음) — 섬 번들에 들어간다.
 */

export const CARD_MENU = {
  wrap: "data-card-menu",
  button: "data-menu-button",
  card: "data-card-id",
  share: "data-share",
} as const;

const BUTTON = `button[${CARD_MENU.button}]`;
const ITEM = '[role="menuitem"]';

/** 메뉴 버튼 선택자 */
export const CARD_MENU_BUTTON = BUTTON;
/** 메뉴 항목 선택자 */
export const CARD_MENU_ITEM = ITEM;

/** 지금 열린 메뉴의 버튼 — 문서 전체에서 하나(한 페이지에 피드가 둘이어도) */
let openButton: HTMLElement | null = null;

/** 지금 열린 메뉴의 버튼(없거나 문서에서 떨어졌으면 null) */
export function openCardMenuButton(): HTMLElement | null {
  return openButton?.isConnected ? openButton : null;
}

/** 버튼이 여닫는 메뉴(`aria-controls` — 피드 메뉴) */
export function menuOf(button: Element): HTMLElement | null {
  const id = button.getAttribute("aria-controls");
  return id ? button.ownerDocument.getElementById(id) : null;
}

/** 메뉴 안 요소 → 그 메뉴를 연 버튼(같은 메뉴 묶음 안) */
export function menuButtonOf(node: Element): HTMLButtonElement | null {
  return (
    node
      .closest(`[${CARD_MENU.wrap}]`)
      ?.querySelector<HTMLButtonElement>(BUTTON) ?? null
  );
}

/** 열렸나 */
export function isMenuOpen(button: Element): boolean {
  return button.getAttribute("aria-expanded") === "true";
}

/** 공유 URL의 앵커를 카드 ID로(그 밖은 그대로). 읽을 수 없으면 그대로 */
export function withShareCard(url: string, cardId: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = cardId;
    return parsed.href;
  } catch {
    return url;
  }
}

/** 이슈 폼 URL의 `card` 값을 카드 ID로(쿼리 순서 그대로 — `summaryErrorIssueUrl`과 같은 모양). 읽을 수 없으면 그대로 */
export function withReportCard(url: string, cardId: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("card", cardId);
    return parsed.href;
  } catch {
    return url;
  }
}

/**
 * 메뉴의 원래 자리(서버가 그린 곳 — 피드 목록 뒤). 닫으면 돌려보낸다 — 메뉴는 React가 그린 노드라, 다른 카드 안에 둔 채 React가 그 카드를
 * 지우거나(같은 경로 다른 날짜로 클라이언트 이동 — 카드 `<li>`가 바뀐다) 메뉴를 기준으로 형제를 끼우면 메뉴가 문서에서 떨어지거나
 * `insertBefore`가 실패한다. 열려 있는 동안만 카드 안에 있다(이동·뒤로 가기는 바깥 클릭·popstate로 먼저 닫힌다).
 */
const homes = new WeakMap<HTMLElement, { parent: Node; next: Node | null }>();

/** 메뉴를 원래 자리로 돌려보낸다(옮긴 적이 없으면 그대로) */
export function restoreCardMenu(menu: HTMLElement): void {
  const home = homes.get(menu);
  if (!home || menu.parentNode === home.parent) return;
  home.parent.insertBefore(
    menu,
    home.next && home.next.parentNode === home.parent ? home.next : null,
  );
}

/** 메뉴를 그 버튼의 카드 자리(메뉴 묶음 — 버튼 바로 뒤)로 옮기고, 이름·공유 URL·이슈 폼 URL을 그 카드로 바꾼다 */
export function attachCardMenu(button: HTMLElement, menu: HTMLElement): void {
  const wrap = button.closest(`[${CARD_MENU.wrap}]`);
  if (!homes.has(menu) && menu.parentNode)
    homes.set(menu, { parent: menu.parentNode, next: menu.nextSibling });
  if (wrap && menu.parentElement !== wrap) wrap.append(menu);
  if (button.id) menu.setAttribute("aria-labelledby", button.id);
  const cardId = button.getAttribute(CARD_MENU.card);
  if (!cardId) return;
  const share = menu.querySelector(`[${CARD_MENU.share}]`);
  const shareUrl = share?.getAttribute(CARD_MENU.share);
  if (share && shareUrl)
    share.setAttribute(CARD_MENU.share, withShareCard(shareUrl, cardId));
  const report = menu.querySelector<HTMLAnchorElement>(`a${ITEM}[href]`);
  const reportUrl = report?.getAttribute("href");
  if (report && reportUrl)
    report.setAttribute("href", withReportCard(reportUrl, cardId));
}

/**
 * 메뉴를 열거나 닫는다(포커스는 부르는 쪽). 열면 다른 열린 메뉴를 먼저 닫고 메뉴를 그 카드로 옮기며, 닫으면 원래 자리로 돌려보낸다.
 * 메뉴를 돌려준다.
 */
export function setCardMenu(
  button: HTMLElement,
  open: boolean,
): HTMLElement | null {
  const menu = menuOf(button);
  if (open) {
    const other = openCardMenuButton();
    if (other && other !== button) setCardMenu(other, false);
    if (menu) attachCardMenu(button, menu);
    openButton = button;
  } else if (openButton === button) {
    openButton = null;
  }
  button.setAttribute("aria-expanded", open ? "true" : "false");
  if (menu) {
    menu.hidden = !open;
    if (!open) restoreCardMenu(menu);
  }
  return menu;
}

/** 열린 메뉴를 닫는다(`scope`를 주면 그 안의 메뉴일 때만). 닫은 버튼(없으면 null) */
export function closeCardMenu(scope?: Node | null): HTMLElement | null {
  const button = openCardMenuButton();
  if (!button) {
    openButton = null;
    return null;
  }
  if (scope && !scope.contains(button)) return null;
  setCardMenu(button, false);
  return button;
}

/** 메뉴의 항목들(문서 순서) */
export function menuItems(menu: ParentNode): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>(ITEM)];
}

/**
 * 키 → 옮겨 갈 항목(APG Menu): ↓ 다음(끝에서 처음으로) · ↑ 이전(처음에서 끝으로) · Home 처음 · End 끝. `from`이 항목이 아니면
 * ↓는 처음, ↑는 끝(버튼에서 메뉴를 열 때). 그 밖의 키는 null.
 */
export function menuKeyTarget(
  menu: ParentNode,
  from: Element | null,
  key: string,
): HTMLElement | null {
  const items = menuItems(menu);
  const n = items.length;
  if (n === 0) return null;
  const i = from ? items.indexOf(from as HTMLElement) : -1;
  switch (key) {
    case "ArrowDown":
      return items[i < 0 ? 0 : (i + 1) % n] ?? null;
    case "ArrowUp":
      return items[i < 0 ? n - 1 : (i - 1 + n) % n] ?? null;
    case "Home":
      return items[0] ?? null;
    case "End":
      return items[n - 1] ?? null;
    default:
      return null;
  }
}
