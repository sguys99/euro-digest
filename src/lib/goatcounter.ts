/**
 * 쿠키리스 분석 구현 — GoatCounter (PRD NFR-08 · FR-141 · §11.2 제품 KPI · §15 D7, plan M5-04 · U-08)
 *
 * **지연 조각**: 이 파일은 src/lib/analytics.ts(진입점 — 공용 `track()`)가 공개 사이트 주소에서만 `import()`로 받는다. 초기 JS에 들어가지
 * 않고(check:bundle은 HTML의 `<script src>`만 센다), 로컬 미리보기 · e2e(127.0.0.1) · 개발 서버에서는 받지도 않는다.
 * GoatCounter는 CLAUDE §3이 허용한 유일한 서드파티 스크립트다. 이 파일이 그 스크립트를 싣고 페이지뷰 · 이벤트를 보내는 **유일한 통로**다
 * (다른 파일은 `window.goatcounter`를 직접 부르지 않는다).
 *
 * 켜지는 조건
 * 1. 빌드: `NODE_ENV=production` + `NEXT_PUBLIC_ANALYTICS=on`(next.config.ts — 공개 빌드 on, 견본 빌드 SPECIMEN=1 off) — 진입점이 본다.
 * 2. 호스트: 지금 주소가 공개 사이트(`NEXT_PUBLIC_SITE_URL` 출처 + basePath 아래)일 때만(`isAnalyticsLocation` — `startAnalytics`).
 * 3. 스크립트가 실제로 실렸을 때 — 광고 차단 등으로 막히면 대기열을 버리고 조용히 넘어간다(오류 0). 모든 호출은
 *    `window.goatcounter?.count` 가드를 지난다.
 *
 * 스크립트: 버전 고정 `count.v5.js` + SRI(`integrity` sha384 · `crossorigin="anonymous"`) — GoatCounter가 "버전 파일은 바뀌지 않는다"고
 * 보장하는 판이다(https://www.goatcounter.com/help/countjs-versions). 문서 `load` 뒤 `<head>`에 붙인다(첫 화면 · LCP와 겹치지 않게).
 * 설정은 `no_onload`(자동 집계 · 자동 클릭 바인딩 끔) — 페이지뷰는 셸 상태 섬이 경로가 바뀔 때마다 `trackPageview`로 직접 보낸다.
 *
 * 페이지뷰 path 규칙(`normalizePagePath`) — 쿼리 · 해시를 모두 버리고 basePath를 포함한 경로만:
 * - `location.pathname` 그대로(basePath 포함) → 연속 `/` 하나로 · `index.html`/`.html` 떼기 · 끝 `/` 보장(trailingSlash: true와 같은 꼴).
 * - 쿼리(뉴스 · 이적 필터 `?…`, 검색어 `?q=`, 팔로우 공유 `?t=…&p=…`, 오프라인 `?from=`)와 해시(카드 앵커 `#c_…`)는 보내지 않는다 —
 *   필터 · 검색어 · 팔로우 목록이 path로 새지 않는다. 같은 경로 안의 쿼리 · 해시 이동은 새 페이지뷰가 아니다(직전 path와 같으면 건너뜀).
 * - count.js는 path와 따로 `q`(= `location.search`)를 늘 붙인다 → 실린 스크립트의 `get_data`를 감싸 `q`를 지운다(`dropQuery` — 버전 고정
 *   판이라 안정적). 그래서 utm 등 캠페인 쿼리도 집계하지 않는다(우리는 쓰지 않는다).
 * - referrer: 첫 페이지뷰는 `document.referrer`에서 쿼리 · 해시를 뗀 값(같은 사이트면 위 path 규칙), 클라이언트 이동은 직전 페이지 주소
 *   (일반 다중 페이지 사이트가 보내는 값과 같다).
 * - 결과 가리기 · 테마 · 팔로우 같은 개인 설정은 localStorage에만 있고 path · title에 들어가지 않는다(title = 그 페이지의 정적 문서 제목).
 *
 * 이벤트(`eventPath` — GoatCounter 이벤트 이름, 앞 `/` 없음). 개인 식별 정보 · 카드 ID · 팔로우 목록은 보내지 않는다:
 * - `out/{호스트}` — 원문 링크 누름(카드 제목 · 출처 목록 · 검색 결과 기사 · 팀 '더 읽을거리' — `data-track="out"` 링크만). 호스트는
 *   소문자 · `www.` 뗌. 카드 ID · 기사 URL · 제목은 보내지 않는다.
 * - `feed/rss/{all|korean|competition}` · `feed/ics/{team|korean|match}` · `feed/webcal/{team|korean}` — 사이트 RSS · .ics 링크 누름
 *   (주소로 판정 — src/lib/paths.ts `artifacts`와 같은 규칙). 대회 · 팀 slug는 보내지 않는다.
 * - `pwa/install` — 홈 화면 설치 완료(`appinstalled` — Chromium 계열만 발생, iOS Safari 홈 화면 추가는 이벤트가 없다).
 * - `my/set` — 마이 팀 저장(팔로우를 더한 저장 · 공유 URL 가져오기 — src/lib/use-follows.ts, 해제는 세지 않음). 무엇을 · 몇 개인지는 보내지 않는다.
 * 링크 누름은 문서 하나에 붙인 위임 리스너(`click` + 가운데 버튼 `auxclick`, 캡처 단계)가 맡는다 — 카드 마크업에 섬을 더하지 않는다.
 *
 * 런타임 의존성 없음 · 클라이언트에서만 실행.
 */
