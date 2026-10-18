/**
 * 견본 e2e 헬퍼 (D0-12) — 강제 의사 클래스(CDP)·캡처 조건.
 * 파일 이름이 *.spec.ts가 아니므로 Playwright가 테스트로 실행하지 않는다.
 */
import type { Page } from "@playwright/test";

/** 견본 라우트(baseURL 기준 상대 경로) */
export const SPECIMEN_PATH = "specimen/";

/**
 * 검사 폭 — DESIGN §10의 375·1024·1280(1024 = `lg` 2단 시작, 컴포넌트에 `lg:` 값이 있다 — D31).
 * 1023 이하는 375 열 값이라 따로 보지 않는다.
 */
export const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
] as const;

/** 전체 페이지 스크린샷을 남기는 폭 — 문서 기준 이미지(DESIGN §0.1 `impl-components-{375,1280}-*`)와 같은 폭만 */
export const SCREENSHOT_WIDTHS: ReadonlySet<number> = new Set([375, 1280]);

export const SCHEMES = ["light", "dark"] as const;

/**
 * `data-force="hover focus-visible …"`가 붙은 요소에 실제 의사 클래스를 강제한다(Chrome DevTools Protocol
 * `CSS.forcePseudoState`). 컴포넌트의 진짜 CSS(`hover:`·`:focus-visible`·`target:`)가 그대로 걸린다.
 * 강제한 요소 수를 돌려준다. CDP 세션이 닫히면 강제도 풀리므로 세션을 돌려준다.
 */
export async function forcePseudoStates(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
    nodeId: root.nodeId,
    selector: "[data-force]",
  });
  for (const nodeId of nodeIds) {
    const { attributes } = await cdp.send("DOM.getAttributes", { nodeId });
    const index = attributes.indexOf("data-force");
    const states = (attributes[index + 1] ?? "").split(/\s+/).filter(Boolean);
    await cdp.send("CSS.forcePseudoState", {
      nodeId,
      forcedPseudoClasses: states,
    });
  }
  return { cdp, count: nodeIds.length };
}

/** 웹폰트가 실제로 쓰였는지 — 캡처 전에 기다린다(D0-04 조건) */
export async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/**
 * 전체 페이지 캡처용 — sticky·fixed 요소를 캡처에서만 static으로 바꾼다(전체 페이지 캡처는 레이아웃 뷰포트를 늘리지 않아
 * 고정 요소가 첫 화면 위치에 겹쳐 그려진다, D0-04와 같은 조건).
 */
export async function staticizeFixed(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const position = getComputedStyle(el).position;
      if (position === "sticky" || position === "fixed") {
        el.setAttribute("data-cap-static", position);
      }
    }
    const style = document.createElement("style");
    style.textContent = "[data-cap-static]{position:static!important}";
    document.head.appendChild(style);
  });
}

/** 지금 화면에 쓰이는 theme-color(미디어가 맞는 첫 메타의 content) */
export async function effectiveThemeColor(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const metas = [
      ...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
    ];
    const hit = metas.find(
      (meta) => matchMedia(meta.getAttribute("media") || "all").matches,
    );
    return hit?.getAttribute("content")?.toUpperCase() ?? null;
  });
}

/** 하이드레이션이 끝날 때까지 기다린다 — Next App Router는 하이드레이션 뒤 effect에서 `<next-route-announcer>`를 단다 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector("next-route-announcer") !== null,
  );
}

/** 지금 theme-color 메타 노드를 페이지 쪽에 기억해 둔다(클라이언트 이동 뒤 같은 노드인지 보려고). 메타 수를 돌려준다 */
export async function markThemeColorMetas(page: Page): Promise<number> {
  return page.evaluate(() => {
    const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
    (window as unknown as { __themeColorMetas?: Element[] }).__themeColorMetas =
      metas;
    return metas.length;
  });
}

