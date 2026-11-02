import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  SCHEMES,
  touchTargetFailures,
  waitForFonts,
  waitForHydration,
} from "./support";

// 이적 화면 견본 e2e (M4-04 — PRD FR-101 · FR-104 · FR-105 · FR-106) — SPECIMEN=1 빌드(out-specimen/) 전용. 견본은 합성 fixtures
// (fixtures/transfers/specimen.json — 단계별 · 결렬 · 공식 뒤 결렬 미반영 · 잠잠 · 행선지 미정 · 이름 표기 전 · Tier 1~3 · 한국 선수)를
// 실제 화면과 같은 컴포넌트에 싣는다(src/app/specimen/transfers/page.specimen.tsx). 규칙은 tests/transfers-view.test.ts ·
// tests/transfer-filter-dom.test.tsx.
const PATH = "specimen/transfers/";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** 한글 어절 중간 줄바꿈 — 글자 노드마다 줄이 바뀌는 자리가 공백 다음이 아닌 곳(한글 사이) */
async function midWordBreaks(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    const root = document.querySelector(sel);
    if (!root) return out;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? "";
      if (!/[가-힣]/.test(text)) continue;
      if ((n.parentElement?.getClientRects().length ?? 0) === 0) continue;
      let prevTop: number | null = null;
      for (let i = 0; i < text.length; i++) {
        range.setStart(n, i);
        range.setEnd(n, i + 1);
        const r = range.getClientRects()[0];
        if (!r) continue;
        if (prevTop !== null && r.top > prevTop + 2) {
          const before = text[i - 1] ?? "";
          if (/[가-힣]/.test(before) && /[가-힣]/.test(text[i]!))
            out.push(text.slice(Math.max(0, i - 6), i + 4));
        }
        prevTop = r.top;
      }
    }
    return out;
  }, scope);
}

for (const width of [375, 768, 1024, 1280] as const) {
  for (const scheme of SCHEMES) {
    test(`${width}px ${scheme} — 넘침 0 · axe 0 · 44px · 어절 중간 줄바꿈 0 · 잠잠 맨 아래`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      const response = await page.goto(PATH);
      expect(response?.status()).toBe(200);
      await waitForFonts(page);
      await waitForHydration(page);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      ).toBe(0);
      const rows = page.locator("[data-xf-row]");
      await expect(rows).toHaveCount(6);
      await expect(rows.last()).toHaveAttribute("data-quiet", "");
      // 1023 이하 접힌 필터 칩 묶음 · 모든 타임라인을 펼쳐 함께 본다
      const panelToggle = page
        .locator("[data-xf-panel-toggle]")
        .filter({ visible: true });
      if (await panelToggle.count()) await panelToggle.click();
      for (const b of await page
        .locator("[data-xt-toggle]")
        .filter({ visible: true })
        .all())
        await b.click();
      await expect(page.locator("[data-xt-panel]:not([hidden])")).toHaveCount(
        await page.locator("[data-xt-panel]").count(),
      );
      const { violations } = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .analyze();
      expect(violations.map((v) => `${v.id} ${v.nodes.length}`)).toEqual([]);
      expect(
        await touchTargetFailures(
          page,
          "main a, main button, nav[aria-label='이적 필터'] button:not(li button)",
        ),
      ).toEqual([]);
      // 목차 체크 목록 행은 위아래로 맞붙은 44px 상자 — 행 경계가 소수점 위치라 누름 판정 점(가운데 ±21.5px)이 옆 행(같은 필터 컨트롤)에
      // 잡힌다. 뉴스 필터 목차(tests/e2e-specimen/news-filter.spec.ts)와 같이 상자 높이 · 폭으로 본다
      expect(
        await page
          .locator("nav[aria-label='이적 필터'] li button")
          .evaluateAll((els) =>
            els
              .filter((el) => el.getClientRects().length > 0)
              .map((el) => el.getBoundingClientRect())
              .filter((r) => r.height < 44 || r.width < 44)
              .map((r) => `${r.width}×${r.height}`),
          ),
      ).toEqual([]);
      expect(await midWordBreaks(page, "main")).toEqual([]);
    });
  }
}

