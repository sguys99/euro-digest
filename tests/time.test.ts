// src/lib/time.ts — UTC 저장 · KST 표시 · 유럽 서머타임 경계 (NFR-10, CLAUDE.md §8)
//
// 기대값은 모두 손으로 계산해 고정했다(코드로 다시 계산하지 않는다).
//   런던 BST = UTC+1 → GMT = UTC+0, 대륙(마드리드·로마·베를린·파리) CEST = UTC+2 → CET = UTC+1, KST = UTC+9.
//   2026-10-25(일) 01:00Z 서머타임 종료 · 2027-03-28(일) 01:00Z 서머타임 시작.
// 시스템 시간대와 무관해야 한다: `TZ=America/Los_Angeles npx vitest run tests/time.test.ts`, `TZ=UTC`로도 통과.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  IsoSchema,
  WeeklyReportSchema,
  type BigmatchRulesFile,
} from "@/lib/schema";
import {
  europeanSummerTimeTransitions,
  formatIcsUtc,
  formatKst,
  isoWeek,
  isoWeekOfDate,
  isoWeekRange,
  isoWeeksInYear,
  isUtcIso,
  isWithinKstWindow,
  kstDate,
  kstDayRangeUtc,
  kstParts,
  kstWindowRangeUtc,
  nowUtcIso,
  parseUtcIso,
  relativeKst,
  shiftDate,
  TimeInputError,
  zonedParts,
  zonedToUtcIso,
  type KstFormatStyle,
  type TimeParts,
} from "@/lib/time";

const LONDON = "Europe/London";
const MADRID = "Europe/Madrid";
const CONTINENT = [
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Berlin",
  "Europe/Paris",
];
const ALL_EURO = [LONDON, ...CONTINENT];

const ms = (iso: string): number => Date.parse(iso);
const isoAt = (t: number): string => new Date(t).toISOString();

