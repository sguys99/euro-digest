"use client";

import { useEffect } from "react";

import { toast } from "@/components/ui/toast";
import {
  CARD_MENU,
  CARD_MENU_BUTTON,
  CARD_MENU_ITEM,
  closeCardMenu,
  isMenuOpen,
  menuButtonOf,
  menuKeyTarget,
  menuOf,
  openCardMenuButton,
  setCardMenu,
} from "@/lib/news/card-menu-dom";
import {
  browserShareEnv,
  shareLink,
  sharePathOf,
  type ShareOutcome,
} from "@/lib/share";
import { relativeKst } from "@/lib/time";

/**
 * 피드 섬 — 피드 하나에 하나(카드마다 섬을 두지 않는다, plan M1-31·M1-35). 렌더 결과는 없고, 마운트되면 서버가 그린 피드 안에서 세 가지를 한다.
 *
 * 1. **상대 시간**(DESIGN §9.3 시각): `<time data-rel datetime>` 안 `[data-rel-out]`에 "3시간 전"을 채우고 1분마다 다시 계산한다.
 *    정적 HTML은 절대 시각(KST "10.11 04:24")만 갖고 있다 — 빌드 때 굳은 상대 시간이 틀린 채 남지 않게(src/lib/time.ts `relativeKst`).
 * 2. **출처 스택 펼침**(DESIGN §9.3 출처 스택): `button[data-src-toggle]`를 누르면 `aria-expanded`를 바꾸고 `aria-controls` 목록의
 *    `hidden`을 바꾼다(위임 리스너 하나). 버튼은 네이티브라 Enter·Space가 그대로 동작한다.
 * 3. **카드 메뉴**(M1-35, DESIGN §9.3 카드 메뉴 — APG Menu Button): 가로 점 3개 버튼 → 메뉴(공유하기 · 오류 신고↗).
 *    - 메뉴 마크업은 피드마다 하나다 — 버튼을 누르면 그 카드의 메뉴 묶음으로 옮기고 공유 URL·이슈 폼 URL의 카드 ID를 바꿔 연다
 *      (src/lib/news/card-menu-dom.ts). 열린 메뉴는 문서 전체에서 하나(모듈 변수 하나 — 목록을 훑지 않는다).
 *    - 열면 첫 항목으로 포커스(버튼에서 ↓는 첫 항목·↑는 끝 항목으로 열기).
 *    - 항목 위 ↓↑(순환)·Home·End로 옮기고, Esc는 닫고 버튼으로 복귀, Tab은 닫고 버튼 다음(Shift+Tab은 앞) 요소로 간다.
 *    - 바깥 클릭·바깥으로 간 포커스·뒤로 가기(주소로 필터가 바뀜)로 닫힌다(포커스는 옮기지 않는다 — 이미 바깥에 있다). 필터 칩·목차를
 *      누르는 것도 바깥 클릭·포커스라, 필터로 숨는 카드의 메뉴가 열린 채 남지 않는다.
 *    - 메뉴가 처리한 Esc는 `preventDefault` — 375 달력 시트(M1-34 — 포커스가 밖이면 닫기만)는 `defaultPrevented`면 건너뛰어 같은 Esc로
 *      함께 닫히지 않는다(가장 위의 것 하나만). 포커스가 문서 바깥(body)에 있을 때의 Esc는 문서에서 받아 닫고 버튼으로 돌린다.
 *    - 공유하기: 메뉴를 닫고 버튼으로 포커스를 돌린 뒤 `shareLink`(src/lib/share.ts — 터치 기기 Web Share, 아니면 클립보드) →
 *      복사면 토스트 "링크를 복사했어요", 복사가 막히면 "링크를 복사하지 못했어요" + "링크 열기"(그 카드의 날짜 페이지로 — 주소창에 공유 링크).
 *      실패 토스트는 액션으로 포커스를 옮기고 닫기 버튼을 단다(키보드로 바로 닿게 — 닫히면 토스트 규칙대로 메뉴 버튼으로 복귀).
 *      시트를 닫은 취소는 조용히 끝낸다. 오류 신고는 링크라 새 창이 열리고 메뉴만 닫는다.
 *
 * 서버 컴포넌트가 그린 DOM 일부(빈 `[data-rel-out]`의 글자, 버튼·목록·메뉴의 상태 속성)만 바꾼다 — React가 다시 그리지 않는 자리다.
 * `cn`(tailwind-merge)을 쓰지 않는다(섬 번들, DESIGN §9.4).
 */

/** 상대 시간 다시 계산 주기 */
const REFRESH_MS = 60_000;

