/**
 * 웹폰트 — self-host 2패밀리·4파일 + 메트릭을 맞춘 시스템 폴백 (D0-11, PRD DR-03·DR-11, DESIGN.md §3.1·§3.2·§11.3)
 *
 * 무엇을 내보내나
 * - `fontFaceCss(withBase)` — `@font-face` 규칙 문자열. layout.tsx `<head>`의 인라인 `<style>`로 들어간다.
 * - `fontPreloadHrefs(withBase)` — `<link rel="preload" as="font">` href(DESIGN §11.3의 2개만).
 * 둘 다 같은 `withBase`(src/lib/paths.ts `withBasePath`)로 경로를 만들어서 preload와 실제 요청 URL이 어긋나지 않는다.
 *
 * 왜 next/font/local이 아니라 손으로 쓴 @font-face인가 (D0-11 결정 — DESIGN §11.3)
 * 1. 패밀리 이름: DESIGN §3.1·globals.css 토큰이 "EuroDigest Sans"·"Barlow Condensed"를 그대로 쓴다.
 *    next/font는 해시 이름(`__x_abc123`)을 만들어 토큰을 CSS 변수 참조로 바꿔야 한다.
 * 2. preload 단위: DESIGN §11.3은 한글 400 + Barlow 800 두 파일만 preload한다. next/font의 preload는 호출(패밀리) 단위라
 *    src 전부(4파일 418KB)를 받거나 하나도 안 받는다. 굵기마다 호출을 나누면 패밀리가 갈라져
 *    `font-synthesis: none`에서 800 글자가 400 면으로 그려진다.
 * 3. 폴백 메트릭: next/font의 adjustFontFallback은 Arial·Times New Roman 기준뿐이다. 한글은 Arial에 없어서
 *    한글 폴백 글꼴(맑은 고딕·Noto Sans KR)의 폭 차이(한글 최대 16%, 공백 40%)를 줄이지 못한다. 여기서는 플랫폼 글꼴별로 잰 값으로 맞춘다.
 * 4. basePath: globals.css의 `url("/fonts/…")`에는 basePath가 붙지 않는다(DESIGN §11.3). 그래서 @font-face를 globals.css가 아니라
 *    인라인 `<style>`로 내보내고 경로를 `withBasePath`로 만든다. 폰트 파일은 public/fonts/ → `<basePath>/fonts/…`.
 *
 * 폴백 메트릭(CLS — CLAUDE §7.2 CLS ≤ 0.05)
 * `font-display: swap`이라 웹폰트가 오기 전에는 시스템 글꼴로 그렸다가 바꾼다. 글자 폭이 다르면 줄 수가 바뀌어 아래가 밀린다.
 * 폴백 전용 패밀리(`local()` + `size-adjust`·`ascent-override`·`descent-override`·`line-gap-override`)를 웹폰트 바로 뒤에 두어
 * 바뀌기 전후의 폭·세로 메트릭을 맞춘다(next/font와 같은 계산: size-adjust = 웹폰트 폭 ÷ 폴백 폭, override = 웹폰트 값 ÷ size-adjust).
 * - 한글: 맑은 고딕(Windows, 한글 폭 1em)·Noto Sans KR/CJK KR(Android·Linux·ChromeOS, 0.92em) 두 패밀리로 나눈다(폭이 8% 달라 한 값으로 못 맞춤).
 *   패밀리마다 같은 글꼴을 두 면으로 나눠 따로 맞춘다 — 한글 음절 면(한글 폭 기준)과 공백 면(U+0020·U+00A0, 공백 폭 기준).
 *   공백은 한국어 문장에 3~4글자마다 나오는데 맑은 고딕 공백이 Pretendard보다 40% 넓어(0.352 vs 0.251em) 줄 바뀜의 주원인이었다(D0-11 실측).
 *   공백 면이 U+0020을 가지므로 swap 동안 이 패밀리가 줄 높이를 정하는 기본 글꼴(first available font)이 되고,
 *   세로 override가 Pretendard 값이라 줄 안 기준선도 바뀌지 않는다.
 *   라틴·숫자·문장부호는 맞추지 않는다 — 라틴 글자는 ±4% 안이지만 숫자·문장부호는 글자마다 −14~+6%로 흩어져 한 값으로 못 맞춘다.
 *   (D0-11 스윕에서 남은 줄 바뀜 1건 — 맑은 고딕 · 390px · 괄호 4개 — 이 여기서 나왔다. DESIGN §11.3)
 *   Apple SD Gothic Neo(macOS·iOS)는 아직 재지 못했다(폰트 파일이 없음) → 기존 스택 그대로. 실기기 측정은 DESIGN §11.3 남은 일.
 * - Barlow Condensed: Arial Bold 계열(Arial·Helvetica·Liberation Sans는 폭 호환)을 줄여 폭을 맞춘다. 같은 글꼴을 세 면으로 나눈다 —
 *   숫자 면(U+0030-0039): 숫자 자리는 모두 표 숫자(tabular-nums, DESIGN §3.5)라 Barlow 표 숫자 폭(600 0.475 · 800 0.52em) 기준(85~93%),
 *   하이픈 면(U+002D): 스코어 "2-2"의 하이픈은 두 글꼴 폭이 거의 같다(98~101%) — 문자 기준으로 줄이면 24% 좁아져 줄 바뀜을 냈다(D0-11 실측),
 *   나머지 면: 라틴 문자 표본 기준(74~78%).
 *   Android Roboto Bold는 같은 패밀리에 넣었다 — Arial Bold보다 약 6% 좁아(capsize 평균 폭 926 vs 983/2048) 완전히 맞지는 않지만,
 *   빼면 27% 넓은 시스템 글꼴로 그려진다. 세 면의 unicode-range를 합치면 Barlow 서브셋 범위다(서브셋 밖 글자는 원래대로 다음 패밀리로).
 *
 * 값의 출처: 웹폰트 메트릭은 public/fonts 파일에서 잰 값이고 tests/fonts.test.ts가 파일을 다시 읽어 대조한다.
 * 시스템 글꼴 메트릭은 2026-10-12 fontTools로 잰 값이다(Windows 11 malgun.ttf·malgunbd.ttf·arialbd.ttf, Liberation Sans Bold 2.1,
 * Google Fonts Noto Sans KR 400·700). CI에는 이 글꼴들이 없어 테스트는 기록값으로 계산만 검사한다.
 *
 * 런타임 의존성 없음 — 서버 컴포넌트(layout.tsx)와 테스트가 import한다. 브라우저 번들에는 들어가지 않는다.
 */

