import { describe, expect, it } from "vitest";

import {
  BRIEF_LINE_MAX,
  BRIEF_MAX_LINES,
  BriefFileSchema,
  BriefLineSchema,
} from "@/lib/schema";

import { issuePaths, passes, validFixture } from "./helpers";

const file = validFixture(BriefFileSchema, "data/briefs/2026-10-11.json");
const llmLine = file.lines.find((l) => l.ai)!;
const templateLine = file.lines.find((l) => !l.ai)!;

describe("BriefFile — data/briefs/YYYY-MM-DD.json (PRD §15 D38)", () => {
  it("fixture(mixed — LLM 4줄 + 템플릿 강등 1줄)가 통과한다", () => {
    expect(file.mode).toBe("mixed");
    expect(file.lines).toHaveLength(5);
  });

  it("mode ↔ 줄 일관성 — empty는 0줄, llm은 모두 ai:true, template은 모두 ai:false, mixed는 둘 다", () => {
    expect(passes(BriefFileSchema, { ...file, mode: "empty", lines: [] })).toBe(
      true,
    );
    expect(issuePaths(BriefFileSchema, { ...file, mode: "empty" })).toEqual([
      "mode",
    ]);
    expect(
      passes(BriefFileSchema, { ...file, mode: "llm", lines: [llmLine] }),
    ).toBe(true);
    expect(issuePaths(BriefFileSchema, { ...file, mode: "llm" })).toEqual([
      "mode",
    ]);
    expect(
      issuePaths(BriefFileSchema, { ...file, mode: "llm", lines: [] }),
    ).toEqual(["mode"]);
    expect(
      passes(BriefFileSchema, {
        ...file,
        mode: "template",
        lines: [templateLine],
      }),
    ).toBe(true);
    expect(issuePaths(BriefFileSchema, { ...file, mode: "template" })).toEqual([
      "mode",
    ]);
    expect(
      issuePaths(BriefFileSchema, { ...file, mode: "mixed", lines: [llmLine] }),
    ).toEqual(["mode"]);
    expect(issuePaths(BriefFileSchema, { ...file, mode: "partial" })).toEqual([
      "mode",
    ]);
  });

  it(`줄은 최대 ${BRIEF_MAX_LINES}개`, () => {
    const six = Array.from({ length: 6 }, () => templateLine);
    expect(
      issuePaths(BriefFileSchema, { ...file, mode: "template", lines: six }),
    ).toEqual(["lines"]);
  });

  it("date는 YYYY-MM-DD, generatedAt은 UTC, runId는 비어 있지 않아야 한다", () => {
    expect(
      issuePaths(BriefFileSchema, { ...file, date: "2026/10/11" }),
    ).toEqual(["date"]);
    expect(
      issuePaths(BriefFileSchema, {
        ...file,
        generatedAt: "2026-10-11T06:54:14+09:00",
      }),
    ).toEqual(["generatedAt"]);
    expect(issuePaths(BriefFileSchema, { ...file, runId: "" })).toEqual([
      "runId",
    ]);
  });

  it("치환 전 원문(textRaw) 같은 모르는 키는 버린다(data/ 파일 — 결정 Q5, D38: textRaw 저장 안 함)", () => {
    const parsed = BriefFileSchema.parse({
      ...file,
      lines: file.lines.map((l) => ({ ...l, textRaw: "Atleti가 …" })),
    });
    expect(parsed.lines.every((l) => !("textRaw" in l))).toBe(true);
  });
});

describe("BriefLine", () => {
  it(`text는 1~${BRIEF_LINE_MAX}자(D40 ⑤), 줄바꿈·앞뒤 공백 없음`, () => {
    expect(
      passes(BriefLineSchema, {
        ...templateLine,
        text: "가".repeat(BRIEF_LINE_MAX),
      }),
    ).toBe(true);
    for (const text of [
      "가".repeat(BRIEF_LINE_MAX + 1),
      "",
      " 앞 공백",
      "끝 공백 ",
      "두 줄\n문장",
    ]) {
      const paths = issuePaths(BriefLineSchema, { ...templateLine, text });
      expect([...new Set(paths)], text).toEqual(["text"]); // 빈 문자열은 길이·형식 둘 다 걸린다
    }
  });

  it("refs는 근거 id 1~6개, 중복 금지, 형식 = 소문자 접두사 + 영숫자", () => {
    expect(
      passes(BriefLineSchema, {
        ...llmLine,
        refs: ["m565820", "sBL", "k927", "m1575167"],
      }),
    ).toBe(true);
    expect(issuePaths(BriefLineSchema, { ...llmLine, refs: [] })).toEqual([
      "refs",
    ]);
    expect(
      issuePaths(BriefLineSchema, { ...llmLine, refs: ["m1", "m1"] }),
    ).toEqual(["refs.1"]);
    for (const ref of ["565820", "M565820", "m", "m-1", "s PL"]) {
      expect(
        issuePaths(BriefLineSchema, { ...llmLine, refs: [ref] }),
        ref,
      ).toEqual(["refs.0"]);
    }
    expect(
      issuePaths(BriefLineSchema, {
        ...llmLine,
        refs: ["m1", "m2", "m3", "m4", "m5", "m6", "m7"],
      }),
    ).toEqual(["refs"]);
  });
});
