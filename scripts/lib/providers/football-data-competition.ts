/**
 * football-data.org v4 → 대회 파일 조각 변환 (M2-02, PRD FR-40·41·42·44) — I/O 없는 순수 함수.
 *
 * 입력은 클라이언트(providers/football-data.ts)가 받은 응답 원문이고, 출력은 `data/competitions/{comp}.json`의 조각
 * (`StandingRow[]`·`Match[]`·`Scorer[]`, src/lib/schema/competition.ts)이다. football-data 키·상태·단계 이름은 이 파일 밖으로
 * 나가지 않는다(CLAUDE.md §6.4). 파일 조립·실패 시 이전 값 유지는 scripts/lib/competition-file.ts가 맡는다.
 *
 * 팀은 football-data 팀 id → slug(`configs/team-ids.json`, M2-04)로 바꾼다. 대응표에 없는 팀은 그 행·경기·득점자만 건너뛰고
 * `unknownTeams`로 돌려준다(로그 + 운영 리포트 후보 — 시즌 전환·승격 팀 누락 신호).
 *
 * ── 경기 상태 매핑 (내부 `MatchStatus` = scheduled | finished | postponed) ──
 *   | football-data           | 내부        | score                  | 비고 |
 *   |-------------------------|-------------|------------------------|------|
 *   | SCHEDULED               | scheduled   | null                   | 날짜만 정해짐 — 시각 00:00Z 자리값(`provisional` "date") |
 *   | TIMED                   | scheduled   | null                   | 시각 있음 — 먼 라운드는 자리값일 수 있다(`provisional` "time") |
 *   | IN_PLAY·PAUSED·LIVE·EXTRA_TIME·PENALTY_SHOOTOUT | scheduled | null | 하루 1회 수집 — 진행 중 점수는 쓰지 않는다(다음 실행이 결과로 바꾼다) |
 *   | FINISHED·AWARDED        | finished    | 최종(승부차기 골 제외) + 연장 aet·승부차기 pens | 스코어를 쓸 수 없으면 null(`scoreMissing`) |
 *   | POSTPONED·SUSPENDED·CANCELLED | postponed | null            | CANCELLED도 fullTime 0:0이 채워져 온다 — 버린다(M0-28) |
 *   | 그 밖(모르는 값)         | scheduled   | null                   | `unknownStatuses`로 로그. 2026-10-30 PL 29경기는 status 자리에 옛 킥오프 문자열("2026-12-02 20:00:00Z")이 왔다 |
 *
 * ── 라운드(`Match.round`) 표기 ──
 *   - 순위표 단계(REGULAR_SEASON·LEAGUE_STAGE·단계 없음): matchday 숫자 문자열 — "1"…"38", UCL 리그 페이즈 "1"…"8".
 *   - UCL 녹아웃: `ko-<단계>-<차전>` — ko-playoff-1·2(녹아웃 PO), ko-r16-1·2, ko-qf-1·2, ko-sf-1·2, 결승 ko-final(단판).
 *     차전은 같은 단계·같은 두 팀 경기의 킥오프 순서로 정한다. 숫자로 시작하지 않으면 녹아웃 — M2-12 자동 전환이 이것으로 판단한다.
 *   - 그 밖의 단계(예선 등 — 무료 플랜은 주지 않음, M2-01)는 경기를 건너뛰고 `skipped.unknownStage`로 센다.
 */
import { z } from "zod";

import type {
  CompetitionConfig,
  Match,
  MatchStatus,
  Scorer,
  StandingRow,
} from "@/lib/schema";
import { standingZoneOf } from "@/lib/standing-zone";

import {
  affectsStandings,
  FdMatchSchema,
  FootballDataError,
  isInProgressStatus,
  toCompStandings,
  toMatchScore,
  type FdMatch,
} from "./football-data";

// ─── 공통 ────────────────────────────────────────────────────────────────

/** football-data 팀 id → slug 조회(team-ids.ts `TeamIdIndex`의 byFd만 쓴다) */
export interface FdTeamLookup {
  byFd: ReadonlyMap<number, string>;
}

/** 대응표에 없는 팀 — 운영 리포트 후보(사람이 team-ids.json에 넣는다) */
export interface UnknownFdTeam {
  fd: number;
  /** 원문 이름(로그·후보 표시용) */
  name: string;
}

/** 같은 팀을 한 번만 모은다(fd id 순) */
function collectUnknown(
  into: Map<number, UnknownFdTeam>,
  fd: number,
  name: string | null | undefined,
): void {
  if (!into.has(fd)) into.set(fd, { fd, name: name?.trim() || `#${fd}` });
}

