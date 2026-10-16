/**
 * URL 정규화 + 정규화 URL 해시 (PRD FR-04·FR-20, plan M1-12) — 순수 함수.
 *
 * **정규화 URL은 같은 기사인지 가리는 키로만 쓴다.** 카드에 표시·저장하는 링크(`FeedItem.url`·`src[].u`)는 피드 원문
 * 그대로다(D22·D23 피드 무수정, FR-20 "URL 정규화는 중복 판정·카드 ID에만"). 국내 매체의 기사 식별 쿼리(`idxno`)처럼
 * 기사를 가리키는 쿼리는 키에도 남는다 — 지우는 것은 아래 목록의 추적·AMP 파라미터뿐이다.
 *
 * ── 규칙 (`normalizeUrl`) ────────────────────────────────────────────────
 *   ① AMP 캐시 풀기 — `www.google.<tld>/amp/s/<원본 호스트>/<경로>`, `<x>.cdn.ampproject.org/c/s/<원본 호스트>/<경로>`
 *      (`c`·`v`·`i`·`r`·`wp`·`ii`, `/s/` = https)는 원본 URL로 바꾼 뒤 아래 규칙을 적용한다(한 번만 — 중첩은 풀지 않는다).
 *   ② 스킴 — http·https는 같은 기사로 본다(키는 https). 풋볼리스트 피드는 `http://` 링크다(표시 링크는 그대로).
 *   ③ 호스트 — 소문자(URL 파서), 끝의 점 제거, 앞의 `www.`·`m.`·`amp.` 제거(남는 호스트에 점이 있을 때만, 겹치면 반복).
 *      기본 포트(80·443) 제거.
 *   ④ 경로 — `amp` 경로 조각 제거(`/amp/…`·`…/amp/`), 마지막 조각의 `.amp` 접미사(`…/articles/c8x2….amp`,
 *      `story.amp.html` → `story.html`), 국내 CMS(엔디소프트) AMP 페이지 `articleViewAmp.html` → `articleView.html`,
 *      끝 슬래시 제거(루트 `/` 제외), 퍼센트 인코딩 16진수는 대문자로 통일. 대소문자는 그대로(경로는 대소문자를 구별한다).
 *   ⑤ 쿼리 — 추적 파라미터 제거(이름 대소문자 무시): 접두사 `utm_`·`at_`(BBC 등 AT Internet/Piano 캠페인 —
 *      `at_medium`·`at_campaign`)·`ns_`(comScore) + 아래 `TRACKING_PARAMS`(클릭 id 등) + AMP 파라미터(`amp`·`usqp`·
 *      `outputType=amp` …). 나머지는 이름순(같은 이름은 원래 순서)으로 정렬 — 순서만 다른 같은 URL을 같은 키로.
 *   ⑥ 조각(`#…`) 제거.
 *   파싱할 수 없는 값은 앞뒤 공백만 정리해 그대로 돌려준다(던지지 않는다 — FeedItem.url은 이미 HttpUrl 검증을 통과했다).
 *
 * 보수적 원칙: 서로 다른 기사를 같은 키로 합치면 기사 하나가 사라진다(같은 기사가 두 번 나오는 것보다 나쁘다). 그래서
 * 이름만 보고 뜻이 애매한 파라미터(`ref`·`source`·`share`·`cmp` …)는 지우지 않고, 사이트별 도메인 대응(bbc.com ↔ bbc.co.uk)도
 * 하지 않는다 — 다른 URL의 같은 사건은 제목 클러스터링(M1-13)이 묶는다.
 *
 * ── 해시 (`urlHash`) ────────────────────────────────────────────────────
 *   sha256(정규화 URL) 16진수 앞 16자리(64비트) = `data/cache/seen-urls.json` 키(`UrlHashSchema`). 카드 ID(M1-16 —
 *   scripts/lib/card-id.ts `cardIdFor` = `c_` + 이 해시의 앞 10자리)는 대표 링크 키의 접두사다(부록 A 11). 2026-10-14까지
 *   발행된 카드의 ID는 옛 규칙(피드 원문 링크의 해시)이라 접두사가 아닐 수 있다 — 기존 카드는 ID가 아니라 출처 링크의 이 키로 찾는다.
 */
