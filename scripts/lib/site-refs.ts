/**
 * 정적 export 결과(out/)의 HTML에서 스크립트·링크·자산 참조를 뽑아 사이트 안 경로로 해석하는 순수 함수 (M0-12).
 * `npm run check:bundle`(초기 JS 예산, DR-11)과 e2e 링크 검사(NFR-12)가 함께 쓴다.
 *
 * 외부 의존성 없이 정규식으로 태그·속성만 읽는다. Next가 생성한 것처럼 형식이 정돈된 HTML이 대상이며
 * 범용 HTML 파서를 목표로 하지 않는다. 주석과 인라인 <script>·<style> 본문은 지운 뒤 읽는다
 * (RSC 페이로드 안의 문자열을 태그로 오인하지 않도록).
 *
 * 경로 용어
 * - basePath: 사이트가 걸리는 접두 경로(기본값은 src/lib/paths.ts, 루트 배포면 "")
 * - pageUrlPath / sitePath: basePath를 뺀 사이트 안 경로. 항상 `/`로 시작한다(예: `/`, `/404.html`, `/_next/x.js`)
 */

// basePath 정규화 — next.config.ts·serve-out.ts와 같은 규칙(단일 출처: src/lib/paths.ts).
// 미지정이면 기본값, 끝의 `/`는 제거, 빈 값("")이면 루트 배포. 형식이 틀리면 PathInputError.
export { normalizeBasePath } from "@/lib/paths";

export interface HtmlTag {
  /** 소문자 태그 이름 */
  name: string;
  /** 소문자 속성 이름 → 엔터티를 푼 값. 값 없는 불리언 속성(`nomodule`)은 "" */
  attrs: ReadonlyMap<string, string>;
}

