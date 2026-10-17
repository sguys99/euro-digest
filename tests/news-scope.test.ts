/**
 * M1-17 — 서비스 범위 밖 기사 제외(scripts/lib/news-scope.ts — 축구 외 종목·K리그·연예, 클러스터링 전 묶음 단계).
 *
 * 고정하는 것
 *   - 축구 외: 다른 종목 표현 + 축구라는 명시적 근거 없음(팀 이름은 근거가 아니다 — NFL 런던 경기 'en Tottenham'), 'en el fútbol'·
 *     등록 한국 선수가 있으면 남긴다(NBA 스타가 아틀레티코 주주로)
 *   - K리그(국내): K리그 표현·구단 이름 + 유럽 축구 근거 없음, 구단 이름만이면 대표팀 표현이 남긴다
 *   - 연예(국내): 연예 표현·'♥' + 축구 근거 없음 — 등록 선수 이름(동명이인 배우 김지수)은 근거가 아니다
 *   - 요약문은 남기는 근거로만(제외 신호는 제목에서만 — 과잉 제외 방지)
 *   - 실데이터: fixtures/cluster window 198건 중 43건 제외(사람이 본 결과 전부 범위 밖 — 오탐 0), fixtures/rss 범위 밖 태그 3건 전부 제외·
 *     나머지 오탐 0 — 사전이 늘어나도(D46 확정분 흉내) 같은 결과
 * 네트워크 없음. 요약문은 합성 문자열(D39 — fixture에는 없다).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  KoreanPlayersFileSchema,
  NamesKoFileSchema,
  type FeedItem,
  type NamesKoFile,
} from "@/lib/schema";

import type { DedupGroup } from "../scripts/lib/dedup";
import { buildKeywordIndex } from "../scripts/lib/news-keywords";
import {
  filterOutOfScope,
  scopeExclusion,
  type ScopeContext,
} from "../scripts/lib/news-scope";
import { buildTagIndex } from "../scripts/lib/tag-names";

import { namesWithExtras } from "./support/names-extras";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const NAMES = NamesKoFileSchema.parse(readJson("configs/names.ko.json"));
const PLAYERS = KoreanPlayersFileSchema.parse(
  readJson("configs/korean-players.json"),
);
const ctxOf = (names: NamesKoFile): ScopeContext => ({
  keywords: buildKeywordIndex({ names, koreanPlayers: PLAYERS }),
  tags: buildTagIndex({ names, koreanPlayers: PLAYERS }),
});
const CTX = ctxOf(NAMES);
const CTX_EXTRA = ctxOf(namesWithExtras(NAMES));

const verdict = (
  title: string,
  lang = "es",
  summary: string | null = null,
  ctx = CTX,
) => scopeExclusion({ title, lang, summary }, ctx);

describe("축구 외 종목 (non-football)", () => {
  it("Relevo 종합 스포츠 실데이터 — F1·체조·럭비·마라톤·테니스·NFL", () => {
    for (const title of [
      "Vuelve el sonido real de la F1: los motores V8 estarán de regreso en 2030",
      "España afronta el Mundial de Gimnasia Artística de Róterdam con plaza olímpica en juego",
      "Cómo funciona la Champions Cup de rugby: 24 equipos, cuatro jornadas y reglas nuevas",
      "El Maratón de Ámsterdam, el otoño rápido fuera de las Majors",
      "Charo Esquiva, la joya del tenis español que sigue los pasos de Garbiñe Muguruza",
      "Eagles-Jaguars en Tottenham: la NFL vuelve a Londres y Jacksonville estrena dos partidos seguidos como local",
    ]) {
      expect(verdict(title), title).toBe("non-football");
    }
  });

  it("팀 이름만으로는 축구 기사로 보지 않는다(NFL 'en Tottenham'·레알 마드리드 농구), 축구 표현·대회·등록 한국 선수는 남긴다", () => {
    expect(verdict("El Real Madrid de baloncesto gana en la Euroliga")).toBe(
      "non-football",
    );
    expect(
      verdict(
        "Shai Gilgeous-Alexander, nuevo accionista del Atlético, amplía la creciente lista NBA en el fútbol",
      ),
    ).toBeNull();
    expect(
      verdict(
        "[오피셜] NBA 슈퍼스타가 이강인 팀의 ‘구단주 그룹’에 합류한다… ATM과 파트너십 체결",
        "ko",
      ),
    ).toBeNull();
    expect(verdict("La NFL y LaLiga firman un acuerdo")).toBeNull(); // 대회 표현
  });

  it("축구에서도 쓰는 말은 다른 종목 신호가 아니다 — Boxing Day·마라톤 협상·핸드볼 반칙·'Athletic'", () => {
    expect(verdict("Boxing Day fixtures confirmed", "en")).toBeNull();
    expect(verdict("김민재 이적, 마라톤 협상 끝 합의", "ko")).toBeNull();
    expect(verdict("VAR 핸드볼 반칙 논란", "ko")).toBeNull();
    expect(verdict("Athletic Club stun Real Sociedad", "en")).toBeNull();
  });

  it("UFC·야구(국내 전체기사) — 제외, '축구'가 있으면 남긴다", () => {
    expect(verdict("UFC 챔피언, 타이틀 방어 성공", "ko")).toBe("non-football");
    expect(verdict("KBO 가을야구 개막", "ko")).toBe("non-football");
    expect(verdict("야구 선수 출신의 축구 해설", "ko")).toBeNull();
  });
});

describe("K리그·국내 축구 (k-league)", () => {
  it("K리그 표현·[케리뷰]·구단 이름 + 유럽 근거 없음 → 제외", () => {
    for (const title of [
      "'윌리안 결승골' 천안, 13경기 무승 탈출! 경남 발목 잡고 '234일 만에 승전고'  [케리뷰]",
      "‘시즌 첫 3연승’ 충북청주, 성남 3-1 제압… 가르시아 14골·반데이라 8도움",
      "[오피셜] 서울 클리말라, K리그 9월 이달의 선수상 차지…커리어 첫 번째 수상",
      "포항, 안양 상대로 정규리그 마지막 홈경기 앞뒀다… 시즌 첫 ‘멤버십 데이’",
      "“축구 선수처럼 해보고 싶어요”…충남아산, 지역 어린이들과 축구 수업",
      "‘꿈나무들의 축구 축제!’… 부천, '2026 키즈월드컵' 성황리에 마무리",
    ]) {
      expect(verdict(title, "ko"), title).toBe("k-league");
    }
  });

  it("유럽 축구 근거(빅클럽·사전 팀·대회·등록 한국 선수)가 있으면 남긴다", () => {
    expect(verdict("울산 출신 설영우, 아우크스부르크 선발", "ko")).toBeNull();
    expect(verdict("K리그 출신 김민재, 뮌헨 주전 굳혔다", "ko")).toBeNull();
    expect(verdict("전북 레전드, 프리미어리그 진출", "ko")).toBeNull();
  });

  // M1-17 재리뷰 — 오케스트레이터 결정(2026-10-17): 대표팀 발탁·소집·명단 기사는 K리그 선수 이야기라도 남긴다(A매치 — 서비스 범위).
  // 판정은 분류의 대표팀 판정(classify.ts isNationalText)과 같다. 이전 단언('K리그 득점왕, 대표팀 첫 발탁' → k-league)은 이 결정으로 뒤집었다
  it("대표팀 기사는 K리그 표현·구단 이름이 있어도 남긴다(A매치 — 서비스 범위, 분류의 대표팀 판정과 같다), 대표팀 약한 근거 + 결과 표현은 K리그 경기", () => {
    for (const title of [
      "모레노호 명단 발표… 울산 이동경·전북 송민규 승선",
      "K리그 득점왕, 대표팀 첫 발탁",
      "K리그 MVP 이동경, 대표팀 발탁",
      "K리그 득점왕 주민규, 국가대표 재발탁",
      "파라과이전 앞둔 대표팀, K리그 선수 중용",
      "[K리그] 대표팀 소집 앞둔 이동경",
      "울산, 대표팀 차출로 고민",
    ]) {
      expect(verdict(title, "ko"), title).toBeNull();
    }
    for (const title of [
      "국가대표 출신 K리그 감독",
      "울산, 대표팀 차출에도 포항 2-1 격파",
    ]) {
      expect(verdict(title, "ko"), title).toBe("k-league");
    }
  });

  it("해외 제목에는 K리그 규칙을 쓰지 않는다", () => {
    expect(verdict("Ulsan beat Pohang in K League", "en")).toBeNull();
  });
});

describe("연예 (entertainment)", () => {
  it("인터풋볼 전체기사 실데이터 — 신보·음악·♥·팬미팅·숏필름·신곡·[Y터뷰]·영화제·[Y현장]·전속계약·캐스팅·콘서트", () => {
    for (const title of [
      "아이브 가을·리즈, 만화 속 히어로 변신…신보 '룩스 캔 킬' 기대감",
      "자이언티, 익숙한 동네 풍경을 음악으로…'연희동에서' 오늘 공개",
      '솔비♥이규한, 예비 부부의 첫 투샷…"인생의 동반자 만나"',
      "이기택, 거침없는 행보...글로벌 팬미팅부터 드라마·영화까지",
      "로이킴, 추영우·박형식 이어 곽범·엄지윤까지…'크게 울어라' 숏필름 화제",
      "미라클, 오늘(15일) 신곡 '오색 낙원' 발매…자신만의 색을 찾는 여정",
      "[Y터뷰] '나충전' 채수빈 \"뽀글머리의 보배, 사랑받아 다행…휴먼 드라마도 하고파\"",
      "제31회 부산국제영화제, 관객 20만 명 돌파…2015년 이후 처음",
      "[Y현장] '천만 감독' 장항준의 파격 오디션…송은이·김풍과 펼칠 '거장항준'의 세계",
      '빅톤 강승식, 빅스테이지와 전속계약…"배우로서 성장 도울 것"',
      "김승호, '너에게 다이브' 이어 '궁전랜드' 캐스팅…차세대 기대주 행보",
      "패닉, 12월 다시 만난다...단독 콘서트 개최",
    ]) {
      expect(verdict(title, "ko"), title).toBe("entertainment");
    }
  });

  it("동명이인 — 등록 선수 이름(김지수·정우영)은 축구 근거가 아니다, 축구 표현·빅클럽·사전 팀은 근거다", () => {
    expect(verdict("배우 출신 김지수, 드라마 OST 참여", "ko")).toBe(
      "entertainment",
    );
    expect(verdict('정우영 열애설… 소속사 "사실무근"', "ko")).toBe(
      "entertainment",
    );
    expect(verdict("토트넘 팬 가수, 콘서트에서 응원가", "ko")).toBeNull();
    expect(verdict("축구 국가대표 출신 배우로서 새 출발", "ko")).toBeNull();
  });

  it("축구 제목에 쓰는 말은 연예 신호가 아니다 — 영화 같은 역전극·한 편의 드라마·부상 복귀 컴백·배우고 싶다", () => {
    expect(verdict("영화 같은 역전극! 한 편의 드라마", "ko")).toBeNull();
    expect(verdict("‘컴백’ 황희찬, 복귀전 소화", "ko")).toBeNull();
    expect(verdict("케인에게 배우고 싶다", "ko")).toBeNull();
  });
});

describe("요약문 — 남기는 근거로만(D39 ①, 합성 문자열)", () => {
  it("제목만 보면 다른 종목이어도 요약문에 축구 근거가 있으면 남긴다", () => {
    expect(
      verdict(
        "Las claves del Gran Premio de la temporada",
        "es",
        "El fútbol y la Fórmula 1 comparten patrocinador",
      ),
    ).toBeNull();
    expect(verdict("Las claves del Gran Premio de la temporada", "es")).toBe(
      "non-football",
    );
  });

  it("요약문의 다른 종목·K리그·연예 표현은 제외 신호가 아니다(제외는 제목 신호로만)", () => {
    expect(
      verdict(
        "Arsenal sign striker",
        "en",
        "He also played tennis and golf as a child",
      ),
    ).toBeNull();
    expect(
      verdict(
        "맨유 수비수 영입 확정",
        "ko",
        "K리그 울산 출신으로 콘서트에도 갔다",
      ),
    ).toBeNull();
  });
});

// ─── 실데이터 묶음 단계 ─────────────────────────────────────────────────────

interface ClusterSample {
  items: Array<{
    id: string;
    sample: string;
    source: string;
    lang: string;
    publishedAt: string;
    title: string;
  }>;
}
const CLUSTER = readJson(
  "fixtures/cluster/titles-2026-10-15.json",
) as ClusterSample;

const groupOf = (i: ClusterSample["items"][number]): DedupGroup => ({
  key: i.id,
  item: {
    title: i.title,
    url: `https://example.com/${i.id}`,
    publishedAt: i.publishedAt,
    summary: null,
    source: i.source,
    author: null,
    authors: [],
    lang: i.lang,
  } satisfies FeedItem,
  sources: [i.source],
  count: 1,
});

/** 사람이 본 window 198건 중 범위 밖(축구 외·K리그·연예) — 이 규칙이 뺀 43건 전부 범위 밖이었다(오탐 0) */
const EXPECTED_EXCLUDED: Record<string, string[]> = {
  "non-football": ["t064", "t065", "t074", "t075", "t077"],
  "k-league": [
    "t099",
    "t110",
    "t130",
    "t133",
    "t134",
    "t135",
    "t137",
    "t143",
    "t147",
    "t152",
    "t169",
    "t170",
    "t171",
    "t172",
    "t174",
    "t175",
    "t176",
    "t177",
    "t178",
    "t179",
    "t180",
    "t181",
    "t182",
    "t183",
    "t189",
  ],
  entertainment: [
    "t100",
    "t102",
    "t103",
    "t105",
    "t106",
    "t107",
    "t108",
    "t109",
    "t111",
    "t112",
    "t113",
    "t116",
    "t117",
  ],
};
/**
 * 사람이 범위 밖으로 본 남은 6건(이 규칙이 남긴 것 — 점수화 범위 감점 0.5가 아래로 내린다): Relevo 테니스(선수 이름만)·모터사이클
 * (Jerez), 연예 표현 없는 연예 기사 2건, '부산' 훈련장(도시 이름만 — 규칙이 도시 이름 '부산'은 쓰지 않는다), K리그 시상(구단 이름 + 대표팀 표현)
 */
