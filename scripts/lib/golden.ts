/**
 * 브리핑 골든셋 (M1-24 — PRD §9.2 "브리핑은 10일치 입력 회귀 비교", CLAUDE.md §6.3). `npm run eval:prompt`가 읽는다.
 *
 * 폴더 `fixtures/llm/golden/` (형식은 그 폴더 README.md)
 *   - `index.json`        — 날짜별 제목·태그(경기 많은 날·적은 날·UCL·대승·무승부·연장·승부차기 …)·출처·M0 입력 키
 *   - `sources/<날짜>.json` — **빌더 입력**(내부 형식): football-data 종료 경기(`FinishedMatch`)·순위(`BriefStandingsSource`)·
 *                            연결된 득점 목록(`MatchGoal[]` — API-Football 경기 단건 또는 M0 입력에서 옮긴 것). 외부 API 원문이 아니다
 *   - `inputs/<날짜>.json`  — **LLM에 보내는 입력** = `buildBriefInput`(M1-19 확정 빌더 — 중요도 순·연장/승부차기 키·상위 4위 순위)
 *                            → `canonicalizeBriefInput`(M1-21 — 득점자 사전 대표 표기 + 사전에 없는 팀 짧은 이름은 정식 이름 —
 *                            D46 'Deportivo'). 봇이 그날 보냈을 입력과 같은 형식이다
 *   - `runs/<라벨>/run.json` — eval:prompt 실행 기록(출력 원문·판정·토큰·비용·지연)
 * 입력 파일은 소스 + 설정(configs/competitions·names.ko·korean-players·team-ids)에서 결정적으로 다시 만든다(`buildGoldenInput`) —
 * 빌더·설정이 바뀌면 테스트가 차이를 알리고 `npm run eval:prompt -- --build-golden`으로 다시 쓴다.
 *
 * 기사 텍스트·이미지 URL·비밀값은 없다(공개 저장소 — 정형 데이터만, D23·D24).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { CompIdSchema, IsoSchema, type CompetitionConfig } from "@/lib/schema";

import {
  briefTeamRefs,
  buildBriefInput,
  type BriefInput,
  type BriefStandingsSource,
} from "./brief-input";
import type { FinishedMatch, MatchDetail, MatchGoal } from "./match-data";
import {
  canonicalizeBriefInput,
  teamFullNamesFrom,
  type NameIndex,
} from "./names";

/** 저장소 루트 기준 골든셋 폴더 */
export const GOLDEN_DIR_REL = path.join("fixtures", "llm", "golden");
/** PRD §9.2 — 브리핑 회귀 비교는 10일치 입력 */
export const GOLDEN_DAYS = 10;

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const Int = z.number().int();
const NonNegInt = Int.nonnegative();

// ─── 소스(빌더 입력 — 내부 형식) ─────────────────────────────────────────

const ScoreSchema = z.strictObject({ home: NonNegInt, away: NonNegInt });
const TeamRefSchema = z.strictObject({
  id: Int,
  name: z.string().min(1),
  fullName: z.string().min(1).nullable(),
});

/** football-data 종료 경기(match-data.ts `FinishedMatch`) */
export const GoldenResultSchema = z.strictObject({
  provider: z.literal("football-data"),
  matchId: Int.positive(),
  comp: CompIdSchema,
  kickoff: IsoSchema,
  matchday: Int.nullable(),
  stage: z.string().nullable(),
  home: TeamRefSchema,
  away: TeamRefSchema,
  score: z.strictObject({
    ft: ScoreSchema,
    ht: ScoreSchema.nullable(),
    regular: ScoreSchema.nullable(),
    pens: ScoreSchema.nullable(),
    duration: z.enum(["REGULAR", "EXTRA_TIME", "PENALTY_SHOOTOUT"]),
  }),
});

/**
 * 순위 행 — 빌더가 읽는 필드(pos·team·played·pts·gd) + 원문에 있으면 승·무·패·득점·실점. M0 입력에서 옮긴 행(M0-30이 시즌 경기
 * 목록에서 계산한 그날 순위 — 2026-09-19·09-21·10-10)은 승·무·패·득실 수가 없다.
 */
const GoldenStandingRowSchema = z.strictObject({
  pos: Int.positive(),
  team: TeamRefSchema,
  played: NonNegInt,
  pts: Int,
  gd: Int,
  w: NonNegInt.optional(),
  d: NonNegInt.optional(),
  l: NonNegInt.optional(),
  gf: NonNegInt.optional(),
  ga: NonNegInt.optional(),
});

export const GoldenStandingsSchema = z.strictObject({
  comp: CompIdSchema,
  inProgress: NonNegInt,
  tables: z
    .array(
      z.strictObject({
        stage: z.string().nullable(),
        group: z.string().nullable(),
        rows: z.array(GoldenStandingRowSchema).min(1),
      }),
    )
    .min(1),
});

const PersonRefSchema = z.strictObject({
  id: Int.nullable(),
  name: z.string().min(1),
});

