/**
 * 구조화 로거 + GitHub Actions 워크플로 명령 헬퍼 (M0-22, CLAUDE.md §9.1).
 *
 * 레코드 한 건 = `{ ts, level, scope, event, ...fields }`
 *   - ts: UTC ISO 8601(`toISOString()` 형식, CLAUDE.md §8). 화면용 KST는 pretty 포맷에서만 덧붙인다.
 *   - scope: 로거를 만든 모듈·진입점(`collect`·`summarize`·`llm`·`issues` …)
 *   - event: 아래 이름 규칙
 *   - fields: 단계·소스·건수·소요 시간 등 숫자·짧은 식별자 위주
 * 포맷: CI(`GITHUB_ACTIONS=true`)면 JSON 한 줄(기계가 집계), 로컬이면 읽기 쉬운 한 줄(`06:30:12 INFO …`).
 *
 * ── 이벤트 이름 규칙 ─────────────────────────────────────────────────────
 *   `<단계>.<대상>[.<동작>]` — 소문자·숫자·하이픈, 점으로 2단계 이상(isValidEventName).
 *   단계: collect · normalize · dedup · cluster · score · summarize · validate · build · weekly · ops · issues · llm
 *   예) collect.source.fetch   collect.source.skip   collect.done
 *       dedup.done             summarize.batch.submit   summarize.item.downgrade
 *       validate.gate.fail     issues.create            llm.batch.poll
 *   동작은 과거형 대신 명사·동사 원형(fetch·skip·submit·retry·done·fail)으로 쓴다.
 *
 * ── 필드 규칙 ───────────────────────────────────────────────────────────
 *   소스 단위 이벤트   source(소스 ID, configs/sources.json의 id) 필수 · items(건수) · status(HTTP 상태)
 *   단계 종료(*.done) count 또는 단계별 건수(collected·clusters·summarized·downgraded) + elapsedMs 필수
 *   실패·재시도       errorType(분류) · status · attempt/retry · delayMs — 메시지는 짧게(자동 절단)
 *   공통 선택          runId · env(dev/prod) · kind · number(이슈 번호)
 *   금지 — 비밀값(키·토큰·Authorization), 응답 본문 전체, 기사 원문·RSS 본문, 프롬프트·LLM 출력 텍스트,
 *          process.env 덤프. 실수로 넣어도 아래 안전망이 가리지만 안전망에 기대지 않는다.
 *
 * ── 안전망 (sanitizeFields) ─────────────────────────────────────────────
 *   - 키 이름이 비밀값처럼 생기면(apiKey·token·authorization·password·secret·*_KEY 등) 값 전체를 `****`로.
 *     `inputTokens`·`maxTokens`(복수형 카운터)와 그냥 `key`(이슈 원인 키 등)는 가리지 않는다.
 *   - 문자열 값 안의 비밀 패턴(sk-ant-·ghp_·github_pat_·ghs_…·`NAME=값` — scripts/lib/secret-scan.ts와 같은
 *     패턴, Bearer/Basic 인증값, URL 쿼리의 token·key)을 가린다.
 *   - 긴 문자열은 maxStringLength(기본 300자)로 자른다 — 가린 다음에 자르므로 잘린 비밀값 조각이 남지 않는다.
 *   - 깊이 5·배열 50개 초과, 순환 참조, Error(name·message만), Date·bigint를 JSON 안전한 값으로 바꾼다.
 *   - 로깅 자체의 실패(싱크 오류 등)는 삼킨다 — 로그 때문에 파이프라인이 멈추지 않는다.
 *
 * GitHub Actions 명령: formatAnnotation·annotate(`::warning file=…,title=…::메시지`), group(`::group::`).
 * 이스케이프 규칙은 GitHub 공식 문서(workflow commands)와 같다 — scripts/lib/validate-report.ts도 이것을 쓴다.
 */
import { kstParts } from "@/lib/time";

import { maskSecretsInText } from "./secret-scan";

// ─── 타입 ────────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFormat = "json" | "pretty";
export type LogFields = Readonly<Record<string, unknown>>;

export interface LogRecord {
  ts: string;
  level: LogLevel;
  scope: string;
  event: string;
  [field: string]: unknown;
}

/** 완성된 한 줄과 레코드를 받는다. 기본은 debug·info → stdout, warn·error → stderr. */
export type LogSink = (line: string, record: LogRecord) => void;

export interface Logger {
  readonly scope: string;
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  /** 고정 필드를 붙인 하위 로거(예: `log.child({ source: "bbc-sport" })`). 호출 시 필드가 우선한다. */
  child(fields: LogFields): Logger;
}

