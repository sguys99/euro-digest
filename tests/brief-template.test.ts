/**
 * M1-19 브리핑 코드 템플릿 문장(scripts/lib/brief-template.ts) — 결정적·ai:false·refs, 스코어 홈-원정 고정(D30), 입력에서 계산되는
 * 서술만(결승골·동점골·해트트릭·역전승·n골 차·연장·승부차기), 순위 줄(공동 순위·변동 서술 없음), 길이(60자 목표·80자 상한), 이름 뒤
 * 가변 조사 없음(M1-21 경계), football-data만으로 5줄(M1-47 이월). 네트워크·LLM 없음.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BRIEF_LINE_MAX,
  BriefLineSchema,
  CompetitionsFileSchema,
  NamesKoFileSchema,
} from "@/lib/schema";

import type {
  BriefInput,
  BriefInputMatch,
  BriefInputStandings,
} from "../scripts/lib/brief-input";
import { buildBriefInput } from "../scripts/lib/brief-input";
import {
  BRIEF_TEMPLATE_TARGET,
  ENGLISH_NAMES,
  namesKoResolver,
  templateBriefLines,
  templateLineForRefs,
  templateMatchLine,
  templateStandingsLine,
  type BriefNames,
  type BriefTemplateContext,
} from "../scripts/lib/brief-template";
import {
  toCompStandings,
  toFinishedResults,
} from "../scripts/lib/providers/football-data";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

const COMPETITIONS = CompetitionsFileSchema.parse(
  readJson("configs/competitions.json"),
);
const CTX: BriefTemplateContext = { competitions: COMPETITIONS };

/** 경기 1건(기본: 프리미어리그 Arsenal 2-1 Chelsea, 득점 데이터 없음) */
function match(over: Partial<BriefInputMatch> = {}): BriefInputMatch {
  return {
    id: "m1",
    comp: "Premier League",
    round: "Matchday 6",
    home: "Arsenal",
    away: "Chelsea",
    ft: "2-1",
    goals: null,
    ...over,
  };
}

function textOf(m: BriefInputMatch, ctx: BriefTemplateContext = CTX): string {
  const line = templateMatchLine(m, ctx);
  if (!line) throw new Error("줄이 없다");
  return line.text;
}

const goal = (
  min: string,
  team: string,
  player: string,
  type?: "penalty" | "own_goal",
) => (type ? { min, team, player, type } : { min, team, player });

/** M0-30·M0-34 정형 입력(fixtures/llm/brief-inputs) — 이 모듈의 입력과 같은 형식의 실제 데이터 */
const M0_INPUTS: BriefInput[] = readdirSync(
  path.join(ROOT, "fixtures/llm/brief-inputs"),
)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .map((f) => readJson(`fixtures/llm/brief-inputs/${f}`) as BriefInput);

/** 2026-10-10 실응답(football-data만 — 득점자 없음)으로 만든 입력 */
const FD_ONLY_INPUT = buildBriefInput({
  briefDate: "2026-10-11",
  results: toFinishedResults(
    (
      readJson(
        "fixtures/football/football-data/matches-6comps-2026-10-10.json",
      ) as { matches: unknown[] }
    ).matches,
    COMPETITIONS,
    { start: "2026-10-10T00:00:00.000Z", end: "2026-10-11T00:00:00.000Z" },
  ).results,
  competitions: COMPETITIONS,
  standings: (["pl", "pd", "sa", "bl1", "fl1"] as const).map((code) =>
    toCompStandings(
      readJson(
        `fixtures/football/football-data/standings-${code}-2026-10-11.json`,
      ),
      COMPETITIONS.find((c) => c.footballDataCode.toLowerCase() === code)!,
      { fetchedAt: "2026-10-11T06:45:00.000Z", inProgress: 0 },
    ),
  ),
}).input;

