import { expect, test, type Page } from "@playwright/test";

import { loadLatestNews } from "../../src/lib/data/news";
import { loadProdRuns } from "../../src/lib/data/runs";
import { issueMeta } from "../../src/lib/issue";
import { FOOTBALL_DATA_ATTRIBUTION, REPO_URL } from "../../src/lib/site";
import { formatKst, kstDayRangeUtc } from "../../src/lib/time";
import { basePath } from "./support/site";

// 앱 셸 e2e (M1-30 — PRD DR-01·FR-142·FR-45, DESIGN §4.3·§4.4·§7·§9.3·§10) — 빌드 결과(out/)에서
// 폭별 1단·2단 경계(1023/1024 · 1279/1280)의 내비 보임·가로 넘침·열 구성, 마스트헤드 호수·시각(데이터에서 계산), 뒤표지 문구,
// 건너뛰기 링크, 하단 탭 sticky, 터치 타깃·포커스 링을 본다. 기대 값은 data/와 src/lib에서 계산한다(하드코딩하지 않는다).

/** 경계 폭 — 1023 이하 1단 · 1024~1279 2단 · 1280 이상 3단(M1은 마주 보는 면이 없어 1280 이상도 목차 · 지면 2단, 404는 지면 한 열) */
const WIDTHS = [375, 1023, 1024, 1279, 1280] as const;

/** 셸을 쓰는 페이지 — [goto 경로, 현재 탭(없으면 null), h1] */
const PAGES = [
  { path: "./", current: "홈", h1: "유로 다이제스트" },
  { path: "news/", current: "뉴스", h1: "뉴스" },
  {
    path: "this-page-does-not-exist/",
    current: null,
    h1: "페이지를 찾을 수 없습니다",
  },
] as const;

const NAV_LABELS = ["홈", "뉴스", "리그"];

