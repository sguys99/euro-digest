/**
 * 일일 브리핑 파일 `data/briefs/YYYY-MM-DD.json` (M1-19 — PRD §15 D38). 파일 형식은 src/lib/schema/brief.ts `BriefFileSchema`.
 *
 * - 게시 계획(`planBriefPublish`, 순수): 이번 실행의 브리핑 결과(collect-run.ts `BriefOutcome`) + 정형 입력 → mode·줄.
 *   LLM 출력이 FR-29 판정 ok·downgrade-line을 받으면(M1-45) 검증 통과 줄 + 줄 단위 템플릿 강등(brief-publish.ts
 *   `composeVerifiedBrief`)을 게시한다 — 모든 줄 AI면 `llm`, 섞이면 `mixed`. 통과 줄이 하나도 없으면 같은 입력의 전체 템플릿
 *   (`template`, reason all-lines-downgraded). 경기가 없으면 `empty`(줄 0개 — 호출 생략, D30 5줄 블록 유지). 예산 초과(M1-22 —
 *   verdict 셋 다)·마감(FR-26)·LLM 실패·refusal·출력 전체 실패(재시도 뒤)·검사기 오류·사전 읽기 실패·mock 응답 없음·브리핑 설정
 *   오류도 같은 템플릿(FR-26·FR-27·FR-29). 정형 입력이 없으면(football-data 키 없음·실패, 설정 읽기 실패) 파일을 만들지 않는다 —
 *   전날 파일이 아니라 그날 파일이 없는 상태(화면 상태 4종의 오류·빈 상태, M1-32).
 * - 같은 날 다시 실행(`decideBriefWrite`, 순수): 기존 파일이 `llm`·`mixed`면 **덮지 않는다**(단 mock 실행이 쓴 파일은 예외 — 다음
 *   실행이 덮는다, `isMockBriefFile` M1-45)(이미 비용을 쓴 검증 통과 브리핑 —
 *   공개 뒤 문장이 바뀌지 않게, 백업·수동 실행이 LLM을 다시 부르지도 않는다 — collect-run.ts가 LLM 전에 같은 판정으로 건너뜀).
 *   줄이 있는 `template`은 새 결과가 `llm`·`mixed`이거나 줄 수가 더 많은 `template`일 때만 갱신한다(뒤 실행이 LLM에 성공했거나
 *   경기를 더 받은 경우) — 줄 수가 같거나 적은 template·empty로는 바꾸지 않는다(공개된 브리핑의 내용이 바뀌거나 줄지 않게,
 *   오케스트레이터 결정 2026-10-16). `empty`는 줄 있는 결과로 갱신한다. 내용(mode·줄)이 같으면 다시 쓰지 않는다(generatedAt만
 *   바뀌는 data 커밋 방지). 기존 파일이 깨져 있으면 경고하고 새 파일로 고친다(브리핑이 발행을 막지 않게).
 * - 쓰기: 스키마 검증 → 임시 파일 → rename(원자적). 검증에 걸리는 파일은 쓰지 않는다 — 검증 게이트(`npm run validate`)가 브리핑
 *   하나 때문에 그날 발행 전체를 막지 않게.
 */
import { randomBytes } from "node:crypto";
import * as fsPromises from "node:fs/promises";
import path from "node:path";

import {
  BriefFileSchema,
  type BriefFile,
  type BriefLine,
  type BriefMode,
  type RunLog,
} from "@/lib/schema";

/** data/ 아래 브리핑 폴더 */
export const BRIEF_DIR_REL = "briefs";

export function briefFilePath(dataDir: string, date: string): string {
  return path.join(dataDir, BRIEF_DIR_REL, `${date}.json`);
}

/** 같은 날 재실행이 덮지 않는 mode(검증을 통과한 LLM 줄이 있다) */
export function isKeptBriefMode(mode: BriefMode): boolean {
  return mode === "llm" || mode === "mixed";
}

