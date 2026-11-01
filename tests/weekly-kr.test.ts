/**
 * 한국 선수 주간 리포트 순수 함수 (M3-07 — PRD FR-90~92, §15 D65) — 주간 경계(UTC)·표 집계·MVP 규칙(동점 3단계·공동·0출전)·
 * LLM 입력·출력 파싱·코드 검증·템플릿.
 */
import { describe, expect, it } from "vitest";

import {
  LedgerMatchSchema,
  WeeklyReportSchema,
  type KoreanPlayer,
  type LedgerMatch,
} from "@/lib/schema";
import { isoWeekRangeUtc } from "@/lib/time";

import { buildNameIndex } from "../scripts/lib/names";
import {
  buildWeeklyReport,
  buildWeeklyRequest,
  buildWeeklyTable,
  checkWeeklySummary,
  estimateWeeklyWorstCase,
  findPossiblyMissing,
  missingCandidateMessage,
  mvpPoints,
  parseWeeklyOutput,
  weeklyCustomId,
  weeklyLlmInput,
  weeklyTemplateSummary,
  WEEKLY_KR_MAX_TOKENS,
  type WeeklyCheckContext,
  type WeeklyTableInput,
} from "../scripts/lib/weekly-kr";

// ─── 표본 ────────────────────────────────────────────────────────────────

const W43 = isoWeekRangeUtc("2026-43");

function player(
  slug: string,
  nameKo: string,
  nameEn: string,
  apiFootballId: number | null,
  extra: Partial<KoreanPlayer> = {},
): KoreanPlayer {
  return {
    slug,
    nameKo,
    nameEn,
    team: "sample-united",
    comp: "BUNDESLIGA",
    position: "MF",
    birthYear: 2000,
    apiFootballId,
    active: true,
    ...extra,
  };
}

const LEE = player("lee-a", "이가람", "Garam Lee", 1001);
const KIM = player("kim-b", "김나래", "Narae Kim", 1002);
const PARK = player("park-c", "박다솜", "Dasom Park", 1003);

type Row = LedgerMatch["korean"][number];
let seq = 100;
function match(
  kickoff: string,
  rows: Row[],
  opts: Partial<LedgerMatch> = {},
): LedgerMatch {
  seq += 1;
  return LedgerMatchSchema.parse({
    id: `af-${seq}`,
    leagueId: 78,
    league: "Bundesliga",
    comp: "BUNDESLIGA",
    season: 2026,
    round: "Regular Season - 8",
    kickoff,
    status: "FT",
    home: { id: 1, name: "Sample United", formation: "4-4-2" },
    away: { id: 2, name: "Example City", formation: "4-3-3" },
    ft: { home: 0, away: 0 },
    pens: null,
    goals: [],
    goalsComplete: false,
    korean: rows,
    fetchedAt: "2026-10-27T00:00:00.000Z",
    ...opts,
  });
}
const row = (
  p: KoreanPlayer,
  status: Row["status"],
  minutes: number | null,
  goals = 0,
  assists = 0,
  side: Row["side"] = "home",
): Row => ({ player: p.apiFootballId!, side, status, minutes, goals, assists });

function tableInput(
  ledger: LedgerMatch[],
  players: KoreanPlayer[] = [LEE, KIM, PARK],
  over: Partial<WeeklyTableInput> = {},
): WeeklyTableInput {
  return {
    week: "2026-43",
    range: W43,
    players,
    ledger,
    playerSince: {
      "lee-a": "2026-10-19",
      "kim-b": "2026-10-19",
      "park-c": "2026-10-19",
    },
    compNames: { BUNDESLIGA: "Bundesliga", UCL: "UEFA Champions League" },
    ...over,
  };
}

// ─── 주간 경계 ───────────────────────────────────────────────────────────

describe("주간 경계 — UTC 월 00:00 ~ 일 23:59:59.999 (D65 ①)", () => {
  it("일 23:59 UTC 경기는 그 주, 월 00:00 UTC 경기는 다음 주 · 서머타임 종료일(10-25) 16:30Z 경기는 W43", () => {
    const ledger = [
      match("2026-10-19T00:00:00.000Z", [row(LEE, "start", 90)]), // 월 00:00 — 포함
      match("2026-10-25T16:30:00.000Z", [row(LEE, "sub", 20)]), // DST 종료일 — KST로는 10-26(월)
      match("2026-10-25T23:59:00.000Z", [row(LEE, "sub", 10)]), // 일 23:59 — 포함
      match("2026-10-26T00:00:00.000Z", [row(LEE, "start", 90)]), // 다음 주
      match("2026-10-18T23:59:00.000Z", [row(LEE, "start", 90)]), // 앞 주
    ];
    const t = buildWeeklyTable(tableInput(ledger, [LEE]));
    expect(t.rows[0]).toMatchObject({ apps: 3, minutes: 120 });
    expect(t.rows[0]!.matches.map((m) => m.kickoff)).toEqual([
      "2026-10-19T00:00:00.000Z",
      "2026-10-25T16:30:00.000Z",
      "2026-10-25T23:59:00.000Z",
    ]);
  });

  it("선수 집계 시작일(playerSince) 앞 경기는 빼고, 시작일이 주 끝 뒤면 표 밖", () => {
    const ledger = [
      match("2026-10-20T18:00:00.000Z", [row(LEE, "start", 90)]),
      match("2026-10-24T13:30:00.000Z", [row(LEE, "start", 80)]),
    ];
    const t = buildWeeklyTable(
      tableInput(ledger, [LEE, KIM], {
        playerSince: { "lee-a": "2026-10-22", "kim-b": "2026-10-26" },
      }),
    );
    expect(t.rows.map((r) => [r.player.slug, r.apps, r.minutes])).toEqual([
      ["lee-a", 1, 80],
    ]);
    expect(t.excluded).toEqual([{ slug: "kim-b", reason: "since-after-week" }]);
  });
});

