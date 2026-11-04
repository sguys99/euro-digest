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
 * - **강등**(M5-13 — PRD §15 D77, scripts/lib/og-degrade.ts): 기본은 엄격 — 굽기 실패는 exit 1(ci.yml check job · 로컬 빌드가 템플릿
 *   회귀를 잡는다). 발행 경로(collect · weekly · deploy 빌드 단계)는 `OG_BUILD_MODE=soft`(또는 `--soft`)로 돌려 Chromium이 없거나 굽기가
 *   실패해도 경고 · 구조화 로그 · Step Summary만 남기고 다음 단계(next build)로 간다. 못 구운 쪽의 메타는 `/og/default.png`로 접히고
 *   (src/lib/seo.ts — 있는 PNG만 가리킨다), 다음 빌드가 다시 굽는다(PNG가 없거나 꼬리표가 달라 `stale`).
 * 네트워크 · 외부 이미지 없음. Chromium이 없으면 `npx playwright install chromium`.
 */
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { OG_HEIGHT, OG_WIDTH } from "@/lib/og";

import { annotate, createLogger } from "./lib/logger";
import {
  failureMessage,
  ogBuildMode,
  ogSummaryMarkdown,
  ogWarning,
  type OgFailure,
} from "./lib/og-degrade";
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

/**
 * 찍기 — 엄격 모드는 첫 실패에서 던지고, 느슨한 모드(`soft`)는 장마다 실패를 모아 돌려준다(브라우저를 띄우지 못하면 전부 실패).
 */
async function render(
  stale: OgPlanItem[],
  fonts: OgFontInput[],
  soft: boolean,
): Promise<OgFailure[]> {
  const failures: OgFailure[] = [];
  const { chromium } = await import("@playwright/test");
  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try {
    browser = await chromium.launch();
  } catch (error) {
    if (!soft) throw error;
    const message = `Chromium 실행 실패 — ${failureMessage(error)}`;
    return stale.map((item) => ({ path: item.path, message }));
  }
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
      try {
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
      } catch (error) {
        if (!soft) throw error;
        failures.push({ path: item.path, message: failureMessage(error) });
      }
    }
  } catch (error) {
    // 문서 · 글꼴 준비 단계 실패(느슨한 모드 — 장마다의 실패는 위에서 잡으므로 여기는 찍기 전) — 전부 못 구움
    if (!soft) throw error;
    const message = failureMessage(error);
    return stale.map((item) => ({ path: item.path, message }));
  } finally {
    await browser.close().catch(() => undefined);
  }
  return failures;
}

/** 느슨한 모드 실패 보고 — 경고 주석 · 구조화 로그 · Step Summary · 단계 출력 `og_failed` */
function reportDegraded(
  failures: readonly OgFailure[],
  log: ReturnType<typeof createLogger>,
): void {
  const { title, message } = ogWarning(failures);
  annotate("warning", message, { title });
  log.warn("build.og.degraded", {
    failed: failures.length,
    paths: failures.flatMap((f) => (f.path ? [f.path] : [])).slice(0, 20),
    reason: failures[0]?.message ?? "",
  });
  try {
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        ogSummaryMarkdown(failures),
      );
    }
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `og_failed=${failures.length}\n`,
      );
    }
  } catch {
    // 요약 · 출력 쓰기 실패로 빌드를 멈추지 않는다(경고 주석은 이미 남았다)
  }
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const log = createLogger({ scope: "build-og" });
  const started = Date.now();
  const mode = ogBuildMode(process.env, args);
  const soft = mode === "soft";

  let plan: ReturnType<typeof planOgImages>;
  try {
    plan = planOgImages({ force: args.has("--force") });
  } catch (error) {
    if (!soft || args.has("--check")) throw error;
    reportDegraded([{ path: null, message: failureMessage(error) }], log);
    return;
  }

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
  const failures =
    plan.stale.length > 0 ? await render(plan.stale, plan.fonts, soft) : [];
  if (failures.length > 0) reportDegraded(failures, log);
  log.info("build.og.done", {
    mode,
    total: plan.items.length,
    rendered: plan.stale.length - failures.length,
    failed: failures.length,
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
