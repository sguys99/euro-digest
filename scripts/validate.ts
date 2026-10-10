/**
 * `npm run validate` 진입점 — configs·data 스키마 검증 + 발행 검증 게이트 (CLAUDE.md §5).
 * 실패하면 exit 1로 CI·collect.yml을 멈추게 된다. 스텁 단계에서는 TODO만 출력하고 exit 0.
 */
import { todo } from "./lib/todo";

todo(
  "npm run validate",
  "M0-17(configs 스키마 1차)·M1-25(발행 검증 게이트)",
  "configs/*·data/* zod 검증, 카드 수 하한·링크 형식·takedowns 제외",
);
