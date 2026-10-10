import { describe, expect, it } from "vitest";

import {
  collectInternalRefs,
  decodeHtmlEntities,
  extractInitialScriptSrcs,
  extractRefs,
  htmlFileToUrlPath,
  normalizeBasePath,
  parseSrcset,
  parseTags,
  resolveRef,
  sitePathToOutFile,
  type ResolveOptions,
} from "../scripts/lib/site-refs";

const BASE = "/euro-digest";
const options: ResolveOptions = { basePath: BASE };

// Next 16 정적 export가 실제로 만드는 head 모양을 줄인 샘플
const NEXT_HEAD = `<!DOCTYPE html><html lang="ko"><head>
<link rel="stylesheet" href="/euro-digest/_next/static/chunks/a.css" data-precedence="next"/>
<link rel="preload" as="script" fetchPriority="low" href="/euro-digest/_next/static/chunks/main.js"/>
<script src="/euro-digest/_next/static/chunks/a.js" async=""></script>
<script src="/euro-digest/_next/static/chunks/b.js" async=""></script>
<script src="/euro-digest/_next/static/chunks/polyfill.js" noModule=""></script>
</head><body><main><h1>유로 다이제스트</h1></main>
<script id="_R_">(self.TURBOPACK=[]).push({"otherChunks":["static/chunks/a.js"]});</script>
<script src="/euro-digest/_next/static/chunks/main.js" async=""></script>
<script src="/euro-digest/_next/static/chunks/a.js" async=""></script>
<script>self.__next_f.push([1,"<a href=\\"/not-a-real-link\\">x</a>"])</script>
</body></html>`;

describe("parseTags", () => {
  it("속성 이름은 소문자로, 값은 엔터티를 풀어 읽는다", () => {
    const [tag] = parseTags(`<A HREF="/x?a=1&amp;b=2" data-X='y'>`);
    expect(tag?.name).toBe("a");
    expect(tag?.attrs.get("href")).toBe("/x?a=1&b=2");
    expect(tag?.attrs.get("data-x")).toBe("y");
  });

  it("값 없는 불리언 속성과 따옴표 없는 값을 읽는다", () => {
    const [tag] = parseTags(`<script nomodule src=/a.js defer>`);
    expect(tag?.attrs.get("nomodule")).toBe("");
    expect(tag?.attrs.get("src")).toBe("/a.js");
    expect(tag?.attrs.has("defer")).toBe(true);
  });

  it("따옴표 안의 `>`에서 태그가 끊기지 않는다", () => {
    const [tag] = parseTags(`<a title="a > b" href="/ok/">`, ["a"]);
    expect(tag?.attrs.get("href")).toBe("/ok/");
  });

  it("주석과 인라인 스크립트·스타일 본문 안의 태그 모양 문자열은 무시한다", () => {
    const html = `<!-- <a href="/c/"> --><script>document.write('<a href="/s/">')</script>
      <style>a::after{content:"<a href='/y/'>"}</style><a href="/real/">`;
    expect(parseTags(html, ["a"]).map((tag) => tag.attrs.get("href"))).toEqual([
      "/real/",
    ]);
  });

  it("같은 속성이 반복되면 첫 값만 쓴다", () => {
    expect(parseTags(`<a href="/1/" href="/2/">`)[0]?.attrs.get("href")).toBe(
      "/1/",
    );
  });
});

describe("decodeHtmlEntities", () => {
  it("이름·10진·16진 참조를 풀고 모르는 이름은 그대로 둔다", () => {
    expect(decodeHtmlEntities("&lt;&#65;&#x42;&quot;&unknown;")).toBe(
      '<AB"&unknown;',
    );
  });
});

