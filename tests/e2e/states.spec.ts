import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { loadLatestNews } from "../../src/lib/data/news";
import { loadProdRuns } from "../../src/lib/data/runs";
import { issueMeta } from "../../src/lib/issue";
import {
  formatKst,
  kstDayRangeUtc,
  publishSlot,
  PUBLISH_GRACE_MINUTES,
  shiftDate,
  zonedToUtcIso,
} from "../../src/lib/time";

import { basePath } from "./support/site";

// 상태 화면 e2e (M1-37 — PRD DR-07, DESIGN §9.3 상태 화면 ③ 발행 지연 안내 · ④ 오프라인 띠) — 일반 빌드(out/)의 실제 최신 호.
// 지연 판정은 가짜 시계(page.clock — Date만 고정)로 본다: 최신 호 다음 날의 계절별 공개 목표(07:00/07:30) + 15분 경계를 data/에서 계산한다
// (실데이터는 날마다 바뀐다 — 하드코딩하지 않는다). 오프라인은 context.setOffline(브라우저 online·offline 이벤트).
// 판정 구간 계산(계절 경계 10-25/10-26 · +15분 경계 · 자정~목표)과 인라인 스크립트 = 섬 함수 동치는 단위 테스트(tests/issue-late.test.ts).
// 5줄 자리 오류·비시즌은 실데이터에 없어 단위(today-brief·brief-slot)·견본(e2e-specimen/states.spec.ts)이 본다.

const latest = loadLatestNews();
const issue = latest ? issueMeta(latest, loadProdRuns()) : null;
const DATE = latest?.date ?? null;
const NEXT = DATE ? shiftDate(DATE, 1) : null;
/** 다음 호 공개 목표 + 15분(D48) — 이 순간부터 지연 안내 */
const LATE_FROM = NEXT
  ? Date.parse(publishSlot(NEXT).publishTarget) + PUBLISH_GRACE_MINUTES * 60_000
  : 0;
const kst = (date: string, hhmm: string) =>
  new Date(zonedToUtcIso(`${date}T${hhmm}`, "Asia/Seoul"));

const notice = (page: Page) => page.locator("[data-slot=issue-late-box]");
const band = (page: Page) => page.locator("[data-slot=offline-band-body]");

/** 레이아웃 이동 합(사용자 입력 직후 제외) — 첫 로드부터 */
async function trackCls(page: Page): Promise<void> {
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
}
const cls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __cls: number }).__cls);

/**
 * 웹폰트 요청을 막는다(abort) — 폴백 글꼴로만 그려 폰트 교체 이동 없이 지연 안내 자체의 레이아웃 이동만 잰다. 한글 폴백 글꼴이 없는
 * CI 러너에서는 웹폰트가 늦게 도착하며 바뀌는 이동(0.166 — run 40200106751)이 CLS에 섞여 타이밍에 따라 흔들렸다. 폰트 교체 이동은
 * fonts.spec.ts가 따로 본다.
 */
async function blockWebFonts(page: Page): Promise<void> {
  await page.route(`**${basePath}/fonts/**`, (route) => route.abort());
}

