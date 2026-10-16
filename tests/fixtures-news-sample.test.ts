/**
 * D0 시안 입력 가드 (M0-34) — fixtures/news-sample.json(원제목 카드)·news-sample.meta.json·brief-sample.json.
 *
 * - 뉴스 카드 샘플은 NewsFileSchema를 그대로 통과해야 한다(M1 UI가 같은 로더로 읽는다).
 * - 모든 카드는 LLM을 거치지 않은 원제목+링크다: `ai:false`, `s:[]` (PRD §15 D23, M0-25).
 * - 카드의 `t`·`src[].u`는 fixtures/rss의 실제 항목 title·link와 같아야 한다(엔티티·CDATA 해제 + 앞뒤 공백 정리만, FR-20).
 * - 브리핑 샘플은 저장 스키마 미확정(M1-19)이라 테스트 안에서 모양만 확인한다(src/lib/schema에 넣지 않는다).
 *
 * XML 파서 의존성을 늘리지 않으려고 정규식으로 항목을 읽는다(fixtures-rss.test.ts와 같은 방식).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { KoreanPlayersFileSchema, NewsFileSchema } from "@/lib/schema";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const RSS_DIR = path.join(ROOT, "fixtures/rss");
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

const VARIANTS = [
  "basic",
  "cluster",
  "transfer",
  "korean",
  "result",
  "domestic",
] as const;
const REQUIRED_LANGS = ["en", "it", "es", "ko"] as const;
/** 줄당 60자 내외(FR-23) — 두 문장 줄(M0-30 샘플 66자)까지 받아 주는 상한 */
const BRIEF_LINE_MAX = 80;

// ─── fixtures/rss 항목 (정규식) ─────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s.replace(
    /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g,
    (_, e: string) => {
      if (e.startsWith("#x"))
        return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith("#"))
        return String.fromCodePoint(parseInt(e.slice(1), 10));
      const named: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
      };
      return named[e] ?? `&${e};`;
    },
  );
}

/** 요소 내용: CDATA면 그대로, 아니면 엔티티 해제. 그다음 앞뒤 공백만 정리(FR-20) */
function elementText(block: string, tag: string): string {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
  if (!m?.[1]) throw new Error(`<${tag}> 없음`);
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(m[1]);
  return (cdata ? (cdata[1] ?? "") : decodeEntities(m[1])).trim();
}

interface RssItem {
  ref: string;
  title: string;
  link: string;
}

function loadRssItems(): RssItem[] {
  return readdirSync(RSS_DIR)
    .filter((f) => f.endsWith(".xml"))
    .sort()
    .flatMap((f) => {
      const xml = readFileSync(path.join(RSS_DIR, f), "utf8");
      const id = f.slice(0, -".xml".length);
      return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map((m, pos) => ({
        ref: `${id}#${pos}`,
        title: elementText(m[0], "title"),
        link: elementText(m[0], "link"),
      }));
    });
}

// ─── 경계 파싱 (테스트가 쓰는 필드만) ─────────────────────────────────────────

const MetaSchema = z.object({
  variants: z.object(
    Object.fromEntries(VARIANTS.map((v) => [v, z.array(z.string())])) as Record<
      (typeof VARIANTS)[number],
      z.ZodArray<z.ZodString>
    >,
  ),
  labels: z.object({
    teams: z.record(
      z.string(),
      z.object({ ko: z.string(), source: z.string() }),
    ),
    players: z.record(
      z.string(),
      z.object({ ko: z.string(), source: z.string() }),
    ),
    comps: z.record(z.string(), z.object({ ko: z.string() })),
  }),
  origin: z.record(z.string(), z.object({ rep: z.string() })),
  manualFixes: z.array(z.object({ card: z.string(), reason: z.string() })),
  sourceNames: z.record(z.string(), z.string()),
});

