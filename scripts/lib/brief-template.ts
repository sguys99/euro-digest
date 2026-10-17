/**
 * 브리핑 코드 템플릿 문장 (M1-19 → **M1-21 문형 교체** — PRD FR-26·FR-27·FR-29, D24·D30·D38·D45 ④). LLM 없이 정형 입력
 * (brief-input.ts `BriefInput`)만으로 "오늘의 5줄"을 만든다. 결정적(같은 입력 → 같은 줄)이고 모든 줄이 `ai:false`(“AI 작성” 라벨
 * 없음)·근거 id(`refs`)를 갖는다.
 * 쓰는 곳(하나의 생성기 — FR-27 "같은 템플릿 생성기"): 예산 초과(M1-22)·LLM 실패·출력 전체 실패(FR-29)·브리핑 마감 초과(FR-26, M1-45)
 * 의 전체 강등(`templateBriefLines`)과 줄 단위 강등(`templateLineForRefs` — M1-45가 근거 id로 그 줄만 바꾼다).
 * football-data 데이터(결과·순위)만으로 모든 줄을 만들 수 있다 — 득점자(API-Football)는 있을 때만 서술을 더한다(M1-47 이월).
 *
 * ── 문형 — LLM 줄과 같은 자연 뉴스 문장 (D45 ④: 강등된 날 한 블록 안에서 문체가 섞여 보이지 않게) ─────────────────
 *   **주어 팀 점수 먼저**(D30 갱신 — 이긴 팀이 주어면 이긴 팀 점수 먼저), 이름 뒤 조사는 받침 기준(josa.ts), 입력에 없는 사실은
 *   쓰지 않는다(CLAUDE.md §1-7). {승자}·{패자}·{홈}·{원정}은 한글 이름(names.ts 사전 — 없으면 영문), [대회]는 브리핑 단위 표기.
 *   승리      `{승자}가 [대회 홈경기에서|대회 원정에서|원정에서] {패자}를 w-l로 꺾었다.` — 홈 승리는 대회가 없으면 장소를 쓰지 않는다
 *     3골 차 이상 `… {패자}를 w-l로 완파했다.`(점수 차로 계산 — D40 ② 파생 사실과 같은 종류)
 *     역전승      `… {패자}에 w-l 역전승을 거뒀다.`(전반 스코어 또는 완전한 득점 순서로 이긴 팀이 뒤진 적이 확인될 때만)
 *     득점자(득점 목록이 완전하고 점수와 맞을 때만 — goals 배열):
 *       결승골(2골 차 이내, 이긴 팀의 (진 팀 점수 + 1)번째 골·자책골 제외) `{승자}가 … {선수}의 {분}분 [PK ]결승골로 {패자}를 …`
 *       해트트릭(이긴 팀 같은 선수 3골 이상 — 점수 차와 무관, 4골 이상은 'n골') `… {선수}의 해트트릭을 앞세워 …`
 *   무승부    `{홈}과 {원정}이 [대회에서] h-a로 비겼다.`(0-0 포함 — 점수를 늘 쓴다)
 *     동점골(마지막 골 — 자책골 제외) `{동점 팀}이 [장소] {선수}의 {분}분 동점골로 {상대}와 h-h로 비겼다.`
 *   연장      `{승자}가 [장소] 연장 끝에 {패자}를 w-l로 꺾었다.` · `{홈}과 {원정}이 [대회에서] 연장 끝에 h-a로 비겼다.`
 *   승부차기  `{승자}가 [장소] {패자}와 연장까지 1-1로 맞선 뒤 승부차기에서 w-l로 이겼다.` — 승부차기 점수도 이긴 팀 먼저,
 *            승부차기 경기의 `ft` 동점을 '비겼다'로 쓰지 않는다(M1-19 이월 — 결과는 승부차기 승패)
 *   중립 경기장 결승(round FINAL)은 장소 대신 `[대회 ]결승에서` — 홈·원정이 없다
 *   순위      `{1위}가 승점 n으로 [대회] 선두, {2위}가 승점 m으로 2위[, {3위}가 승점 k로 3위]다.` — 같은 순위는
 *            `{A}와 {B}가 승점 n으로 [대회] 공동 선두`·`A·B·C가 … 공동 n위`(응답 순서, 승점이 같을 때만). 전일 순위가 없으므로
 *            변동(올랐다·내려갔다·지켰다)은 쓰지 않는다(D40 ③). 진행 중 경기가 있는 대회는 입력에 순위가 없어 문장도 없다(M1-44 이월).
 *
 * ── 대회 표기 — 브리핑 단위로 하나 (D30·D45 ④, M1-19 이월) ─────────────────────────────────────
 *   한 브리핑 안에서는 nameKo('프리미어리그')나 shortKo('EPL') 중 하나만 쓴다(`chooseBriefCompForm`): nameKo가 기본이고,
 *   nameKo로는 대회 표기를 잃는 줄(60·80자 안에 대회와 함께 못 들어가 대회 없이 쓴 줄)이 shortKo보다 많을 때만 shortKo.
 *   줄마다 고르던 M1-19 방식은 'EPL'과 '프리미어리그'가 한 블록에 섞였다. LLM 줄 치환(names.ts `substituteNames` competitionLabel)도 같은 표기를 쓸 것(M1-45).
 *
 * ── 길이 ───────────────────────────────────────────────────────────────────────────────
 *   조사를 붙이고 이름을 바꾼 **뒤의** 문장 길이로 잰다(PRD §9.4 치환 후 길이). 목표 60자(FR-23 '60자 내외') 안에 드는 가장 자세한
 *   문장을 고르고, 없으면 80자(D40 ⑤ 상한) 안의 첫 문장, 그것도 없으면 그 줄을 만들지 않는다(문장 중간 절단 안 함). 변형 순서:
 *   대회 표기와 함께 (득점자 + 분 → 득점자 → 기본) → 대회 없이 기본.
 *
 * 순수 함수 모듈 — I/O 없음.
 */
