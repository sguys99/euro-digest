/**
 * 뉴스 카드 분류 — 코드 규칙 (PRD FR-21·FR-31, D23: 뉴스 분류에 LLM을 쓰지 않는다).
 *
 * M1-01 수직 슬라이스는 **최소 규칙**만 둔다: 소스 메타(대회)만 쓰고 나머지는 기본값.
 *   - cat: "other" · comp: 소스의 competitions · teams·players: [] · imp: 3(중간) · kr: false · spoiler: false · transfer 없음
 * M1-17이 언어별 키워드(scripts/lib/news-keywords.ts 공용 표)·`configs/names.ko.json` 태그·이적 단계·스포일러 규칙과
 * 중요도(FR-21 — 선별 점수(M1-14, `signals.score`) → 1~5 구간)로 바꾼다. 그때도 입출력 형태(FeedItem + Source + 선별 신호 →
 * 분류 필드)는 유지한다.
 */
import type { Category, CompId, FeedItem, Source } from "@/lib/schema";

import type { NewsScore } from "./score";

/** 분류 규칙이 없을 때의 카테고리 */
export const DEFAULT_CATEGORY: Category = "other";

/** 점수 구간(M1-17 — 선별 점수 M1-14 → 1~5) 전 기본 중요도 — 1~5의 가운데 */
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

/**
 * 선별 단계가 카드 생성까지 넘기는 신호(M1-14) — 클러스터 점수(FR-06)와 그 근거(키워드·대회·매체 수).
 * M1-17이 `imp`(점수 구간)·대회·한국 선수 태그에 쓴다. 카드·data/에는 저장하지 않는다.
 */
export interface CardSignals {
  score: NewsScore;
}

/**
 * 최소 규칙 분류. item·signals는 M1-17 키워드 규칙·중요도(점수 구간)가 쓸 자리로 받아 둔다(지금은 읽지 않음 —
 * 중요도는 기본값 3이라 카드 표시 순서(news-file.ts sortCards)는 아직 시각 순이다).
 */
export function classifyMinimal(
  _item: FeedItem,
  source: Pick<Source, "competitions">,
  _signals: CardSignals | null = null,
): CardClassification {
  void _signals; // M1-17 연결 지점 — 지금은 읽지 않는다
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
