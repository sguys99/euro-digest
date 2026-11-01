/**
 * 한국 선수 현황 파생 파일 `data/players/korean.json` (M3-02·M3-03 — PRD FR-61·FR-62·FR-64·FR-65, §15 D27·D33·D65).
 * 경기 기록 원장(`data/matches`)에서 등록 한국 선수의 경기 로그를 **API-Football 선수 id로만** 뽑고(이름 매칭 없음 — FR-60, 추가
 * API 호출 0), 최근 5경기·시즌 누적(대회별, 집계 시작일 이후 자체 집계)·다음 경기(football-data 일정 — `data/competitions`)를 만든다.
 * 이 파일은 순수 함수만 둔다 — 파일 읽기·쓰기는 korean-players-io.ts, 진입점은 scripts/build-players.ts·collect-run.ts.
 *
 * 경기 로그 (`playerMatchLogOf`) — 원장 한국 선수 행 1개 → `PlayerMatchLog`
 *   - 출전 상태 → started·minutes: start → true·원장 분 · sub → false·원장 분 · bench(교체 명단, 출전 없음)·absent(명단 제외) →
 *     false·0(부록 A "0 = 명단 제외·미출전") · unknown(라인업 없음 — 출전 여부를 모른다) → null·null. 골·도움은 원장 값(자책골 제외).
 *     `status`는 원장 출전 상태 그대로(공용 AppearanceStatus — 벤치·명단 제외를 나눈다, 2026-11-01 사용자 결정).
 *   - 홈/원정·스코어는 소속팀(행의 side) 기준 — result.for = 그 쪽 ft, against = 상대 ft(정규시간 + 연장, 승부차기 제외 — match-data.ts
 *     공통 규칙). 승부차기로 끝난 경기(원장 pens)는 result.pens = 소속팀 기준 승부차기 스코어(2026-11-01 사용자 결정 — M3-07).
 *   - 상대 = 상대 팀 API-Football id → `configs/team-ids.json` 역매핑 slug(없으면 null) + 원장 원문 이름.
 *   - 대회: 원장 comp(6개 대회) 그대로, null(컵 대회 등)이면 "OTHER" + `leagueRaw` = 원장 league 원문(D65).
 *   - matchId: 6개 대회 경기는 대회 파일(football-data) 경기 id(`fd-…`)를 찾아 쓴다(같은 대회·두 팀 slug·킥오프 ±3시간 — 하나일 때만),
 *     찾지 못하면 원장 키 `af-<id>`.
 * 시즌 누적 (`seasonStatsOf`) — 집계 시작일(선수 `since` = meta.playerSince) 이후·이번 시즌 로그를 대회(comp + leagueRaw)별로 더한다.
 *   apps = 출전(선발·교체, 또는 골·도움이 있는 행) 수, minutes = 출전 행의 분 합(출전 행 중 분을 모르는 행이 있으면 null — 모르는 값을
 *   0으로 세지 않는다), goals·assists = 합. 출전 없이 벤치·제외만 있는 대회도 행을 둔다(apps 0). 순서: 설정 리그 → UCL → 다른 6개 대회 →
 *   OTHER(leagueRaw 순).
 * 다음 경기 (`nextMatchOf`) — 대회 파일 6개의 예정(scheduled) 경기 중 소속팀 경기, 킥오프가 지금 뒤인 가장 이른 것(같으면 id 순). 대회
 *   밖 경기(컵 등)는 일정을 모르므로 넣지 않는다 — 6개 대회 일정도 없으면 null. 킥오프 미확정(tbc)은 matchId로 대회 파일에서 본다.
 * 기록 시점 소속 (`recordedTeamOf`) — 그 선수가 **라인업에 있었던**(선발·교체·벤치) 가장 최근 원장 경기의 팀 slug. 제외·unknown 행은
 *   설정 소속으로 만든 행이라 근거가 아니다. 근거가 없거나 slug를 모르면 설정 소속. 설정과 다르면 `teamMismatches`(이적 감지 단서 —
 *   M3-04가 이슈로 만든다, FR-63).
 * 폴백 (FR-65, `fallbackOf`) — `errors.plan` 강등은 원장 메타 `gaps`에 reason "degraded"(그 UTC 날짜의 날짜 조회가 막힘)로 남는다
 *   (match-ledger.ts `nextLedgerMeta`). 소속팀의 football-data 종료 경기가 강등된 날에 있는데 원장 로그가 없고 그 경기가 마지막 원장
 *   로그보다 새것이면 provider "fallback" — 화면이 경기 결과(팀 파일)·득점 순위(대회 파일)·뉴스 기반 "출전·득점 소식"으로 바꾼다.
 *   그 경기의 출전·골은 데이터가 없어 로그로 만들지 않는다(입력에 없는 사실 금지 — 스키마의 goals는 null을 받지 않는다). 강등이
 *   풀려 다음 경기가 원장에 들어오면 다시 "api-football".
 * 갱신 (FR-61·FR-64) — 비활성(`active:false`) 선수는 이전 레코드를 그대로 둔다(없으면 빈 레코드 하나). 활성 선수의 `updatedAt`은
 *   레코드 내용(다음 경기·updatedAt 제외)이 이전과 다를 때만 지금 시각 — 소속팀 경기가 원장에 들어온 다음 실행에서만 바뀐다.
 *   파일 내용(generatedAt 제외)이 같으면 generatedAt도 이전 값(다시 쓰지 않는다).
 */
