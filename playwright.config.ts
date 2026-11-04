import { defineConfig, devices } from "@playwright/test";

import { normalizeBasePath } from "./src/lib/paths";

// e2e는 빌드된 정적 결과(out/)를 대상으로 한다. 먼저 `npm run build`가 필요하다.
// scripts/serve-out.ts가 out/을 GitHub Pages처럼 basePath 아래로 서빙한다.
// basePath 규칙은 next.config.ts와 같다(단일 출처: src/lib/paths.ts).
const port = Number(process.env.PORT ?? 4173);
const basePath = normalizeBasePath(process.env.BASE_PATH);
const siteUrl = `http://127.0.0.1:${port}${basePath}/`;
const isCI = Boolean(process.env.CI);
// 브라우저 엔진(M5-12 — NFR-13): 기본 Chromium(Chrome · Edge · Samsung Internet 계열). `E2E_ENGINE=webkit`이면 같은 두 프로젝트(mobile ·
// desktop — 테스트가 프로젝트 이름으로 폭을 나누므로 이름은 그대로)를 Playwright WebKit(Safari 엔진 근사)으로 돌린다. 선택 실행용이라
// CI 기본 실행에는 넣지 않는다(시간 약 2배). WebKit 설치: `npx playwright install webkit`(Linux는 시스템 라이브러리도 필요 —
// docs/research/m5-browsers.md)
const engine = process.env.E2E_ENGINE === "webkit" ? "webkit" : "chromium";
const browserDevice =
  engine === "webkit" ? devices["Desktop Safari"] : devices["Desktop Chrome"];

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
        ...browserDevice,
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop",
      use: {
        ...browserDevice,
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
