/**
 * fixtures/rss/ 가드 (M0-33) — 실제 RSS 수집 샘플이 공개 저장소 규칙을 지키는지 검사한다.
 *
 * - 기사 본문·요약문·이미지 요소가 없어야 한다(CLAUDE.md §1-5·§1-6, PRD §15 D23·D25 — 요약문은 표시·저장 안 함).
 * - index.json(수집 메타)과 실제 XML 항목 수가 맞아야 한다.
 * - 소스 id는 configs/sources.json의 수집 대상(enabled && terms_checked)과 같아야 한다.
 * - 언어 4종(en·it·es·ko)이 모두 있어야 한다(D0 시안·M1-17 언어별 분류 테스트 입력).
 *
 * XML 파서 의존성을 늘리지 않으려고 정규식·문자열 검사만 쓴다(rss-parser는 M1 설치 예정).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { SourcesFileSchema } from "@/lib/schema";
import { isUtcIso } from "@/lib/time";

const RSS_DIR = fileURLToPath(new URL("../fixtures/rss/", import.meta.url));
const SOURCES_PATH = fileURLToPath(
  new URL("../configs/sources.json", import.meta.url),
);

/** 공개 저장소에 두면 안 되는 요소(본문·요약·미디어·첨부). `<content`는 `<content:encoded`도 덮는다. */
const FORBIDDEN_MARKERS = [
  "<description",
  "<content:encoded",
  "<summary",
  "<content",
  "<media:",
  "<enclosure",
] as const;

/** 이미지 URL을 담는 채널 요소(BBC·ESPN `<image>`, 팟캐스트 `itunes:`·`googleplay:`). */
const IMAGE_MARKERS = ["<image", "<itunes:", "<googleplay:"] as const;

const REQUIRED_LANGS = ["en", "it", "es", "ko"] as const;