import {
  KoreanPlayersDataFileSchema,
  playerSeasonKey,
  type CompId,
  type CompetitionFile,
  type KoreanPlayer,
  type KoreanPlayerRecord,
  type KoreanPlayersDataFile,
  type KoreanPlayersFile,
  type LedgerKoreanRow,
  type LedgerMatch,
  type Match,
  type MatchLedgerMeta,
  type PlayerComp,
  type PlayerMatchLog,
  type PlayerNextMatch,
  type PlayerSeasonStats,
  type TeamIdsFile,
} from "@/lib/schema";
import { utcDate } from "@/lib/time";

import { afToSlugOf } from "./team-files";
import type { UnknownNameObservation } from "./unknown-names";

/** 최근 경기 수(FR-62 — 스키마 상한과 같다) */
export const RECENT_LOG_LIMIT = 5;

/** 원장 경기 ↔ 대회 파일 경기 연결 허용 킥오프 차(킥오프 변경·표기 차) */
export const FD_LINK_TOLERANCE_MS = 3 * 60 * 60_000;

/** 6개 대회 순서(시즌 누적 행 순서·다음 경기 검색) */
const COMP_ORDER: readonly CompId[] = [
  "EPL",
  "LALIGA",
  "SERIEA",
  "BUNDESLIGA",
  "LIGUE1",
  "UCL",
];

// ─── 경기 로그 ───────────────────────────────────────────────────────────

export interface LogContext {
  /** API-Football 팀 id → 팀 slug(team-ids.json) */
  afToSlug: ReadonlyMap<number, string>;
  /** 대회 파일(있는 것만) — 경기 id 연결 */
  competitions: Partial<Record<CompId, Pick<CompetitionFile, "matches">>>;
}

/** 출전 상태 → started·minutes(머리 주석) */
export function appearanceOf(
  row: Pick<LedgerKoreanRow, "status" | "minutes">,
): {
  started: boolean | null;
  minutes: number | null;
} {
  switch (row.status) {
    case "start":
      return { started: true, minutes: row.minutes };
    case "sub":
      return { started: false, minutes: row.minutes };
    case "bench":
    case "absent":
      return { started: false, minutes: 0 };
    case "unknown":
      return { started: null, minutes: null };
  }
}

/** 원장 경기 → 대회 파일 경기 id(같은 대회·두 팀 slug·킥오프 ±3시간, 후보 하나) — 없으면 null */
export function fdMatchIdOf(
  m: Pick<LedgerMatch, "comp" | "kickoff" | "home" | "away">,
  ctx: LogContext,
): string | null {
  if (m.comp === null) return null;
  const home = ctx.afToSlug.get(m.home.id);
  const away = ctx.afToSlug.get(m.away.id);
  if (home === undefined || away === undefined) return null;
  const at = Date.parse(m.kickoff);
  const found = (ctx.competitions[m.comp]?.matches ?? []).filter(
    (x) =>
      x.home === home &&
      x.away === away &&
      Math.abs(Date.parse(x.kickoff) - at) <= FD_LINK_TOLERANCE_MS,
  );
  return found.length === 1 ? found[0]!.id : null;
}

