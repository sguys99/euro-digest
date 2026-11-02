/**
 * `npm run eval:prompt -- --team-profile` — 팀 프로필 골든셋 10팀 회귀 비교 (M4-06 — PRD §9.2 '샘플 10건', CLAUDE.md §6.3).
 * 지시문(configs/prompts/team-profile.md)·검사기(team-profile.ts)를 바꿀 때 **같은 10팀 지표**로 출력과 판정을 이전 실행과 비교한다.
 *
 * - 골든셋: `fixtures/llm/golden-team/inputs.json` — 팀 지표 스냅숏(team-profile.ts buildTeamMetrics 결과를 그대로 얼린 것, 기사·이름 없음).
 *   `--build-golden`이 지금 data/competitions·data/teams에서 GOLDEN_TEAM_SLUGS로 다시 쓴다(LLM 없음). 평소 실행은 파일만 읽는다.
 * - 실행: 10팀 = 묶음 1개(요청 1건, customId `team-profile-golden-g1`) — 파이프라인과 같은 요청 설정(Batches·지시문 캐싱·max_tokens
 *   16,384·thinking 적응형 + effort medium). 판정은 파이프라인과 같은 judgeGroup.
 * - live(기본): 예상 최악 비용 출력 → 이번 달 사용 알림(dev 50%) → 비용 가드(env dev — runs.json + runs-dev.json) → 배치 → 실행 기록
 *   (`data/runs-dev.json`, job weekly, runId `eval-team-…` — cost.ts withRecordedRun) → `fixtures/llm/golden-team/runs/<라벨>.json` →
 *   이전 실행과 팀별 diff. `--update-mock`이면 출력을 mock fixture(`fixtures/llm/mock/by-id/team-profile-golden-g1.json`)로 쓴다.
 * - `--mock`: 같은 흐름에서 mock fixture 재생(결정적·무비용, 기록 없음, 기본 저장 안 함). `--dry`: 계획·예상 비용만.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { z } from "zod";

import {
  CompIdSchema,
  CompetitionsFileSchema,
  NamesKoFileSchema,
} from "@/lib/schema";
import { nowUtcIso } from "@/lib/time";

import { noticeMonthlyUsage } from "./budget-guard";
import { resolveLlmMode, type LlmMode, type ParseResult } from "./cli-args";
import { readConfigFile } from "./config-files";
import {
  checkBudgetFromFiles,
  formatUsd,
  makeRunId,
  resolveBudgets,
  withRecordedRun,
} from "./cost";
import { LlmMockFixtureError, type LlmClient, type LlmResult } from "./llm";
import type { Logger } from "./logger";
import { buildNameIndex } from "./names";
import { readCompetitionFiles, readPreviousTeams } from "./team-files-io";
import {
  TEAM_PROFILE_PROMPT_PATH,
  buildProfileRequest,
  buildTeamMetrics,
  estimateProfileWorstCase,
  groupTeams,
  judgeGroup,
  profileNameList,
  type MetricsBlock,
  type TeamMetrics,
  type TeamOutcome,
} from "./team-profile";

export const GOLDEN_TEAM_DIR_REL = path.join("fixtures", "llm", "golden-team");
export const GOLDEN_TEAM_LABEL = "golden";
const MOCK_BY_ID_REL = path.join("fixtures", "llm", "mock", "by-id");
/** eval 배치 폴링 마감(시작 + 15분) — 파이프라인 창과 별개(개발 도구) */
const EVAL_BATCH_WINDOW_MS = 15 * 60_000;

/**
 * 골든 10팀(2026-11-02 스냅숏) — 덮는 유형: 리그 선두·UCL 병행(arsenal) · 최다 득점·UCL(barcelona) · 5연승(atletico-madrid) ·
 * 무패 선두(lazio) · 무패·최다 득점(bayern-munchen) · 무승부가 많은 중위권(hull-city) · 중위권·UCL(napoli) · 경기 목록이 순위표와
 * 어긋나 홈/원정 값이 없는 팀(eintracht-frankfurt — D60) · 무승·5연패 최하위(le-havre) · 무승 최하위(malaga).
 */
export const GOLDEN_TEAM_SLUGS: readonly string[] = Object.freeze([
  "arsenal",
  "barcelona",
  "atletico-madrid",
  "lazio",
  "bayern-munchen",
  "hull-city",
  "napoli",
  "eintracht-frankfurt",
  "le-havre",
  "malaga",
]);

// ─── 골든셋 파일 ─────────────────────────────────────────────────────────

