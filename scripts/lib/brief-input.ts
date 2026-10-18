/**
 * 일일 브리핑 정형 입력 (M1-01 수직 슬라이스 → **M1-19 확정**). 기사 텍스트는 넣지 않는다 — 데이터 API 결과만(D23·D24).
 * LLM 요청(brief.ts)과 코드 템플릿 문장(brief-template.ts)이 **같은 입력**을 쓴다 — 근거 id(refs)가 한 체계다.
 *
 * 입력 창 (M1-19 확정 — M0-34 정의 유지): 발행일(KST) D의 입력 = UTC 하루 D-1에 킥오프한 종료 경기
 *   = KST [D-1 09:00, D 09:00) = `kstWindowRangeUtc(D-1, {fromKst:"09:00", toKst:"09:00"})`.
 *   KST 달력 하루 [D-1 00:00, D 00:00)로 자르면 유럽 저녁 경기(KST 새벽 킥오프)가 다음 날 브리핑으로 밀린다. UTC 하루는 유럽
 *   현지의 "어제 경기 전부"이고 KST에는 서머타임이 없어 유럽 서머타임 전환과 무관하게 항상 UTC 하루다.
 *
 * 형식 (짧은 키, 공백 없는 JSON — `serializeBriefInput`):
 *   `{ briefDate, matches: [{ id, comp, round, home, away, ft, ht?, aet?, regular?, pens?, goals }],
 *      standings: [{ id, comp, note, rows: [{ pos, team, played, pts, gd }] }] }`
 *   - matches — **중요도 순**(`matchImportance` 내림차순 → 킥오프 → id), 상한 `BRIEF_MAX_MATCHES`. LLM은 앞쪽 경기를 먼저 쓰고
 *     템플릿도 앞에서부터 고른다.
 *     · id = `m` + football-data 경기 id(출력 근거 id `r`로 돌아온다) · comp = 대회 영문 이름(competitions.json nameEn)
 *     · ft = 최종 점수 "h-a"(**홈-원정**, 정규시간 + 연장, 승부차기 제외 — match-data.ts 공통 규칙)
 *     · 연장·승부차기 경기(M1-44 이월 — 슬라이스는 뺐다): `aet: true`, `regular` = 90분 점수(응답에 있을 때만),
 *       `pens` = 승부차기 점수(승부차기 경기만). 정규시간 경기에는 세 키가 없다
 *     · goals(M1-48b, D27·D37): 연결된 API-Football 상세(대응표 확인 또는 강한 증거) 중 득점 목록이 완전한(`goalsComplete`)
 *       경기만 배열, 그 밖(연결 안 됨·득점 불완전·API-Football 실패)은 null → 그 경기 득점자를 쓰지 않는다(입력에 없는 사실 금지).
 *       항목 = `{ min, team, player, assist?, type? }`: min "90+2", team = 득점이 기록된 팀(이 경기 home·away 이름 — 자책골은
 *       득점 인정 팀), player·assist = API-Football 응답 원문 영문(한글 치환은 M1-21), type "penalty"(경기 중 PK)·"own_goal".
 *       승부차기 킥은 득점이 아니다. 0-0 경기는 빈 배열. 같은 아침 두 번째 실행은 원장(data/matches)의 항목도 쓴다(M1-48 이월 —
 *       `mergeBriefDetails`).
 *   - standings — 입력 경기가 있는 대회의 **현재 순위 상위 4위까지**(공동 순위면 같은 순위 팀 모두 — 응답 순서 유지, M1-44 이월).
 *     **진행 중 경기가 있는 대회(`inProgress > 0`)는 넣지 않는다**(순위가 확정이 아니라 순위 문장 금지 — M1-44 이월). 표가 여러 개인
 *     대회(그룹 스테이지)도 넣지 않는다. 순서는 그 대회의 첫 경기 순(중요도). id = `s` + 대회 약칭(sPL·sLL·sSA·sBL·sL1·sUCL — M0-30).
 *     전일 순위(`prev`)는 M2-03이 더한다 — 지금은 없으므로 순위 변동을 서술할 수 없다(D40 ③).
 *   - 한국 선수 출전(`korean`)은 M3-03 이후 — 키가 없으면 한국 선수를 언급하지 않는다(M0-30 지시문).
 *
 * 중요도(`matchImportance` — 코드 규칙, LLM 미사용): 활성 한국 선수 소속팀(korean-players.json → team-ids.json fd id) +3 ·
 * UCL +3 · 빅클럽(news-keywords.ts BIG_CLUBS 이름 맞춤) 1팀당 +2 · 리그 기본(EPL 2, 라리가·세리에 A·분데스리가 1) ·
 * 두 팀 모두 현재 순위 4위 안 +1 · 총 5골 이상 또는 3골 차 이상 +1. "오늘 밤 볼 경기"(FR-81 bigmatch-rules)와 같은 축이다 —
 * 그 설정 파일이 생기면(M2-08) 옮길 후보.
 */
