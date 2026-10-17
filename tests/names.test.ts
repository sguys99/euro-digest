/**
 * M1-21 고유명사 치환(scripts/lib/names.ts — PRD FR-24, D39 ②): 접기(대소문자·악센트, 길이 보존), 긴 이름 먼저·단어 경계·별칭, 치환
 * 뒤 조사 보정(M0-30 실제 출력 'Bayern가'·'Dortmund은'·'Dortmund과'), 대회 표기(브리핑 단위), 미등록 이름 후보, 브리핑 입력 정리
 * (득점자 → 사전 대표 표기), M1-23 영문 토큰 허용 목록. 네트워크·LLM 없음.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  NamesKoFileSchema,
  type CompId,
} from "@/lib/schema";

import type { BriefInput, BriefInputMatch } from "../scripts/lib/brief-input";
import {
  briefInputNames,
  briefNameAllowlist,
  buildNameIndex,
  canonicalizeBriefInput,
  foldName,
  isKnownName,
  koreanName,
  koreanNameBySlug,
  latinSpans,
  lookupName,
  substituteNames,
  unknownBriefInputNames,
  unknownNamesInText,
} from "../scripts/lib/names";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

const COMPETITIONS = CompetitionsFileSchema.parse(
  readJson("configs/competitions.json"),
);
const NAMES = NamesKoFileSchema.parse(readJson("configs/names.ko.json"));
const INDEX = buildNameIndex(NAMES, COMPETITIONS);
const nameKo = (comp: CompId) =>
  COMPETITIONS.find((c) => c.id === comp)!.nameKo;
const sub = (text: string) =>
  substituteNames(text, INDEX, { competitionLabel: nameKo }).text;

/** 작은 사전(사전 내용 변경과 무관한 동작 검사용) */
const SMALL = buildNameIndex(
  {
    entries: [
      {
        ko: "보루시아 도르트문트 2군",
        en: ["Borussia Dortmund II"],
        kind: "team",
        slug: "dortmund-ii",
      },
      { ko: "도르트문트", en: ["Dortmund", "BVB"], kind: "team", slug: "bvb" },
      { ko: "아스널", en: ["Arsenal"], kind: "team", slug: "arsenal" },
      { ko: "해리 케인", en: ["Harry Kane", "H. Kane"], kind: "player" },
      { ko: "아틀레티코 마드리드", en: ["Atlético Madrid"], kind: "team" },
    ],
    ignore: ["Matchday"],
  },
  COMPETITIONS,
);

describe("foldName — 접기", () => {
  it("대소문자·발음 기호·따옴표·대시를 무시하고 길이를 바꾸지 않는다", () => {
    expect(foldName("Atlético Madrid")).toBe("atletico madrid");
    expect(foldName("ATLETICO MADRID")).toBe("atletico madrid");
    expect(foldName("M’gladbach")).toBe("m'gladbach");
    expect(foldName("Saint–Germain")).toBe("saint-germain");
    expect(foldName("Mönchengladbach").length).toBe("Mönchengladbach".length);
    // 분해되지 않는 글자(ø)·한글은 그대로(소문자만)
    expect(foldName("Bodø/Glimt")).toBe("bodø/glimt");
    expect(foldName("김민재가")).toBe("김민재가");
  });
});

