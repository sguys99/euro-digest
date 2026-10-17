/**
 * 일일 브리핑 게시 줄 만들기 (M1-45 — PRD FR-22·FR-26·FR-29, D24·D28·D38·D40·D51) — I/O 없는 순수 함수만 둔다.
 *
 * FR-29 판정(brief-check.ts `judgeBriefResponse` — 검사기는 그대로 쓴다)이 `ok`·`downgrade-line:n`이면 그 출력으로 게시 줄을 만든다:
 *   - 통과 줄 = `check.substitutions[i].text`(고유명사 치환·조사 보정 뒤 — 검사기가 80자를 잰 문장과 같다), `ai:true`, refs = 모델의 r
 *   - 강등 줄 = 같은 근거의 코드 템플릿 줄(brief-template.ts `templateLineForRefs` — **전체 입력** 기준, D51: 모델이 보지 못한 경기를
 *     가리킨 줄도 템플릿은 전체 입력에서 만든다), `ai:false`. 템플릿 줄이 없으면(점수 형식이 틀린 경기·80자 안 문장 없음) 그 줄은 버린다
 *   - 같은 근거 중복(오케스트레이터 결정 2026-10-17 — 그날 경기 결과가 빠지지 않게, 같은 사실을 두 번 쓰지 않게):
 *     ⓐ 템플릿 줄(근거 1개)의 근거가 앞에서 넣은 템플릿 줄의 근거와 겹치면 버린다(`duplicate-template`)
 *     ⓑ 같은 경기를 근거로 단 **결과 문형** 통과 줄(check.lines[i].grammar에 결과 절 — win·loss·draw·pens·end·endPens, 줄 위치
 *       무관)이 있으면 그 경기의 템플릿 줄은 버린다(`duplicate-result`). 득점·도움 통과 줄과만 겹치면 템플릿 결과 줄을 남긴다
 *       (예: 통과 'Kane이 2골을 넣었다' + 강등된 같은 경기 결과 줄 → 템플릿 결과 줄 게시)
 *     ⓑ' 같은 순위표를 근거로 단 **순위 문형** 통과 줄(순위 절 — rank·rankList·keep·move·gap, 'win+rank' 포함)이 있으면 그
 *       순위표의 템플릿 줄은 버린다(`duplicate-rank` — 리뷰 반영)
 *     ⓒ 같은 경기의 결과 문형 통과 줄이 둘이면 뒤 줄은 버린다(`duplicate-ai-result` — 지우기만 하므로 사실 위험 없음)
 *     출력 줄 1개가 게시 줄 1개 이하라 5줄을 넘지 않지만, 방어선으로 원래 순서의 앞 5줄(BRIEF_MAX_LINES)만 게시한다
 *   - 통과 줄이 파일 스키마(BriefLineSchema — 80자·앞뒤 공백·근거 id 형식)를 통과하지 못하면 강등 줄로 다룬다(방어선 — 검사기가 이미
 *     같은 조건을 보지만, 파일 하나 때문에 그날 브리핑 쓰기가 통째로 실패하지 않게)
 *   - 줄 순서는 모델 출력 순서(강등 줄은 그 자리에 템플릿 줄)
 * 통과 줄이 하나도 없으면 호출부는 이 결과 대신 전체 템플릿(`templateBriefLines` — 경기 4줄 + 순위 줄 구성)을 게시한다
 * (brief-file.ts `planBriefPublish` reason `all-lines-downgraded`). 그 밖의 경우 mode = 모든 줄 AI면 llm, 섞이면 mixed(D38).
 *
 * 시도 customId(mock 조회·로그용 — 단건 호출은 customId를 API로 보내지 않는다): 첫 시도 `brief-<발행일>`, FR-29 재시도
 * `brief-<발행일>-r1`(fixtures/llm/README.md 예약 규칙).
 */
import {
  BRIEF_MAX_LINES,
  BriefLineSchema,
  type BriefLine,
  type RunEnv,
  type RunLog,
} from "@/lib/schema";
import { kstDate } from "@/lib/time";

