import { mkdirSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { SCHEMES, staticizeFixed, waitForFonts } from "./support";

// UCL 녹아웃 대진 견본 e2e (M2-12 — PRD FR-43, PRD §15 D63 ④) — SPECIMEN=1 빌드(out-specimen/) 전용.
// 견본(`/specimen/knockout/` 16강 진행 중 · `/specimen/knockout/final/` 결승 뒤 — src/app/specimen/knockout/)은 합성 fixture
// (`fixtures/competitions/ucl-knockout.json`)를 실제 대회 페이지와 같은 조립(`CompetitionScreen`)에 넣는다. 여기서는 단계 자동 전환(대진 탭이
// 기본)·axe·가로 넘침·44px를 보고, 375/1280 × 라이트/다크 전체 캡처를 docs/design/d1/screenshots/impl-ucl-*에 남긴다(시안 없는 화면 — 기록용).
// 실제 공개 빌드의 UCL 페이지(지금 리그 페이즈)는 일반 e2e(tests/e2e/competition.spec.ts).

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const SHOTS_DIR = path.resolve("docs/design/d1/screenshots");
const PAGES = [
  { path: "specimen/knockout/", shot: "impl-ucl-knockout", first: "16강" },
  { path: "specimen/knockout/final/", shot: "impl-ucl-final", first: "결승" },
] as const;

async function open(page: Page, route: string): Promise<void> {
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  await waitForFonts(page);
}

for (const width of [375, 1280] as const) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const spec of PAGES) {
      test(`${spec.path} — 대진 탭이 기본 · 최신 단계 먼저 · axe 0(라이트·다크) · 가로 넘침 0 · 44px`, async ({
        page,
      }) => {
        test.setTimeout(90_000);
        for (const colorScheme of SCHEMES) {
          await page.emulateMedia({ colorScheme });
          await open(page, spec.path);
          await expect(page.getByRole("tab", { name: "대진" })).toHaveAttribute(
            "aria-selected",
            "true",
          );
          await expect(
            page.locator("[data-slot=knockout] [data-stage] h2").first(),
          ).toHaveText(spec.first);
          const overflow = await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          );
          expect(overflow).toBe(0);
          const { violations } = await new AxeBuilder({ page })
            .withTags(WCAG_TAGS)
            .analyze();
          expect(
            violations.map((v) => `${v.id}: ${v.nodes.length}`),
            colorScheme,
          ).toEqual([]);
        }
        const small = await page.evaluate(() => {
          const els = document.querySelectorAll<HTMLElement>(
            'main a, main button, main [role="tab"]',
          );
          return [...els]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              if (r.width === 0 && r.height === 0) return false;
              if (el.closest("[data-view=news]")) return false;
              return r.height < 44 || r.width < 44;
            })
            .map(
              (el) => `${el.tagName} ${el.textContent?.trim().slice(0, 20)}`,
            );
        });
        expect(small).toEqual([]);
      });
    }

    test("리그 페이즈 순위표는 두 번째 탭으로 계속 본다", async ({ page }) => {
      await open(page, PAGES[0].path);
      await page.getByRole("tab", { name: "순위표" }).click();
      expect(
        await page.locator("table[data-slot=standings] tr[data-row]").count(),
      ).toBe(36);
    });

    for (const spec of PAGES) {
      for (const colorScheme of SCHEMES) {
        test(`캡처 ${spec.shot}-${width}-${colorScheme}`, async ({
          browser,
          baseURL,
        }) => {
          const context = await browser.newContext({
            baseURL,
            viewport: { width, height: 900 },
            deviceScaleFactor: 1,
            colorScheme,
            reducedMotion: "reduce",
          });
          const page = await context.newPage();
          await open(page, spec.path);
          await page.waitForTimeout(300);
          await staticizeFixed(page);
          mkdirSync(SHOTS_DIR, { recursive: true });
          await page.screenshot({
            path: path.join(
              SHOTS_DIR,
              `${spec.shot}-${width}-${colorScheme}.png`,
            ),
            fullPage: true,
          });
          await context.close();
        });
      }
    }
  });
}
