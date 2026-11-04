/**
 * Lighthouse 결과 요약 — lhr(JSON) 묶음 → 페이지별 중앙값·범위 표, Step Summary 마크다운, 단언 결과 요약 (M5-07 · M5-08, NFR-01).
 * I/O 없는 순수 함수만 둔다. 파일 읽기·lhci 실행은 scripts/lighthouse.ts.
 */

/** lhr에서 쓰는 부분만 */
export interface Lhr {
  requestedUrl: string;
  finalUrl?: string;
  categories: Record<string, { score: number | null } | undefined>;
  audits: Record<string, { numericValue?: number } | undefined>;
  environment?: { benchmarkIndex?: number };
}

export interface Range {
  median: number;
  min: number;
  max: number;
}

export interface LighthouseRow {
  path: string;
  runs: number;
  performance: Range;
  accessibility: number;
  bestPractices: number;
  seo: number;
  fcpMs: number;
  lcpMs: Range;
  tbtMs: Range;
  cls: number;
  siMs: number;
  benchmarkIndex: Range;
}

export function median(values: readonly number[]): number {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return Number.NaN;
  const s = [...finite].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function range(values: readonly number[]): Range {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0)
    return { median: Number.NaN, min: Number.NaN, max: Number.NaN };
  return {
    median: median(finite),
    min: Math.min(...finite),
    max: Math.max(...finite),
  };
}

const score = (l: Lhr, id: string): number => {
  const v = l.categories[id]?.score;
  return typeof v === "number" ? Math.round(v * 100) : Number.NaN;
};
const num = (l: Lhr, id: string): number =>
  l.audits[id]?.numericValue ?? Number.NaN;

/** URL → basePath 뒤 경로(`/`·`/news/`) */
export function pathOf(url: string, basePath: string): string {
  const pathname = new URL(url).pathname;
  const rest = pathname.startsWith(basePath)
    ? pathname.slice(basePath.length)
    : pathname;
  return rest || "/";
}

/**
 * lhr 묶음 → 페이지별 행. 순서는 `order`(측정 요청 경로 순 — basePath 뒤 경로, 앞 `/` 없이)를 따르고, 없는 경로는 뒤에 이름순.
 */
export function summarizeLhrs(
  lhrs: readonly Lhr[],
  basePath: string,
  order: readonly string[] = [],
): LighthouseRow[] {
  const byPath = new Map<string, Lhr[]>();
  for (const lhr of lhrs) {
    const key = pathOf(lhr.requestedUrl, basePath);
    const list = byPath.get(key) ?? [];
    list.push(lhr);
    byPath.set(key, list);
  }
  const rank = (p: string): number => {
    const i = order.findIndex((o) => `/${o.replace(/^\//, "")}` === p);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...byPath.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([p, list]) => ({
      path: p,
      runs: list.length,
      performance: range(list.map((l) => score(l, "performance"))),
      accessibility: median(list.map((l) => score(l, "accessibility"))),
      bestPractices: median(list.map((l) => score(l, "best-practices"))),
      seo: median(list.map((l) => score(l, "seo"))),
      fcpMs: median(list.map((l) => num(l, "first-contentful-paint"))),
      lcpMs: range(list.map((l) => num(l, "largest-contentful-paint"))),
      tbtMs: range(list.map((l) => num(l, "total-blocking-time"))),
      cls: median(list.map((l) => num(l, "cumulative-layout-shift"))),
      siMs: median(list.map((l) => num(l, "speed-index"))),
      benchmarkIndex: range(
        list.map((l) => l.environment?.benchmarkIndex ?? Number.NaN),
      ),
    }));
}

const sec = (ms: number): string =>
  Number.isFinite(ms) ? `${(ms / 1000).toFixed(2)}s` : "—";
const ms = (v: number): string =>
  Number.isFinite(v) ? `${Math.round(v)}ms` : "—";
const int = (v: number): string =>
  Number.isFinite(v) ? String(Math.round(v)) : "—";
const span = (r: Range, f: (v: number) => string): string =>
  r.min === r.max ? f(r.median) : `${f(r.median)} (${f(r.min)}~${f(r.max)})`;

