import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { SCHEMES, waitForFonts } from "./support";

// 상태 화면 4종 견본 e2e (M1-37 — PRD DR-07, DESIGN.md §9.3 상태 화면 4종 · §2.9 상태 · §9.2 Skeleton) — SPECIMEN=1 빌드(out-specimen/) 전용.
// 견본(`/specimen/states/` — src/app/specimen/states/page.specimen.tsx)은 혼합안 `concept-mix.html` "상태 화면 4종"과 같은 배치·fixtures로 실제
// 컴포넌트를 늘 보이게 싣는다. 여기서는 혼합안에서 잰 상자 값(안쪽 여백·글자·높이 — 2026-10-23 실측)과 같은지, axe·가로 넘침·44px를 본다.
// 실제 화면의 보임/숨김(가짜 시계·offline 이벤트)·위치·CLS는 일반 e2e(tests/e2e/states.spec.ts).

const PATH = "specimen/states/";
const WIDTHS = [375, 1023, 1024, 1279, 1280] as const;

async function open(page: Page): Promise<void> {
  const response = await page.goto(PATH);
  expect(response?.status()).toBe(200);
  await waitForFonts(page);
}

interface Box {
  w: number;
  h: number;
  padding: string;
  font: string;
  border: string;
}

function box(page: Page, selector: string): Promise<Box | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      w: Math.round(r.width * 100) / 100,
      h: Math.round(r.height * 100) / 100,
      padding: cs.padding,
      font: `${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`,
      border: `${cs.borderTopWidth} ${cs.borderTopStyle}`,
    };
  }, selector);
}

const ERR = "[data-specimen=state-error] [data-slot=issue-late-box]";
const BAND = "[data-specimen=state-offline] [data-slot=offline-band-body]";

/** 혼합안 실측(375 · 1280) — `.err` · `.offline` · `.off__d .n` · `.skel` */
const CONCEPT = {
  375: { err: [313, 95.09], band: [313, 61.84] },
  1280: { err: [566, 74.17], band: [566, 44.92] },
} as const;

for (const width of [375, 1280] as const) {
  test.describe(`${width}px — 혼합안 상자 값`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("오류 상자(발행 지연 안내) — 1px 잉크 · --paper-2 · 12/14 · 제목 15px 800 · 안내 13.5px", async ({
      page,
    }) => {
      await open(page);
      const err = await box(page, ERR);
      expect(err).toMatchObject({
        w: CONCEPT[width].err[0],
        h: CONCEPT[width].err[1],
        padding: "12px 14px",
        border: "1px solid",
      });
      expect(await box(page, `${ERR} p`)).toMatchObject({
        font: "15px/23.25px 800",
      });
      expect(await box(page, `${ERR} p + p`)).toMatchObject({
        font: "13.5px/20.925px 400",
      });
      const colors = await page.evaluate((sel) => {
        const el = document.querySelector(sel)!;
        const probe = (v: string) => {
          const d = document.createElement("i");
          d.style.color = `var(${v})`;
          document.body.append(d);
          const c = getComputedStyle(d).color;
          d.remove();
          return c;
        };
        return {
          bg: getComputedStyle(el).backgroundColor,
          border: getComputedStyle(el).borderTopColor,
          paper2: probe("--paper-2"),
          ink: probe("--ink"),
        };
      }, ERR);
      expect(colors.bg).toBe(colors.paper2);
      expect(colors.border).toBe(colors.ink);
    });

    test("오프라인 띠 — --ink 면 · 10/12 · 13.5px · '오프라인' 상자 1px --paper 800 1/6", async ({
      page,
    }) => {
      await open(page);
      expect(await box(page, BAND)).toMatchObject({
        w: CONCEPT[width].band[0],
        h: CONCEPT[width].band[1],
        padding: "10px 12px",
        font: "13.5px/20.925px 400",
      });
      expect(await box(page, `${BAND} span`)).toMatchObject({
        w: 62,
        h: 24.92,
        padding: "1px 6px",
        font: "13.5px/20.925px 800",
        border: "1px solid",
      });
      const c = await page.evaluate((sel) => {
        const el = document.querySelector(sel)!;
        const key = el.querySelector("span")!;
        return {
          bg: getComputedStyle(el).backgroundColor,
          fg: getComputedStyle(el).color,
          keyBorder: getComputedStyle(key).borderTopColor,
        };
      }, BAND);
      expect(c.keyBorder).toBe(c.fg);
      expect(c.bg).not.toBe(c.fg);
    });

    test("비시즌 — 날짜 Barlow 800 34px/1 · 160×41, 평탄 탭 46×22 · 종료·개막 두 견본", async ({
      page,
    }) => {
      await open(page);
      for (const phase of ["ended", "upcoming"]) {
        const sel = `[data-specimen=state-off-season-${phase}] [data-slot=brief-off-season]`;
        await expect(page.locator(sel)).toHaveAttribute("data-phase", phase);
        expect(await box(page, `${sel} time [aria-hidden]`)).toMatchObject({
          w: 160,
          h: 41,
          font: "34px/34px 800",
        });
        expect(await box(page, `${sel} [title]`)).toMatchObject({
          w: 46,
          h: 22,
        });
      }
    });

    test("로딩 스켈레톤 — 머리 37 · 5줄 행 3 · 카드 3(375는 혼합안 78·128과 같음, ≥1024는 실제 행 여백 80·133 — D0-12)", async ({
      page,
    }) => {
      await open(page);
      const rows = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            "[data-specimen=state-loading] [role=status] > [aria-hidden]",
          ),
        ].map((el) => Math.round(el.getBoundingClientRect().height)),
      );
      expect(rows).toEqual(
        width === 375
          ? [37, 78, 78, 78, 128, 128, 128]
          : [37, 80, 80, 80, 133, 133, 133],
      );
    });
  });
}

test.describe("접근성 · 가로 넘침 · 터치 타깃", () => {
  for (const scheme of SCHEMES) {
    for (const width of [375, 1280]) {
      test(`${width}px ${scheme} — axe WCAG 2.1 A/AA 위반 0건`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: scheme });
        await open(page);
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

  test("가로 넘침 0(375·1023·1024·1279·1280) · 상태 화면 링크·버튼 44px 이상", async ({
    page,
  }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
        `${width}px`,
      ).toBe(0);
      const small = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            "[data-slot=brief-off-season] a, [data-nf-empty] button",
          ),
        ]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.height < 44)
          .map((r) => r.height),
      );
      expect(small, `${width}px`).toEqual([]);
    }
  });
});