/** 벽시계 구성 요소 → "YYYY-MM-DDTHH:mm:ss" (왕복 검사용) */
function wall(p: TimeParts): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${p2(p.month)}-${p2(p.day)}T${p2(p.hour)}:${p2(p.minute)}:${p2(p.second)}`;
}

/** 그 순간 시간대의 UTC 오프셋(분) — zonedParts만으로 계산(초 단위 순간에서만 사용). */
function offsetMinutes(iso: string, timeZone: string): number {
  const p = zonedParts(iso, timeZone);
  const wallMs = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return (wallMs - ms(iso)) / 60_000;
}

// ─── 현재 시각·파싱 ─────────────────────────────────────────────────────────

describe("nowUtcIso", () => {
  it("주입한 Date를 toISOString 형식으로 돌려준다", () => {
    expect(nowUtcIso(new Date(Date.UTC(2026, 9, 10, 21, 30)))).toBe(
      "2026-10-10T21:30:00.000Z",
    );
  });

  it("인자가 없으면 현재 시각 — IsoSchema를 통과한다", () => {
    const now = nowUtcIso();
    expect(IsoSchema.safeParse(now).success).toBe(true);
    expect(Math.abs(ms(now) - Date.now())).toBeLessThan(5_000);
  });

  it("Invalid Date는 TimeInputError", () => {
    expect(() => nowUtcIso(new Date(Number.NaN))).toThrow(TimeInputError);
  });
});

describe("parseUtcIso / isUtcIso — Z로 끝나는 UTC ISO만", () => {
  it.each([
    ["2026-10-10T21:30:00Z", Date.UTC(2026, 9, 10, 21, 30, 0, 0)],
    ["2026-10-10T21:30:00.123Z", Date.UTC(2026, 9, 10, 21, 30, 0, 123)],
    ["2026-10-10T21:30:00.1Z", Date.UTC(2026, 9, 10, 21, 30, 0, 100)],
    // 밀리초 아래 자릿수는 버린다
    ["2026-10-10T21:30:00.123987Z", Date.UTC(2026, 9, 10, 21, 30, 0, 123)],
    ["2028-02-29T00:00:00Z", Date.UTC(2028, 1, 29)],
  ])("통과: %s", (s, expected) => {
    expect(parseUtcIso(s).getTime()).toBe(expected);
    expect(isUtcIso(s)).toBe(true);
  });

  const invalid: Array<[string, unknown]> = [
    ["오프셋(KST)", "2026-10-11T06:30:00+09:00"],
    ["오프셋 +00:00", "2026-10-10T21:30:00+00:00"],
    ["초 없음", "2026-10-10T21:30Z"],
    ["날짜만", "2026-10-10"],
    ["Z 없음(로컬 시각)", "2026-10-10T21:30:00"],
    ["소문자 z", "2026-10-10T21:30:00z"],
    ["공백 구분", "2026-10-10 21:30:00Z"],
    ["앞 공백", " 2026-10-10T21:30:00Z"],
    ["달력에 없는 날짜", "2026-02-30T00:00:00Z"],
    ["윤년 아님", "2027-02-29T00:00:00Z"],
    ["24시", "2026-10-10T24:00:00Z"],
    ["60분", "2026-10-10T23:60:00Z"],
    ["60초(윤초)", "2026-12-31T23:59:60Z"],
    ["빈 문자열", ""],
    ["숫자", 1_760_000_000_000],
    ["null", null],
  ];

  it.each(invalid)("거부: %s", (_label, s) => {
    expect(() => parseUtcIso(s as string)).toThrow(TimeInputError);
    expect(isUtcIso(s)).toBe(false);
  });

  it("허용 범위가 zod IsoSchema와 같다", () => {
    const samples = [
      "2026-10-10T21:30:00Z",
      "2026-10-10T21:30:00.123Z",
      "2026-10-10T21:30:00.123987Z",
      ...invalid.map(([, s]) => s).filter((s) => typeof s === "string"),
    ];
    for (const s of samples) {
      expect([s, isUtcIso(s)]).toEqual([s, IsoSchema.safeParse(s).success]);
    }
  });
});

// ─── UTC → KST ─────────────────────────────────────────────────────────────

describe("kstDate / kstParts — KST 날짜 경계 (UTC 15:00 = KST 자정)", () => {
  it.each([
    ["2026-10-10T14:59:59Z", "2026-10-10"],
    ["2026-10-10T14:59:59.999Z", "2026-10-10"],
    ["2026-10-10T15:00:00Z", "2026-10-11"],
    ["2026-10-10T15:00:00.000Z", "2026-10-11"],
    ["2026-12-31T14:59:59Z", "2026-12-31"],
    ["2026-12-31T15:00:00Z", "2027-01-01"],
  ])("%s → KST %s", (iso, expected) => {
    expect(kstDate(iso)).toBe(expected);
  });

  it("06:30 KST 실행(UTC 전날 21:30) → 뉴스 파일 날짜는 KST 당일", () => {
    expect(kstDate("2026-10-10T21:30:00Z")).toBe("2026-10-11");
    expect(kstParts("2026-10-10T21:30:00Z")).toEqual({
      year: 2026,
      month: 10,
      day: 11,
      hour: 6,
      minute: 30,
      second: 0,
      weekday: 0, // 일요일
    });
  });

  it("KST는 유럽 서머타임과 무관하다 — 2026-10-25 01:00Z 직전·직후 모두 UTC+9", () => {
    expect(kstParts("2026-10-25T00:59:59Z")).toMatchObject({
      hour: 9,
      minute: 59,
      second: 59,
    });
    expect(kstParts("2026-10-25T01:00:00Z")).toMatchObject({
      hour: 10,
      minute: 0,
      second: 0,
    });
    expect(offsetMinutes("2026-10-25T00:59:59Z", "Asia/Seoul")).toBe(540);
    expect(offsetMinutes("2027-03-28T01:00:00Z", "Asia/Seoul")).toBe(540);
  });
});

describe("zonedParts — 서머타임 전환 01:00 UTC 직전·직후", () => {
  it.each([
    // [UTC 순간, 런던 벽시계, 대륙 벽시계, 런던 오프셋(분), 대륙 오프셋(분)]
    [
      "2026-10-25T00:59:59Z",
      "2026-10-25T01:59:59",
      "2026-10-25T02:59:59",
      60,
      120,
    ],
    [
      "2026-10-25T01:00:00Z",
      "2026-10-25T01:00:00",
      "2026-10-25T02:00:00",
      0,
      60,
    ],
    [
      "2027-03-28T00:59:59Z",
      "2027-03-28T00:59:59",
      "2027-03-28T01:59:59",
      0,
      60,
    ],
    [
      "2027-03-28T01:00:00Z",
      "2027-03-28T02:00:00",
      "2027-03-28T03:00:00",
      60,
      120,
    ],
  ])(
    "%s → 런던 %s / 대륙 %s",
    (iso, london, continent, londonOff, continentOff) => {
      expect(wall(zonedParts(iso, LONDON))).toBe(london);
      expect(offsetMinutes(iso, LONDON)).toBe(londonOff);
      for (const tz of CONTINENT) {
        expect([tz, wall(zonedParts(iso, tz))]).toEqual([tz, continent]);
        expect([tz, offsetMinutes(iso, tz)]).toEqual([tz, continentOff]);
      }
    },
  );

  it("알 수 없는 시간대는 TimeInputError", () => {
    expect(() => zonedParts("2026-10-10T00:00:00Z", "Europe/Atlantis")).toThrow(
      TimeInputError,
    );
  });
});

describe("formatKst — 한국어 24시간제", () => {
  // 2026-10-24T19:00Z = KST 2026-10-25(일) 04:00 (런던 BST 20:00 킥오프)
  it.each<[KstFormatStyle, string]>([
    ["date", "10월 25일 (일)"],
    ["fullDate", "2026년 10월 25일 (일)"],
    ["time", "04:00"],
    ["datetime", "10월 25일 (일) 04:00"],
    ["short", "10.25 04:00"],
  ])("%s → %s", (style, expected) => {
    expect(formatKst("2026-10-24T19:00:00Z", style)).toBe(expected);
  });

  it("요일 한글 — KST 2026-10-19(월) ~ 10-25(일)", () => {
    const monday = ms("2026-10-18T15:00:00Z"); // KST 10/19 00:00
    const days = Array.from({ length: 7 }, (_, i) =>
      formatKst(isoAt(monday + i * 86_400_000), "date"),
    );
    expect(days).toEqual([
      "10월 19일 (월)",
      "10월 20일 (화)",
      "10월 21일 (수)",
      "10월 22일 (목)",
      "10월 23일 (금)",
      "10월 24일 (토)",
      "10월 25일 (일)",
    ]);
  });

  it("한 자리 월·일·시: date는 그대로, short·time은 두 자리", () => {
    const iso = "2027-03-01T00:05:00Z"; // KST 2027-03-01(월) 09:05
    expect(formatKst(iso, "date")).toBe("3월 1일 (월)");
    expect(formatKst(iso, "time")).toBe("09:05");
    expect(formatKst(iso, "short")).toBe("03.01 09:05");
  });

  it("KST 자정은 00:00 (24:00 아님)", () => {
    expect(formatKst("2026-10-31T15:00:00Z", "datetime")).toBe(
      "11월 1일 (일) 00:00",
    );
  });

  it("잘못된 입력·스타일은 TimeInputError", () => {
    expect(() => formatKst("2026-10-25T04:00:00+09:00", "date")).toThrow(
      TimeInputError,
    );
    expect(() =>
      formatKst("2026-10-24T19:00:00Z", "long" as unknown as KstFormatStyle),
    ).toThrow(TimeInputError);
  });
});

describe("relativeKst — 발행 시각 상대 표시 (FR-30)", () => {
  const NOW = new Date("2026-10-10T21:00:00Z"); // KST 2026-10-11(일) 06:00
  const M = 60;
  const H = 60 * M;
  const D = 24 * H;
  const ago = (seconds: number) => isoAt(NOW.getTime() - seconds * 1_000);

  it.each([
    [0, "방금"],
    [30, "방금"],
    [59, "방금"],
    [M, "1분 전"],
    [59 * M + 59, "59분 전"],
    [H, "1시간 전"],
    [23 * H + 59 * M, "23시간 전"],
    [D, "어제"], // KST 10/10 06:00
    [47 * H, "2일 전"], // KST 10/09 07:00 — 날짜 차이 2일
    [6 * D, "6일 전"],
    [7 * D, "10월 4일 (일)"],
  ])("%i초 전 → %s", (seconds, expected) => {
    expect(relativeKst(ago(seconds), NOW)).toBe(expected);
  });

  it("24시간 안이면 KST 자정을 넘어도 N시간 전", () => {
    expect(relativeKst("2026-10-09T22:00:00Z", NOW)).toBe("23시간 전"); // KST 10/10 07:00
  });

  it("다른 해는 연도를 붙인다", () => {
    expect(relativeKst("2025-12-31T00:00:00Z", NOW)).toBe(
      "2025년 12월 31일 (수)",
    );
  });

  it("미래(시계 오차): 1분 이내는 방금, 그 이상은 절대 시각", () => {
    expect(relativeKst(isoAt(NOW.getTime() + 30_000), NOW)).toBe("방금");
    expect(relativeKst("2026-10-10T23:00:00Z", NOW)).toBe(
      "10월 11일 (일) 08:00",
    );
  });

  it("잘못된 입력은 TimeInputError", () => {
    expect(() => relativeKst("2026-10-10", NOW)).toThrow(TimeInputError);
    expect(() =>
      relativeKst("2026-10-10T21:00:00Z", new Date(Number.NaN)),
    ).toThrow(TimeInputError);
  });
});

describe("formatIcsUtc — .ics UTC 형식 (F12)", () => {
  it("YYYYMMDDTHHMMSSZ, 밀리초는 버림", () => {
    expect(formatIcsUtc("2026-10-24T19:00:00.000Z")).toBe("20261024T190000Z");
    expect(formatIcsUtc("2027-03-28T01:30:05.999Z")).toBe("20270328T013005Z");
  });
});

// ─── 현지 → UTC (유럽 킥오프) ───────────────────────────────────────────────

describe("zonedToUtcIso — 2026-10-25 서머타임 종료 전후 (같은 현지 킥오프가 KST로 1시간 늦어짐)", () => {
  it.each([
    // [시간대, 현지 킥오프, UTC, KST 표시]
    [
      LONDON,
      "2026-10-24T20:00",
      "2026-10-24T19:00:00.000Z",
      "10월 25일 (일) 04:00",
    ],
    [
      MADRID,
      "2026-10-24T21:00",
      "2026-10-24T19:00:00.000Z",
      "10월 25일 (일) 04:00",
    ],
    [
      LONDON,
      "2026-10-25T20:00",
      "2026-10-25T20:00:00.000Z",
      "10월 26일 (월) 05:00",
    ],
    [
      MADRID,
      "2026-10-25T21:00",
      "2026-10-25T20:00:00.000Z",
      "10월 26일 (월) 05:00",
    ],
    // 하루 전·후 다른 요일에도 같은 차이
    [
      LONDON,
      "2026-10-31T20:00",
      "2026-10-31T20:00:00.000Z",
      "11월 1일 (일) 05:00",
    ],
  ])("%s %s → %s (KST %s)", (tz, local, utc, kst) => {
    const iso = zonedToUtcIso(local, tz);
    expect(iso).toBe(utc);
    expect(formatKst(iso, "datetime")).toBe(kst);
  });

  it("로마·베를린·파리도 마드리드와 같다 (CEST → CET)", () => {
    for (const tz of CONTINENT) {
      expect([tz, zonedToUtcIso("2026-10-24T21:00", tz)]).toEqual([
        tz,
        "2026-10-24T19:00:00.000Z",
      ]);
      expect([tz, zonedToUtcIso("2026-10-25T21:00", tz)]).toEqual([
        tz,
        "2026-10-25T20:00:00.000Z",
      ]);
    }
  });

  it("EPL 토요일 15:00 킥오프: 서머타임 종료 후 KST 자정으로 넘어가 날짜가 바뀐다", () => {
    const before = zonedToUtcIso("2026-10-24T15:00", LONDON);
    const after = zonedToUtcIso("2026-10-31T15:00", LONDON);
    expect(before).toBe("2026-10-24T14:00:00.000Z");
    expect([kstDate(before), formatKst(before, "time")]).toEqual([
      "2026-10-24",
      "23:00",
    ]);
    expect(after).toBe("2026-10-31T15:00:00.000Z");
    expect([kstDate(after), formatKst(after, "time")]).toEqual([
      "2026-11-01",
      "00:00",
    ]);
  });
});

describe("zonedToUtcIso — 2027-03-28 서머타임 시작 전후 (같은 현지 킥오프가 KST로 1시간 당겨짐)", () => {
  it.each([
    [
      LONDON,
      "2027-03-27T20:00",
      "2027-03-27T20:00:00.000Z",
      "3월 28일 (일) 05:00",
    ],
    [
      MADRID,
      "2027-03-27T21:00",
      "2027-03-27T20:00:00.000Z",
      "3월 28일 (일) 05:00",
    ],
    [
      LONDON,
      "2027-03-28T20:00",
      "2027-03-28T19:00:00.000Z",
      "3월 29일 (월) 04:00",
    ],
    [
      MADRID,
      "2027-03-28T21:00",
      "2027-03-28T19:00:00.000Z",
      "3월 29일 (월) 04:00",
    ],
  ])("%s %s → %s (KST %s)", (tz, local, utc, kst) => {
    const iso = zonedToUtcIso(local, tz);
    expect(iso).toBe(utc);
    expect(formatKst(iso, "datetime")).toBe(kst);
  });

  it("로마·베를린·파리도 마드리드와 같다 (CET → CEST)", () => {
    for (const tz of CONTINENT) {
      expect([tz, zonedToUtcIso("2027-03-27T21:00", tz)]).toEqual([
        tz,
        "2027-03-27T20:00:00.000Z",
      ]);
      expect([tz, zonedToUtcIso("2027-03-28T21:00", tz)]).toEqual([
        tz,
        "2027-03-28T19:00:00.000Z",
      ]);
    }
  });
});

describe("zonedToUtcIso — fold(중복 시각): 런던 2026-10-25 01:00~01:59가 두 번", () => {
  it("기본(compatible)·earlier는 먼저 오는 BST 쪽, later는 GMT 쪽", () => {
    expect(zonedToUtcIso("2026-10-25T01:30", LONDON)).toBe(
      "2026-10-25T00:30:00.000Z",
    );
    expect(
      zonedToUtcIso("2026-10-25T01:30", LONDON, {
        disambiguation: "compatible",
      }),
    ).toBe("2026-10-25T00:30:00.000Z");
    expect(
      zonedToUtcIso("2026-10-25T01:30", LONDON, { disambiguation: "earlier" }),
    ).toBe("2026-10-25T00:30:00.000Z");
    expect(
      zonedToUtcIso("2026-10-25T01:30", LONDON, { disambiguation: "later" }),
    ).toBe("2026-10-25T01:30:00.000Z");
  });

  it("reject는 TimeInputError", () => {
    expect(() =>
      zonedToUtcIso("2026-10-25T01:30", LONDON, { disambiguation: "reject" }),
    ).toThrow(/두 번 나타나는/);
  });

  it("경계: 00:59는 하나(BST), 01:00·01:59는 중복, 02:00은 하나(GMT)", () => {
    const strict = { disambiguation: "reject" } as const;
    expect(zonedToUtcIso("2026-10-25T00:59", LONDON, strict)).toBe(
      "2026-10-24T23:59:00.000Z",
    );
    expect(zonedToUtcIso("2026-10-25T01:00", LONDON)).toBe(
      "2026-10-25T00:00:00.000Z",
    );
    expect(
      zonedToUtcIso("2026-10-25T01:00", LONDON, { disambiguation: "later" }),
    ).toBe("2026-10-25T01:00:00.000Z");
    expect(zonedToUtcIso("2026-10-25T01:59", LONDON)).toBe(
      "2026-10-25T00:59:00.000Z",
    );
    expect(() => zonedToUtcIso("2026-10-25T01:59", LONDON, strict)).toThrow(
      TimeInputError,
    );
    expect(zonedToUtcIso("2026-10-25T02:00", LONDON, strict)).toBe(
      "2026-10-25T02:00:00.000Z",
    );
  });

  it("대륙(마드리드)은 02:00~02:59가 중복 — CEST 쪽이 먼저", () => {
    expect(zonedToUtcIso("2026-10-25T02:30", MADRID)).toBe(
      "2026-10-25T00:30:00.000Z",
    );
    expect(
      zonedToUtcIso("2026-10-25T02:30", MADRID, { disambiguation: "later" }),
    ).toBe("2026-10-25T01:30:00.000Z");
  });
});

describe("zonedToUtcIso — gap(없는 시각): 런던 2027-03-28 01:00~01:59가 없음", () => {
  it("기본(compatible)·later는 전환 전 오프셋(GMT)으로 해석 → 1시간 뒤(BST 02:30)", () => {
    const iso = zonedToUtcIso("2027-03-28T01:30", LONDON);
    expect(iso).toBe("2027-03-28T01:30:00.000Z");
    expect(wall(zonedParts(iso, LONDON))).toBe("2027-03-28T02:30:00");
    expect(
      zonedToUtcIso("2027-03-28T01:30", LONDON, { disambiguation: "later" }),
    ).toBe(iso);
  });

  it("earlier는 전환 후 오프셋(BST)으로 해석 → 1시간 앞(GMT 00:30)", () => {
    expect(
      zonedToUtcIso("2027-03-28T01:30", LONDON, { disambiguation: "earlier" }),
    ).toBe("2027-03-28T00:30:00.000Z");
  });

  it("reject는 TimeInputError", () => {
    expect(() =>
      zonedToUtcIso("2027-03-28T01:30", LONDON, { disambiguation: "reject" }),
    ).toThrow(/존재하지 않는/);
  });

  it("경계: 00:59는 있음, 01:00은 없음, 02:00은 있음(= 01:00Z)", () => {
    const strict = { disambiguation: "reject" } as const;
    expect(zonedToUtcIso("2027-03-28T00:59", LONDON, strict)).toBe(
      "2027-03-28T00:59:00.000Z",
    );
    expect(() => zonedToUtcIso("2027-03-28T01:00", LONDON, strict)).toThrow(
      TimeInputError,
    );
    expect(zonedToUtcIso("2027-03-28T01:00", LONDON)).toBe(
      "2027-03-28T01:00:00.000Z",
    );
    expect(zonedToUtcIso("2027-03-28T02:00", LONDON, strict)).toBe(
      "2027-03-28T01:00:00.000Z",
    );
  });

  it("대륙(마드리드)은 02:00~02:59가 없음", () => {
    expect(zonedToUtcIso("2027-03-28T02:30", MADRID)).toBe(
      "2027-03-28T01:30:00.000Z",
    );
    expect(
      zonedToUtcIso("2027-03-28T02:30", MADRID, { disambiguation: "earlier" }),
    ).toBe("2027-03-28T00:30:00.000Z");
  });
});

describe("zonedToUtcIso — 왕복·입력 검사", () => {
  it("전환 전후 15분 간격의 모든 순간: UTC → 현지 → UTC가 earlier/later 중 하나로 되돌아온다", () => {
    for (const center of ["2026-10-25T01:00:00Z", "2027-03-28T01:00:00Z"]) {
      for (
        let t = ms(center) - 6 * 3_600_000;
        t <= ms(center) + 6 * 3_600_000;
        t += 900_000
      ) {
        const iso = isoAt(t);
        for (const tz of ALL_EURO) {
          const local = wall(zonedParts(iso, tz));
          const back = [
            zonedToUtcIso(local, tz, { disambiguation: "earlier" }),
            zonedToUtcIso(local, tz, { disambiguation: "later" }),
          ];
          expect([tz, iso, back.includes(iso)]).toEqual([tz, iso, true]);
        }
      }
    }
  });

  it("초 단위 입력, KST 입력", () => {
    expect(zonedToUtcIso("2026-10-24T20:00:30", LONDON)).toBe(
      "2026-10-24T19:00:30.000Z",
    );
    expect(zonedToUtcIso("2026-10-11T06:30", "Asia/Seoul")).toBe(
      "2026-10-10T21:30:00.000Z",
    );
  });

  it.each([
    "2026-10-24T20:00Z", // 오프셋·Z 금지
    "2026-10-24T20:00+01:00",
    "2026-10-24 20:00",
    "2026-10-24",
    "2026-02-30T20:00",
    "2026-10-24T24:00",
    "2026-10-24T20:60",
  ])("거부: %s", (local) => {
    expect(() => zonedToUtcIso(local, LONDON)).toThrow(TimeInputError);
  });

  it("알 수 없는 disambiguation은 TimeInputError", () => {
    expect(() =>
      zonedToUtcIso("2026-10-24T20:00", LONDON, {
        disambiguation: "first" as unknown as "earlier",
      }),
    ).toThrow(TimeInputError);
  });

  it("알 수 없는 시간대는 TimeInputError", () => {
    expect(() => zonedToUtcIso("2026-10-24T20:00", "Mars/Olympus")).toThrow(
      TimeInputError,
    );
  });
});

// ─── 유럽 서머타임 전환 시각 ────────────────────────────────────────────────

describe("europeanSummerTimeTransitions — 3·10월 마지막 일요일 01:00 UTC", () => {
  it.each([
    [2026, "2026-03-29T01:00:00.000Z", "2026-10-25T01:00:00.000Z"],
    [2027, "2027-03-28T01:00:00.000Z", "2027-10-31T01:00:00.000Z"],
    [2028, "2028-03-26T01:00:00.000Z", "2028-10-29T01:00:00.000Z"],
  ])("%i → %s / %s", (year, start, end) => {
    expect(europeanSummerTimeTransitions(year)).toEqual({ start, end });
  });

  it("런타임 시간대 데이터(Intl)와 일치 — 2026~2030년, 5대 리그 시간대", () => {
    for (let year = 2026; year <= 2030; year++) {
      const { start, end } = europeanSummerTimeTransitions(year);
      for (const tz of ALL_EURO) {
        const before = (iso: string) =>
          offsetMinutes(isoAt(ms(iso) - 1_000), tz);
        expect([year, tz, offsetMinutes(start, tz) - before(start)]).toEqual([
          year,
          tz,
          60,
        ]);
        expect([year, tz, offsetMinutes(end, tz) - before(end)]).toEqual([
          year,
          tz,
          -60,
        ]);
      }
    }
  });

  it("규칙 밖 연도는 TimeInputError", () => {
    expect(() => europeanSummerTimeTransitions(1995)).toThrow(TimeInputError);
    expect(() => europeanSummerTimeTransitions(2026.5)).toThrow(TimeInputError);
  });
});

// ─── KST 날짜·구간 ─────────────────────────────────────────────────────────

describe("shiftDate", () => {
  it.each([
    ["2026-12-31", 1, "2027-01-01"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2026-10-10", 0, "2026-10-10"],
    ["2026-10-10", -90, "2026-07-12"], // 보존 기간 90일
  ])("%s %+i일 → %s", (date, days, expected) => {
    expect(shiftDate(date, days)).toBe(expected);
  });

  it("잘못된 입력은 TimeInputError", () => {
    expect(() => shiftDate("2026-10-10", 1.5)).toThrow(TimeInputError);
    expect(() => shiftDate("2026-13-01", 1)).toThrow(TimeInputError);
  });
});

describe("kstDayRangeUtc — KST 하루 = UTC 전날 15:00 ~ 당일 15:00 [start, end)", () => {
  it("서머타임 종료일에도 24시간 (KST는 전환 없음)", () => {
    const range = kstDayRangeUtc("2026-10-25");
    expect(range).toEqual({
      start: "2026-10-24T15:00:00.000Z",
      end: "2026-10-25T15:00:00.000Z",
    });
    expect(kstDate(range.start)).toBe("2026-10-25");
    expect(kstDate(isoAt(ms(range.end) - 1))).toBe("2026-10-25");
    expect(kstDate(range.end)).toBe("2026-10-26");
  });

  it("연 경계", () => {
    expect(kstDayRangeUtc("2027-01-01")).toEqual({
      start: "2026-12-31T15:00:00.000Z",
      end: "2027-01-01T15:00:00.000Z",
    });
  });

  it.each(["2026-02-30", "2026/10/25", "2026-10-25T00:00:00Z", ""])(
    "거부: %s",
    (date) => {
      expect(() => kstDayRangeUtc(date)).toThrow(TimeInputError);
    },
  );
});

describe("오늘 밤 볼 경기 창 (FR-80: 당일 18:00 ~ 익일 07:00 KST)", () => {
  // configs/bigmatch-rules.json의 window 타입을 그대로 받는지 컴파일 시점에 확인한다.
  const TONIGHT: BigmatchRulesFile["window"] = {
    fromKst: "18:00",
    toKst: "07:00",
  };
  const BASE = "2026-10-24"; // 토요일

  it("UTC 구간 [KST 18:00, 다음 날 07:00)", () => {
    expect(kstWindowRangeUtc(BASE, TONIGHT)).toEqual({
      start: "2026-10-24T09:00:00.000Z",
      end: "2026-10-24T22:00:00.000Z",
    });
  });

  it.each([
    ["2026-10-24T08:59:59.999Z", false], // KST 17:59:59.999
    ["2026-10-24T09:00:00.000Z", true], // KST 18:00 (포함)
    ["2026-10-24T14:00:00.000Z", true], // 런던 15:00 킥오프 → KST 23:00
    ["2026-10-24T19:00:00.000Z", true], // 런던 20:00 킥오프 → KST 10/25 04:00 (자정 넘김)
    ["2026-10-24T21:59:59.999Z", true], // KST 10/25 06:59:59.999
    ["2026-10-24T22:00:00.000Z", false], // KST 10/25 07:00 (제외)
  ])("%s → %s", (iso, expected) => {
    expect(isWithinKstWindow(iso, TONIGHT, BASE)).toBe(expected);
  });

  it("서머타임 종료일 밤: 런던 20:00(GMT) 킥오프 = KST 05:00 → 창 안", () => {
    const kickoff = zonedToUtcIso("2026-10-25T20:00", LONDON);
    expect(isWithinKstWindow(kickoff, TONIGHT, "2026-10-25")).toBe(true);
    expect(isWithinKstWindow(kickoff, TONIGHT, "2026-10-24")).toBe(false);
  });

  it("같은 날 안에서 끝나는 창, 시작=끝이면 24시간", () => {
    expect(
      kstWindowRangeUtc(BASE, { fromKst: "12:00", toKst: "18:00" }),
    ).toEqual({
      start: "2026-10-24T03:00:00.000Z",
      end: "2026-10-24T09:00:00.000Z",
    });
    expect(
      kstWindowRangeUtc(BASE, { fromKst: "00:00", toKst: "00:00" }),
    ).toEqual(kstDayRangeUtc(BASE));
  });

  it.each([
    { fromKst: "7:00", toKst: "18:00" },
    { fromKst: "18:00", toKst: "24:00" },
    { fromKst: "18:00:00", toKst: "07:00" },
  ])("잘못된 창은 TimeInputError: %o", (window) => {
    expect(() =>
      isWithinKstWindow("2026-10-24T09:00:00Z", window, BASE),
    ).toThrow(TimeInputError);
  });
});

// ─── ISO 8601 주차 ─────────────────────────────────────────────────────────

describe("isoWeekOfDate / isoWeek — ISO 8601 주차·week-year (FR-93)", () => {
  it.each([
    ["2026-12-28", "2026-53"], // 월
    ["2027-01-01", "2026-53"], // 금 — 달력 연도와 다름
    ["2027-01-03", "2026-53"], // 일
    ["2027-01-04", "2027-01"], // 월
    ["2026-10-10", "2026-41"], // 오늘(토)
    ["2026-01-01", "2026-01"], // 목
    ["2025-12-29", "2026-01"], // 월 — 전년도 날짜가 다음 해 1주
    ["2025-12-28", "2025-52"], // 일
    ["2021-01-03", "2020-53"],
    ["2027-12-31", "2027-52"],
  ])("%s → %s", (date, expected) => {
    expect(isoWeekOfDate(date)).toBe(expected);
  });

  it.each([
    ["2026-12-27T14:59:59Z", "2026-52"], // KST 12/27(일) 23:59:59
    ["2026-12-27T15:00:00Z", "2026-53"], // KST 12/28(월) 00:00
    ["2027-01-03T14:59:59Z", "2026-53"], // KST 1/3(일) 23:59:59
    ["2027-01-03T15:00:00Z", "2027-01"], // KST 1/4(월) 00:00
  ])("UTC %s → KST 날짜 기준 %s", (iso, expected) => {
    expect(isoWeek(iso)).toBe(expected);
  });

  it("주 수(52/53)", () => {
    expect([2020, 2025, 2026, 2027, 2032].map(isoWeeksInYear)).toEqual([
      53, 52, 53, 52, 53,
    ]);
  });
});

describe("isoWeekRange — KST 월 00:00 ~ 일 23:59:59.999 (from·to 모두 포함)", () => {
  it.each([
    ["2026-41", "2026-10-04T15:00:00.000Z", "2026-10-11T14:59:59.999Z"],
    ["2026-43", "2026-10-18T15:00:00.000Z", "2026-10-25T14:59:59.999Z"], // 서머타임 종료 주
    ["2026-53", "2026-12-27T15:00:00.000Z", "2027-01-03T14:59:59.999Z"],
    ["2027-01", "2027-01-03T15:00:00.000Z", "2027-01-10T14:59:59.999Z"],
  ])("%s → [%s, %s]", (week, from, to) => {
    expect(isoWeekRange(week)).toEqual({ from, to });
  });

  it("to를 그대로 표시하면 일요일", () => {
    const { from, to } = isoWeekRange("2026-43");
    expect([formatKst(from, "date"), formatKst(to, "date")]).toEqual([
      "10월 19일 (월)",
      "10월 25일 (일)",
    ]);
  });

  it("2026-01 ~ 2027-52 전 주차: 왕복 일치 · 빈틈 없이 이어짐(to + 1ms = 다음 주 from)", () => {
    const weeks: string[] = [];
    for (const year of [2026, 2027]) {
      for (let w = 1; w <= isoWeeksInYear(year); w++) {
        weeks.push(`${year}-${String(w).padStart(2, "0")}`);
      }
    }
    expect(weeks).toHaveLength(105);
    weeks.forEach((week, i) => {
      const { from, to } = isoWeekRange(week);
      expect([week, isoWeek(from), isoWeek(to)]).toEqual([week, week, week]);
      expect(kstParts(from)).toMatchObject({ weekday: 1, hour: 0, minute: 0 });
      const next = weeks[i + 1];
      if (next)
        expect([week, ms(to) + 1]).toEqual([week, ms(isoWeekRange(next).from)]);
    });
  });

  it("WeeklyReport 스키마를 통과하고, fixture의 기간과 같다", () => {
    const fixturePath = fileURLToPath(
      new URL(
        "../fixtures/schema/data/players/weekly/2026-41.json",
        import.meta.url,
      ),
    );
    const fixture = WeeklyReportSchema.parse(
      JSON.parse(readFileSync(fixturePath, "utf8")),
    );
    const range = isoWeekRange(fixture.week);
    expect([ms(fixture.from), ms(fixture.to)]).toEqual([
      ms(range.from),
      ms(range.to),
    ]);
    expect(
      WeeklyReportSchema.safeParse({
        ...fixture,
        week: "2026-53",
        ...isoWeekRange("2026-53"),
      }).success,
    ).toBe(true);
  });

  it.each([
    "2027-53",
    "2025-53",
    "2026-00",
    "2026-54",
    "2026-W41",
    "26-41",
    "2026-1",
  ])("거부: %s", (week) => {
    expect(() => isoWeekRange(week)).toThrow(TimeInputError);
  });
});

// ─── 시스템 시간대 무관성 ───────────────────────────────────────────────────

describe("시스템 시간대(TZ)와 무관", () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it.each([
    "America/Los_Angeles",
    "Pacific/Kiritimati",
    "Europe/London",
    "UTC",
  ])("TZ=%s에서도 같은 결과", (tz) => {
    process.env.TZ = tz;
    expect(kstDate("2026-10-10T21:30:00Z")).toBe("2026-10-11");
    expect(formatKst("2026-10-24T19:00:00Z", "datetime")).toBe(
      "10월 25일 (일) 04:00",
    );
    expect(zonedToUtcIso("2026-10-25T20:00", LONDON)).toBe(
      "2026-10-25T20:00:00.000Z",
    );
    expect(zonedToUtcIso("2027-03-28T01:30", LONDON)).toBe(
      "2027-03-28T01:30:00.000Z",
    );
    expect(isoWeekRange("2026-53")).toEqual({
      from: "2026-12-27T15:00:00.000Z",
      to: "2027-01-03T14:59:59.999Z",
    });
    expect(shiftDate("2026-10-25", 1)).toBe("2026-10-26");
    expect(europeanSummerTimeTransitions(2026).end).toBe(
      "2026-10-25T01:00:00.000Z",
    );
  });
});

// ─── 경계 가드: 시간대 변환은 src/lib/time.ts에서만 (CLAUDE.md §8) ─────────

describe("경계 가드 — 시간대 변환은 src/lib/time.ts에서만", () => {
  const ROOT = fileURLToPath(new URL("..", import.meta.url));
  const ALLOWED = new Set(["src/lib/time.ts"]);
  // 시스템/임의 시간대에 의존하는 API. 숫자의 toLocaleString("en-US") 같은 서식은 대상이 아니다.
  const FORBIDDEN: Array<[string, RegExp]> = [
    ["Intl.DateTimeFormat", /Intl\.DateTimeFormat/],
    ["toLocaleDateString/TimeString", /\.toLocale(?:Date|Time)String\(/],
    ["getTimezoneOffset", /\.getTimezoneOffset\(/],
    ["timeZone 옵션", /\btimeZone\s*:/],
    [
      "Date 로컬 getter/setter",
      /\.(?:get|set)(?:FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds)\(/,
    ],
  ];

  function sourceFiles(dir: string): string[] {
    return readdirSync(path.join(ROOT, dir), {
      recursive: true,
      encoding: "utf8",
    })
      .filter((rel) => /\.(?:ts|tsx|mts)$/.test(rel))
      .map((rel) => `${dir}/${rel.split(path.sep).join("/")}`);
  }

  it("src/·scripts/의 다른 파일은 시간대 의존 API를 쓰지 않는다", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles("src"), ...sourceFiles("scripts")]) {
      if (ALLOWED.has(file)) continue;
      const lines = readFileSync(path.join(ROOT, file), "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const [label, re] of FORBIDDEN) {
          if (re.test(line)) offenders.push(`${file}:${i + 1} ${label}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
