/**
 * 브리핑 자동 사실성 검사기 (M1-23 — PRD FR-22·FR-29 §9.4, D24·D28·D40). LLM이 쓴 "오늘의 5줄"을 **보낸 정형 입력**과 코드로
 * 대조한다. 비용 0·결정적 순수 함수 — I/O 없음(사전·대회 설정은 호출부가 읽어 넘긴다).
 *
 * FR-29 순서: 출력 스키마(brief.ts `parseBriefOutput` — 관용 파싱 D40 ⑤) → **코드 검증(여기)** → 출력 전체 실패면 1회 재시도
 * (스키마 실패·max_tokens와 합쳐 1회 — D40 ①) → 그래도 실패하면 템플릿. 줄 단위 불일치는 재시도 없이 그 줄만 템플릿.
 * 실제 재시도·강등·게시는 M1-45가 이 모듈의 판정(`judgeBriefResponse`)을 그대로 쓴다 — 지금(M1-23)은 로그·dry 출력에만 남긴다.
 *
 * ── 출력 전체 (실패 = 재시도 대상) ─────────────────────────────────────────
 *   한국어 비율: 입력 영문 이름(허용 목록)을 가린 뒤 한글 음절 수 < 라틴 글자 수면 실패(영어 출력 — M0-30 effort low)
 *   한자·가나 혼입(M0-30 '出场') — 한 글자라도 있으면 실패
 *
 * ── 줄 단위 (실패 = 그 줄만 템플릿, 재시도 없음 — 호출 증가는 CLAUDE.md §1-3 승인 사항) ─────────
 *   원칙: **알아본 서술만 통과시킨다**(허용 목록 방식 — M1-23 리뷰). 역할을 알아보지 못한 서술은 확인할 수 없어 강등한다.
 *   이름   영문 토큰 허용 목록 = names.ts `briefNameAllowlist(보낸 입력)` + 한국 선수 블록 이름. 남은 라틴 낱말은 'PK'만 허용
 *          ('Olise'처럼 성만 쓴 축약·'Matchday' 같은 일반어는 강등 — 사전 별칭 'Lens'·'Bayern'은 허용).
 *          모델이 쓴 한글 고유명사(D40 ④)는 사전(names.ko `ko`)·대회(nameKo·shortKo) 공식 표기와 같고 그 대상이 입력에 있으면 허용,
 *          공식 표기의 일부('올리세'·'바이에른')·다른 음역('유니온 베를린' — 사전 '우니온 베를린')·별칭('맨시티')은 강등.
 *          언급한 이름(팀·선수·대회)은 그 줄 근거(r) 항목에 있어야 한다. 결과·순위·득점 서술의 주어 자리에 사전에 없는 한글
 *          낱말(모델 음역)이 오면 확인할 수 없어 강등. 'T의 X'·'X가 T 소속으로'는 X가 T 선수일 때만, 결과 절의 대회 이름은 그 경기
 *          대회일 때만, 순위 절의 대회 이름은 그 팀 순위표 대회일 때만
 *   근거   r의 id가 입력에 있어야 한다
 *   문장   한 줄 한 문장('다.'로 끝남, 문장 안 마침표·느낌표·물음표 없음), 줄바꿈 없음(저장 스키마가 거부), 치환 뒤 80자 이하(D40 ⑤ —
 *          brief.ts `briefLinesOverLimit`과 같은 판정)
 *   승패   알아본 결과 동사('꺾었다·이겼다·눌렀다·제압했다·졌다·패했다·비겼다·맞섰다·끝났다·승리·역전승 …')의 주어가 실제 승자·
 *          패자(brief-case-winner-swap — 주어가 여럿이면 'A가 1-0, B가 2-1로 각각 이겼다'처럼 모두), 목적어('를'·'에'·'와'·'상대로')는
 *          그 앞 주어의 상대. 경기 점수가 있거나 상대를 목적어로 쓴 절에 알아본 결과 동사가 없으면 강등(`result-verb-unknown` — '제쳤다'·
 *          '웃었다'·'무너졌다'·'발목을 잡혔다' 같은 동의어로는 누가 이겼는지 확인할 수 없다). 승부차기 경기의 승자는 승부차기 결과이고
 *          '비겼다' 금지(M1-19 이월), 무승부 동사는 ft 동점일 때만, 연장(승부차기 없음)에서 이긴 팀이 90분에 이미 앞섰거나 90분 점수가
 *          없으면 이긴 것처럼 쓰지 않는다(M1-20 — 두 경기 합산 연장일 수 있다)
 *   점수   입력의 홈-원정 'a-b' 또는 **주어 팀 점수 먼저**만 인정(순서를 무시하면 brief-case-score-reversed가 통과한다). 앞 낱말로
 *          종류를 가린다 — '전반 3-0' = ht, '90분' = regular, '승부차기에서 4-3'·괄호 '(4-3)' = pens, 그 밖 = ft. 'A와 B의 경기는
 *          x-y로'처럼 두 팀을 나란히 쓰면 앞 팀 점수 먼저, 종료 동사만 있는 절('X가 Y와의 경기를 1-0으로 마쳤다')은 주어 점수 먼저.
 *          경기 중 점수('0-1로 뒤지다'·'전반을 2-0으로 앞섰다')는 주어 점수 먼저로 읽고 전반 점수·득점 순서에 그 점수가 있어야 하며
 *          '앞서' = 주어가 앞섬 · '뒤지' = 주어가 뒤짐
 *   득점   (숫자 없이도) 'X가 골을 넣었다·득점했다·골망을 흔들었다' ⇒ X에게 자책골이 아닌 골 · 'X의 골로' ⇒ X의 그 팀 쪽 골 ·
 *          자책골은 그 절에 '자책'이 있을 때만 맞는 골이다 · '도움'·'도왔다' ⇒ 그 선수에게 도움, 'Y의 결승골을 도왔다' ⇒ 그 골의
 *          도움이 주어 · '만회골' ⇒ 진 팀의 골. 한국 선수 블록이 있으면 그 골·도움 수로 확인
 *   파생   (사용자 결정 2026-10-17 — 정의대로 허용 + 검증) '완파' ⇒ 3골 차 이상 · '해트트릭'·'n골'·'골 n개'·'n번 골망' ⇒ 그 선수 goals
 *          항목 수(자책골 제외 — 팀·시간대별 '후반 4골' 불허) · '결승골' ⇒ 이긴 팀의 (진 팀 점수+1)번째 골·자책골 아님 · '동점골' ⇒
 *          비긴 경기의 마지막 골·자책골 아님 · '역전승' ⇒ ht 또는 득점 순서 · round 낱말(결승·4강·8강·16강·플레이오프) ⇒ 근거 경기
 *          round · '홈에서'·'홈 팬들 앞에서'·'안방'·'원정(길)에서'·'적지' ⇒ 주어 팀의 홈·원정 · '연장 끝에' ⇒ regular가 있고 이긴 팀이
 *          90분에 앞서지 않음 · 승점 차 'X는 Y보다 n점 앞섰다/뒤졌다' ⇒ 방향까지 · '승점 3을 챙겼다'·'승점을 나눠 가졌다' ⇒ 리그 경기
 *          승리·무승부(녹아웃 없음). **지시문 목록('완파'·'역전승') 밖 평가어('대파'·'대승'·'신승'·'완패' …)는 점수 차가 맞아도 강등**
 *          (사용자 결정 2026-10-17), 정의할 수 없는 평가·흐름 서술('압도'·'주도'·'연승'·'반등'·'따라붙었다' …)도 강등
 *   숫자   종류를 알아본 숫자만 — 점수·분·순위·승점·득실차·경기 수·골/도움 수·라운드. 파생 숫자(D40 ②)는 전용 규칙(승점 차·점수 차
 *          '3골 차'·두 팀 골 합 '7골을 주고받은')만 허용하고, 그 밖의 숫자('슈팅 7개'·'관중 9명'·'시즌 2호골')는 강등
 *   순위   prev 없는 변동 서술('올랐다·상승·하락·도약·지켰다·유지·되찾았다·꿰찼다·밀렸다·끌어내렸다')과 도착·폭('2위로'·'선두로'·
 *          '한 계단')은 강등(D40 ③) — '1위에 올라 있다'(상태)는 허용. 'n위'·'선두'·'승점 n'은 그 팀의 행과 같아야 하고 '공동 n위'는
 *          같은 순위일 때만, 'A와 B가 n위와 m위'는 순서대로. '최하위'·'강등권'은 근거 없음(입력 순위표는 상위권만)
 *   분     득점 서술의 분은 그 선수(또는 팀)의 득점 시각, 출전 서술의 분은 한국 선수 기록(subOn·subOff·minutes). '후반 10분'처럼
 *          바꿔 쓴 분은 강등(지시문 '[사실]'). 출전 서술('출전했다'·'나섰다')은 출전 시간이 있어야 한다
 *   기타   '무실점' ⇒ 상대 점수 0 · 'n라운드' ⇒ 근거 경기 matchday 또는 순위표 경기 수 · '두 골'처럼 고유어 수사도 숫자로 센다
 *
 * ── 경고 (강등 아님 — 관찰 주간 M1-43 지표) ─────────────────────────────────
 *   쉼표로 절을 이은 줄·사실(술어) 셋 이상 줄·한 줄 두 경기 이상·괄호·따옴표·마침표 없는 끝.
 *   근거: M0-30 실제 출력에서 이 문체 위반 줄은 모두 사실이 맞았다(사람 검토 ok) — 강등하면 정상 줄을 잃는다(과잉 강등). 길이는 이미
 *   80자 상한이 묶는다. 관찰 주간에 빈도를 보고 강등으로 올릴지 정한다.
 *
 * 남은 한계(보고 — M1-43 관찰): 주어·목적어가 아닌 자리의 사전 밖 한글 음역(예: '…의 홈 구장'에 붙은 음역)은 잡지 못한다 ·
 * '-은/-는' 주어 후보는 절 첫머리만 본다(관형형 어미와 모양이 같다) · '연속 득점'·'한때 앞섰다'의 득점 순서 세부는 앞섬·뒤짐
 * 방향만 본다 · 한국 선수 블록(`korean`)은 M0 입력 형식 기준(M3-03이 확정) · 어휘 표는 brief-check-lexicon.ts(관찰 주간에 고치는 곳).
 */
import type { CompetitionConfig, CompId } from "@/lib/schema";

import {
  BRIEF_MAX_ATTEMPTS,
  briefLinesOverLimit,
  parseBriefOutput,
  type BriefOutputLine,
} from "./brief";
import type {
  BriefInput,
  BriefInputMatch,
  BriefInputStandingRow,
  BriefInputStandings,
} from "./brief-input";
import {
  ADNOMINAL_RESULT_WORDS,
  APPEARANCE_CONTEXT,
  ASSIST,
  CLEAN_SHEET,
  COMEBACK,
  COMEBACK_LOSS,
  CONNECTIVE_NOUN_EXCEPTIONS,
  COUNT_UNITS,
  DRAW_VERB,
  END_VERB,
  EVAL_UNSUPPORTED,
  EXTRA_TIME,
  EXTRA_TIME_DECIDED,
  GAINED_POINTS,
  GOAL_CONTEXT,
  HISTORY_UNSUPPORTED,
  KO_UNOFFICIAL_FORMS,
  KOREAN_NUMERALS,
  LATIN_ALLOWED_TOKENS,
  LEVEL_VERB,
  LOSE_VERB,
  MARGIN_WORDS,
  MOVE_DOWN,
  MOVE_SAME,
  MOVE_UP,
  NAME_SUFFIX,
  NO_ASSIST,
  NO_GOAL,
  NON_ENTITY_WORDS,
  OBJECT_PARTICLES,
  PENALTY,
  RANK_ARRIVAL,
  RANK_CONTEXT,
  RANK_STATE,
  RANK_STEPS,
  ROUND_WORDS,
  RUNNING_LEAD,
  RUNNING_TRAIL,
  SCORING,
  SCORING_NOUN,
  SHOOTOUT,
  SUB_OFF,
  SUB_ON,
  SUBJECT_PARTICLES,
  VENUE_AWAY,
  VENUE_HOME,
  WIN_VERB,
} from "./brief-check-lexicon";
import {
  briefCompLabel,
  briefNamesFromIndex,
  chooseBriefCompForm,
  matchFacts,
  NEUTRAL_ROUNDS,
  other,
  type MatchFacts,
  type Pair,
  type Side,
} from "./brief-template";
import {
  briefNameAllowlist,
  foldName,
  lookupName,
  PERSON_KINDS,
  substituteNames,
  TEAM_KINDS,
  type NameIndex,
  type SubstituteResult,
} from "./names";

// ─── 입력·설정 ────────────────────────────────────────────────────────────

/** 한국 선수 출전 기록(M0 입력 형식 — M3-03이 확정 입력에 더한다). 키가 없으면 한국 선수 서술은 근거가 없다 */
export interface BriefCheckKorean {
  id: string;
  player: string;
  team: string;
  /** 그 선수가 뛴 경기 id(matches) */
  match: string;
  started: boolean;
  minutes: number;
  goals: number;
  assists: number;
  subOn?: number;
  subOff?: number;
}

/** 순위 행 + 전일 순위(M2-03이 더한다 — 지금 확정 입력에는 없다) */
export type BriefCheckStandingRow = BriefInputStandingRow & { prev?: number };

/**
 * 검사 입력 = **LLM에 보낸 정형 입력**(brief-input.ts `BriefInput` — 득점자는 canonicalizeBriefInput을 거친 표기) + 아직 확정 입력에
 * 없는 선택 키(전일 순위 `prev`·한국 선수 `korean` — M0 입력에는 있다). 확정 입력은 그대로 넣을 수 있다.
 */
export type BriefCheckInput = Omit<BriefInput, "standings"> & {
  standings: Array<
    Omit<BriefInputStandings, "rows"> & { rows: BriefCheckStandingRow[] }
  >;
  korean?: BriefCheckKorean[];
};

export interface BriefCheckContext {
  /** 고유명사 사전 색인(names.ts) — 사전을 읽지 못했으면 `buildNameIndex(null, competitions)`(대회 별칭만) */
  names: NameIndex;
  competitions: readonly Pick<
    CompetitionConfig,
    "id" | "nameEn" | "nameKo" | "shortKo"
  >[];
}

// ─── 판정 형식 ────────────────────────────────────────────────────────────

/** 출력 전체 실패 사유 */
export type BriefWholeReason = "korean-ratio" | "han";

/**
 * 줄 강등 사유 코드(로그·M1-43 검수·M1-24 회귀 비교용 — 이름을 바꾸면 회귀 비교 기준이 깨진다).
 */
export type BriefLineReasonCode =
  | "ref-unknown"
  | "newline"
  | "sentence-multi"
  | "sentence-form"
  | "over-limit"
  | "han"
  | "foreign-script"
  | "symbol"
  | "latin-token"
  | "ko-name-unofficial"
  | "ko-name-not-in-input"
  | "name-not-in-refs"
  | "name-unknown"
  | "subject-unknown"
  | "result-verb-unknown"
  | "comp-mismatch"
  | "affiliation"
  | "winner-mismatch"
  | "opponent-mismatch"
  | "draw-mismatch"
  | "shootout-draw"
  | "score-mismatch"
  | "score-order"
  | "venue"
  | "round"
  | "extra-time"
  | "shootout"
  | "comeback"
  | "margin"
  | "eval-unsupported"
  | "history-unsupported"
  | "goal-count"
  | "assist-count"
  | "count-unsupported"
  | "decisive-goal"
  | "equaliser"
  | "opening-goal"
  | "penalty"
  | "scorer"
  | "minute"
  | "minute-half"
  | "appearance"
  | "rank-pos"
  | "rank-tie"
  | "rank-move-no-prev"
  | "rank-move"
  | "points"
  | "goal-diff"
  | "played"
  | "number-unsupported";

