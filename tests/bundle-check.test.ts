import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BYTES_PER_KB } from "../scripts/lib/bundle-budget";
import {
  collectPageScripts,
  gzipSize,
  runBundleCheck,
  scanOutDirForSecrets,
} from "../scripts/lib/bundle-check";
import { listSitePages } from "../scripts/lib/out-dir";

const BASE = "/euro-digest";
let outDir: string;

function write(relativePath: string, content: string | Uint8Array): void {
  const file = path.join(outDir, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

// 무작위 16진 문자열 — 텍스트 파일이면서 압축이 덜 돼 gzip 크기가 0에 가깝지 않다.
const randomText = (bytes: number): Buffer =>
  Buffer.from(randomBytes(bytes / 2).toString("hex"));
const appJs = randomText(20 * BYTES_PER_KB);
const vendorJs = randomText(10 * BYTES_PER_KB);

beforeEach(() => {
  outDir = mkdtempSync(path.join(tmpdir(), "euro-digest-out-"));
  write("_next/static/chunks/app.js", appJs);
  write("_next/static/chunks/vendor.js", vendorJs);
  write("_next/static/chunks/polyfill.js", randomText(30 * BYTES_PER_KB));
  write(
    "fonts/pretendard.woff2",
    new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01, 0x00]),
  );
  write(
    "index.html",
    `<html><head><script src="/euro-digest/_next/static/chunks/app.js" async></script>
     <script src="/euro-digest/_next/static/chunks/vendor.js?v=1" async></script>
     <script src="/euro-digest/_next/static/chunks/vendor.js?v=2" async></script>
     <script src="/euro-digest/_next/static/chunks/polyfill.js" noModule></script></head></html>`,
  );
  write(
    "news/index.html",
    `<html><head><script src="../_next/static/chunks/app.js"></script></head></html>`,
  );
});

afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe("listSitePages", () => {
  it("out/의 HTML을 정렬해 URL 경로와 함께 돌려준다", () => {
    expect(
      listSitePages(outDir).map(({ file, urlPath }) => [file, urlPath]),
    ).toEqual([
      ["index.html", "/"],
      ["news/index.html", "/news/"],
    ]);
  });
});

describe("collectPageScripts", () => {
  it("페이지별로 noModule을 빼고, 쿼리만 다른 같은 파일은 한 번만 잰다(상대 경로 포함)", () => {
    const pages = collectPageScripts(outDir, BASE);
    expect(
      pages.map((page) => [
        page.page,
        page.scripts.map((script) => script.sitePath),
      ]),
    ).toEqual([
      [
        "index.html",
        ["/_next/static/chunks/app.js", "/_next/static/chunks/vendor.js"],
      ],
      ["news/index.html", ["/_next/static/chunks/app.js"]],
    ]);
    expect(pages[0]?.scripts[0]).toEqual({
      sitePath: "/_next/static/chunks/app.js",
      rawBytes: appJs.length,
      gzipBytes: gzipSize(appJs),
    });
  });

  it("없는 파일·basePath 밖·외부 스크립트를 구분한다", () => {
    write(
      "broken.html",
      `<script src="/euro-digest/_next/gone.js"></script><script src="/_next/no-base.js"></script>
       <script src="https://gc.zgo.at/count.js"></script>`,
    );
    const broken = collectPageScripts(outDir, BASE).find(
      (page) => page.page === "broken.html",
    );
    expect(broken).toMatchObject({
      scripts: [],
      missing: ["/euro-digest/_next/gone.js"],
      invalid: ["/_next/no-base.js"],
      external: ["https://gc.zgo.at/count.js"],
    });
  });
});

describe("runBundleCheck", () => {
  const indexGzip = (): number => gzipSize(appJs) + gzipSize(vendorJs);

  it("예산 안이면 통과하고 최대 페이지는 index.html", () => {
    const result = runBundleCheck({
      outDir,
      basePath: BASE,
      budgetBytes: 160 * BYTES_PER_KB,
    });
    expect(result.ok).toBe(true);
    expect(result.budget.maxPage).toMatchObject({
      page: "index.html",
      gzipBytes: indexGzip(),
    });
    expect(result.secretStats).toEqual({ files: 6, textFiles: 5 });
  });

  it("예산을 일부러 낮추면 실패한다(index.html만 초과)", () => {
    const budgetBytes = indexGzip() - 1;
    const result = runBundleCheck({ outDir, basePath: BASE, budgetBytes });
    expect(result.ok).toBe(false);
    expect(
      result.budget.pages
        .filter((page) => page.overBudget)
        .map((page) => page.page),
    ).toEqual(["index.html"]);
  });

  it("비밀값이나 .env 파일이 있으면 예산과 무관하게 실패한다", () => {
    write(
      "_next/static/chunks/leak.js",
      `var k="${["sk", "ant", "api03", "x".repeat(20)].join("-")}";`,
    );
    write(".env.production", "ANTHROPIC_API_KEY=");
    const result = runBundleCheck({
      outDir,
      basePath: BASE,
      budgetBytes: 160 * BYTES_PER_KB,
    });
    expect(result.budget.ok).toBe(true);
    expect(result.ok).toBe(false);
    expect(
      result.secrets.map((finding) => [finding.file, finding.patternId]),
    ).toEqual([
      [".env.production", "env-file"],
      ["_next/static/chunks/leak.js", "anthropic-key"],
    ]);
  });
});

describe("scanOutDirForSecrets", () => {
  it("바이너리 파일은 내용 검사를 건너뛴다", () => {
    const { findings, stats } = scanOutDirForSecrets(outDir);
    expect(findings).toEqual([]);
    expect(stats.files - stats.textFiles).toBeGreaterThanOrEqual(1);
  });
});
