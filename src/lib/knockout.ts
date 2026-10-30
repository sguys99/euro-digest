/**
 * UCL 단계 판정 · 녹아웃 대진(tie) 묶기 (PRD FR-43, PRD §15 D63 ④, plan M2-12)
 *
 * I/O 없는 순수 함수만 둔다. 지금 시각은 호출부가 넣는다(빌드 시각 — 정적 페이지라 하루 1회 발행 빌드가 다시 굳힌다).
 * 입력은 대회 파일의 경기 목록(`Match.round` — 리그 페이즈 = matchday 숫자 문자열, 녹아웃 = `ko-playoff|ko-r16|ko-qf|ko-sf-<차전>`·
 * `ko-final`, M2-02 어댑터). 팀이 정해지지 않은 녹아웃 경기(추첨 전 — football-data homeTeam·awayTeam null)는 어댑터가 싣지 않으므로
 * "녹아웃 경기가 데이터에 있다" = 대진이 발표됐다.
 *
 * 단계 판정(`competitionPhaseOf`)
 * - **리그 페이즈 끝** = 숫자 라운드 경기가 모두 '예정이 아님' — 종료·연기, 또는 킥오프 + 3시간이 지나 "결과 대기"(대회 라운드와 같은
 *   기준 `matchStateOf` — 결과가 늦게 들어와도 단계 전환이 데이터 지연에 묶이지 않게).
 * - `league`: 리그 페이즈 진행 중(또는 경기 자료 없음) — 기본 보기 = 순위표.
 * - `between`: 리그 페이즈가 끝났고 녹아웃 경기는 아직 없다(대진 추첨·발표 전) — 기본 보기 = 순위표(최종), 머리 문구로 알린다.
 * - `knockout`: 녹아웃 경기가 하나라도 있고 리그 페이즈가 끝났다(리그 경기가 아예 없는 파일도 녹아웃) — 기본 보기 = 대진.
 *   지금 단계 = 결정되지 않은 대진이 있는 가장 앞 단계, 모두 결정됐으면 데이터에 있는 가장 뒤 단계(`stageDone` — 다음 단계 대진 발표 전,
 *   결승이면 시즌 끝). 같은 날 2차전이 이틀에 나뉘어 다음 단계 대진 일부가 먼저 실려도 지금 단계는 앞 단계로 남는다.
 *   녹아웃 경기가 있는데 리그 페이즈가 덜 끝났으면(데이터 이상) `league`로 두되 대진 목록은 화면이 따로 보여 줄 수 있다.
 *
 * 대진 묶기(`tiesOf`)
 * - 같은 단계·같은 두 팀(순서 무관) 경기를 한 대진으로 묶는다. 차전 = 라운드 끝 번호(어댑터가 킥오프 순으로 붙였다). 결승은 단판.
 * - 대진의 "앞 팀" = 1차전 홈 팀(1차전이 없으면 2차전 원정 팀, 결승은 데이터의 홈). 합산은 끝난 차전만 더한다(스코어 = 연장 포함·승부차기 제외).
 * - 진출 팀(모든 차전 종료 뒤): 합산 골 → 같으면 마지막 차전 승부차기(`score.pens`). 마지막 차전이 연장(`score.aet`)이고 합산이 갈렸으면
 *   "연장 끝"으로 표기한다. **원정 다득점 규칙은 쓰지 않는다** — UEFA가 2021-22 시즌부터 폐지했다(합산이 같으면 연장 → 승부차기).
 *   모든 차전이 끝났는데 합산이 같고 승부차기 자료도 없으면 진출 팀을 지어내지 않는다(`unresolved` — "진출 팀 자료 없음").
 * - 상태: `scheduled` 끝난 차전 없음 · `in-progress` 일부 차전만 끝남(2차전 예정·결과 대기·연기·일정 미정) · `decided` 진출 팀 결정 ·
 *   `unresolved` 모두 끝났으나 판정 자료 부족.
 */
import {
  matchStateOf,
  matchView,
  type MatchView,
  type TeamLookup,
  type TeamView,
} from "@/lib/competition-view";
import type { Match } from "@/lib/schema/competition";
import { formatKst } from "@/lib/time";

// ─── 단계 ───────────────────────────────────────────────────────────────────

/** 녹아웃 단계 코드 — 진행 순서 */
export const KNOCKOUT_STAGES = [
  "ko-playoff",
  "ko-r16",
  "ko-qf",
  "ko-sf",
  "ko-final",
] as const;
export type KnockoutStage = (typeof KNOCKOUT_STAGES)[number];

