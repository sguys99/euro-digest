/**
 * `/about/` 소개·정책 페이지 (M1-36 — PRD FR-140·FR-45·FR-143·FR-35, D8·D23·D24·D26)
 * 필수 문구·절 앵커·차례·연락처를 렌더 결과로 확인하고, 매체 목록과 발행 시각이 설정·코드에서 오는지(하드코딩 아님) 대조한다.
 * 폭별 배치·가로 넘침·앵커 이동·axe는 tests/e2e/about.spec.ts·a11y.spec.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AboutPage, { metadata } from "@/app/about/page";
import { outletsFrom } from "@/lib/about";
import { ABOUT_SECTIONS } from "@/lib/about-sections";
import { issueFormUrl } from "@/lib/paths";
import { NewsFileSchema, type NewsFile } from "@/lib/schema/news";
import type { RunLog } from "@/lib/schema/run";
import { SourcesFileSchema } from "@/lib/schema/source";
import { CONTACT_EMAIL, FOOTBALL_DATA_ATTRIBUTION } from "@/lib/site";

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

/** 호 날짜만 바꾼 픽스처(시각표 기준일) */
function issueOn(date: string): NewsFile {
  return { ...fixture, date };
}

const SOURCES = SourcesFileSchema.parse(
  JSON.parse(readFileSync(path.resolve("configs/sources.json"), "utf8")),
);

function section(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el;
}

beforeEach(() => {
  loadLatestNews.mockReset();
  loadLatestNews.mockReturnValue(issueOn("2026-10-19"));
});

describe("AboutPage — 머리·차례·절", () => {
  it("제목 '소개 · 유로 다이제스트'(레이아웃 템플릿) · description", () => {
    expect(metadata.title).toBe("소개");
    expect(metadata.description).toContain("AI 작성 고지");
  });

  it("h1 '소개' 하나, 현재 탭 없음(소개는 내비에 넣지 않는다 — PRD §4.1 하단 탭 5개 고정)", () => {
    const { container } = render(<AboutPage />);
    expect(
      screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent),
    ).toEqual(["소개"]);
    expect(container.querySelector("[aria-current]")).toBeNull();
    for (const name of ["주요 메뉴", "하단 탭"]) {
      const nav = screen.getByRole("navigation", { name });
      expect(within(nav).queryByRole("link", { name: "소개" })).toBeNull();
    }
  });

  it("절 6개 — ABOUT_SECTIONS 순서·앵커 id·h2 제목, 절은 h2로 이름 붙인 section", () => {
    render(<AboutPage />);
    const ids = [...document.querySelectorAll("main section[id]")].map(
      (el) => el.id,
    );
    expect(ids).toEqual(ABOUT_SECTIONS.map((s) => s.id));
    for (const s of ABOUT_SECTIONS) {
      const el = section(s.id);
      const h2 = within(el).getAllByRole("heading", { level: 2 })[0];
      expect(h2).toHaveTextContent(s.title);
      expect(el).toHaveAttribute("aria-labelledby", h2?.id);
      // 앵커로 도착할 때 위 여백(고정 요소는 없지만 괘선이 화면 끝에 붙지 않게)
      expect(el.className).toContain("scroll-mt-4");
    }
  });

  it("차례 — 1024 이상 목차 열 + 1023 이하 본문 차례, 둘 다 6개 앵커 링크(01~06)", () => {
    render(<AboutPage />);
    const tocs = screen.getAllByRole("navigation", { name: "소개 차례" });
    expect(tocs).toHaveLength(2);
    for (const toc of tocs) {
      const links = within(toc).getAllByRole("link");
      // 같은 페이지 앵커 — 일반 <a>(브라우저 기본 이동이라 :target이 걸린다)
      expect(links.map((a) => a.getAttribute("href"))).toEqual(
        ABOUT_SECTIONS.map((s) => `#${s.id}`),
      );
      expect(links.map((a) => a.textContent)).toEqual(
        ABOUT_SECTIONS.map(
          (s, i) => `${s.title}${String(i + 1).padStart(2, "0")}`,
        ),
      );
    }
    // 목차 열은 1024 이상에만(앱 셸 contents), 본문 차례는 1023 이하에만
    expect(tocs[0]?.className).toContain("lg:block");
    expect(tocs[1]?.className).toContain("lg:hidden");
  });

  it("태그라인·서비스 소개·다루는 대회(configs/competitions.json 약칭 + 정식 이름)", () => {
    render(<AboutPage />);
    const intro = screen.getByRole("heading", { level: 1 }).closest("section");
    expect(intro).toHaveTextContent("매일 아침, 밤사이 유럽 축구를 한눈에.");
    expect(intro).toHaveTextContent("오늘의 5줄");
    const comps = within(intro as HTMLElement).getByRole("list", {
      name: "다루는 대회",
    });
    const items = within(comps).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveTextContent("EPL프리미어리그");
    expect(items[5]).toHaveTextContent("UCLUEFA 챔피언스리그");
  });
});

