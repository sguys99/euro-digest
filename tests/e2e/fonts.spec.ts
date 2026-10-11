import { expect, test } from "@playwright/test";

import { fontPreloadHrefs, WEB_FONT_FACES } from "../../src/lib/fonts";
import { createPaths } from "../../src/lib/paths";
import { basePath } from "./support/site";

// 웹폰트 self-host를 빌드 결과(out/)에서 확인한다 (D0-11, PRD DR-03·DR-11, DESIGN.md §3.1·§11.3).
// - 폰트 요청은 basePath 아래 같은 출처에서 200, 외부 요청 0, preload와 실제 요청이 한 번으로 합쳐진다(crossorigin 일치)
// - 4면 모두 font-display: swap으로 로드되고 document.fonts.check가 참
// - 폰트를 늦게 보내도(swap) 글자는 먼저 그려지고 레이아웃 이동(CLS)은 0.05 이하(CLAUDE §7.2)
// 기대 값은 src/lib/fonts.ts에서 읽는다(하드코딩하지 않는다).

const paths = createPaths({ basePath, siteUrl: undefined });
const FONT_PATHS = WEB_FONT_FACES.map((face) => paths.withBasePath(face.path));
const PRELOAD_HREFS = fontPreloadHrefs(paths.withBasePath);
const FACES = WEB_FONT_FACES.map((face) => ({
  family: face.family,
  weight: face.weight,
  // 그 면이 가진 글자로 불러야 unicode-range에 걸린다(Barlow는 한글 없음)
  text: face.family === "EuroDigest Sans" ? "가A1" : "A1",
}));

test("웹폰트 4면이 basePath 아래에서 200으로 한 번씩 로드되고 swap이다 — 외부 요청 0", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "http://127.0.0.1:4173/").origin;
  const requested: string[] = [];
  const fontRequests: string[] = [];
  const fontStatus = new Map<string, number>();
  page.on("request", (request) => {
    requested.push(request.url());
    if (request.resourceType() === "font") {
      fontRequests.push(new URL(request.url()).pathname);
    }
  });
  page.on("response", (response) => {
    if (response.request().resourceType() === "font") {
      fontStatus.set(new URL(response.url()).pathname, response.status());
    }
  });

  await page.goto("./");
  // 자리표시 홈에는 Barlow를 쓰는 글자가 아직 없다 → 4면을 모두 불러 실제 @font-face src를 검사한다
  const faces = await page.evaluate(async (specs) => {
    const out = [];
    for (const spec of specs) {
      const font = `${spec.weight} 16px "${spec.family}"`;
      const loaded = await document.fonts.load(font, spec.text);
      out.push({
        font,
        statuses: loaded.map((f) => f.status),
        displays: loaded.map((f) => f.display),
        check: document.fonts.check(font, spec.text),
      });
    }
    return out;
  }, FACES);
  await page.waitForLoadState("networkidle");

  for (const face of faces) {
    expect(face.statuses, face.font).toEqual(["loaded"]);
    expect(face.displays, face.font).toEqual(["swap"]);
    expect(face.check, face.font).toBe(true);
  }
  expect([...fontStatus.keys()].sort()).toEqual([...FONT_PATHS].sort());
  for (const [url, status] of fontStatus) expect(status, url).toBe(200);
  // preload(crossorigin)와 @font-face 요청이 같은 요청으로 합쳐진다 — 어긋나면 같은 파일을 두 번 받는다
  for (const url of FONT_PATHS) {
    expect(
      fontRequests.filter((r) => r === url),
      url,
    ).toHaveLength(1);
  }
  const external = requested.filter((url) => new URL(url).origin !== origin);
  expect(external).toEqual([]);
});

test("preload는 DESIGN §11.3의 두 파일(한글 400 · Barlow 800)만, woff2 · crossorigin으로 건다", async ({
  page,
}) => {
  await page.goto("./");
  const preloads = await page.$$eval(
    'link[rel="preload"][as="font"]',
    (links) =>
      links.map((link) => ({
        href: link.getAttribute("href"),
        type: link.getAttribute("type"),
        crossorigin: link.getAttribute("crossorigin"),
      })),
  );
  expect(preloads.map((p) => p.href)).toEqual(PRELOAD_HREFS);
  for (const preload of preloads) {
    expect(preload.type).toBe("font/woff2");
    expect(preload.crossorigin).not.toBeNull();
  }
});

test("폰트가 1.5초 늦게 와도 글자를 먼저 그리고(swap) CLS ≤ 0.05", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
      }[]) {
        if (!entry.hadRecentInput) w.__cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.route(`**${basePath}/fonts/**`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  await page.goto("./", { waitUntil: "domcontentloaded" });
  // 홈이 쓰는 면(지금은 본문 400뿐 — preflight가 제목 굵기를 inherit로 둔다)이 바뀌고 더 받을 폰트가 없을 때까지 기다린다
  await page.waitForFunction(
    () =>
      document.fonts.check('400 16px "EuroDigest Sans"', "가") &&
      document.fonts.status === "loaded",
    undefined,
    { timeout: 15_000 },
  );
  // 바뀐 뒤의 layout-shift 기록이 들어올 시간을 준다
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const fcp =
      performance.getEntriesByName("first-contentful-paint")[0]?.startTime ??
      null;
    const fontEnds = performance
      .getEntriesByType("resource")
      .filter((e) => e.name.endsWith(".woff2"))
      .map((e) => (e as PerformanceResourceTiming).responseEnd);
    return {
      fcp,
      firstFontEnd: fontEnds.length > 0 ? Math.min(...fontEnds) : null,
      cls: (window as unknown as { __cls: number }).__cls,
    };
  });
  // 폰트보다 글자가 먼저 그려졌다 = swap(block이면 글자가 숨어 FCP가 폰트 뒤로 밀린다)
  expect(result.fcp).not.toBeNull();
  expect(result.firstFontEnd).not.toBeNull();
  expect(result.fcp ?? Infinity).toBeLessThan(result.firstFontEnd ?? 0);
  expect(result.cls).toBeLessThanOrEqual(0.05);
});
