/**
 * 토큰 대조 테스트 (D0-10, DESIGN.md §0.2·§0.3·§11.2, PRD DR-02·DR-12)
 * DESIGN.md 토큰 표 ↔ src/app/globals.css 값이 라이트·다크(사용자)·다크(시스템)·1024 이상에서 모두 같은지,
 * 대비 하한(§2.10), 하드코딩 색, Tailwind 매핑(§11.2 이름 충돌)을 검사한다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { compile } from "tailwindcss";
import { beforeAll, describe, expect, it } from "vitest";

import { THEME_COLOR } from "@/lib/theme";

import {
  COLOR_LITERAL_RE,
  contrastRatio,
  GLOBALS_CSS_PATH,
  globalsCssBlocks,
  normalizeCssValue,
  parseContrastPairs,
  parseCss,
  parseDesignTokens,
  readDesignMd,
  readGlobalsCss,
  resolvedToken,
  resolveVars,
  runtimeScopes,
  SOURCE_COLOR_LITERAL_RE,
  splitTypeScale,
  type ColorToken,
  type CssBlock,
  type FixedToken,
  type ResponsiveToken,
} from "./support/design-tokens";

const designMd = readDesignMd();
const globalsCss = readGlobalsCss();
const tokens = parseDesignTokens(designMd);
const colors = tokens.filter((t): t is ColorToken => t.kind === "color");
const responsive = tokens.filter(
  (t): t is ResponsiveToken => t.kind === "responsive",
);
const fixed = tokens.filter((t): t is FixedToken => t.kind === "fixed");
const tree = parseCss(globalsCss);
const blocks = globalsCssBlocks(tree);
const scopes = runtimeScopes(blocks);

const tokenNames = new Set(tokens.map((t) => t.name));
const colorNames = new Set(colors.map((t) => t.name));
/** --text-X의 행간 짝 토큰 --lh-X (DESIGN §3.3) */
const lineHeightNames = new Set(
  responsive
    .filter((t) => t.name.startsWith("--text-"))
    .map((t) => t.name.replace(/^--text-/, "--lh-")),
);

const norm = normalizeCssValue;

/** 스코프에서 토큰 값(풀어서) — DESIGN 값도 같은 스코프에서 풀어 비교한다(예: `4px 4px 0 var(--ink)`) */
function expectValue(
  scope: ReadonlyMap<string, string>,
  name: string,
  designValue: string,
): string | null {
  const actual = resolvedToken(name, scope);
  const expected = norm(resolveVars(designValue, scope));
  return actual === expected
    ? null
    : `${name}: globals.css ${actual ?? "(선언 없음)"} ≠ DESIGN ${expected}`;
}

function names(block: CssBlock): string[] {
  return block.declarations.map(([name]) => name);
}

describe("DESIGN.md 토큰 표 읽기 (§0.3)", () => {
  it("세 형식의 토큰 표를 모두 읽는다", () => {
    expect(colors.length).toBeGreaterThan(0);
    expect(responsive.length).toBeGreaterThan(0);
    expect(fixed.length).toBeGreaterThan(0);
    // 절마다 대표 토큰 하나씩 — 표 형식이 바뀌어 통째로 빠지는 것을 막는다
    for (const name of [
      "--paper",
      "--brand-accent",
      "--background",
      "--competition-ucl-foreground",
      "--result-win",
      "--trend-down",
      "--transfer-progress",
      "--tier-3",
      "--hatch",
      "--text-card",
      "--num-meta",
      "--edge",
      "--font-sans",
      "--space-8",
      "--container",
      "--radius",
      "--shadow-print",
      "--ease",
    ]) {
      expect(tokenNames, name).toContain(name);
    }
  });

  it("컬러 값은 hex 대문자 6자리(또는 8자리)다", () => {
    const bad = colors.flatMap((t) =>
      [t.light, t.dark]
        .filter((v) => !/^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/.test(v))
        .map((v) => `${t.name}: ${v}`),
    );
    expect(bad).toEqual([]);
  });

  it("타입 스케일 --text-*·--num-* 값은 크기/행간/굵기/자간 꼴이다", () => {
    const bad = responsive
      .filter((t) => /^--(?:text|num)-/.test(t.name))
      .filter((t) => !splitTypeScale(t.narrow) || !splitTypeScale(t.wide))
      .map((t) => t.name);
    expect(bad).toEqual([]);
  });
});