// 폭은 테스트가 정하므로 desktop 프로젝트에서 한 번만 돈다(모바일 에뮬레이션이 필요한 sticky 검사는 아래 따로)
function desktopOnly(projectName: string): void {
  test.skip(
    projectName !== "desktop",
    "폭별 검사는 desktop 프로젝트에서 한 번",
  );
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

for (const width of WIDTHS) {
  const wide = width >= 1024;
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    for (const target of PAGES) {
      test(`${target.path} — 가로 넘침 0 · ${wide ? "상단 내비" : "하단 탭"}만 보임(홈·뉴스·리그 — M2-10) · 현재 탭 · h1 하나`, async ({
        page,
      }, testInfo) => {
        desktopOnly(testInfo.project.name);
        await open(page, target.path);

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);

        // 숨긴 쪽 내비도 항목을 본다(display: none은 접근성 트리에 없어 getByRole로는 못 찾는다)
        const top = page.locator('nav[aria-label="주요 메뉴"]');
        const bottom = page.locator('nav[aria-label="하단 탭"]');
        await expect(wide ? top : bottom).toBeVisible();
        await expect(wide ? bottom : top).toBeHidden();

        for (const nav of [top, bottom]) {
          const links = nav.locator("a");
          await expect(links).toHaveText(NAV_LABELS);
          await expect(links.nth(0)).toHaveAttribute("href", `${basePath}/`);
          await expect(links.nth(1)).toHaveAttribute(
            "href",
            `${basePath}/news/`,
          );
          const current = nav.locator('[aria-current="page"]');
          if (target.current) await expect(current).toHaveText(target.current);
          else await expect(current).toHaveCount(0);
        }

        await expect(page.getByRole("heading", { level: 1 })).toHaveText([
          target.h1,
        ]);
      });
    }

    test("열 구성: 홈·뉴스는 카드가 있으면 목차 열(M1-33) — 1024 이상 232 · 1fr 2단, 마주 보는 면 없음 · 404는 지면 한 열 · 티켓 스텁 열 232px", async ({
      page,
    }, testInfo) => {
      desktopOnly(testInfo.project.name);
      const hasCards = (loadLatestNews()?.cards.length ?? 0) > 0;
      for (const path of ["./", "news/"]) {
        await open(page, path);
        const grid = await page.evaluate(() => {
          const main = document.querySelector("main#main") as HTMLElement;
          const ticket = document.querySelector("[data-ticket]") as HTMLElement;
          return {
            columns: main.parentElement?.getAttribute("data-columns"),
            display: getComputedStyle(main.parentElement as HTMLElement)
              .display,
            mainLeft: main.getBoundingClientRect().left,
            mainWidth: main.getBoundingClientRect().width,
            ticketLeft: ticket.getBoundingClientRect().left,
            ticketWidth: ticket.getBoundingClientRect().width,
            aside: document.querySelectorAll("aside").length,
          };
        });
        expect(grid.aside).toBe(0);
        if (!hasCards) {
          expect(grid.columns).toBe("none");
          continue;
        }
        expect(grid.columns).toBe("contents");
        // 1024 이상: 목차 232px 뒤 지면(728 @1024 · 984 @1280) · 1023 이하: 지면 한 열(목차 숨김)
        expect(grid.display).toBe(wide ? "grid" : "block");
        expect(grid.mainLeft).toBe(grid.ticketLeft + (wide ? 232 : 0));
        expect(grid.mainWidth).toBe(grid.ticketWidth - (wide ? 232 : 0));
        await expect(page.locator('nav[aria-label="뉴스 필터"]'))[
          wide ? "toBeVisible" : "toBeHidden"
        ]();
      }
      await open(page, "this-page-does-not-exist/");
      const layout = await page.evaluate(() => {
        const main = document.querySelector("main#main") as HTMLElement;
        const grid = main.parentElement as HTMLElement;
        const ticket = document.querySelector("[data-ticket]") as HTMLElement;
        return {
          display: getComputedStyle(grid).display,
          mainLeft: main.getBoundingClientRect().left,
          mainWidth: main.getBoundingClientRect().width,
          ticketLeft: ticket.getBoundingClientRect().left,
          ticketWidth: ticket.getBoundingClientRect().width,
          ticketCols: getComputedStyle(ticket).gridTemplateColumns,
          aside: document.querySelectorAll("aside").length,
          contents: document.querySelectorAll('nav[aria-label="뉴스 필터"]')
            .length,
        };
      });
      expect(layout.display).toBe("block");
      expect(layout.aside).toBe(0);
      expect(layout.contents).toBe(0);
      // 지면 = 티켓과 같은 폭(좌우 --edge 안 — 375 16px · 1024 이상 32px, 1280 최대 폭)
      expect(layout.mainLeft).toBe(layout.ticketLeft);
      expect(layout.mainWidth).toBe(layout.ticketWidth);
      expect(layout.ticketLeft).toBe(wide ? 32 : 16);
      expect(layout.ticketWidth).toBe(Math.min(width, 1280) - (wide ? 64 : 32));
      // 티켓 격자: 1023 이하 auto·1fr·auto(3열) / 1024 이상 232 · 4 · 1fr · auto
      const cols = layout.ticketCols.split(" ");
      if (wide) {
        expect(cols).toHaveLength(4);
        expect(cols.slice(0, 2)).toEqual(["232px", "4px"]);
      } else {
        expect(cols).toHaveLength(3);
      }
    });
  });
}

