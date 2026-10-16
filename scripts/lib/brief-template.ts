/**
 * 브리핑 코드 템플릿 문장 (M1-19 — PRD FR-26·FR-27·FR-29, D24·D30·D38). LLM 없이 정형 입력(brief-input.ts `BriefInput`)만으로
 * "오늘의 5줄"을 만든다. 결정적(같은 입력 → 같은 줄)이고 모든 줄이 `ai:false`(“AI 작성” 라벨 없음)·근거 id(`refs`)를 갖는다.
 * 쓰는 곳(하나의 생성기 — FR-27 "같은 템플릿 생성기"): 예산 초과(M1-22)·LLM 실패·출력 전체 실패(FR-29)·브리핑 마감 초과(FR-26, M1-45)
 * 의 전체 강등(`templateBriefLines`)과 줄 단위 강등(`templateLineForRefs` — M1-45가 근거 id로 그 줄만 바꾼다).
 * football-data 데이터(결과·순위)만으로 모든 줄을 만들 수 있다 — 득점자(API-Football)는 있을 때만 서술을 더한다(M1-47 이월).
 *
 * ── 문형 (입력에 없는 사실은 쓰지 않는다 — CLAUDE.md §1-7) ─────────────────────────────────────────────
 *   경기: `{대회} {홈} h-a {원정}, {서술}.` — 스코어는 **홈-원정 고정**(D30: 템플릿·스코어 행은 홈-원정, '주어 팀 먼저'는 LLM 문장만).
 *     서술의 주어는 '홈팀이·원정팀이'(스코어 순서와 같은 기준 — 팀 이름을 되풀이하지 않는다). 중립 경기장 결승(round FINAL)만
 *     '{팀}의 승리로 끝났다'처럼 이긴 팀 이름을 쓴다. 서술은 입력에서 계산되는 것만 고른다:
 *       승리 — `홈팀이 이겼다` · 3골 차 이상 `홈팀이 n골 차로 이겼다`(n = 두 점수의 차 — D40 ② 파생 숫자 규칙과 같은 종류)
 *              · 이긴 팀이 뒤진 적이 있으면 `홈팀이 역전승을 거뒀다`(전반 스코어나 완전한 득점 순서로 확인될 때만)
 *       득점 목록이 완전하고 점수와 맞으면(goals 배열) — 해트트릭(이긴 팀 같은 선수 3골 이상) `{선수}의 해트트릭으로 홈팀이 이겼다`,
 *              2골 차 이내 승리는 결승골(이긴 팀의 (진 팀 점수 + 1)번째 골) `{선수}의 {분}분 결승골로 원정팀이 이겼다`(PK면 'PK 결승골',
 *              자책골이면 득점자 서술 없이), 무승부는 마지막 골(동점골) `{선수}의 {분}분 동점골로 두 팀이 비겼다`
 *       무승부 — `두 팀이 승부를 가리지 못했다` · 0-0 `득점 없이 비겼다`
 *       연장 — `연장 끝에 홈팀이 이겼다` · `연장 끝에 비겼다`(두 경기 합산은 입력에 없어 그 경기 결과만) / 승부차기 —
 *              `승부차기(h-a) 끝에 홈팀이 이겼다`(홈-원정)
 *   순위: `{대회} 순위는 1위 {팀}(승점 n), 2위 {팀}(승점 n) 순이다.` — 같은 순위는 `공동 n위 {팀}·{팀}`(응답 순서), 전일 순위가
 *     없으므로 변동(올랐다·내려갔다)은 쓰지 않는다(D40 ③). 진행 중 경기가 있는 대회는 입력에 순위가 없어 문장도 없다(M1-44 이월).
 *   길이: 목표 60자(FR-23 '60자 내외') 안에 드는 가장 자세한 문장을 고르고, 없으면 80자(D40 ⑤ 상한) 안의 첫 문장, 그것도 없으면
 *     스코어만(80자 안일 때), 그것도 넘으면 그 줄을 만들지 않는다(문장 중간 절단 안 함). 문장 변형 순서: 대회 nameKo로
 *     (득점자 + 분 → 득점자) → shortKo로 (같은 순서) → 기본 서술(nameKo → shortKo → 대회 생략).
 *
 * ── 고유명사·조사 (M1-21과의 경계) ──────────────────────────────────────────────────────────────────
 *   이름은 `BriefNames`로 바꾼다 — 기본은 영문 그대로(`ENGLISH_NAMES`), 수집 경로는 `configs/names.ko.json` 단순 대조
 *   (`namesKoResolver` — 미등록 이름은 영문 그대로, unknown-names 적재는 M1-21). **문형은 이름 바로 뒤에 받침에 따라 바뀌는 조사
 *   (이/가·은/는·을/를·과/와·으로/로)를 붙이지 않는다** — 이름 뒤에는 쉼표·괄호·'·'·공백·불변 조사 '의'만 온다. 그래서 템플릿 줄은
 *   이름을 바꾼 뒤 조사 보정이 필요 없고, 길이도 바꾼 이름으로 잰다(치환 뒤 길이 — PRD §9.4). 조사는 고정 낱말 뒤에만 쓴다
 *   ('홈팀이'·'결승골로'·'역전승을'·'두 팀이' …).
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

/** 줄 길이 목표(FR-23 '60자 내외') — 이 안에 드는 가장 자세한 변형을 고른다 */
export const BRIEF_TEMPLATE_TARGET = 60;
/** 순위가 있을 때 경기 줄 수 상한(나머지 자리는 순위 줄) */
export const TEMPLATE_MATCH_LINES_WITH_STANDINGS = 4;
/** 순위 줄 상한 */
export const TEMPLATE_STANDINGS_LINES_MAX = 2;
/** 해트트릭으로 쓰는 골 수(이보다 많으면 'n골') */
const HAT_TRICK = 3;
/** 'n골 차'로 쓰는 최소 점수 차 — 이보다 작으면 결승골을 쓴다 */
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

