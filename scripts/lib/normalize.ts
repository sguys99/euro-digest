/**
 * 피드 항목 정규화 — 원문 항목(`RawFeedItem`) → 공통 형식 `FeedItem` (PRD FR-02·FR-03·FR-20, D23·D34, plan M1-09).
 *
 * 원제목·링크는 **고치지 않는다**(BBC ToU §15 a 등 피드 무수정 조건, D22·D23):
 *   - 제목: `cleanTitle` — HTML 엔티티 디코딩(`&amp;`·`&#8217;` 등 XML 파싱 뒤에도 남은 것, 이중 인코딩 포함) + 공백 정리만.
 *     번역·요약·다듬기 없음. 정리 범위(D23 '무수정'과의 경계 — 화면에 보이는 글자는 바뀌지 않는 것만)는 `cleanTitle` 주석.
 *   - 링크(`url`): 앞뒤 공백 정리만. 추적 파라미터 제거 같은 URL 정규화는 중복 판정 해시에만 쓴다(M1-12) — 표시 링크는 원문.
 *     형식 문제(안쪽 공백·제어 문자·사용자 정보 등 — link-check.ts, 발행 게이트와 같은 판정 M1-25)가 있으면 `bad-link`로 건너뛴다.
 *   - 날짜(`publishedAt`): `parseFeedDate`(src/lib/time.ts). 시간대가 적힌 값은 그대로 UTC로, 시간대가 없는 값은 소스의
 *     `tz`(D34 — 국내 5피드 Asia/Seoul)가 있을 때만 그 시간대로 해석한다. 둘 다 아니면 그 항목을 건너뛴다(`no-date`, 추측 안 함).
 *   - 요약(`summary`): 항상 null — RSS `description`은 파서가 꺼내지 않는다(M0-25, 분류 입력으로 쓸지는 M1-17에서 사용자 확인).
 *   - 작성자(M1-04): 이름마다 엔티티 디코딩 + 앞뒤 공백 정리, 빈 값 제거, 같은 이름(비교 키 `authorKey` 기준) 중복 제거.
 *     카드에는 저장하지 않고 기자 채널 작성자 필터(scripts/lib/author-filter.ts)·로그에만 쓴다.
 * 제목이 200자(NewsCard.t 상한)를 넘으면 자르지 않고 그 항목을 건너뛴다(FR-20). 길이는 **정리가 끝난 제목**(카드 `t`에
 * 저장될 문자열)의 JS 문자열 길이(UTF-16 코드 유닛 — NewsCardSchema와 같은 기준)로 잰다 — 엔티티 디코딩 전 길이가 아니다.
 * 건너뛴 항목은 클러스터링·카드에 들어가지 않는다(대표도 출처도 아님 — 같은 사건의 다른 기사는 그대로 카드가 된다, M1-15).
 * 마지막으로 공통 형식 zod(`FeedItemSchema`, strict — 본문 필드 불가)로 검증한다. 앞 단계 규칙을 통과했는데 스키마에서
 * 걸리면(예: 소스 `lang`이 빈 문자열) `schema` 사유로 그 항목만 건너뛰고 나머지는 계속한다 — 이슈 경로만 남긴다(값은 남기지 않음).
 *
 * 순수 함수만 둔다(시간대 판정도 입력 `source.tz`로만).
 */
import {
  FEED_ITEM_TITLE_MAX,
  FeedItemSchema,
  HttpUrlSchema,
  type FeedItem,
  type Source,
} from "@/lib/schema";
import { parseFeedDate } from "@/lib/time";

import { authorKey } from "./author-filter";
import { linkFormatProblem } from "./link-check";
import type { RawFeedItem } from "./rss";

/** 원제목 상한 — NewsCardSchema `t` max(200)·FeedItemSchema `title`과 같다. 넘으면 카드화하지 않는다(FR-20). */
export const TITLE_MAX_LENGTH = FEED_ITEM_TITLE_MAX;

/** 정규화에 필요한 소스 필드 */
export type NormalizeSource = Pick<Source, "id" | "lang" | "tz">;

/** 건너뛴 이유. `schema` = 앞 규칙은 통과했지만 공통 형식 zod에서 실패(방어선). */
export type SkipReason =
  "no-title" | "title-too-long" | "bad-link" | "no-date" | "schema";

/**
 * 정규화 결과 1건. `schema` 실패의 `issues`는 실패한 필드 경로와 zod 이슈 코드(`"lang:too_small"`)만 담는다 —
 * 입력 값(원제목·링크)은 넣지 않는다(로그용).
 */
