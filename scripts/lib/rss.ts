/**
 * RSS 어댑터 — 피드 받기(fetch) 1회와 파싱(rss-parser)을 나눠 둔다 (M1-01 수직 슬라이스 → M1-03 보강, PRD FR-01·FR-02).
 *
 * - 받기: `fetchFeedXml` — 요청 **1회**(재시도 없음 — 재시도·시간 예산·호스트별 병렬은 scripts/lib/feed-collect.ts).
 *   · User-Agent(서비스명·저장소·연락처, CLAUDE.md §6.4)와 Accept를 보낸다.
 *   · 타임아웃: 리다이렉트를 따라가는 요청·본문 읽기까지 합친 시도 전체에 한 번(`timeoutMs`).
 *   · 리다이렉트: `redirect: "manual"`로 받아 **같은 호스트**(http→https 승격 포함)만 최대 3회 직접 따라간다.
 *     다른 호스트·https→http 강등·Location 없음·횟수 초과는 그 주소로 요청을 보내지 않고 `redirect` 오류
 *     (다른 사이트로 넘어가면 약관 확인 대상이 바뀐다).
 *   · 크기 상한: `Content-Length`가 상한을 넘으면 읽기 전에, 본문을 읽는 중 누적 바이트가 넘으면 그 자리에서 중단(`too-large`).
 *   · 실패는 모두 `FeedFetchError`(종류 `kind` + HTTP 상태 + `Retry-After`). 응답 본문은 메시지·로그에 넣지 않는다.
 *   fetch는 주입한다(테스트는 네트워크 없이 fixtures/rss/*.xml·가짜 응답을 돌려준다).
 * - 파싱: `parseFeedXml` — XML 문자열 → 항목의 **제목·링크·날짜·작성자 원문만**. 본문(`content:encoded`)·
 *   요약문(`description`)·이미지(`enclosure`·`media:*`)는 여기서 버린다 — 카드에 저장·표시하지 않는다(CLAUDE.md §1-5,
 *   PRD §15 D23, M0-25). 요약문을 분류 입력으로 쓰는 경로는 M1-09·M1-17에서 필요할 때 연다.
 *   작성자(M1-04)는 RSS `dc:creator`(Substack·WordPress)·RSS 2.0 `author`·Atom `author/name`을 **모두**(여러 개면 전부) 담는다.
 * - 정규화(엔티티 디코딩·공백 정리·날짜 → UTC)는 scripts/lib/normalize.ts, 기자 채널 작성자 필터(`Source.author`)는
 *   scripts/lib/author-filter.ts가 한다. 이 파일은 원문을 고치지 않는다.
 *
 * Conditional GET(ETag·Last-Modified)은 하지 않는다. 소스 URL은 configs/sources.json에서만 받는다(하드코딩 금지).
 */
import Parser from "rss-parser";

import { REPO_URL } from "@/lib/site";
import { parseFeedDate } from "@/lib/time";

// ─── 상수 ────────────────────────────────────────────────────────────────

/** 피드 요청 1회(리다이렉트·본문 읽기 포함) 타임아웃 */
export const FEED_TIMEOUT_MS = 15_000;

/** 응답 본문 상한(바이트, 5 MiB). 정상 피드는 수백 KB 이하다 — 이보다 크면 피드가 아닌 것을 받은 것으로 본다. */
export const FEED_MAX_BYTES = 5 * 1024 * 1024;

/** 따라가는 리다이렉트 최대 횟수(같은 호스트만) */
export const FEED_MAX_REDIRECTS = 3;

const FEED_ACCEPT =
  "application/rss+xml, application/atom+xml;q=0.9, application/xml;q=0.8, text/xml;q=0.7";

/** 따라가는 리다이렉트 상태 코드 */
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([
  301, 302, 303, 307, 308,
]);

// ─── 오류 ────────────────────────────────────────────────────────────────

/**
 * 피드 받기 실패 종류.
 *   timeout   시도 1회의 시간 초과(요청·리다이렉트·본문 읽기 합산)
 *   http-4xx  4xx 응답(429 포함 — 재시도 판단은 status로)
 *   http-5xx  5xx 응답
 *   network   연결 실패·본문을 읽다 끊김
 *   redirect  따라가지 않는 리다이렉트(다른 호스트·강등·Location 없음·횟수 초과·지원하지 않는 3xx)
 *   too-large 크기 상한 초과(Content-Length 또는 읽는 중)
 *   budget    수집 단계 전체 시간 예산이 끝나 요청을 중단함(scripts/lib/feed-collect.ts가 붙인다)
 */