/** 영문 그대로(M1-21 치환 경로가 이어받을 때의 기본) */
export const ENGLISH_NAMES: BriefNames = Object.freeze({
  team: (name: string) => name,
  person: (name: string) => name,
});

/**
 * `configs/names.ko.json` 단순 대조 — 영문 표기(`en`, 대소문자 무시)가 정확히 같으면 한글 표기(`ko`). 팀은 kind team, 사람은
 * player·manager. 미등록 이름은 영문 그대로(적재는 M1-21).
 */
export function namesKoResolver(
  file: Pick<NamesKoFile, "entries">,
): BriefNames {
  const teams = new Map<string, string>();
  const people = new Map<string, string>();
  for (const entry of file.entries) {
    const target =
      entry.kind === "team"
        ? teams
        : entry.kind === "player" || entry.kind === "manager"
          ? people
          : null;
    if (!target) continue;
    for (const en of entry.en) target.set(en.toLowerCase(), entry.ko);
  }
  return {
    team: (name) => teams.get(name.toLowerCase()) ?? name,
    person: (name) => people.get(name.toLowerCase()) ?? name,
  };
}

export interface BriefTemplateContext {
  /** 대회 표기(competitions.json nameKo·shortKo — D30), 입력의 comp(nameEn)로 찾는다 */
  competitions: readonly Pick<
    CompetitionConfig,
    "nameEn" | "nameKo" | "shortKo"
  >[];
  names?: BriefNames;
}

// ─── 입력 해석 ───────────────────────────────────────────────────────────

interface Pair {
  home: number;
  away: number;
}

type Side = "home" | "away";

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
    const loser: Side = byFt === "home" ? "away" : "home";
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

// ─── 경기 줄 ─────────────────────────────────────────────────────────────

/** 서술 변형 — full(득점자 + 분) → mid(득점자) → base(득점자 없음). full·mid는 없을 수 있다 */
interface Predicates {
  full: string | null;
  mid: string | null;
  base: string;
}

/** 이긴 팀의 득점자 서술(해트트릭·결승골) — 쓸 수 없으면 null */
function winnerClause(
  facts: MatchFacts,
  person: (name: string) => string,
): { full: string; mid: string } | null {
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
    const feat = top.n === HAT_TRICK ? "해트트릭으로" : `${top.n}골로`;
    const clause = `${person(top.player)}의 ${feat}`;
    return { full: clause, mid: clause };
  }
  if (facts.margin >= BIG_MARGIN) return null;
  // 결승골 — 이긴 팀의 (진 팀 점수 + 1)번째 골
  const loserGoals = winner === "home" ? facts.ft.away : facts.ft.home;
  const decisive = goals.filter((g) => g.side === winner)[loserGoals];
  if (!decisive || decisive.ownGoal) return null;
  const kind = decisive.penalty ? "PK 결승골로" : "결승골로";
  const who = person(decisive.player);
  return {
    full: `${who}의 ${decisive.min}분 ${kind}`,
    mid: `${who}의 ${kind}`,
  };
}

