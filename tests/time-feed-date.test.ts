// src/lib/time.ts parseFeedDate — 피드 날짜(RFC 822·ISO 8601) → UTC ISO (M1-01, CLAUDE.md §8)
// M1-09·D34: 시간대 없는 날짜는 소스 `tz`(fallbackTz)가 있을 때만 해석 — 서머타임 없는 시각·겹치는 시각 규칙, IANA 이름 검사
import { describe, expect, it } from "vitest";

import { IsoSchema } from "@/lib/schema";
import {
  isIanaTimeZone,
  parseFeedDate,
  TimeInputError,
  zonedToUtcIso,
} from "@/lib/time";

describe("parseFeedDate — 시간대가 적힌 피드 날짜만 UTC로", () => {
  it.each([
    // RFC 822/1123 (RSS pubDate)
    ["Sat, 10 Oct 2026 19:24:23 GMT", "2026-10-10T19:24:23.000Z"], // BBC
    ["Sat, 10 Oct 2026 19:24:23 UT", "2026-10-10T19:24:23.000Z"],
    ["Sat, 10 Oct 2026 19:24:23 UTC", "2026-10-10T19:24:23.000Z"],
    ["Sat, 10 Oct 2026 19:24:23 Z", "2026-10-10T19:24:23.000Z"],
    ["10 Oct 2026 19:24:23 GMT", "2026-10-10T19:24:23.000Z"], // 요일 없음
    ["Sat, 10 Oct 2026 19:24 GMT", "2026-10-10T19:24:00.000Z"], // 초 없음
    ["Sat, 1 Oct 2026 19:24:23 GMT", "2026-10-01T19:24:23.000Z"], // 한 자리 날짜
    ["sat, 10 oct 2026 19:24:23 gmt", "2026-10-10T19:24:23.000Z"], // 소문자
    ["Sat, 10 Oct 2026 21:24:23 +0200", "2026-10-10T19:24:23.000Z"], // 이탈리아·스페인 피드
    ["Sun, 11 Oct 2026 02:43:46 +0900", "2026-10-10T17:43:46.000Z"], // KST 오프셋 명시
    ["Sat, 10 Oct 2026 15:24:23 EST", "2026-10-10T20:24:23.000Z"], // ESPN(RFC 822 미국 약어)
    ["Sat, 10 Oct 2026 15:24:23 EDT", "2026-10-10T19:24:23.000Z"],
    ["Sun, 11 Oct 2026 00:30:00 +0000", "2026-10-11T00:30:00.000Z"],
    // UTC 날짜 경계를 넘는 오프셋
    ["Sun, 11 Oct 2026 08:00:00 +0900", "2026-10-10T23:00:00.000Z"],
    // ISO 8601 (Atom updated·dc:date)
    ["2026-10-10T19:24:23Z", "2026-10-10T19:24:23.000Z"],
    ["2026-10-10T21:24:23+02:00", "2026-10-10T19:24:23.000Z"],
    ["2026-10-10T21:24:23+0200", "2026-10-10T19:24:23.000Z"],
    ["2026-10-10T19:24:23.5Z", "2026-10-10T19:24:23.500Z"],
    ["2026-10-10T19:24Z", "2026-10-10T19:24:00.000Z"],
    ["  Sat, 10 Oct 2026 19:24:23 GMT \n", "2026-10-10T19:24:23.000Z"], // 앞뒤 공백
  ])("%s → %s", (raw, expected) => {
    const iso = parseFeedDate(raw);
    expect(iso).toBe(expected);
    expect(IsoSchema.safeParse(iso).success).toBe(true);
  });

  it("유럽 서머타임 종료 경계 전후(2026-10-25 01:00Z)도 오프셋대로만 계산한다", () => {
    expect(parseFeedDate("Sun, 25 Oct 2026 02:59:59 +0200")).toBe(
      "2026-10-25T00:59:59.000Z",
    );
    expect(parseFeedDate("Sun, 25 Oct 2026 02:00:00 +0100")).toBe(
      "2026-10-25T01:00:00.000Z",
    );
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["   "],
    ["2026-10-10 19:24:23"], // 시간대 없음(국내 피드의 오프셋 없는 KST) — 추측하지 않는다
    ["2026-10-10T19:24:23"],
    ["Sat, 10 Oct 2026 19:24:23"],
    ["Sat, 10 Oct 2026 20:24:23 BST"], // RFC 822에 없는 약어
    ["Sat, 10 Oct 2026 20:24:23 KST"],
    ["Sat, 31 Feb 2026 19:24:23 GMT"], // 달력에 없는 날짜(Date는 3월로 넘긴다)
    ["2026-02-30T10:00:00Z"],
    ["Sat, 10 Oct 2026 24:00:00 GMT"],
    ["Sat, 10 Foo 2026 19:24:23 GMT"],
    ["Sat, 10 Oct 2026 19:24:23 +2500"],
    ["not a date"],
  ])("%s → null", (raw) => {
    expect(parseFeedDate(raw)).toBeNull();
  });
});

