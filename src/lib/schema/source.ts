/**
 * 뉴스 소스 설정 — `configs/sources.json` (plan.md 부록 A, PRD FR-01).
 * 수집 대상은 `enabled && terms_checked`, 목록·OG 크롤링 소스는 `robots_checked`도 true여야 한다(CLAUDE.md §6.4).
 * 새 소스는 `/add-source` 절차로만 추가한다.
 *
 * v0.1 — 2026-10-10 사용자 확인: strictObject(알 수 없는 키 = 오류, Q5), id는 slug(Q7), url은 http/https만(Q3).
 * v0.1 — 2026-10-10 사용자 결정(M0-23, PRD §15 D22 · plan §14 B5): `summarize` 필수 필드 추가. `terms_checked`는
 *   "note에 적은 이용 방식(요약 또는 원제목+링크)이 약관상 허용됨"을 뜻한다 — 금지·불명확이면 false(이중 잠금).
 * v0.1 — 2026-10-12 사용자 결정(PRD §15 D32): 선택 필드 `retentionDays`(소스별 보존 기간) 추가.
 * v0.1 — 2026-10-12 사용자 결정(PRD §15 D34): 선택 필드 `tz`(피드 날짜 기본 시간대, IANA 이름) 추가.
 */
import { z } from "zod";

import { isIanaTimeZone } from "@/lib/time";

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
   * D23(2026-10-10): 현재 모든 소스가 false이고 뉴스 기사는 LLM에 보내지 않는다. true로 바꿔 LLM 요약 경로를
   * 다시 여는 것은 사용자 승인 사항이다(CLAUDE.md §1-3).
   */
  summarize: z.boolean(),
  weight: z.number().min(0).max(3),
  tier: TierSchema,
  competitions: z.array(CompIdSchema).default([]),
  author: z.string().optional(), // 작성자 필터(기자 채널)
  /**
   * 피드 날짜 기본 시간대(IANA 이름) — 선택 필드. 피드 날짜에 시간대가 **없을 때만** 이 시간대의 현지 시각으로 해석해
   * UTC로 저장한다. 시간대가 적힌 날짜(`GMT`·`+0900`·`Z` 등)에는 쓰지 않는다. 없으면 시간대 없는 날짜는 추측하지 않고
   * 그 항목을 건너뛴다(`no-date`). 현재 국내 5피드 `Asia/Seoul`(pubDate가 오프셋 없는 `YYYY-MM-DD HH:mm:ss`).
   * 허용 이름은 `isIanaTimeZone`(src/lib/time.ts): `지역/장소` 형식 + 실행 환경 시간대 데이터가 아는 이름, 그리고 `UTC`·`Etc/UTC`.
   * 약어(`KST`)·오프셋(`+09:00`)·`Etc/GMT-9`·옛 별칭(`ROK`)·앞뒤 공백은 거부한다. 해석 규칙은 `parseFeedDate`.
   * v0.1 — 2026-10-12 사용자 결정(PRD §15 D34, plan 부록 A).
   */
  tz: z
    .string()
    .refine(isIanaTimeZone, {
      error:
        'tz는 IANA 시간대 이름(예: "Asia/Seoul", "Europe/Rome", "UTC") — 약어·오프셋·Etc/GMT±N은 받지 않는다',
    })
    .optional(),
  /**
   * 소스별 보존 기간(일) — 선택 필드. 없으면 PRD §8.4 기본(일별 뉴스 90일 → 월별 병합, 영구 보존).
   * 기간이 지나면 수집 실행이 data/에서 그 출처를 지운다(대표 출처면 카드 삭제 — 삭제 구현은 plan M1-25).
   * 현재 the-athletic-football 7일(ToS 4.1(5) 캐시·보관 금지). 양의 정수만(0·음수·소수 거부).
   * v0.1 — 2026-10-12 사용자 결정(PRD §15 D32, plan 부록 A).
   */
  retentionDays: z.number().int().positive().optional(),
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
