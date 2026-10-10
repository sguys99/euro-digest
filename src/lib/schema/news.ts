/**
 * 뉴스 카드·일별 뉴스 파일 — `data/news/YYYY-MM-DD.json` (plan.md 부록 A, PRD §8.2·F3).
 * 카드는 파이프라인만 쓴다(손 편집 금지, CLAUDE.md §8).
 * v0.1 — 2026-10-10 사용자 확인: 원문 URL은 http/https만(Q3). 카드 태그(teams·players)에는 slug 형식 검사를
 * 걸지 않는다(Q7 — 태그 하나의 오류로 그날 발행 전체가 막히지 않게).
 */
import { z } from "zod";

import {
  CategorySchema,
  CompIdSchema,
  HttpUrlSchema,
  IsoDateSchema,
  IsoSchema,
  TierSchema,
  TransferStatusSchema,
  uniqueBy,
} from "./common";

/** AI 한국어 제목 상한 (PRD §15 D15). 원제목·한국어 원문 카드는 `t` 자체 상한 200자. */
export const AI_TITLE_MAX = 80;

/** 카드의 이적 정보 (FR-21 — 요약 호출에서 판정, FR-100 트래커 집계 입력). */
export const CardTransferSchema = z.object({
  player: z.string(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: TransferStatusSchema,
  tier: TierSchema,
});
export type CardTransfer = z.infer<typeof CardTransferSchema>;

/** 카드 출처 1건 — 클러스터의 보도 매체 (FR-05·FR-30). */
export const CardSourceSchema = z.object({
  n: z.string(), // 출처명
  u: HttpUrlSchema, // 원문 URL — http/https만 (javascript:·mailto: 거부)
  at: IsoSchema, // 원문 발행 시각(UTC)
  tier: TierSchema,
});
export type CardSource = z.infer<typeof CardSourceSchema>;

/**
 * 뉴스 카드 1장 (부록 A). 길이 상한은 JS 문자열 길이(UTF-16 코드 유닛) 기준 —
 * 한글 음절은 1자, 이모지는 2자로 센다.
 */
export const NewsCardSchema = z
  .object({
    id: z.string().regex(/^c_[0-9a-f]{10}$/), // 대표 URL 결정적 해시 (16진수 10자리)
    t: z.string().max(200), // 제목: AI 한국어 제목 ≤80자(아래 refine), 원제목·한국어 원문 카드 ≤200자
    s: z.array(z.string().max(80)).max(3), // 3줄 요약 (강등 카드는 [])
    cat: CategorySchema,
    comp: z.array(CompIdSchema),
    teams: z.array(z.string()), // slug
    players: z.array(z.string()), // slug
    imp: z.number().int().min(1).max(5),
    kr: z.boolean(),
    spoiler: z.boolean(),
    transfer: CardTransferSchema.optional(),
    src: z.array(CardSourceSchema).min(1),
    lang: z.string(),
    ai: z.boolean(), // AI 요약 여부 (false = 원문/한국어 카드)
    created: IsoSchema,
  })
  .refine((c) => !c.ai || c.t.length <= AI_TITLE_MAX, {
    path: ["t"],
    error: `AI 제목은 ${AI_TITLE_MAX}자 이내`,
  });
export type NewsCard = z.infer<typeof NewsCardSchema>;

/**
 * 일별 뉴스 파일 `{ date, generatedAt, runId, cards }` (부록 A — 필드 타입은 이 구현의 해석).
 * - date: **KST 발행일**(파일명·`/news/[date]` 경로와 같은 값). 06:30 KST 실행은 UTC로 전날이므로
 *   UTC 날짜가 아니라 KST 날짜를 쓴다. 시각이 아닌 날짜 라벨이라 UTC 저장 규칙의 예외.
 * - generatedAt: 파일을 마지막으로 쓴 시각(UTC) — FR-26 보충으로 다시 쓰면 갱신된다.
 * - runId: 이 파일을 쓴 실행의 RunLog.runId.
 * - cards: 카드 ID 중복 금지(FR-04 — 같은 URL이 두 번 카드화되지 않음).
 */
export const NewsFileSchema = z.object({
  date: IsoDateSchema,
  generatedAt: IsoSchema,
  runId: z.string().min(1),
  cards: z
    .array(NewsCardSchema)
    .superRefine(uniqueBy((c) => c.id, "id", "카드 ID")),
});
export type NewsFile = z.infer<typeof NewsFileSchema>;
