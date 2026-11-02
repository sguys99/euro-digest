/**
 * M4-09 — 온보딩 진입 줄 · 단계 UI 섬 (src/components/onboarding/ — PRD FR-113 · §15 D64 ⑥ · D67 ②, DESIGN §9.3 D2 "온보딩")
 *
 * 표시 조건(첫 방문 + 팔로우 0 · 기록 있으면 숨김) · "건너뛰기"(기록 skipped) · "시작" → 지연 단계 UI → 리그 → 팀(즉시 팔로우 · 5 초과 토스트) →
 * 선수 → 완료(기록 done · 요약 + 마이 링크) · 건너뛰기 · 자료 받기 실패 → 다시 시도 · 저장소 차단(보이고, 닫으면 이번 방문 동안만 닫힘).
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toast", () => ({ toast: toastMock }));

import { resetUnsavedNotice } from "@/components/follow/follow-button";
import { OnboardingEntry } from "@/components/onboarding/onboarding-entry";
import { resetOnboardingData } from "@/components/onboarding/onboarding-panel";
import { EMPTY_FOLLOWS, FOLLOW_STORAGE_KEY } from "@/lib/follow";
import { ONBOARDING_ENTRY_ID, ONBOARDING_STORAGE_KEY } from "@/lib/onboarding";
import type { OnboardingData } from "@/lib/onboarding-steps";
import { safeLocalStorage } from "@/lib/safe-storage";
import { followStore } from "@/lib/use-follows";

function team(k: string, n: string, p: number) {
  return { k, n, s: k.slice(0, 3).toUpperCase(), p };
}

const DATA: OnboardingData = {
  v: 1,
  l: [
    {
      id: "EPL",
      n: "프리미어리그",
      s: "EPL",
      t: Array.from({ length: 8 }, (_, i) =>
        team(`epl-team-${i + 1}`, `EPL 팀${i + 1}`, i + 1),
      ),
    },
    {
      id: "BUNDESLIGA",
      n: "분데스리가",
      s: "분데스",
      t: [{ ...team("bayern-munchen", "바이에른 뮌헨", 1), kr: 1 }],
    },
  ],
  p: [
    { k: "kim-min-jae", n: "김민재", pos: "DF", t: "바이에른 뮌헨" },
    {
      k: "kim-ji-soo",
      n: "김지수",
      pos: "DF",
      t: "브렌트포드",
      st: "not-linked",
    },
  ],
};

const fetchMock = vi.fn();

function entry() {
  return render(
    <main id="main" tabIndex={-1}>
      <OnboardingEntry dataUrl="/my/data/onboarding.json" myHref="/my/" />
    </main>,
  );
}

const root = () => document.getElementById(ONBOARDING_ENTRY_ID)!;
const stored = () =>
  JSON.parse(window.localStorage.getItem(FOLLOW_STORAGE_KEY) ?? "null");

beforeEach(() => {
  window.localStorage.clear();
  safeLocalStorage.dropMemory();
  resetUnsavedNotice();
  toastMock.mockClear();
  fetchMock.mockReset();
  resetOnboardingData();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => JSON.parse(JSON.stringify(DATA)) as unknown,
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  act(() => {
    followStore.update(() => ({ v: 1, teams: ["reset"], players: [] }));
    followStore.update(() => EMPTY_FOLLOWS);
  });
  window.localStorage.clear();
  safeLocalStorage.dropMemory();
});

async function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: "내 명단 만들기 시작" }));
  await screen.findByRole("heading", { name: "내 명단 만들기" });
  return screen.findByRole("button", { name: /1단계 리그/ });
}

describe("진입 줄 — 표시 조건", () => {
  it("첫 방문 + 팔로우 0 → 보인다(진입 줄 · 버튼 두 개)", () => {
    entry();
    expect(root()).not.toHaveAttribute("hidden");
    expect(screen.getByText("1·2·3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "내 명단 만들기 시작" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "건너뛰기 — 내 명단 만들기 닫기" }),
    ).toBeInTheDocument();
  });

  it("팔로우가 있으면 숨김", () => {
    window.localStorage.setItem(
      FOLLOW_STORAGE_KEY,
      JSON.stringify({ v: 1, teams: ["arsenal"], players: [] }),
    );
    entry();
    expect(root()).toHaveAttribute("hidden");
  });

  it("건너뛴 기록이 있으면 팔로우 0이어도 숨김", () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "skipped");
    entry();
    expect(root()).toHaveAttribute("hidden");
  });

  it("진입 줄 '건너뛰기' → 기록 skipped · 숨김 · 본문으로 포커스 · 다른 길 토스트", () => {
    entry();
    fireEvent.click(
      screen.getByRole("button", { name: "건너뛰기 — 내 명단 만들기 닫기" }),
    );
    expect(window.localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("skipped");
    expect(root()).toHaveAttribute("hidden");
    expect(document.activeElement?.id).toBe("main");
    expect(toastMock).toHaveBeenCalledTimes(1);
  });
});

describe("단계 UI", () => {
  it("시작 → 리그 → 팀 3(즉시 팔로우) → 선수 1 → 완료(기록 done · 요약 · 마이 링크)", async () => {
    entry();
    const head1 = await openPanel();
    expect(fetchMock).toHaveBeenCalledWith("/my/data/onboarding.json");
    expect(head1).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector("[aria-live]")).toHaveTextContent(
      "3단계 중 1단계, 리그",
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /프리미어리그/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /분데스리가/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    const head2 = screen.getByRole("button", { name: /2단계 팀/ });
    expect(head2).toHaveAttribute("aria-expanded", "true");
    expect(head1).toHaveAttribute("aria-expanded", "false");
    expect(head1).toHaveAccessibleName(/지난 단계/);
    // 앞 6팀 + "8팀 모두"
    const epl = document.querySelector('[data-ob-league="EPL"]') as HTMLElement;
    expect(within(epl).getAllByRole("checkbox")).toHaveLength(6);
    fireEvent.click(
      within(epl).getByRole("button", { name: /8팀 모두 — 프리미어리그/ }),
    );
    expect(within(epl).getAllByRole("checkbox")).toHaveLength(8);

    for (const name of ["EPL 팀1", "EPL 팀7"])
      fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(name) }));
    fireEvent.click(screen.getByRole("checkbox", { name: /바이에른 뮌헨/ }));
    expect(stored()).toEqual({
      v: 1,
      teams: ["epl-team-1", "epl-team-7", "bayern-munchen"],
      players: [],
    });
    expect(head2).toHaveTextContent("3 / 5");

    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /김민재/ }));
    expect(stored().players).toEqual(["kim-min-jae"]);
    expect(screen.getByText("기록 연결 전")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(window.localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("done");
    const done = document.querySelector(
      '[data-slot="onboarding-done"]',
    ) as HTMLElement;
    expect(done).toHaveTextContent("팀 3 · 선수 1");
    expect(done).toHaveTextContent(
      "EPL 팀1 · EPL 팀7 · 바이에른 뮌헨 · 김민재",
    );
    expect(
      within(done).getByRole("link", { name: "마이에서 보기" }),
    ).toHaveAttribute("href", expect.stringMatching(/\/my\/?$/));
    await waitFor(() =>
      expect(document.activeElement).toBe(done.querySelector("p")),
    );
    fireEvent.click(within(done).getByRole("button", { name: "닫기" }));
    expect(root()).toHaveAttribute("hidden");
  });

  it("팀 6번째는 고르지 못하고 토스트(팔로우 한도 5)", async () => {
    entry();
    await openPanel();
    fireEvent.click(screen.getByRole("checkbox", { name: /프리미어리그/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(
      screen.getByRole("button", { name: /8팀 모두 — 프리미어리그/ }),
    );
    for (let i = 1; i <= 6; i++)
      fireEvent.click(
        screen.getByRole("checkbox", { name: new RegExp(`EPL 팀${i}\\b`) }),
      );
    expect(stored().teams).toHaveLength(5);
    expect(
      screen.getByRole("checkbox", { name: /EPL 팀6\b/ }),
    ).not.toBeChecked();
    expect(toastMock).toHaveBeenCalledWith({
      message: "팀은 5개까지 고를 수 있어요",
    });
  });

  it("리그를 안 고르고 팀 단계 → 안내 + 리그 고르기", async () => {
    entry();
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(
      screen.getByText("리그를 고르면 그 리그 팀이 순위 순으로 나와요."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "리그 고르기" }));
    expect(screen.getByRole("button", { name: /1단계 리그/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("건너뛰기 → 기록 skipped · 고른 것은 남는다 · 닫힘", async () => {
    entry();
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: /3단계 한국 선수/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /김민재/ }));
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    expect(window.localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("skipped");
    expect(stored().players).toEqual(["kim-min-jae"]);
    expect(root()).toHaveAttribute("hidden");
  });

  it("자료 받기 실패 → 안내 + 다시 시도", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    entry();
    fireEvent.click(
      screen.getByRole("button", { name: "내 명단 만들기 시작" }),
    );
    const retry = await screen.findByRole("button", { name: "다시 시도" });
    expect(screen.getByText("고를 목록을 받지 못했어요.")).toBeInTheDocument();
    fireEvent.click(retry);
    expect(
      await screen.findByRole("button", { name: /1단계 리그/ }),
    ).toBeInTheDocument();
  });
});

describe("저장소 차단", () => {
  it("보이고, 닫으면 이번 방문 동안 닫힘(메모리) — 안내 문구가 바뀐다", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const first = entry();
    expect(root()).not.toHaveAttribute("hidden");
    await openPanel();
    expect(
      screen.getByText(
        "저장소를 쓸 수 없어 팔로우는 이번 방문 동안만 유지돼요",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    expect(root()).toHaveAttribute("hidden");
    first.unmount();
    // 같은 방문(앱 안 이동) — 메모리 폴백이 기록을 기억한다
    entry();
    expect(root()).toHaveAttribute("hidden");
  });
});