/** 웹폰트 패밀리 이름 — DESIGN §3.1 표의 첫 이름. OFL 예약 글꼴명(Pretendard·Source·Inter·M PLUS 1)을 쓰지 않는다 */
export type WebFontFamily = "EuroDigest Sans" | "Barlow Condensed";

/** DESIGN §3.2 — 한글 400·800, 숫자·라틴 600·800만 */
export type FontWeight = 400 | 600 | 800;

export interface WebFontFace {
  family: WebFontFamily;
  weight: FontWeight;
  /** 사이트 경로(basePath 없음, `/fonts/…`). 파일은 public/ 아래 같은 경로 */
  path: string;
  /** `<link rel="preload">` 대상(DESIGN §11.3) */
  preload: boolean;
  /** 서브셋 글자 범위. 없으면 선언하지 않는다(한글 서브셋은 범위가 흩어져 이득이 없다) */
  unicodeRange?: string;
}

export interface FallbackFontFace {
  family: string;
  weight: FontWeight;
  /** `local()` 이름 — 전체 이름·PostScript 이름. 앞에서부터 처음 찾은 글꼴을 쓴다 */
  local: readonly string[];
  /** 백분율(소수 둘째 자리) */
  sizeAdjust: number;
  ascentOverride: number;
  descentOverride: number;
  lineGapOverride: number;
  unicodeRange: string;
}

/**
 * Barlow Condensed 서브셋(600·800 공통)의 cmap 범위. tests/fonts.test.ts가 woff2 cmap과 대조한다.
 * Basic Latin · Latin-1 · Latin Extended-A(일부 제외) · 대시·따옴표·말줄임·€·™·−
 */
export const BARLOW_UNICODE_RANGE =
  "U+0020-007E,U+00A0-0113,U+0116-012B,U+012D-0131,U+0133-0137,U+0139-013E,U+0140-0148,U+014A-014D,U+014F-017E," +
  "U+2010,U+2013-2014,U+2018-201A,U+201C-201E,U+2020-2022,U+2026,U+2030,U+2032-2033,U+2039-203A,U+20AC,U+2122,U+2212";

/** 숫자 0~9. Barlow 폴백의 숫자 면 */
export const DIGITS_RANGE = "U+0030-0039";

