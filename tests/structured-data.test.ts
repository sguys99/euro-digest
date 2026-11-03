// src/lib/structured-data.ts — 구조화 데이터(JSON-LD) 노드 · 직렬화 (M5-03, PRD NFR-03 · §15 D74)
// 외부 검증 서비스를 부르지 않는다 — schema.org 유형별 필수 필드 · 금지 필드(스코어 · 로고 · 다른 매체 기사)를 구조로 본다.
import { describe, expect, it } from "vitest";

import { newsOgCard } from "@/lib/og";
import type { Match } from "@/lib/schema/competition";
import { ogImageMeta, SITE_DESCRIPTION } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";
import {
  assertNoScoreInJsonLd,
  briefDescription,
  briefHeadline,
  COMPETITION_EVENT_LIMIT,
  eventInputs,
  eventsJsonLd,
  issueJsonLd,
  type JsonLdNode,
  organizationId,
  personJsonLd,
  serializeJsonLd,
  siteJsonLd,
  sportsEventNode,
  teamId,
  teamJsonLd,
  upcomingMatches,
  websiteId,
} from "@/lib/structured-data";

const SITE = "https://sguys99.github.io/euro-digest";
const NOW = Date.parse("2026-11-03T00:00:00Z");

/** 노드 트리의 모든 키(중첩 포함) */
function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [k, ...allKeys(v)]);
  }
  return [];
}

function match(patch: Partial<Match> & Pick<Match, "id" | "kickoff">): Match {
  return {
    comp: "EPL",
    round: "11",
    home: "arsenal",
    away: "chelsea",
    score: null,
    status: "scheduled",
    ...patch,
  };
}

const lookup = (slug: string) => ({
  slug,
  name: slug === "arsenal" ? "아스널" : slug === "chelsea" ? "첼시" : slug,
  page: slug !== "ext-fc",
});
const epl = () => ({ id: "EPL" as const, name: "프리미어리그" });

describe("serializeJsonLd — 스크립트 주입 방지", () => {
  it("< > & U+2028 U+2029를 \\uXXXX로 바꾸고, JSON으로 다시 읽으면 원래 값", () => {
    const data: JsonLdNode = {
      name: "</script><script>alert(1)</script> & <!-- \u2028\u2029",
    };
    const text = serializeJsonLd(data);
    expect(text).not.toMatch(/[<>&\u2028\u2029]/);
    expect(text.toLowerCase()).not.toContain("</script");
    expect(JSON.parse(text)).toEqual(data);
  });
});

describe("결과 노출 0 — assertNoScoreInJsonLd", () => {
  it("글자 필드(name · headline · description · alternateName)의 스코어 모양은 던진다", () => {
    for (const key of ["name", "headline", "description", "alternateName"]) {
      expect(() => assertNoScoreInJsonLd({ [key]: "아스널 2-1 첼시" })).toThrow(
        /결과 노출 0/,
      );
    }
    expect(() =>
      assertNoScoreInJsonLd({ "@graph": [{ homeTeam: { name: "3:0" } }] }),
    ).toThrow(/결과 노출 0/);
  });

  it("날짜 · 주소 필드와 시즌 표기는 통과", () => {
    expect(() =>
      assertNoScoreInJsonLd({
        startDate: "2026-11-08T14:00:00Z",
        url: `${SITE}/news/2026-10-14/`,
        name: "프리미어리그 2026-27 시즌",
      }),
    ).not.toThrow();
  });
});

