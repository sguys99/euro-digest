import { expect, test, type Page } from "@playwright/test";

import {
  FALLBACK_FONT_FACES,
  fontPreloadHrefs,
  LATIN_SAMPLE,
  NUMERIC_FALLBACK_FAMILY,
  SANS_FALLBACK_FAMILIES,
  WEB_FONT_FACES,
} from "../../src/lib/fonts";
import { listBriefDates, loadBrief } from "../../src/lib/data/brief";
import { listNewsDates } from "../../src/lib/data/news";
import { createPaths } from "../../src/lib/paths";
import { basePath } from "./support/site";

// 웹폰트 self-host를 빌드 결과(out/)에서 확인한다 (D0-11, PRD DR-03·DR-11, DESIGN.md §3.1·§11.3).
// - 폰트 요청은 basePath 아래 같은 출처에서 200, 외부 요청 0, 파일마다 한 번(preload는 M1-39부터 없음 — DESIGN §11.3)
// - 4면 모두 font-display: swap으로 로드되고 document.fonts.check가 참
// - 폰트를 늦게 보내도(swap) 글자는 먼저 그려지고 LCP도 폰트를 기다리지 않는다 — 어느 환경에서나 단언(홈 · /news/ · 5줄이 실린 날짜 페이지)
// - 그때 레이아웃 이동(CLS)은 0.05 이하(CLAUDE §7.2) — 메트릭 폴백 글꼴이 설계대로 그려지는 환경에서만 단언(아래 FALLBACK_GROUPS)
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
  // 4면을 이름으로 직접 불러 실제 @font-face src·display를 검사한다(화면이 그 면을 쓰는지와 무관 — 쓰임은 아래 preload 테스트가 본다)
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
  // 파일마다 요청 한 번 — preload를 다시 켜면(DESIGN §11.3) preload(crossorigin)와 @font-face 요청이 합쳐져야 한다(어긋나면 두 번 받는다)
  for (const url of FONT_PATHS) {
    expect(
      fontRequests.filter((r) => r === url),
      url,
    ).toHaveLength(1);
  }
  const external = requested.filter((url) => new URL(url).origin !== origin);
  expect(external).toEqual([]);
});

test("웹폰트 preload는 없다(DESIGN §11.3 — M1-39) · 첫 화면이 4면을 모두 써서 받는다(티켓 호수 Barlow 800 · 러닝 헤드 Barlow 600 · 워드마크 한글 800 · 본문 400)", async ({
  page,
}) => {
  const fontRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "font")
      fontRequests.push(new URL(request.url()).pathname);
  });
  await page.goto("./");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
  const preloads = await page.$$eval(
    'link[rel="preload"][as="font"]',
    (links) =>
      links.map((link) => ({
        href: link.getAttribute("href"),
        type: link.getAttribute("type"),
        crossorigin: link.getAttribute("crossorigin"),
      })),
  );
  // HTML의 preload = src/lib/fonts.ts `preload: true`인 면(M1-39 사용자 결정으로 0개). 다시 켜면 woff2·crossorigin이어야
  // 실제 요청과 합쳐진다 — 0개면 아래 루프는 돌지 않는다
  expect(preloads.map((p) => p.href)).toEqual(PRELOAD_HREFS);
  expect(PRELOAD_HREFS).toEqual([]);
  for (const preload of preloads) {
    expect(preload.type, preload.href ?? "").toBe("font/woff2");
    expect(preload.crossorigin, preload.href ?? "").not.toBeNull();
  }
  expect([...new Set(fontRequests)].sort()).toEqual([...FONT_PATHS].sort());
});