const COMMENT_RE = /<!--[\s\S]*?-->/g;
// 여는 태그는 남기고 본문만 비운다(<script src>의 속성은 계속 읽어야 한다).
const RAW_TEXT_RE =
  /<(script|style)\b((?:[^>"']|"[^"]*"|'[^']*')*)>[\s\S]*?<\/\1\s*>/gi;
// 속성 값 안의 `>`를 견디도록 따옴표 구간을 통째로 건너뛴다.
const TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)(\s(?:[^>"']|"[^"]*"|'[^']*')*)?>/g;
const ATTR_RE =
  /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** 속성 값에 흔히 쓰이는 HTML 엔터티(`&amp;` 등, 숫자 참조 포함)를 푼다. 모르는 이름은 그대로 둔다. */
export function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g,
    (whole, entity: string) => {
      if (entity.startsWith("#")) {
        const isHex = entity[1] === "x" || entity[1] === "X";
        const code = Number.parseInt(
          entity.slice(isHex ? 2 : 1),
          isHex ? 16 : 10,
        );
        return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : whole;
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? whole;
    },
  );
}

function parseAttributes(source: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const match of source.matchAll(ATTR_RE)) {
    const name = match[1]?.toLowerCase();
    if (!name || attrs.has(name)) continue; // HTML 규칙: 같은 속성이 반복되면 첫 값만 유효
    const raw = match[2] ?? match[3] ?? match[4] ?? "";
    attrs.set(name, decodeHtmlEntities(raw));
  }
  return attrs;
}

/**
 * HTML의 여는 태그를 순서대로 돌려준다. `names`를 주면 그 태그만(소문자 비교).
 * 주석·인라인 스크립트/스타일 본문 안의 태그 모양 문자열은 무시한다.
 */
export function parseTags(html: string, names?: readonly string[]): HtmlTag[] {
  const wanted = names
    ? new Set(names.map((name) => name.toLowerCase()))
    : null;
  const cleaned = html
    .replace(COMMENT_RE, "")
    .replace(
      RAW_TEXT_RE,
      (_whole, tag: string, attrs: string) => `<${tag}${attrs}></${tag}>`,
    );

  const tags: HtmlTag[] = [];
  for (const match of cleaned.matchAll(TAG_RE)) {
    const name = match[1]?.toLowerCase();
    if (!name || (wanted && !wanted.has(name))) continue;
    tags.push({ name, attrs: parseAttributes(match[2] ?? "") });
  }
  return tags;
}

// <script type>이 비었거나 아래 값이면 브라우저가 JS로 실행한다. 그 밖(application/json 등)은 데이터 블록.
const JS_SCRIPT_TYPES: ReadonlySet<string> = new Set([
  "",
  "module",
  "text/javascript",
  "application/javascript",
  "text/ecmascript",
  "application/ecmascript",
]);

/**
 * 페이지의 초기 JS — 모던 브라우저가 내려받는 `<script src>` 목록(DR-11).
 * `nomodule` 스크립트(레거시 폴리필)와 JS가 아닌 type은 빼고, 같은 src는 한 번만 센다. 등장 순서 유지.
 */
export function extractInitialScriptSrcs(html: string): string[] {
  const seen = new Set<string>();
  const srcs: string[] = [];
  for (const tag of parseTags(html, ["script"])) {
    const src = tag.attrs.get("src")?.trim();
    if (!src || tag.attrs.has("nomodule")) continue;
    const type =
      (tag.attrs.get("type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    if (!JS_SCRIPT_TYPES.has(type) || seen.has(src)) continue;
    seen.add(src);
    srcs.push(src);
  }
  return srcs;
}

/** 링크·자산 검사 대상 속성. 태그 → URL을 담는 속성 목록 */
const REF_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  a: ["href"],
  area: ["href"],
  link: ["href"],
  script: ["src"],
  img: ["src", "srcset"],
  source: ["src", "srcset"],
  video: ["src", "poster"],
  audio: ["src"],
  track: ["src"],
  iframe: ["src"],
  embed: ["src"],
  object: ["data"],
};

// 출처(origin)만 가리키는 힌트라 실제로 받을 자원이 아니다.
const ORIGIN_HINT_RELS: ReadonlySet<string> = new Set([
  "preconnect",
  "dns-prefetch",
]);

export interface HtmlRef {
  tag: string;
  attr: string;
  /** 엔터티를 푼 원래 값(해석 전) */
  url: string;
}

/** `srcset` 값에서 URL만 뽑는다(`a.png 1x, b.png 2x` → [a.png, b.png]). */
export function parseSrcset(value: string): string[] {
  return value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? "")
    .filter((url) => url !== "");
}

/** HTML의 링크·자산 참조(a·link href, script·img src, srcset 등)를 등장 순서대로 모은다. */
export function extractRefs(html: string): HtmlRef[] {
  const refs: HtmlRef[] = [];
  for (const tag of parseTags(html, Object.keys(REF_ATTRIBUTES))) {
    if (tag.name === "link") {
      const rels = (tag.attrs.get("rel") ?? "").toLowerCase().split(/\s+/);
      if (rels.some((rel) => ORIGIN_HINT_RELS.has(rel))) continue;
    }
    for (const attr of REF_ATTRIBUTES[tag.name] ?? []) {
      const value = tag.attrs.get(attr);
      if (value === undefined) continue;
      const urls = attr === "srcset" ? parseSrcset(value) : [value];
      for (const url of urls) refs.push({ tag: tag.name, attr, url });
    }
  }
  return refs;
}

/**
 * out/ 기준 HTML 파일 경로 → 그 페이지가 서빙되는 사이트 안 URL 경로(퍼센트 인코딩).
 * `index.html` → `/`, `news/index.html` → `/news/`, `404.html` → `/404.html`
 */
export function htmlFileToUrlPath(relativeFile: string): string {
  const file = relativeFile.replace(/\\/g, "/").replace(/^\/+/, "");
  const urlPath =
    file === "index.html"
      ? ""
      : file.endsWith("/index.html")
        ? file.slice(0, -"index.html".length)
        : file;
  return `/${urlPath.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * 사이트 안 경로 → out/ 기준 파일 경로(posix). 퍼센트 인코딩을 풀고, `/`로 끝나면 `index.html`을 붙인다.
 * 이미 URL로 정규화된 경로(`..` 없음)를 받는다고 가정한다 — resolveRef 결과를 넘길 것.
 */
export function sitePathToOutFile(sitePath: string): string {
  let decoded = sitePath;
  try {
    decoded = decodeURIComponent(sitePath);
  } catch {
    // 잘못된 % 인코딩이면 원문 그대로 찾는다(대개 파일이 없어 '없는 파일'로 보고된다).
  }
  const file = decoded.replace(/^\/+/, "");
  return file === "" || file.endsWith("/") ? `${file}index.html` : file;
}

export interface ResolveOptions {
  basePath: string;
  /**
   * 이 사이트로 취급할 절대 URL 출처(예: `https://sguys99.github.io`). canonical·OG 등 SITE_URL로 쓴
   * 절대 링크 중 basePath 아래만 내부 링크로 본다. 같은 출처라도 basePath 밖은 다른 사이트(외부)다.
   */
  siteOrigins?: readonly string[];
}

export type ResolvedRef =
  /** 이 사이트 안 경로 — 검사 대상 */
  | { kind: "internal"; sitePath: string; search: string }
  /** 상대·루트 경로인데 basePath 밖을 가리킴 — GitHub Pages에서 깨지는 링크(CLAUDE.md §7.1 basePath 누락) */
  | { kind: "outside-base"; pathname: string }
  /** 다른 출처 — 검사하지 않는다(CI 불안정 방지) */
  | { kind: "external"; url: string }
  /** URL로 해석할 수 없는 값 */
  | { kind: "invalid"; ref: string }
  /** 검사할 필요 없는 값: 빈 값·`#조각`만·mailto:/tel:/data: 등 http(s)가 아닌 스킴 */
  | { kind: "skip"; reason: "empty" | "fragment" | "non-http" };

// 해석 기준으로만 쓰는 가상 출처(.invalid는 실제로 존재할 수 없는 TLD).
const LOCAL_ORIGIN = "http://site.invalid";

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** HTML 속성 값 하나를, 그 HTML이 서빙되는 페이지 경로 기준으로 해석한다. */
export function resolveRef(
  ref: string,
  pageUrlPath: string,
  options: ResolveOptions,
): ResolvedRef {
  const value = ref.trim();
  if (value === "") return { kind: "skip", reason: "empty" };
  if (value.startsWith("#")) return { kind: "skip", reason: "fragment" };
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) && !/^https?:/i.test(value)) {
    return { kind: "skip", reason: "non-http" };
  }

  let url: URL;
  try {
    url = new URL(value, `${LOCAL_ORIGIN}${options.basePath}${pageUrlPath}`);
  } catch {
    return { kind: "invalid", ref: value };
  }

  const isLocal = url.origin === LOCAL_ORIGIN;
  const isSiteOrigin =
    isLocal ||
    (options.siteOrigins ?? []).some(
      (origin) => originOf(origin) === url.origin,
    );
  if (!isSiteOrigin) return { kind: "external", url: url.href };

  const { basePath } = options;
  const insideBase =
    basePath === "" ||
    url.pathname === basePath ||
    url.pathname.startsWith(`${basePath}/`);
  if (!insideBase) {
    return isLocal
      ? { kind: "outside-base", pathname: url.pathname }
      : { kind: "external", url: url.href };
  }
  return {
    kind: "internal",
    sitePath: url.pathname.slice(basePath.length) || "/",
    search: url.search,
  };
}

export interface InternalTarget {
  /** basePath를 뺀 사이트 안 경로(퍼센트 인코딩 유지) */
  sitePath: string;
  /** `?쿼리` (없으면 "") */
  search: string;
  /** 이 대상을 가리킨 원본 참조 — `태그[속성]=값` 형식, 중복 제거 */
  refs: string[];
}

export interface RefProblem {
  ref: string;
  reason: string;
}

export interface CollectedRefs {
  internal: InternalTarget[];
  problems: RefProblem[];
  externalCount: number;
}

function describeRef(ref: HtmlRef): string {
  return `${ref.tag}[${ref.attr}]=${ref.url}`;
}

/**
 * 한 페이지의 링크·자산 참조를 검사 대상(내부 경로, 경로+쿼리 단위 중복 제거)과
 * 문제(basePath 밖·해석 불가)로 나눈다. 외부 링크는 개수만 센다.
 */
export function collectInternalRefs(
  html: string,
  pageUrlPath: string,
  options: ResolveOptions,
): CollectedRefs {
  const targets = new Map<string, InternalTarget>();
  const problems: RefProblem[] = [];
  let externalCount = 0;

  for (const ref of extractRefs(html)) {
    const resolved = resolveRef(ref.url, pageUrlPath, options);
    switch (resolved.kind) {
      case "internal": {
        const key = `${resolved.sitePath}${resolved.search}`;
        const target = targets.get(key) ?? {
          sitePath: resolved.sitePath,
          search: resolved.search,
          refs: [],
        };
        const description = describeRef(ref);
        if (!target.refs.includes(description)) target.refs.push(description);
        targets.set(key, target);
        break;
      }
      case "outside-base":
        problems.push({
          ref: describeRef(ref),
          reason: `basePath(${options.basePath || "/"}) 밖 경로 ${resolved.pathname} — basePath 누락 의심`,
        });
        break;
      case "invalid":
        problems.push({
          ref: describeRef(ref),
          reason: "URL로 해석할 수 없음",
        });
        break;
      case "external":
        externalCount += 1;
        break;
      case "skip":
        break;
    }
  }

  return { internal: [...targets.values()], problems, externalCount };
}
