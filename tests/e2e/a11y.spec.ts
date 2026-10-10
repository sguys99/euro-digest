import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { outDir, sitePages, toGotoPath } from "./support/site";

// 빌드 후 접근성 자동 검사 (NFR-12). axe-core로 WCAG 2.0/2.1 A·AA 규칙 위반 0건을 요구한다.
// - 대상: out/의 모든 HTML 페이지 + 실제 404 응답(없는 경로) — 목록은 빌드 결과에서 모은다.
// - 라이트·다크 두 색 구성표에서 검사한다(대비 기준은 다크 포함, CLAUDE.md §4).
// - best-practice 규칙(region·landmark-one-main 등)은 태그 필터로 제외된다 — 기준은 WCAG 위반만.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const COLOR_SCHEMES = ["light", "dark"] as const;

const targets = [
  ...sitePages().map((page) => ({
    name: page.file,
    gotoPath: toGotoPath(page.urlPath),
  })),
  { name: "없는 경로(404 응답)", gotoPath: "this-page-does-not-exist/" },
];

test("out/에서 접근성 검사할 페이지를 찾는다", () => {
  expect(
    targets.map((target) => target.name),
    `${outDir}에 HTML이 없습니다 — 먼저 npm run build`,
  ).toEqual(expect.arrayContaining(["index.html", "404.html"]));
});

for (const target of targets) {
  for (const colorScheme of COLOR_SCHEMES) {
    test(`${target.name} (${colorScheme}) — WCAG 2.1 A/AA 위반 0건`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(target.gotoPath);

      const { violations } = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .analyze();
      const summary = violations.map(
        (violation) =>
          `${violation.id} (${violation.impact ?? "impact 없음"}): ${violation.help} — ${violation.nodes
            .map((node) => node.target.join(" "))
            .join(", ")}`,
      );
      expect(summary, "axe 위반 목록 (규칙 설명: violation.helpUrl)").toEqual(
        [],
      );
    });
  }
}
