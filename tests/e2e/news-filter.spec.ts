import { createServer, get, type Server } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { listNewsDates } from "../../src/lib/data/news";
import { basePath, outDir, sitePages } from "./support/site";

// 뉴스 필터 e2e (M1-33 — PRD FR-31·FR-32, DESIGN §6.2·§9.2·§9.3, DECISIONS D0 §5 #11·#13) — 일반 빌드(out/)의 실제 최신 호(홈·/news/)와 지난 호 하나(날짜 아카이브 — M1-34).
// 실제 호는 날마다 바뀌므로 기대 값은 페이지의 카드 데이터 속성(`data-nf-*`)에서 계산한다(하드코딩하지 않는다). fixtures 23장으로
// 건수·모양을 결정적으로 보는 검사는 견본 e2e(tests/e2e-specimen/news-filter.spec.ts). 카드가 없는 빌드(CI 초기)는 건너뛴다.

/** 날짜 아카이브(M1-34) — 최신 호가 아닌 날짜 페이지 하나(지난 호 — 호가 하나뿐이면 그 호). 같은 필터 지면·주소 동기화를 쓴다 */
const ARCHIVE_DATE = listNewsDates().at(-2) ?? listNewsDates().at(-1);

const PAGES: readonly { name: string; path: string }[] = [
  { name: "홈", path: "./" },
  { name: "뉴스", path: "news/" },
  ...(ARCHIVE_DATE
    ? [{ name: `아카이브 ${ARCHIVE_DATE}`, path: `news/${ARCHIVE_DATE}/` }]
    : []),
];

const CATEGORIES = [
  "result",
  "transfer",
  "injury",
  "club",
  "national",
  "ucl",
  "other",
] as const;

interface CardData {
  id: string;
  cat: string;
  comps: string[];
  teams: string[];
  kr: boolean;
}

interface FilterConfig {
  comps: Record<string, { s: string; n: string }>;
  cats: Record<string, string>;
  teams: Record<string, string>;
}

async function cards(page: Page): Promise<CardData[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("li[data-nf-card]")].map(
      (li) => ({
        id: li.querySelector("article")?.id ?? "",
        cat: li.getAttribute("data-nf-cat") ?? "",
        comps: (li.getAttribute("data-nf-comps") ?? "")
          .split(" ")
          .filter(Boolean),
        teams: (li.getAttribute("data-nf-teams") ?? "")
          .split(" ")
          .filter(Boolean),
        kr: li.hasAttribute("data-nf-kr"),
      }),
    ),
  );
}

async function config(page: Page): Promise<FilterConfig> {
  return page.evaluate(
    () =>
      JSON.parse(
        document.getElementById("news-filter-config")?.textContent ?? "{}",
      ) as FilterConfig,
  );
}

async function visibleIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "li[data-nf-card]:not([hidden]) > article",
      ),
    ].map((a) => a.id),
  );
}

/** 걸러지는 분류 — 카드가 있으면서 전체보다 적은 첫 분류(없으면 null) */
function filteringCategory(all: CardData[]): string | null {
  return (
    CATEGORIES.find((cat) => {
      const n = all.filter((c) => c.cat === cat).length;
      return n > 0 && n < all.length;
    }) ?? null
  );
}

/** 카드가 있는 대회 중 가장 많은 대회 */
function busiestComp(all: CardData[], cfg: FilterConfig): string | null {
  let best: string | null = null;
  let max = 0;
  for (const comp of Object.keys(cfg.comps)) {
    const n = all.filter((c) => c.comps.includes(comp)).length;
    if (n > max) [best, max] = [comp, n];
  }
  return best;
}

/** 0건이 되는 주소 쿼리 — 0건 대회 하나, 없으면 대회 × 분류 조합 */
function zeroQuery(all: CardData[], cfg: FilterConfig): string | null {
  const comps = Object.keys(cfg.comps);
  const empty = comps.find((comp) => !all.some((c) => c.comps.includes(comp)));
  if (empty) return `comp=${empty.toLowerCase()}`;
  for (const comp of comps)
    for (const cat of CATEGORIES)
      if (!all.some((c) => c.cat === cat && c.comps.includes(comp)))
        return `comp=${comp.toLowerCase()}&cat=${cat}`;
  return null;
}

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

function wide(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 1024;
}

/** 지금 폭에서 보이는 분류 컨트롤(1024 이상 목차 행 · 1023 이하 칩) */
function catControl(page: Page, value: string) {
  return wide(page)
    ? page.locator(
        `nav[aria-label="뉴스 필터"] [data-nf-key="cat"][data-nf-value="${value}"]`,
      )
    : page.locator(
        `[data-nf-chips] [data-nf-key="cat"][data-nf-value="${value}"]`,
      );
}

