/**
 * 사이트 RSS 피드 — 뉴스 호 목록 → RSS 2.0 XML 문자열 (PRD FR-122, §4 IA `/rss.xml`·`/rss/[comp].xml`·`/rss/korean.xml`, plan M4-11)
 *
 * 순수 함수만 둔다(파일 읽기·쓰기·현재 시각 없음). 호 목록은 진입점(scripts/build-feeds.ts)이 삭제 요청을 뺀 로더
 * (src/lib/data/news.ts `loadNewsIssue`)로 읽어 넘긴다 — 이 모듈은 카드를 다시 거르지 않는다(FR-143, M1-25 가드).
 *
 * 규칙
 * - **항목 = 뉴스 카드 1장.** `<title>` = `card.t` 그대로(해외 = 피드 원제목, 국내 = 한국어 원문 제목 — 번역·요약·다듬기 없음, D23),
 *   `<link>` = 대표 출처 원문 URL(`src[0].u` — 사이트 카드의 제목 링크와 같다), `<pubDate>` = 대표 출처 시각(`src[0].at` — 카드 메타 줄
 *   시각과 같다). 요약 줄(`s`)·RSS 요약문은 싣지 않는다(M0-25 — 저장도 하지 않는다).
 * - `<guid isPermaLink="false">` = 카드 ID(정규화한 대표 URL의 결정적 해시, M1-16) — 날짜가 바뀌어도 같은 카드는 같은 guid(리더가
 *   두 번 받지 않는다). 사이트 카드 앵커(`/news/{date}/#c_…`, FR-34)는 `<description>`의 "유로 다이제스트에서 보기" 링크로 준다.
 * - `<description>`(HTML, 이스케이프해 넣음): 출처명 + '외 N곳'/'외 N건'(사이트 출처 스택과 같은 셈 — src/lib/news/feed-view.ts
 *   `sourceStack`) · 대회 이름 · 분류 이름 · 카드 링크. 데이터 값의 한국어 이름뿐이고 새 사실을 만들지 않는다(§1-7).
 *   `card.ai`가 true면(지금은 없음 — D23) 'AI 작성 제목'을 앞에 붙인다(D24 라벨 원칙).
 * - `<category>` = 대회 이름(설정 nameKo) · 분류 이름(CATEGORY_LABEL).
 * - **선별**: 최근 호부터(발행일 내림차순) 호 안에서는 파일 순서(= 선별 순서, 중요도 내림차순 — news-file.ts `sortCards`)로 피드 조건에
 *   맞는 카드를 모아 30건까지. 최신 호 기준 7일(발행일) 안의 호만 본다. 같은 카드 ID는 가장 최근 호 것만. → `/rss.xml`은 최신 호가
 *   30건 이상이면 그 호의 상위 30건(FR-122 "전체 상위 30건"), 모자라면 전날 호로 채운다. 대회·한국 선수 피드도 같은 규칙.
 * - **채널 날짜는 데이터에서**: `lastBuildDate`·`pubDate` = 7일 창 안 호들의 `generatedAt` 최댓값(호가 없으면 생략). 빌드 시각을 쓰지
 *   않아 같은 데이터면 같은 바이트가 나온다(재빌드·재배포가 리더에 '갱신'으로 보이지 않는다).
 * - **XML**: UTF-8, CDATA 없이 5개 문자(& < > " ')를 엔티티로 이스케이프하고 XML 1.0에서 쓸 수 없는 문자(제어 문자·짝 없는 서로게이트·
 *   U+FFFE/U+FFFF)는 지운다(원제목은 cleanTitle이 이미 제어 문자를 지웠다 — 마지막 방어선). 한글·이모지는 문자 그대로.
 * - RSS 2.0 + `atom:link rel="self"`(RSS Advisory Board 권장 — 피드 검증기 경고 방지). 날짜는 RFC 822(src/lib/time.ts `formatRfc822Utc`).
 */
