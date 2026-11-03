/**
 * e2e 접근성 공용 헬퍼 (M5-06 — NFR-02 · NFR-12). 파일 이름이 *.spec.ts가 아니므로 Playwright가 테스트로 실행하지 않는다.
 *
 * - `WCAG_TAGS`: axe 검사 기준 — WCAG 2.0·2.1·2.2 A/AA(2.2 AA는 M5-06에서 더했다).
 * - `axeWcag()`: 페이지(또는 일부)를 WCAG 기준으로 검사해 위반 요약 줄을 돌려준다. 2.5.8 누름 영역(axe `target-size`)은 따로 잰다 —
 *   1023 이하 하단 탭(sticky)이 화면 아래 가장자리에 걸친 링크를 '일부 가림'으로 판정하는데, 어느 링크가 걸치는지는 그날 데이터와 스크롤
 *   위치에 달려 있다(가운데로 옮기면 사라지는 위반 — M5-06 조사). 그래서 하단 탭을 숨긴 채 `target-size`만 한 번 더 돌린다. 실제 누름
 *   영역은 a11y.spec의 44px 검사(요소마다 가운데로 옮겨 elementFromPoint로 잰다)가 더 엄격하게 본다.
 */
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";

export const WCAG_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

/** 하단 탭을 숨기는 스타일 태그의 표식 — 검사가 끝나면 지운다 */
const HIDE_TABS_ATTR = "data-a11y-hide-tabs";

function summarize(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"],
): string[] {
  return violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? "impact 없음"}): ${violation.help} — ${violation.nodes
        .map((node) => node.target.join(" "))
        .join(", ")}`,
  );
}

/**
 * WCAG 2.0~2.2 A/AA 위반 요약(없으면 빈 배열). `include`를 주면 그 부분만 본다.
 * 1) `target-size`를 뺀 전체 규칙 → 2) 하단 탭을 숨기고 `target-size`만(위 파일 머리 설명).
 */
export async function axeWcag(
  page: Page,
  options: { include?: string } = {},
): Promise<string[]> {
  const builder = () => {
    const b = new AxeBuilder({ page });
    return options.include ? b.include(options.include) : b;
  };
  const main = await builder()
    .withTags([...WCAG_TAGS])
    .disableRules(["target-size"])
    .analyze();
  await page.evaluate((attr) => {
    const style = document.createElement("style");
    style.setAttribute(attr, "");
    style.textContent =
      'nav[aria-label="하단 탭"] { visibility: hidden !important; }';
    document.head.append(style);
  }, HIDE_TABS_ATTR);
  try {
    const size = await builder().withRules(["target-size"]).analyze();
    return [...summarize(main.violations), ...summarize(size.violations)];
  } finally {
    await page.evaluate((attr) => {
      document.querySelector(`style[${attr}]`)?.remove();
    }, HIDE_TABS_ATTR);
  }
}

/**
 * Tab만 눌러 `target`(한 요소로 풀리는 locator)에 포커스가 갈 때까지 돈다(마우스·focus() 없이 키보드로 닿는가). `max`번 안에 닿지
 * 못하면 false.
 */
export async function tabTo(
  page: Page,
  target: Locator,
  max = 250,
): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement))
      return true;
  }
  return false;
}
