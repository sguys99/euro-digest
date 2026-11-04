import { describe, expect, it } from "vitest";

import {
  formatStepSummary,
  formatTable,
  median,
  pathOf,
  range,
  summarizeAssertions,
  summarizeLhrs,
  type AssertionResult,
  type Lhr,
} from "../scripts/lib/lighthouse-report";

const BASE = "/euro-digest";
const lhr = (
  p: string,
  perf: number,
  tbt: number,
  bench: number,
  extra: Partial<{ lcp: number; seo: number }> = {},
): Lhr => ({
  requestedUrl: `http://localhost:4321${BASE}${p}`,
  categories: {
    performance: { score: perf },
    accessibility: { score: 1 },
    "best-practices": { score: 1 },
    seo: { score: extra.seo ?? 1 },
  },
  audits: {
    "first-contentful-paint": { numericValue: 1500 },
    "largest-contentful-paint": { numericValue: extra.lcp ?? 1800 },
    "total-blocking-time": { numericValue: tbt },
    "cumulative-layout-shift": { numericValue: 0.01 },
    "speed-index": { numericValue: 1700 },
  },
  environment: { benchmarkIndex: bench },
});

describe("median · range", () => {
  it("홀수 · 짝수 · NaN 무시", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([Number.NaN, 5])).toBe(5);
    expect(median([])).toBeNaN();
    expect(range([300, 100, 200])).toEqual({ median: 200, min: 100, max: 300 });
  });
});

describe("pathOf", () => {
  it("basePath 뒤 경로, 루트는 /", () => {
    expect(pathOf(`http://localhost:1${BASE}/news/`, BASE)).toBe("/news/");
    expect(pathOf(`http://localhost:1${BASE}`, BASE)).toBe("/");
    expect(pathOf("http://localhost:1/status/", "")).toBe("/status/");
  });
});

describe("summarizeLhrs", () => {
  const lhrs = [
    lhr("/tonight/", 0.75, 1200, 1500),
    lhr("/", 0.7, 3000, 1600),
    lhr("/", 0.68, 3600, 1400),
    lhr("/", 0.72, 2400, 1800),
    lhr("/tonight/", 0.77, 900, 1700),
    lhr("/tonight/", 0.74, 1500, 1600),
  ];

  it("쪽마다 중앙값 · 실행 간 범위(성능 · LCP · TBT · benchmarkIndex), 요청 순서대로", () => {
    const rows = summarizeLhrs(lhrs, BASE, ["", "tonight/"]);
    expect(rows.map((r) => r.path)).toEqual(["/", "/tonight/"]);
    expect(rows[0]).toMatchObject({
      runs: 3,
      performance: { median: 70, min: 68, max: 72 },
      tbtMs: { median: 3000, min: 2400, max: 3600 },
      benchmarkIndex: { median: 1600, min: 1400, max: 1800 },
      accessibility: 100,
      seo: 100,
      cls: 0.01,
    });
    expect(rows[1]?.performance).toEqual({ median: 75, min: 74, max: 77 });
  });

  it("순서 목록에 없는 쪽은 뒤에 이름순", () => {
    const rows = summarizeLhrs(
      [lhr("/b/", 1, 0, 1), lhr("/a/", 1, 0, 1), lhr("/", 1, 0, 1)],
      BASE,
      [""],
    );
    expect(rows.map((r) => r.path)).toEqual(["/", "/a/", "/b/"]);
  });

  it("로컬 표는 중앙값 열 + benchmarkIndex", () => {
    const table = formatTable(summarizeLhrs(lhrs, BASE, ["", "tonight/"]));
    expect(table.split("\n")[0]).toContain("benchmarkIndex");
    expect(table).toContain(
      "| `/` | 70 | 100 | 100 | 100 | 1.50s | 1.80s | 3000ms | 0.0100 | 1.70s | 1600 |",
    );
  });
});

describe("summarizeAssertions · formatStepSummary", () => {
  const results: AssertionResult[] = [
    {
      url: `http://localhost:1${BASE}/`,
      level: "warn",
      passed: false,
      auditId: "categories",
      auditProperty: "performance",
      name: "minScore",
      operator: ">=",
      expected: 0.95,
      actual: 0.7,
    },
    {
      url: `http://localhost:1${BASE}/teams/x/`,
      level: "error",
      passed: false,
      auditId: "largest-contentful-paint",
      name: "maxNumericValue",
      operator: "<=",
      expected: 2000,
      actual: 2450.123456,
    },
  ];

  it("error · warn을 나눈다(통과한 것은 뺀다)", () => {
    const s = summarizeAssertions([
      ...results,
      { ...results[0]!, passed: true, level: "error" },
    ]);
    expect(s.errors.map((r) => r.auditId)).toEqual([
      "largest-contentful-paint",
    ]);
    expect(s.warnings.map((r) => r.auditProperty)).toEqual(["performance"]);
  });

  it("Step Summary — 쪽 × 성능 · LCP · TBT · CLS · 접근성 · SEO · benchmarkIndex(범위), 단언 목록", () => {
    const md = formatStepSummary({
      rows: summarizeLhrs(
        [lhr("/", 0.7, 3000, 1600), lhr("/", 0.72, 2400, 1800)],
        BASE,
      ),
      method: "devtools",
      runs: 2,
      basePath: BASE,
      assertions: summarizeAssertions(results),
    });
    expect(md).toContain("## Lighthouse 모바일 (devtools · 쪽마다 2회");
    expect(md).toContain(
      "| 페이지 | 성능 | LCP | TBT | CLS | 접근성 | SEO | benchmarkIndex |",
    );
    expect(md).toContain(
      "| `/` | 71 (70~72) | 1.80s | 2700ms (2400ms~3000ms) | 0.0100 | 100 | 100 | 1700 (1600~1800) |",
    );
    expect(md).toContain("**error 단언 실패 1건**");
    expect(md).toContain(
      "- error: `/teams/x/` largest-contentful-paint — 2450.1235 (기준 <= 2000)",
    );
    expect(md).toContain("warn 1건(배포 영향 없음)");
    expect(md).toContain(
      "- warn: `/` categories.performance — 0.7 (기준 >= 0.95)",
    );
  });

  it("단언 없이 돌렸으면 단언 줄이 없고, 모두 통과면 '통과'", () => {
    const base = {
      rows: [],
      method: "simulate",
      runs: 3,
      basePath: BASE,
    };
    expect(formatStepSummary({ ...base, assertions: null })).not.toContain(
      "error 단언",
    );
    expect(
      formatStepSummary({
        ...base,
        assertions: { errors: [], warnings: [] },
      }),
    ).toContain("**error 단언: 통과**");
  });
});
