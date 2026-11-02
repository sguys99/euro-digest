/**
 * `/my` 팀 · 선수 자료 파일 만들기 — 순수 함수 (PRD FR-111, plan M4-08, 형식 src/lib/my-view.ts `MyEntityData`)
 *
 * build-feeds가 로더로 읽은 값을 넘기면 `out/my/data/{teams|players}/{slug}.json` 파일 목록을 돌려준다(쓰기는 호출부).
 * - **팀**(팀 페이지가 있는 팀마다): 6개 대회 데이터의 그 팀 경기(팀 화면과 같은 `teamFixtureViews`) 중
 *   다음 경기 = 지금 이후 예정(임시 킥오프 포함) 앞에서 `MY_TEAM_NEXT_LIMIT`개 — 입장권 · 일정 행 화면 모델(`fixtureFromTeam` — 선수 상세와 같은 함수),
 *   최근 결과 = 종료 경기 최근 `MY_RECENT_LIMIT`개(늦은 순) — 팀 기준 결과(승부차기는 무 — 대회 화면 `resultFor`, 기준 팀 득점 먼저 · 홈/원정).
 * - **선수**(등록 선수마다): 선수 상세 화면 모델의 다음 경기(`upcoming` — 컵 `next` 포함) · 최근 경기 로그(`log`) — 선수 기준 결과 + 골 · 도움.
 * - 크기를 줄이려고 화면이 쓰지 않는 값(팀 링크 대상 · 배지 밖 TeamView 필드)은 뺀다. 시각은 빌드 시각 기준(하루 1회 발행 빌드가 다시 굳힌다).
 */
import type { TeamLookup, TeamView } from "@/lib/competition-view";
import { resultFor } from "@/lib/competition-view";
import type { CompMark, RosterCompetition } from "@/lib/korean-players-view";
import {
  MY_DATA_VERSION,
  MY_RECENT_LIMIT,
  MY_TEAM_NEXT_LIMIT,
  type MyEntityData,
  type MyResultRowView,
} from "@/lib/my-view";
import { artifacts } from "@/lib/paths";
import {
  fixtureFromTeam,
  type FixtureRowView,
  type FixtureTeamView,
  type PlayerDetailView,
} from "@/lib/player-detail-view";
import type { CompId } from "@/lib/schema/common";
import type { Match } from "@/lib/schema/competition";
import {
  teamFixtureViews,
  teamMatchesOf,
  type TeamFixtureView,
} from "@/lib/team-view";
import { formatKst, parseUtcIso } from "@/lib/time";

export interface FollowDataInput {
  /** 팀 페이지가 있는 팀 slug */
  teams: readonly string[];
  /** 6개 대회 경기 목록 */
  matchLists: ReadonlyArray<readonly Match[]>;
  team: TeamLookup;
  competitions: readonly RosterCompetition[];
  /** 등록 선수의 상세 화면 모델(설정 순서) */
  players: ReadonlyArray<
    Pick<PlayerDetailView, "slug" | "nameKo" | "team" | "log" | "upcoming">
  >;
  nowMs: number;
}

export interface FollowDataFile {
  /** 사이트 경로(`/my/data/teams/arsenal.json`) */
  path: string;
  data: MyEntityData;
}

function badgeOf(t: Pick<TeamView, "name" | "short" | "colors">) {
  return { name: t.name, short: t.short, colors: t.colors };
}

/** 일정 한 팀 — 링크 대상 · 배지 밖 필드를 뺀다 */
function slimTeam(t: FixtureTeamView): FixtureTeamView {
  return { name: t.name, latin: t.latin, badge: badgeOf(t.badge), link: null };
}

function slimFixture(row: FixtureRowView): FixtureRowView {
  return { ...row, home: slimTeam(row.home), away: slimTeam(row.away) };
}

function compMark(
  comp: CompId,
  comps: ReadonlyMap<CompId, RosterCompetition>,
): CompMark {
  const c = comps.get(comp);
  return {
    kind: "comp",
    comp,
    short: c?.short ?? comp,
    name: c?.name ?? comp,
  };
}

