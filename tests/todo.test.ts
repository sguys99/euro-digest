import { describe, expect, it } from "vitest";

import { formatTodo } from "../scripts/lib/todo";

describe("formatTodo", () => {
  it("서비스명·명령·구현 예정 작업 ID를 한 줄로 알린다", () => {
    expect(formatTodo("npm run validate", "M0-17")).toBe(
      "[유로 다이제스트] [TODO] npm run validate — M0-17에서 구현",
    );
  });

  it("설명이 있으면 다음 줄에 들여 쓴다", () => {
    expect(formatTodo("npm run eval:prompt", "M1-24", "골든셋 10건")).toBe(
      "[유로 다이제스트] [TODO] npm run eval:prompt — M1-24에서 구현\n       골든셋 10건",
    );
  });
});