// ─── 표 집계 ─────────────────────────────────────────────────────────────

describe("표 집계 (FR-91)", () => {
  it("출전 = 선발·교체 또는 골·도움 · 분 합 · 벤치·명단 제외는 출전 아님 · 라인업 없는 출전은 분 0 + unknownMinutes", () => {
    const ledger = [
      match("2026-10-21T19:00:00.000Z", [
        row(LEE, "start", 75, 1, 0),
        row(KIM, "bench", 0),
      ]),
      match("2026-10-24T13:30:00.000Z", [
        row(LEE, "sub", 13, 0, 1),
        row(KIM, "absent", null),
      ]),
      match("2026-10-25T13:30:00.000Z", [row(PARK, "unknown", null, 1)], {
        comp: null,
        league: "DFB Pokal",
      }),
      match("2026-10-23T13:30:00.000Z", [row(PARK, "unknown", null)]),
    ];
    const t = buildWeeklyTable(tableInput(ledger));
    const by = new Map(t.rows.map((r) => [r.player.slug, r]));
    expect(by.get("lee-a")).toMatchObject({
      apps: 2,
      minutes: 88,
      goals: 1,
      assists: 1,
      points: 7,
    });
    expect(by.get("kim-b")).toMatchObject({
      apps: 0,
      minutes: 0,
      goals: 0,
      assists: 0,
      points: 0,
    });
    expect(by.get("kim-b")!.matches.map((m) => m.status)).toEqual([
      "bench",
      "absent",
    ]);
    expect(by.get("park-c")).toMatchObject({
      apps: 1,
      minutes: 0,
      goals: 1,
      points: 4,
    });
    expect(t.unknownMinutes).toBe(1);
    // 컵 대회 원문 이름은 원장 league 그대로
    expect(by.get("park-c")!.matches.at(-1)!.compName).toBe("DFB Pokal");
  });

  it("표 밖 — 비활성(기타 리그)·API id 없음(기록 연결 전)·추적 시작 전, 경기가 없는 추적 선수는 0 행", () => {
    const players = [
      LEE,
      player("other-d", "최라온", "Raon Choi", 1004, {
        active: false,
        comp: "OTHER",
      }),
      player("noid-e", "정마루", "Maru Jeong", null),
      player("new-f", "한바다", "Bada Han", 1006),
    ];
    const t = buildWeeklyTable(tableInput([], players));
    expect(
      t.rows.map((r) => [r.player.slug, r.apps, r.matches.length]),
    ).toEqual([["lee-a", 0, 0]]);
    expect(t.excluded).toEqual([
      { slug: "other-d", reason: "inactive" },
      { slug: "noid-e", reason: "no-api-id" },
      { slug: "new-f", reason: "not-tracked" },
    ]);
    expect(t.mvp).toBeNull();
  });

  it("소속팀 기준 스코어·홈/원정·승부차기·골 분(자책골 제외, 득점 완전할 때만)", () => {
    const m = match(
      "2026-10-22T19:00:00.000Z",
      [row(LEE, "start", 120, 1, 0, "away")],
      {
        status: "PEN",
        ft: { home: 1, away: 1 },
        pens: { home: 3, away: 4 },
        goalsComplete: true,
        goals: [
          {
            minute: 20,
            extra: null,
            side: "home",
            kind: "normal",
            scorer: { id: 77, name: "X" },
            assist: null,
          },
          {
            minute: 90,
            extra: 3,
            side: "away",
            kind: "normal",
            scorer: { id: 1001, name: "G. Lee" },
            assist: null,
          },
        ],
      },
    );
    const line = buildWeeklyTable(tableInput([m], [LEE])).rows[0]!.matches[0]!;
    expect(line).toMatchObject({
      home: false,
      team: "Example City",
      opponent: "Sample United",
      score: { for: 1, against: 1 },
      pens: { for: 4, against: 3 },
      goalMinutes: ["90+3"],
    });
  });
});

// ─── MVP ─────────────────────────────────────────────────────────────────

