import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

import { DEFAULT_BASE_PATH, DEFAULT_SITE_URL } from "./src/lib/paths";

// 단위·스키마 테스트는 tests/에 둔다(CLAUDE.md §5). e2e(tests/e2e/)는 Playwright 담당이라 제외.
// 테스트 환경은 파일 확장자로 나눈다.
//   *.test.ts  → node      (파이프라인·스키마·시간대 등 순수 함수)
//   *.test.tsx → happy-dom (React 컴포넌트, Testing Library + jest-dom)
// 개별 파일은 첫 줄 주석 `// @vitest-environment <env>`로 덮어쓸 수 있다.
const E2E_DIR = "tests/e2e/**";

export default defineConfig({
  plugins: [react()],
  // tsconfig.json의 `@/*` → `src/*` 별칭을 그대로 쓴다(Vite 내장 기능).
  resolve: { tsconfigPaths: true },
  test: {
    // 시간 상한(M5-13): 기본 5초는 부하가 큰 기계(load 30 안팎 — 병렬 빌드 · e2e와 겹칠 때)에서 실제 데이터를 통째로 도는 케이스
    // (collect-cluster · collect-classify · entity-merge · my-board · my-share · pwa 등 — 평소 2~8초)를 시간 초과로 떨어뜨렸다.
    // 그런 파일마다 `vi.setConfig({ testTimeout: 30_000 })`를 붙이던 것(brief-check · brief-korean · brief-grammar)을 기본값으로 올린다.
    // 멈춘 테스트는 여전히 30초에서 실패한다. 개별 테스트가 더 길게 잡은 상한(60초 등)은 그대로 쓴다.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // 테스트 중 실제 LLM 호출을 막는다(CLAUDE.md §6.3). 셸에서 지정한 값보다 우선한다.
    // 사이트 위치(src/lib/paths.ts `sitePaths()` — NEXT_PUBLIC_* → BASE_PATH·SITE_URL → 기본값)도 기본값으로 고정한다(M4-16):
    // 셸에 BASE_PATH·NEXT_PUBLIC_BASE_PATH 등이 남아 있으면(루트 배포 미리보기 · 다른 도구가 내보낸 값) canonical · RSS · ics 경로를 기대하는
    // 테스트 38건(news-archive-page 2건 포함)이 환경에 따라 실패했다. 다른 위치 계산은 테스트가 `createPaths`로 직접 한다.
    env: {
      LLM_MODE: "mock",
      BASE_PATH: DEFAULT_BASE_PATH,
      SITE_URL: DEFAULT_SITE_URL,
      NEXT_PUBLIC_BASE_PATH: DEFAULT_BASE_PATH,
      NEXT_PUBLIC_SITE_URL: DEFAULT_SITE_URL,
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: [...configDefaults.exclude, E2E_DIR],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "happy-dom",
          include: ["tests/**/*.test.tsx"],
          exclude: [...configDefaults.exclude, E2E_DIR],
          setupFiles: ["tests/setup-dom.ts"],
        },
      },
    ],
  },
});
