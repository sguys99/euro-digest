/**
 * 첫 페인트 전 인라인 스크립트가 쓰는 팔로우 읽기 — ES5 문자열 (PRD FR-112, plan M4-08)
 *
 * 홈 · `/my`의 '내 팀 소식'(src/lib/my-news-boot.ts)과 뉴스 피드 '내 팀만' 필터(src/lib/news/filter-boot.ts)는 하이드레이션 전에 팔로우를 알아야
 * 자리가 밀리지 않는다(CLS). 그래서 인라인 스크립트가 `localStorage`의 `ed-follow`를 직접 읽는다. 규칙은 src/lib/follow.ts `parseFollows`와 같다
 * (객체 · `v` 1 · 목록마다 형식이 맞는 slug를 중복 없이 앞에서부터 한도까지) — tests/follow-boot.test.ts가 같은 입력으로 두 결과를 대조한다.
 * 결과는 팔로우 키 객체(`{"t:arsenal":1,"p:kim-min-jae":1}` — src/lib/my-view.ts `followKey`와 같은 키). 저장소가 막혔거나 깨졌으면 빈 객체.
 */
import {
  FOLLOW_LIMITS,
  FOLLOW_SLUG_MAX_LENGTH,
  FOLLOW_SLUG_PATTERN,
  FOLLOW_STORAGE_KEY,
  FOLLOW_VERSION,
} from "./follow";
import { FOLLOW_KEY_PREFIX } from "./my-view";

/** `function(){…; return keys}` — 인라인 스크립트 안에서 `(${READ_FOLLOW_KEYS_ES5})()`로 부른다 */
export const READ_FOLLOW_KEYS_ES5 = [
  "function(){var k={},r=null;",
  `try{r=JSON.parse(window.localStorage.getItem('${FOLLOW_STORAGE_KEY}'))}catch(e){}`,
  `if(!r||typeof r!=='object'||Object.prototype.toString.call(r)==='[object Array]'||r.v!==${FOLLOW_VERSION})return k;`,
  `var re=${FOLLOW_SLUG_PATTERN.toString()};`,
  "var g=function(a,p,m){if(Object.prototype.toString.call(a)!=='[object Array]')return;var n=0,i,x,s={};",
  `for(i=0;i<a.length&&n<m;i++){x=a[i];if(typeof x==='string'&&x.length<=${FOLLOW_SLUG_MAX_LENGTH}&&re.test(x)&&!Object.prototype.hasOwnProperty.call(s,x)){s[x]=1;k[p+x]=1;n++}}};`,
  `g(r.teams,'${FOLLOW_KEY_PREFIX.teams}',${FOLLOW_LIMITS.teams});g(r.players,'${FOLLOW_KEY_PREFIX.players}',${FOLLOW_LIMITS.players});`,
  "return k}",
].join("");
