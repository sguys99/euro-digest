/**
 * 일일 브리핑 정형 입력 (M1-01 수직 슬라이스 → M1-19가 확정). 기사 텍스트는 넣지 않는다 — 데이터 API 결과만(D24).
 *
 * 입력 창 (M0-34 정의, `fixtures/llm/README.md` "입력 창(임시)"): 발행일(KST) D의 입력 = UTC 하루 D-1에 킥오프한 종료 경기
 *   = KST [D-1 09:00, D 09:00) = `kstWindowRangeUtc(D-1, {fromKst:"09:00", toKst:"09:00"})`. M1-19에서 확정한다.
 *   KST에는 서머타임이 없어 이 창은 유럽 서머타임 전환과 무관하게 항상 UTC 하루다.
 *
 * 형식은 M0-30 임시 형식(`fixtures/llm/brief-inputs/*.json`)의 부분집합이다 — 슬라이스는 경기 결과 + 득점자만 넣는다:
 *   `{ briefDate, matches: [{ id, comp, round, home, away, ft, ht?, goals }] }`
 *   - 입력은 어댑터의 내부 형식(scripts/lib/match-data.ts `FinishedMatch`·`MatchDetail`)에서 만든다 — 외부 API 키를 모른다(M1-44).
 *   - 득점자(M1-48b, D27·D37): football-data 무료 플랜에 없어 API-Football 경기 상세로 채운다. **연결된 경기(대응표 확인 또는
 *     강한 증거 — scripts/lib/team-ids.ts `linkMatchDetails`) 중 득점 목록이 완전한(`goalsComplete`) 경기만** `goals` 배열,
 *     그 밖(연결 안 됨·득점 불완전·API-Football 실패)은 `null` → 프롬프트가 그 경기 득점자를 쓰지 않는다(입력에 없는 사실 금지).
 *     항목 = `{ min, team, player, assist?, type? }`(M0-30 표기 — fixtures/llm/README.md): min "90+2", team = 득점이 기록된 팀
 *     (이 입력의 home·away 이름 — 자책골은 득점 인정 팀), player·assist = API-Football 응답 원문 영문(한글 치환은 M1-21),
 *     type "penalty"(경기 중 PK)·"own_goal"(자책골, 도움 없음). 승부차기 킥은 득점이 아니다. 0-0 경기는 빈 배열.
 *   - 순위는 어댑터가 받아 오지만(M1-44 `CompStandings`) 입력에 넣는 것은 M1-19, 한국 선수(`korean`)는 M3-03.
 *     `korean` 키가 없으면 한국 선수를 언급하지 않는다.
 *   - 연장·승부차기 경기(duration ≠ REGULAR)는 점수 표기 규칙이 정해지지 않아 슬라이스 입력에서 뺀다(M1-19).
 *     입력 경기 수 상한은 `BRIEF_MAX_MATCHES`(킥오프 순) — 중요도 순 상한은 M1-19.
 */
import type { CompetitionConfig } from "@/lib/schema";
import {
  kstWindowRangeUtc,
  shiftDate,
  type KstWindow,
  type UtcRange,
} from "@/lib/time";

import type { FinishedMatch, MatchDetail } from "./match-data";

/** 입력 창 — KST 09:00 ~ 다음 날 09:00 (= UTC 하루) */
export const BRIEF_INPUT_WINDOW: Readonly<KstWindow> = Object.freeze({
  fromKst: "09:00",
  toKst: "09:00",
});

/** 입력 경기 수 상한(슬라이스) — 토큰 상한을 묶어 둔다. M1-19가 중요도 순 상한으로 바꾼다 */
export const BRIEF_MAX_MATCHES = 30;

/** 발행일(KST) → 입력 창 [start, end) */
export function briefInputWindow(briefDate: string): UtcRange {
  return kstWindowRangeUtc(shiftDate(briefDate, -1), BRIEF_INPUT_WINDOW);
}

/** 득점 1건(M0-30 임시 형식) — 키 순서 min·team·player·assist·type */
export interface BriefInputGoal {
  /** 경과 분 "55" · 추가 시간 "90+2" */
  min: string;
  /** 득점이 기록된 팀(이 경기 입력의 home·away 이름) — 자책골은 득점 인정 팀 */
  team: string;
  /** 득점자(자책골이면 자책한 선수) — 응답 원문 영문 */
  player: string;
  /** 도움 — 없으면 키 없음(자책골은 항상 없음) */
  assist?: string;
  /** penalty = 경기 중 페널티킥 · own_goal = 자책골 — 일반 골은 키 없음 */
  type?: "penalty" | "own_goal";
}

export interface BriefInputMatch {
  /** `m` + 프로바이더(football-data) 경기 id — 출력의 근거 id(r)로 돌아온다 */
  id: string;
  /** 대회 영문 이름(configs/competitions.json nameEn) */
  comp: string;
  round: string;
  home: string;
  away: string;
  /** 최종 점수 "h-a"(홈-원정) */
  ft: string;
  /** 전반 점수 "h-a" — 없으면 키 없음 */
  ht?: string;
  /** 득점자 — 연결된 API-Football 상세의 득점 목록이 완전할 때만, 그 밖은 null(득점 데이터 없음) */
  goals: BriefInputGoal[] | null;
}

