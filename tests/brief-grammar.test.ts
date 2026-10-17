/**
 * M1-23 — 브리핑 닫힌 문법(scripts/lib/brief-grammar.ts, PRD §15 D50)과 지시문 [문형]의 **한 출처**(D53 ② — v0.3 → D55 ① v0.4:
 * 지금 입력에 없는 키(korean·prev)의 문형은 그 키가 입력에 있을 때만 켜지고 지시문 [문형]에 나오지 않는다).
 * 네트워크·LLM 없음.
 *
 * - 뼈대(`buildSkeleton`)·분석(`parseBriefLine`)·깨진 낱말(`skeletonWordAt`) 단위
 * - 지시문 ↔ 문법 양방향 고정: ① 지시문 [문형] 절 = `renderBriefPatterns()`(글자까지) ② 표기 → 문법 — 문형마다 표기를 펼친 모든 꼴이
 *   그 문형으로 분석된다 ③ 문법 → 표기 — 문법 요소가 쓰는 낱말·술어·자리표시자가 모두 그 문형(수식) 표기에 있다
 * - 지시문 [예] '좋음'은 통과, '나쁨'은 강등 · 문형마다 채운 참 문장(합성 입력)은 통과 · 슬롯 하나를 틀리게 바꾼 문장은 강등
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CompetitionsFileSchema, NamesKoFileSchema } from "@/lib/schema";

import { BRIEF_PROMPT_PATH } from "../scripts/lib/brief";
import {
  briefInputKeys,
  checkBriefOutput,
  describeLineCheck,
  type BriefCheckContext,
  type BriefCheckInput,
} from "../scripts/lib/brief-check";
import {
  BRIEF_INPUT_KEYS,
  buildSkeleton,
  EXPAND_KINDS,
  expandPatternText,
  MODIFIERS,
  parseBriefLine,
  PATTERNS,
  PREDICATES,
  renderBriefPatterns,
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
        { pos: 4, team: "TeamI", played: 6, pts: 17, gd: 6, prev: 2 },
      ],
    },
    {
      id: "sBL",
      comp: "Bundesliga",
      note: "current table, top 4 positions only",
      rows: [
        { pos: 1, team: "TeamO", played: 5, pts: 15, gd: 9 },
        { pos: 2, team: "TeamS", played: 5, pts: 12, gd: 5 },
        { pos: 2, team: "TeamT", played: 5, pts: 12, gd: 5 },
        { pos: 4, team: "TeamU", played: 5, pts: 9, gd: 2 },
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

  it("buildSkeleton — 이름을 ⟨i⟩로, 조사는 그대로, 공백 연속은 하나로, 원문의 ⟨·⟩는 자리표시자로 읽히지 않게", () => {
    const text = "Real Madrid가  Villarreal을 1-0으로 꺾었다.";
    expect(
      buildSkeleton(text, [
        { start: 0, end: 11, text: "Real Madrid", kind: T },
        { start: 14, end: 24, text: "Villarreal", kind: T },
      ]),
    ).toBe("⟨0⟩가 ⟨1⟩을 1-0으로 꺾었다.");
    expect(buildSkeleton("⟨0⟩가 이겼다.", [])).toBe("�0�가 이겼다.");
  });

  it("문형 안이면 분석이 나오고 슬롯이 묶인다", () => {
    const r = parseBriefLine(
      "⟨0⟩가 ⟨1⟩의 62분 결승골로 ⟨2⟩을 1-0으로 꺾었다.",
      [T, P, T],
    );
    expect(r.parses).toHaveLength(1);
    expect(r.parses[0]!.clauses[0]).toMatchObject({
      type: "win",
      id: "win",
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
      ["⟨0⟩가 ⟨1⟩를 2-1로 꺾고 승점 3을 챙겼다.", "승점"],
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

  it("숫자 뒤 조사는 받침에 맞아야 하고 앞자리 0은 쓰지 않는다('1-0로'·'01-0'·'승점 024'·'01위')", () => {
    for (const bad of [
      "⟨0⟩가 ⟨1⟩을 1-0로 꺾었다.",
      "⟨0⟩가 ⟨1⟩을 2-1으로 꺾었다.",
      "⟨0⟩가 ⟨1⟩을 01-0으로 꺾었다.",
      "⟨0⟩는 승점 024로 선두다.",
      "⟨0⟩는 01위다.",
    ])
      expect(parseBriefLine(bad, [T, T]).parses, bad).toEqual([]);
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

  it("술어 표 — 활용형은 겹치지 않고, 모든 술어를 어느 문형이 쓴다(쓰지 않는 술어 없음)", () => {
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
      const used = PATTERNS.some((p) =>
        forms.final.some((f) => p.vocab.has(f)),
      );
      expect(used, lemma).toBe(true);
    }
  });
});

// ─── 지시문 ↔ 문법 (D53 ②) ─────────────────────────────────────────────────

describe("지시문 [문형] = 문법(D53 ② — 한 출처, 양방향)", () => {
  it("지시문의 [문형] 절은 renderBriefPatterns()와 글자까지 같다", () => {
    // 머리말의 '아래 [문형]에 있는 꼴로만' 말고 줄머리 절 제목부터
    const start = PROMPT.indexOf("\n[문형]") + 1;
    const end = PROMPT.indexOf("\n\n[", start);
    expect(start).toBeGreaterThan(0);
    expect(PROMPT.slice(start, end)).toBe(renderBriefPatterns());
  });

  it("문형 22개·수식 12개다(D53 ② 축소 — 문법에만 있던 꼴 약 25개를 뺐다). 그중 5개는 입력 선택 키 문형(D55 ①)", () => {
    expect(PATTERNS).toHaveLength(22);
    expect(MODIFIERS).toHaveLength(12);
    expect(BRIEF_INPUT_KEYS).toEqual(["korean", "prev"]);
    expect(
      PATTERNS.filter((p) => p.requires).map((p) => [p.id, p.requires]),
    ).toEqual([
      ["korean", "korean"],
      ["korean-bench", "korean"],
      ["korean-tail", "korean"],
      ["move", "prev"],
      ["keep", "prev"],
    ]);
    expect(PATTERNS.map((p) => p.id)).toEqual([
      "win",
      "win-beat",
      "win-earn",
      "loss",
      "draw-pair",
      "draw",
      "end",
      "end-pens",
      "pens",
      "goal",
      "count",
      "assist",
      "korean",
      "korean-bench",
      "korean-tail",
      "rank",
      "rank-after",
      "rank-list",
      "gap",
      "move",
      "keep",
      "adn",
    ]);
  });

  it.each(PATTERNS.map((p) => [p.id, p] as const))(
    "표기 → 문법: %s의 표기를 펼친 모든 꼴이 그 문형으로 분석된다(입력 선택 키 문형은 키를 켰을 때만)",
    (_, p) => {
      const lines = expandPatternText(p.text);
      expect(lines.length).toBeGreaterThan(0);
      const parsedAs = (e: string, keys: readonly string[]) =>
        parseBriefLine(`${p.context ?? ""}${e}.`, EXPAND_KINDS, {
          keys: keys as typeof BRIEF_INPUT_KEYS,
        }).parses.some((x) => x.clauses.some((c) => c.id === p.id));
      const missed = lines.filter((e) => !parsedAs(e, BRIEF_INPUT_KEYS));
      expect(missed).toEqual([]);
      // 키가 없으면(지금 입력) 그 문형으로는 분석되지 않는다 — 키 없는 문형은 늘 켜져 있다
      const offParsed = lines.filter((e) => parsedAs(e, []));
      expect(offParsed).toEqual(p.requires ? [] : lines);
    },
  );

  it("지시문 [문형]에는 입력 선택 키 문형이 없고(D55 ① — 한국 선수 절·prev 꼴), 키를 켜면 그 꼴이 나온다(M2-03·M3-03에서 되살리기)", () => {
    const base = renderBriefPatterns();
    expect(base).not.toContain("한국 선수");
    expect(base).not.toContain("prev");
    expect(base).not.toContain("결장했다");
    expect(base).not.toContain("지켰다");
    for (const p of PATTERNS.filter((x) => x.requires))
      expect(base).not.toContain(p.text);
    const all = renderBriefPatterns({ keys: BRIEF_INPUT_KEYS });
    for (const p of PATTERNS) expect(all).toContain(`- ${p.text}`);
    expect(all).toContain("\n한국 선수\n");
    expect(renderBriefPatterns({ keys: ["prev"] })).not.toContain("한국 선수");
    expect(renderBriefPatterns({ keys: ["prev"] })).toContain(
      "(prev 있을 때만)",
    );
  });

  it("문법 → 표기: 문형·수식 요소가 쓰는 낱말·술어·자리표시자는 모두 그 표기에 있다", () => {
    const missing: string[] = [];
    for (const e of [...PATTERNS, ...MODIFIERS])
      for (const v of e.vocab)
        if (!e.text.includes(v)) missing.push(`${e.id}: ${v}`);
    expect(missing).toEqual([]);
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
  "TeamA가 3연승을 달렸다.": ["m1"],
  "TeamB가 3위로 올라섰다.": ["sPL"],
  "TeamC가 TeamD를 1-0으로 제치고 웃었다.": ["m2"],
};

describe("지시문 [예] — 좋음은 통과, 나쁨은 강등", () => {
  const examples = [
    ...PROMPT.slice(
      PROMPT.indexOf("[예]"),
      PROMPT.indexOf("[쓰기 전 확인]"),
    ).matchAll(/- (좋음|나쁨) "([^"]+)"/gu),
  ].map((m) => ({ good: m[1] === "좋음", text: m[2]! }));

  it("예문은 좋음 4 · 나쁨 3이고 모두 근거 표가 있다(D55 ① — 한국 선수 예문을 뺐다)", () => {
    expect(examples.filter((e) => e.good)).toHaveLength(4);
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

// ─── 문형마다 채운 참 문장 ─────────────────────────────────────────────────

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
  ["이겼다 + 상대를", "TeamC가 TeamD를 2-1로 이겼다.", ["m2"]],
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
  [
    "n골을 앞세워",
    "TeamW가 PlayerM의 2골을 앞세워 TeamX를 3-1로 꺾었다.",
    ["m12"],
  ],
  // 득점
  ["골을 넣었다 + 소속 + PK", "TeamA의 PlayerQ가 60분 PK 골을 넣었다.", ["m1"]],
  ["선제골", "PlayerW가 10분 선제골을 넣었다.", ["m2"]],
  ["결승골", "PlayerY가 90+2분 결승골을 터뜨렸다.", ["m2"]],
  ["동점골 + 후반", "PlayerT가 후반 85분 동점골을 넣었다.", ["m5"]],
  ["만회골", "PlayerP가 80분 만회골을 넣었다.", ["m12"]],
  ["n골", "PlayerM이 2골을 넣었다.", ["m12"]],
  ["해트트릭", "PlayerX가 해트트릭을 기록했다.", ["m1"]],
  ["멀티골", "PlayerQ가 멀티골을 기록했다.", ["m1"]],
  ["도왔다", "PlayerX가 PlayerQ의 50분 골을 도왔다.", ["m1"]],
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
  [
    "팀 선발로 출전해 + 교체 아웃",
    "PlayerK는 TeamA 선발로 출전해 78분을 뛰고 교체 아웃됐다.",
    ["k2", "m1"],
  ],
  ["결장했다", "PlayerB는 결장했다.", ["k3"]],
  ["출전하지 않았다", "PlayerB는 TeamA전에서 출전하지 않았다.", ["k3", "m1"]],
  [
    "득점은 없었다",
    "PlayerZ는 57분 교체 투입돼 33분을 뛰었고 득점은 없었다.",
    ["k1"],
  ],
  // 순위
  ["선두다", "TeamF가 승점 24로 Premier League 선두다.", ["sPL"]],
  ["n위를 달렸다", "TeamA는 승점 21로 2위를 달렸다.", ["sPL"]],
  ["n위에 올라 있다", "TeamC는 3위에 올라 있다.", ["sPL"]],
  ["공동 n위다", "TeamS와 TeamT가 승점 12로 공동 2위다.", ["sBL"]],
  [
    "순위 나열",
    "TeamF가 승점 24로 Premier League 선두, TeamA가 승점 21로 2위다.",
    ["sPL"],
  ],
  [
    "순위 나열 + 공동",
    "TeamO가 승점 15로 선두, TeamS와 TeamT가 승점 12로 공동 2위다.",
    ["sBL"],
  ],
  ["앞선 n위다", "TeamF는 2위 TeamA에 승점 3 앞선 선두다.", ["sPL"]],
  ["뒤진 공동 n위다", "TeamS는 선두 TeamO에 승점 3 뒤진 공동 2위다.", ["sBL"]],
  ["올랐다(prev)", "TeamC는 5위에서 3위로 올랐다.", ["sPL"]],
  ["내려갔다(prev)", "TeamI는 2위에서 4위로 내려갔다.", ["sPL"]],
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
    "결과 + 득점(같은 경기)",
    "TeamA가 TeamB를 6-0으로 완파했고 PlayerX가 3골을 넣었다.",
    ["m1"],
  ],
  [
    "결과 + 한국 선수(같은 경기)",
    "TeamI는 TeamJ와 1-1로 비겼고 PlayerZ는 57분 교체 투입돼 33분을 뛰었다.",
    ["m5", "k1"],
  ],
  [
    "순위 + 순위(같은 순위표)",
    "TeamC는 5위에서 3위로 올랐고 TeamI는 2위에서 4위로 내려갔다.",
    ["sPL"],
  ],
];

describe("[문형] — 꼴마다 채운 참 문장은 모두 통과(지시문을 따른 줄의 오탐 0)", () => {
  it.each(PATTERN_LINES)("%s", (_, text, refs) => {
    const { line, wholeOk } = judge(text, refs);
    expect(wholeOk).toBe(true);
    expect(line.ok, `${text} → ${describeLineCheck(line)}`).toBe(true);
    expect(line.grammar).not.toBeNull();
  });
});

describe("입력 선택 키(D55 ①) — 키가 없는 입력에서는 그 문형이 꺼지고, 키가 들어오면 다시 켜진다(M2-03 prev · M3-03 korean)", () => {
  const GATED_TYPES = new Set(["korean", "koreanTail", "move", "keep"]);
  /** 키를 켠 합성 입력에서 입력 선택 키 문형으로 읽힌 줄 */
  const gated = PATTERN_LINES.filter(([, text, refs]) =>
    (judge(text, refs).line.grammar ?? "")
      .split("+")
      .some((t) => GATED_TYPES.has(t)),
  );
  const withoutKorean: BriefCheckInput = { ...SYN, korean: undefined };
  const withoutPrev: BriefCheckInput = {
    ...SYN,
    standings: SYN.standings.map((t) => ({
      ...t,
      rows: t.rows.map(({ prev: _prev, ...row }) => {
        void _prev;
        return row;
      }),
    })),
  };
  const withoutBoth: BriefCheckInput = { ...withoutPrev, korean: undefined };

  it("briefInputKeys — 한국 선수 블록 1건 이상이면 korean, 전일 순위 행이 1개 이상이면 prev. 골든셋 10일(지금 빌더 입력)은 둘 다 없다", () => {
    expect([...briefInputKeys(SYN)].sort()).toEqual(["korean", "prev"]);
    expect([...briefInputKeys(withoutKorean)]).toEqual(["prev"]);
    expect([...briefInputKeys(withoutPrev)]).toEqual(["korean"]);
    expect([...briefInputKeys({ ...SYN, korean: [] })]).toEqual(["prev"]);
    const golden = readdirSync(path.join(ROOT, "fixtures/llm/golden/inputs"));
    expect(golden).toHaveLength(10);
    for (const file of golden) {
      const input = JSON.parse(
        read(`fixtures/llm/golden/inputs/${file}`),
      ) as BriefCheckInput;
      expect([...briefInputKeys(input)], file).toEqual([]);
    }
  });

  it("키를 켠 입력의 출전·결장·'득점은 없었다'·순위 변동·유지 줄(11줄)은 통과한다 — 키가 들어오면 다시 켜진다", () => {
    expect(gated.map(([name]) => name)).toEqual([
      "교체 투입돼 뛰었다",
      "선발 출전해 뛰고 교체됐다",
      "팀 선발로 출전해 + 교체 아웃",
      "결장했다",
      "출전하지 않았다",
      "득점은 없었다",
      "올랐다(prev)",
      "내려갔다(prev)",
      "지켰다(prev)",
      "결과 + 한국 선수(같은 경기)",
      "순위 + 순위(같은 순위표)",
    ]);
    for (const [, text, refs] of gated) {
      const { line, wholeOk } = judge(text, refs);
      expect(wholeOk && line.ok, `${text} → ${describeLineCheck(line)}`).toBe(
        true,
      );
    }
  });

  it.each([
    ["korean 없음", withoutKorean, ["korean", "koreanTail"]],
    ["prev 없음", withoutPrev, ["move", "keep"]],
    [
      "둘 다 없음(지금 입력)",
      withoutBoth,
      ["korean", "koreanTail", "move", "keep"],
    ],
  ] as const)(
    "%s — 그 키의 문형 줄은 문법 밖(grammar-unknown만), 나머지 키의 문형과 다른 문형은 그대로 통과",
    (_, input, off) => {
      for (const [name, text, refs] of PATTERN_LINES) {
        const types = (judge(text, refs).line.grammar ?? "").split("+");
        const { line } = judge(text, refs, input);
        if (types.some((t) => (off as readonly string[]).includes(t))) {
          expect(line.ok, name).toBe(false);
          // 이름 검사(한국 선수 블록 밖 이름)가 먼저 걸리는 줄도 있다 — 문형은 늘 문법 밖이다
          expect(
            line.reasons.map((r) => r.code),
            `${text} → ${describeLineCheck(line)}`,
          ).toContain("grammar-unknown");
          expect(line.grammar, name).toBeNull();
        } else {
          expect(line.ok, `${text} → ${describeLineCheck(line)}`).toBe(true);
        }
      }
    },
  );
});

