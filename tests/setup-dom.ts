// DOM 테스트(happy-dom) 공통 설정 — vitest.config.ts의 "dom" 프로젝트에서만 실행된다.
import "@testing-library/jest-dom/vitest";

import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// waitFor · findBy* 기본 1초는 부하가 큰 기계(load 30 안팎)에서 섬의 첫 렌더 · effect가 늦어 떨어졌다(my-board · my-share — M5-13).
// 5초로 올린다(조건이 맞으면 바로 끝나므로 평소 시간은 그대로). 테스트 상한은 vitest.config.mts testTimeout.
configure({ asyncUtilTimeout: 5_000 });

// globals를 끄고 쓰므로 Testing Library의 자동 cleanup이 동작하지 않는다. 직접 정리한다.
afterEach(() => {
  cleanup();
});