import {
  BRIEF_LINE_MAX,
  BRIEF_MAX_LINES,
  type BriefLine,
  type CompetitionConfig,
  type NamesKoFile,
} from "@/lib/schema";

import type {
  BriefInput,
  BriefInputMatch,
  BriefInputStandings,
} from "./brief-input";
import { withJosa } from "./josa";
import {
  buildNameIndex,
  COMPETITION_EN_ALIASES,
  koreanName,
  PERSON_KINDS,
  TEAM_KINDS,
  type NameIndex,
} from "./names";

/** 줄 길이 목표(FR-23 '60자 내외') — 이 안에 드는 가장 자세한 변형을 고른다 */
export const BRIEF_TEMPLATE_TARGET = 60;
/** 순위가 있을 때 경기 줄 수 상한(나머지 자리는 순위 줄) */
export const TEMPLATE_MATCH_LINES_WITH_STANDINGS = 4;
/** 순위 줄 상한 */
export const TEMPLATE_STANDINGS_LINES_MAX = 2;
/** 해트트릭으로 쓰는 골 수(이보다 많으면 'n골') */
const HAT_TRICK = 3;
/** '완파'로 쓰는 최소 점수 차 — 이보다 작으면 결승골을 쓴다 */
const BIG_MARGIN = 3;
/** 순위 줄의 한 순위에 넣는 최대 팀 수(공동 순위가 이보다 많으면 거기서 줄을 끝낸다) */
const STANDINGS_GROUP_MAX = 3;
/** 순위 줄에 넣는 최대 순위 묶음 수 */
const STANDINGS_GROUPS_MAX = 3;
/**
 * 중립 경기장 경기의 라운드 표기(football-data stage — brief-input.ts roundLabel). 결승은 matchday가 null이라 roundLabel이 stage
 * 원문("FINAL")을 돌려준다고 가정한다 — M2 실응답(녹아웃 경기)으로 확인할 것(M1-19 이월 메모).
 */
