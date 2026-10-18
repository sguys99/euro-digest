/**
 * 사이트 공용 상수 — 화면(src/)과 파이프라인(scripts/)이 같은 값을 쓰도록 한 곳에 둔다.
 * scripts/에서도 `@/lib/site`로 import한다(tsx가 tsconfig paths를 해석, CLAUDE.md §5).
 *
 * 환경에 따라 달라지는 값(SITE_URL·BASE_PATH 등)은 여기 두지 않는다 → src/lib/paths.ts(M0-19).
 */

/** 서비스 이름(한국어). 상표 확인(U-09, plan §14 B6) 결과에 따라 바뀔 수 있다. */
export const SITE_NAME = "유로 다이제스트";

/**
 * 한 줄 소개. 메타 description 등에 쓴다.
 * 2026-10-10 사용자 결정으로 "한국어 3줄" 문구를 바꿨다(PRD §15 D23·D24 — 뉴스 요약 없음). 최종 다듬기는 D0 브랜드 작업에서.
 * 같은 날 발행 시각이 계절별(유럽 서머타임 07:00 · 표준시 07:30 KST)로 바뀌어(PRD §15 D26) 시각 약속("07:00 KST")을 뺐다.
 */
export const SITE_TAGLINE = "매일 아침, 밤사이 유럽 축구를 한눈에.";

/**
 * GitHub 저장소 주소 — 푸터 저장소 링크(FR-142)·이슈 폼 링크(FR-36, src/lib/paths.ts)가 쓴다.
 * 저장소 이름이 바뀌면(plan §14 B6) 여기와 BASE_PATH 기본값(src/lib/paths.ts)을 함께 고친다.
 */
export const REPO_URL = "https://github.com/sguys99/euro-digest";

/**
 * football-data.org 약관 7.1 필수 표기 — 영문 원문 그대로 둔다(번역·대소문자 변경 금지, PRD FR-45·FR-140·FR-142, D27).
 * 뒤표지(푸터)·`/about`·오늘의 5줄 데이터 출처 줄이 같은 문자열을 쓴다.
 */
export const FOOTBALL_DATA_ATTRIBUTION =
  "Football data provided by the Football-Data.org API";

/**
 * 창간일(KST 발행일) — 마스트헤드·뒤표지의 "제 N호"(N = 발행일 − 창간일 + 1, 결호가 나도 날짜만큼 증가, 빌드 시 계산 —
 * PRD §15 D29·§14.1, DESIGN §9.3). 2026-10-18 사용자 결정: M1 첫 공개일(M1-01 첫 발행 2026-10-12)을 제 1호로 한다.
 * 계산은 src/lib/issue.ts `issueNumber`.
 */
export const FIRST_ISSUE_DATE = "2026-10-12";

/**
 * 화면 표시 시간대(IANA). 저장은 UTC, 표시는 KST(CLAUDE.md §8).
 * 변환 로직은 src/lib/time.ts(M0-18)에서만 구현한다 — 이 파일에는 값만 둔다.
 */
export const DISPLAY_TIME_ZONE = "Asia/Seoul";
