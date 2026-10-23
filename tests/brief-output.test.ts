/**
 * M1-20 브리핑 출력 zod 스키마 + 관용 파싱(D40 ⑤) + mock 사례 판정(D40 ①~⑤ 확정분). 네트워크·LLM 없음(LLM_MODE=mock).
 *
 * - 확정 스키마 `{ l: [{ t, r }] }`(M0-30 임시 스키마의 키 그대로) — strict, 줄 수·줄 길이 상한은 스키마가 아니라 파서·줄 판정이 다룬다.
 * - 관용: 출력 전체를 감싼 코드블록 벗김 · 6줄 이상은 앞 5줄 · 80자 초과 줄은 치환 뒤 문장으로 표시(강등은 M1-45).
 * - fixtures/llm/brief-cases.json 기대값 중 이 단계가 정할 수 있는 것(stage zod·transport, 80자 초과 줄)을 실제 파서·mock 호출로 확인한다.
 *   줄 단위 코드 검증(스코어·이름·순위 서술)의 기대값 대조는 tests/brief-check.test.ts(M1-23).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  BRIEF_LINE_MAX,
  BRIEF_MAX_LINES,
  CompetitionsFileSchema,
  NamesKoFileSchema,
} from "@/lib/schema";

import {
  briefLinesOverLimit,
  BriefOutputSchema,
  parseBriefOutput,
  unwrapBriefOutput,
} from "../scripts/lib/brief";
import type { BriefInput } from "../scripts/lib/brief-input";
import {
  briefCompLabel,
  briefNamesFromIndex,
  chooseBriefCompForm,
} from "../scripts/lib/brief-template";
import { createLlmClient } from "../scripts/lib/llm";
import { buildNameIndex, substituteNames } from "../scripts/lib/names";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

const line = (t: string, r: string[] = ["m1"]) => ({ t, r });
const out = (lines: unknown[]) => JSON.stringify({ l: lines });
const SENTENCE = "TeamA가 TeamB를 2-1로 꺾었다.";

// ─── 스키마 ──────────────────────────────────────────────────────────────

describe("BriefOutputSchema (M1-20 확정 — 짧은 키)", () => {
  it("문장 t·근거 id r 줄 배열을 받는다", () => {
    expect(
      BriefOutputSchema.parse({ l: [line(SENTENCE, ["m1", "sPL"])] }),
    ).toEqual({ l: [{ t: SENTENCE, r: ["m1", "sPL"] }] });
  });

  it("모르는 키는 거부한다(형식이 흔들린 출력 = 출력 전체 실패)", () => {
    expect(
      BriefOutputSchema.safeParse({ l: [line(SENTENCE)], x: 1 }).success,
    ).toBe(false);
    expect(
      BriefOutputSchema.safeParse({ l: [{ ...line(SENTENCE), ai: true }] })
        .success,
    ).toBe(false);
    expect(
      BriefOutputSchema.safeParse({ lines: [line(SENTENCE)] }).success,
    ).toBe(false);
  });

  it("줄이 없거나 키가 빠지면 실패", () => {
    expect(BriefOutputSchema.safeParse({ l: [] }).success).toBe(false);
    expect(BriefOutputSchema.safeParse({ l: [{ t: SENTENCE }] }).success).toBe(
      false,
    );
    expect(BriefOutputSchema.safeParse({ l: [{ r: ["m1"] }] }).success).toBe(
      false,
    );
    expect(BriefOutputSchema.safeParse({}).success).toBe(false);
  });

  it("문장은 앞뒤 공백을 지우고 5자 이상이어야 한다", () => {
    expect(
      BriefOutputSchema.parse({ l: [line(`  ${SENTENCE}\n`)] }).l[0]!.t,
    ).toBe(SENTENCE);
    expect(
      BriefOutputSchema.safeParse({ l: [line("    이겼다 ")] }).success,
    ).toBe(false);
    expect(BriefOutputSchema.safeParse({ l: [line("")] }).success).toBe(false);
  });

  it("근거 id는 1~6개, 줄 안 중복은 하나로 합친다(BriefLine — 줄 안 중복 금지)", () => {
    expect(
      BriefOutputSchema.safeParse({ l: [line(SENTENCE, [])] }).success,
    ).toBe(false);
    expect(
      BriefOutputSchema.safeParse({
        l: [line(SENTENCE, ["m1", "m2", "m3", "m4", "m5", "m6", "m7"])],
      }).success,
    ).toBe(false);
    expect(
      BriefOutputSchema.safeParse({ l: [line(SENTENCE, [""])] }).success,
    ).toBe(false);
    expect(
      BriefOutputSchema.parse({ l: [line(SENTENCE, ["m1", "sPL", "m1"])] })
        .l[0]!.r,
    ).toEqual(["m1", "sPL"]);
  });

  it("줄 수·줄 길이 상한은 스키마가 막지 않는다(D40 ⑤ — 앞 5줄·80자 초과 줄 강등)", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      line(SENTENCE, [`m${i + 1}`]),
    );
    expect(BriefOutputSchema.parse({ l: many }).l).toHaveLength(8);
    expect(
      BriefOutputSchema.parse({ l: [line("가".repeat(300))] }).l[0]!.t,
    ).toHaveLength(300);
  });
});

// ─── 관용 파싱 ───────────────────────────────────────────────────────────

describe("unwrapBriefOutput — 출력 전체를 감싼 코드블록만 벗긴다(D40 ⑤)", () => {
  const body = out([line(SENTENCE)]);
  it.each([
    ["```json + 줄바꿈", "```json\n" + body + "\n```"],
    ["``` 언어 없음", "```\n" + body + "\n```"],
    ["``` json(울타리와 언어 사이 공백)", "``` json\n" + body + "\n```"],
    ["```JSON 대문자·CRLF", "```JSON\r\n" + body + "\r\n```"],
    ["한 줄 울타리", "```json" + body + "```"],
    ["앞뒤 공백·빈 줄", "\n\n  ```json\n\n" + body + "\n\n```  \n"],
  ])("%s", (_, text) => {
    expect(unwrapBriefOutput(text)).toEqual({ body, fenced: true });
  });

  it("코드블록이 아니면 앞뒤 공백(BOM 포함)만 지운다", () => {
    expect(unwrapBriefOutput(`﻿ ${body} \n`)).toEqual({ body, fenced: false });
  });

  it("코드블록 앞뒤에 다른 글이 있으면 벗기지 않는다(관용은 D40 ⑤ 범위만)", () => {
    expect(
      unwrapBriefOutput("브리핑입니다.\n```json\n" + body + "\n```").fenced,
    ).toBe(false);
    expect(
      unwrapBriefOutput("```json\n" + body + "\n```\n이상이다.").fenced,
    ).toBe(false);
  });
});

describe("parseBriefOutput — 엄격 JSON + 확정 스키마 + 관용(D40 ⑤)", () => {
  it("엄격 JSON", () => {
    expect(parseBriefOutput(out([line(SENTENCE)]))).toEqual({
      ok: true,
      lines: [{ t: SENTENCE, r: ["m1"] }],
      fenced: false,
      droppedLines: 0,
    });
  });

  it("코드블록으로 감싼 JSON은 벗겨서 읽는다(fenced 표시)", () => {
    expect(
      parseBriefOutput("```json\n" + out([line(SENTENCE)]) + "\n```"),
    ).toMatchObject({
      ok: true,
      fenced: true,
      lines: [{ t: SENTENCE }],
    });
  });

  it("6줄 이상이면 앞 5줄만 쓰고 버린 줄 수를 돌려준다", () => {
    const lines = Array.from({ length: 8 }, (_, i) =>
      line(`${SENTENCE} ${i + 1}`, [`m${i + 1}`]),
    );
    const parsed = parseBriefOutput(out(lines));
    expect(parsed).toMatchObject({ ok: true, droppedLines: 3 });
    if (!parsed.ok) throw new Error("파싱 실패");
    expect(parsed.lines).toHaveLength(BRIEF_MAX_LINES);
    expect(parsed.lines.map((l) => l.r[0])).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
    ]);
  });

  it("JSON이 아니면 json, 형식이 다르면 schema(출력 전체 실패 — FR-29 재시도 대상)", () => {
    expect(parseBriefOutput("")).toEqual({
      ok: false,
      reason: "json",
      fenced: false,
    });
    expect(parseBriefOutput(out([line(SENTENCE)]).slice(0, -1))).toEqual({
      ok: false,
      reason: "json",
      fenced: false,
    });
    // 중괄호 추출은 하지 않는다 — 앞뒤에 설명이 붙은 출력은 지시문 위반이다
    expect(parseBriefOutput(`브리핑: ${out([line(SENTENCE)])}`)).toEqual({
      ok: false,
      reason: "json",
      fenced: false,
    });
    expect(parseBriefOutput('{"l":[{"t":"문장이 짧다"}]}')).toEqual({
      ok: false,
      reason: "schema",
      fenced: false,
    });
    expect(parseBriefOutput("```json\n[]\n```")).toEqual({
      ok: false,
      reason: "schema",
      fenced: true,
    });
  });
});

describe("briefLinesOverLimit — 80자 초과 줄(치환 뒤 문장, D40 ⑤)", () => {
  it("80자까지는 통과, 81자부터 줄 번호(1부터)", () => {
    expect(BRIEF_LINE_MAX).toBe(80);
    expect(
      briefLinesOverLimit([
        "가".repeat(80),
        "가".repeat(81),
        "짧다.",
        "나".repeat(120),
      ]),
    ).toEqual([2, 4]);
    expect(briefLinesOverLimit([])).toEqual([]);
  });
});

// ─── mock 사례 판정 (fixtures/llm/brief-cases.json) ─────────────────────

const CasesSchema = z.object({
  inputs: z.record(z.string(), z.object({ file: z.string() })),
  cases: z.array(
    z.object({
      id: z.string(),
      input: z.string(),
      base: z.string().optional(),
      stage: z.enum(["none", "transport", "zod", "whole", "line"]),
      expected: z.string().optional(),
      candidates: z.array(z.string()).optional(),
      llm: z.object({ ok: z.boolean(), errorType: z.string().optional() }),
    }),
  ),
});
const CASES_FILE = CasesSchema.parse(readJson("fixtures/llm/brief-cases.json"));
const CASES = CASES_FILE.cases;
const caseOf = (id: string) => {
  const c = CASES.find((x) => x.id === id);
  if (!c) throw new Error(`케이스 없음: ${id}`);
  return c;
};
const downgradeLines = (verdict: string | undefined) =>
  verdict
    ?.match(/^downgrade-line:(.+)$/)?.[1]!
    .split(",")
    .map(Number) ?? [];

const COMPETITIONS = CompetitionsFileSchema.parse(
  readJson("configs/competitions.json"),
);
const NAMES = buildNameIndex(
  NamesKoFileSchema.parse(readJson("configs/names.ko.json")),
);

/** 케이스 입력(M0 형식 — 판정에 쓰는 matches·standings만) */
function inputOf(key: string): Pick<BriefInput, "matches" | "standings"> {
  const raw = readJson(`fixtures/llm/${CASES_FILE.inputs[key]!.file}`) as {
    matches: BriefInput["matches"];
    standings: Array<
      Omit<BriefInput["standings"][number], "note"> & { note?: string }
    >;
  };
  return {
    matches: raw.matches,
    standings: raw.standings.map((s) => ({ ...s, note: s.note ?? "" })),
  };
}

