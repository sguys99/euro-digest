/**
 * 검색 모델·레코드 (M4-14, FR-130·FR-131) — 메타 해석 · 태그 인코딩 · 가나다 색인 · 검색어 · 접두 되물림 거르기 · 별칭 · 레코드 · 색인 수 검사
 */
import { describe, expect, it } from "vitest";

import { indexedRecordCount } from "../scripts/lib/search-index";
import {
  decodeTags,
  encodeTags,
  groupByInitial,
  hitFromData,
  indexInitial,
  matchesQuery,
  META,
  normalizeQuery,
  queryFromSearch,
  resultText,
  searchTokens,
} from "@/lib/search/model";
import {
  aliasList,
  competitionSearchRecord,
  koreanGivenName,
  newsSearchRecord,
  playerSearchRecord,
  teamSearchRecord,
  teamSubText,
} from "@/lib/search/records";

const KMJ = {
  nameKo: "김민재",
  nameEn: "Min-jae Kim",
  enVariants: ["Min-jae Kim", "Kim Min-jae", "Minjae Kim"],
};

describe("별칭(FR-131)", () => {
  it("한글 세 글자 이름만 이름 부분을 뗀다", () => {
    expect(koreanGivenName("김민재")).toBe("민재");
    expect(koreanGivenName(" 이강인 ")).toBe("강인");
    expect(koreanGivenName("옌스 카스트로프")).toBeNull();
    expect(koreanGivenName("남궁민수")).toBeNull();
    expect(koreanGivenName("손흥")).toBeNull();
    expect(koreanGivenName("Kane")).toBeNull();
  });

  it("aliasList — 공백 정리 · 빈 값 제거 · 대소문자 무시 중복 제거(처음 꼴 유지)", () => {
    expect(
      aliasList("Bayern", null, ["bayern", " FC  Bayern "], undefined, ""),
    ).toEqual(["Bayern", "FC Bayern"]);
  });

  it("선수 레코드 — 한글 · 이름 · 영문 변형 · 소속팀, 메타에 배지 글자색을 계산해 넣는다", () => {
    const r = playerSearchRecord({
      ...KMJ,
      position: "DF",
      team: {
        name: "바이에른 뮌헨",
        short: "FCB",
        colors: ["#D3052B", "#FFFFFF"],
      },
    });
    expect(r.type).toBe("player");
    expect(r.aliases).toEqual([
      "김민재",
      "민재",
      "Min-jae Kim",
      "Kim Min-jae",
      "Minjae Kim",
      "바이에른 뮌헨",
    ]);
    expect(Object.fromEntries(r.meta)).toEqual({
      [META.title]: "김민재",
      [META.en]: "Min-jae Kim",
      [META.team]: "바이에른 뮌헨",
      [META.pos]: "DF",
      [META.short]: "FCB",
      [META.k1]: "#D3052B",
      [META.k2]: "#FFFFFF",
      [META.kf]: "#FFFFFF",
    });
  });

  it("팀 레코드 — 한국 선수(이름 포함) · 화면 선수 이름 · 약어, 보조 글자는 한국 선수만(대회 이름 없음)", () => {
    const r = teamSearchRecord({
      nameKo: "바이에른 뮌헨",
      nameEn: "FC Bayern München",
      enVariants: [
        "FC Bayern München",
        "Bayern München",
        "Bayern Munich",
        "Bayern",
      ],
      short: "FCB",
      colors: null,
      korean: [KMJ],
      squad: ["Harry Kane", "해리 케인", "H. Kane"],
    });
    expect(r.aliases).toEqual(
      expect.arrayContaining([
        "바이에른 뮌헨",
        "Bayern",
        "FCB",
        "민재",
        "Kim Min-jae",
        "해리 케인",
      ]),
    );
    const meta = Object.fromEntries(r.meta);
    expect(meta[META.sub]).toBe("김민재 소속");
    // 색이 없으면 색 메타 없음(폴백 배지)
    expect(meta[META.k1]).toBeUndefined();
    expect(teamSubText({ korean: [] })).toBe("");
    expect(teamSubText({ korean: [KMJ, { ...KMJ, nameKo: "정우영" }] })).toBe(
      "김민재 · 정우영 소속",
    );
  });

  it("대회 레코드 — 한글 · 약칭 · 영문 · ID", () => {
    const r = competitionSearchRecord({
      id: "EPL",
      nameKo: "프리미어리그",
      nameEn: "Premier League",
      shortKo: "EPL",
    });
    expect(r.aliases).toEqual(["프리미어리그", "EPL", "Premier League"]);
    expect(Object.fromEntries(r.meta)[META.comp]).toBe("EPL");
  });
});

