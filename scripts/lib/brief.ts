/**
 * 일일 브리핑 요청·출력 (M1-01 수직 슬라이스 — LLM 호출 지점 #1 "오늘의 5줄", PRD §15 D24·D28).
 *
 * 슬라이스 범위: 요청 1건을 `llm.ts` `callSingle`(일반 Messages API 단건)로 보내고, 출력은 **로그로만** 남긴다.
 * 저장 스키마(M1-19)·정식 프롬프트(`configs/prompts/summarize.md`, M1-20)·코드 검증과 1회 재시도·템플릿 강등
 * (M1-23·M1-45)·마감 시각(M1-47)은 아직 없다.
 *
 * 요청 설정 (D28 — 바꾸려면 사용자 승인, CLAUDE.md §1-3): thinking 적응형 + `effort:"medium"` 명시, `max_tokens` 4,096,
 * 하루 1요청이라 지시문 캐싱(cacheSystem)은 끈다(B3 미발동 — 2요청 이상일 때만).
 * 프롬프트: M0-30 임시 프롬프트 긴 판(`fixtures/llm/brief-inputs/prompt-m0-30-long.md` — M0-34 실측과 같은 지시문).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { estimateCost, type CostEstimate } from "./cost";
import { serializeBriefInput, type BriefInput } from "./brief-input";
import type { LlmRequest } from "./llm";

/** D28 브리핑 max_tokens (thinking 포함) */
export const BRIEF_MAX_TOKENS = 4_096;
/** D28 — 적응형 thinking 기본 + effort medium 명시(끄거나 low로 낮추지 않는다, M0-30) */
export const BRIEF_EFFORT = "medium" as const;
export const BRIEF_THINKING = "adaptive" as const;

/**
 * 슬라이스 지시문(저장소 루트 기준) — M1-20에서 `configs/prompts/summarize.md`로 교체한다.
 * 그 전까지 이 fixture를 바꾸면 prod(Actions) 브리핑 지시문이 바뀐다 — fixture 갱신은 프롬프트 변경으로 다룰 것(CLAUDE.md §6.3).
 */
export const SLICE_PROMPT_PATH =
  "fixtures/llm/brief-inputs/prompt-m0-30-long.md";

/** 발행일 → customId(`brief-YYYY-MM-DD` — mock은 fixtures/llm/mock/by-id/에서 이 이름을 찾는다) */
export function briefCustomId(briefDate: string): string {
  return `brief-${briefDate}`;
}

/** 지시문 읽기 — 파일 내용 `.trim()`(M0-30·M0-34와 같다) */
export async function loadSlicePrompt(rootDir: string): Promise<string> {
  const text = (
    await readFile(path.join(rootDir, SLICE_PROMPT_PATH), "utf8")
  ).trim();
  if (!text) throw new Error(`${SLICE_PROMPT_PATH}가 비어 있다`);
  return text;
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
 * 실행 전 예상 입력 토큰(어림값, 넉넉하게) — 한국어 지시문은 글자당 약 1토큰(M0-30: 2,119자 → 2,034토큰),
 * 영문 JSON 입력은 약 1.9자당 1토큰(M0-34: 8,619자 → 약 4,560토큰)이라 1.5자당 1토큰으로 잡는다.
 */
export function estimateBriefInputTokens(
  request: Pick<LlmRequest, "system" | "user">,
): number {
  return Math.ceil(request.system.length + request.user.length / 1.5);
}

/** 실행 전 예상 비용 — 출력은 상한(max_tokens)으로 잡는다(thinking 포함, 보수적) */
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

/**
 * M0-30 임시 출력 스키마(`fixtures/llm/README.md` — M1-20에서 확정). 문장 t·근거 id r, 최대 5줄.
 * 슬라이스는 이 스키마로 줄 수만 세고 로그에 찍는다(검증·강등은 M1-23·M1-45).
 */
export const SliceBriefOutputSchema = z.strictObject({
  l: z
    .array(
      z.strictObject({
        t: z.string().min(5).max(150),
        r: z.array(z.string().min(1)).min(1).max(6),
      }),
    )
    .min(1)
    .max(5),
});
export type SliceBriefOutput = z.infer<typeof SliceBriefOutputSchema>;

export type BriefParseResult =
  | { ok: true; lines: SliceBriefOutput["l"] }
  | { ok: false; reason: "json" | "schema" };

/** 모델 출력 텍스트 → 줄 목록(엄격 JSON만 — 코드블록 허용 여부는 M1-20) */
export function parseBriefOutput(text: string): BriefParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text.trim());
  } catch {
    return { ok: false, reason: "json" };
  }
  const parsed = SliceBriefOutputSchema.safeParse(json);
  return parsed.success
    ? { ok: true, lines: parsed.data.l }
    : { ok: false, reason: "schema" };
}
