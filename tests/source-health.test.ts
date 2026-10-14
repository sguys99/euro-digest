/**
 * M1-11 — 소스 건강도 기록 + 이슈 (PRD FR-11·FR-151·FR-152·§10, §15 D35).
 *
 * 순수 함수(scripts/lib/source-health.ts): 상태 분류 · 연속 횟수 경계(실패·빈 피드 2 vs 3, 새 기사 없음 6 vs 7) ·
 * budget이 끼어 있는 연속 · usable 없는 옛 기록 · 실패 후 성공으로 끊김 · 최근 7일(KST 날짜 7개) 성공률·수집 건수 ·
 * 사건 → source-broken payload(원인 키 source:<id>, 증상, 처음 발생 날짜).
 * 통합(runCollect): runs.json 이력 + 이번 실행 → 소스별 한 줄 로그, 사건 파일(Actions) / 로그만(로컬) / dry는 파일 없음.
 *
 * 네트워크·실호출 없음 — 피드는 fixtures/rss/(BBC Football·ESPN), 경기는 빈 응답(브리핑 호출 생략), 파일은 임시 폴더.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RunsDevFileSchema,
  SourcesFileSchema,
  type RunLog,
  type RunSource,
} from "@/lib/schema";

import {
  runCollect,
  runSourceEntries,
  type CollectDeps,
} from "../scripts/lib/collect-run";
import {
  SourceBrokenPayloadSchema,
  buildIssue,
  issueFingerprint,
} from "../scripts/lib/github-issues";
import type { FeedParseDiagnostics } from "../scripts/lib/feed-diagnostics";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { FOOTBALL_DATA_BASE_URL } from "../scripts/lib/providers/football-data";
import { feedUserAgent, type FetchLike } from "../scripts/lib/rss";
import {
  FAIL_STREAK_THRESHOLD,
  HEALTH_RECENT_MAX,
  STALE_STREAK_THRESHOLD,
  assessSourceHealth,
  classifySourceRun,
  failStreak,
  healthIssuePayloads,
  healthRuns,
  isWholeRunFailure,
  sourceStats,
  staleStreak,
  symptomOf,
  type SourceRunRecord,
  type SourceRunState,
} from "../scripts/lib/source-health";

// ─── 도우미 ──────────────────────────────────────────────────────────────

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (t: number) => new Date(t).toISOString();
const at = (s: string) => Date.parse(s);

/** 이번 실행 — 06:30 KST 2026-10-11 */
const NOW = "2026-10-10T21:30:00.000Z";
const NOW_MS = at(NOW);
/** n일 전 같은 시각(06:30 KST) */
const daysAgo = (n: number) => iso(NOW_MS - n * DAY);

const SRC = "relevo";

function runLog(
  startedAt: string,
  sources: RunSource[],
  over: Partial<RunLog> = {},
): RunLog {
  const compact = startedAt.replace(/[-:]|\.\d+/g, "");
  return {
    runId: `collect-prod-${compact}-0000`,
    env: "prod",
    job: "collect",
    startedAt,
    finishedAt: iso(at(startedAt) + 60_000),
    collected: 0,
    clusters: 0,
    summarized: 0,
    downgraded: 0,
    tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0,
    apiCalls: { footballData: 0, apiFootball: 0 },
    sources,
    status: "partial",
    ...over,
  };
}

/** 소스 기록 한 줄 — 상태 이름으로 */
function entry(state: SourceRunState, id = SRC): RunSource {
  switch (state) {
    case "fresh":
      return { id, ok: true, items: 20, usable: 4 };
    case "no-new":
      return { id, ok: true, items: 20, usable: 0 };
    case "empty":
      return { id, ok: true, items: 0, usable: 0 };
    case "failed":
      return { id, ok: false, items: 0, error: "http-5xx" };
    case "budget":
      return { id, ok: false, items: 0, error: "budget" };
    case "legacy-ok":
      return { id, ok: true, items: 20 };
  }
}

/** 오래된 → 최근 상태 목록으로 이력(하루 1회, 마지막이 어제)을 만든다 */
function history(states: SourceRunState[], id = SRC): RunLog[] {
  return states.map((state, i) =>
    runLog(daysAgo(states.length - i), [entry(state, id)]),
  );
}

/** 상태 목록 → 기록(연속 함수 입력) */
function records(states: SourceRunState[]): SourceRunRecord[] {
  return states.map((state, i) => ({
    runId: `r${i}`,
    startedAt: daysAgo(states.length - 1 - i),
    ...entry(state),
    state,
  }));
}

/**
 * 소스 1개의 판정 — 이번 실행에 정상 소스를 하나 더 둔다(일부 실패 실행). 모든 소스가 실패한 실행의 규칙은
 * "전체 실패" 테스트가 따로 본다.
 */
function assessOne(past: SourceRunState[], current: SourceRunState) {
  const [health] = assessSourceHealth({
    run: { runId: "collect-prod-now", startedAt: NOW },
    current: [entry(current), entry("fresh", "companion")],
    history: history(past),
  });
  return health!;
}

// ─── 상태 분류 ───────────────────────────────────────────────────────────

