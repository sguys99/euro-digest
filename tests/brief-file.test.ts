/**
 * M1-19 브리핑 파일(scripts/lib/brief-file.ts) — 게시 계획(M1-45: 검증 통과 줄이 있으면 llm·mixed, 없으면 같은 입력의 템플릿 —
 * 템플릿 이유는 단계 결과·원인별),
 * 같은 날 재실행 판정(llm·mixed 유지, template·empty 갱신, empty가 줄 있는 template을 지우지 않음, 같은 내용은 다시 쓰지 않음),
 * 읽기(없음·깨짐·스키마·파일명), 원자적 쓰기. 네트워크 없음 — 임시 폴더.
 */
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BriefFileSchema, type BriefFile, type BriefLine } from "@/lib/schema";

import {
  BriefFileError,
  briefFilePath,
  buildBriefFile,
  decideBriefWrite,
  isKeptBriefMode,
  isMockBriefFile,
  briefTemplateReason,
  planBriefPublish,
  readBriefFile,
  serializeBriefFile,
  writeBriefFile,
  type BriefStageResult,
} from "../scripts/lib/brief-file";

const LINES: BriefLine[] = [
  {
    text: "프리미어리그 Arsenal 2-1 Chelsea, 홈팀이 이겼다.",
    ai: false,
    refs: ["m1"],
  },
  {
    text: "프리미어리그 순위는 1위 Arsenal(승점 15), 2위 Chelsea(승점 13) 순이다.",
    ai: false,
    refs: ["sPL"],
  },
];

