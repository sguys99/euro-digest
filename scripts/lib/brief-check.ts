/**
 * 브리핑 자동 사실성 검사기 (M1-23 → **닫힌 문법 재설계** — PRD FR-22·FR-29 §9.4, D24·D28·D40·D50·D53·D55). LLM이 쓴 "오늘의 5줄"을
 * **보낸 정형 입력**과 코드로 대조한다. 비용 0·결정적 순수 함수 — I/O 없음(사전·대회 설정은 호출부가 읽어 넘긴다).
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
 *   원칙(사용자 결정 2026-10-17 — D50): **허용 문형만 통과**. 한 줄 = 허용 절 1~2개(brief-grammar.ts — 문형 목록 `PATTERNS`·
 *   `MODIFIERS` 한 곳에서 지시문 v0.4의 [문형] 블록과 문법을 함께 만든다, D53 ② — 양방향 일치는 tests/brief-grammar.test.ts).
 *   입력에 없는 선택 키(한국 선수 블록 `korean`·전일 순위 `prev`)의 문형은 꺼진다(D55 ① — `briefInputKeys`).
 *   문형 밖의 낱말·술어·수식이 하나라도 있으면 `grammar-unknown`(근거 = 처음 읽지 못한 낱말)으로 강등한다 — 이전 판(틀린 표현
 *   목록)은 자유 문장의 새 표현('패배를 안겼다'·'웃었다'·'수비를 지켰다' …)이 계속 빠져나갔다(리뷰 1·2회차 약 270문장).
 *   순서: ① 문장 형식·문자·이름 사전 검사 ② 이름을 `⟨i⟩`로 바꾼 뼈대를 문법으로 분석 ③ 분석된 절마다 슬롯 값을 입력과 대조 —
 *   분석이 여럿이면 입력과 맞는 분석이 하나라도 있으면 통과, 없으면 사유가 가장 적은 분석의 사유를 남긴다. 한 절 안에서 이름이
 *   여러 경기·선수에 맞으면 목적어·상대로 고정되는 후보만 고르고, 고정되지 않으면 후보 모두가 맞아야 통과한다(3회차 리뷰).
 *   두 절은 같은 경기(순위끼리는 같은 순위표)여야 한다 — 다르면 `clause-mismatch`(경기)·`rank-table`(순위표).
 *   ① 사전 검사
 *     근거   r의 id가 입력에 있어야 한다
 *     문장   한 줄 한 문장('다.'로 끝남, 문장 안 마침표·느낌표·물음표 없음), 줄바꿈 없음, 치환 뒤 80자 이하(D40 ⑤ — brief.ts
 *            `briefLinesOverLimit`과 같은 판정)
 *     문자   한자·가나·키릴 등 다른 문자·그림 문자 없음, 이름 밖 라틴 낱말은 'PK'만
 *     이름   영문 = 허용 목록(names.ts `briefNameAllowlist(보낸 입력)` + 한국 선수 블록), 한글 = 사전(names.ko `ko`)·대회(nameKo·shortKo)
 *            공식 표기이고 대상이 입력에 있을 때만(D40 ④ — 부분·띄어쓰기 변형·별칭·다른 음역은 강등), 언급한 이름은 그 줄 근거(r)
 *            항목에 있어야 한다. 사전 밖 한글 낱말(모델 음역)은 이름으로 읽히지 않아 ②에서 문법 밖이 된다
 *   ③ 슬롯 대조(절 종류 — brief-grammar.ts 머리 주석)
 *     결과   주어가 실제 승자·패자(승부차기 경기의 승자는 승부차기 결과 — 그 경기는 '승부차기' 수식이 있어야 하고 '비겼다' 금지),
 *            목적어·짝은 그 경기 상대, 승패 문장의 점수는 주어 팀 먼저만(D55 ② — D30 보강, 홈-원정 순서는 score-order), 'A와 B의
 *            경기는'은 앞 팀 먼저, 승부차기 꼴의 승부차기 점수는 홈-원정 또는 승자 먼저(D30 그대로), 90분에 이미 앞선 연장
 *            승리·90분 점수가 없는 연장 승리는 이긴 것처럼 쓰지 않음(M1-20 — '경기는 연장까지 h-a로 끝났다'), '완파' = 3골 차 이상,
 *            '역전승' = ht 또는 득점 순서로 이긴 팀이 뒤진 적, '연장까지'·'연장 끝에' = 입력 aet, 수식(대회·홈/원정·{상대} 원정·
 *            라운드 — stage 우선 표기·연장 끝에·승부차기 끝에·{선수}의 결승골로(연장에서 갈리지 않은 연장 경기는 결승골 없음)·
 *            해트트릭(정확히 3골)·n골을 앞세워(2골 이상)·n골을 주고받은 끝에(두 팀 모두 득점)·동점골로)는 정의대로. 결과 뒤의 순위
 *            꼬리는 그 팀이 있는 근거 순위표가 있을 때만('승점 3을 챙겼다' 같은 경기 승점 꼴은 D53 ②에서 뺐다 — 녹아웃 경기에는
 *            승점이 없다, 3회차 차단 1)
 *     득점   그 선수의 근거 경기 골(자책골 득점자는 득점 꼴에 쓰지 않음)·분(0으로 시작하는 분 금지 — 분 목록 '{분}·{분}에'는 D53 ②에서 뺐다)·PK·도움 선수
 *            (도움 선수 ≠ 득점자), 선제골·결승골(이긴 팀의 (진 팀 점수+1)번째 골)·동점골(비긴 경기의 마지막 골이 동점을 만든 골 — 좁은
 *            정의)·만회골(넣은 뒤에도 진 팀이 뒤진 골), 골 수(1 이상)·멀티골(2 이상)·해트트릭(정확히 3), '{팀}의 {선수}' 소속
 *     한국 선수 블록 기록(선발·교체 투입 분·출전 분·교체 아웃·결장)과 일치(입력에 korean이 있을 때만 켜지는 문형 — D55 ①), '득점은 없었다' = 골 0이고 출전 문형 뒤에만
 *            ('벤치를 지켰다'는 D53 ②에서 뺐다 — 결장 꼴로 쓴다)
 *     순위   그 팀의 근거 순위표 행(순위·승점·공동 — 같은 순위 2팀 이상이면 '공동' 필수·아니면 금지, 목록·승점 차 꼴도 같다),
 *            변동·유지 꼴은 전일 순위(prev)가 있을 때만(D40 ③ — 입력에 prev가 하나도 없으면 문형이 꺼진다, D55 ①), 승점 차(D40 ②)는 1 이상·방향까지, 대회 이름은 그 순위표의 대회,
 *            한 문장의 팀은 같은 순위표
 *     분     '전반'·'후반'·'연장'은 분과 맞아야 한다(전반 ≤ 45 · 후반 46~90 · 연장 ≥ 91 — 바꿔 계산한 분은 숫자가 달라 걸린다)
 *
 * ── 경고 (강등 아님 — 관찰 주간 M1-43 지표) ─────────────────────────────────
 *   마침표 없는 끝('…다' — 저장은 그대로) · 한 줄 두 경기(문법 안 두 절이 서로 다른 경기 — 3회차부터 그 줄은 `clause-mismatch`로
 *   강등되고 경고는 지표로 함께 남는다).
 *
 * 남은 한계(보고 — M1-43 관찰): 문법 안의 문장도 입력 대조가 근거 항목(r) 범위로만 이뤄진다(r에 없는 경기를 쓰면 이름 검사가 막는다) ·
 * 한국 선수 블록(`korean`)은 M0 입력 형식 기준(M3-03이 확정) · 허용 문형은 brief-grammar.ts 목록에서만 늘리고 지시문 [문형]을
 * `renderBriefPatterns()` 출력으로 바꾼다(테스트가 둘의 일치를 강제).
 */
