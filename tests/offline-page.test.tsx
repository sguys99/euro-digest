/**
 * `/offline/` 오프라인 화면 — 저장해 둔 호(M5-17 — D3 C 숫자, DESIGN §9.3 D3 `/offline/`, DECISIONS D3 #14, PRD FR-121 · DR-07).
 * 머리에는 숫자가 없고, "저장해 둔 호" 아래 저장한 호 수(N2 — 0이면 윤곽) + "최근 3일 {범위}" → 호수 거터(N3 + "호") 목록.
 * 범위 = `recentIssueDates`(서비스 워커 프리캐시와 같은 함수 — 결호는 목록에서만 빠진다). 실제 오프라인 이동은 e2e(tests/e2e/pwa.spec.ts).
 */
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OfflinePage from "@/app/offline/page";

const { listIssueDates } = vi.hoisted(() => ({
  listIssueDates: vi.fn<() => string[]>(() => []),
}));
vi.mock("@/lib/data/issue", () => ({
  listIssueDates,
  loadLatestIssue: () => ({ news: null, issue: null }),
}));

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-02T22:00:00.000Z") }); // 11-03 07:00 KST
  listIssueDates.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

function saved(): HTMLElement {
  return screen.getByRole("region", { name: "저장해 둔 호" });
}

describe("OfflinePage — 저장해 둔 호", () => {
  it("저장한 호 수 N2 실선(장식 — 제목 안 화면 밖 'n개') + 최근 3일 범위 → 1px --ink 아래 호수 거터 목록(최신순)", () => {
    listIssueDates.mockReturnValue([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    render(<OfflinePage />);
    // 머리에는 숫자가 없다(못 여는 사실은 문장이 맡는다)
    const head = screen.getByRole("region", {
      name: "연결이 끊겨 열 수 없어요",
    });
    expect(head.textContent).not.toMatch(/\d/);
    const count = saved().querySelector("[data-slot=offline-count]")!;
    const n = count.querySelector("[aria-hidden=true]")!;
    expect(n).toHaveTextContent("3");
    expect(n.className).toContain("text-num-n2");
    expect(n.className).toContain("text-ink");
    expect(count).toHaveTextContent("연결 없이 열 수 있는 호 3개");
    expect(count).toHaveTextContent(
      "최근 3일 10.31 – 11.02 · 결호가 낀 날은 그만큼 적어요",
    );
    const list = within(saved()).getByRole("list");
    expect(list.className).toContain("border-ink");
    const links = within(list).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/euro-digest/news/2026-11-02/",
      "/euro-digest/news/2026-11-01/",
      "/euro-digest/news/2026-10-31/",
    ]);
    // 이름 = 날짜 + 화면 밖 호수(거터 숫자는 장식)
    expect(links[0]).toHaveAccessibleName("11월 2일 (월) 제 22호");
    const gutter = links[0]!.querySelector("[aria-hidden=true]")!;
    expect(gutter).toHaveTextContent("22호");
    expect(gutter.querySelector("span")?.className).toContain("text-num-n3");
  });

  it("결호가 낀 구간은 그만큼 적다 — 범위는 최신 호에서 거꾸로 3일", () => {
    listIssueDates.mockReturnValue(["2026-10-31", "2026-11-02"]);
    render(<OfflinePage />);
    const count = saved().querySelector("[data-slot=offline-count]")!;
    expect(count.querySelector("[aria-hidden=true]")).toHaveTextContent("2");
    expect(count).toHaveTextContent("최근 3일 10.31 – 11.02");
    expect(within(saved()).getAllByRole("link")).toHaveLength(2);
  });

  it("저장한 호가 없으면 윤곽 0 · 목록 없음", () => {
    render(<OfflinePage />);
    const n = saved().querySelector(
      "[data-slot=offline-count] [aria-hidden=true]",
    )!;
    expect(n).toHaveTextContent("0");
    expect(n.className).toContain("text-transparent");
    expect(within(saved()).queryByRole("list")).toBeNull();
  });
});
