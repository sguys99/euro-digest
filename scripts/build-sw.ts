/**
 * `npm run build` 마지막 단계 — out/sw.js 서비스 워커 생성 (PRD FR-121, plan M4-13). build-feeds.ts 뒤에 돈다(그 단계가 out/에 더하는
 * 파일까지 다 나온 다음 — 다만 RSS·ics·검색 색인·OG는 프리캐시하지 않는다).
 *
 * 프리캐시(설치 때 받아 두는 것 — 규칙·상한은 scripts/lib/service-worker.ts, 캐시 동작은 src/lib/sw/runtime.ts)
 *   - 앱 셸 페이지: 홈 `/` · `/news/` · 오프라인 화면 `/offline/`
 *   - 최근 3일 호: `/news/YYYY-MM-DD/` — src/lib/pwa.ts `recentIssueDates`(발행된 호 목록 · 오늘 KST — 오프라인 화면 목록과 같은 함수)
 *   - 정적 자산: `_next/static/**`(JS·CSS 청크 전부) · `fonts/**.woff2` · `icons/*.png` · `manifest.webmanifest` · `favicon.{svg,ico}`
 * 버전 = 이 파일들의 내용 해시 + 워커 코드 → 캐시 이름 `ed-pages-{version}` 등. 경로는 basePath 포함(BASE_PATH — src/lib/paths.ts).
 * 네트워크·LLM 호출 없음. 뉴스 내용은 읽지 않는다(호 날짜 목록만 — src/lib/data/issue.ts 로더).
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listIssueDates } from "@/lib/data/issue";
import { routes, withBasePath } from "@/lib/paths";
import { recentIssueDates } from "@/lib/pwa";
import { kstDate, nowUtcIso } from "@/lib/time";

import { createLogger } from "./lib/logger";
import {
  RUNTIME_PAGE_LIMIT,
  assetHashes,
  planPrecache,
  renderServiceWorker,
  sha256,
  swVersion,
  type PrecacheFile,
} from "./lib/service-worker";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const OUT_DIR = path.join(ROOT_DIR, "out");
const SW_SOURCE_DIR = path.join(ROOT_DIR, "src/lib/sw");

/** 정적 자산 폴더(out/ 기준)와 파일 조건 */
const ASSET_DIRS: { dir: string; test: RegExp }[] = [
  { dir: "_next/static", test: /\.(?:js|css|woff2)$/ },
  { dir: "fonts", test: /\.woff2$/ },
  { dir: "icons", test: /\.png$/ },
];
const ASSET_FILES = ["manifest.webmanifest", "favicon.svg", "favicon.ico"];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** out/ 안 파일 → 사이트 경로(`/fonts/a.woff2`) */
function sitePathOf(file: string): string {
  return `/${path.relative(OUT_DIR, file).split(path.sep).join("/")}`;
}

function precacheFile(file: string, sitePath: string): PrecacheFile {
  const content = readFileSync(file);
  return {
    href: withBasePath(sitePath),
    bytes: statSync(file).size,
    hash: sha256(content),
  };
}

/** 페이지 라우트(`/news/`) → out/ HTML. 없으면 null */
function pageFile(route: string): PrecacheFile | null {
  const file = path.join(OUT_DIR, `.${route}`, "index.html");
  return existsSync(file) ? precacheFile(file, route) : null;
}

function main(): number {
  const log = createLogger({ scope: "build-sw" });
  if (!existsSync(OUT_DIR)) {
    log.error("build.sw.fail", {
      errorType: "no-out-dir",
      message: "out/이 없음 — next build(정적 export) 뒤에 실행",
    });
    return 1;
  }
  const started = Date.now();

  const shellRoutes = [routes.home(), routes.news(), routes.offline()];
  const shell = shellRoutes.map((route) => {
    const file = pageFile(route);
    if (!file) throw new Error(`앱 셸 페이지가 out/에 없음: ${route}`);
    return file;
  });
  const recent = recentIssueDates(listIssueDates(), kstDate(nowUtcIso()));
  const news = recent.flatMap((date) => {
    const file = pageFile(routes.newsArchive(date));
    if (!file) log.warn("build.sw.skip", { kind: "news", date });
    return file ? [file] : [];
  });
  const assets = [
    ...ASSET_DIRS.flatMap(({ dir, test }) =>
      walk(path.join(OUT_DIR, dir)).filter((file) => test.test(file)),
    ),
    ...ASSET_FILES.map((name) => path.join(OUT_DIR, name)).filter((file) =>
      existsSync(file),
    ),
  ]
    .sort()
    .map((file) => precacheFile(file, sitePathOf(file)));

  const plan = planPrecache({ shell, news, assets });
  for (const page of plan.dropped) {
    log.warn("build.sw.drop", {
      kind: "news",
      href: page.href,
      bytes: page.bytes,
    });
  }

  const policySource = readFileSync(
    path.join(SW_SOURCE_DIR, "policy.ts"),
    "utf8",
  );
  const runtimeSource = readFileSync(
    path.join(SW_SOURCE_DIR, "runtime.ts"),
    "utf8",
  );
  const version = swVersion(
    [...plan.pages, ...plan.assets],
    `${policySource}\n${runtimeSource}`,
  );
  const sw = renderServiceWorker(
    {
      version,
      scope: withBasePath("/"),
      pages: plan.pages.map((p) => p.href),
      offline: withBasePath(routes.offline()),
      assets: plan.assets.map((a) => a.href),
      assetHashes: assetHashes(plan.assets),
      runtimePageLimit: RUNTIME_PAGE_LIMIT,
    },
    policySource,
    runtimeSource,
  );
  writeFileSync(path.join(OUT_DIR, "sw.js"), sw, "utf8");

  log.info("build.sw.done", {
    count: plan.pages.length + plan.assets.length,
    version,
    pages: plan.pages.length,
    news: plan.pages.length - shell.length,
    assets: plan.assets.length,
    precacheBytes: plan.bytes,
    swBytes: Buffer.byteLength(sw),
    elapsedMs: Date.now() - started,
  });
  return 0;
}

try {
  process.exit(main());
} catch (error: unknown) {
  console.error(
    `[build-sw] 실패: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
