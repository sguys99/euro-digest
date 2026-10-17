/**
 * M1-21 미등록 고유명사 적재(scripts/lib/unknown-names.ts — PRD FR-24, 부록 A 12): 실행 1번에 이름당 1회, kind 유지, 사전·무시
 * 목록에 오른 이름 제거, 키 정렬, 파일 없음 + 이름 없음이면 만들지 않음, 내용이 같으면 changed false, 원자적 쓰기·깨진 파일 읽기.
 */
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UnknownNamesFileSchema } from "@/lib/schema";

import {
  mergeUnknownNames,
  readUnknownNames,
  unknownNamesPath,
  writeUnknownNames,
} from "../scripts/lib/unknown-names";

const T1 = "2026-10-16T21:30:00.000Z";
const T2 = "2026-10-17T21:30:00.000Z";
const never = () => false;

describe("mergeUnknownNames — 누적", () => {
  it("처음 본 이름은 count 1·firstSeen = lastSeen = 실행 시각·cards 빈 배열, kind는 알면 넣는다", () => {
    const r = mergeUnknownNames(
      null,
      [{ name: "Sabah FK", kind: "team" }, { name: "Olise" }],
      { now: T1, isKnown: never },
    );
    expect(r.added).toEqual(["Sabah FK", "Olise"]);
    expect(r.changed).toBe(true);
    expect(r.file).toEqual({
      updatedAt: T1,
      names: {
        Olise: { count: 1, firstSeen: T1, lastSeen: T1, cards: [] },
        "Sabah FK": {
          count: 1,
          firstSeen: T1,
          lastSeen: T1,
          kind: "team",
          cards: [],
        },
      },
    });
    expect(Object.keys(r.file!.names)).toEqual(["Olise", "Sabah FK"]); // 코드 포인트 순
    expect(UnknownNamesFileSchema.safeParse(r.file).success).toBe(true);
  });

  it("다음 실행에서 다시 보면 count + 1·lastSeen 갱신, 한 실행 안의 중복은 1회, kind는 처음 값 유지(없던 값만 채움)", () => {
    const first = mergeUnknownNames(null, [{ name: "Olise" }], {
      now: T1,
      isKnown: never,
    }).file!;
    const r = mergeUnknownNames(
      first,
      [
        { name: "Olise", kind: "player" },
        { name: "Olise", kind: "team" },
        { name: " Olise " },
      ],
      { now: T2, isKnown: never },
    );
    expect(r.seenAgain).toEqual(["Olise"]);
    expect(r.file!.names.Olise).toEqual({
      count: 2,
      firstSeen: T1,
      lastSeen: T2,
      kind: "player",
      cards: [],
    });
    const again = mergeUnknownNames(r.file, [{ name: "Olise", kind: "team" }], {
      now: T2,
      isKnown: never,
    });
    expect(again.file!.names.Olise!.kind).toBe("player");
    expect(again.file!.names.Olise!.count).toBe(3);
  });

  it("사전·무시 목록에 오른 이름은 빼고(기존 항목 포함) 다시 적재하지 않는다", () => {
    const first = mergeUnknownNames(
      null,
      [{ name: "Olise" }, { name: "Sabah FK" }],
      { now: T1, isKnown: never },
    ).file!;
    const known = (n: string) => n === "Olise";
    const r = mergeUnknownNames(first, [{ name: "Olise" }], {
      now: T2,
      isKnown: known,
    });
    expect(r.pruned).toEqual(["Olise"]);
    expect(Object.keys(r.file!.names)).toEqual(["Sabah FK"]);
    expect(r.changed).toBe(true);
  });

  it("파일도 이름도 없으면 만들지 않는다 · 바뀐 것이 없으면 changed false(updatedAt 유지)", () => {
    expect(
      mergeUnknownNames(null, [], { now: T1, isKnown: never }),
    ).toMatchObject({ file: null, changed: false });
    const first = mergeUnknownNames(null, [{ name: "Olise" }], {
      now: T1,
      isKnown: never,
    }).file!;
    const same = mergeUnknownNames(first, [], { now: T2, isKnown: never });
    expect(same.changed).toBe(false);
    expect(same.file!.updatedAt).toBe(T1);
  });
});

describe("파일 I/O — readUnknownNames·writeUnknownNames", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "unknown-names-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("없으면 exists false·오류 없음, 쓴 뒤 읽으면 같은 내용(2칸 들여쓰기·끝 줄바꿈)", async () => {
    expect(await readUnknownNames(dir)).toEqual({
      value: null,
      exists: false,
      error: null,
    });
    const file = mergeUnknownNames(null, [{ name: "Sabah FK", kind: "team" }], {
      now: T1,
      isKnown: never,
    }).file!;
    const written = await writeUnknownNames(dir, file);
    expect(written).toBe(unknownNamesPath(dir));
    expect(written).toBe(path.join(dir, "cache", "unknown-names.json"));
    const text = await readFile(written, "utf8");
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "names": {');
    expect((await readUnknownNames(dir)).value).toEqual(file);
  });

  it("깨진 파일은 오류로 알려 주고 던지지 않는다 · 스키마에 맞지 않는 값은 쓰지 않는다", async () => {
    await mkdir(path.join(dir, "cache"), { recursive: true });
    await writeFile(unknownNamesPath(dir), "{not json", "utf8");
    expect(await readUnknownNames(dir)).toMatchObject({
      value: null,
      exists: true,
      error: "JSON 파싱 실패",
    });
    await writeFile(
      unknownNamesPath(dir),
      JSON.stringify({ updatedAt: T1, names: { x: { count: 0 } } }),
      "utf8",
    );
    expect((await readUnknownNames(dir)).error).toContain("스키마");
    await expect(
      writeUnknownNames(dir, {
        updatedAt: T1,
        names: {
          " bad": { count: 1, firstSeen: T1, lastSeen: T1, cards: [] },
        },
      }),
    ).rejects.toThrow();
  });
});