const NEUTRAL_ROUNDS: ReadonlySet<string> = new Set(["FINAL"]);

// ─── 고유명사 ────────────────────────────────────────────────────────────

/** 영문 이름 → 표시 이름 */
export interface BriefNames {
  team(name: string): string;
  person(name: string): string;
}

/** 영문 그대로(사전을 읽지 못했을 때의 기본) */
export const ENGLISH_NAMES: BriefNames = Object.freeze({
  team: (name: string) => name,
  person: (name: string) => name,
});

/**
 * 사전 색인(names.ts) → 이름 표기 — 영문 표기(대표·별칭, 접기 기준 정확히 같음)가 있으면 한글. 팀은 kind team, 사람은
 * player·manager. 미등록 이름은 영문 그대로(미등록 적재는 collect-run.ts → unknown-names.ts).
 */
export function briefNamesFromIndex(index: NameIndex): BriefNames {
  return {
    team: (name) => koreanName(index, name, TEAM_KINDS) ?? name,
    person: (name) => koreanName(index, name, PERSON_KINDS) ?? name,
  };
}

/** `configs/names.ko.json` → 이름 표기(색인을 만들어 `briefNamesFromIndex`) */
export function namesKoResolver(
  file: Pick<NamesKoFile, "entries"> & { ignore?: readonly string[] },
): BriefNames {
  return briefNamesFromIndex(buildNameIndex(file));
}

/** 브리핑 단위 대회 표기(D30) */
export type BriefCompForm = "nameKo" | "shortKo";

export interface BriefTemplateContext {
  /** 대회 표기(competitions.json nameKo·shortKo — D30), 입력의 comp(nameEn — 코드 별칭도 인정)로 찾는다 */
  competitions: readonly Pick<
    CompetitionConfig,
    "id" | "nameEn" | "nameKo" | "shortKo"
  >[];
  names?: BriefNames;
  /**
   * 브리핑 단위 대회 표기 — `templateBriefLines`·`templateLineForRefs`는 없으면 입력으로 고른다(`chooseBriefCompForm`),
   * 줄 함수(`templateMatchLine`·`templateStandingsLine`)는 없으면 nameKo.
   */
  compForm?: BriefCompForm;
}

/**
 * 입력 대회(nameEn, 또는 names.ts `COMPETITION_EN_ALIASES`의 별칭 — M0 입력의 'Champions League') → 그 표기의 이름.
 * 설정에 없으면 입력 표기 그대로.
 */
export function briefCompLabel(
  comp: string,
  ctx: Pick<BriefTemplateContext, "competitions">,
  form: BriefCompForm = "nameKo",
): string {
  const config =
    ctx.competitions.find((c) => c.nameEn === comp) ??
    ctx.competitions.find((c) => COMPETITION_EN_ALIASES[c.id].includes(comp));
  if (!config) return comp;
  return form === "shortKo" ? config.shortKo : config.nameKo;
}

// ─── 입력 해석 ───────────────────────────────────────────────────────────

interface Pair {
  home: number;
  away: number;
}

type Side = "home" | "away";

const other = (side: Side): Side => (side === "home" ? "away" : "home");

/** "h-a" → 점수 — 형식이 다르면 null */
export function parseScorePair(text: string | undefined): Pair | null {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(text ?? "");
  return m ? { home: Number(m[1]), away: Number(m[2]) } : null;
}

/** "90+2" → 정렬 키 [90, 2] — 형식이 다르면 null */
function minuteKey(min: string): [number, number] | null {
  const m = /^(\d{1,3})(?:\+(\d{1,2}))?$/.exec(min);
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : null;
}

interface GoalFact {
  side: Side;
  player: string;
  min: string;
  penalty: boolean;
  ownGoal: boolean;
}

