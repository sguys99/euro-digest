import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { SCHEMES, waitForFonts } from "./support";

// `/status` 견본 e2e (M5-15 — PRD P-1, DESIGN §9.3 D3 `/status`) — SPECIMEN=1 빌드(out-specimen/) 전용.
// 견본(`/specimen/status/` — src/app/specimen/status/page.specimen.tsx)은 실제 데이터로 늘 보이지 않는 변형을 합성 실행 기록으로 싣는다:
// 띠 6종(정시 · 늦음 · 결호 · 실패 · 창간 전 · 발행 전) · 빈 데이터(대시 · 윤곽 0) · 모두 실패(성공률 0.0 윤곽).
// 실제 지면(out/status/)은 tests/e2e/status.spec.ts.

const PATH = "specimen/status/";

async function open(page: Page): Promise<void> {
  const response = await page.goto(PATH);
  expect(response?.status()).toBe(200);
  await waitForFonts(page);
}

const frame = (page: Page, slot: string) =>
  page.locator(`[data-specimen=${slot}]`);

test("띠 6종 — 기호 모양이 상태마다 다르고(색만으로 전하지 않음), 오늘 '발행 전'은 기호 없음 + 범례 글자", async ({
  page,
}) => {
  await open(page);
  const varied = frame(page, "status-varied");
  const marks = await varied
    .locator("[data-slot=status-band] [data-mark]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-mark")));
  expect(marks).toHaveLength(30);
  expect(new Set(marks)).toEqual(
    new Set(["prelaunch", "ontime", "late", "failed", "missed", "pending"]),
  );
  expect(marks.at(-1)).toBe("pending");
  await expect(
    varied.locator("[data-slot=status-band] [data-mark=pending] > *"),
  ).toHaveCount(0);
  await expect(varied.locator("[data-slot=status-legend]")).toContainText(
    "발행 전 1",
  );
  // 실패한 실행 ✕(그래프) 2개 · 늦음 □ 점 · 결호 바닥 선
  await expect(varied.locator("[data-point=failed-run]")).toHaveCount(2);
  await expect(varied.locator("[data-slot=status-line]")).toContainText(
    "발행 전",
  );
  // 배포 완료 시각 — 숫자판 캡션 둘째 줄(11-03 호 07:16), 빈 데이터 견본에는 없다
  await expect(varied.locator("[data-slot=status-deploy]")).toHaveText(
    "배포 완료 07:16 KST",
  );
  await expect(
    frame(page, "status-empty").locator("[data-slot=status-deploy]"),
  ).toHaveCount(0);
  // 계단선 — 서머타임 끝(10-25 → 10-26) 두 높이
  const d = await varied.locator("[data-slot=status-target]").getAttribute("d");
  const ys = new Set(
    [...(d ?? "").matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => m[1]),
  );
  expect(ys.size).toBe(2);
});

test("빈 데이터 · 모두 실패 — 숫자 상태(대시 · 윤곽 0) · 안내 문장", async ({
  page,
}) => {
  await open(page);
  const tones = (slot: string) =>
    frame(page, slot)
      .locator("[data-slot=status-board] [data-tone]")
      .evaluateAll((els) =>
        els.map((el) => [el.getAttribute("data-tone"), el.textContent]),
      );
  expect(await tones("status-empty")).toEqual([
    ["null", "–"],
    ["null", "–"],
    ["zero", "0.00"],
  ]);
  await expect(
    frame(page, "status-empty").locator("[data-slot=status-empty]"),
  ).toBeVisible();
  expect(await tones("status-all-failed")).toEqual([
    ["null", "–"],
    ["zero", "0.0"],
    ["zero", "0.00"],
  ]);
  const outline = await frame(page, "status-all-failed")
    .locator("[data-slot=status-board] [data-tone=zero]")
    .first()
    .evaluate((el) => ({
      fill: getComputedStyle(el).color,
      stroke: getComputedStyle(el).getPropertyValue(
        "-webkit-text-stroke-width",
      ),
    }));
  expect(outline.fill).toBe("rgba(0, 0, 0, 0)");
  expect(outline.stroke).toBe("2px");
});

test("날짜 선택 섬은 견본마다 따로 — 한 틀의 ‹가 다른 틀 선택 막대를 움직이지 않는다", async ({
  page,
}) => {
  await open(page);
  const varied = frame(page, "status-varied");
  const failed = frame(page, "status-all-failed");
  const left = (f: ReturnType<typeof frame>) =>
    f
      .locator("[data-slot=status-sel]")
      .evaluate((el) => (el as HTMLElement).style.left);
  const before = await left(failed);
  await varied.getByRole("button", { name: "이전 날" }).click();
  await expect(varied.locator("[data-slot=status-line]")).not.toContainText(
    "발행 전",
  );
  expect(await left(failed)).toBe(before);
});

for (const scheme of SCHEMES) {
  for (const width of [375, 1024, 1280]) {
    test(`${width}px ${scheme} — axe 위반 0 · 가로 넘침 0`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
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
