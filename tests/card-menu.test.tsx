/**
 * M1-35 — 카드 메뉴(공유하기 · 오류 신고↗)와 피드 섬의 메뉴 동작 (src/components/news/card-menu.tsx · feed-island.tsx ·
 * src/lib/news/card-menu-dom.ts, PRD FR-34·FR-36, DESIGN.md §9.3 카드 메뉴, APG Menu Button).
 *
 * 마크업(카드마다 버튼만 · 피드마다 메뉴 하나 · 접근성 속성) → 연 카드로 옮기기(공유 URL = 그 호 날짜 페이지 앵커 · 오류 신고 폼 = 카드 ID·
 * 발행 날짜 — 빌더 결과와 같다 · 닫으면 원래 자리로) → 여닫기(하나만 열림 · 바깥 클릭·포커스 · 뒤로 가기) → 키보드(↓↑ Home End · Esc 복귀 ·
 * Tab 닫기 · 버튼에서 ↓↑로 열기 · 처리한 Esc는 defaultPrevented) → 공유(토스트 · 복사 실패 대체 경로 포커스).
 * 실제 위치·44px·가로 넘침·axe는 e2e(tests/e2e/card-menu.spec.ts · 견본 news-cards.spec).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewsFeed } from "@/components/news-feed";
import {
  handleCardMenuClick,
  SHARE_FALLBACK_TOAST_MS,
  shareCardLink,
} from "@/components/news/feed-island";
import { Toaster } from "@/components/ui/toast";
import {
  closeCardMenu,
  menuButtonOf,
  menuKeyTarget,
  openCardMenuButton,
  withReportCard,
  withShareCard,
} from "@/lib/news/card-menu-dom";
import { cardShareUrl, summaryErrorIssueUrl } from "@/lib/paths";
import { NewsFileSchema } from "@/lib/schema/news";

const sample = NewsFileSchema.parse(
  JSON.parse(readFileSync(path.resolve("fixtures/news-sample.json"), "utf8")),
);
const FIRST = sample.cards[0]?.id ?? "";
const SECOND = sample.cards[1]?.id ?? "";
const MENU_ID = "feed-menu";

function menuButton(id: string): HTMLButtonElement {
  const card = document.getElementById(id);
  if (!card) throw new Error(`${id} 없음`);
  return within(card).getByRole("button", { name: "카드 메뉴" });
}

function feedMenu(): HTMLElement {
  const el = document.getElementById(MENU_ID);
  if (!el) throw new Error("피드 메뉴 없음");
  return el;
}

const clipboardDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

beforeEach(() => {
  // 앞 테스트에서 열린 채 남은 메뉴 상태(모듈 변수)를 비운다
  closeCardMenu();
});

afterEach(() => {
  // 열린 메뉴를 원래 자리로 돌려보낸 뒤 언마운트한다(setup-dom cleanup보다 먼저 — React가 지울 노드가 제자리에 있게)
  closeCardMenu();
  if (clipboardDescriptor)
    Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else delete (navigator as { clipboard?: unknown }).clipboard;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("CardMenu 마크업 — 카드마다 버튼, 피드마다 메뉴 하나", () => {
  it("버튼: aria-label·aria-describedby(제목)·aria-haspopup=menu·aria-expanded=false·aria-controls(피드 메뉴)·data-card-id", () => {
    render(<NewsFeed news={sample} />);
    for (const card of sample.cards) {
      const button = menuButton(card.id);
      expect(button).toHaveAttribute("type", "button");
      expect(button).toHaveAttribute("id", `${card.id}-mb`);
      expect(button).toHaveAttribute("aria-describedby", `${card.id}-t`);
      // 설명 = 카드 제목(장식 ↗ 제외 — 45개 "카드 메뉴" 버튼을 구분)
      expect(button).toHaveAccessibleDescription(
        `${card.t.trim()} (원문 ${card.src[0]?.n}, 새 창)`,
      );
      expect(button).toHaveAttribute("aria-haspopup", "menu");
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(button).toHaveAttribute("aria-controls", MENU_ID);
      expect(button).toHaveAttribute("data-card-id", card.id);
    }
  });

  it("메뉴는 피드에 하나(목록 뒤, hidden) — 카드 안에는 메뉴 마크업이 없다", () => {
    render(<NewsFeed news={sample} />);
    const menus = document.querySelectorAll('[role="menu"]');
    expect(menus).toHaveLength(1);
    const menu = feedMenu();
    expect(menu).toHaveAttribute("hidden");
    expect(menu.previousElementSibling?.id).toBe("feed");
    expect(document.querySelector("#feed [role='menu']")).toBeNull();
    const items = within(menu).getAllByRole("menuitem", { hidden: true });
    expect(items.map((i) => i.textContent)).toEqual([
      "공유하기",
      "오류 신고↗(새 창)",
    ]);
    for (const item of items) expect(item).toHaveAttribute("tabindex", "-1");
    // 처음 값은 첫 카드 — 연 카드로 바꾼다
    expect(items[0]).toHaveAttribute(
      "data-share",
      cardShareUrl(sample.date, FIRST),
    );
    expect(items[1]).toHaveAttribute(
      "href",
      summaryErrorIssueUrl(FIRST, sample.date),
    );
    expect(items[1]).toHaveAttribute("target", "_blank");
    expect(items[1]).toHaveAttribute("rel", "noopener");
    expect(items[1]?.querySelector("[aria-hidden='true']")?.textContent).toBe(
      "↗",
    );
    expect(items[1]?.querySelector(".sr-only")?.textContent).toBe("(새 창)");
  });

  it("이슈 양식 필드 id(card·date)가 링크 쿼리 키와 같다 · 안내 문구는 실제 UI(카드 메뉴 → 공유하기)", () => {
    const form = readFileSync(
      path.resolve(".github/ISSUE_TEMPLATE/summary-error.yml"),
      "utf8",
    );
    expect(form).toMatch(/^\s+id: card$/m);
    expect(form).toMatch(/^\s+id: date$/m);
    expect(form).toContain("카드 메뉴(⋯) → **공유하기**");
  });

  it("버튼은 혼합안 .ibtn--sm(44×44 · margin −8/−10/−10/0 · --ink-2 · z 1), 메뉴는 오른쪽 기준 팝오버(z 5)", () => {
    render(<NewsFeed news={sample} />);
    const button = menuButton(FIRST);
    expect(button.className.split(" ")).toEqual(
      expect.arrayContaining([
        "h-11",
        "min-w-11",
        "-mt-2",
        "-mr-2.5",
        "-mb-2.5",
        "text-ink-2",
        "z-1",
        "hover:bg-current/12",
      ]),
    );
    expect(button.parentElement?.className.split(" ")).toEqual(
      expect.arrayContaining(["relative", "ml-auto", "flex-none"]),
    );
    expect(feedMenu().className.split(" ")).toEqual(
      expect.arrayContaining([
        "absolute",
        "top-9",
        "-right-2.5",
        "z-5",
        "min-w-40",
        "border-ink",
        "bg-popover",
        "shadow-print",
      ]),
    );
  });

  it("뉴스 카드 규칙(D23·D24) — 메뉴에 'AI 작성'·요약 없음", () => {
    render(<NewsFeed news={sample} />);
    expect(feedMenu().textContent).not.toContain("AI");
  });
});

describe("피드 섬 — 연 카드로 옮기기·여닫기·키보드", () => {
  function setup(news = sample) {
    return render(
      <>
        <NewsFeed news={news} />
        <button type="button">바깥</button>
        <Toaster />
      </>,
    );
  }

  it("연 카드마다 메뉴가 그 카드의 메뉴 묶음(버튼 뒤)으로 오고, 공유 URL·이슈 폼 URL이 그 카드 ID — 빌더 결과와 같다(FR-34·FR-36)", () => {
    setup({ ...sample, date: "2026-10-23" });
    for (const card of sample.cards) {
      const button = menuButton(card.id);
      fireEvent.click(button);
      const menu = feedMenu();
      expect(menu.parentElement).toBe(button.parentElement);
      expect(menu.previousElementSibling).toBe(button);
      expect(menu).toHaveAttribute("aria-labelledby", button.id);
      const [share, report] = within(menu).getAllByRole("menuitem");
      expect(share).toHaveAttribute(
        "data-share",
        cardShareUrl("2026-10-23", card.id),
      );
      expect(report).toHaveAttribute(
        "href",
        summaryErrorIssueUrl(card.id, "2026-10-23"),
      );
      fireEvent.click(button);
      // 닫으면 원래 자리(목록 뒤)로
      expect(feedMenu().previousElementSibling?.id).toBe("feed");
      expect(feedMenu()).toHaveAttribute("hidden");
    }
    expect(
      new URL(cardShareUrl("2026-10-23", SECOND)).pathname.endsWith(
        "/news/2026-10-23/",
      ),
    ).toBe(true);
  });

  it("버튼을 누르면 열리고 첫 항목(공유하기)으로 포커스, 다시 누르면 닫힌다", () => {
    setup();
    const button = menuButton(FIRST);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(feedMenu()).not.toHaveAttribute("hidden");
    expect(openCardMenuButton()).toBe(button);
    expect(document.activeElement?.textContent).toBe("공유하기");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(feedMenu()).toHaveAttribute("hidden");
    expect(openCardMenuButton()).toBeNull();
  });

  it("한 번에 하나만 — 다른 카드 메뉴를 열면 앞 버튼은 닫힘(aria-expanded는 연 버튼만 true)", () => {
    setup();
    fireEvent.click(menuButton(FIRST));
    fireEvent.click(menuButton(SECOND));
    expect(menuButton(FIRST)).toHaveAttribute("aria-expanded", "false");
    expect(menuButton(SECOND)).toHaveAttribute("aria-expanded", "true");
    expect(feedMenu().parentElement).toBe(menuButton(SECOND).parentElement);
    expect(
      document.querySelectorAll('[data-menu-button][aria-expanded="true"]'),
    ).toHaveLength(1);
  });

  it("↓↑ 순환 · Home · End로 항목을 옮긴다", () => {
    setup();
    fireEvent.click(menuButton(FIRST));
    const [share, report] = within(feedMenu()).getAllByRole("menuitem");
    fireEvent.keyDown(share as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(report);
    fireEvent.keyDown(report as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(share);
    fireEvent.keyDown(share as HTMLElement, { key: "ArrowUp" });
    expect(document.activeElement).toBe(report);
    fireEvent.keyDown(report as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(share);
    fireEvent.keyDown(share as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(report);
  });

  it("Esc는 닫고 버튼으로 복귀 · defaultPrevented — 문서의 다른 Esc 처리(375 달력 시트)는 건너뛴다", () => {
    setup();
    const seen: boolean[] = [];
    const onDocumentEsc = (event: KeyboardEvent) =>
      seen.push(event.defaultPrevented);
    document.addEventListener("keydown", onDocumentEsc);
    try {
      const button = menuButton(FIRST);
      fireEvent.click(button);
      fireEvent.keyDown(document.activeElement as HTMLElement, {
        key: "Escape",
      });
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(feedMenu()).toHaveAttribute("hidden");
      expect(document.activeElement).toBe(button);
      expect(seen).toEqual([true]);
    } finally {
      document.removeEventListener("keydown", onDocumentEsc);
    }
  });

  it("Tab은 닫고 버튼으로 포커스를 옮긴다(기본 동작이 버튼 다음 요소로 이어 감)", () => {
    setup();
    const button = menuButton(FIRST);
    fireEvent.click(button);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(button);
  });

  it("버튼에서 ↓는 첫 항목, ↑는 끝 항목으로 연다 · 열린 채 버튼에서 Esc는 닫기만", () => {
    setup();
    const button = menuButton(FIRST);
    button.focus();
    fireEvent.keyDown(button, { key: "ArrowUp" });
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement?.textContent).toMatch(/^오류 신고/);
    button.focus();
    fireEvent.keyDown(button, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(button, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe("공유하기");
  });

  it("링크 항목은 Space로도 실행(APG) — 클릭으로 이어지고 메뉴를 닫아 버튼으로", () => {
    setup();
    fireEvent.click(menuButton(FIRST));
    const report = within(feedMenu()).getByRole("menuitem", {
      name: /^오류 신고/,
    });
    const onClick = vi.fn((event: Event) => event.preventDefault());
    report.addEventListener("click", onClick);
    report.focus();
    fireEvent.keyDown(report, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(menuButton(FIRST)).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(menuButton(FIRST));
  });

  it("바깥 클릭·바깥으로 간 포커스·뒤로 가기(popstate)면 닫힌다(포커스는 옮기지 않음)", () => {
    setup();
    const outside = screen.getByRole("button", { name: "바깥" });
    fireEvent.click(menuButton(FIRST));
    fireEvent.click(document.body);
    expect(menuButton(FIRST)).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(menuButton(FIRST));
    act(() => outside.focus());
    expect(menuButton(FIRST)).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(outside);

    fireEvent.click(menuButton(FIRST));
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(menuButton(FIRST)).toHaveAttribute("aria-expanded", "false");
    expect(feedMenu().previousElementSibling?.id).toBe("feed");
  });

  it("메뉴 안 클릭(항목 사이 테두리 등)으로는 닫히지 않는다 · 포커스가 body일 때 Esc는 닫고 버튼으로", () => {
    setup();
    const button = menuButton(FIRST);
    fireEvent.click(button);
    fireEvent.click(feedMenu());
    expect(button).toHaveAttribute("aria-expanded", "true");
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(button);
  });

  it("공유하기 → 닫고 버튼으로 복귀, 클립보드에 그 카드의 날짜 페이지 URL → 토스트 '공유 · 링크를 복사했어요'", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    setup();
    const button = menuButton(SECOND);
    fireEvent.click(button);
    await act(async () => {
      fireEvent.click(
        within(feedMenu()).getByRole("menuitem", { name: "공유하기" }),
      );
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(cardShareUrl(sample.date, SECOND));
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(button);
    expect(
      document.querySelector('[aria-live="polite"][aria-atomic="true"]')
        ?.textContent,
    ).toBe("공유링크를 복사했어요");
  });

  it("복사가 막히면 '링크 열기'로 포커스(대체 경로 — 키보드로 바로) · 닫기 버튼으로 닫으면 메뉴 버튼으로 복귀", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("NotAllowedError")) },
      configurable: true,
    });
    setup();
    const button = menuButton(FIRST);
    fireEvent.click(button);
    await act(async () => {
      fireEvent.click(
        within(feedMenu()).getByRole("menuitem", { name: "공유하기" }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    const live = document.querySelector(
      '[aria-live="polite"][aria-atomic="true"]',
    ) as HTMLElement;
    expect(live).toHaveTextContent("링크를 복사하지 못했어요");
    expect(document.activeElement).toBe(
      within(live).getByRole("button", { name: "링크 열기" }),
    );
    fireEvent.click(within(live).getByRole("button", { name: "알림 닫기" }));
    expect(live).toBeEmptyDOMElement();
    expect(document.activeElement).toBe(button);
  });
});

describe("shareCardLink — 결과별 토스트", () => {
  function fakeWindow(nav: Partial<Navigator>, coarse = false) {
    const assign = vi.fn();
    const win = {
      navigator: nav,
      matchMedia: (q: string) => ({
        matches: q === "(pointer: coarse)" && coarse,
      }),
      location: { assign },
    } as unknown as Window;
    return { win, assign };
  }
  const URL_ = cardShareUrl("2026-10-23", "c_8f3a1b2c4d");

  it("복사가 막히면 '링크를 복사하지 못했어요' + '링크 열기'(같은 출처의 날짜 페이지 앵커로 이동) + 닫기 버튼, 6초", async () => {
    vi.useFakeTimers();
    render(<Toaster />);
    const { win, assign } = fakeWindow({
      clipboard: {
        writeText: () => Promise.reject(new Error("NotAllowedError")),
      } as unknown as Clipboard,
    });
    await act(async () => {
      await expect(shareCardLink(URL_, win)).resolves.toBe("failed");
    });
    const live = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live).toHaveTextContent("공유링크를 복사하지 못했어요링크 열기");
    expect(
      within(live).getByRole("button", { name: "알림 닫기" }),
    ).toBeInTheDocument();
    fireEvent.click(within(live).getByRole("button", { name: "링크 열기" }));
    expect(assign).toHaveBeenCalledWith(
      "/euro-digest/news/2026-10-23/#c_8f3a1b2c4d",
    );
    expect(SHARE_FALLBACK_TOAST_MS).toBe(6000);
  });

  it("공유 시트(터치 기기)·취소는 토스트 없음", async () => {
    render(<Toaster />);
    const shared = fakeWindow({ share: () => Promise.resolve() }, true);
    await act(async () => {
      await expect(shareCardLink(URL_, shared.win)).resolves.toBe("shared");
    });
    const abort = new Error("cancel");
    abort.name = "AbortError";
    const cancelled = fakeWindow({ share: () => Promise.reject(abort) }, true);
    await act(async () => {
      await expect(shareCardLink(URL_, cancelled.win)).resolves.toBe(
        "cancelled",
      );
    });
    expect(
      document.querySelector('[aria-live="polite"]'),
    ).toBeEmptyDOMElement();
  });
});

describe("card-menu-dom", () => {
  function menu(): HTMLElement {
    const el = document.createElement("div");
    el.innerHTML =
      '<span data-card-menu><button id="b" data-menu-button data-card-id="c_0000000002" aria-controls="m" aria-expanded="false"></button></span>' +
      '<span id="m" role="menu" hidden><button role="menuitem" data-share="https://x.test/euro-digest/news/2026-10-23/#c_0000000001">a</button>' +
      '<a role="menuitem" href="https://github.com/o/r/issues/new?template=summary-error.yml&amp;card=c_0000000001&amp;date=2026-10-23">b</a>' +
      '<a role="menuitem" href="#">c</a></span><i id="after"></i>';
    document.body.append(el);
    return el;
  }

  it("withShareCard·withReportCard — 카드 ID만 바꾸고 빌더 결과와 같다(쿼리 순서 그대로), 읽을 수 없으면 그대로", () => {
    expect(
      withShareCard(cardShareUrl("2026-10-23", "c_0000000001"), "c_8f3a1b2c4d"),
    ).toBe(cardShareUrl("2026-10-23", "c_8f3a1b2c4d"));
    expect(
      withReportCard(
        summaryErrorIssueUrl("c_0000000001", "2026-10-23"),
        "c_8f3a1b2c4d",
      ),
    ).toBe(summaryErrorIssueUrl("c_8f3a1b2c4d", "2026-10-23"));
    expect(withShareCard("not a url", "c_8f3a1b2c4d")).toBe("not a url");
    expect(withReportCard("", "c_8f3a1b2c4d")).toBe("");
  });

  it("menuKeyTarget — ↓↑ 순환, Home·End, 항목이 아닌 곳에서 ↓ 처음 · ↑ 끝, 그 밖의 키 null", () => {
    const root = menu();
    const m = root.querySelector("#m") as HTMLElement;
    const [a, b, c] = [...m.querySelectorAll<HTMLElement>("[role=menuitem]")];
    expect(menuKeyTarget(m, a ?? null, "ArrowDown")).toBe(b);
    expect(menuKeyTarget(m, c ?? null, "ArrowDown")).toBe(a);
    expect(menuKeyTarget(m, a ?? null, "ArrowUp")).toBe(c);
    expect(menuKeyTarget(m, b ?? null, "Home")).toBe(a);
    expect(menuKeyTarget(m, b ?? null, "End")).toBe(c);
    expect(menuKeyTarget(m, null, "ArrowDown")).toBe(a);
    expect(menuKeyTarget(m, null, "ArrowUp")).toBe(c);
    expect(menuKeyTarget(m, a ?? null, "Enter")).toBeNull();
    expect(
      menuKeyTarget(document.createElement("div"), null, "Home"),
    ).toBeNull();
    root.remove();
  });

  it("closeCardMenu — 열린 메뉴를 닫고 원래 자리로(형제 순서 그대로), scope 밖 메뉴는 그대로", () => {
    const root = menu();
    const button = root.querySelector("button") as HTMLButtonElement;
    const m = root.querySelector("#m") as HTMLElement;
    handleCardMenuClick(root, button, { share: vi.fn() });
    expect(m.parentElement?.hasAttribute("data-card-menu")).toBe(true);
    expect(menuButtonOf(m.querySelector("a") as Element)).toBe(button);
    expect(m.querySelector("a")?.getAttribute("href")).toContain(
      "card=c_0000000002",
    );
    expect(closeCardMenu(document.createElement("div"))).toBeNull();
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(closeCardMenu(root)).toBe(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(m).toHaveAttribute("hidden");
    expect(m.nextElementSibling?.id).toBe("after");
    expect(closeCardMenu()).toBeNull();
    root.remove();
  });

  it("handleCardMenuClick — 피드 밖 버튼은 건드리지 않는다", () => {
    const root = menu();
    const other = document.createElement("ol");
    const share = vi.fn();
    handleCardMenuClick(other, root.querySelector("button"), { share });
    expect(root.querySelector("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(share).not.toHaveBeenCalled();
    root.remove();
  });
});
