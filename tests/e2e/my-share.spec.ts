import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// 팔로우 내보내기 · 가져오기(M4-10 — PRD FR-114, §15 D67 ③ `/my/?t=…&p=…`) · 내 팀 일정 구독(M4-12 — FR-115).
// 빌드 결과(out/) 대상. 공유 URL은 SITE_URL 기준 절대 주소라 로컬 서버에서는 경로 + 쿼리만 떼어 연다.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const KEY = "ed-follow";

async function axe(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .analyze();
  return violations.map((v) => v.id);
}

async function stored(page: Page): Promise<unknown> {
  return page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k) ?? "null"),
    KEY,
  );
}

function seed(page: Page, teams: string[], players: string[] = []) {
  return page.addInitScript(
    ([k, value]) => {
      // 첫 방문에만 심는다(새로고침 · 다음 이동에서 덮어쓰지 않게)
      if (sessionStorage.getItem("seeded") === null) {
        localStorage.setItem(k, value);
        sessionStorage.setItem("seeded", "1");
      }
    },
    [KEY, JSON.stringify({ v: 1, teams, players })] as const,
  );
}

/** 공유 URL(절대) → 로컬 서버에서 여는 상대 경로(basePath 뒤) */
function localPath(url: string): string {
  const { pathname, search } = new URL(url);
  return `${pathname.replace(/^\/euro-digest\//, "")}${search}`;
}

const band = (page: Page) =>
  page.getByRole("region", { name: "받은 팔로우를 가져올까요?" });
const tools = (page: Page) =>
  page.locator('[data-slot="my-manage"]').filter({ visible: true });

