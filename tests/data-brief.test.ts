// src/lib/data/brief.ts — 일일 브리핑 로더 (M1-32, PRD §15 D38, CLAUDE.md §6.1)
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BRIEFS_DIR, loadBrief } from "@/lib/data/brief";

const BASE = JSON.parse(
  readFileSync(
    path.resolve("fixtures/schema/data/briefs/2026-10-11.json"),
    "utf8",
  ),
) as Record<string, unknown>;

let dir: string;

function write(date: string, value: unknown): void {
  writeFileSync(
    path.join(dir, `${date}.json`),
    typeof value === "string" ? value : JSON.stringify(value),
  );
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "briefs-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadBrief", () => {
  it("기본 위치는 저장소 data/briefs", () => {
    expect(BRIEFS_DIR).toBe(path.resolve("data/briefs"));
  });

  it("그 날짜 파일이 없으면 null — 다른 날 파일로 넘어가지 않는다(D38 전 호)", () => {
    write("2026-10-11", { ...BASE, date: "2026-10-11" });
    expect(loadBrief("2026-10-12", dir)).toBeNull();
    expect(loadBrief("2026-10-12", path.join(dir, "없는 폴더"))).toBeNull();
  });

  it("스키마를 통과한 파일을 돌려준다(모르는 키는 버린다)", () => {
    write("2026-10-11", { ...BASE, date: "2026-10-11", extra: 1 });
    const brief = loadBrief("2026-10-11", dir);
    expect(brief?.date).toBe("2026-10-11");
    expect(brief?.lines.length).toBeGreaterThan(0);
    expect(brief).not.toHaveProperty("extra");
  });

  it("mode empty(경기 없는 날) 파일도 돌려준다 — 화면은 S4", () => {
    write("2026-10-13", {
      date: "2026-10-13",
      generatedAt: "2026-10-12T21:52:00.000Z",
      runId: "r",
      mode: "empty",
      lines: [],
    });
    expect(loadBrief("2026-10-13", dir)?.mode).toBe("empty");
  });

  it("JSON이 깨졌으면 던진다(빌드 실패 — 전날 사이트 유지)", () => {
    write("2026-10-11", "{ not json");
    expect(() => loadBrief("2026-10-11", dir)).toThrow(/JSON을 읽을 수 없음/);
  });

  it("스키마 검증 실패면 던진다(mode·줄 불일치 포함)", () => {
    write("2026-10-11", { ...BASE, date: "2026-10-11", mode: "template" });
    expect(() => loadBrief("2026-10-11", dir)).toThrow(
      /브리핑 파일 스키마 검증 실패/,
    );
  });

  it("내용 date가 파일명과 다르면 던진다", () => {
    write("2026-10-12", { ...BASE, date: "2026-10-11" });
    expect(() => loadBrief("2026-10-12", dir)).toThrow(/파일명/);
  });

  it("날짜 형식이 틀리면 경로를 만들기 전에 던진다", () => {
    expect(() => loadBrief("../runs", dir)).toThrow(RangeError);
    expect(() => loadBrief("2026-10-1", dir)).toThrow(RangeError);
  });
});
