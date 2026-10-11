/**
 * 디자인 토큰 대조 헬퍼 — DESIGN.md 토큰 표(§0.3 기계 판독 규칙)와 globals.css를 읽는다 (D0-10).
 * tests/design-tokens.test.ts·tests/theme.test.ts·tests/e2e/theme.spec.ts가 쓴다. 앱 번들에는 들어가지 않는다.
 * 파일 이름이 *.test.ts·*.spec.ts가 아니므로 Vitest·Playwright가 테스트로 실행하지 않는다.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * 저장소 루트 — 실행 위치에서 위로 올라가며 DESIGN.md가 있는 폴더를 찾는다.
 * Playwright는 spec을 CommonJS로 바꿔 실행해 import.meta를 쓸 수 없으므로 실행 위치(cwd) 기준으로 찾는다.
 */
function findRepoRoot(): string {
  let dir = process.cwd();
  while (!existsSync(path.join(dir, "DESIGN.md"))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`DESIGN.md를 찾지 못함(실행 위치 ${process.cwd()})`);
    }
    dir = parent;
  }
  return dir;
}

const REPO_ROOT = findRepoRoot();
export const DESIGN_MD_PATH = path.join(REPO_ROOT, "DESIGN.md");
export const GLOBALS_CSS_PATH = path.join(
  REPO_ROOT,
  "src",
  "app",
  "globals.css",
);

export function readDesignMd(): string {
  return readFileSync(DESIGN_MD_PATH, "utf8");
}

export function readGlobalsCss(): string {
  return readFileSync(GLOBALS_CSS_PATH, "utf8");
}

// ─── DESIGN.md 토큰 표 ──────────────────────────────────────────────────────

export interface ColorToken {
  kind: "color";
  name: string;
  light: string;
  dark: string;
  section: string;
}
export interface ResponsiveToken {
  kind: "responsive";
  name: string;
  /** 375(1단) 값 */
  narrow: string;
  /** 1280 열 — 1024 이상(lg) 값 */
  wide: string;
  section: string;
}
export interface FixedToken {
  kind: "fixed";
  name: string;
  value: string;
  section: string;
}
export type DesignToken = ColorToken | ResponsiveToken | FixedToken;

/** 표 한 줄을 칸으로 나눈다(`\|`는 칸 구분이 아니다). */
function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

const TABLE_KINDS: ReadonlyArray<{
  header: readonly string[];
  kind: DesignToken["kind"];
}> = [
  { header: ["토큰", "라이트", "다크", "용도"], kind: "color" },
  { header: ["토큰", "375", "1280", "용도"], kind: "responsive" },
  { header: ["토큰", "값", "용도"], kind: "fixed" },
];