import {
  BRIEF_MAX_ATTEMPTS,
  briefCustomId,
  type BriefOutputLine,
} from "./brief";
import type { BriefCheckResult, BriefJudgement } from "./brief-check";
import type { ClauseType } from "./brief-grammar";
import type { BriefInput } from "./brief-input";
import type { RunsLoad } from "./cost";
import {
  chooseBriefCompForm,
  templateLineForRefs,
  type BriefTemplateContext,
} from "./brief-template";

// ─── 시도 id ─────────────────────────────────────────────────────────────

/** 시도 번호(1부터) → customId — 1 = `brief-<발행일>`, n ≥ 2 = `brief-<발행일>-r<n-1>` */
export function briefAttemptCustomId(
  briefDate: string,
  attempt: number,
): string {
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new RangeError(
      `attempt는 1 이상의 정수여야 한다 (받은 값: ${attempt})`,
    );
  }
  const base = briefCustomId(briefDate);
  return attempt === 1 ? base : `${base}-r${attempt - 1}`;
}

// ─── 하루 요청 상한 (D56) ──────────────────────────────────────────────────

/** 같은 브리핑 날짜·같은 env의 일일 브리핑 요청 상한(FR-25 '하루 1~3요청' — PRD §15 D56) */
export const BRIEF_DAILY_REQUEST_CAP = 3;

/** eval-prompt 실행 기록의 runId 접두사(scripts/lib/eval-prompt-run.ts — 회귀 측정이라 하루 상한 밖) */
const EVAL_RUN_ID_PREFIX = "eval-";

export interface BriefDailyAllowance {
  /** 그날 이미 보낸 브리핑 요청 수(같은 env 기록 합산) */
  used: number;
  /** 남은 몫 = 상한 − used(0 이상) */
  remaining: number;
  /** 이번 실행이 쓸 수 있는 시도 수 = min(BRIEF_MAX_ATTEMPTS, remaining) — 0이면 LLM 없이 템플릿(daily-cap) */
  attempts: number;
}

/**
 * 하루 요청 상한(순수 함수 — D56). `runs`는 **이번 실행과 같은 env**의 기록(prod = runs.json, dev = runs-dev.json). 날짜 기준은
 * 기록의 `startedAt`을 KST 날짜로 바꾼 값 — 수집 실행의 브리핑 날짜(발행일)가 정의상 실행 시작의 KST 날짜라(collect-run.ts
 * runCollect publishDate) 기록에 있는 값 중 가장 정확하다. collect 기록만 세고 eval 기록(`eval-…`)은 뺀다(회귀 측정 — 상한 밖,
 * 기록은 남는다). `brief`가 없는 기록(옛 기록·LLM을 부르지 않은 실행·mock)은 0건이다.
 */
export function briefDailyAllowance(input: {
  runs: ReadonlyArray<Pick<RunLog, "runId" | "job" | "startedAt" | "brief">>;
  briefDate: string;
  cap?: number;
  maxAttempts?: number;
}): BriefDailyAllowance {
  const cap = input.cap ?? BRIEF_DAILY_REQUEST_CAP;
  const used = input.runs
    .filter(
      (r) =>
        r.job === "collect" &&
        !r.runId.startsWith(EVAL_RUN_ID_PREFIX) &&
        kstDate(r.startedAt) === input.briefDate,
    )
    .reduce((n, r) => n + (r.brief?.requests ?? 0), 0);
  const remaining = Math.max(0, cap - used);
  return {
    used,
    remaining,
    attempts: Math.min(input.maxAttempts ?? BRIEF_MAX_ATTEMPTS, remaining),
  };
}

/** 이번 실행의 시도 계획(D56) — 기록을 읽었으면 하루 상한, 못 읽었으면 실행당 상한(BRIEF_MAX_ATTEMPTS)으로 진행 */
export type BriefAttemptPlan =
  | ({ readable: true } & BriefDailyAllowance)
  | { readable: false; file: string; error: string; attempts: number };

