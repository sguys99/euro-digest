/**
 * Highlightly 경기 상세 수집 계획 — 대상 선별 · 날짜 조회 · 일일 호출 상한 · 이월 파일 (PRD §15 D80, plan M5-18).
 * I/O 없는 순수 함수 + 이월 파일(`data/cache/hl-pending.json`) 경로. 상세 요청 계획·이월 규칙(계층 brief/window/requery, 3일·재조회
 * 3회 정리)은 API-Football과 같아서 scripts/lib/api-football-plan.ts의 순수 함수(`planAfFetches`·`nextAfPending`·`requeueAfPending`)를
 * 그대로 쓴다 — Highlightly 목록 항목은 어댑터(providers/highlightly.ts `toHlFixture`)가 같은 모양(상태 약어 포함)으로 바꾼다.
 * 이월 파일 형식도 같다(src/lib/schema/cache.ts — 경기 id 체계가 달라 파일만 나눈다).
 *
 * 대상 경기 (D27 ② 그대로): 6개 대회 전 경기(configs/competitions.json `highlightlyLeagueId`) ∪ 활성 한국 선수 소속팀의 다른 대회
 * 경기(configs/korean-players.json `active` → configs/team-ids.json `hl`, 클럽 친선 제외 — 대회 이름에 "friendl"). 한국 선수가 뛴
 * 팀의 경기(소속팀이 낀 경기)만 박스스코어(출전 시간)를 더 부른다(D80 ③).
 *
 * 날짜 조회 (API-Football과 다른 점): Highlightly는 대회 필터 없이 날짜 전체를 받으면 쪽 수가 많아 **대회마다** 조회한다(날짜 1개 =
 * 6요청). 그래서 날짜는 **브리핑 입력 창의 UTC 날짜 하나**만 조회하고(07:00대 KST 실행이면 오늘 UTC), 전날은 원장 메타에 그 날짜의
 * 공백(date-query·skipped·degraded — 첫 기회 실패)이 남아 있을 때만 더 조회한다(`hlQueryDates`). 앞 실행에서 끝나지 않았던 경기는
 * 이월 목록(id 재조회 — 지난 날짜도 열린다)이 받으므로 API-Football처럼 매일 D-1을 다시 조회할 필요가 없다.
 *
 * 하루 호출 (D80 ③ — 날짜 조회 6 + 경기마다 상세·라인업 2 + 한국 선수 경기만 박스스코어 1 → 하루 최대 약 65회): 일일 상한은 **우리 쪽
 * 카운터**(runs.json·runs-dev.json `apiCalls.highlightly`의 같은 UTC 날 합 — 일 리셋 시각이 문서에 없어 API-Football과 같은 UTC 날을
 * 쓴다)로 지키고, 응답 헤더 `x-ratelimit-requests-remaining`이 0이면 클라이언트가 멈춘다(어긋날 때의 방어선).
 *   - prod: 봇 상한 65(D80 ③) · dev: 일 한도 − 여유 − 봇 몫(65)을 넘지 않게 30 — 봇은 다음 아침(같은 UTC 날 저녁)에 돈다
 *   - prod + dev 합이 일 한도 − 여유(5)를 넘지 않게도 묶는다 · 기록을 읽지 못하면 fail-closed 10
 *   - 개발 실행은 봇 수집 시간대(06:00~08:00 KST)에 부르지 않는다(api-football-plan.ts `isDevQuietHours` — 같은 규칙)
 */
import path from "node:path";

import type {
  CompId,
  CompetitionConfig,
  KoreanPlayersFile,
  MatchLedgerMeta,
  RunEnv,
  RunLog,
  TeamIdsFile,
} from "@/lib/schema";
import { shiftDate, utcDate, type UtcRange } from "@/lib/time";

import type { AfCallAllowance, AfTargetBuild } from "./api-football-plan";
import { teamIdOfSlug } from "./detail-provider";

// ─── 상수 ────────────────────────────────────────────────────────────────

/** Highlightly 무료 플랜(Basic) 일 한도 — 응답 헤더 x-ratelimit-requests-limit 100(2026-11-17 실측) */
export const HIGHLIGHTLY_DAILY_LIMIT = 100;

/** 일 한도 여유 — 기록되지 않는 호출(수동 실측·실행 기록 실패 등) 몫 */
export const HIGHLIGHTLY_DAILY_MARGIN = 5;

/** 봇(prod) 일일 상한 — D80 ③ "하루 최대 약 65회" */
export const HIGHLIGHTLY_BOT_DAILY_CAP = 65;