import type { CompId, CompetitionConfig } from "@/lib/schema";
import {
  kstWindowRangeUtc,
  shiftDate,
  type KstWindow,
  type UtcRange,
} from "@/lib/time";

import type {
  FinishedMatch,
  MatchDetail,
  Score,
  StandingsRow,
  TeamRef,
} from "./match-data";
import {
  BIG_CLUBS,
  compileGroup,
  matchesGroup,
  titleText,
  type CompiledGroup,
} from "./news-keywords";

/** 입력 창 — KST 09:00 ~ 다음 날 09:00 (= UTC 하루) */
export const BRIEF_INPUT_WINDOW: Readonly<KstWindow> = Object.freeze({
  fromKst: "09:00",
  toKst: "09:00",
});

/**
 * 입력 경기 수 상한 — 중요도 순으로 자른다. 바쁜 UTC 하루(주말)도 6개 대회 종료 경기가 대개 25경기 안팎이라 거의 자르지 않고,
 * 입력 토큰 상한을 묶어 두는 안전장치다(M0-34 실측 23경기 입력 6,590토큰 — 슬라이스와 같은 값, 상향 아님).
 */
export const BRIEF_MAX_MATCHES = 30;

/**
 * **LLM 요청 본문**에 넣는 경기 수 상한(PRD §15 D51, 2026-10-17 사용자 결정) — 중요도 순 앞 15경기만 보낸다. 바쁜 날(23경기)
 * v0.1 실측에서 출력(thinking 포함)이 `max_tokens` 4,096을 다 쓴 표본이 나왔다(M1-24 반복 실측 — 2,922 · 3,941(선계산 변형) ·
 * 4,096 잘림). 5줄만 쓰는 브리핑이 앞쪽 15경기 밖을 쓸 일은 드물고, thinking·effort·호출 수(D28)는 그대로 둔다(`max_tokens`는
 * 그 뒤 D53으로 8,192, D57로 16,384).
 * 템플릿 줄·근거(refs) 대조·검사기 근거는 전체 입력(`BRIEF_MAX_MATCHES`) 기준이다 — `briefLlmInput`.
 */
export const BRIEF_LLM_MAX_MATCHES = 15;

/** 순위표는 이 순위까지(공동 순위 포함) — M0-34 입력과 같은 범위(상위 4) */
export const BRIEF_STANDINGS_TOP_POS = 4;

/** 순위표 근거 id 약칭(M0-30 입력과 같다) */
export const STANDINGS_REF_CODE: Readonly<Record<CompId, string>> =
  Object.freeze({
    EPL: "PL",
    LALIGA: "LL",
    SERIEA: "SA",
    BUNDESLIGA: "BL",
    LIGUE1: "L1",
    UCL: "UCL",
  });

/** 순위표 근거 id(`s` + 약칭) */
export function standingsRefId(comp: CompId): string {
  return `s${STANDINGS_REF_CODE[comp]}`;
}

/** 순위표 범위 설명(LLM이 일부 표임을 알게 — M0-34 입력과 같은 뜻) */
export const STANDINGS_NOTE = `current table, top ${BRIEF_STANDINGS_TOP_POS} positions only`;

/** 발행일(KST) → 입력 창 [start, end) */
export function briefInputWindow(briefDate: string): UtcRange {
  return kstWindowRangeUtc(shiftDate(briefDate, -1), BRIEF_INPUT_WINDOW);
}

