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

import {
  NEWS_DIR,
  TAKEDOWNS_FILE,
  listNewsDates,
  loadLatestNews,
  loadTakedownIds,
  withoutTakedowns,
} from "@/lib/data/news";

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

describe("삭제 요청 카드 빌드 제외 (M1-25, FR-143)", () => {
  /** 임시 takedowns.json을 쓰고 경로를 돌려준다 */
  function writeTakedowns(entries: unknown): string {
    const file = path.join(dir, "takedowns.json");
    writeFileSync(file, JSON.stringify(entries));
    return file;
  }
  const takedown = (id: string) => ({
    id,
    requestedAt: "2026-10-10T03:00:00Z",
    handledAt: null,
    reason: "저작권자 삭제 요청 (#12)",
  });

  it("기본 등록 파일은 저장소 configs/takedowns.json이다", () => {
    expect(TAKEDOWNS_FILE).toBe(path.resolve("configs/takedowns.json"));
    expect(loadTakedownIds()).toBeInstanceOf(Set);
  });

  it("등록된 카드 ID(저장된 card.id — 등록만으로, handledAt 무관)를 최신 호에서 빼고 순서는 유지한다", () => {
    const takedownsFile = writeTakedowns([takedown("c_0a1b2c3d4e")]);

    const news = loadLatestNews(FIXTURE_DIR, { takedownsFile });

    expect(news?.cards.map((card) => card.id)).toEqual([
      "c_8f3a1b2c4d",
      "c_5f6e7d8c9b",
    ]);
    expect(news?.date).toBe("2026-10-10");
  });

  it("최신 호의 카드가 모두 삭제 요청이면 카드 0장의 호(전날 호로 넘어가지 않음)", () => {
    writeIssue(dir, "2026-10-09");
    writeIssue(dir, "2026-10-10");
    const takedownsFile = writeTakedowns(
      ["c_8f3a1b2c4d", "c_0a1b2c3d4e", "c_5f6e7d8c9b"].map(takedown),
    );

    const news = loadLatestNews(dir, { takedownsFile });

    expect(news?.date).toBe("2026-10-10");
    expect(news?.cards).toEqual([]);
  });

  it("등록 파일이 없거나 깨졌으면 던진다(빌드 실패 — 삭제 요청을 뺐다고 보장할 수 없음)", () => {
    writeIssue(dir, "2026-10-10");

    expect(() =>
      loadLatestNews(dir, { takedownsFile: path.join(dir, "missing.json") }),
    ).toThrow(/삭제 요청 등록 파일을 읽을 수 없음/);
    expect(() =>
      loadLatestNews(dir, {
        takedownsFile: writeTakedowns([{ id: "bad", reason: "x" }]),
      }),
    ).toThrow(/삭제 요청 등록 파일 스키마 검증 실패/);
  });

  it("뉴스 파일이 없으면 등록 파일을 읽지 않는다(빈 data/news의 CI 빌드)", () => {
    expect(
      loadLatestNews(dir, { takedownsFile: path.join(dir, "missing.json") }),
    ).toBeNull();
  });

  it("withoutTakedowns — 뺄 카드가 없으면 같은 객체, 있으면 새 객체(원본 불변)", () => {
    const news = loadLatestNews(FIXTURE_DIR)!;
    expect(withoutTakedowns(news, new Set(["c_9999999999"]))).toBe(news);
    const filtered = withoutTakedowns(news, new Set(["c_8f3a1b2c4d"]));
    expect(filtered).not.toBe(news);
    expect(filtered.cards).toHaveLength(2);
    expect(news.cards).toHaveLength(3);
  });
});
