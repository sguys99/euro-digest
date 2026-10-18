import { mkdirSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { THEME_COLOR } from "../../src/lib/theme";
import {
  effectiveThemeColor,
  forcePseudoStates,
  markThemeColorMetas,
  sameThemeColorMetas,
  SCHEMES,
  SCREENSHOT_WIDTHS,
  SPECIMEN_PATH,
  staticizeFixed,
  touchTargetFailures,
  VIEWPORTS,
  waitForFonts,
  waitForHydration,
} from "./support";

// 기초 컴포넌트 견본 e2e (D0-12, DESIGN.md §9·§10) — SPECIMEN=1 빌드(out-specimen/) 전용.
// 견본 페이지: src/app/specimen/page.specimen.tsx. 기준: 혼합안 "기초 컴포넌트 6종 × 상태" 매트릭스.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
/** 견본 매트릭스 행(혼합안과 같은 13행) */
const MATRIX_ROWS = [
  "Chip · 분류",
  "Chip · 한국 선수만",
  "Chip · 대회(목차 행)",
  "Card",
  "Button · 주",
  "Button · 보조 / 텍스트",
  "Button · 아이콘",
  "Tabs · 하단 탭",
  "Tabs · 상단 내비",
  "Tabs · 대회 탭",
  "Tabs · 피드 머리 색 면",
  "Skeleton",
  "Toast",
];
/** 스크린샷 저장 폴더(기본 test-results/specimen-shots — 문서용 PNG는 여기서 최적화해 옮긴다) */
const SHOTS_DIR = path.resolve(
  process.env.SPECIMEN_SHOTS_DIR ?? "test-results/specimen-shots",
);

async function openSpecimen(page: Page): Promise<void> {
  const response = await page.goto(SPECIMEN_PATH);
  expect(response?.status()).toBe(200);
  await waitForFonts(page);
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ viewport });

    test("매트릭스 13행이 혼합안과 같은 순서로 있고, 콘솔 오류·가로 넘침이 없다", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(e.message));
      await openSpecimen(page);
      await expect(page.locator("[data-specimen-row]")).toHaveCount(
        MATRIX_ROWS.length,
      );
      expect(
        await page
          .locator("[data-specimen-row]")
          .evaluateAll((rows) =>
            rows.map((r) => r.getAttribute("data-specimen-row")),
          ),
      ).toEqual(MATRIX_ROWS);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });

    for (const colorScheme of SCHEMES) {
      test(`axe WCAG 2.1 A/AA 위반 0 (${colorScheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await openSpecimen(page);
        const { violations } = await new AxeBuilder({ page })
          .withTags(WCAG_TAGS)
          .analyze();
        expect(
          violations.map(
            (v) =>
              `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
          ),
        ).toEqual([]);
      });

      test(`키보드 포커스 링: 3px 실선 --ring, 둘레와 3:1 이상 (${colorScheme})`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await openSpecimen(page);
        let count = 0;
        const problems: string[] = [];
        // 첫 Tab은 문서 처음에서 시작한다. 같은 요소로 돌아오면(끝) 멈춘다
        for (let i = 0; i < 400; i++) {
          await page.keyboard.press("Tab");
          const info = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body) return null;
            // 한 바퀴 돌아 처음 요소로 오면 끝 — 이미 본 요소는 페이지 쪽 WeakSet으로 가린다
            const w = window as unknown as { __focusSeen?: WeakSet<Element> };
            w.__focusSeen ??= new WeakSet();
            const repeat = w.__focusSeen.has(el);
            w.__focusSeen.add(el);
            const parse = (c: string): [number, number, number, number] => {
              const m = /rgba?\(([^)]+)\)/.exec(c);
              const parts = (m?.[1] ?? "0,0,0,0")
                .split(/[,\s/]+/)
                .filter(Boolean)
                .map(Number);
              return [
                parts[0] ?? 0,
                parts[1] ?? 0,
                parts[2] ?? 0,
                parts[3] ?? 1,
              ];
            };
            const lum = ([r, g, b]: number[]) => {
              const f = (v: number) => {
                const s = v / 255;
                return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
              };
              return (
                0.2126 * f(r ?? 0) + 0.7152 * f(g ?? 0) + 0.0722 * f(b ?? 0)
              );
            };
            const contrast = (a: number[], b: number[]) => {
              const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
              return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
            };
            // 링은 요소 바깥(2px 띄움)에 그려진다 → 부모 쪽에서 처음 만나는 불투명 배경
            let bgEl: Element | null = el.parentElement;
            let bg = parse(getComputedStyle(document.body).backgroundColor);
            while (bgEl) {
              const c = parse(getComputedStyle(bgEl).backgroundColor);
              if (c[3] > 0) {
                bg = c;
                break;
              }
              bgEl = bgEl.parentElement;
            }
            const style = getComputedStyle(el);
            const ring = style.getPropertyValue("--ring").trim();
            const probe = document.createElement("i");
            probe.style.color = ring;
            document.body.appendChild(probe);
            const ringRgb = getComputedStyle(probe).color;
            probe.remove();
            const name =
              el.getAttribute("aria-label") ??
              el.textContent?.trim().slice(0, 24) ??
              el.tagName;
            return {
              repeat,
              name: `${el.tagName.toLowerCase()} "${name}"`,
              focusVisible: el.matches(":focus-visible"),
              outlineStyle: style.outlineStyle,
              outlineWidth: style.outlineWidth,
              outlineColor: style.outlineColor,
              ringRgb,
              ratio: contrast(parse(style.outlineColor), bg),
            };
          });
          if (!info) continue;
          if (info.repeat) break;
          count += 1;
          if (
            !info.focusVisible ||
            info.outlineStyle !== "solid" ||
            info.outlineWidth !== "3px" ||
            info.outlineColor !== info.ringRgb ||
            info.ratio < 3
          ) {
            problems.push(
              `${info.name}: ${info.outlineStyle} ${info.outlineWidth} ${info.outlineColor}(--ring ${info.ringRgb}) 대비 ${info.ratio.toFixed(2)}`,
            );
          }
        }
        expect(count).toBeGreaterThan(60);
        expect(problems).toEqual([]);
      });
    }

    test("터치 타깃: 모든 버튼·링크·탭은 가로·세로 44px 안을 눌러도 그 요소다", async ({
      page,
    }) => {
      await openSpecimen(page);
      const failures = await touchTargetFailures(
        page,
        'main button, main a[href], main [role="tab"], main [role="switch"]',
      );
      expect(failures).toEqual([]);
    });

    // 스크린샷은 문서 기준 이미지(DESIGN §0.1 impl-components-*)가 있는 375·1280만 — 1024는 위 검사만 한다
    for (const colorScheme of SCREENSHOT_WIDTHS.has(viewport.width)
      ? SCHEMES
      : []) {
      test(`스크린샷: 전체 페이지(강제 상태·D0-04 조건) 저장 (${colorScheme})`, async ({
        browser,
        baseURL,
      }) => {
        // D0-04 조건: deviceScaleFactor 1, 모션 줄이기, localStorage 비움(새 컨텍스트 = 시스템 테마), 웹폰트 로드 후
        const context = await browser.newContext({
          baseURL,
          viewport,
          deviceScaleFactor: 1,
          colorScheme,
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        await openSpecimen(page);
        await page.waitForTimeout(300);
        const { count } = await forcePseudoStates(page);
        expect(count).toBeGreaterThan(20);
        await staticizeFixed(page);
        mkdirSync(SHOTS_DIR, { recursive: true });
        await page.screenshot({
          path: path.join(
            SHOTS_DIR,
            `impl-components-${viewport.width}-${colorScheme}.png`,
          ),
          fullPage: true,
        });
        await context.close();
      });
    }
  });
}