/** 원장 경기 + 한국 선수 행 → 경기 로그(머리 주석 "경기 로그") */
export function playerMatchLogOf(
  m: LedgerMatch,
  row: LedgerKoreanRow,
  ctx: LogContext,
): PlayerMatchLog {
  const own = row.side;
  const other = own === "home" ? "away" : "home";
  const opp = m[other];
  const { started, minutes } = appearanceOf(row);
  return {
    matchId: fdMatchIdOf(m, ctx) ?? m.id,
    comp: m.comp ?? "OTHER",
    ...(m.comp === null && m.league.trim() !== ""
      ? { leagueRaw: m.league.trim() }
      : {}),
    kickoff: m.kickoff,
    opponent: { slug: ctx.afToSlug.get(opp.id) ?? null, name: opp.name },
    home: own === "home",
    result: {
      for: m.ft[own],
      against: m.ft[other],
      ...(m.pens !== null
        ? { pens: { for: m.pens[own], against: m.pens[other] } }
        : {}),
    },
    status: row.status,
    started,
    minutes,
    goals: row.goals,
    assists: row.assists,
  };
}

/** 원장 경기 최신순(킥오프 내림차순 → id 내림차순) */
function newestFirst(a: LedgerMatch, b: LedgerMatch): number {
  return (
    Date.parse(b.kickoff) - Date.parse(a.kickoff) ||
    Number(b.id.slice(3)) - Number(a.id.slice(3))
  );
}

export interface PlayerLedgerEntry {
  match: LedgerMatch;
  row: LedgerKoreanRow;
}

/**
 * 선수 1명의 원장 항목(최신순) — 선수 id 행만, 이번 시즌(원장 season이 같거나 없음)·집계 시작일(UTC 날짜) 이후.
 * 원장 항목은 since 이후만 들어 있지만 나중에 추적을 시작한 선수는 playerSince가 더 늦다.
 */
export function playerLedgerEntries(
  ledger: readonly LedgerMatch[],
  afId: number,
  opts: { season: number; since: string },
): PlayerLedgerEntry[] {
  const out: PlayerLedgerEntry[] = [];
  for (const m of [...ledger].sort(newestFirst)) {
    if (m.season !== null && m.season !== opts.season) continue;
    if (utcDate(m.kickoff) < opts.since) continue;
    const row = m.korean.find((r) => r.player === afId);
    if (row) out.push({ match: m, row });
  }
  return out;
}

// ─── 시즌 누적 ───────────────────────────────────────────────────────────

/** 출전한 로그인가 — 선발·교체(분 > 0), 또는 골·도움이 있다 */
export function appearedIn(
  log: Pick<PlayerMatchLog, "started" | "minutes" | "goals" | "assists">,
): boolean {
  return (
    log.started === true ||
    (log.minutes ?? 0) > 0 ||
    log.goals > 0 ||
    (log.assists ?? 0) > 0
  );
}

function compRank(comp: PlayerComp, league: PlayerComp): number {
  if (comp === league) return 0;
  if (comp === "UCL") return 1;
  if (comp === "OTHER") return 3;
  return 2 + COMP_ORDER.indexOf(comp) / 10;
}

/** 로그(이미 집계 범위로 거른 것) → 대회별 시즌 누적(머리 주석 "시즌 누적") */
export function seasonStatsOf(
  logs: readonly PlayerMatchLog[],
  league: PlayerComp,
): PlayerSeasonStats[] {
  const rows = new Map<
    string,
    PlayerSeasonStats & { minutesKnown: boolean; assistsKnown: boolean }
  >();
  for (const log of logs) {
    const key = playerSeasonKey(log);
    let row = rows.get(key);
    if (!row) {
      row = {
        comp: log.comp,
        ...(log.leagueRaw !== undefined ? { leagueRaw: log.leagueRaw } : {}),
        apps: 0,
        minutes: 0,
        goals: 0,
        assists: 0,
        minutesKnown: true,
        assistsKnown: true,
      };
      rows.set(key, row);
    }
    if (!appearedIn(log)) continue;
    row.apps += 1;
    if (log.minutes === null) row.minutesKnown = false;
    else row.minutes = (row.minutes ?? 0) + log.minutes;
    row.goals += log.goals;
    if (log.assists === null) row.assistsKnown = false;
    else row.assists = (row.assists ?? 0) + log.assists;
  }
  return [...rows.values()]
    .sort(
      (a, b) =>
        compRank(a.comp, league) - compRank(b.comp, league) ||
        (a.leagueRaw ?? "").localeCompare(b.leagueRaw ?? "", "en"),
    )
    .map(({ minutesKnown, assistsKnown, ...row }) => ({
      ...row,
      minutes: minutesKnown ? row.minutes : null,
      assists: assistsKnown ? row.assists : null,
    }));
}

