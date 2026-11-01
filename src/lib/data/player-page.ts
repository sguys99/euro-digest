/**
 * 한국 선수 상세 데이터 — `/korean-players/[slug]/` 한 장을 그릴 값을 모은다 (PRD FR-62·FR-64·FR-65·FR-73, plan M3-10)
 *
 * 읽는 것: 한국 선수 설정(`configs/korean-players.json`) · 현황 파일(`data/players/korean.json` — 원장은 읽지 않는다, D33) · 대회 설정·데이터
 * (소속 리그 순위 · 소속팀 일정 · 경기 라운드) · 표기 사전·팀 배지 · 최근 30일 뉴스 호(삭제 요청 제외 — 팀 화면과 같은 캐시) · 대표팀 설정
 * (최신 소집 명단). 계산은 순수 화면 모델(src/lib/player-detail-view.ts). 빌드 때(서버 컴포넌트)만 쓴다 — node:fs·zod를 쓰므로 `"use client"`
 * 파일에서 import하지 않는다. 기준 시각은 빌드 시각(다음 경기 · 업데이트 지연 — 하루 1회 발행 빌드가 다시 굳힌다).
 */
import { dataSourceOf, type DataSourceView } from "@/lib/data-source";
import { loadAllCompetitionData } from "@/lib/data/competition-data";
import { loadTeamLookup } from "@/lib/data/competition-page";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import {
  KOREAN_PLAYERS_DATA_PATH,
  loadKoreanPlayersData,
  loadRosterView,
  nameLookup,
} from "@/lib/data/korean-players";
import { NAMES_KO_PATH } from "@/lib/data/names";
import { loadNationalTeamConfig } from "@/lib/data/national-team";
import { loadKoreanPlayers, recentNewsIssues } from "@/lib/data/team-page";
import type { RosterView } from "@/lib/korean-players-view";
import {
  nationalCallUpOf,
  playerDetailView,
  playerNews,
  transferTagOf,
  type NationalCallUpView,
  type PlayerDetailView,
  type PlayerNewsView,
  type TransferTagView,
} from "@/lib/player-detail-view";
import type { NewsFile } from "@/lib/schema/news";
import {
  fixtureRoundLabel,
  teamFixtureViews,
  teamMatchesOf,
} from "@/lib/team-view";

export interface PlayerPageData {
  view: PlayerDetailView;
  news: PlayerNewsView<NewsFile>;
  /** 티켓 꼬리표 이적설 — 코드가 이 선수 이적으로 판정한 카드가 없으면 null(기사 건수만) */
  transferTag: TransferTagView | null;
  /** 최신 소집 명단에 있으면 그 소집 — 없으면 null */
  callUp: NationalCallUpView | null;
  /** 1024 이상 목차(명단 — 최근 경기 출전 분) */
  roster: RosterView;
  /** 출처 줄 — 현황 파일 · 소속팀 대회 데이터 중 가장 오래된 갱신 */
  source: DataSourceView;
}

/** 정적 생성 대상 — 설정의 선수 전원(비활성 · 기록 연결 전 포함, 설정 순서) */
export function listKoreanPlayerSlugs(): string[] {
  return loadKoreanPlayers().map((p) => p.slug);
}

/** 선수 상세 한 장의 입력 — 설정에 없는 slug면 null(페이지가 notFound). `now`는 빌드 시각 */
export function loadPlayerPage(
  slug: string,
  now: Date,
  dataFile: string = KOREAN_PLAYERS_DATA_PATH,
  namesFile: string = NAMES_KO_PATH,
): PlayerPageData | null {
  const player = loadKoreanPlayers().find((p) => p.slug === slug);
  if (!player) return null;
  const nowMs = now.getTime();
  const data = loadKoreanPlayersData(dataFile);
  const configs = loadCompetitionsConfig();
  const all = loadAllCompetitionData();
  const team = loadTeamLookup();

  // 경기 id → 라운드 표기(6개 대회 데이터 — 같은 id는 첫 대회)
  const rounds = new Map<string, string>();
  for (const c of all) {
    for (const m of c.matches) {
      if (!rounds.has(m.id)) rounds.set(m.id, fixtureRoundLabel(m.comp, m.round));
    }
  }
  const league =
    player.comp === "OTHER"
      ? null
      : (all.find((c) => c.comp === player.comp) ?? null);
  const row = league?.standings.find((r) => r.team === player.team) ?? null;
  const played = all.filter((c) =>
    c.matches.some((m) => m.home === player.team || m.away === player.team),
  );
  const fixtures = teamFixtureViews(
    teamMatchesOf(
      played.map((c) => c.matches),
      player.team,
    ),
    player.team,
    team,
    nowMs,
  );

  const view = playerDetailView({
    player,
    data,
    competitions: configs.map((c) => ({
      id: c.id,
      short: c.shortKo,
      name: c.nameKo,
    })),
    team,
    teamNameKo: nameLookup("team", namesFile),
    competitionNameKo: nameLookup("competition", namesFile),
    roundOf: (id) => rounds.get(id) ?? null,
    standing: row ? { pos: row.pos, pts: row.pts } : null,
    fixtures,
    nowMs,
  });

  const { since, issues } = recentNewsIssues(now);
  const news = playerNews(issues, slug, since);
  return {
    view,
    news,
    transferTag: transferTagOf(news.transfer.items, slug, team),
    callUp: nationalCallUpOf(loadNationalTeamConfig(), slug),
    roster: loadRosterView(dataFile, namesFile),
    source: dataSourceOf(
      [data?.generatedAt, ...played.map((c) => c.updatedAt)],
      nowMs,
    ),
  };
}