function file(over: Partial<BriefFile> = {}): BriefFile {
  return buildBriefFile({
    date: "2026-10-11",
    generatedAt: "2026-10-10T21:31:00.000Z",
    runId: "collect-prod-20261010T213000Z-ab12",
    mode: "template",
    lines: LINES,
    ...over,
  });
}

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "euro-digest-brief-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("planBriefPublish — 게시 계획(M1-45)", () => {
  const plan = (brief: BriefStageResult, inputMatches: number | null = 3) =>
    planBriefPublish({ brief, inputMatches, templateLines: LINES });
  const AI_LINE: BriefLine = {
    text: "아스널이 첼시를 2-1로 꺾었다.",
    ai: true,
    refs: ["m1"],
  };

  it("판정 ok·downgrade-line 출력(done + verified) → 모든 줄 AI면 llm, 섞이면 mixed — 줄은 검증 결과 그대로", () => {
    expect(
      planBriefPublish({
        brief: { state: "done" },
        inputMatches: 3,
        templateLines: LINES,
        verified: { lines: [AI_LINE], ai: 1 },
      }),
    ).toEqual({ mode: "llm", reason: "verified", lines: [AI_LINE] });
    expect(
      planBriefPublish({
        brief: { state: "done" },
        inputMatches: 3,
        templateLines: LINES,
        verified: { lines: [AI_LINE, LINES[1]!], ai: 1 },
      }),
    ).toEqual({
      mode: "mixed",
      reason: "verified",
      lines: [AI_LINE, LINES[1]],
    });
    // 템플릿 줄을 만들 수 없는 입력이어도 통과 줄이 있으면 게시한다
    expect(
      planBriefPublish({
        brief: { state: "done" },
        inputMatches: 3,
        templateLines: [],
        verified: { lines: [AI_LINE], ai: 1 },
      }),
    ).toMatchObject({ mode: "llm" });
  });

  it("통과 줄이 하나도 없으면 같은 입력의 전체 템플릿(all-lines-downgraded), 검증 결과가 없으면 방어선(unverified)", () => {
    expect(
      planBriefPublish({
        brief: { state: "done" },
        inputMatches: 3,
        templateLines: LINES,
        verified: { lines: [LINES[0]!], ai: 0 },
      }),
    ).toEqual({
      mode: "template",
      reason: "all-lines-downgraded",
      lines: LINES,
    });
    expect(plan({ state: "done" })).toEqual({
      mode: "template",
      reason: "unverified",
      lines: LINES,
    });
  });

  it("검증 결과는 done일 때만 쓴다 — 실패·생략 결과에 verified가 와도 템플릿", () => {
    expect(
      planBriefPublish({
        brief: { state: "failed", reason: "output", cause: "output" },
        inputMatches: 3,
        templateLines: LINES,
        verified: { lines: [AI_LINE], ai: 1 },
      }),
    ).toMatchObject({ mode: "template", reason: "output-failed" });
  });

  it("예산 초과(verdict 무관)·마감·사전 실패·mock 없음·LLM 실패·출력 형식 오류·설정 오류 → 같은 입력의 템플릿(FR-26·FR-27·FR-29)", () => {
    const cases: Array<[BriefStageResult, string]> = [
      [{ state: "skipped", reason: "budget" }, "budget"],
      [{ state: "skipped", reason: "deadline" }, "deadline"],
      [{ state: "skipped", reason: "names-unreadable" }, "names-unreadable"],
      [{ state: "skipped", reason: "mock-fixture-missing" }, "mock-missing"],
      [{ state: "failed", reason: "llm" }, "llm-failed"],
      [{ state: "failed", reason: "output" }, "output-failed"],
      [{ state: "failed", reason: "setup" }, "setup-failed"],
      // 원인(brief-publish.ts BriefFailCause)이 있으면 원인으로
      [{ state: "failed", reason: "llm", cause: "refusal" }, "refusal"],
      [{ state: "failed", reason: "llm", cause: "deadline" }, "deadline"],
      [{ state: "failed", reason: "output", cause: "deadline" }, "deadline"],
      [
        { state: "failed", reason: "output", cause: "max-tokens" },
        "output-failed",
      ],
      [{ state: "failed", reason: "output", cause: "output" }, "output-failed"],
      [
        { state: "failed", reason: "llm", cause: "check-error" },
        "check-failed",
      ],
      [
        { state: "failed", reason: "llm", cause: "mock-missing" },
        "mock-missing",
      ],
      [{ state: "failed", reason: "llm", cause: "transport" }, "llm-failed"],
      [{ state: "failed", reason: "llm", cause: "client" }, "llm-failed"],
    ];
    for (const [brief, reason] of cases) {
      expect(plan(brief), JSON.stringify(brief)).toEqual({
        mode: "template",
        reason,
        lines: LINES,
      });
      expect(briefTemplateReason(brief, null)).toBe(reason);
    }
  });

  it("경기 0개 → empty(줄 0개), 정형 입력 없음 → 파일 없음, 기존 llm·mixed 유지 → 파일 없음", () => {
    expect(plan({ state: "skipped", reason: "no-matches" }, 0)).toEqual({
      mode: "empty",
      reason: "no-matches",
      lines: [],
    });
    // 결과 지연(D60) — 브리핑 단계가 results-pending으로 건너뛰었으면 empty의 이유도 그것
    expect(plan({ state: "skipped", reason: "results-pending" }, 0)).toEqual({
      mode: "empty",
      reason: "results-pending",
      lines: [],
    });
    expect(plan({ state: "failed", reason: "football-data" }, null)).toEqual({
      mode: null,
      reason: "no-input",
    });
    expect(plan({ state: "skipped", reason: "kept" })).toEqual({
      mode: null,
      reason: "kept",
    });
    expect(
      planBriefPublish({
        brief: { state: "done" },
        inputMatches: 2,
        templateLines: [],
      }),
    ).toEqual({ mode: null, reason: "no-lines" });
  });

  it("계획한 llm·mixed 줄은 파일 스키마(mode ↔ 줄 일관성)를 통과한다", () => {
    for (const verified of [
      { lines: [AI_LINE], ai: 1 },
      { lines: [AI_LINE, LINES[1]!], ai: 1 },
    ]) {
      const planned = planBriefPublish({
        brief: { state: "done" },
        inputMatches: 3,
        templateLines: LINES,
        verified,
      });
      if (planned.mode !== "llm" && planned.mode !== "mixed") {
        throw new Error("unreachable");
      }
      expect(() =>
        file({ mode: planned.mode, lines: planned.lines }),
      ).not.toThrow();
    }
  });
});

