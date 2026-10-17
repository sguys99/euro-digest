/**
 * 🧪 실험용 — 브리핑 입력 "사실 선계산" 변형 (M1-24 — 사용자 결정 2026-10-17: M1-24 회귀로 효과를 확인한 뒤 채택 여부 결정).
 * **파이프라인은 이 파일을 쓰지 않는다**(collect-run.ts 브리핑 단계·확정 빌더 brief-input.ts 불변). `npm run eval:prompt --
 * --variant pre`만 쓴다.
 *
 * 무엇을: 확정 입력(BriefInput)의 경기마다 코드가 계산한 값 `x`를 더한다 — 승자·이긴 팀 점수 먼저·승부차기·'연장 끝에' 여부·
 * 결승골 {player, min, type}·역전승 여부·해트트릭(이상). 계산은 템플릿·검사기와 같은 해석(brief-template.ts `matchFacts`)이라
 * 모델이 x를 옮기면 검사기가 인정하는 사실이 된다. 모델은 승패 주어·점수 순서·결승골 정의를 스스로 계산하지 않아도 된다.
 * 지시문에는 x 설명(`PRECOMPUTE_PROMPT_ADDENDUM`)을 v0.1 뒤에 덧붙인다(실험 — configs/prompts/summarize.md는 그대로).
 *
 * 승패를 쓸 수 없는 경기(두 경기 합산 때문일 수 있는 연장 — 90분에 이미 앞섰거나 90분 점수 없음, 경기 점수가 동점이 아닌 승부차기)는
 * `w`를 두지 않고 `r`("ft-only" — 그 경기 점수만 쓴다)를 둔다. 지시문 [연장·승부차기]와 같은 원칙이다.
 *
 * 순수 함수 모듈 — I/O 없음.
 */
import type { BriefInput, BriefInputMatch } from "./brief-input";
import {
  matchFacts,
  other,
  type MatchFacts,
  type Side,
} from "./brief-template";

/** 경기 1건의 계산값(짧은 키 — 입력과 같은 형식) */
export interface PrecomputedFacts {
  /** 이긴 팀 이름(승부차기 경기는 승부차기 승자). 무승부·승패를 쓸 수 없는 경기는 없음 */
  w?: string;
  /** 이긴 팀 점수 먼저 쓴 최종 점수(연장 포함, 승부차기 제외) */
  s?: string;
  /** 무승부(ft 동점·승부차기 없음) */
  d?: true;
  /** 승부차기 점수, 이긴 팀 먼저 */
  p?: string;
  /** '연장 끝에'를 쓸 수 있다(연장 경기 — 90분 점수가 있고 이긴 팀이 90분에 앞서지 않았다) */
  et?: true;
  /** 승패를 쓰지 않고 경기 점수만 쓴다 — 두 경기 합산이 얽힌 연장·승부차기(합산 점수는 입력에 없다) */
  r?: "ft-only";
  /** 결승골 — 이긴 팀의 (진 팀 점수 + 1)번째 골(자책골이면 없음, 2골 차 이내 경기만 — 템플릿과 같다) */
  g?: { player: string; min: string; type?: "penalty" };
  /** 역전승(이긴 팀이 전반 또는 득점 순서에서 뒤진 적이 있다) */
  cb?: true;
  /** 한 경기 3골 이상 넣은 선수(자책골 제외) */
  ht?: Array<{ player: string; n: number }>;
}

export type PrecomputedMatch = BriefInputMatch & { x: PrecomputedFacts };
export type PrecomputedInput = Omit<BriefInput, "matches"> & {
  matches: PrecomputedMatch[];
};

function scoreFrom(home: number, away: number, first: Side): string {
  return first === "home" ? `${home}-${away}` : `${away}-${home}`;
}

