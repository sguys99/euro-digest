import { describe, expect, it } from "vitest";

import { DISPLAY_TIME_ZONE, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

import { formatTodo } from "../scripts/lib/todo";

// `@/*` → `src/*` 별칭이 Vitest node 환경에서 해석되는지 확인한다(M0-05).
// tsx 실행 경로의 해석은 스텁 진입점 실행(`npm run build`의 build-feeds 등)이 검증한다.
describe("`@/*` 경로 별칭", () => {
  it("테스트에서 @/lib/site를 직접 import한다", () => {
    expect(SITE_NAME).toBe("유로 다이제스트");
    expect(SITE_TAGLINE).toBe(
      "매일 아침 07:00, 유럽 축구 소식을 한국어 3줄로.",
    );
  });

  it("@/lib/site를 import하는 scripts/ 모듈도 해석된다", () => {
    expect(formatTodo("npm run weekly", "M2-07")).toContain(`[${SITE_NAME}]`);
  });
});

describe("DISPLAY_TIME_ZONE", () => {
  it("런타임이 인식하는 IANA 시간대다", () => {
    expect(
      new Intl.DateTimeFormat("ko-KR", {
        timeZone: DISPLAY_TIME_ZONE,
      }).resolvedOptions().timeZone,
    ).toBe("Asia/Seoul");
  });
});
