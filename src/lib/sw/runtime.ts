/**
 * 서비스 워커 본체 — 이벤트 처리 (PRD FR-121, plan M4-13)
 *
 * 앱 코드가 import하지 않는다. 빌드 후 단계(scripts/build-sw.ts)가 `SW_CONFIG`(src/lib/sw/policy.ts `SwConfig`) + 정책 함수(policy.ts) + 이 파일을
 * JS로 옮겨 한 파일 out/sw.js로 낸다 — import 줄은 그때 떼므로 **policy.ts 말고는 import하지 않는다.** 워커 전역 타입(lib webworker)은
 * 앱의 DOM 타입과 겹쳐 프로젝트에 넣지 않고, 쓰는 만큼만 아래에 적는다.
 *
 * - install: 페이지(앱 셸 + 최근 3일 호)는 HTTP 캐시를 거치지 않고(`cache: "reload"` — Pages max-age 600초의 지난 HTML이 끼지 않게) 새로 받아
 *   `ed-pages-{version}`에, 정적 자산은 `ed-static`에 없는 것만 받는다. 하나라도 실패하면 설치 실패(다음 방문에 다시) — 반쪽 캐시를 쓰지 않는다.
 *   설치가 끝나도 기존 워커가 페이지를 맡고 있으면 기다린다 → 등록 섬이 "새 소식이 있어요" 토스트를 띄우고, "새로고침"을 누르면
 *   `SW_SKIP_WAITING_MESSAGE`를 받아 활성화한다. 처음 설치(맡은 페이지 없음)는 바로 활성화된다.
 * - activate: 이번 버전이 쓰지 않는 `ed-` 캐시를 지우고, `ed-static`을 이번 목록으로 줄이고, 내비게이션 미리 받기를 켜고, 열린 페이지를 맡는다.
 * - fetch: 페이지 이동은 네트워크 우선 → (실패) 캐시 → 오프라인 화면(`/offline/?from=…`으로 보냄). 받은 HTML은 프리캐시 대상이면 그 캐시를,
 *   아니면 런타임 캐시(상한)를 새로 고친다. 정적 자산은 캐시 우선(없으면 받아서 넣음). `/my/data/**.json`은 네트워크 우선 → 받은 사본을
 *   `ed-data`(상한)에, 받지 못하면 사본(M4-16). 그 밖(외부 출처·RSC·RSS·검색 색인 등)은 손대지 않는다.
 */
import {
  SW_DATA_LIMIT,
  SW_HASH_HEADER,
  SW_SKIP_WAITING_MESSAGE,
  swCacheNames,
  swOfflineRedirect,
  swOverflow,
  swPageKey,
  swRequestKind,
  swStaleCaches,
  swStaticFresh,
  swStaticToDrop,
  type SwConfig,
} from "./policy";

declare const SW_CONFIG: SwConfig;

interface SwExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface SwFetchEvent extends SwExtendableEvent {
  readonly request: Request;
  readonly preloadResponse: Promise<Response | undefined>;
  respondWith(response: Promise<Response> | Response): void;
}
interface SwMessageEvent extends SwExtendableEvent {
  readonly data: unknown;
}
interface SwGlobal {
  readonly location: Location;
  readonly registration: {
    readonly navigationPreload?: { enable(): Promise<void> };
  };
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(
    type: "install" | "activate",
    listener: (event: SwExtendableEvent) => void,
  ): void;
  addEventListener(
    type: "fetch",
    listener: (event: SwFetchEvent) => void,
  ): void;
  addEventListener(
    type: "message",
    listener: (event: SwMessageEvent) => void,
  ): void;
}

const sw = self as unknown as SwGlobal;
const names = swCacheNames(SW_CONFIG.version);
const abs = (href: string): string => new URL(href, sw.location.origin).href;
const scopeUrl = abs(SW_CONFIG.scope);
const pageKeys = new Set(SW_CONFIG.pages.map((href) => swPageKey(abs(href))));
const offlineKey = swPageKey(abs(SW_CONFIG.offline));

