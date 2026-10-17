/**
 * M1-24 `npm run eval:prompt` — 골든셋 회귀 평가(scripts/lib/brief-eval.ts·eval-prompt-run.ts)와 🧪 사실 선계산 변형
 * (scripts/lib/brief-precompute.ts). 네트워크·실호출 없음(LLM_MODE=mock — mock fixture 또는 주입한 가짜 클라이언트).
 *
 * - 인자 파싱, 요청 = 브리핑 요청(D28 설정)과 같고 customId·변형만 다르다.
 * - mock 재생은 결정적이고, 저장된 실측(fixtures/llm/golden/runs)과 판정·사유 코드가 같다(입력이 그대로인 날).
 * - live 흐름(가짜 클라이언트): 비용 가드(attempts 1)·dev 기록(runs-dev.json, runId eval-dev-…)·mock 저장, 예산 초과면 부르지 않음.
 * - 저장된 출력 재판정(--rejudge — 검사기 판 비교), 지시문 경로(--prompt)·검사기 판 기록.
 * - M0 기준선은 brief-cases.json 기대 판정과 같다(M1-23과 같은 판정).
 */
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { RunsDevFileSchema } from "@/lib/schema";

import {
  BRIEF_EFFORT,
  BRIEF_MAX_TOKENS,
  BRIEF_THINKING,
  buildBriefRequest,
} from "../scripts/lib/brief";
import {
  buildEvalRequest,
  evalCustomId,
  evalInputHash,
  evalUserMessage,
  EvalRunSchema,
  formatEvalReport,
  summarizeEvalRun,
  verdictClass,
  type EvalRun,
} from "../scripts/lib/brief-eval";
import type { BriefInputMatch } from "../scripts/lib/brief-input";
import {
  PRECOMPUTE_PROMPT_ADDENDUM,
  precomputeMatchFacts,
  withPrecomputedFacts,
} from "../scripts/lib/brief-precompute";
import {
  checkerFingerprint,
  configsFingerprint,
  evalPromptPathError,
  evalVersions,
  isValidEvalLabel,
  loadEvalContext,
  loadEvalPrompt,
  m0BaselineRun,
  parseEvalArgs,
  pickBaseline,
  runEvalPrompt,
  type EvalArgs,
  type EvalDeps,
} from "../scripts/lib/eval-prompt-run";
import { loadGoldenSet } from "../scripts/lib/golden";
import {
  createLlmClient,
  CUSTOM_ID_PATTERN,
  MockFixtureSchema,
  type LlmRequest,
  type LlmResult,
} from "../scripts/lib/llm";
import { createLogger } from "../scripts/lib/logger";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const GOLDEN = path.join(ROOT, "fixtures/llm/golden");
const MODEL = "claude-haiku-5-5";
const readJson = (file: string): unknown =>
  JSON.parse(readFileSync(file, "utf8"));
const savedRun = (label: string): EvalRun =>
  EvalRunSchema.parse(readJson(path.join(GOLDEN, "runs", label, "run.json")));
const BASE_RUN = "2026-10-17-v0.1";
const PRE_RUN = "2026-10-17-v0.1-pre";

function args(over: Partial<EvalArgs> = {}): EvalArgs {
  const parsed = parseEvalArgs([], "mock");
  if (!parsed.ok) throw new Error(parsed.error);
  return { ...parsed.value, ...over };
}

function tmp(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), `eval-prompt-${prefix}-`));
}

function deps(over: Partial<EvalDeps> = {}): EvalDeps & { out: string[] } {
  const out: string[] = [];
  let t = 0;
  return {
    rootDir: ROOT,
    dataDir: tmp("data"),
    runsDir: tmp("runs"),
    args: args(),
    env: {},
    model: MODEL,
    createLlm: (model) =>
      createLlmClient({ mode: "mock", model, env: {}, logger: () => {} }),
    now: () => new Date("2026-10-17T05:00:00.000Z"),
    clock: () => (t += 1000),
    logger: createLogger({ scope: "test", sink: () => {} }),
    print: (text) => out.push(text),
    out,
    ...over,
  };
}

// ─── 인자 ─────────────────────────────────────────────────────────────────