async function openAt(page: Page, url: string, at: Date): Promise<void> {
  await page.clock.setFixedTime(at);
  await page.goto(url);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

test.describe("발행 지연 안내(DESIGN §9.3 ③ — 오늘 공개 목표 + 15분 뒤인데 최신 호가 오늘보다 앞)", () => {
  test.skip(!DATE || !NEXT || !issue, "data/news에 발행된 호가 없다");

  for (const url of ["./", "news/"]) {
    test(`${url} — 목표 + 15분 경계 전 숨김 · 경계부터 보임(문구 = 최신 호 날짜·호수) · 첫 로드 CLS ≤ 0.05`, async ({
      page,
    }) => {
      // 첫 탐색부터 막는다 — 앞 탐색이 받은 폰트가 캐시에서 늦게 적용되는 경우도 없게
      await blockWebFonts(page);
      await openAt(page, url, new Date(LATE_FROM - 1000));
      await expect(notice(page)).toBeHidden();
      await expect(page.locator("html")).not.toHaveAttribute("data-issue-late");

      await trackCls(page);
      await openAt(page, url, new Date(LATE_FROM));
      await expect(notice(page)).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-issue-late", "");
      await expect(notice(page)).toContainText(
        "오늘 호 발행이 늦어지고 있어요",
      );
      const label = formatKst(kstDayRangeUtc(DATE!).start, "date");
      await expect(notice(page)).toContainText(
        `지금 보이는 지면은 마지막으로 발행된 ${label}${issue!.no !== null ? ` 제 ${issue!.no}호` : " 호"}예요.`,
      );
      // main 맨 앞(첫 섹션 위), 바깥 상자는 role=status
      const first = await page.evaluate(() => {
        const main = document.querySelector("main#main");
        const status = main?.querySelector("[data-slot=issue-late]");
        return {
          role: status?.getAttribute("role"),
          first: main?.firstElementChild === status,
        };
      });
      expect(first).toEqual({ role: "status", first: true });
      // 인라인 스크립트가 첫 페인트 전에 정한다 — 상자가 들어오며 지면을 밀지 않는다(웹폰트는 막았다 — 폰트 교체 이동 제외)
      await page.waitForTimeout(300);
      expect(await cls(page)).toBeLessThanOrEqual(0.05);
    });
  }

  test("최신 호가 오늘이면 · 자정~목표 + 15분 사이면 안내 없음 · 다음 날도 계속 늦음", async ({
    page,
  }) => {
    // 최신 호 당일 낮 — 오늘 호가 있다
    await openAt(page, "./", kst(DATE!, "12:00"));
    await expect(notice(page)).toBeHidden();
    // 다음 날 00:30 — 아직 목표 전
    await openAt(page, "./", kst(NEXT!, "00:30"));
    await expect(notice(page)).toBeHidden();
    // 다음 날 23:59 — 늦음
    await openAt(page, "./", kst(NEXT!, "23:59"));
    await expect(notice(page)).toBeVisible();
    // 이틀 뒤 목표 + 15분 뒤 — 늦음(호가 두 번 빠짐)
    const after = shiftDate(DATE!, 2);
    await openAt(
      page,
      "./",
      new Date(
        Date.parse(publishSlot(after).publishTarget) +
          PUBLISH_GRACE_MINUTES * 60_000,
      ),
    );
    await expect(notice(page)).toBeVisible();
  });

  test("날짜 아카이브(지난 호·최신 날짜 페이지)·소개에는 안내가 없다", async ({
    page,
  }) => {
    for (const url of [`news/${DATE}/`, "about/"]) {
      await openAt(page, url, new Date(LATE_FROM + 3_600_000));
      await expect(page.locator("[data-slot=issue-late]"), url).toHaveCount(0);
    }
  });

  test("클라이언트 이동(next/link)으로 들어온 홈도 섬이 판정해 안내를 보인다", async ({
    page,
  }, testInfo) => {
    await openAt(page, "about/", new Date(LATE_FROM + 3_600_000));
    await page.waitForLoadState("networkidle");
    const nav =
      testInfo.project.name === "mobile"
        ? page.locator('nav[aria-label="하단 탭"]')
        : page.locator('nav[aria-label="주요 메뉴"]');
    await nav.getByRole("link", { name: "홈" }).click();
    await page.waitForURL((u) => u.pathname.endsWith("/euro-digest/"));
    await expect(notice(page)).toBeVisible();
  });
});

test.describe("오프라인 띠(DESIGN §9.3 ④ — online·offline 이벤트)", () => {
  for (const url of ["./", "news/", "about/"]) {
    test(`${url} — 끊기면 보이고 다시 연결되면 숨김 · 이동 0 · 하단 탭 위(1023 이하)/화면 아래(1024 이상)`, async ({
      page,
      context,
    }, testInfo) => {
      await trackCls(page);
      await page.goto(url);
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await expect(band(page)).toBeHidden();
      const before = await cls(page);

      await context.setOffline(true);
      await expect(band(page)).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-offline", "");
      await expect(band(page)).toContainText("오프라인");
      await expect(band(page)).toContainText(
        "다른 페이지는 열리지 않을 수 있어요",
      );
      await expect(page.locator("[data-slot=offline-band]")).toHaveAttribute(
        "role",
        "status",
      );
      const geo = await page.evaluate(() => {
        const b = document
          .querySelector("[data-slot=offline-band-body]")!
          .getBoundingClientRect();
        const tabs = document
          .querySelector('nav[aria-label="하단 탭"]')!
          .getBoundingClientRect();
        return {
          top: b.top,
          bottom: b.bottom,
          height: b.height,
          left: b.left,
          right: b.right,
          tabsTop: tabs.height > 0 ? tabs.top : null,
          vh: window.innerHeight,
          vw: document.documentElement.clientWidth,
          bandVar: getComputedStyle(document.documentElement)
            .getPropertyValue("--offline-band-h")
            .trim(),
        };
      });
      if (testInfo.project.name === "mobile") {
        expect(Math.abs(geo.bottom - (geo.tabsTop ?? 0))).toBeLessThanOrEqual(
          1,
        );
      } else {
        expect(geo.tabsTop).toBeNull();
        expect(Math.abs(geo.bottom - geo.vh)).toBeLessThanOrEqual(1);
      }
      expect(geo.left).toBeLessThanOrEqual(0.5);
      expect(geo.right).toBeGreaterThanOrEqual(geo.vw - 0.5);
      expect(Math.abs(parseFloat(geo.bandVar) - geo.height)).toBeLessThan(1);
      // 띠는 흐름 끝(하단 탭 앞)의 sticky — 위 지면이 밀리지 않는다
      await page.waitForTimeout(300);
      expect((await cls(page)) - before).toBeLessThanOrEqual(0.001);

      await context.setOffline(false);
      await expect(band(page)).toBeHidden();
      await expect(page.locator("html")).not.toHaveAttribute("data-offline");
    });
  }

  test("글자 크기를 키워 하단 탭이 커져도 띠는 탭 바로 위(겹침 없음 — 섬이 잰 탭 높이)", async ({
    page,
    context,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "하단 탭은 1023 이하");
    await page.goto("./");
    // 브라우저 기본 글자 크기 20px(rem 기준 탭 최소 높이가 커진다)
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "20px";
    });
    await context.setOffline(true);
    await expect(band(page)).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const b = document
            .querySelector("[data-slot=offline-band-body]")!
            .getBoundingClientRect();
          const t = document
            .querySelector('nav[aria-label="하단 탭"]')!
            .getBoundingClientRect();
          return {
            gap: Math.round((t.top - b.bottom) * 10) / 10,
            tabs: t.height,
          };
        }),
      )
      .toMatchObject({ gap: 0 });
    const tabs = await page
      .locator('nav[aria-label="하단 탭"]')
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(tabs).toBeGreaterThan(59);
  });

  test("끊긴 동안 토스트는 띠 위로 올라간다(겹치지 않음)", async ({
    page,
    context,
  }) => {
    await page.goto("./");
    await context.setOffline(true);
    await expect(band(page)).toBeVisible();
    const box = await page.evaluate(() => {
      const toaster = document
        .querySelector("[data-slot=toaster]")!
        .getBoundingClientRect();
      const b = document
        .querySelector("[data-slot=offline-band-body]")!
        .getBoundingClientRect();
      return { toasterBottom: toaster.bottom, bandTop: b.top };
    });
    expect(box.toasterBottom).toBeLessThanOrEqual(box.bandTop + 0.5);
  });
});

