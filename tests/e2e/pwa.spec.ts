import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { listIssueDates } from "../../src/lib/data/issue";
import { recentIssueDates } from "../../src/lib/pwa";
import type { SwConfig } from "../../src/lib/sw/policy";
import { kstDate, nowUtcIso } from "../../src/lib/time";

import { basePath, outDir, toGotoPath } from "./support/site";

// PWA e2e (M4-13 — PRD FR-120 manifest · FR-121 서비스 워커) — 일반 빌드(out/)를 GitHub Pages처럼 basePath 아래에서(serve-out).
// 다른 e2e는 서비스 워커를 막는다(playwright.config.ts `serviceWorkers: "block"` — 설치가 페이지마다 수 MB를 받아 다른 검사를 흔들지 않게).
// 이 파일만 허용한다. 오프라인은 context.setOffline — 워커의 fetch도 끊긴다(저장 안 한 페이지가 오프라인 화면으로 가는 것으로 확인).
// 새 버전은 "빌드 2회"를 흉내 낸다: out/을 그대로 주되 sw.js만 버전을 바꿔 주는 작은 서버(테스트 프로세스 안)를 따로 띄운다
// (워커 바이트가 바뀌면 브라우저가 새 워커를 설치한다). Playwright 경로 가로채기는 워커 스크립트 업데이트 요청을 잡지 못한다(실측).
// 캐시 정책·버전 정리·상한의 세부 분기는 단위(tests/sw-policy.test.ts · sw-build.test.ts · sw-register.test.tsx).

test.use({ serviceWorkers: "allow" });

const SW_SOURCE = readFileSync(path.join(outDir, "sw.js"), "utf8");
const CONFIG = JSON.parse(
  /^const SW_CONFIG = (\{.*\});$/m.exec(SW_SOURCE)?.[1] ?? "null",
) as SwConfig;
const NEWS_PAGE_RE = /\/news\/(\d{4}-\d{2}-\d{2})\/$/;
const newsPages = CONFIG.pages.filter((href) => NEWS_PAGE_RE.test(href));
/** basePath 포함 href → page.goto 상대 경로 */
const gotoPath = (href: string) => toGotoPath(href.slice(basePath.length));
const SHOTS_DIR = path.resolve("docs/design/m4/screenshots");

/** 서비스 워커가 설치·활성화돼 이 페이지를 맡을 때까지(첫 방문 — load 뒤 등록 → 프리캐시 → claim) */
async function waitForController(page: Page): Promise<void> {
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    null,
    {
      timeout: 45_000,
    },
  );
}

test("manifest — <link rel=manifest>, Chrome이 읽은 필드·오류 0·설치 가능, 아이콘 PNG 크기", async ({
  page,
  request,
}) => {
  await page.goto("./");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe(`${basePath}/manifest.webmanifest`);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    `${basePath}/icons/apple-touch-icon.png`,
  );

  // Chrome DevTools Application › Manifest와 같은 파서(CDP Page.getAppManifest) + 설치 가능 오류(Page.getInstallabilityErrors)
  const cdp = await page.context().newCDPSession(page);
  const { errors, manifest: parsed } = (await cdp.send(
    "Page.getAppManifest",
    {},
  )) as {
    errors: { message: string }[];
    manifest?: {
      id?: string;
      name?: string;
      startUrl?: string;
      scope?: string;
      display?: string;
      backgroundColor?: string;
      themeColor?: string;
      icons?: { url: string; sizes?: string; type?: string }[];
    };
  };
  expect(errors).toEqual([]);
  const root = new URL(`${basePath}/`, page.url()).href;
  expect(parsed?.id).toBe(root);
  expect(parsed?.name).toBe("유로 다이제스트");
  expect(parsed?.startUrl).toBe(root);
  expect(parsed?.scope).toBe(root);
  expect(parsed?.display).toBe("kStandalone");
  expect(parsed?.backgroundColor).toBe("rgba(243,240,234,1)");
  expect(parsed?.themeColor).toBe("rgba(243,240,234,1)");
  expect(parsed?.icons?.map((i) => i.sizes)).toEqual([
    "192x192",
    "512x512",
    "512x512",
  ]);
  const { installabilityErrors } = (await cdp.send(
    "Page.getInstallabilityErrors" as never,
  )) as {
    installabilityErrors: unknown[];
  };
  expect(installabilityErrors).toEqual([]);

  const manifest = (await (await request.get(href ?? "")).json()) as {
    icons: { src: string; sizes: string; type: string; purpose: string }[];
  };
  expect(manifest.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual([
    "192x192 any",
    "512x512 any",
    "512x512 maskable",
  ]);
  for (const icon of [
    ...manifest.icons,
    {
      src: `${basePath}/icons/apple-touch-icon.png`,
      sizes: "180x180",
      type: "image/png",
    },
  ]) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    const png = await res.body();
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
  }
});

