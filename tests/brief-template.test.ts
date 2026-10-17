/**
 * 브리핑 코드 템플릿 문장(scripts/lib/brief-template.ts) — M1-19 생성기 + **M1-21 문형 교체(D45 ④)**: 결정적·ai:false·refs, LLM 줄과
 * 같은 자연 뉴스 문장(주어 팀 점수 먼저 — D30 갱신), 이름 뒤 조사는 받침 기준(josa.ts), 입력에서 계산되는 서술만(결승골·동점골·
 * 해트트릭·역전승·완파·연장·승부차기 — 승부차기 동점을 '비겼다'로 쓰지 않음), 순위 줄(공동 순위·변동 서술 없음), 길이(조사를 붙인
 * 뒤 60자 목표·80자 상한·절단 없음), 브리핑 단위 대회 표기, football-data만으로 5줄(M1-47 이월). 네트워크·LLM 없음.
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
  briefCompLabel,
  chooseBriefCompForm,
  ENGLISH_NAMES,
  namesKoResolver,
  templateBriefLines,
  templateLineForRefs,
  templateMatchLine,
  templateStandingsLine,
  type BriefTemplateContext,
} from "../scripts/lib/brief-template";
import { finalSound } from "../scripts/lib/josa";
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
const KO_NAMES = namesKoResolver(
  NamesKoFileSchema.parse(readJson("configs/names.ko.json")),
);
const KO: BriefTemplateContext = {
  competitions: COMPETITIONS,
  names: KO_NAMES,
};

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

describe("경기 줄 — 주어 팀 점수 먼저(D45 ④, 득점 데이터 없음)", () => {
  it("홈 승리 '{승자}가 [대회 홈경기에서] {패자}를 w-l로 꺾었다' · ai:false · refs = 경기 id · 마침표", () => {
    const line = templateMatchLine(match(), CTX)!;
    expect(line).toEqual({
      text: "Arsenal이 프리미어리그 홈경기에서 Chelsea를 2-1로 꺾었다.",
      ai: false,
      refs: ["m1"],
    });
    expect(BriefLineSchema.safeParse(line).success).toBe(true);
  });

  it("원정 승리는 '원정에서' + 이긴 팀 점수 먼저(0-2 → 2-0)", () => {
    expect(textOf(match({ ft: "0-2" }))).toBe(
      "Chelsea가 프리미어리그 원정에서 Arsenal을 2-0으로 꺾었다.",
    );
    expect(textOf(match({ ft: "1-3" }), KO)).toBe(
      "첼시가 프리미어리그 원정에서 아스널을 3-1로 꺾었다.",
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

  it("3골 차 이상은 '완파했다'(점수 차로 계산)", () => {
    expect(textOf(match({ ft: "5-1" }))).toBe(
      "Arsenal이 프리미어리그 홈경기에서 Chelsea를 5-1로 완파했다.",
    );
    expect(textOf(match({ ft: "0-3" }), KO)).toBe(
      "첼시가 프리미어리그 원정에서 아스널을 3-0으로 완파했다.",
    );
  });

  it("전반에 뒤졌다 이기면 역전승(전반 스코어로 확인) — 전반 동점·앞섬은 역전승이 아니다", () => {
    expect(textOf(match({ ht: "0-1" }), KO)).toBe(
      "아스널이 프리미어리그 홈경기에서 첼시에 2-1 역전승을 거뒀다.",
    );
    expect(textOf(match({ ft: "1-4", ht: "1-0" }), KO)).toBe(
      "첼시가 프리미어리그 원정에서 아스널에 4-1 역전승을 거뒀다.",
    );
    expect(textOf(match({ ht: "1-1" }))).toContain("2-1로 꺾었다.");
    expect(textOf(match({ ht: "1-0" }))).toContain("2-1로 꺾었다.");
  });

  it("무승부 '{홈}과 {원정}이 [대회에서] h-a로 비겼다' — 0-0도 점수를 쓴다", () => {
    expect(textOf(match({ ft: "0-0" }), KO)).toBe(
      "아스널과 첼시가 프리미어리그에서 0-0으로 비겼다.",
    );
    expect(textOf(match({ ft: "2-2" }))).toBe(
      "Arsenal과 Chelsea가 프리미어리그에서 2-2로 비겼다.",
    );
  });

  it("연장 '연장 끝에' · 승부차기 '…와 연장까지 1-1로 맞선 뒤 승부차기에서 w-l로 이겼다'(승부차기 점수도 이긴 팀 먼저, '비겼다' 아님)", () => {
    expect(textOf(match({ ft: "1-2", aet: true, regular: "1-1" }), KO)).toBe(
      "첼시가 프리미어리그 원정에서 연장 끝에 아스널을 2-1로 꺾었다.",
    );
    const pens = textOf(
      match({ ft: "1-1", aet: true, regular: "1-1", pens: "4-3" }),
      KO,
    );
    expect(pens).toBe(
      "아스널이 프리미어리그 홈경기에서 첼시와 연장까지 1-1로 맞선 뒤 승부차기에서 4-3으로 이겼다.",
    );
    expect(pens).not.toContain("비겼");
    expect(
      textOf(match({ ft: "0-0", aet: true, pens: "2-4", goals: [] }), KO),
    ).toBe(
      "첼시가 프리미어리그 원정에서 아스널과 연장까지 0-0으로 맞선 뒤 승부차기에서 4-2로 이겼다.",
    );
    expect(textOf(match({ ft: "1-1", aet: true }), KO)).toBe(
      "아스널과 첼시가 프리미어리그에서 연장 끝에 1-1로 비겼다.",
    );
  });

  it("승부차기 승자는 늘 승부차기 결과 — 그 경기 점수가 동점이 아니면(두 경기 합산 동점 뒤) 경기 점수를 이긴 것처럼 쓰지 않는다", () => {
    // 홈이 1-0으로 이겼지만 승부차기는 원정 승리 — '아스널이 … 1-0으로 이겼다'·'첼시가 … 1-0으로 꺾었다'가 아니다
    const leg = match({ ft: "1-0", aet: true, regular: "1-0", pens: "3-4" });
    expect(textOf(leg, KO)).toBe(
      "아스널과 첼시의 프리미어리그 경기는 연장까지 1-0으로 끝났고 승부차기에서 첼시가 4-3으로 이겼다.",
    );
    expect(textOf(leg, KO)).not.toMatch(/합계|꺾었다|비겼/);
    // 승부차기만 있고 연장 표시가 없으면 '연장까지'를 쓰지 않는다 · 승부차기 점수가 동점이면(입력 이상) 줄 없음
    expect(textOf(match({ ft: "0-2", pens: "5-4" }), KO)).toBe(
      "아스널과 첼시의 프리미어리그 경기는 0-2로 끝났고 승부차기에서 아스널이 5-4로 이겼다.",
    );
    expect(textOf(match({ ft: "1-1", pens: "4-3" }), KO)).toBe(
      "아스널이 프리미어리그 홈경기에서 첼시와 1-1로 맞선 뒤 승부차기에서 4-3으로 이겼다.",
    );
    expect(
      templateMatchLine(match({ ft: "1-1", aet: true, pens: "3-3" }), KO),
    ).toBeNull();
  });

  it("연장 승리 — 90분에 이미 앞섰거나 90분 점수가 없으면 '연장 끝에'를 쓰지 않는다(연장을 치른 사실만)", () => {
    // 90분 2-0(두 경기 합산 동점이라 연장) → 최종 2-1: 연장에서 승부가 난 것이 아니다
    expect(textOf(match({ ft: "2-1", aet: true, regular: "2-0" }), KO)).toBe(
      "아스널이 프리미어리그 홈경기에서 연장전까지 치러 첼시를 2-1로 꺾었다.",
    );
    expect(textOf(match({ ft: "2-1", aet: true }), KO)).toBe(
      "아스널이 프리미어리그 홈경기에서 연장전까지 치러 첼시를 2-1로 꺾었다.",
    );
    // 90분 동점·뒤짐 → 연장에서 이겼다
    expect(
      textOf(match({ ft: "2-1", aet: true, regular: "1-1" }), KO),
    ).toContain("연장 끝에 첼시를 2-1로 꺾었다.");
    expect(
      textOf(match({ ft: "3-2", aet: true, regular: "1-2" }), KO),
    ).toContain("연장 끝에 첼시를 3-2로 꺾었다.");
  });

  it("중립 경기장 결승(round FINAL)은 장소 대신 '결승에서'", () => {
    const final = match({
      comp: "UEFA Champions League",
      round: "FINAL",
      ft: "1-1",
      aet: true,
      pens: "3-4",
    });
    expect(textOf(final, KO)).toBe(
      "첼시가 UEFA 챔피언스리그 결승에서 아스널과 연장까지 1-1로 맞선 뒤 승부차기에서 4-3으로 이겼다.",
    );
    expect(
      textOf({ ...final, ft: "2-0", aet: undefined, pens: undefined }, KO),
    ).toBe("아스널이 UEFA 챔피언스리그 결승에서 첼시를 2-0으로 꺾었다.");
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
    expect(textOf(m, KO)).toBe(
      "레버쿠젠이 분데스리가 원정에서 무사 디아비의 65분 결승골로 마인츠를 4-3으로 꺾었다.",
    );
  });

  it("득점 순서로 뒤진 적이 확인되면 결승골 + 역전승(Arsenal 2-1 Leeds — 전반 0-0)", () => {
    const m = match({
      away: "Leeds United",
      ht: "0-0",
      goals: [
        goal("55", "Leeds United", "James Justin"),
        goal("62", "Arsenal", "Riccardo Calafiori"),
        goal("70", "Arsenal", "Bukayo Saka"),
      ],
    });
    expect(textOf(m, KO)).toBe(
      "아스널이 프리미어리그 홈경기에서 부카요 사카의 70분 결승골로 리즈 유나이티드에 2-1 역전승을 거뒀다.",
    );
  });

  it("PK 결승골·자책골 결승골(득점자 서술 없음)·득점 순서는 분으로 정렬(45+6 < 46)", () => {
    const pk = match({
      ft: "1-0",
      goals: [goal("45+6", "Arsenal", "Saka", "penalty")],
    });
    // 분까지 넣으면 61자 — 60자 목표 안의 득점자 문장
    expect(textOf(pk)).toBe(
      "Arsenal이 프리미어리그 홈경기에서 Saka의 PK 결승골로 Chelsea를 1-0으로 꺾었다.",
    );
    expect(textOf(pk, KO)).toBe(
      "아스널이 프리미어리그 홈경기에서 Saka의 45+6분 PK 결승골로 첼시를 1-0으로 꺾었다.",
    );
    const own = match({
      ft: "1-0",
      goals: [goal("30", "Arsenal", "Reece James", "own_goal")],
    });
    expect(textOf(own)).toBe(
      "Arsenal이 프리미어리그 홈경기에서 Chelsea를 1-0으로 꺾었다.",
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

  it("해트트릭(이긴 팀 같은 선수 3골) '해트트릭을 앞세워' · 4골 이상은 'n골을 앞세워' — 3골 차 이상이어도 해트트릭을 쓴다", () => {
    const hat = match({
      comp: "Bundesliga",
      home: "RB Leipzig",
      away: "Frankfurt",
      ft: "6-0",
      goals: [
        goal("1", "RB Leipzig", "Banzuzi"),
        goal("5", "RB Leipzig", "Nkunku"),
        goal("41", "RB Leipzig", "Nkunku"),
        goal("44", "RB Leipzig", "Nkunku"),
        goal("54", "RB Leipzig", "Nusa"),
        goal("89", "RB Leipzig", "Gomis"),
      ],
    });
    expect(textOf(hat, KO)).toBe(
      "라이프치히가 분데스리가 홈경기에서 Nkunku의 해트트릭을 앞세워 프랑크푸르트를 6-0으로 완파했다.",
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
    expect(textOf(four)).toBe(
      "Arsenal이 프리미어리그 홈경기에서 Saka의 4골을 앞세워 Chelsea를 4-1로 완파했다.",
    );
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
      "Arsenal이 프리미어리그 홈경기에서 D의 7분 결승골로 Chelsea에 4-3 역전승을 거뒀다.",
    );
  });

  it("3골 차 이상 승리는 결승골 대신 '완파'", () => {
    const m = match({
      ft: "3-0",
      goals: [
        goal("10", "Arsenal", "A"),
        goal("20", "Arsenal", "B"),
        goal("30", "Arsenal", "C"),
      ],
    });
    expect(textOf(m)).toBe(
      "Arsenal이 프리미어리그 홈경기에서 Chelsea를 3-0으로 완파했다.",
    );
  });

  it("무승부 — 마지막 골(동점골)을 넣은 팀이 주어 '{동점 팀}이 … {선수}의 n분 동점골로 {상대}와 비겼다', 자책골이면 득점자 없이", () => {
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
    expect(textOf(late, KO)).toBe(
      "브레멘이 분데스리가 원정에서 Füllkrug의 90+2분 동점골로 도르트문트와 2-2로 비겼다.",
    );
    const own = match({
      ft: "1-1",
      goals: [
        goal("10", "Arsenal", "Saka"),
        goal("20", "Chelsea", "Saliba", "own_goal"),
      ],
    });
    expect(textOf(own)).toBe(
      "Arsenal과 Chelsea가 프리미어리그에서 1-1로 비겼다.",
    );
    expect(textOf(match({ ft: "0-0", goals: [] }))).toBe(
      "Arsenal과 Chelsea가 프리미어리그에서 0-0으로 비겼다.",
    );
  });

  it("득점 목록이 점수와 맞지 않거나 팀·분 형식이 다르면 득점자를 쓰지 않는다(확인할 수 없는 사실 금지)", () => {
    const base = "Arsenal이 프리미어리그 홈경기에서 Chelsea를 2-1로 꺾었다.";
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
    ).toBe(
      "Arsenal이 프리미어리그 홈경기에서 연장전까지 치러 Chelsea를 2-1로 꺾었다.",
    );
  });

  it("점수 형식이 틀린 입력은 줄을 만들지 않는다", () => {
    expect(templateMatchLine(match({ ft: "2:1" }), CTX)).toBeNull();
    expect(templateMatchLine(match({ pens: "x" }), CTX)).toBeNull();
  });
});

describe("길이 — 조사를 붙인 뒤 60자 목표 안의 가장 자세한 변형, 80자 상한(D40 ⑤)", () => {
  /** 길이 조절용 이름(소문자 — 받침 없음으로 읽혀 '가'·'를'이 붙는다) */
  const long = (n: number) => "x".repeat(n);
  const scorer = (name: string) =>
    match({
      ft: "1-0",
      goals: [goal("88", "Arsenal", name)],
    });

  it("목표를 넘으면 분 → 득점자 → 대회 순으로 줄인다(대회 표기는 줄 함수 기본 nameKo)", () => {
    expect(textOf(scorer("Saka"))).toBe(
      "Arsenal이 프리미어리그 홈경기에서 Saka의 88분 결승골로 Chelsea를 1-0으로 꺾었다.",
    );
    expect(textOf(scorer("Saka")).length).toBeLessThanOrEqual(
      BRIEF_TEMPLATE_TARGET,
    );
    // 분을 빼야 60자 안
    expect(textOf(scorer(long(10)))).toBe(
      `Arsenal이 프리미어리그 홈경기에서 ${long(10)}의 결승골로 Chelsea를 1-0으로 꺾었다.`,
    );
    // 득점자 서술을 빼야 60자 안
    expect(textOf(scorer(long(14)))).toBe(
      "Arsenal이 프리미어리그 홈경기에서 Chelsea를 1-0으로 꺾었다.",
    );
    // 대회를 빼야 60자 안(긴 팀 이름)
    expect(textOf(match({ home: long(20), away: long(16) }))).toBe(
      `${long(20)}가 ${long(16)}를 2-1로 꺾었다.`,
    );
  });

  it("60자 안의 문장이 없으면 80자 안의 첫 문장, 그것도 넘으면 줄 없음(문장 절단 안 함)", () => {
    const wide = (n: number) => match({ home: long(n), away: long(n) });
    const at70 = textOf(wide(26));
    expect(at70).toBe(
      `${long(26)}가 프리미어리그 홈경기에서 ${long(26)}를 2-1로 꺾었다.`,
    );
    expect(at70.length).toBeGreaterThan(BRIEF_TEMPLATE_TARGET);
    expect(at70.length).toBeLessThanOrEqual(BRIEF_LINE_MAX);
    expect(textOf(wide(33))).toBe(`${long(33)}가 ${long(33)}를 2-1로 꺾었다.`); // 대회 없이 79자
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

  it("'{1위}가 승점 n으로 [대회] 선두, {2위}가 승점 m으로 2위다' — 60자 안이면 3순위까지, 변동 서술 없음(D40 ③)", () => {
    const line = templateStandingsLine(
      table([
        [1, "A", 7],
        [2, "B", 6],
        [3, "C", 5],
        [4, "D", 4],
      ]),
      CTX,
    )!;
    expect(line).toEqual({
      text: "A가 승점 7로 프리미어리그 선두, B가 승점 6으로 2위, C가 승점 5로 3위다.",
      ai: false,
      refs: ["sPL"],
    });
    // 세 순위가 60자를 넘으면 두 순위(2026-10-11 실제 순위 — 3순위 문장은 62자)
    expect(
      templateStandingsLine(
        table([
          [1, "Man City", 15],
          [2, "Arsenal", 15],
          [3, "Brentford", 13],
          [4, "Chelsea", 10],
        ]),
        KO,
      )!.text,
    ).toBe(
      "맨체스터 시티가 승점 15로 프리미어리그 선두, 아스널이 승점 15로 2위다.",
    );
  });

  it("공동 순위는 한 묶음(응답 순서, 승점이 같을 때만) — '공동 선두'·'공동 n위', 첫 순위 공동이 3팀을 넘거나 팀이 하나뿐이면 줄 없음", () => {
    expect(
      templateStandingsLine(
        table([
          [1, "A", 7],
          [1, "B", 7],
          [3, "C", 6],
        ]),
        CTX,
      )!.text,
    ).toBe("A와 B가 승점 7로 프리미어리그 공동 선두, C가 승점 6으로 3위다.");
    expect(
      templateStandingsLine(
        table([
          [1, "A", 9],
          [2, "B", 7],
          [2, "C", 7],
          [2, "D", 7],
        ]),
        CTX,
      )!.text,
    ).toBe("A가 승점 9로 프리미어리그 선두, B·C·D가 승점 7로 공동 2위다.");
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
    // 같은 순위인데 승점이 다르면(응답 이상) 그 묶음부터 쓰지 않는다 — 남은 팀이 하나뿐이라 줄 없음
    expect(
      templateStandingsLine(
        table([
          [1, "A", 9],
          [2, "B", 7],
          [2, "C", 6],
        ]),
        CTX,
      ),
    ).toBeNull();
  });

  it("어느 순위 줄에도 변동 서술(올랐·내려·상승·하락·유지·지켰)이 없다", () => {
    for (const input of [...M0_INPUTS, FD_ONLY_INPUT]) {
      for (const s of input.standings) {
        const line = templateStandingsLine(s, KO);
        if (line)
          expect(line.text).not.toMatch(/올랐|내려|상승|하락|유지|지켰/);
      }
    }
  });
});

