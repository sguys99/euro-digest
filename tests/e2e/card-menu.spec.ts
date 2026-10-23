import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { basePath, sitePages, siteOrigins, toGotoPath } from "./support/site";

// 카드 메뉴 — 공유하기 · 오류 신고↗ (M1-35, PRD FR-34·FR-36, DESIGN.md §9.3 카드 메뉴, APG Menu Button) — 일반 빌드(out/)의 실제 호.
// 두 프로젝트(mobile 375 터치 · desktop 1280)에서 돈다. 여닫기·키보드·바깥 클릭·하나만 열림 · 공유(데스크톱 복사 → 토스트, 터치 기기 Web
// Share, 클립보드 거부 → '링크 열기') · 오류 신고 href · 공유 URL로 열면 카드 도착·강조 · axe(메뉴 열림, 라이트·다크) · 가로 넘침 5폭 ·
// 44px. 혼합안과의 치수 대조·견본 44px 겹침은 견본 e2e(tests/e2e-specimen/news-cards.spec.ts).
// data/news가 비어 있는 빌드(CI 초기 등)에서는 카드가 없어 건너뛴다.

const ARCHIVE_RE = /^\/news\/(\d{4}-\d{2}-\d{2})\/$/;
const DATES = sitePages()
  .flatMap((p) => ARCHIVE_RE.exec(p.urlPath)?.[1] ?? [])
  .sort();
const LATEST = DATES.at(-1);
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
/** 토스트 영역(`<Toaster>` — 필터 결과 알림 `[data-nf-live]`과 다른 aria-live 영역) */
const TOASTER = '[aria-live="polite"][aria-atomic="true"]';

/** 공유 URL — SITE_URL + basePath + 날짜 페이지 + 카드 앵커(FR-34) */
function shareUrl(date: string, id: string): string {
  return `${siteOrigins[0]}${basePath}/news/${date}/#${id}`;
}

async function open(page: Page, path = "./"): Promise<void> {
  await page.goto(path);
  // 하이드레이션 뒤(섬이 상대 시간을 채운 뒤) — 메뉴 리스너가 붙었다
  await expect(
    page.locator("ol#feed time[data-rel] [data-rel-out]").first(),
  ).not.toBeEmpty();
}

const cards = (page: Page) => page.locator("ol#feed > li > article");
const kebab = (page: Page, i: number) =>
  cards(page).nth(i).getByRole("button", { name: "카드 메뉴" });
const menu = (page: Page, i: number) => cards(page).nth(i).getByRole("menu");

test.beforeEach(() => {
  test.skip(LATEST === undefined, "발행된 호가 없는 빌드");
});

test("카드마다 버튼 · 피드마다 메뉴 하나 — 연 카드의 공유 URL = 그 호 날짜 페이지 앵커, 오류 신고 = 카드 ID·날짜를 채운 summary-error 폼(새 창)", async ({
  page,
}) => {
  for (const path of ["./", "news/", `news/${DATES[0]}/`]) {
    await open(page, path);
    const date = path === `news/${DATES[0]}/` ? (DATES[0] as string) : LATEST;
    const problems = await page.evaluate(
      ({ date, origin, base }) => {
        const out: string[] = [];
        const menus = document.querySelectorAll('[role="menu"]');
        if (menus.length !== 1) out.push(`메뉴 ${menus.length}개`);
        if (document.querySelector("ol#feed [role='menu']"))
          out.push("닫힌 메뉴가 카드 안에 있음");
        for (const article of document.querySelectorAll<HTMLElement>(
          "ol#feed > li > article",
        )) {
          const id = article.id;
          const button =
            article.querySelector<HTMLButtonElement>("[data-menu-button]");
          if (!button) {
            out.push(`${id}: 버튼 없음`);
            continue;
          }
          if (button.getAttribute("aria-haspopup") !== "menu")
            out.push(`${id}: aria-haspopup`);
          if (button.getAttribute("aria-describedby") !== `${id}-t`)
            out.push(`${id}: aria-describedby`);
          button.click();
          const menu = document.getElementById(
            button.getAttribute("aria-controls") ?? "",
          );
          if (
            !menu ||
            menu.hidden ||
            menu.parentElement !== button.parentElement ||
            button.getAttribute("aria-expanded") !== "true"
          )
            out.push(`${id}: 열린 메뉴가 그 카드에 없음`);
          const share = menu?.querySelector("[data-share]");
          if (
            share?.getAttribute("data-share") !==
            `${origin}${base}/news/${date}/#${id}`
          )
            out.push(`${id}: 공유 URL ${share?.getAttribute("data-share")}`);
          const report = menu?.querySelector<HTMLAnchorElement>("a");
          const url = new URL(report?.href ?? "about:blank");
          if (
            url.searchParams.get("template") !== "summary-error.yml" ||
            url.searchParams.get("card") !== id ||
            url.searchParams.get("date") !== date
          )
            out.push(`${id}: 오류 신고 ${report?.href}`);
          if (report?.target !== "_blank") out.push(`${id}: 새 창`);
          button.click();
          if (!menu?.hidden || menu.parentElement === button.parentElement)
            out.push(`${id}: 닫으면 원래 자리로`);
        }
        return out;
      },
      { date, origin: siteOrigins[0], base: basePath },
    );
    expect(problems).toEqual([]);
  }
});