/** 리다이렉트를 거친 응답은 페이지 이동에 다시 쓰면 브라우저가 거부한다 — 본문만 옮겨 새 응답으로 */
async function storable(res: Response): Promise<Response> {
  if (!res.redirected) return res;
  return new Response(await res.blob(), {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

/** 내용 해시 헤더를 붙인 사본(해시 없는 이름의 정적 자산) */
async function tagged(res: Response, hash: string): Promise<Response> {
  const headers = new Headers(res.headers);
  headers.set(SW_HASH_HEADER, hash);
  return new Response(await res.blob(), {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

async function precache(): Promise<void> {
  const pages = await caches.open(names.pages);
  await Promise.all(
    SW_CONFIG.pages.map(async (href) => {
      const res = await fetch(abs(href), { cache: "reload" });
      if (!res.ok) throw new Error(`precache ${href} ${res.status}`);
      await pages.put(swPageKey(abs(href)), await storable(res));
    }),
  );
  const statics = await caches.open(names.static);
  await Promise.all(
    SW_CONFIG.assets.map(async (href) => {
      const url = abs(href);
      const wanted = SW_CONFIG.assetHashes[href];
      const hit = await statics.match(url);
      if (hit && swStaticFresh(wanted, hit.headers.get(SW_HASH_HEADER))) return;
      // 해시 없는 이름(웹폰트 · 아이콘 · manifest)은 HTTP 캐시(max-age)의 지난 내용이 끼지 않게 새로 받고 내용 해시를 붙여 둔다
      const res =
        wanted === undefined
          ? await fetch(url)
          : await fetch(url, { cache: "reload" });
      if (!res.ok) throw new Error(`precache ${href} ${res.status}`);
      await statics.put(
        url,
        wanted === undefined ? await storable(res) : await tagged(res, wanted),
      );
    }),
  );
}

async function activate(): Promise<void> {
  const keep = [names.pages, names.runtime, names.static, names.data];
  await Promise.all(
    swStaleCaches(await caches.keys(), keep).map((name) => caches.delete(name)),
  );
  const statics = await caches.open(names.static);
  const cached = (await statics.keys()).map((req) => req.url);
  await Promise.all(
    swStaticToDrop(cached, SW_CONFIG.assets.map(abs)).map((url) =>
      statics.delete(url),
    ),
  );
  await sw.registration.navigationPreload?.enable().catch(() => undefined);
  await sw.clients.claim();
}

/** 온라인으로 받은 페이지 HTML을 캐시에 — 프리캐시 대상은 그 캐시를 새로 고치고, 그 밖은 런타임 캐시(오래된 것부터 상한까지) */
async function remember(key: string, res: Response): Promise<void> {
  if (pageKeys.has(key)) {
    await (await caches.open(names.pages)).put(key, await storable(res));
    return;
  }
  const runtime = await caches.open(names.runtime);
  await runtime.put(key, await storable(res));
  const overflow = swOverflow(await runtime.keys(), SW_CONFIG.runtimePageLimit);
  await Promise.all(overflow.map((req) => runtime.delete(req)));
}

async function cachedPage(key: string): Promise<Response | undefined> {
  return (
    (await (await caches.open(names.pages)).match(key)) ??
    (await (await caches.open(names.runtime)).match(key))
  );
}

async function page(event: SwFetchEvent): Promise<Response> {
  const { request } = event;
  const key = swPageKey(request.url);
  try {
    const res = (await event.preloadResponse) ?? (await fetch(request));
    const html = res.headers.get("content-type")?.includes("text/html");
    if (res.ok && res.type === "basic" && html) {
      event.waitUntil(remember(key, res.clone()).catch(() => undefined));
    }
    return res;
  } catch {
    const hit = await cachedPage(key);
    if (hit) return hit;
    if (key !== offlineKey && (await cachedPage(offlineKey))) {
      return Response.redirect(
        swOfflineRedirect(abs(SW_CONFIG.offline), request.url),
        302,
      );
    }
    return Response.error();
  }
}

async function asset(event: SwFetchEvent): Promise<Response> {
  const { request } = event;
  const statics = await caches.open(names.static);
  const hit = await statics.match(request.url);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") {
    const copy = res.clone();
    event.waitUntil(
      storable(copy)
        .then((r) => statics.put(request.url, r))
        .catch(() => undefined),
    );
  }
  return res;
}

/** 자료(JSON) — 네트워크 우선: 받으면 사본을 새로 고치고(상한까지), 받지 못하면(오프라인) 사본, 사본도 없으면 원래 실패 그대로 */
async function data(event: SwFetchEvent): Promise<Response> {
  const { request } = event;
  const key = request.url.split("#")[0] ?? request.url;
  const store = await caches.open(names.data);
  try {
    const res = await fetch(request);
    if (res.ok && res.type === "basic") {
      const copy = res.clone();
      event.waitUntil(
        (async () => {
          await store.delete(key);
          await store.put(key, await storable(copy));
          const overflow = swOverflow(await store.keys(), SW_DATA_LIMIT);
          await Promise.all(overflow.map((req) => store.delete(req)));
        })().catch(() => undefined),
      );
    }
    return res;
  } catch (error) {
    const hit = await store.match(key);
    if (hit) return hit;
    throw error;
  }
}

sw.addEventListener("install", (event) => {
  event.waitUntil(precache());
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(activate());
});

sw.addEventListener("message", (event) => {
  const data = event.data as { type?: unknown } | null;
  if (data?.type === SW_SKIP_WAITING_MESSAGE) event.waitUntil(sw.skipWaiting());
});

sw.addEventListener("fetch", (event) => {
  const { request } = event;
  const kind = swRequestKind(
    {
      url: request.url,
      method: request.method,
      mode: request.mode,
      rsc: request.headers.has("RSC"),
    },
    scopeUrl,
  );
  if (kind === "page") event.respondWith(page(event));
  else if (kind === "static") event.respondWith(asset(event));
  else if (kind === "data") event.respondWith(data(event));
});
