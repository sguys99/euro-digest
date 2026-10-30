/**
 * 대회 페이지 데이터 단계 (M2-02, PRD FR-40~45) — football-data 대회당 3요청(순위·시즌 경기·득점 순위) → 대회 파일 조립.
 * 6개 대회면 하루 18요청(M2 완료 기준 "football-data 하루 18회 내외"). 호출 간격·재시도·마감은 클라이언트 정책을 그대로 따른다
 * (providers/football-data.ts — 동시 1개, 응답 후 6.5초, 429·5xx·타임아웃 1회 재시도).
 *
 * I/O는 모두 주입한다(클라이언트·이전 파일 읽기·현재 시각·로거). 파일 쓰기는 호출부(scripts/fetch-competitions.ts, M2-09 collect
 * 통합)가 결과의 `outcome`을 보고 한다 — `--dry`가 같은 경로를 탄다.
 *
 * 실패 격리: 요청·변환 실패는 그 조각만 실패로 기록하고 다음 조각·다음 대회로 간다(던지지 않는다). 세 조각이 모두 실패한 대회는
 * 파일을 쓰지 않는다(전일 파일 유지 — competition-file.ts). 반환값의 `apiCalls`는 이 단계가 보낸 요청 수(재시도 포함)라
 * runs.json `apiCalls.footballData`에 더할 수 있다(M2-09).
 */
import {
  CompIdSchema,
  type CompId,
  type CompetitionConfig,
  type CompetitionFile,
  type Match,
  type Scorer,
  type StandingRow,
} from "@/lib/schema";

import {
  mergeCompetitionFile,
  type CompetitionPart,
  type CompetitionParts,
  type MergeCompetitionOutcome,
  type PartResult,
  type StandingsEnricher,
} from "./competition-file";
import type { Logger } from "./logger";
import {
  FootballDataError,
  type FootballDataClient,
} from "./providers/football-data";
import {
  toCompetitionMatches,
  toCompetitionScorers,
  toStandingRows,
  type FdTeamLookup,
  type KickoffProvisional,
  type MatchesSkipped,
  type UnknownFdTeam,
} from "./providers/football-data-competition";

/**
 * 득점 순위 요청 인원 — 기본 10명은 팀 페이지 득점 상위(FR-52)에 모자란다. limit=100은 무료 플랜에서 그대로 100명이 온다
 * (2026-10-30 실측 — 6개 대회 모두 100명, 마지막은 1골. 응답 약 62KB, 변환 후 약 12KB).
 */
export const SCORERS_LIMIT = 100;

export type CompetitionsClient = Pick<
  FootballDataClient,
  "getStandings" | "getCompetitionMatches" | "getScorers" | "calls" | "retries"
>;

export interface CompetitionsStageInput {
  client: CompetitionsClient;
  competitions: readonly CompetitionConfig[];
  teams: FdTeamLookup;
  /** 전일 파일(같은 대회) — 없거나 읽지 못하면 null */
  readPrevious: (comp: CompId) => Promise<CompetitionFile | null>;
  now: () => Date;
  log?: Logger;
  enrichStandings?: StandingsEnricher;
  scorersLimit?: number;
}

export interface PartFailure {
  part: CompetitionPart;
  errorType: string;
  error: string;
}

/** 대응표에 없는 팀 — 어느 조각에서 나왔는지와 함께(운영 리포트 후보) */
export interface UnknownTeamReport extends UnknownFdTeam {
  parts: CompetitionPart[];
}

export interface CompetitionStageResult {
  comp: CompId;
  outcome: MergeCompetitionOutcome | { action: "error"; error: string };
  failures: PartFailure[];
  /** 이번에 받은 조각의 건수(실패한 조각은 없음) */
  counts: Partial<Record<CompetitionPart, number>>;
  /** 킥오프 미확정 경기(Match.id → 근거) — 파일에는 Match.tbc로 실린다(근거 구분은 로그용) */
  provisional: Map<string, KickoffProvisional>;
  matchesSkipped: MatchesSkipped | null;
  unknownStatuses: string[];
  unknownStatusCount: number;
  scoreMissing: number;
  inProgress: number;
  unknownTeams: UnknownTeamReport[];
}

export interface CompetitionsStageResult {
  results: CompetitionStageResult[];
  /** 이 단계가 보낸 요청 수(실패·재시도 포함) — runs.json apiCalls.footballData */
  apiCalls: number;
  retries: number;
}

/** 오류 메시지 첫 줄(응답 본문·키는 메시지에 들어가지 않는다 — 클라이언트 규칙) */
function messageOf(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "")
    : String(error);
}

function failureOf(part: CompetitionPart, error: unknown): PartFailure {
  return {
    part,
    errorType: error instanceof FootballDataError ? error.kind : "unexpected",
    error: messageOf(error),
  };
}

function addUnknown(
  into: Map<number, UnknownTeamReport>,
  part: CompetitionPart,
  teams: readonly UnknownFdTeam[],
): void {
  for (const t of teams) {
    const entry = into.get(t.fd) ?? { ...t, parts: [] };
    if (!entry.parts.includes(part)) entry.parts.push(part);
    into.set(t.fd, entry);
  }
}

