/**
 * collect.yml 발행 흐름 구조 고정 (M1-26 — CLAUDE.md §6.1·§10, FR-150·FR-152·FR-153).
 * 워크플로는 로컬에서 실행할 수 없으므로(actionlint도 없음) 텍스트 구조로 순서·조건·값 전달을 고정한다. 실제 동작 확인은
 * 커밋 뒤 Actions 수동 dispatch로 한다.
 */
import { describe, expect, it } from "vitest";

import {
  COLLECT_OUTPUT_KEYS,
  formatCollectOutputs,
} from "../scripts/lib/collect-outputs";
import { CARD_FLOOR, CARD_FLOOR_REST } from "../scripts/lib/publish-gate";
import { parseNeedsJson } from "../scripts/lib/report-issue-cli";

import {
  jobBlock,
  readWorkflow,
  runOf,
  stepKey,
  stepNamed,
  stepsOf,
} from "./support/workflow-text";

const workflow = readWorkflow("collect.yml");
const ci = readWorkflow("ci.yml");
const deployWorkflow = readWorkflow("deploy.yml");
const collectJob = jobBlock(workflow, "collect");
const steps = stepsOf(collectJob);

const STEP = {
  install: "의존성 설치",
  collect: "수집 · 정제·분류 · 브리핑",
  sourceIssues: "소스 이슈 보고",
  validate: "검증 게이트",
  build: "정적 빌드",
  commit: "data 커밋",
  stopped: "실패 단계 기록",
} as const;

function run(prefix: string): string {
  const body = runOf(stepNamed(steps, prefix));
  if (body === null) throw new Error(`run 없음: ${prefix}`);
  return body;
}