test("누르면 열리고 첫 항목 포커스 · 다른 메뉴를 열면 앞 메뉴는 닫힘 · 바깥 클릭으로 닫힘", async ({
  page,
}) => {
  await open(page);
  test.skip((await cards(page).count()) < 2, "카드 2장 미만");
  await kebab(page, 0).click();
  await expect(kebab(page, 0)).toHaveAttribute("aria-expanded", "true");
  await expect(menu(page, 0)).toBeVisible();
  await expect(
    menu(page, 0).getByRole("menuitem", { name: "공유하기" }),
  ).toBeFocused();
  // 메뉴는 그 카드 오른쪽 끝 버튼 아래 — 화면 밖으로 나가지 않는다
  const box = await menu(page, 0).boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.x + box.width).toBeLessThanOrEqual(
    viewport?.width ?? 0,
  );
  await kebab(page, 1).click();
  await expect(kebab(page, 0)).toHaveAttribute("aria-expanded", "false");
  await expect(menu(page, 0)).toBeHidden();
  await expect(menu(page, 1)).toBeVisible();
  await expect(
    page.locator('[data-menu-button][aria-expanded="true"]'),
  ).toHaveCount(1);
  await page.mouse.click(5, 5);
  await expect(menu(page, 1)).toBeHidden();
  await expect(kebab(page, 1)).toHaveAttribute("aria-expanded", "false");
});

test("키보드 — Enter로 열기 · ↓↑ 순환 · Esc 닫고 버튼 복귀 · Tab은 닫고 다음 요소로 · 버튼에서 ↑는 끝 항목", async ({
  page,
}) => {
  await open(page);
  const button = kebab(page, 0);
  const share = menu(page, 0).getByRole("menuitem", { name: "공유하기" });
  const report = menu(page, 0).getByRole("menuitem", { name: /^오류 신고/ });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(share).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(report).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(share).toBeFocused();
  await page.keyboard.press("End");
  await expect(report).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu(page, 0)).toBeHidden();
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("ArrowUp");
  await expect(report).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu(page, 0)).toBeHidden();
  // 포커스는 메뉴 밖, 버튼 다음 요소(메뉴 항목은 Tab 순서에 없다)
  const after = await page.evaluate(() => {
    const active = document.activeElement;
    const wrap = document.querySelector("ol#feed [data-card-menu]");
    return {
      inMenu: Boolean(active && wrap?.contains(active)),
      body: active === document.body,
    };
  });
  expect(after).toEqual({ inMenu: false, body: false });
});

