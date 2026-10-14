/**
 * M1-03 보강 — 파싱 실패 진단(scripts/lib/feed-diagnostics.ts · rss.ts `fetchFeed` · feed-collect.ts `collect.source.fail`).
 *
 * ESPN 피드가 Actions 러너에서만 `parse`로 실패하는 원인을 보려고, 응답 본문 없이 겉모습(HTTP 상태·미디어 타입·바이트 수·
 * 본문 형태·최종 호스트·리다이렉트 수)과 파서 오류 코드·줄·열만 남긴다. 확인하는 것:
 *   - 본문 형태 분류: HTML 차단 페이지 · 빈 본문(공백·BOM만) · JSON · BOM 붙은 정상 XML · 잘린 XML · Atom · 평문 · 그 밖의 XML
 *   - 파서 오류 → 고정 코드 + 줄·열(sax의 `Char:`·태그 이름 같은 본문 조각은 버린다)
 *   - 수집 실행기: parse 실패 결과·로그에 진단 필드가 붙고, 로그 어디에도 본문 조각이 없다(BOM XML은 정상 수집)
 * 네트워크 없음 — fetch는 가짜 응답을 돌려준다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SourcesFileSchema, type Source } from "@/lib/schema";

import { collectFeedSources } from "../scripts/lib/feed-collect";
import {
  FEED_HEAD_CHARS,
  classifyFeedBody,
  describeParseError,
  feedMediaType,
  sameFeedHost,
} from "../scripts/lib/feed-diagnostics";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import {
  FeedParseError,
  fetchFeed,
  parseFeedXml,
  type FetchLike,
} from "../scripts/lib/rss";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const SOURCES: Source[] = SourcesFileSchema.parse(
  JSON.parse(read("configs/sources.json")),
);
const ESPN = SOURCES.find((s) => s.id === "espn-soccer")!;
const ESPN_XML = read("fixtures/rss/espn-soccer.xml");

// ─── 표본 본문 — 각 본문에 표식 문자열을 넣어 로그·결과에 새지 않는지 본다 ─────

/** 봇 차단 HTML(닫지 않은 meta → sax `Unexpected close tag`) */
const HTML_BLOCK = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Access Denied MARKER-HTML</title></head>
<body><h1>Access Denied</h1><p>Reference #18.MARKER-REF</p></body></html>`;
/** JSON 오류 응답 */
const JSON_BODY = `{"error":"blocked","detail":"MARKER-JSON"}`;
/** 잘린 XML — 머리는 정상 RSS */
const TRUNCATED = ESPN_XML.slice(0, 1500);
/** BOM 붙은 정상 XML */
const BOM_XML = `﻿${ESPN_XML}`;
/** Atom */
const ATOM = `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>t</title></feed>`;

// ─── 본문 형태 ───────────────────────────────────────────────────────────

