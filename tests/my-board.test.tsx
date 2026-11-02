/**
 * M4-08 — `/my` 섬(src/components/my/my-board.tsx · my-manage.tsx · my-head.tsx · use-my-data.ts — PRD FR-110~111, DESIGN §9.3 D2 "`/my` 틀")
 *
 * 팔로우한 것만 자료 파일을 받는지, 다음 경기를 경기 id로 합치는지(입장권 + 걸린 팔로우), 상태 4종(교정쇄 · 빈 상태 · 실패 + 다시 시도),
 * 관리 열(종류별 n/5 · 푼 항목 자리 유지 · 한도 띠), 머리(팔로우 수 · 이름).
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MyBoard } from "@/components/my/my-board";
import { MyHead } from "@/components/my/my-head";
import { MyManage } from "@/components/my/my-manage";
import { resetMyDataCache } from "@/components/my/use-my-data";
import { EMPTY_FOLLOWS, FOLLOW_STORAGE_KEY } from "@/lib/follow";
import {
  MY_DATA_VERSION,
  MY_DIRECTORY_ID,
  type MyDirectory,
  type MyEntityData,
} from "@/lib/my-view";
import type { FixtureRowView } from "@/lib/player-detail-view";
import { followStore } from "@/lib/use-follows";

const DIR: MyDirectory = {
  teams: {
    "bayern-munchen": {
      n: "바이에른 뮌헨",
      s: "FCB",
      c: ["#D3052B", "#FFFFFF"],
      u: "분데스 1위",
    },
    arsenal: { n: "아스널", s: "ARS", c: ["#D70106", "#FFFFFF"], u: "EPL 1위" },
  },
  players: { "kim-min-jae": { n: "김민재", t: "바이에른 뮌헨" } },
};

const side = (name: string) => ({
  name,
  latin: false,
  badge: { name, short: "X", colors: null },
  link: null,
});
const fx = (
  key: string,
  kickoff: string,
  home: string,
  away: string,
): FixtureRowView => ({
  key,
  kickoff,
  time: "05:00",
  day: "11.04 (수)",
  comp: { kind: "comp", comp: "UCL", short: "UCL", name: "UEFA 챔피언스리그" },
  round: "4차전",
  home: side(home),
  away: side(away),
});

const FILES: Record<string, MyEntityData> = {
  "teams/bayern-munchen": {
    v: MY_DATA_VERSION,
    kind: "teams",
    slug: "bayern-munchen",
    next: [
      fx("m1", "2026-11-03T20:00:00Z", "아틀레티코 마드리드", "바이에른 뮌헨"),
    ],
    recent: [
      {
        key: "r1",
        kickoff: "2026-10-25T16:30:00Z",
        date: "10.26",
        comp: {
          kind: "comp",
          comp: "BUNDESLIGA",
          short: "분데스",
          name: "분데스리가",
        },
        team: {
          slug: "bayern-munchen",
          name: "바이에른 뮌헨",
          latin: false,
          short: "FCB",
          colors: null,
        },
        opponent: {
          name: "프라이부르크",
          latin: false,
          badge: { name: "프라이부르크", short: "SCF", colors: null },
        },
        home: false,
        result: { outcome: "W", for: 3, against: 1, pens: null },
        goals: 0,
        assists: null,
      },
    ],
  },
  "players/kim-min-jae": {
    v: MY_DATA_VERSION,
    kind: "players",
    slug: "kim-min-jae",
    next: [
      fx("m1", "2026-11-03T20:00:00Z", "아틀레티코 마드리드", "바이에른 뮌헨"),
    ],
    recent: [],
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

function setFollows(teams: string[], players: string[] = []): void {
  window.localStorage.setItem(
    FOLLOW_STORAGE_KEY,
    JSON.stringify({ v: 1, teams, players }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetMyDataCache();
  const script = document.createElement("script");
  script.id = MY_DIRECTORY_ID;
  script.type = "application/json";
  script.textContent = JSON.stringify(DIR);
  document.head.appendChild(script);
  fetchMock = vi.fn((url: string) => {
    const key = /\/my\/data\/(.+)\.json$/.exec(url)?.[1] ?? "";
    const body = FILES[key];
    return Promise.resolve(
      body
        ? new Response(JSON.stringify(body), { status: 200 })
        : new Response("", { status: 404 }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.getElementById(MY_DIRECTORY_ID)?.remove();
  act(() => {
    followStore.update(() => EMPTY_FOLLOWS);
  });
  window.localStorage.clear();
});

const board = () =>
  render(
    <MyBoard
      fixturesHead={<h2 id="fx">다음 경기</h2>}
      resultsHead={<h2 id="rs">최근 결과</h2>}
      fixturesHeadingId="fx"
      resultsHeadingId="rs"
    />,
  );

describe("MyBoard", () => {
  it("팔로우 0 — 빈 상태(고르는 곳 링크), 요청 없음", () => {
    board();
    expect(
      screen.getByText("아직 팔로우한 팀·선수가 없어요"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /한국 선수에서 고르기/ }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("팔로우한 것만 받고, 다음 경기는 경기 id로 한 줄 + 걸린 팔로우(팀 → 선수) · 최근 결과는 기준 팀 득점 먼저", async () => {
    setFollows(["bayern-munchen"], ["kim-min-jae"]);
    board();
    await waitFor(() =>
      expect(
        screen.getByRole("article", { name: /다음 경기 — 11.04/ }),
      ).toBeInTheDocument(),
    );
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/euro-digest/my/data/teams/bayern-munchen.json",
      "/euro-digest/my/data/players/kim-min-jae.json",
    ]);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(
      screen.getByText("팔로우:", { exact: false }).parentElement,
    ).toHaveTextContent("팔로우: 바이에른 뮌헨·김민재");
    const results = screen.getByRole("list", {
      name: "최근 결과 — 최근 경기부터",
    });
    expect(results).toHaveTextContent("바이에른 뮌헨");
    expect(
      results.querySelector('[data-slot="result-value"]'),
    ).toHaveTextContent("W승 3-대1");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("받기 실패 — 안내 + 다시 시도(실패한 것만 다시 요청)", async () => {
    setFollows(["arsenal"]);
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("net")));
    board();
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("팀·선수 자료 1개를 받지 못했어요");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 아스널 파일은 없다(404) — 자료 없음 줄
    expect(screen.getByText("예정된 경기 자료가 없어요")).toBeInTheDocument();
  });
});

describe("MyManage · MyHead", () => {
  it("종류별 n / 5, 이름 링크 + 아이콘형 버튼, 푼 항목은 자리에 남아 다시 켤 수 있다", () => {
    setFollows(["bayern-munchen", "arsenal"], ["kim-min-jae"]);
    render(<MyManage where="flow" head={<h2>내 명단</h2>} />);
    const counts = [...document.querySelectorAll("dd")].map((d) =>
      d.textContent?.replace(/\s+/g, ""),
    );
    expect(counts).toEqual(["2/5", "1/5"]);
    expect(screen.getByRole("link", { name: "아스널" })).toBeInTheDocument();
    const off = screen.getByRole("button", { name: "아스널 팔로우" });
    fireEvent.click(off);
    expect(off).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("link", { name: "아스널" })).toBeInTheDocument();
    fireEvent.click(off);
    expect(off).toHaveAttribute("aria-pressed", "true");
  });

  it("한도 띠 — 그 종류가 5개면 종류별 이유 문장", () => {
    setFollows(["a", "b", "c", "d", "e"]);
    render(<MyManage where="contents" head={<p>내 명단</p>} />);
    const band = document.getElementById("my-limit-teams-contents")!;
    expect(band).not.toHaveAttribute("hidden");
    expect(band).toHaveTextContent("팀은 5개까지 팔로우할 수 있어요");
    expect(
      document.getElementById("my-limit-players-contents"),
    ).toHaveAttribute("hidden");
    // 디렉터리에 없는 slug는 slug 글자 + "자료 없음"
    expect(screen.getAllByText("자료 없음")).toHaveLength(5);
  });

  it("머리 — 팔로우 수 · 이름(팀 → 선수) · 이 기기에만 저장", () => {
    setFollows(["bayern-munchen"], ["kim-min-jae"]);
    render(<MyHead runningHead={null} heading={<h1>마이</h1>} />);
    expect(document.querySelector('[data-slot="my-kicker"]')).toHaveTextContent(
      "팔로우 2 · 이 기기에만 저장",
    );
    expect(
      document.querySelector('[data-slot="my-summary"]'),
    ).toHaveTextContent("팀 바이에른 뮌헨 · 선수 김민재");
  });
});

describe("MyBoard — 첫 페인트 전 빈 상태(M4-16)", () => {
  it("부트 스크립트: 팔로우 0이면 <html data-my-empty>, 있으면 달지 않는다 · 섬 이름과 같은 글자", async () => {
    const { MY_EMPTY_ATTR, MY_EMPTY_BOOT_SCRIPT } =
      await import("@/lib/my-empty-boot");
    expect(MY_EMPTY_ATTR).toBe("data-my-empty");
    const html = document.documentElement;
    localStorage.removeItem(FOLLOW_STORAGE_KEY);
    html.removeAttribute(MY_EMPTY_ATTR);
    new Function(MY_EMPTY_BOOT_SCRIPT)();
    expect(html.hasAttribute(MY_EMPTY_ATTR)).toBe(true);
    html.removeAttribute(MY_EMPTY_ATTR);
    localStorage.setItem(
      FOLLOW_STORAGE_KEY,
      JSON.stringify({ v: 1, teams: ["arsenal"], players: [] }),
    );
    new Function(MY_EMPTY_BOOT_SCRIPT)();
    expect(html.hasAttribute(MY_EMPTY_ATTR)).toBe(false);
    localStorage.removeItem(FOLLOW_STORAGE_KEY);
  });
});
