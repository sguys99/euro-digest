/**
 * 서비스 워커 캐시 정책(순수 함수 — src/lib/sw/policy.ts, FR-121 · M4-13): 요청 분류(캐시 대상 판정) · 페이지 키 · 버전 정리 · 상한 ·
 * 오프라인 화면 주소 · '다시 시도' 경로 검사. 같은 코드가 out/sw.js에 그대로 들어간다(tests/sw-build.test.ts가 실행으로 확인).
 */
import { describe, expect, it } from "vitest";

import { routes } from "@/lib/paths";
import {
  SW_CACHE_PREFIX,
  swCacheNames,
  swOfflineRedirect,
  swOverflow,
  swPageKey,
  swRequestKind,
  swSafeReturnPath,
  swStaleCaches,
  swStaticFresh,
  swStaticToDrop,
  type SwRequestInfo,
} from "@/lib/sw/policy";

const ORIGIN = "https://sguys99.github.io";
const SCOPE = `${ORIGIN}/euro-digest/`;

function req(url: string, over: Partial<SwRequestInfo> = {}): SwRequestInfo {
  return { url, method: "GET", mode: "no-cors", rsc: false, ...over };
}

describe("swRequestKind — 캐시 대상 판정", () => {
  it.each([
    ["홈 이동", `${SCOPE}`, "navigate"],
    ["날짜 페이지 이동", `${SCOPE}news/2026-10-24/`, "navigate"],
    [
      "필터 쿼리·앵커가 있는 이동",
      `${SCOPE}news/?cat=transfer#c_8f3a1b2c4d`,
      "navigate",
    ],
    ["끝 슬래시 없는 이동", `${SCOPE}teams/arsenal`, "navigate"],
  ])("%s → page", (_label, url, mode) => {
    expect(swRequestKind(req(url, { mode }), SCOPE)).toBe("page");
  });

  it.each([
    ["JS 청크", `${SCOPE}_next/static/chunks/0cz1d0mv5g_q7.js`],
    ["CSS 청크", `${SCOPE}_next/static/chunks/1tabss-7m4dha.css`],
    ["빌드 매니페스트", `${SCOPE}_next/static/abc/_buildManifest.js`],
    ["웹폰트", `${SCOPE}fonts/eurodigest-sans/eurodigest-sans-400.ksx.woff2`],
    ["아이콘", `${SCOPE}icons/icon-192.png`],
    ["manifest", `${SCOPE}manifest.webmanifest`],
    ["쿼리 붙은 청크", `${SCOPE}_next/static/chunks/a.js?dpl=1`],
  ])("%s → static", (_label, url) => {
    expect(swRequestKind(req(url, { mode: "cors" }), SCOPE)).toBe("static");
  });

  it.each([
    [
      "외부 원문 링크 이동(다른 출처)",
      req("https://www.bbc.co.uk/sport/football/1", { mode: "navigate" }),
    ],
    ["GoatCounter 스크립트", req("https://gc.zgo.at/count.js")],
    ["GoatCounter 집계", req("https://euro-digest.goatcounter.com/count?p=/")],
    [
      "같은 출처 scope 밖",
      req(`${ORIGIN}/other-project/`, { mode: "navigate" }),
    ],
    [
      "basePath 접두만 같은 다른 경로",
      req(`${ORIGIN}/euro-digest-old/`, { mode: "navigate" }),
    ],
    ["POST", req(`${SCOPE}`, { method: "POST", mode: "navigate" })],
    [
      "RSC 헤더(클라이언트 이동)",
      req(`${SCOPE}news/__next.news.__PAGE__.txt`, { rsc: true }),
    ],
    ["_rsc 쿼리", req(`${SCOPE}news/2026-10-24/index.txt?_rsc=abc`)],
    [
      "RSC 헤더가 붙은 navigate(있을 수 없지만 RSC 우선)",
      req(`${SCOPE}news/`, { mode: "navigate", rsc: true }),
    ],
    ["RSS", req(`${SCOPE}rss.xml`)],
    ["대회 RSS", req(`${SCOPE}rss/epl.xml`)],
    ["ics", req(`${SCOPE}calendar/korean.ics`)],
    ["sitemap", req(`${SCOPE}sitemap.xml`)],
    ["서비스 워커 자신", req(`${SCOPE}sw.js`)],
    ["검색 색인(M4-14)", req(`${SCOPE}pagefind/pagefind.js`)],
  ])("%s → bypass", (_label, info) => {
    expect(swRequestKind(info, SCOPE)).toBe("bypass");
  });

  it.each([
    ["마이 팀 자료", `${SCOPE}my/data/teams/arsenal.json`],
    ["마이 선수 자료", `${SCOPE}my/data/players/kim-min-jae.json`],
    ["온보딩 자료", `${SCOPE}my/data/onboarding.json`],
    ["쿼리 붙은 자료", `${SCOPE}my/data/teams/arsenal.json?v=1`],
  ])("%s → data(네트워크 우선 · 사본, M4-16)", (_label, url) => {
    expect(swRequestKind(req(url, { mode: "cors" }), SCOPE)).toBe("data");
  });

  it("마이 페이지 이동은 page, my/data 밖 JSON · my/data 안 JSON 아닌 것은 bypass", () => {
    expect(swRequestKind(req(`${SCOPE}my/`, { mode: "navigate" }), SCOPE)).toBe(
      "page",
    );
    expect(
      swRequestKind(req(`${SCOPE}pagefind/pagefind-entry.json`), SCOPE),
    ).toBe("bypass");
    expect(swRequestKind(req(`${SCOPE}my/data/readme.txt`), SCOPE)).toBe(
      "bypass",
    );
  });

  it("루트 배포(basePath 빈 값)도 같은 규칙", () => {
    const root = `${ORIGIN}/`;
    expect(swRequestKind(req(`${root}news/`, { mode: "navigate" }), root)).toBe(
      "page",
    );
    expect(swRequestKind(req(`${root}fonts/a.woff2`), root)).toBe("static");
    expect(swRequestKind(req(`${root}rss.xml`), root)).toBe("bypass");
  });
});