function winPredicates(
  facts: MatchFacts,
  person: (name: string) => string,
): Predicates {
  const subject = facts.winner === "home" ? "홈팀이" : "원정팀이";
  const verb = facts.comeback ? "역전승을 거뒀다" : "이겼다";
  const base =
    facts.margin >= BIG_MARGIN
      ? facts.comeback
        ? `${subject} ${facts.margin}골 차 역전승을 거뒀다`
        : `${subject} ${facts.margin}골 차로 이겼다`
      : `${subject} ${verb}`;
  const clause = winnerClause(facts, person);
  if (!clause) return { full: null, mid: null, base };
  return {
    full: `${clause.full} ${subject} ${verb}`,
    mid: `${clause.mid} ${subject} ${verb}`,
    base,
  };
}

function drawPredicates(
  facts: MatchFacts,
  person: (name: string) => string,
): Predicates {
  if (facts.ft.home === 0) {
    return { full: null, mid: null, base: "득점 없이 비겼다" };
  }
  const base = "두 팀이 승부를 가리지 못했다";
  const last = facts.goals?.at(-1);
  if (!last || last.ownGoal) return { full: null, mid: null, base };
  const who = person(last.player);
  return {
    full: `${who}의 ${last.min}분 동점골로 두 팀이 비겼다`,
    mid: `${who}의 동점골로 두 팀이 비겼다`,
    base,
  };
}

function matchPredicates(
  match: BriefInputMatch,
  facts: MatchFacts,
  names: BriefNames,
): Predicates {
  const person = (name: string) => names.person(name);
  const only = (base: string): Predicates => ({ full: null, mid: null, base });
  if (facts.winner === null) {
    return facts.aet ? only("연장 끝에 비겼다") : drawPredicates(facts, person);
  }
  // 중립 경기장(결승) — 홈·원정 대신 이긴 팀 이름
  if (NEUTRAL_ROUNDS.has(match.round)) {
    const winnerName = names.team(
      facts.winner === "home" ? match.home : match.away,
    );
    if (facts.pens) {
      return only(
        `${winnerName}의 승부차기(${facts.pens.home}-${facts.pens.away}) 승리로 끝났다`,
      );
    }
    return only(
      facts.aet
        ? `${winnerName}의 연장 승리로 끝났다`
        : `${winnerName}의 승리로 끝났다`,
    );
  }
  const subject = facts.winner === "home" ? "홈팀이" : "원정팀이";
  if (facts.pens) {
    return only(
      `승부차기(${facts.pens.home}-${facts.pens.away}) 끝에 ${subject} 이겼다`,
    );
  }
  if (facts.aet) return only(`연장 끝에 ${subject} 이겼다`);
  return winPredicates(facts, person);
}

function compLabels(comp: string, ctx: BriefTemplateContext): string[] {
  const config = ctx.competitions.find((c) => c.nameEn === comp);
  if (!config) return [comp];
  return config.shortKo !== config.nameKo
    ? [config.nameKo, config.shortKo]
    : [config.nameKo];
}

/**
 * 후보 문장 중 목표 길이 안의 첫 문장, 없으면 상한 안의 첫 문장. 그것도 없으면 마지막 수단(`fallback` — 스코어만)이 상한 안이면
 * 그것, 아니면 null(문장 중간을 자르지 않는다).
 */
function pickFitting(
  candidates: readonly string[],
  fallback: string | null = null,
): string | null {
  return (
    candidates.find((t) => t.length <= BRIEF_TEMPLATE_TARGET) ??
    candidates.find((t) => t.length <= BRIEF_LINE_MAX) ??
    (fallback !== null && fallback.length <= BRIEF_LINE_MAX ? fallback : null)
  );
}

/** 경기 1건 → 템플릿 줄(순수 함수). 점수 형식이 다르면 null(입력 빌더가 만든 값이면 생기지 않는다) */
export function templateMatchLine(
  match: BriefInputMatch,
  ctx: BriefTemplateContext,
): BriefLine | null {
  const facts = matchFacts(match);
  if (!facts) return null;
  const names = ctx.names ?? ENGLISH_NAMES;
  const scoreline = `${names.team(match.home)} ${facts.ft.home}-${facts.ft.away} ${names.team(match.away)}`;
  const comps = compLabels(match.comp, ctx);
  const pred = matchPredicates(match, facts, names);
  const sentence = (comp: string, predicate: string) =>
    `${comp ? `${comp} ` : ""}${scoreline}, ${predicate}.`;
  const candidates: string[] = [];
  for (const comp of comps) {
    for (const p of [pred.full, pred.mid]) {
      if (p !== null) candidates.push(sentence(comp, p));
    }
  }
  for (const comp of [...comps, ""]) candidates.push(sentence(comp, pred.base));
  const text = pickFitting(candidates, scoreline);
  return text === null ? null : { text, ai: false, refs: [match.id] };
}

