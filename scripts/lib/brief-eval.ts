/**
 * 브리핑 골든셋 회귀 평가 — 순수 함수 (M1-24, `npm run eval:prompt` — CLAUDE.md §6.3·PRD §9.2).
 *
 * 한 번의 실행(run) = 골든셋 날짜마다 브리핑 요청 1건(D28·D57 설정 그대로 — 단건·max_tokens 16,384·요청 타임아웃 120초·thinking
 * 적응형·effort medium·캐싱 끔, 첫 시도만 — FR-29 재시도는 보내지 않는다) → 출력 원문 → M1-23 판정(`judgeBriefResponse` 첫 시도 기준)·고유명사 치환 뒤
 * 문장·줄별 사유 코드 → 같은 근거의 템플릿 줄(`templateLineForRefs`, 비교용). 실행 기록(`EvalRun`)은
 * `fixtures/llm/golden/runs/<라벨>/run.json`에 남고, 리포트는 기준 실행(이전 실행 또는 M0 출력)과 날짜별로 비교한다:
 * 줄 수·판정·사유 코드·길이(치환 뒤)·출력 토큰(thinking)·비용·지연, 줄별 문장(이전/이후/템플릿).
 *
 * 기준선 'm0' (M1-20 이월): 새로 부르지 않고 M0-30·M0-34 지시문의 기존 출력(fixtures/llm/mock/by-id/brief-<날짜>.json)을 그 출력의
 * 원래 입력(fixtures/llm/brief-inputs — canonicalizeBriefInput을 거친 입력)으로 판정한다. 골든셋 입력(확정 빌더 출력)과 순서·키가
 * 달라 M0 출력을 골든셋 입력으로 판정하면 공정하지 않다.
 *
 * 변형 'pre'(🧪 실험 — brief-precompute.ts): 같은 날짜·같은 지시문 + x 설명, 입력에 코드 계산값 x를 더한다. 판정은 확정 입력으로
 * 한다(x는 확정 입력에서 계산한 값이라 같은 사실 집합).
 */
import { createHash } from "node:crypto";

import { z } from "zod";

import {
  briefLlmInput,
  BRIEF_LLM_MAX_MATCHES,
  serializeBriefInput,
  type BriefInput,
} from "./brief-input";
import {
  briefPromptId,
  buildBriefRequest,
  parseBriefOutput,
  BRIEF_EFFORT,
  BRIEF_MAX_TOKENS,
  BRIEF_REQUEST_TIMEOUT_MS,
  BRIEF_THINKING,
} from "./brief";
import {
  briefCheckLogFields,
  judgeBriefResponse,
  type BriefCheckContext,
  type BriefCheckInput,
  type BriefJudgement,
} from "./brief-check";
import {
  PRECOMPUTE_PROMPT_ADDENDUM,
  withPrecomputedFacts,
} from "./brief-precompute";
import {
  briefNamesFromIndex,
  templateBriefLines,
  templateLineForRefs,
  type BriefTemplateContext,
} from "./brief-template";
import { costFromResults, formatUsd } from "./cost";
import type { LlmRequest, TokenUsage } from "./llm";

// ─── 요청 ────────────────────────────────────────────────────────────────

export const EVAL_VARIANTS = ["base", "pre"] as const;
export type EvalVariant = (typeof EVAL_VARIANTS)[number];

/**
 * 골든셋 요청 customId — mock은 `fixtures/llm/mock/by-id/<customId>.json`을 찾는다. 발행일 id(`brief-<날짜>` — M0 출력)와 겹치지 않게
 * 접두사를 다르게 둔다. 단건 호출의 customId는 API로 보내지 않는다(로그·mock 조회만).
 */
export function evalCustomId(date: string, variant: EvalVariant): string {
  return variant === "base" ? `golden-${date}` : `golden-pre-${date}`;
}

