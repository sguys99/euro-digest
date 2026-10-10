import { describe, expect, it } from "vitest";

import {
  allPassed,
  checkAssets,
  checkHome,
  checkNotFound,
  checkTrailingSlash,
  defaultSiteUrl,
  extractHtmlLang,
  extractTitle,
  formatVerifyReport,
  listStaticAssetPaths,
  missingSitePath,
  normalizeSiteUrl,
  parseVerifyDeployArgs,
  siteTarget,
  siteUrlFor,
  stripCacheBust,
  trailingSlashPaths,
  withCacheBust,
  type CheckResult,
  type FetchedResponse,
} from "../scripts/lib/deploy-verify";

const SITE = "https://sguys99.github.io/euro-digest/";
const target = siteTarget(SITE);

function response(
  status: number | null,
  body = "",
  extra: Partial<FetchedResponse> = {},
): FetchedResponse {
  return {
    url: `${SITE}x`,
    status,
    location: null,
    body,
    error: status === null ? "fetch failed" : null,
    ...extra,
  };
}

// Next 정적 export가 만드는 HTML 모양(요약)
const HOME_HTML = `<!DOCTYPE html><html lang="ko"><head><meta charSet="utf-8"/>
<link rel="stylesheet" href="/euro-digest/_next/static/chunks/a.css" data-precedence="next"/>
<link rel="preload" as="script" fetchPriority="low" href="/euro-digest/_next/static/chunks/b.js"/>
<script src="/euro-digest/_next/static/chunks/b.js" async=""></script>
<script src="/euro-digest/_next/static/chunks/c.js" async=""></script>
<title>유로 다이제스트</title></head>
<body><main><h1>유로 다이제스트</h1><a href="/euro-digest/">홈</a>
<a href="https://example.com/">외부</a></main>
<script>self.__next_f.push([1,"<script src=\\"/euro-digest/_next/static/chunks/inline.js\\">"])</script>
</body></html>`;

const NOT_FOUND_HTML = `<!DOCTYPE html><html lang="ko"><head>
<script src="/euro-digest/_next/static/chunks/b.js" async=""></script>
<script src="/euro-digest/_next/static/chunks/nf.js" async=""></script>
<title>유로 다이제스트</title></head>
<body><main><h1>페이지를 찾을 수 없습니다</h1><p><a href="/euro-digest/">홈으로 돌아가기</a></p></main></body></html>`;

// GitHub Pages 기본 404(사이트 404.html이 없거나 배포 전)
const GITHUB_DEFAULT_404 = `<!DOCTYPE html><html><head><title>Site not found · GitHub Pages</title></head>
<body><div class="container"><h1>404</h1><p><strong>There isn't a GitHub Pages site here.</strong></p>
<a href="https://help.github.com/pages/">Read the full documentation</a></div></body></html>`;

describe("parseVerifyDeployArgs", () => {
  it("인자가 없으면 SITE_URL·BASE_PATH 기본값으로 운영 주소를 만든다", () => {
    const parsed = parseVerifyDeployArgs([], {});
    expect(parsed).toEqual({
      ok: true,
      value: { siteUrl: SITE, dirs: [], help: false },
    });
  });

  it("환경변수로 기본 주소를 바꿀 수 있다(BASE_PATH 빈 값 = 루트 사이트)", () => {
    expect(
      defaultSiteUrl({ SITE_URL: "http://127.0.0.1:4173/", BASE_PATH: "/x/" }),
    ).toBe("http://127.0.0.1:4173/x/");
    expect(defaultSiteUrl({ SITE_URL: "https://a.dev", BASE_PATH: "" })).toBe(
      "https://a.dev/",
    );
  });

  it("위치 인자 URL은 끝에 / 를 붙이고 쿼리·조각을 뗀다", () => {
    const parsed = parseVerifyDeployArgs(
      ["https://sguys99.github.io/euro-digest?x=1#top"],
      {},
    );
    expect(parsed.ok && parsed.value.siteUrl).toBe(SITE);
  });

  it("--dir은 앞뒤 슬래시를 떼고 중복을 없앤다", () => {
    const parsed = parseVerifyDeployArgs(
      ["--dir", "/news/", "--dir", "news", "--dir", "teams/arsenal"],
      {},
    );
    expect(parsed.ok && parsed.value.dirs).toEqual(["news", "teams/arsenal"]);
  });

  it("잘못된 입력은 오류: URL 아님·http(s) 아님·URL 두 개·빈 --dir·모르는 옵션", () => {
    expect(parseVerifyDeployArgs(["not a url"], {}).ok).toBe(false);
    expect(parseVerifyDeployArgs(["ftp://a.dev/"], {}).ok).toBe(false);
    expect(
      parseVerifyDeployArgs(["https://a.dev/", "https://b.dev/"], {}).ok,
    ).toBe(false);
    expect(parseVerifyDeployArgs(["--dir", "/"], {}).ok).toBe(false);
    expect(parseVerifyDeployArgs(["--dir", "a?b"], {}).ok).toBe(false);
    expect(parseVerifyDeployArgs(["--verbose"], {}).ok).toBe(false);
  });

  it("--help / -h", () => {
    const parsed = parseVerifyDeployArgs(["-h"], {});
    expect(parsed.ok && parsed.value.help).toBe(true);
  });
});

