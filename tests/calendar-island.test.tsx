/**
 * 달력 펼침 섬 — src/components/news/calendar-island.tsx (M1-34 시안 A, DESIGN §9.3 티켓 꼬리표·달력)
 *
 * 서버가 그린 꼬리표·달력(src/components/news/counterfoil.tsx)을 실제로 렌더하고 섬이 속성만 바꾸는지 본다: 펼침(보는 호 칸 포커스) ·
 * 닫기 버튼·Esc(버튼으로 포커스 복귀) · 1024 이상 바깥 클릭 닫힘(375 시트는 아님) · 화살표 키(발행 칸만 — 결호 건너뜀) · 뜯김 속성.
 * 실제 브라우저 동작(팝오버 위치·시트·스크린샷)은 e2e tests/e2e/news-archive.spec.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { calendarKeyTarget } from "@/components/news/calendar-island";
import { ArchiveCalendar, Counterfoil } from "@/components/news/counterfoil";
import { buildArchiveView } from "@/lib/news/archive";

const DATES = [
  "2026-10-12",
  "2026-10-13",
  "2026-10-14",
  "2026-10-17",
  "2026-10-18",
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
];

let wide = true;
let reduce = false;
const original = window.matchMedia;
beforeEach(() => {
  wide = true;
  reduce = false;
  // MediaQueryList.matches는 살아 있는 값이다(섬이 한 번 만든 목록을 클릭 때마다 읽는다)
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes("min-width") ? wide : reduce;
    },
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  window.matchMedia = original;
});

function setup(date = "2026-10-20") {
  const view = buildArchiveView(DATES, date)!;
  const utils = render(
    <div>
      <Counterfoil view={view} />
      <ArchiveCalendar view={view} />
      <p data-testid="outside">바깥</p>
    </div>,
  );
  const button = screen.getByRole("button", { name: /달력/ });
  const panel = utils.container.querySelector<HTMLElement>("#archive-cal")!;
  const day = (d: string) =>
    panel.querySelector<HTMLElement>(`a[data-cal-day="${d}"]`)!;
  return { ...utils, button, panel, day };
}

describe("펼침·닫기", () => {
  it("버튼 → 펼침(aria-expanded true · hidden 해제 · 뜯김) + 보는 호 칸으로 포커스, 다시 누르면 접힘", () => {
    const { button, panel, day } = setup();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panel.hidden).toBe(false);
    expect(panel).toHaveAttribute("data-tear");
    expect(document.activeElement).toBe(day("2026-10-20"));
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(panel.hidden).toBe(true);
  });

  it("뜯김은 애니메이션이 끝나면 지운다(남으면 clip-path가 팝오버 그림자를 자른다) · 모션 줄이기면 달지 않는다", () => {
    const { button, panel } = setup();
    fireEvent.click(button);
    fireEvent.animationEnd(panel);
    expect(panel).not.toHaveAttribute("data-tear");
    fireEvent.click(button);
    reduce = true;
    fireEvent.click(button);
    expect(panel.hidden).toBe(false);
    expect(panel).not.toHaveAttribute("data-tear");
  });

  it("닫기 버튼 · Esc → 닫고 달력 버튼으로 포커스 복귀", () => {
    const { button, panel } = setup();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "달력 닫기" }));
    expect(panel.hidden).toBe(true);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  });

  it("1024 이상(팝오버)은 바깥 클릭으로 닫히고 판 안 클릭은 그대로, 375(시트)는 바깥 클릭으로 닫히지 않는다", () => {
    const { button, panel } = setup();
    fireEvent.click(button);
    fireEvent.click(panel.querySelector("table")!);
    expect(panel.hidden).toBe(false);
    fireEvent.click(screen.getByTestId("outside"));
    expect(panel.hidden).toBe(true);

    wide = false;
    fireEvent.click(button);
    fireEvent.click(screen.getByTestId("outside"));
    expect(panel.hidden).toBe(false);
  });

  it("판 밖에 포커스가 있을 때 Esc는 닫기만 한다(포커스를 옮기지 않는다 — 375 시트 화면 튐·다른 Esc와 충돌 방지)", () => {
    wide = false;
    const { button, panel } = setup();
    fireEvent.click(button);
    const outside = screen.getByTestId("outside");
    outside.tabIndex = -1;
    outside.focus();
    fireEvent.keyDown(outside, { key: "Escape" });
    expect(panel.hidden).toBe(true);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(outside);
  });

  it("1024 이상: 포커스가 판·버튼 밖으로 나가면(Tab) 닫는다(WCAG 2.4.11 — 팝오버가 덮은 요소에 포커스가 숨지 않게), 375 시트는 그대로", () => {
    const { button, panel } = setup();
    fireEvent.click(button);
    const outside = screen.getByTestId("outside");
    outside.tabIndex = -1;
    // 판 안·버튼 사이 이동은 그대로
    button.focus();
    expect(panel.hidden).toBe(false);
    outside.focus();
    expect(panel.hidden).toBe(true);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(outside);

    wide = false;
    fireEvent.click(button);
    outside.focus();
    expect(panel.hidden).toBe(false);
  });

  it("다른 판(카드 메뉴 — M1-35)이 이미 처리한 Esc(defaultPrevented)는 건너뛴다 — 375 시트가 같은 Esc로 함께 닫히지 않는다", () => {
    wide = false;
    const { button, panel } = setup();
    fireEvent.click(button);
    const outside = screen.getByTestId("outside");
    outside.tabIndex = -1;
    outside.focus();
    // 카드 메뉴처럼 아래에서 먼저 처리하고 preventDefault
    const handled = (event: KeyboardEvent) => event.preventDefault();
    outside.addEventListener("keydown", handled);
    fireEvent.keyDown(outside, { key: "Escape" });
    expect(panel.hidden).toBe(false);
    expect(button).toHaveAttribute("aria-expanded", "true");
    outside.removeEventListener("keydown", handled);
    fireEvent.keyDown(outside, { key: "Escape" });
    expect(panel.hidden).toBe(true);
  });

  it("닫혀 있을 때 Esc는 아무것도 하지 않는다(포커스를 뺏지 않는다)", () => {
    const { button } = setup();
    const outside = screen.getByTestId("outside");
    outside.tabIndex = -1;
    outside.focus();
    fireEvent.keyDown(outside, { key: "Escape" });
    expect(document.activeElement).toBe(outside);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});

describe("화살표 키 — 발행 칸만 오간다", () => {
  it("← → 앞뒤 발행 칸(결호 19일 건너뜀) · Home End · ↑ ↓ 7일(그날이 발행 칸일 때만)", () => {
    const { button, day } = setup();
    fireEvent.click(button);
    const press = (key: string) =>
      fireEvent.keyDown(document.activeElement!, { key });
    press("ArrowLeft");
    expect(document.activeElement).toBe(day("2026-10-18"));
    press("ArrowRight");
    press("ArrowRight");
    expect(document.activeElement).toBe(day("2026-10-21"));
    press("Home");
    expect(document.activeElement).toBe(day("2026-10-12"));
    press("End");
    expect(document.activeElement).toBe(day("2026-10-22"));
    // 22 ↑ = 15(결호) → 그대로
    press("ArrowUp");
    expect(document.activeElement).toBe(day("2026-10-22"));
    day("2026-10-20").focus();
    press("ArrowUp");
    expect(document.activeElement).toBe(day("2026-10-13"));
    press("ArrowDown");
    expect(document.activeElement).toBe(day("2026-10-20"));
  });

  it("calendarKeyTarget — 모르는 키·판 밖 요소는 null", () => {
    const { panel, day } = setup();
    expect(calendarKeyTarget(panel, day("2026-10-12"), "ArrowLeft")).toBeNull();
    expect(calendarKeyTarget(panel, day("2026-10-12"), "a")).toBeNull();
    expect(
      calendarKeyTarget(panel, screen.getByTestId("outside"), "ArrowRight"),
    ).toBeNull();
  });
});

describe("섬 경계(DESIGN §9.4)", () => {
  it("react 말고는 import하지 않는다(cn·fs·zod 없음 — 섬 번들 목표 gzip ≤ 2KB)", () => {
    const source = readFileSync(
      path.resolve("src/components/news/calendar-island.tsx"),
      "utf8",
    );
    const imports = [...source.matchAll(/^import .* from "(.+)";$/gm)].map(
      (m) => m[1],
    );
    expect(imports).toEqual(["react"]);
  });
});