describe("parseEvalArgs", () => {
  it("기본 — live·base·저장 기본(null)·지시문 기본(null)", () => {
    const r = parseEvalArgs([], undefined);
    expect(r.ok && r.value).toMatchObject({
      llmMode: "live",
      variant: "base",
      dry: false,
      limit: null,
      dates: null,
      save: null,
      prompt: null,
      rejudge: null,
    });
  });

  it("옵션 해석", () => {
    const r = parseEvalArgs(
      [
        "--mock",
        "--limit",
        "3",
        "--dates",
        "2026-10-11,2026-10-17",
        "--variant",
        "pre",
        "--label",
        "x.1",
        "--baseline",
        "m0",
        "--no-save",
        "--prompt",
        "configs/prompts/summarize.md",
      ],
      undefined,
    );
    expect(r.ok && r.value).toMatchObject({
      llmMode: "mock",
      limit: 3,
      dates: ["2026-10-11", "2026-10-17"],
      variant: "pre",
      label: "x.1",
      baseline: "m0",
      save: false,
      prompt: "configs/prompts/summarize.md",
    });
  });

  it("잘못된 값은 오류", () => {
    for (const argv of [
      ["--limit", "0"],
      ["--dates", "2026/10/11"],
      ["--variant", "post"],
      ["--label", "a b"],
      ["--baseline", "../x"],
      ["--save", "--no-save"],
      ["--mock", "--update-mock"],
      ["--rejudge", "x", "--dry"],
      ["--prompt", " "],
      ["--unknown"],
    ]) {
      expect(parseEvalArgs(argv, undefined).ok, argv.join(" ")).toBe(false);
    }
  });
});

// ─── 요청 ─────────────────────────────────────────────────────────────────

const SET = await loadGoldenSet(GOLDEN);
const SYSTEM = (await loadEvalPrompt(ROOT, null)).system;

describe("buildEvalRequest — 브리핑 요청(D28)과 같고 customId·변형만 다르다", () => {
  const set = SET;
  const system = SYSTEM;

  it("base — user·system·설정이 파이프라인 요청과 같다(캐싱 끔)", () => {
    for (const day of set.days) {
      const req = buildEvalRequest(day, system, "base");
      const pipeline = buildBriefRequest(day.input, system);
      expect({ ...req, customId: "x" }).toEqual({ ...pipeline, customId: "x" });
      expect(req.customId).toBe(`golden-${day.date}`);
      expect(req.customId).toMatch(CUSTOM_ID_PATTERN);
      expect(req.maxTokens).toBe(BRIEF_MAX_TOKENS);
      expect(req.effort).toBe(BRIEF_EFFORT);
      expect(req.thinking).toBe(BRIEF_THINKING);
      expect(req.cacheSystem).toBeUndefined();
    }
  });

  it("pre — 입력에 x, 지시문 뒤에 x 설명, customId golden-pre-", () => {
    const day = set.days.find((d) => d.date === "2026-10-11")!;
    const req = buildEvalRequest(day, system, "pre");
    expect(req.customId).toBe(evalCustomId(day.date, "pre"));
    expect(req.system.endsWith(PRECOMPUTE_PROMPT_ADDENDUM)).toBe(true);
    expect(req.system.startsWith(system)).toBe(true);
    const sent = JSON.parse(req.user) as { matches: Array<{ x: unknown }> };
    expect(sent.matches.every((m) => typeof m.x === "object")).toBe(true);
    expect(req.maxTokens).toBe(BRIEF_MAX_TOKENS);
  });
});

// ─── 🧪 사실 선계산 ────────────────────────────────────────────────────────

const M = (over: Partial<BriefInputMatch>): BriefInputMatch => ({
  id: "m1",
  comp: "Premier League",
  round: "Matchday 6",
  home: "Arsenal",
  away: "Chelsea",
  ft: "2-1",
  goals: null,
  ...over,
});
const goal = (
  min: string,
  team: string,
  player: string,
  type?: "penalty" | "own_goal",
) => (type ? { min, team, player, type } : { min, team, player });