test.describe("내보내기 → 가져오기", () => {
  test("팔로우 → 링크 복사 → 새 컨텍스트에서 열기 → 합치기 · 덮어쓰기 → 주소 정리", async ({
    page,
    browser,
    context,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "클립보드 권한은 데스크톱 한 번",
    );
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seed(page, ["bayern-munchen", "arsenal"], ["kim-min-jae"]);
    await page.goto("my/");
    const copy = tools(page).getByRole("button", {
      name: "내보내기 — 링크 복사",
    });
    await expect(copy).toBeEnabled();
    await copy.click();
    await expect(page.getByText("링크를 복사했어요")).toBeVisible();
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toMatch(/\/my\/\?t=bayern-munchen,arsenal&p=kim-min-jae$/);

    // 새 기기(컨텍스트) — 팔로우 2개가 있는 상태에서 연다
    for (const mode of ["합치기", "덮어쓰기"] as const) {
      const other = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        serviceWorkers: "block",
      });
      const next = await other.newPage();
      await seed(next, ["chelsea"], ["lee-kang-in"]);
      await next.goto(localPath(url));
      await expect(band(next)).toBeVisible();
      await expect(band(next)).toContainText("공유 링크 · 팀 2 · 선수 1");
      await expect(
        next.getByRole("list", { name: "들어올 항목" }),
      ).toContainText("바이에른 뮌헨");
      await next.getByRole("button", { name: mode, exact: true }).click();
      await expect(band(next)).toHaveCount(0);
      await expect(next).toHaveURL(/\/my\/$/);
      expect(await stored(next)).toEqual(
        mode === "합치기"
          ? {
              v: 1,
              teams: ["chelsea", "bayern-munchen", "arsenal"],
              players: ["lee-kang-in", "kim-min-jae"],
            }
          : {
              v: 1,
              teams: ["bayern-munchen", "arsenal"],
              players: ["kim-min-jae"],
            },
      );
      await expect(
        next.getByText(
          mode === "합치기" ? "팔로우를 합쳤어요" : "팔로우를 덮어썼어요",
        ),
      ).toBeVisible();
      // 새로고침해도 다시 묻지 않는다
      await next.reload();
      await expect(next.locator('[data-slot="my-kicker"]')).toContainText(
        mode === "합치기" ? "팔로우 5" : "팔로우 3",
      );
      await expect(band(next)).toHaveCount(0);
      await other.close();
    }
  });

  test("팔로우 0 — 내보내기 비활성", async ({ page }) => {
    await page.goto("my/");
    await expect(
      tools(page).getByRole("button", { name: "내보내기 — 링크 복사" }),
    ).toBeDisabled();
    await expect(tools(page).locator('[data-slot="my-ics"]')).toHaveCount(0);
  });

  test("한도 초과 · 모르는 항목 · 잘못된 쿼리 안내", async ({ page }) => {
    await seed(page, ["chelsea", "liverpool", "barcelona", "milan"]);
    await page.goto(
      "my/?t=Arsenal,%20bayern-munchen,,arsenal,ghost-fc&p=kim-min-jae",
    );
    const b = band(page);
    await expect(b).toBeVisible();
    await expect(b).toContainText("공유 링크 · 팀 2 · 선수 1");
    await expect(b).toContainText(
      "지금 팔로우에 더하면 팀 5 · 선수 1 · 한도로 1개 빠짐",
    );
    await expect(b).toContainText("모르는 항목 1개는 빼요");
    await page.getByRole("button", { name: "합치기", exact: true }).click();
    await expect(
      page.getByText(
        "팔로우를 합쳤어요 · 한도 때문에 1개가 빠졌어요 · 모르는 항목 1개",
      ),
    ).toBeVisible();
    expect(await stored(page)).toEqual({
      v: 1,
      teams: ["chelsea", "liverpool", "barcelona", "milan", "arsenal"],
      players: ["kim-min-jae"],
    });
    await expect(page).toHaveURL(/\/my\/$/);
  });

  test("이미 같은 팔로우 — 띠 없이 안내 · 취소는 바꾸지 않는다", async ({
    page,
  }) => {
    await seed(page, ["arsenal"]);
    await page.goto("my/?t=arsenal");
    await expect(page.getByText("이미 같은 팔로우예요")).toBeVisible();
    await expect(band(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/my\/$/);

    await page.goto("my/?p=kim-min-jae");
    await page.getByRole("button", { name: "취소" }).click();
    await expect(band(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/my\/$/);
    expect(await stored(page)).toEqual({
      v: 1,
      teams: ["arsenal"],
      players: [],
    });
  });

  test("저장소 차단 — 띠 안내 · 이번 방문 동안 반영", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("my/?t=arsenal&p=kim-min-jae");
    await expect(band(page)).toContainText(
      "저장소가 막혀 이번 방문 동안만 유지돼요",
    );
    await page.getByRole("button", { name: "합치기", exact: true }).click();
    await expect(
      page.getByText("팔로우를 합쳤어요 · 이번 방문 동안만 유지돼요"),
    ).toBeVisible();
    await expect(page.locator('[data-slot="my-summary"]')).toHaveText(
      "팀 아스널 · 선수 김민재",
    );
    expect(errors).toEqual([]);
  });
});

test.describe("내 팀 일정 구독(FR-115)", () => {
  test("팔로우 팀마다 .ics 링크 · 200 · 선수만이면 숨김", async ({
    page,
    request,
  }) => {
    await seed(page, ["bayern-munchen", "arsenal"], ["kim-min-jae"]);
    await page.goto("my/");
    const block = tools(page).locator('[data-slot="my-ics"]');
    await expect(block).toBeVisible();
    // 팀마다 webcal 구독 + https '.ics 받기'(2026-11-02 사용자 결정, M4-16) — 파일 링크가 200
    const subs = block.locator('a[data-ics-mode="webcal"]');
    await expect(subs).toHaveCount(2);
    await expect(subs.first()).toHaveAccessibleName(
      "경기 일정 구독 — 바이에른 뮌헨",
    );
    await expect(subs.first()).toHaveAttribute(
      "href",
      /^webcal:\/\/.+\/calendar\/bayern-munchen\.ics$/,
    );
    const links = block.locator('a[data-slot="ics-file"]');
    await expect(links).toHaveCount(2);
    await expect(links.first()).toHaveAccessibleName(
      "바이에른 뮌헨 경기 일정 .ics 받기",
    );
    for (const href of await links.evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).href),
    )) {
      const res = await request.get(href);
      expect(res.status()).toBe(200);
      expect(await res.text()).toContain("BEGIN:VCALENDAR");
    }
    // 팀을 모두 풀면 숨김
    for (const name of ["바이에른 뮌헨 팔로우", "아스널 팔로우"])
      await tools(page).getByRole("button", { name }).click();
    await expect(block).toHaveCount(0);
  });
});

