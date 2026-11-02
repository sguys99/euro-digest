/**
 * M4-08 — 팔로우 버튼 섬 · 한도 이유 문장 (src/components/follow/follow-button.tsx — PRD FR-59 · FR-110, DESIGN §9.3 D2 "팔로우 버튼",
 * PRD §15 D67 ②, DECISIONS D2 §6 #9 · #10 · §9)
 *
 * 3상태(꺼짐 · 켜짐 · 한도) · `aria-pressed` · 한도 `aria-disabled` + `aria-describedby` + 종류별 이유 문장 · 같은 대상 버튼 함께 바뀜 ·
 * 저장 차단 시 상태는 바뀌고 안내 토스트 한 번 · 하이드레이션 전에는 자리만(숨김) · 아이콘형 접근 이름.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toast", () => ({ toast: toastMock }));

import {
  FollowButton,
  FollowLimitNote,
  followLimitReason,
  resetUnsavedNotice,
} from "@/components/follow/follow-button";
import { EMPTY_FOLLOWS, FOLLOW_STORAGE_KEY } from "@/lib/follow";
import { followStore } from "@/lib/use-follows";

function setFollows(teams: string[], players: string[] = []): void {
  window.localStorage.setItem(
    FOLLOW_STORAGE_KEY,
    JSON.stringify({ v: 1, teams, players }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetUnsavedNotice();
  toastMock.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  // 메모리 폴백(저장 차단 테스트)이 다음 테스트에 남지 않게 — 저장소에 다시 쓰면 메모리 값이 지워진다
  act(() => {
    followStore.update(() => ({ v: 1, teams: ["reset"], players: [] }));
    followStore.update(() => EMPTY_FOLLOWS);
  });
  window.localStorage.clear();
});

describe("팔로우 버튼 — 3상태", () => {
  it("꺼짐 → 누르면 켜짐(aria-pressed, 저장) → 다시 누르면 꺼짐. 접근 이름 = '팔로우 — 대상' 고정(상태는 aria-pressed · aria-disabled만 — M4-16)", () => {
    render(<FollowButton kind="teams" slug="arsenal" name="아스널" />);
    const button = screen.getByRole("button", { name: "팔로우 — 아스널" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).not.toHaveAttribute("aria-disabled");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAccessibleName("팔로우 — 아스널");
    expect(
      JSON.parse(window.localStorage.getItem(FOLLOW_STORAGE_KEY)!),
    ).toEqual({ v: 1, teams: ["arsenal"], players: [] });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("같은 대상의 버튼은 함께 바뀐다(글자형 · 아이콘형)", () => {
    render(
      <>
        <FollowButton kind="players" slug="kim-min-jae" name="김민재" />
        <FollowButton
          kind="players"
          slug="kim-min-jae"
          name="김민재"
          variant="icon"
        />
      </>,
    );
    const icon = screen.getByRole("button", { name: "김민재 팔로우" });
    fireEvent.click(icon);
    expect(icon).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "팔로우 — 김민재" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("세 글자를 같은 칸에 겹쳐 두고 지금 것만 보인다(폭 고정 — 상태가 바뀌어도 옆 글자가 밀리지 않는다)", () => {
    const { container } = render(
      <FollowButton kind="teams" slug="arsenal" name="아스널" />,
    );
    const labels = [
      ...container.querySelectorAll("button > span:last-child > span"),
    ].slice(0, 3);
    expect(labels.map((l) => l.textContent)).toEqual([
      "팔로우",
      "팔로우 중",
      "팔로우 5/5",
    ]);
    expect(labels.map((l) => l.classList.contains("invisible"))).toEqual([
      false,
      true,
      true,
    ]);
  });

  it("한도(그 종류 5개) — 꺼진 버튼은 점선 비활성: aria-disabled + 이유 문장(aria-describedby), 눌러도 바뀌지 않는다", () => {
    setFollows(["a", "b", "c", "d", "e"]);
    render(
      <>
        <FollowButton
          kind="teams"
          slug="arsenal"
          name="아스널"
          reasonId="lim"
        />
        <FollowLimitNote kind="teams" slug="arsenal" id="lim" />
        <FollowButton kind="players" slug="kim-min-jae" name="김민재" />
      </>,
    );
    const button = screen.getByRole("button", { name: "팔로우 — 아스널" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-pressed", "false");
    // jsdom은 <b> 경계에 공백을 넣어 계산한다(브라우저는 넣지 않는다) — 공백은 보지 않는다
    expect(button).toHaveAccessibleDescription(
      /^팀은 5개\s?까지 팔로우할 수 있어요 — 마이에서 하나를 풀면 더할 수 있어요$/,
    );
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    // 한도는 종류별 — 선수 버튼은 그대로 꺼짐
    expect(
      screen.getByRole("button", { name: "팔로우 — 김민재" }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("한도 이유 문장은 종류별 조사(팀은 · 선수는)", () => {
    expect(followLimitReason("teams").lead).toBe("팀은 ");
    expect(followLimitReason("players").lead).toBe("선수는 ");
    setFollows([], ["p1", "p2", "p3", "p4", "p5"]);
    render(<FollowLimitNote kind="players" slug="kim-min-jae" id="x" />);
    expect(document.getElementById("x")).toHaveTextContent(
      "선수는 5개까지 팔로우할 수 있어요",
    );
    expect(document.getElementById("x")).not.toHaveAttribute("hidden");
  });

  it("팔로우 중인 대상은 한도여도 켜짐(풀 수 있다) · 이유 문장은 숨는다", () => {
    setFollows(["a", "b", "c", "d", "arsenal"]);
    render(
      <>
        <FollowButton kind="teams" slug="arsenal" name="아스널" reasonId="r" />
        <FollowLimitNote kind="teams" slug="arsenal" id="r" />
      </>,
    );
    const button = screen.getByRole("button", { name: "팔로우 — 아스널" });
    expect(button).not.toHaveAttribute("aria-disabled");
    expect(button).not.toHaveAttribute("aria-describedby");
    expect(document.getElementById("r")).toHaveAttribute("hidden");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("저장소가 막혀도 상태는 바뀌고(이번 방문 — 메모리), 안내 토스트는 한 번만", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    render(
      <>
        <FollowButton kind="teams" slug="arsenal" name="아스널" />
        <FollowButton kind="teams" slug="chelsea" name="첼시" />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "팔로우 — 아스널" }));
    fireEvent.click(screen.getByRole("button", { name: "팔로우 — 첼시" }));
    expect(
      screen.getByRole("button", { name: "팔로우 — 아스널" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0]?.[0].message).toContain("이번 방문 동안만");
  });

  it("다른 탭에서 바뀌면 따라간다(storage 이벤트)", () => {
    render(<FollowButton kind="teams" slug="arsenal" name="아스널" />);
    const button = screen.getByRole("button", { name: "팔로우 — 아스널" });
    setFollows(["arsenal"]);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: FOLLOW_STORAGE_KEY }),
      );
    });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });
});

describe("하이드레이션", () => {
  it("서버 HTML은 꺼짐 + 숨김(자리만) — 하이드레이션 뒤 저장값으로 보인다(불일치 경고 없음)", async () => {
    setFollows(["arsenal"]);
    const html = renderToString(
      <FollowButton kind="teams" slug="arsenal" name="아스널" />,
    );
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("invisible");
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      hydrateRoot(
        container,
        <FollowButton kind="teams" slug="arsenal" name="아스널" />,
      );
    });
    const button = container.querySelector("button")!;
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button.className).not.toMatch(/(?:^|\s)invisible(?:\s|$)/);
    expect(errors).not.toHaveBeenCalled();
    container.remove();
  });
});
