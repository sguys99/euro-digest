/** `npm run validate` 판정·출력 순수 함수 (M0-17) — 파일 1개 검사, 경로 표기, 출력 문구, 인자. */
import { describe, expect, it } from "vitest";

import { findSchemaEntry, schemaRegistry } from "@/lib/schema";

import {
  REQUIRED_CONFIG_FILES,
  buildValidationReport,
  formatValidationReport,
  parseValidateArgs,
  resolvePublishDate,
  validationExitCode,
  type ValidationReport,
} from "../scripts/lib/validate-report";
import {
  checkJsonFile,
  editDistance,
  formatIssue,
  formatIssuePath,
  suggestRegisteredPath,
} from "../scripts/lib/validate-schema";

import type { GateFloor, RestPeriod } from "../scripts/lib/publish-gate";

import { loadFixture } from "./schema/helpers";

describe("formatIssuePath — zod 경로 표기", () => {
  it.each([
    [[], "(루트)"],
    [["queries", 1, "source"], "queries[1].source"],
    [[0, "url"], "[0].url"],
    [["sample-united", "colors", 0], "sample-united.colors[0]"],
    [["Son Heung-min"], '["Son Heung-min"]'],
    [["a.b", "c"], '["a.b"].c'],
  ] as const)("%j → %s", (path, expected) => {
    expect(formatIssuePath(path)).toBe(expected);
  });
});

describe("formatIssue", () => {
  it("경로가 있으면 `파일:경로 — 메시지`, 없으면 `파일 — 메시지`", () => {
    expect(
      formatIssue({
        severity: "error",
        stage: "configs",
        file: "configs/sources.json",
        path: "[0].url",
        message: "URL 오류",
      }),
    ).toBe("configs/sources.json:[0].url — URL 오류");
    expect(
      formatIssue({
        severity: "info",
        stage: "prompts",
        file: "configs/prompts/summarize.md",
        message: "아직 없음",
      }),
    ).toBe("configs/prompts/summarize.md — 아직 없음");
  });
});

describe("미등록 파일명 제안", () => {
  it("editDistance", () => {
    expect(editDistance("source.json", "sources.json")).toBe(1);
    expect(editDistance("names.json", "names.ko.json")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("abc", "abc")).toBe(0);
  });

  it.each([
    ["configs/source.json", "configs/sources.json"],
    ["configs/Sources.JSON", "configs/sources.json"],
    ["configs/korean-player.json", "configs/korean-players.json"],
    ["configs/names.json", "configs/names.ko.json"],
    ["data/run.json", "data/runs.json"],
  ])("%s → %s", (file, expected) => {
    expect(suggestRegisteredPath(file)).toBe(expected);
  });

  it.each([
    "configs/oops.json",
    "configs/nested/sources.json", // 다른 폴더
    "data/news/2026-10.json", // 와일드카드 패턴은 제안하지 않는다
  ])("제안 없음: %s", (file) => {
    expect(suggestRegisteredPath(file)).toBeUndefined();
  });
});

describe("checkJsonFile", () => {
  it("통과하면 zod 출력(parsed)을 돌려준다 — 기본값 적용", () => {
    const check = checkJsonFile(
      "./configs/sources.json",
      JSON.stringify(loadFixture("configs/sources.json")),
      { stage: "configs" },
    );
    expect(check.issues).toEqual([]);
    expect(check.file).toBe("configs/sources.json");
    expect(Array.isArray(check.parsed)).toBe(true);
  });

  it("스키마 실패·파일명 불일치면 parsed가 없다(교차 참조에서 빠짐)", () => {
    const bad = checkJsonFile("configs/takedowns.json", '[{"id":1}]', {
      stage: "configs",
    });
    expect(bad.parsed).toBeUndefined();
    expect(bad.issues.length).toBeGreaterThan(0);

    const misnamed = checkJsonFile(
      "data/teams/other-team.json",
      JSON.stringify(loadFixture("data/teams/sample-united.json")),
      { stage: "data" },
    );
    expect(misnamed.parsed).toBeUndefined();
    expect(misnamed.issues.map((i) => i.message)).toEqual([
      '파일명이 내용과 다름 — 내용 기준 파일명은 "sample-united.json" (현재 "other-team.json")',
    ]);
  });

  it("초안(draft) 스키마면 정보 1건을 덧붙이고 검증은 그대로 한다", () => {
    const takedowns = findSchemaEntry("configs/takedowns.json");
    if (!takedowns) throw new Error("레지스트리 항목 없음");
    const check = checkJsonFile("configs/takedowns.json", "[]", {
      stage: "configs",
      findEntry: () => ({ ...takedowns, status: "draft" }),
    });
    expect(check.parsed).toEqual([]);
    expect(check.issues).toEqual([
      {
        severity: "info",
        stage: "configs",
        file: "configs/takedowns.json",
        message:
          "초안(draft) 스키마로 검증 — 사용자 확인 전 (삭제·정정 요청 카드 (FR-143))",
      },
    ]);
  });
});