// ─── 다음 경기 ───────────────────────────────────────────────────────────

/** 소속팀의 다음 경기(대회 파일 예정 경기, 킥오프 > now) — 없으면 null */
export function nextMatchOf(
  team: string,
  competitions: Partial<Record<CompId, Pick<CompetitionFile, "matches">>>,
  teamNames: ReadonlyMap<string, string>,
  now: string,
): PlayerNextMatch | null {
  const at = Date.parse(now);
  let best: Match | null = null;
  for (const comp of COMP_ORDER) {
    for (const m of competitions[comp]?.matches ?? []) {
      if (m.status !== "scheduled") continue;
      if (m.home !== team && m.away !== team) continue;
      if (Date.parse(m.kickoff) <= at) continue;
      if (
        best === null ||
        Date.parse(m.kickoff) < Date.parse(best.kickoff) ||
        (m.kickoff === best.kickoff && m.id < best.id)
      ) {
        best = m;
      }
    }
  }
  if (best === null) return null;
  const home = best.home === team;
  const opp = home ? best.away : best.home;
  return {
    matchId: best.id,
    comp: best.comp,
    kickoff: best.kickoff,
    opponent: { slug: opp, name: teamNames.get(opp) ?? opp },
    home,
  };
}

// ─── 기록 시점 소속 · 이적 단서 ──────────────────────────────────────────

export interface RecordedTeam {
  /** 레코드에 쓸 팀 slug(근거가 없거나 slug를 모르면 설정 소속) */
  team: string;
  /** 근거 경기(라인업에 있던 가장 최근 원장 경기) — 없으면 null */
  evidence: {
    matchId: string;
    kickoff: string;
    teamAf: number;
    teamName: string;
    /** 그 팀의 slug(team-ids에 없으면 null) */
    slug: string | null;
  } | null;
}

/** 원장 항목(최신순) → 기록 시점 소속(머리 주석) */
export function recordedTeamOf(
  entries: readonly PlayerLedgerEntry[],
  configTeam: string,
  afToSlug: ReadonlyMap<number, string>,
): RecordedTeam {
  const hit = entries.find(
    (e) =>
      e.row.status === "start" ||
      e.row.status === "sub" ||
      e.row.status === "bench",
  );
  if (!hit) return { team: configTeam, evidence: null };
  const side = hit.match[hit.row.side];
  const slug = afToSlug.get(side.id) ?? null;
  return {
    team: slug ?? configTeam,
    evidence: {
      matchId: hit.match.id,
      kickoff: hit.match.kickoff,
      teamAf: side.id,
      teamName: side.name,
      slug,
    },
  };
}

/** 설정 소속과 원장 소속이 다른 선수(이적 감지 단서 — M3-04가 이슈로 만든다, FR-63) */
export interface TeamMismatch {
  player: string;
  configTeam: string;
  /** 원장 근거 팀 slug(team-ids에 없으면 null) */
  observedTeam: string | null;
  observedTeamName: string;
  matchId: string;
  kickoff: string;
}

/** 이적 단서 판정 — 근거 팀이 설정 소속 af id와 다르면 단서(설정 소속 af를 모르면 slug로 비교) */
export function teamMismatchOf(
  player: Pick<KoreanPlayer, "slug" | "team">,
  recorded: RecordedTeam,
  configTeamAf: number | null,
): TeamMismatch | null {
  const e = recorded.evidence;
  if (e === null) return null;
  const same =
    configTeamAf !== null ? e.teamAf === configTeamAf : e.slug === player.team;
  if (same) return null;
  return {
    player: player.slug,
    configTeam: player.team,
    observedTeam: e.slug,
    observedTeamName: e.teamName,
    matchId: e.matchId,
    kickoff: e.kickoff,
  };
}

