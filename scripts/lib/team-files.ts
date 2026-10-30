/**
 * 팀 파일 생성기 `data/teams/<slug>.json` (M2-06·M2-07, PRD FR-50·FR-54·FR-55, §15 D27·D33·D63) — 순수 함수만 둔다.
 * 읽기·쓰기·API 호출은 scripts/build-teams.ts(진입점)가 하고 여기에는 값만 넘긴다.
 *
 * 팀 목록·대회: `configs/team-ids.json` 111팀 + `team-leagues.ts` `teamCompetitions`(comp·alsoIn). 이름 `configs/names.ko.json`
 * (팀 항목 — nameEn = 대표 영문 표기 `en[0]`), 색·약어 `configs/team-colors.json`(그대로 복사 — 약어 글자색은 화면이 빌드 때
 * `kitTextColor`로 계산, DESIGN §11.14). `koreanPlayers` = korean-players.json 활성 선수 중 소속 팀이 같은 선수(설정 순서).
 * `profile`(M4 주간 LLM)·`reading`은 다른 단계가 채우므로 이전 파일 값을 그대로 둔다(없으면 null·[]).
 *
 * 포메이션 (M2-07, FR-55·D27)
 *   경기 원장(`data/matches/`, D33)의 그 팀 경기 포메이션 최빈값 — 6개 대회 경기만(comp ≠ null — 한국 선수 소속팀만 있는 컵 경기는
 *   팀마다 범위가 달라 뺀다)·원장 시즌만·형식이 맞는 표기("4-2-3-1", 필드 합 10)만 센다. 원장은 집계 시작일(meta `since`) 이후다.
 *   **동률은 가장 최근 경기에 쓴 포메이션 우선**(D1 이월 — 우니온 베를린 1:1): 동률인 포메이션들의 마지막 사용 킥오프(같으면 경기
 *   id)가 늦은 쪽. `updated` = 센 경기 중 가장 늦은 킥오프(실행 시각이 아니라 데이터 시각 — 같은 원장이면 파일이 바뀌지 않는다).
 *   수동 보조 `configs/formations.json`은 원장 경기가 MIN_API_USES_OVER_MANUAL(3)경기 미만일 때 원장보다 앞선다(수집 초기 경기 수
 *   부족·데이터 누락 팀). 둘 다 없으면 null(화면 미표시).
 *
 * 팀시트 라인업 (D63 ② — 초안 스키마 `Team.lineup`)
 *   주 포메이션을 쓴 가장 최근 경기 1개의 선발 11·교체 명단(이름·등번호·포지션·grid만 — 출전 시간 등 선수 기록은 넣지 않는다).
 *   라인업은 원장에 없어(D33 ② 불변) API-Football 경기 단건 응답(`MatchDetail.lineups`)에서 뽑는다(`teamSheetsFromDetails`) —
 *   collect의 API-Football 단계(`AfStageResult.details`, M2-09에서 배선)와 초기 백필(build-teams.ts `--backfill`)이 같은 함수를 쓴다.
 *   후보 = 이전 팀 파일의 `lineup` + 이번에 받은 라인업 → 주 포메이션과 같은 것 중 가장 늦은 경기. 새 경기 1개는 그 경기 포메이션의
 *   사용 횟수만 올리므로 주 포메이션은 그 포메이션으로만 바뀔 수 있다 — 그래서 팀당 1경기분만 들고 있어도 포메이션별 저장이 필요 없다.
 *   이름은 API-Football 원문 고정(D63 ①), 등록 한국 선수만 `apiFootballId`로 매칭해 `korean` slug를 붙인다.
 *
 * 주요 선수 (M2-06, FR-54·D63 ①)
 *   football-data 득점 순위(`data/competitions/<comp>.json` `scorers`, 시즌 누적·대회별 상위 100명)에서 팀의 **대표 대회(comp)**
 *   득점자만 고른다 — 원장 자체 집계(집계 시작일 이후)와 섞으면 숫자 뜻이 달라져 섞지 않는다. 목록이 상한(100명)만큼 차 있으면
 *   마지막 골 수(최솟값) 선수들은 잘렸을 수 있어 뺀다(빠진 동률 선수가 도움으로 앞설 수 있다). 정렬: 골 ↓ → 도움 ↓(null은 모름 —
 *   같은 골 수의 숫자 뒤) → 이름(코드 포인트 순). 이름은 API 원문 그대로 두고 화면이 names.ko로 바꾼다(FR-24).
 */
