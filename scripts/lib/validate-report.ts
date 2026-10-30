/**
 * `npm run validate` 판정·출력 문구 (M0-17) — I/O 없는 순수 함수만 둔다.
 * 파일 목록·읽기는 scripts/lib/validate-fs.ts, 출력·종료 코드 반영은 scripts/validate.ts가 맡는다.
 *
 * 검사 범위 (1차)
 *   - configs/ 아래 모든 .json(하위 폴더 포함, prompts/ 제외): 레지스트리 스키마. 미등록 파일명은 오류.
 *     레지스트리 config 항목 중 없는 파일은 정보, 필수 파일(REQUIRED_CONFIG_FILES)이 없으면 오류.
 *   - 교차 참조: validate-crossref.ts (관련 파일이 모두 있을 때만)
 *   - 소스 설정 경고(M1-02): sources.json이 스키마를 통과하면 수집 조건 모순·summarize:true를 경고(오류 아님 — exit 0)
 *   - configs/prompts/의 PROMPT_FILES: 있으면 비어 있지 않은지만, 없으면 정보
 *   - 소스 보존 기간 일관성(M1-25): 같은 매체명(`publisherNameOf`)의 소스끼리 `retentionDays`가 같아야 한다(오류) — 카드 출처는
 *     매체명으로 보존 기간을 찾는다(purge-plan.ts)
 *   - data/ 아래 모든 .json: 있으면 레지스트리 스키마 + 파일명 검사. 미등록 파일은 오류(`--configs-only`면 건너뜀)
 *   - 발행 검증 게이트(M1-25, FR-153 — publish-gate.ts): 스키마를 통과한 data·configs 값으로 카드 내용(ai·요약 줄·링크 형식)·
 *     미래 날짜·카드 수 하한(발행일 파일 ≥ 10, 휴식기 5) = 오류, 남은 삭제 요청 카드·보존 기간 만료 출처·72시간·매체명 = 경고.
 *     시각 기준 검사는 `now`가 있을 때만(진입점이 실행 시각을 넘긴다). `--configs-only`면 건너뜀.
 */
import { parseArgs } from "node:util";

import {
  IsoDateSchema,
  schemaRegistry,
  type SchemaRegistryEntry,
} from "@/lib/schema";
import { kstDate, nowUtcIso } from "@/lib/time";

import type { ParseResult } from "./cli-args";
import { formatAnnotation } from "./logger";
import {
  isDailyNewsPath,
  pickGateInput,
  restLabel,
  runPublishGate,
  type GateFloor,
} from "./publish-gate";
import { publisherRetentionConflicts } from "./purge-plan";
import { sourceConfigWarnings } from "./sources";
import {
  CROSSREF_FILES,
  pickCrossRefInput,
  runCrossRefChecks,
} from "./validate-crossref";
import {
  checkJsonFile,
  formatIssue,
  formatIssuePath,
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
  /**
   * 실행 시각 — 발행 게이트의 시각 기준 검사(미래 날짜·보존 기간 만료·72시간, 발행일 기본값 = KST 오늘)에 쓴다.
   * 없으면 그 검사들을 건너뛴다(테스트가 시각과 무관한 검사만 볼 때). 진입점(scripts/validate.ts)은 항상 넘긴다.
   */
  now?: Date;
  /** 카드 수 하한을 볼 발행일(`--publish-date` — resolvePublishDate로 푼 YYYY-MM-DD). 주면 그 파일이 없을 때 오류 */
  publishDate?: string;
  /** 테스트 주입용 — 기본값은 `@/lib/schema`의 레지스트리 */
  registry?: readonly SchemaRegistryEntry[];
  findEntry?: EntryFinder;
}

/** 발행 검증 게이트 요약(출력 한 줄) — `--configs-only`면 없다 */
export interface GateSummary {
  /** 실행한 검사 이름 */
  checked: string[];
  /** 검사한 일별 뉴스·브리핑 파일 수(스키마 통과분) */
  newsFiles: number;
  briefFiles: number;
  /** 카드 수 하한 — 발행일을 정하지 못했으면 null */
  floor: GateFloor | null;
}