/** 경기 1건 → 계산값(순수 함수). 점수 형식이 틀려 해석할 수 없으면 빈 객체 */
export function precomputeMatchFacts(match: BriefInputMatch): PrecomputedFacts {
  const facts: MatchFacts | null = matchFacts(match);
  if (!facts) return {};
  const out: PrecomputedFacts = {};
  const { ft, pens, regular, winner } = facts;
  const ftWinner: Side | null =
    ft.home > ft.away ? "home" : ft.away > ft.home ? "away" : null;
  const teamOf = (side: Side) => (side === "home" ? match.home : match.away);

  if (pens) {
    // 승부차기 — 승자는 승부차기 결과. 경기 점수가 동점이 아니면 합산 동점 뒤 승부차기 → 경기 점수의 승자처럼 쓰지 않는다
    if (winner === null) return {};
    out.p = scoreFrom(pens.home, pens.away, winner);
    if (ftWinner === null) {
      out.w = teamOf(winner);
      out.s = scoreFrom(ft.home, ft.away, winner);
    } else {
      out.r = "ft-only";
    }
  } else if (ftWinner === null) {
    out.d = true;
  } else if (facts.aet) {
    // 연장 — 90분 점수가 있고 이긴 팀이 90분에 앞서지 않았을 때만 '연장 끝에' 이긴 경기
    const ledAt90 =
      regular !== null && regular[ftWinner] > regular[other(ftWinner)];
    if (regular === null || ledAt90) {
      out.r = "ft-only";
    } else {
      out.w = teamOf(ftWinner);
      out.s = scoreFrom(ft.home, ft.away, ftWinner);
      out.et = true;
    }
  } else {
    out.w = teamOf(ftWinner);
    out.s = scoreFrom(ft.home, ft.away, ftWinner);
  }

  // 득점 — 득점 목록이 완전하고 점수와 맞을 때만(matchFacts goals)
  if (facts.goals) {
    // 결승골은 2골 차 이내만(템플릿과 같다 — 7-0 경기의 첫 골을 '결승골'로 쓰는 것은 정의상 맞아도 뉴스 문장으로 어색하다)
    if (
      out.w !== undefined &&
      ftWinner !== null &&
      out.r === undefined &&
      facts.margin <= 2
    ) {
      const loserGoals = ft[other(ftWinner)];
      const winnerGoals = facts.goals.filter((g) => g.side === ftWinner);
      const decisive = winnerGoals[loserGoals];
      if (decisive && !decisive.ownGoal) {
        out.g = {
          player: decisive.player,
          min: decisive.min,
          ...(decisive.penalty ? { type: "penalty" as const } : {}),
        };
      }
    }
    const tally = new Map<string, number>();
    for (const g of facts.goals) {
      if (!g.ownGoal) tally.set(g.player, (tally.get(g.player) ?? 0) + 1);
    }
    const hat = [...tally]
      .filter(([, n]) => n >= 3)
      .map(([player, n]) => ({ player, n }));
    if (hat.length > 0) out.ht = hat;
  }
  if (facts.comeback && out.w !== undefined && out.r === undefined) {
    out.cb = true;
  }
  return out;
}

/** 확정 입력 → 계산값을 더한 입력(경기 키 순서는 그대로, x는 맨 뒤) */
export function withPrecomputedFacts(input: BriefInput): PrecomputedInput {
  return {
    ...input,
    matches: input.matches.map((m) => ({ ...m, x: precomputeMatchFacts(m) })),
  };
}

/**
 * v0.1 지시문 뒤에 덧붙이는 x 설명(실험). 결승골·역전승·해트트릭·연장 끝에·승패 주어는 x에 있을 때만 쓰게 한다 —
 * 모델이 스스로 계산하던 서술을 코드 계산값으로 묶는다.
 */
export const PRECOMPUTE_PROMPT_ADDENDUM = [
  "[계산값 x — 코드가 입력에서 미리 계산했다. 이 값과 다르게 쓰지 않는다]",
  "- matches 항목마다 x가 있다. w 이긴 팀 · s 이긴 팀 점수를 먼저 쓴 점수(이기거나 진 문장은 이 순서) · d true면 무승부 · p 승부차기 점수(이긴 팀 먼저).",
  "- et true면 '연장 끝에'를 쓸 수 있다. r \"ft-only\"면 승패를 쓰지 않고 'TeamA와 TeamB의 경기는 연장까지 h-a로 끝났다'처럼 그 경기 점수만 쓴다(p가 있으면 승부차기 승자도 쓴다).",
  "- g 결승골(player·min, type penalty면 PK 결승골) · cb true면 역전승 · ht 한 경기 3골 이상 넣은 선수와 골 수(3골이면 해트트릭).",
  "- 결승골·역전승·해트트릭·연장 끝에는 x에 있을 때만 쓴다. 승패의 주어는 w다.",
].join("\n");
