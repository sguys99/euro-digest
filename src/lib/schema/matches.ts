/**
 * v0.1 — 2026-10-14 사용자 확인(PRD §15 D33, M1-48b) — 경기 기록 원장. 확정 세부: `goalsComplete`·`season`·`leagueId`·출전 상태
 * `unknown`·gaps `cause` 추가, 전반 스코어(ht) 미저장, playerSince = 추적 선수 전원의 시작일, since = COLLECT_ENABLED를 켠 뒤 처음
 * 원장을 쓰는 실행이 정한다.
 *   `data/matches/YYYY-MM.json` (킥오프 UTC 달) + `data/matches/meta.json` (집계 시작일·선수별 시작일·빠진 날)
 *
 * API-Football 경기 단건(`/fixtures?id=`)에서 **득점·도움·포메이션 + 등록 한국 선수 행만** 남긴다(D33 ②) — 전 선수 출전 시간·
 * 로고·사진·원본 응답은 저장하지 않는다(API-Football 재판매 금지 — 공개 저장소의 API 파생 데이터 최소화). 원장에는 API-Football
 * id·응답 원문 이름만 두고 slug는 읽을 때 `configs/team-ids.json`·`configs/names.ko.json`으로 바꾼다(D33 ④).
 * 원장은 파이프라인 전용이다 — 화면은 원장을 읽지 않고 파생 파일(`players/korean.json`·팀 포메이션·주간 리포트·브리핑 입력)만 읽는다.
 * 부록 A의 `PlayerMatchLog`·`PlayerSeasonStats`·`WeeklyReport`는 그대로 두고 이 원장의 출력으로 쓴다.
 *
 * 쓰는 조건(M1-48b, 오케스트레이터 결정 2026-10-13): **정기 운영이 켜진 prod 실행만**(저장소 변수 `COLLECT_ENABLED == 'true'`,
 * dry·dev 실행은 쓰지 않음) — 개발 중 수동 실행이 원장을 시작하면 정기 실행 전까지 빈 날이 생겨 "집계 시작일 이후" 누적이
 * 부정확해지기 때문이다. 켠 뒤에는 수동 prod 실행도 쓴다. 원장에는 킥오프가 since 이후인 경기만 들어간다. 불완전 항목(득점
 * 불완전·라인업 없음)은 이월 재조회로 다시 받아 덮어쓴다. 규칙(쓰기·since·playerSince·gaps·재조회)은 scripts/lib/match-ledger.ts.
 */
import { z } from "zod";

import {
  CompIdSchema,
  IsoDateSchema,
  IsoSchema,
  SeasonSchema,
  SlugSchema,
  uniqueBy,
} from "./common";

/** API-Football id(경기·대회·팀·선수) — 양의 정수 */
const AfIdSchema = z.number().int().positive();

/** 원장 경기 키 `af-<API-Football 경기 id>` — 다른 프로바이더 경기와 섞이지 않게 접두사를 붙인다(D33 ①) */
export const AfMatchKeySchema = z.string().regex(/^af-[1-9]\d*$/, {
  error: "원장 경기 id는 af-<API-Football 경기 id>",
});

/** 원장 달 "YYYY-MM" = 킥오프의 UTC 달(파일명) */
export const LedgerMonthSchema = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, { error: "달은 YYYY-MM" });

export const LedgerSideSchema = z.enum(["home", "away"]);

const GoalCountSchema = z.number().int().min(0);

/** 홈-원정 점수 */
export const LedgerScoreSchema = z.object({
  home: GoalCountSchema,
  away: GoalCountSchema,
});

/** 선수 — API-Football 선수 id(응답에 없으면 null)와 응답 원문 이름(영문, 표기가 응답마다 다르다 — 매칭은 id로만) */
export const LedgerPersonSchema = z.object({
  id: AfIdSchema.nullable(),
  name: z.string().min(1),
});

/** 팀 — API-Football 팀 id·원문 이름·포메이션(라인업 원문 "4-2-3-1", 라인업이 없으면 null — FR-55 최빈값 입력) */
export const LedgerTeamSchema = z.object({
  id: AfIdSchema,
  name: z.string().min(1),
  formation: z.string().min(1).nullable(),
});

