/**
 * 경기 데이터 내부 형식 + 프로바이더 단계 격리 (M1-44 → M1-48·M1-19·M2-02).
 *
 * 외부 API 응답은 어댑터(`scripts/lib/providers/*`)가 이 파일의 형식으로 바꾼다. 브리핑 입력·대회 페이지·`data/`는
 * football-data·API-Football의 키 이름을 모른다(CLAUDE.md §6.4).
 *
 * 스코어 규칙 — 두 API는 승부차기 점수를 두는 곳이 반대다(fixtures/football/README.md "승부차기 점수 위치가 반대").
 *   football-data: `score.fullTime`에 승부차기 골이 **들어가고** `penalties`가 따로 붙는다.
 *   API-Football: `goals`·`score.fulltime`에 승부차기 골이 **들어가지 않고** `score.penalty`에 따로 둔다.
 *   → 내부 형식은 API-Football 쪽으로 맞춘다: `ft` = 정규시간 + 연장(승부차기 제외), 승부차기는 `pens`.
 *     두 API의 같은 경기가 같은 `ft`를 갖게 되어 짝짓기(scripts/lib/team-ids.ts)가 스코어로 비교할 수 있다.
 *
 * 프로바이더 단계: 호스트가 달라(분당 한도가 따로) 병렬로 돌리고, 한 프로바이더의 실패가 다른 쪽을 멈추지 않게
 * `isolateProvider`로 감싼다(던지지 않고 결과를 돌려준다).
 *
 * 경기 상세(`MatchDetail`, M1-48): API-Football 경기 단건 응답(`/fixtures?id=`)을 어댑터가 바꾼 형식 — 득점(events)·라인업
 * (포메이션·선발·교체 명단·출전 시간). 원장(data/matches, M1-48b)·브리핑 득점자(M1-19)·포메이션(M2-07)·한국 선수 기록(M3-02)이
 * 이 형식만 읽는다. 전 선수 출전 시간은 메모리에서만 쓰고 저장하지 않는다(D33 ② — 원장은 득점·도움·포메이션 + 등록 한국 선수 행).
 */
import type { CompId } from "@/lib/schema";

// ─── 스코어·팀 ───────────────────────────────────────────────────────────

/** 홈-원정 점수 */
export interface Score {
  home: number;
  away: number;
}

/**
 * 경기 연결(D37)이 후보 수를 셀 때 쓰는 경기 칸 — 대회·킥오프·최종 스코어만. 스코어를 모르면(미종료·연기·중단·점수 없음) ft null —
 * 그 경기가 같은 칸의 진짜 짝일 수 있어 자동 연결을 막는다(scripts/lib/team-ids.ts `linkMatchDetails`).
 */
export interface MatchSlot {
  matchId: number;
  comp: CompId;
  /** 킥오프(UTC ISO, `Z`) */
  kickoff: string;
  ft: Score | null;
}

/** 경기가 끝난 방식 — 승부차기 경기는 연장도 치렀다 */
export type MatchDuration = "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";

/** 종료 경기 스코어(두 API 공통 규칙 — 승부차기 골은 ft에 넣지 않는다) */
export interface MatchScore {
  /** 최종 스코어 = 정규시간 + 연장(승부차기 제외) */
  ft: Score;
  /** 전반 스코어 — 없으면 null */
  ht: Score | null;
  /** 90분 스코어 — 정규시간에 끝난 경기는 ft와 같다. 연장 경기에서 응답에 없으면 null */
  regular: Score | null;
  /** 승부차기 스코어 — 승부차기 경기만, 그 밖은 null */
  pens: Score | null;
  duration: MatchDuration;
}

/** 경기·순위표의 팀 — id는 프로바이더 체계(football-data ≠ API-Football, configs/team-ids.json으로 잇는다) */
export interface TeamRef {
  id: number;
  /** 표시용 짧은 이름(football-data shortName 우선) — 원문 영문 그대로 */
  name: string;
  /** 정식 이름(football-data name) — 없으면 null */
  fullName: string | null;
}

export type MatchProvider = "football-data" | "api-football";

/** 종료 경기 1건(브리핑 입력·대회 페이지 공용 내부 형식) */
export interface FinishedMatch {
  provider: MatchProvider;
  /** 프로바이더 경기 id(두 API 체계가 다르다) */
  matchId: number;
  comp: CompId;
  /** 킥오프(UTC ISO, `Z`) */
  kickoff: string;
  /** 리그 라운드(matchday) — 없으면 null */
  matchday: number | null;
  /** 단계 원문(REGULAR_SEASON·LEAGUE_STAGE·LAST_16 …) — 없으면 null */
  stage: string | null;
  home: TeamRef;
  away: TeamRef;
  score: MatchScore;
  /**
   * 스코어를 API-Football 종료 결과로 보충한 경기면 그 API-Football 경기 id(PRD §15 D60 — scripts/lib/brief-supplement.ts). 경기 id·팀·
   * 라운드는 football-data 그대로(브리핑 근거 id `m<football-data id>`가 한 체계로 남는다). 메모리 안에서만 쓰고 저장하지 않는다.
   */
  supplementedFrom?: number;
}