describe("buildValidationReport — 스냅숏 판정", () => {
  const base = {
    configFiles: [{ relPath: "configs/takedowns.json", text: "[]" }],
    dataFiles: [],
    promptFiles: [],
  };

  it("읽기 실패는 오류로 남기고 나머지 검사는 계속한다", () => {
    const report = buildValidationReport(
      {
        ...base,
        configFiles: [
          ...base.configFiles,
          { relPath: "configs/sources.json", readError: "EACCES" },
        ],
        promptFiles: [
          { relPath: "configs/prompts/summarize.md", readError: "EISDIR" },
        ],
      },
      { configsOnly: false },
    );
    const errors = report.issues
      .filter((i) => i.severity === "error")
      .map(formatIssue);
    expect(errors).toEqual([
      "configs/sources.json — 파일을 읽지 못함: EACCES",
      "configs/prompts/summarize.md — 파일을 읽지 못함: EISDIR",
    ]);
    expect(validationExitCode(report)).toBe(1);
  });

  it("configsOnly면 스냅숏에 data가 있어도 보지 않는다", () => {
    const report = buildValidationReport(
      { ...base, dataFiles: [{ relPath: "data/runs.json", text: "{" }] },
      { configsOnly: true },
    );
    expect(report.counts.data).toBe(0);
    expect(validationExitCode(report)).toBe(0);
  });

  it("필수 파일 목록은 모두 레지스트리 config 항목이다(상수 오타 방지)", () => {
    for (const file of REQUIRED_CONFIG_FILES) {
      const entry = schemaRegistry.find((e) => e.pattern === file);
      expect([file, entry?.kind]).toEqual([file, "config"]);
    }
  });
});

describe("formatValidationReport — 출력 문구", () => {
  const report: ValidationReport = {
    configsOnly: false,
    counts: { configs: 2, data: 1, prompts: 3 },
    crossRef: { checked: ["a"], skipped: ["b", "c"] },
    issues: [
      {
        severity: "info",
        stage: "configs",
        file: "configs/sources.json",
        message: "아직 없음 · 뉴스 소스 (FR-01)",
      },
      {
        severity: "error",
        stage: "configs",
        file: "configs/team-colors.json",
        path: "sample-united.short",
        message: "약어는 100% 대문자,\n2~4자",
      },
    ],
  };

  it("단계별 건수 → 정보 → 오류 → 요약", () => {
    expect(formatValidationReport(report)).toEqual([
      "[validate] 시작 — 범위: configs + data",
      "[validate] configs: 2개 검사 · 오류 1건",
      "[validate] 교차 참조: 1건 실행 · 건너뜀 2건(관련 파일 없음) · 오류 0건",
      "[validate] 프롬프트: 3/3개 있음 · 오류 0건",
      "[validate] data: 1개 검사 · 오류 0건",
      "[validate] 정보 configs/sources.json — 아직 없음 · 뉴스 소스 (FR-01)",
      "[validate] 오류 configs/team-colors.json:sample-united.short — 약어는 100% 대문자,\n2~4자",
      "[validate] 검증 실패 — 오류 1건 (파일 1개) · configs 2개 · data 1개 · 정보 1건",
    ]);
  });

  it("경고는 정보 뒤·오류 앞에 출력하고 요약에 건수를 붙인다(Actions에서는 ::warning)", () => {
    const withWarn: ValidationReport = {
      ...report,
      issues: [
        ...report.issues,
        {
          severity: "warn",
          stage: "configs",
          file: "configs/sources.json",
          path: "[3].summarize",
          message: "summarize:true — 무시된다",
        },
      ],
    };
    const lines = formatValidationReport(withWarn);
    expect(lines.slice(5)).toEqual([
      "[validate] 정보 configs/sources.json — 아직 없음 · 뉴스 소스 (FR-01)",
      "[validate] 경고 configs/sources.json:[3].summarize — summarize:true — 무시된다",
      "[validate] 오류 configs/team-colors.json:sample-united.short — 약어는 100% 대문자,\n2~4자",
      "[validate] 검증 실패 — 오류 1건 (파일 1개) · configs 2개 · data 1개 · 정보 1건 · 경고 1건",
    ]);
    expect(validationExitCode(withWarn)).toBe(1); // 오류 1건 때문 — 경고는 종료 코드에 영향 없음
    expect(
      validationExitCode({
        ...withWarn,
        issues: withWarn.issues.filter((i) => i.severity !== "error"),
      }),
    ).toBe(0);
    expect(formatValidationReport(withWarn, { annotations: true })).toContain(
      "::warning file=configs/sources.json,title=설정·데이터 검증::[3].summarize — summarize:true — 무시된다",
    );
  });

  it("GitHub Actions 주석 — 파일 속성과 메시지를 이스케이프한다", () => {
    const lines = formatValidationReport(report, { annotations: true });
    expect(lines).toContain(
      "::error file=configs/team-colors.json,title=설정·데이터 검증::sample-united.short — 약어는 100%25 대문자,%0A2~4자",
    );
    expect(lines.some((l) => l.startsWith("[validate] 오류"))).toBe(false);
    expect(lines.at(-1)).toMatch(/^\[validate\] 검증 실패/);
  });
});