test.describe("상태 화면이 보이는 상태의 접근성·가로 넘침", () => {
  test.skip(!DATE, "data/news에 발행된 호가 없다");

  for (const colorScheme of ["light", "dark"] as const) {
    for (const url of ["./", "news/"]) {
      test(`${url} (${colorScheme}) — 지연 안내 + 오프라인 띠: axe WCAG 2.1 A/AA 위반 0건`, async ({
        page,
        context,
      }) => {
        await page.emulateMedia({ colorScheme });
        await openAt(page, url, new Date(LATE_FROM + 60_000));
        await context.setOffline(true);
        await expect(notice(page)).toBeVisible();
        await expect(band(page)).toBeVisible();
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(
          violations.map(
            (v) =>
              `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
          ),
        ).toEqual([]);
      });
    }
  }

  for (const width of [375, 1023, 1024, 1279, 1280]) {
    test(`${width}px — 지연 안내 + 오프라인 띠: 가로 넘침 0`, async ({
      page,
      context,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== "desktop",
        "폭별 검사는 desktop 프로젝트에서 한 번",
      );
      await page.setViewportSize({ width, height: 900 });
      for (const url of ["./", "news/"]) {
        await openAt(page, url, new Date(LATE_FROM + 60_000));
        await context.setOffline(true);
        await expect(notice(page)).toBeVisible();
        await expect(band(page)).toBeVisible();
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
          url,
        ).toBe(0);
        await context.setOffline(false);
      }
    });
  }
});
