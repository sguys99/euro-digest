/**
 * M1-14 — 뉴스 제목 키워드 표 (scripts/lib/news-keywords.ts, PRD FR-06·FR-21 — CLAUDE.md §9.2 필수: 분류 규칙(언어별 키워드)).
 *
 * 정규화(발음 기호·문장부호·대소문자) · 라틴 단어 경계 · 한국어 부분 문자열(조사·띄어쓰기) · 제외 표현(Inter Miami·
 * 레알 소시에다드·아시아 챔피언스리그·K리그1·리그 1위) · 언어별 표(en·it·es·ko, 라틴 공통) · 설정 색인(korean-players.json +
 * names.ko.json — 등록 선수만, FR-60) · 실데이터 제목(fixtures/cluster·fixtures/rss). 네트워크 없음.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CompetitionsFileSchema,
  CompIdSchema,
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
} from "@/lib/schema";

import {
  BIG_CLUBS,
  COMPETITION_TERMS,
  buildKeywordIndex,
  compileGroup,
  koNameTerms,
  koText,
  koreanKeywordPlayers,
  latinText,
  matchTitles,
  matchesGroup,
  titleText,
  womenTeamExcludes,
  type KeywordGroup,
} from "../scripts/lib/news-keywords";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const NAMES = NamesKoFileSchema.parse(readJson("configs/names.ko.json"));
const PLAYERS = KoreanPlayersFileSchema.parse(
  readJson("configs/korean-players.json"),
);
const INDEX = buildKeywordIndex({ names: NAMES, koreanPlayers: PLAYERS });

const hits = (title: string, lang: string) =>
  matchTitles([{ title, lang }], INDEX);
const matches = (group: KeywordGroup, title: string, lang: string) =>
  matchesGroup(titleText(title, lang), compileGroup(group));

describe("정규화", () => {
  it("라틴: 발음 기호 제거·소문자·글자/숫자 밖은 공백, 앞뒤 공백 하나", () => {
    expect(latinText("Atlético de Madrid")).toBe(" atletico de madrid ");
    expect(latinText("Barça’s 2. Bundesliga — 🚨 PSG!")).toBe(
      " barca s 2 bundesliga psg ",
    );
    expect(latinText("Mönchengladbach")).toBe(" monchengladbach ");
    expect(latinText("  ")).toBe(" ");
  });

  it("한국어: NFKC·소문자, 공백·문장부호 제거(조사는 그대로 — 부분 문자열로 맞춘다)", () => {
    expect(koText("AT 마드리드전 · ‘김민재’가")).toBe("at마드리드전김민재가");
    expect(koText("세리에 A")).toBe("세리에a");
  });
});

describe("맞춤 규칙 — 단어 경계·부분 문자열·제외 표현", () => {
  it("matchesGroup: 라틴 공통·언어 표·한국어 표를 언어에 맞게 고르고, 제외 표현은 이어 나와도 모두 지운다", () => {
    const group: KeywordGroup = {
      terms: { latin: ["alpha"], en: ["beta"], es: ["gamma"], ko: ["감마"] },
      exclude: { latin: ["alpha one"], ko: ["감마선"] },
    };
    expect(matches(group, "Alpha wins", "en")).toBe(true);
    expect(matches(group, "Alpha wins", "it")).toBe(true); // 라틴 공통
    expect(matches(group, "Beta wins", "en")).toBe(true);
    expect(matches(group, "Beta wins", "es")).toBe(false); // en 표는 스페인어 제목에 쓰지 않는다
    expect(matches(group, "Gamma gana", "es")).toBe(true);
    expect(matches(group, "Alpha One and Alpha One", "en")).toBe(false);
    expect(matches(group, "Alpha One and Alpha", "en")).toBe(true);
    expect(matches(group, "감마선 감마선", "ko")).toBe(false);
    expect(matches(group, "감마선과 감마가", "ko")).toBe(true);
    expect(matches(group, "Alpha", "ko")).toBe(false); // 한국어 제목은 ko 표만
    expect(matches({ terms: {} }, "anything", "en")).toBe(false);
  });

  it("라틴은 단어 경계: sign ≠ signal, 활용형은 표에 적은 것만", () => {
    expect(
      hits("Getafe make offer to sign free agent Sancho", "en").transfer,
    ).toBe(true);
    expect(hits("Referee missed the signal from VAR", "en").transfer).toBe(
      false,
    );
    expect(
      hits("Palmer signs new Chelsea contract until 2034", "en"),
    ).toMatchObject({ transfer: true, bigClubs: ["chelsea"] });
  });

  it("짧은 별칭의 오탐은 제외 표현으로 막는다 — Inter Miami·Inter Milan의 Milan(겹쳐 나와도)", () => {
    expect(hits("Messi stars as Inter Miami win again", "en").bigClubs).toEqual(
      [],
    );
    expect(
      hits("Inter Miami beat Inter Miami II in friendly", "en").bigClubs,
    ).toEqual([]);
    expect(hits("Inter Milan sign striker", "en").bigClubs).toEqual([
      "internazionale-milano",
    ]);
    expect(hits("Milan, la probabile formazione", "it").bigClubs).toEqual([
      "ac-milan",
    ]);
    expect(hits("Inter e Milan, derby in vista", "it").bigClubs).toEqual([
      "internazionale-milano",
      "ac-milan",
    ]);
  });

  it("한국어는 조사·띄어쓰기와 무관, 제외 표현(레알 소시에다드)은 그 자리만 지운다", () => {
    expect(hits("김민재가 뮌헨 수비를 이끌었다", "ko")).toMatchObject({
      koreanPlayers: ["kim-min-jae"],
      bigClubs: ["bayern-munchen"],
    });
    expect(
      hits("AT 마드리드전 패배에 뿔난 캐릭 맨유 감독", "ko").bigClubs,
    ).toEqual(["atletico-de-madrid", "manchester-united"]);
    expect(hits("레알 소시에다드, 셀타와 비겨", "ko").bigClubs).toEqual([]);
    expect(hits("레알 소시에다드 꺾은 레알, 리그 선두", "ko").bigClubs).toEqual(
      ["real-madrid"],
    );
  });

  it("대회: K리그1·리그 1위·리그 10경기는 리그1이 아니다(한국어 '리그1' 표현을 쓰지 않음), 리그앙·프랑스 리그1은 맞다", () => {
    for (const title of [
      "김천 상무, 2027시즌 K리그1 라이선스 불승인",
      "울산, 리그 1위 등극",
      "리그 10경기 무패",
    ]) {
      expect(hits(title, "ko").comps).toEqual([]);
    }
    expect(hits("PSG, 리그앙 3연승", "ko").comps).toEqual(["LIGUE1"]);
    expect(hits("PSG, 프랑스 리그1 선두", "ko").comps).toEqual(["LIGUE1"]);
    expect(hits("PSG top of Ligue 1 again", "en").comps).toEqual(["LIGUE1"]);
  });

  it("대회: 2. Bundesliga·LaLiga Hypermotion·아시아 챔피언스리그·Champions Cup(럭비)는 범위 대회가 아니다", () => {
    expect(hits("Schalke climb in 2. Bundesliga", "en").comps).toEqual([]);
    expect(hits("Racing lead LaLiga Hypermotion", "es").comps).toEqual([]);
    expect(hits("울산, 아시아 챔피언스리그 엘리트 16강", "ko").comps).toEqual(
      [],
    );
    expect(
      hits("Cómo funciona la Champions Cup de rugby: 24 equipos", "es").comps,
    ).toEqual([]);
    expect(hits("Bundesliga: Bayern held", "en").comps).toEqual(["BUNDESLIGA"]);
    expect(hits("세리에 A 개막", "ko").comps).toEqual(["SERIEA"]);
  });
});

describe("언어별 표 — en·it·es·ko, 라틴 공통", () => {
  it("이적: 언어마다 그 언어 표 + 라틴 공통('here we go')", () => {
    expect(
      hits("Calciomercato, accordo per il centrocampista", "it").transfer,
    ).toBe(true);
    expect(
      hits("El Betis cierra el fichaje de un delantero", "es").transfer,
    ).toBe(true);
    expect(hits("Here we go! Napoli, è fatta", "it").transfer).toBe(true);
    expect(hits("김민재 아스널 이적 가능성", "ko").transfer).toBe(true);
    // 다른 언어 표의 말은 보지 않는다(이탈리아어 'offerta'는 영어 제목 단어가 아니다)
    expect(hits("Offerta day at the club shop", "en").transfer).toBe(false);
  });

  it("UCL: 'champions' 한 단어는 이탈리아어·스페인어 제목에서만(영어 'Champions Liverpool'은 리그 우승팀일 수 있다)", () => {
    expect(
      hits("El Betis vuelve a Champions por la puerta grande", "es").comps,
    ).toEqual(["UCL"]);
    expect(hits("Champions, il Napoli vola", "it").comps).toEqual(["UCL"]);
    expect(hits("Champions Liverpool start defence", "en").comps).toEqual([]);
    expect(hits("Champions League draw: Arsenal face PSG", "en").comps).toEqual(
      ["UCL"],
    );
    expect(hits("[UCL REVIEW] 맨시티, PSG에 2-4 참패", "ko").comps).toEqual([
      "UCL",
    ]);
  });

  it("표에 없는 라틴 언어(de 등)는 라틴 공통 표만", () => {
    expect(hits("Here we go: Wechsel perfekt", "de").transfer).toBe(true);
    expect(hits("Transfer perfekt", "de").transfer).toBe(false); // en 표는 보지 않는다
  });

  it("대회 표는 대회 id 전부를 덮고 competitions.json의 대회와 같다", () => {
    const competitions = CompetitionsFileSchema.parse(
      readJson("configs/competitions.json"),
    );
    expect(Object.keys(COMPETITION_TERMS).sort()).toEqual(
      [...CompIdSchema.options].sort(),
    );
    expect(competitions.map((c) => c.id).sort()).toEqual(
      [...CompIdSchema.options].sort(),
    );
    // 영어 대회 이름(nameEn)은 영어 제목에서 그 대회로 맞는다
    for (const c of competitions) {
      expect(hits(`Report: ${c.nameEn} round-up`, "en").comps).toContain(c.id);
    }
  });

  it("빅클럽 slug는 중복이 없고 모든 항목에 라틴·한국어 표현이 있다", () => {
    const slugs = BIG_CLUBS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const club of BIG_CLUBS) {
      expect(club.terms.latin?.length ?? 0).toBeGreaterThan(0);
      expect(club.terms.ko?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("설정 색인 — korean-players.json(FR-60 등록 선수만) + names.ko.json", () => {
  it("한국 선수: nameEn·nameKo + names.ko 영문 변형(성·이름 순서), 한국어 띄어 쓴 이름은 마지막 단어로도", () => {
    expect(hits("Kim Min-jae linked with Arsenal", "en").koreanPlayers).toEqual(
      ["kim-min-jae"],
    );
    expect(
      hits("Minjae Kim back in Bayern defence", "en").koreanPlayers,
    ).toEqual(["kim-min-jae"]);
    expect(hits("Lee Kang-in assists again", "en").koreanPlayers).toEqual([
      "lee-kang-in",
    ]);
    expect(hits("Kang-In Lee e l'Atletico", "it").koreanPlayers).toEqual([
      "lee-kang-in",
    ]);
    expect(
      hits("카스트로프, 묀헨글라트바흐 데뷔골", "ko").koreanPlayers,
    ).toEqual(["jens-castrop"]);
    expect(koNameTerms("옌스 카스트로프")).toEqual([
      "옌스 카스트로프",
      "카스트로프",
    ]);
    expect(koNameTerms("이강인")).toEqual(["이강인"]);
  });

  it("등록되지 않은 한국 선수(손흥민·황인범·오현규)는 한국 선수 키워드가 아니다(FR-60)", () => {
    for (const title of [
      "손흥민, 1골 2도움 폭발! LAFC 3-1 승리",
      "황인범, 단 19분 뛰고도 팀 내 평점 공동 2위",
      "Son Heung-min stars for LAFC",
    ]) {
      expect(
        hits(title, title.startsWith("Son") ? "en" : "ko").koreanPlayers,
      ).toEqual([]);
    }
  });

  it("names.ko 팀 표기도 빅클럽 표현에 더한다(바이에른 뮌헨 — 'Bayern München'·'Bayern Munich')", () => {
    expect(hits("FC Bayern München hold Union", "en").bigClubs).toEqual([
      "bayern-munchen",
    ]);
    expect(hits("Club Atlético de Madrid announce", "es").bigClubs).toEqual([
      "atletico-de-madrid",
    ]);
  });

  it("설정을 읽지 못하면(null) 한국 선수 없이 코드 표(빅클럽·대회·이적)만", () => {
    const bare = buildKeywordIndex({});
    expect(bare.koreanPlayers).toEqual([]);
    expect(
      matchTitles([{ title: "Kim Min-jae joins Arsenal", lang: "en" }], bare),
    ).toEqual({
      comps: [],
      bigClubs: ["arsenal"],
      koreanPlayers: [],
      transfer: true,
    });
  });

  it("여러 제목(같은 사건 클러스터)은 합집합", () => {
    expect(
      matchTitles(
        [
          { title: "Arsenal eye defender", lang: "en" },
          { title: "김민재 아스널 이적 가능성", lang: "ko" },
        ],
        INDEX,
      ),
    ).toEqual({
      comps: [],
      bigClubs: ["arsenal"],
      koreanPlayers: ["kim-min-jae"],
      transfer: true,
    });
  });
});

describe("리뷰 반영 — 국내 약칭 'PL'·라틴 경계·제외 표현·여자팀·활성 선수", () => {
  it("국내 제목의 라틴 약칭은 앞뒤가 라틴 글자·숫자가 아닐 때만 — 'PL'은 프리미어리그, 'SPL'·'EPL'의 pl은 아니다", () => {
    expect(hits("[PL REVIEW] 토트넘, 극장골로 맨유와 1-1", "ko").comps).toEqual(
      ["EPL"],
    );
    expect(hits("‘25-26 PL 올해의 선수’ 브루노", "ko").comps).toEqual(["EPL"]);
    expect(hits("PL에서 가장 빠른 골", "ko").comps).toEqual(["EPL"]);
    expect(hits("셀틱, SPL 4연속 우승", "ko").comps).toEqual([]);
    expect(hits("EPL 킬러 PSG", "ko")).toMatchObject({
      comps: ["EPL"],
      bigClubs: ["paris-saint-germain"],
    });
    expect(hits("Liverpool want PL winger", "en").comps).toEqual(["EPL"]);
    // 다른 약칭도 같은 규칙 — 'ATM과'는 맞고 'ATMOSPHERE'는 아니다
    expect(hits("NBA 스타, ATM과 파트너십", "ko").bigClubs).toEqual([
      "atletico-de-madrid",
    ]);
    expect(hits("‘ATMOSPHERE’ 콘서트 개최", "ko").bigClubs).toEqual([]);
  });

  it("빅클럽 제외 표현 — Juve Stabia·Inter de Miami·뮌헨글라트바흐", () => {
    expect(hits("Juve Stabia stun Palermo", "it").bigClubs).toEqual([]);
    expect(hits("Juve Stabia e Juventus, che giornata", "it").bigClubs).toEqual(
      ["juventus"],
    );
    expect(hits("Messi brilla con el Inter de Miami", "es").bigClubs).toEqual(
      [],
    );
    expect(hits("카스트로프, 뮌헨글라트바흐 데뷔골", "ko")).toMatchObject({
      bigClubs: [],
      koreanPlayers: ["jens-castrop"],
    });
  });

  it("대회 제외 표현 — 프랑스 리그2·AFC 챔스·Concacaf/AFC 'Liga de Campeones'·여자 챔피언스리그", () => {
    expect(hits("프랑스 리그2 승격 경쟁", "ko").comps).toEqual([]);
    expect(hits("울산, AFC 챔스 엘리트 첫 승", "ko").comps).toEqual([]);
    expect(
      hits("Liga de Campeones de la Concacaf: Monterrey avanza", "es").comps,
    ).toEqual([]);
    expect(
      hits("Liga de Campeones de la AFC: Al Hilal gana", "es").comps,
    ).toEqual([]);
    expect(hits("Champions femenina: el Barça golea", "es").comps).toEqual([]);
    expect(hits("Liga de Campeones: el Madrid remonta", "es").comps).toEqual([
      "UCL",
    ]);
  });

  it("여자팀은 빅클럽 배수·범위 근거가 아니다(서비스 범위 밖) — 같은 제목의 남자팀 언급은 그대로", () => {
    expect(
      hits("Arsenal Women beat Chelsea Women in WSL", "en").bigClubs,
    ).toEqual([]);
    expect(hits("Arsenal Women's captain injured", "en").bigClubs).toEqual([]);
    expect(hits("El Barcelona Femení gana la Liga F", "es")).toMatchObject({
      bigClubs: [],
      comps: [],
    });
    expect(hits("첼시 위민, WSL 선두", "ko").bigClubs).toEqual([]);
    expect(
      hits("Arsenal Women and Arsenal both win on Sunday", "en").bigClubs,
    ).toEqual(["arsenal"]);
  });

  it("이적이 아닌 흔한 쓰임은 빼고(배수 1.2라 자주 나오는 것만) 진짜 이적 표현은 그대로", () => {
    for (const [title, lang] of [
      ["Lukaku firma il gol del vantaggio", "it"],
      ["Morocco launch World Cup bid", "en"],
      ["Arsenal title bid stalls", "en"],
      ["Saka shows signs of recovery", "en"],
      ["Medical staff rush to help fan", "en"],
    ] as const) {
      expect(hits(title, lang).transfer).toBe(false);
    }
    for (const [title, lang] of [
      ["Kean firma con la Fiorentina fino al 2030", "it"],
      ["Chelsea bid for Napoli striker", "en"],
      ["Striker signs for Spurs", "en"],
      ["Midfielder undergoes medical at Arsenal", "en"],
    ] as const) {
      expect(hits(title, lang).transfer).toBe(true);
    }
  });

  it("한국 선수 키워드는 활성 선수만(FR-60 '5대 리그 소속 기준', FR-64 기타 리그 이적 = active:false) — M1-17 kr과 같은 기준", () => {
    const inactive = PLAYERS.filter((p) => !p.active);
    expect(inactive.map((p) => p.slug)).toContain("hong-hyun-seok");
    expect(koreanKeywordPlayers(PLAYERS).every((p) => p.active)).toBe(true);
    expect(INDEX.koreanPlayers.map((p) => p.slug)).not.toContain(
      "hong-hyun-seok",
    );
    expect(hits("홍현석, 미트윌란 결승골", "ko").koreanPlayers).toEqual([]);
    expect(
      hits("Hyun-seok Hong scores for Midtjylland", "en").koreanPlayers,
    ).toEqual([]);
    expect(koreanKeywordPlayers(null)).toEqual([]);
  });

  it("womenTeamExcludes: 별칭마다 여자팀 표현을 붙인다", () => {
    expect(
      womenTeamExcludes({ latin: ["arsenal"], ko: ["아스널"] }),
    ).toMatchObject({
      latin: expect.arrayContaining(["arsenal women", "arsenal femeni"]),
      ko: expect.arrayContaining(["아스널 위민", "아스널 여자팀"]),
    });
  });
});

describe("실데이터 제목 — fixtures/cluster(2026-10-15 수집)", () => {
  const fx = readJson("fixtures/cluster/titles-2026-10-15.json") as {
    items: Array<{ id: string; lang: string; title: string }>;
  };
  const byId = new Map(fx.items.map((i) => [i.id, i] as const));
  const hitsOf = (id: string) => {
    const it = byId.get(id)!;
    return hits(it.title, it.lang);
  };

  it.each([
    // 국내: 등록 선수 + 빅클럽 + 이적
    [
      "t088",
      { koreanPlayers: ["kim-min-jae"], bigClubs: ["arsenal"], transfer: true },
    ],
    // 국내: 이강인(아틀레티코 'ATM'은 제목에 없음) + 맨유 + 바이아웃(이적)
    [
      "t084",
      {
        koreanPlayers: ["lee-kang-in"],
        bigClubs: ["manchester-united"],
        transfer: true,
      },
    ],
    // 국내 UCL 리뷰 머리표
    [
      "t124",
      { comps: ["UCL"], bigClubs: ["manchester-city", "paris-saint-germain"] },
    ],
    // 해외: BBC 이적설 묶음(gossip) + 나폴리 · 'Real links'는 레알 마드리드로 보지 않는다(보수적)
    ["t046", { bigClubs: ["ssc-napoli"], transfer: true }],
    // 스페인어 UCL
    ["t072", { comps: ["UCL"], bigClubs: [] }],
    // 럭비 Champions Cup — 범위 대회 아님
    ["t074", { comps: [] }],
    // K리그 시상 — 범위 근거 없음
    ["t110", { comps: [], bigClubs: [], koreanPlayers: [] }],
    // 연예 기사 — 키워드 없음(제외는 M1-17)
    ["t116", { comps: [], bigClubs: [], koreanPlayers: [], transfer: false }],
  ] as const)("%s", (id, expected) => {
    expect(hitsOf(id)).toMatchObject(expected);
  });
});