import type { CompetitionConfig, CompId } from "@/lib/schema";

import {
  BRIEF_MAX_ATTEMPTS,
  briefLinesOverLimit,
  parseBriefOutput,
  type BriefOutputLine,
} from "./brief";
import {
  KO_UNOFFICIAL_FORMS,
  LATIN_ALLOWED_TOKENS,
  NAME_SUFFIX,
} from "./brief-check-lexicon";
import {
  buildSkeleton,
  parseBriefLine,
  skeletonWordAt,
  type Bag,
  type BriefInputKey,
  type LineParse,
  type ParsedClause,
} from "./brief-grammar";
import type {
  BriefInput,
  BriefInputMatch,
  BriefInputStandingRow,
  BriefInputStandings,
} from "./brief-input";
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
 * 줄 강등 사유 코드(로그·M1-43 검수·M1-24 회귀 비교용). 닫힌 문법 재설계(D50)로 `grammar-unknown`이 생기고, 거부 목록 판의
 * 코드(name-unknown·result-verb-unknown·eval-unsupported·history-unsupported·count-unsupported·number-unsupported·goal-diff·
 * played)는 모두 `grammar-unknown`이 대신한다.
 */
export type BriefLineReasonCode =
  | "ref-unknown"
  /** 입력에는 있지만 모델이 보지 못한 근거 id(D51 — LLM 요청 본문에서 잘린 경기·순위, JudgeOptions.hiddenRefs) */
  | "ref-hidden"
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
  | "grammar-unknown"
  /** 두 절이 서로 다른 경기·순위표(리뷰 3회차 차단 5) — 절2는 절1과 같은 경기, 순위 절이면 절1 주어 팀의 순위 */
  | "clause-mismatch"
  /** 한 절·한 나열의 팀이 서로 다른 순위표(리뷰 3회차 차단 3) */
  | "rank-table"
  | "subject-unknown"
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
  | "goal-count"
  | "assist-count"
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
  | "points";

/** 경고 코드 — 강등하지 않는다(머리 주석 "경고") */
export type BriefLineWarnCode = "sentence-no-period" | "style-multi-match";

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
  /** 고른 분석의 문형(절 종류 — 'win+korean') · 문법 밖이면 null */
  grammar: string | null;
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
  /** 모델이 보지 못한 근거 id(D51) — 이 id를 단 줄은 강등 */
  hidden: ReadonlySet<string>;
  /** 입력에 있는 선택 키(D55 ① — 한국 선수 블록·전일 순위). 없는 키의 문형은 문법 밖 */
  grammarKeys: ReadonlySet<BriefInputKey>;
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
  hidden: ReadonlySet<string> = new Set(),
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
    hidden,
    grammarKeys: briefInputKeys(input),
  };
}

/**
 * 입력에 있는 선택 키(D55 ①) — `korean`: 한국 선수 블록이 1건 이상 · `prev`: 전일 순위가 있는 순위 행이 1개 이상. 지금 빌더
 * (M1-19) 입력에는 둘 다 없다(M3-03·M2-03이 더한다) — 그 키를 쓰는 문형(출전·결장·'득점은 없었다'·순위 변동·유지)은 켜지지 않는다.
 */
export function briefInputKeys(input: BriefCheckInput): Set<BriefInputKey> {
  const keys = new Set<BriefInputKey>();
  if ((input.korean?.length ?? 0) > 0) keys.add("korean");
  if (input.standings.some((t) => t.rows.some((r) => r.prev !== undefined)))
    keys.add("prev");
  return keys;
}

// ─── 이름 찾기 ────────────────────────────────────────────────────────────

interface Mention {
  start: number;
  end: number;
  text: string;
  key: string | null;
  kind: Kind | null;
  script: "latin" | "hangul";
  official: boolean;
}

const MASK_CHAR = "\uE000";