/** 경고 코드 — 강등하지 않는다(머리 주석 "경고") */
export type BriefLineWarnCode =
  | "style-comma-clause"
  | "style-many-facts"
  | "style-punctuation"
  | "sentence-no-period"
  | "style-multi-match";

export interface BriefLineIssue<C extends string> {
  code: C;
  /** 짧은 근거(문제 낱말·기대값) — 로그용, 이름·숫자만 */
  detail?: string;
}

export interface BriefLineCheck {
  /** 줄 번호(1부터) */
  n: number;
  ok: boolean;
  reasons: BriefLineIssue<BriefLineReasonCode>[];
  warnings: BriefLineIssue<BriefLineWarnCode>[];
}

export interface BriefWholeCheck {
  ok: boolean;
  reasons: BriefWholeReason[];
  /** 이름을 가린 뒤 한글 음절 수·라틴 글자 수(한국어 비율) */
  hangul: number;
  latin: number;
}

export interface BriefCheckResult {
  whole: BriefWholeCheck;
  lines: BriefLineCheck[];
  /**
   * 고유명사 치환·조사 보정 결과(줄 순서 — `substituteBriefLines`). 80자 판정(D40 ⑤)에 쓴 문장이고 M1-45가 게시할 문장이다.
   * `masked`는 미등록 이름 후보 찾기용(M1-21).
   */
  substitutions: SubstituteResult[];
}

/** FR-29 판정 — brief-cases.json `expected`와 같은 체계 */
export type BriefVerdict =
  | { verdict: "ok" }
  | { verdict: "retry" }
  | { verdict: "downgrade-all" }
  | { verdict: "downgrade-line"; lines: number[] };

/** 처음 걸린 단계(brief-cases.json `stage`) */
export type BriefCheckStage = "none" | "transport" | "zod" | "whole" | "line";

export interface BriefJudgement {
  verdict: BriefVerdict;
  /** 'ok' · 'retry' · 'downgrade-all' · 'downgrade-line:1,4' */
  label: string;
  stage: BriefCheckStage;
  /** transport 실패의 errorType · 스키마 실패의 json/schema · 출력 전체 실패 사유 */
  reason: string | null;
  /** 코드 검증 결과(스키마를 통과했을 때만) */
  check: BriefCheckResult | null;
  /** 관용 파싱 결과(D40 ⑤ — 코드블록 벗김·버린 줄) — 스키마를 통과했을 때만 */
  parse: { fenced: boolean; droppedLines: number } | null;
}

/** 판정 → 문자열('downgrade-line:1,4') */
export function briefVerdictLabel(v: BriefVerdict): string {
  return v.verdict === "downgrade-line"
    ? `downgrade-line:${v.lines.join(",")}`
    : v.verdict;
}

// ─── 치환 (collect-run.ts와 M1-45가 같은 함수를 쓴다) ─────────────────────

/**
 * LLM 줄 → 고유명사 치환·조사 보정 뒤 문장(names.ts `substituteNames`). 대회 표기는 같은 입력의 템플릿과 같은 브리핑 단위 표기
 * (`chooseBriefCompForm` — D30·D45 ④, M1-21 이월). 80자 판정(D40 ⑤)은 이 결과로 잰다.
 */
export function substituteBriefLines(
  texts: readonly string[],
  input: Pick<BriefInput, "matches" | "standings">,
  ctx: BriefCheckContext,
): SubstituteResult[] {
  const form = chooseBriefCompForm(input, {
    competitions: ctx.competitions,
    names: briefNamesFromIndex(ctx.names),
  });
  const competitionLabel = (comp: CompId): string => {
    const config = ctx.competitions.find((c) => c.id === comp);
    return config
      ? briefCompLabel(config.nameEn, { competitions: ctx.competitions }, form)
      : comp;
  };
  return texts.map((t) => substituteNames(t, ctx.names, { competitionLabel }));
}

// ─── 입력 모형 ────────────────────────────────────────────────────────────

type Kind = "team" | "player" | "comp";

interface GoalRow {
  side: Side;
  /** 득점자 key(자책골이면 자책한 선수) */
  player: string;
  /** 도움 선수 key — 없으면 null */
  assist: string | null;
  /** "55"·"90+2" — 입력 표기 그대로 */
  min: string;
  penalty: boolean;
  ownGoal: boolean;
}

interface MatchModel {
  id: string;
  m: BriefInputMatch;
  facts: MatchFacts | null;
  home: string;
  away: string;
  comp: string;
  /** 시간 순 득점(득점 목록이 완전하고 점수와 맞을 때만 — 템플릿과 같은 조건), 아니면 null */
  goals: GoalRow[] | null;
  /** 선수 key → 도움 수(goals가 있을 때만) */
  assists: Map<string, number> | null;
}

interface RowModel {
  team: string;
  pos: number;
  pts: number;
  gd: number;
  played: number;
  prev?: number;
}

interface StandingsModel {
  id: string;
  comp: string;
  rows: RowModel[];
}

interface KoreanModel {
  id: string;
  k: BriefCheckKorean;
  player: string;
  team: string;
}

interface FormTarget {
  key: string | null;
  kind: Kind | null;
  official: boolean;
}