/** 득점 1건(M0-30 표기) — 키 순서 min·team·player·assist·type */
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
  /** 최종 점수 "h-a"(홈-원정, 정규시간 + 연장 — 승부차기 제외) */
  ft: string;
  /** 전반 점수 "h-a" — 없으면 키 없음 */
  ht?: string;
  /** 연장을 치렀다(연장·승부차기 경기) — 정규시간 경기는 키 없음 */
  aet?: true;
  /** 90분 점수 "h-a" — 연장 경기에서 응답에 있을 때만 */
  regular?: string;
  /** 승부차기 점수 "h-a" — 승부차기 경기만 */
  pens?: string;
  /** 득점자 — 연결된 API-Football 상세의 득점 목록이 완전할 때만, 그 밖은 null(득점 데이터 없음) */
  goals: BriefInputGoal[] | null;
}

export interface BriefInputStandingRow {
  pos: number;
  team: string;
  played: number;
  pts: number;
  /** 득실차 */
  gd: number;
}

export interface BriefInputStandings {
  /** `s` + 대회 약칭(sPL 등) */
  id: string;
  /** 대회 영문 이름 */
  comp: string;
  note: string;
  rows: BriefInputStandingRow[];
}

export interface BriefInput {
  briefDate: string;
  matches: BriefInputMatch[];
  standings: BriefInputStandings[];
}

/** 중요도 가중치 — 머리 주석 "중요도". 같은 점수면 킥오프 → id 순 */
export const BRIEF_IMPORTANCE: Readonly<{
  korean: number;
  ucl: number;
  bigClub: number;
  topClash: number;
  goalFest: number;
  league: Readonly<Record<CompId, number>>;
}> = Object.freeze({
  korean: 3,
  ucl: 3,
  bigClub: 2,
  topClash: 1,
  goalFest: 1,
  league: Object.freeze({
    EPL: 2,
    LALIGA: 1,
    SERIEA: 1,
    BUNDESLIGA: 1,
    LIGUE1: 0,
    UCL: 0,
  }),
});

/**
 * 빌더가 읽는 순위 필드 — `CompStandings`(football-data 어댑터 출력)를 그대로 넣을 수 있다. 행은 순위·팀·경기 수·승점·득실차만
 * 읽는다(승·무·패·득점·실점은 읽지 않는다 — M1-24 골든셋의 M0 입력에서 온 순위 행에는 그 값이 없다).
 */
export interface BriefStandingsSource {
  comp: CompId;
  /** 받은 시점의 진행 중 경기 수 — 0보다 크면 순위를 넣지 않는다 */
  inProgress: number;
  tables: ReadonlyArray<{
    rows: ReadonlyArray<
      Pick<StandingsRow, "pos" | "team" | "played" | "pts" | "gd">
    >;
  }>;
}

/** 중요도 판정 재료(실행마다 설정·순위에서 만든다) */
export interface BriefImportanceContext {
  /** 활성 한국 선수 소속팀의 football-data 팀 id(korean-players.json → team-ids.json) */
  koreanTeamIds: ReadonlySet<number>;
  /** 대회별 football-data 팀 id → 현재 순위(확정 순위표만 — `standingsPositions`) */
  positions: ReadonlyMap<CompId, ReadonlyMap<number, number>>;
}

const BIG_CLUB_GROUPS: readonly CompiledGroup[] = BIG_CLUBS.map(compileGroup);

/** 팀 이름(짧은 이름·정식 이름)이 빅클럽 표(news-keywords.ts BIG_CLUBS)에 맞는가 */
export function isBigClub(team: Pick<TeamRef, "name" | "fullName">): boolean {
  const names = [team.name, team.fullName].filter(
    (n): n is string => typeof n === "string" && n.length > 0,
  );
  return names.some((name) => {
    const text = titleText(name, "en");
    return BIG_CLUB_GROUPS.some((group) => matchesGroup(text, group));
  });
}

/** 확정 순위표(진행 중 경기 없음·표 1개)의 팀 id → 순위 */
export function standingsPositions(
  standings: readonly BriefStandingsSource[],
): Map<CompId, Map<number, number>> {
  const out = new Map<CompId, Map<number, number>>();
  for (const s of standings) {
    const [table] = s.tables;
    if (s.inProgress > 0 || s.tables.length !== 1 || !table) continue;
    out.set(
      s.comp,
      new Map(table.rows.map((r) => [r.team.id, r.pos] as const)),
    );
  }
  return out;
}

