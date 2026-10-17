/**
 * `npm run eval:prompt` 실행 흐름 (M1-24 — CLAUDE.md §6.3, PRD §9.2). I/O(파일·LLM·시계·출력)는 deps로 주입한다(테스트는 mock).
 *
 * 흐름(live): 골든셋·지시문 읽기 → 요청 계획 출력(날짜·경기 수·입력 어림) → 이번 달 사용 알림(`noticeMonthlyUsage` — dev 50%)
 *   → 비용 가드(`guardBriefBudget({env:"dev", requests: 고른 날짜 전부, attempts: 1})` — 예상 출력, 일·월 예산 초과면 부르지 않음 —
 *   M1-22 이월) → 날짜마다 단건 1요청(순서대로, D28 설정) → 실행 기록(`data/runs-dev.json` — cost.ts withRecordedRun, runId
 *   `eval-dev-…`, job 칸은 스키마 enum상 "collect") → 판정·기록 `fixtures/llm/golden/runs/<라벨>/run.json` → 기준 실행과 비교 리포트.
 * mock: 같은 흐름에서 LLM 대신 `fixtures/llm/mock/by-id/golden[-pre]-<날짜>.json`(결정적·무비용), 비용 가드·runs 기록 없음,
 *   기본으로 run.json을 쓰지 않는다(`--save`로 쓴다).
 * 골든셋 입력 다시 쓰기(`--build-golden`)·확인(`--check-golden`)은 LLM을 부르지 않는다.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { z } from "zod";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  type CompetitionConfig,
} from "@/lib/schema";
import { kstDate, nowUtcIso } from "@/lib/time";

import { estimateBriefInputTokens, loadBriefPrompt } from "./brief";
import { briefLlmInput, BRIEF_LLM_MAX_MATCHES } from "./brief-input";
import type { BriefCheckContext, BriefCheckInput } from "./brief-check";
import {
  buildEvalRequest,
  evalHiddenRefs,
  evalUserMessage,
  EVAL_VARIANTS,
  evalDayRecord,
  evalPromptId,
  evalSettings,
  evalSystemPrompt,
  EvalRunSchema,
  formatEvalReport,
  summarizeEvalRun,
  type EvalDay,
  type EvalDayInput,
  type EvalRun,
  type EvalVariant,
} from "./brief-eval";
import {
  announceBriefBudget,
  guardBriefBudget,
  noticeMonthlyUsage,
} from "./budget-guard";
import { resolveLlmMode, type LlmMode, type ParseResult } from "./cli-args";
import { readConfigFile } from "./config-files";
import {
  estimateCost,
  formatUsd,
  makeRunId,
  resolveBudgets,
  withRecordedRun,
} from "./cost";
import {
  buildGoldenInput,
  GOLDEN_DIR_REL,
  loadGoldenSet,
  loadGoldenSource,
  serializeGoldenInput,
  type GoldenBuildContext,
  type GoldenSetDay,
} from "./golden";
import {
  LlmMockFixtureError,
  type LlmClient,
  type LlmRequest,
  type LlmResult,
} from "./llm";
import type { Logger } from "./logger";
import {
  buildNameIndex,
  canonicalizeBriefInput,
  playerTeamsFrom,
} from "./names";
import { buildTeamIdIndex, loadTeamIds } from "./team-ids";

// ─── 인자 ────────────────────────────────────────────────────────────────

export interface EvalArgs {
  llmMode: LlmMode;
  /** 호출 없이 계획·예상 비용만 */
  dry: boolean;
  /** 앞에서부터 n일만(--dates 뒤에 적용) */
  limit: number | null;
  /** 이 날짜만(쉼표 구분) */
  dates: string[] | null;
  variant: EvalVariant;
  /** run 폴더 이름 — 없으면 `<KST 날짜>-<variant>-<지시문 id>` */
  label: string | null;
  /** 비교 기준 — 실행 라벨 · "m0"(M0 출력) · "none". 없으면 같은 변형의 가장 최근 실행(없으면 base는 m0, pre는 가장 최근 base) */
  baseline: string | null;
  /** run.json 저장 여부 — 없으면 live만 저장 */
  save: boolean | null;
  /** live 출력을 mock fixture(by-id/<customId>.json)로 저장 — 테스트·--mock 재생용 */
  updateMock: boolean;
  /** 리포트에서 줄별 문장 생략 */
  summaryOnly: boolean;
  /** 지시문 파일(저장소 기준 경로) — 없으면 configs/prompts/summarize.md(파이프라인 지시문). 새 판(v0.2 등)을 파이프라인에 넣기 전에 비교 */
  prompt: string | null;
  /** 저장된 실행(라벨)의 출력을 지금 검사기로 다시 판정 — LLM 호출 없음(검사기 판 비교, D50) */
  rejudge: string | null;
  buildGolden: boolean;
  checkGolden: boolean;
  help: boolean;
}

export const EVAL_USAGE = [
  "사용법: npm run eval:prompt -- [옵션]",
  "  (기본)            골든셋 10일치 브리핑 실호출(dev — data/runs-dev.json 기록) → 판정 → 이전 실행과 비교",
  "  --mock            LLM 대신 fixtures/llm/mock/by-id/golden[-pre]-<날짜>.json (결정적·무비용)",
  "  --dry             호출 없이 요청 계획·예상 비용만",
  "  --limit <n>       앞 n일만 · --dates a,b   이 날짜만(YYYY-MM-DD)",
  "  --variant base|pre  pre = 🧪 사실 선계산 입력(x) + 지시문 덧붙임 (실험 — 파이프라인 불변)",
  "  --label <이름>     run 폴더 이름(fixtures/llm/golden/runs/<이름>/run.json)",
  "  --baseline <라벨|m0|none>  비교 기준(기본: 같은 변형의 최근 실행 → base는 m0, pre는 최근 base)",
  "  --save / --no-save  run.json 저장(기본: live만)",
  "  --update-mock     live 출력을 mock fixture로 저장",
  "  --summary-only    줄별 문장 생략",
  "  --prompt <경로>    지시문 파일(기본 configs/prompts/summarize.md) — 새 지시문 판을 파이프라인에 넣기 전에 비교",
  "  --rejudge <라벨>   저장된 실행의 출력을 지금 검사기로 다시 판정(LLM 없음 — 기준은 원래 실행)",
  "  --build-golden    sources → inputs 다시 쓰기(LLM 없음) · --check-golden  일치 확인",
].join("\n");

