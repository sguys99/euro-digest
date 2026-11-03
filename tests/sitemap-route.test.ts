import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import sitemap, { dynamic } from "@/app/sitemap";
import { NewsFileSchema, type NewsFile } from "@/lib/schema/news";
import type { RunLog } from "@/lib/schema/run";

// `src/app/sitemap.ts` 라우트(M1-38, FR-124) — 로더(발행일 목록·그 호 파일)를 바꿔 끼워 항목을 본다.
// 항목 규칙 자체는 tests/seo.test.ts, 빌드 결과 out/sitemap.xml은 e2e tests/e2e/seo.spec.ts.
const {
  listNewsDates,
  loadNewsIssue,
  loadLatestNews,
  issueLastModified,
  loadProdRuns,
} = vi.hoisted(() => ({
  listNewsDates: vi.fn<() => string[]>(),
  loadNewsIssue: vi.fn<(date: string) => NewsFile | null>(),
  loadLatestNews: vi.fn<() => NewsFile | null>(() => null),
  // 지면 수정 시각(M5-03 — generatedAt과 삭제 요청 반영 시각 중 늦은 것, 규칙은 tests/data-news.test.ts)
  issueLastModified: vi.fn<(date: string) => string | null>(),
  loadProdRuns: vi.fn<() => RunLog[]>(() => []),
}));
vi.mock("@/lib/data/news", () => ({
  listNewsDates,
  loadNewsIssue,
  loadLatestNews,
  issueLastModified,
}));
vi.mock("@/lib/data/runs", () => ({ loadProdRuns }));
// 브리핑 파일(M5-03 — 날짜 페이지 lastmod에 브리핑 generatedAt도 든다). 기본 없음
const { loadBrief } = vi.hoisted(() => ({
  loadBrief: vi.fn((): { generatedAt: string } | null => null),
}));
vi.mock("@/lib/data/brief", () => ({ loadBrief }));
// 대회 페이지(M2-10) — 저장소 data/competitions 대신 테스트가 정한 대회 데이터(기본 없음)
const { loadAllCompetitionData } = vi.hoisted(() => ({
  loadAllCompetitionData: vi.fn<
    () => Array<{ comp: "EPL" | "UCL"; updatedAt: string }>
  >(() => []),
}));
vi.mock("@/lib/data/competition-data", () => ({ loadAllCompetitionData }));
// 팀 페이지(M2-13) — 저장소 data/teams 대신 테스트가 정한 팀(기본 없음)
const { listTeamSlugs, loadTeam } = vi.hoisted(() => ({
  listTeamSlugs: vi.fn<() => string[]>(() => []),
  loadTeam: vi.fn((slug: string) => ({ slug, comp: "EPL" })),
}));
vi.mock("@/lib/data/teams", () => ({ listTeamSlugs, loadTeam }));
// 한국 선수 목록(M3-09) — 저장소 data/players 대신 테스트가 정한 현황 파일(기본 없음 → lastmod 없이 목록 페이지만)
const { loadKoreanPlayersData } = vi.hoisted(() => ({
  loadKoreanPlayersData: vi.fn<() => { generatedAt: string } | null>(
    () => null,
  ),
}));
vi.mock("@/lib/data/korean-players", () => ({ loadKoreanPlayersData }));
// 한국 선수 상세(M3-10) — 저장소 설정 대신 테스트가 정한 slug(기본 없음 → 상세 없음)
const { listKoreanPlayerSlugs } = vi.hoisted(() => ({
  listKoreanPlayerSlugs: vi.fn<() => string[]>(() => []),
}));
vi.mock("@/lib/data/player-page", () => ({ listKoreanPlayerSlugs }));
// 주간 리포트(M3-12) — 저장소 data/players/weekly 대신 테스트가 정한 주(기본 없음 → 색인만)
const { listWeeklyWeeks, loadWeeklyReport } = vi.hoisted(() => ({
  listWeeklyWeeks: vi.fn<() => string[]>(() => []),
  loadWeeklyReport: vi.fn((week: string) => ({
    week,
    generatedAt: `${week === "2026-43" ? "2026-11-01" : "2026-11-08"}T07:00:00.000Z`,
  })),
}));
vi.mock("@/lib/data/weekly-report", () => ({
  listWeeklyWeeks,
  loadWeeklyReport,
}));

