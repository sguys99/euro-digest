/**
 * weekly.yml 구조 고정 (M3-06 — PRD FR-90, CLAUDE.md §6.1·§10, D49 정신). 워크플로는 로컬에서 실행할 수 없으므로 텍스트 구조로
 * 트리거·동시성·게이트·단계 순서·조건·값 전달을 고정한다(tests/collect-workflow.test.ts와 같은 방식). 실제 동작 확인은 커밋 뒤
 * Actions 수동 dispatch로 한다.
 */
import { describe, expect, it } from "vitest";

import { WEEKLY_OUTPUT_KEYS } from "../scripts/lib/weekly-run";
import { WEEKLY_STAGES } from "../scripts/lib/weekly-stages";

import {
  jobBlock,
  readWorkflow,
  runOf,
  stepKey,
  stepNamed,
  stepsOf,
} from "./support/workflow-text";

const workflow = readWorkflow("weekly.yml");
const collectWorkflow = readWorkflow("collect.yml");
const weeklyJob = jobBlock(workflow, "weekly");
const steps = stepsOf(weeklyJob);

const STEP = {
  base: "기준 커밋 기록",
  install: "의존성 설치",
  weekly: "주간 작업",
  opsIssue: "운영 리포트 이슈 보고",
  discard: "실패 단계 산출물 되돌리기",
  validate: "검증 게이트",
  og: "OG 이미지 확인",
  chromium: "Chromium 설치 (OG 이미지)",
  build: "정적 빌드",
  commit: "data 커밋",
  preserve: "실패 실행 기록 보존",
  stopped: "실패 단계 기록",
  stages: "단계 실패 표시",
} as const;

function run(prefix: string): string {
  const body = runOf(stepNamed(steps, prefix));
  if (body === null) throw new Error(`run 없음: ${prefix}`);
  return body;
}

function minutes(text: string | null): number {
  return Number(text ?? NaN);
}