const FormSchema = z.enum(["W", "D", "L"]);
const VenueSchema = z.strictObject({
  p: z.number(),
  w: z.number(),
  d: z.number(),
  l: z.number(),
  gf: z.number(),
  ga: z.number(),
});
const BlockSchema = z.strictObject({
  pos: z.number(),
  n: z.number(),
  p: z.number(),
  w: z.number(),
  d: z.number(),
  l: z.number(),
  gf: z.number(),
  ga: z.number(),
  gd: z.number(),
  pts: z.number(),
  gfR: z.number(),
  gaR: z.number(),
  band: z.enum(["top", "mid", "bottom"]),
  zone: z.enum(["relegation", "knockout", "playoff", "out"]).optional(),
  form: z.array(FormSchema).max(5),
  home: VenueSchema.optional(),
  away: VenueSchema.optional(),
  run: z.strictObject({ r: FormSchema, n: z.number() }).optional(),
  unb: z.number().optional(),
  wl: z.number().optional(),
  cs: z.number().optional(),
  fts: z.number().optional(),
  big: z.number().optional(),
}) satisfies z.ZodType<MetricsBlock>;

export const GoldenTeamFileSchema = z.strictObject({
  builtAt: z.string(),
  /** 스냅숏 출처(대회 파일 updatedAt) */
  source: z.record(z.string(), z.string()),
  teams: z.array(
    z.strictObject({
      slug: z.string(),
      comp: CompIdSchema,
      lg: BlockSchema,
      ucl: BlockSchema.nullable(),
    }),
  ),
});
export type GoldenTeamFile = z.infer<typeof GoldenTeamFileSchema>;

const RunTeamSchema = z.strictObject({
  slug: z.string(),
  id: z.string(),
  reason: z.string(),
  detail: z.string().optional(),
  o: z.string().nullable(),
  s: z.array(z.string()).nullable(),
  w: z.array(z.string()).nullable(),
});

export const GoldenTeamRunSchema = z.strictObject({
  label: z.string(),
  at: z.string(),
  mode: z.enum(["live", "mock"]),
  model: z.string(),
  /** 지시문 판 — 본문 sha 앞 12자리 */
  prompt: z.string(),
  ok: z.boolean(),
  error: z.string().optional(),
  usage: z
    .strictObject({
      in: z.number(),
      out: z.number(),
      cacheRead: z.number(),
      cacheWrite: z.number(),
      thinking: z.number(),
    })
    .nullable(),
  costUsd: z.number().nullable(),
  runId: z.string().nullable(),
  passed: z.number(),
  teams: z.array(RunTeamSchema),
});
export type GoldenTeamRun = z.infer<typeof GoldenTeamRunSchema>;

// ─── 인자 ────────────────────────────────────────────────────────────────

export interface TeamEvalArgs {
  mock: boolean;
  dry: boolean;
  label: string | null;
  save: boolean | null;
  updateMock: boolean;
  buildGolden: boolean;
  prompt: string | null;
  llmMode: LlmMode;
  help: boolean;
}

export const TEAM_EVAL_USAGE = [
  "사용법: npm run eval:prompt -- --team-profile [옵션]",
  "  (기본)            골든 10팀 팀 프로필 실호출(Batches 1요청, dev — data/runs-dev.json 기록) → 판정 → 이전 실행과 비교",
  "  --mock            fixtures/llm/mock/by-id/team-profile-golden-g1.json 재생(결정적·무비용)",
  "  --dry             호출 없이 계획·예상 비용만",
  "  --label <이름>     실행 파일 이름(fixtures/llm/golden-team/runs/<이름>.json, 기본 날짜-시각)",
  "  --save / --no-save  실행 파일 저장(기본: live만)",
  "  --update-mock     live 출력을 mock fixture로 저장",
  "  --prompt <경로>    지시문 파일(기본 configs/prompts/team-profile.md)",
  "  --build-golden    지금 data/에서 골든 10팀 지표 스냅숏 다시 쓰기(LLM 없음)",
].join("\n");

const LABEL_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/;