for (const target of PAGES) {
  test.describe(target.name, () => {
    test("분류를 누르면 그 분류 카드만 · 부제 건수·설명 · 주소 ?cat= · 머리기사 없음 · 결과 알림 · 다시 누르면 전체", async ({
      page,
    }) => {
      await open(page, target.path);
      const all = await cards(page);
      const cat = filteringCategory(all);
      test.skip(cat === null, "거를 분류가 없는 호");
      if (!cat) return;
      const cfg = await config(page);
      const expected = all.filter((c) => c.cat === cat).map((c) => c.id);

      await catControl(page, cat).click();
      await expect(page).toHaveURL(new RegExp(`\\?cat=${cat}$`));
      expect(await visibleIds(page)).toEqual(expected);
      await expect(page.locator("[data-nf-count]")).toHaveText(
        String(expected.length),
      );
      await expect(page.locator("[data-nf-desc]")).toHaveText(
        cfg.cats[cat] ?? "",
      );
      await expect(catControl(page, cat)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(catControl(page, "all")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await expect(page.locator("article[data-lead]")).toHaveCount(0);
      await expect(page.locator("[data-nf-live]")).toHaveText(
        `${cfg.cats[cat]} ${expected.length}건`,
      );

      await catControl(page, cat).click();
      await expect(page).toHaveURL(
        new RegExp(`${target.path.replace("./", "")}$`),
      );
      expect(await visibleIds(page)).toHaveLength(all.length);
      if (all.length > 1)
        await expect(page.locator("article[data-lead]")).toHaveCount(1);
    });

    test("주소 쿼리로 들어오면 첫 프레임부터 걸러져 있다 — 섬 JS가 없어도(부트 스크립트), 콘솔 오류 없음, 새로고침해도 유지", async ({
      page,
    }) => {
      await open(page, target.path);
      const all = await cards(page);
      const cat = filteringCategory(all);
      test.skip(cat === null, "거를 분류가 없는 호");
      if (!cat) return;
      const expected = all.filter((c) => c.cat === cat).map((c) => c.id);

      // 매 프레임 기록 — 거를 카드가 한 번이라도 보였는가
      await page.addInitScript((keep) => {
        const w = window as unknown as { __nf: number[] };
        w.__nf = [];
        const tick = () => {
          const shown = [
            ...document.querySelectorAll<HTMLElement>("li[data-nf-card]"),
          ].filter(
            (li) =>
              li.getClientRects().length > 0 &&
              getComputedStyle(li).visibility !== "hidden" &&
              li.getAttribute("data-nf-cat") !== keep,
          ).length;
          w.__nf.push(shown);
          if (w.__nf.length < 40) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, cat);

      // ① 섬 JS를 막아도(하이드레이션 없음) 부트 스크립트가 거른다
      await page.route(/\/_next\/static\/chunks\/.+\.js$/, (r) => r.abort());
      await page.goto(`${target.path}?cat=${cat}`);
      await page.waitForTimeout(500);
      expect(await visibleIds(page)).toEqual(expected);
      const framesNoJs = await page.evaluate(
        () => (window as unknown as { __nf: number[] }).__nf,
      );
      expect(framesNoJs.length).toBeGreaterThan(0);
      expect(framesNoJs.filter((n) => n > 0)).toEqual([]);
      await page.unroute(/\/_next\/static\/chunks\/.+\.js$/);
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(e.message));

      // ② JS를 켜고 다시 — 하이드레이션 뒤에도 같은 상태, 하이드레이션 불일치 등 콘솔 오류 없음
      await open(page, `${target.path}?cat=${cat}`);
      const frames = await page.evaluate(
        () => (window as unknown as { __nf: number[] }).__nf,
      );
      expect(frames.filter((n) => n > 0)).toEqual([]);
      expect(await visibleIds(page)).toEqual(expected);
      await expect(catControl(page, cat)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(
        await page.evaluate(() =>
          document.documentElement.hasAttribute("data-nf-pending"),
        ),
      ).toBe(false);
      expect(errors).toEqual([]);

      // ③ 새로고침
      await page.reload();
      await page.waitForLoadState("networkidle");
      expect(await visibleIds(page)).toEqual(expected);
    });

    test("대회 주소(?comp=) — 피드 머리 대회 색 면 + 약칭 + 해제(1023 이하에도), 해제 → 주소에서 comp만 빠지고 포커스는 보이는 눌린 분류", async ({
      page,
    }) => {
      await open(page, target.path);
      const all = await cards(page);
      const cfg = await config(page);
      const comp = busiestComp(all, cfg);
      const cat = filteringCategory(all);
      test.skip(comp === null || cat === null, "대회 카드가 없는 호");
      if (!comp || !cat) return;

      await open(page, `${target.path}?comp=${comp.toLowerCase()}&cat=${cat}`);
      const head = page.locator("[data-nf-head]");
      await expect(head).toHaveAttribute("data-comp", comp);
      await expect(page.locator("[data-nf-comp-badge]")).toHaveText(
        cfg.comps[comp]?.s ?? "",
      );
      const face = await head.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, fg: cs.color, top: cs.borderTopColor };
      });
      expect(face.bg).not.toBe("rgba(0, 0, 0, 0)");
      expect(face.top).toBe(face.bg);
      const clear = page.getByRole("button", { name: "해제 대회 필터" });
      await expect(clear).toBeVisible();
      // 1023 이하에는 대회 진입점이 없다(DECISIONS #11) — 목차는 숨김
      if (!wide(page))
        await expect(page.locator('nav[aria-label="뉴스 필터"]')).toBeHidden();

      await clear.click();
      await expect(page).toHaveURL(new RegExp(`\\?cat=${cat}$`));
      await expect(head).not.toHaveAttribute("data-comp");
      await expect(clear).toBeHidden();
      await expect(page.locator(":focus")).toHaveAttribute(
        "data-nf-value",
        cat,
      );
      await expect(page.locator(":focus")).toBeVisible();
    });

    test("0건 — 빈 상태(윤곽 0 · 안내 · 필터 해제) · 부제 0건, '필터 해제' → 전체 · 주소에서 필터가 빠진다", async ({
      page,
    }) => {
      await open(page, target.path);
      const all = await cards(page);
      const query = zeroQuery(all, await config(page));
      test.skip(query === null, "0건 조합이 없는 호");
      await open(page, `${target.path}?${query}`);
      expect(await visibleIds(page)).toEqual([]);
      const empty = page.locator("[data-nf-empty]");
      await expect(empty).toBeVisible();
      await expect(empty).toContainText(
        "이 조건에 맞는 소식이 이 호에는 없어요.",
      );
      await expect(page.locator("[data-nf-count]")).toHaveText("0");
      await empty.getByRole("button", { name: "필터 해제" }).click();
      await expect(empty).toBeHidden();
      expect(await visibleIds(page)).toHaveLength(all.length);
      expect(new URL(page.url()).search).toBe("");
      await expect(page.locator(":focus")).toHaveAttribute(
        "data-nf-value",
        "all",
      );
    });

    test("키보드 — Tab으로 분류 컨트롤에 닿고 Space로 켠다(포커스 링 보임)", async ({
      page,
    }) => {
      await open(page, target.path);
      const all = await cards(page);
      const cat = filteringCategory(all);
      test.skip(cat === null, "거를 분류가 없는 호");
      if (!cat) return;
      const control = catControl(page, cat);
      await control.focus();
      await page.keyboard.press("Space");
      await expect(control).toHaveAttribute("aria-pressed", "true");
      await expect(page).toHaveURL(new RegExp(`cat=${cat}`));
      await page.keyboard.press("Enter");
      await expect(control).toHaveAttribute("aria-pressed", "false");
      const outline = await control.evaluate(
        (el) => getComputedStyle(el).outlineStyle,
      );
      expect(outline).toBe("solid");
    });
  });
}

test("빌드 결과 — 목차의 보류 스크립트가 있는 페이지에는 설정 JSON과 부트 스크립트가 그 뒤에 있다", () => {
  const pages = sitePages().map((p) => ({
    file: p.file,
    html: readFileSync(path.join(outDir, p.file), "utf8"),
  }));
  const withFilter = pages.filter((p) => p.html.includes("data-nf-scope"));
  for (const { file, html } of withFilter) {
    const pending = html.indexOf("setAttribute('data-nf-pending'");
    const config = html.indexOf('id="news-filter-config"');
    const boot = html.indexOf(
      "d.documentElement.removeAttribute('data-nf-pending')",
    );
    expect(pending, file).toBeGreaterThan(-1);
    expect(config, file).toBeGreaterThan(pending);
    expect(boot, file).toBeGreaterThan(config);
  }
});

test("1023 이하 — 섬 JS가 없어도 부트 스크립트가 눌린 칩(한국 선수만, 줄 끝)이 보이게 칩 줄을 민다", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "칩 줄은 1023 이하");
  await open(page, "news/");
  test.skip((await cards(page)).length === 0, "카드가 없는 호");
  await page.route(/\/_next\/static\/chunks\/.+\.js$/, (r) => r.abort());
  await page.goto("news/?kr=1");
  await page.waitForTimeout(300);
  const row = await page.evaluate(() => {
    const r = document.querySelector("[data-nf-chips]") as HTMLElement;
    const chip = r.querySelector('[data-nf-key="kr"]') as HTMLElement;
    const a = r.getBoundingClientRect();
    const b = chip.getBoundingClientRect();
    return {
      scrollLeft: r.scrollLeft,
      inside: b.left >= a.left && b.right <= a.right,
      pressed: chip.getAttribute("aria-pressed"),
      pageX: window.scrollX,
    };
  });
  expect(row.pressed).toBe("true");
  expect(row.scrollLeft).toBeGreaterThan(0);
  expect(row.inside).toBe(true);
  expect(row.pageX).toBe(0);
});

