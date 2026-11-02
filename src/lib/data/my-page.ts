/**
 * 마이 팀 데이터 — `/my` 디렉터리 · 홈과 `/my`의 '내 팀 소식' 후보 (PRD FR-110~112, plan M4-08)
 *
 * 빌드 때(서버 컴포넌트 · build-feeds)만 쓴다 — node:fs·zod를 쓰는 로더를 부르므로 `"use client"` 파일에서 import하지 않는다.
 * 형식은 src/lib/my-view.ts.
 *
 * - **디렉터리**: 팔로우할 수 있는 팀 = 팀 페이지가 있는 팀(`data/teams` — 팔로우 버튼이 팀 화면에 있다), 선수 = 등록 한국 선수 전원(설정 순서).
 *   팀 부제 = 대표 대회 약칭 + 순위("분데스 1위" — 순위표에 없으면 약칭만), 선수 부제 = 소속팀 이름.
 * - **내 팀 소식 후보**: 최신 호 카드 중 걸린 팀(`teams` — 디렉터리에 있는 팀) · 선수(`players` — 등록 선수)가 하나라도 있는 카드, 게재 순
 *   (= 중요도 순). 화면은 후보를 모두 숨긴 채 싣고, 첫 페인트 전 스크립트 · 섬이 팔로우와 맞는 것만 앞에서부터 보인다
 *   (src/lib/my-news-dom.ts). 걸린 대상 쌍(키 · 이름)은 카드 태그 순서(팀 → 선수).
 */
import { loadAllCompetitionData } from "@/lib/data/competition-data";
import { loadTeamLookup } from "@/lib/data/competition-page";
import { loadCompetitionsConfig } from "@/lib/data/competitions";
import { loadCardLabels } from "@/lib/data/card-labels";
import { loadKoreanPlayersData } from "@/lib/data/korean-players";
import { loadKoreanPlayers } from "@/lib/data/team-page";
import { listTeamSlugs, loadTeam } from "@/lib/data/teams";
import { rosterStateOf } from "@/lib/korean-players-view";
import type { OnboardingData } from "@/lib/onboarding-steps";
import { buildOnboardingData } from "@/lib/onboarding-data";
import {
  followKey,
  type MyDirectory,
  type MyPlayerEntry,
  type MyTeamEntry,
} from "@/lib/my-view";
import { cardTags, type CardTagView } from "@/lib/news/feed-view";
import type { PlayerNewsItem } from "@/lib/player-detail-view";
import type { CompId } from "@/lib/schema/common";
import type { NewsFile } from "@/lib/schema/news";

let directoryCache: MyDirectory | undefined;

/** 디렉터리(빌드 한 번에 한 번 만든다) */
export function loadMyDirectory(): MyDirectory {
  if (directoryCache) return directoryCache;
  const lookup = loadTeamLookup();
  const configs = loadCompetitionsConfig();
  const all = loadAllCompetitionData();
  const teams: Record<string, MyTeamEntry> = {};
  for (const slug of listTeamSlugs()) {
    const team = loadTeam(slug);
    if (!team) continue;
    const view = lookup(slug);
    const short =
      configs.find((c) => c.id === team.comp)?.shortKo ?? team.comp;
    const pos =
      all
        .find((c) => c.comp === team.comp)
        ?.standings.find((r) => r.team === slug)?.pos ?? null;
    teams[slug] = {
      n: view.name,
      ...(view.latin ? { l: 1 as const } : {}),
      s: view.short,
      ...(view.colors ? { c: [view.colors[0], view.colors[1]] as const } : {}),
      u: pos === null ? short : `${short} ${pos}위`,
    };
  }
  const players: Record<string, MyPlayerEntry> = {};
  for (const p of loadKoreanPlayers()) {
    const team = lookup(p.team);
    players[p.slug] = {
      n: p.nameKo,
      t: team.name,
      ...(team.latin ? { tl: 1 as const } : {}),
    };
  }
  directoryCache = { teams, players };
  return directoryCache;
}

/** 내 팀 소식 후보 한 장 */
export interface MyNewsCandidate {
  item: PlayerNewsItem;
  /** 걸린 팔로우 대상 [키, 이름] — 카드 태그 순서(팀 → 선수) */
  pairs: Array<[string, string]>;
  tags: readonly CardTagView[];
}

/** 최신 호 → 내 팀 소식 후보(머리 주석 규칙) */
export function loadMyNewsCandidates(
  news: NewsFile | null,
  dir: MyDirectory = loadMyDirectory(),
): MyNewsCandidate[] {
  if (!news) return [];
  const labels = loadCardLabels();
  const own = (record: object, key: string) =>
    Object.prototype.hasOwnProperty.call(record, key);
  return news.cards.flatMap((card) => {
    const pairs: Array<[string, string]> = [];
    for (const slug of new Set(card.teams)) {
      if (own(dir.teams, slug))
        pairs.push([followKey("teams", slug), dir.teams[slug]!.n]);
    }
    for (const slug of new Set(card.players)) {
      if (own(dir.players, slug))
        pairs.push([followKey("players", slug), dir.players[slug]!.n]);
    }
    if (pairs.length === 0) return [];
    return [
      {
        item: { card, date: news.date },
        pairs,
        tags: cardTags(card, labels),
      },
    ];
  });
}

/**
 * 첫 방문 온보딩 자료(M4-09 — FR-113): 5대 리그 · 리그별 팀(현재 순위 순) · 등록 한국 선수. build-feeds가 `out/my/data/onboarding.json`으로 쓴다
 * (규칙 src/lib/onboarding-data.ts). 팀 · 선수 범위는 디렉터리와 같다(팔로우할 수 있는 것만).
 */
export function loadOnboardingData(
  dir: MyDirectory = loadMyDirectory(),
): OnboardingData {
  const all = loadAllCompetitionData();
  const teamComp = new Map<string, CompId>();
  for (const slug of Object.keys(dir.teams)) {
    const team = loadTeam(slug);
    if (team) teamComp.set(slug, team.comp);
  }
  const korean = loadKoreanPlayersData();
  const records = new Map((korean?.players ?? []).map((r) => [r.slug, r]));
  return buildOnboardingData({
    competitions: loadCompetitionsConfig(),
    teamComp,
    standings: new Map(
      all.map((c) => [c.comp, new Map(c.standings.map((r) => [r.team, r.pos]))]),
    ),
    directory: dir,
    players: loadKoreanPlayers().map((p) => ({
      slug: p.slug,
      position: p.position,
      team: p.team,
      active: p.active,
      comp: p.comp,
      state: rosterStateOf(p, records.get(p.slug) ?? null),
    })),
  });
}
