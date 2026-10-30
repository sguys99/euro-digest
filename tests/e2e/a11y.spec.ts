import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  outDir,
  sitePages,
  toGotoPath,
  withArchiveSample,
} from "./support/site";

// 빌드 후 접근성 자동 검사 (NFR-12). axe-core로 WCAG 2.0/2.1 A·AA 규칙 위반 0건을 요구한다.
// - 대상: out/의 모든 HTML 페이지 + 실제 404 응답(없는 경로) — 목록은 빌드 결과에서 모은다.
// - 라이트·다크 두 색 구성표에서 검사한다(대비 기준은 다크 포함, CLAUDE.md §4).
// - best-practice 규칙(region·landmark-one-main 등)은 태그 필터로 제외된다 — 기준은 WCAG 위반만.
// - 날짜 아카이브(`/news/{date}/`)는 같은 틀이라 표본만(첫 호·최신 호·최근 3·결호 앞뒤·월 경계 — support/site.ts `archiveSample`, M1-34 리뷰).
//   발행일마다 렌더 + axe 4번이 늘어 시간이 발행일 수에 비례하던 것을 막는다. 링크 검사(links.spec — HTTP만)는 전수.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const COLOR_SCHEMES = ["light", "dark"] as const;

const targets = [
  ...withArchiveSample(sitePages()).map((page) => ({
    name: page.file,
    gotoPath: toGotoPath(page.urlPath),
  })),
  { name: "없는 경로(404 응답)", gotoPath: "this-page-does-not-exist/" },
];

test("out/에서 접근성 검사할 페이지를 찾는다", () => {
  expect(
    targets.map((target) => target.name),
    `${outDir}에 HTML이 없습니다 — 먼저 npm run build`,
  ).toEqual(expect.arrayContaining(["index.html", "404.html"]));
});

for (const target of targets) {
  for (const colorScheme of COLOR_SCHEMES) {
    test(`${target.name} (${colorScheme}) — WCAG 2.1 A/AA 위반 0건`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(target.gotoPath);

      const { violations } = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .analyze();
      const summary = violations.map(
        (violation) =>
          `${violation.id} (${violation.impact ?? "impact 없음"}): ${violation.help} — ${violation.nodes
            .map((node) => node.target.join(" "))
            .join(", ")}`,
      );
      expect(summary, "axe 위반 목록 (규칙 설명: violation.helpUrl)").toEqual(
        [],
      );
    });
  }
}

// 제목 단계(best-practice heading-order — WCAG 태그 밖이라 위 검사에 들지 않는다). h1 → h3처럼 단계를 건너뛰지 않는다(M1-30 리뷰 —
// `/news/`는 페이지 h1 바로 아래 카드 제목을 h2로). 색과 무관해 라이트 한 번만.
for (const target of targets) {
  test(`${target.name} — 제목 단계를 건너뛰지 않는다(axe heading-order)`, async ({
    page,
  }) => {
    await page.goto(target.gotoPath);
    const { violations } = await new AxeBuilder({ page })
      .withRules(["heading-order"])
      .analyze();
    expect(
      violations.flatMap((violation) =>
        violation.nodes.map((node) => node.target.join(" ")),
      ),
    ).toEqual([]);
  });
}

// ─── 페이지 전체의 누름 영역 44px · 포커스 링 (M1-39 — DESIGN §9.1·§10) ───────────────────────────────
// 컴포넌트별 e2e(shell — 셸, news-filter — 목차·칩, card-menu — 카드 메뉴, news-archive — 꼬리표·달력, about — 차례)가 재던 것을
// 페이지 본문 전체로 넓힌다 — 5줄 'AI 작성' 라벨·오류 신고 링크·'주요 뉴스로'·카드 제목·'+N곳'·404 링크처럼 어느 spec도 재지 않던 컨트롤.
// 폭은 프로젝트(375 모바일 · 1280 데스크톱)가 정한다.

/** 눌러 쓰는 요소(건너뛰기 링크는 평소 화면 밖 — shell.spec이 따로 잰다) */
const INTERACTIVE =
  'a[href]:not([href="#main"]), button, [role="button"], input:not([type="hidden"]), select, summary, [tabindex]:not([tabindex="-1"])';

/**
 * 44px 예외로 인정한 '문장 속 링크'(WCAG 2.5.8 inline 예외) — 페이지별 전부. 규칙(아래 `inSentence`)이 넓어져 카드 제목 같은 컨트롤까지
 * 빼지 않게 예외 목록 자체를 단언한다(M1-39 리뷰 — 처음 규칙은 카드 목록 `li`를 문단으로 보아 카드 제목 링크 45개를 뺐다).
 */
const INLINE_LINK_EXCEPTIONS: Readonly<Record<string, readonly string[]>> = {
  "about/": ["요청 방법"],
};