describe("경기 줄 — 기본 서술(득점 데이터 없음)", () => {
  it("홈 h-a 원정 고정(D30) · ai:false · refs = 경기 id · 문장 끝 마침표", () => {
    const line = templateMatchLine(match(), CTX)!;
    expect(line).toEqual({
      text: "프리미어리그 Arsenal 2-1 Chelsea, 홈팀이 이겼다.",
      ai: false,
      refs: ["m1"],
    });
    expect(BriefLineSchema.safeParse(line).success).toBe(true);
    // 원정 승리도 점수는 홈-원정 순서 그대로
    expect(textOf(match({ ft: "0-2" }))).toBe(
      "프리미어리그 Arsenal 0-2 Chelsea, 원정팀이 이겼다.",
    );
  });

  it("결정적이다 — 같은 입력은 같은 줄", () => {
    const m = match({
      goals: [
        goal("10", "Chelsea", "Cole Palmer"),
        goal("50", "Arsenal", "Saka"),
        goal("80", "Arsenal", "Saka"),
      ],
    });
    expect(templateMatchLine(m, CTX)).toEqual(templateMatchLine(m, CTX));
  });

  it("3골 차 이상 — n골 차(두 점수의 차)", () => {
    expect(textOf(match({ ft: "5-1" }))).toBe(
      "프리미어리그 Arsenal 5-1 Chelsea, 홈팀이 4골 차로 이겼다.",
    );
    expect(textOf(match({ ft: "0-3" }))).toBe(
      "프리미어리그 Arsenal 0-3 Chelsea, 원정팀이 3골 차로 이겼다.",
    );
  });

  it("전반에 뒤졌다 이기면 역전승(전반 스코어로 확인) — 전반 동점·앞섬은 역전승이 아니다", () => {
    expect(textOf(match({ ht: "0-1" }))).toBe(
      "프리미어리그 Arsenal 2-1 Chelsea, 홈팀이 역전승을 거뒀다.",
    );
    expect(textOf(match({ ft: "1-4", ht: "1-0" }))).toBe(
      "프리미어리그 Arsenal 1-4 Chelsea, 원정팀이 3골 차 역전승을 거뒀다.",
    );
    expect(textOf(match({ ht: "1-1" }))).toContain("홈팀이 이겼다.");
    expect(textOf(match({ ht: "1-0" }))).toContain("홈팀이 이겼다.");
  });

  it("무승부 — 0-0은 득점 없이, 그 밖은 승부를 가리지 못했다", () => {
    expect(textOf(match({ ft: "0-0" }))).toBe(
      "프리미어리그 Arsenal 0-0 Chelsea, 득점 없이 비겼다.",
    );
    expect(textOf(match({ ft: "2-2" }))).toBe(
      "프리미어리그 Arsenal 2-2 Chelsea, 두 팀이 승부를 가리지 못했다.",
    );
  });

  it("연장·승부차기(M1-44 이월) — 연장 끝에·승부차기(h-a) 끝에, 승부차기 점수도 홈-원정", () => {
    expect(textOf(match({ ft: "1-2", aet: true, regular: "1-1" }))).toBe(
      "프리미어리그 Arsenal 1-2 Chelsea, 연장 끝에 원정팀이 이겼다.",
    );
    expect(
      textOf(match({ ft: "1-1", aet: true, regular: "1-1", pens: "4-3" })),
    ).toBe(
      "프리미어리그 Arsenal 1-1 Chelsea, 승부차기(4-3) 끝에 홈팀이 이겼다.",
    );
    expect(
      textOf(match({ ft: "0-0", aet: true, pens: "2-4", goals: [] })),
    ).toBe(
      "프리미어리그 Arsenal 0-0 Chelsea, 승부차기(2-4) 끝에 원정팀이 이겼다.",
    );
    expect(textOf(match({ ft: "1-1", aet: true }))).toBe(
      "프리미어리그 Arsenal 1-1 Chelsea, 연장 끝에 비겼다.",
    );
  });

  it("중립 경기장 결승(round FINAL)은 홈·원정 대신 이긴 팀 이름", () => {
    const final = match({
      comp: "UEFA Champions League",
      round: "FINAL",
      ft: "1-1",
      aet: true,
      pens: "3-4",
    });
    expect(textOf(final)).toBe(
      "UEFA 챔피언스리그 Arsenal 1-1 Chelsea, Chelsea의 승부차기(3-4) 승리로 끝났다.",
    );
    expect(
      textOf({ ...final, ft: "2-0", aet: undefined, pens: undefined }),
    ).toBe("UEFA 챔피언스리그 Arsenal 2-0 Chelsea, Arsenal의 승리로 끝났다.");
  });
});

