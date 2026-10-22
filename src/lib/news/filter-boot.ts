/**
 * 뉴스 필터 첫 화면 — 깜빡임 없는 인라인 스크립트 2개 (PRD FR-32 "새로고침·공유 시 필터 유지", DESIGN.md §6.2 첫 로드 모션 없음, plan M1-33)
 *
 * 주소에 필터 쿼리(`?comp=epl&cat=transfer`)가 있는 첫 화면은 정적 HTML(전체 카드)을 받는다. 하이드레이션(초기 JS 약 140KB) 뒤에
 * 섬이 거르면 전체 카드가 보였다 사라지고(깜빡임) 아래 내용이 밀린다(CLS). 그래서 HTML을 읽는 도중 동기로 실행되는 인라인 스크립트가
 * 첫 페인트 전에 같은 결과를 그린다(테마 초기 스크립트 src/lib/theme.ts와 같은 방식 — 첫 로드에는 모션이 없다, D31).
 *
 * 1. `NEWS_FILTER_PENDING_SCRIPT` — 목차 열(`<nav aria-label="뉴스 필터">`) 맨 앞, 필터 범위의 어느 요소보다 먼저. 쿼리에 필터 이름이
 *    하나라도 있으면 `<html data-nf-pending>`을 단다 → globals.css가 필터 범위(`[data-nf-scope]` — 목차 · 뉴스 섹션)를 그리지 않고
 *    전환을 끈다. HTML이 나눠 도착해 파서가 피드 중간에서 쉬는 사이 브라우저가 칠하더라도 거르기 전 카드가 보이지 않는다.
 *    안전망으로 `DOMContentLoaded`에서도 보류를 푼다(부트가 없는 페이지에서 필터 범위가 계속 숨지 않게).
 * 2. `NEWS_FILTER_BOOT_SCRIPT` — 피드·0건 빈 상태 바로 뒤. 설정 JSON(`#news-filter-config`)과 `location.search`로 상태를 읽고
 *    src/lib/news/filter-dom.ts `applyFilterToDom` + `revealPressedChip`과 **같은 결과**를 그린 뒤 `data-nf-pending`을 지운다(실패해도
 *    `finally`에서 지운다 — 필터가 안 걸린 전체 피드가 보이는 쪽으로 물러난다). 지우기 전에 머리 스타일을 확정해 첫 로드에 색 면 전환이
 *    돌지 않게 한다. 섬도 마운트할 때 한 번 더 지운다.
 *
 * 로직을 바꾸면 filter.ts `parseFilterQuery`·filter-dom.ts와 함께 고친다 — tests/news-filter-dom.test.tsx가 실제 서버 렌더 DOM에
 * 쿼리 여러 개로 이 문자열과 TS 함수를 각각 돌려 DOM이 같은지 본다. 외부 입력은 쿼리 값뿐이고, 설정 JSON에 있는 키만 받는다
 * (`hasOwnProperty` — 원형 이름은 값이 아니다). 글자는 `textContent`로만 쓴다. 문법은 ES5 + `URLSearchParams`·`closest`·
 * `toggleAttribute`(지원 브라우저 전부).
 */
import {
  ALL_CATEGORIES,
  FILTER_CONFIG_ID,
  NF,
  REVEAL_CHIP_SELECTOR,
} from "./filter-dom";
import { FILTER_PARAMS } from "./filter";

const has = "function(o,k){return Object.prototype.hasOwnProperty.call(o,k)}";

/**
 * 1. 쿼리에 필터 이름이 있으면 `<html data-nf-pending>`. 안전망 — 부트 스크립트가 없거나 실행되지 않은 페이지(목차만 실린 경우 등)에서도
 * 문서를 다 읽으면(`DOMContentLoaded`) 보류를 푼다(필터 범위가 계속 보이지 않는 일이 없게). 정상 흐름에서는 부트가 먼저 지운다.
 */
export const NEWS_FILTER_PENDING_SCRIPT =
  "(function(){try{var q=new URLSearchParams(location.search),r=document.documentElement;" +
  `if(${FILTER_PARAMS.map((p) => `q.has('${p}')`).join("||")}){` +
  `r.setAttribute('${NF.pending}','');` +
  `document.addEventListener('DOMContentLoaded',function(){r.removeAttribute('${NF.pending}')})}}catch(e){}})();`;

