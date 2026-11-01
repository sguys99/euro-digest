import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { loadNationalHome } from "../../src/lib/data/national-page";
import { loadNationalTeamConfig } from "../../src/lib/data/national-team";

// `/national-team/` · 홈 A매치 섹션(M3-13 — PRD FR-70~73). 빌드 결과(out/)를 대상으로 한다. 일정 · 명단은 저장소 설정 그대로.
// 홈 섹션은 빌드 시각이 A매치 기간일 때만 있다 — 여기서는 지금 시각의 판정과 빌드가 일치하는지만 보고, 기간 안 모양(375 · 1280 × 라이트 ·
// 다크 · axe · 44px)은 견본 빌드 e2e(tests/e2e-specimen/national.spec.ts — 시각 주입)가 본다.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const config = loadNationalTeamConfig()!;
const squad = config.squads.at(-1)!;

async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

test.describe("/national-team/", () => {
  test("구성 — h1 · 일정 행 = 설정 경기 수 · 결과 값 묶음 · 소집 선수 = 상세 링크 · 근거 링크 새 창", async ({
    page,
  }) => {
    await page.goto("national-team/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("대표팀");
    await expect(page.locator('[data-slot="national-match"]')).toHaveCount(
      config.matches.length,
    );
    await expect(
      page.locator('[data-slot="national-match"] [data-slot="result-value"]'),
    ).toHaveCount(config.matches.filter((m) => m.status === "finished").length);
    const players = page.locator('[data-slot="squad-player"]');
    await expect(players).toHaveCount(squad.playerSlugs.length);
    for (const [i, slug] of squad.playerSlugs.entries()) {
      await expect(players.nth(i).getByRole("link")).toHaveAttribute(
        "href",
        new RegExp(`/korean-players/${slug}/$`),
      );
    }
    for (const a of await page
      .locator('[data-slot="national-source"] a')
      .all()) {
      await expect(a).toHaveAttribute("target", "_blank");
    }
    await expect(
      page.getByRole("link", { name: /뉴스에서 대표팀 소식 모아 보기/ }),
    ).toHaveAttribute("href", /\/news\/\?cat=national$/);
    // display: contents 없음(접근성 트리 순서 = 화면 순서)
    const contents = await page
      .locator('[data-slot="national-page"] *')
      .evaluateAll(
        (els) =>
          els.filter((e) => getComputedStyle(e).display === "contents").length,
      );
    expect(contents).toBe(0);
  });

  for (const width of [375, 768, 1024, 1280]) {
    test(`${width}px — 넘침 0 · 1280 옆단(소집 명단 · 대표팀 소식이 붙어 쌓임)`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "폭은 테스트가 정한다");
      await page.setViewportSize({ width, height: 800 });
      await page.goto("national-team/");
      expect(await overflow(page)).toBe(0);
      const schedule = (await page
        .locator('[data-slot="national-schedule"]')
        .boundingBox())!;
      const squadBox = (await page
        .locator('[data-slot="national-squad"]')
        .boundingBox())!;
      if (width >= 1280) {
        expect(squadBox.x).toBeGreaterThan(schedule.x + schedule.width);
        const side = await page
          .locator('[data-slot="national-side"] > section')
          .evaluateAll((els) =>
            els.map((e) => {
              const r = e.getBoundingClientRect();
              return { top: r.top, bottom: r.bottom };
            }),
          );
        for (let i = 1; i < side.length; i++) {
          expect(
            Math.abs(side[i]!.top - side[i - 1]!.bottom - 44),
          ).toBeLessThan(1.5);
        }
        // 지면 열은 옆단 높이에 끌려 벌어지지 않는다 — 일정 끝 + 44px = 주요국 머리
        const world = (await page
          .locator('[data-slot="national-world"]')
          .boundingBox())!;
        expect(
          Math.abs(world.y - (schedule.y + schedule.height) - 44),
        ).toBeLessThan(1.5);
      } else {
        expect(squadBox.y).toBeGreaterThan(schedule.y + schedule.height);
      }
    });
  }

  test("44px · 포커스 링 · tabular-nums · keep-all · axe 0(라이트 · 다크)", async ({
    page,
  }) => {
    await page.goto("national-team/");
    const small = await page
      .locator('[data-slot="national-page"] a')
      .evaluateAll((els) =>
        els
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const after = getComputedStyle(el, "::after");
            const ah = parseFloat(after.height) || 0;
            const aw = parseFloat(after.width) || 0;
            return Math.max(r.height, ah) < 44 || Math.max(r.width, aw) < 24;
          })
          .map((el) => el.textContent?.trim()),
      );
    expect(small).toEqual([]);
    await page.locator('[data-slot="squad-player"] a').first().focus();
    const ring = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!);
      return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2;
    });
    expect(ring).toBe(true);
    const s = await page
      .locator('[data-slot="national-match"] time')
      .first()
      .evaluate((el) => ({
        numeric: getComputedStyle(el).fontVariantNumeric,
        wordBreak: getComputedStyle(document.body).wordBreak,
      }));
    expect(s.numeric).toContain("tabular-nums");
    expect(s.wordBreak).toBe("keep-all");
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.reload();
      const { violations } = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .analyze();
      expect(violations.map((v) => `${colorScheme} ${v.id}`)).toEqual([]);
    }
  });
});

test("한국 선수 목록에서 들어온다 — 375 머리 링크 · 1280 목차 '대표팀' 행(44px)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("korean-players/");
  const head = page.locator('[data-slot="korean-players-national-link"]');
  await expect(head).toBeVisible();
  await expect(head).toHaveAttribute("href", /\/national-team\/$/);
  expect((await head.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(head).toBeHidden();
  const row = page.locator('[data-slot="roster-national-link"] a');
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("href", /\/national-team\/$/);
  await expect(row).toContainText("대표팀");
  expect((await row.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await row.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("대표팀");
});

test.describe("홈 A매치 섹션(FR-71)", () => {
  test("빌드 시각 판정과 같다 — 기간 밖이면 없고, 기간이면 5줄 다음 한 번", async ({
    page,
  }) => {
    // 빌드와 테스트 사이에 날짜가 바뀌면 판정이 달라질 수 있다 — 빌드 산출물의 판정을 기준으로 보되, 테스트 시각 판정과 다르면 건너뛴다
    const expected = loadNationalHome(new Date()) !== null;
    await page.goto("./");
    const sections = page.locator('[data-slot="home-national"]');
    const count = await sections.count();
    test.skip(count !== (expected ? 1 : 0), "빌드 뒤 날짜가 바뀜");
    if (!expected) return;
    await expect(sections).toHaveCount(1);
    await expect(
      sections.getByRole("link", { name: /대표팀/ }).last(),
    ).toHaveAttribute("href", /\/national-team\/$/);
  });
});
