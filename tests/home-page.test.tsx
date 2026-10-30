import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HomePage, { metadata } from "@/app/page";
import { BriefFileSchema, type BriefFile } from "@/lib/schema/brief";
import { NewsFileSchema, type NewsFile } from "@/lib/schema/news";
import {
  NEWS_FILTER_BOOT_SCRIPT,
  NEWS_FILTER_PENDING_SCRIPT,
} from "@/lib/news/filter-boot";
import type { RunLog } from "@/lib/schema/run";
import type { BriefSlot } from "@/lib/brief-slot";
import { issueLateWindows } from "@/lib/issue";
import { issueLateScript } from "@/lib/issue-late";
import type { TonightWidget } from "@/lib/data/home-widgets";
import type { LeagueMiniPanelView } from "@/lib/home-widgets";

// 홈은 빌드 때 data/news의 최신 호를 읽는다. 저장소 data/는 파이프라인 실행에 따라 바뀌므로 로더를 바꿔 끼운다
// (로더 자체는 tests/data-news.test.ts).
const { loadLatestNews, loadProdRuns, loadBrief, loadBriefSlot } = vi.hoisted(
  () => ({
    loadLatestNews: vi.fn<() => NewsFile | null>(),
    loadProdRuns: vi.fn<() => RunLog[]>(() => []),
    loadBrief: vi.fn<(date: string) => BriefFile | null>(() => null),
    loadBriefSlot: vi.fn<(date: string) => BriefSlot>(),
  }),
);
vi.mock("@/lib/data/news", () => ({ loadLatestNews }));
// 마스트헤드 발행·업데이트 시각의 실행 기록(M1-30) — 저장소 data/runs.json 대신 빈 기록(→ 파일 generatedAt)
vi.mock("@/lib/data/runs", () => ({ loadProdRuns }));
// 오늘의 5줄(M1-32) — 저장소 data/briefs 대신 테스트가 정한 브리핑(기본 없음)
// 5줄 자리 상태(M1-37) — 기본은 위 loadBrief 결과 그대로(파일 있으면 브리핑, 없으면 블록 없음). 오류 상태는 테스트가 바꾼다
vi.mock("@/lib/data/brief", () => ({ loadBrief, loadBriefSlot }));
// 홈 위젯(M2-14·M2-15) — 저장소 configs·data/competitions와 빌드 시각 대신 테스트가 정한 값(기본: 오늘 밤 빈 상태 · 순위 미니 없음).
// 위젯 그리기·화면 모델은 tests/home-widgets.test.tsx
const { loadTonightWidget, loadLeagueMini } = vi.hoisted(() => ({
  loadTonightWidget: vi.fn<() => TonightWidget>(),
  loadLeagueMini: vi.fn<() => LeagueMiniPanelView[]>(),
}));
vi.mock("@/lib/data/home-widgets", () => ({
  loadTonightWidget,
  loadLeagueMini,
}));
function slotFromBrief(date: string): BriefSlot {
  const brief = loadBrief(date);
  return brief ? { kind: "brief", brief } : { kind: "none" };
}

const fixture = NewsFileSchema.parse(
  JSON.parse(
    readFileSync(
      path.resolve("fixtures/schema/data/news/2026-10-10.json"),
      "utf8",
    ),
  ),
);

const briefFixture = BriefFileSchema.parse(
  JSON.parse(
    readFileSync(
      path.resolve("fixtures/schema/data/briefs/2026-10-11.json"),
      "utf8",
    ),
  ),
);

beforeEach(() => {
  loadLatestNews.mockReset();
  loadProdRuns.mockReset();
  loadProdRuns.mockReturnValue([]);
  loadBrief.mockReset();
  loadBrief.mockReturnValue(null);
  loadBriefSlot.mockReset();
  loadBriefSlot.mockImplementation(slotFromBrief);
  loadTonightWidget.mockReset();
  loadTonightWidget.mockReturnValue({
    baseKstDate: "2026-10-10",
    window: null,
    cards: [],
  });
  loadLeagueMini.mockReset();
  loadLeagueMini.mockReturnValue([]);
});

