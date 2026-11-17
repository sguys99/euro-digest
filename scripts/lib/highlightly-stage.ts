/**
 * Highlightly 경기 상세 단계 실행 — 날짜 조회(대회별) → 계획 → 상세 요청(브리핑 우선) → 한국 선수 소속팀 기타 대회 탐색 → 이월 목록
 * (PRD §15 D80, plan M5-18). API-Football 단계(api-football-stage.ts)와 **같은 결과 형식**(`AfStageResult`)을 돌려줘 원장·브리핑 보충·
 * 팀시트·실행 기록·이슈 경로(collect-run.ts)가 프로바이더를 가리지 않게 한다. 클라이언트는 주입한다(테스트는 가짜 fetch·시계).
 *
 * 요청 (경기 1건 = 상세 + 라인업, 한국 선수 소속팀 경기만 박스스코어 1건 더 — D80 ③)
 *   ① 날짜 조회 — 날짜 × 대회(`/matches?date=&leagueId=` — 대회 필터 없는 날짜 전체는 쪽 수가 많다). 한 대회의 실패는 그 날짜를
 *      실패로 남기지만(원장 공백 date-query) 다른 대회 조회는 계속한다(멈춤 오류는 예외).
 *   ② 계획 — api-football-plan.ts `planAfFetches` 그대로(brief → window → requery, 이미 받은 경기·경기 없이 끝난 경기 제외, 미종료 이월).
 *   ③ 브리핑 몫(brief 계층) — **상세(득점) + 한국 선수 경기 박스스코어(출전)만 먼저** 받고 `onBriefReady`로 넘긴다. 브리핑 입력은
 *      득점자·한국 선수 출전만 쓰므로 라인업(포메이션)은 컷오프 뒤로 미뤄 컷오프 전 요청을 줄인다. 신호 시점은 API-Football 단계와 같다
 *      (brief 계층 완료 · 다음 요청이 컷오프 안에 끝나지 않음 · 단계 멈춤/끝).
 *   ④ 브리핑 경기 라인업 → window·requery 경기(상세 → 박스스코어 → 라인업)
 *   ⑤ 탐색 — 날짜 조회에 나오지 않은 활성 한국 선수 소속팀마다 `/last-five-games`(1건)로 6개 대회 밖 종료 경기(컵·UEL 등, 킥오프 3일
 *      안, 친선 제외)를 찾아 ④처럼 받는다. 근거(호출 수 비교): 팀 id 필터 날짜 조회는 팀마다 홈·원정 2건, 날짜 전체 조회는 쪽 수
 *      미상(수백 경기)인데, 최근 5경기는 팀당 1건이고 며칠 지나 다시 봐도 걸린다(상한에 밀린 날도 다음 실행이 메운다). 우선순위는
 *      가장 낮다(남은 몫 안에서만).
 *   받지 못한 부분(라인업·박스스코어)이 있어도 상세가 종료면 "받음"이다 — 원장은 그 경기를 불완전 항목(포메이션 없음·출전 unknown)으로
 *   넣고 이월 목록에 올려 다시 받는다(match-ledger.ts `isIncompleteLedgerMatch`, collect-run.ts 원장 단계).
 *
 * 멈춤(남은 요청을 보내지 않음): plan(목록 plan.message 제한 — FR-65 강등, 이슈)·일 한도(quota)·키 오류(auth)·429 연속 2회·우리 쪽
 * 호출 상한(cap)·시간 예산(budget)·취소(cancelled), 연속 실패 3회(breaker). 받지 못한 경기는 이월.
 */
import type { AfPendingEntry, CompId } from "@/lib/schema";
import type { UtcRange } from "@/lib/time";

import {
  classifyAfTarget,
  nextAfPending,
  planAfFetches,
  type AfFetchTask,
  type AfTargetConfig,
  type AfTaskOutcome,
  type AfTaskTier,
} from "./api-football-plan";
import type {
  AfBriefSnapshot,
  AfDateResult,
  AfIssueEvent,
  AfStageResult,
} from "./api-football-stage";
import type { IssuePayloadInput } from "./github-issues";
import {
  HL_DISCOVER_LOOKBACK_MS,
  isKoreanTeamMatch,
  type HlLeague,
} from "./highlightly-plan";
import type { MatchDetail } from "./match-data";
import {
  AF_FINISHED_STATUSES,
  AF_VOID_STATUSES,
  type AfFixture,
} from "./providers/api-football";
import {
  HIGHLIGHTLY_MIN_INTERVAL_MS,
  HIGHLIGHTLY_TIMEOUT_MS,
  HighlightlyError,
  hlFixtureToPairing,
  isHighlightlyStageStoppingError,
  toHlFixture,
  toHlMatchDetail,
  type HighlightlyClient,
  type HighlightlyErrorKind,
} from "./providers/highlightly";
import type { PairingMatch } from "./team-ids";

