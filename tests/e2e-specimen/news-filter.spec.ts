import { mkdirSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  SCHEMES,
  touchTargetFailures,
  waitForFonts,
  waitForHydration,
} from "./support";

// 뉴스 필터 견본 e2e (M1-33 — PRD FR-31·FR-32, DESIGN §2.4·§6·§9.2·§9.3, DECISIONS D0 §4 B · §5 #11·#13) — SPECIMEN=1 빌드 전용.
// 홈 견본(`/specimen/home/` — src/app/specimen/home/page.specimen.tsx)은 실제 홈과 같은 조립을 혼합안 홈과 같은 fixtures(2026-10-11 호 23장)로
// 싣는다 → 목차 건수·모양·대회 색 면·0건 상태를 결정적으로 본다. 실제 호의 동작(주소 동기화·첫 페인트·스트리밍)은 tests/e2e/news-filter.spec.ts.

const HOME = "specimen/home/";
const SHOTS_DIR = path.resolve(
  process.env.SPECIMEN_SHOTS_DIR ?? "test-results/specimen-shots",
);
const WIDTHS = [375, 1023, 1024, 1279, 1280] as const;
const COMPS = [
  ["EPL", "epl"],
  ["LALIGA", "laliga"],
  ["SERIEA", "seriea"],
  ["BUNDESLIGA", "bundesliga"],
  ["LIGUE1", "ligue1"],
  ["UCL", "ucl"],
] as const;

/** 상태별 주소 쿼리 — 시안 견본과 같은 조합(대회 EPL · 분류 이적 · 0건 리그 1 + UCL) + 팀(주소로만) */
const STATES = [
  ["none", ""],
  ["comp", "?comp=epl"],
  ["cat", "?cat=transfer"],
  ["zero", "?comp=ligue1&cat=ucl"],
  ["team", "?comp=epl&team=tottenham-hotspur"],
] as const;

async function open(page: Page, query = ""): Promise<void> {
  const response = await page.goto(`${HOME}${query}`);
  expect(response?.status()).toBe(200);
  await waitForFonts(page);
  await waitForHydration(page);
}

async function visibleIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll("li[data-nf-card]:not([hidden]) > article"),
    ].map((a) => a.id),
  );
}

function contrast(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = (/rgba?\(([^)]+)\)/.exec(c)?.[1] ?? "0,0,0")
      .split(/[,\s/]+/)
      .map(Number)
      .map((v) => {
        const s = (v ?? 0) / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (bl ?? 0);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
}

test.describe("목차(1024 이상) — 혼합안 홈과 같은 건수·모양", () => {
  for (const width of [1024, 1280] as const) {
    test(`${width}px — 대회 6 · 분류 8 · 한국 선수 1, 0건 비활성, 열 196px · 행 44px · 평탄 탭 42×22`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      const nav = page.locator('nav[aria-label="뉴스 필터"]');
      await expect(nav).toBeVisible();
      const rows = nav.locator("button[data-nf-key]");
      expect(await rows.allTextContents()).toEqual([
        "EPL프리미어리그 ✓8건",
        "라리가라리가 ✓6건",
        "세리에A세리에 A ✓3건",
        "분데스분데스리가 ✓3건",
        "리그1리그 1 ✓0건",
        "UCLUEFA 챔피언스리그 ✓0건",
        "전체23건",
        "경기 결과7건",
        "이적4건",
        "부상1건",
        "감독·구단4건",
        "대표팀4건",
        "UCL0건",
        "기타3건",
        "한국 선수 관련만5건",
      ]);
      const geometry = await rows.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          const tab = el.firstElementChild as HTMLElement;
          const t = tab.getBoundingClientRect();
          const count = el.lastElementChild as HTMLElement;
          const cs = getComputedStyle(count);
          return {
            x: r.x,
            w: r.width,
            h: r.height,
            disabled: (el as HTMLButtonElement).disabled,
            tab:
              el.getAttribute("data-nf-key") === "comp"
                ? [t.width, t.height]
                : null,
            count: [
              cs.fontSize,
              cs.fontVariantNumeric.includes("tabular-nums"),
            ],
          };
        }),
      );
      for (const g of geometry) {
        expect(g.x).toBe(32);
        expect(g.w).toBe(196);
        expect(g.h).toBeGreaterThanOrEqual(44);
        expect(g.count).toEqual(["17px", true]);
        if (g.tab) {
          expect(g.tab[0]).toBeGreaterThanOrEqual(42);
          expect(g.tab[1]).toBe(22);
        }
      }
      expect(geometry.map((g) => g.disabled)).toEqual([
        false,
        false,
        false,
        false,
        true,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
      ]);
      // 묶음 이름 12px 800 --ink-2(시안 .ct-h)
      const labels = await nav.locator("p[id^='nf-']").evaluateAll((els) =>
        els.map((el) => {
          const cs = getComputedStyle(el);
          return [el.textContent, cs.fontSize, cs.fontWeight];
        }),
      );
      expect(labels).toEqual([
        ["대회", "12px", "800"],
        ["분류", "12px", "800"],
        ["한국 선수", "12px", "800"],
      ]);
    });
  }
});

