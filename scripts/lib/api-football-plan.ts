/**
 * API-Football 경기 단건 수집 계획 — 대상 선별 · 날짜 조회 순서 · 일일 호출 상한 · 상세 요청 순서 · 이월 목록 (M1-48, D27·D33).
 * I/O 없는 순수 함수 + 이월 파일(`data/cache/af-pending.json`) 읽기·쓰기. 클라이언트·변환은 providers/api-football.ts,
 * 실행(우선순위·브리핑 컷오프·시간 예산)은 api-football-stage.ts.
 *
 * 대상 경기 (D27 ②): **6개 대회 전 경기**(configs/competitions.json `apiFootballLeagueId`) ∪ **활성 한국 선수 소속팀의 다른
 * 대회 경기**(configs/korean-players.json `active` → configs/team-ids.json `af`). 대회는 이름이 아니라 league id로 거른다(다른 나라
 * 리그에 같은 이름이 있다 — fixtures `name-trap`). 한국 선수 소속팀의 **클럽 친선경기는 뺀다**(D33): league id 667
 * "Friendlies Clubs"(근거 — fixtures/football/api-football/fixtures-date-2026-10-11.json 1643234: league 667 "Friendlies Clubs" ·
 * country "World", 클럽 370 vs 371). 이름에 "friendl"이 든 대회도 방어적으로 뺀다(국가대표 친선 10·여자 666은 클럽 팀 id와 겹치지
 * 않아 원래 걸리지 않는다).
 *
 * 하루 호출 (봇 일일 계획 ≤ 60회 — CLAUDE.md §6.4): 날짜 조회 2건(D-1·D, UTC) + 상세가 필요한 대상 경기마다 단건 1건.
 * 일일 상한은 **우리 쪽 카운터**로 지킨다(헤더·`/status` 값은 일관되지 않다 — M0-29). 카운터 = 실행 기록의
 * `apiCalls.apiFootball`을 API 리셋 기준(00:00 UTC = 09:00 KST) 같은 UTC 날짜끼리 더한 값. 따로 저장하지 않는다.
 *   - prod: runs.json 합 ≤ 60(봇 계획), dev: runs-dev.json 합 ≤ 50(개발 호출 — §6.4)
 *   - 두 env가 같은 일 한도(100)를 나눠 쓰므로 prod + dev 합이 100을 넘지 않게도 묶는다. 데이터 API를 부른 실행은 mock·dry·
 *     LLM 미호출이어도 실행 기록을 남긴다(collect-run.ts `shouldRecordRun`) — 개발 호출이 카운터에서 빠지지 않게.
 *   - 실행 기록을 읽지 못하면 오늘 사용량을 모르므로 fail-closed — 이번 실행은 `API_FOOTBALL_RUNS_UNREADABLE_CAP`(10) 이하.
 *   - 실행당 상한 `API_FOOTBALL_MAX_CALLS`(환경변수, 선택) — dry·개발 실측용.
 *   - 개발(dev) 실행은 06:00~08:00 KST(봇 수집 시간대)에 부르지 않는다(`isDevQuietHours` — 분당·일 한도 공유, CLAUDE.md §6.4).
 *
 * 상세 요청 순서 (M1-44 이월 메모 — 겨울 07:10 수집 → 07:20 브리핑 마감):
 *   ① brief  — 브리핑 입력 창(전날 KST 창 = UTC 하루) 6개 대회 종료 경기 ← 브리핑 컷오프 전에 먼저
 *   ② window — 날짜 조회에 나온 그 밖의 종료 대상 경기(전날 늦은 경기·한국 선수 소속팀 기타 대회)
 *   ③ requery — 날짜 조회에 없는 이월 경기(날짜 창 밖 — id 단건 재조회)
 *   각 계층 안은 킥오프·id 순. 시간 예산·호출 상한에 걸려 받지 못한 경기는 이월 목록에 남아 다음 실행이 받는다.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  AfPendingEntrySchema,
  AfPendingFileSchema,
  type AfPendingEntry,
  type AfPendingFile,
  type CompId,
  type CompetitionConfig,
  type KoreanPlayersFile,
  type RunEnv,
  type RunLog,
  type TeamIdsFile,
} from "@/lib/schema";
import {
  isWithinKstWindow,
  kstDate,
  shiftDate,
  utcDate,
  type KstWindow,
  type UtcRange,
} from "@/lib/time";

import {
  AF_FINISHED_STATUSES,
  AF_VOID_STATUSES,
  type AfFixture,
} from "./providers/api-football";

// ─── 상수 ────────────────────────────────────────────────────────────────

/** API-Football 무료 플랜 일 한도(00:00 UTC 리셋 — M0-29) */
export const API_FOOTBALL_DAILY_LIMIT = 100;

