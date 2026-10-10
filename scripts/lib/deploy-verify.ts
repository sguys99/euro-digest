/**
 * 배포 후 확인(`npm run verify:deploy`) 판정 로직 — I/O 없는 순수 함수 (M0-13, FR-154).
 * HTTP 요청·출력·종료는 scripts/verify-deploy.ts가 맡는다.
 *
 * 검사 항목
 *   1. 홈: 200 + `<html lang="ko">` + `<title>`에 서비스 이름
 *   2. 정적 자산: 홈·404 HTML이 참조하는 `_next/static/*` 전부 200
 *   3. 404: 없는 경로가 404 상태 + 사이트 404 페이지(홈 `${basePath}/` 링크) — GitHub 기본 404가 아님
 *   4. trailing slash: 슬래시 없는 디렉터리 경로가 슬래시 붙은 경로로 리다이렉트(또는 200)
 */
import { parseArgs } from "node:util";

import { displayWidth } from "./bundle-budget";
import type { ParseResult } from "./cli-args";
import {
  collectInternalRefs,
  decodeHtmlEntities,
  normalizeBasePath,
  parseTags,
  resolveRef,
  type ResolveOptions,
} from "./site-refs";

export const DEFAULT_SITE_ORIGIN = "https://sguys99.github.io";

/** 정적 자산으로 검사할 사이트 안 경로 접두(basePath 제외) */
export const STATIC_ASSET_PREFIX = "/_next/static/";

/** HTML 요청에 붙이는 캐시 우회 쿼리 이름(CDN에 남은 이전 응답 대신 새 배포를 본다) */
export const CACHE_BUST_PARAM = "_verify";

export interface VerifyDeployArgs {
  /** 검사할 사이트 주소. 항상 `/`로 끝난다(예: `https://sguys99.github.io/euro-digest/`) */
  siteUrl: string;
  /** trailing slash 검사에 더할 디렉터리 경로(basePath 기준, 앞뒤 `/` 없음. 예: `news`) */
  dirs: string[];
  help: boolean;
}

export const VERIFY_DEPLOY_USAGE = [
  "사용법: npm run verify:deploy -- [사이트 URL] [--dir <경로>]...",
  `  사이트 URL     기본: SITE_URL(기본 ${DEFAULT_SITE_ORIGIN}) + BASE_PATH(기본 /euro-digest) + "/"`,
  "  --dir <경로>   trailing slash 검사에 더할 디렉터리(basePath 기준, 예: news). 여러 번 지정 가능",
  "                 사이트 루트(basePath 자체)는 항상 검사한다",
  "  --help, -h     이 도움말",
  "실패 항목이 하나라도 있으면 exit 1.",
].join("\n");

export interface DefaultSiteEnv {
  SITE_URL?: string;
  BASE_PATH?: string;
}

/** 인자를 주지 않았을 때의 사이트 주소 — next.config.ts·deploy.yml과 같은 SITE_URL·BASE_PATH 규칙 */
export function defaultSiteUrl(env: DefaultSiteEnv): string {
  const origin = (env.SITE_URL?.trim() || DEFAULT_SITE_ORIGIN).replace(
    /\/+$/,
    "",
  );
  return `${origin}${normalizeBasePath(env.BASE_PATH)}/`;
}

/** http(s) 절대 URL만 받아 쿼리·조각을 떼고 끝에 `/`를 붙인다. */
export function normalizeSiteUrl(raw: string): ParseResult<string> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return {
      ok: false,
      error: `사이트 URL이 올바르지 않습니다 (받은 값: "${raw}")`,
    };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return {
      ok: false,
      error: `사이트 URL은 http(s)여야 합니다 (받은 값: "${raw}")`,
    };
  }
  const pathname = url.pathname.endsWith("/")
    ? url.pathname
    : `${url.pathname}/`;
  return { ok: true, value: `${url.origin}${pathname}` };
}

