import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";

describe("HomePage", () => {
  it("서비스 이름을 h1으로 보여 준다", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "유로 다이제스트" }),
    ).toBeInTheDocument();
  });
});