/** 실행 라벨(run 폴더 이름) — 첫 글자는 점이 아니고 `..`를 담지 않는다(숨김 폴더·상위 경로 방지) */
const LABEL_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/;

export function isValidEvalLabel(label: string): boolean {
  return LABEL_PATTERN.test(label) && !label.includes("..");
}

/**
 * `--prompt` 경로 검사(순수 함수) — 마크다운(.md)만, `.env*` 파일 이름은 거부(비밀값 파일을 지시문으로 읽어 LLM에 보내지 않게 —
 * CLAUDE.md §1-8). 문제가 없으면 null, 있으면 사유.
 */
export function evalPromptPathError(promptPath: string): string | null {
  const base = path.basename(promptPath);
  if (
    /^\.env/i.test(base) ||
    /(^|[\\/])\.env[^\\/]*([\\/]|$)/i.test(promptPath)
  ) {
    return "--prompt에 .env 파일은 쓸 수 없다";
  }
  if (!/\.md$/i.test(base))
    return "--prompt는 마크다운(.md) 지시문 파일만 받는다";
  return null;
}
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseEvalArgs(
  argv: readonly string[],
  envLlmMode: string | undefined,
): ParseResult<EvalArgs> {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: {
        mock: { type: "boolean", default: false },
        dry: { type: "boolean", default: false },
        limit: { type: "string" },
        dates: { type: "string" },
        variant: { type: "string" },
        label: { type: "string" },
        baseline: { type: "string" },
        save: { type: "boolean" },
        "no-save": { type: "boolean" },
        "update-mock": { type: "boolean", default: false },
        "summary-only": { type: "boolean", default: false },
        prompt: { type: "string" },
        rejudge: { type: "string" },
        "build-golden": { type: "boolean", default: false },
        "check-golden": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const fail = (error: string): ParseResult<EvalArgs> => ({ ok: false, error });
  let limit: number | null = null;
  if (typeof values.limit === "string") {
    if (!/^\d+$/.test(values.limit) || Number(values.limit) < 1) {
      return fail(
        `--limit에는 양의 정수를 넣는다 (받은 값: "${values.limit}")`,
      );
    }
    limit = Number(values.limit);
  }
  let dates: string[] | null = null;
  if (typeof values.dates === "string") {
    dates = values.dates
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    const bad = dates.find((d) => !DATE_PATTERN.test(d));
    if (dates.length === 0 || bad !== undefined) {
      return fail(
        `--dates는 YYYY-MM-DD를 쉼표로 잇는다 (받은 값: "${values.dates}")`,
      );
    }
  }
  const variant = (values.variant ?? "base") as string;
  if (!(EVAL_VARIANTS as readonly string[]).includes(variant)) {
    return fail(
      `--variant는 ${EVAL_VARIANTS.join("·")} 중 하나 (받은 값: "${variant}")`,
    );
  }
  const label = typeof values.label === "string" ? values.label : null;
  if (label !== null && !isValidEvalLabel(label)) {
    return fail(`--label은 영문·숫자·._- 1~64자 (받은 값: "${label}")`);
  }
  const baseline = typeof values.baseline === "string" ? values.baseline : null;
  if (
    baseline !== null &&
    baseline !== "m0" &&
    baseline !== "none" &&
    !isValidEvalLabel(baseline)
  ) {
    return fail(`--baseline은 실행 라벨·m0·none (받은 값: "${baseline}")`);
  }
  const prompt =
    typeof values.prompt === "string" ? values.prompt.trim() : null;
  if (prompt !== null && (prompt === "" || prompt.includes("\0"))) {
    return fail("--prompt에는 지시문 파일 경로를 넣는다");
  }
  const promptError = prompt === null ? null : evalPromptPathError(prompt);
  if (promptError !== null) return fail(promptError);
  const rejudge = typeof values.rejudge === "string" ? values.rejudge : null;
  if (rejudge !== null && !isValidEvalLabel(rejudge)) {
    return fail(
      `--rejudge에는 저장된 실행 라벨을 넣는다 (받은 값: "${rejudge}")`,
    );
  }
  if (
    rejudge !== null &&
    (values["update-mock"] === true || values.dry === true)
  ) {
    return fail(
      "--rejudge는 LLM을 부르지 않는다 — --update-mock·--dry와 함께 쓰지 않는다",
    );
  }
  if (values.save === true && values["no-save"] === true) {
    return fail("--save와 --no-save는 함께 쓸 수 없다");
  }
  const mock = values.mock === true;
  const llmMode = resolveLlmMode(mock, envLlmMode);
  if (!llmMode.ok) return llmMode;
  if (values["update-mock"] === true && llmMode.value === "mock") {
    return fail("--update-mock은 live 실행에서만 쓴다");
  }
  return {
    ok: true,
    value: {
      llmMode: llmMode.value,
      dry: values.dry === true,
      limit,
      dates,
      variant: variant as EvalVariant,
      label,
      baseline,
      save:
        values.save === true ? true : values["no-save"] === true ? false : null,
      updateMock: values["update-mock"] === true,
      summaryOnly: values["summary-only"] === true,
      prompt,
      rejudge,
      buildGolden: values["build-golden"] === true,
      checkGolden: values["check-golden"] === true,
      help: values.help === true,
    },
  };
}

// ─── 설정·골든셋 ──────────────────────────────────────────────────────────

export interface EvalContext {
  competitions: CompetitionConfig[];
  check: BriefCheckContext;
  golden: GoldenBuildContext;
}

/** configs → 판정·골든셋 빌드 재료(collect-run.ts 브리핑 단계와 같은 파일). 설정 오류는 던진다 */
export async function loadEvalContext(rootDir: string): Promise<EvalContext> {
  const competitions = await readConfigFile(
    rootDir,
    "competitions.json",
    CompetitionsFileSchema,
  );
  const names = buildNameIndex(
    await readConfigFile(rootDir, "names.ko.json", NamesKoFileSchema),
    competitions,
  );
  const players = await readConfigFile(
    rootDir,
    "korean-players.json",
    KoreanPlayersFileSchema,
  );
  const team = buildTeamIdIndex(await loadTeamIds(rootDir));
  const koreanTeamIds = new Set<number>();
  for (const p of players) {
    if (!p.active) continue;
    const fd = team.bySlug.get(p.team)?.fd;
    if (fd !== null && fd !== undefined) koreanTeamIds.add(fd);
  }
  return {
    competitions,
    check: { names, competitions },
    golden: {
      competitions,
      koreanTeamIds,
      names,
      playerTeams: playerTeamsFrom(players),
    },
  };
}

export interface GoldenBuildReport {
  date: string;
  /** 저장된 입력과 다르다(없음 포함) */
  changed: boolean;
}

/** 소스 → 입력 파일. write면 다른 것만 다시 쓴다(LLM 없음) */
export async function buildGoldenFiles(
  goldenDir: string,
  ctx: EvalContext,
  options: { write: boolean },
): Promise<GoldenBuildReport[]> {
  const index = z
    .object({ days: z.array(z.object({ date: z.string() })) })
    .parse(
      JSON.parse(await readFile(path.join(goldenDir, "index.json"), "utf8")),
    );
  const out: GoldenBuildReport[] = [];
  for (const { date } of index.days) {
    const source = await loadGoldenSource(goldenDir, date);
    const text = serializeGoldenInput(buildGoldenInput(source, ctx.golden));
    const file = path.join(goldenDir, "inputs", `${date}.json`);
    let current: string | null = null;
    try {
      current = await readFile(file, "utf8");
    } catch {
      current = null;
    }
    const changed = current !== text;
    if (changed && options.write) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, text);
    }
    out.push({ date, changed });
  }
  return out;
}

