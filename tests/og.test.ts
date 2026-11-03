/**
 * OG 이미지 (plan M5-01 — PRD DR-10 · §15 D13 · D71 ②⑤, DESIGN §9.3 D3 · §2.10 · §3.7)
 * - `kitLetterFill` — 팀 OG 거대 약어 채움(상의 → 하의 → 잉크 중 크림 면 대비 5.3 이상인 첫 색), 111팀 최저 ≥ 5.3
 * - `og:image:alt` 문형 5가지(기본 · 날짜 · 쪽 이름형 · 대회 · 팀), 결과 노출 0(alt · 이미지 안 글자 모두 `hasScoreLike` 통과)
 * - 템플릿 마크업 글자 = `ogTexts`(이미지에 다른 글자가 끼지 않는다) · 서브셋 커버리지(한글 면 = EuroDigest Sans, 숫자 · 라틴 면 = Barlow)
 * - PNG 입력 해시 꼬리표(tEXt) 왕복, 커밋된 public/og가 지금 입력과 같다(빌드 · 배포가 다시 굽지 않는다 — 고아 PNG 없음)
 * 빌드 결과(out/ 메타 · 이미지 200 · 1200×630)는 e2e tests/e2e/og.spec.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadOgCards } from "@/lib/data/og";
import { WEB_FONT_FACES } from "@/lib/fonts";
import {
  contrastRatio,
  KIT_LETTER_MIN_CONTRAST,
  kitLetterFill,
} from "@/lib/kit-contrast";
import {
  competitionOgCard,
  DEFAULT_OG_CARD,
  ogFullNameLine,
  newsOgCard,
  OG_PAGES,
  ogAlt,
  ogImageOf,
  ogTexts,
  pageOgCard,
  teamOgCard,
  type OgCard,
  type OgPageName,
} from "@/lib/og";
import { artifacts } from "@/lib/paths";
import { TeamColorsFileSchema } from "@/lib/schema/configs";
import { hasScoreLike } from "@/lib/seo";
import { OG_COLORS } from "@/lib/theme";

import {
  OG_HASH_KEY,
  pngSize,
  readOgHash,
  writeOgHash,
} from "../scripts/lib/og-png";
import { existingOgPngs, ogFileOf, planOgImages } from "../scripts/lib/og-plan";
import { escapeHtml, ogCardHtml } from "../scripts/lib/og-template";

import { readWoff2, type Woff2Font } from "./support/woff2";

const CREAM = OG_COLORS.cream.face;
const INK = OG_COLORS.cream.ink;

const teamColors = TeamColorsFileSchema.parse(
  JSON.parse(readFileSync(path.resolve("configs/team-colors.json"), "utf8")),
);

describe("kitLetterFill — 팀 OG 거대 약어 채움 (D71 ⑤)", () => {
  it("상의가 하한 이상이면 상의, 아니면 하의, 둘 다 아니면 잉크 — 색은 대문자로", () => {
    expect(kitLetterFill("#3d1e5c", "#ffffff", CREAM)).toBe("#3D1E5C");
    expect(kitLetterFill("#FFFFFF", "#000000", CREAM)).toBe("#000000");
    expect(kitLetterFill("#FFFFFF", "#FFD700", CREAM)).toBe(INK);
    expect(KIT_LETTER_MIN_CONTRAST).toBe(5.3);
    // 하한 인자 — 시안 C(3.0)에서는 빨간 상의가 그대로 남는다
    expect(kitLetterFill("#DC052D", "#FFFFFF", CREAM, 3)).toBe("#DC052D");
    expect(kitLetterFill("#DC052D", "#FFFFFF", CREAM)).toBe(INK);
  });

  it(`configs/team-colors.json 전 팀(${Object.keys(teamColors).length}) — 크림 면 대비 최저 ≥ 5.3, 채움은 상의 · 하의 · 잉크 중 하나`, () => {
    const rows = Object.entries(teamColors).map(([slug, badge]) => {
      const fill = kitLetterFill(badge.colors[0], badge.colors[1], CREAM);
      return { slug, fill, ratio: contrastRatio(fill, CREAM), badge };
    });
    expect(rows.length).toBeGreaterThanOrEqual(100);
    const low = rows.filter((r) => r.ratio < 5.3).map((r) => r.slug);
    expect(low).toEqual([]);
    for (const r of rows) {
      expect(
        [r.badge.colors[0], r.badge.colors[1], INK].map((c) => c.toUpperCase()),
        r.slug,
      ).toContain(r.fill);
    }
    // 시안 견본(DECISIONS D3 #9): 바이에른 = 잉크(빨간 상의), 묀헨글라트바흐 = 하의(흰 상의), 최저 = 크리스털 팰리스 5.32
    const by = new Map(rows.map((r) => [r.slug, r]));
    if (by.has("bayern-munchen"))
      expect(by.get("bayern-munchen")?.fill).toBe(INK);
    if (by.has("borussia-monchengladbach")) {
      expect(by.get("borussia-monchengladbach")?.fill).toBe("#000000");
    }
    const min = Math.min(...rows.map((r) => r.ratio));
    expect(min).toBeGreaterThanOrEqual(5.3);
  });
});

const COMP = {
  id: "BUNDESLIGA",
  nameKo: "분데스리가",
  nameEn: "Bundesliga",
  shortKo: "분데스",
  season: 2026,
} as const;
const UCL = {
  id: "UCL",
  nameKo: "UEFA 챔피언스리그",
  nameEn: "UEFA Champions League",
  shortKo: "UCL",
  season: 2026,
} as const;
const BAYERN = teamOgCard(
  {
    slug: "bayern-munchen",
    name: "바이에른 뮌헨",
    short: "FCB",
    colors: ["#DC052D", "#FFFFFF"],
  },
  { nameEn: "FC Bayern München", comp: "BUNDESLIGA", alsoIn: ["UCL"] },
  [COMP, UCL],
);

describe("og:image:alt 문형 · 경로 (DESIGN §9.3 D3 링크 미리보기 메타)", () => {
  it("기본 · 날짜 · 쪽 이름형 · 대회 · 팀", () => {
    expect(ogAlt(DEFAULT_OG_CARD)).toBe(
      "유로 다이제스트 — 매일 아침, 밤사이 유럽 축구를 한눈에.",
    );
    expect(ogAlt(newsOgCard("2026-11-02"))).toBe(
      "유로 다이제스트 제 22호, 2026년 11월 2일 (월)",
    );
    expect(ogAlt(pageOgCard("tonight"))).toBe(
      "유로 다이제스트 · 오늘 밤 볼 경기",
    );
    expect(ogAlt(competitionOgCard(COMP))).toBe(
      "유로 다이제스트 · 분데스리가 2026-27 시즌",
    );
    expect(ogAlt(BAYERN)).toBe(
      "유로 다이제스트 · 바이에른 뮌헨 (FCB) · 분데스리가 · UEFA 챔피언스리그",
    );
  });

  it("경로 — /og/default · news/{date} · pages/{name} · competitions/{comp} · teams/{team}", () => {
    const at = (card: OgCard) => artifacts.ogImage(ogImageOf(card));
    expect(at(DEFAULT_OG_CARD)).toBe("/og/default.png");
    expect(at(newsOgCard("2026-11-02"))).toBe("/og/news/2026-11-02.png");
    expect(at(pageOgCard("national-team"))).toBe("/og/pages/national-team.png");
    expect(at(competitionOgCard(UCL))).toBe("/og/competitions/ucl.png");
    expect(at(BAYERN)).toBe("/og/teams/bayern-munchen.png");
  });

  it("창간일 전 날짜 · 배지 색이 없는 팀은 기본 OG로 접힌다(값을 지어내지 않는다)", () => {
    expect(newsOgCard("2026-10-01")).toEqual(DEFAULT_OG_CARD);
    expect(
      teamOgCard(
        { slug: "x-fc", name: "X", short: "", colors: null },
        { nameEn: "X FC", comp: "EPL", alsoIn: [] },
        [],
      ),
    ).toEqual(DEFAULT_OG_CARD);
  });

  it("쪽 이름형은 고정 쪽만 — 한국 선수 상세 · 주간 리포트는 목록에 없다(기본 OG, 2026-11-03 사용자 결정)", () => {
    expect(Object.keys(OG_PAGES).sort()).toEqual(
      [
        "about",
        "korean-players",
        "my",
        "national-team",
        "privacy",
        "search",
        "status",
        "tonight",
        "transfers",
      ].sort(),
    );
  });

  it('마이 쪽 제목은 "마이 팀"(내비 라벨 "마이"와 다름 — 2026-11-03 사용자 결정)', () => {
    expect(OG_PAGES.my).toBe("마이 팀");
    expect(ogAlt(pageOgCard("my"))).toBe("유로 다이제스트 · 마이 팀");
    expect(ogAlt(pageOgCard("status"))).toBe("유로 다이제스트 · 발행 상태");
    expect(ogAlt(pageOgCard("privacy"))).toBe(
      "유로 다이제스트 · 개인정보 처리방침",
    );
  });
});

describe("대회 OG 정식 이름 줄 — 거대 약칭과 글자 그대로 같으면 숨김 (2026-11-03 사용자 결정)", () => {
  const LALIGA = {
    id: "LALIGA",
    nameKo: "라리가",
    nameEn: "LaLiga",
    shortKo: "라리가",
    season: 2026,
  } as const;
  const SERIEA = {
    id: "SERIEA",
    nameKo: "세리에 A",
    nameEn: "Serie A",
    shortKo: "세리에A",
    season: 2026,
  } as const;

  it('라리가는 줄이 없다(여백) — 이미지 글자에 "라리가"가 한 번만, alt는 정식 이름 그대로', () => {
    const card = competitionOgCard(LALIGA);
    expect(ogFullNameLine(LALIGA)).toEqual([]);
    expect(ogCardHtml(card)).not.toContain("ogc__name");
    expect(
      textNodes(ogCardHtml(card)).filter((t) => t === "라리가"),
    ).toHaveLength(1);
    expect(ogAlt(card)).toBe("유로 다이제스트 · 라리가 2026-27 시즌");
  });

  it("띄어쓰기만 다른 세리에A ↔ 세리에 A, 라틴 약칭 UCL · 다른 대회는 정식 이름 줄을 그대로 싣는다", () => {
    for (const config of [SERIEA, COMP, UCL]) {
      expect(ogFullNameLine(config), config.id).toEqual([config.nameKo]);
      expect(ogCardHtml(competitionOgCard(config)), config.id).toContain(
        `<p class="ogc__name">${config.nameKo}</p>`,
      );
    }
  });
});

/** 마크업의 글자 조각(태그 사이 텍스트, 공백 정리 · 엔티티 풀기) */
function textNodes(html: string): string[] {
  return [...html.matchAll(/>([^<]+)</g)]
    .map((m) =>
      (m[1] ?? "")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .trim(),
    )
    .filter((t) => t !== "");
}

