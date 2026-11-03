import { expect, test, type Page } from "@playwright/test";

import { axeWcag, tabTo } from "./support/a11y";
import { sitePages, toGotoPath, withArchiveSample } from "./support/site";

// 접근성 감사(M5-06 — PRD NFR-02, CLAUDE §4 품질 기준). a11y.spec(닫힌 첫 화면 전수 axe · 44px · 포커스 링)이 보지 않는 것을 더한다.
//  ① 열린 상태 axe — 검색 오버레이 · 온보딩 · 카드 메뉴 · 토스트 · 결과 가리기 · 달력 · 오프라인 띠 · 필터 · '+N곳' · 마이 팀 · /status 날짜 이동
//     · /search 결과 × 라이트/다크 × 모바일/데스크톱(프로젝트), WCAG 2.2 A/AA
//  ② 구조 — lang="ko" · 영문 구간 lang · h1 하나 · main 하나(#main) · 건너뛰기 링크 · 표 머리글 연결 · 기호(▲▼·W/D/L·⊘) 화면 밖 이름 ·
//     aria-live 남용(assertive 0 · 영역 수 · 처음 내용 길이)
//  ③ 키보드만으로 주요 흐름 — Tab으로 닿고 Enter/Space로 쓴다(마우스·focus() 없이)
//  ④ 접근성 트리 스냅숏(대표 페이지 — 부분 일치)
// 개별 컴포넌트의 키보드 세부(검색 ↑↓·포커스 가둠, 카드 메뉴 화살표, 온보딩 단계 포커스)는 각 spec이 본다.

const COLOR_SCHEMES = ["light", "dark"] as const;