function unknownList(map: Map<number, UnknownFdTeam>): UnknownFdTeam[] {
  return [...map.values()].sort((a, b) => a.fd - b.fd);
}

/** 응답 `filters.season`(문자열 "2026" 또는 숫자) → 시즌 연도. 없거나 읽을 수 없으면 null */
function filterSeason(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const year = typeof value === "number" ? value : Number(value);
  return Number.isInteger(year) ? year : null;
}

const FiltersSchema = z
  .object({ season: z.union([z.string(), z.number()]).optional() })
  .nullable()
  .optional();

function checkSeason(
  kind: string,
  comp: Pick<CompetitionConfig, "footballDataCode" | "season">,
  season: number | null,
): void {
  if (season !== null && season !== comp.season) {
    throw new FootballDataError(
      "format",
      `football-data ${comp.footballDataCode} ${kind} 응답 시즌이 다르다(설정 ${comp.season}, 응답 ${season})`,
    );
  }
}

// ─── 순위 ────────────────────────────────────────────────────────────────

export interface StandingsConversion {
  /** 순위 순(공동 순위는 응답 순서 그대로). prevPos null·form [] — M2-03이 채운다 */
  rows: StandingRow[];
  /** 응답의 현재 라운드 — 없으면 null(로그용) */
  currentMatchday: number | null;
  unknownTeams: UnknownFdTeam[];
}

/**
 * 순위 응답 원문 → `StandingRow[]`. 형식 검사는 브리핑 어댑터(`toCompStandings` — 행 하나라도 틀리면 대회 전체 실패)를 그대로 쓴다.
 * 표가 하나가 아니거나(그룹 스테이지 등 — 현재 6개 대회에는 없다) 시즌이 설정과 다르면 던진다(그 조각만 이전 값 유지).
 * 구간(zone)은 순위 숫자로 판정한다(`standingZoneOf` — 동순위는 같은 구간, M2-01).
 */
export function toStandingRows(
  raw: unknown,
  comp: Pick<CompetitionConfig, "id" | "footballDataCode" | "season" | "zones">,
  teams: FdTeamLookup,
): StandingsConversion {
  const standings = toCompStandings(raw, comp, {
    fetchedAt: "",
    inProgress: 0,
  });
  checkSeason("순위", comp, standings.season);
  if (standings.tables.length !== 1) {
    throw new FootballDataError(
      "format",
      `football-data ${comp.footballDataCode} 순위표가 ${standings.tables.length}개다(단일 표만 지원)`,
    );
  }
  const table = standings.tables[0]!;
  const unknown = new Map<number, UnknownFdTeam>();
  const rows: StandingRow[] = [];
  for (const r of table.rows) {
    const slug = teams.byFd.get(r.team.id);
    if (slug === undefined) {
      collectUnknown(unknown, r.team.id, r.team.fullName ?? r.team.name);
      continue;
    }
    rows.push({
      pos: r.pos,
      prevPos: null,
      team: slug,
      played: r.played,
      w: r.w,
      d: r.d,
      l: r.l,
      gf: r.gf,
      ga: r.ga,
      pts: r.pts,
      form: [],
      zone: standingZoneOf(r.pos, comp.zones).zone,
    });
  }
  return {
    rows,
    currentMatchday: standings.currentMatchday,
    unknownTeams: unknownList(unknown),
  };
}

// ─── 경기 ────────────────────────────────────────────────────────────────

/** `/competitions/{code}/matches?season=` 응답 껍데기 — 경기 항목은 하나씩 검증한다 */
export const FdSeasonMatchesResponseSchema = z.object({
  filters: FiltersSchema,
  matches: z.array(z.unknown()),
});

/** 상태 매핑 결과 — known false면 모르는 상태(scheduled로 두고 로그) */
export function matchStatusOf(status: string): {
  status: MatchStatus;
  known: boolean;
} {
  switch (status) {
    case "FINISHED":
    case "AWARDED":
      return { status: "finished", known: true };
    case "SCHEDULED":
    case "TIMED":
      return { status: "scheduled", known: true };
    case "POSTPONED":
    case "SUSPENDED":
    case "CANCELLED":
      return { status: "postponed", known: true };
    default:
      return isInProgressStatus(status)
        ? { status: "scheduled", known: true }
        : { status: "scheduled", known: false };
  }
}

/** UCL 녹아웃 단계 → 라운드 코드(차전 번호 앞부분) */
const KNOCKOUT_ROUND_CODES: Readonly<Record<string, string>> = {
  PLAYOFFS: "ko-playoff",
  LAST_16: "ko-r16",
  QUARTER_FINALS: "ko-qf",
  SEMI_FINALS: "ko-sf",
  FINAL: "ko-final",
};

