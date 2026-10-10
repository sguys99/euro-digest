/**
 * `npm run collect` 인자 파싱 (M0-04). I/O 없는 순수 함수만 둔다 — 출력·종료는 scripts/collect.ts가 맡는다.
 *
 * 지원 인자
 *   --limit <n>  소량 실행: 요약 대상을 상위 n건으로 줄인다(양의 정수). 생략하면 MAX_ITEMS_PER_RUN을 따른다.
 *   --dry        data/ 산출물을 쓰지 않고 결과를 출력만 한다.
 *   --mock       LLM을 부르지 않고 fixtures/llm/ 응답을 쓴다. 환경변수 LLM_MODE=mock과 같은 의미이며,
 *                LLM_MODE 값보다 우선한다(--mock이 있으면 LLM_MODE=live여도 mock).
 *   --help, -h   사용법 출력
 */
import { parseArgs } from "node:util";

export type LlmMode = "live" | "mock";

export interface CollectArgs {
  /** 요약 대상 상한. null이면 지정하지 않음(MAX_ITEMS_PER_RUN 적용) */
  limit: number | null;
  dry: boolean;
  mock: boolean;
  /** --mock과 LLM_MODE를 합친 실제 LLM 모드 */
  llmMode: LlmMode;
  help: boolean;
}

export type ParseResult<T> =
  { ok: true; value: T } | { ok: false; error: string };

export const COLLECT_USAGE = [
  "사용법: npm run collect -- [--limit <n>] [--dry] [--mock]",
  "  --limit <n>  요약 대상을 상위 n건으로 제한 (양의 정수, 예: 5)",
  "  --dry        data/에 쓰지 않고 결과만 출력",
  "  --mock       LLM 대신 fixtures/llm/ 응답 사용 (LLM_MODE=mock과 같음)",
  "  --help, -h   이 도움말",
  "※ npm 뒤에 `--`를 빼면 npm이 옵션을 가져가 버린다.",
].join("\n");

const LLM_MODES: readonly LlmMode[] = ["live", "mock"];

function isLlmMode(value: string): value is LlmMode {
  return (LLM_MODES as readonly string[]).includes(value);
}

/**
 * `--limit` 값을 양의 정수로 바꾼다. "5"·"05"는 허용, "0"·"-1"·"1.5"·"1e3"·"abc"·""는 거부.
 */
export function parseLimit(raw: string): ParseResult<number> {
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1) {
    return {
      ok: false,
      error: `--limit에는 양의 정수를 넣어야 합니다 (받은 값: "${raw}")`,
    };
  }
  return { ok: true, value };
}

/**
 * --mock 플래그와 LLM_MODE 환경변수로 실제 LLM 모드를 정한다.
 * --mock이 우선, 없으면 LLM_MODE(빈 값·미지정은 기본값 live). 알 수 없는 값은 오류.
 */
export function resolveLlmMode(
  mockFlag: boolean,
  envLlmMode: string | undefined,
): ParseResult<LlmMode> {
  if (mockFlag) return { ok: true, value: "mock" };
  const mode = envLlmMode?.trim() || "live";
  if (!isLlmMode(mode)) {
    return {
      ok: false,
      error: `LLM_MODE는 ${LLM_MODES.join(" 또는 ")}이어야 합니다 (받은 값: "${mode}")`,
    };
  }
  return { ok: true, value: mode };
}

/**
 * collect 인자를 파싱·검증한다.
 * @param argv `process.argv.slice(2)` — 스크립트 경로 뒤의 인자만
 * @param envLlmMode `process.env.LLM_MODE`
 */
export function parseCollectArgs(
  argv: readonly string[],
  envLlmMode: string | undefined,
): ParseResult<CollectArgs> {
  let values: {
    limit?: string;
    dry?: boolean;
    mock?: boolean;
    help?: boolean;
  };
  try {
    // strict: 모르는 옵션·위치 인자·불리언 옵션의 값(--dry=yes)을 모두 오류로 처리한다.
    ({ values } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: {
        limit: { type: "string" },
        dry: { type: "boolean", default: false },
        mock: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  let limit: number | null = null;
  if (values.limit !== undefined) {
    const parsed = parseLimit(values.limit);
    if (!parsed.ok) return parsed;
    limit = parsed.value;
  }

  const mock = values.mock ?? false;
  const llmMode = resolveLlmMode(mock, envLlmMode);
  if (!llmMode.ok) return llmMode;

  return {
    ok: true,
    value: {
      limit,
      dry: values.dry ?? false,
      mock,
      llmMode: llmMode.value,
      help: values.help ?? false,
    },
  };
}
