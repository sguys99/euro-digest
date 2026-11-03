import type { MetadataRoute } from "next";

import { withBasePath } from "@/lib/paths";
import { webManifest } from "@/lib/pwa";

/*
 * `/manifest.webmanifest` (PRD FR-120, plan M4-13) — 빌드 때 out/manifest.webmanifest 한 파일로 굳힌다(정적 export — `force-static`,
 * 서버 런타임 없음, CLAUDE §1-10). Next가 모든 페이지 `<head>`에 `<link rel="manifest">`를 넣는다(basePath 포함).
 * 필드 규칙(start_url·scope = basePath + `/`, theme_color = DESIGN `--paper`, 스플래시 · 아이콘 = D3 C 스타일 ED — M5-02)은 src/lib/pwa.ts `webManifest`.
 */

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return webManifest(withBasePath);
}
