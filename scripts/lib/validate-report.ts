/**
 * `npm run validate` 판정·출력 문구 (M0-17) — I/O 없는 순수 함수만 둔다.
 * 파일 목록·읽기는 scripts/lib/validate-fs.ts, 출력·종료 코드 반영은 scripts/validate.ts가 맡는다.
 *
 * 검사 범위 (1차)
 *   - configs/ 아래 모든 .json(하위 폴더 포함, prompts/ 제외): 레지스트리 스키마. 미등록 파일명은 오류.
 *     레지스트리 config 항목 중 없는 파일은 정보, 필수 파일(REQUIRED_CONFIG_FILES)이 없으면 오류.
 *   - 교차 참조: validate-crossref.ts (관련 파일이 모두 있을 때만)
 *   - configs/prompts/의 PROMPT_FILES: 있으면 비어 있지 않은지만, 없으면 정보
 *   - data/ 아래 모든 .json: 있으면 레지스트리 스키마 + 파일명 검사. 미등록 파일은 오류(`--configs-only`면 건너뜀)
 * 발행 검증 게이트(카드 수 하한·링크 형식·takedowns 제외 등)는 M1-25에서 여기에 붙인다.
 */
import { parseArgs } from "node:util";

import { schemaRegistry, type SchemaRegistryEntry } from "@/lib/schema";

import type { ParseResult } from "./cli-args";
import { pickCrossRefInput, runCrossRefChecks } from "./validate-crossref";
import {
  checkJsonFile,
  formatIssue,
  type EntryFinder,
  type ValidationIssue,
  type ValidationStage,
} from "./validate-schema";

/** 없으면 오류인 configs. 나머지는 기능 단계(M0-23 sources, M0-32 한국 선수 등)에서 생긴다. */
export const REQUIRED_CONFIG_FILES: readonly string[] = [
  "configs/takedowns.json",
];

export const PROMPTS_DIR = "configs/prompts";

/** LLM 호출 3곳의 프롬프트 (CLAUDE.md §1-3) — 있으면 비어 있지 않아야 한다. */
export const PROMPT_FILES: readonly string[] = [
  "summarize.md",
  "team-profile.md",
  "weekly-kr.md",
];

/** 파일별로 출력할 최대 이슈 수 — 넘치면 "… 외 N건"으로 줄인다(건수 집계는 전부 센다). */
export const MAX_ISSUES_PER_FILE = 10;

/** 읽은 파일 1개. 읽기에 실패하면 readError(오류로 보고). */
export type SnapshotFile =
  { relPath: string; text: string } | { relPath: string; readError: string };

/** validate-fs.ts가 디스크에서 모은 검사 대상. 경로는 저장소 루트 기준(`/` 구분). */
export interface ValidationSnapshot {
  /** configs/ 아래 .json (prompts/ 제외) */
  configFiles: readonly SnapshotFile[];
  /** data/ 아래 .json (`--configs-only`면 비어 있다) */
  dataFiles: readonly SnapshotFile[];
  /** configs/prompts/ 중 PROMPT_FILES에 있는 파일 */
  promptFiles: readonly SnapshotFile[];
}

export interface ValidationOptions {
  configsOnly: boolean;
  /** 테스트 주입용 — 기본값은 `@/lib/schema`의 레지스트리 */
  registry?: readonly SchemaRegistryEntry[];
  findEntry?: EntryFinder;
}

export interface ValidationReport {
  configsOnly: boolean;
  counts: { configs: number; data: number; prompts: number };
  crossRef: { checked: string[]; skipped: string[] };
  /** 오류·정보 전부 (단계 → 파일 순) */
  issues: ValidationIssue[];
}

function readErrorIssue(
  file: string,
  stage: ValidationStage,
  readError: string,
): ValidationIssue {
  return {
    severity: "error",
    stage,
    file,
    message: `파일을 읽지 못함: ${readError}`,
  };
}

function byRelPath(a: SnapshotFile, b: SnapshotFile): number {
  return a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0;
}

