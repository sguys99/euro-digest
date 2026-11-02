import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import NationalTeamPage, { metadata } from "@/app/national-team/page";
import { NationalHome } from "@/components/national-team/national-team";
import { loadNationalTeamConfig } from "@/lib/data/national-team";
import { loadNationalHome, nationalNewsTags } from "@/lib/data/national-page";

// `/national-team/` · 홈 A매치 섹션(M3-13 — PRD FR-70~73). 일정 · 명단은 저장소 설정(`configs/national-team.json` — 사람이 관리, 스키마 검증)
// 그대로, 기준 시각은 주입한다(공개 빌드 날짜와 무관하게 기간 안 · 밖을 본다). 뉴스는 저장소 data/news(날마다 바뀜)라 구조만 본다.
// 화면 모델 규칙은 tests/national-team-view.test.ts, 빌드 결과(375 · 1280 · 접근성)는 tests/e2e/national-team.spec.ts · 견본 e2e.
const { loadLatestIssue } = vi.hoisted(() => ({
  loadLatestIssue: vi.fn(() => ({ issue: null, news: null })),
}));
vi.mock("@/lib/data/issue", () => ({ loadLatestIssue }));

const config = loadNationalTeamConfig()!;
const at = (iso: string) => new Date(iso);

describe("loadNationalHome — 빌드 시각 KST 날짜가 A매치 기간일 때만(FR-71)", () => {
  it("11월 기간(11-10 ~ 11-20 KST) 밖이면 null", () => {
    expect(loadNationalHome(at("2026-11-01T00:00:00Z"))).toBeNull();
    expect(loadNationalHome(at("2026-11-09T14:59:00Z"))).toBeNull(); // 11-09 23:59 KST
    expect(loadNationalHome(at("2026-11-20T15:00:00Z"))).toBeNull(); // 11-21 00:00 KST
  });

  it("기간 첫날 · 끝날 — 그 기간 2경기 + 11월 소집 명단", () => {
    for (const iso of ["2026-11-09T15:00:00Z", "2026-11-20T14:59:00Z"]) {
      const data = loadNationalHome(at(iso))!;
      expect(data.window).toMatchObject({
        from: "2026-11-10",
        to: "2026-11-20",
      });
      expect(data.rows.map((r) => r.id)).toEqual([
        "2026-11-13-saudi-arabia",
        "2026-11-17-qatar",
      ]);
      expect(data.squad?.label).toBe("11월 소집");
      expect(data.news.items.length).toBeLessThanOrEqual(3);
    }
  });

  it("9·10월 기간 — 결과 4경기, 지난 기간이라 11월 명단은 싣지 않는다", () => {
    const data = loadNationalHome(at("2026-10-07T03:00:00Z"))!;
    expect(data.rows.every((r) => r.state === "finished")).toBe(true);
    expect(data.rows).toHaveLength(4);
    expect(data.squad).toBeNull();
  });
});