export function parseTeamEvalArgs(
  argv: readonly string[],
  envLlmMode: string | undefined,
): ParseResult<TeamEvalArgs> {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args: argv.filter((a) => a !== "--team-profile"),
      strict: true,
      allowPositionals: false,
      options: {
        mock: { type: "boolean", default: false },
        dry: { type: "boolean", default: false },
        label: { type: "string" },
        save: { type: "boolean" },
        "no-save": { type: "boolean" },
        "update-mock": { type: "boolean", default: false },
        "build-golden": { type: "boolean", default: false },
        prompt: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const label = typeof values.label === "string" ? values.label : null;
  if (label !== null && (!LABEL_PATTERN.test(label) || label.includes(".."))) {
    return { ok: false, error: "--label은 영문·숫자·._-만(64자 이내)" };
  }
  const prompt = typeof values.prompt === "string" ? values.prompt : null;
  if (
    prompt !== null &&
    (/(^|[\\/])\.env/i.test(prompt) || !/\.md$/i.test(prompt))
  ) {
    return { ok: false, error: "--prompt는 마크다운(.md) 지시문만(.env 금지)" };
  }
  const mock = values.mock === true;
  const mode = resolveLlmMode(mock, envLlmMode);
  if (!mode.ok) return mode;
  if (values["update-mock"] === true && mode.value !== "live") {
    return { ok: false, error: "--update-mock은 live 실행에서만" };
  }
  return {
    ok: true,
    value: {
      mock,
      dry: values.dry === true,
      label,
      save:
        values["no-save"] === true ? false : values.save === true ? true : null,
      updateMock: values["update-mock"] === true,
      buildGolden: values["build-golden"] === true,
      prompt,
      llmMode: mode.value,
      help: values.help === true,
    },
  };
}

// ─── 실행 ────────────────────────────────────────────────────────────────

export interface TeamEvalDeps {
  rootDir: string;
  dataDir: string;
  args: TeamEvalArgs;
  env: Readonly<Record<string, string | undefined>>;
  model: string;
  createLlm: (model: string) => LlmClient;
  now: () => Date;
  logger: Logger;
  print: (text: string) => void;
}

export interface TeamEvalOutcome {
  exitCode: 0 | 1 | 2;
  run: GoldenTeamRun | null;
}

function shortHash(text: string): string {
  // FNV-1a 32비트 ×2 — 지시문 판 표시용(보안 용도 아님)
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  return `p_${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0").slice(0, 4)}`;
}

/** 지금 data/에서 골든 10팀 지표 스냅숏 */
export async function buildGoldenTeamFile(
  dataDir: string,
  now: Date,
  logger: Logger,
): Promise<GoldenTeamFile> {
  const warn = (event: string, fields: Record<string, unknown>) =>
    logger.warn(event, fields);
  const competitions = await readCompetitionFiles(dataDir, warn);
  const teams = await readPreviousTeams(dataDir, warn);
  const out: GoldenTeamFile["teams"] = [];
  for (const slug of GOLDEN_TEAM_SLUGS) {
    const team = teams.get(slug);
    if (!team) throw new Error(`골든 팀 파일 없음: ${slug}`);
    const r = buildTeamMetrics(team, competitions);
    if (!r.metrics) throw new Error(`골든 팀 ${slug}이 대상 밖: ${r.reason}`);
    out.push({
      slug,
      comp: r.metrics.comp,
      lg: r.metrics.lg,
      ucl: r.metrics.ucl,
    });
  }
  const source: Record<string, string> = {};
  for (const [comp, file] of Object.entries(competitions)) {
    if (file) source[comp] = file.updatedAt;
  }
  return GoldenTeamFileSchema.parse({
    builtAt: nowUtcIso(now),
    source,
    teams: out,
  });
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

/** 저장된 실행 중 가장 최근(라벨 제외) */
async function latestRun(
  dir: string,
  exclude: string,
): Promise<GoldenTeamRun | null> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  const runs: GoldenTeamRun[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name === `${exclude}.json`) continue;
    const parsed = GoldenTeamRunSchema.safeParse(
      await readJson(path.join(dir, name)).catch(() => null),
    );
    if (parsed.success) runs.push(parsed.data);
  }
  runs.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return runs[0] ?? null;
}

