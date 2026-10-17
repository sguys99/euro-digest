/**
 * 일일 브리핑 요청·출력 (LLM 호출 지점 #1 "오늘의 5줄", PRD §15 D24·D28 — M1-01 수직 슬라이스 → **M1-20 지시문·출력 스키마 확정**).
 *
 * 지금 범위: 요청 1건을 `llm.ts` `callSingle`(일반 Messages API 단건)로 보내고, 출력은 **로그로만** 남긴다.
 * 코드 검증과 1회 재시도·템플릿 강등(M1-23·M1-45)은 아직 없다 — 그래서 `data/briefs`(M1-19, D38)에는 같은 입력의 코드
 * 템플릿(brief-template.ts)을 게시하고 LLM 줄은 저장하지 않는다(brief-file.ts).
 * 브리핑 마감(공개 목표 −10분 — M1-47)은 collect-run.ts가 collect-deadlines.ts로 계산해
 * `callSingle` deadline으로 넘긴다(재시도 대기만 묶음 — 요청 타임아웃·마감 초과 템플릿은 M1-45).
 *
 * 요청 설정 (D28 — 바꾸려면 사용자 승인, CLAUDE.md §1-3): thinking 적응형 + `effort:"medium"` 명시, `max_tokens` 4,096,
 * 하루 1요청이라 지시문 캐싱(cacheSystem)은 끈다(B3 미발동 — 2요청 이상일 때만).
 *
 * 지시문 (M1-20): `configs/prompts/summarize.md`(파일명 유지 = 일일 브리핑 지시문, PRD §9.2) — 파일 내용 `.trim()`을 그대로
 *   system으로 보낸다(머리말·주석 없음 — 파일 전체가 지시문). M0-30 임시 프롬프트 긴 판(fixtures/llm/brief-inputs/
 *   prompt-m0-30-long.md)이 출발점이고, 그 파일은 mock 출력의 근거로만 남는다. 고치면 `npm run eval:prompt`(M1-24) 회귀 비교.
 *
 * 출력 스키마 (M1-20 확정 — M0-30 임시 스키마와 같은 짧은 키 `{ l: [{ t, r }] }`. 18건 실측이 모두 이 형식이라 키를 바꾸지 않았다):
 *   - `l` 줄 배열(1개 이상) · `t` 브리핑 문장 하나(영문 고유명사 그대로 — 치환은 names.ts) · `r` 근거 입력 항목 id(1~6개)
 *   - 모르는 키는 거부(strict) — 형식이 흔들린 출력은 출력 전체 실패(FR-29 재시도 대상)
 *   - **관용 파싱 (D40 ⑤, 비용 0)**: ① 출력 전체를 감싼 ```` ``` ````/```` ```json ```` 코드블록은 벗긴다(그 밖의 앞뒤 글은
 *     벗기지 않는다 — 실패) ② 6줄 이상이면 앞 5줄만 쓴다(`droppedLines`) ③ 줄 길이는 스키마가 막지 않는다 — 80자(`BRIEF_LINE_MAX`)
 *     초과 줄은 **줄 단위 강등 대상**이다. 길이는 고유명사 치환·조사 보정 **뒤의** 문장으로 잰다(PRD §9.4 — 영문 이름은 한글이
 *     되면 길이가 바뀐다). 그래서 파서가 아니라 `briefLinesOverLimit`(치환 뒤 문장)이 표시한다. 실제 강등·재시도는 M1-23·M1-45
 *   - 문장 앞뒤 공백은 지우고(trim) 한 줄 안의 같은 근거 id는 하나로 합친다(BriefLine 스키마 — 줄 안 중복 금지). 내용은 바꾸지 않는다
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { BRIEF_LINE_MAX, BRIEF_MAX_LINES, BRIEF_REFS_MAX } from "@/lib/schema";

import { estimateCost, type CostEstimate } from "./cost";
import { serializeBriefInput, type BriefInput } from "./brief-input";
import type { LlmRequest } from "./llm";

/** D28 브리핑 max_tokens (thinking 포함) */
export const BRIEF_MAX_TOKENS = 4_096;
/**
 * 브리핑 요청 1건이 과금될 수 있는 최대 횟수 — 첫 호출 + FR-29 출력 재시도 1회(zod·코드 검증 실패를 합쳐 1회, D40 ①의
 * max_tokens 포함). 비용 가드(M1-22 budget-guard.ts)가 이 횟수 × (넉넉한 입력 어림 + 출력 상한)으로 판정한다 — M1-45 재시도 루프도
 * 이 값을 쓸 것.
 * llm.ts 전송 재시도(429·5xx)는 응답 usage가 없어 비용 기록에 0으로 남으므로 여기에 세지 않는다.
 */
