/**
 * M1-31 — 뉴스 카드 변형 6종·머리기사·연결 줄·출처 스택·상대 시간 섬 (src/components/news-feed.tsx · news/feed-card.tsx ·
 * news/feed-island.tsx, PRD FR-30, D23·D30, DESIGN.md §9.3).
 *
 * fixtures/news-sample.json(혼합안과 같은 23장)을 실제 설정(names.ko·competitions·korean-players)으로 그린다.
 * 실제 색·크기·폭별 배치는 견본 e2e(tests/e2e-specimen/news-cards.spec.ts)가 브라우저에서 본다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NewsFeed } from "@/components/news-feed";
import {
  cardRelativeTime,
  FeedIsland,
  fillRelativeTimes,
  toggleSourceStack,
} from "@/components/news/feed-island";
import { CardTitle, titleSegments } from "@/components/ui/card";
import { NewsFileSchema } from "@/lib/schema/news";
import { formatKst } from "@/lib/time";

const sample = NewsFileSchema.parse(
  JSON.parse(readFileSync(path.resolve("fixtures/news-sample.json"), "utf8")),
);
const byId = new Map(sample.cards.map((c) => [c.id, c]));

function article(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`${id} 없음`);
  return el;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("NewsFeed — 카드 변형 6종(fixtures 23장)", () => {
  it("파일 순서 그대로 23장, 게재 번호 06~28(aria-hidden), 목록 role=list", () => {
    render(<NewsFeed news={sample} />);
    const list = screen.getByRole("list", { name: "" });
    expect(list).toHaveAttribute("id", "feed");
    const articles = screen.getAllByRole("article");
    expect(articles.map((a) => a.id)).toEqual(sample.cards.map((c) => c.id));
    const numbers = articles.map(
      (a) => a.querySelector("[aria-hidden='true']")?.textContent,
    );
    expect(numbers).toEqual(
      sample.cards.map((_, i) => String(6 + i).padStart(2, "0")),
    );
  });

  it("원제목은 무수정(D23) — 링크 글자 = 원제목 + ↗ + 화면 밖 안내, 제목 lang = 카드 lang", () => {
    render(<NewsFeed news={sample} />);
    for (const card of sample.cards) {
      const heading = within(article(card.id)).getByRole("heading", {
        level: 3,
      });
      expect(heading).toHaveAttribute("lang", card.lang);
      const link = within(heading).getByRole("link");
      expect(link.textContent).toBe(
        `${card.t}↗(원문 ${card.src[0]?.n}, 새 창)`,
      );
      expect(link).toHaveAttribute("href", card.src[0]?.u);
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("요약 줄·'AI 작성' 라벨이 없다(D23·D24)", () => {
    const { container } = render(<NewsFeed news={sample} />);
    expect(container.textContent).not.toContain("AI 작성");
  });

  it("머리기사는 첫 카드 1장(data-lead) — lead={false}(머리기사 없는 피드)면 없다", () => {
    const { unmount } = render(<NewsFeed news={sample} />);
    const leads = screen
      .getAllByRole("article")
      .filter((a) => a.hasAttribute("data-lead"));
    expect(leads.map((a) => a.id)).toEqual(["c_f598c95798"]);
    // 1024 이상에서만, 카드에 data-lead가 있을 때만 크게 — 필터 결과(M1-33)는 속성을 지운다. 1023 이하 일반 카드 모양
    const leadTitle = within(article("c_f598c95798")).getByRole("heading");
    expect(leadTitle.className).toContain(
      "lg:group-data-lead/card:text-type-lead-latin",
    );
    expect(leadTitle.className).not.toMatch(/(^|\s)(lg:)?text-type-lead/);
    expect(article("c_f598c95798").className).toContain(
      "lg:data-lead:border-b-2",
    );
    // 필터가 걸리지 않는 피드에는 필터 표식이 없다
    expect(document.querySelector("[data-nf-lead], [data-nf-card]")).toBeNull();
    unmount();
    render(<NewsFeed news={sample} lead={false} />);
    expect(document.querySelector("[data-lead]")).toBeNull();
  });

  it("중요도 막대 role=img '중요도 n/5'", () => {
    render(<NewsFeed news={sample} />);
    for (const card of sample.cards) {
      expect(
        within(article(card.id)).getByRole("img", {
          name: `중요도 ${card.imp}/5`,
        }),
      ).toBeInTheDocument();
    }
  });

  it("④ 한국 선수 — kr 카드에만 완장 '한국'(title '한국 선수 관련'), 한국 선수 태그만 굵게", () => {
    render(<NewsFeed news={sample} />);
    for (const card of sample.cards) {
      const arm = article(card.id).querySelector("[title='한국 선수 관련']");
      expect(Boolean(arm), card.id).toBe(card.kr);
      if (arm) expect(arm.textContent).toBe("한국");
    }
    const tags = within(article("c_d8eac2777b")).getByRole("list", {
      name: "태그",
    });
    const bold = within(tags)
      .getAllByRole("listitem")
      .filter((li) => li.className.includes("font-extrabold"))
      .map((li) => li.textContent);
    expect(bold).toEqual(["설영우", "김민재"]);
  });

  it("태그에 slug 문자열이 나오지 않는다(사전에 없는 slug는 그리지 않음)", () => {
    render(<NewsFeed news={sample} />);
    for (const list of screen.queryAllByRole("list", { name: "태그" })) {
      expect(list.textContent).not.toMatch(/[a-z]+-[a-z]+/);
    }
    // c_c4f20b673e: marcos-rojo는 사전에 없다 → 팀 태그만
    const rojo = within(article("c_c4f20b673e")).getByRole("list", {
      name: "태그",
    });
    expect(rojo.textContent).not.toContain("rojo");
  });

  it("③ 이적 — 단계 줄(구멍 role=img 접근 이름) + Tier 배지(화면 밖 '출처 '), transfer 없으면 도장만", () => {
    render(<NewsFeed news={sample} />);
    const collapsed = article("c_c19e60220d");
    expect(within(collapsed).getByText("이적")).toBeInTheDocument();
    expect(
      within(collapsed).getByRole("img", { name: "이적 단계: 결렬" }),
    ).toBeInTheDocument();
    expect(within(collapsed).getByText(/Tier 3/).textContent).toBe(
      "출처 Tier 3",
    );
    expect(
      within(article("c_c4f20b673e")).getByRole("img", {
        name: "이적 단계: 공식 (4단계 중 4)",
      }),
    ).toBeInTheDocument();
    const noStage = article("c_c2061f1944");
    expect(within(noStage).getByText("이적")).toBeInTheDocument();
    expect(
      within(noStage).queryByRole("img", { name: /이적 단계/ }),
    ).toBeNull();
  });

  it("인덱스 탭 — 약칭 글자 + title 정식 이름, 대회 둘이면 둘, 대회 없으면 없음", () => {
    render(<NewsFeed news={sample} />);
    const two = article("c_b24a3b9263");
    const tabs = [...two.querySelectorAll("[data-slot='index-tab']")];
    expect(tabs.map((t) => [t.textContent, t.getAttribute("title")])).toEqual([
      ["EPL", "프리미어리그"],
      ["분데스", "분데스리가"],
    ]);
    expect(
      article("c_8630993971").querySelector("[data-slot='index-tab']"),
    ).toBeNull();
  });

  it("② 다출처 — '+N곳' 버튼(aria-expanded·aria-controls) → 닫힌 목록(행마다 원문 링크 새 창)", () => {
    render(<NewsFeed news={sample} />);
    const button = within(article("c_f598c95798")).getByRole("button", {
      name: "+2곳 출처 더 보기",
    });
    expect(button).toHaveAttribute("aria-expanded", "false");
    const list = document.getElementById(
      button.getAttribute("aria-controls") ?? "",
    );
    expect(list).not.toBeNull();
    expect(list).toHaveAttribute("hidden");
    const rows = within(list as HTMLElement).getAllByRole("link", {
      hidden: true,
    });
    expect(rows.map((r) => r.getAttribute("href"))).toEqual(
      byId.get("c_f598c95798")?.src.map((s) => s.u),
    );
    for (const row of rows) expect(row).toHaveAttribute("target", "_blank");
    // 출처 1건 카드는 버튼이 없다
    expect(within(article("c_c4f20b673e")).queryByRole("button")).toBeNull();
  });

  it("② '+N건' — 추가 출처가 모두 같은 매체면 '+N건'(화면 밖 '같은 매체 기사 더 보기'), 같은 펼침 목록(사용자 결정 2026-10-19)", () => {
    const base = byId.get("c_d8ecc21d28");
    if (!base?.src[0]) throw new Error("fixture");
    const same = {
      ...base,
      id: "c_e000000003",
      src: [
        base.src[0],
        {
          ...base.src[0],
          u: "https://example.com/same-outlet/",
          at: "2026-10-10T20:00:00Z",
        },
      ],
    };
    render(<NewsFeed news={{ ...sample, cards: [same] }} />);
    const button = within(article("c_e000000003")).getByRole("button", {
      name: "+1건 같은 매체 기사 더 보기",
    });
    expect(button.textContent).toBe("+1건 같은 매체 기사 더 보기");
    const list = document.getElementById(
      button.getAttribute("aria-controls") ?? "",
    ) as HTMLElement;
    expect(
      within(list)
        .getAllByRole("link", { hidden: true })
        .map((a) => a.getAttribute("href")),
    ).toEqual([base.src[0].u, "https://example.com/same-outlet/"]);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(list.hidden).toBe(false);
  });

  it("연결 줄 — 짝 앵커·게재 번호(화면 밖 '게재 번호 ')·매체명·방향, 혼합안 4쌍 8줄", () => {
    render(<NewsFeed news={sample} />);
    const line = within(article("c_f598c95798")).getByRole("link", {
      name: "같은 소식 국내 보도 게재 번호 14 인터풋볼",
    });
    expect(line).toHaveAttribute("href", "#c_744396ca78");
    expect(line.textContent).toContain("↓");
    const back = within(article("c_744396ca78")).getByRole("link", {
      name: "같은 소식 해외 보도 게재 번호 06 BBC Sport",
    });
    expect(back).toHaveAttribute("href", "#c_f598c95798");
    expect(back.textContent).toContain("↑");
    expect(document.querySelectorAll("article a[href^='#c_']")).toHaveLength(8);
  });

  it("시각 — <time datetime=대표 출처 UTC>에 절대 시각(KST), 상대 시간 칸은 섬이 채운다", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-11T06:54:00Z")); // 혼합안 기준 15:54 KST
    render(<NewsFeed news={sample} />);
    const time = article("c_f598c95798").querySelector("time[data-rel]");
    expect(time).toHaveAttribute("datetime", "2026-10-10T19:24:23Z");
    expect(time?.textContent).toContain(
      formatKst("2026-10-10T19:24:23Z", "short"),
    );
    expect(time?.querySelector("[data-rel-out]")?.textContent).toBe(
      "11시간 전",
    );
    // 1분마다 다시 계산
    act(() => {
      vi.setSystemTime(new Date("2026-10-11T07:54:00Z"));
      vi.advanceTimersByTime(60_000);
    });
    expect(time?.querySelector("[data-rel-out]")?.textContent).toBe(
      "12시간 전",
    );
  });

  it("섬이 '+N곳'을 펼치고 접는다(같은 피드 안에서만)", () => {
    render(<NewsFeed news={sample} />);
    const button = within(article("c_6fa142d217")).getByRole("button", {
      name: "+1곳 출처 더 보기",
    });
    const list = document.getElementById(
      button.getAttribute("aria-controls") ?? "",
    ) as HTMLElement;
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(list.hidden).toBe(false);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(list.hidden).toBe(true);
  });

  it("빈 상태 — 호 없음 / 카드 0장", () => {
    const { unmount } = render(<NewsFeed news={null} />);
    expect(screen.getByText("아직 발행된 소식이 없어요.")).toBeInTheDocument();
    unmount();
    render(<NewsFeed news={{ ...sample, cards: [] }} />);
    expect(
      screen.getByText("이 호에는 실린 소식이 없어요."),
    ).toBeInTheDocument();
  });
});

describe("피드 섬 — 순수 도우미", () => {
  it("fillRelativeTimes — 읽을 수 없는 시각은 비워 두고 절대 시각은 그대로", () => {
    document.body.innerHTML = `<div id="r"><time data-rel datetime="2026-10-11T05:54:00Z"><span data-rel-out></span><span>10.11 14:54</span></time><time data-rel datetime="bad"><span data-rel-out>x</span></time></div>`;
    const root = document.getElementById("r") as HTMLElement;
    fillRelativeTimes(root, new Date("2026-10-11T06:54:00Z"));
    const outs = root.querySelectorAll("[data-rel-out]");
    expect(outs[0]?.textContent).toBe("1시간 전");
    expect(outs[1]?.textContent).toBe("");
    expect(root.textContent).toContain("10.11 14:54");
  });

  it("cardRelativeTime — 기기 시계보다 미래인 원문 시각은 '방금'(긴 날짜 표기로 칸을 넘치지 않게), 과거는 relativeKst 그대로", () => {
    const now = new Date("2026-10-11T06:54:00Z");
    expect(cardRelativeTime("2026-10-11T06:54:30Z", now)).toBe("방금");
    expect(cardRelativeTime("2026-10-11T08:00:00Z", now)).toBe("방금");
    expect(cardRelativeTime("2026-10-12T08:00:00Z", now)).toBe("방금");
    expect(cardRelativeTime("2026-10-10T19:24:23Z", now)).toBe("11시간 전");
    expect(() => cardRelativeTime("bad", now)).toThrow();
    // 섬도 같은 규칙
    document.body.innerHTML = `<div id="f"><time data-rel datetime="2026-10-11T09:00:00Z"><span data-rel-out></span></time></div>`;
    const root = document.getElementById("f") as HTMLElement;
    fillRelativeTimes(root, now);
    expect(root.querySelector("[data-rel-out]")?.textContent).toBe("방금");
  });

  it("toggleSourceStack — 범위 밖 버튼·다른 요소는 무시", () => {
    document.body.innerHTML = `<div id="a"><button data-src-toggle aria-expanded="false" aria-controls="l">+1곳</button><ol id="l" hidden></ol></div><div id="b"><button data-src-toggle aria-expanded="false" aria-controls="m">+1곳</button><ol id="m" hidden></ol></div>`;
    const a = document.getElementById("a") as HTMLElement;
    const other = document.querySelector("#b button") as HTMLElement;
    toggleSourceStack(a, other);
    expect(other).toHaveAttribute("aria-expanded", "false");
    toggleSourceStack(a, a);
    expect(a.querySelector("button")).toHaveAttribute("aria-expanded", "false");
    toggleSourceStack(a, a.querySelector("button"));
    expect(a.querySelector("button")).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("l")?.hidden).toBe(false);
  });

  it("FeedIsland는 아무것도 그리지 않고, 범위 요소가 없으면 조용히 끝난다", () => {
    const { container } = render(<FeedIsland rootId="none" />);
    expect(container.innerHTML).toBe("");
  });
});

describe("원제목 조각 — 짧은 하이픈 단어 붙이기(DESIGN §3.6)", () => {
  it.each([
    ["Solanke scores in added time as 10-man Spurs draw with Man", ["10-man"]],
    ["아우크스부르크에 2-2", ["2-2"]],
    ["Arsenal 2–1 Leeds", ["2–1"]],
    ["Police officer hurt after Liverpool-Man City game", []],
    ["an end-of-season review", []],
    ["(2-1) 승리", ["(2-1)"]],
    ["no hyphen here", []],
  ])("%s → %j", (text, nobr) => {
    const segments = titleSegments(text);
    expect(segments.map((s) => s.text).join("")).toBe(text);
    expect(segments.filter((s) => s.nobr).map((s) => s.text)).toEqual(nobr);
  });

  it("제목 링크 — 한글은 위아래 13px(44px 이상), 라틴은 10px", () => {
    const { rerender } = render(
      <CardTitle id="t" href="https://example.com/" lang="ko" source="인터풋볼">
        한글 제목
      </CardTitle>,
    );
    expect(screen.getByRole("link").className).toContain("py-3.25");
    rerender(
      <CardTitle id="t" href="https://example.com/" lang="en" source="BBC">
        Latin title
      </CardTitle>,
    );
    expect(screen.getByRole("link").className).toContain("py-2.5");
  });

  it("짧은 하이픈 단어는 줄바꿈 없는 칸에 들어간다", () => {
    render(
      <CardTitle id="t" href="https://example.com/" lang="en" source="BBC">
        Solanke scores as 10-man Spurs draw
      </CardTitle>,
    );
    const nobr = [
      ...screen.getByRole("link").querySelectorAll(".whitespace-nowrap"),
    ].map((el) => el.textContent);
    expect(nobr).toEqual(["10-man", "draw↗"]);
  });
});