describe("substituteNames — 치환", () => {
  it("긴 이름 먼저·단어 경계(앞뒤가 라틴 글자·숫자가 아님 — 한글 조사는 붙어도 된다)", () => {
    const r = substituteNames(
      "Borussia Dortmund II와 Dortmund가 BVB전에서 만났다. Arsenals·XArsenal은 그대로.",
      SMALL,
    );
    expect(r.text).toBe(
      "보루시아 도르트문트 2군과 도르트문트가 도르트문트전에서 만났다. Arsenals·XArsenal은 그대로.",
    );
    expect(r.replaced.map((x) => x.from)).toEqual([
      "Borussia Dortmund II",
      "Dortmund",
      "BVB",
    ]);
  });

  it("대소문자·악센트가 달라도 같은 표기로 맞춘다(결과는 NFC)", () => {
    expect(substituteNames("ATLETICO MADRID가 이겼다", SMALL).text).toBe(
      "아틀레티코 마드리드가 이겼다",
    );
    expect(
      substituteNames("Atletico Madrid는", SMALL).text.normalize("NFC"),
    ).toBe("아틀레티코 마드리드는");
  });

  it("치환 뒤 붙은 조사를 한글 이름의 받침으로 고친다(M0-30 'Bayern가'·'Dortmund은'·'Dortmund과')", () => {
    expect(sub("Bayern가 Union Berlin을 7-0으로 대파했다.")).toBe(
      "바이에른 뮌헨이 우니온 베를린을 7-0으로 대파했다.",
    );
    expect(sub("Dortmund은 승점 13으로 Bundesliga 1위다.")).toBe(
      "도르트문트는 승점 13으로 분데스리가 1위다.",
    );
    expect(sub("Dortmund과 Bremen의 경기")).toBe("도르트문트와 브레멘의 경기");
    const r = substituteNames("Bayern가 Brentford을 꺾었다", INDEX);
    expect(r.particleFixes).toBe(2);
    expect(r.text).toBe("바이에른 뮌헨이 브렌트포드를 꺾었다");
  });

  it("D39 ② — football-data 짧은 이름(Bayern·Man City·Barça·HSV·M'gladbach)도 KFA 기준 표기로", () => {
    expect(koreanName(INDEX, "Bayern")).toBe("바이에른 뮌헨");
    expect(koreanName(INDEX, "Brentford")).toBe("브렌트포드");
    expect(koreanName(INDEX, "Man City")).toBe("맨체스터 시티");
    expect(koreanName(INDEX, "Barça")).toBe("바르셀로나");
    expect(koreanName(INDEX, "barca")).toBe("바르셀로나");
    expect(koreanName(INDEX, "HSV")).toBe("함부르크");
    expect(koreanName(INDEX, "M'gladbach")).toBe("묀헨글라트바흐");
    expect(koreanName(INDEX, "Atleti")).toBe("아틀레티코 마드리드");
  });

  it("대회 이름은 브리핑 단위 표기로만 바꾼다 — 표기를 주지 않으면 그대로", () => {
    expect(substituteNames("Arsenal이 Premier League 선두다", SMALL).text).toBe(
      "아스널이 Premier League 선두다",
    );
    expect(
      substituteNames("Champions League에서 Arsenal이", SMALL, {
        competitionLabel: (c) => COMPETITIONS.find((x) => x.id === c)!.shortKo,
      }).text,
    ).toBe("UCL에서 아스널이");
  });

  it("M0-30·M0-34 실제 출력(fixtures/llm/mock) — 등록 이름은 모두 한글, 축약 성(Olise)은 남는다", () => {
    expect(
      sub(
        "Atleti가 Alavés 원정에서 1-2로 이겼고 Kang-in Lee는 후반 57분 교체 투입돼 33분을 뛰었다.",
      ),
    ).toBe(
      "아틀레티코 마드리드가 알라베스 원정에서 1-2로 이겼고 이강인은 후반 57분 교체 투입돼 33분을 뛰었다.",
    );
    expect(sub("Liverpool이 Bournemouth 원정에서 0-1로 이겼다.")).toBe(
      "리버풀이 본머스 원정에서 0-1로 이겼다.",
    );
    expect(sub("Fulham과 Man United는 1-1로 비겼다.")).toBe(
      "풀럼과 맨체스터 유나이티드는 1-1로 비겼다.",
    );
    expect(
      sub(
        "Kim Min-jae는 Bayern의 Union Berlin전에서 교체 투입돼 45분을 뛰었다.",
      ),
    ).toBe(
      "김민재는 바이에른 뮌헨의 우니온 베를린전에서 교체 투입돼 45분을 뛰었다.",
    );
    expect(sub("Olise가 43분, 73분, 76분에 득점해 해트트릭을 기록했다.")).toBe(
      "Olise가 43분, 73분, 76분에 득점해 해트트릭을 기록했다.",
    );
    expect(sub("Monaco는 승점 13으로 Ligue 1 1위다.")).toBe(
      "모나코는 승점 13으로 리그 1 1위다.",
    );
  });

  it("사전이 비면 원문 그대로(NFC)", () => {
    const empty = buildNameIndex(null);
    expect(substituteNames("Bayern가", empty)).toEqual({
      text: "Bayern가",
      replaced: [],
      particleFixes: 0,
    });
  });
});

describe("조회 — lookupName·koreanNameBySlug·isKnownName", () => {
  it("정확히 같은 표기만(부분 일치 없음), 유형을 주면 그 유형만", () => {
    expect(lookupName(SMALL, "Harry Kane")?.ko).toBe("해리 케인");
    expect(lookupName(SMALL, "Kane")).toBeNull();
    expect(lookupName(SMALL, "Arsenal", ["player"])).toBeNull();
    expect(koreanNameBySlug(INDEX, "player", "kim-min-jae")).toBe("김민재");
    expect(koreanNameBySlug(INDEX, "team", "nope")).toBeNull();
  });

  it("사전·무시 목록·대회 별칭에 있으면 등록된 이름", () => {
    expect(isKnownName(SMALL, "arsenal")).toBe(true);
    expect(isKnownName(SMALL, "Matchday")).toBe(true);
    expect(isKnownName(SMALL, "Champions League")).toBe(true);
    expect(isKnownName(SMALL, "Sabah FK")).toBe(false);
  });
});

