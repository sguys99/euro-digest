import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { decodeHtmlEntities, parseTags } from "../../scripts/lib/site-refs";
import { listNewsDates, loadNewsIssue } from "../../src/lib/data/news";
import { SITE_NAME } from "../../src/lib/site";
import { basePath, outDir, siteOrigins, sitePages } from "./support/site";

// 기본 SEO e2e (M1-38 — PRD FR-124·NFR-03) — 빌드 결과(out/)의 HTML <head>와 sitemap.xml을 그대로 읽는다.
// 크롤러·링크 미리보기(카카오톡 등)는 JS를 돌리지 않으므로 정적 HTML이 검사 기준이다. 페이지 목록은 out/에서 모은다(새 라우트 자동 포함).
// - 색인 대상(noindex 아님) 페이지: title 유일 · description · canonical 1개 · og:url = canonical · OG 기본값 · twitter summary
// - noindex 페이지(404 — Next가 넣는다): robots 메타 1개(중복 없음) · canonical 없음 · sitemap 밖
// - sitemap.xml: 홈 · /about/ · 발행된 날짜 페이지 전부(`/news/`는 별칭이라 제외), 절대 URL·끝 슬래시, 모두 200, 각 페이지 canonical = 자기 URL
// - 결과 노출 0(DECISIONS D0 §5 #9): title·description·OG·twitter 문구에 스코어 모양이 없다, og:image 없음(D3에서 확정)
// - robots.txt는 만들지 않는다(프로젝트 사이트 아래는 크롤러가 읽지 않음 — M5에서 Search Console과 함께 결정)

const SITE = `${siteOrigins[0]}${basePath}`;
const DATES = listNewsDates();
const LATEST = DATES.at(-1);
/** 스코어 모양 — 숫자 사이의 하이픈·대시·쌍점·"대"(구현과 따로 둔 검사식) */
const SCORE_RE = /\d\s*[-–—:]\s*\d|\d\s*대\s*\d/;

interface HeadMeta {
  urlPath: string;
  titles: string[];
  /** name·property → 값들(같은 이름이 여러 번이면 모두) */
  meta: Map<string, string[]>;
  canonicals: string[];
}

/** out/ HTML의 <head>만 읽는다(본문의 태그 모양 문자열·body 안 link는 보지 않는다) */
function readHead(absolutePath: string, urlPath: string): HeadMeta {
  const html = readFileSync(absolutePath, "utf8");
  const end = html.indexOf("</head>");
  const head = end === -1 ? html : html.slice(0, end);
  const titles = [...head.matchAll(/<title>([^<]*)<\/title>/g)].map((m) =>
    decodeHtmlEntities(m[1] ?? ""),
  );
  const meta = new Map<string, string[]>();
  for (const tag of parseTags(head, ["meta"])) {
    const key = tag.attrs.get("name") ?? tag.attrs.get("property");
    const content = tag.attrs.get("content");
    if (key === undefined || content === undefined) continue;
    meta.set(key, [...(meta.get(key) ?? []), content]);
  }
  const canonicals = parseTags(head, ["link"])
    .filter((t) => t.attrs.get("rel") === "canonical")
    .map((t) => t.attrs.get("href") ?? "");
  return { urlPath, titles, meta, canonicals };
}

const one = (head: HeadMeta, key: string): string | undefined => {
  const values = head.meta.get(key) ?? [];
  expect(values.length, `${head.urlPath} ${key} 개수`).toBeLessThanOrEqual(1);
  return values[0];
};

const heads = sitePages().map((p) => readHead(p.absolutePath, p.urlPath));
const isNoindex = (h: HeadMeta) =>
  (h.meta.get("robots") ?? []).some((v) => /noindex/.test(v));
const indexable = heads.filter((h) => !isNoindex(h));
const noindex = heads.filter(isNoindex);

/** sitemap.xml 파싱 — <url>마다 loc·lastmod */
function readSitemap(): { loc: string; lastmod: string | null }[] {
  const xml = readFileSync(path.join(outDir, "sitemap.xml"), "utf8");
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  expect(xml).toContain(
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  );
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => {
    const body = m[1] ?? "";
    return {
      loc: decodeHtmlEntities(/<loc>([^<]*)<\/loc>/.exec(body)?.[1] ?? ""),
      lastmod: /<lastmod>([^<]*)<\/lastmod>/.exec(body)?.[1] ?? null,
    };
  });
}

test("빌드 결과 — out/sitemap.xml이 있고 robots.txt는 없다(M5 결정 전)", () => {
  expect(heads.map((h) => h.urlPath)).toContain("/");
  expect(
    existsSync(path.join(outDir, "sitemap.xml")),
    "out/sitemap.xml — 먼저 npm run build",
  ).toBe(true);
  expect(existsSync(path.join(outDir, "robots.txt"))).toBe(false);
});

test("sitemap.xml — 홈 · /about/ · 발행된 날짜 페이지 전부(오름차순), /news/ 별칭 없음, 절대 URL·끝 슬래시·중복 없음", () => {
  const entries = readSitemap();
  const locs = entries.map((e) => e.loc);
  expect(locs).toEqual([
    `${SITE}/`,
    `${SITE}/about/`,
    ...DATES.map((date) => `${SITE}/news/${date}/`),
  ]);
  expect(locs).not.toContain(`${SITE}/news/`);
  expect(new Set(locs).size).toBe(locs.length);
  for (const loc of locs) {
    expect(loc.startsWith(`${SITE}/`) && loc.endsWith("/"), loc).toBe(true);
  }
});

