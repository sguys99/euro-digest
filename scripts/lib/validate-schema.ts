/**
 * `npm run validate` — JSON 파일 1개의 스키마 검증 (M0-17). I/O 없는 순수 함수만 둔다.
 * 파일 목록·읽기는 scripts/lib/validate-fs.ts, 출력·종료는 scripts/validate.ts가 맡는다.
 *
 * 판정 순서 (앞에서 오류가 나면 뒤는 보지 않는다)
 *   1. 레지스트리(`@/lib/schema` schemaRegistry) 매칭 — 없으면 "미등록 파일" 오류(파일명 오타 추정)
 *   2. UTF-8 BOM — 파이프라인의 JSON.parse가 실패하므로 오류
 *   3. JSON 문법
 *   4. zod 스키마 — 이슈마다 `파일:경로 — 메시지`
 *   5. 와일드카드 파일의 파일명 = 내용(expectedBaseName), 예: data/news/2026-10-10.json의 date
 * 초안(draft) 스키마로 검증한 파일은 정보 1건을 덧붙인다(v0.1은 전부 confirmed라 지금은 나오지 않는다).
 */
import {
  baseNameOf,
  findSchemaEntry,
  normalizeRelPath,
  schemaRegistry,
  type SchemaRegistryEntry,
} from "@/lib/schema";

export type IssueSeverity = "error" | "info";

/** 이슈가 나온 검사 단계 — 단계별 건수 로그에 쓴다. */
export type ValidationStage = "configs" | "data" | "prompts" | "crossref";

export interface ValidationIssue {
  severity: IssueSeverity;
  stage: ValidationStage;
  /** 저장소 루트 기준 경로(`/` 구분), 예: `configs/sources.json` */
  file: string;
  /** 파일 안 위치(zod 경로 표기, 예: `queries[1].source`). 파일 전체에 대한 이슈면 없다. */
  path?: string;
  message: string;
}

/** 경로 → 레지스트리 항목. 테스트에서 초안 항목 등을 끼워 넣을 수 있게 주입받는다. */
export type EntryFinder = (relPath: string) => SchemaRegistryEntry | undefined;

export interface FileCheck {
  /** 정규화한 상대 경로 */
  file: string;
  entry?: SchemaRegistryEntry;
  /** 스키마·파일명 검사를 모두 통과한 값(zod 출력). 하나라도 실패하면 undefined — 교차 참조에서 빠진다. */
  parsed?: unknown;
  issues: ValidationIssue[];
}

export interface CheckFileOptions {
  stage: ValidationStage;
  findEntry?: EntryFinder;
  /** 미등록 파일의 비슷한 이름 제안에 쓸 레지스트리 */
  registry?: readonly SchemaRegistryEntry[];
}

const UTF8_BOM = "﻿";

/** 점 표기에 그대로 쓸 수 있는 키(slug·식별자). 그 밖의 키는 `["키"]`로 감싼다. */
const PLAIN_KEY = /^[A-Za-z_$][\w$-]*$/;

/**
 * zod 이슈 경로 → 사람이 읽는 표기. `["queries", 1, "source"]` → `queries[1].source`,
 * 최상위 배열 `[0, "url"]` → `[0].url`, 공백·점이 든 키 → `["Son Heung-min"]`. 빈 경로는 `(루트)`.
 */
export function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "(루트)";
  let out = "";
  for (const key of path) {
    if (typeof key === "number") out += `[${key}]`;
    else if (typeof key === "symbol") out += `[${String(key)}]`;
    else if (PLAIN_KEY.test(key)) out += out ? `.${key}` : key;
    else out += `[${JSON.stringify(key)}]`;
  }
  return out;
}

/** 이슈 1건 → `파일:경로 — 메시지` (경로가 없으면 `파일 — 메시지`). */
export function formatIssue(issue: ValidationIssue): string {
  const where = issue.path ? `${issue.file}:${issue.path}` : issue.file;
  return `${where} — ${issue.message}`;
}