export interface LoggerOptions {
  scope: string;
  sink?: LogSink;
  /** 생략하면 env.GITHUB_ACTIONS === "true"면 json, 아니면 pretty */
  format?: LogFormat;
  /** 현재 시각 — 테스트 주입용 */
  now?: () => Date;
  /** 이 수준 미만은 버린다. 생략하면 env.RUNNER_DEBUG === "1"(Actions 디버그 재실행)이면 debug, 아니면 info */
  minLevel?: LogLevel;
  /** 기본 process.env — 포맷·수준 판단에만 읽고 출력하지 않는다 */
  env?: Readonly<Record<string, string | undefined>>;
  /** 문자열 필드 최대 길이(기본 300) */
  maxStringLength?: number;
}

// ─── 상수 ────────────────────────────────────────────────────────────────

export const MASK = "****";
export const DEFAULT_MAX_STRING_LENGTH = 300;
const MAX_DEPTH = 5;
const MAX_ARRAY_ITEMS = 50;

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** 레코드 고정 키 — 필드가 덮어쓰지 못하게 `_` 접두사로 옮긴다. */
const RESERVED_KEYS: ReadonlySet<string> = new Set([
  "ts",
  "level",
  "scope",
  "event",
]);

/**
 * 비밀값을 담는 키 이름. 끝이 단수 `token`·`key`(앞에 다른 단어가 붙은 경우)·`secret`·`password` 등.
 *   가림: apiKey · api_key · ANTHROPIC_API_KEY · privateKey · token · accessToken · GH_TOKEN · authorization
 *   통과: inputTokens · maxTokens · key · keys · cacheRead
 */
const SECRET_KEY_PATTERNS: readonly RegExp[] = [
  /token$/i,
  /(?:[a-z0-9][_-]?)key$/i,
  /^api[_-]?key$/i,
  /secret/i,
  /passw(?:or)?d/i,
  /authorization/i,
  /^auth$/i,
  /cookie/i,
  /credential/i,
  /^pat$/i,
  /signature/i,
];

/** secret-scan.ts 패턴 외에 로그에서만 가리는 값 패턴 */
const EXTRA_VALUE_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  // GitHub 토큰이 영숫자에 붙어 있는 경우 — 검사용 패턴은 오탐을 줄이려고 앞 글자를 보지만 로그는 넓게 가린다
  [/(gh[pousr])_[A-Za-z0-9]{20,}/g, `$1_${MASK}`],
  // Authorization 헤더 값
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${MASK}`],
  // URL 쿼리의 비밀 파라미터 (?api_key=… &token=…)
  [
    /([?&](?:api[_-]?key|apikey|key|token|access_token|secret|sig|signature)=)[^&#\s"']+/gi,
    `$1${MASK}`,
  ],
];

// ─── 마스킹·정리 (순수 함수) ─────────────────────────────────────────────

/** 비밀값을 담는 키 이름인가 */
export function isSecretKey(key: string): boolean {
  if (key === "key" || key === "keys") return false;
  return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/** 문자열 안의 비밀 패턴을 가린다(자르지 않음). */
export function maskText(text: string): string {
  let masked = maskSecretsInText(text);
  for (const [pattern, replacement] of EXTRA_VALUE_PATTERNS) {
    masked = masked.replace(pattern, replacement);
  }
  return masked;
}

/** 길이 제한 — 넘치면 `…(+N자)`를 붙인다. */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…(+${text.length - maxLength}자)`;
}

/** 가린 뒤 자른다(순서가 중요 — 먼저 자르면 비밀값 앞부분이 남을 수 있다). */
export function sanitizeText(
  text: string,
  maxLength: number = DEFAULT_MAX_STRING_LENGTH,
): string {
  return truncateText(maskText(text), maxLength);
}

function sanitizeValue(
  value: unknown,
  maxLength: number,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null) return null;
  switch (typeof value) {
    case "string":
      return sanitizeText(value, maxLength);
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "boolean":
      return value;
    case "bigint":
      return value.toString();
    case "undefined":
    case "function":
    case "symbol":
      return undefined;
    default:
      break;
  }
  const object = value as object;
  if (object instanceof Date) {
    return Number.isNaN(object.getTime())
      ? "Invalid Date"
      : object.toISOString();
  }
  if (seen.has(object)) return "[Circular]";
  if (depth >= MAX_DEPTH) return Array.isArray(object) ? "[Array]" : "[Object]";
  seen.add(object);
  try {
    if (object instanceof Error) {
      // 스택은 남기지 않는다(경로·내부 구조 노출, 길이). name·message만.
      return {
        name: object.name,
        message: sanitizeText(object.message, maxLength),
      };
    }
    if (Array.isArray(object)) {
      const items = object
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => sanitizeValue(item, maxLength, depth + 1, seen) ?? null);
      if (object.length > MAX_ARRAY_ITEMS) {
        items.push(`…(+${object.length - MAX_ARRAY_ITEMS}개)`);
      }
      return items;
    }
    return sanitizeRecord(
      object as Record<string, unknown>,
      maxLength,
      depth + 1,
      seen,
    );
  } finally {
    seen.delete(object);
  }
}