for (const target of targets) {
  test(`${target.name} — 상호작용 요소의 누름 영역 44px 이상(예외는 문단 속 인라인 링크뿐 — WCAG 2.5.8 inline)`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(target.gotoPath);
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate((selector) => {
      const small: string[] = [];
      const inline: string[] = [];
      let checked = 0;
      // 닫힌 <details>의 내용(summary 밖)은 그리지 않아 누를 수 없다(Chrome — content-visibility: hidden, 팀 화면 접힌 일정 M2-13)
      const visible = (el: Element) =>
        el.getClientRects().length > 0 &&
        getComputedStyle(el).visibility !== "hidden" &&
        !el.closest(".sr-only") &&
        !el.closest("details:not([open]) > :not(summary)");
      const nameOf = (el: Element) =>
        (el.getAttribute("aria-label") ?? el.textContent ?? "")
          .trim()
          .slice(0, 24);
      // 문단 속 인라인 링크: `<a>`가 인라인 상자이고, 그 링크를 담은 가장 가까운 블록이 문단(p·dd)이며 링크 말고도 글자가 있다.
      // 카드 제목(h3 안)·목록 행·버튼 모양 링크(inline-flex)는 해당하지 않는다
      const inSentence = (el: Element) => {
        if (el.tagName !== "A" || getComputedStyle(el).display !== "inline")
          return false;
        let block = el.parentElement;
        while (block && getComputedStyle(block).display.startsWith("inline"))
          block = block.parentElement;
        if (!block?.matches("p, dd")) return false;
        return (
          (block.textContent ?? "")
            .replace(el.textContent ?? "", "")
            .replace(/\s+/g, "").length > 0
        );
      };
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        if (!visible(el)) continue;
        if (inSentence(el)) {
          inline.push(nameOf(el));
          continue;
        }
        checked += 1;
        // 화면 가운데로 옮겨(sticky 하단 탭·목차 안 스크롤 포함) 실제 누름 판정(elementFromPoint — ::after 확장 포함)으로 잰다
        el.scrollIntoView({ block: "center", inline: "nearest" });
        const hits = (x: number, y: number) => {
          const hit = document.elementFromPoint(x, y);
          return hit !== null && (hit === el || el.contains(hit));
        };
        const rects = [el.getBoundingClientRect(), ...el.getClientRects()];
        const start = rects
          .map((r) => [r.left + r.width / 2, r.top + r.height / 2] as const)
          .find(([x, y]) => hits(x, y));
        if (!start) {
          small.push(`${nameOf(el)}: 가운데를 눌러도 이 요소가 아니다(가려짐)`);
          continue;
        }
        const [cx, cy] = start;
        const reach = (dx: number, dy: number) => {
          let n = 0;
          while (n < 40 && hits(cx + dx * (n + 1), cy + dy * (n + 1))) n++;
          return n;
        };
        const w = reach(-1, 0) + reach(1, 0) + 1;
        const h = reach(0, -1) + reach(0, 1) + 1;
        if (w < 44 || h < 44) small.push(`${nameOf(el)}: 누름 영역 ${w}×${h}`);
      }
      // 카드 제목 링크가 실제로 검사 대상에 들었는지(예외로 빠지지 않았는지) — 카드가 있는 페이지
      const cardTitles = [
        ...document.querySelectorAll("article[id^='c_'] :is(h2, h3) a[href]"),
      ].filter(visible).length;
      return { small, inline, checked, cardTitles };
    }, INTERACTIVE);
    expect(result.inline).toEqual(
      INLINE_LINK_EXCEPTIONS[target.gotoPath] ?? [],
    );
    expect(result.checked).toBeGreaterThanOrEqual(result.cardTitles + 5);
    expect(result.small).toEqual([]);
  });
}

/** 포커스 순회 대상 — 틀이 다른 페이지 하나씩(날짜 아카이브는 최신 호 하나) */
const FOCUS_TARGETS = (() => {
  const archives = targets.filter((t) =>
    /^news\/\d{4}-\d{2}-\d{2}\/$/.test(t.gotoPath),
  );
  return [
    ...targets.filter((t) =>
      ["./", "news/", "about/", "this-page-does-not-exist/"].includes(
        t.gotoPath,
      ),
    ),
    ...archives.slice(-1),
  ];
})();

/**
 * 페이지 끝까지 Tab으로 돌며 포커스한 요소마다 링(3px 실선 · :focus-visible · 둘레와 3:1)·화면 안·스크롤 상자에 잘림·가림(하단 탭·오프라인 띠 등
 * 위에 덮인 요소 — 요소 상자 가운데의 elementFromPoint)을 잰다. 400번 안에 한 바퀴(처음 본 요소로 돌아오거나 body)를 다 돌아야 한다
 */
