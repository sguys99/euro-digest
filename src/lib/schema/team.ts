/**
 * 팀 페이지 데이터 — `data/teams/{team}.json` (plan.md 부록 A, PRD F5 FR-50~59).
 * 파일 1개 = 팀 1개. 파일명은 slug와 같다.
 * v0.1 — 2026-10-10 사용자 확인: slug·koreanPlayers는 slug 형식, colors는 #RRGGBB(Q7), 더 읽을거리 URL은 http/https만(Q3).
 */
import { z } from "zod";

import {
  CompIdSchema,
  HexColorSchema,
  HttpUrlSchema,
  IsoSchema,
  SlugSchema,
} from "./common";

/** 팀 1개. */
export const TeamSchema = z.object({
  slug: SlugSchema,
  nameKo: z.string(),
  nameEn: z.string(),
  short: z.string().max(4), // 배지 약어 (DR-05, 예: LIV)
  comp: CompIdSchema,
  alsoIn: z.array(CompIdSchema).default([]), // 예: ["UCL"]
  colors: z.tuple([HexColorSchema, HexColorSchema]), // [주색, 보조색] — configs/team-colors.json에서 복사
  formation: z
    .object({
      shape: z.string(),
      source: z.enum(["api", "manual"]),
      updated: IsoSchema,
    })
    .nullable(),
  topPlayers: z
    .array(
      z.object({
        name: z.string(),
        goals: z.number(),
        assists: z.number().nullable(),
      }),
    )
    .max(3),
  profile: z
    .object({
      // 주 1회 LLM (FR-53·FR-56)
      oneLiner: z.string().max(80),
      strengths: z.array(z.string()).length(2),
      weaknesses: z.array(z.string()).length(2),
      generatedAt: IsoSchema,
    })
    .nullable(),
  koreanPlayers: z.array(SlugSchema), // korean-players.json slug
  reading: z.array(
    z.object({ title: z.string(), url: HttpUrlSchema, source: z.string() }),
  ),
});
export type Team = z.infer<typeof TeamSchema>;
