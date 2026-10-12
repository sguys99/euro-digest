/**
 * 일일 브리핑 정형 입력 (M1-01 수직 슬라이스 → M1-19가 확정). 기사 텍스트는 넣지 않는다 — 데이터 API 결과만(D24).
 *
 * 입력 창 (M0-34 정의, `fixtures/llm/README.md` "입력 창(임시)"): 발행일(KST) D의 입력 = UTC 하루 D-1에 킥오프한 종료 경기
 *   = KST [D-1 09:00, D 09:00) = `kstWindowRangeUtc(D-1, {fromKst:"09:00", toKst:"09:00"})`. M1-19에서 확정한다.
 *
 * 형식은 M0-30 임시 형식(`fixtures/llm/brief-inputs/*.json`)의 부분집합이다 — 슬라이스는 경기 결과만 넣는다:
 *   `{ briefDate, matches: [{ id, comp, round, home, away, ft, ht?, goals: null }] }`
 *   - 득점자는 football-data 무료 플랜에 없어 `goals: null`(M1-48 API-Football이 채운다) → 프롬프트가 득점자를 쓰지 않는다.
 *   - 순위(`standings`)는 M1-44, 한국 선수(`korean`)는 M3-03에서 더한다. `korean` 키가 없으면 한국 선수를 언급하지 않는다.
 *   - 연장·승부차기 경기(duration ≠ REGULAR)는 점수 표기 규칙이 정해지지 않아(football-data fullTime에 승부차기 골 포함)
 *     슬라이스 입력에서 뺀다. 입력 경기 수 상한은 `BRIEF_MAX_MATCHES`(킥오프 순) — 중요도 순 상한은 M1-19.
 */
import type { CompetitionConfig } from "@/lib/schema";
import {
  kstWindowRangeUtc,
  parseUtcIso,
  shiftDate,
  type KstWindow,
  type UtcRange,
} from "@/lib/time";

import type { MatchResult } from "./providers/football-data";

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

/** UTC ISO → UTC 날짜 "YYYY-MM-DD" (시간대 변환 없음 — football-data dateFrom·dateTo용) */
function utcDateOf(iso: string): string {
  return parseUtcIso(iso).toISOString().slice(0, 10);
}

/**
 * 창 → 교차 `/v4/matches`의 dateFrom·dateTo. 이 엔드포인트는 dateTo 당일을 빼므로 창 끝의 UTC 날짜를 그대로 넣는다
 * (창 = UTC 하루 D-1이면 dateFrom D-1, dateTo D → D-1 경기). 받은 뒤 킥오프로 창을 다시 거른다.
 */
export function footballDataDateRange(window: UtcRange): {
  dateFrom: string;
  dateTo: string;
} {
  return { dateFrom: utcDateOf(window.start), dateTo: utcDateOf(window.end) };
}

export interface BriefInputMatch {
  /** `m` + football-data 경기 id — 출력의 근거 id(r)로 돌아온다 */
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
  /** 득점 데이터 없음(football-data 무료) */
  goals: null;
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
}

/** 라운드 표기 — 리그 "Matchday 6", UCL 리그 페이즈 "League phase MD 1"(M0-30 입력과 같은 표기) */
export function roundLabel(result: Pick<MatchResult, "stage" | "matchday">) {
  if (result.stage === "LEAGUE_STAGE" && result.matchday !== null) {
    return `League phase MD ${result.matchday}`;
  }
  if (result.matchday !== null) return `Matchday ${result.matchday}`;
  return result.stage ?? "";
}

/** 종료 경기 결과 → 브리핑 입력(순수 함수). results는 킥오프 순으로 정렬돼 있다고 본다(toFinishedResults). */
export function buildBriefInput(
  briefDate: string,
  results: readonly MatchResult[],
  competitions: readonly CompetitionConfig[],
  maxMatches: number = BRIEF_MAX_MATCHES,
): BriefInputBuild {
  const nameOf = new Map(competitions.map((c) => [c.id as string, c.nameEn]));
  const regular = results.filter((r) => r.duration === "REGULAR");
  const kept = regular.slice(0, Math.max(0, maxMatches));
  const matches = kept.map((r): BriefInputMatch => {
    const match: BriefInputMatch = {
      id: `m${r.fdId}`,
      comp: nameOf.get(r.comp) ?? r.comp,
      round: roundLabel(r),
      home: r.home,
      away: r.away,
      ft: `${r.ft.home}-${r.ft.away}`,
      goals: null,
    };
    if (r.ht) match.ht = `${r.ht.home}-${r.ht.away}`;
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
  };
}

/** 요청 user 메시지 — 공백 없는 JSON(M0-30 입력 파일과 같은 형식) */
export function serializeBriefInput(input: BriefInput): string {
  return JSON.stringify(input);
}