/** 단판 녹아웃 라운드(차전 번호를 붙이지 않는다) */
const SINGLE_LEG_ROUNDS: ReadonlySet<string> = new Set(["ko-final"]);

/** 라운드가 녹아웃인가 — 순위표 단계 라운드는 숫자 문자열이다(M2-12 자동 전환이 쓴다) */
export function isKnockoutRound(round: string): boolean {
  return round.startsWith("ko-");
}

/**
 * 킥오프가 확정이 아닌 경기 표시 근거(M2-02 — `Match.tbc`로 싣는다, 2026-10-30 사용자 결정 A안: 둘 다 임시):
 * - "date": SCHEDULED — 날짜만 정해졌고 시각은 00:00Z 자리값(라운드 대표 날짜 — 실제 요일도 바뀔 수 있다)
 * - "time": TIMED지만 라운드 전체가 같은 킥오프 하나(먼 라운드 기본 슬롯 — 예: PL 21~37라운드 토 15:00Z, M0-28 `placeholder-kickoff`).
 *   대회 마지막 라운드는 동시 킥오프가 규정이라 제외한다(PL 38·분데스 34·UCL 리그 페이즈 8).
 */
export type KickoffProvisional = "date" | "time";

/** 같은 킥오프로 채워진 라운드를 자리값으로 볼 최소 경기 수(소규모 연기 경기 묶음 오탐 방지) */
export const UNIFORM_ROUND_MIN_MATCHES = 3;

export interface MatchesSkipped {
  /** 형식이 틀린 항목·matchday 없는 순위표 단계 경기 */
  invalid: number;
  /** 다른 대회 코드 */
  otherComp: number;
  /** 팀 미정(녹아웃 대진 전 — homeTeam·awayTeam id null) */
  tbd: number;
  /** 대응표에 없는 팀이 낀 경기 */
  unknownTeam: number;
  /** 모르는 단계(예선 등) */
  unknownStage: number;
}

export interface MatchesConversion {
  /** 킥오프·id 순 */
  matches: Match[];
  /** 킥오프 미확정 경기(Match.id → 근거) */
  provisional: Map<string, KickoffProvisional>;
  skipped: MatchesSkipped;
  /** 모르는 상태 원문(서로 다른 값, 최대 5개 — 로그용)과 건수 */
  unknownStatuses: string[];
  unknownStatusCount: number;
  /** FINISHED·AWARDED인데 스코어를 쓸 수 없는 경기 수(score null로 둔다) */
  scoreMissing: number;
  /** 받은 시점에 진행 중이던 경기 수 — 0보다 크면 순위표가 진행 중 점수를 반영했다(M0-28) */
  inProgress: number;
  unknownTeams: UnknownFdTeam[];
}

interface Draft {
  match: Match;
  rawStatus: string;
  /** 순위표 단계 라운드면 matchday, 녹아웃이면 null */
  matchday: number | null;
  /** 녹아웃 라운드 코드(차전 전) — 순위표 단계면 null */
  knockout: string | null;
}

const UNKNOWN_STATUS_SAMPLE = 5;

/** 녹아웃 차전 번호를 붙인다 — 같은 라운드 코드·같은 두 팀(순서 무관) 묶음을 킥오프·id 순으로 */
function assignLegs(drafts: Draft[]): void {
  const groups = new Map<string, Draft[]>();
  for (const d of drafts) {
    if (d.knockout === null) continue;
    const [a, b] = [d.match.home, d.match.away].sort();
    const key = `${d.knockout}|${a}|${b}`;
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    list.sort(byKickoffThenId);
    list.forEach((d, index) => {
      const code = d.knockout!;
      d.match.round = SINGLE_LEG_ROUNDS.has(code)
        ? code
        : `${code}-${index + 1}`;
    });
  }
}

function fdNumber(id: string): number {
  return Number(id.slice(3));
}

function byKickoffThenId(a: Draft, b: Draft): number {
  return (
    Date.parse(a.match.kickoff) - Date.parse(b.match.kickoff) ||
    fdNumber(a.match.id) - fdNumber(b.match.id)
  );
}