import { rssFeedTitle } from "@/lib/feed-links";
import type { SitePaths } from "@/lib/paths";
import { artifacts, routes, type RssFeed } from "@/lib/paths";
import type { CompId } from "@/lib/schema/common";
import type { NewsCard } from "@/lib/schema/news";
import { CATEGORY_LABEL } from "@/lib/news/labels";
import { sourceStack } from "@/lib/news/feed-view";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { formatRfc822Utc, shiftDate } from "@/lib/time";

/** 피드 하나의 항목 상한 (FR-122 "상위 30건" — 대회·한국 선수 피드도 같은 상한) */
export const RSS_ITEM_LIMIT = 30;

/** 최신 호 기준으로 거슬러 보는 발행일 수(최신 호 포함) */
export const RSS_WINDOW_DAYS = 7;

/** 피드 입력 호 — 일별 뉴스 파일(NewsFile)에서 쓰는 필드만 */
export interface FeedIssue {
  /** KST 발행일 "YYYY-MM-DD" */
  date: string;
  /** 파일을 마지막으로 쓴 시각(UTC ISO) */
  generatedAt: string;
  cards: readonly NewsCard[];
}

/** 피드 항목 — 카드와 그 카드를 실은 호의 발행일(카드 앵커 링크용) */
export interface FeedEntry {
  card: NewsCard;
  date: string;
}

/** 대회 설정에서 쓰는 값(configs/competitions.json — 설정 파일 순서 = 피드 생성 순서) */
export interface FeedCompetition {
  id: CompId;
  nameKo: string;
}

export interface SelectOptions {
  limit?: number;
  windowDays?: number;
}

/** 피드 조건 — 전체 · 그 대회 카드(`comp`에 포함) · 한국 선수 관련 카드(`kr`, FR-21 코드 규칙) */
export function feedPredicate(feed: RssFeed): (card: NewsCard) => boolean {
  switch (feed.kind) {
    case "all":
      return () => true;
    case "competition":
      return (card) => card.comp.includes(feed.comp);
    case "korean":
      return (card) => card.kr;
    default: {
      const never: never = feed;
      throw new Error(`알 수 없는 피드 종류: ${JSON.stringify(never)}`);
    }
  }
}

/** 7일 창 안의 호(발행일 내림차순). 입력 순서와 무관하다 */
export function issuesInWindow(
  issues: readonly FeedIssue[],
  windowDays: number = RSS_WINDOW_DAYS,
): FeedIssue[] {
  const sorted = [...issues].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
  const latest = sorted[0];
  if (latest === undefined) return [];
  const from = shiftDate(latest.date, -(windowDays - 1));
  return sorted.filter((issue) => issue.date >= from);
}

/** 피드 항목 선별(머리 주석 '선별' 규칙) */
export function selectFeedEntries(
  issues: readonly FeedIssue[],
  predicate: (card: NewsCard) => boolean,
  options: SelectOptions = {},
): FeedEntry[] {
  const limit = options.limit ?? RSS_ITEM_LIMIT;
  const seen = new Set<string>();
  const out: FeedEntry[] = [];
  for (const issue of issuesInWindow(issues, options.windowDays)) {
    for (const card of issue.cards) {
      if (out.length >= limit) return out;
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      if (predicate(card)) out.push({ card, date: issue.date });
    }
  }
  return out;
}

/** 채널 날짜 — 창 안 호들의 generatedAt 최댓값(호가 없으면 null) */
export function channelDate(
  issues: readonly FeedIssue[],
  windowDays: number = RSS_WINDOW_DAYS,
): string | null {
  let max: string | null = null;
  for (const issue of issuesInWindow(issues, windowDays)) {
    if (max === null || Date.parse(issue.generatedAt) > Date.parse(max)) {
      max = issue.generatedAt;
    }
  }
  return max;
}

// ─── XML ────────────────────────────────────────────────────────────────────