describe("parseValidateArgs", () => {
  it("기본값·--configs-only·-h", () => {
    expect(parseValidateArgs([])).toEqual({
      ok: true,
      value: { configsOnly: false, help: false },
    });
    expect(parseValidateArgs(["--configs-only"])).toEqual({
      ok: true,
      value: { configsOnly: true, help: false },
    });
    expect(parseValidateArgs(["-h"])).toEqual({
      ok: true,
      value: { configsOnly: false, help: true },
    });
  });

  it.each([["--strict"], ["configs"], ["--configs-only=yes"]])(
    "거부: %s",
    (arg) => {
      expect(parseValidateArgs([arg]).ok).toBe(false);
    },
  );
});

describe("parseValidateArgs — --publish-date (M1-25)", () => {
  it("YYYY-MM-DD·today를 받는다(없으면 키 없음)", () => {
    expect(parseValidateArgs(["--publish-date", "2026-10-17"])).toEqual({
      ok: true,
      value: { configsOnly: false, help: false, publishDate: "2026-10-17" },
    });
    expect(parseValidateArgs(["--publish-date=today"])).toEqual({
      ok: true,
      value: { configsOnly: false, help: false, publishDate: "today" },
    });
    const none = parseValidateArgs([]);
    expect(none.ok && "publishDate" in none.value).toBe(false);
  });

  it.each([
    [["--publish-date", "2026-02-30"]],
    [["--publish-date", "20261017"]],
    [["--publish-date", "yesterday"]],
    [["--publish-date"]],
    [["--configs-only", "--publish-date", "2026-10-17"]],
  ])("거부: %j", (argv) => {
    expect(parseValidateArgs(argv).ok).toBe(false);
  });

  it("today = 실행 시각의 KST 날짜(15:00Z 경계)", () => {
    expect(
      resolvePublishDate("today", new Date("2026-10-16T21:31:00.000Z")),
    ).toBe("2026-10-17");
    expect(
      resolvePublishDate("today", new Date("2026-10-17T14:59:59.000Z")),
    ).toBe("2026-10-17");
    expect(
      resolvePublishDate("today", new Date("2026-10-17T15:00:00.000Z")),
    ).toBe("2026-10-18");
    expect(resolvePublishDate("2026-10-14", new Date())).toBe("2026-10-14");
  });
});

describe("formatValidationReport — 발행 게이트 줄 (M1-25)", () => {
  const base: ValidationReport = {
    configsOnly: false,
    counts: { configs: 1, data: 2, prompts: 0 },
    crossRef: { checked: [], skipped: [] },
    issues: [],
  };
  const rest: RestPeriod = { reasons: [], basis: [] };
  const cases: Array<[GateFloor | null, string]> = [
    [null, "카드 수 하한 — 기준 날짜 없음(건너뜀)"],
    [
      {
        date: "2026-10-17",
        strict: false,
        state: "present",
        cards: 23,
        required: 10,
        rest,
      },
      "2026-10-17 카드 23장 · 하한 10장(평시)",
    ],
    [
      {
        date: "2026-10-17",
        strict: false,
        state: "missing",
        cards: 0,
        required: 10,
        rest,
      },
      "2026-10-17 발행 파일 없음 — 카드 수 하한 건너뜀",
    ],
    [
      {
        date: "2026-10-17",
        strict: true,
        state: "missing",
        cards: 0,
        required: 10,
        rest,
      },
      "2026-10-17(--publish-date) 발행 파일 없음 · 하한 10장(평시)",
    ],
    [
      {
        date: "2026-10-17",
        strict: true,
        state: "invalid",
        cards: 0,
        required: 10,
        rest,
      },
      "2026-10-17(--publish-date) 파일 스키마 오류 — 카드 수 하한 건너뜀",
    ],
    [
      {
        date: "2027-06-20",
        strict: false,
        state: "present",
        cards: 6,
        required: 5,
        rest: { reasons: ["off-season"], basis: [] },
      },
      "2027-06-20 카드 6장 · 하한 5장(휴식기 — 비시즌)",
    ],
  ];

  it.each(cases)("하한 %#", (floor, text) => {
    const lines = formatValidationReport({
      ...base,
      gate: { checked: [], newsFiles: 2, briefFiles: 1, floor },
    });
    expect(lines[5]).toBe(
      `[validate] 발행 게이트: 뉴스 2개 · 브리핑 1개 · ${text} · 오류 0건 · 경고 0건`,
    );
  });

  it("gate가 없는 보고서(--configs-only·직접 만든 값)는 게이트 줄이 없다", () => {
    expect(
      formatValidationReport(base).some((l) => l.includes("발행 게이트")),
    ).toBe(false);
  });
});
