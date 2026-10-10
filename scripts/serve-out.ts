/**
 * 정적 export 결과(out/)를 GitHub Pages처럼 basePath 아래로 서빙하는 미리보기 서버.
 * 외부 의존성 없이 Node 내장 모듈만 쓴다. `npm run preview`와 Playwright webServer가 사용한다.
 *
 * GitHub Pages 동작 모사:
 * - `${BASE_PATH}/` → out/index.html, 디렉터리 경로 → `<dir>/index.html`
 * - 디렉터리인데 끝에 `/`가 없으면 301로 `/`를 붙인다(trailingSlash)
 * - `/foo`에 해당하는 `foo.html`이 있으면 그 파일을 준다
 * - 없는 경로는 out/404.html을 404 상태로 준다
 * - 편의상 `/`는 `${BASE_PATH}/`로 302 리다이렉트
 *
 * 환경변수: PORT(기본 4173) · HOST(기본 127.0.0.1) · BASE_PATH(next.config.ts와 같은 규칙 — src/lib/paths.ts) · OUT_DIR(기본 out)
 */
import { createReadStream, existsSync, statSync, type Stats } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";

import { normalizeBasePath } from "@/lib/paths";

const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "127.0.0.1";
const basePath = normalizeBasePath(process.env.BASE_PATH);
const outDir = path.resolve(process.env.OUT_DIR ?? "out");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".ics": "text/calendar; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
};

function contentTypeOf(filePath: string): string {
  return (
    CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream"
  );
}

function statOrNull(filePath: string): Stats | null {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
}

function sendFile(
  res: ServerResponse,
  filePath: string,
  status: number,
  headOnly: boolean,
): void {
  res.writeHead(status, {
    "Content-Type": contentTypeOf(filePath),
    "Content-Length": statSync(filePath).size,
    "Cache-Control": "no-cache",
  });
  if (headOnly) {
    res.end();
    return;
  }
  createReadStream(filePath)
    .on("error", () => res.destroy())
    .pipe(res);
}

function sendNotFound(res: ServerResponse, headOnly: boolean): void {
  const notFoundPage = path.join(outDir, "404.html");
  if (existsSync(notFoundPage)) {
    sendFile(res, notFoundPage, 404, headOnly);
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(headOnly ? undefined : "404 Not Found");
}

function redirect(
  res: ServerResponse,
  status: 301 | 302,
  location: string,
): void {
  res.writeHead(status, { Location: location });
  res.end();
}

if (!statOrNull(outDir)?.isDirectory()) {
  console.error(
    `[serve-out] ${outDir} 폴더가 없습니다. 먼저 \`npm run build\`를 실행하세요.`,
  );
  process.exit(1);
}

const server = createServer((req, res) => {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }
  const headOnly = method === "HEAD";

  const url = new URL(req.url ?? "/", "http://localhost");
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }

  if (basePath !== "" && pathname === "/") {
    redirect(res, 302, `${basePath}/`);
    return;
  }

  // basePath 밖의 경로는 이 사이트의 것이 아니다.
  if (
    basePath !== "" &&
    pathname !== basePath &&
    !pathname.startsWith(`${basePath}/`)
  ) {
    sendNotFound(res, headOnly);
    return;
  }

  const relativePath = pathname.slice(basePath.length) || "/";
  const target = path.join(outDir, relativePath);
  // `..` 등으로 out/ 밖을 가리키는 요청 차단
  if (target !== outDir && !target.startsWith(outDir + path.sep)) {
    sendNotFound(res, headOnly);
    return;
  }

  const stats = statOrNull(target);
  if (stats?.isDirectory()) {
    if (!pathname.endsWith("/")) {
      redirect(res, 301, `${pathname}/${url.search}`);
      return;
    }
    const indexFile = path.join(target, "index.html");
    if (statOrNull(indexFile)?.isFile()) {
      sendFile(res, indexFile, 200, headOnly);
      return;
    }
  } else if (stats?.isFile()) {
    sendFile(res, target, 200, headOnly);
    return;
  } else if (
    !pathname.endsWith("/") &&
    statOrNull(`${target}.html`)?.isFile()
  ) {
    sendFile(res, `${target}.html`, 200, headOnly);
    return;
  }

  sendNotFound(res, headOnly);
});

server.listen(port, host, () => {
  console.log(
    `[serve-out] http://${host}:${port}${basePath}/ ← ${path.relative(process.cwd(), outDir) || "."}`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
