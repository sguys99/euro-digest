/**
 * 서비스 워커 생성(scripts/lib/service-worker.ts — FR-121 · M4-13): 프리캐시 상한 · 버전 해시 · TS → classic 스크립트 변환, 그리고
 * **만들어진 sw.js를 가짜 워커 전역(캐시·fetch)에서 실제로 돌려** install(프리캐시) · activate(지난 버전 정리) · fetch(네트워크 우선 →
 * 캐시 → 오프라인 화면, 정적 자산 캐시 우선, 외부·RSC 무시) · 메시지(skipWaiting)를 확인한다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { SwConfig } from "@/lib/sw/policy";

import {
  PRECACHE_BUDGET_BYTES,
  assetHashes,
  planPrecache,
  renderServiceWorker,
  swVersion,
  toScriptFragment,
  type PrecacheFile,
} from "../scripts/lib/service-worker";

const POLICY = readFileSync(path.resolve("src/lib/sw/policy.ts"), "utf8");
const RUNTIME = readFileSync(path.resolve("src/lib/sw/runtime.ts"), "utf8");

const file = (href: string, bytes = 100, hash = "h"): PrecacheFile => ({
  href,
  bytes,
  hash,
});

describe("planPrecache — 용량 상한", () => {
  const shell = [
    file("/euro-digest/", 1000),
    file("/euro-digest/offline/", 100),
  ];
  const assets = [file("/euro-digest/_next/static/a.js", 400)];
  const news = [
    file("/euro-digest/news/2026-11-02/", 500),
    file("/euro-digest/news/2026-11-01/", 500),
    file("/euro-digest/news/2026-10-31/", 500),
  ];

  it("상한 안이면 셸 + 호 전부 + 자산", () => {
    const plan = planPrecache({ shell, news, assets });
    expect(plan.pages.map((p) => p.href)).toEqual([
      "/euro-digest/",
      "/euro-digest/offline/",
      "/euro-digest/news/2026-11-02/",
      "/euro-digest/news/2026-11-01/",
      "/euro-digest/news/2026-10-31/",
    ]);
    expect(plan.bytes).toBe(3000);
    expect(plan.dropped).toEqual([]);
    expect(PRECACHE_BUDGET_BYTES).toBe(12 * 1024 * 1024);
  });

  it("넘치면 오래된 호부터 뺀다 — 셸·자산은 늘 싣고, 한 번 빠지면 그보다 오래된 호도 뺀다", () => {
    const plan = planPrecache({ shell, news, assets, budgetBytes: 2400 });
    expect(plan.pages.map((p) => p.href)).toEqual([
      "/euro-digest/",
      "/euro-digest/offline/",
      "/euro-digest/news/2026-11-02/",
    ]);
    expect(plan.dropped.map((p) => p.href)).toEqual([
      "/euro-digest/news/2026-11-01/",
      "/euro-digest/news/2026-10-31/",
    ]);
    const tight = planPrecache({
      shell,
      news: [file("/n/big/", 2000), file("/n/small/", 10)],
      assets,
      budgetBytes: 1600,
    });
    expect(tight.dropped.map((p) => p.href)).toEqual(["/n/big/", "/n/small/"]);
  });
});

describe("assetHashes — 해시 없는 이름의 자산만(M4-16)", () => {
  it("_next/static/ 밖(웹폰트 · 아이콘 · manifest)만 href → 내용 해시 앞 16자리", () => {
    const f = (href: string, hash: string) => ({ href, bytes: 1, hash });
    expect(
      assetHashes([
        f("/euro-digest/_next/static/chunks/a.js", "a".repeat(64)),
        f("/euro-digest/fonts/x.woff2", "b".repeat(64)),
        f("/euro-digest/icons/icon-192.png", "c".repeat(64)),
        f("/euro-digest/manifest.webmanifest", "d".repeat(64)),
      ]),
    ).toEqual({
      "/euro-digest/fonts/x.woff2": "b".repeat(16),
      "/euro-digest/icons/icon-192.png": "c".repeat(16),
      "/euro-digest/manifest.webmanifest": "d".repeat(16),
    });
  });
});

describe("swVersion — 캐시 버전", () => {
  const files = [file("/a", 1, "x"), file("/b", 1, "y")];
  it("12자리 16진, 순서 무관, 내용·경로·코드가 바뀌면 달라진다", () => {
    const v = swVersion(files, "code");
    expect(v).toMatch(/^[0-9a-f]{12}$/);
    expect(swVersion([...files].reverse(), "code")).toBe(v);
    expect(
      swVersion([file("/a", 1, "x"), file("/b", 1, "z")], "code"),
    ).not.toBe(v);
    expect(
      swVersion([file("/a", 1, "x"), file("/c", 1, "y")], "code"),
    ).not.toBe(v);
    expect(swVersion(files, "code2")).not.toBe(v);
  });
});

describe("toScriptFragment — TS 모듈 → classic 스크립트 조각", () => {
  it("export·./policy import를 떼고 타입을 지운다", () => {
    const js = toScriptFragment(
      'import { a, type B } from "./policy";\nexport const x: number = 1;\nexport function f(y: B): number { return a(y) + x; }\nexport interface I { z: string }\n',
      "t.ts",
    );
    expect(js).not.toMatch(/\bimport\b|\bexport\b|interface|: number/);
    expect(js).toContain("const x = 1;");
    expect(js).toContain("function f(y)");
  });

  it("다른 모듈 import가 남으면 던진다", () => {
    expect(() =>
      toScriptFragment(
        'import { b } from "./other";\nexport const y = b;\n',
        "t.ts",
      ),
    ).toThrow(/import·export/);
  });

  it("policy.ts·runtime.ts는 옮길 수 있다(정책 파일은 import가 없어야 한다)", () => {
    expect(POLICY).not.toMatch(/^import\s/m);
    expect(() => toScriptFragment(POLICY, "policy.ts")).not.toThrow();
    expect(() => toScriptFragment(RUNTIME, "runtime.ts")).not.toThrow();
  });
});

// ─── 만들어진 sw.js 실행 ────────────────────────────────────────────────────

const ORIGIN = "https://sguys99.github.io";
const abs = (href: string) => `${ORIGIN}${href}`;

class FakeCache {
  readonly entries = new Map<string, Response>();
  private key(k: string | Request | { url: string }): string {
    return typeof k === "string" ? k : k.url;
  }
  async match(k: string | Request): Promise<Response | undefined> {
    return this.entries.get(this.key(k))?.clone();
  }
  async put(k: string | Request, res: Response): Promise<void> {
    this.entries.delete(this.key(k));
    this.entries.set(this.key(k), res);
  }
  async keys(): Promise<{ url: string }[]> {
    return [...this.entries.keys()].map((url) => ({ url }));
  }
  async delete(k: string | Request | { url: string }): Promise<boolean> {
    return this.entries.delete(this.key(k));
  }
}

class FakeCaches {
  readonly stores = new Map<string, FakeCache>();
  async open(name: string): Promise<FakeCache> {
    let c = this.stores.get(name);
    if (!c) {
      c = new FakeCache();
      this.stores.set(name, c);
    }
    return c;
  }
  async keys(): Promise<string[]> {
    return [...this.stores.keys()];
  }
  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name);
  }
}

interface FakeRequest {
  url: string;
  method: string;
  mode: string;
  headers: Headers;
}

/** 같은 출처 응답(Response.type은 Node에서 "default"라 "basic"으로 덮는다) */
function basic(body: string, contentType: string, status = 200): Response {
  const res = new Response(body, {
    status,
    headers: { "content-type": contentType },
  });
  Object.defineProperty(res, "type", { value: "basic" });
  return res;
}