/**
 * runs 읽기 결과(cost.ts tryLoadRuns) → 시도 계획(순수 함수). 이번 실행과 같은 env의 기록만 센다(prod = runs.json, dev =
 * runs-dev.json). 읽지 못하면 보수적으로 실행당 상한(2회)만 지키고 진행한다(발행을 멈추지 않음 — 호출부가 경고, D56 결정).
 */
export function planBriefAttempts(
  load: RunsLoad,
  env: RunEnv,
  briefDate: string,
): BriefAttemptPlan {
  if (!load.ok) {
    return {
      readable: false,
      file: load.file,
      error: load.error,
      attempts: BRIEF_MAX_ATTEMPTS,
    };
  }
  return {
    readable: true,
    ...briefDailyAllowance({
      runs: env === "prod" ? load.prodRuns : load.devRuns,
      briefDate,
    }),
  };
}

// ─── 게시 줄 ─────────────────────────────────────────────────────────────

/** 출력 줄 1개의 게시 결과 */
export interface VerifiedBriefLine {
  /** 출력 줄 번호(1부터 — 검사기 줄 번호와 같다) */
  n: number;
  /** ai = 검증 통과(LLM 줄 게시) · template = 줄 단위 강등(같은 근거의 템플릿 줄) · dropped = 버림 */
  outcome: "ai" | "template" | "dropped";
  /**
   * 강등·버림 사유 — 검사기 사유 코드(중복 없이, 강등 줄) + `schema`(파일 스키마 불통과) · 버림이면 끝에 `duplicate-template`(앞
   * 템플릿 줄과 같은 근거) · `duplicate-result`(같은 경기의 결과 문형 통과 줄이 있음) · `duplicate-rank`(같은 순위표의 순위 문형
   * 통과 줄이 있음) · `no-template`(그 근거의 템플릿 줄 없음) · `over-max-lines`(5줄 초과 — 방어선). 통과 줄은 빈 배열(같은 경기
   * 결과를 앞 통과 줄이 이미 썼으면 `duplicate-ai-result`, 5줄 초과로 빠지면 `over-max-lines`)
   */
  reasons: string[];
  /** 게시 줄 — 버렸으면 null */
  line: BriefLine | null;
  /** 검사기가 고른 문형(check.lines[i].grammar — 통과 줄만, 로그 분포용) */
  grammar: string | null;
}

export interface VerifiedBrief {
  /** 게시 줄(출력 순서) */
  lines: BriefLine[];
  /** ai:true 줄 수(runs.json summarized) */
  ai: number;
  /** 템플릿 줄 수(runs.json downgraded) */
  template: number;
  /** 버린 출력 줄 수 */
  dropped: number;
  detail: VerifiedBriefLine[];
}

export interface ComposeVerifiedBriefInput {
  /** 마지막 시도의 출력 줄(brief.ts parseBriefOutput — 앞 5줄, 근거 r) */
  output: readonly BriefOutputLine[];
  /** 같은 출력의 검사 결과(judgement.check — 줄 수가 output과 같다) */
  check: Pick<BriefCheckResult, "lines" | "substitutions">;
  /** 전체 입력(검사기·템플릿과 같은 근거 — D51) */
  input: Pick<BriefInput, "matches" | "standings">;
  /** 템플릿 문맥 — 대회 설정·이름 표기(검사기 치환과 같은 사전). compForm이 없으면 입력으로 고른다(검사기 치환과 같은 표기) */
  template: BriefTemplateContext;
}

