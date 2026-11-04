import type { Metadata } from "next";
import type { ReactNode } from "react";

import { StatusBody } from "@/components/status/status-body";
import { datesBetween } from "@/lib/ops-metrics";
import type { RunLog } from "@/lib/schema/run";
import { buildStatusView, type StatusInput } from "@/lib/status-view";
import { kstDayRangeUtc } from "@/lib/time";

/**
 * `/status` 견본(M5-15 — DESIGN §9.3 D3 `/status`, PRD P-1) — `SPECIMEN=1` 빌드 전용(`/specimen/status/`, 공개 빌드에 없음).
 * 실제 데이터로는 늘 보이지 않는 변형을 합성 실행 기록으로 싣는다(실제 지면은 `out/status/` — e2e tests/e2e/status.spec.ts):
 * ① 띠 6종 — 정시 · 늦음 · 결호 · 실패(⊘) · 창간 전 · 오늘 발행 전(기호 없음) + 실패한 실행 ✕ + 서머타임 끝 계단선 + dry 기록(분모 제외)
 *   + 소스 표 변형(실패 소스 · 새 기사 0) + 배포 완료 시각(11-02 · 11-03만 — 목록 범위 밖 날은 값 없음)
 * ② 빈 데이터 — 실행 기록 0건(숫자판 대시 · 비용 0 윤곽 · 그래프 · 소스 대신 안내)
 * ③ 모두 실패 — 성공률 0.0 윤곽 · 마지막 발행 없음(대시)
 * 기준 시각은 고정(11-04 06:30 KST — 오늘 공개 목표 + 15분 전). 섬(날짜 선택)은 변형마다 그래프 id가 달라 따로 움직인다.
 */

export const metadata: Metadata = {
  title: "발행 상태 견본",
  robots: { index: false, follow: false },
};

const AS_OF = "2026-11-03T21:30:00.000Z";