test("공유하기 — 데스크톱은 링크 복사 → 토스트 '공유 · 링크를 복사했어요', 터치 기기는 Web Share(취소는 조용히)", async ({
  page,
  context,
}, testInfo) => {
  const touch = testInfo.project.use.hasTouch === true;
  if (touch) {
    // 헤드리스 Linux Chromium에는 Web Share가 없다 — 부른 값을 기록하는 대역(두 번째 호출은 사용자가 시트를 닫은 취소)
    await page.addInitScript(() => {
      const calls: string[] = [];
      (window as unknown as { __shares: string[] }).__shares = calls;
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: (data: ShareData) => {
          calls.push(data.url ?? "");
          if (calls.length > 1) {
            const error = new Error("취소");
            error.name = "AbortError";
            return Promise.reject(error);
          }
          return Promise.resolve();
        },
      });
    });
  } else {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  await open(page);
  const id = (await cards(page).first().getAttribute("id")) ?? "";
  await kebab(page, 0).click();
  await menu(page, 0).getByRole("menuitem", { name: "공유하기" }).click();
  await expect(menu(page, 0)).toBeHidden();
  await expect(kebab(page, 0)).toBeFocused();
  const live = page.locator(TOASTER);
  if (touch) {
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __shares: string[] }).__shares,
        ),
      )
      .toEqual([shareUrl(LATEST as string, id)]);
    await kebab(page, 0).click();
    await menu(page, 0).getByRole("menuitem", { name: "공유하기" }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __shares: string[] }).__shares.length,
        ),
      )
      .toBe(2);
    await expect(live).toBeEmpty();
  } else {
    await expect(live).toHaveText("공유링크를 복사했어요");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      shareUrl(LATEST as string, id),
    );
  }
});

test("클립보드가 막히면 '링크를 복사하지 못했어요' + '링크 열기'(포커스) → Enter로 그 카드의 날짜 페이지로 가서 도착 강조", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("NotAllowedError")),
      },
    });
  });
  await open(page);
  const index = Math.min(3, (await cards(page).count()) - 1);
  const id = (await cards(page).nth(index).getAttribute("id")) ?? "";
  await kebab(page, index).click();
  await menu(page, index).getByRole("menuitem", { name: "공유하기" }).click();
  const live = page.locator(TOASTER);
  await expect(live).toContainText("링크를 복사하지 못했어요");
  // 대체 경로라 포커스가 '링크 열기'로 온다 — 키보드로 바로 누른다
  const action = live.getByRole("button", { name: "링크 열기" });
  await expect(action).toBeFocused();
  await expect(live.getByRole("button", { name: "알림 닫기" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`${basePath}/news/${LATEST}/#${id}$`),
  );
  const target = page.locator(`#${id}`);
  await expect(target).toBeInViewport();
  expect(await target.evaluate((el) => el.matches(":target"))).toBe(true);
});

test("공유 URL로 열면 그 카드로 스크롤 + :target 강조(--paper-2 면 · 왼쪽 4px 막대 — DECISIONS #17)", async ({
  page,
}) => {
  await page.goto(`news/${LATEST}/`);
  const count = await cards(page).count();
  test.skip(count === 0, "카드 없음");
  const id =
    (await cards(page)
      .nth(count - 1)
      .getAttribute("id")) ?? "";
  const local = new URL(shareUrl(LATEST as string, id));
  await page.goto(
    toGotoPath(`${local.pathname.slice(basePath.length)}${local.hash}`),
  );
  const target = page.locator(`#${id}`);
  await expect(target).toBeInViewport();
  const style = await target.evaluate((el) => ({
    target: el.matches(":target"),
    shadow: getComputedStyle(el).boxShadow,
  }));
  expect(style.target).toBe(true);
  expect(style.shadow).toContain("inset");
  await expect
    .poll(() =>
      target.evaluate(
        (el) =>
          getComputedStyle(el).backgroundColor ===
          getComputedStyle(document.documentElement)
            .getPropertyValue("--paper-2")
            .trim()
            .replace(
              /^#(..)(..)(..)$/,
              (_m, r, g, b) =>
                `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`,
            ),
      ),
    )
    .toBe(true);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`axe WCAG 2.1 A/AA 위반 0 — 메뉴를 연 채 (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await open(page);
    await kebab(page, 0).click();
    await expect(menu(page, 0)).toBeVisible();
    const { violations } = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(
      violations.map(
        (v) =>
          `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
      ),
    ).toEqual([]);
  });
}