describe("siteTarget · URL 헬퍼", () => {
  it("출처와 basePath를 나눈다", () => {
    expect(target.origin).toBe("https://sguys99.github.io");
    expect(target.basePath).toBe("/euro-digest");
    expect(target.homeUrl).toBe(SITE);
    expect(siteUrlFor(target, "/_next/static/a.js")).toBe(
      "https://sguys99.github.io/euro-digest/_next/static/a.js",
    );
  });

  it("루트 사이트는 basePath가 빈 값", () => {
    const root = siteTarget("https://a.dev/");
    expect(root.basePath).toBe("");
    expect(root.homeUrl).toBe("https://a.dev/");
  });

  it("normalizeSiteUrl은 http도 허용한다(로컬 미리보기 확인용)", () => {
    expect(normalizeSiteUrl("http://127.0.0.1:4173/euro-digest")).toEqual({
      ok: true,
      value: "http://127.0.0.1:4173/euro-digest/",
    });
  });

  it("캐시 우회 쿼리를 붙이고, 표시할 때는 그것만 뺀다", () => {
    expect(withCacheBust(SITE, "t1")).toBe(`${SITE}?_verify=t1`);
    expect(withCacheBust(`${SITE}?a=1`, "t1")).toBe(`${SITE}?a=1&_verify=t1`);
    expect(stripCacheBust("/euro-digest/?_verify=t1")).toBe("/euro-digest/");
    expect(stripCacheBust("/x/?a=1&_verify=t1")).toBe("/x/?a=1");
    expect(stripCacheBust("/x/?_verify=t1&a=1")).toBe("/x/?a=1");
    expect(stripCacheBust("/x/?_verify=t1#top")).toBe("/x/#top");
    expect(stripCacheBust("/x/")).toBe("/x/");
  });

  it("없는 경로는 디렉터리 모양이고 토큰을 담는다", () => {
    expect(missingSitePath("abc")).toBe("/__verify-deploy-missing-abc/");
  });
});

describe("extractTitle · extractHtmlLang", () => {
  it("제목 엔터티를 풀고 공백을 정리한다", () => {
    expect(extractTitle("<title>\n A &amp; B </title>")).toBe("A & B");
    expect(extractTitle("<!-- <title>x</title> --><p>")).toBeNull();
  });

  it("<html lang> 값을 읽는다", () => {
    expect(extractHtmlLang(HOME_HTML)).toBe("ko");
    expect(extractHtmlLang(GITHUB_DEFAULT_404)).toBeNull();
  });
});

