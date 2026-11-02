import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// 검색(M4-14 — PRD FR-130~132, DESIGN §9.3 "검색 오버레이 · 색인" · §10). 빌드 결과(out/ + out/pagefind/)를 대상으로 한다.
// 한/영 별칭 검색 · 오버레이 키보드(/ · ⌘K · ↑↓ · Esc · 포커스 가둠 · 연 버튼 복귀) · `/search/?q=` · 결과 가림 · axe(열린 오버레이) ·
// 가로 넘침 · 44px · Pagefind 지연 로드(첫 화면 요청 0).
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const dialog = (page: Page) => page.getByRole("dialog", { name: "검색" });
const input = (page: Page) =>
  dialog(page).getByRole("combobox", { name: "검색어" });

async function openByButton(page: Page) {
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(input(page)).toBeFocused();
}

async function search(page: Page, q: string) {
  await input(page).fill(q);
  await expect(dialog(page).locator("[aria-live]")).not.toBeEmpty();
}

/** 묶음(group 이름) → 옵션 href 목록 */
async function optionHrefs(page: Page, group: string): Promise<string[]> {
  const g = dialog(page).getByRole("group", { name: new RegExp(`^${group}`) });
  if ((await g.count()) === 0) return [];
  return g
    .getByRole("option")
    .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
}

async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

test.describe("검색 — 한/영 별칭(FR-131)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await openByButton(page);
  });

  for (const q of ["김민재", "Kim Min-jae", "Min-jae", "민재"]) {
    test(`"${q}" → 선수 김민재 · 팀 바이에른`, async ({ page }) => {
      await search(page, q);
      expect(await optionHrefs(page, "선수")).toContain(
        "/euro-digest/korean-players/kim-min-jae/",
      );
      expect(await optionHrefs(page, "팀")).toContain(
        "/euro-digest/teams/bayern-munchen/",
      );
    });
  }

  for (const q of ["바이에른", "Bayern"]) {
    test(`"${q}" → 팀 바이에른 뮌헨 + 뉴스`, async ({ page }) => {
      await search(page, q);
      expect(await optionHrefs(page, "팀")).toContain(
        "/euro-digest/teams/bayern-munchen/",
      );
      expect((await optionHrefs(page, "뉴스")).length).toBeGreaterThan(0);
    });
  }

  for (const q of ["Arsenal", "아스널"]) {
    test(`"${q}" → 팀 아스널`, async ({ page }) => {
      await search(page, q);
      expect(await optionHrefs(page, "팀")).toEqual([
        "/euro-digest/teams/arsenal/",
      ]);
      // 뉴스 옵션은 원문(새 창)
      const news = dialog(page)
        .getByRole("group", { name: /^뉴스/ })
        .getByRole("option")
        .first();
      await expect(news).toHaveAttribute("target", "_blank");
      await expect(news).toHaveAttribute("href", /^https?:\/\//);
    });
  }

  test("없는 이름은 '0' + 안내(접두 되물림 결과를 버린다 — 'Magdeburg' → 'ma')", async ({
    page,
  }) => {
    await search(page, "Magdeburg");
    await expect(dialog(page)).toContainText("“Magdeburg” 결과가 없어요");
    await expect(dialog(page).getByRole("listbox")).toBeHidden();
    await expect(input(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("요약 줄 → 전체 결과(`/search/?q=`)", async ({ page }) => {
    await search(page, "김민재");
    const all = dialog(page).getByRole("link", { name: "전체 결과 보기" });
    await expect(all).toHaveAttribute(
      "href",
      `/euro-digest/search/?q=${encodeURIComponent("김민재")}`,
    );
    await all.click();
    await expect(page).toHaveURL(/\/search\/\?q=/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "“김민재” 색인",
    );
  });
});

test.describe("검색 오버레이 — 키보드 · 접근성(FR-132, DESIGN §10)", () => {
  test("첫 화면은 Pagefind를 받지 않는다 — 열 때 받는다", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto("./");
    await page.waitForLoadState("networkidle");
    expect(requests.filter((u) => u.includes("/pagefind/"))).toEqual([]);
    await openByButton(page);
    await expect
      .poll(
        () =>
          requests.filter((u) => u.includes("/pagefind/pagefind.js")).length,
      )
      .toBe(1);
  });

  test("dialog aria-modal · 입력 전 색인 · ↑↓ · Enter · Esc 복귀", async ({
    page,
  }) => {
    await page.goto("korean-players/");
    const button = page.getByRole("button", { name: "검색", exact: true });
    await openByButton(page);
    await expect(dialog(page)).toHaveAttribute("aria-modal", "true");
    // 입력 전 = 한국 선수 가나다 색인
    await expect(dialog(page).getByRole("list", { name: "ㄱ" })).toBeVisible();
    await expect(dialog(page)).toContainText("색인 — 한국 선수");

    await search(page, "김민재");
    const box = input(page);
    await expect(box).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowDown");
    const first = dialog(page).getByRole("option").first();
    await expect(first).toHaveAttribute("aria-selected", "true");
    await expect(box).toHaveAttribute(
      "aria-activedescendant",
      (await first.getAttribute("id")) ?? "",
    );
    await page.keyboard.press("ArrowUp");
    await expect(dialog(page).getByRole("option").last()).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(button).toBeFocused();
    // 뒤 페이지 스크롤 잠금 해제
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");

    // Enter = 선택 옵션 열기
    await openByButton(page);
    await search(page, "김민재");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/korean-players\/kim-min-jae\/$/);
  });

  test("단축키 Ctrl+K만 — '/'는 단축키가 아니다(입력 필드 밖에서도 · WCAG 2.1.4)", async ({
    page,
  }) => {
    await page.goto("search/");
    const field = page.getByRole("searchbox", { name: "검색어" });
    await field.click();
    await page.keyboard.type("a/b");
    await expect(field).toHaveValue("a/b");
    await expect(dialog(page)).toHaveCount(0);
    await page.keyboard.press("Control+k");
    await expect(input(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(field).toBeFocused();

    await page.locator("body").click({ position: { x: 1, y: 1 } });
    await page.keyboard.press("/");
    await expect(dialog(page)).toHaveCount(0);
    await page.keyboard.press("Control+k");
    await expect(input(page)).toBeFocused();
    await expect(input(page)).toHaveValue("");
  });

  test("포커스 가둠 — Tab · Shift+Tab이 판 밖으로 나가지 않는다", async ({
    page,
  }) => {
    await page.goto("./");
    await openByButton(page);
    await search(page, "김민재");
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() =>
          Boolean(document.activeElement?.closest('[role="dialog"]')),
        ),
      ).toBe(true);
    }
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Shift+Tab");
      expect(
        await page.evaluate(() =>
          Boolean(document.activeElement?.closest('[role="dialog"]')),
        ),
      ).toBe(true);
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`axe 0 · 넘침 0 · 44px — 입력 전 · 결과 (${colorScheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("./");
      await openByButton(page);
      for (const q of ["", "김민재"]) {
        if (q) await search(page, q);
        const { violations } = await new AxeBuilder({ page })
          .include('[role="dialog"]')
          .withTags(WCAG_TAGS)
          .analyze();
        expect(
          violations.map(
            (v) =>
              `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
          ),
        ).toEqual([]);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        const small = await dialog(page)
          .locator('a[href], button, [role="option"]')
          .evaluateAll((els) =>
            els
              .filter((el) => (el as HTMLElement).offsetParent !== null)
              .map((el) => {
                const r = el.getBoundingClientRect();
                return {
                  t: el.textContent?.slice(0, 20),
                  h: r.height,
                  w: r.width,
                };
              })
              .filter((r) => r.h < 44 || r.w < 44),
          );
        expect(small).toEqual([]);
      }
    });
  }
});

