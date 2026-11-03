/**
 * 서비스 워커 캐시 정책 — 순수 함수 (PRD FR-121, plan M4-13)
 *
 * **이 파일은 import가 없어야 한다.** 빌드 후 단계(scripts/build-sw.ts)가 TypeScript를 JS로 옮겨(`ts.transpileModule`) `export`만 떼고
 * out/sw.js 안에 그대로 붙인다 — 서비스 워커는 classic 스크립트라 모듈을 불러오지 않는다(모듈 워커는 Firefox 지원이 늦다).
 * 같은 코드를 단위 테스트(tests/sw-policy.test.ts)와 등록 섬(src/lib/sw-register.ts — 메시지 상수만)이 쓴다.
 *
 * 캐시 3종(이름 접두 `ed-` — 다른 접두의 캐시는 건드리지 않는다)
 * | 캐시                     | 내용                                                         | 버전 정책 |
 * |--------------------------|--------------------------------------------------------------|-----------|
 * | `ed-pages-{version}`     | 앱 셸 HTML(홈·`/news/`·`/offline/`) + 최근 3일 호 날짜 페이지  | 설치 때 채움(프리캐시), 새 버전이 활성화되면 지움 |
 * | `ed-runtime-{version}`   | 그 밖에 온라인으로 열어 본 페이지 HTML(상한 `runtimePageLimit`) | 오래된 것부터 지움, 새 버전이 활성화되면 지움 |
 * | `ed-static`              | `_next/static/**`(파일명에 해시 — 바뀌지 않음)·웹폰트·아이콘·manifest(**이름은 그대로 두고 내용이 바뀔 수 있음**) | 버전 사이 공유. 해시 이름 파일은 받은 것을 다시 받지 않고, 해시 없는 이름은 설치 때 내용 해시(`assetHashes` — 사본의 `SW_HASH_HEADER`)가 다르면 HTTP 캐시를 거치지 않고(`reload`) 새로 받아 덮는다(M4-16 리뷰 — D3 아이콘 교체 등). 활성화 때 이번 목록에 없는 것을 지움 |
 * | `ed-data`                | `/my/data/**.json`(마이 팀 · 선수 자료 · 온보딩 자료 — M4-16)  | 버전 사이 공유, **네트워크 우선**(온라인이면 늘 새 값), 받은 것만 상한 `SW_DATA_LIMIT`까지 |
 *
 * 지연 청크(온보딩 단계 · 내보내기 · 검색 오버레이 · `/my` 목록)는 `_next/static/**`라 설치 때 함께 받는다(프리캐시) — 오프라인에서도 열린다.
 * `/my/data/`는 팔로우마다 다른 파일이라 프리캐시하지 않고, 온라인으로 받은 것만 남겨 오프라인 `/my`가 마지막으로 본 다음 경기 · 결과를
 * 그린다(없으면 '오프라인이라 받지 못했어요' + 다시 시도). 검색 색인(`/pagefind/` — 약 0.7MB)은 오프라인 범위 밖이다(bypass).
 *
 * 요청 분류(`swRequestKind`) — scope(basePath + `/`) 밖·GET 아닌 요청·외부 출처(원문 링크·GoatCounter)는 손대지 않는다(`bypass`).
 * 페이지 이동(`navigate`)은 네트워크 우선 → 캐시 → 오프라인 화면. RSC 페이로드(next/link 클라이언트 이동의 `.txt`)는 캐시하지 않는다 —
 * 오프라인이면 Next가 그 주소로 문서 이동(MPA)을 다시 하고, 그 이동을 이 워커가 캐시로 받는다.
 */

/** 이 사이트 캐시 이름 접두 — 이 접두만 정리한다 */
export const SW_CACHE_PREFIX = "ed-";

/** 등록 섬 → 대기 중인 워커: 바로 활성화하라(새 버전 토스트 "새로고침") */
export const SW_SKIP_WAITING_MESSAGE = "ed-skip-waiting";

