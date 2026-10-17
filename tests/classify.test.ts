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
import { buildKeywordIndex } from "../scripts/lib/news-keywords";
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
