/**
 * M1-17 — 코드 분류 규칙 v0.1 (scripts/lib/classify.ts, PRD FR-21·FR-31, D23·D39 — CLAUDE.md §9.2 필수: 분류 규칙(언어별 키워드)).
 *
 * 고정하는 것
 *   - 스코어 패턴(하이픈·'Arsenal 2 Leeds 1') · 스코어처럼 보이는 숫자(10-man·2026-27·U-21·8/10·8.4초·4-3-3·'25-26 PL')는 아님
 *   - 언어별(en·it·es·ko) 카테고리 신호와 앞선 순서(대표팀 → 이적 → UCL → 결과 → 부상 → 감독·구단 → 기타), 재계약은 감독·구단
 *   - 대회: 팀 → 리그로 좁힘(BBC European 4개 리그), 다른 리그 두 팀 경기 결과는 리그 없음, 한 리그 소스 폴백, 대표팀은 선수 리그 없음
 *   - 요약문(D39 ① — 합성 문자열, fixture에는 없다): spoiler 근거로만 — 카테고리·팀·선수·대회 태그에는 쓰지 않는다
 *   - 중요도: 절대 임계값 1~4, 머리기사 imp 5는 하루 1장
 *   - 실데이터 손 판정 대조(fixtures/rss 태그 · fixtures/news-sample.json — M0-33·M0-34): spoiler 재현 100%, kr 일치, 카테고리·팀·대회
 *     일치 수 — 사전이 늘어나도(M1-21 D46 확정분 흉내) 같은 결과
 *   - 결과는 NewsCard 스키마 통과(buildCard)
 * 네트워크 없음.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  NewsCardSchema,
  SourcesFileSchema,
  type CompId,
  type NamesKoFile,
  type Source,
} from "@/lib/schema";

import {
  analyzeItems,
  assignImportance,
  cardComps,
  categoryOf,
  HEADLINE_IMPORTANCE,
  IMPORTANCE_THRESHOLDS,
  importanceOf,
  isMultiStoryTitle,
  isNationalText,
  textSignals,
  titleScores,
  toClassification,
  type ClassifyContext,
  type ClassifyItem,
} from "../scripts/lib/classify";
import { buildCard } from "../scripts/lib/news-file";
import {
  buildKeywordIndex,
  managerNameTerms,
  managerSpeechOf,
} from "../scripts/lib/news-keywords";
import { buildTagIndex } from "../scripts/lib/tag-names";

import { namesWithExtras } from "./support/names-extras";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const NAMES = NamesKoFileSchema.parse(readJson("configs/names.ko.json"));
const PLAYERS = KoreanPlayersFileSchema.parse(
  readJson("configs/korean-players.json"),
);
const SOURCES: Source[] = SourcesFileSchema.parse(
  readJson("configs/sources.json"),
);
const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s] as const));

function contextOf(names: NamesKoFile): ClassifyContext {
  return {
    keywords: buildKeywordIndex({ names, koreanPlayers: PLAYERS }),
    tags: buildTagIndex({ names, koreanPlayers: PLAYERS }),
    sourceById: SOURCE_BY_ID,
  };
}
const CTX = contextOf(NAMES);
const CTX_EXTRA = contextOf(namesWithExtras(NAMES));

const item = (
  title: string,
  source: string,
  more: Partial<ClassifyItem> = {},
): ClassifyItem => ({
  title,
  lang: SOURCE_BY_ID.get(source)?.lang ?? "en",
  summary: null,
  sources: [source],
  publishedAt: "2026-10-10T20:00:00.000Z",
  ...more,
});
const analyze = (title: string, source = "bbc-sport-football", more = {}) =>
  analyzeItems([item(title, source, more)], CTX);

// ─── 스코어 ──────────────────────────────────────────────────────────────

describe("titleScores — 스코어 패턴", () => {
  it("하이픈 스코어(작은 수-큰 수, 주어 팀 순서 무관)·한글 조사가 붙은 스코어·'Arsenal 2 Leeds 1' 형식", () => {
    expect(titleScores("Highlights: Albania 0-1 Wales", "en")).toEqual(["0-1"]);
    expect(titleScores("PSG, 맨시티에 4-2 승리", "ko")).toEqual(["2-4"]);
    expect(titleScores("맨시티, PSG에 2-4로 참패", "ko")).toEqual(["2-4"]);
    expect(titleScores("1-3→4-3 기적의 대역전극", "ko")).toEqual([
      "1-3",
      "3-4",
    ]);
    expect(titleScores("Real Madrid 4–3 Roma", "en")).toEqual(["3-4"]);
    expect(
      titleScores(
        "Arsenal 2 Leeds 1: Guimaraes goal completes fight back",
        "en",
      ),
    ).toEqual(["1-2"]);
  });

  it("스코어처럼 보이는 숫자는 아니다 — 10-man·2026-27·U-21·8/10·8.4초·4-3-3·'25-26 PL'·20:45·1/10", () => {
    for (const [title, lang] of [
      ["Solanke scores as 10-man Spurs draw with Man Utd", "en"],
      ["Manager ins and outs - 2026-27", "en"],
      ["England U-21 squad named", "en"],
      ["USWNT player ratings: Wilson's 8/10 a bright spot", "en"],
      ["노이어, ‘8.4초’ 최단 시간 실점", "ko"],
      ["Arteta switches to 4-3-3", "en"],
      ["‘25-26 PL 올해의 선수’ 브루노 페르난데스", "ko"],
      ["Kick-off at 20:45 in Milan", "en"],
      ["연봉 1/10만 받을까", "ko"],
    ] as const) {
      expect(titleScores(title, lang), title).toEqual([]);
    }
  });
});

// ─── 문장 신호 · 카테고리 ─────────────────────────────────────────────────

describe("textSignals·categoryOf — 언어별 카테고리 (FR-31)", () => {
  const cat = (title: string, lang: string, teams = 0, comps: CompId[] = []) =>
    categoryOf([{ s: textSignals(title, lang), teams }], comps);

  it("경기 결과 — en·it·es·ko 승패 표현·리뷰 머리표", () => {
    expect(cat("Viking snatch draw against Bayern Munich", "en")).toBe(
      "result",
    );
    expect(
      cat("Ten-man Spurs hold Man Utd as Solanke equaliser lands", "en"),
    ).toBe("result");
    expect(
      cat("De Bruyne raddoppia: il Napoli riparte con un tris", "it"),
    ).toBe("result");
    expect(cat("El Betis golea y sueña con Europa", "es")).toBe("result");
    expect(
      cat(
        "‘설영우 선발’ 아우크스부르크, 무승부 따내는 쾌거! [분데스 리뷰]",
        "ko",
      ),
    ).toBe("result");
    expect(cat("[PL REVIEW] 토트넘, 맨유와 간신히 1-1 무!", "ko")).toBe(
      "result",
    );
  });

  it("결과가 아닌 흔한 쓰임 — won't·hold talks·'gana enteros'·경기 전 기사('승리 시'·'꺾으면')·'빠졌다'·'공격 파트너'", () => {
    expect(cat("'Players won't like it' - Martinez apologises", "en")).toBe(
      "club",
    );
    expect(cat("Chelsea hold talks over midfielder", "en")).toBe(null);
    expect(cat("Pastore, favorito, pero un tapado gana enteros", "es")).toBe(
      null,
    );
    expect(
      cat("울산, 홈에서 분위기 반전 도전! 승리 시 홈 4연승", "ko"),
    ).not.toBe("result");
    expect(cat("베티스 꺾으면 리그 신기록까지", "ko")).toBe(null);
    expect(cat("“두 번의 접대 식사 내용이 빠졌다”", "ko")).toBe(null);
    expect(cat("이강인 공격 파트너 알바레스", "ko")).toBe(null);
  });

  it("이적 — 언어별 표현, 재계약만 있으면 감독·구단(M0-34 손 판정), 이적 자체 표현이 함께면 이적", () => {
    expect(cat("Getafe make offer to sign free agent Sancho", "en")).toBe(
      "transfer",
    );
    expect(cat("Calciomercato, il Milan tratta il prestito", "it")).toBe(
      "transfer",
    );
    expect(cat("El Barça cierra el fichaje del lateral", "es")).toBe(
      "transfer",
    );
    expect(cat("[오피셜] 로호, 친정 복귀! 개인 통산 3번째 입단", "ko")).toBe(
      "transfer",
    );
    expect(cat("Palmer signs new Chelsea contract until 2034", "en")).toBe(
      "club",
    );
    expect(cat("팔머, 첼시와 2034년까지 재계약", "ko")).toBe("club");
    expect(cat("Pedri renueva hasta 2030", "es")).toBe("club");
    expect(cat("Rinnovo per Lautaro, firma fino al 2030", "it")).toBe("club");
    expect(
      cat("Real Madrid agree loan fee and new contract for winger", "en"),
    ).toBe("transfer");
    // '이적 후' — 이적한 뒤의 활약
    expect(cat("바르콜라, 리버풀 이적 후 첫 골부터 해트트릭", "ko")).toBe(null);
  });

  it("묶음 제목(🚨 'A, B, C & more')은 이적 동사(want·target·eye)로도 이적", () => {
    const t =
      "🚨 Haaland to Arsenal update, Liverpool want PL winger, Man United want ex-midfielder, Chelsea lead race";
    expect(isMultiStoryTitle(t, "en")).toBe(true);
    expect(cat(t, "en")).toBe("transfer");
    // 의문사로 시작하는 해설 제목은 여러 소식 묶음이 아니다(한 사건 — D42 병합 대상)
    expect(
      isMultiStoryTitle(
        "How 'big star' Doku delivered for Man City in win at Liverpool",
        "en",
      ),
    ).toBe(false);
  });

  it("부상 — en·it·es·ko, '급부상'(떠오르다)은 아니다, 경기 결과가 함께면 결과", () => {
    expect(cat("Wolves striker Jimenez to have knee surgery", "en")).toBe(
      "injury",
    );
    expect(cat("Infortunio per Dybala, stop di un mese", "it")).toBe("injury");
    expect(cat("Flick pierde a Raphinha antes del duelo", "es")).toBe("injury");
    expect(cat("손흥민 햄스트링 부상… 4주 결장", "ko")).toBe("injury");
    expect(cat("차기 감독 후보로 급부상", "ko")).toBe("club");
    expect(cat("'발목 부상' 이강인… 아틀레티코, 알라베스 2-1 제압", "ko")).toBe(
      "result",
    );
  });

  it("대표팀 — 강한 표현은 클럽 팀이 있어도, 약한 근거는 클럽 팀이 없을 때만(결과 표현이 있으면 국가 둘 이상 또는 약한 표현 + 국가)", () => {
    expect(cat("England call up Arsenal's Saka", "en", 1)).toBe("national");
    expect(cat("[모레노호 1기 결산] 이강인·손흥민 활용 플랜", "ko")).toBe(
      "national",
    );
    expect(
      cat("Ronaldo suspended by Portugal as disciplinary case opens", "en"),
    ).toBe("national");
    expect(cat("Highlights: Albania 0-1 Wales", "en")).toBe("national");
    expect(cat("Why play-off win may not send Wales to World Cup", "en")).toBe(
      "national",
    );
    expect(
      cat("[MLS REVIEW] 대한민국 주장 클래스! LAFC는 오스틴에 3-1 승리", "ko"),
    ).toBe("result");
    // 선수 수식어('韓 국가대표 에이스'·'국대 수비수')는 대표팀 근거가 아니다
    expect(cat("‘韓 국대 주전 수비수’ 이한범, 공중볼 경합 100%", "ko")).toBe(
      null,
    );
    // 클럽 팀이 있으면 약한 표현은 대표팀이 아니다
    expect(
      isNationalText(
        textSignals("대표팀에서는 철벽이었는데 뮌헨 돌아오자마자 악몽", "ko"),
        1,
      ),
    ).toBe(false);
  });

  it("UCL 경기 결과는 '경기 결과'(PRD §15 D47 ②), UCL 칩은 결과가 아닌 UCL 소식 — 감독·구단은 감독·구단 운영·징계", () => {
    expect(cat("[UCL REVIEW] 맨시티, PSG에 2-4 참패", "ko", 2, ["UCL"])).toBe(
      "result",
    );
    expect(
      cat("Striker swaps Sunday league for Champions League", "en", 0, ["UCL"]),
    ).toBe("ucl");
    expect(
      cat("Arteta's conscience clear over Man City charges", "en", 1),
    ).toBe("club");
    expect(cat("“정상적이지 않아” 무리뉴 대폭발! 비니시우스 징계", "ko")).toBe(
      "club",
    );
    expect(cat("Football Daily", "en")).toBe(null);
  });

  it("물음표로 끝나는 라틴 제목의 승패 표현은 결과가 아니다 — 'Do Man City have any grounds to win their appeal?', '연패'(連霸·連敗)는 결과 표현이 아니다", () => {
    expect(
      cat("Do Manchester City have any grounds to win their appeal?", "en", 1),
    ).toBe(null);
    expect(
      cat("Has Arteta already shown us his strategy to beat PSG?", "en"),
    ).toBe(null);
    expect(
      cat(
        "How 'big star' Doku delivered for Man City in win at Liverpool",
        "en",
      ),
    ).toBe("result");
    expect(cat("이강인, AFC 올해의 국제선수상 2연패 도전", "ko")).not.toBe(
      "result",
    );
    expect(
      textSignals("PSG에서 UCL 2연패했는데도 떠난 이유", "ko").result,
    ).toBe(false);
  });
});

// ─── M1-43 첫 주간 품질 검수 — 실데이터(2026-10-17~24 발행분) 오분류 회귀 · '기타' 키워드 보강 ──────────────
// D47 ① '불확실하면 기타'는 유지한다 — 뜻이 분명한 표현만 넣고(오탐보다 미탐), 같은 낱말의 다른 쓰임을 함께 고정한다.

describe("M1-43 실데이터 — 오분류 회귀·'기타' 보강 (FR-21·FR-31, D47 ①)", () => {
  const cat = (title: string, lang: string, comps: CompId[] = []) =>
    categoryOf([{ s: textSignals(title, lang), teams: 0 }], comps);
  const IF = "interfootball-world";
  const DM = "di-marzio";

  it("오분류 회귀 — 무릎 꿇기 의식('take knee')은 부상이 아니다, 'breaking down'은 결과가 아니다, 'a sign of'·중계권 입찰·'사전에 합의'·'영입생'은 이적이 아니다", () => {
    expect(
      cat(
        "Guehi among players not to take knee - is it time to 'move campaign along'?",
        "en",
      ),
    ).toBe(null);
    const tactics = analyze(
      "Breaking down Man Utd's tactics after Fernandes' criticism",
    );
    expect(tactics.cat).toBe("other");
    expect(tactics.spoiler).toBe(false);
    expect(
      analyze(
        "Dream night for Bournemouth - win over Milan a sign of Premier League power",
      ).cat,
    ).toBe("result");
    expect(
      cat("SPFL invites bids for new Scottish Premiership TV deal", "en"),
    ).toBe(null);
    expect(
      cat(
        "‘엘 클라시코’ 앞두고 4실점 패배에도 “전혀 영향 없다”는 바르셀로나 주장 하피냐, 이른 교체엔 “사전에 합의된 것”",
        "ko",
      ),
    ).not.toBe("transfer");
    expect(
      cat(
        "“그리즈만 이탈 후 창의적인 역할 맡았어”…이강인이 ATM 7번 후계자 맞다! “영입생이 선수단 수준 끌어올렸어”",
        "ko",
      ),
    ).not.toBe("transfer");
    // 진짜 이적 소식은 그대로 — 합의·무릎 수술·협상 결렬
    expect(cat("토트넘, 이적료 합의…메디컬 앞둬", "ko")).toBe("transfer");
    expect(cat("Wolves striker Jimenez to have knee surgery", "en")).toBe(
      "injury",
    );
    expect(
      analyze("Talks break down over Arsenal move for striker").cat,
    ).not.toBe("result");
  });

  it("이적 보강 — 친정 '리턴설'·'done deals'", () => {
    expect(
      cat(
        "‘나 다시 돌아갈래!’ 아놀드, 리버풀 리턴설?...출전시간 불만 폭발→리버풀 등 4개 구단 ‘예의 주시’",
        "ko",
      ),
    ).toBe("transfer");
    expect(cat("All done deals in September & October 2026", "en")).toBe(
      "transfer",
    );
  });

  it("부상 보강 — 타박상·통증·줄부상·시즌 아웃·감염·구급차 / taken to hospital·could be out for·a doubt / fuori per·coscia — 다른 쓰임('타박당한'·'without a doubt'·'out for revenge'·'fuori per scelta')은 아니다", () => {
    expect(
      cat(
        "[속보] 이강인 UCL 결장 이유 밝혀졌다! 허벅지 타박상에 출전 불발…“예방 차원에서 워밍업조차 하지 않았다”",
        "ko",
        ["UCL"],
      ),
    ).toBe("injury");
    // '감독'(감독·구단)보다 부상이 앞이다(스코어 없음)
    expect(
      cat(
        "'떠난 이강인도 걱정할 정도인데’…PSG 핵심 선수 3명 줄부상에 엔리케 감독 근심 폭발 “오늘 경기에서 가장 나쁜 일”",
        "ko",
      ),
    ).toBe("injury");
    expect(
      analyze(
        "‘PSG 초비상!’ 막강 화력 바르셀로나 잡았지만...핵심 4명 이탈→‘흐비차 ‘시즌 아웃 가능성’ UCL 3연패 도전 먹구름",
        IF,
      ).cat,
    ).toBe("injury");
    expect(
      cat(
        "[오피셜] 이럴수가! ‘김민재 스승’ 콤파니, 훈련 참관 중 쓰러져 구급차 이송… 뮌헨은 “건강이 최우선”",
        "ko",
      ),
    ).toBe("injury");
    expect(
      cat(
        "‘이강인처럼!’ 시메오네, 허벅지 통증 털고 훈련 복귀한 LEE에 반색… “다쳐도 빠르게 돌아와야”",
        "ko",
      ),
    ).toBe("injury");
    expect(
      cat(
        "‘옛날이랑 달라!’ 선수 시절 대표 유리몸이였는데...‘김민재 스승’ 콤파니, 바이러스 감염→복귀 유력",
        "ko",
      ),
    ).toBe("injury");
    expect(
      cat(
        "Chelsea's Martinez taken to hospital for 'precautionary tests'",
        "en",
      ),
    ).toBe("injury");
    expect(cat("Arsenal fear Saka could be out for two months", "en")).toBe(
      "injury",
    );
    expect(
      cat("Haaland a doubt, Semenyo out - what are Man City's options?", "en"),
    ).toBe("injury");
    expect(cat("Atalanta, Giacomo Raspadori fuori per 20 giorni", "it")).toBe(
      "injury",
    );
    expect(
      cat(
        "Problemi alla coscia per Dembele: al suo posto entra Ferran Torres",
        "it",
      ),
    ).toBe("injury");
    // 다른 쓰임 — 부상이 아니다
    expect(cat("감독에게 타박당한 수비수, 다음 경기 선발", "ko")).not.toBe(
      "injury",
    );
    expect(
      cat("Saka is without a doubt Arsenal's most important player", "en"),
    ).toBe(null);
    expect(cat("Rashford out for revenge against his old club", "en")).toBe(
      null,
    );
    expect(cat("Inter, Barella fuori per scelta tecnica", "it")).toBe(null);
  });

  it("감독·구단 보강 — resign·bans·suspension·director of football·technical director·management·captaincy / fiducia a — 'con fiducia'·감독 인용 제목은 기타 그대로", () => {
    expect(cat("Real demand Tebas resign over Goebbels comparison", "en")).toBe(
      "club",
    );
    expect(
      cat("Turkish FA bans 147 officials for breaching betting rules", "en"),
    ).toBe("club");
    expect(
      cat("Ex-Arsenal director of football Edu to advise Northampton", "en"),
    ).toBe("club");
    expect(
      cat(
        "Spygate put me in difficult position - Southampton technical director",
        "en",
      ),
    ).toBe("club");
    expect(
      cat(
        "Everton legend Ferguson returns to management in Irish League",
        "en",
      ),
    ).toBe("club");
    expect(
      cat(
        "Fernandes to stay captain as Rooney calls Man Utd players babies",
        "en",
      ),
    ).toBe("club");
    expect(
      cat("Udinese, confermata la fiducia a Kosta Runjaic: le ultime", "it"),
    ).toBe("club");
    expect(
      cat("Juventus, fiducia a Spalletti dopo il ko contro la Lazio", "it"),
    ).toBe("club");
    // 대표팀 징계는 대표팀이 앞선다(기존 판정 유지)
    expect(
      cat("Ronaldo suspended by Portugal as disciplinary case opens", "en"),
    ).toBe("national");
    // 'con fiducia'(자신 있게)·감독 인용 제목은 키워드로 정하지 않는다(D47 ① — 기타)
    expect(
      cat(
        'Roma, Gasperini: "Queste prestazioni ci permettono di andare avanti con fiducia"',
        "it",
      ),
    ).toBe(null);
    expect(
      cat(
        'Napoli, Allegri: "Non possiamo prendere gol con questa facilità"',
        "it",
      ),
    ).toBe(null);
  });

  it("결과 보강 — come out on top·held at home·humbled by·nets double·double helps / ribaltano·regala tre punti / 연속 무승·결승골(주어 필요) — 경기 전 기사·주어 없는 제목은 아니다", () => {
    expect(
      cat("PSG come out on top in six-goal thriller against Barcelona", "en"),
    ).toBe("result");
    for (const title of [
      "Arsenal held at home by Birmingham",
      "Man Utd humbled by four-goal Como to pile pressure on Carrick",
      "Haaland nets double as Man City go six points clear at the top",
      "Guirassy double helps Dortmund past Sabah",
    ]) {
      const a = analyze(title);
      expect(a.cat, title).toBe("result");
      expect(a.spoiler, title).toBe(true);
    }
    expect(
      analyze(
        "Inter, la panchina fa la differenza: i cambi di Chivu ribaltano il Bologna",
        DM,
      ).cat,
    ).toBe("result");
    expect(
      analyze("Simeone rompe il digiuno e regala tre punti al Torino", DM).cat,
    ).toBe("result");
    expect(
      analyze(
        "“변명의 여지가 없다”…맨유, 7경기 연속 무승→캐릭은 “실망스럽다는 말로 부족해, 모두가 책임져야 해”",
        IF,
      ).cat,
    ).toBe("result");
    expect(
      analyze(
        "잉글랜드 대표팀 탈락하더니 제대로 각성했다! 마두에케, 아스널 구한 극장 결승골…아르테타 “다른 수준의 분노 보여주고 있다”",
        IF,
      ).cat,
    ).toBe("result");
    // 아니다 — '(torna) alla ribalta'(주목받다)·경기 전 기사('노린다')·주어 없는 결승골
    expect(analyze("Torino, torna alla ribalta Ilic", DM).cat).not.toBe(
      "result",
    );
    expect(analyze("맨유, 7경기 연속 무승 탈출 노린다", IF).cat).not.toBe(
      "result",
    );
    expect(analyze("이강인, 마요르카전 결승골 노린다", IF).cat).not.toBe(
      "result",
    );
    expect(analyze("결승골 터뜨린 무명 공격수의 사연", IF).cat).not.toBe(
      "result",
    );
  });

  it("리뷰 회귀 — 결과 숙어 'break down'·협상 결렬 구, 각오('out for revenge'), 흔한 낱말(management·suspended·done deal·a doubt·fuori per·humbled by·ribalta), 좁힌 제외('사전 합의'·'invite bids'), 무릎 꿇기 변형", () => {
    // 'break down'은 결과 숙어 — 결과·spoiler(맨 'break down' 제외가 지웠던 회귀)
    const burnley = analyze("Arsenal finally break down stubborn Burnley");
    expect(burnley.cat).toBe("result");
    expect(burnley.spoiler).toBe(true);
    // 협상 결렬 구는 결과가 아니다
    expect(
      analyze("Talks break down over Arsenal move for striker").cat,
    ).not.toBe("result");
    expect(
      analyze("Chelsea talks broke down over fee for winger").cat,
    ).not.toBe("result");
    // 각오 — 부상이 아니다(조동사 꼴 'will be out for'보다 제외가 먼저)
    for (const title of [
      "Rashford will be out for revenge against Man Utd",
      "Spurs out for blood after derby defeat",
      "Sterling out for redemption at Chelsea",
    ]) {
      expect(analyze(title).cat, title).not.toBe("injury");
    }
    // management — 감독 일 구만 감독·구단
    for (const title of [
      "Arsenal's load management of Saka explained",
      "Liverpool squad management under scrutiny",
      "Why time management cost Spurs",
    ]) {
      expect(analyze(title).cat, title).not.toBe("club");
    }
    expect(
      cat(
        "Everton legend Ferguson returns to management in Irish League",
        "en",
      ),
    ).toBe("club");
    // suspended·suspension — 경기 중단·집행유예는 징계가 아니다
    for (const title of [
      "Match suspended after fan medical emergency at Everton",
      "Play suspended at Spurs after floodlight failure",
      "Liverpool v Arsenal temporarily suspended due to fog",
      "Former Chelsea player given suspended sentence",
      "Suspension of play as storm hits Anfield",
    ]) {
      expect(analyze(title).cat, title).not.toBe("club");
    }
    expect(
      cat(
        "Ronaldo given 30-day suspension and £215 fine by Portuguese FA",
        "en",
      ),
    ).toBe("club");
    // done deal 부정형
    expect(cat("Isak to Liverpool far from a done deal", "en")).not.toBe(
      "transfer",
    );
    expect(cat("Saliba move is not a done deal yet", "en")).not.toBe(
      "transfer",
    );
    // a doubt — 의심·확신 표현
    expect(
      cat("There was never a doubt about Saka's quality - Arteta", "en"),
    ).toBe(null);
    expect(cat("Arteta casts a doubt over title race", "en")).toBe(null);
    expect(cat("Not a doubt in my mind - Slot", "en")).toBe(null);
    // fuori per — 핸드볼·개인 사유·간발·애도
    for (const title of [
      "Napoli, Lukaku fuori per motivi familiari",
      "Juventus, Vlahovic fuori per un soffio dalla lista",
      "Torino, Ricci fuori per lutto",
      "Inter, gol annullato: fuori per mano di Bastoni",
    ]) {
      expect(analyze(title, DM).cat, title).not.toBe("injury");
    }
    // humbled by — 감사 표현은 결과가 아니다, 팀 이름이 오면 결과
    expect(
      analyze("Salah humbled by the support from Liverpool fans").cat,
    ).not.toBe("result");
    expect(analyze("Arsenal humbled by nomination for award").cat).not.toBe(
      "result",
    );
    expect(
      analyze("Man Utd humbled by four-goal Como to pile pressure on Carrick")
        .cat,
    ).toBe("result");
    // ribalta — 판결·결정 뒤집기는 결과가 아니다
    expect(
      analyze("Juventus, il Tar ribalta la sentenza sulla penalizzazione", DM)
        .cat,
    ).not.toBe("result");
    expect(
      analyze("Lazio, la Corte d'Appello ribalta la decisione", DM).cat,
    ).not.toBe("result");
    expect(analyze("Lazio, la Corte ribalta il verdetto", DM).cat).not.toBe(
      "result",
    );
    // 좁힌 제외 — 보스만 사전 합의·선수 입찰 받기는 이적 그대로
    expect(cat("토트넘, 보스만 사전 합의 마쳐…내년 여름 합류", "ko")).toBe(
      "transfer",
    );
    expect(cat("Man Utd invite bids for Rashford", "en")).toBe("transfer");
    expect(
      cat("SPFL invites bids for new Scottish Premiership TV deal", "en"),
    ).toBe(null);
    // 무릎 꿇기 변형
    expect(cat("Players took a knee before Arsenal v Chelsea", "en")).not.toBe(
      "injury",
    );
    expect(cat("Every player takes a knee at Wembley", "en")).not.toBe(
      "injury",
    );
    // 붙여 쓴 '시즌아웃'도 '시즌 아웃' 한 표현으로 맞는다
    expect(cat("‘PSG 초비상!’ 흐비차 ‘시즌아웃 가능성’", "ko")).toBe("injury");
  });

  it("경기 전 기사 — 카테고리는 결과가 아니고 spoiler는 보수적으로 true(승패·경기 사건 표현이 원제목에 있다 — FR-21)", () => {
    for (const [title, source] of [
      ["Arsenal can come out on top against Man City", "bbc-sport-football"],
      ["맨유, 7경기 연속 무승 탈출 노린다", IF],
      ["이강인, 마요르카전 결승골 노린다", IF],
    ] as const) {
      const a = analyze(title, source);
      expect(a.cat, title).not.toBe("result");
      expect(a.spoiler, title).toBe(true);
    }
  });
});

describe("감독 발언 → 감독·구단 (PRD §15 D47 사용자 결정 A, 2026-10-25 — FR-21·FR-31)", () => {
  const IF = "interfootball-world";
  const DM = "di-marzio";
  const BBC = "bbc-sport-football";
  /** 같은 사전에서 감독 항목만 뺀 맥락 — 감독 발언 규칙 전후 비교(감독 항목은 태그 대상이 아니라 태그·kr은 같아야 한다) */
  const CTX_NO_MANAGERS = contextOf({
    ...NAMES,
    entries: NAMES.entries.filter((e) => e.kind !== "manager"),
  });
  const without = (title: string, source: string) =>
    analyzeItems([item(title, source)], CTX_NO_MANAGERS);
  const speech = (title: string, lang: string) =>
    managerSpeechOf(title, lang, CTX.keywords.managers);

  /** M1-43 검수 기간(10-17~25) 실데이터 — 규칙 전 '기타'였던 감독 인터뷰 인용 제목 */
  const REAL: ReadonlyArray<readonly [string, string, string]> = [
    [
      'Lazio, Gattuso: "Critiche nei miei confronti in questi anni? Non c\'è stata onestà nei miei confronti"',
      DM,
      "head",
    ],
    [
      'Napoli, Allegri: "Non possiamo prendere gol con questa facilità. De Bruyne? Giocatore straordinario"',
      DM,
      "head",
    ],
    [
      'Roma, Gasperini: "Queste prestazioni ci permettono di andare avanti con fiducia"',
      DM,
      "head",
    ],
    [
      'Inter, Chivu: "Spero che questa partita ci restituisca fiducia ed entusiasmo"',
      DM,
      "head",
    ],
    ['Juventus, Spalletti: "Gol annullato? Ci sono rimasto male"', DM, "head"],
    ['Atalanta, Sarri: "Abbiamo fatto una partita europea"', DM, "head"],
    [
      "Liverpool players in 'delicate' situation with 'demanding' schedule - Iraola",
      BBC,
      "tail",
    ],
    ["Newcastle made 'wrong decisions' in final third - Jaissle", BBC, "tail"],
    ["Everton did not play well - Moyes", BBC, "tail"],
    ["'Not about me' - Arbeloa dismisses future questions", BBC, "quoteTail"],
    [
      "'It doesn't make sense' - Glasner confused after Diop avoids red card",
      BBC,
      "quoteTail",
    ],
  ];

  it("실데이터 오분류 회귀 — 사전 감독(성 단독 저위험 별칭 포함) + 인용 머리·출처 문형은 기타 → 감독·구단, spoiler·태그·kr·대회는 그대로", () => {
    for (const [title, source, pattern] of REAL) {
      const lang = SOURCE_BY_ID.get(source)!.lang;
      expect(speech(title, lang), title).toBe(pattern);
      const before = without(title, source);
      const after = analyze(title, source);
      expect(before.cat, title).toBe("other");
      expect(after.cat, title).toBe("club");
      expect(after.spoiler, title).toBe(before.spoiler);
      expect(after.teams, title).toEqual(before.teams);
      expect(after.players, title).toEqual(before.players);
      expect(after.kr, title).toBe(before.kr);
      expect(after.comp, title).toEqual(before.comp);
    }
  });

  it("그 밖의 문형 — 전체 이름 머리 인용·보고 문형(이름 + 낱말 + 쌍점 + 따옴표)·발언 동사·국내 성 단독(3글자 이상) 인용", () => {
    for (const [title, source, pattern] of [
      [
        'Antonio Conte: "Manchester United? Non ho parlato con nessuno"',
        DM,
        "head",
      ],
      // 이탈리아어 관사 생략('L'Atalanta')·영어 머리 인용
      ["L'Atalanta, Sarri: «Abbiamo fatto una partita europea»", DM, "head"],
      ["Iraola: Liverpool must cut out the errors", BBC, "head"],
      [
        'Lazio, Gattuso carica la squadra: "Ora non dobbiamo fermarci"',
        DM,
        "headSays",
      ],
      [
        'Arbeloa, tras el entrenamiento: "Asumo la responsabilidad"',
        "relevo",
        "headSays",
      ],
      ["Liverpool boss Iraola says squad needs rest", BBC, "verb"],
      ["Glasner confident Forest can turn the corner", BBC, "verb"],
      ["Spalletti avverte la Juventus prima della sosta", DM, "verb"],
      ["램파드 “선수들이 자랑스럽다”…코번트리 반등 이끈다", IF, "koQuote"],
      [
        "“우승 경쟁 충분히 가능하다”라고 말한 이라올라, 리버풀 반등 자신",
        IF,
        "koSaid",
      ],
      ["가스페리니가 밝힌 로마 상승세 비결", IF, "koSays"],
    ] as const) {
      const lang = SOURCE_BY_ID.get(source)!.lang;
      expect(speech(title, lang), title).toBe(pattern);
      expect(analyze(title, source).cat, title).toBe("club");
    }
  });

  it("오탐 방지 — 선수 인용·동명 선수(시메오네 — 성 별칭 없음)·문형 없는 감독 이름·경기 전 기사·소문자·단어 안·중간 위험 성(별칭 없음)은 감독 발언이 아니다", () => {
    for (const [title, source] of [
      // 선수 인용(사전 감독이 아니다) — 인용 안의 감독 이름도 머리가 아니다
      [
        'Napoli, Politano: "Cerco sempre di assumermi le responsabilità. Dobbiamo continuare a vincere"',
        DM,
      ],
      [
        'Napoli, Manna: "Incomprensioni tra Allegri e De Bruyne? Sono state enfatizzate"',
        DM,
      ],
      // 동명 선수 — 지오반니 시메오네(토리노)·국내 '시메오네'(성만 — 디에고 감독 항목은 전체 이름만)
      [
        'Torino, Simeone: "Ho avuto la possibilità di andare al River, ma qui c\'era bisogno di me"',
        DM,
      ],
      [
        "“출전 시간과 체력 관리 때문” 시메오네가 밝히는 이강인 교체 이유…“활동량이 필요했다”",
        IF,
      ],
      // 감독 이름만 있고 문형이 없다(D47 '불확실하면 기타')
      [
        "Roma, la probabile formazione contro il Genoa: Gasperini verso un tridente inedito",
        DM,
      ],
      ["Forest's start raises questions - but belief in Glasner remains", BBC],
      [
        "Lazio, 123 giorni dopo la diffidenza ha lasciato spazio alla voglia di sorprendere di Gattuso",
        DM,
      ],
      ["Superman at Como & is Conte right for Man Utd?", BBC],
      ["The spectre of Antonio Conte looms over Manchester United", BBC],
      // 중간·고위험 성은 별칭이 없다(Amorim·Abate·Andrews — 사용자 결정 2026-10-25)
      [
        'Milan, Amorim: "Questa non è stata una partita, il rosso e i rigori hanno cambiato tutto"',
        DM,
      ],
      ['Torino, Abate: "Non abbiamo fatto ancora niente"', DM],
      ["Yarmoliuk red card changed game dynamic - Andrews", BBC],
      // 붙여 쓴 대시·소문자·단어 안(Sarrià)
      ["Gattuso-Sarri, la sfida dei maestri", DM],
      ["Everton did not play well - moyes", BBC],
      ["Festa nel quartiere di Sarrià: Barça in città", DM],
      // 국내 두 글자 성(키부·사리 — 일반어 '사리')은 맞추지 않는다
      ["사리 “오늘은 쉬어야 한다”", IF],
      // 국내 작은따옴표는 별명·강조(fixtures 인터풋볼 제목) — 발언이 아니다(카테고리는 이적 그대로)
      [
        "1,780억 베팅하면 보내준다… 핵심 MF 스콧 매물로 내놓는 본머스, 리버풀 이라올라 감독 ‘애제자’ 영입 나서나",
        IF,
      ],
    ] as const) {
      const lang = SOURCE_BY_ID.get(source)!.lang;
      expect(speech(title, lang), title).toBe(null);
      expect(analyze(title, source).cat, title).toBe(
        without(title, source).cat,
      );
    }
  });

  it("더 강한 신호가 먼저 — 결과(spoiler 그대로·엔티티 병합 대상 아님)·부상·이적·UCL·대표팀", () => {
    // 결과: 인용 속 스코어 — 결과 카테고리·spoiler 그대로, 감독 발언이라 결과 카드 밑으로 합치지 않는다(D42 matchResult)
    const result = analyze(
      'Roma, Gasperini: "Soddisfatto della gara. Per come si era messa la partita sul 3-2, è andata bene così"',
      DM,
    );
    expect(result.cat).toBe("result");
    expect(result.spoiler).toBe(true);
    expect(result.matchResult).toBe(false);
    expect(analyze("Liverpool 2-1 Everton - Iraola", BBC).cat).toBe("result");
    expect(analyze("Salah out for six weeks - Iraola", BBC).cat).toBe("injury");
    expect(
      analyze('Napoli, Allegri: "Mercato? Non serve nessuno"', DM).cat,
    ).toBe("transfer");
    expect(
      analyze(
        "Liverpool must be braver in Europe - Iraola",
        "bbc-sport-champions-league",
      ).cat,
    ).toBe("ucl");
    expect(
      analyze('Gattuso: "La Nazionale? Ora penso solo alla Lazio"', DM).cat,
    ).toBe("national");
  });

  it("이름 — 성 단독 영문 별칭이 있는 감독만 한글 성(3글자 이상)도 맞추고, 첫 글자 축약('D. Simeone')은 쓰지 않는다 · 사전이 없으면 문형 없음", () => {
    const terms = managerNameTerms(NAMES);
    expect(terms.ko).toContain("마시밀리아노 알레그리");
    expect(terms.ko).toContain("알레그리");
    expect(terms.ko).toContain("램파드");
    expect(terms.ko).toContain("디에고 시메오네");
    for (const short of [
      "시메오네",
      "키부",
      "사리",
      "콘테",
      "앤드류스",
      "캐릭",
    ]) {
      expect(terms.ko, short).not.toContain(short);
    }
    expect(terms.latin).toContain("Allegri");
    expect(terms.latin).toContain("Fabregas"); // 발음 기호를 뗀 꼴
    expect(terms.latin).not.toContain("D. Simeone");
    expect(terms.latin).not.toContain("Simeone");
    const bare = buildKeywordIndex({});
    expect(
      managerSpeechOf('Napoli, Allegri: "Bene così"', "it", bare.managers),
    ).toBe(null);
  });
});