describe("MVP — 골×3 + 도움×2 + 출전, 동점 3단계·공동·0출전 (FR-92·D65 ②③)", () => {
  it("점수 산식", () => {
    expect(mvpPoints({ goals: 2, assists: 1, apps: 3 })).toBe(11);
  });

  it("점수 1위가 MVP — 행은 순위 순", () => {
    const t = buildWeeklyTable(
      tableInput([
        match("2026-10-24T13:30:00.000Z", [
          row(LEE, "start", 90),
          row(KIM, "start", 60, 1),
        ]),
      ]),
    );
    expect(t.mvp).toBe("kim-b");
    expect(t.coMvp).toEqual([]);
    expect(t.rows.map((r) => r.player.slug)).toEqual([
      "kim-b",
      "lee-a",
      "park-c",
    ]);
  });

  it("동점 → 출전 시간 많은 순", () => {
    const t = buildWeeklyTable(
      tableInput([
        match("2026-10-24T13:30:00.000Z", [
          row(LEE, "start", 70),
          row(KIM, "start", 90),
        ]),
      ]),
    );
    expect([t.mvp, t.coMvp]).toEqual(["kim-b", []]);
  });

  it("점수·시간 동점 → 골 많은 순 (1골 2경기 = 2도움 1경기 = 5점)", () => {
    const t = buildWeeklyTable(
      tableInput([
        match("2026-10-21T19:00:00.000Z", [row(LEE, "start", 45, 1)]),
        match("2026-10-24T13:30:00.000Z", [
          row(LEE, "start", 45),
          row(KIM, "start", 90, 0, 2),
        ]),
      ]),
    );
    const by = new Map(t.rows.map((r) => [r.player.slug, r]));
    expect([by.get("lee-a")!.points, by.get("kim-b")!.points]).toEqual([5, 5]);
    expect([by.get("lee-a")!.minutes, by.get("kim-b")!.minutes]).toEqual([
      90, 90,
    ]);
    expect([t.mvp, t.coMvp]).toEqual(["lee-a", []]);
  });

  it("모두 같으면 공동 MVP — 가나다 첫 선수가 mvp, 나머지 coMvp(가나다순)", () => {
    const t = buildWeeklyTable(
      tableInput([
        match("2026-10-24T13:30:00.000Z", [
          row(PARK, "start", 90),
          row(LEE, "start", 90),
          row(KIM, "start", 90),
        ]),
      ]),
    );
    // 김나래 < 박다솜 < 이가람
    expect([t.mvp, t.coMvp]).toEqual(["kim-b", ["park-c", "lee-a"]]);
    const report = WeeklyReportSchema.parse(
      buildWeeklyReport({
        table: t,
        summary: "요약.",
        summaryAi: false,
        generatedAt: "2026-10-26T00:00:00Z",
      }),
    );
    expect(report.coMvp).toEqual(["park-c", "lee-a"]);
  });

  it("골·도움이 없는 주도 같은 규칙으로 뽑는다(D65 ③)", () => {
    const t = buildWeeklyTable(
      tableInput([
        match("2026-10-24T13:30:00.000Z", [
          row(LEE, "sub", 12),
          row(KIM, "bench", 0),
        ]),
      ]),
    );
    expect(t.mvp).toBe("lee-a");
  });

  it("출전 0명이면 mvp null · 리포트에 coMvp 키 없음", () => {
    const t = buildWeeklyTable(
      tableInput([
        match("2026-10-24T13:30:00.000Z", [
          row(LEE, "bench", 0),
          row(KIM, "absent", null),
        ]),
      ]),
    );
    expect([t.mvp, t.coMvp]).toEqual([null, []]);
    const report = buildWeeklyReport({
      table: t,
      summary: "x",
      summaryAi: false,
      generatedAt: "2026-10-26T00:00:00Z",
    });
    expect(report).not.toHaveProperty("coMvp");
    expect(WeeklyReportSchema.safeParse(report).success).toBe(true);
  });
});

// ─── LLM 입력·요청 ───────────────────────────────────────────────────────

