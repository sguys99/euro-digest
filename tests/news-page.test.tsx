import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewsPage from "@/app/news/page";
import NotFound from "@/app/not-found";
import { NewsFileSchema, type NewsFile } from "@/lib/schema/news";
import {
  NEWS_FILTER_BOOT_SCRIPT,
  NEWS_FILTER_PENDING_SCRIPT,
} from "@/lib/news/filter-boot";
import type { RunLog } from "@/lib/schema/run";

// `/news/`(M1-30 골격 · M1-33 필터)와 404(본문 디자인 M1-36) — 앱 셸 안에서 그 페이지 제목이 h1, 워드마크는 p.
// 필터 그리기·부트 스크립트는 tests/news-filter-dom.test.tsx.
const { listNewsDates, loadLatestNews, loadProdRuns } = vi.hoisted(() => ({
  // 아카이브 이전 호 링크·canonical(M1-34) — 발행일 목록. 아카이브 관계는 tests/news-archive-page.test.tsx
  listNewsDates: vi.fn<() => string[]>(() => ["2026-10-10"]),
  loadLatestNews: vi.fn<() => NewsFile | null>(),
  loadProdRuns: vi.fn<() => RunLog[]>(() => []),
}));
vi.mock("@/lib/data/news", () => ({ listNewsDates, loadLatestNews }));
vi.mock("@/lib/data/runs", () => ({ loadProdRuns }));

const fixture = NewsFileSchema.parse(
  JSON.parse(
    readFileSync(
      path.resolve("fixtures/schema/data/news/2026-10-10.json"),
      "utf8",
    ),
  ),
);

beforeEach(() => {
  loadLatestNews.mockReset();
  loadLatestNews.mockReturnValue(fixture);
});

describe("NewsPage(/news/)", () => {
  it("h1 '뉴스' 하나, 뉴스 탭이 현재, 최신 호 카드를 홈과 같은 방식(게재 번호 06~)으로 싣는다", () => {
    render(<NewsPage />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s.map((h) => h.textContent)).toEqual(["뉴스"]);
    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(within(nav).getByRole("link", { name: "뉴스" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const articles = screen.getAllByRole("article");
    expect(articles.map((a) => a.id)).toEqual(fixture.cards.map((c) => c.id));
    expect(articles[0]?.textContent?.slice(0, 2)).toBe("06");
    // 페이지 h1 바로 아래라 카드 제목은 h2(단계를 건너뛰지 않는다 — 홈은 h2 "주요 뉴스" 아래 h3)
    for (const article of articles) {
      expect(
        within(article).getByRole("heading", { level: 2 }),
      ).toHaveAttribute("id", `${article.id}-t`);
    }
    expect(screen.queryAllByRole("heading", { level: 3 })).toEqual([]);
  });

  it("목차가 있으면 설정 JSON·부트 스크립트도 있다(보류만 걸리고 풀 부트가 없는 페이지가 생기지 않게 — M1-34 대비)", () => {
    loadLatestNews.mockReturnValue(fixture);
    const { container } = render(<NewsPage />);
    const contents = screen.queryByRole("navigation", { name: "뉴스 필터" });
    expect(contents).not.toBeNull();
    expect(container.querySelector("#news-filter-config")).not.toBeNull();
    const scripts = [...container.querySelectorAll("script:not([type])")].map(
      (el) => el.textContent,
    );
    // 클라이언트 렌더(happy-dom)는 스크립트 innerHTML의 '<'를 태그로 읽어 글자가 달라진다 — 보류는 그대로, 부트는 머리로 대조
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toBe(NEWS_FILTER_PENDING_SCRIPT);
    expect(scripts[1]?.slice(0, 80)).toBe(NEWS_FILTER_BOOT_SCRIPT.slice(0, 80));
  });

  it("필터(M1-33): 목차 열 '뉴스 필터'(대회 6 · 분류 8 · 한국 선수 1) + 1023 이하 분류 칩 줄, 피드 머리가 필터 머리 — 목차가 h1보다 앞이어도 제목 요소가 없다", () => {
    const { container } = render(<NewsPage />);
    const contents = screen.getByRole("navigation", { name: "뉴스 필터" });
    expect(within(contents).getAllByRole("button")).toHaveLength(15);
    expect(within(contents).queryAllByRole("heading")).toEqual([]);
    expect(
      within(contents).getByRole("button", { name: /전체/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen
        .getByRole("group", { name: "분류 필터" })
        .querySelectorAll("button"),
    ).toHaveLength(9);
    expect(container.querySelector("[data-columns]")).toHaveAttribute(
      "data-columns",
      "contents",
    );
    expect(container.querySelector("[data-nf-head] h1")).toHaveTextContent(
      "뉴스",
    );
    expect(container.querySelector("#news-filter-config")).not.toBeNull();
  });

  it("발행된 호가 없으면 빈 상태 — 필터·목차 열 없음", () => {
    loadLatestNews.mockReturnValue(null);
    const { container } = render(<NewsPage />);
    expect(screen.getByText("아직 발행된 소식이 없어요.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "뉴스 필터" })).toBeNull();
    expect(container.querySelector("[data-nf-scope]")).toBeNull();
  });
});

describe("NotFound(404)", () => {
  it("앱 셸 안 — h1 안내 하나, 현재 탭 없음, 홈·뉴스 링크", () => {
    const { container } = render(<NotFound />);
    expect(
      screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent),
    ).toEqual(["페이지를 찾을 수 없습니다"]);
    expect(container.querySelector("[aria-current]")).toBeNull();
    const main = screen.getByRole("main");
    // 테스트 환경의 next/link는 trailingSlash를 모른다(끝 슬래시를 뗀다) — 빌드 HTML의 href는 e2e가 본다
    expect(
      ["홈으로 돌아가기", "뉴스 보기"].map((name) =>
        within(main)
          .getByRole("link", { name })
          .getAttribute("href")
          ?.replace(/\/?$/, "/"),
      ),
    ).toEqual(["/", "/news/"]);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("큰 '404'는 윤곽 숫자(장식 — aria-hidden), 안내는 UI 문구뿐(사실·숫자 없음)", () => {
    render(<NotFound />);
    const main = screen.getByRole("main");
    const big = within(main).getByText("404");
    expect(big).toHaveAttribute("aria-hidden", "true");
    expect(big.className).toContain("text-transparent");
    expect(big.className).toContain("[-webkit-text-stroke:2px_var(--ink-2)]");
    expect(main).toHaveTextContent("요청한 주소에 페이지가 없습니다.");
    // 404 말고는 숫자를 쓰지 않는다(경기·선수·날짜를 지어내지 않는다)
    expect((main.textContent ?? "").replace("404", "")).not.toMatch(/\d/);
  });
});