/**
 * 일 한도 여유 — 기록되지 않는 호출(개발 `/status` 확인·실행 기록 실패 등)을 위해 일 한도에서 남겨 둔다(M2-09 — 2026-10-30 사용자 결정:
 * 봇 상한 = min(60 − 오늘 봇 사용, 100 − 오늘 prod·dev 사용 − 여유))
 */
export const API_FOOTBALL_DAILY_MARGIN = 5;

/** 봇(prod) 일일 계획 상한 — 예상 최대 약 35건(D27) */
export const API_FOOTBALL_BOT_DAILY_CAP = 60;

/** 개발(dev) 일일 상한 — 같은 일 한도를 봇과 나눠 쓴다(CLAUDE.md §6.4) */
export const API_FOOTBALL_DEV_DAILY_CAP = 50;

/**
 * 실행 기록을 읽지 못했을 때(오늘 사용량을 모를 때) 이번 실행 상한 — 날짜 조회 2 + 경기 단건 8(브리핑 경기 우선).
 * 같은 UTC 날 봇이 이미 계획 상한 60회를 썼더라도 70회로 일 한도 100 안에 든다. 손상된 runs 파일은 검증 게이트
 * (`npm run validate`)가 커밋 전에 막으므로 드문 경우다 — 그날 브리핑 득점자 일부를 잃는 쪽을 택한다.
 */
export const API_FOOTBALL_RUNS_UNREADABLE_CAP = 10;

/** 클럽 친선경기 league id — 한국 선수 소속팀 기타 대회에서 뺀다(근거는 머리 주석) */
export const CLUB_FRIENDLY_LEAGUE_IDS: readonly number[] = [667];

/**
 * 이월 항목을 버리는 킥오프 경과 시간 — 3일. 중단(INT)·일시 중지(SUSP) 경기도 보통 다음 날 안에 재개·종료되고, 일정이
 * 바뀐 경기는 새 날짜의 날짜 조회에 다시 나온다(같은 id).
 */
export const AF_PENDING_MAX_AGE_MS = 3 * 24 * 60 * 60_000;

/** 이월 항목을 버리는 재조회 횟수 — 상세를 얻지 못한 id 단건 요청(미종료·실패)이 3회면 그만 묻는다 */
export const AF_PENDING_MAX_REQUERIES = 3;

/** data/ 기준 이월 파일 경로 */
export const AF_PENDING_REL_PATH = path.join("cache", "af-pending.json");

// ─── 대상 선별 ───────────────────────────────────────────────────────────

export interface AfTargetConfig {
  /** 6개 대회 league id → 대회 ID */
  compByLeague: ReadonlyMap<number, CompId>;
  /** 활성 한국 선수 소속팀의 API-Football 팀 id */
  koreanTeamIds: ReadonlySet<number>;
  /** 한국 선수 소속팀 기타 대회에서 뺄 league id(클럽 친선) */
  excludedLeagueIds: ReadonlySet<number>;
}

export interface AfTargetBuild {
  targets: AfTargetConfig;
  /** 활성 선수의 소속팀인데 team-ids.json에 없거나 `af`가 null인 팀 slug — 그 팀의 기타 대회 경기를 고르지 못한다 */
  unmappedTeams: string[];
}