test("서비스 워커 — load 뒤 등록, scope = basePath/, 앱 셸 + 최근 3일 호 + 자산 프리캐시", async ({
  page,
}) => {
  // 빌드와 같은 함수·같은 입력(오프라인 화면 목록도 같다)
  const expected = recentIssueDates(listIssueDates(), kstDate(nowUtcIso()));
  expect(newsPages.map((href) => NEWS_PAGE_RE.exec(href)?.[1])).toEqual(
    expected,
  );
  expect(newsPages.length).toBeGreaterThan(0);
  expect(newsPages.length).toBeLessThanOrEqual(3);

  await page.goto("./");
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return { scope: r.scope, script: r.active?.scriptURL ?? "" };
  });
  expect(reg.scope).toBe(new URL(`${basePath}/`, page.url()).href);
  expect(reg.script).toBe(new URL(`${basePath}/sw.js`, page.url()).href);
  await waitForController(page);

  const caches = await page.evaluate(async (version) => {
    const keysOf = async (name: string) =>
      (await (await window.caches.open(name)).keys()).map(
        (r) => new URL(r.url).pathname,
      );
    return {
      names: await window.caches.keys(),
      pages: await keysOf(`ed-pages-${version}`),
      assets: await keysOf("ed-static"),
    };
  }, CONFIG.version);
  expect(caches.names.sort()).toEqual([
    `ed-pages-${CONFIG.version}`,
    "ed-static",
  ]);
  expect(caches.pages.sort()).toEqual([...CONFIG.pages].sort());
  expect(caches.pages).toEqual(
    expect.arrayContaining([
      `${basePath}/`,
      `${basePath}/news/`,
      `${basePath}/offline/`,
    ]),
  );
  expect(caches.assets.sort()).toEqual([...CONFIG.assets].sort());
  // 앱 셸 자산: JS·CSS 청크, 웹폰트, 아이콘, manifest
  for (const re of [
    /\/_next\/static\/.+\.js$/,
    /\/_next\/static\/.+\.css$/,
    /\/fonts\/.+\.woff2$/,
    /\/icons\/.+\.png$/,
    /\/manifest\.webmanifest$/,
  ]) {
    expect(
      caches.assets.some((p) => re.test(p)),
      String(re),
    ).toBe(true);
  }
});

