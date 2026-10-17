/**
 * 실행 이슈 사건 (M1-27 — FR-151·FR-152) — 부분 실패 사유(pipeline-partial)·데이터 API 소스 이슈(source-broken)·실패 단계별 원인 키.
 * 순수 함수(scripts/lib/run-issues.ts)와 이슈 템플릿(scripts/lib/github-issues.ts)을 본다. 수집 실행과의 연결은
 * tests/collect-slice.test.ts·collect-matchdata.test.ts, 워크플로 단계는 tests/collect-workflow.test.ts.
 */
import { describe, expect, it } from "vitest";

import {
  PIPELINE_PARTIAL_REASONS,
  PipelinePartialPayloadSchema,
  SourceBrokenPayloadSchema,
  buildComment,
  buildIssue,
  defaultIssueKey,
  extractFingerprints,
  issueFingerprint,
  type IssuePayloadInput,
} from "../scripts/lib/github-issues";
import {
  issueErrorType,
  matchDataIssuePayloads,
  partialFindings,
  partialIssuePayloads,
  type PartialFindingsInput,
} from "../scripts/lib/run-issues";

const CLEAN: PartialFindingsInput = {
  purge: { errors: [] },
  news: { seen: { readError: null, writeError: null }, clusterError: null },
  brief: { state: "done" },
  briefFile: { action: "written", readError: null, error: null },
  ledger: { applied: { errors: [] }, invalid: [] },
};

const CTX = {
  workflow: "collect",
  runId: "collect-prod-20261016T213000Z-3fa2",
  publishDate: "2026-10-17",
  occurredAt: "2026-10-16T21:41:00.000Z",
  runUrl: "https://github.com/sguys99/euro-digest/actions/runs/42",
};

describe("partialFindings — 수집 단계 안에서 실패했지만 실행은 계속된 단계 오류(사유별)", () => {
  it("문제가 없으면 사유 없음 — 소스 일부 실패·API-Football 미완·예산 초과 예상은 부분 실패 이슈가 아니다", () => {
    expect(partialFindings(CLEAN)).toEqual([]);
    expect(
      partialFindings({
        ...CLEAN,
        brief: {
          state: "skipped",
          reason: "budget",
          budget: { verdict: "monthly_exceeded", message: "월 예산 초과 예상" },
        },
      }),
    ).toEqual([]);
    // 데이터 API 실패로 브리핑이 실패한 것은 source:football-data가 맡는다(같은 원인 이슈 둘 방지)
    expect(
      partialFindings({
        ...CLEAN,
        brief: { state: "failed", reason: "football-data", detail: "HTTP 503" },
      }),
    ).toEqual([]);
    expect(
      partialFindings({ ...CLEAN, purge: null, briefFile: null, ledger: null }),
    ).toEqual([]);
  });

  it("사유마다 하나 — 사유 목록 순서(purge → seen → cluster → brief → brief-file → runs-unreadable → ledger), 오류 요약 한 줄", () => {
    const findings = partialFindings({
      purge: {
        errors: [
          {
            step: "write",
            date: "2026-10-15",
            error: "EACCES: permission denied",
          },
          { step: "write", date: "2026-10-16", error: "EACCES" },
        ],
      },
      news: {
        seen: {
          readError: "seen-urls.json: JSON 파싱 실패",
          writeError: "ENOSPC",
        },
        clusterError: "RangeError: Maximum call stack\n  at cluster.ts:12",
      },
      brief: { state: "failed", reason: "llm", detail: "HTTP 529 overloaded" },
      briefFile: {
        action: "failed",
        readError: "깨진 파일",
        error: "스키마 검증 실패",
      },
      ledger: {
        applied: { errors: ["2026-10.json: EACCES"] },
        invalid: [{ id: 1635665, error: "kickoff 형식" }],
      },
    });
    expect(findings.map((f) => f.reason)).toEqual([
      "purge",
      "seen",
      "cluster",
      "brief",
      "brief-file",
      "ledger",
    ]);
    expect(findings.map((f) => f.detail)).toEqual([
      "write(2026-10-15): EACCES: permission denied (외 1건)",
      "읽기: seen-urls.json: JSON 파싱 실패 · 쓰기: ENOSPC",
      "RangeError: Maximum call stack at cluster.ts:12",
      "llm: HTTP 529 overloaded",
      "쓰기·검증: 스키마 검증 실패 · 기존 파일 읽기: 깨진 파일",
      "쓰기: 2026-10.json: EACCES · 형식 오류 경기 1건(첫 경기 1635665: kickoff 형식)",
    ]);
    expect(findings.every((f) => !f.detail.includes("\n"))).toBe(true);
  });

  it("runs 파일을 읽지 못한 비용 가드(M1-22 이월) → runs-unreadable", () => {
    expect(
      partialFindings({
        ...CLEAN,
        brief: {
          state: "skipped",
          reason: "budget",
          budget: {
            verdict: "runs_unreadable",
            message: "runs-dev.json: 스키마 검증 실패 — LLM 없이 진행",
          },
        },
      }),
    ).toEqual([
      {
        reason: "runs-unreadable",
        detail: "runs-dev.json: 스키마 검증 실패 — LLM 없이 진행",
      },
    ]);
  });

  it("긴 오류는 300자로 자른다", () => {
    const [finding] = partialFindings({
      ...CLEAN,
      news: { ...CLEAN.news, clusterError: "x".repeat(1000) },
    });
    expect(finding!.detail).toHaveLength(300);
    expect(finding!.detail.endsWith("…")).toBe(true);
  });
});