test.describe("마스트헤드·뒤표지 — 데이터에서 계산한 호수·시각(DESIGN §9.3, FR-142)", () => {
  const news = loadLatestNews();
  const meta = news ? issueMeta(news, loadProdRuns()) : null;

  test("제 N호 · 발행일 · 발행·업데이트 HH:MM KST · 마지막 업데이트(상단 내비·뒤표지)", async ({
    page,
  }) => {
    test.skip(meta === null, "data/news에 발행된 호가 없다");
    if (!meta) return;
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, "./");
    const ticket = page.locator("[data-ticket]");
    const time = (iso: string) => `${formatKst(iso, "time")} KST`;

    if (meta.no !== null) await expect(ticket).toContainText(`제${meta.no}호`);
    await expect(ticket.locator(`time[datetime="${meta.date}"]`)).toHaveText(
      formatKst(kstDayRangeUtc(meta.date).start, "fullDate"),
    );
    // 발행 = 업데이트인 날(실행 하나)도 있어 datetime이 아니라 앞 글자로 줄을 찾는다
    for (const [label, iso] of [
      ["발행", meta.publishedAt],
      ["업데이트", meta.updatedAt],
    ] as const) {
      const line = ticket
        .locator("span")
        .filter({ hasText: new RegExp(`^${label} `) });
      await expect(line).toHaveText(`${label} ${time(iso)}`);
      await expect(line.locator("time")).toHaveAttribute("datetime", iso);
    }
    await expect(
      page.getByRole("navigation", { name: "주요 메뉴" }),
    ).toContainText(`마지막 업데이트 ${time(meta.updatedAt)}`);

    const footer = page.getByRole("contentinfo");
    await expect(footer).toContainText(
      `마지막 업데이트 ${time(meta.updatedAt)}`,
    );
    if (meta.no !== null) await expect(footer).toContainText(`제 ${meta.no}호`);
  });

  test("뒤표지: football-data 필수 문구 원문(lang=en) · API-Football 병기 · AI 작성 고지 문장 · /about 링크 3개 + GitHub(새 창)", async ({
    page,
  }) => {
    await open(page, "./");
    const footer = page.getByRole("contentinfo");
    await expect(footer.locator('p[lang="en"]')).toHaveText(
      FOOTBALL_DATA_ATTRIBUTION,
    );
    await expect(footer).toContainText("API-Football");
    // 설명 문단의 오늘의 5줄 AI 작성 고지(M1-32 — /about#ai와 같은 사실). 라벨 링크("AI 작성")는 뒤표지에 없다
    await expect(footer).toContainText(
      "AI가 쓴 줄에만 ‘AI 작성’ 라벨을 붙입니다.",
    );
    await expect(footer).toContainText(
      "AI 답을 쓸 수 없는 날은 모든 줄을 코드 문장으로 싣습니다.",
    );
    await expect(footer).toContainText("뉴스 카드는 AI 없이 원문 제목 그대로");
    await expect(
      footer.getByRole("link", { name: "AI 작성", exact: true }),
    ).toHaveCount(0);
    // /about 링크(M1-36 — 순서·앵커는 tests/e2e/about.spec.ts) + GitHub. 개인정보 처리방침(/privacy/)은 M5-05
    const links = footer.getByRole("link");
    await expect(links).toHaveCount(4);
    await expect(links.last()).toHaveAttribute("href", REPO_URL);
    await expect(links.last()).toHaveAttribute("target", "_blank");
  });
});

