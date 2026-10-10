/**
 * v0.1 — 2026-10-10 사용자 확인
 * 사람이 관리하는 설정 파일 스키마 (PRD §8.3) 7종:
 *   configs/competitions.json · national-team.json · bigmatch-rules.json · search-queries.json
 *   · formations.json · team-colors.json · transfer-windows.json
 * (sources·korean-players·takedowns → source.ts·player.ts·takedown.ts, names.ko → names.ts)
 *
 * 공통 원칙
 * - 손으로 고치는 파일이라 모든 객체를 strictObject로 둔다 — 오타 키는 무시되지 않고 오류(결정 Q5).
 * - 시각은 UTC ISO 8601, 날짜 라벨만 YYYY-MM-DD. 근거 URL은 http/https만(Q3).
 * - 출처로 확인한 값만 적고 근거 URL을 남긴다(CLAUDE.md §1-7).
 */
import { z } from "zod";

import {
  CompIdSchema,
  HexColorSchema,
  HttpUrlSchema,
  IsoDateSchema,
  IsoSchema,
  SeasonSchema,
  SlugSchema,
  isBefore,
  uniqueBy,
} from "./common";
import { MatchStatusSchema, StandingZoneSchema } from "./competition";

// ─── configs/competitions.json ──────────────────────────────────────────────

/**
 * 순위 구간 규칙 1개 (FR-42 — 챔스·유로파·강등권 구간, 색 + 텍스트 병기). 순위 from~to(포함)에 zone을 붙인다.
 * UCL 리그 페이즈는 knockout(1~8위)·playoff(9~24위)를 쓴다(결정 Q4).
 */
export const ZoneRuleSchema = z
  .strictObject({
    zone: StandingZoneSchema.exclude(["none"]), // StandingRow.zone 값 — 규칙 밖 순위는 "none"
    from: z.number().int().min(1), // 시작 순위(포함)
    to: z.number().int().min(1), // 끝 순위(포함)
    label: z.string().min(1), // 텍스트 병기용 한국어 라벨, 예: "챔스", "강등 PO"
  })
  .refine((r) => r.from <= r.to, {
    path: ["to"],
    error: "끝 순위(to)는 시작 순위(from) 이상",
  });
export type ZoneRule = z.infer<typeof ZoneRuleSchema>;

/** 대회 1개 설정 (M2-01, `/new-season` A). */
export const CompetitionConfigSchema = z
  .strictObject({
    id: CompIdSchema, // 내부 대회 ID — URL은 소문자(`/competitions/epl`)
    nameKo: z.string().min(1), // "프리미어리그"
    nameEn: z.string().min(1), // "Premier League" — 검색 별칭(FR-131)
    shortKo: z.string().min(1).max(6), // 탭·칩용 짧은 이름: "EPL", "라리가", "분데스"
    footballDataCode: z.enum(["PL", "PD", "SA", "BL1", "FL1", "CL"]), // football-data.org 대회 코드
    apiFootballLeagueId: z.number().int().positive(), // API-Football league 파라미터
    season: SeasonSchema, // 시즌 시작 연도 — 두 API의 season 파라미터
    startDate: IsoDateSchema, // 시즌 첫 경기일 — 비시즌 빈 상태(DR-07) 판단
    endDate: IsoDateSchema, // 시즌 마지막 경기일
    teamCount: z.number().int().min(2).max(64), // 순위표 팀 수(리그 20·18, UCL 리그 페이즈 36) — 구간 규칙·순위표 행 수 검사
    zones: z.array(ZoneRuleSchema), // 순위 구간 규칙 (FR-42)
  })
  .superRefine((c, ctx) => {
    if (c.startDate > c.endDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "endDate는 startDate 이후",
      });
    }
    const taken = new Map<number, number>(); // 순위 → 규칙 index
    c.zones.forEach((rule, index) => {
      if (rule.to > c.teamCount) {
        ctx.addIssue({
          code: "custom",
          path: ["zones", index, "to"],
          message: `구간 끝 순위 ${rule.to}가 팀 수 ${c.teamCount}를 넘음`,
        });
      }
      for (let pos = rule.from; pos <= Math.min(rule.to, c.teamCount); pos++) {
        const other = taken.get(pos);
        if (other !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["zones", index],
            message: `${pos}위가 zones[${other}]와 겹침`,
          });
          return;
        }
        taken.set(pos, index);
      }
    });
  });
