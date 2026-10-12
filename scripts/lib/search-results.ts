/**
 * 검색형 소스 공통 — 매체 도메인 허용 목록 필터 (M1-06, PRD FR-02, §15 D25).
 *
 * 검색 결과(GDELT 등)에는 여러 매체의 기사가 섞이고, 기사마다 그 매체의 약관을 따른다(매체 약관 상속).
 * `configs/publisher-domains.json`에서 status "allow"인 매체 도메인의 결과만 남긴다(`isSearchResultAllowed`, src/lib/schema/publisher.ts).
 * 나머지는 버리고 사유별로 센다:
 *   - "feed-only"   허가가 자기 피드에 묶인 매체(BBC·ESPN·The Athletic·the Daily Briefing·Di Marzio·Relevo) — 그 매체 기사는 피드 소스로만 게시
 *   - "deny"        약관상 금지 매체
 *   - "not-listed"  목록에 없는 도메인 = 기본 차단. 빈도를 `notListedHosts`로 모아 `/add-source` 후보로 올린다(올리는 일은 M1-07)
 *   - "invalid-url" 카드 링크 스키마(`HttpUrlSchema`)를 통과하지 못하는 URL — http/https가 아니거나, 호스트 끝 점처럼
 *                   카드가 될 수 없는 형식(카드 링크는 원문 그대로라 여기서 고쳐 쓰지 않는다)
 * 판정은 결과 **URL의 호스트**로 한다. 검색 서비스가 준 domain 필드는 로그용이다(M0-27: GDELT domain은 `www.`를 뗀 값).
 * 매칭 규칙(하위 도메인 포함·가장 긴 항목 우선·대소문자·포트)은 publisher.ts `findPublisherDomain`을 따른다.
 *
 * **검색 결과의 제목·시각은 카드에 쓰지 않는다**(M0-27 핵심 결론 5): GDELT `title`에는 구두점 앞 공백·따옴표 자리 공백 같은
 * 정규화 흔적이 있어 원제목이 아닐 수 있고, `seendate`는 GDELT가 처음 본 시각(15분 배치)이지 게시 시각이 아니다.
 * "제목 무수정"(FR-20·D23)을 지키려면 같은 URL의 RSS 제목 또는 og:title, 게시 시각은 RSS pubDate 또는
 * `article:published_time`으로 바꿔야 한다 — 교체 구현은 M1-07·M1-08(보류, D32).
 * 그래서 필드 이름을 `titleFromSearch`·`timeFromSearch`로 두고, 통과 결과(`AllowedSearchResult`)에 `title`·
 * `publishedAt`을 두지 않아 카드 입력(공통 형식 `FeedItem`, @/lib/schema — M1-09)으로 그대로 넘길 수 없게 했다
 * (tests/search-results.test.ts가 타입과 `FeedItemSchema`로 확인).
 *
 * 순수 함수만 둔다(설정 로더 `loadPublisherDomains` 제외). 본문·요약문 필드는 받지 않는다(FR-02 본문 수집 금지).
 */
import {
  HttpUrlSchema,
  PublisherDomainsFileSchema,
  findPublisherDomain,
  isSearchResultAllowed,
  normalizeHost,
  type PublisherDomain,
  type PublisherDomainStatus,
} from "@/lib/schema";

import { readConfigFile } from "./config-files";

/** `<rootDir>/configs/publisher-domains.json` → 도메인 목록(스키마 오류면 ConfigFileError) */
export async function loadPublisherDomains(
  rootDir: string,
): Promise<PublisherDomain[]> {
  const file = await readConfigFile(
    rootDir,
    "publisher-domains.json",
    PublisherDomainsFileSchema,
  );
  return file.domains;
}

// ─── 타입 ────────────────────────────────────────────────────────────────

/** 검색형 소스가 돌려준 기사 1건 — 어댑터 출력이자 허용 목록 필터 입력. 본문·요약문 필드는 없다. */
export interface SearchResultItem {
  /** 검색형 소스 id(sources.json, 예: "gdelt-doc") */
  sourceId: string;
  /** 결과를 낸 쿼리 id(search-queries.json) */
  queryId: string;
  /** 기사 원문 URL — 허용 목록 판정·카드 ID의 기준 */
  url: string;
  /**
   * 검색 서비스가 준 제목 — **표시용이 아니다.** GDELT는 제목을 손본 흔적이 있다(M0-27).
   * 카드 제목은 같은 URL의 RSS 제목 또는 og:title로 바꾼다(M1-07·M1-08). 로그·중복 후보 비교에만 쓴다.
   */
  titleFromSearch: string;
  /**
   * 검색 서비스가 준 시각(UTC ISO), 없으면 null — **게시 시각이 아닐 수 있다**(GDELT seendate = 처음 본 시각).
   * 카드 발행 시각은 RSS pubDate 또는 `article:published_time`으로 바꾼다(M1-07·M1-08).
   */
  timeFromSearch: string | null;
  /** 검색 서비스가 준 도메인 — 로그용. 판정은 `url` 호스트로 한다 */
  domain?: string;
}

