/**
 * 검색 UI·로더 (M4-14, FR-130~132) — 숨은 레코드 HTML · 입력 전 색인 · 단축키 판정 · 화면 상태 · 결과 묶음(결과 가림) · 실제 설정·데이터 레코드
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KoreanIndex } from "@/components/search/korean-index";
import { isSearchShortcut } from "@/components/search/search-button";
import { SearchRecord } from "@/components/search/search-record";
import {
  countSummary,
  ListboxGroups,
  NoResults,
  PageGroups,
} from "@/components/search/search-results";
import { viewState } from "@/components/search/use-search";
import { listNewsDates, loadNewsIssue } from "@/lib/data/news";
import {
  loadNewsSearchRecords,
  loadSearchIndexPlayers,
} from "@/lib/data/search";
import type { NewsHit } from "@/lib/search/model";
import type { SearchGroup } from "@/lib/search/pagefind-client";

describe("숨은 검색 레코드(SearchRecord)", () => {
  it("data-pagefind-body · 유형 필터 속성 · 메타 요소(본문 제외) · 별칭 문단, 화면에는 숨김", () => {
    const { container } = render(
      <SearchRecord
        record={{
          type: "team",
          meta: [
            ["title", "바이에른 뮌헨"],
            ["sub", "김민재 소속"],
          ],
          aliases: ["바이에른 뮌헨", "Bayern", "민재"],
        }}
      />,
    );
    const root = container.querySelector("[data-pagefind-body]")!;
    expect(root).toHaveAttribute("hidden");
    expect(root).toHaveAttribute("data-pagefind-filter", "type:team");
    const metas = root.querySelectorAll("[data-pagefind-meta]");
    expect(
      [...metas].map((m) => [
        m.getAttribute("data-pagefind-meta"),
        m.textContent,
      ]),
    ).toEqual([
      ["title", "바이에른 뮌헨"],
      ["sub", "김민재 소속"],
    ]);
    metas.forEach((m) => expect(m).toHaveAttribute("data-pagefind-ignore"));
    expect(root.querySelector("p")).toHaveTextContent(
      "바이에른 뮌헨 Bayern 민재",
    );
  });
});

describe("입력 전 색인(KoreanIndex)", () => {
  it("활동 중인 한국 선수를 초성 칸으로, 이름 → 선수 상세", () => {
    const players = loadSearchIndexPlayers();
    expect(players.length).toBeGreaterThan(0);
    render(<KoreanIndex players={players} />);
    expect(screen.getByText(/색인 — 한국 선수/)).toHaveTextContent(
      `한국 선수 ${players.length}`,
    );
    const g = screen.getByRole("list", { name: "ㄱ" });
    const link = within(g).getByRole("link", { name: /김민재/ });
    expect(link.getAttribute("href")).toMatch(
      /\/korean-players\/kim-min-jae\/?$/,
    );
    expect(within(link).getByText("Min-jae Kim")).toHaveAttribute("lang", "en");
  });
});

describe("단축키(FR-132)", () => {
  const key = (k: string, extra: Partial<KeyboardEvent> = {}) => ({
    key: k,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    defaultPrevented: false,
    ...extra,
  });
  it("⌘K · Ctrl+K만 — 글자 하나 단축키 '/'는 없다(2026-11-02 사용자 결정 · WCAG 2.1.4)", () => {
    expect(isSearchShortcut(key("/"))).toBe(false);
    expect(isSearchShortcut(key("/", { ctrlKey: true }))).toBe(false);
    expect(isSearchShortcut(key("k", { metaKey: true }))).toBe(true);
    expect(isSearchShortcut(key("K", { ctrlKey: true }))).toBe(true);
    expect(isSearchShortcut(key("k", { ctrlKey: true, altKey: true }))).toBe(
      false,
    );
    expect(isSearchShortcut(key("k"))).toBe(false);
    expect(
      isSearchShortcut(key("k", { ctrlKey: true, isComposing: true })),
    ).toBe(false);
    expect(
      isSearchShortcut(key("k", { metaKey: true, defaultPrevented: true })),
    ).toBe(false);
  });
});

describe("화면 상태(viewState)", () => {
  const ready = { status: "ready" as const, query: "김민", groups: [] };
  it("검색어 없음 = idle, 끝난 검색이 지금 검색어면 그대로, 앞 결과가 있으면 유지, 없으면 loading", () => {
    expect(viewState("", ready).status).toBe("idle");
    expect(viewState("김민", ready)).toBe(ready);
    expect(viewState("김민재", ready)).toBe(ready);
    expect(
      viewState("김민재", { status: "error", query: "김", groups: [] }),
    ).toEqual({
      status: "loading",
      query: "김민재",
      groups: [],
    });
  });
});

const NEWS: NewsHit = {
  type: "news",
  url: "/euro-digest/news/2026-11-02/#c_0123456789",
  link: "https://example.com/a",
  title: "바이에른 2-2 도르트문트",
  lang: "ko",
  src: "인터풋볼",
  srcLang: "ko",
  at: "2026-11-01T20:00:00Z",
  abs: "11.02 05:00",
  cat: "경기 결과",
  tags: [{ label: "김민재", korean: true }],
  kr: true,
  spoiler: true,
};

const GROUPS: SearchGroup[] = [
  {
    type: "player",
    total: 1,
    hits: [
      {
        type: "player",
        url: "/euro-digest/korean-players/kim-min-jae/",
        name: "김민재",
        en: "Min-jae Kim",
        team: "바이에른 뮌헨",
        pos: "DF",
        kit: { short: "FCB", colors: ["#D3052B", "#FFFFFF", "#FFFFFF"] },
      },
    ],
  },
  { type: "team", total: 0, hits: [] },
  { type: "competition", total: 0, hits: [] },
  { type: "news", total: 37, hits: [NEWS] },
];

describe("오버레이 결과(listbox)", () => {
  it("listbox 안 group · option만, 0건 묶음은 그리지 않음, 선택 옵션 aria-selected", () => {
    render(
      <ListboxGroups
        id="r"
        prefix="p"
        groups={GROUPS}
        active={1}
        spoiler={false}
        now={new Date("2026-11-02T00:00:00Z")}
        onHover={() => {}}
      />,
    );
    const box = screen.getByRole("listbox", { name: "검색 결과" });
    const groups = within(box).getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("aria-labelledby"))).toEqual([
      "p-player-h",
      "p-news-h",
    ]);
    const options = within(box).getAllByRole("option");
    expect(options.map((o) => o.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
    ]);
    expect(options[0]).toHaveAttribute(
      "href",
      "/euro-digest/korean-players/kim-min-jae/",
    );
    expect(options[1]).toHaveAttribute("href", "https://example.com/a");
    expect(options[1]).toHaveAttribute("target", "_blank");
    expect(options[1]).toHaveTextContent("바이에른 2-2 도르트문트");
    expect(options[1]).toHaveTextContent("(원문 인터풋볼, 새 창)");
  });

  it("결과 가림이 켜지면 spoiler 뉴스 제목 대신 빗금 띠", () => {
    render(
      <ListboxGroups
        id="r"
        prefix="p"
        groups={GROUPS}
        active={-1}
        spoiler
        now={new Date("2026-11-02T00:00:00Z")}
        onHover={() => {}}
      />,
    );
    const news = screen.getAllByRole("option")[1]!;
    expect(news).not.toHaveTextContent("2-2");
    expect(news).toHaveTextContent("결과 가림");
    expect(news).toHaveTextContent("경기 결과 제목");
  });

  it("결과가 없으면 listbox를 숨긴다(입력의 aria-controls 대상은 남김)", () => {
    const { container } = render(
      <ListboxGroups
        id="r"
        prefix="p"
        groups={[{ type: "news", total: 0, hits: [] }]}
        active={-1}
        spoiler={false}
        now={new Date()}
        onHover={() => {}}
      />,
    );
    expect(container.querySelector("#r")).toHaveAttribute("hidden");
  });

  it("요약 줄 — 대회는 찾았을 때만", () => {
    expect(countSummary(GROUPS)).toBe("선수 1 · 팀 0 · 뉴스 37");
  });
});

describe("결과 없음(D3 — M5-17, DESIGN §9.3 D3 검색 결과 없음)", () => {
  it("윤곽 '0' --num-n2(장식) + 문장 + 안내 + 유형 4개(선수 · 팀 · 대회 · 뉴스) 윤곽 0, 결과가 0으로 바뀔 때만 찍힘(모션 줄이기면 없음)", () => {
    render(<NoResults query="Magdeburg" />);
    const box = document.querySelector("[data-slot=search-none]")!;
    expect(box.className).toContain("animate-stamp");
    expect(box.className).toContain("motion-reduce:animate-none");
    const zero = box.querySelector(":scope > [aria-hidden=true]")!;
    expect(zero).toHaveTextContent("0");
    expect(zero.className).toContain("text-num-n2");
    expect(zero.className).toContain("text-transparent");
    expect(box).toHaveTextContent("“Magdeburg” 결과가 없어요");
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "선수0",
      "팀0",
      "대회0",
      "뉴스0",
    ]);
    for (const li of items)
      expect(li.querySelector("span")?.className).toContain(
        "[-webkit-text-stroke:1.25px_var(--ink-2)]",
      );
  });
});

describe("/search/ 결과", () => {
  it("묶음 제목(h2) + 0건 줄, 결과 가림 띠의 '보기'", () => {
    let revealed = "";
    render(
      <PageGroups
        groups={GROUPS}
        spoiler
        now={new Date("2026-11-02T00:00:00Z")}
        revealed={new Set()}
        onReveal={(url) => {
          revealed = url;
        }}
        moreNews={null}
        moreBusy={false}
      />,
    );
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["선수1", "팀0", "뉴스37"]);
    expect(screen.getByText("찾은 팀이 없어요")).toBeInTheDocument();
    expect(screen.queryByText("바이에른 2-2 도르트문트")).toBeNull();
    screen.getByRole("button", { name: "보기" }).click();
    expect(revealed).toBe(NEWS.url);
  });
});

describe("뉴스 레코드 로더(실제 data/news — 삭제 요청 제외 로더)", () => {
  it("카드마다 하나 · 카드 앵커 URL · 최신 호부터", () => {
    const records = loadNewsSearchRecords();
    const cards = listNewsDates().flatMap((d) => loadNewsIssue(d)?.cards ?? []);
    expect(records.length).toBe(new Set(cards.map((c) => c.id)).size);
    for (const r of records.slice(0, 50)) {
      expect(r.url).toMatch(/^\/news\/\d{4}-\d{2}-\d{2}\/#c_[0-9a-f]{10}$/);
      expect(r.meta.link).toMatch(/^https?:\/\//);
      expect(r.filters.type).toEqual(["news"]);
    }
    const dates = records.map((r) => r.url.slice(6, 16));
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
