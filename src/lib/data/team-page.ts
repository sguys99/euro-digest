/**
 * 팀 페이지 데이터 — `/teams/[team]/` 한 장을 그릴 값을 모은다 (PRD FR-50~58, plan M2-13)
 *
 * 읽는 것: 팀 파일(`data/teams/{slug}.json` — 포메이션·팀시트·주요 선수·한국 선수), 대회 설정·데이터(6개 대회 — 순위·시즌 경기·득점 순위),
 * 표기 사전·팀 배지(`loadTeamLookup`), 한국 선수 설정(`configs/korean-players.json` — 한글 이름·포지션), 최근 30일 뉴스 호(삭제 요청 제외 —
 * 뉴스 로더). 계산은 순수 화면 모델(src/lib/team-view.ts)이 하고 이 모듈은 파일을 읽어 넘기기만 한다. 빌드 때(서버 컴포넌트)만 쓴다.
 */
import { loadAllCompetitionData } from "@/lib/data/competition-data";
import {
  loadPlayerNameLookup,
  loadTeamLookup,
} from "@/lib/data/competition-page";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { KOREAN_PLAYERS_PATH } from "@/lib/data/card-labels";
import { readConfigFile } from "@/lib/data/config-file";
import { listNewsDates, loadNewsIssue } from "@/lib/data/news";
import { loadTeam } from "@/lib/data/teams";
import type { TeamLookup, TeamView } from "@/lib/competition-view";
import type { CompetitionFile } from "@/lib/schema/competition";
import type { CompetitionConfig } from "@/lib/schema/configs";
import type { NewsFile } from "@/lib/schema/news";
import {
  KoreanPlayersFileSchema,
  type KoreanPlayer,
} from "@/lib/schema/player";
import type { Team } from "@/lib/schema/team";
import { kstDate } from "@/lib/time";
import { relatedIssues, relatedNewsSince, type RelatedIssue } from "@/lib/team-view";

export interface TeamPageData {
  team: Team;
  /** 이 팀 이름·배지 */
  self: TeamView;
  /** 대표 대회 설정(team.comp) — 설정에 없으면 null */
  config: CompetitionConfig | null;
  /** 대표 대회 데이터 — 없으면 null */
  data: CompetitionFile | null;
  /** 리그 맥락에 그릴 대회(대표 대회 + UCL 병행이면 UCL) — 데이터가 있고 순위표에 이 팀이 있는 것만 */
  contexts: Array<{ config: CompetitionConfig; data: CompetitionFile }>;
  /** 이 팀이 뛰는 대회의 데이터 전부(일정·결과·전 대회 폼) */
  competitions: CompetitionFile[];
  /** 대회 ID → 설정(평탄 탭 약칭·이름) */
  configs: readonly CompetitionConfig[];
  lookup: TeamLookup;
  playerName: (en: string) => string | null;
  /** 이 팀 소속 한국 선수(설정 순서 — team.koreanPlayers 기준) */
  korean: KoreanPlayer[];
  /** 한국 선수 slug → 설정(팀시트 한글 이름) */
  koreanBySlug: ReadonlyMap<string, KoreanPlayer>;
  /** 최근 30일 관련 뉴스(호별) */
  related: RelatedIssue<NewsFile>[];
}

const issueCache = new Map<string, NewsFile | null>();

function issueOf(date: string): NewsFile | null {
  if (!issueCache.has(date)) issueCache.set(date, loadNewsIssue(date));
  return issueCache.get(date) ?? null;
}

/** 한국 선수 설정 전체(카드 표시 로더와 같은 파일·같은 캐시 label) */
export function loadKoreanPlayers(
  file: string = KOREAN_PLAYERS_PATH,
): readonly KoreanPlayer[] {
  return readConfigFile(file, KoreanPlayersFileSchema, "한국 선수 설정", []);
}

/** 팀 페이지 한 장의 입력 — 팀 파일이 없으면 null(페이지가 notFound). `now`는 빌드 시각 */
export function loadTeamPage(slug: string, now: Date): TeamPageData | null {
  const team = loadTeam(slug);
  if (!team) return null;
  const configs = loadCompetitionsConfig();
  const all = loadAllCompetitionData();
  const lookup = loadTeamLookup();
  const config = configs.find((c) => c.id === team.comp) ?? null;
  const data = all.find((c) => c.comp === team.comp) ?? null;
  const comps = new Set([team.comp, ...team.alsoIn]);
  const competitions = all.filter(
    (c) =>
      comps.has(c.comp) ||
      c.matches.some((m) => m.home === slug || m.away === slug),
  );
  const contexts = [team.comp, ...team.alsoIn.filter((c) => c !== team.comp)]
    .flatMap((id) => {
      const cfg = configs.find((c) => c.id === id);
      const d = all.find((c) => c.comp === id);
      return cfg && d && d.standings.some((r) => r.team === slug)
        ? [{ config: cfg, data: d }]
        : [];
    });
  const players = loadKoreanPlayers();
  const koreanBySlug = new Map(players.map((p) => [p.slug, p]));
  const korean = team.koreanPlayers.flatMap((s) => {
    const p = koreanBySlug.get(s);
    return p ? [p] : [];
  });
  const since = relatedNewsSince(kstDate(now.toISOString()));
  const issues = listNewsDates()
    .filter((d) => d >= since)
    .flatMap((d) => {
      const news = issueOf(d);
      return news ? [news] : [];
    });
  return {
    team,
    self: lookup(slug),
    config,
    data,
    contexts,
    competitions,
    configs,
    lookup,
    playerName: loadPlayerNameLookup(),
    korean,
    koreanBySlug,
    related: relatedIssues(issues, slug, since),
  };
}