/** 두 문자열의 편집 거리(Levenshtein). 미등록 파일명 제안용이라 짧은 문자열만 다룬다. */
export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    prev = curr;
  }
  return prev[b.length] ?? 0;
}

/** 제안으로 받아들일 최대 편집 거리 (예: `source.json` → `sources.json`은 1, `names.json` → `names.ko.json`은 3) */
const MAX_SUGGEST_DISTANCE = 3;

function dirOf(path: string): string {
  return path.slice(0, path.lastIndexOf("/") + 1);
}

/**
 * 미등록 파일과 같은 폴더의 고정 이름 레지스트리 경로 중 가장 비슷한 것(대소문자 무시).
 * 와일드카드 패턴은 이름 제안이 의미가 없어 뺀다. 거리가 멀면 undefined.
 */
export function suggestRegisteredPath(
  relPath: string,
  registry: readonly SchemaRegistryEntry[] = schemaRegistry,
): string | undefined {
  const file = normalizeRelPath(relPath);
  const dir = dirOf(file);
  const name = file.slice(dir.length).toLowerCase();
  let best: { path: string; distance: number } | undefined;
  for (const { pattern } of registry) {
    if (/[*?]/.test(pattern) || dirOf(pattern) !== dir) continue;
    const distance = editDistance(name, pattern.slice(dir.length));
    if (distance <= MAX_SUGGEST_DISTANCE && (!best || distance < best.distance))
      best = { path: pattern, distance };
  }
  return best?.path;
}

function unregisteredMessage(
  file: string,
  stage: ValidationStage,
  registry: readonly SchemaRegistryEntry[],
): string {
  const what = stage === "data" ? "data 파일" : "설정 파일";
  const suggestion = suggestRegisteredPath(file, registry);
  const hint = suggestion
    ? `혹시 ${suggestion}?`
    : "파일명 오타? 새 파일이면 src/lib/schema/registry.ts에 등록 — 스키마 변경은 사용자 확인 후";
  return `스키마 레지스트리에 없는 ${what} (${hint})`;
}

/**
 * JSON 파일 1개를 레지스트리 스키마로 검증한다.
 * @param relPath 저장소 루트 기준 상대 경로
 * @param text    파일 내용(UTF-8 문자열)
 */
export function checkJsonFile(
  relPath: string,
  text: string,
  options: CheckFileOptions,
): FileCheck {
  const {
    stage,
    findEntry = findSchemaEntry,
    registry = schemaRegistry,
  } = options;
  const file = normalizeRelPath(relPath);
  const error = (message: string, path?: string): ValidationIssue =>
    path === undefined
      ? { severity: "error", stage, file, message }
      : { severity: "error", stage, file, path, message };

  const entry = findEntry(file);
  if (!entry) {
    return {
      file,
      issues: [error(unregisteredMessage(file, stage, registry))],
    };
  }

  if (text.startsWith(UTF8_BOM)) {
    return {
      file,
      entry,
      issues: [error("UTF-8 BOM이 있음 — BOM 없이 UTF-8로 저장")],
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return { file, entry, issues: [error(`JSON 문법 오류: ${detail}`)] };
  }

  const issues: ValidationIssue[] = [];
  if (entry.status === "draft") {
    issues.push({
      severity: "info",
      stage,
      file,
      message: `초안(draft) 스키마로 검증 — 사용자 확인 전 (${entry.description})`,
    });
  }

  const result = entry.schema.safeParse(json);
  if (!result.success) {
    for (const issue of result.error.issues) {
      issues.push(error(issue.message, formatIssuePath(issue.path)));
    }
    return { file, entry, issues };
  }

  if (entry.expectedBaseName) {
    const expected = entry.expectedBaseName(result.data);
    const actual = baseNameOf(file);
    if (expected !== actual) {
      issues.push(
        error(
          `파일명이 내용과 다름 — 내용 기준 파일명은 "${expected}.json" (현재 "${actual}.json")`,
        ),
      );
      return { file, entry, issues };
    }
  }

  return { file, entry, parsed: result.data, issues };
}
