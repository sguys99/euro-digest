import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { loadCompetitionsConfig } from "../../src/lib/data/competitions";
import { compSegment } from "../../src/lib/paths";
import { basePath } from "./support/site";

// M4 남은 UI 조각 3개(빌드 결과 out/ 대상):
// ① 팀 한줄평 · 강점/약점(M4-06 화면 — FR-53 · 56, D64 ⑥) — 있는 팀 / 없는 팀
// ② 뒤표지 '구독' 단 + `<head>` RSS 자동 발견(M4-11 이월 · M4-12 — FR-122 · 123, DECISIONS M4 미니 게이트 #6)
// ③ .ics 버튼(M4-12 — FR-59 · 83 · 115 · 123) — 링크가 가리키는 out/calendar 파일이 실제로 200
// 폭 375 · 768 · 1024 · 1280 × 라이트 · 다크에서 axe 0 · 가로 넘침 0 · 누름 영역 44px.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const WIDTHS = [375, 768, 1024, 1280] as const;
const comps = loadCompetitionsConfig();

/** data/teams에서 프로필이 있는 팀 · 없는 팀 하나씩(데이터가 바뀌어도 표본이 비지 않게 파일에서 고른다) */
function teamSamples(): { withProfile: string | null; without: string | null } {
  const dir = path.resolve("data/teams");
  let withProfile: string | null = null;
  let without: string | null = null;
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort()) {
    const team = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as {
      slug: string;
      profile: unknown;
    };
    if (team.profile && !withProfile) withProfile = team.slug;
    if (!team.profile && !without) without = team.slug;
  }
  // 시안 기준 팀(아틀레티코 — M4 시안 A 티켓)을 우선
  const atl = path.join(dir, "atletico-madrid.json");
  try {
    if (JSON.parse(readFileSync(atl, "utf8")).profile)
      withProfile = "atletico-madrid";
  } catch {
    // 없으면 위 표본
  }
  return { withProfile, without };
}
const TEAMS = teamSamples();

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function noOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBe(0);
}

/** 범위 안 링크 · 버튼 중 누름 영역이 44px(높이) · 24px(폭) 미만인 것(korean-player.spec과 같은 기준 — `::after` 확장 포함) */
async function smallTargets(page: Page, scope: string): Promise<string[]> {
  return page.locator(`${scope} a, ${scope} button`).evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const after = getComputedStyle(el, "::after");
        const ah = parseFloat(after.height) || 0;
        const aw = parseFloat(after.width) || 0;
        return Math.max(r.height, ah) < 44 || Math.max(r.width, aw) < 24;
      })
      .map((el) => el.textContent?.trim() ?? ""),
  );
}

/** 링크 href(basePath 포함 경로 또는 절대 URL) → 로컬 서버 응답 코드 */
async function statusOf(page: Page, href: string): Promise<number> {
  const pathname = new URL(href, "http://x").pathname;
  const res = await page.request.get(pathname);
  return res.status();
}

test.describe("① 팀 한줄평 · 강점/약점", () => {
  test("프로필 있는 팀: 티켓 → 한줄평 → 팀시트 순서, 'AI 작성' 라벨 1개 + 생성 날짜, 강점 · 약점 각 2행", async ({
    page,
  }) => {
    test.skip(!TEAMS.withProfile, "프로필 있는 팀 없음");
    await open(page, `teams/${TEAMS.withProfile}/`);
    const block = page.locator("[data-slot=team-profile]");
    await expect(block).toHaveCount(1);
    await expect(
      block.getByRole("heading", { level: 2, name: "팀 한줄평" }),
    ).toBeVisible();
    await expect(block.locator("[data-slot=ai-label]")).toHaveCount(1);
    await expect(block.locator("time")).toHaveText(/^\d{2}\.\d{2} \(.\)$/);
    await expect(
      block.getByRole("list", { name: "강점" }).locator("li"),
    ).toHaveCount(2);
    await expect(
      block.getByRole("list", { name: "약점" }).locator("li"),
    ).toHaveCount(2);
    const order = await page.evaluate(() => {
      const ids = ["team-ticket", "team-profile", "team-sheet"];
      const els = ids.map((id) => document.querySelector(`[data-slot=${id}]`));
      return els.every(Boolean)
        ? els[0]!.compareDocumentPosition(els[1]!) &
            Node.DOCUMENT_POSITION_FOLLOWING &&
          els[1]!.compareDocumentPosition(els[2]!) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ? "ok"
          : "bad"
        : "no-sheet";
    });
    expect(["ok", "no-sheet"]).toContain(order);
  });

  test("프로필 없는 팀: 블록 없음(자리 상자 없음)", async ({ page }) => {
    test.skip(!TEAMS.without, "프로필 없는 팀 없음");
    await open(page, `teams/${TEAMS.without}/`);
    await expect(page.locator("[data-slot=team-ticket]")).toHaveCount(1);
    await expect(page.locator("[data-slot=team-profile]")).toHaveCount(0);
    await expect(page.getByText("팀 한줄평")).toHaveCount(0);
  });
});

