import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  artifacts,
  compFromSegment,
  compSegment,
  createPaths,
  DEFAULT_BASE_PATH,
  DEFAULT_SITE_URL,
  normalizeBasePath,
  normalizeSiteOrigin,
  PathInputError,
  routes,
  siteLocationFromBuildEnv,
  summaryErrorIssueUrl,
  type CalendarFeed,
  type OgImage,
  type RssFeed,
} from "@/lib/paths";
import {
  CardIdSchema,
  CompIdSchema,
  IsoDateSchema,
  SlugSchema,
  type CompId,
} from "@/lib/schema";
import { REPO_URL } from "@/lib/site";
import { isoWeeksInYear } from "@/lib/time";

const DATE = "2026-10-10";
const CARD = "c_8f3a1b2c4d";

/** 스킴 뒤에 이중 슬래시가 없는지 */
function hasNoDoubleSlash(url: string): boolean {
  return !url.replace(/^https?:\/\//, "").includes("//");
}

// ─── 정규화 ─────────────────────────────────────────────────────────────────

describe("normalizeBasePath", () => {
  it.each([
    [undefined, DEFAULT_BASE_PATH],
    ["/euro-digest", "/euro-digest"],
    ["/euro-digest/", "/euro-digest"],
    ["/euro-digest///", "/euro-digest"],
    ["  /euro-digest/  ", "/euro-digest"],
    ["", ""],
    ["/", ""],
    ["  ", ""],
    ["/custom/base/", "/custom/base"],
    ["/v1.2_x~y", "/v1.2_x~y"],
  ])("%j → %j", (raw, expected) => {
    expect(normalizeBasePath(raw)).toBe(expected);
  });

  it.each([
    "euro-digest", // 앞 `/` 없음
    "//euro-digest",
    "/a//b",
    "/a b",
    "/a?x=1",
    "/a#x",
    "/../a",
    "/a/./b",
    "https://sguys99.github.io/euro-digest",
    "/한글",
  ])("형식이 틀리면 오류: %j", (raw) => {
    expect(() => normalizeBasePath(raw)).toThrow(PathInputError);
  });
});

describe("normalizeSiteOrigin", () => {
  it.each([
    [undefined, DEFAULT_SITE_URL],
    ["", DEFAULT_SITE_URL],
    ["   ", DEFAULT_SITE_URL],
    ["https://sguys99.github.io", "https://sguys99.github.io"],
    ["https://sguys99.github.io/", "https://sguys99.github.io"],
    ["http://127.0.0.1:4173/", "http://127.0.0.1:4173"],
    ["https://Example.COM", "https://example.com"],
    ["https://example.com:443", "https://example.com"],
  ])("%j → %j", (raw, expected) => {
    expect(normalizeSiteOrigin(raw)).toBe(expected);
  });

  it.each([
    "sguys99.github.io", // 스킴 없음
    "ftp://example.com",
    "javascript:alert(1)",
    "https://example.com/euro-digest", // 경로는 BASE_PATH로
    "https://example.com?x=1",
    "https://example.com#top",
    "https://user:pw@example.com",
    "https://",
  ])("출처가 아니면 오류: %j", (raw) => {
    expect(() => normalizeSiteOrigin(raw)).toThrow(PathInputError);
  });
});

describe("siteLocationFromBuildEnv (next.config.ts)", () => {
  it("미지정이면 기본값", () => {
    expect(siteLocationFromBuildEnv({})).toEqual({
      basePath: DEFAULT_BASE_PATH,
      siteUrl: DEFAULT_SITE_URL,
    });
  });

  it("BASE_PATH 빈 값 = 루트 배포, SITE_URL 정규화", () => {
    expect(
      siteLocationFromBuildEnv({
        BASE_PATH: "",
        SITE_URL: "https://example.com/",
      }),
    ).toEqual({ basePath: "", siteUrl: "https://example.com" });
  });

  it("NEXT_PUBLIC_*가 정규화 결과와 같으면 통과(빌드 워커가 다시 읽는 경우)", () => {
    expect(
      siteLocationFromBuildEnv({
        BASE_PATH: "/euro-digest/",
        NEXT_PUBLIC_BASE_PATH: "/euro-digest",
        NEXT_PUBLIC_SITE_URL: "https://sguys99.github.io/",
      }),
    ).toEqual({ basePath: "/euro-digest", siteUrl: DEFAULT_SITE_URL });
  });

  it("NEXT_PUBLIC_*를 다른 값으로 직접 지정하면 오류(scripts와 빌드가 갈라짐)", () => {
    expect(() =>
      siteLocationFromBuildEnv({ BASE_PATH: "", NEXT_PUBLIC_BASE_PATH: "/x" }),
    ).toThrow(/NEXT_PUBLIC_BASE_PATH/);
    expect(() =>
      siteLocationFromBuildEnv({ NEXT_PUBLIC_BASE_PATH: "" }),
    ).toThrow(/BASE_PATH를 쓸 것/);
    expect(() =>
      siteLocationFromBuildEnv({ NEXT_PUBLIC_SITE_URL: "https://other.dev" }),
    ).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("형식 오류는 그대로 오류", () => {
    expect(() => siteLocationFromBuildEnv({ BASE_PATH: "euro" })).toThrow(
      PathInputError,
    );
    expect(() =>
      siteLocationFromBuildEnv({ SITE_URL: "https://a.dev/sub" }),
    ).toThrow(PathInputError);
  });
});

// ─── 라우트 (basePath 없음) ─────────────────────────────────────────────────

describe("routes — PRD §4 IA, basePath 없음 · trailing slash", () => {
  it.each([
    ["home", routes.home(), "/"],
    ["news", routes.news(), "/news/"],
    ["newsArchive", routes.newsArchive(DATE), "/news/2026-10-10/"],
    ["card", routes.card(DATE, CARD), "/news/2026-10-10/#c_8f3a1b2c4d"],
    ["competition EPL", routes.competition("EPL"), "/competitions/epl/"],
    ["competition UCL", routes.competition("UCL"), "/competitions/ucl/"],
    ["team", routes.team("liverpool"), "/teams/liverpool/"],
    ["team 숫자 포함", routes.team("1-fc-koln"), "/teams/1-fc-koln/"],
    ["koreanPlayers", routes.koreanPlayers(), "/korean-players/"],
    [
      "koreanPlayer",
      routes.koreanPlayer("son-heung-min"),
      "/korean-players/son-heung-min/",
    ],
    ["weeklyReport", routes.weeklyReport(), "/korean-players/weekly/"],
    [
      "weeklyReportArchive",
      routes.weeklyReportArchive("2026-43"),
      "/korean-players/weekly/2026-43/",
    ],
    [
      "weeklyReportArchive 53주",
      routes.weeklyReportArchive("2026-53"),
      "/korean-players/weekly/2026-53/",
    ],
    ["transfers", routes.transfers(), "/transfers/"],
    ["nationalTeam", routes.nationalTeam(), "/national-team/"],
    ["tonight", routes.tonight(), "/tonight/"],
    ["my", routes.my(), "/my/"],
    ["search", routes.search(), "/search/"],
    ["about", routes.about(), "/about/"],
    ["privacy", routes.privacy(), "/privacy/"],
    ["status", routes.status(), "/status/"],
  ])("%s → %s", (_label, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it("모든 라우트는 `/`로 시작하고 경로 부분이 `/`로 끝나며 basePath가 없다", () => {
    const all = [
      routes.home(),
      routes.news(),
      routes.newsArchive(DATE),
      routes.card(DATE, CARD),
      routes.competition("LIGUE1"),
      routes.team("arsenal"),
      routes.koreanPlayers(),
      routes.koreanPlayer("lee-kang-in"),
      routes.weeklyReport(),
      routes.weeklyReportArchive("2027-01"),
      routes.transfers(),
      routes.nationalTeam(),
      routes.tonight(),
      routes.my(),
      routes.search(),
      routes.about(),
      routes.privacy(),
      routes.status(),
    ];
    for (const route of all) {
      expect(route.startsWith("/")).toBe(true);
      expect(route.split("#")[0]?.endsWith("/")).toBe(true);
      expect(route).not.toContain("//");
      expect(route).not.toContain(DEFAULT_BASE_PATH);
    }
  });

  it.each([
    ["날짜 형식", () => routes.newsArchive("2026-1-10")],
    ["날짜 구분자", () => routes.newsArchive("20261010")],
    ["시각 포함", () => routes.newsArchive("2026-10-10T00:00:00Z")],
    ["없는 날짜 2/30", () => routes.newsArchive("2026-02-30")],
    ["평년 2/29", () => routes.newsArchive("2027-02-29")],
    ["13월", () => routes.newsArchive("2026-13-01")],
    ["0일", () => routes.newsArchive("2026-10-00")],
    ["카드 ID 대문자", () => routes.card(DATE, "c_8F3A1B2C4D")],
    ["카드 ID 길이", () => routes.card(DATE, "c_8f3a1b2c4")],
    ["카드 ID 접두", () => routes.card(DATE, "8f3a1b2c4d")],
    ["카드 앵커에 # 포함", () => routes.card(DATE, `#${CARD}`)],
    ["대회 ID 소문자", () => routes.competition("epl" as CompId)],
    ["모르는 대회", () => routes.competition("FACUP" as CompId)],
    ["팀 slug 대문자", () => routes.team("Liverpool")],
    ["팀 slug 밑줄", () => routes.team("man_utd")],
    ["팀 slug 빈 값", () => routes.team("")],
    ["팀 slug 슬래시", () => routes.team("a/b")],
    ["선수 slug 이중 하이픈", () => routes.koreanPlayer("son--heung-min")],
    [
      "선수 slug weekly(주간 리포트와 겹침)",
      () => routes.koreanPlayer("weekly"),
    ],
    ["주차 0", () => routes.weeklyReportArchive("2026-00")],
    ["주차 54", () => routes.weeklyReportArchive("2026-54")],
    ["52주인 해의 53주", () => routes.weeklyReportArchive("2027-53")],
    ["주차 W 표기", () => routes.weeklyReportArchive("2026-W43")],
    ["주차 한 자리", () => routes.weeklyReportArchive("2026-4")],
  ])("잘못된 입력은 PathInputError: %s", (_label, call) => {
    expect(call).toThrow(PathInputError);
  });

  it("ISO 주차 53주 판정이 src/lib/time.ts와 같다(2000~2100년)", () => {
    for (let year = 2000; year <= 2100; year += 1) {
      const week53 = `${year}-53`;
      if (isoWeeksInYear(year) === 53) {
        expect(routes.weeklyReportArchive(week53)).toBe(
          `/korean-players/weekly/${week53}/`,
        );
      } else {
        expect(() => routes.weeklyReportArchive(week53)).toThrow(
          PathInputError,
        );
      }
      expect(() => routes.weeklyReportArchive(`${year}-52`)).not.toThrow();
    }
  });
});

// ─── 형식 검사가 zod 스키마와 같은지 (zod를 번들에 넣지 않으려고 따로 구현) ──

describe("형식 검사 ↔ src/lib/schema 일치", () => {
  function accepts(call: () => unknown): boolean {
    try {
      call();
      return true;
    } catch (error) {
      if (error instanceof PathInputError) return false;
      throw error;
    }
  }

  it("대회 ID: CompIdSchema의 모든 값을 받고, 소문자 세그먼트로 왕복한다", () => {
    for (const comp of CompIdSchema.options) {
      const segment = compSegment(comp);
      expect(segment).toBe(comp.toLowerCase());
      expect(compFromSegment(segment)).toBe(comp);
      expect(routes.competition(comp)).toBe(`/competitions/${segment}/`);
    }
    expect(compFromSegment("EPL")).toBeNull(); // 세그먼트는 소문자만
    expect(compFromSegment("facup")).toBeNull();
    expect(compFromSegment("")).toBeNull();
  });

  it.each([
    "c_8f3a1b2c4d",
    "c_0000000000",
    "c_8F3A1B2C4D",
    "c_8f3a1b2c4",
    "c_8f3a1b2c4d0",
    "d_8f3a1b2c4d",
    " c_8f3a1b2c4d",
    "c_8f3a1b2c4g",
    "",
  ])("카드 ID %j", (value) => {
    expect(accepts(() => routes.card(DATE, value))).toBe(
      CardIdSchema.safeParse(value).success,
    );
  });

  it.each([
    "liverpool",
    "son-heung-min",
    "537785",
    "a",
    "Liverpool",
    "son_heung",
    "-a",
    "a-",
    "a--b",
    "",
    "a b",
    "é",
  ])("slug %j", (value) => {
    expect(accepts(() => routes.team(value))).toBe(
      SlugSchema.safeParse(value).success,
    );
  });

  it.each([
    "2026-10-10",
    "2028-02-29",
    "2000-02-29",
    "1900-02-29",
    "2027-02-29",
    "2026-02-30",
    "2026-04-31",
    "2026-13-01",
    "2026-00-10",
    "2026-10-00",
    "2026-1-10",
    "20261010",
    "2026-10-10T00:00:00Z",
  ])("날짜 %j", (value) => {
    expect(accepts(() => routes.newsArchive(value))).toBe(
      IsoDateSchema.safeParse(value).success,
    );
  });
});

// ─── 산출물 경로 (basePath 없음) ────────────────────────────────────────────

describe("artifacts — 빌드 산출물의 사이트 경로", () => {
  it.each<[string, string, string]>([
    ["rss 기본", artifacts.rss(), "/rss.xml"],
    ["rss all", artifacts.rss({ kind: "all" }), "/rss.xml"],
    [
      "rss 대회",
      artifacts.rss({ kind: "competition", comp: "SERIEA" }),
      "/rss/seriea.xml",
    ],
    ["rss 한국 선수", artifacts.rss({ kind: "korean" }), "/rss/korean.xml"],
    [
      "ics 팀",
      artifacts.calendar({ kind: "team", team: "tottenham-hotspur" }),
      "/calendar/tottenham-hotspur.ics",
    ],
    [
      "ics 한국 선수 소속팀",
      artifacts.calendar({ kind: "korean" }),
      "/calendar/korean.ics",
    ],
    [
      "ics 경기(API 숫자 ID)",
      artifacts.calendar({ kind: "match", matchId: "537785" }),
      "/calendar/match/537785.ics",
    ],
    [
      "ics 경기(A매치 slug)",
      artifacts.calendar({ kind: "match", matchId: "2026-11-14-friendly" }),
      "/calendar/match/2026-11-14-friendly.ics",
    ],
    ["og 기본", artifacts.ogImage(), "/og/default.png"],
    [
      "og 날짜",
      artifacts.ogImage({ kind: "news", date: DATE }),
      "/og/news/2026-10-10.png",
    ],
    [
      "og 대회",
      artifacts.ogImage({ kind: "competition", comp: "BUNDESLIGA" }),
      "/og/competitions/bundesliga.png",
    ],
    [
      "og 팀",
      artifacts.ogImage({ kind: "team", team: "bayern-munchen" }),
      "/og/teams/bayern-munchen.png",
    ],
    ["manifest", artifacts.manifest(), "/manifest.webmanifest"],
    ["sitemap", artifacts.sitemap(), "/sitemap.xml"],
    ["robots", artifacts.robots(), "/robots.txt"],
  ])("%s → %s", (_label, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it.each([
    [
      "팀 slug korean(한국 선수 묶음 캘린더와 겹침)",
      () => artifacts.calendar({ kind: "team", team: "korean" }),
    ],
    [
      "팀 slug 형식",
      () => artifacts.calendar({ kind: "team", team: "Man Utd" }),
    ],
    [
      "경기 ID 형식",
      () => artifacts.calendar({ kind: "match", matchId: "../537785" }),
    ],
    ["경기 ID 빈 값", () => artifacts.calendar({ kind: "match", matchId: "" })],
    [
      "RSS 대회 소문자",
      () => artifacts.rss({ kind: "competition", comp: "epl" as CompId }),
    ],
    [
      "OG 날짜 형식",
      () => artifacts.ogImage({ kind: "news", date: "2026/10/10" }),
    ],
    [
      "RSS kind 모름",
      () => artifacts.rss({ kind: "team" } as unknown as RssFeed),
    ],
    [
      "캘린더 kind 모름",
      () => artifacts.calendar({ kind: "all" } as unknown as CalendarFeed),
    ],
    [
      "OG kind 모름",
      () => artifacts.ogImage({ kind: "player" } as unknown as OgImage),
    ],
  ])("잘못된 입력은 PathInputError: %s", (_label, call) => {
    expect(call).toThrow(PathInputError);
  });
});

// ─── 외부 링크 ──────────────────────────────────────────────────────────────

describe("summaryErrorIssueUrl (FR-36)", () => {
  it("카드 ID·날짜가 채워진 이슈 폼 링크 — M0-10 형식", () => {
    expect(summaryErrorIssueUrl(CARD, DATE)).toBe(
      "https://github.com/sguys99/euro-digest/issues/new?template=summary-error.yml&card=c_8f3a1b2c4d&date=2026-10-10",
    );
    expect(summaryErrorIssueUrl(CARD, DATE).startsWith(`${REPO_URL}/`)).toBe(
      true,
    );
  });

  it("잘못된 카드 ID·날짜는 오류", () => {
    expect(() => summaryErrorIssueUrl("c_xyz", DATE)).toThrow(PathInputError);
    expect(() => summaryErrorIssueUrl(CARD, "2026-02-30")).toThrow(
      PathInputError,
    );
    expect(() => summaryErrorIssueUrl(CARD, "")).toThrow(PathInputError);
  });
});

// ─── basePath·SITE_URL별 헬퍼 (3가지 배포 위치) ─────────────────────────────

const LOCATIONS = [
  {
    label: "기본(/euro-digest)",
    input: { basePath: "/euro-digest", siteUrl: "https://sguys99.github.io" },
    base: "/euro-digest",
    origin: "https://sguys99.github.io",
  },
  {
    label: '루트 배포("")',
    input: { basePath: "", siteUrl: "https://example.com/" },
    base: "",
    origin: "https://example.com",
  },
  {
    label: "커스텀(/custom/base/)",
    input: { basePath: "/custom/base/", siteUrl: "http://127.0.0.1:4173" },
    base: "/custom/base",
    origin: "http://127.0.0.1:4173",
  },
] as const;

describe.each(LOCATIONS)("createPaths — $label", ({ input, base, origin }) => {
  const p = createPaths(input);
  const site = `${origin}${base}`;

  it("정규화된 basePath·siteUrl", () => {
    expect(p.basePath).toBe(base);
    expect(p.siteUrl).toBe(origin);
  });

  it("withBasePath: public/ 정적 자산 href", () => {
    expect(p.withBasePath("/")).toBe(`${base}/`);
    expect(p.withBasePath("/fonts/pretendard-subset.woff2")).toBe(
      `${base}/fonts/pretendard-subset.woff2`,
    );
    expect(p.withBasePath("/icons/icon-192.png")).toBe(
      `${base}/icons/icon-192.png`,
    );
    expect(p.withBasePath("/news/")).toBe(`${base}/news/`);
  });

  it("withBasePath: 쿼리·해시 보존(쿼리 안의 `//`는 검사하지 않음)", () => {
    expect(p.withBasePath("/icon.svg?v=2#mark")).toBe(
      `${base}/icon.svg?v=2#mark`,
    );
    expect(p.withBasePath("/?comp=epl")).toBe(`${base}/?comp=epl`);
    expect(p.withBasePath("/#today")).toBe(`${base}/#today`);
    expect(p.withBasePath("/news/?u=https://a.dev//b")).toBe(
      `${base}/news/?u=https://a.dev//b`,
    );
    expect(p.withBasePath(routes.card(DATE, CARD))).toBe(
      `${base}/news/2026-10-10/#c_8f3a1b2c4d`,
    );
  });

  it("absoluteUrl: SITE_URL + basePath + path (trailing slash 유지)", () => {
    expect(p.absoluteUrl("/")).toBe(`${site}/`);
    expect(p.absoluteUrl(routes.newsArchive(DATE))).toBe(
      `${site}/news/2026-10-10/`,
    );
    expect(p.absoluteUrl(routes.competition("LALIGA"))).toBe(
      `${site}/competitions/laliga/`,
    );
    expect(p.absoluteUrl(routes.weeklyReportArchive("2026-43"))).toBe(
      `${site}/korean-players/weekly/2026-43/`,
    );
    expect(p.absoluteUrl("/news/?comp=epl#top")).toBe(
      `${site}/news/?comp=epl#top`,
    );
  });

  it("산출물: 브라우저용 href(basePath 포함)와 절대 URL을 구분", () => {
    expect(p.rssPath()).toBe(`${base}/rss.xml`);
    expect(p.rssUrl()).toBe(`${site}/rss.xml`);
    expect(p.rssPath({ kind: "competition", comp: "EPL" })).toBe(
      `${base}/rss/epl.xml`,
    );
    expect(p.rssUrl({ kind: "korean" })).toBe(`${site}/rss/korean.xml`);

    expect(p.icsPath({ kind: "team", team: "liverpool" })).toBe(
      `${base}/calendar/liverpool.ics`,
    );
    expect(p.icsUrl({ kind: "korean" })).toBe(`${site}/calendar/korean.ics`);
    expect(p.icsUrl({ kind: "match", matchId: "537785" })).toBe(
      `${site}/calendar/match/537785.ics`,
    );

    expect(p.ogImagePath()).toBe(`${base}/og/default.png`);
    expect(p.ogImageUrl({ kind: "news", date: DATE })).toBe(
      `${site}/og/news/2026-10-10.png`,
    );
    expect(p.ogImageUrl({ kind: "team", team: "napoli" })).toBe(
      `${site}/og/teams/napoli.png`,
    );

    expect(p.manifestPath()).toBe(`${base}/manifest.webmanifest`);
    expect(p.sitemapUrl()).toBe(`${site}/sitemap.xml`);
  });

  it("카드 공유 URL (FR-34): basePath·trailing slash·앵커 포함", () => {
    expect(p.cardShareUrl(DATE, CARD)).toBe(
      `${site}/news/2026-10-10/#c_8f3a1b2c4d`,
    );
    expect(() => p.cardShareUrl(DATE, "c_bad")).toThrow(PathInputError);
  });

  it("결과에 이중 슬래시가 없다", () => {
    const outputs = [
      p.withBasePath("/"),
      p.withBasePath("/a.png"),
      p.absoluteUrl("/"),
      p.absoluteUrl(routes.team("chelsea")),
      p.rssUrl(),
      p.icsUrl({ kind: "korean" }),
      p.ogImageUrl(),
      p.sitemapUrl(),
      p.cardShareUrl(DATE, CARD),
    ];
    for (const out of outputs) expect(hasNoDoubleSlash(out)).toBe(true);
  });

  it.each([
    ["앞 `/` 없음", "rss.xml"],
    ["상대 경로", "./rss.xml"],
    ["빈 값", ""],
    ["외부 URL", "https://cdn.example.com/x.js"],
    ["프로토콜 상대 URL", "//cdn.example.com/x.js"],
    ["mailto", "mailto:sguys99@gmail.com"],
    ["기본 basePath 하드코딩", `${DEFAULT_BASE_PATH}/rss.xml`],
    ["기본 basePath 자체", DEFAULT_BASE_PATH],
    ["기본 basePath + 쿼리", `${DEFAULT_BASE_PATH}?x=1`],
    ["trailing slash 없는 페이지", "/news"],
    ["trailing slash 없는 페이지 + 쿼리", "/news?comp=epl"],
    ["trailing slash 없는 페이지 + 해시", "/news/2026-10-10#c_8f3a1b2c4d"],
    ["이중 슬래시", "/fonts//a.woff2"],
    ["끝 이중 슬래시", "/news//"],
    ["점 세그먼트", "/a/../b.png"],
    ["현재 디렉터리 세그먼트", "/./b.png"],
    ["공백", "/a b.png"],
    ["역슬래시", "/a\\b.png"],
  ])("withBasePath·absoluteUrl 거부: %s", (_label, value) => {
    expect(() => p.withBasePath(value)).toThrow(PathInputError);
    expect(() => p.absoluteUrl(value)).toThrow(PathInputError);
  });

  it("이미 basePath가 붙은 값을 다시 넣으면 거부(이중 basePath 방지)", () => {
    if (base === "") {
      // 루트 배포는 basePath가 없어 구분할 수 없다 — withBasePath가 항등 함수.
      expect(p.withBasePath("/a.png")).toBe("/a.png");
      return;
    }
    expect(() => p.withBasePath(p.withBasePath("/a.png"))).toThrow(
      /이미 basePath/,
    );
    expect(() => p.absoluteUrl(p.rssPath())).toThrow(PathInputError);
    expect(() => p.withBasePath(`${base}/`)).toThrow(PathInputError);
  });
});

describe("이중 basePath 판정은 세그먼트 경계 기준", () => {
  it("basePath로 시작하는 다른 이름(/custom/basement.png)은 허용", () => {
    const p = createPaths({
      basePath: "/custom/base",
      siteUrl: DEFAULT_SITE_URL,
    });
    expect(p.withBasePath("/custom/basement.png")).toBe(
      "/custom/base/custom/basement.png",
    );
    expect(() => p.withBasePath("/custom/base/x.png")).toThrow(PathInputError);
  });

  it("기본 basePath와 이름만 비슷한 경로(/euro-digest-logo.svg)는 허용", () => {
    const p = createPaths({ basePath: "", siteUrl: DEFAULT_SITE_URL });
    expect(p.withBasePath("/euro-digest-logo.svg")).toBe(
      "/euro-digest-logo.svg",
    );
  });

  it("createPaths 입력도 정규화 규칙으로 검사", () => {
    expect(() =>
      createPaths({ basePath: "no-slash", siteUrl: DEFAULT_SITE_URL }),
    ).toThrow(PathInputError);
    expect(() =>
      createPaths({ basePath: "", siteUrl: "https://a.dev/sub" }),
    ).toThrow(PathInputError);
  });
});

// ─── env 기반 기본 인스턴스 ─────────────────────────────────────────────────

describe("기본 인스턴스 — 환경변수 읽는 순서 (NEXT_PUBLIC_* → BASE_PATH·SITE_URL → 기본값)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function freshModule(env: Record<string, string | undefined>) {
    for (const key of [
      "NEXT_PUBLIC_BASE_PATH",
      "NEXT_PUBLIC_SITE_URL",
      "BASE_PATH",
      "SITE_URL",
    ]) {
      vi.stubEnv(key, env[key]);
    }
    vi.resetModules();
    return import("@/lib/paths");
  }

  it("아무것도 없으면 기본값", async () => {
    const m = await freshModule({});
    expect(m.sitePaths().basePath).toBe(DEFAULT_BASE_PATH);
    expect(m.sitePaths().siteUrl).toBe(DEFAULT_SITE_URL);
    expect(m.withBasePath("/icon.svg")).toBe("/euro-digest/icon.svg");
    expect(m.absoluteUrl("/about/")).toBe(
      "https://sguys99.github.io/euro-digest/about/",
    );
  });

  it("scripts(tsx): BASE_PATH·SITE_URL을 정규화해 쓴다", async () => {
    const m = await freshModule({
      BASE_PATH: "/from-env/",
      SITE_URL: "http://localhost:3000/",
    });
    expect(m.rssPath()).toBe("/from-env/rss.xml");
    expect(m.rssUrl()).toBe("http://localhost:3000/from-env/rss.xml");
    expect(m.icsPath({ kind: "korean" })).toBe("/from-env/calendar/korean.ics");
    expect(m.icsUrl({ kind: "team", team: "psg" })).toBe(
      "http://localhost:3000/from-env/calendar/psg.ics",
    );
    expect(m.ogImagePath({ kind: "competition", comp: "UCL" })).toBe(
      "/from-env/og/competitions/ucl.png",
    );
    expect(m.ogImageUrl()).toBe(
      "http://localhost:3000/from-env/og/default.png",
    );
    expect(m.manifestPath()).toBe("/from-env/manifest.webmanifest");
    expect(m.sitemapUrl()).toBe("http://localhost:3000/from-env/sitemap.xml");
    expect(m.cardShareUrl(DATE, CARD)).toBe(
      "http://localhost:3000/from-env/news/2026-10-10/#c_8f3a1b2c4d",
    );
  });

  it("번들: NEXT_PUBLIC_*가 BASE_PATH보다 우선하고, 빈 값(루트 배포)도 그대로 쓴다", async () => {
    const m = await freshModule({
      NEXT_PUBLIC_BASE_PATH: "",
      NEXT_PUBLIC_SITE_URL: "https://example.com",
      BASE_PATH: "/ignored",
      SITE_URL: "https://ignored.dev",
    });
    expect(m.withBasePath("/icon.svg")).toBe("/icon.svg");
    expect(m.absoluteUrl("/")).toBe("https://example.com/");
  });

  it("처음 만든 인스턴스를 재사용한다", async () => {
    const m = await freshModule({});
    expect(m.sitePaths()).toBe(m.sitePaths());
  });

  it("next.config.ts가 같은 값을 basePath와 NEXT_PUBLIC_*로 넘긴다(단일 출처 배선)", async () => {
    await freshModule({ BASE_PATH: "/x/", SITE_URL: "https://a.dev/" });
    const { default: config } = await import("../next.config");
    expect(config.basePath).toBe("/x");
    expect(config.env).toEqual({
      NEXT_PUBLIC_BASE_PATH: "/x",
      NEXT_PUBLIC_SITE_URL: "https://a.dev",
    });
    expect(config.trailingSlash).toBe(true);

    await freshModule({ BASE_PATH: "" });
    const { default: rootConfig } = await import("../next.config");
    expect(rootConfig.basePath).toBe("");
    expect(rootConfig.env?.NEXT_PUBLIC_BASE_PATH).toBe("");

    await freshModule({});
    const { default: defaultConfig } = await import("../next.config");
    expect(defaultConfig.basePath).toBe(DEFAULT_BASE_PATH);
    expect(defaultConfig.env?.NEXT_PUBLIC_SITE_URL).toBe(DEFAULT_SITE_URL);
  });
});

// ─── 가드: basePath 하드코딩 금지 (CLAUDE.md §7.1) ──────────────────────────

describe("가드 — basePath 하드코딩은 src/lib/paths.ts에만", () => {
  const ROOT = fileURLToPath(new URL("..", import.meta.url));

  function listFiles(dir: string, ext: RegExp): string[] {
    return readdirSync(path.join(ROOT, dir), {
      recursive: true,
      encoding: "utf8",
    })
      .filter((rel) => ext.test(rel))
      .map((rel) => `${dir}/${rel.split(path.sep).join("/")}`);
  }

  function offenders(
    files: readonly string[],
    pattern: RegExp,
    skipLine: (line: string) => boolean = () => false,
  ): string[] {
    const found: string[] = [];
    for (const file of files) {
      const lines = readFileSync(path.join(ROOT, file), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!skipLine(line) && pattern.test(line)) {
          found.push(`${file}:${i + 1} ${line.trim()}`);
        }
      });
    }
    return found;
  }

  // `/euro-digest` 경로(앞이 영숫자가 아님 — 저장소 주소 `sguys99/euro-digest`는 제외)와 운영 사이트 주소
  const SRC_PATTERN =
    /(?:^|[^\w.-])\/euro-digest(?![\w-])|github\.io\/euro-digest/;

  it("패턴 자체 점검: 경로·사이트 주소는 잡고 저장소 주소는 통과", () => {
    expect(SRC_PATTERN.test('href="/euro-digest/rss.xml"')).toBe(true);
    expect(SRC_PATTERN.test("`/euro-digest`")).toBe(true);
    expect(SRC_PATTERN.test("https://sguys99.github.io/euro-digest/")).toBe(
      true,
    );
    expect(SRC_PATTERN.test("https://github.com/sguys99/euro-digest")).toBe(
      false,
    );
    expect(SRC_PATTERN.test("/euro-digest-logo.svg")).toBe(false);
  });

  it("src/의 다른 파일에는 `/euro-digest` 경로·사이트 주소가 없다(주석 포함)", () => {
    const files = listFiles(
      "src",
      /\.(?:[cm]?[jt]sx?|css|json|md|html?)$/,
    ).filter((file) => file !== "src/lib/paths.ts");
    expect(files.length).toBeGreaterThan(0);
    expect(offenders(files, SRC_PATTERN)).toEqual([]);
  });

  it("scripts/·루트 설정 파일의 코드에는 '/euro-digest' 문자열 리터럴이 없다(DEFAULT_BASE_PATH를 쓴다)", () => {
    const files = [
      ...listFiles("scripts", /\.[cm]?ts$/),
      ...readdirSync(ROOT).filter((name) => /\.(?:[cm]?[jt]s)$/.test(name)),
    ];
    const isComment = (line: string): boolean =>
      /^\s*(?:\/\/|\/?\*)/.test(line);
    expect(offenders(files, /["'`]\/euro-digest(?:["'`/])/, isComment)).toEqual(
      [],
    );
  });
});