describe("pipeline-partial 이슈 — 사유별 이슈 하나, 같은 사유는 댓글(FR-152)", () => {
  const [payload] = partialIssuePayloads(
    [{ reason: "purge", detail: "write(2026-10-15): EACCES" }],
    CTX,
  );

  it("payload는 스키마를 통과하고 원인 키는 collect:partial:<사유> — 사유가 다르면 다른 이슈, 실패 이슈와도 다르다", () => {
    expect(PipelinePartialPayloadSchema.parse(payload)).toEqual(payload);
    expect(defaultIssueKey("pipeline-partial", payload!)).toBe(
      "collect:partial:purge",
    );
    const keys = PIPELINE_PARTIAL_REASONS.map((reason) =>
      defaultIssueKey("pipeline-partial", { ...payload!, reason }),
    );
    expect(new Set(keys).size).toBe(PIPELINE_PARTIAL_REASONS.length);
    expect(issueFingerprint("pipeline-partial", "collect:collect")).not.toBe(
      issueFingerprint("pipeline-failure", "collect:collect"),
    );
  });

  it("새 이슈: 제목에 사유·발행일, 라벨 pipeline-failure(기존 라벨), 본문에 실행·실행 ID·영향·확인할 것, 끝에 마커", () => {
    const built = buildIssue("pipeline-partial", payload!);
    expect(built.title).toBe(
      "[collect 부분 실패] data 원본 삭제 단계 오류 — 2026-10-17",
    );
    // 셸 폴백("[collect]"로 시작하는 열린 이슈에 댓글)이 부분 실패 이슈를 실패 이슈로 오인하지 않게
    expect(built.title.startsWith("[collect]")).toBe(false);
    expect(built.labels).toEqual(["pipeline-failure"]);
    expect(built.key).toBe("collect:partial:purge");
    expect(built.body).toContain(
      "| 실행 | [실행 42](https://github.com/sguys99/euro-digest/actions/runs/42) |",
    );
    expect(built.body).toContain(
      "| 실행 ID | `collect-prod-20261016T213000Z-3fa2` |",
    );
    expect(built.body).toContain("| 오류 | `write(2026-10-15): EACCES` |");
    expect(built.body).toContain("### 확인할 것");
    expect(built.body).toContain("72시간");
    expect(extractFingerprints(built.body)).toEqual([built.fingerprint]);
  });

  it("모든 사유에 제목·영향·확인할 것 문구가 있다", () => {
    for (const reason of PIPELINE_PARTIAL_REASONS) {
      const built = buildIssue("pipeline-partial", { ...payload!, reason });
      expect([reason, built.title.includes("undefined")]).toEqual([
        reason,
        false,
      ]);
      expect(built.body).toContain("- [ ] ");
      // 발행 여부는 수집 단계가 모른다(검증·빌드·커밋이 뒤에 있다) — 발행했다고 쓰지 않는다(M1-27 리뷰 권장 5)
      expect([
        reason,
        /발행했습니다|발행을 마쳤|게시했습니다|정상 발행/.test(built.body),
      ]).toEqual([reason, false]);
      expect(built.body).toContain("이번 실행이 발행됐는지는 실행 링크");
    }
  });

  it("댓글: 다시 발생 · 실행 · 사유 · 오류, 끝에 재발 마커", () => {
    const comment = buildComment("pipeline-partial", payload!, {
      occurrence: 3,
    });
    expect(comment).toContain("### 다시 발생 — ");
    expect(comment).toContain("3번째");
    expect(comment).toContain("- 사유: data 원본 삭제 단계 오류 (`purge`)");
    expect(comment).toContain("- 오류: `write(2026-10-15): EACCES`");
    expect(comment.trimEnd()).toMatch(
      /<!-- euro-digest:recurrence=[0-9a-f]{12} -->$/,
    );
  });

  it("모르는 사유·여분 필드는 payload 오류", () => {
    expect(
      PipelinePartialPayloadSchema.safeParse({ ...payload, reason: "sources" })
        .success,
    ).toBe(false);
    expect(
      PipelinePartialPayloadSchema.safeParse({ ...payload, token: "x" })
        .success,
    ).toBe(false);
  });
});