describe("precomputeMatchFacts — 템플릿·검사기와 같은 해석(matchFacts)", () => {
  it("승패·주어 팀 점수 먼저·무승부", () => {
    expect(precomputeMatchFacts(M({}))).toEqual({ w: "Arsenal", s: "2-1" });
    expect(precomputeMatchFacts(M({ ft: "1-3" }))).toEqual({
      w: "Chelsea",
      s: "3-1",
    });
    expect(precomputeMatchFacts(M({ ft: "1-1" }))).toEqual({ d: true });
  });

  it("연장 — 90분에 뒤지거나 동점이던 승자만 et, 90분에 앞섰거나 90분 점수 없으면 ft-only(합산 연장)", () => {
    expect(
      precomputeMatchFacts(M({ ft: "2-1", aet: true, regular: "1-1" })),
    ).toEqual({ w: "Arsenal", s: "2-1", et: true });
    expect(
      precomputeMatchFacts(M({ ft: "3-2", aet: true, regular: "3-0" })),
    ).toEqual({ r: "ft-only" });
    expect(precomputeMatchFacts(M({ ft: "2-1", aet: true }))).toEqual({
      r: "ft-only",
    });
  });

  it("승부차기 — 승자는 승부차기 결과, ft가 동점이 아니면 ft-only + p", () => {
    expect(
      precomputeMatchFacts(
        M({ ft: "1-1", aet: true, regular: "1-1", pens: "3-4" }),
      ),
    ).toEqual({ p: "4-3", w: "Chelsea", s: "1-1" });
    expect(
      precomputeMatchFacts(
        M({ ft: "1-0", aet: true, regular: "1-0", pens: "2-4" }),
      ),
    ).toEqual({ p: "4-2", r: "ft-only" });
    expect(
      precomputeMatchFacts(M({ ft: "1-1", aet: true, pens: "3-3" })),
    ).toEqual({});
  });

  it("결승골(2골 차 이내·자책골이면 없음)·역전승·해트트릭(자책골 제외)", () => {
    const comeback = M({
      ft: "2-1",
      ht: "0-1",
      goals: [
        goal("10", "Chelsea", "Cole Palmer"),
        goal("55", "Arsenal", "Bukayo Saka"),
        goal("90+2", "Arsenal", "Martin Ødegaard", "penalty"),
      ],
    });
    expect(precomputeMatchFacts(comeback)).toEqual({
      w: "Arsenal",
      s: "2-1",
      g: { player: "Martin Ødegaard", min: "90+2", type: "penalty" },
      cb: true,
    });
    const own = M({
      ft: "1-0",
      goals: [goal("30", "Arsenal", "Reece James", "own_goal")],
    });
    expect(precomputeMatchFacts(own)).toEqual({ w: "Arsenal", s: "1-0" });
    const rout = M({
      ft: "4-0",
      goals: ["5", "20", "40", "80"].map((m, i) =>
        goal(m, "Arsenal", i < 3 ? "Bukayo Saka" : "Kai Havertz"),
      ),
    });
    // 4골 차 — 결승골 없음, 해트트릭 있음
    expect(precomputeMatchFacts(rout)).toEqual({
      w: "Arsenal",
      s: "4-0",
      ht: [{ player: "Bukayo Saka", n: 3 }],
    });
  });

  it("withPrecomputedFacts — 경기 키 순서 그대로 + 맨 뒤 x, 확정 입력은 바꾸지 않는다", async () => {
    const set = await loadGoldenSet(GOLDEN);
    for (const day of set.days) {
      const before = JSON.stringify(day.input);
      const pre = withPrecomputedFacts(day.input);
      expect(JSON.stringify(day.input)).toBe(before);
      pre.matches.forEach((m, i) => {
        const keys = Object.keys(m);
        expect(keys.at(-1)).toBe("x");
        expect(keys.slice(0, -1)).toEqual(Object.keys(day.input.matches[i]!));
      });
    }
  });
});

// ─── mock 재생 · 저장된 실측 ───────────────────────────────────────────────

