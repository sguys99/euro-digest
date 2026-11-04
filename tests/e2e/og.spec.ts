import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { pngSize } from "../../scripts/lib/og-png";
import { decodeHtmlEntities, parseTags } from "../../scripts/lib/site-refs";
import { listNewsDates } from "../../src/lib/data/news";
import { OG_PAGES } from "../../src/lib/og";
import { SITE_NAME, SITE_TAGLINE } from "../../src/lib/site";
import { basePath, outDir, siteOrigins, sitePages } from "./support/site";

// OG 이미지 e2e (M5-01 — PRD DR-10 · §15 D71 ②, DESIGN §9.3 D3 링크 미리보기 메타). 빌드 결과(out/)의 HTML <head>와 out/og/ PNG를 읽는다.
// 링크 미리보기(카카오톡 · X 등)는 JS를 돌리지 않으므로 정적 HTML이 기준이다. 페이지 목록은 out/에서 모은다(새 라우트 자동 포함).
// - 모든 페이지(404 · /offline/ 포함): og:image 1개(절대 URL · basePath · /og/ 아래 PNG) · width 1200 · height 630 · type image/png · alt,
//   twitter:card summary_large_image · twitter:image = og:image · twitter:image:alt = og:image:alt
// - 쪽 → 이미지: 홈 = 기본 · /news/ = 최신 호 날짜 · 날짜 아카이브 = 그 날짜 · 대회 · 팀 = 자기 것 · 고정 쪽 = 쪽 이름형 · 한국 선수 상세 ·
//   주간 리포트 · 그 밖 = 기본(2026-11-03 사용자 결정)
// - 가리키는 파일이 out/에 있고 1200×630 PNG, 로컬 서버에서 200 image/png. out/og/의 PNG는 모두 어느 쪽이 가리킨다(고아 없음)
// - alt 문형(기본 · 날짜 · 쪽 이름형 · 대회 · 팀). 결과 노출 0은 tests/e2e/seo.spec.ts(alt 포함) · tests/og.test.ts(이미지 안 글자)

const SITE = `${siteOrigins[0]}${basePath}`;
const LATEST = listNewsDates().at(-1);

interface OgHead {
  urlPath: string;
  title: string;
  meta: Map<string, string[]>;
}

function readHead(absolutePath: string, urlPath: string): OgHead {
  const html = readFileSync(absolutePath, "utf8");
  const end = html.indexOf("</head>");
  const head = end === -1 ? html : html.slice(0, end);
  const meta = new Map<string, string[]>();
  for (const tag of parseTags(head, ["meta"])) {
    const key = tag.attrs.get("name") ?? tag.attrs.get("property");
    const content = tag.attrs.get("content");
    if (key === undefined || content === undefined) continue;
    meta.set(key, [...(meta.get(key) ?? []), content]);
  }
  const title = decodeHtmlEntities(
    /<title>([^<]*)<\/title>/.exec(head)?.[1] ?? "",
  );
  return { urlPath, title, meta };
}

const heads = sitePages().map((p) => readHead(p.absolutePath, p.urlPath));

function only(head: OgHead, key: string): string {
  const values = head.meta.get(key) ?? [];
  expect(values, `${head.urlPath} ${key}`).toHaveLength(1);
  return values[0]!;
}

/**
 * 쪽 → 기대 이미지 경로(basePath 없음). 그 카드의 PNG가 빌드 결과에 없으면 기본 OG로 접힌다(M5-13 — PRD §15 D77: 발행 경로의 굽기
 * 강등. src/lib/seo.ts `bakedOgCard`). CI 빌드는 엄격 모드라 아래 '빌드 결과' 테스트가 날짜 · 쪽 이름형 PNG가 있는지 따로 본다.
 */
function expectedOg(urlPath: string): string {
  const wanted = wantedOg(urlPath);
  return outPngSet.has(wanted) ? wanted : "/og/default.png";
}

/** 쪽 → 그 쪽 카드의 이미지 경로(접기 전) */
function wantedOg(urlPath: string): string {
  if (urlPath === "/news/" && LATEST) return `/og/news/${LATEST}.png`;
  const date = /^\/news\/(\d{4}-\d{2}-\d{2})\/$/.exec(urlPath)?.[1];
  if (date) return `/og/news/${date}.png`;
  const comp = /^\/competitions\/([a-z0-9]+)\/$/.exec(urlPath)?.[1];
  if (comp) return `/og/competitions/${comp}.png`;
  const team = /^\/teams\/([a-z0-9-]+)\/$/.exec(urlPath)?.[1];
  if (team) return `/og/teams/${team}.png`;
  const page = /^\/([a-z-]+)\/$/.exec(urlPath)?.[1];
  if (page && page in OG_PAGES) return `/og/pages/${page}.png`;
  return "/og/default.png";
}

