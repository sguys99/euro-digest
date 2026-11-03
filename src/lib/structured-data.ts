/**
 * 구조화 데이터(JSON-LD) — schema.org 노드를 만드는 순수 함수와 직렬화 (PRD NFR-03, plan M5-03)
 *
 * 페이지는 이 모듈로 노드를 만들어 서버 컴포넌트 `JsonLd`(src/components/seo/json-ld.tsx)에 넘긴다 — 정적 HTML의
 * `<script type="application/ld+json">`이 되고 클라이언트 JS는 없다. 손으로 JSON을 조립하지 않는다.
 *
 * 유형별 결정(2026-11-03 — PRD §15 D74)
 * - **사이트 전역(홈만)**: `WebSite`(이름 · 영문 이름 · 주소 · 설명 · 언어 · 발행처) + `Organization`(이름 · 주소 — 로고 없음, 이미지 자산 금지
 *   CLAUDE §1-6). Google은 사이트 이름 구조화 데이터를 홈 한 곳에서 읽는다. 검색 `potentialAction`(SearchAction)은 두지 않는다 —
 *   Google이 사이트링크 검색창을 2024-11에 없앴고, `/search/`는 noindex 페이지다.
 * - **날짜 호 `/news/{date}/`**: `CollectionPage`(그 호 지면 — 이름 · 설명 · 수정 시각 · 대표 이미지 = 날짜 OG). 카드는 **넣지 않는다** —
 *   카드는 다른 매체 기사로 가는 링크라 우리 `NewsArticle`로 표시하면 저자를 사칭하게 되고, 바깥 주소 `ItemList`는 Google 목록형
 *   결과(같은 도메인 주소만) 대상도 아니면서 페이지만 키운다. 우리가 쓴 글은 **이날의 5줄**뿐이라 브리핑 줄이 있으면 그것만
 *   `hasPart` `NewsArticle`(저자 · 발행처 = 유로 다이제스트, 제목 = 호수 · 날짜, 본문 없음)로 싣는다. og:type은 website 그대로(한 호는 기사 한
 *   편이 아니라 지면 — CollectionPage와 같은 판단).
 * - **팀 `/teams/{slug}/`**: `SportsTeam`(이름 · 영문 이름 · 종목 · 리그 `memberOf` · 주소). 로고 · 이미지 없음(OG 카드는 우리 배지라 팀
 *   이미지로 오해될 수 있어 넣지 않는다). UCL 외부 팀은 국내 리그 데이터가 없어 `memberOf`를 생략한다(UCL은 리그 소속이 아님).
 * - **경기 `SportsEvent`**: 대회 · 팀 · `/tonight/`. **다가오는 경기만**(킥오프가 빌드 시각 뒤 · 종료 아님 · 킥오프 확정) — 지난 경기를
 *   빼서 스코어는 물론 승패도 싣지 않는다(결과 노출 0 — DECISIONS D0 §5 #9). 홈 · 원정 팀 · 시작 시각(UTC ISO) · 상태(예정 · 연기) ·
 *   대회(`organizer`). 장소는 데이터에 없어 생략한다. 개수: 대회 10경기(리그 한 라운드) · 팀 4경기(화면 일정 창의 다가오는 경기 수) ·
 *   `/tonight/` 선정 경기 전부 — 대회 페이지 HTML이 이미 커서(M5-07) 일정 전체를 싣지 않는다.
 * - **한국 선수 상세**: `Person`(이름 · 영문 이름 · 소속 팀 — 출전 · 결과 수치 없음, M3-10).
 *
 * 규칙
 * - 주소는 모두 canonical과 같은 절대 URL(`absoluteUrl` — SITE_URL + basePath + 끝 슬래시). 팀 링크는 팀 페이지가 있을 때만.
 * - 결과 노출 0: 글자 필드(name · headline · description · alternateName)에 스코어 모양이 있으면 던진다(빌드 실패 — `pageMetadata`와 같은 검사).
 * - 직렬화(`serializeJsonLd`)는 `<` `>` `&` U+2028 · U+2029를 `\uXXXX`로 바꾼다 — 데이터에 `</script>`가 섞여도 스크립트를 닫지 못한다.
 */
import type { TeamView } from "./competition-view";
import { archiveDateLabel, archiveHeading } from "./news/archive";
import { issueNumber } from "./issue";
import { newsOgCard } from "./og";
import { absoluteUrl, routes } from "./paths";
import type { CompId } from "./schema/common";
import type { Match } from "./schema/competition";
import { hasScoreLike, ogImageMeta, SITE_DESCRIPTION } from "./seo";
import { SITE_NAME } from "./site";