test("홈 — 5줄은 필터와 무관하게 맨 위에 남고 피드만 거른다", async ({
  page,
}) => {
  await open(page, "./");
  const all = await cards(page);
  const cat = filteringCategory(all);
  test.skip(cat === null, "거를 분류가 없는 호");
  const brief = page.locator("[data-slot='today-brief']");
  const hadBrief = (await brief.count()) > 0;
  await open(page, `./?cat=${cat}`);
  if (hadBrief) {
    await expect(brief).toBeVisible();
    // 첫 섹션(main 맨 앞의 발행 지연 안내 — M1-37, 평소 숨김 — 다음)
    expect(
      await page.evaluate(() =>
        document.querySelector("main > section")?.getAttribute("data-slot"),
      ),
    ).toBe("today-brief");
  }
  expect((await visibleIds(page)).length).toBeLessThan(all.length);
});

test("같은 페이지 내비 링크는 필터를 풀고, 뒤로 가기는 필터 주소로 돌아온다", async ({
  page,
}) => {
  await open(page, "news/");
  const all = await cards(page);
  const cat = filteringCategory(all);
  test.skip(cat === null, "거를 분류가 없는 호");
  await open(page, `news/?cat=${cat}`);
  const nav = wide(page)
    ? page.locator('nav[aria-label="주요 메뉴"]')
    : page.locator('nav[aria-label="하단 탭"]');
  await nav.getByRole("link", { name: "뉴스" }).click();
  await expect(page).toHaveURL(new RegExp(`${basePath}/news/$`));
  await expect(page.locator("[data-nf-desc]")).toHaveText("중요도 순");
  expect(await visibleIds(page)).toHaveLength(all.length);
  await nav.getByRole("link", { name: "홈" }).click();
  await expect(page).toHaveURL(new RegExp(`${basePath}/$`));
  await page.goto(`news/?cat=${cat}`);
  await page.waitForLoadState("networkidle");
  await nav.getByRole("link", { name: "홈" }).click();
  await expect(page).toHaveURL(new RegExp(`${basePath}/$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`\\?cat=${cat}$`));
  await expect(page.locator("[data-nf-desc]")).not.toHaveText("중요도 순");
  expect((await visibleIds(page)).length).toBeLessThan(all.length);
});

// HTML이 나눠 도착해 파서가 피드 중간에서 쉬는 동안 브라우저가 칠해도, 거르기 전 카드는 보이지 않는다(목차 맨 앞 보류 스크립트 —
// <html data-nf-pending> → 필터 범위를 그리지 않음). 문서만 카드 10장 뒤에서 끊어 0.6초 늦게 보내는 작은 서버로 연다(나머지는 정적 서버로 넘김).
test.describe("스트리밍 중 첫 페인트", () => {
  let server: Server;
  let origin = "";

  test.beforeAll(async () => {
    // playwright.config.ts의 정적 서버(scripts/serve-out.ts)와 같은 포트
    const upstream = `http://127.0.0.1:${Number(process.env.PORT ?? 4173)}`;
    const html = readFileSync(path.join(outDir, "news", "index.html"), "utf8");
    let cut = -1;
    for (let i = 0; i < 10; i++)
      cut = html.indexOf("<li data-nf-card", cut + 1);
    server = createServer((req, res) => {
      if ((req.url ?? "").startsWith(`${basePath}/news/?`) && cut > 0) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.write(html.slice(0, cut));
        setTimeout(() => res.end(html.slice(cut)), 600);
        return;
      }
      get(`${upstream}${req.url ?? "/"}`, (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      }).on("error", () => res.writeHead(502).end());
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (address && typeof address === "object")
      origin = `http://127.0.0.1:${address.port}`;
  });

  test.afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test("카드 10장까지 온 채 멈춰 있는 동안에도 거를 카드가 칠해지지 않는다", async ({
    page,
  }) => {
    await open(page, "news/");
    const all = await cards(page);
    const cat = filteringCategory(all);
    test.skip(cat === null || all.length < 12, "거를 분류·카드 12장 미만");
    await page.addInitScript((keep) => {
      const w = window as unknown as { __nf: Array<[number, number]> };
      w.__nf = [];
      const start = performance.now();
      const tick = () => {
        const lis = [
          ...document.querySelectorAll<HTMLElement>("li[data-nf-card]"),
        ];
        const bad = lis.filter(
          (li) =>
            li.getClientRects().length > 0 &&
            getComputedStyle(li).visibility !== "hidden" &&
            li.getAttribute("data-nf-cat") !== keep,
        ).length;
        w.__nf.push([lis.length, bad]);
        if (performance.now() - start < 1500) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, cat);
    await page.goto(`${origin}${basePath}/news/?cat=${cat}`, {
      waitUntil: "commit",
    });
    await page.waitForTimeout(1600);
    const frames = await page.evaluate(
      () => (window as unknown as { __nf: Array<[number, number]> }).__nf,
    );
    // 끊긴 동안(카드 일부만 도착)의 프레임이 실제로 있었고, 그때도 거를 카드는 0
    expect(frames.some(([n]) => n > 0 && n < all.length)).toBe(true);
    expect(frames.filter(([, bad]) => bad > 0)).toEqual([]);
  });
});

// 필터 상태의 접근성(axe WCAG A/AA)·가로 넘침 — 대회 색 면·0건·팀 칸(색 면 + 팀) 상태. 필터 없는 상태는 a11y.spec·shell.spec이 본다
test.describe("필터 상태 — axe 0 · 가로 넘침 0", () => {
  for (const target of PAGES) {
    for (const scheme of ["light", "dark"] as const) {
      test(`${target.name} (${scheme}) — 대회+분류 · 0건 · 팀`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await open(page, target.path);
        const all = await cards(page);
        const cfg = await config(page);
        const comp = busiestComp(all, cfg);
        test.skip(comp === null, "대회 카드가 없는 호");
        if (!comp) return;
        const team =
          all
            .find((c) => c.comps.includes(comp))
            ?.teams.find((t) => t in cfg.teams) ?? null;
        const queries = [
          `comp=${comp.toLowerCase()}&kr=1`,
          zeroQuery(all, cfg),
          team ? `comp=${comp.toLowerCase()}&team=${team}` : null,
        ].filter((q): q is string => q !== null);
        for (const query of queries) {
          await open(page, `${target.path}?${query}`);
          const { violations } = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze();
          expect(
            violations.map(
              (v) =>
                `${query} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
            ),
          ).toEqual([]);
        }
      });
    }
  }

  for (const width of [375, 1023, 1024, 1279, 1280]) {
    test(`${width}px — 대회 색 면·팀 칸·0건에서 가로 넘침 0`, async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== "desktop",
        "폭별 검사는 desktop 프로젝트에서 한 번",
      );
      await page.setViewportSize({ width, height: 800 });
      for (const target of PAGES) {
        await open(page, target.path);
        const all = await cards(page);
        const cfg = await config(page);
        const comp = busiestComp(all, cfg);
        if (!comp) continue;
        const team =
          all
            .find((c) => c.comps.includes(comp))
            ?.teams.find((t) => t in cfg.teams) ?? null;
        for (const query of [
          `comp=${comp.toLowerCase()}&cat=${filteringCategory(all) ?? "other"}&kr=1`,
          team
            ? `comp=${comp.toLowerCase()}&team=${team}`
            : `comp=${comp.toLowerCase()}`,
          zeroQuery(all, cfg) ?? "",
        ]) {
          await open(page, `${target.path}?${query}`);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          expect(overflow, `${target.path}?${query}`).toBeLessThanOrEqual(0);
        }
      }
    });
  }
});

// 필터 컨트롤의 터치 타깃(44px — 칩은 ::after로 46px)·키보드 포커스 링(3px --ring, 색 면 안은 그 면 글자색, 둘레와 3:1 이상).
// 셸 e2e(shell.spec)는 데이터에 따라 행 수가 달라지는 목차를 건너뛰고 여기서 잰다.
test.describe("필터 컨트롤 — 44px · 포커스 링", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`${scheme} — 목차 행(1024 이상)·칩(1023 이하)·색 면 위 해제`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await open(page, "news/");
      const all = await cards(page);
      const comp = busiestComp(all, await config(page));
      test.skip(comp === null, "대회 카드가 없는 호");
      if (!comp) return;
      await open(page, `news/?comp=${comp.toLowerCase()}`);
      const selector = wide(page)
        ? 'nav[aria-label="뉴스 필터"] button:not([disabled]), [data-nf-head] button'
        : "[data-nf-chips] button:not([disabled]), [data-nf-head] button";
      const controls = page.locator(selector);
      const n = await controls.count();
      expect(n).toBeGreaterThan(2);
      const problems: string[] = [];
      for (let i = 0; i < n; i++) {
        const control = controls.nth(i);
        if (!(await control.isVisible())) continue;
        await control.focus();
        // 키보드 포커스로 보이게(:focus-visible) — Shift+Tab → Tab으로 같은 자리에 돌아온다
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        const info = await control.evaluate((el) => {
          const parse = (c: string) =>
            (/rgba?\(([^)]+)\)/.exec(c)?.[1] ?? "0,0,0,0")
              .split(/[,\s/]+/)
              .filter(Boolean)
              .map(Number);
          const lum = (p: number[]) => {
            const f = (v: number) => {
              const s = v / 255;
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            };
            return (
              0.2126 * f(p[0] ?? 0) +
              0.7152 * f(p[1] ?? 0) +
              0.0722 * f(p[2] ?? 0)
            );
          };
          let bg = parse(getComputedStyle(document.body).backgroundColor);
          for (let p = el.parentElement; p; p = p.parentElement) {
            const c = parse(getComputedStyle(p).backgroundColor);
            if (
              (c[3] ?? 1) > 0 &&
              c.length >= 3 &&
              !(c.length === 4 && c[3] === 0)
            ) {
              bg = c;
              break;
            }
          }
          const style = getComputedStyle(el);
          const probe = document.createElement("i");
          probe.style.color = style.getPropertyValue("--ring").trim();
          document.body.appendChild(probe);
          const ring = getComputedStyle(probe).color;
          probe.remove();
          const [a, b] = [lum(parse(style.outlineColor)), lum(bg)].sort(
            (x, y) => y - x,
          );
          // 누르는 영역 = 상자와 ::after 확장 중 큰 쪽
          const r = el.getBoundingClientRect();
          const after = getComputedStyle(el, "::after");
          const grow = (v: string) => Math.max(0, -(parseFloat(v) || 0));
          const w =
            after.content !== "none"
              ? r.width + grow(after.left) + grow(after.right)
              : r.width;
          const h =
            after.content !== "none"
              ? r.height + grow(after.top) + grow(after.bottom)
              : r.height;
          return {
            name: el.textContent?.trim().slice(0, 16),
            focused:
              document.activeElement === el && el.matches(":focus-visible"),
            ring:
              style.outlineStyle === "solid" &&
              style.outlineWidth === "3px" &&
              style.outlineColor === ring,
            ratio: ((a ?? 0) + 0.05) / ((b ?? 0) + 0.05),
            w,
            h,
          };
        });
        if (!info.focused || !info.ring || info.ratio < 3)
          problems.push(
            `${info.name}: 링 ${info.ring} 대비 ${info.ratio.toFixed(2)}`,
          );
        if (info.w < 44 || info.h < 44)
          problems.push(`${info.name}: ${info.w}×${info.h}`);
      }
      expect(problems).toEqual([]);
    });
  }
});

// 목차가 화면보다 긴 노트북 화면(M1-39 실측: 뉴스 필터 목차 820px — sticky top 16px라 1280×800·1366×768·1024×768에서 아래 행이
// 피드를 읽는 내내 화면 밖이었다). 목차는 화면 높이 − 32px(− 오프라인 띠)까지만 차지하고 넘치면 목차 안에서 스크롤한다(app-shell.tsx).
test.describe("짧은 화면의 목차 — 마지막 행까지 닿는다(목차 안 스크롤)", () => {
  /** 목차가 sticky로 화면 위 16px에 붙는 첫 스크롤 위치로 내린다. 지면이 짧아(카드가 적은 호) 붙지 않으면 false */
  async function stickToc(page: Page): Promise<boolean> {
    const nav = page.locator('nav[aria-label="뉴스 필터"]');
    return nav.evaluate(async (el) => {
      window.scrollTo(0, 0);
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top - 16 + 40);
      await new Promise(requestAnimationFrame);
      return Math.abs(el.getBoundingClientRect().top - 16) < 0.5;
    });
  }

  for (const [width, height] of [
    [1024, 768],
    [1280, 720],
    [1366, 768],
  ] as const) {
    test(`${width}×${height} — 목차가 붙은 채로 '한국 선수' 행까지 목차 안 스크롤로 닿는다 · 링 자리 · 행 위치 그대로 · Tab으로 일부만 보이는 행에 가면 마저 굴러온다`, async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== "desktop",
        "폭별 검사는 desktop 프로젝트에서 한 번",
      );
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await open(page, "news/");
      const nav = page.locator('nav[aria-label="뉴스 필터"]');
      test.skip((await nav.count()) === 0, "카드가 없는 호 — 목차 없음");
      test.skip(
        !(await stickToc(page)),
        "카드가 적은 호 — 지면이 짧아 목차가 붙지 않는다",
      );

      // 목차가 붙은 채로 목차를 끝까지 굴리면 마지막 행이 화면 안에 온다
      const geo = await nav.evaluate((el) => {
        const before = el.getBoundingClientRect();
        el.scrollTop = el.scrollHeight;
        const rows = el.querySelectorAll("button");
        const lastRow = rows[rows.length - 1]!.getBoundingClientRect();
        return {
          top: before.top,
          bottom: before.bottom,
          scrolls: el.scrollHeight > el.clientHeight,
          lastBottom: lastRow.bottom,
          // 행(196px)과 목차 안쪽 경계 사이 여백 — 포커스 링(3 + 2px) 자리
          padLeft: lastRow.left - el.getBoundingClientRect().left,
          padRight: el.getBoundingClientRect().right - lastRow.right,
          rowLeft: lastRow.left,
          rowWidth: lastRow.width,
          ticketLeft:
            document.querySelector("[data-ticket]")?.getBoundingClientRect()
              .left ?? NaN,
        };
      });
      expect(geo.top).toBe(16);
      expect(geo.bottom).toBeLessThanOrEqual(height - 16 + 0.5);
      expect(geo.scrolls).toBe(true);
      expect(geo.lastBottom).toBeLessThanOrEqual(height);
      expect(geo.padLeft).toBeGreaterThanOrEqual(5);
      expect(geo.padRight).toBeGreaterThanOrEqual(5);
      // 행 위치·폭은 목차 열(232 = 행 196 + 오른쪽 여백 36) 그대로 — 티켓 왼쪽 끝에서 시작
      expect(geo.rowLeft).toBe(geo.ticketLeft);
      expect(geo.rowWidth).toBe(196);

      // 키보드: 마지막 행을 목차 아래 끝에 반쯤 걸치게 굴려 두고(일부만 보임 — 아래 setup.partial로 확인), 바로 앞 행에서 Tab →
      // 행과 링(5px)이 목차 안쪽에 다 들어와야 한다. 세로 목차는 Chrome의 Tab 포커스 스크롤만으로도 굴러온다(2026-10-24 실측 — 필터 섬
      // focusin을 끈 빌드에서도 통과, scroll-padding 6px가 링 자리). 가로 칩 줄은 Chrome이 굴리지 않아 섬이 맡는다(a11y.spec 375 포커스 링 검사)
      const setup = await nav.evaluate((el) => {
        const rows = [
          ...el.querySelectorAll<HTMLButtonElement>("button"),
        ].filter((b) => !b.disabled);
        const last = rows.at(-1)!;
        const prev = rows.at(-2)!;
        el.scrollTop = el.scrollHeight;
        const navBottom =
          el.getBoundingClientRect().top + el.clientTop + el.clientHeight;
        const r = last.getBoundingClientRect();
        // 행 아래 끝이 목차 안쪽 아래 끝보다 행 높이 절반만큼 아래에 오게
        el.scrollTop -= navBottom - r.bottom + r.height / 2;
        const half = last.getBoundingClientRect();
        prev.focus();
        return {
          partial: half.top < navBottom && half.bottom > navBottom,
          prevVisible: prev.getBoundingClientRect().bottom <= navBottom,
        };
      });
      expect(setup).toEqual({ partial: true, prevVisible: true });
      await page.keyboard.press("Tab");
      const after = await nav.evaluate((el) => {
        const active = document.activeElement as HTMLElement;
        const rows = [
          ...el.querySelectorAll<HTMLButtonElement>("button"),
        ].filter((b) => !b.disabled);
        const r = active.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        const innerTop = box.top + el.clientTop;
        const innerBottom = innerTop + el.clientHeight;
        return {
          isLast: active === rows.at(-1),
          focusVisible: active.matches(":focus-visible"),
          ringInside:
            r.top - 5 >= innerTop - 0.5 && r.bottom + 5 <= innerBottom + 0.5,
        };
      });
      expect(after).toEqual({
        isLast: true,
        focusVisible: true,
        ringInside: true,
      });
    });
  }

  test("1280×1000 — 목차가 다 들어가는 화면에서는 스크롤 없음(모양 변화 없음)", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "폭별 검사는 desktop 프로젝트에서 한 번",
    );
    await page.setViewportSize({ width: 1280, height: 1000 });
    await open(page, "news/");
    const nav = page.locator('nav[aria-label="뉴스 필터"]');
    test.skip((await nav.count()) === 0, "카드가 없는 호 — 목차 없음");
    const scrolls = await nav.evaluate(
      (el) => el.scrollHeight > el.clientHeight,
    );
    expect(scrolls).toBe(false);
  });

  test("오프라인 띠가 보이면(1024 이상 화면 아래) 목차 높이에서 띠 높이를 뺀다 — 끝 행이 띠에 가리지 않는다", async ({
    page,
    context,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "폭별 검사는 desktop 프로젝트에서 한 번",
    );
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "news/");
    const nav = page.locator('nav[aria-label="뉴스 필터"]');
    test.skip((await nav.count()) === 0, "카드가 없는 호 — 목차 없음");
    test.skip(
      !(await stickToc(page)),
      "카드가 적은 호 — 지면이 짧아 목차가 붙지 않는다",
    );
    await context.setOffline(true);
    const band = page.locator('[data-slot="offline-band"]');
    await expect(band.getByText("오프라인")).toBeVisible();
    // 섬이 띠 높이를 재 변수로 달 때까지
    await expect
      .poll(() =>
        page.evaluate(() =>
          parseFloat(
            document.documentElement.style.getPropertyValue(
              "--offline-band-h",
            ) || "0",
          ),
        ),
      )
      .toBeGreaterThan(0);
    const geo = await nav.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      const rows = el.querySelectorAll("button");
      const last = rows[rows.length - 1]!.getBoundingClientRect();
      const bandTop = document
        .querySelector('[data-slot="offline-band"]')!
        .getBoundingClientRect().top;
      return {
        navBottom: el.getBoundingClientRect().bottom,
        lastBottom: last.bottom,
        bandTop,
      };
    });
    expect(geo.navBottom).toBeLessThanOrEqual(geo.bandTop - 16 + 0.5);
    expect(geo.lastBottom).toBeLessThanOrEqual(geo.bandTop);
    await context.setOffline(false);
  });
});

// 1023 이하 칩 줄 — 화면 끝에 일부만 보이는 칩을 손가락으로 누르면 눌린다(M1-39 리뷰: 누름 포커스로 칩 줄을 굴리면 click이 빗나갔다).
// 키보드로 간 칩은 굴러와 다 보인다(a11y.spec 포커스 링 검사 — 스크롤 상자에 잘리지 않음).
test("375 — 칩 줄 끝에 일부만 보이는 칩을 탭하면 그 칩이 눌린다(누름에는 칩 줄을 굴리지 않는다)", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile",
    "터치 — mobile 프로젝트(375 · hasTouch)",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "news/");
  const target = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>("[data-nf-chips]");
    if (!row) return null;
    const right = row.getBoundingClientRect().right;
    const chip = [...row.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => {
        const r = b.getBoundingClientRect();
        return !b.disabled && r.left < right - 12 && r.right > right;
      },
    );
    if (!chip) return null;
    chip.scrollIntoView({ block: "center", inline: "nearest" });
    // 세로만 가운데로 — 가로 위치는 칩 줄의 처음 상태 그대로(위 scrollIntoView가 칩 줄을 굴렸으면 되돌린다)
    row.scrollLeft = 0;
    const r = chip.getBoundingClientRect();
    return {
      label: chip.textContent ?? "",
      x: (r.left + right) / 2,
      y: r.top + r.height / 2,
      partial: r.left < right && r.right > right,
    };
  });
  test.skip(
    target === null,
    "칩 줄이 화면 안에 다 들어온다 — 일부만 보이는 칩 없음",
  );
  expect(target!.partial).toBe(true);
  await page.touchscreen.tap(target!.x, target!.y);
  const chip = page
    .locator("[data-nf-chips] button")
    .filter({ hasText: target!.label.trim() });
  await expect(chip).toHaveAttribute("aria-pressed", "true");
});