describe("decideBriefWrite — 같은 날 재실행", () => {
  const llm = file({
    mode: "llm",
    lines: LINES.map((l) => ({ ...l, ai: true })),
  });
  const mixed = file({
    mode: "mixed",
    lines: [{ ...LINES[0]!, ai: true }, LINES[1]!],
  });

  it("기존이 없으면 쓴다", () => {
    expect(decideBriefWrite(null, file())).toEqual({ action: "write" });
  });

  it("기존 llm·mixed는 무엇으로도 덮지 않는다(비용·공개 뒤 일관성)", () => {
    for (const existing of [llm, mixed]) {
      for (const next of [file(), file({ mode: "empty", lines: [] }), llm]) {
        expect(decideBriefWrite(existing, next)).toEqual({
          action: "keep",
          reason: "kept-llm",
        });
      }
    }
    expect(isKeptBriefMode("llm")).toBe(true);
    expect(isKeptBriefMode("mixed")).toBe(true);
    expect(isKeptBriefMode("template")).toBe(false);
    expect(isKeptBriefMode("empty")).toBe(false);
  });

  it("mock 실행이 쓴 llm·mixed(existingMock)는 지키지 않는다 — 내용이 다르면 무엇으로든 덮고, 같으면 다시 쓰지 않는다(리뷰 권장 5)", () => {
    for (const existing of [llm, mixed]) {
      for (const next of [file(), file({ mode: "empty", lines: [] }), mixed]) {
        if (next === existing) continue;
        expect(
          decideBriefWrite(existing, next, { existingMock: true }),
        ).toEqual({ action: "write" });
      }
      expect(
        decideBriefWrite(existing, existing, { existingMock: true }),
      ).toEqual({ action: "unchanged" });
    }
  });

  it("isMockBriefFile — 그 파일을 쓴 실행 기록의 LLM 토큰이 0이면 mock, 토큰이 있거나 기록을 못 찾으면 live(보수적)", () => {
    const tokens = (n: number) => ({
      in: n,
      out: n,
      cacheRead: 0,
      cacheWrite: 0,
    });
    const run = (runId: string, n: number) => ({ runId, tokens: tokens(n) });
    expect(isMockBriefFile(llm, [run(llm.runId, 0)])).toBe(true);
    expect(isMockBriefFile(mixed, [run("other", 5), run(mixed.runId, 0)])).toBe(
      true,
    );
    expect(isMockBriefFile(llm, [run(llm.runId, 6590)])).toBe(false);
    expect(isMockBriefFile(llm, [run("other", 0)])).toBe(false);
    expect(isMockBriefFile(llm, [])).toBe(false);
    // template·empty는 지킬 대상이 아니라 판정하지 않는다
    expect(isMockBriefFile(file(), [run(file().runId, 0)])).toBe(false);
  });

  it("줄 있는 template은 llm·mixed 또는 줄이 더 많은 template으로만 갱신 — 같거나 적은 줄·empty로는 바꾸지 않는다(공개 뒤 내용 고정)", () => {
    const empty = file({ mode: "empty", lines: [] });
    const one = file({ lines: [LINES[1]!] });
    const sameCountOther = file({
      lines: [
        LINES[0]!,
        {
          text: "프리미어리그 Leeds 0-0 Fulham, 득점 없이 비겼다.",
          ai: false,
          refs: ["m2"],
        },
      ],
    });
    const three = file({
      lines: [
        ...LINES,
        {
          text: "프리미어리그 Leeds 0-0 Fulham, 득점 없이 비겼다.",
          ai: false,
          refs: ["m2"],
        },
      ],
    });
    expect(decideBriefWrite(file(), llm)).toEqual({ action: "write" });
    expect(decideBriefWrite(file(), mixed)).toEqual({ action: "write" });
    expect(decideBriefWrite(file(), three)).toEqual({ action: "write" });
    for (const next of [sameCountOther, one, empty]) {
      expect(decideBriefWrite(file(), next)).toEqual({
        action: "keep",
        reason: "kept-template",
      });
    }
  });

  it("empty는 줄 있는 결과로 갱신한다", () => {
    const empty = file({ mode: "empty", lines: [] });
    expect(decideBriefWrite(empty, file())).toEqual({ action: "write" });
    expect(decideBriefWrite(empty, llm)).toEqual({ action: "write" });
  });

  it("결과 지연(results-pending — D60) empty는 다음 실행이 덮는다 — 보충 성공(줄 있는 결과)·이유가 바뀐 empty, 같은 이유면 unchanged", () => {
    const pending = file({
      mode: "empty",
      emptyReason: "results-pending",
      lines: [],
    });
    const noMatches = file({
      mode: "empty",
      emptyReason: "no-matches",
      lines: [],
    });
    // 키 없는 옛 empty(2026-10-25 아침 파일과 같은 모양) = no-matches
    const legacy = BriefFileSchema.parse({
      date: "2026-10-11",
      generatedAt: "2026-10-10T21:31:00.000Z",
      runId: "collect-prod-20261010T213000Z-ab12",
      mode: "empty",
      lines: [],
    });
    expect(decideBriefWrite(pending, file())).toEqual({ action: "write" });
    expect(decideBriefWrite(pending, llm)).toEqual({ action: "write" });
    expect(decideBriefWrite(pending, mixed)).toEqual({ action: "write" });
    expect(decideBriefWrite(pending, noMatches)).toEqual({ action: "write" });
    expect(decideBriefWrite(noMatches, pending)).toEqual({ action: "write" });
    expect(decideBriefWrite(legacy, pending)).toEqual({ action: "write" });
    const pendingAgain: BriefFile = { ...pending, runId: "collect-prod-r2" };
    expect(decideBriefWrite(pending, pendingAgain)).toEqual({
      action: "unchanged",
    });
    expect(decideBriefWrite(legacy, noMatches)).toEqual({
      action: "unchanged",
    });
    // 줄 있는 template은 결과 지연 empty로 지우지 않는다(공개 뒤 내용 고정 — 기존 규칙)
    expect(decideBriefWrite(file(), pending)).toEqual({
      action: "keep",
      reason: "kept-template",
    });
    expect(decideBriefWrite(llm, pending)).toEqual({
      action: "keep",
      reason: "kept-llm",
    });
  });

  it("mode·줄이 같으면 다시 쓰지 않는다(generatedAt·runId만 다른 data 커밋 방지)", () => {
    expect(
      decideBriefWrite(
        file(),
        file({ generatedAt: "2026-10-10T22:11:00.000Z", runId: "r2" }),
      ),
    ).toEqual({ action: "unchanged" });
    const empty = file({ mode: "empty", lines: [] });
    expect(decideBriefWrite(empty, empty)).toEqual({ action: "unchanged" });
  });
});