/** 로컬 출력용 표 — 중앙값(M5-07 문서 표와 같은 열) */
export function formatTable(rows: readonly LighthouseRow[]): string {
  const head =
    "| 페이지 | 성능 | 접근성 | 모범 사례 | SEO | FCP | LCP | TBT | CLS | SI | benchmarkIndex |\n|---|---|---|---|---|---|---|---|---|---|---|";
  const body = rows.map(
    (r) =>
      `| \`${r.path}\` | ${int(r.performance.median)} | ${int(r.accessibility)} | ${int(r.bestPractices)} | ${int(r.seo)} | ${sec(r.fcpMs)} | ${sec(r.lcpMs.median)} | ${ms(r.tbtMs.median)} | ${Number.isFinite(r.cls) ? r.cls.toFixed(4) : "—"} | ${sec(r.siMs)} | ${int(r.benchmarkIndex.median)} |`,
  );
  return [head, ...body].join("\n");
}

/** lhci assert가 남기는 assertion-results.json 한 줄(통과하지 못한 것만 들어 있다) */
export interface AssertionResult {
  url: string;
  level: "error" | "warn" | "off";
  passed: boolean;
  auditId: string;
  auditProperty?: string;
  name: string;
  operator: string;
  expected: number;
  actual: number;
}

export interface AssertionSummary {
  errors: AssertionResult[];
  warnings: AssertionResult[];
}

export function summarizeAssertions(
  results: readonly AssertionResult[],
): AssertionSummary {
  const failed = results.filter((r) => !r.passed);
  return {
    errors: failed.filter((r) => r.level === "error"),
    warnings: failed.filter((r) => r.level === "warn"),
  };
}

export interface StepSummaryInput {
  rows: readonly LighthouseRow[];
  method: string;
  runs: number;
  basePath: string;
  /** 단언을 돌리지 않았으면 null */
  assertions: AssertionSummary | null;
}

function formatAssertion(r: AssertionResult, basePath: string): string {
  const id = r.auditProperty ? `${r.auditId}.${r.auditProperty}` : r.auditId;
  const actual = Number.isFinite(r.actual)
    ? Number(r.actual.toFixed(4))
    : r.actual;
  return `\`${pathOf(r.url, basePath)}\` ${id} — ${actual} (기준 ${r.operator} ${r.expected})`;
}

/**
 * GitHub Actions Step Summary 마크다운 — 쪽 × 성능 · LCP · TBT · CLS · 접근성 · SEO + benchmarkIndex(중앙값, 실행 간 범위).
 * 단언 결과가 있으면 error(작업 실패) · warn(기록만) 목록을 붙인다.
 */
export function formatStepSummary(input: StepSummaryInput): string {
  const { rows, method, runs, basePath, assertions } = input;
  const lines = [
    `## Lighthouse 모바일 (${method} · 쪽마다 ${runs}회 · 중앙값, 괄호는 실행 간 최소~최대)`,
    "",
    "| 페이지 | 성능 | LCP | TBT | CLS | 접근성 | SEO | benchmarkIndex |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| \`${r.path}\` | ${span(r.performance, int)} | ${span(r.lcpMs, sec)} | ${span(r.tbtMs, ms)} | ${Number.isFinite(r.cls) ? r.cls.toFixed(4) : "—"} | ${int(r.accessibility)} | ${int(r.seo)} | ${span(r.benchmarkIndex, int)} |`,
    ),
    "",
    "단언(`lighthouserc.json`): **error** LCP ≤ 2000ms · CLS ≤ 0.05 · 접근성 ≥ 90 · SEO ≥ 90(`/status/`·`/search/` noindex 제외) / **warn** 성능 ≥ 95(NFR-01 판정 방식 결정 전 — 기록만).",
  ];
  if (assertions) {
    lines.push("");
    if (assertions.errors.length === 0) lines.push("**error 단언: 통과**");
    else {
      lines.push(`**error 단언 실패 ${assertions.errors.length}건**`);
      lines.push(
        ...assertions.errors.map(
          (r) => `- error: ${formatAssertion(r, basePath)}`,
        ),
      );
    }
    if (assertions.warnings.length > 0) {
      lines.push("");
      lines.push(`warn ${assertions.warnings.length}건(배포 영향 없음)`);
      lines.push(
        ...assertions.warnings.map(
          (r) => `- warn: ${formatAssertion(r, basePath)}`,
        ),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
