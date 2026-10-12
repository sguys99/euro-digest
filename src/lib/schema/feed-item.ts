/**
 * 수집 결과 공통 형식 `FeedItem` — **메모리 경계 스키마** (PRD FR-02·FR-03, plan M1-09).
 * `data/` 파일이 아니다: 수집(피드 파싱 → 정규화, scripts/lib/normalize.ts)과 정제·분류(중복 제거·클러스터링·카드) 사이에서
 * 항목마다 검증한다. 통과하지 못한 항목은 그 항목만 건너뛴다(`schema` 사유 — 나머지는 계속).
 *
 * FR-03 공통 형식 `title, url, publishedAt(UTC), summary(≤500자), source, author?, lang` + 내부 필드 `authors`(M1-04).
 * - **본문 필드가 들어올 수 없다**(FR-02): `z.strictObject`라 `content`·`content:encoded`·`description`·`body`·`enclosure`·
 *   이미지(`image`·`media:*`) 같은 모르는 키는 오류다. 피드 파서(scripts/lib/rss.ts)도 처음부터 꺼내지 않는다.
 * - 정규화(번역·다듬기·URL 정리)는 하지 않는다 — 값이 형식에 맞는지만 본다. 스키마에 변환(transform)이 없다.
 *   (`HttpUrlSchema`는 앞뒤 공백만 자르는데, 정규화가 이미 자른 값을 넘긴다.)
 *
 * v0.1 — 2026-10-12 M1-09 신설.
 */
import { z } from "zod";

import { HttpUrlSchema, IsoSchema, SlugSchema } from "./common";

/** 원제목 상한 — NewsCard `t` max(200)와 같다. 넘는 항목은 자르지 않고 건너뛴다(FR-20, normalize.ts `title-too-long`). */
export const FEED_ITEM_TITLE_MAX = 200;

/** 요약문 상한(FR-03 `summary ≤500자`). */
export const FEED_ITEM_SUMMARY_MAX = 500;

/** 앞뒤 공백이 없는 비어 있지 않은 문자열(정규화가 정리한 값). */
const trimmedText = (label: string) =>
  z
    .string()
    .min(1, { error: `${label}: 빈 문자열` })
    .refine((s) => s.trim() === s, {
      error: `${label}: 앞뒤 공백은 정규화에서 정리해야 한다`,
    });

/**
 * 공통 형식 1건.
 * - `title`  원제목 — 엔티티 디코딩·앞뒤 공백 정리만(D23 무수정), 1~200자.
 * - `url`    원문 링크 — 피드 원문 그대로(앞뒤 공백 정리만, http/https). 추적 파라미터 제거 등 URL 정규화는 중복 판정
 *            해시에만 쓴다(M1-12). 국내 매체 `?idxno=` 같은 기사 식별자 쿼리도 그대로 남는다.
 * - `publishedAt` 원문 발행 시각(UTC ISO, 끝 `Z`) — 피드 날짜 → `parseFeedDate`(시간대 없는 날짜는 `Source.tz`, D34).
 * - `summary` 요약문(≤500자) — **M1-09 현재 모든 소스 null**. RSS `description`·OG 설명은 읽지 않는다(M0-25: 표시·저장 안 함,
 *            유일한 소비처는 M1-17 분류 규칙 — 어느 소스의 요약을 분류에 쓸지는 M1-17 착수 때 사용자 확인).
 * - `source` 소스 id(`configs/sources.json`의 `id`, slug).
 * - `author` FR-03 `author?` — `authors`를 ", "로 이은 한 줄, 작성자가 없으면 null. 카드(NewsCard)에는 저장하지 않는다.
 * - `authors` 작성자 이름 목록(M1-04 내부 필드 — 피드 순서, 정리·중복 제거). 기자 채널 작성자 필터
 *            (scripts/lib/author-filter.ts)가 이름 단위로 비교하려고 둔다(", "로 이은 한 줄은 이름 안의 쉼표·`email (이름)`
 *            형식을 되돌릴 수 없다). `author`와 항상 일치해야 한다(아래 refine).
 * - `lang`   소스 언어(`Source.lang`).
 */
export const FeedItemSchema = z
  .strictObject({
    title: trimmedText("제목").max(FEED_ITEM_TITLE_MAX),
    url: HttpUrlSchema,
    publishedAt: IsoSchema,
    summary: z.string().max(FEED_ITEM_SUMMARY_MAX).nullable(),
    source: SlugSchema,
    author: trimmedText("작성자").nullable(),
    authors: z.array(trimmedText("작성자")),
    lang: z.string().min(1),
  })
  .refine(
    (item) =>
      item.author ===
      (item.authors.length > 0 ? item.authors.join(", ") : null),
    {
      path: ["author"],
      error: 'author는 authors를 ", "로 이은 값(없으면 null)이어야 한다',
    },
  );
export type FeedItem = z.infer<typeof FeedItemSchema>;

/** 공통 형식의 키 전체(정렬 없음, 스키마 선언 순서) — FR-02 "본문 필드 없음" 검사용. */
export const FEED_ITEM_KEYS = FeedItemSchema.keyof().options;
