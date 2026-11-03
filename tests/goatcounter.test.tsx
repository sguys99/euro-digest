/**
 * 쿠키리스 분석 — 진입점 src/lib/analytics.ts · 구현(지연 조각) src/lib/goatcounter.ts (M5-04, PRD NFR-08 · §11.2)
 *
 * 이벤트 이름 · path 정규화 · 공개 주소 판정 · 링크 분류(원문 · RSS · .ics · webcal) · 가드(꺼짐 · 스크립트 없음 · 막힘 · count 오류) ·
 * 대기열 · `q` 제거 · 위임 리스너 · `appinstalled` · 마이 팀 저장(`my/set`)을 본다. 실제 GoatCounter로는 아무것도 보내지 않는다 —
 * 스크립트 태그는 `<head>`에 붙이지 않고 가로채서(happy-dom이 외부 파일을 받지 않게) 속성만 확인한다.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type AnalyticsEvent,
  analyticsEnabled,
  loadAnalytics,
  OUT_LINK_PROPS,
  track as trackEntry,
} from "@/lib/analytics";
import {
  analyticsActive,
  cleanReferrer,
  dropQuery,
  eventPath,
  eventTitle,
  GOATCOUNTER,
  type GoatCounterVars,
  isAnalyticsLocation,
  linkEvent,
  normalizePagePath,
  QUEUE_LIMIT,
  resetAnalyticsState,
  startAnalytics,
  TITLE_WAIT_MS,
  track,
  trackPageview,
} from "@/lib/goatcounter";
import { createPaths } from "@/lib/paths";
import { createSafeStorage } from "@/lib/safe-storage";
import { createFollowStore, useFollows } from "@/lib/use-follows";

const SITE = { origin: "https://sguys99.github.io", basePath: "/euro-digest" };
const paths = createPaths({
  basePath: SITE.basePath,
  siteUrl: SITE.origin,
});

/** happy-dom 주소 바꾸기(출처까지) */
function setUrl(url: string): void {
  (
    window as unknown as { happyDOM: { setURL(url: string): void } }
  ).happyDOM.setURL(url);
}

/** `<head>`에 붙는 스크립트를 가로챈다 — 실제로 붙이지 않아 외부 파일을 받지 않는다 */
function interceptScripts(): HTMLScriptElement[] {
  const scripts: HTMLScriptElement[] = [];
  const append = document.head.appendChild.bind(document.head);
  vi.spyOn(document.head, "appendChild").mockImplementation(
    <T extends Node>(node: T): T => {
      if (!(node instanceof HTMLScriptElement)) return append(node);
      scripts.push(node);
      return node;
    },
  );
  return scripts;
}

/** 가짜 count.js — count 호출을 모으고 get_data는 count.js처럼 q를 붙인다 */
function fakeGoatCounter() {
  const calls: GoatCounterVars[] = [];
  const sent: Record<string, unknown>[] = [];
  const gc = {
    get_data: (vars?: GoatCounterVars) => ({
      p: vars?.path,
      q: "?t=arsenal",
    }),
    count: (vars: GoatCounterVars) => {
      calls.push(vars);
      sent.push(gc.get_data(vars));
    },
  };
  window.goatcounter = gc;
  return { calls, sent, gc };
}

beforeEach(() => {
  resetAnalyticsState();
  delete window.goatcounter;
  setUrl("https://sguys99.github.io/euro-digest/");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete window.goatcounter;
  resetAnalyticsState();
  document.body.innerHTML = "";
});

describe("이벤트 이름", () => {
  const cases: Array<[AnalyticsEvent, string, string]> = [
    [{ kind: "out", host: "bbc.co.uk" }, "out/bbc.co.uk", "원문 링크"],
    [{ kind: "feed", format: "rss", scope: "all" }, "feed/rss/all", "RSS 구독"],
    [
      { kind: "feed", format: "ics", scope: "team" },
      "feed/ics/team",
      ".ics 받기",
    ],
    [
      { kind: "feed", format: "webcal", scope: "korean" },
      "feed/webcal/korean",
      "캘린더 구독",
    ],
    [{ kind: "pwa-install" }, "pwa/install", "앱 설치"],
    [{ kind: "my-set" }, "my/set", "마이 팀 저장"],
  ];
  it.each(cases)("%j → %s", (event, path, title) => {
    expect(eventPath(event)).toBe(path);
    expect(eventTitle(event)).toBe(title);
    // 이벤트 이름은 앞 `/` 없이(GoatCounter 이벤트 관례) — 페이지 path와 섞이지 않게
    expect(eventPath(event).startsWith("/")).toBe(false);
  });
});