/** configs → 대상 선별 설정. team-ids 교차 검사(validate)가 막는 경우라도 실행은 계속하고 빠진 팀을 돌려준다 */
export function buildAfTargetConfig(input: {
  competitions: readonly CompetitionConfig[];
  koreanPlayers: KoreanPlayersFile;
  teamIds: TeamIdsFile;
}): AfTargetBuild {
  const compByLeague = new Map<number, CompId>(
    input.competitions.map((c) => [c.apiFootballLeagueId, c.id]),
  );
  const koreanTeamIds = new Set<number>();
  const unmapped = new Set<string>();
  for (const player of input.koreanPlayers) {
    if (!player.active) continue;
    const af = Object.hasOwn(input.teamIds, player.team)
      ? input.teamIds[player.team]?.af
      : null;
    if (af === null || af === undefined) unmapped.add(player.team);
    else koreanTeamIds.add(af);
  }
  return {
    targets: {
      compByLeague,
      koreanTeamIds,
      excludedLeagueIds: new Set(CLUB_FRIENDLY_LEAGUE_IDS),
    },
    unmappedTeams: [...unmapped].sort(),
  };
}

export type AfTargetVerdict =
  | { target: true; comp: CompId | null }
  | { target: false; reason: "non-target" | "friendly" };

/** 경기가 대상인가 — 6개 대회면 그 대회, 한국 선수 소속팀 경기면 comp null(클럽 친선 제외) */
export function classifyAfTarget(
  fixture: Pick<AfFixture, "leagueId" | "leagueName" | "home" | "away">,
  targets: AfTargetConfig,
): AfTargetVerdict {
  const comp = targets.compByLeague.get(fixture.leagueId);
  if (comp) return { target: true, comp };
  const korean =
    targets.koreanTeamIds.has(fixture.home.id) ||
    targets.koreanTeamIds.has(fixture.away.id);
  if (!korean) return { target: false, reason: "non-target" };
  if (
    targets.excludedLeagueIds.has(fixture.leagueId) ||
    /friendl/i.test(fixture.leagueName)
  ) {
    return { target: false, reason: "friendly" };
  }
  return { target: true, comp: null };
}

// ─── 날짜 조회 ───────────────────────────────────────────────────────────

/**
 * 날짜 조회 2건(UTC D-1·D — 무료 플랜 날짜 창 오늘 ±1일 안)의 순서. 브리핑 입력 창(UTC 하루)이 든 날짜를 먼저 조회한다
 * (07:00대 KST 실행이면 D, 낮 실행이면 D-1). 창이 두 날짜 밖이면 D-1 → D.
 */
export function afQueryDates(nowIso: string, briefWindow: UtcRange): string[] {
  const today = utcDate(nowIso);
  const yesterday = shiftDate(today, -1);
  const briefDate = utcDate(briefWindow.start);
  if (briefDate === today) return [today, yesterday];
  return [yesterday, today];
}

// ─── 일일 호출 상한 (우리 쪽 카운터) ─────────────────────────────────────

/** 같은 UTC 날짜(API 일 한도 리셋 00:00 UTC)에 시작한 실행의 `apiCalls.apiFootball` 합 */
export function apiFootballUsedOn(
  runs: readonly Pick<RunLog, "startedAt" | "apiCalls">[],
  nowIso: string,
): number {
  const day = utcDate(nowIso);
  return runs.reduce(
    (sum, run) =>
      utcDate(run.startedAt) === day ? sum + run.apiCalls.apiFootball : sum,
    0,
  );
}

export interface AfCallAllowance {
  /** 이 env의 일일 상한(prod 60 · dev 50) */
  cap: number;
  /** 오늘(UTC) 이 env 기록의 호출 합 */
  usedOwn: number;
  /** 오늘(UTC) prod + dev 기록의 호출 합 — 일 한도 100 대조 */
  usedTotal: number;
  /** 실행당 상한(API_FOOTBALL_MAX_CALLS) — 없으면 null */
  perRunCap: number | null;
  /** 이번 실행에 보낼 수 있는 요청 수(0 이상) */
  remaining: number;
  /** 실행 기록을 읽지 못해 오늘 사용량을 모른다(fail-closed — runs-unreadable 상한) */
  runsUnreadable: boolean;
  /** remaining을 정한 제약 */
  limitedBy: "env-cap" | "api-limit" | "per-run" | "runs-unreadable";
}