export type NormalizeResult =
  | { ok: true; item: FeedItem }
  | { ok: false; reason: Exclude<SkipReason, "schema"> }
  | { ok: false; reason: "schema"; issues: string[] };

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

/**
 * C1 영역(0x80~0x9F) → Windows-1252 글자 — HTML5 숫자 문자 참조 대응표(27자, WHATWG 'numeric character reference end
 * state'). Windows-1252로 쓴 CMS가 `&#146;`(’)·`&#133;`(…)·`&#150;`(–)처럼 내보내는 경우다. 표에 없는 5개(0x81·0x8D·0x8F·
 * 0x90·0x9D)는 대응 글자가 없다 — 숫자 엔티티면 원문 그대로 두고, 글자로 들어온 것은 제어 문자로 지운다(`cleanTitle` ③).
 */
const WINDOWS_1252_C1: ReadonlyMap<number, string> = new Map([
  [0x80, "\u20ac"], // €
  [0x82, "\u201a"], // ‚
  [0x83, "\u0192"], // ƒ
  [0x84, "\u201e"], // „
  [0x85, "\u2026"], // …
  [0x86, "\u2020"], // †
  [0x87, "\u2021"], // ‡
  [0x88, "\u02c6"], // ˆ
  [0x89, "\u2030"], // ‰
  [0x8a, "\u0160"], // Š
  [0x8b, "\u2039"], // ‹
  [0x8c, "\u0152"], // Œ
  [0x8e, "\u017d"], // Ž
  [0x91, "\u2018"], // ‘
  [0x92, "\u2019"], // ’
  [0x93, "\u201c"], // “
  [0x94, "\u201d"], // ”
  [0x95, "\u2022"], // •
  [0x96, "\u2013"], // –
  [0x97, "\u2014"], // —
  [0x98, "\u02dc"], // ˜
  [0x99, "\u2122"], // ™
  [0x9a, "\u0161"], // š
  [0x9b, "\u203a"], // ›
  [0x9c, "\u0153"], // œ
  [0x9e, "\u017e"], // ž
  [0x9f, "\u0178"], // Ÿ
]);

/** Windows-1252 대응표 크기(HTML5 — 27자) */
export const WINDOWS_1252_C1_SIZE = WINDOWS_1252_C1.size;

/**
 * HTML 엔티티를 한 번만 푼다 — 이름 있는 기본 엔티티(amp·lt·gt·quot·apos·nbsp)와 숫자 엔티티(`&#39;`·`&#x2019;`).
 * 숫자 엔티티 0x80~0x9F는 Windows-1252 대응표(`WINDOWS_1252_C1`)로 바꾸고 표에 없는 값은 원문 그대로 둔다(HTML5와 같은 해석).
 * `&amp;amp;`는 `&amp;`가 된다(한 번만 — 제목은 반복하는 `decodeEntitiesFully`, 작성자는 이 함수). 모르는 이름·범위 밖 코드
 * 포인트는 그대로 둔다.
 */
export function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]+));/g,
    (
      match,
      dec: string | undefined,
      hex: string | undefined,
      name?: string,
    ) => {
      if (name !== undefined)
        return NAMED_ENTITIES[name.toLowerCase()] ?? match;
      const codePoint =
        dec !== undefined
          ? Number.parseInt(dec, 10)
          : Number.parseInt(hex ?? "", 16);
      if (codePoint >= 0x80 && codePoint <= 0x9f) {
        return WINDOWS_1252_C1.get(codePoint) ?? match;
      }
      if (
        !Number.isInteger(codePoint) ||
        codePoint <= 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return match;
      }
      return String.fromCodePoint(codePoint);
    },
  );
}

/** 엔티티 디코딩 최대 반복 횟수 — XML 파싱이 한 겹을 이미 풀었으므로 원문 기준 네 겹 인코딩까지 푼다 */
export const ENTITY_DECODE_MAX_PASSES = 3;

