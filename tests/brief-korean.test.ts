/**
 * M3-03 브리핑 입력 한국 선수 블록(scripts/lib/brief-input.ts `briefKoreanBlock` — D24, D55 ①) + 검사기(brief-check.ts)가 확정
 * 형식(subOn·subOff 없음)의 한국 선수 줄을 거르지 않는지. 네트워크·LLM 없음 — M0-30 입력 A(fixtures/llm/brief-inputs/2026-09-19.json).
 * 정기 실행은 아직 블록을 넣지 않는다(`BRIEF_KOREAN_ENABLED` false — 지시문 v0.5 뒤에 켠다).
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
    expect(BRIEF_KOREAN_ENABLED).toBe(false);
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
    expect(check("Min-jae Kim은 결장했다.", ["k2897"]).codes).toEqual([
      "appearance",
    ]);
  });
});