describe("페이지뷰 path 정규화", () => {
  it.each([
    ["/euro-digest/", "/euro-digest/"],
    ["/euro-digest", "/euro-digest/"],
    ["/euro-digest/news/2026-11-03/", "/euro-digest/news/2026-11-03/"],
    ["/euro-digest/about", "/euro-digest/about/"],
    ["/euro-digest/index.html", "/euro-digest/"],
    ["/euro-digest/teams/arsenal/index.html", "/euro-digest/teams/arsenal/"],
    ["/euro-digest/404.html", "/euro-digest/404/"],
    ["/euro-digest//my/", "/euro-digest/my/"],
    ["", "/"],
    ["/", "/"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePagePath(input)).toBe(expected);
  });
});

describe("공개 주소 판정", () => {
  it("공개 출처 + basePath 아래만", () => {
    const at = (href: string) => {
      const url = new URL(href);
      return isAnalyticsLocation(
        { origin: url.origin, pathname: url.pathname },
        SITE,
      );
    };
    expect(at("https://sguys99.github.io/euro-digest/")).toBe(true);
    expect(at("https://sguys99.github.io/euro-digest/news/")).toBe(true);
    expect(at("https://sguys99.github.io/euro-digest")).toBe(true);
    // 같은 출처의 다른 저장소(블로그) · 비슷한 이름
    expect(at("https://sguys99.github.io/")).toBe(false);
    expect(at("https://sguys99.github.io/euro-digest-old/")).toBe(false);
    // 로컬 미리보기 · e2e · 다른 호스트 사본
    expect(at("http://127.0.0.1:4173/euro-digest/")).toBe(false);
    expect(at("http://localhost:3000/euro-digest/")).toBe(false);
    expect(at("https://someone.github.io/euro-digest/")).toBe(false);
    expect(at("http://sguys99.github.io/euro-digest/")).toBe(false);
  });

  it('루트 배포(basePath "")면 출처만 본다', () => {
    expect(
      isAnalyticsLocation(
        { origin: "https://example.org", pathname: "/news/" },
        { origin: "https://example.org", basePath: "" },
      ),
    ).toBe(true);
  });
});

describe("referrer 정리", () => {
  const origin = SITE.origin;
  it("쿼리 · 해시를 뗀다 — 같은 사이트면 path 규칙, 다른 사이트면 출처 + 경로", () => {
    expect(cleanReferrer("", origin)).toBeUndefined();
    expect(
      cleanReferrer(
        "https://sguys99.github.io/euro-digest/my/?t=arsenal&p=son#x",
        origin,
      ),
    ).toBe("https://sguys99.github.io/euro-digest/my/");
    expect(cleanReferrer("https://www.google.com/search?q=x", origin)).toBe(
      "https://www.google.com/search",
    );
    expect(cleanReferrer("android-app://com.slack/", origin)).toBe("");
    expect(cleanReferrer("not a url", origin)).toBe("");
  });
});

