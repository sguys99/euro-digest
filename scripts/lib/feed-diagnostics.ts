/**
 * 피드 응답 진단 (M1-03 보강, PRD FR-08·FR-11) — 파싱 실패의 원인을 **응답 본문 없이** 가늠할 값만 만든다. 순수 함수.
 *
 * 배경: ESPN 피드가 Actions 러너에서만 `parse`로 실패하고 로컬에서는 정상이다(러너 IP에 다른 응답을 주는 것으로 추정).
 * 원인을 보려면 무엇을 받았는지 알아야 하지만, 응답 본문은 로그·이슈·runs.json 어디에도 남기지 않는다(CLAUDE.md §9.1).
 * 그래서 본문 대신 아래 값만 남긴다 — 모두 정해진 enum·숫자·참거짓이다(자유 문자열 없음).
 *
 *   status     최종 응답 HTTP 상태(2xx — 2xx가 아니면 받기 단계에서 이미 실패한다)
 *   mediaType  `Content-Type`의 미디어 타입만(파라미터·charset 제거, 소문자) → FEED_MEDIA_TYPES 중 하나.
 *              목록 밖이면 `other`, 헤더가 없으면 `none`. 헤더 원문은 남기지 않는다.
 *   bytes      본문 바이트 길이(fetch가 압축을 푼 뒤 받은 바이트)
 *   shape      본문 형태(`classifyFeedBody` — 아래 규칙)
 *   sameHost   최종 응답 URL의 호스트가 피드 URL 호스트와 같은가(정상 = true; 리다이렉트는 같은 호스트만 따라간다)
 *   redirects  따라간 리다이렉트 수(같은 호스트만, 정상 = 0)
 *   parser     파서 오류 코드(`describeParseError` — rss-parser·xml2js·sax 메시지를 고정 코드로 바꾼다)
 *   line·column 파서가 준 위치(1부터, 없으면 null). sax 메시지의 `Char:`(본문 글자)는 버린다.
 *
 * ── 본문 형태 (`classifyFeedBody`) ──────────────────────────────────────
 *   앞쪽 공백·BOM(U+FEFF)을 건너뛴 첫 글자부터 FEED_HEAD_CHARS(512자)만 본다. 본문 문자열은 결과에 담지 않는다.
 *   empty      본문이 없거나 공백·BOM뿐
 *   json       `{` 또는 `[`로 시작
 *   text       `<`로 시작하지 않음(평문 차단 문구 등)
 *   html       `<!DOCTYPE html`, 루트가 `html`, 또는 XML 선언 없이 흔한 HTML 태그(head·body·div…)로 시작
 *   xml-rss    루트(접두사 뺀 이름)가 `rss` 또는 `rdf`(RSS 1.0 `rdf:RDF`)
 *   xml-atom   루트가 `feed`
 *   xml-other  그 밖의 `<`로 시작하는 문서(XML 선언·주석·처리 지시가 512자를 넘겨 루트를 못 찾은 경우 포함)
 *   잘린 XML은 머리가 멀쩡하면 xml-rss·xml-atom으로 나오고, 파서 코드(`unclosed-root`·`unexpected-end`)가 잘림을 알려 준다.
 *
 * ── 파서 오류 코드 (`describeParseError`) ───────────────────────────────
 *   rss-parser `Unable to parse XML.`은 xml2js가 결과를 못 만든 경우 — 본문이 비었거나 공백·BOM뿐일 때다(xml2js는 trim이
 *   빈 문자열이면 오류 없이 null을 준다) → `no-document`. `Feed not recognized as RSS 1 or 2.` → `not-feed`.
 *   sax 문법 오류는 메시지 앞부분(고정 문구)으로 코드를 고르고, 목록 밖 sax 오류는 `xml-syntax`, 그 밖은 `other`.
 *   `Unmatched closing tag: <이름>`·`Unbound namespace prefix: "<접두사>"`처럼 본문 조각이 붙는 메시지도 앞부분만 본다.
 */

// ─── 값 목록 ─────────────────────────────────────────────────────────────

/** 본문 형태 */
export const FEED_BODY_SHAPES = [
  "xml-rss",
  "xml-atom",
  "xml-other",
  "html",
  "json",
  "empty",
  "text",
] as const;
export type FeedBodyShape = (typeof FEED_BODY_SHAPES)[number];

/** `Content-Type` 미디어 타입 — 목록 밖은 `other`, 헤더 없음은 `none` */
export const FEED_MEDIA_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "application/rdf+xml",
  "application/xml",
  "text/xml",
  "text/html",
  "application/xhtml+xml",
  "application/json",
  "text/plain",
  "application/octet-stream",
  "other",
  "none",
] as const;
export type FeedMediaType = (typeof FEED_MEDIA_TYPES)[number];

