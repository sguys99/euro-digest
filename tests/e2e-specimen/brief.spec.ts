import { expect, test, type Page } from "@playwright/test";

import { SPECIMEN_PATH, touchTargetFailures, waitForFonts } from "./support";

// 오늘의 5줄 상태 견본 e2e (M1-32 — PRD FR-35·FR-36, D24·D30·D45·D58, DESIGN.md §3.3·§4.3·§9.3) — SPECIMEN=1 빌드(out-specimen/) 전용.
// 견본은 fixtures 브리핑(brief-sample.json 2026-10-11 mixed · 10-10 llm · 09-18 template 2줄 + brief-empty.json S4)을 실제 블록
// (`TodayBrief`)으로 싣는다(src/app/specimen/page.specimen.tsx `SpecimenBriefs`). 실제 data/briefs는 날마다 바뀌므로 상태별 검사는
// 여기서 결정적으로 한다. 일반 빌드 홈의 불변식은 tests/e2e/home.spec.ts. axe(라이트·다크)는 specimen.spec가 견본 전체에서 본다.

const WIDTHS = [375, 1023, 1024, 1279, 1280] as const;

/** [견본 id, mode, 줄별 ai, 부제] */
const STATES = [
  ["s2", "mixed", [true, true, true, true, false], "10월 10일(현지) 경기 기준"],
  ["s1", "llm", [true, true, true, true, true], "10월 9일(현지) 경기 기준"],
  ["s3", "template", [false, false], "9월 17일(현지) 경기 기준이날 2줄"],
  ["s4", "empty", [], "전날(현지) 경기 기준"],
] as const;

function block(id: string): string {
  return `[data-specimen=brief-${id}] [data-slot=today-brief]`;
}

async function open(page: Page): Promise<void> {
  const response = await page.goto(SPECIMEN_PATH);
  expect(response?.status()).toBe(200);
  await waitForFonts(page);
}

test.describe("상태 S1~S4", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const [id, mode, ai, sub] of STATES) {
    test(`${id} (${mode}) — 줄·라벨(FR-35)·부제·하단 링크`, async ({
      page,
    }) => {
      await open(page);
      const el = page.locator(block(id));
      await expect(el).toHaveAttribute("data-brief-mode", mode);
      await expect(el.locator(":scope > p").first()).toHaveText(sub);
      const rows = el.locator("[data-slot=brief-row]");
      await expect(rows).toHaveCount(ai.length);
      const labels = await rows.evaluateAll((items) =>
        items.map(
          (li) => li.querySelectorAll("[data-slot=ai-label]").length === 1,
        ),
      );
      expect(labels).toEqual([...ai]);
      await expect(el.getByRole("link", { name: "AI 작성 안내" })).toHaveCount(
        ai.some(Boolean) ? 1 : 0,
      );
      await expect(
        el.getByRole("link", { name: /브리핑 오류 신고/ }),
      ).toHaveAttribute(
        "href",
        /template=summary-error\.yml&date=\d{4}-\d{2}-\d{2}$/,
      );
      if (mode === "empty") {
        await expect(el.getByRole("list")).toHaveCount(0);
        await expect(el.locator("[data-slot=brief-rest]")).toContainText(
          "오늘은 5줄을 쉽니다",
        );
      } else {
        await expect(el.getByRole("list")).toHaveAttribute(
          "aria-label",
          `${ai.length}줄`,
        );
        // fixtures 줄은 comps가 있다(D58) — 줄마다 인덱스 탭 하나
        await expect(el.locator("[data-slot=index-tab]")).toHaveCount(
          ai.length,
        );
      }
    });
  }

  test("S4 결과 지연(empty + results-pending — D60) — S4 대신 5줄 자리 오류 상자, 줄·라벨·부제·하단 없음", async ({
    page,
  }) => {
    await open(page);
    const el = page.locator(block("s4-pending"));
    await expect(el).toHaveAttribute("data-brief-mode", "empty");
    await expect(el).toHaveAttribute("data-empty-reason", "results-pending");
    await expect(el.getByRole("heading", { name: "오늘의 5줄" })).toHaveCount(
      1,
    );
    const box = el.locator("[data-slot=brief-pending]");
    await expect(box).toContainText("오늘은 5줄을 싣지 못했어요");
    await expect(box).toContainText("경기 결과 집계가 늦어");
    await expect(box).toContainText("뉴스는 아래에 그대로 있어요");
    // S4 문구("끝난 경기가 없었습니다")·줄·AI 라벨·부제·하단은 없다
    await expect(el).not.toContainText("끝난 경기가 없었습니다");
    await expect(el.locator("[data-slot=brief-rest]")).toHaveCount(0);
    await expect(el.getByRole("list")).toHaveCount(0);
    await expect(el.locator("[data-slot=ai-label]")).toHaveCount(0);
    await expect(el.locator("[data-slot=brief-foot]")).toHaveCount(0);
    await expect(el.locator(":scope > p")).toHaveCount(0);
  });

  test("S4 '주요 뉴스로 ↓' → 주요 뉴스(#news) 머리가 화면 위 16px", async ({
    page,
  }) => {
    await open(page);
    await page
      .locator(block("s4"))
      .getByRole("link", { name: "주요 뉴스로" })
      .click();
    await expect(page).toHaveURL(/#news$/);
    const top = await page.evaluate(() =>
      Math.round(
        document.getElementById("news")?.getBoundingClientRect().top ?? -1,
      ),
    );
    expect(top).toBe(16);
  });
});

