/**
 * `npm run verify:deploy` 진입점 (M0-13, FR-154) — 배포된 사이트를 실제 HTTP로 확인하고 표로 보고한다.
 * 하나라도 실패하면 exit 1. 판정은 scripts/lib/deploy-verify.ts의 순수 함수가 맡고, 여기는 요청·출력만 한다.
 *
 * 사용법: npm run verify:deploy -- [사이트 URL] [--dir <경로>]...
 *   기본 URL: SITE_URL(기본 https://sguys99.github.io) + BASE_PATH(기본 /euro-digest) + "/"
 *
 * HTML 요청(홈·404·슬래시)에는 캐시 우회 쿼리를 붙여 CDN에 남은 이전 응답 대신 방금 배포한 결과를 본다.
 * 리다이렉트는 따라가지 않는다(홈이 다른 곳으로 넘어가면 그 자체를 실패로 보고).
 */
import { SITE_NAME } from "@/lib/site";

import {
  allPassed,
  checkAssets,
  checkHome,
  checkNotFound,
  checkTrailingSlash,
  formatVerifyReport,
  listStaticAssetPaths,
  missingSitePath,
  parseVerifyDeployArgs,
  siteTarget,
  siteUrlFor,
  trailingSlashPaths,
  VERIFY_DEPLOY_USAGE,
  withCacheBust,
  type AssetResponse,
  type CheckResult,
  type FetchedResponse,
} from "./lib/deploy-verify";

const TAG = "[verify:deploy]";
const TIMEOUT_MS = 15_000;
const USER_AGENT = "euro-digest-verify-deploy";

async function request(
  url: string,
  readBody: boolean,
): Promise<FetchedResponse> {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT },
    });
    let body = "";
    if (readBody) body = await response.text();
    else await response.body?.cancel(); // 상태만 필요 — 본문은 받지 않는다
    return {
      url,
      status: response.status,
      location: response.headers.get("location"),
      body,
      error: null,
    };
  } catch (error) {
    return {
      url,
      status: null,
      location: null,
      body: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<number> {
  const parsed = parseVerifyDeployArgs(process.argv.slice(2), {
    SITE_URL: process.env.SITE_URL,
    BASE_PATH: process.env.BASE_PATH,
  });
  if (!parsed.ok) {
    console.error(`${TAG} ${parsed.error}\n\n${VERIFY_DEPLOY_USAGE}`);
    return 1;
  }
  if (parsed.value.help) {
    console.log(VERIFY_DEPLOY_USAGE);
    return 0;
  }

  const { siteUrl, dirs } = parsed.value;
  const target = siteTarget(siteUrl);
  const token = Date.now().toString(36);
  const missingPath = missingSitePath(token);

  console.log(`${TAG} ${siteUrl} 확인 중…`);

  const [home, notFound] = await Promise.all([
    request(withCacheBust(target.homeUrl, token), true),
    request(withCacheBust(siteUrlFor(target, missingPath), token), true),
  ]);

  // 404 페이지가 쓰는 자산도 함께 본다(없는 경로에서도 스크립트·스타일이 깨지지 않아야 한다).
  const assetPaths = [
    ...new Set([
      ...listStaticAssetPaths(home.body, "/", target.resolveOptions),
      ...listStaticAssetPaths(
        notFound.body,
        missingPath,
        target.resolveOptions,
      ),
    ]),
  ];
  const assets: AssetResponse[] = await Promise.all(
    assetPaths.map(async (sitePath) => ({
      sitePath,
      response: await request(siteUrlFor(target, sitePath), false),
    })),
  );

  const slashChecks = await Promise.all(
    trailingSlashPaths(target.basePath, dirs).map(async (requestPath) =>
      checkTrailingSlash(
        await request(
          withCacheBust(`${target.origin}${requestPath}`, token),
          false,
        ),
        requestPath,
      ),
    ),
  );

  const results: CheckResult[] = [
    ...checkHome(home, SITE_NAME),
    ...checkAssets(assets),
    ...checkNotFound(notFound, missingPath, target),
    ...slashChecks,
  ];

  console.log(formatVerifyReport(siteUrl, results));

  if (!allPassed(results)) {
    console.error(
      `\n${TAG} 실패 — 배포 직후라면 1~2분 뒤 다시 실행해 보고, 계속 실패하면 deploy.yml 실행 로그를 확인하세요.`,
    );
    return 1;
  }
  console.log(`\n${TAG} 통과`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`${TAG} 예기치 못한 오류:`, error);
    process.exitCode = 1;
  },
);