/** 팀 기준 결과 한 줄(종료 경기 + 스코어가 있을 때만) */
function teamResultRow(
  f: TeamFixtureView,
  self: TeamView,
  comps: ReadonlyMap<CompId, RosterCompetition>,
): MyResultRowView | null {
  const score = f.match.score;
  const outcome = resultFor(f.match, self.slug);
  if (!score || !outcome) return null;
  const home = f.side === "home";
  return {
    key: f.match.id,
    kickoff: f.match.kickoff,
    date: formatKst(f.match.kickoff, "monthDay"),
    comp: compMark(f.comp, comps),
    team: {
      slug: self.slug,
      name: self.name,
      latin: self.latin,
      short: self.short,
      colors: self.colors,
    },
    opponent: {
      name: f.opponent.name,
      latin: f.opponent.latin,
      badge: badgeOf(f.opponent),
    },
    home,
    result: {
      outcome,
      for: home ? score.h : score.a,
      against: home ? score.a : score.h,
      pens: score.pens
        ? {
            for: home ? score.pens.h : score.pens.a,
            against: home ? score.pens.a : score.pens.h,
          }
        : null,
    },
    goals: 0,
    assists: null,
  };
}

/** 팀 하나의 자료 */
export function teamFollowData(
  slug: string,
  input: Pick<
    FollowDataInput,
    "matchLists" | "team" | "competitions" | "nowMs"
  >,
): MyEntityData {
  const comps = new Map(input.competitions.map((c) => [c.id, c]));
  const self = input.team(slug);
  const rows = teamFixtureViews(
    teamMatchesOf(input.matchLists, slug),
    slug,
    input.team,
    input.nowMs,
  );
  const next = rows
    .filter(
      (f) =>
        f.state === "scheduled" &&
        (f.match.tbc === true ||
          parseUtcIso(f.match.kickoff).getTime() > input.nowMs),
    )
    .slice(0, MY_TEAM_NEXT_LIMIT)
    .map((f) => slimFixture(fixtureFromTeam(f, self, comps)));
  const recent = rows
    .filter((f) => f.state === "finished")
    .flatMap((f) => {
      const row = teamResultRow(f, self, comps);
      return row ? [row] : [];
    })
    .slice(-MY_RECENT_LIMIT)
    .reverse();
  return { v: MY_DATA_VERSION, kind: "teams", slug, next, recent };
}

/** 선수 하나의 자료 */
export function playerFollowData(
  view: FollowDataInput["players"][number],
): MyEntityData {
  const t = view.team;
  const recent: MyResultRowView[] = [...view.log]
    .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
    .slice(0, MY_RECENT_LIMIT)
    .map((l) => ({
      key: l.key,
      kickoff: l.kickoff,
      date: formatKst(l.kickoff, "monthDay"),
      comp: l.comp,
      team: {
        slug: t.slug,
        name: t.name,
        latin: t.latin,
        short: t.short,
        colors: t.colors,
      },
      opponent: {
        name: l.opponent.name,
        latin: l.opponent.latin,
        badge: badgeOf(l.opponent.badge),
      },
      home: l.home,
      result: l.result,
      goals: l.goals,
      assists: l.assists,
      player: view.nameKo,
    }));
  return {
    v: MY_DATA_VERSION,
    kind: "players",
    slug: view.slug,
    next: view.upcoming.map(slimFixture),
    recent,
  };
}

/** 모든 자료 파일(팀 → 선수) */
export function buildFollowData(input: FollowDataInput): FollowDataFile[] {
  return [
    ...input.teams.map((slug) => ({
      path: artifacts.myData("teams", slug),
      data: teamFollowData(slug, input),
    })),
    ...input.players.map((view) => ({
      path: artifacts.myData("players", view.slug),
      data: playerFollowData(view),
    })),
  ];
}