describe("runEvalPrompt — mock(결정적·무비용)", () => {
  it.each([
    ["base", BASE_RUN],
    ["pre", PRE_RUN],
  ] as const)(
    "%s — 10일 모두 저장 실측과 출력 원문·토큰이 같고, 두 번 재생해도 같다 · 검사기·설정 판이 같으면 판정까지 같다",
    async (variant, label) => {
      const run1 = await runEvalPrompt(
        deps({ args: args({ variant, baseline: label, summaryOnly: true }) }),
      );
      const d = deps({
        args: args({ variant, baseline: label, summaryOnly: true }),
      });
      const outcome = await runEvalPrompt(d);
      expect(outcome.exitCode).toBe(0);
      expect(outcome.runFile).toBeNull(); // mock 기본은 저장 안 함
      expect(readdirSync(d.dataDir)).toEqual([]); // runs-dev.json을 쓰지 않는다
      const saved = savedRun(label);
      const run = outcome.run!;
      expect(run.mode).toBe("mock");
      expect(run.days.map((x) => x.date)).toEqual(
        saved.days.map((x) => x.date),
      );
      // 결정성 — 같은 설정으로 두 번 재생하면 판정·문장이 같다(설정·검사기와 무관하게 성립)
      expect(
        run.days.map((x) => [
          x.verdict,
          x.lineReasons,
          x.lines.map((l) => l.text),
        ]),
      ).toEqual(
        run1.run!.days.map((x) => [
          x.verdict,
          x.lineReasons,
          x.lines.map((l) => l.text),
        ]),
      );
      // 출력 원문·토큰은 by-id 재생이라 판정 판과 무관하게 10일 모두 저장 실측과 같다
      run.days.forEach((day, i) => {
        const prev = saved.days[i]!;
        expect(day.text, day.date).toBe(prev.text);
        expect(day.usage, day.date).toEqual(prev.usage);
        expect(day.thinkingTokens).toBeNull(); // mock은 thinking을 모른다
      });
      // 판정 비교는 검사기 판·설정 판이 둘 다 같을 때만(/add-name·검사기 수정 뒤에는 재판정 차이가 정상 — --rejudge로 본다)
      const sameVersions =
        run.checker.id === saved.checker.id &&
        run.configs.id === saved.configs.id;
      let compared = 0;
      if (sameVersions) {
        run.days.forEach((day, i) => {
          const prev = saved.days[i]!;
          expect(day.inputHash, day.date).toBe(prev.inputHash);
          expect(day.verdict, day.date).toBe(prev.verdict);
          expect(day.lineReasons, day.date).toEqual(prev.lineReasons);
          expect(
            day.lines.map((l) => l.text),
            day.date,
          ).toEqual(prev.lines.map((l) => l.text));
          compared += 1;
        });
      }
      console.info(
        `[eval-prompt.test] ${label}: 판정 비교 ${compared}/10일 (검사기 ${run.checker.id}${run.checker.id === saved.checker.id ? "=" : "≠"}${saved.checker.id}, 설정 ${run.configs.id}${run.configs.id === saved.configs.id ? "=" : "≠"}${saved.configs.id})`,
      );
      expect(compared).toBe(sameVersions ? 10 : 0);
      expect(outcome.baseline?.label).toBe(label);
      expect(outcome.report).toContain("골든셋 회귀 비교");
    },
  );

  it("--save면 runsDir에 run.json(스키마 통과)을 쓴다 · 두 번 실행해도 결과가 같다", async () => {
    const d1 = deps({
      args: args({ save: true, label: "t1", baseline: "none" }),
    });
    const d2 = deps({
      args: args({ save: true, label: "t2", baseline: "none" }),
    });
    const a = await runEvalPrompt(d1);
    const b = await runEvalPrompt(d2);
    const fa = EvalRunSchema.parse(readJson(a.runFile!));
    const fb = EvalRunSchema.parse(readJson(b.runFile!));
    expect(fa.days.map((x) => [x.verdict, x.lines.map((l) => l.text)])).toEqual(
      fb.days.map((x) => [x.verdict, x.lines.map((l) => l.text)]),
    );
    expect(fa.prompt).toBe("configs/prompts/summarize.md");
    expect(fa.checker.id).toMatch(/^c_[0-9a-f]{12}$/);
  });

  it("--limit·--dates", async () => {
    const one = await runEvalPrompt(
      deps({ args: args({ dates: ["2026-10-17"], baseline: "none" }) }),
    );
    expect(one.run!.days.map((x) => x.date)).toEqual(["2026-10-17"]);
    const two = await runEvalPrompt(
      deps({ args: args({ limit: 2, baseline: "none" }) }),
    );
    expect(two.run!.days).toHaveLength(2);
    const none = await runEvalPrompt(
      deps({ args: args({ dates: ["2020-01-01"] }) }),
    );
    expect(none.exitCode).toBe(1);
  });
});

