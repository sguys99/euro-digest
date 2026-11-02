import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { loadTransfersView } from "../../src/lib/data/transfers";

// `/transfers/`(M4-04 — PRD FR-101 · FR-104 · FR-105). 빌드 결과(out/) 대상 — 저장소 data/transfers.json 그대로라 구조만 본다.
// 여러 상태(단계별 · 잠잠 · 행선지 미정 · Tier 1~3)의 모양은 견본 빌드 e2e(tests/e2e-specimen/transfers.spec.ts)가 본다.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const view = loadTransfersView();
const rows = view?.rows ?? [];

test.describe("/transfers/", () => {
  for (const width of [375, 768, 1024, 1280]) {
    test(`${width}px — h1 · 행 수 = 원장 · 넘침 0 · axe 0`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "폭은 테스트가 정한다");
      await page.setViewportSize({ width, height: 800 });
      await page.goto("transfers/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("이적");
      await expect(page.locator("[data-xf-row]")).toHaveCount(rows.length);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      ).toBe(0);
      const { violations } = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .analyze();
      expect(violations.map((v) => v.id)).toEqual([]);
    });
  }

  test("홈 핫 리스트 → 이적 타임라인 도착(앱 라우터 이동 — 접힌 타임라인 펼침)", async ({
    page,
  }) => {
    test.skip(rows.length === 0, "원장이 비었다");
    await page.goto("./");
    const link = page
      .locator('[data-slot="transfer-hot"] a[href*="#xt-"]')
      .filter({ visible: true })
      .first();
    const href = (await link.getAttribute("href"))!;
    await link.click();
    await page.waitForURL(/\/transfers\/#xt-/);
    const id = href.slice(href.indexOf("#") + 1);
    const target = page.locator(`[id="${id}"]`);
    await expect(target).toHaveAttribute("data-xt-arrive", "");
    await expect(target).toBeVisible();
    await expect(target).toBeInViewport();
  });
});