import { type AnalyticsEvent, TRACK_ATTR, TRACK_OUT } from "./analytics";

/** GoatCounter 사이트(U-08 — 계정 `euro-digest`, Site domain `sguys99.github.io`) · 버전 고정 스크립트 + SRI */
export const GOATCOUNTER = {
  endpoint: "https://euro-digest.goatcounter.com/count",
  script: "https://gc.zgo.at/count.v5.js",
  integrity:
    "sha384-atnOLvQb9t+jTSipvd75X2yginT4PjVbqDdlJAmxMm+wYElFmeR6EmLP5bYeoRVQ",
} as const;

/** 스크립트를 기다리는 동안 모아 두는 호출 수 상한(차단 · 지연으로 무한히 쌓이지 않게) */
export const QUEUE_LIMIT = 20;

/** `goatcounter.count()` 인자 — 우리가 쓰는 것만 */
export interface GoatCounterVars {
  path: string;
  title?: string;
  /** undefined면 count.js 기본값(`document.referrer`) */
  referrer?: string;
  event?: boolean;
}

/** `window.goatcounter` 중 우리가 닿는 부분(count.js v5) */
export interface GoatCounterApi {
  count?: (vars: GoatCounterVars) => void;
  get_data?: (vars?: GoatCounterVars) => Record<string, unknown>;
}

declare global {
  interface Window {
    goatcounter?: GoatCounterApi;
  }
}

/** 이벤트 이름(GoatCounter path) */
export function eventPath(event: AnalyticsEvent): string {
  switch (event.kind) {
    case "out":
      return `out/${event.host}`;
    case "feed":
      return `feed/${event.format}/${event.scope}`;
    case "pwa-install":
      return "pwa/install";
    case "my-set":
      return "my/set";
  }
}

/** 이벤트 설명(GoatCounter title — 대시보드 표시용 고정 문구) */
export function eventTitle(event: AnalyticsEvent): string {
  switch (event.kind) {
    case "out":
      return "원문 링크";
    case "feed":
      return event.format === "rss"
        ? "RSS 구독"
        : event.format === "webcal"
          ? "캘린더 구독"
          : ".ics 받기";
    case "pwa-install":
      return "앱 설치";
    case "my-set":
      return "마이 팀 저장";
  }
}

/** 페이지뷰 path — basePath 포함 경로만(쿼리 · 해시 없음), `index.html` · `.html` 뗌, 끝 `/` 보장 */
export function normalizePagePath(pathname: string): string {
  const path = pathname
    .replace(/\/{2,}/g, "/")
    .replace(/\/index\.html?$/i, "/")
    .replace(/\.html?$/i, "");
  if (path === "") return "/";
  return path.endsWith("/") ? path : `${path}/`;
}

/** 공개 사이트 위치 */
export interface AnalyticsSite {
  /** 출처(끝 `/` 없음) — 예) `https://sguys99.github.io` */
  origin: string;
  /** "" 또는 `/x` 꼴(src/lib/paths.ts `normalizeBasePath`) */
  basePath: string;
}

/** 지금 주소가 공개 사이트인가 — 출처가 같고 basePath 아래(로컬 미리보기 · e2e · 다른 호스트 사본 제외) */
export function isAnalyticsLocation(
  location: Pick<Location, "origin" | "pathname">,
  site: AnalyticsSite,
): boolean {
  return (
    location.origin === site.origin &&
    (site.basePath === "" ||
      location.pathname === site.basePath ||
      location.pathname.startsWith(`${site.basePath}/`))
  );
}

/** referrer 정리 — 쿼리 · 해시를 뗀다. 같은 출처면 페이지 path 규칙. 비면 undefined(count.js 기본값 = 빈 값) */
export function cleanReferrer(
  referrer: string,
  origin: string,
): string | undefined {
  if (referrer === "") return undefined;
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  return url.origin === origin
    ? `${origin}${normalizePagePath(url.pathname)}`
    : `${url.origin}${url.pathname}`;
}

