/**
 * 쿠키리스 분석 e2e (M5-04, PRD NFR-08 · §11.2) — src/lib/analytics.ts(진입점) · src/lib/goatcounter.ts(지연 조각)
 *
 * - 로컬(127.0.0.1 — e2e 기본 주소): 스크립트 · 구현 조각을 싣지 않고 GoatCounter로 아무 요청도 하지 않는다.
 * - 공개 주소 흉내: 빌드 HTML의 canonical 출처(SITE_URL — 기본 https://sguys99.github.io)로 연 요청을 로컬 서버(out/)로 돌려 준다
 *   (`context.route` — 실제 GitHub Pages에는 가지 않는다). 그 위에서 스크립트 태그(버전 고정 + SRI) · 페이지뷰(첫 로드 · 클라이언트 이동,
 *   중복 없음 · 쿼리 · 해시 없음) · 이벤트 4종(원문 · RSS/webcal · PWA 설치 · 마이 팀 저장)을 본다.
 * - GoatCounter 요청(`gc.zgo.at` 스크립트 · `*.goatcounter.com` 집계)은 모두 route로 끊는다 — 실제 서버로 보내지 않는다. count.js 대신
 *   가짜 `window.goatcounter.count`를 첫 스크립트 전에 넣어 호출을 모은다(스크립트가 막혀도 가드가 이 객체를 쓴다).
 * - 막힘(광고 차단 흉내): 가짜 객체 없이 스크립트가 끊겨도 페이지 오류 0 · 링크 동작 그대로.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { basePath, outDir } from "./support/site";

interface CountCall {
  path: string;
  title?: string;
  referrer?: string;
  event?: boolean;
}

const GOATCOUNTER_REQUEST =
  /^https:\/\/(?:gc\.zgo\.at|[\w-]+\.goatcounter\.com)\//;
const SCRIPT = "https://gc.zgo.at/count.v5.js";

/** 공개 출처 — 빌드 HTML의 canonical(SITE_URL + basePath)에서 */
function publicOrigin(): string {
  const html = readFileSync(path.join(outDir, "index.html"), "utf8");
  const href = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  if (!href) throw new Error("out/index.html에 canonical이 없음");
  return new URL(href).origin;
}

/** GoatCounter 요청을 끊고 기록한다 */
async function blockGoatCounter(context: BrowserContext): Promise<string[]> {
  const requests: string[] = [];
  await context.route(GOATCOUNTER_REQUEST, (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  return requests;
}

/** 공개 출처 요청을 로컬 서버로 돌려 준다 */
async function servePublicOrigin(
  context: BrowserContext,
  localBase: string,
): Promise<string> {
  const origin = publicOrigin();
  const local = new URL(localBase).origin;
  await context.route(`${origin}${basePath}/**`, async (route) => {
    const url = new URL(route.request().url());
    try {
      const response = await route.fetch({
        url: `${local}${url.pathname}${url.search}`,
      });
      await route.fulfill({
        status: response.status(),
        headers: response.headers(),
        body: await response.body(),
      });
    } catch {
      // 테스트가 끝나거나 페이지가 떠나 요청이 버려진 경우(응답 폐기) — 검사 대상이 아니다
      await route.abort().catch(() => {});
    }
  });
  return `${origin}${basePath}`;
}

/** 가짜 count.js — 호출을 `window.__gc`에 모은다 */
async function fakeGoatCounter(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as {
      __gc: unknown[];
      goatcounter: { count(vars: unknown): void };
    };
    w.__gc = [];
    w.goatcounter = { count: (vars) => void w.__gc.push(vars) };
  });
}

async function calls(page: Page): Promise<CountCall[]> {
  return page.evaluate(
    () => (window as unknown as { __gc?: CountCall[] }).__gc ?? [],
  );
}

async function waitForCall(
  page: Page,
  match: (call: CountCall) => boolean,
): Promise<CountCall> {
  let found: CountCall | undefined;
  await expect
    .poll(async () => {
      found = (await calls(page)).find(match);
      return Boolean(found);
    })
    .toBe(true);
  return found!;
}

