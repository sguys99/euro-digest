/**
 * 이적 트래커 — `data/transfers.json` (plan.md 부록 A, PRD F10 FR-100~106).
 * 카드의 `transfer` 필드를 선수 단위로 집계한 결과(LLM 추가 호출 없음). 상태는 역행 금지, collapsed 예외(FR-102).
 */
import { z } from "zod";

import {
  IsoSchema,
  TierSchema,
  TransferStatusSchema,
  uniqueBy,
} from "./common";

/** 이적 1건 (부록 A). */
export const TransferSchema = z.object({
  id: z.string(),
  player: z.string(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: TransferStatusSchema,
  bestTier: TierSchema,
  updated: IsoSchema,
  quiet: z.boolean(), // 30일 이상 갱신 없음 → "잠잠" (FR-106)
  history: z.array(
    z.object({
      at: IsoSchema,
      status: TransferStatusSchema,
      card: z.string(), // 근거 카드 ID — 형식 검사 없음(2026-10-10 결정 Q7: 파이프라인 산출물, 발행 차단 방지)
    }),
  ),
});
export type Transfer = z.infer<typeof TransferSchema>;

/** `data/transfers.json` → Transfer[] (파일 단위: id 중복 금지). */
export const TransfersFileSchema = z
  .array(TransferSchema)
  .superRefine(uniqueBy((t) => t.id, "id", "이적 id"));
export type TransfersFile = z.infer<typeof TransfersFileSchema>;