// ─── 폰트 지연(1.5초) — swap · CLS ─────────────────────────────────────────────
//
// CLS 단언 조건(M1-39 예고 — D0-11 이월). 메트릭 폴백(src/lib/fonts.ts)은 지정한 시스템 글꼴을 local()로 불러
// size-adjust로 웹폰트 폭에 맞춘다. 그 글꼴이 없거나 설계대로 그려지지 않는 환경에서 잰 CLS는 사용자 기기의 값이 아니므로
// 아래 두 조건을 폴백 그룹(한글 · 라틴)마다 확인하고, 하나라도 어긋나면 CLS 단언만 건너뛴다(사유·측정값은 annotations에 남긴다).
// 1. 있음: 그룹의 폴백 패밀리 하나 이상이 모든 면(굵기·범위)을 local()로 찾는다 — CSS가 만든 FontFace의 load() 결과가 "loaded".
//    local() 글꼴이 없으면 Chromium은 그 면을 "error"로 둔다(2026-10-14 실측: CI와 같은 글꼴 구성에서 한글 두 패밀리 모두 error).
// 2. 비례: 폴백 면이 글자 크기에 비례해 그려진다 — 20px → 21px에서 표본 폭도 5% 커진다(오차 MAX_SCALE_DRIFT 이하).
//    Linux Chromium(기기 배율 1)은 local() 글꼴에 size-adjust를 걸면 실제 크기를 정수 px로 반올림한 것처럼 그린다
//    (2026-10-14 실측: "Barlow Condensed Fallback" 600은 21px·22px 폭이 같고 20→21px +8.8%, 800은 +0%). 카드 라틴 제목 21px에서는
//    15.54px가 16px로 그려져 폴백이 설계보다 약 3% 넓다. 같은 글꼴을 local()·size-adjust 없이 쓰면 비례한다.
// GitHub Actions 러너(playwright --with-deps)에는 맑은 고딕·Noto CJK KR이 없고 한글은 WenQuanYi Zen Hei(폭 보정 없음, 한글 제목 +13~19%)로
// 그려진다 → 1번에서 건너뛴다(라틴 폴백은 Liberation Sans Bold로 있지만 2번에서 어긋난다). 기준값(0.05)은 바꾸지 않는다.
// M1-39 실측(WSL Chromium + 글꼴 구성 2종 — fontconfig로 Windows 맑은 고딕·Arial / Noto Sans KR·Liberation): 기기 배율 2·3에서도
// 2번 오차가 같다(배율 문제가 아님). 이 환경에서 잰 지연 CLS는 홈·/news/·5줄 날짜 페이지 0.0001~0.0005(단언 생략, annotations).
// 단언을 실제로 돌릴 환경은 Windows·macOS Chromium(local() 반올림 없음) — CI에 넣을지는 DESIGN §11.13 선택지(지금은 skip 유지).

/** 한글 폴백 표본 — 한글 음절·공백만(한글 폴백 패밀리의 두 면 범위 안) */
const HANGUL_SAMPLE = "다람쥐 헌 쳇바퀴에 타고파";

/** 폴백 그룹 — 그룹 안 패밀리 하나만 있으면 된다(맑은 고딕 또는 Noto). 굵기는 FALLBACK_FONT_FACES에서 읽는다 */
const FALLBACK_GROUPS = [
  {
    label: "한글 메트릭 폴백(맑은 고딕 · Noto CJK KR)",
    families: SANS_FALLBACK_FAMILIES,
    sample: HANGUL_SAMPLE,
  },
  {
    label:
      "라틴·숫자 메트릭 폴백(Arial · Helvetica · Liberation Sans · Roboto Bold)",
    families: [NUMERIC_FALLBACK_FAMILY],
    sample: LATIN_SAMPLE,
  },
].map((group) => ({
  ...group,
  families: group.families.map((family) => ({
    family,
    weights: [
      ...new Set(
        FALLBACK_FONT_FACES.filter((face) => face.family === family).map(
          (face) => face.weight,
        ),
      ),
    ],
  })),
}));

/**
 * 비례 오차 허용치(1%). 설계 오차(라틴 표본 대 원제목 말뭉치 0.3%, 한글 0%)보다 크고,
 * 위 반올림 왜곡(16px 근처에서 최대 ±3%)보다 작다.
 */
const MAX_SCALE_DRIFT = 0.01;

const FONT_DELAY_MS = 1500;

/**
 * 폰트 지연을 재는 페이지(M1-39 — D0-11 이월 "실제 홈 콘텐츠로"): 홈 · /news/(카드 피드 머리) · 5줄 줄이 실린 가장 최근 날짜 페이지
 * (홈의 5줄이 '쉽니다'인 날에도 5줄 행 — 등번호 Barlow 800 · 문장 400 · 스코어 Barlow 600 — 을 잰다). 기대 값은 data/에서 고른다.
 */
const BRIEF_ARCHIVE_DATE = (() => {
  const published = new Set(listNewsDates());
  return listBriefDates()
    .filter((date) => published.has(date))
    .reverse()
    .find((date) => (loadBrief(date)?.lines.length ?? 0) > 0);
})();

