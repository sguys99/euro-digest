/**
 * M1-45 브리핑 게시 줄(scripts/lib/brief-publish.ts) — FR-29 판정(ok·downgrade-line) 출력 → 게시 줄.
 *
 * - 골든셋 10일(fixtures/llm/golden — 입력과 근거가 맞는 실측 응답 golden-<날짜>)을 지금 검사기로 판정해 게시 줄의 불변식을 본다:
 *   통과 줄 = 검사기 치환 문장(80자를 잰 문장)·모델 근거·ai:true, 강등 줄 = 같은 근거의 템플릿 줄(전체 입력 — D51)·ai:false,
 *   같은 근거 중복 없음, 파일 스키마 통과. 검사기 판이 바뀌어도(M1-23 재리뷰) 깨지지 않게 줄 번호를 고정하지 않는다.
 * - 합성 판정으로 같은 근거 중복·템플릿 없음·파일 스키마 방어선을 결정적으로 고정한다.
 * - 시도 customId·템플릿 강등 원인 표.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  BriefFileSchema,
  BriefLineSchema,
  type RunEnv,
  type RunLog,
} from "@/lib/schema";

import { BRIEF_MAX_ATTEMPTS, parseBriefOutput } from "../scripts/lib/brief";
import {
  judgeBriefResponse,
  type BriefCheckResult,
  type BriefLineCheck,
} from "../scripts/lib/brief-check";
import { briefLlmInput, type BriefInput } from "../scripts/lib/brief-input";
import {
  BRIEF_DAILY_REQUEST_CAP,
  briefAttemptCustomId,
  briefDailyAllowance,
  briefFailCause,
  briefFailReason,
  briefGrammarCounts,
  composeVerifiedBrief,
  isRankGrammar,
  isResultGrammar,
  planBriefAttempts,
} from "../scripts/lib/brief-publish";
import {
  briefNamesFromIndex,
  chooseBriefCompForm,
  templateLineForRefs,
  type BriefTemplateContext,
} from "../scripts/lib/brief-template";
import {
  loadEvalContext,
  type EvalContext,
} from "../scripts/lib/eval-prompt-run";
import { loadGoldenSet, type GoldenSet } from "../scripts/lib/golden";
import { MockFixtureSchema } from "../scripts/lib/llm";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

let ctx: EvalContext;
let golden: GoldenSet;
beforeAll(async () => {
  ctx = await loadEvalContext(ROOT);
  golden = await loadGoldenSet(path.join(ROOT, "fixtures/llm/golden"));
});

function templateCtx(): BriefTemplateContext {
  return {
    competitions: ctx.competitions,
    names: briefNamesFromIndex(ctx.check.names),
  };
}

function mockText(id: string): string {
  const fixture = MockFixtureSchema.parse(
    JSON.parse(
      readFileSync(
        path.join(ROOT, "fixtures/llm/mock/by-id", `${id}.json`),
        "utf8",
      ),
    ),
  );
  if (fixture.type !== "succeeded") throw new Error(`${id}: 성공 응답 아님`);
  return fixture.text;
}

describe("composeVerifiedBrief — 골든셋 실측 응답(입력 일치)", () => {
  it("판정 ok·downgrade-line인 날마다 통과 줄 = 검사기 치환 문장·모델 근거, 강등 줄 = 같은 근거 템플릿(전체 입력), 중복 없음, 파일 스키마 통과", () => {
    let published = 0;
    let aiTotal = 0;
    for (const day of golden.days) {
      const text = mockText(`golden-${day.date}`);
      const judgement = judgeBriefResponse(
        { ok: true, text },
        day.input,
        ctx.check,
        { hiddenRefs: briefLlmInput(day.input).hiddenRefs },
      );
      const v = judgement.verdict.verdict;
      if (v !== "ok" && v !== "downgrade-line") continue;
      const parsed = parseBriefOutput(text);
      if (!parsed.ok) throw new Error("unreachable");
      const verified = composeVerifiedBrief({
        output: parsed.lines,
        check: judgement.check!,
        input: day.input,
        template: templateCtx(),
      });
      published += 1;
      aiTotal += verified.ai;
      expect(verified.detail).toHaveLength(parsed.lines.length);
      expect(verified.ai + verified.template + verified.dropped).toBe(
        parsed.lines.length,
      );
      // 판정이 ok면 모든 줄이 AI 줄이다
      if (v === "ok") expect(verified.ai, day.date).toBe(parsed.lines.length);
      const compForm = chooseBriefCompForm(day.input, templateCtx());
      // 템플릿 줄을 버리는 근거(오케스트레이터 결정 2026-10-17): ⓐ 앞 템플릿 줄 근거 ⓑ 결과 문형 통과 줄의 경기 근거
      // ⓑ' 순위 문형 통과 줄의 순위표 근거(어느 위치든)
      const matchIds = new Set(day.input.matches.map((m) => m.id));
      const standingsIds = new Set(day.input.standings.map((st) => st.id));
      const resultRefs = new Set(
        verified.detail.flatMap((d) =>
          d.outcome === "ai" && isResultGrammar(d.grammar)
            ? d.line!.refs.filter((r) => matchIds.has(r))
            : [],
        ),
      );
      const rankRefs = new Set(
        verified.detail.flatMap((d) =>
          d.outcome === "ai" && isRankGrammar(d.grammar)
            ? d.line!.refs.filter((r) => standingsIds.has(r))
            : [],
        ),
      );
      // ⓒ 같은 경기 결과 통과 줄은 하나만
      const aiResultMatches = verified.detail
        .filter((d) => d.outcome === "ai" && isResultGrammar(d.grammar))
        .flatMap((d) => d.line!.refs.filter((r) => matchIds.has(r)));
      expect(new Set(aiResultMatches).size).toBe(aiResultMatches.length);
      const templateRefs = new Set<string>();
      for (const d of verified.detail) {
        const i = d.n - 1;
        const lineCheck = judgement.check!.lines[i]!;
        if (d.outcome === "ai") {
          expect(lineCheck.ok, `${day.date} L${d.n}`).toBe(true);
          expect(d.line).toEqual({
            text: judgement.check!.substitutions[i]!.text,
            ai: true,
            refs: parsed.lines[i]!.r,
          });
          expect(d.grammar).toBe(lineCheck.grammar);
        } else if (d.reasons.includes("duplicate-ai-result")) {
          expect(lineCheck.ok, `${day.date} L${d.n}`).toBe(true);
          expect(d.line).toBeNull();
        } else {
          expect(lineCheck.ok, `${day.date} L${d.n}`).toBe(false);
          const expected = templateLineForRefs(day.input, parsed.lines[i]!.r, {
            ...templateCtx(),
            compForm,
          });
          if (d.outcome === "template") {
            expect(d.line).toEqual(expected);
            expect(d.line!.ai).toBe(false);
          } else {
            expect(d.line).toBeNull();
          }
        }
        if (d.line) {
          expect(BriefLineSchema.safeParse(d.line).success).toBe(true);
          if (!d.line.ai) {
            for (const ref of d.line.refs) {
              expect(
                templateRefs.has(ref),
                `${day.date} 근거 ${ref} 중복`,
              ).toBe(false);
              expect(resultRefs.has(ref), `${day.date} 결과 ${ref} 중복`).toBe(
                false,
              );
              expect(rankRefs.has(ref), `${day.date} 순위 ${ref} 중복`).toBe(
                false,
              );
              templateRefs.add(ref);
            }
          }
        }
        if (d.outcome === "dropped") {
          expect(
            d.reasons.some((r) =>
              [
                "no-template",
                "duplicate-template",
                "duplicate-result",
                "duplicate-rank",
                "duplicate-ai-result",
              ].includes(r),
            ),
            `${day.date} L${d.n}`,
          ).toBe(true);
        }
      }
      expect(verified.lines.length).toBeLessThanOrEqual(5);
      // llm·mixed 파일로 쓸 수 있다(mode ↔ 줄 일관성)
      if (verified.ai > 0) {
        const mode = verified.ai === verified.lines.length ? "llm" : "mixed";
        expect(
          BriefFileSchema.safeParse({
            date: day.date,
            generatedAt: "2026-10-17T21:31:00.000Z",
            runId: "collect-dev-20261017T213000Z-0000",
            mode,
            lines: verified.lines,
          }).success,
          day.date,
        ).toBe(true);
      }
    }
    // 골든셋이 게시 경로를 실제로 지난다(검사기 판이 바뀌어도 통과 줄이 하나는 있어야 의미가 있다)
    expect(published).toBeGreaterThan(0);
    expect(aiTotal).toBeGreaterThan(0);
  });

  it("D51 — 모델이 보지 못한 경기를 가리킨 줄(ref-hidden)도 템플릿은 전체 입력에서 만든다(golden 10-11 바쁜 날)", () => {
    const day = golden.days.find((d) => d.date === "2026-10-11")!;
    const text = mockText("golden-2026-10-11");
    const hidden = briefLlmInput(day.input).hiddenRefs;
    const judgement = judgeBriefResponse(
      { ok: true, text },
      day.input,
      ctx.check,
      { hiddenRefs: hidden },
    );
    const hiddenLines = judgement.check!.lines.filter((l) =>
      l.reasons.some((r) => r.code === "ref-hidden"),
    );
    // 지금 실측 응답에는 잘린 근거 줄이 있다 — 없어지면 이 테스트는 의미가 없으니 알린다
    expect(hiddenLines.length).toBeGreaterThan(0);
    const parsed = parseBriefOutput(text);
    if (!parsed.ok) throw new Error("unreachable");
    const verified = composeVerifiedBrief({
      output: parsed.lines,
      check: judgement.check!,
      input: day.input,
      template: templateCtx(),
    });
    for (const l of hiddenLines) {
      const d = verified.detail[l.n - 1]!;
      expect(d.reasons).toContain("ref-hidden");
      if (d.outcome === "template") {
        expect(d.line!.refs.some((r) => hidden.has(r))).toBe(true);
      }
    }
  });
});

// ─── 합성 판정 — 중복·템플릿 없음·스키마 방어선 ──────────────────────────────

/** 합성 검사 결과 — 줄마다 통과 여부·사유·게시 문장 */
function syntheticCheck(
  lines: Array<{ ok: boolean; text: string; code?: string; grammar?: string }>,
): Pick<BriefCheckResult, "lines" | "substitutions"> {
  return {
    lines: lines.map((l, i): BriefLineCheck => ({
      n: i + 1,
      ok: l.ok,
      reasons: l.ok
        ? []
        : [{ code: (l.code ?? "grammar-unknown") as "grammar-unknown" }],
      warnings: [],
      grammar: l.ok ? (l.grammar ?? "win") : null,
    })),
    substitutions: lines.map((l) => ({
      text: l.text,
      masked: l.text,
      replaced: [],
      particleFixes: 0,
    })),
  };
}