/** 링크 이동을 막는다(외부 원문 · webcal · RSS로 떠나지 않게) — 위임 리스너(문서 캡처 단계)는 그 전에 돈다 */
async function preventNavigation(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.addEventListener("click", (e) => e.preventDefault()),
  );
}

function firstTeam(): string {
  const team = readdirSync(path.join(outDir, "teams"), {
    withFileTypes: true,
  }).find((d) => d.isDirectory());
  if (!team) throw new Error("out/teams에 팀 페이지가 없음");
  return team.name;
}

test.describe("로컬 주소에서는 꺼짐", () => {
  test("스크립트 · 구현 조각 · GoatCounter 요청 0, 원문 클릭도 보내지 않음", async ({
    page,
    context,
  }) => {
    const requests = await blockGoatCounter(context);
    await fakeGoatCounter(context);
    const chunks: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/_next/static/chunks/")) chunks.push(req.url());
    });
    await page.goto("news/");
    await page.waitForLoadState("load");
    await preventNavigation(page);
    await page.locator('a[data-track="out"]:visible').first().click();
    await page.waitForTimeout(300);

    await expect(page.locator('script[src*="gc.zgo.at"]')).toHaveCount(0);
    expect(requests).toEqual([]);
    expect(await calls(page)).toEqual([]);
    // 구현 조각(GoatCounter 엔드포인트 문자열을 가진 청크)을 받지 않았다
    for (const url of chunks) {
      const body = readFileSync(
        path.join(outDir, new URL(url).pathname.slice(basePath.length)),
        "utf8",
      );
      expect(body, url).not.toContain("count.v5.js");
    }
  });
});

