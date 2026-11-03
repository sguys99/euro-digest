/**
 * 기본 SEO — 페이지별 title·description·canonical·OG·twitter 메타, sitemap 항목 (PRD FR-124·NFR-03, plan M1-38)
 *
 * 순수 함수만 둔다(파일 읽기는 페이지·`src/app/sitemap.ts`가 로더로). 화면 코드는 이 모듈로 메타를 만들고 손으로 조립하지 않는다.
 *
 * 규칙
 * - **Next 메타데이터는 얕게 합쳐진다** — 페이지가 `openGraph`·`alternates`를 주면 레이아웃 값을 통째로 덮는다. 그래서 레이아웃
 *   (`siteMetadata`)에는 canonical·og:url을 두지 않고(404 등 자기 메타가 없는 페이지가 홈 주소를 물려받지 않게), 페이지는
 *   `pageMetadata`로 OG·twitter를 **전부** 다시 만든다(siteName·locale·type이 빠지지 않게).
 * - canonical·og:url = 같은 절대 URL(`absoluteUrl` — SITE_URL + basePath + 끝 슬래시). 날짜 아카이브는 자기 자신, `/news/`는 최신 날짜
 *   페이지(별칭 — M1-34 결정), 그 밖의 페이지는 자기 자신.
 * - og:title·twitter:title = 문서 제목 그대로(템플릿 " · 유로 다이제스트" 포함 — 링크 미리보기에 사이트 이름이 빠지지 않게).
 * - **og:image**(M5-01 — PRD §15 D71 ②): 모든 페이지가 OG 이미지 하나(절대 URL · 1200×630 · `og:image:alt`)를 싣는다. 어느 쪽이 어떤
 *   이미지를 쓰는지는 src/lib/og.ts(기본 · 날짜 · 쪽 이름형 · 대회 · 팀 — 페이지가 `og` 카드를 넘긴다, 없으면 기본). twitter 카드는
 *   `summary_large_image`(twitter:image = og:image). 이미지 파일은 빌드 때 scripts/build-og.ts가 같은 카드로 굽는다.
 * - **결과 노출 0**(DECISIONS D0 §5 #9 — 링크 미리보기는 결과 가리기로 막을 수 없다): title·description·OG에 경기 결과(스코어)를
 *   넣지 않는다. 날짜 페이지 설명은 호수·날짜·카드 수 같은 사실만 쓰고, 뉴스 원제목도 넣지 않는다(원제목 인용 — D23).
 *   `pageMetadata`가 스코어 모양("2-1"·"2:1"·"2대1")을 만나면 던진다(빌드 실패 — 개발 중 실수를 막는 마지막 방어선). `og:image:alt`도
 *   같은 검사를 거친다(이미지 안 글자는 tests/og.test.ts가 같은 함수로 본다).
 * - robots.txt는 만들지 않는다 — 프로젝트 사이트(basePath 아래)의 robots.txt는 크롤러가 읽지 않는다(호스트 루트만 유효).
 *   Search Console sitemap 제출·색인 정책은 M5(정식 공개)에서 정한다(2026-10-18 사용자 결정). 404는 Next가 noindex를 넣는다.
 */
import type { Metadata, MetadataRoute } from "next";

import { RSS_MIME, type FeedLink } from "@/lib/feed-links";
import { archiveDateLabel } from "@/lib/news/archive";
import { issueNumber } from "@/lib/issue";
import {
  DEFAULT_OG_CARD,
  OG_HEIGHT,
  OG_WIDTH,
  ogAlt,
  ogImageOf,
  type OgCard,
} from "@/lib/og";
import { absoluteUrl, artifacts, routes } from "@/lib/paths";
import type { CompId } from "@/lib/schema/common";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/** 문서 제목 템플릿 — 페이지 제목 뒤에 사이트 이름(홈은 사이트 이름 단독) */
export const TITLE_TEMPLATE = `%s · ${SITE_NAME}`;

