import { describe, expect, it } from "vitest";

import {
  KoreanPlayerRecordSchema,
  KoreanPlayerSchema,
  KoreanPlayersDataFileSchema,
  KoreanPlayersFileSchema,
  WeeklyReportSchema,
} from "@/lib/schema";

import { at, issuePaths, passes, validFixture } from "./helpers";

describe("KoreanPlayer — configs/korean-players.json (부록 A, FR-60)", () => {
  const players = validFixture(
    KoreanPlayersFileSchema,
    "configs/korean-players.json",
  );
  const player = at(players, 0);

  it("5대 리그 밖 선수는 comp OTHER + active false로 둔다 (FR-64)", () => {
    const other = at(players, 1);
    expect(other.comp).toBe("OTHER");
    expect(other.active).toBe(false);
  });

  it("comp·position 열거값을 검사한다", () => {
    expect(issuePaths(KoreanPlayerSchema, { ...player, comp: "MLS" })).toEqual([
      "comp",
    ]);
    expect(
      issuePaths(KoreanPlayerSchema, { ...player, position: "ST" }),
    ).toEqual(["position"]);
  });

  it("apiFootballId는 확인 전이면 null", () => {
    expect(passes(KoreanPlayerSchema, { ...player, apiFootballId: null })).toBe(
      true,
    );
    expect(
      issuePaths(KoreanPlayerSchema, { ...player, apiFootballId: "123" }),
    ).toEqual(["apiFootballId"]);
  });

  it("알 수 없는 키는 실패한다 (결정 Q5 — configs strict)", () => {
    expect(
      issuePaths(KoreanPlayerSchema, { ...player, birthyear: 2000 }),
    ).toEqual([""]);
  });

  it("slug·소속팀은 slug 형식 (결정 Q7)", () => {
    expect(
      issuePaths(KoreanPlayerSchema, { ...player, slug: "Hong Gil-dong" }),
    ).toEqual(["slug"]);
    expect(
      issuePaths(KoreanPlayerSchema, { ...player, team: "Sample United" }),
    ).toEqual(["team"]);
  });

  it("파일 안에서 slug가 겹치면 실패한다", () => {
    expect(
      issuePaths(KoreanPlayersFileSchema, [
        player,
        { ...player, nameKo: "다른 이름" },
      ]),
    ).toEqual(["1.slug"]);
  });
});

/** 키 하나를 뺀 사본(구조 분해의 버리는 변수 없이) */
function omit<T extends object>(
  value: T,
  key: string,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([k]) => k !== key));
}

describe("WeeklyReport — data/players/weekly/{yyyy-ww}.json (부록 A, FR-90~93)", () => {
  const report = validFixture(
    WeeklyReportSchema,
    "data/players/weekly/2026-41.json",
  );

  it.each(["2026-41", "2026-53", "2027-01", "2026-10"])(
    "주차 통과: %s",
    (week) => {
      expect(passes(WeeklyReportSchema, { ...report, week })).toBe(true);
    },
  );

  it.each([
    "2026-W41",
    "2026-5",
    "26-41",
    "2026-041",
    "2026_41",
    "2026-00", // 범위 밖 (결정 Q7)
    "2026-54",
    "2026-99",
  ])("주차 거부: %s", (week) => {
    expect(issuePaths(WeeklyReportSchema, { ...report, week })).toEqual([
      "week",
    ]);
  });

  it("선수·MVP는 slug 형식 (결정 Q7)", () => {
    const row = at(report.rows, 0);
    expect(
      issuePaths(WeeklyReportSchema, {
        ...report,
        rows: [{ ...row, player: "홍길동" }],
      }),
    ).toEqual(["rows.0.player"]);
    expect(
      issuePaths(WeeklyReportSchema, { ...report, mvp: "홍길동" }),
    ).toEqual(["mvp"]);
  });

  it("MVP는 없으면 null, 기간은 UTC", () => {
    expect(
      passes(WeeklyReportSchema, { ...omit(report, "coMvp"), mvp: null }),
    ).toBe(true);
    expect(
      issuePaths(WeeklyReportSchema, { ...report, from: "2026-10-05" }),
    ).toEqual(["from"]);
  });
});

