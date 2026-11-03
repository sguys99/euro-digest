import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { blockWebFonts } from "./support/site";

// 마이 팀(M4-08 — PRD FR-110~112, DESIGN §9.3 D2 "팔로우 버튼" · "`/my` 틀" · 홈 위젯 '내 팀 소식' · 피드 '내 팀만').
// 빌드 결과(out/) 대상 — 팔로우는 브라우저 저장소(`ed-follow`)에만 있다. 팀 = 바이에른 뮌헨(김민재 소속 — 저장소 데이터에 늘 있는 팀).
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const KEY = "ed-follow";

async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

async function stored(page: Page): Promise<unknown> {
  return page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k) ?? "null"),
    KEY,
  );
}

async function axe(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .analyze();
  return violations.map((v) => v.id);
}

test.describe("팔로우 → /my", () => {
  test("팀 화면에서 팔로우 → /my 반영 → 새로고침 유지 → /my에서 풀기", async ({
    page,
  }) => {
    await page.goto("teams/bayern-munchen/");
    const follow = page.getByRole("button", { name: "팔로우 — 바이에른 뮌헨" });
    await expect(follow).toHaveAttribute("aria-pressed", "false");
    await follow.click();
    await expect(
      page.getByRole("button", { name: "팔로우 — 바이에른 뮌헨" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(await stored(page)).toEqual({
      v: 1,
      teams: ["bayern-munchen"],
      players: [],
    });

    await page.goto("my/");
    await expect(page.locator('[data-slot="my-kicker"]')).toContainText(
      "팔로우 1",
    );
    await expect(
      page.locator('[data-slot="my-fixtures"] [data-slot="admission"]'),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-slot="my-summary"]')).toHaveText(
      "팀 바이에른 뮌헨",
    );
    const manage = page
      .locator('[data-slot="my-manage"]')
      .filter({ visible: true });
    const icon = manage.getByRole("button", { name: "바이에른 뮌헨 팔로우" });
    await expect(icon).toHaveAttribute("aria-pressed", "true");
    await icon.click();
    await expect(icon).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('[data-slot="my-empty"]')).toBeVisible();
  });

  test("탭 동기화 — 다른 탭에서 팔로우하면 열린 /my가 따라온다", async ({
    page,
    context,
  }) => {
    await page.goto("my/");
    await expect(page.locator('[data-slot="my-empty"]')).toBeVisible();
    const other = await context.newPage();
    await other.goto("korean-players/kim-min-jae/");
    await other.getByRole("button", { name: "팔로우 — 김민재" }).click();
    await expect(page.locator('[data-slot="my-summary"]')).toHaveText(
      "선수 김민재",
    );
    await expect(page.locator('[data-slot="my-empty"]')).toHaveCount(0);
  });

  test("한도 — 팀 5개면 여섯째 팀 버튼은 비활성 + 이유 문장, 선수 버튼은 그대로", async ({
    page,
  }) => {
    await page.addInitScript((k) => {
      localStorage.setItem(
        k,
        JSON.stringify({
          v: 1,
          teams: ["arsenal", "chelsea", "liverpool", "barcelona", "milan"],
          players: [],
        }),
      );
    }, KEY);
    await page.goto("teams/bayern-munchen/");
    const limit = page.getByRole("button", {
      name: "팔로우 — 바이에른 뮌헨",
    });
    await expect(limit).toHaveAttribute("aria-disabled", "true");
    const note = page.locator('[data-slot="follow-limit-note"]');
    await expect(note).toBeVisible();
    await expect(note).toHaveText(
      "팀은 5개까지 팔로우할 수 있어요 — 마이에서 하나를 풀면 더할 수 있어요",
    );
    await expect(limit).toHaveAttribute(
      "aria-describedby",
      (await note.getAttribute("id"))!,
    );
    await limit.click({ force: true });
    await expect(limit).toHaveAttribute("aria-pressed", "false");
    expect(await axe(page)).toEqual([]);

    await page.goto("korean-players/kim-min-jae/");
    await expect(
      page.getByRole("button", { name: "팔로우 — 김민재" }),
    ).not.toHaveAttribute("aria-disabled");
  });

  test("localStorage 차단 — 정상 렌더 · 이번 방문 동안 팔로우 · 안내", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("teams/bayern-munchen/");
    const follow = page.getByRole("button", { name: "팔로우 — 바이에른 뮌헨" });
    await follow.click();
    await expect(
      page.getByRole("button", { name: "팔로우 — 바이에른 뮌헨" }),
    ).toBeVisible();
    await expect(page.getByText("이번 방문 동안만 유지돼요")).toBeVisible();
    await page.goto("my/");
    await expect(page.locator('[data-slot="my-empty"]')).toBeVisible();
    await expect(page.locator('[data-slot="my-kicker"]')).toContainText(
      "이번 방문 동안만 유지",
    );
    await page.goto("./");
    await expect(page.locator('[data-slot="my-news"]')).toBeHidden();
    expect(errors).toEqual([]);
  });
});