// ─── 지시문·검사기 판 ─────────────────────────────────────────────────────

/** 파이프라인 지시문(brief.ts BRIEF_PROMPT_PATH와 같다) */
export const DEFAULT_PROMPT_REL = path.join(
  "configs",
  "prompts",
  "summarize.md",
);

/**
 * 검사기 판에 넣는 파일 — 판정 결과를 바꾸는 코드: `scripts/lib/brief-check*.ts`·`brief-grammar*.ts`(검사기·어휘 표·닫힌 문법 —
 * D50, 접두사가 같으면 들어간다) + 출력 파싱(brief.ts)·템플릿 해석(brief-template.ts — matchFacts)·고유명사 치환(names.ts)·조사(josa.ts).
 */
export const CHECKER_FIXED_FILES: readonly string[] = Object.freeze([
  "brief.ts",
  "brief-template.ts",
  "names.ts",
  "josa.ts",
]);

/** 검사기 판 — 위 파일 내용(경로 순)의 sha256 앞 12자리. 같은 코드면 같은 id */
export async function checkerFingerprint(
  rootDir: string,
): Promise<{ id: string; files: string[] }> {
  const libDir = path.join(rootDir, "scripts", "lib");
  const names = (await readdir(libDir))
    .filter((f) => /^brief-(check|grammar)[a-z0-9-]*\.ts$/.test(f))
    .concat(CHECKER_FIXED_FILES)
    .sort();
  const hash = createHash("sha256");
  for (const name of names) {
    hash.update(`${name}\0`);
    hash.update(await readFile(path.join(libDir, name)));
    hash.update("\0");
  }
  return {
    id: `c_${hash.digest("hex").slice(0, 12)}`,
    files: names.map((n) => `scripts/lib/${n}`),
  };
}

/** 설정 판에 넣는 configs 파일 — 판정(고유명사 치환·대회 표기)과 골든셋 입력(입력 정리·중요도)을 바꾸는 설정 */
export const CONFIG_FILES: readonly string[] = Object.freeze([
  "competitions.json",
  "korean-players.json",
  "names.ko.json",
  "team-ids.json",
]);

/**
 * 설정 판 — 위 configs 파일 내용 + LLM 요청 본문 경기 상한(D51)의 sha256 앞 12자리(`g_`). 같은 내용·같은 상한이면 같은 id.
 * 상한 null = 자르지 않음(D51 전 실행·M0 기준선).
 */
export async function configsFingerprint(
  rootDir: string,
  llmMaxMatches: number | null = BRIEF_LLM_MAX_MATCHES,
): Promise<EvalRun["configs"]> {
  const hash = createHash("sha256");
  for (const name of CONFIG_FILES) {
    hash.update(`${name}\0`);
    hash.update(await readFile(path.join(rootDir, "configs", name)));
    hash.update("\0");
  }
  hash.update(`llmMaxMatches=${llmMaxMatches ?? "none"}`);
  return {
    id: `g_${hash.digest("hex").slice(0, 12)}`,
    files: CONFIG_FILES.map((n) => `configs/${n}`),
    llmMaxMatches,
  };
}

/** 이 실행의 판정 판(검사기 + 설정) */
export type EvalVersions = Pick<EvalRun, "checker" | "configs">;

export async function evalVersions(
  rootDir: string,
  llmMaxMatches: number | null = BRIEF_LLM_MAX_MATCHES,
): Promise<EvalVersions> {
  return {
    checker: await checkerFingerprint(rootDir),
    configs: await configsFingerprint(rootDir, llmMaxMatches),
  };
}

