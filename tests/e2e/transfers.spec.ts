import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { loadTransfersView } from "../../src/lib/data/transfers";
import { blockWebFonts } from "./support/site";

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
    // 펼친 행은 근거 줄을 숨긴다(첫 노드와 같은 기사 — 확정 혼합안, M4-16 후속)
    const row = target.locator("xpath=ancestor::article[1]");
    if ((await row.locator("[data-xt-toggle]").count()) > 0)
      await expect(row.locator('[id$="-lead-t"]')).toBeHidden();
  });

  test("타임라인 펼침 — 근거 줄 숨김 · 접으면 다시 · 포커스 유지 · 이동 0(아래 행만 밀림)", async ({
    page,
  }) => {
    const row = rows.find((r) => r.timeline.length > 1);
    test.skip(!row, "타임라인이 있는 행이 없다");
    await page.goto("transfers/");
    const article = page.locator(`[id="${row!.anchor}"]`);
    const toggle = article.locator("[data-xt-toggle]");
    const lead = article.locator('[id$="-lead-t"]');
    await expect(lead).toBeVisible();
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(lead).toBeHidden();
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(lead).toBeVisible();
    await expect(toggle).toBeFocused();
  });

  test("첫 로드 CLS — 쿼리 · 해시 도착(부트로 펼친 행)", async ({ page }) => {
    const row = rows.find((r) => r.timeline.length > 1 && r.lead);
    test.skip(!row, "타임라인이 있는 행이 없다");
    // 단계 근거 노드만 id가 있다(보조 노드는 없음) — 가장 오래된 근거
    const node = row!.timeline.filter((n) => n.kind === "stage").at(-1)!.card
      .id;
    // 웹폰트 교체 이동은 fonts.spec.ts가 본다 — 여기서는 쿼리 · 해시 부트(행 펼침) 자체의 이동만
    await blockWebFonts(page);
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[])
          if (!e.hadRecentInput)
            (window as unknown as { __cls: number }).__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(`transfers/#xt-${node}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const article = page.locator(`[id="${row!.anchor}"]`);
    await expect(article.locator("[data-xt-toggle]")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(article.locator('[id$="-lead-t"]')).toBeHidden();
    expect(
      await page.evaluate(() => (window as unknown as { __cls: number }).__cls),
    ).toBeLessThan(0.05);
  });
});
