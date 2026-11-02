/**
 * `/my` 가져오기 확인 띠 자리 — 첫 페인트 전 인라인 스크립트 (PRD FR-114, plan M4-10, DECISIONS D2 §9)
 *
 * 확인 띠(src/components/my/my-import-band.tsx)는 주소에 `?t=…&p=…`가 있을 때만 하이드레이션 뒤 지연 조각으로 그려진다. 그대로면 띠가
 * 늦게 끼어들며 아래 다음 경기 · 최근 결과를 밀어낸다(CLS 0.09~0.23 — 실측). 그래서 이 스크립트가 HTML을 읽는 도중 **띠가 뜰지와 높이 재료**를
 * 셈해 자리(`my-import.tsx` `SLOT` — 띠와 같은 면 · 패딩)를 먼저 연다:
 * - `<html data-my-import>` + `--mi-r2` · `--mi-r3` · `--mi-r4`(미리보기 칸 2 · 3 · 4열의 줄 수) · `--mi-n`(안내 줄 수 — 모르는 항목 · 저장 차단).
 * - 띠가 뜨지 않는 경우(쿼리 없음 · 들어올 것 없음 · 덮어써도 같음)는 자리를 열지 않는다 — 규칙은 src/lib/follow-share.ts
 *   `planFollowImport`와 같다(tests/my-import-boot.test.ts가 같은 입력으로 대조).
 * 팔로우는 src/lib/follow-boot.ts(`parseFollows`와 같은 규칙)로, 아는 slug는 페이지 디렉터리(`#my-directory`)로 읽는다. 실패하면 아무것도 하지 않는다.
 */
import {
  FOLLOW_LIMITS,
  FOLLOW_QUERY_PARAMS,
  FOLLOW_SLUG_MAX_LENGTH,
  FOLLOW_SLUG_PATTERN,
} from "./follow";
import { READ_FOLLOW_KEYS_ES5 } from "./follow-boot";
import { FOLLOW_KEY_PREFIX, MY_DIRECTORY_ID, MY_IMPORT_ATTR } from "./my-view";
import { STORAGE_PROBE_KEY } from "./safe-storage";

/** 미리보기 열 수(1023 이하 · 1024 이상 · 1280 이상 — 띠의 `grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`, 브레이크포인트는 lg · xl만 — DESIGN §7.1) */
export const MY_IMPORT_PREVIEW_COLUMNS = [2, 3, 4] as const;

const KINDS = [
  [
    FOLLOW_QUERY_PARAMS.teams,
    "teams",
    FOLLOW_KEY_PREFIX.teams,
    FOLLOW_LIMITS.teams,
  ],
  [
    FOLLOW_QUERY_PARAMS.players,
    "players",
    FOLLOW_KEY_PREFIX.players,
    FOLLOW_LIMITS.players,
  ],
] as const;

export const MY_IMPORT_BOOT_SCRIPT = [
  "(function(){try{var d=document,q=new URLSearchParams(location.search);",
  `var P=${JSON.stringify(KINDS)};`,
  "if(!q.has(P[0][0])&&!q.has(P[1][0]))return;",
  `var dir=JSON.parse(d.getElementById('${MY_DIRECTORY_ID}').textContent);`,
  `var k=(${READ_FOLLOW_KEYS_ES5})();`,
  `var re=${FOLLOW_SLUG_PATTERN.toString()};`,
  "var own=function(o,x){return !!o&&Object.prototype.hasOwnProperty.call(o,x)};",
  "var n=0,u=0,same=1,i,j,m,a,v,x,tk,inc,c;",
  "for(i=0;i<P.length;i++){a=q.getAll(P[i][0]);tk=[];",
  "for(j=0;j<a.length;j++){v=a[j].split(',');for(m=0;m<v.length;m++){x=v[m].trim().toLowerCase();if(x&&tk.indexOf(x)<0)tk.push(x)}}",
  `inc=[];for(j=0;j<tk.length;j++){x=tk[j];if(x.length<=${FOLLOW_SLUG_MAX_LENGTH}&&re.test(x)&&own(dir[P[i][1]],x))inc.push(x)}`,
  "u+=tk.length-inc.length;n+=inc.length;",
  "c=0;for(x in k)if(own(k,x)&&x.indexOf(P[i][2])===0)c++;",
  "if(inc.length>P[i][3]||inc.length!==c)same=0;else for(j=0;j<inc.length;j++)if(!own(k,P[i][2]+inc[j]))same=0}",
  "if(!n||same)return;",
  `var w=1;try{localStorage.setItem('${STORAGE_PROBE_KEY}','1');localStorage.removeItem('${STORAGE_PROBE_KEY}')}catch(e){w=0}`,
  "var h=d.documentElement,s=h.style;",
  `var C=${JSON.stringify(MY_IMPORT_PREVIEW_COLUMNS)};`,
  "for(i=0;i<C.length;i++)s.setProperty('--mi-r'+C[i],String(Math.ceil(n/C[i])));",
  "s.setProperty('--mi-n',String((u>0?1:0)+(w?0:1)));",
  `h.setAttribute('${MY_IMPORT_ATTR}','')`,
  "}catch(e){}})();",
].join("");
