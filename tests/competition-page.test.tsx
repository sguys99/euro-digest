import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CompetitionPage, {
  generateMetadata,
  generateStaticParams,
} from "@/app/competitions/[comp]/page";
import {
  CompetitionFileSchema,
  type CompetitionFile,
} from "@/lib/schema/competition";
import type { CompId } from "@/lib/schema/common";
import { NewsFileSchema, type NewsFile } from "@/lib/schema/news";
import type { RunLog } from "@/lib/schema/run";
import { FOOTBALL_DATA_ATTRIBUTION } from "@/lib/site";

// `/competitions/[comp]/`(M2-10·M2-11) — 대회 데이터·최신 호는 fixtures로 바꿔 끼운다(저장소 data/는 매일 바뀐다).
// 화면 모델 계산은 tests/competition-view.test.ts, 빌드 결과(375·1280 · 접근성)는 tests/e2e/competition.spec.ts.
const { loadCompetitionData, loadLatestNews, loadProdRuns } = vi.hoisted(
  () => ({
    loadCompetitionData: vi.fn<(comp: CompId) => CompetitionFile | null>(),
    loadLatestNews: vi.fn<() => NewsFile | null>(),
    loadProdRuns: vi.fn<() => RunLog[]>(() => []),
  }),
);
vi.mock("@/lib/data/competition-data", () => ({ loadCompetitionData }));
vi.mock("@/lib/data/news", () => ({ loadLatestNews }));
vi.mock("@/lib/data/runs", () => ({ loadProdRuns }));

const epl = CompetitionFileSchema.parse(
  JSON.parse(
    readFileSync(
      path.resolve("fixtures/schema/data/competitions/epl.json"),
      "utf8",
    ),
  ),
);
const news = NewsFileSchema.parse(
  JSON.parse(
    readFileSync(
      path.resolve("fixtures/schema/data/news/2026-10-10.json"),
      "utf8",
    ),
  ),
);

/**
 * 페이지를 그린다. `<noscript>` 안 스타일은 jsdom(스크립트 꺼짐 파싱)에서 실제 스타일로 적용돼 탭 목록을 숨기므로, 내용만 받아 두고
 * 지운다(브라우저는 JS가 켜져 있으면 noscript 내용을 글자로만 읽는다).
 */
async function renderPage(segment: string) {
  const ui = await CompetitionPage({
    params: Promise.resolve({ comp: segment }),
  } as PageProps<"/competitions/[comp]">);
  const result = render(ui);
  const noscript = [...result.container.querySelectorAll("noscript")].map(
    (n) => {
      const html = n.innerHTML;
      n.remove();
      return html;
    },
  );
  return { ...result, noscript };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T00:00:00Z"));
  loadCompetitionData.mockReset();
  loadCompetitionData.mockImplementation((comp) =>
    comp === "EPL" ? epl : null,
  );
  loadLatestNews.mockReturnValue(news);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("generateStaticParams · 메타", () => {
  it("6개 대회 — 소문자 세그먼트", () => {
    expect(generateStaticParams()).toEqual([
      { comp: "epl" },
      { comp: "laliga" },
      { comp: "seriea" },
      { comp: "bundesliga" },
      { comp: "ligue1" },
      { comp: "ucl" },
    ]);
  });

  it("제목 = 대회명 + 시즌(스코어 모양 검사 통과), canonical = 자기 자신", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ comp: "epl" }),
    } as PageProps<"/competitions/[comp]">);
    expect(meta.title).toBe("프리미어리그 2026-27 시즌");
    expect(meta.alternates?.canonical).toBe(
      "https://sguys99.github.io/euro-digest/competitions/epl/",
    );
    expect(String(meta.description)).toContain("football-data.org");
  });
});