const KNOWN_MISSES = ["t068", "t070", "t101", "t115", "t136", "t173"];

describe.each([
  ["현재 사전", CTX],
  ["사전 + D46 확정분 흉내", CTX_EXTRA],
] as const)("실데이터 — %s", (_label, ctx) => {
  it("fixtures/cluster window 198건: 43건 제외(축구 외 5·K리그 25·연예 13), 사람이 본 범위 밖 49건 중 43건(재현 88%)·오탐 0", () => {
    const window = CLUSTER.items.filter((i) => i.sample === "window");
    expect(window).toHaveLength(198);
    const result = filterOutOfScope(window.map(groupOf), ctx);
    expect(result.excluded).toEqual({
      "non-football": 5,
      "k-league": 25,
      entertainment: 13,
    });
    const keptIds = new Set(result.kept.map((g) => g.key));
    for (const [reason, ids] of Object.entries(EXPECTED_EXCLUDED)) {
      for (const id of ids) {
        expect(keptIds.has(id), `${id} ${reason}`).toBe(false);
        const it = window.find((i) => i.id === id)!;
        expect(
          scopeExclusion(
            { title: it.title, lang: it.lang, summary: null },
            ctx,
          ),
        ).toBe(reason);
      }
    }
    for (const id of KNOWN_MISSES) expect(keptIds.has(id)).toBe(true);
    expect(result.kept).toHaveLength(155);
    expect(result.bySource).toMatchObject({ relevo: 5 });
  });

  it("fixtures/cluster older 54건(해외 축구만): 제외 0", () => {
    const older = CLUSTER.items.filter((i) => i.sample === "older");
    expect(filterOutOfScope(older.map(groupOf), ctx).kept).toHaveLength(54);
  });

  it("fixtures/rss 고유 링크: 범위 밖 태그(non-football·k-league) 3건 전부 제외, 나머지 오탐 0", () => {
    const rss = readJson("fixtures/rss/index.json") as {
      sources: Array<{
        id: string;
        items: Array<{ title: string; link: string; tags: string[] }>;
      }>;
    };
    const langOf = (id: string) =>
      /interfootball|footballist|besteleven/.test(id)
        ? "ko"
        : id === "relevo"
          ? "es"
          : id === "di-marzio"
            ? "it"
            : "en";
    const seen = new Set<string>();
    let hit = 0;
    let falseHit = 0;
    for (const s of rss.sources) {
      for (const it of s.items) {
        if (seen.has(it.link)) continue;
        seen.add(it.link);
        const out = scopeExclusion(
          { title: it.title.trim(), lang: langOf(s.id), summary: null },
          ctx,
        );
        const expected =
          it.tags.includes("non-football") || it.tags.includes("k-league");
        if (expected && out !== null) hit += 1;
        if (!expected && out !== null) falseHit += 1;
      }
    }
    expect([hit, falseHit]).toEqual([3, 0]);
  });
});
