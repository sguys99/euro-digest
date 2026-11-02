/**
 * `npm run build:icons` — 임시 앱 아이콘 PNG를 public/icons/에 만든다 (PRD FR-120, plan M4-13 · **D3 아이콘 게이트에서 교체**).
 *
 * 결과 파일은 커밋한다(빌드마다 다시 그리지 않는다 — `npm run build`는 이 스크립트를 부르지 않는다). 그림 규칙은 scripts/lib/temp-icons.ts,
 * 파일 목록은 src/lib/pwa.ts(`PWA_ICONS`·`APPLE_TOUCH_ICON` — manifest·`<link rel="apple-touch-icon">`가 같은 목록을 쓴다).
 * 네트워크·외부 이미지 없음.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { APPLE_TOUCH_ICON, PWA_ICONS } from "@/lib/pwa";

import { encodePng, renderIcon, type IconVariant } from "./lib/temp-icons";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "public");

const targets: { path: string; size: number; variant: IconVariant }[] = [
  ...PWA_ICONS.map((icon) => ({
    path: icon.path,
    size: icon.size,
    variant:
      icon.purpose === "maskable" ? ("maskable" as const) : ("any" as const),
  })),
  {
    path: APPLE_TOUCH_ICON.path,
    size: APPLE_TOUCH_ICON.size,
    variant: "apple",
  },
];

for (const target of targets) {
  const file = path.join(PUBLIC_DIR, target.path);
  mkdirSync(path.dirname(file), { recursive: true });
  const png = encodePng(target.size, renderIcon(target.size, target.variant));
  writeFileSync(file, png);
  console.log(
    `[build-icons] ${target.path} ${target.size}px ${target.variant} ${png.length}B`,
  );
}