const cards = loadOgCards();

describe("이미지 안 글자 — 템플릿 = ogTexts, 결과 노출 0, 서브셋 커버리지 (DESIGN §3.7)", () => {
  it(`실제 카드 ${cards.length}장 + 견본 — 마크업 글자 조각이 ogTexts와 같다`, () => {
    for (const { path: p, card } of [
      ...cards,
      { path: "sample", card: BAYERN },
    ]) {
      const texts = ogTexts(card);
      expect(textNodes(ogCardHtml(card)).sort(), p).toEqual(
        [...texts.sans, ...texts.numeric].sort(),
      );
    }
  });

  it("결과 노출 0 — alt와 이미지 안 글자 모두 스코어 모양이 없다", () => {
    expect(cards.length).toBeGreaterThan(10);
    for (const { path: p, card } of cards) {
      const texts = ogTexts(card);
      for (const text of [ogAlt(card), ...texts.sans, ...texts.numeric]) {
        expect(hasScoreLike(text), `${p}: ${text}`).toBe(false);
      }
    }
  });

  it("서브셋 커버리지 — 한글 면 글자는 EuroDigest Sans 400 · 800, 숫자 · 라틴 면 글자는 Barlow Condensed 600 · 800에 있다", () => {
    const font = (family: string, weight: number): Woff2Font => {
      const face = WEB_FONT_FACES.find(
        (f) => f.family === family && f.weight === weight,
      );
      if (!face) throw new Error(`${family} ${weight} 없음`);
      return readWoff2(path.resolve("public", face.path.replace(/^\//, "")));
    };
    const sans = [font("EuroDigest Sans", 400), font("EuroDigest Sans", 800)];
    const latin = [
      font("Barlow Condensed", 600),
      font("Barlow Condensed", 800),
    ];
    const missing = (texts: string[], fonts: Woff2Font[]): string[] => {
      const chars = new Set<string>();
      for (const t of texts)
        for (const c of t) if (!/\s/u.test(c)) chars.add(c);
      return [...chars].filter((c) =>
        fonts.some((f) => !f.cmap.has(c.codePointAt(0) ?? -1)),
      );
    };
    const all = [...cards.map((c) => c.card), BAYERN];
    const sansTexts = all.flatMap((c) => ogTexts(c).sans);
    const numericTexts = all.flatMap((c) => ogTexts(c).numeric);
    expect(missing(sansTexts, sans)).toEqual([]);
    expect(missing(numericTexts, latin)).toEqual([]);
  });

  it('escapeHtml — 팀 · 대회 이름의 &·<·>·" 이스케이프', () => {
    expect(escapeHtml(`A & B <"C">`)).toBe("A &amp; B &lt;&quot;C&quot;&gt;");
  });
});

describe("카드 목록 (src/lib/data/og.ts)", () => {
  it("기본 1 · 쪽 이름형 전부 · 대회 6 · 팀 파일 수 · 발행된 호 — 경로 중복 없음, 모두 /og/ 아래 PNG", () => {
    const paths = cards.map((c) => c.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("/og/default.png");
    for (const name of Object.keys(OG_PAGES) as OgPageName[]) {
      expect(paths).toContain(`/og/pages/${name}.png`);
    }
    expect(paths.filter((p) => p.startsWith("/og/competitions/"))).toHaveLength(
      6,
    );
    for (const p of paths) expect(p).toMatch(/^\/og\/[a-z0-9/-]+\.png$/);
  });
});

/** 1×1 투명 PNG(IHDR · IDAT · IEND) */
const TINY = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

describe("PNG 입력 해시 꼬리표 (scripts/lib/og-png.ts)", () => {
  const h1 = "a".repeat(64);
  const h2 = "b".repeat(64);

  it("적고 읽는다 · 다시 적으면 바뀐다(꼬리표는 하나) · 크기는 그대로", () => {
    expect(readOgHash(TINY)).toBeNull();
    const once = writeOgHash(TINY, h1);
    expect(readOgHash(once)).toBe(h1);
    const twice = writeOgHash(once, h2);
    expect(readOgHash(twice)).toBe(h2);
    expect(twice.toString("latin1").split(OG_HASH_KEY).length - 1).toBe(1);
    expect(pngSize(twice)).toEqual({ width: 1, height: 1 });
    // IEND가 마지막 청크
    expect(twice.subarray(-8, -4).toString("latin1")).toBe("IEND");
  });

  it("PNG가 아니면 읽기는 null, 쓰기는 던진다 · 해시 형식 검사", () => {
    expect(readOgHash(Buffer.from("not a png"))).toBeNull();
    expect(pngSize(Buffer.from("not a png"))).toBeNull();
    expect(() => writeOgHash(Buffer.from("x"), h1)).toThrow();
    expect(() => writeOgHash(TINY, "xyz")).toThrow(/해시 형식/);
  });
});

describe("커밋된 public/og — 지금 입력과 같다 (빌드 · 배포가 다시 굽지 않는다)", () => {
  it("모든 카드의 PNG가 있고 1200×630이며 입력 해시가 같다, 목록 밖 PNG가 없다 — 깨지면 `npm run build:og` 뒤 public/og를 커밋", () => {
    const plan = planOgImages();
    expect(plan.stale.map((s) => s.path)).toEqual([]);
    expect(plan.orphans).toEqual([]);
    expect(existingOgPngs()).toHaveLength(plan.items.length);
    for (const item of plan.items) {
      const png = readFileSync(ogFileOf(item.path));
      expect(pngSize(png), item.path).toEqual({ width: 1200, height: 630 });
    }
  });
});