/** 단계 이름 — 라운드 표기(`roundKeyOf`)와 같은 낱말 */
export const KNOCKOUT_STAGE_LABEL: Readonly<Record<KnockoutStage, string>> = {
  "ko-playoff": "녹아웃 PO",
  "ko-r16": "16강",
  "ko-qf": "8강",
  "ko-sf": "4강",
  "ko-final": "결승",
};

/** 단판 단계(차전 번호 없음 — 어댑터 `SINGLE_LEG_ROUNDS`와 같다) */
const SINGLE_LEG: ReadonlySet<KnockoutStage> = new Set(["ko-final"]);

/** 라운드가 녹아웃인가 — 리그 페이즈 라운드는 숫자 문자열 */
export function isKnockoutRound(round: string): boolean {
  return round.startsWith("ko-");
}

/** 라운드 → 녹아웃 단계(리그 페이즈·모르는 꼴이면 null) */
export function stageOfRound(round: string): KnockoutStage | null {
  for (const stage of KNOCKOUT_STAGES) {
    if (round === stage || round.startsWith(`${stage}-`)) return stage;
  }
  return null;
}

/** 라운드 → 차전 번호(단판·번호 없음이면 null) */
export function legOfRound(round: string): number | null {
  const stage = stageOfRound(round);
  if (!stage) return null;
  const rest = round.slice(stage.length + 1);
  return /^\d+$/.test(rest) ? Number(rest) : null;
}

function stageIndex(stage: KnockoutStage): number {
  return KNOCKOUT_STAGES.indexOf(stage);
}

// ─── 대진 ───────────────────────────────────────────────────────────────────

export type TieState = "scheduled" | "in-progress" | "decided" | "unresolved";

/** 진출 결정 방식 — 합산(정규·마지막 차전 정규 시간) · 연장 끝 · 승부차기 */
export type TieDecider = "aggregate" | "extra-time" | "penalties";

export interface Tie {
  stage: KnockoutStage;
  /** 앵커 id — `tie-ko-r16-arsenal-inter`(앞 팀 · 뒤 팀) */
  id: string;
  /** 앞 팀 slug(1차전 홈) */
  first: string;
  /** 뒤 팀 slug */
  second: string;
  /** 차전 순서 경기(결승은 1개) */
  legs: Match[];
  /** 이 단계의 차전 수 — 2(홈·원정) · 1(결승) */
  legCount: 1 | 2;
  /** 끝난 차전 합산(앞 팀 · 뒤 팀) — 끝난 차전이 없으면 null */
  aggregate: { first: number; second: number } | null;
  state: TieState;
  /** 진출 팀 slug(결정 전·판정 불가 null) */
  winner: string | null;
  decidedBy: TieDecider | null;
  /** 승부차기(진출 팀 · 탈락 팀 순) — 승부차기로 갈렸을 때만 */
  shootout: { winner: number; loser: number } | null;
}

/** 대진 앵커 id */
export function tieAnchorId(
  stage: KnockoutStage,
  first: string,
  second: string,
): string {
  return `tie-${stage}-${first}-${second}`.replace(/[^A-Za-z0-9-]/g, "-");
}

function byKickoffThenId(a: Match, b: Match): number {
  return a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id);
}

/** 한 팀이 그 경기에서 넣은 골(스코어 = 연장 포함·승부차기 제외) */
function goalsFor(match: Match, team: string): number {
  if (!match.score) return 0;
  return match.home === team ? match.score.h : match.score.a;
}

