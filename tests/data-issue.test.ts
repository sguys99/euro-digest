/**
 * 호 로더 — src/lib/data/issue.ts (M1-30): 뉴스 로더 + 실행 기록 → { news, issue }. 파일 읽기는 각 로더 테스트가 본다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listIssueDates,
  loadArchiveView,
  loadIssue,
  loadLatestIssue,
} from "@/lib/data/issue";
import type { NewsFile } from "@/lib/schema/news";
import type { RunLog } from "@/lib/schema/run";

const { listNewsDates, loadLatestNews, loadNewsIssue, loadProdRuns } =
  vi.hoisted(() => ({
    listNewsDates: vi.fn<() => string[]>(),
    loadLatestNews: vi.fn<() => NewsFile | null>(),
    loadNewsIssue: vi.fn<(date: string) => NewsFile | null>(),
    loadProdRuns: vi.fn<() => RunLog[]>(),
  }));
vi.mock("@/lib/data/news", () => ({
  listNewsDates,
  loadLatestNews,
  loadNewsIssue,
}));
vi.mock("@/lib/data/runs", () => ({ loadProdRuns }));

const NEWS: NewsFile = {
  date: "2026-10-17",
  generatedAt: "2026-10-17T12:57:47.412Z",
  runId: "collect-prod-20261017T125647Z-8161",
  cards: [],
};

beforeEach(() => {
  loadLatestNews.mockReset();
  loadNewsIssue.mockReset();
  loadProdRuns.mockReset();
  loadProdRuns.mockReturnValue([]);
});

describe("loadLatestIssue · loadIssue", () => {
  it("최신 호와 호 정보(제 N호·발행·업데이트)를 함께 돌려준다", () => {
    loadLatestNews.mockReturnValue(NEWS);
    expect(loadLatestIssue()).toEqual({
      news: NEWS,
      issue: {
        date: "2026-10-17",
        no: 6,
        publishedAt: NEWS.generatedAt,
        updatedAt: NEWS.generatedAt,
      },
    });
    expect(loadProdRuns).toHaveBeenCalledTimes(1);
  });

  it("발행된 호가 없으면 둘 다 null이고 실행 기록을 읽지 않는다", () => {
    loadLatestNews.mockReturnValue(null);
    expect(loadLatestIssue()).toEqual({ news: null, issue: null });
    expect(loadProdRuns).not.toHaveBeenCalled();
  });

  it("날짜 하나의 호(M1-34 아카이브) — 그 날짜 로더를 쓴다", () => {
    loadNewsIssue.mockReturnValue(NEWS);
    expect(loadIssue("2026-10-17").issue?.no).toBe(6);
    expect(loadNewsIssue).toHaveBeenCalledWith("2026-10-17");
    loadNewsIssue.mockReturnValue(null);
    expect(loadIssue("2026-10-15")).toEqual({ news: null, issue: null });
  });
});

describe("listIssueDates · loadArchiveView (M1-34)", () => {
  it("발행일 목록은 뉴스 로더의 파일 목록 그대로, 아카이브 모델은 그 목록으로 만든다(결호 건너뜀)", () => {
    listNewsDates.mockReturnValue(["2026-10-14", "2026-10-17", "2026-10-18"]);
    expect(listIssueDates()).toEqual([
      "2026-10-14",
      "2026-10-17",
      "2026-10-18",
    ]);
    const view = loadArchiveView("2026-10-17");
    expect(view?.prev).toEqual({ date: "2026-10-14", no: 3 });
    expect(view?.next).toEqual({ date: "2026-10-18", no: 7 });
    expect(loadArchiveView("2026-10-15")).toBeNull();
    // 파일 내용은 읽지 않는다(목록만)
    expect(loadNewsIssue).not.toHaveBeenCalled();
  });
});
