/**
 * RSS 수집 — 피드 받기(fetch)와 파싱(rss-parser)을 나눠 둔다 (M1-01 수직 슬라이스, PRD FR-01·FR-02).
 *
 * - 받기: `fetchFeedXml` — User-Agent(서비스명·저장소·연락처), 요청 타임아웃, 다른 호스트로의 리다이렉트 거부,
 *   응답 크기 상한. fetch는 주입한다(테스트는 네트워크 없이 fixtures/rss/*.xml을 돌려준다).
 * - 파싱: `parseFeedXml` — XML 문자열 → 항목의 **제목·링크·날짜·작성자 원문만**. 본문(`content:encoded`)·
 *   요약문(`description`)·이미지(`enclosure`·`media:*`)는 여기서 버린다 — 카드에 저장·표시하지 않는다(CLAUDE.md §1-5,
 *   PRD §15 D23, M0-25). 요약문을 분류 입력으로 쓰는 경로는 M1-09·M1-17에서 필요할 때 연다.
 * - 정규화(엔티티 디코딩·공백 정리·날짜 → UTC)는 scripts/lib/normalize.ts가 한다. 이 파일은 원문을 고치지 않는다.
 *
 * M1-03이 재시도·소스별 실패 격리(이슈 생성)로, M1-04가 `author` 필터로 보강한다. 소스 URL은 configs/sources.json에서만
 * 받는다(하드코딩 금지).
 */
import Parser from "rss-parser";

import { REPO_URL } from "@/lib/site";

// ─── 상수 ────────────────────────────────────────────────────────────────

/** 피드 요청 1회 타임아웃 */
export const FEED_TIMEOUT_MS = 15_000;

/** 응답 본문 상한(문자 수). 정상 피드는 수백 KB 이하다 — 이보다 크면 피드가 아닌 것을 받은 것으로 본다. */
export const FEED_MAX_CHARS = 5_000_000;

const FEED_ACCEPT =
  "application/rss+xml, application/atom+xml;q=0.9, application/xml;q=0.8, text/xml;q=0.7";

// ─── 오류 ────────────────────────────────────────────────────────────────

/** 피드 받기 실패(HTTP 상태·타임아웃·리다이렉트·크기). 응답 본문은 메시지에 넣지 않는다. */
export class FeedFetchError extends Error {
  override readonly name = "FeedFetchError";
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.status = status;
  }
}

/** 피드 파싱 실패(깨진 XML·RSS/Atom이 아님). */
export class FeedParseError extends Error {
  override readonly name = "FeedParseError";
}

// ─── User-Agent ──────────────────────────────────────────────────────────

/**
 * 수집기 User-Agent — `EuroDigestBot/0.1 (+<저장소>; <연락처>)` (CLAUDE.md §6.4).
 * 연락처는 환경변수 CONTACT_EMAIL에서 받는다(비밀값 아님). 없으면 저장소 주소만 넣는다.
 */
export function feedUserAgent(contactEmail: string | undefined): string {
  const contact = contactEmail?.trim();
  return contact
    ? `EuroDigestBot/0.1 (+${REPO_URL}; ${contact})`
    : `EuroDigestBot/0.1 (+${REPO_URL})`;
}

// ─── 받기 ────────────────────────────────────────────────────────────────

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface FetchFeedOptions {
  fetch: FetchLike;
  userAgent: string;
  timeoutMs?: number;
}

/**
 * 피드 XML을 받는다. 2xx가 아니거나, 다른 호스트로 리다이렉트됐거나, 너무 크면 FeedFetchError.
 * 재시도는 하지 않는다(M1-03).
 */
export async function fetchFeedXml(
  url: string,
  options: FetchFeedOptions,
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? FEED_TIMEOUT_MS;
  let response: Response;
  try {
    response = await options.fetch(url, {
      headers: { "User-Agent": options.userAgent, Accept: FEED_ACCEPT },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new FeedFetchError(`피드 요청 시간 초과 (${timeoutMs}ms)`);
    }
    throw new FeedFetchError(
      `피드 요청 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok) {
    throw new FeedFetchError(
      `피드 응답 HTTP ${response.status}`,
      response.status,
    );
  }
  // 리다이렉트를 따라갔다면 최종 호스트가 같아야 한다(다른 사이트로 넘어가면 약관 확인 대상이 바뀐다).
  if (response.url && hostOf(response.url) !== hostOf(url)) {
    throw new FeedFetchError(
      `다른 호스트로 리다이렉트됨 (${hostOf(url)} → ${hostOf(response.url)})`,
      response.status,
    );
  }
  const text = await response.text();
  if (text.length > FEED_MAX_CHARS) {
    throw new FeedFetchError(
      `피드 응답이 너무 크다 (${text.length}자 > ${FEED_MAX_CHARS}자)`,
      response.status,
    );
  }
  return text;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

// ─── 파싱 ────────────────────────────────────────────────────────────────

/** 파싱한 피드 항목 1건 — 원문 그대로(엔티티는 XML 수준만 풀림, 공백·날짜 미정리). 없는 값은 null. */
export interface RawFeedItem {
  title: string | null;
  link: string | null;
  /** RSS `pubDate`(없으면 Dublin Core `dc:date`) 원문 */
  pubDate: string | null;
  /** `dc:creator`·`author` (M1-04 기자 채널 작성자 필터용) */
  author: string | null;
}

/** 문자열만 받는다 — xml2js가 속성 붙은 요소·자식 요소를 객체로 돌려주는 경우는 값 없음으로 본다. */
function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * 피드 XML → 항목 목록(피드 순서 그대로). 깨진 XML·RSS/Atom이 아닌 문서는 FeedParseError, 항목이 없으면 [].
 * 본문·요약문·이미지 필드는 결과에 담지 않는다.
 */
export async function parseFeedXml(xml: string): Promise<RawFeedItem[]> {
  const parser = new Parser();
  let feed: Awaited<ReturnType<typeof parser.parseString>>;
  try {
    feed = await parser.parseString(xml);
  } catch (error) {
    throw new FeedParseError(
      `피드 파싱 실패: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
    );
  }
  return (feed.items ?? []).map((item) => {
    // rss-parser 타입에 없는 dc:date는 `date` 키로 들어온다(fields.js 매핑).
    const record = item as Record<string, unknown>;
    return {
      title: stringOrNull(item.title),
      link: stringOrNull(item.link),
      pubDate: stringOrNull(item.pubDate) ?? stringOrNull(record.date),
      author: stringOrNull(item.creator) ?? stringOrNull(record.author),
    };
  });
}
