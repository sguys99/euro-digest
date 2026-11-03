import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { decodeHtmlEntities, parseTags } from "../../scripts/lib/site-refs";
import { loadBrief } from "../../src/lib/data/brief";
import { issuePageLastModified } from "../../src/lib/data/issue";
import { listNewsDates, loadNewsIssue } from "../../src/lib/data/news";
import { listKoreanPlayerSlugs } from "../../src/lib/data/player-page";
import { listWeeklyWeeks } from "../../src/lib/data/weekly-report";
import { SITE_NAME } from "../../src/lib/site";
import {
  COMPETITION_EVENT_LIMIT,
  type JsonLdNode,
} from "../../src/lib/structured-data";
import { FIXTURES_UPCOMING } from "../../src/lib/team-view";
import { basePath, outDir, siteOrigins, sitePages } from "./support/site";

// 기본 SEO e2e (M1-38 — PRD FR-124·NFR-03) — 빌드 결과(out/)의 HTML <head>와 sitemap.xml을 그대로 읽는다.
// 크롤러·링크 미리보기(카카오톡 등)는 JS를 돌리지 않으므로 정적 HTML이 검사 기준이다. 페이지 목록은 out/에서 모은다(새 라우트 자동 포함).
// - 색인 대상(noindex 아님) 페이지: title 유일 · description · canonical 1개 · og:url = canonical · OG 기본값 · twitter summary_large_image
// - noindex 페이지(404 — Next가 넣는다): robots 메타 1개(중복 없음) · canonical 없음 · sitemap 밖
// - sitemap.xml: 홈 · /about/ · 발행된 날짜 페이지 전부(`/news/`는 별칭이라 제외), 절대 URL·끝 슬래시, 모두 200, 각 페이지 canonical = 자기 URL
// - 결과 노출 0(DECISIONS D0 §5 #9): title·description·OG·twitter 문구(og:image:alt 포함)에 스코어 모양이 없다. OG 이미지 자체는
//   tests/e2e/og.spec.ts(M5-01)
// - robots.txt는 만들지 않는다(프로젝트 사이트 아래는 크롤러가 읽지 않음 — PRD §15 D59 · D74, Search Console에 sitemap 직접 제출)
// - 구조화 데이터(M5-03 — D74): 정적 HTML의 <script type="application/ld+json">을 파싱해 유형별 구조를 본다(외부 검증 서비스 없음) —
//   홈 WebSite + Organization · 날짜 호 CollectionPage(+ 이날의 5줄 NewsArticle) · 팀 SportsTeam(+ 다가오는 경기) · 대회 · /tonight/
//   SportsEvent(다가오는 경기만) · 한국 선수 상세 Person, 그 밖의 페이지 · noindex 페이지는 없음. 스코어 필드 · 스코어 모양 글자 없음.

const SITE = `${siteOrigins[0]}${basePath}`;
const DATES = listNewsDates();
const LATEST = DATES.at(-1);
// 한국 선수 상세(M3-10) — 설정의 선수 전원(설정 순서)
const PLAYER_SLUGS = listKoreanPlayerSlugs();
// 주간 리포트(M3-12) — 색인은 늘, 주 페이지는 발행된 주(오름차순)
const WEEKS = listWeeklyWeeks();
/** 스코어 모양 — 숫자 사이의 하이픈·대시·쌍점·"대"(구현과 따로 둔 검사식) */
const SCORE_RE = /\d\s*[-–—:]\s*\d|\d\s*대\s*\d/;
/** 시즌 표기 "2026-27"(이어지는 해만 — M2-10 대회 페이지 제목)은 스코어가 아니다 — 검사 전에 지운다 */
function withoutSeasons(text: string): string {
  return text.replace(/(?<!\d)(\d{4})[-–](\d{2})(?!\d)/g, (whole, a, b) =>
    (Number(a) + 1) % 100 === Number(b) ? " " : whole,
  );
}
/** 대회 페이지(M2-10) — 데이터 파일이 있는 대회만 sitemap에 든다(설정 순서) */
const COMPETITION_SEGMENTS = [
  "epl",
  "laliga",
  "seriea",
  "bundesliga",
  "ligue1",
  "ucl",
].filter((c) => existsSync(path.resolve("data/competitions", `${c}.json`)));
/** 팀 페이지(M2-13) — 팀 파일(data/teams)마다, slug 순 */
const TEAM_SLUGS = existsSync(path.resolve("data/teams"))
  ? readdirSync(path.resolve("data/teams"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5))
      .sort()
  : [];

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