export const BRIEF_MAX_ATTEMPTS = 2;
/** D28 — 적응형 thinking 기본 + effort medium 명시(끄거나 low로 낮추지 않는다, M0-30) */
export const BRIEF_EFFORT = "medium" as const;
export const BRIEF_THINKING = "adaptive" as const;

/**
 * 일일 브리핑 지시문(저장소 루트 기준, M1-20). 이 파일을 바꾸면 prod(Actions) 브리핑 지시문이 바뀐다 — 프롬프트 변경으로 다룬다
 * (`npm run eval:prompt` 회귀 비교, CLAUDE.md §6.3).
 */
export const BRIEF_PROMPT_PATH = "configs/prompts/summarize.md";

/** 발행일 → customId(`brief-YYYY-MM-DD` — mock은 fixtures/llm/mock/by-id/에서 이 이름을 찾는다) */
export function briefCustomId(briefDate: string): string {
  return `brief-${briefDate}`;
}

/** 지시문 읽기 — 파일 내용 `.trim()`(M0-30·M0-34와 같다). 비어 있으면 던진다(호출부가 setup 실패로 템플릿) */
export async function loadBriefPrompt(rootDir: string): Promise<string> {
  const text = (
    await readFile(path.join(rootDir, BRIEF_PROMPT_PATH), "utf8")
  ).trim();
  if (!text) throw new Error(`${BRIEF_PROMPT_PATH}가 비어 있다`);
  return text;
}

/**
 * 지시문 판 식별자(로그용) — `p_` + sha256(지시문) 16진수 앞 12자리. 관찰 주간(M1-43)·회귀 비교(M1-24)에서 어느 지시문이 쓴
 * 출력인지 실행 로그로 가린다. 비밀값이 아니다(지시문은 저장소에 있다).
 */
export function briefPromptId(system: string): string {
  return `p_${createHash("sha256").update(system, "utf8").digest("hex").slice(0, 12)}`;
}

/** 브리핑 요청 1건(순수 함수) */
export function buildBriefRequest(
  input: BriefInput,
  system: string,
): LlmRequest {
  return {
    customId: briefCustomId(input.briefDate),
    system,
    user: serializeBriefInput(input),
    maxTokens: BRIEF_MAX_TOKENS,
    effort: BRIEF_EFFORT,
    thinking: BRIEF_THINKING,
  };
}

/**
 * 실행 전 예상 입력 토큰 — **상한이 아니라 넉넉한 어림**이다. 한국어 지시문은 글자당 약 1토큰(M0-30: 2,119자 → 2,034토큰 = 0.96),
 * 영문 JSON 입력은 약 1.9자당 1토큰(M0-34: 8,619자 → 약 4,560토큰)이라 지시문은 글자당 1토큰, 입력은 1.5자당 1토큰으로 잡는다
 * → 두 실측 합 6,594토큰에 대해 7,865토큰(약 +19%).
 * M1-19 확인(2026-10-16): 확정 입력은 M0-34 입력 E와 같은 구성(경기 + 득점 + 리그별 상위 4위 순위표, 영문 짧은 키 JSON)이라
 * 글자당 토큰 비율이 같다고 본다 — 2026-10-10 실응답 23경기 입력 6,618자(E 8,619자 — 한국 선수 블록 포함). 여유는 입력 부분 +26%·
 * 지시문 +4%라 경기가 적은 날은 전체 여유가 지시문 쪽(+4%)으로 줄지만, 판정은 출력 상한(4,096 × 2회)이 지배한다.
 * M1-20 확인(2026-10-17): 지시문 v0.1(`configs/prompts/summarize.md`)은 약 4,300자로 길어졌지만 글자 구성(한글 음절 비율 약 48%·
 * 라틴·공백·기호)이 M0-30 긴 판과 같아 글자당 약 0.96토큰 → 약 4,130토큰으로 본다(여유 약 +4% 유지 — tests/brief-prompt.test.ts가
 * 구성 비율을 지킨다). 실측 확인은 병합 뒤 dev 소량 실행(💰 M1-20).
 */
export function estimateBriefInputTokens(
  request: Pick<LlmRequest, "system" | "user">,
): number {
  return Math.ceil(request.system.length + request.user.length / 1.5);
}