import { createHash } from "node:crypto";

/** seen-urls 키 = 정규화 URL sha256 앞 16자리(64비트) — `UrlHashSchema`와 같은 길이 */
export const URL_HASH_HEX_LENGTH = 16;

/** 이 접두사로 시작하는 쿼리 파라미터는 추적용이라 지운다(이름 소문자 기준) */
export const TRACKING_PARAM_PREFIXES: readonly string[] = [
  "utm_", // Google Analytics 캠페인(utm_source·utm_medium·utm_campaign·utm_term·utm_content …)
  "at_", // AT Internet/Piano 캠페인 — BBC 피드 링크의 at_medium·at_campaign
  "ns_", // comScore(ns_mchannel·ns_source·ns_campaign·ns_linkname·ns_fee)
];

/** 지우는 추적 파라미터(이름 소문자) — 광고 클릭 id·메일·SNS 공유 추적. 뜻이 애매한 이름은 넣지 않는다(머리 주석) */
export const TRACKING_PARAMS: ReadonlySet<string> = new Set([
  "fbclid", // Facebook
  "gclid", // Google Ads
  "gclsrc",
  "dclid", // Google 디스플레이
  "gbraid",
  "wbraid",
  "msclkid", // Microsoft Ads
  "yclid", // Yandex
  "twclid", // X
  "ttclid", // TikTok
  "igshid", // Instagram
  "igsh",
  "li_fat_id", // LinkedIn
  "mc_cid", // Mailchimp
  "mc_eid",
  "_ga", // Google Analytics 교차 도메인
  "_gl",
  "_hsenc", // HubSpot
  "_hsmi",
  "mkt_tok", // Marketo
  "xtor", // AT Internet(구 표기)
  "ocid", // Microsoft/MSN
  "cmpid",
  "s_cid", // Adobe
  "smid", // NYT(The Athletic) 공유
  "smtyp",
  "ref_src", // X 임베드
  "ref_url",
]);

/** AMP 페이지·AMP 캐시가 붙이는 파라미터(이름 소문자) — 값과 무관하게 지운다 */
export const AMP_PARAMS: ReadonlySet<string> = new Set([
  "amp", // ?amp · ?amp=1 · ?amp=true
  "_amp",
  "amp_js_v", // AMP 캐시
  "amp_gsa",
  "amp_r",
  "amp_tf",
  "ampshare",
  "usqp", // Google AMP 뷰어
  "aoh",
  "__amp_source_origin",
]);

/** 호스트 앞에서 떼는 조각 — 같은 기사의 데스크톱·모바일·AMP 호스트 */
const HOST_PREFIXES: readonly string[] = ["www.", "m.", "amp."];

/** 쿼리 파라미터를 지울지 — 추적·AMP 파라미터(이름 대소문자 무시). `outputType=amp`는 값까지 본다 */
export function isNoiseParam(name: string, value: string): boolean {
  const key = name.toLowerCase();
  if (TRACKING_PARAMS.has(key) || AMP_PARAMS.has(key)) return true;
  if (TRACKING_PARAM_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return true;
  }
  return key === "outputtype" && value.toLowerCase() === "amp";
}