/** 같은 꼴에서 슬롯 하나를 틀리게 바꾼 문장 → 기대 사유 */
const WRONG_LINES: Array<[text: string, refs: string[], code: string]> = [
  ["TeamB가 홈에서 TeamA를 6-0으로 꺾었다.", ["m1"], "winner-mismatch"],
  ["TeamA가 원정에서 TeamB를 6-0으로 꺾었다.", ["m1"], "venue"],
  ["TeamA가 TeamB를 6-1로 꺾었다.", ["m1"], "score-mismatch"],
  ["TeamA가 TeamB를 0-6으로 꺾었다.", ["m1"], "score-order"],
  ["TeamC가 TeamD를 2-1로 완파했다.", ["m2"], "margin"],
  ["TeamF가 TeamE에 3-0 역전승을 거뒀다.", ["m3"], "comeback"],
  ["TeamC가 PlayerV의 결승골로 TeamD를 2-1로 꺾었다.", ["m2"], "decisive-goal"],
  [
    "TeamC가 PlayerY의 89분 결승골로 TeamD를 2-1로 꺾었다.",
    ["m2"],
    "decisive-goal",
  ],
  [
    "TeamC가 PlayerY의 전반 90+2분 결승골로 TeamD를 2-1로 꺾었다.",
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
  [
    "TeamA가 6골을 주고받은 끝에 TeamB를 6-0으로 완파했다.",
    ["m1"],
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
  ["PlayerQ가 50분 PK 골을 넣었다.", ["m1"], "penalty"],
  ["TeamB의 PlayerQ가 60분 골을 넣었다.", ["m1"], "affiliation"],
  ["PlayerQ가 3골을 넣었다.", ["m1"], "goal-count"],
  ["PlayerR이 멀티골을 기록했다.", ["m1"], "goal-count"],
  ["PlayerR가 PlayerQ의 50분 골을 도왔다.", ["m1"], "assist-count"],
  ["PlayerZ는 선발 출전해 33분을 뛰었다.", ["k1"], "appearance"],
  ["PlayerZ는 60분 교체 투입돼 33분을 뛰었다.", ["k1"], "minute"],
  ["PlayerZ는 전반 57분 교체 투입돼 33분을 뛰었다.", ["k1"], "minute-half"],
  [
    "PlayerZ는 TeamI전에서 교체 투입돼 33분을 뛰었다.",
    ["k1", "m5"],
    "opponent-mismatch",
  ],
  ["PlayerB는 선발 출전해 78분을 뛰었다.", ["k3"], "appearance"],
  ["PlayerZ는 결장했다.", ["k1"], "appearance"],
  ["TeamA가 승점 21로 선두다.", ["sPL"], "rank-pos"],
  ["TeamA가 승점 24로 2위다.", ["sPL"], "points"],
  ["TeamF와 TeamA가 승점 24로 공동 선두다.", ["sPL"], "rank-tie"],
  ["TeamS가 승점 12로 2위다.", ["sBL"], "rank-tie"],
  ["TeamF는 2위 TeamA에 승점 4 앞선 선두다.", ["sPL"], "points"],
  ["TeamF는 2위 TeamA에 승점 3 앞선 공동 선두다.", ["sPL"], "rank-tie"],
  ["TeamO는 2위 TeamS에 승점 3 앞선 선두다.", ["sBL"], "rank-tie"],
  ["TeamC는 6위에서 3위로 올랐다.", ["sPL"], "rank-move"],
  ["TeamA는 3위에서 2위로 내려갔다.", ["sPL"], "rank-move"],
  ["TeamA는 2위를 지켰다.", ["sPL"], "rank-move"],
  [
    "TeamF가 승점 24로 선두, TeamS가 승점 12로 공동 2위다.",
    ["sPL", "sBL"],
    "rank-table",
  ],
  ["TeamE를 3-0으로 꺾은 TeamF는 승점 24로 2위다.", ["m3", "sPL"], "rank-pos"],
  [
    "TeamA가 TeamB를 6-0으로 꺾었고 TeamC는 3위다.",
    ["m1", "sPL"],
    "clause-mismatch",
  ],
  [
    "PlayerY가 90+2분 결승골을 넣었고 TeamA가 TeamB를 6-0으로 꺾었다.",
    ["m2", "m1"],
    "clause-mismatch",
  ],
  [
    "PlayerZ는 57분 교체 투입돼 33분을 뛰었고 TeamA가 TeamB를 6-0으로 꺾었다.",
    ["k1", "m1"],
    "clause-mismatch",
  ],
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
