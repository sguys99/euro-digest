/**
 * `npm run check:bundle` 진입점 — out/ 기준 번들 크기 예산 + 비밀값 grep (CLAUDE.md §5, NFR-07).
 * 초기 JS 예산은 PRD §15 D21(gzip 160KB)을 따른다. 스텁 단계에서는 TODO만 출력하고 exit 0.
 */
import { todo } from "./lib/todo";

todo(
  "npm run check:bundle",
  "M0-12(번들 크기 예산, ci.yml 연결)·M5-08(비밀값 grep)",
  "out/ 초기 JS gzip 크기 예산 검사 + 번들·산출물 비밀값 grep",
);