describe("collect job 단계 — 수집 → 검증 → 빌드 → 커밋 (검증·빌드 실패 시 커밋하지 않음)", () => {
  it("단계 순서: 설치 → 수집 → 소스 이슈 → 검증 게이트 → 정적 빌드 → data 커밋 → 실패 단계 기록(마지막)", () => {
    const order = Object.values(STEP).map((name) =>
      steps.findIndex((s) => s.name.startsWith(name)),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(steps.at(-1)?.name).toBe(STEP.stopped);
  });

  it("수집·검증·빌드·커밋은 if·continue-on-error가 없다 — 앞 단계가 모두 성공했을 때만 돌고, 실패는 job을 실패시킨다", () => {
    for (const name of [STEP.collect, STEP.validate, STEP.build, STEP.commit]) {
      const step = stepNamed(steps, name);
      expect([name, stepKey(step, "if")]).toEqual([name, null]);
      expect([name, stepKey(step, "continue-on-error")]).toEqual([name, null]);
      expect([name, stepKey(step, "timeout-minutes")]).not.toEqual([
        name,
        null,
      ]);
    }
  });

  it("step 목록에 빠진 단계가 없다 — job 안 6칸 대시 줄 수 = step 수, 모든 step에 이름이 있다(이름 없는 `- run:` 금지)", () => {
    for (const id of ["guard", "collect", "report-failure"]) {
      const job = jobBlock(workflow, id);
      const dashLines = job.match(/^ {6}- /gm) ?? [];
      const jobSteps = stepsOf(job);
      expect([id, dashLines.length]).toEqual([id, jobSteps.length]);
      expect([id, jobSteps.filter((s) => s.name === "").length]).toEqual([
        id,
        0,
      ]);
    }
  });

  it("job 수준 continue-on-error가 없고, step 수준은 소스 이슈 보고 하나뿐", () => {
    expect(collectJob).not.toMatch(/^ {4}continue-on-error:/m);
    expect(
      steps
        .filter((s) => stepKey(s, "continue-on-error") !== null)
        .map((s) => s.name),
    ).toEqual(["소스 이슈 보고 (실패 · 건강도)"]);
  });

  it("run 단계는 모두 step 상한이 있고, 가장 큰 step 상한 + 5분 ≤ job 상한 — step 시간 초과가 job 시간 초과보다 먼저 와 실패 단계 기록이 돈다", () => {
    const jobLimit = Number(
      /^ {4}timeout-minutes: (\d+)$/m.exec(collectJob)?.[1] ?? NaN,
    );
    const limits = steps
      .filter((s) => runOf(s) !== null)
      .map(
        (s) => [s.name, Number(stepKey(s, "timeout-minutes") ?? NaN)] as const,
      );
    for (const [name, limit] of limits) {
      expect([name, Number.isInteger(limit) && limit > 0]).toEqual([
        name,
        true,
      ]);
    }
    expect(stepKey(stepNamed(steps, STEP.install), "timeout-minutes")).toBe(
      "4",
    );
    const largest = Math.max(...limits.map(([, limit]) => limit));
    expect(largest + 5).toBeLessThanOrEqual(jobLimit);
  });

  it("뒤 단계가 outcome을 읽는 단계에는 id가 있다(install·collect·validate·build·commit)", () => {
    expect(stepKey(stepNamed(steps, STEP.install), "id")).toBe("install");
    expect(stepKey(stepNamed(steps, STEP.collect), "id")).toBe("collect");
    expect(stepKey(stepNamed(steps, STEP.validate), "id")).toBe("validate");
    expect(stepKey(stepNamed(steps, STEP.build), "id")).toBe("build");
    expect(stepKey(stepNamed(steps, STEP.commit), "id")).toBe("commit");
    expect(stepKey(stepNamed(steps, STEP.stopped), "id")).toBe("stopped");
  });
});

describe("발행일 전달 — 수집 단계 출력 publish_date (M1-25 이월: today는 자정 넘김 실행에서 어긋남)", () => {
  it("워크플로가 읽는 steps.collect.outputs.<키>는 모두 수집 진입점이 쓰는 키(COLLECT_OUTPUT_KEYS)다", () => {
    const referenced = new Set(
      [...workflow.matchAll(/steps\.collect\.outputs\.([A-Za-z_]+)/g)].map(
        (m) => m[1],
      ),
    );
    expect(referenced.has("publish_date")).toBe(true);
    for (const key of referenced) {
      expect(COLLECT_OUTPUT_KEYS as readonly (string | undefined)[]).toContain(
        key,
      );
    }
    // 진입점 출력 문자열의 키 = 목록
    const written = formatCollectOutputs({
      publishDate: "2026-10-17",
      runId: "r1",
      status: "success",
      runRecorded: true,
    })
      .trimEnd()
      .split("\n")
      .map((line) => line.split("=")[0]);
    expect(written).toEqual([...COLLECT_OUTPUT_KEYS]);
  });

  it("검증 게이트: publish_date를 env로 받아 형식 확인 뒤 --publish-date로 넘긴다 — today·시계 날짜 없음", () => {
    const step = stepNamed(steps, STEP.validate);
    expect(step.body).toContain(
      "PUBLISH_DATE: ${{ steps.collect.outputs.publish_date }}",
    );
    const body = run(STEP.validate);
    const check = body.indexOf(
      '[[ ! "$PUBLISH_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]',
    );
    const call = body.indexOf(
      'npm run validate -- --publish-date "$PUBLISH_DATE"',
    );
    expect(check).toBeGreaterThanOrEqual(0);
    expect(call).toBeGreaterThan(check);
    expect(body).toMatch(/exit 1/);
    expect(body).not.toMatch(/today|date \+%F|TZ=/);
  });

  it("커밋 메시지 날짜 = 같은 발행일 — 커밋 시각으로 다시 계산하지 않는다", () => {
    const step = stepNamed(steps, STEP.commit);
    expect(step.body).toContain(
      "PUBLISH_DATE: ${{ steps.collect.outputs.publish_date }}",
    );
    const body = run(STEP.commit);
    expect(body).toContain('message="chore(data): ${PUBLISH_DATE} 발행"');
    expect(body).toContain('git commit --quiet -m "$message"');
    expect(body).not.toMatch(/TZ=Asia\/Seoul date|date \+%F/);
  });

  it("collect job 출력: committed·sha(커밋) · publish_date·run_id·status(수집 — M1-27이 이어받음) · reason(실패 단계)", () => {
    const outputs = /^ {4}outputs:\n((?: {6}.+\n)+)/m.exec(collectJob)?.[1];
    expect(outputs).toBeDefined();
    const map = Object.fromEntries(
      (outputs ?? "")
        .trimEnd()
        .split("\n")
        .map((line) =>
          line
            .trim()
            .split(/: (.+)/)
            .slice(0, 2),
        ),
    );
    expect(map).toEqual({
      committed: "${{ steps.commit.outputs.committed }}",
      sha: "${{ steps.commit.outputs.sha }}",
      publish_date: "${{ steps.collect.outputs.publish_date }}",
      run_id: "${{ steps.collect.outputs.run_id }}",
      status: "${{ steps.collect.outputs.status }}",
      reason: "${{ steps.stopped.outputs.reason }}",
    });
  });
});

describe("data 커밋 — 변경분만, data/·public/에 한정, pull --rebase 후 push (CLAUDE.md §10)", () => {
  const body = run(STEP.commit);

  it("커밋 경로는 data/·public/만, 그 밖의 변경은 경고만 하고 커밋하지 않는다", () => {
    expect(body).toContain("for dir in data public; do");
    expect([...body.matchAll(/git add /g)]).toHaveLength(1);
    expect(body).toContain('git add -A -- "${paths[@]}"');
    expect(body).toContain(":(exclude)data");
    expect(body).toContain(":(exclude)public");
  });

  it("변경이 없으면 committed=false로 끝낸다(커밋·배포 없음)", () => {
    const empty = body.indexOf('if [ -z "$changes" ]; then');
    expect(empty).toBeGreaterThan(0);
    expect(body.slice(empty, body.indexOf("git config"))).toMatch(
      /committed=false[\s\S]*exit 0/,
    );
  });

  it("강제 push가 없다(--force·-f·+refspec)", () => {
    expect(body).not.toMatch(/--force/);
    for (const line of body.split("\n").filter((l) => /\bpush\b/.test(l))) {
      expect([line, /\s-f\b|\s\+\S/.test(line)]).toEqual([line, false]);
    }
  });

  it("pull --rebase → push 순서, 3번까지 재시도, rebase 충돌은 되돌리고 재시도 없이 실패", () => {
    const loop = body.slice(body.indexOf("for attempt in 1 2 3; do"));
    const pull = loop.indexOf(
      'git "${git_auth[@]}" pull --rebase --autostash origin main',
    );
    const push = loop.indexOf('git "${git_auth[@]}" push origin HEAD:main');
    expect(pull).toBeGreaterThan(0);
    expect(push).toBeGreaterThan(pull);
    const conflict = loop.slice(
      loop.indexOf("rebase-merge"),
      loop.indexOf("::error title=pull 실패"),
    );
    expect(conflict).toContain("git rebase --abort");
    expect(conflict).toContain("::error title=rebase 충돌::");
    expect(conflict).toMatch(/exit 1/);
    expect(conflict).not.toContain("continue");
  });

  it("push 직후 committed·sha를 먼저 쓰고, 그 뒤 요약 쓰기 실패는 경고만 — 단계가 실패하지 않아 deploy가 돈다", () => {
    const loop = body.slice(body.indexOf("for attempt in 1 2 3; do"));
    const afterLoop = loop.slice(loop.indexOf("\ndone\n"));
    const committed = afterLoop.indexOf('echo "committed=true"');
    const summary = afterLoop.indexOf('>> "$GITHUB_STEP_SUMMARY"');
    expect(committed).toBeGreaterThan(0);
    expect(summary).toBeGreaterThan(committed);
    // 요약 리다이렉트가 실패해도 `||`가 받아 bash -e로 끝나지 않는다 — 요약 뒤에는 명령이 없다
    const tail = afterLoop.slice(summary);
    expect(tail).toMatch(
      /^>> "\$GITHUB_STEP_SUMMARY" \|\| echo "::warning title=요약 쓰기 실패::[^"\n]*"$/,
    );
  });

  it("변경 없음 분기의 요약 쓰기 실패도 경고만(committed=false 뒤 exit 0)", () => {
    const empty = body.slice(
      body.indexOf('if [ -z "$changes" ]; then'),
      body.indexOf("git config"),
    );
    expect(empty).toContain(
      '>> "$GITHUB_STEP_SUMMARY" || echo "::warning title=요약 쓰기 실패::',
    );
  });

  it("쓰기 토큰은 이 단계에서만 git 명령 헤더로 — 디스크에 남기지 않는다(checkout persist-credentials false)", () => {
    expect(body).toContain('echo "::add-mask::${basic_auth}"');
    expect(collectJob).toMatch(
      /- name: 저장소 체크아웃 \(main\)\n {8}uses: actions\/checkout@v\d+\n {8}with:\n {10}ref: main\n {10}persist-credentials: false/,
    );
  });
});