interface MatchFacts {
  ft: Pair;
  /** 이긴 쪽(승부차기 경기는 승부차기 결과) — 무승부면 null */
  winner: Side | null;
  margin: number;
  aet: boolean;
  /** 승부차기 점수(홈-원정) — 승부차기 경기만 */
  pens: Pair | null;
  /** 이긴 팀이 뒤진 적이 있다(전반 스코어 또는 완전한 득점 순서로 확인될 때만 true) */
  comeback: boolean;
  /** 시간 순 득점 — 득점 목록이 완전하고 점수와 맞을 때만, 아니면 null */
  goals: GoalFact[] | null;
}

/**
 * 입력 득점 목록 → 시간 순 득점(쪽 판정). 목록이 없거나(null) 팀 이름이 home·away와 맞지 않거나, 분 형식이 다르거나, 쪽별 득점 수가
 * 최종 점수와 다르면 null — 득점자 서술을 하지 않는다(입력과 맞는지 확인할 수 없는 사실은 쓰지 않음).
 */
function goalFacts(
  match: Pick<BriefInputMatch, "home" | "away" | "goals">,
  ft: Pair,
): GoalFact[] | null {
  if (match.goals === null || match.home === match.away) return null;
  const keyed: Array<{ fact: GoalFact; key: [number, number]; i: number }> = [];
  for (const [i, g] of match.goals.entries()) {
    const side: Side | null =
      g.team === match.home ? "home" : g.team === match.away ? "away" : null;
    const key = minuteKey(g.min);
    if (side === null || key === null) return null;
    keyed.push({
      fact: {
        side,
        player: g.player,
        min: g.min,
        penalty: g.type === "penalty",
        ownGoal: g.type === "own_goal",
      },
      key,
      i,
    });
  }
  keyed.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.i - b.i);
  const facts = keyed.map((k) => k.fact);
  const count = (side: Side) => facts.filter((f) => f.side === side).length;
  if (count("home") !== ft.home || count("away") !== ft.away) return null;
  return facts;
}

function sideByScore(p: Pair): Side | null {
  return p.home > p.away ? "home" : p.away > p.home ? "away" : null;
}

function matchFacts(match: BriefInputMatch): MatchFacts | null {
  const ft = parseScorePair(match.ft);
  if (!ft) return null;
  const pens = match.pens !== undefined ? parseScorePair(match.pens) : null;
  if (match.pens !== undefined && !pens) return null;
  const aet = match.aet === true || pens !== null;
  const byFt = sideByScore(ft);
  const winner = byFt ?? (pens ? sideByScore(pens) : null);
  const goals = goalFacts(match, ft);
  let comeback = false;
  if (byFt !== null) {
    const loser = other(byFt);
    const ht = parseScorePair(match.ht);
    if (ht && ht[byFt] < ht[loser]) comeback = true;
    if (goals) {
      const running: Pair = { home: 0, away: 0 };
      for (const g of goals) {
        running[g.side] += 1;
        if (running[byFt] < running[loser]) comeback = true;
      }
    }
  }
  return {
    ft,
    winner,
    margin: Math.abs(ft.home - ft.away),
    aet,
    pens,
    comeback,
    goals,
  };
}

/** 점수를 `first` 쪽 먼저 — "2-1" */
function scoreFrom(pair: Pair, first: Side): string {
  return `${pair[first]}-${pair[other(first)]}`;
}

// ─── 경기 줄 ─────────────────────────────────────────────────────────────

/** 조각을 공백 하나로 잇는다(빈 조각은 건너뜀) */
function words(...parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => !!p).join(" ");
}

/** 장소 구 — 대회 표기(label)와 주어 쪽(side, 무승부 짝 주어면 null). 중립 경기장 결승은 '결승에서' */
function venuePhrase(
  label: string | null,
  side: Side | null,
  neutral: boolean,
): string {
  if (neutral) return label ? `${label} 결승에서` : "결승에서";
  if (side === null) return label ? `${label}에서` : "";
  if (side === "home") return label ? `${label} 홈경기에서` : "";
  return label ? `${label} 원정에서` : "원정에서";
}

/** 득점자 구 — full(득점자 + 분)·mid(득점자) */
interface Clause {
  full: string;
  mid: string;
}

