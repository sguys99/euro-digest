import { expect, test, type Page } from "@playwright/test";

import { loadBrief, loadBriefSlot } from "../../src/lib/data/brief";
import { loadLatestNews } from "../../src/lib/data/news";
import { briefErrorIssueUrl } from "../../src/lib/paths";
import { basePath } from "./support/site";

// 홈 — 오늘의 5줄 + 주요 뉴스 (M1-32 — PRD §4.2·D2, FR-35·FR-36, D24·D30·D38, DESIGN §9.3) — 빌드 결과(out/)의 실제 최신 호.
// 기대 값은 data/(최신 뉴스 호 → 그 날짜 브리핑 파일)에서 계산한다. 그 호의 브리핑 파일이 없으면(D38 전 호) 블록이 없어야 한다.
// 상태별(S1~S4)·폭별 모양과 44px는 견본 e2e(tests/e2e-specimen/brief.spec.ts — fixtures), 가로 넘침(375·1023·1024·1279·1280)은
// shell.spec, axe·제목 단계는 a11y.spec가 모든 페이지에서 본다.

const latest = loadLatestNews();
const brief = latest ? loadBrief(latest.date) : null;
// 5줄 자리 상태(M1-37 — 파일 없음 + 그날 게시 실행 기록이면 오류 상태 블록, src/lib/brief-slot.ts)
const slot = latest ? loadBriefSlot(latest.date) : null;

async function open(page: Page): Promise<void> {
  await page.goto("./");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

test("그 호의 브리핑 파일이 있으면 5줄이 main의 첫 섹션, 없으면 블록 없음(사실 없는 안내 금지) · 확인된 실패는 오류 상태", async ({
  page,
}) => {
  await open(page);
  const block = page.locator("[data-slot=today-brief]");
  if (!slot || slot.kind === "none") {
    await expect(block).toHaveCount(0);
    return;
  }
  await expect(block).toHaveCount(1);
  // main 맨 앞은 발행 지연 안내(M1-37 — 평소 숨김 상자 + 인라인 스크립트)이고 첫 섹션이 5줄이다
  expect(
    await page.evaluate(
      () =>
        document
          .querySelector("main#main > section")
          ?.getAttribute("data-slot") ?? null,
    ),
  ).toBe("today-brief");
  await expect(block).toHaveAttribute(
    "data-brief-mode",
    slot.kind === "brief" ? slot.brief.mode : "missing",
  );
  // 제목 순서: h1 워드마크 → h2 오늘의 5줄 → h2 주요 뉴스
  await expect(page.locator("main h2").first()).toHaveText("오늘의 5줄");
});

test("FR-35 — ai:true 줄 전부에 'AI 작성' 라벨, ai:false 줄에는 없음 · 문장은 파일 그대로", async ({
  page,
}) => {
  test.skip(!brief || brief.mode === "empty", "그 호의 5줄이 없음");
  await open(page);
  const rows = page.locator("[data-slot=brief-row]");
  await expect(rows).toHaveCount(brief?.lines.length ?? 0);
  const seen = await rows.evaluateAll((items) =>
    items.map((li) => {
      const p = li.querySelector("[data-slot=brief-text]") as HTMLElement;
      const clone = p.cloneNode(true) as HTMLElement;
      const labels = clone.querySelectorAll("[data-slot=ai-label]");
      const count = labels.length;
      labels.forEach((l) => l.remove());
      // 라벨 앞 낱말 경계(폭 0 공백)를 뺀 문장
      return { text: clone.textContent?.trimEnd(), labels: count };
    }),
  );
  expect(seen).toEqual(
    (brief?.lines ?? []).map((l) => ({ text: l.text, labels: l.ai ? 1 : 0 })),
  );
});

test("375 첫 화면에 5줄 중 4줄 이상이 보인다(DECISIONS D0 §3 — 하단 탭 위에서 시작하는 줄)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "375 모바일 프로젝트");
  test.skip(!brief || brief.lines.length === 0, "그 호의 5줄이 없음");
  await open(page);
  const visible = await page.evaluate(() => {
    const tabs = document
      .querySelector('nav[aria-label="하단 탭"]')
      ?.getBoundingClientRect().top;
    const fold = tabs ?? window.innerHeight;
    return [...document.querySelectorAll("[data-slot=brief-row]")].filter(
      (row) => row.getBoundingClientRect().top < fold,
    ).length;
  });
  expect(visible).toBeGreaterThanOrEqual(Math.min(4, brief?.lines.length ?? 0));
});

test("'AI 작성' 라벨 → /about/#ai로 이동해 AI 작성 고지 절이 화면 위에 온다", async ({
  page,
}) => {
  test.skip(!brief?.lines.some((l) => l.ai), "그 호에 AI 줄이 없음");
  await open(page);
  const label = page
    .getByRole("link", { name: "AI 작성", exact: true })
    .first();
  await expect(label).toHaveAttribute("href", `${basePath}/about/#ai`);
  await label.click();
  await expect(page).toHaveURL(new RegExp(`${basePath}/about/#ai$`));
  await expect(
    page.getByRole("heading", { level: 2, name: "AI 작성 고지" }),
  ).toBeInViewport();
});

test("하단: 데이터 출처 · AI 작성 안내(AI 줄이 있을 때) · 브리핑 오류 신고(발행 날짜를 채운 이슈 양식, FR-36)", async ({
  page,
}) => {
  test.skip(!brief, "그 호의 5줄이 없음");
  await open(page);
  const foot = page.locator("[data-slot=brief-foot]");
  await expect(foot).toContainText("데이터 football-data.org · API-Football");
  const report = foot.getByRole("link", { name: /브리핑 오류 신고/ });
  await expect(report).toHaveAttribute(
    "href",
    briefErrorIssueUrl(brief?.date ?? ""),
  );
  await expect(report).toHaveAttribute("target", "_blank");
  await expect(foot.getByRole("link", { name: "AI 작성 안내" })).toHaveCount(
    brief?.lines.some((l) => l.ai) ? 1 : 0,
  );
});