/** `markThemeColorMetas` 때와 같은 메타 노드가 그대로 문서에 있는지(바꿔 넣지 않았는지) */
export async function sameThemeColorMetas(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const before =
      (window as unknown as { __themeColorMetas?: Element[] })
        .__themeColorMetas ?? [];
    const now = [...document.querySelectorAll('meta[name="theme-color"]')];
    return (
      before.length > 0 &&
      now.length === before.length &&
      now.every((meta, i) => meta === before[i])
    );
  });
}

/**
 * 터치 타깃 44px 검사(DESIGN §9.1·§10) — `selector`에 맞는 요소마다 가운데에서 위아래·좌우 21.5px(44px 안쪽, 반올림 여유 0.5px)를
 * 눌러 그 요소(또는 그 안)가 맞는지 본다. 놓친 요소의 설명 목록을 돌려준다(빈 배열 = 통과).
 * - 그려지지 않은 요소(닫힌 '+N곳' 목록 안 링크 등)는 누를 수 없으므로 건너뛴다.
 * - 여러 줄 인라인 링크(카드 제목)는 줄 조각마다 본다 — 조각 높이 = 글꼴 내용 영역 + 위아래 패딩. 좌우 점은 44px 이상인 조각만 본다.
 * - 겹침 허용은 좁게(M1-31 리뷰): 인라인 조각의 가운데 세로줄이 놓친 점이 **모두** `overlapAllow` 요소(기본 '+N곳' 버튼
 *   `[data-src-toggle]` — 혼합안 간격에서 제목 마지막 줄의 빈 아래 패딩과 겹치고 그 자리는 작은 버튼이 이긴다, DESIGN §11.6)에
 *   가려졌을 때만 왼쪽·오른쪽(가장자리에서 22px) 세로줄을 더 본다 — 그중 하나가 위아래 모두 맞아야 통과. 다른 요소에 가려지면 실패다.
 */
export async function touchTargetFailures(
  page: Page,
  selector: string,
  overlapAllow = "[data-src-toggle]",
): Promise<string[]> {
  return page.evaluate(
    ({ sel, allow }) => {
      const out: string[] = [];
      const half = 21.5;
      const hitAt = (x: number, y: number) => document.elementFromPoint(x, y);
      const hits = (el: Element, x: number, y: number) => {
        const hit = hitAt(x, y);
        return hit !== null && (hit === el || el.contains(hit));
      };
      const column = (el: Element, x: number, cy: number) =>
        [cy - half, cy + half].filter((y) => !hits(el, x, y));
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        if (el.getClientRects().length === 0) continue;
        el.scrollIntoView({ block: "center", inline: "center" });
        const inline = getComputedStyle(el).display === "inline";
        const rects = inline
          ? [...el.getClientRects()]
          : [el.getBoundingClientRect()];
        for (const r of rects) {
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const missed = column(el, cx, cy);
          let vertical = missed.length === 0;
          let note = "";
          if (!vertical && inline) {
            const blockers = missed.map((y) => hitAt(cx, y));
            if (blockers.every((b) => b?.closest(allow))) {
              const edge = Math.min(22, r.width / 2);
              vertical = [r.left + edge, r.right - edge].some(
                (x) => column(el, x, cy).length === 0,
              );
              note = " (허용 겹침 밖 세로줄도 놓침)";
            } else {
              note = ` (가림: ${blockers.map((b) => b?.tagName.toLowerCase() ?? "없음").join("·")})`;
            }
          }
          const horizontal =
            inline && r.width < 44
              ? true
              : hits(el, cx - half, cy) && hits(el, cx + half, cy);
          if (!vertical || !horizontal) {
            const name =
              el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
            out.push(
              `${el.closest("article")?.id ?? ""} ${el.tagName.toLowerCase()} "${name.slice(0, 20)}" ${Math.round(r.width)}×${Math.round(r.height)} — ${vertical ? "" : "위아래" + note}${horizontal ? "" : " 좌우"}`,
            );
          }
        }
      }
      return out;
    },
    { sel: selector, allow: overlapAllow },
  );
}