/** 같은 단계·같은 두 팀 경기 → 대진 하나(머리 주석 규칙) */
export function buildTie(stage: KnockoutStage, matches: readonly Match[]): Tie {
  const legCount: 1 | 2 = SINGLE_LEG.has(stage) ? 1 : 2;
  const legs = [...matches]
    .sort(
      (a, b) =>
        (legOfRound(a.round) ?? 0) - (legOfRound(b.round) ?? 0) ||
        byKickoffThenId(a, b),
    )
    .slice(0, legCount);
  const firstLeg = legs.find((m) => legOfRound(m.round) !== 2) ?? null;
  const anyLeg = legs[0]!;
  const first =
    legCount === 1 || firstLeg ? (firstLeg ?? anyLeg).home : anyLeg.away;
  const second = anyLeg.home === first ? anyLeg.away : anyLeg.home;

  const done = legs.filter((m) => m.status === "finished" && m.score);
  const aggregate =
    done.length > 0
      ? {
          first: done.reduce((sum, m) => sum + goalsFor(m, first), 0),
          second: done.reduce((sum, m) => sum + goalsFor(m, second), 0),
        }
      : null;

  const base = {
    stage,
    id: tieAnchorId(stage, first, second),
    first,
    second,
    legs,
    legCount,
    aggregate,
  };
  if (!aggregate) {
    return {
      ...base,
      state: "scheduled",
      winner: null,
      decidedBy: null,
      shootout: null,
    };
  }
  if (done.length < legCount) {
    return {
      ...base,
      state: "in-progress",
      winner: null,
      decidedBy: null,
      shootout: null,
    };
  }

  // 모든 차전 종료 — 합산 → (같으면) 마지막 차전 승부차기. 원정 다득점 없음(2021-22 폐지)
  const last = legs.at(-1)!;
  const score = last.score!;
  if (aggregate.first !== aggregate.second) {
    return {
      ...base,
      state: "decided",
      winner: aggregate.first > aggregate.second ? first : second,
      decidedBy: score.aet ? "extra-time" : "aggregate",
      shootout: null,
    };
  }
  if (score.pens && score.pens.h !== score.pens.a) {
    const homeWon = score.pens.h > score.pens.a;
    return {
      ...base,
      state: "decided",
      winner: homeWon ? last.home : last.away,
      decidedBy: "penalties",
      shootout: {
        winner: Math.max(score.pens.h, score.pens.a),
        loser: Math.min(score.pens.h, score.pens.a),
      },
    };
  }
  return {
    ...base,
    state: "unresolved",
    winner: null,
    decidedBy: null,
    shootout: null,
  };
}

export interface StageTies {
  stage: KnockoutStage;
  label: string;
  /** 첫 차전 킥오프 · id 순 */
  ties: Tie[];
  /** 결정된 대진 수 */
  decided: number;
}

/** 녹아웃 경기 → 단계별 대진(단계 진행 순). 리그 페이즈 경기는 무시한다 */
export function tiesOf(matches: readonly Match[]): StageTies[] {
  const groups = new Map<string, { stage: KnockoutStage; list: Match[] }>();
  for (const m of matches) {
    const stage = stageOfRound(m.round);
    if (!stage) continue;
    const [a, b] = [m.home, m.away].sort();
    const key = `${stage}|${a}|${b}`;
    const group = groups.get(key);
    if (group) group.list.push(m);
    else groups.set(key, { stage, list: [m] });
  }
  const byStage = new Map<KnockoutStage, Tie[]>();
  for (const { stage, list } of groups.values()) {
    const tie = buildTie(stage, list);
    const ties = byStage.get(stage);
    if (ties) ties.push(tie);
    else byStage.set(stage, [tie]);
  }
  return KNOCKOUT_STAGES.filter((s) => byStage.has(s)).map((stage) => {
    const ties = byStage
      .get(stage)!
      .sort((a, b) => byKickoffThenId(a.legs[0]!, b.legs[0]!));
    return {
      stage,
      label: KNOCKOUT_STAGE_LABEL[stage],
      ties,
      decided: ties.filter((t) => t.state === "decided").length,
    };
  });
}

// ─── 단계 판정 ──────────────────────────────────────────────────────────────

export type CompetitionPhase =
  | { kind: "league" }
  | { kind: "between" }
  | {
      kind: "knockout";
      stage: KnockoutStage;
      /** 지금 단계 대진이 모두 결정됐다(다음 단계 발표 전 · 결승이면 시즌 끝) */
      stageDone: boolean;
    };

/** 리그 페이즈가 끝났는가(머리 주석 — 숫자 라운드 경기가 모두 '예정이 아님'). 리그 경기가 없으면 false */
export function isLeaguePhaseOver(
  matches: readonly Match[],
  nowMs: number,
): boolean {
  const league = matches.filter((m) => !isKnockoutRound(m.round));
  return (
    league.length > 0 &&
    league.every((m) => matchStateOf(m, nowMs) !== "scheduled")
  );
}

/** 대회 경기 → 지금 단계(머리 주석 규칙, 빌드 시각 기준) */
export function competitionPhaseOf(
  matches: readonly Match[],
  nowMs: number,
): CompetitionPhase {
  const stages = tiesOf(matches);
  const hasLeague = matches.some((m) => !isKnockoutRound(m.round));
  const leagueOver = isLeaguePhaseOver(matches, nowMs);
  if (stages.length === 0) {
    return leagueOver ? { kind: "between" } : { kind: "league" };
  }
  if (hasLeague && !leagueOver) return { kind: "league" };
  const open = stages.find((s) => s.decided < s.ties.length);
  const current = open ?? stages.at(-1)!;
  return {
    kind: "knockout",
    stage: current.stage,
    stageDone: open === undefined,
  };
}

