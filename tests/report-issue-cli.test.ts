import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildIssue,
  defaultIssueKey,
  previewReport,
  type FetchLike,
  type IssuePayloadInput,
  type ReportResult,
} from "../scripts/lib/github-issues";
import {
  formatPreview,
  formatReportResult,
  formatReportSummary,
  parseNeedsJson,
  parseReportIssueArgs,
  pipelineFailurePayloadFromEnv,
  readReportEnv,
  resolveReportInput,
  resolveWorkflowName,
  type ReportIssueArgs,
} from "../scripts/lib/report-issue-cli";

const NOW = new Date("2026-10-10T21:41:00.000Z");

const NEEDS = JSON.stringify({
  guard: { result: "success", outputs: { run: "true", reason: "forced" } },
  collect: { result: "failure", outputs: { committed: "", sha: "" } },
  deploy: { result: "skipped", outputs: {} },
});

const ACTIONS_ENV = {
  GITHUB_SERVER_URL: "https://github.com",
  GITHUB_REPOSITORY: "sguys99/euro-digest",
  GITHUB_RUN_ID: "18000000001",
  GITHUB_RUN_ATTEMPT: "2",
  GITHUB_EVENT_NAME: "schedule",
  NEEDS_JSON: NEEDS,
};

function args(overrides: Partial<ReportIssueArgs> = {}): ReportIssueArgs {
  return {
    kind: "pipeline-failure",
    key: null,
    payloadFile: null,
    workflow: "collect",
    dryRun: false,
    help: false,
    ...overrides,
  };
}

describe("parseReportIssueArgs", () => {
  it("kind·key·payload-file·workflow·dry-run", () => {
    const r = parseReportIssueArgs([
      "--kind",
      "source-broken",
      "--key",
      "bbc-sport",
      "--payload-file",
      "p.json",
      "--dry-run",
    ]);
    expect(r).toEqual({
      ok: true,
      value: {
        kind: "source-broken",
        key: "bbc-sport",
        payloadFile: "p.json",
        workflow: null,
        dryRun: true,
        help: false,
      },
    });
  });

  it.each([
    [[], "--kind가 필요합니다"],
    [["--kind", "takedown"], "--kind는"],
    [["--kind", "pipeline-failure", "--key", " "], "--key가 비어 있습니다"],
    [["--kind", "pipeline-failure", "--bogus"], "bogus"],
    [["--kind", "pipeline-failure", "extra"], "extra"],
  ])("오류: %j", (argv, message) => {
    const r = parseReportIssueArgs(argv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(message);
  });

  it("--help는 kind 없이 통과", () => {
    const r = parseReportIssueArgs(["-h"]);
    expect(r.ok && r.value.help).toBe(true);
  });
});

describe("Actions 환경변수 → pipeline-failure payload", () => {
  it("needs 결과에서 실패 job·job 표(guard reason)·실행 URL·시도·트리거를 만든다", () => {
    const r = pipelineFailurePayloadFromEnv(ACTIONS_ENV, "collect", NOW);
    expect(r).toEqual({
      ok: true,
      value: {
        workflow: "collect",
        failedJobs: ["collect"],
        jobs: [
          { job: "guard", result: "success", note: "forced" },
          { job: "collect", result: "failure" },
          { job: "deploy", result: "skipped" },
        ],
        runUrl:
          "https://github.com/sguys99/euro-digest/actions/runs/18000000001",
        runAttempt: 2,
        event: "schedule",
        occurredAt: "2026-10-10T21:41:00.000Z",
      },
    });
    if (r.ok) {
      expect(defaultIssueKey("pipeline-failure", r.value)).toBe(
        "collect:collect",
      );
      // 커밋 SHA 같은 다른 출력은 이슈로 옮기지 않는다
      expect(JSON.stringify(r.value)).not.toContain("committed");
    }
  });

  it("guard가 실패하면 원인 키는 collect:guard, 실패 job이 없으면 collect:unknown", () => {
    const guardFail = pipelineFailurePayloadFromEnv(
      {
        NEEDS_JSON: JSON.stringify({
          guard: { result: "failure", outputs: {} },
          collect: { result: "skipped", outputs: {} },
          deploy: { result: "skipped", outputs: {} },
        }),
      },
      "collect",
      NOW,
    );
    expect(
      guardFail.ok && defaultIssueKey("pipeline-failure", guardFail.value),
    ).toBe("collect:guard");
    const none = pipelineFailurePayloadFromEnv({}, "collect", NOW);
    expect(none.ok && defaultIssueKey("pipeline-failure", none.value)).toBe(
      "collect:unknown",
    );
    // 실행 정보가 없으면 링크 없이 만든다
    expect(none.ok && "runUrl" in none.value).toBe(false);
  });

  it("parseNeedsJson: 빈 값은 [], JSON·형식 오류는 오류", () => {
    expect(parseNeedsJson(undefined)).toEqual({ ok: true, value: [] });
    expect(parseNeedsJson("{not json").ok).toBe(false);
    expect(parseNeedsJson('{"guard":"success"}').ok).toBe(false);
  });

  it("워크플로 이름: --workflow > GITHUB_WORKFLOW(표시 이름을 소문자로)", () => {
    expect(
      resolveWorkflowName("collect", { GITHUB_WORKFLOW: "Other" }),
    ).toEqual({
      ok: true,
      value: "collect",
    });
    expect(resolveWorkflowName(null, { GITHUB_WORKFLOW: "Collect" })).toEqual({
      ok: true,
      value: "collect",
    });
    expect(resolveWorkflowName(null, {}).ok).toBe(false);
  });
});

describe("resolveReportInput", () => {
  it("--payload-file 내용(JSON)을 그대로 payload로", () => {
    const r = resolveReportInput(
      args({ kind: "source-broken", key: "bbc-sport" }),
      {},
      '{"sourceId":"bbc-sport","symptoms":["파싱 실패"]}',
      NOW,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        kind: "source-broken",
        key: "bbc-sport",
        payload: { sourceId: "bbc-sport", symptoms: ["파싱 실패"] },
      },
    });
  });

  it("payload 파일이 JSON이 아니면 오류", () => {
    expect(resolveReportInput(args(), {}, "{", NOW).ok).toBe(false);
  });

  it("pipeline-failure 외에는 payload 파일이 필요", () => {
    const r = resolveReportInput(
      args({ kind: "source-health" }),
      ACTIONS_ENV,
      null,
      NOW,
    );
    expect(r.ok).toBe(false);
  });

  it("pipeline-failure는 환경변수로 payload를 만든다", () => {
    const r = resolveReportInput(args(), ACTIONS_ENV, null, NOW);
    expect(r.ok && r.value.payload).toMatchObject({ failedJobs: ["collect"] });
  });
});