test.describe("강제 상태(캡처 조건)가 실제 컴포넌트 CSS에 걸린다", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("hover·focus-visible·:target", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await openSpecimen(page);
    const before = await page.evaluate(() => {
      const hover = document.querySelector<HTMLElement>(
        'button[data-force="hover"]:not([aria-pressed])',
      );
      return hover ? getComputedStyle(hover).backgroundColor : null;
    });
    await forcePseudoStates(page);
    const after = await page.evaluate(() => {
      const css = (sel: string) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) throw new Error(`없음: ${sel}`);
        return getComputedStyle(el);
      };
      return {
        hoverBg: css('button[data-force="hover"]:not([aria-pressed])')
          .backgroundColor,
        brand: getComputedStyle(document.documentElement)
          .getPropertyValue("--brand-accent")
          .trim(),
        focusOutline: css('button[data-force="focus-visible"]').outlineWidth,
        targetShadow: css('article[data-force="target"]').boxShadow,
      };
    });
    // 주 버튼 hover = 레드 면(DESIGN §9.2)
    expect(after.hoverBg).not.toBe(before);
    expect(after.brand.toUpperCase()).toBe("#B32F25");
    expect(after.hoverBg).toBe("rgb(179, 47, 37)");
    expect(after.focusOutline).toBe("3px");
    expect(after.targetShadow).toContain("inset");
  });
});

