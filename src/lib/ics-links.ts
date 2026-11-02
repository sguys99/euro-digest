/**
 * 화면의 .ics 버튼 노출 규칙 (PRD FR-59 · FR-83 · FR-115 · FR-123, plan M4-12 '버튼 연결')
 *
 * 순수 함수만. 파일은 빌드(scripts/lib/site-ics.ts — `buildSiteCalendars`)가 만들고, 화면은 **파일이 늘 있는 경우에만** 링크를 건다(404 링크 0):
 * - 팀별 `/calendar/{team}.ics` — 팀 페이지가 있는 팀(data/teams) 전부, 경기 0건이어도 빈 캘린더 → 팀 티켓 '다음 경기' 칸은 늘 건다.
 * - 경기별 `/calendar/match/{id}.ics` — 대회 데이터 `status === "scheduled"` 전부(임시 킥오프 포함) + 한국 선수 현황 `next` + 대표팀
 *   `status === "scheduled"`(`matchFileEvents`). 지금 시각과 무관하다.
 * 화면 규칙(이 파일): 경기 단위 버튼은 **예정 경기**에만 — 데이터 상태가 `scheduled`이고 화면 상태도 예정(킥오프 전 · 임시 킥오프)일 때.
 * 킥오프가 지난 결과 대기(`pending`) 경기는 파일이 있어도 캘린더에 넣을 일이 아니라 숨긴다. **킥오프 미정(tbc)은 건다** — 파일은 종일
 * `TENTATIVE` '(시각 미정)' 일정이라(site-ics 머리 주석) 시각을 지어내지 않고, 일정이 잡히면 같은 UID로 갱신된다(DECISIONS M4 '구현 중 결정').
 */
import type { CalendarFeed } from "@/lib/paths";

/** 경기별 .ics — 데이터 상태 `scheduled`인 경기만(그 밖은 파일이 없다) */
export function matchIcsFeed(match: {
  id: string;
  status: string;
}): CalendarFeed | null {
  return match.status === "scheduled"
    ? { kind: "match", matchId: match.id }
    : null;
}

/**
 * 화면에 예정으로 보이는 경기의 .ics — 화면 상태가 `scheduled`(킥오프 전 · 임시)이고 데이터 상태도 `scheduled`일 때만.
 * 오늘 밤 카드(`TonightCardView.state`)·대표팀 일정 행(`NationalMatchRowView.state`)·팀 일정(`TeamFixtureView.state`)이 같은 규칙을 쓴다.
 */
export function upcomingMatchIcsFeed(
  state: string,
  match: { id: string; status: string },
): CalendarFeed | null {
  return state === "scheduled" ? matchIcsFeed(match) : null;
}

/**
 * 대표팀 일정 행의 .ics — 행 상태 `scheduled`는 데이터 상태 `scheduled` + 킥오프 전이다(src/lib/national-team-view.ts `nationalMatchState`
 * — 지났으면 `pending`). 대표팀 `scheduled` 경기는 경기별 파일이 늘 있다.
 */
export function nationalIcsFeed(row: {
  id: string;
  state: string;
}): CalendarFeed | null {
  return row.state === "scheduled" ? { kind: "match", matchId: row.id } : null;
}

/** 선수 상세 다음 경기 줄의 .ics — 그 줄은 예정 경기(`state === "scheduled"`) · 선수 `next`뿐이라 늘 파일이 있다(src/lib/player-detail-view.ts `upcomingRows`) */
export function upcomingRowIcsFeed(row: { key: string }): CalendarFeed {
  return { kind: "match", matchId: row.key };
}

/** 팀 .ics — 팀 페이지가 있는 팀은 늘 파일이 있다 */
export function teamIcsFeed(team: string): CalendarFeed {
  return { kind: "team", team };
}
