/**
 * M1-10 — 수집 시간 창(PRD FR-07 "실행 실패 다음 날 소식 누락 없음") + 미래 시각 가드.
 *
 * 순수 함수(scripts/lib/collect-window.ts): 창 계산(첫 실행 51시간 · 직전 성공 − 겹침 3시간 · 51시간 상한(D36) · prod 발행
 * 기록만 · 소스별 시작 · runs.json 오류 = 51시간) · 항목 판정 경계(시작 포함 · 현재 + 5분 포함 · 3시간까지 낮춤 · 넘으면 제외).
 * 통합(runCollect): prod runs.json을 읽어 창을 열고, 창 밖·미래 항목을 소스를 합치기 전에 걸러낸다.
 * M1-12 이월: 겹침 구간 기사의 날짜 간 중복은 seen-urls 기억이 막는다(겹침 통합 테스트 단언을 0으로 뒤집음) + 기억 연결
 * (쓰기 시점·dry·뉴스 실패·같은 날 재실행·삭제된 카드·90일 정리·파일 손상·쓰기 실패) — 순수 함수는 tests/seen-urls.test.ts.
 *
 * 네트워크 없음 — 피드는 fixtures/rss/(BBC Football·ESPN), 경기는 빈 응답(브리핑 호출 생략), 시각은 주입한 시계.
 * 소스는 fixture 피드를 켠 목록에서 고른다(tests/support/fixture-sources.ts) — 실제 configs에서 espn-soccer는 2026-10-14부터
 * 비활성이지만, ESPN fixture의 'EST' 고정 표기로 미래 시각 가드를 계속 검사한다.
 * 파일은 임시 폴더(runs.json·runs-dev.json·news/를 테스트가 직접 쓴다).
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  NewsFileSchema,
  SeenUrlsFileSchema,
  type FeedItem,
  type NewsFile,
  type RunLog,
  type SeenUrlsFile,
} from "@/lib/schema";

import { runCollect, type CollectDeps } from "../scripts/lib/collect-run";
import {
  applyCollectWindow,
  clampedItemKey,
  COLLECT_WINDOW_MAX_MS,
  COLLECT_WINDOW_OVERLAP_MS,
  FUTURE_CLAMP_MAX_MS,
  FUTURE_TOLERANCE_MS,
  isPublishedNewsRun,
  judgeItemTime,
  planCollectWindow,
  widerSourceWindows,
  windowLogFields,
  windowStartFor,
  type RunsReadResult,
} from "../scripts/lib/collect-window";
import { createLogger, type LogRecord } from "../scripts/lib/logger";
import { FOOTBALL_DATA_BASE_URL } from "../scripts/lib/providers/football-data";
import { feedUserAgent, type FetchLike } from "../scripts/lib/rss";
import { urlHash } from "../scripts/lib/url-normalize";

import { fixtureFeedSources } from "./support/fixture-sources";

// ─── 시각 ────────────────────────────────────────────────────────────────

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const iso = (t: number) => new Date(t).toISOString();
const at = (s: string) => Date.parse(s);

/** 이번 실행 — 06:30 KST 2026-10-11(서머타임 기간 수집 시각, D26) */
const NOW = "2026-10-10T21:30:00.000Z";
const NOW_MS = at(NOW);
/** 어제 실행 — 06:30 KST 2026-10-10 */
const YESTERDAY = "2026-10-09T21:30:00.000Z";
/** 그제 실행 — 06:30 KST 2026-10-09 */
const DAY_BEFORE = "2026-10-08T21:30:00.000Z";
/** 다음 날 실행 — 06:30 KST 2026-10-12 (seen-urls 날짜 간 중복, M1-12) */
const DAY2 = "2026-10-11T21:30:00.000Z";
/** 51시간 상한 시작(48시간 + 겹침 3시간, D36) = 그제 실행 − 3시간 */
const FLOOR = "2026-10-08T18:30:00.000Z";

// ─── 도우미 ──────────────────────────────────────────────────────────────

const BBC = "bbc-sport-football";
const ESPN = "espn-soccer";

/** runs.json 한 줄 — 기본은 BBC·ESPN 모두 성공한 prod 수집 실행 */
function runLog(over: Partial<RunLog> & Pick<RunLog, "startedAt">): RunLog {
  const compact = over.startedAt.replace(/[-:]|\.\d+/g, "");
  return {
    runId: `collect-${over.env ?? "prod"}-${compact}-0000`,
    env: "prod",
    job: "collect",
    finishedAt: iso(at(over.startedAt) + MINUTE),
    collected: 13,
    clusters: 5,
    summarized: 0,
    downgraded: 0,
    tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0,
    apiCalls: { footballData: 1, apiFootball: 0 },
    sources: [
      { id: BBC, ok: true, items: 7 },
      { id: ESPN, ok: true, items: 6 },
    ],
    status: "success",
    ...over,
  };
}

const ok = (runs: RunLog[]): RunsReadResult => ({ ok: true, runs });

function plan(runs: RunsReadResult, now = NOW, sourceIds = [BBC, ESPN]) {
  return planCollectWindow({ now, runs, sourceIds });
}

function feedItem(source: string, publishedAt: string, n = 0): FeedItem {
  return {
    source,
    title: `title ${source} ${n}`,
    url: `https://example.com/${source}/${n}`,
    publishedAt,
    lang: "en",
    author: null,
    authors: [],
    summary: null,
  };
}

// ─── 창 계산 ─────────────────────────────────────────────────────────────