interface CheckModel {
  ctx: BriefCheckContext;
  ids: Set<string>;
  matches: Map<string, MatchModel>;
  standings: Map<string, StandingsModel>;
  korean: Map<string, KoreanModel>;
  /** 입력에 있는 대상 key(팀·선수·대회) */
  inputKeys: Set<string>;
  /** 접힌 영문 표기 → 대상 */
  latin: Map<string, { key: string; kind: Kind }>;
  latinRe: RegExp | null;
  /** 접힌 허용 목록(briefNameAllowlist + 한국 선수 블록) */
  allow: Set<string>;
  /** 한글 표기 → 대상(공식·비공식) */
  ko: Map<string, FormTarget>;
  koRe: RegExp | null;
  /** 근거 id → 그 항목의 대상 key */
  refEntities: Map<string, Set<string>>;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function entryKey(kind: string, slug: string | undefined, en0: string) {
  const k = kind === "team" ? "t" : "p";
  return `${k}:${slug ?? foldName(en0)}`;
}

/** 한글 표기 색인 — 사전·대회 설정에만 달려 있어 색인마다 한 번 만든다(입력과 무관) */
const KO_FORMS_CACHE = new WeakMap<
  NameIndex,
  {
    competitions: BriefCheckContext["competitions"];
    ko: Map<string, FormTarget>;
    koRe: RegExp | null;
  }
>();

/**
 * 한글 표기 → 대상 — 사전 공식 표기(ko)·대회 nameKo·shortKo(공식), 별칭·공식 표기의 부분·띄어쓰기 변형(비공식 — D40 ④).
 * 정규식은 긴 표기 먼저, 앞 경계(한글·라틴·숫자가 아님)는 한 번만, 뒤 경계는 표기마다(한글로 끝나면 조사·접미만 붙을 수 있다).
 */
function koreanForms(
  index: NameIndex,
  competitions: BriefCheckContext["competitions"],
): { ko: Map<string, FormTarget>; koRe: RegExp | null } {
  const cached = KO_FORMS_CACHE.get(index);
  if (cached && cached.competitions === competitions) return cached;
  const ko = new Map<string, FormTarget>();
  const entries = new Set([...index.byEn.values(), ...index.initials.values()]);
  for (const e of entries) {
    if (!/[가-힣]/.test(e.ko)) continue;
    ko.set(e.ko, {
      key: entryKey(e.kind, e.slug, e.en[0]!),
      kind: e.kind === "team" ? "team" : "player",
      official: true,
    });
  }
  for (const c of competitions) {
    for (const form of [c.nameKo, c.shortKo]) {
      if (/[가-힣]/.test(form) && !ko.has(form)) {
        ko.set(form, { key: `c:${c.id}`, kind: "comp", official: true });
      }
    }
  }
  const unofficial = (form: string) => {
    if (!ko.has(form)) ko.set(form, { key: null, kind: null, official: false });
  };
  for (const form of KO_UNOFFICIAL_FORMS) unofficial(form);
  for (const e of entries) {
    const parts = e.ko.split(" ");
    if (parts.length < 2) continue;
    unofficial(parts.join(""));
    for (const part of parts) {
      // 한 음절·라틴 조각('AC'·'FC')·일반어('클럽')는 부분 이름으로 보지 않는다
      if (/^[가-힣]{2,}$/.test(part) && part !== "클럽") unofficial(part);
    }
  }
  const forms = [...ko.keys()].sort(
    (a, b) => b.length - a.length || (a < b ? -1 : 1),
  );
  const tail = (form: string): string => {
    const last = form.at(-1)!;
    if (/[가-힣]/.test(last)) return `(?=$|[^가-힣]|${NAME_SUFFIX})`;
    if (/\d/.test(last)) return "(?![\\p{Script=Latin}\\p{N}위골점분차경])";
    return "(?![\\p{Script=Latin}\\p{N}])";
  };
  const koRe =
    forms.length === 0
      ? null
      : new RegExp(
          `(?<![가-힣\\p{Script=Latin}\\p{N}])(?:${forms
            .map((form) => escapeRegExp(form) + tail(form))
            .join("|")})`,
          "gu",
        );
  const value = { competitions, ko, koRe };
  KO_FORMS_CACHE.set(index, value);
  return value;
}

function buildModel(
  input: BriefCheckInput,
  ctx: BriefCheckContext,
): CheckModel {
  const index = ctx.names;
  const teamKey = (name: string): string => {
    const e = lookupName(index, name, TEAM_KINDS);
    return e ? entryKey("team", e.slug, e.en[0]!) : `t~${foldName(name)}`;
  };
  const playerKey = (name: string): string => {
    const e = lookupName(index, name, PERSON_KINDS);
    return e ? entryKey("player", e.slug, e.en[0]!) : `p~${foldName(name)}`;
  };
  const compIdOf = (name: string): CompId | null =>
    index.compByEn.get(foldName(name)) ??
    ctx.competitions.find((c) => c.nameEn === name)?.id ??
    null;
  const compKey = (name: string): string => {
    const id = compIdOf(name);
    return id ? `c:${id}` : `c~${foldName(name)}`;
  };

  const latin = new Map<string, { key: string; kind: Kind }>();
  const addLatin = (form: string, key: string, kind: Kind) => {
    const folded = foldName(form.trim());
    if (folded && !latin.has(folded)) latin.set(folded, { key, kind });
  };
  const addTeam = (name: string): string => {
    const key = teamKey(name);
    addLatin(name, key, "team");
    for (const en of lookupName(index, name, TEAM_KINDS)?.en ?? [])
      addLatin(en, key, "team");
    return key;
  };
  const addPlayer = (name: string): string => {
    const key = playerKey(name);
    addLatin(name, key, "player");
    for (const en of lookupName(index, name, PERSON_KINDS)?.en ?? [])
      addLatin(en, key, "player");
    return key;
  };

  const inputKeys = new Set<string>();
  const ids = new Set<string>();
  const refEntities = new Map<string, Set<string>>();
  const matches = new Map<string, MatchModel>();
  const comps = new Set<CompId>();
  for (const m of input.matches) {
    ids.add(m.id);
    const home = addTeam(m.home);
    const away = addTeam(m.away);
    const comp = compKey(m.comp);
    const compId = compIdOf(m.comp);
    if (compId) comps.add(compId);
    addLatin(m.comp, comp, "comp");
    const facts = matchFacts(m);
    const ents = new Set([home, away, comp]);
    let goals: GoalRow[] | null = null;
    let assists: Map<string, number> | null = null;
    for (const g of m.goals ?? []) {
      ents.add(addPlayer(g.player));
      if (g.assist) ents.add(addPlayer(g.assist));
    }
    if (facts?.goals && m.goals) {
      goals = facts.goals.map((g) => ({
        side: g.side,
        player: playerKey(g.player),
        assist: g.assist ? playerKey(g.assist) : null,
        min: g.min,
        penalty: g.penalty,
        ownGoal: g.ownGoal,
      }));
      assists = new Map();
      for (const g of m.goals) {
        if (!g.assist || g.type === "own_goal") continue;
        const k = playerKey(g.assist);
        assists.set(k, (assists.get(k) ?? 0) + 1);
      }
    }
    for (const e of ents) inputKeys.add(e);
    refEntities.set(m.id, ents);
    matches.set(m.id, {
      id: m.id,
      m,
      facts,
      home,
      away,
      comp,
      goals,
      assists,
    });
  }
  const standings = new Map<string, StandingsModel>();
  for (const s of input.standings) {
    ids.add(s.id);
    const comp = compKey(s.comp);
    const compId = compIdOf(s.comp);
    if (compId) comps.add(compId);
    addLatin(s.comp, comp, "comp");
    const ents = new Set([comp]);
    const rows = s.rows.map((r) => {
      const team = addTeam(r.team);
      ents.add(team);
      return {
        team,
        pos: r.pos,
        pts: r.pts,
        gd: r.gd,
        played: r.played,
        ...(r.prev !== undefined ? { prev: r.prev } : {}),
      };
    });
    for (const e of ents) inputKeys.add(e);
    refEntities.set(s.id, ents);
    standings.set(s.id, { id: s.id, comp, rows });
  }
  const korean = new Map<string, KoreanModel>();
  for (const k of input.korean ?? []) {
    ids.add(k.id);
    const player = addPlayer(k.player);
    const team = addTeam(k.team);
    const ents = new Set([player, team]);
    const match = matches.get(k.match);
    if (match) {
      ents.add(match.home);
      ents.add(match.away);
      ents.add(match.comp);
    }
    for (const e of ents) inputKeys.add(e);
    refEntities.set(k.id, ents);
    korean.set(k.id, { id: k.id, k, player, team });
  }
  // 대회 별칭(입력 대회만)·라틴 shortKo
  for (const [alias, comp] of index.compByEn) {
    if (comps.has(comp)) {
      latin.set(alias, { key: `c:${comp}`, kind: "comp" });
      inputKeys.add(`c:${comp}`);
    }
  }
  for (const c of ctx.competitions) {
    if (comps.has(c.id) && /\p{Script=Latin}/u.test(c.shortKo)) {
      addLatin(c.shortKo, `c:${c.id}`, "comp");
    }
  }

  // 허용 목록 = briefNameAllowlist(보낸 입력) + 한국 선수 블록 이름(확정 입력에 아직 없음 — M3-03)
  const allow = briefNameAllowlist(input, index, ctx.competitions);
  for (const k of input.korean ?? []) {
    for (const name of [k.player, k.team]) {
      allow.add(foldName(name));
      for (const en of lookupName(index, name)?.en ?? [])
        allow.add(foldName(en));
    }
  }
  const latinForms = [...allow].filter((f) => f.trim() !== "");
  const latinRe =
    latinForms.length === 0
      ? null
      : new RegExp(
          `(?<![\\p{Script=Latin}\\p{N}])(?:${latinForms
            .sort((a, b) => b.length - a.length || (a < b ? -1 : 1))
            .map(escapeRegExp)
            .join("|")})(?![\\p{Script=Latin}\\p{N}])`,
          "gu",
        );

  const { ko, koRe } = koreanForms(index, ctx.competitions);

  return {
    ctx,
    ids,
    matches,
    standings,
    korean,
    inputKeys,
    latin,
    latinRe,
    allow,
    ko,
    koRe,
    refEntities,
  };
}

// ─── 줄 해석 ──────────────────────────────────────────────────────────────

interface Mention {
  start: number;
  end: number;
  text: string;
  key: string | null;
  kind: Kind | null;
  script: "latin" | "hangul";
  official: boolean;
  /** 바로 뒤 붙은 한글(조사·접미) */
  particle: string;
}

/** 주어 묶음 — 이름 목록('A, B와 C가') 또는 사전에 없는 한글 낱말(members null) */
interface SubjectGroup {
  pos: number;
  members: Mention[] | null;
  word?: string;
}

interface Clause {
  start: number;
  end: number;
  mentions: Mention[];
  subjects: SubjectGroup[];
}

const MASK_CHAR = "\uE000";

function findMentions(text: string, model: CheckModel): Mention[] {
  const out: Mention[] = [];
  const taken = (s: number, e: number) =>
    out.some((m) => s < m.end && e > m.start);
  const particleAt = (end: number) =>
    /^[가-힣]+/.exec(text.slice(end))?.[0] ?? "";
  if (model.koRe) {
    for (const m of text.matchAll(new RegExp(model.koRe.source, "gu"))) {
      const target = model.ko.get(m[0]);
      if (!target) continue;
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        key: target.key,
        kind: target.kind,
        script: "hangul",
        official: target.official,
        particle: particleAt(m.index + m[0].length),
      });
    }
  }
  if (model.latinRe) {
    const folded = foldName(text);
    for (const m of folded.matchAll(new RegExp(model.latinRe.source, "gu"))) {
      const start = m.index;
      const end = start + m[0].length;
      if (taken(start, end)) continue;
      const target = model.latin.get(m[0]);
      out.push({
        start,
        end,
        text: text.slice(start, end),
        key: target?.key ?? null,
        kind: target?.kind ?? null,
        script: "latin",
        official: true,
        particle: particleAt(end),
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** '두 골'·'세 골 차' → '2 골'·'3 골 차'(글자 수 그대로 — 위치가 원문과 같다). 세는 단위 앞의 고유어 수사만 */
function normalizeNumerals(masked: string): string {
  let out = masked;
  for (const [word, digits] of KOREAN_NUMERALS) {
    out = out.replace(
      new RegExp(`(?<![가-힣])${word}(?=\\s?${COUNT_UNITS})`, "gu"),
      digits,
    );
  }
  return out;
}

function maskText(text: string, mentions: readonly Mention[]): string {
  let out = "";
  let last = 0;
  for (const m of mentions) {
    out += text.slice(last, m.start) + MASK_CHAR.repeat(m.end - m.start);
    last = m.end;
  }
  return out + text.slice(last);
}

/** 절 끝(연결 어미 낱말 뒤 · 마침표 뒤) 위치 */
function clauseBreaks(masked: string): number[] {
  const breaks: number[] = [];
  for (const m of masked.matchAll(/[^\s]+/gu)) {
    const word = m[0].replace(/[,.]+$/u, "");
    const end = m.index + m[0].length;
    if (/[.!?]$/u.test(m[0]) && end < masked.trimEnd().length) {
      breaks.push(end);
      continue;
    }
    if (!/^[가-힣]{2,}$/u.test(word)) continue;
    if (CONNECTIVE_NOUN_EXCEPTIONS.has(word)) continue;
    if (/(?:고|며|으며|면서|지만|는데|으나)$/u.test(word)) breaks.push(end);
  }
  return breaks;
}

/** 이름 사이가 목록 이음('A, B'·'A·B'·'A와 B')인가 */
function listJoined(prev: Mention, next: Mention, text: string): boolean {
  const between = text.slice(prev.end + prev.particle.length, next.start);
  if (prev.particle === "")
    return /^[\s,·]*$/u.test(between) && between.length > 0;
  if (
    prev.particle === "와" ||
    prev.particle === "과" ||
    prev.particle === "및"
  )
    return /^\s*$/u.test(between);
  return false;
}

function buildClauses(
  text: string,
  masked: string,
  mentions: readonly Mention[],
): Clause[] {
  const bounds = [0, ...clauseBreaks(masked), masked.length];
  const clauses: Clause[] = [];
  for (let i = 0; i + 1 < bounds.length; i += 1) {
    const start = bounds[i]!;
    const end = bounds[i + 1]!;
    if (end <= start) continue;
    const ms = mentions.filter((m) => m.start >= start && m.start < end);
    const subjects: SubjectGroup[] = [];
    ms.forEach((m, j) => {
      if (!SUBJECT_PARTICLES.has(m.particle)) return;
      const members = [m];
      for (let k = j - 1; k >= 0; k -= 1) {
        if (!listJoined(ms[k]!, members[0]!, text)) break;
        members.unshift(ms[k]!);
      }
      // 비공식 한글 표기('올리세가')가 낀 묶음은 대상을 확인할 수 없다 — 사전 밖 낱말과 같게 본다
      if (members.some((x) => x.key === null)) {
        subjects.push({
          pos: m.start,
          members: null,
          word: m.text + m.particle,
        });
      } else subjects.push({ pos: m.start, members });
    });
    // 사전에 없는 한글 낱말 + 주어 조사(모델 음역 후보)
    const seg = masked.slice(start, end);
    for (const w of seg.matchAll(
      /(?<![가-힣\uE000\p{Script=Latin}\p{N}])([가-힣]{2,})(이|가|은|는)(?![가-힣])/gu,
    )) {
      const base = w[1]!;
      const pos = start + w.index;
      if (NON_ENTITY_WORDS.has(base)) continue;
      // '-은'·'-는'은 관형형 어미('주고받은 끝에'·'선두를 달리는')와 모양이 같다 — 주제어 자리인 절 첫머리만 이름 후보로 본다
      if (
        (w[2] === "는" || w[2] === "은") &&
        !/^[\s,]*$/u.test(masked.slice(start, pos))
      )
        continue;
      if (/^(?:같|없|많|높|깊|나란|각각|모두|함께)/u.test(base)) continue;
      subjects.push({ pos, members: null, word: w[0] });
    }
    subjects.sort((a, b) => a.pos - b.pos);
    clauses.push({ start, end, mentions: ms, subjects });
  }
  return clauses;
}

// ─── 줄 검사 ──────────────────────────────────────────────────────────────

interface LineState {
  model: CheckModel;
  text: string;
  masked: string;
  refs: readonly string[];
  mentions: Mention[];
  clauses: Clause[];
  reasons: BriefLineIssue<BriefLineReasonCode>[];
  warnings: BriefLineIssue<BriefLineWarnCode>[];
  /** 가린 텍스트에서 이미 해석한 숫자 구간 */
  consumed: Array<[number, number]>;
  refMatches: MatchModel[];
  refStandings: StandingsModel[];
  refKorean: KoreanModel[];
}

function fail(s: LineState, code: BriefLineReasonCode, detail?: string): void {
  if (s.reasons.some((r) => r.code === code && r.detail === detail)) return;
  s.reasons.push(detail === undefined ? { code } : { code, detail });
}

function warn(s: LineState, code: BriefLineWarnCode, detail?: string): void {
  if (s.warnings.some((r) => r.code === code)) return;
  s.warnings.push(detail === undefined ? { code } : { code, detail });
}

function consume(s: LineState, start: number, end: number): void {
  s.consumed.push([start, end]);
}

function isConsumed(s: LineState, start: number, end: number): boolean {
  return s.consumed.some(([a, b]) => start < b && end > a);
}

/** 절 안 위치 p 앞의 가장 가까운 주어 묶음 → 없으면 절 안 뒤쪽 첫 묶음 → 없으면 앞 절에서 이어받은 주어 */
function subjectFor(
  s: LineState,
  clauseIndex: number,
  p: number,
): SubjectGroup | null {
  const c = s.clauses[clauseIndex]!;
  const before = c.subjects.filter((g) => g.pos < p);
  if (before.length > 0) return before.at(-1)!;
  const after = c.subjects.find((g) => g.pos >= p);
  if (after) return after;
  for (let i = clauseIndex - 1; i >= 0; i -= 1) {
    const last = s.clauses[i]!.subjects.at(-1);
    if (last) return last;
  }
  return null;
}

/** 대상 key를 가진 근거 경기와 그 쪽 */
function matchOfTeam(
  s: LineState,
  team: string,
): { match: MatchModel; side: Side } | null {
  for (const match of s.refMatches) {
    if (match.home === team) return { match, side: "home" };
    if (match.away === team) return { match, side: "away" };
  }
  return null;
}

/** 선수 key → 그 선수가 뛴 근거 경기의 팀 key(한국 선수 블록 → 득점·도움 목록 — 자책골은 상대 팀 소속) */
function teamOfPlayer(s: LineState, player: string): string | null {
  for (const k of s.refKorean) if (k.player === player) return k.team;
  for (const k of s.model.korean.values())
    if (k.player === player) return k.team;
  const keyOf = (name: string | undefined) =>
    name ? s.model.latin.get(foldName(name))?.key : undefined;
  for (const match of s.refMatches) {
    for (const g of match.m.goals ?? []) {
      const scorer = keyOf(g.player) === player;
      if (!scorer && keyOf(g.assist) !== player) continue;
      const scoringTeam = g.team === match.m.home ? match.home : match.away;
      const own = scorer && g.type === "own_goal";
      return own
        ? scoringTeam === match.home
          ? match.away
          : match.home
        : scoringTeam;
    }
  }
  return null;
}

/** 묶음 → 팀 key 목록(선수는 소속 팀으로). 모르는 낱말이면 null */
function groupTeams(s: LineState, g: SubjectGroup): string[] | null {
  if (!g.members) return null;
  const out: string[] = [];
  for (const m of g.members) {
    if (m.kind === "team" && m.key) out.push(m.key);
    else if (m.kind === "player" && m.key) {
      const t = teamOfPlayer(s, m.key);
      if (t) out.push(t);
    }
  }
  return out;
}

function pairEq(a: Pair, h: number, x: number): boolean {
  return a.home === h && a.away === x;
}

/** 'a-b'가 그 점수(홈-원정)와 맞는가 — 홈-원정 순서 또는 주어 쪽 먼저 */
function scoreMatches(
  pair: Pair,
  a: number,
  b: number,
  subjectSide: Side | null,
): "ok" | "order" | "mismatch" {
  if (pairEq(pair, a, b)) return "ok";
  if (subjectSide === "away" && pairEq(pair, b, a)) return "ok";
  if (pairEq(pair, b, a)) return "order";
  return "mismatch";
}

function lineRefs(s: LineState): void {
  const { model } = s;
  for (const r of s.refs) {
    if (!model.ids.has(r)) fail(s, "ref-unknown", r);
  }
}

function lineSentence(s: LineState): void {
  const { text, masked } = s;
  if (/[\r\n\u2028\u2029]/u.test(text)) fail(s, "newline");
  // 한 줄 한 문장 — 이름을 가린 뒤 끝이 아닌 마침표·느낌표·물음표(소수점 제외)
  const body = masked.trimEnd();
  for (const m of body.matchAll(/[.!?](?=\s*\S)/gu)) {
    const prev = body[m.index - 1] ?? "";
    const next = body[m.index + 1] ?? "";
    if (m[0] === "." && /\d/u.test(prev) && /\d/u.test(next)) continue;
    fail(s, "sentence-multi");
    break;
  }
  if (!/다\.$/u.test(body)) {
    if (/다$/u.test(body)) warn(s, "sentence-no-period");
    else fail(s, "sentence-form");
  }
  if (/[()[\]"'“”‘’「」『』]/u.test(body)) warn(s, "style-punctuation");
  // 쉼표로 절을 이음(연결 어미 바로 뒤 쉼표) · 술어 셋 이상
  if (/[가-힣](?:고|며|으며|면서|지만|는데),/u.test(body))
    warn(s, "style-comma-clause");
  if (s.clauses.length >= 3)
    warn(s, "style-many-facts", String(s.clauses.length));
}

function lineScripts(s: LineState): void {
  const { text, masked } = s;
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text))
    fail(s, "han");
  if (
    /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Thai}]/u.test(
      masked,
    )
  )
    fail(s, "foreign-script");
  if (/\p{Extended_Pictographic}/u.test(text)) fail(s, "symbol");
  // 이름 밖에 남은 라틴 덩어리('Kang-in Lee'·'Matchday') — 낱말이 모두 허용 토큰('PK')일 때만 통과
  for (const m of masked.matchAll(
    /\p{Script=Latin}[\p{Script=Latin}\p{M}'’.-]*(?: \p{Script=Latin}[\p{Script=Latin}\p{M}'’.-]*)*/gu,
  )) {
    const span = m[0].replace(/[.'’-]+$/u, "");
    if (!span.split(" ").every((w) => LATIN_ALLOWED_TOKENS.has(w)))
      fail(s, "latin-token", span);
  }
}

function lineNames(s: LineState): void {
  const { model } = s;
  const refEnts = new Set<string>();
  for (const r of s.refs)
    for (const e of model.refEntities.get(r) ?? []) refEnts.add(e);
  for (const m of s.mentions) {
    if (!m.official || m.key === null) {
      if (m.script === "hangul") fail(s, "ko-name-unofficial", m.text);
      continue;
    }
    if (m.script === "hangul" && !model.inputKeys.has(m.key)) {
      fail(s, "ko-name-not-in-input", m.text);
      continue;
    }
    if (!refEnts.has(m.key)) fail(s, "name-not-in-refs", m.text);
  }
}

/** 결과 동사 하나 */
interface ResultClaim {
  type: "win" | "lose" | "draw" | "level" | "end";
  pos: number;
  end: number;
  word: string;
}

function resultClaims(seg: string, offset: number): ResultClaim[] {
  const out: ResultClaim[] = [];
  const add = (re: RegExp, type: ResultClaim["type"]) => {
    for (const m of seg.matchAll(new RegExp(re.source, "gu"))) {
      const pos = offset + m.index;
      if (out.some((c) => pos < c.end && pos + m[0].length > c.pos)) continue;
      const word = /^[^\s,.]+/u.exec(seg.slice(m.index))?.[0] ?? m[0];
      out.push({ type, pos, end: pos + m[0].length, word });
    }
  };
  // 패배를 먼저(역전패·완패가 승리 낱말 '역전'·'완파'와 겹치지 않게)
  add(LOSE_VERB, "lose");
  add(WIN_VERB, "win");
  add(DRAW_VERB, "draw");
  add(LEVEL_VERB, "level");
  add(END_VERB, "end");
  return out.sort((a, b) => a.pos - b.pos);
}

/** 결과 동사의 주어 — 관형형이면 바로 뒤 이름, 명사형('X의 7-0 승리')이면 앞의 '의' 이름, 아니면 subjectFor */
function claimSubject(
  s: LineState,
  ci: number,
  claim: ResultClaim,
): SubjectGroup | null {
  const c = s.clauses[ci]!;
  if (ADNOMINAL_RESULT_WORDS.has(claim.word)) {
    const after = s.masked.slice(claim.pos + claim.word.length);
    const head = c.mentions.find(
      (m) =>
        m.start >= claim.pos + claim.word.length &&
        /^\s*$/u.test(s.masked.slice(claim.pos + claim.word.length, m.start)),
    );
    if (head && /^\s*\uE000/u.test(after)) {
      const g = c.subjects.find((x) => x.members?.includes(head));
      return g ?? { pos: head.start, members: [head] };
    }
  }
  if (/^(?:승리|대승|압승|역전승|패배|완패|무승부)/u.test(claim.word)) {
    // 소유 팀('Bayern의 7-0 승리') — 선수 소유('X의 결승골로 … 역전승')는 주어가 아니다
    const owner = [...c.mentions]
      .reverse()
      .find(
        (m) => m.end <= claim.pos && m.particle === "의" && m.kind === "team",
      );
    const nearestSubject = c.subjects.filter((g) => g.pos < claim.pos).at(-1);
    if (owner && (!nearestSubject || nearestSubject.pos < owner.start)) {
      return { pos: owner.start, members: [owner] };
    }
  }
  return subjectFor(s, ci, claim.pos);
}

interface ClauseResult {
  /** 결과 동사의 (첫) 주어 팀(그 경기·쪽) */
  subject: { team: string; match: MatchModel; side: Side } | null;
  /** 절의 결과 서술(이겼다·졌다·비겼다·맞섰다·끝났다·승리 …) */
  claims: ResultClaim[];
}

/** 결과 동사의 주어 묶음들 — 관형형·명사형은 하나, 그 밖은 앞 결과 동사 뒤~이 동사 앞의 주어 묶음 모두('A가 1-0, B가 2-1로 각각 이겼다') */
function claimSubjects(
  s: LineState,
  ci: number,
  claim: ResultClaim,
  prevEnd: number,
): SubjectGroup[] {
  const c = s.clauses[ci]!;
  const single = claimSubject(s, ci, claim);
  const adnominal = ADNOMINAL_RESULT_WORDS.has(claim.word);
  const nominal = single !== null && !c.subjects.includes(single);
  if (adnominal || nominal) return single ? [single] : [];
  const range = c.subjects.filter((g) => g.pos >= prevEnd && g.pos < claim.pos);
  if (range.length > 1) return range;
  return single ? [single] : [];
}

/** 근거 경기의 대회 key — 결과 절에 쓴 대회 이름은 그 경기의 대회여야 한다 */
function checkCompMentions(s: LineState, ci: number, match: MatchModel): void {
  for (const m of s.clauses[ci]!.mentions) {
    if (m.kind === "comp" && m.key && m.key !== match.comp)
      fail(s, "comp-mismatch", m.text);
  }
}

function checkResults(s: LineState, ci: number): ClauseResult {
  const c = s.clauses[ci]!;
  const seg = s.masked.slice(c.start, c.end);
  const claims = resultClaims(seg, c.start);
  let subject: ClauseResult["subject"] = null;
  let prevEnd = c.start;
  for (const claim of claims) {
    if (claim.type === "end") {
      prevEnd = claim.end;
      continue;
    }
    const groups = claimSubjects(s, ci, claim, prevEnd);
    prevEnd = claim.end;
    if (groups.some((g) => !g.members)) {
      fail(s, "name-unknown", groups.find((g) => !g.members)!.word);
      continue;
    }
    let teams = groups.flatMap((g) => groupTeams(s, g) ?? []);
    if (
      teams.length === 0 &&
      (claim.type === "draw" || claim.type === "level")
    ) {
      // 'X와 Y의 경기는 무승부' — 주어가 없으면 절의 팀 이름
      teams = c.mentions
        .filter((m) => m.kind === "team" && m.key && m.start < claim.pos)
        .map((m) => m.key!);
      if (teams.length === 0 && s.refMatches.length === 1)
        teams = [s.refMatches[0]!.home];
    }
    if (teams.length === 0) {
      if (claim.type === "win" || claim.type === "lose")
        fail(s, "subject-unknown", claim.word);
      continue;
    }
    for (const team of teams) {
      const found = matchOfTeam(s, team);
      if (!found) continue; // 근거 밖 이름은 lineNames가 잡는다
      const { match, side } = found;
      const f = match.facts;
      if (!f) {
        fail(s, "score-mismatch", match.id);
        continue;
      }
      checkCompMentions(s, ci, match);
      if (claim.type === "win" && f.winner !== side)
        fail(s, "winner-mismatch", claim.word);
      // 연장(승부차기 없음)에서 이긴 팀이 90분에 이미 앞섰거나 90분 점수가 없으면 두 경기 합산 때문에 치른 연장일 수 있다 —
      // 그 경기를 이긴 것처럼 쓰지 않는다(M1-20 — 템플릿은 '…의 경기는 연장까지 h-a로 끝났다')
      if (
        (claim.type === "win" || claim.type === "lose") &&
        f.aet &&
        !f.pens &&
        f.winner !== null &&
        (f.regular === null || f.regular[f.winner] > f.regular[other(f.winner)])
      )
        fail(s, "extra-time", claim.word);
      if (claim.type === "lose" && (f.winner === null || f.winner === side))
        fail(s, "winner-mismatch", claim.word);
      if (claim.type === "draw") {
        if (f.pens) fail(s, "shootout-draw", claim.word);
        else if (f.ft.home !== f.ft.away) fail(s, "draw-mismatch", claim.word);
      }
      if (claim.type === "level" && f.ft.home !== f.ft.away)
        fail(s, "draw-mismatch", claim.word);
      if ((claim.type === "win" || claim.type === "lose") && !subject) {
        subject = { team, match, side };
      }
    }
    // 목적어(상대) — 목적어 조사가 붙은 팀 이름은 그 앞 가장 가까운 주어 묶음 팀의 상대여야 한다
    for (const m of c.mentions) {
      if (m.kind !== "team" || !m.key || m.start > claim.pos) continue;
      if (
        !OBJECT_PARTICLES.has(m.particle) &&
        !/^\s*상대로/u.test(s.masked.slice(m.end + m.particle.length))
      )
        continue;
      if (groups.some((g) => g.members?.includes(m))) continue;
      const owner =
        c.subjects.filter((g) => g.members && g.pos < m.start).at(-1) ??
        groups[0];
      const ownerTeams = owner ? (groupTeams(s, owner) ?? []) : teams;
      if (ownerTeams.includes(m.key)) continue;
      const ok = ownerTeams.some((t) => {
        const f = matchOfTeam(s, t);
        return (
          !!f && (f.side === "home" ? f.match.away : f.match.home) === m.key
        );
      });
      if (!ok) fail(s, "opponent-mismatch", m.text);
    }
    // 목적어 자리의 사전에 없는 한글 낱말(모델 음역) — 결과 동사 앞 '…를'·'…에게'
    if (claim.type === "win" || claim.type === "lose") {
      const before = s.masked.slice(c.start, claim.pos);
      for (const w of before.matchAll(
        /(?<![가-힣\uE000\p{Script=Latin}\p{N}])([가-힣]{2,})(을|를|에게)(?![가-힣])/gu,
      )) {
        if (!NON_ENTITY_WORDS.has(w[1]!)) fail(s, "name-unknown", w[0]);
      }
    }
  }
  // 허용 목록 방식(M1-23 리뷰 차단 1): 팀과 그 상대를 목적어로 쓴 절에는 알아본 결과 서술이 있어야 한다 — 목록 밖 동의어
  // ('제쳤다'·'무너졌다'·'웃었다' …)는 주어 역할을 확인할 수 없다. 점수가 있는 절은 checkScores가 같은 규칙을 건다.
  if (claims.length === 0 && !COMEBACK.test(seg)) {
    const teamMentions = c.mentions.filter((m) => m.kind === "team" && m.key);
    for (const m of teamMentions) {
      const objectLike =
        OBJECT_PARTICLES.has(m.particle) &&
        m.particle !== "와" &&
        m.particle !== "과"
          ? true
          : /^\s*상대로/u.test(s.masked.slice(m.end + m.particle.length));
      if (!objectLike) continue;
      const opp = teamMentions.find((x) => {
        if (x === m) return false;
        const f = matchOfTeam(s, x.key!);
        return (
          !!f && (f.side === "home" ? f.match.away : f.match.home) === m.key
        );
      });
      const subjectOpp =
        opp ??
        (() => {
          const g = subjectFor(s, ci, m.start);
          const t = g ? (groupTeams(s, g) ?? []) : [];
          return t.some((k) => {
            const f = matchOfTeam(s, k);
            return (
              !!f && (f.side === "home" ? f.match.away : f.match.home) === m.key
            );
          });
        })();
      if (subjectOpp) {
        fail(s, "result-verb-unknown", m.text);
        break;
      }
    }
  }
  return { subject, claims };
}

/** 점수 종류 — 앞 낱말로 가린다 */
function pairKind(before: string): "ft" | "ht" | "regular" | "pens" {
  if (
    /(?:승부차기|PK)(?:에서|\s?끝에|\s?승부(?:에서)?)?\s*\(?\s*$/u.test(before)
  )
    return "pens";
  // '1-1(4-3)' — 경기 점수 바로 뒤 괄호 안 점수(M1-19 이월 '(h-a)' 표기)
  if (/\d\s?[-–]\s?\d+\s*\(\s*$/u.test(before)) return "pens";
  if (/전반(?:을|에|은|에는|에만)?\s*$/u.test(before)) return "ht";
  if (
    /(?:90분|정규\s?시간)(?:까지|에|은|을|는|동안|\s?동안)?\s*$/u.test(before)
  )
    return "regular";
  // '승부차기에서 TeamB가 4-3으로 이겼다' — 절 안에서 이 점수 앞에 승부차기 낱말이 있고 그 사이에 다른 점수가 없으면 승부차기 점수
  const lastShootout = Math.max(
    before.lastIndexOf("승부차기"),
    before.search(/PK\s?승부/u),
  );
  if (lastShootout >= 0) {
    const between = before.slice(lastShootout);
    if (!/\d\s?[-–]\s?\d/u.test(between)) return "pens";
  }
  return "ft";
}

/** 점수 대조 후보 — (경기, 주어 쪽) */
type ScoreCandidate = { match: MatchModel; side: Side | null };

function teamCandidates(
  s: LineState,
  teams: readonly string[],
): ScoreCandidate[] {
  const out: ScoreCandidate[] = [];
  for (const t of teams) {
    const f = matchOfTeam(s, t);
    if (f && !out.some((x) => x.match === f.match))
      out.push({ match: f.match, side: teams.length === 1 ? f.side : null });
  }
  return out;
}

/**
 * 점수 쌍의 경기 — ① 절 안에서 그 점수 바로 앞의 주어 묶음('A가 1-0, B가 2-1로 각각 이겼다') ② 결과 동사의 주어(관형형
 * 'TeamE를 3-0으로 꺾은 TeamF는') ③ 이어받은 주어 ④ 절의 팀 이름 ⑤ 근거 경기 전부
 */
function scoreCandidates(
  s: LineState,
  ci: number,
  pos: number,
  result: ClauseResult,
): ScoreCandidate[] {
  const c = s.clauses[ci]!;
  const near = c.subjects.filter((g) => g.members && g.pos < pos).at(-1);
  if (near) {
    const cands = teamCandidates(s, groupTeams(s, near) ?? []);
    if (cands.length > 0) return cands;
  }
  if (result.subject)
    return [{ match: result.subject.match, side: result.subject.side }];
  const g = subjectFor(s, ci, pos);
  const fromSubject = teamCandidates(s, g ? (groupTeams(s, g) ?? []) : []);
  if (fromSubject.length > 0) return fromSubject;
  const fromMentions = teamCandidates(
    s,
    c.mentions.filter((m) => m.kind === "team" && m.key).map((m) => m.key!),
  ).map((x) => ({ ...x, side: null }));
  if (fromMentions.length > 0) return fromMentions;
  return s.refMatches.map((match) => ({ match, side: null }));
}

function checkScores(s: LineState, ci: number, result: ClauseResult): void {
  const c = s.clauses[ci]!;
  const seg = s.masked.slice(c.start, c.end);
  const re = /(?<![\d+])(\d{1,2})\s?(?:[-–]|대\s?)(\d{1,2})(?![\d+])/gu;
  const types = new Set(result.claims.map((x) => x.type));
  // 종료 동사만 있는 절('X가 Y와의 경기를 1-0으로 마쳤다') — 주어 팀 점수 먼저 또는 'A와 B의 경기'(앞 팀 먼저)만 인정
  const endOnly =
    types.has("end") &&
    !types.has("win") &&
    !types.has("lose") &&
    !types.has("draw") &&
    !types.has("level");
  let ftPairs = 0;
  for (const m of seg.matchAll(re)) {
    const pos = c.start + m.index;
    const end = pos + m[0].length;
    // 득실차 '+5'·'-3'은 checkStandings가 먼저 가져간다
    if (isConsumed(s, pos, end)) continue;
    consume(s, pos, end);
    const a = Number(m[1]);
    const b = Number(m[2]);
    const after = s.masked.slice(end);
    // 경기 중 점수('0-1로 뒤지다'·'한때 2-0으로 앞서') — 주어 점수 먼저로 읽고, '앞서' = 주어가 앞섬 · '뒤지' = 주어가 뒤짐
    const lead = RUNNING_LEAD.test(after);
    const trail = RUNNING_TRAIL.test(after);
    const running =
      lead || trail || /한때\s?$/u.test(s.masked.slice(c.start, pos));
    const before = s.masked.slice(c.start, pos);
    const kind = pairKind(before);
    const candidates = scoreCandidates(s, ci, pos, result);
    if (candidates.length === 0) {
      fail(s, "score-mismatch", m[0]);
      continue;
    }
    if (running) {
      const ok = candidates.some(({ match, side }) => {
        if (side === null) return false; // 누가 앞섰는지 확인할 수 없다
        const states =
          kind === "ht"
            ? [parseHt(match.m.ht)].filter((x): x is Pair => x !== null)
            : runningScores(match);
        return states.some(
          (p) =>
            p[side] === a &&
            p[other(side)] === b &&
            (!lead || a > b) &&
            (!trail || a < b),
        );
      });
      if (!ok) fail(s, "score-mismatch", m[0]);
      continue;
    }
    if (kind === "ft") ftPairs += 1;
    let best: "ok" | "order" | "mismatch" = "mismatch";
    let missing: BriefLineReasonCode | null = null;
    for (const { match, side } of candidates) {
      const f = match.facts;
      if (!f) continue;
      const pair =
        kind === "ft"
          ? f.ft
          : kind === "ht"
            ? (parseHt(match.m.ht) ?? null)
            : kind === "regular"
              ? f.regular
              : f.pens;
      if (!pair) {
        missing =
          kind === "pens"
            ? "shootout"
            : kind === "regular"
              ? "extra-time"
              : "score-mismatch";
        continue;
      }
      // 'A와 B의 경기는 x-y로 끝났다'처럼 두 팀을 나란히 쓴 절은 앞 팀 점수 먼저로 읽힌다 — 홈-원정 순서는 앞 팀이 홈일 때만
      const firstNamed = pairedFirst(s, ci, match, pos);
      const r =
        firstNamed !== null
          ? orientedMatches(pair, a, b, firstNamed, side)
          : endOnly && side !== null
            ? orientedMatches(pair, a, b, side, null)
            : scoreMatches(pair, a, b, side);
      if (r === "ok") best = "ok";
      else if (r === "order" && best === "mismatch") best = "order";
    }
    if (best === "ok") continue;
    if (best === "order") fail(s, "score-order", m[0]);
    else fail(s, missing ?? "score-mismatch", m[0]);
  }
  // 허용 목록 방식(M1-23 리뷰 차단 1): 경기 점수가 있는 절에는 알아본 결과 서술이 있어야 한다 — 목록 밖 동의어('제쳤다'·
  // '웃었다'·'무너졌다' …)로는 누가 이겼는지 확인할 수 없어 점수 순서(D30 두 순서 허용)만 맞아도 통과하게 된다
  if (ftPairs > 0 && result.claims.length === 0 && !COMEBACK.test(seg))
    fail(s, "result-verb-unknown", seg.trim().split(/\s+/u).at(-1));
}

/**
 * 절에서 그 경기의 두 팀을 'A와 B'로 나란히 쓴 앞 팀의 쪽(점수 앞) — 없으면 null. 'Slavia Praha와 RC Lens의 경기는 2-3으로'.
 */
function pairedFirst(
  s: LineState,
  ci: number,
  match: MatchModel,
  pos: number,
): Side | null {
  const ms = s.clauses[ci]!.mentions.filter(
    (m) => m.kind === "team" && m.key && m.end <= pos,
  );
  for (let i = 0; i + 1 < ms.length; i += 1) {
    const a = ms[i]!;
    const b = ms[i + 1]!;
    if (a.particle !== "와" && a.particle !== "과") continue;
    if (!/^\s*$/u.test(s.masked.slice(a.end + a.particle.length, b.start)))
      continue;
    const teams = [match.home, match.away];
    if (!teams.includes(a.key!) || !teams.includes(b.key!) || a.key === b.key)
      continue;
    return a.key === match.home ? "home" : "away";
  }
  return null;
}

/** 앞 팀 먼저(`first`) 또는 결과 주어 먼저(`subjectSide`)만 인정 */
function orientedMatches(
  pair: Pair,
  a: number,
  b: number,
  first: Side,
  subjectSide: Side | null,
): "ok" | "order" | "mismatch" {
  const firstOk = pair[first] === a && pair[other(first)] === b;
  const subjectOk =
    subjectSide !== null &&
    pair[subjectSide] === a &&
    pair[other(subjectSide)] === b;
  if (firstOk || subjectOk) return "ok";
  if (pair[first] === b && pair[other(first)] === a) return "order";
  return "mismatch";
}

/** 경기 중 거친 점수(홈-원정) — 전반 점수 + 득점 순서(득점 목록이 완전할 때)의 매 골 뒤 점수 */
function runningScores(match: MatchModel): Pair[] {
  const out: Pair[] = [];
  const ht = parseHt(match.m.ht);
  if (ht) out.push(ht);
  const run: Pair = { home: 0, away: 0 };
  for (const g of match.goals ?? []) {
    run[g.side] += 1;
    out.push({ ...run });
  }
  return out;
}

function parseHt(ht: string | undefined): Pair | null {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(ht ?? "");
  return m ? { home: Number(m[1]), away: Number(m[2]) } : null;
}

/** 절 주어 팀의 (경기·쪽) — 결과 주어 → 가장 가까운 주어 묶음의 팀(하나일 때) */
function subjectMatch(
  s: LineState,
  ci: number,
  pos: number,
  result: ClauseResult,
): { team: string; match: MatchModel; side: Side } | "unknown" | null {
  if (result.subject) return result.subject;
  const g = subjectFor(s, ci, pos);
  if (!g) return null;
  if (!g.members) return "unknown";
  const teams = groupTeams(s, g) ?? [];
  if (teams.length !== 1) return null;
  const f = matchOfTeam(s, teams[0]!);
  return f ? { team: teams[0]!, ...f } : null;
}

function checkMatchWords(s: LineState, ci: number, result: ClauseResult): void {
  const c = s.clauses[ci]!;
  const seg = s.masked.slice(c.start, c.end);
  const line = s.masked;
  // 장소 — '홈에서' ⇒ 주어 팀 홈, 'X 원정에서' ⇒ X 홈·주어 원정, '원정에서' ⇒ 주어 원정
  for (const [re, want] of [
    [VENUE_HOME, "home"],
    [VENUE_AWAY, "away"],
  ] as const) {
    for (const m of seg.matchAll(new RegExp(re.source, "gu"))) {
      const pos = c.start + m.index;
      const named = c.mentions.find(
        (x) =>
          x.kind === "team" &&
          x.particle === "" &&
          /^\s*$/u.test(s.masked.slice(x.end, pos)),
      );
      const subj = subjectMatch(s, ci, pos, result);
      const match =
        (named?.key ? matchOfTeam(s, named.key)?.match : undefined) ??
        (subj && subj !== "unknown" ? subj.match : undefined) ??
        (s.refMatches.length === 1 ? s.refMatches[0] : undefined);
      if (!match) {
        fail(s, "venue", m[0]);
        continue;
      }
      if (NEUTRAL_ROUNDS.has(match.m.round)) {
        fail(s, "venue", m[0]);
        continue;
      }
      if (named?.key) {
        // 'X 원정에서'·'X 홈에서' — X가 홈 팀
        if (named.key !== match.home) fail(s, "venue", m[0]);
        if (subj && subj !== "unknown" && subj.team === named.key)
          fail(s, "venue", m[0]);
        continue;
      }
      if (subj === "unknown") {
        fail(s, "name-unknown", m[0]);
        continue;
      }
      if (!subj) {
        fail(s, "venue", m[0]);
        continue;
      }
      if (subj.side !== want) fail(s, "venue", m[0]);
    }
  }
  // 라운드 낱말 ⇒ 근거 경기 round('8강'의 숫자는 라운드 이름이지 사실 숫자가 아니다 — 가져간다)
  for (const { re, rounds } of ROUND_WORDS) {
    const m = re.exec(seg);
    if (!m) continue;
    consume(s, c.start + m.index, c.start + m.index + m[0].length);
    const ok =
      s.refMatches.some(
        (x) =>
          rounds.includes(x.m.round) ||
          (rounds.includes("LEAGUE_STAGE") && /^League phase/u.test(x.m.round)),
      ) ||
      (rounds.includes("LEAGUE_STAGE") &&
        s.refStandings.some((x) => x.comp === "c:UCL"));
    if (!ok) fail(s, "round", m[0]);
  }
  // 'n라운드' ⇒ 근거 경기의 Matchday·리그 페이즈 MD 번호 또는 근거 순위표의 경기 수
  for (const m of seg.matchAll(/(\d{1,2})\s?라운드/gu)) {
    const pos = c.start + m.index;
    consume(s, pos, pos + m[0].length);
    const n = Number(m[1]);
    const ok =
      s.refMatches.some(
        (x) => /(?:Matchday|MD) (\d+)$/u.exec(x.m.round)?.[1] === String(n),
      ) || s.refStandings.some((t) => t.rows.some((r) => r.played === n));
    if (!ok) fail(s, "round", m[0]);
  }
  // 연장·승부차기
  const subj = subjectMatch(s, ci, c.start, result);
  const target = subj && subj !== "unknown" ? [subj.match] : s.refMatches;
  if (EXTRA_TIME_DECIDED.test(seg)) {
    const ok = target.some((x) => {
      const f = x.facts;
      if (!f || !f.aet) return false;
      if (f.pens) return SHOOTOUT.test(line);
      if (f.winner === null) return f.ft.home === f.ft.away;
      return (
        f.regular !== null && f.regular[f.winner] <= f.regular[other(f.winner)]
      );
    });
    if (!ok) fail(s, "extra-time", "연장 끝에");
  } else if (EXTRA_TIME.test(seg)) {
    if (!target.some((x) => x.facts?.aet)) fail(s, "extra-time", "연장");
  }
  if (SHOOTOUT.test(seg) && !target.some((x) => x.facts?.pens))
    fail(s, "shootout", "승부차기");
  // 역전
  if (COMEBACK_LOSS.test(seg) || COMEBACK.test(seg)) {
    const loss = COMEBACK_LOSS.test(seg);
    if (subj === "unknown") fail(s, "name-unknown", "역전");
    else if (!subj) fail(s, "comeback", loss ? "역전패" : "역전");
    else {
      const f = subj.match.facts;
      const role = loss
        ? f?.winner !== null && f?.winner !== subj.side
        : f?.winner === subj.side;
      if (!f || !role || !f.comeback || f.pens)
        fail(s, "comeback", loss ? "역전패" : "역전");
    }
  }
  // 점수 차 평가어(정의대로)
  for (const word of MARGIN_WORDS) {
    const m = word.re.exec(seg);
    if (!m) continue;
    if (subj === "unknown") {
      fail(s, "name-unknown", m[0]);
      continue;
    }
    const f = subj?.match.facts;
    const roleOk =
      !!subj &&
      !!f &&
      f.winner !== null &&
      !f.pens &&
      (word.role === "winner"
        ? f.winner === subj.side
        : f.winner !== subj.side);
    const marginOk =
      !!f &&
      f.margin >= word.margin.min &&
      (word.margin.max === undefined || f.margin <= word.margin.max);
    if (!roleOk || !marginOk) fail(s, "margin", m[0]);
  }
  // 무실점 ⇒ 주어 팀의 상대 점수 0
  const cs = CLEAN_SHEET.exec(seg);
  if (cs) {
    if (subj === "unknown") fail(s, "name-unknown", cs[0]);
    else if (!subj?.match.facts || subj.match.facts.ft[other(subj.side)] !== 0)
      fail(s, "score-mismatch", cs[0]);
  }
  const ev = EVAL_UNSUPPORTED.exec(seg);
  if (ev) fail(s, "eval-unsupported", ev[0]);
  const hist = HISTORY_UNSUPPORTED.exec(seg);
  if (hist) fail(s, "history-unsupported", hist[0]);
}

/** 얻은 승점('승점 3을 챙겼다') ⇒ 리그 경기 승리 3·무승부 1(표의 승점이 아니다) — 순위 검사보다 먼저 가져간다 */
function checkGainedPoints(
  s: LineState,
  ci: number,
  result: ClauseResult,
): void {
  const c = s.clauses[ci]!;
  const seg = s.masked.slice(c.start, c.end);
  const subj = subjectMatch(s, ci, c.start, result);
  for (const m of seg.matchAll(new RegExp(GAINED_POINTS.source, "gu"))) {
    const pos = c.start + m.index;
    consume(s, pos, pos + m[0].length);
    const n = m[1] !== undefined ? Number(m[1]) : null;
    const shared = /나눠/u.test(m[0]);
    // 경기 — 주어 팀의 경기, 'A와 B는 … 승점을 나눠 가졌다'처럼 주어가 둘이면 근거 경기가 하나일 때 그 경기
    const match =
      subj && subj !== "unknown"
        ? subj.match
        : s.refMatches.length === 1
          ? s.refMatches[0]!
          : null;
    const side = subj && subj !== "unknown" ? subj.side : null;
    const f = match?.facts ?? null;
    // 리그 경기(리그·UCL 리그 페이즈)만 승점이 있다 — 녹아웃(연장·승부차기)에는 없다
    const league = !!match && /^(?:Matchday|League phase)/u.test(match.m.round);
    const draw = !!f && f.winner === null;
    const won = !!f && side !== null && f.winner === side;
    const ok =
      !!f &&
      league &&
      !f.pens &&
      (n === 3
        ? won
        : n === 1 || shared
          ? draw
          : n === null
            ? won || draw
            : false);
    if (!ok) fail(s, "points", m[0]);
  }
}

// ─── 득점·분 ─────────────────────────────────────────────────────────────

type Anchor =
  | { type: "player"; key: string; mention: Mention }
  | { type: "team"; key: string }
  | { type: "unknown"; word: string }
  | null;

/**
 * 득점·출전 서술의 대상 — 바로 뒤 선수 이름('80분 Daniel Svensson') → 앞쪽 가장 가까운 선수 이름 → 주어 묶음(팀·선수) → 이어받은
 * 주어. 앞쪽에서 선수 이름보다 가까운 사전 밖 주어 낱말이 있으면 unknown.
 */
function anchorAt(
  s: LineState,
  ci: number,
  pos: number,
  end: number,
  preferFollowing: boolean,
): Anchor {
  const c = s.clauses[ci]!;
  if (preferFollowing) {
    const next = c.mentions.find(
      (m) =>
        m.start >= end &&
        m.kind === "player" &&
        /^[\s,]*$/u.test(s.masked.slice(end, m.start)),
    );
    if (next?.key) return { type: "player", key: next.key, mention: next };
  }
  const players = c.mentions.filter(
    (m) => m.kind === "player" && m.key && m.end <= pos,
  );
  const lastPlayer = players.at(-1);
  const unknown = c.subjects.filter((g) => !g.members && g.pos < pos).at(-1);
  if (unknown && (!lastPlayer || unknown.pos > lastPlayer.start))
    return { type: "unknown", word: unknown.word ?? "" };
  if (lastPlayer?.key)
    return { type: "player", key: lastPlayer.key, mention: lastPlayer };
  const g = subjectFor(s, ci, pos);
  if (g && !g.members) return { type: "unknown", word: g.word ?? "" };
  const member = g?.members?.at(-1);
  if (member?.kind === "player" && member.key)
    return { type: "player", key: member.key, mention: member };
  if (member?.kind === "team" && member.key)
    return { type: "team", key: member.key };
  // 절에 팀 이름 하나 — 주어 조사가 없어도('Bayern의')
  const teams = c.mentions.filter(
    (m) => m.kind === "team" && m.key && m.end <= pos,
  );
  const lastTeam = teams.at(-1);
  if (lastTeam?.key) return { type: "team", key: lastTeam.key };
  return null;
}

/** 선수의 근거 경기 득점(자책골 제외)·자책골·도움 */
function playerGoals(
  s: LineState,
  player: string,
): {
  goals: GoalRow[];
  own: GoalRow[];
  assists: number;
  known: boolean;
  match: MatchModel | null;
} {
  for (const match of s.refMatches) {
    const inMatch =
      match.m.goals?.some(
        (g) =>
          s.model.latin.get(foldName(g.player))?.key === player ||
          s.model.latin.get(foldName(g.assist ?? ""))?.key === player,
      ) ?? false;
    const korean = s.refKorean.find(
      (k) => k.player === player && k.k.match === match.id,
    );
    if (!inMatch && !korean) continue;
    if (!match.goals) {
      return { goals: [], own: [], assists: 0, known: false, match };
    }
    const goals = match.goals.filter((g) => g.player === player && !g.ownGoal);
    const own = match.goals.filter((g) => g.player === player && g.ownGoal);
    return {
      goals,
      own,
      assists: match.assists?.get(player) ?? 0,
      known: true,
      match,
    };
  }
  // 득점·도움 기록이 없는 선수 — 한국 선수 블록이면 그 숫자
  const k = s.refKorean.find((x) => x.player === player);
  if (k) {
    const match = s.model.matches.get(k.k.match) ?? null;
    if (match?.goals) {
      return {
        goals: match.goals.filter((g) => g.player === player && !g.ownGoal),
        own: match.goals.filter((g) => g.player === player && g.ownGoal),
        assists: match.assists?.get(player) ?? 0,
        known: true,
        match,
      };
    }
    return {
      goals: [],
      own: [],
      assists: k.k.assists,
      known: k.k.goals === 0,
      match,
    };
  }
  return { goals: [], own: [], assists: 0, known: false, match: null };
}

/** 팀의 근거 경기 득점 */
function teamGoals(
  s: LineState,
  team: string,
): { match: MatchModel; side: Side; goals: GoalRow[] | null } | null {
  const f = matchOfTeam(s, team);
  if (!f) return null;
  return {
    ...f,
    goals: f.match.goals?.filter((g) => g.side === f.side) ?? null,
  };
}

function checkGoals(s: LineState, ci: number): void {
  const c = s.clauses[ci]!;
  const seg = s.masked.slice(c.start, c.end);

  // n골 차(점수 차 — D40 ②) · n골을 주고받(합)
  for (const m of seg.matchAll(/(\d{1,2})\s?골\s?차/gu)) {
    const pos = c.start + m.index;
    consume(s, pos, pos + m[0].length);
    const n = Number(m[1]);
    if (!s.refMatches.some((x) => x.facts && x.facts.margin === n))
      fail(s, "margin", m[0]);
  }
  for (const m of seg.matchAll(
    /(\d{1,2})\s?골(?:을|이)?\s?(?:주고받|나온|나왔|나오|터진|터졌|오간|오갔)/gu,
  )) {
    const pos = c.start + m.index;
    consume(s, pos, pos + m[0].length);
    const n = Number(m[1]);
    if (
      !s.refMatches.some(
        (x) => x.facts && x.facts.ft.home + x.facts.ft.away === n,
      )
    )
      fail(s, "count-unsupported", m[0]);
  }
  // n번째 — 세지 않는다
  for (const m of seg.matchAll(/(\d{1,2})\s?번째/gu)) {
    const pos = c.start + m.index;
    consume(s, pos, pos + m[0].length);
    fail(s, "count-unsupported", m[0]);
  }

  // 선수(또는 팀) 골 수·도움 수·해트트릭·멀티골
  const countClaims: Array<{
    re: RegExp;
    check: (n: number | null, g: ReturnType<typeof playerGoals>) => boolean;
    code: BriefLineReasonCode;
  }> = [
    {
      re: /(\d{1,2})\s?골(?!\s?차|키퍼|대|문|망|라인|\s?(?:을|이)?\s?(?:주고받|나온|나왔|나오|터진|터졌|오간|오갔))/gu,
      check: (n, g) => g.known && g.goals.length === n,
      code: "goal-count",
    },
    {
      // '골 4개'·'4번 골망을 흔들었다'·'두 차례 골을' — 개수 주장(M1-23 리뷰 차단 5)
      re: /골\s?(\d{1,2})\s?개|(\d{1,2})\s?(?:번|차례)\s?(?:골망|골|득점)/gu,
      check: (n, g) => g.known && g.goals.length === n,
      code: "goal-count",
    },
    {
      re: /도움\s?(\d{1,2})\s?개/gu,
      check: (n, g) => g.known && g.assists === n,
      code: "assist-count",
    },
    {
      re: /(\d{1,2})\s?도움/gu,
      check: (n, g) => g.known && g.assists === n,
      code: "assist-count",
    },
    {
      re: /해트트릭/gu,
      check: (_, g) => g.known && g.goals.length >= 3,
      code: "goal-count",
    },
    {
      re: /멀티\s?골/gu,
      check: (_, g) => g.known && g.goals.length >= 2,
      code: "goal-count",
    },
  ];
  const timeQualified = /(?:전반|후반|막판|연장)/u.test(seg);
  for (const claim of countClaims) {
    for (const m of seg.matchAll(new RegExp(claim.re.source, "gu"))) {
      const pos = c.start + m.index;
      const end = pos + m[0].length;
      if (isConsumed(s, pos, end)) continue;
      consume(s, pos, end);
      const digits = m.slice(1).find((x) => x !== undefined);
      const n = digits !== undefined ? Number(digits) : null;
      const anchor = anchorAt(s, ci, pos, end, false);
      if (!anchor) {
        fail(s, "count-unsupported", m[0]);
        continue;
      }
      if (anchor.type === "unknown") {
        fail(s, "name-unknown", anchor.word);
        continue;
      }
      if (anchor.type === "team") {
        // 팀 합계 = 그 팀 점수(시간대 수식 없이)만 — '후반 4골'처럼 팀·시간대별로 센 수는 불허
        const t = teamGoals(s, anchor.key);
        const ok =
          claim.code === "goal-count" &&
          n !== null &&
          !timeQualified &&
          !!t?.match.facts &&
          t.match.facts.ft[t.side] === n;
        if (!ok) fail(s, "count-unsupported", m[0]);
        continue;
      }
      const g = playerGoals(s, anchor.key);
      if (!claim.check(n, g))
        fail(s, claim.code, `${anchor.mention.text} ${m[0]}`);
    }
  }

  // 결승골·동점골·선제골·자책골·득점(골) 서술
  const goalNouns: Array<{
    re: RegExp;
    code: BriefLineReasonCode;
    pick: (match: MatchModel, f: MatchFacts) => GoalRow | null;
  }> = [
    {
      re: /결승골/gu,
      code: "decisive-goal",
      pick: (match, f) => {
        if (f.pens || f.winner === null || !match.goals) return null;
        const loser = f.ft[other(f.winner)];
        const g = match.goals.filter((x) => x.side === f.winner)[loser];
        return g && !g.ownGoal ? g : null;
      },
    },
    {
      re: /동점골/gu,
      code: "equaliser",
      pick: (match, f) => {
        if (f.ft.home !== f.ft.away || f.ft.home === 0 || !match.goals)
          return null;
        const g = match.goals.at(-1);
        return g && !g.ownGoal ? g : null;
      },
    },
    {
      re: /선제골|첫\s?골/gu,
      code: "opening-goal",
      pick: (match) => {
        const g = match.goals?.[0];
        return g && !g.ownGoal ? g : null;
      },
    },
  ];
  for (const noun of goalNouns) {
    for (const m of seg.matchAll(new RegExp(noun.re.source, "gu"))) {
      const pos = c.start + m.index;
      const anchor = anchorAt(s, ci, pos, pos + m[0].length, false);
      if (anchor?.type === "unknown") {
        fail(s, "name-unknown", anchor.word);
        continue;
      }
      // 분('55분 결승골'·'55분 PK 결승골')
      const minText =
        /(\d{1,3}(?:\+\d{1,2})?)\s?분\s?(?:PK\s?|페널티킥\s?)?$/u.exec(
          s.masked.slice(c.start, pos),
        );
      const penaltyNear = /(?:PK|페널티킥)\s?$/u.test(
        s.masked.slice(c.start, pos),
      );
      let ok = false;
      const matchList =
        anchor?.type === "player"
          ? s.refMatches.filter(
              (x) => x.goals?.some((g) => g.player === anchor.key) ?? false,
            )
          : anchor?.type === "team"
            ? s.refMatches.filter(
                (x) => x.home === anchor.key || x.away === anchor.key,
              )
            : s.refMatches;
      for (const match of matchList) {
        const f = match.facts;
        if (!f) continue;
        const g = noun.pick(match, f);
        if (!g) continue;
        if (anchor?.type === "player" && g.player !== anchor.key) continue;
        if (anchor?.type === "team") {
          const side = match.home === anchor.key ? "home" : "away";
          if (g.side !== side) continue;
        }
        if (minText && minText[1] !== g.min) continue;
        if (penaltyNear && !g.penalty) continue;
        ok = true;
      }
      if (!ok) fail(s, noun.code, m[0]);
      if (minText) {
        const start = c.start + minText.index;
        consume(s, start, start + minText[0].length);
      }
    }
  }
  // 득점 없음 — 선수 0골 · 팀 0점
  const ng = NO_GOAL.exec(seg);
  if (ng) {
    const pos = c.start + ng.index;
    const anchor = anchorAt(s, ci, pos, pos + ng[0].length, false);
    if (anchor?.type === "unknown") fail(s, "name-unknown", anchor.word);
    else if (anchor?.type === "player") {
      const k = s.refKorean.find((x) => x.player === anchor.key);
      const g = playerGoals(s, anchor.key);
      const zero = k ? k.k.goals === 0 : g.known && g.goals.length === 0;
      if (!zero) fail(s, "goal-count", ng[0]);
    } else if (anchor?.type === "team") {
      const t = teamGoals(s, anchor.key);
      if (!t?.match.facts || t.match.facts.ft[t.side] !== 0)
        fail(s, "goal-count", ng[0]);
    }
  }
  // 자책골 — 그 선수의 자책골이 있어야
  for (const m of seg.matchAll(/자책골/gu)) {
    const pos = c.start + m.index;
    const anchor = anchorAt(s, ci, pos, pos + m[0].length, false);
    if (anchor?.type === "player") {
      if (playerGoals(s, anchor.key).own.length === 0) fail(s, "scorer", m[0]);
    } else if (!s.refMatches.some((x) => x.goals?.some((g) => g.ownGoal)))
      fail(s, "scorer", m[0]);
  }
  // PK(경기 중 페널티킥) — 그 선수(또는 근거 경기)에 PK 골이 있어야
  const pk = PENALTY.exec(seg);
  if (pk && !SHOOTOUT.test(seg)) {
    const pos = c.start + pk.index;
    const anchor = anchorAt(s, ci, pos, pos + pk[0].length, false);
    const has =
      anchor?.type === "player"
        ? playerGoals(s, anchor.key).goals.some((g) => g.penalty)
        : s.refMatches.some((x) => x.goals?.some((g) => g.penalty));
    if (!has) fail(s, "penalty", pk[0]);
  }
}

/** 선수 key → 이름 묶음 앞쪽 목록('A와 B의 연속골') 포함 소유 선수들 — 소유격 이름 바로 뒤가 pos */
function genitivePlayers(s: LineState, ci: number, pos: number): Mention[] {
  const c = s.clauses[ci]!;
  const owner = [...c.mentions]
    .reverse()
    .find(
      (m) =>
        m.end <= pos &&
        m.kind === "player" &&
        m.particle === "의" &&
        /^[\s\d+분PK]*$/u.test(
          s.masked.slice(m.end + 1, pos).replace(/페널티킥|연속/gu, ""),
        ),
    );
  if (!owner) return [];
  const out = [owner];
  const idx = c.mentions.indexOf(owner);
  for (let k = idx - 1; k >= 0; k -= 1) {
    const prev = c.mentions[k]!;
    if (prev.kind !== "player" || !listJoined(prev, out[0]!, s.text)) break;
    out.unshift(prev);
  }
  return out;
}

/** 근거 경기에서 그 선수의 골(자책골 여부로 고름) — 득점 목록을 모르면 null */
function goalsOf(s: LineState, player: string, own: boolean): GoalRow[] | null {
  const g = playerGoals(s, player);
  if (!g.known) return null;
  return own ? g.own : g.goals;
}

/**
 * 숫자 없는 득점·도움 서술과 소속(M1-23 리뷰 차단 3·4, 중요 3):
 *   'X가 골을 넣었다'·'득점했다'·'골망을 흔들었다' ⇒ X에게 자책골이 아닌 골(절에 '자책'이 있으면 자책골)이 있어야 · 'X의 골로'·
 *   'X의 득점으로' ⇒ X의 골(결과 주어 팀이 있으면 그 팀 쪽 골) · '도움'·'도왔다' ⇒ 그 선수에게 도움, 'Y의 결승골을 도왔다' ⇒ 그 골의
 *   도움이 주어 · '만회골' ⇒ 진 팀의 골 · 'T의 X'·'X가 T 소속으로' ⇒ X가 T의 선수
 */
function checkGoalClaims(s: LineState, ci: number, result: ClauseResult): void {
  const c = s.clauses[ci]!;
  const seg = s.masked.slice(c.start, c.end);
  const own = /자책/u.test(seg);
  // 득점 서술
  const scoring = SCORING.exec(seg);
  const negated = NO_GOAL.test(seg) || /넣지\s?못/u.test(seg);
  if (scoring && !negated) {
    const pos = c.start + scoring.index;
    const anchor = anchorAt(s, ci, pos, pos + scoring[0].length, false);
    if (anchor?.type === "unknown") fail(s, "name-unknown", anchor.word);
    else if (anchor?.type === "player") {
      const rows = goalsOf(s, anchor.key, own);
      const korean = s.refKorean.find((k) => k.player === anchor.key);
      const scored =
        rows !== null
          ? rows.length > 0
          : korean
            ? !own && korean.k.goals > 0
            : false;
      if (!scored) fail(s, "scorer", `${anchor.mention.text} ${scoring[0]}`);
    } else if (anchor?.type === "team") {
      const t = teamGoals(s, anchor.key);
      if (!t?.match.facts || t.match.facts.ft[t.side] === 0)
        fail(s, "scorer", scoring[0]);
    }
  }
  // 'X의 골로'·'X의 득점으로'
  for (const m of seg.matchAll(new RegExp(SCORING_NOUN.source, "gu"))) {
    const pos = c.start + m.index;
    const owners = genitivePlayers(s, ci, pos);
    for (const o of owners) {
      if (!o.key) continue;
      const rows = goalsOf(s, o.key, own) ?? [];
      const side =
        result.subject &&
        rows.length > 0 &&
        s.refMatches.includes(result.subject.match)
          ? result.subject.side
          : null;
      const ok = rows.some((g) => side === null || g.side === side);
      if (!ok) fail(s, "scorer", `${o.text}의 ${m[0]}`);
    }
  }
  // 만회골 ⇒ 진 팀의 골
  for (const m of seg.matchAll(/만회골/gu)) {
    if (negated) break;
    const pos = c.start + m.index;
    const anchor = anchorAt(s, ci, pos, pos + m[0].length, false);
    if (anchor?.type !== "player") continue;
    const ok = s.refMatches.some((x) => {
      const f = x.facts;
      if (!f || f.winner === null || !x.goals) return false;
      return x.goals.some(
        (g) => g.player === anchor.key && !g.ownGoal && g.side !== f.winner,
      );
    });
    if (!ok) fail(s, "scorer", m[0]);
  }
  // 도움 서술 — 'n도움'·'도움 n개'는 개수 규칙이 이미 봤다
  const assist = ASSIST.exec(seg);
  if (assist && !NO_ASSIST.test(seg)) {
    const pos = c.start + assist.index;
    if (!isConsumed(s, pos, pos + assist[0].length)) {
      // 도움을 준 선수 — 'Y의 도움으로'면 Y, 아니면 절의 주어(선수)
      const giver = genitivePlayers(s, ci, pos)[0];
      const g = subjectFor(s, ci, pos);
      const provider =
        giver && /^도움/u.test(assist[0])
          ? { key: giver.key!, text: giver.text }
          : g && g.members
            ? (() => {
                const p = g.members.find((x) => x.kind === "player" && x.key);
                return p ? { key: p.key!, text: p.text } : null;
              })()
            : null;
      if (g && !g.members && !giver) fail(s, "name-unknown", g.word);
      else if (provider) {
        // 'Y의 결승골을 도왔다' — 도운 골이 정해져 있으면 그 골의 도움이 주어
        const tm = /(결승골|동점골|선제골|골)(?:을|를|에)?\s?$/u.exec(
          s.masked.slice(c.start, pos),
        );
        const target = tm?.[1] ?? null;
        const scorer = tm
          ? genitivePlayers(s, ci, c.start + tm.index)[0]
          : undefined;
        let ok: boolean;
        if (target) {
          ok = s.refMatches.some((x) => {
            const f = x.facts;
            if (!f || !x.goals) return false;
            let goals = x.goals.filter((r) => !r.ownGoal);
            if (target === "결승골") {
              if (f.pens || f.winner === null) return false;
              const d = x.goals.filter((r) => r.side === f.winner)[
                f.ft[other(f.winner)]
              ];
              goals = d ? [d] : [];
            } else if (target === "동점골") {
              const last = x.goals.at(-1);
              goals = f.ft.home === f.ft.away && last ? [last] : [];
            } else if (target === "선제골") {
              goals = x.goals[0] ? [x.goals[0]] : [];
            }
            if (scorer?.key)
              goals = goals.filter((r) => r.player === scorer.key);
            return goals.some((r) => r.assist === provider.key);
          });
        } else {
          const pg = playerGoals(s, provider.key);
          const korean = s.refKorean.find((k) => k.player === provider.key);
          ok = pg.known
            ? pg.assists > 0
            : korean
              ? korean.k.assists > 0
              : false;
        }
        if (!ok) fail(s, "assist-count", `${provider.text} ${assist[0]}`);
      }
    }
  }
  // 소속 — 'T의 X'(팀 바로 뒤 선수) · 'X가 T 소속으로'
  c.mentions.forEach((m, i) => {
    if (m.kind !== "team" || !m.key) return;
    const next = c.mentions[i + 1];
    const between = next
      ? s.masked.slice(m.end + m.particle.length, next.start)
      : "";
    let player: Mention | undefined;
    if (
      m.particle === "의" &&
      next?.kind === "player" &&
      /^\s*$/u.test(between)
    )
      player = next;
    else if (/^\s*소속/u.test(s.masked.slice(m.end + m.particle.length)))
      player =
        [...c.mentions.slice(0, i)]
          .reverse()
          .find((x) => x.kind === "player") ??
        c.mentions.slice(i + 1).find((x) => x.kind === "player");
    if (!player?.key) return;
    const team = teamOfPlayer(s, player.key);
    if (team !== null && team !== m.key)
      fail(s, "affiliation", `${m.text} ${player.text}`);
  });
}

function checkMinutes(s: LineState, ci: number): void {
  const c = s.clauses[ci]!;
  const seg = s.masked.slice(c.start, c.end);
  const appearance = APPEARANCE_CONTEXT.test(seg);
  const goalCtx = GOAL_CONTEXT.test(seg);
  const re =
    /(?<![\d+])(\d{1,3})(?:\+(\d{1,2}))?\s?분|(?<![\d+])(\d{1,3})\+(\d{1,2})(?!\d)/gu;
  for (const m of seg.matchAll(re)) {
    const pos = c.start + m.index;
    const end = pos + m[0].length;
    if (isConsumed(s, pos, end) && !/분/u.test(m[0])) continue;
    consume(s, pos, end);
    const base = Number(m[1] ?? m[3]);
    const extraRaw = m[2] ?? m[4];
    const label = extraRaw ? `${base}+${extraRaw}` : String(base);
    const before = s.masked.slice(c.start, pos);
    const after = s.masked.slice(end);
    // '90분을 1-1로 마쳤다'·'90분까지 1-1' — 정규시간을 가리키는 말(점수는 checkScores가 regular로 대조)
    if (
      base === 90 &&
      !extraRaw &&
      /^(?:을|까지|동안|\s?동안|에는|엔)?\s?\d{1,2}\s?[-–]\s?\d/u.test(after)
    )
      continue;
    // 전반·후반 수식 — '후반 10분'(바꿔 쓴 분)은 강등
    const half = /(전반|후반)\s?$/u.exec(before)?.[1];
    if (half === "전반" && base > 45)
      fail(s, "minute-half", `${half} ${label}분`);
    if (half === "후반" && base < 46)
      fail(s, "minute-half", `${half} ${label}분`);
    const anchor = anchorAt(s, ci, pos, end, true);
    if (anchor?.type === "unknown") {
      fail(s, "name-unknown", anchor.word);
      continue;
    }
    // 한국 선수 출전 기록
    const k =
      anchor?.type === "player"
        ? s.refKorean.find((x) => x.player === anchor.key)
        : undefined;
    if (appearance && k) {
      const kk = k.k;
      const played = /^(?:을|간|\s?동안)?\s?(?:뛰|소화)/u.test(after);
      const on = /^(?:에)?\s?(?:교체\s?)?(?:투입|교체로|교체\s?출전)/u.test(
        after,
      );
      const off =
        /^(?:까지\s?뛰|에\s?교체(?:\s?아웃|됐|돼|되)|\s?교체\s?아웃)/u.test(
          after,
        );
      const want = played
        ? [kk.minutes]
        : on
          ? [kk.subOn]
          : off
            ? [kk.subOff]
            : [kk.minutes, kk.subOn, kk.subOff];
      if (extraRaw || !want.includes(base)) fail(s, "minute", `${label}분`);
      continue;
    }
    if (goalCtx || anchor?.type === "player") {
      // 자책골 기록은 그 절에 '자책'이 있을 때만 맞는 분이다(자책골을 일반 골처럼 쓴 문장 — M1-23 리뷰 차단 4)
      const ownCtx = /자책/u.test(seg);
      const rows =
        anchor?.type === "player"
          ? ownCtx
            ? playerGoals(s, anchor.key).own
            : playerGoals(s, anchor.key).goals
          : anchor?.type === "team"
            ? (teamGoals(s, anchor.key)?.goals ?? [])
            : s.refMatches.flatMap((x) => x.goals ?? []);
      if (!rows.some((g) => g.min === label)) fail(s, "minute", `${label}분`);
      continue;
    }
    // 그 밖 — 근거 항목의 분(득점 시각·한국 선수 기록)
    const known = new Set<string>();
    for (const x of s.refMatches)
      for (const g of x.goals ?? []) known.add(g.min);
    for (const x of s.refKorean) {
      for (const v of [x.k.minutes, x.k.subOn, x.k.subOff])
        if (v !== undefined) known.add(String(v));
    }
    if (!known.has(label)) fail(s, "minute", `${label}분`);
  }
}

function checkAppearance(s: LineState, ci: number): void {
  const c = s.clauses[ci]!;
  const seg = s.masked.slice(c.start, c.end);
  if (!APPEARANCE_CONTEXT.test(seg)) return;
  const m = APPEARANCE_CONTEXT.exec(seg)!;
  const pos = c.start + m.index;
  const anchor = anchorAt(s, ci, pos, pos + m[0].length, false);
  if (anchor?.type === "unknown") {
    fail(s, "name-unknown", anchor.word);
    return;
  }
  const k =
    anchor?.type === "player"
      ? s.refKorean.find((x) => x.player === anchor.key)
      : undefined;
  if (!k) {
    // 출전 기록은 한국 선수 블록에만 있다(라인업 미입력 — M0-30 지시문). 팀 주어('선두로 나섰다')는 순위 규칙이 본다
    if (anchor?.type === "player") fail(s, "appearance", m[0]);
    return;
  }
  const kk = k.k;
  // 출전했다는 서술('출전했다'·'나섰다'·'n분을 뛰었다'·'투입됐다')은 출전 시간이 있어야 한다 — 0분(벤치)이면 강등
  const negatedAppearance =
    /(?:출전하지|결장|벤치|나서지\s?못|뛰지\s?못|명단에만|출전\s?기회)/u.test(
      seg,
    );
  if (
    !negatedAppearance &&
    /(?:출전|출장|나섰|나서|뛰|투입|선발|소화)/u.test(seg) &&
    kk.minutes <= 0
  )
    fail(s, "appearance", "출전");
  const subOn = SUB_ON.test(seg);
  const subOff = SUB_OFF.test(seg);
  if (/선발/u.test(seg) && !kk.started) fail(s, "appearance", "선발");
  if (subOn && (kk.started || kk.subOn === undefined))
    fail(s, "appearance", "교체 투입");
  if (subOff && !subOn && kk.subOff === undefined)
    fail(s, "appearance", "교체 아웃");
  if (
    /풀타임/u.test(seg) &&
    (!kk.started || kk.subOff !== undefined || kk.minutes < 90)
  )
    fail(s, "appearance", "풀타임");
  if (/(?:결장|출전하지|벤치)/u.test(seg) && kk.minutes > 0)
    fail(s, "appearance", "결장");
}

// ─── 순위 ────────────────────────────────────────────────────────────────

/** 순위 서술의 팀 — 바로 뒤 팀 이름('2위 Bayern') → 앞쪽 가장 가까운 팀 이름(목록이면 묶음 전체) → 이어받은 주어 */
function rankTeams(
  s: LineState,
  ci: number,
  pos: number,
  end: number,
): string[] | "unknown" | null {
  const c = s.clauses[ci]!;
  const groupOf = (m: Mention): string[] => {
    const g = c.subjects.find((x) => x.members?.includes(m));
    return g?.members
      ? g.members.filter((x) => x.kind === "team" && x.key).map((x) => x.key!)
      : [m.key!];
  };
  // ① 바로 뒤 팀 이름('2위 Bayern'·'선두 Dortmund')
  const next = c.mentions.find(
    (m) => m.start >= end && /^\s*$/u.test(s.masked.slice(end, m.start)),
  );
  if (next?.kind === "team" && next.key) return [next.key];
  // ② 바로 앞 팀 이름('Bayern(10점)')
  const prev = [...c.mentions].reverse().find((m) => m.end <= pos);
  if (
    prev?.kind === "team" &&
    prev.key &&
    /^[\s(]*$/u.test(s.masked.slice(prev.end + prev.particle.length, pos))
  )
    return groupOf(prev);
  // ③ 가장 가까운 주어 묶음('Arsenal은 … Man City와 동률이지만 … 2위다' — 주어가 비교 대상보다 우선)
  const subj = c.subjects.filter((g) => g.pos < pos).at(-1);
  if (subj) {
    if (!subj.members) return "unknown";
    const teams = groupTeams(s, subj) ?? [];
    if (teams.length > 0) return teams;
  }
  // ④ 앞쪽 가장 가까운 팀 이름 → ⑤ 이어받은 주어
  const last = c.mentions
    .filter((m) => m.kind === "team" && m.key && m.end <= pos)
    .at(-1);
  if (last) return groupOf(last);
  const g = subjectFor(s, ci, pos);
  if (g && !g.members) return "unknown";
  const teams = g ? (groupTeams(s, g) ?? []) : [];
  return teams.length > 0 ? teams : null;
}

function rowsOf(s: LineState, team: string): RowModel[] {
  return s.refStandings.flatMap((t) => t.rows.filter((r) => r.team === team));
}

function checkStandings(s: LineState, ci: number): void {
  const c = s.clauses[ci]!;
  const seg = s.masked.slice(c.start, c.end);
  const tables = s.refStandings;
  const allRows = tables.flatMap((t) => t.rows);

  // 득실차 '+5' — 점수 쌍보다 먼저
  for (const m of seg.matchAll(/득실(?:\s?차)?\s?([+−-]?\d{1,2})/gu)) {
    const pos = c.start + m.index;
    consume(s, pos, pos + m[0].length);
    const raw = m[1]!.replace("−", "-");
    const v = Number(raw);
    const teams = rankTeams(s, ci, pos, pos + m[0].length);
    if (teams === "unknown") {
      fail(s, "name-unknown", m[0]);
      continue;
    }
    const ok = teams
      ? teams.every((t) =>
          rowsOf(s, t).some(
            (r) => r.gd === v || (!/[+-]/u.test(raw) && Math.abs(r.gd) === v),
          ),
        )
      : allRows.some((r) => r.gd === v);
    if (!ok) fail(s, "goal-diff", m[0]);
  }

  // 표 아래쪽 순위('최하위'·'강등권') — 입력 순위표는 상위권만이라(note) 근거가 없다
  const bottom = /최하위|꼴찌|강등권/u.exec(seg);
  if (bottom) fail(s, "rank-pos", bottom[0]);

  // 순위 변동 'n위에서 m위로'
  for (const m of seg.matchAll(/(\d{1,2})위에서\s?(\d{1,2})위/gu)) {
    const pos = c.start + m.index;
    const end = pos + m[0].length;
    consume(s, pos, end);
    const teams = rankTeams(s, ci, pos, end);
    if (teams === "unknown") {
      fail(s, "name-unknown", m[0]);
      continue;
    }
    const from = Number(m[1]);
    const to = Number(m[2]);
    if (!teams) {
      fail(s, "rank-pos", m[0]);
      continue;
    }
    for (const t of teams) {
      const rows = rowsOf(s, t);
      if (rows.length === 0) fail(s, "rank-pos", m[0]);
      else if (rows.every((r) => r.prev === undefined))
        fail(s, "rank-move-no-prev", m[0]);
      else if (!rows.some((r) => r.prev === from && r.pos === to))
        fail(s, "rank-move", m[0]);
    }
  }

  // 'A와 B가 … n위와 m위다' — 묶음 순서대로 짝짓는다
  for (const m of seg.matchAll(/(\d{1,2})위(?:와|과)\s?(\d{1,2})위/gu)) {
    const pos = c.start + m.index;
    const end = pos + m[0].length;
    if (isConsumed(s, pos, end)) continue;
    consume(s, pos, end);
    const teams = rankTeams(s, ci, pos, end);
    if (teams === "unknown") {
      fail(s, "name-unknown", m[0]);
      continue;
    }
    const want = [Number(m[1]), Number(m[2])];
    const ok =
      !!teams &&
      teams.length === 2 &&
      teams.every((t, i) => rowsOf(s, t).some((r) => r.pos === want[i]));
    if (!ok) fail(s, "rank-pos", m[0]);
  }

  // 도착 순위('2위로'·'선두로'·'선두 자리를') · 변동 폭('한 계단') — 순위가 바뀌었다는 서술이라 prev가 있어야 하고 바뀌었어야
  // 한다(D40 ③ — M1-23 리뷰 차단 6: '2위로 한 계단 밀렸다'·'선두를 되찾았다'·'2위로 끌어내렸다')
  for (const [re, steps] of [
    [RANK_ARRIVAL, false],
    [RANK_STEPS, true],
  ] as const) {
    for (const m of seg.matchAll(new RegExp(re.source, "gu"))) {
      const pos = c.start + m.index;
      const teams = rankTeams(s, ci, pos, pos + m[0].length);
      if (teams === "unknown") {
        fail(s, "name-unknown", m[0]);
        continue;
      }
      if (steps) consume(s, pos, pos + m[0].length);
      const rowsFor = teams ? teams.map((t) => rowsOf(s, t)) : [allRows];
      for (const rows of rowsFor) {
        const withPrev = rows.filter((r) => r.prev !== undefined);
        if (withPrev.length === 0) {
          fail(s, "rank-move-no-prev", m[0]);
          continue;
        }
        const n = steps ? Number(m[1]) : null;
        const ok = withPrev.some((r) =>
          n === null ? r.prev !== r.pos : Math.abs(r.prev! - r.pos) === n,
        );
        if (!ok) fail(s, "rank-move", m[0]);
      }
    }
  }

  // 순위 'n위'·'공동 n위'·'선두'·'상위 n위'
  const rankRe =
    /(공동\s?)?(?:(상위\s?)?(\d{1,2})위(?!권|에서)|선두(?!권|\s?경쟁|\s?다툼))/gu;
  for (const m of seg.matchAll(rankRe)) {
    const pos = c.start + m.index;
    const end = pos + m[0].length;
    if (isConsumed(s, pos, end)) continue;
    consume(s, pos, end);
    const tied = !!m[1];
    const top = !!m[2];
    const n = m[3] !== undefined ? Number(m[3]) : 1;
    if (tables.length === 0) {
      fail(s, "rank-pos", m[0]);
      continue;
    }
    const teams = rankTeams(s, ci, pos, end);
    if (teams === "unknown") {
      fail(s, "name-unknown", m[0]);
      continue;
    }
    if (!teams) {
      if (!allRows.some((r) => (top ? r.pos <= n : r.pos === n)))
        fail(s, "rank-pos", m[0]);
      continue;
    }
    for (const t of teams) {
      const rows = rowsOf(s, t);
      if (rows.length === 0) {
        fail(s, "rank-pos", m[0]);
        continue;
      }
      if (top) {
        if (!rows.some((r) => r.pos <= n)) fail(s, "rank-pos", m[0]);
        continue;
      }
      if (!rows.some((r) => r.pos === n)) {
        fail(s, tied ? "rank-tie" : "rank-pos", m[0]);
        continue;
      }
      if (tied) {
        const table = tables.find((x) =>
          x.rows.some((r) => r.team === t && r.pos === n),
        );
        if (!table || table.rows.filter((r) => r.pos === n).length < 2)
          fail(s, "rank-tie", m[0]);
      }
    }
  }

  // 순위 변동 동사(D40 ③) — 순위 맥락이 있는 절만('1위에 올라 있다'는 상태)
  if (RANK_CONTEXT.test(seg)) {
    const segNoState = seg.replace(new RegExp(RANK_STATE.source, "gu"), (x) =>
      "\u25a1".repeat(x.length),
    );
    for (const [re, dir] of [
      [MOVE_UP, "up"],
      [MOVE_DOWN, "down"],
      [MOVE_SAME, "same"],
    ] as const) {
      for (const m of segNoState.matchAll(new RegExp(re.source, "gu"))) {
        const pos = c.start + m.index;
        const teams = rankTeams(s, ci, pos, pos + m[0].length);
        if (teams === "unknown") {
          fail(s, "name-unknown", m[0]);
          continue;
        }
        const rowsFor = teams ? teams.map((t) => rowsOf(s, t)) : [allRows];
        for (const rows of rowsFor) {
          const withPrev = rows.filter((r) => r.prev !== undefined);
          if (withPrev.length === 0) {
            fail(s, "rank-move-no-prev", m[0]);
            continue;
          }
          if (!teams) continue;
          const ok = withPrev.some((r) =>
            dir === "up"
              ? r.prev! > r.pos
              : dir === "down"
                ? r.prev! < r.pos
                : r.prev === r.pos,
          );
          if (!ok) fail(s, "rank-move", m[0]);
        }
      }
    }
  } else {
    // 순위 맥락 없는 '올랐다' + 라운드 낱말 = 다음 라운드 진출(합산은 입력에 없다)
    if (MOVE_UP.test(seg) && ROUND_WORDS.some((w) => w.re.test(seg)))
      fail(s, "history-unsupported", "진출");
    MOVE_UP.lastIndex = 0;
  }

  // 승점 — '승점 n'·'n점'·차이 'n점 앞섰다'·'승점 n 차'
  const diffRe =
    /(?:승점\s?)?(\d{1,3})\s?점?\s?(?:차(?!례)|앞|뒤)|승점\s?차(?:는|가|로)?\s?(\d{1,3})/gu;
  for (const m of seg.matchAll(diffRe)) {
    const pos = c.start + m.index;
    const end = pos + m[0].length;
    if (isConsumed(s, pos, end)) continue;
    if (!/점|승점/u.test(m[0])) continue;
    consume(s, pos, end);
    const n = Number(m[1] ?? m[2]);
    // 방향(M1-23 리뷰): 'X는 Y보다 n점 앞섰다' ⇒ X − Y = n · '뒤졌다' ⇒ Y − X = n · '차' ⇒ |X − Y| = n
    const dir = /앞$/u.test(m[0])
      ? "ahead"
      : /뒤$/u.test(m[0])
        ? "behind"
        : "gap";
    const subj =
      c.subjects.filter((g) => g.members && g.pos < pos).at(-1) ??
      subjectFor(s, ci, pos);
    const subjTeam = subj?.members ? (groupTeams(s, subj) ?? [])[0] : undefined;
    const others = c.mentions
      .filter((x) => x.kind === "team" && x.key && x.key !== subjTeam)
      .map((x) => x.key!);
    const ptsOf = (t: string) => rowsOf(s, t).map((r) => r.pts);
    let ok = false;
    if (subjTeam && others.length > 0) {
      for (const cmp of others)
        for (const a of ptsOf(subjTeam))
          for (const b of ptsOf(cmp)) {
            const d = a - b;
            if (
              dir === "ahead"
                ? d === n
                : dir === "behind"
                  ? -d === n
                  : Math.abs(d) === n
            )
              ok = true;
          }
    } else if (dir === "gap") {
      for (const a of allRows)
        for (const b of allRows) if (a.pts - b.pts === n) ok = true;
    }
    if (!ok) fail(s, "points", m[0]);
  }
  for (const m of seg.matchAll(
    /승점\s?(\d{1,3})(?:\s?점)?|(?<![\d승]\s?)(\d{1,3})\s?점(?!유|수|차)/gu,
  )) {
    const pos = c.start + m.index;
    const end = pos + m[0].length;
    if (isConsumed(s, pos, end)) continue;
    consume(s, pos, end);
    const n = Number(m[1] ?? m[2]);
    if (tables.length === 0) {
      fail(s, "points", m[0]);
      continue;
    }
    const teams = rankTeams(s, ci, pos, end);
    if (teams === "unknown") {
      fail(s, "name-unknown", m[0]);
      continue;
    }
    const ok = teams
      ? teams.every((t) => rowsOf(s, t).some((r) => r.pts === n))
      : allRows.some((r) => r.pts === n);
    if (!ok) fail(s, "points", m[0]);
  }
  // 대회 이름 — 그 절의 팀 순위는 언급한 대회의 순위표에 있어야 한다('Arsenal은 LaLiga 2위다' — 근거에 두 대회 순위표가 있을 때)
  const compKeys = c.mentions
    .filter((x) => x.kind === "comp" && x.key)
    .map((x) => x.key!);
  if (compKeys.length > 0 && tables.length > 0 && RANK_CONTEXT.test(seg)) {
    for (const t of c.mentions.filter((x) => x.kind === "team" && x.key)) {
      const inTables = tables.filter((tb) =>
        tb.rows.some((r) => r.team === t.key),
      );
      if (inTables.length === 0) continue;
      if (!inTables.some((tb) => compKeys.includes(tb.comp)))
        fail(s, "comp-mismatch", t.text);
    }
  }

  // 경기 수 'n경기'
  for (const m of seg.matchAll(/(\d{1,2})\s?경기(?!\s?(?:만에|연속|째))/gu)) {
    const pos = c.start + m.index;
    const end = pos + m[0].length;
    if (isConsumed(s, pos, end)) continue;
    consume(s, pos, end);
    const n = Number(m[1]);
    const teams = rankTeams(s, ci, pos, end);
    const ok =
      teams && teams !== "unknown"
        ? teams.every((t) => rowsOf(s, t).some((r) => r.played === n))
        : allRows.some((r) => r.played === n);
    if (!ok) fail(s, "played", m[0]);
  }
}

// ─── 남은 숫자 ────────────────────────────────────────────────────────────

/**
 * 종류를 알아보지 못한 숫자는 강등한다(M1-23 리뷰 차단 5 — '슈팅 7개'·'관중 9명'·'시즌 2호골'). 점수·분·순위·승점·득실차·경기 수·
 * 골/도움 수·라운드는 앞 규칙이 종류별로 대조하고 가져갔다. D40 ② 파생 숫자는 전용 규칙만 허용한다 — 승점 차('3점 앞섰다' = 그 두 팀
 * 승점의 차)·점수 차('3골 차')·두 팀 골 합('7골을 주고받은'). 근거 숫자 아무 둘의 합·차를 허용하면 작은 정수가 거의 다 통과한다.
 */
function checkLeftoverNumbers(s: LineState): void {
  for (const m of s.masked.matchAll(/\d+/gu)) {
    if (isConsumed(s, m.index, m.index + m[0].length)) continue;
    fail(s, "number-unsupported", m[0]);
  }
}

// ─── 공개 함수 ────────────────────────────────────────────────────────────

function checkLine(
  model: CheckModel,
  n: number,
  line: BriefOutputLine,
  substituted: string,
): BriefLineCheck {
  const text = line.t.normalize("NFC");
  const mentions = findMentions(text, model);
  const masked = normalizeNumerals(maskText(text, mentions));
  const clauses = buildClauses(text, masked, mentions);
  const s: LineState = {
    model,
    text,
    masked,
    refs: line.r,
    mentions,
    clauses,
    reasons: [],
    warnings: [],
    consumed: [],
    refMatches: line.r.flatMap((r) => {
      const m = model.matches.get(r);
      return m ? [m] : [];
    }),
    refStandings: line.r.flatMap((r) => {
      const t = model.standings.get(r);
      return t ? [t] : [];
    }),
    refKorean: line.r.flatMap((r) => {
      const k = model.korean.get(r);
      return k ? [k] : [];
    }),
  };
  lineRefs(s);
  lineSentence(s);
  if (briefLinesOverLimit([substituted]).length > 0)
    fail(s, "over-limit", String(substituted.length));
  lineScripts(s);
  lineNames(s);
  clauses.forEach((_, ci) => {
    const result = checkResults(s, ci);
    checkGainedPoints(s, ci, result);
    checkStandings(s, ci);
    checkScores(s, ci, result);
    checkMatchWords(s, ci, result);
    checkGoals(s, ci);
    checkGoalClaims(s, ci, result);
    checkMinutes(s, ci);
    checkAppearance(s, ci);
  });
  checkLeftoverNumbers(s);
  // 한 줄에 두 경기 이상(지시문 '한 줄에 한 경기') — 사실이 맞으면 경고만(관찰 주간 지표)
  const matchesNamed = new Set(
    mentions.flatMap((m) =>
      m.kind === "team" && m.key
        ? s.refMatches
            .filter((x) => x.home === m.key || x.away === m.key)
            .map((x) => x.id)
        : [],
    ),
  );
  if (matchesNamed.size >= 2)
    warn(s, "style-multi-match", String(matchesNamed.size));
  return {
    n,
    ok: s.reasons.length === 0,
    reasons: s.reasons,
    warnings: s.warnings,
  };
}

function checkWhole(
  model: CheckModel,
  lines: readonly BriefOutputLine[],
): BriefWholeCheck {
  let hangul = 0;
  let latin = 0;
  let han = false;
  for (const line of lines) {
    const text = line.t.normalize("NFC");
    const masked = maskText(
      text,
      findMentions(text, model).filter((m) => m.script === "latin"),
    );
    hangul += masked.match(/[가-힣]/gu)?.length ?? 0;
    latin += masked.match(/\p{Script=Latin}/gu)?.length ?? 0;
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text))
      han = true;
  }
  const reasons: BriefWholeReason[] = [];
  if (hangul < latin) reasons.push("korean-ratio");
  if (han) reasons.push("han");
  return { ok: reasons.length === 0, reasons, hangul, latin };
}

/**
 * 스키마를 통과한 줄(parseBriefOutput — 앞 5줄) → 출력 전체·줄별 판정(순수 함수). `input`은 LLM에 보낸 입력 그대로.
 */
export function checkBriefOutput(
  lines: readonly BriefOutputLine[],
  input: BriefCheckInput,
  ctx: BriefCheckContext,
): BriefCheckResult {
  const model = buildModel(input, ctx);
  const substitutions = substituteBriefLines(
    lines.map((l) => l.t),
    input,
    ctx,
  );
  return {
    whole: checkWhole(model, lines),
    lines: lines.map((line, i) =>
      checkLine(model, i + 1, line, substitutions[i]!.text),
    ),
    substitutions,
  };
}

/** 판정에 필요한 LLM 결과 모양(llm.ts `LlmResult`의 부분) */
export type BriefResponse =
  { ok: true; text: string } | { ok: false; errorType: string };

export interface JudgeOptions {
  /**
   * 이번이 마지막 시도인가(FR-29 재시도를 이미 썼다 — `BRIEF_MAX_ATTEMPTS`). true면 'retry'가 'downgrade-all'이 된다.
   * 기본 false(첫 시도).
   */
  finalAttempt?: boolean;
}

/** 시도 번호(1부터) → 마지막 시도인가 */
export function isFinalBriefAttempt(attempt: number): boolean {
  return attempt >= BRIEF_MAX_ATTEMPTS;
}

/**
 * LLM 응답 1건 → FR-29 판정(순수 함수 — M1-45가 재시도·강등에 그대로 쓴다):
 *   transport 실패 — max_tokens는 출력 전체 실패(재시도, D40 ①), refusal은 바로 템플릿(D40 ①), 그 밖(errored·연결 오류)은
 *   llm.ts 정책 재시도를 이미 거쳤으므로 템플릿(FR-26)
 *   스키마 실패(json·schema) → 재시도 · 출력 전체 코드 검증 실패 → 재시도 · 줄 단위 실패 → 그 줄만 강등 · 모두 통과 → ok
 */
export function judgeBriefResponse(
  response: BriefResponse,
  input: BriefCheckInput,
  ctx: BriefCheckContext,
  options: JudgeOptions = {},
): BriefJudgement {
  const retry = (): BriefVerdict =>
    options.finalAttempt ? { verdict: "downgrade-all" } : { verdict: "retry" };
  const done = (
    verdict: BriefVerdict,
    stage: BriefCheckStage,
    reason: string | null,
    check: BriefCheckResult | null = null,
    parse: BriefJudgement["parse"] = null,
  ): BriefJudgement => ({
    verdict,
    label: briefVerdictLabel(verdict),
    stage,
    reason,
    check,
    parse,
  });
  if (!response.ok) {
    const v: BriefVerdict =
      response.errorType === "max_tokens"
        ? retry()
        : { verdict: "downgrade-all" };
    return done(v, "transport", response.errorType);
  }
  const parsed = parseBriefOutput(response.text);
  if (!parsed.ok) return done(retry(), "zod", parsed.reason);
  const parse = { fenced: parsed.fenced, droppedLines: parsed.droppedLines };
  const check = checkBriefOutput(parsed.lines, input, ctx);
  if (!check.whole.ok)
    return done(retry(), "whole", check.whole.reasons.join(","), check, parse);
  const bad = check.lines.filter((l) => !l.ok).map((l) => l.n);
  if (bad.length > 0)
    return done(
      { verdict: "downgrade-line", lines: bad },
      "line",
      null,
      check,
      parse,
    );
  return done({ verdict: "ok" }, "none", null, check, parse);
}

/** 로그용 요약 — 줄 번호 → 사유 코드(경고 포함), 이름·숫자 근거만(문장 원문 없음) */
export function briefCheckLogFields(j: BriefJudgement): {
  verdict: string;
  stage: BriefCheckStage;
  reason: string | null;
  lineReasons: Record<string, string[]>;
  lineWarnings: Record<string, string[]>;
} {
  const lineReasons: Record<string, string[]> = {};
  const lineWarnings: Record<string, string[]> = {};
  for (const l of j.check?.lines ?? []) {
    if (l.reasons.length > 0)
      lineReasons[String(l.n)] = [...new Set(l.reasons.map((r) => r.code))];
    if (l.warnings.length > 0)
      lineWarnings[String(l.n)] = [...new Set(l.warnings.map((w) => w.code))];
  }
  return {
    verdict: j.label,
    stage: j.stage,
    reason: j.reason,
    lineReasons,
    lineWarnings,
  };
}

/** 사람용 한 줄 판정('통과' · '강등 대상 — goal-count(Christopher Nkunku 2골)') */
export function describeLineCheck(l: BriefLineCheck): string {
  const warn =
    l.warnings.length > 0
      ? ` · 경고 ${l.warnings.map((w) => w.code + (w.detail ? `(${w.detail})` : "")).join(", ")}`
      : "";
  if (l.ok) return `통과${warn}`;
  return `강등 대상 — ${l.reasons
    .map((r) => r.code + (r.detail ? `(${r.detail})` : ""))
    .join(", ")}${warn}`;
}
