/**
 * v0.1 — 2026-10-10 사용자 확인
 * 파이프라인 캐시 — `data/cache/seen-urls.json`(FR-04), `data/cache/unknown-names.json`(FR-24).
 * 수집 실행만 쓴다(손 편집 금지, CLAUDE.md §8). 키를 정렬해 저장하면 커밋 diff가 작아진다.
 */
import { z } from "zod";

import { CardIdSchema, IsoSchema, isNotAfter } from "./common";
import { NameKindSchema, NameTextSchema } from "./names";

// ─── seen-urls ──────────────────────────────────────────────────────────────

/**
 * 정규화 URL 해시 = 16진수 16자리(64비트). 90일 × 하루 수백 건 규모에서 충돌 확률이 무시할 수준.
 * 카드 ID(`c_` + 10자리)와 같은 해시 함수를 쓰면 카드 ID가 이 키의 앞부분과 같아진다(구현은 M1-12).
 */
export const UrlHashSchema = z
  .string()
  .regex(/^[0-9a-f]{16}$/, { error: "URL 해시는 16진수 소문자 16자리" });

/** `data/cache/seen-urls.json` — 과거 처리한 URL 제외(FR-04), 90일 보존(CLAUDE.md §8). */
export const SeenUrlsFileSchema = z.object({
  updatedAt: IsoSchema, // 마지막 갱신 시각
  urls: z.record(UrlHashSchema, IsoSchema), // 정규화 URL 해시 → 처음 본 시각(UTC). 90일 지난 항목은 수집 실행이 지운다
});
export type SeenUrlsFile = z.infer<typeof SeenUrlsFileSchema>;

// ─── unknown-names ──────────────────────────────────────────────────────────

/** 미등록 고유명사 1개의 누적 정보 (`/add-name` 입력). */
export const UnknownNameSchema = z
  .object({
    count: z.number().int().min(1), // 누적 등장 횟수 — `/add-name` 빈도순 정렬
    firstSeen: IsoSchema, // 처음 본 시각(UTC)
    lastSeen: IsoSchema, // 마지막으로 본 시각(UTC) — 오래 안 보인 항목 정리 기준
    kind: NameKindSchema.optional(), // LLM 출력의 teams/players 태그에서 왔으면 team/player로 추정, 모르면 생략
    cards: z.array(CardIdSchema).max(5), // 문맥 확인용 예시 카드 ID(최근 5개까지)
  })
  .refine((n) => isNotAfter(n.firstSeen, n.lastSeen), {
    path: ["lastSeen"],
    error: "lastSeen은 firstSeen보다 앞설 수 없음",
  });
export type UnknownName = z.infer<typeof UnknownNameSchema>;

/**
 * `data/cache/unknown-names.json` (FR-24 — 주간 이슈·`/add-name`).
 * 키는 LLM이 출력한 영문 표기 그대로. names.ko.json에 등록되거나 ignore에 오른 이름은 다음 수집 실행이 뺀다(M1-21).
 */
export const UnknownNamesFileSchema = z.object({
  updatedAt: IsoSchema,
  names: z.record(NameTextSchema, UnknownNameSchema),
});
export type UnknownNamesFile = z.infer<typeof UnknownNamesFileSchema>;
