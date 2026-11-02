import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// 첫 방문 온보딩(M4-09 — PRD FR-113 · §15 D64 ⑥ · D67 ②, DESIGN §9.3 D2 "온보딩"). 빌드 결과(out/) 대상 — 온보딩 자료는 build-feeds가 쓴
// `/my/data/onboarding.json`. 기록 키 `ed-onboarding`(done · skipped), 팔로우 `ed-follow`.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const FOLLOW = "ed-follow";
const MARK = "ed-onboarding";
const ENTRY = '[data-slot="onboarding"]';

async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

/** 온보딩 자리만 검사(홈 전체 axe는 a11y.spec — 홈 DOM이 커서 단계마다 전체를 돌리면 느리다) */
async function axe(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .include(ENTRY)
    .withTags(WCAG_TAGS)
    .analyze();
  return violations.map((v) => v.id);
}

/** 온보딩 안 누를 수 있는 것 중 44px 미만(행 전체 label · 버튼 · 링크) */
async function smallTargets(page: Page) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [];
    return [...root.querySelectorAll<HTMLElement>("a, button, label")]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const after = getComputedStyle(el, "::after");
        const h = Math.max(r.height, parseFloat(after.height) || 0);
        return { text: el.textContent?.trim().slice(0, 30), h, w: r.width };
      })
      .filter((x) => x.h < 44 || x.w < 44);
  }, ENTRY);
}

/** 페이지를 연 뒤 500ms까지 쌓인 레이아웃 이동(입력 직후 제외) */
async function cls(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let sum = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as unknown as Array<{
            value: number;
            hadRecentInput: boolean;
          }>)
            if (!e.hadRecentInput) sum += e.value;
        }).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => resolve(sum), 500);
      }),
  );
}

async function stored(page: Page) {
  return page.evaluate(
    ([f, m]) => ({
      follow: JSON.parse(localStorage.getItem(f) ?? "null") as unknown,
      mark: localStorage.getItem(m),
    }),
    [FOLLOW, MARK] as const,
  );
}

test.describe("표시 조건", () => {
  test("첫 방문 → 5줄 바로 아래 진입 줄 · 내 팀 소식은 숨김", async ({
    page,
  }) => {
    await page.goto("./");
    const entry = page.locator(ENTRY);
    await expect(entry).toBeVisible();
    await expect(entry).toContainText("내 명단 만들기");
    await expect(page.locator('[data-slot="my-news"]')).toBeHidden();
    // 5줄 바로 다음 요소(자리 순서 — D64 ⑥)
    const order = await page.evaluate(() => {
      const brief = document.querySelector('[data-slot="today-brief"]');
      const entry = document.getElementById("ob-entry");
      if (!brief || !entry) return null;
      return Boolean(
        brief.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
    expect(order).not.toBe(false);
  });

  test("팔로우가 있는 사용자는 숨김(첫 페인트부터)", async ({ page }) => {
    await page.addInitScript((k) => {
      localStorage.setItem(
        k,
        JSON.stringify({ v: 1, teams: ["arsenal"], players: [] }),
      );
    }, FOLLOW);
    await page.goto("./");
    await expect(page.locator(ENTRY)).toBeHidden();
    expect(await page.locator(ENTRY).getAttribute("hidden")).toBe("");
  });

  test("진입 줄 '건너뛰기' → 재방문 숨김 · 팔로우가 다시 0이어도 숨김", async ({
    page,
  }) => {
    await page.goto("./");
    await page
      .getByRole("button", { name: /^건너뛰기 — 내 명단 만들기 닫기/ })
      .click();
    await expect(page.locator(ENTRY)).toBeHidden();
    expect((await stored(page)).mark).toBe("skipped");
    await page.reload();
    await expect(page.locator(ENTRY)).toBeHidden();
    // 팀을 팔로우했다가 풀어도(팔로우 0) 다시 띄우지 않는다
    await page.evaluate((k) => {
      localStorage.setItem(k, JSON.stringify({ v: 1, teams: [], players: [] }));
    }, FOLLOW);
    await page.reload();
    await expect(page.locator(ENTRY)).toBeHidden();
  });

  test("저장소 차단 — 매 방문 보이고, 닫으면 그 방문 동안만 닫힘", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("SecurityError");
        },
      });
    });
    await page.goto("./");
    await expect(page.locator(ENTRY)).toBeVisible();
    await page
      .getByRole("button", { name: /^건너뛰기 — 내 명단 만들기 닫기/ })
      .click();
    await expect(page.locator(ENTRY)).toBeHidden();
    // 앱 안 이동으로 돌아와도(같은 방문 — 메모리) 닫힌 채
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "뉴스" })
      .first()
      .click();
    await page.waitForURL(/\/news\/$/);
    await page.goBack();
    await page.waitForURL(/\/euro-digest\/$|\/$/);
    await expect(page.locator(ENTRY)).toBeHidden();
    // 새로 열면(새 방문) 다시 보인다
    await page.reload();
    await expect(page.locator(ENTRY)).toBeVisible();
  });
});

