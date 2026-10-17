/**
 * collect 단계 → 뒤 단계 출력 (M1-26 — CLAUDE.md §6.1, FR-153) — `$GITHUB_OUTPUT`(key=value 줄)·Step Summary 문자열을 만드는
 * 순수 함수와, 파일 쓰기를 주입받는 얇은 쓰기 함수. 진입점은 scripts/collect.ts(실행 결과 → 출력, Actions에서만 파일이 있다).
 *
 * collect.yml이 `steps.collect.outputs.<키>`로 읽는 키 — `COLLECT_OUTPUT_KEYS`(tests/collect-workflow.test.ts가 워크플로의 참조와
 * 이 목록을 대조한다. 키를 바꾸면 워크플로도 함께)
 *   publish_date  KST 발행일(YYYY-MM-DD) = 수집 시작 시각의 KST 날짜(collect-run.ts runCollect) — 이번 실행이 쓴 data/news·data/briefs
 *                 파일 이름. 검증 게이트 `npm run validate -- --publish-date`와 data 커밋 메시지(`chore(data): <발행일> 발행`)가 쓴다.
 *                 검증·커밋 시각으로 날짜를 다시 계산하지 않는다 — 자정을 넘긴 실행에서 수집이 쓴 파일과 어긋난다(M1-25 이월).
 *   run_id        실행 기록 runId(data/runs.json) — 실패 이슈·Step Summary·실패 실행 기록(M1-27)이 같은 실행을 가리키게
 *   status        RunLog.status 판정값(success·partial·failed·skipped) — 기록하지 않은 실행도 값은 있다
 *   run_recorded  true = 이번 실행 기록을 runs.json(prod)·runs-dev.json(dev)에 썼다 · false = 쓰지 않았다(데이터·LLM 호출이
 *                 없는 mock·dry 실행이거나 기록 실패). 실패 실행 기록 보존(M1-27)이 "보존할 기록이 있는가"를 이 값으로 안다.
 *
 * 출력은 수집 단계의 성공·실패와 상관없이 쓴다(exit 1 실행도 — 뒤의 실패 단계 기록·M1-27이 읽는다). 예상 밖 예외로 runCollect가
 * 결과를 돌려주지 못하면 출력이 없다(그때는 검증 단계가 돌지 않는다).
 */
import { IsoDateSchema, type RunLog } from "@/lib/schema";

/** collect.yml이 참조하는 단계 출력 키(순서 = 출력 순서) */
export const COLLECT_OUTPUT_KEYS = [
  "publish_date",
  "run_id",
  "status",
  "run_recorded",
] as const;

export type CollectOutputKey = (typeof COLLECT_OUTPUT_KEYS)[number];

export interface CollectStepOutputs {
  publishDate: string;
  runId: string;
  status: RunLog["status"];
  runRecorded: boolean;
}

/** runCollect 결과(CollectOutcome)에서 출력에 쓰는 필드만 — 결과 타입의 다른 필드가 바뀌어도 여기는 영향이 없게 */
export interface CollectOutputSource {
  publishDate: string;
  runId: string;
  status: RunLog["status"];
  /** 기록한 실행 로그 — 기록하지 않았으면 null */
  run: unknown;
}

export function collectStepOutputsOf(
  outcome: CollectOutputSource,
): CollectStepOutputs {
  return {
    publishDate: outcome.publishDate,
    runId: outcome.runId,
    status: outcome.status,
    runRecorded: outcome.run !== null,
  };
}

/**
 * 값 하나 검사 — `$GITHUB_OUTPUT`은 줄 단위 key=value라 줄바꿈이 들어가면 다른 키를 덮어쓸 수 있다(출력 주입). 값은 모두 코드가
 * 만든 것이지만 경계에서 한 번 더 막는다. 빈 값도 거부한다(뒤 단계가 빈 발행일로 검증하지 않게).
 */
function outputValue(key: CollectOutputKey, value: string): string {
  if (value === "" || /[\r\n]/.test(value)) {
    throw new Error(
      `collect 단계 출력 ${key}가 비었거나 줄바꿈을 포함한다 — 출력하지 않는다`,
    );
  }
  return value;
}

/** `$GITHUB_OUTPUT`에 덧붙일 문자열(key=value 줄, 끝 줄바꿈 포함). 발행일 형식이 틀리면 던진다. */
export function formatCollectOutputs(outputs: CollectStepOutputs): string {
  if (!IsoDateSchema.safeParse(outputs.publishDate).success) {
    throw new Error(
      `collect 단계 출력 publish_date가 YYYY-MM-DD가 아니다(받은 값 길이 ${outputs.publishDate.length})`,
    );
  }
  const values: Record<CollectOutputKey, string> = {
    publish_date: outputs.publishDate,
    run_id: outputs.runId,
    status: outputs.status,
    run_recorded: outputs.runRecorded ? "true" : "false",
  };
  return COLLECT_OUTPUT_KEYS.map(
    (key) => `${key}=${outputValue(key, values[key])}\n`,
  ).join("");
}

/** `$GITHUB_STEP_SUMMARY`에 덧붙일 마크다운 — 뒤 단계(검증·커밋)가 쓰는 발행일을 실행 요약에서 바로 보이게 */
export function formatCollectSummary(outputs: CollectStepOutputs): string {
  const cell = (value: string) => value.replace(/\|/g, "\\|");
  return [
    "## 수집 결과",
    "",
    "| 항목 | 값 |",
    "|---|---|",
    `| 발행일 (KST) | ${cell(outputs.publishDate)} |`,
    `| runId | \`${cell(outputs.runId)}\` |`,
    `| 상태 | ${cell(outputs.status)} |`,
    `| 실행 기록 | ${outputs.runRecorded ? "기록함" : "기록 안 함"} |`,
    `| 검증 게이트 | \`npm run validate -- --publish-date ${cell(outputs.publishDate)}\` |`,
    "",
  ].join("\n");
}

export interface WriteCollectOutputsInput {
  outputs: CollectStepOutputs;
  /** `$GITHUB_OUTPUT` 경로 — 없으면(로컬) 쓰지 않는다 */
  outputFile: string | null;
  /** `$GITHUB_STEP_SUMMARY` 경로 — 없으면 쓰지 않는다 */
  summaryFile: string | null;
  append: (file: string, text: string) => void;
}

export interface WriteCollectOutputsResult {
  /** 단계 출력을 썼거나 쓸 곳이 없었다(로컬) — false면 뒤 단계가 발행일을 모른다 */
  ok: boolean;
  wroteOutputs: boolean;
  /** 단계 출력 쓰기 오류(ok:false일 때) */
  error: string | null;
  /** Step Summary 쓰기 오류 — 요약은 보조라 ok에 영향이 없다 */
  summaryError: string | null;
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "")
    : String(error);
}

/** 단계 출력·요약 쓰기. 던지지 않는다 — 출력 실패는 결과로 알리고, 진입점이 종료 코드를 정한다. */
export function writeCollectOutputs(
  input: WriteCollectOutputsInput,
): WriteCollectOutputsResult {
  let error: string | null = null;
  let wroteOutputs = false;
  if (input.outputFile) {
    try {
      input.append(input.outputFile, formatCollectOutputs(input.outputs));
      wroteOutputs = true;
    } catch (e) {
      error = messageOf(e);
    }
  }
  let summaryError: string | null = null;
  if (input.summaryFile) {
    try {
      input.append(input.summaryFile, formatCollectSummary(input.outputs));
    } catch (e) {
      summaryError = messageOf(e);
    }
  }
  return { ok: error === null, wroteOutputs, error, summaryError };
}