describe("planCollectWindow — 직전 성공 실행 ~ 현재, 최대 51시간 (FR-07, D36)", () => {
  it("첫 실행(발행 기록 없음) → 현재 − 51시간(상한과 같음), 끝 = 현재 + 5분", () => {
    const window = plan(ok([]));
    expect(window).toMatchObject({
      now: NOW,
      start: FLOOR,
      end: "2026-10-10T21:35:00.000Z",
      floor: FLOOR,
      basis: "first-run",
      lastRun: null,
      ignoredFutureRuns: 0,
      runsError: null,
    });
    expect(window.sources[BBC]).toEqual({
      start: FLOOR,
      basis: "first-run",
      lastOkAt: null,
    });
    expect(NOW_MS - at(window.start)).toBe(COLLECT_WINDOW_MAX_MS);
    expect(COLLECT_WINDOW_MAX_MS).toBe(48 * HOUR + COLLECT_WINDOW_OVERLAP_MS);
  });

  it("어제 성공 → 창 시작 = 어제 실행 시작 − 겹침 3시간", () => {
    const window = plan(ok([runLog({ startedAt: YESTERDAY })]));
    expect(window.start).toBe("2026-10-09T18:30:00.000Z");
    expect(at(YESTERDAY) - at(window.start)).toBe(COLLECT_WINDOW_OVERLAP_MS);
    expect(window.basis).toBe("last-success");
    expect(window.lastRun).toEqual({
      runId: "collect-prod-20261009T213000Z-0000",
      startedAt: YESTERDAY,
      status: "success",
    });
    expect(widerSourceWindows(window)).toEqual([]);
  });

  it("그제 성공·어제 하루 전체 실패(실패 실행은 커밋되지 않아 기록 없음) → 그제 시작 − 3시간부터 받아 누락 없음 (D36)", () => {
    const window = plan(ok([runLog({ startedAt: DAY_BEFORE })]));
    // 그제 − 3시간 = 51시간 전 = 상한과 같다 → 상한에 잘리지 않는다(last-success)
    expect(window).toMatchObject({
      start: "2026-10-08T18:30:00.000Z",
      basis: "last-success",
      lastRun: { startedAt: DAY_BEFORE },
    });
    expect(window.start).toBe(FLOOR);
    // 그제 실행 직후 ~ 어제(실패한 날) 내내 나온 기사가 모두 창 안 — 36시간 상한이었다면 앞 12시간을 잃었다
    const bounds = { start: window.start, now: NOW };
    for (const t of [
      "2026-10-08T21:31:00.000Z", // 그제 실행 1분 뒤
      "2026-10-09T09:29:59.999Z", // 옛 36시간 상한 직전
      "2026-10-09T21:30:00.000Z", // 어제 실패한 실행 시각
    ]) {
      expect(judgeItemTime(t, bounds).kind).toBe("in-window");
    }
    // 그제 실행 3시간 전보다 이른 기사(그제 이미 받은 것)는 창 밖
    expect(judgeItemTime("2026-10-08T18:29:59.999Z", bounds).kind).toBe(
      "out-of-window",
    );
  });

  it("오늘 실행이 그제보다 늦게 시작해도(계절 전환 +40분·schedule 지연) 3시간 안이면 겹침만 줄고 그제 이후 기사는 받는다", () => {
    // 그제 06:30 KST(서머타임) 성공, 어제 실패, 오늘 07:10 KST(표준시) — 48시간 40분 차
    const window = plan(
      ok([runLog({ startedAt: "2026-10-23T21:30:00.000Z" })]),
      "2026-10-25T22:10:00.000Z",
    );
    expect(window).toMatchObject({
      start: "2026-10-23T19:10:00.000Z", // 상한 51시간 — 그제 실행 2시간 20분 전
      basis: "capped",
    });
    expect(at(window.start)).toBeLessThan(at("2026-10-23T21:30:00.000Z"));
  });

  it("사흘 전 성공(이틀 연속 실패) → 51시간 상한(capped)", () => {
    const window = plan(
      ok([runLog({ startedAt: "2026-10-07T21:30:00.000Z" })]),
    );
    expect(window).toMatchObject({ start: FLOOR, basis: "capped" });
    expect(NOW_MS - at(window.start)).toBe(51 * HOUR);
  });

  it("어제 06:30 실패 → 낮에 재실행 성공 → 재실행 시작 − 3시간 (상한 안이면 그대로)", () => {
    // 12:00 KST 재실행 → 오늘 창은 09:00 KST부터 21.5시간
    const rerun = "2026-10-10T03:00:00.000Z";
    const window = plan(
      ok([runLog({ startedAt: DAY_BEFORE }), runLog({ startedAt: rerun })]),
    );
    expect(window).toMatchObject({
      start: "2026-10-10T00:00:00.000Z",
      basis: "last-success",
    });
    // 30시간 전 성공(상한 안) → 33시간 창
    const late = plan(ok([runLog({ startedAt: "2026-10-09T15:30:00.000Z" })]));
    expect(late).toMatchObject({
      start: "2026-10-09T12:30:00.000Z",
      basis: "last-success",
    });
    expect(windowLogFields(late).spanHours).toBe(33);
  });

  it("발행 기록만 본다 — failed·skipped·weekly·dev 실행과 성공 소스가 없는 실행은 건너뛴다", () => {
    const success = runLog({ startedAt: "2026-10-09T15:30:00.000Z" });
    const ignored = [
      runLog({ startedAt: YESTERDAY, status: "failed" }),
      runLog({ startedAt: "2026-10-09T22:00:00.000Z", status: "skipped" }),
      runLog({ startedAt: "2026-10-10T00:00:00.000Z", job: "weekly" }),
      // runs.json 스키마는 dev를 거부하지만, 순수 함수도 prod만 본다(파일 경계와 이중 방어)
      runLog({ startedAt: "2026-10-10T12:00:00.000Z", env: "dev" }),
      runLog({
        startedAt: "2026-10-10T18:00:00.000Z",
        status: "partial",
        sources: [
          { id: BBC, ok: false, items: 0 },
          { id: ESPN, ok: false, items: 0 },
        ],
      }),
    ];
    for (const run of ignored) expect(isPublishedNewsRun(run)).toBe(false);
    expect(isPublishedNewsRun(success)).toBe(true);
    expect(
      isPublishedNewsRun(
        runLog({
          startedAt: YESTERDAY,
          status: "partial",
          sources: [
            { id: BBC, ok: true, items: 7 },
            { id: ESPN, ok: false, items: 0 },
          ],
        }),
      ),
    ).toBe(true);

    const window = plan(ok([...ignored, success]));
    expect(window).toMatchObject({
      start: "2026-10-09T12:30:00.000Z",
      basis: "last-success",
      lastRun: { startedAt: success.startedAt },
    });
  });

  it("기록 순서와 무관하게 가장 늦은 발행 실행을 쓴다", () => {
    const window = plan(
      ok([runLog({ startedAt: YESTERDAY }), runLog({ startedAt: DAY_BEFORE })]),
    );
    expect(window.lastRun?.startedAt).toBe(YESTERDAY);
    expect(window.start).toBe("2026-10-09T18:30:00.000Z");
  });

  it("현재보다 미래에 시작한 발행 기록(시계 오류)은 무시하고 센다", () => {
    const window = plan(
      ok([
        runLog({ startedAt: YESTERDAY }),
        runLog({ startedAt: "2026-10-10T22:30:00.000Z" }),
      ]),
    );
    expect(window).toMatchObject({
      start: "2026-10-09T18:30:00.000Z",
      basis: "last-success",
      ignoredFutureRuns: 1,
    });
    // 현재와 같은 시각은 미래가 아니다
    expect(plan(ok([runLog({ startedAt: NOW })])).start).toBe(
      "2026-10-10T18:30:00.000Z",
    );
  });

  it("runs.json을 읽지 못하면 51시간(runs-unreadable) — 넓은 창은 중복만 늘리고 누락은 없다", () => {
    const window = plan({ ok: false, error: "runs.json: JSON 파싱 실패" });
    expect(window).toMatchObject({
      start: FLOOR,
      basis: "runs-unreadable",
      lastRun: null,
      runsError: "runs.json: JSON 파싱 실패",
    });
    expect(Object.values(window.sources).map((s) => s.basis)).toEqual([
      "runs-unreadable",
      "runs-unreadable",
    ]);
  });

  it("소스별 시작 — 직전 실행에서 실패한 소스는 그 소스가 성공한 마지막 실행부터, 새 소스는 51시간", () => {
    const thirtyHoursAgo = "2026-10-09T15:30:00.000Z";
    const window = plan(
      ok([
        runLog({ startedAt: thirtyHoursAgo }),
        runLog({
          startedAt: YESTERDAY,
          status: "partial",
          sources: [
            { id: BBC, ok: true, items: 7 },
            { id: ESPN, ok: false, items: 0 },
          ],
        }),
      ]),
      NOW,
      [BBC, ESPN, "new-source"],
    );
    expect(window.start).toBe("2026-10-09T18:30:00.000Z");
    expect(window.sources[BBC]).toEqual({
      start: "2026-10-09T18:30:00.000Z",
      basis: "last-success",
      lastOkAt: YESTERDAY,
    });
    expect(window.sources[ESPN]).toEqual({
      start: "2026-10-09T12:30:00.000Z",
      basis: "last-success",
      lastOkAt: thirtyHoursAgo,
    });
    expect(window.sources["new-source"]).toEqual({
      start: FLOOR,
      basis: "first-run",
      lastOkAt: null,
    });
    expect(widerSourceWindows(window).map((w) => w.source)).toEqual([
      ESPN,
      "new-source",
    ]);
    // 계산에 없던 소스는 상한 시작
    expect(windowStartFor(window, "unknown")).toBe(FLOOR);
  });

  it("서머타임 종료(2026-10-25)·시작(2027-03-28) 전후 — 수집 시각이 06:30 ↔ 07:10 KST로 바뀌어도 직전 실행 기준이라 빈틈이 없다", () => {
    // 06:30 KST 10-25(서머타임 마지막 수집 — 전환은 10-25 10:00 KST) → 07:10 KST 10-26(표준시 첫 수집)
    const autumn = plan(
      ok([runLog({ startedAt: "2026-10-24T21:30:00.000Z" })]),
      "2026-10-25T22:10:00.000Z",
    );
    expect(autumn).toMatchObject({
      start: "2026-10-24T18:30:00.000Z",
      basis: "last-success",
    });
    expect(windowLogFields(autumn)).toMatchObject({
      startKst: "10.25 03:30",
      endKst: "10.26 07:15",
      spanHours: 27.7,
    });
    // 07:10 KST 03-28(표준시 마지막 수집 — 전환은 03-28 10:00 KST) → 06:30 KST 03-29(서머타임 첫 수집)
    const spring = plan(
      ok([runLog({ startedAt: "2027-03-27T22:10:00.000Z" })]),
      "2027-03-28T21:30:00.000Z",
    );
    expect(spring).toMatchObject({
      start: "2027-03-27T19:10:00.000Z",
      basis: "last-success",
    });
    expect(windowLogFields(spring).spanHours).toBe(26.3);
  });

  it("입력 시각은 toISOString 형식으로 맞춘다(소수 초 없는 Z 형식도 받는다)", () => {
    expect(plan(ok([]), "2026-10-10T21:30:00Z").now).toBe(NOW);
  });
});

