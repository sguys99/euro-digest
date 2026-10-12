/**
 * Tabs — WAI-ARIA Tabs 패턴 (D0-12, DESIGN.md §9.2 대회 탭)
 * roving tabindex, ←/→/Home/End(순환·비활성 건너뜀), 자동/수동 활성화, aria-selected·aria-controls·패널 숨김.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";

function Example({
  activation,
  defaultValue = "EPL",
  disabled,
  panels = true,
  onValueChange,
}: {
  activation?: "automatic" | "manual";
  defaultValue?: string | null;
  disabled?: string;
  panels?: boolean;
  onValueChange?: (value: string) => void;
}) {
  const items = [
    ["EPL", "EPL"],
    ["LALIGA", "라리가"],
    ["SERIEA", "세리에A"],
  ] as const;
  return (
    <Tabs
      defaultValue={defaultValue}
      activation={activation}
      onValueChange={onValueChange}
    >
      <TabsList aria-label="순위 대회">
        {items.map(([value, label]) => (
          <TabsTrigger
            key={value}
            value={value}
            competition={value}
            disabled={disabled === value}
          >
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {panels
        ? items.map(([value, label]) => (
            <TabsPanel key={value} value={value}>
              {label} 순위
            </TabsPanel>
          ))
        : null}
    </Tabs>
  );
}

function tabs() {
  return screen.getAllByRole("tab");
}

function key(name: string) {
  const active = document.activeElement;
  if (!active) throw new Error("포커스 없음");
  fireEvent.keyDown(active, { key: name });
}

describe("Tabs — 구조·ARIA", () => {
  it("tablist(이름) · tab · tabpanel, 선택 탭만 Tab 순서(tabindex 0)", () => {
    render(<Example />);
    expect(
      screen.getByRole("tablist", { name: "순위 대회" }),
    ).toBeInTheDocument();
    const [epl, laliga, seriea] = tabs();
    expect(epl).toHaveAttribute("aria-selected", "true");
    expect(epl).toHaveAttribute("tabindex", "0");
    expect(laliga).toHaveAttribute("aria-selected", "false");
    expect(laliga).toHaveAttribute("tabindex", "-1");
    expect(seriea).toHaveAttribute("tabindex", "-1");
  });

  it("aria-controls ↔ 패널 id, 패널은 aria-labelledby로 탭을 가리키고 선택 패널만 보인다", () => {
    render(<Example />);
    const [epl, laliga] = tabs();
    const panelId = epl?.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId ?? "");
    expect(panel).toHaveAttribute("role", "tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", epl?.id);
    expect(panel).toBeVisible();
    expect(panel).toHaveAttribute("tabindex", "0");
    const other = document.getElementById(
      laliga?.getAttribute("aria-controls") ?? "",
    );
    expect(other).not.toBeVisible();
    expect(screen.getByRole("tabpanel", { name: "EPL" })).toHaveTextContent(
      "EPL 순위",
    );
  });

  it("패널이 없으면 aria-controls를 달지 않는다(없는 id를 가리키지 않게)", () => {
    render(<Example panels={false} />);
    for (const tab of tabs()) expect(tab).not.toHaveAttribute("aria-controls");
  });

  it("선택이 없으면(null) 모든 탭이 Tab 순서에 든다(견본·초기 상태)", () => {
    render(<Example defaultValue={null} />);
    for (const tab of tabs()) {
      expect(tab).toHaveAttribute("aria-selected", "false");
      expect(tab).toHaveAttribute("tabindex", "0");
    }
  });

  it("선택 탭이 비활성이면 활성인 첫 탭이 Tab 순서에 든다(APG — 탭 목록에 들어갈 수 있게)", () => {
    render(<Example disabled="EPL" />);
    const [epl, laliga, seriea] = tabs();
    expect(epl).toBeDisabled();
    expect(epl).toHaveAttribute("aria-selected", "true");
    expect(epl).toHaveAttribute("tabindex", "-1");
    expect(laliga).toHaveAttribute("tabindex", "0");
    expect(seriea).toHaveAttribute("tabindex", "-1");
    // 들어간 탭에서 화살표로 옮기면 비활성 탭은 건너뛴다
    laliga?.focus();
    key("ArrowRight");
    expect(seriea).toHaveFocus();
    expect(seriea).toHaveAttribute("tabindex", "0");
    expect(laliga).toHaveAttribute("tabindex", "-1");
  });

  it("제어 value가 목록에 없는 값이면 활성인 첫 탭(문서 순서)이 Tab 순서에 들고, 있는 값으로 바뀌면 그 탭만", () => {
    function Controlled({ value }: { value: string }) {
      return (
        <Tabs value={value}>
          <TabsList aria-label="제어">
            <TabsTrigger value="EPL" disabled>
              EPL
            </TabsTrigger>
            <TabsTrigger value="LALIGA">라리가</TabsTrigger>
            <TabsTrigger value="SERIEA">세리에A</TabsTrigger>
          </TabsList>
        </Tabs>
      );
    }
    const tabbable = () =>
      tabs()
        .filter((tab) => tab.getAttribute("tabindex") === "0")
        .map((tab) => tab.textContent);
    const { rerender } = render(<Controlled value="UCL" />);
    for (const tab of tabs()) {
      expect(tab).toHaveAttribute("aria-selected", "false");
    }
    expect(tabbable()).toEqual(["라리가"]);

    rerender(<Controlled value="SERIEA" />);
    expect(tabbable()).toEqual(["세리에A"]);

    rerender(<Controlled value="EPL" />);
    // 선택 탭(EPL)이 비활성 → 활성인 첫 탭 하나만
    expect(tabs()[0]).toHaveAttribute("aria-selected", "true");
    expect(tabbable()).toEqual(["라리가"]);
  });

  it("선택 탭은 대회 색 면 + 링 --ink, 비활성은 점선", () => {
    render(<Example disabled="SERIEA" />);
    const [epl, , seriea] = tabs();
    expect(epl?.className).toContain("aria-selected:bg-competition-epl");
    expect(epl?.className).toContain("aria-selected:[--ring:var(--ink)]");
    expect(seriea).toBeDisabled();
    expect(seriea?.className).toContain("disabled:border-dashed");
  });
});

describe("Tabs — 키보드(자동 활성화)", () => {
  it("→ 다음(끝에서 처음으로), ← 이전(처음에서 끝으로), 옮기면 바로 선택", () => {
    const onValueChange = vi.fn();
    render(<Example onValueChange={onValueChange} />);
    const [epl, laliga, seriea] = tabs();
    act(() => epl?.focus());
    key("ArrowRight");
    expect(laliga).toHaveFocus();
    expect(laliga).toHaveAttribute("aria-selected", "true");
    expect(laliga).toHaveAttribute("tabindex", "0");
    expect(epl).toHaveAttribute("tabindex", "-1");
    key("ArrowRight");
    expect(seriea).toHaveFocus();
    key("ArrowRight");
    expect(epl).toHaveFocus();
    key("ArrowLeft");
    expect(seriea).toHaveFocus();
    expect(onValueChange.mock.calls.map(([v]) => v)).toEqual([
      "LALIGA",
      "SERIEA",
      "EPL",
      "SERIEA",
    ]);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("세리에A 순위");
  });

  it("Home·End는 처음·끝, 다른 키는 무시", () => {
    render(<Example />);
    const [epl, , seriea] = tabs();
    act(() => epl?.focus());
    key("End");
    expect(seriea).toHaveFocus();
    key("Home");
    expect(epl).toHaveFocus();
    key("ArrowDown");
    expect(epl).toHaveFocus();
    expect(epl).toHaveAttribute("aria-selected", "true");
  });

  it("비활성 탭은 건너뛴다", () => {
    render(<Example disabled="LALIGA" />);
    const [epl, , seriea] = tabs();
    act(() => epl?.focus());
    key("ArrowRight");
    expect(seriea).toHaveFocus();
    key("ArrowLeft");
    expect(epl).toHaveFocus();
  });

  it("클릭으로 선택한다", () => {
    render(<Example />);
    const [, laliga] = tabs();
    fireEvent.click(laliga as HTMLElement);
    expect(laliga).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("라리가 순위");
  });
});

describe("Tabs — 수동 활성화", () => {
  it("화살표는 포커스만 옮기고 Enter·Space(클릭)로 선택한다", () => {
    render(<Example activation="manual" />);
    const [epl, laliga] = tabs();
    act(() => epl?.focus());
    key("ArrowRight");
    expect(laliga).toHaveFocus();
    expect(laliga).toHaveAttribute("aria-selected", "false");
    expect(epl).toHaveAttribute("aria-selected", "true");
    fireEvent.click(laliga as HTMLElement);
    expect(laliga).toHaveAttribute("aria-selected", "true");
  });
});

describe("Tabs — 제어 모드", () => {
  it("value가 바뀌어야 선택이 바뀐다", () => {
    function Controlled() {
      const [value, setValue] = useState("EPL");
      return (
        <>
          <Tabs
            value={value}
            onValueChange={(v) => setValue(v === "SERIEA" ? "EPL" : v)}
          >
            <TabsList aria-label="제어">
              <TabsTrigger value="EPL">EPL</TabsTrigger>
              <TabsTrigger value="LALIGA">라리가</TabsTrigger>
              <TabsTrigger value="SERIEA">세리에A</TabsTrigger>
            </TabsList>
          </Tabs>
          <output>{value}</output>
        </>
      );
    }
    render(<Controlled />);
    const [epl, laliga, seriea] = tabs();
    fireEvent.click(laliga as HTMLElement);
    expect(laliga).toHaveAttribute("aria-selected", "true");
    fireEvent.click(seriea as HTMLElement);
    // 부모가 SERIEA를 거부 → EPL로
    expect(epl).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("status")).toHaveTextContent("EPL");
    // 대회 지정이 없으면 선택 면은 잉크 반전
    expect(epl?.className).toContain("aria-selected:bg-ink");
  });

  it("Tabs 밖에서 쓰면 오류", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TabsTrigger value="x">x</TabsTrigger>)).toThrow(
      /<Tabs> 안에서만/,
    );
    spy.mockRestore();
  });
});
