import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  SCHEMES,
  SPECIMEN_PATH,
  touchTargetFailures,
  waitForFonts,
  waitForHydration,
} from "./support";

// 뉴스 카드 변형 6종 견본 e2e (M1-31, PRD FR-30 · D23·D30, DESIGN.md §9.3·§10) — SPECIMEN=1 빌드(out-specimen/) 전용.
// 견본 피드는 fixtures/news-sample.json(혼합안 홈과 같은 23장 — 머리기사 06·연결 줄 4쌍) + 경계 사례(출처 8곳·태그 0개·대회 0개·이적 단계 5종·
// 긴 라틴 매체명 연결 줄)다(src/app/specimen/page.specimen.tsx `SpecimenFeeds`). 실제 data/news는 날마다 바뀌어 연결 줄·이적 카드가
// 없는 날이 있으므로(10-17·10-18 연결 줄 0쌍) 변형 검사는 여기서 결정적으로 한다. 일반 빌드의 카드 불변식은 tests/e2e/news-cards.spec.ts.

/** 혼합안 기준 시각 2026-10-11 15:54 KST — 상대 시간 "11시간 전"(06 Solanke 04:24 KST) */
const NOW = new Date("2026-10-11T06:54:00Z");
const FEED = "#specimen-feed";
const EDGE = "#specimen-edge";
const WIDTHS = [375, 1023, 1024, 1279, 1280] as const;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function openFeed(page: Page, hash = ""): Promise<void> {
  await page.clock.setFixedTime(NOW);
  const response = await page.goto(`${SPECIMEN_PATH}${hash}`);
  expect(response?.status()).toBe(200);
  await waitForFonts(page);
  await waitForHydration(page);
}

/** 견본 피드 두 곳의 '+N곳'을 모두 펼친다 */
async function expandAll(page: Page): Promise<number> {
  return page.evaluate(() => {
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>(
        "button[data-src-toggle][aria-expanded='false']",
      ),
    ];
    for (const button of buttons) button.click();
    return buttons.length;
  });
}

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("가로 넘침 0 — '+N곳'을 모두 펼쳐도", async ({ page }) => {
      await openFeed(page);
      expect(await expandAll(page)).toBeGreaterThan(5);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test("머리기사: 1024 이상에서만 크게(라틴 42px · 아래 2px 잉크 괘선 · 탭 카드 높이), 1023 이하는 일반 카드", async ({
      page,
    }) => {
      await openFeed(page);
      const lead = page.locator(`${FEED} article[data-lead]`);
      await expect(lead).toHaveCount(1);
      await expect(lead).toHaveAttribute("id", "c_f598c95798");
      const m = await lead.evaluate((article) => {
        const title = article.querySelector("h3") as HTMLElement;
        const tab = article.querySelector(
          "[data-slot='index-tab']",
        ) as HTMLElement;
        const a = article.getBoundingClientRect();
        const s = getComputedStyle(article);
        return {
          fontSize: getComputedStyle(title).fontSize,
          border: s.borderBottomWidth,
          tabRatio: tab.getBoundingClientRect().height / a.height,
          tabFont: getComputedStyle(tab).fontSize,
        };
      });
      const second = await page
        .locator(`${FEED} article`)
        .nth(1)
        .locator("h3")
        .evaluate((h) => getComputedStyle(h).fontSize);
      if (width >= 1024) {
        expect(m.fontSize).toBe("42px");
        expect(second).toBe("23px");
        expect(m.border).toBe("2px");
        expect(m.tabFont).toBe("12px");
        expect(m.tabRatio).toBeGreaterThan(0.7);
      } else {
        expect(m.fontSize).toBe("21px");
        expect(second).toBe("21px");
        expect(m.border).toBe("1px");
        expect(m.tabRatio).toBeLessThan(0.5);
      }
    });
  });
}

