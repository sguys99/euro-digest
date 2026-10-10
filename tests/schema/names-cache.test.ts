import { describe, expect, it } from "vitest";

import {
  NamesKoFileSchema,
  SeenUrlsFileSchema,
  UnknownNamesFileSchema,
} from "@/lib/schema";

import { at, issueMessages, issuePaths, passes, validFixture } from "./helpers";

describe("configs/names.ko.json (초안, FR-24)", () => {
  const file = validFixture(NamesKoFileSchema, "configs/names.ko.json");
  const player = at(file.entries, 0);
  const team = at(file.entries, 1);

  it("fixture가 통과하고 ignore를 생략하면 []", () => {
    expect(file.ignore).toEqual(["VAR", "Here we go"]);
    expect(NamesKoFileSchema.parse({ entries: file.entries }).ignore).toEqual(
      [],
    );
  });

  it("영문 표기는 사전 전체에서 한 번만 (대소문자 무시)", () => {
    const dup = { ...team, en: ["Sample United FC", "hong gil-dong"] };
    const input = { ...file, entries: [player, dup] };
    expect(issuePaths(NamesKoFileSchema, input)).toEqual(["entries.1.en.1"]);
    expect(issueMessages(NamesKoFileSchema, input)[0]).toContain("홍길동");
  });

  it("무시 목록과 사전 항목이 겹치면 실패한다", () => {
    expect(
      issuePaths(NamesKoFileSchema, { ...file, ignore: ["sample united"] }),
    ).toEqual(["ignore.0"]);
  });

  it("같은 유형의 slug가 겹치면 실패, 유형이 다르면 허용", () => {
    const sameKind = { ...team, en: ["Another United"], slug: "sample-united" };
    expect(
      issuePaths(NamesKoFileSchema, { ...file, entries: [team, sameKind] }),
    ).toEqual(["entries.1.slug"]);
    const otherKind = { ...sameKind, kind: "venue" as const };
    expect(
      passes(NamesKoFileSchema, { ...file, entries: [team, otherKind] }),
    ).toBe(true);
  });

  it("빈 문자열·앞뒤 공백·빈 en 배열은 실패한다", () => {
    expect(
      issuePaths(NamesKoFileSchema, {
        ...file,
        entries: [{ ...player, en: [] }],
      }),
    ).toEqual(["entries.0.en"]);
    expect(
      issuePaths(NamesKoFileSchema, {
        ...file,
        entries: [{ ...player, en: [" Hong Gil-dong"] }],
      }),
    ).toEqual(["entries.0.en.0"]);
    expect(
      issuePaths(NamesKoFileSchema, {
        ...file,
        entries: [{ ...player, ko: "" }],
      }),
    ).toEqual(["entries.0.ko"]);
  });

  it("알 수 없는 키는 실패한다 (결정 Q5 — 예: ignore 오타)", () => {
    expect(
      issuePaths(NamesKoFileSchema, { ...file, ignored: ["VAR"] }),
    ).toEqual([""]);
    expect(
      issuePaths(NamesKoFileSchema, {
        ...file,
        entries: [{ ...player, alias: ["Son"] }],
      }),
    ).toEqual(["entries.0"]);
  });

  it("유형·slug 형식을 검사한다", () => {
    expect(
      issuePaths(NamesKoFileSchema, {
        ...file,
        entries: [{ ...player, kind: "coach" }],
      }),
    ).toEqual(["entries.0.kind"]);
    expect(
      issuePaths(NamesKoFileSchema, {
        ...file,
        entries: [{ ...player, slug: "Hong_Gil_dong" }],
      }),
    ).toEqual(["entries.0.slug"]);
  });
});

describe("data/cache/seen-urls.json (초안, FR-04)", () => {
  const file = validFixture(SeenUrlsFileSchema, "data/cache/seen-urls.json");

  it("fixture가 통과한다", () => {
    expect(Object.keys(file.urls)).toHaveLength(2);
  });

  it.each([
    ["10자리(카드 ID 길이)", "8f3a1b2c4d"],
    ["대문자", "8F3A1B2C4D9E0F11"],
    ["17자리", "8f3a1b2c4d9e0f112"],
  ])("해시 키 거부: %s", (_label, key) => {
    expect(
      issuePaths(SeenUrlsFileSchema, {
        ...file,
        urls: { [key]: "2026-10-09T21:35:00Z" },
      }),
    ).toEqual([`urls.${key}`]);
  });

  it("처음 본 시각은 UTC", () => {
    expect(
      issuePaths(SeenUrlsFileSchema, {
        ...file,
        urls: { "8f3a1b2c4d9e0f11": "2026-10-10T06:35:00+09:00" },
      }),
    ).toEqual(["urls.8f3a1b2c4d9e0f11"]);
  });
});

describe("data/cache/unknown-names.json (초안, FR-24)", () => {
  const file = validFixture(
    UnknownNamesFileSchema,
    "data/cache/unknown-names.json",
  );
  const entry = file.names["Sample Player"];

  it("fixture가 통과하고 kind는 생략 가능", () => {
    expect(entry?.count).toBe(3);
    expect(file.names["Example City"]?.kind).toBeUndefined();
  });

  it("lastSeen이 firstSeen보다 앞서면 실패한다", () => {
    const bad = { ...entry, lastSeen: "2026-10-01T00:00:00Z" };
    expect(
      issuePaths(UnknownNamesFileSchema, {
        ...file,
        names: { "Sample Player": bad },
      }),
    ).toEqual(["names.Sample Player.lastSeen"]);
  });

  it("횟수 1 이상, 예시 카드 5개까지, 카드 ID 형식", () => {
    const names = (patch: object) => ({
      ...file,
      names: { "Sample Player": { ...entry, ...patch } },
    });
    expect(issuePaths(UnknownNamesFileSchema, names({ count: 0 }))).toEqual([
      "names.Sample Player.count",
    ]);
    const six = Array.from({ length: 6 }, () => "c_8f3a1b2c4d");
    expect(issuePaths(UnknownNamesFileSchema, names({ cards: six }))).toEqual([
      "names.Sample Player.cards",
    ]);
    expect(
      issuePaths(UnknownNamesFileSchema, names({ cards: ["c_XYZ"] })),
    ).toEqual(["names.Sample Player.cards.0"]);
  });

  it("키(영문 이름)는 비어 있거나 앞뒤 공백이 있으면 안 된다", () => {
    expect(
      issuePaths(UnknownNamesFileSchema, {
        ...file,
        names: { " Sample": entry },
      }),
    ).toEqual(["names. Sample"]);
  });
});