describe("parseFeedDate(value, fallbackTz) — 시간대 없는 날짜만 소스 시간대로 (PRD §15 D34)", () => {
  it.each([
    // 국내 CMS 실제 형식(fixtures/rss/interfootball-*·footballist-*·besteleven-* pubDate) — 손계산: KST − 9시간
    ["2026-10-11 13:55:17", "2026-10-11T04:55:17.000Z"],
    ["2026-10-11 08:10:00", "2026-10-10T23:10:00.000Z"], // UTC로는 전날
    ["2026-10-11 00:33:44", "2026-10-10T15:33:44.000Z"],
    ["2026-10-11 09:00:00", "2026-10-11T00:00:00.000Z"], // UTC 자정 경계
    ["2026-10-11T13:55:17", "2026-10-11T04:55:17.000Z"], // T 구분
    ["2026-10-11 13:55", "2026-10-11T04:55:00.000Z"], // 초 없음
    ["2026-10-11 13:55:17.25", "2026-10-11T04:55:17.250Z"], // 소수 초
    ["Sun, 11 Oct 2026 13:55:17", "2026-10-11T04:55:17.000Z"], // RFC 822인데 시간대 없음
    ["11 Oct 2026 13:55", "2026-10-11T04:55:00.000Z"],
    ["  2026-10-11 13:55:17 \n", "2026-10-11T04:55:17.000Z"], // 앞뒤 공백
    ["2026-01-01 08:59:59", "2025-12-31T23:59:59.000Z"], // 연 경계
  ])("Asia/Seoul: %j → %s", (raw, expected) => {
    const iso = parseFeedDate(raw, "Asia/Seoul");
    expect(iso).toBe(expected);
    expect(IsoSchema.safeParse(iso).success).toBe(true);
  });

  it("fallbackTz가 없으면 시간대 없는 날짜는 지금처럼 null(추측하지 않음)", () => {
    expect(parseFeedDate("2026-10-11 13:55:17")).toBeNull();
    expect(parseFeedDate("2026-10-11 13:55:17", undefined)).toBeNull();
    expect(parseFeedDate("Sun, 11 Oct 2026 13:55:17")).toBeNull();
  });

  it.each([
    ["Sat, 10 Oct 2026 19:24:23 GMT", "2026-10-10T19:24:23.000Z"],
    ["Sun, 11 Oct 2026 02:43:46 +0900", "2026-10-10T17:43:46.000Z"],
    ["Sat, 10 Oct 2026 15:24:23 EST", "2026-10-10T20:24:23.000Z"],
    ["2026-10-10T21:24:23+02:00", "2026-10-10T19:24:23.000Z"],
    ["2026-10-10T19:24:23Z", "2026-10-10T19:24:23.000Z"],
    ["2026-10-10 19:24:23Z", "2026-10-10T19:24:23.000Z"], // 공백 구분 + Z
  ])(
    "시간대가 적힌 날짜는 fallbackTz를 쓰지 않는다: %j → %s",
    (raw, expected) => {
      expect(parseFeedDate(raw, "Asia/Seoul")).toBe(expected);
      expect(parseFeedDate(raw, "Europe/Rome")).toBe(expected);
      expect(parseFeedDate(raw)).toBe(expected);
    },
  );

  it.each([
    ["Sat, 10 Oct 2026 20:24:23 BST"], // 모르는 약어 — 시간대가 "적혀 있으니" fallback으로 바꾸지 않는다
    ["Sat, 10 Oct 2026 20:24:23 KST"],
    ["Sat, 10 Oct 2026 20:24:23 CEST"],
    ["2026-10-11"], // 날짜만 — 시각이 없으면 해석하지 않는다
    ["2026-10-11 24:00:00"], // 달력·시각에 없음
    ["2026-02-30 10:00:00"],
    ["2026-10-11  13:55:17"], // 구분 공백 2칸
    ["2026/10/11 13:55:17"],
    ["not a date"],
    [""],
    [null],
    [undefined],
  ])("%j → fallbackTz가 있어도 null", (raw) => {
    expect(parseFeedDate(raw, "Asia/Seoul")).toBeNull();
  });

  it.each(["KST", "+09:00", "Etc/GMT-9", "asia/seoul", "Asia/Atlantis", ""])(
    "fallbackTz가 IANA 이름이 아니면(%j) 날짜와 무관하게 TimeInputError — 설정 오류",
    (tz) => {
      expect(() => parseFeedDate("2026-10-11 13:55:17", tz)).toThrow(
        TimeInputError,
      );
      expect(() => parseFeedDate("Sat, 10 Oct 2026 19:24:23 GMT", tz)).toThrow(
        TimeInputError,
      );
      expect(() => parseFeedDate(null, tz)).toThrow(TimeInputError);
    },
  );

  it("UTC·Etc/UTC: 시간대 없는 값을 UTC로 읽는다", () => {
    expect(parseFeedDate("2026-10-11 13:55:17", "UTC")).toBe(
      "2026-10-11T13:55:17.000Z",
    );
    expect(parseFeedDate("2026-10-11 13:55:17", "Etc/UTC")).toBe(
      "2026-10-11T13:55:17.000Z",
    );
  });

  describe("서머타임이 있는 시간대 — 규칙: 겹치면 먼저 오는 순간(서머타임 쪽), 없으면 전환 전 오프셋으로 앞으로 민다", () => {
    // Europe/Rome: 2026-10-25 01:00Z에 CEST(+2) → CET(+1), 2027-03-28 01:00Z에 CET(+1) → CEST(+2)
    it.each([
      // 가을 fold 전후 — 현지 02:00~02:59:59가 두 번
      ["2026-10-25 01:59:59", "2026-10-24T23:59:59.000Z"], // 겹치기 전(CEST)
      ["2026-10-25 02:00:00", "2026-10-25T00:00:00.000Z"], // 겹침 → CEST 쪽(CET 쪽 01:00Z 아님)
      ["2026-10-25 02:30:00", "2026-10-25T00:30:00.000Z"], // 겹침 → CEST 쪽(CET 쪽 01:30Z 아님)
      ["2026-10-25 02:59:59", "2026-10-25T00:59:59.000Z"],
      ["2026-10-25 03:00:00", "2026-10-25T02:00:00.000Z"], // 겹친 뒤(CET)
      // 봄 gap 전후 — 현지 02:00~02:59:59가 없다
      ["2027-03-28 01:59:59", "2027-03-28T00:59:59.000Z"], // gap 전(CET)
      ["2027-03-28 02:00:00", "2027-03-28T01:00:00.000Z"], // 없음 → CET로 읽어 03:00 CEST
      ["2027-03-28 02:30:00", "2027-03-28T01:30:00.000Z"], // 없음 → CET로 읽어 03:30 CEST(1시간 앞으로)
      ["2027-03-28 03:00:00", "2027-03-28T01:00:00.000Z"], // gap 뒤(CEST) — 02:00과 같은 순간
      ["2027-03-28 03:30:00", "2027-03-28T01:30:00.000Z"], // 02:30과 같은 순간
    ])("Europe/Rome %s → %s", (raw, expected) => {
      expect(parseFeedDate(raw, "Europe/Rome")).toBe(expected);
    });

    it("Europe/London(GMT↔BST)도 같은 규칙", () => {
      expect(parseFeedDate("2026-10-25 01:30:00", "Europe/London")).toBe(
        "2026-10-25T00:30:00.000Z", // 겹침 → BST 쪽
      );
      expect(parseFeedDate("2027-03-28 01:30:00", "Europe/London")).toBe(
        "2027-03-28T01:30:00.000Z", // 없음 → GMT로 읽어 02:30 BST
      );
    });

    it("규칙은 zonedToUtcIso 기본값(compatible)과 같다", () => {
      for (const [local, tz] of [
        ["2026-10-25T02:30", "Europe/Rome"],
        ["2027-03-28T02:30", "Europe/Rome"],
        ["2026-10-25T01:30", "Europe/London"],
        ["2027-03-28T01:30", "Europe/London"],
        ["2026-10-11T13:55:17", "Asia/Seoul"],
      ] as const) {
        expect(parseFeedDate(local.replace("T", " "), tz)).toBe(
          zonedToUtcIso(local, tz),
        );
      }
    });

    it("소수 초는 서머타임 해석 뒤에 더한다", () => {
      expect(parseFeedDate("2026-10-25 02:30:00.5", "Europe/Rome")).toBe(
        "2026-10-25T00:30:00.500Z",
      );
    });
  });
});

describe("isIanaTimeZone — Source.tz 허용 이름 (D34)", () => {
  it.each([
    "Asia/Seoul",
    "Europe/Rome",
    "America/Argentina/Buenos_Aires",
    "America/Port-au-Prince",
    "Asia/Kolkata",
    "Asia/Calcutta",
    "UTC",
    "Etc/UTC",
  ])("%s → true", (tz) => {
    expect(isIanaTimeZone(tz)).toBe(true);
  });

  it.each([
    "KST",
    "EST",
    "GMT",
    "+09:00",
    "Etc/GMT-9",
    "Etc/GMT",
    "ROK",
    "US/Pacific",
    "asia/seoul",
    "Asia/Seoul ",
    "Asia/Atlantis",
    "",
    9,
    null,
    undefined,
  ])("%j → false", (tz) => {
    expect(isIanaTimeZone(tz)).toBe(false);
  });
});