const CONFIG: SwConfig = {
  version: "v2",
  scope: "/euro-digest/",
  pages: [
    "/euro-digest/",
    "/euro-digest/news/",
    "/euro-digest/offline/",
    "/euro-digest/news/2026-11-02/",
  ],
  offline: "/euro-digest/offline/",
  assets: [
    "/euro-digest/_next/static/chunks/a.js",
    "/euro-digest/fonts/x.woff2",
  ],
  assetHashes: { "/euro-digest/fonts/x.woff2": "h2" },
  runtimePageLimit: 2,
};

function boot(config: SwConfig = CONFIG) {
  const listeners = new Map<string, (event: unknown) => void>();
  const sw = {
    location: new URL(`${ORIGIN}/euro-digest/sw.js`),
    registration: {
      navigationPreload: { enable: vi.fn(async () => undefined) },
    },
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(async () => undefined),
    addEventListener: (type: string, fn: (event: unknown) => void) =>
      listeners.set(type, fn),
  };
  const caches = new FakeCaches();
  const net = { online: true, files: new Map<string, string>() };
  for (const href of [
    ...CONFIG.pages,
    ...CONFIG.assets,
    "/euro-digest/about/",
    "/euro-digest/teams/a/",
    "/euro-digest/teams/b/",
  ]) {
    net.files.set(abs(href), `body ${href}`);
  }
  const fetchMock = vi.fn(async (input: string | FakeRequest) => {
    // 정적 서버처럼 쿼리는 무시한다
    const url =
      (typeof input === "string" ? input : input.url).split("?")[0] ?? "";
    if (!net.online) throw new TypeError("Failed to fetch");
    const body = net.files.get(url);
    if (body === undefined) return basic("not found", "text/html", 404);
    return basic(
      body,
      url.endsWith("/") ? "text/html; charset=utf-8" : "text/javascript",
    );
  });
  const source = renderServiceWorker(config, POLICY, RUNTIME);
  new Function("self", "caches", "fetch", source)(sw, caches, fetchMock);

  async function dispatch(type: string, extra: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | Response | undefined;
    const event = {
      ...extra,
      waitUntil: (p: Promise<unknown>) => waits.push(p),
      respondWith: (r: Promise<Response> | Response) => {
        responded = r;
      },
    };
    listeners.get(type)?.(event);
    const response = responded === undefined ? undefined : await responded;
    await Promise.all(waits);
    return response;
  }

  function request(href: string, over: Partial<FakeRequest> = {}): FakeRequest {
    return {
      url: href.startsWith("http") ? href : abs(href),
      method: "GET",
      mode: "navigate",
      headers: new Headers(),
      ...over,
    };
  }

  const fetchEvent = (req: FakeRequest) =>
    dispatch("fetch", {
      request: req,
      preloadResponse: Promise.resolve(undefined),
    });

  return {
    sw,
    caches,
    net,
    fetchMock,
    listeners,
    dispatch,
    request,
    fetchEvent,
    source,
  };
}

