/**
 * 웹폰트 글자 커버리지 (D0-11, PRD DR-03, DESIGN.md §3.6·§3.7)
 * 서브셋(public/fonts)의 cmap에 화면에 나올 글자가 모두 있는지 본다. 빠진 글자는 시스템 글꼴로 그려져 모양이 섞인다.
 *
 * 대상
 * 1. KS X 1001 한글 2,350자(EUC-KR 0xB0A1~0xC8FE) — 서브셋 기준(PRD §15 D29)
 * 2. fixtures 3파일(news-sample·brief-sample·news-sample.meta)의 표시 문자열
 * 3. configs/*.json의 표시 문자열(이름·표기 사전 등)
 * 4. src/ 안의 화면 문구 — TypeScript 구문 트리의 문자열 리터럴·템플릿·JSX 텍스트(주석·import 경로 제외)
 * 표시하지 않는 메모 필드(키가 `_`로 시작, `note`·`notes`)는 뺀다.
 *
 * 의도된 예외(DESIGN §3.7): 이모지(Extended_Pictographic·이모지 구성 문자)와 ⌘는 어느 서브셋에도 없고 시스템 폴백에 맡긴다.
 * 새 소스·문구로 이 테스트가 깨지면 서브셋 스크립트(FONTLOG.txt 참고)로 글자를 더해 파일을 다시 만들고
 * DESIGN §3.1 크기 표·FONTLOG를 고친다. 예외를 늘리는 것은 DESIGN §3.7을 먼저 고친 뒤에 한다.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { WEB_FONT_FACES } from "@/lib/fonts";

import { readWoff2, type Woff2Font } from "./support/woff2";

const font = (family: string, weight: number): Woff2Font => {
  const face = WEB_FONT_FACES.find(
    (f) => f.family === family && f.weight === weight,
  );
  if (!face) throw new Error(`${family} ${weight} 없음`);
  return readWoff2(path.resolve("public", face.path.replace(/^\//, "")));
};

const sans = [font("EuroDigest Sans", 400), font("EuroDigest Sans", 800)];
const latin = [font("Barlow Condensed", 600), font("Barlow Condensed", 800)];

/** DESIGN §3.7 — 서브셋 밖에 두는 글자(시스템 폴백) */
function isIntendedFallback(char: string): boolean {
  if (char === "⌘") return true;
  // 숫자·#·*는 Emoji_Component지만 일반 글자다
  return (
    /\p{Extended_Pictographic}|\p{Emoji_Component}/u.test(char) &&
    !/[0-9#*]/.test(char)
  );
}

/** 표시 문자열에서 서브셋에 없는 글자(제어 문자·공백류 제외, 예외 제외) */
function missing(
  texts: Iterable<string>,
  fonts: readonly Woff2Font[],
): string[] {
  const chars = new Set<string>();
  for (const text of texts) for (const c of text) chars.add(c);
  return [...chars]
    .filter((c) => (c.codePointAt(0) ?? 0) >= 0x20 && !/\s/u.test(c))
    .filter((c) => !isIntendedFallback(c))
    .filter((c) => fonts.some((f) => !f.cmap.has(c.codePointAt(0) ?? -1)))
    .sort();
}

/** 예외 글자 중 실제로 나온 것(보고용) */
function intendedFallbacks(texts: Iterable<string>): string[] {
  const chars = new Set<string>();
  for (const text of texts)
    for (const c of text) if (isIntendedFallback(c)) chars.add(c);
  return [...chars].sort();
}

const NON_DISPLAY_KEYS = new Set(["note", "notes"]);

/** JSON의 표시 문자열 — 값과 키(라벨 사전의 키가 화면에 나올 수 있다), 메모 필드 제외 */
function displayStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(displayStrings);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, v]) =>
      key.startsWith("_") || NON_DISPLAY_KEYS.has(key)
        ? []
        : [key, ...displayStrings(v)],
    );
  }
  return [];
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(path.resolve(file), "utf8")) as unknown;
}

const FIXTURE_FILES = [
  "fixtures/news-sample.json",
  "fixtures/brief-sample.json",
  "fixtures/news-sample.meta.json",
];

const CONFIG_FILES = readdirSync(path.resolve("configs"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => `configs/${f}`)
  .sort();

/** src/ 화면 문구 — 문자열 리터럴·템플릿 조각·JSX 텍스트. 주석과 import·export 경로는 읽지 않는다 */
function sourceStrings(dir: string): string[] {
  const files = readdirSync(path.resolve(dir), { recursive: true })
    .map(String)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => path.join(path.resolve(dir), f));
  const out: string[] = [];
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node) ||
        ts.isJsxText(node)
      ) {
        out.push(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return out;
}

describe("서브셋 기준 글자", () => {
  it("KS X 1001 한글 2,350자가 EuroDigest Sans 400·800에 모두 있다", () => {
    const decoder = new TextDecoder("euc-kr");
    const hangul: string[] = [];
    for (let lead = 0xb0; lead <= 0xc8; lead += 1) {
      for (let trail = 0xa1; trail <= 0xfe; trail += 1) {
        hangul.push(decoder.decode(Uint8Array.from([lead, trail])));
      }
    }
    expect(hangul).toHaveLength(2350);
    expect(new Set(hangul).size).toBe(2350);
    expect(hangul.every((c) => /^\p{Script=Hangul}$/u.test(c))).toBe(true);
    expect(missing(hangul, sans)).toEqual([]);
  });

  it("숫자·기본 라틴(U+0020~007E)은 두 패밀리 모두에 있다", () => {
    const ascii = Array.from({ length: 0x7f - 0x20 }, (_, i) =>
      String.fromCodePoint(0x20 + i),
    );
    expect(missing(ascii, sans)).toEqual([]);
    expect(missing(ascii, latin)).toEqual([]);
  });
});

describe("데이터·문구 글자 — 서브셋 밖은 의도된 예외(이모지·⌘)뿐", () => {
  it.each(FIXTURE_FILES)("%s → EuroDigest Sans", (file) => {
    expect(missing(displayStrings(readJson(file)), sans)).toEqual([]);
  });

  it.each(CONFIG_FILES)("%s → EuroDigest Sans", (file) => {
    expect(missing(displayStrings(readJson(file)), sans)).toEqual([]);
  });

  it("src/ 화면 문구 → EuroDigest Sans", () => {
    const strings = sourceStrings("src");
    expect(strings.length).toBeGreaterThan(0);
    expect(missing(strings, sans)).toEqual([]);
  });

  it("라틴 원제목(lang ≠ ko) → Barlow Condensed 600·800", () => {
    const news = readJson("fixtures/news-sample.json") as {
      cards: { t: string; lang: string }[];
    };
    const titles = news.cards.filter((c) => c.lang !== "ko").map((c) => c.t);
    expect(titles.length).toBeGreaterThan(0);
    expect(missing(titles, latin)).toEqual([]);
  });

  it("지금 fixtures에 나오는 예외 글자는 🚨 하나다(DESIGN §3.7 — 바뀌면 문서와 함께 확인)", () => {
    const texts = [...FIXTURE_FILES, ...CONFIG_FILES].flatMap((f) =>
      displayStrings(readJson(f)),
    );
    expect(intendedFallbacks(texts)).toEqual(["🚨"]);
  });
});