describe("미등록 이름 후보 — unknownNamesInText", () => {
  it("치환 뒤 남은 라틴 덩어리 중 이름처럼 보이는 것만 — 일반 약어·라운드 표기·대회·한 글자·소문자 덩어리는 뺀다", () => {
    const text =
      "Olise가 PK 결승골로 Sabah FK를 꺾었다. 세리에 A·UCL Matchday 5 경기에서 xG는 높았고 Champions League 결승골.";
    expect(latinSpans(text)).toContain("Sabah FK");
    expect(unknownNamesInText(text, SMALL)).toEqual(["Olise", "Sabah FK"]);
    // 영어 문장 속 이름만(소문자 일반어·서수로 끊는다), 이름 속 소문자 낱말(van)은 둔다, 대회 표기의 'UEFA'는 이름이 아니다
    expect(
      unknownNamesInText(
        "바이에른 뮌헨 beat, and Olise scored three goals in the 43rd minute. Virgil van Dijk와 Kevin De Bruyne.",
        SMALL,
      ),
    ).toEqual(["Olise", "Virgil van Dijk", "Kevin De Bruyne"]);
    expect(
      unknownNamesInText("UEFA 챔피언스리그 리그 페이즈 1라운드 순위", SMALL),
    ).toEqual([]);
  });
});

describe("브리핑 입력 — 득점자 대표 표기·데이터 API 이름·허용 목록", () => {
  const match = (over: Partial<BriefInputMatch> = {}): BriefInputMatch => ({
    id: "m1",
    comp: "Bundesliga",
    round: "Matchday 6",
    home: "Bayern",
    away: "Union Berlin",
    ft: "2-0",
    goals: [
      { min: "39", team: "Bayern", player: "H. Kane", type: "penalty" },
      {
        min: "70",
        team: "Bayern",
        player: "Kim Min-Jae",
        assist: "J. Musiala",
      },
    ],
    ...over,
  });
  const input: BriefInput = {
    briefDate: "2026-10-11",
    matches: [
      match(),
      match({
        id: "m2",
        home: "Sabah FK",
        away: "Arsenal",
        ft: "0-1",
        goals: [{ min: "5", team: "Arsenal", player: "Noni Madueke" }],
      }),
    ],
    standings: [
      {
        id: "sBL",
        comp: "Bundesliga",
        note: "current table, top 4 positions only",
        rows: [{ pos: 1, team: "Dortmund", played: 6, pts: 13, gd: 9 }],
      },
    ],
  };

  it("득점자·도움을 사전 대표 영문 표기(en[0])로 — 모델 축약 방지(M0-30), 미등록·팀 이름은 그대로, 키 순서 유지", () => {
    const out = canonicalizeBriefInput(input, INDEX);
    expect(out.replaced).toBe(3);
    expect(out.input.matches[0]!.goals).toEqual([
      { min: "39", team: "Bayern", player: "Harry Kane", type: "penalty" },
      {
        min: "70",
        team: "Bayern",
        player: "Min-jae Kim",
        assist: "Jamal Musiala",
      },
    ]);
    expect(Object.keys(out.input.matches[0]!.goals![1]!)).toEqual([
      "min",
      "team",
      "player",
      "assist",
    ]);
    expect(out.input.matches[0]!.home).toBe("Bayern");
    expect(out.input.matches[1]!.goals![0]!.player).toBe("Noni Madueke");
    // 원본은 바뀌지 않는다(순수 함수)
    expect(input.matches[0]!.goals![0]!.player).toBe("H. Kane");
    // goals null은 그대로
    expect(
      canonicalizeBriefInput(
        { ...input, matches: [match({ goals: null })] },
        INDEX,
      ).input.matches[0]!.goals,
    ).toBeNull();
  });

  it("데이터 API 이름(팀·득점자·도움) — 입력 순서, 중복 한 번, 미등록만 고르기", () => {
    expect(briefInputNames(input).map((n) => `${n.kind}:${n.name}`)).toEqual([
      "team:Bayern",
      "team:Union Berlin",
      "team:Sabah FK",
      "team:Arsenal",
      "team:Dortmund",
      "player:H. Kane",
      "player:Kim Min-Jae",
      "player:J. Musiala",
      "player:Noni Madueke",
    ]);
    expect(unknownBriefInputNames(input, INDEX)).toEqual([
      { name: "Sabah FK", kind: "team" },
      { name: "Noni Madueke", kind: "player" },
    ]);
  });

  it("영문 토큰 허용 목록(M1-23) — 입력 이름 + 그 사전 항목의 모든 영문 표기 + 입력 대회 별칭·라틴 shortKo", () => {
    const allow = briefNameAllowlist(input, INDEX, COMPETITIONS);
    for (const t of [
      "Bayern",
      "FC Bayern München",
      "Union Berlin",
      "Sabah FK",
      "Kim Min-Jae",
      "Min-jae Kim",
      "H. Kane",
      "Harry Kane",
      "Bundesliga",
    ]) {
      expect(allow.has(foldName(t)), t).toBe(true);
    }
    expect(allow.has(foldName("Premier League"))).toBe(false); // 입력에 없는 대회
    expect(allow.has(foldName("Kane"))).toBe(false); // 축약 성
    const ucl = briefNameAllowlist(
      { matches: [match({ comp: "UEFA Champions League" })], standings: [] },
      INDEX,
      COMPETITIONS,
    );
    expect(ucl.has("ucl")).toBe(true);
    expect(ucl.has(foldName("Champions League"))).toBe(true);
  });
});