/** 경기 중요도(순수 함수) — 머리 주석 "중요도" */
export function matchImportance(
  match: Pick<FinishedMatch, "comp" | "home" | "away" | "score">,
  ctx: BriefImportanceContext,
): number {
  const w = BRIEF_IMPORTANCE;
  let score = w.league[match.comp];
  if (
    ctx.koreanTeamIds.has(match.home.id) ||
    ctx.koreanTeamIds.has(match.away.id)
  ) {
    score += w.korean;
  }
  if (match.comp === "UCL") score += w.ucl;
  if (isBigClub(match.home)) score += w.bigClub;
  if (isBigClub(match.away)) score += w.bigClub;
  const pos = ctx.positions.get(match.comp);
  const homePos = pos?.get(match.home.id);
  const awayPos = pos?.get(match.away.id);
  if (
    homePos !== undefined &&
    awayPos !== undefined &&
    homePos <= BRIEF_STANDINGS_TOP_POS &&
    awayPos <= BRIEF_STANDINGS_TOP_POS
  ) {
    score += w.topClash;
  }
  const { home, away } = match.score.ft;
  if (home + away >= 5 || Math.abs(home - away) >= 3) score += w.goalFest;
  return score;
}

export interface BriefInputBuild {
  input: BriefInput;
  excluded: {
    /** 상한을 넘어 뺀 경기(중요도가 낮은 쪽) */
    overCap: number;
  };
  /** 입력 경기 중 연장·승부차기 경기 수 */
  extraTime: number;
  standings: {
    /** 입력에 넣은 대회(입력 순서) */
    included: CompId[];
    /** 진행 중 경기가 있어 뺀 대회(순위 문장 금지) */
    inProgress: CompId[];
    /** 표가 여러 개라 뺀 대회 */
    multiTable: CompId[];
  };
  /** 입력 경기 중 득점자를 넣은 경기 수(goals 배열) · 연결은 됐지만 득점 목록이 불완전해 null로 둔 경기 수 */
  goals: { filled: number; incomplete: number };
}

/** 분 표기 — "55" · "90+2"(추가 시간이 0·없으면 붙이지 않는다) */
function minuteLabel(minute: number, extra: number | null): string {
  return extra !== null && extra > 0 ? `${minute}+${extra}` : String(minute);
}