export interface ValidationReport {
  configsOnly: boolean;
  counts: { configs: number; data: number; prompts: number };
  crossRef: { checked: string[]; skipped: string[] };
  /** 발행 검증 게이트(M1-25) — `--configs-only`이거나 직접 만든 보고서면 없다 */
  gate?: GateSummary;
  /** 오류·경고·정보 전부 (단계 → 파일 순) */
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
  const {
    configsOnly,
    registry = schemaRegistry,
    findEntry,
    now,
    publishDate,
  } = options;
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
  const crossRefInput = pickCrossRefInput(parsedByPath);
  const crossRef = runCrossRefChecks(crossRefInput);
  issues.push(...crossRef.issues);

  // ③-2 소스 설정 경고 — 스키마는 통과했지만 수집 조건(FR-01)과 어긋나는 값(오류 아님)
  if (crossRefInput.sources) {
    for (const warning of sourceConfigWarnings(crossRefInput.sources)) {
      issues.push({
        severity: "warn",
        stage: "configs",
        file: CROSSREF_FILES.sources,
        path: formatIssuePath([warning.index, warning.field]),
        message: warning.message,
      });
    }
  }

  // ③-3 같은 매체명끼리 보존 기간이 같아야 한다(M1-25 — 카드 출처는 매체명으로 보존 기간을 찾는다, purge-plan.ts)
  if (crossRefInput.sources) {
    for (const conflict of publisherRetentionConflicts(crossRefInput.sources)) {
      const first = conflict.sources[0];
      const odd =
        conflict.sources.find(
          (s) => s.retentionDays !== first?.retentionDays,
        ) ?? first;
      const values = conflict.sources
        .map((s) => `${s.id}: ${s.retentionDays ?? "없음"}`)
        .join(", ");
      issues.push({
        severity: "error",
        stage: "configs",
        file: CROSSREF_FILES.sources,
        path: formatIssuePath([odd?.index ?? 0, "retentionDays"]),
        message: `매체명 "${conflict.publisher}"의 소스끼리 retentionDays가 다름(${values}) — 카드 출처는 매체명으로 보존 기간을 찾으므로 같은 값이어야 한다(D32·M1-25)`,
      });
    }
  }

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

  // ⑤-2 data 교차 참조(팀 파일 ↔ configs — M2-06·M2-07). 결과는 ③ 교차 참조 집계에 합친다
  const dataCrossRef = runCrossRefChecks(
    pickCrossRefInput(parsedByPath),
    "data",
  );
  crossRef.checked.push(...dataCrossRef.checked);
  crossRef.skipped.push(...dataCrossRef.skipped);
  issues.push(...dataCrossRef.issues);

  // ⑥ 발행 검증 게이트(M1-25) — 스키마를 통과한 data·configs 값만
  let gate: GateSummary | undefined;
  if (!configsOnly) {
    const input = pickGateInput(parsedByPath, {
      newsPaths: snapshot.dataFiles
        .map((f) => f.relPath)
        .filter(isDailyNewsPath),
      ...(now !== undefined ? { now: nowUtcIso(now) } : {}),
      ...(publishDate !== undefined ? { publishDate } : {}),
    });
    const result = runPublishGate(input);
    issues.push(...result.issues);
    gate = {
      checked: result.checked,
      newsFiles: input.news.length,
      briefFiles: input.briefs.length,
      floor: result.floor,
    };
  }

  return {
    configsOnly,
    counts: {
      configs: snapshot.configFiles.length,
      data: configsOnly ? 0 : snapshot.dataFiles.length,
      prompts: snapshot.promptFiles.length,
    },
    crossRef: { checked: crossRef.checked, skipped: crossRef.skipped },
    ...(gate ? { gate } : {}),
    issues,
  };
}

