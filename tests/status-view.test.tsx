/**
 * `/status/` 공개 상태 페이지 (plan M5-15 — PRD P-1 · §15 D71 ③, DESIGN §9.3 D3 `/status`, DECISIONS D3 #10 · #15 · §8 #2)
 * - 화면 모델 `buildStatusView`(src/lib/status-view.ts): 30칸 발행일 띠 판정(정시 · 늦음 · 결호 · 실패 · 창간 전 · 발행 전) · 실행 기준
 *   성공률(skipped 제외 · 실패 실행 분모) · 비용 % 두 자리 반올림(prod + dev, 금액 없음) · 계절 전환 계단선 · 실패한 실행 ✕ · 소스 표 ·
 *   빈 데이터 · 뒤표지 숫자 = 숫자판 숫자
 * - 색인 제외(noindex · canonical 없음) · sitemap 제외 · 쪽 이름형 OG
 * - 뒤표지 '발행 상태 {n}%' 링크(숫자 Barlow 800 17px · 값 없으면 숫자 없이)
 * 빌드 결과(out/ 메타 · 링크 · axe · OG)는 e2e tests/e2e/status.spec.ts.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Colophon } from "@/components/shell/colophon";
import { StatusBody } from "@/components/status/status-body";
import { loadDeployTimes } from "@/lib/data/status";
import { sitemapEntries } from "@/lib/seo";
import type { RunLog, RunSource } from "@/lib/schema/run";
import {
  buildStatusView,
  deployOf,
  durationParts,
  formatRatePct,
  formatSharePct,
  statusRunRatePct,
  STATUS_WINDOW_DAYS,
  type StatusInput,
} from "@/lib/status-view";

import { metadata } from "../src/app/status/page";

let seq = 0;
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

const src = (id: string, usable?: number, ok = true): RunSource => ({
  id,
  ok,
  items: ok ? 10 : 0,
  ...(usable !== undefined ? { usable } : {}),
  ...(ok ? {} : { error: "http-5xx" }),
});

/** 11-04 06:30 KST — 오늘(11-04)은 공개 목표(07:30) + 15분 전이라 '발행 전' */
const AS_OF = "2026-11-03T21:30:00.000Z";

const PROD: RunLog[] = [
  // 10-12 여름 — 06:40 완료(목표 07:00) → 정시
  run({
    startedAt: "2026-10-11T21:30:00.000Z",
    finishedAt: "2026-10-11T21:40:00.000Z",
  }),
  // 10-13 — 12:05 완료 → 늦음
  run({
    startedAt: "2026-10-13T03:00:00.000Z",
    finishedAt: "2026-10-13T03:05:00.000Z",
    status: "partial",
  }),
  // 10-14 — 실패 실행만 → 실패
  run({
    startedAt: "2026-10-13T21:30:00.000Z",
    finishedAt: "2026-10-13T21:35:00.000Z",
    status: "failed",
  }),
  // 10-25 여름 마지막 날 — 06:50 → 정시
  run({
    startedAt: "2026-10-24T21:40:00.000Z",
    finishedAt: "2026-10-24T21:50:00.000Z",
  }),
  // 10-26 겨울 첫날 — 07:20(목표 07:30) → 정시
  run({
    startedAt: "2026-10-25T22:10:00.000Z",
    finishedAt: "2026-10-25T22:20:00.000Z",
  }),
  // 10-31 — 00:33 실패 실행(그래프 ✕) + 07:15 발행 → 정시
  run({
    startedAt: "2026-10-30T15:33:00.000Z",
    finishedAt: "2026-10-30T15:37:00.000Z",
    status: "failed",
  }),
  run({
    startedAt: "2026-10-30T22:10:00.000Z",
    finishedAt: "2026-10-30T22:15:00.000Z",
    costUsd: 0.03,
    sources: [src("bbc", 3), src("ghost", 0)],
  }),
  // 11-02 — prod dry 기록(skipped) → 성공률 분모에서 뺀다, 발행일 판정에도 없음
  run({
    startedAt: "2026-11-01T22:10:00.000Z",
    finishedAt: "2026-11-01T22:11:00.000Z",
    status: "skipped",
  }),
];

const DEV: RunLog[] = [
  run({
    runId: "collect-dev-1",
    env: "dev",
    startedAt: "2026-11-02T05:00:00.000Z",
    finishedAt: "2026-11-02T05:01:00.000Z",
    costUsd: 0.0767,
  }),
];