// ─── 클러스터 분석 ─────────────────────────────────────────────────────────

describe("analyzeItems — 대회·팀·kr·spoiler", () => {
  it("대회: BBC European(4개 리그) 기사는 팀 리그로 좁힌다", () => {
    expect(
      analyze(
        "Raphinha's brilliant Barcelona start interrupted by injury concerns",
        "bbc-sport-european",
      ),
    ).toMatchObject({ comp: ["LALIGA"], teams: ["barcelona"], cat: "injury" });
  });

  it("대회: 다른 리그(또는 5대 리그 밖) 두 팀의 경기 결과는 리그를 붙이지 않는다(유럽 대항전·친선전 — 대회를 모른다)", () => {
    // 'Roma'는 다른 리그 팀(레알 마드리드)만으로는 태그하지 않는다(겹치는 별칭 — tag-names.ts) → 팀 1개라 그 리그
    expect(
      analyze("Real Madrid stun Roma after dramatic late comeback"),
    ).toMatchObject({ teams: ["real-madrid"], comp: ["LALIGA"] });
    expect(
      analyze("Real Madrid stun AS Roma after dramatic late comeback").comp,
    ).toEqual([]);
    expect(analyze("Bodo/Glimt impress in win over Dortmund").comp).toEqual([]);
    // 같은 리그 두 팀이면 그 리그
    expect(
      analyze("Brilliant Guimaraes goal helps Arsenal fight back to beat Leeds")
        .comp,
    ).toEqual(["EPL"]);
  });

  it("대회: 태그가 없으면 한 리그만 다루는 소스의 리그, 소스 대회의 UCL, 제목 대회 표현", () => {
    expect(
      analyze("Elite schedule 'not sustainable'", "bbc-sport-premier-league")
        .comp,
    ).toEqual(["EPL"]);
    expect(
      analyze(
        "Mourinho calls criticism of Mbappe 'ridiculous'",
        "bbc-sport-european",
      ).comp,
    ).toEqual([]);
    expect(
      analyze("Striker swaps Sunday league for Champions League"),
    ).toMatchObject({
      comp: ["UCL"],
      cat: "ucl",
    });
    expect(
      analyze(
        "Guardiola set to attend Man City v PSG next week",
        "bbc-sport-champions-league",
      ).comp,
    ).toEqual(["EPL", "LIGUE1", "UCL"]);
  });

  it("대표팀 기사는 선수 소속 리그를 대회로 붙이지 않는다('[모레노호 1기 결산] 이강인' ≠ 라리가), kr은 그대로", () => {
    expect(
      analyze(
        "‘후반 용병술’은 증명, 11월에는 ‘이강인·손흥민 활용’ 플랜 A까지 [모레노호 1기 결산]",
        "footballist-football",
      ),
    ).toMatchObject({
      cat: "national",
      comp: [],
      kr: true,
      players: ["lee-kang-in"],
    });
  });

  it("kr = 활성 등록 한국 선수(FR-60·FR-64) — 손흥민(LAFC, 미등록)·홍현석(active false)은 아니다", () => {
    expect(
      analyze("손흥민 1골 2도움! LAFC 3-1 오스틴", "interfootball-world").kr,
    ).toBe(false);
    expect(analyze("홍현석 선발 출전", "interfootball-world")).toMatchObject({
      kr: false,
      players: ["hong-hyun-seok"],
    });
    expect(
      analyze("김민재 아스널 이적 가능성", "interfootball-world"),
    ).toMatchObject({
      kr: true,
      players: ["kim-min-jae"],
      teams: ["arsenal"],
      comp: ["EPL", "BUNDESLIGA"],
      cat: "transfer",
    });
  });

  it("여러 묶음 제목의 합집합 — 대표 제목에 없는 한국 선수도 kr(M1-15 이월: 최신성 대표 '노이어' 제목)", () => {
    const a = analyzeItems(
      [
        item(
          "“내 멍청한 실수였다”… 노이어, 바이에른 뮌헨은 아우크스부르크에 2-2 무승부",
          "besteleven-world",
        ),
        item(
          "[분데스 REVIEW] 김민재는 결장! 설영우는 선발 데뷔→조기교체",
          "interfootball-all",
        ),
      ],
      CTX,
    );
    expect(a).toMatchObject({
      kr: true,
      teams: ["bayern-munchen", "augsburg"],
      cat: "result",
      spoiler: true,
      scores: ["2-2"],
      comp: ["BUNDESLIGA"],
    });
    expect(a.players).toEqual(
      expect.arrayContaining(["kim-min-jae", "seol-young-woo"]),
    );
  });

  it("spoiler — 결과·스코어·승패·경기 중 사건(퇴장·골) 중 하나라도(보수적), 경기 전 기사·이적은 아니다", () => {
    expect(
      analyze(
        "Follia di Vinicius: gol, espulsione e Real Madrid in dieci",
        "di-marzio",
      ).spoiler,
    ).toBe(true);
    expect(analyze("Yoro sent off as Man Utd stumble to defeat").spoiler).toBe(
      true,
    );
    expect(
      analyze("Guardiola set to attend Man City v PSG next week").spoiler,
    ).toBe(false);
    expect(analyze("Getafe make offer to sign free agent Sancho").spoiler).toBe(
      false,
    );
  });

  it("공백: &nbsp;(U+00A0)·전각 공백이 섞인 제목도 여러 단어 표기를 맞춘다(M1-15 이월)", () => {
    expect(analyze("Man City beat Real Madrid 2-1").teams).toEqual([
      "manchester-city",
      "real-madrid",
    ]);
    expect(
      analyze("바이에른　뮌헨, 2-1 승리", "interfootball-world").teams,
    ).toEqual(["bayern-munchen"]);
  });
});