describe("LLM 입력 — 정형 데이터만, 영문 원문 이름 (D24)", () => {
  const t = buildWeeklyTable(
    tableInput([
      match("2026-10-24T13:30:00.000Z", [row(LEE, "start", 75, 1)], {
        ft: { home: 2, away: 3 },
        goalsComplete: true,
        goals: [
          {
            minute: 10,
            extra: null,
            side: "away",
            kind: "normal",
            scorer: { id: 9, name: "A" },
            assist: null,
          },
          {
            minute: 30,
            extra: null,
            side: "away",
            kind: "normal",
            scorer: { id: 9, name: "A" },
            assist: null,
          },
          {
            minute: 63,
            extra: null,
            side: "home",
            kind: "normal",
            scorer: { id: 1001, name: "G. Lee" },
            assist: null,
          },
          {
            minute: 70,
            extra: null,
            side: "home",
            kind: "normal",
            scorer: { id: 8, name: "B" },
            assist: null,
          },
          {
            minute: 80,
            extra: null,
            side: "away",
            kind: "normal",
            scorer: { id: 9, name: "A" },
            assist: null,
          },
        ],
      }),
    ]),
  );

  it("MVP·선수 행·경기(소속팀 득점 먼저·결과·골 분)", () => {
    const input = weeklyLlmInput(t);
    expect(input).toMatchObject({
      week: "2026-43",
      from: "2026-10-19",
      to: "2026-10-25",
      mvp: ["Garam Lee"],
      mvpPts: 4,
    });
    expect(input.players[0]).toEqual({
      p: "Garam Lee",
      team: "Sample United",
      apps: 1,
      min: 75,
      g: 1,
      a: 0,
      pts: 4,
      m: [
        {
          d: "2026-10-24",
          c: "Bundesliga",
          vs: "Example City",
          ha: "H",
          res: "L",
          sc: "2-3",
          st: "start",
          min: 75,
          g: 1,
          a: 0,
          gm: ["63"],
        },
      ],
    });
  });

  it("요청 — customId(재시도 -r1)·max_tokens 16,384·thinking 적응형·effort medium·캐싱 끔, 예상은 배치 단가", () => {
    const req = buildWeeklyRequest(weeklyLlmInput(t), "지시문", 2);
    expect(req).toMatchObject({
      customId: "weekly-kr-2026-43-r1",
      maxTokens: WEEKLY_KR_MAX_TOKENS,
      effort: "medium",
      thinking: "adaptive",
    });
    expect(req).not.toHaveProperty("cacheSystem");
    expect(weeklyCustomId("2026-43")).toBe("weekly-kr-2026-43");
    const est = estimateWeeklyWorstCase(req, "claude-haiku-5-5");
    expect(est.batch).toBe(true);
    expect(est.tokens.out).toBe(16_384);
    // 출력 상한 16,384 × $0.25/MTok(배치) ≈ $0.0041 + 입력
    expect(est.usd).toBeGreaterThan(0.004);
    expect(est.usd).toBeLessThan(0.0045);
  });
});

// ─── 출력 파싱 ───────────────────────────────────────────────────────────

describe("parseWeeklyOutput — {s:[3~5문장]} strict", () => {
  const ok = '{"s":["가나다라마다.","바사아자차다.","카타파하다."]}';
  it("통과 · 전체 코드블록은 벗긴다", () => {
    expect(parseWeeklyOutput(ok)).toMatchObject({ ok: true });
    expect(parseWeeklyOutput("```json\n" + ok + "\n```")).toMatchObject({
      ok: true,
    });
  });
  it.each([
    ["not json", "json"],
    ['{"s":["가나다라마다.","바사아자차다."]}', "schema"],
    ['{"s":["가나다라마다.","바사아자차다.","카타파하다."],"x":1}', "schema"],
    ['{"s":["1.","2.","3.","4.","5.","6."]}', "schema"],
    ["앞말 " + ok, "json"],
  ])("실패: %s", (text, reason) => {
    expect(parseWeeklyOutput(text)).toMatchObject({ ok: false, reason });
  });
});

// ─── 코드 검증 ───────────────────────────────────────────────────────────

