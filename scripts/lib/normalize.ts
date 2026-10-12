/**
 * 피드 항목 정규화 — 원문 항목 → 공통 형식 `FeedItem` (M1-01 수직 슬라이스, PRD FR-03·FR-20, D23).
 *
 * 원제목·링크는 **고치지 않는다**(BBC ToU §15 a 등 피드 무수정 조건, D22·D23):
 *   - 제목: HTML 엔티티 디코딩(`&amp;`·`&#8217;` 등 XML 파싱 뒤에도 남은 것) + 앞뒤 공백 정리만. 번역·요약·다듬기 없음.
 *   - 링크: 앞뒤 공백 정리만. 추적 파라미터 제거 같은 URL 정규화는 중복 판정 해시에만 쓴다(M1-10·M1-16) — 표시 링크는 원문.
 *   - 날짜: 시간대가 적힌 값만 UTC로(`parseFeedDate`, src/lib/time.ts). 없으면 그 항목을 건너뛴다(추측하지 않음).
 * 제목이 200자(NewsCard.t 상한)를 넘으면 자르지 않고 그 항목을 건너뛴다(FR-20).
 *
 * 순수 함수만 둔다. M1-09가 zod 공통 형식·"본문 필드 없음" 테스트·소스별 기본 시간대(국내 KST)로 보강한다.
 */
import { HttpUrlSchema, type Source } from "@/lib/schema";
import { parseFeedDate } from "@/lib/time";

import type { RawFeedItem } from "./rss";

/** 원제목 상한 — NewsCardSchema `t` max(200)와 같다. 넘으면 카드화하지 않는다(FR-20). */
export const TITLE_MAX_LENGTH = 200;

/** 정규화를 통과한 피드 항목(공통 형식). 본문·요약문 필드는 없다. */
export interface FeedItem {
  sourceId: string;
  /** 원제목(엔티티 디코딩·앞뒤 공백 정리만) */
  title: string;
  /** 원문 링크(앞뒤 공백 정리만, http/https) */
  link: string;
  /** 원문 발행 시각(UTC ISO) */
  publishedAt: string;
  lang: string;
  author: string | null;
}

export type SkipReason = "no-title" | "title-too-long" | "bad-link" | "no-date";

export type NormalizeResult =
  { ok: true; item: FeedItem } | { ok: false; reason: SkipReason };

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

/** 원문 항목 1건 → FeedItem 또는 건너뛴 이유. */
export function normalizeFeedItem(
  raw: RawFeedItem,
  source: Pick<Source, "id" | "lang">,
): NormalizeResult {
  const title = raw.title === null ? "" : cleanTitle(raw.title);
  if (title === "") return { ok: false, reason: "no-title" };
  if (title.length > TITLE_MAX_LENGTH) {
    return { ok: false, reason: "title-too-long" };
  }
  const link = raw.link?.trim() ?? "";
  if (!HttpUrlSchema.safeParse(link).success) {
    return { ok: false, reason: "bad-link" };
  }
  const publishedAt = parseFeedDate(raw.pubDate);
  if (publishedAt === null) return { ok: false, reason: "no-date" };
  return {
    ok: true,
    item: {
      sourceId: source.id,
      title,
      link,
      publishedAt,
      lang: source.lang,
      author: raw.author?.trim() || null,
    },
  };
}

/** 여러 항목을 정규화하고 건너뛴 이유별 건수를 함께 돌려준다(로그용). */
export function normalizeFeedItems(
  raws: readonly RawFeedItem[],
  source: Pick<Source, "id" | "lang">,
): { items: FeedItem[]; skipped: Partial<Record<SkipReason, number>> } {
  const items: FeedItem[] = [];
  const skipped: Partial<Record<SkipReason, number>> = {};
  for (const raw of raws) {
    const result = normalizeFeedItem(raw, source);
    if (result.ok) items.push(result.item);
    else skipped[result.reason] = (skipped[result.reason] ?? 0) + 1;
  }
  return { items, skipped };
}