/** 변형별 지시문 — base는 v0.1 그대로, pre는 x 설명을 덧붙인다 */
export function evalSystemPrompt(system: string, variant: EvalVariant): string {
  return variant === "pre"
    ? `${system}\n\n${PRECOMPUTE_PROMPT_ADDENDUM}`
    : system;
}

/** 변형별 user 메시지 — base는 확정 입력 그대로(봇과 같은 문자열), pre는 x를 더한 입력 */
export function evalUserMessage(
  input: BriefInput,
  variant: EvalVariant,
  /** LLM 요청 본문 경기 상한(D51 — 기본 15). null이면 자르지 않는다(D51 이전 실행 재판정용) */
  llmMaxMatches: number | null = BRIEF_LLM_MAX_MATCHES,
): string {
  const sent =
    llmMaxMatches === null ? input : briefLlmInput(input, llmMaxMatches).input;
  return variant === "pre"
    ? JSON.stringify(withPrecomputedFacts(sent))
    : serializeBriefInput(sent);
}

/** 모델이 보지 못한 근거 id(D51) — 상한이 없으면 빈 집합 */
export function evalHiddenRefs(
  input: BriefInput,
  llmMaxMatches: number | null,
): Set<string> {
  return llmMaxMatches === null
    ? new Set()
    : briefLlmInput(input, llmMaxMatches).hiddenRefs;
}

/**
 * 날짜 1개의 요청(순수 함수) — 브리핑 요청(brief.ts `buildBriefRequest` — D28 설정)에서 customId·변형만 바꾼다.
 * 지시문 캐싱은 켜지 않는다(봇의 하루 1요청과 같은 조건 — 비용·토큰을 그대로 비교).
 */
export function buildEvalRequest(
  day: { date: string; input: BriefInput },
  system: string,
  variant: EvalVariant,
  llmMaxMatches: number = BRIEF_LLM_MAX_MATCHES,
): LlmRequest {
  const base = buildBriefRequest(
    day.input,
    evalSystemPrompt(system, variant),
    llmMaxMatches,
  );
  return {
    ...base,
    customId: evalCustomId(day.date, variant),
    user: evalUserMessage(day.input, variant, llmMaxMatches),
  };
}

/** user 메시지 해시(입력이 바뀌었는지 실행 사이에 비교) — `i_` + sha256 앞 12자리 */
export function evalInputHash(user: string): string {
  return `i_${createHash("sha256").update(user, "utf8").digest("hex").slice(0, 12)}`;
}

// ─── 실행 기록 ───────────────────────────────────────────────────────────

const UsageSchema = z.strictObject({
  in: z.number().int().nonnegative(),
  out: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
});

export const EvalLineSchema = z.strictObject({
  n: z.number().int().positive(),
  /** 모델 원문 문장 */
  raw: z.string(),
  /** 고유명사 치환·조사 보정 뒤 문장(M1-45가 게시할 문장) */
  text: z.string(),
  refs: z.array(z.string()),
  /** 치환 뒤 글자 수 */
  chars: z.number().int().nonnegative(),
  ok: z.boolean(),
  /** 강등 사유 'code(detail)' */
  reasons: z.array(z.string()),
  warnings: z.array(z.string()),
  /** 같은 근거의 템플릿 줄(줄 단위 강등 때 대신 들어갈 문장 — 비교용) */
  template: z.string().nullable(),
  /** 검사기가 고른 문형(닫힌 문법 — 'win+korean', 문법 밖이면 null). D50 전 실행에는 없다 */
  grammar: z.string().nullable().optional(),
});
export type EvalLine = z.infer<typeof EvalLineSchema>;