export type CompetitionConfig = z.infer<typeof CompetitionConfigSchema>;

/** `configs/competitions.json` → CompetitionConfig[] (id·대회 코드 중복 금지). */
export const CompetitionsFileSchema = z
  .array(CompetitionConfigSchema)
  .superRefine(uniqueBy((c) => c.id, "id", "대회 id"))
  .superRefine(
    uniqueBy(
      (c) => c.footballDataCode,
      "footballDataCode",
      "football-data 코드",
    ),
  );
export type CompetitionsFile = z.infer<typeof CompetitionsFileSchema>;

// ─── configs/national-team.json ─────────────────────────────────────────────

/** 한국 대표팀 경기 1건 — 수동 관리 (FR-70). A매치 기간 = 경기일 ±3일(FR-71). */
export const NationalMatchSchema = z
  .strictObject({
    id: SlugSchema, // 고정 ID, 예: "2026-11-14-friendly" — 캘린더(.ics)·소집 명단 연결
    kickoff: IsoSchema, // 킥오프(UTC)
    kickoffTbd: z.boolean().default(false), // 시각 미정이면 true — kickoff는 날짜만 의미
    opponent: z.string().min(1), // 상대국 한글 이름(표시용 그대로)
    home: z.boolean(), // 한국 홈 경기 여부 — 대진 표기 순서
    venue: z.string().optional(), // 경기장·도시(한글)
    competition: z.string().min(1), // 대회 표시명: "친선경기", "월드컵 예선" 등
    status: MatchStatusSchema, // Match.status와 같은 값
    result: z
      .strictObject({
        kor: z.number().int().min(0),
        opp: z.number().int().min(0),
      })
      .nullable(), // 결과(수동) — finished일 때만 값
    sourceUrl: HttpUrlSchema.optional(), // 일정·결과 근거(대한축구협회 발표 등)
  })
  .refine((m) => (m.status === "finished") === (m.result !== null), {
    path: ["result"],
    error: "결과는 status가 finished일 때만 (finished면 필수)",
  });
export type NationalMatch = z.infer<typeof NationalMatchSchema>;

/**
 * 소집 명단 1회분 — **등록된 한국 선수 중 소집된 선수만** 적는다(FR-73 링크용, 결정 Q9).
 * 전체 명단(26명 안팎)은 수동 입력 부담이 커서 두지 않는다 — 소집 소식은 뉴스로 반영(FR-70).
 */
export const SquadSchema = z.strictObject({
  id: SlugSchema, // 예: "2026-11"
  announcedAt: IsoSchema, // 명단 발표 시각(UTC)
  matchIds: z.array(SlugSchema).min(1), // 이 명단이 뛰는 경기 id(matches[].id)
  playerSlugs: z.array(SlugSchema), // 소집된 선수의 korean-players.json slug — 선수 상세 링크(FR-73)
  sourceUrl: HttpUrlSchema.optional(), // 명단 근거(대한축구협회 발표)
});
export type Squad = z.infer<typeof SquadSchema>;

/** `configs/national-team.json` (F7). 주요국 A매치는 뉴스 카테고리 national로 처리(FR-72). */
export const NationalTeamFileSchema = z
  .strictObject({
    matches: z
      .array(NationalMatchSchema)
      .superRefine(uniqueBy((m) => m.id, "id", "경기 id")),
    squads: z
      .array(SquadSchema)
      .default([])
      .superRefine(uniqueBy((s) => s.id, "id", "명단 id")),
  })
  .superRefine((file, ctx) => {
    const matchIds = new Set(file.matches.map((m) => m.id));
    file.squads.forEach((squad, i) => {
      squad.matchIds.forEach((id, j) => {
        if (!matchIds.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: ["squads", i, "matchIds", j],
            message: `matches에 없는 경기 id: "${id}"`,
          });
        }
      });
    });
  });
export type NationalTeamFile = z.infer<typeof NationalTeamFileSchema>;

// ─── configs/bigmatch-rules.json ────────────────────────────────────────────

/** 가중치 0~10 (점수 = 해당 규칙 가중치 합). */
const WeightSchema = z.number().min(0).max(10);

