/**
 * '내 팀 소식' 첫 화면 — 첫 페인트 전 인라인 스크립트 (PRD FR-112, plan M4-08)
 *
 * 섹션(src/components/my/my-news.tsx) 바로 뒤에 둔다. HTML을 읽는 도중 동기로 실행돼 섹션 아래 내용이 그려지기 전에 맞는 행만 보이게 한다
 * (뉴스 필터 부트 src/lib/news/filter-boot.ts와 같은 방식 — 첫 로드 모션 없음). 팔로우는 src/lib/follow-boot.ts로 읽고, 그리기는
 * src/lib/my-news-dom.ts `applyMyNews`와 **같은 결과**다(tests/my-news-dom.test.tsx가 서버 렌더 DOM에 두 쪽을 각각 돌려 대조).
 * 글자는 `textContent`로만 쓴다. 실패하면 섹션은 서버 HTML 그대로(숨김) — 섬이 하이드레이션 뒤 다시 그린다.
 */
import { READ_FOLLOW_KEYS_ES5 } from "./follow-boot";
import { MN, MN_WHY_SEPARATOR } from "./my-news-dom";

export const MY_NEWS_BOOT_SCRIPT = [
  "(function(){try{var d=document;",
  `var k=(${READ_FOLLOW_KEYS_ES5})();`,
  "var h=function(x){return Object.prototype.hasOwnProperty.call(k,x)&&!!k[x]};",
  `var ss=d.querySelectorAll('[${MN.section}]'),i,j,m,sec,lim,c,rs,r,p,ns,w,cs;`,
  "for(i=0;i<ss.length;i++){sec=ss[i];lim=Number(sec.getAttribute('" +
    MN.limit +
    "'))||0;c=0;",
  `rs=sec.querySelectorAll('[${MN.row}]');`,
  "for(j=0;j<rs.length;j++){r=rs[j];ns=[];",
  `try{p=JSON.parse(r.getAttribute('${MN.keys}')||'[]')}catch(e){p=[]}`,
  "if(Object.prototype.toString.call(p)!=='[object Array]')p=[];",
  "for(m=0;m<p.length;m++){if(Object.prototype.toString.call(p[m])==='[object Array]'&&typeof p[m][0]==='string'&&typeof p[m][1]==='string'&&h(p[m][0]))ns.push(p[m][1])}",
  "if(ns.length)c++;",
  "var sh=ns.length>0&&c<=lim;r.hidden=!sh;",
  `if(sh){w=r.querySelector('[${MN.why}]');if(w)w.textContent=ns.join('${MN_WHY_SEPARATOR}')}}`,
  `cs=sec.querySelectorAll('[${MN.count}]');for(j=0;j<cs.length;j++)cs[j].textContent=String(c);`,
  "sec.hidden=c===0}",
  "}catch(err){}})();",
].join("");
