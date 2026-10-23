/**
 * 앱 셸 (M1-30 — PRD DR-01·FR-142·FR-45·§4.1, DESIGN §4.3·§9.3·§10)
 * 티켓 마스트헤드(호수·스텁)·내비(M1 홈·뉴스만)·랜드마크·열 구성·뒤표지 문구를 렌더 결과로 확인한다.
 * 실제 폭별 배치·가로 넘침·sticky는 tests/e2e/shell.spec.ts.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell, layoutColumns } from "@/components/shell/app-shell";
import { Masthead } from "@/components/shell/masthead";
import { NAV_ITEMS } from "@/components/shell/site-nav";
import type { IssueMeta } from "@/lib/issue";
import { routes } from "@/lib/paths";
import { FOOTBALL_DATA_ATTRIBUTION, REPO_URL } from "@/lib/site";

const ISSUE: IssueMeta = {
  date: "2026-10-18",
  no: 7,
  // KST 06:58 · 15:04
  publishedAt: "2026-10-17T21:58:30.000Z",
  updatedAt: "2026-10-18T06:04:10.000Z",
};

function ticket(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>("[data-ticket]");
  if (!el) throw new Error("티켓 없음");
  return el;
}

describe("내비 항목 — M1은 홈·뉴스만(미완성 섹션 숨김, plan §2.3)", () => {
  it("홈·뉴스 두 항목, 있는 라우트로만 간다", () => {
    expect(NAV_ITEMS.map((item) => [item.key, item.label, item.href])).toEqual([
      ["home", "홈", routes.home()],
      ["news", "뉴스", routes.news()],
    ]);
  });

  it("하단 탭·상단 내비 모두 같은 두 항목, 현재 페이지만 aria-current", () => {
    render(
      <AppShell current="news" issue={ISSUE}>
        본문
      </AppShell>,
    );
    for (const name of ["하단 탭", "주요 메뉴"]) {
      const nav = screen.getByRole("navigation", { name });
      const links = within(nav).getAllByRole("link");
      expect(links.map((a) => a.textContent)).toEqual(["홈", "뉴스"]);
      // 테스트 환경의 next/link는 trailingSlash 설정을 모른다(끝 슬래시를 뗀다) — 빌드 HTML의 href는 e2e가 본다
      expect(
        links.map((a) => a.getAttribute("href")?.replace(/\/?$/, "/")),
      ).toEqual(["/", "/news/"]);
      expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([
        null,
        "page",
      ]);
    }
    // 리그·한국 선수·마이는 아직 없다
    expect(screen.queryByRole("link", { name: "리그" })).toBeNull();
    expect(screen.queryByRole("link", { name: "한국 선수" })).toBeNull();
    expect(screen.queryByRole("link", { name: "마이" })).toBeNull();
  });

  it("currentKind='section'(날짜 아카이브 — M1-34)이면 그 항목은 aria-current='true'(이 페이지가 /news/ 자신은 아니다), 같은 표시(막대·굵기)", () => {
    render(
      <AppShell current="news" currentKind="section" issue={ISSUE}>
        본문
      </AppShell>,
    );
    for (const name of ["하단 탭", "주요 메뉴"]) {
      const links = within(
        screen.getByRole("navigation", { name }),
      ).getAllByRole("link");
      expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([
        null,
        "true",
      ]);
      expect(links[1]?.className).toContain("aria-[current=true]:text-ink");
    }
  });

  it("현재 항목이 없으면(404) aria-current 없음", () => {
    const { container } = render(<AppShell issue={ISSUE}>본문</AppShell>);
    expect(container.querySelector("[aria-current]")).toBeNull();
  });
});

describe("랜드마크·건너뛰기 대상 (DESIGN §10)", () => {
  it("header · main#main(tabindex -1) · footer · 하단 탭 nav, 본문은 main 안", () => {
    const { container } = render(
      <AppShell current="home" issue={ISSUE}>
        <p>본문 내용</p>
      </AppShell>,
    );
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveAttribute("tabindex", "-1");
    expect(within(main).getByText("본문 내용")).toBeInTheDocument();
    expect(container.querySelectorAll("main")).toHaveLength(1);
    // 토스트 aria-live 영역 하나(테마 토글 알림)
    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });

  it("홈은 워드마크가 h1, 다른 페이지는 p(그 페이지 제목이 h1)", () => {
    const { unmount } = render(
      <AppShell current="home" issue={ISSUE}>
        본문
      </AppShell>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "유로 다이제스트" }),
    ).toBeInTheDocument();
    unmount();
    render(
      <AppShell current="news" issue={ISSUE}>
        <h1>뉴스</h1>
      </AppShell>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("뉴스");
    expect(
      screen.getByRole("link", { name: "유로 다이제스트" }),
    ).toHaveAttribute("href", "/");
  });
});

describe("열 구성 — 페이지가 채운 슬롯만 열이 된다(D31 · DECISIONS D0 §4 M1 상태)", () => {
  it("layoutColumns", () => {
    expect(layoutColumns(false, false)).toBe("none");
    expect(layoutColumns(true, false)).toBe("contents");
    expect(layoutColumns(false, true)).toBe("facing");
    expect(layoutColumns(true, true)).toBe("both");
  });

  it("슬롯을 주지 않으면 목차·마주 보는 면 없이 지면 한 열(M1-30 상태)", () => {
    const { container } = render(
      <AppShell current="home" issue={ISSUE}>
        본문
      </AppShell>,
    );
    const grid = screen.getByRole("main").parentElement;
    expect(grid).toHaveAttribute("data-columns", "none");
    expect(grid?.className).not.toMatch(/grid-cols/);
    expect(screen.queryByRole("navigation", { name: "뉴스 필터" })).toBeNull();
    expect(container.querySelector("aside")).toBeNull();
  });

  it("목차만 주면 1024 이상 232 · 1fr 2단 — 1280 이상에도 마주 보는 면 열이 생기지 않는다", () => {
    render(
      <AppShell current="news" issue={ISSUE} contents={<p>목차</p>}>
        본문
      </AppShell>,
    );
    const nav = screen.getByRole("navigation", { name: "뉴스 필터" });
    expect(nav).toHaveTextContent("목차");
    expect(nav.className).toMatch(/\bhidden\b/);
    expect(nav.className).toMatch(/lg:block/);
    const grid = screen.getByRole("main").parentElement;
    expect(grid).toHaveAttribute("data-columns", "contents");
    expect(grid?.className).toContain(
      "lg:grid-cols-[var(--col-contents)_minmax(0,1fr)]",
    );
    expect(grid?.className).not.toContain("--col-facing");
    // DOM 순서: 목차 → 지면
    expect(nav.nextElementSibling).toBe(screen.getByRole("main"));
  });

  it("둘 다 주면 1280 이상 3단, 마주 보는 면은 aside(1280 이상에만 보임)", () => {
    render(
      <AppShell
        current="home"
        issue={ISSUE}
        contents={<p>목차</p>}
        facing={<p>위젯</p>}
      >
        본문
      </AppShell>,
    );
    const aside = screen.getByRole("complementary", {
      name: "오늘 밤 경기·한국 선수·순위",
    });
    expect(aside.className).toMatch(/\bhidden\b/);
    expect(aside.className).toMatch(/xl:block/);
    const grid = screen.getByRole("main").parentElement;
    expect(grid).toHaveAttribute("data-columns", "both");
    expect(grid?.className).toContain(
      "xl:grid-cols-[var(--col-contents)_minmax(0,1fr)_var(--col-facing)]",
    );
    expect(screen.getByRole("main").nextElementSibling).toBe(aside);
  });
});

describe("티켓 마스트헤드 — 호수·스텁(DESIGN §9.3)", () => {
  it("제 N호 · KST 발행일 · 발행·업데이트 HH:MM KST(데이터에서 계산, <time datetime>)", () => {
    const { container } = render(
      <AppShell current="home" issue={ISSUE}>
        본문
      </AppShell>,
    );
    const t = ticket(container);
    expect(t).toHaveTextContent("제7호");
    const date = t.querySelector('time[datetime="2026-10-18"]');
    expect(date).toHaveTextContent("2026년 10월 18일 (일)");
    expect(
      t.querySelector(`time[datetime="${ISSUE.publishedAt}"]`)?.parentElement,
    ).toHaveTextContent("발행 06:58 KST");
    expect(
      t.querySelector(`time[datetime="${ISSUE.updatedAt}"]`)?.parentElement,
    ).toHaveTextContent("업데이트 15:04 KST");
    // 상단 내비 오른쪽 끝 마지막 업데이트
    expect(
      screen.getByRole("navigation", { name: "주요 메뉴" }),
    ).toHaveTextContent("마지막 업데이트 15:04 KST");
  });

  it("영문 워드마크·태그라인, 도구는 테마 토글만(검색·결과 가리기는 M4)", () => {
    const { container } = render(
      <AppShell current="home" issue={ISSUE}>
        본문
      </AppShell>,
    );
    const t = ticket(container);
    expect(t.querySelector('[lang="en"]')).toHaveTextContent("EURO DIGEST");
    expect(t).toHaveTextContent("매일 아침, 밤사이 유럽 축구를 한눈에.");
    const buttons = within(t).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "테마: 시스템 설정 (눌러서 바꾸기)",
    ]);
    expect(within(t).queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: /검색/ })).toBeNull();
    // 천공 줄은 장식
    expect(t.querySelector("span[aria-hidden='true']")).not.toBeNull();
    // 색 면 안 포커스 링 = 티켓 글자색(DESIGN §9.1)
    expect(t.className).toContain("[--ring:var(--ticket-fg)]");
  });

  it("검색·결과 가리기 자리 — 끼우면 도구 영역·스위치 칸에 들어간다(M4)", () => {
    const { container } = render(
      <Masthead
        issue={ISSUE}
        search={<button type="button">검색</button>}
        spoilerSwitch={<button type="button">결과 가리기</button>}
      />,
    );
    const t = ticket(container);
    const buttons = within(t).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "검색",
      "",
      "결과 가리기",
    ]);
  });

  it("창간일 전 호(픽스처)는 호수 없이 날짜·시각만", () => {
    const { container } = render(
      <AppShell
        current="home"
        issue={{ ...ISSUE, date: "2026-10-10", no: null }}
      >
        본문
      </AppShell>,
    );
    const t = ticket(container);
    expect(t).not.toHaveTextContent(/제\s*\d+\s*호/);
    expect(t.querySelector('time[datetime="2026-10-10"]')).toHaveTextContent(
      "2026년 10월 10일 (토)",
    );
  });

  it("발행 전(호 없음)이면 호수·시각 없이 안내 한 줄, 마지막 업데이트도 없다", () => {
    const { container } = render(
      <AppShell current="home" issue={null}>
        본문
      </AppShell>,
    );
    expect(ticket(container)).toHaveTextContent("아직 발행된 호가 없어요.");
    expect(container.querySelector("time")).toBeNull();
    expect(screen.queryByText(/마지막 업데이트/)).toBeNull();
  });
});

describe("뒤표지 — 데이터 출처·AI 고지·GitHub·마지막 업데이트(FR-142·FR-45)", () => {
  it("football-data.org 필수 문구는 영문 원문 그대로(lang=en), API-Football 병기", () => {
    render(
      <AppShell current="home" issue={ISSUE}>
        본문
      </AppShell>,
    );
    const footer = screen.getByRole("contentinfo");
    const fd = within(footer).getByText(FOOTBALL_DATA_ATTRIBUTION);
    expect(fd.textContent).toBe(
      "Football data provided by the Football-Data.org API",
    );
    expect(fd).toHaveAttribute("lang", "en");
    expect(footer).toHaveTextContent("football-data.org · API-Football");
  });

  it("설명 문단 — 데이터 출처 + 오늘의 5줄 AI 작성 고지(M1-32 — /about#ai와 같은 사실: AI 줄에만 라벨, 검증에 맞지 않는 줄은 라벨 없는 코드 문장·AI 답을 쓸 수 없는 날은 모든 줄 코드 문장, 뉴스 카드는 AI 없음)", () => {
    render(
      <AppShell current="home" issue={ISSUE}>
        본문
      </AppShell>,
    );
    const footer = screen.getByRole("contentinfo");
    const description = within(footer).getByText(
      /^경기·출전 데이터 football-data.org · API-Football\./,
    );
    expect(description.tagName).toBe("P");
    expect(description.textContent).toBe(
      "경기·출전 데이터 football-data.org · API-Football. 오늘의 5줄은 이 데이터로 AI가 쓰고, AI가 쓴 줄에만 ‘AI 작성’ 라벨을 붙입니다. 검증에 맞지 않는 줄은 라벨 없는 코드 문장으로 바꾸거나 빼고, AI 답을 쓸 수 없는 날은 모든 줄을 코드 문장으로 싣습니다. 뉴스 카드는 AI 없이 원문 제목 그대로 싣습니다.",
    );
    // 뒤표지에는 라벨 링크가 없다(링크 "AI 작성 고지"는 /about 안내 — M1-36)
    expect(within(footer).queryByRole("link", { name: "AI 작성" })).toBeNull();
  });

  it("호 줄 · 마지막 업데이트 HH:MM KST · /about 링크 3개 + GitHub 저장소(새 창)", () => {
    render(
      <AppShell current="home" issue={ISSUE}>
        본문
      </AppShell>,
    );
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(
      "유로 다이제스트 제 7호 · 2026년 10월 18일 (일)",
    );
    const updated = footer.querySelector(`time[datetime="${ISSUE.updatedAt}"]`);
    expect(updated?.parentElement).toHaveTextContent(
      "마지막 업데이트 15:04 KST",
    );
    expect(within(footer).getByRole("list")).toBeInTheDocument();
    const links = within(footer).getAllByRole("link");
    // DESIGN §9.3·혼합안 순서 — AI 작성 고지 · 소개·출처 정책 · (개인정보 처리방침 — M5-05, 아직 없는 페이지라 링크하지 않음) ·
    // 삭제·정정 요청 · GitHub. /about 앵커는 ABOUT_SECTIONS(M1-36)
    // 테스트 환경의 next/link는 trailingSlash를 모른다(끝 슬래시를 뗀다 — /about#ai) — 빌드 HTML의 href는 e2e가 본다
    expect(
      links
        .slice(0, 3)
        .map((a) => [
          a.textContent,
          a.getAttribute("href")?.replace(/^\/about(?=#|$)/, "/about/"),
        ]),
    ).toEqual([
      ["AI 작성 고지", "/about/#ai"],
      ["소개·출처 정책", "/about/"],
      ["삭제·정정 요청", "/about/#contact"],
    ]);
    expect(links).toHaveLength(4);
    expect(footer.querySelector('a[href*="privacy"]')).toBeNull();
    const github = links[3] as HTMLElement;
    expect(github).toHaveAttribute("href", REPO_URL);
    expect(github).toHaveAttribute("target", "_blank");
    expect(github.getAttribute("rel")).toContain("noopener");
    expect(github).toHaveTextContent("GitHub ↗ (새 창)");
    // 색 면 안 포커스 링 = 뒤표지 글자색
    expect(footer.className).toContain("[--ring:var(--colophon-fg)]");
  });
});