describe("뉴스 레코드", () => {
  const card = {
    id: "c_0123456789",
    t: "Kane misses Bayern penalty",
    lang: "en",
    kr: true,
    spoiler: true,
    src: [
      {
        n: "BBC Sport",
        u: "https://www.bbc.co.uk/sport/football/1",
        at: "2026-11-01T20:00:00Z",
        tier: 1 as const,
      },
    ],
  };

  it("제목 그대로 + 분류 · 태그 한글 · 태그 영문 변형 · 출처명이 본문, 메타에 결과 가림 · 정렬 키", () => {
    const r = newsSearchRecord({
      card,
      url: "/news/2026-11-02/#c_0123456789",
      category: "경기 결과",
      tags: [
        { label: "바이에른 뮌헨", korean: false },
        { label: "김민재", korean: true },
      ],
      tagAliases: ["Bayern", "Kim Min-jae"],
      sourceLang: "en",
      abs: "11.02 05:00",
    });
    expect(r.content).toBe(
      "Kane misses Bayern penalty 경기 결과 바이에른 뮌헨 김민재 Bayern Kim Min-jae BBC Sport",
    );
    expect(r.meta).toMatchObject({
      title: "Kane misses Bayern penalty",
      link: "https://www.bbc.co.uk/sport/football/1",
      tags: "바이에른 뮌헨|*김민재",
      kr: "1",
      spoiler: "1",
      abs: "11.02 05:00",
    });
    expect(r.filters).toEqual({ type: ["news"], lang: ["en"] });
    expect(r.sort).toEqual({ at: "2026-11-01T20:00:00Z" });
    expect(r.language).toBe("ko");
  });

  it("결과 가림·한국이 아니면 그 메타를 넣지 않는다", () => {
    const r = newsSearchRecord({
      card: { ...card, kr: false, spoiler: false },
      url: "/news/2026-11-02/#c_0123456789",
      category: "기타",
      tags: [],
      tagAliases: [],
      sourceLang: "en",
      abs: "11.02 05:00",
    });
    expect(r.meta.kr).toBeUndefined();
    expect(r.meta.spoiler).toBeUndefined();
    expect(r.meta.tags).toBeUndefined();
  });
});

describe("결과 해석", () => {
  it("선수 · 팀 · 대회 · 뉴스 메타 → 화면 결과", () => {
    expect(
      hitFromData("player", {
        url: "/euro-digest/korean-players/kim-min-jae/",
        meta: {
          title: "김민재",
          en: "Min-jae Kim",
          team: "바이에른 뮌헨",
          pos: "DF",
          short: "FCB",
          k1: "#D3052B",
          k2: "#FFFFFF",
          kf: "#FFFFFF",
        },
      }),
    ).toEqual({
      type: "player",
      url: "/euro-digest/korean-players/kim-min-jae/",
      name: "김민재",
      en: "Min-jae Kim",
      team: "바이에른 뮌헨",
      pos: "DF",
      kit: { short: "FCB", colors: ["#D3052B", "#FFFFFF", "#FFFFFF"] },
    });
    // 색이 형식에 맞지 않으면 폴백 배지
    expect(
      hitFromData("team", {
        url: "/t/",
        meta: { title: "팀", short: "AAA", k1: "red" },
      }),
    ).toMatchObject({ kit: { short: "AAA", colors: null }, sub: "" });
    expect(
      hitFromData("competition", {
        url: "/c/",
        meta: { title: "UCL", comp: "UCL", short: "UCL" },
      }),
    ).toMatchObject({ comp: "UCL" });
    expect(
      hitFromData("competition", {
        url: "/c/",
        meta: { title: "X", comp: "XXX" },
      }),
    ).toMatchObject({ comp: null });
  });

  it("뉴스 — 원문 링크가 http(s)가 아니거나 제목이 없으면 그리지 않는다", () => {
    const meta = {
      title: "t",
      link: "https://a.example/1",
      tags: "*김민재|팀",
      spoiler: "1",
      kr: "1",
    };
    expect(hitFromData("news", { url: "/n/#c", meta })).toMatchObject({
      tags: [
        { label: "김민재", korean: true },
        { label: "팀", korean: false },
      ],
      spoiler: true,
      kr: true,
      lang: "ko",
    });
    expect(
      hitFromData("news", {
        url: "/n/",
        meta: { ...meta, link: "javascript:alert(1)" },
      }),
    ).toBeNull();
    expect(
      hitFromData("news", { url: "/n/", meta: { ...meta, title: " " } }),
    ).toBeNull();
  });

  it("태그 인코딩 왕복 — 구분 글자 · 앞 별표는 지운다", () => {
    const tags = [
      { label: "A|B", korean: false },
      { label: "*김민재", korean: true },
      { label: " ", korean: false },
    ];
    expect(encodeTags(tags)).toBe("A B|*김민재");
    expect(decodeTags(encodeTags(tags))).toEqual([
      { label: "A B", korean: false },
      { label: "김민재", korean: true },
    ]);
    expect(decodeTags("")).toEqual([]);
  });
});