function scoreText(score: Score): string {
  return `${score.home}-${score.away}`;
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

/**
 * 라운드 표기 — **stage 우선**(M1-23 리뷰 3회차 차단 1 — 버그 수정): 리그 단계만 경기 차수를 쓴다(정규 리그 REGULAR_SEASON
 * "Matchday 6", UCL 리그 페이즈 LEAGUE_STAGE "League phase MD 1" — M0-30 입력과 같은 표기). 그 밖의 stage(PLAYOFFS·LAST_16 …)는
 * matchday(2차전의 2 등)가 있어도 stage 원문을 쓴다 — 예전에는 UCL 플레이오프 2차전이 "Matchday 2"가 되어 리그 경기처럼 읽혔다
 * (검사기의 '승점'·'플레이오프에서' 판정). stage가 없으면 빈 문자열(리그로 짐작하지 않는다).
 */
export function roundLabel(result: Pick<FinishedMatch, "stage" | "matchday">) {
  if (result.stage === "LEAGUE_STAGE" && result.matchday !== null) {
    return `League phase MD ${result.matchday}`;
  }
  if (result.stage === "REGULAR_SEASON" && result.matchday !== null)
    return `Matchday ${result.matchday}`;
  return result.stage ?? "";
}

/**
 * 득점자 연결에 쓸 API-Football 상세 — 브리핑 몫(이번 실행이 받은 상세)을 먼저, 원장(data/matches)에서 읽은 같은 창 항목을
 * 보탠다(같은 경기 id는 이번 실행 쪽 — 더 새 응답). 같은 아침 두 번째 실행(백업·force)은 브리핑 창 경기가 이미 원장에 있어 다시
 * 받지 않으므로 원장 항목이 없으면 득점자가 빠진다(M1-48 이월). 순수 함수.
 */
export function mergeBriefDetails(
  snapshot: readonly MatchDetail[],
  ledger: readonly MatchDetail[],
): { details: MatchDetail[]; fromLedger: number } {
  const seen = new Set(snapshot.map((d) => d.matchId));
  const extra = ledger.filter((d) => !seen.has(d.matchId));
  return { details: [...snapshot, ...extra], fromLedger: extra.length };
}

export interface BuildBriefInputOptions {
  briefDate: string;
  /** football-data 종료 경기(창 안) */
  results: readonly FinishedMatch[];
  competitions: readonly CompetitionConfig[];
  /** 현재 순위(football-data `CompStandings` — 빌더는 `BriefStandingsSource` 필드만 읽는다) — 없으면 standings 빈 배열 */
  standings?: readonly BriefStandingsSource[];
  /** football-data 경기 id → 연결된 API-Football 상세(득점자) */
  linked?: ReadonlyMap<number, Pick<MatchDetail, "goals" | "goalsComplete">>;
  /** 활성 한국 선수 소속팀 football-data 팀 id(중요도) */
  koreanTeamIds?: ReadonlySet<number>;
  maxMatches?: number;
}

interface RankedMatch {
  match: FinishedMatch;
  score: number;
}

function byImportance(a: RankedMatch, b: RankedMatch): number {
  return (
    b.score - a.score ||
    Date.parse(a.match.kickoff) - Date.parse(b.match.kickoff) ||
    a.match.matchId - b.match.matchId
  );
}

/** 입력 경기 1건 — 키 순서 id·comp·round·home·away·ft·ht·aet·regular·pens·goals(M0-30 순서에 연장 키를 ft 뒤에) */
function toInputMatch(
  r: FinishedMatch,
  compName: string,
  goals: BriefInputGoal[] | null,
): BriefInputMatch {
  const { ft, ht, regular, pens, duration } = r.score;
  return {
    id: `m${r.matchId}`,
    comp: compName,
    round: roundLabel(r),
    home: r.home.name,
    away: r.away.name,
    ft: scoreText(ft),
    ...(ht ? { ht: scoreText(ht) } : {}),
    ...(duration !== "REGULAR" ? { aet: true as const } : {}),
    ...(duration !== "REGULAR" && regular
      ? { regular: scoreText(regular) }
      : {}),
    ...(duration === "PENALTY_SHOOTOUT" && pens
      ? { pens: scoreText(pens) }
      : {}),
    goals,
  };
}

/**
 * 종료 경기 결과 + 현재 순위 + 득점자 → 브리핑 입력(순수 함수). 결과는 중요도 순으로 정렬해 상한까지 넣고, 순위는 입력 경기가 있는
 * 확정 순위표만 상위 4위까지 넣는다(머리 주석).
 */
export function buildBriefInput(
  options: BuildBriefInputOptions,
): BriefInputBuild {
  const {
    briefDate,
    results,
    competitions,
    standings = [],
    linked = new Map<number, Pick<MatchDetail, "goals" | "goalsComplete">>(),
    koreanTeamIds = new Set<number>(),
    maxMatches = BRIEF_MAX_MATCHES,
  } = options;
  const nameOf = new Map<string, string>(
    competitions.map((c) => [c.id, c.nameEn]),
  );
  const ctx: BriefImportanceContext = {
    koreanTeamIds,
    positions: standingsPositions(standings),
  };
  const kept = results
    .map((match) => ({ match, score: matchImportance(match, ctx) }))
    .sort(byImportance)
    .slice(0, Math.max(0, maxMatches))
    .map((r) => r.match);
  const goalStats = { filled: 0, incomplete: 0 };
  const matches = kept.map((r) => {
    const detail = linked.get(r.matchId);
    const goals = detail ? briefGoalsOf(r, detail) : null;
    if (goals !== null) goalStats.filled += 1;
    else if (detail) goalStats.incomplete += 1;
    return toInputMatch(r, nameOf.get(r.comp) ?? r.comp, goals);
  });

  // 순위 — 입력 경기가 있는 대회만, 그 대회의 첫 경기 순(중요도)
  const compOrder: CompId[] = [];
  for (const r of kept) if (!compOrder.includes(r.comp)) compOrder.push(r.comp);
  const byComp = new Map(standings.map((s) => [s.comp, s] as const));
  const stats: BriefInputBuild["standings"] = {
    included: [],
    inProgress: [],
    multiTable: [],
  };
  const inputStandings: BriefInputStandings[] = [];
  for (const comp of compOrder) {
    const s = byComp.get(comp);
    if (!s) continue;
    if (s.inProgress > 0) {
      stats.inProgress.push(comp);
      continue;
    }
    const [table] = s.tables;
    if (s.tables.length !== 1 || !table) {
      stats.multiTable.push(comp);
      continue;
    }
    const rows = table.rows.filter((r) => r.pos <= BRIEF_STANDINGS_TOP_POS);
    if (rows.length === 0) continue;
    stats.included.push(comp);
    inputStandings.push({
      id: standingsRefId(comp),
      comp: nameOf.get(comp) ?? comp,
      note: STANDINGS_NOTE,
      rows: rows.map((r) => ({
        pos: r.pos,
        team: r.team.name,
        played: r.played,
        pts: r.pts,
        gd: r.gd,
      })),
    });
  }

  return {
    input: { briefDate, matches, standings: inputStandings },
    excluded: { overCap: results.length - kept.length },
    extraTime: kept.filter((r) => r.score.duration !== "REGULAR").length,
    standings: stats,
    goals: goalStats,
  };
}

/** LLM 요청 본문 입력(D51) — 전체 입력에서 잘라 낸 것과 모델이 보지 못한 근거 id */
export interface BriefLlmInput {
  /** 요청 본문에 넣는 입력 — 경기는 중요도 순 앞 n개, 순위는 남은 경기의 대회만(입력 빌더와 같은 규칙) */
  input: BriefInput;
  /**
   * 전체 입력에는 있지만 모델이 보지 못한 근거 id(잘린 경기 m… · 대회 경기가 모두 잘려 뺀 순위 s…). 검사기는 전체 입력으로 판정하되
   * 이 id를 근거로 단 줄은 강등한다(`ref-hidden` — 모델이 보지 않은 사실은 쓸 수 없다, brief-check.ts JudgeOptions.hiddenRefs).
   */
  hiddenRefs: Set<string>;
  dropped: { matches: number; standings: string[] };
}

/**
 * 전체 입력 → LLM 요청 본문 입력(순수 함수, D51). 경기는 이미 중요도 순이라 앞에서 자른다. 순위는 남은 경기가 있는 대회만 남긴다 —
 * 빌더가 입력 경기가 있는 대회의 순위만 넣는 규칙과 같고, 바쁜 날 입력 토큰을 줄인다. 상한 이하이면 그대로(복사) 돌려준다.
 * 한국 선수 블록(M3-03)이 생기면 그 선수의 경기가 잘리지 않는지(중요도 +3으로 대개 앞쪽) 이 함수에서 확인할 것.
 */
export function briefLlmInput(
  input: BriefInput,
  maxMatches: number = BRIEF_LLM_MAX_MATCHES,
): BriefLlmInput {
  const cap = Math.max(1, Math.floor(maxMatches));
  const matches = input.matches.slice(0, cap);
  const comps = new Set(matches.map((m) => m.comp));
  const standings = input.standings.filter((s) => comps.has(s.comp));
  const keptIds = new Set([
    ...matches.map((m) => m.id),
    ...standings.map((s) => s.id),
  ]);
  const hiddenRefs = new Set(
    [
      ...input.matches.map((m) => m.id),
      ...input.standings.map((s) => s.id),
    ].filter((id) => !keptIds.has(id)),
  );
  return {
    input: { ...input, matches, standings },
    hiddenRefs,
    dropped: {
      matches: input.matches.length - matches.length,
      standings: input.standings
        .filter((s) => !comps.has(s.comp))
        .map((s) => s.id),
    },
  };
}

/** 요청 user 메시지 — 공백 없는 JSON(M0-30 입력 파일과 같은 형식) */
export function serializeBriefInput(input: BriefInput): string {
  return JSON.stringify(input);
}