export const EvalDaySchema = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customId: z.string(),
  inputHash: z.string(),
  matches: z.number().int().nonnegative(),
  userChars: z.number().int().nonnegative(),
  ok: z.boolean(),
  stopReason: z.string().nullable(),
  errorType: z.string().nullable(),
  /** 모델 원문 출력(성공했을 때) */
  text: z.string().nullable(),
  usage: UsageSchema,
  /** usage.out 중 thinking 토큰 — 응답이 알려 주지 않았으면 null(mock·M0 기준선) */
  thinkingTokens: z.number().int().nonnegative().nullable(),
  /** 요청 지연(ms) — 모르면 null */
  latencyMs: z.number().nonnegative().nullable(),
  costUsd: z.number().nonnegative(),
  /** FR-29 판정(첫 시도) — 'ok' · 'retry' · 'downgrade-all' · 'downgrade-line:1,4' */
  verdict: z.string(),
  stage: z.string(),
  reason: z.string().nullable(),
  lineReasons: z.record(z.string(), z.array(z.string())),
  lineWarnings: z.record(z.string(), z.array(z.string())),
  lines: z.array(EvalLineSchema),
  /** 모델이 보지 못한 근거 id(D51 — 요청 본문에서 잘린 경기·순위). D51 전 실행에는 없다 */
  hiddenRefs: z.array(z.string()).optional(),
  /** 그날 입력의 템플릿 브리핑(전체 강등 때 게시될 문장 — 비교용) */
  template: z.array(z.string()),
});
export type EvalDay = z.infer<typeof EvalDaySchema>;

export const EvalRunSchema = z.strictObject({
  label: z.string().min(1),
  variant: z.enum(EVAL_VARIANTS),
  /**
   * live = 실호출 · mock = fixtures/llm/mock · baseline = 기존 출력(M0)을 다시 판정 · rejudge = 저장된 실행의 출력을 지금 검사기로
   * 다시 판정(LLM 호출 없음 — 검사기를 바꾼 뒤 같은 출력으로 비교, D50)
   */
  mode: z.enum(["live", "mock", "baseline", "rejudge"]),
  model: z.string(),
  /** 지시문 판 id(`p_` + sha256 앞 12자리 — 변형 덧붙임까지 포함한 실제 system) */
  promptId: z.string(),
  /** 지시문 출처(저장소 경로 — `--prompt`로 바꿀 수 있다) */
  prompt: z.string(),
  promptChars: z.number().int().nonnegative(),
  /**
   * 검사기 판 — 판정에 쓴 코드 파일 내용의 해시(`c_` + sha256 앞 12자리)와 파일 목록. 지시문과 검사기를 따로 바꿔 비교할 수 있게
   * 실행마다 남긴다(eval-prompt-run.ts `checkerFingerprint`).
   */
  checker: z.strictObject({
    id: z.string().regex(/^c_[0-9a-f]{12}$/),
    files: z.array(z.string()).min(1),
  }),
  /**
   * 판정에 쓴 설정 판 — configs 파일(names.ko·competitions·korean-players·team-ids) 내용의 해시(`g_` + sha256 앞 12자리)와 파일 목록.
   * 고유명사 치환(names.ko)·대회 표기·중요도(korean-players·team-ids)가 판정과 골든셋 입력을 바꾸므로 검사기 판과 함께 남긴다
   * (eval-prompt-run.ts `configsFingerprint` — 저장 실측과의 판정 비교는 두 판이 모두 같을 때만).
   */
  configs: z.strictObject({
    id: z.string().regex(/^g_[0-9a-f]{12}$/),
    files: z.array(z.string()).min(1),
    /** LLM 요청 본문 경기 상한(D51 — id 해시에 들어간다). 없으면(D51 전 실행) 상한 없음(빌더 30) */
    llmMaxMatches: z.number().int().positive().nullable().optional(),
  }),
  /** rejudge 실행의 원래 실행 라벨 */
  rejudgedFrom: z.string().optional(),
  /** runs-dev.json runId(live) — mock·기준선은 null */
  runId: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string(),
  settings: z.strictObject({
    maxTokens: z.number().int(),
    /** HTTP 요청 타임아웃 상한(ms, D57 — 120초). 이 칸이 생기기 전 실행에는 없다(그때는 클라이언트 기본 60초) */
    requestTimeoutMs: z.number().int().positive().optional(),
    thinking: z.string(),
    effort: z.string(),
    cacheSystem: z.boolean(),
    /** FR-29 재시도 없이 첫 시도만 */
    attempts: z.literal(1),
  }),
  note: z.string().optional(),
  /**
   * 출력 경고 — 출력 토큰이 경고 기준(eval-prompt-run.ts `EVAL_OUTPUT_ALERT_TOKENS` 6,000)을 넘은 날. 멈추지 않고 기록만 한다
   * (사용자 결정 2026-10-17 — 멈춤은 잘림만). 이 칸이 생기기 전 실행에는 없다
   */
  warnings: z
    .array(
      z.strictObject({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        code: z.literal("output-over-alert"),
        out: z.number().int().nonnegative(),
        limit: z.number().int().positive(),
      }),
    )
    .optional(),
  days: z.array(EvalDaySchema),
});
export type EvalRun = z.infer<typeof EvalRunSchema>;
export type EvalRunWarning = NonNullable<EvalRun["warnings"]>[number];

