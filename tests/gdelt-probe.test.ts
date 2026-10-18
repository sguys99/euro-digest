/**
 * M1-46 GDELT 소량 재측정 `scripts/lib/gdelt-probe.ts` 단위 테스트 (M0-27 결정 3, PRD §15 D25). 네트워크 없음 — fixtures/gdelt(합성).
 *
 * - 계획: 실제 configs에서 ① sourcelang:korean(gd-ko-allow-domains의 lang) ② gd-ko-allow-domains q 그대로, 요청 URL은 sources.json
 *   gdelt-doc url(하드코딩 없음)·공백 %20
 * - 응답 판정: 200 결과 수·형식 오류 항목·최신 seendate 지연·허용 목록(allow/feed-only/목록 밖) · 200 `{}` = 0건 · 429 텍스트 ·
 *   연결 오류 · 200인데 JSON 아님(parse-error, 재시도 안 함)
 * - 실행기: 요청 ≤ 3건, ① → ② 순서, 실패 쿼리만 1회 재시도, 간격 6초·재시도 전 15초, 형식 오류는 재시도 안 함
 * - 7일 판정: 시험 측정 제외, 기준 4개, 기간 미완이면 판정 전
 * - 문서 반영: 같은 날 한 줄 교체(멱등)·메모 칸 보존·데이터 줄 왕복
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  PublisherDomainsFileSchema,
  SearchQueriesFileSchema,
  SourcesFileSchema,
} from "@/lib/schema";

import {
  GDELT_MAX_REQUESTS,
  GDELT_MIN_GAP_MS,
  GDELT_RETRY_GAP_MS,
  GdeltDayRecordSchema,
  applyGdeltRecord,
  buildGdeltProbePlan,
  evaluateGdeltResponse,
  judgeGdeltPeriod,
  mergeGdeltAttempts,
  planDayProbe,
  requestCounts,
  readGdeltRecords,
  runGdeltProbe,
  type GdeltAttempt,
  type GdeltDayRecord,
  type GdeltProbeQuery,
} from "../scripts/lib/gdelt-probe";
import {
  OBS_BLOCKS,
  observationDocTemplate,
} from "../scripts/lib/observation-doc";
import { readBlock } from "../scripts/lib/research-doc";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const QUERIES = SearchQueriesFileSchema.parse(
  JSON.parse(read("configs/search-queries.json")),
);
const SOURCES = SourcesFileSchema.parse(
  JSON.parse(read("configs/sources.json")),
);
const DOMAINS = PublisherDomainsFileSchema.parse(
  JSON.parse(read("configs/publisher-domains.json")),
).domains;
const SAMPLE = read("fixtures/gdelt/artlist-sample.json");
const EMPTY = read("fixtures/gdelt/artlist-empty.json");
const RATE_LIMITED = read("fixtures/gdelt/rate-limited.txt");

const PLAN = buildGdeltProbePlan(QUERIES, SOURCES);
const SCALE = PLAN[0]!;
const ALLOW = PLAN[1]!;

describe("buildGdeltProbePlan — 실제 configs", () => {
  it("① sourcelang:korean(gd-ko-allow-domains lang) ② 허용 도메인 OR q 그대로 — gdelt-doc url, 비활성 설정은 읽기만", () => {
    expect(PLAN.map((q) => q.key)).toEqual(["ko-scale", "allow-domains"]);
    expect(SCALE.query).toBe("sourcelang:korean");
    const allowQuery = QUERIES.queries.find(
      (q) => q.id === "gd-ko-allow-domains",
    )!;
    expect(ALLOW.query).toBe(allowQuery.q);
    expect(allowQuery.enabled).toBe(false);
    const gdelt = SOURCES.find((s) => s.id === "gdelt-doc")!;
    for (const q of PLAN) {
      expect(q.url.startsWith(`${gdelt.url}?query=`)).toBe(true);
      expect(q.url).toContain(
        "&mode=ArtList&format=json&maxrecords=250&sort=DateDesc&timespan=1d",
      );
      expect(q.url).not.toContain("+");
    }
    expect(SCALE.url).toContain("query=sourcelang%3Akorean&");
    expect(ALLOW.url).toContain("%20OR%20");
  });

  it("쿼리·소스·언어가 맞지 않으면 설정 오류", () => {
    expect(() => buildGdeltProbePlan({ queries: [] }, SOURCES)).toThrow(
      /gd-ko-allow-domains/,
    );
    const allow = QUERIES.queries.find((q) => q.id === "gd-ko-allow-domains")!;
    expect(() =>
      buildGdeltProbePlan(
        { queries: [{ ...allow, source: "bbc-sport-football" }] },
        SOURCES,
      ),
    ).toThrow(/search/);
    expect(() =>
      buildGdeltProbePlan({ queries: [{ ...allow, lang: "xx" }] }, SOURCES),
    ).toThrow(/언어/);
  });
});

function evaluate(
  status: number | null,
  text: string,
  q: GdeltProbeQuery = SCALE,
  networkError?: string,
): GdeltAttempt {
  return evaluateGdeltResponse(
    {
      query: q,
      attempt: 1,
      requestedAt: "2026-10-18T06:00:00.000Z",
      elapsedMs: 12_345,
      status,
      text,
      ...(networkError ? { networkError } : {}),
    },
    DOMAINS,
  );
}

describe("evaluateGdeltResponse — 응답 판정(M0-27 응답 필드)", () => {
  it("200 결과: 건수·형식 오류·최신 seendate 지연·허용 목록 판정(URL 호스트 기준)", () => {
    const a = evaluate(200, SAMPLE);
    expect(a.outcome).toBe("ok");
    expect(a.results).toBe(5);
    expect(a.invalid).toBe(1);
    expect(a.capped).toBe(false);
    expect(a.latestSeen).toBe("2026-10-18T05:45:00.000Z");
    expect(a.lagMinutes).toBe(15);
    expect(a.allow).toBe(1); // interfootball.co.kr
    expect(a.feedOnly).toBe(1); // bbc.com
    expect(a.deny).toBe(0);
    expect(a.notListed).toBe(3);
    expect(a.topHosts).toEqual([
      { host: "hani.co.kr", count: 2 },
      { host: "biz.heraldcorp.com", count: 1 },
    ]);
    expect(a.error).toBeNull();
    // 결과 기사 제목·URL은 기록에 남지 않는다
    expect(JSON.stringify(a)).not.toMatch(/합성 제목|articleView|idxno/);
  });

  it("200 `{}` = 0건(지연 없음) · 빈 본문도 0건", () => {
    for (const text of [EMPTY, ""]) {
      const a = evaluate(200, text, ALLOW);
      expect(a).toMatchObject({
        outcome: "ok",
        results: 0,
        latestSeen: null,
        lagMinutes: null,
        allow: 0,
      });
    }
  });

  it("429 텍스트 본문 → rate-limited(본문은 남기지 않음) · 5xx → http-error · 응답 없음 → network", () => {
    const limited = evaluate(429, RATE_LIMITED);
    expect(limited).toMatchObject({
      outcome: "rate-limited",
      status: 429,
      results: null,
      error: "HTTP 429",
    });
    expect(JSON.stringify(limited)).not.toContain("ngrams");
    expect(evaluate(503, "busy")).toMatchObject({
      outcome: "http-error",
      error: "HTTP 503",
    });
    expect(evaluate(null, "", SCALE, "타임아웃 45초")).toMatchObject({
      outcome: "network",
      status: null,
      error: "타임아웃 45초",
    });
  });

  it("200인데 JSON이 아니면(쿼리 오류 문구) parse-error", () => {
    expect(evaluate(200, "The specified phrase is too short.").outcome).toBe(
      "parse-error",
    );
    expect(evaluate(200, '{"articles":"x"}').outcome).toBe("parse-error");
  });

  it("250건이면 상한 도달(capped)", () => {
    const articles = Array.from({ length: 250 }, (_, i) => ({
      url: `https://www.hani.co.kr/arti/${i}.html`,
      seendate: "20261018T054500Z",
    }));
    expect(evaluate(200, JSON.stringify({ articles })).capped).toBe(true);
  });
});

/** 응답을 차례로 돌려주는 가짜 fetch + 잠든 시간 기록 */
/** 응답 머리는 왔는데 본문 스트림이 끊기는 응답(연결 리셋 등) */
const BROKEN_BODY = Symbol("broken-body");