const INPUT: StatusInput = {
  prodRuns: PROD,
  devRuns: DEV,
  asOf: AS_OF,
  monthlyBudget: 3,
  sources: [{ id: "bbc", name: "BBC Sport — Football", tier: 2, lang: "en" }],
};

describe("숫자 형식", () => {
  it("성공률은 소수 한 자리 · 비용은 소수 두 자리 반올림(금액 없음)", () => {
    expect(formatRatePct(24 / 25)).toBe("96.0");
    expect(formatRatePct(2 / 3)).toBe("66.7");
    expect(formatRatePct(5 / 7)).toBe("71.4");
    expect(formatRatePct(0)).toBe("0.0");
    expect(formatRatePct(1)).toBe("100.0");
    expect(formatSharePct(0.106716 / 3)).toBe("3.56");
    expect(formatSharePct(0.174 / 3)).toBe("5.80");
    expect(formatSharePct(0.00018 / 3)).toBe("0.01");
    expect(formatSharePct(0)).toBe("0.00");
    expect(formatSharePct(1.2345)).toBe("123.45");
  });

  it("공개 목표와의 차이 — 분 · 시간 조각", () => {
    expect(durationParts(12)).toEqual([{ n: 12, unit: "분" }]);
    expect(durationParts(-65)).toEqual([
      { n: 1, unit: "시간" },
      { n: 5, unit: "분" },
    ]);
    expect(durationParts(120)).toEqual([{ n: 2, unit: "시간" }]);
  });
});