// ─── 폴백 (FR-65) ────────────────────────────────────────────────────────

/** 강등(degraded)된 UTC 날짜 — 원장 메타 gaps */
export function degradedDatesOf(
  meta: Pick<MatchLedgerMeta, "gaps">,
): Set<string> {
  return new Set(
    meta.gaps.filter((g) => g.reason === "degraded").map((g) => g.date),
  );
}

/**
 * 폴백 판정(머리 주석 "폴백") — 강등된 날의 소속팀 종료 경기(대회 파일) 중 원장 로그가 없고 마지막 원장 로그보다 새 경기가 있으면 true.
 */
export function fallbackOf(input: {
  team: string;
  since: string;
  logs: readonly Pick<PlayerMatchLog, "matchId" | "kickoff">[];
  degraded: ReadonlySet<string>;
  competitions: Partial<Record<CompId, Pick<CompetitionFile, "matches">>>;
}): boolean {
  if (input.degraded.size === 0) return false;
  const logged = new Set(input.logs.map((l) => l.matchId));
  const loggedDays = new Set(input.logs.map((l) => utcDate(l.kickoff)));
  const latest = input.logs.reduce(
    (max, l) => Math.max(max, Date.parse(l.kickoff)),
    Number.NEGATIVE_INFINITY,
  );
  for (const comp of COMP_ORDER) {
    for (const m of input.competitions[comp]?.matches ?? []) {
      if (m.status !== "finished") continue;
      if (m.home !== input.team && m.away !== input.team) continue;
      const day = utcDate(m.kickoff);
      if (day < input.since || !input.degraded.has(day)) continue;
      if (logged.has(m.id) || loggedDays.has(day)) continue;
      if (Date.parse(m.kickoff) > latest) return true;
    }
  }
  return false;
}

// ─── 파일 ────────────────────────────────────────────────────────────────

export interface KoreanPlayersBuildInput {
  players: KoreanPlayersFile;
  teamIds: TeamIdsFile;
  ledger: readonly LedgerMatch[];
  meta: Pick<MatchLedgerMeta, "season" | "since" | "playerSince" | "gaps">;
  competitions: Partial<Record<CompId, Pick<CompetitionFile, "matches">>>;
  /** 팀 slug → 영문 이름(다음 경기 상대 이름 — names.ko 팀 항목 대표 영문) */
  teamNames: ReadonlyMap<string, string>;
  /** 이전 파일(없거나 읽지 못했으면 null) */
  previous: KoreanPlayersDataFile | null;
  /** 실행 시각(UTC ISO) */
  now: string;
  /** 사전·무시 목록에 있는 이름인가(names.ts isKnownName) — 없으면 미등록 이름을 모으지 않는다 */
  isKnownName?: (name: string) => boolean;
}

export interface KoreanPlayersBuild {
  file: KoreanPlayersDataFile;
  /** 이전 파일과 내용(generatedAt 제외)이 다르다 — 쓸지 판단 */
  changed: boolean;
  /** updatedAt을 바꾼 선수 */
  updated: string[];
  /** 비활성이라 이전 레코드를 그대로 둔 선수 */
  frozen: string[];
  /** provider "fallback"인 선수 */
  fallback: string[];
  teamMismatches: TeamMismatch[];
  /** 원장 근거 팀 slug를 몰라 설정 소속을 쓴 선수(team-ids에 없는 팀) */
  unmappedTeams: string[];
  /** 미등록 이름 후보(slug 없는 상대 팀·컵 대회 원문) */
  unknownNames: UnknownNameObservation[];
}

/** 레코드 비교 키(updatedAt·다음 경기 제외) */
function recordKey(r: KoreanPlayerRecord): string {
  // undefined 값은 JSON에서 빠진다
  return JSON.stringify({ ...r, updatedAt: undefined, next: undefined });
}

function fileKey(f: KoreanPlayersDataFile): string {
  return JSON.stringify({ ...f, generatedAt: undefined });
}

function emptyRecord(p: KoreanPlayer, now: string): KoreanPlayerRecord {
  return {
    slug: p.slug,
    team: p.team,
    provider: "api-football",
    since: null,
    season: [],
    recent: [],
    next: null,
    updatedAt: now,
  };
}

