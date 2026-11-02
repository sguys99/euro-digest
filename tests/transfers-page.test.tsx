import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TransfersPage, { metadata } from "@/app/transfers/page";
import * as transfersData from "@/lib/data/transfers";
import { TRANSFER_BOOT_SCRIPT } from "@/lib/transfer-filter-dom";

// `/transfers/`(M4-04 — FR-101 · FR-104 · FR-105). 저장소 data/transfers.json · data/news(날마다 바뀜)라 구조만 본다 — 화면 모델 규칙은
// tests/transfers-view.test.ts, 필터 DOM은 tests/transfer-filter-dom.test.tsx, 빌드 결과는 tests/e2e/transfers.spec.ts.
vi.mock("@/lib/data/issue", () => ({
  loadLatestIssue: () => ({ issue: null, news: null }),
}));

describe("TransfersPage", () => {
  it("메타 — 제목 '이적', canonical /transfers/", () => {
    expect(metadata.alternates?.canonical).toMatch(/\/transfers\/$/);
    expect(String(metadata.title)).toContain("이적");
  });

  it("h1 · 상단 내비 '이적' 현재 · 하단 탭에는 없음 · 원장 행 = 파일 레코드 · 부트 스크립트", () => {
    const view = transfersData.loadTransfersView();
    const { container } = render(<TransfersPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("이적");
    const top = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(within(top).getByRole("link", { name: "이적" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const bottom = screen.getByRole("navigation", { name: "하단 탭" });
    expect(within(bottom).queryByRole("link", { name: "이적" })).toBeNull();
    const rows = container.querySelectorAll("[data-xf-row]");
    expect(rows).toHaveLength(view?.rows.length ?? 0);
    if (view && view.rows.length > 0) {
      const scripts = [...container.querySelectorAll("script")].map(
        (s) => s.innerHTML,
      );
      expect(scripts).toContain(TRANSFER_BOOT_SCRIPT);
      expect(
        screen.getByRole("navigation", { name: "이적 필터" }),
      ).toBeInTheDocument();
    }
  });

  it("트래커 파일이 없으면 빈 상태 문장 · 필터 없음", () => {
    const spy = vi
      .spyOn(transfersData, "loadTransfersView")
      .mockReturnValue(null);
    const { container } = render(<TransfersPage />);
    expect(
      container.querySelector("[data-slot=transfers-empty]"),
    ).not.toBeNull();
    expect(container.querySelector("[data-xf-row]")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "이적 필터" })).toBeNull();
    spy.mockRestore();
  });
});
