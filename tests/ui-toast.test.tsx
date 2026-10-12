/**
 * Toast — 이벤트 기반 toast() + 하나뿐인 aria-live 영역 (D0-12, DESIGN.md §9.2 Toast·§6.2 배출)
 * 표시·aria-live·자동 닫힘(가짜 타이머 2.4초)·멈춤(포인터·포커스)·액션·닫기 버튼·교체를 본다.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dismissToast,
  toast,
  Toaster,
  TOAST_DURATION_MS,
  ToastView,
} from "@/components/ui/toast";

function region(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[aria-live="polite"]');
  if (!el) throw new Error("aria-live 영역 없음");
  return el;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Toaster", () => {
  it("토스트가 없어도 aria-live=polite·aria-atomic 영역 하나가 있다(fixed 아래 가운데, z 40)", () => {
    render(<Toaster />);
    const live = region();
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(live).toHaveAttribute("aria-atomic", "true");
    expect(live).toBeEmptyDOMElement();
    expect(live.className).toEqual(expect.stringContaining("fixed"));
    expect(live.className.split(" ")).toEqual(
      expect.arrayContaining([
        "bottom-19",
        "lg:bottom-7",
        "z-40",
        "pointer-events-none",
      ]),
    );
  });

  it("toast()를 부르면 종류·문구를 영역 안에 보이고 2.4초 뒤 사라진다", () => {
    render(<Toaster />);
    act(() => {
      toast({ kind: "공유", message: "링크를 복사했어요" });
    });
    const live = region();
    expect(live).toHaveTextContent("공유링크를 복사했어요");
    const view = live.firstElementChild as HTMLElement;
    expect(view.className.split(" ")).toEqual(
      expect.arrayContaining([
        "bg-ink",
        "text-paper",
        "shadow-print-accent",
        "animate-eject",
        "min-h-12",
      ]),
    );
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    });
    expect(live).toHaveTextContent("링크를 복사했어요");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(live).toBeEmptyDOMElement();
    expect(TOAST_DURATION_MS).toBe(2400);
  });

  it("종류 기본값은 '알림', 새 토스트는 지금 것을 바꾼다(한 번에 하나)", () => {
    render(<Toaster />);
    act(() => {
      toast({ message: "첫째" });
    });
    act(() => {
      vi.advanceTimersByTime(2000);
      toast({ message: "둘째" });
    });
    const live = region();
    expect(live.children).toHaveLength(1);
    expect(live).toHaveTextContent("알림둘째");
    // 새 토스트는 시간을 처음부터 잰다
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(live).toHaveTextContent("둘째");
  });

  it("포인터가 올라가 있거나 포커스가 안에 있으면 멈추고, 벗어나면 다시 2.4초", () => {
    render(<Toaster />);
    act(() => {
      toast({
        message: "멈춤",
        action: { label: "새로고침", onClick: () => {} },
      });
    });
    const view = region().firstElementChild as HTMLElement;
    fireEvent.pointerEnter(view);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(region()).toHaveTextContent("멈춤");
    fireEvent.pointerLeave(view);
    act(() => {
      within(view).getByRole("button", { name: "새로고침" }).focus();
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(region()).toHaveTextContent("멈춤");
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS);
    });
    expect(region()).toBeEmptyDOMElement();
  });

  it("액션: 누르면 실행하고 닫는다 — 액션이 띄운 새 토스트는 남는다", () => {
    render(<Toaster />);
    const onClick = vi.fn(() => toast({ message: "새로 띄움" }));
    act(() => {
      toast({
        kind: "새 소식",
        message: "새 소식이 있어요",
        action: { label: "새로고침", onClick },
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(region()).toHaveTextContent("새로 띄움");
    expect(region()).not.toHaveTextContent("새 소식이 있어요");
  });

  it("닫기 버튼(dismissible): 44×44 아이콘 버튼 '알림 닫기'로 닫는다", () => {
    render(<Toaster />);
    act(() => {
      toast({ message: "닫을 수 있음", dismissible: true });
    });
    const close = screen.getByRole("button", { name: "알림 닫기" });
    expect(close.className.split(" ")).toEqual(
      expect.arrayContaining(["h-11", "min-w-11"]),
    );
    fireEvent.click(close);
    expect(region()).toBeEmptyDOMElement();
  });

  it("dismissToast(id)는 그 토스트일 때만, 인자 없으면 지금 것을 닫는다", () => {
    render(<Toaster />);
    let first = 0;
    act(() => {
      first = toast({ message: "하나" });
    });
    act(() => {
      toast({ message: "둘" });
    });
    act(() => dismissToast(first));
    expect(region()).toHaveTextContent("둘");
    act(() => dismissToast());
    expect(region()).toBeEmptyDOMElement();
  });

  it("키보드로 닫기 버튼을 누르면 토스트에 들어오기 전 요소로 포커스가 돌아간다(body로 떨어지지 않음)", () => {
    render(
      <>
        <button type="button">공유</button>
        <Toaster />
      </>,
    );
    const share = screen.getByRole("button", { name: "공유" });
    share.focus();
    act(() => {
      toast({ message: "링크를 복사했어요", dismissible: true });
    });
    const close = within(region()).getByRole("button", { name: "알림 닫기" });
    close.focus(); // Tab으로 들어옴(relatedTarget = 공유 버튼)
    expect(close).toHaveFocus();
    fireEvent.click(close); // Enter·Space
    expect(region()).toBeEmptyDOMElement();
    expect(share).toHaveFocus();
  });

  it("액션으로 닫혀도 들어오기 전 요소로 돌아간다 — 그 요소가 없어졌으면 #main(tabindex=-1)으로", () => {
    function Page({ withTrigger }: { withTrigger: boolean }) {
      return (
        <>
          <main id="main" tabIndex={-1}>
            {withTrigger ? <button type="button">새 소식 보기</button> : null}
          </main>
          <Toaster />
        </>
      );
    }
    const { rerender } = render(<Page withTrigger />);
    const trigger = screen.getByRole("button", { name: "새 소식 보기" });
    trigger.focus();
    const onAction = vi.fn();
    act(() => {
      toast({
        message: "새 소식 3건",
        action: { label: "새로고침", onClick: onAction },
      });
    });
    const action = within(region()).getByRole("button", { name: "새로고침" });
    action.focus();
    fireEvent.click(action);
    expect(onAction).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();

    // 들어오기 전 요소가 사라진 경우
    act(() => {
      toast({ message: "알림", dismissible: true });
    });
    within(region()).getByRole("button", { name: "알림 닫기" }).focus();
    rerender(<Page withTrigger={false} />);
    fireEvent.click(
      within(region()).getByRole("button", { name: "알림 닫기" }),
    );
    expect(document.getElementById("main")).toHaveFocus();
  });

  it("토스트 밖에 포커스가 있으면 사라질 때 포커스를 건드리지 않는다", () => {
    render(
      <>
        <button type="button">다른 곳</button>
        <Toaster />
      </>,
    );
    const other = screen.getByRole("button", { name: "다른 곳" });
    other.focus();
    act(() => {
      toast({ message: "알림" });
    });
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS);
    });
    expect(region()).toBeEmptyDOMElement();
    expect(other).toHaveFocus();
  });

  it("Toaster가 없으면 아무 일도 없다", () => {
    expect(() => toast({ message: "허공" })).not.toThrow();
  });
});

describe("ToastView", () => {
  it("키 칸(점선) + 문구 + 액션 텍스트 링크(글자 --paper), 링은 --paper", () => {
    render(
      <ToastView animated={false} kind="새 소식" action={{ label: "새로고침" }}>
        새 소식이 있어요
      </ToastView>,
    );
    const view = screen.getByText("새 소식이 있어요")
      .parentElement as HTMLElement;
    expect(view.className).toContain("[--ring:var(--paper)]");
    expect(view.className).not.toContain("animate-eject");
    const key = screen.getByText("새 소식");
    expect(key.className.split(" ")).toEqual(
      expect.arrayContaining([
        "border-r-2",
        "border-dotted",
        "border-r-paper/55",
      ]),
    );
    const action = screen.getByRole("button", { name: "새로고침" });
    expect(action.className.split(" ")).toEqual(
      expect.arrayContaining(["text-paper", "underline", "min-h-11"]),
    );
  });
});
