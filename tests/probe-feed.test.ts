/**
 * plan M1-41 — 피드 러너 재확인 도구(scripts/lib/probe-feed.ts, 일회성). 확인하는 것:
 *   - 판정: ok(200 + RSS 파싱 + item ≥ 1) · blocked(202 빈 응답 — 10-14 러너 증상 · 200 HTML · 403) · error(파싱 실패 · 네트워크 ·
 *     item 0건)
 *   - 수집기 받기 경로(rss.ts `fetchFeed`)를 그대로 써서 요청은 정확히 1회, User-Agent는 `feedUserAgent` 그대로
 *   - 출력(콘솔·Step Summary 표)에 피드 제목·링크가 새지 않는다
 *   - 인자·소스 고르기: --source 필수, terms_checked: true가 아니면 거부, enabled: false는 허용
 * 네트워크 없음 — fetch는 가짜 응답을 돌려준다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SourcesFileSchema, type Source } from "@/lib/schema";

import {
  judgeProbe,
  parseProbeFeedArgs,
  probeFeed,
  probeLogFields,
  probeRows,
  renderProbeMarkdown,
  renderProbeText,
  resolveProbeSource,
  type FeedProbeObservation,
} from "../scripts/lib/probe-feed";
import {
  feedUserAgent,
  parseFeedXml,
  type FetchLike,
} from "../scripts/lib/rss";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const SOURCES: Source[] = SourcesFileSchema.parse(
  JSON.parse(read("configs/sources.json")),
);
/** 설정의 espn-soccer — 재활성 뒤에도 테스트가 그대로 돌게 enabled는 false로 고정해 둔다 */
const ESPN: Source = {
  ...SOURCES.find((s) => s.id === "espn-soccer")!,
  enabled: false,
};
const ESPN_XML = read("fixtures/rss/espn-soccer.xml");
const UA = feedUserAgent("test@example.com");

/** 호출마다 100ms씩 가는 가짜 시계 */
function fakeNow(startIso = "2026-10-29T01:00:00.000Z"): () => Date {
  let t = Date.parse(startIso);
  return () => {
    const d = new Date(t);
    t += 100;
    return d;
  };
}

/** 응답 하나를 돌려주고 호출을 기록하는 가짜 fetch */
function oneResponse(make: () => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return make();
  };
  return { fetch, calls };
}

function runProbe(make: () => Response | Promise<Response>) {
  const { fetch, calls } = oneResponse(make);
  return probeFeed(ESPN, { fetch, userAgent: UA, now: fakeNow() }).then(
    (observation) => ({ observation, calls }),
  );
}

// ─── 수집기 받기 경로 + 판정 ─────────────────────────────────────────────

