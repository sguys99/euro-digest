/**
 * 웹폰트 self-host 검사 (D0-11, PRD DR-03·DR-11, DESIGN.md §3.1·§3.2·§11.3)
 * - public/fonts의 실제 woff2를 읽어(tests/support/woff2.ts) 패밀리·굵기·OFL 예약 글꼴명·라이선스 동봉을 확인한다.
 * - src/lib/fonts.ts에 기록한 메트릭이 파일 실측과 같은지, 폴백 override 계산이 맞는지 다시 계산해 본다.
 * - @font-face CSS(swap·basePath)와 preload 대상(DESIGN §11.3), DESIGN §3.1 폰트 스택과의 정합을 본다.
 * 글자 커버리지는 tests/fonts-coverage.test.ts.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BARLOW_REST_RANGE,
  BARLOW_UNICODE_RANGE,
  DIGITS_RANGE,
  FALLBACK_FONT_FACES,
  fontFaceCss,
  fontPreloadHrefs,
  HANGUL_SYLLABLES_RANGE,
  HYPHEN_RANGE,
  LATIN_SAMPLE,
  NUMERIC_FALLBACK_FAMILY,
  SANS_FALLBACK_FAMILIES,
  SPACE_RANGE,
  SYSTEM_FONT_METRICS,
  WEB_FONT_FACES,
  WEB_FONT_METRICS,
  type FallbackFontFace,
} from "@/lib/fonts";
import { createPaths } from "@/lib/paths";

import {
  normalizeCssValue,
  parseDesignTokens,
  readDesignMd,
  type FixedToken,
} from "./support/design-tokens";
import {
  advanceEm,
  readWoff2,
  singleSubstitutions,
  toUnicodeRange,
  type Woff2Font,
} from "./support/woff2";

const PUBLIC_DIR = path.resolve("public");
const FONTS_DIR = path.join(PUBLIC_DIR, "fonts");

const fonts = new Map<string, Woff2Font>(
  WEB_FONT_FACES.map((face) => [
    face.path,
    readWoff2(path.join(PUBLIC_DIR, face.path)),
  ]),
);

function fontOf(family: string, weight: number): Woff2Font {
  const face = WEB_FONT_FACES.find(
    (f) => f.family === family && f.weight === weight,
  );
  const font = face && fonts.get(face.path);
  if (!font) throw new Error(`${family} ${weight} 없음`);
  return font;
}

/** name 테이블(Windows 영어) 값 */
function nameOf(font: Woff2Font, nameID: number): string | undefined {
  return font.names.find(
    (n) => n.platformID === 3 && n.languageID === 0x409 && n.nameID === nameID,
  )?.value;
}

function sampleAdvance(font: Woff2Font, sample: string): number {
  const widths = [...sample].map((c) => {
    const w = advanceEm(font, c);
    if (w === null) throw new Error(`표본 글자 ${c}가 폰트에 없음`);
    return w;
  });
  return widths.reduce((a, b) => a + b, 0) / widths.length;
}

const pct = (ratio: number) => Math.round(ratio * 10000) / 100;

/** unicode-range 문자열 → 코드포인트 집합 */
function parseUnicodeRange(range: string): Set<number> {
  const out = new Set<number>();
  for (const part of range.split(",")) {
    const m = /^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/.exec(part.trim());
    if (!m?.[1]) throw new Error(`unicode-range 형식: ${part}`);
    const start = parseInt(m[1], 16);
    const end = m[2] ? parseInt(m[2], 16) : start;
    for (let cp = start; cp <= end; cp += 1) out.add(cp);
  }
  return out;
}

/** 표 숫자(GSUB tnum) 0~9의 폭(em) — 모두 같아야 한다 */
function tabularDigitAdvances(font: Woff2Font): Set<number> {
  const tnum = singleSubstitutions(font, "tnum");
  return new Set(
    [..."0123456789"].map((d) => {
      const glyph = font.cmap.get(d.codePointAt(0) ?? -1) ?? -1;
      return font.advanceOf(tnum.get(glyph) ?? glyph) / font.unitsPerEm;
    }),
  );
}

