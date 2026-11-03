/**
 * OG 이미지 굽기 계획 — 무엇을 어디에 굽고, 무엇이 이미 최신인지 (plan M5-01). 빌드 스크립트(scripts/build-og.ts)와 테스트
 * (tests/og.test.ts — 커밋된 public/og가 최신인지)가 같은 계산을 쓴다. 파일은 읽기만 한다.
 *
 * 입력 해시 = 템플릿 판(`OG_TEMPLATE_VERSION`) · 템플릿 CSS · 카드 마크업 · 글꼴 파일 4개 해시(scripts/lib/og-png.ts `ogInputHash`).
 * 해시가 PNG 안 꼬리표와 같으면 건너뛴다. 목록 밖 PNG는 고아(지울 대상)다.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { loadOgCards, type PlannedOgCard } from "@/lib/data/og";
import { WEB_FONT_FACES } from "@/lib/fonts";

import { ogInputHash, readOgHash, sha256Hex } from "./og-png";
import { OG_TEMPLATE_CSS, ogCardHtml } from "./og-template";

/** 템플릿 판 — 해시 밖에서 바뀐 것(찍기 설정 · 브라우저 옵션)으로 전부 다시 구워야 할 때 올린다 */
export const OG_TEMPLATE_VERSION = 1;

/** 저장소 public/ (기본) */
export const PUBLIC_DIR = path.resolve("public");

export interface OgFontInput {
  family: string;
  weight: number;
  base64: string;
}

/** 템플릿 글꼴(웹폰트 4개 — src/lib/fonts.ts) 바이트와 해시 */
export function readOgFonts(publicDir: string = PUBLIC_DIR): {
  fonts: OgFontInput[];
  digests: string[];
} {
  const faces = WEB_FONT_FACES.map((face) => ({
    family: face.family,
    weight: face.weight,
    bytes: readFileSync(path.join(publicDir, face.path.replace(/^\//, ""))),
  }));
  return {
    fonts: faces.map((f) => ({
      family: f.family,
      weight: f.weight,
      base64: f.bytes.toString("base64"),
    })),
    digests: faces.map((f) => `${f.family} ${f.weight} ${sha256Hex(f.bytes)}`),
  };
}

/** 사이트 경로(`/og/…png`) → public/ 안 파일 */
export function ogFileOf(
  sitePath: string,
  publicDir: string = PUBLIC_DIR,
): string {
  return path.join(publicDir, sitePath.replace(/^\//, ""));
}

/** public/og 아래 PNG 전부(사이트 경로, 정렬) */
export function existingOgPngs(publicDir: string = PUBLIC_DIR): string[] {
  const walk = (dir: string): string[] =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) return walk(full);
          return entry.name.endsWith(".png")
            ? [`/${path.relative(publicDir, full).split(path.sep).join("/")}`]
            : [];
        })
      : [];
  return walk(path.join(publicDir, "og")).sort();
}

export interface OgPlanItem extends PlannedOgCard {
  hash: string;
}

export interface OgPlan {
  items: OgPlanItem[];
  /** 굽거나 다시 구울 것(파일 없음 · 꼬리표 다름 · force) */
  stale: OgPlanItem[];
  /** 목록 밖 PNG(사이트 경로) */
  orphans: string[];
  fonts: OgFontInput[];
}

export function planOgImages(
  options: { publicDir?: string; force?: boolean } = {},
): OgPlan {
  const publicDir = options.publicDir ?? PUBLIC_DIR;
  const { fonts, digests } = readOgFonts(publicDir);
  const items = loadOgCards().map((item) => ({
    ...item,
    hash: ogInputHash({
      version: OG_TEMPLATE_VERSION,
      css: OG_TEMPLATE_CSS,
      html: ogCardHtml(item.card),
      fonts: digests,
    }),
  }));
  const stale = items.filter((item) => {
    if (options.force) return true;
    const file = ogFileOf(item.path, publicDir);
    return !existsSync(file) || readOgHash(readFileSync(file)) !== item.hash;
  });
  const keep = new Set(items.map((i) => i.path));
  const orphans = existingOgPngs(publicDir).filter((p) => !keep.has(p));
  return { items, stale, orphans, fonts };
}