describe("NationalHome — 홈 A매치 섹션", () => {
  it("일정 행(홈 팀 먼저 · 예정 KST) · 소집 선수 = 선수 상세 링크 · /national-team/ 링크", () => {
    const data = loadNationalHome(at("2026-11-12T03:00:00Z"))!;
    render(
      <NationalHome data={data} headingId="hn-h" tagsOf={nationalNewsTags()} />,
    );
    const section = screen.getByRole("region", { name: "A매치" });
    const rows = section.querySelectorAll('[data-slot="national-match"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toMatch(/홈 사우디아라비아.*원정 대한민국/);
    expect(rows[0]!.textContent).toContain("23:30");
    expect(rows[0]).toHaveAttribute("data-state", "scheduled");
    // 예정 경기 오른쪽 칸 끝 경기별 .ics(M4-12) — 이름 = 대진 + "캘린더에 추가 .ics"
    expect(
      within(rows[0] as HTMLElement).getByRole("link", {
        name: "사우디아라비아 대 대한민국 경기 캘린더에 추가 .ics",
      }),
    ).toHaveAttribute(
      "href",
      "/euro-digest/calendar/match/2026-11-13-saudi-arabia.ics",
    );
    const squad = within(
      section.querySelector('[data-slot="home-national-squad"]') as HTMLElement,
    );
    const slugs = config.squads.at(-1)!.playerSlugs;
    expect(squad.getAllByRole("link")).toHaveLength(slugs.length);
    expect(squad.getByRole("link", { name: "김민재" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/korean-players\/kim-min-jae\/?$/),
    );
    const more = within(section).getAllByRole("link").at(-1)!;
    expect(more).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/national-team\/?$/),
    );
  });

  it("경기 뒤 결과 입력 전 = 결과 대기, 결과가 있으면 결과 값 묶음(결과 가리기 대상)", () => {
    const pending = loadNationalHome(at("2026-11-18T03:00:00Z"))!;
    const { unmount } = render(
      <NationalHome data={pending} headingId="a-h" tagsOf={() => []} />,
    );
    expect(screen.getAllByText("결과 대기")).toHaveLength(2);
    // 결과 대기(킥오프 지남)에는 .ics 없음
    expect(document.querySelector("[data-slot=ics-link]")).toBeNull();
    unmount();
    const done = loadNationalHome(at("2026-10-07T03:00:00Z"))!;
    const { container } = render(
      <NationalHome data={done} headingId="b-h" tagsOf={() => []} />,
    );
    const values = container.querySelectorAll('[data-slot="result-value"]');
    expect(values).toHaveLength(4);
    // 9.28 우루과이전 — 한국 홈 1-4 패
    expect(values[1]!.textContent).toMatch(/^1-대4/);
    expect(values[1]!.textContent).toContain("패");
    expect(
      container.querySelector('[data-slot="home-national-squad"]'),
    ).toBeNull();
  });
});

describe("/national-team/ 페이지", () => {
  it("메타 — 제목 · canonical", () => {
    expect(metadata.alternates?.canonical).toContain("/national-team/");
  });

  it("h1 대표팀 → 일정·결과 → 소집 명단 → 대표팀 소식 → 주요국 A매치 뉴스 → 출처 줄(DOM 순서)", () => {
    const { container } = render(<NationalTeamPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "대표팀",
    );
    const order = [
      ...container.querySelectorAll(
        '[data-slot="national-page"] [data-slot^="national-"]',
      ),
    ]
      .map((e) => e.getAttribute("data-slot"))
      .filter((s) =>
        [
          "national-schedule",
          "national-squad",
          "national-kr-news",
          "national-world",
          "national-source",
        ].includes(s!),
      );
    const want = [
      "national-schedule",
      "national-squad",
      "national-kr-news",
      "national-world",
      "national-source",
    ];
    expect(order).toEqual(want.filter((s) => order.includes(s)));
    expect(order).toContain("national-schedule");
    expect(order).toContain("national-squad");
    expect(
      container.querySelectorAll('[data-slot="national-match"]'),
    ).toHaveLength(config.matches.length);
    // 소집 선수 = 선수 상세 링크(FR-73)
    const squad = container.querySelector(
      '[data-slot="national-squad"]',
    ) as HTMLElement;
    expect(
      within(squad)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")?.replace(/\/?$/, "/")),
    ).toEqual(
      config.squads.at(-1)!.playerSlugs.map((s) => `/korean-players/${s}/`),
    );
    expect(squad.textContent).toContain("전체 소집 명단이 아니에요");
    // 주요국 A매치 뉴스 → /news/?cat=national
    expect(
      screen.getByRole("link", { name: /뉴스에서 대표팀 소식 모아 보기/ }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/news\/?\?cat=national$/),
    );
    // 근거 링크 — 새 창
    const source = container.querySelector(
      '[data-slot="national-source"]',
    ) as HTMLElement;
    for (const a of within(source).getAllByRole("link")) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.textContent).toContain("(새 창)");
    }
  });
});