describe("siteJsonLd — 홈 WebSite + Organization", () => {
  const data = siteJsonLd();
  const graph = data["@graph"] as JsonLdNode[];

  it("WebSite(이름 · 영문 이름 · 주소 · 설명 · 발행처) · Organization(이름 · 주소)", () => {
    expect(data["@context"]).toBe("https://schema.org");
    expect(graph.map((n) => n["@type"])).toEqual(["WebSite", "Organization"]);
    expect(graph[0]).toMatchObject({
      "@id": websiteId(),
      url: `${SITE}/`,
      name: SITE_NAME,
      alternateName: "Euro Digest",
      description: SITE_DESCRIPTION,
      inLanguage: "ko-KR",
      publisher: { "@id": organizationId() },
    });
    expect(graph[1]).toEqual({
      "@type": "Organization",
      "@id": organizationId(),
      name: SITE_NAME,
      url: `${SITE}/`,
    });
  });

  it("검색 potentialAction · 로고 · 이미지 없음", () => {
    const keys = allKeys(data);
    for (const banned of ["potentialAction", "logo", "image"]) {
      expect(keys).not.toContain(banned);
    }
  });
});

describe("issueJsonLd — 날짜 호 CollectionPage(+ 이날의 5줄 NewsArticle)", () => {
  const base = {
    date: "2026-10-14",
    description: "제 3호 · 2026년 10월 14일 (수) 지면 — …",
    lastModified: "2026-10-14T13:47:54.336Z",
  };

  it("CollectionPage — 주소 = canonical · 이름 = 지면 제목 · 설명 · 수정 시각 · 사이트 · 대표 이미지 = 날짜 OG", () => {
    const data = issueJsonLd({ ...base, brief: null });
    const og = ogImageMeta(newsOgCard("2026-10-14"));
    expect(data).toEqual({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${SITE}/news/2026-10-14/`,
      url: `${SITE}/news/2026-10-14/`,
      name: "제 3호 · 2026년 10월 14일 (수) 지면",
      description: base.description,
      inLanguage: "ko-KR",
      dateModified: base.lastModified,
      isPartOf: {
        "@type": "WebSite",
        "@id": websiteId(),
        name: SITE_NAME,
        url: `${SITE}/`,
      },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: og.url,
        width: 1200,
        height: 630,
      },
    });
    expect(og.url).toBe(`${SITE}/og/news/2026-10-14.png`);
  });

  it("카드(다른 매체 기사)는 싣지 않는다 — ItemList · 바깥 주소 없음", () => {
    const text = JSON.stringify(
      issueJsonLd({
        ...base,
        brief: { generatedAt: base.lastModified, lines: 5, aiLines: 5 },
      }),
    );
    expect(text).not.toContain("ItemList");
    for (const url of text.match(/https?:\/\/[^"]+/g) ?? []) {
      expect(
        url.startsWith(`${SITE}/`) || url.startsWith("https://schema.org"),
        url,
      ).toBe(true);
    }
  });

  it("브리핑 줄이 있으면 hasPart NewsArticle — 제목 · 설명(AI 작성 고지) · 발행 시각 · 이미지 · 저자 = 발행처 = 유로 다이제스트, 본문 없음", () => {
    const data = issueJsonLd({
      ...base,
      brief: { generatedAt: "2026-10-13T21:40:00Z", lines: 5, aiLines: 4 },
    });
    const parts = data.hasPart as JsonLdNode[];
    expect(parts).toHaveLength(1);
    const article = parts[0]!;
    expect(article).toMatchObject({
      "@type": "NewsArticle",
      "@id": `${SITE}/news/2026-10-14/#brief`,
      url: `${SITE}/news/2026-10-14/#brief-h`,
      headline: "이날의 5줄 · 제 3호 · 2026년 10월 14일 (수)",
      description:
        "전날 유럽 축구 경기 데이터를 정리한 한국어 브리핑 5줄(4줄 AI 작성).",
      datePublished: "2026-10-13T21:40:00Z",
      dateModified: "2026-10-13T21:40:00Z",
      image: [ogImageMeta(newsOgCard("2026-10-14")).url],
      inLanguage: "ko-KR",
      isAccessibleForFree: true,
    });
    const org = {
      "@type": "Organization",
      "@id": organizationId(),
      name: SITE_NAME,
      url: `${SITE}/`,
    };
    expect(article.author).toEqual([org]);
    expect(article.publisher).toEqual(org);
    // Google 권장 headline 110자 이내
    expect((article.headline as string).length).toBeLessThanOrEqual(110);
    expect(allKeys(article)).not.toContain("articleBody");
  });

  it("브리핑이 없거나 줄이 0이면 NewsArticle 없음", () => {
    expect(issueJsonLd({ ...base, brief: null }).hasPart).toBeUndefined();
    expect(
      issueJsonLd({
        ...base,
        brief: { generatedAt: base.lastModified, lines: 0, aiLines: 0 },
      }).hasPart,
    ).toBeUndefined();
  });

  it("briefHeadline · briefDescription — 호수가 없으면 날짜만, AI 줄 수 문형", () => {
    expect(briefHeadline("2026-10-01")).toBe(
      "이날의 5줄 · 2026년 10월 1일 (목)",
    );
    expect(briefDescription(5, 5)).toContain("(모두 AI 작성)");
    expect(briefDescription(3, 0)).toContain("3줄(모두 데이터 템플릿 문장)");
  });

  it("설명에 스코어 모양이 섞이면 던진다(빌드 실패)", () => {
    expect(() =>
      issueJsonLd({ ...base, description: "아스널 2-1 첼시", brief: null }),
    ).toThrow(/결과 노출 0/);
  });
});

