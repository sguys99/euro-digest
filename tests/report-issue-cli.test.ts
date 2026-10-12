import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  actionsRunUrl,
  buildIssue,
  defaultIssueKey,
  previewReport,
  type FetchLike,
  type IssuePayloadInput,
  type ReportResult,
} from "../scripts/lib/github-issues";
import {
  MAX_BATCH_PAYLOADS,
  formatBatchResult,
  formatBatchSummary,
  formatDroppedWarning,
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
  it("--payload-file 내용(JSON 객체)을 그대로 payload 1건으로", () => {
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
        payloads: [{ sourceId: "bbc-sport", symptoms: ["파싱 실패"] }],
        batch: false,
        dropped: 0,
      },
    });
  });

  it("JSON 배열이면 일괄 보고(항목마다 기본 원인 키) — 빈 배열도 통과", () => {
    const r = resolveReportInput(
      args({ kind: "source-broken" }),
      {},
      JSON.stringify([
        { sourceId: "relevo", symptoms: ["기타"] },
        { sourceId: "espn-soccer", symptoms: ["0건 수집"] },
      ]),
      NOW,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        kind: "source-broken",
        key: undefined,
        payloads: [
          { sourceId: "relevo", symptoms: ["기타"] },
          { sourceId: "espn-soccer", symptoms: ["0건 수집"] },
        ],
        batch: true,
        dropped: 0,
      },
    });
    expect(
      resolveReportInput(args({ kind: "source-broken" }), {}, "[]", NOW),
    ).toEqual({
      ok: true,
      value: {
        kind: "source-broken",
        key: undefined,
        payloads: [],
        batch: true,
        dropped: 0,
      },
    });
  });

  it("배열에 --key를 주면 오류", () => {
    const keyed = resolveReportInput(
      args({ kind: "source-broken", key: "x" }),
      {},
      "[]",
      NOW,
    );
    expect(keyed.ok).toBe(false);
    if (!keyed.ok) expect(keyed.error).toContain("--key");
  });

  it("배열이 상한(50건)을 넘으면 거부하지 않고 앞 50건만 — 남은 건수는 dropped", () => {
    const items = Array.from({ length: MAX_BATCH_PAYLOADS + 3 }, (_, i) => ({
      sourceId: `s${i}`,
    }));
    const long = resolveReportInput(
      args({ kind: "source-broken" }),
      {},
      JSON.stringify(items),
      NOW,
    );
    expect(long.ok).toBe(true);
    if (!long.ok) return;
    expect(long.value.payloads).toHaveLength(MAX_BATCH_PAYLOADS);
    expect(long.value.payloads[0]).toEqual({ sourceId: "s0" });
    expect(long.value.payloads.at(-1)).toEqual({
      sourceId: `s${MAX_BATCH_PAYLOADS - 1}`,
    });
    expect(long.value.dropped).toBe(3);
    const exact = resolveReportInput(
      args({ kind: "source-broken" }),
      {},
      JSON.stringify(items.slice(0, MAX_BATCH_PAYLOADS)),
      NOW,
    );
    expect(exact.ok && exact.value.dropped).toBe(0);
  });

  it("payload 파일이 JSON이 아니면 오류", () => {
    expect(resolveReportInput(args(), {}, "{", NOW).ok).toBe(false);
  });

  it("pipeline-failure 외에는 payload 파일이 필요", () => {
    const r = resolveReportInput(
      args({ kind: "source-broken" }),
      ACTIONS_ENV,
      null,
      NOW,
    );
    expect(r.ok).toBe(false);
  });

  it("pipeline-failure는 환경변수로 payload를 만든다", () => {
    const r = resolveReportInput(args(), ACTIONS_ENV, null, NOW);
    expect(r.ok && r.value.batch).toBe(false);
    expect(r.ok && r.value.payloads[0]).toMatchObject({
      failedJobs: ["collect"],
    });
  });
});