describe("실패 단계 기록 → 실패 이슈 메모 (FR-152)", () => {
  const step = stepNamed(steps, STEP.stopped);
  const body = run(STEP.stopped);

  it("실패했을 때만 돌고, 토큰을 받지 않는다", () => {
    expect(stepKey(step, "if")).toBe("failure()");
    expect(step.body).not.toMatch(/github\.token|GITHUB_TOKEN|GH_TOKEN/);
  });

  it("env로 받는 단계 outcome은 이 job에 있는 step id만 가리킨다", () => {
    const ids = new Set(
      steps.map((s) => stepKey(s, "id")).filter((id) => id !== null),
    );
    const referenced = [
      ...step.body.matchAll(/steps\.([A-Za-z_][\w-]*)\.outcome/g),
    ].map((m) => m[1]);
    expect(referenced).toEqual([
      "install",
      "collect",
      "validate",
      "build",
      "commit",
    ]);
    for (const id of referenced) expect(ids.has(id ?? "")).toBe(true);
  });

  it("앞 단계부터 판정하고 reason을 $GITHUB_OUTPUT에 쓴다 — 본문에 표현식(${{ }})을 넣지 않는다", () => {
    const order = [
      "$INSTALL_OUTCOME",
      "$COLLECT_OUTCOME",
      "$VALIDATE_OUTCOME",
      "$BUILD_OUTCOME",
      "$COMMIT_OUTCOME",
    ].map((v) => body.indexOf(v));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(body).toContain('echo "reason=${reason}" >> "$GITHUB_OUTPUT"');
    expect(body).not.toContain("${{");
  });

  it("이슈 헬퍼는 needs.collect.outputs.reason을 collect job 행의 메모로 쓴다", () => {
    const needs = parseNeedsJson(
      JSON.stringify({
        guard: { result: "success", outputs: { run: "true", reason: "force" } },
        collect: {
          result: "failure",
          outputs: {
            committed: "",
            sha: "",
            publish_date: "2026-10-17",
            run_id: "r1",
            status: "success",
            reason:
              "검증 게이트(npm run validate) 실패 — 커밋·배포 안 함, 전날 사이트 유지 (발행일 2026-10-17)",
          },
        },
        deploy: { result: "skipped", outputs: {} },
      }),
    );
    expect(needs.ok && needs.value).toEqual([
      { job: "guard", result: "success", note: "force" },
      {
        job: "collect",
        result: "failure",
        note: "검증 게이트(npm run validate) 실패 — 커밋·배포 안 함, 전날 사이트 유지 (발행일 2026-10-17)",
      },
      { job: "deploy", result: "skipped" },
    ]);
  });
});