/** 단계 순서 비교 — 화면이 최신 단계부터 그릴 때 */
export function compareStageDesc(a: StageTies, b: StageTies): number {
  return stageIndex(b.stage) - stageIndex(a.stage);
}

// ─── 표기 ───────────────────────────────────────────────────────────────────

/** 차전 이름 — "1차전" · "2차전" · 결승 "단판" */
export function legLabelOf(match: Match): string {
  const leg = legOfRound(match.round);
  return leg ? `${leg}차전` : "단판";
}

/**
 * 대진 보조 문구(합산 줄 아래 — 색만으로 뜻을 전하지 않게 진출을 글자로).
 * 예) "아스널 진출" · "연장 끝 · 아스널 진출" · "승부차기 4–3 · 아스널 진출" · 결승 "아스널 우승" ·
 *     "1차전 종료 · 2차전 03.17 (수) 04:00" · "1차전 종료 · 2차전 일정 미정" · "1차전 종료 · 2차전 연기" · "진출 팀 자료 없음" · 예정은 null(경기 줄이 일정을 보인다)
 */
export function tieNoteText(
  tie: Tie,
  name: (slug: string) => string,
  day: (match: Match) => string,
): string | null {
  switch (tie.state) {
    case "scheduled":
      return null;
    case "unresolved":
      return "진출 팀 자료 없음";
    case "decided": {
      const verb = tie.stage === "ko-final" ? "우승" : "진출";
      const who = `${name(tie.winner!)} ${verb}`;
      if (tie.decidedBy === "penalties" && tie.shootout)
        return `승부차기 ${tie.shootout.winner}–${tie.shootout.loser} · ${who}`;
      if (tie.decidedBy === "extra-time") return `연장 끝 · ${who}`;
      return who;
    }
    case "in-progress": {
      const done = tie.legs.find((m) => m.status === "finished")!;
      const next = tie.legs.find((m) => m.status !== "finished");
      const head = `${legLabelOf(done)} 종료`;
      if (!next) {
        const missing = legOfRound(done.round) === 2 ? "1차전" : "2차전";
        return `${head} · ${missing} 일정 미정`;
      }
      const label = legLabelOf(next);
      if (next.status === "postponed") return `${head} · ${label} 연기`;
      return `${head} · ${label} ${day(next)}`;
    }
  }
}

/** 단계 머리 부제 — "대진 8 · 결정 3" */
export function stageSummaryText(stage: StageTies): string {
  return `대진 ${stage.ties.length} · 결정 ${stage.decided}`;
}

// ─── 화면 모델 ──────────────────────────────────────────────────────────────

export interface TieLegView {
  /** "1차전" · "2차전" · "단판" */
  label: string;
  view: MatchView;
}

export interface TieView {
  tie: Tie;
  first: TeamView;
  second: TeamView;
  legs: TieLegView[];
  /** 합산 줄 아래 보조 문구(진출 글자 병기 — `tieNoteText`) */
  note: string | null;
}

export interface StageView {
  stage: KnockoutStage;
  label: string;
  /** "대진 8 · 결정 3" */
  summary: string;
  ties: TieView[];
}

/**
 * 대회 경기 → 대진 보기 화면 모델. 단계는 **최신 단계부터**(지금 단계가 맨 위 — 지난 단계는 아래로), 단계 안 대진은 첫 차전 순.
 * 녹아웃 경기가 없으면 빈 배열.
 */
export function knockoutStagesView(
  matches: readonly Match[],
  team: TeamLookup,
  nowMs: number,
): StageView[] {
  return tiesOf(matches)
    .sort(compareStageDesc)
    .map((stage) => ({
      stage: stage.stage,
      label: stage.label,
      summary: stageSummaryText(stage),
      ties: stage.ties.map((tie) => ({
        tie,
        first: team(tie.first),
        second: team(tie.second),
        legs: tie.legs.map((m) => ({
          label: legLabelOf(m),
          view: matchView(m, team, nowMs),
        })),
        note: tieNoteText(
          tie,
          (slug) => team(slug).name,
          (m) =>
            m.tbc
              ? `${formatKst(m.kickoff, "dayShort")} (임시)`
              : `${formatKst(m.kickoff, "dayShort")} ${formatKst(m.kickoff, "time")}`,
        ),
      })),
    }));
}

/** 머리 부제 — 리그 페이즈가 끝나고 대진 발표 전(`between`)이면 이 문구(라운드 문구 대신) */
export const BETWEEN_STATUS_TEXT = "리그 페이즈 종료 · 녹아웃 대진 발표 전";
