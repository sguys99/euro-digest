/**
 * 한국 선수 — 명단 설정 `configs/korean-players.json`, 주간 리포트 `data/players/weekly/{yyyy-ww}.json`
 * (plan.md 부록 A), 현황 데이터 `data/players/korean.json`(v0.1 — 2026-10-10 사용자 확인). PRD F6·F9.
 * 2026-10-10 결정: 명단 설정은 strictObject(Q5), slug·주차 범위 형식 검사(Q7).
 */
import { z } from "zod";

import {
  CompIdSchema,
  IsoDateSchema,
  IsoSchema,
  PositionSchema,
  SeasonSchema,
  SlugSchema,
  uniqueBy,
} from "./common";

// ─── 부록 A ─────────────────────────────────────────────────────────────────

/** 선수 소속 대회 — 5대 리그·UCL 밖이면 "OTHER" (FR-64). */
export const PlayerCompSchema = CompIdSchema.or(z.literal("OTHER"));
export type PlayerComp = z.infer<typeof PlayerCompSchema>;

/** 한국 선수 1명 (부록 A, FR-60). 사람이 편집하는 설정이라 알 수 없는 키는 오류. */
export const KoreanPlayerSchema = z.strictObject({
  slug: SlugSchema, // 선수 페이지 URL — 한 번 정하면 불변
  nameKo: z.string(),
  nameEn: z.string(),
  team: SlugSchema, // 팀 slug
  comp: PlayerCompSchema,
  position: PositionSchema,
  birthYear: z.number(),
  apiFootballId: z.number().nullable(),
  active: z.boolean(), // false = 기타 리그 이적 등으로 기록 갱신 중단, 목록에는 유지 (FR-64)
});
export type KoreanPlayer = z.infer<typeof KoreanPlayerSchema>;

/** `configs/korean-players.json` → KoreanPlayer[] (파일 단위: slug 중복 금지). */
export const KoreanPlayersFileSchema = z
  .array(KoreanPlayerSchema)
  .superRefine(uniqueBy((p) => p.slug, "slug", "선수 slug"));
export type KoreanPlayersFile = z.infer<typeof KoreanPlayersFileSchema>;

/**
 * 한국 선수 주간 리포트 (부록 A, FR-90~93).
 * week는 ISO 8601 주차 "YYYY-WW"(01~53) — 연도는 ISO week-year다(달력 연도와 다를 수 있음).
 * 예) 2026-12-28(월)이 속한 주 → "2026-53", 2027-01-01(금)도 "2026-53".
 * 정규식은 형식·범위만 본다(그해에 53주가 실제로 있는지, from/to와의 일치는 생성 코드·테스트가 보장).
 */
export const WeeklyReportSchema = z.object({
  week: z.string().regex(/^\d{4}-(?:0[1-9]|[1-4]\d|5[0-3])$/, {
    error: "주차는 YYYY-WW (01~53)",
  }),
  from: IsoSchema,
  to: IsoSchema,
  rows: z.array(
    z.object({
      player: SlugSchema, // 선수 slug
      apps: z.number(),
      minutes: z.number(),
      goals: z.number(),
      assists: z.number(),
    }),
  ),
  mvp: SlugSchema.nullable(), // 선수 slug, 코드 규칙: 골×3 + 도움×2 + 출전 (FR-92)
  summary: z.string(), // LLM 총평 3~5문장 (FR-91)
  generatedAt: IsoSchema,
});
export type WeeklyReport = z.infer<typeof WeeklyReportSchema>;

// ─── v0.1 — 2026-10-10 사용자 확인 — `data/players/korean.json` ────────────────
// 2026-11-01 사용자 결정(PRD §15 D65, M3-02·M3-03): ① 컵 대회 원문 이름 `leagueRaw`(comp "OTHER"일 때만 — 원장 `league` 원문,
// 예 "DFB Pokal". 화면은 names.ko로 한글 표기, 미등록이면 원문) ② 집계 시작일 — 파일 `since`(원장 meta.since 복사)·선수별 `since`
// (meta.playerSince 복사, 추적하지 않는 선수는 null). 시즌 누적의 고유 키는 comp + leagueRaw(OTHER 대회가 여럿일 수 있다).

/** 컵 대회 원문 이름(원장 `league`) — comp가 "OTHER"일 때만 둔다 */
const LeagueRawSchema = z.string().min(1);