test("가로 넘침 0 — 첫 카드·마지막 카드 메뉴를 연 채 375·1023·1024·1279·1280", async ({
  page,
}) => {
  for (const width of [375, 1023, 1024, 1279, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await open(page);
    const last = (await cards(page).count()) - 1;
    for (const i of [0, last]) {
      await kebab(page, i).click();
      await expect(menu(page, i)).toBeVisible();
      const m = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        right: Math.max(
          ...[...document.querySelectorAll('[role="menu"]:not([hidden])')].map(
            (el) => el.getBoundingClientRect().right,
          ),
        ),
      }));
      expect(m.overflow, `${width}px 카드 ${i}`).toBeLessThanOrEqual(0);
      expect(m.right, `${width}px 카드 ${i}`).toBeLessThanOrEqual(width);
      await page.keyboard.press("Escape");
    }
  }
});

test("44px — 메뉴 버튼(누름 판정)·메뉴 항목(상자), 1023 이하는 메뉴가 하단 탭에 가리지 않게 올라온다", async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(() => {
    const out: string[] = [];
    for (const button of document.querySelectorAll<HTMLElement>(
      "ol#feed [data-menu-button]",
    )) {
      button.scrollIntoView({ block: "center" });
      const r = button.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) out.push(`${button.id} 상자`);
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      for (const [x, y] of [
        [cx, cy - 21.5],
        [cx, cy + 21.5],
        [cx - 21.5, cy],
        [cx + 21.5, cy],
      ] as const) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(hit === button || button.contains(hit)))
          out.push(
            `${button.id} (${Math.round(x - cx)},${Math.round(y - cy)}) ← ${hit?.tagName}`,
          );
      }
    }
    return out;
  });
  expect(result).toEqual([]);
  const last = (await cards(page).count()) - 1;
  await kebab(page, last).scrollIntoViewIfNeeded();
  await kebab(page, last).click();
  const items = menu(page, last).getByRole("menuitem");
  for (let i = 0; i < (await items.count()); i++) {
    const box = await items.nth(i).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }
  // 1023 이하: 하단 탭(sticky) 위로 메뉴 전체가 보인다
  const covered = await menu(page, last).evaluate((el) => {
    const tabs = document.querySelector('nav[aria-label="하단 탭"]');
    if (!tabs || tabs.getClientRects().length === 0) return false;
    return el.getBoundingClientRect().bottom > tabs.getBoundingClientRect().top;
  });
  expect(covered).toBe(false);
});

test("같은 경로 다른 날짜로 클라이언트 이동(꼬리표 이전 호) 뒤에도 메뉴가 열리고 그 호 날짜로 바뀐다 — 메뉴는 닫힐 때 원래 자리로", async ({
  page,
}) => {
  test.skip(DATES.length < 2, "호가 둘 미만");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, `news/${LATEST}/`);
  await kebab(page, 0).click();
  await expect(menu(page, 0)).toBeVisible();
  // 꼬리표 이전 호(next/link — 같은 [date] 경로라 카드 <li>만 바뀐다). 결호는 건너뛰므로 발행일 목록의 바로 앞 호
  const date = DATES.at(-2) as string;
  await page.locator('a[data-counterfoil="prev"]').click();
  await expect(page).toHaveURL(new RegExp(`/news/${date}/$`));
  await expect(
    page.locator("ol#feed time[data-rel] [data-rel-out]").first(),
  ).not.toBeEmpty();
  await kebab(page, 0).click();
  await expect(menu(page, 0)).toBeVisible();
  const id = (await cards(page).first().getAttribute("id")) ?? "";
  await expect(
    menu(page, 0).getByRole("menuitem", { name: "공유하기" }),
  ).toHaveAttribute("data-share", shareUrl(date, id));
  await expect(page.locator('[role="menu"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("375 달력 시트가 열린 채 카드 메뉴에서 Esc — 메뉴만 닫히고 시트는 그대로(가장 위의 것 하나)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, `news/${LATEST}/`);
  const calendar = page.locator("[data-cal-button]");
  await calendar.click();
  await expect(calendar).toHaveAttribute("aria-expanded", "true");
  await kebab(page, 0).click();
  await expect(menu(page, 0)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu(page, 0)).toBeHidden();
  await expect(kebab(page, 0)).toBeFocused();
  await expect(calendar).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveAttribute("aria-expanded", "false");
});