/** 지정 더비 1개 (FR-81 ④). */
export const DerbySchema = z
  .strictObject({
    name: z.string().min(1), // 선정 이유 태그에 쓸 이름, 예: "노스런던 더비" (FR-82)
    teams: z.tuple([SlugSchema, SlugSchema]), // 팀 slug 2개(순서 무관)
  })
  .refine((d) => d.teams[0] !== d.teams[1], {
    path: ["teams"],
    error: "더비의 두 팀이 같음",
  });
export type Derby = z.infer<typeof DerbySchema>;

/**
 * `configs/bigmatch-rules.json` — "오늘 밤 볼 경기" 선정 (F8 FR-80~84, LLM 미사용).
 * 경기마다 해당 규칙의 weight를 더해 점수화 → minScore 이상 중 상위 maxMatches개.
 */
export const BigmatchRulesFileSchema = z.strictObject({
  window: z.strictObject({
    fromKst: z.iso.time({ precision: -1 }), // 대상 시작 "HH:MM"(KST, 당일) — FR-80: "18:00"
    toKst: z.iso.time({ precision: -1 }), // 대상 끝 "HH:MM"(KST, 익일) — FR-80: "07:00"
  }),
  maxMatches: z.number().int().min(1).max(10), // 상위 N경기 (FR-81: 5)
  minScore: z.number().min(0), // 이 점수 미만은 제외 (0 = 경기가 있으면 maxMatches까지 채움)
  rules: z.strictObject({
    korean: z.strictObject({ weight: WeightSchema }), // ① 한국 선수 소속팀 경기 — "한국 선수 출전 예상"
    ucl: z.strictObject({ weight: WeightSchema }), // ② UCL 경기
    topClash: z.strictObject({
      weight: WeightSchema,
      topN: z.number().int().min(2).max(20), // ③ 상위 N위 간 맞대결 (FR-81: 6)
    }),
    derby: z.strictObject({
      weight: WeightSchema,
      list: z.array(DerbySchema), // ④ 지정 더비 목록
    }),
    closeRace: z.strictObject({
      weight: WeightSchema,
      maxPointsGap: z.number().int().min(0).max(10), // ⑤ 두 팀 승점 차 N 이내 (FR-81: 3)
    }),
    bigClub: z.strictObject({
      weight: WeightSchema,
      teams: z.array(SlugSchema), // 빅클럽 팀 slug — 뉴스 점수화 키워드(FR-06)도 같은 목록을 쓸 수 있음
    }),
  }),
});
export type BigmatchRulesFile = z.infer<typeof BigmatchRulesFileSchema>;

// ─── configs/search-queries.json ────────────────────────────────────────────

