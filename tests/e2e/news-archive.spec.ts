import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { loadBrief } from "../../src/lib/data/brief";
import { listNewsDates, loadNewsIssue } from "../../src/lib/data/news";
import { loadProdRuns } from "../../src/lib/data/runs";
import { issueMeta } from "../../src/lib/issue";
import {
  archiveHeading,
  archiveTitle,
  buildArchiveView,
  calendarMonth,
  monthJumpTarget,
} from "../../src/lib/news/archive";
import { SITE_NAME } from "../../src/lib/site";
import {
  formatKst,
  kstDate,
  kstDayRangeUtc,
  shiftDate,
} from "../../src/lib/time";
import { archiveSample, basePath, outDir, siteOrigins } from "./support/site";

// 날짜 아카이브 e2e (M1-34 — PRD FR-33·FR-34, 시안 A "스텁 넘김" — 티켓 꼬리표 + 월 달력) — 일반 빌드(out/)의 실제 발행일.
// 기대 값은 data/ 파일 목록·모델(src/lib/news/archive.ts)에서 계산한다(실데이터는 날마다 바뀐다 — 하드코딩하지 않는다).
// 필터 쿼리 동기화·첫 프레임·axe(필터 상태)는 news-filter.spec.ts가 아카이브 날짜 페이지 하나를 대상에 넣어 함께 본다.
// 모든 페이지의 링크·axe(달력 닫힘)·제목 단계는 links·a11y.spec.ts(out/ 전체 자동).

const DATES = listNewsDates();
/** 전수 대신 표본 — 첫 호·최신 호·최근 3·가장 최근 결호 앞뒤·월 경계(support/site.ts — 실행 시간이 발행일 수에 비례하지 않게, M1-34 리뷰) */
const SAMPLE = archiveSample(DATES);
const LATEST = DATES.at(-1);
const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;
const latestMeta = LATEST
  ? issueMeta(loadNewsIssue(LATEST)!, loadProdRuns())
  : null;

/** 결호를 사이에 둔 연속 발행일 쌍 [앞 호, 뒤 호] — 없으면 null */
const GAP: [string, string] | null = (() => {
  for (let i = 1; i < DATES.length; i++) {
    const a = DATES[i - 1]!;
    const b = DATES[i]!;
    if (shiftDate(a, 1) !== b) return [a, b];
  }
  return null;
})();

/** 결호 날짜 하나와 그 달에 발행된 호(달력 검사용) — 없으면 null */
const GAP_DAY = GAP ? shiftDate(GAP[0], 1) : null;

const archivePath = (date: string) => `news/${date}/`;
const href = (date: string) => `${basePath}/news/${date}/`;
const kst = (iso: string, withDate: boolean) =>
  `${formatKst(iso, withDate ? "datetime" : "time")} KST`;

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

const counterfoil = (page: Page) =>
  page.getByRole("navigation", { name: "호 넘기기" });
const calButton = (page: Page) => page.locator("[data-cal-button]");
const panel = (page: Page) => page.locator("#archive-cal");

test("빌드 결과 — 발행일마다 out/news/<날짜>/index.html, 그 밖의 날짜 디렉터리는 없다", () => {
  test.skip(DATES.length === 0, "data/news에 발행된 호가 없다");
  const dir = path.join(outDir, "news");
  const built = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && DATE_DIR_RE.test(e.name))
        .map((e) => e.name)
        .sort()
    : [];
  expect(built).toEqual(DATES);
});

