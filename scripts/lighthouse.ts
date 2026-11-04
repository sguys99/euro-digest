/**
 * `npm run lighthouse` (M5-07 — NFR-01·DR-11) — out/을 Lighthouse 모바일로 재고 페이지별 중앙값 표를 낸다.
 *
 * 도구는 Lighthouse CI(`@lhci/cli` — lighthouse 내장)이고 설정은 루트 `lighthouserc.json`(측정 횟수·카테고리·임계값) 하나다.
 * M5-08이 CI에 붙일 때도 같은 설정·같은 URL 목록을 쓴다.
 *
 * - 서버: lhci 내장 정적 서버(express + gzip 압축 — GitHub Pages처럼 압축 전송). basePath 아래에서 열리게
 *   `.lighthouseci/site/<basePath>` → out/ 심볼릭 링크를 만들어 그 폴더를 서빙한다.
 * - 브라우저: Playwright Chromium(`chromium.executablePath()` — e2e와 같은 바이너리, CI도 이미 설치).
 * - 조건: Lighthouse 기본 모바일(412×823 배율 1.75 · Slow 4G RTT 150ms · 1.6Mbps · CPU 4×), 캐시 없음. 스로틀링 방식은 `devtools`
 *   (실제로 늦춰서 잰다 — M1-39 측정과 같은 방식). `--method simulate`는 PageSpeed Insights와 같은 Lantern 시뮬레이션인데, 빠른 로컬
 *   무제한 로드에서 웹폰트(VeryHigh)가 첫 페인트 전에 끝나 FCP 필수 경로로 잡혀 FCP·LCP를 2초 안팎 비관적으로 낸다(docs/research/m5-performance.md §2).
 *
 * 사용법: npm run lighthouse -- [--runs <n>] [--url <경로>]… [--method devtools|simulate] [--assert]
 *   --url  basePath 뒤 경로(예: `teams/bayern-munchen/`). 없으면 아래 기본 목록(최신 날짜 페이지는 data/news에서 고른다)
 *   (루트 `lighthouse-baseline.json`이 있으면 쪽별 성능 중앙값을 기준선과 비교해 회귀를 warn으로 알린다 — PRD §15 D78)
 *   --assert  측정 뒤 `lhci assert`(lighthouserc.json assertMatrix — M5-08: error LCP ≤ 2000ms · CLS ≤ 0.05 · 접근성 ≥ 0.9 ·
 *             SEO ≥ 0.9(`/status/`·`/search/` noindex 제외), warn 성능 ≥ 0.95 — 중앙값 실행 기준). error가 하나라도 있으면 exit 1
 * 결과: `.lighthouseci/.lighthouseci/lhr-*.json`·`lhr-*.html`(lhci 원자료) · `assertion-results.json`(--assert) ·
 *   `.lighthouseci/summary.json` · 표준 출력에 마크다운 표. `GITHUB_STEP_SUMMARY`가 있으면(CI) 같은 내용 + 단언 결과를 Step Summary에 덧붙인다.
 *   lhci는 `.lighthouseci/`(gitignore)를 작업 폴더로 돌린다 — WSL에서 chrome-launcher가 Windows식 임시 폴더 이름
 *   (`C:\Users\…\lighthouse.NNN`)을 작업 폴더에 상대 경로로 만들어서, 저장소 루트를 더럽히지 않게.
 * 측정 중에는 빌드·e2e 같은 무거운 작업을 같이 돌리지 않는다(CPU 4× 시뮬레이션이 흔들린다).
 */
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

import {
  findRegressions,
  formatRegressionSummary,
  formatStepSummary,
  formatTable,
  LighthouseBaselineSchema,
  summarizeAssertions,
  summarizeLhrs,
  type AssertionResult,
  type AssertionSummary,
  type Lhr,
} from "./lib/lighthouse-report";
import { normalizeBasePath } from "./lib/site-refs";

const TAG = "[lighthouse]";
const WORK_DIR = path.resolve(".lighthouseci");
const SITE_DIR = path.join(WORK_DIR, "site");
/** lhci가 작업 폴더 아래에 만드는 원자료 폴더 */
const LHCI_DIR = path.join(WORK_DIR, ".lighthouseci");
const CONFIG = path.resolve("lighthouserc.json");
/** 쪽별 성능 기준선(회귀 감시 — PRD §15 D78). 없으면 감시를 건너뛴다 */
const BASELINE = path.resolve("lighthouse-baseline.json");

/** 기본 측정 대상 — 큰 HTML(대회·팀)과 섬이 많은 화면을 고루. 날짜 페이지는 최신 호로 채운다 */
const DEFAULT_PATHS = [
  "",
  "news/",
  "{latest-date}",
  "competitions/epl/",
  "competitions/ucl/",
  "teams/bayern-munchen/",
  "tonight/",
  "korean-players/",
  "transfers/",
  "status/",
] as const;

