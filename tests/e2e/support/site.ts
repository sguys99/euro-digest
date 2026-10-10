/**
 * e2e 공용 헬퍼 — 빌드 결과(out/)에서 검사할 페이지 목록을 모은다 (M0-12, NFR-12).
 * 페이지 목록은 하드코딩하지 않는다: 새 라우트가 생기면 링크·접근성 검사 대상에 자동으로 들어온다.
 * 파일 이름이 *.spec.ts가 아니므로 Playwright가 테스트로 실행하지 않는다.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { listSitePages, type SitePage } from "../../../scripts/lib/out-dir";
import { normalizeBasePath } from "../../../scripts/lib/site-refs";

/** playwright.config.ts·serve-out.ts와 같은 규칙 */
export const basePath = normalizeBasePath(process.env.BASE_PATH);

/** 이 사이트의 운영 출처 — SITE_URL로 쓴 절대 링크(canonical·OG·RSS) 중 basePath 아래는 내부 링크로 검사한다. */
export const siteOrigins = [
  process.env.SITE_URL ?? "https://sguys99.github.io",
];

export const outDir = path.resolve(process.env.OUT_DIR ?? "out");

/** out/의 모든 HTML 페이지. out/이 없으면 빈 배열(각 spec의 첫 테스트가 빌드 누락으로 실패시킨다). */
export function sitePages(): SitePage[] {
  return existsSync(outDir) ? listSitePages(outDir) : [];
}

/**
 * page.goto용 상대 경로. baseURL이 basePath를 포함하므로 앞의 `/`를 떼야 basePath가 유지된다.
 * `/` → `./`, `/404.html` → `404.html`
 */
export function toGotoPath(urlPath: string): string {
  return urlPath.replace(/^\/+/, "") || "./";
}
