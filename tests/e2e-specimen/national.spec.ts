import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  SCHEMES,
  staticizeFixed,
  touchTargetFailures,
  waitForFonts,
} from "./support";

// 홈 A매치 섹션 견본 e2e (M3-13 — PRD FR-71) — SPECIMEN=1 빌드(out-specimen/) 전용. 견본은 실제 설정(configs/national-team.json)으로
// 시각을 주입해 같은 컴포넌트(`NationalHome`)를 싣는다(src/app/specimen/national/page.specimen.tsx) — 공개 빌드 날짜가 기간 밖이어도
// 기간 안 모양을 결정적으로 본다. 판정 규칙은 tests/national-team-page.test.tsx.
const PATH = "specimen/national/";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const SHOTS = process.env.SPECIMEN_SHOTS;

for (const width of [375, 1024, 1280] as const) {
  for (const scheme of SCHEMES) {
    test(`${width}px ${scheme} — 넘침 0 · axe 0 · 44px · 상태별 행`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      const response = await page.goto(PATH);
      expect(response?.status()).toBe(200);
      await waitForFonts(page);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      ).toBe(0);
      const first = page.locator(
        '[data-specimen="national-1112"] [data-slot="home-national"]',
      );
      await expect(first.locator('[data-slot="national-match"]')).toHaveCount(
        2,
      );
      await expect(
        first.locator('[data-slot="national-match"][data-state="scheduled"]'),
      ).toHaveCount(2);
      await expect(
        first.locator('[data-slot="home-national-squad"] a'),
      ).toHaveCount(7);
      await expect(
        page.locator('[data-specimen="national-1118"] [data-state="pending"]'),
      ).toHaveCount(2);
      await expect(
        page.locator(
          '[data-specimen="national-1007"] [data-slot="result-value"]',
        ),
      ).toHaveCount(4);
      const { violations } = await new AxeBuilder({ page })
        .include('[data-specimen^="national-"]')
        .withTags(WCAG_TAGS)
        .analyze();
      expect(violations.map((v) => v.id)).toEqual([]);
      expect(
        await touchTargetFailures(page, '[data-specimen^="national-"] a'),
      ).toEqual([]);
      if (SHOTS && (width === 375 || width === 1280)) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await staticizeFixed(page);
        await page.screenshot({
          path: `${SHOTS}/specimen-home-national-${width}-${scheme}.png`,
          fullPage: true,
        });
      }
    });
  }
}