function fakeIo(
  responses: Array<
    { status: number; text: string } | Error | typeof BROKEN_BODY
  >,
) {
  const calls: Array<{ url: string; ua: string | null }> = [];
  const sleeps: number[] = [];
  let clock = Date.parse("2026-10-18T06:00:00.000Z");
  let i = 0;
  return {
    calls,
    sleeps,
    deps: {
      fetch: async (url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        calls.push({ url, ua: headers.get("User-Agent") });
        const r = responses[i++];
        clock += 10_000;
        if (!r) throw new Error("응답 목록 소진");
        if (r instanceof Error) throw r;
        if (r === BROKEN_BODY) {
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"articles":['));
              controller.error(new TypeError("terminated"));
            },
          });
          return new Response(body, { status: 200 });
        }
        return new Response(r.text, { status: r.status });
      },
      sleep: async (ms: number) => {
        sleeps.push(ms);
        clock += ms;
      },
      now: () => new Date(clock),
      userAgent:
        "EuroDigestBot/0.1 (+https://github.com/sguys99/euro-digest; ops@example.com)",
    },
  };
}

describe("runGdeltProbe — 요청 ≤ 3건·간격·재시도", () => {
  it("둘 다 성공: 요청 2건, ① → ②, 사이 6초, User-Agent 전달", async () => {
    const io = fakeIo([
      { status: 200, text: SAMPLE },
      { status: 200, text: EMPTY },
    ]);
    const attempts = await runGdeltProbe(PLAN, DOMAINS, io.deps);
    expect(attempts.map((a) => [a.key, a.outcome])).toEqual([
      ["ko-scale", "ok"],
      ["allow-domains", "ok"],
    ]);
    expect(io.calls.map((c) => c.url)).toEqual([SCALE.url, ALLOW.url]);
    expect(io.calls.every((c) => c.ua?.startsWith("EuroDigestBot/0.1"))).toBe(
      true,
    );
    expect(io.sleeps).toEqual([GDELT_MIN_GAP_MS]);
  });

  it("① 429 → ② 성공 → ①만 15초 뒤 1회 재시도(요청 3건)", async () => {
    const io = fakeIo([
      { status: 429, text: RATE_LIMITED },
      { status: 200, text: EMPTY },
      { status: 200, text: SAMPLE },
    ]);
    const attempts = await runGdeltProbe(PLAN, DOMAINS, io.deps);
    expect(attempts.map((a) => [a.key, a.attempt, a.outcome])).toEqual([
      ["ko-scale", 1, "rate-limited"],
      ["allow-domains", 1, "ok"],
      ["ko-scale", 2, "ok"],
    ]);
    expect(io.sleeps).toEqual([GDELT_MIN_GAP_MS, GDELT_RETRY_GAP_MS]);
  });

  it("둘 다 실패해도 요청은 3건까지 — 첫 실패 쿼리(①)만 재시도", async () => {
    const io = fakeIo([
      { status: 429, text: RATE_LIMITED },
      new TypeError("fetch failed"),
      { status: 429, text: RATE_LIMITED },
      { status: 200, text: SAMPLE },
    ]);
    const attempts = await runGdeltProbe(PLAN, DOMAINS, io.deps);
    expect(attempts).toHaveLength(GDELT_MAX_REQUESTS);
    expect(io.calls).toHaveLength(3);
    expect(attempts.map((a) => [a.key, a.outcome])).toEqual([
      ["ko-scale", "rate-limited"],
      ["allow-domains", "network"],
      ["ko-scale", "rate-limited"],
    ]);
    expect(attempts[1]!.error).toBe("fetch failed");
  });

  it("형식 오류(parse-error)는 재시도하지 않는다 · maxRequests는 3을 넘지 못한다", async () => {
    const io = fakeIo([
      { status: 200, text: "not json" },
      { status: 200, text: EMPTY },
    ]);
    const attempts = await runGdeltProbe(PLAN, DOMAINS, {
      ...io.deps,
      maxRequests: 10,
    });
    expect(attempts).toHaveLength(2);
    expect(io.sleeps).toEqual([GDELT_MIN_GAP_MS]);
  });

  it("200인데 본문 스트림이 끊기면 성공(0건)이 아니라 network — 상태는 남기고 재시도 대상", async () => {
    const io = fakeIo([
      BROKEN_BODY,
      { status: 200, text: EMPTY },
      { status: 200, text: SAMPLE },
    ]);
    const attempts = await runGdeltProbe(PLAN, DOMAINS, io.deps);
    expect(attempts[0]).toMatchObject({
      key: "ko-scale",
      status: 200,
      outcome: "network",
      results: null,
      error: "본문 읽기 실패 — terminated",
    });
    expect(attempts.map((a) => [a.key, a.attempt, a.outcome])).toEqual([
      ["ko-scale", 1, "network"],
      ["allow-domains", 1, "ok"],
      ["ko-scale", 2, "ok"],
    ]);
    // 판정 함수도 networkError가 있으면 상태 200을 성공으로 보지 않는다
    expect(evaluate(200, "", SCALE, "본문 읽기 실패 — x").outcome).toBe(
      "network",
    );
  });
});