/** 판정에 넣는 응답 모양(llm.ts `LlmResult`의 부분 — M0 기준선도 같은 모양으로 만든다) */
export type EvalResponse =
  | {
      ok: true;
      text: string;
      stopReason: string;
      usage: TokenUsage;
      thinkingTokens: number;
    }
  | {
      ok: false;
      errorType: string;
      usage: TokenUsage;
      thinkingTokens: number;
    };

export interface EvalDayInput {
  date: string;
  customId: string;
  /** 판정 기준 입력(확정 입력 — pre 변형도 x 없는 입력) */
  input: BriefCheckInput;
  /** 보낸 user 메시지(해시·길이) */
  user: string;
  response: EvalResponse;
  /** thinkingTokens를 모르면(mock·M0) null로 기록 */
  thinkingKnown: boolean;
  /** 모델이 보지 못한 근거 id(D51 — evalHiddenRefs). 없으면 입력 전체를 본 것으로 판정 */
  hiddenRefs?: ReadonlySet<string>;
  latencyMs: number | null;
  model: string;
}

function issueText(issue: { code: string; detail?: string }): string {
  return issue.detail ? `${issue.code}(${issue.detail})` : issue.code;
}

/** 날짜 1개의 결과 → 기록(순수 함수). 판정은 첫 시도 기준(FR-29 재시도 대상이면 'retry') */
export function evalDayRecord(
  day: EvalDayInput,
  ctx: BriefCheckContext,
): EvalDay {
  const r = day.response;
  const judgement: BriefJudgement = judgeBriefResponse(
    r.ok ? { ok: true, text: r.text } : { ok: false, errorType: r.errorType },
    day.input,
    ctx,
    { hiddenRefs: day.hiddenRefs },
  );
  const fields = briefCheckLogFields(judgement);
  const tctx: BriefTemplateContext = {
    competitions: ctx.competitions,
    names: briefNamesFromIndex(ctx.names),
  };
  const parsed = r.ok ? parseBriefOutput(r.text) : null;
  const check = judgement.check;
  const lines: EvalLine[] =
    parsed?.ok && check
      ? parsed.lines.map((line, i) => {
          const lc = check.lines[i]!;
          const text = check.substitutions[i]!.text;
          return {
            n: i + 1,
            raw: line.t,
            text,
            refs: line.r,
            chars: text.length,
            ok: lc.ok,
            reasons: lc.reasons.map(issueText),
            warnings: lc.warnings.map(issueText),
            template:
              templateLineForRefs(day.input, line.r, tctx)?.text ?? null,
            grammar: lc.grammar,
          };
        })
      : [];
  return {
    date: day.date,
    customId: day.customId,
    inputHash: evalInputHash(day.user),
    matches: day.input.matches.length,
    userChars: day.user.length,
    ok: r.ok,
    stopReason: r.ok ? r.stopReason : null,
    errorType: r.ok ? null : r.errorType,
    text: r.ok ? r.text : null,
    usage: { ...r.usage },
    thinkingTokens: day.thinkingKnown ? r.thinkingTokens : null,
    latencyMs: day.latencyMs,
    costUsd: costFromResults(day.model, [{ usage: r.usage, batch: false }]),
    verdict: fields.verdict,
    stage: fields.stage,
    reason: fields.reason,
    lineReasons: fields.lineReasons,
    lineWarnings: fields.lineWarnings,
    lines,
    ...(day.hiddenRefs ? { hiddenRefs: [...day.hiddenRefs] } : {}),
    template: templateBriefLines(day.input, tctx).map((l) => l.text),
  };
}