test("빌드 결과 — out/sitemap.xml이 있고 robots.txt는 없다(D59 · D74 — 프로젝트 사이트 아래 robots.txt는 크롤러가 읽지 않음)", () => {
  expect(heads.map((h) => h.urlPath)).toContain("/");
  expect(
    existsSync(path.join(outDir, "sitemap.xml")),
    "out/sitemap.xml — 먼저 npm run build",
  ).toBe(true);
  expect(existsSync(path.join(outDir, "robots.txt"))).toBe(false);
});

test("sitemap.xml — 홈 · /about/ · /tonight/(M2-14) · 대회 페이지(M2-10) · 팀 페이지(M2-13) · 한국 선수 목록(M3-09)·상세(M3-10)·주간 리포트(M3-12) · 대표팀(M3-13) · 이적(M4-04) · 발행된 날짜 페이지 전부(오름차순), /news/ 별칭 없음, 절대 URL·끝 슬래시·중복 없음", () => {
  const entries = readSitemap();
  const locs = entries.map((e) => e.loc);
  expect(locs).toEqual([
    `${SITE}/`,
    `${SITE}/about/`,
    `${SITE}/tonight/`,
    ...COMPETITION_SEGMENTS.map((c) => `${SITE}/competitions/${c}/`),
    ...TEAM_SLUGS.map((t) => `${SITE}/teams/${t}/`),
    `${SITE}/korean-players/`,
    ...PLAYER_SLUGS.map((p) => `${SITE}/korean-players/${p}/`),
    `${SITE}/korean-players/weekly/`,
    ...WEEKS.map((w) => `${SITE}/korean-players/weekly/${w}/`),
    // 대표팀(M3-13)
    `${SITE}/national-team/`,
    // 이적(M4-04)
    `${SITE}/transfers/`,
    ...DATES.map((date) => `${SITE}/news/${date}/`),
  ]);
  expect(locs).not.toContain(`${SITE}/news/`);
  expect(new Set(locs).size).toBe(locs.length);
  for (const loc of locs) {
    expect(loc.startsWith(`${SITE}/`) && loc.endsWith("/"), loc).toBe(true);
  }
});

