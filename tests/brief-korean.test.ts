/**
 * M3-03 브리핑 입력 한국 선수 블록(scripts/lib/brief-input.ts `briefKoreanBlock` — D24, D55 ①) + 검사기(brief-check.ts)가 확정
 * 형식(subOn·subOff 없음)의 한국 선수 줄을 거르지 않는지. 네트워크·LLM 없음 — M0-30 입력 A(fixtures/llm/brief-inputs/2026-09-19.json)·골든 2026-10-25(M3-03b).
 * 정기 실행은 블록을 넣는다(`BRIEF_KOREAN_ENABLED` — 2026-11-02 켬, 지시문 v0.5 뒤).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  type LedgerKoreanRow,
} from "@/lib/schema";

import {
  checkBriefOutput,
  type BriefCheckContext,
  type BriefCheckInput,
} from "../scripts/lib/brief-check";
import {
  BRIEF_KOREAN_ENABLED,
  buildBriefInput,
  briefKoreanBlock,
  briefLlmInput,
  type BriefInput,
} from "../scripts/lib/brief-input";
import {
  buildNameIndex,
  canonicalizeBriefInput,
  playerTeamsFrom,
} from "../scripts/lib/names";

vi.setConfig({ testTimeout: 30_000 });

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const COMPETITIONS = CompetitionsFileSchema.parse(
  readJson("configs/competitions.json"),
);
const NAMES = buildNameIndex(
  NamesKoFileSchema.parse(readJson("configs/names.ko.json")),
  COMPETITIONS,
);
const PLAYERS = KoreanPlayersFileSchema.parse(
  readJson("configs/korean-players.json"),
);
const CTX: BriefCheckContext = { names: NAMES, competitions: COMPETITIONS };

const row = (
  player: number,
  side: "home" | "away",
  status: LedgerKoreanRow["status"],
  minutes: number | null,
  goals = 0,
  assists = 0,
): LedgerKoreanRow => ({ player, side, status, minutes, goals, assists });

const NAMES_BY_AF = new Map(
  PLAYERS.flatMap((p) =>
    p.apiFootballId !== null ? [[p.apiFootballId, p.nameEn] as const] : [],
  ),
);

describe("briefKoreanBlock — 출전한 등록 선수만, 입력 경기 순서", () => {
  const matches = [
    { id: "m1", home: "Bayern", away: "Union Berlin" },
    { id: "m2", home: "Mainz", away: "Werder Bremen" },
    { id: "m3", home: "Augsburg", away: "Freiburg" },
  ];
  const linked = new Map([
    ["m1", 501],
    ["m2", 502],
  ]);
  const rowsByAf = new Map<number, LedgerKoreanRow[]>([
    [
      501,
      [
        row(512, "away", "start", 60),
        row(2897, "home", "sub", 45),
        row(24888, "home", "unknown", null),
      ],
    ],
    [
      502,
      [row(2906, "home", "start", 75, 1, 0), row(9999, "home", "start", 90)],
    ],
    [503, [row(197985, "home", "start", 90)]],
  ]);

  it("선발·교체(분을 아는 행)만 — 벤치·제외·unknown·미등록 선수·연결 안 된 경기는 뺀다, 팀은 그 경기 입력 이름", () => {
    expect(
      briefKoreanBlock(matches, linked, { rowsByAf, names: NAMES_BY_AF }),
    ).toEqual([
      {
        id: "k512",
        player: "Woo-yeong Jeong",
        team: "Union Berlin",
        match: "m1",
        started: true,
        minutes: 60,
        goals: 0,
        assists: 0,
      },
      {
        id: "k2897",
        player: "Min-jae Kim",
        team: "Bayern",
        match: "m1",
        started: false,
        minutes: 45,
        goals: 0,
        assists: 0,
      },
      {
        id: "k2906",
        player: "Jae-sung Lee",
        team: "Mainz",
        match: "m2",
        started: true,
        minutes: 75,
        goals: 1,
        assists: 0,
      },
    ]);
  });

  it("벤치·명단 제외는 넣지 않는다(출전 0분)", () => {
    expect(
      briefKoreanBlock(matches.slice(0, 1), linked, {
        rowsByAf: new Map([
          [
            501,
            [row(512, "away", "bench", 0), row(2897, "home", "absent", null)],
          ],
        ]),
        names: NAMES_BY_AF,
      }),
    ).toEqual([]);
  });

  it("정기 실행은 아직 켜지 않는다(지시문 v0.4 — D55 ①)", () => {
    expect(BRIEF_KOREAN_ENABLED).toBe(true);
  });
});

describe("buildBriefInput — korean 재료가 있으면 연결된 상세의 API-Football 경기 id로 블록을 만든다", () => {
  const result = {
    provider: "football-data" as const,
    matchId: 565830,
    comp: "BUNDESLIGA" as const,
    kickoff: "2026-10-24T13:30:00Z",
    matchday: 8,
    stage: "REGULAR_SEASON",
    home: { id: 15, name: "Mainz", fullName: "1. FSV Mainz 05" },
    away: { id: 12, name: "Werder Bremen", fullName: "SV Werder Bremen" },
    score: {
      ft: { home: 2, away: 3 },
      ht: null,
      regular: { home: 2, away: 3 },
      pens: null,
      duration: "REGULAR" as const,
    },
  };
  const base = {
    briefDate: "2026-10-25",
    results: [result],
    competitions: COMPETITIONS,
    linked: new Map([
      [565830, { matchId: 1575200, goals: [], goalsComplete: false }],
    ]),
  };

  it("재료가 있으면 korean 키, 없으면 키 없음(지금 정기 실행)", () => {
    const korean = {
      rowsByAf: new Map([[1575200, [row(2906, "home", "start", 75, 1, 0)]]]),
      names: NAMES_BY_AF,
    };
    expect(buildBriefInput({ ...base, korean }).input.korean).toEqual([
      {
        id: "k2906",
        player: "Jae-sung Lee",
        team: "Mainz",
        match: "m565830",
        started: true,
        minutes: 75,
        goals: 1,
        assists: 0,
      },
    ]);
    expect("korean" in buildBriefInput(base).input).toBe(false);
  });
});

describe("briefLlmInput — 잘린 경기의 한국 선수 항목은 빼고 근거 id를 숨긴다(D51)", () => {
  it("남은 경기의 항목만 · 잘린 항목 id는 hiddenRefs", () => {
    const m = (id: string) => ({
      id,
      comp: "Bundesliga",
      round: "Matchday 1",
      home: `H${id}`,
      away: `A${id}`,
      ft: "1-0",
      goals: null,
    });
    const k = (id: string, match: string) => ({
      id,
      player: "P",
      team: `H${match}`,
      match,
      started: true,
      minutes: 90,
      goals: 0,
      assists: 0,
    });
    const input: BriefInput = {
      briefDate: "2026-11-02",
      matches: [m("m1"), m("m2")],
      standings: [],
      korean: [k("k1", "m1"), k("k2", "m2")],
    };
    const llm = briefLlmInput(input, 1);
    expect(llm.input.korean).toEqual([k("k1", "m1")]);
    expect([...llm.hiddenRefs].sort()).toEqual(["k2", "m2"]);
    const none = briefLlmInput({ ...input, korean: [k("k2", "m2")] }, 1);
    expect("korean" in none.input).toBe(false);
  });
});

describe("검사기 — 확정 형식(subOn·subOff 없음) 한국 선수 줄", () => {
  const raw = readJson("fixtures/llm/brief-inputs/2026-09-19.json") as {
    korean?: unknown;
  };
  const { korean: _m0, ...rest } = raw;
  void _m0;
  const base = canonicalizeBriefInput(rest as BriefCheckInput, NAMES, {
    playerTeams: playerTeamsFrom(PLAYERS),
  }).input as BriefCheckInput;
  const input: BriefCheckInput = {
    ...base,
    korean: [
      {
        id: "k2897",
        player: "Min-jae Kim",
        team: "Bayern",
        match: "m1575167",
        started: false,
        minutes: 45,
        goals: 0,
        assists: 0,
      },
      {
        id: "k512",
        player: "Woo-yeong Jeong",
        team: "Union Berlin",
        match: "m1575167",
        started: true,
        minutes: 60,
        goals: 0,
        assists: 0,
      },
    ],
  };
  const check = (t: string, r: string[]) => {
    const line = checkBriefOutput([{ t, r }], input, CTX).lines[0]!;
    return { ok: line.ok, codes: line.reasons.map((x) => x.code) };
  };

  it("출전 문형(선발·교체 투입·출전 분·'득점은 없었다')은 통과", () => {
    expect(
      check("Min-jae Kim은 교체 투입돼 45분을 뛰었다.", ["k2897"]),
    ).toEqual({ ok: true, codes: [] });
    expect(
      check("Woo-yeong Jeong은 선발 출전해 60분을 뛰었고 득점은 없었다.", [
        "k512",
      ]),
    ).toEqual({ ok: true, codes: [] });
    expect(
      check(
        "Woo-yeong Jeong은 Bayern전에서 Union Berlin 선발로 출전해 60분을 뛰었다.",
        ["k512"],
      ),
    ).toEqual({ ok: true, codes: [] });
  });

  it("입력에 없는 투입·아웃 분, 틀린 출전 분·선발 여부, 출전한 선수의 결장은 강등", () => {
    expect(
      check("Min-jae Kim은 46분 교체 투입돼 45분을 뛰었다.", ["k2897"]).ok,
    ).toBe(false);
    expect(
      check("Woo-yeong Jeong은 선발로 출전해 60분을 뛰고 교체됐다.", ["k512"])
        .ok,
    ).toBe(false);
    expect(
      check("Min-jae Kim은 선발 출전해 45분을 뛰었다.", ["k2897"]),
    ).toEqual({ ok: false, codes: ["appearance"] });
    expect(
      check("Woo-yeong Jeong은 교체 투입돼 60분을 뛰었다.", ["k512"]).codes,
    ).toEqual(["appearance"]);
    expect(
      check("Woo-yeong Jeong은 선발 출전해 90분을 뛰었다.", ["k512"]).codes,
    ).toEqual(["minute"]);
    // 결장 꼴은 출전하지 않은 행(minutes 0)이 입력에 있을 때만 켜진다(키 koreanBench, M3-03b) — 확정 입력에는 없어 문법 밖
    expect(check("Min-jae Kim은 결장했다.", ["k2897"]).codes).toEqual([
      "grammar-unknown",
    ]);
  });
});

describe("검사기 — 골든 2026-10-25(원장 한국 선수 행 → 확정 빌더 입력, M3-03b) 한국 선수 줄의 사실 대조", () => {
  const input = readJson(
    "fixtures/llm/golden/inputs/2026-10-25.json",
  ) as BriefCheckInput;
  const check = (t: string, r: string[]) => {
    const res = checkBriefOutput([{ t, r }], input, CTX);
    const line = res.lines[0]!;
    return {
      ok: res.whole.ok && line.ok,
      codes: line.reasons.map((x) => x.code),
    };
  };

  it("전제 — 블록은 출전한 선수만(설영우 벤치 제외), 이재성 1골(그 경기 득점 목록에도 있다)", () => {
    expect(
      input.korean!.map((k) => [k.id, k.started, k.minutes, k.goals]),
    ).toEqual([
      ["k927", true, 67, 0],
      ["k2906", true, 75, 1],
      ["k24888", true, 90, 0],
      ["k512", true, 76, 0],
    ]);
    const mainz = input.matches.find((m) => m.id === "m565830")!;
    expect(mainz.goals!.some((g) => g.player === "Jae-sung Lee")).toBe(true);
  });

  it.each([
    ["Jae-sung Lee가 63분 골을 넣었다.", ["k2906"]],
    ["Mainz의 Jae-sung Lee가 63분 골을 넣었다.", ["k2906"]],
    [
      "Mainz가 Bremen에 2-3으로 졌고 Jae-sung Lee가 63분 골을 넣었다.",
      ["m565830", "k2906"],
    ],
    ["Jae-sung Lee는 Bremen전에서 선발 출전해 75분을 뛰었다.", ["k2906"]],
    [
      "Hee-chan Hwang은 1. FC Köln전에서 선발 출전해 90분을 뛰었고 득점은 없었다.",
      ["k24888"],
    ],
    ["Kang-in Lee는 Atleti 선발로 출전해 67분을 뛰었다.", ["k927"]],
    ["Woo-yeong Jeong은 Augsburg전에서 선발로 나와 76분을 뛰었다.", ["k512"]],
  ])("참: %s", (t, r) => {
    expect(check(t, r)).toEqual({ ok: true, codes: [] });
  });

  it.each([
    // 골·도움 — 블록·득점 목록과 다르다
    ["Kang-in Lee가 골을 넣었다.", ["k927"], "scorer"],
    ["Jae-sung Lee가 70분 골을 넣었다.", ["k2906"], "minute"],
    ["Jae-sung Lee가 멀티골을 기록했다.", ["k2906"], "goal-count"],
    [
      "Jae-sung Lee는 선발 출전해 75분을 뛰었고 득점은 없었다.",
      ["k2906"],
      "goal-count",
    ],
    // 출전 — 선발 여부·분·팀·상대
    ["Woo-yeong Jeong은 교체 투입돼 76분을 뛰었다.", ["k512"], "appearance"],
    ["Hee-chan Hwang은 선발 출전해 85분을 뛰었다.", ["k24888"], "minute"],
    [
      "Jae-sung Lee는 Schalke 선발로 출전해 75분을 뛰었다.",
      ["k2906"],
      "affiliation",
    ],
    ["Bremen의 Jae-sung Lee가 63분 골을 넣었다.", ["k2906"], "affiliation"],
    [
      "Woo-yeong Jeong은 Bremen전에서 선발 출전해 76분을 뛰었다.",
      ["k512"],
      "opponent-mismatch",
    ],
    // 다른 경기 결과와 잇기
    [
      "Atleti가 RC Deportivo La Coruña를 1-0으로 꺾었고 Jae-sung Lee가 63분 골을 넣었다.",
      ["m564724", "k2906"],
      "clause-mismatch",
    ],
  ])("거짓: %s → %s", (t, r, code) => {
    const res = check(t, r);
    expect(res.ok).toBe(false);
    expect(res.codes, t).toContain(code);
  });

  it.each([
    // 원장에 없는 교체 시각·교체 아웃, 블록에 없는 선수(벤치)의 결장 — 문형 밖(지시문 v0.5 [문형]에도 없다)
    ["Kang-in Lee는 선발 출전해 67분을 뛰고 교체됐다.", ["k927"]],
    ["Jae-sung Lee는 60분 교체 투입돼 15분을 뛰었다.", ["k2906"]],
    ["Young-woo Seol은 Union Berlin전에서 결장했다.", ["m565838"]],
  ])("문형 밖: %s", (t, r) => {
    const res = check(t, r);
    expect(res.ok).toBe(false);
    expect(res.codes, t).toContain("grammar-unknown");
  });

  it("블록에 없는 선수(벤치 — 설영우)의 출전 서술은 근거가 없다", () => {
    const res = check("Young-woo Seol은 교체 투입돼 10분을 뛰었다.", ["k512"]);
    expect(res.ok).toBe(false);
  });
});
