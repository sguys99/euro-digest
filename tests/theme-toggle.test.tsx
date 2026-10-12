/**
 * 테마 토글 (D0-12, DESIGN.md §8) — 3상태 순환·저장·aria-label·theme-color 메타·토스트, 저장 실패에도 동작.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle, themeToggleLabel } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/toast";
import { THEME_COLOR_METAS, THEME_STORAGE_KEY } from "@/lib/theme";

/** layout.tsx가 <head>에 렌더하는 theme-color 메타 2개(THEME_COLOR_METAS 그대로) */
function addThemeColorMetas(): HTMLMetaElement[] {
  return THEME_COLOR_METAS.map(({ media, content }) => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", content);
    meta.setAttribute("media", media);
    document.head.appendChild(meta);
    return meta;
  });
}

let metas: HTMLMetaElement[] = [];

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
  metas = addThemeColorMetas();
});

afterEach(() => {
  for (const meta of metas) meta.remove();
  vi.restoreAllMocks();
});

function button(): HTMLElement {
  return screen.getByRole("button", { name: /^테마: / });
}

/** 클릭 후 MutationObserver(마이크로태스크) → 다시 그리기까지 기다린다 */
async function click(): Promise<void> {
  await act(async () => {
    fireEvent.click(button());
    await Promise.resolve();
  });
}

describe("ThemeToggle", () => {
  it("시스템 → 라이트 → 다크 → 시스템: 속성·저장·aria-label·theme-color media", async () => {
    render(<ThemeToggle announce={false} />);
    expect(button()).toHaveAccessibleName("테마: 시스템 설정 (눌러서 바꾸기)");

    const steps: Array<
      [string | null, string | null, string, Array<string | null>]
    > = [];
    for (let i = 0; i < 3; i++) {
      await click();
      steps.push([
        document.documentElement.getAttribute("data-theme"),
        localStorage.getItem(THEME_STORAGE_KEY),
        button().getAttribute("aria-label") ?? "",
        metas.map((m) => m.getAttribute("media")),
      ]);
    }
    expect(steps).toEqual([
      ["light", "light", themeToggleLabel("light"), ["all", "not all"]],
      ["dark", "dark", themeToggleLabel("dark"), ["not all", "all"]],
      [
        null,
        null,
        themeToggleLabel("system"),
        ["(prefers-color-scheme: light)", "(prefers-color-scheme: dark)"],
      ],
    ]);
  });

  it("초기 스크립트가 단 속성(재방문)을 읽어 시작한다", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<ThemeToggle announce={false} />);
    expect(button()).toHaveAccessibleName("테마: 다크 (눌러서 바꾸기)");
    await click();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("다른 곳에서 속성이 바뀌어도 이름이 따라간다", async () => {
    render(<ThemeToggle announce={false} />);
    await act(async () => {
      document.documentElement.setAttribute("data-theme", "light");
      await Promise.resolve();
    });
    expect(button()).toHaveAccessibleName("테마: 라이트 (눌러서 바꾸기)");
  });

  it("localStorage가 막혀도 이번 방문에는 바뀌고 오류를 던지지 않는다", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("차단", "SecurityError");
    });
    render(<ThemeToggle announce={false} />);
    await expect(click()).resolves.toBeUndefined();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(button()).toHaveAccessibleName("테마: 라이트 (눌러서 바꾸기)");
  });

  it("바꾸면 토스트 '테마: 라이트'", async () => {
    render(
      <>
        <ThemeToggle />
        <Toaster />
      </>,
    );
    await click();
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(
      "테마: 라이트",
    );
  });

  it("44×44 아이콘 버튼(반쯤 채운 원 아이콘은 장식)", () => {
    render(<ThemeToggle />);
    expect(button().className.split(" ")).toEqual(
      expect.arrayContaining(["h-11", "min-w-11"]),
    );
    expect(button().querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
