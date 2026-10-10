/**
 * `npm run validate` 통합 테스트 (M0-17) — 임시 폴더에 configs·data를 꾸며
 * 실제 파일 읽기(validate-fs) → 판정(validate-report) → 출력 문구까지 확인한다.
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readValidationSnapshot } from "../scripts/lib/validate-fs";
import {
  buildValidationReport,
  formatValidationReport,
  validationExitCode,
} from "../scripts/lib/validate-report";
import { formatIssue } from "../scripts/lib/validate-schema";

import { FIXTURE_ROOT, loadFixture } from "./schema/helpers";

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "euro-digest-validate-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** 임시 저장소에 파일을 쓴다. 문자열이 아니면 JSON으로 직렬화. */
function write(relPath: string, content: unknown): void {
  const abs = path.join(root, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(
    abs,
    typeof content === "string" ? content : JSON.stringify(content, null, 2),
  );
}

/** fixtures/schema/<dir>를 임시 저장소의 같은 경로로 복사한다. */
function copyFixtures(dir: "configs" | "data"): void {
  cpSync(path.join(FIXTURE_ROOT, dir), path.join(root, dir), {
    recursive: true,
  });
}

function run(configsOnly = false) {
  const report = buildValidationReport(
    readValidationSnapshot(root, { configsOnly }),
    { configsOnly },
  );
  const errors = report.issues
    .filter((i) => i.severity === "error")
    .map(formatIssue);
  const infos = report.issues
    .filter((i) => i.severity === "info")
    .map(formatIssue);
  return {
    report,
    errors,
    infos,
    exitCode: validationExitCode(report),
    lines: formatValidationReport(report),
  };
}

describe("① 전부 유효", () => {
  it("필수 파일(takedowns.json = [])만 있으면 통과, 없는 configs·프롬프트는 정보", () => {
    write("configs/takedowns.json", "[]\n");
    const { exitCode, errors, infos, lines, report } = run();

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(report.counts).toEqual({ configs: 1, data: 0, prompts: 0 });
    // 레지스트리 config 11종 중 takedowns를 뺀 10종 + 프롬프트 3종
    expect(infos).toHaveLength(13);
    expect(infos).toContain(
      "configs/sources.json — 아직 없음 · 뉴스 소스 (FR-01)",
    );
    expect(infos).toContain(
      "configs/prompts/summarize.md — 아직 없음 · 해당 LLM 기능 단계에서 추가",
    );
    expect(lines.at(-1)).toBe(
      "[validate] 검증 통과 — configs 1개 · data 0개 · 정보 13건",
    );
  });

  it("fixtures/schema/configs를 그대로 복사하면 통과하고 교차 참조 3종을 모두 실행한다", () => {
    copyFixtures("configs");
    const { exitCode, errors, infos, report } = run();

    expect(errors).toEqual([]);
    expect(exitCode).toBe(0);
    expect(report.counts.configs).toBe(11);
    expect(report.crossRef.checked).toHaveLength(3);
    expect(report.crossRef.skipped).toEqual([]);
    expect(infos.every((i) => i.startsWith("configs/prompts/"))).toBe(true);
  });

  it("프롬프트는 있으면 비어 있지 않은지만 본다", () => {
    write("configs/takedowns.json", "[]");
    write(
      "configs/prompts/summarize.md",
      "# 요약 프롬프트\n입력에 없는 사실 금지\n",
    );
    write("configs/prompts/team-profile.md", "  \n\t\n");
    const { errors, report } = run();

    expect(report.counts.prompts).toBe(2);
    expect(errors).toEqual([
      "configs/prompts/team-profile.md — 프롬프트가 비어 있음",
    ]);
  });
});

describe("② JSON 문법 오류", () => {
  it("파일 단위 오류로 보고하고 다른 파일 검사는 계속한다", () => {
    write("configs/takedowns.json", '[{"id": "c_0123456789",');
    write("configs/team-colors.json", "{ invalid }");
    const { exitCode, errors } = run();

    expect(exitCode).toBe(1);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/^configs\/takedowns\.json — JSON 문법 오류: /);
    expect(errors[1]).toMatch(/^configs\/team-colors\.json — JSON 문법 오류: /);
  });

  it("빈 파일·UTF-8 BOM도 오류", () => {
    write("configs/takedowns.json", "");
    write("configs/formations.json", "﻿{}");
    const { errors } = run();

    expect(errors).toEqual([
      "configs/formations.json — UTF-8 BOM이 있음 — BOM 없이 UTF-8로 저장",
      expect.stringMatching(/^configs\/takedowns\.json — JSON 문법 오류: /),
    ]);
  });
});

