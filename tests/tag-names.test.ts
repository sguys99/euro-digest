/**
 * M1-17 — 원제목 → 팀·선수 태그 (scripts/lib/tag-names.ts, PRD FR-21·FR-24 — CLAUDE.md §9.2 필수: 분류 규칙(언어별 키워드)).
 *
 * 고정하는 것
 *   - 태그 slug = 사전 slug(names.ko.json·빅클럽 표·등록 한국 선수), 제목 안 순서
 *   - 라틴 단어 경계·발음 기호(Atlético·Barça), 국내 제목 조사 경계('니스'≠'테니스', '랑스'≠'프랑스', '로마'≠'로마노', '포르투'≠'포르투갈')
 *   - 일반어·도시 별칭(M1-21 리뷰 — Como·Nice·Lens·Roma·Milan…): 대문자 시작 + 같은 제목의 확인 근거(다른 팀·리그 대회·소스 대회)
 *   - 여자팀·제외 표현(Arsenal Women·Inter Miami·레알 소시에다드) · 같은 표기를 둘 이상이 쓰면 뺀다
 *   - 사전이 늘어나도(M1-21 D46 표기 확정분 — 애스턴 빌라·에버턴 등) 같은 규칙으로 맞는다(테스트는 특정 팀 미등록에 기대지 않는다)
 * 네트워크 없음.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { KoreanPlayersFileSchema, NamesKoFileSchema } from "@/lib/schema";

import {
  AMBIGUOUS_TAG_TERMS,
  buildTagIndex,
  dropSharedTerms,
  latinSpaced,
  matchTitleTags,
  tagLeagues,
  unionTags,
  type TagIndex,
} from "../scripts/lib/tag-names";

import { namesWithExtras } from "./support/names-extras";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const NAMES = NamesKoFileSchema.parse(readJson("configs/names.ko.json"));
const PLAYERS = KoreanPlayersFileSchema.parse(
  readJson("configs/korean-players.json"),
);
const INDEX = buildTagIndex({ names: NAMES, koreanPlayers: PLAYERS });

const tags = (
  title: string,
  lang: string,
  index: TagIndex = INDEX,
  sourceComps: Parameters<typeof matchTitleTags>[3] = {},
) => {
  const t = matchTitleTags(title, lang, index, sourceComps);
  return {
    teams: t.teams.map((h) => h.slug),
    players: t.players.map((h) => h.slug),
    comps: t.comps,
  };
};

describe("정규화", () => {
  it("latinSpaced: 발음 기호만 떼고 대소문자는 남긴다(겹치는 별칭의 대문자 시작 확인용)", () => {
    expect(latinSpaced("Cómo funciona — Atlético’s Barça")).toBe(
      " Como funciona Atletico s Barca ",
    );
  });
});

describe("라틴 제목 — 단어 경계·발음 기호·제목 안 순서", () => {
  it("사전 표기(영문 변형)·빅클럽 약칭으로 맞고, 제목 안 순서로 돌려준다", () => {
    expect(
      tags(
        "Solanke scores in added time as 10-man Spurs draw with Man Utd",
        "en",
      ).teams,
    ).toEqual(["tottenham-hotspur", "manchester-united"]);
    expect(
      tags(
        "Brilliant Guimaraes goal helps Arsenal fight back to beat Leeds",
        "en",
      ).teams,
    ).toEqual(["arsenal", "leeds-united"]);
    expect(
      tags("Bayern strike late to avoid shock defeat at Augsburg", "en").teams,
    ).toEqual(["bayern-munchen", "augsburg"]);
    expect(
      tags("Flick pierde a Raphinha, elogia al Barça", "es").teams,
    ).toEqual(["barcelona"]);
  });

  it("단어 경계 — 'Leedsfans'·'Arsenals'처럼 붙은 말에는 맞지 않는다", () => {
    expect(tags("Leedsfans and Arsenals collectors", "en").teams).toEqual([]);
  });

  it("선수는 사전 표기 그대로만(성만 쓴 이름은 사전에 그 표기가 있을 때만) — 등록 한국 선수 영문 이름", () => {
    expect(tags("Vini Jr. 'sorry' after red card", "en").players).toEqual([
      "vinicius-junior",
    ]);
    expect(tags("Kang-in Lee shines for Atleti", "en")).toMatchObject({
      teams: ["atletico-madrid"],
      players: ["lee-kang-in"],
    });
    // 성만 — 사전에 'Kane'·'Romero' 표기가 없다(같은 성의 다른 선수가 흔하다)
    expect(tags("Kane and Romero on target", "en").players).toEqual([]);
  });

  it("여자팀 표현이 하나라도 맞으면 여자팀 기사(팀 태그 없음 — 상대 팀도 여자팀), 제외 표현은 그 자리를 지운다 — Inter Miami·Juve Stabia", () => {
    expect(tags("Arsenal Women beat Chelsea Women", "en").teams).toEqual([]);
    expect(tags("Arsenal Women and Arsenal both win", "en").teams).toEqual([]);
    // M1-17 리뷰 — 여자팀 표현이 한쪽에만 붙어도 상대 팀을 남자팀으로 태그하지 않는다
    expect(tags("Arsenal Women beat Chelsea Women 2-1", "en").teams).toEqual(
      [],
    );
    expect(tags("Barcelona Femení golea al Real Madrid", "es").teams).toEqual(
      [],
    );
    expect(tags("Chelsea FC Women sign striker", "en").teams).toEqual([]);
    expect(tags("첼시 위민, 아스널 위민 꺾었다", "ko").teams).toEqual([]);
    expect(tags("PSG 위민 3-0 승리", "ko").teams).toEqual([]);
    expect(tags("Inter Miami sign striker", "en").teams).toEqual([]);
    expect(tags("Juve Stabia stun Bari", "it").teams).toEqual([]);
  });
});

describe("일반어·도시와 겹치는 별칭 (M1-21 리뷰 — 코드 상수 AMBIGUOUS_TAG_TERMS)", () => {
  it("목록: 영어 단어·스페인어 단어·도시·다른 종목과 겹치는 별칭", () => {
    for (const term of [
      "nice",
      "lens",
      "como",
      "angers",
      "athletic",
      "roma",
      "milan",
      "monza",
      "le mans",
      "valencia",
      "sevilla",
      "cologne",
      "toulouse",
      "porto",
      "santander",
    ]) {
      expect(AMBIGUOUS_TAG_TERMS.latin).toContain(term);
    }
  });

  it("발음 기호가 있는 원문('cómo'·'Cómo')·장소 앞말 뒤('in Milan'·'a Roma')는 겹치는 별칭이 아니다(M1-17 리뷰)", () => {
    expect(tags("Cómo juega el Real Madrid sin Mbappé", "es").teams).toEqual([
      "real-madrid",
    ]);
    expect(tags("¿Cómo ha cambiado el Barça de Flick?", "es").teams).toEqual([
      "barcelona",
    ]);
    expect(tags("Inter Milan fans in Milan protest", "en").teams).toEqual([
      "inter",
    ]);
    expect(tags("El Barça viaja a Roma sin Lewandowski", "es").teams).toEqual([
      "barcelona",
    ]);
    expect(tags("Inter Miami beat Orlando", "en").teams).toEqual([]);
    expect(tags("Porto and Benfica", "en").teams).toEqual([]);
  });

  it("스페인어 'cómo'(발음 기호를 떼면 Como)는 코모가 아니다 — 대문자로 시작해도 확인 근거가 없다", () => {
    expect(
      tags("Cómo funciona la Champions Cup de rugby: 24 equipos", "es", INDEX, {
        sourceComps: ["LALIGA"],
      }).teams,
    ).toEqual([]);
    expect(tags("Así juega como un líder", "es").teams).toEqual([]);
  });

  it("영어 일반어(nice·lens·angers·athletic)는 소문자면 아니고, 대문자 시작이어도 확인 근거가 있어야 한다", () => {
    expect(tags("A nice goal through the lens", "en").teams).toEqual([]);
    expect(tags("Manager's comments angers fans", "en").teams).toEqual([]);
    expect(tags("Athletic display from the winger", "en").teams).toEqual([]);
    expect(tags("Nice sack their coach", "en").teams).toEqual([]);
  });

  it("확인 근거 — 같은 리그의 다른 팀 · 그 팀 리그의 대회 표현 · 한 리그만 다루는 소스의 그 리그(다른 리그 팀·여러 리그 소스는 아니다)", () => {
    // 같은 리그의 다른 팀(겹치지 않는 표기)
    expect(tags("Inter, il Milan e la Roma", "it").teams).toEqual([
      "inter",
      "milan",
      "roma",
    ]);
    expect(tags("Lens and Lille share points", "en").teams).toEqual([
      "lens",
      "lille",
    ]);
    // 다른 리그 팀은 근거가 아니다(M1-17 리뷰 — 잘못 붙이기보다 안 붙이기)
    expect(tags("Feyenoord come from behind to beat Como", "en").teams).toEqual(
      ["feyenoord"],
    );
    expect(
      tags("Real Madrid stun Roma after late comeback", "en").teams,
    ).toEqual(["real-madrid"]);
    expect(tags("Nice touch: Saka inspires Arsenal", "en").teams).toEqual([
      "arsenal",
    ]);
    expect(
      tags("Milan fashion week: Chelsea star spotted", "en").teams,
    ).toEqual(["chelsea"]);
    // 여러 리그 소스(BBC European)의 대회는 근거가 아니다
    expect(
      tags("Nice goal from Kane as Bayern win", "en", INDEX, {
        sourceComps: ["LALIGA", "SERIEA", "BUNDESLIGA", "LIGUE1"],
      }).teams,
    ).toEqual(["bayern-munchen"]);
    // 리그 대회 표현
    expect(tags("Nice climb to third in Ligue 1", "en").teams).toEqual([
      "nice",
    ]);
    // 소스 대회(Di Marzio = 세리에 A)
    expect(
      tags("Roma, Gasperini: «Siamo pronti»", "it", INDEX, {
        sourceComps: ["SERIEA"],
      }).teams,
    ).toEqual(["roma"]);
    expect(tags("Roma, Gasperini: «Siamo pronti»", "it").teams).toEqual([]);
    // 겹치지 않는 표기는 근거 없이도 맞는다
    expect(
      tags("AC Milan keen on Scott - Sunday's gossip", "en").teams,
    ).toEqual(["milan"]);
    expect(tags("Como 1907 appoint new coach", "en").teams).toEqual(["como"]);
  });

  it("Milan, la probabile formazione contro il Sassuolo — 사수올로가 근거(Di Marzio 실데이터)", () => {
    expect(
      tags(
        "Milan, la probabile formazione contro il Sassuolo: Pulisic dietro a Ramos",
        "it",
      ).teams,
    ).toEqual(["milan", "sassuolo"]);
  });
});

describe("국내 제목 — 조사 경계(부분 문자열 금지)", () => {
  it("이름 뒤가 끝·글자 아님·조사(이/가·은/는·과/와·전·에서…)일 때만", () => {
    expect(
      tags("[분데스 REVIEW] 뮌헨, 노이어 부진 속 아우크스부르크와 2-2 무", "ko")
        .teams,
    ).toEqual(["bayern-munchen", "augsburg"]);
    expect(tags("맨시티전서 화끈한 골 폭발", "ko").teams).toEqual([
      "manchester-city",
    ]);
    expect(
      tags("‘이강인 컴백’ 아틀레티코, 알라베스 잡고 2위", "ko"),
    ).toMatchObject({
      teams: ["atletico-madrid", "alaves"],
      players: ["lee-kang-in"],
    });
  });

  it("다른 말 속의 짧은 이름은 아니다 — 테니스(니스)·프랑스(랑스)·로마노(로마)·포르투갈(포르투)·스릴(릴)", () => {
    expect(tags("테니스 스타, 프랑스 오픈 우승", "ko").teams).toEqual([]);
    expect(tags("로마노 기자 '히어 위 고'", "ko").teams).toEqual([]);
    expect(tags("포르투갈 대표팀 명단 발표", "ko").teams).toEqual([]);
    expect(tags("스릴 넘치는 승부", "ko").teams).toEqual([]);
  });

  it("조사·한자 접미 경계 — '토트넘전서'·'뮌헨行'(한자는 경계)·'토트넘인데'·'레알인가' (M1-17 리뷰 사례)", () => {
    expect(tags("토트넘전서 손흥민", "ko").teams).toEqual([
      "tottenham-hotspur",
    ]);
    expect(tags("뮌헨行 김민재", "ko")).toMatchObject({
      teams: [],
      players: ["kim-min-jae"],
    });
    expect(tags("토트넘인데", "ko").teams).toEqual([]);
    expect(tags("레알인가", "ko").teams).toEqual(["real-madrid"]);
    expect(tags("로마노 '히어 위 고'… 첼시 이적", "ko").teams).toEqual([
      "chelsea",
    ]);
    expect(
      tags("포르투갈 대표팀, 레알 마드리드 선수 소집", "ko").teams,
    ).toEqual(["real-madrid"]);
    expect(tags("테니스 선수가 아스널 팬", "ko").teams).toEqual(["arsenal"]);
  });

  it("짧은 겹치는 이름(로마·니스·렌·릴)은 같은 리그의 다른 팀·리그 표현이 있을 때만 — 다른 리그 팀(레알 마드리드)은 근거가 아니다", () => {
    expect(tags("프랑스 리그1 니스, 마르세유 격파", "ko").teams).toEqual([
      "nice",
      "marseille",
    ]);
    expect(
      tags("[UCL REVIEW] 레알 마드리드의 챔스 DNA…로마 원정서 극장승", "ko")
        .teams,
    ).toEqual(["real-madrid"]);
    expect(tags("로마에서 열린 시상식", "ko").teams).toEqual([]);
  });

  it("빅클럽 제외 표현 — 레알 소시에다드는 레알 마드리드가 아니다, 뮌헨글라트바흐는 바이에른이 아니다", () => {
    expect(tags("레알 소시에다드, 셀타 꺾고 3연승", "ko").teams).toEqual([
      "real-sociedad",
    ]);
    expect(tags("뮌헨글라트바흐 카스트로프 선발", "ko")).toMatchObject({
      teams: [],
      players: ["jens-castrop"],
    });
  });

  it("국내 제목 속 라틴 약칭(PSG·ATM)도 같은 경계", () => {
    expect(tags("PSG에 또 무너진 맨시티", "ko").teams).toEqual([
      "paris-saint-germain",
      "manchester-city",
    ]);
    expect(tags("ATM과 파트너십 체결", "ko").teams).toEqual([
      "atletico-madrid",
    ]);
  });
});

describe("색인 — 사전 slug·리그·사전 확장", () => {
  it("태그 slug는 모두 사전(names.ko.json) 또는 빅클럽 표·등록 한국 선수 slug다", () => {
    const slugs = new Set(
      NAMES.entries.flatMap((e) => (e.slug ? [e.slug] : [])),
    );
    for (const tag of INDEX.players) expect(slugs.has(tag.slug)).toBe(true);
    for (const tag of INDEX.teams) {
      expect(slugs.has(tag.slug) || tag.slug === "inter").toBe(true);
    }
  });

  it("tagLeagues: 팀 → 리그(team-leagues.ts), 활성 등록 한국 선수 → 소속 리그(비활성은 아니다)", () => {
    expect(
      tagLeagues(["arsenal", "club-brugge"], ["kim-min-jae"], INDEX),
    ).toEqual(["EPL", "BUNDESLIGA"]);
    expect(tagLeagues([], ["hong-hyun-seok"], INDEX)).toEqual([]); // 미트윌란(active false)
  });

  it("unionTags: 앞 제목 먼저, 중복 없음", () => {
    expect(
      unionTags([
        [
          { slug: "b", pos: 3 },
          { slug: "a", pos: 9 },
        ],
        [
          { slug: "a", pos: 0 },
          { slug: "c", pos: 1 },
        ],
      ]),
    ).toEqual(["b", "a", "c"]);
  });

  it("dropSharedTerms: 둘 이상의 대상이 쓰는 표기는 뺀다(누구인지 모른다)", () => {
    const out = dropSharedTerms([
      {
        slug: "x",
        kind: "player",
        latin: ["Martinez", "Lisandro Martinez"],
        ko: [],
      },
      {
        slug: "y",
        kind: "player",
        latin: ["Martínez", "Lautaro Martinez"],
        ko: [],
      },
    ]);
    expect(out.map((s) => s.latin)).toEqual([
      ["Lisandro Martinez"],
      ["Lautaro Martinez"],
    ]);
  });

  it("사전(M1-21 최종 — D46 확정분 포함)과 별칭 확장 흉내에서 같은 규칙 — 'Aston Villa revival'·'Crystal Palace beat Nottingham Forest'", () => {
    const extra = buildTagIndex({
      names: namesWithExtras(NAMES),
      koreanPlayers: PLAYERS,
    });
    expect(
      tags(
        "Jackson steps up again as Aston Villa revival continues",
        "en",
        extra,
      ).teams,
    ).toEqual(["aston-villa"]);
    // D46 표기(사전 그대로)
    const palace =
      "Glasner suffers loss on Selhurst return as Crystal Palace beat Nottingham Forest";
    expect(tags(palace, "en").teams).toEqual([
      "crystal-palace",
      "nottingham-forest",
    ]);
    expect(tags(palace, "en", extra).teams).toEqual([
      "crystal-palace",
      "nottingham-forest",
    ]);
    // 짧은 별칭(확장 흉내)
    expect(tags("Palace beat Forest at Selhurst", "en", extra).teams).toEqual([
      "crystal-palace",
      "nottingham-forest",
    ]);
    expect(
      tags("Brighton seafront: Brentford fans travel", "en").teams,
    ).toEqual(["brighton", "brentford"]);
    expect(tags("Real Sociedad 2-1 Real Madrid", "en").teams).toEqual([
      "real-sociedad",
      "real-madrid",
    ]);
    expect(tags("Atletico Madrid vs Real Madrid", "en").teams).toEqual([
      "atletico-madrid",
      "real-madrid",
    ]);
    expect(tags("Manchester derby: United v City", "en").teams).toEqual([]);
  });

  it("설정이 없으면(null) 빅클럽 표만", () => {
    const bare = buildTagIndex({});
    expect(tags("Arsenal beat Leeds", "en", bare).teams).toEqual(["arsenal"]);
    expect(bare.players).toEqual([]);
  });
});
