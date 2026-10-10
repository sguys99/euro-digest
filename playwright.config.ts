import { defineConfig, devices } from "@playwright/test";

// e2e는 빌드된 정적 결과(out/)를 대상으로 한다. 먼저 `npm run build`가 필요하다.
// scripts/serve-out.ts가 out/을 GitHub Pages처럼 basePath 아래로 서빙한다.
const port = Number(process.env.PORT ?? 4173);
const basePath = (process.env.BASE_PATH ?? "/euro-digest").replace(/\/+$/, "");
const siteUrl = `http://127.0.0.1:${port}${basePath}/`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    // basePath가 붙은 주소. 테스트에서는 앞에 `/` 없이 상대 경로로 이동한다(예: page.goto("./")).
    baseURL: siteUrl,
    trace: "on-first-retry",
  },
  // 화면 검증 기준 폭: 모바일 375 · 데스크톱 1280 (CLAUDE.md §4)
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: "npx tsx scripts/serve-out.ts",
    url: siteUrl,
    env: { PORT: String(port), BASE_PATH: basePath },
    reuseExistingServer: !isCI,
    timeout: 30_000,
  },
});