const RSS_SCOPES: ReadonlyArray<[RegExp, string]> = [
  [/^\/rss\.xml$/, "all"],
  [/^\/rss\/korean\.xml$/, "korean"],
  [/^\/rss\/[a-z0-9-]+\.xml$/, "competition"],
];
const CALENDAR_SCOPES: ReadonlyArray<[RegExp, string]> = [
  [/^\/calendar\/korean\.ics$/, "korean"],
  [/^\/calendar\/match\/[a-z0-9-]+\.ics$/, "match"],
  [/^\/calendar\/[a-z0-9-]+\.ics$/, "team"],
];

function scopeOf(
  rules: ReadonlyArray<[RegExp, string]>,
  path: string,
): string | null {
  for (const [re, scope] of rules) if (re.test(path)) return scope;
  return null;
}

/** 링크 하나 → 이벤트(셀 것이 아니면 null). `href`는 절대 URL(`HTMLAnchorElement.href`), `track`은 `data-track` 값 */
export function linkEvent(
  link: { href: string; track: string | null },
  site: AnalyticsSite,
): AnalyticsEvent | null {
  let url: URL;
  try {
    url = new URL(link.href);
  } catch {
    return null;
  }
  if (link.track === TRACK_OUT) {
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host === "" ? null : { kind: "out", host };
  }
  // 사이트 피드 · 캘린더 — 같은 호스트 + basePath 아래만(webcal은 출처가 "null"이라 호스트로)
  if (url.host !== new URL(site.origin).host) return null;
  const prefix = `${site.basePath}/`;
  if (!url.pathname.startsWith(prefix)) return null;
  const rest = url.pathname.slice(site.basePath.length);
  if (url.protocol === "webcal:") {
    const scope = scopeOf(CALENDAR_SCOPES, rest);
    return scope && scope !== "match"
      ? { kind: "feed", format: "webcal", scope }
      : null;
  }
  if (url.origin !== site.origin) return null;
  const rss = scopeOf(RSS_SCOPES, rest);
  if (rss) return { kind: "feed", format: "rss", scope: rss };
  const ics = scopeOf(CALENDAR_SCOPES, rest);
  return ics ? { kind: "feed", format: "ics", scope: ics } : null;
}

// ─── 상태 · 보내기 ────────────────────────────────────────────────────────────

interface AnalyticsState {
  started: boolean;
  active: boolean;
  /** 스크립트가 막혔다(대기열을 더 쌓지 않는다) */
  failed: boolean;
  site: AnalyticsSite | null;
  queue: GoatCounterVars[];
  lastPath: string | null;
  /** 직전 페이지뷰의 문서 제목(클라이언트 이동 뒤 제목이 바뀌기를 기다리는 기준) */
  lastTitle: string | null;
}

const initialState = (): AnalyticsState => ({
  started: false,
  active: false,
  failed: false,
  site: null,
  queue: [],
  lastPath: null,
  lastTitle: null,
});

let state: AnalyticsState = initialState();

/** 테스트 전용 — 모듈 상태 초기화 */
export function resetAnalyticsState(): void {
  state = initialState();
}

/** 테스트 · 진단용 — 켜졌는지 */
export function analyticsActive(): boolean {
  return state.active;
}

const PATCHED = Symbol.for("euro-digest.goatcounter.no-query");

/** count.js가 늘 붙이는 `q`(= location.search)를 지운다 — `get_data`를 한 번만 감싼다 */
export function dropQuery(gc: GoatCounterApi): void {
  const original = gc.get_data;
  if (typeof original !== "function") return;
  if ((original as { [PATCHED]?: true })[PATCHED]) return;
  const wrapped = Object.assign(
    (vars?: GoatCounterVars) => {
      const data = original(vars);
      delete data.q;
      return data;
    },
    { [PATCHED]: true as const },
  );
  gc.get_data = wrapped;
}

function send(vars: GoatCounterVars): void {
  if (!state.active || typeof window === "undefined") return;
  const gc = window.goatcounter;
  if (typeof gc?.count !== "function") {
    if (!state.failed && state.queue.length < QUEUE_LIMIT)
      state.queue.push(vars);
    return;
  }
  try {
    dropQuery(gc);
    gc.count(vars);
  } catch {
    // 분석 실패가 화면 동작을 막지 않는다
  }
}

function flush(): void {
  const pending = state.queue;
  state.queue = [];
  for (const vars of pending) send(vars);
}

/** 이벤트 보내기 — 공용 도우미(켜지지 않았으면 아무것도 하지 않는다) */
export function track(event: AnalyticsEvent): void {
  if (!state.active || typeof window === "undefined") return;
  send({
    path: eventPath(event),
    title: eventTitle(event),
    referrer: `${window.location.origin}${normalizePagePath(window.location.pathname)}`,
    event: true,
  });
}