// index.json 경계 파싱 — 테스트가 쓰는 필드만 검사하고 나머지는 통과시킨다.
const IndexItemSchema = z.object({
  pos: z.number().int().min(0),
  feedPos: z.number().int().min(0),
  title: z.string().min(1),
  link: z.string().regex(/^https?:\/\//),
  pubDate: z.string().min(1),
  tags: z.array(z.string().min(1)),
});
const IndexSourceSchema = z.object({
  id: z.string(),
  url: z.string(),
  lang: z.string(),
  httpStatus: z.number().int().nullable(),
  format: z.string(),
  itemsOriginal: z.number().int().min(0),
  itemsKept: z.number().int().min(0),
  error: z.string().nullable(),
  items: z.array(IndexItemSchema),
});
const IndexSchema = z.object({
  task: z.literal("M0-33"),
  collectedAt: z.string().refine(isUtcIso, "UTC ISO(Z) 형식이어야 한다"),
  removed: z.object({ elements: z.array(z.string()) }),
  sources: z.array(IndexSourceSchema),
  coverage: z.object({
    clusters: z.record(
      z.string(),
      z.object({ note: z.string(), refs: z.array(z.string()) }),
    ),
  }),
});
type FixtureIndex = z.infer<typeof IndexSchema>;

function loadIndex(): FixtureIndex {
  const raw: unknown = JSON.parse(
    readFileSync(path.join(RSS_DIR, "index.json"), "utf8"),
  );
  return IndexSchema.parse(raw);
}

/** fixtures/rss/*.xml → { id(파일명), text } */
function loadXmlFiles(): { id: string; text: string }[] {
  return readdirSync(RSS_DIR)
    .filter((f) => f.endsWith(".xml"))
    .sort()
    .map((f) => ({
      id: f.slice(0, -".xml".length),
      text: readFileSync(path.join(RSS_DIR, f), "utf8"),
    }));
}

/** 수집 대상 소스(enabled && terms_checked) — CLAUDE.md §6.4 */
function collectTargets() {
  const raw: unknown = JSON.parse(readFileSync(SOURCES_PATH, "utf8"));
  return SourcesFileSchema.parse(raw).filter(
    (s) => s.enabled && s.terms_checked,
  );
}

/** CDATA·주석을 지운 마크업 — 태그 균형·엔티티 검사용 */
function stripOpaque(xml: string): string {
  return xml
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

/** 의존성 없는 최소 정형성 검사: 여닫는 태그 짝, 엔티티 형식. 문제 목록을 돌려준다. */
function wellFormedProblems(xml: string): string[] {
  const problems: string[] = [];
  const body = stripOpaque(xml);
  const stack: string[] = [];
  // 속성값 안의 '>'·'/'에 속지 않게 따옴표 구간을 한 덩어리로 읽는다.
  const tagRe = /<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  for (const m of body.matchAll(tagRe)) {
    const [, closing, name, attrs = ""] = m;
    if (!name) continue;
    if (attrs.trimEnd().endsWith("/")) continue; // 빈 요소 <x/>
    if (closing) {
      const top = stack.pop();
      if (top !== name) problems.push(`</${name}>가 <${top ?? "없음"}>를 닫음`);
    } else {
      stack.push(name);
    }
  }
  if (stack.length > 0) problems.push(`닫히지 않은 요소: ${stack.join(", ")}`);
  const badAmp = body.match(
    /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g,
  );
  if (badAmp) problems.push(`잘못된 & 엔티티 ${badAmp.length}개`);
  return problems;
}

function countItems(xml: string): number {
  return stripOpaque(xml).match(/<item[\s>]/g)?.length ?? 0;
}

/** 링크가 XML 원문에 있는지 — 원문은 `&amp;` 또는 CDATA로 쓸 수 있다. */
function xmlHasLink(xml: string, link: string): boolean {
  return xml.includes(link) || xml.includes(link.replaceAll("&", "&amp;"));
}

describe("fixtures/rss — 본문·요약·이미지 금지", () => {
  const files = loadXmlFiles();

  it("XML 파일이 있다", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.id, f.text] as const))(
    "%s: 본문·요약·미디어 요소가 없다",
    (_id, text) => {
      const found = FORBIDDEN_MARKERS.filter((m) => text.includes(m));
      expect(found).toEqual([]);
    },
  );

  it.each(files.map((f) => [f.id, f.text] as const))(
    "%s: 이미지 요소·이미지 URL이 없다",
    (_id, text) => {
      const found = IMAGE_MARKERS.filter((m) => text.includes(m));
      expect(found).toEqual([]);
      expect(text).not.toMatch(/\.(?:jpe?g|png|gif|webp|avif)(?:[?"'<\s]|$)/i);
    },
  );

  it.each(files.map((f) => [f.id, f.text] as const))(
    "%s: RSS 2.0이고 태그 짝·엔티티가 맞다",
    (_id, text) => {
      expect(text.startsWith("<?xml")).toBe(true);
      expect(text).toMatch(/<rss\b[^>]*\bversion="2\.0"/);
      expect(text.match(/<channel[\s>]/g)).toHaveLength(1);
      expect(wellFormedProblems(text)).toEqual([]);
    },
  );
});

describe("fixtures/rss/index.json — 수집 메타", () => {
  const index = loadIndex();
  const files = loadXmlFiles();
  const xmlById = new Map(files.map((f) => [f.id, f.text]));

  it("소스 id가 sources.json 수집 대상(enabled && terms_checked)·XML 파일과 같다", () => {
    const targets = collectTargets();
    const targetIds = targets.map((s) => s.id).sort();
    expect(index.sources.map((s) => s.id).sort()).toEqual(targetIds);
    expect(files.map((f) => f.id).sort()).toEqual(targetIds);
    // URL·언어도 설정과 일치(소스 URL 하드코딩 없이 설정을 그대로 따랐는지)
    for (const s of index.sources) {
      const t = targets.find((x) => x.id === s.id);
      expect(s.url).toBe(t?.url);
      expect(s.lang).toBe(t?.lang);
    }
  });

  it("보존 항목 합계가 50~70이고 소스별로 실제 XML 항목 수와 일치한다", () => {
    let total = 0;
    for (const s of index.sources) {
      const xml = xmlById.get(s.id) ?? "";
      expect(s.items).toHaveLength(s.itemsKept);
      expect(countItems(xml)).toBe(s.itemsKept);
      expect(s.itemsKept).toBeLessThanOrEqual(s.itemsOriginal);
      total += s.itemsKept;
    }
    expect(total).toBeGreaterThanOrEqual(50);
    expect(total).toBeLessThanOrEqual(70);
  });

  it("실패 기록이 일관되고, 성공한 소스는 HTTP 200·rss-2.0이다", () => {
    for (const s of index.sources) {
      if (s.error === null) {
        expect(s.httpStatus).toBe(200);
        expect(s.format).toBe("rss-2.0");
      } else {
        expect(s.itemsKept).toBe(0);
      }
    }
  });

  it("항목의 링크가 XML 원문에 있고, 위치·언어 태그가 맞다", () => {
    for (const s of index.sources) {
      const xml = xmlById.get(s.id) ?? "";
      s.items.forEach((item, i) => {
        expect(item.pos).toBe(i);
        expect(xmlHasLink(xml, item.link)).toBe(true);
        expect(item.tags).toContain(`lang:${s.lang}`);
      });
    }
  });

  it("언어 4종(en·it·es·ko)이 모두 있다", () => {
    const langs = new Set(
      index.sources.filter((s) => s.itemsKept > 0).map((s) => s.lang),
    );
    for (const lang of REQUIRED_LANGS) expect(langs.has(lang)).toBe(true);
  });

  it("제거 요소 목록에 본문·요약 요소가 기록돼 있다", () => {
    expect(index.removed.elements).toEqual(
      expect.arrayContaining(["description", "content:encoded"]),
    );
  });

  it("클러스터 메모는 실제 항목을 가리키고 2개 이상 소스를 묶는다", () => {
    const refs = new Set(
      index.sources.flatMap((s) => s.items.map((it) => `${s.id}#${it.pos}`)),
    );
    const clusters = Object.entries(index.coverage.clusters);
    expect(clusters.length).toBeGreaterThan(0);
    for (const [, c] of clusters) {
      for (const r of c.refs) expect(refs.has(r)).toBe(true);
      expect(new Set(c.refs.map((r) => r.split("#")[0])).size).toBeGreaterThan(
        1,
      );
    }
  });

  it("M0-34 카드 변형에 필요한 커버리지 태그가 있다(이적·한국 선수·경기 결과)", () => {
    const tags = index.sources.flatMap((s) => s.items.flatMap((it) => it.tags));
    expect(tags.some((t) => t.startsWith("transfer:"))).toBe(true);
    expect(tags.some((t) => t.startsWith("korean-player:"))).toBe(true);
    expect(tags).toContain("match-result");
  });
});