describe("브리핑 구성 — templateBriefLines", () => {
  it("football-data만으로(득점자 없음) 경기 4줄 + 순위 1줄(M1-47 이월) — 모든 줄 스키마 통과·ai:false·60자 이내", () => {
    const lines = templateBriefLines(FD_ONLY_INPUT, KO);
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
    const form = chooseBriefCompForm(FD_ONLY_INPUT, KO);
    expect(
      templateLineForRefs(FD_ONLY_INPUT, ["sPL", second!.id, first!.id], KO),
    ).toEqual(templateMatchLine(second!, { ...KO, compForm: form }));
    expect(
      templateLineForRefs(FD_ONLY_INPUT, ["k927", "sPL"], KO)?.refs,
    ).toEqual(["sPL"]);
    expect(templateLineForRefs(FD_ONLY_INPUT, ["m0", "x1"], KO)).toBeNull();
  });
});

describe("대회 표기 — 브리핑 단위로 하나(D30·D45 ④)", () => {
  const long = (n: number) => "x".repeat(n);

  it("기본은 nameKo, nameKo로는 대회를 잃는 줄이 더 많을 때만 shortKo — 한 브리핑에 두 표기가 섞이지 않는다", () => {
    const short = {
      matches: [match({ id: "m1" }), match({ id: "m2", home: "Liverpool" })],
      standings: [],
    };
    expect(chooseBriefCompForm(short, CTX)).toBe("nameKo");
    // 프리미어리그(6자)로는 60자를 넘고 EPL(3자)로는 들어가는 줄
    const tight = {
      matches: [
        match({ id: "m1", home: long(19), away: long(17) }),
        match({ id: "m2" }),
      ],
      standings: [],
    };
    expect(chooseBriefCompForm(tight, CTX)).toBe("shortKo");
    const lines = templateBriefLines(tight, CTX);
    expect(lines.every((l) => l.text.includes("EPL"))).toBe(true);
    expect(lines.some((l) => l.text.includes("프리미어리그"))).toBe(false);
    // 주어진 표기를 그대로 쓴다
    expect(chooseBriefCompForm(tight, { ...CTX, compForm: "nameKo" })).toBe(
      "nameKo",
    );
  });

  it("briefCompLabel — 설정 nameEn·코드 별칭(M0 입력의 'Champions League') → 표기, 모르면 입력 그대로", () => {
    expect(briefCompLabel("Premier League", CTX)).toBe("프리미어리그");
    expect(briefCompLabel("Premier League", CTX, "shortKo")).toBe("EPL");
    expect(briefCompLabel("Champions League", CTX)).toBe("UEFA 챔피언스리그");
    expect(briefCompLabel("Eredivisie", CTX)).toBe("Eredivisie");
  });

  it("실제 입력 전체에서 한 브리핑의 줄은 nameKo 또는 shortKo 중 하나만 쓴다", () => {
    for (const input of [...M0_INPUTS, FD_ONLY_INPUT]) {
      const text = templateBriefLines(input, KO)
        .map((l) => l.text)
        .join("\n");
      const used = new Set<string>();
      for (const c of COMPETITIONS) {
        if (c.nameKo === c.shortKo) continue;
        if (text.includes(c.nameKo)) used.add("nameKo");
        if (!c.nameKo.includes(c.shortKo) && text.includes(c.shortKo)) {
          used.add("shortKo");
        }
      }
      expect(used.size, text).toBeLessThanOrEqual(1);
    }
  });
});