/** 이긴 팀의 득점자 구(해트트릭·결승골) — 쓸 수 없으면 null */
function winnerClause(
  facts: MatchFacts,
  person: (name: string) => string,
): Clause | null {
  const winner = facts.winner;
  const goals = facts.goals;
  if (winner === null || goals === null) return null;
  // 해트트릭 — 이긴 팀 선수(자책골 제외)가 3골 이상. 여럿이면 많이 넣은 선수, 같으면 먼저 넣은 선수
  const tally = new Map<string, number>();
  for (const g of goals) {
    if (g.side === winner && !g.ownGoal) {
      tally.set(g.player, (tally.get(g.player) ?? 0) + 1);
    }
  }
  let top: { player: string; n: number } | null = null;
  for (const [player, n] of tally) if (!top || n > top.n) top = { player, n };
  if (top && top.n >= HAT_TRICK) {
    const feat = top.n === HAT_TRICK ? "해트트릭을" : `${top.n}골을`;
    const clause = `${person(top.player)}의 ${feat} 앞세워`;
    return { full: clause, mid: clause };
  }
  if (facts.margin >= BIG_MARGIN) return null;
  // 결승골 — 이긴 팀의 (진 팀 점수 + 1)번째 골
  const loserGoals = facts.ft[other(winner)];
  const decisive = goals.filter((g) => g.side === winner)[loserGoals];
  if (!decisive || decisive.ownGoal) return null;
  const kind = decisive.penalty ? "PK 결승골로" : "결승골로";
  const who = person(decisive.player);
  return {
    full: `${who}의 ${decisive.min}분 ${kind}`,
    mid: `${who}의 ${kind}`,
  };
}

/** 대회 표기 하나(label — null이면 대회 없이)로 만든 문장 변형(full·mid는 없을 수 있다) */
interface Sentences {
  full: string | null;
  mid: string | null;
  base: string;
}

function sentence(text: string): string {
  return `${text}.`;
}

/** 승리 문장 — 이긴 팀이 주어, 이긴 팀 점수 먼저 */
function winSentences(
  match: BriefInputMatch,
  facts: MatchFacts,
  winner: Side,
  names: BriefNames,
  label: string | null,
): Sentences {
  const neutral = NEUTRAL_ROUNDS.has(match.round);
  const W = names.team(winner === "home" ? match.home : match.away);
  const L = names.team(winner === "home" ? match.away : match.home);
  const venue = venuePhrase(label, winner, neutral);
  const subject = withJosa(W, "이/가");
  const score = scoreFrom(facts.ft, winner);
  const only = (base: string): Sentences => ({ full: null, mid: null, base });
  if (facts.pens) {
    const pens = scoreFrom(facts.pens, winner);
    return only(
      sentence(
        words(
          subject,
          venue,
          withJosa(L, "과/와"),
          facts.aet ? "연장까지" : null,
          withJosa(score, "으로/로"),
          "맞선 뒤 승부차기에서",
          withJosa(pens, "으로/로"),
          "이겼다",
        ),
      ),
    );
  }
  if (facts.aet) {
    return only(
      sentence(
        words(
          subject,
          venue,
          "연장 끝에",
          withJosa(L, "을/를"),
          withJosa(score, "으로/로"),
          "꺾었다",
        ),
      ),
    );
  }
  // 정규시간 승리 — 역전승 > 완파(3골 차 이상) > 꺾었다
  const tail = facts.comeback
    ? [`${L}에`, `${score} 역전승을 거뒀다`]
    : [
        withJosa(L, "을/를"),
        withJosa(score, "으로/로"),
        facts.margin >= BIG_MARGIN ? "완파했다" : "꺾었다",
      ];
  const build = (clause: string | null) =>
    sentence(words(subject, venue, clause, ...tail));
  const clause = winnerClause(facts, (n) => names.person(n));
  return {
    full: clause ? build(clause.full) : null,
    mid: clause ? build(clause.mid) : null,
    base: build(null),
  };
}