describe("배포·실패 보고 연결", () => {
  it("deploy job: collect가 성공하고 커밋이 있을 때만, 커밋 SHA로 재사용 deploy.yml 호출", () => {
    const deploy = jobBlock(workflow, "deploy");
    expect(deploy).toMatch(/^ {4}needs: collect$/m);
    expect(deploy).toMatch(
      /^ {4}if: needs\.collect\.outputs\.committed == 'true'$/m,
    );
    expect(deploy).toMatch(/^ {4}uses: \.\/\.github\/workflows\/deploy\.yml$/m);
    expect(deploy).toMatch(
      /^ {6}ref: \$\{\{ needs\.collect\.outputs\.sha \}\}$/m,
    );
    expect(deploy).toMatch(/pages: write/);
    expect(deploy).toMatch(/id-token: write/);
  });

  it("deploy.yml은 workflow_call 재사용 워크플로이고 concurrency pages(진행 중 배포를 끊지 않음)", () => {
    expect(deployWorkflow).toMatch(/^ {2}workflow_call:$/m);
    expect(deployWorkflow).toMatch(
      /^concurrency:\n {2}group: pages\n {2}cancel-in-progress: false$/m,
    );
  });

  it("report-failure: guard·collect·deploy 중 하나라도 실패하면(취소 제외)", () => {
    const report = jobBlock(workflow, "report-failure");
    expect(report).toMatch(/^ {4}needs: \[guard, collect, deploy\]$/m);
    expect(report).toMatch(/^ {4}if: failure\(\)$/m);
    expect(report).not.toContain("always()");
  });
});