/** JSON-LD 노드(값은 문자열 · 숫자 · 불리언 · 노드 · 배열) */
export type JsonLdNode = { [key: string]: JsonLdValue };
export type JsonLdValue =
  string | number | boolean | JsonLdNode | readonly JsonLdValue[];

export const SCHEMA_CONTEXT = "https://schema.org";

/** 사이트 영문 이름(WebSite alternateName — CLAUDE.md 표제 "유로 다이제스트 (Euro Digest)") */
export const SITE_NAME_EN = "Euro Digest";

/** inLanguage — BCP 47 */
export const JSON_LD_LANGUAGE = "ko-KR";

/** 종목(SportsTeam · SportsEvent `sport`) */
export const SPORT = "Soccer";

/** 대회 페이지에 싣는 다가오는 경기 수 — 리그 한 라운드(10경기) */
export const COMPETITION_EVENT_LIMIT = 10;

/** 리그(국내 1부) — `memberOf`를 다는 대회. UCL은 소속이 아니라 참가라 뺀다 */
const LEAGUES: ReadonlySet<CompId> = new Set([
  "EPL",
  "LALIGA",
  "SERIEA",
  "BUNDESLIGA",
  "LIGUE1",
]);

/** 결과 노출 검사 대상 글자 필드 */
const TEXT_KEYS: ReadonlySet<string> = new Set([
  "name",
  "headline",
  "description",
  "alternateName",
]);

// ─── 직렬화 · 검사 ────────────────────────────────────────────────────────

/**
 * JSON-LD 문자열 — `<script>` 안에 그대로 넣을 수 있게 HTML에서 뜻이 있는 글자를 JSON 유니코드 이스케이프로 바꾼다
 * (`</script>`·`<!--` 주입 방지). JSON으로 다시 읽으면 원래 값과 같다.
 */
export function serializeJsonLd(data: JsonLdNode): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** 결과 노출 0 — 글자 필드에 스코어 모양이 있으면 던진다(빌드 실패). 노드를 그대로 돌려준다 */
export function assertNoScoreInJsonLd<T extends JsonLdValue>(
  value: T,
  where = "JSON-LD",
): T {
  const walk = (v: JsonLdValue, key: string | null): void => {
    if (typeof v === "string") {
      if (key !== null && TEXT_KEYS.has(key) && hasScoreLike(v)) {
        throw new RangeError(
          `${where} ${key}에 스코어 모양이 있음(결과 노출 0 — DECISIONS D0 §5 #9): ${JSON.stringify(v)}`,
        );
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v as readonly JsonLdValue[]) walk(item, key);
      return;
    }
    if (typeof v === "object") {
      for (const [k, child] of Object.entries(v as JsonLdNode)) walk(child, k);
    }
  };
  walk(value, null);
  return value;
}

// ─── 사이트 · 발행처 ──────────────────────────────────────────────────────

const homeUrl = (): string => absoluteUrl(routes.home());
export const websiteId = (): string => `${homeUrl()}#website`;
export const organizationId = (): string => `${homeUrl()}#organization`;

/** 발행처(이름 · 주소만 — 로고 없음) */
function organizationNode(): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": organizationId(),
    name: SITE_NAME,
    url: homeUrl(),
  };
}

/** 다른 페이지에서 사이트를 가리키는 최소 노드 */
function websiteRef(): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": websiteId(),
    name: SITE_NAME,
    url: homeUrl(),
  };
}

/** 홈 — WebSite + Organization(검색 potentialAction 없음 — 머리 주석) */
export function siteJsonLd(): JsonLdNode {
  return assertNoScoreInJsonLd({
    "@context": SCHEMA_CONTEXT,
    "@graph": [
      {
        "@type": "WebSite",
        "@id": websiteId(),
        url: homeUrl(),
        name: SITE_NAME,
        alternateName: SITE_NAME_EN,
        description: SITE_DESCRIPTION,
        inLanguage: JSON_LD_LANGUAGE,
        publisher: { "@id": organizationId() },
      },
      organizationNode(),
    ],
  });
}

// ─── 날짜 호 ──────────────────────────────────────────────────────────────

export interface IssueJsonLdInput {
  /** KST 발행일 "YYYY-MM-DD" */
  date: string;
  /** 메타 설명과 같은 문장(`archiveDescription`) */
  description: string;
  /** 지면이 마지막으로 바뀐 시각(sitemap lastmod와 같은 값 — src/lib/data/issue.ts `issuePageLastModified`) */
  lastModified: string;
  /** 그 호 브리핑 — 줄이 없거나(경기 없는 날) 파일이 없으면 null */
  brief: {
    generatedAt: string;
    /** 줄 수 */
    lines: number;
    /** 그 가운데 LLM이 쓴 줄(`ai:true`) 수 — "AI 작성" 고지 */
    aiLines: number;
  } | null;
}