// ─── 항목 판정 ───────────────────────────────────────────────────────────

describe("judgeItemTime — 창 경계·미래 시각 가드", () => {
  const bounds = { start: FLOOR, now: NOW };

  it("창 시작과 같으면 창 안, 1ms라도 이르면 창 밖", () => {
    expect(judgeItemTime(FLOOR, bounds)).toEqual({
      kind: "in-window",
      publishedAt: FLOOR,
    });
    expect(judgeItemTime(iso(at(FLOOR) - 1), bounds)).toEqual({
      kind: "out-of-window",
    });
  });

  it("현재 + 5분까지는 발행 시각 그대로(허용 오차)", () => {
    for (const t of [NOW, iso(NOW_MS + FUTURE_TOLERANCE_MS)]) {
      expect(judgeItemTime(t, bounds)).toEqual({
        kind: "in-window",
        publishedAt: t,
      });
    }
  });

  it("5분 초과 ~ 3시간 미래는 수집 시각(현재)으로 낮춘다", () => {
    expect(
      judgeItemTime(iso(NOW_MS + FUTURE_TOLERANCE_MS + 1), bounds),
    ).toEqual({
      kind: "future-clamped",
      publishedAt: NOW,
      aheadMs: FUTURE_TOLERANCE_MS + 1,
    });
    // ESPN 'EST' 고정 표기(서머타임 기간) — M1-09 dry 실측 +35분
    expect(judgeItemTime(iso(NOW_MS + 35 * MINUTE), bounds)).toMatchObject({
      kind: "future-clamped",
      publishedAt: NOW,
    });
    expect(judgeItemTime(iso(NOW_MS + FUTURE_CLAMP_MAX_MS), bounds)).toEqual({
      kind: "future-clamped",
      publishedAt: NOW,
      aheadMs: FUTURE_CLAMP_MAX_MS,
    });
  });

  it("3시간을 넘는 미래는 제외(잘못된 시간대 — 예: KST를 UTC로 읽은 9시간)", () => {
    expect(
      judgeItemTime(iso(NOW_MS + FUTURE_CLAMP_MAX_MS + 1), bounds),
    ).toEqual({ kind: "future", aheadMs: FUTURE_CLAMP_MAX_MS + 1 });
    expect(judgeItemTime(iso(NOW_MS + 9 * HOUR), bounds)).toEqual({
      kind: "future",
      aheadMs: 9 * HOUR,
    });
  });
});