/** 하이픈-마이너스. Barlow 폴백의 하이픈 면 — 스코어 "2-2"마다 나온다 */
export const HYPHEN_RANGE = "U+002D";

/** Barlow 폴백의 나머지 면 — Barlow 서브셋 범위에서 숫자·하이픈을 뺀 것(다른 면과 겹치지 않게) */
export const BARLOW_REST_RANGE = BARLOW_UNICODE_RANGE.replace(
  "U+0020-007E",
  "U+0020-002C,U+002E-002F,U+003A-007E",
);

/** 한글 음절(가~힣). 한글 폴백 패밀리의 한글 면 */
export const HANGUL_SYLLABLES_RANGE = "U+AC00-D7A3";

/** 공백·줄바꿈 없는 공백. 한글 폴백 패밀리의 공백 면 */
export const SPACE_RANGE = "U+0020,U+00A0";

const FONT_DIR = "/fonts";

/** self-host 웹폰트 4면(DR-11: 2패밀리·4파일). preload는 첫 화면용 한글 400 + Barlow 800(DESIGN §11.3) */
export const WEB_FONT_FACES: readonly WebFontFace[] = [
  {
    family: "EuroDigest Sans",
    weight: 400,
    path: `${FONT_DIR}/eurodigest-sans/eurodigest-sans-400.ksx.woff2`,
    preload: true,
  },
  {
    family: "EuroDigest Sans",
    weight: 800,
    path: `${FONT_DIR}/eurodigest-sans/eurodigest-sans-800.ksx.woff2`,
    preload: false,
  },
  {
    family: "Barlow Condensed",
    weight: 600,
    path: `${FONT_DIR}/barlow-condensed/BarlowCondensed-SemiBold.latin.woff2`,
    preload: false,
    unicodeRange: BARLOW_UNICODE_RANGE,
  },
  {
    family: "Barlow Condensed",
    weight: 800,
    path: `${FONT_DIR}/barlow-condensed/BarlowCondensed-ExtraBold.latin.woff2`,
    preload: true,
    unicodeRange: BARLOW_UNICODE_RANGE,
  },
];

// ─── 메트릭 (em 단위) ───────────────────────────────────────────────────────

/** 세로 메트릭(hhea, em) */
export interface VerticalMetrics {
  ascent: number;
  descent: number;
  lineGap: number;
}

/**
 * 웹폰트 실측값(em) — tests/fonts.test.ts가 public/fonts의 woff2를 다시 읽어 같은지 검사한다.
 * - EuroDigest Sans: hhea 1950/−494/0 (UPM 2048), 한글 음절 폭 1770/2048(모든 음절 같음, 400·800 같음), 공백 폭 400 514 · 800 458
 * - Barlow Condensed: hhea 1000/−200/0 (UPM 1000), 표본(`LATIN_SAMPLE`) 평균 글자 폭, 표 숫자(tnum) 폭 600 475 · 800 520, 하이픈 325 · 337
 */
export const WEB_FONT_METRICS = {
  euroDigestSans: {
    vertical: { ascent: 1950 / 2048, descent: 494 / 2048, lineGap: 0 },
    hangulAdvance: 1770 / 2048,
    spaceAdvance: { 400: 514 / 2048, 800: 458 / 2048 },
  },
  barlowCondensed: {
    vertical: { ascent: 1, descent: 0.2, lineGap: 0 },
    /** `LATIN_SAMPLE`의 글자당 평균 폭(em, 커닝 없음) */
    sampleAdvance: { 600: 0.37313, 800: 0.39141 },
    /** 표 숫자(GSUB tnum) 폭(em) — 기본 숫자는 비례 폭(1이 0.274 등) */
    tabularDigitAdvance: { 600: 0.475, 800: 0.52 },
    /** 하이픈-마이너스 폭(em) */
    hyphenAdvance: { 600: 0.325, 800: 0.337 },
  },
} as const;

/** 라틴 폭 비교 표본 — 팬그램 + 숫자. 혼합안 fixtures 라틴 원제목 전체로 잰 비율과 0.3% 안에서 같다 */
export const LATIN_SAMPLE =
  "The quick brown fox jumps over the lazy dog 0123456789";