describe("readReportEnv", () => {
  it("GITHUB_TOKEN을 우선, 없으면 GH_TOKEN", () => {
    expect(readReportEnv({ GITHUB_TOKEN: "a", GH_TOKEN: "b" }).token).toBe("a");
    expect(readReportEnv({ GH_TOKEN: "b" }).token).toBe("b");
    expect(readReportEnv({}).token).toBeUndefined();
  });
});

describe("출력 문구", () => {
  const payload = pipelineFailurePayloadFromEnv(ACTIONS_ENV, "collect", NOW);
  if (!payload.ok) throw new Error(payload.error);
  const p: IssuePayloadInput<"pipeline-failure"> = payload.value;

  it("dry-run(새 이슈)은 원인·라벨·제목·본문(마커 포함)을 보여 준다", async () => {
    const fetch: FetchLike = async () =>
      new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const preview = await previewReport({
      kind: "pipeline-failure",
      payload: p,
      repo: "sguys99/euro-digest",
      fetch,
      now: () => NOW,
    });
    const text = formatPreview(preview);
    expect(text).toContain(
      "dry-run — 새 이슈를 만들 예정 (같은 원인의 열린 이슈 없음",
    );
    expect(text).toContain("원인: collect:collect");
    expect(text).toContain("라벨: pipeline-failure");
    expect(text).toContain(
      "제목: [collect] 일일 수집 실패 (collect) — 2026-10-11",
    );
    expect(text).toContain(buildIssue("pipeline-failure", p).body);
  });

  it("dry-run(댓글)은 대상 이슈와 댓글 본문", () => {
    const text = formatPreview({
      action: "would-comment",
      lookup: "searched",
      number: 9,
      url: "https://github.com/sguys99/euro-digest/issues/9",
      comment: "### 다시 실패",
      fingerprint: "2b358f177d39",
      key: "collect:collect",
    });
    expect(text).toContain("열린 이슈 #9에 댓글을 남길 예정");
    expect(text).toContain("### 다시 실패");
  });

  it("결과 한 줄·Step Summary", () => {
    const result: ReportResult = {
      action: "commented",
      number: 9,
      url: "https://github.com/sguys99/euro-digest/issues/9",
      commentUrl:
        "https://github.com/sguys99/euro-digest/issues/9#issuecomment-1",
      fingerprint: "2b358f177d39",
      key: "collect:collect",
      occurrence: 3,
      deduped: false,
    };
    expect(formatReportResult(result)).toBe(
      "[report-issue] 열린 이슈 #9에 댓글 (3번째 발생) — https://github.com/sguys99/euro-digest/issues/9#issuecomment-1",
    );
    expect(formatReportSummary(result)).toContain(
      "- 열린 이슈 [#9](https://github.com/sguys99/euro-digest/issues/9#issuecomment-1)에 댓글 · 3번째 발생",
    );
    expect(
      formatReportResult({ ...result, action: "created", occurrence: 1 }),
    ).toBe(
      "[report-issue] 새 이슈 #9 생성 — https://github.com/sguys99/euro-digest/issues/9",
    );
  });
});

describe("collect.yml report-failure와의 연결", () => {
  const workflow = readFileSync(
    fileURLToPath(new URL("../.github/workflows/collect.yml", import.meta.url)),
    "utf8",
  );
  const job = workflow.slice(workflow.indexOf("\n  report-failure:"));

  it("이슈 헬퍼 CLI를 needs 결과와 함께 호출하고, 토큰은 env로만 넘긴다", () => {
    expect(job).toContain(
      "run: node --import tsx scripts/report-issue.ts --kind pipeline-failure --workflow collect",
    );
    expect(job).toContain("NEEDS_JSON: ${{ toJSON(needs) }}");
    expect(job).toContain("GITHUB_TOKEN: ${{ github.token }}");
    expect(job).toMatch(
      /permissions:\n {6}contents: read.*\n {6}issues: write/,
    );
    expect(job).toContain("run: npm ci");
  });

  it("헬퍼를 쓸 수 없을 때를 위한 셸 폴백이 마지막 단계에 있다", () => {
    const helper = job.indexOf("scripts/report-issue.ts");
    const fallback = job.indexOf("셸 폴백");
    expect(fallback).toBeGreaterThan(helper);
    expect(job.slice(fallback)).toMatch(/if: failure\(\)/);
    expect(job.slice(fallback)).toContain("gh issue create");
  });
});