describe("weekly.yml 트리거·동시성·게이트", () => {
  it("매주 월요일 08:00 KST = UTC 일요일 23:00 + workflow_dispatch(force·dry·week)", () => {
    expect(workflow).toMatch(/^ {4}- cron: "0 23 \* \* 0"/m);
    expect([...workflow.matchAll(/^ {4}- cron:/gm)]).toHaveLength(1);
    expect(workflow).toMatch(/^ {2}workflow_dispatch:\n {4}inputs:/m);
    for (const input of ["force", "dry", "week"]) {
      expect(workflow).toMatch(new RegExp(`^ {6}${input}:$`, "m"));
    }
  });

  it("concurrency는 collect.yml과 같은 그룹 collect, 진행 중 실행은 끊지 않는다", () => {
    const block = /^concurrency:\n((?: {2}.*\n)+)/m;
    expect(block.exec(workflow)?.[1]).toBe(
      "  group: collect\n  cancel-in-progress: false\n",
    );
    expect(block.exec(collectWorkflow)?.[1]).toBe(
      "  group: collect\n  cancel-in-progress: false\n",
    );
  });

  it("main 전용 · schedule은 COLLECT_ENABLED == 'true'이고 WEEKLY_ENABLED != 'off'일 때만(dispatch는 무관)", () => {
    expect(stepKeyOfJob(weeklyJob, "if")).toBe(
      "github.ref == 'refs/heads/main' && (github.event_name == 'workflow_dispatch' || (vars.COLLECT_ENABLED == 'true' && vars.WEEKLY_ENABLED != 'off'))",
    );
  });

  it("기본 권한 없음 — weekly job은 contents: write + issues: write(운영 리포트 이슈 — M5-09)뿐", () => {
    expect(workflow).toMatch(/^permissions: \{\}$/m);
    const block = /^ {4}permissions:\n((?: {6}.*\n)+)/m.exec(weeklyJob)?.[1];
    expect(
      block
        ?.trimEnd()
        .split("\n")
        .map((line) => line.replace(/\s+#.*$/, "").trim()),
    ).toEqual(["contents: write", "issues: write"]);
  });
});

function stepKeyOfJob(job: string, key: string): string | null {
  return new RegExp(`^ {4}${key}: (.*)$`, "m").exec(job)?.[1] ?? null;
}

describe("weekly job 단계 — 주간 작업 → 검증 → 빌드 → 커밋 (검증·빌드 실패 시 커밋하지 않음)", () => {
  it("단계 순서", () => {
    const names = steps.map((s) => s.name);
    const order = Object.values(STEP).map((prefix) =>
      names.findIndex((n) => n.startsWith(prefix)),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(names.at(-1)?.startsWith(STEP.stages)).toBe(true);
  });

  it("main 최신 체크아웃, 토큰을 .git/config에 남기지 않는다", () => {
    const checkout = steps[0];
    expect(checkout?.body).toMatch(/ref: main/);
    expect(checkout?.body).toMatch(/persist-credentials: false/);
  });

  it("주간 작업 — 비밀값은 이 단계 env로만, 입력은 env로 받아 인자로", () => {
    const step = stepNamed(steps, STEP.weekly);
    expect(stepKey(step, "id")).toBe("weekly");
    for (const secret of [
      "ANTHROPIC_API_KEY",
      "FOOTBALL_DATA_API_KEY",
      "API_FOOTBALL_KEY",
    ]) {
      expect(step.body).toContain(`${secret}: \${{ secrets.${secret} }}`);
      // 다른 단계에는 비밀값이 없다
      for (const other of steps.filter((s) => s !== step)) {
        expect(other.body).not.toContain(`secrets.${secret}`);
      }
    }
    const body = run(STEP.weekly);
    expect(body).toContain('npm run weekly -- "${args[@]}"');
    expect(body).toContain('args+=(--only "$ONLY")');
    expect(step.body).toContain("ONLY: ${{ inputs.only }}");
    expect(body).not.toMatch(/\$\{\{\s*inputs\./);
  });

  it("운영 리포트 — 주간 작업이 payload 파일 경로를 받고(토큰 없음), 다음 단계가 파일이 있을 때만 ops-report 이슈를 낸다", () => {
    const weeklyStep = stepNamed(steps, STEP.weekly);
    expect(weeklyStep.body).toContain(
      "OPS_REPORT_FILE: ${{ runner.temp }}/ops-report.json",
    );
    expect(weeklyStep.body).not.toContain("github.token");
    const step = stepNamed(steps, STEP.opsIssue);
    expect(stepKey(step, "if")).toBe(
      "${{ !cancelled() && steps.weekly.outcome != 'skipped' }}",
    );
    expect(stepKey(step, "continue-on-error")).toBe("true");
    expect(step.body).toContain("GITHUB_TOKEN: ${{ github.token }}");
    expect(step.body).toContain(
      "OPS_REPORT_FILE: ${{ runner.temp }}/ops-report.json",
    );
    const body = run(STEP.opsIssue);
    expect(body).toContain('if [ ! -s "$OPS_REPORT_FILE" ]; then');
    expect(body).toContain(
      'node --import tsx scripts/report-issue.ts --kind ops-report --payload-file "$OPS_REPORT_FILE"',
    );
    // 토큰을 받는 단계는 운영 리포트 이슈 · data 커밋 · 실패 실행 기록 보존 셋뿐
    const withToken = steps
      .filter((s) => s.body.includes("github.token"))
      .map((s) => s.name);
    expect(withToken).toEqual([
      expect.stringMatching(/^운영 리포트 이슈 보고/),
      expect.stringMatching(/^data 커밋/),
      expect.stringMatching(/^실패 실행 기록 보존/),
    ]);
  });

  it("검증·빌드·커밋은 가드 skip이면 돌지 않고, 앞 단계가 실패하면 돌지 않는다(상태 함수 없는 if = success())", () => {
    for (const name of [STEP.validate, STEP.build, STEP.commit]) {
      expect(stepKey(stepNamed(steps, name), "if")).toBe(
        "steps.weekly.outputs.skipped != 'true'",
      );
    }
    expect(run(STEP.validate)).toBe("npm run validate");
    expect(run(STEP.build)).toBe("npm run build");
  });

  it("OG 이미지 준비(M5-01) — 확인은 가드 skip이 아니면 늘, 브라우저 캐시 · Chromium 설치는 구울 것이 있을 때만", () => {
    expect(stepKey(stepNamed(steps, STEP.og), "if")).toBe(
      "steps.weekly.outputs.skipped != 'true'",
    );
    expect(run(STEP.og)).toContain("npm run build:og -- --check");
    for (const name of [
      "Playwright 브라우저 캐시 (OG 이미지)",
      STEP.chromium,
    ]) {
      expect(stepKey(stepNamed(steps, name), "if")).toBe(
        "steps.weekly.outputs.skipped != 'true' && steps.og.outputs.stale != '0'",
      );
    }
    expect(run(STEP.chromium)).toBe(
      "npx playwright install --with-deps chromium",
    );
  });

  it("OG 강등(M5-13 — PRD §15 D77) — 확인 · 캐시 · 설치는 continue-on-error, 경고 단계, 빌드는 OG_BUILD_MODE=soft, 실패 단계 기록에 og 키 없음", () => {
    for (const name of [
      STEP.og,
      "Playwright 브라우저 캐시 (OG 이미지)",
      STEP.chromium,
    ]) {
      expect([
        name,
        stepKey(stepNamed(steps, name), "continue-on-error"),
      ]).toEqual([name, "true"]);
    }
    expect(Number(stepKey(stepNamed(steps, STEP.og), "timeout-minutes"))).toBe(
      2,
    );
    expect(
      Number(stepKey(stepNamed(steps, STEP.chromium), "timeout-minutes")),
    ).toBe(4);
    const warn = stepNamed(steps, "OG 준비 실패 경고");
    expect(stepKey(warn, "if")).toBe(
      "steps.og.outcome == 'failure' || steps.chromium.outcome == 'failure'",
    );
    expect(runOf(warn)).toContain("::warning title=OG 이미지 준비 실패");
    const names = steps.map((s) => s.name);
    expect(names.indexOf(warn.name)).toBeGreaterThan(
      names.indexOf(stepNamed(steps, STEP.chromium).name),
    );
    expect(names.indexOf(warn.name)).toBeLessThan(
      names.indexOf(stepNamed(steps, STEP.build).name),
    );
    expect(stepNamed(steps, STEP.build).body).toMatch(
      /^ {10}OG_BUILD_MODE: soft$/m,
    );
    const stopped = run(STEP.stopped);
    expect(stopped).not.toContain('step="og"');
    expect(stopped).not.toContain("OG_OUTCOME");
  });

  it("되돌리기 — discard가 있을 때만, 경로 형식을 다시 확인하고 HEAD로 되돌린다", () => {
    const step = stepNamed(steps, STEP.discard);
    expect(stepKey(step, "if")).toBe("steps.weekly.outputs.discard != ''");
    const body = run(STEP.discard);
    expect(body).toContain("restore --source=HEAD --staged --worktree");
    expect(body).toContain("data/runs.json");
    expect(body).toContain("^(data|public)/");
  });

  it("data 커밋 — data/·public/만, 주간 발행 메시지, 훅 끔, rebase 3회", () => {
    const body = run(STEP.commit);
    expect(body).toContain('git add -A -- "${paths[@]}"');
    expect(body).toContain(
      'message="chore(data): ${PUBLISH_DATE} 주간 발행 (${WEEK})"',
    );
    expect(body).toContain("core.hooksPath=/dev/null");
    expect(body).toContain("pull --rebase --autostash origin main");
    expect(body).toContain("for attempt in 1 2 3");
  });

  it("실패 실행 기록 보존 — 실행 기록을 남긴 실패만, runs.json만(원장·이월 없음)", () => {
    const step = stepNamed(steps, STEP.preserve);
    expect(stepKey(step, "if")).toBe(
      "failure() && steps.weekly.outputs.run_recorded == 'true'",
    );
    const body = run(STEP.preserve);
    expect(body).toContain("scripts/preserve-run.ts save");
    expect(body).toContain("scripts/preserve-run.ts apply");
    expect(body).not.toContain("--with-ledger");
    expect(body).toContain('git -C "$MAIN_DIR" add -A -- data/runs.json');
    expect(body).toContain("주간 실행 기록 (발행 실패)");
  });

  it("단계 실패 표시 — partial이면 마지막에 job 실패(원인 키 weekly:weekly/stages)", () => {
    const step = stepNamed(steps, STEP.stages);
    expect(stepKey(step, "if")).toBe(
      "steps.weekly.outputs.status == 'partial'",
    );
    const body = run(STEP.stages);
    expect(body).toContain('echo "step=stages"');
    expect(body.trimEnd().endsWith("exit 1")).toBe(true);
    expect(weeklyJob).toContain(
      "reason: ${{ steps.stopped.outputs.reason || steps.stages.outputs.reason }}",
    );
  });

  it("워크플로가 읽는 steps.weekly.outputs.<키>는 모두 WEEKLY_OUTPUT_KEYS에 있다", () => {
    const used = new Set(
      [...workflow.matchAll(/steps\.weekly\.outputs\.([a-z_]+)/g)].map(
        (m) => m[1],
      ),
    );
    expect(used.size).toBeGreaterThan(0);
    for (const key of used) {
      expect(WEEKLY_OUTPUT_KEYS as readonly string[]).toContain(key);
    }
  });
});

describe("시간 상한", () => {
  const jobLimit = Number(
    /^ {4}timeout-minutes: (\d+)$/m.exec(weeklyJob)?.[1] ?? NaN,
  );

  it("run 단계에는 모두 step 상한이 있다", () => {
    for (const step of steps.filter((s) => runOf(s) !== null)) {
      expect([step.name, stepKey(step, "timeout-minutes")]).not.toEqual([
        step.name,
        null,
      ]);
    }
  });

  it("가장 큰 step 상한 + 실패 경로 단계 상한 + 1분 ≤ job 상한", () => {
    const limits = steps
      .filter((s) => runOf(s) !== null)
      .map((s) => minutes(stepKey(s, "timeout-minutes")));
    const failurePath = [STEP.preserve, STEP.stopped, STEP.stages].reduce(
      (sum, name) =>
        sum + minutes(stepKey(stepNamed(steps, name), "timeout-minutes")),
      0,
    );
    expect(Math.max(...limits) + failurePath + 1).toBeLessThanOrEqual(jobLimit);
  });

  it("단계 시간 상한 합계 + 2분 ≤ 주간 작업 step 상한", () => {
    const stageMinutes =
      WEEKLY_STAGES.reduce((sum, s) => sum + s.timeoutMs, 0) / 60_000;
    expect(stageMinutes + 2).toBeLessThanOrEqual(
      minutes(stepKey(stepNamed(steps, STEP.weekly), "timeout-minutes")),
    );
  });
});

describe("배포·실패 이슈", () => {
  it("deploy — 커밋 출력으로 진행(partial이어도), 수동 취소면 안 함, deploy.yml 재사용", () => {
    const deploy = jobBlock(workflow, "deploy");
    expect(deploy).toContain(
      "if: ${{ !cancelled() && needs.weekly.outputs.committed == 'true' }}",
    );
    expect(deploy).toContain("uses: ./.github/workflows/deploy.yml");
    expect(deploy).toContain("ref: ${{ needs.weekly.outputs.sha }}");
  });

  it("report-failure — 이슈 헬퍼 --workflow weekly, needs weekly·deploy", () => {
    const report = jobBlock(workflow, "report-failure");
    expect(report).toContain("needs: [weekly, deploy]");
    expect(report).toContain("if: failure()");
    expect(report).toContain(
      "scripts/report-issue.ts --kind pipeline-failure --workflow weekly",
    );
  });
});