describe("classifySourceRun — runs.json sources[] 한 줄 → 상태", () => {
  it.each([
    [{ ok: true, items: 20, usable: 3 }, "fresh"],
    [{ ok: true, items: 20, usable: 0 }, "no-new"],
    [{ ok: true, items: 0, usable: 0 }, "empty"],
    [{ ok: true, items: 0 }, "empty"],
    [{ ok: true, items: 20 }, "legacy-ok"],
    [{ ok: false, items: 0, error: "timeout" }, "failed"],
    [{ ok: false, items: 0 }, "failed"], // error 없는 옛 실패 기록도 실패로 본다
    [{ ok: false, items: 0, error: "budget" }, "budget"],
  ] as const)("%j → %s", (input, state) => {
    expect(classifySourceRun(input)).toBe(state);
  });
});

// ─── 연속 횟수 ───────────────────────────────────────────────────────────

describe("failStreak — 요청 실패·빈 피드 연속 (FR-11, D35)", () => {
  it("실패·빈 피드를 함께 센다", () => {
    expect(failStreak(records(["fresh", "failed", "empty"]))).toEqual({
      count: 2,
      since: daysAgo(1),
    });
  });

  it("budget은 끊지도 늘리지도 않는다 — 건너뛰고 앞 기록과 이어서 본다", () => {
    expect(
      failStreak(records(["fresh", "failed", "budget", "failed", "budget"]))
        .count,
    ).toBe(2);
    expect(
      failStreak(records(["failed", "budget", "budget", "failed", "empty"])),
    ).toEqual({ count: 3, since: daysAgo(4) });
  });

  it("실패 뒤 성공(새 기사 있음·없음·옛 성공 기록)이면 끊긴다", () => {
    expect(failStreak(records(["failed", "failed", "fresh"])).count).toBe(0);
    expect(
      failStreak(records(["failed", "failed", "no-new", "failed"])).count,
    ).toBe(1);
    expect(
      failStreak(records(["failed", "legacy-ok", "failed", "failed"])).count,
    ).toBe(2);
  });

  it("기록이 없으면 0", () => {
    expect(failStreak([])).toEqual({ count: 0, since: null });
  });
});

describe("staleStreak — 새 기사 없음 연속 (D35)", () => {
  it("fresh에서 끊는다", () => {
    expect(
      staleStreak(records(["no-new", "fresh", "no-new", "no-new"])),
    ).toEqual({ count: 2, since: daysAgo(1) });
  });

  it("budget·실패·빈 피드·usable 없는 옛 기록은 건너뛴다", () => {
    expect(
      staleStreak(
        records([
          "fresh",
          "no-new",
          "legacy-ok",
          "no-new",
          "budget",
          "failed",
          "no-new",
          "empty",
          "no-new",
        ]),
      ).count,
    ).toBe(4);
  });
});

// ─── 판정 경계 ───────────────────────────────────────────────────────────

