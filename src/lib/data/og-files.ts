/**
 * 구운 OG PNG가 실제로 있는지 (M5-13 — PRD §15 D77). 빌드 때(Node fs)만 쓴다 — 페이지 메타(src/lib/seo.ts `ogImageMeta`)가
 * 이것으로 **있는 PNG만** 가리킨다. 발행 경로의 OG 굽기가 실패하면(scripts/build-og.ts `OG_BUILD_MODE=soft`) 그날 날짜 PNG가 없을 수
 * 있고, 그 쪽 메타는 기본 OG(`/og/default.png`)로 접힌다. 빌드 첫 단계(build-og)가 next build보다 먼저 돌므로 페이지를 만들 때는
 * public/og가 이미 확정돼 있다. 캐시하지 않는다(dev 서버에서 나중에 구운 PNG도 바로 보이게 — existsSync 한 번은 싸다).
 */
import { existsSync } from "node:fs";
import path from "node:path";

/** 저장소 public/ — scripts/lib/og-plan.ts `PUBLIC_DIR`와 같은 기준(빌드 · 테스트 cwd = 저장소 루트) */
const PUBLIC_DIR = path.resolve("public");

/** 사이트 경로(`/og/…png`, basePath 없음)의 파일이 public/에 있는가 */
export function ogPngExists(
  sitePath: string,
  publicDir: string = PUBLIC_DIR,
): boolean {
  return existsSync(path.join(publicDir, sitePath.replace(/^\//, "")));
}
