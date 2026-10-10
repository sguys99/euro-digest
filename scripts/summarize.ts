/**
 * 요약 단계 단독 실행 진입점 — 정제된 외국어 클러스터를 Message Batches로 요약·분류 (CLAUDE.md §6.2).
 * collect가 이 단계를 함수로 호출하게 되며, 이 파일은 단계만 따로 돌려 볼 때 쓴다.
 */
import { todo } from "./lib/todo";

todo(
  "npm run summarize",
  "M1-C(M1-17~M1-23)",
  "프롬프트 v0.1·배치 구성·Batches 제출/폴백·출력 검증·고유명사 치환·비용 가드·사실성 검사",
);