describe("같은 날 다시 재기(--force) — 앞 시도 유지·하루 3건", () => {
  const prior = [
    attempt({
      key: "ko-scale",
      outcome: "rate-limited",
      status: 429,
      results: null,
    }),
    attempt({ key: "allow-domains", results: 0, capped: false, allow: 0 }),
  ];

  it("기록이 없으면 전체 계획·3건, 있으면 성공 못 한 쿼리만·남은 요청 수", () => {
    expect(planDayProbe(PLAN, undefined)).toEqual({
      ok: true,
      plan: PLAN,
      maxRequests: 3,
    });
    expect(planDayProbe(PLAN, { attempts: prior })).toEqual({
      ok: true,
      plan: [SCALE],
      maxRequests: 1,
    });
  });

  it("이미 3건 보냈거나 둘 다 성공했으면 거부", () => {
    const three = [
      ...prior,
      attempt({
        key: "ko-scale",
        outcome: "rate-limited",
        status: 429,
        results: null,
      }),
    ];
    expect(planDayProbe(PLAN, { attempts: three })).toMatchObject({
      ok: false,
    });
    const bothOk = [attempt({}), attempt({ key: "allow-domains" })];
    expect(planDayProbe(PLAN, { attempts: bothOk })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("성공"),
    });
  });

  it("앞 시도는 버리지 않는다 — 번호를 이어 붙이고 성공률에 모두 들어간다", () => {
    const merged = mergeGdeltAttempts(prior, [
      attempt({ key: "ko-scale", attempt: 1 }),
    ]);
    expect(merged.map((a) => [a.key, a.attempt, a.outcome])).toEqual([
      ["ko-scale", 1, "rate-limited"],
      ["allow-domains", 1, "ok"],
      ["ko-scale", 2, "ok"],
    ]);
    const record = {
      v: 1 as const,
      date: "2026-10-20",
      measuredAt: "2026-10-20T06:00:00.000Z",
      trial: false,
      contact: true,
      attempts: merged,
    };
    expect(GdeltDayRecordSchema.safeParse(record).success).toBe(true);
    expect(requestCounts(record)).toEqual({
      ok: 2,
      rateLimited: 1,
      error: 0,
      total: 3,
    });
  });
});