describe("발행 시각 — 계절별(D26), 빌드 때 계산", () => {
  it("서머타임 기간 호(2026-10-19): 지금 07:00 · 10월 26일 (월) 호부터 07:30, 07:00 하나로 고정하지 않는다", () => {
    render(<AboutPage />);
    const el = section("schedule");
    const rows = within(el).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(
      "07:00KST유럽 서머타임 기간지금2026년 3월 30일 (월) ~ 10월 25일 (일) 호",
    );
    expect(rows[1]).toHaveTextContent(
      "07:30KST유럽 표준시 기간2026년 10월 26일 (월) ~ 2027년 3월 28일 (일) 호",
    );
    expect(el).toHaveTextContent(
      "지금은 유럽 서머타임 기간이라 매일 07:00 KST에 발행합니다. 10월 26일 (월) 호부터는 07:30 KST입니다.",
    );
    expect(el.querySelector('time[datetime="2026-10-26"]')).not.toBeNull();
    expect(el).toHaveTextContent("30분 늦게 냅니다.");
  });

  it("표준시 기간 호(2026-10-26): 지금 07:30 · 2027년 3월 29일 (월) 호부터 07:00", () => {
    loadLatestNews.mockReturnValue(issueOn("2026-10-26"));
    render(<AboutPage />);
    const el = section("schedule");
    expect(el).toHaveTextContent(
      "지금은 유럽 표준시 기간이라 매일 07:30 KST에 발행합니다. 2027년 3월 29일 (월) 호부터는 07:00 KST입니다.",
    );
    expect(within(el).getAllByRole("listitem")[0]).toHaveTextContent(
      "07:30KST유럽 표준시 기간지금",
    );
  });

  it("발행된 호가 없어도(빈 data) 빌드 날짜로 렌더된다", () => {
    loadLatestNews.mockReturnValue(null);
    render(<AboutPage />);
    expect(section("schedule")).toHaveTextContent(
      /지금은 유럽 (서머타임|표준시) 기간이라/,
    );
  });
});

describe("출처·저작권 정책 · 출처 Tier — 매체는 configs/sources.json에서", () => {
  it("본문 미수집 · 원제목 그대로(번역·요약 없음) · 이미지·로고 미사용 · 72시간", () => {
    render(<AboutPage />);
    const el = section("sources");
    expect(el).toHaveTextContent("기사 본문은 가져오지 않습니다.");
    expect(el).toHaveTextContent(
      "피드의 원제목을 그대로 싣습니다. 번역하거나 요약하거나 고쳐 쓰지 않습니다.",
    );
    expect(el).toHaveTextContent("한국어 원문 제목을 그대로 싣습니다.");
    expect(el).toHaveTextContent("로고");
    expect(el).toHaveTextContent("72시간 안에 처리합니다.");
    expect(within(el).getByRole("link", { name: "요청 방법" })).toHaveAttribute(
      "href",
      "#contact",
    );
  });

  it("지금 싣는 매체 = outletsFrom(설정) — 이름·언어 속성·Tier 배지, 해외·국내로 나눔", () => {
    render(<AboutPage />);
    const el = section("sources");
    const expected = outletsFrom(SOURCES);
    expect(expected.length).toBeGreaterThan(0);
    const lists = within(el)
      .getAllByRole("list")
      .filter((list) => list.querySelector("li [lang]"));
    const rendered = lists.flatMap((list) =>
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.querySelector("p > span[lang]")),
    );
    expect(rendered.map((n) => n?.textContent)).toEqual([
      ...expected.filter((o) => o.region === "overseas").map((o) => o.name),
      ...expected.filter((o) => o.region === "domestic").map((o) => o.name),
    ]);
    for (const outlet of expected) {
      const name = within(el).getByText(outlet.name, {
        selector: "span[lang]",
      });
      expect(name).toHaveAttribute("lang", outlet.lang);
      const row = name.closest("li") as HTMLElement;
      for (const tier of outlet.tiers) {
        expect(row).toHaveTextContent(`출처 Tier ${tier}`);
      }
    }
    // 꺼진 소스(약관상 제외 — D22)는 없다
    expect(el).not.toHaveTextContent("Sky Sports");
    expect(el).not.toHaveTextContent("The Guardian");
    expect(el).not.toHaveTextContent("Google News");
    expect(
      within(el).getByRole("heading", { name: /지금 싣는 매체/ }),
    ).toHaveTextContent(`지금 싣는 매체${expected.length}곳`);
  });

  it("Tier 1~3 정의(PRD 용어 — basic_plan 3.8)와 지금 싣는 매체 수", () => {
    render(<AboutPage />);
    const el = section("tier");
    const rows = within(el).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    const outlets = outletsFrom(SOURCES);
    rows.forEach((row, index) => {
      const tier = index + 1;
      expect(row).toHaveTextContent(`출처 Tier ${tier}`);
      const count = outlets.filter((o) => o.tiers[0] === tier).length;
      expect(row).toHaveTextContent(`지금 싣는 매체 ${count}곳`);
    });
    expect(rows[0]).toHaveTextContent("구단·리그 공식 발표");
    expect(el).toHaveTextContent("1이 가장 높고");
    expect(el).toHaveTextContent(
      "기사 안에서 인용한 다른 기자나 매체는 등급에 넣지 않습니다.",
    );
  });
});

