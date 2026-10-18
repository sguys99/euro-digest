import { expect, test, type Page } from "@playwright/test";

// 뉴스 카드 불변식 (M1-31, PRD FR-30 · D23·D30, DESIGN.md §9.3) — 일반 빌드(out/)의 실제 data/news 최신 호.
// 실제 호는 날마다 바뀌므로(연결 줄·이적 카드가 없는 날이 있다) 데이터에 기대지 않는 것만 본다: 카드마다 원제목 링크·출처명·시각·
// 게재 번호, 머리기사 1장(1024 이상에서만 크게), 상대 시간 채움, 있는 '+N곳'·연결 줄의 동작. 변형 6종의 결정적 검사는 견본 e2e
// (tests/e2e-specimen/news-cards.spec.ts — fixtures 23장). 가로 넘침(375·1023·1024·1279·1280)은 shell.spec, axe는 a11y.spec가 모든 페이지에서 본다.
// data/news가 비어 있는 빌드(CI 초기 등)에서는 카드가 없어 건너뛴다.

const PAGES = [
  { name: "홈", path: "./", heading: 3 },
  { name: "뉴스", path: "news/", heading: 2 },
] as const;

async function cardCount(page: Page): Promise<number> {
  return page.locator("ol#feed > li > article").count();
}

for (const target of PAGES) {
  test.describe(target.name, () => {
    test("카드마다 원제목 링크(새 창)·대표 출처명·<time datetime>·게재 번호 06~, 요약·AI 작성 라벨 없음", async ({
      page,
    }) => {
      await page.goto(target.path);
      const n = await cardCount(page);
      test.skip(n === 0, "발행된 카드가 없는 빌드");
      const problems = await page.evaluate((level) => {
        const out: string[] = [];
        const articles = [
          ...document.querySelectorAll<HTMLElement>("ol#feed > li > article"),
        ];
        articles.forEach((article, i) => {
          const id = article.id;
          if (!/^c_[0-9a-f]{10}$/.test(id)) out.push(`${id}: ID 형식`);
          const no = article.querySelector("[aria-hidden='true']")?.textContent;
          if (no !== String(6 + i).padStart(2, "0"))
            out.push(`${id}: 번호 ${no}`);
          const h = article.querySelector(`h${level}`);
          const link = h?.querySelector("a");
          if (!h?.getAttribute("lang")) out.push(`${id}: 제목 lang`);
          if (!link || !/^https?:\/\//.test(link.getAttribute("href") ?? ""))
            out.push(`${id}: 원문 링크`);
          if (link?.getAttribute("target") !== "_blank")
            out.push(`${id}: 새 창`);
          const time = article.querySelector("time[data-rel]");
          if (!time?.getAttribute("datetime")?.endsWith("Z"))
            out.push(`${id}: 시각`);
          if (!/\d{2}\.\d{2} \d{2}:\d{2}/.test(time?.textContent ?? ""))
            out.push(`${id}: 절대 시각`);
          if (article.textContent?.includes("AI 작성"))
            out.push(`${id}: AI 라벨`);
          if (!article.querySelector("[role='img'][aria-label^='중요도 ']"))
            out.push(`${id}: 중요도`);
        });
        return out;
      }, target.heading);
      expect(problems).toEqual([]);
    });

    test("상대 시간은 하이드레이션 뒤 섬이 채운다(정적 HTML은 절대 시각만)", async ({
      page,
    }) => {
      await page.goto(target.path);
      test.skip((await cardCount(page)) === 0, "발행된 카드가 없는 빌드");
      await expect(
        page.locator("ol#feed time[data-rel] [data-rel-out]").first(),
      ).not.toBeEmpty();
      const empty = await page
        .locator("ol#feed time[data-rel] [data-rel-out]:empty")
        .count();
      expect(empty).toBe(0);
    });

    test("머리기사 1장 — 1024 이상에서만 제목이 한 단계 크다", async ({
      page,
    }, testInfo) => {
      await page.goto(target.path);
      test.skip((await cardCount(page)) < 2, "카드 2장 미만");
      const leads = page.locator("ol#feed article[data-lead]");
      await expect(leads).toHaveCount(1);
      await expect(leads).toHaveAttribute(
        "id",
        (await page.locator("ol#feed article").first().getAttribute("id")) ??
          "",
      );
      const sizes = await page.evaluate((level) => {
        const [a, b] = [
          ...document.querySelectorAll(`ol#feed article h${level}`),
        ];
        const px = (el?: Element) =>
          el ? parseFloat(getComputedStyle(el).fontSize) : 0;
        // 같은 문자 묶음(라틴/한글)끼리 비교하려고 기본 크기에 대한 배율을 본다
        const base = (el?: Element) =>
          el?.getAttribute("lang") === "ko"
            ? parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue(
                  "--text-card",
                ),
              )
            : parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue(
                  "--text-card-latin",
                ),
              );
        return { lead: px(a) / base(a), second: px(b) / base(b) };
      }, target.heading);
      const wide = (testInfo.project.use.viewport?.width ?? 0) >= 1024;
      expect(sizes.second).toBeCloseTo(1, 2);
      if (wide) expect(sizes.lead).toBeGreaterThan(1.5);
      else expect(sizes.lead).toBeCloseTo(1, 2);
    });

    test("'+N곳'·'+N건'(있으면) — Enter로 펼치고 Space로 접는다, 연결 줄(있으면)은 짝 카드 앵커", async ({
      page,
    }) => {
      await page.goto(target.path);
      test.skip((await cardCount(page)) === 0, "발행된 카드가 없는 빌드");
      await expect(
        page.locator("ol#feed time[data-rel] [data-rel-out]").first(),
      ).not.toBeEmpty(); // 하이드레이션 뒤
      const buttons = page.locator("ol#feed button[data-src-toggle]");
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
        const button = buttons.nth(i);
        const list = page.locator(
          `#${await button.getAttribute("aria-controls")}`,
        );
        await expect(button).toHaveText(/^\+\d+(곳|건)/);
        await button.focus();
        await page.keyboard.press("Enter");
        await expect(button).toHaveAttribute("aria-expanded", "true");
        await expect(list).toBeVisible();
        expect(await list.getByRole("link").count()).toBeGreaterThan(1);
        await page.keyboard.press("Space");
        await expect(button).toHaveAttribute("aria-expanded", "false");
        await expect(list).toBeHidden();
      }
      const lines = page.locator("ol#feed article a[href^='#c_']");
      for (let i = 0; i < (await lines.count()); i++) {
        const href = (await lines.nth(i).getAttribute("href")) ?? "";
        await expect(page.locator(`ol#feed article${href}`)).toHaveCount(1);
      }
    });
  });
}