/**
 * 엔티티를 더 바뀌지 않을 때까지(최대 `maxPasses`번) 푼다 — 이중 인코딩 대응.
 * 예) CMS가 HTML로 한 번 이스케이프한 제목을 다시 XML로 이스케이프한 피드: 원문 `It&amp;amp;#8217;s` → XML 파싱
 * `It&amp;#8217;s` → 1회 `It&#8217;s` → 2회 `It’s`. 한 번만 풀면 카드에 `&#8217;`·`&amp;`가 그대로 보인다.
 * **멱등 범위**: XML 파싱 뒤 남은 여분 인코딩이 3겹 이하면 결과에 풀 엔티티가 남지 않아 다시 풀어도 같다(`cleanTitle`도 멱등).
 * 4겹 이상이면 한 겹 이상 남는다(상한 — 무한 반복·과잉 해석 방지, 실제 피드에서는 2겹을 넘는 사례가 없다).
 */
export function decodeEntitiesFully(
  text: string,
  maxPasses = ENTITY_DECODE_MAX_PASSES,
): string {
  let current = text;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const next = decodeEntities(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

/**
 * 글자로 들어온 C1 제어 문자(U+0080~U+009F) 중 Windows-1252 대응표에 있는 것 — XML 파서가 피드 원문의 `&#146;`를 이미
 * U+0092로 풀어 넘기는 경우다(CDATA 밖 숫자 엔티티). 엔티티와 같은 대응표로 바꾼다(U+0085도 줄바꿈 NEL이 아니라 …로 본다 —
 * 제목에서는 Windows-1252 말줄임표가 실제 줄바꿈보다 훨씬 흔하다).
 */
const C1_CHARS = /[\u0080-\u009f]/gu;

/** 줄바꿈·탭으로 치는 글자(U+0085는 위 대응표로 …가 되므로 넣지 않는다) */
const BREAK_CHARS = "\\t\\n\\v\\f\\r\\u2028\\u2029";

/**
 * 줄바꿈·탭이 든 공백 구간 — 공백 1칸으로 바꾼다. 구간에 넣는 공백은 ASCII 공백과 줄바꿈·탭뿐이다 — 줄바꿈 옆 NBSP·
 * 전각 공백(U+3000)은 그대로 둔다(보이는 글자).
 */
const LINE_BREAK_RUN = new RegExp(
  `[ ${BREAK_CHARS}]*[${BREAK_CHARS}][ ${BREAK_CHARS}]*`,
  "gu",
);

/** 남은 제어 문자(C0·DEL·대응표에 없는 C1 — 줄바꿈·탭 계열은 앞 단계에서 공백이 됨) */
const CONTROL_CHARS = /\p{Cc}/gu;

/**
 * 원제목 정리 — D23 '피드 제목 무수정'의 경계. **화면에 보이는 글자를 바꾸지 않는 정리만** 한다(M1-15에서 범위 확정):
 *   ① 엔티티 디코딩 — 기본 이름 6종(amp·lt·gt·quot·apos·nbsp)과 숫자 엔티티를 더 바뀌지 않을 때까지(최대 3회, 이중 인코딩 —
 *      여분 3겹까지 멱등). 숫자 0x80~0x9F는 HTML5 Windows-1252 대응표(27자 — `&#146;` → ’, 표에 없는 값은 원문 그대로).
 *      글자로 들어온 C1(XML 파서가 `&#146;`를 U+0092로 푼 것)도 같은 대응표로 바꾼다. 모르는 이름(`&eacute;` 등)·범위 밖 코드
 *      포인트는 그대로 둔다. `&nbsp;`는 NBSP 글자(U+00A0)가 된다(엔티티가 가리키는 글자).
 *   ② 줄바꿈·탭(\t \n \v \f \r, U+2028·U+2029)이 든 공백 구간(ASCII 공백만 포함) → 공백 1칸. XML 들여쓰기·CMS 줄바꿈이 제목에
 *      섞인 경우다 — HTML은 어차피 공백 1칸으로 보여 주므로 보이는 글자는 같고, 저장 문자열만 RSS·OG·공유 문구에서 깨지지 않게
 *      한다. 줄바꿈 옆 NBSP·전각 공백은 남는다.
 *   ③ 보이지 않는 제어 문자(C0·DEL·대응표에 없는 C1) 제거 — 화면에 나오지 않거나 깨진 글자로 보이고, XML(사이트 RSS)에서는
 *      허용되지 않는다.
 *   ④ 앞뒤 공백 정리(유니코드 공백·BOM 포함 — `String.prototype.trim`).
 * 그대로 두는 것: 안쪽의 일반 공백 연속(`A  -  B` — 국내 제목에 실제로 있음), NBSP 글자, 보이지 않는 서식 문자(ZWJ — 이모지
 * 결합에 쓰인다), 따옴표·대시·말줄임표·대소문자·이모지·문장부호·머리표(`[오피셜]`)·이적 표현. 번역·요약·다듬기는 하지 않는다.
 * 사용자 확정(2026-10-16): 이 범위가 D23 '무수정'(보이는 글자 불변) 범위다.
 */
export function cleanTitle(raw: string): string {
  return decodeEntitiesFully(raw)
    .replace(C1_CHARS, (ch) => WINDOWS_1252_C1.get(ch.charCodeAt(0)) ?? ch)
    .replace(LINE_BREAK_RUN, " ")
    .replace(CONTROL_CHARS, "")
    .trim();
}

/**
 * 작성자 원문 목록 정리 — 이름마다 엔티티 디코딩 → 앞뒤 공백 정리, 빈 값 제거, 비교 키가 같은 이름은 처음 것만.
 * (같은 사람이 `dc:creator`와 `author`에 함께 적힌 피드가 있다.) 안쪽 글자는 바꾸지 않는다.
 */
export function cleanAuthors(raws: readonly string[]): string[] {
  const seen = new Set<string>();
  const authors: string[] = [];
  for (const raw of raws) {
    const name = decodeEntities(raw).trim();
    const key = authorKey(name);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    authors.push(name);
  }
  return authors;
}

/** zod 이슈 → `경로:코드` 목록(중복 없음). 경로가 없으면 `(root)`. 입력 값은 넣지 않는다. */
function issueKeys(
  issues: readonly { path: PropertyKey[]; code: string }[],
): string[] {
  return [
    ...new Set(
      issues.map(
        (issue) =>
          `${issue.path.map(String).join(".") || "(root)"}:${issue.code}`,
      ),
    ),
  ];
}

/** 원문 항목 1건 → 공통 형식 FeedItem 또는 건너뛴 이유. 소스 `tz`가 IANA 이름이 아니면 TimeInputError(설정 오류). */
export function normalizeFeedItem(
  raw: RawFeedItem,
  source: NormalizeSource,
): NormalizeResult {
  const title = raw.title === null ? "" : cleanTitle(raw.title);
  if (title === "") return { ok: false, reason: "no-title" };
  if (title.length > TITLE_MAX_LENGTH) {
    return { ok: false, reason: "title-too-long" };
  }
  const url = raw.link?.trim() ?? "";
  // 링크 형식(M1-25): 스키마(http/https·도메인) + 발행 게이트와 같은 검사(공백·제어 문자·사용자 정보 등 — link-check.ts)
  if (
    !HttpUrlSchema.safeParse(url).success ||
    linkFormatProblem(url) !== null
  ) {
    return { ok: false, reason: "bad-link" };
  }
  const publishedAt = parseFeedDate(raw.pubDate, source.tz);
  if (publishedAt === null) return { ok: false, reason: "no-date" };
  const authors = cleanAuthors(raw.authors);
  const candidate: FeedItem = {
    title,
    url,
    publishedAt,
    summary: null,
    source: source.id,
    author: authors.length > 0 ? authors.join(", ") : null,
    authors,
    lang: source.lang,
  };
  const parsed = FeedItemSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "schema",
      issues: issueKeys(parsed.error.issues),
    };
  }
  return { ok: true, item: parsed.data };
}

export interface NormalizeItemsResult {
  items: FeedItem[];
  /** 건너뛴 이유별 건수(0이면 키 없음) */
  skipped: Partial<Record<SkipReason, number>>;
  /** `schema`로 건너뛴 항목들의 이슈(`경로:코드`, 중복 없음·정렬) — 로그용, 없으면 [] */
  schemaIssues: string[];
}

/** 여러 항목을 정규화하고 건너뛴 이유별 건수를 함께 돌려준다(로그용). */
export function normalizeFeedItems(
  raws: readonly RawFeedItem[],
  source: NormalizeSource,
): NormalizeItemsResult {
  const items: FeedItem[] = [];
  const skipped: Partial<Record<SkipReason, number>> = {};
  const schemaIssues = new Set<string>();
  for (const raw of raws) {
    const result = normalizeFeedItem(raw, source);
    if (result.ok) {
      items.push(result.item);
      continue;
    }
    skipped[result.reason] = (skipped[result.reason] ?? 0) + 1;
    if (result.reason === "schema") {
      for (const issue of result.issues) schemaIssues.add(issue);
    }
  }
  return { items, skipped, schemaIssues: [...schemaIssues].sort() };
}
