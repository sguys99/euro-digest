/**
 * `npm run eval:prompt` 진입점 — 골든셋 회귀 평가 (CLAUDE.md §6.3).
 * 프롬프트 수정 전후 출력 diff·사실성 검사 결과를 비교한다. 실제 LLM 호출(소량) → runs-dev.json 기록.
 */
import { todo } from "./lib/todo";

todo(
  "npm run eval:prompt",
  "M1-24",
  "fixtures/llm/golden/ 대표 기사 10건으로 이전/이후 출력 diff",
);
