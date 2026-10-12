/**
 * 피드 항목 정규화 — 원문 항목(`RawFeedItem`) → 공통 형식 `FeedItem` (PRD FR-02·FR-03·FR-20, D23·D34, plan M1-09).
 *
 * 원제목·링크는 **고치지 않는다**(BBC ToU §15 a 등 피드 무수정 조건, D22·D23):
 *   - 제목: HTML 엔티티 디코딩(`&amp;`·`&#8217;` 등 XML 파싱 뒤에도 남은 것) + 앞뒤 공백 정리만. 번역·요약·다듬기 없음.
 *   - 링크(`url`): 앞뒤 공백 정리만. 추적 파라미터 제거 같은 URL 정규화는 중복 판정 해시에만 쓴다(M1-12) — 표시 링크는 원문.
 *   - 날짜(`publishedAt`): `parseFeedDate`(src/lib/time.ts). 시간대가 적힌 값은 그대로 UTC로, 시간대가 없는 값은 소스의
 *     `tz`(D34 — 국내 5피드 Asia/Seoul)가 있을 때만 그 시간대로 해석한다. 둘 다 아니면 그 항목을 건너뛴다(`no-date`, 추측 안 함).
 *   - 요약(`summary`): 항상 null — RSS `description`은 파서가 꺼내지 않는다(M0-25, 분류 입력으로 쓸지는 M1-17에서 사용자 확인).
 *   - 작성자(M1-04): 이름마다 엔티티 디코딩 + 앞뒤 공백 정리, 빈 값 제거, 같은 이름(비교 키 `authorKey` 기준) 중복 제거.
 *     카드에는 저장하지 않고 기자 채널 작성자 필터(scripts/lib/author-filter.ts)·로그에만 쓴다.
 * 제목이 200자(NewsCard.t 상한)를 넘으면 자르지 않고 그 항목을 건너뛴다(FR-20).
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
  nbsp: " ",
};

/**
 * HTML 엔티티를 한 번만 푼다 — 이름 있는 기본 엔티티(amp·lt·gt·quot·apos·nbsp)와 숫자 엔티티(`&#39;`·`&#x2019;`).
 * `&amp;amp;`는 `&amp;`가 된다(이중 디코딩 없음). 모르는 이름·범위 밖 코드 포인트는 그대로 둔다.
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

/** 원제목 정리 — 엔티티 디코딩 → 앞뒤 공백 정리. 그 밖의 글자는 바꾸지 않는다. */
export function cleanTitle(raw: string): string {
  return decodeEntities(raw).trim();
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
  if (!HttpUrlSchema.safeParse(url).success) {
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