async function hydrated(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

// ─── ① 열린 상태 axe ─────────────────────────────────────────────────────────

interface OpenState {
  name: string;
  /** 상태를 연다. 끝나면 그 상태가 화면에 보여야 한다 */
  open: (page: Page, colorScheme: "light" | "dark") => Promise<void>;
  /** 이 부분만 검사(토스트처럼 금방 사라지는 것) */
  include?: string;
}

const searchDialog = (page: Page) => page.getByRole("dialog", { name: "검색" });

/**
 * 보이는 필터 칩(눌림 토글 · 건수 0이라 비활성인 칸 제외) 중 `n`번째. 뉴스는 1(375 본문 분류 칩 줄의 '전체' 다음 · 1024 이상 목차 내비의
 * EPL 다음), 이적은 0(375는 '한국 선수' 말고는 '리그 · 팀 · 단계 · Tier' 펼침 안에 접혀 있다)
 */
const filterChip = (page: Page, n: number) =>
  page
    .locator(
      "main button[aria-pressed]:not([disabled]), nav button[aria-pressed]:not([disabled])",
    )
    .filter({ visible: true })
    .nth(n);

const OPEN_STATES: OpenState[] = [
  {
    name: "검색 오버레이 — 입력 전(색인)",
    open: async (page) => {
      await page.goto("./");
      await hydrated(page);
      await page.getByRole("button", { name: "검색", exact: true }).click();
      await expect(
        searchDialog(page).getByRole("combobox", { name: "검색어" }),
      ).toBeFocused();
    },
  },
  {
    name: "검색 오버레이 — 결과 · 선택한 옵션",
    open: async (page) => {
      await page.goto("./");
      await hydrated(page);
      await page.getByRole("button", { name: "검색", exact: true }).click();
      await searchDialog(page)
        .getByRole("combobox", { name: "검색어" })
        .fill("김민재");
      await expect(
        searchDialog(page).getByRole("option").first(),
      ).toBeVisible();
      await page.keyboard.press("ArrowDown");
      await expect(
        searchDialog(page).getByRole("option").first(),
      ).toHaveAttribute("aria-selected", "true");
    },
  },
  {
    name: "온보딩 2단계(팀)",
    open: async (page) => {
      await page.goto("./");
      await hydrated(page);
      await page.getByRole("button", { name: "내 명단 만들기 시작" }).click();
      const panel = page.locator('[data-slot="onboarding-panel"]');
      await panel.getByRole("button", { name: "다음", exact: true }).click();
      await expect(
        panel.getByRole("button", { name: /2단계 팀/ }),
      ).toBeFocused();
    },
  },
  {
    name: "카드 메뉴 열림",
    open: async (page) => {
      await page.goto("./");
      await hydrated(page);
      await page
        .locator("article[id^='c_']")
        .first()
        .getByRole("button", { name: "카드 메뉴" })
        .click();
      await expect(page.getByRole("menu")).toBeVisible();
    },
  },
  {
    name: "토스트(테마 바꿈)",
    include: '[data-slot="toaster"]',
    open: async (page, colorScheme) => {
      await page.goto("./");
      await hydrated(page);
      // 시스템 설정 → 라이트 → 다크 순서 — 검사할 색 구성표에서 멈춘다(토스트 "테마: 라이트|다크")
      const toggle = page.getByRole("button", { name: /^테마:/ }).first();
      await toggle.click();
      if (colorScheme === "dark") await toggle.click();
      const toast = page
        .locator('[data-slot="toaster"]')
        .getByText(colorScheme === "dark" ? "테마: 다크" : "테마: 라이트");
      await expect(toast).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        colorScheme,
      );
      // 올려 두면 멈춘다(2.4초 뒤 사라지지 않게)
      await toast.hover();
    },
  },
  {
    name: "결과 가리기 켬 — 홈",
    open: async (page) => {
      await page.goto("./");
      await hydrated(page);
      await page.getByRole("switch", { name: "결과 가리기" }).first().click();
      await expect(
        page.getByRole("switch", { name: "결과 가리기" }).first(),
      ).toHaveAttribute("aria-checked", "true");
    },
  },
  {
    name: "결과 가리기 켬 — 대회(순위표)",
    open: async (page) => {
      await page.goto("./");
      await hydrated(page);
      await page.getByRole("switch", { name: "결과 가리기" }).first().click();
      await page.goto("competitions/epl/");
      await hydrated(page);
      await expect(
        page.getByRole("switch", { name: "결과 가리기" }).first(),
      ).toHaveAttribute("aria-checked", "true");
    },
  },
  {
    name: "월 달력 열림(/news/)",
    open: async (page) => {
      await page.goto("news/");
      await hydrated(page);
      await page.locator("[data-cal-button]").first().click();
      await expect(page.locator("#archive-cal")).toBeVisible();
    },
  },
  {
    name: "오프라인 띠",
    open: async (page) => {
      await page.goto("./");
      await hydrated(page);
      await page.context().setOffline(true);
      await expect(
        page.locator('[data-slot="offline-band"]').getByText("오프라인"),
      ).toBeVisible();
    },
  },
  {
    name: "뉴스 필터 적용(/news/)",
    open: async (page) => {
      await page.goto("news/");
      await hydrated(page);
      const chip = filterChip(page, 1);
      await chip.click();
      await expect(chip).toHaveAttribute("aria-pressed", "true");
    },
  },
  {
    name: "'+N곳' 출처 목록 펼침",
    open: async (page) => {
      await page.goto("news/");
      await hydrated(page);
      const more = page.getByRole("button", { name: /\+\d+곳/ }).first();
      await more.click();
      await expect(more).toHaveAttribute("aria-expanded", "true");
    },
  },
  {
    name: "이적 필터 적용(/transfers/)",
    open: async (page) => {
      await page.goto("transfers/");
      await hydrated(page);
      const chip = filterChip(page, 0);
      await chip.click();
      await expect(chip).toHaveAttribute("aria-pressed", "true");
    },
  },
  {
    name: "마이 팀 — 팀 팔로우 뒤(/my/)",
    open: async (page) => {
      await page.goto("teams/bayern-munchen/");
      await hydrated(page);
      await page
        .getByRole("button", { name: "팔로우 — 바이에른 뮌헨" })
        .click();
      await page.goto("my/");
      await hydrated(page);
      await expect(page.getByRole("main")).toContainText("바이에른 뮌헨");
    },
  },
  {
    name: "/status 이전 날 선택",
    open: async (page) => {
      await page.goto("status/");
      await hydrated(page);
      const before = await page
        .locator('[data-slot="status-line"]')
        .textContent();
      await page.getByRole("button", { name: "이전 날" }).click();
      await expect(page.locator('[data-slot="status-line"]')).not.toHaveText(
        before ?? "",
      );
    },
  },
  {
    name: "/search 결과",
    open: async (page) => {
      await page.goto(`search/?q=${encodeURIComponent("김민재")}`);
      await hydrated(page);
      await expect(
        page
          .getByRole("main")
          .getByRole("link", { name: /김민재/ })
          .first(),
      ).toBeVisible();
    },
  },
  {
    name: "/search 결과 0",
    open: async (page) => {
      await page.goto("search/?q=zzqqxxyy");
      await hydrated(page);
      await expect(page.getByRole("main")).toContainText("0");
    },
  },
];

