/**
 * 운영 지표 순수 함수 (M5-09 · M5-15 재사용 — src/lib/ops-metrics.ts, PRD FR-155 · P-1, D26·D48·D49·D71)
 * 발행일 판정(정시·늦음·결호·실패·창간 전·발행 전) · 서머타임 전환 주(W43 → W44) · 주 경계 · 실행 성공률 · 비용 · dev 50% 경고 · asOf 고정
 */
import { describe, expect, it } from "vitest";

import { assessDevUsage, DEV_ALERT_SHARE } from "../scripts/lib/cost";

import {
  collectRunStats,
  countPublishDays,
  datesBetween,
  DEV_ALERT_SHARE as METRICS_DEV_ALERT_SHARE,
  lastDateOfMonth,
  lastPublication,
  monthBudgetUsage,
  monthsBetween,
  publishDay,
  publishDays,
  runStats,
  runsUpTo,
  spendInRange,
} from "@/lib/ops-metrics";
import type { RunLog } from "@/lib/schema/run";
import { isoWeekRange } from "@/lib/time";

let seq = 0;
/** 테스트용 실행 기록 — 필요한 필드만 바꾼다 */
function run(over: Partial<RunLog>): RunLog {
  seq += 1;
  return {
    runId: `collect-prod-${seq}`,
    env: "prod",
    job: "collect",
    startedAt: "2026-10-27T22:10:00.000Z",
    finishedAt: "2026-10-27T22:14:00.000Z",
    collected: 0,
    clusters: 0,
    summarized: 0,
    downgraded: 0,
    tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0,
    apiCalls: { footballData: 0, apiFootball: 0 },
    sources: [],
    status: "success",
    ...over,
  };
}

const W43 = isoWeekRange("2026-43"); // 10-19(월) ~ 10-25(일) KST — 마지막 날이 여름 발행
const W44 = isoWeekRange("2026-44"); // 10-26(월) ~ 11-01(일) KST — 겨울 발행

