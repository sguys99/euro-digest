/**
 * 경로 헬퍼 — basePath·SITE_URL 단일 출처 (CLAUDE.md §7.1, PRD §4 IA, M0-19)
 *
 * GitHub Pages 프로젝트 사이트는 `https://sguys99.github.io/euro-digest/` 아래에 걸린다.
 * `/`로 시작하는 경로를 손으로 쓰면 basePath가 빠져 운영에서만 링크가 깨진다 → 경로는 모두 여기서 만든다.
 *
 * 경로 4종 — 섞어 쓰지 않는다
 * | 종류                        | 예                                              | 만드는 곳                 | 쓰는 곳 |
 * |-----------------------------|-------------------------------------------------|---------------------------|---------|
 * | 라우트 (basePath 없음)      | `/news/2026-10-10/`                             | `routes.*`                | `next/link` href(Link가 basePath를 붙인다) · absoluteUrl 입력 |
 * | 산출물 경로 (basePath 없음) | `/rss.xml`                                      | `artifacts.*`             | build-feeds가 산출물 URL을 정할 때 · withBasePath/absoluteUrl 입력 |
 * | href (basePath 포함)        | `/euro-digest/rss.xml`                          | `withBasePath` · `*Path()`| `<link>`·일반 `<a>`(next/link 아님)·manifest·서비스워커 |
 * | 절대 URL                    | `https://sguys99.github.io/euro-digest/rss.xml` | `absoluteUrl` · `*Url()`  | RSS·OG·canonical·sitemap·카드 공유 |
 * - `next/link`에 href(basePath 포함)를 넣으면 basePath가 두 번 붙는다. 반대로 일반 `<a>`·`<link>`에 라우트를 넣으면 빠진다.
 * - 이미 basePath가 붙은 값을 withBasePath/absoluteUrl에 다시 넣으면 PathInputError로 막는다.
 *
 * basePath·SITE_URL 단일 출처
 * 1. 입력은 환경변수 `BASE_PATH`(기본 `/euro-digest`, 빈 값 = 루트 배포)·`SITE_URL`(기본 `https://sguys99.github.io`).
 * 2. next.config.ts가 `siteLocationFromBuildEnv`로 정규화해 `basePath`로 쓰고, 같은 값을
 *    `env.NEXT_PUBLIC_BASE_PATH`·`env.NEXT_PUBLIC_SITE_URL`로 서버·브라우저 번들에 빌드 시 인라인한다.
 * 3. 기본 인스턴스(`withBasePath` 등)는 `NEXT_PUBLIC_*`(번들 안) → `BASE_PATH`·`SITE_URL`(scripts·테스트) → 기본값 순으로 읽는다.
 *    scripts(tsx)는 next.config를 거치지 않지만 같은 환경변수·같은 정규화 함수를 쓰므로 빌드와 값이 같다.
 *
 * 규칙
 * - trailingSlash: true — 페이지 라우트는 모두 `/`로 끝나고, 산출물은 확장자로 끝난다.
 * - **파일 시스템 경로(`out/rss.xml` 등)는 다루지 않는다.** 이 모듈은 URL 경로만 만든다.
 *   산출물 경로 → out/ 파일 경로 변환과 쓰기는 scripts 쪽(build-feeds 등) 책임이다.
 * - 잘못된 입력(형식이 틀린 날짜·slug·카드 ID·대회 ID, 외부 URL, 이중 basePath 등)은 `PathInputError`.
 * - 런타임 의존성 없음: 브라우저 번들·next.config.ts·playwright.config.ts에서도 import한다.
 *   zod도 쓰지 않는다(초기 JS 예산) — 형식 정규식은 src/lib/schema와 같고 tests/paths.test.ts가 일치를 검사한다.
 *   next.config.ts가 읽을 수 있도록 내부 import는 상대 경로로 쓴다.
 */
import type { CompId } from "./schema/common";
import { REPO_URL } from "./site";

// ─── 상수·오류 ──────────────────────────────────────────────────────────────

/** basePath 기본값 — GitHub Pages 프로젝트 사이트 경로. 이 리터럴은 이 파일에만 둔다(tests/paths.test.ts 가드). */
export const DEFAULT_BASE_PATH = "/euro-digest";

/** SITE_URL 기본값 — 출처(origin)만. 경로는 basePath가 맡는다. */
export const DEFAULT_SITE_URL = "https://sguys99.github.io";