describe("경기 줄 — 득점 목록이 완전할 때만 득점자 서술", () => {
  it("결승골 = 이긴 팀의 (진 팀 점수 + 1)번째 골 — 분 포함(2026-10-10 Mainz 3-4 Leverkusen → Diaby 65분)", () => {
    const m = match({
      comp: "Bundesliga",
      home: "Mainz",
      away: "Leverkusen",
      ft: "3-4",
      ht: "2-2",
      goals: [
        goal("5", "Leverkusen", "Robert Andrich"),
        goal("9", "Leverkusen", "Patrik Schick"),
        goal("33", "Mainz", "Anthony Caci"),
        goal("42", "Mainz", "Anthony Caci"),
        goal("55", "Leverkusen", "Jarell Quansah"),
        goal("65", "Leverkusen", "Moussa Diaby"),
        goal("90+2", "Mainz", "Benedict Hollerbach"),
      ],
    });
    expect(textOf(m)).toBe(
      "분데스리가 Mainz 3-4 Leverkusen, Moussa Diaby의 65분 결승골로 원정팀이 이겼다.",
    );
  });

  it("득점 순서로 뒤진 적이 확인되면 결승골 + 역전승(Arsenal 2-1 Leeds — 전반 0-0)", () => {
    const m = match({
      away: "Leeds",
      ht: "0-0",
      goals: [
        goal("55", "Leeds", "James Justin"),
        goal("62", "Arsenal", "Riccardo Calafiori"),
        goal("70", "Arsenal", "Saka"),
      ],
    });
    expect(textOf(m)).toBe(
      "프리미어리그 Arsenal 2-1 Leeds, Saka의 70분 결승골로 홈팀이 역전승을 거뒀다.",
    );
  });

  it("PK 결승골·자책골 결승골(득점자 서술 없음)·득점 순서는 분으로 정렬(45+6 < 46)", () => {
    const pk = match({
      ft: "1-0",
      goals: [goal("45+6", "Arsenal", "Saka", "penalty")],
    });
    expect(textOf(pk)).toBe(
      "프리미어리그 Arsenal 1-0 Chelsea, Saka의 45+6분 PK 결승골로 홈팀이 이겼다.",
    );
    const own = match({
      ft: "1-0",
      goals: [goal("30", "Arsenal", "Reece James", "own_goal")],
    });
    expect(textOf(own)).toBe(
      "프리미어리그 Arsenal 1-0 Chelsea, 홈팀이 이겼다.",
    );
    const unordered = match({
      ft: "2-1",
      goals: [
        goal("46", "Arsenal", "Saka"),
        goal("45+2", "Chelsea", "Palmer"),
        goal("10", "Arsenal", "Rice"),
      ],
    });
    // 10' 1-0 → 45+2' 1-1 → 46' 2-1: 결승골은 Saka(46분)
    expect(textOf(unordered)).toContain("Saka의 46분 결승골로");
  });

  it("해트트릭(이긴 팀 같은 선수 3골) · 4골 이상은 n골 — 3골 차 이상이어도 해트트릭을 쓴다", () => {
    const hat = match({
      comp: "Bundesliga",
      home: "Leipzig",
      away: "Frankfurt",
      ft: "6-0",
      goals: [
        goal("1", "Leipzig", "Banzuzi"),
        goal("5", "Leipzig", "Nkunku"),
        goal("41", "Leipzig", "Nkunku"),
        goal("44", "Leipzig", "Nkunku"),
        goal("54", "Leipzig", "Nusa"),
        goal("89", "Leipzig", "Gomis"),
      ],
    });
    expect(textOf(hat)).toBe(
      "분데스리가 Leipzig 6-0 Frankfurt, Nkunku의 해트트릭으로 홈팀이 이겼다.",
    );
    const four = match({
      ft: "4-1",
      goals: [
        goal("1", "Arsenal", "Saka"),
        goal("2", "Arsenal", "Saka"),
        goal("3", "Chelsea", "Palmer"),
        goal("4", "Arsenal", "Saka"),
        goal("5", "Arsenal", "Saka"),
      ],
    });
    expect(textOf(four)).toContain("Saka의 4골로 홈팀이 이겼다.");
    // 진 팀 선수의 3골은 해트트릭 서술을 하지 않는다
    const loserHat = match({
      ft: "4-3",
      goals: [
        goal("1", "Chelsea", "Palmer"),
        goal("2", "Chelsea", "Palmer"),
        goal("3", "Chelsea", "Palmer"),
        goal("4", "Arsenal", "A"),
        goal("5", "Arsenal", "B"),
        goal("6", "Arsenal", "C"),
        goal("7", "Arsenal", "D"),
      ],
    });
    expect(textOf(loserHat)).toBe(
      "프리미어리그 Arsenal 4-3 Chelsea, D의 7분 결승골로 홈팀이 역전승을 거뒀다.",
    );
  });

  it("3골 차 이상 승리는 결승골 대신 점수 차", () => {
    const m = match({
      ft: "3-0",
      goals: [
        goal("10", "Arsenal", "A"),
        goal("20", "Arsenal", "B"),
        goal("30", "Arsenal", "C"),
      ],
    });
    expect(textOf(m)).toBe(
      "프리미어리그 Arsenal 3-0 Chelsea, 홈팀이 3골 차로 이겼다.",
    );
  });

  it("무승부 — 마지막 골(동점골), 자책골이면 득점자 서술 없음, 0-0 빈 목록", () => {
    const late = match({
      comp: "Bundesliga",
      home: "Dortmund",
      away: "Bremen",
      ft: "2-2",
      goals: [
        goal("80", "Dortmund", "Svensson"),
        goal("85", "Dortmund", "Schlotterbeck"),
        goal("88", "Bremen", "Reis"),
        goal("90+2", "Bremen", "Füllkrug"),
      ],
    });
    expect(textOf(late)).toBe(
      "분데스리가 Dortmund 2-2 Bremen, Füllkrug의 90+2분 동점골로 두 팀이 비겼다.",
    );
    const own = match({
      ft: "1-1",
      goals: [
        goal("10", "Arsenal", "Saka"),
        goal("20", "Chelsea", "Saliba", "own_goal"),
      ],
    });
    expect(textOf(own)).toBe(
      "프리미어리그 Arsenal 1-1 Chelsea, 두 팀이 승부를 가리지 못했다.",
    );
    expect(textOf(match({ ft: "0-0", goals: [] }))).toBe(
      "프리미어리그 Arsenal 0-0 Chelsea, 득점 없이 비겼다.",
    );
  });

  it("득점 목록이 점수와 맞지 않거나 팀·분 형식이 다르면 득점자를 쓰지 않는다(확인할 수 없는 사실 금지)", () => {
    const base = "프리미어리그 Arsenal 2-1 Chelsea, 홈팀이 이겼다.";
    const short = match({ goals: [goal("10", "Arsenal", "Saka")] });
    expect(textOf(short)).toBe(base);
    const wrongTeam = match({
      goals: [
        goal("10", "Arsenal", "Saka"),
        goal("20", "Arsenal FC", "Rice"),
        goal("30", "Chelsea", "Palmer"),
      ],
    });
    expect(textOf(wrongTeam)).toBe(base);
    const badMinute = match({
      goals: [
        goal("10'", "Arsenal", "Saka"),
        goal("20", "Arsenal", "Rice"),
        goal("30", "Chelsea", "Palmer"),
      ],
    });
    expect(textOf(badMinute)).toBe(base);
    // 연장·승부차기 경기는 득점자 서술을 하지 않는다(연장 표기만)
    expect(
      textOf(
        match({
          ft: "2-1",
          aet: true,
          goals: [
            goal("10", "Arsenal", "Saka"),
            goal("30", "Chelsea", "Palmer"),
            goal("110", "Arsenal", "Rice"),
          ],
        }),
      ),
    ).toBe("프리미어리그 Arsenal 2-1 Chelsea, 연장 끝에 홈팀이 이겼다.");
  });

  it("점수 형식이 틀린 입력은 줄을 만들지 않는다", () => {
    expect(templateMatchLine(match({ ft: "2:1" }), CTX)).toBeNull();
    expect(templateMatchLine(match({ pens: "x" }), CTX)).toBeNull();
  });
});