/** 지시문 읽기 — `--prompt`(저장소 기준 또는 절대 경로) 또는 파이프라인 지시문. 내용 `.trim()`(brief.ts loadBriefPrompt와 같다) */
export async function loadEvalPrompt(
  rootDir: string,
  promptPath: string | null,
): Promise<{ system: string; rel: string }> {
  if (promptPath === null) {
    return { system: await loadBriefPrompt(rootDir), rel: DEFAULT_PROMPT_REL };
  }
  const error = evalPromptPathError(promptPath);
  if (error !== null) throw new Error(error);
  const abs = path.resolve(rootDir, promptPath);
  const system = (await readFile(abs, "utf8")).trim();
  if (!system)
    throw new Error(`지시문 파일이 비어 있다: ${path.basename(abs)}`);
  const rel = path.relative(rootDir, abs);
  // 저장소 밖 파일은 이름만 남긴다(실행 기록은 공개 저장소에 커밋된다 — 로컬 경로·사용자 이름을 남기지 않게)
  const outside = rel.startsWith("..") || path.isAbsolute(rel);
  return { system, rel: outside ? `(저장소 밖)/${path.basename(abs)}` : rel };
}

// ─── 기준선·이전 실행 ─────────────────────────────────────────────────────

/** M0-30·M0-34 지시문(긴 판 — brief-cases.json request.prompt "m0-30-long") */
export const M0_PROMPT_REL = path.join(
  "fixtures",
  "llm",
  "brief-inputs",
  "prompt-m0-30-long.md",
);

const MockSucceededSchema = z.object({
  type: z.literal("succeeded"),
  text: z.string(),
  stop_reason: z.string().optional(),
  usage: z
    .object({
      input_tokens: z.number().int(),
      output_tokens: z.number().int(),
      cache_read_input_tokens: z.number().int().optional(),
      cache_creation_input_tokens: z.number().int().optional(),
    })
    .optional(),
});

/** M0-30·M0-34 입력(fixtures/llm/brief-inputs — 임시 형식: 순위 prev·한국 선수 korean이 있고 note가 없을 수 있다) */
const M0GoalSchema = z.strictObject({
  min: z.string(),
  team: z.string(),
  player: z.string(),
  assist: z.string().optional(),
  type: z.enum(["penalty", "own_goal"]).optional(),
});
const M0InputSchema = z.strictObject({
  briefDate: z.string(),
  matches: z.array(
    z.strictObject({
      id: z.string(),
      comp: z.string(),
      round: z.string(),
      home: z.string(),
      away: z.string(),
      ft: z.string(),
      ht: z.string().optional(),
      goals: z.array(M0GoalSchema).nullable(),
    }),
  ),
  standings: z.array(
    z.strictObject({
      id: z.string(),
      comp: z.string(),
      // 판정은 note를 읽지 않는다 — 없는 입력(A·D)은 빈 문자열
      note: z.string().default(""),
      rows: z.array(
        z.strictObject({
          pos: z.number().int(),
          team: z.string(),
          played: z.number().int(),
          pts: z.number().int(),
          gd: z.number().int(),
          prev: z.number().int().optional(),
        }),
      ),
    }),
  ),
  korean: z
    .array(
      z.strictObject({
        id: z.string(),
        player: z.string(),
        team: z.string(),
        match: z.string(),
        started: z.boolean(),
        minutes: z.number().int(),
        goals: z.number().int(),
        assists: z.number().int(),
        subOn: z.number().int().optional(),
        subOff: z.number().int().optional(),
      }),
    )
    .optional(),
});

/** M0 입력 → 판정 입력(득점자 입력 정리 — 순위 prev·korean은 그대로) */
function m0CheckInput(raw: unknown, ctx: EvalContext): BriefCheckInput {
  const parsed = M0InputSchema.parse(raw);
  const canonical = canonicalizeBriefInput(parsed, ctx.check.names, {
    playerTeams: ctx.golden.playerTeams,
  }).input;
  return {
    ...canonical,
    standings: parsed.standings,
    ...(parsed.korean ? { korean: parsed.korean } : {}),
  };
}

const BriefCasesInputsSchema = z.object({
  inputs: z.record(z.string(), z.object({ file: z.string() })),
});

/**
 * 'm0' 기준선 — 골든셋 날짜 중 M0 입력 키가 있는 날의 M0 출력(mock/by-id/brief-<날짜>.json)을 그 M0 입력(입력 정리 거침)으로
 * 판정한다. 토큰은 기록값을 **단건·캐시 없음**으로 환산해 비용을 잰다(M0-30은 배치·캐시 실험이 섞여 있다 — 비교용 정가).
 */