/** 복사가 막혔을 때 토스트 시간 — 포커스가 토스트 안에 있는 동안은 멈춘다(WCAG 2.2.1), 벗어나면 이 시간 뒤 닫힌다 */
export const SHARE_FALLBACK_TOAST_MS = 6000;

/**
 * 카드 상대 시간 — `relativeKst`(src/lib/time.ts)와 같되, 원문 시각이 기기 시계보다 미래면 "방금"(M1-31 리뷰).
 * 기기 시계가 늦거나 피드 시각이 앞서 있으면 `relativeKst`는 1분이 넘는 미래를 긴 날짜 표기("10월 11일 (일) 08:00")로 돌려 —
 * 미리 잡은 칸("00시간 전")을 넘쳐 레이아웃이 밀리고 옆 절대 시각과 같은 내용이 두 번 보인다. 공용 동작(time.ts)은 그대로 두고 카드에서만 줄인다.
 * 읽을 수 없는 시각은 던진다(부르는 쪽이 빈칸으로).
 */
export function cardRelativeTime(iso: string, now: Date): string {
  const label = relativeKst(iso, now);
  return Date.parse(iso) > now.getTime() ? "방금" : label;
}

/** 피드 안 상대 시간을 지금 시각으로 채운다(시각을 읽을 수 없으면 비워 둔다 — 절대 시각은 그대로) */
export function fillRelativeTimes(root: ParentNode, now: Date): void {
  for (const time of root.querySelectorAll<HTMLTimeElement>("time[data-rel]")) {
    const out = time.querySelector("[data-rel-out]");
    if (!out) continue;
    let text = "";
    try {
      text = cardRelativeTime(time.dateTime, now);
    } catch {
      text = "";
    }
    if (out.textContent !== text) out.textContent = text;
  }
}

/** 출처 스택 버튼을 누른 것이면 펼침을 바꾼다 */
export function toggleSourceStack(
  root: Element,
  target: EventTarget | null,
): void {
  if (!(target instanceof Element)) return;
  const button = target.closest("button[data-src-toggle]");
  if (!button || !root.contains(button)) return;
  const list = document.getElementById(
    button.getAttribute("aria-controls") ?? "",
  );
  const open = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", open ? "true" : "false");
  if (list) list.hidden = !open;
}

// ─── 카드 메뉴 ──────────────────────────────────────────────────────────────

/**
 * 메뉴를 그 카드로 옮겨 열고 첫(끝) 항목으로 포커스 — 다른 열린 카드 메뉴는 닫힌다(문서 전체에서 하나만).
 * 화면 아래 끝에 걸리면 메뉴가 보이게 가장 가까운 만큼만 올린다(메뉴의 `scroll-margin-bottom`이 1023 이하 하단 탭 자리를 비운다).
 */
export function openCardMenu(
  button: HTMLElement,
  focus: "first" | "last" = "first",
): void {
  const menu = setCardMenu(button, true);
  if (!menu) return;
  menuKeyTarget(menu, null, focus === "first" ? "Home" : "End")?.focus({
    preventScroll: true,
  });
  menu.scrollIntoView?.({ block: "nearest" });
}

/** 카드 메뉴 동작 — 섬이 주입한다(테스트는 가짜로) */
export interface CardMenuActions {
  /** 공유하기 — 값은 공유 URL */
  share: (url: string) => void;
}

/** 피드 안 클릭 — 메뉴 버튼(여닫기) · 메뉴 항목(닫고 버튼으로 복귀, 공유하기면 공유) */
export function handleCardMenuClick(
  root: Element,
  target: EventTarget | null,
  actions: CardMenuActions,
): void {
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>(CARD_MENU_BUTTON);
  if (button && root.contains(button)) {
    if (isMenuOpen(button)) setCardMenu(button, false);
    else openCardMenu(button, "first");
    return;
  }
  const item = target.closest<HTMLElement>(CARD_MENU_ITEM);
  if (!item || !root.contains(item)) return;
  const owner = menuButtonOf(item);
  if (owner) {
    setCardMenu(owner, false);
    owner.focus();
  }
  const url = item.getAttribute(CARD_MENU.share);
  if (url !== null) actions.share(url);
}

/**
 * 피드 안 키 — 메뉴 버튼(↓↑로 열기 · Esc 닫기) · 메뉴 항목(↓↑ Home End 이동 · Esc 닫고 복귀 · Tab 닫기 · Space로 링크 실행).
 * 처리한 Esc는 `preventDefault` — 달력 섬 등 다른 Esc 처리가 `defaultPrevented`로 건너뛴다.
 */