describe("checkWeeklySummary — 치환 뒤 코드 검증 (M0-30 · FR-29)", () => {
  const names = buildNameIndex({
    entries: [
      { ko: "이가람", en: ["Garam Lee"], kind: "player", slug: "lee-a" },
      { ko: "김나래", en: ["Narae Kim"], kind: "player", slug: "kim-b" },
      { ko: "박다솜", en: ["Dasom Park"], kind: "player", slug: "park-c" },
      {
        ko: "손흥민",
        en: ["Heung-min Son"],
        kind: "player",
        slug: "son-heung-min",
      },
      { ko: "샘플 유나이티드", en: ["Sample United"], kind: "team" },
      { ko: "이그잼플 시티", en: ["Example City"], kind: "team" },
      { ko: "토트넘", en: ["Tottenham Hotspur"], kind: "team" },
    ],
    ignore: [],
  });
  const ctx: WeeklyCheckContext = {
    names,
    competitionLabel: (c) => (c === "BUNDESLIGA" ? "분데스리가" : c),
  };
  const t = buildWeeklyTable(
    tableInput([
      match(
        "2026-10-24T13:30:00.000Z",
        [row(LEE, "start", 75, 1), row(KIM, "bench", 0)],
        {
          ft: { home: 2, away: 3 },
        },
      ),
      match("2026-10-21T19:00:00.000Z", [row(PARK, "sub", 20)], {
        comp: null,
        league: "DFB Pokal",
      }),
    ]),
  );
  const good = [
    "Garam Lee가 Example City전에서 1골을 넣어 MVP 점수 4점으로 이번 주 MVP에 올랐다.",
    "Sample United는 Example City에 2-3으로 졌다.",
    "Dasom Park는 DFB Pokal 경기에 교체로 나서 20분을 뛰었고 Narae Kim은 벤치에서 경기를 마쳤다.",
  ];

  it("통과 — 이름 치환·조사 보정, 입력의 미등록 원문 이름(DFB Pokal)·MVP 허용", () => {
    const r = checkWeeklySummary(good, t, ctx);
    expect(r.issues).toEqual([]);
    expect(r.sentences[0]).toBe(
      "이가람이 이그잼플 시티전에서 1골을 넣어 MVP 점수 4점으로 이번 주 MVP에 올랐다.",
    );
    expect(r.sentences[2]).toContain("박다솜은 DFB Pokal 경기에");
  });

  it("입력 대회의 한글 표기에 섞인 라틴('UEFA 챔피언스리그')은 허용", () => {
    const ucl = buildWeeklyTable(
      tableInput(
        [
          match("2026-10-21T19:00:00.000Z", [row(LEE, "start", 90)], {
            comp: "UCL",
            league: "UEFA Champions League",
          }),
        ],
        [LEE],
      ),
    );
    const uclCtx: WeeklyCheckContext = {
      names,
      competitionLabel: (c) => (c === "UCL" ? "UEFA 챔피언스리그" : c),
    };
    const s3 = [
      "이가람이 UEFA 챔피언스리그 경기에 선발로 90분을 뛰었다.",
      "Garam Lee가 이번 주 MVP에 올랐다.",
      "이가람은 골을 넣지 못했다.",
    ];
    expect(checkWeeklySummary(s3, ucl, uclCtx).issues).toEqual([]);
    expect(
      checkWeeklySummary(
        ["UEFA 유로파리그 경기였다.", ...s3.slice(1)],
        ucl,
        uclCtx,
      ).issues.map((i) => i.code),
    ).toContain("latin-token");
  });

  it.each([
    [
      [
        "Garam Lee scored once and was named MVP of the week for his club.",
        good[1]!,
        good[2]!,
      ],
      "korean-ratio",
    ],
    [["이가람이 得点했다.", good[1]!, good[2]!], "han"],
    [["이가람이 Matchday에 골을 넣었다.", good[1]!, good[2]!], "latin-token"],
    [
      ["샘플 유나이티드는 이그잼플 시티에 1-3으로 졌다.", good[1]!, good[2]!],
      "score-not-in-input",
    ],
    [
      ["이가람은 이번 주 7개의 슈팅을 기록했다.", good[1]!, good[2]!],
      "number-not-in-input",
    ],
    [["이가람이 2골을 넣었다.", good[1]!, good[2]!], "player-stat"],
    [["Heung-min Son도 골을 넣었다.", good[1]!, good[2]!], "name-not-in-input"],
    [["Narae Kim이 이번 주 MVP에 올랐다.", good[1]!, good[2]!], "mvp-name"],
    [["이가람이 골을 넣었다. 대단했다.", good[1]!, good[2]!], "sentence-form"],
    [["이가람이 골을 넣었음", good[1]!, good[2]!], "sentence-form"],
  ])("실패 %#: %s → %s", (sentences, code) => {
    const r = checkWeeklySummary(sentences, t, ctx);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain(code);
  });
});