describe("③ 스키마 오류 — `파일:zod 경로 — 메시지`", () => {
  it("배열 항목의 필드 경로를 출력한다", () => {
    write("configs/takedowns.json", [
      {
        id: "c_0123456789",
        requestedAt: "2026-10-10T03:00:00Z",
        handledAt: null,
        reason: "삭제 요청 (#1)",
      },
      {
        id: "c_XYZ",
        requestedAt: "2026-10-10T03:00:00Z",
        handledAt: null,
        reason: "정정 요청 (#2)",
      },
    ]);
    const { exitCode, errors, lines } = run();

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      "configs/takedowns.json:[1].id — 카드 ID는 c_ + 16진수 소문자 10자리",
    ]);
    expect(lines).toContain(
      "[validate] 오류 configs/takedowns.json:[1].id — 카드 ID는 c_ + 16진수 소문자 10자리",
    );
    expect(lines.at(-1)).toBe(
      "[validate] 검증 실패 — 오류 1건 (파일 1개) · configs 1개 · data 0개 · 정보 13건",
    );
  });

  it("키 맵 파일은 키를 경로에 넣고, 알 수 없는 키(strict)도 잡는다", () => {
    write("configs/takedowns.json", "[]");
    write("configs/team-colors.json", {
      "sample-united": { colors: ["#C8102E", "#C8102E"], short: "SMU" },
      "Bad Key": { colors: ["#000000", "#FFFFFF"], short: "BAD" },
    });
    write("configs/transfer-windows.json", {
      boost: 1.5,
      windows: [],
      extra: 1,
    });
    const { errors } = run();

    expect(errors).toContain(
      "configs/team-colors.json:sample-united.colors — 주색과 보조색이 같음",
    );
    expect(errors).toContainEqual(
      expect.stringMatching(/^configs\/team-colors\.json:\["Bad Key"\] — /),
    );
    expect(errors).toContainEqual(
      expect.stringMatching(
        /^configs\/transfer-windows\.json:\(루트\) — .*extra/,
      ),
    );
  });

  it("오류가 많으면 파일당 10건까지만 출력하고 건수는 전부 센다", () => {
    write(
      "configs/takedowns.json",
      Array.from({ length: 12 }, (_, i) => ({
        id: `bad-${i}`,
        requestedAt: "2026-10-10T03:00:00Z",
        handledAt: null,
        reason: "x",
      })),
    );
    const { errors, lines } = run();

    expect(errors).toHaveLength(12);
    const shown = lines.filter((l) =>
      l.startsWith("[validate] 오류 configs/takedowns.json:"),
    );
    expect(shown).toHaveLength(10);
    expect(lines).toContain(
      "[validate] 오류 configs/takedowns.json — … 외 2건 생략",
    );
    expect(lines.at(-1)).toMatch(/검증 실패 — 오류 12건 \(파일 1개\)/);
  });
});

describe("④ 레지스트리에 없는 configs 파일", () => {
  it("파일명 오타는 비슷한 이름을 제안한다", () => {
    write("configs/takedowns.json", "[]");
    write("configs/source.json", []);
    write("configs/Sources.JSON", []); // 대소문자가 다른 확장자·이름
    const { exitCode, errors } = run();

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      "configs/Sources.JSON — 스키마 레지스트리에 없는 설정 파일 (혹시 configs/sources.json?)",
      "configs/source.json — 스키마 레지스트리에 없는 설정 파일 (혹시 configs/sources.json?)",
    ]);
  });

  it("비슷한 이름이 없으면 등록 안내, 하위 폴더도 검사하고 prompts/는 뺀다", () => {
    write("configs/takedowns.json", "[]");
    write("configs/oops.json", { a: 1 });
    write("configs/archive/sources.json", []);
    write("configs/prompts/examples.json", { not: "checked" });
    const { errors, report } = run();

    expect(report.counts.configs).toBe(3);
    expect(errors).toEqual([
      "configs/archive/sources.json — 스키마 레지스트리에 없는 설정 파일 (파일명 오타? 새 파일이면 src/lib/schema/registry.ts에 등록 — 스키마 변경은 사용자 확인 후)",
      "configs/oops.json — 스키마 레지스트리에 없는 설정 파일 (파일명 오타? 새 파일이면 src/lib/schema/registry.ts에 등록 — 스키마 변경은 사용자 확인 후)",
    ]);
  });

  it("README.md 같은 JSON이 아닌 파일은 대상이 아니다", () => {
    write("configs/takedowns.json", "[]");
    write("configs/README.md", "# configs");
    write("configs/prompts/.gitkeep", "");
    expect(run().exitCode).toBe(0);
  });
});