/** 득점 1건(경기 중 — 승부차기 킥 제외). 자책골은 득점이 인정된 쪽(side)에 두고 scorer는 자책한 선수(상대 팀 소속) */
export const LedgerGoalSchema = z.object({
  minute: z.number().int().min(0), // 경과 분(time.elapsed)
  extra: z.number().int().nullable(), // 추가 시간 분(time.extra) — 표기 `minute+extra`, 없으면 null
  side: LedgerSideSchema, // 득점이 인정된 쪽
  kind: z.enum(["normal", "penalty", "own-goal"]), // 일반·페널티킥(경기 중)·자책골
  scorer: LedgerPersonSchema,
  assist: LedgerPersonSchema.nullable(), // 자책골은 항상 null
});
export type LedgerGoal = z.infer<typeof LedgerGoalSchema>;

/**
 * 한국 선수 출전 상태(D33 ②) — start 선발(`lineups[].startXI`) · sub 교체 출전(교체 명단 + 출전 시간 > 0) · bench 벤치(교체 명단,
 * 출전 없음) · absent 명단 제외(그 팀 라인업이 있는데 없음) · unknown 라인업 없음(커버리지가 없는 대회 — 출전 여부를 모른다).
 * `unknown`은 D33의 4종에 더한 값이다(부록 A `PlayerMatchLog.started`·`minutes`의 null = 정보 없음으로 이어진다).
 */
export const LedgerAppearanceSchema = z.enum([
  "start",
  "sub",
  "bench",
  "absent",
  "unknown",
]);
export type LedgerAppearance = z.infer<typeof LedgerAppearanceSchema>;

/** 등록 한국 선수 행 — configs/korean-players.json 활성 선수 중 그 경기 양 팀(또는 라인업)에 있는 선수 */
export const LedgerKoreanRowSchema = z.object({
  player: AfIdSchema, // korean-players.json apiFootballId(slug는 읽을 때 바꾼다)
  side: LedgerSideSchema,
  status: LedgerAppearanceSchema,
  minutes: z.number().int().min(0).nullable(), // 선수 기록의 출전 시간 — 기록이 없으면 null(벤치·명단 제외를 0으로 바꾸지 않는다)
  goals: GoalCountSchema, // events에서 센 골(자책골 제외) — 경기 goalsComplete가 false면 확정 값이 아니다
  assists: GoalCountSchema,
});
export type LedgerKoreanRow = z.infer<typeof LedgerKoreanRowSchema>;

/** 경기 1건 (D33 ① — 득점 불완전 표시 `goalsComplete`는 M1-48b 추가) */
export const LedgerMatchSchema = z
  .object({
    id: AfMatchKeySchema,
    leagueId: AfIdSchema, // API-Football league id(6개 대회 밖 — 한국 선수 소속팀 컵 등 — 도 구별)
    league: z.string(), // 대회 원문 이름(영문)
    comp: CompIdSchema.nullable(), // 6개 대회면 대회 ID, 그 밖은 null
    season: SeasonSchema.nullable(), // 응답의 시즌 시작 연도 — 없으면 null
    round: z.string().min(1).nullable(), // 라운드 원문("Regular Season - 7") — 없으면 null
    kickoff: IsoSchema, // 킥오프(UTC, `Z`) — 파일 달의 기준
    status: z.enum(["FT", "AET", "PEN"]), // 정규시간·연장·승부차기 종료(종료 경기만 원장에 들어온다)
    home: LedgerTeamSchema,
    away: LedgerTeamSchema,
    ft: LedgerScoreSchema, // 최종 스코어 = 정규시간 + 연장(승부차기 제외 — match-data.ts 공통 규칙)
    pens: LedgerScoreSchema.nullable(), // 승부차기 스코어 — PEN만
    goals: z.array(LedgerGoalSchema), // 시간 순
    goalsComplete: z.boolean(), // events 득점이 양 팀 모두 ft와 맞고 해석하지 못한 득점 이벤트가 없음 — false면 득점자를 사실로 쓰지 않는다
    korean: z
      .array(LedgerKoreanRowSchema)
      .superRefine(uniqueBy((r) => String(r.player), "player", "한국 선수")),
    fetchedAt: IsoSchema, // 받은 시각(UTC)
  })
  .superRefine((m, ctx) => {
    if ((m.status === "PEN") !== (m.pens !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["pens"],
        message: "승부차기 스코어는 PEN 경기에만(PEN이면 필수)",
      });
    }
    if (m.home.id === m.away.id) {
      ctx.addIssue({
        code: "custom",
        path: ["away", "id"],
        message: "홈·원정 팀 id가 같다",
      });
    }
    if (m.goalsComplete) {
      const count = (side: "home" | "away") =>
        m.goals.filter((g) => g.side === side).length;
      if (count("home") !== m.ft.home || count("away") !== m.ft.away) {
        ctx.addIssue({
          code: "custom",
          path: ["goalsComplete"],
          message: "goalsComplete인데 득점 수가 ft와 다르다",
        });
      }
    }
    m.goals.forEach((g, i) => {
      if (g.kind === "own-goal" && g.assist !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["goals", i, "assist"],
          message: "자책골에는 도움이 없다",
        });
      }
    });
  });