describe("길이 — 60자 목표 안의 가장 자세한 변형, 80자 상한(D40 ⑤)", () => {
  const long = (n: number) => "N".repeat(n);
  const scorer = (name: string) =>
    match({
      ft: "1-0",
      goals: [goal("88", "Arsenal", name)],
    });

  it("목표를 넘으면 분 → 대회 약칭(shortKo) → 득점자 → 대회 이름 순으로 줄인다", () => {
    expect(textOf(scorer("Saka"))).toBe(
      "프리미어리그 Arsenal 1-0 Chelsea, Saka의 88분 결승골로 홈팀이 이겼다.",
    );
    // 분을 빼야 60자 안
    expect(textOf(scorer(long(16)))).toBe(
      `프리미어리그 Arsenal 1-0 Chelsea, ${long(16)}의 결승골로 홈팀이 이겼다.`,
    );
    // 대회 약칭(EPL)이어야 60자 안
    expect(textOf(scorer(long(19)))).toBe(
      `EPL Arsenal 1-0 Chelsea, ${long(19)}의 결승골로 홈팀이 이겼다.`,
    );
    // 득점자 서술을 빼야 60자 안
    expect(textOf(scorer(long(30)))).toBe(
      "프리미어리그 Arsenal 1-0 Chelsea, 홈팀이 이겼다.",
    );
  });

  it("60자 안의 문장이 없으면 80자 안의 첫 문장, 그다음 스코어만, 그것도 넘으면 줄 없음(문장 절단 안 함)", () => {
    const wide = (n: number) => match({ home: long(n), away: long(n) });
    // 스코어만(55자)이 60자 안이어도 80자 안의 문장을 먼저 고른다
    const at72 = textOf(wide(25));
    expect(at72).toBe(
      `프리미어리그 ${long(25)} 2-1 ${long(25)}, 홈팀이 이겼다.`,
    );
    expect(at72.length).toBeGreaterThan(BRIEF_TEMPLATE_TARGET);
    expect(at72.length).toBeLessThanOrEqual(BRIEF_LINE_MAX);
    expect(textOf(wide(37))).toBe(`${long(37)} 2-1 ${long(37)}`); // 스코어만(79자)
    expect(templateMatchLine(wide(40), CTX)).toBeNull();
  });
});