test.describe("② 구독 단 · RSS 자동 발견", () => {
  test("<head> 자동 발견 — 모든 페이지 전체 피드, 대회 · 한국 선수 페이지는 해당 피드도, 가리키는 파일 200", async ({
    page,
  }) => {
    const cases: Array<[string, string[]]> = [
      ["./", ["/rss.xml"]],
      ["teams/arsenal/", ["/rss.xml"]],
      ...comps.map((c): [string, string[]] => [
        `competitions/${compSegment(c.id)}/`,
        ["/rss.xml", `/rss/${compSegment(c.id)}.xml`],
      ]),
      ["korean-players/", ["/rss.xml", "/rss/korean.xml"]],
      ["korean-players/kim-min-jae/", ["/rss.xml", "/rss/korean.xml"]],
      ["korean-players/weekly/", ["/rss.xml", "/rss/korean.xml"]],
    ];
    for (const [url, feeds] of cases) {
      await page.goto(url);
      const links = await page.evaluate(() =>
        [
          ...document.head.querySelectorAll(
            'link[rel="alternate"][type="application/rss+xml"]',
          ),
        ].map((l) => ({
          href: l.getAttribute("href")!,
          title: l.getAttribute("title"),
        })),
      );
      expect(
        links
          .map((l) => new URL(l.href).pathname.slice(basePath.length))
          .sort(),
        url,
      ).toEqual([...feeds].sort());
      for (const l of links) {
        expect(l.title).toMatch(/^유로 다이제스트/);
        expect(await statusOf(page, l.href), l.href).toBe(200);
      }
    }
  });

  test("뒤표지 구독 단 — RSS 2 · 대회 6(설정 순서) · 캘린더(webcal 구독 + .ics 받기), https 모두 200 · 이름 '{대상} RSS'", async ({
    page,
  }) => {
    await open(page, "korean-players/");
    const band = page.getByRole("contentinfo").getByRole("region", {
      name: "구독",
    });
    // 캘린더 구독 = webcal(2026-11-02 사용자 결정, M4-16) — 같은 파일의 https 주소가 옆에 있다
    const webcal = band.locator('a[data-ics-mode="webcal"]');
    await expect(webcal).toHaveCount(1);
    await expect(webcal).toHaveAttribute(
      "href",
      /^webcal:\/\/.+\/calendar\/korean\.ics$/,
    );
    const links = band.locator('a:not([data-ics-mode="webcal"])');
    await expect(links).toHaveCount(2 + comps.length + 1);
    await expect(band.locator("a[data-comp]")).toHaveText(
      // 보이는 글자 = 약칭, 화면 밖 " RSS"
      comps.map((c) => `${c.shortKo} RSS`),
    );
    await expect(band.getByRole("link", { name: "전체 소식 RSS" })).toHaveCount(
      1,
    );
    await expect(band.getByRole("link", { name: "EPL RSS" })).toHaveCount(1);
    for (const href of await links.evaluateAll((els) =>
      els.map((a) => a.getAttribute("href")!),
    )) {
      expect(await statusOf(page, href), href).toBe(200);
    }
  });

  for (const width of WIDTHS) {
    test(`${width}px — 대회 링크 ${width >= 1024 ? "한 줄" : "3×2"} · 구독 단 안에서 넘치지 않음`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "폭은 테스트가 정한다");
      await page.setViewportSize({ width, height: 900 });
      await open(page, "korean-players/");
      const geo = await page.evaluate(() => {
        const band = document.querySelector("[data-slot=subscribe]")!;
        const a = [...band.querySelectorAll("a[data-comp]")].map((el) =>
          el.getBoundingClientRect(),
        );
        const b = band.getBoundingClientRect();
        return {
          rows: new Set(a.map((r) => Math.round(r.top))).size,
          right: Math.max(...a.map((r) => r.right)) - b.right,
        };
      });
      expect(geo.rows).toBe(width >= 1024 ? 1 : 2);
      expect(geo.right).toBeLessThanOrEqual(0.5);
      await noOverflow(page);
    });
  }
});

