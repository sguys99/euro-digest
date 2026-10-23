/**
 * M1-37 — 상태 화면 4종(PRD DR-07, DESIGN §9.3 상태 화면 4종): 빈 상태 비시즌(5줄 S4 자리) · 오류(발행 지연 안내 + 5줄 자리 오류) ·
 * 오프라인 띠 · 로딩 스켈레톤(견본 전용) — 렌더 결과·문구(UI 안내·사실만)·접근성 속성과 셸 섬의 속성 전환.
 * 실제 시각·연결에 따른 보임/숨김·위치·CLS·axe는 e2e(tests/e2e/states.spec.ts), 혼합안 대조는 견본 e2e(tests/e2e-specimen/states.spec.ts).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BriefMissing, TodayBrief } from "@/components/brief/today-brief";
import { AppShell } from "@/components/shell/app-shell";
import { IssueLateNotice } from "@/components/shell/issue-late-notice";
import { OfflineBand } from "@/components/shell/offline-band";
import { OFFLINE_ATTR, StatusIsland } from "@/components/shell/status-island";
import { LoadingSkeleton } from "@/components/ui/skeleton";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { issueLateWindows, type IssueMeta } from "@/lib/issue";
import { ISSUE_LATE_ATTR, issueLateScript } from "@/lib/issue-late";
import { BriefFileSchema } from "@/lib/schema/brief";

const emptyBrief = BriefFileSchema.parse(
  JSON.parse(readFileSync(path.resolve("fixtures/brief-empty.json"), "utf8")),
);
const competitions = loadCompetitionsConfig();

const ISSUE: IssueMeta = {
  date: "2026-10-24",
  no: 13,
  publishedAt: "2026-10-23T22:05:00.000Z",
  updatedAt: "2026-10-23T22:05:00.000Z",
};

afterEach(() => {
  document.documentElement.removeAttribute(ISSUE_LATE_ATTR);
  document.documentElement.removeAttribute(OFFLINE_ATTR);
  vi.restoreAllMocks();
});

describe("빈 상태 — 비시즌(모든 대회 시즌 밖인 날의 S4 자리)", () => {
  it("모두 끝난 뒤: 가장 늦게 끝난 대회 평탄 탭 + 시즌명 + 종료일(설정 실값, Barlow 34px) + 안내, S4 문구 없음", () => {
    const last = competitions.reduce((a, b) => (b.endDate > a.endDate ? b : a));
    render(<TodayBrief brief={{ ...emptyBrief, date: "2027-07-01" }} />);
    const block = screen.getByRole("region", { name: "오늘의 5줄" });
    const off = block.querySelector("[data-slot=brief-off-season]");
    expect(off).toHaveAttribute("data-phase", "ended");
    expect(off).toHaveTextContent(
      `${last.shortKo}${last.nameKo} ${last.season}-${String((last.season + 1) % 100).padStart(2, "0")} 시즌`,
    );
    const time = off?.querySelector("time");
    expect(time).toHaveAttribute("datetime", last.endDate);
    expect(time?.querySelector("[aria-hidden]")).toHaveTextContent(
      last.endDate.replaceAll("-", "."),
    );
    expect(off).toHaveTextContent("종료");
    expect(off).toHaveTextContent(
      "시즌이 끝났어요. 다음 시즌 일정이 나오면 이 자리에 다시 채워집니다.",
    );
    expect(
      within(block).getByRole("link", { name: "주요 뉴스로" }),
    ).toHaveAttribute("href", "#news");
    expect(block).not.toHaveTextContent("5줄을 쉽니다");
  });

  it("개막 전: 가장 먼저 개막하는 대회의 개막일", () => {
    const first = competitions.reduce((a, b) =>
      b.startDate < a.startDate ? b : a,
    );
    render(<TodayBrief brief={{ ...emptyBrief, date: "2026-08-01" }} />);
    const off = document.querySelector("[data-slot=brief-off-season]");
    expect(off).toHaveAttribute("data-phase", "upcoming");
    expect(off?.querySelector("time")).toHaveAttribute(
      "datetime",
      first.startDate,
    );
    expect(off).toHaveTextContent("개막");
    expect(off).toHaveTextContent("아직 시즌 전이에요.");
  });

  it("시즌 중 경기 없는 날은 S4 그대로 · 날짜 아카이브(이날의 5줄)는 비시즌이어도 S4(지난 호를 지금 설정으로 다시 쓰지 않는다)", () => {
    const { unmount } = render(<TodayBrief brief={emptyBrief} />);
    expect(document.querySelector("[data-slot=brief-off-season]")).toBeNull();
    expect(screen.getByText("오늘은 5줄을 쉽니다")).toBeInTheDocument();
    unmount();
    render(
      <TodayBrief
        brief={{ ...emptyBrief, date: "2027-07-01" }}
        variant="issue"
      />,
    );
    expect(document.querySelector("[data-slot=brief-off-season]")).toBeNull();
    expect(screen.getByText("이날은 5줄을 쉽니다")).toBeInTheDocument();
  });
});

describe("오류 — 5줄 자리(브리핑 파일 없음 + 그날 게시 실행 기록)", () => {
  it("홈: 섹션 머리 '오늘의 5줄' + 상자 '오늘은 5줄을 싣지 못했어요' · 원인·하단 링크 없음", () => {
    render(<BriefMissing />);
    const block = screen.getByRole("region", { name: "오늘의 5줄" });
    expect(block).toHaveAttribute("data-brief-mode", "missing");
    const box = block.querySelector("[data-slot=brief-missing]");
    expect(box).toHaveTextContent("오늘은 5줄을 싣지 못했어요");
    expect(box).toHaveTextContent(
      "이 호를 발행할 때 브리핑을 만들지 못했어요. 뉴스는 아래에 그대로 있어요.",
    );
    expect(box?.className).toContain("bg-paper-2");
    expect(box?.className).toContain("border-ink");
    expect(within(block).queryAllByRole("link")).toEqual([]);
    // 원인을 지어내지 않는다
    expect(block.textContent).not.toMatch(/경기 데이터|football|오류가|실패/);
  });

  it("날짜 아카이브: '이날의 5줄' · '이날은 5줄을 싣지 못했어요'", () => {
    render(<BriefMissing variant="issue" headingId="x-h" />);
    const block = screen.getByRole("region", { name: "이날의 5줄" });
    expect(block).toHaveTextContent("이날은 5줄을 싣지 못했어요");
  });
});

describe("오류 — 발행 지연 안내(상자 + 첫 페인트 전 스크립트)", () => {
  const windows = issueLateWindows(ISSUE.date);

  it("바깥 role=status(늘 있음) · 상자는 평소 숨김(issue-late: 변형) · 문구 = 최신 호 날짜·호수 · 바로 뒤 인라인 스크립트", () => {
    const { container } = render(
      <IssueLateNotice issue={ISSUE} windows={windows} />,
    );
    const status = container.querySelector("[data-slot=issue-late]");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("data-issue-date", ISSUE.date);
    expect(status).toHaveAttribute("data-nosnippet");
    const box = status?.querySelector("[data-slot=issue-late-box]");
    expect(box?.className).toMatch(/\bhidden\b/);
    expect(box?.className).toContain("issue-late:block");
    expect(box).toHaveTextContent("오늘 호 발행이 늦어지고 있어요");
    expect(box).toHaveTextContent(
      "지금 보이는 지면은 마지막으로 발행된 10월 24일 (토) 제 13호예요.",
    );
    expect(box?.querySelector("time")).toHaveAttribute("datetime", ISSUE.date);
    const script = status?.nextElementSibling;
    expect(script?.tagName).toBe("SCRIPT");
    expect(script).toHaveAttribute("data-slot", "issue-late-script");
    expect(script?.textContent).toBe(issueLateScript(windows));
  });

  it("호수가 없는 호(창간 전 fixture)는 '{날짜} 호예요' · 견본(visible)은 늘 보이고 스크립트 없음", () => {
    const { container } = render(
      <IssueLateNotice
        issue={{ ...ISSUE, date: "2026-10-11", no: null }}
        windows={windows}
        visible
      />,
    );
    const box = container.querySelector("[data-slot=issue-late-box]");
    expect(box?.className).not.toMatch(/\bhidden\b/);
    expect(box).toHaveTextContent("마지막으로 발행된 10월 11일 (일) 호예요.");
    expect(container.querySelector("script")).toBeNull();
  });
});

describe("오프라인 띠", () => {
  it("바깥 role=status(평소 높이 0 — sticky 자리) · 안쪽은 평소 숨김(offline: 변형) · 문구는 사실(PWA 문구 없음)", () => {
    const { container } = render(<OfflineBand />);
    const status = container.querySelector("[data-slot=offline-band]");
    expect(status).toHaveAttribute("role", "status");
    expect(status?.className).toContain("sticky");
    expect(status).toHaveAttribute("data-nosnippet");
    const body = status?.querySelector("[data-slot=offline-band-body]");
    expect(body?.className).toMatch(/\bhidden\b/);
    expect(body?.className).toContain("offline:flex");
    expect(body).toHaveTextContent(
      "오프라인지금 페이지는 그대로 볼 수 있어요. 다른 페이지는 열리지 않을 수 있어요.",
    );
    expect(body?.textContent).not.toMatch(/저장해 둔|새 소식을 확인/);
  });
});

describe("앱 셸 배치", () => {
  it("lateWindows를 주면 main 맨 앞에 지연 안내, 주지 않으면 없음 · 오프라인 띠는 하단 탭 바로 앞", () => {
    const { container, unmount } = render(
      <AppShell
        current="home"
        issue={ISSUE}
        lateWindows={issueLateWindows(ISSUE.date)}
      >
        <section aria-label="본문" />
      </AppShell>,
    );
    const main = screen.getByRole("main");
    expect(main.firstElementChild).toHaveAttribute("data-slot", "issue-late");
    const tabs = screen.getByRole("navigation", { name: "하단 탭" });
    expect(tabs.previousElementSibling).toHaveAttribute(
      "data-slot",
      "offline-band",
    );
    expect(container.querySelectorAll("[data-slot=offline-band]")).toHaveLength(
      1,
    );
    unmount();
    render(
      <AppShell issue={ISSUE}>
        <section aria-label="본문" />
      </AppShell>,
    );
    expect(document.querySelector("[data-slot=issue-late]")).toBeNull();
    expect(document.querySelector("[data-slot=offline-band]")).not.toBeNull();
  });
});

describe("셸 섬 — <html> 속성만 바꾼다", () => {
  it("offline·online 이벤트로 data-offline", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<StatusIsland />);
    const root = document.documentElement;
    expect(root.hasAttribute(OFFLINE_ATTR)).toBe(false);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(root.hasAttribute(OFFLINE_ATTR)).toBe(true);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(root.hasAttribute(OFFLINE_ATTR)).toBe(false);
  });

  it("끊긴 채 마운트(뒤로 가기 캐시)되면 바로 data-offline", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<StatusIsland />);
    expect(document.documentElement.hasAttribute(OFFLINE_ATTR)).toBe(true);
  });

  it("late 구간이 있으면 마운트 때 지금 시각으로 data-issue-late(클라이언트 이동 대비) — pageshow(뒤로 가기 캐시)로는 다시 판정하지 않는다", () => {
    const windows = issueLateWindows(ISSUE.date);
    const now = vi.spyOn(Date, "now").mockReturnValue(windows[0]![0]);
    const { unmount } = render(<StatusIsland late={windows} />);
    const root = document.documentElement;
    expect(root.hasAttribute(ISSUE_LATE_ATTR)).toBe(true);
    unmount();
    root.removeAttribute(ISSUE_LATE_ATTR);
    now.mockReturnValue(windows[0]![0] - 1);
    render(<StatusIsland late={windows} />);
    expect(root.hasAttribute(ISSUE_LATE_ATTR)).toBe(false);
    // 오래된 사본이 그사이 발행된 호를 늦었다고 말하지 않게
    now.mockReturnValue(windows[0]![0] + 60_000);
    act(() => {
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(root.hasAttribute(ISSUE_LATE_ATTR)).toBe(false);
  });

  it("pageshow(뒤로 가기 캐시에서 돌아옴)에 연결 상태를 다시 본다", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<StatusIsland />);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(document.documentElement.hasAttribute(OFFLINE_ATTR)).toBe(true);
  });

  it("late가 없으면 지연 속성을 건드리지 않는다", () => {
    document.documentElement.setAttribute(ISSUE_LATE_ATTR, "");
    render(<StatusIsland />);
    expect(document.documentElement.hasAttribute(ISSUE_LATE_ATTR)).toBe(true);
  });
});

describe("로딩 스켈레톤(견본 전용 — 클라이언트 이동 대기 화면은 쓰지 않음)", () => {
  it("role=status + 화면 밖 '불러오는 중', 머리 자리 + 5줄 행 3 + 카드 3 — 조각은 모두 aria-hidden", () => {
    const { container } = render(<LoadingSkeleton />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("불러오는 중");
    const parts = [...status.children].filter(
      (el) => !el.classList.contains("sr-only"),
    );
    expect(parts).toHaveLength(7);
    for (const part of parts)
      expect(part).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("[class*=animate-]")).toBeNull();
  });
});
