/**
 * v0.1 — 2026-10-15 사용자 결정(PRD §15 D38, plan M1-19) — 일일 브리핑 "오늘의 5줄" 파일.
 *   `data/briefs/YYYY-MM-DD.json` (발행일 KST = 파일명) → `{ date, generatedAt, runId, mode, lines: [{ text, ai, refs }] }`
 *
 * PRD §8.2 초안에 `mode` 하나만 더했다(D38):
 *   - `llm` — 모든 줄을 LLM이 썼다(검증 통과 — M1-45). 줄마다 `ai:true`("AI 작성" 라벨, FR-35)
 *   - `mixed` — 일부 줄이 줄 단위 검증(M1-23)에 걸려 코드 템플릿 문장으로 강등됐다(`ai:true`·`ai:false`가 섞임)
 *   - `template` — LLM 줄이 하나도 없다(출력 전체 실패·예산 초과·마감 초과·약관 — 모두 `ai:false`, 라벨 없음)
 *   - `empty` — 전날 경기가 없어 LLM을 부르지 않았다(D24·D30 — 화면은 5줄 블록을 유지하고 높이만 줄인다). 줄 0개
 * 치환 전 LLM 원문(`textRaw`)은 저장하지 않는다(실행 로그·dev 출력에서만 — D38).
 *
 * 줄 길이 상한 80자는 D40 ⑤(‘60자 내외’, 80자 초과 줄은 템플릿 강등 — 한국어 문장 중간 절단 안 함)이다. 파이프라인은 쓰기 전에
 * 이 스키마로 검증하므로(scripts/lib/brief-file.ts) 상한을 넘는 줄은 파일에 들어가지 않는다 — 검증 게이트가 브리핑 하나 때문에
 * 그날 발행 전체를 막지 않게 하는 것은 파이프라인 몫이다(FR-26 정신).
 * 화면은 파일의 줄 순서대로 그린다(M1-32). data/ 파일이라 z.object(모르는 키는 버림 — 결정 Q5).
 */
import { z } from "zod";

import { IsoDateSchema, IsoSchema } from "./common";

/** 하루 브리핑 줄 수 상한 — "오늘의 5줄"(FR-23) */
export const BRIEF_MAX_LINES = 5;
/** 줄 길이 상한(JS 문자열 길이 — 한글 음절 1자) — D40 ⑤. 목표는 60자 내외(FR-23) */
export const BRIEF_LINE_MAX = 80;
/** 줄 하나의 근거 id 상한 — M0-30 출력 스키마 `r`와 같다 */
export const BRIEF_REFS_MAX = 6;

export const BriefModeSchema = z.enum(["llm", "mixed", "template", "empty"]);
export type BriefMode = z.infer<typeof BriefModeSchema>;

/**
 * 근거 id — 브리핑 정형 입력(scripts/lib/brief-input.ts)의 항목 id. 접두사 소문자 1자 + 영숫자:
 * `m<football-data 경기 id>`(경기) · `s<대회 약칭>`(순위표, 예: sPL) · `k<API-Football 선수 id>`(한국 선수 — M3-03).
 * 새 항목 종류가 생겨도 스키마를 바꾸지 않게 접두사 목록은 고정하지 않는다.
 */
export const BriefRefSchema = z.string().regex(/^[a-z][A-Za-z0-9]{1,31}$/, {
  error: "근거 id는 소문자 접두사 + 영숫자(m565820·sPL·k927)",
});

/** 줄 1개 — 한 줄 문자열(줄바꿈 없음, 앞뒤 공백 없음) */
export const BriefLineSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(BRIEF_LINE_MAX)
    .regex(/^\S(?:[^\r\n]*\S)?$/, {
      error: "줄은 앞뒤 공백·줄바꿈이 없는 한 줄",
    }),
  ai: z.boolean(), // true = LLM이 쓴 줄("AI 작성" 라벨), false = 코드 템플릿 문장(라벨 없음) — FR-35, D24
  refs: z
    .array(BriefRefSchema)
    .min(1)
    .max(BRIEF_REFS_MAX)
    .superRefine((refs, ctx) => {
      const seen = new Set<string>();
      refs.forEach((ref, index) => {
        if (seen.has(ref)) {
          ctx.addIssue({
            code: "custom",
            path: [index],
            message: `근거 id 중복: "${ref}"`,
          });
        }
        seen.add(ref);
      });
    }),
});
export type BriefLine = z.infer<typeof BriefLineSchema>;

/**
 * 일일 브리핑 파일. mode ↔ lines 일관성:
 * empty ⇔ 줄 0개 · llm ⇒ 모든 줄 ai:true · template ⇒ 모든 줄 ai:false · mixed ⇒ ai:true와 ai:false가 모두 있음.
 */
export const BriefFileSchema = z
  .object({
    date: IsoDateSchema, // KST 발행일 = 파일명(뉴스 파일과 같은 규칙)
    generatedAt: IsoSchema, // 파일을 마지막으로 쓴 시각(UTC)
    runId: z.string().min(1), // 이 파일을 쓴 실행의 RunLog.runId
    mode: BriefModeSchema,
    lines: z.array(BriefLineSchema).max(BRIEF_MAX_LINES),
  })
  .superRefine((file, ctx) => {
    const ai = file.lines.filter((l) => l.ai).length;
    const template = file.lines.length - ai;
    const fail = (message: string) =>
      ctx.addIssue({ code: "custom", path: ["mode"], message });
    switch (file.mode) {
      case "empty":
        if (file.lines.length > 0) fail("empty 브리핑에는 줄이 없어야 한다");
        break;
      case "llm":
        if (file.lines.length === 0 || template > 0) {
          fail("llm 브리핑은 1줄 이상이고 모든 줄이 ai:true");
        }
        break;
      case "template":
        if (file.lines.length === 0 || ai > 0) {
          fail("template 브리핑은 1줄 이상이고 모든 줄이 ai:false");
        }
        break;
      case "mixed":
        if (ai === 0 || template === 0) {
          fail("mixed 브리핑에는 ai:true 줄과 ai:false 줄이 모두 있어야 한다");
        }
        break;
    }
  });
export type BriefFile = z.infer<typeof BriefFileSchema>;