describe("CompetitionPage — EPL fixtures", () => {
  it("h1 대회명 하나, 리그 탭이 현재(EPL = 리그 탭의 페이지), 대회 이동 6칸 중 EPL 현재", async () => {
    await renderPage("epl");
    expect(
      screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent),
    ).toEqual(["프리미어리그"]);
    const top = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(within(top).getByRole("link", { name: "리그" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const sw = screen.getByRole("navigation", { name: "대회 이동" });
    const links = within(sw).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "EPL",
      "라리가",
      "세리에A",
      "분데스",
      "리그1",
      "UCL",
    ]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[0]?.getAttribute("href")).toMatch(/^\/competitions\/epl\/?$/);
    expect(screen.getByText("2026-27 시즌")).toBeInTheDocument();
  });

  it("보기 탭 4개 — 순위표 선택, 나머지 패널은 숨김(JS 없으면 noscript 스타일이 펼친다)", async () => {
    const { container, noscript } = await renderPage("epl");
    const tabs = within(
      screen.getByRole("tablist", { name: "프리미어리그 보기" }),
    ).getAllByRole("tab");
    expect(
      tabs.map((t) => [t.textContent, t.getAttribute("aria-selected")]),
    ).toEqual([
      ["순위표", "true"],
      ["일정·결과", "false"],
      ["득점 순위", "false"],
      ["뉴스", "false"],
    ]);
    const panels = container.querySelectorAll<HTMLElement>("[data-view]");
    expect([...panels].map((p) => [p.dataset.view, p.hidden])).toEqual([
      ["table", false],
      ["fixtures", true],
      ["scorers", true],
      ["news", true],
    ]);
    expect(noscript.join("")).toContain("[role=tabpanel][hidden]");
  });

  it("순위표 — 행 id = 팀 slug, ▲ 변동 / 전날 자료 없음(빈칸 + 화면 밖), 폼 묶음 이름, 펼침 버튼", async () => {
    const { container } = await renderPage("epl");
    const table = screen.getByRole("table", { name: /프리미어리그 순위/ });
    const rows =
      container.querySelectorAll<HTMLTableRowElement>("tr[data-row]");
    expect([...rows].map((r) => r.id)).toEqual([
      "sample-united",
      "example-city",
    ]);
    const first = rows[0]!;
    expect(first.querySelector("[data-trend]")?.textContent).toBe("1계단 상승");
    expect(rows[1]!.querySelector("[data-trend]")?.textContent).toBe(
      "변동 자료 없음",
    );
    expect(
      within(table).getByRole("img", {
        name: "최근 리그 경기 자료 3경기 (오래된 순): 무, 승, 승 — 나머지 2경기 자료 없음",
      }),
    ).toBeInTheDocument();
    const button = within(first).getByRole("button", {
      name: /Sample United 상세 펼치기/,
    });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "sample-united-d");
    expect(container.querySelector("#sample-united-d")).toHaveAttribute(
      "hidden",
    );
    // 팀 이름은 아직 링크가 아니다(팀 페이지 M2-13)
    expect(within(table).queryAllByRole("link")).toEqual([]);
    // 사전·색 표에 없는 팀 — 원어 이름 + 폴백 배지(장식)
    expect(first.querySelector(".kit-none")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("일정·결과 — 지금 라운드(data-current), 임시 킥오프는 '임시', 라운드 이동은 앵커", async () => {
    const { container } = await renderPage("epl");
    const book = container.querySelector("[data-rounds]")!;
    const rounds = book.querySelectorAll<HTMLElement>("[data-round]");
    expect(
      [...rounds].map((r) => [r.id, r.hasAttribute("data-current")]),
    ).toEqual([
      ["round-7", false],
      ["round-8", true],
    ]);
    const r8 = rounds[1]!;
    expect(r8.textContent).toContain("임시");
    expect(
      within(r8).getByRole("link", { name: "7라운드", hidden: true }),
    ).toHaveAttribute("href", "#round-7");
    expect(r8.querySelector('[aria-disabled="true"]')?.textContent).toBe(
      "다음 라운드 없음",
    );
  });

  it("득점 순위 — 공동 1위, 자료 없는 값은 '–'", async () => {
    await renderPage("epl");
    const table = screen.getByRole("table", {
      hidden: true,
      name: /득점 순위/,
    });
    const body = within(table).getAllByRole("row", { hidden: true }).slice(1);
    expect(
      body.map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent)),
    ).toEqual([
      ["1", "3", "1", "0", "7"],
      ["1", "3", "–", "–", "–"],
    ]);
  });

  it("데이터 출처 줄 — 필수 영문 문구(lang=en)·갱신 시각, 36시간 안이면 지연 없음", async () => {
    const { container } = await renderPage("epl");
    const note = container.querySelector('[data-slot="competition-source"]')!;
    expect(note.textContent).toContain("10.10 06:35 KST");
    expect(note.querySelector('[lang="en"]')?.textContent).toBe(
      FOOTBALL_DATA_ATTRIBUTION,
    );
    expect(note.textContent).not.toContain("업데이트 지연");
  });

  it("updatedAt이 36시간 넘게 지나면 '업데이트 지연'", async () => {
    vi.setSystemTime(new Date("2026-10-12T00:00:00Z"));
    const { container } = await renderPage("epl");
    expect(
      container.querySelector('[data-slot="competition-source"]')?.textContent,
    ).toContain("업데이트 지연");
  });
});

describe("CompetitionPage — 데이터 없음·다른 대회", () => {
  it("데이터 파일이 없으면 머리 + 빈 상태(탭·출처 줄 없음), 리그 탭은 섹션 표시", async () => {
    const { container } = await renderPage("laliga");
    expect(
      screen.getByRole("heading", { level: 1, name: "라리가" }),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="competition-empty"]')?.textContent,
    ).toContain("아직 이 대회 자료가 없어요.");
    expect(screen.queryByRole("tablist")).toBeNull();
    const top = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(within(top).getByRole("link", { name: "리그" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
