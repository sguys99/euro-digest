/**
 * 삭제 요청 빌드 제외 가드 (M1-25, FR-143) — 카드를 내보내는 빌드 경로가 takedown 제외를 빼먹지 않게.
 *
 *   ① 빌드 경로 코드(src/ 전부 + scripts/build-feeds.ts — RSS·ics·검색·OG, M4-11·M4-12·M4-14·M5-01)는 data/news를 직접 읽지 않는다:
 *      `data/news` 경로 문자열·`NewsFileSchema`(뉴스 파일 직접 검증)·scripts의 뉴스 파일 읽기(news-file.ts·seen-urls.ts)를
 *      쓰면 실패. 허용: src/lib/data/news.ts(로더 — 유일한 읽기), src/lib/schema/(스키마·레지스트리 패턴).
 *   ② src/lib/data/news.ts의 공개 로더(`load…`)는 모두 삭제 요청 카드를 뺀다 — 아래 표에 없는 새 로더가 생기면 실패(표에 넣고
 *      제외를 확인하라는 신호).
 * 주석은 검사하지 않는다(TypeScript 프린터로 주석을 지운 코드만 본다).
 */
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as newsLoader from "@/lib/data/news";
import type { NewsFile } from "@/lib/schema";

const ROOT = path.resolve(".");

/** 빌드 경로 코드 — src/ 아래 .ts·.tsx 전부 + 빌드 후반 단계 스크립트 */
function buildPathFiles(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) return walk(rel);
      return /\.(ts|tsx)$/.test(e.name) ? [rel] : [];
    });
  return [...walk("src"), "scripts/build-feeds.ts"].sort();
}

/**
 * 허용: 로더 자신, 스키마(레지스트리 패턴 문자열·NewsFileSchema 정의), 견본 페이지(SPECIMEN=1 견본 빌드 전용 — fixtures/news-sample.json을
 * 검증해 쓴다. 공개 빌드에는 없다 — CLAUDE.md §5 test:specimen)
 */
const ALLOWED = (rel: string) =>
  rel === "src/lib/data/news.ts" ||
  rel.startsWith("src/lib/schema/") ||
  rel.startsWith("src/app/specimen/");

const SCRIPTS_NEWS_READERS = /(?:^|\/)lib\/(?:news-file|seen-urls)$/;

/**
 * 코드에서 금지 패턴을 찾는다 — TypeScript AST로 본다(주석은 자연히 빠진다).
 *   - 문자열에 `data/news`(import 경로 `@/lib/data/news`는 로더 자신이라 허용)
 *   - path.join·path.resolve 인자에 "news" 조각(`path.join(dataDir, "news")`)
 *   - `NewsFileSchema`(뉴스 파일을 직접 검증 = 직접 읽기)
 *   - scripts의 뉴스 파일 읽기 모듈 import(news-file.ts·seen-urls.ts — 삭제 요청을 빼지 않는다)
 */
function forbiddenIn(fileName: string, text: string): string[] {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const hits = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (SCRIPTS_NEWS_READERS.test(node.moduleSpecifier.text)) {
        hits.add("scripts 뉴스 파일 읽기(news-file·seen-urls)");
      }
      return; // 모듈 경로 문자열은 아래 경로 검사에서 뺀다
    }
    if (
      (ts.isStringLiteralLike(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)) &&
      /data\/news/.test(node.text)
    ) {
      hits.add("data/news 경로 문자열");
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["join", "resolve"].includes(node.expression.name.text) &&
      node.arguments.some((a) => ts.isStringLiteralLike(a) && a.text === "news")
    ) {
      hits.add('path 조각 "news"');
    }
    if (ts.isIdentifier(node) && node.text === "NewsFileSchema") {
      hits.add("NewsFileSchema(뉴스 파일 직접 검증)");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...hits].sort();
}