/** leagueRaw는 comp "OTHER"에만 */
function leagueRawOnlyOther(
  v: { comp: PlayerComp; leagueRaw?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (v.leagueRaw !== undefined && v.comp !== "OTHER") {
    ctx.addIssue({
      code: "custom",
      path: ["leagueRaw"],
      message: "leagueRaw는 comp가 OTHER일 때만",
    });
  }
}

/** 시즌 누적 행의 고유 키 — comp + leagueRaw(D65) */
export function playerSeasonKey(s: {
  comp: PlayerComp;
  leagueRaw?: string | undefined;
}): string {
  return s.leagueRaw === undefined ? s.comp : `${s.comp}:${s.leagueRaw}`;
}

/** 상대 팀 — data/teams에 없는 팀(컵 대회 하부 리그 팀 등)은 slug가 null. */
export const OpponentSchema = z.object({
  slug: SlugSchema.nullable(), // data/teams/{slug}.json이 있으면 팀 페이지로 연결
  name: z.string().min(1), // 데이터 API 원문 팀 이름(영문) — 표시할 때 names.ko로 치환(FR-24)
});
export type Opponent = z.infer<typeof OpponentSchema>;

/** 대회별 시즌 누적 (FR-61 시즌 누적·UCL 출전 여부, FR-62 시즌 기록). */
export const PlayerSeasonStatsSchema = z
  .object({
    comp: PlayerCompSchema, // 리그·UCL을 따로 센다
    leagueRaw: LeagueRawSchema.optional(), // comp OTHER만 — 대회 원문 이름(D65)
    apps: z.number().int().min(0), // 출전 경기 수
    minutes: z.number().int().min(0).nullable(), // 출전 시간 — 폴백(FR-65)이면 null
    goals: z.number().int().min(0),
    assists: z.number().int().min(0).nullable(), // 폴백이면 null
  })
  .superRefine(leagueRawOnlyOther);
export type PlayerSeasonStats = z.infer<typeof PlayerSeasonStatsSchema>;

/** 경기별 출전 로그 1건 (FR-62 최근 5경기, 홈 하이라이트 칩). */
export const PlayerMatchLogSchema = z
  .object({
    matchId: z.string().min(1), // Match.id(data/competitions) — 대회 밖 경기는 데이터 API 원본 id
    comp: PlayerCompSchema,
    leagueRaw: LeagueRawSchema.optional(), // comp OTHER만 — 대회 원문 이름(D65)
    kickoff: IsoSchema, // UTC — KST 표시는 화면에서
    opponent: OpponentSchema,
    home: z.boolean(),
    result: z
      .object({
        for: z.number().int().min(0),
        against: z.number().int().min(0),
      })
      .nullable(), // 소속팀 기준 스코어, 정보 없으면 null
    started: z.boolean().nullable(), // 선발 여부 — 폴백이면 null
    minutes: z.number().int().min(0).nullable(), // 0 = 명단 제외·미출전, null = 정보 없음(폴백)
    goals: z.number().int().min(0),
    assists: z.number().int().min(0).nullable(), // 폴백이면 null
  })
  .superRefine(leagueRawOnlyOther);
export type PlayerMatchLog = z.infer<typeof PlayerMatchLogSchema>;

/** 다음 경기 (FR-61, 캘린더 FR-123 입력). */
export const PlayerNextMatchSchema = z
  .object({
    matchId: z.string().min(1),
    comp: PlayerCompSchema,
    leagueRaw: LeagueRawSchema.optional(), // comp OTHER만 — 대회 원문 이름(D65)
    kickoff: IsoSchema, // UTC — KST 표시는 화면에서
    opponent: OpponentSchema,
    home: z.boolean(),
  })
  .superRefine(leagueRawOnlyOther);
export type PlayerNextMatch = z.infer<typeof PlayerNextMatchSchema>;

/** 선수 1명의 현황 (configs/korean-players.json의 slug로 연결). */
export const KoreanPlayerRecordSchema = z.object({
  slug: SlugSchema, // configs/korean-players.json의 slug
  team: SlugSchema, // 기록 시점 소속팀 slug — 설정과 다르면 이적 감지 단서(FR-63)
  provider: z.enum(["api-football", "fallback"]), // 데이터 경로: fallback = 경기 결과 + 득점 순위 + 뉴스(FR-65)
  since: IsoDateSchema.nullable(), // 이 선수 집계 시작일(UTC 날짜, meta.playerSince 복사 — D65) · 추적하지 않는 선수(id 없음·비활성)는 null
  season: z
    .array(PlayerSeasonStatsSchema)
    .superRefine(uniqueBy(playerSeasonKey, "comp", "시즌 누적 대회")), // 고유 키 comp + leagueRaw(D65)
  recent: z.array(PlayerMatchLogSchema).max(5), // 최근 5경기, 최신순 (FR-62)
  next: PlayerNextMatchSchema.nullable(), // 일정 없으면 null
  updatedAt: IsoSchema, // 이 선수 기록의 마지막 갱신 — 소속팀 경기 다음 날만 갱신(FR-61), active:false면 멈춤(FR-64)
});
export type KoreanPlayerRecord = z.infer<typeof KoreanPlayerRecordSchema>;

/** `data/players/korean.json` 파일 (M3-03). 관련 뉴스는 빌드 시 카드 태그로 찾는다. */
export const KoreanPlayersDataFileSchema = z.object({
  season: SeasonSchema,
  since: IsoDateSchema, // 집계 시작일(UTC 날짜, 원장 meta.since 복사 — D33 ③·D65) — 화면 "○월 ○일 이후 집계"
  generatedAt: IsoSchema,
  players: z
    .array(KoreanPlayerRecordSchema)
    .superRefine(uniqueBy((p) => p.slug, "slug", "선수 slug")),
});
export type KoreanPlayersDataFile = z.infer<typeof KoreanPlayersDataFileSchema>;