describe("assessSourceHealth — 이슈로 낼 사건 경계", () => {
  it("기준값: 실패·빈 피드 3회, 새 기사 없음 7회", () => {
    expect(FAIL_STREAK_THRESHOLD).toBe(3);
    expect(STALE_STREAK_THRESHOLD).toBe(7);
  });

  it("이번 실행 실패는 연속 1·2회여도 사건(failed) — PRD §10 '수집 일부 실패 → 이슈'", () => {
    expect(assessOne(["fresh"], "failed").event).toEqual({
      type: "failed",
      streak: 1,
      since: NOW,
    });
    expect(assessOne(["fresh", "failed"], "failed").event).toEqual({
      type: "failed",
      streak: 2,
      since: daysAgo(1),
    });
  });

  it("실패·빈 피드 2회 연속 → 실패 사건만, 3회 연속 → failing-streak", () => {
    expect(assessOne(["fresh", "empty"], "failed").event?.type).toBe("failed");
    expect(assessOne(["failed", "empty"], "failed").event).toEqual({
      type: "failing-streak",
      streak: 3,
      since: daysAgo(2),
    });
  });

  it("빈 피드만으로는 실패 사건이 아니다 — 2회는 없음, 3회면 failing-streak", () => {
    expect(assessOne(["fresh", "empty"], "empty").event).toBeNull();
    expect(assessOne(["empty", "empty"], "empty").event).toMatchObject({
      type: "failing-streak",
      streak: 3,
    });
  });

  it("budget이 끼어 있어도 연속으로 센다 — 실패, budget, 실패 + 이번 실패 = 3회", () => {
    const h = assessOne(["fresh", "failed", "budget", "failed"], "failed");
    expect(h.failStreak.count).toBe(3);
    expect(h.event).toMatchObject({
      type: "failing-streak",
      streak: 3,
      since: daysAgo(3),
    });
  });

  it("이번 실행이 budget이면 연속이 기준 이상이어도 사건 없음(세지 않는다)", () => {
    const h = assessOne(["failed", "failed", "failed"], "budget");
    expect(h.current.state).toBe("budget");
    expect(h.failStreak.count).toBe(3);
    expect(h.event).toBeNull();
  });

  it("실패 후 성공하면 연속이 끊겨 다시 1부터", () => {
    expect(
      assessOne(["failed", "failed", "fresh"], "failed").event,
    ).toMatchObject({ type: "failed", streak: 1 });
  });

  it("새 기사 없음 6회 → 사건 없음, 7회 → stale-streak", () => {
    expect(assessOne(Array(5).fill("no-new"), "no-new").event).toBeNull();
    expect(assessOne(Array(6).fill("no-new"), "no-new").event).toEqual({
      type: "stale-streak",
      streak: 7,
      since: daysAgo(6),
    });
  });

  it("새 기사 없음 연속: budget·실패가 끼어 있으면 건너뛰고, usable 없는 옛 기록도 건너뛴다", () => {
    const h = assessOne(
      [
        "fresh",
        "no-new",
        "no-new",
        "budget",
        "no-new",
        "failed",
        "legacy-ok",
        "no-new",
        "no-new",
        "no-new",
      ],
      "no-new",
    );
    expect(h.staleStreak.count).toBe(7);
    expect(h.event?.type).toBe("stale-streak");
    // usable이 없는 옛 기록뿐이면(지금 data/runs.json) 새 기사 없음은 이번 1회
    expect(
      assessOne(["legacy-ok", "legacy-ok"], "no-new").staleStreak.count,
    ).toBe(1);
  });

  it("새 기사가 있으면(fresh) 사건 없음 — 옛 실패 연속도 끊긴다", () => {
    const h = assessOne(["failed", "failed", "failed"], "fresh");
    expect(h.failStreak.count).toBe(0);
    expect(h.event).toBeNull();
  });

  it("이력은 prod·collect만 — dev·weekly 기록, 이번 실행보다 늦은 기록, 이번 runId는 보지 않는다", () => {
    const failed = [entry("failed")];
    const runs = [
      runLog(daysAgo(3), failed, { env: "dev", runId: "dev-1" }),
      runLog(daysAgo(2), failed, { job: "weekly", runId: "weekly-1" }),
      runLog(daysAgo(1), failed),
      runLog(iso(NOW_MS + HOUR), failed, { runId: "future" }),
      runLog(NOW, failed, { runId: "collect-prod-now" }),
    ];
    expect(
      healthRuns(runs, { runId: "collect-prod-now", startedAt: NOW }).map(
        (r) => r.runId,
      ),
    ).toEqual([runs[2]!.runId]);
    const [h] = assessSourceHealth({
      run: { runId: "collect-prod-now", startedAt: NOW },
      current: failed,
      history: runs,
    });
    expect(h!.failStreak.count).toBe(2);
  });

  it("이번 실행에서 수집 대상이 아니었던 소스는 판정하지 않는다 — 이력에만 있는 소스는 결과에 없다", () => {
    const result = assessSourceHealth({
      run: { runId: "collect-prod-now", startedAt: NOW },
      current: [entry("fresh", "bbc-sport-football")],
      history: [
        runLog(daysAgo(1), [
          entry("failed", "bbc-sport-football"),
          entry("failed", "old-feed"),
        ]),
      ],
    });
    expect(result.map((h) => h.id)).toEqual(["bbc-sport-football"]);
  });

  it("이력에서 그 소스가 빠진 실행(그때 비활성)은 건너뛰고 앞뒤를 잇는다", () => {
    const runs = [
      runLog(daysAgo(3), [entry("failed")]),
      runLog(daysAgo(2), [entry("fresh", "other")]),
      runLog(daysAgo(1), [entry("failed")]),
    ];
    const [h] = assessSourceHealth({
      run: { runId: "now", startedAt: NOW },
      current: [entry("failed")],
      history: runs,
    });
    expect(h!.event).toMatchObject({ type: "failing-streak", streak: 3 });
  });

  it("전체 실패(성공 소스 0개 — budget은 성공이 아님)면 이번 실행 실패 사건만 뺀다, 연속 사건은 유지", () => {
    expect(isWholeRunFailure([])).toBe(false);
    expect(isWholeRunFailure([entry("failed"), entry("budget", "b")])).toBe(
      true,
    );
    expect(isWholeRunFailure([entry("failed"), entry("empty", "b")])).toBe(
      false,
    );
    const result = assessSourceHealth({
      run: { runId: "now", startedAt: NOW },
      current: [
        entry("failed", "a"),
        entry("failed", "b"),
        entry("budget", "c"),
      ],
      history: [
        ...history(["failed", "failed"], "a"),
        ...history(["fresh"], "b"),
      ],
    });
    expect(
      result.map((h) => [
        h.id,
        h.event?.type ?? null,
        h.suppressedEvent?.type ?? null,
      ]),
    ).toEqual([
      ["a", "failing-streak", null],
      ["b", null, "failed"],
      ["c", null, null],
    ]);
  });

  it("일부만 실패하면(성공 소스가 있으면) 실패 사건을 그대로 낸다", () => {
    const result = assessSourceHealth({
      run: { runId: "now", startedAt: NOW },
      current: [entry("failed", "a"), entry("no-new", "b")],
      history: [],
    });
    expect(result[0]).toMatchObject({
      event: { type: "failed" },
      suppressedEvent: null,
    });
  });

  it("최근 기록은 이번 실행 포함 최대 10건(오래된 → 최근)", () => {
    const h = assessOne(Array(15).fill("fresh"), "failed");
    expect(h.recent).toHaveLength(HEALTH_RECENT_MAX);
    expect(h.recent.at(-1)).toMatchObject({ startedAt: NOW, state: "failed" });
  });
});

// ─── 최근 7일 ────────────────────────────────────────────────────────────

