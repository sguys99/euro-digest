import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewsArchivePage, {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
} from "@/app/news/[date]/page";
import NewsPage, { generateMetadata as newsMetadata } from "@/app/news/page";
import HomePage from "@/app/page";
import {
  NEWS_FILTER_BOOT_SCRIPT,
  NEWS_FILTER_PENDING_SCRIPT,
} from "@/lib/news/filter-boot";
import { BriefFileSchema, type BriefFile } from "@/lib/schema/brief";
import { NewsFileSchema, type NewsFile } from "@/lib/schema/news";
import type { RunLog } from "@/lib/schema/run";
import { FIRST_ISSUE_DATE } from "@/lib/site";

// `/news/[date]/` 날짜 아카이브(M1-34 — PRD FR-33·FR-34, 시안 A "스텁 넘김")와 `/news/`·홈의 꼬리표 관계.
// 빌드 결과(out/news/<날짜>/index.html)·이동·달력 키보드·404·필터 쿼리·앵커는 e2e tests/e2e/news-archive.spec.ts.
const {
  listNewsDates,
  loadNewsIssue,
  loadLatestNews,
  loadProdRuns,
  loadBrief,
  missingBriefDates,
} = vi.hoisted(() => ({
  listNewsDates: vi.fn<() => string[]>(),
  loadNewsIssue: vi.fn<(date: string) => NewsFile | null>(),
  loadLatestNews: vi.fn<() => NewsFile | null>(),
  loadProdRuns: vi.fn<() => RunLog[]>(() => []),
  loadBrief: vi.fn<(date: string) => BriefFile | null>(() => null),
  /** 5줄 자리 오류로 볼 날짜(M1-37 — 실제 판정은 tests/brief-slot.test.ts) */
  missingBriefDates: new Set<string>(),
}));
vi.mock("@/lib/data/news", () => ({
  listNewsDates,
  loadNewsIssue,
  loadLatestNews,
}));
vi.mock("@/lib/data/runs", () => ({ loadProdRuns }));
// 5줄 자리 상태(M1-37) — 기본은 loadBrief 결과 그대로(파일 있으면 브리핑, 없으면 블록 없음)
vi.mock("@/lib/data/brief", () => ({
  loadBrief,
  loadBriefSlot: (date: string) => {
    const brief = loadBrief(date);
    if (brief) return { kind: "brief", brief };
    return missingBriefDates.has(date) ? { kind: "missing" } : { kind: "none" };
  },
}));

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

/** 실데이터와 같은 발행일(결호 10-15·16·19) */
const DATES = [
  "2026-10-12",
  "2026-10-13",
  "2026-10-14",
  "2026-10-17",
  "2026-10-18",
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
];

/** 그 날짜의 호 — 파일을 마지막으로 쓴 시각 = 그날 00:00Z(09:00 KST) + 날마다 다른 분 */
const issueOf = (date: string): NewsFile => ({
  ...fixture,
  date,
  generatedAt: `${date}T00:${date.slice(8, 10)}:00.000Z`,
});

beforeEach(() => {
  listNewsDates.mockReset();
  listNewsDates.mockReturnValue(DATES);
  loadNewsIssue.mockReset();
  loadNewsIssue.mockImplementation((date) =>
    DATES.includes(date) ? issueOf(date) : null,
  );
  loadLatestNews.mockReset();
  loadLatestNews.mockImplementation(() => issueOf(DATES.at(-1)!));
  loadBrief.mockReset();
  loadBrief.mockReturnValue(null);
  missingBriefDates.clear();
});

const props = (date: string) => ({
  params: Promise.resolve({ date }),
  searchParams: Promise.resolve({}),
});

async function renderArchive(date: string) {
  return render(await NewsArchivePage(props(date)));
}