test.describe("건너뛰기 링크(DESIGN §10)", () => {
  test("첫 Tab = '본문 바로가기'(화면 안에 나타남) → Enter로 main#main에 포커스", async ({
    page,
  }) => {
    await open(page, "./");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "본문 바로가기" });
    await expect(skip).toBeFocused();
    const box = await skip.boundingBox();
    expect(box?.y).toBeGreaterThanOrEqual(0);
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  });

  // 링 대비는 부모 요소 배경이 아니라 실제로 그려진 색으로 잰다 — 링크가 나타나는 왼쪽 위 8px은 티켓 위라서(라이트 티켓 = 잉크와
  // 같은 네이비, 다크 = 벽돌 레드) 부모(body = 지면) 기준으로 재면 잘못 통과한다(M1-30 리뷰). 화면을 찍어 네 변 가운데에서
  // 상자 면 · 상자와 링 사이(2px) · 링(3px) · 링 바깥 색을 뽑고, 링은 양옆 색과, 상자는 둘레 색과 비텍스트 내부 하한 3.4:1 이상을 본다.
  for (const [width, colorScheme] of [
    [375, "light"],
    [375, "dark"],
    [1280, "light"],
    [1280, "dark"],
  ] as const) {
    test(`${width}px ${colorScheme} — 포커스한 건너뛰기 링크의 링·상자가 실제 둘레 색과 3.4:1 이상(화면 픽셀)`, async ({
      page,
    }, testInfo) => {
      desktopOnly(testInfo.project.name);
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await open(page, "./");
      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", { name: "본문 바로가기" });
      await expect(skip).toBeFocused();
      const box = await skip.boundingBox();
      if (!box) throw new Error("건너뛰기 링크 상자 없음");
      const { offset, ring } = await skip.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          offset: Number.parseFloat(style.outlineOffset),
          ring: Number.parseFloat(style.outlineWidth),
        };
      });
      expect([offset, ring]).toEqual([2, 3]);

      // 변마다 [상자 면, 사이, 링 가운데, 링 바깥] 점(CSS px)
      const left = box.x;
      const right = box.x + box.width;
      const top = box.y;
      const bottom = box.y + box.height;
      const midX = box.x + box.width / 2;
      const midY = box.y + box.height / 2;
      const sides: Record<string, Array<[number, number]>> = {
        left: [
          [left + 3, midY],
          [left - offset / 2, midY],
          [left - offset - ring / 2, midY],
          [left - offset - ring - 1, midY],
        ],
        right: [
          [right - 3, midY],
          [right + offset / 2, midY],
          [right + offset + ring / 2, midY],
          [right + offset + ring + 1, midY],
        ],
        top: [
          [midX, top + 3],
          [midX, top - offset / 2],
          [midX, top - offset - ring / 2],
          [midX, top - offset - ring - 1],
        ],
        bottom: [
          [midX, bottom - 3],
          [midX, bottom + offset / 2],
          [midX, bottom + offset + ring / 2],
          [midX, bottom + offset + ring + 1],
        ],
      };
      const png = await page.screenshot({ scale: "css" });
      const points = Object.values(sides).flat();
      // 찍은 PNG를 페이지 안 캔버스로 풀어 점마다 RGB를 읽는다(새 의존성 없음)
      const colors = await page.evaluate(
        async ({ b64, points }) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const bitmap = await createImageBitmap(
            new Blob([bytes], { type: "image/png" }),
          );
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("2d 캔버스 없음");
          ctx.drawImage(bitmap, 0, 0);
          return points.map(([x, y]) => {
            const d = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
            return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
          });
        },
        { b64: png.toString("base64"), points },
      );
      const lum = (rgb: number[]) =>
        rgb
          .map((v) => {
            const c = v / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          })
          .reduce(
            (sum, c, i) => sum + c * ([0.2126, 0.7152, 0.0722][i] ?? 0),
            0,
          );
      const contrast = (a: number[], b: number[]) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
      };
      const ringRgb = await skip.evaluate((el) => {
        const probe = document.createElement("i");
        probe.style.color = getComputedStyle(el).getPropertyValue("--ring");
        document.body.appendChild(probe);
        const rgb = getComputedStyle(probe).color;
        probe.remove();
        return (rgb.match(/\d+/g) ?? []).map(Number);
      });
      const problems: string[] = [];
      const measured: string[] = [];
      Object.keys(sides).forEach((side, i) => {
        const [face, gap, ringPx, outside] = colors.slice(i * 4, i * 4 + 4) as [
          number[],
          number[],
          number[],
          number[],
        ];
        // 링 가운데 점이 정말 --ring 색인지(잘못 뽑으면 대비가 뜻이 없다)
        if (ringPx.some((v, k) => Math.abs(v - (ringRgb[k] ?? -99)) > 2)) {
          problems.push(`${side}: 링 점 ${ringPx} ≠ --ring ${ringRgb}`);
        }
        const pairs = {
          "링/바깥": contrast(ringPx, outside),
          "링/사이": contrast(ringPx, gap),
          "상자/사이": contrast(face, gap),
        };
        measured.push(
          `${side} ${Object.entries(pairs)
            .map(([k, v]) => `${k} ${v.toFixed(2)}`)
            .join(" · ")}`,
        );
        for (const [name, ratio] of Object.entries(pairs)) {
          if (ratio < 3.4) problems.push(`${side} ${name} ${ratio.toFixed(2)}`);
        }
      });
      testInfo.annotations.push({
        type: "건너뛰기 링크 대비",
        description: measured.join(" / "),
      });
      expect(problems).toEqual([]);
    });
  }
});

test.describe("하단 탭 sticky(1023 이하 — DESIGN §4.4)", () => {
  test("화면 아래 붙어 있다가 끝까지 내리면 뒤표지 바로 아래에 놓여 아무것도 가리지 않는다", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "375 모바일 프로젝트");
    await open(page, "./");
    const viewport = page.viewportSize();
    const tabs = page.getByRole("navigation", { name: "하단 탭" });
    const atTop = await tabs.boundingBox();
    expect(atTop).not.toBeNull();
    expect(Math.round((atTop?.y ?? 0) + (atTop?.height ?? 0))).toBe(
      viewport?.height,
    );
    // 탭 높이 58px + 위 괘선 1px(DESIGN §9.2), z 20(§4.4)
    expect(Math.round(atTop?.height ?? 0)).toBe(59);
    expect(await tabs.evaluate((el) => getComputedStyle(el).zIndex)).toBe("20");

    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const end = await page.evaluate(() => {
      const footer = document.querySelector("footer") as HTMLElement;
      const nav = document.querySelector(
        'nav[aria-label="하단 탭"]',
      ) as HTMLElement;
      return {
        footerBottom: footer.getBoundingClientRect().bottom,
        tabsTop: nav.getBoundingClientRect().top,
        tabsBottom: nav.getBoundingClientRect().bottom,
        innerHeight: window.innerHeight,
      };
    });
    expect(end.footerBottom).toBeLessThanOrEqual(end.tabsTop + 0.5);
    expect(Math.round(end.tabsBottom)).toBe(end.innerHeight);
  });
});