/** 사이트 기본 설명(홈·레이아웃 기본값) — 화면에 있는 사실만(오늘의 5줄 + 원문 링크 카드, `/about` 소개와 같은 내용) */
export const SITE_DESCRIPTION = `${SITE_TAGLINE} 전날 경기를 정리한 한국어 브리핑 ‘오늘의 5줄’과 유럽 축구 소식을 원문 링크와 함께 한 호로 묶습니다.`;

/**
 * `/tonight/` 설명(M2-14) — 화면의 사실만(선정 범위·기준). 시각("18:00")은 스코어 모양 검사에 걸려 넣지 않는다(머리 주석 — 남은 오탐).
 */
export const TONIGHT_DESCRIPTION =
  "오늘 저녁부터 다음 날 아침까지(KST) 유럽 6개 대회 경기 가운데 한국 선수 소속팀·UCL·순위 경쟁·더비 기준으로 고른 볼 만한 경기와 선정 이유.";

/** `/national-team/` 설명(M3-13) — 화면에 실린 것만(상대 · 스코어 없음 — 결과 노출 0) */
export const NATIONAL_TEAM_DESCRIPTION =
  "한국 축구 대표팀의 A매치 일정과 결과(한국 시간), 소집된 등록 한국 선수, 대표팀 소식과 주요국 A매치 뉴스를 원문 링크와 함께 한 화면에 모았습니다.";

/** `/transfers/` 설명(M4-04) — 화면에 실린 것만(단계 · Tier · 원문 링크 타임라인) */
export const TRANSFERS_DESCRIPTION =
  "유럽 축구 이적설을 선수·행선지별로 모아 루머·협상·합의·공식·결렬 단계와 출처 Tier, 관련 기사 타임라인(원문 링크)으로 보여 줍니다.";

/** `/my/` 설명(M4-08) — 팔로우는 브라우저에만 있어 화면 내용이 사람마다 다르다(색인 대상 아님 — sitemap에 넣지 않는다) */
export const MY_DESCRIPTION =
  "팔로우한 팀과 한국 선수의 다음 경기(한국 시간), 최근 결과, 오늘 호의 관련 소식을 한 화면에 모읍니다. 팔로우는 이 기기에만 저장돼요.";

/** og:locale */
export const OG_LOCALE = "ko_KR";

/**
 * 스코어 모양 — 숫자 사이의 하이픈·대시·쌍점·"대"("2-1"·"2–1"·"2:1"·"2 대 1"). 메타 문구에 이 모양이 있으면 결과 노출이다.
 * URL(og:url의 날짜 "2026-10-14")에는 쓰지 않는다 — 제목·설명 문구만 검사한다.
 * 시즌 표기("2026-27" — 시작 연도 네 자리 + 다음 해 두 자리, M2-10 대회 페이지 제목)는 `SEASON_LIKE_RE`로 먼저 지운 뒤 검사한다
 * (연도가 이어지지 않는 "2026-28"·스코어 "3-1"은 그대로 걸린다). 남은 알려진 오탐(리뷰 2026-10-23): 시각 "06:50"·범위 "3–5줄"·
 * "5대 1부 리그" — 메타 문구에 넣을 일이 생기면 같은 방식으로 예외를 더한다.
 */
export const SCORE_LIKE_RE = /\d\s*(?:[-–—:]|대)\s*\d/;

/** 시즌 표기 — "2026-27"·"2026–27"(앞뒤에 숫자가 붙지 않음). 이어지는 해인지는 `hasScoreLike`가 본다 */
export const SEASON_LIKE_RE = /(?<!\d)(\d{4})[-–](\d{2})(?!\d)/g;

/** 메타 문구에 스코어 모양이 있는가 — 이어지는 해의 시즌 표기("2026-27")는 빼고 본다 */
export function hasScoreLike(text: string): boolean {
  const withoutSeasons = text.replace(
    SEASON_LIKE_RE,
    (whole, start: string, end: string) =>
      (Number(start) + 1) % 100 === Number(end) ? " " : whole,
  );
  return SCORE_LIKE_RE.test(withoutSeasons);
}

/** 페이지 제목 → 문서 제목. `null`이면 사이트 이름 단독(홈). 예) "뉴스" → "뉴스 · 유로 다이제스트" */
export function documentTitle(title: string | null): string {
  return title === null ? SITE_NAME : TITLE_TEMPLATE.replace("%s", title);
}