function attempt(over: Partial<GdeltAttempt>): GdeltAttempt {
  return {
    key: "ko-scale",
    attempt: 1,
    requestedAt: "2026-10-20T06:00:00.000Z",
    elapsedMs: 10_000,
    status: 200,
    outcome: "ok",
    results: 250,
    capped: true,
    invalid: 0,
    latestSeen: "2026-10-20T05:30:00.000Z",
    lagMinutes: 30,
    allow: 0,
    feedOnly: 0,
    deny: 0,
    notListed: 250,
    topHosts: [],
    error: null,
    ...over,
  };
}

function day(
  date: string,
  attempts: GdeltAttempt[],
  trial = false,
): GdeltDayRecord {
  return {
    v: 1,
    date,
    measuredAt: `${date}T06:00:00.000Z`,
    trial,
    contact: true,
    attempts,
  };
}

const WEEK = [
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
  "2026-10-23",
  "2026-10-24",
  "2026-10-25",
  "2026-10-26",
];

describe("judgeGdeltPeriod — 재활성 기준 4개(M0-27 설계 권고 3)", () => {
  it("7일 모두 성공·수백 건·지연 30분·허용 1건 → 충족", () => {
    const records = WEEK.map((d, i) =>
      day(d, [
        attempt({}),
        attempt({
          key: "allow-domains",
          results: 1,
          capped: false,
          allow: i === 3 ? 1 : 0,
        }),
      ]),
    );
    const v = judgeGdeltPeriod(records);
    expect(v.days).toBe(7);
    expect(v.criteria.map((c) => c.met)).toEqual([true, true, true, true]);
    expect(v.overall).toBe("met");
  });

  it("429 다발(성공률 < 80%)·허용 0건이면 미충족, 시험 측정(trial)·기간 밖은 뺀다", () => {
    const records = [
      day("2026-10-18", [attempt({ results: 3, capped: false })], true),
      ...WEEK.map((d) =>
        day(d, [
          attempt({ outcome: "rate-limited", status: 429, results: null }),
          attempt({
            key: "allow-domains",
            results: 0,
            capped: false,
            allow: 0,
          }),
        ]),
      ),
    ];
    const v = judgeGdeltPeriod(records);
    expect(v.days).toBe(7);
    expect(v.criteria[0]!.met).toBe(false);
    expect(v.criteria[0]!.value).toContain("7/14");
    expect(v.criteria[1]!.met).toBeNull(); // ① 성공 측정 없음
    expect(v.criteria[3]!.met).toBe(false);
    expect(v.overall).toBe("not-met");
  });

  it("기간이 끝나기 전에는 성공률·허용 도메인을 확정하지 않는다(판정 전)", () => {
    const v = judgeGdeltPeriod([
      day("2026-10-20", [
        attempt({}),
        attempt({ key: "allow-domains", results: 0, capped: false, allow: 0 }),
      ]),
    ]);
    expect(v.criteria.map((c) => c.met)).toEqual([null, true, true, null]);
    expect(v.overall).toBe("pending");
  });

  it("한국어 결과 중앙값 < 200 · 지연 중앙값 > 60분이면 미충족", () => {
    const v = judgeGdeltPeriod([
      day("2026-10-20", [
        attempt({ results: 3, capped: false, lagMinutes: 140 }),
      ]),
    ]);
    expect(v.criteria[1]!.met).toBe(false);
    expect(v.criteria[2]!.met).toBe(false);
    expect(v.overall).toBe("not-met");
  });
});

