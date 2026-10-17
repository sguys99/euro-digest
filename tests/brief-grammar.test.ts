/**
 * M1-23 재설계 — 브리핑 닫힌 문법(scripts/lib/brief-grammar.ts, PRD §15 D50)과 지시문 v0.2 [문형]의 일치.
 * 네트워크·LLM 없음.
 *
 * - 뼈대(`buildSkeleton`)·분석(`parseBriefLine`)·깨진 낱말(`skeletonWordAt`) 단위
 * - 지시문(configs/prompts/summarize.md)의 [예] '좋음' 문장은 모두 문법 안이고 입력과 맞아 통과, '나쁨'은 모두 강등
 * - 지시문 [문형] 목록의 꼴을 하나씩 채운 참 문장(합성 입력)은 모두 통과 — 지시문이 허용한 꼴이 문법 밖이면 LLM이 지시를 따라도
 *   강등된다(오탐). 문형을 더하거나 빼면 이 목록과 지시문을 함께 고친다
 * - 문형을 하나씩 틀리게 바꾼 문장은 모두 강등(슬롯 대조)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CompetitionsFileSchema, NamesKoFileSchema } from "@/lib/schema";

import { BRIEF_PROMPT_PATH } from "../scripts/lib/brief";
import {
  checkBriefOutput,
  describeLineCheck,
  type BriefCheckContext,
  type BriefCheckInput,
} from "../scripts/lib/brief-check";
import {
  buildSkeleton,
  parseBriefLine,
  PREDICATES,
  skeletonWordAt,
  type MentionKind,
} from "../scripts/lib/brief-grammar";
import { buildNameIndex } from "../scripts/lib/names";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const COMPETITIONS = CompetitionsFileSchema.parse(
  JSON.parse(read("configs/competitions.json")),
);
const CTX: BriefCheckContext = {
  names: buildNameIndex(
    NamesKoFileSchema.parse(JSON.parse(read("configs/names.ko.json"))),
    COMPETITIONS,
  ),
  competitions: COMPETITIONS,
};
const PROMPT = read(BRIEF_PROMPT_PATH).trim();

type Goal = {
  min: string;
  team: string;
  player: string;
  assist?: string;
  type?: "penalty" | "own_goal";
};
const goal = (
  min: string,
  team: string,
  player: string,
  extra: Partial<Goal> = {},
): Goal => ({ min, team, player, ...extra });

/** 지시문 자리표시자 이름(TeamA·PlayerX …)으로 만든 합성 입력 — 모든 문형의 참 문장이 나오도록 */
const SYN: BriefCheckInput = {
  briefDate: "2026-10-18",
  matches: [
    {
      id: "m1",
      comp: "Premier League",
      round: "Matchday 6",
      home: "TeamA",
      away: "TeamB",
      ft: "6-0",
      ht: "3-0",
      goals: [
        goal("10", "TeamA", "PlayerX"),
        goal("20", "TeamA", "PlayerX"),
        goal("30", "TeamA", "PlayerX"),
        goal("50", "TeamA", "PlayerQ", { assist: "PlayerX" }),
        goal("60", "TeamA", "PlayerQ", { type: "penalty" }),
        goal("70", "TeamA", "PlayerR", { assist: "PlayerQ" }),
      ],
    },
    {
      id: "m2",
      comp: "Premier League",
      round: "Matchday 6",
      home: "TeamD",
      away: "TeamC",
      ft: "1-2",
      ht: "1-0",
      goals: [
        goal("10", "TeamD", "PlayerW"),
        goal("60", "TeamC", "PlayerV", { assist: "PlayerY" }),
        goal("90+2", "TeamC", "PlayerY"),
      ],
    },
    {
      id: "m3",
      comp: "Premier League",
      round: "Matchday 6",
      home: "TeamF",
      away: "TeamE",
      ft: "3-0",
      goals: null,
    },
    {
      id: "m4",
      comp: "Premier League",
      round: "Matchday 6",
      home: "TeamH",
      away: "TeamG",
      ft: "3-4",
      goals: null,
    },
    {
      id: "m5",
      comp: "Premier League",
      round: "Matchday 6",
      home: "TeamI",
      away: "TeamJ",
      ft: "1-1",
      goals: [goal("20", "TeamJ", "PlayerS"), goal("85", "TeamI", "PlayerT")],
    },
    {
      id: "m6",
      comp: "UEFA Champions League",
      round: "QUARTER_FINALS",
      home: "TeamK",
      away: "TeamL",
      ft: "1-1",
      aet: true,
      regular: "1-1",
      pens: "4-3",
      goals: null,
    },
    {
      id: "m7",
      comp: "UEFA Champions League",
      round: "LAST_16",
      home: "TeamM",
      away: "TeamN",
      ft: "1-0",
      aet: true,
      regular: "0-0",
      pens: "3-5",
      goals: null,
    },
    {
      id: "m8",
      comp: "UEFA Champions League",
      round: "SEMI_FINALS",
      home: "TeamO",
      away: "TeamP",
      ft: "2-1",
      aet: true,
      regular: "1-1",
      goals: null,
    },
    {
      id: "m9",
      comp: "UEFA Champions League",
      round: "FINAL",
      home: "TeamQ",
      away: "TeamR",
      ft: "2-0",
      goals: null,
    },
    {
      id: "m10",
      comp: "UEFA Champions League",
      round: "LAST_16",
      home: "TeamS",
      away: "TeamT",
      ft: "2-0",
      aet: true,
      regular: "1-0",
      goals: null,
    },
    {
      id: "m11",
      comp: "Premier League",
      round: "Matchday 6",
      home: "TeamU",
      away: "TeamV",
      ft: "1-0",
      goals: [goal("30", "TeamU", "PlayerO", { type: "own_goal" })],
    },
    {
      id: "m12",
      comp: "Premier League",
      round: "Matchday 6",
      home: "TeamW",
      away: "TeamX",
      ft: "3-1",
      goals: [
        goal("10", "TeamW", "PlayerM"),
        goal("20", "TeamW", "PlayerM"),
        goal("30", "TeamW", "PlayerN"),
        goal("80", "TeamX", "PlayerP"),
      ],
    },
  ],
  standings: [
    {
      id: "sPL",
      comp: "Premier League",
      note: "current table, top 4 positions only",
      rows: [
        { pos: 1, team: "TeamF", played: 6, pts: 24, gd: 12, prev: 1 },
        { pos: 2, team: "TeamA", played: 6, pts: 21, gd: 10, prev: 3 },
        { pos: 3, team: "TeamC", played: 6, pts: 18, gd: 6, prev: 5 },
        { pos: 3, team: "TeamI", played: 6, pts: 18, gd: 6, prev: 2 },
      ],
    },
  ],
  korean: [
    {
      id: "k1",
      player: "PlayerZ",
      team: "TeamI",
      match: "m5",
      started: false,
      minutes: 33,
      goals: 0,
      assists: 0,
      subOn: 57,
    },
    {
      id: "k2",
      player: "PlayerK",
      team: "TeamA",
      match: "m1",
      started: true,
      minutes: 78,
      goals: 0,
      assists: 0,
      subOff: 78,
    },
    {
      id: "k3",
      player: "PlayerB",
      team: "TeamB",
      match: "m1",
      started: false,
      minutes: 0,
      goals: 0,
      assists: 0,
    },
  ],
};

