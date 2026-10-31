/**
 * 팀 화면 모델 — 티켓 헤더·팀시트·일정·결과·주요 선수·리그 맥락·관련 뉴스 (PRD FR-50~58, DESIGN §9.3 "D1 — 대회·팀 화면", plan M2-13)
 *
 * I/O 없는 순수 함수만 둔다(파일 읽기는 src/lib/data/team-page.ts, 그리기는 src/components/team/*). 지금 시각은 호출부가 넣는다(빌드 시각).
 * 시각 표시는 src/lib/time.ts만 쓴다(CLAUDE §8). 경기 상태·연장/승부차기·결과 판정은 대회 화면 모델(src/lib/competition-view.ts)과 같은
 * 함수를 쓴다 — 대회 페이지와 팀 페이지가 같은 경기를 다르게 적지 않게.
 *
 * 규칙(근거)
 * - **일정·결과**(FR-52): 6개 대회 데이터에서 이 팀이 뛰는 경기 전부(시즌 전체 — 같은 경기 id는 한 번), 킥오프 순. 라운드 표기는 리그 "{n}라운드",
 *   UCL 리그 페이즈 "{n}차전", 녹아웃은 대회 화면과 같은 "16강 1차전". 첫 화면은 지난 경기 최근 `recent`개 + 다가올 경기 `upcoming`개만 펼치고
 *   나머지는 앞뒤로 접는다(`fixtureWindow` — 화면은 `<details>`).
 * - **최근 폼**(FR-51 — 티켓 꼬리표 "전 대회"): 위 경기 중 종료 경기의 결과(승부차기는 무 — 대회 화면 `resultFor`) 최근 5개.
 * - **다음 경기**: 지금 이후 예정 경기(연기·결과 대기 제외, 임시 킥오프 포함) 중 가장 이른 것.
 * - **팀시트 피치**(FR-55, D63 ②): 선발 11명 모두 grid가 있을 때만 좌표를 만든다(아니면 null — 명단만). 행 = 골문 → 공격(1 = GK),
 *   열 1 = 왼쪽(API-Football grid — 혼합안 바이에른 2:1 데이비스 = 왼쪽). 세로 위치 `a`는 GK 91% → 최전방 13%를 줄 수로 등분, 가로 `c`는
 *   그 줄 인원 n명을 가운데 50% 기준 84/n% 간격으로 편다(혼합안 좌표와 같다).
 * - **리그 맥락**: 순위표에서 이 팀 앞뒤 `span`팀(양 끝이면 반대쪽으로 채워 늘 `2·span + 1`행).
 * - **주요 선수**(FR-54): `topPlayers`(대표 대회 득점 순위 — 시즌 누적, M2-06) 이름은 D63 ① 사전 정확 일치면 한글. 공동 순위는 골 수로.
 * - **관련 뉴스**(FR-57): 최근 30일(KST 발행일) 호의 카드 중 `teams`에 이 팀이 있는 것, 최신 호 먼저 · 호 안은 게재 순, 최대 `limit`장.
 */
import {
  formView,
  matchExtraText,
  matchStateOf,
  resultFor,
  roundKeyOf,
  type FormResult,
  type FormView,
  type MatchState,
  type TeamLookup,
  type TeamView,
} from "@/lib/competition-view";
import type { CompId } from "@/lib/schema/common";
import type { Match, StandingRow } from "@/lib/schema/competition";
import type { NewsCard } from "@/lib/schema/news";
import type { TeamSheetPlayer } from "@/lib/schema/team";
import { formatKst, parseUtcIso, shiftDate } from "@/lib/time";

// ─── 일정·결과 ───────────────────────────────────────────────────────────────

export interface TeamFixtureView {
  match: Match;
  comp: CompId;
  side: "home" | "away";
  opponent: TeamView;
  /** "10.25" */
  date: string;
  /** "토" */
  weekday: string;
  /** "9라운드" · "3차전" · "16강 1차전" */
  round: string;
  state: MatchState;
  /** 킥오프 KST "04:00" — `tbc`면 null("임시") */
  time: string | null;
  /** 이 팀 입장 결과(종료 경기만) */
  result: FormResult | null;
  /** 연장·승부차기 보조 문구 */
  extra: string | null;
}

/** 라운드 표기 — UCL 숫자 라운드(리그 페이즈)는 "{n}차전", 나머지는 대회 화면과 같다 */
export function fixtureRoundLabel(comp: CompId, round: string): string {
  if (comp === "UCL" && /^\d+$/.test(round)) return `${Number(round)}차전`;
  return roundKeyOf(round).label;
}

