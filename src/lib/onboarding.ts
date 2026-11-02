/**
 * 첫 방문 온보딩 — 표시 조건 · 단계 상태 · 자료 형식 (PRD FR-113, §15 D64 ⑥ · D67 ②, DESIGN §9.3 D2 "온보딩", plan M4-09)
 *
 * 순수 모듈(DOM · fs · zod 없음 — 타입만 import). 이 파일은 홈 진입 줄 섬(초기 JS)이 쓰는 **표시 조건만** 둔다 — 단계 상태 · 자료 형식은
 * src/lib/onboarding-steps.ts(지연 청크 전용 — 같은 모듈에 두면 지연 청크가 쓰는 함수까지 홈 초기 JS에 실린다).
 *
 * **표시 조건**(`shouldOfferOnboarding`): 팔로우 0 + 온보딩 기록(`ed-onboarding`) 없음. 건너뛰기(진입 줄 · 펼친 뒤 "건너뛰기") · 완료가 기록을 남기고
 * (`skipped` · `done`), 기록이 있으면 팔로우가 다시 0이 돼도 띄우지 않는다(첫 방문 한 번 — DECISIONS D2 §9). 저장소가 막힌 환경은 기록을
 * 못 남겨 방문마다 다시 보인다(그 방문 동안은 메모리 폴백이 닫힘을 기억 — src/lib/safe-storage.ts).
 * 판정은 페이지를 연 때 한 번이다 — 온보딩 안에서 팔로우가 생겨도 펼친 단계가 사라지지 않는다.
 *
 * **단계**: 0 리그 → 1 팀(최대 5 — 팔로우 한도와 같다) → 2 한국 선수(최대 5) → 완료(요약). 팀 · 선수는 고르는 즉시 팔로우된다(팔로우 버튼과
 * 같은 저장소 — 건너뛰어도 고른 것은 남는다). 리그는 팀 목록을 거르는 보기 상태라 저장하지 않는다.
 *
 * **자료**(`OnboardingData`): 빌드(build-feeds)가 `/my/data/onboarding.json`으로 쓰고, "시작"을 누르면 받는다(홈 HTML에 싣지 않는다 —
 * 첫 방문 한 번만 쓰는 자료). 짧은 키 — 팀 항목은 `/my` 디렉터리(`MyTeamEntry`)와 같은 키 + 순위 · 한국 선수 소속.
 */
import type { FollowLists } from "@/lib/follow";

// ─── 표시 조건 ──────────────────────────────────────────────────────────────

/** 온보딩 기록 키(DESIGN §8 `ed-` 접두) */
export const ONBOARDING_STORAGE_KEY = "ed-onboarding";

/** 기록 값 — 완료 · 건너뜀 */
export const ONBOARDING_MARKS = ["done", "skipped"] as const;
export type OnboardingMark = (typeof ONBOARDING_MARKS)[number];

/** 진입 줄 요소 id(첫 페인트 전 스크립트가 찾는다 — src/lib/onboarding-boot.ts) */
export const ONBOARDING_ENTRY_ID = "ob-entry";

/** 저장 문자열 → 기록. 모르는 값 · null은 기록 없음 */
export function parseOnboardingMark(
  text: string | null,
): OnboardingMark | null {
  return (ONBOARDING_MARKS as readonly string[]).includes(text ?? "")
    ? (text as OnboardingMark)
    : null;
}

/** 진입 줄을 보일지 — 팔로우 0 + 기록 없음 */
export function shouldOfferOnboarding(
  follows: FollowLists,
  mark: OnboardingMark | null,
): boolean {
  return (
    mark === null && follows.teams.length === 0 && follows.players.length === 0
  );
}
