// D3 시안 공용 — 실데이터 로드 · 원자 · 셸(티켓 마스트헤드 · 뒤표지 · 하단 탭) · 견본 틀 · 페이지 조립
// 입력: docs/design/d3/data/d3-data.json(실데이터만 — build-data.ts가 저장소 파일에서 계산). 문구 생성·LLM 호출 0.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../../..');
export const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/design/d3/data/d3-data.json'), 'utf8'));
export const BASE_CSS = fs.readFileSync(path.join(HERE, 'base.css'), 'utf8');

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const n = (v) => `<span class="n">${esc(v)}</span>`;
export const COMP = Object.fromEntries(D.competitions.map((c) => [c.id, c]));
export const TABC = { EPL: 'epl', LALIGA: 'laliga', SERIEA: 'seriea', BUNDESLIGA: 'bundesliga', LIGUE1: 'ligue1', UCL: 'ucl' };
export const TEAM = Object.fromEntries(D.teams.map((t) => [t.slug, t]));
export const ST = D.status;

/* 고정 값 — 아이콘·OG는 테마를 따르지 않는다. 모두 기존 토큰의 한 테마 값(DESIGN §2)이다. 새 색 0 */
export const TOK = {
  paperL: '#F3F0EA', paper2L: '#E8E4DB', inkL: '#14213D', ink2L: '#4A5670', ink3L: '#727886', ruleL: '#CFCFCE', hatchL: '#DFDDDA',
  accentL: '#B32F25', accentTextL: '#A92B22',
  ticketL: '#14213D', ticketFgL: '#F3F0EA', ticketFg2L: '#C2C2C4',
  paperD: '#0E1626', inkD: '#F2EFE8', accentD: '#FF7A6E',
  ticketD: '#9E2F28', ticketFgD: '#F2EFE8', ticketFg2D: '#EADCD5',
  compL: { EPL: '#3D1E5C', LALIGA: '#7F5300', SERIEA: '#0A6390', BUNDESLIGA: '#A8122B', LIGUE1: '#2A7035', UCL: '#4A5263' },
  compD: { EPL: '#C7A8F2', LALIGA: '#F2C14E', SERIEA: '#6CC6F2', BUNDESLIGA: '#F45D7D', LIGUE1: '#8FD18A', UCL: '#C5CBD8' },
};

/* 견본 틀 전용 색(기기 홈 화면 · 브라우저 탭 · 메신저) — 제품 화면에 들어가지 않는다. 토큰 아님 */
export const FRAME_CSS = `:root{--frame-l:#FFFFFF;--frame-l-fg:#1F1F1F;--frame-l-fg2:#5F6368;--frame-l-bar:#E8EAED;--frame-l-line:#CFD9DE;--frame-d:#000000;--frame-d-fg:#E7E9EA;--frame-d-fg2:#9AA0A6;--frame-d-bar:#1F1F1F;--frame-d-tab:#2B2B2B;--frame-d-line:#2F3336}`;

