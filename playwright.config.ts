import { defineConfig, devices } from "@playwright/test";

import { normalizeBasePath } from "./src/lib/paths";

// e2e는 빌드된 정적 결과(out/)를 대상으로 한다. 먼저 `npm run build`가 필요하다.
// scripts/serve-out.ts가 out/을 GitHub Pages처럼 basePath 아래로 서빙한다.
// basePath 규칙은 next.config.ts와 같다(단일 출처: src/lib/paths.ts).
const port = Number(process.env.PORT ?? 4173);
const basePath = normalizeBasePath(process.env.BASE_PATH);
const siteUrl = `http://127.0.0.1:${port}${basePath}/`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // CI 러너(4 vCPU)에서 worker 1개로는 M3 이후 e2e(약 1,200건)가 job 제한을 넘는다 — 3개로 병렬(2026-11-01)
  workers: isCI ? 3 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    // basePath가 붙은 주소. 테스트에서는 앞에 `/` 없이 상대 경로로 이동한다(예: page.goto("./")).
    baseURL: siteUrl,
    trace: "on-first-retry",
    // 서비스 워커(M4-13)는 기본으로 막는다 — 첫 방문마다 앱 셸·최근 호(수 MB)를 프리캐시하고 요청을 가로채 다른 검사(네트워크·경로
    // 가로채기·CLS)를 흔들지 않게. 워커 검사는 tests/e2e/pwa.spec.ts가 `serviceWorkers: "allow"`로 켠다.
    serviceWorkers: "block",
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