describe("classifyFeedBody — 앞부분(BOM·공백 건너뜀)으로 본문 형태 판정", () => {
  it.each([
    ["HTML 차단 페이지(DOCTYPE)", HTML_BLOCK, "html"],
    ["HTML(DOCTYPE 없이 html)", "<html><body>not a feed</body></html>", "html"],
    ["HTML 조각(XML 선언 없이 h1)", "<h1>403 Forbidden</h1>", "html"],
    [
      "XHTML(XML 선언 + DOCTYPE html)",
      '<?xml version="1.0"?>\n<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "x"><html/>',
      "html",
    ],
    ["빈 본문", "", "empty"],
    ["공백·줄바꿈만", "  \r\n\t ", "empty"],
    ["BOM만", "﻿", "empty"],
    ["BOM + 공백", "﻿ \n", "empty"],
    ["JSON 객체", JSON_BODY, "json"],
    ["JSON 배열(앞 공백)", '\n  [{"a":1}]', "json"],
    ["BOM 붙은 정상 RSS", BOM_XML, "xml-rss"],
    ["정상 RSS", ESPN_XML, "xml-rss"],
    ["잘린 RSS", TRUNCATED, "xml-rss"],
    [
      "RSS 1.0(rdf:RDF)",
      '<?xml version="1.0"?><rdf:RDF xmlns:rdf="x"></rdf:RDF>',
      "xml-rss",
    ],
    ["Atom", ATOM, "xml-atom"],
    [
      "주석·DOCTYPE 뒤의 RSS",
      '<?xml version="1.0"?><!-- 생성기 --><!DOCTYPE rss><rss version="2.0"/>',
      "xml-rss",
    ],
    [
      "그 밖의 XML",
      '<?xml version="1.0"?><error><code>1</code></error>',
      "xml-other",
    ],
    [
      "XML 선언 뒤 HTML 이름의 요소(선언이 있으면 XML로 본다)",
      '<?xml version="1.0"?><body/>',
      "xml-other",
    ],
    ["평문", "Access denied", "text"],
    ["평문(BOM 뒤)", "﻿Request blocked.", "text"],
  ] as const)("%s → %s", (_label, body, shape) => {
    expect(classifyFeedBody(body)).toBe(shape);
  });

  it(`앞 ${FEED_HEAD_CHARS}자 안에서 루트를 못 찾으면 xml-other — 그 뒤는 읽지 않는다`, () => {
    const longComment = `<!--${"x".repeat(FEED_HEAD_CHARS)}--><rss version="2.0"/>`;
    expect(classifyFeedBody(longComment)).toBe("xml-other");
    // 앞 공백은 길어도 건너뛰고 본다
    expect(classifyFeedBody(`${" ".repeat(5_000)}<rss version="2.0"/>`)).toBe(
      "xml-rss",
    );
  });

  it("수집 대상 피드 fixture는 모두 RSS·Atom으로 분류된다", () => {
    const index = JSON.parse(read("fixtures/rss/index.json")) as {
      sources: Array<{ id: string }>;
    };
    for (const { id } of index.sources) {
      expect([id, classifyFeedBody(read(`fixtures/rss/${id}.xml`))]).toEqual([
        id,
        expect.stringMatching(/^xml-(rss|atom)$/),
      ]);
    }
  });
});

describe("feedMediaType — Content-Type의 미디어 타입만(파라미터 제거·소문자), 목록 밖은 other", () => {
  it.each([
    ["text/xml;charset=UTF-8", "text/xml"],
    ["Text/HTML; charset=utf-8", "text/html"],
    ["application/rss+xml", "application/rss+xml"],
    [" application/json ", "application/json"],
    ["application/x-unknown", "other"],
    ["text/html<script>alert(1)</script>", "other"],
    ["", "none"],
    [null, "none"],
    [undefined, "none"],
  ] as const)("%s → %s", (header, type) => {
    expect(feedMediaType(header)).toBe(type);
  });
});

describe("sameFeedHost", () => {
  it("호스트(포트 포함, 대소문자 무시)가 같은지", () => {
    expect(
      sameFeedHost("https://www.espn.com/a", "https://WWW.ESPN.com/b"),
    ).toBe(true);
    expect(sameFeedHost("https://www.espn.com/a", "https://espn.com/a")).toBe(
      false,
    );
    expect(
      sameFeedHost("https://a.example/x", "https://a.example:8443/x"),
    ).toBe(false);
    expect(sameFeedHost("https://a.example/x", "not a url")).toBe(false);
  });
});

// ─── 파서 오류 ───────────────────────────────────────────────────────────

/** parseFeedXml이 던진 FeedParseError */
async function parseError(body: string): Promise<FeedParseError> {
  const error: unknown = await parseFeedXml(body).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(FeedParseError);
  return error as FeedParseError;
}