/**
 * 이번 실행의 API-Football 호출 허용량 — min(env 상한 − 오늘 env 사용, 일 한도 − 여유(5) − 오늘 전체 사용, 실행당 상한).
 * 실행 기록(runs.json·runs-dev.json)을 하나라도 읽지 못하면 오늘 사용량을 모르므로 **fail-closed**로 작은 상한
 * (`API_FOOTBALL_RUNS_UNREADABLE_CAP`)을 더 건다 — 읽은 기록만 세면 실제보다 적게 잡혀 일 한도를 넘길 수 있다.
 */
export function apiFootballCallAllowance(input: {
  env: RunEnv;
  prodRuns: readonly Pick<RunLog, "startedAt" | "apiCalls">[];
  devRuns: readonly Pick<RunLog, "startedAt" | "apiCalls">[];
  now: string;
  perRunCap?: number | null;
  /** runs 파일 중 하나라도 읽기·형식 오류였는가 */
  runsUnreadable?: boolean;
}): AfCallAllowance {
  const cap =
    input.env === "prod"
      ? API_FOOTBALL_BOT_DAILY_CAP
      : API_FOOTBALL_DEV_DAILY_CAP;
  const usedProd = apiFootballUsedOn(input.prodRuns, input.now);
  const usedDev = apiFootballUsedOn(input.devRuns, input.now);
  const usedOwn = input.env === "prod" ? usedProd : usedDev;
  const usedTotal = usedProd + usedDev;
  const perRunCap = input.perRunCap ?? null;
  const candidates: Array<[AfCallAllowance["limitedBy"], number]> = [
    ["env-cap", cap - usedOwn],
    // prod·dev 합이 일 한도 − 여유를 넘지 않게(runs.json + runs-dev.json 같은 UTC 날 합)
    [
      "api-limit",
      API_FOOTBALL_DAILY_LIMIT - API_FOOTBALL_DAILY_MARGIN - usedTotal,
    ],
  ];
  if (perRunCap !== null) candidates.push(["per-run", perRunCap]);
  const runsUnreadable = input.runsUnreadable ?? false;
  if (runsUnreadable) {
    candidates.push(["runs-unreadable", API_FOOTBALL_RUNS_UNREADABLE_CAP]);
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

/** 개발(dev) 실행이 API-Football을 부르지 않는 시간대(KST) — 봇 수집 시간대(CLAUDE.md §6.4 — 분당·일 한도 공유) */
export const API_FOOTBALL_DEV_QUIET_HOURS: Readonly<KstWindow> = Object.freeze({
  fromKst: "06:00",
  toKst: "08:00",
});

/** dev 실행 금지 시간대인가 — KST [06:00, 08:00), 계절 무관(D26: 여름·겨울 수집이 모두 이 구간 안) */
export function isDevQuietHours(nowIso: string): boolean {
  return isWithinKstWindow(
    nowIso,
    API_FOOTBALL_DEV_QUIET_HOURS,
    kstDate(nowIso),
  );
}

/** `API_FOOTBALL_MAX_CALLS` → 양의 정수(빈 값·미지정은 null). 형식이 틀리면 던진다 */
export function resolveApiFootballMaxCalls(
  raw: string | undefined,
): number | null {
  const value = raw?.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(
      `API_FOOTBALL_MAX_CALLS는 양의 정수여야 한다 (받은 값: "${value}")`,
    );
  }
  return Number(value);
}

// ─── 상세 요청 계획 ──────────────────────────────────────────────────────

export type AfTaskTier = "brief" | "window" | "requery";

/** 계층 순서 — 작을수록 먼저 */
export const AF_TIER_ORDER: Readonly<Record<AfTaskTier, number>> = {
  brief: 0,
  window: 1,
  requery: 2,
};

export interface AfFetchTask {
  id: number;
  tier: AfTaskTier;
  comp: CompId | null;
  leagueId: number;
  /** 킥오프(UTC ISO) */
  kickoff: string;
  /** 계획 시점 상태 — 날짜 조회 결과, 없으면 이월 목록의 마지막 상태 */
  status: string;
  /** 이월 목록에서 온 경기면 그 항목(firstSeen·requeries 유지) */
  pending: AfPendingEntry | null;
}

export type AfDropReason =
  /** 경기 없이 끝남(PST·CANC·ABD·AWD·WO) */
  | "void"
  /** 킥오프 후 3일 지남 */
  | "expired"
  /** 재조회 상한 */
  | "requery-limit"
  /** 이미 상세를 받은 경기(원장 — M1-48b) */
  | "known"
  /** 더는 대상이 아님(한국 선수 이적 등) */
  | "non-target";

export interface AfDropped {
  id: number;
  status: string;
  reason: AfDropReason;
}

export interface AfPlanCounts {
  /** 날짜 조회로 받은 경기 수(중복 id 제외) */
  listed: number;
  /** 대상 경기 수(6개 대회 + 한국 선수 소속팀 기타 대회) */
  targets: number;
  /** 대상 중 한국 선수 소속팀 기타 대회 */
  koreanOther: number;
  /** 대상 밖 */
  nonTarget: number;
  /** 한국 선수 소속팀 클럽 친선(제외) */
  friendly: number;
  /** 대상 중 이미 상세를 받은 경기 */
  known: number;
}

export interface AfPlan {
  /** 상세 요청(계층·킥오프·id 순) */
  tasks: AfFetchTask[];
  /** 날짜 조회에서 아직 끝나지 않은 대상 경기 — 요청 없이 이월(상태 갱신) */
  waiting: AfPendingEntry[];
  /** 이월 목록에서 뺀 경기 */
  dropped: AfDropped[];
  counts: AfPlanCounts;
}

export interface AfPlanInput {
  /** 날짜 조회로 받은 경기(성공한 날짜만) */
  fixtures: readonly AfFixture[];
  pending: readonly AfPendingEntry[];
  /** 이미 상세를 받은 경기 id — 원장 `data/matches`의 `af-<id>`(M1-48b, scripts/lib/match-ledger.ts readLedgerWindow) */
  known: ReadonlySet<number>;
  targets: AfTargetConfig;
  /** 브리핑 입력 창 — 이 안에 킥오프한 6개 대회 경기가 brief 계층 */
  briefWindow: UtcRange;
  /** 현재 시각(UTC ISO) — 새 이월 항목의 firstSeen·만료 판단 */
  now: string;
}

/** 상태 약어를 이월 파일 형식(대문자·숫자 1~6자)으로 — 모르는 형식은 "UNK" */
export function normalizeAfStatus(status: string): string {
  const s = status.trim().toUpperCase();
  return /^[A-Z0-9]{1,6}$/.test(s) ? s : "UNK";
}

/** 이월 항목이 정리 대상인가 — 킥오프 후 3일 지남 또는 재조회 상한 */
export function pendingDropReason(
  entry: Pick<AfPendingEntry, "kickoff" | "requeries">,
  nowIso: string,
): "expired" | "requery-limit" | null {
  if (Date.parse(entry.kickoff) + AF_PENDING_MAX_AGE_MS < Date.parse(nowIso)) {
    return "expired";
  }
  if (entry.requeries >= AF_PENDING_MAX_REQUERIES) return "requery-limit";
  return null;
}

function inWindow(iso: string, window: UtcRange): boolean {
  const t = Date.parse(iso);
  return t >= Date.parse(window.start) && t < Date.parse(window.end);
}

function tierOf(
  comp: CompId | null,
  kickoff: string,
  briefWindow: UtcRange,
  fallback: AfTaskTier,
): AfTaskTier {
  return comp !== null && inWindow(kickoff, briefWindow) ? "brief" : fallback;
}

const byKickoffId = (
  a: Pick<AfPendingEntry, "kickoff" | "id">,
  b: Pick<AfPendingEntry, "kickoff" | "id">,
) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id - b.id;

const byTierKickoff = (a: AfFetchTask, b: AfFetchTask) =>
  AF_TIER_ORDER[a.tier] - AF_TIER_ORDER[b.tier] ||
  Date.parse(a.kickoff) - Date.parse(b.kickoff) ||
  a.id - b.id;

/**
 * 날짜 조회 결과 + 이월 목록 → 상세 요청 순서·이월 유지·정리(순수 함수, 입력 순서와 무관하게 결정적).
 *   - 날짜 조회에 나온 대상 경기: 이미 받음(known) → 뺌 · 종료 → 요청 · 경기 없이 끝남 → 뺌 · 그 밖(미종료) → 이월 유지(상태 갱신)
 *   - 날짜 조회에 없는 이월 경기: known → 뺌 · 정리 규칙(3일·재조회 3회) → 뺌 · 그 밖 → id 재조회 요청(상태를 모른다)
 *   - brief 계층 = 6개 대회 + 킥오프가 브리핑 입력 창 안(날짜 조회가 실패해도 이월 경기로 들어올 수 있다)
 */
export function planAfFetches(input: AfPlanInput): AfPlan {
  const pendingById = new Map(input.pending.map((p) => [p.id, p] as const));
  const seen = new Set<number>();
  const tasks: AfFetchTask[] = [];
  const waiting: AfPendingEntry[] = [];
  const dropped: AfDropped[] = [];
  const counts: AfPlanCounts = {
    listed: 0,
    targets: 0,
    koreanOther: 0,
    nonTarget: 0,
    friendly: 0,
    known: 0,
  };

  for (const fixture of input.fixtures) {
    if (seen.has(fixture.matchId)) continue;
    seen.add(fixture.matchId);
    counts.listed += 1;
    const pending = pendingById.get(fixture.matchId) ?? null;
    const status = normalizeAfStatus(fixture.status);
    const verdict = classifyAfTarget(fixture, input.targets);
    if (!verdict.target) {
      counts[verdict.reason === "friendly" ? "friendly" : "nonTarget"] += 1;
      if (pending) {
        dropped.push({ id: fixture.matchId, status, reason: "non-target" });
      }
      continue;
    }
    counts.targets += 1;
    if (verdict.comp === null) counts.koreanOther += 1;
    if (input.known.has(fixture.matchId)) {
      counts.known += 1;
      if (pending)
        dropped.push({ id: fixture.matchId, status, reason: "known" });
      continue;
    }
    if (AF_FINISHED_STATUSES.has(status)) {
      tasks.push({
        id: fixture.matchId,
        tier: tierOf(
          verdict.comp,
          fixture.kickoff,
          input.briefWindow,
          "window",
        ),
        comp: verdict.comp,
        leagueId: fixture.leagueId,
        kickoff: fixture.kickoff,
        status,
        pending,
      });
      continue;
    }
    if (AF_VOID_STATUSES.has(status)) {
      if (pending)
        dropped.push({ id: fixture.matchId, status, reason: "void" });
      continue;
    }
    const entry: AfPendingEntry = {
      id: fixture.matchId,
      comp: verdict.comp,
      leagueId: fixture.leagueId,
      kickoff: fixture.kickoff,
      status,
      firstSeen: pending?.firstSeen ?? input.now,
      requeries: pending?.requeries ?? 0,
    };
    const reason = pendingDropReason(entry, input.now);
    if (reason) dropped.push({ id: entry.id, status, reason });
    else waiting.push(entry);
  }

  for (const entry of input.pending) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    if (input.known.has(entry.id)) {
      dropped.push({ id: entry.id, status: entry.status, reason: "known" });
      continue;
    }
    const reason = pendingDropReason(entry, input.now);
    if (reason) {
      dropped.push({ id: entry.id, status: entry.status, reason });
      continue;
    }
    tasks.push({
      id: entry.id,
      tier: tierOf(entry.comp, entry.kickoff, input.briefWindow, "requery"),
      comp: entry.comp,
      leagueId: entry.leagueId,
      kickoff: entry.kickoff,
      status: entry.status,
      pending: entry,
    });
  }

  tasks.sort(byTierKickoff);
  waiting.sort(byKickoffId);
  dropped.sort((a, b) => a.id - b.id);
  return { tasks, waiting, dropped, counts };
}