describe("extractInitialScriptSrcs", () => {
  it("noModule을 빼고 중복을 제거해 등장 순서대로 돌려준다", () => {
    expect(extractInitialScriptSrcs(NEXT_HEAD)).toEqual([
      "/euro-digest/_next/static/chunks/a.js",
      "/euro-digest/_next/static/chunks/b.js",
      "/euro-digest/_next/static/chunks/main.js",
    ]);
  });

  it("preload 링크·인라인 스크립트는 세지 않는다", () => {
    const html = `<link rel="preload" as="script" href="/p.js"><script>var a=1</script>`;
    expect(extractInitialScriptSrcs(html)).toEqual([]);
  });

  it("type=module·text/javascript는 세고 JSON 데이터 블록은 뺀다", () => {
    const html = `<script type="module" src="/m.js"></script>
      <script type="text/javascript; charset=utf-8" src="/t.js"></script>
      <script type="application/json" src="/d.json"></script>`;
    expect(extractInitialScriptSrcs(html)).toEqual(["/m.js", "/t.js"]);
  });

  it("nomodule 표기가 대소문자·값과 무관하게 제외된다", () => {
    const html = `<script NOMODULE="true" src="/legacy.js"></script><script src="/ok.js"></script>`;
    expect(extractInitialScriptSrcs(html)).toEqual(["/ok.js"]);
  });
});

describe("extractRefs · parseSrcset", () => {
  it("a·link·script·img(srcset 포함) 참조를 모으고 preconnect는 뺀다", () => {
    const html = `<link rel="preconnect" href="https://gc.zgo.at"><link rel="icon" href="/euro-digest/icon.svg">
      <a href="../news/">뉴스</a><img src="a.png" srcset="a.png 1x, b@2x.png 2x" alt="">`;
    expect(extractRefs(html)).toEqual([
      { tag: "link", attr: "href", url: "/euro-digest/icon.svg" },
      { tag: "a", attr: "href", url: "../news/" },
      { tag: "img", attr: "src", url: "a.png" },
      { tag: "img", attr: "srcset", url: "a.png" },
      { tag: "img", attr: "srcset", url: "b@2x.png" },
    ]);
  });

  it("srcset의 너비 서술자도 처리한다", () => {
    expect(parseSrcset(" s.png 320w ,  l.png 1280w ")).toEqual([
      "s.png",
      "l.png",
    ]);
  });
});

describe("normalizeBasePath", () => {
  it("next.config.ts와 같은 규칙: 기본값·끝 슬래시 제거·빈 값은 루트", () => {
    expect(normalizeBasePath(undefined)).toBe("/euro-digest");
    expect(normalizeBasePath("/euro-digest/")).toBe("/euro-digest");
    expect(normalizeBasePath("")).toBe("");
  });
});

describe("htmlFileToUrlPath · sitePathToOutFile", () => {
  it.each([
    ["index.html", "/"],
    ["404.html", "/404.html"],
    ["404/index.html", "/404/"],
    ["news/2026-10-10/index.html", "/news/2026-10-10/"],
    ["teams\\son heung-min\\index.html", "/teams/son%20heung-min/"],
  ])("%s → %s", (file, urlPath) => {
    expect(htmlFileToUrlPath(file)).toBe(urlPath);
  });

  it.each([
    ["/_next/static/chunks/a.js", "_next/static/chunks/a.js"],
    ["/", "index.html"],
    ["/news/", "news/index.html"],
    ["/teams/son%20heung-min/", "teams/son heung-min/index.html"],
    ["/bad%E0%A4%A.js", "bad%E0%A4%A.js"],
  ])("%s → %s", (sitePath, file) => {
    expect(sitePathToOutFile(sitePath)).toBe(file);
  });
});