test.describe("대회 필터 머리 색 면 — 대회 6색·면 위 글자 대비·200ms 전환", () => {
  for (const scheme of SCHEMES) {
    test(`${scheme} — ?comp= 6개 대회`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.emulateMedia({
        colorScheme: scheme,
        reducedMotion: "no-preference",
      });
      for (const [id, key] of COMPS) {
        await open(page, `?comp=${key}`);
        const face = await page.locator("[data-nf-head]").evaluate((el, k) => {
          const cs = getComputedStyle(el);
          const probe = document.createElement("i");
          probe.style.color = `var(--competition-${k})`;
          document.body.appendChild(probe);
          const token = getComputedStyle(probe).color;
          probe.style.color = `var(--competition-${k}-foreground)`;
          const fg = getComputedStyle(probe).color;
          probe.style.color = cs.getPropertyValue("--ring").trim();
          const ring = getComputedStyle(probe).color;
          probe.remove();
          return {
            comp: el.getAttribute("data-comp"),
            bg: cs.backgroundColor,
            color: cs.color,
            top: cs.borderTopColor,
            token,
            fg,
            ring,
            transition: cs.transitionProperty,
            duration: cs.transitionDuration,
          };
        }, key);
        expect(face.comp).toBe(id);
        expect(face.bg).toBe(face.token);
        expect(face.top).toBe(face.token);
        expect(face.color).toBe(face.fg);
        // 색 면 안 포커스 링 = 면 위 글자색(DESIGN §9.1)
        expect(face.ring).toBe(face.fg);
        expect(contrast(face.bg, face.color)).toBeGreaterThanOrEqual(5.3);
        expect(face.transition).toContain("background-color");
        expect(face.duration.split(", ")[0]).toBe("0.2s");
        // 러닝 헤드 대신 약칭 상자 + 해제
        await expect(page.locator("[data-nf-head] [lang='en']")).toBeHidden();
        await expect(
          page.getByRole("button", { name: "해제 대회 필터" }),
        ).toBeVisible();
      }
    });
  }
});