test.describe("① 열린 상태 — axe WCAG 2.2 A/AA 위반 0", () => {
  for (const state of OPEN_STATES) {
    for (const colorScheme of COLOR_SCHEMES) {
      test(`${state.name} (${colorScheme})`, async ({ page }) => {
        // 홈·대회처럼 긴 페이지 전체 axe 두 번(규칙 · 누름 영역) — 부하가 큰 러너에서 기본 30초가 모자란다
        test.setTimeout(90_000);
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await state.open(page, colorScheme);
        expect(
          await axeWcag(page, state.include ? { include: state.include } : {}),
        ).toEqual([]);
      });
    }
  }
});

// ─── ② 구조 ─────────────────────────────────────────────────────────────────

const STRUCT_TARGETS = [
  ...withArchiveSample(sitePages()).map((p) => toGotoPath(p.urlPath)),
  "this-page-does-not-exist/",
].filter((p, i, all) => all.indexOf(p) === i && p !== "404.html");

interface Structure {
  lang: string;
  h1: number;
  mains: string[];
  skip: string | null;
  banners: number;
  contentinfos: number;
  unnamedNavs: number;
  tables: string[];
  latinInKo: string[];
  symbols: string[];
  redundantTabs: string[];
  live: { assertive: number; alerts: number; regions: number; long: string[] };
}