/** 킥오프 미확정 판정(위 `KickoffProvisional` 규칙) */
function provisionalOf(
  drafts: readonly Draft[],
): Map<string, KickoffProvisional> {
  const out = new Map<string, KickoffProvisional>();
  for (const d of drafts) {
    if (d.rawStatus === "SCHEDULED") out.set(d.match.id, "date");
  }
  const rounds = new Map<number, Draft[]>();
  let lastMatchday = 0;
  for (const d of drafts) {
    if (d.matchday === null) continue;
    lastMatchday = Math.max(lastMatchday, d.matchday);
    const list = rounds.get(d.matchday) ?? [];
    list.push(d);
    rounds.set(d.matchday, list);
  }
  for (const [matchday, list] of rounds) {
    if (matchday === lastMatchday || list.length < UNIFORM_ROUND_MIN_MATCHES) {
      continue;
    }
    const allTimed = list.every(
      (d) => d.rawStatus === "TIMED" && d.match.status === "scheduled",
    );
    const kickoffs = new Set(list.map((d) => d.match.kickoff));
    if (!allTimed || kickoffs.size !== 1) continue;
    for (const d of list) {
      if (!out.has(d.match.id)) out.set(d.match.id, "time");
    }
  }
  return out;
}

/**
 * football-data `score` → `Match.score`. h·a는 승부차기 골 제외(M1-44 `toMatchScore` 규칙 그대로 — fullTime에서 penalties를 뺀다),
 * 연장(EXTRA_TIME)·승부차기(PENALTY_SHOOTOUT) 경기는 aet, 승부차기 경기는 pens를 붙인다. 정규 시간 종료는 키 생략.
 */
export function scoreOf(m: Pick<FdMatch, "score">): Match["score"] {
  const score = toMatchScore(m.score);
  if (!score) return null;
  const out: NonNullable<Match["score"]> = {
    h: score.ft.home,
    a: score.ft.away,
  };
  if (score.pens) out.pens = { h: score.pens.home, a: score.pens.away };
  if (score.duration !== "REGULAR") out.aet = true;
  return out;
}

/**
 * 시즌 경기 응답 원문 → `Match[]`(킥오프·id 순). 껍데기가 틀리거나 시즌이 설정과 다르면 던진다(그 조각만 이전 값 유지).
 * 항목 하나가 틀리면 그 경기만 건너뛴다(시즌 380경기 중 한 건 때문에 일정 전체를 잃지 않게).
 */
export function toCompetitionMatches(
  raw: unknown,
  comp: Pick<CompetitionConfig, "id" | "footballDataCode" | "season">,
  teams: FdTeamLookup,
): MatchesConversion {
  const parsed = FdSeasonMatchesResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new FootballDataError(
      "format",
      `football-data ${comp.footballDataCode} 시즌 경기 응답 형식이 다르다(matches 배열 없음)`,
    );
  }
  checkSeason("경기", comp, filterSeason(parsed.data.filters?.season));
  const skipped: MatchesSkipped = {
    invalid: 0,
    otherComp: 0,
    tbd: 0,
    unknownTeam: 0,
    unknownStage: 0,
  };
  const unknown = new Map<number, UnknownFdTeam>();
  const unknownStatuses = new Set<string>();
  let unknownStatusCount = 0;
  let scoreMissing = 0;
  let inProgress = 0;
  const drafts: Draft[] = [];
  for (const item of parsed.data.matches) {
    const result = FdMatchSchema.safeParse(item);
    if (!result.success) {
      skipped.invalid += 1;
      continue;
    }
    const m = result.data;
    if (m.competition.code !== comp.footballDataCode) {
      skipped.otherComp += 1;
      continue;
    }
    const stage = m.stage ?? null;
    let matchday: number | null = null;
    let knockout: string | null = null;
    if (affectsStandings(stage)) {
      matchday = m.matchday ?? null;
      if (matchday === null || matchday < 1) {
        skipped.invalid += 1;
        continue;
      }
    } else {
      knockout = (stage !== null && KNOCKOUT_ROUND_CODES[stage]) || null;
      if (knockout === null) {
        skipped.unknownStage += 1;
        continue;
      }
    }
    if (m.homeTeam.id === null || m.awayTeam.id === null) {
      skipped.tbd += 1;
      continue;
    }
    const home = teams.byFd.get(m.homeTeam.id);
    const away = teams.byFd.get(m.awayTeam.id);
    if (home === undefined)
      collectUnknown(unknown, m.homeTeam.id, m.homeTeam.name);
    if (away === undefined)
      collectUnknown(unknown, m.awayTeam.id, m.awayTeam.name);
    if (home === undefined || away === undefined) {
      skipped.unknownTeam += 1;
      continue;
    }
    const mapped = matchStatusOf(m.status);
    if (!mapped.known) {
      unknownStatusCount += 1;
      if (unknownStatuses.size < UNKNOWN_STATUS_SAMPLE)
        unknownStatuses.add(m.status);
    }
    if (isInProgressStatus(m.status)) inProgress += 1;
    let score: Match["score"] = null;
    if (mapped.status === "finished") {
      score = scoreOf(m);
      if (score === null) scoreMissing += 1;
    }
    drafts.push({
      match: {
        id: `fd-${m.id}`,
        comp: comp.id,
        round: matchday !== null ? String(matchday) : knockout!,
        kickoff: m.utcDate,
        home,
        away,
        score,
        status: mapped.status,
      },
      rawStatus: m.status,
      matchday,
      knockout,
    });
  }
  assignLegs(drafts);
  drafts.sort(byKickoffThenId);
  const provisional = provisionalOf(drafts);
  return {
    // 킥오프 미확정은 Match.tbc로 싣는다(2026-10-30 사용자 결정 A안). 확정 경기는 키 없음
    matches: drafts.map((d) =>
      provisional.has(d.match.id)
        ? { ...d.match, tbc: true as const }
        : d.match,
    ),
    provisional,
    skipped,
    unknownStatuses: [...unknownStatuses],
    unknownStatusCount,
    scoreMissing,
    inProgress,
    unknownTeams: unknownList(unknown),
  };
}