import {
  FormationShapeSchema,
  TeamLineupSchema,
  TeamSchema,
  type CompId,
  type CompetitionFile,
  type FormationsFile,
  type KoreanPlayersFile,
  type LedgerMatch,
  type NamesKoFile,
  type Scorer,
  type Team,
  type TeamColorsFile,
  type TeamIdsFile,
  type TeamLineup,
  type TeamSheetPlayer,
} from "@/lib/schema";

import type { LineupPlayer, MatchDetail, Side } from "./match-data";
import {
  LEAGUE_IDS,
  isLeagueId,
  teamCompetitions,
  type TeamCompetitions,
} from "./team-leagues";

// ─── 상수 ────────────────────────────────────────────────────────────────

/** 주요 선수 상한(FR-54) — TeamSchema `topPlayers.max(3)` */
export const TOP_PLAYERS_LIMIT = 3;

/** football-data 득점 순위 요청 상한(M2-02 `limit=100`) — 목록이 이만큼 차 있으면 마지막 골 수는 잘렸을 수 있다 */
export const SCORERS_LIST_LIMIT = 100;

/** 원장 경기가 이 수 미만이면 수동 포메이션(configs/formations.json)이 앞선다(수집 초기 경기 수 부족) */
export const MIN_API_USES_OVER_MANUAL = 3;

// ─── 포메이션 ────────────────────────────────────────────────────────────

/** 원장에서 센 팀 경기 1개의 포메이션 사용 */
export interface FormationUse {
  /** 원장 경기 키 af-<id> */
  match: string;
  kickoff: string;
  shape: string;
  comp: CompId;
  side: Side;
  /** 상대 팀 slug — 대응표에 없으면 null */
  opponent: string | null;
}

/** 경기 키 af-<id>의 숫자(정렬 동률 깨기용) */
function matchNumber(key: string): number {
  const n = Number(key.slice(3));
  return Number.isFinite(n) ? n : 0;
}

/** 킥오프 → 경기 id 순 비교(앞이 이르면 음수) */
function compareUse(
  a: { kickoff: string; match: string },
  b: { kickoff: string; match: string },
): number {
  return (
    Date.parse(a.kickoff) - Date.parse(b.kickoff) ||
    matchNumber(a.match) - matchNumber(b.match)
  );
}

/** 포메이션 표기가 쓸 수 있는 형식인가("4-2-3-1", 줄 3~5개, 필드 합 10) */
export function isFormationShape(shape: string | null | undefined): boolean {
  return shape != null && FormationShapeSchema.safeParse(shape).success;
}

/**
 * 원장 경기 → 팀 slug별 포메이션 사용(킥오프·id 순). 6개 대회 경기만(comp ≠ null), `season`이 주어지면 그 시즌만, 형식이 맞는
 * 포메이션만 센다. API-Football 팀 id가 대응표에 없으면 그 쪽은 건너뛴다.
 */
