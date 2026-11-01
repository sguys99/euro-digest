/**
 * 홈 "어젯밤 한국 선수" 화면 모델 (PRD FR-58 · §4.2 4번 '한국 선수 하이라이트', DESIGN §9.3 D2 "홈 위젯 (D2)", DECISIONS D2 §4 A · §5 #5,
 * plan M3-11)
 *
 * I/O 없는 순수 모듈 — 로더(src/lib/data/korean-players.ts `loadLastNight`)가 설정 · 현황 파일을 읽어 넘긴다.
 *
 * 규칙
 * - **창 = 오늘의 5줄과 같은 경기일**: 발행일(KST 호 날짜) − 1의 UTC 하루(브리핑 입력 창 — scripts/lib/brief-input.ts, 홈 5줄 부제 "(현지)
 *   경기 기준"과 같은 날 — src/lib/brief-view.ts). 그날 킥오프한 경기 로그가 있는 **기록이 연결된** 등록 선수만 싣는다(기록 연결 전 · 기타 리그
 *   제외 — 경기 기록이 없다). 한 명도 없으면 위젯을 숨긴다(빈 상태를 그리지 않는다).
 * - 행 = 선수 기준(결과 칸 = 소속팀 득점 먼저 "W 6-1 · 홈" — D64 ③). 출전 분 거터는 목록과 같은 숫자 상태 규칙(`appearanceOf` — status 우선).
 * - **순서**: 주간 MVP와 같은 점수(골×3 + 도움×2 + 출전 1 — FR-92) → 출전 시간 → 설정 순서. 시안(D2 혼합안 데이터)의 정렬 그대로.
 * - 출전 0명(모두 벤치 · 명단 제외 · 라인업 없음)이면 머리에 "출전 0명 · 명단 n명" 한 줄을 둔다(DESIGN §9.3 D2).
 */
import type { TeamLookup, TeamView } from "@/lib/competition-view";
import {
  appearanceOf,
  compMarkOf,
  opponentOf,
  resultOf,
  rosterStateOf,
  type AppearanceView,
  type CompMark,
  type OpponentView,
  type ResultView,
  type RosterCompetition,
} from "@/lib/korean-players-view";
import type { KoreanPlayer, KoreanPlayersDataFile } from "@/lib/schema/player";
import { shiftDate, utcDate } from "@/lib/time";

export interface LastNightInput {
  players: readonly KoreanPlayer[];
  data: KoreanPlayersDataFile | null;
  /** 최신 호 발행일(KST "YYYY-MM-DD") */
  issueDate: string;
  competitions: readonly RosterCompetition[];
  team: TeamLookup;
  teamNameKo: (en: string) => string | null;
  competitionNameKo: (en: string) => string | null;
}

export interface LastNightRowView {
  slug: string;
  nameKo: string;
  team: TeamView;
  kickoff: string;
  comp: CompMark;
  opponent: OpponentView;
  home: boolean;
  result: ResultView | null;
  goals: number;
  assists: number | null;
  appearance: AppearanceView;
}

export interface LastNightView {
  /** 경기일(UTC 날짜 = 발행일 − 1 — 유럽 현지 경기일) */
  matchDate: string;
  rows: LastNightRowView[];
  /** 출전(분 > 0)한 선수 수 */
  appeared: number;
}

/** 브리핑 창의 경기일 — 발행일 − 1(UTC 하루, 머리 주석) */
export function lastNightDate(issueDate: string): string {
  return shiftDate(issueDate, -1);
}

/** 점수 — 골×3 + 도움×2 + 출전 1(FR-92 주간 MVP와 같은 규칙) */
function scoreOf(r: LastNightRowView): number {
  return (
    r.goals * 3 + (r.assists ?? 0) * 2 + (r.appearance.tone === "on" ? 1 : 0)
  );
}

/** 위젯 모델 — 실을 선수가 없으면 null(위젯 숨김) */
export function lastNightView(input: LastNightInput): LastNightView | null {
  const matchDate = lastNightDate(input.issueDate);
  const comps = new Map(input.competitions.map((c) => [c.id, c]));
  const records = new Map((input.data?.players ?? []).map((r) => [r.slug, r]));
  const rows: Array<{ row: LastNightRowView; order: number }> = [];
  input.players.forEach((p, order) => {
    const record = records.get(p.slug) ?? null;
    if (rosterStateOf(p, record) !== "linked" || !record) return;
    const log = record.recent.find((l) => utcDate(l.kickoff) === matchDate);
    if (!log) return;
    rows.push({
      order,
      row: {
        slug: p.slug,
        nameKo: p.nameKo,
        team: input.team(p.team),
        kickoff: log.kickoff,
        comp: compMarkOf(
          log.comp,
          log.leagueRaw,
          comps,
          input.competitionNameKo,
        ),
        opponent: opponentOf(log.opponent, input.team, input.teamNameKo),
        home: log.home,
        result: resultOf(log),
        goals: log.goals,
        assists: log.assists,
        appearance: appearanceOf(log, record.provider === "fallback"),
      },
    });
  });
  if (rows.length === 0) return null;
  const minutes = (r: LastNightRowView) =>
    r.appearance.tone === "on" ? Number(r.appearance.text) : -1;
  rows.sort(
    (a, b) =>
      scoreOf(b.row) - scoreOf(a.row) ||
      minutes(b.row) - minutes(a.row) ||
      a.order - b.order,
  );
  return {
    matchDate,
    rows: rows.map((r) => r.row),
    appeared: rows.filter((r) => r.row.appearance.tone === "on").length,
  };
}