/**
 * football-data 결과 상태 분류(D60) — awaiting = 결과를 기다린다(예정·진행 중, 또는 FINISHED인데 스코어를 쓸 수 없음) · void = 결과가
 * 나지 않거나 곧 나지 않는다(연기·취소·중단·몰수, 모르는 상태). 상태 원문은 어댑터(providers/football-data.ts)만 안다.
 */
export type UnsettledState = "awaiting" | "void";

/**
 * 브리핑 입력 창 안에 킥오프했지만 football-data가 종료 결과로 주지 않은 대상 대회 경기 1건(D60 — 2026-10-25 호 사건: 킥오프 10시간
 * 뒤에도 football-data가 19경기를 IN_PLAY·TIMED로 줬다). 점수는 없다. awaiting 경기는 같은 실행(또는 원장)의 API-Football 종료
 * 결과로 보충할 수 있고(scripts/lib/brief-supplement.ts), 보충 뒤에도 남으면 브리핑 mode empty의 이유가 `results-pending`이 된다.
 */
export interface UnsettledMatch {
  provider: "football-data";
  matchId: number;
  comp: CompId;
  /** 킥오프(UTC ISO, `Z`) */
  kickoff: string;
  matchday: number | null;
  stage: string | null;
  home: TeamRef;
  away: TeamRef;
  state: UnsettledState;
  /** football-data 상태 원문(로그용 — TIMED·IN_PLAY·POSTPONED …) */
  status: string;
}

// ─── 경기 상세 (API-Football 경기 단건 — M1-48) ──────────────────────────

/** 홈·원정 */
export type Side = "home" | "away";

/** 사람(선수) 참조 — 프로바이더 선수 id(없으면 null)와 응답 원문 이름(영문, 표기가 응답마다 다르다 — 매칭은 id로만) */
export interface PersonRef {
  id: number | null;
  name: string;
}

/** 득점 종류 — 일반·페널티킥(경기 중)·자책골. 놓친 PK·승부차기 킥은 득점이 아니다 */
export type GoalKind = "normal" | "penalty" | "own-goal";

/** 득점 1건(경기 중 — 승부차기 제외). events에서 센다(선수 기록의 goals.total은 0/null이 섞여 쓰지 않는다) */
export interface MatchGoal {
  /** 경과 분(time.elapsed) */
  minute: number;
  /** 추가 시간 분(time.extra) — 없으면 null. 표기는 `minute+extra`(예: 90+3) */
  extra: number | null;
  /** 득점이 인정된 쪽 — 자책골은 득점한 선수의 상대 팀 */
  side: Side;
  kind: GoalKind;
  /** 득점자(자책골이면 자책한 선수 — 상대 팀 소속) */
  scorer: PersonRef;
  /** 도움 — 없으면 null */
  assist: PersonRef | null;
}

/**
 * 라인업 선수 — 출전 시간은 선수 기록(statistics[0].games.minutes), 기록이 없으면 null.
 * 등번호·포지션·grid는 라인업 원문 그대로(형식이 다르면 null) — 팀시트(M2-07, PRD §15 D63 ②)가 쓴다. 원장(D33)에는 넣지 않는다.
 */
export interface LineupPlayer extends PersonRef {
  minutes: number | null;
  /** 등번호(player.number) */
  number: number | null;
  /** 포지션 G·D·M·F(player.pos) */
  pos: LineupPos | null;
  /** 피치 위치 "줄:칸"(player.grid, 선발만 — 1:1 = 골키퍼). 교체 명단은 null */
  grid: string | null;
}

/** 라인업 포지션 — API-Football `player.pos` (G 골키퍼·D 수비·M 미드필더·F 공격) */
export type LineupPos = "G" | "D" | "M" | "F";

/** 팀 라인업 1개 — 선발은 `startXI`로만 판정한다(선수 기록의 `games.substitute`는 응답마다 달라 믿을 수 없다, M0-29) */
export interface TeamLineup {
  /** 포메이션 원문("4-2-3-1") — 없으면 null */
  formation: string | null;
  startXI: LineupPlayer[];
  /** 교체 명단(출전 여부는 minutes로 — 0·null이면 벤치) */
  substitutes: LineupPlayer[];
}