// ─── 득점 순위 ───────────────────────────────────────────────────────────

/** `/competitions/{code}/scorers` 응답 껍데기 — 항목은 하나씩 검증한다 */
export const FdScorersResponseSchema = z.object({
  filters: FiltersSchema,
  competition: z.object({ code: z.string() }),
  scorers: z.array(z.unknown()),
});

/** 득점 순위 1행 — 필요한 필드만(선수 생년월일·국적·팀 주소 등은 버린다) */
export const FdScorerEntrySchema = z.object({
  player: z.object({ id: z.number().int(), name: z.string().min(1) }),
  team: z.object({
    id: z.number().int().positive().nullable(),
    name: z.string().nullable().optional(),
  }),
  playedMatches: z.number().int().nonnegative().nullable().optional(),
  goals: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative().nullable().optional(),
  penalties: z.number().int().nonnegative().nullable().optional(),
});

export interface ScorersConversion {
  /** 골 내림차순(같은 골은 응답 순서) */
  scorers: Scorer[];
  /** 형식이 틀리거나 팀이 없는 항목 */
  invalid: number;
  /** 대응표에 없는 팀 소속이라 건너뛴 선수 수 */
  unknownTeam: number;
  unknownTeams: UnknownFdTeam[];
}

/**
 * 득점 순위 응답 원문 → `Scorer[]`. 도움·PK·출전 수가 null이면 null 그대로(0으로 바꾸지 않는다 — 미집계와 0을 구분할 수 없다).
 * 껍데기·대회·시즌이 틀리면 던진다(그 조각만 이전 값 유지).
 */
export function toCompetitionScorers(
  raw: unknown,
  comp: Pick<CompetitionConfig, "footballDataCode" | "season">,
  teams: FdTeamLookup,
): ScorersConversion {
  const parsed = FdScorersResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new FootballDataError(
      "format",
      `football-data ${comp.footballDataCode} 득점 순위 응답 형식이 다르다(scorers 배열 없음)`,
    );
  }
  if (parsed.data.competition.code !== comp.footballDataCode) {
    throw new FootballDataError(
      "format",
      `football-data 득점 순위 응답 대회가 다르다(요청 ${comp.footballDataCode}, 응답 ${parsed.data.competition.code})`,
    );
  }
  checkSeason("득점 순위", comp, filterSeason(parsed.data.filters?.season));
  const unknown = new Map<number, UnknownFdTeam>();
  const scorers: Scorer[] = [];
  let invalid = 0;
  let unknownTeam = 0;
  for (const item of parsed.data.scorers) {
    const entry = FdScorerEntrySchema.safeParse(item);
    if (!entry.success || entry.data.team.id === null) {
      invalid += 1;
      continue;
    }
    const s = entry.data;
    const teamId = s.team.id!;
    const slug = teams.byFd.get(teamId);
    if (slug === undefined) {
      collectUnknown(unknown, teamId, s.team.name);
      unknownTeam += 1;
      continue;
    }
    scorers.push({
      player: s.player.name.trim(),
      team: slug,
      goals: s.goals,
      assists: s.assists ?? null,
      penalties: s.penalties ?? null,
      played: s.playedMatches ?? null,
    });
  }
  // Array#sort는 안정 정렬 — 같은 골은 응답 순서를 지킨다
  scorers.sort((a, b) => b.goals - a.goals);
  return { scorers, invalid, unknownTeam, unknownTeams: unknownList(unknown) };
}