describe("upcomingMatches — 다가오는 경기만(결과 노출 0)", () => {
  const matches: Match[] = [
    match({
      id: "done",
      kickoff: "2026-11-01T15:00:00Z",
      status: "finished",
      score: { h: 2, a: 1 },
    }),
    match({ id: "live", kickoff: "2026-11-02T23:30:00Z" }),
    match({ id: "tbc", kickoff: "2026-12-20T00:00:00Z", tbc: true }),
    match({ id: "b", kickoff: "2026-11-08T14:00:00Z" }),
    match({ id: "a", kickoff: "2026-11-08T14:00:00Z" }),
    match({
      id: "post",
      kickoff: "2026-11-09T16:30:00Z",
      status: "postponed",
    }),
    match({ id: "c", kickoff: "2026-11-05T20:00:00Z" }),
  ];

  it("종료 · 이미 시작 · 킥오프 미확정을 빼고 킥오프 순(같으면 id 순)으로 limit개", () => {
    expect(upcomingMatches(matches, NOW, 10).map((m) => m.id)).toEqual([
      "c",
      "a",
      "b",
      "post",
    ]);
    expect(upcomingMatches(matches, NOW, 2).map((m) => m.id)).toEqual([
      "c",
      "a",
    ]);
    expect(upcomingMatches(matches, NOW, 0)).toEqual([]);
    expect(COMPETITION_EVENT_LIMIT).toBe(10);
  });
});

describe("SportsEvent — 홈 · 원정 · 시작 시각 · 상태 · 대회, 스코어 없음", () => {
  const events = eventInputs(
    upcomingMatches(
      [
        match({ id: "1", kickoff: "2026-11-08T14:00:00Z" }),
        match({
          id: "2",
          kickoff: "2026-11-09T16:30:00Z",
          status: "postponed",
          home: "ext-fc",
        }),
      ],
      NOW,
      10,
    ),
    lookup,
    epl,
  );

  it("필수 필드(name · startDate · eventStatus · homeTeam · awayTeam · organizer)", () => {
    expect(sportsEventNode(events[0]!)).toEqual({
      "@type": "SportsEvent",
      name: "아스널 vs 첼시",
      startDate: "2026-11-08T14:00:00Z",
      eventStatus: "https://schema.org/EventScheduled",
      sport: "Soccer",
      homeTeam: {
        "@type": "SportsTeam",
        "@id": teamId("arsenal"),
        url: `${SITE}/teams/arsenal/`,
        name: "아스널",
      },
      awayTeam: {
        "@type": "SportsTeam",
        "@id": teamId("chelsea"),
        url: `${SITE}/teams/chelsea/`,
        name: "첼시",
      },
      organizer: {
        "@type": "SportsOrganization",
        name: "프리미어리그",
        url: `${SITE}/competitions/epl/`,
      },
    });
  });

  it("연기 = EventPostponed, 팀 페이지가 없는 팀은 주소 · id 없이 이름만", () => {
    const node = sportsEventNode(events[1]!);
    expect(node.eventStatus).toBe("https://schema.org/EventPostponed");
    expect(node.homeTeam).toEqual({ "@type": "SportsTeam", name: "ext-fc" });
  });

  it("스코어 · 결과 · 장소 필드가 없다", () => {
    const keys = allKeys(eventsJsonLd(events));
    for (const banned of [
      "score",
      "homeScore",
      "awayScore",
      "result",
      "winner",
      "location",
      "image",
      "logo",
    ]) {
      expect(keys).not.toContain(banned);
    }
  });

  it("eventsJsonLd — @graph로 묶고, 경기가 없으면 null(스크립트 없음)", () => {
    const data = eventsJsonLd(events);
    expect(data?.["@context"]).toBe("https://schema.org");
    expect((data?.["@graph"] as JsonLdNode[]).length).toBe(2);
    expect(eventsJsonLd([])).toBeNull();
  });
});