describe("웹폰트 파일 (public/fonts)", () => {
  it("2패밀리 · 4파일이다 (DR-11)", () => {
    expect(new Set(WEB_FONT_FACES.map((f) => f.family))).toEqual(
      new Set(["EuroDigest Sans", "Barlow Condensed"]),
    );
    expect(WEB_FONT_FACES).toHaveLength(4);
    // 굵기: 한글 400·800, 숫자·라틴 600·800 (DESIGN §3.2)
    expect(WEB_FONT_FACES.map((f) => `${f.family} ${f.weight}`).sort()).toEqual(
      [
        "Barlow Condensed 600",
        "Barlow Condensed 800",
        "EuroDigest Sans 400",
        "EuroDigest Sans 800",
      ],
    );
  });

  it("public/fonts에는 정의된 woff2만 있다(남은 파일·빠진 파일 없음)", () => {
    const onDisk = readdirSync(FONTS_DIR, { recursive: true })
      .map(String)
      .filter(
        (f) =>
          f.endsWith(".woff2") ||
          f.endsWith(".woff") ||
          f.endsWith(".ttf") ||
          f.endsWith(".otf"),
      )
      .map((f) => `/fonts/${f.split(path.sep).join("/")}`)
      .sort();
    expect(onDisk).toEqual(WEB_FONT_FACES.map((f) => f.path).sort());
  });

  it("파일의 패밀리 이름(name 16)·굵기(usWeightClass)가 @font-face 선언과 같다", () => {
    for (const face of WEB_FONT_FACES) {
      const font = fonts.get(face.path);
      expect(font, face.path).toBeDefined();
      if (!font) continue;
      expect(nameOf(font, 16) ?? nameOf(font, 1), face.path).toBe(face.family);
      expect(font.weightClass, face.path).toBe(face.weight);
    }
  });

  it("EuroDigest Sans에는 OFL 예약 글꼴명(Pretendard·Source·Inter·M PLUS 1)이 이름에 없다 — 저작권·라이선스 줄은 유지", () => {
    for (const weight of [400, 800]) {
      const font = fontOf("EuroDigest Sans", weight);
      // 1 패밀리 · 3 고유 ID · 4 전체 이름 · 6 PostScript · 16·17 타이포 패밀리·스타일
      const identifying = font.names
        .filter((n) => [1, 3, 4, 6, 16, 17].includes(n.nameID))
        .map((n) => n.value);
      expect(identifying.length).toBeGreaterThan(0);
      for (const value of identifying) {
        expect(value).not.toMatch(/Pretendard|Source|\bInter\b|M ?PLUS/i);
      }
      expect(nameOf(font, 0)).toContain("Kil Hyung-jin");
      expect(nameOf(font, 13)).toMatch(/Open Font License/);
    }
  });

  it("폰트 폴더마다 OFL 원문이 함께 있다(OFL 재배포 조건) — 수정판(EuroDigest Sans)은 FONTLOG도", () => {
    const pretendardLicense = readFileSync(
      path.join(FONTS_DIR, "eurodigest-sans", "LICENSE.txt"),
      "utf8",
    );
    expect(pretendardLicense).toContain("SIL Open Font License, Version 1.1");
    expect(pretendardLicense).toContain("Reserved Font Name 'Pretendard'");
    const fontlog = readFileSync(
      path.join(FONTS_DIR, "eurodigest-sans", "FONTLOG.txt"),
      "utf8",
    );
    expect(fontlog).toContain("EuroDigest Sans");
    expect(fontlog).toContain("Pretendard 1.3.9");
    const barlowLicense = readFileSync(
      path.join(FONTS_DIR, "barlow-condensed", "OFL.txt"),
      "utf8",
    );
    expect(barlowLicense).toContain("SIL Open Font License, Version 1.1");
    expect(barlowLicense).toContain("The Barlow Project Authors");
    // 폰트가 있는 폴더는 모두 라이선스 파일을 갖는다
    for (const dir of new Set(
      WEB_FONT_FACES.map((f) => path.dirname(f.path)),
    )) {
      const files = readdirSync(path.join(PUBLIC_DIR, dir));
      expect(
        files.some((f) => /^(LICENSE|OFL)\.txt$/.test(f)),
        dir,
      ).toBe(true);
    }
  });

  it("4파일 합계 ≤ 420KB · preload 합계 ≤ 210KB (DESIGN §3.1 417.9KB · 204.5KB — 서브셋을 늘리면 표와 함께 고친다)", () => {
    const size = (p: string) => statSync(path.join(PUBLIC_DIR, p)).size;
    const total = WEB_FONT_FACES.reduce((sum, f) => sum + size(f.path), 0);
    const preloaded = WEB_FONT_FACES.filter((f) => f.preload).reduce(
      (sum, f) => sum + size(f.path),
      0,
    );
    expect(total).toBeLessThanOrEqual(420 * 1024);
    expect(preloaded).toBeLessThanOrEqual(210 * 1024);
  });
});