describe("날짜 도우미", () => {
  it("datesBetween — 둘 다 포함, 거꾸로면 빈 배열", () => {
    expect(datesBetween("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(datesBetween("2026-11-02", "2026-11-01")).toEqual([]);
  });

  it("monthsBetween · lastDateOfMonth", () => {
    expect(monthsBetween("2026-10-26", "2026-11-01")).toEqual([
      "2026-10",
      "2026-11",
    ]);
    expect(monthsBetween("2026-12-28", "2027-01-03")).toEqual([
      "2026-12",
      "2027-01",
    ]);
    expect(lastDateOfMonth("2026-10")).toBe("2026-10-31");
    expect(lastDateOfMonth("2026-12")).toBe("2026-12-31");
    expect(lastDateOfMonth("2028-02")).toBe("2028-02-29");
  });

  it("runsUpTo — startedAt이 asOf 이하만", () => {
    const a = run({ startedAt: "2026-11-01T14:59:59.999Z" });
    const b = run({ startedAt: "2026-11-01T15:00:00.000Z" });
    expect(runsUpTo([a, b], W44.to)).toEqual([a]);
  });
});

describe("publishDay — 발행일 판정 (첫 발행 수집 완료 ≤ 공개 목표 + 15분)", () => {
  it("서머타임 전환 주: 10-25(일)은 여름 07:15 한도, 10-26(월)은 겨울 07:45 한도", () => {
    // 10-25 07:20 KST 완료 — 여름 기준 늦음(겨울 기준이었다면 정시)
    const sun = run({
      startedAt: "2026-10-24T21:30:00.000Z",
      finishedAt: "2026-10-24T22:20:00.000Z",
    });
    // 10-26 07:40 KST 완료 — 겨울 기준 정시(여름 기준이었다면 늦음)
    const mon = run({
      startedAt: "2026-10-25T22:10:00.000Z",
      finishedAt: "2026-10-25T22:40:00.000Z",
    });
    const asOf = W44.to;
    expect(publishDay("2026-10-25", [sun, mon], asOf)).toMatchObject({
      state: "late",
      season: "summer",
      publishTarget: "2026-10-24T22:00:00.000Z",
      deadline: "2026-10-24T22:15:00.000Z",
      publishedAt: "2026-10-24T22:20:00.000Z",
      runs: 1,
    });
    expect(publishDay("2026-10-26", [sun, mon], asOf)).toMatchObject({
      state: "ontime",
      season: "winter",
      publishTarget: "2026-10-25T22:30:00.000Z",
      deadline: "2026-10-25T22:45:00.000Z",
    });
  });

  it("경계 — 한도와 같은 시각은 정시, 1ms 넘으면 늦음", () => {
    const at = (finishedAt: string) =>
      publishDay(
        "2026-10-28",
        [run({ startedAt: "2026-10-27T22:10:00.000Z", finishedAt })],
        W44.to,
      ).state;
    expect(at("2026-10-27T22:45:00.000Z")).toBe("ontime");
    expect(at("2026-10-27T22:45:00.001Z")).toBe("late");
  });

  it("첫 발행 = 가장 이른 finishedAt, 실패·dry·dev·weekly는 발행이 아니다", () => {
    const failed = run({
      startedAt: "2026-10-27T22:10:00.000Z",
      finishedAt: "2026-10-27T22:12:00.000Z",
      status: "failed",
    });
    const dry = run({
      startedAt: "2026-10-27T22:11:00.000Z",
      finishedAt: "2026-10-27T22:13:00.000Z",
      status: "skipped",
    });
    const dev = run({ env: "dev", finishedAt: "2026-10-27T22:13:30.000Z" });
    const weekly = run({ job: "weekly" });
    const retry = run({
      startedAt: "2026-10-28T01:00:00.000Z",
      finishedAt: "2026-10-28T01:05:00.000Z",
      status: "partial",
    });
    const day = publishDay(
      "2026-10-28",
      [retry, failed, dry, dev, weekly],
      W44.to,
    );
    expect(day).toMatchObject({
      state: "late",
      publishedAt: "2026-10-28T01:05:00.000Z",
      publishRunId: retry.runId,
      runs: 2, // 실패 + 재실행(dry·dev·weekly 제외)
      failedRuns: 1,
    });
  });

  it("게시 실행이 없으면 실패 실행 유무로 failed / missed, 목표 + 15분 전이면 pending", () => {
    const failed = run({
      startedAt: "2026-10-30T22:10:00.000Z",
      finishedAt: "2026-10-30T22:12:00.000Z",
      status: "failed",
    });
    expect(publishDay("2026-10-31", [failed], W44.to).state).toBe("failed");
    expect(publishDay("2026-11-01", [failed], W44.to).state).toBe("missed");
    // 11-01 07:44 KST(한도 07:45 전) — 아직 발행 전
    expect(publishDay("2026-11-01", [], "2026-10-31T22:44:00.000Z").state).toBe(
      "pending",
    );
    expect(publishDay("2026-11-01", [], "2026-10-31T22:45:00.000Z").state).toBe(
      "missed",
    );
  });

  it("창간일(2026-10-12) 전은 prelaunch", () => {
    expect(publishDay("2026-10-11", [], W44.to).state).toBe("prelaunch");
    expect(publishDay("2026-10-12", [], W44.to).state).toBe("missed");
  });

  it("asOf 뒤에 시작한 실행은 보지 않는다(일요일 고정 — 재실행해도 같은 판정)", () => {
    const late = run({
      startedAt: "2026-11-02T01:00:00.000Z", // 11-02 KST — 다음 주
      finishedAt: "2026-11-02T01:05:00.000Z",
    });
    expect(publishDay("2026-11-02", [late], W44.to).state).toBe("pending");
  });

  it("publishDays · countPublishDays — 모든 상태 키, 오름차순", () => {
    const days = publishDays("2026-10-26", "2026-11-01", [], W44.to);
    expect(days.map((d) => d.date)).toEqual(
      datesBetween("2026-10-26", "2026-11-01"),
    );
    expect(countPublishDays(days)).toEqual({
      ontime: 0,
      late: 0,
      missed: 7,
      failed: 0,
      pending: 0,
      prelaunch: 0,
    });
  });
});

describe("실행 성공률 — 실행 기준, dry(skipped) 제외, 주 경계(KST 월 00:00 포함 · 다음 월 00:00 제외)", () => {
  it("분모·분자", () => {
    const runs = [
      run({ startedAt: "2026-10-25T15:00:00.000Z" }), // 10-26 00:00 KST — 포함
      run({ status: "partial" }),
      run({ status: "failed" }),
      run({ status: "skipped" }),
      run({ env: "dev" }),
      run({ job: "weekly", startedAt: "2026-10-27T01:00:00.000Z" }),
      run({ startedAt: "2026-11-01T15:00:00.000Z" }), // 11-02 00:00 KST — 다음 주
      run({ startedAt: "2026-10-25T14:59:59.999Z" }), // 10-25 23:59 KST — 앞 주
    ];
    expect(collectRunStats(runs, W44)).toEqual({
      runs: 3,
      success: 1,
      partial: 1,
      failed: 1,
      ok: 2,
      rate: 2 / 3,
    });
    expect(runStats(runs, W44, "weekly")).toMatchObject({ runs: 1, ok: 1 });
    expect(collectRunStats([], W44).rate).toBeNull();
  });
});

describe("비용", () => {
  it("spendInRange — 구간에 시작한 실행, prod·dev·job별, 마이크로달러 합", () => {
    const runs = [
      run({ costUsd: 0.1 }),
      run({ costUsd: 0.2, env: "dev" }),
      run({ costUsd: 0.000001, job: "weekly" }),
      run({ costUsd: 5, startedAt: "2026-11-01T15:00:00.000Z" }), // 다음 주
    ];
    expect(spendInRange(runs, W44)).toEqual({
      prod: 0.100001,
      dev: 0.2,
      total: 0.300001,
      byJob: { collect: 0.3, weekly: 0.000001 },
    });
  });

  it("monthBudgetUsage — KST 달, asOf까지만, 기준 날짜·달 완료", () => {
    const runs = [
      run({ costUsd: 0.6, startedAt: "2026-10-31T14:59:59.000Z" }), // 10-31 KST
      run({ costUsd: 0.3, startedAt: "2026-10-31T15:00:00.000Z" }), // 11-01 KST
      run({ costUsd: 1, startedAt: "2026-11-02T01:00:00.000Z" }), // asOf 뒤 — 빠짐
    ];
    const oct = monthBudgetUsage(runs, "2026-10", W44.to, 3);
    const nov = monthBudgetUsage(runs, "2026-11", W44.to, 3);
    expect(oct).toMatchObject({
      through: "2026-10-31",
      complete: true,
      total: 0.6,
      share: 0.2,
    });
    expect(nov).toMatchObject({
      through: "2026-11-01",
      complete: false,
      total: 0.3,
      share: 0.1,
      devAlert: false,
    });
  });

  it("dev 50% 경고 — 50%를 넘을 때만, cost.ts assessDevUsage와 같은 판정", () => {
    expect(METRICS_DEV_ALERT_SHARE).toBe(DEV_ALERT_SHARE);
    const at = (devUsd: number) => [
      run({ env: "dev", costUsd: devUsd, startedAt: "2026-10-27T01:00:00Z" }),
      run({ costUsd: 0.4, startedAt: "2026-10-27T02:00:00Z" }),
    ];
    for (const dev of [1.5, 1.500001, 0.2]) {
      const runs = at(dev);
      const ours = monthBudgetUsage(runs, "2026-10", W44.to, 3);
      // assessDevUsage는 now의 KST 달 — 10월 안의 시각으로 같은 달을 본다
      const theirs = assessDevUsage(runs, new Date("2026-10-30T00:00:00Z"), 3);
      expect(ours.devAlert).toBe(theirs.alert);
      expect(ours.devShare).toBeCloseTo(theirs.share, 12);
    }
    expect(monthBudgetUsage(at(1.5), "2026-10", W44.to, 3).devAlert).toBe(
      false,
    );
    expect(monthBudgetUsage(at(1.500001), "2026-10", W44.to, 3).devAlert).toBe(
      true,
    );
    // 예산 0 — 비율 0, dev 사용이 있으면 경고
    expect(monthBudgetUsage(at(0.1), "2026-10", W44.to, 0)).toMatchObject({
      share: 0,
      devAlert: true,
    });
  });
});

describe("lastPublication — asOf까지 가장 최근 발행일과 첫·마지막 수집 완료", () => {
  it("같은 발행일 재실행은 updatedAt, asOf 뒤는 빠진다, 없으면 null", () => {
    const a = run({
      startedAt: "2026-10-30T22:10:00.000Z",
      finishedAt: "2026-10-30T22:14:00.000Z",
    });
    const b = run({
      startedAt: "2026-10-31T01:00:00.000Z",
      finishedAt: "2026-10-31T01:03:00.000Z",
      status: "partial",
    });
    const failed = run({
      startedAt: "2026-10-31T22:10:00.000Z",
      status: "failed",
    });
    const next = run({ startedAt: "2026-11-02T22:10:00.000Z" });
    expect(lastPublication([b, failed, a, next], W44.to)).toEqual({
      date: "2026-10-31",
      publishedAt: "2026-10-30T22:14:00.000Z",
      updatedAt: "2026-10-31T01:03:00.000Z",
      runId: a.runId,
    });
    expect(lastPublication([failed], W44.to)).toBeNull();
  });
});

describe("W43 — 여름 마지막 주의 주 구간", () => {
  it("KST 월 00:00 ~ 일 23:59:59.999", () => {
    expect(W43).toEqual({
      from: "2026-10-18T15:00:00.000Z",
      to: "2026-10-25T14:59:59.999Z",
    });
  });
});
