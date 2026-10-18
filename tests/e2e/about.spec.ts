import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { publishSchedule } from "../../src/lib/about";
import { ABOUT_SECTIONS } from "../../src/lib/about-sections";
import { loadLatestNews } from "../../src/lib/data/news";
import { kstDate, nowUtcIso } from "../../src/lib/time";
import { basePath, outDir } from "./support/site";

// `/about/`·커스텀 404 e2e (M1-36 — PRD FR-140·§4 IA, DESIGN §4.3·§7·§10) — 빌드 결과(out/)에서
// 폭별 가로 넘침·차례 배치(1024 이상 목차 열 sticky · 1023 이하 본문 차례), 앵커 이동(위치·:target 괘선), 사이트 안 `/about/#…` 링크의
// 앵커 존재, 발행 시각(데이터에서 계산), 깊은 경로의 404(basePath 아래 자산·링크)를 본다. axe·링크 200은 a11y.spec·links.spec이 모든 페이지에 건다.

const WIDTHS = [375, 1023, 1024, 1279, 1280] as const;
const PAGES = [
  { path: "about/", h1: "소개" },
  { path: "no/such/deep/page/", h1: "페이지를 찾을 수 없습니다" },
] as const;

function desktopOnly(projectName: string): void {
  test.skip(
    projectName !== "desktop",
    "폭별 검사는 desktop 프로젝트에서 한 번",
  );
}

async function open(page: Page, target: string): Promise<void> {
  await page.goto(target);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

for (const width of WIDTHS) {
  const wide = width >= 1024;
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    for (const target of PAGES) {
      test(`${target.path} — 가로 넘침 0 · h1 하나`, async ({
        page,
      }, testInfo) => {
        desktopOnly(testInfo.project.name);
        await open(page, target.path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText([
          target.h1,
        ]);
      });
    }

    test(`차례 — ${wide ? "목차 열(sticky top 16px)만" : "본문 차례만"} 보인다`, async ({
      page,
    }, testInfo) => {
      desktopOnly(testInfo.project.name);
      await open(page, "about/");
      const tocs = page.getByRole("navigation", { name: "소개 차례" });
      await expect(tocs).toHaveCount(1); // 숨긴 쪽은 접근성 트리에 없다
      const toc = tocs.first();
      await expect(toc.getByRole("link")).toHaveCount(ABOUT_SECTIONS.length);
      const info = await toc.evaluate((el) => ({
        inMain: el.closest("main") !== null,
        position: getComputedStyle(el).position,
        top: getComputedStyle(el).top,
        // 목차 열 폭(--col-contents 232px) = 목차 상자 + 오른쪽 여백 36px
        column:
          el.getBoundingClientRect().width +
          parseFloat(getComputedStyle(el).marginRight),
      }));
      if (wide) {
        expect(info).toEqual({
          inMain: false,
          position: "sticky",
          top: "16px",
          column: 232,
        });
        // 내려도 목차가 화면 위에 붙어 있다
        await page.evaluate(() => window.scrollTo(0, 1800));
        const top = await toc.evaluate((el) => el.getBoundingClientRect().top);
        expect(top).toBe(16);
      } else {
        expect(info.inMain).toBe(true);
      }
      // 차례 행은 누르는 높이 44px 이상
      const heights = await toc
        .getByRole("link")
        .evaluateAll((links) =>
          links.map((a) => a.getBoundingClientRect().height),
        );
      for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
    });
  });
}

for (const width of [375, 1280] as const) {
  test.describe(`앵커 이동 ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("차례 'AI 작성 고지' → /about/#ai, 절 머리가 화면 위 16px에 · 괘선이 레드(:target)", async ({
      page,
    }, testInfo) => {
      desktopOnly(testInfo.project.name);
      await open(page, "about/");
      await page
        .getByRole("navigation", { name: "소개 차례" })
        .getByRole("link", { name: /AI 작성 고지/ })
        .click();
      await expect(page).toHaveURL(new RegExp(`${basePath}/about/#ai$`));
      await page.waitForTimeout(300); // 괘선 색 전환(base 200ms)
      const result = await page.evaluate(() => {
        const sectionEl = document.getElementById("ai") as HTMLElement;
        const head = sectionEl.firstElementChild as HTMLElement;
        const probe = document.createElement("span");
        probe.style.color = "var(--brand-accent)";
        document.body.append(probe);
        const accent = getComputedStyle(probe).color;
        probe.remove();
        return {
          top: Math.round(sectionEl.getBoundingClientRect().top),
          border: getComputedStyle(head).borderTopColor,
          accent,
          heading: head.querySelector("h2")?.textContent,
        };
      });
      expect(result.heading).toBe("AI 작성 고지");
      expect(result.top).toBe(16);
      expect(result.border).toBe(result.accent);
    });
  });
}

