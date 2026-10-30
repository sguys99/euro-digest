/**
 * M1-21 고유명사 치환(scripts/lib/names.ts — PRD FR-24, D39 ②): 접기(대소문자·악센트, 길이 보존), 긴 이름 먼저·단어 경계·별칭, 치환
 * 뒤 조사 보정(M0-30 실제 출력 'Bayern가'·'Dortmund은'·'Dortmund과'), 대회 표기(브리핑 단위), 미등록 이름 후보, 브리핑 입력 정리
 * (득점자 → 사전 대표 표기, 사전에 없는 팀 짧은 이름 → 정식 이름 — D46 'Deportivo'), M1-23 영문 토큰 허용 목록. 네트워크·LLM 없음.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  type CompId,
} from "@/lib/schema";

import {
  briefTeamRefs,
  type BriefInput,
  type BriefInputMatch,
  type BriefStandingsSource,
} from "../scripts/lib/brief-input";
import { namesKoResolver } from "../scripts/lib/brief-template";
import type { FinishedMatch } from "../scripts/lib/match-data";
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
  playerTeamsFrom,
  substituteNames,
  teamFullNamesFrom,
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
const PLAYER_TEAMS = playerTeamsFrom(
  KoreanPlayersFileSchema.parse(readJson("configs/korean-players.json")),
);
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

  it("보호 구('Inter Miami'·'Juve Stabia')는 그대로, 'Inter Milan'은 인테르('Milan' → AC 밀란 오치환 없음)", () => {
    expect(sub("Inter Miami와 Inter Milan, 그리고 Milan")).toBe(
      "Inter Miami와 인테르, 그리고 AC 밀란",
    );
    expect(sub("Juve Stabia가 Juventus를 꺾었다")).toBe(
      "Juve Stabia가 유벤투스를 꺾었다",
    );
    expect(sub("Inter가 Milan을 꺾었다")).toBe("인테르가 AC 밀란을 꺾었다");
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

  it("감독 한 단어 성 별칭(사용자 결정 2026-10-25 — 뉴스 감독 발언 분류 전용)은 브리핑 치환·이름 찾기에 쓰지 않는다 — 미등록 선수 'Giacomo Sarri'·득점자 'Sarri'는 그대로(CLAUDE §1-7), 감독 전체 이름은 치환", () => {
    // 같은 성의 미등록 선수 — 성 부분만 감독 이름으로 바뀌지 않는다(대소문자 무시 치환이라 특히 위험)
    expect(sub("Giacomo Sarri가 결승골을 넣었다.")).toBe(
      "Giacomo Sarri가 결승골을 넣었다.",
    );
    expect(sub("Sarri가 득점했다.")).toBe("Sarri가 득점했다.");
    expect(sub("Allegri와 Moyes")).toBe("Allegri와 Moyes");
    expect(lookupName(INDEX, "Sarri")).toBeNull();
    expect(isKnownName(INDEX, "Allegri")).toBe(false);
    // 감독 전체 이름은 그대로 치환된다
    expect(sub("Maurizio Sarri의 Atalanta")).toBe("마우리치오 사리의 아탈란타");
    expect(sub("Hansi Flick의 Barça")).toBe("한지 플릭의 바르셀로나");
    // 성 별칭이 없는 감독·동명 선수(지오반니 시메오네 — 사전 선수 항목은 전체 이름일 때만)도 그대로
    expect(sub("Simeone이 득점했다.")).toBe("Simeone이 득점했다.");
    expect(sub("Conte와 Amorim")).toBe("Conte와 Amorim");
  });

  it("사전이 비면 원문 그대로(NFC)", () => {
    const empty = buildNameIndex(null);
    expect(substituteNames("Bayern가", empty)).toEqual({
      text: "Bayern가",
      masked: "Bayern가",
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
    // 'Brighton & Hove Albion'은 '&'에서 끊지 않는다 — 접속사 y·e로 이어진 두 이름은 따로
    expect(
      unknownNamesInText("Brighton & Hove Albion이 이겼다", SMALL),
    ).toEqual(["Brighton & Hove Albion"]);
    expect(
      unknownNamesInText(
        "Ludovit Reis e Niclas Füllkrug, Pedro y Pablo Gavi",
        SMALL,
      ),
    ).toEqual(["Ludovit Reis", "Niclas Füllkrug", "Pedro", "Pablo Gavi"]);
  });

  it("치환이 넣은 한글 표기 속 라틴 낱말('AC 밀란'·'파리 FC'·'AEK 아테네'·'UEFA 챔피언스리그')은 후보가 아니다 — masked에서 찾는다", () => {
    const r = substituteNames(
      "Milan과 Paris FC, PAE AEK가 Champions League에서 Rosenborg BK와 만났다",
      INDEX,
      { competitionLabel: nameKo },
    );
    expect(r.text).toBe(
      "AC 밀란과 파리 FC, AEK 아테네가 UEFA 챔피언스리그에서 Rosenborg BK와 만났다",
    );
    expect(unknownNamesInText(r.masked, INDEX)).toEqual(["Rosenborg BK"]);
    // 가리지 않은 텍스트에서는 'AC'·'FC'·'AEK'가 섞여 나온다(이 때문에 masked를 쓴다)
    expect(unknownNamesInText(r.text, INDEX)).not.toEqual(["Rosenborg BK"]);
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
        home: "Rosenborg BK",
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
    const out = canonicalizeBriefInput(input, INDEX, {
      playerTeams: PLAYER_TEAMS,
    });
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

  it("득점자·도움 정리는 선수 항목만 — 감독 이름(전체·성 별칭)이 득점자 자리에 붙지 않는다(사용자 결정 2026-10-25 감독 성 별칭, CLAUDE §1-7)", () => {
    const out = canonicalizeBriefInput(
      {
        ...input,
        matches: [
          match({
            goals: [
              { min: "12", team: "Bayern", player: "Sarri" },
              { min: "40", team: "Bayern", player: "Giacomo Sarri" },
              { min: "77", team: "Bayern", player: "Maurizio Sarri" },
            ],
          }),
        ],
      },
      INDEX,
      { playerTeams: PLAYER_TEAMS },
    );
    expect(out.replaced).toBe(0);
    expect(out.input.matches[0]!.goals!.map((g) => g.player)).toEqual([
      "Sarri",
      "Giacomo Sarri",
      "Maurizio Sarri",
    ]);
    // 템플릿 사람 이름도 선수 항목만
    const names = namesKoResolver(NAMES);
    expect(names.person("Sarri")).toBe("Sarri");
    expect(names.person("Maurizio Sarri")).toBe("Maurizio Sarri");
    expect(names.person("Harry Kane")).toBe("해리 케인");
  });

  it("첫 글자 축약 별칭('A. Davies')은 소속팀이 맞을 때만 대표 표기로 — 다른 팀의 같은 축약 이름·소속팀 정보 없음은 그대로", () => {
    const davies = (team: string, type?: "own_goal") =>
      canonicalizeBriefInput(
        {
          ...input,
          matches: [
            match({
              home: "Bayern",
              away: "Arsenal",
              ft: "1-0",
              goals: [
                type
                  ? { min: "9", team, player: "A. Davies", type }
                  : { min: "9", team, player: "A. Davies" },
              ],
            }),
          ],
        },
        INDEX,
        { playerTeams: PLAYER_TEAMS },
      ).input.matches[0]!.goals![0]!.player;
    expect(davies("Bayern")).toBe("Alphonso Davies");
    expect(davies("Arsenal")).toBe("A. Davies"); // 다른 팀의 A. Davies
    // 자책골의 team은 득점 인정 팀 — 자책한 선수는 상대 팀(Bayern) 소속
    expect(davies("Arsenal", "own_goal")).toBe("Alphonso Davies");
    expect(davies("Bayern", "own_goal")).toBe("A. Davies");
    // 소속팀 표(playerTeams)가 없으면 축약 별칭은 바꾸지 않는다 — 전체 표기 별칭('Kim Min-Jae')은 그대로 바꾼다
    const bare = canonicalizeBriefInput(input, INDEX).input.matches[0]!.goals!;
    expect(bare.map((g) => [g.player, g.assist])).toEqual([
      ["H. Kane", undefined],
      ["Min-jae Kim", "J. Musiala"],
    ]);
    // 한국 선수 축약 별칭은 korean-players.json 소속팀으로 확인한다(카스트로프 — 묀헨글라트바흐)
    const castrop = canonicalizeBriefInput(
      {
        ...input,
        matches: [
          match({
            home: "M'gladbach",
            away: "Bayern",
            goals: [{ min: "5", team: "M'gladbach", player: "J. Castrop" }],
          }),
        ],
      },
      INDEX,
      { playerTeams: PLAYER_TEAMS },
    ).input.matches[0]!.goals![0]!.player;
    expect(castrop).toBe("Jens Castrop");
  });

  it("첫 글자 축약 별칭은 치환·이름 찾기에 쓰지 않는다(동명이인 오매칭 방지 — 입력 정리를 거친 대표 표기만 한글로)", () => {
    expect(lookupName(INDEX, "A. Davies")).toBeNull();
    expect(substituteNames("A. Davies가 골을 넣었다", INDEX).text).toBe(
      "A. Davies가 골을 넣었다",
    );
    expect(substituteNames("Alphonso Davies가 골을 넣었다", INDEX).text).toBe(
      "알폰소 데이비스가 골을 넣었다",
    );
    expect(isKnownName(INDEX, "A. Davies")).toBe(false); // 미등록 후보로 적재(사람이 확인)
  });

  it("데이터 API 이름(팀·득점자·도움) — 입력 순서, 중복 한 번, 미등록만 고르기", () => {
    expect(briefInputNames(input).map((n) => `${n.kind}:${n.name}`)).toEqual([
      "team:Bayern",
      "team:Union Berlin",
      "team:Rosenborg BK",
      "team:Arsenal",
      "team:Dortmund",
      "player:H. Kane",
      "player:Kim Min-Jae",
      "player:J. Musiala",
      "player:Noni Madueke",
    ]);
    // 첫 글자 축약 별칭은 등록 이름으로 치지 않는다 — 입력 정리를 거치지 않은 'H. Kane'·'J. Musiala'는 미등록 후보
    expect(unknownBriefInputNames(input, INDEX)).toEqual([
      { name: "Rosenborg BK", kind: "team" },
      { name: "H. Kane", kind: "player" },
      { name: "J. Musiala", kind: "player" },
      { name: "Noni Madueke", kind: "player" },
    ]);
    const canonical = canonicalizeBriefInput(input, INDEX, {
      playerTeams: PLAYER_TEAMS,
    }).input;
    expect(unknownBriefInputNames(canonical, INDEX)).toEqual([
      { name: "Rosenborg BK", kind: "team" },
      { name: "Noni Madueke", kind: "player" },
    ]);
  });

  it("영문 토큰 허용 목록(M1-23) — 입력 이름 + 그 사전 항목의 모든 영문 표기 + 입력 대회 별칭·라틴 shortKo", () => {
    // M1-23은 입력 정리를 거친 입력(LLM에 보낸 그대로)으로 부른다
    const sent = canonicalizeBriefInput(input, INDEX, {
      playerTeams: PLAYER_TEAMS,
    }).input;
    const allow = briefNameAllowlist(sent, INDEX, COMPETITIONS);
    for (const t of [
      "Bayern",
      "FC Bayern München",
      "Union Berlin",
      "Rosenborg BK",
      "Kim Min-Jae",
      "Min-jae Kim",
      "Harry Kane",
      "Jamal Musiala",
      "Bundesliga",
    ]) {
      expect(allow.has(foldName(t)), t).toBe(true);
    }
    expect(allow.has(foldName("Premier League"))).toBe(false); // 입력에 없는 대회
    expect(allow.has(foldName("Kane"))).toBe(false); // 축약 성
    // 소속팀을 확인하지 못한 축약 이름이면 대표 표기는 허용하지 않는다(다른 사람일 수 있다)
    expect(
      briefNameAllowlist(input, INDEX, COMPETITIONS).has(
        foldName("Harry Kane"),
      ),
    ).toBe(false);
    const ucl = briefNameAllowlist(
      { matches: [match({ comp: "UEFA Champions League" })], standings: [] },
      INDEX,
      COMPETITIONS,
    );
    expect(ucl.has("ucl")).toBe(true);
    expect(ucl.has(foldName("Champions League"))).toBe(true);
  });
});

describe("브리핑 입력 — 사전에 없는 팀 짧은 이름 → 정식 이름(D46 'Deportivo', 사용자 결정 2026-10-22)", () => {
  /** 골든셋 2026-10-17을 본뜬 합성 경기(football-data 짧은 이름 'Deportivo'·'Levante' — id·분·대회 이름은 시험용 값) */
  const deportivoMatch = (
    over: Partial<BriefInputMatch> = {},
  ): BriefInputMatch => ({
    id: "m544441",
    comp: "Primera Division",
    round: "Matchday 9",
    home: "Deportivo",
    away: "Levante",
    ft: "1-1",
    ht: "0-0",
    goals: [
      { min: "50", team: "Deportivo", player: "Bil Nsongo" },
      { min: "82", team: "Levante", player: "Daniel Requena Sánchez" },
    ],
    ...over,
  });
  const input: BriefInput = {
    briefDate: "2026-10-17",
    matches: [deportivoMatch()],
    standings: [
      {
        id: "sLL",
        comp: "Primera Division",
        note: "current table, top 4 positions only",
        rows: [
          { pos: 1, team: "Real Madrid", played: 9, pts: 22, gd: 14 },
          { pos: 2, team: "Deportivo", played: 9, pts: 20, gd: 8 },
        ],
      },
    ],
  };
  const FULL = teamFullNamesFrom([
    { name: "Deportivo", fullName: "RC Deportivo La Coruña" },
    { name: "Levante", fullName: "Levante UD" },
    { name: "Real Madrid", fullName: "Real Madrid CF" },
  ]);

  it("짧은 이름 'Deportivo'는 사전에 없고 정식 이름은 사전 팀 → 경기·득점 team·순위 행 모두 정식 이름(득점 team = home 관계 유지)", () => {
    // 전제: D46 — 'Deportivo'는 별칭이 아니다(알라베스와 겹침), 정식 이름은 데포르티보 라코루냐
    expect(lookupName(INDEX, "Deportivo")).toBeNull();
    expect(koreanName(INDEX, "RC Deportivo La Coruña")).toBe(
      "데포르티보 라코루냐",
    );
    const out = canonicalizeBriefInput(input, INDEX, { teamFullNames: FULL });
    const m = out.input.matches[0]!;
    expect(m.home).toBe("RC Deportivo La Coruña");
    expect(m.away).toBe("Levante"); // 짧은 이름이 사전 별칭(D39 ②) — 그대로
    expect(m.goals!.map((g) => g.team)).toEqual([
      "RC Deportivo La Coruña",
      "Levante",
    ]);
    expect(m.goals![1]!.player).toBe("Dani Requena"); // 선수 대표 표기는 그대로 동작
    expect(out.input.standings[0]!.rows.map((r) => r.team)).toEqual([
      "Real Madrid",
      "RC Deportivo La Coruña",
    ]);
    expect(out.teams).toBe(1); // 서로 다른 이름 기준
    expect(out.replaced).toBe(1);
    // 키 순서 유지(직렬화가 봇·골든셋과 같게) · 원본은 그대로(순수 함수)
    expect(Object.keys(m)).toEqual(Object.keys(input.matches[0]!));
    expect(Object.keys(m.goals![0]!)).toEqual(["min", "team", "player"]);
    expect(input.matches[0]!.home).toBe("Deportivo");
    // 미등록 이름에서 빠지고, 모델이 정식 이름·별칭을 옮기면 한글로 치환된다
    expect(
      unknownBriefInputNames(out.input, INDEX).map((n) => n.name),
    ).not.toContain("Deportivo");
    expect(sub("Levante가 RC Deportivo La Coruña와 1-1로 비겼다.")).toBe(
      "레반테가 데포르티보 라코루냐와 1-1로 비겼다.",
    );
    const allow = briefNameAllowlist(out.input, INDEX, COMPETITIONS);
    expect(allow.has(foldName("Deportivo La Coruña"))).toBe(true);
    expect(allow.has(foldName("Deportivo"))).toBe(false); // 짧은 이름 단독은 허용 토큰이 아니다(그 줄은 템플릿)
  });

  it("자책골 — 자책한 선수의 팀(상대 팀)도 바뀐 이름으로 판단한다", () => {
    const own = canonicalizeBriefInput(
      {
        ...input,
        matches: [
          deportivoMatch({
            goals: [
              {
                min: "10",
                team: "Levante",
                player: "Bil Nsongo",
                type: "own_goal",
              },
            ],
          }),
        ],
      },
      INDEX,
      { teamFullNames: FULL },
    ).input.matches[0]!;
    expect(own.home).toBe("RC Deportivo La Coruña");
    expect(own.goals![0]).toEqual({
      min: "10",
      team: "Levante",
      player: "Bil Nsongo",
      type: "own_goal",
    });
  });

  it("짧은 이름이 사전 팀 별칭이면 그대로('Bayern' — 정식 이름과 같은 항목), 둘 다 사전에 없으면 그대로('Rosenborg'·'Rosenborg BK' — 6개 대회 밖 미등록 팀)", () => {
    const out = canonicalizeBriefInput(
      {
        briefDate: "2026-10-22",
        matches: [
          deportivoMatch({
            comp: "UEFA Champions League",
            home: "Bayern",
            away: "Rosenborg",
            ft: "3-0",
            goals: [{ min: "5", team: "Bayern", player: "Harry Kane" }],
          }),
        ],
        standings: [],
      },
      INDEX,
      {
        teamFullNames: teamFullNamesFrom([
          { name: "Bayern", fullName: "FC Bayern München" },
          { name: "Rosenborg", fullName: "Rosenborg BK" },
        ]),
      },
    );
    const m = out.input.matches[0]!;
    expect([m.home, m.away, m.goals![0]!.team]).toEqual([
      "Bayern",
      "Rosenborg",
      "Bayern",
    ]);
    expect(out.teams).toBe(0);
    // 표가 없으면(옵션 없음 — eval의 M0 입력) 팀 이름은 바꾸지 않는다
    expect(canonicalizeBriefInput(input, INDEX).input.matches[0]!.home).toBe(
      "Deportivo",
    );
  });

  it("짧은 이름이 다른 사전 팀을 가리키면 정식 이름(작은 사전 — 'Dortmund'가 2군 정식 이름의 짧은 이름인 가상 사례)", () => {
    const out = canonicalizeBriefInput(
      {
        briefDate: "2026-10-22",
        matches: [
          deportivoMatch({
            comp: "Bundesliga",
            home: "Dortmund",
            away: "Arsenal",
            ft: "0-0",
            goals: [],
          }),
        ],
        standings: [],
      },
      SMALL,
      {
        teamFullNames: teamFullNamesFrom([
          { name: "Dortmund", fullName: "Borussia Dortmund II" },
          { name: "Arsenal", fullName: "Arsenal FC" }, // 정식 이름이 사전에 없으면 그대로
        ]),
      },
    );
    const m = out.input.matches[0]!;
    expect(m.home).toBe("Borussia Dortmund II");
    expect(m.away).toBe("Arsenal");
    expect(out.teams).toBe(1);
  });

  it("teamFullNamesFrom — 정식 이름 없음·같음은 빼고, 같은 짧은 이름이 서로 다른 정식 이름을 가리키면 모호해 뺀다", () => {
    const table = teamFullNamesFrom([
      { name: "Deportivo", fullName: "RC Deportivo La Coruña" },
      { name: "Deportivo", fullName: "RC Deportivo La Coruña" }, // 같은 팀 반복은 그대로
      { name: "Sabah FK", fullName: "Sabah FK" }, // 짧은 이름 = 정식 이름
      { name: "Levante", fullName: null },
      { name: "City", fullName: "Manchester City FC" },
      { name: "City", fullName: "Bristol City FC" }, // 모호
      { name: "City", fullName: "Manchester City FC" }, // 모호해진 뒤에는 다시 넣지 않는다
    ]);
    expect([...table]).toEqual([["Deportivo", "RC Deportivo La Coruña"]]);
  });

  it("briefTeamRefs — 빌더 재료(경기 home·away + 순위 행 team)의 짧은 이름·정식 이름", () => {
    const team = (id: number, name: string, fullName: string | null) => ({
      id,
      name,
      fullName,
    });
    const results = [
      {
        home: team(560, "Deportivo", "RC Deportivo La Coruña"),
        away: team(88, "Levante", "Levante UD"),
      },
    ] as unknown as FinishedMatch[]; // 이 함수는 home·away만 읽는다
    const standings: BriefStandingsSource[] = [
      {
        comp: "LALIGA",
        inProgress: 0,
        tables: [
          {
            rows: [
              {
                pos: 1,
                team: team(86, "Real Madrid", "Real Madrid CF"),
                played: 9,
                pts: 22,
                gd: 14,
              },
            ],
          },
        ],
      },
    ];
    expect(
      briefTeamRefs({ results, standings }).map((t) => t.fullName),
    ).toEqual(["RC Deportivo La Coruña", "Levante UD", "Real Madrid CF"]);
    expect(briefTeamRefs({ results })).toHaveLength(2);
  });
});