/** 뉴스 검색 쿼리 1개 — Google News RSS·GDELT (FR-02, M1-06·M1-07). */
export const SearchQuerySchema = z.strictObject({
  id: SlugSchema, // 로그·소스 건강도 집계 키
  source: SlugSchema, // configs/sources.json의 type:"search" 소스 id — 그 소스의 enabled·terms_checked를 따른다
  q: z.string().min(1), // 검색어 원문(따옴표·연산자 포함), 예: "\"Here we go\" Romano"
  lang: z.string().min(2), // 결과 언어 — Google News hl / GDELT sourcelang (예: "ko", "en")
  region: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(), // 국가 코드 — Google News gl (예: "KR", "GB")
  purpose: z.enum(["korean", "transfer", "team", "ucl", "national", "general"]), // 점수화·분류 힌트(FR-06)
  player: SlugSchema.optional(), // 대상 한국 선수 slug(korean-players.json) — `/add-player`가 한/영 1개씩 추가
  team: SlugSchema.optional(), // 대상 팀 slug
  enabled: z.boolean(),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

/** `configs/search-queries.json` — 활성 쿼리 수 ≤ maxEnabled (객체 + sources 참조 구조, 결정 Q8). */
export const SearchQueriesFileSchema = z
  .strictObject({
    maxEnabled: z.number().int().min(1).max(100), // 하루 실행 쿼리 상한 — M0-26에서 결정(basic_plan: 20~30개)
    queries: z
      .array(SearchQuerySchema)
      .superRefine(uniqueBy((q) => q.id, "id", "쿼리 id")),
  })
  .superRefine((file, ctx) => {
    const enabled = file.queries.filter((q) => q.enabled).length;
    if (enabled > file.maxEnabled) {
      ctx.addIssue({
        code: "custom",
        path: ["queries"],
        message: `활성 쿼리 ${enabled}개가 상한 maxEnabled(${file.maxEnabled})를 넘음`,
      });
    }
  });
export type SearchQueriesFile = z.infer<typeof SearchQueriesFileSchema>;

// ─── configs/formations.json ────────────────────────────────────────────────

/** 포메이션 표기 "4-2-3-1" — 줄 3~5개, 필드 플레이어 합 10. */
export const FormationShapeSchema = z
  .string()
  .regex(/^[1-9](?:-[1-9]){2,4}$/, { error: '포메이션은 "4-3-3" 형식' })
  .refine(
    (shape) => shape.split("-").reduce((sum, n) => sum + Number(n), 0) === 10,
    { error: "필드 플레이어 합이 10이어야 함" },
  );

/** 수동 포메이션 1개 → Team.formation(source: "manual"). */
export const ManualFormationSchema = z.strictObject({
  shape: FormationShapeSchema, // → Team.formation.shape
  updated: IsoSchema, // 확인 시각 → Team.formation.updated
  sourceUrl: HttpUrlSchema.optional(), // 근거(구단 공식 라인업 발표 등)
});
export type ManualFormation = z.infer<typeof ManualFormationSchema>;

/** `configs/formations.json` — 팀 slug → 수동 포메이션 (FR-55 폴백, B1 결과에 따름). */
export const FormationsFileSchema = z.record(SlugSchema, ManualFormationSchema);
export type FormationsFile = z.infer<typeof FormationsFileSchema>;

// ─── configs/team-colors.json ───────────────────────────────────────────────

/** 팀 배지 1개 — 로고 대신 팀 컬러 2색 + 영문 약어 (DR-05, CLAUDE.md §1-6). */
export const TeamColorSchema = z
  .strictObject({
    colors: z.tuple([HexColorSchema, HexColorSchema]), // [주색, 보조색] → Team.colors. 배지 안 배치·대비 처리는 D1 디자인에서
    short: z
      .string()
      .regex(/^[A-Z0-9]{2,4}$/, { error: "약어는 영문 대문자·숫자 2~4자" }), // → Team.short (예: LIV)
  })
  .refine((t) => t.colors[0].toLowerCase() !== t.colors[1].toLowerCase(), {
    path: ["colors"],
    error: "주색과 보조색이 같음",
  });
export type TeamColor = z.infer<typeof TeamColorSchema>;

/** `configs/team-colors.json` — 팀 slug → 배지 색·약어 (M2-05). */
export const TeamColorsFileSchema = z.record(SlugSchema, TeamColorSchema);
export type TeamColorsFile = z.infer<typeof TeamColorsFileSchema>;

// ─── configs/transfer-windows.json ──────────────────────────────────────────

/** 리그별 이적 창 1회 (FR-105). UCL은 이적 창이 없어 제외. */
export const TransferWindowSchema = z
  .strictObject({
    comp: CompIdSchema.exclude(["UCL"]), // 리그
    season: SeasonSchema, // 시즌 시작 연도(겨울 창 2027-01도 2026 시즌)
    kind: z.enum(["summer", "winter"]),
    opensAt: IsoSchema, // 개장(UTC) — 공식 발표의 현지 시각을 UTC로 바꿔 적는다
    closesAt: IsoSchema, // 마감(UTC)
    sourceUrl: HttpUrlSchema.optional(), // 근거(리그 공식 발표)
  })
  .refine((w) => isBefore(w.opensAt, w.closesAt), {
    path: ["closesAt"],
    error: "closesAt은 opensAt 이후",
  });
export type TransferWindow = z.infer<typeof TransferWindowSchema>;

/** `configs/transfer-windows.json` — 이적 창 모드(홈 이적 섹션 상단·선별 가중). */
export const TransferWindowsFileSchema = z.strictObject({
  boost: z.number().min(1).max(3), // 이적 창 기간 transfer 카테고리 점수 배수 (FR-105). 다른 점수화 가중치는 코드 상수(결정 Q10)
  windows: z
    .array(TransferWindowSchema)
    .superRefine(
      uniqueBy(
        (w) => `${w.comp}/${w.season}/${w.kind}`,
        "kind",
        "이적 창(리그/시즌/종류)",
      ),
    ),
});
export type TransferWindowsFile = z.infer<typeof TransferWindowsFileSchema>;
