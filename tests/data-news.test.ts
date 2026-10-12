// src/lib/data/news.ts — 일별 뉴스 로더 (M1-01, CLAUDE.md §5·§8)
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NEWS_DIR, listNewsDates, loadLatestNews } from "@/lib/data/news";

const FIXTURE_DIR = path.resolve("fixtures/schema/data/news");
const FIXTURE_FILE = path.join(FIXTURE_DIR, "2026-10-10.json");

/** 픽스처 파일을 date만 바꿔 다른 날짜 파일로 쓴다 */
function writeIssue(dir: string, date: string, patch: object = {}): void {
  const base = JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as object;
  writeFileSync(
    path.join(dir, `${date}.json`),
    JSON.stringify({ ...base, date, ...patch }),
  );
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "euro-digest-news-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadLatestNews", () => {
  it("기본 위치는 저장소 data/news다", () => {
    expect(NEWS_DIR).toBe(path.resolve("data/news"));
  });

  it("픽스처 디렉터리의 일별 파일을 스키마로 검증해 돌려준다", () => {
    const news = loadLatestNews(FIXTURE_DIR);

    expect(news?.date).toBe("2026-10-10");
    expect(news?.cards.map((card) => card.id)).toEqual([
      "c_8f3a1b2c4d",
      "c_0a1b2c3d4e",
      "c_5f6e7d8c9b",
    ]);
  });

  it("빈 디렉터리(.gitkeep만)·없는 디렉터리는 null — CI 빌드는 빈 상태로 통과한다", () => {
    writeFileSync(path.join(dir, ".gitkeep"), "");

    expect(loadLatestNews(dir)).toBeNull();
    expect(loadLatestNews(path.join(dir, "missing"))).toBeNull();
  });

  it("가장 늦은 날짜 파일을 고른다 — 월별 병합 파일·다른 이름·하위 폴더는 무시", () => {
    writeIssue(dir, "2026-09-30");
    writeIssue(dir, "2026-10-11");
    writeIssue(dir, "2026-10-09");
    writeFileSync(path.join(dir, "2026-12.json"), "{}");
    writeFileSync(path.join(dir, "notes.json"), "{}");
    mkdirSync(path.join(dir, "2099-01-01.json"));

    expect(listNewsDates(dir)).toEqual([
      "2026-09-30",
      "2026-10-09",
      "2026-10-11",
    ]);
    expect(loadLatestNews(dir)?.date).toBe("2026-10-11");
  });

  it("최신 파일이 스키마 검증에 실패하면 전날 파일로 넘어가지 않고 던진다(빌드 실패)", () => {
    writeIssue(dir, "2026-10-09");
    writeIssue(dir, "2026-10-10", { cards: [{ id: "bad" }] });

    expect(() => loadLatestNews(dir)).toThrow(
      /2026-10-10\.json: 뉴스 파일 스키마 검증 실패/,
    );
  });

  it("JSON이 깨졌으면 던진다", () => {
    writeFileSync(path.join(dir, "2026-10-10.json"), "{ not json");

    expect(() => loadLatestNews(dir)).toThrow(/JSON을 읽을 수 없음/);
  });

  it("내용의 date가 파일명과 다르면 던진다", () => {
    copyFileSync(FIXTURE_FILE, path.join(dir, "2026-10-11.json"));

    expect(() => loadLatestNews(dir)).toThrow(
      /date\(2026-10-10\)가 파일명\(2026-10-11\)과 다름/,
    );
  });
});