/** 테스트 환경의 next/link는 trailingSlash를 모른다(끝 슬래시를 뗀다) — 빌드 HTML의 href는 e2e가 본다 */
const hrefOf = (el: Element) =>
  el.getAttribute("href")?.replace(/\/?(#.*)?$/, "/$1");

const counterfoil = () => screen.getByRole("navigation", { name: "호 넘기기" });
const panel = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("#archive-cal")!;

describe("generateStaticParams · dynamicParams", () => {
  it("발행된 호의 날짜 전부, 그 밖의 날짜는 만들지 않는다(dynamicParams = false — 404)", () => {
    expect(generateStaticParams()).toEqual(DATES.map((date) => ({ date })));
    expect(dynamicParams).toBe(false);
  });

  it("발행된 호가 없으면 창간일 한 칸(output: export는 빈 배열을 빌드 오류로 본다) — 그 페이지는 not-found, canonical 없음", async () => {
    listNewsDates.mockReturnValue([]);
    expect(generateStaticParams()).toEqual([{ date: FIRST_ISSUE_DATE }]);
    expect(await generateMetadata(props(FIRST_ISSUE_DATE))).toEqual({});
    await expect(NewsArchivePage(props(FIRST_ISSUE_DATE))).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404/,
    );
  });
});

describe("generateMetadata — 제목·설명·canonical·OG (M1-38)", () => {
  it("제목 '2026년 10월 14일 (수) 뉴스 · 제 3호', canonical = og:url = 이 날짜 페이지 절대 URL(basePath·끝 슬래시)", async () => {
    const meta = await generateMetadata(props("2026-10-14"));
    expect(meta.title).toBe("2026년 10월 14일 (수) 뉴스 · 제 3호");
    const url = "https://sguys99.github.io/euro-digest/news/2026-10-14/";
    expect(meta.alternates?.canonical).toBe(url);
    expect(meta.openGraph).toMatchObject({
      url,
      title: "2026년 10월 14일 (수) 뉴스 · 제 3호 · 유로 다이제스트",
      type: "website",
      locale: "ko_KR",
      siteName: "유로 다이제스트",
    });
    expect(meta.twitter).toMatchObject({ card: "summary" });
  });

  it("설명 = 호수·날짜·카드 수(브리핑 파일이 없으면 브리핑 언급 없음) — 카드 원제목은 넣지 않는다", async () => {
    const meta = await generateMetadata(props("2026-10-14"));
    expect(meta.description).toBe(
      `제 3호 · 2026년 10월 14일 (수) 지면 — 유럽 축구 소식 ${fixture.cards.length}건을 원문 링크와 함께 싣습니다.`,
    );
    for (const card of fixture.cards) {
      expect(meta.description).not.toContain(card.t);
    }
    expect(meta.openGraph?.description).toBe(meta.description);
  });

  it("브리핑 줄이 있는 호는 '이날의 5줄'을 적는다(브리핑 문장·스코어는 넣지 않는다), 경기 없는 날(줄 0)은 적지 않는다", async () => {
    loadBrief.mockReturnValue({ ...briefFixture, date: "2026-10-14" });
    const meta = await generateMetadata(props("2026-10-14"));
    expect(meta.description).toContain("‘이날의 5줄’과 유럽 축구 소식");
    for (const line of briefFixture.lines) {
      expect(meta.description).not.toContain(line.text);
    }
    expect(meta.description).not.toMatch(/\d\s*[-–—:]\s*\d/);

    loadBrief.mockReturnValue({
      ...briefFixture,
      date: "2026-10-14",
      mode: "empty",
      lines: [],
    });
    expect(
      (await generateMetadata(props("2026-10-14"))).description,
    ).not.toContain("이날의 5줄");
  });

  it("/news/는 최신 호의 별칭 — canonical = og:url = 최신 날짜 페이지, 설명 = 최신 호 호수·날짜·카드 수, 호가 없으면 canonical 없음", () => {
    const meta = newsMetadata();
    const url = "https://sguys99.github.io/euro-digest/news/2026-10-22/";
    expect(meta.title).toBe("뉴스");
    expect(meta.alternates?.canonical).toBe(url);
    expect(meta.openGraph).toMatchObject({
      url,
      title: "뉴스 · 유로 다이제스트",
    });
    expect(meta.description).toBe(
      `최신 호(제 11호 · 2026년 10월 22일 (목))의 유럽 축구 소식 ${fixture.cards.length}건을 원문 링크와 함께 싣습니다. 지난 호는 날짜별 아카이브에 있습니다.`,
    );
    listNewsDates.mockReturnValue([]);
    loadLatestNews.mockReturnValue(null);
    const empty = newsMetadata();
    expect(empty.alternates).toBeUndefined();
    expect(empty.openGraph).not.toHaveProperty("url");
  });
});

describe("NewsArchivePage(/news/[date]/) — 지면", () => {
  it("화면 밖 h1 '제 3호 · 2026년 10월 14일 (수) 지면' 하나, 뉴스 h2 · 카드 h3(제목 단계), 뉴스 탭은 섹션 표시", async () => {
    await renderArchive("2026-10-14");
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s.map((h) => h.textContent)).toEqual([
      "제 3호 · 2026년 10월 14일 (수) 지면",
    ]);
    expect(h1s[0]).toHaveClass("sr-only");
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["뉴스"]);
    const articles = screen.getAllByRole("article");
    for (const article of articles)
      expect(
        within(article).getByRole("heading", { level: 3 }),
      ).toHaveAttribute("id", `${article.id}-t`);
    // 뉴스 탭은 섹션 표시(aria-current="true") — 이 페이지는 /news/ 자신이 아니다(`/news/`에서만 "page")
    for (const name of ["주요 메뉴", "하단 탭"]) {
      const nav = screen.getByRole("navigation", { name });
      expect(within(nav).getByRole("link", { name: "뉴스" })).toHaveAttribute(
        "aria-current",
        "true",
      );
    }
  });

  it("카드 = 그 호의 카드, id = 공유 앵커(FR-34), 게재 번호 06~ · 최신 날짜 페이지와 /news/의 카드 앵커가 같다", async () => {
    const archive = await renderArchive("2026-10-22");
    const ids = screen.getAllByRole("article").map((a) => a.id);
    expect(ids).toEqual(fixture.cards.map((c) => c.id));
    expect(screen.getAllByRole("article")[0]?.textContent?.slice(0, 2)).toBe(
      "06",
    );
    archive.unmount();
    render(<NewsPage />);
    expect(screen.getAllByRole("article").map((a) => a.id)).toEqual(ids);
  });

  it("필터(M1-33) — 목차 '뉴스 필터' + 칩 줄, 목차가 있으니 설정 JSON·보류·부트 스크립트도 함께", async () => {
    const { container } = await renderArchive("2026-10-14");
    expect(
      screen.getByRole("navigation", { name: "뉴스 필터" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "분류 필터" }),
    ).toBeInTheDocument();
    expect(container.querySelector("#news-filter-config")).not.toBeNull();
    const scripts = [...container.querySelectorAll("script:not([type])")].map(
      (el) => el.textContent,
    );
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toBe(NEWS_FILTER_PENDING_SCRIPT);
    expect(scripts[1]?.slice(0, 80)).toBe(NEWS_FILTER_BOOT_SCRIPT.slice(0, 80));
  });

  it("이날의 5줄 — 그 호 날짜의 브리핑을 읽어 뉴스 앞(h2 '이날의 5줄' → h2 '뉴스'), 다른 날 브리핑은 읽지 않는다", async () => {
    loadBrief.mockImplementation((date) =>
      date === "2026-10-20" ? { ...briefFixture, date } : null,
    );
    await renderArchive("2026-10-20");
    expect(loadBrief.mock.calls.map(([d]) => d)).toEqual(["2026-10-20"]);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["이날의 5줄", "뉴스"]);
    expect(screen.queryByText("오늘의 5줄")).toBeNull();
    const brief = screen.getByRole("region", { name: "이날의 5줄" });
    const news = screen.getByRole("region", { name: "뉴스" });
    expect(
      brief.compareDocumentPosition(news) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(news).toHaveAttribute("id", "news");
  });

  it("브리핑 파일이 없는 호(10-12~14 — D38 전)는 5줄 블록이 없다(M1-32 규칙)", async () => {
    await renderArchive("2026-10-12");
    expect(screen.queryByRole("region", { name: "이날의 5줄" })).toBeNull();
  });

  it("5줄 자리 오류(M1-37) — 확인된 호는 '이날은 5줄을 싣지 못했어요' · 발행 지연 안내는 없다(지난 호)", async () => {
    missingBriefDates.add("2026-10-20");
    await renderArchive("2026-10-20");
    const brief = screen.getByRole("region", { name: "이날의 5줄" });
    expect(brief).toHaveTextContent("이날은 5줄을 싣지 못했어요");
    expect(screen.getByRole("region", { name: "뉴스" }).className).toContain(
      "mt-9",
    );
    expect(document.querySelector("[data-slot=issue-late]")).toBeNull();
  });

  it("발행된 호가 아닌 날짜는 not-found(정적 export에서는 그 경로 자체가 생기지 않는다)", async () => {
    await expect(NewsArchivePage(props("2026-10-15"))).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404/,
    );
  });
});