test.describe("/my 공유 화면 — 폭 × 테마", () => {
  for (const width of [375, 768, 1024, 1280]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${width}px ${colorScheme} — 확인 띠 + 도구 · 넘침 0 · axe 0 · 44px · CLS`, async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== "desktop", "폭은 테스트가 정한다");
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await seed(
          page,
          ["bayern-munchen", "atletico-madrid", "arsenal", "chelsea"],
          ["kim-min-jae"],
        );
        await page.addInitScript(() => {
          (window as unknown as { __cls: number }).__cls = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as unknown as Array<{
              value: number;
              hadRecentInput: boolean;
            }>)
              if (!e.hadRecentInput)
                (window as unknown as { __cls: number }).__cls += e.value;
          }).observe({ type: "layout-shift", buffered: true });
        });
        await page.goto(
          "my/?t=liverpool,napoli,union-berlin&p=lee-kang-in,son-heung-min",
        );
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await expect(band(page)).toBeVisible();
        await expect(
          page.locator('[data-slot="my-board"]:not([aria-busy])'),
        ).toBeVisible();
        await page.waitForTimeout(300);
        // 부트가 잡은 자리 = 띠 높이(자리를 잡은 채 띠가 들어와 아래가 밀리지 않는다)
        const fit = await page.evaluate(() => {
          const slot = document.querySelector<HTMLElement>(
            '[data-slot="my-import-slot"]',
          )!;
          const cs = getComputedStyle(slot);
          const band = slot.querySelector('[data-slot="my-import"]')!;
          return {
            reserved: parseFloat(cs.minHeight),
            band:
              band.getBoundingClientRect().height +
              parseFloat(cs.paddingTop) +
              parseFloat(cs.paddingBottom),
          };
        });
        expect(Math.abs(fit.reserved - fit.band)).toBeLessThanOrEqual(1);
        expect(errors).toEqual([]);
        const cls = await page.evaluate(
          () => (window as unknown as { __cls: number }).__cls,
        );
        testInfo.annotations.push({ type: "cls", description: String(cls) });
        expect(cls).toBeLessThanOrEqual(0.05);
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
        ).toBe(0);
        expect(await axe(page)).toEqual([]);
        const small = await page.evaluate(() =>
          [
            ...document.querySelectorAll<HTMLElement>(
              '[data-slot="my-import"] button, [data-slot="my-tools"] button, [data-slot="my-ics"] a',
            ),
          ]
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => ({
              text: el.textContent?.trim(),
              h: el.getBoundingClientRect().height,
              w: el.getBoundingClientRect().width,
            }))
            .filter((x) => x.h < 44 || x.w < 44),
        );
        expect(small).toEqual([]);

        if (process.env.SHOTS) {
          const dir = "docs/design/d2/screenshots";
          await page.screenshot({
            path: `${dir}/impl-my-share-${width}-${colorScheme}-fold.png`,
          });
          const manage = tools(page);
          await manage
            .locator('[data-slot="my-tools"]')
            .scrollIntoViewIfNeeded();
          await manage.screenshot({
            path: `${dir}/impl-my-share-${width}-${colorScheme}-manage.png`,
          });
        }
      });
    }
  }
});
