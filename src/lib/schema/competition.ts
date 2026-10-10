/**
 * 대회 데이터 — `data/competitions/{comp}.json` (PRD F4 FR-40~45).
 * StandingRow·Match는 plan.md 부록 A, 파일 래퍼(CompetitionFile)와 Scorer는 v0.1 — 2026-10-10 사용자 확인.
 * 외부 API 형식은 어댑터(scripts/lib/providers/*)에서 이 내부 스키마로 바꾼다(CLAUDE.md §6.4).
 */
import { z } from "zod";

import { CompIdSchema, IsoSchema, SeasonSchema, uniqueBy } from "./common";

// ─── 부록 A ─────────────────────────────────────────────────────────────────

/**
 * 순위표 구간 (FR-42 — 화면은 색 + 텍스트 병기).
 * knockout·playoff는 2026-10-10 결정 Q4로 추가 — UCL 리그 페이즈 전용:
 *   knockout = 16강 직행(1~8위), playoff = 녹아웃 플레이오프(9~24위). 25위 이하는 none.
 * 리그의 강등 플레이오프 순위는 relegation + competitions.json의 label("강등 PO")로 표시한다.
 */
export const StandingZoneSchema = z.enum([
  "ucl",
  "uel",
  "uecl",
  "knockout",
  "playoff",
  "relegation",
  "none",
]);
export type StandingZone = z.infer<typeof StandingZoneSchema>;

/** 순위표 1행 (부록 A). */
export const StandingRowSchema = z.object({
  pos: z.number(),
  prevPos: z.number().nullable(), // 전일 순위 — ▲▼ 계산(M2-03), 첫 수집일은 null
  team: z.string(), // 팀 slug
  played: z.number(),
  w: z.number(),
  d: z.number(),
  l: z.number(),
  gf: z.number(),
  ga: z.number(),
  pts: z.number(),
  form: z.array(z.enum(["W", "D", "L"])).max(5),
  zone: StandingZoneSchema,
});
export type StandingRow = z.infer<typeof StandingRowSchema>;

/** 경기 상태 (부록 A Match.status). */
export const MatchStatusSchema = z.enum(["scheduled", "finished", "postponed"]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

/** 경기 1건 (부록 A). kickoff는 UTC — KST 표시는 화면에서(FR-44). */
export const MatchSchema = z.object({
  id: z.string(),
  comp: CompIdSchema,
  round: z.string(),
  kickoff: IsoSchema,
  home: z.string(), // 팀 slug
  away: z.string(), // 팀 slug
  score: z.object({ h: z.number(), a: z.number() }).nullable(),
  status: MatchStatusSchema,
});
export type Match = z.infer<typeof MatchSchema>;

// ─── v0.1 — 2026-10-10 사용자 확인 (부록 A 추가분) ─────────────────────────────

/**
 * 득점 순위 1행 (FR-41 득점 순위 탭, FR-52 팀 득점 상위). 배열 순서 = 순위(골 내림차순).
 */
export const ScorerSchema = z.object({
  player: z.string().min(1), // 선수 이름 — 데이터 API 원문(영문). 표시할 때 names.ko로 치환(FR-24)
  team: z.string().min(1), // 팀 slug
  goals: z.number().int().min(0),
  assists: z.number().int().min(0).nullable(), // API 응답에 없으면 null
  penalties: z.number().int().min(0).nullable(), // 페널티 득점, 없으면 null
  played: z.number().int().min(0).nullable(), // 출전 경기 수, 없으면 null
});
export type Scorer = z.infer<typeof ScorerSchema>;

/**
 * `data/competitions/{comp}.json` 파일 1개 = 대회 1개 (파일명은 comp 소문자, 예: `epl.json`).
 * 검사: 경기의 comp가 파일 comp와 같을 것, 경기 id·순위표 팀 중복 금지.
 */
export const CompetitionFileSchema = z
  .object({
    comp: CompIdSchema, // 대회 ID (FR-40)
    season: SeasonSchema, // 시즌 시작 연도 (2026 = 2026-27)
    provider: z.enum(["football-data", "api-football"]), // 데이터 출처 표기(FR-45), 어댑터 폴백 시 바뀜
    updatedAt: IsoSchema, // API에서 마지막으로 받은 시각 — 실패 시 전일 데이터를 유지하므로 화면이 "업데이트 지연"을 판단(M2-02)·갱신 시각 표기(FR-45)
    standings: z
      .array(StandingRowSchema)
      .superRefine(uniqueBy((r) => r.team, "team", "순위표 팀")), // 리그 순위표 / UCL 리그 페이즈 순위표 (FR-42·FR-43)
    matches: z
      .array(MatchSchema)
      .superRefine(uniqueBy((m) => m.id, "id", "경기 id")), // 시즌 전체 일정·결과, UCL 녹아웃 포함 (FR-43·FR-44)
    scorers: z.array(ScorerSchema).default([]), // 득점 순위 (FR-41), API 실패 시 빈 배열
  })
  .superRefine((file, ctx) => {
    file.matches.forEach((m, index) => {
      if (m.comp !== file.comp) {
        ctx.addIssue({
          code: "custom",
          path: ["matches", index, "comp"],
          message: `파일 대회(${file.comp})와 경기 대회(${m.comp})가 다름`,
        });
      }
    });
  });
export type CompetitionFile = z.infer<typeof CompetitionFileSchema>;
