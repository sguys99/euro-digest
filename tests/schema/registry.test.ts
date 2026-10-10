import { describe, expect, it } from "vitest";

import {
  KoreanPlayersDataFileSchema,
  NewsFileSchema,
  RunsDevFileSchema,
  RunsFileSchema,
  SourcesFileSchema,
  WeeklyReportSchema,
  baseNameOf,
  findSchemaEntry,
  globToRegExp,
  normalizeRelPath,
  schemaRegistry,
} from "@/lib/schema";

import { expectValid, listFixtures, loadFixture } from "./helpers";

const fixtures = listFixtures();

/** 검사용으로 모르는 키 `__unknown`을 끼워 넣는다(배열 → 첫 항목, 키 맵 → 첫 값, 객체 → 최상위). */
function injectUnknownKey(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    const [first, ...rest] = raw as unknown[];
    return [injectUnknownKey(first), ...rest];
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const isKeyMap = Object.values(obj).every(
      (v) => v !== null && typeof v === "object" && !Array.isArray(v),
    );
    if (isKeyMap) {
      const [key] = Object.keys(obj);
      if (key === undefined) return obj;
      return { ...obj, [key]: { ...(obj[key] as object), __unknown: 1 } };
    }
    return { ...obj, __unknown: 1 };
  }
  return raw;
}

describe("schemaRegistry ↔ fixtures/schema", () => {
  it("fixture가 있다", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(schemaRegistry.length);
  });

  it.each(fixtures)("%s → 항목 정확히 1개에 매칭되고 통과한다", (relPath) => {
    const matches = schemaRegistry.filter((e) =>
      globToRegExp(e.pattern).test(relPath),
    );
    expect(matches.map((e) => e.pattern)).toHaveLength(1);

    const entry = findSchemaEntry(relPath);
    if (!entry) throw new Error("매칭 없음");
    const parsed = expectValid(entry.schema, loadFixture(relPath));
    if (entry.expectedBaseName) {
      expect(entry.expectedBaseName(parsed)).toBe(baseNameOf(relPath));
    }
  });

  it("모든 레지스트리 항목에 유효 예시 fixture가 1개 이상 있다", () => {
    const uncovered = schemaRegistry
      .filter((e) => !fixtures.some((f) => globToRegExp(e.pattern).test(f)))
      .map((e) => e.pattern);
    expect(uncovered).toEqual([]);
  });

  it("v0.1은 2026-10-10 사용자 확인으로 모든 항목이 confirmed다 (초안 없음)", () => {
    const drafts = schemaRegistry
      .filter((e) => e.status === "draft")
      .map((e) => e.pattern);
    expect(drafts).toEqual([]);
    expect(schemaRegistry).toHaveLength(22);
  });

  it("configs/ 항목은 알 수 없는 키를 거부하고 data/ 항목은 버린다 (결정 Q5)", () => {
    for (const e of schemaRegistry) {
      const relPath = fixtures.find((f) => globToRegExp(e.pattern).test(f));
      if (!relPath) throw new Error(`fixture 없음: ${e.pattern}`);
      const raw = loadFixture(relPath);
      // 키 맵 파일(formations·team-colors)은 키 자체가 데이터라 첫 값 객체에 넣는다.
      const withExtra = injectUnknownKey(raw);
      const ok = e.schema.safeParse(withExtra).success;
      expect([e.pattern, ok]).toEqual([e.pattern, e.kind === "data"]);
    }
  });

  it("와일드카드 패턴에는 파일명 검사(expectedBaseName)가 있다", () => {
    for (const e of schemaRegistry) {
      const wild = /[*?]/.test(e.pattern);
      expect([e.pattern, Boolean(e.expectedBaseName)]).toEqual([
        e.pattern,
        wild,
      ]);
    }
  });
});

describe("findSchemaEntry — 경로 매칭", () => {
  it.each([
    ["configs/sources.json", SourcesFileSchema],
    ["./configs/sources.json", SourcesFileSchema],
    ["configs\\sources.json", SourcesFileSchema],
    ["data/news/2026-10-10.json", NewsFileSchema],
    ["data/players/korean.json", KoreanPlayersDataFileSchema],
    ["data/players/weekly/2026-53.json", WeeklyReportSchema],
    ["data/runs.json", RunsFileSchema],
    ["data/runs-dev.json", RunsDevFileSchema],
  ])("%s", (relPath, schema) => {
    expect(findSchemaEntry(relPath)?.schema).toBe(schema);
  });

  it.each([
    "data/news/2026-10.json", // 월별 병합 형식은 아직 미정(FR-158) — 등록 전에는 매칭하지 않는다
    "data/news/archive/2026-10-10.json", // `*`·`?`는 / 를 넘지 않는다
    "data/news/2026-10-10.json.bak",
    "configs/prompts/summarize.md",
    "configs/sourcesXjson", // `.`은 글자 그대로
    "src/configs/sources.json",
  ])("매칭 없음: %s", (relPath) => {
    expect(findSchemaEntry(relPath)).toBeUndefined();
  });

  it("파일명과 내용이 다르면 expectedBaseName으로 잡아낸다", () => {
    const relPath = "data/news/2026-10-11.json";
    const entry = findSchemaEntry(relPath);
    const parsed = expectValid(
      NewsFileSchema,
      loadFixture("data/news/2026-10-10.json"),
    );
    expect(entry?.expectedBaseName?.(parsed)).toBe("2026-10-10");
    expect(baseNameOf(relPath)).toBe("2026-10-11");
  });

  it("경로 정규화·파일명 추출", () => {
    expect(normalizeRelPath("././data\\teams\\a.json")).toBe(
      "data/teams/a.json",
    );
    expect(baseNameOf("data/teams/sample-united.json")).toBe("sample-united");
    expect(baseNameOf("names.ko.json")).toBe("names.ko");
  });
});