describe("저장된 실측(2026-10-17, M1-20 dev 실측 — 지시문 v0.1·D28 설정)", () => {
  it("설정·검사기 판·출력 토큰(바쁜 날 포함 3,500 이하 — D28 여유)", () => {
    const run = savedRun(BASE_RUN);
    expect(run.mode).toBe("live");
    expect(run.runId).toMatch(/^eval-dev-/);
    expect(run.settings).toEqual({
      maxTokens: 4096,
      thinking: "adaptive",
      effort: "medium",
      cacheSystem: false,
      attempts: 1,
    });
    expect(run.days.every((d) => d.ok && d.thinkingTokens !== null)).toBe(true);
    const busy = run.days.find((d) => d.date === "2026-10-11")!;
    expect(busy.matches).toBe(23);
    expect(Math.max(...run.days.map((d) => d.usage.out))).toBeLessThanOrEqual(
      3500,
    );
    const s = summarizeEvalRun(run);
    expect(s.verdicts).toEqual({
      ok: 8,
      mixed: 2,
      "lines-all": 0,
      retry: 0,
      "downgrade-all": 0,
    });
    expect(s.lines).toEqual({ total: 45, passed: 43, downgraded: 2 });
    // 비용 합계 = 전체 usage로 한 번(runs-dev.json 기록 eval-dev-20261017T052936Z-72fa와 같은 값)
    expect(s.costUsd).toBe(0.016388);
    expect(summarizeEvalRun(savedRun(PRE_RUN)).costUsd).toBe(0.017406);
  });

  it("두 실행 모두 mock fixture가 있다(by-id golden[-pre]-<날짜>, MockFixtureSchema)", () => {
    for (const label of [BASE_RUN, PRE_RUN]) {
      for (const day of savedRun(label).days) {
        const fixture = MockFixtureSchema.parse(
          readJson(
            path.join(ROOT, "fixtures/llm/mock/by-id", `${day.customId}.json`),
          ),
        );
        expect(fixture.type).toBe("succeeded");
      }
    }
  });
});

// ─── live 흐름(가짜 클라이언트) ─────────────────────────────────────────────

/** mock fixture의 출력을 돌려주는 가짜 live 클라이언트(호출 수를 센다) */
function fakeLive(calls: LlmRequest[]) {
  return (model: string) => ({
    model,
    async callSingle(request: LlmRequest): Promise<LlmResult> {
      calls.push(request);
      const fixture = readJson(
        path.join(ROOT, "fixtures/llm/mock/by-id", `${request.customId}.json`),
      ) as {
        text: string;
        usage: { input_tokens: number; output_tokens: number };
      };
      return {
        ok: true,
        customId: request.customId,
        batch: false,
        text: fixture.text,
        stopReason: "end_turn",
        usage: {
          in: fixture.usage.input_tokens,
          out: fixture.usage.output_tokens,
          cacheRead: 0,
          cacheWrite: 0,
        },
        thinkingTokens: 100,
      };
    },
  });
}