// ─── 순위 줄 ─────────────────────────────────────────────────────────────

/**
 * 순위표 → 템플릿 줄(순수 함수). 같은 순위(공동)는 한 묶음으로 쓴다. 두 팀 이상을 담지 못하거나(표가 1팀) 첫 순위의 공동 팀이
 * 3팀을 넘으면 null.
 */
export function templateStandingsLine(
  standings: BriefInputStandings,
  ctx: BriefTemplateContext,
): BriefLine | null {
  const names = ctx.names ?? ENGLISH_NAMES;
  const groups: Array<Array<BriefInputStandings["rows"][number]>> = [];
  for (const row of standings.rows) {
    const last = groups.at(-1);
    if (last && last[0]!.pos === row.pos) last.push(row);
    else groups.push([row]);
  }
  const labels: string[] = [];
  let teams = 0;
  for (const group of groups) {
    if (group.length > STANDINGS_GROUP_MAX) break;
    const first = group[0]!;
    const samePts = group.every((r) => r.pts === first.pts);
    const body = samePts
      ? `${group.map((r) => names.team(r.team)).join("·")}(승점 ${first.pts})`
      : group.map((r) => `${names.team(r.team)}(승점 ${r.pts})`).join("·");
    labels.push(
      group.length > 1
        ? `공동 ${first.pos}위 ${body}`
        : `${first.pos}위 ${body}`,
    );
    teams += group.length;
    if (labels.length >= STANDINGS_GROUPS_MAX) break;
  }
  if (teams < 2) return null;
  // 두 팀 이상을 담는 가장 짧은 묶음 수
  let minGroups = 0;
  for (let n = 0, count = 0; n < labels.length; n += 1) {
    count += groups[n]!.length;
    if (count >= 2) {
      minGroups = n + 1;
      break;
    }
  }
  const comps = compLabels(standings.comp, ctx);
  const candidates: string[] = [];
  for (let n = labels.length; n >= minGroups; n -= 1) {
    for (const comp of comps) {
      candidates.push(
        `${comp} 순위는 ${labels.slice(0, n).join(", ")} 순이다.`,
      );
    }
  }
  const text = pickFitting(candidates);
  return text === null ? null : { text, ai: false, refs: [standings.id] };
}

// ─── 브리핑 ──────────────────────────────────────────────────────────────

/**
 * 입력 전체 → 템플릿 브리핑 줄(최대 5줄, 순수 함수). 경기 줄은 입력 순서(중요도 순). 순위가 있으면 경기 4줄 + 순위 줄
 * (경기가 적으면 순위 줄 최대 2개로 채움), 없으면 경기 5줄. 경기가 없으면 빈 배열(`empty` 브리핑 — 호출 생략).
 */
export function templateBriefLines(
  input: Pick<BriefInput, "matches" | "standings">,
  ctx: BriefTemplateContext,
): BriefLine[] {
  const matchLines = input.matches
    .map((m) => templateMatchLine(m, ctx))
    .filter((l): l is BriefLine => l !== null);
  if (matchLines.length === 0) return [];
  const standingsLines = input.standings
    .map((s) => templateStandingsLine(s, ctx))
    .filter((l): l is BriefLine => l !== null)
    .slice(0, TEMPLATE_STANDINGS_LINES_MAX);
  if (standingsLines.length === 0) return matchLines.slice(0, BRIEF_MAX_LINES);
  const matches = matchLines.slice(0, TEMPLATE_MATCH_LINES_WITH_STANDINGS);
  return [
    ...matches,
    ...standingsLines.slice(0, BRIEF_MAX_LINES - matches.length),
  ];
}

/**
 * 근거 id → 그 항목의 템플릿 줄(줄 단위 강등 — M1-45가 LLM 줄의 `refs`로 부른다). 입력에 있는 첫 경기 id, 없으면 첫 순위 id의
 * 줄. 어느 것도 없으면 null(그 줄은 버린다). 같은 근거의 줄이 브리핑에 이미 있는지는 호출부가 본다.
 */
export function templateLineForRefs(
  input: Pick<BriefInput, "matches" | "standings">,
  refs: readonly string[],
  ctx: BriefTemplateContext,
): BriefLine | null {
  for (const ref of refs) {
    const match = input.matches.find((m) => m.id === ref);
    if (match) return templateMatchLine(match, ctx);
  }
  for (const ref of refs) {
    const standings = input.standings.find((s) => s.id === ref);
    if (standings) return templateStandingsLine(standings, ctx);
  }
  return null;
}