const DELAY_PAGES: readonly { name: string; path: string }[] = [
  { name: "홈", path: "./" },
  { name: "뉴스", path: "news/" },
  ...(BRIEF_ARCHIVE_DATE
    ? [
        {
          name: `5줄 날짜 페이지 ${BRIEF_ARCHIVE_DATE}`,
          path: `news/${BRIEF_ARCHIVE_DATE}/`,
        },
      ]
    : []),
];

interface DelayedFontLoad {
  /** first-contentful-paint(ms) */
  fcp: number | null;
  /** 마지막 largest-contentful-paint 후보(ms)와 그 요소 — 진단용 */
  lcp: number | null;
  lcpElement: string;
  /** 가장 먼저 끝난 폰트 응답(ms) */
  firstFontEnd: number | null;
  cls: number;
  /** 움직인 요소(가장 가까운 id 조상) — 진단용 */
  shifted: string[];
}

/** 폰트 응답을 1.5초 늦춰 페이지를 열고, 폰트가 모두 바뀐 뒤 FCP·LCP·첫 폰트 응답·CLS를 잰다 */
async function loadWithDelayedFonts(
  page: Page,
  path: string,
): Promise<DelayedFontLoad> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __cls: number;
      __shifted: Set<string>;
      __lcp: { t: number; el: string } | null;
    };
    w.__cls = 0;
    w.__shifted = new Set();
    w.__lcp = null;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        startTime: number;
        element: Element | null;
      }[]) {
        const el = entry.element;
        w.__lcp = {
          t: entry.startTime,
          el: el
            ? `${el.tagName.toLowerCase()} «${(el.textContent ?? "").trim().slice(0, 16)}»`
            : "?",
        };
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
        sources?: { node: Node | null }[];
      }[]) {
        if (entry.hadRecentInput) continue;
        w.__cls += entry.value;
        for (const { node } of entry.sources ?? []) {
          const element = node instanceof Element ? node : node?.parentElement;
          const anchor = element?.closest("[id]");
          w.__shifted.add(
            anchor ? `#${anchor.id}` : (element?.tagName.toLowerCase() ?? "?"),
          );
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.route(`**${basePath}/fonts/**`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, FONT_DELAY_MS));
    await route.continue();
  });

  await page.goto(path, { waitUntil: "domcontentloaded" });
  // 페이지가 쓰는 면(한글 400·800, Barlow 600·800)이 모두 바뀌고 더 받을 폰트가 없을 때까지 기다린다
  await page.waitForFunction(
    () =>
      document.fonts.check('400 16px "EuroDigest Sans"', "가") &&
      document.fonts.status === "loaded",
    undefined,
    { timeout: 15_000 },
  );
  // 바뀐 뒤의 layout-shift 기록이 들어올 시간을 준다
  await page.waitForTimeout(500);

  return page.evaluate(() => {
    const w = window as unknown as {
      __cls: number;
      __shifted: Set<string>;
      __lcp: { t: number; el: string } | null;
    };
    const fcp =
      performance.getEntriesByName("first-contentful-paint")[0]?.startTime ??
      null;
    const fontEnds = performance
      .getEntriesByType("resource")
      .filter((e) => e.name.endsWith(".woff2"))
      .map((e) => (e as PerformanceResourceTiming).responseEnd);
    return {
      fcp,
      lcp: w.__lcp?.t ?? null,
      lcpElement: w.__lcp?.el ?? "없음",
      firstFontEnd: fontEnds.length > 0 ? Math.min(...fontEnds) : null,
      cls: w.__cls,
      shifted: [...w.__shifted],
    };
  });
}

interface FallbackGroupStatus {
  label: string;
  /** 그룹의 폴백 패밀리 하나 이상이 있고 비례해 그려진다 */
  ready: boolean;
  detail: string;
}