describe("HomePage", () => {
  it("메타(M1-38) — 제목 = 서비스 이름 단독, 설명 = 사이트 기본 설명(호 정보 없음), canonical = og:url = 사이트 루트", () => {
    const url = "https://sguys99.github.io/euro-digest/";
    expect(metadata.title).toEqual({ absolute: "유로 다이제스트" });
    expect(metadata.description).toMatch(/^매일 아침, 밤사이 유럽 축구를/);
    expect(metadata.alternates?.canonical).toBe(url);
    expect(metadata.openGraph).toMatchObject({
      url,
      title: "유로 다이제스트",
    });
  });

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

  it("목차가 있으면 설정 JSON·부트 스크립트도 있다(보류만 걸리고 풀 부트가 없는 페이지가 생기지 않게 — M1-34 대비)", () => {
    loadLatestNews.mockReturnValue(fixture);
    const { container } = render(<HomePage />);
    const contents = screen.queryByRole("navigation", { name: "뉴스 필터" });
    expect(contents).not.toBeNull();
    expect(container.querySelector("#news-filter-config")).not.toBeNull();
    const scripts = [
      ...container.querySelectorAll("script:not([type]):not([data-slot])"),
    ].map((el) => el.textContent);
    // 클라이언트 렌더(happy-dom)는 스크립트 innerHTML의 '<'를 태그로 읽어 글자가 달라진다 — 보류는 그대로, 부트는 머리로 대조
    // (발행 지연 안내 스크립트 — M1-37, data-slot — 는 따로 본다)
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toBe(NEWS_FILTER_PENDING_SCRIPT);
    expect(scripts[1]?.slice(0, 80)).toBe(NEWS_FILTER_BOOT_SCRIPT.slice(0, 80));
  });

  it("필터(M1-33) — 목차 열 + 지면 + 마주 보는 면(M2-14 위젯 — 3단), 5줄은 필터 범위 밖 맨 위, 피드만 거른다", () => {
    loadLatestNews.mockReturnValue(fixture);
    loadBrief.mockReturnValue({ ...briefFixture, date: fixture.date });
    const { container } = render(<HomePage />);
    expect(container.querySelector("[data-columns]")).toHaveAttribute(
      "data-columns",
      "both",
    );
    expect(
      screen.getByRole("navigation", { name: "뉴스 필터" }),
    ).toBeInTheDocument();
    const main = container.querySelector("main") as HTMLElement;
    const brief = main.querySelector("[data-slot='today-brief']");
    // main 맨 앞은 발행 지연 안내(M1-37 — 평소 숨김), 첫 섹션이 5줄
    expect(main.querySelector(":scope > section")).toBe(brief);
    expect(brief?.closest("[data-nf-scope]")).toBeNull();
    const news = container.querySelector("section#news") as HTMLElement;
    expect(news).toHaveAttribute("data-nf-scope");
    expect(news.querySelector("[data-nf-head] h2")).toHaveTextContent(
      "주요 뉴스",
    );
    expect(news.querySelectorAll("li[data-nf-card]")).toHaveLength(
      fixture.cards.length,
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

      // 제목 링크(카드에는 '+N곳' 목록·연결 줄 링크도 있다 — M1-31)
      const link = within(title).getByRole("link");
      expect(link).toHaveAttribute("href", source.u);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link).toHaveTextContent(`(원문 ${source.n}, 새 창)`);

      // 메타 줄의 대표 출처명 — 같은 이름이 펼친 출처 목록(닫힘)에도 있을 수 있다
      expect(within(article).getAllByText(source.n)[0]).toBeVisible();
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

describe("HomePage — 오늘의 5줄(M1-32, PRD §4.2·D2·FR-35)", () => {
  it("그 호 날짜의 브리핑을 읽어 맨 위(주요 뉴스 앞)에 싣는다", () => {
    loadLatestNews.mockReturnValue(fixture);
    loadBrief.mockReturnValue({ ...briefFixture, date: fixture.date });
    render(<HomePage />);

    expect(loadBriefSlot).toHaveBeenCalledWith(fixture.date);
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings.slice(0, 2)).toEqual(["오늘의 5줄", "주요 뉴스"]);
    // main의 첫 섹션이 5줄(맨 앞은 발행 지연 안내 — M1-37, 평소 숨김)
    const main = screen.getByRole("main");
    expect(main.querySelector(":scope > section")).toHaveAttribute(
      "data-slot",
      "today-brief",
    );
    // 주요 뉴스 섹션은 5줄 아래 36px(≥1024 44px) · S4 앵커 id
    const news = screen.getByRole("region", { name: "주요 뉴스" });
    expect(news).toHaveAttribute("id", "news");
    expect(news.className).toContain("mt-9");
    expect(news.className).toContain("lg:mt-11");
  });

  it("FR-35 — 5줄의 ai:true 줄에만 'AI 작성' 라벨, 뉴스 카드에는 없음", () => {
    loadLatestNews.mockReturnValue(fixture);
    loadBrief.mockReturnValue({ ...briefFixture, date: fixture.date });
    render(<HomePage />);

    const labels = screen.getAllByRole("link", { name: "AI 작성" });
    expect(labels).toHaveLength(briefFixture.lines.filter((l) => l.ai).length);
    for (const article of screen.getAllByRole("article")) {
      expect(within(article).queryByText("AI 작성")).toBeNull();
    }
  });

  it("그 호의 브리핑 파일이 없으면(D38 전 호) 5줄 블록을 싣지 않는다 — 주요 뉴스가 맨 위", () => {
    loadLatestNews.mockReturnValue(fixture);
    render(<HomePage />);

    expect(screen.queryByRole("region", { name: "오늘의 5줄" })).toBeNull();
    expect(screen.queryByText("오늘은 5줄을 쉽니다")).toBeNull();
    const news = screen.getByRole("region", { name: "주요 뉴스" });
    expect(screen.getByRole("main").querySelector(":scope > section")).toBe(
      news,
    );
    expect(news.className).not.toContain("mt-9");
  });

  it("발행된 호가 없으면 브리핑을 읽지 않는다", () => {
    loadLatestNews.mockReturnValue(null);
    render(<HomePage />);
    expect(loadBriefSlot).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "오늘의 5줄" })).toBeNull();
  });

  it("경기 없는 날(mode empty) — 블록을 두고 S4 안내, '주요 뉴스로 ↓'는 #news", () => {
    loadLatestNews.mockReturnValue(fixture);
    loadBrief.mockReturnValue({
      date: fixture.date,
      generatedAt: fixture.generatedAt,
      runId: fixture.runId,
      mode: "empty",
      lines: [],
    });
    render(<HomePage />);

    const brief = screen.getByRole("region", { name: "오늘의 5줄" });
    expect(brief).toHaveTextContent("오늘은 5줄을 쉽니다");
    expect(
      within(brief).getByRole("link", { name: "주요 뉴스로" }),
    ).toHaveAttribute("href", "#news");
    expect(document.getElementById("news")).not.toBeNull();
  });
});

