import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  outDir,
  sitePages,
  toGotoPath,
  withArchiveSample,
} from "./support/site";

// 빌드 후 접근성 자동 검사 (NFR-12). axe-core로 WCAG 2.0/2.1 A·AA 규칙 위반 0건을 요구한다.
// - 대상: out/의 모든 HTML 페이지 + 실제 404 응답(없는 경로) — 목록은 빌드 결과에서 모은다.
// - 라이트·다크 두 색 구성표에서 검사한다(대비 기준은 다크 포함, CLAUDE.md §4).
// - best-practice 규칙(region·landmark-one-main 등)은 태그 필터로 제외된다 — 기준은 WCAG 위반만.
// - 날짜 아카이브(`/news/{date}/`)는 같은 틀이라 표본만(첫 호·최신 호·최근 3·결호 앞뒤·월 경계 — support/site.ts `archiveSample`, M1-34 리뷰).
//   발행일마다 렌더 + axe 4번이 늘어 시간이 발행일 수에 비례하던 것을 막는다. 링크 검사(links.spec — HTTP만)는 전수.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const COLOR_SCHEMES = ["light", "dark"] as const;

const targets = [
  ...withArchiveSample(sitePages()).map((page) => ({
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

// 제목 단계(best-practice heading-order — WCAG 태그 밖이라 위 검사에 들지 않는다). h1 → h3처럼 단계를 건너뛰지 않는다(M1-30 리뷰 —
// `/news/`는 페이지 h1 바로 아래 카드 제목을 h2로). 색과 무관해 라이트 한 번만.
for (const target of targets) {
  test(`${target.name} — 제목 단계를 건너뛰지 않는다(axe heading-order)`, async ({
    page,
  }) => {
    await page.goto(target.gotoPath);
    const { violations } = await new AxeBuilder({ page })
      .withRules(["heading-order"])
      .analyze();
    expect(
      violations.flatMap((violation) =>
        violation.nodes.map((node) => node.target.join(" ")),
      ),
    ).toEqual([]);
  });
}