export function formationUsesByTeam(
  matches: readonly LedgerMatch[],
  ctx: { afToSlug: ReadonlyMap<number, string>; season?: number | null },
): Map<string, FormationUse[]> {
  const uses = new Map<string, FormationUse[]>();
  for (const m of matches) {
    if (m.comp === null) continue;
    if (ctx.season != null && m.season !== null && m.season !== ctx.season)
      continue;
    for (const side of ["home", "away"] as const) {
      const team = m[side];
      const slug = ctx.afToSlug.get(team.id);
      const shape = team.formation?.trim() ?? null;
      if (slug === undefined || !isFormationShape(shape)) continue;
      const other = m[side === "home" ? "away" : "home"];
      const list = uses.get(slug) ?? [];
      list.push({
        match: m.id,
        kickoff: m.kickoff,
        shape: shape!,
        comp: m.comp,
        side,
        opponent: ctx.afToSlug.get(other.id) ?? null,
      });
      uses.set(slug, list);
    }
  }
  for (const list of uses.values()) list.sort(compareUse);
  return uses;
}

export interface MainFormation {
  shape: string;
  /** 그 포메이션을 쓴 경기 수 */
  count: number;
  /** 센 경기 전체 수 */
  total: number;
  /** 그 포메이션을 마지막으로 쓴 경기 */
  last: FormationUse;
  /** 센 경기 중 가장 늦은 경기 */
  latest: FormationUse;
}

/**
 * 최빈 포메이션 — 사용 횟수가 가장 많은 것, 동률이면 **가장 최근 경기에 쓴 포메이션**(마지막 사용 킥오프 → 경기 id가 늦은 쪽).
 * 사용이 없으면 null.
 */
export function mainFormation(
  uses: readonly FormationUse[],
): MainFormation | null {
  if (uses.length === 0) return null;
  const byShape = new Map<string, { count: number; last: FormationUse }>();
  let latest = uses[0]!;
  for (const use of uses) {
    if (compareUse(use, latest) > 0) latest = use;
    const entry = byShape.get(use.shape);
    if (entry === undefined) byShape.set(use.shape, { count: 1, last: use });
    else {
      entry.count += 1;
      if (compareUse(use, entry.last) > 0) entry.last = use;
    }
  }
  let best: { shape: string; count: number; last: FormationUse } | null = null;
  for (const [shape, entry] of byShape) {
    if (
      best === null ||
      entry.count > best.count ||
      (entry.count === best.count && compareUse(entry.last, best.last) > 0)
    ) {
      best = { shape, ...entry };
    }
  }
  return best && { ...best, total: uses.length, latest };
}

/**
 * Team.formation — 원장 최빈값(source "api"), 원장 경기가 MIN_API_USES_OVER_MANUAL 미만이고 수동 값이 있으면 수동(source "manual"),
 * 둘 다 없으면 null.
 */
export function resolveFormation(
  uses: readonly FormationUse[],
  manual: FormationsFile[string] | undefined,
): Team["formation"] {
  const main = mainFormation(uses);
  if (
    manual !== undefined &&
    (main === null || main.total < MIN_API_USES_OVER_MANUAL)
  ) {
    return { shape: manual.shape, source: "manual", updated: manual.updated };
  }
  if (main === null) return null;
  return { shape: main.shape, source: "api", updated: main.latest.kickoff };
}

// ─── 팀시트 라인업 ───────────────────────────────────────────────────────

/** 라인업을 팀시트로 쓰지 못한 이유(로그용) */
export type TeamSheetSkip =
  | "not-6-comp" // 6개 대회 밖 경기
  | "no-lineup" // 그 팀 라인업이 응답에 없다(커버리지 없는 대회 등)
  | "no-formation" // 포메이션이 없거나 형식이 다르다
  | "start-xi" // 선발이 11명이 아니다
  | "unknown-team" // 팀 id가 대응표에 없다
  | "unknown-opponent" // 상대 팀 id가 대응표에 없다
  | "invalid"; // 스키마 검증 실패(등번호 범위 등)

export interface TeamSheetCandidate {
  team: string;
  lineup: TeamLineup;
}

export interface TeamSheetExtract {
  sheets: TeamSheetCandidate[];
  skipped: Array<{ match: number; side: Side; reason: TeamSheetSkip }>;
}

export interface TeamSheetContext {
  /** API-Football 팀 id → slug(configs/team-ids.json) */
  afToSlug: ReadonlyMap<number, string>;
  /** API-Football 선수 id → 한국 선수 slug(korean-players.json `apiFootballId`) */
  koreanByAfId: ReadonlyMap<number, string>;
}