/** 판정(ok·downgrade-line) 출력 → 게시 줄(순수 함수 — 머리 주석) */
export function composeVerifiedBrief(
  args: ComposeVerifiedBriefInput,
): VerifiedBrief {
  const { output, check, input } = args;
  if (check.lines.length !== output.length) {
    throw new RangeError(
      `검사 결과 줄 수(${check.lines.length})가 출력 줄 수(${output.length})와 다르다`,
    );
  }
  const template: BriefTemplateContext = {
    ...args.template,
    compForm: chooseBriefCompForm(input, args.template),
  };

  // 1) 통과 줄 후보 — 파일 스키마까지 통과해야 AI 줄로 게시한다
  const aiLines = output.map((line, i): BriefLine | null => {
    if (!check.lines[i]!.ok) return null;
    const parsed = BriefLineSchema.safeParse({
      text: check.substitutions[i]!.text,
      ai: true,
      refs: [...line.r],
    });
    return parsed.success ? parsed.data : null;
  });

  // 2) 같은 경기 결과 통과 줄이 둘이면 뒤 줄은 버린다(머리 주석 ⓒ) → 남은 통과 줄로 결과·순위 근거를 모은다(ⓑ·ⓑ' — 줄 위치 무관)
  const matchIds = new Set(input.matches.map((m) => m.id));
  const standingsIds = new Set(input.standings.map((st) => st.id));
  const resultCovered = new Set<string>();
  const aiDuplicate = aiLines.map((line, i): boolean => {
    if (!line || !isResultGrammar(check.lines[i]!.grammar)) return false;
    const matches = line.refs.filter((ref) => matchIds.has(ref));
    if (matches.some((ref) => resultCovered.has(ref))) return true;
    for (const ref of matches) resultCovered.add(ref);
    return false;
  });
  const rankCovered = new Set<string>(
    aiLines.flatMap((line, i) =>
      line && !aiDuplicate[i] && isRankGrammar(check.lines[i]!.grammar)
        ? line.refs.filter((ref) => standingsIds.has(ref))
        : [],
    ),
  );
  const templateCovered = new Set<string>();

  const composed = output.map((line, i): VerifiedBriefLine => {
    const n = i + 1;
    const lineCheck = check.lines[i]!;
    const ai = aiLines[i];
    if (ai && aiDuplicate[i]) {
      return {
        n,
        outcome: "dropped",
        reasons: ["duplicate-ai-result"],
        line: null,
        grammar: lineCheck.grammar,
      };
    }
    if (ai) {
      return {
        n,
        outcome: "ai",
        reasons: [],
        line: ai,
        grammar: lineCheck.grammar,
      };
    }
    const reasons: string[] = [
      ...new Set(lineCheck.reasons.map((r) => r.code)),
    ];
    if (lineCheck.ok) reasons.push("schema");
    const dropped = (why: string): VerifiedBriefLine => ({
      n,
      outcome: "dropped",
      reasons: [...reasons, why],
      line: null,
      grammar: null,
    });
    const replacement = templateLineForRefs(input, line.r, template);
    if (replacement === null) return dropped("no-template");
    if (replacement.refs.some((ref) => templateCovered.has(ref))) {
      return dropped("duplicate-template");
    }
    if (replacement.refs.some((ref) => resultCovered.has(ref))) {
      return dropped("duplicate-result");
    }
    if (replacement.refs.some((ref) => rankCovered.has(ref))) {
      return dropped("duplicate-rank");
    }
    for (const ref of replacement.refs) templateCovered.add(ref);
    return {
      n,
      outcome: "template",
      reasons,
      line: replacement,
      grammar: null,
    };
  });

  // 3) 방어선 — 원래 순서의 앞 5줄만(출력 줄 1개 → 게시 줄 1개 이하라 실제로는 넘지 않는다)
  let kept = 0;
  const detail = composed.map((d): VerifiedBriefLine => {
    if (!d.line) return d;
    kept += 1;
    if (kept <= BRIEF_MAX_LINES) return d;
    return {
      n: d.n,
      outcome: "dropped",
      reasons: [...d.reasons, "over-max-lines"],
      line: null,
      grammar: null,
    };
  });

  const lines = detail.flatMap((d) => (d.line ? [d.line] : []));
  return {
    lines,
    ai: detail.filter((d) => d.outcome === "ai").length,
    template: detail.filter((d) => d.outcome === "template").length,
    dropped: detail.filter((d) => d.outcome === "dropped").length,
    detail,
  };
}

/** 결과 절(경기 승패·무승부·승부차기·종료 점수) — brief-grammar.ts ClauseType 중 결과 문형 */
export const RESULT_CLAUSE_TYPES: ReadonlySet<ClauseType> = new Set<ClauseType>(
  ["win", "loss", "draw", "pens", "end", "endPens"],
);

