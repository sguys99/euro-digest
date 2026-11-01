/**
 * 한국 선수 상세 화면 모델 — `/korean-players/[slug]/` (PRD FR-62·FR-64·FR-65, DESIGN §9.3 "D2 — 한국 선수·이적·마이 팀 화면" 선수 티켓 ·
 * 시즌 기록 표 · 경기 로그 행 · 다음 경기 입장권, DECISIONS D2 §4·§6 #6~#8 · §8, plan M3-10)
 *
 * I/O 없는 순수 모듈 — 로더(src/lib/data/player-page.ts)가 설정·현황 파일·대회 데이터·뉴스 호를 읽어 넘긴다. 화면은 원장(`data/matches`)을
 * 읽지 않는다(D33). 목록(src/lib/korean-players-view.ts)과 같은 규칙(선수 상태 · 숫자 상태 · 출전 상태 · 결과 칸 · 대회 표식)을 쓴다.
 *
 * 규칙
 * - **시즌 출전 시간(N1)**: 대회별 행의 합(`seasonTotalOf`). 분 > 0 실선 · 0 윤곽 · null(폴백 — FR-65) 대시. 기록 연결 전 · 기타 리그는 대시 +
 *   그 상태 글자(지어낸 0을 쓰지 않는다).
 * - **시즌 기록 표**: 현황 파일의 대회별 행 그대로(파이프라인 순서 — 6개 대회 설정 순 → 컵은 원문 이름 순). 벤치 · 명단 제외 열은 없다 —
 *   시즌 누적 스키마에 그 값이 없다(로그 5경기로 세면 시즌 값이 아니다 — DECISIONS D2 §8).
 * - **최근 5경기**: 현황 파일 `recent`(최신순, 최대 5). 연결된 선수가 5경기보다 적으면 모자란 칸은 **집계 시작 전**(그 경기는 집계 시작일 전이라
 *   기록에 없다 — 파이프라인이 집계 뒤 경기를 최대 5개까지 늘 싣는다). 경기가 0이면 칸을 만들지 않는다(화면이 "경기 없음" 문장).
 * - **다음 경기**: 소속팀 대회 데이터의 예정 경기(빌드 시각 이후 — 임시 킥오프 포함) + 현황 파일 `next`(컵 등 대회 데이터 밖 경기 — 같은
 *   경기(킥오프 ±3시간 · 같은 상대)가 이미 있으면 뺀다). 킥오프 순 최대 3개 — 첫 경기는 입장권, 나머지는 일정 행. 경기 기준 행이라 홈 팀 먼저
 *   (D64 ③). 기타 리그(FR-64)는 비운다(갱신 중단).
 * - **관련 뉴스 · 이적설 · 대표팀 소식**: 뉴스 카드의 선수 태그(`players`)로 빌드 때 찾는다(최근 30일 호 — 팀 화면과 같은 기간). 같은 카드가 두
 *   구역에 나오지 않게 분류로 나눈다 — 이적(`cat` transfer) → 이적설, 대표팀(`cat` national) → 대표팀 소식, 나머지 → 관련 뉴스(한국어 ·
 *   영문 = 원제목 언어). 카드는 그대로 게시한다(원제목 · 출처명 · 원문 링크 — D23).
 */
import type { TeamLookup, TeamView } from "@/lib/competition-view";
import {
  appearanceOf,
  compMarkOf,
  opponentOf,
  resultOf,
  rosterStateOf,
  seasonTotalOf,
  sinceLabel,
  type AppearanceView,
  type CompMark,
  type NumberTone,
  type OpponentView,
  type ResultView,
  type RosterCompetition,
  type RosterState,
  type SeasonTotalView,
} from "@/lib/korean-players-view";
import type { NewsCard } from "@/lib/schema/news";
import type { NationalMatch, NationalTeamFile } from "@/lib/schema/configs";
import {
  playerSeasonKey,
  type KoreanPlayer,
  type KoreanPlayersDataFile,
  type PlayerNextMatch,
} from "@/lib/schema/player";
import type { TeamFixtureView } from "@/lib/team-view";
import {
  relatedIssuesBy,
  RELATED_NEWS_LIMIT,
  type RelatedIssue,
} from "@/lib/team-view";
import { formatKst, parseUtcIso } from "@/lib/time";

// ─── 입력 ───────────────────────────────────────────────────────────────────