test("sitemap.xml lastmod — 날짜 페이지 = 그 호 지면 수정 시각(뉴스 generatedAt · 삭제 요청 반영 · 브리핑 generatedAt 중 늦은 것 — M5-03), 홈 = 최신 호와 같은 값, /about/ 없음", () => {
  const byLoc = new Map(readSitemap().map((e) => [e.loc, e.lastmod]));
  for (const date of DATES) {
    const lastModified = issuePageLastModified(date);
    expect(byLoc.get(`${SITE}/news/${date}/`), date).toBe(lastModified);
    // generatedAt보다 앞서지 않는다
    expect(
      Date.parse(lastModified ?? "") >=
        Date.parse(loadNewsIssue(date)?.generatedAt ?? ""),
      date,
    ).toBe(true);
  }
  expect(byLoc.get(`${SITE}/`)).toBe(
    LATEST ? issuePageLastModified(LATEST) : null,
  );
  expect(byLoc.get(`${SITE}/about/`)).toBeNull();
  // /tonight/(M2-14)는 발행 빌드마다 다시 고른다 — 홈과 같은 lastmod
  expect(byLoc.get(`${SITE}/tonight/`)).toBe(byLoc.get(`${SITE}/`));
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

test("색인 대상 페이지 — title 유일·description·OG(type·site_name·locale·url = canonical·title·description)·twitter summary_large_image", () => {
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
    expect(one(head, "twitter:card"), head.urlPath).toBe("summary_large_image");
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

test("결과 노출 0 — 모든 페이지의 title·description·OG·twitter 문구(이미지 alt 포함)에 스코어 모양이 없다", () => {
  for (const head of heads) {
    const texts = [
      ...head.titles,
      ...[
        "description",
        "og:title",
        "og:description",
        "twitter:title",
        "twitter:description",
        "og:image:alt",
        "twitter:image:alt",
      ].flatMap((key) => head.meta.get(key) ?? []),
    ];
    expect(texts.length, head.urlPath).toBeGreaterThan(0);
    for (const text of texts) {
      expect(
        SCORE_RE.test(withoutSeasons(text)),
        `${head.urlPath}: ${text}`,
      ).toBe(false);
    }
  }
});

// ─── 구조화 데이터(M5-03 — NFR-03 · D74) ─────────────────────────────────────

/** out/ HTML 전체의 JSON-LD 스크립트(파싱 실패는 그대로 던진다) */
function readJsonLd(absolutePath: string): JsonLdNode[] {
  const html = readFileSync(absolutePath, "utf8");
  return [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ].map((m) => JSON.parse(m[1] ?? "") as JsonLdNode);
}

/** 최상위 노드 → 노드 목록(@graph면 펼친다) */
function nodesOf(data: JsonLdNode): JsonLdNode[] {
  const graph = data["@graph"];
  return Array.isArray(graph) ? (graph as JsonLdNode[]) : [data];
}

/** 트리의 [키, 값] 전부 */
function entriesOf(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) return value.flatMap(entriesOf);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [
      [k, v] as [string, unknown],
      ...entriesOf(v),
    ]);
  }
  return [];
}

const pages = sitePages();
const jsonLdOf = new Map(
  pages.map((p) => [p.urlPath, readJsonLd(p.absolutePath)]),
);
const typesOf = (urlPath: string): string[] =>
  (jsonLdOf.get(urlPath) ?? []).flatMap(nodesOf).map((n) => String(n["@type"]));
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

test("구조화 데이터 — 모든 스크립트가 JSON으로 파싱되고 @context = schema.org · 주소는 우리 사이트 · 스코어 필드와 스코어 모양 글자 없음", () => {
  let scripts = 0;
  for (const [urlPath, list] of jsonLdOf) {
    for (const data of list) {
      scripts += 1;
      expect(data["@context"], urlPath).toBe("https://schema.org");
      for (const [key, value] of entriesOf(data)) {
        expect(
          ["score", "homeScore", "awayScore", "result", "winner", "logo"],
          `${urlPath} ${key}`,
        ).not.toContain(key);
        if (typeof value !== "string") continue;
        if (
          ["name", "headline", "description", "alternateName"].includes(key)
        ) {
          expect(
            SCORE_RE.test(withoutSeasons(value)),
            `${urlPath} ${key}: ${value}`,
          ).toBe(false);
        }
        if (
          /^https?:/.test(value) &&
          key !== "eventStatus" &&
          key !== "@context"
        ) {
          expect(
            value.startsWith(`${SITE}/`),
            `${urlPath} ${key}: ${value}`,
          ).toBe(true);
        }
      }
    }
  }
  expect(scripts).toBeGreaterThan(0);
});

test("구조화 데이터 — 색인 대상 페이지의 유형(홈 · 날짜 호 · 팀 · 대회 · /tonight/ · 한국 선수 상세), 그 밖과 noindex 페이지는 없음", () => {
  const expected = (urlPath: string): "some" | "none" =>
    urlPath === "/" ||
    /^\/news\/\d{4}-\d{2}-\d{2}\/$/.test(urlPath) ||
    /^\/teams\/[^/]+\/$/.test(urlPath) ||
    /^\/competitions\/[^/]+\/$/.test(urlPath) ||
    urlPath === "/tonight/" ||
    (/^\/korean-players\/[^/]+\/$/.test(urlPath) &&
      urlPath !== "/korean-players/weekly/")
      ? "some"
      : "none";
  for (const head of noindex) {
    expect(jsonLdOf.get(head.urlPath), head.urlPath).toEqual([]);
  }
  for (const head of indexable) {
    const list = jsonLdOf.get(head.urlPath) ?? [];
    if (expected(head.urlPath) === "none") {
      expect(list, head.urlPath).toEqual([]);
    } else {
      // 대회 · /tonight/은 다가오는 경기가 없으면 스크립트가 없을 수 있다(0 또는 1개)
      expect(list.length, head.urlPath).toBeLessThanOrEqual(1);
    }
  }
  expect(typesOf("/")).toEqual(["WebSite", "Organization"]);
  const home = nodesOf(jsonLdOf.get("/")![0]!);
  expect(home[0]).toMatchObject({ url: `${SITE}/`, name: SITE_NAME });
  expect(home[0]).not.toHaveProperty("potentialAction");
  for (const slug of PLAYER_SLUGS) {
    expect(typesOf(`/korean-players/${slug}/`), slug).toEqual(["Person"]);
  }
});

test("구조화 데이터 — 날짜 호 = CollectionPage(@id = canonical · dateModified = sitemap lastmod), 이날의 5줄 줄이 있는 호만 NewsArticle, 카드 목록 없음", () => {
  const lastmods = new Map(readSitemap().map((e) => [e.loc, e.lastmod]));
  for (const date of DATES) {
    const urlPath = `/news/${date}/`;
    const list = jsonLdOf.get(urlPath) ?? [];
    expect(list, urlPath).toHaveLength(1);
    const page = list[0]!;
    expect(page["@type"], urlPath).toBe("CollectionPage");
    expect(page["@id"], urlPath).toBe(`${SITE}${urlPath}`);
    expect(page.dateModified, urlPath).toBe(lastmods.get(`${SITE}${urlPath}`));
    expect(JSON.stringify(page), urlPath).not.toContain("ItemList");
    const lines = loadBrief(date)?.lines.length ?? 0;
    const parts = (page.hasPart ?? []) as JsonLdNode[];
    expect(
      parts.map((p) => p["@type"]),
      urlPath,
    ).toEqual(lines > 0 ? ["NewsArticle"] : []);
    if (lines > 0) {
      const article = parts[0]!;
      expect(article.headline, urlPath).toMatch(/^이날의 5줄 · /);
      expect(String(article.datePublished), urlPath).toMatch(ISO_UTC_RE);
      expect(article.author, urlPath).toEqual([
        expect.objectContaining({ "@type": "Organization", name: SITE_NAME }),
      ]);
      expect(article, urlPath).not.toHaveProperty("articleBody");
    }
  }
  // /news/(최신 호 별칭)는 canonical 쪽(날짜 페이지)이 싣는다
  expect(jsonLdOf.get("/news/") ?? [], "/news/").toEqual([]);
});

test("구조화 데이터 — 팀 SportsTeam(url = canonical · 로고 없음) + 다가오는 경기 ≤ 4, 대회 SportsEvent ≤ 10, 경기는 미래 시각 · 예정/연기 상태 · 홈 · 원정 팀", () => {
  const checkEvent = (urlPath: string, node: JsonLdNode) => {
    expect(node["@type"], urlPath).toBe("SportsEvent");
    expect(String(node.startDate), urlPath).toMatch(ISO_UTC_RE);
    expect(
      [
        "https://schema.org/EventScheduled",
        "https://schema.org/EventPostponed",
      ],
      urlPath,
    ).toContain(node.eventStatus);
    for (const side of ["homeTeam", "awayTeam"] as const) {
      expect((node[side] as JsonLdNode)["@type"], urlPath).toBe("SportsTeam");
      expect(String((node[side] as JsonLdNode).name), urlPath).not.toBe("");
    }
  };
  for (const slug of TEAM_SLUGS) {
    const urlPath = `/teams/${slug}/`;
    const nodes = (jsonLdOf.get(urlPath) ?? []).flatMap(nodesOf);
    expect(nodes[0]?.["@type"], urlPath).toBe("SportsTeam");
    expect(nodes[0]?.url, urlPath).toBe(`${SITE}${urlPath}`);
    expect(nodes[0]?.sport, urlPath).toBe("Soccer");
    expect(nodes[0], urlPath).not.toHaveProperty("image");
    const events = nodes.slice(1);
    expect(events.length, urlPath).toBeLessThanOrEqual(FIXTURES_UPCOMING);
    for (const e of events) checkEvent(urlPath, e);
    // 이 팀이 홈이나 원정
    for (const e of events) {
      const ids = [e.homeTeam, e.awayTeam].map((t) => (t as JsonLdNode)["@id"]);
      expect(ids, urlPath).toContain(`${SITE}${urlPath}#team`);
    }
  }
  for (const urlPath of [
    ...COMPETITION_SEGMENTS.map((c) => `/competitions/${c}/`),
    "/tonight/",
  ]) {
    const nodes = (jsonLdOf.get(urlPath) ?? []).flatMap(nodesOf);
    if (urlPath !== "/tonight/") {
      expect(nodes.length, urlPath).toBeLessThanOrEqual(
        COMPETITION_EVENT_LIMIT,
      );
    }
    const starts = nodes.map((n) => Date.parse(String(n.startDate)));
    expect(starts, urlPath).toEqual([...starts].sort((a, b) => a - b));
    for (const n of nodes) checkEvent(urlPath, n);
  }
});

test("canonical — 절대 URL · 끝 슬래시 · 쿼리 · 조각 없음(필터 쿼리 /news/?comp=…는 정적 HTML이라 canonical에 들어가지 않는다)", () => {
  for (const head of indexable) {
    const canonical = head.canonicals[0] ?? "";
    expect(canonical.startsWith(`${SITE}/`), head.urlPath).toBe(true);
    expect(canonical.endsWith("/"), head.urlPath).toBe(true);
    expect(canonical, head.urlPath).not.toMatch(/[?#]/);
  }
});