describe("checkHome", () => {
  it("200 + lang=ko + 제목에 서비스 이름이면 통과", () => {
    const results = checkHome(response(200, HOME_HTML), "유로 다이제스트");
    expect(results).toHaveLength(3);
    expect(allPassed(results)).toBe(true);
  });

  it("200이 아니면 lang·제목 검사도 실패로 남긴다", () => {
    const results = checkHome(
      response(404, GITHUB_DEFAULT_404),
      "유로 다이제스트",
    );
    expect(results.map((result) => result.ok)).toEqual([false, false, false]);
    expect(results[0]?.actual).toBe("404");
  });

  it("lang이 ko가 아니거나 제목이 다르면 실패", () => {
    const html = HOME_HTML.replace('lang="ko"', 'lang="en"').replace(
      "<title>유로 다이제스트</title>",
      "<title>Hello</title>",
    );
    const results = checkHome(response(200, html), "유로 다이제스트");
    expect(results.map((result) => result.ok)).toEqual([true, false, false]);
    expect(results[1]?.actual).toBe("en");
    expect(results[2]?.actual).toBe('"Hello"');
  });

  it("리다이렉트(3xx)는 실패 — 홈이 다른 곳으로 넘어가면 안 된다", () => {
    const [status] = checkHome(
      response(301, "", { location: "https://other.dev/" }),
      "유로 다이제스트",
    );
    expect(status?.ok).toBe(false);
    expect(status?.actual).toBe("301 → https://other.dev/");
  });

  it("요청 자체가 실패하면 이유를 보여 준다", () => {
    const [status] = checkHome(response(null), "유로 다이제스트");
    expect(status?.ok).toBe(false);
    expect(status?.actual).toBe("요청 실패: fetch failed");
  });
});

describe("listStaticAssetPaths", () => {
  it("_next/static 참조만, 중복 없이 모은다(인라인 스크립트 안 문자열·외부·일반 링크 제외)", () => {
    expect(listStaticAssetPaths(HOME_HTML, "/", target.resolveOptions)).toEqual(
      [
        "/_next/static/chunks/a.css",
        "/_next/static/chunks/b.js",
        "/_next/static/chunks/c.js",
      ],
    );
  });

  it("같은 출처의 절대 URL·상대 경로도 해석한다", () => {
    const html = `<script src="https://sguys99.github.io/euro-digest/_next/static/x.js"></script>
<link rel="stylesheet" href="../_next/static/y.css">`;
    expect(listStaticAssetPaths(html, "/news/", target.resolveOptions)).toEqual(
      ["/_next/static/x.js", "/_next/static/y.css"],
    );
  });
});

describe("checkAssets", () => {
  it("전부 200이면 자산마다 통과 행", () => {
    const results = checkAssets([
      { sitePath: "/_next/static/a.js", response: response(200) },
      { sitePath: "/_next/static/b.css", response: response(200) },
    ]);
    expect(results.map((result) => result.target)).toEqual([
      "/_next/static/a.js",
      "/_next/static/b.css",
    ]);
    expect(allPassed(results)).toBe(true);
  });

  it("하나라도 200이 아니거나 요청 실패면 그 행이 실패", () => {
    const results = checkAssets([
      { sitePath: "/_next/static/a.js", response: response(200) },
      { sitePath: "/_next/static/b.js", response: response(404) },
      { sitePath: "/_next/static/c.js", response: response(null) },
    ]);
    expect(results.map((result) => result.ok)).toEqual([true, false, false]);
  });

  it("참조가 하나도 없으면 실패(배포 전·빈 HTML)", () => {
    const results = checkAssets([]);
    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(false);
  });
});

describe("checkNotFound", () => {
  const missing = missingSitePath("t1");

  it("404 상태 + 홈(/euro-digest/) 링크가 있으면 통과", () => {
    const results = checkNotFound(
      response(404, NOT_FOUND_HTML),
      missing,
      target,
    );
    expect(results).toHaveLength(2);
    expect(allPassed(results)).toBe(true);
  });

  it("같은 출처의 절대 URL 홈 링크도 인정한다", () => {
    const html = `<a href="https://sguys99.github.io/euro-digest/">홈</a>`;
    expect(allPassed(checkNotFound(response(404, html), missing, target))).toBe(
      true,
    );
  });

  it("GitHub 기본 404(사이트 404.html 아님)는 본문 검사 실패", () => {
    const results = checkNotFound(
      response(404, GITHUB_DEFAULT_404),
      missing,
      target,
    );
    expect(results.map((result) => result.ok)).toEqual([true, false]);
  });

  it("없는 경로가 200으로 열리면 상태 검사 실패", () => {
    const [status] = checkNotFound(
      response(200, NOT_FOUND_HTML),
      missing,
      target,
    );
    expect(status?.ok).toBe(false);
  });

  it("상대 링크(./)·basePath 누락(/) 홈 링크는 실패 — 404가 걸리는 위치마다 깨진다", () => {
    for (const href of ["./", "/"]) {
      const html = `<a href="${href}">홈</a>`;
      const [, body] = checkNotFound(response(404, html), missing, target);
      expect(body?.ok, href).toBe(false);
    }
  });
});