describe("순위 줄", () => {
  const table = (
    rows: Array<[number, string, number]>,
    id = "sPL",
  ): BriefInputStandings => ({
    id,
    comp: "Premier League",
    note: "current table, top 4 positions only",
    rows: rows.map(([pos, team, pts]) => ({
      pos,
      team,
      played: 6,
      pts,
      gd: 0,
    })),
  });

  it("1위·2위(·3위) 승점 — 변동 서술 없음(전일 순위 없음, D40 ③)", () => {
    const line = templateStandingsLine(
      table([
        [1, "맨시티", 15],
        [2, "아스널", 15],
        [3, "브라이턴", 13],
        [4, "브렌트포드", 10],
      ]),
      CTX,
    )!;
    expect(line).toEqual({
      text: "프리미어리그 순위는 1위 맨시티(승점 15), 2위 아스널(승점 15), 3위 브라이턴(승점 13) 순이다.",
      ai: false,
      refs: ["sPL"],
    });
    // 60자를 넘으면 두 순위만
    const longer = templateStandingsLine(
      table([
        [1, "Manchester City", 15],
        [2, "Arsenal", 15],
        [3, "Brighton Hove", 13],
      ]),
      CTX,
    )!;
    expect(longer.text).toBe(
      "프리미어리그 순위는 1위 Manchester City(승점 15), 2위 Arsenal(승점 15) 순이다.",
    );
  });

  it("공동 순위는 한 묶음(응답 순서) — 첫 순위 공동이 3팀을 넘거나 팀이 하나뿐이면 줄 없음", () => {
    expect(
      templateStandingsLine(
        table([
          [1, "A", 7],
          [1, "B", 7],
          [3, "C", 6],
        ]),
        CTX,
      )!.text,
    ).toBe("프리미어리그 순위는 공동 1위 A·B(승점 7), 3위 C(승점 6) 순이다.");
    expect(
      templateStandingsLine(
        table([
          [1, "A", 3],
          [1, "B", 3],
          [1, "C", 3],
          [1, "D", 3],
        ]),
        CTX,
      ),
    ).toBeNull();
    expect(templateStandingsLine(table([[1, "A", 3]]), CTX)).toBeNull();
  });

  it("어느 순위 줄에도 변동 서술(올랐·내려·상승·하락·유지)이 없다", () => {
    for (const input of [...M0_INPUTS, FD_ONLY_INPUT]) {
      for (const s of input.standings) {
        const line = templateStandingsLine(s, CTX);
        if (line)
          expect(line.text).not.toMatch(/올랐|내려|상승|하락|유지|지켰/);
      }
    }
  });
});

