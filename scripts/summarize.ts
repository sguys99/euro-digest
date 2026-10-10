/**
 * 일일 브리핑 단계 단독 실행 진입점 — 전날(KST) 경기 정형 데이터로 한국어 브리핑 "오늘의 5줄"을
 * Message Batches로 작성한다 (CLAUDE.md §6.2, PRD §15 D24). 뉴스 기사(제목·설명 포함)는 LLM에 보내지 않는다(D23).
 * 파일명·`npm run summarize` 이름은 유지한다(프롬프트 `configs/prompts/summarize.md`와 같은 이유 — PRD §9.2).
 * collect가 이 단계를 함수로 호출하게 되며, 이 파일은 단계만 따로 돌려 볼 때 쓴다.
 */
import { todo } from "./lib/todo";

todo(
  "npm run summarize",
  "M1-C(M1-19~M1-23·M1-45)",
  "브리핑 입력 빌더·템플릿 문장·프롬프트 v0.1·Batches 제출/06:50 템플릿 폴백·출력 검증·고유명사 치환·비용 가드·사실성 검사",
);