describe("요약문(D39 ① — 메모리 안 분류 입력, 합성 문자열)", () => {
  it("요약문은 카테고리에 쓰지 않는다 — 제목으로 정해지지 않으면 기타(요약문은 다른 경기·이적설을 지나가며 말한다, dry 실측)", () => {
    const summary =
      "The club confirmed the defender suffered a hamstring injury.";
    expect(
      analyze("Saka responds to Arteta's challenge", "bbc-sport-football", {
        summary,
      }).cat,
    ).toBe("other");
    expect(
      analyze(
        "Getafe make offer to sign free agent Sancho",
        "bbc-sport-football",
        {
          summary,
        },
      ).cat,
    ).toBe("transfer");
  });

  it("요약문의 결과·경기 사건 표현은 spoiler 근거다(보수적)", () => {
    expect(
      analyze("Talking points from the Emirates", "bbc-sport-football", {
        summary: "Arsenal beat Chelsea 2-1 with a late winner.",
      }).spoiler,
    ).toBe(true);
  });

  it("요약문은 팀·선수·대회·kr 태그에 쓰지 않는다(다음 상대·친정팀 이름이 섞인다)", () => {
    const a = analyze(
      "Talking points from the Emirates",
      "bbc-sport-football",
      {
        summary:
          "Arsenal face Bayern Munich next; Kim Min-jae and Liverpool were linked.",
      },
    );
    expect(a).toMatchObject({ teams: [], players: [], comp: [], kr: false });
  });
});