/** 연속 요청 실패 차단기 */
export const HIGHLIGHTLY_BREAKER_FAILURES = 3;

export interface HlStageInput {
  client: Pick<
    HighlightlyClient,
    "listMatches" | "lastFiveGames" | "getMatch" | "getLineups" | "getBoxScore"
  >;
  targets: AfTargetConfig;
  /** 날짜 조회할 대회(highlightlyLeagueId가 있는 것) */
  leagues: readonly HlLeague[];
  pending: readonly AfPendingEntry[];
  /** 이미 상세를 받은 경기 id(원장 `hl-<id>` — ledgerPlanKnown) */
  known: ReadonlySet<number>;
  /** 원장의 다른 프로바이더(af-) 항목과 같은 경기인가 — 같은 경기를 두 키로 넣지 않는다(없으면 검사하지 않음) */
  isDuplicate?: (fixture: AfFixture) => boolean;
  briefWindow: UtcRange;
  /** 날짜 조회할 UTC 날짜(highlightly-plan.ts `hlQueryDates` — 백필은 범위) */
  dates: readonly string[];
  now: () => Date;
  clock: () => number;
  briefCutoffAt: number | null;
  /** 요청 1회가 차지할 수 있는 최대 시간(간격 + 타임아웃) — 기본 3초 + 15초 */
  requestSlotMs?: number;
  breakerFailures?: number;
  /** 한국 선수 소속팀 기타 대회 탐색(최근 5경기) — 기본 true */
  discover?: boolean;
  /** 한국 선수 소속팀 경기만 받는다(백필 — 기본 false). 이월 목록은 거르지 않는다(백필은 빈 목록을 넘긴다) */
  koreanOnly?: boolean;
  /**
   * 날짜 × 대회 조회 대신 팀 시즌 목록(`/matches?season=&homeTeamId=` · `awayTeamId=` — 팀마다 2건, 모든 대회)으로 경기를 찾는다(백필 —
   * scripts/backfill-matches.ts). 킥오프 UTC 날짜가 `dates` 안인 경기만 쓴다. 날짜 13일 × 6개 대회(78건)보다 한국 선수 소속 9팀 × 2(18건)가
   * 싸고 컵·UEL 경기도 함께 나온다. 날짜 결과(`dates`)는 모든 팀 목록이 성공했을 때만 ok
   */
  teamSeason?: { season: number; teamIds: readonly number[] };
  /** 라인업(포메이션·팀시트)을 받지 않는다 — 출전은 박스스코어로 충분한 백필의 호출 절약(기본 false) */
  skipLineups?: boolean;
  onBriefReady?: (snapshot: AfBriefSnapshot) => void;
}

function errorTypeOf(error: unknown): HighlightlyErrorKind | "unexpected" {
  return error instanceof HighlightlyError ? error.kind : "unexpected";
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "")
    : String(error);
}

const byKickoffId = (a: MatchDetail, b: MatchDetail) =>
  Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.matchId - b.matchId;

function issueOf(
  error: unknown,
  endpoint: AfIssueEvent["endpoint"],
): AfIssueEvent | null {
  if (!(error instanceof HighlightlyError)) return null;
  const message = errorText(error);
  switch (error.kind) {
    case "plan":
    case "quota":
    case "auth":
    case "api":
      return { kind: error.kind, endpoint, message };
    case "rate":
      return isHighlightlyStageStoppingError(error)
        ? { kind: "rate", endpoint, message }
        : null;
    default:
      return null;
  }
}

/** 받은 원문(경기 1건) */
interface Fetched {
  task: AfFetchTask;
  match: unknown;
  lineups: unknown;
  box: unknown[] | null;
  korean: boolean;
}

/**
 * Highlightly 단계(머리 주석 순서). 던지지 않는다 — 요청 실패는 결과에 담는다(예상 밖 예외만 호출부의 isolateProvider가 잡는다).
 */