describe("sourceStats — 최근 7일(KST 날짜 7개) 성공률·수집 건수", () => {
  it("기간 = 이번 실행 KST 날짜와 앞 6일, 경계(KST 00:00) 포함·직전 제외", () => {
    // 이번 실행 2026-10-11 06:30 KST → 기간 2026-10-05 ~ 2026-10-11, 시작 = 2026-10-04T15:00:00Z
    const start = "2026-10-04T15:00:00.000Z";
    const rs: SourceRunRecord[] = [
      {
        runId: "a",
        startedAt: iso(at(start) - 1),
        ...entry("fresh"),
        state: "fresh",
      },
      { runId: "b", startedAt: start, ...entry("failed"), state: "failed" },
      { runId: "c", startedAt: NOW, ...entry("fresh"), state: "fresh" },
    ];
    const stats = sourceStats(rs, NOW);
    expect(stats).toMatchObject({
      fromDate: "2026-10-05",
      toDate: "2026-10-11",
      runs: 2,
      attempts: 2,
      ok: 1,
      successRate: 0.5,
    });
  });

  it("성공률은 budget을 빼고 계산, 수집 건수 = 원문 items 합 · usable 합(기록된 실행만)", () => {
    const stats = sourceStats(
      records([
        "fresh",
        "no-new",
        "budget",
        "failed",
        "legacy-ok",
        "empty",
        "fresh",
      ]),
      NOW,
    );
    expect(stats).toEqual({
      fromDate: "2026-10-05",
      toDate: "2026-10-11",
      runs: 7,
      attempts: 6,
      ok: 5,
      budget: 1,
      successRate: 0.833,
      items: 20 + 20 + 0 + 0 + 20 + 0 + 20,
      usable: 4 + 0 + 0 + 4,
      usableRuns: 4,
    });
  });

  it("시도가 없으면 성공률 null", () => {
    expect(sourceStats(records(["budget"]), NOW).successRate).toBeNull();
    expect(sourceStats([], NOW)).toMatchObject({ runs: 0, successRate: null });
  });
});

// ─── 사건 → 이슈 payload ─────────────────────────────────────────────────