/** 결과 노출 0 — 메타 문구에 스코어 모양이 있으면 던진다(빌드 실패) */
function assertNoScore(field: string, text: string): void {
  if (hasScoreLike(text)) {
    throw new RangeError(
      `메타 ${field}에 스코어 모양이 있음(결과 노출 0 — DECISIONS D0 §5 #9): ${JSON.stringify(text)}`,
    );
  }
}

/** OG 이미지 메타 값 — 절대 URL(SITE_URL + basePath) · 1200×630 · alt(src/lib/og.ts 문형). alt에 스코어 모양이 있으면 던진다 */
export function ogImageMeta(card: OgCard = DEFAULT_OG_CARD): {
  url: string;
  width: number;
  height: number;
  alt: string;
  type: "image/png";
} {
  const alt = ogAlt(card);
  assertNoScore("og:image:alt", alt);
  return {
    url: absoluteUrl(artifacts.ogImage(ogImageOf(card))),
    width: OG_WIDTH,
    height: OG_HEIGHT,
    alt,
    type: "image/png",
  };
}

/** OG 공통값 + 이 페이지 값. url이 없으면(404·canonical 없는 페이지) og:url을 넣지 않는다 */
function openGraphFor(
  title: string,
  description: string,
  url: string | null,
  card: OgCard,
): NonNullable<Metadata["openGraph"]> {
  return {
    type: "website",
    siteName: SITE_NAME,
    locale: OG_LOCALE,
    title,
    description,
    ...(url === null ? {} : { url }),
    images: [ogImageMeta(card)],
  };
}

/** twitter 카드 — 큰 이미지(D71 ②). 이미지·alt는 og:image와 같다 */
function twitterFor(
  title: string,
  description: string,
  card: OgCard,
): NonNullable<Metadata["twitter"]> {
  const { url, alt } = ogImageMeta(card);
  return {
    card: "summary_large_image",
    title,
    description,
    images: [{ url, alt }],
  };
}

/**
 * 루트 레이아웃 메타 — metadataBase(SITE_URL + basePath), 제목 템플릿, 기본 설명, OG·twitter 기본값(canonical·og:url 없음 — 머리 주석).
 * 자기 메타가 없는 페이지(404·견본)는 이 값을 물려받는다.
 */
export function siteMetadata(): Metadata {
  return {
    metadataBase: new URL(absoluteUrl(routes.home())),
    title: { default: SITE_NAME, template: TITLE_TEMPLATE },
    description: SITE_DESCRIPTION,
    openGraph: openGraphFor(SITE_NAME, SITE_DESCRIPTION, null, DEFAULT_OG_CARD),
    twitter: twitterFor(SITE_NAME, SITE_DESCRIPTION, DEFAULT_OG_CARD),
  };
}

export interface PageSeo {
  /** 페이지 제목(템플릿 앞부분). `null` = 사이트 이름 단독(홈) */
  title: string | null;
  /** 메타 description = og:description = twitter:description */
  description: string;
  /** canonical 라우트(basePath 없음 — `routes.*`). `null`이면 canonical·og:url을 두지 않는다(발행된 호가 없는 `/news/`) */
  canonical: string | null;
  /**
   * 이 페이지의 RSS 자동 발견 링크(M4-12 — 대회 피드 · 한국 선수 피드, src/lib/feed-links.ts). `alternates.types`로 낸다. 전체 소식 피드는
   * 루트 레이아웃 `<head>`가 모든 페이지에 직접 둔다(얕은 합침 때문에 여기 넣지 않는다 — 머리 주석)
   */
  feeds?: readonly FeedLink[];
  /** 이 페이지의 OG 이미지 카드(src/lib/og.ts — 날짜 · 쪽 이름형 · 대회 · 팀). 없으면 기본 OG */
  og?: OgCard;
}

