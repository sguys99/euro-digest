/**
 * fixtures/llm 브리핑 mock 가드 (M0-36) — 일일 브리핑 mock 응답·기대 판정 표·정형 입력이 서로 맞는지 검사한다.
 *
 * - mock/ 아래 모든 파일이 `MockFixtureSchema`(scripts/lib/llm.ts)를 통과한다.
 * - mock/by-id/brief-*.json ↔ brief-cases.json 케이스가 1:1이고, customId 규칙(발행일 `brief-YYYY-MM-DD` ·
 *   실패 사례 `brief-case-<유형>`)을 지킨다. 발행일 id는 그날 입력의 briefDate와 같다.
 * - 각 케이스의 stage가 fixture 내용과 맞는다: zod 단계 사례만 M0-30 임시 출력 스키마에 실패하고,
 *   transport 사례는 errored·max_tokens·refusal이다. 기대 줄 번호·사람 검토 수가 서로 맞는다.
 * - brief-inputs/의 정형 입력(A~F)은 정해진 키만 가진다(기사 텍스트 없음, D24). E meta의 입력 창이 time.ts와 같다.
 * - 대표 케이스를 `createLlmClient({ mode: "mock" }).callSingle`로 실제로 불러 llm.ts 경유 결과를 확인한다(통합).
 * - 비밀값 흔적·URL이 없다(CLAUDE.md §1-6·§1-8).
 *
 * 출력 판정 로직(M1-23)은 아직 없다. 여기서는 fixture 자체만 검사하고 판정은 brief-cases.json 값을 믿는다.
 * M1-20에서 출력 스키마가 확정되면 아래 임시 스키마를 확정 스키마로 바꾸고 mock을 다시 만든다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { kstWindowRangeUtc, shiftDate } from "@/lib/time";

import {
  createLlmClient,
  CUSTOM_ID_PATTERN,
  MockFixtureSchema,
  type LlmFailure,
  type LlmLogEvent,
  type LlmRequest,
  type LlmResult,
  type LlmSuccess,
  type MockFixture,
} from "../scripts/lib/llm";
import { scanTextForSecrets } from "../scripts/lib/secret-scan";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const LLM_DIR = path.join(ROOT, "fixtures/llm");
const MOCK_DIR = path.join(LLM_DIR, "mock");
const BY_ID = path.join(MOCK_DIR, "by-id");
const readText = (rel: string): string =>
  readFileSync(path.join(LLM_DIR, rel), "utf8");
const readJson = (rel: string): unknown => JSON.parse(readText(rel));

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const DATE_ID = /^brief-(\d{4}-\d{2}-\d{2})$/;
const CASE_ID = /^brief-case-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERDICT = /^(?:ok|retry|downgrade-all|downgrade-line:\d+(?:,\d+)*)$/;
const INPUT_KEYS = ["A", "B", "C", "D", "E", "F"] as const;

// ─── M0-30 임시 출력 스키마 (README 요약과 같음 — M1-20에서 확정 스키마로 교체) ───
const BriefOutputTmpSchema = z.strictObject({
  l: z
    .array(
      z.strictObject({
        t: z.string().min(5).max(150),
        r: z.array(z.string().min(1)).min(1).max(6),
      }),
    )
    .min(1)
    .max(5),
});

// ─── 정형 입력 (임시 형식 — M1-19에서 확정). 정해진 키만 허용해 기사 텍스트가 섞이지 않게 한다 ───
const Score = z.string().regex(/^\d+-\d+$/);
const BriefInputSchema = z.strictObject({
  briefDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  matches: z.array(
    z.strictObject({
      id: z.string().regex(/^m\d+$/),
      comp: z.string().min(1),
      round: z.string().min(1),
      home: z.string().min(1),
      away: z.string().min(1),
      ft: Score,
      ht: Score,
      goals: z
        .array(
          z.strictObject({
            min: z.string().regex(/^\d+(?:\+\d+)?$/),
            team: z.string().min(1),
            player: z.string().min(1),
            assist: z.string().min(1).optional(),
            type: z.enum(["penalty", "own_goal"]).optional(),
          }),
        )
        .nullable(),
    }),
  ),
  standings: z.array(
    z.strictObject({
      id: z.string().regex(/^s[A-Za-z0-9]+$/),
      comp: z.string().min(1),
      note: z.string().min(1).optional(),
      rows: z.array(
        z.strictObject({
          pos: z.number().int().positive(),
          team: z.string().min(1),
          played: z.number().int().nonnegative(),
          pts: z.number().int().nonnegative(),
          gd: z.number().int(),
          prev: z.number().int().positive().optional(),
        }),
      ),
    }),
  ),
  korean: z
    .array(
      z.strictObject({
        id: z.string().regex(/^k\d+$/),
        player: z.string().min(1),
        team: z.string().min(1),
        match: z.string().regex(/^m\d+$/),
        started: z.boolean(),
        minutes: z.number().int().nonnegative(),
        goals: z.number().int().nonnegative(),
        assists: z.number().int().nonnegative(),
        subOn: z.number().int().positive().optional(),
        subOff: z.number().int().positive().optional(),
      }),
    )
    .optional(),
});
type BriefInput = z.infer<typeof BriefInputSchema>;

// ─── brief-cases.json 경계 파싱 ──────────────────────────────────────────
const LineNoteSchema = z.strictObject({
  n: z.number().int().min(1),
  human: z.enum(["ok", "error", "unsupported"]).optional(),
  code: z.enum(["pass", "downgrade", "whole", "fix", "undecided"]),
  why: z.string().min(1),
});
const CaseSchema = z
  .strictObject({
    id: z.string().regex(CUSTOM_ID_PATTERN),
    input: z.enum(INPUT_KEYS),
    origin: z.enum(["real", "synthetic"]),
    source: z.string().min(1),
    base: z.string().optional(),
    request: z
      .strictObject({
        prompt: z.enum(["m0-30-short", "m0-30-long"]),
        mode: z.enum(["single", "batch"]),
        thinking: z.enum(["adaptive", "disabled"]),
        effort: z.enum(["low", "medium"]),
        cacheSystem: z.boolean(),
        maxTokens: z.number().int().positive(),
      })
      .optional(),
    types: z.array(z.string().min(1)).min(1),
    stage: z.enum(["none", "transport", "zod", "whole", "line"]),
    expected: z.string().regex(VERDICT).optional(),
    undecidedLines: z.array(z.number().int().min(1)).optional(),
    candidates: z.array(z.string().regex(VERDICT)).min(2).optional(),
    llm: z.strictObject({
      ok: z.boolean(),
      errorType: z.string().min(1).optional(),
      retryable: z.boolean().optional(),
      attempts: z.number().int().min(1),
    }),
    review: z
      .strictObject({
        ok: z.number().int().nonnegative(),
        error: z.number().int().nonnegative(),
        unsupported: z.number().int().nonnegative(),
      })
      .optional(),
    lines: z.array(LineNoteSchema).optional(),
    note: z.string().min(1),
  })
  .refine(
    (c) => (c.expected === undefined) !== (c.candidates === undefined),
    "expected(판정 확정)와 candidates(판정 미정) 중 하나만 둔다",
  );
type BriefCase = z.infer<typeof CaseSchema>;
const CasesFileSchema = z.object({
  task: z.literal("M0-36"),
  verdicts: z.record(z.string(), z.string()),
  traps: z.array(z.string().min(1)).min(1),
  inputs: z.record(
    z.enum(INPUT_KEYS),
    z.strictObject({
      file: z.string().regex(/^brief-inputs\/\d{4}-\d{2}-\d{2}\.json$/),
      briefDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      origin: z.enum(["M0-30", "M0-34"]),
    }),
  ),
  prompts: z.record(
    z.enum(["m0-30-short", "m0-30-long"]),
    z.string().regex(/^brief-inputs\/prompt-m0-30-(?:short|long)\.md$/),
  ),
  cases: z.array(CaseSchema).min(1),
});

const casesFile = CasesFileSchema.parse(readJson("brief-cases.json"));
const CASES = casesFile.cases;
const caseById = new Map(CASES.map((c) => [c.id, c]));

function fixtureOf(id: string): MockFixture {
  return MockFixtureSchema.parse(readJson(`mock/by-id/${id}.json`));
}
function inputOf(key: (typeof INPUT_KEYS)[number]): BriefInput {
  return BriefInputSchema.parse(readJson(casesFile.inputs[key].file));
}
/** 엄격 JSON.parse + 임시 스키마. 실패하면 null */
function parseOutputStrict(text: string) {
  try {
    const parsed = BriefOutputTmpSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
function downgradeLines(verdict: string | undefined): number[] {
  const m = verdict?.match(/^downgrade-line:(.+)$/);
  return m ? m[1]!.split(",").map(Number) : [];
}
function sorted(values: Iterable<number>): number[] {
  return [...values].sort((a, b) => a - b);
}

const briefMockFiles = readdirSync(BY_ID)
  .filter((f) => f.startsWith("brief-") && f.endsWith(".json"))
  .sort();

// ─── mock 파일 ───────────────────────────────────────────────────────────

describe("mock 파일 형식 (fixtures/llm/mock)", () => {
  const all = listFiles(MOCK_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.relative(MOCK_DIR, f))
    .sort();

  it.each(all)("%s: MockFixtureSchema를 통과한다", (rel) => {
    const parsed = MockFixtureSchema.safeParse(readJson(`mock/${rel}`));
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("by-hash는 아직 비어 있다(M1-20 이후) — .gitkeep만 유지", () => {
    expect(readdirSync(path.join(MOCK_DIR, "by-hash"))).toEqual([".gitkeep"]);
  });

  it("brief-*.json 파일과 brief-cases.json 케이스가 1:1이다", () => {
    expect(briefMockFiles.map((f) => f.replace(/\.json$/, "")).sort()).toEqual(
      CASES.map((c) => c.id).sort(),
    );
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });

  it("customId 규칙: 발행일 id는 실제 출력이고 그날 입력의 briefDate와 같다, 실패 사례는 brief-case-<유형>", () => {
    for (const c of CASES) {
      const date = c.id.match(DATE_ID)?.[1];
      if (date) {
        expect(c.origin, c.id).toBe("real");
        expect(casesFile.inputs[c.input].briefDate, c.id).toBe(date);
        expect(inputOf(c.input).briefDate, c.id).toBe(date);
      } else {
        expect(c.id, c.id).toMatch(CASE_ID);
        expect(c.id, c.id).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      }
    }
    // 예약 패턴(brief-<날짜>-r1, 재시도 응답)은 아직 만들지 않았다
    expect(briefMockFiles.some((f) => /-r\d+\.json$/.test(f))).toBe(false);
  });

  it("모든 브리핑 mock note에 임시 형식·M1-20 재생성 안내가 있고, 합성은 '합성 —'으로 시작한다", () => {
    for (const c of CASES) {
      const note = fixtureOf(c.id).note ?? "";
      expect(note, c.id).toContain("M0-30 임시 스키마");
      expect(note, c.id).toContain("M1-20");
      if (c.origin === "synthetic") expect(note, c.id).toMatch(/^합성 — /);
    }
  });
});

// ─── 기대 판정 표 ────────────────────────────────────────────────────────

describe("brief-cases.json 기대 판정 표", () => {
  it("케이스 입력 파일·프롬프트 파일이 있다", () => {
    for (const key of INPUT_KEYS) {
      expect(() => readText(casesFile.inputs[key].file)).not.toThrow();
    }
    for (const rel of Object.values(casesFile.prompts)) {
      expect(readText(rel).trim().length).toBeGreaterThan(500);
    }
  });

  it("실제 출력은 원천 설정·사람 검토가 있고, 합성은 실제 케이스를 기준으로 한다", () => {
    for (const c of CASES) {
      if (c.origin === "real") {
        expect(c.request, c.id).toBeDefined();
        expect(c.review, c.id).toBeDefined();
        expect(c.base, c.id).toBeUndefined();
      } else {
        expect(c.request, c.id).toBeUndefined();
        expect(caseById.get(c.base ?? "")?.origin, c.id).toBe("real");
      }
    }
  });

  it.each(CASES.map((c) => [c.id, c] as const))(
    "%s: stage가 fixture 내용과 맞는다",
    (_, c) => {
      const fixture = fixtureOf(c.id);
      const transportFail =
        fixture.type !== "succeeded" || fixture.stop_reason !== "end_turn";
      expect(transportFail, "transport 단계 = errored·max_tokens·refusal").toBe(
        c.stage === "transport",
      );
      expect(c.llm.ok).toBe(c.stage !== "transport");
      if (fixture.type !== "succeeded" || transportFail) return;
      // zod 단계 사례만 임시 스키마(엄격 파싱)에 실패한다
      expect(parseOutputStrict(fixture.text) === null).toBe(c.stage === "zod");
    },
  );

  it.each(CASES.map((c) => [c.id, c] as const))(
    "%s: 줄 번호·사람 검토 수가 서로 맞는다",
    (_, c) => {
      const fixture = fixtureOf(c.id);
      const output =
        fixture.type === "succeeded" ? parseOutputStrict(fixture.text) : null;
      const lineCount = output?.l.length ?? 0;
      const downgrade = downgradeLines(c.expected);
      const undecided = c.undecidedLines ?? [];
      for (const n of [
        ...downgrade,
        ...undecided,
        ...(c.lines ?? []).map((l) => l.n),
      ]) {
        expect(n, `${c.id} 줄 ${n}`).toBeLessThanOrEqual(lineCount);
      }
      expect(downgrade.filter((n) => undecided.includes(n))).toEqual([]);
      if (c.lines) {
        const coded = (code: string) =>
          sorted(c.lines!.filter((l) => l.code === code).map((l) => l.n));
        expect(coded("undecided")).toEqual(sorted(undecided));
        if (downgrade.length > 0) expect(coded("downgrade")).toEqual(downgrade);
      }
      if (c.review) {
        expect(c.review.ok + c.review.error + c.review.unsupported).toBe(
          lineCount,
        );
        const human = (v: string) =>
          (c.lines ?? []).filter((l) => l.human === v).length;
        expect(human("error")).toBe(c.review.error);
        expect(human("unsupported")).toBe(c.review.unsupported);
      }
    },
  );

  it("발행일 mock은 fixtures/brief-sample.json의 같은 날 줄과 같다(ai:false 줄은 _downgrade에 LLM 원문)", () => {
    const sample = z
      .object({
        days: z.array(
          z.object({
            date: z.string(),
            lines: z.array(
              z.object({
                ai: z.boolean(),
                refs: z.array(z.string()),
                textRaw: z.string().optional(),
                _downgrade: z.string().optional(),
              }),
            ),
          }),
        ),
      })
      .parse(
        JSON.parse(
          readFileSync(path.join(ROOT, "fixtures/brief-sample.json"), "utf8"),
        ),
      );
    const dated = CASES.filter((c) => DATE_ID.test(c.id));
    expect(dated.length).toBeGreaterThanOrEqual(5);
    for (const c of dated) {
      const date = c.id.match(DATE_ID)![1]!;
      const day = sample.days.find((d) => d.date === date);
      const fixture = fixtureOf(c.id);
      if (fixture.type !== "succeeded") throw new Error(c.id);
      const output = parseOutputStrict(fixture.text);
      expect(day, date).toBeDefined();
      expect(output?.l.length, date).toBe(day!.lines.length);
      day!.lines.forEach((line, i) => {
        const llmLine = output!.l[i]!;
        expect(line.refs, `${date} L${i + 1}`).toEqual(llmLine.r);
        if (line.ai) expect(line.textRaw).toBe(llmLine.t);
        else expect(line._downgrade).toContain(llmLine.t);
      });
      // brief-sample에서 템플릿으로 강등된 줄 = 기대 판정의 강등 줄(2026-10-11 L5)
      const sampleDowngraded = day!.lines.flatMap((l, i) =>
        l.ai ? [] : [i + 1],
      );
      if (sampleDowngraded.length > 0) {
        expect(downgradeLines(c.expected)).toEqual(sampleDowngraded);
      }
    }
  });
});

// ─── 정형 입력 ───────────────────────────────────────────────────────────

describe("브리핑 정형 입력 (fixtures/llm/brief-inputs)", () => {
  it("폴더에는 입력 6개·E meta·임시 프롬프트 2개·임시 사전만 있다", () => {
    expect(readdirSync(path.join(LLM_DIR, "brief-inputs")).sort()).toEqual(
      [
        ...Object.values(casesFile.inputs).map((v) => path.basename(v.file)),
        "2026-10-11.meta.json",
        "names-ko.tmp.json",
        "prompt-m0-30-long.md",
        "prompt-m0-30-short.md",
      ].sort(),
    );
  });

  it.each(INPUT_KEYS.map((k) => [k] as const))(
    "입력 %s: 정해진 키만 있는 JSON이고 파일 이름 날짜 = briefDate",
    (key) => {
      const entry = casesFile.inputs[key];
      const input = inputOf(key);
      expect(path.basename(entry.file, ".json")).toBe(input.briefDate);
      expect(entry.briefDate).toBe(input.briefDate);
      // 근거 id가 입력 안에서 유일하고, 한국 선수 항목의 경기 id가 입력에 있다
      const ids = [
        ...input.matches.map((m) => m.id),
        ...input.standings.map((s) => s.id),
        ...(input.korean ?? []).map((k) => k.id),
      ];
      expect(new Set(ids).size).toBe(ids.length);
      for (const k of input.korean ?? []) {
        expect(ids, `${key} ${k.id}`).toContain(k.match);
      }
    },
  );

  it("E meta: 입력 창 = 발행일 전날 UTC 하루(KST 09:00~09:00), 종료 경기·한국 선수 수가 입력과 같다", () => {
    const meta = z
      .object({
        window: z.object({
          base: z.string(),
          kst: z.object({ fromKst: z.string(), toKst: z.string() }),
          range: z.object({ start: z.string(), end: z.string() }),
        }),
        finished: z.number().int(),
        korean: z.number().int(),
        afFdMapping: z.array(
          z.object({ af: z.number().int(), fd: z.number().int() }),
        ),
      })
      .parse(readJson("brief-inputs/2026-10-11.meta.json"));
    const input = inputOf("E");
    expect(meta.window.base).toBe(shiftDate(input.briefDate, -1));
    expect(meta.window.range).toEqual(
      kstWindowRangeUtc(meta.window.base, meta.window.kst),
    );
    expect(meta.window.range).toEqual({
      start: `${meta.window.base}T00:00:00.000Z`,
      end: `${input.briefDate}T00:00:00.000Z`,
    });
    expect(meta.finished).toBe(input.matches.length);
    expect(meta.korean).toBe(input.korean?.length);
    // 득점(goals)이 있는 경기 = API-Football로 조회한 경기
    const withGoals = input.matches
      .filter((m) => m.goals !== null)
      .map((m) => m.id);
    expect(sorted(meta.afFdMapping.map((p) => p.fd))).toEqual(
      sorted(withGoals.map((id) => Number(id.slice(1)))),
    );
  });

  it("임시 고유명사 사전은 '확정 아님'을 밝히고 configs/names.ko.json 우선을 적는다", () => {
    const dict = z
      .object({
        _note: z.string(),
        teams: z.record(z.string(), z.string().min(1)),
        players: z.record(z.string(), z.string().min(1)),
        comps: z.record(z.string(), z.string().min(1)),
      })
      .parse(readJson("brief-inputs/names-ko.tmp.json"));
    expect(dict._note).toContain("확정 아님");
    expect(dict._note).toContain("configs/names.ko.json이 우선");
    expect(Object.keys(dict.teams).length).toBeGreaterThan(0);
    expect(Object.keys(dict.players).length).toBeGreaterThan(0);
  });
});

// ─── llm.ts 경유 (통합) ─────────────────────────────────────────────────

describe("llm.ts callSingle로 브리핑 mock 부르기 (LLM_MODE=mock)", () => {
  /** 실제 브리핑 요청과 같은 모양 — system = 임시 프롬프트, user = 정형 입력 JSON 문자열 */
  function requestFor(c: BriefCase): LlmRequest {
    return {
      customId: c.id,
      system: readText(
        casesFile.prompts[c.request?.prompt ?? "m0-30-long"],
      ).trim(),
      user: readText(casesFile.inputs[c.input].file).trim(),
      maxTokens: 4096,
      effort: "medium",
    };
  }

  async function call(
    id: string,
  ): Promise<{ result: LlmResult; events: LlmLogEvent[] }> {
    const c = caseById.get(id);
    if (!c) throw new Error(`케이스 없음: ${id}`);
    const events: LlmLogEvent[] = [];
    const client = createLlmClient({
      mode: "mock",
      logger: (e) => events.push(e),
    });
    const result = await client.callSingle(requestFor(c));
    return { result, events };
  }
  const attemptsOf = (events: LlmLogEvent[]) =>
    events.find((e) => e.stage === "single.done")?.attempts;

  function unwrapOk(result: LlmResult): LlmSuccess {
    if (!result.ok) throw new Error(`실패 결과: ${result.errorType}`);
    return result;
  }
  function unwrapFail(result: LlmResult): LlmFailure {
    if (result.ok) throw new Error("성공 결과");
    return result;
  }

  it("정상(2026-10-11): 원문 텍스트·실측 usage가 오고, L5 '2골'은 입력상 3골이다", async () => {
    const { result, events } = await call("brief-2026-10-11");
    const ok = unwrapOk(result);
    expect(ok.batch).toBe(false);
    expect(ok.stopReason).toBe("end_turn");
    expect(ok.usage).toEqual({
      in: 6590,
      out: 3231,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(attemptsOf(events)).toBe(1);
    const output = BriefOutputTmpSchema.parse(JSON.parse(ok.text));
    expect(output.l).toHaveLength(5);
    const l5 = output.l[4]!;
    expect(l5.t).toContain("Christopher Nkunku는 2골");
    const match = inputOf("E").matches.find((m) => m.id === l5.r[0]);
    const goals = (match?.goals ?? []).filter(
      (g) => g.player === "Christopher Nkunku",
    );
    expect(goals).toHaveLength(3);
  });

  it("max_tokens: 실패(재시도 대상 아님)지만 토큰은 과금되고 잘린 text는 버린다", async () => {
    const { result, events } = await call("brief-case-max-tokens");
    const fail = unwrapFail(result);
    expect(fail).toMatchObject({
      errorType: "max_tokens",
      retryable: false,
      batch: false,
    });
    expect(fail.usage).toEqual({
      in: 2812,
      out: 4096,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect("text" in fail).toBe(false);
    expect(attemptsOf(events)).toBe(1);
  });

  it("overloaded(529): llm.ts가 2회 더 시도한 뒤 실패(과금 0)를 돌려준다", async () => {
    const { result, events } = await call("brief-case-errored-overloaded");
    const fail = unwrapFail(result);
    expect(fail).toMatchObject({
      errorType: "overloaded_error",
      retryable: true,
    });
    expect(fail.usage).toEqual({ in: 0, out: 0, cacheRead: 0, cacheWrite: 0 });
    expect(events.filter((e) => e.stage === "single.retry")).toHaveLength(2);
    expect(attemptsOf(events)).toBe(3);
  });

  it("연결 오류·타임아웃: 중복 과금 위험으로 재시도하지 않는다(결과의 retryable 힌트는 true)", async () => {
    const { result, events } = await call("brief-case-errored-timeout");
    const fail = unwrapFail(result);
    expect(fail).toMatchObject({
      errorType: "connection_error",
      retryable: true,
    });
    expect(events.filter((e) => e.stage === "single.retry")).toHaveLength(0);
    expect(attemptsOf(events)).toBe(1);
  });

  it.each(CASES.map((c) => [c.id, c] as const))(
    "%s: llm 기대(ok·errorType·retryable·시도 횟수)와 같다",
    async (id, c) => {
      const { result, events } = await call(id);
      expect(result.ok).toBe(c.llm.ok);
      expect(attemptsOf(events)).toBe(c.llm.attempts);
      if (!result.ok) {
        expect(result.errorType).toBe(c.llm.errorType);
        expect(result.retryable).toBe(c.llm.retryable);
      }
    },
  );
});

// ─── 비밀값·금지 내용 ────────────────────────────────────────────────────

describe("비밀값·URL 흔적 없음", () => {
  const files = listFiles(LLM_DIR);
  // 토큰 모양 문자열을 소스에 그대로 두지 않는다(secret-scan.test.ts와 같은 방식)
  const ANTHROPIC_PREFIX = ["sk", "ant", ""].join("-");

  it.each(files.map((f) => [path.relative(LLM_DIR, f)] as const))(
    "%s: 비밀 패턴·API 키 헤더가 없다",
    (rel) => {
      const text = readText(rel);
      expect(scanTextForSecrets(text, rel)).toEqual([]);
      expect(text.includes(ANTHROPIC_PREFIX)).toBe(false);
      expect(text.toLowerCase().includes("x-api-key")).toBe(false);
    },
  );

  it("브리핑 mock·정형 입력에 URL이 없다(기사 링크·이미지 없음)", () => {
    const targets = [
      ...briefMockFiles.map((f) => `mock/by-id/${f}`),
      ...readdirSync(path.join(LLM_DIR, "brief-inputs")).map(
        (f) => `brief-inputs/${f}`,
      ),
      "brief-cases.json",
    ];
    for (const rel of targets) {
      expect(readText(rel), rel).not.toMatch(/https?:\/\//);
    }
  });
});
