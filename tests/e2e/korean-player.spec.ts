import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { loadLatestIssue } from "../../src/lib/data/issue";
import { loadLastNight } from "../../src/lib/data/korean-players";
import {
  listKoreanPlayerSlugs,
  loadPlayerPage,
} from "../../src/lib/data/player-page";

// 한국 선수 상세 `/korean-players/[slug]/`(M3-10 — PRD FR-62) · 홈 어젯밤 한국 선수(M3-11 — FR-58). 빌드 결과(out/)를 대상으로 한다.
// 전 페이지 axe(라이트·다크)는 a11y.spec, 내부 링크는 links.spec. 여기서는 구성(데이터에서 계산한 기대 값) · 상태별 숨김 · 1280 옆단 배치 ·
// DOM 순서 · 가로 넘침(375 · 768 · 1024 · 1280) · 44px · 포커스 링 · tabular-nums · keep-all을 본다.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const SLUGS = listKoreanPlayerSlugs();
const NOW = new Date();
const SAMPLES = [
  "kim-min-jae",
  "lee-jae-sung",
  "park-seung-soo",
  "yang-min-hyeok",
].filter((s) => SLUGS.includes(s));

async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

test.describe("선수 상세 — 구성", () => {
  test("설정의 선수 전원이 정적 생성된다 · 각 페이지 h1 = 한글 이름", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "한 번만");
    for (const slug of SLUGS) {
      await page.goto(`korean-players/${slug}/`);
      const data = loadPlayerPage(slug, NOW)!;
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        data.view.nameKo,
      );
    }
  });

  for (const slug of SAMPLES) {
    test(`${slug} — 상태에 맞는 구역만 · DOM 순서 = 1279 이하 순서`, async ({
      page,
    }) => {
      const data = loadPlayerPage(slug, NOW)!;
      const { view, news, callUp } = data;
      await page.goto(`korean-players/${slug}/`);
      const ticket = page.locator('[data-slot="player-ticket"]');
      await expect(ticket).toHaveAttribute("data-state", view.state);
      const has = async (slot: string, want: boolean) =>
        expect(page.locator(`[data-slot="${slot}"]`)).toHaveCount(want ? 1 : 0);
      await has("player-season", view.season.length > 0);
      await has("player-log", view.state === "linked");
      await has("player-next", view.upcoming.length > 0);
      await has("player-news", true);
      await has("player-transfers", news.transfer.items.length > 0);
      await has(
        "player-national",
        callUp !== null || news.national.items.length > 0,
      );
      // 팔로우 버튼(M4-08)은 없다
      await expect(page.locator("[aria-pressed]")).toHaveCount(0);
      // DOM 순서 = 1279 이하 순서
      const order = await page
        .locator('[data-slot="player-page"] [data-slot^="player-"]')
        .evaluateAll((els) =>
          els
            .map((e) => e.getAttribute("data-slot"))
            .filter((s) => s !== "player-ticket-tail"),
        );
      const want = [
        "player-ticket",
        "player-season",
        "player-log",
        "player-next",
        "player-news",
        "player-transfers",
        "player-national",
      ];
      expect(order).toEqual(want.filter((s) => order.includes(s)));
      if (view.state === "linked") {
        // 로그 행 + 집계 시작 전 칸 = 5
        const rows = await page.locator('[data-slot="log-row"]').count();
        const gaps = await page.locator('[data-slot="log-gap"]').count();
        expect(rows).toBe(view.log.length);
        if (rows > 0) expect(rows + gaps).toBe(5);
        // 결과 값은 가리기(M4-15)용 묶음
        if (view.log.some((r) => r.result)) {
          await expect(
            page
              .locator('[data-slot="log-row"] [data-slot="result-value"]')
              .first(),
          ).toBeAttached();
        }
      }
    });
  }

  test("숫자 tabular-nums · 한글 keep-all · display: contents 없음", async ({
    page,
  }) => {
    await page.goto(`korean-players/${SAMPLES[0]}/`);
    const s = await page
      .locator('[data-slot="player-ticket"] [data-tone]')
      .first()
      .evaluate((el) => ({
        numeric: getComputedStyle(el).fontVariantNumeric,
        wordBreak: getComputedStyle(document.body).wordBreak,
      }));
    expect(s.numeric).toContain("tabular-nums");
    expect(s.wordBreak).toBe("keep-all");
    const contents = await page
      .locator('[data-slot="player-page"] *')
      .evaluateAll(
        (els) =>
          els.filter((e) => getComputedStyle(e).display === "contents").length,
      );
    expect(contents).toBe(0);
  });
});