describe("브리핑 구성 — templateBriefLines", () => {
  it("football-data만으로(득점자 없음) 경기 4줄 + 순위 1줄(M1-47 이월) — 모든 줄 스키마 통과·ai:false·60자 이내", () => {
    const lines = templateBriefLines(FD_ONLY_INPUT, CTX);
    expect(lines).toHaveLength(5);
    expect(lines.slice(0, 4).map((l) => l.refs[0])).toEqual(
      FD_ONLY_INPUT.matches.slice(0, 4).map((m) => m.id),
    );
    expect(lines[4]!.refs).toEqual([FD_ONLY_INPUT.standings[0]!.id]);
    for (const line of lines) {
      expect(BriefLineSchema.safeParse(line).success, line.text).toBe(true);
      expect(line.ai).toBe(false);
      expect(line.text.length).toBeLessThanOrEqual(BRIEF_TEMPLATE_TARGET);
    }
  });

  it("순위가 없으면 경기 5줄, 경기가 적으면 순위 줄(최대 2개)로 채운다, 경기가 없으면 빈 배열", () => {
    const matches = FD_ONLY_INPUT.matches;
    const standings = FD_ONLY_INPUT.standings;
    expect(
      templateBriefLines({ matches, standings: [] }, CTX).map((l) => l.refs[0]),
    ).toEqual(matches.slice(0, 5).map((m) => m.id));
    expect(
      templateBriefLines({ matches: matches.slice(0, 2), standings }, CTX).map(
        (l) => l.refs[0],
      ),
    ).toEqual([
      matches[0]!.id,
      matches[1]!.id,
      standings[0]!.id,
      standings[1]!.id,
    ]);
    expect(
      templateBriefLines({ matches: matches.slice(0, 1), standings }, CTX),
    ).toHaveLength(3);
    expect(templateBriefLines({ matches: [], standings }, CTX)).toEqual([]);
  });

  it("templateLineForRefs — 첫 경기 id의 줄, 경기가 없으면 순위 id의 줄, 모르는 id면 null(줄 단위 강등용 — M1-45)", () => {
    const [first, second] = FD_ONLY_INPUT.matches;
    expect(
      templateLineForRefs(FD_ONLY_INPUT, ["sPL", second!.id, first!.id], CTX),
    ).toEqual(templateMatchLine(second!, CTX));
    expect(
      templateLineForRefs(FD_ONLY_INPUT, ["k927", "sPL"], CTX)?.refs,
    ).toEqual(["sPL"]);
    expect(templateLineForRefs(FD_ONLY_INPUT, ["m0", "x1"], CTX)).toBeNull();
  });
});