/** 개발(dev) 일일 상한 — 일 한도 − 여유 − 봇 몫(같은 UTC 날을 봇과 나눠 쓴다) */
export const HIGHLIGHTLY_DEV_DAILY_CAP =
  HIGHLIGHTLY_DAILY_LIMIT -
  HIGHLIGHTLY_DAILY_MARGIN -
  HIGHLIGHTLY_BOT_DAILY_CAP;

/** 실행 기록을 읽지 못했을 때 이번 실행 상한 — 날짜 조회 6 + 브리핑 경기 몇 건(API-Football과 같은 fail-closed 취지) */
export const HIGHLIGHTLY_RUNS_UNREADABLE_CAP = 10;

/** data/ 기준 이월 파일 경로(api-football-plan.ts `PENDING_REL_PATHS`와 같은 값 — 읽기·쓰기는 그 파일의 함수에 provider를 넘긴다) */
export const HL_PENDING_REL_PATH = path.join("cache", "hl-pending.json");

/**
 * 클럽 친선 대회 Highlightly league id — 한국 선수 소속팀 기타 대회에서 뺀다(근거 — fixtures/highlightly/last-five-games-155666.json:
 * 1404095469 "Friendlies Clubs" 568401, 볼프스부르크–우니온 2026-11-12). 이름 규칙(/friendl/i)도 함께 본다(classifyAfTarget).
 */
export const HL_CLUB_FRIENDLY_LEAGUE_IDS: readonly number[] = [568401];

/** 탐색(최근 5경기)으로 고를 한국 선수 소속팀 기타 대회 경기의 킥오프 범위 — 지금 앞 3일(이월 정리 기준과 같은 길이) */
export const HL_DISCOVER_LOOKBACK_MS = 3 * 24 * 60 * 60_000;

// ─── 대상 선별 ───────────────────────────────────────────────────────────

/** 날짜 조회 대상 대회 — Highlightly league id가 있는 것만 */
export interface HlLeague {
  comp: CompId;
  leagueId: number;
}

export interface HlTargetBuild extends AfTargetBuild {
  /** 날짜 조회할 대회(설정 순서) */
  leagues: HlLeague[];
  /** highlightlyLeagueId가 없어 날짜 조회를 하지 못하는 대회 */
  leaguesMissing: CompId[];
}

/**
 * configs → 대상 선별 설정(Highlightly id 체계). 활성 선수 소속팀인데 team-ids `hl`이 없으면 `unmappedTeams`(그 팀의 기타 대회
 * 경기를 고르지 못하고 박스스코어를 부르지 않는다 — 실행은 계속).
 */
export function buildHlTargetConfig(input: {
  competitions: readonly CompetitionConfig[];
  koreanPlayers: KoreanPlayersFile;
  teamIds: TeamIdsFile;
}): HlTargetBuild {
  const leagues: HlLeague[] = [];
  const leaguesMissing: CompId[] = [];
  for (const c of input.competitions) {
    if (c.highlightlyLeagueId === undefined) leaguesMissing.push(c.id);
    else leagues.push({ comp: c.id, leagueId: c.highlightlyLeagueId });
  }
  const koreanTeamIds = new Set<number>();
  const unmapped = new Set<string>();
  for (const player of input.koreanPlayers) {
    if (!player.active) continue;
    const hl = teamIdOfSlug(input.teamIds, player.team, "highlightly");
    if (hl === null) unmapped.add(player.team);
    else koreanTeamIds.add(hl);
  }
  return {
    targets: {
      compByLeague: new Map(leagues.map((l) => [l.leagueId, l.comp])),
      koreanTeamIds,
      // 클럽 친선(실측 id) + 이름 규칙(/friendl/i, classifyAfTarget)
      excludedLeagueIds: new Set(HL_CLUB_FRIENDLY_LEAGUE_IDS),
    },
    unmappedTeams: [...unmapped].sort(),
    leagues,
    leaguesMissing,
  };
}

/** 이 경기가 한국 선수 소속팀 경기인가(박스스코어를 부른다 — D80 ③) */
export function isKoreanTeamMatch(
  match: { home: { id: number }; away: { id: number } },
  koreanTeamIds: ReadonlySet<number>,
): boolean {
  return koreanTeamIds.has(match.home.id) || koreanTeamIds.has(match.away.id);
}

// ─── 날짜 조회 ───────────────────────────────────────────────────────────

/** 날짜 조회를 다시 해야 하는 원장 공백 사유 — 그 날짜 목록을 받지 못했다 */
const RELIST_GAP_REASONS: ReadonlySet<string> = new Set([
  "date-query",
  "degraded",
  "skipped",
]);