describe("pipeline-failure 원인 키 — 실패 job + 멈춘 단계(M1-26 이월)", () => {
  const base: IssuePayloadInput<"pipeline-failure"> = {
    workflow: "collect",
    failedJobs: ["collect"],
    jobs: [
      { job: "guard", result: "success" },
      {
        job: "collect",
        result: "failure",
        step: "validate",
        note: "검증 게이트 실패",
      },
      { job: "deploy", result: "skipped" },
    ],
    occurredAt: CTX.occurredAt,
  };

  it("단계가 있으면 collect:collect/<step>, 제목·실패 job 표기도 같다 — 단계가 없으면 예전 키(collect:collect)", () => {
    expect(defaultIssueKey("pipeline-failure", base)).toBe(
      "collect:collect/validate",
    );
    const built = buildIssue("pipeline-failure", base);
    expect(built.title).toBe(
      "[collect] 일일 수집 실패 (collect/validate) — 2026-10-17",
    );
    expect(built.body).toContain("| 실패 job | collect/validate |");
    expect(
      defaultIssueKey("pipeline-failure", {
        ...base,
        jobs: base.jobs!.map((j) => ({ job: j.job, result: j.result })),
      }),
    ).toBe("collect:collect");
    for (const step of ["build", "commit"]) {
      expect(
        defaultIssueKey("pipeline-failure", {
          ...base,
          jobs: [{ job: "collect", result: "failure", step }],
        }),
      ).toBe(`collect:collect/${step}`);
    }
    // guard·deploy 실패는 job 단위(단계 출력 없음)
    expect(
      defaultIssueKey("pipeline-failure", {
        ...base,
        failedJobs: ["deploy"],
        jobs: [{ job: "deploy", result: "failure" }],
      }),
    ).toBe("collect:deploy");
  });

  it("단계 id 형식이 아니면 payload 오류", () => {
    expect(() =>
      buildIssue("pipeline-failure", {
        ...base,
        jobs: [{ job: "collect", result: "failure", step: "Validate Gate" }],
      }),
    ).toThrow(/step/);
  });
});

