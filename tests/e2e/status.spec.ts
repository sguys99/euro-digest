import { readFileSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { outDir } from "./support/site";

// `/status/` 공개 상태 페이지 e2e (plan M5-15 — PRD P-1 · §15 D71 ③, DESIGN §9.3 D3 `/status`, DECISIONS D3 #10 · #15 · §8 #2) — 빌드 결과(out/).
// - 색인 제외: robots noindex · canonical 없음 · sitemap 밖 · 쪽 이름형 OG(`/og/pages/status.png`)
// - 뒤표지 '발행 상태 {n}%' → /status/ 이동, 숫자 = 숫자판 성공률(같은 빌드)
// - 숫자판 3칸(금액 없음) · 30칸 띠 · 화면 밖 30일 목록 · 날짜 이동(‹ › 44px · aria-live 상세 줄 · 선택 막대) · 그래프 면 누름(1024 이상)
// - 가로 넘침 0 · axe(라이트 · 다크). 모든 페이지 공통 axe · 링크는 a11y.spec · links.spec도 본다.

const PATH = "status/";
const WIDTHS = [375, 1023, 1024, 1280] as const;

async function open(page: Page, target = PATH): Promise<void> {
  const res = await page.goto(target);
  expect(res?.status()).toBe(200);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

function desktopOnly(projectName: string): void {
  test.skip(projectName !== "desktop", "desktop 프로젝트에서 한 번");
}

test("색인 제외 — noindex · canonical 없음 · sitemap 밖 · 쪽 이름형 OG · 제목", async ({
  page,
}) => {
  await open(page);
  await expect(page).toHaveTitle("발행 상태 · 유로 다이제스트");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /\/og\/pages\/status\.png$/,
  );
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    "content",
    "유로 다이제스트 · 발행 상태",
  );
  const sitemap = readFileSync(path.join(outDir, "sitemap.xml"), "utf8");
  expect(sitemap).not.toContain("/status/");
});

test("뒤표지 '발행 상태 {n}%' → /status/, 숫자는 숫자판 성공률과 같다", async ({
  page,
}) => {
  await open(page, "");
  const footer = page.getByRole("contentinfo");
  const link = footer.getByRole("link", { name: /^발행 상태/ });
  await expect(link).toHaveCount(1);
  const text = (await link.textContent()) ?? "";
  expect(text).toMatch(/^발행 상태 \d{1,3}\.\d%$/);
  const box = await link.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  const num = link.locator("span span");
  await expect(num).toHaveCSS("font-size", "17px");
  await expect(num).toHaveCSS("font-weight", "800");
  await link.click();
  await expect(page).toHaveURL(/\/status\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("발행 상태");
  const board = page.locator("dl[data-slot=status-board]");
  await expect(board.locator("dd .sr-only").nth(1)).toHaveText(
    text.replace("발행 상태 ", ""),
  );
});

test("숫자판 · 띠 · 화면 밖 목록 · 소스 표 — 금액 없음, 뜻은 글자로", async ({
  page,
}) => {
  await open(page);
  const board = page.locator("dl[data-slot=status-board]");
  await expect(board.locator("dt")).toHaveText([
    "마지막 발행 · 수집 완료",
    "최근 30일 실행 성공률",
    "이번 달 비용 · 월 예산 대비",
  ]);
  const main = page.locator("main");
  await expect(main).not.toContainText("$");
  await expect(main).not.toContainText("USD");
  await expect(page.locator("[data-slot=status-band] [data-mark]")).toHaveCount(
    30,
  );
  await expect(page.locator("[data-slot=status-band]")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  const list = page.getByRole("list", { name: "최근 30일 발행일" });
  await expect(list.getByRole("listitem")).toHaveCount(30);
  await expect(
    page.getByRole("table", { name: "소스 건강도 — 최근 7일" }),
  ).toBeVisible();
});

test("날짜 이동 — ‹ › 44px · 상세 줄 aria-live · 선택 막대가 옮겨 간다", async ({
  page,
}) => {
  await open(page);
  const line = page.locator("[data-slot=status-line]");
  await expect(line).toHaveAttribute("aria-live", "polite");
  const items = page
    .getByRole("list", { name: "최근 30일 발행일" })
    .getByRole("listitem");
  const last = (await items.nth(29).textContent()) ?? "";
  await expect(line).toHaveText(last);
  const prev = page.getByRole("button", { name: "이전 날" });
  const next = page.getByRole("button", { name: "다음 날" });
  for (const b of [prev, next]) {
    const box = await b.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await expect(next).toHaveAttribute("aria-disabled", "true");
  const sel = page.locator("[data-slot=status-sel]");
  const before = await sel.evaluate((el) => (el as HTMLElement).style.left);
  await prev.click();
  await expect(line).toHaveText((await items.nth(28).textContent()) ?? "");
  await expect
    .poll(() => sel.evaluate((el) => (el as HTMLElement).style.left))
    .not.toBe(before);
  // 키보드로도
  await prev.focus();
  await page.keyboard.press("Enter");
  await expect(line).toHaveText((await items.nth(27).textContent()) ?? "");
});

test("그래프 면 누름(포인터 보조) — x 좌표의 칸을 고른다", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo.project.name);
  await open(page);
  const plot = page.locator("[data-slot=status-plot]");
  const box = await plot.boundingBox();
  if (!box) throw new Error("그래프 없음");
  // 첫 칸 가운데
  await page.mouse.click(box.x + box.width / 60, box.y + box.height / 2);
  const first =
    (await page
      .getByRole("list", { name: "최근 30일 발행일" })
      .getByRole("listitem")
      .first()
      .textContent()) ?? "";
  await expect(page.locator("[data-slot=status-line]")).toHaveText(first);
  await expect(page.getByRole("button", { name: "이전 날" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

for (const width of WIDTHS) {
  test(`${width}px — 가로 넘침 0 · 1024 이상 목차 열 "이 쪽"`, async ({
    page,
  }, testInfo) => {
    desktopOnly(testInfo.project.name);
    await page.setViewportSize({ width, height: 800 });
    await open(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const toc = page.getByRole("navigation", { name: "이 쪽 차례" });
    if (width >= 1024) {
      await expect(toc.getByRole("link")).toHaveText([
        "숫자판",
        "최근 30일",
        "소스",
      ]);
    } else {
      await expect(toc).toBeHidden();
    }
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`axe 위반 0 — ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await open(page);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
}