describe("메트릭 — src/lib/fonts.ts 기록값 = 파일 실측", () => {
  it("EuroDigest Sans: hhea 세로 메트릭과 한글 음절 폭(모든 음절 같음, 400·800 같음)", () => {
    const m = WEB_FONT_METRICS.euroDigestSans;
    for (const weight of [400, 800]) {
      const font = fontOf("EuroDigest Sans", weight);
      expect(font.hhea.ascent / font.unitsPerEm).toBeCloseTo(
        m.vertical.ascent,
        6,
      );
      expect(-font.hhea.descent / font.unitsPerEm).toBeCloseTo(
        m.vertical.descent,
        6,
      );
      expect(font.hhea.lineGap / font.unitsPerEm).toBeCloseTo(
        m.vertical.lineGap,
        6,
      );
      const hangulWidths = new Set(
        [...font.cmap.entries()]
          .filter(([cp]) => cp >= 0xac00 && cp <= 0xd7a3)
          .map(([, glyph]) => font.advanceOf(glyph) / font.unitsPerEm),
      );
      expect([...hangulWidths]).toEqual([m.hangulAdvance]);
      expect(advanceEm(font, " ")).toBeCloseTo(
        m.spaceAdvance[weight as 400 | 800],
        6,
      );
      expect(advanceEm(font, "\u00a0")).toBeCloseTo(
        m.spaceAdvance[weight as 400 | 800],
        6,
      );
    }
  });

  it("Barlow Condensed: hhea 세로 메트릭과 표본 평균 폭", () => {
    const m = WEB_FONT_METRICS.barlowCondensed;
    for (const weight of [600, 800] as const) {
      const font = fontOf("Barlow Condensed", weight);
      expect(font.hhea.ascent / font.unitsPerEm).toBeCloseTo(
        m.vertical.ascent,
        6,
      );
      expect(-font.hhea.descent / font.unitsPerEm).toBeCloseTo(
        m.vertical.descent,
        6,
      );
      expect(font.hhea.lineGap / font.unitsPerEm).toBeCloseTo(
        m.vertical.lineGap,
        6,
      );
      expect(sampleAdvance(font, LATIN_SAMPLE)).toBeCloseTo(
        m.sampleAdvance[weight],
        5,
      );
      expect([...tabularDigitAdvances(font)]).toEqual([
        m.tabularDigitAdvance[weight],
      ]);
      expect(advanceEm(font, "-")).toBeCloseTo(m.hyphenAdvance[weight], 6);
    }
  });

  it("폴백 override = 웹폰트 실측 ÷ 시스템 글꼴 기록값으로 다시 계산한 값과 같다", () => {
    /** 면 하나가 맞추는 (웹폰트 폭 — 파일에서 잼, 시스템 글꼴 폭 — 기록값) */
    function advances(
      face: FallbackFontFace,
    ): [target: number, system: number] {
      if (face.family === NUMERIC_FALLBACK_FAMILY) {
        const barlow = fontOf("Barlow Condensed", face.weight);
        const arial = SYSTEM_FONT_METRICS.arialBold;
        if (face.unicodeRange === DIGITS_RANGE) {
          return [
            [...tabularDigitAdvances(barlow)][0] ?? NaN,
            arial.digitAdvance,
          ];
        }
        if (face.unicodeRange === HYPHEN_RANGE) {
          return [advanceEm(barlow, "-") ?? NaN, arial.hyphenAdvance];
        }
        expect(face.unicodeRange).toBe(BARLOW_REST_RANGE);
        return [sampleAdvance(barlow, LATIN_SAMPLE), arial.sampleAdvance];
      }
      const eds = fontOf("EuroDigest Sans", face.weight);
      const system =
        face.family === "EuroDigest Sans Fallback Malgun"
          ? SYSTEM_FONT_METRICS.malgunGothic
          : SYSTEM_FONT_METRICS.notoSansKr;
      if (face.unicodeRange === SPACE_RANGE) {
        return [
          advanceEm(eds, " ") ?? NaN,
          system.spaceAdvance[face.weight as 400 | 800],
        ];
      }
      expect(face.unicodeRange).toBe(HANGUL_SYLLABLES_RANGE);
      return [advanceEm(eds, "가") ?? NaN, system.hangulAdvance];
    }

    for (const face of FALLBACK_FONT_FACES) {
      const web =
        face.family === NUMERIC_FALLBACK_FAMILY
          ? fontOf("Barlow Condensed", face.weight)
          : fontOf("EuroDigest Sans", face.weight);
      const [target, system] = advances(face);
      const sizeAdjust = target / system;
      const label = `${face.family} ${face.weight} ${face.unicodeRange.slice(0, 20)}`;
      expect(face.sizeAdjust, label).toBeCloseTo(pct(sizeAdjust), 1);
      expect(face.ascentOverride, label).toBeCloseTo(
        pct(web.hhea.ascent / web.unitsPerEm / sizeAdjust),
        1,
      );
      expect(face.descentOverride, label).toBeCloseTo(
        pct(-web.hhea.descent / web.unitsPerEm / sizeAdjust),
        1,
      );
      expect(face.lineGapOverride, label).toBe(0);
    }
  });

  it("한 패밀리·굵기 안의 폴백 면은 글자 범위가 겹치지 않고, 합치면 맡은 범위 전체다", () => {
    const expected = new Map<string, Set<number>>([
      [NUMERIC_FALLBACK_FAMILY, parseUnicodeRange(BARLOW_UNICODE_RANGE)],
      ...SANS_FALLBACK_FAMILIES.map(
        (family) =>
          [
            family,
            new Set([
              ...parseUnicodeRange(HANGUL_SYLLABLES_RANGE),
              ...parseUnicodeRange(SPACE_RANGE),
            ]),
          ] as const,
      ),
    ]);
    const groups = new Map<string, FallbackFontFace[]>();
    for (const face of FALLBACK_FONT_FACES) {
      const key = `${face.family}|${face.weight}`;
      groups.set(key, [...(groups.get(key) ?? []), face]);
    }
    for (const [key, faces] of groups) {
      const union = new Set<number>();
      let total = 0;
      for (const face of faces) {
        const cps = parseUnicodeRange(face.unicodeRange);
        total += cps.size;
        for (const cp of cps) union.add(cp);
      }
      expect(total, `${key} 범위 겹침`).toBe(union.size);
      expect(union, key).toEqual(expected.get(key.split("|")[0] ?? ""));
    }
  });

  it("폴백 면은 패밀리마다 웹폰트와 같은 굵기를 모두 갖는다(font-synthesis: none에서 굵기가 틀어지지 않게)", () => {
    const weightsOf = (family: string) =>
      [
        ...new Set(
          FALLBACK_FONT_FACES.filter((f) => f.family === family).map(
            (f) => f.weight,
          ),
        ),
      ].sort();
    for (const family of SANS_FALLBACK_FAMILIES) {
      expect(weightsOf(family), family).toEqual([400, 800]);
    }
    expect(weightsOf(NUMERIC_FALLBACK_FAMILY)).toEqual([600, 800]);
  });

  it("BARLOW_UNICODE_RANGE = Barlow 서브셋 cmap 범위(600·800 같음)", () => {
    for (const weight of [600, 800]) {
      expect(
        toUnicodeRange(fontOf("Barlow Condensed", weight).cmap.keys()),
      ).toBe(BARLOW_UNICODE_RANGE);
    }
  });
});

