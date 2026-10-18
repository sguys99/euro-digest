/**
 * 호(號) — 제 N호 · 발행·업데이트 시각 (M1-30, src/lib/issue.ts — PRD §15 D29, DESIGN §9.3, FR-142)
 */
import { describe, expect, it } from "vitest";

import { issueMeta, issueNumber } from "@/lib/issue";
import type { RunLog } from "@/lib/schema/run";
import { FIRST_ISSUE_DATE } from "@/lib/site";
import { TimeInputError } from "@/lib/time";

/** 테스트용 실행 기록 — 필요한 필드만 바꾼다 */
function run(over: Partial<RunLog>): RunLog {
  return {
    runId: "collect-prod-x",
    env: "prod",
    job: "collect",
    startedAt: "2026-10-17T21:30:00.000Z",
    finishedAt: "2026-10-17T21:32:00.000Z",
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

describe("issueNumber — 제 N호 = 발행일 − 창간일 + 1 (D29, 창간일 2026-10-12 — 2026-10-18 사용자 결정)", () => {
  it("창간일은 2026-10-12", () => {
    expect(FIRST_ISSUE_DATE).toBe("2026-10-12");
  });

  it.each([
    ["2026-10-12", 1],
    ["2026-10-13", 2],
    ["2026-10-17", 6],
    ["2026-10-18", 7],
    ["2026-10-26", 15], // 서머타임 종료(10-25) 뒤에도 달력 일수
    ["2027-01-01", 82],
  ])("%s → 제 %i호", (date, n) => {
    expect(issueNumber(date)).toBe(n);
  });

  it("결호가 나도 날짜만큼 늘어난다 — 10-14 다음 발행이 10-17이면 제 3호 → 제 6호", () => {
    expect(issueNumber("2026-10-14")).toBe(3);
    expect(issueNumber("2026-10-17")).toBe(6);
  });

  it("창간일 전 날짜(테스트 픽스처 등)는 호수가 없다", () => {
    expect(issueNumber("2026-10-11")).toBeNull();
    expect(issueNumber("2026-10-10")).toBeNull();
  });

  it("날짜 형식이 틀리면 던진다", () => {
    expect(() => issueNumber("2026-10-1")).toThrow(TimeInputError);
  });
});

describe("issueMeta — 발행 = 그 발행일 첫 발행 실행 종료 · 업데이트 = 마지막 실행 종료와 파일 generatedAt 중 늦은 값", () => {
  // KST 발행일 2026-10-18 = UTC 2026-10-17T15:00 ~ 2026-10-18T15:00
  const news = { date: "2026-10-18", generatedAt: "2026-10-17T21:31:10.000Z" };

  it("실행이 하나면 발행 = 업데이트 = 그 실행 종료(파일을 쓴 뒤 검증까지 끝난 시각)", () => {
    const meta = issueMeta(news, [run({})]);
    expect(meta).toEqual({
      date: "2026-10-18",
      no: 7,
      publishedAt: "2026-10-17T21:32:00.000Z",
      updatedAt: "2026-10-17T21:32:00.000Z",
    });
  });

  it("같은 발행일에 다시 돌린 실행이 있으면 발행은 첫 실행, 업데이트는 마지막 실행(파일 순서와 무관)", () => {
    const meta = issueMeta(news, [
      run({
        startedAt: "2026-10-18T05:00:00.000Z",
        finishedAt: "2026-10-18T05:02:30.000Z",
      }),
      run({}),
    ]);
    expect(meta.publishedAt).toBe("2026-10-17T21:32:00.000Z");
    expect(meta.updatedAt).toBe("2026-10-18T05:02:30.000Z");
  });

  it("발행하지 못한 실행(failed·skipped)·dev·weekly·다른 발행일 실행은 세지 않는다", () => {
    const meta = issueMeta(news, [
      run({}),
      run({
        status: "failed",
        startedAt: "2026-10-18T06:00:00.000Z",
        finishedAt: "2026-10-18T06:01:00.000Z",
      }),
      run({
        status: "skipped",
        startedAt: "2026-10-18T07:00:00.000Z",
        finishedAt: "2026-10-18T07:00:01.000Z",
      }),
      run({
        env: "dev",
        startedAt: "2026-10-18T08:00:00.000Z",
        finishedAt: "2026-10-18T08:01:00.000Z",
      }),
      run({
        job: "weekly",
        startedAt: "2026-10-18T09:00:00.000Z",
        finishedAt: "2026-10-18T09:01:00.000Z",
      }),
      // 다음 발행일(KST 10-19 00:30)에 시작한 실행
      run({
        startedAt: "2026-10-18T15:30:00.000Z",
        finishedAt: "2026-10-18T15:32:00.000Z",
      }),
    ]);
    expect(meta.publishedAt).toBe("2026-10-17T21:32:00.000Z");
    expect(meta.updatedAt).toBe("2026-10-17T21:32:00.000Z");
  });

  it("partial 실행은 발행한 실행이다(일부 소스 실패여도 게시)", () => {
    const meta = issueMeta(news, [run({ status: "partial" })]);
    expect(meta.publishedAt).toBe("2026-10-17T21:32:00.000Z");
  });

  it("그 발행일 실행 기록이 없으면 둘 다 파일 generatedAt", () => {
    const meta = issueMeta(news, []);
    expect(meta.publishedAt).toBe(news.generatedAt);
    expect(meta.updatedAt).toBe(news.generatedAt);
  });

  it("파일 generatedAt이 실행 종료보다 늦으면(기록 밖 갱신) 업데이트는 generatedAt — 발행 ≤ 업데이트", () => {
    const later = { ...news, generatedAt: "2026-10-18T03:00:00.000Z" };
    const meta = issueMeta(later, [run({})]);
    expect(meta.publishedAt).toBe("2026-10-17T21:32:00.000Z");
    expect(meta.updatedAt).toBe("2026-10-18T03:00:00.000Z");
  });

  it("창간일 전 호는 호수 없음", () => {
    expect(
      issueMeta(
        { date: "2026-10-10", generatedAt: "2026-10-09T21:00:00.000Z" },
        [],
      ).no,
    ).toBeNull();
  });
});
