import { describe, expect, it } from "vitest";

import {
  CardIdSchema,
  CategorySchema,
  CompIdSchema,
  HexColorSchema,
  HttpUrlSchema,
  IsoDateSchema,
  IsoSchema,
  SeasonSchema,
  SlugSchema,
  TierSchema,
  TransferStatusSchema,
  isBefore,
  isNotAfter,
} from "@/lib/schema";

import { REJECTED_URLS, passes } from "./helpers";

describe("IsoSchema — UTC ISO 8601 (부록 A, CLAUDE.md §8)", () => {
  it.each([
    "2026-10-10T21:30:00Z",
    "2026-10-10T21:30:00.123Z", // Date#toISOString 형식
    "2026-10-10T21:30:00.123456Z",
    "2028-02-29T00:00:00Z", // 윤년
  ])("통과: %s", (value) => {
    expect(passes(IsoSchema, value)).toBe(true);
  });

  it.each([
    ["오프셋(KST)", "2026-10-11T06:30:00+09:00"],
    ["오프셋 +00:00", "2026-10-10T21:30:00+00:00"],
    ["소문자 z", "2026-10-10T21:30:00z"],
    ["초 없음", "2026-10-10T21:30Z"],
    ["공백 구분", "2026-10-10 21:30:00Z"],
    ["시간대 없음(로컬)", "2026-10-10T21:30:00"],
    ["날짜만", "2026-10-10"],
    ["없는 날짜", "2026-02-30T00:00:00Z"],
    ["없는 월", "2026-13-01T00:00:00Z"],
    ["RFC 2822(RSS pubDate)", "Fri, 09 Oct 2026 20:10:00 GMT"],
    ["빈 문자열", ""],
  ])("거부: %s", (_label, value) => {
    expect(passes(IsoSchema, value)).toBe(false);
  });
});

describe("IsoDateSchema — 날짜 라벨", () => {
  it("YYYY-MM-DD만 통과한다", () => {
    expect(passes(IsoDateSchema, "2026-10-10")).toBe(true);
    expect(passes(IsoDateSchema, "2026-2-1")).toBe(false);
    expect(passes(IsoDateSchema, "2026-10-10T00:00:00Z")).toBe(false);
    expect(passes(IsoDateSchema, "2026/10/10")).toBe(false);
  });
});

describe("열거형 (부록 A)", () => {
  it("CompId는 대문자 6개만", () => {
    for (const id of [
      "EPL",
      "LALIGA",
      "SERIEA",
      "BUNDESLIGA",
      "LIGUE1",
      "UCL",
    ]) {
      expect(passes(CompIdSchema, id)).toBe(true);
    }
    expect(passes(CompIdSchema, "epl")).toBe(false);
    expect(passes(CompIdSchema, "OTHER")).toBe(false);
  });

  it("Category·TransferStatus", () => {
    expect(passes(CategorySchema, "national")).toBe(true);
    expect(passes(CategorySchema, "rumor")).toBe(false);
    expect(passes(TransferStatusSchema, "collapsed")).toBe(true);
    expect(passes(TransferStatusSchema, "none")).toBe(false); // LLM의 none은 카드에서 transfer 생략으로 표현
  });

  it("Tier는 숫자 1~3만", () => {
    for (const t of [1, 2, 3]) expect(passes(TierSchema, t)).toBe(true);
    for (const t of [0, 4, 1.5, "1", null]) {
      expect(passes(TierSchema, t)).toBe(false);
    }
  });
});

describe("CardIdSchema — c_ + 16진수 소문자 10자리", () => {
  it("통과", () => {
    expect(passes(CardIdSchema, "c_8f3a1b2c4d")).toBe(true);
  });

  it.each([
    ["9자리", "c_8f3a1b2c4"],
    ["11자리", "c_8f3a1b2c4d0"],
    ["대문자 hex", "c_8F3A1B2C4D"],
    ["16진수 밖 문자", "c_8f3a1b2c4g"],
    ["접두사 대문자", "C_8f3a1b2c4d"],
    ["예전 6자리 형식", "c_8f3a1b"],
  ])("거부: %s", (_label, value) => {
    expect(passes(CardIdSchema, value)).toBe(false);
  });
});

describe("HttpUrlSchema — 링크 URL (결정 Q3)", () => {
  it.each([
    "https://feeds.bbci.co.uk/sport/football/rss.xml",
    "http://example.com/a?b=1#c",
    "https://xn--3e0b707e.kr/news", // 한글 도메인(punycode)
  ])("통과: %s", (value) => {
    expect(passes(HttpUrlSchema, value)).toBe(true);
  });

  it.each(REJECTED_URLS)("거부: %s", (value) => {
    expect(passes(HttpUrlSchema, value)).toBe(false);
  });

  it("앞뒤 공백은 잘라서 받는다", () => {
    expect(HttpUrlSchema.parse("  https://example.com/x  ")).toBe(
      "https://example.com/x",
    );
  });
});

describe("v0.1 공용 형식 (2026-10-10 사용자 확인)", () => {
  it("SlugSchema — 소문자 kebab-case", () => {
    expect(passes(SlugSchema, "son-heung-min")).toBe(true);
    expect(passes(SlugSchema, "ligue1")).toBe(true);
    for (const v of ["Son", "a--b", "-a", "a-", "a_b", "a b", ""]) {
      expect(passes(SlugSchema, v)).toBe(false);
    }
  });

  it("HexColorSchema — #RRGGBB", () => {
    expect(passes(HexColorSchema, "#C8102E")).toBe(true);
    expect(passes(HexColorSchema, "#c8102e")).toBe(true);
    for (const v of [
      "#FFF",
      "C8102E",
      "#GGGGGG",
      "#C8102E80",
      "red",
      "rgb(0,0,0)",
    ]) {
      expect(passes(HexColorSchema, v)).toBe(false);
    }
  });

  it("SeasonSchema — 시작 연도 정수", () => {
    expect(passes(SeasonSchema, 2026)).toBe(true);
    expect(passes(SeasonSchema, 2026.5)).toBe(false);
    expect(passes(SeasonSchema, "2026-27")).toBe(false);
    expect(passes(SeasonSchema, 1999)).toBe(false);
  });
});

describe("시각 비교 헬퍼", () => {
  it("표기가 달라도 같은 순간이면 같다고 본다", () => {
    expect(isNotAfter("2026-10-10T00:00:00Z", "2026-10-10T00:00:00.000Z")).toBe(
      true,
    );
    expect(isBefore("2026-10-10T00:00:00Z", "2026-10-10T00:00:00.000Z")).toBe(
      false,
    );
    expect(isBefore("2026-10-10T00:00:00Z", "2026-10-10T00:00:01Z")).toBe(true);
  });
});