export type LedgerMatch = z.infer<typeof LedgerMatchSchema>;

/** 킥오프·id 순 비교(원장 정렬 기준) */
function compareKickoffId(a: LedgerMatch, b: LedgerMatch): number {
  return (
    Date.parse(a.kickoff) - Date.parse(b.kickoff) ||
    Number(a.id.slice(3)) - Number(b.id.slice(3))
  );
}

/**
 * `data/matches/YYYY-MM.json` — 경기 id(`af-<id>`) 기준 덮어쓰기, 킥오프·id 순, 파일 달 = 킥오프 UTC 달(D33 ①).
 * 내용이 같으면 다시 쓰지 않는다(수집 시각만 다른 재조회 포함).
 */
export const MatchLedgerFileSchema = z
  .object({
    month: LedgerMonthSchema,
    updatedAt: IsoSchema, // 마지막으로 내용이 바뀐 시각
    matches: z
      .array(LedgerMatchSchema)
      .superRefine(uniqueBy((m) => m.id, "id", "경기 id")),
  })
  .superRefine((file, ctx) => {
    file.matches.forEach((m, i) => {
      // IsoSchema 형식(`YYYY-MM-DDTHH:MM:SS…Z`)이라 앞 7자가 UTC 달이다(시간대 변환 없음)
      if (m.kickoff.slice(0, 7) !== file.month) {
        ctx.addIssue({
          code: "custom",
          path: ["matches", i, "kickoff"],
          message: `킥오프 UTC 달(${m.kickoff.slice(0, 7)})이 파일 달(${file.month})과 다르다`,
        });
      }
      const prev = file.matches[i - 1];
      if (prev && compareKickoffId(prev, m) > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["matches", i],
          message: "경기는 킥오프·id 순이어야 한다",
        });
      }
    });
  });
export type MatchLedgerFile = z.infer<typeof MatchLedgerFileSchema>;

/**
 * 빠진 날의 사유 (M1-48b) — 날짜 T는 R(T)(오늘 조회)·R(T+1)(어제 조회) 두 실행이 조회한다. 날짜 단위 사유는 첫 기회(오늘 조회)의
 * 실패·건너뜀만 만들고(마지막 기회의 실패는 기존 사유만 유지 — 가짜 빈 날 방지), 나중 실행이 그 날짜를 날짜 조회로 받으면 지운다.
 * dropped는 그 경기가 원장에 들어오면 지운다.
 *   date-query — 날짜 조회 실패(연결·시간 예산·호출 상한·일 한도·키 오류 …) — cause = 오류 종류
 *   degraded   — 날짜 조회가 `errors.plan`으로 막혀 FR-65 폴백으로 강등
 *   skipped    — API-Football 단계가 돌지 않음(키 없음·일일 상한·설정 오류·예상 밖 오류) — 그 실행의 오늘(UTC) 날짜
 *   dropped    — 상세를 받지 못한 채 이월 정리 규칙(킥오프 후 3일·재조회 3회)으로 버린 경기 — date = 킥오프 UTC 날짜
 */