const svg = (d, extra = '') => `<svg class="ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" stroke-linejoin="miter"${extra}>${d}</svg>`;
export const IC = {
  search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5"/>'),
  theme: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>'),
  right: svg('<path d="m9 6 6 6-6 6"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  retry: svg('<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19.5 4.5V9H15"/>'),
  home: svg('<path d="M3.5 10.5 12 4l8.5 6.5V20h-5.5v-6h-6v6H3.5z"/>'),
  news: svg('<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 12.5h8M8 16h5"/>'),
  league: svg('<path d="M4 5h16M4 10h16M4 15h16M4 20h16"/><path d="M8.5 5v15"/>'),
  player: svg('<path d="M8 3.5 3.5 6.5 5.5 10.5 7.5 9.5V20.5h9V9.5l2 1 2-4L16 3.5c-.6 1.7-2.2 2.8-4 2.8S8.6 5.2 8 3.5z"/>'),
  my: svg('<path d="M6 3.5h12v17l-6-4.5-6 4.5z"/>'),
};

export const ftab = (id, extra = '') => `<span class="ftab tab--${TABC[id]}${extra}" title="${esc(COMP[id].nameKo)}">${esc(COMP[id].shortKo)}</span>`;
export const itab = (id) => `<span class="tab tab--${TABC[id]}" title="${esc(COMP[id].nameKo)}"><span class="tab__t">${esc(COMP[id].shortKo)}</span></span>`;
export function badge(slug, size = 'm', solo = false) {
  const t = TEAM[slug];
  return `<span class="bdg bdg--${size}" style="--k1:${t.k1};--k2:${t.k2};--kf:${t.kf}"${solo ? ` role="img" aria-label="${esc(t.nameKo)} 배지 ${esc(t.short)}"` : ' aria-hidden="true"'}><b>${esc(t.short)}</b></span>`;
}
export const md = (date) => `${date.slice(5, 7)}.${date.slice(8)}`;
export const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export const dow = (date) => DOW[new Date(`${date}T00:00:00Z`).getUTCDay()];
export const longDate = (date) => { const [y, m, d] = date.split('-').map(Number); return `${y}년 ${m}월 ${d}일 (${dow(date)})`; };
export const shortDate = (date) => { const [, m, d] = date.split('-').map(Number); return `${m}월 ${d}일 (${dow(date)})`; };

/* ── 16px 픽셀 파비콘 (ICO 16 견본) — 격자 문자열 → SVG rect ── */
export function pix(rows, pal, { px = 16, title = '' } = {}) {
  const N = rows.length;
  let r = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let w = 1;
      while (row[x + w] === ch) w++;
      if (pal[ch]) r += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${pal[ch]}"/>`;
      x += w;
    }
  });
  return `<svg viewBox="0 0 ${N} ${N}" width="${px}" height="${px}" shape-rendering="crispEdges"${title ? ` role="img" aria-label="${esc(title)}"` : ' aria-hidden="true"'}>${r}</svg>`;
}
export function pixZoom(rows, pal, title) {
  const N = rows.length;
  let grid = '';
  for (let i = 1; i < N; i++) grid += `<path d="M${i} 0V${N}M0 ${i}H${N}"/>`;
  const inner = pix(rows, pal).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<svg viewBox="0 0 ${N} ${N}" width="128" height="128" shape-rendering="crispEdges" role="img" aria-label="${esc(title)}">${inner}<g stroke="#727886" stroke-width=".04" opacity=".55">${grid}</g></svg>`;
}

/* ── 셸: 티켓 마스트헤드 (D0 확정 — 지금 구현 그대로) ── */
export function ticket() {
  const t = D.today;
  return `<header class="ticket">
  <div class="ticket__brand"><p class="wordmark"><a href="#top">유로 다이제스트</a></p><p class="wordmark-en" lang="en" aria-hidden="true">EURO DIGEST</p><p class="tagline">${esc(D.copy.tagline)}</p></div>
  <div class="ticket__tools"><button class="ibtn" type="button" aria-label="검색">${IC.search}</button><button class="ibtn" type="button" data-theme-toggle aria-label="테마: 시스템 설정">${IC.theme}</button></div>
  <div class="ticket__perf" aria-hidden="true"></div>
  <p class="issue"><span class="issue__k">제</span><span class="issue__n">${t.no}</span><span class="issue__k">호</span></p>
  <p class="stub"><time datetime="${t.date}">${esc(t.label)}</time><span>발행 <time datetime="${t.date}T07:18+09:00">${ST.lastPublish.finished}</time> KST</span></p>
</header>
<nav class="topnav" aria-label="주 메뉴"><a href="#top">홈</a><a href="#top">뉴스</a><a href="#top">리그</a><a href="#top">한국 선수</a><a href="#top">마이</a><span class="topnav__upd">마지막 업데이트 <time datetime="${t.date}T07:18+09:00">${ST.lastPublish.finished}</time> KST</span></nav>`;
}
export function tabbar() {
  return `<nav class="tabbar tabbar--5" aria-label="하단 탭"><a href="#top">${IC.home}홈</a><a href="#top">${IC.news}뉴스</a><a href="#top">${IC.league}리그</a><a href="#top">${IC.player}한국 선수</a><a href="#top">${IC.my}마이</a></nav>`;
}
/* 뒤표지 — links 배열에 /status 링크가 끼는 위치는 시안마다 다르다 */
export function colophon({ statusSlot = '', linksBefore = [], linksAfter = [] } = {}) {
  const base = ['AI 작성 고지', '소개·출처 정책', '삭제·정정 요청'];
  const li = (l) => (typeof l === 'string' ? `<li><a href="#top">${esc(l)}</a></li>` : `<li>${l.html}</li>`);
  return `<footer class="colophon">
  <div class="colophon__in">
    <p class="colophon__brand">유로 다이제스트 <span>제 ${D.today.no}호 · <time datetime="${D.today.date}">${esc(D.today.label)}</time></span></p>
    <p class="colophon__fd" lang="en">Football data provided by the Football-Data.org API</p>
    <p class="colophon__p">경기·출전 데이터 football-data.org · API-Football. 오늘의 5줄은 이 데이터로 AI가 쓰고, AI가 쓴 줄에만 ‘AI 작성’ 라벨을 붙입니다. 검증에 맞지 않는 줄은 라벨 없는 코드 문장으로 바꾸거나 빼고, AI 답을 쓸 수 없는 날은 모든 줄을 코드 문장으로 싣습니다. 뉴스 카드는 AI 없이 원문 제목 그대로 싣습니다.</p>
    <ul class="colophon__links" role="list">${[...linksBefore, ...base, ...linksAfter].map(li).join('')}<li><a href="#top">GitHub<span aria-hidden="true"> ↗</span><span class="sr"> (새 창)</span></a></li></ul>
    ${statusSlot}
    <p class="colophon__p">마지막 업데이트 <time datetime="${D.today.date}T07:18+09:00">${ST.lastPublish.finished}</time> KST</p>
  </div>
</footer>`;
}

/* ── 시안 메타 띠 ── */
export function meta(m) {
  const li = (a) => a.map((x) => `<li>${x}</li>`).join('');
  const axes = m.axes.map((r) => `<tr><th scope="row">${r[0]}</th>${r.slice(1).map((c, i) => `<td${i === m.me ? ' class="me"' : ''}>${c}</td>`).join('')}</tr>`).join('');
  return `<details class="meta">
  <summary><span class="meta__tag">시안 정보</span><b>${esc(m.name)}</b><span class="meta__one">${esc(m.one)}</span><span class="meta__more" aria-hidden="true"></span></summary>
  <div class="meta__grid">
    <div><p class="meta__h">장점</p><ul>${li(m.pros)}</ul></div>
    <div><p class="meta__h">단점</p><ul>${li(m.cons)}</ul></div>
    <div><p class="meta__h">구현 난이도</p><p>${m.diff}</p><p class="meta__h">번들 · 폰트 영향</p><p>${m.bundle}</p><p class="meta__h">DESIGN 규칙 변경</p><p>${m.rules}</p></div>
    <div class="span3"><p class="meta__h">축 매트릭스 (시안 × 5축)</p><table class="axes"><thead><tr><th scope="col">축</th><th scope="col">A 입장권</th><th scope="col">B 제호</th><th scope="col">C 등번호</th></tr></thead><tbody>${axes}</tbody></table></div>
  </div>
</details>`;
}
export const AXES = [
  ['레이아웃', '가로 분할 — 스텁 · 천공 · 본문', '세로 띠 쌓기 — 러닝 헤드 · 괘선 · 제호 · 표', '큰 숫자 하나가 절반 이상 — 비대칭 블리드'],
  ['타이포', '호수 큰 숫자 + 한글 800 섞음', '한글 제호 800이 주도, 숫자는 표 안에서만', 'Barlow 숫자가 주도, 한글은 작게'],
  ['색', '네이비 티켓 면(라이트 --ticket) + 지면색 천공', '크림 지면 + 잉크, 레드는 괘선 한 줄', '벽돌 레드 면(다크 --ticket) + 지면색 숫자 · 대회/팀 OG만 크림'],
  ['밀도', '중간', '높음', '낮음'],
  ['모션', '뜯김 — 소스 행 상세 펼침', '없음 — 테마 잉크 전환만', '찍힘 — 30일 점 선택 → 그날 상세 줄'],
];

export function topbar(label) {
  return `<div class="bar"><div class="bar__in"><b>${esc(label)}</b><span>기준 <time datetime="${D.today.date}">${esc(D.today.label)}</time> 제 ${D.today.no}호 · 실데이터</span><nav class="bar__nav" aria-label="견본 목차"><a href="#s1"><span class="n">1</span>앱 아이콘</a><a href="#s2"><span class="n">2</span>OG</a><a href="#s3"><span class="n">3</span>빈 상태</a><a href="#s4"><span class="n">4</span>/status</a></nav><button class="ibtn" type="button" data-theme-toggle aria-label="테마: 시스템 설정">${IC.theme}</button></div></div>`;
}

/* ── 미리보기 틀: summary_large_image 카드 · 메신저 말풍선 · 정사각 썸네일 ── */
export function previews({ home, news }) {
  const card = (o, dark) => `<figure class="pv__x${dark ? ' pv__x--d' : ''}">${o.og}<p>${esc(o.title)}<span>sguys99.github.io</span></p></figure>`;
  const bubble = (o) => `<div class="msg__b">${o.og}<p>${esc(o.title)}<span>${esc(o.desc)}</span><span>sguys99.github.io</span></p></div>`;
  const sq = (o) => `<div class="msg__sq"><div class="sq">${o.og}</div><p>${esc(o.title)}<span>sguys99.github.io</span></p></div>`;
  return `<div class="pv">
  <div class="ogf"><p class="ogf__l"><b>twitter:card summary_large_image</b><span>1.91:1 큰 카드 — 지금 값 summary는 작은 정사각만 나온다</span></p>
    <div class="grid2">${card(home, false)}${card(news, true)}</div>
    <p class="alt">홈 <span class="path">/</span> → <span class="path">/og/default.png</span> · <code class="path">og:image:alt</code> <q>${esc(home.alt)}</q></p>
    <p class="alt">뉴스 <span class="path">/news/</span> → 최신 호 <span class="path">/og/news/${D.today.date}.png</span> · <code class="path">og:image:alt</code> <q>${esc(news.alt)}</q></p>
  </div>
  <div class="ogf"><p class="ogf__l"><b>메신저 미리보기</b><span>폭 240px · 정사각 가운데 자르기 64px</span></p>
    <div class="msg msg--l">${bubble(home)}${sq(news)}</div>
    <div class="msg msg--d">${bubble(news)}${sq(home)}</div>
  </div>
</div>`;
}

/* ── 상태 쪽 공용 문구 · 값 (사실만) ── */
export const DAYSTATE = {
  ontime: { k: '정시', d: '수집 완료가 공개 목표 + 15분 안' },
  late: { k: '늦음', d: '수집 완료가 공개 목표 + 15분 뒤' },
  missed: { k: '결호', d: '그날 발행 기록 없음' },
  failed: { k: '실패', d: '그날 실행이 모두 실패' },
  prelaunch: { k: '창간 전', d: '10월 12일 창간 전 — 분모에서 뺌' },
};
export const SRCSTATE = { fresh: '새 기사', 'no-new': '새 기사 없음', failed: '실패', empty: '빈 피드', none: '실행 없음' };
export const pct = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/* ── 페이지 조립 ── */
export function page({ file, title, comment, css, head = '', body, js = '' }) {
  const html = `<!doctype html>
<!--
${comment}
-->
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(title)}</title>
<script>
(function(){try{var t=localStorage.getItem('d3-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}
var q=new URLSearchParams(location.search);if(q.get('solo'))document.documentElement.classList.add('is-solo');if(q.get('theme'))document.documentElement.setAttribute('data-theme',q.get('theme'))})();
</script>
<style>
${BASE_CSS}
${FRAME_CSS}
.ibtn svg{width:22px;height:22px}
html.is-solo body{margin:0;background:transparent}
html.is-solo body>*:not(.solo){display:none!important}
.solo{position:absolute;left:0;top:0}
.tabbar--5{grid-template-columns:repeat(5,1fr)}
${css}
</style>
${head}
</head>
<body id="top">
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><clipPath id="squircle" clipPathUnits="objectBoundingBox"><path d="M.5 0C.89 0 1 .11 1 .5S.89 1 .5 1 0 .89 0 .5 .11 0 .5 0Z"/></clipPath></defs></svg>
<a class="skip" href="#main">본문으로 건너뛰기</a>
${body}
<script>
(function(){
var d=document.documentElement;
function cur(){return d.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}
function label(){var b=document.querySelectorAll('[data-theme-toggle]');for(var i=0;i<b.length;i++)b[i].setAttribute('aria-label','테마: '+(cur()==='dark'?'다크':'라이트')+' — 눌러 바꾸기')}
document.addEventListener('click',function(e){var b=e.target.closest('[data-theme-toggle]');if(!b)return;var t=cur()==='dark'?'light':'dark';d.setAttribute('data-theme',t);try{localStorage.setItem('d3-theme',t)}catch(err){}label()});
label();
var q=new URLSearchParams(location.search),s=q.get('solo');
if(s){var el=document.querySelector('[data-solo="'+s+'"]');if(el){var c=el.cloneNode(true);c.classList.add('solo');var w=+(q.get('w')||c.getAttribute('data-w')||1200);c.style.width=w+'px';document.body.appendChild(c);}}
})();
${js}
</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(ROOT, 'docs/design/d3', file), html);
  return html.length;
}
