/**
 * M1-12 — URL 정규화 + 정규화 URL 해시 (PRD FR-04 "utm·트래킹 파라미터 제거, AMP→원본", FR-20 "정규화는 중복 판정·카드 ID에만").
 *
 * 필수 항목: utm_*·fbclid·gclid·BBC at_* 제거 · AMP(경로 조각·`.amp` 접미사·쿼리·AMP 캐시·amp. 호스트·국내 CMS AMP 페이지) ·
 * 호스트 대소문자·www.·기본 포트 · 끝 슬래시 · 조각(#) · http/https · 국내 `idxno` 보존 · 순서만 다른 쿼리 ·
 * 서로 다른 기사는 다른 키(보수적 — 애매한 파라미터는 지우지 않음) · 해시 형식(seen-urls 키 = UrlHashSchema) ·
 * 실데이터(fixtures/rss 69건)에서 잘못 합쳐지는 링크 0건.
 * 네트워크 없음 — 순수 함수.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { UrlHashSchema } from "@/lib/schema";

import {
  hashNormalizedUrl,
  isNoiseParam,
  normalizeUrl,
  URL_HASH_HEX_LENGTH,
  urlHash,
} from "../scripts/lib/url-normalize";

const BBC_ARTICLE = "https://bbc.co.uk/sport/football/articles/cqn73g3pvezdo";

describe("normalizeUrl — 추적 파라미터", () => {
  it.each([
    [
      "BBC 피드 링크(at_medium·at_campaign)",
      "https://www.bbc.co.uk/sport/football/articles/cqn73g3pvezdo?at_medium=RSS&at_campaign=rss",
    ],
    [
      "utm_* 전부(source·medium·campaign·term·content·id)",
      "https://www.bbc.co.uk/sport/football/articles/cqn73g3pvezdo?utm_source=twitter&utm_medium=social&utm_campaign=x&utm_term=y&utm_content=z&utm_id=1",
    ],
    [
      "fbclid",
      "https://www.bbc.co.uk/sport/football/articles/cqn73g3pvezdo?fbclid=IwAR0abc",
    ],
    [
      "gclid·msclkid·igshid·mc_cid",
      "https://www.bbc.co.uk/sport/football/articles/cqn73g3pvezdo?gclid=x&msclkid=y&igshid=z&mc_cid=w",
    ],
    [
      "이름 대소문자 무시(UTM_Source·FBCLID)",
      "https://www.bbc.co.uk/sport/football/articles/cqn73g3pvezdo?UTM_Source=x&FBCLID=y",
    ],
    [
      "BBC 링크 + 공유 추적이 섞임",
      "https://www.bbc.co.uk/sport/football/articles/cqn73g3pvezdo?at_medium=RSS&at_campaign=rss&utm_source=whatsapp&fbclid=1",
    ],
  ])("%s → 지운다", (_label, url) => {
    expect(normalizeUrl(url)).toBe(BBC_ARTICLE);
  });

  it("국내 기사 식별 쿼리(idxno)는 남기고 추적 파라미터만 지운다", () => {
    expect(
      normalizeUrl(
        "https://www.interfootball.co.kr/news/articleView.html?idxno=696174&utm_source=naver&fbclid=1",
      ),
    ).toBe("https://interfootball.co.kr/news/articleView.html?idxno=696174");
    // idxno가 다르면 다른 기사
    expect(
      urlHash(
        "https://www.interfootball.co.kr/news/articleView.html?idxno=696174",
      ),
    ).not.toBe(
      urlHash(
        "https://www.interfootball.co.kr/news/articleView.html?idxno=696160",
      ),
    );
  });

  it("뜻이 애매한 파라미터(ref·source·share·cmp·r·page)는 지우지 않는다 — 다른 기사를 합치지 않게(보수적)", () => {
    for (const name of ["ref", "source", "share", "cmp", "r", "page", "id"]) {
      const a = `https://example.com/story?${name}=1`;
      const b = `https://example.com/story?${name}=2`;
      expect(normalizeUrl(a)).toBe(`https://example.com/story?${name}=1`);
      expect(urlHash(a)).not.toBe(urlHash(b));
    }
  });

  it("남는 쿼리는 이름순 — 순서만 다른 같은 URL은 같은 키, 같은 이름은 원래 순서 유지", () => {
    expect(normalizeUrl("https://example.com/s?b=2&a=1")).toBe(
      "https://example.com/s?a=1&b=2",
    );
    expect(urlHash("https://example.com/s?b=2&a=1")).toBe(
      urlHash("https://example.com/s?a=1&b=2"),
    );
    expect(normalizeUrl("https://example.com/s?t=2&a=1&t=1")).toBe(
      "https://example.com/s?a=1&t=2&t=1",
    );
  });

  it("isNoiseParam — outputType은 값이 amp일 때만", () => {
    expect(isNoiseParam("outputType", "amp")).toBe(true);
    expect(isNoiseParam("outputType", "AMP")).toBe(true);
    expect(isNoiseParam("outputType", "json")).toBe(false);
    expect(isNoiseParam("at_medium", "RSS")).toBe(true);
    expect(isNoiseParam("idxno", "696174")).toBe(false);
  });
});

describe("normalizeUrl — AMP → 원본", () => {
  const ORIGINAL = "https://example.com/2026/10/10/story";

  it.each([
    ["경로 끝 /amp/", "https://www.example.com/2026/10/10/story/amp/"],
    ["경로 끝 /amp", "https://www.example.com/2026/10/10/story/amp"],
    ["경로 앞 /amp/", "https://www.example.com/amp/2026/10/10/story"],
    ["쿼리 ?amp", "https://www.example.com/2026/10/10/story?amp"],
    ["쿼리 ?amp=1", "https://www.example.com/2026/10/10/story?amp=1"],
    [
      "쿼리 outputType=amp",
      "https://www.example.com/2026/10/10/story?outputType=amp",
    ],
    ["amp. 호스트", "https://amp.example.com/2026/10/10/story"],
    [
      "Google AMP 뷰어",
      "https://www.google.com/amp/s/www.example.com/2026/10/10/story/amp/",
    ],
    [
      "AMP 캐시(cdn.ampproject.org) + 캐시 파라미터",
      "https://www-example-com.cdn.ampproject.org/c/s/www.example.com/2026/10/10/story/amp?amp_js_v=0.1&usqp=mq331AQ",
    ],
  ])("%s → 원본", (_label, url) => {
    expect(normalizeUrl(url)).toBe(ORIGINAL);
  });

  it("BBC `.amp` 접미사 → 원본 기사 경로", () => {
    expect(
      normalizeUrl(
        "https://www.bbc.co.uk/sport/football/articles/cqn73g3pvezdo.amp",
      ),
    ).toBe(BBC_ARTICLE);
  });

  it("`story.amp.html` → `story.html`", () => {
    expect(normalizeUrl("https://example.com/news/story.amp.html")).toBe(
      "https://example.com/news/story.html",
    );
  });

  it("국내 CMS AMP 페이지 articleViewAmp.html → articleView.html(idxno 보존)", () => {
    expect(
      urlHash(
        "https://www.interfootball.co.kr/news/articleViewAmp.html?idxno=696174",
      ),
    ).toBe(
      urlHash(
        "https://www.interfootball.co.kr/news/articleView.html?idxno=696174",
      ),
    );
  });

  it("amp가 들어간 다른 낱말(slug·호스트)은 건드리지 않는다", () => {
    expect(normalizeUrl("https://example.com/news/amped-up-ampere")).toBe(
      "https://example.com/news/amped-up-ampere",
    );
    expect(normalizeUrl("https://ampfootball.com/a")).toBe(
      "https://ampfootball.com/a",
    );
    expect(normalizeUrl("https://example.com/a?ampm=pm")).toBe(
      "https://example.com/a?ampm=pm",
    );
  });
});

describe("normalizeUrl — 스킴·호스트·경로·조각", () => {
  it("호스트 대소문자·www.·끝 점·기본 포트는 무시, 경로 대소문자는 구별한다", () => {
    expect(normalizeUrl("https://WWW.Example.COM./Path/Story")).toBe(
      "https://example.com/Path/Story",
    );
    expect(normalizeUrl("https://example.com:443/a")).toBe(
      "https://example.com/a",
    );
    expect(normalizeUrl("http://example.com:80/a")).toBe(
      "https://example.com/a",
    );
    expect(normalizeUrl("https://example.com:8443/a")).toBe(
      "https://example.com:8443/a",
    );
    expect(urlHash("https://example.com/Path")).not.toBe(
      urlHash("https://example.com/path"),
    );
  });

  it("http와 https는 같은 기사(풋볼리스트 피드는 http:// 링크)", () => {
    expect(
      urlHash(
        "http://www.footballist.co.kr/news/articleView.html?idxno=215736",
      ),
    ).toBe(
      urlHash(
        "https://www.footballist.co.kr/news/articleView.html?idxno=215736",
      ),
    );
  });

  it("m. 모바일 호스트는 데스크톱과 같다 — 남는 호스트에 점이 없으면 떼지 않는다", () => {
    expect(normalizeUrl("https://m.example.com/story")).toBe(
      "https://example.com/story",
    );
    expect(normalizeUrl("https://www.com/a")).toBe("https://www.com/a");
  });

  it("끝 슬래시 제거(루트 제외)", () => {
    expect(normalizeUrl("https://example.com/a/b/")).toBe(
      "https://example.com/a/b",
    );
    expect(
      normalizeUrl("https://www.nytimes.com/athletic/fixture/synthetic-0/"),
    ).toBe("https://nytimes.com/athletic/fixture/synthetic-0");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
    expect(normalizeUrl("https://example.com")).toBe("https://example.com/");
  });

  it("조각(#) 제거", () => {
    expect(normalizeUrl("https://example.com/a#comments")).toBe(
      "https://example.com/a",
    );
    expect(normalizeUrl("https://example.com/a?x=1#top")).toBe(
      "https://example.com/a?x=1",
    );
  });

  it("퍼센트 인코딩 16진수 대소문자·한글 경로는 같은 키", () => {
    expect(urlHash("https://example.com/caf%c3%a9")).toBe(
      urlHash("https://example.com/caf%C3%A9"),
    );
    expect(urlHash("https://example.com/café")).toBe(
      urlHash("https://example.com/caf%C3%A9"),
    );
    expect(urlHash("https://example.com/뉴스/1")).toBe(
      urlHash("https://example.com/%EB%89%B4%EC%8A%A4/1"),
    );
  });

  it("앞뒤 공백은 정리, 파싱할 수 없는 값은 그대로(던지지 않음)", () => {
    expect(normalizeUrl("  https://example.com/a  ")).toBe(
      "https://example.com/a",
    );
    expect(normalizeUrl("not a url")).toBe("not a url");
    expect(normalizeUrl("mailto:a@example.com")).toBe("mailto:a@example.com");
  });

  it("한 번에 모두 — http·www·AMP·추적·조각", () => {
    expect(
      normalizeUrl(
        "http://www.bbc.co.uk/sport/football/articles/cqn73g3pvezdo.amp?at_medium=RSS&at_campaign=rss#comments",
      ),
    ).toBe(BBC_ARTICLE);
  });

  it("멱등 — 정규화 결과를 다시 정규화해도 같다", () => {
    for (const url of [
      "http://www.bbc.co.uk/sport/football/articles/cqn73g3pvezdo.amp?at_medium=RSS",
      "https://www.interfootball.co.kr/news/articleViewAmp.html?idxno=696174&utm_source=x",
      "https://www.google.com/amp/s/www.example.com/a/b/amp/",
    ]) {
      const once = normalizeUrl(url);
      expect(normalizeUrl(once)).toBe(once);
    }
  });
});

describe("urlHash — seen-urls 키(부록 A 11)", () => {
  it("16진수 소문자 16자리 = UrlHashSchema, 결정적", () => {
    const key = urlHash(
      "https://www.bbc.co.uk/sport/football/articles/cqn73g3pvezdo?at_medium=RSS&at_campaign=rss",
    );
    expect(key).toHaveLength(URL_HASH_HEX_LENGTH);
    expect(UrlHashSchema.safeParse(key).success).toBe(true);
    expect(key).toBe(
      urlHash(
        "https://www.bbc.co.uk/sport/football/articles/cqn73g3pvezdo?at_medium=RSS&at_campaign=rss",
      ),
    );
  });

  it("= sha256(정규화 URL) 앞 16자리 — 카드 ID(M1-16)가 앞 10자리를 쓰면 키의 접두사", () => {
    const url = "https://www.bbc.co.uk/sport/football/articles/x?at_medium=RSS";
    expect(urlHash(url)).toBe(hashNormalizedUrl(normalizeUrl(url)));
    // sha256("https://bbc.co.uk/sport/football/articles/x") 앞 16자리 — coreutils sha256sum으로 따로 계산한 값
    expect(urlHash(url)).toBe("aa715e7ea6a8df99");
  });

  it("실측 사례(2026-10-12·10-13 발행 파일에 같은 카드) — 같은 링크는 같은 키", () => {
    const link =
      "https://www.bbc.co.uk/news/articles/c8x23ekvp3ywo?at_medium=RSS&at_campaign=rss";
    expect(urlHash(link)).toBe(
      urlHash("https://www.bbc.co.uk/news/articles/c8x23ekvp3ywo"),
    );
  });
});

describe("fixtures/rss 실데이터 (M0-33 69건)", () => {
  const index = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../fixtures/rss/index.json", import.meta.url)),
      "utf8",
    ),
  ) as {
    sources: Array<{ id: string; items: Array<{ link: string }> }>;
    duplicateLinks: Array<{ link: string; refs: string[] }>;
  };
  const links = index.sources.flatMap((s) => s.items.map((i) => i.link));

  it("서로 다른 원문 링크는 서로 다른 키 — 잘못 합쳐지는 링크 0건", () => {
    const rawUnique = new Set(links);
    const keys = new Set([...rawUnique].map(urlHash));
    expect(keys.size).toBe(rawUnique.size);
  });

  it("index.json의 중복 링크 묶음(피드 간·피드 안)은 같은 키, 그 밖의 링크와는 다른 키", () => {
    const linkByRef = new Map<string, string>(
      index.sources.flatMap((s) =>
        s.items.map((item, pos): [string, string] => [
          `${s.id}#${pos}`,
          item.link,
        ]),
      ),
    );
    expect(index.duplicateLinks.length).toBeGreaterThan(0);
    const dupKeys = new Set<string>();
    for (const dup of index.duplicateLinks) {
      const keys = new Set(dup.refs.map((ref) => urlHash(linkByRef.get(ref)!)));
      expect(keys).toEqual(new Set([urlHash(dup.link)]));
      dupKeys.add(urlHash(dup.link));
    }
    // 고유 키 수 = 항목 수 − (묶음마다 항목 수 − 1)
    const extra = index.duplicateLinks.reduce(
      (sum, d) => sum + d.refs.length - 1,
      0,
    );
    expect(new Set(links.map(urlHash)).size).toBe(links.length - extra);
    expect(dupKeys.size).toBe(index.duplicateLinks.length);
  });

  it("BBC 링크는 추적 파라미터가 빠지고, 국내 링크는 idxno가 남는다", () => {
    for (const link of links) {
      const normalized = normalizeUrl(link);
      expect(normalized).not.toMatch(/[?&](?:at_|utm_)/);
      expect(normalized.startsWith("https://")).toBe(true);
      const idxno = /[?&]idxno=(\d+)/.exec(link)?.[1];
      if (idxno) expect(normalized).toContain(`?idxno=${idxno}`);
    }
  });
});