function toSheetPlayer(
  p: LineupPlayer,
  starter: boolean,
  koreanByAfId: ReadonlyMap<number, string>,
): TeamSheetPlayer {
  const korean = p.id === null ? undefined : koreanByAfId.get(p.id);
  return {
    name: p.name,
    number: p.number,
    pos: p.pos,
    // 교체 명단의 grid는 의미가 없다(응답은 null) — 선발만 둔다
    grid: starter ? p.grid : null,
    ...(korean !== undefined ? { korean } : {}),
  };
}

/** 경기 상세 1개 → 양 팀 팀시트 후보(6개 대회 경기·선발 11명·포메이션 형식이 맞는 쪽만) */
export function teamSheetsFromDetail(
  detail: MatchDetail,
  ctx: TeamSheetContext,
): TeamSheetExtract {
  const out: TeamSheetExtract = { sheets: [], skipped: [] };
  const skip = (side: Side, reason: TeamSheetSkip) =>
    out.skipped.push({ match: detail.matchId, side, reason });
  for (const side of ["home", "away"] as const) {
    if (detail.comp === null) {
      skip(side, "not-6-comp");
      continue;
    }
    const lineup = detail.lineups[side];
    if (lineup === null) {
      skip(side, "no-lineup");
      continue;
    }
    if (!isFormationShape(lineup.formation)) {
      skip(side, "no-formation");
      continue;
    }
    if (lineup.startXI.length !== 11) {
      skip(side, "start-xi");
      continue;
    }
    const team = ctx.afToSlug.get(detail[side].id);
    if (team === undefined) {
      skip(side, "unknown-team");
      continue;
    }
    const opponent = ctx.afToSlug.get(
      detail[side === "home" ? "away" : "home"].id,
    );
    if (opponent === undefined) {
      skip(side, "unknown-opponent");
      continue;
    }
    const parsed = TeamLineupSchema.safeParse({
      formation: lineup.formation,
      match: `af-${detail.matchId}`,
      kickoff: detail.kickoff,
      comp: detail.comp,
      side,
      opponent,
      startXI: lineup.startXI.map((p) =>
        toSheetPlayer(p, true, ctx.koreanByAfId),
      ),
      substitutes: lineup.substitutes.map((p) =>
        toSheetPlayer(p, false, ctx.koreanByAfId),
      ),
    });
    if (!parsed.success) {
      skip(side, "invalid");
      continue;
    }
    out.sheets.push({ team, lineup: parsed.data });
  }
  return out;
}

/** 경기 상세 목록 → 팀시트 후보 전체 (collect의 API-Football 단계 `details`·백필 응답) */
export function teamSheetsFromDetails(
  details: readonly MatchDetail[],
  ctx: TeamSheetContext,
): TeamSheetExtract {
  const out: TeamSheetExtract = { sheets: [], skipped: [] };
  for (const d of details) {
    const one = teamSheetsFromDetail(d, ctx);
    out.sheets.push(...one.sheets);
    out.skipped.push(...one.skipped);
  }
  return out;
}

/** 후보 중 포메이션이 같은 가장 늦은 경기의 라인업(없으면 null) */
export function pickLineup(
  formation: Team["formation"],
  candidates: readonly TeamLineup[],
): TeamLineup | null {
  if (formation === null) return null;
  let best: TeamLineup | null = null;
  for (const c of candidates) {
    if (c.formation !== formation.shape) continue;
    if (best === null || compareUse(c, best) > 0) best = c;
  }
  return best;
}

// ─── 주요 선수 ───────────────────────────────────────────────────────────

