import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewsPage from "@/app/news/page";
import NotFound from "@/app/not-found";
import { NewsFileSchema, type NewsFile } from "@/lib/schema/news";
import type { RunLog } from "@/lib/schema/run";

// `/news/` 골격(M1-30)과 404(본문 디자인 M1-36) — 앱 셸 안에서 그 페이지 제목이 h1, 워드마크는 p. 필터는 M1-33.
const { loadLatestNews, loadProdRuns } = vi.hoisted(() => ({
  loadLatestNews: vi.fn<() => NewsFile | null>(),
  loadProdRuns: vi.fn<() => RunLog[]>(() => []),
}));
vi.mock("@/lib/data/news", () => ({ loadLatestNews }));
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

  it("발행된 호가 없으면 빈 상태", () => {
    loadLatestNews.mockReturnValue(null);
    render(<NewsPage />);
    expect(screen.getByText("아직 발행된 소식이 없어요.")).toBeInTheDocument();
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