/** 무승부 문장 — 동점골이 있으면 동점 팀이 주어, 없으면 '{홈}과 {원정}이' */
function drawSentences(
  match: BriefInputMatch,
  facts: MatchFacts,
  names: BriefNames,
  label: string | null,
): Sentences {
  const neutral = NEUTRAL_ROUNDS.has(match.round);
  const H = names.team(match.home);
  const A = names.team(match.away);
  const score = scoreFrom(facts.ft, "home");
  const base = sentence(
    words(
      withJosa(H, "과/와"),
      withJosa(A, "이/가"),
      venuePhrase(label, null, neutral),
      facts.aet ? "연장 끝에" : null,
      withJosa(score, "으로/로"),
      "비겼다",
    ),
  );
  const only: Sentences = { full: null, mid: null, base };
  if (facts.aet || facts.ft.home === 0) return only;
  const last = facts.goals?.at(-1);
  if (!last || last.ownGoal) return only;
  // 마지막 골 = 동점골(무승부에서 마지막 골은 늘 동점을 만든다) — 그 골을 넣은 팀이 주어
  const E = names.team(last.side === "home" ? match.home : match.away);
  const O = names.team(last.side === "home" ? match.away : match.home);
  const who = names.person(last.player);
  const build = (clause: string) =>
    sentence(
      words(
        withJosa(E, "이/가"),
        venuePhrase(label, last.side, neutral),
        clause,
        withJosa(O, "과/와"),
        withJosa(score, "으로/로"),
        "비겼다",
      ),
    );
  return {
    full: build(`${who}의 ${last.min}분 동점골로`),
    mid: build(`${who}의 동점골로`),
    base,
  };
}

function matchSentences(
  match: BriefInputMatch,
  facts: MatchFacts,
  names: BriefNames,
  label: string | null,
): Sentences {
  return facts.winner === null
    ? drawSentences(match, facts, names, label)
    : winSentences(match, facts, facts.winner, names, label);
}

/** 후보 문장 중 목표 길이 안의 첫 문장, 없으면 상한 안의 첫 문장, 없으면 null(문장 중간을 자르지 않는다) */
function pickFitting(candidates: readonly string[]): { text: string } | null {
  const text =
    candidates.find((t) => t.length <= BRIEF_TEMPLATE_TARGET) ??
    candidates.find((t) => t.length <= BRIEF_LINE_MAX);
  return text === undefined ? null : { text };
}

interface LinePick {
  line: BriefLine;
  /** 고른 문장이 대회 표기를 담았나(대회 없이 기본 문장을 고르면 false) */
  labeled: boolean;
}

function pickMatchLine(
  match: BriefInputMatch,
  ctx: BriefTemplateContext,
  form: BriefCompForm,
): LinePick | null {
  const facts = matchFacts(match);
  if (!facts) return null;
  const names = ctx.names ?? ENGLISH_NAMES;
  const label = briefCompLabel(match.comp, ctx, form);
  const withLabel = matchSentences(match, facts, names, label);
  const bare = matchSentences(match, facts, names, null);
  // 대회와 함께 full → mid → base, 그다음 대회 없이 base
  const candidates: string[] = [];
  for (const t of [withLabel.full, withLabel.mid, withLabel.base, bare.base]) {
    if (t !== null && !candidates.includes(t)) candidates.push(t);
  }
  const picked = pickFitting(candidates);
  return picked === null
    ? null
    : {
        line: { text: picked.text, ai: false, refs: [match.id] },
        labeled: picked.text !== bare.base,
      };
}

/** 경기 1건 → 템플릿 줄(순수 함수). 점수 형식이 다르거나 80자 안의 문장이 없으면 null */
export function templateMatchLine(
  match: BriefInputMatch,
  ctx: BriefTemplateContext,
): BriefLine | null {
  return pickMatchLine(match, ctx, ctx.compForm ?? "nameKo")?.line ?? null;
}

// ─── 순위 줄 ─────────────────────────────────────────────────────────────

