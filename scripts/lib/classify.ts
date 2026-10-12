/**
 * 뉴스 카드 분류 — 코드 규칙 (PRD FR-21·FR-31, D23: 뉴스 분류에 LLM을 쓰지 않는다).
 *
 * M1-01 수직 슬라이스는 **최소 규칙**만 둔다: 소스 메타(대회)만 쓰고 나머지는 기본값.
 *   - cat: "other" · comp: 소스의 competitions · teams·players: [] · imp: 3(중간) · kr: false · spoiler: false · transfer 없음
 * M1-17이 언어별 키워드·`configs/names.ko.json` 태그·이적 단계·스포일러 규칙으로, M1-14가 중요도(점수화)로 바꾼다.
 * 그때도 이 함수의 입출력 형태(FeedItem + Source → 분류 필드)는 유지한다.
 */
import type { Category, CompId, FeedItem, Source } from "@/lib/schema";

/** 분류 규칙이 없을 때의 카테고리 */
export const DEFAULT_CATEGORY: Category = "other";

/** 점수화(M1-14) 전 기본 중요도 — 1~5의 가운데 */
export const DEFAULT_IMPORTANCE = 3;

/** 카드의 분류 필드(NewsCard 중 코드 규칙이 채우는 부분) */
export interface CardClassification {
  cat: Category;
  comp: CompId[];
  teams: string[];
  players: string[];
  imp: number;
  kr: boolean;
  spoiler: boolean;
}

/** 최소 규칙 분류. item은 M1-17 키워드 규칙이 쓸 자리로 받아 둔다(지금은 읽지 않음). */
export function classifyMinimal(
  _item: FeedItem,
  source: Pick<Source, "competitions">,
): CardClassification {
  return {
    cat: DEFAULT_CATEGORY,
    comp: [...source.competitions],
    teams: [],
    players: [],
    imp: DEFAULT_IMPORTANCE,
    kr: false,
    spoiler: false,
  };
}