function judge(t: string, r: string[], input: BriefCheckInput = SYN) {
  const res = checkBriefOutput([{ t, r }], input, CTX);
  return { line: res.lines[0]!, wholeOk: res.whole.ok };
}

// ─── 단위 ─────────────────────────────────────────────────────────────────

describe("뼈대·분석 단위", () => {
  const T: MentionKind = "team";
  const P: MentionKind = "player";

  it("buildSkeleton — 이름을 ⟨i⟩로, 조사는 그대로, 공백 연속은 하나로", () => {
    const text = "Real Madrid가  Villarreal을 1-0으로 꺾었다.";
    expect(
      buildSkeleton(text, [
        { start: 0, end: 11, text: "Real Madrid", kind: T },
        { start: 14, end: 24, text: "Villarreal", kind: T },
      ]),
    ).toBe("⟨0⟩가 ⟨1⟩을 1-0으로 꺾었다.");
  });

  it("문형 안이면 분석이 나오고 슬롯이 묶인다", () => {
    const r = parseBriefLine(
      "⟨0⟩가 ⟨1⟩의 62분 결승골로 ⟨2⟩을 1-0으로 꺾었다.",
      [T, P, T],
    );
    expect(r.parses).toHaveLength(1);
    expect(r.parses[0]!.clauses[0]).toMatchObject({
      type: "win",
      bag: { subj: 0, scorer: 1, scorerMin: "62", obj: 2, score: [1, 0] },
    });
  });

  it("문형 밖이면 분석 0개, 가장 멀리 읽은 위치의 낱말이 깨진 곳이다", () => {
    const mentions = [
      { start: 0, end: 0, text: "Villarreal", kind: T },
      { start: 0, end: 0, text: "Real Madrid", kind: T },
    ];
    for (const [skeleton, word] of [
      ["⟨0⟩이 ⟨1⟩에 1-0 패배를 안겼다.", "패배를"],
      ["⟨0⟩이 웃었다.", "웃었다."],
      ["⟨0⟩가 2-1로 꺾었다.", "꺾었다."],
    ] as const) {
      const r = parseBriefLine(skeleton, [T, T]);
      expect(r.parses, skeleton).toEqual([]);
      expect(skeletonWordAt(skeleton, r.furthest, mentions)).toBe(word);
    }
  });

  it("이름 종류가 슬롯과 맞지 않으면(선수 자리에 팀) 분석되지 않는다", () => {
    expect(
      parseBriefLine("⟨0⟩가 ⟨1⟩의 결승골로 ⟨2⟩을 1-0으로 꺾었다.", [T, T, T])
        .parses,
    ).toEqual([]);
  });

  it("숫자 뒤 조사는 받침에 맞아야 한다('1-0로'·'2-1으로'는 문법 밖)", () => {
    expect(parseBriefLine("⟨0⟩가 ⟨1⟩을 1-0로 꺾었다.", [T, T]).parses).toEqual(
      [],
    );
    expect(
      parseBriefLine("⟨0⟩가 ⟨1⟩을 2-1으로 꺾었다.", [T, T]).parses,
    ).toEqual([]);
    expect(
      parseBriefLine("⟨0⟩가 ⟨1⟩을 2-1로 꺾었다.", [T, T]).parses,
    ).toHaveLength(1);
  });

  it("이름 뒤 조사는 역할만 본다(받침은 치환 뒤 josa.ts가 고친다 — 'Bayern가')", () => {
    expect(
      parseBriefLine("⟨0⟩가 ⟨1⟩를 7-0으로 꺾었다.", [T, T]).parses,
    ).toHaveLength(1);
    expect(
      parseBriefLine("⟨0⟩이 ⟨1⟩을 7-0으로 꺾었다.", [T, T]).parses,
    ).toHaveLength(1);
  });

  it("술어 표 — 활용형은 겹치지 않는다(한 활용형이 두 원형을 가리키지 않게)", () => {
    const seen = new Map<string, string>();
    for (const [lemma, forms] of Object.entries(PREDICATES)) {
      for (const form of [
        ...forms.final,
        ...(forms.conn ?? []),
        ...(forms.adn ?? []),
      ]) {
        expect(seen.get(form) ?? lemma, form).toBe(lemma);
        seen.set(form, lemma);
      }
    }
  });
});