test("사이트 안의 /about/#… 링크(뒤표지 등)는 모두 /about/에 있는 앵커를 가리킨다", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo.project.name);
  const aboutHtml = readFileSync(
    path.join(outDir, "about", "index.html"),
    "utf8",
  );
  const ids = new Set(
    [...aboutHtml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]),
  );
  for (const s of ABOUT_SECTIONS) expect(ids).toContain(s.id);
  for (const target of ["./", "news/", "about/", "no/such/page/"]) {
    await open(page, target);
    const hashes = await page
      .locator(`a[href^="${basePath}/about/#"]`)
      .evaluateAll((links) =>
        links.map((a) => new URL((a as HTMLAnchorElement).href).hash.slice(1)),
      );
    expect(hashes.length).toBeGreaterThan(0);
    for (const hash of hashes)
      expect(ids, `#${hash} (${target})`).toContain(hash);
  }
});

test("뒤표지 링크 순서(DESIGN §9.3·혼합안) — AI 작성 고지 · 소개·출처 정책 · 삭제·정정 요청 · GitHub", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo.project.name);
  await open(page, "./");
  const links = page.getByRole("contentinfo").getByRole("link");
  await expect(links).toHaveText([
    "AI 작성 고지",
    "소개·출처 정책",
    "삭제·정정 요청",
    /GitHub/,
  ]);
  const hrefs = await links.evaluateAll((els) =>
    els.map((a) => a.getAttribute("href")),
  );
  expect(hrefs.slice(0, 3)).toEqual([
    `${basePath}/about/#ai`,
    `${basePath}/about/`,
    `${basePath}/about/#contact`,
  ]);
});

test("발행 시각은 최신 호 날짜로 계산한 계절 값이다(07:00 고정 아님 — D26)", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo.project.name);
  const news = loadLatestNews();
  const { current, next } = publishSchedule(news?.date ?? kstDate(nowUtcIso()));
  await open(page, "about/");
  const rows = page.locator("#schedule ol > li");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(current.publish);
  await expect(rows.nth(0)).toContainText("지금");
  await expect(rows.nth(1)).toContainText(next.publish);
  await expect(page.locator("#schedule")).toContainText(
    `매일 ${current.publish} KST에 발행합니다.`,
  );
});

test("깊은 없는 경로 → 404 상태 + 사이트 404(스타일 적용), 링크·자산은 basePath 절대 경로", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo.project.name);
  const response = await page.goto("a/b/c/d/");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "페이지를 찾을 수 없습니다",
  );
  // 스타일시트가 깊은 경로에서도 열린다 — 지면색·숫자 서체가 적용됨
  const look = await page.evaluate(() => {
    const big = [...document.querySelectorAll("main p")].find(
      (p) => p.textContent === "404",
    ) as HTMLElement;
    const probe = document.createElement("span");
    probe.style.color = "var(--paper)";
    document.body.append(probe);
    const paper = getComputedStyle(probe).color;
    probe.remove();
    return {
      body: getComputedStyle(document.body).backgroundColor,
      paper,
      font: getComputedStyle(big).fontFamily,
      hidden: big.getAttribute("aria-hidden"),
    };
  });
  expect(look.body).toBe(look.paper);
  expect(look.font).toContain("Barlow Condensed");
  expect(look.hidden).toBe("true");
  const main = page.getByRole("main");
  await expect(
    main.getByRole("link", { name: "홈으로 돌아가기" }),
  ).toHaveAttribute("href", `${basePath}/`);
  await expect(main.getByRole("link", { name: "뉴스 보기" })).toHaveAttribute(
    "href",
    `${basePath}/news/`,
  );
  // out/404.html의 자산·내부 링크는 모두 basePath로 시작하는 절대 경로(상대 경로면 깊은 경로에서 깨진다)
  const html = readFileSync(path.join(outDir, "404.html"), "utf8");
  const refs = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)]
    .map((m) => m[1] ?? "")
    .filter((ref) => !/^(?:https?:|mailto:|#|data:)/.test(ref));
  expect(refs.length).toBeGreaterThan(0);
  for (const ref of refs)
    expect(ref.startsWith(`${basePath}/`), ref).toBe(true);
});