export const LedgerGapReasonSchema = z.enum([
  "date-query",
  "degraded",
  "skipped",
  "dropped",
]);
export type LedgerGapReason = z.infer<typeof LedgerGapReasonSchema>;

export const LedgerGapSchema = z
  .object({
    date: IsoDateSchema, // UTC 날짜(날짜 조회·킥오프 단위)
    reason: LedgerGapReasonSchema,
    cause: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,39}$/, { error: "cause는 소문자 오류 종류" })
      .optional(), // 날짜 단위 사유의 오류 종류·건너뜀 이유(network·quota·daily-cap …)
    matches: z.array(AfIdSchema).min(1).optional(), // dropped만 — 버린 API-Football 경기 id(오름차순)
  })
  .superRefine((g, ctx) => {
    if ((g.reason === "dropped") !== (g.matches !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["matches"],
        message: "matches는 dropped에만(dropped면 필수)",
      });
    }
    if (g.matches?.some((id, i, all) => i > 0 && all[i - 1]! >= id)) {
      ctx.addIssue({
        code: "custom",
        path: ["matches"],
        message: "matches는 중복 없이 오름차순",
      });
    }
  });
export type LedgerGap = z.infer<typeof LedgerGapSchema>;

/**
 * `data/matches/meta.json` (D33 ③) — 날짜는 모두 **UTC 날짜**(날짜 조회·킥오프·원장 달과 같은 단위). 화면의 "○월 ○일 이후 집계"
 * 표시는 파생 파일(M3-03)이 이 값을 복사해 쓴다(KST 표기 변환은 src/lib/time.ts).
 *   since       — COLLECT_ENABLED를 켠 뒤 처음 원장을 쓰는 실행(수동 포함)이 한 번 쓰고 바꾸지 않는 집계 시작일 = 그 실행이 날짜
 *                 조회로 받은 가장 이른 날짜. 원장에는 킥오프 UTC 날짜가 since 이후인 경기만 있다
 *   playerSince — 추적 선수(활성 + apiFootballId) 전원의 집계 시작일. 원장을 시작한 실행의 선수는 since, id를 나중에 채운 선수·나중에
 *                 등록한 선수는 원장에 그 팀 경기가 행 없이 들어 있지 않은 첫 날(scripts/lib/match-ledger.ts `playerStartDate`)
 *   gaps        — 수집 실패로 빠진 날(사유 LedgerGapReason), 날짜·사유 순
 */
export const MatchLedgerMetaSchema = z
  .object({
    season: SeasonSchema, // 집계 시즌(configs/competitions.json season)
    since: IsoDateSchema,
    playerSince: z.record(SlugSchema, IsoDateSchema),
    gaps: z.array(LedgerGapSchema),
  })
  .superRefine((meta, ctx) => {
    for (const [slug, date] of Object.entries(meta.playerSince)) {
      if (date < meta.since) {
        ctx.addIssue({
          code: "custom",
          path: ["playerSince", slug],
          message: `선수 시작일(${date})은 since(${meta.since})보다 앞설 수 없다`,
        });
      }
    }
    meta.gaps.forEach((g, i) => {
      if (g.date < meta.since) {
        ctx.addIssue({
          code: "custom",
          path: ["gaps", i, "date"],
          message: `빠진 날(${g.date})은 since(${meta.since}) 이후여야 한다`,
        });
      }
      const prev = meta.gaps[i - 1];
      if (
        prev &&
        (prev.date > g.date ||
          (prev.date === g.date && prev.reason >= g.reason))
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["gaps", i],
          message: "gaps는 날짜·사유 순, (날짜, 사유) 중복 금지",
        });
      }
    });
  });
export type MatchLedgerMeta = z.infer<typeof MatchLedgerMetaSchema>;