test.describe("/search/?q= 전체 결과", () => {
  test("h1 · 묶음 제목 · 선수 · 팀 · 뉴스 · 목차(1024 이상)", async ({
    page,
  }, info) => {
    await page.goto(`search/?q=${encodeURIComponent("김민재")}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "“김민재” 색인",
    );
    await expect(page.getByRole("searchbox", { name: "검색어" })).toHaveValue(
      "김민재",
    );
    const heads = page.locator('[data-slot="search-page"] h2');
    await expect(heads.first()).toContainText("선수");
    await expect(
      page.locator(
        '#search-player a[href="/euro-digest/korean-players/kim-min-jae/"]',
      ),
    ).toBeVisible();
    await expect(
      page.locator('#search-team a[href="/euro-digest/teams/bayern-munchen/"]'),
    ).toBeVisible();
    await expect(page.locator("#search-news li").first()).toBeVisible();
    if (info.project.name === "desktop") {
      const toc = page.getByRole("navigation", { name: "검색 결과 유형" });
      await expect(toc.getByRole("link", { name: /선수/ })).toHaveAttribute(
        "href",
        "#search-player",
      );
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("새 검색은 주소를 바꾸고(뒤로 가기) 폼은 JS 없이도 같은 주소로 간다", async ({
    page,
  }) => {
    await page.goto("search/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("검색");
    const form = page.getByRole("search");
    await expect(form).toHaveAttribute("action", "/euro-digest/search/");
    await page.getByRole("searchbox", { name: "검색어" }).fill("Arsenal");
    await page.getByRole("button", { name: "찾기" }).click();
    await expect(page).toHaveURL(/\/search\/\?q=Arsenal$/);
    await expect(
      page.locator('#search-team a[href="/euro-digest/teams/arsenal/"]'),
    ).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("검색");
  });

  test("결과 가림이 켜지면 spoiler 뉴스 제목 대신 띠, '보기'로 그 카드만", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("ed-spoiler", "on");
      } catch {}
    });
    await page.goto(`search/?q=${encodeURIComponent("경기 결과")}`);
    const bands = page.locator("#search-news").getByText("경기 결과 제목");
    await expect(bands.first()).toBeVisible();
    const before = await bands.count();
    await page
      .locator("#search-news")
      .getByRole("button", { name: "보기" })
      .first()
      .click();
    await expect(bands).toHaveCount(before - 1);
  });
});
