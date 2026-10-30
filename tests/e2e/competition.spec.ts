import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// 대회 페이지 `/competitions/[comp]/` (M2-10·M2-11 — PRD FR-40~45, DESIGN §9.3 D1 대회 화면). 빌드 결과(out/)를 대상으로 한다.
// 첫 패널(순위표) 접근성은 a11y.spec(out/ 전수)이 보고, 여기서는 숨은 패널·상호작용·폭별 배치를 본다.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const COMPS = ["epl", "laliga", "seriea", "bundesliga", "ligue1", "ucl"];

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
}

test.describe("대회 페이지 — 6개 정적 생성 · 기본 배치", () => {
  for (const comp of COMPS) {
    test(`${comp} — h1 하나 · 순위표 행 · 가로 넘침 0 · 출처 문구`, async ({
      page,
    }) => {
      await page.goto(`competitions/${comp}/`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      expect(
        await page.locator("table[data-slot=standings] tr[data-row]").count(),
      ).toBeGreaterThan(0);
      await expect(
        page.locator('[data-slot="competition-source"] [lang="en"]'),
      ).toHaveText("Football data provided by the Football-Data.org API");
      await noOverflow(page);
    });
  }
});

test.describe("보기 탭 · 라운드 이동 · 행 펼침", () => {
  test("탭을 바꾸면 패널이 바뀌고, 숨은 패널도 WCAG 위반 0(라이트·다크)", async ({
    page,
  }) => {
    // 패널 3 × 테마 2 axe — 큰 표·라운드라 한 번에 4~5초(병렬 부하에서 기본 30초를 넘는다)
    test.setTimeout(120_000);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto("competitions/epl/");
      for (const name of ["일정·결과", "득점 순위", "뉴스"]) {
        await page.getByRole("tab", { name }).click();
        await expect(page.getByRole("tab", { name })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        await noOverflow(page);
        const { violations } = await new AxeBuilder({ page })
          .withTags(WCAG_TAGS)
          .analyze();
        expect(
          violations.map((v) => `${v.id}: ${v.nodes.length}`),
          `${name} (${colorScheme})`,
        ).toEqual([]);
      }
    }
  });

  test("일정·결과 — 지금 라운드 하나만 보이고, 앵커 링크로 이웃 라운드로 간다(#round-n 직접 진입도 패널을 연다)", async ({
    page,
  }) => {
    await page.goto("competitions/epl/");
    await page.getByRole("tab", { name: "일정·결과" }).click();
    const visible = page.locator("[data-rounds] > [data-round]:visible");
    await expect(visible).toHaveCount(1);
    const current = await visible.getAttribute("id");
    const next = visible.getByRole("link").last();
    const target = (await next.getAttribute("href"))!.slice(1);
    await next.click();
    await expect(page).toHaveURL(new RegExp(`#${target}$`));
    await expect(visible).toHaveCount(1);
    await expect(visible).toHaveAttribute("id", target);
    expect(target).not.toBe(current);

    await page.goto("competitions/epl/#round-1");
    await expect(page.getByRole("tab", { name: "일정·결과" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(visible).toHaveAttribute("id", "round-1");
  });

  test("1023 이하 — 승점 칸 버튼·행 누름으로 펼침, 1024 이상은 버튼 없음", async ({
    page,
  }) => {
    await page.goto("competitions/epl/");
    const width = page.viewportSize()!.width;
    const button = page.locator("button[data-row-toggle]").first();
    if (width >= 1024) {
      await expect(button).toBeHidden();
      return;
    }
    const detailId = (await button.getAttribute("aria-controls"))!;
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(`#${detailId}`)).toBeVisible();
    // 행(팀 칸)을 눌러도 같은 버튼 — 다시 닫힌다
    await page.locator("tr[data-row]").first().locator("th").click();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(`#${detailId}`)).toBeHidden();
  });

  test("다른 화면에서 오는 팀 행 앵커(#팀 slug)는 :target 도착 강조", async ({
    page,
  }) => {
    await page.goto("competitions/epl/");
    const slug = await page.locator("tr[data-row]").nth(3).getAttribute("id");
    await page.goto(`competitions/epl/#${slug}`);
    const bg = await page
      .locator(`tr#${slug} > th`)
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  });
});

test("누를 수 있는 것은 44px 이상(대회 이동·목차·탭·펼침·라운드 이동)", async ({
  page,
}) => {
  await page.goto("competitions/epl/");
  await page.getByRole("tab", { name: "일정·결과" }).click();
  const small = await page.evaluate(() => {
    const els = document.querySelectorAll<HTMLElement>(
      'main a, main button, main [role="tab"], nav[aria-label="대회"] a',
    );
    return [...els]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        if (el.closest("[data-view=news]")) return false;
        return r.height < 44 || r.width < 44;
      })
      .map((el) => `${el.tagName} ${el.textContent?.trim().slice(0, 20)}`);
  });
  expect(small).toEqual([]);
});