describe("입력에 없는 사실·조사 — 실제 입력 전체(M0-30·M0-34 6일치 + 2026-10-10 football-data)", () => {
  /** 이름을 표시로 감싼다 — 이름 바로 뒤 글자를 검사하려고 */
  const MARKED: BriefNames = {
    team: (n) => `⟨${n}⟩`,
    person: (n) => `⟨${n}⟩`,
  };

  it("이름 바로 뒤에는 받침에 따라 바뀌는 조사가 오지 않는다 — 쉼표·괄호·'·'·공백·'의'·마침표만(M1-21 조사 보정 불필요)", () => {
    let names = 0;
    for (const input of [...M0_INPUTS, FD_ONLY_INPUT]) {
      for (const line of templateBriefLines(input, {
        competitions: COMPETITIONS,
        names: MARKED,
      })) {
        for (const m of line.text.matchAll(/⟩(.?)/g)) {
          names += 1;
          expect([",", "(", "·", " ", "의", ".", ""], line.text).toContain(
            m[1],
          );
        }
      }
    }
    expect(names).toBeGreaterThan(30);
  });

  it("줄의 숫자는 모두 입력에서 나온다(점수·점수 차·득점 분·순위·승점, 이름 속 숫자)", () => {
    for (const input of [...M0_INPUTS, FD_ONLY_INPUT]) {
      const lines = templateBriefLines(input, CTX);
      for (const line of lines) {
        const allowed = new Set<string>();
        const add = (text: string | undefined) => {
          for (const n of (text ?? "").match(/\d+/g) ?? []) allowed.add(n);
        };
        for (const ref of line.refs) {
          const m = input.matches.find((x) => x.id === ref);
          if (m) {
            [m.ft, m.ht, m.pens, m.regular, m.home, m.away].forEach(add);
            const [h, a] = m.ft.split("-").map(Number);
            allowed.add(String(Math.abs(h! - a!)));
            for (const g of m.goals ?? []) [g.min, g.player].forEach(add);
          }
          const s = input.standings.find((x) => x.id === ref);
          if (s) {
            for (const r of s.rows) {
              [String(r.pos), String(r.pts), r.team].forEach(add);
            }
          }
        }
        for (const n of line.text.match(/\d+/g) ?? []) {
          expect(allowed.has(n), `${line.text} — ${n}`).toBe(true);
        }
      }
    }
  });

  it("고정 문구의 한글은 KS X 1001 안이다(웹폰트 서브셋 — PRD §15 D29)", () => {
    const decoder = new TextDecoder("euc-kr");
    const ksx = new Set<string>();
    for (let hi = 0xb0; hi <= 0xc8; hi += 1) {
      for (let lo = 0xa1; lo <= 0xfe; lo += 1) {
        ksx.add(decoder.decode(new Uint8Array([hi, lo])));
      }
    }
    for (const input of [...M0_INPUTS, FD_ONLY_INPUT]) {
      for (const line of templateBriefLines(input, {
        competitions: COMPETITIONS,
        names: ENGLISH_NAMES,
      })) {
        for (const ch of line.text.match(/[가-힣]/g) ?? []) {
          expect(ksx.has(ch), `${line.text} — ${ch}`).toBe(true);
        }
      }
    }
  });
});

describe("고유명사 — names.ko.json 단순 대조(M1-21 전)", () => {
  it("등록된 영문 표기(대소문자 무시)는 한글, 미등록은 영문 그대로", () => {
    const names = namesKoResolver(
      NamesKoFileSchema.parse(readJson("configs/names.ko.json")),
    );
    expect(names.team("Atleti")).toBe("아틀레티코 마드리드");
    expect(names.team("union berlin")).toBe("우니온 베를린");
    expect(names.team("Leverkusen")).toBe("Leverkusen");
    expect(names.person("Kang-in Lee")).toBe("이강인");
    expect(names.person("Atleti")).toBe("Atleti"); // 팀 표기는 사람 이름으로 바꾸지 않는다
    expect(
      textOf(
        match({ comp: "LaLiga", home: "Alavés", away: "Atleti", ft: "1-2" }),
        { competitions: COMPETITIONS, names },
      ),
    ).toBe("라리가 Alavés 1-2 아틀레티코 마드리드, 원정팀이 이겼다.");
  });

  it("기본은 영문 그대로(ENGLISH_NAMES)", () => {
    expect(ENGLISH_NAMES.team("Bayern")).toBe("Bayern");
    expect(ENGLISH_NAMES.person("Harry Kane")).toBe("Harry Kane");
  });
});
