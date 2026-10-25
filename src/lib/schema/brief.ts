/**
 * v0.1 — 2026-10-15 사용자 결정(PRD §15 D38, plan M1-19) — 일일 브리핑 "오늘의 5줄" 파일.
 *   `data/briefs/YYYY-MM-DD.json` (발행일 KST = 파일명) → `{ date, generatedAt, runId, mode, lines: [{ text, ai, refs, comps? }] }`
 *
 * 2026-10-19 사용자 결정(PRD §15 D58): 줄에 선택 필드 `comps`(대회 id 배열)를 더했다 — 홈 '오늘의 5줄' 행 오른쪽 대회 인덱스 탭용.
 * 화면은 경기 원장(data/matches)을 읽지 않으므로(D33) 브리핑 파일이 대회를 들고 있다. 파이프라인이 게시할 때 그 줄의 refs에서 코드로
 * 계산한다(scripts/lib/brief-comps.ts — LLM은 comps를 쓰지 않는다, 호출·지시문 불변). 키가 없는 옛 파일(2026-10-17·18)도 유효하다.
 *
 * PRD §8.2 초안에 `mode` 하나만 더했다(D38):
 *   - `llm` — 모든 줄을 LLM이 썼다(검증 통과 — M1-45). 줄마다 `ai:true`("AI 작성" 라벨, FR-35)
 *   - `mixed` — 일부 줄이 줄 단위 검증(M1-23)에 걸려 코드 템플릿 문장으로 강등됐다(`ai:true`·`ai:false`가 섞임)
 *   - `template` — LLM 줄이 하나도 없다(출력 전체 실패·예산 초과·마감 초과·약관 — 모두 `ai:false`, 라벨 없음)
 *   - `empty` — 전날 경기가 없어 LLM을 부르지 않았다(D24·D30 — 화면은 5줄 블록을 유지하고 높이만 줄인다). 줄 0개
 * 치환 전 LLM 원문(`textRaw`)은 저장하지 않는다(실행 로그·dev 출력에서만 — D38).
 *
 * 2026-10-25 사용자 결정(PRD §15 D60 — 10-25 호 사건): 파일에 선택 필드 `emptyReason`을 더했다 — **mode `empty`일 때만** 둘 수 있다.
 *   - `no-matches` — 창 안에 끝난 경기가 없었다(화면 S4 "끝난 경기가 없었습니다")
 *   - `results-pending` — 창 안에 경기는 있었지만 수집 때 결과를 받지 못했다(football-data 미종료 + API-Football 보충 불가 —
 *     scripts/lib/brief-supplement.ts). 화면은 S4 대신 "5줄을 싣지 못했어요" 안내(원인을 단정하지 않는 사실만)
 * 키가 없는 empty(옛 파일 — 2026-10-25 이전)는 `no-matches`로 읽는다(마이그레이션 없음 — 그때 규칙의 뜻이 그것이었다).
 *
 * 줄 길이 상한 80자는 D40 ⑤(‘60자 내외’, 80자 초과 줄은 템플릿 강등 — 한국어 문장 중간 절단 안 함)이다. 파이프라인은 쓰기 전에
 * 이 스키마로 검증하므로(scripts/lib/brief-file.ts) 상한을 넘는 줄은 파일에 들어가지 않는다 — 검증 게이트가 브리핑 하나 때문에
 * 그날 발행 전체를 막지 않게 하는 것은 파이프라인 몫이다(FR-26 정신).
 * 화면은 파일의 줄 순서대로 그린다(M1-32). data/ 파일이라 z.object(모르는 키는 버림 — 결정 Q5).
 */
import { z } from "zod";

import {
  BRIEF_LINE_MAX,
  BRIEF_MAX_LINES,
  BRIEF_REFS_MAX,
} from "../brief-limits";

import { CompIdSchema, IsoDateSchema, IsoSchema } from "./common";

// 상한 값은 zod 없는 모듈(src/lib/brief-limits.ts)에 두고 여기서 다시 내보낸다(화면 모델·섬이 zod 없이 쓰게 — M1-32 리뷰)
export { BRIEF_LINE_MAX, BRIEF_MAX_LINES, BRIEF_REFS_MAX };
/** 줄 하나의 대회 상한(D58) — 근거 1개가 대회 1개 이하로 정해지므로 근거 상한과 같다 */
export const BRIEF_COMPS_MAX = BRIEF_REFS_MAX;

/** 배열 안 중복 값을 이슈로 남긴다(근거 id·대회 id 공용 superRefine) */
function noDuplicates(label: string) {
  return (values: readonly string[], ctx: z.RefinementCtx) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        ctx.addIssue({
          code: "custom",
          path: [index],
          message: `${label} 중복: "${value}"`,
        });
      }
      seen.add(value);
    });
  };
}

export const BriefModeSchema = z.enum(["llm", "mixed", "template", "empty"]);
export type BriefMode = z.infer<typeof BriefModeSchema>;

/** mode empty의 이유(D60 — 위 머리 주석). 키가 없는 empty는 no-matches */
export const BriefEmptyReasonSchema = z.enum(["no-matches", "results-pending"]);
export type BriefEmptyReason = z.infer<typeof BriefEmptyReasonSchema>;

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
    .superRefine(noDuplicates("근거 id")),
  /**
   * 이 줄이 다루는 대회(선택 — D58). refs에서 코드로 계산한다(scripts/lib/brief-comps.ts): 순서 = refs에서 처음 나온 순, 중복 없음.
   * 대회를 하나도 알 수 없으면 키를 넣지 않는다(빈 배열은 저장하지 않는다 — min 1). 키가 없는 옛 파일도 유효하다.
   */
  comps: z
    .array(CompIdSchema)
    .min(1)
    .max(BRIEF_COMPS_MAX)
    .superRefine(noDuplicates("대회 id"))
    .optional(),
});
export type BriefLine = z.infer<typeof BriefLineSchema>;

/**
 * 일일 브리핑 파일. mode ↔ lines 일관성:
 * empty ⇔ 줄 0개 · llm ⇒ 모든 줄 ai:true · template ⇒ 모든 줄 ai:false · mixed ⇒ ai:true와 ai:false가 모두 있음.
 * `emptyReason`(D60)은 empty일 때만 — 다른 mode에 있으면 오류.
 */
export const BriefFileSchema = z
  .object({
    date: IsoDateSchema, // KST 발행일 = 파일명(뉴스 파일과 같은 규칙)
    generatedAt: IsoSchema, // 파일을 마지막으로 쓴 시각(UTC)
    runId: z.string().min(1), // 이 파일을 쓴 실행의 RunLog.runId
    mode: BriefModeSchema,
    /** empty의 이유(선택 — D60). 없으면 no-matches로 읽는다 */
    emptyReason: BriefEmptyReasonSchema.optional(),
    lines: z.array(BriefLineSchema).max(BRIEF_MAX_LINES),
  })
  .superRefine((file, ctx) => {
    const ai = file.lines.filter((l) => l.ai).length;
    const template = file.lines.length - ai;
    const fail = (message: string) =>
      ctx.addIssue({ code: "custom", path: ["mode"], message });
    if (file.emptyReason !== undefined && file.mode !== "empty") {
      ctx.addIssue({
        code: "custom",
        path: ["emptyReason"],
        message: "emptyReason은 mode empty일 때만 둔다",
      });
    }
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
