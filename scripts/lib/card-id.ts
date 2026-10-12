/**
 * 뉴스 카드 ID — `c_` + 16진수 10자리, 대표 URL의 결정적 해시 (PRD §15 D15, CLAUDE.md §8).
 * 같은 URL은 실행·날짜와 무관하게 항상 같은 ID가 된다 → 공유 앵커(`/news/<date>/#c_…`)가 깨지지 않고,
 * 같은 날 다시 실행해도 같은 카드가 두 번 생기지 않는다(FR-04).
 *
 * M1-01 수직 슬라이스: 해시 입력은 **피드 원문 링크**(앞뒤 공백만 정리)다 — M0-34 원제목 카드 샘플
 * (`fixtures/news-sample.json`, 임시 `sha256(링크 원문)`)과 같은 규칙이라 같은 링크면 같은 ID가 나온다.
 * M1-16이 "대표 URL = 정규화 URL(추적 파라미터 제거 등, M1-10)" 기준으로 확정한다 — 그때 이 함수 하나만 바꾼다.
 */
import { createHash } from "node:crypto";

/** 카드 ID 16진수 자릿수 */
export const CARD_ID_HEX_LENGTH = 10;

/** 대표 URL → 카드 ID (`c_` + sha256 앞 10자리, 소문자). */
export function cardIdFor(url: string): string {
  const digest = createHash("sha256").update(url, "utf8").digest("hex");
  return `c_${digest.slice(0, CARD_ID_HEX_LENGTH)}`;
}