describe("checkTrailingSlash", () => {
  it("슬래시 붙은 경로로 3xx면 통과(상대·절대 Location, 캐시 우회 쿼리 무시)", () => {
    for (const status of [301, 302, 307, 308]) {
      expect(
        checkTrailingSlash(
          response(status, "", { location: "/euro-digest/?_verify=t1" }),
          "/euro-digest",
        ).ok,
      ).toBe(true);
    }
    const absolute = checkTrailingSlash(
      response(301, "", {
        location: "https://sguys99.github.io/euro-digest/news/",
      }),
      "/euro-digest/news",
    );
    expect(absolute.ok).toBe(true);
  });

  it("리다이렉트 없이 200이어도 통과", () => {
    expect(checkTrailingSlash(response(200), "/euro-digest").ok).toBe(true);
  });

  it("404·다른 곳으로 리다이렉트·Location 없음·요청 실패는 실패", () => {
    expect(checkTrailingSlash(response(404), "/euro-digest").ok).toBe(false);
    expect(
      checkTrailingSlash(
        response(301, "", { location: "/elsewhere/" }),
        "/euro-digest",
      ).ok,
    ).toBe(false);
    expect(checkTrailingSlash(response(301), "/euro-digest").ok).toBe(false);
    expect(checkTrailingSlash(response(null), "/euro-digest").ok).toBe(false);
  });

  it("표시용 실제 값에서는 캐시 우회 쿼리를 뺀다", () => {
    const result = checkTrailingSlash(
      response(301, "", { location: "/euro-digest/?_verify=t1" }),
      "/euro-digest",
    );
    expect(result.actual).toBe("301 → /euro-digest/");
  });
});

describe("trailingSlashPaths", () => {
  it("사이트 루트(basePath) + --dir 경로", () => {
    expect(trailingSlashPaths("/euro-digest", ["news"])).toEqual([
      "/euro-digest",
      "/euro-digest/news",
    ]);
  });

  it("루트 사이트는 루트 검사를 빼고 --dir만", () => {
    expect(trailingSlashPaths("", [])).toEqual([]);
    expect(trailingSlashPaths("", ["news"])).toEqual(["/news"]);
  });
});

describe("formatVerifyReport · allPassed", () => {
  const pass: CheckResult = {
    group: "홈",
    target: "/",
    expected: "200",
    actual: "200",
    ok: true,
  };
  const fail: CheckResult = { ...pass, group: "404", actual: "200", ok: false };

  it("통과면 항목 수, 실패면 실패 수를 요약한다", () => {
    expect(formatVerifyReport(SITE, [pass])).toContain("결과: 통과 — 1개 항목");
    const report = formatVerifyReport(SITE, [pass, fail]);
    expect(report).toContain("결과: 실패 — 2개 중 1개 실패");
    expect(report).toContain("✗ 실패");
    expect(report.split("\n")[0]).toBe(`사이트: ${SITE}`);
  });

  it("긴 값은 잘라서 표 폭을 지킨다", () => {
    const long = { ...pass, actual: "x".repeat(200) };
    const row = formatVerifyReport(SITE, [long])
      .split("\n")
      .find((line) => line.startsWith("홈"));
    expect(row).toContain("…");
    expect(row?.length).toBeLessThan(200);
  });

  it("결과가 비어 있으면 통과로 보지 않는다", () => {
    expect(allPassed([])).toBe(false);
    expect(allPassed([pass])).toBe(true);
    expect(allPassed([pass, fail])).toBe(false);
  });
});