for (const date of SAMPLE) {
  test(`${date} — 티켓(그 호 제 N호·시각) · 사이트 마지막 업데이트 · 화면 밖 h1 · 이날의 5줄 · 제목·canonical · 꼬리표·달력 링크 대상`, async ({
    page,
  }) => {
    const news = loadNewsIssue(date)!;
    const meta = issueMeta(news, loadProdRuns());
    const view = buildArchiveView(DATES, date)!;
    const response = await page.goto(archivePath(date));
    expect(response?.status()).toBe(200);

    // 티켓 = 그 호(제 N호 · 발행일 · 발행·업데이트)
    const ticket = page.locator("[data-ticket]");
    if (meta.no !== null) await expect(ticket).toContainText(`제${meta.no}호`);
    await expect(ticket.locator(`time[datetime="${date}"]`).first()).toHaveText(
      formatKst(kstDayRangeUtc(date).start, "fullDate"),
    );
    for (const [label, iso] of [
      ["발행", meta.publishedAt],
      ["업데이트", meta.updatedAt],
    ] as const)
      await expect(
        ticket.locator("span").filter({ hasText: new RegExp(`^${label} `) }),
      ).toHaveText(`${label} ${kst(iso, false)}`);

    // 상단 내비·뒤표지 마지막 업데이트 = 사이트(최신 호) 기준, 다른 날이면 날짜를 붙인다(FR-142, 오케스트레이터 결정)
    const site = latestMeta!.updatedAt;
    const withDate = kstDate(site) !== date;
    // 상단 내비는 1023 이하에서 숨김(display:none) — 역할 쿼리 대신 CSS로 찾는다
    await expect(
      page.locator('header nav[aria-label="주요 메뉴"]'),
    ).toContainText(`마지막 업데이트 ${kst(site, withDate)}`);
    await expect(page.getByRole("contentinfo")).toContainText(
      `마지막 업데이트 ${kst(site, withDate)}`,
    );

    // 화면 밖 h1 하나, 이날의 5줄(그 호 브리핑 파일이 있을 때만) → 뉴스 h2
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText(archiveHeading(date));
    const brief = loadBrief(date);
    await expect(page.getByRole("region", { name: "이날의 5줄" })).toHaveCount(
      brief ? 1 : 0,
    );
    // 지면에 "오늘의"가 없다(뒤표지 AI 고지의 기능 이름 "오늘의 5줄은 …"은 그대로)
    await expect(page.locator("main").getByText("오늘의 5줄")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 2, name: "뉴스" }),
    ).toHaveCount(1);

    // 제목·canonical
    await expect(page).toHaveTitle(`${archiveTitle(date)} · ${SITE_NAME}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${siteOrigins[0]}${basePath}/news/${date}/`,
    );

    // 카드 = 그 호의 카드(저장된 ID = 공유 앵커)
    expect(
      await page
        .locator("li[data-nf-card] > article")
        .evaluateAll((els) => els.map((el) => el.id)),
    ).toEqual(news.cards.map((c) => c.id));

    // 꼬리표 — 이전·다음 호(결호 건너뜀), 끝은 안내 글자
    const cf = counterfoil(page);
    const expected = [
      ...(view.prev ? [["prev", href(view.prev.date)]] : []),
      ...(view.next ? [["next", href(view.next.date)]] : []),
    ];
    expect(
      await cf
        .getByRole("link")
        .evaluateAll((els) =>
          els.map((a) => [a.getAttribute("rel"), a.getAttribute("href")]),
        ),
    ).toEqual(expected);
    if (!view.prev)
      await expect(cf.locator('[data-counterfoil="prev"]')).toContainText(
        "창간호예요",
      );
    if (!view.next)
      await expect(cf.locator('[data-counterfoil="next"]')).toContainText(
        "최신 호예요",
      );

    // 달력 — 그 달 발행일만 링크, 보는 호 aria-current, 달 이동은 그 달 첫 호 링크 또는 비활성
    const month = calendarMonth(view.calendar, view.calendar.currentMonth)!;
    const cal = panel(page);
    await expect(cal).toBeHidden();
    expect(
      await cal
        .locator("a[data-cal-day]")
        .evaluateAll((els) => els.map((a) => a.getAttribute("href"))),
    ).toEqual(month.issues.map(href));
    await expect(cal.locator('a[aria-current="page"]')).toHaveAttribute(
      "data-cal-day",
      date,
    );
    for (const dir of [-1, 1] as const) {
      const target = monthJumpTarget(view.calendar, month.month, dir);
      const name = dir < 0 ? "prev" : "next";
      if (target)
        await expect(
          cal.locator(`a[data-cal-month="${name}"]`),
        ).toHaveAttribute("href", href(target.date));
      else
        await expect(
          cal.locator(`button[data-cal-month="${name}"]`),
        ).toBeDisabled();
    }
  });
}