describe("⑤ 교차 참조 실패", () => {
  it("검색 쿼리 source·player, 소집 명단 playerSlugs가 없는 id를 가리키면 오류", () => {
    copyFixtures("configs");
    const queries = loadFixture("configs/search-queries.json") as {
      queries: Record<string, unknown>[];
    };
    write("configs/search-queries.json", {
      ...queries,
      queries: [
        { ...queries.queries[0], player: "nobody" },
        { ...queries.queries[1], source: "bbc-football" }, // type rss
        { ...queries.queries[1], id: "q-missing", source: "missing-source" },
      ],
    });
    const team = loadFixture("configs/national-team.json") as {
      squads: { playerSlugs: string[] }[];
    };
    write("configs/national-team.json", {
      ...team,
      squads: [{ ...team.squads[0], playerSlugs: ["hong-gil-dong", "ghost"] }],
    });
    const { exitCode, errors, lines } = run();

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      'configs/search-queries.json:queries[1].source — 소스 "bbc-football"의 type이 "rss" — 검색 쿼리는 type "search" 소스만 참조',
      'configs/search-queries.json:queries[2].source — sources.json에 없는 소스 id "missing-source"',
      'configs/search-queries.json:queries[0].player — korean-players.json에 없는 선수 slug "nobody"',
      'configs/national-team.json:squads[0].playerSlugs[1] — korean-players.json에 없는 선수 slug "ghost"',
    ]);
    expect(lines).toContain(
      "[validate] 교차 참조: 3건 실행 · 건너뜀 0건(관련 파일 없음) · 오류 4건",
    );
  });

  it("한쪽 파일이 스키마 오류면 교차 참조는 건너뛴다(스키마 오류만 보고)", () => {
    copyFixtures("configs");
    write("configs/sources.json", [{ id: "Bad Id" }]);
    const { errors, report } = run();

    expect(report.crossRef.skipped).toEqual([
      "search-queries.source → sources(type search)",
    ]);
    expect(errors.every((e) => e.startsWith("configs/sources.json:"))).toBe(
      true,
    );
  });
});

describe("⑥ data 파일 검증", () => {
  it("fixtures/schema/data를 그대로 복사하면 통과한다", () => {
    write("configs/takedowns.json", "[]");
    copyFixtures("data");
    const { exitCode, errors, report } = run();

    expect(errors).toEqual([]);
    expect(exitCode).toBe(0);
    expect(report.counts.data).toBe(11);
  });

  it("파일명 불일치·스키마 오류·미등록 파일은 오류", () => {
    write("configs/takedowns.json", "[]");
    write(
      "data/news/2026-10-11.json",
      loadFixture("data/news/2026-10-10.json"),
    );
    write("data/runs.json", [{ runId: 1 }]);
    write("data/cache/other.json", {});
    write("data/run.json", []);
    const { exitCode, errors } = run();

    expect(exitCode).toBe(1);
    expect(errors).toContain(
      "data/cache/other.json — 스키마 레지스트리에 없는 data 파일 (파일명 오타? 새 파일이면 src/lib/schema/registry.ts에 등록 — 스키마 변경은 사용자 확인 후)",
    );
    expect(errors).toContain(
      'data/news/2026-10-11.json — 파일명이 내용과 다름 — 내용 기준 파일명은 "2026-10-10.json" (현재 "2026-10-11.json")',
    );
    expect(errors).toContain(
      "data/run.json — 스키마 레지스트리에 없는 data 파일 (혹시 data/runs.json?)",
    );
    expect(errors.some((e) => e.startsWith("data/runs.json:[0]"))).toBe(true);
  });

  it("--configs-only면 data를 읽지 않는다", () => {
    write("configs/takedowns.json", "[]");
    write("data/runs.json", "{ broken");
    const { exitCode, report, lines } = run(true);

    expect(exitCode).toBe(0);
    expect(report.counts.data).toBe(0);
    expect(lines).toContain("[validate] data: 건너뜀 (--configs-only)");
    expect(run(false).exitCode).toBe(1);
  });
});

describe("⑦ 필수 파일 누락", () => {
  it("takedowns.json이 없으면 오류", () => {
    write("configs/sources.json", loadFixture("configs/sources.json"));
    const { exitCode, errors } = run();

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      "configs/takedowns.json — 필수 설정 파일이 없음 · 삭제·정정 요청 카드 (FR-143)",
    ]);
  });

  it("configs/ 폴더 자체가 없어도 같은 오류로 끝난다(예외로 죽지 않음)", () => {
    const { exitCode, errors, report } = run();

    expect(exitCode).toBe(1);
    expect(report.counts).toEqual({ configs: 0, data: 0, prompts: 0 });
    expect(errors).toEqual([
      "configs/takedowns.json — 필수 설정 파일이 없음 · 삭제·정정 요청 카드 (FR-143)",
    ]);
  });
});

describe("CI 연결 — 워크플로가 validate를 빌드·커밋 전에 실행한다", () => {
  const workflow = (name: string) =>
    readFileSync(
      fileURLToPath(new URL(`../.github/workflows/${name}`, import.meta.url)),
      "utf8",
    );

  it.each([
    [
      "ci.yml",
      ["run: npm run check", "run: npm run validate", "run: npm run build"],
    ],
    [
      "collect.yml",
      [
        "npm run collect -- ",
        "run: npm run validate",
        "run: npm run build",
        "git commit",
      ],
    ],
  ])("%s", (name, steps) => {
    const text = workflow(name);
    const positions = steps.map((s) => text.indexOf(s));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
