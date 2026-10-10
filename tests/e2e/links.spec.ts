import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { collectInternalRefs } from "../../scripts/lib/site-refs";
import { basePath, outDir, siteOrigins, sitePages } from "./support/site";

// 빌드 후 링크 검사 (NFR-12). out/의 모든 HTML에서 내부 링크(a·area href)와 정적 자산(link href,
// script·img src, srcset 등)을 모아 정적 서버(serve-out)에 요청하고 최종 200인지 확인한다.
// - 디렉터리 → 끝 슬래시 301 같은 의도된 리다이렉트는 따라간 뒤 최종 상태를 본다.
// - 외부 링크는 요청하지 않는다(CI 불안정 방지). basePath가 빠진 루트 경로(`/x`)는 GitHub Pages에서
//   깨지므로 실패로 처리한다(CLAUDE.md §7.1).
const pages = sitePages();

test("out/에서 검사할 HTML 페이지를 찾는다", () => {
  const urlPaths = pages.map((page) => page.urlPath);
  expect(
    urlPaths,
    `${outDir}에 HTML이 없습니다 — 먼저 npm run build`,
  ).toContain("/");
  expect(urlPaths).toContain("/404.html");
});

for (const page of pages) {
  test(`${page.file} — 내부 링크·정적 자산이 200으로 열린다`, async ({
    request,
    baseURL,
  }) => {
    const origin = new URL(baseURL ?? "http://127.0.0.1:4173/").origin;
    const html = readFileSync(page.absolutePath, "utf8");
    const { internal, problems } = collectInternalRefs(html, page.urlPath, {
      basePath,
      siteOrigins,
    });

    // 페이지 자신도 자기 URL로 열려야 한다.
    const targets = [
      { sitePath: page.urlPath, search: "", refs: ["(페이지 자신)"] },
      ...internal.filter(
        (target) => target.sitePath !== page.urlPath || target.search !== "",
      ),
    ];

    const failures = problems.map(
      (problem) => `${problem.ref} — ${problem.reason}`,
    );
    for (const target of targets) {
      const url = `${origin}${basePath}${target.sitePath}${target.search}`;
      const response = await request.get(url);
      if (response.status() !== 200) {
        failures.push(
          `${response.status()} ${url} ← ${target.refs.join(", ")}`,
        );
      }
      await response.dispose();
    }

    expect(failures, `깨진 링크·자산 (검사 ${targets.length}개)`).toEqual([]);
    expect(targets.length).toBeGreaterThan(1);
  });
}