/**
 * 페이지 메타 — title·description·canonical·OG(type website · siteName · locale ko_KR · url · title · description · image)·twitter
 * (summary_large_image)
 * · (있으면) RSS 자동 발견 `alternates.types`. 제목·설명에 스코어 모양이 있으면 던진다(결과 노출 0 — 머리 주석).
 */
export function pageMetadata({
  title,
  description,
  canonical,
  feeds = [],
  og = DEFAULT_OG_CARD,
}: PageSeo): Metadata {
  const full = documentTitle(title);
  assertNoScore("title", full);
  assertNoScore("description", description);
  const url = canonical === null ? null : absoluteUrl(canonical);
  const alternates: NonNullable<Metadata["alternates"]> = {
    ...(url === null ? {} : { canonical: url }),
    ...(feeds.length === 0
      ? {}
      : {
          types: {
            [RSS_MIME]: feeds.map((f) => ({ url: f.url, title: f.title })),
          },
        }),
  };
  return {
    // 홈은 레이아웃과 같은 세그먼트라 템플릿이 붙지 않지만, 의도를 드러내려고 absolute로 둔다
    title: title === null ? { absolute: SITE_NAME } : title,
    description,
    ...(Object.keys(alternates).length === 0 ? {} : { alternates }),
    openGraph: openGraphFor(full, description, url, og),
    twitter: twitterFor(full, description, og),
  };
}

/** "제 3호 · 2026년 10월 14일 (수)" — 호수가 없으면(창간일 전) 날짜만 */
function issueLabel(date: string): string {
  const no = issueNumber(date);
  return `${no === null ? "" : `제 ${no}호 · `}${archiveDateLabel(date)}`;
}

export interface IssueFacts {
  /** KST 발행일 "YYYY-MM-DD" */
  date: string;
  /** 그 호의 카드 수(삭제 요청 제외 뒤) */
  cards: number;
  /** 그 호 브리핑의 줄 수 — 파일이 없거나 경기 없는 날(mode empty)이면 0 */
  briefLines: number;
}

/** 실린 것 — 브리핑 줄이 있으면 "이날의 5줄", 카드가 있으면 "소식 N건". 문장 하나 */
function issueContents(
  { cards, briefLines }: Omit<IssueFacts, "date">,
  briefName: string,
): string {
  const brief =
    briefLines > 0 ? `전날 경기를 정리한 한국어 브리핑 ‘${briefName}’` : null;
  const news = cards > 0 ? `유럽 축구 소식 ${cards}건` : null;
  if (brief && news) return `${brief}과 ${news}을 원문 링크와 함께 싣습니다.`;
  if (brief) return `${brief}을 싣습니다.`;
  if (news) return `${news}을 원문 링크와 함께 싣습니다.`;
  return "실린 소식이 없습니다.";
}

/**
 * 날짜 아카이브 설명 — 호수·날짜·실린 것(브리핑 유무·카드 수)만. 뉴스 원제목·브리핑 문장·스코어는 넣지 않는다.
 * 예) "제 3호 · 2026년 10월 14일 (수) 지면 — 전날 경기를 정리한 한국어 브리핑 ‘이날의 5줄’과 유럽 축구 소식 24건을 원문 링크와 함께 싣습니다."
 */
export function archiveDescription(facts: IssueFacts): string {
  return `${issueLabel(facts.date)} 지면 — ${issueContents(facts, "이날의 5줄")}`;
}

/**
 * `/news/` 설명 — 최신 호의 별칭(canonical = 최신 날짜 페이지). 호가 없으면 사이트 기본 설명.
 * 예) "최신 호(제 12호 · 2026년 10월 23일 (금))의 유럽 축구 소식 24건을 원문 링크와 함께 싣습니다. 지난 호는 날짜별 아카이브에 있습니다."
 */
export function newsDescription(
  latest: Pick<IssueFacts, "date" | "cards"> | null,
): string {
  if (latest === null) return SITE_DESCRIPTION;
  const head = `최신 호(${issueLabel(latest.date)})`;
  const body =
    latest.cards > 0
      ? `${head}의 유럽 축구 소식 ${latest.cards}건을 원문 링크와 함께 싣습니다.`
      : `${head}에는 실린 소식이 없습니다.`;
  return `${body} 지난 호는 날짜별 아카이브에 있습니다.`;
}