/** collect-run.ts와 같은 치환(브리핑 단위 대회 표기 — D30·D45 ④) 뒤 문장 */
function substitutedLines(texts: readonly string[], key: string): string[] {
  const input = inputOf(key);
  const form = chooseBriefCompForm(input, {
    competitions: COMPETITIONS,
    names: briefNamesFromIndex(NAMES),
  });
  const competitionLabel = (comp: string) => {
    const config = COMPETITIONS.find((c) => c.id === comp);
    return config
      ? briefCompLabel(config.nameEn, { competitions: COMPETITIONS }, form)
      : comp;
  };
  return texts.map((t) => substituteNames(t, NAMES, { competitionLabel }).text);
}

async function callMock(id: string) {
  const client = createLlmClient({ mode: "mock", logger: () => undefined });
  return client.callSingle({
    customId: id,
    system: "지시문",
    user: "{}",
    maxTokens: 4096,
    effort: "medium",
    thinking: "adaptive",
  });
}

describe("mock 사례 판정 — 이 단계(스키마·관용 파싱·길이)가 정하는 것", () => {
  it.each(CASES.map((c) => [c.id, c] as const))(
    "%s: llm.ts mock 결과 → 파서 판정이 기대 stage와 맞고, 치환 뒤 80자 초과 줄은 기대 강등 줄에 있다",
    async (id, c) => {
      const result = await callMock(id);
      expect(result.ok).toBe(c.llm.ok);
      if (!result.ok) {
        expect(c.stage).toBe("transport");
        return;
      }
      const parsed = parseBriefOutput(result.text);
      expect(parsed.ok, id).toBe(c.stage !== "zod");
      if (!parsed.ok || c.stage === "whole") return; // 출력 전체 실패(재시도)는 줄 판정 전
      const over = briefLinesOverLimit(
        substitutedLines(
          parsed.lines.map((l) => l.t),
          c.input,
        ),
      );
      expect(
        downgradeLines(c.expected),
        `${id} 80자 초과 줄 ${over.join(",")}`,
      ).toEqual(expect.arrayContaining(over));
    },
  );

  it("brief-case-json-fenced: 코드블록을 벗기면 기준 출력과 같은 5줄 → ok(D40 ⑤ — 미정 해소)", async () => {
    const c = caseOf("brief-case-json-fenced");
    expect(c).toMatchObject({ stage: "none", expected: "ok" });
    expect(c.candidates).toBeUndefined();
    const result = await callMock(c.id);
    if (!result.ok) throw new Error("mock 실패");
    const parsed = parseBriefOutput(result.text);
    const base = await callMock(c.base!);
    if (!base.ok) throw new Error("기준 mock 실패");
    expect(parsed).toMatchObject({ ok: true, fenced: true, droppedLines: 0 });
    expect(parsed).toMatchObject({
      lines: (parseBriefOutput(base.text) as { lines: unknown }).lines,
    });
  });

  it("brief-case-too-many-lines: 6번째 줄을 버리고 기준 출력 5줄 → ok(D40 ⑤ — 임시 스키마에서는 retry)", async () => {
    const c = caseOf("brief-case-too-many-lines");
    expect(c).toMatchObject({ stage: "none", expected: "ok" });
    const result = await callMock(c.id);
    const base = await callMock(c.base!);
    if (!result.ok || !base.ok) throw new Error("mock 실패");
    const parsed = parseBriefOutput(result.text);
    expect(parsed).toMatchObject({ ok: true, fenced: false, droppedLines: 1 });
    expect(parsed).toMatchObject({
      lines: (parseBriefOutput(base.text) as { lines: unknown }).lines,
    });
  });

  it("brief-case-line-over-schema: 파싱은 통과하고 치환 뒤 146자 줄 1만 강등 대상(D40 ⑤ — 자르지 않음)", async () => {
    const c = caseOf("brief-case-line-over-schema");
    expect(c).toMatchObject({ stage: "line", expected: "downgrade-line:1" });
    const result = await callMock(c.id);
    if (!result.ok) throw new Error("mock 실패");
    const parsed = parseBriefOutput(result.text);
    if (!parsed.ok) throw new Error("파싱 실패");
    const texts = substitutedLines(
      parsed.lines.map((l) => l.t),
      c.input,
    );
    expect(texts[0]).toHaveLength(146);
    expect(briefLinesOverLimit(texts)).toEqual([1]);
  });

  it("brief-2026-10-10 L1(두 문장): 원문 95자 → 치환 뒤 80자라 길이 기준 안(영문 원문 길이로 재지 않는다) — 강등은 두 문장 때문", async () => {
    const c = caseOf("brief-2026-10-10");
    const result = await callMock(c.id);
    if (!result.ok) throw new Error("mock 실패");
    const parsed = parseBriefOutput(result.text);
    if (!parsed.ok) throw new Error("파싱 실패");
    expect(parsed.lines[0]!.t).toHaveLength(95);
    const texts = substitutedLines(
      parsed.lines.map((l) => l.t),
      c.input,
    );
    // 2026-10-22 사전(니클라스 퓔크루크 등록) 기준 80자 — 등록 전에는 86자로 초과였다. 원문(95자)으로 재면 초과로 잘못 잡힌다
    expect(texts[0]).toHaveLength(80);
    expect(briefLinesOverLimit(texts)).toEqual([]);
    expect(downgradeLines(c.expected)).toEqual([1]);
  });

  it("max_tokens = 출력 전체 실패 → retry, refusal = 바로 템플릿(D40 ① — 미정 해소)", async () => {
    const maxTokens = caseOf("brief-case-max-tokens");
    const refusal = caseOf("brief-case-refusal");
    expect(maxTokens).toMatchObject({ stage: "transport", expected: "retry" });
    expect(refusal).toMatchObject({
      stage: "transport",
      expected: "downgrade-all",
    });
    expect(maxTokens.candidates).toBeUndefined();
    expect(refusal.candidates).toBeUndefined();
    const a = await callMock(maxTokens.id);
    const b = await callMock(refusal.id);
    expect(a).toMatchObject({
      ok: false,
      errorType: "max_tokens",
      retryable: false,
    });
    expect(b).toMatchObject({
      ok: false,
      errorType: "refusal",
      retryable: false,
    });
  });

  it("미정(candidates) 케이스가 남지 않았다 — D40으로 모두 확정", () => {
    expect(
      CASES.filter((c) => c.candidates !== undefined).map((c) => c.id),
    ).toEqual([]);
  });
});