test.describe("필터 결과", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("목차로 거르면 남은 카드가 찍힘(150ms)으로 들어온다 — 첫 로드·쿼리 진입에는 모션 없음", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await open(page, "?cat=result");
    expect(await page.locator("[data-nf-in]").count()).toBe(0);
    // 찍힘(150ms)은 금방 끝나므로 시작 이벤트로 잰다
    await page.evaluate(() => {
      const w = window as unknown as { __anims: string[][] };
      w.__anims = [];
      document.addEventListener("animationstart", (e) => {
        const el = e.target as HTMLElement;
        if (el.matches("li[data-nf-card]"))
          w.__anims.push([
            e.animationName,
            getComputedStyle(el).animationDuration,
          ]);
      });
    });
    await page
      .locator(
        'nav[aria-label="뉴스 필터"] [data-nf-key="cat"][data-nf-value="transfer"]',
      )
      .click();
    await page.waitForFunction(
      () => (window as unknown as { __anims: string[][] }).__anims.length >= 4,
    );
    const anim = await page.evaluate(
      () => (window as unknown as { __anims: string[][] }).__anims,
    );
    expect(anim).toEqual(Array(4).fill(["stamp", "0.15s"]));
    // 끝나면 속성을 지운다(쌓임 맥락이 남지 않게)
    await expect(page.locator("[data-nf-in]")).toHaveCount(0);
  });

  test("모션 줄이기면 찍힘 없음", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await page
      .locator('nav[aria-label="뉴스 필터"] [data-nf-key="kr"]')
      .click();
    expect(await visibleIds(page)).toHaveLength(5);
    expect(await page.locator("[data-nf-in]").count()).toBe(0);
  });

  test("머리기사 없음(DECISIONS #13) · 짝이 숨은 연결 줄 숨김 · 0건 빈 상태 시안 치수(윤곽 0 64px · 안내 15px 800)", async ({
    page,
  }) => {
    await open(page, "?kr=1");
    await expect(page.locator("article[data-lead]")).toHaveCount(0);
    // 09(한국 선수)만 남고 짝 07은 숨음 → 09의 연결 줄도 숨고 카드 아래 여백이 돌아온다
    const card = page.locator("#c_d8eac2777b");
    await expect(card.locator("[data-nf-link]")).toBeHidden();
    expect(
      await card.evaluate((el) => getComputedStyle(el).paddingBottom),
    ).toBe("15px");

    await open(page, "?comp=ligue1&cat=ucl");
    const empty = page.locator("[data-nf-empty]");
    await expect(empty).toBeVisible();
    const [n, t] = await empty.locator("p").evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        return [cs.fontSize, cs.fontWeight, cs.color, cs.webkitTextStrokeWidth];
      }),
    );
    expect(n?.slice(0, 2)).toEqual(["64px", "800"]);
    expect(n?.[3]).toBe("2px");
    expect(t?.slice(0, 2)).toEqual(["15px", "800"]);
    await expect(page.locator("[data-nf-desc]")).toHaveText("리그 1 · UCL");
  });
});