/** 대회 1개 — 순위 → 경기 → 득점 순서로 받고 조립한다(던지지 않는다) */
async function fetchOne(
  input: CompetitionsStageInput,
  comp: CompetitionConfig,
): Promise<CompetitionStageResult> {
  const { client, teams } = input;
  const code = comp.footballDataCode;
  const failures: PartFailure[] = [];
  const counts: CompetitionStageResult["counts"] = {};
  const unknown = new Map<number, UnknownTeamReport>();
  const base = {
    comp: comp.id,
    failures,
    counts,
    provisional: new Map<string, KickoffProvisional>(),
    matchesSkipped: null as MatchesSkipped | null,
    unknownStatuses: [] as string[],
    unknownStatusCount: 0,
    scoreMissing: 0,
    inProgress: 0,
  };

  let standings: PartResult<StandingRow[]>;
  try {
    const conv = toStandingRows(await client.getStandings(code), comp, teams);
    addUnknown(unknown, "standings", conv.unknownTeams);
    standings = { ok: true, value: conv.rows };
    counts.standings = conv.rows.length;
  } catch (error) {
    const f = failureOf("standings", error);
    failures.push(f);
    standings = { ok: false, errorType: f.errorType, error: f.error };
  }

  let matches: PartResult<Match[]>;
  try {
    const raw = await client.getCompetitionMatches(code, comp.season);
    const conv = toCompetitionMatches(raw, comp, teams);
    addUnknown(unknown, "matches", conv.unknownTeams);
    matches = { ok: true, value: conv.matches };
    counts.matches = conv.matches.length;
    base.provisional = conv.provisional;
    base.matchesSkipped = conv.skipped;
    base.unknownStatuses = conv.unknownStatuses;
    base.unknownStatusCount = conv.unknownStatusCount;
    base.scoreMissing = conv.scoreMissing;
    base.inProgress = conv.inProgress;
  } catch (error) {
    const f = failureOf("matches", error);
    failures.push(f);
    matches = { ok: false, errorType: f.errorType, error: f.error };
  }

  let scorers: PartResult<Scorer[]>;
  try {
    const raw = await client.getScorers(
      code,
      comp.season,
      input.scorersLimit ?? SCORERS_LIMIT,
    );
    const conv = toCompetitionScorers(raw, comp, teams);
    addUnknown(unknown, "scorers", conv.unknownTeams);
    scorers = { ok: true, value: conv.scorers };
    counts.scorers = conv.scorers.length;
  } catch (error) {
    const f = failureOf("scorers", error);
    failures.push(f);
    scorers = { ok: false, errorType: f.errorType, error: f.error };
  }

  const parts: CompetitionParts = { standings, matches, scorers };
  const unknownTeams = [...unknown.values()].sort((a, b) => a.fd - b.fd);
  try {
    const previous = await input.readPrevious(comp.id);
    const outcome = mergeCompetitionFile({
      comp,
      previous,
      parts,
      fetchedAt: input.now().toISOString(),
      enrichStandings: input.enrichStandings,
    });
    return { ...base, outcome, unknownTeams };
  } catch (error) {
    return {
      ...base,
      outcome: { action: "error", error: messageOf(error) },
      unknownTeams,
    };
  }
}

/** 대회들을 설정 순서대로 하나씩 처리한다(요청은 클라이언트 큐가 한 줄로 세운다) */
export async function fetchCompetitionFiles(
  input: CompetitionsStageInput,
): Promise<CompetitionsStageResult> {
  const startCalls = input.client.calls;
  const startRetries = input.client.retries;
  const results: CompetitionStageResult[] = [];
  for (const comp of input.competitions) {
    const started = input.now().getTime();
    const result = await fetchOne(input, comp);
    results.push(result);
    logResult(input.log, result, input.now().getTime() - started);
  }
  return {
    results,
    apiCalls: input.client.calls - startCalls,
    retries: input.client.retries - startRetries,
  };
}

function logResult(
  log: Logger | undefined,
  r: CompetitionStageResult,
  elapsedMs: number,
): void {
  if (!log) return;
  for (const f of r.failures) {
    log.warn("collect.competition.fail", {
      comp: r.comp,
      part: f.part,
      errorType: f.errorType,
      error: f.error,
    });
  }
  for (const t of r.unknownTeams) {
    // 운영 리포트 후보 — configs/team-ids.json에 없는 팀(시즌 전환·승격 팀 누락)
    log.warn("collect.competition.unknown-team", {
      comp: r.comp,
      fd: t.fd,
      name: t.name,
      parts: t.parts,
    });
  }
  if (r.unknownStatusCount > 0) {
    log.warn("collect.competition.unknown-status", {
      comp: r.comp,
      count: r.unknownStatusCount,
      samples: r.unknownStatuses,
    });
  }
  const o = r.outcome;
  log.info("collect.competition.done", {
    comp: r.comp,
    action: o.action,
    standings: r.counts.standings ?? null,
    matches: r.counts.matches ?? null,
    scorers: r.counts.scorers ?? null,
    kept: o.action === "write" ? o.kept : [],
    empty: o.action === "write" ? o.empty : [],
    provisionalDate: countOf(r.provisional, "date"),
    provisionalTime: countOf(r.provisional, "time"),
    skipped: r.matchesSkipped,
    scoreMissing: r.scoreMissing,
    inProgress: r.inProgress,
    elapsedMs,
  });
}

function countOf(
  map: ReadonlyMap<string, KickoffProvisional>,
  kind: KickoffProvisional,
): number {
  let n = 0;
  for (const v of map.values()) if (v === kind) n += 1;
  return n;
}

// ─── CLI 인자 ────────────────────────────────────────────────────────────

/** `--comp` 값들 → 대회 ID 목록(중복 제거). 모르는 값이면 오류 메시지 */
export function parseCompArgs(
  values: readonly string[],
): { ok: true; comps: CompId[] } | { ok: false; error: string } {
  const comps: CompId[] = [];
  for (const raw of values.flatMap((v) => v.split(","))) {
    const id = raw.trim().toUpperCase();
    if (id === "") continue;
    const parsed = CompIdSchema.safeParse(id);
    if (!parsed.success) return { ok: false, error: `모르는 대회: "${raw}"` };
    if (!comps.includes(parsed.data)) comps.push(parsed.data);
  }
  return { ok: true, comps };
}