/** 경로 입력이 형식·규칙에 맞지 않을 때 던진다. */
export class PathInputError extends RangeError {
  override readonly name: string = "PathInputError";
}

/** 대회 ID 목록 — CompIdSchema(src/lib/schema/common.ts)와 같다(테스트가 일치 검사). zod를 번들에 넣지 않으려고 따로 둔다. */
const COMP_IDS: readonly CompId[] = [
  "EPL",
  "LALIGA",
  "SERIEA",
  "BUNDESLIGA",
  "LIGUE1",
  "UCL",
];

/**
 * 고정 경로와 겹쳐서 slug로 쓸 수 없는 값.
 * - 선수: `/korean-players/weekly/`(주간 리포트)와 겹친다.
 * - 팀(캘린더): `/calendar/korean.ics`(한국 선수 소속팀 묶음)와 겹친다.
 */
export const RESERVED_PLAYER_SLUGS: readonly string[] = ["weekly"];
export const RESERVED_TEAM_SLUGS: readonly string[] = ["korean"];

// SlugSchema·CardIdSchema와 같은 정규식
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CARD_ID_RE = /^c_[0-9a-f]{10}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEK_RE = /^(\d{4})-(\d{2})$/;
// basePath: `/` + 세그먼트(비예약 URL 문자)들. 끝 `/`는 정규화에서 뗀다.
const BASE_PATH_RE = /^(?:\/[A-Za-z0-9._~-]+)+$/;
// 산출물 파일 확장자(마지막 세그먼트)
const FILE_EXT_RE = /\.[A-Za-z0-9]+$/;

// ─── 내부 검사 ──────────────────────────────────────────────────────────────

/** 오류 메시지용 값 표시(길이 제한). */
function quote(value: unknown): string {
  return JSON.stringify(String(value).slice(0, 80));
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * ISO week-year의 주 수(52·53). 1월 1일이 목요일이거나, 윤년이면서 수요일이면 53주.
 * src/lib/time.ts의 isoWeeksInYear와 같은 결과(테스트가 2000~2100년 일치 검사) — 브라우저 번들에 time.ts를 끌어오지 않으려고 따로 둔다.
 */
function isoWeeksInYear(year: number): number {
  const p = year - 1;
  // 가우스 공식: 그해 1월 1일 요일(0 = 일요일)
  const jan1 = (1 + 5 * (p % 4) + 4 * (p % 100) + 6 * (p % 400)) % 7;
  return jan1 === 4 || (jan1 === 3 && isLeapYear(year)) ? 53 : 52;
}

function assertDate(date: unknown): string {
  const m = typeof date === "string" ? DATE_RE.exec(date) : null;
  if (!m) {
    throw new PathInputError(`날짜는 YYYY-MM-DD 형식이어야 함: ${quote(date)}`);
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    throw new PathInputError(`달력에 없는 날짜: ${quote(date)}`);
  }
  return m[0];
}

function assertWeek(week: unknown): string {
  const m = typeof week === "string" ? WEEK_RE.exec(week) : null;
  if (!m) {
    throw new PathInputError(
      `ISO 주차는 YYYY-WW 형식이어야 함(예: 2026-43): ${quote(week)}`,
    );
  }
  const year = Number(m[1]);
  const w = Number(m[2]);
  if (year < 1 || w < 1 || w > isoWeeksInYear(year)) {
    throw new PathInputError(`${year}년에 없는 ISO 주차: ${quote(week)}`);
  }
  return m[0];
}

function assertCardId(cardId: unknown): string {
  if (typeof cardId !== "string" || !CARD_ID_RE.test(cardId)) {
    throw new PathInputError(
      `카드 ID는 c_ + 16진수 소문자 10자리여야 함: ${quote(cardId)}`,
    );
  }
  return cardId;
}

function assertSlug(
  slug: unknown,
  label: string,
  reserved: readonly string[] = [],
): string {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    throw new PathInputError(
      `${label}는 소문자 kebab-case여야 함: ${quote(slug)}`,
    );
  }
  if (reserved.includes(slug)) {
    throw new PathInputError(
      `${label} ${quote(slug)}는 고정 경로와 겹쳐 쓸 수 없음`,
    );
  }
  return slug;
}