describe("WeeklyReport — 공동 MVP·총평 강등 (D65 ②·M3-07, 2026-11-01 사용자 결정)", () => {
  const report = validFixture(
    WeeklyReportSchema,
    "data/players/weekly/2026-41.json",
  );
  const single = omit(report, "coMvp");

  it("coMvp는 선택 — 단독 MVP는 키 없음", () => {
    expect(passes(WeeklyReportSchema, single)).toBe(true);
  });

  it("coMvp는 mvp가 있을 때만 · mvp·중복 금지 · 빈 배열 금지", () => {
    expect(issuePaths(WeeklyReportSchema, { ...report, mvp: null })).toEqual([
      "coMvp",
    ]);
    expect(
      issuePaths(WeeklyReportSchema, { ...report, coMvp: [report.mvp] }),
    ).toEqual(["coMvp.0"]);
    expect(
      issuePaths(WeeklyReportSchema, {
        ...report,
        coMvp: ["kim-cheol-su", "kim-cheol-su"],
      }),
    ).toEqual(["coMvp.1"]);
    expect(issuePaths(WeeklyReportSchema, { ...report, coMvp: [] })).toEqual([
      "coMvp",
    ]);
  });

  it("summaryAi는 필수 boolean", () => {
    expect(issuePaths(WeeklyReportSchema, omit(report, "summaryAi"))).toEqual([
      "summaryAi",
    ]);
    expect(passes(WeeklyReportSchema, { ...report, summaryAi: false })).toBe(
      true,
    );
  });
});