export interface BriefInput {
  briefDate: string;
  matches: BriefInputMatch[];
}

export interface BriefInputBuild {
  input: BriefInput;
  excluded: {
    /** 연장·승부차기 경기 */
    nonRegular: number;
    /** 상한을 넘어 뺀 경기 */
    overCap: number;
  };
  /** 입력 경기 중 득점자를 넣은 경기 수(goals 배열) · 연결은 됐지만 득점 목록이 불완전해 null로 둔 경기 수 */
  goals: { filled: number; incomplete: number };
}

/** 분 표기 — "55" · "90+2"(추가 시간이 0·없으면 붙이지 않는다) */
function minuteLabel(minute: number, extra: number | null): string {
  return extra !== null && extra > 0 ? `${minute}+${extra}` : String(minute);
}

/**
 * 연결된 경기 상세 → 득점 목록(순수 함수). 득점 목록이 불완전하면(`goalsComplete` false) null — 빠지거나 틀린 득점자를
 * 사실로 쓰지 않는다(CLAUDE.md §1-7). 팀 이름은 이 입력의 home·away(football-data 표기)를 쓴다 — 연결은 홈↔홈·원정↔원정이다.
 */
export function briefGoalsOf(
  match: Pick<FinishedMatch, "home" | "away">,
  detail: Pick<MatchDetail, "goals" | "goalsComplete">,
): BriefInputGoal[] | null {
  if (!detail.goalsComplete) return null;
  return detail.goals.map((g) => {
    const goal: BriefInputGoal = {
      min: minuteLabel(g.minute, g.extra),
      team: g.side === "home" ? match.home.name : match.away.name,
      player: g.scorer.name,
    };
    if (g.kind !== "own-goal" && g.assist) goal.assist = g.assist.name;
    if (g.kind === "penalty") goal.type = "penalty";
    if (g.kind === "own-goal") goal.type = "own_goal";
    return goal;
  });
}

/** 라운드 표기 — 리그 "Matchday 6", UCL 리그 페이즈 "League phase MD 1"(M0-30 입력과 같은 표기) */
export function roundLabel(result: Pick<FinishedMatch, "stage" | "matchday">) {
  if (result.stage === "LEAGUE_STAGE" && result.matchday !== null) {
    return `League phase MD ${result.matchday}`;
  }
  if (result.matchday !== null) return `Matchday ${result.matchday}`;
  return result.stage ?? "";
}

/**
 * 종료 경기 결과 → 브리핑 입력(순수 함수). results는 킥오프 순으로 정렬돼 있다고 본다(toFinishedResults).
 * `linked`(football-data 경기 id → 연결된 API-Football 상세)가 있으면 그 경기의 득점자를 넣는다(briefGoalsOf).
 */
export function buildBriefInput(
  briefDate: string,
  results: readonly FinishedMatch[],
  competitions: readonly CompetitionConfig[],
  maxMatches: number = BRIEF_MAX_MATCHES,
  linked: ReadonlyMap<
    number,
    Pick<MatchDetail, "goals" | "goalsComplete">
  > = new Map(),
): BriefInputBuild {
  const nameOf = new Map(competitions.map((c) => [c.id as string, c.nameEn]));
  const regular = results.filter((r) => r.score.duration === "REGULAR");
  const kept = regular.slice(0, Math.max(0, maxMatches));
  const goalStats = { filled: 0, incomplete: 0 };
  const matches = kept.map((r): BriefInputMatch => {
    const { ft, ht } = r.score;
    const detail = linked.get(r.matchId);
    const goals = detail ? briefGoalsOf(r, detail) : null;
    if (goals !== null) goalStats.filled += 1;
    else if (detail) goalStats.incomplete += 1;
    const match: BriefInputMatch = {
      id: `m${r.matchId}`,
      comp: nameOf.get(r.comp) ?? r.comp,
      round: roundLabel(r),
      home: r.home.name,
      away: r.away.name,
      ft: `${ft.home}-${ft.away}`,
      goals,
    };
    if (ht) match.ht = `${ht.home}-${ht.away}`;
    return match;
  });
  // 키 순서를 M0-30 입력과 같게 맞춘다(id·comp·round·home·away·ft·ht·goals).
  const ordered = matches.map(
    ({ id, comp, round, home, away, ft, ht, goals }) =>
      ht === undefined
        ? { id, comp, round, home, away, ft, goals }
        : { id, comp, round, home, away, ft, ht, goals },
  );
  return {
    input: { briefDate, matches: ordered },
    excluded: {
      nonRegular: results.length - regular.length,
      overCap: regular.length - kept.length,
    },
    goals: goalStats,
  };
}

/** 요청 user 메시지 — 공백 없는 JSON(M0-30 입력 파일과 같은 형식) */
export function serializeBriefInput(input: BriefInput): string {
  return JSON.stringify(input);
}