function sanitizeRecord(
  record: Readonly<Record<string, unknown>>,
  maxLength: number,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (raw === undefined) continue;
    if (isSecretKey(key)) {
      out[key] = MASK;
      continue;
    }
    const value = sanitizeValue(raw, maxLength, depth, seen);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * 로그 필드 정리 — 키 이름 마스킹·값 패턴 마스킹·절단·JSON 안전화. 레코드 고정 키(ts·level·scope·event)는
 * `_ts`처럼 옮긴다. 입력은 바꾸지 않는다.
 */
export function sanitizeFields(
  fields: LogFields,
  maxLength: number = DEFAULT_MAX_STRING_LENGTH,
): Record<string, unknown> {
  const renamed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    renamed[RESERVED_KEYS.has(key) ? `_${key}` : key] = value;
  }
  return sanitizeRecord(renamed, maxLength, 0, new WeakSet());
}

const EVENT_NAME_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/;

/** 이벤트 이름 규칙(`<단계>.<대상>[.<동작>]`)에 맞는가. 로거는 어긋나도 기록한다(테스트·리뷰용 검사). */
export function isValidEventName(event: string): boolean {
  return EVENT_NAME_PATTERN.test(event);
}

// ─── 포맷 ────────────────────────────────────────────────────────────────

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** pretty 포맷의 값 표기 — 공백·따옴표·`=`가 없는 짧은 문자열은 그대로, 나머지는 JSON. */
function prettyValue(value: unknown): string {
  if (typeof value === "string") {
    return /^[^\s"'=]+$/.test(value) ? value : JSON.stringify(value);
  }
  return JSON.stringify(value) ?? String(value);
}

/** 레코드 → 한 줄. json은 `JSON.stringify`, pretty는 `HH:MM:SS LEVEL [scope] event k=v …`(시각은 KST). */
export function formatRecord(record: LogRecord, format: LogFormat): string {
  if (format === "json") return JSON.stringify(record);
  const { ts, level, scope, event, ...fields } = record;
  let clock = ts;
  try {
    const p = kstParts(ts);
    clock = `${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
  } catch {
    // ts 형식이 어긋나도 줄은 남긴다
  }
  const head = `${clock} ${level.toUpperCase().padEnd(5)} [${scope}] ${event}`;
  const tail = Object.entries(fields)
    .map(([key, value]) => `${key}=${prettyValue(value)}`)
    .join(" ");
  return tail ? `${head} ${tail}` : head;
}

/** CI면 json, 아니면 pretty */
export function resolveLogFormat(
  env: Readonly<Record<string, string | undefined>> = process.env,
): LogFormat {
  return env.GITHUB_ACTIONS === "true" ? "json" : "pretty";
}

const defaultSink: LogSink = (line, record) => {
  if (record.level === "warn" || record.level === "error") console.error(line);
  else console.log(line);
};

// ─── 로거 ────────────────────────────────────────────────────────────────

export function createLogger(options: LoggerOptions): Logger {
  const env = options.env ?? process.env;
  const settings = {
    scope: options.scope,
    sink: options.sink ?? defaultSink,
    format: options.format ?? resolveLogFormat(env),
    now: options.now ?? (() => new Date()),
    minLevel: options.minLevel ?? (env.RUNNER_DEBUG === "1" ? "debug" : "info"),
    maxStringLength: options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH,
  } satisfies Required<Omit<LoggerOptions, "env">>;
  return buildLogger(settings, {});
}

type LoggerSettings = Required<Omit<LoggerOptions, "env">>;

function buildLogger(settings: LoggerSettings, bindings: LogFields): Logger {
  const write = (level: LogLevel, event: string, fields?: LogFields): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[settings.minLevel]) return;
    let record: LogRecord;
    try {
      let ts: string;
      try {
        ts = settings.now().toISOString();
      } catch {
        ts = new Date().toISOString();
      }
      record = {
        ts,
        level,
        scope: settings.scope,
        event: sanitizeText(String(event), 120),
        ...sanitizeFields({ ...bindings, ...fields }, settings.maxStringLength),
      };
    } catch {
      // 필드 정리에 실패해도(이상한 getter 등) 이벤트 이름만이라도 남긴다
      record = {
        ts: new Date().toISOString(),
        level,
        scope: settings.scope,
        event: sanitizeText(String(event), 120),
        logError: "fields-unserializable",
      };
    }
    try {
      settings.sink(formatRecord(record, settings.format), record);
    } catch {
      // 로그 출력 실패로 파이프라인을 멈추지 않는다
    }
  };
  return {
    scope: settings.scope,
    debug: (event, fields) => write("debug", event, fields),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
    child: (fields) => buildLogger(settings, { ...bindings, ...fields }),
  };
}

// ─── GitHub Actions 워크플로 명령 ────────────────────────────────────────

/** `::cmd::` 메시지(데이터) 이스케이프 — `%`·CR·LF */
export function escapeCommandData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** `::cmd key=value::` 속성 값 이스케이프 — 데이터 규칙 + `:`·`,` */
export function escapeCommandProperty(value: string): string {
  return escapeCommandData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

export type AnnotationLevel = "notice" | "warning" | "error";

export interface AnnotationProperties {
  title?: string;
  file?: string;
  line?: number;
  endLine?: number;
  col?: number;
  endColumn?: number;
}

/** 속성 출력 순서(GitHub 문서 예시 순) */
const ANNOTATION_KEYS = [
  "file",
  "line",
  "endLine",
  "col",
  "endColumn",
  "title",
] as const satisfies ReadonlyArray<keyof AnnotationProperties>;

/** 주석 한 줄 — 이스케이프만 한다(마스킹·절단은 annotate가). */
export function formatAnnotation(
  level: AnnotationLevel,
  message: string,
  properties: AnnotationProperties = {},
): string {
  const props = ANNOTATION_KEYS.flatMap((key) => {
    const value = properties[key];
    return value === undefined || value === ""
      ? []
      : [`${key}=${escapeCommandProperty(String(value))}`];
  });
  const head =
    props.length > 0 ? `::${level} ${props.join(",")}` : `::${level}`;
  return `${head}::${escapeCommandData(message)}`;
}

export interface CommandOutputOptions {
  /** 생략하면 env.GITHUB_ACTIONS === "true" */
  ci?: boolean;
  /** 기본 console.log */
  write?: (line: string) => void;
}

const isCi = (options: CommandOutputOptions): boolean =>
  options.ci ?? process.env.GITHUB_ACTIONS === "true";

/** 주석 메시지 최대 길이(실행 화면 표시용 — 긴 내용은 로그로) */
export const ANNOTATION_MAX_LENGTH = 1000;

/**
 * 실행 화면(요약·PR)에 주석을 남긴다. 메시지·제목은 가리고 자른다. 로컬에서는 `[warning] 제목: 메시지` 한 줄.
 */
export function annotate(
  level: AnnotationLevel,
  message: string,
  properties: AnnotationProperties = {},
  options: CommandOutputOptions = {},
): void {
  const write = options.write ?? console.log;
  const safeMessage = sanitizeText(message, ANNOTATION_MAX_LENGTH);
  const safeProps: AnnotationProperties = {
    ...properties,
    ...(properties.title !== undefined
      ? { title: sanitizeText(properties.title, 200) }
      : {}),
  };
  try {
    if (isCi(options)) {
      write(formatAnnotation(level, safeMessage, safeProps));
    } else {
      const where = safeProps.file
        ? ` (${safeProps.file}${safeProps.line ? `:${safeProps.line}` : ""})`
        : "";
      const title = safeProps.title ? `${safeProps.title}: ` : "";
      write(`[${level}] ${title}${safeMessage}${where}`);
    }
  } catch {
    // 출력 실패로 멈추지 않는다
  }
}

/**
 * 로그를 접을 수 있는 묶음으로 감싼다(CI `::group::`/`::endgroup::`, 로컬 `── 이름`). fn이 던져도 닫는다.
 * 묶음은 중첩할 수 없다(GitHub 제약) — 바깥 단계에서만 쓴다.
 */
export async function group<T>(
  name: string,
  fn: () => T | Promise<T>,
  options: CommandOutputOptions = {},
): Promise<T> {
  const write = options.write ?? console.log;
  const ci = isCi(options);
  const title = sanitizeText(name, 200).replace(/[\r\n]+/g, " ");
  write(ci ? `::group::${title}` : `── ${title}`);
  try {
    return await fn();
  } finally {
    if (ci) write("::endgroup::");
  }
}