describe("runEvalPrompt — live 흐름(가짜 클라이언트, 임시 data/)", () => {
  it("비용 가드 통과 → 날짜마다 1요청 → runs-dev.json(dev·eval-dev-…) 기록 · --update-mock", async () => {
    const calls: LlmRequest[] = [];
    const mockDir = tmp("mock");
    const d = deps({
      args: args({
        llmMode: "live",
        dates: ["2026-10-10", "2026-10-17"],
        updateMock: true,
        label: "live-t",
        baseline: "none",
      }),
      createLlm: fakeLive(calls),
      mockDir,
    });
    const outcome = await runEvalPrompt(d);
    expect(outcome.exitCode).toBe(0);
    expect(calls.map((c) => c.customId)).toEqual([
      "golden-2026-10-10",
      "golden-2026-10-17",
    ]);
    expect(d.out.join("\n")).toContain("[cost] 예상");
    expect(d.out.join("\n")).toContain("요청마다 1회(재시도 없음)");
    const runs = RunsDevFileSchema.parse(
      readJson(path.join(d.dataDir, "runs-dev.json")),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]!.runId).toMatch(/^eval-dev-20261017T050000Z-[0-9a-f]{4}$/);
    expect(runs[0]!.env).toBe("dev");
    expect(runs[0]!.tokens.out).toBe(
      outcome.run!.days.reduce((n, x) => n + x.usage.out, 0),
    );
    expect(runs[0]!.costUsd).toBeGreaterThan(0);
    expect(summarizeEvalRun(outcome.run!).costUsd).toBe(runs[0]!.costUsd);
    expect(outcome.run!.runId).toBe(runs[0]!.runId);
    expect(
      outcome.run!.days.every(
        (x) => x.thinkingTokens === 100 && x.latencyMs === 1000,
      ),
    ).toBe(true);
    expect(outcome.runFile).toBe(path.join(d.runsDir!, "live-t", "run.json"));
    for (const id of ["golden-2026-10-10", "golden-2026-10-17"]) {
      expect(
        MockFixtureSchema.parse(
          readJson(path.join(mockDir, "by-id", `${id}.json`)),
        ).type,
      ).toBe("succeeded");
    }
  });

  it("예산 초과 예상이면 부르지 않는다(exit 2) — 일 예산은 dev 실행이면 prod+dev 합산", async () => {
    const calls: LlmRequest[] = [];
    const d = deps({
      args: args({ llmMode: "live", baseline: "none" }),
      createLlm: fakeLive(calls),
    });
    writeFileSync(
      path.join(d.dataDir, "runs.json"),
      JSON.stringify([
        {
          runId: "collect-prod-20261016T213000Z-aaaa",
          env: "prod",
          job: "collect",
          startedAt: "2026-10-16T21:30:00.000Z",
          finishedAt: "2026-10-16T21:31:00.000Z",
          collected: 0,
          clusters: 0,
          summarized: 0,
          downgraded: 0,
          tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
          costUsd: 0.09,
          apiCalls: { footballData: 0, apiFootball: 0 },
          sources: [],
          status: "success",
        },
      ]),
    );
    const outcome = await runEvalPrompt(d);
    expect(outcome.exitCode).toBe(2);
    expect(calls).toHaveLength(0);
    expect(readdirSync(d.dataDir)).toEqual(["runs.json"]);
  });

  it("--dry는 예상만 출력하고 부르지 않는다", async () => {
    const calls: LlmRequest[] = [];
    const d = deps({
      args: args({ llmMode: "live", dry: true }),
      createLlm: fakeLive(calls),
    });
    const outcome = await runEvalPrompt(d);
    expect(outcome.exitCode).toBe(0);
    expect(calls).toHaveLength(0);
    expect(outcome.run).toBeNull();
  });
});

// ─── 재판정 · 지시문/검사기 판 ─────────────────────────────────────────────

