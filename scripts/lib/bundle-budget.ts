/**
 * 초기 JS 예산 판정·보고 문구·인자 파싱 — I/O 없는 순수 함수 (M0-12).
 * 파일을 읽고 gzip 크기를 재는 일은 scripts/lib/bundle-check.ts, 출력·종료는 scripts/check-bundle.ts가 맡는다.
 *
 * 예산: 페이지별 초기 JS ≤ 160KB(gzip) — PRD DR-11, §15 D21. 1KB = 1024B.
 */
import { parseArgs } from "node:util";

import { DEFAULT_BASE_PATH } from "@/lib/paths";

import type { ParseResult } from "./cli-args";

export const BYTES_PER_KB = 1024;
export const DEFAULT_BUDGET_KB = 160;

/** 출력에 함께 남기는 측정 방식 설명 */
export const MEASUREMENT_NOTE =
  "페이지별 <script src> 중 noModule 제외·같은 src 중복 제거 → 파일마다 gzip 크기(Node zlib.gzipSync 기본 옵션, 레벨 6) 합. 인라인 <script>(RSC 페이로드 등)는 합산하지 않음";

export interface ScriptSize {
  /** basePath를 뺀 사이트 안 경로(예: `/_next/static/chunks/x.js`) */
  sitePath: string;
  rawBytes: number;
  gzipBytes: number;
}

export interface PageScripts {
  /** out/ 기준 HTML 파일 경로(예: `index.html`) */
  page: string;
  scripts: ScriptSize[];
  /** 내부 경로인데 out/에 파일이 없는 src */
  missing: string[];
  /** basePath 밖·해석 불가 등 크기를 잴 수 없는 src */
  invalid: string[];
  /** 다른 출처의 src — 크기를 재지 않고 경고만 */
  external: string[];
}

export interface PageBudget {
  page: string;
  scriptCount: number;
  rawBytes: number;
  gzipBytes: number;
  overBudget: boolean;
}

export interface BudgetReport {
  budgetBytes: number;
  pages: PageBudget[];
  /** gzip 합이 가장 큰 페이지(동률이면 먼저 나온 페이지). 페이지가 없으면 null */
  maxPage: PageBudget | null;
  errors: string[];
  warnings: string[];
  ok: boolean;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** 페이지별 초기 JS 합을 예산과 비교한다. 예산 초과·없는 파일·해석 불가 src·페이지 0개는 오류. */
export function evaluateBudget(
  pages: readonly PageScripts[],
  budgetBytes: number,
): BudgetReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (pages.length === 0) {
    errors.push(
      "검사할 HTML 페이지가 없습니다 — 먼저 `npm run build`를 실행하세요.",
    );
  }

  const results: PageBudget[] = pages.map((page) => {
    const gzipBytes = sum(page.scripts.map((script) => script.gzipBytes));
    const result: PageBudget = {
      page: page.page,
      scriptCount: page.scripts.length,
      rawBytes: sum(page.scripts.map((script) => script.rawBytes)),
      gzipBytes,
      overBudget: gzipBytes > budgetBytes,
    };
    if (result.overBudget) {
      errors.push(
        `${page.page}: 초기 JS ${formatKb(gzipBytes)}KB가 예산 ${formatKb(budgetBytes)}KB를 ${formatKb(gzipBytes - budgetBytes)}KB 초과`,
      );
    }
    for (const src of page.missing) {
      errors.push(`${page.page}: 스크립트 파일이 out/에 없음 — ${src}`);
    }
    for (const src of page.invalid) {
      errors.push(
        `${page.page}: 크기를 잴 수 없는 스크립트 경로(basePath 밖·해석 불가) — ${src}`,
      );
    }
    for (const src of page.external) {
      warnings.push(`${page.page}: 외부 스크립트는 크기를 재지 않음 — ${src}`);
    }
    return result;
  });

  const maxPage = results.reduce<PageBudget | null>(
    (max, page) =>
      max === null || page.gzipBytes > max.gzipBytes ? page : max,
    null,
  );

  return {
    budgetBytes,
    pages: results,
    maxPage,
    errors,
    warnings,
    ok: errors.length === 0,
  };
}

/** 바이트 → KB(1024B) 소수 첫째 자리 문자열 */
export function formatKb(bytes: number): string {
  return (bytes / BYTES_PER_KB).toFixed(1);
}

// 한글·CJK 전각 문자는 터미널에서 두 칸을 차지한다. 표 정렬용 근사.
const WIDE_CHAR_RE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