test.describe("단계", () => {
  test("시작 → 리그 2 → 팀 3 → 선수 1 → 완료 → /my 반영 · 재방문 숨김", async ({
    page,
  }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "내 명단 만들기 시작" }).click();
    const panel = page.locator('[data-slot="onboarding-panel"]');
    await expect(
      panel.getByRole("heading", { name: "내 명단 만들기" }),
    ).toBeFocused();
    await expect(panel.locator("[aria-live]")).toContainText("3단계 중 1단계");

    await panel.locator('label[data-ob-option="EPL"]').click();
    await panel.locator('label[data-ob-option="BUNDESLIGA"]').click();
    await panel.getByRole("button", { name: "다음", exact: true }).click();
    await expect(panel.getByRole("button", { name: /2단계 팀/ })).toBeFocused();
    await expect(panel.locator("[aria-live]")).toContainText("3단계 중 2단계");
    for (const slug of ["arsenal", "manchester-city", "bayern-munchen"])
      await panel.locator(`label[data-ob-option="${slug}"]`).click();
    await expect(panel.locator('[data-slot="onboarding-count"]')).toHaveText(
      "팀 3 / 5",
    );
    await panel.getByRole("button", { name: "다음", exact: true }).click();
    await panel.locator('label[data-ob-option="kim-min-jae"]').click();
    await panel.getByRole("button", { name: "완료", exact: true }).click();

    const done = panel.locator('[data-slot="onboarding-done"]');
    await expect(done).toContainText("팀 3 · 선수 1");
    expect(await stored(page)).toEqual({
      follow: {
        v: 1,
        teams: ["arsenal", "manchester-city", "bayern-munchen"],
        players: ["kim-min-jae"],
      },
      mark: "done",
    });
    await done.getByRole("link", { name: "마이에서 보기" }).click();
    await page.waitForURL(/\/my\/$/);
    await expect(page.locator('[data-slot="my-kicker"]')).toContainText(
      "팔로우 4",
    );
    await page.goto("./");
    await expect(page.locator(ENTRY)).toBeHidden();
  });

  test("팀 6번째는 막히고 토스트", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "내 명단 만들기 시작" }).click();
    const panel = page.locator('[data-slot="onboarding-panel"]');
    await panel.locator('label[data-ob-option="EPL"]').click();
    await panel.getByRole("button", { name: "다음", exact: true }).click();
    const labels = panel.locator('[data-ob-league="EPL"] label');
    for (let i = 0; i < 6; i++) await labels.nth(i).click();
    await expect(panel.locator('[data-slot="onboarding-count"]')).toHaveText(
      "팀 5 / 5",
    );
    await expect(labels.nth(5).locator("input")).not.toBeChecked();
    await expect(page.locator('[data-slot="toaster"]')).toContainText(
      "팀은 5개까지 고를 수 있어요",
    );
  });

  test("건너뛰기 → 기록 skipped · 닫힘 · 본문 포커스", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "내 명단 만들기 시작" }).click();
    await page
      .locator('[data-slot="onboarding-panel"]')
      .getByRole("button", { name: "건너뛰기" })
      .click();
    await expect(page.locator(ENTRY)).toBeHidden();
    await expect(page.locator("#main")).toBeFocused();
    expect((await stored(page)).mark).toBe("skipped");
  });
});

test.describe("CLS — 첫 페인트 전 판정", () => {
  test("첫 방문 · 재방문 모두 0.05 이하", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator(ENTRY)).toBeVisible();
    const first = await cls(page);
    await page.evaluate((m) => localStorage.setItem(m, "skipped"), MARK);
    await page.reload();
    await expect(page.locator(ENTRY)).toBeHidden();
    const again = await cls(page);
    test.info().annotations.push({
      type: "cls",
      description: `boot first=${first.toFixed(4)} again=${again.toFixed(4)}`,
    });
    expect(first).toBeLessThanOrEqual(0.05);
    expect(again).toBeLessThanOrEqual(0.05);
  });
});

test.describe("화면", () => {
  for (const width of [375, 768, 1024, 1280]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${width}px ${colorScheme} — 진입 줄 · 팀 단계 · 선수 단계 · 완료: 넘침 0 · axe 0 · 44px`, async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== "desktop", "폭은 테스트가 정한다");
        test.slow();
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.goto("./");
        await expect(page.locator(ENTRY)).toBeVisible();
        expect(await overflow(page)).toBe(0);
        expect(await smallTargets(page)).toEqual([]);
        expect(await axe(page)).toEqual([]);

        await page.getByRole("button", { name: "내 명단 만들기 시작" }).click();
        const panel = page.locator('[data-slot="onboarding-panel"]');
        await panel.locator('label[data-ob-option="EPL"]').click();
        await panel.locator('label[data-ob-option="BUNDESLIGA"]').click();
        await panel.locator('label[data-ob-option="LALIGA"]').click();
        await panel.getByRole("button", { name: "다음", exact: true }).click();
        await panel.locator('label[data-ob-option="bayern-munchen"]').click();
        await page.waitForTimeout(300);
        expect(await overflow(page)).toBe(0);
        expect(await smallTargets(page)).toEqual([]);
        expect(await axe(page)).toEqual([]);

        await panel.getByRole("button", { name: "다음", exact: true }).click();
        await page.waitForTimeout(300);
        expect(await overflow(page)).toBe(0);
        expect(await smallTargets(page)).toEqual([]);
        expect(await axe(page)).toEqual([]);

        await panel.getByRole("button", { name: "완료", exact: true }).click();
        expect(await overflow(page)).toBe(0);
        expect(await smallTargets(page)).toEqual([]);
        expect(await axe(page)).toEqual([]);
      });
    }
  }
});
