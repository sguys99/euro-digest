/**
 * M4-15 — 결과 가리기(PRD FR-37 · D64 ④ · D67 ④, DECISIONS 'M4 미니 게이트' #1~#7, DESIGN §9.3 '결과 가림' 3행).
 * 가림 대상 판정(5줄 결과 줄) · 켜고 끄기(속성 · 안전한 저장소 · 펼친 표시 초기화) · 펼치기 위임(단위 · 포커스) · 표식 마크업 · CSS 규칙.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TodayBrief } from "@/components/brief/today-brief";
import {
  SpoilerCellButton,
  SpoilerFlap,
  SpoilerHatch,
  SpoilerVeil,
} from "@/components/spoiler/spoiler-parts";
import { SpoilerSwitch } from "@/components/spoiler/spoiler-switch";
import { buildBriefView, type BriefInput } from "@/lib/brief-view";
import { createSafeStorage } from "@/lib/safe-storage";
import {
  briefSpoilerPlan,
  handleSpoilerClick,
  isBriefResultLine,
  resetRevealed,
  revealFocusTarget,
  setSpoiler,
  SPOIL_OPEN,
  spoilerOn,
  spoilerToastMessage,
} from "@/lib/spoiler";

import { appliedClasses } from "./support/class-conflicts";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toast", () => ({ toast: toastMock }));

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const root = () => document.documentElement;

beforeEach(() => {
  root().removeAttribute("data-spoiler");
  toastMock.mockClear();
});
afterEach(() => {
  root().removeAttribute("data-spoiler");
  document.body.innerHTML = "";
});

describe("5줄 결과 줄 판정 — 근거 접두 m(경기) · s(순위 변동) · k(한국 선수)", () => {
  it.each([
    [["m560631"], true],
    [["sPL"], true],
    [["k927"], true],
    [["x12"], false],
    [["x12", "m1"], true],
  ])("refs %j → %s", (refs, expected) => {
    expect(isBriefResultLine(refs)).toBe(expected);
  });

  it("근거를 모르는 입력은 가리는 쪽(새는 것보다 한 번 더 누르는 편)", () => {
    expect(isBriefResultLine(undefined)).toBe(true);
  });

  it("모든 줄이 결과면 안내 띠('모두 보기'), 하나라도 아니면 띠 없음 · 줄 0개면 띠 없음", () => {
    expect(briefSpoilerPlan([{ refs: ["m1"] }, { refs: ["sPL"] }])).toEqual({
      results: [true, true],
      all: true,
    });
    expect(briefSpoilerPlan([{ refs: ["m1"] }, { refs: ["x1"] }]).all).toBe(
      false,
    );
    expect(briefSpoilerPlan([]).all).toBe(false);
  });

  it("화면 모델 — 줄마다 result, 블록 allResults(empty는 줄 없음)", () => {
    const brief: BriefInput = {
      date: "2026-11-02",
      mode: "llm",
      lines: [
        {
          text: "아스널이 리버풀 원정에서 1-0으로 이겼다.",
          ai: true,
          refs: ["m560631"],
        },
        { text: "아스널이 승점 24로 선두다.", ai: true, refs: ["sPL"] },
      ],
    };
    const view = buildBriefView(brief);
    expect(view.rows.map((r) => r.result)).toEqual([true, true]);
    expect(view.allResults).toBe(true);
    expect(
      buildBriefView({ date: "2026-11-02", mode: "empty", lines: [] })
        .allResults,
    ).toBe(false);
  });
});

describe("켜고 끄기 — <html data-spoiler> + ed-spoiler(안전한 저장소) + 펼친 표시 초기화", () => {
  it("켜면 속성 on · 저장 on, 끄면 속성·저장 키를 지운다", () => {
    const storage = memoryStorage();
    const safe = createSafeStorage(() => storage);
    expect(setSpoiler(root(), document, safe, true)).toBe(true);
    expect(root().getAttribute("data-spoiler")).toBe("on");
    expect(storage.map.get("ed-spoiler")).toBe("on");
    expect(spoilerOn(root())).toBe(true);
    expect(setSpoiler(root(), document, safe, false)).toBe(true);
    expect(root().hasAttribute("data-spoiler")).toBe(false);
    expect(storage.map.has("ed-spoiler")).toBe(false);
  });

  it("저장이 막혀도 이번 방문에는 적용된다(false — 메모리에만)", () => {
    const safe = createSafeStorage(() => {
      throw new Error("blocked");
    });
    expect(setSpoiler(root(), document, safe, true)).toBe(false);
    expect(root().getAttribute("data-spoiler")).toBe("on");
    expect(safe.get("ed-spoiler")).toBe("on");
  });

  it("켜고 끌 때 펼친 단위(data-spoil-open)를 모두 접는다", () => {
    document.body.innerHTML =
      '<div data-spoil="stamp" data-spoil-open=""></div><li data-spoil="tear" data-spoil-open=""></li>';
    resetRevealed(document);
    expect(document.querySelectorAll(`[${SPOIL_OPEN}]`)).toHaveLength(0);
    document.body.innerHTML =
      '<div data-spoil="stamp" data-spoil-open=""></div>';
    setSpoiler(root(), document, createSafeStorage(memoryStorage), true);
    expect(document.querySelectorAll(`[${SPOIL_OPEN}]`)).toHaveLength(0);
  });

  it("토스트 문구(DESIGN §9.2 — D0 혼합안)", () => {
    expect(spoilerToastMessage(true)).toBe(
      "결과 가리기를 켰어요. 결과가 담긴 줄과 카드를 접었어요.",
    );
    expect(spoilerToastMessage(false)).toBe("결과 가리기를 껐어요.");
  });
});

describe("펼치기 위임 — 가장 가까운 단위만 · 드러난 값으로 포커스", () => {
  function setup(html: string) {
    document.body.innerHTML = html;
    root().setAttribute("data-spoiler", "on");
  }

  it("칸 '보기' → 그 칸만 펼치고 값에 tabindex=-1 + 포커스(이웃 칸은 그대로)", () => {
    setup(`
      <span id="a" data-spoil="stamp"><span data-slot="result-value">W 6-1</span><button data-spoil-mask data-spoil-reveal>보기</button></span>
      <span id="b" data-spoil="stamp"><span data-slot="result-value">L 0-2</span><button data-spoil-mask data-spoil-reveal>보기</button></span>`);
    const button = document.querySelector<HTMLButtonElement>("#a button")!;
    expect(handleSpoilerClick({ target: button })).toBe(true);
    expect(document.getElementById("a")!.hasAttribute(SPOIL_OPEN)).toBe(true);
    expect(document.getElementById("b")!.hasAttribute(SPOIL_OPEN)).toBe(false);
    const value = document.querySelector("#a [data-slot='result-value']")!;
    expect(value.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(value);
  });

  it("카드 — 값 안의 링크(원제목)로 포커스, 버튼 안 글자를 눌러도 동작", () => {
    setup(`
      <article data-spoil="tear"><h3 data-spoil-value><a href="https://example.com">Title</a></h3>
      <button data-spoil-mask data-spoil-reveal><span id="t">결과 가림</span></button></article>`);
    handleSpoilerClick({ target: document.getElementById("t") });
    expect(document.activeElement?.tagName).toBe("A");
  });

  it("data-spoil-focus가 있으면 그 요소(5줄 문장 — 안의 AI 라벨 링크가 아니라 문장)", () => {
    setup(`
      <li data-spoil="tear"><p data-spoil-value data-spoil-focus>문장 <a href="/about/#ai">AI 작성</a></p>
      <button data-spoil-mask data-spoil-reveal>보기</button></li>`);
    const scope = document.querySelector("li")!;
    expect(revealFocusTarget(scope)?.tagName).toBe("P");
    handleSpoilerClick({ target: document.querySelector("button") });
    expect(document.activeElement?.tagName).toBe("P");
  });

  it("바깥 단위('모두 보기' · '변동 보기')를 펴면 안쪽 단위는 그대로 두고 바깥만 연다(CSS가 안쪽까지 드러낸다)", () => {
    setup(`
      <section data-spoil="tear"><div data-spoil-mask><button id="all" data-spoil-reveal>모두 보기</button></div>
      <ol><li data-spoil="tear"><p data-spoil-value data-spoil-focus>1</p><button data-spoil-mask data-spoil-reveal>보기</button></li></ol></section>`);
    handleSpoilerClick({ target: document.getElementById("all") });
    expect(document.querySelector("section")!.hasAttribute(SPOIL_OPEN)).toBe(
      true,
    );
    expect(document.activeElement?.tagName).toBe("P");
  });

  it("가림이 꺼져 있거나 '보기'가 아닌 곳은 무시", () => {
    document.body.innerHTML =
      '<span data-spoil="stamp"><button data-spoil-reveal>보기</button><a id="x" href="#">x</a></span>';
    expect(
      handleSpoilerClick({ target: document.querySelector("button") }),
    ).toBe(false);
    root().setAttribute("data-spoiler", "on");
    expect(handleSpoilerClick({ target: document.getElementById("x") })).toBe(
      false,
    );
    expect(handleSpoilerClick({ target: null })).toBe(false);
  });
});

describe("표식 마크업 — 모두 data-spoil-mask(꺼져 있으면 CSS가 숨김)", () => {
  it("띠: 버튼 + '결과 가림' + 설명(descId) + '보기'", () => {
    render(<SpoilerFlap descId="c_1-fl">경기 결과 제목</SpoilerFlap>);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-spoil-mask");
    expect(button).toHaveAttribute("data-spoil-reveal");
    expect(button).toHaveAttribute("aria-describedby", "c_1-fl");
    expect(button).toHaveTextContent("결과 가림경기 결과 제목보기");
  });

  it("결과 가림 칸: 이름 '{날짜} {상대}전 결과 보기' — 보이는 '보기'를 포함(WCAG 2.5.3), 44×64(넓으면 112)", () => {
    const { rerender } = render(
      <SpoilerCellButton label="10.29 마그데부르크전 결과 보기" />,
    );
    const button = screen.getByRole("button", {
      name: "10.29 마그데부르크전 결과 보기",
    });
    expect(button).toHaveTextContent("보기");
    // 몸은 globals.css §14 `spoil-cell`(M5-07) — 최소 높이 44px는 그 묶음 안
    expect(button.className).toContain("spoil-cell");
    expect(appliedClasses("spoil-cell")).toContain("min-h-11");
    expect(button.className).toContain("min-w-16");
    rerender(<SpoilerCellButton wide label="최근 경기 5경기 결과 보기" />);
    expect(screen.getByRole("button").className).toContain("min-w-28");
  });

  it("빗금 자리: 상자는 aria-hidden, 화면 밖 글자가 뜻", () => {
    const { container } = render(
      <SpoilerHatch sr="변동 가림" box="h-3.25 w-6.5" />,
    );
    const mask = container.firstElementChild!;
    expect(mask).toHaveAttribute("data-spoil-mask");
    expect(mask.querySelector('[aria-hidden="true"]')?.className).toContain(
      "w-6.5",
    );
    expect(mask).toHaveTextContent("변동 가림");
  });

  it("안내 띠: '결과 가리기 켜짐.' + 안내 + 보조 버튼(이름에 대상)", () => {
    render(
      <SpoilerVeil action="변동 보기" actionLabel="라리가 순위 변동 보기">
        순위 변동과 최근 5경기를 가렸어요.
      </SpoilerVeil>,
    );
    expect(
      screen.getByRole("button", { name: "라리가 순위 변동 보기" }),
    ).toHaveAttribute("data-spoil-reveal");
    expect(
      screen.getByText("결과 가리기 켜짐.").closest("[data-spoil-mask]"),
    ).not.toBeNull();
  });
});

describe("오늘의 5줄 — 결과 줄 띠 · 모두 결과면 안내 띠", () => {
  const brief = (refs: string[][]): BriefInput => ({
    date: "2026-11-02",
    mode: "llm",
    lines: refs.map((r, i) => ({
      text: `${i + 1}번 문장 1-0`,
      ai: true,
      refs: r,
    })),
  });

  it("모두 결과: 블록이 바깥 단위 + 안내 띠 'N줄 모두 경기 결과라 가렸어요.' + 줄마다 띠", () => {
    const { container } = render(
      <TodayBrief brief={brief([["m1"], ["m2"], ["sPL"]])} />,
    );
    const section = container.querySelector("section")!;
    expect(section).toHaveAttribute("data-spoil", "tear");
    expect(section).toHaveTextContent("3줄 모두 경기 결과라 가렸어요.");
    expect(
      screen.getByRole("button", { name: "오늘의 5줄 모두 보기" }),
    ).toBeInTheDocument();
    const rows = container.querySelectorAll('[data-slot="brief-row"]');
    expect(
      [...rows].every((r) => r.getAttribute("data-spoil") === "tear"),
    ).toBe(true);
    expect(rows[1]).toHaveTextContent("결과 가림2번 줄보기");
    // 문장(+ AI 라벨)이 가릴 값 · 포커스 대상
    const text = rows[0]!.querySelector('[data-slot="brief-text"]')!;
    expect(text).toHaveAttribute("data-spoil-value");
    expect(text).toHaveAttribute("data-spoil-focus");
    expect(text.querySelector('a[href*="#ai"]')).not.toBeNull();
  });

  it("결과가 아닌 줄이 있으면 안내 띠 없음 · 그 줄은 가리지 않는다", () => {
    const { container } = render(
      <TodayBrief brief={brief([["m1"], ["x1"]])} />,
    );
    expect(container.querySelector('[data-slot="spoiler-veil"]')).toBeNull();
    expect(container.querySelector("section")).not.toHaveAttribute(
      "data-spoil",
    );
    const rows = container.querySelectorAll('[data-slot="brief-row"]');
    expect(rows[0]).toHaveAttribute("data-spoil", "tear");
    expect(rows[1]).not.toHaveAttribute("data-spoil");
    expect(rows[1]!.querySelector("[data-spoil-reveal]")).toBeNull();
  });
});

describe("스위치 섬 — role=switch · 토스트 · 위임 설치", () => {
  it("누르면 켜고(속성 · 토스트 · aria-checked) 다시 누르면 끈다, '보기' 위임이 문서에 걸린다", () => {
    render(<SpoilerSwitch />);
    const sw = screen.getByRole("switch", { name: "결과 가리기" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    act(() => {
      fireEvent.click(sw);
    });
    expect(root().getAttribute("data-spoiler")).toBe("on");
    expect(toastMock).toHaveBeenLastCalledWith({
      kind: "알림",
      message: "결과 가리기를 켰어요. 결과가 담긴 줄과 카드를 접었어요.",
    });

    // 위임 — 섬 밖의 '보기'
    const host = document.createElement("div");
    host.innerHTML =
      '<span data-spoil="stamp"><span data-slot="result-value">1-0</span><button data-spoil-mask data-spoil-reveal>보기</button></span>';
    document.body.append(host);
    fireEvent.click(host.querySelector("button")!);
    expect(host.firstElementChild).toHaveAttribute(SPOIL_OPEN);

    act(() => {
      fireEvent.click(sw);
    });
    expect(root().hasAttribute("data-spoiler")).toBe(false);
    expect(host.firstElementChild).not.toHaveAttribute(SPOIL_OPEN);
    expect(toastMock).toHaveBeenLastCalledWith({
      kind: "알림",
      message: "결과 가리기를 껐어요.",
    });
    host.remove();
  });

  it("선택 칸 모양은 aria-checked가 아니라 <html> 속성(spoiler-on: 변형) — 첫 페인트 전 상태가 바로 보인다", () => {
    render(<SpoilerSwitch />);
    const [off, on] = [...screen.getByRole("switch").querySelectorAll("span")];
    expect(off?.className).toContain("spoiler-on:bg-transparent");
    expect(on?.className).toContain("spoiler-on:bg-ticket-fg");
  });
});

describe("CSS(globals.css §13) — 블러 없이 display:none, 첫 페인트부터", () => {
  const css = readFileSync(path.resolve("src/app/globals.css"), "utf8");
  const section = css.slice(css.indexOf("── 13. 결과 가리기"));

  it("값: 켜졌고 펼친 단위 밖이면 display:none", () => {
    expect(section).toMatch(
      /:root\[data-spoiler="on"\]\s*:is\(\[data-slot="result-value"\], \[data-spoil-value\]\):not\(\s*\[data-spoil-open\] \*\s*\)\s*\{\s*display: none;/,
    );
  });

  it("표식: 꺼져 있거나 펼친 단위 안이면 display:none", () => {
    expect(section).toMatch(
      /:root:not\(\[data-spoiler="on"\]\) \[data-spoil-mask\],\s*\[data-spoil-open\] \[data-spoil-mask\]\s*\{\s*display: none;/,
    );
  });

  it("블러·투명도로 가리지 않는다 · 모션은 찍힘(stamp)·뜯김(tear) 토큰", () => {
    expect(section).not.toMatch(/blur|opacity|filter/);
    expect(section).toContain("animation: var(--animate-stamp)");
    expect(section).toContain("animation: var(--animate-tear)");
  });

  it("경기 줄 가운데 칸은 켜졌을 때만 64px", () => {
    expect(section).toMatch(
      /:root\[data-spoiler="on"\] \.match-row \{\s*grid-template-columns: 40px minmax\(0, 1fr\) 64px minmax\(0, 1fr\);/,
    );
  });

  it("spoiler-on: 변형이 정의돼 있다", () => {
    expect(css).toContain(
      '@custom-variant spoiler-on (:root[data-spoiler="on"] &);',
    );
  });
});