test.describe("공개 주소(흉내)", () => {
  test.beforeEach(async ({ context }) => {
    await blockGoatCounter(context);
  });

  test("버전 고정 스크립트 + SRI, 페이지뷰는 첫 로드 · 클라이언트 이동마다 한 번, 쿼리 · 해시 없이", async ({
    page,
    context,
    baseURL,
  }) => {
    await fakeGoatCounter(context);
    const site = await servePublicOrigin(context, baseURL!);
    const sitePath = new URL(site).pathname;

    await page.goto(`${site}/`);
    const script = page.locator(`script[src="${SCRIPT}"]`);
    await expect(script).toHaveCount(1);
    await expect(script).toHaveAttribute(
      "integrity",
      /^sha384-[A-Za-z0-9+/]{64}$/,
    );
    await expect(script).toHaveAttribute("crossorigin", "anonymous");
    await expect(script).toHaveAttribute(
      "data-goatcounter",
      "https://euro-digest.goatcounter.com/count",
    );
    await expect(script).toHaveAttribute(
      "data-goatcounter-settings",
      '{"no_onload":true}',
    );

    const home = await waitForCall(page, (c) => c.path === `${sitePath}/`);
    expect(home.event).toBeUndefined();
    expect(home.title).toBe(await page.title());

    // 클라이언트 이동(next/link) — 새 path 한 번, referrer = 직전 페이지
    await page.locator(`a[href="${sitePath}/news/"]:visible`).first().click();
    await page.waitForURL(`${site}/news/`);
    const news = await waitForCall(page, (c) => c.path === `${sitePath}/news/`);
    expect(news.referrer).toBe(`${site}/`);
    await expect(page).toHaveTitle(news.title ?? "");

    // 같은 페이지 안 해시 이동은 새 페이지뷰가 아니다
    await page.evaluate(() => {
      location.hash = "#top";
    });
    await page.waitForTimeout(300);
    const views = (await calls(page)).filter((c) => !c.event);
    expect(views.map((c) => c.path)).toEqual([
      `${sitePath}/`,
      `${sitePath}/news/`,
    ]);
  });

  test("쿼리(팔로우 공유 · 필터)와 해시는 path · referrer로 새지 않는다", async ({
    page,
    context,
    baseURL,
  }) => {
    await fakeGoatCounter(context);
    const site = await servePublicOrigin(context, baseURL!);
    const sitePath = new URL(site).pathname;
    await page.goto(`${site}/my/?t=arsenal&p=son-heung-min#top`);
    const view = await waitForCall(page, (c) => c.path === `${sitePath}/my/`);
    for (const call of await calls(page)) {
      expect(`${call.path} ${call.referrer ?? ""}`).not.toMatch(/[?#]|arsenal/);
    }
    expect(view.title).not.toMatch(/arsenal|son-heung-min/);
  });

  test("이벤트 4종 — 원문(호스트만) · RSS · webcal · .ics · PWA 설치 · 마이 팀 저장", async ({
    page,
    context,
    baseURL,
  }) => {
    await fakeGoatCounter(context);
    const site = await servePublicOrigin(context, baseURL!);
    const sitePath = new URL(site).pathname;

    // 원문 링크 — out/{호스트}
    await page.goto(`${site}/news/`);
    await waitForCall(page, (c) => c.path === `${sitePath}/news/`);
    await preventNavigation(page);
    const outLink = page.locator('a[data-track="out"]:visible').first();
    const href = (await outLink.getAttribute("href"))!;
    const host = new URL(href).hostname.toLowerCase().replace(/^www\./, "");
    await outLink.click();
    const out = await waitForCall(page, (c) => c.path.startsWith("out/"));
    expect(out).toEqual({
      path: `out/${host}`,
      title: "원문 링크",
      referrer: `${site}/news/`,
      event: true,
    });

    // RSS(뒤표지 구독 단)
    await page.locator(`a[href="${sitePath}/rss.xml"]`).first().click();
    await waitForCall(page, (c) => c.path === "feed/rss/all");

    // 팀 페이지 — webcal 구독 · .ics 받기 · 팔로우(마이 팀 저장)
    const team = firstTeam();
    await page.goto(`${site}/teams/${team}/`);
    await waitForCall(page, (c) => c.path === `${sitePath}/teams/${team}/`);
    await preventNavigation(page);
    await page
      .locator('[data-slot="ics-link"][data-ics-mode="webcal"]:visible')
      .first()
      .click();
    await waitForCall(page, (c) => c.path === "feed/webcal/team");
    await page
      .locator(`a[href="${sitePath}/calendar/${team}.ics"]:visible`)
      .first()
      .click();
    await waitForCall(page, (c) => c.path === "feed/ics/team");

    await page.locator('[data-slot="follow-button"]:visible').first().click();
    const set = await waitForCall(page, (c) => c.path === "my/set");
    expect(set).toEqual({
      path: "my/set",
      title: "마이 팀 저장",
      referrer: `${site}/teams/${team}/`,
      event: true,
    });

    // PWA 설치 완료
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await waitForCall(page, (c) => c.path === "pwa/install");

    // 팀 slug · 카드 ID는 이벤트에 없다
    for (const call of (await calls(page)).filter((c) => c.event)) {
      expect(call.path).not.toContain(team);
      expect(call.path).not.toMatch(/c_[0-9a-f]{10}/);
    }
  });

  test("스크립트가 막혀도(광고 차단) 페이지 오류 0, 링크 이동 그대로", async ({
    page,
    context,
    baseURL,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const site = await servePublicOrigin(context, baseURL!);
    const sitePath = new URL(site).pathname;
    await page.goto(`${site}/`);
    await expect(page.locator(`script[src="${SCRIPT}"]`)).toHaveCount(1);
    await page.locator(`a[href="${sitePath}/news/"]:visible`).first().click();
    await page.waitForURL(`${site}/news/`);
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    expect(
      await page.evaluate(
        () => typeof (window as { goatcounter?: unknown }).goatcounter,
      ),
    ).toBe("undefined");
    expect(errors).toEqual([]);
  });
});