/** 대회 ID 검사 — 대문자 CompId만(`"EPL"`). URL 세그먼트(`"epl"`)는 compFromSegment로 바꾼 뒤 넘긴다. */
function assertCompId(comp: unknown): CompId {
  const found = COMP_IDS.find((id) => id === comp);
  if (found === undefined) {
    throw new PathInputError(
      `대회 ID는 ${COMP_IDS.join("·")} 중 하나여야 함: ${quote(comp)}`,
    );
  }
  return found;
}

function unknownKind(fn: string, value: never): never {
  const kind = (value as { kind?: unknown } | null)?.kind;
  throw new PathInputError(`${fn}: 알 수 없는 kind ${quote(kind)}`);
}

function startsWithBase(pathname: string, basePath: string): boolean {
  return (
    basePath !== "" &&
    (pathname === basePath || pathname.startsWith(`${basePath}/`))
  );
}

/**
 * withBasePath·absoluteUrl 입력 검사 — basePath 없는 사이트 경로만 받는다.
 * - `/`로 시작(외부 URL·상대 경로·빈 값 불가), `//`로 시작 불가(프로토콜 상대 URL)
 * - 경로 부분에 이중 슬래시·`.`/`..` 세그먼트·공백·역슬래시 불가
 * - 이미 basePath(현재 값 또는 기본값 `/euro-digest`)로 시작하면 불가 — 이중 basePath·하드코딩 방지
 * - trailingSlash: 경로 부분은 `/`로 끝나거나(페이지) 마지막 세그먼트에 확장자가 있어야(파일) 한다
 * - `?쿼리`·`#해시`는 검사하지 않고 그대로 둔다
 */