/**
 * 대회 페이지 설명(M2-10) — 대회명·시즌("2026-27 시즌" — `seasonLabel`)과 페이지에 실린 것(순위표·라운드 일정과 결과·득점 순위·소식)·데이터 출처만. 스코어·팀 순위는 넣지 않는다
 * (결과 노출 0 — 링크 미리보기는 결과 가리기로 막을 수 없다).
 * 예) "프리미어리그 2026-27 시즌 순위표(순위 변동·최근 5경기), 라운드별 일정과 결과(한국 시간), 득점 순위, 관련 소식을 한 화면에 모았습니다. 순위·경기 데이터 football-data.org."
 */
export function competitionDescription(name: string, season: string): string {
  return `${name} ${season} 순위표(순위 변동·최근 5경기), 라운드별 일정과 결과(한국 시간), 득점 순위, 관련 소식을 한 화면에 모았습니다. 순위·경기 데이터 football-data.org.`;
}

/**
 * 한국 선수 목록 설명(M3-09) — 실린 것·집계 방식·데이터 출처만(출전·결과 수치는 넣지 않는다 — 팀·대회 설명과 같은 이유).
 * 예) "유럽 리그에서 뛰는 한국 선수를 리그별로 모았습니다 — 최근 경기 출전과 결과, 10월 19일 이후 집계한 시즌 누적, UCL 출전, 다음 경기(한국 시간). 데이터 API-Football · football-data.org."
 */
export function koreanPlayersDescription(sinceLabel: string | null): string {
  const season = sinceLabel ? `${sinceLabel}한 시즌 누적` : "시즌 누적";
  return `유럽 리그에서 뛰는 한국 선수를 리그별로 모았습니다 — 최근 경기 출전과 결과, ${season}, UCL 출전, 다음 경기(한국 시간). 데이터 API-Football · football-data.org.`;
}

/**
 * 한국 선수 상세 설명(M3-10) — 선수 · 소속 · 리그와 페이지에 실린 것 · 데이터 출처만(출전 · 결과 수치는 넣지 않는다 — 목록 · 팀 설명과 같은 이유).
 * 예) "김민재(바이에른 뮌헨 · 분데스리가)의 대회별 시즌 기록(10월 19일 이후 집계), 최근 5경기 출전과 결과, 다음 경기(한국 시간), 관련 뉴스를 한 화면에 모았습니다. 데이터 API-Football · football-data.org."
 */
export function koreanPlayerDescription(
  name: string,
  team: string,
  league: string | null,
  sinceLabel: string | null,
): string {
  const where = league ? `${team} · ${league}` : team;
  const season = sinceLabel
    ? `대회별 시즌 기록(${sinceLabel})`
    : "대회별 시즌 기록";
  return `${name}(${where})의 ${season}, 최근 5경기 출전과 결과, 다음 경기(한국 시간), 관련 뉴스를 한 화면에 모았습니다. 데이터 API-Football · football-data.org.`;
}

/**
 * 한국 선수 주간 리포트 한 주 설명(M3-12) — 주차 · 기간(경기일 기준)과 실린 것 · 데이터 출처만(MVP 이름 · 출전 · 결과 수치는 넣지 않는다 —
 * 다른 한국 선수 화면 설명과 같은 이유).
 * 예) "2026년 43주(10.19 (월) ~ 10.25 (일) 경기일 기준) 유럽 리그 한국 선수의 출전 · 분 · 골 · 도움과 이번 주 MVP(골×3 + 도움×2 + 출전), 총평을 한 장에 모았습니다. 데이터 API-Football."
 */
export function weeklyReportDescription(week: string, range: string): string {
  return `${week}(${range} 경기일 기준) 유럽 리그 한국 선수의 출전·분·골·도움과 이번 주 MVP(골×3 + 도움×2 + 출전), 총평을 한 장에 모았습니다. 데이터 API-Football.`;
}

