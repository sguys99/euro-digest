/**
 * 대표팀 화면 데이터 — `/national-team/` 한 장과 홈 A매치 섹션의 입력을 모은다 (PRD FR-70~73, plan M3-13)
 *
 * 읽는 것: 대표팀 설정(`configs/national-team.json` — src/lib/data/national-team.ts) · 한국 선수 명단 화면 값(소집 선수의 이름 · 포지션 ·
 * 소속팀 배지 — src/lib/data/korean-players.ts `loadRosterView`) · 최근 30일 뉴스 호(삭제 요청 제외 — 팀 화면 · 선수 상세와 같은 캐시).
 * 계산은 순수 화면 모델(src/lib/national-team-view.ts · src/lib/national-team.ts). 빌드 때(서버 컴포넌트)만 쓴다.
 *
 * 기준 시각 = 빌드 시각(`now` — 테스트 · 견본은 주입한다). 정적 사이트라 A매치 기간 판정(홈 섹션 노출)도 빌드 시각의 KST 날짜로 굳는다 —
 * 봇이 매일 아침(여름 07:00 · 겨울 07:30 공개) 다시 빌드하므로 하루 단위 ±3일 규칙(FR-71)에는 충분하다(경계는 그날 아침 빌드부터 반영).
 */
import type { TeamView } from "@/lib/competition-view";
import { loadCardLabels } from "@/lib/data/card-labels";
import { loadRosterView } from "@/lib/data/korean-players";
import {
  loadNationalTeamConfig,
  loadNationalTeamToday,
} from "@/lib/data/national-team";
import { recentNewsIssues } from "@/lib/data/team-page";
import type { NationalWindow } from "@/lib/national-team";
import {
  HOME_NATIONAL_NEWS_LIMIT,
  koreaNationalNews,
  nationalMatchRows,
  nationalSourceLinks,
  nationalSquadView,
  type NationalMatchRowView,
  type NationalSourceLink,
  type NationalSquadPlayer,
  type NationalSquadView,
} from "@/lib/national-team-view";
import { cardTags, type CardTagView } from "@/lib/news/feed-view";
import type { PlayerNewsItem } from "@/lib/player-detail-view";

export interface NationalNewsView {
  items: PlayerNewsItem[];
  /** 최근 30일 전체 건수 */
  total: number;
}

export interface NationalPageData {
  /** 설정의 경기 전부(킥오프 순) */
  rows: NationalMatchRowView[];
  /** 최신 소집 명단 — 없으면 null */
  squad: NationalSquadView<TeamView> | null;
  /** 일정 · 결과 · 소집 명단 근거 링크 */
  sources: NationalSourceLink[];
  /** 대표팀 소식(한국) — 최근 30일 */
  news: NationalNewsView;
}

export interface NationalHomeData {
  /** 오늘(빌드 시각 KST)이 든 A매치 기간 */
  window: NationalWindow;
  /** 그 기간의 경기(킥오프 순) */
  rows: NationalMatchRowView[];
  /** 그 기간 경기를 뛰는 최신 소집 명단 — 없으면 null */
  squad: NationalSquadView<TeamView> | null;
  /** 대표팀 소식(한국) — 최신 3건 + 최근 30일 전체 건수 */
  news: NationalNewsView;
}

/** slug → 소집 선수 화면 값(등록 한국 선수 명단의 이름 · 포지션 · 소속팀). 명단에 없으면 null */
function squadPlayerLookup(): (
  slug: string,
) => NationalSquadPlayer<TeamView> | null {
  const rows = new Map(
    loadRosterView()
      .groups.flatMap((g) => g.rows)
      .map((r) => [r.slug, r]),
  );
  return (slug) => {
    const row = rows.get(slug);
    return row
      ? {
          slug,
          nameKo: row.nameKo,
          position: row.position,
          team: row.team,
        }
      : null;
  };
}

/** `/national-team/` 한 장 — 대표팀 설정이 없으면 일정 · 명단 · 근거 없이 소식만(페이지가 빈 구역을 숨긴다) */
export function loadNationalPage(now: Date): NationalPageData {
  const config = loadNationalTeamConfig();
  const { since, issues } = recentNewsIssues(now);
  const news = koreaNationalNews(issues, since);
  if (!config) return { rows: [], squad: null, sources: [], news };
  const nowMs = now.getTime();
  const rows = nationalMatchRows(config.matches, nowMs);
  const squad = nationalSquadView(config, squadPlayerLookup(), nowMs);
  const latest = squad
    ? (config.squads.find((s) => s.id === squad.id) ?? null)
    : null;
  return {
    rows,
    squad,
    sources: nationalSourceLinks(rows, latest),
    news,
  };
}

/**
 * 홈 A매치 섹션(FR-71) — 빌드 시각의 KST 날짜가 A매치 기간이면 그 기간의 경기 · 소집 명단 · 대표팀 소식, 아니면 null(섹션 숨김).
 * 소집 명단은 최신 명단이 이 기간의 경기를 뛸 때만 싣는다(지난 소집 명단을 이번 기간 명단처럼 보이지 않게).
 */
export function loadNationalHome(now: Date): NationalHomeData | null {
  const today = loadNationalTeamToday(now);
  if (!today.window) return null;
  const config = loadNationalTeamConfig();
  if (!config) return null;
  const nowMs = now.getTime();
  const window = today.window;
  const inWindow = new Set(window.matchIds);
  const squad = nationalSquadView(config, squadPlayerLookup(), nowMs);
  const { since, issues } = recentNewsIssues(now);
  return {
    window,
    rows: nationalMatchRows(today.matches, nowMs),
    squad:
      squad && squad.matches.some((m) => inWindow.has(m.id)) ? squad : null,
    news: koreaNationalNews(issues, since, HOME_NATIONAL_NEWS_LIMIT),
  };
}

/** 뉴스 행 태그(팀 → 선수, 한국 선수 굵게 — 뉴스 카드와 같은 규칙 `cardTags`) */
export function nationalNewsTags(): (
  item: PlayerNewsItem,
) => readonly CardTagView[] {
  const labels = loadCardLabels();
  return (item) => cardTags(item.card, labels);
}