test.describe("변형 6종 · 연결 줄 · 출처 스택 (1280)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("변형 렌더: 원제목·완장·이적 단계·Tier·인덱스 탭·연결 줄 8줄·상대 시간", async ({
    page,
  }) => {
    await openFeed(page);
    const feed = page.locator(FEED);
    await expect(feed.locator("article")).toHaveCount(23);
    // ① 라틴 원제목 · ⑥ 한국어 원제목 — lang 속성과 서체
    const latin = feed.locator("#c_6fa142d217 h3");
    await expect(latin).toHaveAttribute("lang", "en");
    expect(await latin.evaluate((h) => getComputedStyle(h).fontFamily)).toMatch(
      /^"?Barlow Condensed/,
    );
    const korean = feed.locator("#c_d8eac2777b h3");
    await expect(korean).toHaveAttribute("lang", "ko");
    expect(
      await korean.evaluate((h) => getComputedStyle(h).fontFamily),
    ).toMatch(/^"?EuroDigest Sans/);
    // ④ 한국 완장
    await expect(feed.locator("[title='한국 선수 관련']")).toHaveCount(5);
    // ③ 이적 단계 + Tier
    await expect(
      feed.getByRole("img", { name: "이적 단계: 결렬" }),
    ).toHaveCount(1);
    await expect(
      feed.getByRole("img", { name: "이적 단계: 공식 (4단계 중 4)" }),
    ).toHaveCount(1);
    await expect(
      page.locator(EDGE).getByRole("img", { name: /^이적 단계:/ }),
    ).toHaveCount(5);
    // 대회 2개 카드는 탭 2개(2px 간격으로 쌓음), 대회 없는 카드는 탭 없음
    const tabs = feed.locator("#c_b24a3b9263 [data-slot='index-tab']");
    await expect(tabs).toHaveCount(2);
    const [t1, t2] = [
      await tabs.nth(0).boundingBox(),
      await tabs.nth(1).boundingBox(),
    ];
    expect(Math.round((t2?.y ?? 0) - ((t1?.y ?? 0) + (t1?.height ?? 0)))).toBe(
      2,
    );
    await expect(
      feed.locator("#c_8630993971 [data-slot='index-tab']"),
    ).toHaveCount(0);
    // 연결 줄 4쌍 = 8줄
    await expect(feed.locator("article a[href^='#c_']")).toHaveCount(8);
    // 상대 시간(섬) + 절대 시각(정적)
    await expect(feed.locator("#c_f598c95798 time[data-rel]")).toHaveText(
      "11시간 전10.11 04:24",
    );
    // 요약 줄·AI 작성 라벨 없음
    await expect(feed.getByText("AI 작성")).toHaveCount(0);
  });

  test("연결 줄: 누르면 짝 카드로 이동하고 :target 도착 강조(--paper-2 면 + 왼쪽 4px 레드)", async ({
    page,
  }) => {
    await openFeed(page);
    const line = page
      .locator("#c_f598c95798")
      .getByRole("link", { name: "같은 소식 국내 보도 게재 번호 14 인터풋볼" });
    await expect(line).toContainText("↓");
    await line.click();
    await expect(page).toHaveURL(/#c_744396ca78$/);
    const target = page.locator("#c_744396ca78");
    await expect(target).toBeInViewport();
    const style = await target.evaluate((el) => ({
      matches: el.matches(":target"),
      bg: getComputedStyle(el).backgroundColor,
      shadow: getComputedStyle(el).boxShadow,
      paper2: getComputedStyle(document.documentElement)
        .getPropertyValue("--paper-2")
        .trim(),
    }));
    expect(style.matches).toBe(true);
    expect(style.shadow).toContain("inset");
    expect(style.bg).not.toBe("rgba(0, 0, 0, 0)");
    // 되돌아가는 줄은 ↑
    const back = target.getByRole("link", {
      name: "같은 소식 해외 보도 게재 번호 06 BBC Sport",
    });
    await expect(back).toContainText("↑");
    await back.click();
    await expect(page).toHaveURL(/#c_f598c95798$/);
  });

  test("'+N곳' 키보드: Enter로 펼치고 Tab으로 출처 행에 들어가며 Space로 접는다", async ({
    page,
  }) => {
    await openFeed(page);
    const button = page
      .locator("#c_f598c95798")
      .getByRole("button", { name: "+2곳 출처 더 보기" });
    const listId = await button.getAttribute("aria-controls");
    const list = page.locator(`#${listId}`);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(list).toBeHidden();
    const closedColor = await button.evaluate((b) => getComputedStyle(b).color);
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(list).toBeVisible();
    // 펼친 표시: 글자·밑줄이 --brand-accent-text·--brand-accent로 바뀐다
    expect(await button.evaluate((b) => getComputedStyle(b).color)).not.toBe(
      closedColor,
    );
    await page.keyboard.press("Tab");
    const first = list.getByRole("link").first();
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute("target", "_blank");
    await expect(list.getByRole("link")).toHaveCount(3);
    await button.focus();
    await page.keyboard.press("Space");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(list).toBeHidden();
  });

  test("경계 사례: 출처 8곳(+6곳 — 같은 매체 한 번) · 태그 0개 · 대회 0개", async ({
    page,
  }) => {
    await openFeed(page);
    const many = page.locator("#c_e000000001");
    const button = many.getByRole("button", { name: "+6곳 출처 더 보기" });
    await button.click();
    await expect(
      page
        .locator(`#${await button.getAttribute("aria-controls")}`)
        .getByRole("link"),
    ).toHaveCount(8);
    const bare = page.locator("#c_e000000002");
    await expect(bare.getByRole("list", { name: "태그" })).toHaveCount(0);
    await expect(bare.locator("[data-slot='index-tab']")).toHaveCount(0);
    await expect(bare).not.toContainText("specimen-unknown");
  });
});

