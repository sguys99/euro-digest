/**
 * ci.yml — Lighthouse 모바일 job(M5-08 · NFR-01 · NFR-07) + lighthouserc.json 단언 구성
 * - lighthouse job: main push · PR · 수동 실행만, 배포(deploy job)는 기다리지 않는다(needs에 없음)
 * - check job과 같은 Playwright 캐시 키 · Chromium 설치 → 빌드 → 측정 순, 수동 입력(스로틀링 방식)은 env로만 셸에 넘긴다
 * - 결과는 artifact(점 폴더 — include-hidden-files) · Step Summary, 외부 업로드(temporary-public-storage) 없음
 * - check job의 번들 예산 · 비밀값 검사(check:bundle)는 빌드 직후 그대로
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  jobBlock,
  readWorkflow,
  runOf,
  stepKey,
  stepNamed,
  stepsOf,
} from "./support/workflow-text";

const ci = readWorkflow("ci.yml");
const check = jobBlock(ci, "check");
const lighthouse = jobBlock(ci, "lighthouse");
const deploy = jobBlock(ci, "deploy");
const lhSteps = stepsOf(lighthouse);
const checkSteps = stepsOf(check);

type Assertion = [string, Record<string, unknown>];
type LhciConfig = {
  ci: {
    collect: { numberOfRuns: number; settings: Record<string, unknown> };
    assert: {
      assertMatrix: {
        matchingUrlPattern: string;
        assertions: Record<string, Assertion>;
      }[];
    };
    upload?: unknown;
  };
};
const rc = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../lighthouserc.json", import.meta.url)),
    "utf8",
  ),
) as LhciConfig;

const cacheKey = (steps: ReturnType<typeof stepsOf>): string | undefined =>
  /key: (.+)/.exec(stepNamed(steps, "Playwright 브라우저 캐시").body)?.[1];

describe("ci.yml — lighthouse job (M5-08)", () => {
  it("main push · PR · 수동 실행에서만 돈다(다른 브랜치 push는 건너뜀)", () => {
    const cond = /^ {4}if: (.+)$/m.exec(lighthouse)?.[1] ?? "";
    expect(cond).toContain(
      "(github.event_name == 'push' && github.ref == 'refs/heads/main')",
    );
    expect(cond).toContain("github.event_name == 'pull_request'");
    expect(cond).toContain("github.event_name == 'workflow_dispatch'");
  });

  it("배포는 Lighthouse를 기다리지 않는다 — deploy needs는 check · specimen 그대로, lighthouse에도 needs 없음", () => {
    expect(/^ {4}needs: (.+)$/m.exec(deploy)?.[1]).toBe("[check, specimen]");
    expect(lighthouse).not.toMatch(/^ {4}needs:/m);
  });

  it("check job과 같은 Playwright 캐시 키 · Chromium 설치 → 빌드 → 환경 기록 → 측정 순", () => {
    expect(cacheKey(lhSteps)).toBe(cacheKey(checkSteps));
    const names = lhSteps.map((s) => s.name);
    const at = (prefix: string): number =>
      names.findIndex((n) => n.startsWith(prefix));
    expect(at("Playwright 브라우저 설치")).toBeLessThan(at("정적 빌드"));
    expect(at("정적 빌드")).toBeLessThan(at("측정 환경 기록"));
    expect(at("측정 환경 기록")).toBeLessThan(at("Lighthouse 측정"));
    expect(runOf(stepNamed(lhSteps, "정적 빌드"))).toBe("npm run build");
  });

  it("측정은 npm run lighthouse -- --assert, 수동 입력은 env로만 셸에 넘긴다(식 직접 삽입 없음)", () => {
    const step = stepNamed(lhSteps, "Lighthouse 측정");
    expect(stepKey(step, "id")).toBe("lighthouse");
    const run = runOf(step) ?? "";
    expect(run).toBe(
      'npm run lighthouse -- --assert --method "$LIGHTHOUSE_METHOD"',
    );
    expect(run).not.toContain("${{");
    expect(step.body).toContain(
      "LIGHTHOUSE_METHOD: ${{ inputs.lighthouse_method || 'devtools' }}",
    );
  });

  it("수동 실행 입력 lighthouse_method — devtools(기본) · simulate 선택지", () => {
    const dispatch = /workflow_dispatch:\n((?: {4,}.*\n)+)/.exec(ci)?.[1] ?? "";
    expect(dispatch).toContain("lighthouse_method:");
    expect(dispatch).toContain("type: choice");
    expect(dispatch).toContain("options: [devtools, simulate]");
    expect(dispatch).toContain("default: devtools");
  });

  it("결과 artifact — 성공 · 실패 모두, 점 폴더 포함, site/(out 심볼릭 링크) 제외", () => {
    const up = stepNamed(lhSteps, "Lighthouse 결과 업로드");
    expect(stepKey(up, "if")).toBe(
      "always() && (steps.lighthouse.outcome == 'success' || steps.lighthouse.outcome == 'failure')",
    );
    expect(up.body).toContain("uses: actions/upload-artifact@v7");
    expect(up.body).toContain("include-hidden-files: true");
    expect(up.body).toContain(".lighthouseci/.lighthouseci/");
    expect(up.body).toContain(".lighthouseci/summary.json");
    expect(up.body).not.toContain(".lighthouseci/site");
    expect(up.body).not.toMatch(/^\s+\.lighthouseci\/?$/m);
  });

  it("외부 업로드(temporary-public-storage · lhci upload) 없음", () => {
    expect(ci).not.toMatch(/temporary-public-storage|lhci upload/);
    expect(rc.ci.upload).toBeUndefined();
  });

  it("비밀값을 쓰지 않는다 — lighthouse job에 secrets 참조 없음 · 쓰기 권한 없음", () => {
    expect(lighthouse).not.toContain("secrets.");
    expect(lighthouse).not.toMatch(/^ {4}permissions:/m);
    expect(/^permissions:\n {2}contents: read$/m.test(ci)).toBe(true);
  });
});

describe("ci.yml — check job 번들 예산 · 비밀값 검사(NFR-07)", () => {
  it("빌드 바로 다음에 check:bundle, e2e보다 앞", () => {
    const names = checkSteps.map((s) => s.name);
    const build = names.findIndex((n) => n.startsWith("정적 빌드"));
    const bundle = names.findIndex((n) => n.startsWith("번들 예산 · 비밀값"));
    expect(bundle).toBe(build + 1);
    expect(runOf(checkSteps[bundle]!)).toBe("npm run check:bundle");
    expect(bundle).toBeLessThan(names.findIndex((n) => n.startsWith("e2e")));
  });
});

describe("lighthouserc.json — 단언(M5-08)", () => {
  const [all, seo] = rc.ci.assert.assertMatrix;

  it("error: LCP ≤ 2000ms · CLS ≤ 0.05 · 접근성 ≥ 0.9 / warn: 성능 ≥ 0.95 — 모두 중앙값 실행", () => {
    expect(all?.matchingUrlPattern).toBe(".*");
    expect(all?.assertions).toEqual({
      "categories:performance": [
        "warn",
        { minScore: 0.95, aggregationMethod: "median-run" },
      ],
      "largest-contentful-paint": [
        "error",
        { maxNumericValue: 2000, aggregationMethod: "median-run" },
      ],
      "cumulative-layout-shift": [
        "error",
        { maxNumericValue: 0.05, aggregationMethod: "median-run" },
      ],
      "categories:accessibility": [
        "error",
        { minScore: 0.9, aggregationMethod: "median-run" },
      ],
    });
  });

  it("SEO ≥ 0.9 error는 noindex 쪽(/status/ · /search/)만 뺀다", () => {
    expect(seo?.assertions).toEqual({
      "categories:seo": [
        "error",
        { minScore: 0.9, aggregationMethod: "median-run" },
      ],
    });
    const pattern = new RegExp(seo?.matchingUrlPattern ?? "");
    const base = "http://localhost:43210/euro-digest";
    for (const p of ["/status/", "/search/"])
      expect(pattern.test(`${base}${p}`)).toBe(false);
    expect(pattern.test("http://localhost:43210/status/")).toBe(false);
    for (const p of [
      "/",
      "/news/",
      "/news/2026-11-04/",
      "/teams/bayern-munchen/",
      "/teams/x/status/",
      "/status-x/",
    ])
      expect(pattern.test(`${base}${p}`)).toBe(true);
  });

  it("측정 조건 — 3회 · devtools · 카테고리 4개", () => {
    expect(rc.ci.collect.numberOfRuns).toBe(3);
    expect(rc.ci.collect.settings.throttlingMethod).toBe("devtools");
    expect(rc.ci.collect.settings.onlyCategories).toEqual([
      "performance",
      "accessibility",
      "best-practices",
      "seo",
    ]);
  });
});