/** 날짜 아카이브 브리핑 머리 id(src/components/brief/today-brief.tsx 기본 headingId) */
export const BRIEF_ANCHOR = "brief-h";

/** "이날의 5줄 · 제 3호 · 2026년 10월 14일 (수)" — 호수가 없으면 날짜만 */
export function briefHeadline(date: string): string {
  const no = issueNumber(date);
  return `이날의 5줄 · ${no === null ? "" : `제 ${no}호 · `}${archiveDateLabel(date)}`;
}

/** 브리핑 설명 — 줄 수와 AI 작성 줄 수(사실만, 브리핑 문장 · 스코어 없음) */
export function briefDescription(lines: number, aiLines: number): string {
  const ai =
    aiLines === 0
      ? "모두 데이터 템플릿 문장"
      : aiLines === lines
        ? "모두 AI 작성"
        : `${aiLines}줄 AI 작성`;
  return `전날 유럽 축구 경기 데이터를 정리한 한국어 브리핑 ${lines}줄(${ai}).`;
}

/** 날짜 호 — CollectionPage(+ 브리핑이 있으면 hasPart NewsArticle). 카드(다른 매체 기사)는 싣지 않는다(머리 주석) */
export function issueJsonLd(input: IssueJsonLdInput): JsonLdNode {
  const url = absoluteUrl(routes.newsArchive(input.date));
  const image = ogImageMeta(newsOgCard(input.date));
  const imageNode: JsonLdNode = {
    "@type": "ImageObject",
    url: image.url,
    width: image.width,
    height: image.height,
  };
  const brief = input.brief;
  const article: JsonLdNode | null =
    brief === null || brief.lines === 0
      ? null
      : {
          "@type": "NewsArticle",
          "@id": `${url}#brief`,
          url: `${url}#${BRIEF_ANCHOR}`,
          headline: briefHeadline(input.date),
          description: briefDescription(brief.lines, brief.aiLines),
          articleSection: "오늘의 5줄",
          inLanguage: JSON_LD_LANGUAGE,
          datePublished: brief.generatedAt,
          dateModified: brief.generatedAt,
          image: [image.url],
          author: [organizationNode()],
          publisher: organizationNode(),
          isAccessibleForFree: true,
        };
  return assertNoScoreInJsonLd(
    {
      "@context": SCHEMA_CONTEXT,
      "@type": "CollectionPage",
      "@id": url,
      url,
      name: archiveHeading(input.date),
      description: input.description,
      inLanguage: JSON_LD_LANGUAGE,
      dateModified: input.lastModified,
      isPartOf: websiteRef(),
      primaryImageOfPage: imageNode,
      ...(article ? { hasPart: [article] } : {}),
    },
    `/news/${input.date}/ JSON-LD`,
  );
}

// ─── 팀 · 경기 ────────────────────────────────────────────────────────────

/** 팀 노드 id — 팀 페이지가 있으면 `{팀 주소}#team`(대회 · 오늘 밤 경기의 홈 · 원정 팀과 같은 id) */
export const teamId = (slug: string): string =>
  `${absoluteUrl(routes.team(slug))}#team`;

/** 대회 노드 — 이름 · 대회 페이지 주소 */
function competitionNode(comp: { id: CompId; name: string }): JsonLdNode {
  return {
    "@type": "SportsOrganization",
    name: comp.name,
    url: absoluteUrl(routes.competition(comp.id)),
  };
}

/** 경기의 팀 — 팀 페이지가 있을 때만 주소 · id */
function teamRef(team: Pick<TeamView, "slug" | "name" | "page">): JsonLdNode {
  return {
    "@type": "SportsTeam",
    ...(team.page
      ? { "@id": teamId(team.slug), url: absoluteUrl(routes.team(team.slug)) }
      : {}),
    name: team.name,
  };
}

export interface SportsTeamInput {
  slug: string;
  /** 한글 팀명(화면 이름) */
  name: string;
  nameEn: string;
  /** 대표 대회 — 리그면 memberOf, UCL이거나 없으면 생략 */
  league: { id: CompId; name: string } | null;
}

/** 팀 — SportsTeam(로고 · 이미지 · 순위 없음) */
export function sportsTeamNode(input: SportsTeamInput): JsonLdNode {
  return {
    "@type": "SportsTeam",
    "@id": teamId(input.slug),
    url: absoluteUrl(routes.team(input.slug)),
    name: input.name,
    ...(input.nameEn && input.nameEn !== input.name
      ? { alternateName: input.nameEn }
      : {}),
    sport: SPORT,
    ...(input.league && LEAGUES.has(input.league.id)
      ? { memberOf: competitionNode(input.league) }
      : {}),
  };
}