/** 실행 설정 기록(D28·D57 그대로 — 바꾸면 사용자 승인) */
export function evalSettings(): EvalRun["settings"] {
  return {
    maxTokens: BRIEF_MAX_TOKENS,
    requestTimeoutMs: BRIEF_REQUEST_TIMEOUT_MS,
    thinking: BRIEF_THINKING,
    effort: BRIEF_EFFORT,
    cacheSystem: false,
    attempts: 1,
  };
}

/** 지시문 판 id(brief.ts와 같은 규칙) — 변형 덧붙임까지 포함한 실제 system으로 */
export function evalPromptId(system: string, variant: EvalVariant): string {
  return briefPromptId(evalSystemPrompt(system, variant));
}

// ─── 요약 ────────────────────────────────────────────────────────────────

/** 게시 결과로 본 판정 분류 — ok = LLM 줄 전부(llm) · mixed = 일부 줄 강등 · lines-all = 줄 단위로 모두 강등 · retry · downgrade-all */
export type EvalVerdictClass =
  "ok" | "mixed" | "lines-all" | "retry" | "downgrade-all";

export function verdictClass(
  day: Pick<EvalDay, "verdict" | "lines">,
): EvalVerdictClass {
  if (day.verdict === "ok") return "ok";
  if (day.verdict === "retry") return "retry";
  if (day.verdict === "downgrade-all") return "downgrade-all";
  return day.lines.some((l) => l.ok) ? "mixed" : "lines-all";
}

export interface EvalSummary {
  days: number;
  requestsOk: number;
  verdicts: Record<EvalVerdictClass, number>;
  lines: { total: number; passed: number; downgraded: number };
  /** 사유 코드별 강등 줄 수(한 줄에 같은 코드는 한 번) */
  reasons: Record<string, number>;
  warnings: Record<string, number>;
  tokens: TokenUsage & { thinking: number | null; maxOut: number };
  costUsd: number;
  latencyMs: { avg: number | null; max: number | null };
  chars: { avg: number | null; max: number | null };
  /** '챔피언스리그'(공식 표기 아님 — D40 ④) 사유로 강등된 줄 수 */
  uclShortForm: number;
}