describe("applyCollectWindow — 항목 거르기·낮추기·집계", () => {
  it("입력 순서를 지키고, 낮춘 항목만 발행 시각이 바뀌며, 소스별로 집계한다", () => {
    const window = plan(ok([]));
    const items = [
      feedItem(BBC, "2026-10-10T20:00:00.000Z", 1),
      feedItem(ESPN, "2026-10-10T22:05:00.000Z", 2), // +35분 → 낮춤
      feedItem(BBC, iso(at(FLOOR) - 1), 3), // 상한 1ms 앞 → 창 밖
      feedItem(ESPN, "2026-10-11T06:30:00.000Z", 4), // +9시간 → 제외
      feedItem(ESPN, "2026-10-10T23:00:00.000Z", 5), // +1.5시간 → 낮춤
      feedItem(BBC, FLOOR, 6), // 상한과 같음 → 창 안
    ];
    const {
      items: kept,
      stats,
      clampedKeys,
    } = applyCollectWindow(items, window);
    expect(kept.map((i) => [i.url.split("/").pop(), i.publishedAt])).toEqual([
      ["1", "2026-10-10T20:00:00.000Z"],
      ["2", NOW],
      ["5", NOW],
      ["6", FLOOR],
    ]);
    // 낮춘 항목도 나머지 필드는 그대로
    expect(kept[1]).toEqual({ ...items[1], publishedAt: NOW });
    // 낮춘 항목 키(소스 id + 링크) — 점수화가 최신성을 믿지 않는다(M1-14). 낮춘 항목에서도 원래 항목에서도 같은 키
    expect([...clampedKeys]).toEqual([
      clampedItemKey(items[1]!),
      clampedItemKey(items[4]!),
    ]);
    expect(clampedKeys.has(clampedItemKey(kept[1]!))).toBe(true);
    expect(clampedKeys.has(clampedItemKey(kept[0]!))).toBe(false);
    expect(stats).toEqual({
      total: 6,
      inWindow: 4,
      outOfWindow: 1,
      futureClamped: 2,
      future: 1,
      bySource: {
        [BBC]: {
          inWindow: 2,
          outOfWindow: 1,
          futureClamped: 0,
          future: 0,
          maxAheadMs: null,
        },
        [ESPN]: {
          inWindow: 2,
          outOfWindow: 0,
          futureClamped: 2,
          future: 1,
          maxAheadMs: 9 * HOUR,
        },
      },
    });
  });

  it("소스별 시작을 쓴다 — 같은 발행 시각이라도 직전 실행에서 실패한 소스는 창 안", () => {
    const window = plan(
      ok([
        runLog({
          startedAt: YESTERDAY,
          status: "partial",
          sources: [
            { id: BBC, ok: true, items: 7 },
            { id: ESPN, ok: false, items: 0 },
          ],
        }),
      ]),
    );
    // 어제 실행 06:30 KST 직전에 나온 기사 — BBC는 어제 받았고(겹침 3시간 밖), ESPN은 어제 실패해 못 받았다
    const t = "2026-10-09T15:00:00.000Z";
    const { items } = applyCollectWindow(
      [feedItem(BBC, t), feedItem(ESPN, t)],
      window,
    );
    expect(items.map((i) => i.source)).toEqual([ESPN]);
  });

  it("겹침 구간(직전 실행 − 3시간 ~ 직전 실행)의 기사는 다음 실행에서 다시 후보가 된다 — 창은 시각만 본다, 날짜 간 중복은 seen-urls 기억(M1-12)이 막는다(아래 통합 테스트·tests/seen-urls.test.ts)", () => {
    const window = plan(ok([runLog({ startedAt: YESTERDAY })]));
    const yesterdayCandidate = feedItem(BBC, "2026-10-09T20:00:00.000Z");
    const { items } = applyCollectWindow([yesterdayCandidate], window);
    expect(items).toEqual([yesterdayCandidate]);
  });
});

// ─── runCollect 통합 ─────────────────────────────────────────────────────

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
/** configs/sources.json + fixture 피드 활성(테스트 전용 — ESPN은 실제 configs에서 비활성) */
const SOURCES = fixtureFeedSources();
const bySourceId = (id: string) => SOURCES.find((s) => s.id === id)!;
const BBC_SOURCE = bySourceId(BBC);
const ESPN_SOURCE = bySourceId(ESPN);
const FEED_XML: Record<string, string> = {
  [BBC_SOURCE.url]: read(`fixtures/rss/${BBC}.xml`),
  [ESPN_SOURCE.url]: read(`fixtures/rss/${ESPN}.xml`),
};

/** BBC Football fixture 항목(링크 끝 id) — 발행 시각 */
const BBC_ITEM = {
  /** 2026-10-09T18:20:41Z — 어제 실행(10-09 21:30Z) − 3시간보다 이르다 */
  older: "crlyk7w4zp5xo",
  /** 2026-10-10T22:01:20Z — NOW보다 31분 20초 미래 */
  ahead: "cmy0rp2r516po",
  /** 2026-10-10T20:58:39Z */
  latest: "cqn73g3pvezdo",
};

const fakeFetch: FetchLike = async (url) => {
  if (url.startsWith(FOOTBALL_DATA_BASE_URL)) {
    return new Response('{"matches":[]}', { status: 200 }); // 경기 없음 → 브리핑 호출 생략
  }
  const xml = FEED_XML[url];
  if (xml === undefined)
    throw new Error(`테스트에서 예상하지 못한 URL: ${url}`);
  return new Response(xml, { status: 200 });
};

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-window-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

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
    fetch: fakeFetch,
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

function writeRuns(file: "runs.json" | "runs-dev.json", runs: unknown): void {
  writeFileSync(
    path.join(dataDir, file),
    typeof runs === "string" ? runs : `${JSON.stringify(runs, null, 2)}\n`,
    "utf8",
  );
}

