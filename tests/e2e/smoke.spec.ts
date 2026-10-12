import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { basePath, outDir } from "./support/site";

// 경로는 baseURL(basePath 포함) 기준 상대 경로로 쓴다. "/"로 시작하면 basePath가 빠진다.

test("홈이 200으로 열리고 서비스 이름 h1이 보인다", async ({ page }) => {
  const response = await page.goto("./");

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "유로 다이제스트" }),
  ).toBeVisible();
});

test("없는 경로는 404 상태로 응답하고 홈으로 가는 링크를 보여 준다", async ({
  page,
}) => {
  const response = await page.goto("this-page-does-not-exist/");

  expect(response?.status()).toBe(404);
  const homeLink = page.getByRole("link", { name: "홈으로 돌아가기" });
  await expect(homeLink).toHaveAttribute("href", `${basePath}/`);

  await homeLink.click();
  await expect(page).toHaveURL(`${basePath}/`);
  await expect(
    page.getByRole("heading", { level: 1, name: "유로 다이제스트" }),
  ).toBeVisible();
});

// 기초 컴포넌트 견본(D0-12)은 SPECIMEN=1 빌드(out-specimen/) 전용이다. 일반 빌드 산출물(out/)에 없어야 한다.
test("견본(specimen) 페이지는 일반 빌드에 없고 404로 응답한다", async ({
  page,
}) => {
  expect(
    existsSync(path.join(outDir, "index.html")),
    "먼저 npm run build",
  ).toBe(true);
  expect(existsSync(path.join(outDir, "specimen"))).toBe(false);
  // RSC 페이로드(__next.specimen.*.txt)도 없다
  expect(
    readdirSync(outDir).filter((name) => name.includes("specimen")),
  ).toEqual([]);

  const response = await page.goto("specimen/");
  expect(response?.status()).toBe(404);
});