function backtickOne(cell: string, where: string): string {
  const m = /^`([^`]+)`$/.exec(cell);
  if (!m?.[1]) {
    throw new Error(
      `${where}: 값 칸은 백틱 안 값 하나여야 함(DESIGN §0.3): ${cell}`,
    );
  }
  return m[1];
}

/**
 * DESIGN.md 토큰 표 전부(§0.3). 첫 칸이 "토큰"인 표만 읽고, 머리 줄이 세 형식이 아니면 오류.
 * 한 토큰이 두 번 나오면 오류.
 */
export function parseDesignTokens(markdown: string): DesignToken[] {
  const lines = markdown.split("\n");
  const tokens: DesignToken[] = [];
  const seen = new Set<string>();
  let section = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const heading = /^#{2,4}\s+(.*)$/.exec(line);
    if (heading?.[1]) section = heading[1].trim();
    if (!/^\|\s*토큰\s*\|/.test(line)) continue;

    const header = splitRow(line);
    const kind = TABLE_KINDS.find(
      (k) =>
        k.header.length === header.length &&
        k.header.every((h, idx) => h === header[idx]),
    )?.kind;
    if (!kind) {
      throw new Error(
        `DESIGN.md ${i + 1}행: 알 수 없는 토큰 표 머리 줄(§0.3): ${line}`,
      );
    }
    i += 2; // 머리 줄 다음 구분 줄을 건너뛴다
    for (; i < lines.length && /^\|/.test(lines[i] ?? ""); i++) {
      const row = lines[i] ?? "";
      const where = `DESIGN.md ${i + 1}행`;
      const cells = splitRow(row);
      const name = backtickOne(cells[0] ?? "", where);
      if (!/^--[a-z0-9-]+$/.test(name)) {
        throw new Error(`${where}: 토큰 칸은 CSS 변수명 하나여야 함: ${name}`);
      }
      if (seen.has(name)) {
        throw new Error(`${where}: 토큰이 두 번 나옴(§0.3): ${name}`);
      }
      seen.add(name);
      if (kind === "color") {
        tokens.push({
          kind,
          name,
          light: backtickOne(cells[1] ?? "", where),
          dark: backtickOne(cells[2] ?? "", where),
          section,
        });
      } else if (kind === "responsive") {
        tokens.push({
          kind,
          name,
          narrow: backtickOne(cells[1] ?? "", where),
          wide: backtickOne(cells[2] ?? "", where),
          section,
        });
      } else {
        tokens.push({
          kind,
          name,
          value: backtickOne(cells[1] ?? "", where),
          section,
        });
      }
    }
    i--; // 바깥 for의 i++ 보정
  }
  return tokens;
}

/** 타입 스케일 값 `크기/행간/굵기/자간`에서 크기·행간(DESIGN §0.3) */
export function splitTypeScale(
  value: string,
): { size: string; lineHeight: string } | null {
  const parts = value.split("/");
  if (parts.length !== 4) return null;
  return { size: parts[0] ?? "", lineHeight: parts[1] ?? "" };
}

// ─── DESIGN.md 대비 표 ──────────────────────────────────────────────────────

export interface ContrastPair {
  /** 글자(또는 앞에 놓이는 색) 토큰 */
  fg: string;
  /** 배경 토큰 */
  bg: string;
  /** WCAG 기준(4.5 텍스트 · 3.0 비텍스트). null = 기준 밖(장식·예외) */
  threshold: number | null;
  /** 문서에 적힌 대비비 — 라이트 · 다크 */
  light: number;
  dark: number;
  /** 문서 위치(실패 메시지용) */
  source: string;
}

const NUMBER_RE = /\d+(?:\.\d+)?/;

function firstNumber(cell: string): number | null {
  const m = NUMBER_RE.exec(cell);
  return m ? Number(m[0]) : null;
}

/** 대회 대비 표의 대회 이름 → 토큰 접미사 */
export const COMPETITION_LABELS: Readonly<Record<string, string>> = {
  EPL: "epl",
  라리가: "laliga",
  세리에A: "seriea",
  분데스: "bundesliga",
  리그1: "ligue1",
  UCL: "ucl",
};

/**
 * DESIGN.md §2의 대비 기록을 모두 읽는다.
 * - `| 쌍 | 기준 | 라이트 | 다크 |` 표
 * - `| 대회 | 라이트 | 다크 |` 표 — 면 위 약칭(4.5)과 면 / 지면(3.0)이 같은 값(§2.4)
 * - 본문 문장의 "`--a`/`--b` 라이트·다크" 꼴(§2.3) — 기준은 따로 적혀 있지 않아 null
 */
export function parseContrastPairs(markdown: string): ContrastPair[] {
  const lines = markdown.split("\n");
  const pairs: ContrastPair[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\|\s*쌍\s*\|\s*기준\s*\|\s*라이트\s*\|\s*다크\s*\|/.test(line)) {
      for (i += 2; i < lines.length && /^\|/.test(lines[i] ?? ""); i++) {
        const cells = splitRow(lines[i] ?? "");
        const names = [...(cells[0] ?? "").matchAll(/`(--[a-z0-9-]+)`/g)].map(
          (m) => m[1] ?? "",
        );
        const light = firstNumber(cells[2] ?? "");
        const dark = firstNumber(cells[3] ?? "");
        if (names.length !== 2 || light === null || dark === null) {
          throw new Error(`DESIGN.md ${i + 1}행: 대비 표 행을 읽지 못함`);
        }
        const basis = cells[1] ?? "";
        pairs.push({
          fg: names[0] ?? "",
          bg: names[1] ?? "",
          threshold: /^–/.test(basis) ? null : firstNumber(basis),
          light,
          dark,
          source: `DESIGN.md ${i + 1}행`,
        });
      }
      i--;
      continue;
    }
    if (/^\|\s*대회\s*\|\s*라이트\s*\|\s*다크\s*\|/.test(line)) {
      for (i += 2; i < lines.length && /^\|/.test(lines[i] ?? ""); i++) {
        const cells = splitRow(lines[i] ?? "");
        const id = COMPETITION_LABELS[cells[0] ?? ""];
        const light = firstNumber(cells[1] ?? "");
        const dark = firstNumber(cells[2] ?? "");
        if (!id || light === null || dark === null) {
          throw new Error(`DESIGN.md ${i + 1}행: 대회 대비 표 행을 읽지 못함`);
        }
        const source = `DESIGN.md ${i + 1}행`;
        const surface = `--competition-${id}`;
        pairs.push(
          {
            fg: `${surface}-foreground`,
            bg: surface,
            threshold: 4.5,
            light,
            dark,
            source,
          },
          { fg: surface, bg: "--paper", threshold: 3, light, dark, source },
        );
      }
      i--;
      continue;
    }
    for (const m of line.matchAll(
      /`(--[a-z0-9-]+)`\/`(--[a-z0-9-]+)` (\d+\.\d+)·(\d+\.\d+)/g,
    )) {
      pairs.push({
        fg: m[1] ?? "",
        bg: m[2] ?? "",
        threshold: null,
        light: Number(m[3]),
        dark: Number(m[4]),
        source: `DESIGN.md ${i + 1}행(본문)`,
      });
    }
  }
  return pairs;
}

/** DESIGN.md §8의 초기 인라인 스크립트 원문(`<script>`·`</script>` 안쪽) */
export function extractThemeInitScript(markdown: string): string {
  const m = /```html\n<script>([\s\S]*?)<\/script>\n```/.exec(markdown);
  if (!m?.[1]) throw new Error("DESIGN.md §8 초기 스크립트 코드 블록이 없음");
  return m[1];
}

// ─── CSS ────────────────────────────────────────────────────────────────────

export interface CssBlock {
  /** `{` 앞 문자열(선택자·at-rule). 최상위는 "" */
  prelude: string;
  /** 이 블록 바로 안의 선언(순서 유지) */
  declarations: Array<[name: string, value: string]>;
  /** 중첩 블록(@media 안의 규칙, @custom-variant 안의 규칙 등) */
  children: CssBlock[];
  /** `;`로 끝나는 at-rule 문장(@import, @slot 등) */
  statements: string[];
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** 주석을 지운 CSS를 블록 트리로 읽는다. 따옴표·괄호 안의 `{ } ;`는 구분자로 보지 않는다. */
export function parseCss(css: string): CssBlock {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let pos = 0;

  function parseBlock(prelude: string): CssBlock {
    const block: CssBlock = {
      prelude,
      declarations: [],
      children: [],
      statements: [],
    };
    let buf = "";
    let paren = 0;
    let quote: string | null = null;
    const flush = (): void => {
      const text = collapse(buf);
      buf = "";
      if (text === "") return;
      if (text.startsWith("@")) {
        block.statements.push(text);
        return;
      }
      const colon = text.indexOf(":");
      if (colon === -1) throw new Error(`CSS 선언을 읽지 못함: ${text}`);
      block.declarations.push([
        text.slice(0, colon).trim(),
        text.slice(colon + 1).trim(),
      ]);
    };
    while (pos < src.length) {
      const ch = src[pos] ?? "";
      pos++;
      if (quote) {
        buf += ch;
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        buf += ch;
        continue;
      }
      if (ch === "(") paren++;
      if (ch === ")") paren--;
      if (paren > 0) {
        buf += ch;
        continue;
      }
      if (ch === ";") {
        flush();
      } else if (ch === "{") {
        const childPrelude = collapse(buf);
        buf = "";
        block.children.push(parseBlock(childPrelude));
      } else if (ch === "}") {
        flush();
        return block;
      } else {
        buf += ch;
      }
    }
    flush();
    return block;
  }

  return parseBlock("");
}

/** 최상위에서 prelude가 같은 블록들 */
export function findBlocks(parent: CssBlock, prelude: string): CssBlock[] {
  return parent.children.filter((b) => b.prelude === prelude);
}

/** 선언 목록 → Map(같은 이름은 뒤의 값) */
export function declarationMap(block: CssBlock): Map<string, string> {
  return new Map(block.declarations);
}

/** globals.css의 토큰 블록(D0-10 구조). 각 블록은 정확히 하나여야 한다. */
export interface GlobalsCssBlocks {
  root: CssBlock;
  /** `@theme` — 기본 테마 정리(`--x-*: initial`) */
  themeReset: CssBlock;
  /** `@theme static` — 이름이 Tailwind 키와 같은 런타임 토큰 */
  themeStatic: CssBlock;
  /** `@theme inline` — 유틸리티 연결 */
  themeInline: CssBlock;
  /** `@media (width >= 64rem)` 안 `:root` */
  wide: CssBlock;
  /** `[data-theme="dark"]` */
  dark: CssBlock;
  /** `@media (prefers-color-scheme: dark)` 안 `:root:not([data-theme="light"])` */
  systemDark: CssBlock;
}

export const SELECTORS = {
  root: ":root",
  themeReset: "@theme",
  themeStatic: "@theme static",
  themeInline: "@theme inline",
  wideMedia: "@media (width >= 64rem)",
  dark: '[data-theme="dark"]',
  systemDarkMedia: "@media (prefers-color-scheme: dark)",
  systemDark: ':root:not([data-theme="light"])',
} as const;

function only(blocks: CssBlock[], label: string): CssBlock {
  if (blocks.length !== 1) {
    throw new Error(
      `globals.css: ${label} 블록이 ${blocks.length}개(정확히 1개여야 함)`,
    );
  }
  return blocks[0] as CssBlock;
}

export function globalsCssBlocks(tree: CssBlock): GlobalsCssBlocks {
  const wideMedia = only(
    findBlocks(tree, SELECTORS.wideMedia),
    SELECTORS.wideMedia,
  );
  const systemMedia = only(
    findBlocks(tree, SELECTORS.systemDarkMedia),
    SELECTORS.systemDarkMedia,
  );
  return {
    root: only(findBlocks(tree, SELECTORS.root), SELECTORS.root),
    themeReset: only(
      findBlocks(tree, SELECTORS.themeReset),
      SELECTORS.themeReset,
    ),
    themeStatic: only(
      findBlocks(tree, SELECTORS.themeStatic),
      SELECTORS.themeStatic,
    ),
    themeInline: only(
      findBlocks(tree, SELECTORS.themeInline),
      SELECTORS.themeInline,
    ),
    wide: only(
      findBlocks(wideMedia, SELECTORS.root),
      `${SELECTORS.wideMedia} ${SELECTORS.root}`,
    ),
    dark: only(findBlocks(tree, SELECTORS.dark), SELECTORS.dark),
    systemDark: only(
      findBlocks(systemMedia, SELECTORS.systemDark),
      `${SELECTORS.systemDarkMedia} ${SELECTORS.systemDark}`,
    ),
  };
}

/** 한 요소(<html>)에서 보이는 변수 값 — 블록을 cascade 순서로 겹친다(뒤가 이김). */
export function mergeScopes(
  ...blocks: CssBlock[]
): ReadonlyMap<string, string> {
  const scope = new Map<string, string>();
  for (const block of blocks) {
    for (const [name, value] of block.declarations) scope.set(name, value);
  }
  return scope;
}

/** 런타임 스코프 4종: 라이트(375) · 1024 이상 · 다크(사용자) · 다크(시스템) */
export function runtimeScopes(blocks: GlobalsCssBlocks): {
  light: ReadonlyMap<string, string>;
  wide: ReadonlyMap<string, string>;
  dark: ReadonlyMap<string, string>;
  systemDark: ReadonlyMap<string, string>;
} {
  // @theme static은 Tailwind가 @layer theme의 :root로 내보낸다 — 레이어가 낮아 같은 이름이 있으면 :root가 이긴다.
  const base = [blocks.themeStatic, blocks.root];
  return {
    light: mergeScopes(...base),
    wide: mergeScopes(...base, blocks.wide),
    dark: mergeScopes(...base, blocks.dark),
    systemDark: mergeScopes(...base, blocks.systemDark),
  };
}

/** var() 참조를 스코프에서 끝까지 푼다(대체값 지원). 못 풀면 오류. */
export function resolveVars(
  value: string,
  scope: ReadonlyMap<string, string>,
): string {
  let out = value;
  for (let depth = 0; depth < 32; depth++) {
    const m = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*?))?\s*\)/.exec(out);
    if (!m) return out;
    const name = m[1] ?? "";
    const replacement = scope.get(name) ?? m[2];
    if (replacement === undefined) {
      throw new Error(`var(${name})를 풀 수 없음(선언 없음): ${value}`);
    }
    out =
      out.slice(0, m.index) + replacement + out.slice(m.index + m[0].length);
  }
  throw new Error(`var() 참조가 너무 깊거나 순환함: ${value}`);
}

/**
 * 비교용 정규화(DESIGN §0.3): 대소문자·공백 무시, 쉼표·괄호 주변 공백 제거,
 * 소수 앞 0(`.2` = `0.2`, Prettier가 붙인다), 단위 붙은 0(`0px` = `0`).
 */
export function normalizeCssValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*,\s*/g, ",")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/(^|[^\d.])\.(\d)/g, "$10.$2")
    .replace(/(^|[^\d.])0(?:px|rem|em)\b/g, "$10");
}

/** 스코프 안에서 변수 하나의 최종 값(정규화). 선언이 없으면 null. */
export function resolvedToken(
  name: string,
  scope: ReadonlyMap<string, string>,
): string | null {
  const raw = scope.get(name);
  return raw === undefined ? null : normalizeCssValue(resolveVars(raw, scope));
}

// ─── 색·대비 ────────────────────────────────────────────────────────────────

/** CSS 색 리터럴(hex·색 함수) — 하드코딩 검사용. 주석을 지운 CSS 선언 값에 쓴다 */
export const COLOR_LITERAL_RE =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;

/**
 * TS·TSX 원문(주석·문자열 포함) 하드코딩 색 검사용. 전역 플래그라 matchAll로 쓴다.
 * CSS 파일은 parseCss로 주석을 지운 선언 값에 COLOR_LITERAL_RE를 쓴다(여러 값 속 `0 0 0 #fff`까지 잡힌다).
 * - hex 6·8자리: 어디서나
 * - hex 3·4자리: 색 문맥에서만 — Tailwind 임의값 `[#fff]`·`[0_0_0_#fff]`·`[red,#fff]`, 선언 값 `color: #fff`·
 *   `color: "#fff"`·`[color:#fff]`, SVG·HTML 색 속성 `fill="#fff"`·`stopColor="#fff"` 등.
 *   이슈 번호 `(#123)`, 앵커 `href="#feed"`, private 필드 `this.#bad`는 잡지 않는다.
 *   (빈칸 뒤의 짧은 hex — style 문자열 `"0 0 0 #fff"` — 는 글 속 `#123`과 구분할 수 없어 잡지 않는다)
 * - 색 함수: rgb(a)·hsl(a)·hwb·lab·lch·oklab·oklch, `color(<색 공간>…)` — 이름이 color인 JS 함수 호출은 제외
 */
export const SOURCE_COLOR_LITERAL_RE = new RegExp(
  [
    String.raw`#[0-9a-f]{6}(?:[0-9a-f]{2})?\b`,
    // 따옴표 3종(" ' `) 하나가 앞에 올 수 있다. 백틱은 String.raw 안이라 \`로 쓴다(정규식에서는 그냥 백틱)
    String.raw`(?<=(?:[[_,]|:\s*|\b(?:fill|stroke|color|stop-?color|flood-?color|lighting-?color|bgcolor)=\{?\s*)["'\`]?)#[0-9a-f]{3,4}\b`,
    String.raw`\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(`,
    String.raw`\bcolor\(\s*(?:from\b|srgb|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz)`,
  ].join("|"),
  "gi",
);

/** `#RRGGBB`(또는 `#RGB`) → [r, g, b] 0~255 */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) {
    throw new Error(`불투명 hex 색이 아님: ${hex}`);
  }
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** WCAG 2.x 상대 휘도 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x 대비비(1~21) */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `#RRGGBB` → 브라우저 계산값 꼴 `rgb(r, g, b)` (e2e 비교용) */
export function hexToCssRgb(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
}