type Method = "devtools" | "simulate";
type Args = {
  runs: number | null;
  paths: string[];
  method: Method | null;
  assert: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { runs: null, paths: [], method: null, assert: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--runs") {
      const n = Number(argv[(i += 1)]);
      if (!Number.isInteger(n) || n < 1)
        throw new Error("--runs는 1 이상 정수");
      args.runs = n;
    } else if (a === "--url") {
      const p = argv[(i += 1)];
      if (p === undefined) throw new Error("--url 값 없음");
      args.paths.push(p.replace(/^\//, ""));
    } else if (a === "--method") {
      const m = argv[(i += 1)];
      if (m !== "devtools" && m !== "simulate")
        throw new Error("--method는 devtools 또는 simulate");
      args.method = m;
    } else if (a === "--assert") {
      args.assert = true;
    } else {
      throw new Error(`알 수 없는 인자: ${a}`);
    }
  }
  return args;
}

function latestNewsPath(): string {
  const files = readdirSync(path.resolve("data/news"))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  const last = files.at(-1);
  return last ? `news/${last.slice(0, 10)}/` : "news/";
}

/** `.lighthouseci/site/<basePath>` → out/ — lhci 정적 서버가 basePath 아래 경로를 그대로 찾게 */
function prepareSite(outDir: string, basePath: string): void {
  rmSync(SITE_DIR, { recursive: true, force: true });
  if (basePath === "") {
    mkdirSync(WORK_DIR, { recursive: true });
    symlinkSync(outDir, SITE_DIR, "dir");
    return;
  }
  const link = path.join(SITE_DIR, basePath.replace(/^\//, ""));
  mkdirSync(path.dirname(link), { recursive: true });
  symlinkSync(outDir, link, "dir");
}

type LhciConfig = {
  ci?: {
    collect?: {
      numberOfRuns?: number;
      settings?: { throttlingMethod?: string };
    };
  };
};

function readConfig(): LhciConfig {
  return JSON.parse(readFileSync(CONFIG, "utf8")) as LhciConfig;
}
const configuredMethod = (): string =>
  readConfig().ci?.collect?.settings?.throttlingMethod ?? "simulate";
const configuredRuns = (): number =>
  readConfig().ci?.collect?.numberOfRuns ?? 1;

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(process.env.OUT_DIR ?? "out");
  if (!existsSync(outDir) || !statSync(outDir).isDirectory()) {
    console.error(
      `${TAG} out/ 폴더가 없습니다. 먼저 \`npm run build\`를 실행하세요.`,
    );
    process.exit(1);
  }
  const basePath = normalizeBasePath(process.env.BASE_PATH);
  prepareSite(outDir, basePath);

  const paths = (args.paths.length ? args.paths : [...DEFAULT_PATHS]).map(
    (p) => (p === "{latest-date}" ? latestNewsPath() : p),
  );
  const lhci = path.resolve("node_modules/.bin/lhci");
  const collect = [
    "collect",
    `--config=${CONFIG}`,
    `--staticDistDir=${SITE_DIR}`,
    `--chromePath=${chromium.executablePath()}`,
    ...(args.runs ? [`--numberOfRuns=${args.runs}`] : []),
    ...(args.method ? [`--settings.throttlingMethod=${args.method}`] : []),
    ...paths.map((p) => `--url=http://localhost${basePath}/${p}`),
  ];
  console.log(`${TAG} 측정 ${paths.length}쪽 — ${paths.join(" · ") || "/"}`);
  const run = spawnSync(lhci, collect, { stdio: "inherit", cwd: WORK_DIR });
  if (run.status !== 0) process.exit(run.status ?? 1);

  const lhrs: Lhr[] = readdirSync(LHCI_DIR)
    .filter((f) => /^lhr-\d+\.json$/.test(f))
    .map(
      (f) => JSON.parse(readFileSync(path.join(LHCI_DIR, f), "utf8")) as Lhr,
    );
  const rows = summarizeLhrs(lhrs, basePath, paths);
  writeFileSync(
    path.join(WORK_DIR, "summary.json"),
    `${JSON.stringify(rows, null, 2)}\n`,
  );
  console.log(`\n${formatTable(rows)}\n`);

  let assertions: AssertionSummary | null = null;
  let status = 0;
  if (args.assert) {
    const resultsFile = path.join(LHCI_DIR, "assertion-results.json");
    rmSync(resultsFile, { force: true });
    const assert = spawnSync(lhci, ["assert", `--config=${CONFIG}`], {
      stdio: "inherit",
      cwd: WORK_DIR,
    });
    status = assert.status ?? 1;
    // 통과하지 못한 단언만 들어 있다(lhci 기본 — 모두 통과면 빈 배열)
    assertions = summarizeAssertions(
      existsSync(resultsFile)
        ? (JSON.parse(readFileSync(resultsFile, "utf8")) as AssertionResult[])
        : [],
    );
  }

  // 회귀 감시(D78) — 쪽별 성능 중앙값 < 기준선 − tolerance면 warn(작업은 실패시키지 않는다)
  const method = args.method ?? configuredMethod();
  let regressionText = "";
  if (existsSync(BASELINE)) {
    const baseline = LighthouseBaselineSchema.parse(
      JSON.parse(readFileSync(BASELINE, "utf8")),
    );
    const regressions = findRegressions(rows, baseline, method);
    regressionText = formatRegressionSummary(regressions, baseline, method);
    console.log(regressionText);
    if (process.env.GITHUB_ACTIONS === "true") {
      for (const r of regressions)
        console.log(
          `::warning title=Lighthouse 성능 회귀::${r.path} 성능 ${r.median} < ${r.floor} (기준선 ${r.baseline} − ${baseline.tolerance})`,
        );
    }
  }

  // GitHub Actions Step Summary(M5-08) — 쪽 × 성능 · LCP · TBT · CLS · 접근성 + benchmarkIndex
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    appendFileSync(
      stepSummary,
      formatStepSummary({
        rows,
        method,
        runs: args.runs ?? configuredRuns(),
        basePath,
        assertions,
      }) + regressionText,
    );
  }
  process.exit(status);
}

main();