describe("① 빌드 경로는 data/news를 직접 읽지 않는다 — src/lib/data/news.ts 로더만", () => {
  const files = buildPathFiles();

  it("검사 대상이 있다(src/ + scripts/build-feeds.ts)", () => {
    expect(files).toContain("src/app/page.tsx");
    expect(files).toContain("src/lib/data/news.ts");
    expect(files).toContain("scripts/build-feeds.ts");
  });

  it.each(files.filter((f) => !ALLOWED(f)))("%s", (rel) => {
    expect(
      forbiddenIn(rel, readFileSync(path.join(ROOT, rel), "utf8")),
    ).toEqual([]);
  });

  it("가드가 실제로 잡는다(주석·로더 import 경로는 무시)", () => {
    const probe = (text: string) => forbiddenIn("probe.ts", text);
    expect(probe('const dir = path.resolve("data/news");')).toEqual([
      "data/news 경로 문자열",
    ]);
    expect(probe("const f = `${root}/data/news/${date}.json`;")).toEqual([
      "data/news 경로 문자열",
    ]);
    expect(probe('const dir = path.join(dataDir, "news");')).toEqual([
      'path 조각 "news"',
    ]);
    expect(
      probe(
        'import { NewsFileSchema } from "@/lib/schema";\nNewsFileSchema.parse(x);',
      ),
    ).toEqual(["NewsFileSchema(뉴스 파일 직접 검증)"]);
    expect(probe('import { readNewsFile } from "./lib/news-file";')).toEqual([
      "scripts 뉴스 파일 읽기(news-file·seen-urls)",
    ]);
    expect(
      probe(
        '// data/news를 읽는다는 주석\nimport { loadLatestNews } from "@/lib/data/news";',
      ),
    ).toEqual([]);
  });
});

describe("② src/lib/data/news.ts 공개 로더는 모두 삭제 요청 카드를 뺀다", () => {
  const FIXTURE = path.resolve("fixtures/schema/data/news/2026-10-10.json");
  const TAKEN = "c_0a1b2c3d4e";
  let dir: string;
  let takedownsFile: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "euro-digest-guard-"));
    writeFileSync(path.join(dir, "2026-10-10.json"), readFileSync(FIXTURE));
    takedownsFile = path.join(dir, "takedowns.json");
    writeFileSync(
      takedownsFile,
      JSON.stringify([
        {
          id: TAKEN,
          requestedAt: "2026-10-10T03:00:00Z",
          handledAt: null,
          reason: "삭제 요청 (#1)",
        },
      ]),
    );
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** 로더 이름 → 임시 폴더·등록 파일로 부르는 방법. 새 로더를 만들면 여기에 넣는다 */
  const CALLS: Record<string, () => NewsFile | null> = {
    loadLatestNews: () => newsLoader.loadLatestNews(dir, { takedownsFile }),
    loadNewsIssue: () =>
      newsLoader.loadNewsIssue("2026-10-10", dir, { takedownsFile }),
  };

  it("공개 로더(load… 중 NewsFile을 돌려주는 것)가 모두 표에 있다", () => {
    const loaders = Object.keys(newsLoader)
      .filter((name) => /^load/.test(name) && name !== "loadTakedownIds")
      .sort();
    expect(loaders).toEqual(Object.keys(CALLS).sort());
  });

  it.each(Object.keys(CALLS))("%s — 등록 카드를 뺀다", (name) => {
    const news = CALLS[name]!();
    expect(news?.cards.length).toBe(2);
    expect(news?.cards.map((c) => c.id)).not.toContain(TAKEN);
  });

  it("loadNewsIssue — 없는 날짜는 null(경로 조작 문자열도 목록에 없으면 null)", () => {
    expect(
      newsLoader.loadNewsIssue("2026-10-11", dir, { takedownsFile }),
    ).toBeNull();
    expect(
      newsLoader.loadNewsIssue("../2026-10-10", dir, { takedownsFile }),
    ).toBeNull();
  });
});