/** 파서 오류 코드 */
export const FEED_PARSE_ERROR_CODES = [
  "no-document",
  "not-feed",
  "text-before-root",
  "text-after-root",
  "unexpected-close-tag",
  "unmatched-close-tag",
  "unclosed-root",
  "unexpected-end",
  "invalid-entity",
  "invalid-attribute",
  "xml-syntax",
  "other",
] as const;
export type FeedParseErrorCode = (typeof FEED_PARSE_ERROR_CODES)[number];

/** 본문 형태 판정에 쓰는 앞부분 길이(공백·BOM을 건너뛴 뒤, 글자 수) */
export const FEED_HEAD_CHARS = 512;

// ─── 진단 값 ─────────────────────────────────────────────────────────────

/** 받은 응답의 겉모습 — 본문 내용 없음 (scripts/lib/rss.ts `fetchFeed`가 만든다) */
export interface FeedResponseInfo {
  status: number;
  mediaType: FeedMediaType;
  bytes: number;
  shape: FeedBodyShape;
  sameHost: boolean;
  redirects: number;
}

/** 파서 오류 요약 — 고정 코드 + 위치(1부터)만 */
export interface FeedParseErrorInfo {
  parser: FeedParseErrorCode;
  line: number | null;
  column: number | null;
}

/** 파싱 실패 진단 = 응답 겉모습 + 파서 오류 요약 (로그 `collect.source.fail`·이슈 payload `parseDiagnostics`) */
export type FeedParseDiagnostics = FeedResponseInfo & FeedParseErrorInfo;

// ─── 미디어 타입 ─────────────────────────────────────────────────────────

const KNOWN_MEDIA_TYPES: ReadonlySet<string> = new Set(
  FEED_MEDIA_TYPES.filter((t) => t !== "other" && t !== "none"),
);

/** `Content-Type` 헤더 → 미디어 타입(파라미터 제거·소문자). 목록 밖은 `other`, 없거나 비면 `none`. */
export function feedMediaType(
  header: string | null | undefined,
): FeedMediaType {
  const type = (header ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!type) return "none";
  return KNOWN_MEDIA_TYPES.has(type) ? (type as FeedMediaType) : "other";
}

// ─── 본문 형태 ───────────────────────────────────────────────────────────

/** XML 선언 없이 이 태그로 시작하면 HTML로 본다(차단·오류 페이지 조각) */
const HTML_START_TAGS: ReadonlySet<string> = new Set([
  "html",
  "head",
  "body",
  "meta",
  "title",
  "link",
  "script",
  "style",
  "noscript",
  "div",
  "span",
  "p",
  "a",
  "h1",
  "h2",
  "h3",
  "center",
  "pre",
  "table",
  "iframe",
  "form",
  "br",
  "img",
]);

/** 공백·BOM이 아닌 첫 글자 위치(JS `\s`는 U+FEFF를 포함한다). 없으면 -1 */
function firstContentIndex(text: string): number {
  return text.search(/\S/);
}

/**
 * 응답 본문 → 형태(규칙은 파일 머리 주석). 본문은 읽기만 하고 결과에 담지 않는다.
 * 공백·BOM을 건너뛴 앞 FEED_HEAD_CHARS자만 본다.
 */
export function classifyFeedBody(text: string): FeedBodyShape {
  const start = firstContentIndex(text);
  if (start < 0) return "empty";
  const head = text.slice(start, start + FEED_HEAD_CHARS);
  const first = head[0];
  if (first === "{" || first === "[") return "json";
  if (first !== "<") return "text";
  return classifyMarkup(head);
}

/** `<`로 시작하는 앞부분 → html·xml-rss·xml-atom·xml-other */
function classifyMarkup(head: string): FeedBodyShape {
  let rest = head;
  let sawXmlDeclaration = false;
  // 프롤로그(XML 선언·처리 지시·주석·DOCTYPE)를 건너뛰고 첫 요소를 찾는다
  for (;;) {
    rest = rest.replace(/^\s+/, "");
    if (rest.startsWith("<?")) {
      if (/^<\?xml[\s?]/i.test(rest)) sawXmlDeclaration = true;
      const end = rest.indexOf("?>");
      if (end < 0) return "xml-other";
      rest = rest.slice(end + 2);
      continue;
    }
    if (rest.startsWith("<!--")) {
      const end = rest.indexOf("-->");
      if (end < 0) return "xml-other";
      rest = rest.slice(end + 3);
      continue;
    }
    if (/^<!doctype\s+html\b/i.test(rest)) return "html";
    if (rest.startsWith("<!")) {
      const end = rest.indexOf(">");
      if (end < 0) return "xml-other";
      rest = rest.slice(end + 1);
      continue;
    }
    break;
  }
  const element = /^<(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)/.exec(rest);
  if (!element) return "xml-other";
  const name = (element[1] ?? "").toLowerCase();
  if (name === "rss" || name === "rdf") return "xml-rss";
  if (name === "feed") return "xml-atom";
  if (name === "html") return "html";
  if (!sawXmlDeclaration && HTML_START_TAGS.has(name)) return "html";
  return "xml-other";
}