type StandingRow = BriefInputStandings["rows"][number];

/** 순위 묶음 1개의 구 — '{팀}이 승점 n으로 [대회 ]선두' · '{A}와 {B}가 승점 n으로 공동 2위' */
function standingsPhrase(
  group: readonly StandingRow[],
  names: BriefNames,
  label: string | null,
): string {
  const first = group[0]!;
  const tied = group.length > 1;
  const rank =
    first.pos === 1
      ? tied
        ? "공동 선두"
        : "선두"
      : tied
        ? `공동 ${first.pos}위`
        : `${first.pos}위`;
  const teams = group.map((r) => names.team(r.team));
  const subject =
    teams.length === 2
      ? `${withJosa(teams[0]!, "과/와")} ${withJosa(teams[1]!, "이/가")}`
      : withJosa(teams.join("·"), "이/가");
  return words(
    subject,
    "승점",
    withJosa(String(first.pts), "으로/로"),
    label,
    rank,
  );
}

function pickStandingsLine(
  standings: BriefInputStandings,
  ctx: BriefTemplateContext,
  form: BriefCompForm,
): LinePick | null {
  const names = ctx.names ?? ENGLISH_NAMES;
  const groups: StandingRow[][] = [];
  for (const row of standings.rows) {
    const last = groups.at(-1);
    if (last && last[0]!.pos === row.pos) last.push(row);
    else groups.push([row]);
  }
  // 같은 순위인데 승점이 다르면(응답 이상) 그 묶음부터 쓰지 않는다 — 공동 순위는 승점이 같을 때만(M1-23 '공동 n위' 규칙)
  const usable: StandingRow[][] = [];
  let teams = 0;
  for (const group of groups) {
    if (group.length > STANDINGS_GROUP_MAX) break;
    if (!group.every((r) => r.pts === group[0]!.pts)) break;
    usable.push(group);
    teams += group.length;
    if (usable.length >= STANDINGS_GROUPS_MAX) break;
  }
  if (teams < 2) return null;
  // 두 팀 이상을 담는 가장 짧은 묶음 수
  let minGroups = usable.length;
  for (let n = 0, count = 0; n < usable.length; n += 1) {
    count += usable[n]!.length;
    if (count >= 2) {
      minGroups = n + 1;
      break;
    }
  }
  const label = briefCompLabel(standings.comp, ctx, form);
  const candidates: string[] = [];
  for (let n = usable.length; n >= minGroups; n -= 1) {
    const phrases = usable
      .slice(0, n)
      .map((g, i) => standingsPhrase(g, names, i === 0 ? label : null));
    const lastPhrase = phrases.pop()!;
    candidates.push(
      sentence([...phrases, withJosa(lastPhrase, "이다/다")].join(", ")),
    );
  }
  const picked = pickFitting(candidates);
  return picked === null
    ? null
    : {
        line: { text: picked.text, ai: false, refs: [standings.id] },
        labeled: true,
      };
}

/**
 * 순위표 → 템플릿 줄(순수 함수). 같은 순위(공동)는 한 묶음으로 쓴다. 두 팀 이상을 담지 못하거나(표가 1팀) 첫 순위의 공동 팀이
 * 3팀을 넘거나 80자 안의 문장이 없으면 null.
 */
export function templateStandingsLine(
  standings: BriefInputStandings,
  ctx: BriefTemplateContext,
): BriefLine | null {
  return (
    pickStandingsLine(standings, ctx, ctx.compForm ?? "nameKo")?.line ?? null
  );
}

// ─── 브리핑 ──────────────────────────────────────────────────────────────

interface Composed {
  lines: BriefLine[];
  /** 대회 표기를 잃은 줄 수 — 대회 없이 기본 문장을 골랐거나 80자 안의 문장이 없어 빠진 입력 항목 */
  unlabeled: number;
}