test.describe("'+N건' — 같은 매체 기사만 더 있는 카드(사용자 결정 2026-10-19)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("'+2건' 버튼 → 같은 펼침 목록(기사 3행), 화면 밖 '같은 매체 기사 더 보기'", async ({
    page,
  }) => {
    await openFeed(page);
    const card = page.locator("#c_e000000003");
    const button = card.getByRole("button", {
      name: "+2건 같은 매체 기사 더 보기",
    });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const list = page.locator(`#${await button.getAttribute("aria-controls")}`);
    await expect(list.getByRole("link")).toHaveCount(3);
    await expect(list.getByRole("link").first()).toContainText("BBC Sport");
    // 다른 매체가 섞이면 '+N곳'(같은 매체 기사도 목록에는 모두)
    const mixed = page
      .locator("#c_e000000001")
      .getByRole("button", { name: "+6곳 출처 더 보기" });
    await mixed.click();
    await expect(
      page
        .locator(`#${await mixed.getAttribute("aria-controls")}`)
        .getByRole("link"),
    ).toHaveCount(8);
  });
});

test.describe("44px · 시각 안정성", () => {
  for (const width of [375, 1024, 1280] as const) {
    test(`터치 타깃 44px — 제목·'+N곳'·펼친 출처 행·연결 줄 (${width})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await openFeed(page);
      await expandAll(page);
      const failures = await touchTargetFailures(
        page,
        [FEED, EDGE].map((sel) => `${sel} a[href], ${sel} button`).join(", "),
      );
      expect(failures).toEqual([]);
    });
  }

  test("공유 앵커로 연 375 화면 — 상대 시간이 채워져도 카드 기하가 그대로(자리 예약)", async ({
    browser,
    page,
  }) => {
    // 정적 HTML(JS 없음 — 상대 시간 칸이 빈 채 \"00시간 전\" 자리만 잡힘)과 섬이 \"10시간 전\"을 채운 화면을, 웹폰트가 모두 적용된 뒤
    // 같은 카드의 높이·시각 위치로 비교한다. 예전 PerformanceObserver CLS 측정은 CI처럼 한글 폴백 글꼴이 없는 환경에서 폰트 교체
    // 이동까지 더해져 0.36~0.38로 실패했다(2026-10-19 CI — 폰트 지연 CLS는 tests/e2e/fonts.spec.ts 몫). 자리를 미리 잡지 않으면
    // 긴 라틴 매체명 + +N곳 카드에서 시각이 다음 줄로 넘어가 카드가 커진다(M1-31 실측 0.16).
    const ID = "#c_114856ecfb";
    const geometry = (p: Page) =>
      p.evaluate((id) => {
        const card = document.querySelector<HTMLElement>(id);
        const time = card?.querySelector<HTMLElement>("time[data-rel]");
        if (!card || !time) return null;
        const c = card.getBoundingClientRect();
        const t = time.getBoundingClientRect();
        return {
          cardHeight: Math.round(c.height * 2) / 2,
          timeTop: Math.round((t.top - c.top) * 2) / 2,
          timeLeft: Math.round((t.left - c.left) * 2) / 2,
        };
      }, ID);

    await page.setViewportSize({ width: 375, height: 812 });
    await openFeed(page, ID);
    await expect(
      page.locator(`${ID} time[data-rel] [data-rel-out]`),
    ).toHaveText("10시간 전");
    const filled = await geometry(page);

    const still = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 375, height: 812 },
    });
    try {
      const staticPage = await still.newPage();
      const response = await staticPage.goto(page.url());
      expect(response?.status()).toBe(200);
      await waitForFonts(staticPage);
      await expect(
        staticPage.locator(`${ID} time[data-rel] [data-rel-out]`),
      ).toHaveText("");
      const empty = await geometry(staticPage);
      expect(filled).not.toBeNull();
      expect(filled).toEqual(empty);
    } finally {
      await still.close();
    }
  });
});

for (const colorScheme of SCHEMES) {
  test(`axe WCAG 2.1 A/AA 위반 0 — '+N곳' 모두 펼침·도착 강조 (${colorScheme})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await openFeed(page, "#c_744396ca78");
    await expandAll(page);
    const { violations } = await new AxeBuilder({ page })
      .include([FEED, EDGE])
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
