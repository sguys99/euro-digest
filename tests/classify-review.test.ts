/**
 * M1-17 리뷰 회귀 — 리뷰가 넣어 본 제목을 그대로 고정한다(scratchpad/probe의 merge·merge2·scope·scope2·spoiler·preview·nat).
 *
 *   - D42 오병합(차단 1): 경기 전('can beat'·'앞둔 … 원정 떠난다'·'2-1 승리 예상')·이적('win race to sign')·부상('lose Rodri to
 *     injury'·'2-3주 결장')·감독 신호 제목은 '경기 결과'·병합 대상이 아니고, 스코어 없는 해외 기사끼리는 합치지 않는다 → 병합 0
 *   - 한국어 부분 문자열 함정(차단 2): '가수'(김민재가 수비)·'음원'(다음 원정)·'방송인'(방송 인터뷰)·'화보'(변화 보여준)·'골프'(골
 *     프라이부르크)·'당구'(해당 구단) — 국내 축구 기사를 빼지 않는다
 *   - 동명이인 연예(중요 2): 배우 김지수·가수 정우영은 빼고, 축구 문맥(데뷔전·선발)이면 남긴다 · kr을 주지 않는다
 *   - 결과 동사 확장(중요 4·5): sink·down·ease past·brush aside·overcome·demolish·outclass·earn point·stumble·cade·frenano·se impone·
 *     덜미·웃었다·잡았다·졌다·패 — 주어(팀·등록 선수)가 있을 때, '프리뷰' ≠ '리뷰'
 *   - 숫자 범위(중요 6): '2-3주'·'4-6 weeks'·'1-2월'·'1-2위'는 스코어가 아니다
 *   - 대표팀 오분류(권장): 'las eliminatorias de la Champions'·'il ct del Milan'·'Thuram convocato'는 대표팀이 아니다
 *   - 대표팀 강한 표현은 K리그 표현이 있어도 남긴다(오케스트레이터 결정 ③)
 * 사전은 configs/names.ko.json(M1-21 최종)과 별칭 확장 흉내 둘 다. 네트워크 없음.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  SourcesFileSchema,
  type NamesKoFile,
} from "@/lib/schema";

import {
  analyzeItems,
  isNationalText,
  textSignals,
  titleScores,
  type ClassifyContext,
} from "../scripts/lib/classify";
import { todayCardEntity } from "../scripts/lib/cluster-classify";
import { entityOf, planEntityMerges } from "../scripts/lib/entity-merge";
import {
  KOREAN_HOMONYM_PLAYERS,
  buildKeywordIndex,
  isDrawLottery,
  matchTitles,
} from "../scripts/lib/news-keywords";
import { scopeExclusion } from "../scripts/lib/news-scope";
import { clusterSignals } from "../scripts/lib/score";
import { buildTagIndex, matchTitleTags } from "../scripts/lib/tag-names";

import { namesWithExtras } from "./support/names-extras";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const NAMES = NamesKoFileSchema.parse(readJson("configs/names.ko.json"));
const PLAYERS = KoreanPlayersFileSchema.parse(
  readJson("configs/korean-players.json"),
);
const SOURCES = SourcesFileSchema.parse(readJson("configs/sources.json"));
const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s] as const));
const ctxOf = (names: NamesKoFile): ClassifyContext => ({
  keywords: buildKeywordIndex({ names, koreanPlayers: PLAYERS }),
  tags: buildTagIndex({ names, koreanPlayers: PLAYERS }),
  sourceById: SOURCE_BY_ID,
});

describe.each([
  ["현재 사전", ctxOf(NAMES)],
  ["사전 + 별칭 확장 흉내", ctxOf(namesWithExtras(NAMES))],
] as const)("M1-17 리뷰 회귀 — %s", (_label, ctx) => {
  const analyze = (
    title: string,
    lang: string,
    source: string,
    at = "2026-10-17T18:00:00Z",
  ) =>
    analyzeItems(
      [{ title, lang, summary: null, sources: [source], publishedAt: at }],
      ctx,
    );

  it("차단 1 — 경기 전·이적·부상 제목은 '경기 결과'도 병합 대상도 아니다, 스코어 없는 해외 기사끼리 합치지 않는다 → 병합 0", () => {
    const items: Array<[string, string, string, string, string, boolean]> = [
      // 제목, 언어, 소스, 시각, 기대 카테고리, 병합 대상
      [
        "Arsenal 2-1 Chelsea: Saka scores late winner",
        "en",
        "bbc-sport-football",
        "2026-10-17T19:30:00Z",
        "result",
        true,
      ],
      [
        "Arteta: Arsenal can beat Chelsea without Odegaard",
        "en",
        "bbc-sport-football",
        "2026-10-17T10:00:00Z",
        "other",
        false,
      ],
      [
        "Chelsea win race to sign Arsenal target",
        "en",
        "espn-soccer",
        "2026-10-17T12:00:00Z",
        "transfer",
        false,
      ],
      [
        "Man City lose Rodri to injury for Liverpool clash",
        "en",
        "bbc-sport-football",
        "2026-10-17T09:00:00Z",
        "injury",
        false,
      ],
      [
        "Liverpool 1-2 Man City: Haaland double",
        "en",
        "bbc-sport-premier-league",
        "2026-10-17T18:00:00Z",
        "result",
        true,
      ],
      [
        "Arsenal v Chelsea in 10-man thriller? 4-3-3 shape",
        "en",
        "bbc-sport-football",
        "2026-10-17T11:00:00Z",
        "other",
        false,
      ],
      [
        "U-21 2026-27 Arsenal Chelsea",
        "en",
        "bbc-sport-football",
        "2026-10-17T11:00:00Z",
        "other",
        false,
      ],
      [
        "Real Madrid 3-1 Barcelona (2-1 at half-time)",
        "en",
        "espn-soccer",
        "2026-10-17T20:00:00Z",
        "result",
        true,
      ],
      [
        "Inter Milan beat Roma 2-0",
        "en",
        "bbc-sport-european",
        "2026-10-17T20:00:00Z",
        "result",
        true,
      ],
      [
        "El Barça viaja a Roma sin Lewandowski",
        "es",
        "relevo",
        "2026-10-17T20:00:00Z",
        "other",
        false,
      ],
      [
        "Inter, il Milan e la Roma",
        "it",
        "di-marzio",
        "2026-10-17T20:00:00Z",
        "other",
        false,
      ],
      [
        "Nice goal from Kane as Bayern win",
        "en",
        "bbc-sport-european",
        "2026-10-17T20:00:00Z",
        "result",
        true,
      ],
      [
        "김민재 풀타임, 뮌헨 도르트문트에 2-1 승리",
        "ko",
        "interfootball-world",
        "2026-10-17T20:00:00Z",
        "result",
        true,
      ],
      [
        "'2-1 승리 예상' 뮌헨 도르트문트 맞대결 전망",
        "ko",
        "interfootball-world",
        "2026-10-17T12:00:00Z",
        "other",
        false,
      ],
      [
        "1-2위 맞대결 앞둔 뮌헨, 도르트문트 원정 떠난다",
        "ko",
        "interfootball-world",
        "2026-10-17T08:00:00Z",
        "other",
        false,
      ],
      [
        "김민재, 부상으로 2-3주 결장… 뮌헨 비상",
        "ko",
        "interfootball-world",
        "2026-10-17T18:00:00Z",
        "injury",
        false,
      ],
      [
        "Saka out for 4-6 weeks with hamstring injury",
        "en",
        "bbc-sport-football",
        "2026-10-17T18:00:00Z",
        "injury",
        false,
      ],
      [
        "Kane at the double as Bayern sink Dortmund",
        "en",
        "bbc-sport-european",
        "2026-10-17T18:00:00Z",
        "result",
        true,
      ],
      [
        "Arsenal down Chelsea to go top",
        "en",
        "bbc-sport-football",
        "2026-10-17T18:00:00Z",
        "result",
        true,
      ],
      [
        "이강인 1-2월 이적 가능성",
        "ko",
        "interfootball-world",
        "2026-10-17T18:00:00Z",
        "transfer",
        false,
      ],
    ];
    const analyses = items.map(([title, lang, source, at, cat, mr]) => {
      const a = analyze(title, lang, source, at);
      expect([a.cat, a.matchResult], title).toEqual([cat, mr]);
      return a;
    });
    // 'Nice goal from Kane as Bayern win' — Nice는 BBC European(4개 리그)의 대회로 확인되지 않아 팀 1개(경기 기사지만 두 팀이 아니라
    // 엔티티 열쇠가 없다)
    expect(analyses[11]!.teams).toEqual(["bayern-munchen"]);
    // 경기 전 기사의 스코어·순위 범위는 열쇠 스코어가 아니다
    expect(analyses[13]!.scores).toEqual([]);
    expect(analyses[14]!.scores).toEqual([]);
    const plan = planEntityMerges({
      fresh: analyses.map((a) => entityOf(a, a.earliestMs)),
    });
    expect(plan.merges).toEqual([]);
    expect(plan.stats.merged).toBe(0);
  });

  it("중요 4·5 — 결과 동사(주어가 있을 때) · 결과 구 표현은 '경기 결과'·spoiler", () => {
    const cases: Array<[string, string, string]> = [
      ["Bayern sink Dortmund in Der Klassiker", "en", "bbc-sport-european"],
      ["Arsenal down Chelsea to go top", "en", "bbc-sport-football"],
      ["Liverpool ease past Brentford", "en", "bbc-sport-football"],
      ["Man City brush aside Fulham", "en", "bbc-sport-football"],
      ["Spurs overcome Villa", "en", "bbc-sport-football"],
      ["Newcastle rally to stun Spurs", "en", "bbc-sport-football"],
      ["Real Madrid seal Clasico victory", "en", "bbc-sport-european"],
      ["Chelsea come from two goals down", "en", "bbc-sport-football"],
      ["Barcelona demolish Sevilla", "en", "bbc-sport-european"],
      ["Inter outclass Napoli", "en", "bbc-sport-european"],
      ["Leeds earn point at Anfield", "en", "bbc-sport-football"],
      ["Villa claim derby bragging rights", "en", "bbc-sport-football"],
      ["Milan stumble at Lecce", "en", "bbc-sport-european"],
      ["Juventus frenano a Lecce", "it", "di-marzio"],
      ["Il Napoli cade a Torino", "it", "di-marzio"],
      ["El Madrid se impone al Betis", "es", "relevo"],
      ["El Barça golea", "es", "relevo"],
      ["뮌헨, 도르트문트 원정서 웃었다", "ko", "interfootball-world"],
      ["이강인 PSG, 리옹에 덜미", "ko", "interfootball-world"],
      ["토트넘, 맨유와 1-1 무", "ko", "interfootball-world"],
      ["김민재 뮌헨, 도르트문트 잡았다", "ko", "interfootball-world"],
      ["리버풀 졌다", "ko", "interfootball-world"],
      ["황희찬 결장… 울브스 패", "ko", "interfootball-world"],
    ];
    for (const [title, lang, source] of cases) {
      const a = analyze(title, lang, source);
      expect([a.cat, a.spoiler], title).toEqual(["result", true]);
    }
    // 주어가 없으면 다른 뜻 — 'down'·'sink'·'패스'
    expect(
      analyze("Prices down as fans sink into gloom", "en", "bbc-sport-football")
        .cat,
    ).not.toBe("result");
    expect(
      analyze("정교한 패스 돋보였다", "ko", "interfootball-world").cat,
    ).toBe("other");
  });

  it("'프리뷰' ≠ '리뷰', 'PREVIEW' ≠ 'REVIEW' — 경기 전 기사는 결과가 아니다", () => {
    for (const title of [
      "[EPL 프리뷰] 아스널 vs 첼시, 선두 다툼",
      "[PL PREVIEW] 아스널-첼시",
      "[분데스 프리뷰] 뮌헨-도르트문트 '데어 클라시커'",
    ]) {
      expect(analyze(title, "ko", "interfootball-world").cat, title).not.toBe(
        "result",
      );
    }
    expect(
      analyze("[UCL 리뷰] 레알 2-1 승", "ko", "interfootball-world").cat,
    ).toBe("result");
  });

  it("권장 — 'eliminatorias de la Champions'·'il ct del Milan'·'Thuram convocato'는 대표팀이 아니다, 'called up to England squad'는 대표팀", () => {
    const nat = (t: string, lang: string, clubTeams: number) =>
      isNationalText(textSignals(t, lang), clubTeams);
    expect(
      nat("El Real Madrid y las eliminatorias de la Champions", "es", 1),
    ).toBe(false);
    expect(
      nat("El Real Madrid y las eliminatorias de la Champions", "es", 0),
    ).toBe(false);
    expect(nat("Il ct del Milan? No, l'allenatore", "it", 0)).toBe(false);
    expect(nat("Inter, Thuram convocato", "it", 0)).toBe(false);
    expect(nat("Arsenal's Saka called up to England squad", "en", 1)).toBe(
      true,
    );
  });

  it("중요 6 — 숫자 범위(뒤에 단위어)는 스코어가 아니다", () => {
    expect(titleScores("김민재, 부상으로 2-3주 결장", "ko")).toEqual([]);
    expect(titleScores("Saka out for 4-6 weeks", "en")).toEqual([]);
    expect(titleScores("이강인 1-2월 이적 가능성", "ko")).toEqual([]);
    expect(titleScores("1-2위 맞대결 앞둔 뮌헨", "ko")).toEqual([]);
    expect(titleScores("2-3경기 결장 전망", "ko")).toEqual([]);
    expect(titleScores("Out for 2-3 months", "en")).toEqual([]);
    // 띄어 쓴 말·조사는 스코어 그대로
    expect(titleScores("PSG, 맨시티에 4-2 승리", "ko")).toEqual(["2-4"]);
    expect(titleScores("2-0 일방적 승리", "ko")).toEqual(["0-2"]);
    expect(titleScores("맨시티, 2-4로 참패", "ko")).toEqual(["2-4"]);
  });

  it("차단 2 — 국내 축구 기사의 낱말 경계(부분 문자열 함정) · 국내 사전 팀 태그는 축구 외 판정의 남기는 근거", () => {
    const keep = [
      "김민재가 수비 리더로 우뚝",
      "'괴물' 김민재가 수비진 지휘했다",
      "이강인, 다음 원정서 선발 복귀 유력",
      "설영우, 시즌 처음 원정 선발 출격",
      "이강인, 경기 후 방송 인터뷰서 '최선 다했다'",
      "황희찬, 전술 변화 보여준 울브스",
      "케인 헤더 골, 프라이부르크 격파",
      "음바페 결승골 프랑스 리그1 선두",
      "케인 1골 프랑크푸르트 원정 승리",
      "대표팀, 파라과이전 북중미 원정 대비",
      "홀란, 리버풀전 북런던 원정 앞둬",
      '엔리케 감독 "해당 구단과 협상 중"',
      "'김민재 동료' 우파메카노, 해당 구단 관심",
      "'돌파 주목' 이강인, PSG 선발",
      "양민혁, 포츠머스 데뷔골",
      "[해외축구] 손흥민 LAFC 2골",
    ];
    for (const title of keep) {
      expect(
        scopeExclusion({ title, lang: "ko", summary: null }, ctx),
        title,
      ).toBeNull();
    }
    // 라틴 약한 다른 종목 표현(golf)은 팀 태그·축구 표현이 남기는 근거
    for (const title of [
      "Arteta's side face golf-course style pitch",
      "Man Utd squad enjoy golf day before derby",
    ]) {
      expect(
        scopeExclusion({ title, lang: "en", summary: null }, ctx),
        title,
      ).toBeNull();
    }
  });

  it("결정 ③ — 대표팀 강한 표현(모레노호·대표팀 명단)은 K리그 표현이 있어도 남긴다, K리그 시상·구단 소식은 뺀다", () => {
    for (const title of [
      "모레노호, K리그 선수 3명 발탁",
      "모레노호 명단 발표…K리그서 5명",
    ]) {
      expect(
        scopeExclusion({ title, lang: "ko", summary: null }, ctx),
        title,
      ).toBeNull();
    }
    expect(
      scopeExclusion(
        {
          title: "[오피셜] 서울 클리말라, K리그 9월 이달의 선수상 차지",
          lang: "ko",
          summary: null,
        },
        ctx,
      ),
    ).toBe("k-league");
  });

  it("중요 2 — 동명이인 연예(배우 김지수·가수 정우영)는 빼고 kr을 주지 않는다, 축구 문맥(데뷔전·풀타임·선발)이면 남긴다", () => {
    for (const title of [
      "배우 김지수, 새 드라마 '봄날' 주연 발탁",
      "김지수, 21일 첫 방송 앞두고 소감",
      "정우영, 첫 단독 팬사인회 성료",
      "'트로트 가수' 정우영 신곡",
      "김지수 출연 '나 혼자 산다' 화제",
      "정우영 배우, 연극 무대 복귀",
    ]) {
      expect(
        scopeExclusion({ title, lang: "ko", summary: null }, ctx),
        title,
      ).toBe("entertainment");
      // 제외를 빠져나가도(예: 규칙이 바뀌어) kr·선수 태그는 주지 않는다 — 축구 근거가 없는 등록 선수 이름
      const a = analyze(title, "ko", "interfootball-all");
      expect([a.kr, a.players], title).toEqual([false, []]);
    }
    for (const title of [
      "김지수, 브렌트포드 데뷔전 풀타임",
      "정우영, 우니온 베를린서 선발",
    ]) {
      expect(
        scopeExclusion({ title, lang: "ko", summary: null }, ctx),
        title,
      ).toBeNull();
      expect(analyze(title, "ko", "interfootball-world").kr, title).toBe(true);
    }
  });

  it("중요 7 — Relevo는 링크 경로가 정한다(/futbol/ 밖이면 축구 외, /futbol/이면 제목의 다른 종목 표현으로 빼지 않는다)", () => {
    const relevo = (title: string, url: string) =>
      scopeExclusion(
        { title, lang: "es", summary: null, source: "relevo", url },
        ctx,
      );
    expect(
      relevo(
        "Eagles-Jaguars en Tottenham",
        "https://www.relevo.com/nfl/eagles-jaguars.html",
      ),
    ).toBe("non-football");
    expect(
      relevo(
        "Herrera busca su título en Jerez",
        "https://www.relevo.com/motor/herrera-jerez.html",
      ),
    ).toBe("non-football");
    expect(
      relevo(
        "Mbappé, el Real Madrid y la NBA: el futuro",
        "https://www.relevo.com/futbol/mbappe-nba.html",
      ),
    ).toBeNull();
    // 링크가 없거나 다른 호스트면 제목 규칙(강한 표현 NBA + 라틴 팀 이름은 근거 아님)
    expect(
      scopeExclusion(
        {
          title: "Mbappé, el Real Madrid y la NBA: el futuro",
          lang: "es",
          summary: null,
        },
        ctx,
      ),
    ).toBe("non-football");
  });
});

// ─── M1-17 재리뷰(2차) 회귀 ─────────────────────────────────────────────────
//
// scratchpad/probe2(merge·classify·classify2·compound·scope·scope3)의 재현 제목을 그대로 고정한다.
//   - 차단 1(D42 잘못 합치기 A~F·K): 스코어 없는 기사는 D42 대상이 아니다(오케스트레이터 결정 — 국내·해외 같다, 오늘 카드 경로도 붙는 쪽
//     스코어 필요), 이적·추첨·발언·회담 구('turn down'·'cup draw'·'play down'·'track down'·'hold … talks')는 결과가 아니다, 유소년·2군
//     팀('Arsenal U21')은 1군 태그가 아니다
//   - 중요 1(D47 ②): 조 추첨·컵 추첨은 결과가 아니다(UCL 조 추첨 → UCL, 컵 추첨 → 기타)
//   - 중요 2: 조사로 시작하는 표현('을 격파'·'로 부상')이 맞지 않던 것 — '격파'는 낱말로, '로 부상'(떠오르다)은 정규식 제외로
//   - 중요 3: 붙여 쓴 합성어(프로야구·여자배구·남자골프·무릎부상·완전이적·전격영입)
//   - 중요 4: 동명이인 확인 선수(김지수·정우영)만 축구 근거를 요구 — 다른 등록 선수는 이름만으로 kr, 점수화 한국 선수 배수와 같은 기준
//   - 중요 5: K리그 표현이 있어도 대표팀 기사(발탁·소집·명단)는 남긴다(tests/news-scope.test.ts에도)
//   - 중요 6: 'edge closer'·'shut down'·'팬들에게 웃었다'·'잡았다…재계약'은 결과가 아니다
//   - 권장 1·3: 겹치는 별칭 두 개 + 스코어('Valencia 1-1 Sevilla'), 'ahead of'는 강한 승패 표현·스코어를 지우지 않는다, 'Euroleague'
describe.each([
  ["현재 사전", ctxOf(NAMES)],
  ["사전 + 별칭 확장 흉내", ctxOf(namesWithExtras(NAMES))],
] as const)("M1-17 재리뷰(2차) 회귀 — %s", (_label, ctx) => {
  type Row = [title: string, lang: string, source: string, at: string];
  const analyzeRow = ([title, lang, source, at]: Row) =>
    analyzeItems(
      [{ title, lang, summary: null, sources: [source], publishedAt: at }],
      ctx,
    );
  const analyze = (title: string, lang: string, source: string) =>
    analyzeRow([title, lang, source, "2026-10-17T18:00:00Z"]);
  const planOf = (
    rows: Row[],
    today: Array<Parameters<typeof todayCardEntity>[0] & { id: string }> = [],
  ) => {
    const analyses = rows.map(analyzeRow);
    return {
      analyses,
      plan: planEntityMerges({
        fresh: analyses.map((a) => entityOf(a, a.earliestMs)),
        today: today.map((c) => ({
          cardId: c.id,
          key: todayCardEntity(c, ctx.keywords.managers),
        })),
      }),
    };
  };

  it("차단 1 — A~E: 결과 기사 + 같은 두 팀의 이적·추첨·발언·회담 기사는 합치지 않는다(뒤 기사는 '경기 결과'도 아니다)", () => {
    const scenarios: Array<[Row, Row, string]> = [
      [
        [
          "Arsenal 2-1 Chelsea: Saka late winner",
          "en",
          "bbc-sport-football",
          "2026-10-17T19:30:00Z",
        ],
        [
          "Chelsea turn down Arsenal approach for Palmer",
          "en",
          "the-athletic-football",
          "2026-10-17T22:00:00Z",
        ],
        "A",
      ],
      [
        [
          "Arsenal 2-1 Liverpool: Gyokeres scores twice",
          "en",
          "bbc-sport-premier-league",
          "2026-10-17T19:30:00Z",
        ],
        [
          "Carabao Cup fourth-round draw: Arsenal v Liverpool",
          "en",
          "bbc-sport-football",
          "2026-10-17T21:30:00Z",
        ],
        "B",
      ],
      [
        [
          "Liverpool 1-2 Man City: Haaland double",
          "en",
          "bbc-sport-premier-league",
          "2026-10-17T18:00:00Z",
        ],
        [
          "Man City play down Liverpool rivalry",
          "en",
          "bbc-sport-football",
          "2026-10-17T21:00:00Z",
        ],
        "C",
      ],
      [
        [
          "Liverpool 3-0 Chelsea",
          "en",
          "bbc-sport-premier-league",
          "2026-10-17T18:00:00Z",
        ],
        [
          "Liverpool track down Chelsea target",
          "en",
          "espn-soccer",
          "2026-10-17T21:00:00Z",
        ],
        "D",
      ],
      [
        [
          "Arsenal 2-1 Chelsea",
          "en",
          "bbc-sport-premier-league",
          "2026-10-17T18:00:00Z",
        ],
        [
          "Arsenal to hold fresh talks with Chelsea over Palmer",
          "en",
          "espn-soccer",
          "2026-10-17T21:00:00Z",
        ],
        "E",
      ],
    ];
    for (const [result, other, name] of scenarios) {
      const { analyses, plan } = planOf([result, other]);
      expect([plan.merges, plan.attach], name).toEqual([[], []]);
      expect(plan.stats.merged, name).toBe(0);
      expect(analyses[0]!.cat, name).toBe("result");
      expect(analyses[1]!.cat, name).not.toBe("result");
      expect(analyses[1]!.matchResult, name).toBe(false);
      // 두 팀 태그는 그대로(태그가 빠져서 안 합쳐진 것이 아니다)
      expect(analyses[1]!.teams, name).toHaveLength(2);
    }
  });

  it("차단 1 — F: 오늘 결과 카드에 스코어 없는 같은 두 팀 기사(이적)를 출처로 붙이지 않는다, 스코어 같은 결과 기사는 붙인다", () => {
    const card = {
      id: "c_0123456789",
      t: "Arsenal 2-1 Chelsea: Saka late winner",
      lang: "en",
      teams: ["arsenal", "chelsea"],
      cat: "result" as const,
      src: [
        {
          n: "BBC Sport",
          u: "https://www.bbc.co.uk/sport/football/articles/x",
          at: "2026-10-17T19:30:00Z",
          tier: 2 as const,
        },
      ],
    };
    const transfer = planOf(
      [
        [
          "Chelsea turn down Arsenal approach for Palmer",
          "en",
          "the-athletic-football",
          "2026-10-17T22:00:00Z",
        ],
      ],
      [card],
    );
    expect([transfer.plan.merges, transfer.plan.attach]).toEqual([[], []]);
    // 붙는 쪽에 스코어가 없으면(결과 동사만) 붙이지 않는다
    const noScore = planOf(
      [
        [
          "Arsenal beat Chelsea in derby",
          "en",
          "bbc-sport-football",
          "2026-10-17T22:00:00Z",
        ],
      ],
      [card],
    );
    expect(noScore.plan.attach).toEqual([]);
    const same = planOf(
      [
        [
          "Chelsea fall to 2-1 defeat at Arsenal",
          "en",
          "espn-soccer",
          "2026-10-17T22:00:00Z",
        ],
      ],
      [card],
    );
    expect(same.plan.attach).toEqual([{ cardId: "c_0123456789", fresh: [0] }]);
  });

  it("차단 1 — K: 유소년·2군 팀('Arsenal U21'·'Real Madrid Castilla')은 1군 팀 태그가 아니다 → 1군 경기와 합치지 않는다", () => {
    const { analyses, plan } = planOf([
      [
        "Arsenal 2-1 Chelsea",
        "en",
        "bbc-sport-premier-league",
        "2026-10-17T12:00:00Z",
      ],
      [
        "Arsenal U21 2-1 Chelsea U21",
        "en",
        "bbc-sport-football",
        "2026-10-17T18:00:00Z",
      ],
    ]);
    expect(analyses[1]!.teams).toEqual([]);
    expect(plan.merges).toEqual([]);
    const tags = (title: string, lang = "en") =>
      matchTitleTags(title, lang, ctx.tags).teams.map((t) => t.slug);
    expect(tags("Arsenal Under-21s beat Chelsea Under-21s")).toEqual([]);
    expect(tags("Real Madrid Castilla 1-0 Ponferradina")).toEqual([]);
    expect(tags("Bayern II held by Dortmund II")).toEqual([]);
    expect(tags("Barcelona B 2-0 Real Madrid B")).toEqual([]);
    expect(tags("레알 마드리드 카스티야, 2군 리그 선두", "ko")).toEqual([]);
    expect(tags("아스널 U-21 2-1 첼시 U-21", "ko")).toEqual([]);
    // 유소년 팀 표기가 아닌 다른 자리의 1군 팀은 그대로
    expect(tags("Chelsea sign Arsenal U21 striker")).toEqual(["chelsea"]);
    expect(tags("Arsenal beat Chelsea 2-1")).toEqual(["arsenal", "chelsea"]);
    expect(tags("아스널, BBC 인터뷰서 첼시 언급", "ko")).toEqual([
      "arsenal",
      "chelsea",
    ]);
  });

  it("차단 1 — 양성 대조: 같은 두 팀 + 같은 스코어 + 12시간 이내 경기 기사끼리는 합친다(국내·해외 각각)", () => {
    const latin = planOf([
      [
        "Arsenal 2-1 Chelsea: Saka late winner",
        "en",
        "bbc-sport-football",
        "2026-10-17T19:30:00Z",
      ],
      [
        "Chelsea fall to 2-1 defeat at Arsenal",
        "en",
        "espn-soccer",
        "2026-10-17T21:00:00Z",
      ],
    ]);
    expect(latin.plan.merges).toEqual([[0, 1]]);
    const ko = planOf([
      [
        "김민재 풀타임, 뮌헨 도르트문트에 2-1 승리",
        "ko",
        "interfootball-world",
        "2026-10-17T20:00:00Z",
      ],
      [
        "뮌헨, 도르트문트 2-1 꺾고 선두 질주",
        "ko",
        "besteleven-world",
        "2026-10-17T21:00:00Z",
      ],
    ]);
    expect(ko.plan.merges).toEqual([[0, 1]]);
  });

  // M1-17 3차 리뷰: 추첨 제목도 spoiler는 true다(spoiler는 draw를 지우지 않은 원제목으로 본다 — 추첨 판정이 틀려도 진짜 무승부가 가려지지
  // 않게, 보수적). 이전 단언 spoiler false → true로 바꿨다. 카테고리·D42 병합 대상에서만 draw를 지운다
  it("중요 1 — 조 추첨·컵 추첨은 '경기 결과'·병합 대상이 아니다(D47 ②: UCL 조 추첨 → UCL 칩, 컵 추첨 → 기타, spoiler는 보수적으로 true), 무승부는 그대로 결과", () => {
    const cases: Array<[string, string, string]> = [
      [
        "Champions League draw: Arsenal face Bayern",
        "bbc-sport-champions-league",
        "ucl",
      ],
      [
        "Champions League play-off draw: Celtic face Bayern",
        "bbc-sport-champions-league",
        "ucl",
      ],
      [
        "FA Cup third-round draw: Man Utd host Arsenal",
        "bbc-sport-football",
        "other",
      ],
      [
        "Carabao Cup fourth-round draw: Arsenal v Liverpool",
        "bbc-sport-football",
        "other",
      ],
    ];
    for (const [title, source, cat] of cases) {
      expect(isDrawLottery(title), title).toBe(true);
      const a = analyze(title, "en", source);
      expect([a.cat, a.spoiler, a.matchResult], title).toEqual([
        cat,
        true,
        false,
      ]);
    }
    for (const title of [
      "Viking snatch draw against Bayern Munich",
      "Arsenal held to Champions League draw by PSG",
      "Brentford and Fulham play out goalless draw",
    ]) {
      expect(isDrawLottery(title), title).toBe(false);
      expect(analyze(title, "en", "bbc-sport-football").cat, title).toBe(
        "result",
      );
    }
  });

  it("중요 2 — '격파'(조사 뒤·띄어 씀)는 결과, '(으)로 부상'(떠오르다)은 부상이 아니다 — 다친 문맥('부상을 당해')은 부상", () => {
    for (const title of [
      "PSG, 리옹을 격파",
      "뮌헨, 도르트문트를 격파…김민재 풀타임",
      "토트넘, 맨유 격파",
      "PSG, 리옹을 격파했다",
    ]) {
      const a = analyze(title, "ko", "interfootball-world");
      expect([a.cat, a.spoiler], title).toEqual(["result", true]);
    }
    for (const title of [
      "차기 사령탑 후보로 부상",
      "이강인, PSG 핵심으로 부상",
      "김민재, 뮌헨 핵심 자원으로 부상했다",
    ]) {
      expect(analyze(title, "ko", "interfootball-world").cat, title).not.toBe(
        "injury",
      );
    }
    for (const title of [
      "김민재, 거친 태클로 부상을 당해",
      "김민재, 부상으로 이탈",
      "이강인 부상 복귀",
    ]) {
      expect(analyze(title, "ko", "interfootball-world").cat, title).toBe(
        "injury",
      );
    }
  });

  it("중요 3 — 붙여 쓴 합성어: 다른 종목(프로야구·여자배구·남자골프·프로당구)은 제외, 부상·이적 합성어는 그 카테고리, 1차 리뷰 띄어 쓴 사례는 그대로", () => {
    for (const title of [
      "프로야구 LG 우승",
      "프로배구 대한항공 개막전 승리",
      "여자배구 흥국생명 김연경 은퇴식",
      "남자농구 국가대표 아시아컵",
      "남자골프 세계 1위 셰플러 우승",
      "여자골프 국가대표 선발전",
      "프로당구 PBA 투어 개막",
    ]) {
      expect(
        scopeExclusion({ title, lang: "ko", summary: null }, ctx),
        title,
      ).toBe("non-football");
    }
    for (const title of [
      "케인 헤더 골, 프라이부르크 격파",
      '엔리케 감독 "해당 구단과 협상 중"',
      "케인 헤더 골 프라이부르크 원정 승리",
      "토트넘 선수단, 골프 라운딩",
    ]) {
      expect(
        scopeExclusion({ title, lang: "ko", summary: null }, ctx),
        title,
      ).toBeNull();
    }
    expect(
      analyze("김민재, 무릎부상으로 이탈", "ko", "interfootball-world").cat,
    ).toBe("injury");
    expect(
      analyze("황희찬 발목부상 회복", "ko", "interfootball-world").cat,
    ).toBe("injury");
    expect(
      analyze("이강인, 완전이적 임박", "ko", "interfootball-world").cat,
    ).toBe("transfer");
    expect(
      analyze("토트넘, 깜짝이적 추진", "ko", "interfootball-world").cat,
    ).toBe("transfer");
    expect(
      analyze("맨유, 전격영입 발표", "ko", "interfootball-world").cat,
    ).toBe("transfer");
    // 부상을 합성어 안에서 통째로 맞추지 않는다('세부상황')
    expect(
      analyze("토트넘, 세부상황 공개", "ko", "interfootball-world").cat,
    ).not.toBe("injury");
  });

  it("중요 4 — 동명이인 확인 선수(김지수·정우영)만 축구 근거를 요구한다: 다른 등록 선수는 이름만으로 kr·선수 태그", () => {
    expect([...KOREAN_HOMONYM_PLAYERS].sort()).toEqual([
      "jeong-woo-yeong",
      "kim-ji-soo",
    ]);
    const cases: Array<[string, string]> = [
      ["'괴물' 김민재", "kim-min-jae"],
      ["이강인 근황", "lee-kang-in"],
      ["김민재, 무릎부상으로 이탈", "kim-min-jae"],
      ["황희찬 발목부상 회복", "hwang-hee-chan"],
      ["이강인, 완전이적 임박", "lee-kang-in"],
    ];
    for (const [title, slug] of cases) {
      const a = analyze(title, "ko", "interfootball-world");
      expect([a.kr, a.players.includes(slug), a.korean], title).toEqual([
        true,
        true,
        [slug],
      ]);
    }
    // 동명이인은 그대로 — 축구 근거가 없으면 kr·선수 태그 없음, 근거가 있으면 kr
    expect(analyze("김지수의 성장", "ko", "interfootball-all").kr).toBe(false);
    expect(analyze("정우영 근황", "ko", "interfootball-all").kr).toBe(false);
    expect(
      analyze("김지수, 브렌트포드 데뷔전 풀타임", "ko", "interfootball-world")
        .kr,
    ).toBe(true);
    // 다른 등록 선수가 함께 나오면 근거
    expect(
      analyze("김민재·김지수 맞대결", "ko", "interfootball-world").korean,
    ).toEqual(expect.arrayContaining(["kim-ji-soo", "kim-min-jae"]));
  });

  it("중요 4 — 점수화 한국 선수 배수는 분류 kr과 같은 기준(score.ts `koreanPlayers` ← 분석 `korean`)", () => {
    const item = (title: string) => ({
      key: title,
      item: {
        title,
        url: `https://example.com/${encodeURIComponent(title)}`,
        publishedAt: "2026-10-17T10:00:00.000Z",
        summary: null,
        source: "interfootball-all",
        author: null,
        authors: [],
        lang: "ko",
      },
      sources: ["interfootball-all"],
      count: 1,
    });
    const now = "2026-10-17T12:00:00.000Z";
    for (const [title, korean] of [
      ["김지수의 성장", []],
      ["'괴물' 김민재", ["kim-min-jae"]],
    ] as const) {
      const cluster = { members: [item(title)], publishers: ["인터풋볼"] };
      const analysis = analyzeItems(
        [
          {
            title,
            lang: "ko",
            summary: null,
            sources: ["interfootball-all"],
            publishedAt: now,
          },
        ],
        ctx,
      );
      const signals = clusterSignals(cluster, {
        now,
        sourceById: SOURCE_BY_ID,
        keywords: ctx.keywords,
        koreanPlayers: () => analysis.korean,
      });
      expect([signals.koreanPlayers, analysis.kr], title).toEqual([
        korean,
        korean.length > 0,
      ]);
    }
    // 분석이 없으면(분류 단계 실패 — 최소 분류) 제목 키워드 그대로
    expect(
      clusterSignals(
        { members: [item("김지수의 성장")], publishers: ["인터풋볼"] },
        {
          now,
          sourceById: SOURCE_BY_ID,
          keywords: ctx.keywords,
          koreanPlayers: () => undefined,
        },
      ).koreanPlayers,
    ).toEqual(["kim-ji-soo"]);
  });

  it("중요 5 — 대표팀 발탁·소집 기사는 K리그 선수 이야기라도 대표팀(분류·범위 판정이 같다)", () => {
    for (const title of [
      "K리그 MVP 이동경, 대표팀 발탁",
      "K리그 득점왕 주민규, 국가대표 재발탁",
      "파라과이전 앞둔 대표팀, K리그 선수 중용",
    ]) {
      expect(
        scopeExclusion({ title, lang: "ko", summary: null }, ctx),
        title,
      ).toBeNull();
      expect(analyze(title, "ko", "interfootball-all").cat, title).toBe(
        "national",
      );
    }
  });

  it("중요 6 — 주어가 있어도 결과가 아닌 구('edge closer'·'shut down'·'팬들에게 웃었다'·'잡았다…재계약'), 결과 구는 그대로", () => {
    const notResult: Array<[string, string, string?]> = [
      ["Arsenal edge closer to title", "en"],
      ["Arsenal edge closer to Liverpool in title race", "en"],
      ["Liverpool shut down Salah exit rumours", "en"],
      ["Arsenal back down in Saka contract talks", "en"],
      ["Guardiola plays down Arsenal title talk", "en"],
      // 'Arsenal hold Chelsea talks over Palmer'는 뺐다(M1-17 3차 리뷰 — hold 바로 뒤가 팀 이름이면 결과로 본다: 'Liverpool hold Arsenal as
      // title talks heat up'의 spoiler를 지키는 쪽. 스코어가 없어 D42 병합 대상은 아니다)
      ["Chelsea on the edge of crisis", "en"],
      ["김민재, 팬들에게 웃었다", "ko"],
      ["리버풀, 살라 잡았다…재계약", "ko", "club"],
    ];
    for (const [title, lang, cat] of notResult) {
      const a = analyze(
        title,
        lang,
        lang === "ko" ? "interfootball-world" : "bbc-sport-football",
      );
      expect(a.cat, title).not.toBe("result");
      if (cat) expect(a.cat, title).toBe(cat);
    }
    const result: Array<[string, string]> = [
      ["Liverpool hold Arsenal in thriller", "en"],
      ["Tottenham held by Chelsea", "en"],
      ["Arsenal edge Chelsea in derby", "en"],
      ["Liverpool hold on to beat Arsenal", "en"],
      ["뮌헨, 도르트문트 원정서 웃었다", "ko"],
      ["토트넘, 아스널 잡았다", "ko"],
    ];
    for (const [title, lang] of result) {
      const a = analyze(
        title,
        lang,
        lang === "ko" ? "interfootball-world" : "bbc-sport-football",
      );
      expect([a.cat, a.spoiler], title).toEqual(["result", true]);
    }
    // 주어 없는 'hold'는 결과가 아니다('Fans hold protest')
    expect(
      analyze("Fans hold protest outside stadium", "en", "bbc-sport-football")
        .cat,
    ).not.toBe("result");
  });

  it("권장 1 — 같은 리그의 겹치는 별칭 둘이 스코어를 사이에 두면 서로가 확인 근거(BBC European 실데이터 꼴), 스코어가 없으면 아니다", () => {
    const cases: Array<[string, string[]]> = [
      ["Valencia 1-1 Sevilla", ["valencia", "sevilla"]],
      ["Roma 1-0 Torino", ["as-roma", "torino"]],
      ["Monaco 0-0 Nice", ["as-monaco", "ogc-nice"]],
      ["Lens 2-1 Brest", ["racing-club-de-lens", "stade-brestois-29"]],
      ["Roma-Torino 1-0", ["as-roma", "torino"]],
    ];
    for (const [title, teams] of cases) {
      const a = analyze(title, "en", "bbc-sport-european");
      expect([a.teams, a.cat], title).toEqual([teams, "result"]);
    }
    for (const title of [
      "Valencia and Sevilla fans unite",
      "Monaco GP: Nice weather expected",
    ]) {
      expect(analyze(title, "en", "bbc-sport-european").teams, title).toEqual(
        [],
      );
    }
    // 다른 리그 별칭 둘(Porto — 5대 리그 밖, Valencia)은 근거가 아니다
    expect(
      analyze("Porto 2-1 Valencia", "en", "bbc-sport-european").teams,
    ).toEqual([]);
  });

  it("권장 3 — 'ahead of'는 스코어·강한 승패 표현을 지우지 않는다(약한 표현 win·draw만), 'Euroleague'는 축구 외", () => {
    expect(
      analyze(
        "Arsenal beat Chelsea ahead of UCL clash",
        "en",
        "bbc-sport-football",
      ).cat,
    ).toBe("result");
    expect(
      analyze(
        "Arsenal 2-1 Chelsea ahead of UCL clash",
        "en",
        "bbc-sport-football",
      ).cat,
    ).toBe("result");
    expect(
      analyze("Arsenal seek win ahead of UCL clash", "en", "bbc-sport-football")
        .cat,
    ).not.toBe("result");
    expect(
      analyze("Saka fit ahead of Chelsea clash", "en", "bbc-sport-football")
        .cat,
    ).not.toBe("result");
    // 경기 전 약한 표현이 있으면 D42 병합 대상은 아니다(지난 경기 회고 스코어일 수 있다)
    expect(
      analyze(
        "Arsenal 2-1 Chelsea ahead of UCL clash",
        "en",
        "bbc-sport-football",
      ).matchResult,
    ).toBe(false);
    expect(
      scopeExclusion(
        {
          title: "Real Madrid beat Barcelona in Euroleague",
          lang: "en",
          summary: null,
        },
        ctx,
      ),
    ).toBe("non-football");
  });
});

// ─── 실데이터 — 등록 선수 kr 손실 0 ──────────────────────────────────────────

describe("실데이터 — 등록 한국 선수 이름이 든 제목은 kr을 잃지 않는다(동명이인 확인 선수 빼고, M1-17 재리뷰)", () => {
  const ctx = ctxOf(NAMES);
  const sample = readJson("fixtures/cluster/titles-2026-10-15.json") as {
    items: Array<{
      id: string;
      source: string;
      lang: string;
      publishedAt: string;
      title: string;
    }>;
  };

  it("fixtures/cluster window·older: 범위 안 제목의 등록 선수(동명이인 확인 선수 제외)는 모두 kr·선수 태그", () => {
    let checked = 0;
    const lost: string[] = [];
    for (const it of sample.items) {
      if (
        scopeExclusion(
          { title: it.title, lang: it.lang, summary: null, source: it.source },
          ctx,
        )
      )
        continue;
      const slugs = matchTitles([it], ctx.keywords).koreanPlayers.filter(
        (s) => !KOREAN_HOMONYM_PLAYERS.has(s),
      );
      if (slugs.length === 0) continue;
      checked += 1;
      const a = analyzeItems(
        [
          {
            title: it.title,
            lang: it.lang,
            summary: null,
            sources: [it.source],
            publishedAt: it.publishedAt,
          },
        ],
        ctx,
      );
      if (!a.kr || !slugs.every((s) => a.players.includes(s)))
        lost.push(`${it.id} ${it.title}`);
    }
    expect(lost).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  });
});

// ─── M1-17 3차 리뷰 회귀 ─────────────────────────────────────────────────────
//
// scratchpad/probe3(r3·r3b·r3c·r3d·r3e)의 재현 제목을 고정한다.
//   - 중요 1(2차 반영 회귀): 추첨 표현 지우기·'hold * talks'가 진짜 무승부·결과의 spoiler를 지웠다 → spoiler는 원제목으로, 추첨 판정은
//     대회 이름 + draw + 쌍점·추첨 말 그리고 무승부 문맥(held·earn·play out·goalless) 없음, hold 회담 제외는 꾸밈말 목록만
//   - 중요 2(2차 반영 회귀): 합성어 종목(koInfix '배구'·'당구')이 '지배구조'·'배당구조'·'해당구단'에 맞았다 → 앞말 + 종목으로만
//   - 중요 3: 직업 명사가 붙은 이름('배우 김민재')은 그 선수가 아니다, '데뷔'는 축구 꼴로만, 연예 표현이 함께면 일반 문맥어('출전')는 근거 아님
//   - 중요 4: 국내 승패 동사(완파·대파·격침·이겼다·비겨·비기며·비긴·패하며·패해·고배·첫 승 / 주어 필요: 잡고·누르고·눌렀다·제치고·지고·
//     이기고·물리쳐·쓴맛)
//   - 권장: 유소년 접미 오탐('reserve keeper'·쌍점 뒤 'U21'·'B조'·'B플랜'), 국내 '앞둔' = 약한 경기 전 표현, 'shut out'·'turn the
//     tables on'·'go top', 'Euroliga'(영어 제목)
describe.each([
  ["현재 사전", ctxOf(NAMES)],
  ["사전 + 별칭 확장 흉내", ctxOf(namesWithExtras(NAMES))],
] as const)("M1-17 3차 리뷰 회귀 — %s", (_label, ctx) => {
  const analyze = (title: string, lang: string, source: string) =>
    analyzeItems(
      [
        {
          title,
          lang,
          summary: null,
          sources: [source],
          publishedAt: "2026-10-17T18:00:00Z",
        },
      ],
      ctx,
    );
  const scope = (title: string, lang = "ko") =>
    scopeExclusion({ title, lang, summary: null }, ctx);

  it("중요 1 — 무승부 결과('held to FA Cup draw'·'league phase draw')와 'hold <팀> … talks'는 결과·spoiler, 추첨 판정이 아니다", () => {
    for (const title of [
      "Man Utd held to FA Cup draw by Leeds",
      "Arsenal held to goalless FA Cup draw",
      "Real Madrid held to league phase draw by Club Brugge",
      "Celtic held to Champions League play-off draw",
      "Spurs earn last-16 draw at Leipzig",
      "Leeds and Chelsea play out FA Cup draw",
      "Chelsea held to fourth-round draw by Leeds",
    ]) {
      expect(isDrawLottery(title), title).toBe(false);
      const a = analyze(title, "en", "bbc-sport-football");
      expect([a.cat, a.spoiler], title).toEqual(["result", true]);
    }
    for (const title of [
      "Liverpool hold Arsenal as title talks heat up",
      "Newcastle hold Chelsea as Howe talks up top-four bid",
      "Liverpool hold Arsenal as Slot talks up title",
    ]) {
      const a = analyze(title, "en", "bbc-sport-football");
      expect([a.cat, a.spoiler], title).toEqual(["result", true]);
    }
    // 회담을 '여는' hold(꾸밈말 목록)는 여전히 결과가 아니다
    for (const title of [
      "Arsenal to hold fresh talks with Chelsea over Palmer",
      "Chelsea hold talks over midfielder",
      "Arsenal held further contract talks with Saka",
    ]) {
      expect(analyze(title, "en", "bbc-sport-football").cat, title).not.toBe(
        "result",
      );
    }
  });

  it("중요 2 — 종목 이름을 합성어 안에서 통째로 맞추지 않는다('지배구조'·'배당구조'·'해당구단'), 앞말 + 종목('프로야구')은 제외", () => {
    for (const title of [
      '엔리케 감독 "해당구단과 협상 중"',
      '해당구단 측 "사실무근"',
      "UEFA, 다중 구단 지배구조 규정 손본다",
      "멀티클럽 지배구조 논란",
      "이적료 배당구조 논란",
      "맨유, 랫클리프 체제 지배구조 개편",
      // 1차 리뷰 사례(띄어 쓴 '골 프라이부르크'·'해당 구단') 재발 없음
      "케인 헤더 골, 프라이부르크 격파",
      '엔리케 감독 "해당 구단과 협상 중"',
      "토트넘 선수단, 골프장서 휴식",
    ]) {
      expect(scope(title), title).toBeNull();
    }
    for (const title of [
      "프로야구 LG 우승",
      "여자배구 흥국생명 김연경 은퇴식",
      "남자골프 세계 1위 셰플러 우승",
      "프로당구 PBA 투어 개막",
      "'불꽃야구2', 파이터즈 vs. 부산고, 먼저 웃을 팀은?",
    ]) {
      expect(scope(title), title).toBe("non-football");
    }
  });

  it("중요 3 — 직업 명사가 붙은 이름·연예 문맥의 '데뷔'·'출전'은 등록 선수가 아니다(kr·선수 태그 없음), 축구 꼴('데뷔전'·'1군 데뷔')은 그 선수", () => {
    for (const title of [
      "가수 정우영, 데뷔 앨범 발매",
      "정우영, 솔로 데뷔",
      "배우 김지수, 데뷔 30주년",
      "김지수, 연극 무대 데뷔",
      "김지수, 오디션 프로그램 출전",
      "배우 김민재 데뷔 10주년",
      "'데뷔 10년' 배우 김민재, 첫 팬미팅",
      "정우영 배우, 연극 무대 복귀",
      "가수 겸 배우 김지수 화보 공개",
      "정우영 원정 콘서트",
      "이재성 의원",
    ]) {
      const a = analyze(title, "ko", "interfootball-all");
      expect([a.kr, a.players, a.korean], title).toEqual([false, [], []]);
    }
    // 범위: 연예 표현이 있으면 빠진다(직업 명사가 붙은 이름·일반 문맥어는 남기는 근거가 아니다)
    for (const title of [
      "가수 정우영, 데뷔 앨범 발매",
      "배우 김지수, 데뷔 30주년",
      "김지수, 연극 무대 데뷔",
      "김지수, 오디션 프로그램 출전",
      "배우 김민재 데뷔 10주년",
      "'데뷔 10년' 배우 김민재, 첫 팬미팅",
      "정우영 원정 콘서트",
    ]) {
      expect(scope(title), title).toBe("entertainment");
    }
    for (const [title, slug] of [
      ["김지수, 브렌트포드 데뷔전 풀타임", "kim-ji-soo"],
      ["정우영, 선발 출전", "jeong-woo-yeong"],
      ["뮌헨 김민재, 1군 데뷔 7년 만에", "kim-min-jae"],
      ["유망주들의 롤모델 김민재", "kim-min-jae"],
    ] as const) {
      const a = analyze(title, "ko", "interfootball-world");
      expect([a.kr, a.players.includes(slug)], title).toEqual([true, true]);
    }
  });

  it("중요 4 — 국내 승패 동사: 뜻이 분명한 말은 결과, 다른 뜻도 있는 말은 주어(팀·등록 선수)가 있을 때만", () => {
    for (const title of [
      "아스널, 첼시 완파",
      "아스널, 첼시 대파",
      "아스널, 첼시 격침",
      "아스널, 첼시 이겼다",
      "토트넘, 첼시와 비겨",
      "토트넘, 첼시와 비기며 4위",
      "첼시와 비긴 토트넘",
      "아스널, 첼시에 패하며 2위",
      "아스널, 첼시에 패해",
      "아스널, 첼시에 고배",
      "아스널, 시즌 첫 승",
      "아스널, 첼시 꺾어",
      "아스널, 첼시 잡고 선두",
      "아스널, 첼시 이기고 선두",
      "아스널, 첼시 눌렀다",
      "아스널, 첼시 누르고 선두",
      "아스널, 첼시 물리쳐",
      "아스널, 첼시에 지고 2위",
      "아스널, 첼시전 쓴맛",
      "뮌헨, 도르트문트 제치고 선두",
    ]) {
      const a = analyze(title, "ko", "interfootball-world");
      expect([a.cat, a.spoiler], title).toEqual(["result", true]);
    }
    // 주어가 없으면 다른 뜻('메시 제치고 도움 1위'·'머리채 잡고'), 낱말 전체 표현은 다른 꼴에 맞지 않는다
    for (const title of [
      "메시 제치고 도움 단독 1위",
      "‘머리채 잡고 퇴장’ 비니시우스 징계",
      "첼시전 꺾어야 산다",
      "비겨도 16강",
      "고배당 주의보",
      "시즌 첫 승부처",
      "첫 승 도전",
    ]) {
      expect(analyze(title, "ko", "interfootball-world").cat, title).not.toBe(
        "result",
      );
    }
  });

  it("권장 — 유소년 접미 오탐('reserve keeper'·쌍점 뒤 'U21'·'B조'·'B플랜')은 1군 태그를 지킨다, 진짜 유소년 팀은 그대로 뺀다", () => {
    const tags = (title: string, lang = "en") =>
      matchTitleTags(title, lang, ctx.tags).teams.map((t) => t.slug);
    expect(
      tags("Chelsea reserve keeper Kepa set for Bournemouth move"),
    ).toEqual(expect.arrayContaining(["chelsea"]));
    expect(tags("Liverpool reserve goalkeeper Kelleher wants exit")).toEqual([
      "liverpool",
    ]);
    expect(tags("Arsenal 2-1 Chelsea: U21 graduate scores winner")).toEqual([
      "arsenal",
      "chelsea",
    ]);
    expect(tags("Arsenal 2-0 Chelsea: B-team wins")).toEqual([
      "arsenal",
      "chelsea",
    ]);
    expect(tags("아스널 B조 1위", "ko")).toEqual(["arsenal"]);
    expect(tags("레알 B플랜은 홀란", "ko")).toEqual(["real-madrid"]);
    expect(tags("Chelsea Reserves 2-1 Arsenal Reserves")).toEqual([]);
    expect(tags("Arsenal U21 2-1 Chelsea U21")).toEqual([]);
    expect(tags("레알 마드리드 B팀, 바르셀로나 B 2-1 격파", "ko")).toEqual([]);
  });

  it("권장 — 국내 '앞둔'은 약한 경기 전 표현(스코어·강한 승패 동사는 결과, '승리'만은 아니다), 'shut out'·'turn the tables on'·'go top', 'Euroliga'", () => {
    for (const title of [
      "UCL 앞둔 아스널, 첼시에 2-1 승리",
      "UCL 앞둔 아스널, 첼시 격파",
    ]) {
      const a = analyze(title, "ko", "interfootball-world");
      expect([a.cat, a.matchResult], title).toEqual(["result", false]);
    }
    expect(
      analyze("아스널, 첼시전 앞두고 승리 다짐", "ko", "interfootball-world")
        .cat,
    ).not.toBe("result");
    for (const title of [
      "Arsenal shut out Chelsea",
      "Arsenal turn the tables on Chelsea",
      "Liverpool shut down Chelsea to go top",
    ]) {
      expect(analyze(title, "en", "bbc-sport-football").cat, title).toBe(
        "result",
      );
    }
    expect(
      analyze(
        "Arsenal can go top with win over Chelsea",
        "en",
        "bbc-sport-football",
      ).cat,
    ).not.toBe("result");
    expect(scope("Real Madrid beat Barcelona in Euroliga", "en")).toBe(
      "non-football",
    );
  });
});
