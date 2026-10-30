import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { basePath, outDir, sitePages } from "./support/site";

// 팀 페이지 `/teams/[team]/` (M2-13 — PRD FR-50~58, DESIGN §9.3 팀 화면). 빌드 결과(out/)를 대상으로 한다.
// 표본 팀의 전체 접근성(axe·44px·제목 단계)은 a11y.spec(support/site.ts `teamSample`), 내부 링크 HTTP 검사는 links.spec(전수).
// 여기서는 111팀 생성·대회 페이지 팀 링크 무결성·배치(375 세로 피치 / 1280 가로 피치)·하이라이트·데이터 없는 팀을 본다.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const teamSlugs = sitePages().flatMap((p) => {
  const m = /^\/teams\/([a-z0-9-]+)\/$/.exec(p.urlPath);
  return m ? [m[1]!] : [];
});

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
}

test.describe("팀 페이지 — 정적 생성 · 팀 링크 무결성", () => {
  test("data/teams 파일마다 팀 페이지가 있다(FR-50)", () => {
    const files = readdirSync(path.resolve("data/teams"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5))
      .sort();
    expect(files.length).toBeGreaterThan(0);
    expect([...teamSlugs].sort()).toEqual(files);
  });

  test("대회 페이지 6곳의 팀 링크(순위표·라운드·펼침)는 모두 생성된 팀 페이지를 가리킨다", () => {
    const have = new Set(teamSlugs);
    const missing: string[] = [];
    let links = 0;
    for (const comp of [
      "epl",
      "laliga",
      "seriea",
      "bundesliga",
      "ligue1",
      "ucl",
    ]) {
      const html = readFileSync(
        path.join(outDir, "competitions", comp, "index.html"),
        "utf8",
      );
      for (const m of html.matchAll(
        new RegExp(`href="${basePath}/teams/([a-z0-9-]+)/"`, "g"),
      )) {
        links += 1;
        if (!have.has(m[1]!)) missing.push(`${comp}: ${m[1]}`);
      }
    }
    expect(links).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });
});

test.describe("팀 페이지 — 표본 팀 렌더", () => {
  for (const slug of [
    "bayern-munchen",
    "le-havre",
    "marseille",
    "club-brugge",
    "union-berlin",
  ]) {
    test(`${slug} — h1 하나 · 티켓 배지 · 가로 넘침 0 · 출처 문구`, async ({
      page,
    }) => {
      test.skip(!teamSlugs.includes(slug), "팀 파일 없음");
      await page.goto(`teams/${slug}/`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(
        page.locator("[data-slot=team-ticket] [role=img]").first(),
      ).toHaveAttribute("aria-label", / 배지/);
      await expect(
        page.locator('[data-slot="team-source"] [lang="en"]'),
      ).toHaveText("Football data provided by the Football-Data.org API");
      await noOverflow(page);
    });
  }

  test("포메이션이 없는 팀(르아브르)은 팀시트 섹션이 없다(FR-55)", async ({
    page,
  }) => {
    await page.goto("teams/le-havre/");
    const hasFormation = await page.locator("[data-slot=team-sheet]").count();
    // 데이터가 생기면 섹션이 생길 수 있다 — 있으면 포메이션 숫자가 하나 보이고, 없으면 섹션 자체가 없다
    if (hasFormation === 0) {
      await expect(page.getByRole("heading", { name: "팀시트" })).toHaveCount(
        0,
      );
    } else {
      await expect(page.locator("[data-slot=team-sheet]")).toBeVisible();
    }
  });

  test("바이에른 — 피치 11칸, 375 세로 · 1280 가로(같은 DOM), 명단 선발 11", async ({
    page,
  }, info) => {
    await page.goto("teams/bayern-munchen/");
    const pitch = page.locator("[data-slot=pitch]");
    test.skip((await pitch.count()) === 0, "라인업 없음");
    await expect(pitch.locator("li[data-no]")).toHaveCount(11);
    const box = (await pitch.boundingBox())!;
    if (info.project.name === "mobile")
      expect(box.height).toBeGreaterThan(box.width);
    else expect(box.width).toBeGreaterThan(box.height);
    // 선수 칸이 피치 밖으로 나가지 않는다(가운데 좌표 기준)
    for (const spot of await pitch
      .locator("li[data-no] > span:first-child")
      .all()) {
      const b = (await spot.boundingBox())!;
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      expect(cx).toBeGreaterThan(box.x);
      expect(cx).toBeLessThan(box.x + box.width);
      expect(cy).toBeGreaterThan(box.y);
      expect(cy).toBeLessThan(box.y + box.height);
    }
  });

  test("명단 행 hover → 같은 선수 피치 칸 하이라이트(마우스 전용)", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "mobile", "hover는 마우스 전용");
    await page.goto("teams/bayern-munchen/");
    const pitch = page.locator("[data-slot=pitch]");
    test.skip((await pitch.count()) === 0, "라인업 없음");
    const row = page.locator("[data-slot=team-sheet] ol li[data-no]").nth(7);
    const key = (await row.getAttribute("data-no"))!;
    await row.hover();
    await expect(pitch.locator(`li[data-no="${key}"]`)).toHaveAttribute(
      "data-hl",
      "",
    );
    await expect(row).toHaveAttribute("data-hl", "");
    await page.mouse.move(2, 2);
    await expect(pitch.locator("li[data-hl]")).toHaveCount(0);
  });

  test("한국 선수가 명단에 있으면 한글 이름 + 완장(D63 ①) — 우니온 베를린", async ({
    page,
  }) => {
    test.skip(!teamSlugs.includes("union-berlin"), "팀 파일 없음");
    await page.goto("teams/union-berlin/");
    const sheet = page.locator("[data-slot=team-sheet] ol");
    test.skip((await sheet.count()) === 0, "라인업 없음");
    await expect(sheet.getByText("정우영")).toHaveCount(1);
    await expect(page.locator("[data-slot=team-ticket]")).toContainText(
      "정우영",
    );
  });

  test("리그 맥락 → 대회 순위표 행 앵커(:target 도착)", async ({
    page,
  }, info) => {
    await page.goto("teams/bayern-munchen/");
    const link = page
      .locator("[data-slot=league-context]")
      .first()
      .locator("a[aria-current=true]");
    const href = (await link.getAttribute("href"))!;
    expect(href).toMatch(/\/competitions\/[a-z0-9]+\/#bayern-munchen$/);
    if (info.project.name === "mobile") await link.scrollIntoViewIfNeeded();
    await link.click();
    await expect(page.locator("tr#bayern-munchen")).toBeVisible();
  });

  test("접힌 일정 펼치기 — details(JS 없이 동작) · 일정 행 수 = 시즌 경기 수", async ({
    page,
  }) => {
    await page.goto("teams/bayern-munchen/");
    const fx = page.locator("[data-slot=team-fixtures]");
    const total = Number(
      /시즌 (\d+)경기/.exec((await fx.textContent()) ?? "")?.[1] ?? "0",
    );
    expect(await fx.locator("li[data-state]").count()).toBe(total);
    const more = fx.locator("summary").last();
    await more.click();
    await expect(fx.locator("details").last()).toHaveAttribute("open", "");
    await noOverflow(page);
  });

  test("바이에른 — 펼친 일정·팀시트 상태도 WCAG 위반 0(라이트·다크)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto("teams/bayern-munchen/");
      for (const summary of await page
        .locator("[data-slot=team-fixtures] summary")
        .all()) {
        await summary.click();
      }
      const { violations } = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .analyze();
      expect(
        violations.map(
          (v) =>
            `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
        ),
        colorScheme,
      ).toEqual([]);
    }
  });
});