/** 2. 첫 페인트 전 필터 그리기(filter-dom.ts와 같은 결과) */
export const NEWS_FILTER_BOOT_SCRIPT = [
  "(function(){var d=document;try{",
  `var el=d.getElementById('${FILTER_CONFIG_ID}');if(!el)return;`,
  "var c=JSON.parse(el.textContent||'');",
  `var h=${has};`,
  "var q=new URLSearchParams(location.search);",
  "var cp=(q.get('comp')||'').toUpperCase(),ct=(q.get('cat')||'').toLowerCase(),tm=(q.get('team')||'').toLowerCase();",
  "var s={comp:h(c.comps,cp)?cp:null,cat:h(c.cats,ct)?ct:null,team:h(c.teams,tm)?tm:null,kr:q.get('kr')==='1'};",
  // 필터가 없으면 서버 HTML이 이미 그 상태다
  "if(s.comp===null&&s.cat===null&&s.team===null&&!s.kr)return;",
  "var w=function(e,n){return (e.getAttribute(n)||'').split(' ')};",
  "var i,e,n=0,ok,t,li,hide,a,k,v,p;",
  // 카드
  `var cs=d.querySelectorAll('[${NF.card}]');`,
  "for(i=0;i<cs.length;i++){e=cs[i];",
  `ok=(s.cat===null||e.getAttribute('${NF.cat}')===s.cat)&&(s.comp===null||w(e,'${NF.comps}').indexOf(s.comp)>-1)&&`,
  `(s.team===null||w(e,'${NF.teams}').indexOf(s.team)>-1)&&(!s.kr||e.hasAttribute('${NF.kr}'));`,
  "e.hidden=!ok;if(ok)n++}",
  // 연결 줄 — 짝 카드가 숨으면 줄도 숨기고 카드 아래 여백을 되돌린다
  `var ls=d.querySelectorAll('[${NF.link}]');`,
  "for(i=0;i<ls.length;i++){e=ls[i];t=d.getElementById((e.getAttribute('href')||'').slice(1));",
  `li=t&&t.closest('[${NF.card}]');hide=!t||!!(li&&li.hidden);e.hidden=hide;`,
  "a=e.closest('article');if(a)a.toggleAttribute('data-paired',!hide)}",
  // 머리기사 — 필터 결과에는 없다
  `var ld=d.querySelectorAll('[${NF.lead}]');for(i=0;i<ld.length;i++)ld[i].removeAttribute('data-lead');`,
  // 칩·목차 행
  `var bs=d.querySelectorAll('[${NF.key}]');`,
  "for(i=0;i<bs.length;i++){e=bs[i];",
  `k=e.getAttribute('${NF.key}');v=e.getAttribute('${NF.value}');`,
  `p=k==='cat'?v===(s.cat||'${ALL_CATEGORIES}'):k==='comp'?v===s.comp:k==='kr'&&s.kr;`,
  `e.setAttribute('aria-pressed',p?'true':'false');if(e.hasAttribute('${NF.zero}'))e.disabled=!p}`,
  // 피드 머리 — 대회 색 면 · 팀 상자
  `var hd=d.querySelector('[${NF.head}]');`,
  "if(hd){if(s.comp)hd.setAttribute('data-comp',s.comp);else hd.removeAttribute('data-comp');hd.toggleAttribute('data-team',s.team!==null)}",
  "var x=function(sel,txt){var o=d.querySelector(sel);if(o)o.textContent=txt};",
  `x('[${NF.compBadge}]',s.comp?c.comps[s.comp].s:'');`,
  `x('[${NF.teamBadge}]',s.team?c.teams[s.team]:'');`,
  `x('[${NF.count}]',String(n));`,
  "var ps=[];if(s.comp)ps.push(c.comps[s.comp].n);if(s.team)ps.push(c.teams[s.team]);if(s.cat)ps.push(c.cats[s.cat]);if(s.kr)ps.push(c.k);",
  `x('[${NF.desc}]',ps.length?ps.join(' · '):c.d);`,
  `var em=d.querySelector('[${NF.empty}]');if(em)em.hidden=n!==0;`,
  // 375 칩 줄 — 눌린 칩이 가로 스크롤 밖이면 칩 줄만 민다
  `var row=d.querySelector('[${NF.chips}]'),ch,pd,rr,cr;`,
  `if(row&&row.clientWidth){ch=row.querySelector('${REVEAL_CHIP_SELECTOR}');if(ch){`,
  "pd=parseFloat(getComputedStyle(row).paddingLeft)||0;rr=row.getBoundingClientRect();cr=ch.getBoundingClientRect();",
  "if(cr.left<rr.left+pd)row.scrollLeft-=rr.left+pd-cr.left;else if(cr.right>rr.right-pd)row.scrollLeft+=cr.right-(rr.right-pd)}}",
  // 보류를 풀기 전에(전환이 꺼진 채) 바뀐 머리 스타일을 확정한다 — 확정하지 않으면 Safari·Firefox가 보류 해제 뒤 첫 스타일 계산에서
  // 기본 머리 → 색 면 전환(200ms)을 돌릴 수 있다(첫 로드 모션 없음, DESIGN §6.2)
  "if(hd)getComputedStyle(hd).backgroundColor;",
  `}catch(err){}finally{d.documentElement.removeAttribute('${NF.pending}')}})();`,
].join("");