describe("HomePage — 상태 화면(M1-37, DESIGN §9.3 ③)", () => {
  it("5줄 자리 오류 — 파일 없음 + 그날 게시 실행 기록이면 '오늘은 5줄을 싣지 못했어요'(원인 없음), 주요 뉴스는 그 아래", () => {
    loadLatestNews.mockReturnValue(fixture);
    loadBriefSlot.mockReturnValue({ kind: "missing" });
    render(<HomePage />);
    const brief = screen.getByRole("region", { name: "오늘의 5줄" });
    expect(brief).toHaveAttribute("data-brief-mode", "missing");
    expect(brief).toHaveTextContent("오늘은 5줄을 싣지 못했어요");
    const news = screen.getByRole("region", { name: "주요 뉴스" });
    expect(news.className).toContain("mt-9");
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(expect.arrayContaining(["오늘의 5줄", "주요 뉴스"]));
  });

  it("발행 지연 안내 — main 맨 앞(평소 숨김) + 인라인 스크립트, 구간은 최신 호 다음 날부터", () => {
    loadLatestNews.mockReturnValue(fixture);
    const { container } = render(<HomePage />);
    const main = screen.getByRole("main");
    const notice = main.firstElementChild;
    expect(notice).toHaveAttribute("data-slot", "issue-late");
    expect(notice).toHaveAttribute("data-issue-date", fixture.date);
    expect(
      container.querySelector("[data-slot=issue-late-script]")?.textContent,
    ).toBe(issueLateScript(issueLateWindows(fixture.date)));
  });

  it("홈 위젯(M2-14·M2-15) — 두 자리: 지면 안(피드 다음, xl:hidden)과 마주 보는 면(aside)에 오늘 밤 → 리그 순위, 머리 id는 서로 다르다", () => {
    loadLatestNews.mockReturnValue(fixture);
    loadLeagueMini.mockReturnValue([
      {
        comp: "EPL",
        short: "EPL",
        name: "프리미어리그",
        rows: [],
        note: null,
        updatedAt: null,
        href: "/competitions/epl/",
      },
    ]);
    const { container } = render(<HomePage />);
    const flow = container.querySelector(
      "main [data-slot=home-widgets]",
    ) as HTMLElement;
    expect(flow.className).toContain("xl:hidden");
    // 지면 안: 주요 뉴스 바로 다음
    expect(container.querySelector("section#news")?.nextElementSibling).toBe(
      flow,
    );
    const aside = container.querySelector("aside") as HTMLElement;
    expect(aside).toHaveAttribute("aria-label", "오늘 밤 경기·리그 순위");
    for (const root of [flow, aside]) {
      expect(
        [...root.querySelectorAll("section")].map((el) =>
          el.getAttribute("data-slot"),
        ),
      ).toEqual(["tonight", "league-mini"]);
    }
    const ids = [
      ...container.querySelectorAll(
        "[data-slot=tonight] h2, [data-slot=league-mini] h2",
      ),
    ].map((h) => h.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    // 오늘 밤 빈 상태(창 없음) — 부제 없이 빈 상태 문구
    expect(flow.querySelector("[data-slot=tonight-empty]")).not.toBeNull();
  });

  it("발행된 호가 없으면 지연 안내도 없다", () => {
    loadLatestNews.mockReturnValue(null);
    render(<HomePage />);
    expect(document.querySelector("[data-slot=issue-late]")).toBeNull();
  });
});