/** out/og 아래 PNG 전부(사이트 경로) */
function outOgPngs(dir: string = path.join(outDir, "og")): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return outOgPngs(full);
    return e.name.endsWith(".png")
      ? [`/${path.relative(outDir, full).split(path.sep).join("/")}`]
      : [];
  });
}

const outPngSet = new Set(outOgPngs());

test("빌드 결과 — out/og/에 기본 · 쪽 이름형 · 날짜 · 대회 · 팀 OG가 있다", () => {
  const files = new Set(outOgPngs());
  expect(files.has("/og/default.png"), "out/og — 먼저 npm run build").toBe(
    true,
  );
  for (const name of Object.keys(OG_PAGES)) {
    expect(files.has(`/og/pages/${name}.png`), name).toBe(true);
  }
  if (LATEST) expect(files.has(`/og/news/${LATEST}.png`)).toBe(true);
});

test("모든 페이지 — og:image(절대 URL · basePath) · 1200×630 · png · alt, twitter summary_large_image · 같은 이미지 · 같은 alt, 쪽마다 정한 이미지", () => {
  expect(heads.length).toBeGreaterThan(10);
  for (const head of heads) {
    const image = only(head, "og:image");
    expect(
      image.startsWith(`${SITE}/og/`) && image.endsWith(".png"),
      image,
    ).toBe(true);
    expect(image.slice(SITE.length), head.urlPath).toBe(
      expectedOg(head.urlPath),
    );
    expect(only(head, "og:image:width"), head.urlPath).toBe("1200");
    expect(only(head, "og:image:height"), head.urlPath).toBe("630");
    expect(only(head, "og:image:type"), head.urlPath).toBe("image/png");
    const alt = only(head, "og:image:alt");
    expect(alt.startsWith(SITE_NAME), `${head.urlPath}: ${alt}`).toBe(true);
    expect(only(head, "twitter:card"), head.urlPath).toBe(
      "summary_large_image",
    );
    expect(only(head, "twitter:image"), head.urlPath).toBe(image);
    expect(only(head, "twitter:image:alt"), head.urlPath).toBe(alt);
  }
});

test("alt 문형 — 기본 · 날짜 · 쪽 이름형(= 문서 제목 앞부분) · 대회 · 팀", () => {
  for (const head of heads) {
    const image = only(head, "og:image").slice(SITE.length);
    const alt = only(head, "og:image:alt");
    if (image === "/og/default.png") {
      expect(alt, head.urlPath).toBe(`${SITE_NAME} — ${SITE_TAGLINE}`);
    } else if (image.startsWith("/og/news/")) {
      expect(alt, head.urlPath).toMatch(
        new RegExp(
          `^${SITE_NAME} 제 \\d+호, \\d{4}년 \\d{1,2}월 \\d{1,2}일 \\([일월화수목금토]\\)$`,
        ),
      );
    } else if (image.startsWith("/og/pages/")) {
      const pageTitle = head.title.replace(` · ${SITE_NAME}`, "");
      expect(alt, head.urlPath).toBe(`${SITE_NAME} · ${pageTitle}`);
    } else if (image.startsWith("/og/competitions/")) {
      expect(alt, head.urlPath).toMatch(
        new RegExp(`^${SITE_NAME} · .+ \\d{4}-\\d{2} 시즌$`),
      );
    } else {
      expect(alt, head.urlPath).toMatch(
        new RegExp(`^${SITE_NAME} · .+ \\([A-Z0-9]{2,4}\\)( · .+)?$`),
      );
    }
  }
});

test("가리키는 이미지가 out/에 있고 1200×630 PNG — out/og의 PNG는 모두 어느 쪽이 가리킨다(고아 없음)", () => {
  const referenced = new Set(
    heads.map((h) => only(h, "og:image").slice(SITE.length)),
  );
  for (const p of referenced) {
    const file = path.join(outDir, p);
    expect(existsSync(file), p).toBe(true);
    expect(pngSize(readFileSync(file)), p).toEqual({
      width: 1200,
      height: 630,
    });
  }
  expect([...referenced].sort()).toEqual(outOgPngs().sort());
});

test("이미지가 로컬 서버(basePath 아래)에서 200 image/png로 열린다", async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "http://127.0.0.1:4173/").origin;
  const referenced = [
    ...new Set(heads.map((h) => only(h, "og:image").slice(SITE.length))),
  ];
  expect(referenced.length).toBeGreaterThan(10);
  for (const p of referenced) {
    const res = await request.get(`${origin}${basePath}${p}`);
    expect(res.status(), p).toBe(200);
    expect(res.headers()["content-type"], p).toMatch(/^image\/png/);
    await res.dispose();
  }
});