export type FeedFetchErrorKind =
  | "timeout"
  | "http-4xx"
  | "http-5xx"
  | "network"
  | "redirect"
  | "too-large"
  | "budget";

/** 피드 받기 실패. 응답 본문은 메시지에 넣지 않는다. */
export class FeedFetchError extends Error {
  override readonly name = "FeedFetchError";
  readonly kind: FeedFetchErrorKind;
  /** HTTP 상태(응답이 있었을 때) */
  readonly status: number | null;
  /** `Retry-After` 헤더 → 대기 ms(있고 해석될 때만) */
  readonly retryAfterMs: number | undefined;
  constructor(
    kind: FeedFetchErrorKind,
    message: string,
    init: { status?: number | null; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.kind = kind;
    this.status = init.status ?? null;
    this.retryAfterMs = init.retryAfterMs;
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

// ─── Retry-After ─────────────────────────────────────────────────────────

/**
 * `Retry-After` 헤더 → 대기 ms. 형식은 초(정수) 또는 HTTP-date(RFC 1123 — `@/lib/time` parseFeedDate로 해석).
 * 지난 날짜는 0, 해석할 수 없는 값은 undefined(헤더 없음과 같게 본다).
 */
export function parseRetryAfterMs(
  value: string | null | undefined,
  nowMs: number,
): number | undefined {
  const s = value?.trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) return Number(s) * 1000;
  const iso = parseFeedDate(s);
  if (iso === null) return undefined;
  return Math.max(0, Date.parse(iso) - nowMs);
}

// ─── 받기 ────────────────────────────────────────────────────────────────

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface FetchFeedOptions {
  fetch: FetchLike;
  userAgent: string;
  /** 시도 1회 타임아웃(기본 FEED_TIMEOUT_MS) */
  timeoutMs?: number;
  /** 본문 상한 바이트(기본 FEED_MAX_BYTES) */
  maxBytes?: number;
  /** 따라가는 리다이렉트 최대 횟수(기본 FEED_MAX_REDIRECTS) */
  maxRedirects?: number;
  /** 현재 시각(ms) — Retry-After HTTP-date 계산용(기본 Date.now) */
  now?: () => number;
}

/** 시도가 타임아웃으로 중단됐다는 내부 표시(밖으로는 FeedFetchError("timeout")로 바뀐다) */
class AttemptAborted extends Error {
  override readonly name = "AttemptAborted";
}

/**
 * 피드 XML을 받는다(요청 1회 — 같은 호스트 리다이렉트는 이 1회 안에서 따라간다).
 * 2xx가 아니거나, 따라가지 않는 리다이렉트이거나, 너무 크거나, 시간을 넘기면 FeedFetchError. 재시도는 하지 않는다.
 */
export async function fetchFeedXml(
  url: string,
  options: FetchFeedOptions,
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? FEED_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new AttemptAborted("timeout"));
  }, timeoutMs);
  try {
    return await fetchAttempt(url, options, controller.signal);
  } catch (error) {
    // 타이머가 먼저 울렸으면 그 뒤에 난 오류(AbortError·끊긴 스트림 등)는 모두 시간 초과의 결과다.
    if (timedOut) {
      throw new FeedFetchError(
        "timeout",
        `피드 요청 시간 초과 (${timeoutMs}ms)`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAttempt(
  url: string,
  options: FetchFeedOptions,
  signal: AbortSignal,
): Promise<string> {
  const maxRedirects = options.maxRedirects ?? FEED_MAX_REDIRECTS;
  const maxBytes = options.maxBytes ?? FEED_MAX_BYTES;
  const now = options.now ?? Date.now;
  let current = url;
  for (let redirects = 0; ;) {
    let response: Response;
    try {
      response = await raceAbort(
        options.fetch(current, {
          headers: { "User-Agent": options.userAgent, Accept: FEED_ACCEPT },
          redirect: "manual",
          signal,
        }),
        signal,
      );
    } catch (error) {
      if (signal.aborted) throw error;
      throw new FeedFetchError(
        "network",
        `피드 요청 실패: ${errorText(error)}`,
      );
    }
    const status = response.status;

    if (status >= 300 && status < 400) {
      discardBody(response);
      const target = redirectTarget(
        current,
        status,
        response.headers.get("location"),
      );
      if (redirects >= maxRedirects) {
        throw new FeedFetchError(
          "redirect",
          `리다이렉트가 ${maxRedirects}회를 넘었다 (HTTP ${status})`,
          { status },
        );
      }
      redirects += 1;
      current = target;
      continue;
    }

    if (!response.ok) {
      discardBody(response);
      throw new FeedFetchError(
        status >= 500 ? "http-5xx" : "http-4xx",
        `피드 응답 HTTP ${status}`,
        {
          status,
          retryAfterMs: parseRetryAfterMs(
            response.headers.get("retry-after"),
            now(),
          ),
        },
      );
    }

    return readBodyCapped(response, maxBytes, signal);
  }
}

/**
 * 리다이렉트 응답 → 다음 요청 주소. 같은 호스트(같은 스킴 또는 http→https 승격)만 허용한다.
 * 허용하지 않으면 그 주소로 요청을 보내지 않고 FeedFetchError("redirect").
 */
function redirectTarget(
  from: string,
  status: number,
  location: string | null,
): string {
  if (!REDIRECT_STATUSES.has(status)) {
    throw new FeedFetchError(
      "redirect",
      `따라가지 않는 3xx 응답 (HTTP ${status})`,
      { status },
    );
  }
  if (!location?.trim()) {
    throw new FeedFetchError(
      "redirect",
      `리다이렉트 응답에 Location이 없다 (HTTP ${status})`,
      { status },
    );
  }
  let source: URL;
  let target: URL;
  try {
    source = new URL(from);
    target = new URL(location.trim(), source);
  } catch {
    throw new FeedFetchError(
      "redirect",
      `리다이렉트 Location 형식 오류 (HTTP ${status})`,
      { status },
    );
  }
  const sameHost = source.host.toLowerCase() === target.host.toLowerCase();
  const schemeOk =
    target.protocol === source.protocol ||
    (source.protocol === "http:" && target.protocol === "https:");
  if (!sameHost || !schemeOk) {
    throw new FeedFetchError(
      "redirect",
      `다른 호스트·스킴으로의 리다이렉트 거부 (${source.protocol}//${source.host} → ${target.protocol}//${target.host})`,
      { status },
    );
  }
  return target.href;
}

/**
 * 쓰지 않는 응답 본문을 닫는다(연결 반환). 취소 완료를 기다리지 않는다 — 취소가 늦게 끝나는 스트림 때문에 시도가
 * 타임아웃을 넘겨 멈추지 않게. 실패(이미 닫힘·오류 난 스트림)는 무시한다.
 */
function discardBody(response: Response): void {
  response.body?.cancel().catch(() => undefined);
}

/**
 * 본문을 상한 안에서 읽어 UTF-8 문자열로 바꾼다. `Content-Length`가 상한을 넘으면 읽지 않고, 읽는 중 누적 바이트가
 * 상한을 넘으면 그 자리에서 스트림을 취소한다. 압축 전송이면 Content-Length는 압축 크기라 읽는 중 검사가 최종 방어선이다.
 */
async function readBodyCapped(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string> {
  const status = response.status;
  const declared = contentLength(response.headers.get("content-length"));
  if (declared !== null && declared > maxBytes) {
    discardBody(response);
    throw new FeedFetchError(
      "too-large",
      `피드 응답이 너무 크다 (Content-Length ${declared}바이트 > ${maxBytes}바이트)`,
      { status },
    );
  }
  const body = response.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await raceAbort(reader.read(), signal);
      } catch (error) {
        if (signal.aborted) throw error;
        throw new FeedFetchError(
          "network",
          `피드 응답 읽기 실패: ${errorText(error)}`,
          { status },
        );
      }
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        throw new FeedFetchError(
          "too-large",
          `피드 응답이 너무 크다 (${maxBytes}바이트 초과 — 읽기 중단)`,
          { status },
        );
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    // 상한 초과·끊김·타임아웃 — 더 받지 않는다(취소 완료는 기다리지 않음, 오류 난 스트림의 취소 실패는 무시).
    reader.cancel().catch(() => undefined);
    throw error;
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

/** `Content-Length` → 바이트 수(없거나 형식이 틀리면 null) */
function contentLength(value: string | null): number | null {
  const s = value?.trim();
  return s && /^\d+$/.test(s) ? Number(s) : null;
}

/**
 * 약속을 신호와 경주시킨다 — 신호가 먼저 중단되면 그 이유로 거부한다. 주입한 fetch·스트림이 신호를 무시해도
 * 시도가 타임아웃에서 끝나게 한다. 진 쪽 약속의 결과는 버린다(거부도 처리해 둔다).
 */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(abortReason(signal));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new AttemptAborted("aborted");
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "")
    : String(error);
}

// ─── 파싱 ────────────────────────────────────────────────────────────────

/** 파싱한 피드 항목 1건 — 원문 그대로(엔티티는 XML 수준만 풀림, 공백·날짜 미정리). 없는 값은 null. */
export interface RawFeedItem {
  title: string | null;
  link: string | null;
  /** RSS `pubDate`(없으면 Dublin Core `dc:date`) 원문 */
  pubDate: string | null;
  /**
   * 작성자 원문 목록(M1-04 기자 채널 작성자 필터용) — `dc:creator` 전부 → `author` 전부 순서. 없으면 [].
   * RSS 2.0 `author`는 원문 그대로(`email (이름)` 형식이면 그 문자열 전체 — 이름 꺼내기는 author-filter.ts가 비교할 때만).
   * Atom `author`(사람 구성 요소)는 `name`만. 빈 값·중복 정리는 normalize.ts가 한다.
   */
  authors: string[];
}

/**
 * 작성자 요소를 배열로 받는 사용자 정의 필드 — rss-parser 기본 매핑은 **첫 요소만** 담는다(`creator`·`author`,
 * Atom은 첫 `author/name`). `keepArray`로 같은 이름 요소를 모두 받는다. RSS·Atom 둘 다 이 목록을 적용한다.
 */
const AUTHOR_DC_CREATORS = "authorDcCreators";
const AUTHOR_ELEMENTS = "authorElements";
const AUTHOR_FIELDS = [
  ["dc:creator", AUTHOR_DC_CREATORS, { keepArray: true }],
  ["author", AUTHOR_ELEMENTS, { keepArray: true }],
];

/** 문자열만 받는다 — xml2js가 속성 붙은 요소·자식 요소를 객체로 돌려주는 경우는 값 없음으로 본다. */
function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * xml2js 요소 배열 → 작성자 문자열 목록. 요소 하나는
 *   - 문자열(텍스트·CDATA)
 *   - `{ _: 텍스트, $: 속성 }`(속성 붙은 요소)
 *   - `{ name: [...], email: [...] }`(Atom 사람 구성 요소 — RSS 안의 비표준 `<author><name>`도 같다) → `name`만
 * 그 밖의 모양(빈 요소의 속성만 등)은 건너뛴다.
 */
function authorTexts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const texts: string[] = [];
  for (const element of value) {
    if (typeof element === "string") {
      texts.push(element);
    } else if (isRecord(element)) {
      if (typeof element._ === "string") texts.push(element._);
      else if (Array.isArray(element.name)) {
        texts.push(...authorTexts(element.name));
      }
    }
  }
  return texts;
}

/**
 * 피드 XML → 항목 목록(피드 순서 그대로). 깨진 XML·RSS/Atom이 아닌 문서는 FeedParseError, 항목이 없으면 [].
 * 본문·요약문·이미지 필드는 결과에 담지 않는다.
 */
export async function parseFeedXml(xml: string): Promise<RawFeedItem[]> {
  const parser = new Parser({ customFields: { item: AUTHOR_FIELDS } });
  let feed: Awaited<ReturnType<typeof parser.parseString>>;
  try {
    feed = await parser.parseString(xml);
  } catch (error) {
    throw new FeedParseError(
      `피드 파싱 실패: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
    );
  }
  return (feed.items ?? []).map((item) => {
    // rss-parser 타입에 없는 dc:date는 `date` 키로, 작성자 배열은 AUTHOR_FIELDS의 키로 들어온다.
    const record = item as Record<string, unknown>;
    return {
      title: stringOrNull(item.title),
      link: stringOrNull(item.link),
      pubDate: stringOrNull(item.pubDate) ?? stringOrNull(record.date),
      authors: [
        ...authorTexts(record[AUTHOR_DC_CREATORS]),
        ...authorTexts(record[AUTHOR_ELEMENTS]),
      ],
    };
  });
}