describe("sw.js 실행 — 이벤트 처리", () => {
  it("만든 파일: classic 스크립트(전역 오염 없는 즉시 실행 함수), 설정 JSON, 리스너 4개", () => {
    const { source, listeners } = boot();
    expect(source).toMatch(/^\/\* 유로 다이제스트 서비스 워커/);
    expect(source).toContain('"use strict";\n(() => {');
    expect(source).toContain(`const SW_CONFIG = ${JSON.stringify(CONFIG)};`);
    expect(source).not.toMatch(/^\s*(?:import|export)\b/m);
    expect([...listeners.keys()].sort()).toEqual([
      "activate",
      "fetch",
      "install",
      "message",
    ]);
  });

  it("install — 페이지는 HTTP 캐시를 거치지 않고(reload) ed-pages-{버전}에, 자산은 ed-static에", async () => {
    const { caches, dispatch, fetchMock } = boot();
    await dispatch("install");
    const pages = caches.stores.get("ed-pages-v2");
    expect([...(pages?.entries.keys() ?? [])]).toEqual(CONFIG.pages.map(abs));
    expect([...(caches.stores.get("ed-static")?.entries.keys() ?? [])]).toEqual(
      CONFIG.assets.map(abs),
    );
    for (const href of CONFIG.pages) {
      expect(fetchMock).toHaveBeenCalledWith(abs(href), { cache: "reload" });
    }
  });

  it("install — 이미 받은 정적 자산은 다시 받지 않는다(버전 사이 공유)", async () => {
    const { caches, dispatch, fetchMock } = boot();
    (await caches.open("ed-static")).entries.set(
      abs(CONFIG.assets[0] ?? ""),
      basic("old", "text/javascript"),
    );
    await dispatch("install");
    expect(fetchMock.mock.calls.map((c) => c[0])).not.toContain(
      abs(CONFIG.assets[0] ?? ""),
    );
  });

  it("install — 해시 없는 이름(웹폰트 · 아이콘 · manifest)은 같은 이름 · 다른 내용이면 다시 받아 덮고(reload), 같은 내용이면 그대로(M4-16)", async () => {
    const font = abs("/euro-digest/fonts/x.woff2");
    const old = boot();
    const oldStatics = await old.caches.open("ed-static");
    const stale = basic("old font", "font/woff2");
    stale.headers.set("x-ed-hash", "h1");
    oldStatics.entries.set(font, stale);
    await old.dispatch("install");
    expect(old.fetchMock).toHaveBeenCalledWith(font, { cache: "reload" });
    const now = await oldStatics.match(font);
    expect(await now?.text()).toBe("body /euro-digest/fonts/x.woff2");
    expect(now?.headers.get("x-ed-hash")).toBe("h2");

    const same = boot();
    const sameStatics = await same.caches.open("ed-static");
    const fresh = basic("current font", "font/woff2");
    fresh.headers.set("x-ed-hash", "h2");
    sameStatics.entries.set(font, fresh);
    await same.dispatch("install");
    expect(same.fetchMock.mock.calls.map((c) => c[0])).not.toContain(font);
    expect(await (await sameStatics.match(font))?.text()).toBe("current font");
  });

  it("install — 하나라도 실패하면(404·연결 끊김) 설치 실패", async () => {
    const missing = boot({
      ...CONFIG,
      pages: [...CONFIG.pages, "/euro-digest/missing/"],
    });
    await expect(missing.dispatch("install")).rejects.toThrow(/precache/);
    const offline = boot();
    offline.net.online = false;
    await expect(offline.dispatch("install")).rejects.toThrow();
  });

  it("activate — 지난 버전 ed- 캐시를 지우고(다른 접두는 남김), ed-static을 이번 목록으로 줄이고, 미리 받기·claim", async () => {
    const { caches, dispatch, sw } = boot();
    await caches.open("ed-pages-v1");
    await caches.open("ed-runtime-v1");
    await caches.open("someone-else");
    const statics = await caches.open("ed-static");
    statics.entries.set(
      abs("/euro-digest/_next/static/chunks/old.js"),
      basic("old", "text/javascript"),
    );
    statics.entries.set(
      abs(CONFIG.assets[0] ?? ""),
      basic("keep", "text/javascript"),
    );
    await dispatch("install");
    await dispatch("activate");
    expect((await caches.keys()).sort()).toEqual([
      "ed-pages-v2",
      "ed-static",
      "someone-else",
    ]);
    expect([...statics.entries.keys()].sort()).toEqual(
      CONFIG.assets.map(abs).sort(),
    );
    expect(sw.registration.navigationPreload.enable).toHaveBeenCalled();
    expect(sw.clients.claim).toHaveBeenCalled();
  });

  it("fetch 페이지 — 온라인이면 네트워크 응답, 프리캐시 대상은 그 캐시를 새로 고친다", async () => {
    const { caches, dispatch, fetchEvent, request, net } = boot();
    await dispatch("install");
    net.files.set(abs("/euro-digest/news/"), "fresh news");
    const res = await fetchEvent(request("/euro-digest/news/?cat=transfer"));
    expect(await res?.text()).toBe("fresh news");
    expect(
      await (
        await caches.stores.get("ed-pages-v2")?.match(abs("/euro-digest/news/"))
      )?.text(),
    ).toBe("fresh news");
  });

  it("fetch 페이지 — 그 밖의 페이지는 런타임 캐시(상한 — 오래된 것부터)", async () => {
    const { caches, fetchEvent, request } = boot();
    for (const href of [
      "/euro-digest/about/",
      "/euro-digest/teams/a/",
      "/euro-digest/teams/b/",
    ]) {
      await fetchEvent(request(href));
    }
    expect([
      ...(caches.stores.get("ed-runtime-v2")?.entries.keys() ?? []),
    ]).toEqual([abs("/euro-digest/teams/a/"), abs("/euro-digest/teams/b/")]);
  });

  it("fetch 페이지 — 오류 응답(404)·HTML 아닌 응답은 캐시하지 않는다", async () => {
    const { caches, fetchEvent, request } = boot();
    const res = await fetchEvent(request("/euro-digest/nope/"));
    expect(res?.status).toBe(404);
    expect(caches.stores.get("ed-runtime-v2")?.entries.size ?? 0).toBe(0);
  });

  it("fetch 페이지 — 오프라인: 저장한 페이지(쿼리·끝 슬래시 무관) → 그대로, 없으면 /offline/?from=…로, 오프라인 화면도 없으면 오류", async () => {
    const { dispatch, fetchEvent, request, net, caches } = boot();
    await dispatch("install");
    net.online = false;
    const cached = await fetchEvent(
      request("/euro-digest/news/2026-11-02?x=1"),
    );
    expect(await cached?.text()).toBe("body /euro-digest/news/2026-11-02/");
    const redirect = await fetchEvent(
      request("/euro-digest/teams/arsenal/?tab=1"),
    );
    expect(redirect?.status).toBe(302);
    const location = new URL(redirect?.headers.get("location") ?? "");
    expect(location.pathname).toBe("/euro-digest/offline/");
    expect(location.searchParams.get("from")).toBe(
      "/euro-digest/teams/arsenal/?tab=1",
    );
    const offlinePage = await fetchEvent(
      request("/euro-digest/offline/?from=%2Feuro-digest%2Fteams%2F"),
    );
    expect(await offlinePage?.text()).toBe("body /euro-digest/offline/");

    caches.stores
      .get("ed-pages-v2")
      ?.entries.delete(abs("/euro-digest/offline/"));
    expect(
      (await fetchEvent(request("/euro-digest/teams/arsenal/")))?.type,
    ).toBe("error");
  });

  it("fetch 정적 자산 — 캐시 우선, 없으면 받아서 넣는다", async () => {
    const { caches, dispatch, fetchEvent, request, fetchMock, net } = boot();
    await dispatch("install");
    fetchMock.mockClear();
    const hit = await fetchEvent(
      request("/euro-digest/_next/static/chunks/a.js", { mode: "no-cors" }),
    );
    expect(await hit?.text()).toBe(
      "body /euro-digest/_next/static/chunks/a.js",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    const lazy = "/euro-digest/_next/static/chunks/lazy.js";
    net.files.set(abs(lazy), "lazy");
    expect(
      await (await fetchEvent(request(lazy, { mode: "no-cors" })))?.text(),
    ).toBe("lazy");
    expect(caches.stores.get("ed-static")?.entries.has(abs(lazy))).toBe(true);
    const missing = "/euro-digest/_next/static/chunks/missing.js";
    expect(
      (await fetchEvent(request(missing, { mode: "no-cors" })))?.status,
    ).toBe(404);
    expect(caches.stores.get("ed-static")?.entries.has(abs(missing))).toBe(
      false,
    );
  });

  it("fetch — 외부 출처·RSC·RSS·POST는 손대지 않는다(respondWith 없음)", async () => {
    const { fetchEvent, request } = boot();
    for (const req of [
      request("https://gc.zgo.at/count.js", { mode: "no-cors" }),
      request("https://www.bbc.co.uk/sport/football/1"),
      request("/euro-digest/news/__next.news.__PAGE__.txt", {
        mode: "cors",
        headers: new Headers({ RSC: "1" }),
      }),
      request("/euro-digest/rss.xml", { mode: "no-cors" }),
      request("/euro-digest/", { method: "POST" }),
    ]) {
      expect(await fetchEvent(req)).toBeUndefined();
    }
  });

  it("message — 새로고침 메시지만 skipWaiting", async () => {
    const { dispatch, sw } = boot();
    await dispatch("message", { data: { type: "other" } });
    await dispatch("message", { data: null });
    expect(sw.skipWaiting).not.toHaveBeenCalled();
    await dispatch("message", { data: { type: "ed-skip-waiting" } });
    expect(sw.skipWaiting).toHaveBeenCalledTimes(1);
  });
});
