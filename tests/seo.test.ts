import { describe, expect, it } from "vitest";

import {
  archiveDescription,
  documentTitle,
  hasScoreLike,
  newsDescription,
  OG_LOCALE,
  pageMetadata,
  SITE_DESCRIPTION,
  siteMetadata,
  sitemapEntries,
  TITLE_TEMPLATE,
  competitionDescription,
  teamDescription,
} from "@/lib/seo";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

// 기본 SEO (M1-38 — PRD FR-124·NFR-03). 빌드 결과(out/의 head 메타·sitemap.xml)는 e2e tests/e2e/seo.spec.ts.
// 테스트 환경은 BASE_PATH·SITE_URL 기본값(`https://sguys99.github.io` + `/euro-digest`).
const SITE = "https://sguys99.github.io/euro-digest";

describe("documentTitle · 제목 템플릿", () => {
  it("페이지 제목 뒤에 ' · 유로 다이제스트', null이면 사이트 이름 단독(홈)", () => {
    expect(TITLE_TEMPLATE).toBe(`%s · ${SITE_NAME}`);
    expect(documentTitle("뉴스")).toBe("뉴스 · 유로 다이제스트");
    expect(documentTitle(null)).toBe("유로 다이제스트");
  });
});

describe("siteMetadata — 루트 레이아웃 기본값", () => {
  it("metadataBase = SITE_URL + basePath(끝 슬래시), 제목 템플릿, 기본 설명, OG·twitter 기본값 — canonical·og:url·og:image 없음", () => {
    const meta = siteMetadata();
    expect(String(meta.metadataBase)).toBe(`${SITE}/`);
    expect(meta.title).toEqual({
      default: SITE_NAME,
      template: TITLE_TEMPLATE,
    });
    expect(meta.description).toBe(SITE_DESCRIPTION);
    expect(SITE_DESCRIPTION.startsWith(SITE_TAGLINE)).toBe(true);
    // 404 등 자기 메타가 없는 페이지가 홈 주소를 물려받지 않게 — canonical·og:url을 두지 않는다
    expect(meta.alternates).toBeUndefined();
    expect(meta.openGraph).toEqual({
      type: "website",
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
    });
    expect(meta.twitter).toEqual({
      card: "summary",
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
    });
  });
});

describe("pageMetadata — 페이지별 메타", () => {
  it("canonical·og:url = 같은 절대 URL(basePath·끝 슬래시), OG·twitter 전부(얕은 병합 대비), og:image 없음", () => {
    const meta = pageMetadata({
      title: "소개",
      description: "설명",
      canonical: "/about/",
    });
    expect(meta.title).toBe("소개");
    expect(meta.description).toBe("설명");
    expect(meta.alternates).toEqual({ canonical: `${SITE}/about/` });
    expect(meta.openGraph).toEqual({
      type: "website",
      siteName: SITE_NAME,
      locale: "ko_KR",
      title: "소개 · 유로 다이제스트",
      description: "설명",
      url: `${SITE}/about/`,
    });
    expect(meta.twitter).toEqual({
      card: "summary",
      title: "소개 · 유로 다이제스트",
      description: "설명",
    });
    expect(JSON.stringify(meta)).not.toMatch(/image/i);
  });

  it("홈 — 제목은 사이트 이름 단독(absolute), canonical = 사이트 루트", () => {
    const meta = pageMetadata({
      title: null,
      description: SITE_DESCRIPTION,
      canonical: "/",
    });
    expect(meta.title).toEqual({ absolute: SITE_NAME });
    expect(meta.alternates?.canonical).toBe(`${SITE}/`);
    expect(meta.openGraph?.title).toBe(SITE_NAME);
  });

  it("canonical null(발행된 호가 없는 /news/) — canonical·og:url 없음", () => {
    const meta = pageMetadata({
      title: "뉴스",
      description: SITE_DESCRIPTION,
      canonical: null,
    });
    expect(meta.alternates).toBeUndefined();
    expect(meta.openGraph).not.toHaveProperty("url");
  });

  it("라우트가 아닌 값(basePath 포함·외부 URL)은 paths 규칙대로 던진다", () => {
    expect(() =>
      pageMetadata({
        title: "x",
        description: "y",
        canonical: "/euro-digest/",
      }),
    ).toThrow(/basePath/);
    expect(() =>
      pageMetadata({
        title: "x",
        description: "y",
        canonical: "https://example.com/",
      }),
    ).toThrow();
  });

  it("결과 노출 0 — 제목·설명에 스코어 모양이 있으면 던진다(DECISIONS D0 §5 #9)", () => {
    expect(() =>
      pageMetadata({
        title: "아스널 2-1 리즈",
        description: "설명",
        canonical: "/",
      }),
    ).toThrow(/스코어/);
    expect(() =>
      pageMetadata({
        title: "뉴스",
        description: "아스널이 리즈를 2대1로 꺾었다",
        canonical: "/",
      }),
    ).toThrow(/스코어/);
  });
});