function readNews(date: string): NewsFile {
  return NewsFileSchema.parse(
    JSON.parse(
      readFileSync(path.join(dataDir, "news", `${date}.json`), "utf8"),
    ),
  );
}

/** data/cache/seen-urls.json(M1-12) — 스키마 검증 */
function readSeen(): SeenUrlsFile {
  return SeenUrlsFileSchema.parse(
    JSON.parse(
      readFileSync(path.join(dataDir, "cache", "seen-urls.json"), "utf8"),
    ),
  );
}

const cardFor = (file: NewsFile, linkId: string) =>
  file.cards.find((c) => c.src[0]!.u.includes(`/${linkId}?`));

describe("runCollect — 수집 시간 창 연결 (M1-10)", () => {
  it("FR-07: 어제 성공이면 어제 받은 기사는 빼고, 어제 실패(기록 없음)·그제 성공이면 어제 몫까지 받는다", async () => {
    // 어제 성공 → 창 = [어제 − 3시간, 현재]
    writeRuns("runs.json", [runLog({ startedAt: YESTERDAY })]);
    const afterSuccess = makeDeps();
    const a = await runCollect(afterSuccess.deps);
    expect(a.exitCode).toBe(0);
    expect(a.news.window).toMatchObject({
      start: "2026-10-09T18:30:00.000Z",
      basis: "last-success",
    });
    const fileA = readNews("2026-10-11");
    expect(cardFor(fileA, BBC_ITEM.older)).toBeUndefined();
    expect(cardFor(fileA, BBC_ITEM.latest)).toBeDefined();
    expect(
      afterSuccess.records.find((r) => r.event === "collect.window.plan"),
    ).toMatchObject({
      start: "2026-10-09T18:30:00.000Z",
      end: "2026-10-10T21:35:00.000Z",
      startKst: "10.10 03:30",
      endKst: "10.11 06:35",
      basis: "last-success",
      spanHours: 27,
      lastRunId: "collect-prod-20261009T213000Z-0000",
      lastRunAt: YESTERDAY,
      overlapHours: 3,
      maxHours: 51,
    });

    // 어제 실행 실패(커밋되지 않아 runs.json에 없음), 그제 성공 → 창 = 그제 − 3시간(= 51시간) → 어제 몫(10-09 18:20Z) 포함
    // 다른 상황을 빈 상태에서 — 발행 파일과 그 카드의 기억(cache/seen-urls.json, M1-12)을 함께 지운다
    rmSync(path.join(dataDir, "news"), { recursive: true, force: true });
    rmSync(path.join(dataDir, "cache"), { recursive: true, force: true });
    writeRuns("runs.json", [runLog({ startedAt: DAY_BEFORE })]);
    const afterFailure = makeDeps();
    const b = await runCollect(afterFailure.deps);
    expect(b.news.window).toMatchObject({
      start: "2026-10-08T18:30:00.000Z",
      basis: "last-success",
    });
    const fileB = readNews("2026-10-11");
    expect(cardFor(fileB, BBC_ITEM.older)).toBeDefined();
    expect(b.news.windowStats?.bySource[ESPN]).toMatchObject({
      inWindow: 1, // 10-09 13:23Z(08:23 EST)
    });
  });

  it("미래 시각 가드: 5분~3시간 미래는 수집 시각으로 낮춰 카드 at에도 쓰고, 3시간 넘는 미래는 제외·경고", async () => {
    // 시계를 피드 스냅샷보다 이르게 두어 미래 항목을 만든다 — BBC 22:01Z(+31분), ESPN 'EST' 01:02Z·02:43Z ×4(+3.5~5.2시간)
    const { deps, records } = makeDeps();
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("success");
    expect(outcome.news.windowStats).toMatchObject({
      total: 13,
      inWindow: 8,
      outOfWindow: 0,
      futureClamped: 1,
      future: 5,
    });
    const file = readNews("2026-10-11");
    expect(cardFor(file, BBC_ITEM.ahead)?.src[0]!.at).toBe(NOW);
    // 카드는 미래 시각을 갖지 않는다
    for (const card of file.cards) {
      expect(at(card.src[0]!.at)).toBeLessThanOrEqual(
        NOW_MS + FUTURE_TOLERANCE_MS,
      );
    }
    expect(
      file.cards.filter((c) => c.src[0]!.u.includes("espn.com")),
    ).toHaveLength(1);

    expect(
      records.filter(
        (r) =>
          r.event === "collect.item.clamp" || r.event === "collect.item.skip",
      ),
    ).toEqual([
      expect.objectContaining({
        level: "info",
        event: "collect.item.clamp",
        source: BBC,
        reason: "future-clamped",
        count: 1,
        aheadMaxMin: 32,
      }),
      expect.objectContaining({
        level: "warn",
        event: "collect.item.skip",
        source: ESPN,
        reason: "future",
        count: 5,
        kept: 1,
        aheadMaxMin: 314,
      }),
    ]);
    expect(
      records.find((r) => r.event === "collect.window.apply"),
    ).toMatchObject({
      items: 13,
      inWindow: 8,
      outOfWindow: 0,
      futureClamped: 1,
      future: 5,
      inWindowBySource: { [BBC]: 7, [ESPN]: 1 },
    });
    expect(records.find((r) => r.event === "collect.done")).toMatchObject({
      windowBasis: "first-run",
      inWindow: 8,
    });
    // 점수화(M1-14): 낮춘 BBC 기사는 최신성을 믿지 않는다(창 가운데로 본다) — 카드는 되지만 '방금 나온 기사'로 보지 않는다
    expect(
      records.find((r) => r.event === "collect.select.done"),
    ).toMatchObject({ selectedMix: expect.objectContaining({ clamped: 1 }) });
  });

  it("점수화(M1-14): 낮춘 기사는 선별 상한이 작으면 실제 시각이 최근인 기사에 밀린다 — 최신순이었다면 낮춘 기사가 1위", async () => {
    const { deps, records } = makeDeps({ limit: 1 });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    const file = readNews("2026-10-11");
    expect(file.cards).toHaveLength(1);
    expect(cardFor(file, BBC_ITEM.ahead)).toBeUndefined();
    expect(
      records.find((r) => r.event === "collect.select.done"),
    ).toMatchObject({
      limit: 1,
      ranked: 1,
      selectedMix: expect.objectContaining({ clamped: 0 }),
    });
  });

  it.each([
    ["JSON이 깨진 runs.json", "{ broken"],
    [
      "스키마에 맞지 않는 runs.json(dev 실행이 섞임)",
      [runLog({ startedAt: YESTERDAY, env: "dev" })],
    ],
  ])("%s → 51시간 창 + 경고, 뉴스는 발행한다", async (_label, content) => {
    writeRuns("runs.json", content);
    const { deps, records } = makeDeps();
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.news.window).toMatchObject({
      start: FLOOR,
      basis: "runs-unreadable",
    });
    expect(outcome.news.added).toBeGreaterThan(0);
    expect(
      records.find((r) => r.event === "collect.window.runs-unreadable"),
    ).toMatchObject({ level: "warn", file: "runs.json", fallbackHours: 51 });
  });

  it("runs-dev.json(dev 실행)은 보지 않는다 — prod runs.json 기준", async () => {
    writeRuns("runs.json", [runLog({ startedAt: DAY_BEFORE })]);
    writeRuns("runs-dev.json", [
      runLog({ startedAt: "2026-10-10T20:00:00.000Z", env: "dev" }),
    ]);
    const { deps } = makeDeps();
    const outcome = await runCollect(deps);
    expect(outcome.news.window).toMatchObject({
      start: "2026-10-08T18:30:00.000Z",
      basis: "last-success",
      lastRun: { startedAt: DAY_BEFORE },
    });
  });

  it("직전 실행에서 실패한 소스만 더 이른 시각부터 받는다(소스별 창) — 로그에 widerSources", async () => {
    writeRuns("runs.json", [
      runLog({
        startedAt: YESTERDAY,
        status: "partial",
        sources: [
          { id: BBC, ok: true, items: 7 },
          { id: ESPN, ok: false, items: 0 },
        ],
      }),
    ]);
    const { deps, records } = makeDeps();
    const outcome = await runCollect(deps);
    // BBC 10-09 18:20Z는 어제 받은 것(창 밖), ESPN 10-09 13:23Z는 어제 실패로 못 받은 것(창 안)
    expect(outcome.news.windowStats?.bySource[BBC]).toMatchObject({
      outOfWindow: 1,
    });
    expect(outcome.news.windowStats?.bySource[ESPN]).toMatchObject({
      outOfWindow: 0,
      inWindow: 1,
    });
    expect(
      records.find((r) => r.event === "collect.window.plan"),
    ).toMatchObject({
      basis: "last-success",
      widerSources: [{ source: ESPN, start: FLOOR, basis: "first-run" }],
    });
  });

  it("겹침 구간의 기사는 다음 날 카드가 되지 않는다 — 같은 날짜 파일 안은 병합, 날짜 간 중복은 seen-urls 기억이 막는다(M1-12, M1-10 이월)", async () => {
    // 1일차 06:30 KST 실행 → 2026-10-11.json + cache/seen-urls.json(그 파일 카드의 정규화 URL 해시 → 처음 본 시각)
    const day1 = makeDeps({ loadSources: async () => [BBC_SOURCE] });
    const run1 = await runCollect(day1.deps);
    expect(run1.exitCode).toBe(0);
    const file1 = readNews("2026-10-11");
    expect(file1.cards).toHaveLength(6);
    const seen1 = readSeen();
    expect(Object.keys(seen1.urls)).toEqual(
      file1.cards.map((c) => urlHash(c.src[0]!.u)).sort(),
    );
    expect(new Set(Object.values(seen1.urls))).toEqual(new Set([NOW]));
    // 1일차 실행이 커밋됐다고 보고 runs.json에 남긴다(테스트는 mock이라 직접 쓴다)
    writeRuns("runs.json", [
      runLog({
        startedAt: NOW,
        sources: [{ id: BBC, ok: true, items: 7 }],
      }),
    ]);
    // 2일차 06:30 KST — 같은 피드 + ① 1일차 카드(10-10 18:15Z 영상)가 pubDate를 새로 찍고 AMP·utm 링크로 다시 올라옴
    // (창 안으로 들어옴 — 피드 일괄 갱신 사례) ② 진짜 새 기사 1건. 창 = [1일차 − 3시간, 현재] → 1일차 겹침 구간 기사가 다시 후보
    const day2Xml = FEED_XML[BBC_SOURCE.url]!.replace(
      "</channel>",
      `<item><title><![CDATA[Bayern strike late to avoid shock defeat at Augsburg]]></title><link>https://www.bbc.co.uk/sport/football/videos/c674peklk5kno.amp?utm_source=twitter</link><pubDate>Sun, 11 Oct 2026 10:00:00 GMT</pubDate></item>
      <item><title><![CDATA[A new story on day two]]></title><link>https://www.bbc.co.uk/sport/football/articles/cday2new0001o?at_medium=RSS&amp;at_campaign=rss</link><pubDate>Sun, 11 Oct 2026 20:00:00 GMT</pubDate></item>
      </channel>`,
    );
    const day2 = makeDeps({
      loadSources: async () => [BBC_SOURCE],
      now: () => new Date(DAY2),
      fetch: async (url) =>
        url === BBC_SOURCE.url
          ? new Response(day2Xml, { status: 200 })
          : fakeFetch(url),
    });
    const run2 = await runCollect(day2.deps);
    expect(run2.exitCode).toBe(0);
    expect(run2.status).toBe("success");
    expect(run2.news.window?.start).toBe("2026-10-10T18:30:00.000Z");
    const file2 = readNews("2026-10-12");
    const ids1 = new Set(file1.cards.map((c) => c.id));
    // M1-10까지는 2일차 카드 전부가 1일차 카드였다(repeated = 전체) — 이제 0
    expect(file2.cards.filter((c) => ids1.has(c.id))).toEqual([]);
    expect(file2.cards.map((c) => c.src[0]!.u)).toEqual([
      "https://www.bbc.co.uk/sport/football/articles/cday2new0001o?at_medium=RSS&at_campaign=rss",
    ]);
    // 창 안 7건(겹침 구간 5 + 추가 2) → 고유 6(피드 안 중복 1) → 1일차 카드 5묶음 제외 → 새 기사 1장
    expect(run2.news.dedup).toEqual({
      items: 7,
      unique: 6,
      duplicates: 1,
      multiSource: 0,
      seenBefore: 5,
    });
    expect(
      day2.records.find((r) => r.event === "collect.select.done"),
    ).toMatchObject({ inWindow: 7, unique: 6, seenBefore: 5, selected: 1 });
    // 1일차에 미래라 낮췄던 기사(22:01Z)는 2일차에 원래 시각으로 다시 들어오지 않는다(M1-10 이월 — 중복 키는 정규화 URL만)
    expect(cardFor(file1, BBC_ITEM.ahead)?.src[0]!.at).toBe(NOW);
    expect(cardFor(file2, BBC_ITEM.ahead)).toBeUndefined();
    // 기억: 1일차 키는 처음 본 시각 그대로, 새 기사 키만 2일차 시각으로 더해진다
    const seen2 = readSeen();
    expect(Object.keys(seen2.urls)).toHaveLength(7);
    for (const card of file1.cards) {
      expect(seen2.urls[urlHash(card.src[0]!.u)]).toBe(NOW);
    }
    expect(seen2.urls[urlHash(file2.cards[0]!.src[0]!.u)]).toBe(DAY2);
    expect(run2.news.seen).toMatchObject({
      readError: null,
      size: 6,
      backfilled: 0,
      added: 1,
      pruned: 0,
      writeError: null,
    });
  });

  it("seen-urls.json이 없어도(첫 실행·파일 손실) 최근 발행 파일(D-1~D-3)로 날짜 간 중복을 막고, 그 카드로 기억을 채운다", async () => {
    const day1 = makeDeps({ loadSources: async () => [BBC_SOURCE] });
    await runCollect(day1.deps);
    const file1 = readNews("2026-10-11");
    rmSync(path.join(dataDir, "cache"), { recursive: true, force: true });
    writeRuns("runs.json", [
      runLog({ startedAt: NOW, sources: [{ id: BBC, ok: true, items: 7 }] }),
    ]);
    const day2 = makeDeps({
      loadSources: async () => [BBC_SOURCE],
      now: () => new Date(DAY2),
    });
    const run2 = await runCollect(day2.deps);
    expect(run2.exitCode).toBe(0);
    // 새 기사가 없으니 2일차 파일은 생기지 않는다(카드 0장 — collect.news.empty)
    expect(existsSync(path.join(dataDir, "news", "2026-10-12.json"))).toBe(
      false,
    );
    expect(run2.news.dedup).toMatchObject({ seenBefore: 4 });
    expect(run2.news.seen).toMatchObject({
      readError: null,
      backfilled: file1.cards.length,
    });
    expect(
      day2.records.find((r) => r.event === "collect.seen.load"),
    ).toMatchObject({
      exists: false,
      stored: 0,
      backfilled: 6,
      recentDates: ["2026-10-11"],
    });
    expect(
      day2.records.find((r) => r.event === "collect.news.empty"),
    ).toMatchObject({ level: "warn", date: "2026-10-12" });
  });

  it("--dry도 같은 규칙으로 창을 계산한다(파일은 쓰지 않음)", async () => {
    writeRuns("runs.json", [runLog({ startedAt: YESTERDAY })]);
    const { deps } = makeDeps({ dry: true });
    const outcome = await runCollect(deps);
    expect(outcome.news.path).toBeNull();
    expect(outcome.news.window).toMatchObject({
      start: "2026-10-09T18:30:00.000Z",
      basis: "last-success",
    });
  });
});

