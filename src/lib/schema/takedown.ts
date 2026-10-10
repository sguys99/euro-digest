/**
 * 삭제·정정 요청 — `configs/takedowns.json` (plan.md 부록 A, PRD FR-143·§15 D14).
 * 등록된 카드는 빌드에서 즉시 제외하고, 다음 수집 실행이 `data/` 원본 카드를 지운다.
 * 공개 저장소이므로 요청자 개인정보는 넣지 않는다(`/takedown` 커맨드 규칙).
 */
import { z } from "zod";

import { CardIdSchema, IsoSchema, isNotAfter, uniqueBy } from "./common";

/**
 * 삭제 요청 1건 (v0.1 — 2026-10-10 사용자 확인). 사람이 편집하는 설정이라 알 수 없는 키는 오류(Q5).
 * - id: 카드 ID 형식(`/takedown` 1단계와 같은 정규식)
 * - requestedAt: 요청 접수 시각(UTC) — 72시간 기준점
 * - handledAt: 비공개 처리(배포 확인) 시각(UTC). **등록 시 null**, 배포 확인 후 채운다(커밋 2회, 결정 Q1).
 *   빌드 제외는 handledAt과 상관없이 등록만으로 적용된다. 값이 있으면 requestedAt 이후여야 한다.
 * - reason: 요청 종류와 이슈 번호만(예: "저작권자 삭제 요청 (#12)")
 */
export const TakedownSchema = z
  .strictObject({
    id: CardIdSchema,
    requestedAt: IsoSchema,
    handledAt: IsoSchema.nullable(),
    reason: z.string(),
  })
  .refine(
    (t) => t.handledAt === null || isNotAfter(t.requestedAt, t.handledAt),
    {
      path: ["handledAt"],
      error: "handledAt은 requestedAt보다 앞설 수 없음",
    },
  );
export type Takedown = z.infer<typeof TakedownSchema>;

/** `configs/takedowns.json` → Takedown[] (파일 단위: 카드 ID 중복 금지). */
export const TakedownsFileSchema = z
  .array(TakedownSchema)
  .superRefine(uniqueBy((t) => t.id, "id", "카드 ID"));
export type TakedownsFile = z.infer<typeof TakedownsFileSchema>;
