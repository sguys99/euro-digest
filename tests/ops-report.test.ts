/**
 * 주간 운영 리포트 payload (M5-09 — scripts/lib/ops-report.ts, PRD FR-155)
 * 주차 변환 · 집계 구간(KST 주) · 같은 주 제목·키 · 빈 데이터 · dev 50% 경고 · 일요일 고정(재실행 동일) · 소스 건강도 · 미등록 고유명사 ·
 * 본문 스냅숏(W44 서머타임 전환 직후 주)
 */
import { describe, expect, it } from "vitest";

import { buildIssue, OPS_REPORT_SECTIONS } from "../scripts/lib/github-issues";
import {
  buildOpsReportPayload,
  opsIssueWeek,
  opsReportWindow,
  parseOpsReportArgs,
  sourceHealthAsOf,
  type OpsBriefDay,
  type OpsReportInput,
} from "../scripts/lib/ops-report";

import type { BriefFile } from "@/lib/schema/brief";
import type { UnknownNamesFile } from "@/lib/schema/cache";
import type { RunLog, RunSource } from "@/lib/schema/run";

const NOW = new Date("2026-11-01T23:05:00.000Z"); // 11-02(월) 08:05 KST — 정기 주간 작업

/** 테스트용 실행 기록 — runId는 job·env·시작 시각에서 결정적으로(같은 입력을 두 번 만들어도 같은 값) */
function run(over: Partial<RunLog>): RunLog {
  const job = over.job ?? "collect";
  const env = over.env ?? "prod";
  const startedAt = over.startedAt ?? "2026-10-27T22:10:00.000Z";
  return {
    runId: `${job}-${env}-${startedAt.replace(/[-:.]/g, "")}`,
    env,
    job,
    startedAt,
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

const fresh = (id: string, usable = 5): RunSource => ({
  id,
  ok: true,
  items: 20,
  usable,
});
const noNew = (id: string): RunSource => ({
  id,
  ok: true,
  items: 20,
  usable: 0,
});
const failed = (id: string, error = "http-5xx"): RunSource => ({
  id,
  ok: false,
  items: 0,
  error,
});

/** W44(10-26 ~ 11-01 KST, 겨울 07:30 공개) 하루 — 정시 수집(07:10 시작 · 07:14 완료) */
function dailyRun(
  date: string,
  sources: RunSource[],
  over: Partial<RunLog> = {},
): RunLog {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  const ymd = prev.toISOString().slice(0, 10);
  return run({
    startedAt: `${ymd}T22:10:00.000Z`,
    finishedAt: `${ymd}T22:14:00.000Z`,
    costUsd: 0.003,
    brief: { requests: 1 },
    sources,
    ...over,
  });
}

function prodRunsW44(): RunLog[] {
  const src = (gamma: RunSource, beta: RunSource = fresh("beta")) => [
    fresh("alpha"),
    beta,
    gamma,
  ];
  return [
    // 앞 주 — 연속 횟수의 이력으로만 쓰인다
    dailyRun("2026-10-25", src(fresh("gamma"), noNew("beta")), {
      startedAt: "2026-10-24T21:30:00.000Z",
      finishedAt: "2026-10-24T21:34:00.000Z",
    }),
    // 10-26 결호(실행 없음)
    // 10-27 — 정시 실행 실패(D49 보존 기록) → 낮에 재실행(늦음)
    dailyRun("2026-10-27", src(failed("gamma"), noNew("beta")), {
      status: "failed",
      costUsd: 0.001,
      brief: { requests: 0 },
    }),
    run({
      startedAt: "2026-10-27T01:30:00.000Z",
      finishedAt: "2026-10-27T01:36:00.000Z",
      costUsd: 0.004,
      status: "partial",
      brief: {
        requests: 1,
        unbilledRisk: {
          requests: 1,
          inputTokens: 3000,
          outputTokensMax: 16384,
          usdMax: 0.0085,
        },
      },
      sources: [fresh("alpha"), noNew("beta"), fresh("gamma")],
    }),
    dailyRun("2026-10-28", src(fresh("gamma"), noNew("beta"))),
    dailyRun("2026-10-29", src(fresh("gamma"))),
    dailyRun("2026-10-30", src(fresh("gamma"))),
    dailyRun("2026-10-31", src(failed("gamma", "timeout"))),
    // dry 기록(skipped) — 성공률·발행일에서 빠진다
    dailyRun("2026-10-31", src(fresh("gamma")), {
      startedAt: "2026-10-31T05:00:00.000Z",
      finishedAt: "2026-10-31T05:03:00.000Z",
      status: "skipped",
      costUsd: 0,
      brief: { requests: 0 },
    }),
    dailyRun("2026-11-01", src(failed("gamma", "timeout"), noNew("beta"))),
    // 주간 작업(월 08:00 KST — 앞 주 리포트를 만든 실행)
    run({
      runId: "weekly-prod-t1",
      job: "weekly",
      startedAt: "2026-10-25T23:00:00.000Z",
      finishedAt: "2026-10-25T23:05:00.000Z",
      costUsd: 0.02,
    }),
  ];
}

/** 일요일 뒤에 시작한 실행 — 리포트에 들어가지 않아야 한다 */
function afterAsOf(): RunLog[] {
  return [
    dailyRun("2026-11-02", [fresh("alpha"), failed("beta"), failed("gamma")], {
      costUsd: 2,
      status: "failed",
    }),
    run({
      runId: "weekly-prod-t2",
      job: "weekly",
      startedAt: "2026-11-01T23:05:00.000Z",
      finishedAt: "2026-11-01T23:09:00.000Z",
      costUsd: 0.03,
    }),
  ];
}

function devRuns(costUsd: number): RunLog[] {
  return [
    run({
      runId: "collect-dev-t1",
      env: "dev",
      startedAt: "2026-10-28T03:00:00.000Z",
      finishedAt: "2026-10-28T03:02:00.000Z",
      costUsd,
    }),
  ];
}

const line = (ai: boolean, n: number) => ({
  text: `줄 ${n}`,
  ai,
  refs: [`m${100 + n}`],
});

function brief(date: string, over: Partial<BriefFile>): BriefFile {
  return {
    date,
    generatedAt: "2026-10-27T22:13:00.000Z",
    runId: "collect-prod-x",
    mode: "llm",
    lines: [1, 2, 3, 4, 5].map((n) => line(true, n)),
    ...over,
  };
}

function briefsW44(): OpsBriefDay[] {
  return [
    // 10-26 파일 없음(배열에 없음)
    { date: "2026-10-27", brief: brief("2026-10-27", {}), error: null },
    {
      date: "2026-10-28",
      brief: brief("2026-10-28", {
        mode: "mixed",
        lines: [line(true, 1), line(true, 2), line(false, 3)],
      }),
      error: null,
    },
    {
      date: "2026-10-29",
      brief: brief("2026-10-29", {
        mode: "template",
        lines: [line(false, 1), line(false, 2)],
      }),
      error: null,
    },
    {
      date: "2026-10-30",
      brief: brief("2026-10-30", { mode: "empty", lines: [] }),
      error: null,
    },
    {
      date: "2026-10-31",
      brief: brief("2026-10-31", {
        mode: "empty",
        emptyReason: "results-pending",
        lines: [],
      }),
      error: null,
    },
    {
      date: "2026-11-01",
      brief: null,
      error: "data/briefs/2026-11-01.json: JSON을 읽을 수 없음",
    },
  ];
}

function namesFile(): UnknownNamesFile {
  return {
    updatedAt: "2026-11-02T22:20:00.000Z",
    names: {
      "Old Name": {
        count: 9,
        firstSeen: "2026-10-20T22:10:00.000Z",
        lastSeen: "2026-10-30T22:10:00.000Z",
        kind: "player",
        cards: [],
      },
      "Pipe|Name `x` @who": {
        count: 3,
        firstSeen: "2026-10-28T22:11:00.000Z",
        lastSeen: "2026-10-31T22:11:00.000Z",
        kind: "team",
        cards: [],
      },
      Newcomer: {
        count: 1,
        firstSeen: "2026-10-29T22:11:00.000Z",
        lastSeen: "2026-10-29T22:11:00.000Z",
        cards: [],
      },
      // 일요일 뒤에 처음 본 이름 — 빠진다
      Later: {
        count: 7,
        firstSeen: "2026-11-02T22:11:00.000Z",
        lastSeen: "2026-11-02T22:11:00.000Z",
        cards: [],
      },
    },
  };
}

function inputW44(over: Partial<OpsReportInput> = {}): OpsReportInput {
  return {
    week: "2026-44",
    prodRuns: prodRunsW44(),
    devRuns: devRuns(0.05),
    briefs: briefsW44(),
    unknownNames: { file: namesFile(), error: null },
    monthlyBudget: 3,
    now: NOW,
    ...over,
  };
}

function sectionOf(
  report: ReturnType<typeof buildOpsReportPayload>,
  heading: string,
): string {
  const s = report.payload.sections?.find((x) => x.heading === heading);
  if (!s) throw new Error(`섹션 없음: ${heading}`);
  return s.body;
}

describe("주차·구간", () => {
  it("주간 작업 주차 YYYY-WW → 이슈 주차 YYYY-Www", () => {
    expect(opsIssueWeek("2026-44")).toBe("2026-W44");
    expect(opsIssueWeek("2026-01")).toBe("2026-W01");
    expect(() => opsIssueWeek("2026-W44")).toThrow(RangeError);
  });

  it("KST 월 00:00 ~ 일 23:59:59.999 — W43(여름 마지막 날 포함) · W44 · 연말 W53", () => {
    expect(opsReportWindow("2026-43")).toMatchObject({
      issueWeek: "2026-W43",
      from: "2026-10-19",
      to: "2026-10-25",
      span: {
        from: "2026-10-18T15:00:00.000Z",
        to: "2026-10-25T14:59:59.999Z",
      },
      asOf: "2026-10-25T14:59:59.999Z",
    });
    expect(opsReportWindow("2026-44")).toMatchObject({
      from: "2026-10-26",
      to: "2026-11-01",
    });
    expect(opsReportWindow("2026-53")).toMatchObject({
      from: "2026-12-28",
      to: "2027-01-03",
    });
  });

  it("CLI 인자 — --week 형식, --dry", () => {
    expect(parseOpsReportArgs(["--week", "2026-44", "--dry"])).toEqual({
      ok: true,
      value: { week: "2026-44", dry: true, help: false },
    });
    expect(parseOpsReportArgs([])).toEqual({
      ok: true,
      value: { week: null, dry: false, help: false },
    });
    expect(parseOpsReportArgs(["--week", "2026-W44"]).ok).toBe(false);
    expect(parseOpsReportArgs(["--force"]).ok).toBe(false);
  });
});

describe("buildOpsReportPayload", () => {
  it("payload — 주차·기간·섹션 순서, 같은 주차는 같은 제목·키(재생성 = 같은 이슈)", () => {
    const a = buildOpsReportPayload(inputW44());
    expect(a.payload).toMatchObject({
      week: "2026-W44",
      from: "2026-10-26",
      to: "2026-11-01",
      occurredAt: "2026-11-01T23:05:00.000Z",
    });
    expect(a.payload.sections?.map((s) => s.heading)).toEqual([
      ...OPS_REPORT_SECTIONS,
    ]);
    const b = buildOpsReportPayload(
      inputW44({ now: new Date("2026-11-03T09:00:00.000Z") }),
    );
    const ia = buildIssue("ops-report", a.payload);
    const ib = buildIssue("ops-report", b.payload);
    expect(ia.title).toBe("[운영 리포트] 2026-W44 (2026-10-26 ~ 2026-11-01)");
    expect(ib.title).toBe(ia.title);
    expect(ib.fingerprint).toBe(ia.fingerprint);
    expect(ia.labels).toEqual(["ops-report"]);
  });

  it("일요일 고정 — 그 뒤 실행·이름이 늘어도 수치가 같다", () => {
    const base = buildOpsReportPayload(inputW44());
    const later = buildOpsReportPayload(
      inputW44({ prodRuns: [...prodRunsW44(), ...afterAsOf()] }),
    );
    expect(later.payload.sections).toEqual(base.payload.sections);
    expect(later.counts).toEqual(base.counts);
  });

  it("발행·성공률 — 결호 1 · 늦음 1 · 정시 5, 실행 기준 성공률(dry 제외)", () => {
    const r = buildOpsReportPayload(inputW44());
    expect(r.counts).toMatchObject({
      ontime: 5,
      late: 1,
      missed: 1,
      failed: 0,
      collectRuns: 7,
      collectOk: 6,
    });
    const runs = sectionOf(r, "실행 성공률");
    expect(runs).toContain(
      "- 일일 수집(collect): 7회 — 성공 5 · 부분 성공 1 · 실패 1 → 성공률 85.7% (6/7)",
    );
    expect(runs).toContain(
      "| 10.27 (화) | 제 16호 | 겨울 | 07:30 | 10:36 | 늦음 | 2 (실패 1) |",
    );
    expect(runs).toContain(
      "| 10.26 (월) | 제 15호 | 겨울 | 07:30 | — | 결호 | 0 |",
    );
  });

  it("빈 데이터 — 실행·브리핑·이름이 없어도 만든다(결호 7 · 소스 기록 없음)", () => {
    const r = buildOpsReportPayload(
      inputW44({
        prodRuns: [],
        devRuns: [],
        briefs: [],
        unknownNames: { file: null, error: null },
      }),
    );
    expect(r.counts).toMatchObject({ missed: 7, collectRuns: 0, sources: 0 });
    expect(sectionOf(r, "요약")).toContain("- 수집 실행 성공률: 실행 없음");
    expect(sectionOf(r, "소스 건강도")).toBe(
      "_이 주에 수집 실행 기록이 없습니다._",
    );
    expect(sectionOf(r, "미등록 고유명사")).toBe(
      "_미등록 고유명사가 없습니다._",
    );
    expect(sectionOf(r, "브리핑")).toContain("파일 없음 7");
    expect(sectionOf(r, "비용")).toContain("| 합계 | $0.000000 |");
  });

  it("dev 50% 경고 — 넘으면 요약 맨 위와 비용 섹션에, 50% 정확히는 경고 없음", () => {
    const over = buildOpsReportPayload(inputW44({ devRuns: devRuns(1.6) }));
    const summary = sectionOf(over, "요약");
    expect(
      summary.startsWith(
        "> **경고**: 2026-10(KST) dev LLM 사용이 월 예산의 53.3%",
      ),
    ).toBe(true);
    expect(sectionOf(over, "비용")).toContain("(50% 초과)");
    expect(over.counts.devAlerts).toBe(1);
    const exact = buildOpsReportPayload(inputW44({ devRuns: devRuns(1.5) }));
    expect(sectionOf(exact, "요약")).not.toContain("경고");
    expect(exact.counts.devAlerts).toBe(0);
  });

  it("비용 — 이 주(KST) 합 · job별 · 걸친 달 누적 · unbilledRisk는 합계에 넣지 않음", () => {
    const cost = sectionOf(buildOpsReportPayload(inputW44()), "비용");
    // prod collect: 실패 0.001 + 재실행 0.004 + 10-28~11-01 정시 5 × 0.003(dry 0) = 0.020 · dev 0.05 · weekly 0.02(10-26 08:00 KST)
    expect(cost).toContain("| prod (봇) | $0.040000 |");
    expect(cost).toContain("| 그중 일일 수집 (collect) | $0.070000 |");
    expect(cost).toContain("| 합계 | $0.090000 |");
    expect(cost).toContain("| 그중 주간 작업 (weekly) | $0.020000 |");
    expect(cost).toContain("| 2026-10 | 월 전체 |");
    expect(cost).toContain("| 2026-11 | 11-01까지 |");
    expect(cost).toContain(
      "과금 여부를 모르는 끊긴 브리핑 요청(unbilledRisk): 1건 · 최대 $0.008500",
    );
  });

  it("브리핑 — mode(empty는 이유별)·줄·요청", () => {
    const b = sectionOf(buildOpsReportPayload(inputW44()), "브리핑");
    expect(b).toContain(
      "- 게시 mode: LLM 1 · 혼합 1 · 템플릿 1 · 경기 없음 1 · 결과 지연 1 · 파일 없음 1 · 읽기 실패 1",
    );
    expect(b).toContain("- 게시 줄: AI 작성 7 · 템플릿 3 (AI 70.0%)");
    expect(b).toContain("| 10.27 (화) | LLM | 5 | 0 | 1 |");
    expect(b).toContain("| 11.01 (일) | 읽기 실패 | 0 | 0 | 1 |");
  });

  it("미등록 고유명사 — 이 주 처음 본 이름(횟수순), 일요일 뒤는 빠짐, 표 칸 이스케이프", () => {
    const r = buildOpsReportPayload(inputW44());
    const n = sectionOf(r, "미등록 고유명사");
    expect(n).toContain("누적 3개");
    expect(n).toContain("이 주 새로 2개");
    expect(n).not.toContain("Later");
    expect(n).not.toContain("Old Name");
    expect(n).toContain("| Pipe\\|Name 'x' @who | team | 3 | 10.29 (목) |");
    expect(n.indexOf("Pipe")).toBeLessThan(n.indexOf("Newcomer"));
    expect(r.counts.namesNew).toBe(2);
    // 이슈 본문에서는 멘션이 끊긴다(buildIssue)
    expect(buildIssue("ops-report", r.payload).body).not.toMatch(/@who/);
  });

  it("미등록 고유명사 — 이 주 새 이름이 없으면 누적 상위, 파일 오류는 사유", () => {
    const quiet = buildOpsReportPayload(
      inputW44({
        unknownNames: {
          file: {
            updatedAt: "2026-10-21T00:00:00.000Z",
            names: { "Old Name": namesFile().names["Old Name"]! },
          },
          error: null,
        },
      }),
    );
    expect(sectionOf(quiet, "미등록 고유명사")).toContain("누적 상위");
    const broken = buildOpsReportPayload(
      inputW44({ unknownNames: { file: null, error: "JSON 파싱 실패" } }),
    );
    expect(sectionOf(broken, "미등록 고유명사")).toContain(
      "읽지 못했습니다: JSON 파싱 실패",
    );
    expect(sectionOf(broken, "요약")).toContain("파일을 읽지 못함");
  });

  it("본문 스냅숏 (W44)", async () => {
    const r = buildOpsReportPayload(inputW44({ devRuns: devRuns(1.6) }));
    const issue = buildIssue("ops-report", r.payload);
    await expect(`${issue.title}\n\n${issue.body}`).toMatchFileSnapshot(
      "./__snapshots__/ops-report-w44.md",
    );
  });
});

describe("sourceHealthAsOf — 그 주 마지막 수집 실행 기준", () => {
  it("연속은 이슈 판정과 같은 규칙, 7일은 월~일, 확인 필요가 앞", () => {
    const window = opsReportWindow("2026-44");
    const snap = sourceHealthAsOf(prodRunsW44(), window.span);
    expect(snap?.startedAt).toBe("2026-10-31T22:10:00.000Z"); // 11-01 실행(dry 기록 제외)
    // 확인 필요(gamma)가 앞, 나머지는 기준 실행의 소스 순서
    expect(snap?.rows.map((r) => [r.id, r.attention])).toEqual([
      ["gamma", true],
      ["alpha", false],
      ["beta", false],
    ]);
    const gamma = snap?.rows.find((r) => r.id === "gamma");
    // 연속: 11-01 실패 바로 앞이 10-31 낮 dry 기록(성공)이라 1회 — source-health.ts와 같이 dry 기록도 이력에 든다
    expect(gamma).toMatchObject({
      state: "failed",
      error: "timeout",
      failStreak: 1,
      event: "failed",
    });
    // 이 주 gamma 기록: 실패 · 성공(재실행) · 성공 ×3 · 실패 · 성공(dry) · 실패 → 시도 8, 성공 5
    expect(gamma?.week).toMatchObject({ attempts: 8, ok: 5 });
    // beta: 새 기사 없음 1회 연속 · 이 주 성공률 100% → 확인 필요 아님
    const beta = snap?.rows.find((r) => r.id === "beta");
    expect(beta).toMatchObject({
      state: "no-new",
      staleStreak: 1,
      event: null,
    });
  });

  it("새 기사 없음 3회 연속부터 확인 필요(이슈는 7회)", () => {
    const window = opsReportWindow("2026-44");
    const runs = ["2026-10-29", "2026-10-30", "2026-10-31"].map((d) =>
      dailyRun(d, [noNew("beta")]),
    );
    expect(sourceHealthAsOf(runs.slice(1), window.span)?.rows[0]).toMatchObject(
      {
        staleStreak: 2,
        attention: false,
      },
    );
    expect(sourceHealthAsOf(runs, window.span)?.rows[0]).toMatchObject({
      staleStreak: 3,
      attention: true,
      event: null,
    });
  });

  it("그 주에 수집 실행이 없으면 null", () => {
    expect(sourceHealthAsOf([], opsReportWindow("2026-44").span)).toBeNull();
  });
});