test.describe("꼬리표로 넘기기", () => {
  test("이전·다음 호 — 결호를 건너뛰어 그 호로(클라이언트 이동), 이동한 호의 제 N호·카드·상대 시간, 뒤로 가기", async ({
    page,
  }) => {
    test.skip(GAP === null, "결호가 없는 발행 목록");
    if (!GAP) return;
    const [before, after] = GAP;
    await open(page, archivePath(after));
    await counterfoil(page).locator('a[rel="prev"]').click();
    await expect(page).toHaveURL(new RegExp(`/news/${before}/$`));
    await expect(
      page.locator(`[data-ticket] time[datetime="${before}"]`),
    ).toBeVisible();
    await expect(page.locator("li[data-nf-card] > article").first()).toHaveId(
      loadNewsIssue(before)!.cards[0]!.id,
    );
    // 피드 섬이 새 호의 카드에서 다시 돈다(상대 시간 채움)
    await expect(page.locator("[data-rel-out]").first()).not.toHaveText("");
    await counterfoil(page).locator('a[rel="next"]').click();
    await expect(page).toHaveURL(new RegExp(`/news/${after}/$`));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/news/${before}/$`));
  });

  test("이동한 호에서도 '+N곳' 펼침과 달력이 동작한다(섬이 새 페이지에 다시 붙는다)", async ({
    page,
  }) => {
    test.skip(DATES.length < 2, "호가 하나뿐");
    await open(page, archivePath(DATES.at(-1)!));
    await counterfoil(page).locator('a[rel="prev"]').click();
    await expect(page).toHaveURL(new RegExp(`/news/${DATES.at(-2)!}/$`));
    await calButton(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator('a[aria-current="page"]')).toHaveAttribute(
      "data-cal-day",
      DATES.at(-2)!,
    );
    await page.keyboard.press("Escape");
    const toggle = page.locator("button[data-src-toggle]").first();
    if ((await toggle.count()) > 0) {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
    }
  });

  test("/news/ = 최신 호 꼬리표(이전 호 · 달력 · 최신 호예요) · 홈 티켓에는 꼬리표·달력이 없다", async ({
    page,
  }) => {
    test.skip(DATES.length < 2, "호가 하나뿐");
    await open(page, "news/");
    const cf = counterfoil(page);
    await expect(cf.getByRole("link")).toHaveCount(1);
    await expect(cf.locator('a[rel="prev"]')).toHaveAttribute(
      "href",
      href(DATES.at(-2)!),
    );
    await expect(cf.locator('[data-counterfoil="next"]')).toContainText(
      "최신 호예요",
    );
    await expect(
      page.getByRole("heading", { level: 1, name: "뉴스" }),
    ).toHaveCount(1);
    await expect(panel(page).locator('a[aria-current="page"]')).toHaveAttribute(
      "data-cal-day",
      DATES.at(-1)!,
    );

    await open(page, "./");
    await expect(counterfoil(page)).toHaveCount(0);
    await expect(panel(page)).toHaveCount(0);
  });
});

test.describe("월 달력 — 펼침·키보드·결호·달 이동", () => {
  test("키보드: Enter로 펼치면 보는 호 칸에 포커스 · → 다음 발행 칸 · ↑ 7일 전(발행 칸일 때) · Esc → 닫히고 버튼으로 복귀", async ({
    page,
  }) => {
    test.skip(DATES.length < 3, "호가 적다");
    // 같은 달에 앞뒤 발행 칸이 있는 호
    const month = (d: string) => d.slice(0, 7);
    const date =
      DATES.find(
        (d, i) =>
          i > 0 &&
          i < DATES.length - 1 &&
          month(DATES[i - 1]!) === month(d) &&
          month(DATES[i + 1]!) === month(d),
      ) ?? DATES[1]!;
    const i = DATES.indexOf(date);
    await open(page, archivePath(date));
    const button = calButton(page);
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(panel(page)).toBeVisible();
    await expect(page.locator(":focus")).toHaveAttribute("data-cal-day", date);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(":focus")).toHaveAttribute(
      "data-cal-day",
      DATES[i + 1]!,
    );
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(":focus")).toHaveAttribute(
      "data-cal-day",
      DATES[i - 1]!,
    );
    // ↑: 7일 전이 발행 칸이면 그리로, 아니면 그대로
    const from = DATES[i - 1]!;
    const up = shiftDate(from, -7);
    await page.keyboard.press("ArrowUp");
    await expect(page.locator(":focus")).toHaveAttribute(
      "data-cal-day",
      DATES.includes(up) && month(up) === month(from) ? up : from,
    );
    // 포커스 링(3px 실선)
    expect(
      await page
        .locator(":focus")
        .evaluate((el) => getComputedStyle(el).outlineWidth),
    ).toBe("3px");
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();
  });

  test("닫기 버튼 → 닫히고 버튼으로 복귀 · 1024 이상 팝오버는 바깥 클릭으로 닫힘 · 375 시트는 지면을 밀어낸다", async ({
    page,
  }) => {
    test.skip(!LATEST, "data/news에 발행된 호가 없다");
    await open(page, archivePath(LATEST!));
    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    const mainTop = async () =>
      (await page.locator("main").boundingBox())?.y ?? 0;
    const before = await mainTop();
    await calButton(page).click();
    await expect(panel(page)).toBeVisible();
    if (wide) {
      // 팝오버 — 흐름 밖(지면이 밀리지 않는다), 티켓 아래 6px · 왼쪽 258px · 폭 384px
      expect(await mainTop()).toBe(before);
      const t = (await page.locator("[data-ticket]").boundingBox())!;
      const p = (await panel(page).boundingBox())!;
      expect(Math.round(p.y - (t.y + t.height))).toBe(6);
      expect(Math.round(p.x - t.x)).toBe(258);
      expect(Math.round(p.width)).toBe(384);
      await page.mouse.click(t.x + t.width - 10, t.y + t.height + 300);
      await expect(panel(page)).toBeHidden();
    } else {
      // 시트 — 티켓 바로 아래 흐름 요소, 지면을 밀어낸다
      expect(await mainTop()).toBeGreaterThan(before + 300);
      await page.getByRole("button", { name: "달력 닫기" }).click();
      await expect(panel(page)).toBeHidden();
      await expect(calButton(page)).toBeFocused();
      expect(await mainTop()).toBe(before);
    }
  });

  test("1024 이상: 판에서 Tab으로 나가면 닫힌다(덮인 요소에 포커스가 숨지 않게 — WCAG 2.4.11) · 375 시트는 Tab으로 나가도 그대로 · 판 밖 포커스에서 Esc는 닫기만", async ({
    page,
  }) => {
    test.skip(!LATEST, "data/news에 발행된 호가 없다");
    await open(page, archivePath(LATEST!));
    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    await calButton(page).click();
    await expect(panel(page)).toBeVisible();
    // 판의 마지막 포커스 대상(마지막 발행 칸)에서 Tab
    await panel(page).locator("a[data-cal-day]").last().focus();
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    if (wide) {
      await expect(panel(page)).toBeHidden();
      await expect(calButton(page)).toHaveAttribute("aria-expanded", "false");
      // 포커스는 판 다음 요소(상단 내비)에 있고 화면에 보인다(가려지지 않는다)
      await expect(focused).toBeVisible();
      expect(
        await focused.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            document
              .elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
              ?.closest("a, button") === el
          );
        }),
      ).toBe(true);
    } else {
      await expect(panel(page)).toBeVisible();
      // 판 밖 포커스에서 Esc — 닫기만, 포커스는 그대로
      const before = await focused.evaluate((el) => el.outerHTML.slice(0, 80));
      await page.keyboard.press("Escape");
      await expect(panel(page)).toBeHidden();
      expect(
        await page
          .locator(":focus")
          .evaluate((el) => el.outerHTML.slice(0, 80)),
      ).toBe(before);
    }
  });

  test("결호 칸은 링크가 아니다(점선 · 취소선 · '결호'), 발행 전·창간 전 칸도 링크가 아니다", async ({
    page,
  }) => {
    test.skip(GAP_DAY === null, "결호가 없는 발행 목록");
    // 결호가 든 달의 호
    const date = DATES.find((d) => d.slice(0, 7) === GAP_DAY!.slice(0, 7))!;
    await open(page, archivePath(date));
    await calButton(page).click();
    const cal = panel(page);
    const gap = cal.locator("[data-cal-gap]").filter({
      hasText: `${Number(GAP_DAY!.slice(8, 10))}일, 결호`,
    });
    await expect(gap).toHaveCount(1);
    expect(await gap.evaluate((el) => el.tagName)).toBe("SPAN");
    await expect(gap.locator("s")).toHaveCount(1);
    expect(await gap.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
      "dashed",
    );
    await expect(cal.locator(`a[data-cal-day="${GAP_DAY}"]`)).toHaveCount(0);
    // 링크 수 = 그 달 발행 수
    const view = buildArchiveView(DATES, date)!;
    await expect(cal.locator("a[data-cal-day]")).toHaveCount(
      calendarMonth(view.calendar, view.calendar.currentMonth)!.issues.length,
    );
  });

  test("날 칸을 누르면 그 호로 가고 그 칸이 aria-current가 된다(클라이언트 이동)", async ({
    page,
  }) => {
    test.skip(DATES.length < 2, "호가 하나뿐");
    const from = DATES.at(-1)!;
    const to = DATES.find(
      (d) => d !== from && d.slice(0, 7) === from.slice(0, 7),
    );
    test.skip(to === undefined, "같은 달에 다른 호가 없다");
    await open(page, archivePath(from));
    await calButton(page).click();
    await panel(page).locator(`a[data-cal-day="${to}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/news/${to}/$`));
    await expect(panel(page)).toBeHidden();
    await calButton(page).click();
    await expect(panel(page).locator('a[aria-current="page"]')).toHaveAttribute(
      "data-cal-day",
      to!,
    );
  });

  test("달 이동 — 다른 달에 호가 있으면 그 달 첫 호 링크, 없으면 비활성 버튼(실데이터 그대로 확인)", async ({
    page,
  }) => {
    test.skip(!LATEST, "data/news에 발행된 호가 없다");
    const view = buildArchiveView(DATES, LATEST!)!;
    await open(page, archivePath(LATEST!));
    await calButton(page).click();
    const cal = panel(page);
    const months = cal.locator("[data-cal-month]");
    await expect(months).toHaveCount(2);
    for (const [i, dir] of [
      [0, -1],
      [1, 1],
    ] as const) {
      const target = monthJumpTarget(
        view.calendar,
        view.calendar.currentMonth,
        dir,
      );
      const el = months.nth(i);
      if (target) {
        await expect(el).toHaveAttribute("href", href(target.date));
        await el.click();
        await expect(page).toHaveURL(new RegExp(`/news/${target.date}/$`));
        await open(page, archivePath(LATEST!));
        await calButton(page).click();
      } else {
        await expect(el).toBeDisabled();
        expect(
          await el.evaluate((b) => getComputedStyle(b).borderTopStyle),
        ).toBe("dashed");
      }
    }
  });

  for (const scheme of ["light", "dark"] as const)
    test(`${scheme} — 펼친 달력 axe 0 · 꼬리표·달력 링크·버튼 누름 영역 44px 이상`, async ({
      page,
    }) => {
      test.skip(!LATEST, "data/news에 발행된 호가 없다");
      await page.emulateMedia({ colorScheme: scheme });
      const date = DATES.at(-2) ?? LATEST!;
      await open(page, archivePath(date));
      await calButton(page).click();
      await expect(panel(page)).toBeVisible();
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        violations.map(
          (v) =>
            `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
        ),
      ).toEqual([]);
      // 누름 영역 — 상자가 44 미만이면 상자 밖 2px 지점도 그 요소여야 한다(::after 확장)
      const small = await page
        .locator(
          '[data-slot="counterfoil"] a, [data-slot="counterfoil"] button, #archive-cal a, #archive-cal button',
        )
        .evaluateAll((els) =>
          els.flatMap((el) => {
            const r = el.getBoundingClientRect();
            const hit = (x: number, y: number) =>
              el.contains(document.elementFromPoint(x, y));
            const cy = r.top + r.height / 2;
            const cx = r.left + r.width / 2;
            const w =
              r.width >= 44 || (hit(r.left - 1, cy) && hit(r.right + 1, cy));
            const h =
              r.height >= 44 || (hit(cx, r.top - 1) && hit(cx, r.bottom + 1));
            return w && h
              ? []
              : [`${el.textContent?.trim()} ${r.width}×${r.height}`];
          }),
        );
      expect(small).toEqual([]);
    });
});

test("없는 날짜는 404 — 결호 · 최신 호 다음 날 · 첫 호 전날 · 형식 오류", async ({
  request,
  baseURL,
}) => {
  test.skip(DATES.length === 0, "data/news에 발행된 호가 없다");
  const origin = new URL(baseURL ?? "http://127.0.0.1:4173/").origin;
  const missing = [
    ...(GAP_DAY ? [GAP_DAY] : []),
    shiftDate(DATES.at(-1)!, 1),
    shiftDate(DATES[0]!, -1),
    "2026-13-45",
    "latest",
  ];
  for (const seg of missing) {
    const res = await request.get(`${origin}${basePath}/news/${seg}/`);
    expect(res.status(), seg).toBe(404);
    expect(await res.text(), seg).toContain("페이지를 찾을 수 없습니다");
    await res.dispose();
  }
});

test("/news/는 최신 호의 별칭 — canonical이 최신 날짜 페이지, 카드 앵커(ID)가 같다", async ({
  page,
}) => {
  test.skip(!LATEST, "data/news에 발행된 호가 없다");
  await open(page, "news/");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${siteOrigins[0]}${basePath}/news/${LATEST}/`,
  );
  const ids = await page
    .locator("li[data-nf-card] > article")
    .evaluateAll((els) => els.map((el) => el.id));
  await open(page, archivePath(LATEST!));
  expect(
    await page
      .locator("li[data-nf-card] > article")
      .evaluateAll((els) => els.map((el) => el.id)),
  ).toEqual(ids);
});

test.describe("카드 공유 앵커(FR-34) — /news/{날짜}/#c_…", () => {
  for (const pick of ["oldest", "latest"] as const) {
    test(`${pick === "oldest" ? "가장 오래된" : "최신"} 호 — 앵커 카드가 화면 맨 위(:target), 상대 시간이 채워져도 카드 기하가 그대로(자리 예약)`, async ({
      browser,
      page,
    }) => {
      test.skip(DATES.length === 0, "data/news에 발행된 호가 없다");
      const date = pick === "oldest" ? DATES[0]! : DATES.at(-1)!;
      const cards = loadNewsIssue(date)!.cards;
      test.skip(cards.length === 0, "카드가 없는 호");
      const id = cards[Math.floor(cards.length / 2)]!.id;
      // 상대 시간 채움의 레이아웃 영향은 PerformanceObserver CLS 대신 정적 HTML(JS 없음)과 채운 화면의 카드 기하로 비교한다 —
      // CI처럼 한글 폴백 글꼴이 없는 환경에서는 폰트 교체 이동이 CLS에 섞여 0.27~0.42로 실패했다(2026-10-23 CI, 견본 테스트
      // 35dce3c와 같은 원인 — 폰트 지연 CLS는 tests/e2e/fonts.spec.ts 몫).
      const geometry = (p: Page) =>
        p.evaluate(async (target) => {
          await document.fonts.ready;
          const card = document.getElementById(target);
          const time = card?.querySelector<HTMLElement>("time[data-rel]");
          if (!card || !time) return null;
          const c = card.getBoundingClientRect();
          const t = time.getBoundingClientRect();
          return {
            cardHeight: Math.round(c.height * 2) / 2,
            timeTop: Math.round((t.top - c.top) * 2) / 2,
            timeLeft: Math.round((t.left - c.left) * 2) / 2,
          };
        }, id);

      await open(page, `${archivePath(date)}#${id}`);
      await expect(page.locator("[data-rel-out]").first()).not.toHaveText("");
      const state = await page.evaluate(async (target) => {
        await document.fonts.ready;
        const el = document.getElementById(target);
        const doc = document.documentElement;
        return {
          target: document.querySelector(":target")?.id ?? null,
          top: el ? Math.round(el.getBoundingClientRect().top) : null,
          // 카드가 적은 호는 문서 끝까지 내려도 카드가 맨 위에 오지 못한다(브라우저가 갈 수 있는 데까지 내린다)
          atEnd: window.scrollY + window.innerHeight >= doc.scrollHeight - 1,
        };
      }, id);
      expect(state.target).toBe(id);
      if (state.atEnd)
        expect(state.top ?? 999).toBeLessThan(page.viewportSize()?.height ?? 0);
      else expect(Math.abs(state.top ?? 999)).toBeLessThanOrEqual(2);
      const filled = await geometry(page);

      const still = await browser.newContext({
        javaScriptEnabled: false,
        viewport: page.viewportSize() ?? { width: 1280, height: 800 },
      });
      try {
        const staticPage = await still.newPage();
        const response = await staticPage.goto(page.url());
        expect(response?.status()).toBe(200);
        const empty = await geometry(staticPage);
        expect(filled).not.toBeNull();
        expect(filled).toEqual(empty);
      } finally {
        await still.close();
      }
    });
  }
});

test.describe("가로 넘침 0", () => {
  for (const width of [375, 1023, 1024, 1279, 1280]) {
    test(`${width}px — 날짜 페이지 표본 + /news/(달력 닫힘·펼침)`, async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== "desktop",
        "폭별 검사는 desktop 프로젝트에서 한 번",
      );
      test.skip(DATES.length === 0, "data/news에 발행된 호가 없다");
      await page.setViewportSize({ width, height: 900 });
      const overflow = () =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
      for (const target of [...SAMPLE.map(archivePath), "news/"]) {
        await page.goto(target);
        expect(await overflow(), target).toBe(0);
        await calButton(page).click();
        await expect(panel(page)).toBeVisible();
        expect(await overflow(), `${target} 달력`).toBe(0);
        // 팝오버·시트가 화면 안
        const box = (await panel(page).boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
    });
  }
});