/**
 * 날짜 조회 순서(머리 주석) — 브리핑 입력 창의 UTC 날짜, 그리고 그 전날이 원장 메타에 날짜 단위 공백으로 남아 있으면 그 날짜도
 * (공백을 메운다 — 받으면 nextLedgerMeta가 지운다). 메타를 모르면 브리핑 날짜만.
 */
export function hlQueryDates(input: {
  briefWindow: UtcRange;
  meta: Pick<MatchLedgerMeta, "since" | "gaps"> | null;
}): string[] {
  const briefDate = utcDate(input.briefWindow.start);
  const previous = shiftDate(briefDate, -1);
  const dates = [briefDate];
  const gap = input.meta?.gaps.some(
    (g) => g.date === previous && RELIST_GAP_REASONS.has(g.reason),
  );
  if (gap && input.meta !== null && previous >= input.meta.since) {
    dates.push(previous);
  }
  return dates;
}

/** 백필 날짜 범위(UTC, 양 끝 포함) → 날짜 목록. 형식이 틀리거나 순서가 거꾸로면 던진다 */
export function hlDateRange(from: string, to: string): string[] {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from) || !re.test(to)) {
    throw new Error(`날짜는 YYYY-MM-DD (받은 값: ${from} · ${to})`);
  }
  if (from > to) throw new Error(`시작(${from})이 끝(${to})보다 늦다`);
  const dates: string[] = [];
  for (let d = from; d <= to; d = shiftDate(d, 1)) {
    dates.push(d);
    if (dates.length > 62) throw new Error("백필 범위는 62일 이내");
  }
  return dates;
}

// ─── 일일 호출 상한 (우리 쪽 카운터) ─────────────────────────────────────

/** 같은 UTC 날짜에 시작한 실행의 `apiCalls.highlightly` 합(없음 = 0) */
export function highlightlyUsedOn(
  runs: readonly Pick<RunLog, "startedAt" | "apiCalls">[],
  nowIso: string,
): number {
  const day = utcDate(nowIso);
  return runs.reduce(
    (sum, run) =>
      utcDate(run.startedAt) === day
        ? sum + (run.apiCalls.highlightly ?? 0)
        : sum,
    0,
  );
}

/**
 * 이번 실행의 Highlightly 호출 허용량 — min(env 상한 − 오늘 env 사용, 일 한도 − 여유 − 오늘 전체 사용, 실행당 상한), 기록을 읽지
 * 못하면 fail-closed 10(api-football-plan.ts `apiFootballCallAllowance`와 같은 규칙 · 같은 결과 형식).
 */
export function highlightlyCallAllowance(input: {
  env: RunEnv;
  prodRuns: readonly Pick<RunLog, "startedAt" | "apiCalls">[];
  devRuns: readonly Pick<RunLog, "startedAt" | "apiCalls">[];
  now: string;
  perRunCap?: number | null;
  runsUnreadable?: boolean;
}): AfCallAllowance {
  const cap =
    input.env === "prod"
      ? HIGHLIGHTLY_BOT_DAILY_CAP
      : HIGHLIGHTLY_DEV_DAILY_CAP;
  const usedProd = highlightlyUsedOn(input.prodRuns, input.now);
  const usedDev = highlightlyUsedOn(input.devRuns, input.now);
  const usedOwn = input.env === "prod" ? usedProd : usedDev;
  const usedTotal = usedProd + usedDev;
  const perRunCap = input.perRunCap ?? null;
  const candidates: Array<[AfCallAllowance["limitedBy"], number]> = [
    ["env-cap", cap - usedOwn],
    [
      "api-limit",
      HIGHLIGHTLY_DAILY_LIMIT - HIGHLIGHTLY_DAILY_MARGIN - usedTotal,
    ],
  ];
  if (perRunCap !== null) candidates.push(["per-run", perRunCap]);
  const runsUnreadable = input.runsUnreadable ?? false;
  if (runsUnreadable) {
    candidates.push(["runs-unreadable", HIGHLIGHTLY_RUNS_UNREADABLE_CAP]);
  }
  const [limitedBy, value] = candidates.reduce((min, c) =>
    c[1] < min[1] ? c : min,
  );
  return {
    cap,
    usedOwn,
    usedTotal,
    perRunCap,
    runsUnreadable,
    remaining: Math.max(0, value),
    limitedBy,
  };
}

/** `HIGHLIGHTLY_MAX_CALLS` → 양의 정수(빈 값·미지정은 null). 형식이 틀리면 던진다 */
export function resolveHighlightlyMaxCalls(
  raw: string | undefined,
): number | null {
  const value = raw?.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(
      `HIGHLIGHTLY_MAX_CALLS는 양의 정수여야 한다 (받은 값: "${value}")`,
    );
  }
  return Number(value);
}