// ─── 호스트 ──────────────────────────────────────────────────────────────

/** 두 URL의 호스트(포트 포함, 소문자)가 같은가. 어느 쪽이든 URL이 아니면 false */
export function sameFeedHost(requestUrl: string, finalUrl: string): boolean {
  try {
    return (
      new URL(requestUrl).host.toLowerCase() ===
      new URL(finalUrl).host.toLowerCase()
    );
  } catch {
    return false;
  }
}

// ─── 파서 오류 ───────────────────────────────────────────────────────────

/** 메시지 앞부분(고정 문구) → 코드. 먼저 맞는 것을 쓴다 */
const PARSER_MESSAGE_CODES: ReadonlyArray<
  readonly [prefix: string, code: FeedParseErrorCode]
> = [
  ["Unable to parse XML", "no-document"],
  ["Feed not recognized as RSS", "not-feed"],
  ["Non-whitespace before first tag", "text-before-root"],
  ["Text data outside of root node", "text-after-root"],
  ["Unexpected close tag", "unexpected-close-tag"],
  ["Unmatched closing tag", "unmatched-close-tag"],
  ["Unclosed root tag", "unclosed-root"],
  ["Unexpected end", "unexpected-end"],
  ["Invalid character entity", "invalid-entity"],
  ["Invalid character in entity name", "invalid-entity"],
  ["Invalid attribute name", "invalid-attribute"],
  ["Attribute without value", "invalid-attribute"],
  ["Unquoted attribute value", "invalid-attribute"],
  ["No whitespace between attributes", "invalid-attribute"],
];

/** sax 위치 표기 — `\nLine: <0부터>\nColumn: <n>` (뒤의 `\nChar: <본문 글자>`는 읽지 않는다) */
const SAX_POSITION = /\nLine: (\d{1,9})\nColumn: (\d{1,9})(?:\n|$)/;

/**
 * 파서 오류 → 고정 코드 + 위치. 메시지 원문·본문 조각은 결과에 담지 않는다.
 * 줄은 sax 값(0부터)에 1을 더해 1부터로, 열은 sax 값 그대로(오류 글자까지 센 수 = 1부터)다.
 */
export function describeParseError(error: unknown): FeedParseErrorInfo {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const firstLine = message.split("\n")[0]?.trim() ?? "";
  const position = SAX_POSITION.exec(message);
  const line = position ? Number(position[1]) + 1 : null;
  const column = position ? Number(position[2]) : null;
  const known = PARSER_MESSAGE_CODES.find(([prefix]) =>
    firstLine.startsWith(prefix),
  );
  const parser: FeedParseErrorCode = known
    ? known[1]
    : position
      ? "xml-syntax"
      : "other";
  return { parser, line, column };
}

// ─── 표시 문구 (이슈 본문) ───────────────────────────────────────────────

export const FEED_BODY_SHAPE_LABEL: Readonly<Record<FeedBodyShape, string>> = {
  "xml-rss": "RSS 문서",
  "xml-atom": "Atom 문서",
  "xml-other": "RSS·Atom이 아닌 XML",
  html: "HTML (차단·오류 페이지일 수 있음)",
  json: "JSON",
  empty: "빈 본문(공백·BOM만)",
  text: "평문",
};

export const FEED_PARSE_ERROR_LABEL: Readonly<
  Record<FeedParseErrorCode, string>
> = {
  "no-document": "파서가 문서를 얻지 못함(빈 본문·공백만)",
  "not-feed": "XML이지만 루트가 RSS·Atom이 아님",
  "text-before-root": "첫 태그 앞에 문자가 있음(XML이 아님)",
  "text-after-root": "루트 요소 밖에 문자가 있음",
  "unexpected-close-tag": "예상 밖 닫는 태그",
  "unmatched-close-tag": "짝이 맞지 않는 닫는 태그",
  "unclosed-root": "루트 요소가 닫히지 않음(잘린 본문일 수 있음)",
  "unexpected-end": "문서가 중간에 끝남(잘린 본문일 수 있음)",
  "invalid-entity": "잘못된 엔티티",
  "invalid-attribute": "잘못된 속성",
  "xml-syntax": "그 밖의 XML 문법 오류",
  other: "그 밖의 파서 오류",
};