/** 폴백 그룹마다 조건 1(있음)·2(비례)를 잰다. 웹폰트 로드 상태와 무관하다(폴백 패밀리 이름으로 직접 그린다) */
async function fallbackEnvironment(page: Page): Promise<FallbackGroupStatus[]> {
  return page.evaluate(
    async ({ groups, maxDrift }) => {
      const width = (
        family: string,
        weight: number,
        size: number,
        text: string,
      ) => {
        const span = document.createElement("span");
        span.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-family:"${family}";font-weight:${weight};font-size:${size}px`;
        span.textContent = text;
        document.body.append(span);
        const w = span.getBoundingClientRect().width;
        span.remove();
        return w;
      };
      const out = [];
      for (const group of groups) {
        const notes: string[] = [];
        let ready = false;
        for (const { family, weights } of group.families) {
          const faces = [...document.fonts].filter(
            (face) => face.family.replace(/^["']|["']$/g, "") === family,
          );
          await Promise.all(
            faces.map((face) => face.load().catch(() => undefined)),
          );
          if (
            faces.length === 0 ||
            faces.some((face) => face.status !== "loaded")
          ) {
            notes.push(`${family}: local() 글꼴 없음`);
            continue;
          }
          const drift = Math.max(
            ...weights.map((weight) => {
              const at20 = width(family, weight, 20, group.sample);
              const at21 = width(family, weight, 21, group.sample);
              return Math.abs(at21 / at20 / (21 / 20) - 1);
            }),
          );
          const percent = `${(drift * 100).toFixed(1)}%`;
          if (drift > maxDrift) {
            notes.push(
              `${family}: 있으나 크기 비례 오차 ${percent}(정수 px 반올림 — Linux Chromium)`,
            );
            continue;
          }
          ready = true;
          notes.push(`${family}: 있음(비례 오차 ${percent})`);
        }
        out.push({ label: group.label, ready, detail: notes.join(" · ") });
      }
      return out;
    },
    { groups: FALLBACK_GROUPS, maxDrift: MAX_SCALE_DRIFT },
  );
}

for (const target of DELAY_PAGES) {
  test(`${target.name} — 폰트가 1.5초 늦게 와도 글자를 먼저 그리고 LCP도 폰트를 기다리지 않는다(swap — FCP·LCP < 첫 폰트 응답)`, async ({
    page,
  }) => {
    const result = await loadWithDelayedFonts(page, target.path);
    test.info().annotations.push({
      type: "폰트 지연 FCP·LCP",
      description: `FCP ${result.fcp?.toFixed(0)}ms · LCP ${result.lcp?.toFixed(0)}ms(${result.lcpElement}) · 첫 폰트 응답 ${result.firstFontEnd?.toFixed(0)}ms`,
    });
    // 폰트보다 글자가 먼저 그려졌다 = swap(block이면 글자가 숨어 FCP가 폰트 뒤로 밀린다)
    expect(result.fcp).not.toBeNull();
    expect(result.firstFontEnd).not.toBeNull();
    expect(result.fcp ?? Infinity).toBeLessThan(result.firstFontEnd ?? 0);
    // 가장 큰 글자 덩어리도 폰트 도착 전에 그려지고, 폰트가 바뀌어도 LCP 후보가 폰트 뒤로 다시 잡히지 않는다
    expect(result.lcp).not.toBeNull();
    expect(result.lcp ?? Infinity).toBeLessThan(result.firstFontEnd ?? 0);
  });

  test(`${target.name} — 폰트 1.5초 지연 CLS ≤ 0.05 — 메트릭 폴백 글꼴이 설계대로 그려지는 환경에서만 단언(아니면 skip + 사유)`, async ({
    page,
  }) => {
    const result = await loadWithDelayedFonts(page, target.path);
    const environment = await fallbackEnvironment(page);

    // 단언하든 건너뛰든 측정값과 폴백 판정을 리포트에 남긴다(조용히 사라지지 않게)
    const { annotations } = test.info();
    annotations.push({
      type: "폰트 지연 CLS",
      description: `${result.cls.toFixed(4)} — 움직인 요소: ${result.shifted.join(" ") || "없음"}`,
    });
    for (const group of environment) {
      annotations.push({
        type: "메트릭 폴백",
        description: `${group.label} — ${group.detail}`,
      });
    }

    const notReady = environment.filter((group) => !group.ready);
    test.skip(
      notReady.length > 0,
      `CLS 단언 생략(측정 ${result.cls.toFixed(4)}) — 메트릭 폴백이 설계대로 그려지지 않는 환경: ${notReady
        .map((group) => `${group.label} [${group.detail}]`)
        .join(", ")}`,
    );
    expect(result.cls).toBeLessThanOrEqual(0.05);
  });
}