describe("globals.css 구조", () => {
  it("자리표시값(oklch·[주의] 주석)이 남아 있지 않다", () => {
    expect(globalsCss).not.toContain("자리표시값");
    expect(globalsCss).not.toMatch(/oklch\(/i);
  });

  it("클래스 탐색은 src/만, cn 병합 설정(src/lib/utils.ts)은 뺀다 — 색 이름 border·ring이 유틸리티를 만들지 않게", () => {
    expect(tree.statements).toEqual(
      expect.arrayContaining([
        '@import "tailwindcss" source("..")',
        '@source not "../lib/utils.ts"',
      ]),
    );
  });

  it("DESIGN.md에 없는 변수를 토큰 블록에 선언하지 않는다(--lh-*는 --text-* 짝)", () => {
    const allowed = (name: string): boolean =>
      tokenNames.has(name) || lineHeightNames.has(name);
    const extra = [
      blocks.root,
      blocks.themeStatic,
      blocks.wide,
      blocks.dark,
      blocks.systemDark,
    ].flatMap((block) =>
      names(block)
        .filter((name) => name !== "color-scheme" && !allowed(name))
        .map((name) => `${block.prelude} ${name}`),
    );
    expect(extra).toEqual([]);
  });

  it("한 토큰은 한 블록에만 처음 선언한다(:root와 @theme static에 같은 이름 금지)", () => {
    const rootNames = new Set(names(blocks.root));
    expect(names(blocks.themeStatic).filter((n) => rootNames.has(n))).toEqual(
      [],
    );
  });

  it("테마 블록에 color-scheme이 있다(라이트 light, 다크 두 블록 dark)", () => {
    expect(scopes.light.get("color-scheme")).toBe("light");
    expect(scopes.dark.get("color-scheme")).toBe("dark");
    expect(scopes.systemDark.get("color-scheme")).toBe("dark");
  });

  it("시스템 다크 블록은 [data-theme=dark] 블록과 선언이 똑같다(DESIGN §8)", () => {
    expect(blocks.systemDark.declarations).toEqual(blocks.dark.declarations);
  });

  it("다크 블록에는 컬러 토큰만 둔다", () => {
    expect(
      names(blocks.dark).filter(
        (n) => n !== "color-scheme" && !colorNames.has(n),
      ),
    ).toEqual([]);
  });

  it("1024 이상 블록에는 반응형 토큰(+ 행간 짝)만 둔다", () => {
    const allowed = new Set([
      ...responsive.map((t) => t.name),
      ...lineHeightNames,
    ]);
    expect(names(blocks.wide).filter((n) => !allowed.has(n))).toEqual([]);
  });
});

describe("값 대조 — DESIGN.md = globals.css", () => {
  it("컬러 토큰: 라이트(:root)", () => {
    const diff = colors
      .map((t) => expectValue(scopes.light, t.name, t.light))
      .filter(Boolean);
    expect(diff).toEqual([]);
  });

  it('컬러 토큰: 다크([data-theme="dark"])', () => {
    const diff = colors
      .map((t) => expectValue(scopes.dark, t.name, t.dark))
      .filter(Boolean);
    expect(diff).toEqual([]);
  });

  it("컬러 토큰: 다크(prefers-color-scheme, 속성 없음)", () => {
    const diff = colors
      .map((t) => expectValue(scopes.systemDark, t.name, t.dark))
      .filter(Boolean);
    expect(diff).toEqual([]);
  });

  it("반응형 토큰: 375 = :root, 1280 열 = @media (width >= 64rem) — 타입은 크기·행간(--lh-*)", () => {
    const diff: string[] = [];
    for (const t of responsive) {
      const scale = /^--(?:text|num)-/.test(t.name)
        ? {
            narrow: splitTypeScale(t.narrow),
            wide: splitTypeScale(t.wide),
          }
        : null;
      const narrowSize = scale?.narrow?.size ?? t.narrow;
      const wideSize = scale?.wide?.size ?? t.wide;
      diff.push(
        ...[
          expectValue(scopes.light, t.name, narrowSize),
          expectValue(scopes.wide, t.name, wideSize),
        ].filter((d): d is string => d !== null),
      );
      if (t.name.startsWith("--text-") && scale?.narrow && scale.wide) {
        const lh = t.name.replace(/^--text-/, "--lh-");
        diff.push(
          ...[
            expectValue(scopes.light, lh, scale.narrow.lineHeight),
            expectValue(scopes.wide, lh, scale.wide.lineHeight),
          ].filter((d): d is string => d !== null),
        );
      }
    }
    expect(diff).toEqual([]);
  });

  it("고정 토큰: 테마·폭과 무관하게 같은 값", () => {
    const diff = fixed.flatMap((t) =>
      [scopes.light, scopes.wide, scopes.dark, scopes.systemDark]
        .map((scope) => expectValue(scope, t.name, t.value))
        .filter((d): d is string => d !== null),
    );
    expect(diff).toEqual([]);
  });

  it("theme-color 메타 값(src/lib/theme.ts)은 --paper 라이트·다크와 같다", () => {
    const paper = colors.find((t) => t.name === "--paper");
    expect(THEME_COLOR).toEqual({ light: paper?.light, dark: paper?.dark });
  });
});

describe("대비 (DESIGN §2 · §2.10 내부 하한 텍스트 5.3 · 비텍스트 3.4)", () => {
  const documented = parseContrastPairs(designMd);
  const TEXT_FLOOR = 5.3;
  const NON_TEXT_FLOOR = 3.4;

  function hexOf(name: string, scope: ReadonlyMap<string, string>): string {
    const value = resolvedToken(name, scope);
    if (!value?.startsWith("#")) {
      throw new Error(`${name}: hex 색이 아님(${value})`);
    }
    return value;
  }

  const themes = [
    ["라이트", scopes.light],
    ["다크", scopes.dark],
    ["시스템 다크", scopes.systemDark],
  ] as const;

  it("DESIGN.md의 대비 표·문장을 읽는다", () => {
    expect(documented.length).toBeGreaterThanOrEqual(30);
  });

  it("문서에 적힌 대비비가 globals.css 값으로 다시 잰 값과 같다(±0.01)", () => {
    const diff: string[] = [];
    for (const pair of documented) {
      for (const [label, scope] of themes) {
        const expected = label === "라이트" ? pair.light : pair.dark;
        const actual = contrastRatio(
          hexOf(pair.fg, scope),
          hexOf(pair.bg, scope),
        );
        if (Math.abs(actual - expected) > 0.011) {
          diff.push(
            `${pair.source} ${pair.fg} / ${pair.bg} ${label}: 실측 ${actual.toFixed(2)} ≠ 문서 ${expected}`,
          );
        }
      }
    }
    expect(diff).toEqual([]);
  });

  /** 문서 표의 기준(4.5·3.0) + 본문 문장 쌍과 핵심 쌍의 기준 */
  const REQUIRED: ReadonlyArray<[fg: string, bg: string, threshold: number]> = [
    // 본문·보조 텍스트 / 배경
    ["--foreground", "--background", 4.5],
    ["--muted-foreground", "--background", 4.5],
    ["--muted-foreground", "--muted", 4.5],
    ["--card-foreground", "--card", 4.5],
    ["--popover-foreground", "--popover", 4.5],
    ["--primary-foreground", "--primary", 4.5],
    ["--secondary-foreground", "--secondary", 4.5],
    ["--accent-foreground", "--accent", 4.5],
    ["--destructive", "--background", 4.5],
    // 레드 면 위 글자 · 포커스 링 / 배경 · 입력 경계
    ["--brand-accent-foreground", "--brand-accent", 4.5],
    ["--brand-accent-text", "--paper", 4.5],
    ["--ring", "--background", 3],
    ["--ring", "--paper-2", 3],
    ["--input", "--background", 3],
    // 대회 6색 — 면 위 약칭 · 면 / 지면
    ...(["epl", "laliga", "seriea", "bundesliga", "ligue1", "ucl"].flatMap(
      (id) => [
        [`--competition-${id}-foreground`, `--competition-${id}`, 4.5],
        [`--competition-${id}`, "--paper", 3],
      ],
    ) as Array<[string, string, number]>),
    // 결과·변동·이적·Tier·상태(§2.5~§2.9 본문)
    ["--result-win", "--paper", 4.5],
    ["--result-draw", "--paper", 4.5],
    ["--result-loss", "--paper", 4.5],
    ["--trend-up", "--paper", 4.5],
    ["--trend-down", "--paper", 4.5],
    ["--transfer-progress", "--paper", 3],
    ["--transfer-official", "--paper", 3],
    ["--transfer-collapsed", "--paper", 3],
    ["--paper", "--tier-1", 4.5],
    ["--tier-2", "--paper", 3],
    ["--tier-3", "--paper", 4.5],
    ["--ink-2", "--hatch", 4.5],
    ["--paper", "--ink", 4.5],
    // 티켓·뒤표지 안 글자(포커스 링 지역 재정의 색 포함)
    ["--ticket-fg", "--ticket", 4.5],
    ["--ticket-fg-2", "--ticket", 4.5],
    ["--colophon-fg", "--colophon", 4.5],
    ["--colophon-fg-2", "--colophon", 4.5],
  ];

  it("모든 쌍이 WCAG AA 이상이고 내부 하한(텍스트 5.3 · 비텍스트 3.4)을 지킨다 — 라이트·다크·시스템 다크", () => {
    const pairs = [
      ...documented
        .filter((p) => p.threshold !== null)
        .map((p) => [p.fg, p.bg, p.threshold as number] as const),
      ...REQUIRED,
    ];
    const fails: string[] = [];
    for (const [fg, bg, threshold] of pairs) {
      const floor = threshold >= 4.5 ? TEXT_FLOOR : NON_TEXT_FLOOR;
      for (const [label, scope] of themes) {
        const ratio = contrastRatio(hexOf(fg, scope), hexOf(bg, scope));
        if (ratio < floor) {
          fails.push(
            `${fg} / ${bg} ${label}: ${ratio.toFixed(2)} < ${floor} (WCAG ${threshold})`,
          );
        }
      }
    }
    expect(fails).toEqual([]);
  });
});

describe("@theme 매핑 (DESIGN §11.2)", () => {
  // Prettier가 긴 var()를 줄바꿈하므로 값은 정규화해서 비교한다
  const inline = new Map(
    blocks.themeInline.declarations.map(([key, value]) => [key, norm(value)]),
  );
  const runtimeNames = new Set([
    ...names(blocks.root),
    ...names(blocks.wide),
    ...names(blocks.dark),
  ]);

  it("모든 컬러 토큰이 --color-<이름>으로 이어진다(bg-paper, text-ink-2 …)", () => {
    const missing = colors
      .filter(
        (t) => inline.get(`--color-${t.name.slice(2)}`) !== `var(${t.name})`,
      )
      .map((t) => t.name);
    expect(missing).toEqual([]);
  });

  it("--color-* 키는 DESIGN 컬러 토큰만 가리킨다", () => {
    const bad = [...inline]
      .filter(([key]) => key.startsWith("--color-"))
      .filter(([, value]) => {
        const m = /^var\((--[\w-]+)\)$/.exec(value);
        return !m?.[1] || !colorNames.has(m[1]);
      })
      .map(([key, value]) => `${key}: ${value}`);
    expect(bad).toEqual([]);
  });

  it("타입 스케일 키 규칙: --text-X → --text-type-X(+ --line-height), --num-X → --text-num-X", () => {
    const missing: string[] = [];
    for (const t of responsive) {
      if (t.name.startsWith("--text-")) {
        const id = t.name.slice("--text-".length);
        if (inline.get(`--text-type-${id}`) !== `var(${t.name})`) {
          missing.push(`--text-type-${id}`);
        }
        if (
          inline.get(`--text-type-${id}--line-height`) !== `var(--lh-${id})`
        ) {
          missing.push(`--text-type-${id}--line-height`);
        }
      } else if (t.name.startsWith("--num-")) {
        const id = t.name.slice("--num-".length);
        if (inline.get(`--text-num-${id}`) !== `var(${t.name})`) {
          missing.push(`--text-num-${id}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("@theme 키는 런타임 토큰과 이름이 겹치지 않는다(자기 참조 방지)", () => {
    const clash = [
      ...names(blocks.themeInline),
      ...names(blocks.themeStatic),
    ].filter((n) => runtimeNames.has(n));
    expect(clash).toEqual([]);
  });

  it("@theme inline 값은 var() 참조뿐이다(새 값·색 리터럴 없음)", () => {
    const bad = blocks.themeInline.declarations
      .filter(([, value]) => {
        const withoutVars = value.replace(/var\(\s*--[\w-]+\s*\)/g, "");
        // calc 배율 숫자(shadcn radius)만 허용
        return !/^(?:calc\(\s*\*\s*[\d.]+\s*\))?$/.test(withoutVars.trim());
      })
      .map(([key, value]) => `${key}: ${value}`);
    expect(bad).toEqual([]);
  });

  it("Tailwind 기본 팔레트·둥근 모서리·블러 그림자(상자·안쪽·드롭·글자)·곡선·애니메이션을 지운다", () => {
    expect(blocks.themeReset.declarations).toEqual(
      expect.arrayContaining([
        ["--color-*", "initial"],
        ["--radius-*", "initial"],
        ["--shadow-*", "initial"],
        ["--inset-shadow-*", "initial"],
        ["--drop-shadow-*", "initial"],
        ["--text-shadow-*", "initial"],
        ["--ease-*", "initial"],
        ["--animate-*", "initial"],
      ]),
    );
  });
});

describe("하드코딩 색 금지", () => {
  /** CSS 트리에서 색 리터럴이 든 선언(주석은 parseCss가 지운다). skip 블록은 건너뛰고 자식은 본다 */
  function colorDeclarations(
    root: CssBlock,
    skip: ReadonlySet<CssBlock> = new Set(),
  ): string[] {
    const found: string[] = [];
    const walk = (block: CssBlock, trail: string): void => {
      if (!skip.has(block)) {
        for (const [name, value] of block.declarations) {
          if (COLOR_LITERAL_RE.test(value)) {
            found.push(`${trail} { ${name}: ${value} }`);
          }
        }
      }
      for (const child of block.children) {
        walk(child, `${trail} ${child.prelude}`.trim());
      }
    };
    walk(root, "");
    return found;
  }

  it("globals.css의 색 리터럴은 토큰 블록(:root·다크 두 블록) 안에만 있다", () => {
    expect(
      colorDeclarations(
        tree,
        new Set([blocks.root, blocks.dark, blocks.systemDark]),
      ),
    ).toEqual([]);
  });

  it("src/ 아래 색 리터럴(hex·색 함수)은 globals.css·theme-color(src/lib/theme.ts)·키트 글자색(src/lib/kit-contrast.ts)뿐이다", () => {
    const srcDir = path.dirname(path.dirname(GLOBALS_CSS_PATH));
    const allowed = new Set([
      GLOBALS_CSS_PATH,
      path.join(srcDir, "lib", "theme.ts"),
      // 팀 배지 약어 글자색 #FFFFFF·#14213D — 테마와 무관한 데이터 색 위 고정 값(PRD §15 D62 ④, M2-05 — 토큰 아님)
      path.join(srcDir, "lib", "kit-contrast.ts"),
    ]);
    const files: string[] = [];
    const collect = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) collect(full);
        else if (/\.(?:css|ts|tsx)$/.test(entry)) files.push(full);
      }
    };
    collect(srcDir);
    expect(files.length).toBeGreaterThan(1);
    const found = files
      .filter((file) => !allowed.has(file))
      .flatMap((file) => {
        const text = readFileSync(file, "utf8");
        const where = path.relative(srcDir, file);
        // CSS는 주석을 지운 선언 값 전체, TS·TSX는 원문에서 색 문맥만(SOURCE_COLOR_LITERAL_RE 설명)
        return file.endsWith(".css")
          ? colorDeclarations(parseCss(text)).map((d) => `${where}: ${d}`)
          : [...text.matchAll(SOURCE_COLOR_LITERAL_RE)].map(
              (m) => `${where}: ${m[0]}`,
            );
      });
    expect(found).toEqual([]);
  });

  it("TS·TSX 색 검사 정규식은 3자리 hex·hwb·lab·lch·color()까지 잡고 이슈 번호·앵커는 잡지 않는다", () => {
    const hits = (text: string): string[] =>
      [...text.matchAll(SOURCE_COLOR_LITERAL_RE)].map((m) => m[0]);
    const caught = [
      'className="bg-[#fff]"',
      'className="text-[#ABCD]/50"',
      'className="shadow-[0_0_0_#fff]"',
      'className="bg-[linear-gradient(red,#fff)]"',
      "color: #abc;",
      'style={{ color: "#fff" }}',
      "[color:#fff]",
      'fill="#fff"',
      "stopColor='#abc'",
      "stroke={`#000`}",
      "#a1b2c3",
      "#A1B2C3D4",
      "rgb(0 0 0)",
      "rgba(0,0,0,.1)",
      "hsl(0 0% 0%)",
      "hwb(0 0% 0%)",
      "lab(50% 0 0)",
      "lch(50% 0 0)",
      "oklab(0.5 0 0)",
      "oklch(0.5 0 0)",
      "color(display-p3 1 0 0)",
      "color(srgb 1 0 0)",
      "color(from var(--ink) srgb r g b)",
    ];
    const ignored = [
      "(#123)",
      "이슈 #123, #4567",
      'href="#feed"',
      "this.#bad",
      "color(team)",
      "getColor(x)",
      "label(x)",
      "#abcde",
      "#abcdef1",
      "#c_0a1b2c3d4e",
    ];
    expect(caught.filter((text) => hits(text).length === 0)).toEqual([]);
    expect(ignored.filter((text) => hits(text).length > 0)).toEqual([]);
  });
});

describe("Tailwind 컴파일 결과 (tailwindcss compile — 실제 유틸리티)", () => {
  let css = "";

  /** 지운 기본값(블러 그림자 4종·둥근 모서리·팔레트 색·반복 애니메이션·기본 곡선) — 만들어지면 안 된다 */
  const REMOVED_DEFAULTS = [
    "shadow-sm",
    "inset-shadow-sm",
    "drop-shadow-md",
    "text-shadow-lg",
    "rounded-xs",
    "bg-red-500",
    "bg-white",
    "animate-pulse",
    "ease-in-out",
  ];

  beforeAll(async () => {
    const require = createRequire(import.meta.url);
    const twIndex = require.resolve("tailwindcss/index.css");
    const compiler = await compile(globalsCss, {
      base: path.dirname(GLOBALS_CSS_PATH),
      loadStylesheet: async (id: string, base: string) => {
        const file = id === "tailwindcss" ? twIndex : path.resolve(base, id);
        return {
          path: file,
          base: path.dirname(file),
          content: readFileSync(file, "utf8"),
        };
      },
    });
    css = compiler.build([
      "text-type-card",
      "text-card",
      "text-num-score",
      "bg-paper",
      "text-competition-epl-foreground",
      "dark:bg-paper",
      "font-sans",
      "font-numeric",
      "font-latin",
      "shadow-print",
      "rounded-lg",
      "px-edge",
      "max-w-page",
      "duration-base",
      "ease-print",
      "transition-colors",
      "animate-stamp",
      "animate-tear",
      "animate-eject",
      "animate-arrive",
      // 지운 기본값 — 만들어지면 안 된다
      ...REMOVED_DEFAULTS,
    ]);
  });

  /** 유틸리티 하나의 선언부 */
  function rule(selector: string): string | null {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\:]/g, "\\$&");
    const m = new RegExp(`\\.${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    return m?.[1] ?? null;
  }

  it("타입 유틸리티는 크기 + 행간이다(text-card는 색 — 이름 충돌 회피 확인)", () => {
    expect(rule("text-type-card")).toMatch(/font-size:\s*var\(--text-card\)/);
    expect(rule("text-type-card")).toMatch(/line-height:.*var\(--lh-card\)/);
    expect(rule("text-num-score")).toMatch(/font-size:\s*var\(--num-score\)/);
    expect(rule("text-card")).toMatch(/color:\s*var\(--card\)/);
  });

  it("토큰 색·폰트·레이아웃·모션 유틸리티가 만들어진다", () => {
    expect(rule("bg-paper")).toMatch(/background-color:\s*var\(--paper\)/);
    expect(rule("text-competition-epl-foreground")).toMatch(
      /color:\s*var\(--competition-epl-foreground\)/,
    );
    expect(rule("font-numeric")).toMatch(
      /font-family:\s*var\(--font-numeric\)/,
    );
    expect(rule("font-latin")).toMatch(/font-family:\s*var\(--font-latin\)/);
    expect(rule("shadow-print")).toMatch(/var\(--ink\)/);
    expect(rule("rounded-lg")).toMatch(/border-radius:\s*var\(--radius\)/);
    expect(rule("px-edge")).toMatch(/var\(--edge\)/);
    expect(rule("max-w-page")).toMatch(/var\(--container\)/);
    expect(rule("duration-base")).toMatch(/var\(--duration-base\)/);
    expect(rule("ease-print")).toMatch(/var\(--ease\)/);
    expect(rule("transition-colors")).toMatch(/var\(--duration-fast\)/);
    expect(rule("transition-colors")).toMatch(/var\(--ease\)/);
  });

  it("인쇄형 모션 4종: animate-X 유틸리티와 같은 이름의 키프레임이 만들어진다(DESIGN §6.1, D0-12)", () => {
    for (const name of ["stamp", "tear", "eject", "arrive"]) {
      expect(rule(`animate-${name}`), name).toMatch(
        new RegExp(`animation:\\s*var\\(--animate-${name}\\)`),
      );
      expect(css, `@keyframes ${name}`).toMatch(
        new RegExp(`@keyframes ${name}\\s*\\{`),
      );
    }
    // 지속 시간·곡선은 모션 토큰을 참조한다(새 값 없음)
    const theme = /@layer theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(theme).toMatch(
      /--animate-eject:\s*eject var\(--duration-base\) var\(--ease\) both;/,
    );
  });

  it("--font-sans는 DESIGN 스택이고 Tailwind 기본 스택(ui-sans-serif)은 테마 변수에 없다", () => {
    const theme = /@layer theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    const fontSans = /--font-sans:\s*([^;]+);/.exec(theme)?.[1] ?? "";
    const design = fixed.find((t) => t.name === "--font-sans")?.value ?? "";
    expect(norm(fontSans)).toBe(norm(design));
    expect(theme).not.toContain("ui-sans-serif");
  });

  it("dark: 변형은 사용자 다크와 시스템 다크(라이트를 고르지 않았을 때) 둘 다 켠다", () => {
    expect(css).toMatch(
      /\.dark\\:bg-paper:where\(\[data-theme="dark"\], \[data-theme="dark"\] \*\)/,
    );
    expect(css).toMatch(
      /@media \(prefers-color-scheme: dark\)\s*\{\s*\.dark\\:bg-paper:where\(:root:not\(\[data-theme="light"\]\)/,
    );
  });

  it("지운 기본값(블러 그림자 4종·둥근 모서리·팔레트 색·반복 애니메이션·기본 곡선)은 만들어지지 않는다", () => {
    for (const name of REMOVED_DEFAULTS) {
      expect(rule(name), name).toBeNull();
    }
  });

  it("포커스 링: :focus-visible 3px 실선 --ring, 2px 띄움(DESIGN §9.1)", () => {
    expect(css).toMatch(
      /:focus-visible\s*\{\s*outline:\s*3px solid var\(--ring\);\s*outline-offset:\s*2px;\s*\}/,
    );
  });

  it("모션 줄이기: prefers-reduced-motion: reduce면 모든 요소의 애니메이션·전환이 0이다(DESIGN §6.3)", () => {
    const block =
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{([^}]*)\}/.exec(
        css,
      )?.[1] ?? "";
    for (const declaration of [
      "animation-duration: 0s !important",
      "animation-delay: 0s !important",
      "transition-duration: 0s !important",
      "scroll-behavior: auto !important",
    ]) {
      expect(block, declaration).toContain(declaration);
    }
  });
});