/** configs + 원장 + 대회 파일 + 이전 파일 → `data/players/korean.json`(순수 함수 — 머리 주석) */
export function buildKoreanPlayersFile(
  input: KoreanPlayersBuildInput,
): KoreanPlayersBuild {
  const afToSlug = afToSlugOf(input.teamIds);
  const ctx: LogContext = { afToSlug, competitions: input.competitions };
  const degraded = degradedDatesOf(input.meta);
  const prevBySlug = new Map(
    (input.previous?.players ?? []).map((r) => [r.slug, r] as const),
  );
  const out: KoreanPlayersBuild = {
    file: {
      season: input.meta.season,
      since: input.meta.since,
      generatedAt: input.now,
      players: [],
    },
    changed: false,
    updated: [],
    frozen: [],
    fallback: [],
    teamMismatches: [],
    unmappedTeams: [],
    unknownNames: [],
  };
  const unknown = new Map<string, UnknownNameObservation>();
  const observe = (name: string, kind: UnknownNameObservation["kind"]) => {
    if (!input.isKnownName || input.isKnownName(name) || unknown.has(name))
      return;
    unknown.set(name, kind ? { name, kind } : { name });
  };
  const seen = new Set<string>();

  for (const p of input.players) {
    if (seen.has(p.slug)) continue;
    seen.add(p.slug);
    const prev = prevBySlug.get(p.slug);
    if (!p.active) {
      out.file.players.push(prev ?? emptyRecord(p, input.now));
      out.frozen.push(p.slug);
      continue;
    }
    const since =
      p.apiFootballId !== null
        ? (input.meta.playerSince[p.slug] ?? null)
        : null;
    const entries =
      p.apiFootballId !== null && since !== null
        ? playerLedgerEntries(input.ledger, p.apiFootballId, {
            season: input.meta.season,
            since,
          })
        : [];
    const logs = entries.map((e) => playerMatchLogOf(e.match, e.row, ctx));
    for (const log of logs) {
      if (log.opponent.slug === null) observe(log.opponent.name, "team");
      if (log.leagueRaw !== undefined) observe(log.leagueRaw, "competition");
    }
    const recorded = recordedTeamOf(entries, p.team, afToSlug);
    if (recorded.evidence !== null && recorded.evidence.slug === null) {
      out.unmappedTeams.push(p.slug);
    }
    const configTeamAf = Object.hasOwn(input.teamIds, p.team)
      ? (input.teamIds[p.team]?.af ?? null)
      : null;
    const mismatch = teamMismatchOf(p, recorded, configTeamAf);
    if (mismatch) out.teamMismatches.push(mismatch);
    const fallback =
      since !== null &&
      fallbackOf({
        team: recorded.team,
        since,
        logs,
        degraded,
        competitions: input.competitions,
      });
    if (fallback) out.fallback.push(p.slug);
    const fresh: KoreanPlayerRecord = {
      slug: p.slug,
      team: recorded.team,
      provider: fallback ? "fallback" : "api-football",
      since,
      season: seasonStatsOf(logs, p.comp),
      recent: logs.slice(0, RECENT_LOG_LIMIT),
      next: nextMatchOf(
        recorded.team,
        input.competitions,
        input.teamNames,
        input.now,
      ),
      updatedAt: input.now,
    };
    if (prev && recordKey(prev) === recordKey(fresh)) {
      fresh.updatedAt = prev.updatedAt;
    } else {
      out.updated.push(p.slug);
    }
    out.file.players.push(fresh);
  }
  out.unknownNames = [...unknown.values()];
  // 스키마 순서로 정규화한 뒤 비교한다(키 순서가 다른 같은 내용을 바뀐 것으로 보지 않게)
  out.file = KoreanPlayersDataFileSchema.parse(out.file);
  out.changed =
    input.previous === null || fileKey(input.previous) !== fileKey(out.file);
  if (!out.changed && input.previous !== null) {
    out.file.generatedAt = input.previous.generatedAt;
  }
  return out;
}

/** 직렬화(2칸 들여쓰기 + 끝 줄바꿈 — data/ 공통) */
export function serializeKoreanPlayersFile(
  file: KoreanPlayersDataFile,
): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
