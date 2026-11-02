import { readdirSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { basePath, outDir } from "./support/site";

// 결과 가리기(M4-15 — PRD FR-37 · D64 ④ · D67 ④, DECISIONS 'M4 미니 게이트' A, DESIGN §9.3 '결과 가림' 3행).
// 빌드 결과(out/) 대상. 가림은 `<html data-spoiler="on">`(초기 스크립트가 `ed-spoiler`로 단다) + CSS — 가린 값은 display:none이라 화면 ·
// 접근성 트리 · innerText 어디에도 없다. 펼치기는 단위(칸 · 줄 · 카드 · 표 · 패널) 하나만, 포커스는 드러난 값으로.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const VALUE = '[data-slot="result-value"],[data-spoil-value]';

/** 가장 최근 주간 리포트 */
const weeks = (() => {
  try {
    return readdirSync(path.join(outDir, "korean-players/weekly"))
      .filter((n) => /^\d{4}-\d{2}$/.test(n))
      .sort();
  } catch {
    return [];
  }
})();

const PAGES: ReadonlyArray<[name: string, url: string]> = [
  ["홈", "./"],
  ["뉴스", "news/"],
  ["대회", "competitions/laliga/"],
  ["팀", "teams/atletico-madrid/"],
  ["선수 목록", "korean-players/"],
  ["선수 상세", "korean-players/lee-kang-in/"],
  ...(weeks.length > 0
    ? [["주간", `korean-players/weekly/${weeks.at(-1)}/`] as [string, string]]
    : []),
  ["이적", "transfers/"],
];

async function spoilerOn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ed-spoiler", "on");
    } catch {
      /* 저장소가 막혀도 검사는 아래 속성 검사에서 실패한다 */
    }
  });
}

/**
 * 가림 상태 요약 — 값 · 표식 · 단위. 다른 이유로 숨은 요소(접힌 탭 패널 · 지난 라운드 · 375 펼침 행 · 닫힌 타임라인)와 섞이지 않게
 * 요소 자신의 computed display로 가림 여부를 본다(가림 규칙은 값 · 표식 자신에 display: none을 건다).
 */
function audit(page: Page) {
  return page.evaluate((valueSel) => {
    const own = (el: Element) => getComputedStyle(el).display !== "none";
    const onScreen = (el: Element) => el.getClientRects().length > 0;
    const values = [...document.querySelectorAll(valueSel)];
    const reveals = [...document.querySelectorAll("[data-spoil-reveal]")];
    // 가려진 값마다 펼칠 길(그 값을 품은 단위 안의 '보기' — 표식이 살아 있음)이 있는가. 팀시트 부제 스코어만 예외(아래 일정·결과에 같은 경기)
    const orphan = values
      .filter((v) => !own(v))
      .filter((v) => {
        let scope = v.closest("[data-spoil]");
        while (scope) {
          const buttons = [...scope.querySelectorAll("[data-spoil-reveal]")];
          if (
            buttons.some(
              (b) => own(b) && own(b.closest("[data-spoil-mask]") ?? b),
            )
          )
            return false;
          scope = scope.parentElement?.closest("[data-spoil]") ?? null;
        }
        return !v.closest('[aria-labelledby="team-sheet-h"]');
      })
      .map((v) => v.outerHTML.slice(0, 120));
    return {
      attr: document.documentElement.getAttribute("data-spoiler"),
      values: values.length,
      shownValues: values.filter(own).length,
      onScreenValues: values.filter(onScreen).length,
      masks: [...document.querySelectorAll("[data-spoil-mask]")].filter(own)
        .length,
      reveals: reveals.filter(onScreen).length,
      orphan,
      // 숨은 본문(카드 제목 · 5줄 문장) — 접근성 트리 검사용 표본
      hiddenTexts: [...document.querySelectorAll("[data-spoil-value]")]
        .filter((v) => !own(v))
        .map((v) => (v.textContent ?? "").trim())
        .filter((t) => t.length > 8)
        .slice(0, 6),
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      small: reveals
        .filter(onScreen)
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.height < 44 || r.width < 44;
        })
        .map((el) => el.getAttribute("aria-label") ?? el.textContent),
    };
  }, VALUE);
}

