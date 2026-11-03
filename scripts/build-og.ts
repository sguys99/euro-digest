/**
 * `npm run build:og` — 공유 OG 이미지(1200×630 PNG)를 굽는다 (PRD DR-10 · §15 D13 · D71 ②, DESIGN §9.3 D3, plan M5-01).
 * `npm run build`의 첫 단계다(next build가 public/을 out/으로 복사하기 전).
 *
 * - 목록: `loadOgCards()`(src/lib/data/og.ts — 페이지 메타와 같은 카드 빌더). 기본 · 쪽 이름형 · 날짜(발행된 호) · 대회 · 팀.
 * - 그림: 템플릿 HTML(scripts/lib/og-template.ts — D3 C CSS)을 Playwright Chromium(이미 devDependency — 새 의존성 0)으로 찍는다.
 *   글꼴은 저장소 서브셋 woff2 4개를 FontFace로 넣고 **모두 loaded인지 확인한 뒤** 찍는다(폴백 글꼴로 구운 그림을 남기지 않는다).
 * - **다시 굽지 않기**(빌드 시간): 결과는 `public/og/`에 커밋한다. PNG `tEXt`에 입력 해시(템플릿 · 카드 마크업 · 글꼴)를 적어 두고
 *   해시가 같으면 건너뛴다(scripts/lib/og-plan.ts · og-png.ts). 평소 발행 빌드는 새 호 날짜 1장만 굽고, 봇의 data 커밋이 그 PNG를
 *   `public/`과 함께 올린다. 목록에 없는 PNG(시즌 전환으로 빠진 팀 등)는 지운다. 구울 것이 없으면 브라우저를 띄우지 않는다.
 * - `--check`: 굽지 않고 구울 장 수만 낸다 — 워크플로가 Chromium 설치 여부를 정한다(`$GITHUB_OUTPUT`에 `stale=<n>`).
 * - `--force`: 해시와 무관하게 전부 다시 굽는다(144장 약 6초).
 * 네트워크 · 외부 이미지 없음. Chromium이 없으면 `npx playwright install chromium`.
 */
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { OG_HEIGHT, OG_WIDTH } from "@/lib/og";

import { createLogger } from "./lib/logger";
import { writeOgHash } from "./lib/og-png";
import {
  ogFileOf,
  planOgImages,
  type OgFontInput,
  type OgPlanItem,
} from "./lib/og-plan";
import { OG_DOCUMENT, ogCardHtml } from "./lib/og-template";

/** 브라우저 안 — 글꼴을 넣고 모두 loaded인지 확인한다(직렬화되어 넘어간다 — 바깥 변수를 쓰지 않는다) */
async function loadFontsInPage(fonts: OgFontInput[]): Promise<void> {
  for (const f of fonts) {
    const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
    const face = new FontFace(f.family, bytes, { weight: String(f.weight) });
    await face.load();
    document.fonts.add(face);
    if (face.status !== "loaded") {
      throw new Error(`글꼴 로드 실패: ${f.family} ${f.weight}`);
    }
  }
}

/** 브라우저 안 — 카드 마크업을 끼우고, 글꼴 4개가 loaded이며 글자 요소마다 그 글꼴이 준비됐는지 본다. 문제가 있으면 문구 */
async function placeCard(args: {
  html: string;
  faces: number;
}): Promise<string | null> {
  const root = document.getElementById("og");
  if (!root) return "#og 없음";
  root.innerHTML = args.html;
  await document.fonts.ready;
  const faces = [...document.fonts];
  if (faces.length !== args.faces)
    return `글꼴 ${faces.length}개(기대 ${args.faces})`;
  for (const face of faces) {
    if (face.status !== "loaded") {
      return `글꼴 ${face.family} ${face.weight} ${face.status}`;
    }
  }
  for (const el of root.querySelectorAll<HTMLElement>("*")) {
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? "")
      .join("")
      .trim();
    if (!own) continue;
    const s = getComputedStyle(el);
    const font = `${s.fontWeight} 16px ${s.fontFamily}`;
    if (!document.fonts.check(font, own))
      return `글꼴 미준비: ${font} "${own}"`;
  }
  return null;
}

async function render(
  stale: OgPlanItem[],
  fonts: OgFontInput[],
): Promise<void> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: OG_WIDTH, height: OG_HEIGHT },
      deviceScaleFactor: 1,
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.setContent(OG_DOCUMENT);
    await page.evaluate(loadFontsInPage, fonts);
    for (const item of stale) {
      const problem = await page.evaluate(placeCard, {
        html: ogCardHtml(item.card),
        faces: fonts.length,
      });
      if (problem) throw new Error(`${item.path}: ${problem}`);
      const png = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: OG_WIDTH, height: OG_HEIGHT },
        animations: "disabled",
        caret: "hide",
      });
      const file = ogFileOf(item.path);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, writeOgHash(png, item.hash));
    }
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const log = createLogger({ scope: "build-og" });
  const started = Date.now();
  const plan = planOgImages({ force: args.has("--force") });

  if (args.has("--check")) {
    log.info("build.og.check", {
      total: plan.items.length,
      stale: plan.stale.length,
      orphans: plan.orphans.length,
    });
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `stale=${plan.stale.length}\n`);
    }
    return;
  }

  for (const orphan of plan.orphans) rmSync(ogFileOf(orphan));
  if (plan.stale.length > 0) await render(plan.stale, plan.fonts);
  log.info("build.og.done", {
    total: plan.items.length,
    rendered: plan.stale.length,
    skipped: plan.items.length - plan.stale.length,
    removed: plan.orphans.length,
    elapsedMs: Date.now() - started,
  });
}

main().catch((error: unknown) => {
  console.error(
    `[build-og] 실패: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