describe("AI 작성 고지(#ai — 브리핑 'AI 작성' 라벨이 가리킴, D23·D24)", () => {
  it("AI는 오늘의 5줄에만 · 입력은 경기 데이터만(기사 없음) · 라벨은 AI 줄에만 · 검증 실패 줄은 코드 문장 · 뉴스 카드는 AI 없음", () => {
    render(<AboutPage />);
    const el = section("ai");
    expect(el).toHaveTextContent(
      "AI는 홈 맨 위 ‘오늘의 5줄’의 문장을 쓰는 데만 씁니다. 뉴스 카드에는 AI를 쓰지 않습니다.",
    );
    expect(el).toHaveTextContent("기사 제목이나 내용은 넣지 않습니다.");
    expect(el).toHaveTextContent("AI가 쓴 줄 끝에만 AI 작성 라벨을 붙입니다.");
    expect(el).toHaveTextContent("이 줄에는 라벨을 붙이지 않습니다.");
    expect(el).toHaveTextContent("전날 경기가 없으면 AI를 부르지 않습니다.");
    // 라벨 견본은 링크가 아니다
    expect(within(el).queryByRole("link", { name: "AI 작성" })).toBeNull();
  });
});

describe("데이터 출처(#data — FR-45)", () => {
  it("football-data.org 필수 문구는 영문 원문 그대로(lang=en), API-Football 병기, 두 서비스 링크(새 창)", () => {
    render(<AboutPage />);
    const el = section("data");
    const fd = within(el).getByText(FOOTBALL_DATA_ATTRIBUTION);
    expect(fd.textContent).toBe(
      "Football data provided by the Football-Data.org API",
    );
    expect(fd).toHaveAttribute("lang", "en");
    const links = within(el).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://www.football-data.org/",
      "https://www.api-football.com/",
    ]);
    for (const a of links) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
      expect(a).toHaveTextContent("(새 창)");
    }
  });
});

describe("삭제·정정 요청(#contact — FR-140·FR-143, D8)", () => {
  it("72시간 · 이메일(mailto) · 삭제·정정 이슈 양식 · 오류 신고 양식, 개인정보 처리방침(/privacy — M5-05)은 링크하지 않는다", () => {
    const { container } = render(<AboutPage />);
    const el = section("contact");
    expect(el).toHaveTextContent(
      "카드 삭제·정정 요청은 접수 후 72시간 안에 처리합니다.",
    );
    expect(el).toHaveTextContent(
      "공개 저장소의 git 이력에는 남을 수 있습니다.",
    );
    expect(
      within(el).getByRole("link", { name: CONTACT_EMAIL }),
    ).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
    expect(CONTACT_EMAIL).toBe("sguys99@gmail.com");
    expect(
      within(el).getByRole("link", { name: /삭제·정정 요청 양식/ }),
    ).toHaveAttribute("href", issueFormUrl("takedown.yml"));
    expect(
      within(el).getByRole("link", { name: /브리핑·분류 오류 신고 양식/ }),
    ).toHaveAttribute("href", issueFormUrl("summary-error.yml"));
    expect(container.querySelector('a[href*="privacy"]')).toBeNull();
  });
});