describe("buildBriefFile · 읽기 · 쓰기", () => {
  it("줄 대회 comps(D58)는 있으면 그대로 옮기고(키 순서 text·ai·refs·comps) 없으면 키를 만들지 않는다", () => {
    const withComps = file({
      lines: [{ ...LINES[0]!, comps: ["EPL"] }, LINES[1]!],
    });
    expect(Object.keys(withComps.lines[0]!)).toEqual([
      "text",
      "ai",
      "refs",
      "comps",
    ]);
    expect(withComps.lines[0]!.comps).toEqual(["EPL"]);
    expect(withComps.lines[1]).not.toHaveProperty("comps");
    expect(Object.keys(file().lines[0]!)).toEqual(["text", "ai", "refs"]);
    // 스키마에 걸리는 comps(빈 배열·중복·모르는 대회)는 파일을 만들지 않는다 — 호출부(withBriefComps)는 빈 배열을 넣지 않는다
    for (const comps of [[], ["EPL", "EPL"], ["OTHER"]]) {
      expect(
        () =>
          file({
            lines: [{ ...LINES[0]!, comps } as BriefLine],
          }),
        JSON.stringify(comps),
      ).toThrow(BriefFileError);
    }
  });

  it("D58 전환 — comps 없는 기존 파일은 같은 줄 + comps 결과로 덮지 않는다(llm·mixed 유지, 줄 있는 template은 줄 수가 같으면 유지)", () => {
    const tagged = (lines: readonly BriefLine[]): BriefLine[] =>
      lines.map((l) => ({ ...l, comps: ["EPL"] }));
    const oldTemplate = file();
    expect(
      decideBriefWrite(oldTemplate, file({ lines: tagged(LINES) })),
    ).toEqual({ action: "keep", reason: "kept-template" });
    const llmLines = LINES.map((l) => ({ ...l, ai: true }));
    expect(
      decideBriefWrite(
        file({ mode: "llm", lines: llmLines }),
        file({ mode: "llm", lines: tagged(llmLines) }),
      ),
    ).toEqual({ action: "keep", reason: "kept-llm" });
    // 같은 실행 규칙으로 다시 계산한 같은 comps면 내용이 같다(다시 쓰지 않음)
    const next = file({ mode: "empty", lines: [] });
    expect(decideBriefWrite(next, next)).toEqual({ action: "unchanged" });
    const t = file({ lines: tagged(LINES) });
    expect(decideBriefWrite(t, file({ lines: tagged(LINES) }))).toEqual({
      action: "unchanged",
    });
  });

  it("emptyReason(D60)은 empty에만 — 키 순서 date·generatedAt·runId·mode·emptyReason·lines, empty인데 주지 않으면 no-matches", () => {
    const pending = file({
      mode: "empty",
      emptyReason: "results-pending",
      lines: [],
    });
    expect(Object.keys(pending)).toEqual([
      "date",
      "generatedAt",
      "runId",
      "mode",
      "emptyReason",
      "lines",
    ]);
    expect(pending.emptyReason).toBe("results-pending");
    expect(file({ mode: "empty", lines: [] }).emptyReason).toBe("no-matches");
    // empty가 아닌 mode에는 넘겨도 넣지 않는다
    expect(file({ emptyReason: "results-pending" })).not.toHaveProperty(
      "emptyReason",
    );
    expect(BriefFileSchema.parse(pending)).toEqual(pending);
  });

  it("검증을 통과한 파일만 만든다 — mode와 줄이 맞지 않으면 BriefFileError", () => {
    expect(BriefFileSchema.parse(file())).toEqual(file());
    expect(() => file({ mode: "llm" })).toThrow(BriefFileError);
    expect(() =>
      file({
        lines: [{ text: "가".repeat(81), ai: false, refs: ["m1"] }],
      }),
    ).toThrow(BriefFileError);
  });

  it("쓰기 = data/briefs/<발행일>.json(2칸 JSON + 줄바꿈), 임시 파일을 남기지 않는다", async () => {
    const written = await writeBriefFile(dataDir, file());
    expect(written).toBe(briefFilePath(dataDir, "2026-10-11"));
    expect(readFileSync(written, "utf8")).toBe(serializeBriefFile(file()));
    expect(serializeBriefFile(file()).endsWith("}\n")).toBe(true);
    expect(readdirSync(path.join(dataDir, "briefs"))).toEqual([
      "2026-10-11.json",
    ]);
    expect(await readBriefFile(dataDir, "2026-10-11")).toEqual({
      exists: true,
      value: file(),
      error: null,
    });
  });

  it("읽기 — 없으면 오류 아님, 깨진 JSON·스키마 오류·파일명과 다른 date는 오류(값 없음)", async () => {
    expect(await readBriefFile(dataDir, "2026-10-11")).toEqual({
      exists: false,
      value: null,
      error: null,
    });
    mkdirSync(path.join(dataDir, "briefs"), { recursive: true });
    const target = briefFilePath(dataDir, "2026-10-11");
    writeFileSync(target, "{ broken", "utf8");
    expect(await readBriefFile(dataDir, "2026-10-11")).toEqual({
      exists: true,
      value: null,
      error: "JSON 형식 오류",
    });
    writeFileSync(target, JSON.stringify({ ...file(), mode: "llm" }), "utf8");
    const bad = await readBriefFile(dataDir, "2026-10-11");
    expect(bad.value).toBeNull();
    expect(bad.error).toMatch(/^스키마 오류/);
    writeFileSync(
      target,
      JSON.stringify({ ...file(), date: "2026-10-12" }),
      "utf8",
    );
    expect((await readBriefFile(dataDir, "2026-10-11")).error).toMatch(
      /파일명/,
    );
  });
});
