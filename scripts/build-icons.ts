/**
 * `npm run build:icons` — 앱 아이콘 · 파비콘을 만든다 (PRD FR-120, DESIGN §9.3 D3, plan M5-02).
 *
 * 결과 파일은 커밋한다(빌드마다 다시 그리지 않는다 — `npm run build`는 이 스크립트를 부르지 않는다). 그림 규칙은 scripts/lib/app-icons.ts,
 * 파일 목록은 src/lib/pwa.ts(`PWA_ICONS` · `APPLE_TOUCH_ICON` · `FAVICON` — manifest · 루트 레이아웃 `<link>`가 같은 목록을 쓴다).
 *
 * - PNG(any · maskable · apple-touch · monochrome): Playwright Chromium(이미 devDependency — 새 의존성 0) 캔버스에 저장소의
 *   Barlow Condensed 800 woff2(public/fonts — SIL OFL 1.1, 예약 글꼴 이름 없음)로 ED를 그려 RGBA를 받고 `encodePng`로 굳힌다.
 *   글꼴 파일을 아이콘에 넣지 않는다(그린 결과 픽셀만) — OFL은 글꼴로 만든 이미지에 제한을 두지 않는다.
 * - favicon.svg · favicon.ico: 픽셀 격자(`P16` · `P32`)라 브라우저 없이 만든다.
 * 네트워크 · 외부 이미지 없음. Chromium이 없으면 `npx playwright install chromium`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import {
  APP_ICON_COLORS,
  APPLE_TOUCH_ICON,
  FAVICON,
  PWA_ICONS,
} from "@/lib/pwa";

import {
  ICON_FONT,
  ICON_TEXT,
  ICON_UNIT,
  encodePng,
  faviconIco,
  faviconSvg,
  iconPlan,
  monochromeRgba,
  type IconPlan,
  type IconVariant,
} from "./lib/app-icons";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const FONT_FILE = path.join(
  PUBLIC_DIR,
  "fonts/barlow-condensed/BarlowCondensed-ExtraBold.latin.woff2",
);

const targets: { path: string; size: number; variant: IconVariant }[] = [
  ...PWA_ICONS.map((icon) => ({
    path: icon.path,
    size: icon.size,
    variant: (icon.purpose === "any" ? "any" : icon.purpose) as IconVariant,
  })),
  {
    path: APPLE_TOUCH_ICON.path,
    size: APPLE_TOUCH_ICON.size,
    variant: "apple",
  },
];

function write(sitePath: string, data: Buffer | string, note: string): void {
  const file = path.join(PUBLIC_DIR, sitePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
  console.log(`[build-icons] ${sitePath} ${note} ${Buffer.byteLength(data)}B`);
}

/** 브라우저 안에서 도는 그리기 함수(직렬화되어 넘어간다 — 바깥 변수를 쓰지 않는다) */
async function drawInPage(args: {
  plan: IconPlan;
  size: number;
  unit: number;
  text: string;
  family: string;
  weight: number;
  fontBase64: string;
}): Promise<number[]> {
  const { plan, size, unit, text, family, weight, fontBase64 } = args;
  const bytes = Uint8Array.from(atob(fontBase64), (c) => c.charCodeAt(0));
  const face = new FontFace(family, bytes, { weight: String(weight) });
  await face.load();
  document.fonts.add(face);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
  if (!ctx) throw new Error("2d 컨텍스트 없음");
  ctx.scale(size / unit, size / unit);
  if (plan.face) {
    ctx.fillStyle = plan.face;
    ctx.fillRect(0, 0, unit, unit);
  }
  ctx.fillStyle = plan.ink;
  ctx.font = `${weight} ${plan.text.size}px "${family}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  // 자간은 글자마다 뒤에 붙는다(SVG letter-spacing과 같다 — 시안 `text-anchor="middle"` 결과와 맞춘다)
  ctx.letterSpacing = `${plan.text.letterSpacing}px`;
  if (!document.fonts.check(ctx.font, text)) {
    throw new Error(`글꼴이 준비되지 않음: ${ctx.font}`);
  }
  ctx.fillText(text, plan.text.x, plan.text.baseline);
  ctx.fillRect(plan.rule.x, plan.rule.y, plan.rule.w, plan.rule.h);
  return Array.from(ctx.getImageData(0, 0, size, size).data);
}

async function main(): Promise<void> {
  const fontBase64 = readFileSync(FONT_FILE).toString("base64");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><title>icons</title>");
    for (const target of targets) {
      const rgba = await page.evaluate(drawInPage, {
        plan: iconPlan(target.variant),
        size: target.size,
        unit: ICON_UNIT,
        text: ICON_TEXT,
        family: ICON_FONT.family,
        weight: ICON_FONT.weight,
        fontBase64,
      });
      write(
        target.path,
        encodePng(
          target.size,
          target.variant === "monochrome"
            ? monochromeRgba(Uint8Array.from(rgba), APP_ICON_COLORS.letter)
            : Uint8Array.from(rgba),
        ),
        `${target.size}px ${target.variant}`,
      );
    }
  } finally {
    await browser.close();
  }
  write(FAVICON.svg, faviconSvg(), "P32 격자 · 다크 탭 색");
  write(FAVICON.ico, faviconIco(), "P16 · P32 격자");
}

main().catch((error: unknown) => {
  console.error("[build-icons] 실패", error);
  process.exitCode = 1;
});