test.describe("선수 상세 — 폭별 배치 · 가로 넘침 · 접근성", () => {
  for (const slug of SAMPLES) {
    for (const width of [375, 768, 1024, 1280]) {
      test(`${slug} ${width}px — 넘침 0 · 1280 옆단 · 꼬리표 배치`, async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== "desktop", "폭은 테스트가 정한다");
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`korean-players/${slug}/`);
        expect(await overflow(page)).toBe(0);
        const next = page.locator('[data-slot="player-next"]');
        if ((await next.count()) > 0) {
          const ticket = await page
            .locator('[data-slot="player-ticket"]')
            .boundingBox();
          const box = await next.boundingBox();
          // 1280 이상: 다음 경기가 티켓 오른쪽(옆단), 이하: 티켓 아래
          if (width >= 1280)
            expect(box!.x).toBeGreaterThan(ticket!.x + ticket!.width);
          else expect(box!.y).toBeGreaterThan(ticket!.y + ticket!.height);
        }
        const cells = page.locator('[data-slot="player-ticket-tail"] > div');
        if ((await cells.count()) > 1) {
          const a = (await cells.nth(0).boundingBox())!;
          const b = (await cells.nth(1).boundingBox())!;
          // 티켓 상자 폭 600px 이상이면 가로(컨테이너 쿼리 — DESIGN §7.1 예외), 미만이면 세로
          const tw = (await page
            .locator('[data-slot="player-ticket"]')
            .boundingBox())!.width;
          if (tw >= 600) expect(Math.abs(a.y - b.y)).toBeLessThan(1);
          else expect(b.y).toBeGreaterThan(a.y);
        }
      });
    }
  }

  test("누름 영역 44px · 포커스 링 — 선수 티켓 · 로그 · 다음 경기의 링크", async ({
    page,
  }) => {
    await page.goto(`korean-players/${SAMPLES[0]}/`);
    const small = await page
      .locator('[data-slot="player-page"] a, [data-slot="player-page"] button')
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
    await page.locator('[data-slot="player-ticket"] a').first().focus();
    const ring = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!);
      return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2;
    });
    expect(ring).toBe(true);
  });

  test("axe 0 — 1280 · 375 (라이트 · 다크)", async ({ page }) => {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      for (const slug of SAMPLES) {
        await page.goto(`korean-players/${slug}/`);
        const { violations } = await new AxeBuilder({ page })
          .withTags(WCAG_TAGS)
          .analyze();
        expect(violations.map((v) => `${slug} ${v.id}`)).toEqual([]);
      }
    }
  });
});

test.describe("홈 — 어젯밤 한국 선수(M3-11)", () => {
  const { issue } = loadLatestIssue();
  const view = loadLastNight(issue?.date ?? null);

  test("브리핑 창에 경기가 있던 선수만 · 이름 = 상세 링크 · 없으면 숨김", async ({
    page,
  }, testInfo) => {
    await page.goto("./");
    const sections = page.locator('[data-slot="last-night"]');
    if (!view) {
      await expect(sections).toHaveCount(0);
      return;
    }
    // 1279 이하 지면 · 1280 이상 마주 보는 면 — 같은 위젯 두 벌 중 보이는 것은 하나
    await expect(sections).toHaveCount(2);
    const visible = sections.filter({ visible: true });
    await expect(visible).toHaveCount(1);
    const rows = visible.locator('[data-slot="last-night-row"]');
    await expect(rows).toHaveCount(view.rows.length);
    for (const [i, row] of view.rows.entries()) {
      await expect(rows.nth(i)).toHaveAttribute("data-player", row.slug);
      await expect(
        rows.nth(i).getByRole("link", { name: row.nameKo }),
      ).toHaveAttribute("href", new RegExp(`/korean-players/${row.slug}/$`));
    }
    // 1279 이하는 5줄 바로 아래(피드 앞), 1280 이상은 마주 보는 면
    const inFacing = await visible.evaluate(
      (el) => el.closest("aside") !== null,
    );
    expect(inFacing).toBe(testInfo.project.name === "desktop");
    expect(await overflow(page)).toBe(0);
  });

  test("홈 초기 JS가 늘지 않는다 — 위젯은 서버 컴포넌트(섬 없음)", async ({
    page,
  }) => {
    await page.goto("./");
    const islands = await page
      .locator(
        '[data-slot="last-night"] [data-island], [data-slot="last-night"] script',
      )
      .count();
    expect(islands).toBe(0);
  });
});

test.describe("팀 화면 — 소속 한국 선수 링크(M3-11)", () => {
  test("티켓 꼬리표 · 주요 선수의 한국 선수 이름 = 상세 링크", async ({
    page,
  }) => {
    await page.goto("teams/bayern-munchen/");
    const links = page.locator(
      '[data-slot="team-page"] a[href$="/korean-players/kim-min-jae/"]',
    );
    await expect(links.first()).toBeVisible();
    expect(await links.count()).toBeGreaterThanOrEqual(1);
  });
});