export async function runHighlightlyStage(
  input: HlStageInput,
): Promise<AfStageResult> {
  const nowIso = () => input.now().toISOString();
  const slot =
    input.requestSlotMs ?? HIGHLIGHTLY_MIN_INTERVAL_MS + HIGHLIGHTLY_TIMEOUT_MS;
  const breakerAt = input.breakerFailures ?? HIGHLIGHTLY_BREAKER_FAILURES;
  const koreanTeamIds = input.targets.koreanTeamIds;
  const state: {
    stoppedBy: AfStageResult["stoppedBy"];
    degraded: AfIssueEvent | null;
    brief: AfBriefSnapshot | null;
    failures: number;
  } = { stoppedBy: null, degraded: null, brief: null, failures: 0 };
  const issues: AfIssueEvent[] = [];

  const noteError = (error: unknown, endpoint: AfIssueEvent["endpoint"]) => {
    const issue = issueOf(error, endpoint);
    if (issue) {
      issues.push(issue);
      if (issue.kind === "plan" && state.degraded === null) {
        state.degraded = issue;
      }
    }
    if (
      error instanceof HighlightlyError &&
      isHighlightlyStageStoppingError(error)
    ) {
      state.stoppedBy ??= error.kind;
    }
  };

  // ① 날짜 조회 — 날짜 × 대회(백필은 팀 시즌 목록)
  const dates: AfDateResult[] = [];
  const fixtures: AfFixture[] = [];
  if (input.teamSeason) {
    const wanted = new Set(input.dates);
    const failure: { errorType?: AfDateResult["errorType"]; error?: string } =
      {};
    let invalid = 0;
    const seen = new Set<number>();
    for (const teamId of input.teamSeason.teamIds) {
      for (const side of ["homeTeamId", "awayTeamId"] as const) {
        if (state.stoppedBy !== null) {
          failure.errorType ??=
            state.stoppedBy === "breaker" ? "unexpected" : state.stoppedBy;
          failure.error ??= "단계가 멈춰 요청하지 않음";
          break;
        }
        try {
          const raw = await input.client.listMatches({
            season: input.teamSeason.season,
            [side]: teamId,
          });
          for (const item of raw) {
            const fixture = toHlFixture(item);
            if (fixture === null) {
              invalid += 1;
              continue;
            }
            if (!wanted.has(fixture.kickoff.slice(0, 10))) continue;
            if (seen.has(fixture.matchId)) continue;
            seen.add(fixture.matchId);
            fixtures.push(fixture);
          }
        } catch (error) {
          noteError(error, "date");
          failure.errorType ??= errorTypeOf(error);
          failure.error ??= `team ${teamId}: ${errorText(error)}`;
        }
      }
    }
    for (const date of input.dates) {
      dates.push({
        date,
        ok: failure.errorType === undefined,
        listed: fixtures.filter((f) => f.kickoff.slice(0, 10) === date).length,
        invalid: 0,
        ...failure,
      });
    }
    if (dates[0]) dates[0].invalid = invalid;
  }
  for (const date of input.teamSeason ? [] : input.dates) {
    const result: AfDateResult = { date, ok: true, listed: 0, invalid: 0 };
    if (input.leagues.length === 0) {
      result.ok = false;
      result.errorType = "unexpected";
      result.error = "날짜 조회 대상 대회 없음(highlightlyLeagueId)";
    }
    for (const league of input.leagues) {
      const stopped = state.stoppedBy;
      if (stopped !== null) {
        result.ok = false;
        result.errorType ??= stopped === "breaker" ? "unexpected" : stopped;
        result.error ??= "단계가 멈춰 요청하지 않음";
        break;
      }
      // 목록 조회만으로 브리핑 컷오프를 넘기면 득점자 없이 브리핑을 먼저 보낸다(FR-65 · D28 — 상세 지연이 AI 브리핑을 막지 않게).
      // 목록은 계속 받는다(원장·이월 몫, 단계 예산 안).
      if (
        !state.brief &&
        input.briefCutoffAt !== null &&
        input.clock() + slot > input.briefCutoffAt
      ) {
        state.brief = {
          reason: "cutoff",
          details: [],
          missing: [],
          listed: [],
        };
        input.onBriefReady?.(state.brief);
      }
      try {
        const raw = await input.client.listMatches({
          date,
          leagueId: league.leagueId,
        });
        result.listed += raw.length;
        for (const item of raw) {
          const fixture = toHlFixture(item);
          if (fixture) fixtures.push(fixture);
          else result.invalid += 1;
        }
      } catch (error) {
        noteError(error, "date");
        result.ok = false;
        result.errorType ??= errorTypeOf(error);
        result.error ??= `${league.comp}: ${errorText(error)}`;
      }
    }
    dates.push(result);
  }

  // ② 계획 — 백필(한국 선수만)은 소속팀 경기만, 다른 프로바이더 원장 항목과 같은 경기는 이미 받은 것으로 본다
  const scoped = input.koreanOnly
    ? fixtures.filter((f) => isKoreanTeamMatch(f, koreanTeamIds))
    : fixtures;
  const known = new Set(input.known);
  for (const f of scoped) {
    if (input.isDuplicate?.(f)) known.add(f.matchId);
  }
  const compByLeague: ReadonlyMap<number, CompId> = input.targets.compByLeague;
  const listedById = new Map<number, PairingMatch>();
  for (const fixture of fixtures) {
    const pairing = hlFixtureToPairing(fixture, compByLeague);
    if (pairing && !listedById.has(pairing.matchId)) {
      listedById.set(pairing.matchId, pairing);
    }
  }
  const listed = [...listedById.values()].sort(
    (a, b) =>
      Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.matchId - b.matchId,
  );
  const plan = planAfFetches({
    fixtures: scoped,
    pending: input.pending,
    known,
    targets: input.targets,
    briefWindow: input.briefWindow,
    now: nowIso(),
  });
  const planned: Record<AfTaskTier, number> = {
    brief: 0,
    window: 0,
    requery: 0,
  };
  for (const task of plan.tasks) planned[task.tier] += 1;

  // 경기 머리(팀)를 아는 경우 — 날짜 조회·이월(팀 모름 → 상세를 받은 뒤 판단)
  const fixtureById = new Map(fixtures.map((f) => [f.matchId, f] as const));
  const koreanTask = (task: AfFetchTask, match: unknown): boolean => {
    const head = fixtureById.get(task.id) ?? toHlFixture(match);
    return head !== null && isKoreanTeamMatch(head, koreanTeamIds);
  };

  const fetched = new Map<number, Fetched>();
  const outcomes: AfTaskOutcome[] = [];
  const briefDetails = new Map<number, MatchDetail>();

  const detailOf = (f: Fetched): MatchDetail | null => {
    const r = toHlMatchDetail(
      { match: f.match, lineups: f.lineups, box: f.box },
      { compByLeague, fetchedAt: nowIso() },
    );
    return r.kind === "finished" ? r.detail : null;
  };

  const sendBrief = (reason: AfBriefSnapshot["reason"]) => {
    if (state.brief) return;
    const snapshot: AfBriefSnapshot = {
      reason,
      details: [...briefDetails.values()].sort(byKickoffId),
      missing: plan.tasks
        .filter((t) => t.tier === "brief" && !briefDetails.has(t.id))
        .map((t) => t.id),
      listed,
    };
    state.brief = snapshot;
    input.onBriefReady?.(snapshot);
  };
  const checkCutoff = () => {
    if (
      !state.brief &&
      input.briefCutoffAt !== null &&
      input.clock() + slot > input.briefCutoffAt
    ) {
      sendBrief("cutoff");
    }
  };

  /** 요청 1건 — 실패는 기록하고 undefined(멈춤 오류면 stoppedBy) */
  async function call<T>(
    run: () => Promise<T>,
    endpoint: AfIssueEvent["endpoint"],
  ): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
    try {
      const value = await run();
      state.failures = 0;
      return { ok: true, value };
    } catch (error) {
      noteError(error, endpoint);
      if (state.stoppedBy === null) {
        state.failures += 1;
        if (state.failures >= breakerAt) state.stoppedBy = "breaker";
      }
      return { ok: false, error };
    }
  }

  /** 상세 요청 → 결과(받음이면 fetched에 넣는다). 계층 brief면 브리핑 몫에도 */
  async function fetchDetail(task: AfFetchTask): Promise<Fetched | null> {
    if (state.stoppedBy !== null) {
      outcomes.push({ task, result: { kind: "deferred" } });
      return null;
    }
    checkCutoff();
    const got = await call(() => input.client.getMatch(task.id), "id");
    if (!got.ok) {
      outcomes.push({
        task,
        result:
          state.stoppedBy !== null &&
          got.error instanceof HighlightlyError &&
          isHighlightlyStageStoppingError(got.error)
            ? { kind: "deferred" }
            : { kind: "failed", errorType: errorTypeOf(got.error) },
      });
      return null;
    }
    if (got.value === null || got.value === undefined) {
      outcomes.push({ task, result: { kind: "missing" } });
      return null;
    }
    const converted = toHlMatchDetail(
      { match: got.value, lineups: null, box: null },
      { compByLeague, fetchedAt: nowIso() },
    );
    if (converted.kind === "not-finished") {
      const status = converted.fixture.status;
      outcomes.push({
        task,
        result: AF_VOID_STATUSES.has(status)
          ? { kind: "void", status }
          : { kind: "unfinished", status, kickoff: converted.fixture.kickoff },
      });
      return null;
    }
    if (converted.kind === "invalid") {
      outcomes.push({ task, result: { kind: "failed", errorType: "format" } });
      return null;
    }
    const f: Fetched = {
      task,
      match: got.value,
      lineups: null,
      box: null,
      korean: koreanTask(task, got.value),
    };
    fetched.set(task.id, f);
    outcomes.push({ task, result: { kind: "fetched" } });
    if (task.tier === "brief" && !state.brief) {
      briefDetails.set(task.id, converted.detail);
    }
    return f;
  }

  async function fetchBox(f: Fetched): Promise<void> {
    if (!f.korean || state.stoppedBy !== null) return;
    checkCutoff();
    const got = await call(() => input.client.getBoxScore(f.task.id), "id");
    if (!got.ok) return;
    f.box = got.value;
    if (f.task.tier === "brief" && !state.brief) {
      const detail = detailOf(f);
      if (detail) briefDetails.set(f.task.id, detail);
    }
  }

  async function fetchLineups(f: Fetched): Promise<void> {
    if (state.stoppedBy !== null || input.skipLineups) return;
    checkCutoff();
    const got = await call(() => input.client.getLineups(f.task.id), "id");
    if (got.ok) f.lineups = got.value;
  }

  // ③ 브리핑 몫 — 상세 + 한국 선수 경기 박스스코어
  const briefTasks = plan.tasks.filter((t) => t.tier === "brief");
  const restTasks = plan.tasks.filter((t) => t.tier !== "brief");
  if (briefTasks.length === 0) {
    sendBrief(state.stoppedBy !== null ? "stopped" : "complete");
  }
  const briefFetched: Fetched[] = [];
  for (const task of briefTasks) {
    if (state.stoppedBy !== null) sendBrief("stopped");
    const f = await fetchDetail(task);
    if (f) {
      briefFetched.push(f);
      await fetchBox(f);
    }
  }
  sendBrief(state.stoppedBy !== null ? "stopped" : "complete");

  // ④ 브리핑 경기 라인업 → 나머지 계층
  for (const f of briefFetched) await fetchLineups(f);
  for (const task of restTasks) {
    const f = await fetchDetail(task);
    if (f) {
      await fetchBox(f);
      await fetchLineups(f);
    }
  }

  // ⑤ 탐색 — 날짜 조회에 나오지 않은 한국 선수 소속팀의 최근 5경기(6개 대회 밖 종료 경기만)
  const counts = { ...plan.counts };
  if ((input.discover ?? true) && state.stoppedBy === null) {
    const seenTeams = new Set<number>();
    for (const f of fixtures) {
      seenTeams.add(f.home.id);
      seenTeams.add(f.away.id);
    }
    const handled = new Set<number>([
      ...plan.tasks.map((t) => t.id),
      ...plan.waiting.map((w) => w.id),
      ...plan.dropped.map((d) => d.id),
      ...known,
    ]);
    const nowMs = Date.parse(nowIso());
    for (const teamId of [...koreanTeamIds].sort((a, b) => a - b)) {
      if (seenTeams.has(teamId)) continue;
      if (state.stoppedBy !== null) break;
      const got = await call(() => input.client.lastFiveGames(teamId), "date");
      if (!got.ok) continue;
      for (const item of got.value) {
        const fixture = toHlFixture(item);
        if (fixture === null || handled.has(fixture.matchId)) continue;
        if (!AF_FINISHED_STATUSES.has(fixture.status)) continue;
        const at = Date.parse(fixture.kickoff);
        if (at > nowMs || at < nowMs - HL_DISCOVER_LOOKBACK_MS) continue;
        const verdict = classifyAfTarget(fixture, input.targets);
        if (!verdict.target || verdict.comp !== null) continue;
        handled.add(fixture.matchId);
        if (input.isDuplicate?.(fixture)) {
          counts.known += 1;
          continue;
        }
        counts.targets += 1;
        counts.koreanOther += 1;
        planned.window += 1;
        fixtureById.set(fixture.matchId, fixture);
        const task: AfFetchTask = {
          id: fixture.matchId,
          tier: "window",
          comp: null,
          leagueId: fixture.leagueId,
          kickoff: fixture.kickoff,
          status: fixture.status,
          pending: null,
        };
        const f = await fetchDetail(task);
        if (f) {
          await fetchBox(f);
          await fetchLineups(f);
        }
      }
    }
  }

  // 받은 원문 → 경기 상세
  const details: MatchDetail[] = [];
  for (const f of fetched.values()) {
    const detail = detailOf(f);
    if (detail) details.push(detail);
  }
  const update = nextAfPending({ plan, outcomes, now: nowIso() });
  return {
    dates,
    counts,
    planned,
    details: details.sort(byKickoffId),
    listed,
    outcomes,
    pending: update.fixtures,
    dropped: update.dropped,
    stoppedBy: state.stoppedBy,
    degraded: state.degraded,
    issues,
    brief: state.brief ?? {
      reason: "stopped",
      details: [],
      missing: [],
      listed,
    },
  };
}