let seq = 0;
function run(over: Partial<RunLog>): RunLog {
  seq += 1;
  return {
    runId: `collect-prod-specimen-${seq}`,
    env: "prod",
    job: "collect",
    startedAt: AS_OF,
    finishedAt: AS_OF,
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

const SOURCES = [
  { id: "bbc-sport-football", ok: true, items: 40, usable: 12 },
  { id: "bbc-sport-champions-league", ok: true, items: 20, usable: 0 },
  { id: "interfootball-world", ok: false, items: 0, error: "http-5xx" },
];

/** 하루 한 번 07:12 KST 발행(겨울) — 10-26부터, 실패한 날 · 결호 · 늦은 날을 섞는다 */
function variedRuns(): RunLog[] {
  const runs: RunLog[] = [
    run({
      startedAt: "2026-10-11T21:30:00.000Z",
      finishedAt: "2026-10-11T21:40:00.000Z",
      costUsd: 0.004,
    }),
    run({
      startedAt: "2026-10-13T03:00:00.000Z",
      finishedAt: "2026-10-13T03:05:00.000Z",
      status: "partial",
      costUsd: 0.003,
    }),
    run({
      startedAt: "2026-10-13T21:30:00.000Z",
      finishedAt: "2026-10-13T21:35:00.000Z",
      status: "failed",
    }),
    run({
      startedAt: "2026-10-24T21:40:00.000Z",
      finishedAt: "2026-10-24T21:50:00.000Z",
      costUsd: 0.003,
    }),
  ];
  // 10-26 ~ 11-03 매일 07:10 KST 시작 · 07:12 완료(11-02는 07:58 — 늦음), 10-29는 결호, 10-31은 00:33 실패한 실행이 먼저 있다
  for (const date of datesBetween("2026-10-26", "2026-11-03")) {
    if (date === "2026-10-29") continue;
    const at = (minutes: number) =>
      new Date(
        Date.parse(kstDayRangeUtc(date).start) + minutes * 60_000,
      ).toISOString();
    if (date === "2026-10-31") {
      runs.push(
        run({ startedAt: at(33), finishedAt: at(37), status: "failed" }),
      );
    }
    runs.push(
      run({
        startedAt: at(7 * 60 + 10),
        finishedAt: at(date === "2026-11-02" ? 7 * 60 + 58 : 7 * 60 + 12),
        costUsd: 0.003,
        sources: SOURCES,
      }),
    );
  }
  runs.push(
    run({
      startedAt: "2026-11-02T22:10:00.000Z",
      finishedAt: "2026-11-02T22:11:00.000Z",
      status: "skipped",
    }),
  );
  return runs;
}

const CONFIG: StatusInput["sources"] = [
  {
    id: "bbc-sport-football",
    name: "BBC Sport — Football",
    tier: 2,
    lang: "en",
  },
  {
    id: "bbc-sport-champions-league",
    name: "BBC Sport — Champions League",
    tier: 2,
    lang: "en",
  },
  {
    id: "interfootball-world",
    name: "인터풋볼 — 해외축구",
    tier: 3,
    lang: "ko",
  },
];

const VARIANTS = [
  {
    slot: "status-varied",
    caption: "띠 6종",
    detail:
      "정시 · 늦음 · 결호 · 실패 · 창간 전 · 오늘 발행 전 + 실패한 실행 표시 · 서머타임 끝 계단선 · dry 기록 분모 제외",
    view: buildStatusView({
      prodRuns: variedRuns(),
      devRuns: [
        run({
          runId: "collect-dev-specimen",
          env: "dev",
          startedAt: "2026-11-02T05:00:00.000Z",
          finishedAt: "2026-11-02T05:01:00.000Z",
          costUsd: 0.05,
        }),
      ],
      asOf: AS_OF,
      monthlyBudget: 3,
      sources: CONFIG,
      // 배포 완료 시각(deploy.yml이 넘기는 github-pages 배포 기록 — 성공 시각 · 그 실행의 커밋 시각) — 11-02 · 11-03 호만(그 앞은 목록
      // 범위 밖 = 값 없음). 커밋 시각은 그 호를 발행한 실행이 받은 main 끝(수집 전)
      deploys: [
        { at: "2026-11-01T23:02:00Z", commitAt: "2026-11-01T14:00:00Z" },
        { at: "2026-11-02T22:16:00Z", commitAt: "2026-11-02T13:00:00Z" },
      ],
    }),
  },
  {
    slot: "status-empty",
    caption: "빈 데이터",
    detail: "실행 기록 0건 — 숫자판 대시 · 비용 0 윤곽 · 안내 문장",
    view: buildStatusView({
      prodRuns: [],
      devRuns: [],
      asOf: AS_OF,
      monthlyBudget: 3,
      sources: CONFIG,
    }),
  },
  {
    slot: "status-all-failed",
    caption: "모두 실패",
    detail: "성공률 0.0 윤곽 · 마지막 발행 없음",
    view: buildStatusView({
      prodRuns: [
        run({
          startedAt: "2026-11-02T22:10:00.000Z",
          finishedAt: "2026-11-02T22:12:00.000Z",
          status: "failed",
          sources: SOURCES.map((s) => ({ ...s, ok: false, items: 0 })),
        }),
      ],
      devRuns: [],
      asOf: AS_OF,
      monthlyBudget: 3,
      sources: CONFIG,
    }),
  },
] as const;

function Frame({
  caption,
  detail,
  slot,
  children,
}: {
  caption: string;
  detail: string;
  slot: string;
  children: ReactNode;
}) {
  return (
    <figure
      data-specimen={slot}
      className="m-0 min-w-0 border border-rule p-3.5"
    >
      <figcaption className="mb-3 text-[12.5px] leading-normal text-ink-2">
        <b className="mr-1 font-extrabold text-ink">{caption}</b>
        {detail}
      </figcaption>
      {children}
    </figure>
  );
}

export default function SpecimenStatusPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-page px-edge py-8">
      <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">
        발행 상태 견본
      </h1>
      <div className="mt-6 grid gap-8">
        {VARIANTS.map((v) => (
          <Frame
            key={v.slot}
            caption={v.caption}
            detail={v.detail}
            slot={v.slot}
          >
            <StatusBody view={v.view} id={v.slot} headingAs="h2" />
          </Frame>
        ))}
      </div>
    </main>
  );
}