/** 경기 하나 — SportsEvent에 필요한 것만(스코어 필드 없음) */
export interface EventInput {
  kickoff: string;
  status: "scheduled" | "postponed";
  home: Pick<TeamView, "slug" | "name" | "page">;
  away: Pick<TeamView, "slug" | "name" | "page">;
  competition: { id: CompId; name: string };
}

const EVENT_STATUS: Readonly<Record<EventInput["status"], string>> = {
  scheduled: "https://schema.org/EventScheduled",
  postponed: "https://schema.org/EventPostponed",
};

/** 경기 — SportsEvent(장소는 데이터에 없어 생략). 이름 "홈 vs 원정" */
export function sportsEventNode(input: EventInput): JsonLdNode {
  return {
    "@type": "SportsEvent",
    name: `${input.home.name} vs ${input.away.name}`,
    startDate: input.kickoff,
    eventStatus: EVENT_STATUS[input.status],
    sport: SPORT,
    homeTeam: teamRef(input.home),
    awayTeam: teamRef(input.away),
    organizer: competitionNode(input.competition),
  };
}

/**
 * 다가오는 경기 — 종료가 아니고 · 킥오프 확정(`tbc` 아님)이고 · 킥오프가 `nowMs` 뒤인 경기를 킥오프 순(같으면 id 순)으로 `limit`개.
 * 지난 경기(스코어 · 결과 대기)는 넣지 않는다(결과 노출 0).
 */
export function upcomingMatches(
  matches: readonly Match[],
  nowMs: number,
  limit: number,
): Array<Match & { status: "scheduled" | "postponed" }> {
  return matches
    .filter(
      (m): m is Match & { status: "scheduled" | "postponed" } =>
        m.status !== "finished" &&
        m.tbc !== true &&
        Date.parse(m.kickoff) > nowMs,
    )
    .sort(
      (a, b) =>
        Date.parse(a.kickoff) - Date.parse(b.kickoff) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .slice(0, Math.max(0, limit));
}

/** 경기 목록 → EventInput(팀 이름은 화면과 같은 lookup) */
export function eventInputs(
  matches: ReadonlyArray<Match & { status: "scheduled" | "postponed" }>,
  lookup: (slug: string) => Pick<TeamView, "slug" | "name" | "page">,
  competitionOf: (comp: CompId) => { id: CompId; name: string },
): EventInput[] {
  return matches.map((m) => ({
    kickoff: m.kickoff,
    status: m.status,
    home: lookup(m.home),
    away: lookup(m.away),
    competition: competitionOf(m.comp),
  }));
}

/** 경기 묶음 페이지(대회 · `/tonight/`) — 다가오는 경기가 없으면 null(스크립트를 두지 않는다) */
export function eventsJsonLd(
  events: readonly EventInput[],
  where = "SportsEvent JSON-LD",
): JsonLdNode | null {
  if (events.length === 0) return null;
  return assertNoScoreInJsonLd(
    {
      "@context": SCHEMA_CONTEXT,
      "@graph": events.map(sportsEventNode),
    },
    where,
  );
}

/** 팀 페이지 — SportsTeam + 다가오는 경기 */
export function teamJsonLd(
  team: SportsTeamInput,
  events: readonly EventInput[],
): JsonLdNode {
  return assertNoScoreInJsonLd(
    {
      "@context": SCHEMA_CONTEXT,
      "@graph": [sportsTeamNode(team), ...events.map(sportsEventNode)],
    },
    `/teams/${team.slug}/ JSON-LD`,
  );
}

// ─── 한국 선수 ────────────────────────────────────────────────────────────

export interface PersonInput {
  slug: string;
  nameKo: string;
  nameEn: string;
  team: Pick<TeamView, "slug" | "name" | "page">;
}

/** 한국 선수 상세 — Person(이름 · 영문 이름 · 소속 팀만, 출전 · 결과 수치 없음) */
export function personJsonLd(input: PersonInput): JsonLdNode {
  return assertNoScoreInJsonLd(
    {
      "@context": SCHEMA_CONTEXT,
      "@type": "Person",
      name: input.nameKo,
      alternateName: input.nameEn,
      url: absoluteUrl(routes.koreanPlayer(input.slug)),
      memberOf: teamRef(input.team),
    },
    `/korean-players/${input.slug}/ JSON-LD`,
  );
}