describe("composeVerifiedBrief — 합성 판정", () => {
  const input = (): BriefInput =>
    golden.days.find((d) => d.date === "2026-10-11")!.input;

  it("통과 = 득점 줄 + 강등 = 같은 경기 결과 줄 → 결과 템플릿 줄을 남긴다(그날 경기 결과가 빠지지 않게)", () => {
    const [a] = input().matches.map((m) => m.id);
    const verified = composeVerifiedBrief({
      output: [
        { t: "Kane이 2골을 넣었다.", r: [a!] },
        { t: "결과 줄(점수 틀림)", r: [a!] },
      ],
      check: syntheticCheck([
        { ok: true, text: "케인이 2골을 넣었다.", grammar: "count" },
        { ok: false, text: "결과 줄", code: "score-mismatch" },
      ]),
      input: input(),
      template: templateCtx(),
    });
    expect(verified.detail.map((d) => d.outcome)).toEqual(["ai", "template"]);
    expect(verified.lines.map((l) => [l.ai, l.refs])).toEqual([
      [true, [a]],
      [false, [a]],
    ]);
  });

  it("통과 = 결과 줄 + 강등 = 같은 경기 결과 줄 → 템플릿 줄을 버린다(duplicate-result — 결과 줄이 뒤에 있어도)", () => {
    const [a] = input().matches.map((m) => m.id);
    for (const grammar of [
      "win",
      "draw",
      "loss",
      "pens",
      "end",
      "endPens",
      "win+rank",
      "win+goal",
    ]) {
      const verified = composeVerifiedBrief({
        output: [
          { t: "강등", r: [a!] },
          { t: "통과", r: [a!, "sPL"] },
        ],
        check: syntheticCheck([
          { ok: false, text: "강등" },
          { ok: true, text: "아스널이 첼시를 2-1로 꺾었다.", grammar },
        ]),
        input: input(),
        template: templateCtx(),
      });
      expect(verified.detail[0], grammar).toMatchObject({
        outcome: "dropped",
        reasons: ["grammar-unknown", "duplicate-result"],
      });
      expect(verified.lines, grammar).toHaveLength(1);
    }
    // 결과 절이 없는 문형(득점·도움·순위)은 결과 근거로 치지 않는다
    for (const grammar of [
      "goal",
      "count",
      "assist",
      "rank",
      "rankList",
      "gap",
    ]) {
      expect(isResultGrammar(grammar), grammar).toBe(false);
    }
    expect(isResultGrammar(null)).toBe(false);
  });

  it("앞 템플릿 줄과 근거가 겹치면 버린다(duplicate-template), 순위 문형 통과 줄과 같은 순위표의 템플릿 줄도 버린다(duplicate-rank — 리뷰 반영)", () => {
    const [a, b] = input().matches.map((m) => m.id);
    const sid = input().standings[0]!.id;
    const verified = composeVerifiedBrief({
      output: [
        { t: "강등 1", r: [b!] }, // 템플릿
        { t: "강등 2", r: [b!, sid] }, // 첫 경기 근거 b → 앞 템플릿과 중복 → 버림
        { t: "순위 통과", r: [sid] },
        { t: "강등 4", r: [sid] }, // 순위표 템플릿 — 순위 통과 줄과 같은 순위표 → 버림
        { t: "결과 통과", r: [a!] },
      ],
      check: syntheticCheck([
        { ok: false, text: "강등 1", code: "score-mismatch" },
        { ok: false, text: "강등 2" },
        { ok: true, text: "도르트문트가 승점 13으로 선두다.", grammar: "rank" },
        { ok: false, text: "강등 4" },
        { ok: true, text: "아스널이 첼시를 2-1로 꺾었다.", grammar: "win" },
      ]),
      input: input(),
      template: templateCtx(),
    });
    expect(
      verified.detail.map((d) => [d.outcome, d.reasons.at(-1) ?? null]),
    ).toEqual([
      ["template", "score-mismatch"],
      ["dropped", "duplicate-template"],
      ["ai", null],
      ["dropped", "duplicate-rank"],
      ["ai", null],
    ]);
    expect(verified.lines.map((l) => [l.ai, l.refs])).toEqual([
      [false, [b]],
      [true, [sid]],
      [true, [a]],
    ]);
    expect(verified).toMatchObject({ ai: 2, template: 1, dropped: 2 });
    expect(briefGrammarCounts(verified)).toEqual({ rank: 1, win: 1 });
  });

  it("순위 문형은 rank·rankList·keep·move·gap 절이 하나라도 있으면('win+rank' 포함, 결과 줄 뒤에 있어도) 그 순위표 템플릿 줄을 버린다", () => {
    const [a] = input().matches.map((m) => m.id);
    const sid = input().standings[0]!.id;
    for (const grammar of [
      "rank",
      "rankList",
      "keep",
      "move",
      "gap",
      "win+rank",
    ]) {
      const verified = composeVerifiedBrief({
        output: [
          { t: "강등", r: [sid] },
          { t: "통과", r: [a!, sid] },
        ],
        check: syntheticCheck([
          { ok: false, text: "강등" },
          { ok: true, text: "아스널이 승점 15로 2위다.", grammar },
        ]),
        input: input(),
        template: templateCtx(),
      });
      expect(verified.detail[0], grammar).toMatchObject({
        outcome: "dropped",
        reasons: ["grammar-unknown", "duplicate-rank"],
      });
    }
    for (const grammar of ["win", "goal", "count", "assist", "draw"]) {
      expect(isRankGrammar(grammar), grammar).toBe(false);
    }
    expect(isRankGrammar(null)).toBe(false);
  });

  it("같은 경기 결과를 다룬 통과 줄이 둘이면 뒤 줄은 버린다(duplicate-ai-result) — 다른 경기 결과·득점 줄은 남긴다", () => {
    const [a, b] = input().matches.map((m) => m.id);
    const verified = composeVerifiedBrief({
      output: [
        { t: "결과 1", r: [a!] },
        { t: "득점", r: [a!] },
        { t: "결과 1 다시", r: [a!] },
        { t: "결과 2", r: [b!] },
      ],
      check: syntheticCheck([
        {
          ok: true,
          text: "아우크스부르크와 바이에른 뮌헨이 2-2로 비겼다.",
          grammar: "draw",
        },
        { ok: true, text: "케인이 골을 넣었다.", grammar: "goal" },
        {
          ok: true,
          text: "아우크스부르크와 바이에른 뮌헨의 경기는 2-2로 끝났다.",
          grammar: "end",
        },
        {
          ok: true,
          text: "아틀레티코 마드리드가 알라베스 원정에서 2-1로 이겼다.",
          grammar: "win",
        },
      ]),
      input: input(),
      template: templateCtx(),
    });
    expect(verified.detail.map((d) => [d.outcome, d.reasons])).toEqual([
      ["ai", []],
      ["ai", []],
      ["dropped", ["duplicate-ai-result"]],
      ["ai", []],
    ]);
    expect(verified).toMatchObject({ ai: 3, template: 0, dropped: 1 });
    expect(briefGrammarCounts(verified)).toEqual({ draw: 1, goal: 1, win: 1 });
  });

  it("근거의 템플릿 줄이 없으면(입력에 없는 근거) 그 줄은 버린다", () => {
    const verified = composeVerifiedBrief({
      output: [{ t: "강등", r: ["m999999"] }],
      check: syntheticCheck([{ ok: false, text: "강등", code: "ref-unknown" }]),
      input: input(),
      template: templateCtx(),
    });
    expect(verified.detail[0]).toMatchObject({
      outcome: "dropped",
      reasons: ["ref-unknown", "no-template"],
      line: null,
    });
    expect(verified.lines).toEqual([]);
  });

  it("방어선 — 통과 줄이 파일 스키마(앞뒤 공백·80자·근거 id 형식)를 통과하지 못하면 강등 줄로 다룬다(schema)", () => {
    const [a] = input().matches.map((m) => m.id);
    const verified = composeVerifiedBrief({
      output: [
        { t: "통과", r: [a!] },
        { t: "통과", r: ["Bad-Ref"] },
      ],
      check: syntheticCheck([
        { ok: true, text: " 앞에 공백이 있는 문장이다." },
        { ok: true, text: "근거 id 형식이 틀린 줄이다." },
      ]),
      input: input(),
      template: templateCtx(),
    });
    expect(verified.detail[0]).toMatchObject({
      outcome: "template",
      reasons: ["schema"],
    });
    expect(verified.detail[0]!.line!.ai).toBe(false);
    // 형식이 틀린 근거는 템플릿도 없다 → 버림
    expect(verified.detail[1]).toMatchObject({
      outcome: "dropped",
      reasons: ["schema", "no-template"],
    });
  });

  it("검사 결과 줄 수가 출력과 다르면 던진다(호출부가 판정 없음으로 템플릿)", () => {
    expect(() =>
      composeVerifiedBrief({
        output: [{ t: "a", r: ["m1"] }],
        check: syntheticCheck([]),
        input: input(),
        template: templateCtx(),
      }),
    ).toThrow(RangeError);
  });
});

