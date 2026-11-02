/**
 * `/my` 빈 상태 첫 화면 — 첫 페인트 전 인라인 스크립트 (PRD FR-110 · DESIGN §9.3 D2 "`/my` 틀", M4-16)
 *
 * 다음 경기 · 최근 결과 섬(src/components/my/my-board.tsx)은 하이드레이션 전에는 저장소를 모르므로 교정쇄(입장권 + 일정 행 — 높다)를 그린다.
 * 팔로우가 0이면 하이드레이션 뒤 빈 상태(윤곽 '0' — 낮다)로 바뀌며 아래 관리 열이 한 번에 올라갔다(375 첫 로드 CLS 0.27 · LCP = 빈 상태 문단
 * 4.4초 — M4-16 실측). 이 스크립트가 HTML을 읽는 도중 팔로우를 읽어(src/lib/follow-boot.ts — 섬과 같은 정리 규칙) 0이면 `<html data-my-empty>`를
 * 단다 → CSS 변형 `my-empty:`가 서버 HTML의 빈 상태를 보이고 교정쇄를 숨긴다. 하이드레이션 뒤 섬이 같은 빈 상태를 그린다(모양 같음 — 이동 0).
 * 저장소를 못 읽으면 섬도 빈 팔로우(메모리 폴백)라 결과가 같다. 실패하면 속성 없이 원래대로(교정쇄 → 빈 상태).
 */
import { READ_FOLLOW_KEYS_ES5 } from "./follow-boot";

/** `<html>` 속성 — globals.css `@custom-variant my-empty` */
export const MY_EMPTY_ATTR = "data-my-empty";

export const MY_EMPTY_BOOT_SCRIPT = [
  "(function(){try{",
  `var k=(${READ_FOLLOW_KEYS_ES5})();`,
  "for(var x in k)if(Object.prototype.hasOwnProperty.call(k,x))return;",
  `document.documentElement.setAttribute('${MY_EMPTY_ATTR}','')`,
  "}catch(e){}})();",
].join("");