function assertSitePath(fn: string, path: unknown, basePath: string): string {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new PathInputError(
      `${fn}: "/"로 시작하는 사이트 경로만 받음(외부 URL·상대 경로 불가): ${quote(path)}`,
    );
  }
  if (path.startsWith("//")) {
    throw new PathInputError(
      `${fn}: "//"로 시작하는 값은 프로토콜 상대 URL이라 받지 않음: ${quote(path)}`,
    );
  }
  if (/[\s\\]/.test(path)) {
    throw new PathInputError(
      `${fn}: 공백·역슬래시는 쓸 수 없음(필요하면 퍼센트 인코딩): ${quote(path)}`,
    );
  }
  const cut = path.search(/[?#]/);
  const pathname = cut === -1 ? path : path.slice(0, cut);
  if (pathname.includes("//")) {
    throw new PathInputError(`${fn}: 이중 슬래시: ${quote(path)}`);
  }
  const segments = pathname.split("/");
  if (segments.some((s) => s === "." || s === "..")) {
    throw new PathInputError(
      `${fn}: "." · ".." 세그먼트는 쓸 수 없음: ${quote(path)}`,
    );
  }
  if (
    startsWithBase(pathname, basePath) ||
    startsWithBase(pathname, DEFAULT_BASE_PATH)
  ) {
    throw new PathInputError(
      `${fn}: 이미 basePath가 붙은 값 — basePath 없는 경로를 넘길 것: ${quote(path)}`,
    );
  }
  const last = segments[segments.length - 1] ?? "";
  if (last !== "" && !FILE_EXT_RE.test(last)) {
    throw new PathInputError(
      `${fn}: 페이지 경로는 "/"로 끝나야 함(trailingSlash), 파일은 확장자 필요: ${quote(path)}`,
    );
  }
  return path;
}

// ─── 정규화 (next.config.ts·scripts 공용) ───────────────────────────────────

/**
 * BASE_PATH 정규화 — 미지정(undefined)이면 기본값, 앞뒤 공백·끝 `/` 제거, 빈 값("")·`/`는 루트 배포("").
 * 결과는 `""` 또는 `/`로 시작하고 `/`로 끝나지 않는 값(Next basePath 규칙). 형식이 틀리면 PathInputError.
 * 예) undefined → "/euro-digest", "/euro-digest/" → "/euro-digest", "" → "", "/a/b" → "/a/b"
 */
export function normalizeBasePath(raw: string | undefined): string {
  if (raw === undefined) return DEFAULT_BASE_PATH;
  const value = raw.trim().replace(/\/+$/, "");
  if (value === "") return "";
  if (
    !BASE_PATH_RE.test(value) ||
    value.split("/").some((s) => s === "." || s === "..")
  ) {
    throw new PathInputError(
      `BASE_PATH 형식 오류(예: "${DEFAULT_BASE_PATH}", 루트 배포는 ""): ${quote(raw)}`,
    );
  }
  return value;
}

/**
 * SITE_URL 정규화 — 출처(origin)만 받는다. 미지정·빈 값이면 기본값, 끝 `/` 제거.
 * http(s)가 아니거나 경로·쿼리·해시·사용자 정보가 붙어 있으면 PathInputError(경로는 BASE_PATH로 지정).
 * 예) "https://sguys99.github.io/" → "https://sguys99.github.io", "http://127.0.0.1:4173" 그대로
 */
export function normalizeSiteOrigin(raw: string | undefined): string {
  const value = (raw?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PathInputError(`SITE_URL이 URL이 아님: ${quote(raw)}`);
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    /[?#]/.test(value)
  ) {
    throw new PathInputError(
      `SITE_URL은 http(s) 출처만(예: "${DEFAULT_SITE_URL}", 경로는 BASE_PATH로): ${quote(raw)}`,
    );
  }
  return url.origin;
}

/** 정규화된 사이트 위치. basePath는 "" 또는 `/x`, siteUrl은 끝 `/` 없는 출처. */
export interface SiteLocation {
  basePath: string;
  siteUrl: string;
}

/**
 * next.config.ts 전용 — 빌드 환경변수(BASE_PATH·SITE_URL)에서 사이트 위치를 정한다.
 * `NEXT_PUBLIC_BASE_PATH`·`NEXT_PUBLIC_SITE_URL`은 next.config가 이 결과로 채우는 출력값이다.
 * 셸에서 다른 값으로 직접 지정하면 scripts(tsx)와 빌드 결과가 갈라지므로 오류로 막는다.
 */
export function siteLocationFromBuildEnv(
  env: Readonly<Record<string, string | undefined>>,
): SiteLocation {
  const location: SiteLocation = {
    basePath: normalizeBasePath(env.BASE_PATH),
    siteUrl: normalizeSiteOrigin(env.SITE_URL),
  };
  const publicBasePath = env.NEXT_PUBLIC_BASE_PATH;
  if (
    publicBasePath !== undefined &&
    normalizeBasePath(publicBasePath) !== location.basePath
  ) {
    throw new PathInputError(
      `NEXT_PUBLIC_BASE_PATH(${quote(publicBasePath)})가 BASE_PATH 결과(${quote(location.basePath)})와 다름 — NEXT_PUBLIC_BASE_PATH는 지정하지 말고 BASE_PATH를 쓸 것`,
    );
  }
  const publicSiteUrl = env.NEXT_PUBLIC_SITE_URL;
  if (
    publicSiteUrl !== undefined &&
    normalizeSiteOrigin(publicSiteUrl) !== location.siteUrl
  ) {
    throw new PathInputError(
      `NEXT_PUBLIC_SITE_URL(${quote(publicSiteUrl)})이 SITE_URL 결과(${quote(location.siteUrl)})와 다름 — NEXT_PUBLIC_SITE_URL은 지정하지 말고 SITE_URL을 쓸 것`,
    );
  }
  return location;
}

// ─── 대회 ID ↔ URL 세그먼트 ─────────────────────────────────────────────────

/** 대회 ID → URL 세그먼트(소문자). 예) "EPL" → "epl" (`/competitions/epl/`, `/rss/epl.xml`) */
export function compSegment(comp: CompId): string {
  return assertCompId(comp).toLowerCase();
}

/** URL 세그먼트 → 대회 ID. 소문자 세그먼트만 받고, 모르는 값이면 null. generateStaticParams·페이지 params 해석용. */
export function compFromSegment(segment: string): CompId | null {
  return COMP_IDS.find((id) => id.toLowerCase() === segment) ?? null;
}

// ─── 라우트 (basePath 없음 — next/link href 전용) ───────────────────────────

/**
 * PRD §4 IA의 페이지 라우트. 모두 `/`로 끝난다(trailingSlash). basePath는 붙이지 않는다 —
 * `next/link`가 붙이고, 절대 URL은 `absoluteUrl(routes.xxx())`로 만든다.
 */
export const routes = {
  /** `/` 홈 */
  home: (): string => "/",
  /** `/news/` 뉴스 피드 */
  news: (): string => "/news/",
  /** `/news/YYYY-MM-DD/` 날짜별 아카이브 (FR-33) */
  newsArchive: (date: string): string => `/news/${assertDate(date)}/`,
  /** `/news/YYYY-MM-DD/#c_xxxxxxxxxx` 카드 공유 앵커 (FR-34) — 공유용 절대 URL은 `cardShareUrl` */
  card: (date: string, cardId: string): string =>
    `/news/${assertDate(date)}/#${assertCardId(cardId)}`,
  /** `/competitions/epl/` 대회 (FR-40) — 세그먼트는 소문자 */
  competition: (comp: CompId): string => `/competitions/${compSegment(comp)}/`,
  /** `/teams/{slug}/` 팀 상세 */
  team: (team: string): string => `/teams/${assertSlug(team, "팀 slug")}/`,
  /** `/korean-players/` 한국 선수 현황 */
  koreanPlayers: (): string => "/korean-players/",
  /** `/korean-players/{slug}/` 선수 상세 — slug `weekly`는 주간 리포트와 겹쳐 불가 */
  koreanPlayer: (player: string): string =>
    `/korean-players/${assertSlug(player, "선수 slug", RESERVED_PLAYER_SLUGS)}/`,
  /** `/korean-players/weekly/` 최신 주간 리포트 */
  weeklyReport: (): string => "/korean-players/weekly/",
  /** `/korean-players/weekly/YYYY-WW/` 주간 리포트 아카이브 (FR-93, ISO 8601 주차 — 연도는 ISO week-year) */
  weeklyReportArchive: (week: string): string =>
    `/korean-players/weekly/${assertWeek(week)}/`,
  /** `/transfers/` 이적시장 트래커 */
  transfers: (): string => "/transfers/",
  /** `/national-team/` A매치 */
  nationalTeam: (): string => "/national-team/",
  /** `/tonight/` 오늘 밤 볼 경기 */
  tonight: (): string => "/tonight/",
  /** `/my/` 마이 팀 */
  my: (): string => "/my/",
  /** `/search/` 검색 */
  search: (): string => "/search/",
  /** `/about/` 소개·정책 */
  about: (): string => "/about/",
  /** `/privacy/` 개인정보 처리방침 */
  privacy: (): string => "/privacy/",
  /** `/status/` 공개 상태 페이지 */
  status: (): string => "/status/",
} as const;

// ─── 빌드 산출물 (basePath 없음) ────────────────────────────────────────────

/** RSS 피드 (FR-122) */
export type RssFeed =
  { kind: "all" } | { kind: "competition"; comp: CompId } | { kind: "korean" };

/** .ics 캘린더 (FR-83·FR-123) */
export type CalendarFeed =
  | { kind: "team"; team: string }
  | { kind: "korean" }
  | { kind: "match"; matchId: string };

/** 공유 OG 이미지 (DR-10) — 파일 규칙은 잠정안(M5-01에서 확정) */
export type OgImage =
  | { kind: "default" }
  | { kind: "news"; date: string }
  | { kind: "competition"; comp: CompId }
  | { kind: "team"; team: string };

/**
 * 빌드 산출물의 사이트 경로(basePath 없음, 확장자로 끝남). URL 규칙의 단일 출처다.
 * build-feeds는 이 값으로 out/ 안의 저장 위치를 정한다(파일 시스템 경로 변환은 호출 쪽 책임).
 * 화면에서는 basePath가 붙은 `rssPath()` 등을, 피드·메타에는 `rssUrl()` 등을 쓴다.
 */
export const artifacts = {
  /** `/rss.xml` 전체 · `/rss/{comp}.xml` 대회별 · `/rss/korean.xml` 한국 선수 */
  rss(feed: RssFeed = { kind: "all" }): string {
    switch (feed.kind) {
      case "all":
        return "/rss.xml";
      case "competition":
        return `/rss/${compSegment(feed.comp)}.xml`;
      case "korean":
        return "/rss/korean.xml";
      default:
        return unknownKind("artifacts.rss", feed);
    }
  },
  /** `/calendar/{team}.ics` 팀 · `/calendar/korean.ics` 한국 선수 소속팀 · `/calendar/match/{id}.ics` 경기별 */
  calendar(feed: CalendarFeed): string {
    switch (feed.kind) {
      case "team":
        return `/calendar/${assertSlug(feed.team, "팀 slug", RESERVED_TEAM_SLUGS)}.ics`;
      case "korean":
        return "/calendar/korean.ics";
      case "match":
        // Match.id(데이터 API 숫자 ID)·NationalMatch.id(slug) 모두 slug 형식을 만족한다.
        return `/calendar/match/${assertSlug(feed.matchId, "경기 ID")}.ics`;
      default:
        return unknownKind("artifacts.calendar", feed);
    }
  },
  /**
   * OG 이미지(1200×630 PNG, 빌드 시 Playwright 스크린샷 — DR-10·§15 D13). **잠정 규칙(M5-01에서 확정)**:
   * `/og/default.png` · `/og/news/{date}.png` · `/og/competitions/{comp}.png` · `/og/teams/{team}.png`
   */
  ogImage(image: OgImage = { kind: "default" }): string {
    switch (image.kind) {
      case "default":
        return "/og/default.png";
      case "news":
        return `/og/news/${assertDate(image.date)}.png`;
      case "competition":
        return `/og/competitions/${compSegment(image.comp)}.png`;
      case "team":
        return `/og/teams/${assertSlug(image.team, "팀 slug")}.png`;
      default:
        return unknownKind("artifacts.ogImage", image);
    }
  },
  /** `/manifest.webmanifest` (FR-120, Next 메타데이터 규칙과 같은 파일명) */
  manifest: (): string => "/manifest.webmanifest",
  /** `/sitemap.xml` (FR-124) */
  sitemap: (): string => "/sitemap.xml",
  /** `/robots.txt` (FR-124) */
  robots: (): string => "/robots.txt",
} as const;

// ─── 외부 링크 (basePath 무관) ──────────────────────────────────────────────

/**
 * "요약 오류 신고" GitHub 이슈 폼 링크 (FR-36). 카드 ID·발행 날짜가 미리 채워진다.
 * 필드 id(card·date)는 .github/ISSUE_TEMPLATE/summary-error.yml과 맞춘다.
 * 예) https://github.com/sguys99/euro-digest/issues/new?template=summary-error.yml&card=c_8f3a1b2c4d&date=2026-10-10
 */
export function summaryErrorIssueUrl(cardId: string, date: string): string {
  const query = new URLSearchParams({
    template: "summary-error.yml",
    card: assertCardId(cardId),
    date: assertDate(date),
  });
  return `${REPO_URL}/issues/new?${query.toString()}`;
}

// ─── basePath·SITE_URL에 따라 달라지는 헬퍼 ─────────────────────────────────

export interface SitePaths {
  /** "" 또는 `/euro-digest` 같은 값 */
  readonly basePath: string;
  /** 끝 `/` 없는 출처. 예) `https://sguys99.github.io` */
  readonly siteUrl: string;
  /** 사이트 경로 → basePath 포함 href. public/ 정적 자산(폰트·아이콘·manifest)과 일반 `<a>`·`<link>`용. 쿼리·해시 보존 */
  withBasePath(path: string): string;
  /** 사이트 경로(라우트·산출물) → 절대 URL(SITE_URL + basePath + path). RSS·OG·canonical·sitemap용 */
  absoluteUrl(path: string): string;
  /** RSS href (`<link rel="alternate">`·구독 버튼) */
  rssPath(feed?: RssFeed): string;
  /** RSS 절대 URL (피드 self 링크·sitemap) */
  rssUrl(feed?: RssFeed): string;
  /** .ics href (캘린더 추가 버튼) */
  icsPath(feed: CalendarFeed): string;
  /** .ics 절대 URL (캘린더 앱 구독 주소) */
  icsUrl(feed: CalendarFeed): string;
  /** OG 이미지 href */
  ogImagePath(image?: OgImage): string;
  /** OG 이미지 절대 URL (`og:image` 메타) */
  ogImageUrl(image?: OgImage): string;
  /** Web App Manifest href */
  manifestPath(): string;
  /** sitemap 절대 URL (robots.txt의 `Sitemap:`) */
  sitemapUrl(): string;
  /** 카드 공유 절대 URL (FR-34). 예) https://sguys99.github.io/euro-digest/news/2026-10-10/#c_8f3a1b2c4d */
  cardShareUrl(date: string, cardId: string): string;
}

/**
 * basePath·SITE_URL을 받아 헬퍼 묶음을 만든다. 값은 normalizeBasePath·normalizeSiteOrigin 규칙으로 정규화한다
 * (undefined = 기본값, basePath "" = 루트 배포). 테스트·다른 배포 위치 계산용이고,
 * 앱 코드는 env 기반 기본 인스턴스(아래 named export)를 쓴다.
 */
export function createPaths(location: {
  basePath: string | undefined;
  siteUrl: string | undefined;
}): SitePaths {
  const basePath = normalizeBasePath(location.basePath);
  const siteUrl = normalizeSiteOrigin(location.siteUrl);

  const withBase = (path: string): string =>
    `${basePath}${assertSitePath("withBasePath", path, basePath)}`;
  const absolute = (path: string): string =>
    `${siteUrl}${basePath}${assertSitePath("absoluteUrl", path, basePath)}`;

  return {
    basePath,
    siteUrl,
    withBasePath: withBase,
    absoluteUrl: absolute,
    rssPath: (feed) => withBase(artifacts.rss(feed)),
    rssUrl: (feed) => absolute(artifacts.rss(feed)),
    icsPath: (feed) => withBase(artifacts.calendar(feed)),
    icsUrl: (feed) => absolute(artifacts.calendar(feed)),
    ogImagePath: (image) => withBase(artifacts.ogImage(image)),
    ogImageUrl: (image) => absolute(artifacts.ogImage(image)),
    manifestPath: () => withBase(artifacts.manifest()),
    sitemapUrl: () => absolute(artifacts.sitemap()),
    cardShareUrl: (date, cardId) => absolute(routes.card(date, cardId)),
  };
}

// ─── env 기반 기본 인스턴스 ─────────────────────────────────────────────────

let defaultPaths: SitePaths | undefined;

/**
 * 현재 환경의 헬퍼 묶음(처음 쓸 때 한 번 만든다). 읽는 순서: NEXT_PUBLIC_* → BASE_PATH·SITE_URL → 기본값.
 * `process.env.NEXT_PUBLIC_BASE_PATH`는 Next가 빌드 시 이 표현식 그대로를 문자열로 치환한다 —
 * 구조 분해나 `process.env[key]`로 바꾸면 브라우저 번들에서 값이 사라진다.
 */
export function sitePaths(): SitePaths {
  defaultPaths ??= createPaths({
    basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.BASE_PATH,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL,
  });
  return defaultPaths;
}

/** 사이트 경로 → basePath 포함 href. 예) `/fonts/a.woff2` → `/euro-digest/fonts/a.woff2` */
export function withBasePath(path: string): string {
  return sitePaths().withBasePath(path);
}

/** 사이트 경로 → 절대 URL. 예) `/news/2026-10-10/` → `https://sguys99.github.io/euro-digest/news/2026-10-10/` */
export function absoluteUrl(path: string): string {
  return sitePaths().absoluteUrl(path);
}

/** RSS href. 예) `/euro-digest/rss.xml` */
export function rssPath(feed?: RssFeed): string {
  return sitePaths().rssPath(feed);
}

/** RSS 절대 URL */
export function rssUrl(feed?: RssFeed): string {
  return sitePaths().rssUrl(feed);
}

/** .ics href. 예) `/euro-digest/calendar/liverpool.ics` */
export function icsPath(feed: CalendarFeed): string {
  return sitePaths().icsPath(feed);
}

/** .ics 절대 URL */
export function icsUrl(feed: CalendarFeed): string {
  return sitePaths().icsUrl(feed);
}

/** OG 이미지 href */
export function ogImagePath(image?: OgImage): string {
  return sitePaths().ogImagePath(image);
}

/** OG 이미지 절대 URL */
export function ogImageUrl(image?: OgImage): string {
  return sitePaths().ogImageUrl(image);
}

/** Web App Manifest href. 예) `/euro-digest/manifest.webmanifest` */
export function manifestPath(): string {
  return sitePaths().manifestPath();
}

/** sitemap 절대 URL */
export function sitemapUrl(): string {
  return sitePaths().sitemapUrl();
}

/** 카드 공유 절대 URL (FR-34) */
export function cardShareUrl(date: string, cardId: string): string {
  return sitePaths().cardShareUrl(date, cardId);
}