describe("셸 — 티켓은 그 호, 마지막 업데이트는 사이트(최신 호) 기준", () => {
  it("티켓 스텁: 그 호의 발행일·발행·업데이트 / 상단 내비·뒤표지 '마지막 업데이트': 최신 호의 업데이트(다른 날이라 날짜를 붙인다)", async () => {
    await renderArchive("2026-10-14");
    const header = screen.getByRole("banner");
    const ticket = header.querySelector("[data-ticket]") as HTMLElement;
    expect(ticket).toHaveTextContent(/제\s*3\s*호/);
    expect(ticket.querySelector('time[datetime="2026-10-14"]')).not.toBeNull();
    expect(
      ticket.querySelector('time[datetime="2026-10-14T00:14:00.000Z"]'),
    ).not.toBeNull();
    const latestUpdate = "2026-10-22T00:22:00.000Z";
    const top = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(
      top.querySelector(`time[datetime="${latestUpdate}"]`),
    ).toHaveTextContent("10월 22일 (목) 09:22 KST");
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("제 3호");
    expect(
      footer.querySelector(`time[datetime="${latestUpdate}"]`),
    ).toHaveTextContent("10월 22일 (목) 09:22 KST");
  });

  it("최신 호 날짜 페이지는 마지막 업데이트 = 그 호 — 시각만(날짜 없이)", async () => {
    await renderArchive("2026-10-22");
    const top = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(
      top.querySelector('time[datetime="2026-10-22T00:22:00.000Z"]'),
    ).toHaveTextContent(/^09:22 KST$/);
  });
});

