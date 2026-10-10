// DOM 테스트(happy-dom) 공통 설정 — vitest.config.ts의 "dom" 프로젝트에서만 실행된다.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals를 끄고 쓰므로 Testing Library의 자동 cleanup이 동작하지 않는다. 직접 정리한다.
afterEach(() => {
  cleanup();
});
