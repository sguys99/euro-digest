import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  loadLeagueMini,
  loadTonightWidget,
} from "../../src/lib/data/home-widgets";
import { basePath } from "./support/site";

// 홈 위젯 "오늘 밤 볼 경기"(M2-14)·"리그 순위 미니"(M2-15)와 `/tonight/` — 빌드 결과(out/). 기대 값은 같은 로더(configs·data/competitions)로
// 계산한다(하드코딩하지 않는다). 오늘 밤 선별은 빌드 시각의 KST 날짜 기준이라, 빌드와 검사 사이에 KST 날짜가 바뀌면 경기 수 비교를 건너뛴다.
// 모든 페이지 axe·44px는 a11y.spec, 폭별 가로 넘침은 shell.spec(홈·/tonight/ — 375·1023·1024·1279·1280)이 본다.

const tonight = loadTonightWidget();
const league = loadLeagueMini();

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/** 빌드 HTML의 기준 날짜(부제 첫 날짜)가 지금 로더 값과 같은가 — 다르면 경기 비교를 건너뛴다 */
async function sameBase(page: Page): Promise<boolean> {
  if (!tonight.window) return true;
  const kickoffs = await page
    .locator("[data-slot=tonight-list] time")
    .evaluateAll((els) => els.map((el) => el.getAttribute("datetime")));
  return (
    JSON.stringify(kickoffs.slice(0, tonight.cards.length)) ===
    JSON.stringify(tonight.cards.map((c) => c.kickoff))
  );
}

test.describe("홈 위젯 — 두 자리", () => {
  test("1279 이하는 지면 안(주요 뉴스 다음), 1280 이상은 마주 보는 면 — 오늘 밤 → 리그 순위, 보이는 쪽은 하나", async ({
    page,
  }, testInfo) => {
    await open(page, "./");
    const wide = testInfo.project.name === "desktop"; // 1280
    const flow = page.locator("main [data-slot=home-widgets]");
    const aside = page.locator('aside[aria-label="오늘 밤 경기·리그 순위"]');
    await expect(wide ? aside : flow).toBeVisible();
    await expect(wide ? flow : aside).toBeHidden();
    const visible = wide ? aside : flow;
    await expect(visible.locator("section")).toHaveCount(2);
    await expect(visible.locator("section h2")).toHaveText([
      "오늘 밤 볼 경기",
      "리그 순위",
    ]);
    // 보조기술에는 한 벌만(숨은 쪽은 display: none)
    await expect(
      page.getByRole("heading", { level: 2, name: "오늘 밤 볼 경기" }),
    ).toHaveCount(1);
  });

  test("1024·1279 — 지면 안, 1280 — 마주 보는 면(경계)", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "폭은 테스트가 정한다");
    for (const [width, inFacing] of [
      [1024, false],
      [1279, false],
      [1280, true],
    ] as const) {
      await page.setViewportSize({ width, height: 800 });
      await open(page, "./");
      await expect(page.locator("main [data-slot=home-widgets]"))[
        inFacing ? "toBeHidden" : "toBeVisible"
      ]();
      await expect(page.locator("aside"))[
        inFacing ? "toBeVisible" : "toBeHidden"
      ]();
    }
  });
});

test.describe("오늘 밤 볼 경기", () => {
  test("카드 = 선별 순서 그대로(킥오프·대회 탭·이유 태그 label), 이유 없으면 태그 줄 없음, 끝난 경기에 스코어 없음 · 빈 날은 빈 상태", async ({
    page,
  }) => {
    await open(page, "./");
    const section = page.locator("[data-slot=tonight]:visible");
    if (tonight.cards.length === 0) {
      await expect(section.locator("[data-slot=tonight-empty]")).toBeVisible();
      return;
    }
    test.skip(!(await sameBase(page)), "빌드 뒤 KST 날짜가 바뀌었다");
    const rows = section.locator("[data-slot=tonight-row]");
    await expect(rows).toHaveCount(tonight.cards.length);
    for (const [i, card] of tonight.cards.entries()) {
      const row = rows.nth(i);
      await expect(row.locator("time")).toHaveAttribute(
        "datetime",
        card.kickoff,
      );
      await expect(row.locator("time")).toHaveText(card.time);
      await expect(row.locator("[data-slot=index-tab]")).toHaveText(
        card.compLabel.short,
      );
      const why = row.getByRole("list", { name: "선정 이유" });
      if (card.reasons.length === 0) await expect(why).toHaveCount(0);
      else
        await expect(why.locator("li")).toHaveText(
          card.reasons.map((r) =>
            r.kind === "korean" ? `한국${r.label}` : r.label,
          ),
        );
      await expect(row).toContainText(card.home.name);
      await expect(row).toContainText(card.away.name);
      if (card.state === "finished")
        await expect(row.locator("[data-slot=tonight-state]")).toHaveText(
          "종료",
        );
    }
    await expect(
      section.getByRole("link", { name: "선정 기준" }),
    ).toHaveAttribute("href", `${basePath}/tonight/`);
  });

  test("/tonight/ — h1 · 같은 카드 · 창 안내 · 선정 기준(설정 값) · 내비 현재 탭 없음", async ({
    page,
  }) => {
    await open(page, "tonight/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "오늘 밤 볼 경기",
    );
    await expect(page.locator('[aria-current="page"]')).toHaveCount(0);
    if (tonight.cards.length > 0 && (await sameBase(page))) {
      await expect(
        page.locator("[data-slot=tonight-page] [data-slot=tonight-row]"),
      ).toHaveCount(tonight.cards.length);
    }
    const criteria = page.locator("[data-slot=tonight-criteria]:visible");
    await expect(criteria).toHaveCount(1);
    await expect(criteria.locator("li[data-rule]").first()).toContainText(
      "한국 선수 소속팀 경기",
    );
    await expect(criteria).toContainText("18:00 ~ 다음 날 07:00 KST");
  });
});

