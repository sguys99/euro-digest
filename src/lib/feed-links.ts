/**
 * RSS 피드 이름 · `<head>` 자동 발견 링크 (PRD FR-122, plan M4-11 이월 · M4-12)
 *
 * 순수 함수만. 피드 채널 제목(scripts/lib/site-rss.ts `channelMeta`)과 `<link rel="alternate" type="application/rss+xml" title>`이
 * 같은 이름을 쓰도록 한 곳에 둔다(리더가 자동 발견 이름과 구독 뒤 채널 이름을 다르게 보이지 않게).
 *
 * 자동 발견 규칙
 * - 모든 페이지: 전체 소식 피드(`/rss.xml`) — 루트 레이아웃 `<head>`에 직접 둔다(src/app/layout.tsx). 페이지 메타의 `alternates`는 레이아웃
 *   값을 통째로 덮어써서(src/lib/seo.ts 머리 주석 — 얕은 합침) 레이아웃 메타로는 canonical을 가진 페이지에서 사라진다.
 * - 대회 페이지: 그 대회 피드, `/korean-players/` 아래 페이지(목록 · 상세 · 주간 리포트): 한국 선수 피드 — `pageMetadata({ feeds })`가
 *   `alternates.types["application/rss+xml"]`로 낸다.
 * - href는 절대 URL(`rssUrl` — SITE_URL + basePath). 리더는 상대 주소도 풀지만 공유된 HTML 조각·캐시에서도 같은 주소가 되게.
 */
import { rssUrl, type RssFeed } from "@/lib/paths";
import { SITE_NAME } from "@/lib/site";

/** RSS MIME — `<link type>` · `alternates.types` 키 */
export const RSS_MIME = "application/rss+xml";

/** 자동 발견 링크 하나 */
export interface FeedLink {
  title: string;
  /** 절대 URL */
  url: string;
}

/**
 * 피드 이름 — "유로 다이제스트" · "유로 다이제스트 — {대회 이름}" · "유로 다이제스트 — 한국 선수".
 * 대회 이름은 설정 `nameKo`(없으면 부르는 쪽이 ID를 넘긴다).
 */
export function rssFeedTitle(
  feed: RssFeed,
  competitionName: string | null = null,
): string {
  switch (feed.kind) {
    case "all":
      return SITE_NAME;
    case "competition":
      return `${SITE_NAME} — ${competitionName ?? feed.comp}`;
    case "korean":
      return `${SITE_NAME} — 한국 선수`;
    default: {
      const never: never = feed;
      throw new Error(`알 수 없는 피드 종류: ${JSON.stringify(never)}`);
    }
  }
}

/** 자동 발견 링크(이름 + 절대 URL) */
export function rssFeedLink(
  feed: RssFeed,
  competitionName: string | null = null,
): FeedLink {
  return { title: rssFeedTitle(feed, competitionName), url: rssUrl(feed) };
}