test.describe("결과 가리기 — 기본 꺼짐(D3)", () => {
  for (const [name, url] of PAGES) {
    test(`${name} — 값이 모두 보이고 표식 0, 스위치 꺼짐`, async ({ page }) => {
      await page.goto(url);
      const a = await audit(page);
      expect(a.attr).toBeNull();
      expect(a.shownValues).toBe(a.values);
      expect(a.masks).toBe(0);
      const sw = page.getByRole("switch", { name: "결과 가리기" });
      await expect(sw).toHaveAttribute("aria-checked", "false");
    });
  }
});

test.describe("결과 가리기 켬 — 화면 × 폭 × 테마", () => {
  for (const [name, url] of PAGES) {
    for (const width of [375, 768, 1024, 1280]) {
      test(`${name} ${width}px — 값 숨김 · 펼칠 길 · 넘침 0 · 44px · axe 0(라이트 · 다크)`, async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== "desktop", "폭은 테스트가 정한다");
        await spoilerOn(page);
        await page.setViewportSize({ width, height: 800 });
        for (const colorScheme of ["light", "dark"] as const) {
          await page.emulateMedia({ colorScheme });
          await page.goto(url);
          await expect(
            page.getByRole("switch", { name: "결과 가리기" }),
          ).toHaveAttribute("aria-checked", "true");
          const a = await audit(page);
          expect(a.attr).toBe("on");
          expect(a.values).toBeGreaterThan(0);
          expect(a.shownValues).toBe(0);
          expect(a.reveals).toBeGreaterThan(0);
          expect(a.orphan).toEqual([]);
          expect(a.overflow).toBe(0);
          expect(a.small).toEqual([]);
          // 접근성 트리에도 없다(블러가 아니라 display:none)
          const tree = await page.locator("body").ariaSnapshot();
          for (const text of a.hiddenTexts)
            expect(tree.includes(text.slice(0, 24))).toBe(false);
          const { violations } = await new AxeBuilder({ page })
            .withTags(WCAG_TAGS)
            .analyze();
          expect(violations.map((v) => `${colorScheme} ${v.id}`)).toEqual([]);
        }
      });
    }
  }
});

test.describe("펼치기 — 그 단위만 · 드러난 값으로 포커스", () => {
  for (const [name, url] of PAGES) {
    test(`${name} — 첫 '보기'`, async ({ page }) => {
      await spoilerOn(page);
      await page.goto(url);
      const button = page
        .locator("[data-spoil-reveal]")
        .filter({ visible: true })
        .first();
      const before = await audit(page);
      const scopeOpened = await button.evaluate((b) => {
        (b as HTMLElement).click();
        const scope = b.closest("[data-spoil]")!;
        const active = document.activeElement;
        return {
          open: scope.hasAttribute("data-spoil-open"),
          focusInside: !!active && scope.contains(active) && active !== b,
          shownValues: [
            ...scope.querySelectorAll(
              '[data-slot="result-value"],[data-spoil-value]',
            ),
          ].filter((v) => v.getClientRects().length > 0).length,
          buttonShown: (b as HTMLElement).getClientRects().length > 0,
        };
      });
      expect(scopeOpened.open).toBe(true);
      expect(scopeOpened.focusInside).toBe(true);
      expect(scopeOpened.shownValues).toBeGreaterThan(0);
      expect(scopeOpened.buttonShown).toBe(false);
      const after = await audit(page);
      // 다른 단위는 그대로 — 드러난 값은 그 단위 것뿐
      expect(after.onScreenValues).toBe(scopeOpened.shownValues);
      expect(after.reveals).toBeLessThan(before.reveals);
    });
  }

  test("5줄 '모두 보기' — 줄이 모두 드러나고 안내 띠가 사라진다, 첫 문장으로 포커스", async ({
    page,
  }) => {
    await spoilerOn(page);
    await page.goto("./");
    const veil = page.locator(
      '[data-slot="today-brief"] [data-slot="spoiler-veil"]',
    );
    test.skip((await veil.count()) === 0, "결과 아닌 줄이 있는 호");
    await veil.getByRole("button", { name: /모두 보기/ }).click();
    await expect(veil).toBeHidden();
    const texts = page.locator(
      '[data-slot="today-brief"] [data-slot="brief-text"]',
    );
    for (const t of await texts.all()) await expect(t).toBeVisible();
    await expect(texts.first()).toBeFocused();
  });

  test("순위표 '변동 보기' — 표 하나가 드러나고(▲▼ · 최근 5경기) 표로 포커스", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "최근 5경기 열은 1024 이상");
    await spoilerOn(page);
    await page.goto("competitions/laliga/");
    const table = page.locator('[data-slot="standings"]').first();
    await expect(table.locator("[data-trend]").first()).toBeHidden();
    await page.getByRole("button", { name: "라리가 순위 변동 보기" }).click();
    await expect(table).toBeFocused();
    await expect(table.locator("[data-trend]").first()).toBeAttached();
    const shown = await table.evaluate((t) => ({
      form: [
        ...t.querySelectorAll('[role="img"][data-slot="result-value"]'),
      ].filter((v) => v.getClientRects().length > 0).length,
      hatch: [...t.querySelectorAll("[data-spoil-mask]")].filter(
        (v) => v.getClientRects().length > 0,
      ).length,
    }));
    expect(shown.form).toBeGreaterThan(0);
    expect(shown.hatch).toBe(0);
  });
});