test.describe("리그 순위 미니", () => {
  test.skip(
    league.every((p) => p.rows.length === 0),
    "data/competitions 순위 자료가 없다",
  );

  test("탭 6개(3열) · EPL 기본 · 상위 5행 링크 = 순위표 팀 행 앵커 · 클릭·화살표로 전환 · 44px", async ({
    page,
  }) => {
    await open(page, "./");
    const widget = page.locator("[data-slot=league-mini]:visible");
    const tabs = widget.getByRole("tab");
    await expect(tabs).toHaveText(league.map((p) => p.short));
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    const first = league[0];
    if (!first) return;
    const list = widget.getByRole("list", {
      name: `${first.name} 상위 ${first.rows.length}위`,
    });
    const links = list.getByRole("link");
    await expect(links).toHaveCount(first.rows.length);
    for (const [i, row] of first.rows.entries()) {
      await expect(links.nth(i)).toHaveAttribute(
        "href",
        `${basePath}${row.href}`,
      );
    }
    // 44px — 탭·행·전체 순위 링크
    for (const el of [
      ...(await tabs.all()),
      ...(await links.all()),
      widget.getByRole("link", { name: "전체 순위" }),
    ]) {
      const box = await el.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
    // 클릭 → 그 패널, 찍힘 표시
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    const panel = widget.getByRole("tabpanel");
    await expect(panel).toHaveAttribute("data-comp", league[1]?.comp ?? "");
    await expect(panel).toHaveAttribute("data-in", "");
    // ←→ Home End(자동 활성화)
    await tabs.nth(1).focus();
    await page.keyboard.press("End");
    await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  });

  test("숨은 패널(UCL 등)도 axe 위반 0 — 라이트·다크", async ({ page }) => {
    // 패널 5개 × 색 2 — 홈 전체 문서에서 axe를 열 번 돈다
    test.setTimeout(120_000);
    for (const colorScheme of ["light", "dark"] as const) {
      // 색 면 전환(base)이 끝난 상태로 잰다
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await open(page, "./");
      const widget = page.locator("[data-slot=league-mini]:visible");
      const tabs = widget.getByRole("tab");
      for (let i = 1; i < league.length; i += 1) {
        await tabs.nth(i).click();
        const { violations } = await new AxeBuilder({ page })
          .include("[data-slot=league-mini]")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(
          violations.map(
            (v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`,
          ),
          `${league[i]?.comp} ${colorScheme}`,
        ).toEqual([]);
      }
    }
  });

  test("행을 누르면 대회 페이지 순위표의 그 팀 행으로 간다(:target 도착 강조)", async ({
    page,
  }) => {
    const row = league[0]?.rows[0];
    test.skip(!row, "행 없음");
    if (!row) return;
    await open(page, "./");
    await page
      .locator("[data-slot=league-mini]:visible [data-slot=league-mini-row]")
      .first()
      .click();
    await expect(page).toHaveURL(
      new RegExp(`${row.href.replace(/[/#]/g, "\\$&")}$`),
    );
    const target = page.locator(`tr#${row.team.slug}`);
    await expect(target).toBeVisible();
    // 새 문서(보통 링크 — next/link 클라이언트 이동은 :target을 바꾸지 않는다)가 앵커를 잡을 때까지
    await page.waitForLoadState("load");
    await expect
      .poll(() => page.evaluate(() => document.querySelector(":target")?.id))
      .toBe(row.team.slug);
  });
});