describe("healthIssuePayloads — 사건 → source-broken payload (소스별 이슈 하나, D35 ③)", () => {
  const names = new Map([[SRC, "Relevo"]]);
  const runUrl = "https://github.com/sguys99/euro-digest/actions/runs/42";

  it("사건이 없는 소스는 payload가 없다", () => {
    const health = assessSourceHealth({
      run: { runId: "now", startedAt: NOW },
      current: [entry("fresh"), entry("budget", "b"), entry("no-new", "c")],
      history: [],
    });
    expect(healthIssuePayloads(health, { sourceNames: names })).toEqual([]);
  });

  it("실패·빈 피드 3회 연속: 원인 키 source:<id>, 증상·처음 발생 날짜·연속 횟수·오류 종류·HTTP 상태·7일 집계·실행 링크", () => {
    const health = assessSourceHealth({
      run: { runId: "collect-prod-now", startedAt: NOW },
      current: [{ ...entry("failed"), httpStatus: 503 }],
      history: history(["fresh", "empty", "budget", "failed"]),
    });
    const [payload] = healthIssuePayloads(health, {
      sourceNames: names,
      runUrl,
    });
    expect(payload).toEqual({
      sourceId: SRC,
      sourceName: "Relevo",
      // 연속 구간(빈 피드 → budget → 실패 → 이번 실패)의 증상, 이슈 폼 선택지 순서
      symptoms: ["0건 수집", "피드 URL 오류(4xx·5xx)"],
      firstSeen: "2026-10-08",
      runUrl,
      runId: "collect-prod-now",
      occurredAt: NOW,
      event: "failing-streak",
      streak: 3,
      errorType: "http-5xx",
      httpStatus: 503,
      stats7d: {
        from: "2026-10-05",
        to: "2026-10-11",
        attempts: 4,
        ok: 2,
        budget: 1,
        items: 20,
        usable: 4,
        usableRuns: 2,
      },
      recent: [
        { startedAt: daysAgo(4), state: "fresh", items: 20, usable: 4 },
        { startedAt: daysAgo(3), state: "empty", items: 0, usable: 0 },
        { startedAt: daysAgo(2), state: "budget", items: 0, error: "budget" },
        { startedAt: daysAgo(1), state: "failed", items: 0, error: "http-5xx" },
        { startedAt: NOW, state: "failed", items: 0, error: "http-5xx" },
      ],
    });
    // 이슈 헬퍼 스키마를 그대로 통과하고, 원인 키는 소스별 하나
    expect(SourceBrokenPayloadSchema.safeParse(payload).success).toBe(true);
    const issue = buildIssue("source-broken", payload!);
    expect(issue.key).toBe("source:relevo");
    expect(issue.fingerprint).toBe(
      issueFingerprint("source-broken", "source:relevo"),
    );
    expect(issue.title).toBe("[소스 고장] relevo — 실패·빈 피드 3회 연속");
  });

  it("같은 소스의 다른 사건(실패·새 기사 없음)도 같은 원인 키", () => {
    const failed = healthIssuePayloads([assessOne(["fresh"], "failed")], {
      sourceNames: names,
    });
    const stale = healthIssuePayloads(
      [assessOne(Array(6).fill("no-new"), "no-new")],
      { sourceNames: names },
    );
    expect(failed[0]).toMatchObject({ event: "failed", streak: 1 });
    expect(stale[0]).toMatchObject({
      event: "stale-streak",
      streak: 7,
      symptoms: ["0건 수집"],
      firstSeen: "2026-10-05",
    });
    expect(buildIssue("source-broken", failed[0]!).key).toBe(
      buildIssue("source-broken", stale[0]!).key,
    );
  });

  it.each([
    ["http-4xx", "피드 URL 오류(4xx·5xx)"],
    ["http-5xx", "피드 URL 오류(4xx·5xx)"],
    ["parse", "파싱 실패"],
    ["timeout", "기타"],
    ["redirect", "기타"],
    [undefined, "기타"],
  ] as const)("실패 종류 %s → 증상 %s", (error, symptom) => {
    expect(symptomOf({ state: "failed", ...(error ? { error } : {}) })).toBe(
      symptom,
    );
  });

  it("로컬 실행(실행 URL 없음)이면 runUrl 없이 runs.json 실행 ID만", () => {
    const [payload] = healthIssuePayloads([assessOne([], "failed")], {
      sourceNames: new Map(),
    });
    expect(payload).not.toHaveProperty("runUrl");
    expect(payload).not.toHaveProperty("sourceName");
    expect(payload!.runId).toBe("collect-prod-now");
  });

  it("형식이 이상한 오류 종류(옛 기록·수동 편집)는 payload에 넣지 않는다 — 응답 본문이 이슈로 새지 않게", () => {
    const [h] = assessSourceHealth({
      run: { runId: "now", startedAt: NOW },
      current: [
        { id: SRC, ok: false, items: 0, error: "HTTP 503 <html>" },
        entry("fresh", "companion"),
      ],
      history: [],
    });
    const [payload] = healthIssuePayloads([h!], { sourceNames: names });
    expect(payload).not.toHaveProperty("errorType");
    expect(JSON.stringify(payload)).not.toContain("<html>");
    expect(SourceBrokenPayloadSchema.safeParse(payload).success).toBe(true);
  });

  // ── 파싱 실패 진단 (M1-03 보강) ──
  const diag: FeedParseDiagnostics = {
    status: 200,
    mediaType: "text/html",
    bytes: 171,
    shape: "html",
    sameHost: true,
    redirects: 0,
    parser: "unexpected-close-tag",
    line: 2,
    column: 81,
  };
  const parseFailed = (d: unknown, error = "parse") =>
    assessSourceHealth({
      run: { runId: "now", startedAt: NOW },
      current: [
        {
          id: SRC,
          ok: false,
          items: 0,
          error,
          parseDiagnostics: d as FeedParseDiagnostics,
        },
        entry("fresh", "companion"),
      ],
      history: [],
    });

  it("이번 실행이 parse 실패면 응답 진단(enum·숫자만)을 payload parseDiagnostics로 싣는다", () => {
    const [payload] = healthIssuePayloads(parseFailed(diag), {
      sourceNames: names,
    });
    expect(payload).toMatchObject({
      event: "failed",
      errorType: "parse",
      symptoms: ["파싱 실패"],
      parseDiagnostics: diag,
    });
    expect(payload).not.toHaveProperty("httpStatus");
    expect(SourceBrokenPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("진단이 스키마(enum·숫자)에 맞지 않으면 그 필드만 뺀다 — 이슈는 그대로, 덧붙은 키·자유 문자열은 새지 않는다", () => {
    for (const bad of [
      { ...diag, mediaType: "text/html; <b>MARKER</b>" },
      { ...diag, shape: "MARKER" },
      { ...diag, bytes: -1 },
      { ...diag, line: 1.5 },
    ]) {
      const [payload] = healthIssuePayloads(parseFailed(bad), {
        sourceNames: names,
      });
      expect(payload).toMatchObject({ event: "failed", errorType: "parse" });
      expect(payload).not.toHaveProperty("parseDiagnostics");
      expect(JSON.stringify(payload)).not.toContain("MARKER");
    }
    // 진단에 덧붙은 키(본문 조각 등)는 골라 담지 않는다
    const [extra] = healthIssuePayloads(
      parseFailed({ ...diag, snippet: "<title>MARKER</title>" }),
      { sourceNames: names },
    );
    expect(extra!.parseDiagnostics).toEqual(diag);
    expect(JSON.stringify(extra)).not.toContain("MARKER");
  });

  it("parse 실패가 아니면 진단이 있어도 싣지 않는다", () => {
    const [payload] = healthIssuePayloads(parseFailed(diag, "timeout"), {
      sourceNames: names,
    });
    expect(payload).toMatchObject({ errorType: "timeout" });
    expect(payload).not.toHaveProperty("parseDiagnostics");
  });
});

describe("runSourceEntries — 실행 기록의 소스별 결과 (D35)", () => {
  it("성공은 usable(창 안 건수, 없으면 0), 실패는 error(종류) — 다른 필드는 남기지 않는다", () => {
    const entries = runSourceEntries(
      [
        {
          id: "a",
          ok: true,
          items: 10,
          usable: 9,
          skipped: {},
          retries: 0,
          elapsedMs: 5,
        },
        {
          id: "b",
          ok: true,
          items: 4,
          usable: 4,
          skipped: {},
          retries: 0,
          elapsedMs: 5,
        },
        {
          id: "c",
          ok: false,
          items: 0,
          usable: 0,
          skipped: {},
          retries: 1,
          elapsedMs: 5,
          errorType: "timeout",
          status: null,
          error: "요청 시간 초과 (15000ms)",
        },
      ],
      {
        bySource: {
          a: {
            inWindow: 3,
            outOfWindow: 6,
            futureClamped: 0,
            future: 0,
            maxAheadMs: null,
          },
        },
      },
    );
    expect(entries).toEqual([
      { id: "a", ok: true, items: 10, usable: 3 },
      { id: "b", ok: true, items: 4, usable: 0 },
      { id: "c", ok: false, items: 0, error: "timeout" },
    ]);
  });
});

// ─── 통합: runCollect ────────────────────────────────────────────────────

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const SOURCES = SourcesFileSchema.parse(
  JSON.parse(read("configs/sources.json")),
);
const BBC = "bbc-sport-football";
const ESPN = "espn-soccer";
const BBC_SOURCE = SOURCES.find((s) => s.id === BBC)!;
const ESPN_SOURCE = SOURCES.find((s) => s.id === ESPN)!;
const FEED_XML: Record<string, string> = {
  [BBC_SOURCE.url]: read(`fixtures/rss/${BBC}.xml`),
  [ESPN_SOURCE.url]: read(`fixtures/rss/${ESPN}.xml`),
};

/** 피드 fixture + 소스별 덮어쓰기(응답 객체), football-data는 경기 없음(브리핑 생략) */
function fakeFetch(overrides: Record<string, () => Response> = {}): FetchLike {
  return async (url) => {
    if (url.startsWith(FOOTBALL_DATA_BASE_URL)) {
      return new Response('{"matches":[]}', { status: 200 });
    }
    const override = overrides[url];
    if (override) return override();
    const xml = FEED_XML[url];
    if (xml === undefined) {
      throw new Error(`테스트에서 예상하지 못한 URL: ${url}`);
    }
    return new Response(xml, { status: 200 });
  };
}

const espn503 = {
  [ESPN_SOURCE.url]: () => new Response("unavailable", { status: 503 }),
};

let dataDir: string;
let tmpDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-health-"));
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-health-runner-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeRuns(runs: unknown): void {
  writeFileSync(
    path.join(dataDir, "runs.json"),
    typeof runs === "string" ? runs : `${JSON.stringify(runs, null, 2)}\n`,
    "utf8",
  );
}

function makeDeps(over: Partial<CollectDeps> = {}) {
  const records: LogRecord[] = [];
  const deps: CollectDeps = {
    rootDir: ROOT,
    dataDir,
    env: "dev",
    llmMode: "mock",
    dry: false,
    limit: 100,
    loadSources: async () => [BBC_SOURCE, ESPN_SOURCE],
    now: () => new Date(NOW),
    fetch: fakeFetch(),
    userAgent: feedUserAgent("test@example.com"),
    feedClock: { now: () => 0, sleep: async () => undefined },
    footballDataApiKey: "test-football-data-key",
    footballDataSleep: async () => undefined,
    createLlm: () => {
      throw new Error("경기가 없으면 LLM을 만들지 않는다");
    },
    resolveBriefConfig: () => ({
      model: "claude-haiku-5-5",
      budgets: { dailyBudgetUsd: 0.1, monthlyBudgetUsd: 3 },
    }),
    logger: createLogger({
      scope: "collect",
      format: "json",
      sink: (_line, record) => records.push(record),
    }),
    print: () => undefined,
    ...over,
  };
  return { deps, records };
}

const events = (records: LogRecord[], event: string) =>
  records.filter((r) => r.event === event);

/** ESPN이 어제·그제 실패, BBC는 성공한 prod 이력 */
const ESPN_FAILING = [
  runLog(daysAgo(2), [
    { id: BBC, ok: true, items: 7, usable: 3 },
    { id: ESPN, ok: false, items: 0, error: "http-5xx" },
  ]),
  runLog(daysAgo(1), [
    { id: BBC, ok: true, items: 7, usable: 2 },
    { id: ESPN, ok: false, items: 0, error: "timeout" },
  ]),
];

describe("runCollect — 소스 건강도 연결 (M1-11)", () => {
  it("Actions: 사건 파일(source-broken payload 배열)을 쓰고, 소스마다 한 줄 요약 로그를 남긴다", async () => {
    writeRuns(ESPN_FAILING);
    const file = path.join(tmpDir, "source-health.json");
    const runUrl = "https://github.com/sguys99/euro-digest/actions/runs/77";
    const { deps, records } = makeDeps({
      fetch: fakeFetch(espn503),
      healthReportPath: file,
      runUrl,
    });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("partial");

    // 소스별 한 줄 요약 — 사건이 있는 ESPN만 warn
    const lines = events(records, "collect.source.health");
    expect(
      lines.map((r) => [r.source, r.level, r.state, r.healthEvent]),
    ).toEqual([
      [BBC, "info", "fresh", null],
      [ESPN, "warn", "failed", "failing-streak"],
    ]);
    expect(lines[1]).toMatchObject({
      failStreak: 3,
      error: "http-5xx",
      usable: null,
      ok7d: 0,
      attempts7d: 3,
      successRate7d: 0,
    });
    expect(lines[0]).toMatchObject({
      items: 7,
      usable: outcome.news.windowStats!.bySource[BBC]!.inWindow,
      failStreak: 0,
      ok7d: 3,
      attempts7d: 3,
      successRate7d: 1,
      items7d: 21,
    });

    // 사건 파일 — 이슈 단계가 그대로 읽는다
    const written = JSON.parse(readFileSync(file, "utf8")) as unknown[];
    expect(written).toHaveLength(1);
    const payload = SourceBrokenPayloadSchema.parse(written[0]);
    expect(payload).toMatchObject({
      sourceId: ESPN,
      sourceName: ESPN_SOURCE.name,
      event: "failing-streak",
      streak: 3,
      errorType: "http-5xx",
      httpStatus: 503,
      runUrl,
      runId: outcome.runId,
      firstSeen: "2026-10-09",
      symptoms: ["피드 URL 오류(4xx·5xx)", "기타"],
    });
    expect(outcome.health).toMatchObject({ file, historyError: null });
    expect(events(records, "collect.health.issue")).toEqual([
      expect.objectContaining({
        level: "warn",
        source: ESPN,
        healthEvent: "failing-streak",
        streak: 3,
        key: "source:espn-soccer",
      }),
    ]);
    expect(events(records, "collect.health.done")).toEqual([
      expect.objectContaining({
        sources: 2,
        events: 1,
        byEvent: { "failing-streak": 1 },
        file,
      }),
    ]);
    // 로그·파일에 응답 본문이 없다
    expect(readFileSync(file, "utf8")).not.toContain("unavailable");
  });

  it("로컬(사건 파일 경로 없음): 파일 없이 '이슈로 낼 사건' 로그만 — 이슈 요청 없음", async () => {
    writeRuns(ESPN_FAILING);
    const { deps, records } = makeDeps({ fetch: fakeFetch(espn503) });
    const outcome = await runCollect(deps);
    expect(outcome.health?.file).toBeNull();
    expect(outcome.health?.reports).toHaveLength(1);
    expect(events(records, "collect.health.issue")).toHaveLength(1);
    expect(events(records, "collect.health.done")).toEqual([
      expect.objectContaining({
        events: 1,
        file: null,
        reason: "no-report-path",
      }),
    ]);
  });

  it("dry: 경로가 있어도 사건 파일을 쓰지 않는다", async () => {
    const file = path.join(tmpDir, "source-health.json");
    const { deps, records } = makeDeps({
      fetch: fakeFetch(espn503),
      healthReportPath: file,
      dry: true,
    });
    const outcome = await runCollect(deps);
    expect(existsSync(file)).toBe(false);
    expect(outcome.health?.reports.map((r) => r.event)).toEqual(["failed"]);
    expect(events(records, "collect.health.done")[0]).toMatchObject({
      reason: "dry",
      file: null,
    });
  });

  it("파싱 실패(러너에서 빈 200 응답): 사건 payload에 응답 진단, 로그에 진단 필드 — runs 기록은 error: parse 그대로", async () => {
    const file = path.join(tmpDir, "source-health.json");
    const { deps, records } = makeDeps({
      fetch: fakeFetch({
        [ESPN_SOURCE.url]: () =>
          new Response("", {
            status: 200,
            headers: { "content-type": "text/xml;charset=UTF-8" },
          }),
      }),
      healthReportPath: file,
    });
    const outcome = await runCollect(deps);
    expect(outcome.status).toBe("partial");

    const [fail] = events(records, "collect.source.fail");
    expect(fail).toMatchObject({
      source: ESPN,
      errorType: "parse",
      status: 200,
      mediaType: "text/xml",
      bytes: 0,
      bodyShape: "empty",
      sameHost: true,
      redirects: 0,
      parseError: "no-document",
      line: null,
      column: null,
    });

    const written = JSON.parse(readFileSync(file, "utf8")) as unknown[];
    expect(written).toHaveLength(1);
    const payload = SourceBrokenPayloadSchema.parse(written[0]);
    expect(payload).toMatchObject({
      sourceId: ESPN,
      event: "failed",
      errorType: "parse",
      symptoms: ["파싱 실패"],
      parseDiagnostics: {
        status: 200,
        mediaType: "text/xml",
        bytes: 0,
        shape: "empty",
        sameHost: true,
        redirects: 0,
        parser: "no-document",
        line: null,
        column: null,
      },
    });
    const issue = buildIssue("source-broken", payload);
    expect(issue.body).toContain(
      "| 본문 형태 | `empty` — 빈 본문(공백·BOM만) |",
    );

    // 실행 기록(runs.json 형식)은 바뀌지 않는다 — 진단은 이슈 payload에만
    const runs = RunsDevFileSchema.parse(
      JSON.parse(readFileSync(path.join(dataDir, "runs-dev.json"), "utf8")),
    );
    const last = runs.at(-1)!;
    expect(last.sources.find((s) => s.id === ESPN)).toEqual({
      id: ESPN,
      ok: false,
      items: 0,
      error: "parse",
    });
  });

  it("파싱 실패(HTML 차단 페이지): 사건 파일·로그 어디에도 본문 조각이 없다", async () => {
    const file = path.join(tmpDir, "source-health.json");
    const html =
      "<!DOCTYPE html><html><head><title>Access Denied MARKER</title></head><body>MARKER-REF</body></html>";
    const { deps, records } = makeDeps({
      fetch: fakeFetch({
        [ESPN_SOURCE.url]: () =>
          new Response(html, {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      }),
      healthReportPath: file,
    });
    await runCollect(deps);
    const written = readFileSync(file, "utf8");
    const payload = SourceBrokenPayloadSchema.parse(
      (JSON.parse(written) as unknown[])[0],
    );
    expect(payload.parseDiagnostics).toMatchObject({
      mediaType: "text/html",
      shape: "html",
    });
    for (const text of [
      written,
      JSON.stringify(records),
      buildIssue("source-broken", payload).body,
    ]) {
      expect(text).not.toContain("MARKER");
      expect(text).not.toContain("Access Denied");
    }
  });

  it("사건이 없으면 빈 배열을 쓴다(이슈 단계는 '보고할 사건 없음')", async () => {
    const file = path.join(tmpDir, "nested", "source-health.json");
    const { deps } = makeDeps({ healthReportPath: file });
    const outcome = await runCollect(deps);
    expect(outcome.status).toBe("success");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual([]);
  });

  it("모든 소스 실패(뉴스 실패 exit 1): 소스별 실패 사건은 내지 않고(pipeline-failure 하나가 맡음) 생략 사유를 한 줄 남긴다", async () => {
    const file = path.join(tmpDir, "source-health.json");
    const { deps, records } = makeDeps({
      healthReportPath: file,
      fetch: fakeFetch({
        ...espn503,
        [BBC_SOURCE.url]: () => new Response("<rss><broken", { status: 200 }),
      }),
    });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(1);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual([]);
    expect(
      outcome.health!.sources.map((h) => [
        h.id,
        h.event,
        h.suppressedEvent?.type,
      ]),
    ).toEqual([
      [BBC, null, "failed"],
      [ESPN, null, "failed"],
    ]);
    expect(events(records, "collect.health.suppress")).toEqual([
      expect.objectContaining({
        level: "warn",
        reason: "all-sources-failed",
        healthEvent: "failed",
        sources: 2,
        kept: 0,
      }),
    ]);
    expect(events(records, "collect.health.issue")).toEqual([]);
    expect(
      events(records, "collect.source.health").map((r) => [
        r.level,
        r.suppressedEvent,
      ]),
    ).toEqual([
      ["warn", "failed"],
      ["warn", "failed"],
    ]);
  });

  it("모든 소스 실패여도 연속 사건(failing-streak)은 그대로 낸다", async () => {
    writeRuns(ESPN_FAILING);
    const file = path.join(tmpDir, "source-health.json");
    const { deps, records } = makeDeps({
      healthReportPath: file,
      fetch: fakeFetch({
        ...espn503,
        [BBC_SOURCE.url]: () => new Response("<rss><broken", { status: 200 }),
      }),
    });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(1);
    const written = (JSON.parse(readFileSync(file, "utf8")) as unknown[]).map(
      (p) => SourceBrokenPayloadSchema.parse(p),
    );
    expect(written.map((p) => [p.sourceId, p.event, p.streak])).toEqual([
      [ESPN, "failing-streak", 3],
    ]);
    expect(events(records, "collect.health.suppress")[0]).toMatchObject({
      sources: 1,
      kept: 1,
    });
  });

  it("이번 실행이 시간 예산 초과(budget)인 소스는 사건이 없다", async () => {
    let t = 0;
    const { deps } = makeDeps({
      healthReportPath: path.join(tmpDir, "h.json"),
      // 첫 소스(BBC) 요청 순간 시계가 단계 예산(90초)을 넘긴다 → ESPN은 시작하지 못해 budget
      feedClock: {
        now: () => t,
        sleep: async (ms) => {
          t += ms;
        },
      },
      fetch: async (url, init) => {
        if (url === BBC_SOURCE.url) t += 100_000;
        return fakeFetch()(url, init);
      },
    });
    writeRuns(ESPN_FAILING);
    const outcome = await runCollect(deps);
    const espn = outcome.health!.sources.find((h) => h.id === ESPN)!;
    expect(espn.current).toMatchObject({ state: "budget", error: "budget" });
    expect(espn.failStreak.count).toBe(2);
    expect(espn.event).toBeNull();
    expect(outcome.health!.reports).toEqual([]);
  });

  it("runs.json을 읽지 못하면 이번 실행만으로 판정(경고) — 실패 사건은 그대로 낸다", async () => {
    writeRuns("{ broken");
    const { deps, records } = makeDeps({ fetch: fakeFetch(espn503) });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.health?.historyError).not.toBeNull();
    expect(outcome.health?.reports).toEqual([
      expect.objectContaining({ sourceId: ESPN, event: "failed", streak: 1 }),
    ]);
    expect(
      events(records, "collect.health.history-unavailable")[0],
    ).toMatchObject({ level: "warn", file: "runs.json" });
  });

  it("새 기사 없음 7회 연속 → stale-streak (창 밖 기사만 있는 피드)", async () => {
    // 열흘 뒤 실행: BBC 피드(10-09~10-10 기사)는 응답하지만 직전 성공 이후 새 기사가 없다(창 안 0건)
    const later = "2026-10-20T21:30:00.000Z";
    const laterMs = at(later);
    const past = Array.from({ length: 6 }, (_, i) =>
      runLog(iso(laterMs - (6 - i) * DAY), [
        { id: BBC, ok: true, items: 7, usable: 0 },
      ]),
    );
    writeRuns(past);
    const file = path.join(tmpDir, "source-health.json");
    const { deps } = makeDeps({
      now: () => new Date(later),
      loadSources: async () => [BBC_SOURCE],
      healthReportPath: file,
    });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    const bbc = outcome.health!.sources[0]!;
    expect(bbc.current).toMatchObject({ state: "no-new", items: 7, usable: 0 });
    expect(bbc.event).toMatchObject({ type: "stale-streak", streak: 7 });
    const [payload] = JSON.parse(readFileSync(file, "utf8")) as unknown[];
    expect(SourceBrokenPayloadSchema.parse(payload)).toMatchObject({
      sourceId: BBC,
      event: "stale-streak",
      streak: 7,
      symptoms: ["0건 수집"],
    });
  });
});