describe("하루 요청 상한(D56 — FR-25 하루 1~3요청)", () => {
  const rec = (
    runId: string,
    startedAt: string,
    requests?: number,
    job: "collect" | "weekly" = "collect",
  ) => ({
    runId,
    job,
    startedAt,
    ...(requests === undefined ? {} : { brief: { requests } }),
  });

  it("같은 브리핑 날짜(startedAt의 KST 날짜)의 collect 기록만 합산 — 다른 날·weekly·eval·필드 없는 옛 기록은 0", () => {
    const runs = [
      rec("collect-prod-a", "2026-10-10T21:30:00.000Z", 2), // 10-11 06:30 KST
      rec("collect-prod-b", "2026-10-10T14:59:59.000Z", 3), // 10-10 23:59 KST — 다른 날
      rec("collect-prod-c", "2026-10-11T14:00:00.000Z"), // 10-11 23:00 KST — 필드 없음(0)
      rec("weekly-prod-d", "2026-10-10T22:00:00.000Z", 5, "weekly"),
      rec("eval-dev-e", "2026-10-11T03:00:00.000Z", 10), // eval — 상한 밖
    ];
    expect(briefDailyAllowance({ runs, briefDate: "2026-10-11" })).toEqual({
      used: 2,
      remaining: 1,
      attempts: 1,
    });
    expect(briefDailyAllowance({ runs: [], briefDate: "2026-10-11" })).toEqual({
      used: 0,
      remaining: 3,
      attempts: BRIEF_MAX_ATTEMPTS,
    });
    expect(
      briefDailyAllowance({
        runs: [
          rec("collect-prod-a", "2026-10-10T21:30:00.000Z", 2),
          rec("collect-prod-f", "2026-10-10T22:10:00.000Z", 1),
        ],
        briefDate: "2026-10-11",
      }),
    ).toEqual({ used: 3, remaining: 0, attempts: 0 });
    // 상한을 넘겨 기록돼도(수동 실행 등) 남은 몫은 0 아래로 내려가지 않는다
    expect(
      briefDailyAllowance({
        runs: [rec("collect-prod-a", "2026-10-10T21:30:00.000Z", 5)],
        briefDate: "2026-10-11",
      }),
    ).toEqual({ used: 5, remaining: 0, attempts: 0 });
    expect(BRIEF_DAILY_REQUEST_CAP).toBe(3);
  });

  it("planBriefAttempts — 이번 실행과 같은 env 기록만(prod = runs.json, dev = runs-dev.json), 읽지 못하면 실행당 상한으로 진행", () => {
    // RunLog 전체 모양(planBriefAttempts는 tryLoadRuns 결과를 받는다)
    const full = (env: RunEnv, r: ReturnType<typeof rec>): RunLog => ({
      ...r,
      env,
      finishedAt: r.startedAt,
      collected: 0,
      clusters: 0,
      summarized: 0,
      downgraded: 0,
      tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
      costUsd: 0,
      apiCalls: { footballData: 0, apiFootball: 0 },
      sources: [],
      status: "success",
    });
    const load = {
      ok: true as const,
      prodRuns: [
        full("prod", rec("collect-prod-a", "2026-10-10T21:30:00.000Z", 3)),
      ],
      devRuns: [
        full("dev", rec("collect-dev-a", "2026-10-10T21:30:00.000Z", 1)),
      ],
    };
    expect(planBriefAttempts(load, "prod", "2026-10-11")).toMatchObject({
      readable: true,
      used: 3,
      attempts: 0,
    });
    expect(planBriefAttempts(load, "dev", "2026-10-11")).toMatchObject({
      readable: true,
      used: 1,
      attempts: 2,
    });
    expect(
      planBriefAttempts(
        { ok: false, file: "runs-dev.json", error: "JSON 형식 오류" },
        "dev",
        "2026-10-11",
      ),
    ).toEqual({
      readable: false,
      file: "runs-dev.json",
      error: "JSON 형식 오류",
      attempts: BRIEF_MAX_ATTEMPTS,
    });
  });
});

