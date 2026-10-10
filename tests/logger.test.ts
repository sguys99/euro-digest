import { describe, expect, it } from "vitest";

import { createLlmLogger, type LlmLogEvent } from "../scripts/lib/llm";
import {
  annotate,
  createLogger,
  formatAnnotation,
  formatRecord,
  group,
  isSecretKey,
  isValidEventName,
  resolveLogFormat,
  sanitizeFields,
  sanitizeText,
  type LogRecord,
} from "../scripts/lib/logger";

// 가짜 비밀값은 실행 중에 조립한다(소스에 토큰 모양 문자열을 두지 않는다 — tests/secret-scan.test.ts와 같은 규칙).
const FAKE = {
  anthropic: ["sk", "ant", "api03", "Ab12Cd34Ef56Gh78"].join("-"),
  ghs: `${"gh"}s_${"Z9y8X7w6".repeat(5)}`,
  ghp: `${"gh"}p_${"A1b2C3d4".repeat(5)}`,
  pat: `${"github"}_pat_${"11ABCDEFG0_abcdefghijklmnop".repeat(2)}`,
};

const NOW = new Date("2026-10-10T21:30:05.123Z"); // = 2026-10-11 06:30:05 KST

function capture(options: Partial<Parameters<typeof createLogger>[0]> = {}) {
  const lines: string[] = [];
  const records: LogRecord[] = [];
  const logger = createLogger({
    scope: "collect",
    format: "json",
    now: () => NOW,
    env: {},
    sink: (line, record) => {
      lines.push(line);
      records.push(record);
    },
    ...options,
  });
  return { logger, lines, records };
}

describe("createLogger — 레코드·포맷", () => {
  it("json 포맷은 { ts(UTC), level, scope, event, ...fields } 한 줄", () => {
    const { logger, lines } = capture();
    logger.info("collect.source.fetch", {
      source: "bbc-sport",
      items: 12,
      elapsedMs: 812,
    });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      ts: "2026-10-10T21:30:05.123Z",
      level: "info",
      scope: "collect",
      event: "collect.source.fetch",
      source: "bbc-sport",
      items: 12,
      elapsedMs: 812,
    });
    expect(lines[0]).not.toContain("\n");
  });

  it("pretty 포맷은 KST 시각·수준·scope·이벤트·k=v 한 줄", () => {
    const { logger, lines } = capture({ format: "pretty" });
    logger.warn("collect.source.skip", {
      source: "bbc-sport",
      status: 503,
      reason: "HTTP 503 Service Unavailable",
    });
    expect(lines[0]).toBe(
      '06:30:05 WARN  [collect] collect.source.skip source=bbc-sport status=503 reason="HTTP 503 Service Unavailable"',
    );
  });

  it("기본 포맷은 CI(GITHUB_ACTIONS=true)면 json, 아니면 pretty", () => {
    expect(resolveLogFormat({ GITHUB_ACTIONS: "true" })).toBe("json");
    expect(resolveLogFormat({})).toBe("pretty");
    expect(resolveLogFormat({ GITHUB_ACTIONS: "false" })).toBe("pretty");
    const ci = capture({ format: undefined, env: { GITHUB_ACTIONS: "true" } });
    ci.logger.info("collect.done", { count: 1 });
    expect(() => JSON.parse(ci.lines[0] ?? "")).not.toThrow();
  });

  it("debug는 기본적으로 버리고, minLevel 또는 RUNNER_DEBUG=1이면 남긴다", () => {
    const quiet = capture();
    quiet.logger.debug("collect.source.detail", { n: 1 });
    expect(quiet.lines).toHaveLength(0);

    const debugEnv = capture({ env: { RUNNER_DEBUG: "1" } });
    debugEnv.logger.debug("collect.source.detail", { n: 1 });
    expect(debugEnv.records[0]?.level).toBe("debug");

    const warnOnly = capture({ minLevel: "warn" });
    warnOnly.logger.info("collect.done", {});
    warnOnly.logger.error("collect.fail", {});
    expect(warnOnly.records.map((r) => r.level)).toEqual(["error"]);
  });

  it("child는 고정 필드를 붙이고, 호출 필드가 우선하며 고정 키(ts·level·scope·event)는 덮어쓰지 못한다", () => {
    const { logger, records } = capture();
    const child = logger.child({ runId: "r1", source: "a" });
    child.info("collect.source.fetch", {
      source: "b",
      items: 3,
      level: "fake",
      scope: "x",
    });
    expect(records[0]).toMatchObject({
      level: "info",
      scope: "collect",
      runId: "r1",
      source: "b",
      items: 3,
      _level: "fake",
      _scope: "x",
    });
    child.child({ stage: "dedup" }).info("dedup.done", { count: 2 });
    expect(records[1]).toMatchObject({ runId: "r1", stage: "dedup", count: 2 });
  });

  it("싱크가 던져도 로깅은 조용히 넘어간다(파이프라인을 멈추지 않는다)", () => {
    const logger = createLogger({
      scope: "x",
      env: {},
      sink: () => {
        throw new Error("disk full");
      },
    });
    expect(() => logger.error("collect.fail", { a: 1 })).not.toThrow();
  });

  it("순환 참조·Error·Date·bigint·undefined를 JSON 안전한 값으로 바꾼다", () => {
    const { logger, lines } = capture();
    const loop: Record<string, unknown> = { name: "loop" };
    loop.self = loop;
    logger.error("collect.fail", {
      loop,
      error: new TypeError(`fetch failed ${FAKE.ghs}`),
      at: new Date("2026-10-10T00:00:00Z"),
      big: BigInt(42),
      missing: undefined,
      fn: () => 1,
    });
    const record = JSON.parse(lines[0] ?? "");
    expect(record.loop).toEqual({ name: "loop", self: "[Circular]" });
    expect(record.error).toEqual({
      name: "TypeError",
      message: "fetch failed ghs_****",
    });
    expect(record.at).toBe("2026-10-10T00:00:00.000Z");
    expect(record.big).toBe("42");
    expect("missing" in record).toBe(false);
    expect("fn" in record).toBe(false);
  });
});