function findMentions(text: string, model: CheckModel): Mention[] {
  const out: Mention[] = [];
  const taken = (s: number, e: number) =>
    out.some((m) => s < m.end && e > m.start);
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
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
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

// ─── 줄 상태 ──────────────────────────────────────────────────────────────

interface LineState {
  model: CheckModel;
  text: string;
  masked: string;
  refs: readonly string[];
  mentions: Mention[];
  reasons: BriefLineIssue<BriefLineReasonCode>[];
  warnings: BriefLineIssue<BriefLineWarnCode>[];
  refMatches: MatchModel[];
  refStandings: StandingsModel[];
  refKorean: KoreanModel[];
}

type Issues = BriefLineIssue<BriefLineReasonCode>[];

function push(list: Issues, code: BriefLineReasonCode, detail?: string): void {
  if (list.some((r) => r.code === code && r.detail === detail)) return;
  list.push(detail === undefined ? { code } : { code, detail });
}

function fail(s: LineState, code: BriefLineReasonCode, detail?: string): void {
  push(s.reasons, code, detail);
}

function warn(s: LineState, code: BriefLineWarnCode, detail?: string): void {
  if (s.warnings.some((r) => r.code === code)) return;
  s.warnings.push(detail === undefined ? { code } : { code, detail });
}

// ─── ① 사전 검사 ──────────────────────────────────────────────────────────

function lineRefs(s: LineState): void {
  for (const r of s.refs) {
    if (!s.model.ids.has(r)) fail(s, "ref-unknown", r);
    // 전체 입력에는 있어도 요청 본문에서 잘린 항목이면 모델이 볼 수 없던 사실이다(D51)
    else if (s.model.hidden.has(r)) fail(s, "ref-hidden", r);
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

// ─── ③ 슬롯 대조 — 공통 ───────────────────────────────────────────────────

/** 한 분석의 대조 환경 */
interface Env {
  s: LineState;
  issues: Issues;
}

function bad(env: Env, code: BriefLineReasonCode, detail?: string): void {
  push(env.issues, code, detail);
}

/**
 * 후보 여럿(같은 팀의 하루 두 경기·같은 이름의 두 선수·한 선수의 두 블록 — 리뷰 3회차 권장 6) 중 하나를 고른다. 줄이 어느 후보인지
 * 가리는 슬롯(상대·소속·{상대}전 …)을 썼으면(`pinned`) 입력과 가장 잘 맞는 후보, 아니면 **모든 후보에서 참이어야** 한다(사유가 가장
 * 많은 후보 — 독자는 어느 경기인지 알 수 없다, 안전한 쪽). 후보가 없으면 null.
 */
function bestOf<T, R>(
  env: Env,
  candidates: readonly T[],
  run: (sub: Env, c: T) => R,
  pinned = true,
): R | null {
  let best: { issues: Issues; r: R } | null = null;
  for (const c of candidates) {
    const sub: Env = { s: env.s, issues: [] };
    const r = run(sub, c);
    const better = pinned
      ? !best || sub.issues.length < best.issues.length
      : !best || sub.issues.length > best.issues.length;
    if (better) best = { issues: sub.issues, r };
    if (pinned && sub.issues.length === 0) break;
  }
  if (best) for (const i of best.issues) push(env.issues, i.code, i.detail);
  return best?.r ?? null;
}

function mentionAt(env: Env, bag: Bag, key: string): Mention | null {
  const i = bag[key];
  return typeof i === "number" ? (env.s.mentions[i] ?? null) : null;
}

function keyAt(env: Env, bag: Bag, key: string): string | null {
  return mentionAt(env, bag, key)?.key ?? null;
}

function textAt(env: Env, bag: Bag, key: string): string {
  return mentionAt(env, bag, key)?.text ?? key;
}

function pairAt(bag: Bag, key: string): [number, number] | null {
  const v = bag[key];
  return Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number"
    ? [v[0], v[1]]
    : null;
}

function numAt(bag: Bag, key: string): number | null {
  const v = bag[key];
  return typeof v === "number" ? v : null;
}

function strAt(bag: Bag, key: string): string | null {
  const v = bag[key];
  return typeof v === "string" ? v : null;
}

/** 이름 묶음(순번 목록) → key 목록 */
function groupKeys(env: Env, bag: Bag, key: string): string[] | null {
  const v = bag[key];
  if (!Array.isArray(v)) return null;
  const keys: string[] = [];
  for (const i of v) {
    const k = typeof i === "number" ? env.s.mentions[i]?.key : null;
    if (!k) return null;
    keys.push(k);
  }
  return keys;
}

/** 근거 경기에서 그 팀의 경기·쪽(여럿일 수 있다 — 하루 두 대회) */
function matchesOfTeam(
  s: LineState,
  team: string,
): Array<{ match: MatchModel; side: Side }> {
  const out: Array<{ match: MatchModel; side: Side }> = [];
  for (const match of s.refMatches) {
    if (match.home === team) out.push({ match, side: "home" });
    else if (match.away === team) out.push({ match, side: "away" });
  }
  return out;
}

/** 두 팀이 맞붙은 근거 경기 — side = 앞 팀(a)의 쪽 */
function matchOfPair(
  s: LineState,
  a: string,
  b: string,
): { match: MatchModel; side: Side } | null {
  for (const match of s.refMatches) {
    if (match.home === a && match.away === b) return { match, side: "home" };
    if (match.away === a && match.home === b) return { match, side: "away" };
  }
  return null;
}

/** 주어 팀의 경기 — 상대(목적어·{상대} 원정)가 있으면 그 맞대결, 없으면 주어 팀이 뛴 근거 경기 후보 */
function subjectMatches(
  s: LineState,
  team: string,
  opponents: ReadonlyArray<string | null>,
): Array<{ match: MatchModel; side: Side }> {
  for (const o of opponents) {
    if (o === null) continue;
    const pair = matchOfPair(s, team, o);
    if (pair) return [pair];
  }
  return matchesOfTeam(s, team);
}

function teamOn(match: MatchModel, side: Side): string {
  return side === "home" ? match.home : match.away;
}

function pairEq(a: Pair, h: number, x: number): boolean {
  return a.home === h && a.away === x;
}

/**
 * 'a-b'가 그 점수(홈-원정)와 맞는가 — 홈-원정 순서 또는 주어 쪽 먼저(D30). 승부차기 꼴의 승부차기 점수(pens·endPens)만 쓴다 —
 * 승패 문장은 주어 팀 먼저만(`orientedMatches`, D55 ②)
 */
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

/** 'A와 B의 경기는 a-b'의 앞 팀·승패 문장의 주어 팀(D55 ②) — first 쪽 점수 먼저만 인정 */
function orientedMatches(
  pair: Pair,
  a: number,
  b: number,
  first: Side,
): "ok" | "order" | "mismatch" {
  if (pair[first] === a && pair[other(first)] === b) return "ok";
  if (pair[first] === b && pair[other(first)] === a) return "order";
  return "mismatch";
}

function scoreIssue(
  env: Env,
  r: "ok" | "order" | "mismatch",
  score: [number, number],
): void {
  if (r === "order") bad(env, "score-order", `${score[0]}-${score[1]}`);
  if (r === "mismatch") bad(env, "score-mismatch", `${score[0]}-${score[1]}`);
}

/** 연장에서 승부가 났다(90분 점수가 있고 이긴 팀이 90분에 앞서지 않음) */
function decidedInEt(f: MatchFacts): boolean {
  return (
    f.winner !== null &&
    f.regular !== null &&
    f.regular[f.winner] <= f.regular[other(f.winner)]
  );
}

/**
 * 결승골 — 이긴 팀의 (진 팀 점수 + 1)번째 골. 승부차기 경기와 이긴 것처럼 쓰지 않는 연장 경기(90분에 이미 앞섰거나 90분 점수가
 * 없음 — 두 경기 합산 연장일 수 있다, M1-20)에는 결승골이 없다(리뷰 3회차 중요 2)
 */
function decisiveGoal(match: MatchModel): GoalRow | null {
  const f = match.facts;
  if (!f || f.pens || f.winner === null || !match.goals) return null;
  if (f.aet && !decidedInEt(f)) return null;
  const winner = f.winner;
  return (
    match.goals.filter((g) => g.side === winner)[f.ft[other(winner)]] ?? null
  );
}

/** 동점골 — 비긴 경기(0-0 아님·승부차기 없음)의 마지막 골(좁은 정의 유지 — 오케스트레이터 결정 2026-10-17) */
function equaliserGoal(match: MatchModel): GoalRow | null {
  const f = match.facts;
  if (!f || f.pens || f.ft.home !== f.ft.away || f.ft.home === 0) return null;
  return match.goals?.at(-1) ?? null;
}

/** 만회골 — 진 팀이 뒤진 채 넣었고 넣은 뒤에도 뒤진 골(동점을 만든 골은 아니다 — 리뷰 3회차 권장 3) */
function consolationGoals(match: MatchModel): GoalRow[] {
  const f = match.facts;
  if (!f || f.winner === null || f.pens || !match.goals) return [];
  const winner = f.winner;
  const loser = other(winner);
  const out: GoalRow[] = [];
  const run: Pair = { home: 0, away: 0 };
  for (const g of match.goals) {
    if (g.side === loser && !g.ownGoal && run[loser] + 1 < run[winner])
      out.push(g);
    run[g.side] += 1;
  }
  return out;
}

/** 구간 낱말(전반·후반·연장)이 그 분과 맞는가 */
function halfOk(half: string | null, min: string): boolean {
  if (half === null) return true;
  const base = Number(/^\d+/u.exec(min)?.[0] ?? "0");
  if (half === "전반") return base <= 45;
  if (half === "후반") return base >= 46 && base <= 90;
  if (half === "연장") return base >= 91;
  return false;
}

function checkHalf(env: Env, bag: Bag, key: string, actual?: string): void {
  const half = strAt(bag, `${key}H`);
  if (half === null) return;
  const min = strAt(bag, key) ?? actual ?? null;
  if (min === null || !halfOk(half, min))
    bad(env, "minute-half", `${half}${min !== null ? ` ${min}분` : ""}`);
}

const ROUND_OF: Readonly<Record<string, string>> = Object.freeze({
  결승에서: "FINAL",
  "4강에서": "SEMI_FINALS",
  "8강에서": "QUARTER_FINALS",
  "16강에서": "LAST_16",
  플레이오프에서: "PLAYOFFS",
});

// ─── ③ 절의 대상(두 절 대조 — 리뷰 3회차 차단 5) ─────────────────────────────

/** 절이 다루는 대상 — 경기 절은 그 경기, 순위 절은 그 순위표, teams = 주어 쪽 팀(순위 절이 이어받는 팀) */
interface Focus {
  match: MatchModel | null;
  table: StandingsModel | null;
  teams: readonly string[];
}

const NO_FOCUS: Focus = { match: null, table: null, teams: [] };

/** 두 절이 같은 대상인가 — 경기끼리 같은 경기, 순위끼리 같은 순위표, 경기와 순위면 순위 절 팀이 경기 절 주어 쪽 팀 */
function sameFocus(a: Focus, b: Focus): boolean {
  if (a.match && b.match) return a.match.id === b.match.id;
  if (a.table && b.table) return a.table.id === b.table.id;
  const [game, standing] = a.match ? [a, b] : [b, a];
  if (!game.match || !standing.table) return true; // 대상을 정하지 못한 절은 다른 사유로 이미 걸렸다
  return standing.teams.every((t) => game.teams.includes(t));
}

// ─── ③ 결과 절 ────────────────────────────────────────────────────────────

/** 결과 절 공통 수식(대회·장소·라운드·결승골·해트트릭·골 합·동점골) */
function checkResultMods(
  env: Env,
  bag: Bag,
  match: MatchModel,
  side: Side,
): void {
  const f = match.facts!;
  const compKey = keyAt(env, bag, "comp");
  if (compKey !== null && compKey !== match.comp)
    bad(env, "comp-mismatch", textAt(env, bag, "comp"));
  const venue = strAt(bag, "venue");
  if (venue !== null) {
    if (NEUTRAL_ROUNDS.has(match.m.round)) bad(env, "venue", "중립 경기장");
    else if (venue === "named") {
      if (keyAt(env, bag, "venueTeam") !== match.home || side !== "away")
        bad(env, "venue", `${textAt(env, bag, "venueTeam")} 원정`);
    } else if (venue !== side)
      bad(env, "venue", venue === "home" ? "홈" : "원정");
  }
  const round = strAt(bag, "round");
  if (round !== null && ROUND_OF[round] !== match.m.round)
    bad(env, "round", round);
  // {n}골을 주고받은 끝에 — 두 팀 골 합(D40 ②), 두 팀이 모두 넣었을 때만(한쪽만 넣은 6-0·0-0은 '주고받지' 않았다 — 리뷰 3회차 차단 6)
  const total = numAt(bag, "total");
  if (
    total !== null &&
    !(f.ft.home > 0 && f.ft.away > 0 && f.ft.home + f.ft.away === total)
  )
    bad(env, "goal-count", `${total}골을 주고받은`);
  // {선수}의 [{분}] [PK] 결승골로
  if (bag.scorerKind === "decisive") {
    const g = decisiveGoal(match);
    const min = strAt(bag, "scorerMin");
    const ok =
      g !== null &&
      !g.ownGoal &&
      g.player === keyAt(env, bag, "scorer") &&
      g.side === side &&
      (min === null || g.min === min) &&
      (bag.scorerPk !== true || g.penalty);
    if (!ok) bad(env, "decisive-goal", textAt(env, bag, "scorer"));
    checkHalf(env, bag, "scorerMin", g?.min);
  }
  // {선수}의 해트트릭을·{n}골을 앞세워 — 주어 팀 선수의 자책골 아닌 골 수(해트트릭 = 3골 — 지시문 정의, 권장 1)
  const featKind = strAt(bag, "featKind");
  if (featKind !== null) {
    const feat = keyAt(env, bag, "feat");
    const n = (match.goals ?? []).filter(
      (g) => g.player === feat && !g.ownGoal && g.side === side,
    ).length;
    const ok =
      match.goals !== null &&
      (featKind === "hat" ? n === 3 : n === numAt(bag, "featN") && n >= 2);
    if (!ok) bad(env, "goal-count", textAt(env, bag, "feat"));
  }
  // (무승부) {선수}의 [{분}] [PK] 동점골로
  if (typeof bag.eq === "number") {
    const g = equaliserGoal(match);
    const min = strAt(bag, "eqMin");
    const ok =
      g !== null &&
      !g.ownGoal &&
      g.player === keyAt(env, bag, "eq") &&
      g.side === side &&
      (min === null || g.min === min) &&
      (bag.eqPk !== true || g.penalty);
    if (!ok) bad(env, "equaliser", textAt(env, bag, "eq"));
    checkHalf(env, bag, "eqMin", g?.min);
  }
}

/** 이긴 경기(win)·진 경기(loss) — 주어 = 승자·패자 */
function vResult(
  env: Env,
  bag: Bag,
  subject: string | null,
  role: "win" | "loss",
): Focus {
  if (subject === null) {
    bad(env, "subject-unknown");
    return NO_FOCUS;
  }
  const obj = keyAt(env, bag, "obj");
  const candidates = subjectMatches(env.s, subject, [
    obj,
    keyAt(env, bag, "venueTeam"),
  ]);
  if (candidates.length === 0) {
    bad(env, "name-not-in-refs", textAt(env, bag, "subj"));
    return NO_FOCUS;
  }
  return (
    bestOf(
      env,
      candidates,
      (sub, { match, side }) => {
        const focus: Focus = { match, table: null, teams: [subject] };
        const f = match.facts;
        if (!f) {
          bad(sub, "score-mismatch", match.id);
          return focus;
        }
        if (obj !== null && obj !== teamOn(match, other(side)))
          bad(sub, "opponent-mismatch", textAt(env, bag, "obj"));
        // 승부차기 경기의 승패는 승부차기 결과 — '승부차기' 수식이 있어야 한다(M1-19)
        if (f.pens && bag.shootout !== true)
          bad(sub, "shootout", "승부차기 경기");
        if (!f.pens && bag.shootout === true) bad(sub, "shootout", "승부차기");
        const verb = strAt(bag, "verb") ?? "";
        if (
          role === "win"
            ? f.winner !== side
            : f.winner === null || f.winner === side
        )
          bad(sub, "winner-mismatch", verb);
        // 90분에 이미 앞섰거나 90분 점수가 없는 연장 승부 — 두 경기 합산 연장일 수 있어 이긴 것처럼 쓰지 않는다(M1-20)
        if (f.aet && !f.pens && f.winner !== null && !decidedInEt(f))
          bad(sub, "extra-time", "연장 승부");
        if (bag.et === true && !(f.aet && !f.pens && decidedInEt(f)))
          bad(sub, "extra-time", "연장 끝에");
        // 승패 문장의 점수는 주어 팀 점수 먼저만(D55 ② — D30 보강: 원정 팀이 주어인데 홈 점수를 먼저 쓴 '…원정에서 2-3으로
        // 이겼다'는 score-order). 승부차기 끝에 이긴 문장의 승부차기 점수도 같다
        const score = pairAt(bag, "score");
        if (score) {
          const pair = bag.shootout === true ? f.pens : f.ft;
          if (!pair) bad(sub, "shootout", "승부차기 점수");
          else
            scoreIssue(
              sub,
              orientedMatches(pair, score[0], score[1], side),
              score,
            );
        }
        if (verb === "완파하다" && !(f.margin >= 3 && !f.pens))
          bad(sub, "margin", "완파");
        if (bag.kind === "역전승" && !(f.comeback && !f.pens))
          bad(sub, "comeback", "역전승");
        checkResultMods(sub, bag, match, side);
        return focus;
      },
      obj !== null || keyAt(env, bag, "venueTeam") !== null,
    ) ?? NO_FOCUS
  );
}

/** 비긴 경기(draw) — 짝 주어('A와 B가') 또는 주어 + [짝 목적어] */
function vDraw(env: Env, bag: Bag, subject: string | null): Focus {
  const pair = typeof bag.subj2 === "number";
  const b = pair ? keyAt(env, bag, "subj2") : keyAt(env, bag, "obj");
  if (subject === null) {
    bad(env, "subject-unknown");
    return NO_FOCUS;
  }
  const candidates =
    b !== null
      ? [matchOfPair(env.s, subject, b)].filter(
          (x): x is { match: MatchModel; side: Side } => x !== null,
        )
      : subjectMatches(env.s, subject, [keyAt(env, bag, "venueTeam")]);
  if (candidates.length === 0) {
    if (matchesOfTeam(env.s, subject).length === 0)
      bad(env, "name-not-in-refs", textAt(env, bag, "subj"));
    else
      bad(env, "opponent-mismatch", textAt(env, bag, pair ? "subj2" : "obj"));
    return NO_FOCUS;
  }
  return (
    bestOf(
      env,
      candidates,
      (sub, { match, side }) => {
        const focus: Focus = {
          match,
          table: null,
          teams: pair ? [match.home, match.away] : [subject],
        };
        const f = match.facts;
        if (!f) {
          bad(sub, "score-mismatch", match.id);
          return focus;
        }
        if (f.pens) bad(sub, "shootout-draw", "비겼다");
        else if (f.ft.home !== f.ft.away) bad(sub, "draw-mismatch", "비겼다");
        const score = pairAt(bag, "score");
        if (
          score &&
          !(
            score[0] === score[1] &&
            score[0] === f.ft.home &&
            f.ft.home === f.ft.away
          )
        )
          bad(sub, "score-mismatch", `${score[0]}-${score[1]}`);
        if (bag.et === true && !(f.aet && !f.pens && f.ft.home === f.ft.away))
          bad(sub, "extra-time", "연장 끝에");
        checkResultMods(sub, bag, match, side);
        return focus;
      },
      b !== null || keyAt(env, bag, "venueTeam") !== null,
    ) ?? NO_FOCUS
  );
}

/** 승부차기 맞선 뒤(pens) — ft 동점 + 승부차기 승자 */
function vPens(env: Env, bag: Bag): Focus {
  const subject = keyAt(env, bag, "subj");
  const obj = keyAt(env, bag, "obj");
  const found =
    subject !== null && obj !== null ? matchOfPair(env.s, subject, obj) : null;
  if (!found || subject === null) {
    bad(env, "opponent-mismatch", textAt(env, bag, "obj"));
    return NO_FOCUS;
  }
  const { match, side } = found;
  const focus: Focus = { match, table: null, teams: [subject] };
  const f = match.facts;
  if (!f || !f.pens) {
    bad(env, "shootout", "승부차기");
    return focus;
  }
  if (f.ft.home !== f.ft.away) bad(env, "shootout", "경기 점수 동점 아님");
  if (f.winner !== side) bad(env, "winner-mismatch", "이겼다");
  // '연장까지'는 입력 aet 값만 근거로 쓴다(승부차기에서 연장을 유도하지 않는다 — 권장 5)
  if (bag.etUntil === true && match.m.aet !== true)
    bad(env, "extra-time", "연장까지");
  const score = pairAt(bag, "score");
  if (score && !(score[0] === score[1] && score[0] === f.ft.home))
    bad(env, "score-mismatch", `${score[0]}-${score[1]}`);
  const pens = pairAt(bag, "pens");
  if (pens) scoreIssue(env, scoreMatches(f.pens, pens[0], pens[1], side), pens);
  checkResultMods(env, bag, match, side);
  return focus;
}

/** 'A와 B의 경기는 … 끝났다'(end) — 앞 팀 점수 먼저. 승부차기 경기면 뒤 절(endPens)이 있어야 한다 */
function vEnd(env: Env, bag: Bag, hasPensTail: boolean): Focus {
  const a = keyAt(env, bag, "subj");
  const b = keyAt(env, bag, "subj2");
  const found = a !== null && b !== null ? matchOfPair(env.s, a, b) : null;
  if (!found) {
    bad(env, "opponent-mismatch", textAt(env, bag, "subj2"));
    return NO_FOCUS;
  }
  const { match, side } = found;
  const focus: Focus = { match, table: null, teams: [match.home, match.away] };
  const f = match.facts;
  if (!f) {
    bad(env, "score-mismatch", match.id);
    return focus;
  }
  const score = pairAt(bag, "score");
  if (score)
    scoreIssue(env, orientedMatches(f.ft, score[0], score[1], side), score);
  if (bag.etUntil === true && match.m.aet !== true)
    bad(env, "extra-time", "연장까지");
  if (f.pens && !hasPensTail) bad(env, "shootout", "승부차기 결과 없음");
  checkResultMods(env, bag, match, side);
  return focus;
}

/** (end 뒤) 승부차기에서 {팀}이 {점수}로 이겼다 */
function vEndPens(
  env: Env,
  bag: Bag,
  prev: Focus,
  prevType: string | null,
): void {
  const match = prevType === "end" ? prev.match : null;
  const team = keyAt(env, bag, "subj");
  if (!match || team === null) {
    bad(env, "subject-unknown");
    return;
  }
  const side: Side | null =
    match.home === team ? "home" : match.away === team ? "away" : null;
  if (side === null) {
    bad(env, "opponent-mismatch", textAt(env, bag, "subj"));
    return;
  }
  const f = match.facts;
  if (!f?.pens) {
    bad(env, "shootout", "승부차기");
    return;
  }
  if (f.winner !== side) bad(env, "winner-mismatch", "승부차기");
  const pens = pairAt(bag, "pens");
  if (pens) scoreIssue(env, scoreMatches(f.pens, pens[0], pens[1], side), pens);
}

// ─── ③ 득점 절 ────────────────────────────────────────────────────────────

/** 선수 key → 그 경기에서 그 선수의 팀 key(한국 선수 블록 → 득점·도움 목록 — 자책골은 상대 팀 소속) */
function teamOfPlayerIn(
  s: LineState,
  player: string,
  match: MatchModel,
): string | null {
  for (const k of s.model.korean.values())
    if (k.player === player && k.k.match === match.id) return k.team;
  const keyOf = (name: string | undefined) =>
    name ? s.model.latin.get(foldName(name))?.key : undefined;
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
  return null;
}

interface PlayerData {
  match: MatchModel;
  /** 그 선수 팀(모르면 null)과 쪽 */
  team: string | null;
  side: Side | null;
  /** 자책골이 아닌 골 */
  goals: GoalRow[];
  own: GoalRow[];
  /** 득점 목록이 완전한가(false면 한국 선수 블록 수만 안다) */
  known: boolean;
  korean: KoreanModel | null;
}

/** 근거 경기에서 그 선수의 기록 후보 — 득점·도움 목록 또는 한국 선수 블록(같은 이름이 두 경기에 있으면 둘 다) */
function playerData(s: LineState, player: string): PlayerData[] {
  const keyOf = (name: string | undefined) =>
    name ? s.model.latin.get(foldName(name))?.key : undefined;
  const from = (match: MatchModel, korean: KoreanModel | null): PlayerData => {
    const team = teamOfPlayerIn(s, player, match);
    const side: Side | null =
      team === match.home ? "home" : team === match.away ? "away" : null;
    return match.goals
      ? {
          match,
          team,
          side,
          goals: match.goals.filter((g) => g.player === player && !g.ownGoal),
          own: match.goals.filter((g) => g.player === player && g.ownGoal),
          known: true,
          korean,
        }
      : { match, team, side, goals: [], own: [], known: false, korean };
  };
  const out: PlayerData[] = [];
  for (const match of s.refMatches) {
    const involved =
      match.m.goals?.some(
        (g) => keyOf(g.player) === player || keyOf(g.assist) === player,
      ) ?? false;
    const korean =
      s.refKorean.find((k) => k.player === player && k.k.match === match.id) ??
      null;
    if (involved || korean) out.push(from(match, korean));
  }
  for (const k of s.refKorean) {
    if (k.player !== player || out.some((x) => x.match.id === k.k.match))
      continue;
    const match = s.model.matches.get(k.k.match);
    if (match) out.push(from(match, k));
  }
  return out;
}

/** 골 수 — 목록을 모르면 한국 선수 블록 수, 그것도 없으면 null */
function goalTotal(pd: PlayerData): number | null {
  if (pd.known) return pd.goals.length;
  return pd.korean ? pd.korean.k.goals : null;
}

function playerFocus(pd: PlayerData): Focus {
  return { match: pd.match, table: null, teams: pd.team ? [pd.team] : [] };
}

/** '{팀}의 {선수}' 소속 */
function checkAffiliation(env: Env, bag: Bag, pd: PlayerData): void {
  const team = keyAt(env, bag, "team");
  if (team !== null && pd.team !== team)
    bad(
      env,
      "affiliation",
      `${textAt(env, bag, "team")} ${textAt(env, bag, "subj")}`,
    );
}

const NOUN_CODE: Readonly<Record<string, BriefLineReasonCode>> = Object.freeze({
  골: "scorer",
  선제골: "opening-goal",
  결승골: "decisive-goal",
  동점골: "equaliser",
  만회골: "scorer",
});

/** 그 경기에서 그 종류의 골(득점자 player — 자책골 제외) */
function goalsOfKind(
  match: MatchModel,
  player: string,
  noun: string,
): GoalRow[] {
  const goals = match.goals ?? [];
  const mine = (g: GoalRow | null | undefined): GoalRow[] =>
    g && !g.ownGoal && g.player === player ? [g] : [];
  if (noun === "선제골") return mine(goals[0]);
  if (noun === "결승골") return mine(decisiveGoal(match));
  if (noun === "동점골") return mine(equaliserGoal(match));
  if (noun === "만회골")
    return consolationGoals(match).filter((g) => g.player === player);
  return goals.filter((g) => g.player === player && !g.ownGoal);
}

/** 득점(goal) — 그 선수의 골(종류·분·PK) */
function vGoal(env: Env, bag: Bag): Focus {
  const player = keyAt(env, bag, "subj");
  const candidates = player !== null ? playerData(env.s, player) : [];
  const noun = strAt(bag, "noun") ?? "골";
  const code = NOUN_CODE[noun] ?? "scorer";
  if (player === null || candidates.length === 0) {
    bad(env, code, textAt(env, bag, "subj"));
    return NO_FOCUS;
  }
  return (
    bestOf(
      env,
      candidates,
      (sub, pd) => {
        checkAffiliation(sub, bag, pd);
        const min = strAt(bag, "min");
        if (!pd.known) {
          // 득점 목록이 없으면 한국 선수 블록의 골 수만 안다 — 분·종류·PK는 확인할 수 없다
          const plain = noun === "골" && min === null && bag.pk !== true;
          if (!plain || (goalTotal(pd) ?? 0) === 0)
            bad(sub, code, textAt(env, bag, "subj"));
          return playerFocus(pd);
        }
        const pool = goalsOfKind(pd.match, player, noun);
        if (pool.length === 0) {
          bad(sub, code, textAt(env, bag, "subj"));
          return playerFocus(pd);
        }
        const byMin = min === null ? pool : pool.filter((g) => g.min === min);
        if (byMin.length === 0) bad(sub, "minute", `${min}분`);
        else if (bag.pk === true && !byMin.some((g) => g.penalty))
          bad(sub, "penalty", "PK");
        checkHalf(sub, bag, "min");
        return playerFocus(pd);
      },
      keyAt(env, bag, "team") !== null,
    ) ?? NO_FOCUS
  );
}

/** 골 수(count) — n골(1 이상)·해트트릭(3골)·멀티골(2골 이상) */
function vCount(env: Env, bag: Bag): Focus {
  const player = keyAt(env, bag, "subj");
  const candidates = player !== null ? playerData(env.s, player) : [];
  const n = numAt(bag, "n");
  const feat = strAt(bag, "feat");
  const label = `${textAt(env, bag, "subj")} ${n !== null ? `${n}골` : feat === "hat" ? "해트트릭" : "멀티골"}`;
  if (player === null || candidates.length === 0) {
    bad(env, "goal-count", label);
    return NO_FOCUS;
  }
  return (
    bestOf(
      env,
      candidates,
      (sub, pd) => {
        checkAffiliation(sub, bag, pd);
        const total = goalTotal(pd);
        const ok =
          total !== null &&
          (n !== null
            ? total === n && n >= 1
            : feat === "hat"
              ? total === 3
              : total >= 2);
        if (!ok) bad(sub, "goal-count", label);
        return playerFocus(pd);
      },
      keyAt(env, bag, "team") !== null,
    ) ?? NO_FOCUS
  );
}

/** 도움(assist) — '{득점자}의 [{분}] 골·결승골…을 도왔다' = 그 골의 도움이 주어(자기 골 도움 없음) */
function vAssist(env: Env, bag: Bag): Focus {
  const player = keyAt(env, bag, "subj");
  const target = keyAt(env, bag, "target");
  const candidates = player !== null ? playerData(env.s, player) : [];
  const label = `${textAt(env, bag, "subj")} → ${textAt(env, bag, "target")}`;
  if (player === null || target === null || candidates.length === 0) {
    bad(env, "assist-count", label);
    return NO_FOCUS;
  }
  return (
    bestOf(
      env,
      candidates,
      (sub, pd) => {
        if (!pd.match.goals || player === target) {
          bad(sub, "assist-count", label);
          return playerFocus(pd);
        }
        let pool = goalsOfKind(pd.match, target, strAt(bag, "noun") ?? "골");
        const min = strAt(bag, "min");
        if (min !== null) pool = pool.filter((g) => g.min === min);
        if (!pool.some((g) => g.assist === player))
          bad(sub, "assist-count", label);
        checkHalf(sub, bag, "min");
        return playerFocus(pd);
      },
      true,
    ) ?? NO_FOCUS
  );
}

// ─── ③ 한국 선수 절 ───────────────────────────────────────────────────────

/** 한국 선수 출전(korean) — 블록 기록과 일치(같은 선수 블록이 둘이면 맞는 쪽 — 권장 6) */
function vKorean(env: Env, bag: Bag): { focus: Focus; k: KoreanModel | null } {
  const player = keyAt(env, bag, "subj");
  const blocks = env.s.refKorean.filter((x) => x.player === player);
  if (blocks.length === 0) {
    bad(env, "appearance", `${textAt(env, bag, "subj")} 기록 없음`);
    return { focus: NO_FOCUS, k: null };
  }
  return (
    bestOf(
      env,
      blocks,
      (sub, k) => {
        const kk = k.k;
        const match = env.s.model.matches.get(kk.match) ?? null;
        const focus: Focus = { match, table: null, teams: [k.team] };
        for (const key of ["kTeam", "kTeam2"]) {
          const t = keyAt(env, bag, key);
          if (t !== null && t !== k.team)
            bad(sub, "affiliation", textAt(env, bag, key));
        }
        const kOpp = keyAt(env, bag, "kOpp");
        if (kOpp !== null) {
          const opp = !match
            ? null
            : match.home === k.team
              ? match.away
              : match.away === k.team
                ? match.home
                : null;
          if (opp !== kOpp)
            bad(sub, "opponent-mismatch", textAt(env, bag, "kOpp"));
        }
        const app = strAt(bag, "app");
        if (app === "bench") {
          if (kk.minutes > 0) bad(sub, "appearance", "결장");
          return { focus, k };
        }
        if (kk.minutes <= 0) bad(sub, "appearance", "출전");
        if (app === "start" && !kk.started) bad(sub, "appearance", "선발");
        if (app === "sub" && (kk.started || kk.subOn === undefined))
          bad(sub, "appearance", "교체 투입");
        const subOn = strAt(bag, "subOn");
        if (subOn !== null && String(kk.subOn) !== subOn)
          bad(sub, "minute", `${subOn}분 투입`);
        checkHalf(
          sub,
          bag,
          "subOn",
          kk.subOn !== undefined ? String(kk.subOn) : undefined,
        );
        const minutes = numAt(bag, "minutes");
        if (minutes !== null && minutes !== kk.minutes)
          bad(sub, "minute", `${minutes}분 출전`);
        if (bag.subOff === true && kk.subOff === undefined)
          bad(sub, "appearance", "교체 아웃");
        return { focus, k };
      },
      ["kOpp", "kTeam", "kTeam2"].some((key) => keyAt(env, bag, key) !== null),
    ) ?? {
      focus: NO_FOCUS,
      k: null,
    }
  );
}

/** (출전한 한국 선수 문형 뒤) 득점은 없었다 — 결장 뒤 꼬리는 거부(권장 1) */
function vKoreanTail(
  env: Env,
  k: KoreanModel | null,
  prevBag: Bag | null,
): void {
  if (!k || prevBag === null) {
    bad(env, "subject-unknown");
    return;
  }
  if (prevBag.app === "bench" || k.k.minutes <= 0)
    bad(env, "appearance", "결장 뒤 득점 서술");
  if (k.k.goals !== 0) bad(env, "goal-count", "득점 없음");
}

// ─── ③ 순위 절 ────────────────────────────────────────────────────────────

/** 순위 절의 순위표 후보 — 대회 이름이 있으면 그 대회 순위표만 */
function tablesFor(env: Env, bag: Bag): StandingsModel[] {
  const comp = keyAt(env, bag, "comp");
  const tables = env.s.refStandings;
  if (comp === null) return tables;
  const picked = tables.filter((t) => t.comp === comp);
  if (picked.length === 0) bad(env, "comp-mismatch", textAt(env, bag, "comp"));
  return picked;
}

/**
 * 팀들이 모두 있는 한 순위표(리뷰 3회차 차단 3 — 한 절·한 나열의 팀은 같은 순위표에 있어야 한다). 한 팀이라도 없는 표밖에 없으면
 * null(팀이 어느 표에도 없으면 rank-pos, 표가 갈리면 rank-table).
 */
function tableOf(
  env: Env,
  tables: readonly StandingsModel[],
  teams: readonly string[],
): StandingsModel | null {
  const both = tables.find((t) =>
    teams.every((team) => t.rows.some((r) => r.team === team)),
  );
  if (both) return both;
  const anywhere = teams.every((team) =>
    tables.some((t) => t.rows.some((r) => r.team === team)),
  );
  if (anywhere && teams.length > 1) bad(env, "rank-table", "다른 순위표");
  else bad(env, "rank-pos", "순위표에 없음");
  return null;
}

function rowOf(table: StandingsModel, team: string): RowModel {
  return table.rows.find((r) => r.team === team)!;
}

/** 그 행의 순위를 다른 팀과 함께 쓰는가(같은 pos 2팀 이상 — 승점이 같아도 pos가 다르면 공동이 아니다) */
function sharedPos(table: StandingsModel, pos: number): boolean {
  return table.rows.filter((r) => r.pos === pos).length >= 2;
}

/**
 * 순위 서술 하나(그 팀 행 · 순위 n · 공동 여부) — pos가 같아야 하고, '공동'은 그 pos를 2팀 이상이 쓸 때만, pos를 여럿이 쓰는데
 * '공동'을 빼면 단독처럼 읽혀 강등(리뷰 3회차 차단 4·리뷰 b2 '공동 2위인데 단독처럼').
 */
function checkPos(
  env: Env,
  table: StandingsModel,
  row: RowModel,
  rank: number | null,
  tied: boolean,
): void {
  if (rank !== null && row.pos !== rank) {
    bad(
      env,
      tied ? "rank-tie" : "rank-pos",
      tied ? `공동 ${rank}위` : `${rank}위`,
    );
    return;
  }
  const shared = sharedPos(table, row.pos);
  if (tied && !shared) bad(env, "rank-tie", `공동 ${rank ?? row.pos}위`);
  if (!tied && shared) bad(env, "rank-tie", `${row.pos}위 공동 빠짐`);
}

/** 순위 묶음 하나(팀들 + 승점 + 순위) — 같은 순위표 */
function checkRankGroup(
  env: Env,
  tables: readonly StandingsModel[],
  teams: readonly string[],
  pts: number | null,
  rank: number | null,
  tied: boolean,
): StandingsModel | null {
  const table = tableOf(env, tables, teams);
  if (!table) return null;
  for (const team of teams) {
    const row = rowOf(table, team);
    if (pts !== null && row.pts !== pts) bad(env, "points", `승점 ${pts}`);
    checkPos(env, table, row, rank, tied);
  }
  if (teams.length > 1 && !tied) bad(env, "rank-tie", "공동 아님");
  return table;
}

function subjectTeams(
  env: Env,
  bag: Bag,
  inherited: string | null,
): string[] | null {
  const group = groupKeys(env, bag, "subj");
  if (group) return group;
  const single = keyAt(env, bag, "subj");
  if (single !== null) return [single];
  return inherited !== null ? [inherited] : null;
}

/** 순위(rank) — [팀] [승점 n으로] [대회] [공동] 선두다·n위다 … */
function vRank(env: Env, bag: Bag, inherited: string | null): Focus {
  const teams = subjectTeams(env, bag, inherited);
  if (!teams) {
    bad(env, "subject-unknown");
    return NO_FOCUS;
  }
  const table = checkRankGroup(
    env,
    tablesFor(env, bag),
    teams,
    numAt(bag, "pts"),
    numAt(bag, "rank"),
    bag.rankT === true,
  );
  return { match: null, table, teams };
}

/** 순위 나열(rankList) — 모든 묶음이 같은 순위표 */
function vRankList(env: Env, bag: Bag): Focus {
  const groups = [1, 2, 3]
    .map((i) => ({ i, teams: groupKeys(env, bag, `g${i}`) }))
    .filter((g): g is { i: number; teams: string[] } => g.teams !== null);
  const all = groups.flatMap((g) => g.teams);
  const table = tableOf(env, tablesFor(env, bag), all);
  if (!table) return NO_FOCUS;
  for (const g of groups) {
    checkRankGroup(
      env,
      [table],
      g.teams,
      numAt(bag, `pts${g.i}`),
      numAt(bag, `rank${g.i}`),
      bag[`rank${g.i}T`] === true,
    );
  }
  return { match: null, table, teams: all };
}

/** 순위 변동(move) — prev가 있을 때만(D40 ③), 도착 순위를 다른 팀과 함께 쓰면 단독처럼 읽혀 강등 */
function vMove(env: Env, bag: Bag, inherited: string | null): Focus {
  const team = keyAt(env, bag, "subj") ?? inherited;
  if (team === null) {
    bad(env, "subject-unknown");
    return NO_FOCUS;
  }
  const table = tableOf(env, tablesFor(env, bag), [team]);
  if (!table) return NO_FOCUS;
  const row = rowOf(table, team);
  const from = numAt(bag, "from");
  const to = numAt(bag, "to");
  const label = `${from}위에서 ${to}위로`;
  const focus: Focus = { match: null, table, teams: [team] };
  if (row.prev === undefined) {
    bad(env, "rank-move-no-prev", label);
    return focus;
  }
  const up = bag.verb === "오르다";
  const directionOk =
    from !== null && to !== null && (up ? to < from : to > from);
  if (row.prev !== from || row.pos !== to || !directionOk)
    bad(env, "rank-move", label);
  else if (sharedPos(table, row.pos)) bad(env, "rank-tie", `${to}위 공동 빠짐`);
  return focus;
}

/** 순위 유지(keep) — prev가 있고 같을 때만(D40 ③), 공동은 rank와 같은 판정 */
function vKeep(env: Env, bag: Bag, inherited: string | null): Focus {
  const team = keyAt(env, bag, "subj") ?? inherited;
  if (team === null) {
    bad(env, "subject-unknown");
    return NO_FOCUS;
  }
  const table = tableOf(env, tablesFor(env, bag), [team]);
  if (!table) return NO_FOCUS;
  const row = rowOf(table, team);
  const pts = numAt(bag, "pts");
  if (pts !== null && row.pts !== pts) bad(env, "points", `승점 ${pts}`);
  if (row.prev === undefined) bad(env, "rank-move-no-prev", "지켰다");
  else if (row.prev !== row.pos || row.pos !== numAt(bag, "rank"))
    bad(env, "rank-move", "지켰다");
  else checkPos(env, table, row, numAt(bag, "rank"), bag.rankT === true);
  return { match: null, table, teams: [team] };
}

/** 승점 차(gap) — 방향까지(D40 ②), 차는 1 이상(중요 1), 두 팀 순위의 공동은 rank와 같은 판정(차단 4) */
function vGap(env: Env, bag: Bag, inherited: string | null): Focus {
  const team = keyAt(env, bag, "subj") ?? inherited;
  const otherTeam = keyAt(env, bag, "other");
  if (team === null || otherTeam === null) {
    bad(env, "subject-unknown");
    return NO_FOCUS;
  }
  const table = tableOf(env, tablesFor(env, bag), [team, otherTeam]);
  if (!table) return NO_FOCUS;
  const a = rowOf(table, team);
  const b = rowOf(table, otherTeam);
  const gap = numAt(bag, "gap");
  const diff = bag.dir === "ahead" ? a.pts - b.pts : b.pts - a.pts;
  if (gap === null || gap < 1 || diff !== gap)
    bad(env, "points", `승점 ${gap} 차`);
  const otherRank = numAt(bag, "otherRank");
  if (otherRank !== null)
    checkPos(env, table, b, otherRank, bag.otherRankT === true);
  checkPos(env, table, a, numAt(bag, "rank"), bag.rankT === true);
  return { match: null, table, teams: [team] };
}

// ─── ③ 분석 대조 ──────────────────────────────────────────────────────────

/** 앞 절에 붙는 꼬리 — 대상 대조를 하지 않는다(앞 절이 정한다) */
const TAIL_TYPES: ReadonlySet<string> = new Set(["endPens", "koreanTail"]);

/** 분석 하나 → 사유 목록(빈 목록 = 입력과 맞음) */
function validateParse(s: LineState, parse: LineParse): Issues {
  const env: Env = { s, issues: [] };
  let prevFocus: Focus = NO_FOCUS;
  let prevType: string | null = null;
  let prevKorean: KoreanModel | null = null;
  let prevBag: Bag | null = null;
  parse.clauses.forEach((c: ParsedClause, i) => {
    const bag = c.bag;
    const adn =
      i === 0 && parse.adnSubject !== undefined
        ? (s.mentions[parse.adnSubject]?.key ?? null)
        : null;
    const subject = adn ?? keyAt(env, bag, "subj");
    const inherited = prevFocus.teams.length === 1 ? prevFocus.teams[0]! : null;
    let focus: Focus = NO_FOCUS;
    switch (c.type) {
      case "win":
      case "loss":
        focus = vResult(env, bag, subject, c.type);
        break;
      case "draw":
        focus = vDraw(env, bag, subject);
        break;
      case "pens":
        focus = vPens(env, bag);
        break;
      case "end":
        focus = vEnd(env, bag, parse.clauses[i + 1]?.type === "endPens");
        break;
      case "endPens":
        vEndPens(env, bag, prevFocus, prevType);
        focus = prevFocus;
        break;
      case "goal":
        focus = vGoal(env, bag);
        break;
      case "count":
        focus = vCount(env, bag);
        break;
      case "assist":
        focus = vAssist(env, bag);
        break;
      case "korean": {
        const r = vKorean(env, bag);
        focus = r.focus;
        prevKorean = r.k;
        break;
      }
      case "koreanTail":
        vKoreanTail(env, prevType === "korean" ? prevKorean : null, prevBag);
        focus = prevFocus;
        break;
      case "rank":
        focus = vRank(env, bag, inherited);
        break;
      case "rankList":
        focus = vRankList(env, bag);
        break;
      case "move":
        focus = vMove(env, bag, inherited);
        break;
      case "keep":
        focus = vKeep(env, bag, inherited);
        break;
      case "gap":
        focus = vGap(env, bag, inherited);
        break;
    }
    if (i > 0 && !TAIL_TYPES.has(c.type) && !sameFocus(prevFocus, focus))
      bad(env, "clause-mismatch", `${prevType}+${c.type}`);
    prevFocus = focus;
    prevType = c.type;
    prevBag = bag;
  });
  return env.issues;
}

/** 뼈대 분석 → 입력과 맞는 분석(없으면 사유가 가장 적은 분석의 사유). 문법 밖이면 grammar-unknown */
function lineGrammar(s: LineState): string | null {
  const spans = s.mentions.map((m) => ({
    start: m.start,
    end: m.end,
    text: m.text,
    kind: m.kind,
  }));
  const skeleton = buildSkeleton(s.text, spans);
  const { parses, furthest } = parseBriefLine(
    skeleton,
    spans.map((m) => m.kind),
    { keys: s.model.grammarKeys },
  );
  if (parses.length === 0) {
    fail(s, "grammar-unknown", skeletonWordAt(skeleton, furthest, spans));
    return null;
  }
  let best: { issues: Issues; parse: LineParse } | null = null;
  for (const parse of parses) {
    const issues = validateParse(s, parse);
    if (!best || issues.length < best.issues.length) best = { issues, parse };
    if (issues.length === 0) break;
  }
  for (const issue of best!.issues) fail(s, issue.code, issue.detail);
  return best!.parse.clauses.map((c) => c.type).join("+");
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
  const masked = maskText(text, mentions);
  const s: LineState = {
    model,
    text,
    masked,
    refs: line.r,
    mentions,
    reasons: [],
    warnings: [],
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
  const overLimit = briefLinesOverLimit([substituted]).length > 0;
  if (overLimit) fail(s, "over-limit", String(substituted.length));
  lineScripts(s);
  lineNames(s);
  // 80자를 넘는 줄은 이미 강등이다 — 긴 줄의 문법 분석(분석 수가 늘어난다)은 건너뛴다(리뷰 3회차 권장 7)
  const grammar = overLimit ? null : lineGrammar(s);
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
    grammar,
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
 * 스키마를 통과한 줄(parseBriefOutput — 앞 5줄) → 출력 전체·줄별 판정(순수 함수). `input`은 전체 입력(득점자 입력 정리를 거친
 * 빌더 출력 — 템플릿과 같은 근거)이고, 요청 본문에서 잘린 항목은 `options.hiddenRefs`로 알려 준다(D51).
 */
export function checkBriefOutput(
  lines: readonly BriefOutputLine[],
  input: BriefCheckInput,
  ctx: BriefCheckContext,
  options: Pick<JudgeOptions, "hiddenRefs"> = {},
): BriefCheckResult {
  const model = buildModel(input, ctx, options.hiddenRefs);
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
  /**
   * 모델이 보지 못한 근거 id(D51 — brief-input.ts `briefLlmInput(input).hiddenRefs`). `input`은 전체 입력(템플릿과 같은 근거)이고, 이 id를
   * 근거로 단 줄은 `ref-hidden`으로 강등한다. 없으면 입력 전체를 모델이 본 것으로 본다.
   */
  hiddenRefs?: ReadonlySet<string>;
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
  const check = checkBriefOutput(parsed.lines, input, ctx, {
    hiddenRefs: options.hiddenRefs,
  });
  if (!check.whole.ok)
    return done(retry(), "whole", check.whole.reasons.join(","), check, parse);
  const failed = check.lines.filter((l) => !l.ok).map((l) => l.n);
  if (failed.length > 0)
    return done(
      { verdict: "downgrade-line", lines: failed },
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