const codeOf = (issue: string) => issue.replace(/\(.*$/, "");

/**
 * 실행 요약(순수 함수). 비용 합계는 날짜별 반올림 값을 더하지 않고 전체 usage로 한 번 계산한다(cost.ts `costFromResults` — runs-dev.json
 * 기록과 같은 값, 단건 정가).
 */
export function summarizeEvalRun(
  run: Pick<EvalRun, "days" | "model">,
): EvalSummary {
  const verdicts: Record<EvalVerdictClass, number> = {
    ok: 0,
    mixed: 0,
    "lines-all": 0,
    retry: 0,
    "downgrade-all": 0,
  };
  const reasons: Record<string, number> = {};
  const warnings: Record<string, number> = {};
  let total = 0;
  let passed = 0;
  let uclShortForm = 0;
  const tokens = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };
  let thinking: number | null = 0;
  let maxOut = 0;
  const latencies: number[] = [];
  const chars: number[] = [];
  for (const day of run.days) {
    verdicts[verdictClass(day)] += 1;
    for (const line of day.lines) {
      total += 1;
      if (line.ok) passed += 1;
      chars.push(line.chars);
      for (const code of new Set(line.reasons.map(codeOf))) {
        reasons[code] = (reasons[code] ?? 0) + 1;
      }
      for (const code of new Set(line.warnings.map(codeOf))) {
        warnings[code] = (warnings[code] ?? 0) + 1;
      }
      if (
        line.reasons.some((r) =>
          r.startsWith("ko-name-unofficial(챔피언스리그"),
        )
      ) {
        uclShortForm += 1;
      }
    }
    tokens.in += day.usage.in;
    tokens.out += day.usage.out;
    tokens.cacheRead += day.usage.cacheRead;
    tokens.cacheWrite += day.usage.cacheWrite;
    maxOut = Math.max(maxOut, day.usage.out);
    thinking =
      thinking === null || day.thinkingTokens === null
        ? null
        : thinking + day.thinkingTokens;
    if (day.latencyMs !== null) latencies.push(day.latencyMs);
  }
  const avg = (xs: number[]) =>
    xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    days: run.days.length,
    requestsOk: run.days.filter((d) => d.ok).length,
    verdicts,
    lines: { total, passed, downgraded: total - passed },
    reasons,
    warnings,
    tokens: { ...tokens, thinking, maxOut },
    costUsd: costFromResults(
      run.model,
      run.days.map((d) => ({ usage: d.usage, batch: false })),
    ),
    latencyMs: {
      avg: avg(latencies),
      max: latencies.length ? Math.max(...latencies) : null,
    },
    chars: { avg: avg(chars), max: chars.length ? Math.max(...chars) : null },
    uclShortForm,
  };
}

// ─── 리포트 ──────────────────────────────────────────────────────────────

function n(x: number): string {
  return x.toLocaleString("en-US");
}