/** 페이지 구조 감사 — 보조기술이 읽는 것(숨김·aria-hidden 제외)만 본다 */
async function structure(page: Page): Promise<Structure> {
  return page.evaluate(() => {
    const exposed = (el: Element) =>
      !el.closest('[aria-hidden="true"], [hidden], template, script, style') &&
      getComputedStyle(el).display !== "none" &&
      getComputedStyle(el).visibility !== "hidden";
    /** 접근 이름(대략) — aria-label · aria-labelledby · 표의 caption */
    const named = (el: Element) =>
      Boolean(
        el.getAttribute("aria-label")?.trim() ||
        (el.getAttribute("aria-labelledby") ?? "")
          .split(/\s+/)
          .some((id) => document.getElementById(id)?.textContent?.trim()),
      );

    // 표: 이름(caption · aria-label) · 모든 th에 scope(또는 id로 headers 연결) · 데이터 칸이 머리글에 걸린다
    const tables: string[] = [];
    for (const table of document.querySelectorAll("table")) {
      if (!exposed(table)) continue;
      const label =
        table.querySelector("caption")?.textContent?.trim().slice(0, 20) ||
        table.getAttribute("aria-label") ||
        "";
      if (!label && !named(table)) tables.push("이름 없는 표");
      for (const th of table.querySelectorAll("th")) {
        if (!th.getAttribute("scope") && !th.id)
          tables.push(`${label}: scope 없는 th "${th.textContent?.trim()}"`);
      }
      if (table.querySelectorAll("th").length === 0)
        tables.push(`${label}: 머리글(th) 없음`);
    }

    // 영문 구간: 라틴 낱말 4개 이상이 이어지는 글자가 lang="ko" 범위에 있으면 안 된다(WCAG 3.1.2 — 고유명사·약어는 4낱말 미만이라 걸리지 않는다)
    const latinInKo: string[] = [];
    // 기호: 글자가 기호뿐인 조각(▲▼·⊘·●□✕·✓·↗)과 폼 글자(W/D/L)는 aria-hidden이거나 이름 있는 role=img 안이어야 한다(뜻은 화면 밖 글자로)
    const symbols: string[] = [];
    const SYMBOL_ONLY = /^[▲▼△▽⊘●○□◌✕✓↗↘]+$/u;
    const FORM_LETTER = /^[WDL]$/;
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el) continue;
      const text = (n.textContent ?? "").trim();
      if (!text) continue;
      if (el.closest("script, style, template, noscript")) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      // 그리지 않는 것(hidden · display:none 조상 — 검색 색인 기록 등)은 보조기술도 읽지 않는다. sr-only(clip)는 그려진 것으로 본다
      if (!el.checkVisibility()) continue;
      if (
        /(?:[A-Za-z][A-Za-z'’.-]*\s+){3,}[A-Za-z]/.test(text) &&
        (el.closest("[lang]")?.getAttribute("lang") ?? "") === "ko"
      )
        latinInKo.push(text.slice(0, 40));
      if (SYMBOL_ONLY.test(text) || FORM_LETTER.test(text)) {
        const img = el.closest('[role="img"]');
        if (!(img && named(img)))
          symbols.push(
            `"${text}" <${el.tagName.toLowerCase()} class="${el.className.toString().slice(0, 40)}">`,
          );
      }
    }

    // 대회 약칭 탭(title = 정식 이름): 같은 줄 바로 뒤에 정식 이름이 또 나오면 탭은 aria-hidden — "분데스 분데스리가" 중복 읽기 방지
    const redundantTabs: string[] = [];
    for (const tab of document.querySelectorAll("span[title]")) {
      if (tab.closest('[aria-hidden="true"]') || !tab.checkVisibility())
        continue;
      const full = tab.getAttribute("title") ?? "";
      const rest = (tab.parentElement?.textContent ?? "").replace(
        tab.textContent ?? "",
        "",
      );
      if (full && rest.includes(full))
        redundantTabs.push(`${(tab.textContent ?? "").trim()} → ${full}`);
    }

    // aria-live: assertive·alert는 쓰지 않는다(처음 화면 — 오류 상태는 그 상태에서) · 영역 수 상한 · 영역은 짧은 알림만 담는다
    const liveEls = [
      ...document.querySelectorAll(
        '[aria-live], [role="status"], [role="alert"], [role="log"]',
      ),
    ];
    const long = liveEls
      .filter((el) => (el.textContent ?? "").trim().length > 160)
      .map(
        (el) =>
          `${el.getAttribute("data-slot") ?? el.tagName}: ${(el.textContent ?? "").trim().length}자`,
      );

    return {
      lang: document.documentElement.lang,
      h1: [...document.querySelectorAll("h1")].filter(exposed).length,
      mains: [...document.querySelectorAll("main, [role=main]")].map(
        (m) => m.id,
      ),
      skip:
        document
          .querySelector<HTMLAnchorElement>("body a[href]")
          ?.getAttribute("href") ?? null,
      banners: [...document.querySelectorAll("header, [role=banner]")].filter(
        (h) => !h.closest("main, article, section, aside, nav") && exposed(h),
      ).length,
      contentinfos: [
        ...document.querySelectorAll("footer, [role=contentinfo]"),
      ].filter(
        (f) => !f.closest("main, article, section, aside, nav") && exposed(f),
      ).length,
      unnamedNavs: [...document.querySelectorAll("nav")].filter(
        (nav) => exposed(nav) && !named(nav),
      ).length,
      tables,
      latinInKo,
      symbols,
      redundantTabs,
      live: {
        assertive: document.querySelectorAll('[aria-live="assertive"]').length,
        alerts: document.querySelectorAll('[role="alert"]').length,
        regions: liveEls.length,
        long,
      },
    };
  });
}