export interface BriefFileRead {
  exists: boolean;
  /** 스키마를 통과한 내용 — 없거나 깨졌으면 null */
  value: BriefFile | null;
  /** 읽기·JSON·스키마 오류(없으면 null — 파일이 없는 것은 오류가 아니다) */
  error: string | null;
}

/** 기존 브리핑 파일 읽기 — 던지지 않는다 */
export async function readBriefFile(
  dataDir: string,
  date: string,
): Promise<BriefFileRead> {
  let text: string;
  try {
    text = await fsPromises.readFile(briefFilePath(dataDir, date), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, value: null, error: null };
    }
    return {
      exists: true,
      value: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { exists: true, value: null, error: "JSON 형식 오류" };
  }
  const parsed = BriefFileSchema.safeParse(json);
  if (!parsed.success) {
    return {
      exists: true,
      value: null,
      error: `스키마 오류: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
        .join("; ")}`,
    };
  }
  if (parsed.data.date !== date) {
    return {
      exists: true,
      value: null,
      error: `date(${parsed.data.date})가 파일명(${date})과 다르다`,
    };
  }
  return { exists: true, value: parsed.data, error: null };
}

export class BriefFileError extends Error {
  override name = "BriefFileError";
}

/**
 * 브리핑 파일 만들기 — 스키마 검증(키 순서 고정 — 줄은 text·ai·refs·comps). 통과하지 못하면 BriefFileError.
 * 줄의 `comps`(D58)는 호출부가 채운 것을 그대로 옮긴다(brief-comps.ts `withBriefComps` — 없으면 키 없음).
 */