/** 주간 리포트 색인 설명(M3-12) — 발행 주기 · 실린 것만 */
export const WEEKLY_INDEX_DESCRIPTION =
  "매주 월요일 아침, 지난 월~일 경기일 기준으로 유럽 리그 한국 선수의 출전·분·골·도움과 이번 주 MVP, 총평을 정리한 주간 리포트 모음입니다. 데이터 API-Football.";

/**
 * 팀 페이지 설명(M2-13) — 팀명·리그·시즌과 페이지에 실린 것·데이터 출처만. 순위·스코어는 넣지 않는다(결과 노출 0 — 대회 페이지와 같은 이유).
 * 예) "바이에른 뮌헨(분데스리가) 2026-27 시즌 순위와 최근 경기, 일정과 결과(한국 시간), 주 포메이션과 팀시트, 득점 상위 선수, 관련 소식을 한 화면에 모았습니다. 데이터 football-data.org · API-Football."
 */
export function teamDescription(
  name: string,
  league: string | null,
  season: string,
): string {
  return `${name}${league ? `(${league})` : ""} ${season} 순위와 최근 경기, 일정과 결과(한국 시간), 주 포메이션과 팀시트, 득점 상위 선수, 관련 소식을 한 화면에 모았습니다. 데이터 football-data.org · API-Football.`;
}

/** sitemap 팀 페이지(M2-13) — 팀 slug와 lastModified(그 팀 대표 대회 데이터 updatedAt — 없으면 생략) */
export interface SitemapTeam {
  slug: string;
  updatedAt: string | null;
}

/**
 * sitemap 한국 선수 목록(M3-09) · 상세(M3-10) — 현황 파일(`data/players/korean.json`) generatedAt(없으면 null) · 상세 페이지 slug
 * (설정 순서 — 설정의 선수 전원, 없으면 상세 없음)
 */
export interface SitemapKoreanPlayers {
  updatedAt: string | null;
  players?: readonly string[];
  /** 주간 리포트(M3-12) — 발행된 주차와 그 파일 generatedAt. 주면 색인(`/korean-players/weekly/`)도 싣는다(lastModified = 최신 주) */
  weekly?: ReadonlyArray<{ week: string; generatedAt: string }>;
}

/** sitemap 대회 페이지 — 대회 ID와 그 데이터 파일의 updatedAt(API에서 마지막으로 받은 시각, UTC ISO) */
export interface SitemapCompetition {
  comp: CompId;
  updatedAt: string;
}

/** sitemap 한 호 — 발행일과 그 뉴스 파일의 generatedAt(파일을 마지막으로 쓴 시각, UTC ISO) */
export interface SitemapIssue {
  date: string;
  generatedAt: string;
}

/** 주간 리포트 항목(M3-12) — 색인(늘, lastModified = 최신 주 파일 generatedAt) + 발행된 주(오름차순). weekly가 없으면 없다 */
function weeklyEntries(
  weekly: SitemapKoreanPlayers["weekly"],
): MetadataRoute.Sitemap {
  if (!weekly) return [];
  const sorted = [...weekly].sort((a, b) => a.week.localeCompare(b.week));
  const latest = sorted.at(-1);
  return [
    {
      url: absoluteUrl(routes.weeklyReport()),
      ...(latest ? { lastModified: latest.generatedAt } : {}),
    },
    ...sorted.map((w) => ({
      url: absoluteUrl(routes.weeklyReportArchive(w.week)),
      lastModified: w.generatedAt,
    })),
  ];
}