describe("링크 분류", () => {
  const out = (href: string) => linkEvent({ href, track: "out" }, SITE);
  const site = (href: string) => linkEvent({ href, track: null }, SITE);

  it("원문 링크(data-track=out) → 호스트만(소문자 · www. 뗌, 경로 · 쿼리 · 카드 ID 없음)", () => {
    expect(out("https://www.BBC.co.uk/sport/football/1234?x=1#c")).toEqual({
      kind: "out",
      host: "bbc.co.uk",
    });
    expect(out("https://theathletic.com/a/b")).toEqual({
      kind: "out",
      host: "theathletic.com",
    });
    expect(out("javascript:void(0)")).toBeNull();
    expect(out("mailto:a@b.c")).toBeNull();
    expect(OUT_LINK_PROPS).toEqual({ "data-track": "out" });
  });

  it("표시 없는 외부 링크(소개 · 신고 · 근거)는 세지 않는다", () => {
    expect(site("https://www.bbc.co.uk/sport")).toBeNull();
    expect(
      site("https://github.com/sguys99/euro-digest/issues/new"),
    ).toBeNull();
  });

  it("RSS — src/lib/paths.ts가 만든 주소와 같은 규칙(slug는 보내지 않음)", () => {
    expect(site(paths.rssUrl())).toEqual({
      kind: "feed",
      format: "rss",
      scope: "all",
    });
    expect(site(paths.rssUrl({ kind: "korean" }))).toEqual({
      kind: "feed",
      format: "rss",
      scope: "korean",
    });
    expect(site(paths.rssUrl({ kind: "competition", comp: "EPL" }))).toEqual({
      kind: "feed",
      format: "rss",
      scope: "competition",
    });
  });

  it(".ics(파일) · webcal(구독)", () => {
    expect(site(paths.icsUrl({ kind: "team", team: "arsenal" }))).toEqual({
      kind: "feed",
      format: "ics",
      scope: "team",
    });
    expect(site(paths.icsUrl({ kind: "korean" }))).toEqual({
      kind: "feed",
      format: "ics",
      scope: "korean",
    });
    expect(site(paths.icsUrl({ kind: "match", matchId: "537901" }))).toEqual({
      kind: "feed",
      format: "ics",
      scope: "match",
    });
    expect(site(paths.webcalUrl({ kind: "team", team: "arsenal" }))).toEqual({
      kind: "feed",
      format: "webcal",
      scope: "team",
    });
    expect(site(paths.webcalUrl({ kind: "korean" }))).toEqual({
      kind: "feed",
      format: "webcal",
      scope: "korean",
    });
  });

  it("사이트 안 일반 페이지 · 다른 호스트의 같은 경로 · basePath 밖은 null", () => {
    expect(site("https://sguys99.github.io/euro-digest/news/")).toBeNull();
    expect(
      site("https://sguys99.github.io/euro-digest/sitemap.xml"),
    ).toBeNull();
    expect(site("http://127.0.0.1:4173/euro-digest/rss.xml")).toBeNull();
    expect(site("https://sguys99.github.io/rss.xml")).toBeNull();
    expect(
      site("webcal://example.org/euro-digest/calendar/korean.ics"),
    ).toBeNull();
  });
});

