import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { NewsFileSchema, type NewsFile } from "@/lib/schema/news";
import type { RunLog } from "@/lib/schema/run";

// 홈은 빌드 때 data/news의 최신 호를 읽는다. 저장소 data/는 파이프라인 실행에 따라 바뀌므로 로더를 바꿔 끼운다
// (로더 자체는 tests/data-news.test.ts).
const { loadLatestNews, loadProdRuns } = vi.hoisted(() => ({
  loadLatestNews: vi.fn<() => NewsFile | null>(),
  loadProdRuns: vi.fn<() => RunLog[]>(() => []),
}));
vi.mock("@/lib/data/news", () => ({ loadLatestNews }));
// 마스트헤드 발행·업데이트 시각의 실행 기록(M1-30) — 저장소 data/runs.json 대신 빈 기록(→ 파일 generatedAt)
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
  loadProdRuns.mockReset();
  loadProdRuns.mockReturnValue([]);
});

describe("HomePage", () => {
  it("서비스 이름을 h1으로 보여 준다", () => {
    loadLatestNews.mockReturnValue(null);
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "유로 다이제스트" }),
    ).toBeInTheDocument();
  });

  it("발행된 호가 없으면(data/news가 빔) 빈 상태 문구를 보여 준다", () => {
    loadLatestNews.mockReturnValue(null);
    const { container } = render(<HomePage />);

    expect(
      screen.getByRole("heading", { level: 2, name: "주요 뉴스" }),
    ).toBeInTheDocument();
    expect(screen.getByText("아직 발행된 소식이 없어요.")).toBeInTheDocument();
    expect(screen.queryAllByRole("article")).toEqual([]);
    expect(container.querySelector("time")).toBeNull();
  });

  it("최신 호의 KST 발행일과 카드 목록을 보여 준다", () => {
    loadLatestNews.mockReturnValue(fixture);
    const { container } = render(<HomePage />);

    const issueDate = container.querySelector('time[datetime="2026-10-10"]');
    expect(issueDate).toHaveTextContent("2026년 10월 10일 (토)");
    expect(screen.getByText("작은 번호는 이 호의 게재 번호(순위 아님)"));

    const articles = screen.getAllByRole("article");
    expect(articles.map((article) => article.id)).toEqual(
      fixture.cards.map((card) => card.id),
    );
    // 게재 번호는 06부터(DESIGN §3.5)
    expect(articles.map((article) => article.textContent?.slice(0, 2))).toEqual(
      ["06", "07", "08"],
    );
  });

  it("모든 카드에 원제목(무수정)·출처명·원문 링크(새 창)·KST 발행 시각이 있다", () => {
    loadLatestNews.mockReturnValue(fixture);
    render(<HomePage />);

    const articles = screen.getAllByRole("article");
    fixture.cards.forEach((card, index) => {
      const article = articles[index] as HTMLElement;
      const source = card.src[0];
      if (!source) throw new Error("픽스처 카드에 출처 없음");

      const title = within(article).getByRole("heading", { level: 3 });
      expect(title).toHaveAttribute("lang", card.lang);
      expect(title).toHaveTextContent(card.t);

      const link = within(article).getByRole("link");
      expect(link).toHaveAttribute("href", source.u);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link).toHaveTextContent(`(원문 ${source.n}, 새 창)`);

      expect(within(article).getByText(source.n)).toBeInTheDocument();
      const time = article.querySelector(`time[datetime="${source.at}"]`);
      expect(time).not.toBeNull();
    });

    // 2026-10-09T20:10:00Z = KST 10월 10일 05:10 (UTC 저장 · KST 표시)
    const first = articles[0] as HTMLElement;
    expect(first.querySelector("time")).toHaveTextContent("10.10 05:10");
  });

  it("뉴스 카드에는 요약 줄과 'AI 작성' 라벨을 붙이지 않는다(D23·D24)", () => {
    loadLatestNews.mockReturnValue(fixture);
    render(<HomePage />);

    // 픽스처 첫 카드는 형식 예시라 ai:true·요약 3줄을 갖고 있다 — 그래도 화면에는 나오지 않는다
    const summaries = fixture.cards.flatMap((card) => card.s);
    expect(summaries.length).toBeGreaterThan(0);
    for (const line of summaries) {
      expect(screen.queryByText(line)).toBeNull();
    }
    // 'AI 작성' 라벨은 카드에 없다(뒤표지의 AI 작성 고지 문단은 라벨이 아니라 설명 — 앱 셸 테스트)
    for (const article of screen.getAllByRole("article")) {
      expect(within(article).queryByText(/AI 작성/)).toBeNull();
    }
  });

  it("앱 셸 안에 싣는다 — 홈 탭이 현재, 스텁 발행·업데이트는 실행 기록(없으면 파일 generatedAt)에서(M1-30)", () => {
    loadLatestNews.mockReturnValue(fixture);
    // 2026-10-09T21:30Z = KST 10-10 06:30 시작 → 발행일 10-10. 21:52:10Z(파일) 뒤 21:54:00Z에 끝남
    loadProdRuns.mockReturnValue([
      {
        runId: fixture.runId,
        env: "prod",
        job: "collect",
        startedAt: "2026-10-09T21:30:00.000Z",
        finishedAt: "2026-10-09T21:54:00.000Z",
        collected: 3,
        clusters: 3,
        summarized: 0,
        downgraded: 0,
        tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
        costUsd: 0,
        apiCalls: { footballData: 0, apiFootball: 0 },
        sources: [],
        status: "success",
      },
    ]);
    const { container } = render(<HomePage />);

    const tabs = screen.getByRole("navigation", { name: "하단 탭" });
    expect(within(tabs).getByRole("link", { name: "홈" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const stub = container.querySelector('time[datetime="2026-10-10"]')
      ?.parentElement as HTMLElement;
    expect(stub).toHaveTextContent("발행 06:54 KST");
    expect(stub).toHaveTextContent("업데이트 06:54 KST");

    loadProdRuns.mockReturnValue([]);
    const again = render(<HomePage />);
    const stub2 = again.container.querySelector('time[datetime="2026-10-10"]')
      ?.parentElement as HTMLElement;
    expect(stub2).toHaveTextContent("발행 06:52 KST");
  });

  it("호는 있지만 카드가 0장이면 그 안내를 보여 준다", () => {
    loadLatestNews.mockReturnValue({ ...fixture, cards: [] });
    render(<HomePage />);

    expect(
      screen.getByText("이 호에는 실린 소식이 없어요."),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("article")).toEqual([]);
  });
});