// ─── 지시문 [예] ──────────────────────────────────────────────────────────

/** 지시문 [예] 문장 → 근거 id(합성 입력) */
const EXAMPLE_REFS: Record<string, string[]> = {
  "TeamA가 PlayerX의 해트트릭을 앞세워 TeamB를 6-0으로 완파했다.": ["m1"],
  "TeamC가 PlayerY의 90+2분 결승골로 TeamD 원정에서 2-1 역전승을 거뒀다.": [
    "m2",
  ],
  "TeamE를 3-0으로 꺾은 TeamF는 승점 24로 선두다.": ["m3", "sPL"],
  "TeamG가 TeamH 원정에서 7골을 주고받은 끝에 4-3으로 이겼다.": ["m4"],
  "TeamI는 TeamJ와 1-1로 비겼고 PlayerZ는 57분 교체 투입돼 33분을 뛰었다.": [
    "m5",
    "k1",
  ],
  "TeamA가 3연승을 달렸다.": ["m1"],
  "TeamB가 3위로 올라섰다.": ["sPL"],
  "TeamC가 TeamD를 1-0으로 제치고 웃었다.": ["m2"],
};

describe("지시문 v0.2 [예] — 좋음은 통과, 나쁨은 강등", () => {
  const examples = [
    ...PROMPT.slice(
      PROMPT.indexOf("[예]"),
      PROMPT.indexOf("[쓰기 전 확인]"),
    ).matchAll(/- (좋음|나쁨) "([^"]+)"/gu),
  ].map((m) => ({ good: m[1] === "좋음", text: m[2]! }));

  it("예문은 좋음 5 · 나쁨 3이고 모두 근거 표가 있다", () => {
    expect(examples.filter((e) => e.good)).toHaveLength(5);
    expect(examples.filter((e) => !e.good)).toHaveLength(3);
    for (const e of examples)
      expect(EXAMPLE_REFS[e.text], e.text).toBeDefined();
  });

  it.each(examples.map((e) => [e.good ? "좋음" : "나쁨", e.text] as const))(
    "%s: %s",
    (kind, text) => {
      const { line, wholeOk } = judge(text, EXAMPLE_REFS[text]!);
      expect(wholeOk).toBe(true);
      expect(line.ok, `${text} → ${describeLineCheck(line)}`).toBe(
        kind === "좋음",
      );
    },
  );
});