/** 팀별 출력 표 + 이전 실행 diff(문장이 바뀐 칸만 '-' 이전 · '+' 지금) */
export function formatTeamEvalReport(
  run: GoldenTeamRun,
  previous: GoldenTeamRun | null,
): string {
  const lines = [
    `[eval] 팀 프로필 골든셋 — ${run.label} · ${run.mode} · 지시문 ${run.prompt} · 통과 ${run.passed}/${run.teams.length}${run.costUsd !== null ? ` · ${formatUsd(run.costUsd)}` : ""}`,
  ];
  if (run.usage) {
    lines.push(
      `  토큰: 입력 ${run.usage.in} · 캐시 읽기 ${run.usage.cacheRead} · 캐시 쓰기 ${run.usage.cacheWrite} · 출력 ${run.usage.out}(thinking ${run.usage.thinking})`,
    );
  }
  if (run.error) lines.push(`  오류: ${run.error}`);
  if (previous) {
    lines.push(
      `  비교 기준: ${previous.label}(${previous.prompt}, 통과 ${previous.passed}/${previous.teams.length})`,
    );
  }
  for (const t of run.teams) {
    const before = previous?.teams.find((p) => p.slug === t.slug);
    lines.push(
      `  ■ ${t.slug} — ${t.reason}${t.detail ? ` (${t.detail})` : ""}${before && before.reason !== t.reason ? ` [이전 ${before.reason}]` : ""}`,
    );
    const cells: Array<[string, string | null, string | null]> = [
      ["o", t.o, before?.o ?? null],
      ["s", t.s?.join(" / ") ?? null, before?.s?.join(" / ") ?? null],
      ["w", t.w?.join(" / ") ?? null, before?.w?.join(" / ") ?? null],
    ];
    for (const [key, now, prev] of cells) {
      if (now === null && prev === null) continue;
      if (before && prev !== now) {
        lines.push(`     - ${key}: ${prev ?? "(없음)"}`);
        lines.push(`     + ${key}: ${now ?? "(없음)"}`);
      } else {
        lines.push(`       ${key}: ${now ?? "(없음)"}`);
      }
    }
  }
  return lines.join("\n");
}

function runTeamsOf(outcomes: readonly TeamOutcome[]): GoldenTeamRun["teams"] {
  return outcomes.map((o) => ({
    slug: o.slug,
    id: o.id,
    reason: o.reason,
    ...(o.detail !== undefined ? { detail: o.detail } : {}),
    o: o.item?.o ?? null,
    s: o.item?.s ?? null,
    w: o.item?.w ?? null,
  }));
}