describe("데이터 API 소스 이슈 — source:football-data·source:api-football (M1-27)", () => {
  const ctx = {
    occurredAt: CTX.occurredAt,
    runId: CTX.runId,
    runUrl: CTX.runUrl,
  };
  const fdDone = (
    standingsFailed: Array<{ comp: string; errorType: string; error: string }>,
  ) => ({
    provider: "football-data" as const,
    state: "done" as const,
    data: { standingsFailed },
    elapsedMs: 1,
  });

  it("football-data 단계 실패 → 소스 이슈 하나(오류 종류·요약), 스키마 통과, 원인 키 source:football-data", () => {
    const payloads = matchDataIssuePayloads(
      {
        footballData: {
          provider: "football-data",
          state: "failed",
          errorType: "http",
          error: "HTTP 503 /v4/matches",
          elapsedMs: 10,
        },
      },
      ctx,
    );
    expect(payloads).toHaveLength(1);
    const payload = SourceBrokenPayloadSchema.parse(payloads[0]);
    expect(payload).toMatchObject({
      sourceId: "football-data",
      sourceName: "football-data.org",
      symptoms: ["기타"],
      errorType: "http",
      error: "HTTP 503 /v4/matches",
      runId: CTX.runId,
      runUrl: CTX.runUrl,
    });
    expect(defaultIssueKey("source-broken", payloads[0]!)).toBe(
      "source:football-data",
    );
  });

  it("키 없음(prod Secrets 미설정)·순위 일부 실패도 같은 키 — 시간 예산·취소는 이슈가 아니다", () => {
    const noKey = matchDataIssuePayloads(
      {
        footballData: {
          provider: "football-data",
          state: "skipped",
          reason: "no-api-key",
          elapsedMs: 0,
        },
      },
      ctx,
    );
    expect(noKey.map((p) => [p.sourceId, p.errorType])).toEqual([
      ["football-data", "no-api-key"],
    ]);
    const standings = matchDataIssuePayloads(
      {
        footballData: fdDone([
          { comp: "PL", errorType: "timeout", error: "15초 초과" },
          { comp: "PD", errorType: "budget", error: "단계 예산" },
          { comp: "SA", errorType: "http", error: "HTTP 500" },
        ]),
      },
      ctx,
    );
    expect(standings.map((p) => [p.errorType, p.error])).toEqual([
      ["standings", "순위 2개 대회 실패(PL, SA) — timeout: 15초 초과"],
    ]);
    for (const errorType of ["budget", "cancelled"]) {
      expect(
        matchDataIssuePayloads(
          {
            footballData: {
              provider: "football-data",
              state: "failed",
              errorType,
              error: "x",
              elapsedMs: 1,
            },
            apiFootball: {
              provider: "api-football",
              state: "failed",
              errorType,
              error: "x",
              elapsedMs: 1,
            },
          },
          ctx,
        ),
      ).toEqual([]);
    }
    expect(matchDataIssuePayloads({ footballData: fdDone([]) }, ctx)).toEqual(
      [],
    );
    expect(matchDataIssuePayloads(null, ctx)).toEqual([]);
  });

  it("API-Football 단계의 예상 밖 실패 → source:api-football(응답 사건은 기존 경로) — 건너뜀·완료는 여기서 내지 않는다", () => {
    const payloads = matchDataIssuePayloads(
      {
        apiFootball: {
          provider: "api-football",
          state: "failed",
          errorType: "unexpected",
          error: "API_FOOTBALL_MAX_CALLS는 양의 정수",
          elapsedMs: 1,
        },
      },
      ctx,
    );
    expect(payloads.map((p) => [p.sourceId, p.errorType])).toEqual([
      ["api-football", "unexpected"],
    ]);
    expect(
      matchDataIssuePayloads(
        {
          apiFootball: {
            provider: "api-football",
            state: "skipped",
            reason: "no-api-key",
            elapsedMs: 0,
          },
        },
        ctx,
      ),
    ).toEqual([]);
  });

  it("issueErrorType: 이슈 스키마 형식(소문자·숫자·하이픈 40자)으로, 못 바꾸면 unexpected", () => {
    expect(issueErrorType("HTTP")).toBe("http");
    expect(issueErrorType("Rate Limit!")).toBe("rate-limit");
    expect(issueErrorType("---")).toBe("unexpected");
    expect(issueErrorType("a".repeat(60))).toHaveLength(40);
  });
});
