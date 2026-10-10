/**
 * 정적 export 폴더(out/) 순회 헬퍼 (M0-12). check:bundle과 e2e 링크·접근성 검사가 같은 페이지 목록을 쓴다.
 * 파일 시스템을 읽는 I/O 함수만 둔다 — 경로 해석 등 판단 로직은 site-refs.ts의 순수 함수로.
 */
import { readdirSync } from "node:fs";
import path from "node:path";

import { htmlFileToUrlPath } from "./site-refs";

/**
 * 폴더 아래 모든 일반 파일을 posix 상대 경로로, 정렬해 돌려준다. 점(.)으로 시작하는 파일도 포함하고
 * 심볼릭 링크는 따라가지 않는다.
 */
export function listFilesRecursive(rootDir: string): string[] {
  const files: string[] = [];
  const walk = (relativeDir: string): void => {
    const entries = readdirSync(path.join(rootDir, relativeDir), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const relativePath = relativeDir
        ? `${relativeDir}/${entry.name}`
        : entry.name;
      if (entry.isDirectory()) walk(relativePath);
      else if (entry.isFile()) files.push(relativePath);
    }
  };
  walk("");
  return files.sort();
}

export interface SitePage {
  /** out/ 기준 HTML 파일 경로(posix) */
  file: string;
  /** 절대 파일 경로 */
  absolutePath: string;
  /** basePath를 뺀, 페이지가 서빙되는 URL 경로(예: `/`, `/404.html`) */
  urlPath: string;
}

/** out/의 모든 HTML 페이지. 하드코딩한 목록 대신 빌드 결과에서 모은다. */
export function listSitePages(outDir: string): SitePage[] {
  return listFilesRecursive(outDir)
    .filter((file) => file.toLowerCase().endsWith(".html"))
    .map((file) => ({
      file,
      absolutePath: path.join(outDir, file),
      urlPath: htmlFileToUrlPath(file),
    }));
}