/** 순위 절(현재 순위·나열·유지·변동·승점 차) — brief-grammar.ts ClauseType 중 순위 문형 */
export const RANK_CLAUSE_TYPES: ReadonlySet<ClauseType> = new Set<ClauseType>([
  "rank",
  "rankList",
  "keep",
  "move",
  "gap",
]);

function hasClause(
  grammar: string | null,
  types: ReadonlySet<ClauseType>,
): boolean {
  if (!grammar) return false;
  return grammar.split("+").some((type) => types.has(type as ClauseType));
}

/** 검사기 문형 표기('win+rank' — 절 종류를 +로 이음)에 결과 절이 있는가 */
export function isResultGrammar(grammar: string | null): boolean {
  return hasClause(grammar, RESULT_CLAUSE_TYPES);
}

/** 검사기 문형 표기에 순위 절이 있는가('win+rank' 포함) */
export function isRankGrammar(grammar: string | null): boolean {
  return hasClause(grammar, RANK_CLAUSE_TYPES);
}

/** 통과 줄 문형 분포(로그 — M1-23 이월 '게시 줄 문형 분포') — 문형 → 줄 수 */
export function briefGrammarCounts(
  verified: Pick<VerifiedBrief, "detail">,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of verified.detail) {
    if (d.outcome !== "ai") continue;
    const key = d.grammar ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

// ─── 템플릿 강등 원인 ─────────────────────────────────────────────────────

/**
 * LLM을 불렀지만 게시할 LLM 줄이 없는 원인(마지막 판정이 downgrade-all이거나 판정이 없음) —
 *   transport    전송 실패(llm.ts 정책 재시도 뒤 — 429·5xx 소진·연결 오류·API 오류·빈 출력)
 *   refusal      모델 거절(D40 ① — 재시도 없이 템플릿)
 *   max-tokens   마지막 시도까지 출력 잘림(D40 ① — 출력 전체 실패)
 *   output       마지막 시도까지 zod·출력 전체 코드 검증(한국어 비율·한자) 실패
 *   deadline     브리핑 마감 — 재시도할 시간이 없었거나(40초 미만) 마감에 걸린 요청이 끊겼다(FR-26)
 *   check-error  검사기 예상 밖 오류(판정 없음 — 판정 없는 출력은 게시하지 않는다)
 *   daily-cap    FR-29 재시도가 필요했지만 하루 요청 상한(D56 — 남은 몫 1)이라 보내지 않았다
 *   mock-missing 재시도 mock 응답 없음(개발 mock 실행)
 *   client       LLM 클라이언트 생성·요청 오류(키 없음·요청 형식 버그)
 */
export type BriefFailCause =
  | "transport"
  | "refusal"
  | "max-tokens"
  | "output"
  | "deadline"
  | "check-error"
  | "daily-cap"
  | "mock-missing"
  | "client";

/**
 * 마지막 판정 → 원인(순수 함수). `errorType`은 전송 실패의 llm.ts errorType(성공 응답이면 null), `deadlineReached`는 그 시도가
 * 끝난 뒤 마감까지 남은 시간이 없는지(마감으로 줄인 타임아웃에 걸린 연결 오류를 마감으로 본다).
 */
export function briefFailCause(input: {
  judgement: Pick<BriefJudgement, "stage" | "reason"> | null;
  errorType: string | null;
  deadlineReached: boolean;
}): BriefFailCause {
  const { judgement, errorType } = input;
  if (judgement === null) return "check-error";
  if (judgement.stage === "transport") {
    if (errorType === "refusal") return "refusal";
    if (errorType === "max_tokens") return "max-tokens";
    if (errorType === "deadline") return "deadline";
    if (errorType === "connection_error" && input.deadlineReached) {
      return "deadline";
    }
    return "transport";
  }
  return "output";
}

/** 원인 → BriefOutcome failed reason — 출력 전체 실패(output·max-tokens, 재시도를 상한이 막은 daily-cap)는 output, 그 밖은 llm */
export function briefFailReason(cause: BriefFailCause): "llm" | "output" {
  return cause === "output" || cause === "max-tokens" || cause === "daily-cap"
    ? "output"
    : "llm";
}
