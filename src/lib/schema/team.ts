/**
 * 팀 페이지 데이터 — `data/teams/{team}.json` (plan.md 부록 A, PRD F5 FR-50~59).
 * 파일 1개 = 팀 1개. 파일명은 slug와 같다.
 * v0.1 — 2026-10-10 사용자 확인: slug·koreanPlayers는 slug 형식, colors는 #RRGGBB(Q7), 더 읽을거리 URL은 http/https만(Q3).
 * `lineup` 팀시트 1경기(M2-07) — 저장 방침은 PRD §15 D63 ②(사용자 결정 2026-10-30), 포메이션별 보관 대신 단일 lineup 형태는
 * 오케스트레이터 결정(plan 부록 A · DECISIONS D1 §8). 생성 규칙은 scripts/lib/team-files.ts.
 */
import { z } from "zod";

import {
  CompIdSchema,
  HexColorSchema,
  HttpUrlSchema,
  IsoSchema,
  SlugSchema,
} from "./common";
import { FormationShapeSchema } from "./configs";
import { AfMatchKeySchema, LedgerSideSchema } from "./matches";

/**
 * 팀시트 선수 1명 (D63 ② — 이름·등번호·포지션·grid만, 출전 시간 등 선수 기록은 저장하지 않는다).
 * 이름은 API-Football 원문 고정(D63 ① — 팀시트는 사전 치환하지 않는다). 등록 한국 선수만 `korean`(korean-players.json slug,
 * `apiFootballId`로 매칭)이 붙어 화면이 그 선수만 한글로 쓴다.
 */
export const TeamSheetPlayerSchema = z.object({
  name: z.string().min(1), // API-Football 원문(예: "M. Neuer")
  number: z.number().int().min(0).max(99).nullable(), // 등번호 — 응답에 없으면 null
  pos: z.enum(["G", "D", "M", "F"]).nullable(), // 포지션 원문(G·D·M·F) — 없으면 null
  grid: z
    .string()
    .regex(/^[1-9]\d?:[1-9]\d?$/, { error: 'grid는 "줄:칸"(예: "1:1")' })
    .nullable(), // 피치 위치(선발만) — 교체 명단·커버리지 없는 응답은 null
  korean: SlugSchema.optional(), // 등록 한국 선수 slug — 있을 때만
});
export type TeamSheetPlayer = z.infer<typeof TeamSheetPlayerSchema>;

/**
 * 팀시트 라인업 — 주 포메이션(`formation.shape`)을 쓴 가장 최근 경기 1개의 선발 11·교체 명단 (D63 ②, FR-55).
 * 경기 맥락(경기 키·킥오프·대회·상대·홈/원정)은 화면의 "○월 ○일 ○○전 선발" 표기용이다.
 */
export const TeamLineupSchema = z.object({
  formation: FormationShapeSchema, // 그 경기 포메이션 = Team.formation.shape
  match: AfMatchKeySchema, // 원장 경기 키 af-<id>
  kickoff: IsoSchema, // 킥오프(UTC)
  comp: CompIdSchema, // 6개 대회 경기만
  side: LedgerSideSchema, // 이 팀이 홈·원정 중 어느 쪽
  opponent: SlugSchema, // 상대 팀 slug(configs/team-ids.json)
  startXI: z.array(TeamSheetPlayerSchema).length(11),
  substitutes: z.array(TeamSheetPlayerSchema).max(30),
});
export type TeamLineup = z.infer<typeof TeamLineupSchema>;

/** 팀 1개. */
export const TeamSchema = z
  .object({
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
    // 팀시트(초안 M2-07 — D63 ②). 주 포메이션 경기의 라인업을 받지 못했으면 null(화면은 피치·명단을 숨긴다)
    lineup: TeamLineupSchema.nullable().default(null),
  })
  .superRefine((team, ctx) => {
    if (team.lineup === null) return;
    if (
      team.formation === null ||
      team.lineup.formation !== team.formation.shape
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["lineup", "formation"],
        message: "팀시트 포메이션은 formation.shape와 같아야 한다",
      });
    }
    if (team.lineup.opponent === team.slug) {
      ctx.addIssue({
        code: "custom",
        path: ["lineup", "opponent"],
        message: "상대 팀이 자기 팀이다",
      });
    }
  });
export type Team = z.infer<typeof TeamSchema>;