describe("teamJsonLd — SportsTeam(+ 다가오는 경기)", () => {
  it("이름 · 영문 이름 · 종목 · 리그 memberOf · 주소, 로고 · 이미지 없음", () => {
    const data = teamJsonLd(
      {
        slug: "arsenal",
        name: "아스널",
        nameEn: "Arsenal FC",
        league: { id: "EPL", name: "프리미어리그" },
      },
      [],
    );
    const graph = data["@graph"] as JsonLdNode[];
    expect(graph).toEqual([
      {
        "@type": "SportsTeam",
        "@id": `${SITE}/teams/arsenal/#team`,
        url: `${SITE}/teams/arsenal/`,
        name: "아스널",
        alternateName: "Arsenal FC",
        sport: "Soccer",
        memberOf: {
          "@type": "SportsOrganization",
          name: "프리미어리그",
          url: `${SITE}/competitions/epl/`,
        },
      },
    ]);
    expect(allKeys(data)).not.toContain("logo");
    expect(allKeys(data)).not.toContain("image");
  });

  it("UCL이 대표 대회인 외부 팀 · 대회 설정이 없는 팀은 memberOf 없음, 다가오는 경기는 뒤에", () => {
    const events = eventInputs(
      upcomingMatches(
        [match({ id: "1", kickoff: "2026-11-08T14:00:00Z", comp: "UCL" })],
        NOW,
        4,
      ),
      lookup,
      () => ({ id: "UCL", name: "UEFA 챔피언스리그" }),
    );
    for (const league of [{ id: "UCL" as const, name: "UCL" }, null]) {
      const graph = teamJsonLd(
        { slug: "ext-fc", name: "Ext FC", nameEn: "Ext FC", league },
        events,
      )["@graph"] as JsonLdNode[];
      expect(graph[0]).not.toHaveProperty("memberOf");
      // 영문 이름이 같으면 alternateName을 두지 않는다
      expect(graph[0]).not.toHaveProperty("alternateName");
      expect(graph.map((n) => n["@type"])).toEqual([
        "SportsTeam",
        "SportsEvent",
      ]);
    }
  });
});

describe("personJsonLd — 한국 선수 상세", () => {
  it("이름 · 영문 이름 · 주소 · 소속 팀만(출전 · 결과 수치 없음)", () => {
    expect(
      personJsonLd({
        slug: "kim-min-jae",
        nameKo: "김민재",
        nameEn: "Kim Min-jae",
        team: { slug: "bayern-munchen", name: "바이에른 뮌헨", page: true },
      }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "Person",
      name: "김민재",
      alternateName: "Kim Min-jae",
      url: `${SITE}/korean-players/kim-min-jae/`,
      memberOf: {
        "@type": "SportsTeam",
        "@id": `${SITE}/teams/bayern-munchen/#team`,
        url: `${SITE}/teams/bayern-munchen/`,
        name: "바이에른 뮌헨",
      },
    });
  });
});