// ─── 중요도 ──────────────────────────────────────────────────────────────

describe("중요도 — 절대 임계값 1~4 + 머리기사 imp 5 하루 1장 (FR-21, D30)", () => {
  it("importanceOf: 임계값 경계", () => {
    const [t2, t3, t4] = IMPORTANCE_THRESHOLDS;
    expect(importanceOf(0)).toBe(1);
    expect(importanceOf(t2 - 0.001)).toBe(1);
    expect(importanceOf(t2)).toBe(2);
    expect(importanceOf(t3)).toBe(3);
    expect(importanceOf(t4)).toBe(4);
    expect(importanceOf(100)).toBe(4);
  });

  it("assignImportance: 1위가 imp 4 임계값 이상이고 그날 파일에 머리기사가 없으면 1위만 5", () => {
    const t4 = IMPORTANCE_THRESHOLDS[2];
    expect(
      assignImportance([t4 + 2, t4 + 1, 2.5, 0.5], { headTaken: false }),
    ).toEqual([HEADLINE_IMPORTANCE, 4, 3, 1]);
    // 같은 날 재실행 — 이미 머리기사가 있으면 바꾸지 않는다
    expect(assignImportance([t4 + 2, 2.5], { headTaken: true })).toEqual([
      4, 3,
    ]);
    // 1위가 약하면 머리기사 없음(머리기사는 imp 최고 카드 — 화면이 파일 순서로 고른다)
    expect(
      assignImportance([t4 - 0.1, IMPORTANCE_THRESHOLDS[0]], {
        headTaken: false,
      }),
    ).toEqual([3, 2]);
    expect(assignImportance([], { headTaken: false })).toEqual([]);
  });
});