// ─── 이슈 사건 ───────────────────────────────────────────────────────────

/** 이슈 원인 키 `source:highlightly` */
export const HIGHLIGHTLY_ISSUE_SOURCE_ID = "highlightly";

const ISSUE_NOTES: Readonly<Record<AfIssueEvent["kind"], string>> = {
  plan: "Highlightly 목록 응답의 plan.message가 무료 플랜 제한을 알려 재시도 없이 경기 상세(득점자·라인업·한국 선수 기록)를 FR-65 폴백으로 강등했습니다(실행·발행은 계속). 확인할 것: Highlightly 대시보드의 요금제·공지(무료 플랜은 사전 통보 없이 바뀔 수 있다 — 약관 §4.1). 지난 날짜는 다시 받을 수 있어 복구 뒤 백필로 메웁니다(D80).",
  quota:
    "Highlightly 일 한도(하루 100회 — 응답 헤더 남은 수 0)에 닿아 남은 요청을 보내지 않았습니다. 확인할 것: 같은 날 개발 호출 수, 봇 수집 시간대 수동 호출, 우리 쪽 카운터(runs.json·runs-dev.json apiCalls.highlightly). 받지 못한 경기는 이월 목록(data/cache/hl-pending.json)에 남습니다.",
  auth: "Highlightly가 키 오류(HTTP 401·403)를 돌려줘 남은 요청을 보내지 않았습니다. 확인할 것: HIGHLIGHTLY_API_KEY(Actions Secrets) 값·계정 상태(대시보드 — 약관 §12 사전 통보 없는 정지 가능). 받지 못한 경기는 이월 목록에 남습니다.",
  rate: "HTTP 429(분당 throttle)가 연속 2회(61초 뒤 재시도까지) 와서 남은 요청을 멈췄습니다. 확인할 것: 같은 키를 쓰는 다른 호출(개발 호출·봇 수집 시간대 06:00~08:00 KST 수동 호출), 요청 간격(3초). 받지 못한 경기는 이월 목록에 남습니다.",
  api: "Highlightly가 4xx 오류(입력 검증 등)를 돌려줬습니다. 확인할 것: 요청 파라미터(오류 문구). 받지 못한 경기는 이월 목록에 남습니다.",
};

/** 단계 결과 → `source-broken` 이슈 payload(종류별 1건 — api-football-stage.ts `apiFootballIssuePayloads`와 같은 경로) */
export function highlightlyIssuePayloads(
  issues: readonly AfIssueEvent[],
  ctx: { occurredAt: string; runId?: string; runUrl?: string },
): Array<IssuePayloadInput<"source-broken">> {
  const byKind = new Map<AfIssueEvent["kind"], AfIssueEvent>();
  for (const issue of issues)
    if (!byKind.has(issue.kind)) byKind.set(issue.kind, issue);
  return [...byKind.values()].map((issue) => ({
    sourceId: HIGHLIGHTLY_ISSUE_SOURCE_ID,
    sourceName: "Highlightly",
    symptoms: ["기타"],
    errorType: issue.kind,
    error: `${issue.endpoint === "date" ? "/matches?date= · /last-five-games" : "/matches/{id} · /lineups · /box-score"} — ${issue.message}`,
    occurredAt: ctx.occurredAt,
    ...(ctx.runId ? { runId: ctx.runId } : {}),
    ...(ctx.runUrl ? { runUrl: ctx.runUrl } : {}),
    note: ISSUE_NOTES[issue.kind],
  }));
}