describe("입력 설명·주석 (M1-25 이월, CLAUDE.md §10)", () => {
  it("dispatch limit 설명이 카드 수 하한(평시·휴식기)과 검증 게이트를 알린다", () => {
    const limit = /^ {6}limit:\n {8}description: "(.+)"$/m.exec(workflow)?.[1];
    expect(limit).toBeDefined();
    expect(limit).toContain(`${CARD_FLOOR} 미만`);
    expect(limit).toContain(`휴식기 ${CARD_FLOOR_REST} 미만`);
    expect(limit).toContain("검증 게이트");
  });

  it("낡은 주석이 되살아나지 않는다 — 'M1-25에서' 예고·'사람·봇' push 금지·'±15분'(D48 전 표현)", () => {
    for (const text of [workflow, ci]) {
      expect(text).not.toMatch(/M1-25에서|사람·봇 운영 규칙|±15분/);
    }
  });
});

describe("구조 검사 도구 — stepsOf가 이름 없는 단계도 잡는다", () => {
  it("`- run:`·`- uses:`로 시작하는 단계·뒤에 name이 오는 단계·job 사이 주석", () => {
    const job = [
      "  sample:",
      "    steps:",
      "      - name: 첫 단계",
      "        id: first",
      "        run: npm ci",
      "",
      "      # 다음 단계 주석(6칸)",
      "      - run: git push --force origin HEAD:main",
      "      - uses: actions/checkout@v7",
      "        name: 뒤에 이름",
      "        with:",
      "          ref: main",
      "      - run: |",
      "          echo a",
      "          echo b",
      "",
      "  # 다음 job 주석(2칸)",
    ].join("\n");
    const parsed = stepsOf(job);
    expect(parsed.map((s) => s.name)).toEqual(["첫 단계", "", "뒤에 이름", ""]);
    expect(stepKey(parsed[0]!, "id")).toBe("first");
    expect(parsed[0]!.body).not.toContain("주석");
    expect(runOf(parsed[1]!)).toBe("git push --force origin HEAD:main");
    expect(stepKey(parsed[2]!, "uses")).toBe("actions/checkout@v7");
    expect(runOf(parsed[3]!)).toBe("echo a\necho b");
    expect(parsed[3]!.body).not.toContain("다음 job");
  });
});

describe("셸 본문 주입 방지 — run 본문에 입력·이벤트 표현식을 넣지 않는다", () => {
  it("collect.yml의 모든 run 본문에 ${{ }}가 없다(값은 env로만)", () => {
    const jobs = ["guard", "collect", "report-failure"];
    for (const id of jobs) {
      for (const step of stepsOf(jobBlock(workflow, id))) {
        const body = runOf(step);
        if (body === null) continue;
        expect([id, step.name, body.includes("${{")]).toEqual([
          id,
          step.name,
          false,
        ]);
      }
    }
  });
});