describe("마스킹·절단", () => {
  it.each([
    "apiKey",
    "api_key",
    "ANTHROPIC_API_KEY",
    "FOOTBALL_DATA_API_KEY",
    "privateKey",
    "token",
    "accessToken",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "authorization",
    "Authorization",
    "password",
    "passwd",
    "clientSecret",
    "cookie",
    "credentials",
  ])("비밀 키 이름 %s는 값 전체를 가린다", (key) => {
    expect(isSecretKey(key)).toBe(true);
    expect(sanitizeFields({ [key]: "plain-value-123" })).toEqual({
      [key]: "****",
    });
  });

  it.each(["inputTokens", "maxTokens", "key", "keys", "source", "items"])(
    "카운터·식별자 %s는 가리지 않는다",
    (key) => {
      expect(isSecretKey(key)).toBe(false);
    },
  );

  it("값 안의 비밀 패턴(sk-ant-·ghp_·ghs_·github_pat_·NAME=값·Bearer·URL 쿼리)을 가린다", () => {
    const fields = sanitizeFields({
      a: `key ${FAKE.anthropic}`,
      b: `push failed for ${FAKE.ghp}`,
      c: FAKE.ghs,
      d: FAKE.pat,
      e: "ANTHROPIC_API_KEY=abcdef123456",
      f: "Authorization: Bearer abcdefghijklmnop.qrstuv",
      g: "https://api.example.com/v4/x?api_key=abc123&season=2026&token=zzz999",
      nested: { list: [`x ${FAKE.ghs}`], deep: { msg: FAKE.anthropic } },
    });
    expect(fields).toEqual({
      a: "key sk-ant-****",
      b: "push failed for ghp_****",
      c: "ghs_****",
      d: "github_pat_****",
      e: "ANTHROPIC_API_KEY=****",
      f: "Authorization: Bearer ****",
      g: "https://api.example.com/v4/x?api_key=****&season=2026&token=****",
      nested: { list: ["x ghs_****"], deep: { msg: "sk-ant-****" } },
    });
    const serialized = JSON.stringify(fields);
    for (const value of Object.values(FAKE)) {
      expect(serialized).not.toContain(value);
    }
  });

  it("긴 문자열은 N자로 자르고 남은 길이를 적는다(전체 응답 본문 방지)", () => {
    const long = "가".repeat(1000);
    expect(sanitizeText(long, 300)).toBe(`${"가".repeat(300)}…(+700자)`);
    const { logger, records } = capture({ maxStringLength: 50 });
    logger.info("collect.source.fetch", { body: "x".repeat(500) });
    expect(String(records[0]?.body)).toHaveLength(50 + "…(+450자)".length);
  });

  it("가린 다음 자른다 — 절단 경계에 걸린 비밀값 조각이 남지 않는다", () => {
    const text = `${"a".repeat(290)}${FAKE.ghs}`;
    const out = sanitizeText(text, 300);
    expect(out).not.toContain(FAKE.ghs.slice(0, 10));
    expect(out).toContain("ghs_****");
  });

  it("배열은 50개까지만 남긴다", () => {
    const out = sanitizeFields({
      list: Array.from({ length: 60 }, (_, i) => i),
    });
    expect(out.list).toHaveLength(51);
    expect((out.list as unknown[]).at(-1)).toBe("…(+10개)");
  });
});