describe("--rejudge · --prompt · 검사기 판", () => {
  it("저장된 출력을 지금 검사기로 다시 판정 — LLM 없음, 같은 검사기면 같은 판정, 원래 실행이 기준", async () => {
    const calls: LlmRequest[] = [];
    const d = deps({
      args: args({ rejudge: BASE_RUN, summaryOnly: true }),
      createLlm: fakeLive(calls),
    });
    const outcome = await runEvalPrompt(d);
    expect(outcome.exitCode).toBe(0);
    expect(calls).toHaveLength(0);
    const run = outcome.run!;
    expect(run.mode).toBe("rejudge");
    expect(run.rejudgedFrom).toBe(BASE_RUN);
    expect(run.runId).toBeNull();
    expect(outcome.baseline?.label).toBe(BASE_RUN);
    const saved = savedRun(BASE_RUN);
    const current = await evalVersions(ROOT);
    if (
      current.checker.id === saved.checker.id &&
      current.configs.id === saved.configs.id
    ) {
      expect(run.days.map((x) => [x.verdict, x.lineReasons])).toEqual(
        saved.days.map((x) => [x.verdict, x.lineReasons]),
      );
    }
    const missing = await runEvalPrompt(
      deps({ args: args({ rejudge: "no-such-run" }) }),
    );
    expect(missing.exitCode).toBe(1);
  });

  it("검사기 판 — brief-check*.ts·파싱·템플릿·치환 파일의 해시(형식·결정적)", async () => {
    const a = await checkerFingerprint(ROOT);
    const b = await checkerFingerprint(ROOT);
    expect(a).toEqual(b);
    expect(a.id).toMatch(/^c_[0-9a-f]{12}$/);
    expect(a.files).toContain("scripts/lib/brief-check.ts");
    expect(a.files).toContain("scripts/lib/brief-check-lexicon.ts");
    expect(a.files).toContain("scripts/lib/brief-grammar.ts"); // 닫힌 문법(D50)
    expect(a.files).toContain("scripts/lib/names.ts");
  });

  it("설정 판 — 판정·골든셋 입력을 바꾸는 configs 4개의 해시, 실행 기록에 남는다", async () => {
    const a = await configsFingerprint(ROOT);
    expect(a).toEqual(await configsFingerprint(ROOT));
    expect(a.id).toMatch(/^g_[0-9a-f]{12}$/);
    expect(a.files).toEqual([
      "configs/competitions.json",
      "configs/korean-players.json",
      "configs/names.ko.json",
      "configs/team-ids.json",
    ]);
    const v = await evalVersions(ROOT);
    expect(v.configs).toEqual(a);
    const outcome = await runEvalPrompt(
      deps({ args: args({ dates: ["2026-05-31"], baseline: "none" }) }),
    );
    expect(outcome.run!.configs).toEqual(a);
    expect(outcome.run!.checker).toEqual(v.checker);
  });

  it("--prompt — 다른 지시문 파일을 쓰고 경로·판 id를 기록한다", async () => {
    const dir = tmp("prompt");
    const file = path.join(dir, "summarize-test.md");
    writeFileSync(file, "  시험 지시문\n");
    const loaded = await loadEvalPrompt(ROOT, file);
    expect(loaded.system).toBe("시험 지시문");
    // 저장소 밖은 파일 이름만(공개 저장소에 로컬 경로를 남기지 않는다)
    expect(loaded.rel).toBe("(저장소 밖)/summarize-test.md");
    const inRepo = await loadEvalPrompt(
      ROOT,
      "fixtures/llm/brief-inputs/prompt-m0-30-short.md",
    );
    expect(inRepo.rel).toBe("fixtures/llm/brief-inputs/prompt-m0-30-short.md");
    const d = deps({
      args: args({
        prompt: file,
        dates: ["2026-05-31"],
        baseline: "none",
        save: true,
        label: "p",
      }),
    });
    const outcome = await runEvalPrompt(d);
    const run = EvalRunSchema.parse(readJson(outcome.runFile!));
    expect(run.prompt).toBe("(저장소 밖)/summarize-test.md");
    expect(JSON.stringify(run)).not.toContain(dir);
    expect(run.promptChars).toBe("시험 지시문".length);
    expect(d.out.join("\n")).toContain("mock은 지시문과 관계없이");
  });

  it("--prompt는 .md만·.env 거부(인자 단계와 읽기 단계 모두), --label·--baseline·--rejudge는 점으로 시작·'..' 거부", async () => {
    for (const bad of [
      ".env.local",
      "./.env",
      "configs/.env.production",
      ".env/summarize.md",
      "configs/prompts/summarize.txt",
      "configs/prompts/summarize",
    ]) {
      expect(evalPromptPathError(bad), bad).not.toBeNull();
      expect(parseEvalArgs(["--prompt", bad], undefined).ok, bad).toBe(false);
      await expect(loadEvalPrompt(ROOT, bad), bad).rejects.toThrow();
    }
    expect(evalPromptPathError("configs/prompts/summarize-v0.2.md")).toBeNull();
    for (const bad of [".hidden", "..", "a..b", "-ok", "x/y"]) {
      const ok = isValidEvalLabel(bad);
      if (bad === "-ok") expect(ok).toBe(true);
      else {
        expect(ok, bad).toBe(false);
        for (const flag of ["--label", "--baseline", "--rejudge"]) {
          expect(
            parseEvalArgs([flag, bad], undefined).ok,
            `${flag} ${bad}`,
          ).toBe(false);
        }
      }
    }
    expect(isValidEvalLabel("2026-10-17-v0.1.rj-c343ecd5")).toBe(true);
  });
});