/**
 * `verify:deploy` 인자를 파싱한다.
 * @param argv `process.argv.slice(2)`
 * @param env 기본 사이트 주소를 정할 환경변수(SITE_URL·BASE_PATH)
 */
export function parseVerifyDeployArgs(
  argv: readonly string[],
  env: DefaultSiteEnv,
): ParseResult<VerifyDeployArgs> {
  let values: { dir?: string[]; help?: boolean };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: true,
      options: {
        dir: { type: "string", multiple: true },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (positionals.length > 1) {
    return {
      ok: false,
      error: `사이트 URL은 하나만 받습니다 (받은 값: ${positionals.join(", ")})`,
    };
  }
  const site = normalizeSiteUrl(positionals[0] ?? defaultSiteUrl(env));
  if (!site.ok) return site;

  const dirs: string[] = [];
  for (const raw of values.dir ?? []) {
    const dir = raw.trim().replace(/^\/+|\/+$/g, "");
    if (dir === "" || /[?#]/.test(dir)) {
      return {
        ok: false,
        error: `--dir에는 basePath 기준 디렉터리 경로를 넣어야 합니다 (받은 값: "${raw}")`,
      };
    }
    if (!dirs.includes(dir)) dirs.push(dir);
  }

  return {
    ok: true,
    value: { siteUrl: site.value, dirs, help: values.help ?? false },
  };
}

export interface SiteTarget {
  /** 예: `https://sguys99.github.io` */
  origin: string;
  /** 예: `/euro-digest` (루트 사이트면 "") */
  basePath: string;
  /** 예: `https://sguys99.github.io/euro-digest/` */
  homeUrl: string;
  /** site-refs 해석 옵션 — 이 출처의 절대 링크도 내부 링크로 본다 */
  resolveOptions: ResolveOptions;
}

/** normalizeSiteUrl을 거친 주소 → 출처·basePath */
export function siteTarget(siteUrl: string): SiteTarget {
  const url = new URL(siteUrl);
  const basePath = url.pathname.replace(/\/+$/, "");
  return {
    origin: url.origin,
    basePath,
    homeUrl: `${url.origin}${basePath}/`,
    resolveOptions: { basePath, siteOrigins: [url.origin] },
  };
}

/** basePath 기준 사이트 안 경로(`/`로 시작) → 절대 URL */
export function siteUrlFor(target: SiteTarget, sitePath: string): string {
  return `${target.origin}${target.basePath}${sitePath}`;
}

/** URL에 캐시 우회 쿼리를 붙인다(기존 쿼리 유지). */
export function withCacheBust(url: string, token: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(CACHE_BUST_PARAM, token);
  return parsed.href;
}

/** 존재할 수 없는 사이트 안 경로(`/`로 끝나는 디렉터리 모양) */
export function missingSitePath(token: string): string {
  return `/__verify-deploy-missing-${token}/`;
}

/** HTTP 응답 요약. 요청 자체가 실패하면 status는 null, error에 이유 */
export interface FetchedResponse {
  url: string;
  status: number | null;
  /** 3xx의 Location 헤더(없으면 null) */
  location: string | null;
  body: string;
  error: string | null;
}

export type CheckGroup = "홈" | "자산" | "404" | "슬래시";

export interface CheckResult {
  group: CheckGroup;
  /** 검사 대상(사이트 안 경로 또는 설명) */
  target: string;
  expected: string;
  actual: string;
  ok: boolean;
}

/** 표시용: URL·경로에서 캐시 우회 쿼리(`_verify=…`)만 뺀다(다른 쿼리·조각은 유지). */
export function stripCacheBust(location: string): string {
  return location
    .replace(new RegExp(`([?&])${CACHE_BUST_PARAM}=[^&#]*&?`), "$1")
    .replace(/[?&](#|$)/, "$1");
}

function describeStatus(response: FetchedResponse): string {
  if (response.status === null) {
    return `요청 실패${response.error ? `: ${response.error}` : ""}`;
  }
  return response.location
    ? `${response.status} → ${stripCacheBust(response.location)}`
    : String(response.status);
}

/** HTML `<title>` 텍스트(엔터티를 풀고 공백을 정리). 없으면 null */
export function extractTitle(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(
    html.replace(/<!--[\s\S]*?-->/g, ""),
  );
  if (!match) return null;
  return decodeHtmlEntities(match[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 첫 `<html>` 태그의 lang 값. 태그나 속성이 없으면 null */
export function extractHtmlLang(html: string): string | null {
  const [tag] = parseTags(html, ["html"]);
  return tag?.attrs.get("lang") ?? null;
}

const SKIPPED_NOT_200 = "(홈이 200이 아니라 건너뜀)";

/** ① 홈: 200 + lang="ko" + 제목에 서비스 이름 */
export function checkHome(
  response: FetchedResponse,
  expectedTitle: string,
): CheckResult[] {
  const target = "/";
  const statusOk = response.status === 200;
  const results: CheckResult[] = [
    {
      group: "홈",
      target,
      expected: "200",
      actual: describeStatus(response),
      ok: statusOk,
    },
  ];
  const lang = statusOk ? extractHtmlLang(response.body) : null;
  results.push({
    group: "홈",
    target: `${target} <html lang>`,
    expected: "ko",
    actual: statusOk ? (lang ?? "(없음)") : SKIPPED_NOT_200,
    ok: lang === "ko",
  });
  const title = statusOk ? extractTitle(response.body) : null;
  results.push({
    group: "홈",
    target: `${target} <title>`,
    expected: `"${expectedTitle}" 포함`,
    actual: statusOk
      ? title === null
        ? "(없음)"
        : `"${title}"`
      : SKIPPED_NOT_200,
    ok: title !== null && title.includes(expectedTitle),
  });
  return results;
}

/**
 * HTML이 참조하는 `_next/static/*` 자산의 사이트 안 경로(중복 제거, 등장 순서).
 * @param pageUrlPath 그 HTML이 서빙된 사이트 안 경로(상대 참조 해석 기준)
 */
export function listStaticAssetPaths(
  html: string,
  pageUrlPath: string,
  options: ResolveOptions,
): string[] {
  return collectInternalRefs(html, pageUrlPath, options)
    .internal.map((target) => target.sitePath)
    .filter((sitePath) => sitePath.startsWith(STATIC_ASSET_PREFIX));
}

export interface AssetResponse {
  sitePath: string;
  response: FetchedResponse;
}

/** ② 정적 자산: 하나 이상 있어야 하고 전부 200 */
export function checkAssets(assets: readonly AssetResponse[]): CheckResult[] {
  if (assets.length === 0) {
    return [
      {
        group: "자산",
        target: `${STATIC_ASSET_PREFIX}*`,
        expected: "참조 1개 이상, 전부 200",
        actual: "홈·404 HTML에서 참조를 찾지 못함",
        ok: false,
      },
    ];
  }
  return assets.map(({ sitePath, response }) => ({
    group: "자산",
    target: sitePath,
    expected: "200",
    actual: describeStatus(response),
    ok: response.status === 200,
  }));
}

/**
 * ③ 404: 없는 경로가 404 상태로, 사이트 홈(`${basePath}/`)으로 가는 링크가 있는 사이트 404 페이지를 준다.
 * 링크는 요청한 없는 경로 기준으로 해석한다 — 상대 링크(`./`)는 404 페이지가 걸리는 위치마다 달라지므로 실패.
 */
export function checkNotFound(
  response: FetchedResponse,
  missingPath: string,
  target: SiteTarget,
): CheckResult[] {
  const results: CheckResult[] = [
    {
      group: "404",
      target: missingPath,
      expected: "404",
      actual: describeStatus(response),
      ok: response.status === 404,
    },
  ];

  const homeHref = `${target.basePath}/`;
  const links = parseTags(response.body, ["a"])
    .map((tag) => tag.attrs.get("href"))
    .filter((href): href is string => href !== undefined);
  const hasHomeLink = links.some((href) => {
    const resolved = resolveRef(href, missingPath, target.resolveOptions);
    return resolved.kind === "internal" && resolved.sitePath === "/";
  });
  results.push({
    group: "404",
    target: `${missingPath} 본문`,
    expected: `홈 링크 ${homeHref}`,
    actual: hasHomeLink
      ? "있음"
      : response.body === ""
        ? "(본문 없음)"
        : "없음 — 사이트 404.html이 아님(GitHub 기본 404 등)",
    ok: hasHomeLink,
  });
  return results;
}

/**
 * ④ trailing slash: `requestPath`(슬래시 없음)가 `${requestPath}/`로 리다이렉트(3xx)되거나 바로 200이면 통과.
 * Location은 상대·절대 모두 허용하고 경로만 비교한다(캐시 우회 쿼리 무시).
 */
export function checkTrailingSlash(
  response: FetchedResponse,
  requestPath: string,
): CheckResult {
  const expectedPath = `${requestPath}/`;
  const base: Omit<CheckResult, "ok"> = {
    group: "슬래시",
    target: requestPath,
    expected: `3xx → ${expectedPath} (또는 200)`,
    actual: describeStatus(response),
  };
  const { status } = response;
  if (status === 200) return { ...base, ok: true };
  if (status === null || status < 300 || status >= 400 || !response.location) {
    return { ...base, ok: false };
  }
  let locationPath: string;
  try {
    locationPath = new URL(response.location, response.url).pathname;
  } catch {
    return { ...base, ok: false };
  }
  return { ...base, ok: locationPath === expectedPath };
}

/** trailing slash 검사 대상 경로(슬래시 없음): 사이트 루트(basePath) + `--dir` 경로들 */
export function trailingSlashPaths(
  basePath: string,
  dirs: readonly string[],
): string[] {
  const paths = basePath === "" ? [] : [basePath];
  for (const dir of dirs) {
    const path = `${basePath}/${dir}`;
    if (!paths.includes(path)) paths.push(path);
  }
  return paths;
}

function pad(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - displayWidth(text)))}`;
}

const MAX_CELL_WIDTH = 72;

function truncate(text: string): string {
  if (displayWidth(text) <= MAX_CELL_WIDTH) return text;
  let out = "";
  for (const char of text) {
    if (displayWidth(`${out}${char}…`) > MAX_CELL_WIDTH) break;
    out += char;
  }
  return `${out}…`;
}

/** 결과 표 + 요약 한 줄 */
export function formatVerifyReport(
  siteUrl: string,
  results: readonly CheckResult[],
): string {
  const header = ["검사", "대상", "기대", "실제", "결과"];
  const rows = results.map((result) => [
    result.group,
    truncate(result.target),
    truncate(result.expected),
    truncate(result.actual),
    result.ok ? "✓" : "✗ 실패",
  ]);
  const widths = header.map((title, column) =>
    Math.max(
      displayWidth(title),
      ...rows.map((row) => displayWidth(row[column] ?? "")),
    ),
  );
  const formatRow = (cells: readonly string[]): string =>
    cells
      .map((cell, column) => pad(cell, widths[column] ?? 0))
      .join("  ")
      .trimEnd();

  const failed = results.filter((result) => !result.ok).length;
  return [
    `사이트: ${siteUrl}`,
    "",
    formatRow(header),
    formatRow(widths.map((width) => "-".repeat(width))),
    ...rows.map(formatRow),
    "",
    failed === 0
      ? `결과: 통과 — ${results.length}개 항목`
      : `결과: 실패 — ${results.length}개 중 ${failed}개 실패`,
  ].join("\n");
}

export function allPassed(results: readonly CheckResult[]): boolean {
  return results.length > 0 && results.every((result) => result.ok);
}
