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
