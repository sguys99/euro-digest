/**
 * 뉴스 소스 설정 — `configs/sources.json` (plan.md 부록 A, PRD FR-01).
 * 수집 대상은 `enabled && terms_checked`, 목록·OG 크롤링 소스는 `robots_checked`도 true여야 한다(CLAUDE.md §6.4).
 * 새 소스는 `/add-source` 절차로만 추가한다.
 *
 * v0.1 — 2026-10-10 사용자 확인: strictObject(알 수 없는 키 = 오류, Q5), id는 slug(Q7), url은 http/https만(Q3).
 * v0.1 — 2026-10-10 사용자 결정(M0-23, PRD §15 D22 · plan §14 B5): `summarize` 필수 필드 추가. `terms_checked`는
 *   "note에 적은 이용 방식(요약 또는 원제목+링크)이 약관상 허용됨"을 뜻한다 — 금지·불명확이면 false(이중 잠금).
 */
import { z } from "zod";

import {
  CompIdSchema,
  HttpUrlSchema,
  SlugSchema,
  TierSchema,
  uniqueBy,
} from "./common";

/** 소스 1개. */
export const SourceSchema = z.strictObject({
  id: SlugSchema, // runs.json sources[].id·search-queries.source가 참조
  name: z.string(),
  type: z.enum([
    "rss",
    "crawl",
    "search",
    "journalist",
    "aggregator",
    "analysis",
  ]),
  url: HttpUrlSchema,
  lang: z.string(), // "en" | "ko" | "es" …
  enabled: z.boolean(),
  /**
   * LLM 요약 허용 여부 — 기본값 없는 필수 필드(소스마다 약관을 보고 명시적으로 고른다).
   * false면 LLM에 보내지 않고 원제목+링크(`ai:false`) 카드로만 게시한다 — 피드의 제목·URL을 수정하지 않는다
   * (번역·다듬기 금지, 표시 링크는 피드 원문 그대로). PRD FR-20·§15 D22 · plan §14 B5.
   */
  summarize: z.boolean(),
  weight: z.number().min(0).max(3),
  tier: TierSchema,
  competitions: z.array(CompIdSchema).default([]),
  author: z.string().optional(), // 작성자 필터(기자 채널)
  terms_checked: z.boolean(),
  robots_checked: z.boolean(),
  note: z.string().optional(), // 약관 확인 메모·날짜
});
export type Source = z.infer<typeof SourceSchema>;

/** `configs/sources.json` → Source[] (파일 단위: id 중복 금지). */
export const SourcesFileSchema = z
  .array(SourceSchema)
  .superRefine(uniqueBy((s) => s.id, "id", "소스 id"));
export type SourcesFile = z.infer<typeof SourcesFileSchema>;