describe("swPageKey — 페이지 캐시 키", () => {
  it.each([
    [`${SCOPE}`, `${SCOPE}`],
    [`${SCOPE}news/2026-10-24/`, `${SCOPE}news/2026-10-24/`],
    [`${SCOPE}news/2026-10-24`, `${SCOPE}news/2026-10-24/`],
    [`${SCOPE}news/?cat=transfer`, `${SCOPE}news/`],
    [`${SCOPE}news/2026-10-24/#c_8f3a1b2c4d`, `${SCOPE}news/2026-10-24/`],
    [`${SCOPE}offline/?from=%2Feuro-digest%2Fabout%2F`, `${SCOPE}offline/`],
    [`${SCOPE}404.html`, `${SCOPE}404.html`],
    [`${ORIGIN}/euro-digest`, `${ORIGIN}/euro-digest/`],
  ])("%s → %s", (input, key) => {
    expect(swPageKey(input)).toBe(key);
  });
});

describe("캐시 이름 · 버전 정리 · 상한", () => {
  it("버전별 이름은 ed- 접두, 정적 캐시는 버전 없이 공유", () => {
    expect(swCacheNames("abc123")).toEqual({
      pages: "ed-pages-abc123",
      runtime: "ed-runtime-abc123",
      static: "ed-static",
      data: "ed-data",
    });
    expect(SW_CACHE_PREFIX).toBe("ed-");
  });

  it("swStaleCaches — 이번 버전이 쓰지 않는 ed- 캐시만 지운다(다른 접두는 남김)", () => {
    const keep = Object.values(swCacheNames("v2"));
    expect(
      swStaleCaches(
        [
          "ed-pages-v1",
          "ed-runtime-v1",
          "ed-static",
          "ed-pages-v2",
          "ed-runtime-v2",
          "workbox-precache",
          "other",
        ],
        keep,
      ),
    ).toEqual(["ed-pages-v1", "ed-runtime-v1"]);
    expect(swStaleCaches([], keep)).toEqual([]);
  });

  it("swOverflow — 넣은 순서(오래된 것부터)로 넘친 만큼", () => {
    expect(swOverflow(["a", "b", "c", "d"], 2)).toEqual(["a", "b"]);
    expect(swOverflow(["a", "b"], 2)).toEqual([]);
    expect(swOverflow(["a"], 0)).toEqual(["a"]);
    expect(swOverflow(["a", "b"], -1)).toEqual(["a", "b"]);
  });

  it("swStaticFresh — 해시 이름은 사본이면 그대로, 해시 없는 이름은 내용 해시가 같을 때만(같은 이름 · 다른 내용 → 다시 받기, M4-16)", () => {
    expect(swStaticFresh(undefined, null)).toBe(true);
    expect(swStaticFresh("h2", "h2")).toBe(true);
    expect(swStaticFresh("h2", "h1")).toBe(false);
    expect(swStaticFresh("h2", null)).toBe(false);
  });

  it("swStaticToDrop — 이번 목록에 없는 지난 청크", () => {
    expect(
      swStaticToDrop(
        [`${SCOPE}_next/static/old.js`, `${SCOPE}_next/static/keep.js`],
        [`${SCOPE}_next/static/keep.js`, `${SCOPE}_next/static/new.js`],
      ),
    ).toEqual([`${SCOPE}_next/static/old.js`]);
  });
});

describe("오프라인 화면 주소 · '다시 시도'", () => {
  it("swOfflineRedirect — 열려던 경로(쿼리 포함, 해시 제외)를 from에", () => {
    const href = swOfflineRedirect(
      `${SCOPE}offline/`,
      `${SCOPE}teams/arsenal/?tab=squad`,
    );
    const url = new URL(href);
    expect(`${url.origin}${url.pathname}`).toBe(`${SCOPE}offline/`);
    expect(url.searchParams.get("from")).toBe(
      "/euro-digest/teams/arsenal/?tab=squad",
    );
  });

  it("swSafeReturnPath — scope 안 경로만, 다른 출처로 가는 값은 null", () => {
    const scopePath = "/euro-digest/";
    expect(swSafeReturnPath("/euro-digest/about/", scopePath)).toBe(
      "/euro-digest/about/",
    );
    expect(swSafeReturnPath("/euro-digest/news/?cat=transfer", scopePath)).toBe(
      "/euro-digest/news/?cat=transfer",
    );
    for (const bad of [
      null,
      "",
      "/other/",
      "//evil.example/euro-digest/",
      "https://evil.example/euro-digest/",
      "/euro-digest\\..\\evil",
      "javascript:alert(1)",
    ]) {
      expect(swSafeReturnPath(bad, scopePath)).toBeNull();
    }
    // 루트 배포: `//evil`(프로토콜 상대 URL)은 막는다
    expect(swSafeReturnPath("//evil.example/", "/")).toBeNull();
    expect(swSafeReturnPath("/about/", "/")).toBe("/about/");
  });

  it("오프라인 화면 라우트", () => {
    expect(routes.offline()).toBe("/offline/");
  });
});