// ─── 기준선 · 요약 · 리포트 ────────────────────────────────────────────────

describe("M0 기준선 · 기준 고르기 · 리포트", () => {
  it("m0 — M0 출력을 원래 입력으로 판정, brief-cases.json 기대 판정과 같다", async () => {
    const ctx = await loadEvalContext(ROOT);
    const set = await loadGoldenSet(GOLDEN);
    const run = await m0BaselineRun(
      ROOT,
      set.days,
      ctx,
      MODEL,
      await evalVersions(ROOT),
    );
    const cases = readJson(
      path.join(ROOT, "fixtures/llm/brief-cases.json"),
    ) as {
      cases: Array<{ id: string; expected: string }>;
    };
    expect(run.days.map((x) => x.date)).toEqual([
      "2026-09-11",
      "2026-09-19",
      "2026-09-21",
      "2026-10-10",
      "2026-10-11",
    ]);
    for (const day of run.days) {
      const expected = cases.cases.find(
        (c) => c.id === `brief-${day.date}`,
      )!.expected;
      expect(day.verdict, day.date).toBe(expected);
      expect(day.thinkingTokens).toBeNull();
      expect(day.latencyMs).toBeNull();
    }
    expect(EvalRunSchema.parse(run).mode).toBe("baseline");
  });

  it("pickBaseline — 요청 라벨 · m0 · none · 같은 변형 최근 → pre는 최근 base → m0", () => {
    const r = (label: string, variant: "base" | "pre", startedAt: string) =>
      ({ ...savedRun(BASE_RUN), label, variant, startedAt }) as EvalRun;
    const runs = [
      r("a", "base", "2026-10-17T01:00:00Z"),
      r("b", "base", "2026-10-17T02:00:00Z"),
      r("c", "pre", "2026-10-17T03:00:00Z"),
    ];
    expect(pickBaseline(runs, "base", null, null)).toMatchObject({
      kind: "run",
      run: { label: "b" },
    });
    expect(pickBaseline(runs, "base", null, "b")).toMatchObject({
      kind: "run",
      run: { label: "a" },
    });
    expect(pickBaseline(runs, "pre", null, "c")).toMatchObject({
      kind: "run",
      run: { label: "b" },
    });
    expect(pickBaseline([], "base", null, null)).toEqual({ kind: "m0" });
    expect(pickBaseline(runs, "base", "none", null)).toEqual({ kind: "none" });
    expect(pickBaseline(runs, "base", "m0", null)).toEqual({ kind: "m0" });
    expect(pickBaseline(runs, "base", "zzz", null)).toEqual({
      kind: "missing",
      label: "zzz",
    });
  });

  it("요약·판정 분류·리포트(입력 다름 표시, 줄별 이전/이후/템플릿)", async () => {
    const base = savedRun(BASE_RUN);
    const pre = savedRun(PRE_RUN);
    const s = summarizeEvalRun(pre);
    expect(s.days).toBe(10);
    expect(s.lines.total).toBe(s.lines.passed + s.lines.downgraded);
    expect(
      verdictClass({
        verdict: "downgrade-line:1",
        lines: [{ ...base.days[0]!.lines[0]!, ok: false }],
      }),
    ).toBe("lines-all");
    const report = formatEvalReport(pre, base);
    expect(report).toContain("입력 다름"); // pre는 user 메시지(x)가 달라 해시가 다르다
    expect(report).toContain("L1 이전:");
    expect(report).toContain("L1 이후:");
    const set = await loadGoldenSet(GOLDEN);
    const day = set.days.find((x) => x.date === "2026-10-17")!;
    expect(evalInputHash(evalUserMessage(day.input, "base"))).toMatch(
      /^i_[0-9a-f]{12}$/,
    );
  });
});
