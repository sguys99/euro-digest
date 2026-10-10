/**
 * `npm run check:bundle` 진입점 (M0-12) — out/ 기준 두 가지를 검사하고 하나라도 실패하면 exit 1.
 *   1. 초기 JS 예산: 페이지별 <script src>(noModule 제외) gzip 합 ≤ 160KB (PRD DR-11·§15 D21)
 *   2. 비밀값 grep: Anthropic·GitHub 토큰, 비밀 환경변수 값 할당, .env* 파일 (NFR-07)
 * 먼저 `npm run build`가 필요하다. CI(.github/workflows/ci.yml)는 build 직후에 실행한다.
 *
 * 사용법: npm run check:bundle -- [--budget-kb <n>] [--out-dir <dir>]
 * 환경변수: BASE_PATH(next.config.ts와 같은 규칙, 기본 /euro-digest)
 */
import { statSync } from "node:fs";
import path from "node:path";

import {
  BUNDLE_CHECK_USAGE,
  BYTES_PER_KB,
  formatBudgetReport,
  parseBundleCheckArgs,
} from "./lib/bundle-budget";
import { runBundleCheck } from "./lib/bundle-check";
import { formatSecretReport } from "./lib/secret-scan";
import { normalizeBasePath } from "./lib/site-refs";

const TAG = "[check:bundle]";

const parsed = parseBundleCheckArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`${TAG} ${parsed.error}\n\n${BUNDLE_CHECK_USAGE}`);
  process.exit(1);
}
if (parsed.value.help) {
  console.log(BUNDLE_CHECK_USAGE);
  process.exit(0);
}

const outDir = path.resolve(parsed.value.outDir);
const outLabel = path.relative(process.cwd(), outDir) || ".";
let isDirectory = false;
try {
  isDirectory = statSync(outDir).isDirectory();
} catch {
  isDirectory = false;
}
if (!isDirectory) {
  console.error(
    `${TAG} ${outLabel}/ 폴더가 없습니다. 먼저 \`npm run build\`를 실행하세요.`,
  );
  process.exit(1);
}

const basePath = normalizeBasePath(process.env.BASE_PATH);
const result = runBundleCheck({
  outDir,
  basePath,
  budgetBytes: Math.round(parsed.value.budgetKb * BYTES_PER_KB),
});

console.log(
  `${TAG} 1/2 초기 JS 예산 — ${outLabel}/ HTML ${result.budget.pages.length}개, basePath "${basePath}"`,
);
console.log(formatBudgetReport(result.budget));
console.log("");
console.log(`${TAG} 2/2 비밀값 검사 — ${outLabel}/`);
console.log(formatSecretReport(result.secrets, result.secretStats));

if (!result.ok) {
  console.error(`\n${TAG} 실패 — 위 오류를 고친 뒤 다시 실행하세요.`);
  process.exit(1);
}
console.log(`\n${TAG} 통과`);