describe("probeFeed → judgeProbe", () => {
  it("ok — 200 + RSS 파싱 성공 + item ≥ 1, 요청 1회·수집기 UA, 최신 pubDate는 UTC", async () => {
    const { observation, calls } = await runProbe(
      () =>
        new Response(ESPN_XML, {
          status: 200,
          headers: { "content-type": "text/xml; charset=UTF-8" },
        }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(ESPN.url);
    const headers = new Headers(calls[0]!.init?.headers);
    expect(headers.get("user-agent")).toBe(UA);
    expect(calls[0]!.init?.redirect).toBe("manual");

    expect(observation.requestedAt).toBe("2026-10-29T01:00:00.000Z");
    expect(observation.outcome).toMatchObject({
      fetched: true,
      info: { status: 200, mediaType: "text/xml", shape: "xml-rss" },
      // fixture 6건 — 가장 늦은 'Sat, 10 Oct 2026 21:43:46 EST'(UTC−5) = 2026-10-11T02:43:46Z
      parse: { ok: true, items: 6, undated: 0 },
    });
    if (observation.outcome.fetched && observation.outcome.parse.ok) {
      expect(observation.outcome.parse.latestPubDate).toMatch(
        /^2026-10-11T02:43:46(\.000)?Z$/,
      );
    }
    expect(judgeProbe(observation)).toEqual({
      verdict: "ok",
      reason: "HTTP 200 · RSS 문서 · item 6건",
    });
  });

  it("blocked — 202 · text/html · 0바이트(2026-10-14 러너 증상)", async () => {
    const { observation, calls } = await runProbe(
      () =>
        new Response("", {
          status: 202,
          headers: { "content-type": "text/html" },
        }),
    );

    expect(calls).toHaveLength(1);
    expect(observation.outcome).toMatchObject({
      fetched: true,
      info: { status: 202, mediaType: "text/html", bytes: 0, shape: "empty" },
      parse: { ok: false, parser: "no-document" },
    });
    const judgement = judgeProbe(observation);
    expect(judgement.verdict).toBe("blocked");
    expect(judgement.reason).toContain("HTTP 202");
    expect(judgement.reason).toContain("빈 본문");
  });

  it("blocked — 200인데 HTML 차단 페이지", async () => {
    const { observation } = await runProbe(
      () =>
        new Response(
          "<!DOCTYPE html><html><head><title>Access Denied</title></head><body>MARKER-HTML</body></html>",
          { status: 200, headers: { "content-type": "text/html" } },
        ),
    );
    const judgement = judgeProbe(observation);
    expect(judgement.verdict).toBe("blocked");
    expect(judgement.reason).toContain("HTML");
    // 본문 조각은 어디에도 남지 않는다
    expect(JSON.stringify(observation)).not.toContain("MARKER-HTML");
    expect(renderProbeText(observation)).not.toContain("MARKER-HTML");
  });

  it("blocked — 403(본문을 읽지 않는 받기 실패라 미디어 타입·바이트는 —)", async () => {
    const { observation } = await runProbe(
      () => new Response("denied", { status: 403 }),
    );
    expect(observation.outcome).toEqual({
      fetched: false,
      kind: "http-4xx",
      status: 403,
    });
    expect(judgeProbe(observation).verdict).toBe("blocked");
    const rows = new Map(probeRows(observation));
    expect(rows.get("HTTP 상태")).toBe("403");
    expect(rows.get("바이트")).toBe("—");
  });

  it("error — 200 RSS 머리인데 잘린 XML(파싱 실패)", async () => {
    const { observation } = await runProbe(
      () => new Response(ESPN_XML.slice(0, 1500), { status: 200 }),
    );
    expect(observation.outcome).toMatchObject({
      fetched: true,
      info: { shape: "xml-rss" },
      parse: { ok: false },
    });
    const judgement = judgeProbe(observation);
    expect(judgement.verdict).toBe("error");
    expect(judgement.reason).toContain("파싱 실패");
  });

  it("error — 네트워크 오류(응답 없음)", async () => {
    const { observation } = await runProbe(() => {
      throw new TypeError("fetch failed");
    });
    expect(observation.outcome).toEqual({
      fetched: false,
      kind: "network",
      status: null,
    });
    expect(judgeProbe(observation).verdict).toBe("error");
  });

  it("error — 200 RSS인데 item 0건", async () => {
    const { observation } = await runProbe(
      () =>
        new Response(
          `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title></channel></rss>`,
          { status: 200 },
        ),
    );
    expect(judgeProbe(observation)).toEqual({
      verdict: "error",
      reason: "HTTP 200 · RSS 문서 — 파싱은 됐지만 item 0건",
    });
  });
});

// ─── 출력 ────────────────────────────────────────────────────────────────

describe("출력 — 콘솔·Step Summary", () => {
  it("Step Summary 표에 판정·상태·item 수가 있고, 피드 제목·링크는 없다", async () => {
    const { observation } = await runProbe(
      () => new Response(ESPN_XML, { status: 200 }),
    );
    const markdown = renderProbeMarkdown(observation);
    const text = renderProbeText(observation);

    expect(markdown).toContain("### 피드 진단 — espn-soccer");
    expect(markdown).toContain("| 항목 | 값 |");
    expect(markdown).toContain(
      "| 판정 | ok — HTTP 200 · RSS 문서 · item 6건 |",
    );
    expect(markdown).toContain("| item 수 | 6 |");
    expect(text).toContain("espn-soccer (enabled: false)");

    const items = await parseFeedXml(ESPN_XML, { summaries: false });
    for (const item of items) {
      for (const leaked of [item.title, item.link]) {
        if (!leaked) continue;
        expect(markdown).not.toContain(leaked);
        expect(text).not.toContain(leaked);
        expect(JSON.stringify(probeLogFields(observation))).not.toContain(
          leaked,
        );
      }
    }
  });

  it("표 칸의 | 와 줄바꿈을 이스케이프한다", () => {
    const observation: FeedProbeObservation = {
      sourceId: "espn-soccer",
      url: "https://example.com/a|b",
      enabled: false,
      userAgent: "UA\nnext",
      requestedAt: "2026-10-29T01:00:00.000Z",
      elapsedMs: 5,
      outcome: { fetched: false, kind: "timeout", status: null },
    };
    const markdown = renderProbeMarkdown(observation);
    expect(markdown).toContain("| 피드 URL | https://example.com/a\\|b |");
    expect(markdown).toContain("| User-Agent | UA next |");
    expect(markdown).toContain(
      "| 판정 | error — 받기 실패 — timeout: 시간 초과 |",
    );
  });
});

// ─── 인자·소스 고르기 ────────────────────────────────────────────────────

describe("parseProbeFeedArgs", () => {
  it("--source 값을 받는다", () => {
    expect(parseProbeFeedArgs(["--source", "espn-soccer"])).toEqual({
      ok: true,
      value: { help: false, source: "espn-soccer" },
    });
  });

  it.each([
    [[]],
    [["--source", "  "]],
    [["--source"]],
    [["--unknown", "x"]],
    [["espn-soccer"]],
  ])("잘못된 인자 %j → 오류", (argv) => {
    expect(parseProbeFeedArgs(argv).ok).toBe(false);
  });

  it("--help", () => {
    expect(parseProbeFeedArgs(["--help"])).toEqual({
      ok: true,
      value: { help: true },
    });
  });
});

describe("resolveProbeSource", () => {
  // 설정 파일 값이 바뀌어도(재활성 등) 규칙만 보게 합성 목록을 쓴다
  const LIST: Source[] = [
    ESPN,
    { ...ESPN, id: "no-terms", enabled: true, terms_checked: false },
    { ...ESPN, id: "search-src", type: "search" },
    { ...ESPN, id: "journalist-src", type: "journalist", enabled: true },
  ];

  it("enabled: false여도 terms_checked: true인 RSS 소스는 진단한다", () => {
    const resolved = resolveProbeSource(LIST, "espn-soccer");
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.value.enabled).toBe(false);
    expect(resolveProbeSource(LIST, "journalist-src").ok).toBe(true);
  });

  it("terms_checked가 true가 아니면 거부한다", () => {
    const resolved = resolveProbeSource(LIST, "no-terms");
    expect(resolved).toMatchObject({ ok: false });
    if (!resolved.ok) expect(resolved.error).toContain("terms_checked");
  });

  it("피드형이 아닌 type(search)은 거부한다", () => {
    const resolved = resolveProbeSource(LIST, "search-src");
    expect(resolved).toMatchObject({ ok: false });
    if (!resolved.ok) expect(resolved.error).toContain("search");
  });

  it("없는 소스 id는 거부한다", () => {
    expect(resolveProbeSource(LIST, "no-such-source").ok).toBe(false);
  });

  it("실제 설정의 espn-soccer를 찾는다(terms_checked: true)", () => {
    expect(resolveProbeSource(SOURCES, "espn-soccer").ok).toBe(true);
  });
});
