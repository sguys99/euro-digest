/**
 * 일일 브리핑 "오늘의 5줄" 상한 상수 — zod 없는 모듈 (PRD FR-23, D40 ⑤, plan M1-32 리뷰)
 *
 * 스키마(src/lib/schema/brief.ts)가 이 값으로 검증하고 그대로 다시 내보낸다(파이프라인은 지금처럼 `@/lib/schema`에서 가져온다).
 * 화면 모델(src/lib/brief-view.ts)은 여기서 가져온다 — 나중에 클라이언트 섬(결과 가림 M4-15 등)이 화면 모델을 import해도
 * zod가 번들에 들어가지 않게 값만 따로 둔다(src/lib/news/feed-view.ts와 같은 원칙).
 */

/** 하루 브리핑 줄 수 상한 — "오늘의 5줄"(FR-23) */
export const BRIEF_MAX_LINES = 5;
/** 줄 길이 상한(JS 문자열 길이 — 한글 음절 1자) — D40 ⑤. 목표는 60자 내외(FR-23) */
export const BRIEF_LINE_MAX = 80;
/** 줄 하나의 근거 id 상한 — M0-30 출력 스키마 `r`와 같다 */
export const BRIEF_REFS_MAX = 6;
