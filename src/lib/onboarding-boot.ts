/**
 * 온보딩 진입 줄 — 첫 페인트 전 인라인 스크립트 (PRD FR-113, plan M4-09 — D2 이월 'CLS 측정' 결과, DECISIONS D2 §9)
 *
 * 진입 줄(서버 HTML은 `hidden`) 바로 뒤에 둔다. HTML을 읽는 도중 동기로 실행돼, 진입 줄 아래 내용이 그려지기 전에 보일지를 정한다
 * (하이드레이션 뒤에 펼치면 아래 지면이 한 줄만큼 밀린다 — 실측 비교는 DECISIONS D2 §9). 규칙은 src/lib/onboarding.ts
 * `shouldOfferOnboarding`과 같다 — 팔로우 0(src/lib/follow-boot.ts — `parseFollows`와 동치) + 기록(`ed-onboarding`)이 `done` · `skipped`가 아님.
 * 저장소가 막혔으면 팔로우 · 기록 모두 없음으로 읽어 보인다(섬과 같은 판정). 실패하면 서버 HTML 그대로(숨김) — 섬이 하이드레이션 뒤 다시 정한다.
 * tests/onboarding.test.ts가 같은 입력으로 순수 함수와 대조한다.
 */
import { READ_FOLLOW_KEYS_ES5 } from "./follow-boot";
import {
  ONBOARDING_ENTRY_ID,
  ONBOARDING_MARKS,
  ONBOARDING_STORAGE_KEY,
} from "./onboarding";

export const ONBOARDING_BOOT_SCRIPT = [
  "(function(){try{",
  `var e=document.getElementById('${ONBOARDING_ENTRY_ID}');if(!e)return;`,
  `var m=null;try{m=window.localStorage.getItem('${ONBOARDING_STORAGE_KEY}')}catch(x){}`,
  `if(${ONBOARDING_MARKS.map((v) => `m==='${v}'`).join("||")})return;`,
  `var k=(${READ_FOLLOW_KEYS_ES5})(),i;`,
  "for(i in k){if(Object.prototype.hasOwnProperty.call(k,i))return}",
  "e.hidden=false",
  "}catch(err){}})();",
].join("");