describe("parseFeedXml 실패 → 고정 코드 + 줄·열(1부터), 메시지에 본문 조각 없음", () => {
  it.each([
    ["빈 본문", "", "no-document", null, null],
    ["공백만", " \n ", "no-document", null, null],
    ["BOM만", "﻿", "no-document", null, null],
    ["HTML 차단 페이지", HTML_BLOCK, "unexpected-close-tag", 2, 81],
    ["JSON", JSON_BODY, "text-before-root", 1, 1],
    ["평문", "Access denied", "text-before-root", 1, 1],
    ["잘린 XML", TRUNCATED, "unclosed-root", 1, 1500],
    [
      "RSS·Atom이 아닌 XML",
      '<?xml version="1.0"?><error>MARKER-XML</error>',
      "not-feed",
      null,
      null,
    ],
  ] as const)("%s → %s", async (_label, body, code, line, column) => {
    const error = await parseError(body);
    expect(error.info).toEqual({ parser: code, line, column });
    for (const marker of ["MARKER", "Access", "Char:", "<", "{"]) {
      expect(error.message).not.toContain(marker);
    }
  });

  it("메시지 형식 — `피드 파싱 실패 (<코드> 줄 n·열 m)`", async () => {
    expect((await parseError(JSON_BODY)).message).toBe(
      "피드 파싱 실패 (text-before-root 줄 1·열 1)",
    );
    expect((await parseError("")).message).toBe("피드 파싱 실패 (no-document)");
  });

  it("본문 조각이 붙는 sax 메시지도 앞부분 고정 문구만 본다 — 태그 이름·Char는 버린다", () => {
    expect(
      describeParseError(
        new Error(
          "Unmatched closing tag: MARKER-TAG\nLine: 4\nColumn: 12\nChar: >",
        ),
      ),
    ).toEqual({ parser: "unmatched-close-tag", line: 5, column: 12 });
    // 목록 밖 sax 오류(위치 있음) → xml-syntax, 위치 없는 모르는 오류 → other
    expect(
      describeParseError(
        new Error('Unbound namespace prefix: "x"\nLine: 0\nColumn: 9\nChar: >'),
      ),
    ).toEqual({ parser: "xml-syntax", line: 1, column: 9 });
    expect(
      describeParseError(
        new TypeError("Cannot read properties of undefined (reading '0')"),
      ),
    ).toEqual({ parser: "other", line: null, column: null });
    expect(describeParseError("Unable to parse XML.")).toEqual({
      parser: "no-document",
      line: null,
      column: null,
    });
    expect(describeParseError(42)).toEqual({
      parser: "other",
      line: null,
      column: null,
    });
    const error = new FeedParseError(
      describeParseError(
        new Error(
          "Unmatched closing tag: MARKER-TAG\nLine: 0\nColumn: 3\nChar: M",
        ),
      ),
    );
    expect(error.message).not.toContain("MARKER");
  });
});

// ─── 받기: 응답 겉모습 ───────────────────────────────────────────────────

const URL_A = "https://feeds.example.com/sport/rss.xml";

function routed(responses: Record<string, () => Response>): FetchLike {
  return async (url) => {
    const make = responses[url];
    if (!make) throw new Error(`테스트에서 예상하지 못한 URL: ${url}`);
    return make();
  };
}