test.describe("② 구조 — lang · 제목 · 랜드마크 · 표 · 기호 이름 · aria-live", () => {
  test("검사할 페이지가 있다", () => {
    expect(STRUCT_TARGETS.length, "먼저 npm run build").toBeGreaterThan(20);
  });

  for (const target of STRUCT_TARGETS) {
    test(`${target}`, async ({ page }) => {
      await page.goto(target);
      await hydrated(page);
      const s = await structure(page);
      expect(s.lang, '<html lang="ko">').toBe("ko");
      expect(s.h1, "보조기술에 드러난 h1은 하나").toBe(1);
      expect(s.mains, "main 하나 · 건너뛰기 링크 목적지 #main").toEqual([
        "main",
      ]);
      expect(s.skip, "첫 링크 = 본문 바로가기").toBe("#main");
      expect(s.banners, "머리(banner) 하나").toBe(1);
      expect(s.contentinfos, "바닥(contentinfo) 하나").toBe(1);
      expect(s.unnamedNavs, "모든 nav에 이름(aria-label)").toBe(0);
      expect(s.tables, "표 이름 · th scope").toEqual([]);
      expect(s.latinInKo, '영문 구간은 lang="en|it|es…"').toEqual([]);
      expect(
        s.symbols,
        "기호·W/D/L은 aria-hidden + 화면 밖 글자, 또는 이름 있는 role=img",
      ).toEqual([]);
      // /about 대회 목록은 약칭 ↔ 정식 이름 대응을 알려 주는 목록이라 둘 다 읽는다(about/page.tsx — 같으면 이름을 생략)
      if (target !== "about/")
        expect(s.redundantTabs, "약칭 탭 + 같은 정식 이름 중복 읽기").toEqual(
          [],
        );
      expect(s.live.assertive, 'aria-live="assertive" 없음').toBe(0);
      expect(s.live.alerts, '처음 화면에 role="alert" 없음').toBe(0);
      // 셸 공통 = 발행 지연 · 오프라인 띠 · 토스트(3) + 페이지 섬(필터 결과 · 상태 줄 · 온보딩 진행 등)
      expect(s.live.regions, "라이브 영역 수").toBeLessThanOrEqual(7);
      expect(s.live.long, "라이브 영역은 짧은 알림만(처음 160자 이하)").toEqual(
        [],
      );
    });
  }
});

// ─── ③ 키보드만으로 주요 흐름 ───────────────────────────────────────────────