async function tabThroughPage(
  page: Page,
): Promise<{ problems: string[]; checked: number; completed: boolean }> {
  const problems: string[] = [];
  let checked = 0;
  let completed = false;
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return { done: true } as const;
      const w = window as unknown as { __seen?: WeakSet<Element> };
      w.__seen ??= new WeakSet();
      if (w.__seen.has(el)) return { done: true } as const;
      w.__seen.add(el);
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
      let bg = parse(getComputedStyle(document.body).backgroundColor);
      for (let a = el.parentElement; a; a = a.parentElement) {
        const c = parse(getComputedStyle(a).backgroundColor);
        if ((c[3] ?? 0) > 0) {
          bg = c;
          break;
        }
      }
      const style = getComputedStyle(el);
      const [hi, lo] = [lum(parse(style.outlineColor)), lum(bg)].sort(
        (x, y) => y - x,
      );
      const ring =
        parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
      const r = el.getBoundingClientRect();
      const box = {
        l: r.left - ring,
        t: r.top - ring,
        r: r.right + ring,
        b: r.bottom + ring,
      };
      // 스크롤 상자(overflow ≠ visible) 조상이 링을 자르지 않는가 — 안쪽 상자(테두리 안) 기준, 0.5px 오차
      const clippedBy: string[] = [];
      for (
        let a = el.parentElement;
        a && a !== document.body;
        a = a.parentElement
      ) {
        const cs = getComputedStyle(a);
        if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
        const ar = a.getBoundingClientRect();
        const inner = {
          l: ar.left + a.clientLeft,
          t: ar.top + a.clientTop,
          r: ar.left + a.clientLeft + a.clientWidth,
          b: ar.top + a.clientTop + a.clientHeight,
        };
        const xClip =
          cs.overflowX !== "visible" &&
          (box.l < inner.l - 0.5 || box.r > inner.r + 0.5);
        const yClip =
          cs.overflowY !== "visible" &&
          (box.t < inner.t - 0.5 || box.b > inner.b + 0.5);
        if (xClip || yClip)
          clippedBy.push(
            `${a.tagName.toLowerCase()}${a.getAttribute("aria-label") ? `[${a.getAttribute("aria-label")}]` : ""}`,
          );
      }
      // 가림: 상자(줄 조각) 가운데 중 하나라도 이 요소가 눌려야 한다 — sticky 하단 탭·오프라인 띠 같은 위 요소에 덮이면 아니다
      const covered = ![r, ...el.getClientRects()].some((q) => {
        const hit = document.elementFromPoint(
          q.left + q.width / 2,
          q.top + q.height / 2,
        );
        return hit !== null && (hit === el || el.contains(hit));
      });
      return {
        covered,
        name: (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName)
          .trim()
          .slice(0, 24),
        ok:
          el.matches(":focus-visible") &&
          style.outlineStyle === "solid" &&
          style.outlineWidth === "3px",
        outline: `${style.outlineStyle} ${style.outlineWidth}`,
        ratio: ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05),
        inView:
          r.bottom > 0 &&
          r.top < innerHeight &&
          r.right > 0 &&
          r.left < innerWidth,
        clippedBy,
      };
    });
    if ("done" in info) {
      completed = true;
      break;
    }
    checked += 1;
    if (!info.ok) problems.push(`${info.name}: 링 ${info.outline}`);
    if (info.ratio < 3)
      problems.push(`${info.name}: 링 대비 ${info.ratio.toFixed(2)}`);
    if (!info.inView) problems.push(`${info.name}: 포커스해도 화면 밖`);
    else if (info.covered)
      problems.push(
        `${info.name}: 포커스한 요소가 다른 요소(하단 탭·띠 등)에 가림`,
      );
    if (info.clippedBy.length > 0)
      problems.push(`${info.name}: 링이 ${info.clippedBy.join(" · ")}에 잘림`);
  }
  return { problems, checked, completed };
}

for (const target of FOCUS_TARGETS) {
  for (const colorScheme of COLOR_SCHEMES) {
    test(`${target.name} (${colorScheme}) — Tab으로 도는 모든 요소에 3px 실선 포커스 링 · 둘레와 3:1 이상 · 화면 안 · 가리지 않음 · 스크롤 상자에 잘리지 않음`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto(target.gotoPath);
      await page.evaluate(() => document.fonts.ready);
      const { problems, checked, completed } = await tabThroughPage(page);
      // 400번 상한에 걸리지 않고 한 바퀴를 다 돌았다
      expect(completed).toBe(true);
      // 건너뛰기 · 워드마크 · 테마 토글 · 뒤표지 4는 모든 페이지에 있다
      expect(checked).toBeGreaterThanOrEqual(7);
      expect(problems).toEqual([]);
    });
  }
}

// 오프라인 띠(M1-37 — 1023 이하 하단 탭 위 · 1024 이상 화면 아래 sticky)가 보이는 동안에도 Tab으로 간 요소가 띠·하단 탭에 가리지 않는다
// (globals.css §8 scroll-padding-bottom에 띠 높이를 더한다)
test("홈 오프라인 — 띠가 보이는 동안에도 Tab으로 간 요소가 띠·하단 탭에 가리지 않는다", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await page.evaluate(() => document.fonts.ready);
  await context.setOffline(true);
  await expect(
    page.locator('[data-slot="offline-band"]').getByText("오프라인"),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        parseFloat(
          document.documentElement.style.getPropertyValue("--offline-band-h") ||
            "0",
        ),
      ),
    )
    .toBeGreaterThan(0);
  const { problems, completed } = await tabThroughPage(page);
  await context.setOffline(false);
  expect(completed).toBe(true);
  expect(problems).toEqual([]);
});