// ─── 이월 목록 갱신 ──────────────────────────────────────────────────────

/** 상세 요청 1건의 결과 */
export type AfTaskResult =
  /** 종료 경기 상세를 받았다 → 이월에서 빠진다 */
  | { kind: "fetched" }
  /** 아직 끝나지 않았다 → 이월(재조회 +1) */
  | { kind: "unfinished"; status: string; kickoff: string }
  /** 경기 없이 끝났다(PST·CANC …) → 빠진다 */
  | { kind: "void"; status: string }
  /** 응답에 경기가 없다(0건) → 이월(재조회 +1) */
  | { kind: "missing" }
  /** 요청 실패·형식 오류 → 이월(재조회 +1) */
  | { kind: "failed"; errorType: string }
  /** 보내지 못했다(시간 예산·호출 상한·단계 멈춤) → 그대로 이월 */
  | { kind: "deferred" };

export interface AfTaskOutcome {
  task: AfFetchTask;
  result: AfTaskResult;
}

export interface AfPendingUpdate {
  /** 다음 실행에 넘길 이월 목록(킥오프·id 순) */
  fixtures: AfPendingEntry[];
  /** 이번 실행에서 뺀 경기(계획 단계 + 요청 결과 + 정리) */
  dropped: AfDropped[];
}