/** 빌드가 sw.js 머리에 싣는 설정 — 경로는 모두 basePath 포함 href(`{basePath}/...`) */
export interface SwConfig {
  /** 캐시 버전 — 프리캐시 대상 파일 내용의 해시(빌드 산출물이 같으면 같은 값 → 워커 바이트가 같아 업데이트 없음) */
  version: string;
  /** 등록 범위(basePath + `/`) */
  scope: string;
  /** 페이지 프리캐시(앱 셸 + 최근 3일 호) — 모두 `/`로 끝난다 */
  pages: string[];
  /** 오프라인 화면 페이지(`pages`에 들어 있다) */
  offline: string;
  /** 정적 자산 프리캐시(JS·CSS 청크, 웹폰트, 아이콘, manifest) */
  assets: string[];
  /**
   * 파일명에 해시가 없는 자산(`_next/static/` 밖 — 웹폰트 · 아이콘 · manifest)의 내용 해시(href → 16자리). 설치 때 사본의 해시와 다르면 다시
   * 받는다. 여기 없는 자산(해시 이름)은 받은 사본을 그대로 쓴다
   */
  assetHashes: Record<string, string>;
  /** 런타임 페이지 캐시 상한(개) */
  runtimePageLimit: number;
}

export interface SwCacheNames {
  pages: string;
  runtime: string;
  static: string;
  data: string;
}

/** `ed-data` 상한(개) — 팔로우 팀 5 + 선수 5 + 온보딩 자료 1에 여유(오래된 것부터 지움) */
export const SW_DATA_LIMIT = 24;

/** 버전별 캐시 이름 */
export function swCacheNames(version: string): SwCacheNames {
  return {
    pages: `${SW_CACHE_PREFIX}pages-${version}`,
    runtime: `${SW_CACHE_PREFIX}runtime-${version}`,
    static: `${SW_CACHE_PREFIX}static`,
    data: `${SW_CACHE_PREFIX}data`,
  };
}

export type SwRequestKind = "page" | "static" | "data" | "bypass";

export interface SwRequestInfo {
  /** 요청 절대 URL */
  url: string;
  method: string;
  /** `Request.mode` — 페이지 이동은 `navigate` */
  mode: string;
  /** RSC 헤더(`RSC: 1`)가 있는가 — next/link 클라이언트 이동·미리 받기 */
  rsc: boolean;
}

/**
 * scope 아래 정적 자산 경로(접두) — `_next/static/`만 파일명에 해시가 있다(내용이 바뀌면 이름이 바뀜). `fonts/`·`icons/`·manifest는 이름이
 * 그대로인 채 내용이 바뀔 수 있어 설치 때 내용 해시로 새로 고친다(`swStaticFresh`)
 */
const STATIC_PREFIXES = ["_next/static/", "fonts/", "icons/"];
/** scope 바로 아래 정적 파일(manifest · 파비콘 — M5-02) */
const STATIC_FILES = ["manifest.webmanifest", "favicon.svg", "favicon.ico"];
/** scope 아래 클라이언트가 받는 자료(JSON) — 네트워크 우선 + 오프라인 대비 사본 */
const DATA_PREFIX = "my/data/";

/**
 * 요청을 분류한다. `scopeUrl`은 절대 URL(출처 + basePath + `/`).
 * - `page`: scope 안 페이지 이동(GET · navigate)
 * - `static`: scope 안 정적 자산(캐시 우선)
 * - `data`: scope 안 `/my/data/**.json`(네트워크 우선 → 실패하면 사본)
 * - `bypass`: 손대지 않음 — GET 아님, scope 밖·다른 출처(원문 링크·GoatCounter), RSC 페이로드(`_rsc` 쿼리·RSC 헤더), RSS·ics·sitemap·검색 색인 등
 */