/** 같은 기사의 원본 URL — AMP 캐시(Google AMP 뷰어·cdn.ampproject.org)면 원본을 꺼내고, 아니면 null */
function unwrapAmpCache(url: URL): URL | null {
  const host = url.hostname.toLowerCase();
  let rest: string | null = null;
  let secure = true;
  if (/^(?:www\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(host)) {
    // https://www.google.com/amp/s/www.example.com/path → https://www.example.com/path (`s/` 없으면 http)
    const m = /^\/amp\/(s\/)?(.+)$/.exec(url.pathname);
    if (m) {
      secure = m[1] !== undefined;
      rest = m[2] ?? null;
    }
  } else if (host.endsWith(".cdn.ampproject.org")) {
    // https://www-example-com.cdn.ampproject.org/c/s/www.example.com/path → https://www.example.com/path
    const m = /^\/(?:c|v|i|r|wp|ii)\/(s\/)?(.+)$/.exec(url.pathname);
    if (m) {
      secure = m[1] !== undefined;
      rest = m[2] ?? null;
    }
  }
  if (rest === null) return null;
  try {
    const inner = new URL(
      `${secure ? "https" : "http"}://${rest}${url.search}`,
    );
    return inner.hostname.includes(".") ? inner : null;
  } catch {
    return null;
  }
}

/** 호스트 키 — 끝 점 제거, 앞의 www.·m.·amp. 제거(남는 호스트에 점이 있을 때만) */
function hostKeyOf(hostname: string): string {
  let host = hostname.toLowerCase().replace(/\.$/, "");
  for (let changed = true; changed;) {
    changed = false;
    for (const prefix of HOST_PREFIXES) {
      const rest = host.slice(prefix.length);
      if (host.startsWith(prefix) && rest.includes(".")) {
        host = rest;
        changed = true;
      }
    }
  }
  return host;
}

/** 경로 키 — AMP 조각·접미사 제거, 끝 슬래시 제거, 퍼센트 인코딩 대문자 */
function pathKeyOf(pathname: string): string {
  const segments = pathname
    .split("/")
    .filter((segment) => segment.toLowerCase() !== "amp");
  // 마지막 비어 있지 않은 조각의 AMP 접미사
  let last = segments.length - 1;
  while (last >= 0 && segments[last] === "") last -= 1;
  if (last >= 0) {
    segments[last] = (segments[last] ?? "")
      .replace(/^articleViewAmp\.html$/i, "articleView.html") // 엔디소프트 CMS(인터풋볼·베스트일레븐·풋볼리스트 형식)
      .replace(/\.amp(\.html?)$/i, "$1") // story.amp.html → story.html
      .replace(/(.)\.amp$/i, "$1"); // …/articles/c8x23ekvp3ywo.amp → …/articles/c8x23ekvp3ywo
  }
  let path = segments.join("/");
  path = path.replace(/\/+$/, "");
  if (!path.startsWith("/")) path = `/${path}`;
  return path.replace(/%[0-9a-f]{2}/gi, (escape) => escape.toUpperCase());
}

/** 쿼리 키 — 추적·AMP 파라미터 제거 후 이름순 정렬(같은 이름은 원래 순서), 남는 것이 없으면 "" */
function queryKeyOf(params: URLSearchParams): string {
  const kept = [...params.entries()]
    .map(([name, value], index) => ({ name, value, index }))
    .filter(({ name, value }) => !isNoiseParam(name, value));
  if (kept.length === 0) return "";
  kept.sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : a.index - b.index,
  );
  const query = new URLSearchParams();
  for (const { name, value } of kept) query.append(name, value);
  return query.toString();
}

/**
 * 중복 판정용 정규화 URL(머리 주석 ①~⑥). 표시 링크로 쓰지 않는다.
 * 예) `http://www.bbc.co.uk/sport/football/articles/abc.amp?at_medium=RSS&at_campaign=rss#comments`
 *     → `https://bbc.co.uk/sport/football/articles/abc`
 *     `http://www.footballist.co.kr/news/articleView.html?idxno=215736&utm_source=x`
 *     → `https://footballist.co.kr/news/articleView.html?idxno=215736`
 */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return trimmed;
  url = unwrapAmpCache(url) ?? url;
  const host = hostKeyOf(url.hostname);
  const port =
    url.port === "" || url.port === "80" || url.port === "443"
      ? ""
      : `:${url.port}`;
  const query = queryKeyOf(url.searchParams);
  return `https://${host}${port}${pathKeyOf(url.pathname)}${query ? `?${query}` : ""}`;
}

/** 정규화한 URL 문자열 → 해시(sha256 16진수 앞 16자리, 소문자). 이미 정규화한 값에만 쓴다 */
export function hashNormalizedUrl(normalized: string): string {
  return createHash("sha256")
    .update(normalized, "utf8")
    .digest("hex")
    .slice(0, URL_HASH_HEX_LENGTH);
}

/** 원문 URL → 중복 판정 키(정규화 → 해시). seen-urls.json 키와 같다 */
export function urlHash(raw: string): string {
  return hashNormalizedUrl(normalizeUrl(raw));
}
