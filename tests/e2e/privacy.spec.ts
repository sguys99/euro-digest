import { expect, test, type Page } from "@playwright/test";

import { PRIVACY_SECTIONS, STORAGE_ITEMS } from "../../src/lib/privacy";
import { basePath } from "./support/site";

// `/privacy/` e2e (M5-05 — PRD FR-141 · NFR-08) — 빌드 결과(out/)에서 폭별 가로 넘침 · 차례 배치(1024 이상 목차 열 · 1023 이하 본문 차례) ·
// 앵커 이동(:target 괘선) · 뒤표지 · /about에서 들어오는 링크 · 메타(canonical · 쪽 이름형 OG) · 한글 줄바꿈(keep-all)을 본다.
// axe(라이트 · 다크) · 44px · 링크 200 · sitemap · OG 파일은 a11y.spec · links.spec · seo.spec · og.spec이 모든 페이지에 건다.

const WIDTHS = [375, 1023, 1024, 1280] as const;
const SITE = "https://sguys99.github.io/euro-digest";

function desktopOnly(projectName: string): void {
  test.skip(
    projectName !== "desktop",
    "폭별 검사는 desktop 프로젝트에서 한 번",
  );
}

async function open(page: Page, target: string): Promise<void> {
  await page.goto(target);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

for (const width of WIDTHS) {
  const wide = width >= 1024;
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test(`가로 넘침 0 · h1 하나 · 차례 ${wide ? "목차 열" : "본문"}만 보인다`, async ({
      page,
    }, testInfo) => {
      desktopOnly(testInfo.project.name);
      await open(page, "privacy/");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText([
        "개인정보 처리방침",
      ]);
      const tocs = page.getByRole("navigation", {
        name: "개인정보 처리방침 차례",
      });
      await expect(tocs).toHaveCount(1);
      await expect(tocs.first().getByRole("link")).toHaveCount(
        PRIVACY_SECTIONS.length,
      );
      expect(
        await tocs.first().evaluate((el) => el.closest("main") !== null),
      ).toBe(!wide);
      // 표(저장 항목)의 어떤 줄도 본문 폭을 넘지 않는다
      const wider = await page
        .locator("#storage dl > div")
        .evaluateAll((rows) =>
          rows
            .filter((r) => r.scrollWidth > r.clientWidth + 1)
            .map((r) => r.textContent?.slice(0, 20)),
        );
      expect(wider).toEqual([]);
    });
  });
}

test("절 앵커 — 차례를 누르면 그 절로 가고 머리 괘선이 레드(:target)", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo.project.name);
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page, "privacy/");
  const toc = page.getByRole("navigation", { name: "개인정보 처리방침 차례" });
  await toc.getByRole("link", { name: /브라우저 저장/ }).click();
  await expect(page).toHaveURL(new RegExp(`${basePath}/privacy/#storage$`));
  await page.waitForTimeout(300); // 괘선 색 전환(base 200ms)
  const result = await page.evaluate(() => {
    const sectionEl = document.getElementById("storage") as HTMLElement;
    const head = sectionEl.firstElementChild as HTMLElement;
    const probe = document.createElement("span");
    probe.style.color = "var(--brand-accent)";
    document.body.append(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return {
      top: Math.round(sectionEl.getBoundingClientRect().top),
      border: getComputedStyle(head).borderTopColor,
      accent,
      heading: head.querySelector("h2")?.textContent,
    };
  });
  expect(result.heading).toBe("브라우저 저장");
  expect(result.top).toBe(16);
  expect(result.border).toBe(result.accent);
});

test("뒤표지 '개인정보 처리방침' · /about 머리 링크 → /privacy/", async ({
  page,
}) => {
  await open(page, "./");
  const footerLink = page
    .getByRole("contentinfo")
    .getByRole("link", { name: "개인정보 처리방침" });
  await expect(footerLink).toHaveAttribute("href", `${basePath}/privacy/`);
  await open(page, "about/");
  const aboutLink = page
    .getByRole("main")
    .getByRole("link", { name: "개인정보 처리방침" });
  await expect(aboutLink).toHaveAttribute("href", `${basePath}/privacy/`);
  await aboutLink.click();
  await expect(page).toHaveURL(new RegExp(`${basePath}/privacy/$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "개인정보 처리방침",
  );
});

test("메타 — canonical · og:url = 이 페이지, 쪽 이름형 OG, 색인 허용", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo.project.name);
  await open(page, "privacy/");
  await expect(page).toHaveTitle("개인정보 처리방침 · 유로 다이제스트");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${SITE}/privacy/`,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    `${SITE}/og/pages/privacy.png`,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test("저장 항목 — 사람이 읽는 이름으로 모두 보이고 키 이름은 화면에 없다 · 한글 keep-all", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo.project.name);
  await open(page, "privacy/");
  const storage = page.locator("#storage");
  for (const item of STORAGE_ITEMS)
    await expect(
      storage.locator("dt", { hasText: new RegExp(`^${item.name}$`) }),
    ).toHaveCount(1);
  expect(await storage.innerText()).not.toMatch(/\bed-|skipgc/);
  expect(
    await page.locator("main").evaluate((el) => getComputedStyle(el).wordBreak),
  ).toBe("keep-all");
});