// ─── 지시문 [문형] 목록 ───────────────────────────────────────────────────

/** [문형]의 꼴마다 채운 참 문장(합성 입력 SYN) — 모두 통과해야 한다 */
const PATTERN_LINES: Array<[pattern: string, text: string, refs: string[]]> = [
  // 결과
  ["꺾었다", "TeamA가 홈에서 TeamB를 6-0으로 꺾었다.", ["m1"]],
  [
    "눌렀다 + 대회 홈경기",
    "TeamA가 Premier League 홈경기에서 TeamB를 6-0으로 눌렀다.",
    ["m1"],
  ],
  ["제압했다 + 원정", "TeamC가 원정에서 TeamD를 2-1로 제압했다.", ["m2"]],
  [
    "이겼다(상대 생략) + 상대 원정",
    "TeamC가 TeamD 원정에서 2-1로 이겼다.",
    ["m2"],
  ],
  [
    "완파했다 + 해트트릭",
    "TeamA가 PlayerX의 해트트릭을 앞세워 TeamB를 6-0으로 완파했다.",
    ["m1"],
  ],
  [
    "결승골로 + 역전승을 거뒀다",
    "TeamC가 PlayerY의 90+2분 결승골로 TeamD에 2-1 역전승을 거뒀다.",
    ["m2"],
  ],
  ["승리를 거뒀다", "TeamF가 TeamE에 3-0 승리를 거뒀다.", ["m3"]],
  ["졌다", "TeamD는 홈에서 TeamC에 1-2로 졌다.", ["m2"]],
  ["패했다", "TeamB가 TeamA에 0-6으로 패했다.", ["m1"]],
  ["짝 비겼다", "TeamI와 TeamJ가 Premier League에서 1-1로 비겼다.", ["m5"]],
  [
    "주어 비겼다 + 동점골로",
    "TeamI가 PlayerT의 85분 동점골로 TeamJ와 1-1로 비겼다.",
    ["m5"],
  ],
  ["경기는 끝났다", "TeamI와 TeamJ의 경기는 1-1로 끝났다.", ["m5"]],
  [
    "경기는 연장까지 끝났다",
    "TeamS와 TeamT의 UEFA Champions League 경기는 연장까지 2-0으로 끝났다.",
    ["m10"],
  ],
  [
    "경기는 끝났고 승부차기에서",
    "TeamM과 TeamN의 경기는 연장까지 1-0으로 끝났고 승부차기에서 TeamN이 5-3으로 이겼다.",
    ["m7"],
  ],
  [
    "맞선 뒤 승부차기에서",
    "TeamK가 TeamL과 연장까지 1-1로 맞선 뒤 승부차기에서 4-3으로 이겼다.",
    ["m6"],
  ],
  // 수식
  [
    "대회 원정에서",
    "TeamC가 Premier League 원정에서 TeamD를 2-1로 꺾었다.",
    ["m2"],
  ],
  ["결승에서", "TeamQ가 결승에서 TeamR을 2-0으로 꺾었다.", ["m9"]],
  [
    "대회 8강에서 + 승부차기 끝에",
    "TeamK가 UEFA Champions League 8강에서 승부차기 끝에 TeamL을 꺾었다.",
    ["m6"],
  ],
  [
    "연장 끝에 + 4강에서",
    "TeamO가 4강에서 연장 끝에 TeamP를 2-1로 꺾었다.",
    ["m8"],
  ],
  [
    "골을 주고받은 끝에",
    "TeamG가 TeamH 원정에서 7골을 주고받은 끝에 4-3으로 이겼다.",
    ["m4"],
  ],
  ["PK 결승골로", "TeamU가 홈에서 TeamV를 1-0으로 꺾었다.", ["m11"]],
  // 득점
  ["골을 넣었다 + 소속", "TeamA의 PlayerQ가 60분 PK 골을 넣었다.", ["m1"]],
  ["선제골", "PlayerW가 10분 선제골을 넣었다.", ["m2"]],
  ["결승골", "PlayerY가 90+2분 결승골을 터뜨렸다.", ["m2"]],
  ["동점골 + 후반", "PlayerT가 후반 85분 동점골을 넣었다.", ["m5"]],
  ["만회골", "PlayerP가 80분 만회골을 넣었다.", ["m12"]],
  ["분 목록", "PlayerX가 10분·20분·30분에 골을 넣었다.", ["m1"]],
  ["n골", "PlayerM이 2골을 넣었다.", ["m12"]],
  ["해트트릭", "PlayerX가 해트트릭을 기록했다.", ["m1"]],
  ["멀티골", "PlayerQ가 멀티골을 기록했다.", ["m1"]],
  ["도왔다", "PlayerX가 PlayerQ의 50분 골을 도왔다.", ["m1"]],
  ["자책골", "PlayerO가 30분 자책골을 기록했다.", ["m11"]],
  // 한국 선수
  [
    "교체 투입돼 뛰었다",
    "PlayerZ는 TeamJ전에서 후반 57분 교체 투입돼 33분을 뛰었다.",
    ["k1", "m5"],
  ],
  [
    "선발 출전해 뛰고 교체됐다",
    "PlayerK는 선발 출전해 78분을 뛰고 교체됐다.",
    ["k2", "m1"],
  ],
  ["벤치를 지켰다", "PlayerB는 벤치를 지켰다.", ["k3", "m1"]],
  ["결장했다", "PlayerB는 결장했다.", ["k3"]],
  [
    "득점은 없었다",
    "PlayerZ는 57분 교체 투입돼 33분을 뛰었고 득점은 없었다.",
    ["k1"],
  ],
  // 순위
  ["선두다", "TeamF가 승점 24로 Premier League 선두다.", ["sPL"]],
  ["n위를 달렸다", "TeamA는 승점 21로 2위를 달렸다.", ["sPL"]],
  ["공동 n위다", "TeamC와 TeamI가 승점 18로 공동 3위다.", ["sPL"]],
  [
    "순위 나열",
    "TeamF가 승점 24로 Premier League 선두, TeamA가 승점 21로 2위다.",
    ["sPL"],
  ],
  ["앞선 n위다", "TeamF는 2위 TeamA에 승점 3 앞선 선두다.", ["sPL"]],
  ["올랐다(prev)", "TeamC는 5위에서 3위로 올랐다.", ["sPL"]],
  ["내려갔다(prev)", "TeamI는 2위에서 3위로 내려갔다.", ["sPL"]],
  ["지켰다(prev)", "TeamF는 선두를 지켰다.", ["sPL"]],
  // 잇기
  [
    "결과 + 순위(주어 생략)",
    "TeamF가 TeamE를 3-0으로 꺾고 승점 24로 선두를 달렸다.",
    ["m3", "sPL"],
  ],
  [
    "관형 결과 + 순위",
    "TeamE를 3-0으로 꺾은 TeamF는 승점 24로 선두다.",
    ["m3", "sPL"],
  ],
  [
    "결과 + 득점",
    "TeamA가 TeamB를 6-0으로 완파했고 PlayerX가 3골을 넣었다.",
    ["m1"],
  ],
  [
    "결과 + 한국 선수",
    "TeamI는 TeamJ와 1-1로 비겼고 PlayerZ는 57분 교체 투입돼 33분을 뛰었다.",
    ["m5", "k1"],
  ],
  [
    "순위 + 순위",
    "TeamC는 5위에서 3위로 올랐고 TeamI는 2위에서 3위로 내려갔다.",
    ["sPL"],
  ],
  ["결과 + 승점", "TeamF가 TeamE를 3-0으로 꺾고 승점 3을 챙겼다.", ["m3"]],
];