/** 허용 목록에서 뺀 이유 — publisher-domains 판정(allow 제외) + 목록 없음 + URL 오류 */
export type SearchRejectReason =
  Exclude<PublisherDomainStatus, "allow"> | "not-listed" | "invalid-url";

/** 허용 목록을 통과한 결과 — 그대로 카드가 되지 않는다(제목·시각 교체 필요, 파일 머리 주석) */
export interface AllowedSearchResult extends SearchResultItem {
  /** 정규화한 URL 호스트(소문자, 포트 없음) */
  host: string;
  /** 매칭된 publisher-domains 항목의 domain */
  publisherDomain: string;
  /** 매체명(publisher-domains `publisher`) — 카드 출처 표기 후보 */
  publisher: string;
}

export interface RejectedSearchResult {
  item: SearchResultItem;
  reason: SearchRejectReason;
  /** 정규화한 URL 호스트(invalid-url이면 null) */
  host: string | null;
  /** 매칭된 publisher-domains 항목의 domain(not-listed·invalid-url이면 null) */
  publisherDomain: string | null;
}

export interface SearchFilterResult {
  /** 통과 결과(입력 순서) */
  allowed: AllowedSearchResult[];
  /** 뺀 결과(입력 순서) */
  rejected: RejectedSearchResult[];
  /** 판정별 건수 — 모든 키가 있다(0 포함) */
  counts: Record<"allow" | SearchRejectReason, number>;
  /** 목록에 없는 호스트 빈도(`www.` 제외, 건수 내림차순 → 호스트 이름순) — `/add-source` 후보 */
  notListedHosts: Array<{ host: string; count: number }>;
}

// ─── 필터 ────────────────────────────────────────────────────────────────

/** URL → 정규화한 호스트(소문자, 포트 없음). 카드 링크 스키마(HttpUrlSchema)를 통과하지 못하면 null */
export function searchResultHost(url: string): string | null {
  const trimmed = url.trim();
  if (!HttpUrlSchema.safeParse(trimmed).success) return null;
  const host = normalizeHost(new URL(trimmed).hostname);
  return host === "" ? null : host;
}

/**
 * 검색 결과 → 허용 목록 통과분·제외분·사유별 집계. 순수 함수.
 * 통과 판정은 `isSearchResultAllowed`(allow만 true)로 하고, 매체명·차단 사유는 `findPublisherDomain`의 항목으로 붙인다.
 * 중복 URL은 여기서 합치지 않는다(중복 제거는 M1-10).
 */
export function filterSearchResults(
  items: readonly SearchResultItem[],
  domains: readonly PublisherDomain[],
): SearchFilterResult {
  const result: SearchFilterResult = {
    allowed: [],
    rejected: [],
    counts: {
      allow: 0,
      "feed-only": 0,
      deny: 0,
      "not-listed": 0,
      "invalid-url": 0,
    },
    notListedHosts: [],
  };
  const notListed = new Map<string, number>();

  for (const item of items) {
    const host = searchResultHost(item.url);
    if (host === null) {
      result.rejected.push({
        item,
        reason: "invalid-url",
        host: null,
        publisherDomain: null,
      });
      result.counts["invalid-url"] += 1;
      continue;
    }
    const entry = findPublisherDomain(host, domains);
    if (entry && isSearchResultAllowed(host, domains)) {
      result.allowed.push({
        ...item,
        host,
        publisherDomain: entry.domain,
        publisher: entry.publisher,
      });
      result.counts.allow += 1;
      continue;
    }
    // 차단 사유. 항목이 있는데 allow가 아니면 feed-only 또는 deny다 — 그 밖의 값(두 함수가 어긋난 경우)은 deny로 센다.
    const reason: SearchRejectReason =
      entry === undefined
        ? "not-listed"
        : entry.status === "feed-only"
          ? "feed-only"
          : "deny";
    result.rejected.push({
      item,
      reason,
      host,
      publisherDomain: entry?.domain ?? null,
    });
    result.counts[reason] += 1;
    if (reason === "not-listed") {
      const key = host.replace(/^www\./, "");
      notListed.set(key, (notListed.get(key) ?? 0) + 1);
    }
  }

  result.notListedHosts = [...notListed]
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host));
  return result;
}