describe("hasScoreLike", () => {
  it.each([
    "2-1",
    "2–1",
    "2—1",
    "2:1",
    "2 - 1",
    "2대1",
    "2 대 1",
    "승부차기 4-3",
    // 이어지지 않는 연도 쌍은 시즌이 아니다 — 그대로 걸린다(M2-10)
    "2026-28",
    "프리미어리그 2026-27 시즌 3-1",
  ])("스코어 모양: %s", (text) => expect(hasScoreLike(text)).toBe(true));
  it.each([
    // 시즌 표기 — 이어지는 해(M2-10 대회 페이지 제목·설명)
    "프리미어리그 2026-27 시즌",
    "UEFA 챔피언스리그 2099–00 시즌",
    competitionDescription("프리미어리그", "2026-27 시즌"),
    "2026년 10월 14일 (수) 뉴스 · 제 3호",
    "제 3호 · 2026년 10월 14일 (수) 지면 — 유럽 축구 소식 8건",
    "유로 다이제스트",
    SITE_DESCRIPTION,
  ])("아님: %s", (text) => expect(hasScoreLike(text)).toBe(false));
});

describe("archiveDescription — 날짜 아카이브 설명(사실만)", () => {
  it("브리핑 줄 + 카드 — 호수·날짜·'이날의 5줄'·카드 수", () => {
    expect(
      archiveDescription({ date: "2026-10-14", cards: 24, briefLines: 5 }),
    ).toBe(
      "제 3호 · 2026년 10월 14일 (수) 지면 — 전날 경기를 정리한 한국어 브리핑 ‘이날의 5줄’과 유럽 축구 소식 24건을 원문 링크와 함께 싣습니다.",
    );
  });

  it("브리핑 줄 없음(파일 없음·경기 없는 날) — 카드 수만", () => {
    expect(
      archiveDescription({ date: "2026-10-23", cards: 45, briefLines: 0 }),
    ).toBe(
      "제 12호 · 2026년 10월 23일 (금) 지면 — 유럽 축구 소식 45건을 원문 링크와 함께 싣습니다.",
    );
  });

  it("카드 0장(모두 삭제 요청) — 브리핑만, 둘 다 없으면 '실린 소식이 없습니다'", () => {
    expect(
      archiveDescription({ date: "2026-10-14", cards: 0, briefLines: 3 }),
    ).toBe(
      "제 3호 · 2026년 10월 14일 (수) 지면 — 전날 경기를 정리한 한국어 브리핑 ‘이날의 5줄’을 싣습니다.",
    );
    expect(
      archiveDescription({ date: "2026-10-14", cards: 0, briefLines: 0 }),
    ).toBe("제 3호 · 2026년 10월 14일 (수) 지면 — 실린 소식이 없습니다.");
  });

  it("창간일 전(호수 없음) — 날짜만", () => {
    expect(
      archiveDescription({ date: "2026-10-10", cards: 2, briefLines: 0 }),
    ).toBe(
      "2026년 10월 10일 (토) 지면 — 유럽 축구 소식 2건을 원문 링크와 함께 싣습니다.",
    );
  });

  it("어떤 조합도 스코어 모양이 없다", () => {
    for (const cards of [0, 1, 45]) {
      for (const briefLines of [0, 5]) {
        const text = archiveDescription({
          date: "2026-10-21",
          cards,
          briefLines,
        });
        expect(hasScoreLike(text), text).toBe(false);
      }
    }
  });
});

describe("newsDescription — /news/(최신 호 별칭)", () => {
  it("최신 호의 호수·날짜·카드 수 + 아카이브 안내, 호가 없으면 사이트 기본 설명", () => {
    expect(newsDescription({ date: "2026-10-23", cards: 45 })).toBe(
      "최신 호(제 12호 · 2026년 10월 23일 (금))의 유럽 축구 소식 45건을 원문 링크와 함께 싣습니다. 지난 호는 날짜별 아카이브에 있습니다.",
    );
    expect(newsDescription({ date: "2026-10-23", cards: 0 })).toBe(
      "최신 호(제 12호 · 2026년 10월 23일 (금))에는 실린 소식이 없습니다. 지난 호는 날짜별 아카이브에 있습니다.",
    );
    expect(newsDescription(null)).toBe(SITE_DESCRIPTION);
  });
});