/**
 * 계획 + 요청 결과 → 다음 이월 목록(순수 함수). 미종료·실패·형식 오류·0건은 재조회 +1, 보내지 못한 요청은 그대로,
 * 상세를 받았거나 경기 없이 끝났으면 뺀다. 마지막에 정리 규칙(3일·재조회 3회)을 다시 적용한다.
 */
export function nextAfPending(input: {
  plan: Pick<AfPlan, "waiting" | "dropped">;
  outcomes: readonly AfTaskOutcome[];
  now: string;
}): AfPendingUpdate {
  const dropped: AfDropped[] = [...input.plan.dropped];
  const next: AfPendingEntry[] = [...input.plan.waiting];
  for (const { task, result } of input.outcomes) {
    const base: AfPendingEntry = task.pending ?? {
      id: task.id,
      comp: task.comp,
      leagueId: task.leagueId,
      kickoff: task.kickoff,
      status: task.status,
      firstSeen: input.now,
      requeries: 0,
    };
    switch (result.kind) {
      case "fetched":
        continue;
      case "void":
        dropped.push({
          id: task.id,
          status: normalizeAfStatus(result.status),
          reason: "void",
        });
        continue;
      case "unfinished":
        next.push({
          ...base,
          status: normalizeAfStatus(result.status),
          kickoff: result.kickoff,
          requeries: base.requeries + 1,
        });
        continue;
      case "missing":
      case "failed":
        next.push({ ...base, requeries: base.requeries + 1 });
        continue;
      case "deferred":
        next.push(base);
        continue;
    }
  }
  const kept: AfPendingEntry[] = [];
  const ids = new Set<number>();
  for (const entry of next.sort(byKickoffId)) {
    if (ids.has(entry.id)) continue;
    ids.add(entry.id);
    const reason = pendingDropReason(entry, input.now);
    if (reason) dropped.push({ id: entry.id, status: entry.status, reason });
    else kept.push(entry);
  }
  return { fixtures: kept, dropped: dropped.sort((a, b) => a.id - b.id) };
}