describe("checkWeeklySummary 경기 대조 — 선수 경기 하나와 스코어 순서·승패·홈/원정·상대·대회·날짜·승부차기 (⑤-2)", () => {
  const names = buildNameIndex(
    {
      entries: [
        { ko: "이가람", en: ["Garam Lee"], kind: "player", slug: "lee-a" },
        { ko: "김나래", en: ["Narae Kim"], kind: "player", slug: "kim-b" },
        { ko: "샘플 유나이티드", en: ["Sample United"], kind: "team" },
        { ko: "이그잼플 시티", en: ["Example City"], kind: "team" },
        { ko: "토트넘", en: ["Tottenham Hotspur"], kind: "team" },
      ],
      ignore: [],
    },
    [
      { id: "BUNDESLIGA", nameEn: "Bundesliga" },
      { id: "UCL", nameEn: "UEFA Champions League" },
    ],
  );
  const ctx: WeeklyCheckContext = {
    names,
    competitionLabel: (c) =>
      c === "BUNDESLIGA" ? "분데스리가" : c === "UCL" ? "UEFA 챔피언스리그" : c,
  };
  // 이가람: 10-24 분데스리가 홈 Example City전 2-3 패 · 김나래: 10-21 UCL 토트넘 원정 1-1(승부차기 4-3 승)
  const t = buildWeeklyTable(
    tableInput(
      [
        match("2026-10-24T13:30:00.000Z", [row(LEE, "start", 75, 1)], {
          ft: { home: 2, away: 3 },
        }),
        match("2026-10-21T19:00:00.000Z", [row(KIM, "sub", 30, 0, 0, "away")], {
          comp: "UCL",
          league: "UEFA Champions League",
          home: { id: 3, name: "Tottenham Hotspur", formation: null },
          away: { id: 1, name: "Sample United", formation: null },
          status: "PEN",
          ft: { home: 1, away: 1 },
          pens: { home: 3, away: 4 },
        }),
      ],
      [LEE, KIM],
    ),
  );
  const good = [
    "Garam Lee가 이번 주 MVP에 올랐다.",
    "Garam Lee는 10월 24일 Example City와의 Bundesliga 홈 경기에서 1골을 넣었지만 팀은 2-3으로 졌다.",
    "Narae Kim은 10월 21일 Tottenham Hotspur 원정 UEFA Champions League 경기에 교체로 30분을 뛰었고, 팀은 1-1로 비긴 뒤 승부차기에서 4-3으로 이겼다.",
  ];
  const codes = (sentences: string[]) =>
    checkWeeklySummary(sentences, t, ctx).issues.map((i) => i.code);
  const with2 = (s: string) => [good[0]!, s, good[2]!];
  const with3 = (s: string) => [good[0]!, good[1]!, s];

  it("통과 — 소속팀 득점 먼저·승부차기 승(승부차기 점수 소속팀 먼저)·기간 표기·상대 주어 문장", () => {
    expect(checkWeeklySummary(good, t, ctx).issues).toEqual([]);
    expect(
      codes(
        with2(
          "10월 19일부터 10월 25일까지 Example City는 Garam Lee의 Sample United를 3-2로 꺾었다.",
        ),
      ),
    ).toEqual([]);
  });

  it("두 선수를 묶은 문장은 그 선수들 경기 어느 것과도 모순이 없으면 통과(오탐 없음)", () => {
    expect(
      codes(
        with3("Garam Lee와 Narae Kim은 각각 2-3 패배와 1-1 무승부를 겪었다."),
      ),
    ).toEqual([]);
    expect(
      codes(
        with3(
          "Garam Lee는 홈에서 2-3으로 졌고, Narae Kim은 원정에서 1-1로 비겼다.",
        ),
      ),
    ).toEqual([]);
  });

  it.each([
    [
      "동사 반대",
      with2("Garam Lee는 Example City와의 홈 경기에서 2-3으로 이겼다."),
      "match-result",
    ],
    [
      "스코어 뒤집힘",
      with2("Garam Lee는 Example City와의 홈 경기에서 3-2로 졌다."),
      "match-score",
    ],
    [
      "홈/원정 반대",
      with2("Garam Lee는 10월 24일 Example City 원정에서 1골을 넣었다."),
      "match-venue",
    ],
    [
      "다른 경기 상대",
      with2("Garam Lee는 Tottenham Hotspur전에서 1골을 넣었다."),
      "match-opponent",
    ],
    [
      "날짜 틀림",
      with2("Garam Lee는 10월 25일 Example City전에서 1골을 넣었다."),
      "match-date",
    ],
    [
      "대회 틀림",
      with2("Garam Lee는 UEFA Champions League 경기에서 1골을 넣었다."),
      "match-comp",
    ],
    [
      "승부차기 없는 경기에 승부차기",
      with2("Garam Lee의 팀은 승부차기 끝에 2-3으로 졌다."),
      "match-shootout",
    ],
    [
      "승부차기 경기를 '승부차기' 없이 이겼다",
      with3("Narae Kim은 Tottenham Hotspur 원정에서 1-1 끝에 이겼다."),
      "match-shootout",
    ],
    [
      "승부차기 점수 뒤집힘",
      with3("Narae Kim은 Tottenham Hotspur 원정 승부차기에서 3-4로 졌다."),
      "match-score",
    ],
    [
      "승부차기 승패 반대",
      with3("Narae Kim의 팀은 승부차기에서 졌다."),
      "match-result",
    ],
    [
      "선수 경기와 바뀐 스코어(두 선수 문장)",
      with3(
        "Garam Lee는 Example City와의 홈 경기에서 1-1로 비겼고, Narae Kim은 토트넘 원정에서 2-3으로 졌다.",
      ),
      "match-score",
    ],
  ] as const)("실패 — %s → %s", (_label, sentences, code) => {
    expect(codes([...sentences])).toContain(code);
  });
});

// ─── 누락 가능 경기 ──────────────────────────────────────────────────────