describe("티켓 꼬리표(시안 A) — 이전 호 · 달력 · 다음 호", () => {
  it("결호를 건너뛴다(10-14 → 다음 10-17) — rel prev·next, 접근 이름에 제 N호·요일 날짜", async () => {
    await renderArchive("2026-10-14");
    const nav = counterfoil();
    expect(nav.closest("[data-ticket]")).not.toBeNull();
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => [a.getAttribute("rel"), hrefOf(a)])).toEqual([
      ["prev", "/news/2026-10-13/"],
      ["next", "/news/2026-10-17/"],
    ]);
    expect(links[0]?.textContent).toContain("이전 호");
    expect(links[0]?.textContent).toContain("10.13 (화)");
    expect(links[0]?.textContent).toContain("10월 13일 화요일");
    expect(links[1]?.textContent).toMatch(/다음 호.*제 6호, 10월 17일 토요일/);
  });

  it("끝: 첫 호는 '이전 호 · 창간호예요', 최신 호는 '다음 호 · 최신 호예요'(링크 아님)", async () => {
    const first = await renderArchive("2026-10-12");
    let nav = counterfoil();
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.getAttribute("rel")),
    ).toEqual(["next"]);
    expect(nav.querySelector('[data-counterfoil="prev"]')).toHaveTextContent(
      "이전 호창간호예요",
    );
    first.unmount();
    await renderArchive("2026-10-22");
    nav = counterfoil();
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.getAttribute("rel")),
    ).toEqual(["prev"]);
    expect(nav.querySelector('[data-counterfoil="next"]')).toHaveTextContent(
      "다음 호최신 호예요",
    );
  });

  it("달력 버튼 — aria-expanded false · aria-controls = 판, 판은 처음 hidden(섬이 연다)", async () => {
    const { container } = await renderArchive("2026-10-17");
    const button = within(counterfoil()).getByRole("button", {
      name: "달력 — 날짜로 지난 호 찾기",
    });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "archive-cal");
    const cal = panel(container);
    expect(cal).toHaveAttribute("hidden");
    expect(cal).toHaveAttribute("role", "group");
    expect(cal.closest("[data-ticket]")).toBeNull();
  });
});