/**
 * 종료 경기 상세 1건 (API-Football 경기 단건). `FinishedMatch`와 달리 6개 대회 밖 경기(한국 선수 소속팀의 컵·UEL 등)도
 * 담으므로 `comp`가 null일 수 있고 대회는 `leagueId`로 구별한다.
 */
export interface MatchDetail {
  provider: "api-football";
  matchId: number;
  /** API-Football league id(6개 대회는 configs/competitions.json apiFootballLeagueId) */
  leagueId: number;
  /** 대회 원문 이름(영문) */
  leagueName: string;
  /** 6개 대회면 id, 그 밖(한국 선수 소속팀 기타 대회)은 null */
  comp: CompId | null;
  /** 시즌 시작 연도 — 없으면 null */
  season: number | null;
  /** 라운드 원문("Regular Season - 5" · "League Stage - 1") — 없으면 null */
  round: string | null;
  /** 킥오프(UTC ISO, `Z` — 응답의 `+00:00`을 경계에서 바꾼다) */
  kickoff: string;
  /** 종료 상태 — FT 정규시간 · AET 연장 · PEN 승부차기 */
  status: "FT" | "AET" | "PEN";
  /** 팀(API-Football id·원문 이름 — fullName은 없어 null) */
  home: TeamRef;
  away: TeamRef;
  /** 스코어 — ft = 정규시간 + 연장(승부차기 제외), 승부차기는 pens(football-data와 같은 공통 규칙) */
  score: MatchScore;
  /** 득점(경기 시간 순) */
  goals: MatchGoal[];
  /**
   * events의 득점 수가 양 팀 모두 최종 스코어(ft)와 맞고 해석하지 못한 득점 이벤트가 없는가. false면 득점자 목록이
   * 빠졌거나 틀릴 수 있으므로 득점자를 사실로 쓰지 않는다(브리핑 M1-19 — 입력에 없는 사실 금지, CLAUDE.md §1-7).
   */
  goalsComplete: boolean;
  /** 라인업 — 응답에 없으면 null(커버리지가 없는 대회) */
  lineups: { home: TeamLineup | null; away: TeamLineup | null };
  /** 받은 시각(UTC ISO) */
  fetchedAt: string;
}

/**
 * 경기 1건에서 선수 1명의 출전 상태 — start 선발 · sub 교체 출전 · bench 교체 명단만 · absent 명단 제외 · unknown 라인업 없음.
 * 원장(`data/matches`)의 한국 선수 행 상태와 같은 값이다(src/lib/schema/matches.ts LedgerAppearanceSchema, M1-48b).
 */
export type AppearanceStatus = "start" | "sub" | "bench" | "absent" | "unknown";

export interface PlayerAppearance {
  /** 선수의 팀 쪽 — 라인업에서 찾았거나 소속팀 id가 이 경기 팀이면 그쪽 */
  side: Side;
  status: AppearanceStatus;
  /** 출전 시간 — 기록이 없으면 null(벤치·명단 제외는 0으로 바꾸지 않는다) */
  minutes: number | null;
  /** 득점 — 자책골은 세지 않는다. goalsComplete가 false면 확정 값이 아니다 */
  goals: number;
  assists: number;
}

function findInLineup(
  lineup: TeamLineup | null,
  playerId: number,
): { player: LineupPlayer; started: boolean } | null {
  if (!lineup) return null;
  const starter = lineup.startXI.find((p) => p.id === playerId);
  if (starter) return { player: starter, started: true };
  const sub = lineup.substitutes.find((p) => p.id === playerId);
  return sub ? { player: sub, started: false } : null;
}

/**
 * 경기 상세에서 선수 1명의 출전 기록(순수 함수) — **선수 id로만 매칭**한다(이름 표기는 응답마다 다르다 — FR-60, D27).
 * 한국 선수는 configs/korean-players.json `apiFootballId`로 부른다(행 조립·저장은 scripts/lib/match-ledger.ts, M1-48b).
 *   - 라인업에 있으면: startXI → start, 교체 명단 → 출전 시간 > 0이면 sub, 아니면 bench
 *   - 라인업에 없고 `teamId`가 이 경기 팀이면: 라인업이 있으면 absent(명단 제외), 없으면 unknown
 *   - 그 밖(이 경기 선수가 아님) → null
 */