export async function m0BaselineRun(
  rootDir: string,
  days: readonly Pick<GoldenSetDay, "date" | "m0">[],
  ctx: EvalContext,
  model: string,
  versions: EvalVersions,
): Promise<EvalRun> {
  const llmDir = path.join(rootDir, "fixtures", "llm");
  const cases = BriefCasesInputsSchema.parse(
    JSON.parse(await readFile(path.join(llmDir, "brief-cases.json"), "utf8")),
  );
  const system = (
    await readFile(path.join(rootDir, M0_PROMPT_REL), "utf8")
  ).trim();
  const out: EvalDay[] = [];
  for (const day of days) {
    if (day.m0 === null) continue;
    const ref = cases.inputs[day.m0];
    if (!ref) continue;
    const raw: unknown = JSON.parse(
      await readFile(path.join(llmDir, ref.file), "utf8"),
    );
    const input = m0CheckInput(raw, ctx);
    let fixtureText: string;
    try {
      fixtureText = await readFile(
        path.join(llmDir, "mock", "by-id", `brief-${day.date}.json`),
        "utf8",
      );
    } catch {
      continue;
    }
    const fixture = MockSucceededSchema.safeParse(JSON.parse(fixtureText));
    if (!fixture.success) continue;
    const u = fixture.data.usage;
    const usage = {
      in:
        (u?.input_tokens ?? 0) +
        (u?.cache_read_input_tokens ?? 0) +
        (u?.cache_creation_input_tokens ?? 0),
      out: u?.output_tokens ?? 0,
      cacheRead: 0,
      cacheWrite: 0,
    };
    out.push(
      evalDayRecord(
        {
          date: day.date,
          customId: `brief-${day.date}`,
          input,
          user: JSON.stringify(raw),
          response: {
            ok: true,
            text: fixture.data.text,
            stopReason: fixture.data.stop_reason ?? "end_turn",
            usage,
            thinkingTokens: 0,
          },
          thinkingKnown: false,
          latencyMs: null,
          model,
        },
        ctx.check,
      ),
    );
  }
  return {
    label: "m0",
    variant: "base",
    mode: "baseline",
    model,
    promptId: evalPromptId(system, "base"),
    prompt: M0_PROMPT_REL,
    promptChars: system.length,
    checker: versions.checker,
    // M0 출력은 자르지 않은 입력(M0 형식)을 봤다 — 상한 없음
    configs: await configsFingerprint(rootDir, null),
    runId: null,
    startedAt: "2026-10-11T00:00:00.000Z",
    finishedAt: "2026-10-11T00:00:00.000Z",
    settings: evalSettings(),
    note: "M0-30·M0-34 지시문(임시 긴 판)의 기존 출력(fixtures/llm/mock/by-id/brief-<날짜>.json)을 그 출력의 원래 입력(fixtures/llm/brief-inputs, 입력 정리 거침)으로 다시 판정 — 토큰은 단건·캐시 없음 환산, thinking·지연 모름",
    days: out,
  };
}