describe("가나다 색인", () => {
  it("초성 — 된소리는 예사소리 칸, 한글이 아니면 대문자", () => {
    expect(indexInitial("김민재")).toBe("ㄱ");
    expect(indexInitial("꽃")).toBe("ㄱ");
    expect(indexInitial("황희찬")).toBe("ㅎ");
    expect(indexInitial("옌스 카스트로프")).toBe("ㅇ");
    expect(indexInitial("kane")).toBe("K");
    expect(indexInitial("")).toBe("#");
  });

  it("가나다순 → 초성 칸", () => {
    const groups = groupByInitial([
      { slug: "c", nameKo: "황희찬", nameEn: "" },
      { slug: "a", nameKo: "김지수", nameEn: "" },
      { slug: "b", nameKo: "김민재", nameEn: "" },
      { slug: "d", nameKo: "설영우", nameEn: "" },
    ]);
    expect(
      groups.map((g) => [g.initial, g.entries.map((e) => e.nameKo)]),
    ).toEqual([
      ["ㄱ", ["김민재", "김지수"]],
      ["ㅅ", ["설영우"]],
      ["ㅎ", ["황희찬"]],
    ]);
  });
});

describe("검색어", () => {
  it("공백 정리 · 60자 자름 · 주소 쿼리", () => {
    expect(normalizeQuery("  김민재   바이에른 ")).toBe("김민재 바이에른");
    expect(normalizeQuery("가".repeat(80))).toHaveLength(60);
    expect(queryFromSearch("?q=%EA%B9%80%EB%AF%BC%EC%9E%AC")).toBe("김민재");
    expect(queryFromSearch("?q=Kim+Min-jae")).toBe("Kim Min-jae");
    expect(queryFromSearch("")).toBe("");
  });

  it("비교 낱말 — 소문자 · 악센트 제거 · 붙임표에서 자름", () => {
    expect(searchTokens("FC Bayern München, Min-jae!")).toEqual([
      "fc",
      "bayern",
      "munchen",
      "min",
      "jae",
    ]);
  });

  it("접두 되물림 거르기 — 실측 사례", () => {
    // 앞부분 일치는 받는다
    expect(matchesQuery("김민", "김민재 민재")).toBe(true);
    expect(matchesQuery("Min-jae", "Min-jae Kim")).toBe(true);
    expect(matchesQuery("munchen", "FC Bayern München")).toBe(true);
    // 조사가 붙은 검색어 → 이름(3/4)
    expect(matchesQuery("김민재가", "김민재 선발")).toBe(true);
    // Pagefind가 'ma'로 되물러 찾은 이탈리아어 기사 · 'z' 낱말
    expect(
      matchesQuery(
        "Magdeburg",
        "Napoli, Manna: Bisogna avere pazienza con Lucca, ma neanche troppa",
      ),
    ).toBe(false);
    expect(matchesQuery("zzzz", "Zürich z")).toBe(false);
    // 여러 낱말은 모두 맞아야
    expect(matchesQuery("김민재 아스널", "김민재 바이에른")).toBe(false);
    expect(matchesQuery("", "아무것")).toBe(false);
  });

  it("비교 글자 = 본문 + 메타 값", () => {
    expect(
      resultText({
        url: "/",
        content: "본문",
        meta: { title: "제목", en: "En" },
      }),
    ).toBe("본문 제목 En");
  });
});

describe("색인 수 검사(scripts/build-search.ts)", () => {
  it("pagefind-entry.json — 한국어 색인 하나의 레코드 수, 언어가 갈리면 -1", () => {
    expect(
      indexedRecordCount(
        '{"version":"1.5.2","languages":{"ko":{"hash":"ko_1","wasm":null,"page_count":808}}}',
      ),
    ).toBe(808);
    expect(
      indexedRecordCount(
        '{"languages":{"ko":{"page_count":1},"en":{"page_count":2}}}',
      ),
    ).toBe(-1);
    expect(indexedRecordCount('{"languages":{"en":{"page_count":2}}}')).toBe(
      -1,
    );
  });
});