test.describe("홈 '내 팀 소식' · 피드 '내 팀만'", () => {
  test("팔로우 0 — 홈 위젯 · 내 팀만 칩 숨김", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator('[data-slot="my-news"]')).toBeHidden();
    await expect(page.locator('[data-nf-key="mine"]')).toHaveCount(2);
    for (const el of await page.locator("[data-nf-mine]").all())
      await expect(el).toBeHidden();
  });

  test("팔로우가 걸린 소식이 있으면 첫 페인트에 위젯(최대 3) · /news/?mine=1은 그 카드만", async ({
    page,
  }) => {
    // 웹폰트 교체 이동은 fonts.spec.ts가 본다 — 아래 CLS는 위젯 판정(부트) 자체의 이동만
    await blockWebFonts(page);
    // 오늘 호에서 걸린 팀이 가장 많은 팀을 고른다(데이터에 의존하지 않게)
    await page.goto("./");
    const team = await page.evaluate(() => {
      const count = new Map<string, number>();
      for (const li of document.querySelectorAll("[data-mn-row]")) {
        for (const [key] of JSON.parse(
          li.getAttribute("data-mn-keys") ?? "[]",
        ) as Array<[string, string]>) {
          if (key.startsWith("t:")) count.set(key, (count.get(key) ?? 0) + 1);
        }
      }
      return [...count].sort((a, b) => b[1] - a[1])[0]?.[0].slice(2) ?? null;
    });
    test.skip(team === null, "오늘 호에 걸린 팀이 없다");
    await page.evaluate(
      ([k, t]) =>
        localStorage.setItem(
          k,
          JSON.stringify({ v: 1, teams: [t], players: [] }),
        ),
      [KEY, team!] as const,
    );
    await page.reload();
    const widget = page.locator('[data-slot="my-news"]');
    await expect(widget).toBeVisible();
    const rows = widget.locator("[data-mn-row]:not([hidden])");
    expect(await rows.count()).toBeGreaterThan(0);
    expect(await rows.count()).toBeLessThanOrEqual(3);
    // 첫 페인트 전 스크립트가 그렸다 — 레이아웃 이동 0(폰트 로드가 끝난 뒤까지 잰다)
    const cls = await page.evaluate(async () => {
      let sum = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as Array<{
          value: number;
          hadRecentInput: boolean;
        }>)
          if (!e.hadRecentInput) sum += e.value;
      }).observe({ type: "layout-shift", buffered: true });
      await document.fonts.ready;
      await new Promise((resolve) => setTimeout(resolve, 500));
      return sum;
    });
    expect(cls).toBeLessThanOrEqual(0.05);

    await page.goto("news/?mine=1");
    const visible = page.locator("[data-nf-card]:not([hidden])");
    const n = await visible.count();
    expect(n).toBeGreaterThan(0);
    for (const li of await visible.all())
      expect((await li.getAttribute("data-nf-teams"))?.split(" ")).toContain(
        team,
      );
    const chip = page
      .locator('[data-nf-key="mine"]')
      .filter({ visible: true })
      .first();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await chip.click();
    await expect(page).toHaveURL(/\/news\/$/);
  });
});

test.describe("/my 화면", () => {
  for (const width of [375, 768, 1024, 1280]) {
    test(`${width}px — 팔로우 5(팀 3 + 선수 2) · 넘침 0 · axe 0 · 44px`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "폭은 테스트가 정한다");
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((k) => {
        localStorage.setItem(
          k,
          JSON.stringify({
            v: 1,
            teams: ["bayern-munchen", "atletico-madrid", "arsenal"],
            players: ["kim-min-jae", "lee-kang-in"],
          }),
        );
      }, KEY);
      await page.goto("my/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "마이 팀",
      ); // h1 = 쪽 제목(2026-11-03 사용자 결정), 내비 라벨은 "마이"
      await expect(
        page.locator('[data-slot="my-board"]:not([aria-busy])'),
      ).toBeVisible();
      expect(await overflow(page)).toBe(0);
      expect(await axe(page)).toEqual([]);
      const small = await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            'main a, main button, [aria-label="팔로우 관리"] button, [aria-label="팔로우 관리"] a',
          ),
        ]
          .filter((el) => el.getClientRects().length > 0)
          .filter((el) => el.closest("h3") === null)
          .map((el) => {
            const r = el.getBoundingClientRect();
            const after = getComputedStyle(el, "::after");
            const h = Math.max(r.height, parseFloat(after.height) || 0);
            return { text: el.textContent?.trim(), h };
          })
          .filter((x) => x.h < 44),
      );
      expect(small).toEqual([]);
    });
  }
});