export interface PlayerDetailInput {
  player: KoreanPlayer;
  /** `data/players/korean.json` — 없으면 null(기록 연결 전) */
  data: KoreanPlayersDataFile | null;
  competitions: readonly RosterCompetition[];
  team: TeamLookup;
  teamNameKo: (en: string) => string | null;
  competitionNameKo: (en: string) => string | null;
  /** 대회 데이터 경기 id → 라운드 표기("8라운드" · "4차전") — 대회 데이터 밖 경기(컵)는 null */
  roundOf: (matchId: string) => string | null;
  /** 소속 리그 순위표의 이 팀 행 — 없으면 null */
  standing: { pos: number; pts: number } | null;
  /** 소속팀 경기(대회 데이터 — 킥오프 순, `teamFixtureViews`) */
  fixtures: readonly TeamFixtureView[];
  /** 빌드 시각(ms) — 다음 경기 기준 */
  nowMs: number;
}

// ─── 출력 ───────────────────────────────────────────────────────────────────

/** 시즌 기록 표 한 행(대회별) */
export interface SeasonRowView {
  key: string;
  comp: CompMark;
  apps: number;
  minutes: number | null;
  goals: number;
  assists: number | null;
}

/** 최근 경기 로그 한 행 */
export interface LogRowView {
  key: string;
  kickoff: string;
  comp: CompMark;
  /** 라운드 표기(대회 데이터에 있는 경기만) */
  round: string | null;
  opponent: OpponentView;
  home: boolean;
  result: ResultView | null;
  goals: number;
  assists: number | null;
  appearance: AppearanceView;
}

/** 일정 한 팀(경기 기준 — 홈/원정) */
export interface FixtureTeamView {
  name: string;
  latin: boolean;
  badge: Pick<TeamView, "name" | "short" | "colors">;
  /** 팀 화면 링크 대상(팀 페이지가 있으면 `TeamLink`가 링크로) — 데이터 밖 팀은 null */
  link: TeamView | null;
}

/** 다음 경기 한 줄 */
export interface FixtureRowView {
  key: string;
  kickoff: string;
  /** KST "02:30" — 임시 킥오프면 null */
  time: string | null;
  /** "11.04 (수)" */
  day: string;
  comp: CompMark;
  round: string | null;
  home: FixtureTeamView;
  away: FixtureTeamView;
}

/** 선수 티켓 시즌 출전 시간(N1 — 숫자 상태 규칙) */
export interface SeasonMinutesView {
  text: string;
  tone: NumberTone;
  /** 숫자 뒤 "분"을 붙인다(값이 있을 때만) */
  unit: boolean;
  /** 화면 밖 읽기 */
  sr: string;
  /** 캡션 둘째 줄 — "10월 19일 이후 집계" · "기록 연결 전" · "기록 갱신 중단" */
  note: string;
}

export interface PlayerDetailView {
  slug: string;
  nameKo: string;
  nameEn: string;
  position: string;
  birthYear: number;
  /** 설정상 소속팀 */
  team: TeamView;
  state: RosterState;
  /** 소속 리그 표식(티켓 대회 줄) — 기타 리그면 "기타" */
  league: CompMark;
  standing: { pos: number; pts: number } | null;
  /** 이 선수 집계 시작일(UTC 날짜) — 연결 전이면 null */
  since: string | null;
  sinceLabel: string | null;
  minutes: SeasonMinutesView;
  total: SeasonTotalView | null;
  season: SeasonRowView[];
  log: LogRowView[];
  /** 집계 시작 전 칸 수(5 − 로그 수, 연결된 선수이고 로그가 1개 이상일 때만) */
  logGap: number;
  ucl: { apps: number; minutes: number | null } | null;
  upcoming: FixtureRowView[];
  /** 현황 파일 생성 시각 — 없으면 null */
  generatedAt: string | null;
}

// ─── 규칙 ───────────────────────────────────────────────────────────────────

/** 최근 경기 로그 칸 수(FR-62) */
export const LOG_SLOTS = 5;
/** 다음 경기 줄 수(입장권 1 + 일정 행 2) */
export const UPCOMING_LIMIT = 3;
/** 같은 경기로 보는 킥오프 차(대회 데이터 ↔ 현황 파일 `next`) */
const SAME_MATCH_MS = 3 * 60 * 60 * 1000;

function fixtureTeamOf(t: TeamView): FixtureTeamView {
  return { name: t.name, latin: t.latin, badge: t, link: t };
}