test("오프라인 — 최근 3일 호·홈·뉴스는 워커 캐시로 열리고, 저장 안 한 페이지는 오프라인 화면(다시 시도·저장해 둔 호)", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await waitForController(page);
  await context.setOffline(true);

  for (const href of [...newsPages, `${basePath}/`, `${basePath}/news/`]) {
    const res = await page.goto(gotoPath(href));
    expect(res?.fromServiceWorker(), href).toBe(true);
    expect(res?.ok(), href).toBe(true);
    await expect(page.locator("main#main")).toBeVisible();
    expect(
      await page.locator("main article[id^='c_']").count(),
      href,
    ).toBeGreaterThan(0);
    // 그 페이지가 쓰는 자산도 캐시에서 — 스타일이 입혀졌다(지면 색 = 토큰)
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).not.toBe("rgba(0, 0, 0, 0)");
    await expect(page.locator("[data-slot=offline-band-body]")).toBeVisible();
  }

  // 클라이언트 이동(next/link — RSC를 못 받으면 문서 이동으로 바뀐다)도 캐시로 도착한다
  await page.goto(gotoPath(`${basePath}/`));
  await page
    .getByRole("link", { name: "뉴스", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`${basePath}/news/$`));
  await expect(
    page.getByRole("heading", { level: 1, name: "뉴스" }),
  ).toBeVisible();

  // 저장 안 한 페이지 → 오프라인 화면
  await page.goto(gotoPath(`${basePath}/about/`));
  await expect(page).toHaveURL(
    `${new URL(`${basePath}/offline/`, page.url()).href}?from=${encodeURIComponent(`${basePath}/about/`)}`,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "연결이 끊겨 열 수 없어요" }),
  ).toBeVisible();
  const retry = page.getByRole("link", { name: "다시 시도" });
  await expect(retry).toHaveAttribute("href", `${basePath}/about/`);
  const saved = page
    .getByRole("region", { name: "저장해 둔 호" })
    .getByRole("link");
  await expect(saved).toHaveCount(newsPages.length);
  await saved.last().click();
  await expect(page).toHaveURL(new RegExp(`${newsPages.at(-1)}$`));
  expect(await page.locator("main article[id^='c_']").count()).toBeGreaterThan(
    0,
  );

  // 연결이 돌아오면 '다시 시도'로 열려던 페이지
  await page.goBack();
  await context.setOffline(false);
  await page.getByRole("link", { name: "다시 시도" }).click();
  await expect(page).toHaveURL(new RegExp(`${basePath}/about/$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test("오프라인 /my(M4-16) — 온라인으로 본 마이와 팀 · 선수 자료는 사본으로 열리고(다음 경기 · 최근 결과), 처음 보는 자료만 '받지 못했어요'", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("ed-follow"))
      localStorage.setItem(
        "ed-follow",
        JSON.stringify({
          v: 1,
          teams: ["bayern-munchen"],
          players: ["kim-min-jae"],
        }),
      );
  });
  await page.goto("./");
  await waitForController(page);
  // 온라인으로 /my — 페이지는 런타임 캐시, 자료 2개는 ed-data에(네트워크 우선)
  await page.goto("my/");
  await expect(
    page.locator('[data-slot="my-fixtures"] [data-slot="admission"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "최근 결과 — 최근 경기부터" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await (await caches.open("ed-data")).keys()).map(
          (r) => new URL(r.url).pathname,
        ),
      ),
    )
    .toEqual(
      expect.arrayContaining([
        `${basePath}/my/data/teams/bayern-munchen.json`,
        `${basePath}/my/data/players/kim-min-jae.json`,
      ]),
    );

  await context.setOffline(true);
  const res = await page.goto("my/");
  expect(res?.fromServiceWorker()).toBe(true);
  await expect(
    page.locator('[data-slot="my-fixtures"] [data-slot="admission"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "최근 결과 — 최근 경기부터" }),
  ).toBeVisible();
  await expect(page.locator("[data-slot=offline-band-body]")).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "받지 못했어요" }),
  ).toHaveCount(0);

  // 사본이 없는 자료(새로 팔로우한 팀)만 실패 안내 + 다시 시도
  await page.evaluate(() =>
    localStorage.setItem(
      "ed-follow",
      JSON.stringify({
        v: 1,
        teams: ["bayern-munchen", "arsenal"],
        players: ["kim-min-jae"],
      }),
    ),
  );
  await page.reload();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "오프라인이라 팀·선수 자료를 받지 못했어요" }),
  ).toBeVisible();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

/** 새 버전 흉내용 정적 서버(테스트 프로세스 안) — out/을 basePath 아래로 그대로 주고 sw.js만 메모리 값(버전 교체)으로 준다 */
function mirrorServer() {
  let sw = SW_SOURCE;
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json; charset=utf-8",
  };
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(
      new URL(req.url ?? "/", "http://x").pathname,
    );
    if (pathname === `${basePath}/sw.js`) {
      res.writeHead(200, {
        "Content-Type": types[".js"],
        "Cache-Control": "no-cache",
      });
      res.end(sw);
      return;
    }
    const rel = pathname.startsWith(`${basePath}/`)
      ? pathname.slice(basePath.length)
      : null;
    const file =
      rel === null
        ? null
        : path.join(outDir, rel.endsWith("/") ? `${rel}index.html` : rel);
    if (
      !file ||
      !file.startsWith(outDir) ||
      !existsSync(file) ||
      !statSync(file).isFile()
    ) {
      res.writeHead(404, { "Content-Type": types[".html"] });
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(readFileSync(file));
  });
  return {
    origin: "",
    writeSw(version: string) {
      sw = SW_SOURCE.replace(
        `"version":"${CONFIG.version}"`,
        `"version":"${version}"`,
      );
    },
    async start() {
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      this.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    },
    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

test.describe("새 버전", () => {
  let mirror: ReturnType<typeof mirrorServer>;
  test.beforeAll(async () => {
    mirror = mirrorServer();
    await mirror.start();
  });
  test.afterAll(() => mirror.stop());

  for (const colorScheme of ["light", "dark"] as const) {
    test(`토스트 "새 소식이 있어요" + 새로고침 → 새 워커가 맡고 지난 버전 캐시 정리 (${colorScheme})`, async ({
      page,
    }) => {
      mirror.writeSw(CONFIG.version);
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto(`${mirror.origin}${basePath}/`);
      await waitForController(page);
      // 첫 설치는 알리지 않는다
      await expect(page.getByText("새 소식이 있어요")).toHaveCount(0);

      // 빌드 2회 흉내 — 버전만 바꾼 sw.js
      const next = `e2e${colorScheme}`;
      mirror.writeSw(next);
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration())?.update();
      });
      const toaster = page.locator("[data-slot=toaster]");
      await expect(toaster.getByText("새 소식이 있어요")).toBeVisible({
        timeout: 45_000,
      });
      await expect(toaster.getByText("새 소식", { exact: true })).toBeVisible();
      const action = toaster.getByRole("button", { name: "새로고침" });
      await expect(action).toBeVisible();
      await expect(
        toaster.getByRole("button", { name: "알림 닫기" }),
      ).toBeVisible();
      // 저절로 사라지지 않는다(기본 2.4초를 넘겨도)
      await page.waitForTimeout(3_000);
      await expect(toaster.getByText("새 소식이 있어요")).toBeVisible();

      // DESIGN §9.2 Toast — --ink 면 · --paper 글자 · --shadow-print-accent · 직각 · 최소 48px, §4.4 위치(바닥 76/28px, z 40)
      const style = await toaster
        .locator(":scope > *")
        .first()
        .evaluate((el) => {
          const s = getComputedStyle(el);
          const root = getComputedStyle(document.documentElement);
          const color = (v: string) => {
            const probe = document.createElement("span");
            probe.style.color = v;
            document.body.append(probe);
            const c = getComputedStyle(probe).color;
            probe.remove();
            return c;
          };
          const r = el.getBoundingClientRect();
          return {
            bg: s.backgroundColor,
            fg: s.color,
            ink: color(root.getPropertyValue("--ink")),
            paper: color(root.getPropertyValue("--paper")),
            shadow: s.boxShadow,
            accent: color(root.getPropertyValue("--brand-accent")),
            radius: s.borderTopLeftRadius,
            height: r.height,
            bottomGap: window.innerHeight - r.bottom,
            z: getComputedStyle(el.parentElement as Element).zIndex,
          };
        });
      expect(style.bg).toBe(style.ink);
      expect(style.fg).toBe(style.paper);
      expect(style.shadow).toContain(style.accent);
      expect(style.shadow).toContain("4px 4px 0px");
      expect(style.radius).toBe("0px");
      expect(style.height).toBeGreaterThanOrEqual(48);
      expect(style.z).toBe("40");
      const width = page.viewportSize()?.width ?? 0;
      expect(Math.round(style.bottomGap)).toBe(width >= 1024 ? 28 : 76);

      mkdirSync(SHOTS_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(SHOTS_DIR, `impl-sw-toast-${width}-${colorScheme}.png`),
      });

      // 새로고침 → 대기 워커 활성화 → 다시 불러옴 → 지난 버전 캐시 정리
      const reloaded = page.waitForEvent("load");
      await action.click();
      await reloaded;
      await waitForController(page);
      await expect(page.getByText("새 소식이 있어요")).toHaveCount(0);
      const state = await page.evaluate(async () => ({
        names: await window.caches.keys(),
        waiting:
          (await navigator.serviceWorker.getRegistration())?.waiting ?? null,
      }));
      expect(state.names.sort()).toEqual([`ed-pages-${next}`, "ed-static"]);
      expect(state.waiting).toBeNull();
    });
  }
});