// 이적(M4-04) — 트래커 파일(가장 늦은 갱신 = lastmod). 기본은 파일 없음
const { loadTransfersFile } = vi.hoisted(() => ({
  loadTransfersFile: vi.fn((): Array<{ updated: string }> | null => null),
}));
vi.mock("@/lib/data/transfers", () => ({ loadTransfersFile }));

const fixture = NewsFileSchema.parse(
  JSON.parse(
    readFileSync(
      path.resolve("fixtures/schema/data/news/2026-10-10.json"),
      "utf8",
    ),
  ),
);
const DATES = ["2026-10-12", "2026-10-13", "2026-10-17"];
const issueOf = (date: string): NewsFile => ({
  ...fixture,
  date,
  generatedAt: `${date}T00:${date.slice(8, 10)}:00.000Z`,
});
const SITE = "https://sguys99.github.io/euro-digest";

beforeEach(() => {
  listNewsDates.mockReset();
  listNewsDates.mockReturnValue(DATES);
  loadNewsIssue.mockReset();
  loadNewsIssue.mockImplementation((date) =>
    DATES.includes(date) ? issueOf(date) : null,
  );
  issueLastModified.mockReset();
  issueLastModified.mockImplementation((date) =>
    DATES.includes(date) ? issueOf(date).generatedAt : null,
  );
});

