import { expect, test, type Page } from "@playwright/test";

import {
  hexToCssRgb,
  normalizeCssValue,
  parseDesignTokens,
  readDesignMd,
  splitTypeScale,
  type ColorToken,
  type FixedToken,
  type ResponsiveToken,
} from "../support/design-tokens";

// 테마 3상태 · 결과 가리기 초기 스크립트와 토큰 CSS를 빌드 결과(out/)에서 확인한다 (D0-10, DR-02, DESIGN.md §8).
// 기대 값은 DESIGN.md 토큰 표에서 읽는다(하드코딩하지 않는다).

const designTokens = parseDesignTokens(readDesignMd());
const colors = new Map(
  designTokens
    .filter((t): t is ColorToken => t.kind === "color")
    .map((t) => [t.name, t]),
);
const responsive = designTokens.filter(
  (t): t is ResponsiveToken => t.kind === "responsive",
);
const fixed = new Map(
  designTokens
    .filter((t): t is FixedToken => t.kind === "fixed")
    .map((t) => [t.name, t.value]),
);

function expected(name: string, theme: "light" | "dark"): string {
  const token = colors.get(name);
  if (!token) throw new Error(`DESIGN.md에 ${name} 없음`);
  return hexToCssRgb(token[theme]);
}

/** 첫 페이지 스크립트보다 먼저 localStorage를 채우고, data-theme가 <body> 생성 전에 달리는지 기록한다. */
async function prepare(
  page: Page,
  stored: Record<string, string>,
): Promise<void> {
  await page.addInitScript((items: Record<string, string>) => {
    for (const [key, value] of Object.entries(items)) {
      localStorage.setItem(key, value);
    }
    const original = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name: string, value: string) {
      if (this === document.documentElement && name.startsWith("data-")) {
        (window as unknown as Record<string, unknown>)[`__${name}BeforeBody`] =
          document.body === null;
      }
      return original.call(this, name, value);
    };
  }, stored);
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    const body = getComputedStyle(document.body);
    const w = window as unknown as Record<string, unknown>;
    return {
      theme: html.getAttribute("data-theme"),
      spoiler: html.getAttribute("data-spoiler"),
      colorScheme: getComputedStyle(html).colorScheme,
      background: body.backgroundColor,
      color: body.color,
      themeBeforeBody: w["__data-themeBeforeBody"] ?? null,
      spoilerBeforeBody: w["__data-spoilerBeforeBody"] ?? null,
    };
  });
}

const CASES = [
  { stored: undefined, system: "light", attr: null, shown: "light" },
  { stored: undefined, system: "dark", attr: null, shown: "dark" },
  { stored: "light", system: "light", attr: "light", shown: "light" },
  { stored: "light", system: "dark", attr: "light", shown: "light" },
  { stored: "dark", system: "light", attr: "dark", shown: "dark" },
  { stored: "dark", system: "dark", attr: "dark", shown: "dark" },
  { stored: "sepia", system: "dark", attr: null, shown: "dark" },
] as const;