/** XML 1.0에서 쓸 수 없는 문자(탭·LF·CR 밖의 C0 제어 문자, 짝 없는 서로게이트, U+FFFE·U+FFFF) */
const XML_INVALID_RE = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu;

/** 텍스트·속성 값 이스케이프 — 쓸 수 없는 문자를 지우고 & < > " '를 엔티티로 */
export function escapeXml(text: string): string {
  return text
    .replace(XML_INVALID_RE, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** HTML 조각 안의 텍스트 이스케이프(description HTML을 만든 뒤 전체를 escapeXml로 한 번 더 감싼다) */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function element(name: string, text: string, attrs = ""): string {
  return `<${name}${attrs}>${escapeXml(text)}</${name}>`;
}

// ─── 채널·항목 ──────────────────────────────────────────────────────────────

/** 채널 메타 */
export interface ChannelMeta {
  title: string;
  /** 채널이 가리키는 사이트 페이지(절대 URL) */
  link: string;
  description: string;
  /** 이 피드 자신의 절대 URL(atom:link self) */
  selfUrl: string;
}

const CHANNEL_NOTE =
  "해외 기사는 원제목 그대로, 국내 기사는 원문 제목 그대로 원문으로 연결합니다.";

/** 피드별 채널 메타 — 대회 이름은 설정(nameKo), 설정에 없는 대회면 ID */
export function channelMeta(
  feed: RssFeed,
  paths: SitePaths,
  competitionName: (id: CompId) => string | null,
): ChannelMeta {
  const selfUrl = paths.rssUrl(feed);
  switch (feed.kind) {
    case "all":
      return {
        title: rssFeedTitle(feed),
        link: paths.absoluteUrl(routes.home()),
        description: `${SITE_TAGLINE} 주요 뉴스 상위 ${RSS_ITEM_LIMIT}건. ${CHANNEL_NOTE}`,
        selfUrl,
      };
    case "competition": {
      const name = competitionName(feed.comp) ?? feed.comp;
      return {
        title: rssFeedTitle(feed, name),
        link: paths.absoluteUrl(routes.competition(feed.comp)),
        description: `${name} 관련 뉴스. ${CHANNEL_NOTE}`,
        selfUrl,
      };
    }
    case "korean":
      return {
        title: rssFeedTitle(feed),
        link: paths.absoluteUrl(routes.koreanPlayers()),
        description: `유럽 무대 한국 선수 관련 뉴스. ${CHANNEL_NOTE}`,
        selfUrl,
      };
    default: {
      const never: never = feed;
      throw new Error(`알 수 없는 피드 종류: ${JSON.stringify(never)}`);
    }
  }
}

/** 항목의 대회 이름(카드 대회 순서, 중복·설정에 없는 대회 제외) */
function competitionNames(
  card: NewsCard,
  competitionName: (id: CompId) => string | null,
): string[] {
  const names: string[] = [];
  for (const id of new Set(card.comp)) {
    const name = competitionName(id);
    if (name) names.push(name);
  }
  return names;
}

/** 항목 description HTML(이스케이프 전) — 머리 주석 규칙 */
export function itemDescriptionHtml(
  entry: FeedEntry,
  paths: SitePaths,
  competitionName: (id: CompId) => string | null,
): string {
  const { card } = entry;
  const stack = sourceStack(card);
  const more =
    stack.more > 0
      ? ` 외 ${stack.more}${stack.unit === "outlets" ? "곳" : "건"}`
      : "";
  const parts = [
    `${escapeHtml(stack.lead.name)}${more}`,
    ...competitionNames(card, competitionName).map(escapeHtml),
    escapeHtml(CATEGORY_LABEL[card.cat]),
  ];
  const share = paths.cardShareUrl(entry.date, card.id);
  return [
    card.ai ? "<p>AI 작성 제목</p>" : "",
    `<p>${parts.join(" · ")}</p>`,
    `<p><a href="${escapeHtml(share)}">${escapeHtml(SITE_NAME)}에서 보기</a></p>`,
  ].join("");
}

function renderItem(
  entry: FeedEntry,
  paths: SitePaths,
  competitionName: (id: CompId) => string | null,
): string {
  const { card } = entry;
  const lead = sourceStack(card).lead;
  const categories = [
    ...competitionNames(card, competitionName),
    CATEGORY_LABEL[card.cat],
  ];
  return [
    "  <item>",
    ...[
      element("title", card.t),
      element("link", lead.url),
      element("guid", card.id, ' isPermaLink="false"'),
      element("pubDate", formatRfc822Utc(lead.at)),
      ...categories.map((c) => element("category", c)),
      element(
        "description",
        itemDescriptionHtml(entry, paths, competitionName),
      ),
    ].map((line) => `    ${line}`),
    "  </item>",
  ].join("\n");
}

export interface RenderRssInput {
  channel: ChannelMeta;
  entries: readonly FeedEntry[];
  /** 채널 lastBuildDate·pubDate(UTC ISO). null이면 생략 */
  builtAt: string | null;
  paths: SitePaths;
  competitionName: (id: CompId) => string | null;
}

/** RSS 2.0 문서(끝 줄바꿈 포함). 항목이 없으면 채널만 있는 유효한 피드 */
export function renderRss(input: RenderRssInput): string {
  const { channel, entries, builtAt, paths, competitionName } = input;
  const head = [
    element("title", channel.title),
    element("link", channel.link),
    element("description", channel.description),
    element("language", "ko"),
    `<atom:link href="${escapeXml(channel.selfUrl)}" rel="self" type="application/rss+xml"/>`,
    ...(builtAt
      ? [
          element("pubDate", formatRfc822Utc(builtAt)),
          element("lastBuildDate", formatRfc822Utc(builtAt)),
        ]
      : []),
    element("docs", "https://www.rssboard.org/rss-specification"),
  ];
  const items = entries.map((entry) =>
    renderItem(entry, paths, competitionName),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    ...head.map((line) => `  ${line}`),
    ...items,
    "</channel>",
    "</rss>",
    "",
  ].join("\n");
}

// ─── 피드 묶음 ──────────────────────────────────────────────────────────────

/** 생성할 피드 하나 */
export interface SiteFeed {
  feed: RssFeed;
  /** 산출물 사이트 경로(basePath 없음, 예: `/rss.xml`) — 진입점이 out/ 안 파일 경로로 바꾼다 */
  path: string;
  xml: string;
  items: number;
}

export interface BuildSiteFeedsInput {
  issues: readonly FeedIssue[];
  /** 대회 설정(파일 순서) — 대회 피드는 설정에 있는 대회마다 하나(항목이 없어도 만든다 — 구독 링크가 404가 되지 않게) */
  competitions: readonly FeedCompetition[];
  paths: SitePaths;
}

/** 전체 · 대회별(설정 순서) · 한국 선수 피드 */
export function buildSiteFeeds(input: BuildSiteFeedsInput): SiteFeed[] {
  const names = new Map(input.competitions.map((c) => [c.id, c.nameKo]));
  const competitionName = (id: CompId): string | null => names.get(id) ?? null;
  const builtAt = channelDate(input.issues);
  const feeds: RssFeed[] = [
    { kind: "all" },
    ...input.competitions.map((c): RssFeed => ({
      kind: "competition",
      comp: c.id,
    })),
    { kind: "korean" },
  ];
  return feeds.map((feed) => {
    const entries = selectFeedEntries(input.issues, feedPredicate(feed));
    return {
      feed,
      path: artifacts.rss(feed),
      items: entries.length,
      xml: renderRss({
        channel: channelMeta(feed, input.paths, competitionName),
        entries,
        builtAt,
        paths: input.paths,
        competitionName,
      }),
    };
  });
}