function fixtureFromTeam(
  f: TeamFixtureView,
  self: TeamView,
  comps: ReadonlyMap<string, RosterCompetition>,
): FixtureRowView {
  const c = comps.get(f.comp);
  const me = fixtureTeamOf(self);
  const them = fixtureTeamOf(f.opponent);
  return {
    key: f.match.id,
    kickoff: f.match.kickoff,
    time: f.time,
    day: formatKst(f.match.kickoff, "dayShort"),
    comp: {
      kind: "comp",
      comp: f.comp,
      short: c?.short ?? f.comp,
      name: c?.name ?? f.comp,
    },
    round: f.round || null,
    home: f.side === "home" ? me : them,
    away: f.side === "home" ? them : me,
  };
}

function fixtureFromNext(
  n: PlayerNextMatch,
  self: TeamView,
  input: Pick<
    PlayerDetailInput,
    "team" | "teamNameKo" | "competitionNameKo" | "roundOf"
  >,
  comps: ReadonlyMap<RosterCompetition["id"], RosterCompetition>,
): FixtureRowView {
  const o = opponentOf(n.opponent, input.team, input.teamNameKo);
  const them: FixtureTeamView = {
    name: o.name,
    latin: o.latin,
    badge: o.badge,
    link: n.opponent.slug ? input.team(n.opponent.slug) : null,
  };
  const me = fixtureTeamOf(self);
  return {
    key: n.matchId,
    kickoff: n.kickoff,
    time: formatKst(n.kickoff, "time"),
    day: formatKst(n.kickoff, "dayShort"),
    comp: compMarkOf(n.comp, n.leagueRaw, comps, input.competitionNameKo),
    round: n.comp === "OTHER" ? null : input.roundOf(n.matchId),
    home: n.home ? me : them,
    away: n.home ? them : me,
  };
}

/** 다음 경기 줄(머리 주석 규칙) */
export function upcomingRows(
  input: Pick<
    PlayerDetailInput,
    | "fixtures"
    | "nowMs"
    | "team"
    | "teamNameKo"
    | "competitionNameKo"
    | "roundOf"
    | "competitions"
  >,
  self: TeamView,
  next: PlayerNextMatch | null,
): FixtureRowView[] {
  const comps = new Map(input.competitions.map((c) => [c.id, c]));
  const ms = (iso: string) => parseUtcIso(iso).getTime();
  const fromTeam = input.fixtures.filter(
    (f) =>
      f.state === "scheduled" &&
      (f.match.tbc === true || ms(f.match.kickoff) > input.nowMs),
  );
  const rows = fromTeam.map((f) => fixtureFromTeam(f, self, comps));
  if (next && ms(next.kickoff) > input.nowMs) {
    const dup = fromTeam.some(
      (f) =>
        f.match.id === next.matchId ||
        (Math.abs(ms(f.match.kickoff) - ms(next.kickoff)) <= SAME_MATCH_MS &&
          next.opponent.slug !== null &&
          f.opponent.slug === next.opponent.slug),
    );
    if (!dup) rows.push(fixtureFromNext(next, self, input, comps));
  }
  return rows
    .sort((a, b) => ms(a.kickoff) - ms(b.kickoff) || (a.key < b.key ? -1 : 1))
    .slice(0, UPCOMING_LIMIT);
}

/** 티켓 시즌 출전 시간(N1) */
export function seasonMinutesOf(
  state: RosterState,
  total: SeasonTotalView | null,
  since: string | null,
): SeasonMinutesView {
  const dash = (note: string, sr: string): SeasonMinutesView => ({
    text: "–",
    tone: "null",
    unit: false,
    sr,
    note,
  });
  if (state === "other") return dash("기록 갱신 중단", "기록 갱신 중단");
  if (state === "not-linked") return dash("기록 연결 전", "기록 연결 전");
  const note = since ? sinceLabel(since) : "집계 기간 없음";
  if (!total) return { ...dash(note, "집계된 경기 없음"), note };
  if (total.minutes === null) return dash(note, "출전 시간 기록 없음");
  return {
    text: String(total.minutes),
    tone: total.minutes > 0 ? "on" : "zero",
    unit: true,
    sr: `시즌 출전 시간 ${total.minutes}분`,
    note,
  };
}