describe("KoreanPlayersDataFile — data/players/korean.json (초안, F6)", () => {
  const file = validFixture(
    KoreanPlayersDataFileSchema,
    "data/players/korean.json",
  );
  const record = at(file.players, 0);
  const log = at(record.recent, 0);

  it("API 경로와 폴백(FR-65) 기록이 모두 통과한다", () => {
    expect(record.provider).toBe("api-football");
    const fallback = at(file.players, 1);
    expect(fallback.provider).toBe("fallback");
    expect(fallback.next).toBeNull();
  });

  it("최근 경기는 5개까지 (FR-62)", () => {
    const six = Array.from({ length: 6 }, () => log);
    expect(
      issuePaths(KoreanPlayerRecordSchema, { ...record, recent: six }),
    ).toEqual(["recent"]);
  });

  it("시즌 누적은 대회마다 1행", () => {
    const stats = at(record.season, 0);
    expect(
      issuePaths(KoreanPlayerRecordSchema, {
        ...record,
        season: [stats, stats],
      }),
    ).toEqual(["season.1.comp"]);
  });

  it("출전 시간은 0 이상 정수 또는 null", () => {
    expect(
      passes(KoreanPlayerRecordSchema, {
        ...record,
        recent: [{ ...log, minutes: null }],
      }),
    ).toBe(true);
    expect(
      issuePaths(KoreanPlayerRecordSchema, {
        ...record,
        recent: [{ ...log, minutes: -1 }],
      }),
    ).toEqual(["recent.0.minutes"]);
  });

  it("승부차기 스코어 result.pens는 선택(소속팀 기준, 0 이상 정수 — M3-07)", () => {
    const pk = at(record.recent, record.recent.length - 1);
    expect(pk.result?.pens).toEqual({ for: 4, against: 3 });
    const plain = omit(pk.result ?? { for: 0, against: 0 }, "pens");
    expect(
      passes(KoreanPlayerRecordSchema, {
        ...record,
        recent: [{ ...pk, result: plain }],
      }),
    ).toBe(true);
    expect(
      issuePaths(KoreanPlayerRecordSchema, {
        ...record,
        recent: [
          { ...pk, result: { ...plain, pens: { for: -1, against: 3 } } },
        ],
      }),
    ).toEqual(["recent.0.result.pens.for"]);
  });

  it("상대 팀 slug는 null 허용, 이름은 필수", () => {
    expect(
      passes(KoreanPlayerRecordSchema, {
        ...record,
        recent: [{ ...log, opponent: { slug: null, name: "Lower League FC" } }],
      }),
    ).toBe(true);
    expect(
      issuePaths(KoreanPlayerRecordSchema, {
        ...record,
        recent: [{ ...log, opponent: { slug: null, name: "" } }],
      }),
    ).toEqual(["recent.0.opponent.name"]);
  });

  it("선수·소속팀·상대 팀 slug 형식 (결정 Q7)", () => {
    expect(
      issuePaths(KoreanPlayerRecordSchema, {
        ...record,
        team: "Sample United",
      }),
    ).toEqual(["team"]);
    expect(
      issuePaths(KoreanPlayerRecordSchema, {
        ...record,
        recent: [
          { ...log, opponent: { slug: "Example City", name: "Example City" } },
        ],
      }),
    ).toEqual(["recent.0.opponent.slug"]);
  });

  it("컵 대회 원문 leagueRaw는 comp OTHER에만(D65) — 시즌 누적 키는 comp + leagueRaw", () => {
    const cup = {
      comp: "OTHER" as const,
      apps: 1,
      minutes: 90,
      goals: 0,
      assists: 0,
    };
    expect(
      passes(KoreanPlayerRecordSchema, {
        ...record,
        season: [
          { ...cup, leagueRaw: "DFB Pokal" },
          { ...cup, leagueRaw: "League Cup" },
        ],
      }),
    ).toBe(true);
    expect(
      issuePaths(KoreanPlayerRecordSchema, {
        ...record,
        season: [
          { ...cup, leagueRaw: "DFB Pokal" },
          { ...cup, leagueRaw: "DFB Pokal" },
        ],
      }),
    ).toEqual(["season.1.comp"]);
    expect(
      issuePaths(KoreanPlayerRecordSchema, {
        ...record,
        season: [{ ...cup, comp: "EPL", leagueRaw: "FA Cup" }],
      }),
    ).toEqual(["season.0.leagueRaw"]);
    expect(
      issuePaths(KoreanPlayerRecordSchema, {
        ...record,
        recent: [{ ...log, leagueRaw: "FA Cup" }],
      }),
    ).toEqual(["recent.0.leagueRaw"]);
    expect(
      issuePaths(KoreanPlayerRecordSchema, {
        ...record,
        recent: [{ ...log, leagueRaw: "", comp: "OTHER" }],
      }),
    ).toEqual(["recent.0.leagueRaw"]);
  });

  it("집계 시작일 — 파일 since 필수(UTC 날짜), 선수 since는 날짜 또는 null(D65)", () => {
    expect(passes(KoreanPlayerRecordSchema, { ...record, since: null })).toBe(
      true,
    );
    expect(
      issuePaths(KoreanPlayerRecordSchema, {
        ...record,
        since: "2026-10-19T00:00:00Z",
      }),
    ).toEqual(["since"]);
    const { since: _drop, ...noSince } = file;
    void _drop;
    expect(issuePaths(KoreanPlayersDataFileSchema, noSince)).toEqual(["since"]);
  });

  it("provider 열거값·선수 slug 중복을 검사한다", () => {
    expect(
      issuePaths(KoreanPlayerRecordSchema, {
        ...record,
        provider: "sofascore",
      }),
    ).toEqual(["provider"]);
    expect(
      issuePaths(KoreanPlayersDataFileSchema, {
        ...file,
        players: [record, record],
      }),
    ).toEqual(["players.1.slug"]);
  });
});