describe("findPossiblyMissing — 구간 안인데 원장에 없는 한국 선수 경기 (2026-11-01 리뷰)", () => {
  const fd = (
    id: string,
    kickoff: string,
    home: string,
    away: string,
    status: "scheduled" | "finished" | "postponed" = "scheduled",
  ) => ({
    id,
    comp: "BUNDESLIGA" as const,
    round: "9",
    kickoff,
    home,
    away,
    score: null,
    status,
  });
  const linkedMatch = match("2026-10-24T13:30:00.000Z", [
    row(LEE, "start", 90),
  ]);
  const links = {
    afToSlug: new Map([
      [1, "sample-united"],
      [2, "example-city"],
    ]),
    competitions: {
      BUNDESLIGA: {
        matches: [
          fd("fd-1", "2026-10-24T13:30:00Z", "sample-united", "example-city"), // 원장과 연결
          fd("fd-2", "2026-10-25T19:30:00Z", "other-fc", "sample-united"), // 누락(일요일 늦은 경기)
          fd(
            "fd-3",
            "2026-10-22T18:00:00Z",
            "sample-united",
            "third-fc",
            "postponed",
          ), // 연기 — 제외
          fd("fd-4", "2026-10-26T18:00:00Z", "sample-united", "fourth-fc"), // 구간 밖
          fd("fd-5", "2026-10-21T18:00:00Z", "fifth-fc", "sixth-fc"), // 한국 선수 팀 아님
        ],
      },
    },
  };
  const t = buildWeeklyTable(tableInput([linkedMatch], [LEE], { links }));
  const base = {
    table: t,
    range: W43,
    ledger: [linkedMatch],
    links,
  };

  it("일정 근거 — 원장과 연결되지 않은 구간 안 경기만, 연기·구간 밖·다른 팀 제외 · 같은 경기 이월이면 pending", () => {
    expect(findPossiblyMissing({ ...base, pending: [] })).toEqual([
      {
        source: "schedule",
        id: "fd-2",
        kickoff: "2026-10-25T19:30:00Z",
        teams: ["other-fc", "sample-united"],
        players: ["lee-a"],
        pending: false,
      },
    ]);
    const withPending = findPossiblyMissing({
      ...base,
      pending: [
        { id: 900, comp: "BUNDESLIGA", kickoff: "2026-10-25T19:30:00.000Z" },
        { id: 901, comp: null, kickoff: "2026-10-25T20:00:00.000Z" }, // 기타 대회 — 이월 근거
        { id: 902, comp: null, kickoff: "2026-10-26T20:00:00.000Z" }, // 구간 밖
        { id: 903, comp: "BUNDESLIGA", kickoff: "2026-10-21T18:00:00.000Z" }, // 6개 대회 이월은 일정 근거로만
      ],
    });
    expect(withPending.map((c) => [c.source, c.id, c.pending])).toEqual([
      ["schedule", "fd-2", true],
      ["af-pending", "af-901", true],
    ]);
  });

  it("원장 연결이 없어도 그 선수 경기 줄에 킥오프 ±3시간 경기가 있으면 누락 아님", () => {
    const unlinked = { ...links, afToSlug: new Map<number, string>() };
    const t2 = buildWeeklyTable(tableInput([linkedMatch], [LEE]));
    expect(
      findPossiblyMissing({
        table: t2,
        range: W43,
        ledger: [linkedMatch],
        links: unlinked,
        pending: [],
      }).map((c) => c.id),
    ).toEqual(["fd-2"]);
  });

  it("안내 문구 — 팀·KST 킥오프·재생성 명령(--week --force)", () => {
    const [c] = findPossiblyMissing({ ...base, pending: [] });
    expect(
      missingCandidateMessage("2026-43", c!, (s) =>
        s === "sample-united" ? "샘플 유나이티드" : s,
      ),
    ).toBe(
      "W43 누락 가능: other-fc–샘플 유나이티드 10월 26일 (월) 04:30 KST (일정상 주간 경기, 원장에 없음) — 다음 날 `npm run weekly -- --week 2026-43 --force`(Actions 수동 실행 force·week 입력)로 재생성",
    );
  });
});

// ─── 템플릿 ──────────────────────────────────────────────────────────────

describe("weeklyTemplateSummary — 코드 사실 문장(summaryAi:false)", () => {
  it("단독 MVP", () => {
    const t = buildWeeklyTable(
      tableInput([
        match("2026-10-24T13:30:00.000Z", [
          row(LEE, "start", 75, 1),
          row(KIM, "bench", 0),
        ]),
      ]),
    );
    expect(weeklyTemplateSummary(t)).toBe(
      "10월 19일부터 10월 25일까지 기록을 집계한 한국 선수 3명 가운데 1명이 경기에 나섰다. " +
        "이가람이 1경기 75분 1골로 MVP 점수 4점을 얻어 이번 주 MVP에 올랐다. " +
        "이번 주 한국 선수들의 골은 모두 1골이었고 도움은 없었다.",
    );
  });

  it("공동 MVP · 골·도움 없음", () => {
    const t = buildWeeklyTable(
      tableInput(
        [
          match("2026-10-24T13:30:00.000Z", [
            row(LEE, "start", 90),
            row(KIM, "start", 90),
          ]),
        ],
        [LEE, KIM],
      ),
    );
    expect(weeklyTemplateSummary(t)).toBe(
      "10월 19일부터 10월 25일까지 기록을 집계한 한국 선수 2명 가운데 2명이 경기에 나섰다. " +
        "김나래·이가람이 나란히 1경기 90분으로 MVP 점수 1점을 얻어 공동 MVP에 올랐다. " +
        "이번 주 한국 선수의 골과 도움은 없었다.",
    );
  });

  it("출전 0명 · 추적 선수 0명", () => {
    const none = buildWeeklyTable(
      tableInput(
        [match("2026-10-24T13:30:00.000Z", [row(LEE, "bench", 0)])],
        [LEE],
      ),
    );
    expect(weeklyTemplateSummary(none)).toBe(
      "10월 19일부터 10월 25일까지 기록을 집계한 한국 선수 1명 가운데 경기에 나선 선수는 없었다.",
    );
    expect(
      weeklyTemplateSummary(buildWeeklyTable(tableInput([], []))),
    ).toContain("등록 한국 선수가 없다");
  });
});

// ─── 리포트 경기 줄 ──────────────────────────────────────────────────────

