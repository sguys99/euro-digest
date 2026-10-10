import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

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
    // 테스트 중 실제 LLM 호출을 막는다(CLAUDE.md §6.3). 셸에서 지정한 값보다 우선한다.
    env: { LLM_MODE: "mock" },
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