/** 대회 데이터 여러 개 → 이 팀의 경기(킥오프 · id 순, 같은 id 한 번) */
export function teamMatchesOf(
  matchLists: ReadonlyArray<readonly Match[]>,
  slug: string,
): Match[] {
  const seen = new Set<string>();
  const out: Match[] = [];
  for (const list of matchLists) {
    for (const m of list) {
      if ((m.home !== slug && m.away !== slug) || seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
  }
  return out.sort(
    (a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id),
  );
}

const WEEKDAY_RE = /\((.)\)$/;

export function teamFixtureViews(
  matches: readonly Match[],
  slug: string,
  team: TeamLookup,
  nowMs: number,
): TeamFixtureView[] {
  return matches.map((match) => {
    const side = match.home === slug ? "home" : "away";
    const dayShort = formatKst(match.kickoff, "dayShort");
    return {
      match,
      comp: match.comp,
      side,
      opponent: team(side === "home" ? match.away : match.home),
      date: formatKst(match.kickoff, "monthDay"),
      weekday: WEEKDAY_RE.exec(dayShort)?.[1] ?? "",
      round: fixtureRoundLabel(match.comp, match.round),
      state: matchStateOf(match, nowMs),
      time: match.tbc ? null : formatKst(match.kickoff, "time"),
      result: resultFor(match, slug),
      extra: matchExtraText(match),
    };
  });
}

/** 첫 화면에 펼칠 지난 경기·다가올 경기 수(일정·결과 — 3초 스캔, 나머지는 접는다) */
export const FIXTURES_RECENT = 4;
export const FIXTURES_UPCOMING = 4;

export interface FixtureWindow<T> {
  /** 접힌 앞쪽(오래된 경기) */
  earlier: T[];
  /** 펼친 구간 */
  shown: T[];
  /** 접힌 뒤쪽(먼 일정) */
  later: T[];
}

/**
 * 킥오프 순 경기 → 지난 경기(킥오프가 지금 이전) 최근 `recent`개 + 다가올 경기 `upcoming`개를 펼친다. 한쪽이 모자라면 다른 쪽으로 채우지 않는다
 * (지난 경기만 남은 시즌 끝·첫 경기 전은 그 쪽만 보인다).
 */
export function fixtureWindow<T extends { match: Match }>(
  rows: readonly T[],
  nowMs: number,
  recent: number = FIXTURES_RECENT,
  upcoming: number = FIXTURES_UPCOMING,
): FixtureWindow<T> {
  const past = rows.filter(
    (r) => parseUtcIso(r.match.kickoff).getTime() <= nowMs,
  ).length;
  const start = Math.max(0, past - recent);
  const end = Math.min(rows.length, past + upcoming);
  return {
    earlier: rows.slice(0, start),
    shown: rows.slice(start, end),
    later: rows.slice(end),
  };
}

/** 다음 경기 — 지금 이후 예정(scheduled, 임시 포함) 중 가장 이른 것 */
export function nextFixtureOf<T extends TeamFixtureView>(
  rows: readonly T[],
  nowMs: number,
): T | null {
  return (
    rows.find(
      (r) =>
        r.state === "scheduled" &&
        (r.match.tbc === true ||
          parseUtcIso(r.match.kickoff).getTime() > nowMs),
    ) ?? null
  );
}

/** 티켓 꼬리표 최근 경기 — 전 대회 종료 경기 최근 5개("최근 경기(전 대회) …" 읽는 이름) */
export function teamFormAll(rows: readonly TeamFixtureView[]): FormView {
  const results = rows.flatMap((r) => (r.result ? [r.result] : []));
  const view = formView(results, "전 대회");
  return {
    ...view,
    label: view.label.replace("최근 전 대회 경기", "최근 경기(전 대회)"),
  };
}

// ─── 팀시트 ─────────────────────────────────────────────────────────────────

/** 포지션 원문(G·D·M·F) → 표기 */
export const POS_LABEL: Readonly<
  Record<NonNullable<TeamSheetPlayer["pos"]>, string>
> = {
  G: "GK",
  D: "DF",
  M: "MF",
  F: "FW",
};

export interface PitchSpot {
  /** 행 위치 % — 골문(GK) 91 → 최전방 13 */
  a: number;
  /** 열 위치 % — 왼쪽 → 오른쪽, 가운데 50 */
  c: number;
  /** 같은 줄 이웃과의 간격 %(피치 폭 기준 — 84 / 그 줄 인원). 1023 이하 세로 피치에서 이름 칸 폭 상한(5명 줄은 70px 칸이 서로 겹친다 — M2-16) */
  w: number;
}

const PITCH_GK = 91;
const PITCH_TOP = 13;
const PITCH_SPREAD = 84;

function parseGrid(grid: string | null): [number, number] | null {
  if (!grid) return null;
  const [row, col] = grid.split(":").map(Number);
  return row && col ? [row, col] : null;
}

/** 선발 11명의 피치 좌표(머리 주석 규칙) — grid가 하나라도 없으면 null(피치 없이 명단만) */
export function pitchSpots(
  startXI: readonly TeamSheetPlayer[],
): PitchSpot[] | null {
  const grids = startXI.map((p) => parseGrid(p.grid));
  if (grids.length === 0 || grids.some((g) => g === null)) return null;
  const cells = grids as Array<[number, number]>;
  const rows = Math.max(...cells.map(([r]) => r));
  const perRow = new Map<number, number>();
  for (const [r, c] of cells) perRow.set(r, Math.max(perRow.get(r) ?? 0, c));
  const step = rows > 1 ? (PITCH_GK - PITCH_TOP) / (rows - 1) : 0;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return cells.map(([r, c]) => {
    const n = perRow.get(r) ?? 1;
    return {
      a: round1(PITCH_GK - (r - 1) * step),
      c: round1(50 + (c - (n + 1) / 2) * (PITCH_SPREAD / n)),
      w: round1(PITCH_SPREAD / n),
    };
  });
}

// ─── 리그 맥락 ──────────────────────────────────────────────────────────────

/** 순위표에서 이 팀 앞뒤 `span`팀(머리 주석 규칙). 팀이 순위표에 없으면 빈 배열 */
export function leagueContextRows(
  standings: readonly StandingRow[],
  slug: string,
  span = 2,
): StandingRow[] {
  const index = standings.findIndex((r) => r.team === slug);
  if (index < 0) return [];
  const size = Math.min(standings.length, span * 2 + 1);
  const start = Math.min(
    Math.max(0, index - span),
    Math.max(0, standings.length - size),
  );
  return standings.slice(start, start + size);
}

// ─── 주요 선수 ──────────────────────────────────────────────────────────────

export interface KeyPlayerView {
  /** 공동 순위(같은 골 = 같은 순위) */
  rank: number;
  name: string;
  latin: boolean;
  goals: number;
  assists: number | null;
}

/** 득점·도움 상위(배열 순서 = 골↓ → 도움↓ — M2-06) → 공동 순위 + 표시 이름 */
export function keyPlayerViews(
  players: ReadonlyArray<{
    name: string;
    goals: number;
    assists: number | null;
  }>,
  koreanName: (en: string) => string | null,
): KeyPlayerView[] {
  const out: KeyPlayerView[] = [];
  players.forEach((p, i) => {
    const prev = out.at(-1);
    const ko = koreanName(p.name);
    out.push({
      rank: prev && prev.goals === p.goals ? prev.rank : i + 1,
      name: ko ?? p.name,
      latin: ko === null,
      goals: p.goals,
      assists: p.assists,
    });
  });
  return out;
}

// ─── 관련 뉴스 ──────────────────────────────────────────────────────────────

/** 관련 뉴스 기간(일, 오늘 포함 — FR-57) · 최대 카드 수 */
export const RELATED_NEWS_DAYS = 30;
export const RELATED_NEWS_LIMIT = 8;

/** 기간의 첫 발행일(KST "YYYY-MM-DD") — 오늘 포함 `days`일 */
export function relatedNewsSince(
  todayKst: string,
  days: number = RELATED_NEWS_DAYS,
): string {
  return shiftDate(todayKst, -(days - 1));
}

export interface RelatedIssue<
  N extends { date: string; cards: readonly NewsCard[] },
> {
  news: N;
  /** 이 호에서 고른 카드 id(게재 순) */
  ids: string[];
}

/**
 * 호 목록 → 이 팀 카드(머리 주석 규칙). 호는 날짜 내림차순으로 보고, `since` 이전 호는 뺀다. 고른 카드가 없는 호는 결과에 없다.
 */
export function relatedIssues<
  N extends { date: string; cards: readonly NewsCard[] },
>(
  issues: readonly N[],
  slug: string,
  since: string,
  limit: number = RELATED_NEWS_LIMIT,
): RelatedIssue<N>[] {
  const out: RelatedIssue<N>[] = [];
  let left = limit;
  const sorted = [...issues]
    .filter((n) => n.date >= since)
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const news of sorted) {
    if (left <= 0) break;
    const ids = news.cards
      .filter((card) => card.teams.includes(slug))
      .slice(0, left)
      .map((card) => card.id);
    if (ids.length === 0) continue;
    left -= ids.length;
    out.push({ news, ids });
  }
  return out;
}