describe("리포트 rows[].matches — 경기별 줄 (2026-11-01 사용자 결정)", () => {
  // team-ids 역매핑(af 팀 id → slug) + 대회 파일 경기(fd id 연결 — korean.json 경기 로그와 같은 규칙)
  const links = {
    afToSlug: new Map([
      [1, "sample-united"],
      [2, "example-city"],
    ]),
    competitions: {
      BUNDESLIGA: {
        matches: [
          {
            id: "fd-9001",
            home: "sample-united",
            away: "example-city",
            kickoff: "2026-10-24T13:30:00Z",
          },
        ],
      },
    },
  } as unknown as NonNullable<WeeklyTableInput["links"]>; // 표본 — 연결에 쓰는 필드만

  const league = match(
    "2026-10-24T13:30:00.000Z",
    [row(LEE, "start", 90, 2, 0), row(KIM, "absent", null)],
    {
      ft: { home: 2, away: 1 },
      goalsComplete: true,
      goals: [
        {
          minute: 45,
          extra: 2,
          side: "home",
          kind: "normal",
          scorer: { id: 1001, name: "G. Lee" },
          assist: null,
        },
        {
          minute: 63,
          extra: null,
          side: "home",
          kind: "penalty",
          scorer: { id: 1001, name: "G. Lee" },
          assist: null,
        },
        {
          minute: 70,
          extra: null,
          side: "away",
          kind: "own-goal",
          scorer: { id: 1001, name: "G. Lee" },
          assist: null,
        },
      ],
    },
  );
  const cup = match(
    "2026-10-21T18:45:00.000Z",
    [
      row(LEE, "unknown", null, 1, 0, "away"),
      row(KIM, "bench", 0, 0, 0, "away"),
    ],
    {
      leagueId: 81,
      league: " DFB Pokal ",
      comp: null,
      home: { id: 55, name: "Lower League FC", formation: null },
      away: { id: 1, name: "Sample United", formation: null },
      ft: { home: 1, away: 1 },
      pens: { home: 3, away: 4 },
      status: "PEN",
      goalsComplete: false,
    },
  );

  const report = (input: WeeklyTableInput) =>
    WeeklyReportSchema.parse(
      buildWeeklyReport({
        table: buildWeeklyTable(input),
        summary: "요약.",
        summaryAi: false,
        generatedAt: "2026-10-26T00:00:00Z",
      }),
    );

  it("경기 줄 — 시간 순, 상대 slug·대회 파일 경기 id·소속팀 기준 스코어·승부차기·출전 상태·골 분(자책골 제외)", () => {
    const r = report(tableInput([league, cup], [LEE, KIM], { links }));
    const lee = r.rows.find((x) => x.player === "lee-a")!;
    expect(lee.matches).toEqual([
      {
        matchId: cup.id, // 대회 밖 경기 — 원장 키
        kickoff: "2026-10-21T18:45:00.000Z",
        comp: "OTHER",
        leagueRaw: "DFB Pokal",
        opponent: { slug: null, name: "Lower League FC" },
        home: false,
        result: { for: 1, against: 1, pens: { for: 4, against: 3 } },
        status: "unknown",
        minutes: null,
        goals: 1,
        assists: 0,
        // 득점 목록 불완전(goalsComplete false) — goalMinutes 키 없음
      },
      {
        matchId: "fd-9001",
        kickoff: "2026-10-24T13:30:00.000Z",
        comp: "BUNDESLIGA",
        opponent: { slug: "example-city", name: "Example City" },
        home: true,
        result: { for: 2, against: 1 },
        status: "start",
        minutes: 90,
        goals: 2,
        assists: 0,
        goalMinutes: ["45+2", "63"], // PK도 분만 · 자책골(70분) 제외
      },
    ]);
    const kim = r.rows.find((x) => x.player === "kim-b")!;
    expect(kim.matches?.map((l) => [l.status, l.minutes])).toEqual([
      ["bench", 0],
      ["absent", 0],
    ]);
    // 키 순서 고정(결정적 직렬화)
    expect(Object.keys(lee.matches![1]!)).toEqual([
      "matchId",
      "kickoff",
      "comp",
      "opponent",
      "home",
      "result",
      "status",
      "minutes",
      "goals",
      "assists",
      "goalMinutes",
    ]);
  });

  it("경기가 없는 선수는 빈 배열 · 링크 문맥이 없으면 상대 slug null + 원장 키", () => {
    const r = report(tableInput([league], [LEE, PARK]));
    expect(r.rows.find((x) => x.player === "park-c")!.matches).toEqual([]);
    const line = r.rows.find((x) => x.player === "lee-a")!.matches![0]!;
    expect([line.matchId, line.opponent.slug]).toEqual([league.id, null]);
  });

  it("링크를 더해도 LLM 입력은 그대로다(프롬프트 회귀 없음)", () => {
    const withLinks = buildWeeklyTable(
      tableInput([league, cup], [LEE, KIM], { links }),
    );
    const without = buildWeeklyTable(tableInput([league, cup], [LEE, KIM]));
    expect(weeklyLlmInput(withLinks)).toEqual(weeklyLlmInput(without));
  });
});
