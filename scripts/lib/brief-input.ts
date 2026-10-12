/**
 * 일일 브리핑 정형 입력 (M1-01 수직 슬라이스 → M1-19가 확정). 기사 텍스트는 넣지 않는다 — 데이터 API 결과만(D24).
 *
 * 입력 창 (M0-34 정의, `fixtures/llm/README.md` "입력 창(임시)"): 발행일(KST) D의 입력 = UTC 하루 D-1에 킥오프한 종료 경기
 *   = KST [D-1 09:00, D 09:00) = `kstWindowRangeUtc(D-1, {fromKst:"09:00", toKst:"09:00"})`. M1-19에서 확정한다.
 *   KST에는 서머타임이 없어 이 창은 유럽 서머타임 전환과 무관하게 항상 UTC 하루다.
 *
 * 형식은 M0-30 임시 형식(`fixtures/llm/brief-inputs/*.json`)의 부분집합이다 — 슬라이스는 경기 결과만 넣는다:
 *   `{ briefDate, matches: [{ id, comp, round, home, away, ft, ht?, goals: null }] }`
 *   - 입력은 어댑터의 내부 형식(scripts/lib/match-data.ts `FinishedMatch`)에서 만든다 — football-data 키를 모른다(M1-44).
 *   - 득점자는 football-data 무료 플랜에 없어 `goals: null`(M1-48 API-Football이 채운다) → 프롬프트가 득점자를 쓰지 않는다.
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

import type { FinishedMatch } from "./match-data";

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
export function roundLabel(result: Pick<FinishedMatch, "stage" | "matchday">) {
  if (result.stage === "LEAGUE_STAGE" && result.matchday !== null) {
    return `League phase MD ${result.matchday}`;
  }
  if (result.matchday !== null) return `Matchday ${result.matchday}`;
  return result.stage ?? "";
}

/** 종료 경기 결과 → 브리핑 입력(순수 함수). results는 킥오프 순으로 정렬돼 있다고 본다(toFinishedResults). */
export function buildBriefInput(
  briefDate: string,
  results: readonly FinishedMatch[],
  competitions: readonly CompetitionConfig[],
  maxMatches: number = BRIEF_MAX_MATCHES,
): BriefInputBuild {
  const nameOf = new Map(competitions.map((c) => [c.id as string, c.nameEn]));
  const regular = results.filter((r) => r.score.duration === "REGULAR");
  const kept = regular.slice(0, Math.max(0, maxMatches));
  const matches = kept.map((r): BriefInputMatch => {
    const { ft, ht } = r.score;
    const match: BriefInputMatch = {
      id: `m${r.matchId}`,
      comp: nameOf.get(r.comp) ?? r.comp,
      round: roundLabel(r),
      home: r.home.name,
      away: r.away.name,
      ft: `${ft.home}-${ft.away}`,
      goals: null,
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
  };
}

/** 요청 user 메시지 — 공백 없는 JSON(M0-30 입력 파일과 같은 형식) */
export function serializeBriefInput(input: BriefInput): string {
  return JSON.stringify(input);
}