/** 스냅숏 → 검증 결과. */
export function buildValidationReport(
  snapshot: ValidationSnapshot,
  options: ValidationOptions,
): ValidationReport {
  const { configsOnly, registry = schemaRegistry, findEntry } = options;
  const issues: ValidationIssue[] = [];
  const parsedByPath = new Map<string, unknown>();

  const checkFiles = (
    files: readonly SnapshotFile[],
    stage: ValidationStage,
  ): void => {
    for (const f of [...files].sort(byRelPath)) {
      if ("readError" in f) {
        issues.push(readErrorIssue(f.relPath, stage, f.readError));
        continue;
      }
      const check = checkJsonFile(f.relPath, f.text, {
        stage,
        registry,
        ...(findEntry ? { findEntry } : {}),
      });
      issues.push(...check.issues);
      if (check.parsed !== undefined)
        parsedByPath.set(check.file, check.parsed);
    }
  };

  // ① configs 스키마
  checkFiles(snapshot.configFiles, "configs");

  // ② 레지스트리 config 항목 중 없는 파일 — 필수면 오류, 아니면 정보
  const present = new Set(snapshot.configFiles.map((f) => f.relPath));
  for (const entry of registry) {
    if (entry.kind !== "config" || /[*?]/.test(entry.pattern)) continue;
    if (present.has(entry.pattern)) continue;
    issues.push(
      REQUIRED_CONFIG_FILES.includes(entry.pattern)
        ? {
            severity: "error",
            stage: "configs",
            file: entry.pattern,
            message: `필수 설정 파일이 없음 · ${entry.description}`,
          }
        : {
            severity: "info",
            stage: "configs",
            file: entry.pattern,
            message: `아직 없음 · ${entry.description}`,
          },
    );
  }

  // ③ 교차 참조
  const crossRef = runCrossRefChecks(pickCrossRefInput(parsedByPath));
  issues.push(...crossRef.issues);

  // ④ 프롬프트 — 있으면 비어 있지 않은지만
  const prompts = new Map(snapshot.promptFiles.map((f) => [f.relPath, f]));
  for (const name of PROMPT_FILES) {
    const file = `${PROMPTS_DIR}/${name}`;
    const prompt = prompts.get(file);
    if (!prompt) {
      issues.push({
        severity: "info",
        stage: "prompts",
        file,
        message: "아직 없음 · 해당 LLM 기능 단계에서 추가",
      });
    } else if ("readError" in prompt) {
      issues.push(readErrorIssue(file, "prompts", prompt.readError));
    } else if (prompt.text.trim() === "") {
      issues.push({
        severity: "error",
        stage: "prompts",
        file,
        message: "프롬프트가 비어 있음",
      });
    }
  }

  // ⑤ data 스키마
  if (!configsOnly) checkFiles(snapshot.dataFiles, "data");

  return {
    configsOnly,
    counts: {
      configs: snapshot.configFiles.length,
      data: configsOnly ? 0 : snapshot.dataFiles.length,
      prompts: snapshot.promptFiles.length,
    },
    crossRef: { checked: crossRef.checked, skipped: crossRef.skipped },
    issues,
  };
}

export function countIssues(
  report: ValidationReport,
  severity: ValidationIssue["severity"],
  stage?: ValidationStage,
): number {
  return report.issues.filter(
    (i) =>
      i.severity === severity && (stage === undefined || i.stage === stage),
  ).length;
}

/** 오류가 하나라도 있으면 1 */
export function validationExitCode(report: ValidationReport): 0 | 1 {
  return countIssues(report, "error") > 0 ? 1 : 0;
}

/** GitHub Actions 워크플로 명령의 메시지·속성 값 이스케이프 */
function escapeAnnotation(value: string, isProperty: boolean): string {
  const escaped = value
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
  return isProperty
    ? escaped.replace(/:/g, "%3A").replace(/,/g, "%2C")
    : escaped;
}

/** 이슈를 파일별로 묶는다(파일이 처음 나온 순서 유지). */
function groupByFile(
  issues: readonly ValidationIssue[],
): Map<string, ValidationIssue[]> {
  const groups = new Map<string, ValidationIssue[]>();
  for (const issue of issues) {
    const group = groups.get(issue.file);
    if (group) group.push(issue);
    else groups.set(issue.file, [issue]);
  }
  return groups;
}