/**
 * 페이지뷰 — 셸 상태 섬이 경로가 바뀔 때마다 부른다(`pathname`은 그 순간의 `location.pathname` — 조각을 받는 사이 주소가 또 바뀌어도
 * 그때 페이지로 센다). 직전과 같은 path(쿼리 · 해시만 바뀜, 섬 재마운트)는 건너뛴다.
 */
export function trackPageview(
  pathname: string = window.location.pathname,
  win: Window = window,
): void {
  if (!state.active) return;
  const path = normalizePagePath(pathname);
  if (path === state.lastPath) return;
  const referrer =
    state.lastPath === null
      ? cleanReferrer(win.document.referrer, win.location.origin)
      : `${win.location.origin}${state.lastPath}`;
  const previousTitle = state.lastTitle;
  state.lastPath = path;
  whenTitleSettles(win.document, previousTitle, (title) => {
    state.lastTitle = title;
    send({ path, title, referrer });
  });
}

/** 클라이언트 이동 뒤 문서 제목을 기다리는 최대 시간(ms) — 넘으면 그때 제목으로 보낸다 */
export const TITLE_WAIT_MS = 1000;

/**
 * 문서 제목이 비어 있지 않고 직전 페이지뷰와 달라지면(또는 처음이면 바로) 그 제목으로 `done`. App Router 클라이언트 이동은 경로가 먼저 바뀌고
 * `<title>`이 조금 늦게 바뀔 수 있다(부하가 크면 실측) — 이전 페이지 제목을 새 path에 붙이지 않게 `<head>` 변화를 지켜본다.
 * 제목이 같은 두 페이지 사이 이동이면 `TITLE_WAIT_MS` 뒤 그대로 보낸다.
 */
function whenTitleSettles(
  doc: Document,
  previous: string | null,
  done: (title: string) => void,
): void {
  // 이동 중에는 옛 `<title>`이 빠지고 새 것이 들어오기 전 잠깐 빈 제목이 된다(실측) — 비어 있지 않고 직전과 다를 때 정해진 것으로 본다
  const settled = () => doc.title !== "" && doc.title !== previous;
  if (previous === null || settled()) {
    done(doc.title);
    return;
  }
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    observer?.disconnect();
    clearTimeout(timer);
    done(doc.title);
  };
  const observer =
    typeof MutationObserver === "function"
      ? new MutationObserver(() => {
          if (settled()) finish();
        })
      : null;
  observer?.observe(doc.head, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  const timer = setTimeout(finish, TITLE_WAIT_MS);
}

function onLinkClick(event: MouseEvent): void {
  if (event.type === "auxclick" && event.button !== 1) return;
  const target = event.target;
  if (!state.site || !(target instanceof Element)) return;
  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return;
  const tracked = linkEvent(
    { href: anchor.href, track: anchor.getAttribute(TRACK_ATTR) },
    state.site,
  );
  if (tracked) track(tracked);
}

function onInstalled(): void {
  track({ kind: "pwa-install" });
}

function injectScript(doc: Document): void {
  if (doc.querySelector(`script[src="${GOATCOUNTER.script}"]`)) return;
  const script = doc.createElement("script");
  script.async = true;
  script.src = GOATCOUNTER.script;
  script.integrity = GOATCOUNTER.integrity;
  script.crossOrigin = "anonymous";
  script.referrerPolicy = "no-referrer";
  script.dataset.goatcounter = GOATCOUNTER.endpoint;
  script.dataset.goatcounterSettings = JSON.stringify({ no_onload: true });
  script.addEventListener("load", flush);
  script.addEventListener("error", () => {
    state.failed = true;
    state.queue = [];
  });
  doc.head.appendChild(script);
}

/**
 * 분석 시작 — 셸 상태 섬이 문서마다 한 번 부른다(다시 불러도 한 번만). 공개 사이트 주소가 아니면 아무것도 하지 않는다.
 * 문서 `load` 뒤 스크립트를 싣고, 링크 위임 리스너 · `appinstalled`를 단다.
 */
export function startAnalytics(
  site: AnalyticsSite,
  win: Window = window,
): void {
  if (state.started) return;
  state.started = true;
  if (!isAnalyticsLocation(win.location, site)) return;
  state.active = true;
  state.site = site;

  const doc = win.document;
  const load = () => injectScript(doc);
  if (doc.readyState === "complete") load();
  else win.addEventListener("load", load, { once: true });

  doc.addEventListener("click", onLinkClick, true);
  doc.addEventListener("auxclick", onLinkClick, true);
  // 리스너는 모듈 함수 하나씩이라 같은 대상에 두 번 붙지 않는다
  win.addEventListener("appinstalled", onInstalled);
}