test("sitemap.xml lastmod — 날짜 페이지 = 그 호 generatedAt, 홈 = 최신 호 generatedAt, /about/ 없음", () => {
  const byLoc = new Map(readSitemap().map((e) => [e.loc, e.lastmod]));
  for (const date of DATES) {
    const generatedAt = loadNewsIssue(date)?.generatedAt;
    expect(byLoc.get(`${SITE}/news/${date}/`), date).toBe(generatedAt);
  }
  expect(byLoc.get(`${SITE}/`)).toBe(
    LATEST ? loadNewsIssue(LATEST)?.generatedAt : null,
  );
  expect(byLoc.get(`${SITE}/about/`)).toBeNull();
});

test("sitemap.xml의 모든 URL이 200으로 열리고, 그 페이지의 canonical이 자기 URL이다", async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "http://127.0.0.1:4173/").origin;
  const canonicalOf = new Map(
    heads.map((h) => [`${SITE}${h.urlPath}`, h.canonicals]),
  );
  for (const { loc } of readSitemap()) {
    expect(loc.startsWith(`${SITE}/`), loc).toBe(true);
    const local = `${origin}${basePath}${loc.slice(SITE.length)}`;
    const res = await request.get(local);
    expect(res.status(), local).toBe(200);
    await res.dispose();
    expect(canonicalOf.get(loc), loc).toEqual([loc]);
  }
});

test("색인 대상 페이지 — canonical 1개가 sitemap 안을 가리키고, sitemap 밖 페이지는 /news/(최신 날짜 페이지 별칭)뿐", () => {
  const locs = new Set(readSitemap().map((e) => e.loc));
  const aliases: string[] = [];
  for (const head of indexable) {
    expect(head.canonicals, head.urlPath).toHaveLength(1);
    const canonical = head.canonicals[0]!;
    expect(locs.has(canonical), `${head.urlPath} → ${canonical}`).toBe(true);
    if (canonical !== `${SITE}${head.urlPath}`) aliases.push(head.urlPath);
  }
  expect(aliases).toEqual(LATEST ? ["/news/"] : []);
  if (LATEST) {
    const news = indexable.find((h) => h.urlPath === "/news/");
    expect(news?.canonicals).toEqual([`${SITE}/news/${LATEST}/`]);
  }
  // 색인 대상 = sitemap 항목 + 별칭(새 라우트를 sitemap에 넣지 않으면 여기서 걸린다)
  expect(indexable.length).toBe(locs.size + aliases.length);
});

test("색인 대상 페이지 — title 유일·description·OG(type·site_name·locale·url = canonical·title·description)·twitter summary", () => {
  expect(indexable.length).toBeGreaterThanOrEqual(2);
  const titles = indexable.map((h) => {
    expect(h.titles, h.urlPath).toHaveLength(1);
    return h.titles[0]!;
  });
  expect(new Set(titles).size, titles.join(" | ")).toBe(titles.length);

  for (const head of indexable) {
    const title = head.titles[0]!;
    expect(title === SITE_NAME || title.endsWith(` · ${SITE_NAME}`)).toBe(true);
    const description = one(head, "description");
    expect(description?.trim(), head.urlPath).toBeTruthy();
    expect(one(head, "og:type"), head.urlPath).toBe("website");
    expect(one(head, "og:site_name"), head.urlPath).toBe(SITE_NAME);
    expect(one(head, "og:locale"), head.urlPath).toBe("ko_KR");
    expect(one(head, "og:url"), head.urlPath).toBe(head.canonicals[0]);
    expect(one(head, "og:title"), head.urlPath).toBe(title);
    expect(one(head, "og:description"), head.urlPath).toBe(description);
    expect(one(head, "twitter:card"), head.urlPath).toBe("summary");
    expect(one(head, "twitter:title"), head.urlPath).toBe(title);
    expect(one(head, "twitter:description"), head.urlPath).toBe(description);
    expect(one(head, "robots"), head.urlPath).toBeUndefined();
  }
});

test("404 — robots noindex 1개(Next가 넣는다 — 중복 없음), canonical·og:url 없음, sitemap 밖", () => {
  const paths = noindex.map((h) => h.urlPath);
  expect(paths).toContain("/404.html");
  const locs = new Set(readSitemap().map((e) => e.loc));
  for (const head of noindex) {
    expect(head.meta.get("robots"), head.urlPath).toEqual(["noindex"]);
    expect(head.canonicals, head.urlPath).toEqual([]);
    expect(head.meta.get("og:url"), head.urlPath).toBeUndefined();
    expect(locs.has(`${SITE}${head.urlPath}`), head.urlPath).toBe(false);
  }
});

test("결과 노출 0 — 모든 페이지의 title·description·OG·twitter 문구에 스코어 모양이 없고 og:image·twitter:image가 없다", () => {
  for (const head of heads) {
    const texts = [
      ...head.titles,
      ...[
        "description",
        "og:title",
        "og:description",
        "twitter:title",
        "twitter:description",
      ].flatMap((key) => head.meta.get(key) ?? []),
    ];
    expect(texts.length, head.urlPath).toBeGreaterThan(0);
    for (const text of texts) {
      expect(SCORE_RE.test(text), `${head.urlPath}: ${text}`).toBe(false);
    }
    for (const key of ["og:image", "twitter:image"]) {
      expect(head.meta.get(key), `${head.urlPath} ${key}`).toBeUndefined();
    }
  }
});