describe("resolveRef", () => {
  it("basePath로 시작하는 루트 경로는 내부 경로", () => {
    expect(resolveRef("/euro-digest/_next/a.js?v=1#x", "/", options)).toEqual({
      kind: "internal",
      sitePath: "/_next/a.js",
      search: "?v=1",
    });
  });

  it("basePath 자체(끝 슬래시 없음)는 사이트 루트", () => {
    expect(resolveRef("/euro-digest", "/", options)).toEqual({
      kind: "internal",
      sitePath: "/",
      search: "",
    });
  });

  it("상대 경로는 페이지 경로 기준으로 해석한다", () => {
    expect(resolveRef("../teams/", "/news/2026-10-10/", options)).toMatchObject(
      {
        kind: "internal",
        sitePath: "/news/teams/",
      },
    );
    expect(resolveRef("feed.xml", "/404.html", options)).toMatchObject({
      kind: "internal",
      sitePath: "/feed.xml",
    });
  });

  it("basePath가 빠진 루트 경로는 outside-base (GitHub Pages에서 깨짐)", () => {
    expect(resolveRef("/", "/", options)).toEqual({
      kind: "outside-base",
      pathname: "/",
    });
    expect(resolveRef("/euro-digestive/", "/", options)).toEqual({
      kind: "outside-base",
      pathname: "/euro-digestive/",
    });
  });

  it("다른 출처와 프로토콜 상대 URL은 외부", () => {
    expect(resolveRef("https://www.bbc.co.uk/sport", "/", options).kind).toBe(
      "external",
    );
    expect(resolveRef("//example.com/x.js", "/", options).kind).toBe(
      "external",
    );
  });

  it("siteOrigins에 든 절대 URL은 basePath 아래만 내부, 밖은 외부(같은 도메인의 다른 저장소)", () => {
    const withSite: ResolveOptions = {
      basePath: BASE,
      siteOrigins: ["https://sguys99.github.io"],
    };
    expect(
      resolveRef(
        "https://sguys99.github.io/euro-digest/feed.xml",
        "/",
        withSite,
      ),
    ).toEqual({
      kind: "internal",
      sitePath: "/feed.xml",
      search: "",
    });
    expect(
      resolveRef("https://sguys99.github.io/other-repo/", "/", withSite).kind,
    ).toBe("external");
  });

  it("빈 값·조각·http(s)가 아닌 스킴은 건너뛴다", () => {
    expect(resolveRef("  ", "/", options)).toEqual({
      kind: "skip",
      reason: "empty",
    });
    expect(resolveRef("#top", "/", options)).toEqual({
      kind: "skip",
      reason: "fragment",
    });
    for (const ref of [
      "mailto:a@b.c",
      "tel:010",
      "data:image/png;base64,AA",
      "javascript:void(0)",
    ]) {
      expect(resolveRef(ref, "/", options)).toEqual({
        kind: "skip",
        reason: "non-http",
      });
    }
  });

  it("해석할 수 없는 URL은 invalid", () => {
    expect(resolveRef("http://[::1", "/", options)).toEqual({
      kind: "invalid",
      ref: "http://[::1",
    });
  });

  it("basePath가 빈 값(루트 배포)이면 모든 같은 출처 경로가 내부", () => {
    expect(resolveRef("/news/", "/", { basePath: "" })).toMatchObject({
      kind: "internal",
      sitePath: "/news/",
    });
  });
});

describe("collectInternalRefs", () => {
  it("내부 대상은 경로+쿼리 단위로 합치고, 문제와 외부 개수를 따로 센다", () => {
    const html = `${NEXT_HEAD}
      <a href="/euro-digest/">홈</a><a href="/euro-digest/#today">오늘</a>
      <a href="/">basePath 누락</a><a href="https://www.bbc.co.uk/sport">BBC</a>
      <a href="mailto:a@b.c">메일</a>`;
    const result = collectInternalRefs(html, "/", options);

    expect(
      result.internal.map((target) => `${target.sitePath}${target.search}`),
    ).toEqual([
      "/_next/static/chunks/a.css",
      "/_next/static/chunks/main.js",
      "/_next/static/chunks/a.js",
      "/_next/static/chunks/b.js",
      "/_next/static/chunks/polyfill.js",
      "/",
    ]);
    expect(
      result.internal.find((target) => target.sitePath === "/")?.refs,
    ).toEqual(["a[href]=/euro-digest/", "a[href]=/euro-digest/#today"]);
    expect(
      result.internal.find((target) => target.sitePath.endsWith("main.js"))
        ?.refs,
    ).toEqual([
      "link[href]=/euro-digest/_next/static/chunks/main.js",
      "script[src]=/euro-digest/_next/static/chunks/main.js",
    ]);
    expect(result.problems).toEqual([
      {
        ref: "a[href]=/",
        reason: expect.stringContaining("basePath(/euro-digest) 밖"),
      },
    ]);
    expect(result.externalCount).toBe(1);
  });

  it("인라인 RSC 페이로드 안의 링크 모양 문자열은 검사하지 않는다", () => {
    const result = collectInternalRefs(NEXT_HEAD, "/", options);
    expect(result.problems).toEqual([]);
    expect(
      result.internal.some((target) =>
        target.sitePath.includes("not-a-real-link"),
      ),
    ).toBe(false);
  });
});
