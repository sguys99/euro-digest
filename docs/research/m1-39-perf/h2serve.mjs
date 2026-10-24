// M1-39 성능 측정용 정적 서버 — out/(또는 그 복사본)을 GitHub Pages처럼 basePath 아래에서 HTTP/2(TLS) + gzip(레벨 6) + max-age=600으로.
// 측정 전용(테스트·배포에 쓰지 않는다). 인증서는 자체 서명 — README의 openssl 한 줄로 만든다(저장소에 두지 않는다).
// 사용: node docs/research/m1-39-perf/h2serve.mjs <out 폴더> <포트> [key.pem] [cert.pem]
import { createSecureServer } from "node:http2";
import { existsSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const [outArg = "out", portArg = "4199", keyArg = "/tmp/m1-39-perf/key.pem", certArg = "/tmp/m1-39-perf/cert.pem"] =
  process.argv.slice(2);
const OUT = path.resolve(outArg);
const PORT = Number(portArg);
const BASE = process.env.BASE_PATH ?? "/euro-digest";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const cache = new Map();
function file(p) {
  if (!cache.has(p)) {
    const raw = readFileSync(p);
    const type = TYPES[path.extname(p)] ?? "application/octet-stream";
    const gz = /text|javascript|json|xml|svg/.test(type) ? gzipSync(raw, { level: 6 }) : null;
    cache.set(p, { raw, gz, type });
  }
  return cache.get(p);
}

createSecureServer({ key: readFileSync(keyArg), cert: readFileSync(certArg), allowHTTP1: true }, (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "https://x").pathname);
  if (!p.startsWith(BASE)) {
    res.writeHead(404);
    return res.end();
  }
  p = p.slice(BASE.length) || "/";
  let fp = path.join(OUT, p);
  let status = 200;
  if (existsSync(fp) && statSync(fp).isDirectory()) {
    if (!p.endsWith("/")) {
      res.writeHead(301, { location: BASE + p + "/" });
      return res.end();
    }
    fp = path.join(fp, "index.html");
  } else if (!existsSync(fp) && existsSync(fp + ".html")) fp += ".html";
  if (!existsSync(fp)) {
    fp = path.join(OUT, "404.html");
    status = 404;
  }
  const f = file(fp);
  const gz = f.gz && /gzip/.test(req.headers["accept-encoding"] ?? "");
  const body = gz ? f.gz : f.raw;
  res.writeHead(status, {
    "content-type": f.type,
    "content-length": body.length,
    "cache-control": "max-age=600",
    ...(gz ? { "content-encoding": "gzip", vary: "Accept-Encoding" } : {}),
  });
  res.end(body);
}).listen(PORT, "127.0.0.1", () => console.log(`h2serve ${OUT} → https://127.0.0.1:${PORT}${BASE}/`));