/** 상세 화면 모델(머리 주석 규칙) */
export function playerDetailView(input: PlayerDetailInput): PlayerDetailView {
  const { player, data } = input;
  const comps = new Map(input.competitions.map((c) => [c.id, c]));
  const record = data?.players.find((r) => r.slug === player.slug) ?? null;
  const state = rosterStateOf(player, record);
  const fallback = record?.provider === "fallback";
  const linked = state === "linked";
  const self = input.team(player.team);
  const since = linked ? (record?.since ?? null) : null;

  const season: SeasonRowView[] = linked
    ? (record?.season ?? []).map((s) => ({
        key: playerSeasonKey(s),
        comp: compMarkOf(s.comp, s.leagueRaw, comps, input.competitionNameKo),
        apps: s.apps,
        minutes: s.minutes,
        goals: s.goals,
        assists: s.assists,
      }))
    : [];
  const total = linked ? seasonTotalOf(record?.season ?? []) : null;
  const log: LogRowView[] = linked
    ? (record?.recent ?? []).map((l) => ({
        key: l.matchId,
        kickoff: l.kickoff,
        comp: compMarkOf(l.comp, l.leagueRaw, comps, input.competitionNameKo),
        round: l.comp === "OTHER" ? null : input.roundOf(l.matchId),
        opponent: opponentOf(l.opponent, input.team, input.teamNameKo),
        home: l.home,
        result: resultOf(l),
        goals: l.goals,
        assists: l.assists,
        appearance: appearanceOf(l, fallback),
      }))
    : [];
  const uclRow = linked
    ? (record?.season.find((s) => s.comp === "UCL") ?? null)
    : null;
  const league: CompMark =
    player.comp === "OTHER"
      ? { kind: "other", name: "5대 리그 밖", latin: false }
      : {
          kind: "comp",
          comp: player.comp,
          short: comps.get(player.comp)?.short ?? player.comp,
          name: comps.get(player.comp)?.name ?? player.comp,
        };

  return {
    slug: player.slug,
    nameKo: player.nameKo,
    nameEn: player.nameEn,
    position: player.position,
    birthYear: player.birthYear,
    team: self,
    state,
    league,
    standing: state === "other" ? null : input.standing,
    since,
    sinceLabel: since ? sinceLabel(since) : null,
    minutes: seasonMinutesOf(state, total, since),
    total,
    season,
    log,
    logGap: linked && log.length > 0 ? Math.max(0, LOG_SLOTS - log.length) : 0,
    ucl: uclRow ? { apps: uclRow.apps, minutes: uclRow.minutes } : null,
    upcoming:
      state === "other" ? [] : upcomingRows(input, self, record?.next ?? null),
    generatedAt: data?.generatedAt ?? null,
  };
}

// ─── 뉴스(관련 뉴스 · 이적설 · 대표팀 소식) ─────────────────────────────────

/** 이적설 · 대표팀 소식 줄 수 */
export const SIDE_NEWS_LIMIT = 5;

export type PlayerNewsKind =
  "related-ko" | "related-en" | "transfer" | "national";

/** 카드 → 상세 화면 구역(머리 주석 — 분류로 나눠 같은 카드가 두 구역에 나오지 않게) */
export function playerNewsKind(
  card: Pick<NewsCard, "cat" | "lang">,
): PlayerNewsKind {
  if (card.cat === "transfer") return "transfer";
  if (card.cat === "national") return "national";
  return card.lang === "ko" ? "related-ko" : "related-en";
}

/** 구역 하나 — 호별 묶음(게재 번호 · 공유 · 오류 신고가 그 호를 쓴다) + 기간 안 전체 건수 */
export interface PlayerNewsGroup<
  N extends { date: string; cards: readonly NewsCard[] },
> {
  issues: RelatedIssue<N>[];
  /** 기간 안 전체 건수(싣는 것은 최신 `limit`건) */
  total: number;
}

/** 이적설 · 대표팀 소식 줄 — 카드 + 그 호 날짜 */
export interface PlayerNewsItem {
  card: NewsCard;
  date: string;
}

export interface PlayerNewsView<
  N extends { date: string; cards: readonly NewsCard[] },
> {
  ko: PlayerNewsGroup<N>;
  en: PlayerNewsGroup<N>;
  transfer: { items: PlayerNewsItem[]; total: number };
  national: { items: PlayerNewsItem[]; total: number };
}

/** 대표 출처 시각(최신순 정렬 기준) */
function leadAt(card: NewsCard): number {
  return parseUtcIso(card.src[0]!.at).getTime();
}

