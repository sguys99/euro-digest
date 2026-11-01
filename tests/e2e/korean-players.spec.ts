import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { loadRosterView } from "../../src/lib/data/korean-players";

// 한국 선수 목록 `/korean-players/` (M3-09 — PRD FR-61·FR-64, DESIGN §9.3 D2 선수 명단 행). 빌드 결과(out/)를 대상으로 한다.
// 페이지 전체 axe·44px·포커스 링·제목 단계는 a11y.spec(전 페이지), 내부 링크 HTTP는 links.spec. 여기서는 명단 구성(데이터에서 계산한
// 기대 값)·폭별 열 구성(375 보기 탭 / 1024 이상 11열)·가로 넘침·숫자 서체·한글 줄바꿈을 본다.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const view = loadRosterView();

async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

/** 보이는 열 머리 글자 */
async function visibleHeads(page: Page): Promise<string[]> {
  return page
    .locator("#kp-list thead tr:last-child th")
    .evaluateAll((ths) =>
      ths
        .filter((th) => getComputedStyle(th).display !== "none")
        .map((th) => th.textContent?.trim() ?? ""),
    );
}

test.describe("한국 선수 목록 — 명단 구성", () => {
  test("h1 하나 · 리그 구간 순서와 인원 · 선수 행 수 = 설정 명단 수", async ({
    page,
  }) => {
    await page.goto("korean-players/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "한국 선수",
    );
    const groups = page.locator('#kp-list th[scope="rowgroup"]');
    await expect(groups).toHaveCount(view.groups.length);
    for (const [i, g] of view.groups.entries()) {
      await expect(groups.nth(i)).toContainText(g.label);
      await expect(groups.nth(i)).toContainText(`${g.rows.length}명`);
      await expect(groups.nth(i)).toHaveAttribute("id", g.anchor);
    }
    const total = view.groups.reduce((n, g) => n + g.rows.length, 0);
    await expect(page.locator('#kp-list th[scope="row"]')).toHaveCount(total);
    // 선수 이름은 상세(M3-10) 링크 — 선수마다 하나(내비 상단·하단 2곳은 목록 자신)
    await expect(
      page.locator('#kp-list a[href*="/korean-players/"]'),
    ).toHaveCount(total);
    // 출처 줄
    await expect(
      page.locator('[data-slot="data-source"][data-scope="korean-players"]'),
    ).toContainText("Football data provided by the Football-Data.org API");
  });

  test("숫자는 tabular-nums · 한글은 keep-all", async ({ page }) => {
    await page.goto("korean-players/");
    const styles = await page
      .locator("#kp-list tbody tr:not(:first-child) td:first-child span")
      .first()
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          numeric: s.fontVariantNumeric,
          wordBreak: getComputedStyle(document.body).wordBreak,
        };
      });
    expect(styles.numeric).toContain("tabular-nums");
    expect(styles.wordBreak).toBe("keep-all");
  });
});

// 375 보기 탭 — 키보드만으로(M3-14): Tab으로 선택된 탭에 들어가 ←→ Home End로 보기를 바꾼다(자동 활성화 — §9.2 Tabs),
// 포커스가 탭을 따라가고 표 열 묶음이 바뀐다. 탭 다음 Tab은 표 안 첫 선수 링크(탭 순서 = 시각 순서)
test("375 보기 탭 — ←→ Home End로 보기 전환 · 포커스 이동 · 다음 Tab은 명단 첫 선수", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "375 보기 탭은 모바일");
  await page.goto("korean-players/");
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  expect(await visibleHeads(page)).toContain("도움");
  await page.keyboard.press("End");
  await expect(tabs.nth(2)).toBeFocused();
  expect(await visibleHeads(page)).toContain("일시 · 상대");
  await page.keyboard.press("ArrowRight");
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tabs.nth(2)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(tabs.first()).toBeFocused();
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  expect(await visibleHeads(page)).toEqual(["분", "선수 · 소속", "결과"]);
  // 고른 탭 하나만 Tab 순서에 있다(roving tabindex) → 다음 Tab은 명단 첫 선수 이름
  await page.keyboard.press("Tab");
  const first = view.groups[0]?.rows[0];
  expect(first).toBeDefined();
  await expect(page.locator(":focus")).toContainText(first?.nameKo ?? "");
});

test.describe("한국 선수 목록 — 폭별 열 구성 · 가로 넘침", () => {
  for (const width of [375, 768, 1024, 1280]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${width}px ${colorScheme} — 가로 넘침 0 · 열 구성`, async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== "desktop", "폭은 테스트가 정한다");
        await page.setViewportSize({ width, height: 800 });
        await page.emulateMedia({ colorScheme });
        await page.goto("korean-players/");
        expect(await overflow(page)).toBe(0);
        const tabs = page.getByRole("tab");
        if (width >= 1024) {
          await expect(tabs).toHaveCount(0);
          // 1280 이상 11열 · 1024~1279는 UCL 열을 이름 아래 한 줄로(10열 — 지면 728~983px)
          expect(await visibleHeads(page)).toHaveLength(
            width >= 1280 ? 11 : 10,
          );
          return;
        }
        await expect(tabs).toHaveCount(3);
        expect(await visibleHeads(page)).toEqual(["분", "선수 · 소속", "결과"]);
        await tabs.nth(1).click();
        expect(await visibleHeads(page)).toEqual([
          "분",
          "선수 · 소속",
          "출전",
          "분",
          "골",
          "도움",
        ]);
        expect(await overflow(page)).toBe(0);
        await tabs.nth(2).click();
        expect(await visibleHeads(page)).toEqual([
          "분",
          "선수 · 소속",
          "일시 · 상대",
        ]);
        expect(await overflow(page)).toBe(0);
        // 숨은 보기 상태에서도 WCAG 위반 0
        const { violations } = await new AxeBuilder({ page })
          .withTags(WCAG_TAGS)
          .analyze();
        expect(violations.map((v) => v.id)).toEqual([]);
      });
    }
  }
});