function sec(ms: number | null): string {
  return ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`;
}

function outText(day: EvalDay | undefined): string {
  if (!day) return "—";
  const think =
    day.thinkingTokens === null ? "" : `(t${n(day.thinkingTokens)})`;
  return `${n(day.usage.out)}${think}`;
}

function linesText(day: EvalDay | undefined): string {
  if (!day) return "—";
  const down = day.lines.filter((l) => !l.ok).length;
  return `${day.lines.length}/${down}`;
}

function topCounts(record: Record<string, number>, limit = 12): string {
  const entries = Object.entries(record).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  if (entries.length === 0) return "없음";
  return entries
    .slice(0, limit)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");
}

function summaryLine(label: string, s: EvalSummary): string {
  const v = s.verdicts;
  return [
    `${label}: 요청 ${s.requestsOk}/${s.days} 성공 · 판정 ok ${v.ok} · mixed ${v.mixed} · 줄 전부 강등 ${v["lines-all"]} · retry ${v.retry} · downgrade-all ${v["downgrade-all"]}`,
    `   줄 ${s.lines.total}(통과 ${s.lines.passed} · 강등 ${s.lines.downgraded}) · 길이 평균 ${s.chars.avg === null ? "—" : s.chars.avg.toFixed(1)}자 · 최대 ${s.chars.max ?? "—"}자`,
    `   토큰 입력 ${n(s.tokens.in + s.tokens.cacheRead + s.tokens.cacheWrite)} · 출력 ${n(s.tokens.out)}(thinking ${s.tokens.thinking === null ? "모름" : n(s.tokens.thinking)}) · 최대 출력 ${n(s.tokens.maxOut)} · 비용 ${formatUsd(s.costUsd)} · 지연 평균 ${sec(s.latencyMs.avg)} · 최대 ${sec(s.latencyMs.max)}`,
    `   강등 사유(줄 수): ${topCounts(s.reasons)}`,
    `   경고(줄 수): ${topCounts(s.warnings)}`,
    `   '챔피언스리그' 약칭 강등: ${s.uclShortForm}줄`,
  ].join("\n");
}

/**
 * 비교 리포트(사람용 여러 줄 — 끝 개행 없음). before가 없으면 이번 실행만. 날짜별 표 → 합계 → 줄별 문장(이전/이후/템플릿).
 */
export function formatEvalReport(
  after: EvalRun,
  before: EvalRun | null,
  options: { lines?: boolean } = {},
): string {
  const out: string[] = [];
  const head = (r: EvalRun) =>
    `${r.label} (${r.mode}, ${r.variant}, 지시문 ${r.promptId} · ${n(r.promptChars)}자 · ${r.prompt}, 검사기 ${r.checker.id}, ${r.model}${r.rejudgedFrom ? `, ${r.rejudgedFrom} 출력 재판정` : ""})`;
  out.push(
    `== 골든셋 회귀 비교 — 이후 ${head(after)}${before ? `\n   이전 ${head(before)}` : " — 기준선 없음"}`,
  );
  out.push(
    "날짜        경기  이전 판정              이후 판정              줄/강등(전→후)  출력 토큰(전→후, t=thinking)  비용(후)    지연(후)",
  );
  const beforeByDate = new Map(before?.days.map((d) => [d.date, d]) ?? []);
  for (const day of after.days) {
    const prev = beforeByDate.get(day.date);
    const inputNote =
      prev && prev.inputHash !== day.inputHash ? " · 입력 다름" : "";
    out.push(
      [
        day.date,
        String(day.matches).padStart(4),
        `  ${(prev?.verdict ?? "—").padEnd(22)}`,
        (day.ok ? day.verdict : `${day.verdict}(${day.errorType})`).padEnd(22),
        `${linesText(prev)} → ${linesText(day)}`.padEnd(15),
        `${outText(prev)} → ${outText(day)}`.padEnd(29),
        formatUsd(day.costUsd).padEnd(11),
        `${sec(day.latencyMs)}${inputNote}`,
      ].join(" "),
    );
  }
  out.push("");
  out.push(summaryLine("이후", summarizeEvalRun(after)));
  if (before) {
    const shared = new Set(after.days.map((d) => d.date));
    const beforeShared = {
      model: before.model,
      days: before.days.filter((d) => shared.has(d.date)),
    };
    out.push(
      summaryLine(
        `이전(같은 날짜 ${beforeShared.days.length}일)`,
        summarizeEvalRun(beforeShared),
      ),
    );
    if (beforeShared.days.length > 0) {
      const afterShared = {
        model: after.model,
        days: after.days.filter((d) => beforeByDate.has(d.date)),
      };
      out.push(
        summaryLine(
          `이후(같은 날짜 ${afterShared.days.length}일)`,
          summarizeEvalRun(afterShared),
        ),
      );
    }
  }
  if (options.lines !== false) {
    for (const day of after.days) {
      const prev = beforeByDate.get(day.date);
      out.push("");
      out.push(
        `── ${day.date} (경기 ${day.matches}) 판정 ${prev ? `${prev.verdict} → ` : ""}${day.verdict}`,
      );
      if (!day.ok) out.push(`   이후 실패: ${day.errorType}`);
      const count = Math.max(day.lines.length, prev?.lines.length ?? 0);
      for (let i = 0; i < count; i += 1) {
        const a = day.lines[i];
        const b = prev?.lines[i];
        if (b) {
          out.push(
            `   L${i + 1} 이전: ${b.text}  [${b.ok ? "통과" : `강등 ${b.reasons.join(", ")}`}]`,
          );
        }
        if (a) {
          out.push(
            `   L${i + 1} 이후: ${a.text}  (${a.chars}자 · ${a.refs.join(",")}) [${a.ok ? "통과" : `강등 ${a.reasons.join(", ")}`}${a.warnings.length ? ` · 경고 ${a.warnings.join(", ")}` : ""}]`,
          );
          if (!a.ok && a.template) out.push(`      → 템플릿: ${a.template}`);
        }
      }
      if (day.lines.length === 0 && day.template.length > 0) {
        out.push(`   (LLM 줄 없음 — 템플릿) ${day.template.join(" / ")}`);
      }
    }
  }
  return out.join("\n");
}