export function playerAppearance(
  detail: Pick<MatchDetail, "home" | "away" | "lineups" | "goals">,
  playerId: number,
  teamId: number | null = null,
): PlayerAppearance | null {
  const count = (side: Side) => ({
    goals: detail.goals.filter(
      (g) => g.kind !== "own-goal" && g.scorer.id === playerId,
    ).length,
    assists: detail.goals.filter((g) => g.assist?.id === playerId).length,
    side,
  });
  for (const side of ["home", "away"] as const) {
    const found = findInLineup(detail.lineups[side], playerId);
    if (!found) continue;
    const minutes = found.player.minutes;
    const status: AppearanceStatus = found.started
      ? "start"
      : (minutes ?? 0) > 0
        ? "sub"
        : "bench";
    return { ...count(side), status, minutes };
  }
  const side: Side | null =
    teamId === null
      ? null
      : teamId === detail.home.id
        ? "home"
        : teamId === detail.away.id
          ? "away"
          : null;
  if (side === null) return null;
  const hasLineup = detail.lineups[side] !== null;
  return {
    ...count(side),
    status: hasLineup ? "absent" : "unknown",
    minutes: null,
  };
}

// ─── 순위표 ──────────────────────────────────────────────────────────────

export interface StandingsRow {
  pos: number;
  team: TeamRef;
  played: number;
  w: number;
  d: number;
  l: number;
  pts: number;
  gf: number;
  ga: number;
  /** 득실차(gf − ga) */
  gd: number;
}

/** 순위표 1개 — 리그는 대회당 1개, UCL 리그 페이즈도 36팀 단일 테이블 1개(그룹 스테이지가 있으면 그룹마다 1개) */
export interface StandingsTable {
  /** 단계 원문(REGULAR_SEASON·LEAGUE_STAGE …) — 없으면 null */
  stage: string | null;
  /** 그룹 원문(리그 "Matchday" · UCL "League phase" · "GROUP_A" …) — 없으면 null */
  group: string | null;
  rows: StandingsRow[];
}

/** 대회 1개의 현재 순위 */
export interface CompStandings {
  comp: CompId;
  /** 응답의 시즌 시작 연도(2026 = 2026-27) — 없으면 null */
  season: number | null;
  /** 응답의 현재 라운드 — 없으면 null */
  currentMatchday: number | null;
  tables: StandingsTable[];
  /** 받은 시각(UTC ISO) */
  fetchedAt: string;
  /**
   * 받은 시점에 그 대회에 진행 중이던 경기 수. football-data 순위표는 진행 중 점수까지 반영하므로(M0-28 실측)
   * 0보다 크면 확정 순위가 아니다 — 브리핑(M1-19)은 그 대회 순위 문장을 쓰지 않는다.
   */
  inProgress: number;
}

// ─── 프로바이더 단계 격리 ────────────────────────────────────────────────

export type ProviderSkipReason =
  /** 키가 없다(로컬·Secrets 미설정) */
  | "no-api-key"
  /** 우리 쪽 일일 호출 카운터가 상한에 닿았다(API-Football — 하루 ≤ 60회, M1-48) */
  | "daily-cap"
  /** 뉴스 단계가 실패해 요청을 시작하기 전에 멈췄다(뉴스와 병렬 — collect-run.ts) */
  | "cancelled"
  /** 개발 실행이 봇 수집 시간대(06:00~08:00 KST)라 부르지 않았다(CLAUDE.md §6.4) */
  | "dev-quiet-hours";

export type ProviderOutcome<T> =
  | { provider: MatchProvider; state: "done"; data: T; elapsedMs: number }
  | {
      provider: MatchProvider;
      state: "skipped";
      reason: ProviderSkipReason;
      elapsedMs: number;
    }
  | {
      provider: MatchProvider;
      state: "failed";
      /** 오류 분류(어댑터 오류의 kind, 예상 밖이면 "unexpected") */
      errorType: string;
      /** 짧은 메시지(응답 본문·키 없음) */
      error: string;
      elapsedMs: number;
    };

function errorText(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "")
    : String(error);
}

/**
 * 프로바이더 단계 하나를 실행한다 — **던지지 않는다.** `run`이 던지면 그 프로바이더의 `failed`로 바꾼다
 * (예상한 실패는 `run`이 직접 `failed`를 돌려주고, 이것은 예상 밖 예외의 방어선이다). 호출 수 집계는 `run`이 맡는다.
 */
export async function isolateProvider<T>(
  provider: MatchProvider,
  run: () => Promise<ProviderOutcome<T>>,
  now: () => number = Date.now,
): Promise<ProviderOutcome<T>> {
  const started = now();
  try {
    return await run();
  } catch (error) {
    return {
      provider,
      state: "failed",
      errorType: "unexpected",
      error: errorText(error),
      elapsedMs: Math.max(0, now() - started),
    };
  }
}