describe("buildStatusView — 실행 기록 → 화면 모델", () => {
  const view = buildStatusView(INPUT);
  const day = (date: string) => view.days.find((d) => d.date === date)!;

  it("30칸 = 오늘(KST)부터 거꾸로 30일, 기본 선택은 오늘", () => {
    expect(view.days).toHaveLength(STATUS_WINDOW_DAYS);
    expect(view.from).toBe("2026-10-06");
    expect(view.to).toBe("2026-11-04");
    expect(view.selected).toBe(29);
    expect(view.asOfLabel).toBe("11월 4일 (수) 06:30");
  });

  it("발행일 띠 판정 — 정시 · 늦음 · 실패 · 결호 · 창간 전 · 발행 전", () => {
    expect(day("2026-10-11").state).toBe("prelaunch");
    expect(day("2026-10-12").state).toBe("ontime");
    expect(day("2026-10-13").state).toBe("late");
    expect(day("2026-10-14").state).toBe("failed");
    expect(day("2026-10-15").state).toBe("missed");
    expect(day("2026-10-25").state).toBe("ontime");
    expect(day("2026-10-26").state).toBe("ontime");
    expect(day("2026-10-31").state).toBe("ontime");
    expect(day("2026-11-02").state).toBe("missed"); // dry 기록만 — 발행 아님
    expect(day("2026-11-04").state).toBe("pending");
    expect(view.counts).toEqual({
      ontime: 4,
      late: 1,
      missed: 17,
      failed: 1,
      pending: 1,
      prelaunch: 6,
    });
    expect(view.prelaunchDays).toBe(6);
  });

  it("상세 줄 — 날짜 · 호수 · 상태 · 수집 완료 · 공개 목표(계절별) · 실패한 실행", () => {
    expect(day("2026-10-12").line).toBe(
      "10.12 (월) · 제 1호 · 정시 · 수집 완료 06:40 · 공개 목표 07:00",
    );
    expect(day("2026-10-31").line).toBe(
      "10.31 (토) · 제 20호 · 정시 · 수집 완료 07:15 · 공개 목표 07:30 · 실패한 실행 1회(00:33)",
    );
    expect(day("2026-10-15").line).toBe(
      "10.15 (목) · 제 4호 · 결호 · 공개 목표 07:00",
    );
    expect(day("2026-10-06").line).toBe("10.06 (화) · 창간 전");
    expect(day("2026-11-04").line).toBe(
      "11.04 (수) · 제 24호 · 발행 전 · 공개 목표 07:30",
    );
  });

  it("그래프 좌표 — 점 y = 수집 완료(위 0 = 24시), 공개 목표 계단선이 서머타임 끝(10-25 → 10-26)에서 07:00 → 07:30, 실패 ✕", () => {
    expect(day("2026-10-12").y).toBeCloseTo(100 * (1 - 400 / 1440), 1);
    expect(day("2026-10-25").targetY).toBeCloseTo(100 * (1 - 420 / 1440), 1);
    expect(day("2026-10-26").targetY).toBeCloseTo(100 * (1 - 450 / 1440), 1);
    expect(day("2026-10-31").failedY).toEqual([
      expect.closeTo(100 * (1 - 33 / 1440), 1),
    ]);
    expect(day("2026-10-15").y).toBeNull();
    // 계단선은 창간 전 6칸을 건너뛰고 시작, 두 높이
    expect(view.targetPath.startsWith("M20 ")).toBe(true);
    const ys = new Set(
      [...view.targetPath.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => m[1]),
    );
    expect(ys.size).toBe(2);
    expect(view.targetLabel).toEqual({ x: 20, y: day("2026-10-12").targetY });
    expect(view.failedRunCount).toBe(2);
    expect(view.axis.map((a) => a.md)).toEqual([
      "10.06",
      "10.14",
      "10.21",
      "10.28",
      "11.04",
    ]);
  });

  it("숫자판 — 마지막 발행 · 실행 기준 성공률(skipped 제외) · 비용 %(prod + dev, KST 달)", () => {
    expect(view.last).toEqual({
      date: "2026-10-31",
      no: 20,
      dateLabel: "10월 31일 (토)",
      finished: "07:15",
      target: "07:30",
      leadMinutes: 15,
      deploy: null, // 배포 목록이 없으면(로컬 · API 실패) 모름 — 칸 숨김
    });
    expect(view.runRate).toEqual({
      runs: 7,
      ok: 5,
      failed: 2,
      pct: "71.4",
      zero: false,
    });
    // 11월 = dev 0.0767 / 3 = 2.556…% → 2.56, 10월 = prod 0.03 / 3 = 1%
    expect(view.cost).toEqual({
      month: "2026-11",
      pct: "2.56",
      zero: false,
      previous: { month: "2026-10", pct: "1.00" },
    });
  });

  it("뒤표지 숫자는 숫자판과 같은 계산", () => {
    expect(statusRunRatePct(PROD, AS_OF)).toBe(view.runRate?.pct);
  });

  it("소스 표 — 마지막 수집 실행의 소스 · 최근 7일 응답 · 새 기사 · 없음 연속, 설정에 없는 소스는 id", () => {
    expect(view.sourceFrom).toBe("2026-10-29");
    expect(view.sources).toEqual([
      {
        id: "bbc",
        name: "BBC Sport — Football",
        tier: 2,
        lang: "en",
        ok: 1,
        attempts: 1,
        fresh: 3,
        stale: 0,
        flagged: false,
      },
      {
        id: "ghost",
        name: "ghost",
        tier: null,
        lang: null,
        ok: 1,
        attempts: 1,
        fresh: 0,
        stale: 1,
        flagged: false,
      },
    ]);
  });

  it("없음 연속 7회 이상이면 표시(이슈 기준과 같다) · usable 없는 옛 기록만이면 새 기사 = 값 없음", () => {
    const runs = Array.from({ length: 7 }, (_, i) =>
      run({
        startedAt: `2026-11-0${i + 1}T00:00:00.000Z`,
        finishedAt: `2026-11-0${i + 1}T00:05:00.000Z`,
        sources: [src("stale", 0), src("legacy")],
      }),
    );
    const v = buildStatusView({
      ...INPUT,
      prodRuns: runs,
      devRuns: [],
      asOf: "2026-11-07T12:00:00.000Z",
    });
    expect(v.sources.map((s) => [s.id, s.stale, s.flagged, s.fresh])).toEqual([
      ["stale", 7, true, 0],
      ["legacy", 0, false, null],
    ]);
  });

  it("asOf 뒤의 실행은 세지 않는다(빌드 시각 기준)", () => {
    const later = run({
      startedAt: "2026-11-03T22:10:00.000Z",
      finishedAt: "2026-11-03T22:15:00.000Z",
    });
    const v = buildStatusView({ ...INPUT, prodRuns: [...PROD, later] });
    expect(v).toEqual(view);
  });

  it("빈 데이터 — 실행 기록 0건이면 숫자판 값 없음 · 비용 0(윤곽) · 소스 없음", () => {
    const v = buildStatusView({ ...INPUT, prodRuns: [], devRuns: [] });
    expect(v.last).toBeNull();
    expect(v.runRate).toBeNull();
    expect(v.cost).toEqual({
      month: "2026-11",
      pct: "0.00",
      zero: true,
      previous: null,
    });
    expect(v.sources).toEqual([]);
    expect(v.failedRunCount).toBe(0);
    expect(statusRunRatePct([], AS_OF)).toBeNull();
  });

  it("실행은 있는데 모두 실패면 성공률 0.0(윤곽)", () => {
    const v = buildStatusView({
      ...INPUT,
      prodRuns: [PROD[2] as RunLog],
      devRuns: [],
    });
    expect(v.runRate).toMatchObject({ pct: "0.0", zero: true, failed: 1 });
    expect(v.last).toBeNull();
  });
});