test.describe("스위치 — 켜고 끄기 · 새로고침 유지 · 토스트", () => {
  test("켜면 가리고 저장, 끄면 원래대로(펼친 칸도 접힘 기억 없음), 새로고침 뒤에도 유지", async ({
    page,
  }) => {
    await page.goto("korean-players/");
    const sw = page.getByRole("switch", { name: "결과 가리기" });
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await expect(page.locator('[data-slot="toaster"]')).toContainText(
      "결과 가리기를 켰어요.",
    );
    expect(await page.evaluate(() => localStorage.getItem("ed-spoiler"))).toBe(
      "on",
    );
    let a = await audit(page);
    expect(a.shownValues).toBe(0);

    // 하나 펴고 → 끄면 모두 보임 → 다시 켜면 그 칸도 다시 가려진다
    await page
      .locator("[data-spoil-reveal]")
      .filter({ visible: true })
      .first()
      .click();
    expect((await audit(page)).shownValues).toBeGreaterThan(0);
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    a = await audit(page);
    expect(a.shownValues).toBe(a.values);
    expect(a.masks).toBe(0);
    expect(
      await page.evaluate(() => localStorage.getItem("ed-spoiler")),
    ).toBeNull();
    await sw.click();
    expect((await audit(page)).shownValues).toBe(0);

    await page.reload();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    expect((await audit(page)).shownValues).toBe(0);
  });

  test("다른 페이지로 이동(앱 라우터)해도 켜진 상태 그대로", async ({
    page,
  }) => {
    await spoilerOn(page);
    await page.goto("./");
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "한국 선수" })
      .filter({ visible: true })
      .first()
      .click();
    await page.waitForURL(/korean-players\/$/);
    const a = await audit(page);
    expect(a.attr).toBe("on");
    expect(a.shownValues).toBe(0);
  });
});

test.describe("첫 로드(켬) 레이아웃 이동 ≤ 0.05 — 가림은 첫 페인트 전 CSS", () => {
  for (const url of ["./", "competitions/laliga/", "korean-players/"]) {
    test(url, async ({ page }) => {
      await spoilerOn(page);
      // 웹폰트 교체 이동은 fonts.spec.ts가 본다 — 여기서는 가림 자체의 이동만
      await page.route(`**${basePath}/fonts/**`, (route) => route.abort());
      await page.addInitScript(() => {
        const w = window as unknown as { __cls: number };
        w.__cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
          })[])
            if (!e.hadRecentInput) w.__cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      const cls = await page.evaluate(
        () => (window as unknown as { __cls: number }).__cls,
      );
      expect(cls).toBeLessThanOrEqual(0.05);
    });
  }
});