describe("sitemap 라우트", () => {
  it("정적 export용 force-static", () => {
    expect(dynamic).toBe("force-static");
  });

  it("홈 · /about/ · /tonight/ · 발행된 날짜 페이지 전부(lastmod = 그 호 generatedAt), /news/ 없음", () => {
    expect(sitemap()).toEqual([
      { url: `${SITE}/`, lastModified: "2026-10-17T00:17:00.000Z" },
      { url: `${SITE}/about/` },
      { url: `${SITE}/tonight/`, lastModified: "2026-10-17T00:17:00.000Z" },
      { url: `${SITE}/korean-players/` },
      { url: `${SITE}/korean-players/weekly/` },
      // 대표팀(M3-13) — lastmod = 최신 호
      {
        url: `${SITE}/national-team/`,
        lastModified: "2026-10-17T00:17:00.000Z",
      },
      // 이적(M4-04) — 늘 생긴다(트래커 파일이 없으면 lastmod 없음)
      { url: `${SITE}/transfers/` },
      ...DATES.map((date) => ({
        url: `${SITE}/news/${date}/`,
        lastModified: issueOf(date).generatedAt,
      })),
    ]);
  });

  it("날짜 페이지 lastmod = 지면 수정 시각(M5-03 — 삭제 요청으로 카드가 빠진 호는 그 반영 시각), 최신 호면 홈 lastmod도", () => {
    issueLastModified.mockImplementation((date) =>
      date === "2026-10-17"
        ? "2026-10-20T03:00:00Z"
        : DATES.includes(date)
          ? issueOf(date).generatedAt
          : null,
    );
    const entries = sitemap();
    expect(entries.find((e) => e.url === `${SITE}/news/2026-10-17/`)).toEqual({
      url: `${SITE}/news/2026-10-17/`,
      lastModified: "2026-10-20T03:00:00Z",
    });
    expect(entries[0]).toEqual({
      url: `${SITE}/`,
      lastModified: "2026-10-20T03:00:00Z",
    });
  });

  it("브리핑 파일이 뉴스 파일보다 늦게 쓰였으면 그 날짜 페이지 lastmod = 브리핑 generatedAt(M5-03)", () => {
    loadBrief.mockImplementation(((date: string) =>
      date === "2026-10-13"
        ? { generatedAt: "2026-10-13T05:00:00Z" }
        : null) as () => { generatedAt: string } | null);
    expect(sitemap().find((e) => e.url === `${SITE}/news/2026-10-13/`)).toEqual(
      {
        url: `${SITE}/news/2026-10-13/`,
        lastModified: "2026-10-13T05:00:00Z",
      },
    );
    loadBrief.mockReset();
    loadBrief.mockReturnValue(null);
  });

  it("대회 데이터가 있으면 /tonight/ 다음에 대회 페이지(lastmod = updatedAt)", () => {
    loadAllCompetitionData.mockReturnValueOnce([
      { comp: "EPL", updatedAt: "2026-10-30T02:17:27.762Z" },
      { comp: "UCL", updatedAt: "2026-10-30T02:19:28.728Z" },
    ]);
    expect(sitemap().slice(2, 5)).toEqual([
      { url: `${SITE}/tonight/`, lastModified: "2026-10-17T00:17:00.000Z" },
      {
        url: `${SITE}/competitions/epl/`,
        lastModified: "2026-10-30T02:17:27.762Z",
      },
      {
        url: `${SITE}/competitions/ucl/`,
        lastModified: "2026-10-30T02:19:28.728Z",
      },
    ]);
  });

  it("발행된 호가 없으면(빈 data/news) 홈·/about/·/tonight/·/korean-players/·/national-team/·/transfers/만", () => {
    listNewsDates.mockReturnValue([]);
    expect(sitemap()).toEqual([
      { url: `${SITE}/` },
      { url: `${SITE}/about/` },
      { url: `${SITE}/tonight/` },
      { url: `${SITE}/korean-players/` },
      { url: `${SITE}/korean-players/weekly/` },
      { url: `${SITE}/national-team/` },
      { url: `${SITE}/transfers/` },
    ]);
  });

  it("이적(M4-04) — lastmod = 트래커 레코드 중 가장 늦은 갱신", () => {
    loadTransfersFile.mockReturnValueOnce([
      { updated: "2026-10-29T07:15:00.000Z" },
      { updated: "2026-10-30T01:00:00.000Z" },
    ]);
    expect(sitemap().find((e) => e.url === `${SITE}/transfers/`)).toEqual({
      url: `${SITE}/transfers/`,
      lastModified: "2026-10-30T01:00:00.000Z",
    });
  });

  it("한국 선수 상세(M3-10) — 목록 바로 뒤에 설정 순서로", () => {
    listKoreanPlayerSlugs.mockReturnValueOnce(["kim-ji-soo", "kim-min-jae"]);
    expect(
      sitemap()
        .map((e) => e.url)
        .filter((u) => u.includes("/korean-players/")),
    ).toEqual([
      `${SITE}/korean-players/`,
      `${SITE}/korean-players/kim-ji-soo/`,
      `${SITE}/korean-players/kim-min-jae/`,
      `${SITE}/korean-players/weekly/`,
    ]);
  });

  it("주간 리포트(M3-12) — 상세 뒤에 색인(lastmod = 최신 주) + 발행된 주", () => {
    listWeeklyWeeks.mockReturnValueOnce(["2026-43", "2026-44"]);
    expect(sitemap().filter((e) => e.url.includes("/weekly/"))).toEqual([
      {
        url: `${SITE}/korean-players/weekly/`,
        lastModified: "2026-11-08T07:00:00.000Z",
      },
      {
        url: `${SITE}/korean-players/weekly/2026-43/`,
        lastModified: "2026-11-01T07:00:00.000Z",
      },
      {
        url: `${SITE}/korean-players/weekly/2026-44/`,
        lastModified: "2026-11-08T07:00:00.000Z",
      },
    ]);
  });

  it("한국 선수 목록 — 팀 다음, lastmod = 현황 파일 generatedAt(M3-09)", () => {
    loadKoreanPlayersData.mockReturnValueOnce({
      generatedAt: "2026-11-01T04:17:30.987Z",
    });
    expect(sitemap().filter((e) => e.url.endsWith("/korean-players/"))).toEqual(
      [
        {
          url: `${SITE}/korean-players/`,
          lastModified: "2026-11-01T04:17:30.987Z",
        },
      ],
    );
  });

  it("팀 파일이 있으면 대회 다음에 팀 페이지(lastmod = 대표 대회 updatedAt, 데이터가 없으면 생략)", () => {
    loadAllCompetitionData.mockReturnValueOnce([
      { comp: "EPL", updatedAt: "2026-10-30T02:17:27.762Z" },
    ]);
    listTeamSlugs.mockReturnValueOnce(["arsenal", "club-brugge"]);
    loadTeam.mockImplementation((slug: string) => ({
      slug,
      comp: slug === "arsenal" ? "EPL" : "UCL",
    }));
    const teams = sitemap().filter((e) => e.url.includes("/teams/"));
    expect(teams).toEqual([
      {
        url: `${SITE}/teams/arsenal/`,
        lastModified: "2026-10-30T02:17:27.762Z",
      },
      { url: `${SITE}/teams/club-brugge/` },
    ]);
  });
});