describe("applyGdeltRecord — 문서 반영(멱등·메모 보존)", () => {
  it("같은 날 다시 반영하면 한 줄만, 메모 칸은 남고 데이터 줄로 왕복된다", () => {
    const r1 = day(
      "2026-10-18",
      [attempt({ results: 3, capped: false })],
      true,
    );
    let doc = applyGdeltRecord(observationDocTemplate(), r1);
    const table = readBlock(doc, OBS_BLOCKS.gdeltTable)!;
    expect(
      table.split("\n").filter((l) => l.startsWith("| 2026-10-18")),
    ).toHaveLength(1);
    expect(table).toContain("관찰 전 시험 측정");
    // 사람이 메모를 적는다
    doc = doc.replace(/(\| 2026-10-18 \|.*\| )— \|$/m, "$1수동 메모 |");
    const r2 = day(
      "2026-10-18",
      [attempt({ results: 7, capped: false })],
      true,
    );
    doc = applyGdeltRecord(doc, r2);
    const again = readBlock(doc, OBS_BLOCKS.gdeltTable)!;
    const rows = again.split("\n").filter((l) => l.startsWith("| 2026-10-18"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("| 7 |");
    expect(rows[0]).toContain("수동 메모");
    expect(readGdeltRecords(doc).records).toEqual([r2]);
    expect(readBlock(doc, OBS_BLOCKS.gdeltVerdict)).toContain("판정 전");
    // 데이터 줄은 주석 안 — 문서 끝 주석이 닫혀 있다
    expect(doc.trimEnd().endsWith("-->")).toBe(true);
  });
});