/**
 * 받은 경기를 원장 사정으로 이월 목록에 다시 넣는다(순수 함수, M1-48b). 정리 규칙(3일·재조회 3회)을 다시 적용한다.
 *   - `ids` — 상세는 받았지만 원장에 넣지 못한 경기(달·메타 읽기·쓰기 실패·형식 오류): 재조회 +1(실패와 같은 취급 — 같은 원인이
 *     계속되면 정리 규칙으로 빠진다).
 *   - `incomplete` — 원장에 들어갔지만 불완전한 경기(득점 불완전·라인업 없음 — match-ledger.ts `isIncompleteLedgerMatch`): 이월
 *     목록에서 온 요청이면 재조회 +1, 처음 받은 경기면 0부터(처음 받기는 재조회가 아니다). 이월 목록에 있는 동안 원장의 "이미 받음"
 *     에서 빠져 다시 받고(`ledgerPlanKnown`), 정리 규칙으로 빠지면 그대로 확정된다.
 */
export function requeueAfPending(input: {
  pending: readonly AfPendingEntry[];
  outcomes: readonly AfTaskOutcome[];
  ids: ReadonlySet<number>;
  incomplete?: ReadonlySet<number>;
  now: string;
}): AfPendingUpdate {
  const next = [...input.pending];
  for (const { task, result } of input.outcomes) {
    if (result.kind !== "fetched") continue;
    const unstored = input.ids.has(task.id);
    if (!unstored && !input.incomplete?.has(task.id)) continue;
    const base: AfPendingEntry = task.pending ?? {
      id: task.id,
      comp: task.comp,
      leagueId: task.leagueId,
      kickoff: task.kickoff,
      status: task.status,
      firstSeen: input.now,
      requeries: 0,
    };
    const requeries =
      unstored || task.pending !== null ? base.requeries + 1 : base.requeries;
    next.push({ ...base, requeries });
  }
  const kept: AfPendingEntry[] = [];
  const dropped: AfDropped[] = [];
  const ids = new Set<number>();
  for (const entry of next.sort(byKickoffId)) {
    if (ids.has(entry.id)) continue;
    ids.add(entry.id);
    const reason = pendingDropReason(entry, input.now);
    if (reason) dropped.push({ id: entry.id, status: entry.status, reason });
    else kept.push(entry);
  }
  return { fixtures: kept, dropped: dropped.sort((a, b) => a.id - b.id) };
}

