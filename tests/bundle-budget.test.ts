import { describe, expect, it } from "vitest";

import {
  BYTES_PER_KB,
  DEFAULT_BUDGET_KB,
  displayWidth,
  evaluateBudget,
  formatBudgetReport,
  formatKb,
  parseBundleCheckArgs,
  type PageScripts,
} from "../scripts/lib/bundle-budget";

const KB = BYTES_PER_KB;
const DEFAULT_BUDGET = DEFAULT_BUDGET_KB * KB;

function page(
  name: string,
  gzipKbs: readonly number[],
  extra: Partial<PageScripts> = {},
): PageScripts {
  return {
    page: name,
    scripts: gzipKbs.map((kb, index) => ({
      sitePath: `/_next/${name}-${index}.js`,
      rawBytes: kb * KB * 3,
      gzipBytes: kb * KB,
    })),
    missing: [],
    invalid: [],
    external: [],
    ...extra,
  };
}

describe("evaluateBudget", () => {
  it("기본 예산은 160KB(=163,840B, PRD §15 D21)", () => {
    expect(DEFAULT_BUDGET).toBe(163_840);
  });

  it("페이지별 gzip 합이 예산 이하면 통과하고 최대 페이지를 고른다", () => {
    const report = evaluateBudget(
      [page("index.html", [100, 35]), page("404.html", [100])],
      DEFAULT_BUDGET,
    );
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.pages.map((result) => result.gzipBytes)).toEqual([
      135 * KB,
      100 * KB,
    ]);
    expect(report.maxPage?.page).toBe("index.html");
  });

  it("예산과 정확히 같으면 통과, 1바이트라도 넘으면 실패", () => {
    const exact = page("index.html", [160]);
    expect(evaluateBudget([exact], DEFAULT_BUDGET).ok).toBe(true);
    expect(evaluateBudget([exact], DEFAULT_BUDGET - 1).ok).toBe(false);
  });

  it("예산을 낮추면 같은 페이지가 실패하고 초과량을 알려 준다", () => {
    const report = evaluateBudget([page("index.html", [100, 35.7])], 100 * KB);
    expect(report.ok).toBe(false);
    expect(report.pages[0]?.overBudget).toBe(true);
    expect(report.errors).toEqual([
      "index.html: 초기 JS 135.7KB가 예산 100.0KB를 35.7KB 초과",
    ]);
  });

  it("out/에 없는 스크립트·해석 불가 src는 오류, 외부 스크립트는 경고", () => {
    const report = evaluateBudget(
      [
        page("index.html", [10], {
          missing: ["/euro-digest/_next/gone.js"],
          invalid: ["/_next/no-base.js"],
          external: ["https://gc.zgo.at/count.js"],
        }),
      ],
      DEFAULT_BUDGET,
    );
    expect(report.ok).toBe(false);
    expect(report.errors).toHaveLength(2);
    expect(report.errors[0]).toContain("gone.js");
    expect(report.errors[1]).toContain("no-base.js");
    expect(report.warnings).toEqual([
      "index.html: 외부 스크립트는 크기를 재지 않음 — https://gc.zgo.at/count.js",
    ]);
  });

  it("페이지가 하나도 없으면 실패(빌드 누락)", () => {
    const report = evaluateBudget([], DEFAULT_BUDGET);
    expect(report.ok).toBe(false);
    expect(report.maxPage).toBeNull();
    expect(report.errors[0]).toContain("npm run build");
  });
});

describe("formatBudgetReport", () => {
  it("측정 방식·예산·페이지별 표·최대 표시·결과 요약을 담는다", () => {
    const text = formatBudgetReport(
      evaluateBudget(
        [page("index.html", [135.7]), page("404.html", [100])],
        DEFAULT_BUDGET,
      ),
    );
    expect(text).toContain("zlib.gzipSync");
    expect(text).toContain("noModule 제외");
    expect(text).toContain("페이지당 160.0KB (163,840 B");
    expect(text).toMatch(/index\.html\s+1\s+407\.1\s+135\.7\s+84\.8%\s+◀ 최대/);
    expect(text).not.toMatch(/404\.html.*◀ 최대/);
    expect(text).toContain(
      "결과: 통과 — 최대 index.html 135.7KB / 160.0KB (여유 24.3KB)",
    );
  });

  it("초과 페이지에 ✗ 초과를 붙이고 실패로 요약한다", () => {
    const text = formatBudgetReport(
      evaluateBudget([page("index.html", [200])], DEFAULT_BUDGET),
    );
    expect(text).toMatch(/index\.html.*✗ 초과 ◀ 최대/);
    expect(text).toContain(
      "오류: index.html: 초기 JS 200.0KB가 예산 160.0KB를 40.0KB 초과",
    );
    expect(text).toContain("결과: 실패 — 오류 1건");
  });

  it("한글 헤더도 표 열이 맞도록 전각 폭으로 정렬한다", () => {
    const lines = formatBudgetReport(
      evaluateBudget([page("index.html", [1])], DEFAULT_BUDGET),
    ).split("\n");
    const header = lines.find((line) => line.startsWith("페이지")) ?? "";
    const divider = lines.find((line) => line.startsWith("---")) ?? "";
    expect(displayWidth(header)).toBe(displayWidth(divider));
  });
});

describe("formatKb · displayWidth", () => {
  it("1024바이트 단위 소수 첫째 자리", () => {
    expect(formatKb(163_840)).toBe("160.0");
    expect(formatKb(1536)).toBe("1.5");
  });

  it("한글은 2칸, ASCII는 1칸", () => {
    expect(displayWidth("페이지 a")).toBe(8);
  });
});

describe("parseBundleCheckArgs", () => {
  it("인자가 없으면 기본 예산 160KB·out/", () => {
    expect(parseBundleCheckArgs([])).toEqual({
      ok: true,
      value: { budgetKb: 160, outDir: "out", help: false },
    });
  });

  it("--budget-kb(소수 허용)·--out-dir·-h를 받는다", () => {
    expect(
      parseBundleCheckArgs(["--budget-kb", "100.5", "--out-dir=dist", "-h"]),
    ).toEqual({
      ok: true,
      value: { budgetKb: 100.5, outDir: "dist", help: true },
    });
  });

  it.each([["0"], ["-1"], ["abc"], ["1e3"], [""]])(
    "--budget-kb=%j는 거부한다",
    (raw) => {
      const result = parseBundleCheckArgs([`--budget-kb=${raw}`]);
      expect(result.ok).toBe(false);
    },
  );

  it("모르는 옵션·위치 인자·빈 out-dir은 거부한다", () => {
    expect(parseBundleCheckArgs(["--force"]).ok).toBe(false);
    expect(parseBundleCheckArgs(["out"]).ok).toBe(false);
    expect(parseBundleCheckArgs(["--out-dir="]).ok).toBe(false);
  });
});