test.describe("동작", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("토스트: aria-live 영역 하나, 띄우면 읽고 2.4초 뒤 사라진다 · 올려 두면 멈춘다", async ({
    page,
  }) => {
    await openSpecimen(page);
    const region = page.locator('[aria-live="polite"]');
    await expect(region).toHaveCount(1);
    await expect(region).toHaveAttribute("aria-atomic", "true");

    await page.locator('[data-toast-trigger="share"]').click();
    await expect(region).toContainText("링크를 복사했어요");
    await expect(region).toContainText("공유");
    await expect(region).toHaveText("", { timeout: 4_000 });

    // 포인터가 올라가 있으면 멈춘다(WCAG 2.2.1)
    await page.locator('[data-toast-trigger="share"]').click();
    await region.getByText("링크를 복사했어요").hover();
    await page.waitForTimeout(3_000);
    await expect(region).toContainText("링크를 복사했어요");
    await page.mouse.move(5, 5);
    await expect(region).toHaveText("", { timeout: 4_000 });
  });

  test("토스트 액션은 실행하고 닫히며, 닫기 버튼(44px)으로 닫는다", async ({
    page,
  }) => {
    await openSpecimen(page);
    const region = page.locator('[aria-live="polite"]');
    await page.locator('[data-toast-trigger="news"]').click();
    await region.getByRole("button", { name: "새로고침" }).click();
    await expect(region).toContainText("견본이라 새로고침하지 않아요");

    await page.locator('[data-toast-trigger="dismissible"]').click();
    const close = region.getByRole("button", { name: "알림 닫기" });
    const box = await close.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(region).toHaveText("");
  });

  test("토스트를 키보드로 닫으면(닫기·액션) 포커스가 토스트에 들어오기 전 요소로 돌아간다 — body로 떨어지지 않는다", async ({
    page,
  }) => {
    await openSpecimen(page);
    await waitForHydration(page);
    const region = page.locator('[aria-live="polite"]');

    const trigger = page.locator('[data-toast-trigger="dismissible"]');
    await trigger.focus();
    await page.keyboard.press("Enter");
    const close = region.getByRole("button", { name: "알림 닫기" });
    await expect(close).toBeVisible();
    await close.focus(); // Tab으로 토스트에 들어온 상태(이전 포커스 = 트리거)
    await page.keyboard.press("Enter");
    await expect(region).toHaveText("");
    await expect(trigger).toBeFocused();

    // 액션 — 먼저 닫고 실행해 액션이 띄운 토스트가 남아도, 포커스는 트리거로
    const news = page.locator('[data-toast-trigger="news"]');
    await news.focus();
    await page.keyboard.press("Enter");
    const action = region.getByRole("button", { name: "새로고침" });
    await expect(action).toBeVisible();
    await action.focus();
    await page.keyboard.press("Space");
    await expect(region).toContainText("견본이라 새로고침하지 않아요");
    await expect(news).toBeFocused();
  });

  test("모션: 기본이면 토스트 배출 200ms·칩 전환 150ms, 모션 줄이기면 0", async ({
    page,
  }) => {
    const measure = async () => {
      await page.locator('[data-toast-trigger="share"]').click();
      const toastEl = page
        .locator('[aria-live="polite"] > div')
        .filter({ hasText: "링크를 복사했어요" });
      await expect(toastEl).toBeVisible();
      return page.evaluate(() => {
        const t = document.querySelector('[aria-live="polite"] > div');
        const chip = document.querySelector("button[aria-pressed]");
        if (!t || !chip) throw new Error("토스트·칩 없음");
        return {
          name: getComputedStyle(t).animationName,
          duration: getComputedStyle(t).animationDuration,
          chip: getComputedStyle(chip).transitionDuration,
        };
      });
    };
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openSpecimen(page);
    expect(await measure()).toEqual({
      name: "eject",
      duration: "0.2s",
      chip: "0.15s",
    });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await openSpecimen(page);
    expect(await measure()).toEqual({
      name: "eject",
      duration: "0s",
      chip: "0s",
    });
  });

  test("필터 칩: 누르면 aria-pressed가 바뀌고 ✓가 보인다", async ({ page }) => {
    await openSpecimen(page);
    const group = page.getByRole("group", { name: "분류 필터 견본" });
    const chip = group.getByRole("button", { name: /이적/ });
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(chip.getByText("✓")).toBeVisible();
  });

  test("대회 탭: ←/→/Home/End로 옮기면 바로 선택되고 패널이 바뀐다(roving tabindex)", async ({
    page,
  }) => {
    await openSpecimen(page);
    const list = page.getByRole("tablist", {
      name: "순위 미니 대회 탭 견본(동작)",
    });
    const tabs = list.getByRole("tab");
    await expect(tabs).toHaveCount(3);
    const first = tabs.nth(0);
    await first.focus();
    await expect(first).toHaveAttribute("aria-selected", "true");
    await expect(first).toHaveAttribute("tabindex", "0");
    await expect(tabs.nth(1)).toHaveAttribute("tabindex", "-1");

    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    const panelId = await tabs.nth(1).getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    await expect(page.locator(`[id="${panelId}"]`)).toBeVisible();
    await expect(page.locator(`[id="${panelId}"]`)).toContainText("라리가");

    await page.keyboard.press("End");
    await expect(tabs.nth(2)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(tabs.nth(2)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(tabs.nth(0)).toBeFocused();
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  });

  test("테마 토글: 시스템 → 라이트 → 다크 → 시스템, 저장·theme-color·토스트까지", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openSpecimen(page);
    const toggle = page.getByRole("button", { name: /^테마: / });
    const region = page.locator('[aria-live="polite"]');
    const state = () =>
      page.evaluate(() => ({
        theme: document.documentElement.getAttribute("data-theme"),
        stored: localStorage.getItem("ed-theme"),
      }));

    await expect(toggle).toHaveAccessibleName(
      "테마: 시스템 설정 (눌러서 바꾸기)",
    );
    await waitForHydration(page);
    expect(await effectiveThemeColor(page)).toBe(THEME_COLOR.light);

    await toggle.click();
    await expect(toggle).toHaveAccessibleName("테마: 라이트 (눌러서 바꾸기)");
    expect(await state()).toEqual({ theme: "light", stored: "light" });
    expect(await effectiveThemeColor(page)).toBe(THEME_COLOR.light);
    await expect(region).toContainText("테마: 라이트");

    await toggle.click();
    await expect(toggle).toHaveAccessibleName("테마: 다크 (눌러서 바꾸기)");
    expect(await state()).toEqual({ theme: "dark", stored: "dark" });
    // 시스템은 라이트지만 브라우저 UI 색도 다크 지면
    expect(await effectiveThemeColor(page)).toBe(THEME_COLOR.dark);

    // 다시 열어도(초기 스크립트) 첫 페인트부터 다크 지면 색 — 하이드레이션(토글 라벨이 "다크"로 바뀜) 뒤에도 그대로
    await page.reload();
    expect(await effectiveThemeColor(page)).toBe(THEME_COLOR.dark);
    await expect(toggle).toHaveAccessibleName("테마: 다크 (눌러서 바꾸기)");
    expect(await effectiveThemeColor(page)).toBe(THEME_COLOR.dark);

    await toggle.click();
    await expect(toggle).toHaveAccessibleName(
      "테마: 시스템 설정 (눌러서 바꾸기)",
    );
    expect(await state()).toEqual({ theme: null, stored: null });
    expect(await effectiveThemeColor(page)).toBe(THEME_COLOR.light);
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await effectiveThemeColor(page)).toBe(THEME_COLOR.dark);
  });

  test("저장 다크 + 시스템 라이트: 견본 → 홈(next/link 클라이언트 이동) → 뒤로 가기에도 theme-color는 다크 지면(D0-12 리뷰)", async ({
    page,
  }) => {
    // 회귀: Next viewport.themeColor 메타는 클라이언트 이동마다 새 노드로 바뀌어 초기 스크립트·토글이 고친 media가
    // 시스템 기준으로 풀렸다. 지금은 루트 레이아웃 <head>가 메타를 렌더해 노드가 그대로 남는다(THEME_COLOR_METAS).
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(() => {
      // 문서를 새로 받을 때마다 실행된다(뒤로 가기로 다시 받아도 같은 저장값)
      localStorage.setItem("ed-theme", "dark");
    });
    const documents: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "document") documents.push(request.url());
    });
    await openSpecimen(page);
    const toggle = page.getByRole("button", { name: /^테마: / });
    expect(await effectiveThemeColor(page)).toBe(THEME_COLOR.dark);
    // 하이드레이션 완료 신호: 토글 라벨이 서버 렌더("시스템 설정")에서 저장값("다크")으로 바뀐다
    await expect(toggle).toHaveAccessibleName("테마: 다크 (눌러서 바꾸기)");
    await waitForHydration(page);
    expect(await effectiveThemeColor(page)).toBe(THEME_COLOR.dark);
    const metasBefore = await markThemeColorMetas(page);
    expect(metasBefore).toBe(2);

    // 하단 탭 '홈'(next/link) — 문서를 다시 받지 않는 클라이언트 이동
    documents.length = 0;
    await page
      .getByRole("navigation", { name: "하단 탭 견본 기본" })
      .getByRole("link", { name: "홈" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "유로 다이제스트" }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(documents).toEqual([]);
    expect(await sameThemeColorMetas(page)).toBe(true);
    expect(await effectiveThemeColor(page)).toBe(THEME_COLOR.dark);

    // 뒤로 가기 — 견본으로 돌아와도 다크 지면, 토글도 그대로 동작한다
    await page.goBack();
    await expect(toggle).toHaveAccessibleName("테마: 다크 (눌러서 바꾸기)");
    await page.waitForLoadState("networkidle");
    expect(await effectiveThemeColor(page)).toBe(THEME_COLOR.dark);
    await toggle.click();
    await expect(toggle).toHaveAccessibleName(
      "테마: 시스템 설정 (눌러서 바꾸기)",
    );
    expect(await effectiveThemeColor(page)).toBe(THEME_COLOR.light);
  });

  test("테마 토글: localStorage가 막혀도 오류 없이 이번 방문에는 바뀐다", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("차단", "SecurityError");
        },
      });
    });
    await openSpecimen(page);
    const toggle = page.getByRole("button", { name: /^테마: / });
    await toggle.click();
    await expect(toggle).toHaveAccessibleName("테마: 라이트 (눌러서 바꾸기)");
    expect(
      await page.evaluate(() =>
        document.documentElement.getAttribute("data-theme"),
      ),
    ).toBe("light");
    expect(errors).toEqual([]);
  });
});