export interface FormatOptions {
  tag?: string;
  maxIssuesPerFile?: number;
  /** GitHub Actions에서 오류를 `::error file=…::` 주석으로 출력(PR·실행 화면에 표시) */
  annotations?: boolean;
}

/**
 * 결과 → 출력 줄. 단계별 건수 → 정보 → 오류 → 요약 순.
 * 파일 내용은 출력하지 않는다(경로·zod 경로·메시지만).
 */
export function formatValidationReport(
  report: ValidationReport,
  options: FormatOptions = {},
): string[] {
  const {
    tag = "[validate]",
    maxIssuesPerFile = MAX_ISSUES_PER_FILE,
    annotations = false,
  } = options;
  const { counts, crossRef } = report;
  const errors = (stage: ValidationStage) =>
    countIssues(report, "error", stage);

  const lines = [
    `${tag} 시작 — 범위: ${report.configsOnly ? "configs만 (--configs-only)" : "configs + data"}`,
    `${tag} configs: ${counts.configs}개 검사 · 오류 ${errors("configs")}건`,
    `${tag} 교차 참조: ${crossRef.checked.length}건 실행 · 건너뜀 ${crossRef.skipped.length}건(관련 파일 없음) · 오류 ${errors("crossref")}건`,
    `${tag} 프롬프트: ${counts.prompts}/${PROMPT_FILES.length}개 있음 · 오류 ${errors("prompts")}건`,
    report.configsOnly
      ? `${tag} data: 건너뜀 (--configs-only)`
      : `${tag} data: ${counts.data}개 검사 · 오류 ${errors("data")}건`,
  ];

  for (const issue of report.issues) {
    if (issue.severity === "info")
      lines.push(`${tag} 정보 ${formatIssue(issue)}`);
  }

  const errorIssues = report.issues.filter((i) => i.severity === "error");
  for (const [file, group] of groupByFile(errorIssues)) {
    for (const issue of group.slice(0, maxIssuesPerFile)) {
      if (!annotations) {
        lines.push(`${tag} 오류 ${formatIssue(issue)}`);
        continue;
      }
      const message = issue.path
        ? `${issue.path} — ${issue.message}`
        : issue.message;
      lines.push(
        `::error file=${escapeAnnotation(file, true)},title=${escapeAnnotation("설정·데이터 검증", true)}::${escapeAnnotation(message, false)}`,
      );
    }
    const omitted = group.length - maxIssuesPerFile;
    if (omitted > 0) lines.push(`${tag} 오류 ${file} — … 외 ${omitted}건 생략`);
  }

  const infoCount = countIssues(report, "info");
  const scope = `configs ${counts.configs}개 · data ${counts.data}개 · 정보 ${infoCount}건`;
  if (errorIssues.length === 0) {
    lines.push(`${tag} 검증 통과 — ${scope}`);
  } else {
    const files = new Set(errorIssues.map((i) => i.file)).size;
    lines.push(
      `${tag} 검증 실패 — 오류 ${errorIssues.length}건 (파일 ${files}개) · ${scope}`,
    );
  }
  return lines;
}

// ─── 인자 ────────────────────────────────────────────────────────────────

export interface ValidateArgs {
  configsOnly: boolean;
  help: boolean;
}

export const VALIDATE_USAGE = [
  "사용법: npm run validate -- [--configs-only]",
  "  --configs-only  configs/만 검사 (data/ 건너뜀)",
  "  --help, -h      이 도움말",
  "종료 코드: 오류 0건이면 0, 1건 이상이면 1",
].join("\n");

/** validate 인자 파싱. 모르는 옵션·위치 인자는 오류. */
export function parseValidateArgs(
  argv: readonly string[],
): ParseResult<ValidateArgs> {
  try {
    const { values } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: {
        "configs-only": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
    return {
      ok: true,
      value: {
        configsOnly: values["configs-only"] ?? false,
        help: values.help ?? false,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