test.describe("③ 키보드만으로 — Tab으로 닿고 Enter/Space로 쓴다", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("검색 — 열기(Enter) · 입력 · ↓ 선택 · Esc 닫기 · 연 버튼으로 복귀", async ({
    page,
  }) => {
    await page.goto("./");
    await hydrated(page);
    const opener = page.getByRole("button", { name: "검색", exact: true });
    expect(await tabTo(page, opener)).toBe(true);
    await page.keyboard.press("Enter");
    const box = searchDialog(page).getByRole("combobox", { name: "검색어" });
    await expect(box).toBeFocused();
    await page.keyboard.type("김민재");
    await expect(searchDialog(page).getByRole("option").first()).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(
      searchDialog(page).getByRole("option").first(),
    ).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(searchDialog(page)).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("뉴스 필터 — Space로 켜면 결과를 알리고(aria-live), Enter로 끈다", async ({
    page,
  }) => {
    await page.goto("news/");
    await hydrated(page);
    const chip = filterChip(page, 1);
    expect(await tabTo(page, chip)).toBe(true);
    await page.keyboard.press("Space");
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(chip).toBeFocused();
    await expect(page.locator("[data-nf-live]")).not.toBeEmpty();
    await page.keyboard.press("Enter");
    await expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  test("마이 팀 팔로우 — 팀 화면에서 Enter로 팔로우 → /my에 보인다", async ({
    page,
  }) => {
    await page.goto("teams/bayern-munchen/");
    await hydrated(page);
    const follow = page.getByRole("button", { name: "팔로우 — 바이에른 뮌헨" });
    expect(await tabTo(page, follow)).toBe(true);
    await page.keyboard.press("Enter");
    // 팔로우하면 눌림 상태가 되고 포커스는 그 버튼에 남는다
    await expect(follow).toHaveAttribute("aria-pressed", "true");
    await expect(follow).toBeFocused();
    await page.goto("my/");
    await hydrated(page);
    await expect(page.getByRole("main")).toContainText("바이에른 뮌헨");
  });

  test("결과 가리기 — Space로 켜고 끈다(role=switch · aria-checked)", async ({
    page,
  }) => {
    await page.goto("./");
    await hydrated(page);
    const sw = page.getByRole("switch", { name: "결과 가리기" }).first();
    expect(await tabTo(page, sw)).toBe(true);
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Space");
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await expect(sw).toBeFocused();
    await page.keyboard.press("Space");
    await expect(sw).toHaveAttribute("aria-checked", "false");
  });

  test("/status 날짜 이동 — Enter로 이전 날 · 상태 줄(aria-live)이 바뀐다 · 포커스 유지", async ({
    page,
  }) => {
    await page.goto("status/");
    await hydrated(page);
    const line = page.locator('[data-slot="status-line"]');
    await expect(line).toHaveAttribute("aria-live", "polite");
    const before = (await line.textContent()) ?? "";
    const prev = page.getByRole("button", { name: "이전 날" });
    expect(await tabTo(page, prev)).toBe(true);
    await page.keyboard.press("Enter");
    await expect(line).not.toHaveText(before);
    await expect(prev).toBeFocused();
  });

  test("온보딩 — Enter로 시작하면 포커스가 판 안으로 · Tab으로 '다음' → 2단계", async ({
    page,
  }) => {
    await page.goto("./");
    await hydrated(page);
    const start = page.getByRole("button", { name: "내 명단 만들기 시작" });
    // 입구는 저장소를 읽은 뒤 섬이 보인다 — 보인 다음부터 Tab
    await expect(start).toBeVisible();
    expect(await tabTo(page, start)).toBe(true);
    await page.keyboard.press("Enter");
    const panel = page.locator('[data-slot="onboarding-panel"]');
    await expect(panel).toBeVisible();
    // 포커스는 판이 그려진 다음 프레임에 머리로 옮긴다
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(
            document.activeElement?.closest('[data-slot="onboarding-panel"]'),
          ),
        ),
      )
      .toBe(true);
    const next = panel.getByRole("button", { name: "다음", exact: true });
    expect(await tabTo(page, next, 80)).toBe(true);
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("button", { name: /2단계 팀/ })).toBeFocused();
  });
});

// ─── ④ 접근성 트리 스냅숏 ───────────────────────────────────────────────────
// 그날 데이터로 바뀌는 글자는 정규식으로 — 랜드마크 · 제목 단계 · 표 이름 · 이름 있는 그림(중요도 · 폼)의 골격을 본다(부분 일치).