for (const width of WIDTHS) {
  const wide = width >= 1024;
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("가로 넘침 0 · 행 격자·글자 크기(DESIGN §3.3·§4.3) · 1023 이하 오른쪽 넘침(탭이 화면 가장자리)", async ({
      page,
    }) => {
      await open(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      const m = await page.locator(block("s2")).evaluate((root) => {
        const row = root.querySelector("[data-slot=brief-row]") as HTMLElement;
        const no = row.querySelector("[data-slot=brief-no]") as HTMLElement;
        const text = row.querySelector("[data-slot=brief-text]") as HTMLElement;
        const num = text.querySelector("span:not([data-slot])") as HTMLElement;
        const label = row.querySelector("[data-slot=ai-label]") as HTMLElement;
        const tab = row.querySelector("[data-slot=index-tab]") as HTMLElement;
        const rs = getComputedStyle(row);
        const probe = document.createElement("span");
        probe.style.color = "var(--brand-accent)";
        probe.style.borderColor = "var(--ink-2)";
        document.body.append(probe);
        const accent = getComputedStyle(probe).color;
        const ink2 = getComputedStyle(probe).borderTopColor;
        probe.remove();
        return {
          cols: rs.gridTemplateColumns.split(" ")[0],
          tabCol: rs.gridTemplateColumns.split(" ")[2],
          gap: rs.columnGap,
          pad: [rs.paddingTop, rs.paddingBottom],
          noSize: getComputedStyle(no).fontSize,
          noColor: getComputedStyle(no).color,
          accent,
          textSize: getComputedStyle(text).fontSize,
          textLh: getComputedStyle(text).lineHeight,
          numFamily: getComputedStyle(num).fontFamily,
          numWeight: getComputedStyle(num).fontWeight,
          labelSize: getComputedStyle(label).fontSize,
          labelBorder: getComputedStyle(label).borderTopColor,
          ink2,
          tabRight: Math.round(tab.getBoundingClientRect().right),
          rowRight: Math.round(row.getBoundingClientRect().right),
          vw: window.innerWidth,
        };
      });
      expect(m.cols).toBe(wide ? "64px" : "40px");
      expect(m.tabCol).toBe(wide ? "22px" : "18px");
      expect(m.gap).toBe(wide ? "14px" : "10px");
      expect(m.pad).toEqual(wide ? ["14px", "15px"] : ["13px", "14px"]);
      expect(m.noSize).toBe(wide ? "54px" : "40px");
      expect(m.noColor).toBe(m.accent);
      expect(m.textSize).toBe(wide ? "19px" : "17px");
      expect(m.textLh).toBe(wide ? "30.4px" : "27.54px");
      expect(m.numFamily).toMatch(/^"Barlow Condensed"/);
      expect(m.numWeight).toBe("600");
      expect(m.labelSize).toBe("11px");
      expect(m.labelBorder).toBe(m.ink2);
      expect(m.tabRight).toBe(m.rowRight);
      if (!wide) expect(m.rowRight).toBe(m.vw);
    });

    test("숫자(스코어 등)는 줄이 갈려도 한 조각으로 남는다(1- / 0 분리 없음)", async ({
      page,
    }) => {
      await open(page);
      const split = await page
        .locator(
          "[data-specimen=briefs] [data-slot=brief-text] > span:not([data-slot])",
        )
        .evaluateAll((spans) =>
          spans
            .filter((s) => s.getClientRects().length > 1)
            .map((s) => s.textContent),
        );
      expect(split).toEqual([]);
    });

    test("터치 타깃 44px — AI 작성 라벨 · 하단 링크 · 주요 뉴스로", async ({
      page,
    }) => {
      await open(page);
      const failures = await touchTargetFailures(
        page,
        "[data-specimen=briefs] [data-slot=ai-label], [data-specimen=briefs] [data-slot=brief-foot] a, [data-specimen=briefs] [data-slot=brief-rest] a",
      );
      expect(failures).toEqual([]);
    });
  });
}
