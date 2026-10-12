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
 * `isolateProvider`로 감싼다(던지지 않고 결과를 돌려준다). 지금은 football-data만 있고 API-Football 자리(M1-48)는 비어 있다.
 */
import type { CompId } from "@/lib/schema";

// ─── 스코어·팀 ───────────────────────────────────────────────────────────

/** 홈-원정 점수 */
export interface Score {
  home: number;
  away: number;
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
  /** 어댑터가 아직 없다(API-Football — M1-48) */
  | "no-adapter";

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
