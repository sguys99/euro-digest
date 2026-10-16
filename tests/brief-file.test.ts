/**
 * M1-19 브리핑 파일(scripts/lib/brief-file.ts) — 게시 계획(M1-45 전에는 LLM이 성공해도 템플릿 — 검증 안 된 LLM 줄 저장 금지),
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

describe("planBriefPublish — M1-45 전 게시 계획", () => {
  const plan = (brief: BriefStageResult, inputMatches: number | null = 3) =>
    planBriefPublish({ brief, inputMatches, templateLines: LINES });

  it("LLM이 성공해도(done) 검증(M1-23·M1-45) 전이라 템플릿을 게시한다 — 검증 안 된 LLM 줄은 저장하지 않는다", () => {
    expect(plan({ state: "done" })).toEqual({
      mode: "template",
      reason: "unverified",
      lines: LINES,
    });
  });

  it("예산 초과(verdict 무관)·mock 없음·LLM 실패·출력 형식 오류·설정 오류 → 같은 입력의 템플릿(FR-26·FR-27)", () => {
    expect(plan({ state: "skipped", reason: "budget" })).toMatchObject({
      mode: "template",
      reason: "budget",
    });
    expect(
      plan({ state: "skipped", reason: "mock-fixture-missing" }),
    ).toMatchObject({ mode: "template", reason: "mock-missing" });
    expect(plan({ state: "failed", reason: "llm" })).toMatchObject({
      mode: "template",
      reason: "llm-failed",
    });
    expect(plan({ state: "failed", reason: "output" })).toMatchObject({
      mode: "template",
      reason: "output-failed",
    });
    expect(plan({ state: "failed", reason: "setup" })).toMatchObject({
      mode: "template",
      reason: "setup-failed",
    });
  });

  it("경기 0개 → empty(줄 0개), 정형 입력 없음 → 파일 없음, 기존 llm·mixed 유지 → 파일 없음", () => {
    expect(plan({ state: "skipped", reason: "no-matches" }, 0)).toEqual({
      mode: "empty",
      reason: "no-matches",
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
