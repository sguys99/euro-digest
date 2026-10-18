/**
 * `/about` 절(앵커) 목록 — 차례·뒤표지 링크·"AI 작성" 라벨이 같은 앵커를 쓴다 (PRD FR-140·FR-35·FR-142, DESIGN §9.3, M1-36)
 *
 * 런타임 의존성은 경로 헬퍼뿐이라 어디서 import해도 된다(클라이언트 섬 포함 — time.ts 같은 큰 모듈을 끌어오지 않는다).
 * 앵커 id는 공유 링크가 되므로 바꾸지 않는다(뒤표지·브리핑 "AI 작성" 라벨·이슈 양식 안내가 가리킨다).
 */
import { routes } from "./paths";

export const ABOUT_SECTIONS = [
  { id: "schedule", title: "발행 시각", runningHead: "KICK-OFF" },
  { id: "sources", title: "출처·저작권 정책", runningHead: "SOURCES" },
  { id: "tier", title: "출처 Tier", runningHead: "TIERS" },
  { id: "ai", title: "AI 작성 고지", runningHead: "AI NOTICE" },
  { id: "data", title: "데이터 출처", runningHead: "MATCH DATA" },
  { id: "contact", title: "삭제·정정 요청", runningHead: "CONTACT" },
] as const;

export type AboutSectionId = (typeof ABOUT_SECTIONS)[number]["id"];

/** `/about/` 또는 `/about/#절` 라우트(basePath 없음 — `next/link` href) */
export function aboutHref(section?: AboutSectionId): string {
  return section ? `${routes.about()}#${section}` : routes.about();
}