test.describe("③ .ics 버튼 — 가리키는 파일이 실제로 있다", () => {
  test("팀 티켓 '다음 경기' 칸 — webcal 구독(이름 '{팀} 경기 일정 구독') + .ics 받기(https 200)", async ({
    page,
  }) => {
    await open(page, "teams/atletico-madrid/");
    const next = page.locator("[data-slot=team-ticket]");
    const ics = next.locator("[data-slot=ics-link]");
    await expect(ics).toHaveCount(1);
    await expect(ics).toHaveAccessibleName(/^.+ 경기 일정 구독$/);
    await expect(ics).toHaveAttribute(
      "href",
      /^webcal:\/\/.+\/calendar\/atletico-madrid\.ics$/,
    );
    const file = next.locator("[data-slot=ics-file]");
    await expect(file).toHaveAccessibleName(/^.+ 경기 \.ics 받기$/);
    expect(await statusOf(page, (await file.getAttribute("href"))!)).toBe(200);
  });

  test("선수 상세 입장권 · 오늘 밤 · /tonight · 대표팀 — 경기별 .ics 200, 링크는 예정 행에만", async ({
    page,
  }) => {
    const pages: Array<[string, string]> = [
      ["korean-players/kim-min-jae/", "[data-slot=admission]"],
      ["./", "[data-slot=tonight]"],
      ["tonight/", "[data-slot=tonight-page]"],
      ["national-team/", "[data-slot=national-schedule]"],
    ];
    let seen = 0;
    for (const [url, scope] of pages) {
      await open(page, url);
      const hrefs = await page
        .locator(`${scope} [data-slot=ics-link]`)
        .evaluateAll((els) => els.map((a) => a.getAttribute("href")!));
      for (const href of new Set(hrefs)) {
        expect(href).toMatch(/\/calendar\/match\/[a-z0-9-]+\.ics$/);
        expect(await statusOf(page, href), `${url} ${href}`).toBe(200);
        seen += 1;
      }
      // 종료 · 결과 대기 행에는 없다
      const wrong = await page
        .locator(
          `${scope} [data-state=finished] [data-slot=ics-link], ${scope} [data-state=pending] [data-slot=ics-link]`,
        )
        .count();
      expect(wrong, url).toBe(0);
    }
    expect(seen).toBeGreaterThan(0);
    // .ics 응답은 캘린더 형식
    await open(page, "korean-players/kim-min-jae/");
    const href = await page
      .locator("[data-slot=admission] [data-slot=ics-link]")
      .getAttribute("href");
    test.skip(!href, "다음 경기 없음");
    const res = await page.request.get(new URL(href!, "http://x").pathname);
    expect(await res.text()).toMatch(/^BEGIN:VCALENDAR\r\n/);
  });
});

test.describe("axe 0 · 넘침 0 · 44px — 375 · 768 · 1024 · 1280 × 라이트 · 다크", () => {
  const targets: Array<[string, string]> = [
    [
      `teams/${TEAMS.withProfile ?? "atletico-madrid"}/`,
      "[data-slot=team-page]",
    ],
    ["korean-players/", "footer"],
    ["korean-players/kim-min-jae/", "[data-slot=player-next]"],
    ["tonight/", "[data-slot=tonight-page]"],
    ["national-team/", "[data-slot=national-schedule]"],
  ];
  for (const width of WIDTHS) {
    test(`${width}px`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "폭은 테스트가 정한다");
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 900 });
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        for (const [url, scope] of targets) {
          await open(page, url);
          await noOverflow(page);
          expect(
            await smallTargets(page, scope),
            `${url} ${colorScheme}`,
          ).toEqual([]);
          const { violations } = await new AxeBuilder({ page })
            .withTags(WCAG_TAGS)
            .analyze();
          expect(
            violations.map((v) => `${url} ${colorScheme} ${v.id}`),
          ).toEqual([]);
        }
      }
    });
  }
});
