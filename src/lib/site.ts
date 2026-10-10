/**
 * 사이트 공용 상수 — 화면(src/)과 파이프라인(scripts/)이 같은 값을 쓰도록 한 곳에 둔다.
 * scripts/에서도 `@/lib/site`로 import한다(tsx가 tsconfig paths를 해석, CLAUDE.md §5).
 *
 * 환경에 따라 달라지는 값(SITE_URL·BASE_PATH 등)은 여기 두지 않는다 → src/lib/paths.ts(M0-19).
 */

/** 서비스 이름(한국어). 상표 확인(U-09, plan §14 B6) 결과에 따라 바뀔 수 있다. */
export const SITE_NAME = "유로 다이제스트";

/** 한 줄 소개. 메타 description 등에 쓴다. */
export const SITE_TAGLINE = "매일 아침 07:00, 유럽 축구 소식을 한국어 3줄로.";

/**
 * 화면 표시 시간대(IANA). 저장은 UTC, 표시는 KST(CLAUDE.md §8).
 * 변환 로직은 src/lib/time.ts(M0-18)에서만 구현한다 — 이 파일에는 값만 둔다.
 */
export const DISPLAY_TIME_ZONE = "Asia/Seoul";