test.describe("주소로 눌린 채 들어온 0건 항목을 끄면 — 그 버튼이 비활성이 되고 포커스는 보이는 눌린 분류 컨트롤로(body 아님)", () => {
  for (const [width, query, selector] of [
    [
      1280,
      "?comp=ligue1",
      'nav[aria-label="뉴스 필터"] [data-nf-key="comp"][data-nf-value="LIGUE1"]',
    ],
    [
      375,
      "?cat=ucl",
      '[data-nf-chips] [data-nf-key="cat"][data-nf-value="ucl"]',
    ],
  ] as const) {
    test(`${width}px ${query}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, query);
      const control = page.locator(selector);
      await expect(control).toBeEnabled();
      await control.focus();
      await page.keyboard.press("Enter");
      await expect(control).toBeDisabled();
      const focused = page.locator(":focus");
      await expect(focused).toHaveAttribute("data-nf-key", "cat");
      await expect(focused).toHaveAttribute("aria-pressed", "true");
      await expect(focused).toBeVisible();
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
        "BUTTON",
      );
    });
  }
});

test.describe("375 칩 줄", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("가로 스크롤·스냅·스크롤바 숨김, 쿼리로 들어오면 눌린 칩이 보이게 칩 줄만 민다(페이지는 그대로)", async ({
    page,
  }) => {
    await open(page);
    const row = page.locator("[data-nf-chips]");
    const style = await row.evaluate((el) => {
      const cs = getComputedStyle(el);
      return [
        cs.overflowX,
        cs.scrollSnapType,
        cs.scrollbarWidth,
        el.scrollLeft,
      ];
    });
    // scroll-snap-type 'x proximity'는 기본값 proximity를 줄여 'x'로 읽힌다
    expect(style).toEqual(["auto", "x", "none", 0]);
    await open(page, "?kr=1");
    const box = await page.evaluate(() => {
      const r = document.querySelector("[data-nf-chips]") as HTMLElement;
      const chip = r.querySelector('[data-nf-key="kr"]') as HTMLElement;
      const a = r.getBoundingClientRect();
      const b = chip.getBoundingClientRect();
      return {
        inside: b.left >= a.left && b.right <= a.right,
        scrolled: r.scrollLeft,
        page: window.scrollX,
      };
    });
    expect(box).toEqual({
      inside: true,
      scrolled: expect.any(Number),
      page: 0,
    });
    expect(box.scrolled).toBeGreaterThan(0);
    // 대회 진입점 없음(DECISIONS #11) — 그래도 ?comp=는 색 면으로 보인다
    await expect(page.locator('nav[aria-label="뉴스 필터"]')).toBeHidden();
  });
});

for (const width of WIDTHS) {
  test(`${width}px — 상태 5종 가로 넘침 0 · 필터 컨트롤 44px(실제 누름 판정)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, query] of STATES) {
      await open(page, query);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, name).toBeLessThanOrEqual(0);
      // 칩·피드 머리 해제·필터 해제·'+N곳' — 실제 누름 판정
      const failures = await touchTargetFailures(
        page,
        "main [data-nf-scope] button:not([disabled])",
      );
      expect(failures, name).toEqual([]);
      // 목차 행은 위아래로 맞붙은 44px 상자다(시안·DESIGN §9.2 그대로) — 행 경계가 소수점 위치(묶음 이름 18.6px 등, 시안과 같은 값)라
      // 누름 판정 점(가운데 ±21.5px)이 경계 0.5px 안에서 옆 행에 잡힌다. 그래서 상자 높이·폭으로 본다(옆 행도 같은 필터 컨트롤)
      const rows = await page
        .locator('nav[aria-label="뉴스 필터"] button')
        .evaluateAll((els) =>
          els
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.height < 44 || r.width < 44)
            .map((r) => `${r.width}×${r.height}`),
        );
      expect(rows, name).toEqual([]);
    }
  });
}

for (const width of [375, 1280] as const) {
  for (const scheme of SCHEMES) {
    test(`${width}px ${scheme} — axe 0(대회+팀 · 0건 · 분류)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      for (const query of [
        "?comp=epl&team=tottenham-hotspur",
        "?comp=ligue1&cat=ucl",
        "?cat=transfer&kr=1",
      ]) {
        await open(page, query);
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

// 스크린샷 — 상태 5종 × 375·1024·1280 × 라이트·다크(피드 머리를 화면 위쪽에 두고 첫 화면). 혼합안 같은 상태와 나란히 비교한다(DESIGN §11.9)
test.describe("스크린샷", () => {
  for (const width of [375, 1024, 1280] as const) {
    for (const scheme of SCHEMES) {
      test(`${width}px ${scheme}`, async ({ browser, baseURL }) => {
        const context = await browser.newContext({
          baseURL,
          viewport: { width, height: 900 },
          deviceScaleFactor: 1,
          colorScheme: scheme,
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        // 상대 시간을 혼합안 기준 시각(2026-10-11 15:54 KST)에 고정
        await page.clock.setFixedTime(new Date("2026-10-11T06:54:14Z"));
        mkdirSync(SHOTS_DIR, { recursive: true });
        for (const [name, query] of STATES) {
          await open(page, query);
          await page.evaluate(() => {
            const head = document.querySelector(
              "[data-nf-head]",
            ) as HTMLElement;
            window.scrollTo(
              0,
              head.getBoundingClientRect().top + window.scrollY - 120,
            );
          });
          await page.screenshot({
            path: path.join(
              SHOTS_DIR,
              `impl-news-filter-${name}-${width}-${scheme}.png`,
            ),
          });
        }
        await context.close();
      });
    }
  }
});