describe("시도 customId·강등 원인", () => {
  it("첫 시도 brief-<발행일>, FR-29 재시도 brief-<발행일>-r1 (fixtures/llm/README.md 예약 규칙)", () => {
    expect(briefAttemptCustomId("2026-10-11", 1)).toBe("brief-2026-10-11");
    expect(briefAttemptCustomId("2026-10-11", 2)).toBe("brief-2026-10-11-r1");
    expect(() => briefAttemptCustomId("2026-10-11", 0)).toThrow(RangeError);
  });

  it("downgrade-all·판정 없음 → 원인, 원인 → BriefOutcome reason", () => {
    const transport = { stage: "transport" as const, reason: null };
    const cases: Array<
      [Parameters<typeof briefFailCause>[0], string, "llm" | "output"]
    > = [
      [
        { judgement: null, errorType: null, deadlineReached: false },
        "check-error",
        "llm",
      ],
      [
        { judgement: transport, errorType: "refusal", deadlineReached: false },
        "refusal",
        "llm",
      ],
      [
        {
          judgement: transport,
          errorType: "max_tokens",
          deadlineReached: false,
        },
        "max-tokens",
        "output",
      ],
      [
        { judgement: transport, errorType: "deadline", deadlineReached: false },
        "deadline",
        "llm",
      ],
      // 마감으로 줄인 타임아웃에 걸린 연결 오류 = 마감, 마감 전 연결 오류 = 전송 실패
      [
        {
          judgement: transport,
          errorType: "connection_error",
          deadlineReached: true,
        },
        "deadline",
        "llm",
      ],
      [
        {
          judgement: transport,
          errorType: "connection_error",
          deadlineReached: false,
        },
        "transport",
        "llm",
      ],
      [
        {
          judgement: transport,
          errorType: "overloaded_error",
          deadlineReached: true,
        },
        "transport",
        "llm",
      ],
      [
        {
          judgement: { stage: "zod", reason: "json" },
          errorType: null,
          deadlineReached: false,
        },
        "output",
        "output",
      ],
      [
        {
          judgement: { stage: "whole", reason: "korean-ratio" },
          errorType: null,
          deadlineReached: false,
        },
        "output",
        "output",
      ],
    ];
    for (const [input, cause, reason] of cases) {
      expect(briefFailCause(input), JSON.stringify(input)).toBe(cause);
      expect(briefFailReason(briefFailCause(input))).toBe(reason);
    }
  });
});