for (const c of CASES) {
  test(`ed-theme=${c.stored ?? "(없음)"} · 시스템 ${c.system} → ${c.shown}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: c.system });
    await prepare(page, c.stored ? { "ed-theme": c.stored } : {});
    await page.goto("./");

    const s = await snapshot(page);
    expect(s.theme).toBe(c.attr);
    expect(s.colorScheme).toBe(c.shown);
    expect(s.background).toBe(expected("--paper", c.shown));
    expect(s.color).toBe(expected("--ink", c.shown));
    // 속성은 <body>가 생기기 전(첫 페인트 전)에 달린다 — 깜빡임 없음
    if (c.attr) expect(s.themeBeforeBody).toBe(true);
  });
}

test("ed-spoiler=on → <body> 전에 data-spoiler=on", async ({ page }) => {
  await prepare(page, { "ed-spoiler": "on" });
  await page.goto("./");
  const s = await snapshot(page);
  expect(s.spoiler).toBe("on");
  expect(s.spoilerBeforeBody).toBe(true);
});

test("localStorage 접근이 막혀도 오류 없이 시스템 테마로 렌더한다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("차단", "SecurityError");
      },
    });
  });
  await page.goto("./");

  const s = await snapshot(page);
  expect(s.theme).toBeNull();
  expect(s.spoiler).toBeNull();
  expect(s.background).toBe(expected("--paper", "dark"));
  expect(errors).toEqual([]);
});

/** <html>의 반응형 토큰 계산값이 DESIGN.md 375 열(wide=false) 또는 1280 열(wide=true)과 같은지 */
async function expectResponsiveTokens(page: Page, wide: boolean) {
  const names = responsive.flatMap((t) =>
    t.name.startsWith("--text-")
      ? [t.name, t.name.replace(/^--text-/, "--lh-")]
      : [t.name],
  );
  const actual = await page.evaluate((list: string[]) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      list.map((name) => [name, style.getPropertyValue(name).trim()]),
    );
  }, names);

  const want: Record<string, string> = {};
  for (const t of responsive) {
    const value = wide ? t.wide : t.narrow;
    const scale = /^--(?:text|num)-/.test(t.name)
      ? splitTypeScale(value)
      : null;
    want[t.name] = normalizeCssValue(scale?.size ?? value);
    if (t.name.startsWith("--text-") && scale) {
      want[t.name.replace(/^--text-/, "--lh-")] = normalizeCssValue(
        scale.lineHeight,
      );
    }
  }
  const got = Object.fromEntries(
    Object.entries(actual).map(([k, v]) => [k, normalizeCssValue(v)]),
  );
  expect(got).toEqual(want);
}

test("반응형 토큰: 1023 이하는 375 열, 1024 이상(lg)은 1280 열 값", async ({
  page,
}) => {
  await page.goto("./");
  const width = page.viewportSize()?.width ?? 0;
  await expectResponsiveTokens(page, width >= 1024);
});

// D31 경계 — 1023은 1단(375 열), 1024부터 lg(1280 열). 미디어 쿼리가 64rem(=1024px)인지 확인한다
for (const width of [1023, 1024] as const) {
  const wide = width >= 1024;
  test(`반응형 토큰 경계(D31): ${width}px → ${wide ? "1280" : "375"} 열 값`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("./");
    expect(await page.evaluate(() => window.innerWidth)).toBe(width);
    await expectResponsiveTokens(page, wide);
  });
}

test("모션 줄이기(reduce)면 테마 잉크 전환이 0s다(DESIGN §6.3)", async ({
  page,
}) => {
  const durations = () =>
    page.evaluate(() =>
      getComputedStyle(document.body)
        .transitionDuration.split(",")
        .map((part) => part.trim()),
    );
  // 기본: body 배경·글자 전환은 --duration-base(DESIGN §6.1 고정 토큰)
  const base = fixed.get("--duration-base");
  if (!base?.endsWith("ms")) throw new Error(`--duration-base 값: ${base}`);
  const baseSeconds = `${Number.parseFloat(base) / 1000}s`;

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("./");
  expect(new Set(await durations())).toEqual(new Set([baseSeconds]));

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(new Set(await durations())).toEqual(new Set(["0s"]));
});

test("초기 스크립트는 <head> 안의 동기 인라인 스크립트다", async ({ page }) => {
  await page.goto("./");
  const info = await page.evaluate(() => {
    const script = [...document.head.querySelectorAll("script")].find((el) =>
      el.textContent?.includes("ed-theme"),
    );
    return script
      ? {
          inHead: script.parentElement === document.head,
          src: script.getAttribute("src"),
          async: script.async || script.defer,
        }
      : null;
  });
  expect(info).toEqual({ inHead: true, src: null, async: false });
});