export function buildBriefFile(input: {
  date: string;
  generatedAt: string;
  runId: string;
  mode: BriefMode;
  lines: readonly BriefLine[];
}): BriefFile {
  const parsed = BriefFileSchema.safeParse({
    date: input.date,
    generatedAt: input.generatedAt,
    runId: input.runId,
    mode: input.mode,
    lines: input.lines.map((l) => ({
      text: l.text,
      ai: l.ai,
      refs: [...l.refs],
      ...(l.comps ? { comps: [...l.comps] } : {}),
    })),
  });
  if (!parsed.success) {
    throw new BriefFileError(
      `브리핑 파일 검증 실패: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

export type BriefWriteDecision =
  | { action: "write" }
  /**
   * kept-llm = 기존 파일이 llm·mixed(덮지 않음) · kept-template = 기존 줄 있는 template을 줄 수가 같거나 적은 template·empty로
   * 바꾸지 않음(공개 뒤 내용 고정)
   */
  | { action: "keep"; reason: "kept-llm" | "kept-template" }
  /** mode·줄이 같다(다시 쓰지 않음) */
  | { action: "unchanged" };

/**
 * 기존 llm·mixed 파일이 **mock 실행**이 쓴 것인가(M1-45 리뷰 권장 5) — 그 파일을 쓴 실행(runId)의 기록이 runs.json·runs-dev.json에
 * 있고 LLM 토큰이 0이면 mock 응답 줄이다(live LLM 줄은 과금 토큰 없이 생기지 않는다 — 검증 통과 줄은 응답을 받은 시도에서만 나온다).
 * mock 비dry 실행은 데이터 API를 불러 기록이 남는다(collect-run.ts shouldRecordRun). 기록을 찾지 못하면(읽기 실패·보존 기간 밖·
 * 손으로 만든 파일) false — 보수적으로 live 브리핑으로 보고 덮지 않는다.
 */
export function isMockBriefFile(
  file: Pick<BriefFile, "mode" | "runId">,
  runs: ReadonlyArray<Pick<RunLog, "runId" | "tokens">>,
): boolean {
  if (!isKeptBriefMode(file.mode)) return false;
  const run = runs.find((r) => r.runId === file.runId);
  if (!run) return false;
  const t = run.tokens;
  return t.in + t.out + t.cacheRead + t.cacheWrite === 0;
}

/**
 * 같은 날 재실행 판정(순수 함수) — 머리 주석. `existingMock`이면(isMockBriefFile — mock 실행이 쓴 llm·mixed) 기존 파일을 지키지
 * 않고 새 결과로 덮는다(다음 live 실행이 mock 줄을 바꾼다 — M1-45 리뷰 권장 5).
 */
export function decideBriefWrite(
  existing: Pick<BriefFile, "mode" | "lines"> | null,
  next: Pick<BriefFile, "mode" | "lines">,
  options: { existingMock?: boolean } = {},
): BriefWriteDecision {
  if (existing === null) return { action: "write" };
  if (isKeptBriefMode(existing.mode) && options.existingMock) {
    return existing.mode === next.mode &&
      JSON.stringify(existing.lines) === JSON.stringify(next.lines)
      ? { action: "unchanged" }
      : { action: "write" };
  }
  if (isKeptBriefMode(existing.mode)) {
    return { action: "keep", reason: "kept-llm" };
  }
  if (
    existing.mode === next.mode &&
    JSON.stringify(existing.lines) === JSON.stringify(next.lines)
  ) {
    return { action: "unchanged" };
  }
  if (existing.mode === "template" && existing.lines.length > 0) {
    const upgrade =
      isKeptBriefMode(next.mode) ||
      (next.mode === "template" && next.lines.length > existing.lines.length);
    return upgrade
      ? { action: "write" }
      : { action: "keep", reason: "kept-template" };
  }
  return { action: "write" };
}

export function serializeBriefFile(file: BriefFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** 검증 → 임시 파일 → rename. 쓰는 도중 실패해도 기존 파일이 반쯤 쓰인 채로 남지 않는다 */
export async function writeBriefFile(
  dataDir: string,
  file: BriefFile,
): Promise<string> {
  const valid = BriefFileSchema.parse(file);
  const target = briefFilePath(dataDir, valid.date);
  await fsPromises.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await fsPromises.writeFile(tmp, serializeBriefFile(valid), "utf8");
    await fsPromises.rename(tmp, target);
  } catch (error) {
    await fsPromises.rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
  return target;
}

// ─── 게시 계획 ───────────────────────────────────────────────────────────

/**
 * 템플릿으로 게시하는 이유 — budget = 비용 가드(M1-22) · deadline = 브리핑 마감(FR-26 — 첫 호출·재시도 시간 부족, 마감에 걸린 요청) ·
 * llm-failed = LLM 전송 실패(429·5xx 소진·연결 오류·API 오류·클라이언트 오류) · refusal = 모델 거절(D40 ①) ·
 * output-failed = 출력 전체 실패(zod·한국어 비율·한자·max_tokens — FR-29 재시도 뒤) · check-failed = 검사기 예상 밖 오류(판정 없음) ·
 * names-unreadable = 고유명사 사전을 읽지 못함(M1-45 결정 — LLM 없이 템플릿) · daily-cap = 하루 요청 상한(D56 — 그날 3요청을
 * 이미 썼거나 FR-29 재시도 몫이 없음) · mock-missing = mock 응답 없음(개발) ·
 * setup-failed = 브리핑 설정·지시문 오류 · all-lines-downgraded = LLM 출력은 판정을 받았지만 통과 줄이 없다(줄 단위 강등만) ·
 * unverified = LLM은 끝났지만 검증 결과(`verified`)가 넘어오지 않았다(방어선 — 정상 경로에서는 생기지 않는다)
 */
export type BriefTemplateReason =
  | "budget"
  | "deadline"
  | "llm-failed"
  | "refusal"
  | "output-failed"
  | "check-failed"
  | "names-unreadable"
  | "daily-cap"
  | "mock-missing"
  | "setup-failed"
  | "all-lines-downgraded"
  | "unverified";

/**
 * 브리핑 단계 결과 중 게시 계획에 필요한 것(collect-run.ts BriefOutcome과 같은 모양). failed의 `cause`는 LLM을 부른 뒤 템플릿으로
 * 간 원인(brief-publish.ts `BriefFailCause`) — 없으면 reason으로 정한다.
 */
export type BriefStageResult =
  | { state: "done" }
  | { state: "skipped"; reason: string }
  | { state: "failed"; reason: string; cause?: string };

/** 검증을 통과한 게시 줄(brief-publish.ts `composeVerifiedBrief` 결과의 필요한 부분) */
export interface VerifiedBriefLines {
  lines: readonly BriefLine[];
  /** ai:true 줄 수 */
  ai: number;
}

export type BriefPublishPlan =
  | { mode: "empty"; reason: "no-matches"; lines: [] }
  /** 검증 통과 LLM 줄(+ 줄 단위 템플릿 강등) — M1-45 */
  | { mode: "llm" | "mixed"; reason: "verified"; lines: BriefLine[] }
  | { mode: "template"; reason: BriefTemplateReason; lines: BriefLine[] }
  /** 파일을 만들지 않는다 — kept = 기존 llm·mixed 유지, no-input = 정형 입력 없음, no-lines = 템플릿 줄을 하나도 못 만듦 */
  | { mode: null; reason: "kept" | "no-input" | "no-lines" };

const CAUSE_REASONS: Readonly<Record<string, BriefTemplateReason>> = {
  refusal: "refusal",
  deadline: "deadline",
  "max-tokens": "output-failed",
  output: "output-failed",
  "check-error": "check-failed",
  "daily-cap": "daily-cap",
  "mock-missing": "mock-missing",
  transport: "llm-failed",
  client: "llm-failed",
};

/** 템플릿 이유(순수 함수) — 브리핑 단계 결과 → 머리 주석의 이유 */
export function briefTemplateReason(
  brief: BriefStageResult,
  verified: VerifiedBriefLines | null,
): BriefTemplateReason {
  if (brief.state === "done") {
    return verified ? "all-lines-downgraded" : "unverified";
  }
  if (brief.state === "skipped") {
    switch (brief.reason) {
      case "budget":
        return "budget";
      case "deadline":
        return "deadline";
      case "names-unreadable":
        return "names-unreadable";
      case "daily-cap":
        return "daily-cap";
      case "mock-fixture-missing":
        return "mock-missing";
      default:
        return "llm-failed";
    }
  }
  const byCause = brief.cause ? CAUSE_REASONS[brief.cause] : undefined;
  if (byCause) return byCause;
  if (brief.reason === "output") return "output-failed";
  if (brief.reason === "setup") return "setup-failed";
  return "llm-failed";
}

/**
 * 게시 계획(순수 함수) — 머리 주석. `templateLines`는 같은 입력의 템플릿 줄(brief-template.ts `templateBriefLines`),
 * `inputMatches`는 입력 경기 수(정형 입력이 없으면 null), `verified`는 FR-29 판정 ok·downgrade-line 출력의 게시 줄(M1-45 —
 * brief-publish.ts `composeVerifiedBrief`, done일 때만).
 */
export function planBriefPublish(input: {
  brief: BriefStageResult;
  inputMatches: number | null;
  templateLines: readonly BriefLine[];
  verified?: VerifiedBriefLines | null;
}): BriefPublishPlan {
  const { brief, inputMatches } = input;
  const verified = input.verified ?? null;
  if (brief.state === "skipped" && brief.reason === "kept") {
    return { mode: null, reason: "kept" };
  }
  if (inputMatches === null) return { mode: null, reason: "no-input" };
  if (inputMatches === 0)
    return { mode: "empty", reason: "no-matches", lines: [] };
  if (brief.state === "done" && verified && verified.ai > 0) {
    return {
      mode: verified.ai === verified.lines.length ? "llm" : "mixed",
      reason: "verified",
      lines: [...verified.lines],
    };
  }
  const reason = briefTemplateReason(brief, verified);
  if (input.templateLines.length === 0) {
    return { mode: null, reason: "no-lines" };
  }
  return { mode: "template", reason, lines: [...input.templateLines] };
}