/** 득점 1건(match-data.ts `MatchGoal`) */
const GoldenGoalSourceSchema = z.strictObject({
  minute: NonNegInt,
  extra: NonNegInt.nullable(),
  side: z.enum(["home", "away"]),
  kind: z.enum(["normal", "penalty", "own-goal"]),
  scorer: PersonRefSchema,
  assist: PersonRefSchema.nullable(),
});

/** football-data 경기 1건에 연결된 득점 목록 */
const GoldenLinkSchema = z.strictObject({
  /** football-data 경기 id */
  fd: Int.positive(),
  /** 출처 — API-Football 경기 단건(어댑터 `toMatchDetail`) 또는 M0 입력의 goals를 옮긴 것 */
  from: z.enum(["api-football", "m0-input"]),
  /** API-Football 경기 id(from api-football일 때) */
  af: Int.positive().nullable(),
  goals: z.array(GoldenGoalSourceSchema),
  goalsComplete: z.boolean(),
});

export const GoldenSourceSchema = z.strictObject({
  briefDate: DateSchema,
  results: z.array(GoldenResultSchema).min(1),
  standings: z.array(GoldenStandingsSchema),
  links: z.array(GoldenLinkSchema),
});
export type GoldenSource = z.infer<typeof GoldenSourceSchema>;

// ─── 입력(LLM에 보내는 정형 입력 — brief-input.ts `BriefInput`) ──────────

/** 키 순서는 brief-input.ts와 같다(파싱 결과를 다시 직렬화해도 봇이 보내는 문자열과 같게) */
const GoldenInputGoalSchema = z.strictObject({
  min: z.string().regex(/^\d{1,3}(\+\d{1,2})?$/),
  team: z.string().min(1),
  player: z.string().min(1),
  assist: z.string().min(1).optional(),
  type: z.enum(["penalty", "own_goal"]).optional(),
});
const ScoreText = z.string().regex(/^\d{1,2}-\d{1,2}$/);
const GoldenInputMatchSchema = z.strictObject({
  id: z.string().regex(/^m\d+$/),
  comp: z.string().min(1),
  round: z.string(),
  home: z.string().min(1),
  away: z.string().min(1),
  ft: ScoreText,
  ht: ScoreText.optional(),
  aet: z.literal(true).optional(),
  regular: ScoreText.optional(),
  pens: ScoreText.optional(),
  goals: z.array(GoldenInputGoalSchema).nullable(),
});
const GoldenInputStandingsSchema = z.strictObject({
  id: z.string().regex(/^s[A-Z0-9]+$/),
  comp: z.string().min(1),
  note: z.string().min(1),
  rows: z
    .array(
      z.strictObject({
        pos: Int.positive(),
        team: z.string().min(1),
        played: NonNegInt,
        pts: Int,
        gd: Int,
      }),
    )
    .min(1),
});
export const GoldenInputSchema = z.strictObject({
  briefDate: DateSchema,
  matches: z.array(GoldenInputMatchSchema).min(1),
  standings: z.array(GoldenInputStandingsSchema),
});

// ─── 목록 ───────────────────────────────────────────────────────────────

/** 날짜 태그 — 골든셋이 덮어야 할 유형(PRD §9.2·plan M1-24) */
export const GOLDEN_TAGS = [
  "busy", // 경기 15개 이상
  "light", // 경기 4개 이하
  "ucl", // UCL 경기
  "knockout", // 토너먼트 라운드(PLAYOFFS·LAST_16·…·FINAL)
  "final", // 결승(중립 경기장)
  "big-win", // 3골 차 이상
  "draw", // 무승부
  "extra-time", // 연장
  "penalties", // 승부차기
  "comeback", // 전반 또는 득점 순서로 뒤진 팀이 이김
  "goals", // 득점자 데이터가 있는 경기 포함
  "standings", // 순위표 포함
  "no-standings", // 순위표 없음
  "korean-team", // 한국 선수 소속팀 경기
] as const;
export type GoldenTag = (typeof GOLDEN_TAGS)[number];

export const GoldenDaySchema = z.strictObject({
  date: DateSchema,
  /** 한 줄 설명(사람용) */
  title: z.string().min(1),
  tags: z.array(z.enum(GOLDEN_TAGS)).min(1),
  /** M0-30·M0-34 입력 키(A~F — fixtures/llm/brief-inputs) — 그 입력의 M0 출력이 '이전' 기준선이다. 없으면 null */
  m0: z.enum(["A", "B", "C", "D", "E", "F"]).nullable(),
  /** 출처 — 결과·순위·득점이 어디서 왔는가(엔드포인트·받은 시각·변환) */
  provenance: z.strictObject({
    results: z.string().min(1),
    standings: z.string().min(1),
    goals: z.string().min(1),
  }),
});
export type GoldenDay = z.infer<typeof GoldenDaySchema>;