describe("입력에 없는 사실·조사 — 실제 입력 전체(M0-30·M0-34 6일치 + 2026-10-10 football-data)", () => {
  it("이름 바로 뒤 조사는 받침에 맞다(이/가·을/를·과/와) — 숫자 뒤 으로/로도(ㄹ 받침은 로)", () => {
    let checked = 0;
    const pairs: Record<string, [string, string]> = {
      이: ["이", "가"],
      가: ["이", "가"],
      을: ["을", "를"],
      를: ["을", "를"],
      과: ["과", "와"],
      와: ["과", "와"],
    };
    const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    for (const input of [...M0_INPUTS, FD_ONLY_INPUT]) {
      const names = new Set<string>();
      for (const m of input.matches) {
        names.add(KO_NAMES.team(m.home));
        names.add(KO_NAMES.team(m.away));
      }
      for (const s of input.standings) {
        for (const r of s.rows) names.add(KO_NAMES.team(r.team));
      }
      // 긴 이름 먼저('바이에른 뮌헨'이 '뮌헨'보다)
      const sorted = [...names].sort((a, b) => b.length - a.length);
      const re = new RegExp(
        `(${sorted.map(escape).join("|")})([이가을를과와])(?![가-힣])`,
        "gu",
      );
      for (const line of templateBriefLines(input, KO)) {
        for (const m of line.text.matchAll(re)) {
          const [, name, particle] = m;
          checked += 1;
          const [consonant, vowel] = pairs[particle!]!;
          const expected = finalSound(name!) === "none" ? vowel : consonant;
          expect(particle, `${line.text} — ${name}`).toBe(expected);
        }
        for (const m of line.text.matchAll(/(\d+(?:-\d+)?)(으로|로) /g)) {
          const ro = ["none", "rieul"].includes(finalSound(m[1]!));
          expect(m[2], line.text).toBe(ro ? "로" : "으로");
        }
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it("주어 팀 점수 먼저 — 경기 줄의 점수는 주어(이긴 팀·동점 팀) 점수가 앞, 이긴 팀이 문장 첫머리", () => {
    for (const input of [...M0_INPUTS, FD_ONLY_INPUT]) {
      for (const line of templateBriefLines(input, KO)) {
        const m = input.matches.find((x) => x.id === line.refs[0]);
        if (!m) continue;
        const [h, a] = m.ft.split("-").map(Number);
        const score = /(\d+)-(\d+)/.exec(line.text)!;
        expect(Number(score[1]) >= Number(score[2]), line.text).toBe(true);
        if (h !== a) {
          const winner = KO_NAMES.team(h! > a! ? m.home : m.away);
          expect(line.text.startsWith(winner), line.text).toBe(true);
        }
      }
    }
  });

  it("줄의 숫자는 모두 입력에서 나온다(점수·득점 분·순위·승점, 이름 속 숫자)", () => {
    for (const input of [...M0_INPUTS, FD_ONLY_INPUT]) {
      const lines = templateBriefLines(input, KO);
      for (const line of lines) {
        const allowed = new Set<string>();
        const add = (text: string | undefined) => {
          for (const n of (text ?? "").match(/\d+/g) ?? []) allowed.add(n);
        };
        for (const ref of line.refs) {
          const m = input.matches.find((x) => x.id === ref);
          if (m) {
            [m.ft, m.ht, m.pens, m.regular, m.home, m.away].forEach(add);
            [m.home, m.away].map((t) => KO_NAMES.team(t)).forEach(add);
            for (const g of m.goals ?? []) {
              [g.min, g.player, KO_NAMES.person(g.player)].forEach(add);
            }
          }
          const s = input.standings.find((x) => x.id === ref);
          if (s) {
            for (const r of s.rows) {
              [
                String(r.pos),
                String(r.pts),
                r.team,
                KO_NAMES.team(r.team),
              ].forEach(add);
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

describe("고유명사 — names.ko.json 색인(M1-21)", () => {
  it("등록된 영문 표기(대표·별칭, 대소문자·악센트 무시)는 한글, 미등록은 영문 그대로", () => {
    expect(KO_NAMES.team("Atleti")).toBe("아틀레티코 마드리드");
    expect(KO_NAMES.team("union berlin")).toBe("우니온 베를린");
    expect(KO_NAMES.team("Bayern")).toBe("바이에른 뮌헨");
    expect(KO_NAMES.team("Leverkusen")).toBe("레버쿠젠");
    expect(KO_NAMES.team("Sabah FK")).toBe("Sabah FK");
    expect(KO_NAMES.person("Kang-in Lee")).toBe("이강인");
    expect(KO_NAMES.person("Atleti")).toBe("Atleti"); // 팀 표기는 사람 이름으로 바꾸지 않는다
    expect(
      textOf(
        match({ comp: "LaLiga", home: "Alavés", away: "Atleti", ft: "1-2" }),
        KO,
      ),
    ).toBe("아틀레티코 마드리드가 라리가 원정에서 알라베스를 2-1로 꺾었다.");
  });

  it("기본은 영문 그대로(ENGLISH_NAMES)", () => {
    expect(ENGLISH_NAMES.team("Bayern")).toBe("Bayern");
    expect(ENGLISH_NAMES.person("Harry Kane")).toBe("Harry Kane");
  });
});
