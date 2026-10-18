"use client";

import { useEffect } from "react";

import { relativeKst } from "@/lib/time";

/**
 * 피드 섬 — 피드 하나에 하나(카드마다 섬을 두지 않는다, plan M1-31). 렌더 결과는 없고, 마운트되면 서버가 그린 피드 안에서 두 가지를 한다.
 *
 * 1. **상대 시간**(DESIGN §9.3 시각): `<time data-rel datetime>` 안 `[data-rel-out]`에 "3시간 전"을 채우고 1분마다 다시 계산한다.
 *    정적 HTML은 절대 시각(KST "10.11 04:24")만 갖고 있다 — 빌드 때 굳은 상대 시간이 틀린 채 남지 않게(src/lib/time.ts `relativeKst`).
 * 2. **출처 스택 펼침**(DESIGN §9.3 출처 스택): `button[data-src-toggle]`를 누르면 `aria-expanded`를 바꾸고 `aria-controls` 목록의
 *    `hidden`을 바꾼다(위임 리스너 하나). 버튼은 네이티브라 Enter·Space가 그대로 동작한다.
 *
 * 서버 컴포넌트가 그린 DOM 일부(빈 `[data-rel-out]`의 글자, 버튼·목록의 상태 속성)만 바꾼다 — React가 다시 그리지 않는 자리다.
 * `cn`(tailwind-merge)을 쓰지 않는다(섬 번들, DESIGN §9.4).
 */

/** 상대 시간 다시 계산 주기 */
const REFRESH_MS = 60_000;

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

export function FeedIsland({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    const update = () => fillRelativeTimes(root, new Date());
    update();
    const timer = window.setInterval(update, REFRESH_MS);
    const onClick = (event: MouseEvent) =>
      toggleSourceStack(root, event.target);
    root.addEventListener("click", onClick);
    return () => {
      window.clearInterval(timer);
      root.removeEventListener("click", onClick);
    };
  }, [rootId]);
  return null;
}