// ─── 이월 파일 ───────────────────────────────────────────────────────────

export function afPendingPath(dataDir: string): string {
  return path.join(dataDir, AF_PENDING_REL_PATH);
}

export interface AfPendingRead {
  fixtures: AfPendingEntry[];
  /** 파일이 있었는가 */
  exists: boolean;
  /** 읽기·형식 오류 — 있으면 빈 목록으로 진행한다(수집을 멈추지 않음, 다음 쓰기가 새 파일로 고친다) */
  error: string | null;
}

/** `data/cache/af-pending.json` 읽기 — 없으면 빈 목록, 형식 오류도 던지지 않고 오류와 빈 목록 */
export async function readAfPending(dataDir: string): Promise<AfPendingRead> {
  let text: string;
  try {
    text = await readFile(afPendingPath(dataDir), "utf8");
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === "ENOENT") return { fixtures: [], exists: false, error: null };
    return {
      fixtures: [],
      exists: false,
      error: `읽기 실패: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { fixtures: [], exists: true, error: "JSON 파싱 실패" };
  }
  const parsed = AfPendingFileSchema.safeParse(json);
  if (!parsed.success) {
    return {
      fixtures: [],
      exists: true,
      error: `스키마 검증 실패(${parsed.error.issues.length}건)`,
    };
  }
  return { fixtures: parsed.data.fixtures, exists: true, error: null };
}

/** 이월 파일 내용(검증) */
export function buildAfPendingFile(
  fixtures: readonly AfPendingEntry[],
  updatedAt: string,
): AfPendingFile {
  return AfPendingFileSchema.parse({
    updatedAt,
    fixtures: fixtures.map((f) => AfPendingEntrySchema.parse(f)),
  });
}

/** 2칸 들여쓰기 + 끝 개행 */
export function serializeAfPending(file: AfPendingFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** 이월 목록이 같은가(updatedAt 제외) — 같으면 파일을 다시 쓰지 않는다(불필요한 data 커밋 방지) */
export function sameAfPending(
  a: readonly AfPendingEntry[],
  b: readonly AfPendingEntry[],
): boolean {
  const key = (e: AfPendingEntry) =>
    [
      e.id,
      e.comp,
      e.leagueId,
      Date.parse(e.kickoff),
      e.status,
      Date.parse(e.firstSeen),
      e.requeries,
    ].join("|");
  return a.length === b.length && a.every((e, i) => key(e) === key(b[i]!));
}

/** 임시 파일에 쓴 뒤 rename(반쯤 쓴 파일이 남지 않게) */
export async function writeAfPending(
  dataDir: string,
  file: AfPendingFile,
): Promise<string> {
  const target = afPendingPath(dataDir);
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, serializeAfPending(file), "utf8");
    await rename(tmp, target);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
  return target;
}
