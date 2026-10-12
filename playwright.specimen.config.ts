import { defineConfig, devices } from "@playwright/test";

import { normalizeBasePath } from "./src/lib/paths";

// 기초 컴포넌트 견본 e2e (D0-12) — `npm run test:specimen`(= SPECIMEN=1 빌드 → 이 설정).
// 견본 빌드 결과(out-specimen/)를 scripts/serve-out.ts로 GitHub Pages처럼 basePath 아래에서 서빙한다.
// 일반 e2e(playwright.config.ts, out/)와 포트·폴더를 나눠 서로 덮지 않는다.
// 폭·색 구성표·모션은 테스트마다 정한다(375/1280 × 라이트/다크, CLAUDE.md §4). CDP(강제 의사 클래스)를 쓰므로 Chromium만.
const port = Number(process.env.SPECIMEN_PORT ?? 4174);
const basePath = normalizeBasePath(process.env.BASE_PATH);
const siteUrl = `http://127.0.0.1:${port}${basePath}/`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e-specimen",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: siteUrl,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx tsx scripts/serve-out.ts",
    url: `${siteUrl}specimen/`,
    env: { PORT: String(port), BASE_PATH: basePath, OUT_DIR: "out-specimen" },
    reuseExistingServer: !isCI,
    timeout: 30_000,
  },
});