/** 저장된 실행 목록(시작 시각 순) — 형식이 틀린 run.json은 건너뛴다 */
export async function listEvalRuns(goldenDir: string): Promise<EvalRun[]> {
  const runsDir = path.join(goldenDir, "runs");
  let names: string[];
  try {
    names = await readdir(runsDir);
  } catch {
    return [];
  }
  const runs: EvalRun[] = [];
  for (const name of names.sort()) {
    try {
      const parsed = EvalRunSchema.safeParse(
        JSON.parse(
          await readFile(path.join(runsDir, name, "run.json"), "utf8"),
        ),
      );
      if (parsed.success) runs.push(parsed.data);
    } catch {
      // 폴더에 run.json이 없다 — 건너뛴다
    }
  }
  return runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** 기준 실행 고르기(순수 함수) — 머리 주석 `EvalArgs.baseline` */
export function pickBaseline(
  runs: readonly EvalRun[],
  variant: EvalVariant,
  requested: string | null,
  exclude: string | null,
):
  | { kind: "run"; run: EvalRun }
  | { kind: "m0" }
  | { kind: "none" }
  | { kind: "missing"; label: string } {
  if (requested === "none") return { kind: "none" };
  if (requested === "m0") return { kind: "m0" };
  const candidates = runs.filter((r) => r.label !== exclude);
  if (requested !== null) {
    const run = candidates.find((r) => r.label === requested);
    return run ? { kind: "run", run } : { kind: "missing", label: requested };
  }
  const same = candidates.filter((r) => r.variant === variant).at(-1);
  if (same) return { kind: "run", run: same };
  if (variant === "pre") {
    const base = candidates.filter((r) => r.variant === "base").at(-1);
    if (base) return { kind: "run", run: base };
  }
  return { kind: "m0" };
}

// ─── 실행 ────────────────────────────────────────────────────────────────

export interface EvalDeps {
  rootDir: string;
  /** data/ (runs.json·runs-dev.json) */
  dataDir: string;
  /** 골든셋 폴더(기본 <rootDir>/fixtures/llm/golden) — 테스트는 run 저장을 임시 폴더로 돌린다 */
  goldenDir?: string;
  /** run.json을 쓸 폴더(기본 <goldenDir>/runs) */
  runsDir?: string;
  /** mock fixture 폴더(--update-mock이 쓴다, 기본 <rootDir>/fixtures/llm/mock) */
  mockDir?: string;
  args: EvalArgs;
  env: Readonly<Record<string, string | undefined>>;
  model: string;
  createLlm: (model: string) => Pick<LlmClient, "callSingle" | "model">;
  /** 벽시계(기록 시각) */
  now: () => Date;
  /** 지연 측정용 단조 시계(ms) */
  clock: () => number;
  logger: Logger;
  print: (text: string) => void;
}

export interface EvalOutcome {
  /** 0 성공 · 1 설정·입력 오류 · 2 예산 판정으로 호출 안 함 · 3 골든셋 입력이 소스와 다름(--check-golden) */
  exitCode: number;
  run: EvalRun | null;
  runFile: string | null;
  baseline: EvalRun | null;
  report: string | null;
}

/** 출력 토큰이 이 값을 넘는 날이 있으면 경고(D28 — max_tokens 4,096의 여유가 작다, M1-20 이월: 넘으면 멈추고 보고) */
export const EVAL_OUTPUT_ALERT_TOKENS = 3_500;
/** 실행 전 '보통' 예상에 쓰는 요청당 출력 토큰(M0-30·M0-34 실측 1,355~3,231 — thinking 포함) */
export const EVAL_TYPICAL_OUTPUT_TOKENS = 2_500;

function selectDays(
  days: readonly GoldenSetDay[],
  args: EvalArgs,
): GoldenSetDay[] {
  let picked = [...days];
  if (args.dates) {
    const want = new Set(args.dates);
    picked = picked.filter((d) => want.has(d.date));
  }
  if (args.limit !== null) picked = picked.slice(0, args.limit);
  return picked;
}

function defaultLabel(
  startedAt: string,
  variant: EvalVariant,
  promptId: string,
): string {
  return `${kstDate(startedAt)}-${variant}-${promptId.replace(/^p_/, "").slice(0, 8)}`;
}

async function uniqueLabel(runsDir: string, label: string): Promise<string> {
  let names: string[] = [];
  try {
    names = await readdir(runsDir);
  } catch {
    names = [];
  }
  if (!names.includes(label)) return label;
  for (let i = 2; ; i += 1) {
    const next = `${label}-${i}`;
    if (!names.includes(next)) return next;
  }
}

function mockFixtureOf(
  day: EvalDay,
  run: Pick<EvalRun, "label" | "promptId" | "variant">,
) {
  const usage = {
    input_tokens: day.usage.in,
    output_tokens: day.usage.out,
    cache_read_input_tokens: day.usage.cacheRead,
    cache_creation_input_tokens: day.usage.cacheWrite,
  };
  const note = `골든셋 실측(npm run eval:prompt — run ${run.label}, 변형 ${run.variant}, 지시문 ${run.promptId}) — thinking ${day.thinkingTokens ?? "?"}토큰, 지연 ${day.latencyMs === null ? "?" : Math.round(day.latencyMs)}ms, 판정 ${day.verdict}`;
  if (day.ok) {
    return {
      type: "succeeded",
      note,
      text: day.text ?? "",
      stop_reason: day.stopReason ?? "end_turn",
      usage,
    };
  }
  if (day.errorType === "max_tokens" || day.errorType === "refusal") {
    return {
      type: "succeeded",
      note,
      text: "",
      stop_reason: day.errorType,
      usage,
    };
  }
  return {
    type: "errored",
    note,
    error: {
      type: day.errorType ?? "api_error",
      message: "골든셋 실측 실패 재현",
    },
  };
}

/** 저장된 실행 1일 → 판정에 넣는 응답(원래 출력·토큰 그대로) */
function savedResponse(day: EvalDay): EvalDayInput["response"] {
  return day.ok
    ? {
        ok: true,
        text: day.text ?? "",
        stopReason: day.stopReason ?? "end_turn",
        usage: day.usage,
        thinkingTokens: day.thinkingTokens ?? 0,
      }
    : {
        ok: false,
        errorType: day.errorType ?? "api_error",
        usage: day.usage,
        thinkingTokens: day.thinkingTokens ?? 0,
      };
}

/**
 * `--rejudge <라벨>` — 저장된 실행의 출력을 **지금 검사기**로 다시 판정한다(LLM 호출·비용 없음, runs-dev 기록 없음). 판정 입력은 지금
 * 골든셋 입력이고, 원래 실행 때와 입력이 다르면(입력 해시) 그 날은 리포트에 '입력 다름'으로 표시된다. 기준선은 원래 실행 —
 * 같은 출력에 대해 검사기 판만 바뀐 차이가 나온다(D50 닫힌 문법 재설계 비교용). 토큰·비용·지연은 원래 실행 값(새로 쓴 비용 없음).
 */
async function rejudgeRun(
  deps: EvalDeps,
  env: {
    goldenDir: string;
    runsDir: string;
    ctx: EvalContext;
    set: Awaited<ReturnType<typeof loadGoldenSet>>;
    versions: EvalVersions;
  },
): Promise<EvalOutcome> {
  const { args } = deps;
  const runs = await listEvalRuns(env.goldenDir);
  const original = runs.find((r) => r.label === args.rejudge);
  if (!original) {
    deps.print(`[eval] --rejudge: 저장된 실행 "${args.rejudge}"이 없다`);
    return {
      exitCode: 1,
      run: null,
      runFile: null,
      baseline: null,
      report: null,
    };
  }
  const inputs = new Map(env.set.days.map((d) => [d.date, d.input] as const));
  const want = args.dates ? new Set(args.dates) : null;
  let picked = original.days.filter(
    (d) => inputs.has(d.date) && (want === null || want.has(d.date)),
  );
  if (args.limit !== null) picked = picked.slice(0, args.limit);
  const startedAt = nowUtcIso(deps.now());
  // 원래 실행이 모델에 보낸 범위로 판정한다 — D51 전 실행(상한 기록 없음)은 자르지 않은 입력을 봤다
  const cap = original.configs.llmMaxMatches ?? null;
  const versions: EvalVersions = {
    checker: env.versions.checker,
    configs: await configsFingerprint(deps.rootDir, cap),
  };
  const days = picked.map((d) =>
    evalDayRecord(
      {
        date: d.date,
        customId: d.customId,
        input: inputs.get(d.date)!,
        user:
          // 입력 해시는 지금 골든셋 입력 기준(원래와 다르면 리포트가 '입력 다름'으로 표시)
          evalUserMessage(inputs.get(d.date)!, original.variant, cap),
        hiddenRefs: evalHiddenRefs(inputs.get(d.date)!, cap),
        response: savedResponse(d),
        thinkingKnown: d.thinkingTokens !== null,
        latencyMs: d.latencyMs,
        model: original.model,
      },
      env.ctx.check,
    ),
  );
  const label =
    args.label ??
    (await uniqueLabel(
      env.runsDir,
      `${original.label}.rj-${env.versions.checker.id.slice(2, 10)}`.slice(
        0,
        64,
      ),
    ));
  const run: EvalRun = {
    ...original,
    label,
    mode: "rejudge",
    runId: null,
    startedAt,
    finishedAt: nowUtcIso(deps.now()),
    ...versions,
    rejudgedFrom: original.label,
    note: `${original.label}(${original.mode}, 검사기 ${original.checker.id} · 설정 ${original.configs.id})의 출력을 검사기 ${versions.checker.id} · 설정 ${versions.configs.id}로 다시 판정 — LLM 호출 없음, 토큰·비용·지연은 원래 실행 값`,
    days,
  };
  let runFile: string | null = null;
  if (args.save === true) {
    runFile = path.join(env.runsDir, label, "run.json");
    await mkdir(path.dirname(runFile), { recursive: true });
    await writeFile(
      runFile,
      `${JSON.stringify(EvalRunSchema.parse(run), null, 2)}\n`,
    );
  }
  const report = formatEvalReport(run, original, {
    lines: !args.summaryOnly,
  });
  deps.print(report);
  if (runFile) {
    deps.print(`[eval] 재판정 기록 ${path.relative(deps.rootDir, runFile)}`);
  }
  return { exitCode: 0, run, runFile, baseline: original, report };
}

/** eval:prompt 본체 — 던지지 않는 오류는 exitCode로 돌려준다(설정·입력 오류는 던진다) */
export async function runEvalPrompt(deps: EvalDeps): Promise<EvalOutcome> {
  const { args } = deps;
  const goldenDir = deps.goldenDir ?? path.join(deps.rootDir, GOLDEN_DIR_REL);
  const runsDir = deps.runsDir ?? path.join(goldenDir, "runs");
  const mockDir =
    deps.mockDir ?? path.join(deps.rootDir, "fixtures", "llm", "mock");
  const none: EvalOutcome = {
    exitCode: 0,
    run: null,
    runFile: null,
    baseline: null,
    report: null,
  };
  const ctx = await loadEvalContext(deps.rootDir);

  if (args.buildGolden || args.checkGolden) {
    const reports = await buildGoldenFiles(goldenDir, ctx, {
      write: args.buildGolden,
    });
    const changed = reports.filter((r) => r.changed).map((r) => r.date);
    deps.print(
      args.buildGolden
        ? `[golden] 입력 ${reports.length}일 중 ${changed.length}일 다시 씀${changed.length ? ` (${changed.join(", ")})` : ""}`
        : `[golden] 입력 ${reports.length}일 확인 — 소스와 다른 날 ${changed.length}일${changed.length ? ` (${changed.join(", ")}) → npm run eval:prompt -- --build-golden` : ""}`,
    );
    return {
      ...none,
      exitCode: args.checkGolden && changed.length > 0 ? 3 : 0,
    };
  }

  const set = await loadGoldenSet(goldenDir);
  const versions = await evalVersions(deps.rootDir);
  if (args.rejudge !== null) {
    return rejudgeRun(deps, { goldenDir, runsDir, ctx, set, versions });
  }
  const days = selectDays(set.days, args);
  if (days.length === 0) {
    deps.print("[eval] 고른 날짜가 없다 — --dates·--limit 확인");
    return { ...none, exitCode: 1 };
  }
  const { system, rel: promptRel } = await loadEvalPrompt(
    deps.rootDir,
    args.prompt,
  );
  if (args.llmMode === "mock" && args.prompt !== null) {
    deps.print(
      "[eval] 주의: mock은 지시문과 관계없이 by-id 응답(golden[-pre]-<날짜>)을 재생한다 — --prompt 비교는 live 실행으로",
    );
  }
  const requests: LlmRequest[] = days.map((d) =>
    buildEvalRequest(d, system, args.variant),
  );
  const promptId = evalPromptId(system, args.variant);
  const startedAt = nowUtcIso(deps.now());

  // 계획 — 날짜·경기 수·입력 어림(지시문 + 입력, brief.ts estimateBriefInputTokens)
  const inputEstimate = requests.map((r) => estimateBriefInputTokens(r));
  deps.print(
    [
      `[eval] 골든셋 ${days.length}/${set.days.length}일 · 변형 ${args.variant} · 지시문 ${promptId}(${evalSystemPrompt(system, args.variant).length}자 · ${promptRel}) · 검사기 ${versions.checker.id} · 설정 ${versions.configs.id} · ${deps.model} · ${args.llmMode}${args.dry ? " · dry(호출 없음)" : ""}`,
      `[eval] 설정 D28 — 단건 · max_tokens ${requests[0]!.maxTokens} · thinking ${requests[0]!.thinking} · effort ${requests[0]!.effort} · 캐싱 끔 · 첫 시도만(FR-29 재시도 없음) · LLM 본문 경기 상한 ${BRIEF_LLM_MAX_MATCHES}(D51)`,
      ...days.map(
        (d, i) =>
          `[eval]   ${d.date}  경기 ${String(d.input.matches.length).padStart(2)}(LLM 본문 ${briefLlmInput(d.input).input.matches.length}) · 입력 ${requests[i]!.user.length}자 · 입력 어림 ${inputEstimate[i]}토큰 · ${d.tags.join(",")}`,
      ),
    ].join("\n"),
  );

  if (args.llmMode === "live") {
    const at = new Date(startedAt);
    await noticeMonthlyUsage({
      env: "dev",
      logger: deps.logger,
      print: deps.print,
      dataDir: deps.dataDir,
      at,
      resolveBudgets: () => resolveBudgets(deps.env),
    });
    const typical = estimateCost({
      model: deps.model,
      requests: requests.length,
      avgInputTokens:
        inputEstimate.reduce((a, b) => a + b, 0) / requests.length,
      avgOutputTokens: EVAL_TYPICAL_OUTPUT_TOKENS,
      batch: false,
    });
    deps.print(
      `[cost] 보통 예상 — 입력 ${typical.tokens.in.toLocaleString("en-US")} · 출력 ${typical.tokens.out.toLocaleString("en-US")}(요청당 ${EVAL_TYPICAL_OUTPUT_TOKENS} 가정, thinking 포함) → ${formatUsd(typical.usd)}`,
    );
    const decision = await guardBriefBudget({
      env: "dev",
      requests,
      model: deps.model,
      budgets: resolveBudgets(deps.env),
      at,
      dataDir: deps.dataDir,
      attempts: 1,
    });
    announceBriefBudget(decision, {
      env: "dev",
      logger: deps.logger,
      print: deps.print,
    });
    if (!decision.allowed) {
      deps.print(
        `[eval] 예산 판정으로 호출하지 않는다 — ${decision.message} (날짜를 나눠 --dates로 실행)`,
      );
      return { ...none, exitCode: 2 };
    }
  }
  if (args.dry) return none;

  const llm = deps.createLlm(deps.model);
  const runId = makeRunId({ env: "dev", job: "collect", startedAt }).replace(
    /^collect-/,
    "eval-",
  );
  const recorded = await withRecordedRun(
    {
      env: "dev",
      job: "collect",
      model: deps.model,
      mode: args.llmMode,
      runId,
      startedAt,
      dataDir: deps.dataDir,
      clock: deps.now,
    },
    async (recorder) => {
      const records: EvalDay[] = [];
      for (const [i, day] of days.entries()) {
        const request = requests[i]!;
        const t0 = deps.clock();
        let result: LlmResult;
        try {
          result = await llm.callSingle(request);
        } catch (error) {
          if (error instanceof LlmMockFixtureError) {
            throw new LlmMockFixtureError(
              `${error.message}\n  → 골든셋 mock은 live 실행의 --update-mock으로 만든다`,
            );
          }
          throw error;
        }
        const latencyMs = deps.clock() - t0;
        recorder.addResults([result]);
        const record = evalDayRecord(
          {
            date: day.date,
            customId: request.customId,
            input: day.input,
            user: request.user,
            hiddenRefs: evalHiddenRefs(day.input, BRIEF_LLM_MAX_MATCHES),
            response: result.ok
              ? {
                  ok: true,
                  text: result.text,
                  stopReason: result.stopReason,
                  usage: result.usage,
                  thinkingTokens: result.thinkingTokens,
                }
              : {
                  ok: false,
                  errorType: result.errorType,
                  usage: result.usage,
                  thinkingTokens: result.thinkingTokens,
                },
            thinkingKnown: args.llmMode === "live",
            latencyMs: args.llmMode === "live" ? latencyMs : null,
            model: deps.model,
          },
          ctx.check,
        );
        records.push(record);
        deps.print(
          `[eval]   ${day.date} → ${record.ok ? record.verdict : `실패 ${record.errorType}`} · 출력 ${record.usage.out}${record.thinkingTokens === null ? "" : `(thinking ${record.thinkingTokens})`} · ${formatUsd(record.costUsd)}${record.latencyMs === null ? "" : ` · ${(record.latencyMs / 1000).toFixed(1)}s`}`,
        );
      }
      const summary = summarizeEvalRun({ days: records, model: deps.model });
      return {
        value: records,
        fields: {
          status: summary.requestsOk === records.length ? "success" : "partial",
          summarized: summary.lines.passed,
          downgraded: summary.lines.downgraded,
        },
      };
    },
  );

  const finishedAt = nowUtcIso(deps.now());
  const save = args.save ?? args.llmMode === "live";
  const label =
    args.label ??
    (await uniqueLabel(
      runsDir,
      defaultLabel(startedAt, args.variant, promptId),
    ));
  const run: EvalRun = {
    label,
    variant: args.variant,
    mode: args.llmMode,
    model: deps.model,
    promptId,
    prompt: promptRel,
    promptChars: evalSystemPrompt(system, args.variant).length,
    ...versions,
    runId: recorded.record.persisted ? recorded.record.run.runId : null,
    startedAt,
    finishedAt,
    settings: evalSettings(),
    ...(args.variant === "pre"
      ? {
          note: "🧪 사실 선계산 변형 — 입력에 x(brief-precompute.ts), 지시문 뒤에 x 설명. 판정은 확정 입력 기준",
        }
      : {}),
    days: recorded.value,
  };
  let runFile: string | null = null;
  if (save) {
    runFile = path.join(runsDir, label, "run.json");
    await mkdir(path.dirname(runFile), { recursive: true });
    await writeFile(
      runFile,
      `${JSON.stringify(EvalRunSchema.parse(run), null, 2)}\n`,
    );
  }
  if (args.updateMock) {
    await mkdir(path.join(mockDir, "by-id"), { recursive: true });
    for (const day of run.days) {
      await writeFile(
        path.join(mockDir, "by-id", `${day.customId}.json`),
        `${JSON.stringify(mockFixtureOf(day, run), null, 2)}\n`,
      );
    }
  }

  const picked = pickBaseline(
    await listEvalRuns(goldenDir),
    args.variant,
    args.baseline,
    label,
  );
  let baseline: EvalRun | null = null;
  if (picked.kind === "run") baseline = picked.run;
  else if (picked.kind === "m0")
    baseline = await m0BaselineRun(
      deps.rootDir,
      days,
      ctx,
      deps.model,
      versions,
    );
  else if (picked.kind === "missing")
    deps.print(`[eval] 기준 실행 "${picked.label}"이 없다 — 비교 없이 출력`);
  const report = formatEvalReport(run, baseline, { lines: !args.summaryOnly });
  deps.print(report);
  const over = run.days.filter((d) => d.usage.out > EVAL_OUTPUT_ALERT_TOKENS);
  if (over.length > 0) {
    deps.print(
      `[eval] 경고: 출력 토큰이 ${EVAL_OUTPUT_ALERT_TOKENS}을 넘은 날 ${over.map((d) => `${d.date}(${d.usage.out})`).join(", ")} — max_tokens ${requests[0]!.maxTokens} 여유가 작다(D28). 지시문 축소 또는 max_tokens 상향은 사용자 승인 사항`,
    );
  }
  if (recorded.record.persisted) {
    deps.print(
      `[cost] 기록 ${recorded.record.path} — runId ${recorded.record.run.runId} · 토큰 입력 ${recorded.record.run.tokens.in} · 출력 ${recorded.record.run.tokens.out} · ${formatUsd(recorded.record.run.costUsd)}`,
    );
  }
  if (runFile)
    deps.print(`[eval] 실행 기록 ${path.relative(deps.rootDir, runFile)}`);
  return { exitCode: 0, run, runFile, baseline, report };
}