/** 시스템 폴백 글꼴 실측값(em) — 2026-10-12 fontTools 측정. CI에 없는 글꼴이라 기록값으로 둔다 */
export const SYSTEM_FONT_METRICS = {
  /** 맑은 고딕 Regular·Bold: 한글 음절 폭 2048/2048, 공백 720/2048(두 굵기 같음) */
  malgunGothic: {
    hangulAdvance: 1,
    spaceAdvance: { 400: 720 / 2048, 800: 720 / 2048 },
  },
  /**
   * Noto Sans KR(= Noto Sans CJK KR 한글) 400·700: 한글 음절 폭 920/1000.
   * 공백은 한국어 문서(`<html lang="ko">`)에서 locl(KOR) 대체 글리프 280/1000으로 그려진다(hmtx 기본값 224·227이 아님 — Chromium 실측).
   */
  notoSansKr: {
    hangulAdvance: 0.92,
    spaceAdvance: { 400: 0.28, 800: 0.28 },
  },
  /** Arial Bold(= Liberation Sans Bold, 폭 호환): `LATIN_SAMPLE` 평균 폭, 숫자 1139/2048(기본이 표 숫자), 하이픈 682/2048 */
  arialBold: {
    sampleAdvance: 0.50428,
    digitAdvance: 1139 / 2048,
    hyphenAdvance: 682 / 2048,
  },
} as const;

/** 백분율로 바꿔 소수 둘째 자리에서 반올림 */
function percent(ratio: number): number {
  return Math.round(ratio * 10000) / 100;
}

/**
 * 폴백 글꼴을 웹폰트에 맞추는 override 값(백분율). next/font의 계산과 같다:
 * size-adjust = 웹폰트 폭 ÷ 폴백 폭, 세로 override = 웹폰트 값 ÷ size-adjust(override도 size-adjust만큼 커지므로).
 */
export function metricOverrides(
  target: VerticalMetrics,
  targetAdvance: number,
  fallbackAdvance: number,
): Pick<
  FallbackFontFace,
  "sizeAdjust" | "ascentOverride" | "descentOverride" | "lineGapOverride"
> {
  const sizeAdjust = targetAdvance / fallbackAdvance;
  return {
    sizeAdjust: percent(sizeAdjust),
    ascentOverride: percent(target.ascent / sizeAdjust),
    descentOverride: percent(target.descent / sizeAdjust),
    lineGapOverride: percent(target.lineGap / sizeAdjust),
  };
}

/** 한글 폴백 패밀리 — 웹폰트 바로 뒤에 둔다(DESIGN §3.1 `--font-sans`) */
export const SANS_FALLBACK_FAMILIES = [
  "EuroDigest Sans Fallback Malgun",
  "EuroDigest Sans Fallback Noto",
] as const;

/** Barlow 폴백 패밀리 — Barlow 바로 뒤에 둔다(DESIGN §3.1 `--font-numeric`·`--font-latin`) */
export const NUMERIC_FALLBACK_FAMILY = "Barlow Condensed Fallback";

const MALGUN_LOCAL: Readonly<Record<400 | 800, readonly string[]>> = {
  400: ["Malgun Gothic", "MalgunGothic"],
  800: ["Malgun Gothic Bold", "MalgunGothicBold"],
};

const NOTO_KR_LOCAL: Readonly<Record<400 | 800, readonly string[]>> = {
  400: [
    "Noto Sans CJK KR",
    "Noto Sans CJK KR Regular",
    "NotoSansCJKkr-Regular",
    "Noto Sans KR Regular",
    "NotoSansKR-Regular",
  ],
  800: [
    "Noto Sans CJK KR Bold",
    "NotoSansCJKkr-Bold",
    "Noto Sans KR Bold",
    "NotoSansKR-Bold",
  ],
};

/** Barlow 600·800 모두 Bold 면으로 받는다(합성 금지 — Regular를 쓰면 가늘게 보인다) */
const ARIAL_BOLD_LOCAL: readonly string[] = [
  "Arial Bold",
  "Arial-BoldMT",
  "Helvetica Bold",
  "Helvetica-Bold",
  "Liberation Sans Bold",
  "LiberationSans-Bold",
  "Roboto Bold",
  "Roboto-Bold",
];