export function swRequestKind(
  req: SwRequestInfo,
  scopeUrl: string,
): SwRequestKind {
  if (req.method !== "GET") return "bypass";
  if (!req.url.startsWith(scopeUrl)) return "bypass";
  const url = new URL(req.url);
  if (req.rsc || url.searchParams.has("_rsc")) return "bypass";
  if (req.mode === "navigate") return "page";
  const rest = req.url.slice(scopeUrl.length).split(/[?#]/)[0] ?? "";
  if (
    STATIC_PREFIXES.some((prefix) => rest.startsWith(prefix)) ||
    STATIC_FILES.includes(rest)
  ) {
    return "static";
  }
  if (rest.startsWith(DATA_PREFIX) && rest.endsWith(".json")) return "data";
  return "bypass";
}

/**
 * 페이지 캐시 키 — 쿼리·해시를 떼고(`?cat=`·`#c_…`는 같은 HTML), 확장자 없는 마지막 조각에는 `/`를 붙인다(trailingSlash —
 * `/news/2026-10-24` → `/news/2026-10-24/`).
 */
export function swPageKey(href: string): string {
  const url = new URL(href);
  let pathname = url.pathname;
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (last !== "" && !last.includes(".")) pathname += "/";
  return `${url.origin}${pathname}`;
}

/** 정적 사본에 붙이는 내용 해시 헤더(해시 없는 이름의 자산 — 설치 때 비교) */
export const SW_HASH_HEADER = "x-ed-hash";

/**
 * 설치 때 정적 자산 사본을 그대로 써도 되는가 — 해시 이름(`wanted` 없음)은 사본이 있으면 늘 그렇다, 해시 없는 이름은 사본의 해시가 이번 빌드의
 * 내용 해시와 같을 때만(같은 이름 · 다른 내용이면 다시 받는다)
 */
export function swStaticFresh(
  wanted: string | undefined,
  cachedHash: string | null,
): boolean {
  return wanted === undefined || wanted === cachedHash;
}

/** 지울 캐시 — 이 사이트 접두(`ed-`)인데 이번 버전이 쓰지 않는 이름. 다른 접두의 캐시는 남긴다 */
export function swStaleCaches(
  names: readonly string[],
  keep: readonly string[],
): string[] {
  return names.filter(
    (name) => name.startsWith(SW_CACHE_PREFIX) && !keep.includes(name),
  );
}

/** 상한을 넘는 항목 — 캐시 키 목록(넣은 순서 = 오래된 것부터)에서 앞쪽 넘친 만큼 */
export function swOverflow<T>(keys: readonly T[], limit: number): T[] {
  const extra = keys.length - Math.max(0, limit);
  return extra > 0 ? keys.slice(0, extra) : [];
}

/** 정적 캐시에서 지울 URL — 이번 프리캐시 목록에 없는 것(지난 빌드의 청크) */
export function swStaticToDrop(
  cachedUrls: readonly string[],
  wantedUrls: readonly string[],
): string[] {
  const wanted = new Set(wantedUrls);
  return cachedUrls.filter((url) => !wanted.has(url));
}

/**
 * 오프라인 화면 주소 — 열려던 페이지를 `from`(basePath 포함 경로 + 쿼리)으로 넘긴다. 오프라인 화면의 '다시 시도'가 이 값을 쓴다.
 */
export function swOfflineRedirect(
  offlineHref: string,
  failedHref: string,
): string {
  const failed = new URL(failedHref);
  const target = new URL(offlineHref);
  target.searchParams.set("from", `${failed.pathname}${failed.search}`);
  return target.href;
}

/**
 * `from` 값 검사(오프라인 화면 '다시 시도') — scope 안 경로만(`{basePath}/…`). 다른 출처로 보내는 값(`//evil`·`https:`·`\`)은 null.
 */
export function swSafeReturnPath(
  from: string | null,
  scopePath: string,
): string | null {
  if (from === null || !from.startsWith(scopePath)) return null;
  if (from.startsWith("//") || from.includes("\\")) return null;
  return from;
}