/** 터미널 표시 폭(한글 등 전각 문자는 2칸) */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) width += WIDE_CHAR_RE.test(char) ? 2 : 1;
  return width;
}

function pad(text: string, width: number, align: "left" | "right"): string {
  const space = " ".repeat(Math.max(0, width - displayWidth(text)));
  return align === "left" ? `${text}${space}` : `${space}${text}`;
}

/** 페이지별 표 + 결과 요약. 최대 페이지에 `◀ 최대`, 예산 초과 페이지에 `✗ 초과` 표시 */
export function formatBudgetReport(report: BudgetReport): string {
  const header = ["페이지", "스크립트", "원본 KB", "gzip KB", "예산 대비"];
  const rows = report.pages.map((page) => {
    const marks = [
      page.overBudget ? "✗ 초과" : "",
      page === report.maxPage ? "◀ 최대" : "",
    ].filter(Boolean);
    return {
      cells: [
        page.page,
        String(page.scriptCount),
        formatKb(page.rawBytes),
        formatKb(page.gzipBytes),
        `${((page.gzipBytes / report.budgetBytes) * 100).toFixed(1)}%`,
      ],
      marks: marks.join(" "),
    };
  });

  const widths = header.map((title, column) =>
    Math.max(
      displayWidth(title),
      ...rows.map((row) => displayWidth(row.cells[column] ?? "")),
    ),
  );
  const formatRow = (cells: readonly string[]): string =>
    cells
      .map((cell, column) =>
        pad(cell, widths[column] ?? 0, column === 0 ? "left" : "right"),
      )
      .join("  ");

  const lines = [
    `측정 방식: ${MEASUREMENT_NOTE}`,
    `예산: 페이지당 ${formatKb(report.budgetBytes)}KB (${report.budgetBytes.toLocaleString("en-US")} B, gzip — PRD DR-11·§15 D21)`,
    "",
    formatRow(header),
    formatRow(widths.map((width) => "-".repeat(width))),
    ...rows.map(
      (row) => `${formatRow(row.cells)}${row.marks ? `  ${row.marks}` : ""}`,
    ),
    "",
  ];

  for (const warning of report.warnings) lines.push(`경고: ${warning}`);
  for (const error of report.errors) lines.push(`오류: ${error}`);

  const max = report.maxPage;
  if (report.ok && max) {
    lines.push(
      `결과: 통과 — 최대 ${max.page} ${formatKb(max.gzipBytes)}KB / ${formatKb(report.budgetBytes)}KB (여유 ${formatKb(report.budgetBytes - max.gzipBytes)}KB)`,
    );
  } else {
    lines.push(`결과: 실패 — 오류 ${report.errors.length}건`);
  }
  return lines.join("\n");
}

export interface BundleCheckArgs {
  /** 페이지당 초기 JS 예산(KB, gzip) */
  budgetKb: number;
  /** 검사할 정적 export 폴더 */
  outDir: string;
  help: boolean;
}

export const BUNDLE_CHECK_USAGE = [
  "사용법: npm run check:bundle -- [--budget-kb <n>] [--out-dir <dir>]",
  `  --budget-kb <n>  페이지당 초기 JS 예산(KB, gzip). 기본 ${DEFAULT_BUDGET_KB} (PRD DR-11)`,
  "  --out-dir <dir>  검사할 정적 export 폴더. 기본 out",
  "  --help, -h       이 도움말",
  `환경변수 BASE_PATH: next.config.ts와 같은 규칙(기본 ${DEFAULT_BASE_PATH})`,
].join("\n");

/** `--budget-kb`(양수, 소수 허용)·`--out-dir`·`--help`를 파싱한다. */
export function parseBundleCheckArgs(
  argv: readonly string[],
): ParseResult<BundleCheckArgs> {
  let values: { "budget-kb"?: string; "out-dir"?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: {
        "budget-kb": { type: "string" },
        "out-dir": { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  let budgetKb = DEFAULT_BUDGET_KB;
  const rawBudget = values["budget-kb"];
  if (rawBudget !== undefined) {
    budgetKb = Number(rawBudget);
    if (!/^\d+(\.\d+)?$/.test(rawBudget) || !(budgetKb > 0)) {
      return {
        ok: false,
        error: `--budget-kb에는 양수를 넣어야 합니다 (받은 값: "${rawBudget}")`,
      };
    }
  }

  const outDir = values["out-dir"] ?? "out";
  if (outDir.trim() === "") {
    return { ok: false, error: "--out-dir 값이 비어 있습니다" };
  }

  return { ok: true, value: { budgetKb, outDir, help: values.help ?? false } };
}