describe("지시문 v0.2 [문형] — 꼴마다 채운 참 문장은 모두 통과(지시문을 따른 줄의 오탐 0)", () => {
  it.each(PATTERN_LINES)("%s", (_, text, refs) => {
    const { line, wholeOk } = judge(text, refs);
    expect(wholeOk).toBe(true);
    expect(line.ok, `${text} → ${describeLineCheck(line)}`).toBe(true);
    expect(line.grammar).not.toBeNull();
  });
});

/** 같은 꼴에서 슬롯 하나를 틀리게 바꾼 문장 → 기대 사유 */
const WRONG_LINES: Array<[text: string, refs: string[], code: string]> = [
  ["TeamB가 홈에서 TeamA를 6-0으로 꺾었다.", ["m1"], "winner-mismatch"],
  ["TeamA가 원정에서 TeamB를 6-0으로 꺾었다.", ["m1"], "venue"],
  ["TeamA가 TeamB를 6-1로 꺾었다.", ["m1"], "score-mismatch"],
  ["TeamA가 TeamB를 0-6으로 꺾었다.", ["m1"], "score-order"],
  ["TeamC가 TeamD를 2-1로 완파했다.", ["m2"], "margin"],
  ["TeamC가 TeamD를 두 골 차로 꺾었다.", ["m2"], "margin"],
  ["TeamF가 TeamE에 3-0 역전승을 거뒀다.", ["m3"], "comeback"],
  ["TeamC가 PlayerV의 결승골로 TeamD를 2-1로 꺾었다.", ["m2"], "decisive-goal"],
  [
    "TeamC가 PlayerY의 89분 결승골로 TeamD를 2-1로 꺾었다.",
    ["m2"],
    "decisive-goal",
  ],
  [
    "TeamC가 PlayerY의 전반 결승골로 TeamD를 2-1로 꺾었다.",
    ["m2"],
    "minute-half",
  ],
  [
    "TeamA가 PlayerQ의 해트트릭을 앞세워 TeamB를 6-0으로 완파했다.",
    ["m1"],
    "goal-count",
  ],
  [
    "TeamG가 TeamH 원정에서 8골을 주고받은 끝에 4-3으로 이겼다.",
    ["m4"],
    "goal-count",
  ],
  ["TeamI와 TeamJ가 2-2로 비겼다.", ["m5"], "score-mismatch"],
  ["TeamK와 TeamL이 1-1로 비겼다.", ["m6"], "shootout-draw"],
  ["TeamK가 TeamL을 1-1로 꺾었다.", ["m6"], "shootout"],
  [
    "TeamL이 TeamK와 연장까지 1-1로 맞선 뒤 승부차기에서 4-3으로 이겼다.",
    ["m6"],
    "winner-mismatch",
  ],
  ["TeamM과 TeamN의 경기는 연장까지 1-0으로 끝났다.", ["m7"], "shootout"],
  [
    "TeamN과 TeamM의 경기는 연장까지 1-0으로 끝났다.",
    ["m10"],
    "opponent-mismatch",
  ],
  ["TeamS가 TeamT를 2-0으로 꺾었다.", ["m10"], "extra-time"],
  ["TeamQ가 홈에서 TeamR을 2-0으로 꺾었다.", ["m9"], "venue"],
  ["TeamQ가 4강에서 TeamR을 2-0으로 꺾었다.", ["m9"], "round"],
  ["PlayerQ가 10분 선제골을 넣었다.", ["m1"], "opening-goal"],
  ["PlayerV가 90+2분 결승골을 터뜨렸다.", ["m2"], "decisive-goal"],
  ["PlayerS가 85분 동점골을 넣었다.", ["m5"], "equaliser"],
  ["PlayerW가 10분 만회골을 넣었다.", ["m2"], "scorer"],
  ["PlayerX가 11분 골을 넣었다.", ["m1"], "minute"],
  ["PlayerX가 50분 PK 골을 넣었다.", ["m1"], "minute"],
  ["PlayerQ가 50분 PK 골을 넣었다.", ["m1"], "penalty"],
  ["TeamB의 PlayerQ가 60분 골을 넣었다.", ["m1"], "affiliation"],
  ["PlayerQ가 3골을 넣었다.", ["m1"], "goal-count"],
  ["PlayerR이 멀티골을 기록했다.", ["m1"], "goal-count"],
  ["PlayerR가 PlayerQ의 50분 골을 도왔다.", ["m1"], "assist-count"],
  ["PlayerO가 30분 골을 넣었다.", ["m11"], "scorer"],
  ["PlayerZ는 선발 출전해 33분을 뛰었다.", ["k1"], "appearance"],
  ["PlayerZ는 60분 교체 투입돼 33분을 뛰었다.", ["k1"], "minute"],
  ["PlayerZ는 전반 57분 교체 투입돼 33분을 뛰었다.", ["k1"], "minute-half"],
  [
    "PlayerZ는 TeamI전에서 교체 투입돼 33분을 뛰었다.",
    ["k1", "m5"],
    "opponent-mismatch",
  ],
  ["PlayerB는 선발 출전해 78분을 뛰었다.", ["k3"], "appearance"],
  ["PlayerZ는 벤치를 지켰다.", ["k1"], "appearance"],
  ["TeamA가 승점 21로 선두다.", ["sPL"], "rank-pos"],
  ["TeamA가 승점 24로 2위다.", ["sPL"], "points"],
  ["TeamF와 TeamA가 승점 24로 공동 선두다.", ["sPL"], "rank-tie"],
  ["TeamF는 2위 TeamA에 승점 4 앞선 선두다.", ["sPL"], "points"],
  ["TeamC는 6위에서 3위로 올랐다.", ["sPL"], "rank-move"],
  ["TeamA는 3위에서 2위로 내려갔다.", ["sPL"], "rank-move"],
  ["TeamA는 2위를 지켰다.", ["sPL"], "rank-move"],
  ["TeamE를 3-0으로 꺾은 TeamF는 승점 24로 2위다.", ["m3", "sPL"], "rank-pos"],
  ["TeamF가 TeamE를 3-0으로 꺾고 승점 1을 챙겼다.", ["m3"], "grammar-unknown"],
  ["TeamK가 TeamL을 승부차기 끝에 꺾고 승점 3을 챙겼다.", ["m6"], "points"],
];

describe("문형 안의 거짓 문장 — 슬롯 대조로 강등", () => {
  it.each(WRONG_LINES)("%s", (text, refs, code) => {
    const { line } = judge(text, refs);
    expect(line.ok, text).toBe(false);
    expect(
      line.reasons.map((r) => r.code),
      `${text} → ${describeLineCheck(line)}`,
    ).toContain(code);
  });
});