describe("@font-face CSS · preload", () => {
  const prod = createPaths({ basePath: "/euro-digest", siteUrl: undefined });
  const root = createPaths({ basePath: "", siteUrl: undefined });
  const css = fontFaceCss(prod.withBasePath);
  const rules = [...css.matchAll(/@font-face\{([^}]*)\}/g)].map(
    (m) => m[1] ?? "",
  );

  it("웹폰트 4면은 font-display: swap이고 src가 basePath 포함 woff2다", () => {
    for (const face of WEB_FONT_FACES) {
      const rule = rules.find(
        (r) =>
          r.includes(`font-family:"${face.family}";`) &&
          r.includes(`font-weight:${face.weight};`),
      );
      expect(rule, `${face.family} ${face.weight}`).toBeDefined();
      expect(rule).toContain("font-display:swap");
      expect(rule).toContain(
        `src:url("/euro-digest${face.path}") format("woff2")`,
      );
    }
  });

  it("폴백 면은 모두 local()만 쓰고(외부 요청 없음) size-adjust·override·unicode-range를 갖는다", () => {
    const fallbackRules = rules.filter((r) => r.includes("Fallback"));
    expect(fallbackRules).toHaveLength(FALLBACK_FONT_FACES.length);
    for (const rule of fallbackRules) {
      expect(rule).not.toContain("url(");
      expect(rule).toMatch(/src:local\("[^"]+"\)(,local\("[^"]+"\))*;/);
      for (const descriptor of [
        "size-adjust",
        "ascent-override",
        "descent-override",
        "line-gap-override",
        "unicode-range",
      ]) {
        expect(rule).toContain(`${descriptor}:`);
      }
    }
  });

  it('CSS 안의 url()은 모두 basePath로 시작한다 — 루트 배포(basePath "")도 같은 규칙', () => {
    for (const [paths, prefix] of [
      [prod, "/euro-digest/fonts/"],
      [root, "/fonts/"],
    ] as const) {
      const urls = [
        ...fontFaceCss(paths.withBasePath).matchAll(/url\("([^"]+)"\)/g),
      ].map((m) => m[1]);
      expect(urls).toHaveLength(4);
      for (const url of urls) expect(url?.startsWith(prefix), url).toBe(true);
    }
  });

  it("preload는 한글 400 + Barlow 800 두 파일뿐이다 (DESIGN §11.3)", () => {
    expect(fontPreloadHrefs(prod.withBasePath)).toEqual([
      "/euro-digest/fonts/eurodigest-sans/eurodigest-sans-400.ksx.woff2",
      "/euro-digest/fonts/barlow-condensed/BarlowCondensed-ExtraBold.latin.woff2",
    ]);
  });

  it("인라인 <style>을 깰 수 있는 문자(</style>·따옴표 밖 꺾쇠)가 없다", () => {
    expect(css).not.toMatch(/[<>]/);
  });
});