/** 한글 폴백 패밀리 한 개 — 굵기(400·800)마다 한글 음절 면 + 공백 면 */
function sansFallback(
  family: (typeof SANS_FALLBACK_FAMILIES)[number],
  local: Readonly<Record<400 | 800, readonly string[]>>,
  system: {
    hangulAdvance: number;
    spaceAdvance: Readonly<Record<400 | 800, number>>;
  },
): FallbackFontFace[] {
  const eds = WEB_FONT_METRICS.euroDigestSans;
  return ([400, 800] as const).flatMap((weight): FallbackFontFace[] => [
    {
      family,
      weight,
      local: local[weight],
      ...metricOverrides(eds.vertical, eds.hangulAdvance, system.hangulAdvance),
      unicodeRange: HANGUL_SYLLABLES_RANGE,
    },
    {
      family,
      weight,
      local: local[weight],
      ...metricOverrides(
        eds.vertical,
        eds.spaceAdvance[weight],
        system.spaceAdvance[weight],
      ),
      unicodeRange: SPACE_RANGE,
    },
  ]);
}

/** 메트릭을 맞춘 폴백 면(한글 2패밀리 × 2굵기 × 한글·공백 2면 + Barlow 폴백 2굵기 × 문자·숫자·하이픈 3면 = 14면). 웹폰트와 같은 굵기만 둔다 */
export const FALLBACK_FONT_FACES: readonly FallbackFontFace[] = [
  ...sansFallback(
    "EuroDigest Sans Fallback Malgun",
    MALGUN_LOCAL,
    SYSTEM_FONT_METRICS.malgunGothic,
  ),
  ...sansFallback(
    "EuroDigest Sans Fallback Noto",
    NOTO_KR_LOCAL,
    SYSTEM_FONT_METRICS.notoSansKr,
  ),
  ...([600, 800] as const).flatMap((weight): FallbackFontFace[] => {
    const barlow = WEB_FONT_METRICS.barlowCondensed;
    const arial = SYSTEM_FONT_METRICS.arialBold;
    const segments = [
      [BARLOW_REST_RANGE, barlow.sampleAdvance[weight], arial.sampleAdvance],
      [DIGITS_RANGE, barlow.tabularDigitAdvance[weight], arial.digitAdvance],
      [HYPHEN_RANGE, barlow.hyphenAdvance[weight], arial.hyphenAdvance],
    ] as const;
    return segments.map(([unicodeRange, barlowAdvance, arialAdvance]) => ({
      family: NUMERIC_FALLBACK_FAMILY,
      weight,
      local: ARIAL_BOLD_LOCAL,
      ...metricOverrides(barlow.vertical, barlowAdvance, arialAdvance),
      unicodeRange,
    }));
  }),
];

// ─── CSS · preload ──────────────────────────────────────────────────────────

/** 인라인 `<style>`에 넣는 값 검사 — 따옴표·역슬래시·꺾쇠가 섞이면 CSS·HTML을 깰 수 있다 */
function cssString(value: string): string {
  if (/["\\<>\n]/.test(value)) {
    throw new RangeError(
      `폰트 CSS 값에 쓸 수 없는 문자: ${JSON.stringify(value)}`,
    );
  }
  return `"${value}"`;
}

/**
 * `@font-face` 규칙 전체(웹폰트 4면 + 폴백 14면). `withBase`는 src/lib/paths.ts의 `withBasePath`.
 * 웹폰트는 `font-display: swap`(DR-03), 폴백 면은 local()이라 표시 전략이 필요 없다.
 */
export function fontFaceCss(withBase: (path: string) => string): string {
  const web = WEB_FONT_FACES.map((face) =>
    [
      `font-family:${cssString(face.family)}`,
      "font-style:normal",
      `font-weight:${face.weight}`,
      "font-display:swap",
      `src:url(${cssString(withBase(face.path))}) format("woff2")`,
      ...(face.unicodeRange ? [`unicode-range:${face.unicodeRange}`] : []),
    ].join(";"),
  );
  const fallback = FALLBACK_FONT_FACES.map((face) =>
    [
      `font-family:${cssString(face.family)}`,
      "font-style:normal",
      `font-weight:${face.weight}`,
      `src:${face.local.map((name) => `local(${cssString(name)})`).join(",")}`,
      `size-adjust:${face.sizeAdjust}%`,
      `ascent-override:${face.ascentOverride}%`,
      `descent-override:${face.descentOverride}%`,
      `line-gap-override:${face.lineGapOverride}%`,
      `unicode-range:${face.unicodeRange}`,
    ].join(";"),
  );
  return [...web, ...fallback].map((body) => `@font-face{${body}}`).join("\n");
}

/** preload할 폰트 href(basePath 포함) — DESIGN §11.3: 한글 400 + Barlow 800 */
export function fontPreloadHrefs(withBase: (path: string) => string): string[] {
  return WEB_FONT_FACES.filter((face) => face.preload).map((face) =>
    withBase(face.path),
  );
}
