/**
 * `npm run check:bundle`의 검사 본체 (M0-12) — out/을 읽어 초기 JS 크기를 재고 비밀값을 찾는다.
 * 판정·문구는 순수 함수(bundle-budget.ts·secret-scan.ts·site-refs.ts)에 맡기고, 여기서는 파일 I/O와
 * gzip 측정만 한다. 출력·종료 코드는 scripts/check-bundle.ts가 정한다(이 모듈은 아무것도 출력하지 않는다).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

import {
  evaluateBudget,
  type BudgetReport,
  type PageScripts,
  type ScriptSize,
} from "./bundle-budget";
import { listFilesRecursive, listSitePages } from "./out-dir";
import {
  envFileFinding,
  isEnvFileName,
  isProbablyBinary,
  scanTextForSecrets,
  type SecretFinding,
  type SecretScanStats,
} from "./secret-scan";
import {
  extractInitialScriptSrcs,
  resolveRef,
  sitePathToOutFile,
} from "./site-refs";

export interface BundleCheckOptions {
  outDir: string;
  basePath: string;
  budgetBytes: number;
}

export interface BundleCheckResult {
  budget: BudgetReport;
  secrets: SecretFinding[];
  secretStats: SecretScanStats;
  ok: boolean;
}

/** gzip 크기 — Node zlib 기본 옵션(레벨 6). 측정 방식은 MEASUREMENT_NOTE와 일치시킬 것 */
export function gzipSize(content: Uint8Array): number {
  return gzipSync(content).length;
}

/** 페이지마다 초기 JS 목록을 모으고 파일별 크기를 잰다(같은 파일은 한 번만 측정). */
export function collectPageScripts(
  outDir: string,
  basePath: string,
): PageScripts[] {
  const sizeCache = new Map<string, ScriptSize | null>();
  const measure = (sitePath: string): ScriptSize | null => {
    const file = path.join(outDir, sitePathToOutFile(sitePath));
    if (!sizeCache.has(file)) {
      if (existsSync(file) && statSync(file).isFile()) {
        const content = readFileSync(file);
        sizeCache.set(file, {
          sitePath,
          rawBytes: content.length,
          gzipBytes: gzipSize(content),
        });
      } else {
        sizeCache.set(file, null);
      }
    }
    return sizeCache.get(file) ?? null;
  };

  return listSitePages(outDir).map((page) => {
    const result: PageScripts = {
      page: page.file,
      scripts: [],
      missing: [],
      invalid: [],
      external: [],
    };
    const seen = new Set<string>();
    for (const src of extractInitialScriptSrcs(
      readFileSync(page.absolutePath, "utf8"),
    )) {
      const resolved = resolveRef(src, page.urlPath, { basePath });
      if (resolved.kind === "external") {
        result.external.push(src);
      } else if (resolved.kind !== "internal") {
        result.invalid.push(src);
      } else if (!seen.has(resolved.sitePath)) {
        // 쿼리만 다른 같은 파일(`a.js?v=1`, `a.js?v=2`)도 한 번만 센다.
        seen.add(resolved.sitePath);
        const size = measure(resolved.sitePath);
        if (size) result.scripts.push(size);
        else result.missing.push(src);
      }
    }
    return result;
  });
}

/** out/ 전체에서 비밀 패턴과 .env* 파일을 찾는다. */
export function scanOutDirForSecrets(outDir: string): {
  findings: SecretFinding[];
  stats: SecretScanStats;
} {
  const findings: SecretFinding[] = [];
  const files = listFilesRecursive(outDir);
  let textFiles = 0;
  for (const file of files) {
    if (isEnvFileName(path.posix.basename(file)))
      findings.push(envFileFinding(file));
    const content = readFileSync(path.join(outDir, file));
    if (isProbablyBinary(content)) continue;
    textFiles += 1;
    findings.push(...scanTextForSecrets(content.toString("utf8"), file));
  }
  return { findings, stats: { files: files.length, textFiles } };
}

/** 예산 검사 + 비밀값 검사를 모두 실행한다. outDir이 폴더인지는 호출하는 쪽에서 확인할 것. */
export function runBundleCheck(options: BundleCheckOptions): BundleCheckResult {
  const budget = evaluateBudget(
    collectPageScripts(options.outDir, options.basePath),
    options.budgetBytes,
  );
  const { findings, stats } = scanOutDirForSecrets(options.outDir);
  return {
    budget,
    secrets: findings,
    secretStats: stats,
    ok: budget.ok && findings.length === 0,
  };
}
