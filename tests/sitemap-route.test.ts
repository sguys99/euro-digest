import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import sitemap, { dynamic } from "@/app/sitemap";
import { NewsFileSchema, type NewsFile } from "@/lib/schema/news";
import type { RunLog } from "@/lib/schema/run";

// `src/app/sitemap.ts` 라우트(M1-38, FR-124) — 로더(발행일 목록·그 호 파일)를 바꿔 끼워 항목을 본다.
// 항목 규칙 자체는 tests/seo.test.ts, 빌드 결과 out/sitemap.xml은 e2e tests/e2e/seo.spec.ts.
const { listNewsDates, loadNewsIssue, loadLatestNews, loadProdRuns } =
  vi.hoisted(() => ({
    listNewsDates: vi.fn<() => string[]>(),
    loadNewsIssue: vi.fn<(date: string) => NewsFile | null>(),
    loadLatestNews: vi.fn<() => NewsFile | null>(() => null),
    loadProdRuns: vi.fn<() => RunLog[]>(() => []),
  }));
vi.mock("@/lib/data/news", () => ({
  listNewsDates,
  loadNewsIssue,
  loadLatestNews,
}));
vi.mock("@/lib/data/runs", () => ({ loadProdRuns }));

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
});

describe("sitemap 라우트", () => {
  it("정적 export용 force-static", () => {
    expect(dynamic).toBe("force-static");
  });

  it("홈 · /about/ · 발행된 날짜 페이지 전부(lastmod = 그 호 generatedAt), /news/ 없음", () => {
    expect(sitemap()).toEqual([
      { url: `${SITE}/`, lastModified: "2026-10-17T00:17:00.000Z" },
      { url: `${SITE}/about/` },
      ...DATES.map((date) => ({
        url: `${SITE}/news/${date}/`,
        lastModified: issueOf(date).generatedAt,
      })),
    ]);
  });

  it("발행된 호가 없으면(빈 data/news) 홈·/about/만", () => {
    listNewsDates.mockReturnValue([]);
    expect(sitemap()).toEqual([{ url: `${SITE}/` }, { url: `${SITE}/about/` }]);
  });
});
