/**
 * deploy.yml — `/status` 배포 완료 시각(M5-15 · 2026-11-03 사용자 결정 — Deployments API, PRD §15 D71 ③)
 * - build job만 `deployments: read`(최소 범위 — deploy job · 쓰기 권한 없음), 재사용 호출하는 ci · collect · weekly의 deploy job도 같은 권한을 넘긴다
 *   (호출된 워크플로는 호출 측이 준 권한 이하만 쓸 수 있다 — 빠지면 그 경로에서 API가 거부된다)
 * - '배포 기록 읽기' 단계: 빌드 앞 · continue-on-error(실패해도 빌드 통과 — 칸 숨김) · 시간 상한 · 토큰은 GH_TOKEN 환경변수로만(출력 없음)
 *   · github-pages 환경 · GraphQL 한 번 · SUCCESS 상태 시각만 · 결과 파일 경로를 출력으로
 * - 빌드 단계는 그 출력을 STATUS_DEPLOYS_FILE로 받는다(비면 칸 숨김 — src/lib/data/status.ts loadDeployTimes)
 */
import { describe, expect, it } from "vitest";

import {
  jobBlock,
  readWorkflow,
  runOf,
  stepKey,
  stepNamed,
  stepsOf,
} from "./support/workflow-text";

const deploy = readWorkflow("deploy.yml");
const build = jobBlock(deploy, "build");
const deployJob = jobBlock(deploy, "deploy");
const steps = stepsOf(build);
const read = stepNamed(steps, "배포 기록 읽기");
const buildStep = stepNamed(steps, "정적 빌드");

/** job 블록의 permissions: 아래 키 목록 */
function permissionsOf(job: string): Record<string, string> {
  const m = /^ {4}permissions:\n((?: {6}[\w-]+: \w+.*\n)+)/m.exec(job);
  if (!m) return {};
  return Object.fromEntries(
    (m[1] ?? "")
      .trimEnd()
      .split("\n")
      .map((line) => {
        const [k, v] = line.trim().split(/:\s*/);
        return [k ?? "", (v ?? "").split(/\s/)[0] ?? ""];
      }),
  );
}

describe("deploy.yml — 배포 기록 읽기(/status 배포 완료 시각)", () => {
  it("build job만 deployments: read — deploy job에는 없고, 쓰기 권한은 늘지 않는다", () => {
    expect(permissionsOf(build)).toEqual({
      contents: "read",
      pages: "read",
      deployments: "read",
    });
    expect(permissionsOf(deployJob)).toEqual({
      pages: "write",
      "id-token": "write",
    });
    expect(deploy).not.toMatch(/deployments: write/);
  });

  it("빌드 앞에서 · 실패해도 빌드 계속(continue-on-error) · 시간 상한 · 출력 id", () => {
    const names = steps.map((s) => s.name);
    expect(names.indexOf(read.name)).toBeLessThan(
      names.indexOf(buildStep.name),
    );
    expect(stepKey(read, "id")).toBe("deploys");
    expect(stepKey(read, "continue-on-error")).toBe("true");
    expect(Number(stepKey(read, "timeout-minutes"))).toBeLessThanOrEqual(5);
  });

  it("토큰은 GH_TOKEN 환경변수로만 — run 본문에 토큰 표현식 · 출력(echo) 없음", () => {
    expect(read.body).toMatch(/^ {10}GH_TOKEN: \$\{\{ github\.token \}\}$/m);
    const body = runOf(read) ?? "";
    expect(body).not.toMatch(/secrets\.|github\.token|GH_TOKEN/);
    expect(body).not.toMatch(/set -x/);
  });

  it("github-pages 환경 · GraphQL 한 번 · SUCCESS 시각만 · 파일 경로를 출력으로", () => {
    const body = runOf(read) ?? "";
    expect(body.match(/gh api/g)).toHaveLength(1);
    expect(body).toContain("gh api graphql");
    expect(body).toContain('environments:["github-pages"]');
    expect(body).toMatch(/first:100/);
    expect(body).toContain('select(.state == "SUCCESS")');
    expect(body).toMatch(/echo "file=\$DEPLOYS_FILE" >> "\$GITHUB_OUTPUT"/);
    expect(read.body).toMatch(
      /DEPLOYS_FILE: \$\{\{ runner\.temp \}\}\/deploys\.json/,
    );
  });

  it("빌드 단계가 그 출력을 STATUS_DEPLOYS_FILE로 받는다", () => {
    expect(buildStep.body).toMatch(
      /^ {10}STATUS_DEPLOYS_FILE: \$\{\{ steps\.deploys\.outputs\.file \}\}$/m,
    );
  });
});

describe("재사용 호출 경로 — ci · collect · weekly의 deploy job이 deployments: read를 넘긴다", () => {
  for (const name of ["ci.yml", "collect.yml", "weekly.yml"]) {
    it(name, () => {
      const job = jobBlock(readWorkflow(name), "deploy");
      expect(job).toMatch(/^ {4}uses: \.\/\.github\/workflows\/deploy\.yml$/m);
      expect(permissionsOf(job)).toEqual({
        contents: "read",
        pages: "write",
        "id-token": "write",
        deployments: "read",
      });
    });
  }
});