describe("가드 — 켜지지 않았거나 스크립트가 없으면 아무것도 하지 않는다", () => {
  it("startAnalytics 전: track · trackPageview는 조용히 넘어간다", () => {
    const { calls } = fakeGoatCounter();
    track({ kind: "my-set" });
    trackPageview();
    expect(calls).toEqual([]);
    expect(analyticsActive()).toBe(false);
  });

  it("공개 주소가 아니면(로컬) 스크립트를 싣지 않고 보내지 않는다", () => {
    setUrl("http://127.0.0.1:4173/euro-digest/");
    const scripts = interceptScripts();
    const { calls } = fakeGoatCounter();
    startAnalytics(SITE);
    trackPageview();
    track({ kind: "pwa-install" });
    expect(analyticsActive()).toBe(false);
    expect(scripts).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("count가 던져도 오류가 밖으로 나가지 않는다", () => {
    interceptScripts();
    window.goatcounter = {
      count: () => {
        throw new Error("blocked");
      },
    };
    startAnalytics(SITE);
    expect(() => trackPageview()).not.toThrow();
    expect(() => track({ kind: "my-set" })).not.toThrow();
  });
});

describe("스크립트 · 페이지뷰", () => {
  it("버전 고정 스크립트 + SRI + no_onload, 한 번만", () => {
    const scripts = interceptScripts();
    startAnalytics(SITE);
    startAnalytics(SITE);
    expect(scripts).toHaveLength(1);
    const s = scripts[0]!;
    expect(s.src).toBe(GOATCOUNTER.script);
    expect(s.async).toBe(true);
    expect(s.integrity).toBe(GOATCOUNTER.integrity);
    expect(s.crossOrigin).toBe("anonymous");
    expect(s.dataset.goatcounter).toBe(
      "https://euro-digest.goatcounter.com/count",
    );
    expect(JSON.parse(s.dataset.goatcounterSettings ?? "")).toEqual({
      no_onload: true,
    });
    expect(GOATCOUNTER.script).toMatch(
      /^https:\/\/gc\.zgo\.at\/count\.v\d+\.js$/,
    );
    expect(GOATCOUNTER.integrity).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
  });

  it("스크립트가 실리기 전 페이지뷰는 기다렸다 load 때 보낸다 — path는 쿼리 · 해시 없이, q도 지운다", () => {
    setUrl("https://sguys99.github.io/euro-digest/my/?t=arsenal&p=son#top");
    const scripts = interceptScripts();
    startAnalytics(SITE);
    trackPageview();
    const { calls, sent } = fakeGoatCounter();
    expect(calls).toEqual([]);
    scripts[0]!.dispatchEvent(new Event("load"));
    expect(calls).toEqual([
      {
        path: "/euro-digest/my/",
        title: document.title,
        referrer: undefined,
      },
    ]);
    expect(sent[0]).not.toHaveProperty("q");
  });

  it("같은 path(쿼리 · 해시만 바뀜 · 섬 재마운트)는 다시 세지 않고, 다른 path는 직전 주소를 referrer로", () => {
    interceptScripts();
    const { calls } = fakeGoatCounter();
    startAnalytics(SITE);
    document.title = "유로 다이제스트";
    trackPageview();
    setUrl("https://sguys99.github.io/euro-digest/?cat=transfer#c_0123456789");
    trackPageview();
    setUrl("https://sguys99.github.io/euro-digest/news/");
    document.title = "뉴스 · 유로 다이제스트";
    trackPageview();
    trackPageview();
    setUrl("https://sguys99.github.io/euro-digest/");
    document.title = "유로 다이제스트";
    trackPageview();
    expect(calls.map((c) => [c.path, c.title, c.referrer])).toEqual([
      ["/euro-digest/", "유로 다이제스트", undefined],
      [
        "/euro-digest/news/",
        "뉴스 · 유로 다이제스트",
        "https://sguys99.github.io/euro-digest/",
      ],
      [
        "/euro-digest/",
        "유로 다이제스트",
        "https://sguys99.github.io/euro-digest/news/",
      ],
    ]);
    expect(calls.every((c) => c.event === undefined)).toBe(true);
  });

  it("클라이언트 이동 뒤 제목이 늦게 바뀌면 바뀐 제목을 기다린다(이전 페이지 제목을 붙이지 않음) — 끝내 같으면 시간 상한 뒤 그대로", async () => {
    interceptScripts();
    const { calls } = fakeGoatCounter();
    startAnalytics(SITE);
    document.title = "유로 다이제스트";
    trackPageview();
    setUrl("https://sguys99.github.io/euro-digest/news/");
    trackPageview();
    expect(calls).toHaveLength(1);
    // 옛 <title>이 빠진 사이의 빈 제목은 건너뛴다
    document.title = "";
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toHaveLength(1);
    document.title = "뉴스 · 유로 다이제스트";
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toMatchObject({
      path: "/euro-digest/news/",
      title: "뉴스 · 유로 다이제스트",
    });

    vi.useFakeTimers();
    try {
      setUrl("https://sguys99.github.io/euro-digest/news/2026-11-03/");
      trackPageview();
      expect(calls).toHaveLength(2);
      vi.advanceTimersByTime(TITLE_WAIT_MS);
      expect(calls[2]).toMatchObject({
        path: "/euro-digest/news/2026-11-03/",
        title: "뉴스 · 유로 다이제스트",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("스크립트가 막히면 대기열을 버리고 더 쌓지 않는다(오류 0)", () => {
    const scripts = interceptScripts();
    startAnalytics(SITE);
    trackPageview();
    scripts[0]!.dispatchEvent(new Event("error"));
    track({ kind: "my-set" });
    const { calls } = fakeGoatCounter();
    scripts[0]!.dispatchEvent(new Event("load"));
    expect(calls).toEqual([]);
  });

  it(`대기열은 ${QUEUE_LIMIT}개까지`, () => {
    const scripts = interceptScripts();
    startAnalytics(SITE);
    for (let i = 0; i < QUEUE_LIMIT + 5; i++) track({ kind: "my-set" });
    const { calls } = fakeGoatCounter();
    scripts[0]!.dispatchEvent(new Event("load"));
    expect(calls).toHaveLength(QUEUE_LIMIT);
  });

  it("dropQuery는 한 번만 감싼다", () => {
    const gc = {
      get_data: () => ({ p: "/", q: "?x=1" }) as Record<string, unknown>,
    };
    dropQuery(gc);
    const once = gc.get_data;
    dropQuery(gc);
    expect(gc.get_data).toBe(once);
    expect(gc.get_data()).toEqual({ p: "/" });
    expect(() => dropQuery({})).not.toThrow();
  });
});

describe("이벤트 — 위임 리스너 · appinstalled", () => {
  function link(href: string, attrs: Record<string, string> = {}) {
    const a = document.createElement("a");
    a.href = href;
    for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
    const span = document.createElement("span");
    span.textContent = "제목";
    a.appendChild(span);
    // 이동 막기(테스트 문서가 떠나지 않게 — 이벤트는 cancelable로 보낸다)
    a.addEventListener("click", (e) => e.preventDefault());
    a.addEventListener("auxclick", (e) => e.preventDefault());
    document.body.appendChild(a);
    return span;
  }

  it("원문 링크 안쪽을 눌러도 out/{호스트}, 가운데 버튼도, 오른쪽 버튼(auxclick 2)은 아님", () => {
    interceptScripts();
    const { calls } = fakeGoatCounter();
    startAnalytics(SITE);
    const inner = link("https://www.marca.com/futbol/x.html?id=1", {
      "data-track": "out",
    });
    inner.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    inner.dispatchEvent(
      new MouseEvent("auxclick", {
        bubbles: true,
        cancelable: true,
        button: 1,
      }),
    );
    inner.dispatchEvent(
      new MouseEvent("auxclick", {
        bubbles: true,
        cancelable: true,
        button: 2,
      }),
    );
    expect(calls).toEqual([
      {
        path: "out/marca.com",
        title: "원문 링크",
        referrer: "https://sguys99.github.io/euro-digest/",
        event: true,
      },
      {
        path: "out/marca.com",
        title: "원문 링크",
        referrer: "https://sguys99.github.io/euro-digest/",
        event: true,
      },
    ]);
  });

  it("RSS · webcal 링크, 표시 없는 외부 링크 · 일반 내부 링크는 세지 않음", () => {
    interceptScripts();
    const { calls } = fakeGoatCounter();
    startAnalytics(SITE);
    for (const href of [
      paths.rssUrl({ kind: "korean" }),
      paths.webcalUrl({ kind: "team", team: "arsenal" }),
      "https://github.com/sguys99/euro-digest/issues/new",
      "https://sguys99.github.io/euro-digest/about/",
    ]) {
      link(href).dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    }
    expect(calls.map((c) => c.path)).toEqual([
      "feed/rss/korean",
      "feed/webcal/team",
    ]);
  });

  it("appinstalled → pwa/install", () => {
    interceptScripts();
    const { calls } = fakeGoatCounter();
    startAnalytics(SITE);
    window.dispatchEvent(new Event("appinstalled"));
    expect(calls.map((c) => c.path)).toEqual(["pwa/install"]);
  });
});

/** 공개 빌드 흉내(테스트 NODE_ENV는 "test") — 출처는 vitest 설정의 NEXT_PUBLIC_SITE_URL(기본 사이트) */
function stubPublicBuild(): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_ANALYTICS", "on");
}

describe("진입점 — 공개 빌드 + 공개 출처일 때만 구현 조각을 받는다", () => {
  it("테스트 · 개발(NODE_ENV) · 견본 빌드(off) · 로컬 출처면 꺼짐 — track은 아무것도 하지 않는다", () => {
    const { calls } = fakeGoatCounter();
    expect(analyticsEnabled()).toBe(false);
    expect(loadAnalytics()).toBeNull();
    trackEntry({ kind: "my-set" });

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS", "off");
    expect(analyticsEnabled()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_ANALYTICS", "on");
    setUrl("http://127.0.0.1:4173/euro-digest/");
    expect(analyticsEnabled()).toBe(false);
    expect(loadAnalytics()).toBeNull();
    expect(calls).toEqual([]);
  });

  it("공개 빌드 + 공개 출처면 같은 구현 조각을 한 번 받는다", async () => {
    stubPublicBuild();
    expect(analyticsEnabled()).toBe(true);
    const first = loadAnalytics();
    expect(first).not.toBeNull();
    expect(loadAnalytics()).toBe(first);
    const mod = await first!;
    expect(mod.GOATCOUNTER.endpoint).toBe(GOATCOUNTER.endpoint);
  });
});

describe("마이 팀 저장(my/set) — src/lib/use-follows.ts", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("팔로우를 더하거나 가져올 때만, 무엇을 · 몇 개인지는 없이", async () => {
    stubPublicBuild();
    interceptScripts();
    const { calls } = fakeGoatCounter();
    startAnalytics(SITE);
    const store = createFollowStore(
      createSafeStorage(() => window.localStorage),
      window,
    );
    const { result } = renderHook(() => useFollows(store));
    act(() => {
      result.current.follow("teams", "arsenal"); // +1
      result.current.follow("teams", "arsenal"); // 이미 — 바뀜 없음
      result.current.toggle("players", "son-heung-min"); // 켜기 +1
      result.current.toggle("players", "son-heung-min"); // 끄기 — 세지 않음
      result.current.unfollow("teams", "arsenal"); // 해제 — 세지 않음
      result.current.importFrom({ teams: ["liverpool"], players: [] }, "merge"); // +1
    });
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    for (const c of calls) {
      expect(c).toEqual({
        path: "my/set",
        title: "마이 팀 저장",
        referrer: "https://sguys99.github.io/euro-digest/",
        event: true,
      });
    }
  });
});