/** 게이트 요약 한 줄의 하한 부분 */
function formatFloor(floor: GateFloor | null): string {
  if (floor === null) return "카드 수 하한 — 기준 날짜 없음(건너뜀)";
  const where = `${floor.date}${floor.strict ? "(--publish-date)" : ""}`;
  const required = `하한 ${floor.required}장(${restLabel(floor.rest)})`;
  switch (floor.state) {
    case "present":
      return `${where} 카드 ${floor.cards}장 · ${required}`;
    case "invalid":
      return `${where} 파일 스키마 오류 — 카드 수 하한 건너뜀`;
    case "missing":
      return floor.strict
        ? `${where} 발행 파일 없음 · ${required}`
        : `${where} 발행 파일 없음 — 카드 수 하한 건너뜀`;
  }
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
 * 결과 → 출력 줄. 단계별 건수 → 정보 → 경고 → 오류 → 요약 순. 경고는 있을 때만 요약에 건수를 붙인다.
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
  const titleOf = (issue: ValidationIssue) =>
    issue.stage === "gate" ? "발행 검증 게이트 (FR-153)" : "설정·데이터 검증";

  const lines = [
    `${tag} 시작 — 범위: ${report.configsOnly ? "configs만 (--configs-only)" : "configs + data"}`,
    `${tag} configs: ${counts.configs}개 검사 · 오류 ${errors("configs")}건`,
    `${tag} 교차 참조: ${crossRef.checked.length}건 실행 · 건너뜀 ${crossRef.skipped.length}건(관련 파일 없음) · 오류 ${errors("crossref")}건`,
    `${tag} 프롬프트: ${counts.prompts}/${PROMPT_FILES.length}개 있음 · 오류 ${errors("prompts")}건`,
    report.configsOnly
      ? `${tag} data: 건너뜀 (--configs-only)`
      : `${tag} data: ${counts.data}개 검사 · 오류 ${errors("data")}건`,
  ];
  if (report.gate) {
    const { gate } = report;
    lines.push(
      `${tag} 발행 게이트: 뉴스 ${gate.newsFiles}개 · 브리핑 ${gate.briefFiles}개 · ${formatFloor(gate.floor)} · 오류 ${errors("gate")}건 · 경고 ${countIssues(report, "warn", "gate")}건`,
    );
  }

  for (const issue of report.issues) {
    if (issue.severity === "info")
      lines.push(`${tag} 정보 ${formatIssue(issue)}`);
  }

  for (const issue of report.issues) {
    if (issue.severity !== "warn") continue;
    if (!annotations) {
      lines.push(`${tag} 경고 ${formatIssue(issue)}`);
      continue;
    }
    const message = issue.path
      ? `${issue.path} — ${issue.message}`
      : issue.message;
    lines.push(
      formatAnnotation("warning", message, {
        file: issue.file,
        title: titleOf(issue),
      }),
    );
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
        formatAnnotation("error", message, {
          file,
          title: titleOf(issue),
        }),
      );
    }
    const omitted = group.length - maxIssuesPerFile;
    if (omitted > 0) lines.push(`${tag} 오류 ${file} — … 외 ${omitted}건 생략`);
  }

  const infoCount = countIssues(report, "info");
  const warnCount = countIssues(report, "warn");
  const scope = `configs ${counts.configs}개 · data ${counts.data}개 · 정보 ${infoCount}건${warnCount > 0 ? ` · 경고 ${warnCount}건` : ""}`;
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
  /** `--publish-date` 원문(YYYY-MM-DD 또는 today) — 없으면 키가 없다 */
  publishDate?: string;
}

export const VALIDATE_USAGE = [
  "사용법: npm run validate -- [--configs-only] [--publish-date <YYYY-MM-DD|today>]",
  "  --configs-only           configs/만 검사 (data/·발행 게이트 건너뜀)",
  "  --publish-date <날짜>    카드 수 하한을 볼 발행일(KST) — 그 파일이 없으면 오류. today = 실행 시각의 KST 날짜.",
  "                           생략하면 KST 오늘 파일이 있을 때만 하한을 본다(사람 push의 CI용)",
  "  --help, -h               이 도움말",
  "종료 코드: 오류 0건이면 0, 1건 이상이면 1",
].join("\n");

/** `--publish-date` 원문 → YYYY-MM-DD (today = 실행 시각의 KST 날짜) */
export function resolvePublishDate(raw: string, now: Date): string {
  return raw === "today" ? kstDate(nowUtcIso(now)) : raw;
}

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
        "publish-date": { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    });
    const configsOnly = values["configs-only"] ?? false;
    const publishDate = values["publish-date"];
    if (publishDate !== undefined) {
      if (
        publishDate !== "today" &&
        !IsoDateSchema.safeParse(publishDate).success
      ) {
        return {
          ok: false,
          error: `--publish-date는 YYYY-MM-DD 또는 today (받은 값: "${publishDate}")`,
        };
      }
      if (configsOnly) {
        return {
          ok: false,
          error:
            "--publish-date는 --configs-only와 함께 쓸 수 없다(data를 읽지 않음)",
        };
      }
    }
    return {
      ok: true,
      value: {
        configsOnly,
        help: values.help ?? false,
        ...(publishDate !== undefined ? { publishDate } : {}),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