describe("색인 제외 · sitemap 제외 · OG (2026-11-03 사용자 결정)", () => {
  it('noindex · canonical 없음 · 쪽 이름형 OG · 제목 "발행 상태"', () => {
    expect(metadata.robots).toEqual({ index: false });
    expect(metadata.alternates?.canonical).toBeUndefined();
    expect(metadata.title).toBe("발행 상태");
    const images = metadata.openGraph?.images;
    expect(JSON.stringify(images)).toContain("/og/pages/status.png");
    expect(metadata.openGraph?.url).toBeUndefined();
  });

  it("sitemap 항목에 /status/가 없다", () => {
    const urls = sitemapEntries([
      { date: "2026-11-02", generatedAt: "2026-11-02T22:17:28.216Z" },
    ]).map((e) => e.url);
    expect(urls.some((u) => u.includes("/status"))).toBe(false);
  });
});

describe("지면 — 숫자 상태 · 대체 텍스트 · 섬 하나", () => {
  it("숫자판 dl 3칸 · 금액 없음 · 점 · 띠는 aria-hidden · 화면 밖 30일 목록 · 상세 줄 aria-live", () => {
    const view = buildStatusView(INPUT);
    const { container } = render(<StatusBody view={view} />);
    const board = container.querySelector("dl[data-slot=status-board]")!;
    expect(board.querySelectorAll(":scope > div")).toHaveLength(3);
    expect(within(board as HTMLElement).getByText("71.4%")).toHaveClass(
      "sr-only",
    );
    expect(container.textContent).not.toMatch(/\$|USD|달러/);
    expect(container.querySelector("[data-slot=status-band]")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      container
        .querySelector("[data-slot=status-plot]")
        ?.closest("[aria-hidden]"),
    ).not.toBeNull();
    const list = screen.getByRole("list", { name: "최근 30일 발행일" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(30);
    const live = container.querySelector("[data-slot=status-line]")!;
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live.textContent).toBe(view.days[29]?.line);
    expect(screen.getByRole("button", { name: "다음 날" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "이전 날" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    // 소스 표 — caption · th scope · 0은 윤곽
    const table = screen.getByRole("table", { name: "소스 건강도 — 최근 7일" });
    expect(within(table).getAllByRole("rowheader")).toHaveLength(2);
  });

  it("빈 데이터 — 숫자판은 대시, 그래프 · 소스 대신 안내 문장", () => {
    const view = buildStatusView({ ...INPUT, prodRuns: [], devRuns: [] });
    const { container } = render(<StatusBody view={view} />);
    const tones = [
      ...container.querySelectorAll("[data-slot=status-board] [data-tone]"),
    ].map((el) => [el.getAttribute("data-tone"), el.textContent]);
    expect(tones).toEqual([
      ["null", "–"],
      ["null", "–"],
      ["zero", "0.00"],
    ]);
    expect(container.querySelector("[data-slot=status-empty]")).not.toBeNull();
    expect(container.querySelector("[data-slot=status-plot]")).toBeNull();
  });
});

describe("뒤표지 '발행 상태' 링크 (DECISIONS D3 #15)", () => {
  it("숫자 Barlow 800 17px · /status/ · 삭제·정정 요청 뒤 GitHub 앞", () => {
    render(<Colophon issue={null} statusRate="96.0" />);
    const link = screen.getByRole("link", { name: /^발행 상태\s*96\.0\s*%$/ });
    expect(link.textContent).toBe("발행 상태 96.0%");
    expect(link.getAttribute("href")?.replace(/\/?$/, "/")).toBe("/status/");
    const num = within(link).getByText("96.0");
    expect(num.className).toContain("text-[17px]");
    expect(num.className).toContain("font-extrabold");
    expect(num.className).toContain("font-numeric");
    const names = screen.getAllByRole("link").map((a) => a.textContent ?? "");
    expect(names.indexOf("발행 상태 96.0%")).toBe(
      names.findIndex((n) => n.startsWith("삭제")) + 1,
    );
    expect(names.indexOf("발행 상태 96.0%") + 1).toBe(
      names.findIndex((n) => n.startsWith("GitHub")),
    );
  });

  it('실행 기록이 없으면 숫자 없이 "발행 상태"', () => {
    render(<Colophon issue={null} statusRate={null} />);
    expect(screen.getByRole("link", { name: "발행 상태" })).toBeTruthy();
  });
});

describe("배포 완료 시각 — deploy.yml이 넘긴 github-pages 배포 목록 (2026-11-03 사용자 결정 · M5-13 실행 구분)", () => {
  // 10-31 첫 발행 수집 완료 = 2026-10-30T22:15Z(07:15 KST)
  const PUBLISHED = "2026-10-30T22:15:00.000Z";
  // 발행 실행이 받은 main 끝(수집 전 — 전날 밤 사람 커밋)
  const BEFORE = "2026-10-30T11:00:00Z";
  const rec = (at: string, commitAt: string | null = BEFORE) => ({
    at,
    commitAt,
  });

  it("수집 완료 뒤 12시간 안에 끝난 첫 배포 = 그 호의 배포 완료(이전 배포 · 12시간 뒤 배포는 아니다)", () => {
    const deploys = [
      rec("2026-10-30T12:00:00Z"), // 전날 저녁 사람 배포 — 앞
      rec("2026-10-31T05:00:00Z"), // 같은 날 오후 배포 — 첫 배포가 아니다
      rec("2026-10-30T22:19:30Z"), // 07:19 KST — 이것
    ];
    expect(deployOf("2026-10-31", PUBLISHED, deploys, AS_OF)).toEqual({
      kind: "done",
      at: "07:19",
      nextDay: null,
    });
    expect(
      deployOf("2026-10-31", PUBLISHED, [rec("2026-10-31T10:15:00Z")], AS_OF),
    ).toBeNull(); // 12시간 뒤 — 이 호의 배포로 보지 않는다
  });

  it("아침 배포가 실패한 날 — 낮의 사람 push 배포(커밋 시각이 수집 완료 뒤)는 그 호의 배포가 아니다(값 없음)", () => {
    // 07:19 배포 실패(기록 없음) → 12:30 KST 사람 커밋(발행 커밋 위) → 12:41 KST ci 배포
    const human = rec("2026-10-31T03:41:00Z", "2026-10-31T03:30:00Z");
    expect(deployOf("2026-10-31", PUBLISHED, [human], AS_OF)).toBeNull();
    // 같은 목록에 발행 실행의 배포가 있으면 그것만(사람 배포가 더 이르더라도 — 커밋 시각으로 가른다)
    const early = rec("2026-10-30T22:16:00Z", "2026-10-30T22:15:30Z"); // 발행 커밋 뒤 수동 재배포
    const publish = rec("2026-10-30T22:20:00Z");
    expect(
      deployOf("2026-10-31", PUBLISHED, [early, human, publish], AS_OF),
    ).toEqual({ kind: "done", at: "07:20", nextDay: null });
  });

  it("커밋 시각을 모르는 배포(null) · 커밋 시각이 수집 완료와 같은 배포는 싣지 않는다", () => {
    expect(
      deployOf(
        "2026-10-31",
        PUBLISHED,
        [
          rec("2026-10-30T22:19:30Z", null),
          rec("2026-10-30T22:20:00Z", PUBLISHED),
        ],
        AS_OF,
      ),
    ).toBeNull();
  });

  it("자정을 넘겨 끝난 배포는 다음 날 표시 · asOf 뒤 배포는 보지 않는다", () => {
    expect(
      deployOf(
        "2026-10-31",
        "2026-10-31T14:50:00.000Z", // 23:50 KST
        [rec("2026-10-31T15:04:00Z")], // 11-01 00:04 KST
        AS_OF,
      ),
    ).toEqual({ kind: "done", at: "00:04", nextDay: "2026-11-01" });
    expect(
      deployOf(
        "2026-11-03",
        "2026-11-02T22:15:00.000Z",
        [rec("2026-11-02T22:20:00Z")],
        "2026-11-02T22:18:00.000Z",
      ),
    ).toEqual({ kind: "pending" });
  });

  it("오늘 호가 발행됐고 그 배포가 아직 없으면 '배포 중', 지난 날은 모름(null) · 목록이 없으면 늘 null", () => {
    const asOf = "2026-11-02T22:18:00.000Z"; // 11-03 07:18 KST — 이 빌드가 오늘 배포
    expect(
      deployOf("2026-11-03", "2026-11-02T22:15:00.000Z", [], asOf),
    ).toEqual({ kind: "pending" });
    expect(
      deployOf("2026-11-02", "2026-11-01T22:15:00.000Z", [], asOf),
    ).toBeNull();
    expect(
      deployOf("2026-11-03", "2026-11-02T22:15:00.000Z", null, asOf),
    ).toBeNull();
    expect(deployOf("2026-11-03", null, [], asOf)).toBeNull();
  });

  it("화면 모델 — 상세 줄 · 숫자판 캡션에 배포 완료(오늘은 배포 중)", () => {
    const today = run({
      startedAt: "2026-11-03T22:10:00.000Z",
      finishedAt: "2026-11-03T22:14:00.000Z",
    });
    const view = buildStatusView({
      ...INPUT,
      prodRuns: [...PROD, today],
      asOf: "2026-11-03T22:16:00.000Z", // 11-04 07:16 KST
      deploys: [
        { at: "2026-10-30T22:19:30Z", commitAt: "2026-10-30T11:00:00Z" },
      ],
    });
    const day = (date: string) => view.days.find((d) => d.date === date)!;
    expect(day("2026-10-31").line).toBe(
      "10.31 (토) · 제 20호 · 정시 · 수집 완료 07:15 · 배포 완료 07:19 · 공개 목표 07:30 · 실패한 실행 1회(00:33)",
    );
    expect(day("2026-11-04").line).toBe(
      "11.04 (수) · 제 24호 · 정시 · 수집 완료 07:14 · 배포 중 · 공개 목표 07:30",
    );
    expect(day("2026-10-26").deploy).toBeNull(); // 목록 범위 밖 — 지어내지 않는다
    expect(view.last?.deploy).toEqual({ kind: "pending" });
    render(<StatusBody view={view} />);
    expect(
      document.querySelector("[data-slot=status-deploy]")?.textContent,
    ).toBe("배포 중");
  });

  it("목록이 없으면 숫자판에 배포 줄이 없다", () => {
    const { container } = render(<StatusBody view={buildStatusView(INPUT)} />);
    expect(container.querySelector("[data-slot=status-deploy]")).toBeNull();
  });

  it("loadDeployTimes — 변수 없음 · 파일 없음 · 깨진 JSON · 형식 다름은 던지지 않고 null(빌드 계속, 칸 숨김)", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "deploys-"));
    const file = (name: string, body: string) => {
      const p = path.join(dir, name);
      writeFileSync(p, body);
      return p;
    };
    expect(loadDeployTimes(undefined)).toBeNull();
    expect(loadDeployTimes("")).toBeNull();
    expect(loadDeployTimes(path.join(dir, "none.json"))).toBeNull();
    expect(loadDeployTimes(file("broken.json", "{"))).toBeNull();
    expect(loadDeployTimes(file("object.json", '{"a":1}'))).toBeNull();
    // 옛 형식(성공 시각 문자열 배열 — M5-13 전 deploy.yml)은 형식이 다르다
    expect(
      loadDeployTimes(file("legacy.json", '["2026-11-02T22:20:02Z"]')),
    ).toBeNull();
    expect(
      loadDeployTimes(
        file(
          "offset.json",
          '[{"at":"2026-11-02T22:20:02+09:00","commitAt":null}]',
        ),
      ),
    ).toBeNull();
    expect(
      loadDeployTimes(
        file(
          "ok.json",
          '[{"at":"2026-11-02T22:20:02Z","commitAt":"2026-11-02T13:00:00Z"},{"at":"2026-11-02T15:00:54Z","commitAt":null}]',
        ),
      ),
    ).toEqual([
      { at: "2026-11-02T22:20:02Z", commitAt: "2026-11-02T13:00:00Z" },
      { at: "2026-11-02T15:00:54Z", commitAt: null },
    ]);
  });
});