describe("sitemapEntries — sitemap.xml 항목", () => {
  const issues = [
    { date: "2026-10-14", generatedAt: "2026-10-14T13:47:54.336Z" },
    { date: "2026-10-12", generatedAt: "2026-10-12T11:28:11.166Z" },
    { date: "2026-10-23", generatedAt: "2026-10-23T00:10:07.307Z" },
  ];

  it("홈(lastmod = 최신 호) · /about/(lastmod 없음) · 날짜 페이지 전부(오름차순, lastmod = 그 호 generatedAt) — /news/는 없다", () => {
    expect(sitemapEntries(issues)).toEqual([
      { url: `${SITE}/`, lastModified: "2026-10-23T00:10:07.307Z" },
      { url: `${SITE}/about/` },
      {
        url: `${SITE}/news/2026-10-12/`,
        lastModified: "2026-10-12T11:28:11.166Z",
      },
      {
        url: `${SITE}/news/2026-10-14/`,
        lastModified: "2026-10-14T13:47:54.336Z",
      },
      {
        url: `${SITE}/news/2026-10-23/`,
        lastModified: "2026-10-23T00:10:07.307Z",
      },
    ]);
  });

  it("대회 페이지(M2-10) — /about/ 다음에 넘긴 순서대로, lastmod = 데이터 updatedAt", () => {
    const entries = sitemapEntries(issues, [
      { comp: "EPL", updatedAt: "2026-10-30T02:17:27.762Z" },
      { comp: "UCL", updatedAt: "2026-10-30T02:19:28.728Z" },
    ]);
    expect(entries.slice(1, 4)).toEqual([
      { url: `${SITE}/about/` },
      {
        url: `${SITE}/competitions/epl/`,
        lastModified: "2026-10-30T02:17:27.762Z",
      },
      {
        url: `${SITE}/competitions/ucl/`,
        lastModified: "2026-10-30T02:19:28.728Z",
      },
    ]);
  });

  it("모든 URL은 절대 URL(SITE_URL + basePath)·끝 슬래시·중복 없음, `/news/` 별칭 없음", () => {
    const urls = sitemapEntries(issues).map((e) => e.url);
    for (const url of urls) {
      expect(url.startsWith(`${SITE}/`)).toBe(true);
      expect(url.endsWith("/")).toBe(true);
    }
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).not.toContain(`${SITE}/news/`);
  });

  it("발행된 호가 없으면 홈(lastmod 없음)·/about/만", () => {
    expect(sitemapEntries([])).toEqual([
      { url: `${SITE}/` },
      { url: `${SITE}/about/` },
    ]);
  });

  it("잘못된 날짜는 paths 규칙대로 던진다", () => {
    expect(() =>
      sitemapEntries([{ date: "2026-13-01", generatedAt: "x" }]),
    ).toThrow();
  });
});

describe("teamDescription — 팀 페이지 설명(M2-13)", () => {
  it("팀명·리그·시즌과 실린 것·출처만 — 스코어 모양 없음", () => {
    const text = teamDescription("바이에른 뮌헨", "분데스리가", "2026-27 시즌");
    expect(text.startsWith("바이에른 뮌헨(분데스리가) 2026-27 시즌 ")).toBe(
      true,
    );
    expect(text).toContain("API-Football");
    expect(hasScoreLike(text)).toBe(false);
    expect(teamDescription("클뤼프 브뤼허", null, "2026-27 시즌")).toMatch(
      /^클뤼프 브뤼허 2026-27 시즌 /,
    );
  });

  it("sitemapEntries — 팀 페이지는 대회 다음, lastmod 없으면 생략", () => {
    const urls = sitemapEntries(
      [],
      [{ comp: "EPL", updatedAt: "2026-10-30T00:00:00Z" }],
      [
        { slug: "arsenal", updatedAt: "2026-10-30T00:00:00Z" },
        { slug: "club-brugge", updatedAt: null },
      ],
    ).filter((e) => e.url.includes("/teams/"));
    expect(urls).toEqual([
      {
        url: "https://sguys99.github.io/euro-digest/teams/arsenal/",
        lastModified: "2026-10-30T00:00:00Z",
      },
      { url: "https://sguys99.github.io/euro-digest/teams/club-brugge/" },
    ]);
  });
});