// ─── seen-urls 기억 연결 (M1-12) ─────────────────────────────────────────

describe("runCollect — 이미 카드가 된 URL 기억 data/cache/seen-urls.json (M1-12, FR-04)", () => {
  const seenFile = () => path.join(dataDir, "cache", "seen-urls.json");
  const bbcOnly = { loadSources: async () => [BBC_SOURCE] };

  it("--dry: 기억을 읽고 판정하지만 쓰지 않는다(출력만)", async () => {
    const { deps } = makeDeps({ ...bbcOnly, dry: true });
    const printed: string[] = [];
    deps.print = (text) => printed.push(text);
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(existsSync(path.join(dataDir, "cache"))).toBe(false);
    expect(outcome.news.seen).toMatchObject({ added: 6, written: null });
    expect(
      printed.some((p) =>
        p.startsWith(
          "── [dry] data/cache/seen-urls.json — 쓰지 않음 (기억 6개, 새로 6개",
        ),
      ),
    ).toBe(true);
  });

  it("뉴스 단계가 실패하면(모든 소스 실패) 기억을 쓰지 않는다 — 커밋되지 않는 실행이 기억을 바꾸지 않게", async () => {
    const { deps } = makeDeps({
      ...bbcOnly,
      fetch: async (url) =>
        url === BBC_SOURCE.url
          ? new Response("busy", { status: 503 })
          : fakeFetch(url),
      feedClock: { now: () => 0, sleep: async () => undefined },
    });
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.news.seen).toBeNull();
    expect(existsSync(path.join(dataDir, "cache"))).toBe(false);
  });

  it("같은 날 다시 실행해 새 카드가 없으면 기억 파일을 다시 쓰지 않는다", async () => {
    await runCollect(makeDeps(bbcOnly).deps);
    const before = readFileSync(seenFile(), "utf8");
    const again = makeDeps({
      ...bbcOnly,
      now: () => new Date("2026-10-10T22:10:00.000Z"), // 같은 KST 날(07:10)
    });
    const outcome = await runCollect(again.deps);
    expect(outcome.news.added).toBe(0);
    expect(outcome.news.dedup?.seenBefore).toBe(0); // 오늘 파일 카드는 다른 날 카드로 빼지 않는다(오늘 카드 클러스터 → 출처만 붙임, 새 자리는 그날 파일 기준 — D44)
    expect(readFileSync(seenFile(), "utf8")).toBe(before);
    expect(
      again.records.find((r) => r.event === "collect.seen.unchanged"),
    ).toMatchObject({ count: 6, added: 0 });
  });

  it("오늘 카드가 됐다가 오늘 파일에서 빠진 URL(삭제 요청 등)은 같은 날 다시 실행해도 들어오지 않는다", async () => {
    await runCollect(makeDeps(bbcOnly).deps);
    const filePath = path.join(dataDir, "news", "2026-10-11.json");
    const file = readNews("2026-10-11");
    const removed = cardFor(file, BBC_ITEM.latest)!;
    writeFileSync(
      filePath,
      `${JSON.stringify({ ...file, cards: file.cards.filter((c) => c.id !== removed.id) }, null, 2)}\n`,
      "utf8",
    );
    const again = makeDeps({
      ...bbcOnly,
      now: () => new Date("2026-10-10T22:10:00.000Z"),
    });
    const outcome = await runCollect(again.deps);
    expect(outcome.news.dedup?.seenBefore).toBe(1);
    expect(cardFor(readNews("2026-10-11"), BBC_ITEM.latest)).toBeUndefined();
  });

  it("90일 지난 기억은 다음 실행이 정리한다(경계: 정확히 90일 전은 남김)", async () => {
    mkdirSync(path.join(dataDir, "cache"), { recursive: true });
    const old = "0000000000000001";
    const edge = "0000000000000002";
    writeFileSync(
      seenFile(),
      `${JSON.stringify({
        updatedAt: YESTERDAY,
        urls: {
          [old]: new Date(NOW_MS - 90 * 24 * HOUR - 1).toISOString(),
          [edge]: new Date(NOW_MS - 90 * 24 * HOUR).toISOString(),
        },
      })}\n`,
      "utf8",
    );
    const { deps, records } = makeDeps(bbcOnly);
    const outcome = await runCollect(deps);
    expect(outcome.status).toBe("success");
    const seen = readSeen();
    expect(seen.urls[old]).toBeUndefined();
    expect(seen.urls[edge]).toBeDefined();
    expect(Object.keys(seen.urls)).toHaveLength(1 + 6);
    expect(seen.updatedAt).toBe(NOW);
    expect(records.find((r) => r.event === "collect.seen.write")).toMatchObject(
      {
        file: "data/cache/seen-urls.json",
        count: 7,
        added: 6,
        pruned: 1,
      },
    );
  });

  it("기억 파일이 깨져 있으면 경고하고 발행 파일로 다시 만든다 — 발행은 계속(partial)", async () => {
    mkdirSync(path.join(dataDir, "cache"), { recursive: true });
    writeFileSync(seenFile(), "{ broken", "utf8");
    const { deps, records } = makeDeps(bbcOnly);
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("partial");
    expect(outcome.news.added).toBe(6);
    expect(outcome.news.seen).toMatchObject({ readError: "JSON 파싱 실패" });
    expect(Object.keys(readSeen().urls)).toHaveLength(6);
    expect(
      records.find((r) => r.event === "collect.seen.unreadable"),
    ).toMatchObject({ level: "warn", error: "JSON 파싱 실패" });
  });

  it("cache 자리에 파일이 있어 기억 읽기·쓰기가 모두 실패해도 발행 파일은 쓰고 exit 0(partial)", async () => {
    writeFileSync(path.join(dataDir, "cache"), "not a dir", "utf8"); // cache/ 자리에 파일 → 읽기 ENOTDIR·mkdir 실패
    const { deps, records } = makeDeps(bbcOnly);
    const outcome = await runCollect(deps);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.status).toBe("partial");
    expect(readNews("2026-10-11").cards).toHaveLength(6);
    expect(outcome.news.seen).toMatchObject({
      readError: expect.stringMatching(/^읽기 실패/),
      written: null,
      writeError: expect.any(String),
    });
    expect(records.find((r) => r.event === "collect.seen.fail")).toMatchObject({
      level: "warn",
    });
  });

  // 읽기 전용 폴더로 쓰기만 막는다 — root는 권한을 무시하므로 건너뛴다(Actions 러너·로컬은 일반 사용자)
  it.skipIf(process.getuid?.() === 0)(
    "기억 읽기는 되고 쓰기만 실패해도(cache 폴더 읽기 전용) 발행 파일은 쓰고 exit 0(partial) — 다음 실행은 최근 발행 파일로 같은 중복을 막는다",
    async () => {
      const cacheDir = path.join(dataDir, "cache");
      mkdirSync(cacheDir, { recursive: true });
      const storedText = `${JSON.stringify(
        {
          updatedAt: YESTERDAY,
          urls: { "0000000000000001": YESTERDAY },
        },
        null,
        2,
      )}\n`;
      writeFileSync(seenFile(), storedText, "utf8");
      chmodSync(cacheDir, 0o555);
      let outcome: Awaited<ReturnType<typeof runCollect>>;
      let records: LogRecord[];
      try {
        const run = makeDeps(bbcOnly);
        records = run.records;
        outcome = await runCollect(run.deps);
      } finally {
        chmodSync(cacheDir, 0o755);
      }
      expect(outcome.exitCode).toBe(0);
      // 소스·브리핑은 정상 — partial은 기억 쓰기 실패 하나 때문이다
      expect(outcome.news.sources.every((s) => s.ok)).toBe(true);
      expect(outcome.brief).toMatchObject({
        state: "skipped",
        reason: "no-matches",
      });
      expect(outcome.status).toBe("partial");
      expect(readNews("2026-10-11").cards).toHaveLength(6);
      expect(outcome.news.seen).toMatchObject({
        readError: null,
        size: 1,
        added: 6,
        written: null,
        writeError: expect.any(String),
      });
      expect(readFileSync(seenFile(), "utf8")).toBe(storedText); // 기존 기억은 그대로
      expect(readdirSync(cacheDir)).toEqual(["seen-urls.json"]); // 임시 파일이 남지 않는다
      expect(
        records.find((r) => r.event === "collect.seen.fail"),
      ).toMatchObject({ level: "warn", count: 7, added: 6 });

      // 다음 날 — 기억에는 1일차 카드가 없지만 최근 발행 파일(D-1)로 채워 같은 기사를 다시 카드로 만들지 않는다
      writeRuns("runs.json", [
        runLog({ startedAt: NOW, sources: [{ id: BBC, ok: true, items: 7 }] }),
      ]);
      const day2 = makeDeps({ ...bbcOnly, now: () => new Date(DAY2) });
      const run2 = await runCollect(day2.deps);
      expect(run2.exitCode).toBe(0);
      expect(run2.news.dedup).toMatchObject({ seenBefore: 4 });
      expect(run2.news.seen).toMatchObject({ readError: null, backfilled: 6 });
      expect(existsSync(path.join(dataDir, "news", "2026-10-12.json"))).toBe(
        false,
      );
    },
  );
});