/** 실행 전 예상 비용(요청 1건·1회) — 넉넉한 입력 어림(실측 대비 약 +19%) + 출력 상한(max_tokens, thinking 포함) */
export function estimateBriefCost(
  request: Pick<LlmRequest, "system" | "user" | "maxTokens">,
  model: string,
): CostEstimate {
  return estimateCost({
    model,
    requests: 1,
    avgInputTokens: estimateBriefInputTokens(request),
    avgOutputTokens: request.maxTokens,
    batch: false,
  });
}

// ─── 출력 (M1-20 확정 — 머리 주석 "출력 스키마") ─────────────────────────────

/** 문장 최소 글자 수 — 이보다 짧으면 문장이 아니다(형식 붕괴 → 출력 전체 실패). M0-30 임시 스키마와 같다 */
export const BRIEF_OUTPUT_TEXT_MIN = 5;

/** 줄 1개 — `t` 문장(앞뒤 공백 제거), `r` 근거 id(1~6개, 줄 안 중복은 하나로) */
export const BriefOutputLineSchema = z.strictObject({
  t: z.string().trim().min(BRIEF_OUTPUT_TEXT_MIN),
  r: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(BRIEF_REFS_MAX)
    .transform((refs) => [...new Set(refs)]),
});
export type BriefOutputLine = z.infer<typeof BriefOutputLineSchema>;

/**
 * 모델 출력 JSON. 줄 수 상한은 두지 않는다 — 6줄 이상은 실패가 아니라 앞 5줄만 쓴다(D40 ⑤, `parseBriefOutput`).
 * 줄 길이도 막지 않는다 — 80자 초과는 줄 단위 강등(치환 뒤 길이 — `briefLinesOverLimit`).
 */
export const BriefOutputSchema = z.strictObject({
  l: z.array(BriefOutputLineSchema).min(1),
});
export type BriefOutput = z.infer<typeof BriefOutputSchema>;

export type BriefParseResult =
  | {
      ok: true;
      /** 앞 5줄(BRIEF_MAX_LINES) */
      lines: BriefOutputLine[];
      /** 출력 전체를 감싼 코드블록을 벗겼다 */
      fenced: boolean;
      /** 5줄을 넘어 버린 줄 수 */
      droppedLines: number;
    }
  | { ok: false; reason: "json" | "schema"; fenced: boolean };

/** 출력 전체를 감싼 코드블록 — 여는 울타리 뒤 언어 이름(json 등, 앞 공백 허용 — '``` json')은 영문자만, 안쪽 앞뒤 공백·줄바꿈은 무시 */
const WHOLE_FENCE = /^```[ \t]*[A-Za-z]*[ \t]*\r?\n?([\s\S]*?)\s*```$/;

/** 출력 텍스트 → 파싱할 본문. 앞뒤 공백을 지우고, 전체가 코드블록 하나면 벗긴다(D40 ⑤) */
export function unwrapBriefOutput(text: string): {
  body: string;
  fenced: boolean;
} {
  const trimmed = text.trim();
  const fence = WHOLE_FENCE.exec(trimmed);
  return fence
    ? { body: fence[1]!.trim(), fenced: true }
    : { body: trimmed, fenced: false };
}

/**
 * 모델 출력 텍스트 → 줄 목록(순수 함수). 엄격 JSON + 확정 스키마, 관용은 D40 ⑤ 두 가지(코드블록 벗김·앞 5줄)뿐이다.
 * 실패(`json`·`schema`)는 FR-29의 출력 전체 실패 — 1회 재시도 판단은 호출부(M1-45).
 */
export function parseBriefOutput(text: string): BriefParseResult {
  const { body, fenced } = unwrapBriefOutput(text);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, reason: "json", fenced };
  }
  const parsed = BriefOutputSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "schema", fenced };
  const all = parsed.data.l;
  return {
    ok: true,
    lines: all.slice(0, BRIEF_MAX_LINES),
    fenced,
    droppedLines: Math.max(0, all.length - BRIEF_MAX_LINES),
  };
}

/**
 * 80자(`BRIEF_LINE_MAX` — D40 ⑤) 넘는 줄 번호(1부터). **고유명사 치환·조사 보정 뒤의 문장**을 넣는다(PRD §9.4 치환 후 길이) —
 * 이 줄은 자르지 않고 템플릿으로 강등한다(M1-45). 길이 단위는 BriefLine 스키마와 같은 JS 문자열 길이.
 */
export function briefLinesOverLimit(texts: readonly string[]): number[] {
  return texts.flatMap((text, i) =>
    text.length > BRIEF_LINE_MAX ? [i + 1] : [],
  );
}