/**
 * 뉴스 호 목록 → 이 선수 구역별 카드. 관련 뉴스는 호별 묶음(최신 호부터, 호 안은 게재 순 — 팀 화면 관련 뉴스와 같다) 최신 `related`건,
 * 이적설 · 대표팀 소식은 대표 출처 시각 최신순 `side`건. 같은 카드 ID는 한 번(최신 호의 것).
 */
export function playerNews<
  N extends { date: string; cards: readonly NewsCard[] },
>(
  issues: readonly N[],
  slug: string,
  since: string,
  limits: { related?: number; side?: number } = {},
): PlayerNewsView<N> {
  const related = limits.related ?? RELATED_NEWS_LIMIT;
  const side = limits.side ?? SIDE_NEWS_LIMIT;
  const sorted = [...issues]
    .filter((n) => n.date >= since)
    .sort((a, b) => b.date.localeCompare(a.date));
  const first = new Map<string, string>(); // 카드 ID → 처음(최신 호) 본 호 날짜
  for (const news of sorted) {
    for (const card of news.cards) {
      if (card.players.includes(slug) && !first.has(card.id)) {
        first.set(card.id, news.date);
      }
    }
  }
  const mine =
    (kind: PlayerNewsKind) =>
    (card: NewsCard, date: string): boolean =>
      card.players.includes(slug) &&
      first.get(card.id) === date &&
      playerNewsKind(card) === kind;
  const group = (kind: PlayerNewsKind): PlayerNewsGroup<N> => {
    const match = mine(kind);
    let total = 0;
    for (const news of sorted) {
      total += news.cards.filter((c) => match(c, news.date)).length;
    }
    return {
      issues: relatedIssuesBy(sorted, match, since, related),
      total,
    };
  };
  const items = (kind: PlayerNewsKind) => {
    const match = mine(kind);
    const all = sorted
      .flatMap((news) =>
        news.cards
          .filter((c) => match(c, news.date))
          .map((card) => ({ card, date: news.date })),
      )
      .sort((a, b) => leadAt(b.card) - leadAt(a.card));
    return { items: all.slice(0, side), total: all.length };
  };
  return {
    ko: group("related-ko"),
    en: group("related-en"),
    transfer: items("transfer"),
    national: items("national"),
  };
}

/** 티켓 꼬리표 이적설 — 코드가 이 선수의 이적으로 판정한 가장 최근 카드(`transfer.player` = 이 선수)의 단계 · Tier · 행선지 */
export interface TransferTagView {
  status: NonNullable<NewsCard["transfer"]>["status"];
  tier: NonNullable<NewsCard["transfer"]>["tier"];
  /** 행선지 팀(카드 `transfer.to` slug — 없으면 null) */
  to: TeamView | null;
}

export function transferTagOf(
  items: readonly PlayerNewsItem[],
  slug: string,
  team: TeamLookup,
): TransferTagView | null {
  for (const { card } of items) {
    const t = card.transfer;
    if (!t || t.player !== slug) continue;
    return {
      status: t.status,
      tier: t.tier,
      to: t.to ? team(t.to) : null,
    };
  }
  return null;
}

// ─── 대표팀 소집(FR-73) ─────────────────────────────────────────────────────

export interface NationalCallUpView {
  /** 소집 명단 id("2026-11") */
  id: string;
  /** "11월 소집" */
  label: string;
  announcedAt: string;
  /** 그 소집의 경기(일정 순) — 설정에 없는 id는 뺀다 */
  matches: NationalMatch[];
}

/** 가장 최근에 발표된 소집 명단에 이 선수가 있으면 그 소집(없으면 null — 지난 소집 명단은 보지 않는다) */
export function nationalCallUpOf(
  config: Pick<NationalTeamFile, "squads" | "matches"> | null,
  slug: string,
): NationalCallUpView | null {
  if (!config || config.squads.length === 0) return null;
  const latest = [...config.squads].sort(
    (a, b) =>
      parseUtcIso(b.announcedAt).getTime() -
      parseUtcIso(a.announcedAt).getTime(),
  )[0]!;
  if (!latest.playerSlugs.includes(slug)) return null;
  const byId = new Map(config.matches.map((m) => [m.id, m]));
  const matches = latest.matchIds
    .map((id) => byId.get(id))
    .filter((m): m is NationalMatch => m !== undefined);
  const month = /^\d{4}-(\d{2})$/.exec(latest.id)?.[1];
  const label = month
    ? `${Number(month)}월 소집`
    : `${formatKst(latest.announcedAt, "monthDay")} 발표 소집`;
  return { id: latest.id, label, announcedAt: latest.announcedAt, matches };
}