describe("fetchFeed — 본문과 함께 응답 겉모습(본문 내용 없음)", () => {
  it("HTTP 상태·미디어 타입·바이트 수(UTF-8 바이트)·형태·호스트 일치·리다이렉트 수", async () => {
    const body = `<?xml version="1.0"?><rss version="2.0"><channel><title>손흥민</title></channel></rss>`;
    const { text, info } = await fetchFeed(URL_A, {
      fetch: routed({
        [URL_A]: () =>
          new Response(body, {
            status: 200,
            headers: { "content-type": "text/xml;charset=UTF-8" },
          }),
      }),
      userAgent: "UA/1",
    });
    expect(text).toBe(body);
    expect(info).toEqual({
      status: 200,
      mediaType: "text/xml",
      bytes: Buffer.byteLength(body, "utf8"),
      shape: "xml-rss",
      sameHost: true,
      redirects: 0,
    });
    expect(info.bytes).toBeGreaterThan(body.length);
  });

  it("같은 호스트 리다이렉트 1회는 redirects 1 · sameHost true", async () => {
    const next = "https://feeds.example.com/new/rss.xml";
    const { info } = await fetchFeed(URL_A, {
      fetch: routed({
        [URL_A]: () =>
          new Response(null, { status: 301, headers: { location: next } }),
        [next]: () => new Response(null, { status: 200 }),
      }),
      userAgent: "UA/1",
    });
    expect(info).toMatchObject({
      redirects: 1,
      sameHost: true,
      bytes: 0,
      shape: "empty",
      mediaType: "none",
    });
  });

  it("fetch가 스스로 다른 호스트로 넘어간 응답이면 sameHost false", async () => {
    const { info } = await fetchFeed(URL_A, {
      fetch: routed({
        [URL_A]: () => {
          const response = new Response("<html></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          });
          Object.defineProperty(response, "url", {
            value: "https://blocked.example.net/denied",
          });
          return response;
        },
      }),
      userAgent: "UA/1",
    });
    expect(info).toMatchObject({
      sameHost: false,
      redirects: 0,
      shape: "html",
      mediaType: "text/html",
    });
  });
});

// ─── 수집 실행기: 결과·로그 ──────────────────────────────────────────────

function capture() {
  const records: LogRecord[] = [];
  const logger = createLogger({
    scope: "collect",
    format: "json",
    sink: (_line, record) => records.push(record),
  });
  return { records, logger };
}

async function collectEspn(make: () => Response) {
  const { records, logger } = capture();
  const result = await collectFeedSources([ESPN], {
    fetch: routed({ [ESPN.url]: make }),
    userAgent: "UA/1",
    logger,
    clock: { now: () => 0, sleep: async () => undefined },
  });
  return { result, records, outcome: result.outcomes[0]! };
}

const respond = (body: string, contentType?: string) => () =>
  new Response(body, {
    status: 200,
    headers: contentType ? { "content-type": contentType } : {},
  });

describe("collectFeedSources — parse 실패 진단(결과 parseDiagnostics + collect.source.fail 필드)", () => {
  it.each([
    [
      "HTML 차단 페이지",
      respond(HTML_BLOCK, "text/html; charset=utf-8"),
      {
        mediaType: "text/html",
        bytes: Buffer.byteLength(HTML_BLOCK),
        shape: "html",
        parser: "unexpected-close-tag",
        line: 2,
        column: 81,
      },
    ],
    [
      "빈 본문(200 text/xml)",
      respond("", "text/xml;charset=UTF-8"),
      {
        mediaType: "text/xml",
        bytes: 0,
        shape: "empty",
        parser: "no-document",
        line: null,
        column: null,
      },
    ],
    [
      "JSON",
      respond(JSON_BODY, "application/json"),
      {
        mediaType: "application/json",
        bytes: Buffer.byteLength(JSON_BODY),
        shape: "json",
        parser: "text-before-root",
        line: 1,
        column: 1,
      },
    ],
    [
      "잘린 XML",
      respond(TRUNCATED, "text/xml;charset=UTF-8"),
      {
        mediaType: "text/xml",
        bytes: Buffer.byteLength(TRUNCATED),
        shape: "xml-rss",
        parser: "unclosed-root",
        line: 1,
        column: 1500,
      },
    ],
  ] as const)("%s", async (_label, make, expected) => {
    const { outcome, records } = await collectEspn(make);
    const diagnostics = {
      status: 200,
      sameHost: true,
      redirects: 0,
      ...expected,
    };
    expect(outcome).toMatchObject({
      id: ESPN.id,
      ok: false,
      errorType: "parse",
      status: null,
      retries: 0,
      parseDiagnostics: diagnostics,
    });
    const fails = records.filter((r) => r.event === "collect.source.fail");
    expect(fails).toHaveLength(1);
    expect(fails[0]).toMatchObject({
      level: "error",
      source: ESPN.id,
      errorType: "parse",
      status: 200,
      mediaType: diagnostics.mediaType,
      bytes: diagnostics.bytes,
      bodyShape: diagnostics.shape,
      sameHost: true,
      redirects: 0,
      parseError: diagnostics.parser,
      line: diagnostics.line,
      column: diagnostics.column,
    });
    // 로그·결과 어디에도 본문 조각이 없다(표식 문자열·태그·sax Char 표기)
    const dumped = JSON.stringify({ records, outcome });
    for (const marker of [
      "MARKER",
      "Access Denied",
      "blocked",
      "<title>",
      "Char:",
      "ESPN",
      "charset",
    ]) {
      expect(dumped).not.toContain(marker);
    }
  });

  it("BOM 붙은 정상 XML은 그대로 수집된다 — 진단 없음, 실패 로그 없음", async () => {
    const { outcome, records } = await collectEspn(
      respond(BOM_XML, "text/xml;charset=UTF-8"),
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.items).toBeGreaterThan(0);
    expect(outcome).not.toHaveProperty("parseDiagnostics");
    expect(records.filter((r) => r.event === "collect.source.fail")).toEqual(
      [],
    );
  });

  it("받기 실패(HTTP 403)에는 파싱 진단을 붙이지 않는다", async () => {
    const { outcome, records } = await collectEspn(
      () => new Response("denied MARKER", { status: 403 }),
    );
    expect(outcome).toMatchObject({ errorType: "http-4xx", status: 403 });
    expect(outcome).not.toHaveProperty("parseDiagnostics");
    const [fail] = records.filter((r) => r.event === "collect.source.fail");
    expect(fail).not.toHaveProperty("bodyShape");
    expect(JSON.stringify(records)).not.toContain("MARKER");
  });
});