describe("actionsRunUrl", () => {
  it("Actions 기본 변수로 실행 URL, 하나라도 없거나 형식이 틀리면 undefined(로컬)", () => {
    expect(actionsRunUrl(ACTIONS_ENV)).toBe(
      "https://github.com/sguys99/euro-digest/actions/runs/18000000001",
    );
    expect(actionsRunUrl({})).toBeUndefined();
    expect(
      actionsRunUrl({ GITHUB_REPOSITORY: "sguys99/euro-digest" }),
    ).toBeUndefined();
    expect(
      actionsRunUrl({ GITHUB_REPOSITORY: "a b", GITHUB_RUN_ID: "1" }),
    ).toBeUndefined();
    expect(
      actionsRunUrl({ GITHUB_REPOSITORY: "o/r", GITHUB_RUN_ID: "1x" }),
    ).toBeUndefined();
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

describe("일괄 보고 출력 문구", () => {
  const result: ReportResult = {
    action: "created",
    number: 31,
    url: "https://github.com/sguys99/euro-digest/issues/31",
    fingerprint: "0123456789ab",
    key: "source:relevo",
    occurrence: 1,
    deduped: false,
  };

  it("상한 초과로 뺀 건수는 결과 한 줄·Step Summary에 남는다", () => {
    expect(
      formatBatchResult(
        "source-broken",
        { created: 50, commented: 0, failed: 0 },
        3,
      ),
    ).toBe(
      "[report-issue] source-broken 일괄 보고 50건 — 새 이슈 50 · 댓글 0 · 실패 0 · 상한 초과로 보고 안 함 3",
    );
    expect(formatBatchSummary("source-broken", [], 3)).toContain(
      `- 경고: ${formatDroppedWarning(3)}`,
    );
    expect(formatDroppedWarning(3)).toContain("뒤쪽 3건은 보고하지 않았습니다");
  });

  it("결과 한 줄 — 빈 배열은 보고할 사건 없음", () => {
    expect(
      formatBatchResult("source-broken", {
        created: 0,
        commented: 0,
        failed: 0,
      }),
    ).toBe("[report-issue] source-broken 일괄 보고 — 보고할 사건 없음");
    expect(
      formatBatchResult("source-broken", {
        created: 1,
        commented: 2,
        failed: 1,
      }),
    ).toBe(
      "[report-issue] source-broken 일괄 보고 4건 — 새 이슈 1 · 댓글 2 · 실패 1",
    );
  });

  it("Step Summary — 항목별 링크·실패 사유", () => {
    const text = formatBatchSummary("source-broken", [
      { ok: true, result },
      {
        ok: true,
        result: {
          ...result,
          action: "commented",
          number: 9,
          commentUrl:
            "https://github.com/sguys99/euro-digest/issues/9#issuecomment-1",
          key: "source:espn-soccer",
          occurrence: 3,
        },
      },
      { ok: false, label: "source:x", error: "이슈 보고 실패 (HTTP 403)" },
    ]);
    expect(text).toContain("## 이슈 일괄 보고 (source-broken)");
    expect(text).toContain(
      "- `source:relevo` 새 이슈 [#31](https://github.com/sguys99/euro-digest/issues/31)",
    );
    expect(text).toContain(
      "- `source:espn-soccer` 열린 이슈 [#9](https://github.com/sguys99/euro-digest/issues/9#issuecomment-1)에 댓글 · 3번째 발생",
    );
    expect(text).toContain("- 실패 `source:x` — 이슈 보고 실패 (HTTP 403)");
    expect(formatBatchSummary("source-broken", [])).toContain(
      "보고할 사건 없음",
    );
  });
});

describe("collect.yml 소스 이슈 단계와의 연결 (M1-11, D35)", () => {
  const workflow = readFileSync(
    fileURLToPath(new URL("../.github/workflows/collect.yml", import.meta.url)),
    "utf8",
  );
  const collectJob = workflow.slice(
    workflow.indexOf("\n  collect:\n"),
    workflow.indexOf("\n  deploy:\n"),
  );
  const steps = collectJob.split(/\n {6}- name: /).slice(1);
  const step = (name: string) => {
    const found = steps.find((s) => s.startsWith(name));
    if (!found) throw new Error(`단계 없음: ${name}`);
    return found;
  };
  const collectStep = step("수집 · 정제·분류 · 브리핑");
  const issueStep = step("소스 이슈 보고");

  it("수집 단계는 사건 파일 경로만 받고 GitHub 토큰은 받지 않는다", () => {
    expect(collectStep).toContain("id: collect");
    expect(collectStep).toContain(
      "SOURCE_HEALTH_FILE: ${{ runner.temp }}/source-health.json",
    );
    expect(collectStep).not.toMatch(/GITHUB_TOKEN|GH_TOKEN|github\.token/);
  });

  it("이슈 단계: 수집 단계가 돌았으면 성공·실패와 무관하게, 취소면 돌지 않음 · 토큰은 이 단계 env로만 · 실패해도 job을 뒤집지 않음", () => {
    expect(issueStep).toContain(
      "if: ${{ !cancelled() && steps.collect.outcome != 'skipped' }}",
    );
    expect(issueStep).not.toContain("always()");
    expect(issueStep).toContain("continue-on-error: true");
    expect(issueStep).toMatch(/timeout-minutes: \d+/);
    expect(issueStep).toContain("GITHUB_TOKEN: ${{ github.token }}");
    expect(issueStep).toContain(
      "SOURCE_HEALTH_FILE: ${{ runner.temp }}/source-health.json",
    );
    expect(issueStep).toContain('if [ ! -s "$SOURCE_HEALTH_FILE" ]; then');
    // 빈 배열이면 셸에서 끝낸다 — 토큰을 가진 node를 띄우지 않는다
    const emptyCheck = issueStep.indexOf(
      `if [ "$(tr -d '[:space:]' < "$SOURCE_HEALTH_FILE")" = "[]" ]; then`,
    );
    expect(emptyCheck).toBeGreaterThan(0);
    expect(emptyCheck).toBeLessThan(issueStep.indexOf("node --import tsx"));
    expect(issueStep).toContain(
      'node --import tsx scripts/report-issue.ts --kind source-broken --payload-file "$SOURCE_HEALTH_FILE"',
    );
  });

  it("단계 순서: 수집 → 소스 이슈 → 검증 → 빌드 → 커밋, 토큰은 이슈·커밋 단계에만", () => {
    const order = [
      "수집 · 정제·분류 · 브리핑",
      "소스 이슈 보고",
      "검증 게이트",
      "정적 빌드",
      "data 커밋",
    ].map((name) => steps.findIndex((s) => s.startsWith(name)));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const withToken = steps
      .filter((s) => /github\.token/.test(s))
      .map((s) => s.split("\n")[0]);
    expect(withToken).toEqual([
      "소스 이슈 보고 (실패 · 건강도)",
      "data 커밋 · push",
    ]);
  });

  it("collect job 권한에 issues: write", () => {
    expect(collectJob).toMatch(
      /permissions:\n {6}contents: write.*\n {6}issues: write/,
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
