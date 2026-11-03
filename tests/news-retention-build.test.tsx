// 월별 병합 전후 날짜 페이지 HTML 대조 (M5-10, PRD FR-158·FR-34 — 카드 공유 URL `/news/{date}/#c_…`이 영구 주소)
//
// 저장소 실데이터 data/news를 임시 폴더 두 곳에 복사하고 한쪽만 월별 병합(먼 미래 기준 — 모든 달)한 뒤, 뉴스 로더가 그 폴더를 보게 해
// 날짜 아카이브 페이지(`/news/[date]/`)의 generateStaticParams와 렌더 HTML(카드 ID 앵커 포함)이 같은지 본다. 나머지 로더(브리핑·runs·
// 표기 사전)는 실데이터 그대로라 두 렌더에서 같다.
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createLogger } from "../scripts/lib/logger";
import { runRetentionMergeStage } from "../scripts/lib/retention-merge-stage";

const state = vi.hoisted(() => ({ dir: "" }));
vi.mock("@/lib/data/news", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/news")>();
  return {
    ...actual,
    listNewsDates: () => actual.listNewsDates(state.dir),
    loadNewsIssue: (date: string) => actual.loadNewsIssue(date, state.dir),
    loadLatestNews: () => actual.loadLatestNews(state.dir),
    loadRetainedCards: () => actual.loadRetainedCards(state.dir),
  };
});

const { default: NewsArchivePage, generateStaticParams } =
  await import("@/app/news/[date]/page");

let root: string;
let before: string;
let after: string;

beforeAll(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), "euro-digest-merge-build-"));
  before = path.join(root, "before", "news");
  after = path.join(root, "after", "news");
  cpSync(path.resolve("data/news"), before, { recursive: true });
  cpSync(path.resolve("data/news"), after, { recursive: true });
  const outcome = await runRetentionMergeStage(
    {
      dataDir: path.dirname(after),
      env: "dev",
      dry: false,
      now: () => new Date("2099-12-31T21:31:00.000Z"),
      logger: createLogger({ scope: "test", format: "json", sink: () => {} }),
      print: () => {},
    },
    { startedAt: "2099-12-31T21:30:00.000Z" },
  );
  expect(outcome.errors).toEqual([]);
  expect(outcome.merged.length).toBeGreaterThan(0);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

async function renderDate(dir: string, date: string) {
  state.dir = dir;
  const { container } = render(
    await NewsArchivePage({
      params: Promise.resolve({ date }),
      searchParams: Promise.resolve({}),
    }),
  );
  const html = container.innerHTML;
  const ids = [...container.querySelectorAll("[id^='c_']")].map((el) => el.id);
  cleanup();
  return { html, ids };
}

describe("월별 병합 전후 — 날짜 아카이브 페이지 (M5-10)", () => {
  it("generateStaticParams가 같은 날짜를 낸다", async () => {
    state.dir = before;
    const a = await generateStaticParams();
    state.dir = after;
    const b = await generateStaticParams();
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });

  it("첫 호 · 달 말일 · 다음 달 첫 호 · 최신 호의 HTML과 카드 앵커 ID가 같다", async () => {
    state.dir = before;
    const dates = (await generateStaticParams()).map((p) => p.date);
    const picks = [
      ...new Set(
        [
          dates[0],
          dates.filter((d) => d.startsWith("2026-10")).at(-1),
          dates.find((d) => d.startsWith("2026-11")),
          dates.at(-1),
        ].filter((d): d is string => d !== undefined),
      ),
    ];
    expect(picks.length).toBeGreaterThanOrEqual(2);
    for (const date of picks) {
      const a = await renderDate(before, date);
      const b = await renderDate(after, date);
      expect(a.ids.length).toBeGreaterThan(0);
      expect(b.ids).toEqual(a.ids);
      expect(b.html).toBe(a.html);
    }
  }, 60_000);
});
