/**
 * M4-10 · M4-12 — `/my` 내보내기 버튼 · 가져오기 확인 띠 · 내 팀 일정 구독 (src/components/my/my-tools.tsx · my-import.tsx ·
 * my-import-band.tsx · my-share-actions.ts — PRD FR-114 · FR-115, §15 D67 ③)
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exportFollows } from "@/components/my/my-share-actions";
import { MyImport } from "@/components/my/my-import";
import { MyExportTools, MyTeamIcs } from "@/components/my/my-tools";
import { Toaster } from "@/components/ui/toast";
import { EMPTY_FOLLOWS, FOLLOW_STORAGE_KEY } from "@/lib/follow";
import { MY_DIRECTORY_ID, type MyDirectory } from "@/lib/my-view";
import { absoluteUrl } from "@/lib/paths";

const DIR: MyDirectory = {
  teams: {
    "bayern-munchen": {
      n: "바이에른 뮌헨",
      s: "FCB",
      c: ["#D3052B", "#FFFFFF"],
      u: "분데스 1위",
    },
    arsenal: { n: "아스널", s: "ARS", u: "EPL 1위" },
    chelsea: { n: "첼시", s: "CHE", u: "EPL 2위" },
    liverpool: { n: "리버풀", s: "LIV", u: "EPL 3위" },
    milan: { n: "AC 밀란", s: "MIL", u: "세리에 1위" },
    napoli: { n: "나폴리", s: "NAP", u: "세리에 2위" },
    "union-berlin": { n: "Union Berlin", l: 1, s: "FCU", u: "분데스" },
  },
  players: {
    "kim-min-jae": { n: "김민재", t: "바이에른 뮌헨" },
    "lee-kang-in": { n: "이강인", t: "PSG", tl: 1 },
  },
};

const state = (teams: string[], players: string[] = []) => ({
  v: 1 as const,
  teams,
  players,
});

function setFollows(teams: string[], players: string[] = []): void {
  window.localStorage.setItem(
    FOLLOW_STORAGE_KEY,
    JSON.stringify({ v: 1, teams, players }),
  );
}

function stored(): unknown {
  return JSON.parse(window.localStorage.getItem(FOLLOW_STORAGE_KEY) ?? "null");
}

beforeEach(() => {
  window.localStorage.clear();
  if (!document.getElementById(MY_DIRECTORY_ID)) {
    const script = document.createElement("script");
    script.id = MY_DIRECTORY_ID;
    script.type = "application/json";
    script.textContent = JSON.stringify(DIR);
    document.head.appendChild(script);
  }
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("내보내기 버튼", () => {
  it("팔로우 0 → 비활성, 있으면 활성 · 설명 줄", () => {
    const { rerender } = render(
      <MyExportTools follows={EMPTY_FOLLOWS} ready where="flow" />,
    );
    const copy = screen.getByRole("button", { name: "내보내기 — 링크 복사" });
    expect(copy).toBeDisabled();
    expect(copy).toHaveAccessibleDescription(
      /다른 기기에서 열면 합치거나 덮어쓸 수/,
    );
    rerender(<MyExportTools follows={state(["arsenal"])} ready where="flow" />);
    expect(copy).toBeEnabled();
  });

  it("하이드레이션 전(ready false)은 숨김 · 비활성", () => {
    const { container } = render(
      <MyExportTools follows={state(["arsenal"])} ready={false} where="flow" />,
    );
    expect(container.querySelector('[data-slot="my-tools"]')).toHaveAttribute(
      "hidden",
    );
    expect(
      screen.getByRole("button", {
        name: "내보내기 — 링크 복사",
        hidden: true,
      }),
    ).toBeDisabled();
  });

  it("Web Share가 없으면 복사만, 있으면 공유 버튼도", () => {
    const { unmount } = render(
      <MyExportTools follows={state(["arsenal"])} ready where="flow" />,
    );
    expect(
      screen.queryByRole("button", { name: "내보내기 — 공유" }),
    ).toBeNull();
    unmount();
    vi.stubGlobal("navigator", { ...navigator, share: vi.fn() });
    render(<MyExportTools follows={state(["arsenal"])} ready where="flow" />);
    expect(
      screen.getByRole("button", { name: "내보내기 — 공유" }),
    ).toBeEnabled();
  });
});

describe("exportFollows", () => {
  const url = `${absoluteUrl("/my/")}?t=arsenal&p=kim-min-jae`;

  function fakeWin(nav: Partial<Navigator>): Window {
    return {
      navigator: nav as Navigator,
      matchMedia: () => ({ matches: false }) as MediaQueryList,
      history: window.history,
    } as unknown as Window;
  }

  it("복사 → 클립보드에 공유 URL + 토스트", async () => {
    render(<Toaster />);
    const writeText = vi.fn(() => Promise.resolve());
    const outcome = await act(() =>
      exportFollows(
        state(["arsenal"], ["kim-min-jae"]),
        "copy",
        fakeWin({ clipboard: { writeText } as unknown as Clipboard }),
      ),
    );
    expect(outcome).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(url);
    expect(await screen.findByText("링크를 복사했어요")).toBeInTheDocument();
  });

  it("공유 → share 시트(토스트 없음), 취소(AbortError)는 조용히", async () => {
    const share = vi.fn(() => Promise.resolve());
    expect(
      await exportFollows(
        state(["arsenal"], ["kim-min-jae"]),
        "share",
        fakeWin({ share }),
      ),
    ).toBe("shared");
    expect(share).toHaveBeenCalledWith({ url });
    const abort = vi.fn(() =>
      Promise.reject(new DOMException("x", "AbortError")),
    );
    expect(
      await exportFollows(
        state(["arsenal"]),
        "share",
        fakeWin({ share: abort }),
      ),
    ).toBe("cancelled");
  });

  it("클립보드도 막히면 주소창에 링크를 띄우고 안내", async () => {
    render(<Toaster />);
    const outcome = await act(() =>
      exportFollows(state(["arsenal"]), "copy", fakeWin({})),
    );
    expect(outcome).toBe("failed");
    expect(window.location.search).toBe("?t=arsenal");
    expect(
      await screen.findByText(/주소창에 띄운 링크를 복사해 주세요/),
    ).toBeInTheDocument();
  });

  it("팔로우 0이면 아무것도 하지 않는다", async () => {
    expect(await exportFollows(EMPTY_FOLLOWS, "copy", fakeWin({}))).toBeNull();
  });
});

describe("가져오기 확인 띠", () => {
  function open(search: string) {
    window.history.replaceState(null, "", `/my/${search}`);
    return render(
      // 페이지와 같은 순서 — 토스터(레이아웃)가 먼저 구독한다
      <>
        <Toaster />
        <MyImport />
      </>,
    );
  }

  it("쿼리가 없으면 아무것도 없다", () => {
    window.history.replaceState(null, "", "/my/");
    const { container } = render(<MyImport />);
    // 숨은 빈 자리만(부트가 열지 않으면 보이지 않는다)
    expect(
      container.querySelector('[data-slot="my-import-slot"]'),
    ).toBeEmptyDOMElement();
  });

  it("미리보기 · 방식별 결과 · 모르는 항목 → 합치기(기본) 반영 · 주소 정리", async () => {
    setFollows(
      ["bayern-munchen", "chelsea", "liverpool", "milan"],
      ["kim-min-jae"],
    );
    open("?t=arsenal,napoli,Chelsea,ghost&p=lee-kang-in");
    const band = await screen.findByRole("region", {
      name: "받은 팔로우를 가져올까요?",
    });
    const preview = screen.getByRole("list", { name: "들어올 항목" });
    expect(preview).toHaveTextContent("아스널");
    expect(preview).toHaveTextContent("나폴리");
    expect(preview).toHaveTextContent("첼시(팀 · 팔로우 중)");
    expect(band).toHaveTextContent("공유 링크 · 팀 3 · 선수 1 · ✓ 이미 팔로우");
    expect(preview).toHaveTextContent("이강인");
    expect(band).toHaveTextContent(
      "합치기지금 팔로우에 더하면 팀 5 · 선수 2 · 한도로 1개 빠짐",
    );
    expect(band).toHaveTextContent("덮어쓰기이 링크로 바꾸면 팀 3 · 선수 1");
    expect(band).toHaveTextContent("모르는 항목 1개는 빼요");

    const merge = screen.getByRole("button", { name: "합치기" });
    expect(merge).toHaveAccessibleDescription(/더하면 팀 5 · 선수 2/);
    fireEvent.click(merge);
    expect(stored()).toEqual(
      state(
        ["bayern-munchen", "chelsea", "liverpool", "milan", "arsenal"],
        ["kim-min-jae", "lee-kang-in"],
      ),
    );
    expect(
      await screen.findByText(
        "팔로우를 합쳤어요 · 한도 때문에 1개가 빠졌어요 · 모르는 항목 1개",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region")).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("덮어쓰기 → 들어온 것만", async () => {
    setFollows(["bayern-munchen"], ["kim-min-jae"]);
    open("?t=arsenal");
    fireEvent.click(await screen.findByRole("button", { name: "덮어쓰기" }));
    expect(stored()).toEqual(state(["arsenal"]));
    expect(await screen.findByText("팔로우를 덮어썼어요")).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("취소 → 바꾸지 않고 주소만 정리(다른 쿼리는 남긴다)", async () => {
    setFollows(["bayern-munchen"]);
    open("?t=arsenal&x=1");
    fireEvent.click(await screen.findByRole("button", { name: "취소" }));
    expect(stored()).toEqual(state(["bayern-munchen"]));
    expect(screen.queryByRole("region")).toBeNull();
    expect(window.location.search).toBe("?x=1");
  });

  it("이미 같은 팔로우 → 띠 없이 안내", async () => {
    setFollows(["arsenal"], ["kim-min-jae"]);
    open("?p=kim-min-jae&t=arsenal");
    expect(await screen.findByText("이미 같은 팔로우예요")).toBeInTheDocument();
    expect(screen.queryByRole("region")).toBeNull();
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("가져올 것이 없으면(빈 값 · 모르는 항목) 안내", async () => {
    open("?t=&p=ghost");
    expect(
      await screen.findByText("가져올 팔로우가 없어요 · 모르는 항목 1개"),
    ).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe(""));
  });
});

describe("내 팀 일정 구독(FR-115)", () => {
  it("디렉터리에 있는 팔로우 팀마다 .ics 링크, 라틴 이름은 lang", () => {
    render(
      <MyTeamIcs
        follows={state(
          ["bayern-munchen", "ghost-fc", "union-berlin"],
          ["kim-min-jae"],
        )}
        ready
        dir={DIR}
        where="flow"
      />,
    );
    const list = screen.getByRole("list", { name: "내 팀 일정 구독" });
    const links = list.querySelectorAll("a");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute(
      "href",
      expect.stringMatching(/\/calendar\/bayern-munchen\.ics$/),
    );
    expect(links[0]).toHaveAccessibleName("경기 일정 .ics — 바이에른 뮌헨");
    expect(links[1]!.querySelector('[lang="en"]')).toHaveTextContent(
      "Union Berlin",
    );
    expect(
      screen.getByText(/캘린더 앱에서 팀마다 구독해요/),
    ).toBeInTheDocument();
  });

  it("팀 0(선수만) · 하이드레이션 전이면 숨김", () => {
    const { container, rerender } = render(
      <MyTeamIcs
        follows={state([], ["kim-min-jae"])}
        ready
        dir={DIR}
        where="flow"
      />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <MyTeamIcs
        follows={state(["arsenal"])}
        ready={false}
        dir={DIR}
        where="flow"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