describe("DESIGN.md §3.1 폰트 스택 ↔ src/lib/fonts.ts", () => {
  const fixed = new Map(
    parseDesignTokens(readDesignMd())
      .filter((t): t is FixedToken => t.kind === "fixed")
      .map((t) => [t.name, t.value]),
  );
  /** 스택 → 패밀리 이름 목록(따옴표 제거) */
  const families = (name: string) =>
    normalizeCssValue(fixed.get(name) ?? "")
      .split(",")
      .map((f) => f.trim().replace(/^"|"$/g, ""));

  it("--font-sans = EuroDigest Sans → 한글 폴백 2패밀리 → 시스템 글꼴", () => {
    const stack = families("--font-sans");
    expect(stack.slice(0, 3)).toEqual(
      ["EuroDigest Sans", ...SANS_FALLBACK_FAMILIES].map((f) =>
        f.toLowerCase(),
      ),
    );
  });

  it("--font-numeric·--font-latin = Barlow Condensed → Barlow 폴백 → EuroDigest Sans", () => {
    for (const name of ["--font-numeric", "--font-latin"]) {
      expect(families(name).slice(0, 3), name).toEqual(
        ["Barlow Condensed", NUMERIC_FALLBACK_FAMILY, "EuroDigest Sans"].map(
          (f) => f.toLowerCase(),
        ),
      );
    }
  });

  it("@font-face로 선언한 패밀리는 모두 어느 스택에든 들어 있다(쓰이지 않는 면 없음)", () => {
    const all = new Set(
      ["--font-sans", "--font-numeric", "--font-latin"].flatMap(families),
    );
    const declared = new Set(
      [...WEB_FONT_FACES, ...FALLBACK_FONT_FACES].map((f) =>
        f.family.toLowerCase(),
      ),
    );
    for (const family of declared) expect(all, family).toContain(family);
  });

  it("시안 폰트 폴더(docs/design/fonts)는 그대로 있다 — 시안 HTML이 로컬 파일을 참조한다", () => {
    expect(
      existsSync(
        path.resolve(
          "docs/design/fonts/pretendard/eurodigest-sans-400.ksx.woff2",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.resolve(
          "docs/design/fonts/barlow-condensed/BarlowCondensed-ExtraBold.latin.woff2",
        ),
      ),
    ).toBe(true);
  });
});
