import { expect, test, type Page } from "@playwright/test";

import {
  listWeeklyWeeks,
  loadWeeklyReport,
} from "../../src/lib/data/weekly-report";
import { formatUtcDayShort } from "../../src/lib/time";

// 한국 선수 주간 리포트 `/korean-players/weekly/` · `/korean-players/weekly/{주차}/` (M3-12 — PRD FR-90~93, DESIGN §9.3 D2 주간 지면).
// 빌드 결과(out/)를 대상으로 한다. 페이지 전체 axe·44px·포커스 링·제목 단계는 a11y.spec(전 페이지), 내부 링크는 links.spec.
// 여기서는 구성(데이터에서 계산한 기대 값) · DOM 순서 · 폭별 넘침 · 숫자 서체 · 한글 줄바꿈을 본다.
const weeks = listWeeklyWeeks();
const latest = weeks.at(-1);

async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

test.describe("주간 리포트 색인", () => {
  test("h1 · 주마다 한 줄(최신 먼저) 또는 빈 상태", async ({ page }) => {
    await page.goto("korean-players/weekly/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "주간 리포트",
    );
    if (weeks.length === 0) {
      await expect(page.locator('[data-slot="weekly-empty"]')).toBeVisible();
      return;
    }
    const rows = page.locator('[data-slot="weekly-archive"] li a');
    await expect(rows).toHaveCount(weeks.length);
    await expect(rows.first()).toHaveAttribute(
      "href",
      new RegExp(`/korean-players/weekly/${latest}/$`),
    );
    await expect(rows.first()).toContainText("경기일 기준");
  });

  test("목록 화면에서 들어온다 — 375 머리 링크 · 1280 목차 행", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("korean-players/");
    await expect(
      page.locator('[data-slot="korean-players-weekly-link"]'),
    ).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(
      page.locator('[data-slot="roster-weekly-link"] a'),
    ).toBeVisible();
  });
});

test.describe("주간 리포트 한 주", () => {
  test.skip(!latest, "발행된 주 없음");
  const report = latest ? loadWeeklyReport(latest) : null;
  const path = `korean-players/weekly/${latest}/`;

  test("구성 — MVP h1 · DOM 순서(머리 → 점수 → 총평 → 표 → 다음 순위) · 표 행 = 리포트 행", async ({
    page,
  }) => {
    await page.goto(path);
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveCount(1);
    const order = await page
      .locator(
        '[data-slot="weekly-head"], [data-slot="weekly-score"], [data-slot="weekly-summary"], [data-slot="weekly-box"], [data-slot="weekly-runners-up"]',
      )
      .evaluateAll((els) =>
        els.map((e) => e.getAttribute("data-slot")?.replace("weekly-", "")),
      );
    const expected = report?.mvp
      ? ["head", "score", "summary", "box"]
      : ["head", "summary", "box"];
    expect(order.slice(0, expected.length)).toEqual(expected);
    await expect(
      page.locator('[data-slot="weekly-box"] tbody th[scope="row"]'),
    ).toHaveCount(report?.rows.length ?? 0);
    // AI 라벨은 LLM 총평일 때만 단 머리에 한 번(D64 ⑥)
    await expect(
      page.locator('[data-slot="weekly-summary"] [data-slot="ai-label"]'),
    ).toHaveCount(report?.summaryAi ? 1 : 0);
  });

  for (const width of [375, 768, 1024, 1280]) {
    test(`가로 넘침 없음 — ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      // 큰 이름이 지면 밖으로 나가지 않는다(공동 MVP 포함 — D65 ②)
      const box = await page.getByRole("heading", { level: 1 }).boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
    });
  }

  test("경기 줄 날짜 = 경기일(UTC 날짜, 시각 없음 — D2 §8 #31) · 표 머리에 '경기일 기준' 한 번(1280)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(path);
    const box = page.locator('[data-slot="weekly-box"]');
    const kickoffs = (report?.rows ?? []).flatMap((r) =>
      (r.matches ?? []).map((m) => m.kickoff),
    );
    const times = box.locator("tbody time");
    await expect(times).toHaveText(kickoffs.map((k) => formatUtcDayShort(k)));
    await expect(box.locator("thead")).toContainText("경기일 기준");
    expect(
      (await box.locator("thead").innerText()).split("경기일 기준").length - 1,
    ).toBe(1);
  });

  test("숫자는 tabular-nums · 총평은 keep-all", async ({ page }) => {
    await page.goto(path);
    const nums = await page
      .locator('[data-slot="weekly-box"] td')
      .evaluateAll((tds) =>
        tds.map((td) => getComputedStyle(td).fontVariantNumeric),
      );
    expect(nums.length).toBeGreaterThan(0);
    for (const v of nums) expect(v).toContain("tabular-nums");
    const wb = await page
      .locator('[data-slot="weekly-summary"] p')
      .last()
      .evaluate((p) => getComputedStyle(p).wordBreak);
    expect(wb).toBe("keep-all");
  });
});