// ─── 실데이터 손 판정 대조 ──────────────────────────────────────────────────

interface RssIndex {
  sources: Array<{
    id: string;
    items: Array<{
      title: string;
      link: string;
      pubDate: string;
      tags: string[];
    }>;
  }>;
}
const RSS = readJson("fixtures/rss/index.json") as RssIndex;
interface SampleCard {
  t: string;
  lang: string;
  cat: string;
  comp: CompId[];
  teams: string[];
  players: string[];
  kr: boolean;
  spoiler: boolean;
  src: Array<{ at: string }>;
}
const SAMPLE = (
  readJson("fixtures/news-sample.json") as { cards: SampleCard[] }
).cards;
/** news-sample(M0-34)의 옛 slug → 사전 slug(M1-21) */
const OLD_SLUG: Record<string, string> = {
  milan: "ac-milan",
  napoli: "ssc-napoli",
  sassuolo: "us-sassuolo-calcio",
};

function rssItems() {
  const seen = new Set<string>();
  return RSS.sources.flatMap((s) =>
    s.items.flatMap((i) => {
      if (seen.has(i.link)) return [];
      seen.add(i.link);
      return [{ source: s.id, title: i.title.trim(), tags: i.tags }];
    }),
  );
}

describe.each([
  ["현재 사전", CTX],
  ["사전 + D46 확정분 흉내", CTX_EXTRA],
] as const)("손 판정 대조 — %s", (_label, ctx) => {
  it("fixtures/rss 고유 링크 56건: spoiler 재현 22/22(결과·경기 사건·스코어 태그), kr = 등록 선수 태그 10/10·오탐 0", () => {
    const items = rssItems();
    expect(items).toHaveLength(56);
    let spPos = 0;
    let spHit = 0;
    let krPos = 0;
    let krHit = 0;
    let krFalse = 0;
    for (const it of items) {
      const a = analyzeItems([item(it.title, it.source)], ctx);
      if (
        it.tags.some((t) =>
          ["match-result", "match-event", "score"].includes(t),
        )
      ) {
        spPos += 1;
        if (a.spoiler) spHit += 1;
      }
      const kr = it.tags.some((t) => t.startsWith("korean-player:"));
      if (kr) {
        krPos += 1;
        if (a.kr) krHit += 1;
      } else if (a.kr) krFalse += 1;
      // 등록되지 않은 한국 선수(손흥민 LAFC)만 나오는 기사는 kr이 아니다
      if (it.tags.some((t) => t.startsWith("korean-unregistered:")) && !kr) {
        expect(a.kr, it.title).toBe(false);
      }
    }
    expect([spHit, spPos]).toEqual([22, 22]);
    expect([krHit, krPos, krFalse]).toEqual([10, 10, 0]);
  });

  it("fixtures/news-sample.json 23장(M0-34 판정): 카테고리 22/23, 팀 29/29(오탐 0), 대회 23/23, spoiler·kr 23/23, 선수 오탐 0", () => {
    const titleSource = new Map(
      RSS.sources.flatMap((s) =>
        s.items.map((i) => [i.title.trim(), s.id] as const),
      ),
    );
    let cat = 0;
    let comp = 0;
    let spoiler = 0;
    let kr = 0;
    let teamTp = 0;
    let teamFp = 0;
    let teamFn = 0;
    let playerFp = 0;
    const catMiss: string[] = [];
    for (const card of SAMPLE) {
      const source = titleSource.get(card.t);
      const a = analyzeItems(
        [
          {
            title: card.t,
            lang: card.lang,
            summary: null,
            sources: source ? [source] : [],
            publishedAt: card.src[0]!.at,
          },
        ],
        ctx,
      );
      if (a.cat === card.cat) cat += 1;
      else catMiss.push(`${card.cat}→${a.cat}`);
      if ([...a.comp].sort().join() === [...card.comp].sort().join()) comp += 1;
      if (a.spoiler === card.spoiler) spoiler += 1;
      if (a.kr === card.kr) kr += 1;
      const expected = new Set(card.teams.map((t) => OLD_SLUG[t] ?? t));
      for (const t of a.teams) {
        if (expected.has(t)) teamTp += 1;
        else teamFp += 1;
      }
      for (const t of expected) if (!a.teams.includes(t)) teamFn += 1;
      playerFp += a.players.filter((p) => !card.players.includes(p)).length;
    }
    expect(SAMPLE).toHaveLength(23);
    expect(cat).toBe(22);
    // 유일한 차이: '이강인이 … 레알 마드리드, 승리하고도 또 분노 폭발' — 손 판정 감독·구단, 규칙은 결과('승리' — spoiler는 둘 다 true)
    expect(catMiss).toEqual(["club→result"]);
    expect([teamTp, teamFp, teamFn]).toEqual([29, 0, 0]);
    expect(comp).toBe(23);
    expect(spoiler).toBe(23);
    expect(kr).toBe(23);
    expect(playerFp).toBe(0);
  });
});