export function handleCardMenuKey(root: Element, event: KeyboardEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>(CARD_MENU_BUTTON);
  if (button && root.contains(button)) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openCardMenu(button, event.key === "ArrowDown" ? "first" : "last");
    } else if (event.key === "Escape" && isMenuOpen(button)) {
      event.preventDefault();
      setCardMenu(button, false);
    }
    return;
  }
  const item = target.closest<HTMLElement>(CARD_MENU_ITEM);
  if (!item || !root.contains(item)) return;
  const owner = menuButtonOf(item);
  const menu = owner ? menuOf(owner) : null;
  if (!owner || !menu) return;
  switch (event.key) {
    case "Escape":
      event.preventDefault();
      setCardMenu(owner, false);
      owner.focus();
      return;
    case "Tab":
      // 버튼으로 포커스를 옮긴 뒤 닫는다 — Tab 기본 동작이 버튼 다음(Shift+Tab은 앞) 요소로 이어 간다(항목은 tabindex -1)
      owner.focus();
      setCardMenu(owner, false);
      return;
    case " ":
      // 링크 항목은 Space로 눌리지 않는다(버튼 항목은 네이티브) — APG 메뉴 항목은 Space로도 실행한다
      if (item instanceof HTMLAnchorElement) {
        event.preventDefault();
        item.click();
      }
      return;
    default: {
      const to = menuKeyTarget(menu, item, event.key);
      if (to) {
        event.preventDefault();
        to.focus();
      }
    }
  }
}

/** 열린 메뉴가 `root` 안에 있고 `target`이 그 메뉴 묶음(버튼 + 메뉴) 밖이면 닫는다 — 바깥 클릭·바깥 포커스 */
export function closeCardMenusOutside(
  root: ParentNode,
  target: EventTarget | null,
): void {
  const button = openCardMenuButton();
  if (!button || !root.contains(button)) return;
  const wrap = button.closest(`[${CARD_MENU.wrap}]`);
  if (!(target instanceof Node) || !wrap?.contains(target)) {
    setCardMenu(button, false);
  }
}

/**
 * 카드 링크를 공유하거나 복사하고 결과를 토스트로 알린다(공유 시트·취소는 토스트 없음). 문구는 UI 안내뿐이다.
 * 복사가 막히면(비보안 출처·권한) "링크 열기" — 그 카드의 날짜 페이지로 가 주소창에 공유 링크가 뜬다(prompt 없이). 이 대체 경로는
 * 키보드로 바로 닿게 액션으로 포커스를 옮기고 닫기 버튼을 단다(토스트가 닫히면 메뉴 버튼으로 포커스 복귀 — Toast 규칙).
 */
export async function shareCardLink(
  url: string,
  win: Window = window,
): Promise<ShareOutcome> {
  const outcome = await shareLink(url, browserShareEnv(win));
  if (outcome === "copied") {
    toast({ kind: "공유", message: "링크를 복사했어요" });
  } else if (outcome === "failed") {
    const path = sharePathOf(url);
    toast({
      kind: "공유",
      message: "링크를 복사하지 못했어요",
      duration: SHARE_FALLBACK_TOAST_MS,
      dismissible: true,
      ...(path
        ? {
            focusAction: true,
            action: {
              label: "링크 열기",
              onClick: () => win.location.assign(path),
            },
          }
        : {}),
    });
  }
  return outcome;
}

export function FeedIsland({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    const update = () => fillRelativeTimes(root, new Date());
    update();
    const timer = window.setInterval(update, REFRESH_MS);
    const actions: CardMenuActions = {
      share: (url) => void shareCardLink(url),
    };
    const onClick = (event: MouseEvent) => {
      toggleSourceStack(root, event.target);
      handleCardMenuClick(root, event.target, actions);
    };
    const onKeyDown = (event: KeyboardEvent) => handleCardMenuKey(root, event);
    // 바깥 클릭·바깥 포커스 — 문서에서 받는다(피드 안 클릭은 위 위임 리스너가 먼저 처리한다)
    const onOutside = (event: Event) =>
      closeCardMenusOutside(root, event.target);
    // 포커스가 문서 바깥(body — 메뉴 테두리 같은 포커스 없는 곳을 누름)에 있을 때의 Esc
    const onDocumentKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const active = document.activeElement;
      const closed = closeCardMenu(root);
      if (!closed) return;
      event.preventDefault();
      if (!active || active === document.body) closed.focus();
    };
    const onPopState = () => closeCardMenu(root);
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onOutside);
    document.addEventListener("focusin", onOutside);
    document.addEventListener("keydown", onDocumentKey);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.clearInterval(timer);
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onOutside);
      document.removeEventListener("focusin", onOutside);
      document.removeEventListener("keydown", onDocumentKey);
      window.removeEventListener("popstate", onPopState);
    };
  }, [rootId]);
  return null;
}