export async function runTeamProfileEval(
  deps: TeamEvalDeps,
): Promise<TeamEvalOutcome> {
  const { args } = deps;
  const goldenDir = path.join(deps.rootDir, GOLDEN_TEAM_DIR_REL);
  const inputsFile = path.join(goldenDir, "inputs.json");
  const at = nowUtcIso(deps.now());

  if (args.buildGolden) {
    const golden = await buildGoldenTeamFile(
      deps.dataDir,
      deps.now(),
      deps.logger,
    );
    await mkdir(goldenDir, { recursive: true });
    await writeFile(inputsFile, `${JSON.stringify(golden, null, 2)}\n`, "utf8");
    deps.print(
      `[eval] 골든 팀 스냅숏 ${golden.teams.length}팀 → ${path.relative(deps.rootDir, inputsFile)}`,
    );
    return { exitCode: 0, run: null };
  }

  const golden = GoldenTeamFileSchema.parse(await readJson(inputsFile));
  const promptRel = args.prompt ?? TEAM_PROFILE_PROMPT_PATH;
  const system = (
    await readFile(path.resolve(deps.rootDir, promptRel), "utf8")
  ).trim();
  const [namesFile, compConfig] = await Promise.all([
    readConfigFile(deps.rootDir, "names.ko.json", NamesKoFileSchema),
    readConfigFile(deps.rootDir, "competitions.json", CompetitionsFileSchema),
  ]);
  const check = {
    names: profileNameList(buildNameIndex(namesFile, compConfig)),
  };
  const metrics: TeamMetrics[] = golden.teams.map((t) => ({ ...t }));
  const groups = groupTeams(metrics, GOLDEN_TEAM_LABEL, 1);
  const requests = groups.map((g) => buildProfileRequest(g, system));
  const estimate = estimateProfileWorstCase(requests, deps.model);
  deps.print(
    `[eval] 팀 프로필 골든셋 ${metrics.length}팀 · ${requests.length}요청(Batches, ${deps.model}) · 예상 최악: 입력 약 ${(estimate.tokens.in + estimate.tokens.cacheWrite).toLocaleString("en-US")}토큰 · 출력 상한 ${estimate.tokens.out.toLocaleString("en-US")}토큰 · $${estimate.usd.toFixed(6)}`,
  );
  const label =
    args.label ??
    `${at.slice(0, 10)}-${args.llmMode === "mock" ? "mock" : at.slice(11, 16).replace(":", "")}`;
  const runsDir = path.join(goldenDir, "runs");
  const previous = await latestRun(runsDir, label);

  if (args.llmMode === "live") {
    await noticeMonthlyUsage({
      env: "dev",
      logger: deps.logger,
      print: deps.print,
      dataDir: deps.dataDir,
      at: deps.now(),
      resolveBudgets: () => resolveBudgets(deps.env),
    });
    const verdict = await checkBudgetFromFiles({
      env: "dev",
      estimatedUsd: estimate.usd,
      now: deps.now(),
      dataDir: deps.dataDir,
      budgets: resolveBudgets(deps.env),
    });
    if (!verdict.allowed) {
      deps.print(`[eval] 예산 판정으로 호출하지 않는다 — ${verdict.message}`);
      return { exitCode: 2, run: null };
    }
  }
  if (args.dry) return { exitCode: 0, run: null };

  const llm = deps.createLlm(deps.model);
  const runId = makeRunId({ env: "dev", job: "weekly", startedAt: at }).replace(
    /^weekly-/,
    "eval-team-",
  );
  const recorded = await withRecordedRun(
    {
      env: "dev",
      job: "weekly",
      model: deps.model,
      mode: args.llmMode,
      runId,
      startedAt: at,
      dataDir: deps.dataDir,
      clock: deps.now,
    },
    async (recorder) => {
      const group = groups[0]!;
      let result: LlmResult | undefined;
      let error: string | undefined;
      try {
        const outcome = await llm.runBatch(requests, {
          deadline: new Date(deps.now().getTime() + EVAL_BATCH_WINDOW_MS),
          intervalMs: 15_000,
        });
        if (outcome.timedOut) {
          error = `배치 마감 초과(${outcome.batchId}) — Console에서 확인·취소`;
        } else {
          recorder.addResults(outcome.results.values());
          result = outcome.results.get(group.customId);
        }
      } catch (e) {
        if (!(e instanceof LlmMockFixtureError)) throw e;
        error = "mock fixture 없음";
      }
      const outcomes = judgeGroup(
        group,
        result === undefined
          ? { failure: error ?? "no-result" }
          : result.ok
            ? { text: result.text }
            : { failure: result.errorType },
        check,
      );
      const run: GoldenTeamRun = {
        label,
        at,
        mode: args.llmMode,
        model: deps.model,
        prompt: shortHash(system),
        ok: result?.ok ?? false,
        ...(error !== undefined ? { error } : {}),
        usage: result
          ? {
              in: result.usage.in,
              out: result.usage.out,
              cacheRead: result.usage.cacheRead,
              cacheWrite: result.usage.cacheWrite,
              thinking: result.thinkingTokens,
            }
          : null,
        costUsd: args.llmMode === "live" ? recorder.costSoFar() : null,
        runId: args.llmMode === "live" ? runId : null,
        passed: outcomes.filter((o) => o.reason === "ok").length,
        teams: runTeamsOf(outcomes),
      };
      return {
        value: { run, result },
        fields: { status: result?.ok ? "success" : "failed" },
      };
    },
  );
  const { run, result } = recorded.value;
  deps.print(formatTeamEvalReport(run, previous));
  if (recorded.record.persisted) {
    deps.print(
      `[cost] 기록 ${recorded.record.path} — runId ${recorded.record.run.runId} · 토큰 입력 ${recorded.record.run.tokens.in} · 출력 ${recorded.record.run.tokens.out} · 캐시 읽기 ${recorded.record.run.tokens.cacheRead} · 쓰기 ${recorded.record.run.tokens.cacheWrite} · ${formatUsd(recorded.record.run.costUsd)}`,
    );
  }
  const save = args.save ?? args.llmMode === "live";
  if (save) {
    await mkdir(runsDir, { recursive: true });
    await writeFile(
      path.join(runsDir, `${label}.json`),
      `${JSON.stringify(GoldenTeamRunSchema.parse(run), null, 2)}\n`,
      "utf8",
    );
    deps.print(
      `[eval] 저장 ${path.join(GOLDEN_TEAM_DIR_REL, "runs", `${label}.json`)}`,
    );
  }
  if (args.updateMock && result?.ok) {
    const fixture = {
      type: "succeeded",
      note: `팀 프로필 골든 10팀 dev 실측(${label}, ${run.runId ?? "-"}, 지시문 ${run.prompt}) — 입력 ${GOLDEN_TEAM_DIR_REL}/inputs.json`,
      text: result.text,
      usage: {
        input_tokens: result.usage.in,
        output_tokens: result.usage.out,
        cache_read_input_tokens: result.usage.cacheRead,
        cache_creation_input_tokens: result.usage.cacheWrite,
      },
    };
    const file = path.join(
      deps.rootDir,
      MOCK_BY_ID_REL,
      `${groups[0]!.customId}.json`,
    );
    await writeFile(file, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
    deps.print(`[eval] mock 갱신 ${path.relative(deps.rootDir, file)}`);
  }
  return { exitCode: run.ok ? 0 : 1, run };
}