describe("카드 스키마 — 분류 결과는 NewsCard 스키마를 통과한다(buildCard)", () => {
  it("fixtures/rss 56건 분류 → buildCard → NewsCardSchema 통과, 분류 필드가 그대로 들어간다", () => {
    for (const it of rssItems()) {
      const source = SOURCE_BY_ID.get(it.source)!;
      const a = analyzeItems([item(it.title, it.source)], CTX);
      const classification = toClassification(a, importanceOf(2.5));
      const card = buildCard(
        {
          title: it.title,
          url: "https://example.com/x",
          publishedAt: "2026-10-10T20:00:00.000Z",
          summary: "요약문은 카드에 들어가지 않는다",
          source: it.source,
          author: null,
          authors: [],
          lang: source.lang,
        },
        source,
        "2026-10-10T21:30:00.000Z",
        [],
        {
          score: { score: 2.5, factors: {} as never, signals: {} as never },
          classification,
        },
      );
      expect(NewsCardSchema.safeParse(card).success).toBe(true);
      expect(card).toMatchObject(classification);
      expect(JSON.stringify(card)).not.toContain("요약문은 카드에");
    }
  });

  it("cardComps: CompId 순서, 중복 없음", () => {
    expect(
      cardComps({
        titleComps: ["UCL", "EPL"],
        sourceComps: ["LALIGA", "UCL"],
        tagLeagues: ["EPL"],
        crossLeagueMatch: false,
      }),
    ).toEqual(["EPL", "UCL"]);
  });
});