/**
 * sitemap.xml 항목 — 색인할 페이지의 canonical 절대 URL만(PRD FR-124).
 * - 홈(`lastModified` = 최신 호 generatedAt — 홈은 최신 호를 싣는다), `/about/`(lastModified 없음 — 설정이 바뀔 때만 바뀐다),
 *   `/tonight/`(M2-14 — 발행 빌드마다 다시 고르므로 홈과 같은 lastModified),
 *   대회 페이지(M2-10 — 데이터 파일이 있는 대회, 설정 순서, `lastModified` = 그 파일 updatedAt), 팀 페이지(M2-13 — 팀 파일이 있는 팀,
 *   slug 순, `lastModified` = 대표 대회 데이터 updatedAt), 한국 선수 목록(M3-09)·상세(M3-10 — 설정 순서, `lastModified` = 현황 파일 generatedAt),
 *   주간 리포트 색인·발행된 주(M3-12 — 주 오름차순), 대표팀(M3-13 — `lastModified` = 최신 호), 발행된 날짜 아카이브 전부
 *   (`lastModified` = 그 호 generatedAt, 날짜 오름차순).
 * - `/news/`는 넣지 않는다 — 최신 날짜 페이지의 별칭(canonical이 그 날짜 페이지). 404·견본도 없다.
 * - 새 라우트(M2 대회·팀 등)를 만들면 여기에 넣는다 — e2e `tests/e2e/seo.spec.ts`가 out/의 색인 대상 페이지가 모두 sitemap에 있는지
 *   (또는 canonical이 sitemap 안을 가리키는지) 확인한다.
 */
export function sitemapEntries(
  issues: readonly SitemapIssue[],
  competitions: readonly SitemapCompetition[] = [],
  teams: readonly SitemapTeam[] = [],
  koreanPlayers: SitemapKoreanPlayers | null = null,
  /** 대표팀 화면(M3-13) — 늘 생기는 페이지라 있으면 싣는다(lastModified = 최신 호 — 대표팀 소식이 호마다 바뀐다) */
  nationalTeam: boolean = false,
  /** 이적 화면(M4-04) — 늘 생기는 페이지(빈 상태 포함). lastModified = 트래커의 가장 늦은 갱신(없으면 없음) */
  transfers: { updatedAt: string | null } | null = null,
): MetadataRoute.Sitemap {
  const sorted = [...issues].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  return [
    {
      url: absoluteUrl(routes.home()),
      ...(latest ? { lastModified: latest.generatedAt } : {}),
    },
    { url: absoluteUrl(routes.about()) },
    // 오늘 밤 볼 경기(M2-14) — 빌드마다 다시 고른다(lastmod = 홈과 같은 최신 호)
    {
      url: absoluteUrl(routes.tonight()),
      ...(latest ? { lastModified: latest.generatedAt } : {}),
    },
    ...competitions.map((c) => ({
      url: absoluteUrl(routes.competition(c.comp)),
      lastModified: c.updatedAt,
    })),
    ...teams.map((t) => ({
      url: absoluteUrl(routes.team(t.slug)),
      ...(t.updatedAt ? { lastModified: t.updatedAt } : {}),
    })),
    // 한국 선수 목록(M3-09) · 상세(M3-10 — 설정 순서) — 명단 설정이 있으면 늘 생긴다(lastModified = 현황 파일 generatedAt, 파일 전이면 없음)
    ...(koreanPlayers
      ? [
          routes.koreanPlayers(),
          ...(koreanPlayers.players ?? []).map(routes.koreanPlayer),
        ].map((url) => ({
          url: absoluteUrl(url),
          ...(koreanPlayers.updatedAt
            ? { lastModified: koreanPlayers.updatedAt }
            : {}),
        }))
      : []),
    // 주간 리포트(M3-12) — 색인 + 발행된 주(오름차순). 색인 lastModified = 최신 주 파일 generatedAt
    ...weeklyEntries(koreanPlayers?.weekly),
    // 대표팀(M3-13) — 일정 · 소집 명단 · 대표팀 소식(최근 30일) · 주요국 A매치 뉴스(최신 호)
    ...(nationalTeam
      ? [
          {
            url: absoluteUrl(routes.nationalTeam()),
            ...(latest ? { lastModified: latest.generatedAt } : {}),
          },
        ]
      : []),
    // 이적(M4-04) — 원장 · 타임라인(트래커 집계)
    ...(transfers
      ? [
          {
            url: absoluteUrl(routes.transfers()),
            ...(transfers.updatedAt
              ? { lastModified: transfers.updatedAt }
              : {}),
          },
        ]
      : []),
    ...sorted.map((issue) => ({
      url: absoluteUrl(routes.newsArchive(issue.date)),
      lastModified: issue.generatedAt,
    })),
  ];
}