export const GoldenIndexSchema = z
  .strictObject({
    task: z.literal("M1-24"),
    note: z.string(),
    days: z.array(GoldenDaySchema).length(GOLDEN_DAYS),
  })
  .superRefine((index, ctx) => {
    const dates = index.days.map((d) => d.date);
    if (new Set(dates).size !== dates.length) {
      ctx.addIssue({ code: "custom", message: "날짜가 겹친다" });
    }
    const sorted = [...dates].sort();
    if (sorted.some((d, i) => d !== dates[i])) {
      ctx.addIssue({ code: "custom", message: "날짜 오름차순이어야 한다" });
    }
  });
export type GoldenIndex = z.infer<typeof GoldenIndexSchema>;

// ─── 빌드 ───────────────────────────────────────────────────────────────

/** 빌드에 쓰는 설정(collect-run.ts 브리핑 단계와 같은 재료) */
export interface GoldenBuildContext {
  competitions: readonly CompetitionConfig[];
  /** 활성 한국 선수 소속팀 football-data 팀 id(중요도 — korean-players.json → team-ids.json) */
  koreanTeamIds: ReadonlySet<number>;
  /** 고유명사 사전 색인(입력 정리 — 사전을 읽지 못하면 null: 정리 없이 빌더 출력 그대로) */
  names: NameIndex | null;
  /** 선수 slug → 소속팀 slug(names.ts playerTeamsFrom) */
  playerTeams: ReadonlyMap<string, string>;
}

/** 소스 → 순위 원천(빌더 형식) */
function toStandingsSource(
  s: GoldenSource["standings"][number],
): BriefStandingsSource {
  return { comp: s.comp, inProgress: s.inProgress, tables: s.tables };
}

/**
 * 소스 → LLM에 보내는 입력(순수 함수) — collect-run.ts 브리핑 단계와 같은 순서: `buildBriefInput` → `canonicalizeBriefInput`.
 */
export function buildGoldenInput(
  source: GoldenSource,
  ctx: GoldenBuildContext,
): BriefInput {
  const linked = new Map<number, Pick<MatchDetail, "goals" | "goalsComplete">>(
    source.links.map((l) => [
      l.fd,
      { goals: l.goals as MatchGoal[], goalsComplete: l.goalsComplete },
    ]),
  );
  const results = source.results as FinishedMatch[];
  const standings = source.standings.map(toStandingsSource);
  const built = buildBriefInput({
    briefDate: source.briefDate,
    results,
    competitions: ctx.competitions,
    standings,
    linked,
    koreanTeamIds: ctx.koreanTeamIds,
  });
  if (!ctx.names) return built.input;
  return canonicalizeBriefInput(built.input, ctx.names, {
    playerTeams: ctx.playerTeams,
    teamFullNames: teamFullNamesFrom(briefTeamRefs({ results, standings })),
  }).input;
}

/** 입력 파일 본문(사람이 읽기 쉽게 2칸 들여쓰기 + 끝 개행). 요청 user는 brief-input.ts serializeBriefInput(공백 없는 JSON) */
export function serializeGoldenInput(input: BriefInput): string {
  return `${JSON.stringify(input, null, 2)}\n`;
}

// ─── 읽기 ───────────────────────────────────────────────────────────────

export interface GoldenSetDay extends GoldenDay {
  input: BriefInput;
}

export interface GoldenSet {
  index: GoldenIndex;
  days: GoldenSetDay[];
}

async function readJsonFile(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

/** 골든셋 폴더 → 목록 + 입력(경계에서 zod). 입력 날짜가 목록과 다르면 던진다 */
export async function loadGoldenSet(goldenDir: string): Promise<GoldenSet> {
  const index = GoldenIndexSchema.parse(
    await readJsonFile(path.join(goldenDir, "index.json")),
  );
  const days: GoldenSetDay[] = [];
  for (const day of index.days) {
    const input = GoldenInputSchema.parse(
      await readJsonFile(path.join(goldenDir, "inputs", `${day.date}.json`)),
    ) as BriefInput;
    if (input.briefDate !== day.date) {
      throw new Error(
        `골든셋 입력 ${day.date}.json의 briefDate가 다르다(${input.briefDate})`,
      );
    }
    days.push({ ...day, input });
  }
  return { index, days };
}

/** 소스 파일 하나 */
export async function loadGoldenSource(
  goldenDir: string,
  date: string,
): Promise<GoldenSource> {
  const source = GoldenSourceSchema.parse(
    await readJsonFile(path.join(goldenDir, "sources", `${date}.json`)),
  );
  if (source.briefDate !== date) {
    throw new Error(
      `골든셋 소스 ${date}.json의 briefDate가 다르다(${source.briefDate})`,
    );
  }
  return source;
}

/** 입력 경기 수·대회 — 태그 확인과 리포트용(순수 함수) */
export function goldenInputStats(input: BriefInput): {
  matches: number;
  comps: string[];
  standings: number;
  withGoals: number;
  extraTime: number;
  penalties: number;
} {
  return {
    matches: input.matches.length,
    comps: [...new Set(input.matches.map((m) => m.comp))],
    standings: input.standings.length,
    withGoals: input.matches.filter((m) => m.goals !== null).length,
    extraTime: input.matches.filter((m) => m.aet === true).length,
    penalties: input.matches.filter((m) => m.pens !== undefined).length,
  };
}