function compose(
  input: Pick<BriefInput, "matches" | "standings">,
  ctx: BriefTemplateContext,
  form: BriefCompForm,
): Composed {
  const isPick = (p: LinePick | null): p is LinePick => p !== null;
  const matchAll = input.matches.map((m) => pickMatchLine(m, ctx, form));
  const matchPicks = matchAll.filter(isPick);
  if (matchPicks.length === 0) return { lines: [], unlabeled: 0 };
  const standingsPicks = input.standings
    .map((s) => pickStandingsLine(s, ctx, form))
    .filter(isPick)
    .slice(0, TEMPLATE_STANDINGS_LINES_MAX);
  let picks: LinePick[];
  if (standingsPicks.length === 0) {
    picks = matchPicks.slice(0, BRIEF_MAX_LINES);
  } else {
    const matches = matchPicks.slice(0, TEMPLATE_MATCH_LINES_WITH_STANDINGS);
    picks = [
      ...matches,
      ...standingsPicks.slice(0, BRIEF_MAX_LINES - matches.length),
    ];
  }
  // 게시되는 줄 중 대회를 잃은 줄 + 문장이 없어 빠진 경기(앞쪽 — 게시 범위 안)
  const dropped = matchAll
    .slice(0, picks.length)
    .filter((p) => p === null).length;
  return {
    lines: picks.map((p) => p.line),
    unlabeled: picks.filter((p) => !p.labeled).length + dropped,
  };
}

/**
 * 브리핑 단위 대회 표기(머리 주석) — `ctx.compForm`이 있으면 그것. 없으면 nameKo가 기본이고, shortKo로 만들 때 대회 표기를
 * 잃는 줄이 더 적을 때만 shortKo(득점자 분 같은 세부를 살리려고 약칭을 쓰지는 않는다).
 */
export function chooseBriefCompForm(
  input: Pick<BriefInput, "matches" | "standings">,
  ctx: BriefTemplateContext,
): BriefCompForm {
  if (ctx.compForm) return ctx.compForm;
  const long = compose(input, ctx, "nameKo");
  const short = compose(input, ctx, "shortKo");
  return short.unlabeled < long.unlabeled ? "shortKo" : "nameKo";
}

/**
 * 입력 전체 → 템플릿 브리핑 줄(최대 5줄, 순수 함수). 경기 줄은 입력 순서(중요도 순). 순위가 있으면 경기 4줄 + 순위 줄
 * (경기가 적으면 순위 줄 최대 2개로 채움), 없으면 경기 5줄. 경기가 없으면 빈 배열(`empty` 브리핑 — 호출 생략).
 * 대회 표기는 브리핑 단위로 하나(`chooseBriefCompForm`).
 */
export function templateBriefLines(
  input: Pick<BriefInput, "matches" | "standings">,
  ctx: BriefTemplateContext,
): BriefLine[] {
  return compose(input, ctx, chooseBriefCompForm(input, ctx)).lines;
}

/**
 * 근거 id → 그 항목의 템플릿 줄(줄 단위 강등 — M1-45가 LLM 줄의 `refs`로 부른다). 입력에 있는 첫 경기 id, 없으면 첫 순위 id의
 * 줄. 어느 것도 없으면 null(그 줄은 버린다). 같은 근거의 줄이 브리핑에 이미 있는지는 호출부가 본다. 대회 표기는 같은 입력의
 * 브리핑 단위 표기(`ctx.compForm` — 없으면 입력으로 고른다).
 */
export function templateLineForRefs(
  input: Pick<BriefInput, "matches" | "standings">,
  refs: readonly string[],
  ctx: BriefTemplateContext,
): BriefLine | null {
  const lineCtx: BriefTemplateContext = {
    ...ctx,
    compForm: chooseBriefCompForm(input, ctx),
  };
  for (const ref of refs) {
    const match = input.matches.find((m) => m.id === ref);
    if (match) return templateMatchLine(match, lineCtx);
  }
  for (const ref of refs) {
    const standings = input.standings.find((s) => s.id === ref);
    if (standings) return templateStandingsLine(standings, lineCtx);
  }
  return null;
}