describe("월 달력 — 발행된 날만 링크, 결호·창간 전·발행 전은 글자로", () => {
  it("그 달 발행일 링크 8개(10-17 aria-current), 결호 15·16·19는 링크 아님 + '결호', 최신 호 칸은 '최신'", async () => {
    const { container } = await renderArchive("2026-10-17");
    const cal = panel(container);
    const links = [
      ...cal.querySelectorAll<HTMLAnchorElement>("a[data-cal-day]"),
    ];
    expect(links.map(hrefOf)).toEqual(DATES.map((d) => `/news/${d}/`));
    const current = links.filter((a) => a.hasAttribute("aria-current"));
    expect(current.map((a) => a.dataset.calDay)).toEqual(["2026-10-17"]);
    expect(current[0]).toHaveAttribute("aria-current", "page");
    expect(current[0]?.textContent).toContain("제 6호, 10월 17일 토요일");
    const latest = links.at(-1)!;
    expect(latest.textContent).toContain("최신");
    expect(latest.textContent).toContain("제 11호, 10월 22일 목요일, 최신 호");
    const gaps = [...cal.querySelectorAll("[data-cal-gap]")];
    expect(gaps.map((g) => g.querySelector(".sr-only")?.textContent)).toEqual([
      "10월 15일, 결호",
      "10월 16일, 결호",
      "10월 19일, 결호",
    ]);
    for (const gap of gaps) expect(gap.querySelector("s")).not.toBeNull();
    expect(cal).toHaveTextContent("10월 1일, 창간 전");
    expect(cal).toHaveTextContent("10월 31일, 발행 전");
  });

  it("첫 호가 창간일 뒤면(앞 일별 파일 없음) 그 사이 칸은 '발행 기록 없음'(창간 전이 아니다), 이전 달 비활성 안내도 같은 규칙", async () => {
    const dates = ["2026-11-03", "2026-11-04"];
    listNewsDates.mockReturnValue(dates);
    loadNewsIssue.mockImplementation((date) =>
      dates.includes(date) ? issueOf(date) : null,
    );
    loadLatestNews.mockImplementation(() => issueOf("2026-11-04"));
    const { container } = await renderArchive("2026-11-03");
    const cal = panel(container);
    expect(cal).toHaveTextContent("11월 1일, 발행 기록 없음");
    expect(cal).not.toHaveTextContent("창간 전");
    expect(
      within(cal).getByRole("button", {
        name: "이전 달 — 2026년 10월은 발행 기록 없음",
        hidden: true,
      }),
    ).toBeDisabled();
    // 범례 흐린 숫자 항목도 그 달에 있는 표기만
    expect(cal.querySelector("ul")).toHaveTextContent("발행 기록 없음·발행 전");
  });

  it("표 — caption · 요일 머리 일요일 시작(abbr 'N요일') · 5주, 범례는 장식(aria-hidden)", async () => {
    const { container } = await renderArchive("2026-10-17");
    const table = within(panel(container)).getByRole("table", {
      name: "2026년 10월 발행 달력 — 발행된 날만 링크",
      hidden: true,
    });
    const heads = within(table).getAllByRole("columnheader", { hidden: true });
    expect(heads.map((th) => th.textContent)).toEqual([
      "일",
      "월",
      "화",
      "수",
      "목",
      "금",
      "토",
    ]);
    expect(heads[0]).toHaveAttribute("abbr", "일요일");
    expect(table.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(panel(container).querySelector("ul")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("달 이동 — 한 달뿐이면 둘 다 비활성 버튼(9월은 창간 전 · 11월은 아직 발행 전), 닫기 버튼", async () => {
    const { container } = await renderArchive("2026-10-17");
    const cal = within(panel(container));
    expect(
      cal.getByRole("button", {
        name: "이전 달 — 2026년 9월은 창간 전",
        hidden: true,
      }),
    ).toBeDisabled();
    expect(
      cal.getByRole("button", {
        name: "다음 달 — 2026년 11월은 아직 발행 전",
        hidden: true,
      }),
    ).toBeDisabled();
    expect(
      cal.getByRole("button", { name: "달력 닫기", hidden: true }),
    ).toBeEnabled();
  });

  it("달 이동 — 다른 달에 호가 있으면 그 달 첫 호로 가는 링크(앞 달도 첫 호)", async () => {
    const dates = [
      "2026-09-28",
      "2026-09-30",
      ...DATES,
      "2026-11-02",
      "2026-11-05",
    ];
    listNewsDates.mockReturnValue(dates);
    loadNewsIssue.mockImplementation((date) =>
      dates.includes(date) ? issueOf(date) : null,
    );
    const { container } = await renderArchive("2026-10-17");
    const months = [
      ...panel(container).querySelectorAll<HTMLAnchorElement>(
        "a[data-cal-month]",
      ),
    ];
    expect(months.map((a) => [a.dataset.calMonth, hrefOf(a)])).toEqual([
      ["prev", "/news/2026-09-28/"],
      ["next", "/news/2026-11-02/"],
    ]);
    expect(months[0]).toHaveTextContent("이전 달 — 2026년 9월 첫 호로");
  });
});

describe("꼬리표를 싣는 곳 — /news/·날짜 아카이브만, 홈에는 없음", () => {
  it("/news/: 최신 호 꼬리표(이전 호 10-21 · 달력 · '최신 호예요'), h1 '뉴스'", () => {
    const { container } = render(<NewsPage />);
    const links = within(counterfoil()).getAllByRole("link");
    expect(links.map((a) => [a.getAttribute("rel"), hrefOf(a)])).toEqual([
      ["prev", "/news/2026-10-21/"],
    ]);
    expect(counterfoil()).toHaveTextContent("최신 호예요");
    expect(panel(container)).not.toBeNull();
    expect(
      panel(container).querySelector('a[aria-current="page"]'),
    ).toHaveAttribute("data-cal-day", "2026-10-22");
    expect(
      screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent),
    ).toEqual(["뉴스"]);
    expect(
      within(screen.getByRole("navigation", { name: "주요 메뉴" })).getByRole(
        "link",
        { name: "뉴스" },
      ),
    ).toHaveAttribute("aria-current", "page");
  });

  it("홈 티켓에는 꼬리표·달력이 없다(홈 375 첫 화면 5줄 4줄 유지)", () => {
    const { container } = render(<HomePage />);
    expect(screen.queryByRole("navigation", { name: "호 넘기기" })).toBeNull();
    expect(container.querySelector("#archive-cal")).toBeNull();
    expect(container.querySelector("[data-ticket]")).not.toHaveAttribute(
      "data-counterfoil",
    );
  });
});