test.describe("터치 타깃·포커스 링(DESIGN §9.1·§10)", () => {
  for (const [width, colorScheme] of [
    [375, "light"],
    [375, "dark"],
    [1280, "light"],
    [1280, "dark"],
  ] as const) {
    test(`${width}px ${colorScheme} — 셸의 링크·버튼은 44px 이상, 키보드 포커스 링은 3px --ring(색 면 안은 그 면 글자색), 둘레와 3:1 이상`, async ({
      page,
    }, testInfo) => {
      desktopOnly(testInfo.project.name);
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await open(page, "./");

      const small = await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            "header a, header button, footer a, nav[aria-label='하단 탭'] a",
          ),
        ]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              name: el.textContent?.trim() || el.ariaLabel,
              w: r.width,
              h: r.height,
            };
          })
          .filter((r) => r.w < 44 || r.h < 44)
          .map((r) => `${r.name} ${r.w}×${r.h}`),
      );
      expect(small).toEqual([]);

      // 셸 안 포커스 대상(건너뛰기 링크 → 티켓 → 내비 → … → 뒤표지 → 하단 탭)을 Tab으로 돌며 링을 잰다(본문 카드 링크는 건너뜀)
      const problems: string[] = [];
      let checked = 0;
      for (let i = 0; i < 200; i++) {
        await page.keyboard.press("Tab");
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return { done: true } as const;
          const w = window as unknown as { __seen?: WeakSet<Element> };
          w.__seen ??= new WeakSet();
          if (w.__seen.has(el)) return { done: true } as const;
          w.__seen.add(el);
          // 본문과 뉴스 필터 목차(M1-33 — 데이터에 따라 행 수가 달라 tests/e2e/news-filter.spec.ts가 따로 잰다)는 건너뛴다
          if (el.closest("main, nav[aria-label='뉴스 필터']"))
            return { skip: true } as const;
          const parse = (c: string) => {
            const m = /rgba?\(([^)]+)\)/.exec(c);
            const p = (m?.[1] ?? "0,0,0,0")
              .split(/[,\s/]+/)
              .filter(Boolean)
              .map(Number);
            return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
          };
          const lum = ([r, g, b]: number[]) => {
            const f = (v: number) => {
              const s = v / 255;
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * f(r ?? 0) + 0.7152 * f(g ?? 0) + 0.0722 * f(b ?? 0);
          };
          let bgEl: Element | null = el.parentElement;
          let bg = parse(getComputedStyle(document.body).backgroundColor);
          while (bgEl) {
            const c = parse(getComputedStyle(bgEl).backgroundColor);
            if ((c[3] ?? 0) > 0) {
              bg = c;
              break;
            }
            bgEl = bgEl.parentElement;
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
          return {
            name:
              el.getAttribute("aria-label") ??
              el.textContent?.trim().slice(0, 20) ??
              el.tagName,
            ok:
              el.matches(":focus-visible") &&
              style.outlineStyle === "solid" &&
              style.outlineWidth === "3px" &&
              style.outlineColor === ring,
            ratio: ((a ?? 0) + 0.05) / ((b ?? 0) + 0.05),
            outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor} (--ring ${ring})`,
          };
        });
        if ("done" in info) break;
        if ("skip" in info) continue;
        checked += 1;
        if (!info.ok || info.ratio < 3) {
          problems.push(
            `${info.name}: ${info.outline} 대비 ${info.ratio.toFixed(2)}`,
          );
        }
      }
      // 건너뛰기 · 워드마크 · 테마 토글 · (1024 이상 상단 내비 3 — 리그 M2-10) · 뒤표지 4(AI 작성 고지 · 소개·출처 정책 · 삭제·정정 요청 —
      // M1-36 · GitHub) · (1023 이하 하단 탭 3)
      expect(checked).toBe(10);
      expect(problems).toEqual([]);
    });
  }
});