describe("이벤트 이름 규칙", () => {
  it.each([
    ["collect.source.fetch", true],
    ["summarize.batch.submit", true],
    ["llm.batch.results.unexpected", true],
    ["issues.create", true],
    ["collect", false],
    ["Collect.Source", false],
    ["collect source", false],
    [".collect", false],
  ])("%s → %s", (name, ok) => {
    expect(isValidEventName(name)).toBe(ok);
  });
});

describe("GitHub Actions 주석·그룹", () => {
  it("메시지는 %·CR·LF, 속성은 추가로 :·,를 이스케이프하고 file→title 순으로 쓴다", () => {
    expect(
      formatAnnotation("error", "100% 실패,\r\n다음 줄", {
        title: "검증: a,b",
        file: "configs/a,b.json",
      }),
    ).toBe(
      "::error file=configs/a%2Cb.json,title=검증%3A a%2Cb::100%25 실패,%0D%0A다음 줄",
    );
    expect(formatAnnotation("warning", "단순")).toBe("::warning::단순");
    expect(formatAnnotation("notice", "x", { file: "a.ts", line: 3 })).toBe(
      "::notice file=a.ts,line=3::x",
    );
  });

  it("annotate는 CI에서 워크플로 명령을, 로컬에서 읽기 쉬운 줄을 쓰고 비밀값을 가린다", () => {
    const out: string[] = [];
    annotate(
      "warning",
      `소스 실패 ${FAKE.ghs}`,
      { title: "수집" },
      { ci: true, write: (l) => out.push(l) },
    );
    annotate(
      "error",
      "검증 실패",
      { title: "검증", file: "data/a.json", line: 2 },
      { ci: false, write: (l) => out.push(l) },
    );
    expect(out).toEqual([
      "::warning title=수집::소스 실패 ghs_****",
      "[error] 검증: 검증 실패 (data/a.json:2)",
    ]);
  });

  it("group은 ::group::/::endgroup::로 감싸고 fn이 던져도 닫는다", async () => {
    const out: string[] = [];
    const opts = { ci: true, write: (l: string) => out.push(l) };
    await expect(group("수집", () => 42, opts)).resolves.toBe(42);
    await expect(
      group(
        "요약",
        async () => {
          throw new Error("boom");
        },
        opts,
      ),
    ).rejects.toThrow("boom");
    expect(out).toEqual([
      "::group::수집",
      "::endgroup::",
      "::group::요약",
      "::endgroup::",
    ]);
    const local: string[] = [];
    await group("수집", () => undefined, {
      ci: false,
      write: (l) => local.push(l),
    });
    expect(local).toEqual(["── 수집"]);
  });
});

describe("llm.ts 기본 로거 → 공용 로거", () => {
  it("이벤트는 llm.<stage>, 재시도·오류·마감은 warn, 필드는 그대로", () => {
    const { logger, records } = capture({ scope: "llm" });
    const log = createLlmLogger(logger);
    const events: LlmLogEvent[] = [
      { stage: "batch.submit", batchId: "b1", requests: 3, elapsedMs: 10 },
      {
        stage: "single.retry",
        retry: 1,
        errorType: "rate_limit_error",
        status: 429,
      },
      {
        stage: "batch.poll.error",
        batchId: "b1",
        errorType: "api_error",
        status: null,
      },
      { stage: "batch.deadline", batchId: "b1", processing: 2 },
    ];
    events.forEach(log);
    expect(records.map((r) => [r.event, r.level])).toEqual([
      ["llm.batch.submit", "info"],
      ["llm.single.retry", "warn"],
      ["llm.batch.poll.error", "warn"],
      ["llm.batch.deadline", "warn"],
    ]);
    expect(records[0]).toMatchObject({
      scope: "llm",
      batchId: "b1",
      requests: 3,
    });
    expect(records.every((r) => isValidEventName(r.event))).toBe(true);
    expect(records.every((r) => !("stage" in r))).toBe(true);
  });

  it("formatRecord json은 레코드를 그대로 직렬화한다", () => {
    const record: LogRecord = {
      ts: NOW.toISOString(),
      level: "info",
      scope: "s",
      event: "a.b",
      n: 1,
    };
    expect(JSON.parse(formatRecord(record, "json"))).toEqual(record);
  });
});