test("필터 — 칩 누름 → 주소 쿼리 · 결과 수, 0건 빈 상태 → 필터 해제, 쿼리로 새로 열어도 같은 결과", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(PATH);
  await waitForHydration(page);
  const shown = page.locator("[data-xf-shown]").filter({ visible: true });
  await page.locator('[data-xf-axis="kr"]').filter({ visible: true }).click();
  await expect(page).toHaveURL(/\?kr=1$/);
  await expect(shown).toHaveText("3");
  await page.locator("[data-xf-panel-toggle]").click();
  await expect(page.locator("#xf-panel")).toBeVisible();
  await page
    .locator('#xf-panel [data-xf-axis="status"][data-xf-value="official"]')
    .click();
  await expect(page).toHaveURL(/kr=1&status=official|status=official.*kr=1/);
  await expect(shown).toHaveText("0");
  await expect(page.locator("[data-xf-empty]")).toBeVisible();
  await page.locator('[data-xf-reset="empty"]').click();
  await expect(shown).toHaveText("6");
  await expect(page).toHaveURL(/specimen\/transfers\/$/);
  // 첫 페인트 전 부트 — 쿼리로 새로 연 화면
  await page.goto(`${PATH}?status=rumor&tier=3`);
  await expect(page.locator("[data-xf-row]:not([hidden])")).toHaveCount(3);
  for (const b of await page
    .locator('[data-xf-axis="tier"][data-xf-value="3"]')
    .all())
    await expect(b).toHaveAttribute("aria-pressed", "true");
});

test("타임라인 — 펼침 aria-expanded · 단계 근거 · 보조 · 단계 유지, 해시 도착(#xt-) = 펼침 + 도착 표시", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(PATH);
  await waitForHydration(page);
  const row = page.locator("#x-test-player-a--tottenham-hotspur");
  const toggle = row.locator("[data-xt-toggle]");
  const lead = page.locator("#x-test-player-a--tottenham-hotspur-lead-t");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(lead).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  // 펼치면 근거 줄을 숨긴다(첫 노드와 같은 기사 — 확정 혼합안 `.xr.is-open`, M4-16 후속) · 포커스는 버튼에 그대로 · 버튼은 오른쪽 끝
  await expect(lead).toBeHidden();
  await expect(toggle).toBeFocused();
  const ev = await toggle.evaluate((b) => {
    const box = b.parentElement!.getBoundingClientRect();
    return box.right - b.getBoundingClientRect().right;
  });
  expect(ev).toBeLessThanOrEqual(0.5);
  const items = row.locator("[data-xt-panel] ol > li");
  await expect(items).toHaveCount(6);
  await expect(row.locator("[data-xt-panel] ol")).toHaveAttribute(
    "aria-label",
    "기사 타임라인 — 최신순, 단계 근거 4건 · 보조 2건",
  );
  await expect(row.getByText("단계 유지")).toHaveCount(2); // 노드 1 + 범례 1
  // 다시 접으면 근거 줄이 돌아온다
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(lead).toBeVisible();
  await expect(toggle).toBeFocused();
  // 해시 도착 — 홈 핫 리스트 링크와 같은 형태
  const hot = page
    .locator('[data-specimen="hot-normal"] a[href*="#xt-"]')
    .first();
  const href = (await hot.getAttribute("href"))!;
  await page.goto(`${PATH}${href.slice(href.indexOf("#"))}`);
  const id = href.slice(href.indexOf("#") + 1);
  await expect(page.locator(`[id="${id}"]`)).toHaveAttribute(
    "data-xt-arrive",
    "",
  );
  await expect(page.locator(`[id="${id}"]`)).toBeInViewport();
  // 해시 도착으로 펼친 행도(첫 페인트 전 부트) 근거 줄은 숨김
  const arrived = page
    .locator(`[id="${id}"]`)
    .locator("xpath=ancestor::article[1]");
  await expect(arrived.locator("[data-xt-toggle]")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(arrived.locator('[id$="-lead-t"]')).toBeHidden();
});