test.describe("④ 접근성 트리 — 대표 페이지 골격", () => {
  test("홈 — 건너뛰기 · 머리(h1) · 본문(5줄 · 주요 뉴스 · 카드 제목 h3 · 중요도 그림) · 옆단 · 바닥", async ({
    page,
  }) => {
    await page.goto("./");
    await hydrated(page);
    await expect(page.locator("body")).toMatchAriaSnapshot(`
      - link "본문 바로가기"
      - banner:
        - heading "유로 다이제스트" [level=1]
      - main:
        - region "오늘의 5줄":
          - heading "오늘의 5줄" [level=2]
          - list "5줄"
        - region "주요 뉴스":
          - heading "주요 뉴스" [level=2]
          - list:
            - listitem:
              - article:
                - img /^중요도 \\d\\/5$/
                - heading [level=3]:
                  - link /\\(원문 .+, 새 창\\)$/
                - button "카드 메뉴"
      - contentinfo:
        - region "구독":
          - heading "구독" [level=2]
    `);
    // 장식 러닝 헤드(영문 대문자)는 트리에 없다
    expect(await page.locator("body").ariaSnapshot()).not.toContain(
      "STARTING FIVE",
    );
  });

  test("대회 — h1 · 보기 탭 · 순위표 이름 · 열 머리글 · 행 머리글(팀) · 순위 변동 · 폼 그림 이름(데스크톱)", async ({
    page,
  }, testInfo) => {
    await page.goto("competitions/epl/");
    await hydrated(page);
    await expect(page.getByRole("main")).toMatchAriaSnapshot(`
      - region "프리미어리그":
        - heading "프리미어리그" [level=1]
        - tablist "프리미어리그 보기":
          - tab "순위표" [selected]
        - tabpanel "순위표":
          - table /^프리미어리그 순위/:
            - rowgroup:
              - row:
                - columnheader "순위·변동"
                - columnheader "팀"
            - rowgroup:
              - row:
                - cell /^\\d+ 위 (?:변동 없음|\\d+계단 (?:상승|하락)|변동 자료 없음)/
                - rowheader:
                  - link
    `);
    // 폼 칩(W/D/L 글자는 aria-hidden)은 칸 전체가 이름 있는 그림 — 1023 이하는 행 펼침 안(이 칸이 없다)
    if (testInfo.project.name === "desktop")
      await expect(
        page
          .getByRole("img", { name: /^최근 .*경기.*(?:승|무|패|자료 없음)/ })
          .first(),
      ).toBeVisible();
    expect(await page.locator("body").ariaSnapshot()).not.toContain(
      "LEAGUE TABLE",
    );
  });

  test("/status — h1 · 날짜 이동 버튼 · 발행일 목록(기호 대신 글자) · 소스 건강도 표", async ({
    page,
  }) => {
    await page.goto("status/");
    await hydrated(page);
    await expect(page.getByRole("main")).toMatchAriaSnapshot(`
      - region "발행 상태":
        - heading "발행 상태" [level=1]
        - region "최근 30일 — 수집 완료 시각":
          - heading [level=2]
          - button "이전 날"
          - button "다음 날"
          - list "최근 30일 발행일":
            - listitem: /\\d{2}\\.\\d{2} \\(.\\) · .+/
        - region "소스 건강도":
          - heading "소스 건강도" [level=2]
          - table "소스 건강도 — 최근 7일"
    `);
    const days = await page
      .getByRole("list", { name: "최근 30일 발행일" })
      .ariaSnapshot();
    // 색·기호(● □ — ⊘)가 아니라 글자로 상태를 읽는다
    expect(days).not.toMatch(/[●□⊘◌✕]/u);
    expect(days).toMatch(/정시|늦음|결호|실패|창간 전/);
  });

  test("한국 선수 상세 — 명단 내비 · h1(선수 기사) · 시즌 기록 표 · 절 제목 h2", async ({
    page,
  }) => {
    await page.goto("korean-players/kim-min-jae/");
    await hydrated(page);
    await expect(page.locator("body")).toMatchAriaSnapshot(`
      - banner
      - main:
        - article "김민재":
          - heading "김민재" [level=1]
        - region "시즌 기록":
          - heading "시즌 기록" [level=2]
          - table /^대회별 시즌 기록/
        - region "최근 5경기":
          - heading "최근 5경기" [level=2]
      - contentinfo
    `);
  });
});
