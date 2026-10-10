/**
 * 뉴스 소스 설정 — `configs/sources.json` (plan.md 부록 A, PRD FR-01).
 * 수집 대상은 `enabled && terms_checked`, 목록·OG 크롤링 소스는 `robots_checked`도 true여야 한다(CLAUDE.md §6.4).
 * 새 소스는 `/add-source` 절차로만 추가한다.
 *
 * v0.1 — 2026-10-10 사용자 확인: strictObject(알 수 없는 키 = 오류, Q5), id는 slug(Q7), url은 http/https만(Q3).
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