/** 브리핑 샘플 — PRD §8.2 초안 모양(저장 스키마 아님, M1-19 확정 전) */
const BriefSampleSchema = z.object({
  _note: z.string().includes("M1-19"),
  days: z
    .array(
      z.object({
        date: z.iso.date(),
        generatedAt: z.iso.datetime(),
        runId: z.string().min(1),
        lines: z.array(
          z.object({
            text: z.string().min(1),
            ai: z.boolean(),
            refs: z.array(z.string().min(1)),
          }),
        ),
      }),
    )
    .min(1),
});

const news = NewsFileSchema.parse(readJson("fixtures/news-sample.json"));
const meta = MetaSchema.parse(readJson("fixtures/news-sample.meta.json"));
const brief = BriefSampleSchema.parse(readJson("fixtures/brief-sample.json"));
const koreanSlugs = new Set(
  KoreanPlayersFileSchema.parse(readJson("configs/korean-players.json")).map(
    (p) => p.slug,
  ),
);

describe("fixtures/news-sample.json — 원제목 카드 샘플", () => {
  const cards = news.cards;

  it("NewsFileSchema를 통과하고 카드가 15~25장이다", () => {
    expect(cards.length).toBeGreaterThanOrEqual(15);
    expect(cards.length).toBeLessThanOrEqual(25);
  });

  it("모든 카드가 ai:false이고 요약 줄이 없다(s:[])", () => {
    for (const c of cards) {
      expect(c.ai).toBe(false);
      expect(c.s).toEqual([]);
    }
  });

  it("t와 src[].u가 fixtures/rss 실제 항목의 title·link와 같다(FR-20)", () => {
    const items = loadRssItems();
    const byLink = new Map<string, RssItem[]>();
    for (const it of items)
      byLink.set(it.link, [...(byLink.get(it.link) ?? []), it]);
    for (const c of cards) {
      const rep = byLink.get(c.src[0]?.u ?? "");
      expect(rep, `${c.id} 대표 링크`).toBeDefined();
      expect(rep?.map((it) => it.title)).toContain(c.t);
      for (const s of c.src)
        expect(byLink.has(s.u), `${c.id} ${s.u}`).toBe(true);
    }
  });

  // M1-16(2026-10-16): 카드 ID 규칙은 정규화 URL 해시(scripts/lib/card-id.ts)로 바뀌었지만 이 샘플은 다시 계산하지 않는다 —
  // D0 시안 HTML·scope.md·DECISIONS.md·견본(specimen) 페이지가 이 id를 앵커로 쓰는 기록이고, 2026-10-12~14 발행 파일과
  // 같은 옛 규칙이라 '옛 규칙 ID 카드가 섞인 병합' 테스트 입력(tests/card-id.test.ts)으로도 쓴다.
  it("카드 id = c_ + sha256(대표 링크 원문) 앞 10자리(M0-34 옛 임시 규칙 그대로 — M1-16에서 재계산하지 않음)", () => {
    for (const c of cards) {
      const hash = createHash("sha256")
        .update(c.src[0]?.u ?? "")
        .digest("hex");
      expect(c.id).toBe(`c_${hash.slice(0, 10)}`);
    }
  });

  it("홈 피드 순서: imp 내림차순, 중요도 1~5가 모두 있다", () => {
    for (let i = 1; i < cards.length; i += 1) {
      expect(cards[i]?.imp ?? 0).toBeLessThanOrEqual(cards[i - 1]?.imp ?? 0);
    }
    expect(new Set(cards.map((c) => c.imp))).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it("언어 4종(en·it·es·ko)이 모두 있다", () => {
    const langs = new Set(cards.map((c) => c.lang));
    for (const lang of REQUIRED_LANGS) expect(langs.has(lang)).toBe(true);
  });

  it("kr:true 카드에는 등록 선수가 있고, 등록 선수가 있는 카드는 kr:true다(FR-60)", () => {
    for (const c of cards) {
      const registered = c.players.filter((p) => koreanSlugs.has(p));
      expect(registered.length > 0, `${c.id} kr`).toBe(c.kr);
    }
  });

  it("다출처 카드는 한 언어군 안에서만 묶였다(해외·국내를 섞지 않음, M1-15)", () => {
    const domestic = (u: string) =>
      /interfootball|footballist|besteleven/.test(new URL(u).hostname);
    for (const c of cards) {
      const kinds = new Set(c.src.map((s) => domestic(s.u)));
      expect(kinds.size, c.id).toBe(1);
      expect(domestic(c.src[0]?.u ?? "")).toBe(c.lang === "ko");
    }
  });
});

describe("fixtures/news-sample.meta.json — 시안 표시 보조", () => {
  const ids = new Set(news.cards.map((c) => c.id));

  it("D0 카드 변형 6종이 모두 있고 각 id가 카드에 존재한다", () => {
    for (const v of VARIANTS) {
      const list = meta.variants[v];
      expect(list.length, v).toBeGreaterThan(0);
      for (const id of list) expect(ids.has(id), `${v} ${id}`).toBe(true);
    }
  });

  it("변형 정의와 카드 필드가 맞는다", () => {
    const card = (id: string) => news.cards.find((c) => c.id === id);
    for (const id of meta.variants.cluster)
      expect(card(id)?.src.length).toBeGreaterThanOrEqual(2);
    for (const id of meta.variants.transfer)
      expect(card(id)?.transfer).toBeDefined();
    for (const id of meta.variants.korean) expect(card(id)?.kr).toBe(true);
    for (const id of meta.variants.result) expect(card(id)?.spoiler).toBe(true);
    for (const id of meta.variants.domestic) expect(card(id)?.lang).toBe("ko");
    const basicLangs = new Set(meta.variants.basic.map((id) => card(id)?.lang));
    for (const lang of ["en", "it", "es"])
      expect(basicLangs.has(lang)).toBe(true);
  });

  it("카드의 팀·선수·대회 태그마다 한국어 라벨이 있다", () => {
    for (const c of news.cards) {
      for (const t of c.teams) expect(meta.labels.teams[t], t).toBeDefined();
      for (const p of c.players)
        expect(meta.labels.players[p], p).toBeDefined();
      for (const k of c.comp) expect(meta.labels.comps[k], k).toBeDefined();
    }
  });

  it("모든 카드에 원천 참조가 있고, 손으로 고친 항목은 카드를 가리킨다", () => {
    for (const id of ids) expect(meta.origin[id]?.rep).toMatch(/^[a-z-]+#\d+$/);
    for (const f of meta.manualFixes) expect(ids.has(f.card)).toBe(true);
  });
});

describe("fixtures/brief-sample.json — 데이터 브리핑 샘플(D24)", () => {
  const days = brief.days;
  const lines = days.flatMap((d) => d.lines);

  it("날짜마다 1~5줄이고 날짜가 겹치지 않는다", () => {
    for (const d of days) {
      expect(d.lines.length, d.date).toBeGreaterThanOrEqual(1);
      expect(d.lines.length, d.date).toBeLessThanOrEqual(5);
    }
    expect(new Set(days.map((d) => d.date)).size).toBe(days.length);
  });

  it(`줄 길이가 ${BRIEF_LINE_MAX}자 이하다`, () => {
    for (const l of lines)
      expect(l.text.length, l.text).toBeLessThanOrEqual(BRIEF_LINE_MAX);
  });

  it("뉴스 샘플과 같은 기준일(2026-10-11)이 있다", () => {
    expect(news.date).toBe("2026-10-11");
    expect(days.map((d) => d.date)).toContain(news.date);
  });

  it("강등(ai:false) 줄과 5줄 미만인 날이 있다(D0 상태 시연)", () => {
    expect(lines.some((l) => !l.ai)).toBe(true);
    expect(days.some((d) => d.lines.length < 5)).toBe(true);
  });

  it("LLM이 쓴 줄(ai:true)은 근거 id가 있고 한자가 섞이지 않았다", () => {
    for (const l of lines.filter((x) => x.ai)) {
      expect(l.refs.length, l.text).toBeGreaterThan(0);
      expect(l.text).not.toMatch(/[㐀-鿿豈-﫿]/);
    }
  });
});