/** 도움 비교 — 큰 쪽이 앞, null(모름)은 숫자 뒤 */
function compareAssistsDesc(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

/** 이름 비교(코드 포인트 순 — 실행 환경 로캘과 무관하게 결정적) */
function compareName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 팀 내 득점·도움 상위 3명 — 득점 순위 목록(대회 1개)에서 그 팀 선수만. 정렬 골 ↓ → 도움 ↓(null 뒤) → 이름.
 * 목록이 `listLimit`만큼 차 있으면 마지막 골 수(최솟값) 선수는 잘렸을 수 있어 뺀다.
 */
export function topPlayersOf(
  slug: string,
  scorers: readonly Scorer[],
  listLimit: number = SCORERS_LIST_LIMIT,
): Team["topPlayers"] {
  const truncated = scorers.length >= listLimit;
  const floor = truncated
    ? Math.min(...scorers.map((s) => s.goals))
    : Number.NEGATIVE_INFINITY;
  return scorers
    .filter((s) => s.team === slug && s.goals > 0 && s.goals > floor)
    .sort(
      (a, b) =>
        b.goals - a.goals ||
        compareAssistsDesc(a.assists, b.assists) ||
        compareName(a.player, b.player),
    )
    .slice(0, TOP_PLAYERS_LIMIT)
    .map((s) => ({ name: s.player, goals: s.goals, assists: s.assists }));
}

// ─── 팀 파일 ─────────────────────────────────────────────────────────────

export interface TeamFilesInput {
  /** 만들 팀 slug(순서대로) — 보통 `allTeamSlugs()` */
  slugs: readonly string[];
  teamIds: TeamIdsFile;
  names: NamesKoFile;
  colors: TeamColorsFile;
  koreanPlayers: KoreanPlayersFile;
  /** configs/formations.json(없으면 {}) */
  formations: FormationsFile;
  /** 원장 경기(모든 달) */
  ledger: readonly LedgerMatch[];
  /** 원장 시즌(meta.season) — 없으면 시즌을 거르지 않는다 */
  season: number | null;
  /** 대회 파일(data/competitions) — 없는 대회는 주요 선수 [] */
  competitions: Partial<Record<CompId, CompetitionFile>>;
  /** 이전 팀 파일(slug → 값) — profile·reading·lineup을 이어받는다 */
  previous: ReadonlyMap<string, Team>;
  /** 이번에 받은 팀시트 후보(`teamSheetsFromDetails`) */
  sheets: readonly TeamSheetCandidate[];
  /** 팀 → 대회(테스트 주입용, 기본 teamCompetitions) */
  competitionsOf?: (slug: string) => TeamCompetitions | null;
}

export interface TeamFilesStats {
  teams: number;
  formation: { api: number; manual: number; none: number };
  lineup: number;
  topPlayers: number;
  koreanPlayers: number;
}

export interface TeamFilesResult {
  teams: Team[];
  /** 설정이 어긋나 만들지 못한 팀(이름·색·대회 없음) — 있으면 진입점이 실패로 끝난다 */
  problems: string[];
  stats: TeamFilesStats;
  /** 팀 slug → 센 포메이션 사용(백필 계획 입력) */
  uses: Map<string, FormationUse[]>;
}

/** 팀 항목(names.ko kind team) slug → 항목 */
function teamNameIndex(
  names: NamesKoFile,
): Map<string, { ko: string; en: string }> {
  const index = new Map<string, { ko: string; en: string }>();
  for (const e of names.entries) {
    if (e.kind === "team" && e.slug !== undefined && !index.has(e.slug)) {
      index.set(e.slug, { ko: e.ko, en: e.en[0]! });
    }
  }
  return index;
}

/** korean-players.json → API-Football 선수 id → slug(id가 있는 선수 전원) */
export function koreanByAfIdOf(
  players: KoreanPlayersFile,
): Map<number, string> {
  const index = new Map<number, string>();
  for (const p of players) {
    if (p.apiFootballId !== null) index.set(p.apiFootballId, p.slug);
  }
  return index;
}

/** team-ids.json → API-Football 팀 id → slug */
export function afToSlugOf(teamIds: TeamIdsFile): Map<number, string> {
  const index = new Map<number, string>();
  for (const [slug, entry] of Object.entries(teamIds)) {
    if (entry.af !== null) index.set(entry.af, slug);
  }
  return index;
}

/** 팀 파일 전체를 만든다(slugs 순서). 각 값은 TeamSchema로 검증한다 */
export function buildTeamFiles(input: TeamFilesInput): TeamFilesResult {
  const competitionsOf = input.competitionsOf ?? ((s) => teamCompetitions(s));
  const names = teamNameIndex(input.names);
  const afToSlug = afToSlugOf(input.teamIds);
  const uses = formationUsesByTeam(input.ledger, {
    afToSlug,
    season: input.season,
  });
  const sheetsByTeam = new Map<string, TeamLineup[]>();
  for (const s of input.sheets) {
    const list = sheetsByTeam.get(s.team) ?? [];
    list.push(s.lineup);
    sheetsByTeam.set(s.team, list);
  }

  const teams: Team[] = [];
  const problems: string[] = [];
  const stats: TeamFilesStats = {
    teams: 0,
    formation: { api: 0, manual: 0, none: 0 },
    lineup: 0,
    topPlayers: 0,
    koreanPlayers: 0,
  };

  for (const slug of input.slugs) {
    const name = names.get(slug);
    const color = input.colors[slug];
    const comps = competitionsOf(slug);
    if (!Object.hasOwn(input.teamIds, slug)) {
      problems.push(`${slug}: team-ids.json에 없음`);
      continue;
    }
    if (name === undefined) {
      problems.push(`${slug}: names.ko.json 팀 항목(slug) 없음`);
      continue;
    }
    if (color === undefined) {
      problems.push(`${slug}: team-colors.json 항목 없음`);
      continue;
    }
    if (comps === null) {
      problems.push(`${slug}: 6개 대회 팀 표(team-leagues.ts)에 없음`);
      continue;
    }
    const prev = input.previous.get(slug);
    const formation = resolveFormation(
      uses.get(slug) ?? [],
      input.formations[slug],
    );
    const candidates = [
      ...(prev?.lineup ? [prev.lineup] : []),
      ...(sheetsByTeam.get(slug) ?? []),
    ];
    const lineup = pickLineup(formation, candidates);
    const scorers = input.competitions[comps.comp]?.scorers ?? [];
    const team = TeamSchema.parse({
      slug,
      nameKo: name.ko,
      nameEn: name.en,
      short: color.short,
      comp: comps.comp,
      alsoIn: comps.alsoIn,
      colors: color.colors,
      formation,
      topPlayers: topPlayersOf(slug, scorers),
      profile: prev?.profile ?? null,
      koreanPlayers: input.koreanPlayers
        .filter((p) => p.active && p.team === slug)
        .map((p) => p.slug),
      reading: prev?.reading ?? [],
      lineup,
    });
    teams.push(team);
    stats.teams += 1;
    if (team.formation === null) stats.formation.none += 1;
    else stats.formation[team.formation.source] += 1;
    if (team.lineup !== null) stats.lineup += 1;
    if (team.topPlayers.length > 0) stats.topPlayers += 1;
    if (team.koreanPlayers.length > 0) stats.koreanPlayers += 1;
  }
  return { teams, problems, stats, uses };
}

/** 팀 파일 직렬화(2칸 들여쓰기 + 끝 줄바꿈 — data/ 공통) */
export function serializeTeamFile(team: Team): string {
  return `${JSON.stringify(team, null, 2)}\n`;
}

// ─── 라인업 백필 ─────────────────────────────────────────────────────────

/**
 * 백필 우선순위 — ① 활성 한국 선수 소속팀(설정 순서) ② 5대 리그 팀을 순위 숫자 오름차순(같은 순위는 리그 순서 EPL·라리가·세리에·
 * 분데스·리그1) ③ 나머지(순위표에 없는 리그 팀 → UCL만 뛰는 팀, slugs 순서).
 */
export function lineupBackfillPriority(input: {
  slugs: readonly string[];
  koreanPlayers: KoreanPlayersFile;
  competitions: Partial<Record<CompId, CompetitionFile>>;
  competitionsOf?: (slug: string) => TeamCompetitions | null;
}): string[] {
  const competitionsOf = input.competitionsOf ?? ((s) => teamCompetitions(s));
  const known = new Set(input.slugs);
  const order: string[] = [];
  const seen = new Set<string>();
  const push = (slug: string) => {
    if (known.has(slug) && !seen.has(slug)) {
      seen.add(slug);
      order.push(slug);
    }
  };
  for (const p of input.koreanPlayers) if (p.active) push(p.team);
  const ranked: Array<{ slug: string; pos: number; league: number }> = [];
  for (const slug of input.slugs) {
    const comp = competitionsOf(slug)?.comp;
    if (comp === undefined || !isLeagueId(comp)) continue;
    const row = input.competitions[comp]?.standings.find(
      (r) => r.team === slug,
    );
    if (row === undefined) continue;
    ranked.push({ slug, pos: row.pos, league: LEAGUE_IDS.indexOf(comp) });
  }
  ranked.sort((a, b) => a.pos - b.pos || a.league - b.league);
  for (const r of ranked) push(r.slug);
  for (const slug of input.slugs) {
    const comp = competitionsOf(slug)?.comp;
    if (comp !== undefined && isLeagueId(comp)) push(slug);
  }
  for (const slug of input.slugs) push(slug);
  return order;
}

export interface LineupBackfillTarget {
  /** API-Football 경기 id */
  matchId: number;
  /** 이 경기로 팀시트가 채워질 팀(우선순위 순) */
  teams: string[];
}

/**
 * 백필할 경기 — 원장 최빈 포메이션(source "api")을 쓴 그 팀의 가장 늦은 원장 경기가 지금 팀시트 경기와 다르면 대상. 우선순위 순으로
 * 경기를 고르고(`limit`개까지), 이미 고른 경기로 채워지는 팀(상대 팀)은 그 경기에 붙인다.
 * `exclude`(이미 받아 본 경기 id)는 다시 고르지 않는다 — 재조회 응답의 포메이션이 원장과 달라(API 쪽 사후 수정, 2026-10-30 실측
 * 80팀 중 2팀) 팀시트가 채워지지 않는 경기를 매일 다시 받지 않게(봇 백필 M2-09가 받아 본 id를 기억해 넘긴다).
 */
export function planLineupBackfill(input: {
  teams: readonly Team[];
  uses: ReadonlyMap<string, readonly FormationUse[]>;
  priority: readonly string[];
  limit: number;
  exclude?: ReadonlySet<number>;
}): { targets: LineupBackfillTarget[]; pending: string[] } {
  const bySlug = new Map(input.teams.map((t) => [t.slug, t]));
  const targets: LineupBackfillTarget[] = [];
  const byMatch = new Map<number, LineupBackfillTarget>();
  const pending: string[] = [];
  for (const slug of input.priority) {
    const team = bySlug.get(slug);
    if (team?.formation?.source !== "api") continue;
    const shape = team.formation.shape;
    const last = (input.uses.get(slug) ?? [])
      .filter((u) => u.shape === shape)
      .reduce<FormationUse | null>(
        (best, u) => (best === null || compareUse(u, best) > 0 ? u : best),
        null,
      );
    if (last === null || team.lineup?.match === last.match) continue;
    const matchId = matchNumber(last.match);
    if (input.exclude?.has(matchId)) continue;
    const existing = byMatch.get(matchId);
    if (existing !== undefined) {
      existing.teams.push(slug);
      continue;
    }
    if (targets.length >= input.limit) {
      pending.push(slug);
      continue;
    }
    const target = { matchId, teams: [slug] };
    targets.push(target);
    byMatch.set(matchId, target);
  }
  return { targets, pending };
}
