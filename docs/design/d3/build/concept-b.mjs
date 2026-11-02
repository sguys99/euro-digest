// D3 시안 B — 제호 (Nameplate): 조간 1면 머리의 제호 띠와 판권면. 크림 지면 위 한글 제호 · 괘선 · 리더 점선만으로 조판한다.
import { D, ST, TOK, COMP, TEAM, IC, esc, ftab, md, dow, longDate, shortDate, pix, pixZoom, ticket, tabbar, colophon, meta, AXES, topbar, previews, DAYSTATE, SRCSTATE, pct, page } from './common.mjs';

const T = TOK;
const SLUG = { EPL: 'epl', LALIGA: 'laliga', SERIEA: 'seriea', BUNDESLIGA: 'bundesliga', LIGUE1: 'ligue1', UCL: 'ucl' };
/* ───────── 1. 아이콘 ───────── */
// 글자 "유"는 웹폰트(EuroDigest Sans 800)로 그린 견본 — 구현(M5-02)에서는 글리프 외곽선을 path로 옮긴다(notes-b §5).
const YU = (x, y, size, fill) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="EuroDigest Sans" font-weight="800" font-size="${size}" fill="${fill}">유</text>`;
function iconB(kind, { face = T.paperL, ink = T.inkL, red = T.accentL, label = '' } = {}) {
  const aria = label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"';
  if (kind === 'any') {
    return `<svg viewBox="0 0 512 512"${aria}><rect width="512" height="512" fill="${face}"/><rect x="64" y="72" width="384" height="22" fill="${ink}"/><rect x="64" y="104" width="384" height="5" fill="${ink}"/>${YU(256, 378, 286, ink)}<rect x="64" y="428" width="384" height="12" fill="${red}"/></svg>`;
  }
  if (kind === 'maskable' || kind === 'apple') {
    return `<svg viewBox="0 0 512 512"${aria}><rect width="512" height="512" fill="${face}"/><rect x="118" y="128" width="276" height="16" fill="${ink}"/><rect x="118" y="152" width="276" height="4" fill="${ink}"/>${YU(256, 340, 200, ink)}<rect x="138" y="382" width="236" height="10" fill="${red}"/></svg>`;
  }
  // small — 16·32·48: "유" + 괘선 1줄(위 잉크)
  return `<svg viewBox="0 0 512 512"${aria}><rect width="512" height="512" fill="${face}"/><rect x="0" y="0" width="512" height="44" fill="${ink}"/>${YU(256, 448, 410, ink)}</svg>`;
}
const P16 = [
  '################',
  '################',
  '................',
  '......####......',
  '.....##..##.....',
  '.....##..##.....',
  '......####......',
  '................',
  '..############..',
  '..############..',
  '....##....##....',
  '....##....##....',
  '....##....##....',
  '....##....##....',
  '................',
  '................',
];
const pal16L = { '.': T.paperL, '#': T.inkL };
const pal16D = { '.': T.paperD, '#': T.inkD };
const SAFE = `<svg viewBox="0 0 512 512" class="safe" aria-hidden="true"><circle cx="256" cy="256" r="204.8" fill="none" stroke="${T.accentL}" stroke-width="3" stroke-dasharray="10 8"/><path d="M256 0V512M0 256H512" stroke="${T.accentL}" stroke-width="1.5" stroke-dasharray="4 6"/></svg>`;
const faviconSrc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>.p{fill:${T.paperL}}.i{fill:${T.inkL}}@media (prefers-color-scheme:dark){.p{fill:${T.paperD}}.i{fill:${T.inkD}}}</style><rect class="p" width="32" height="32"/><rect class="i" width="32" height="3"/><path class="i" d="…유 글리프 외곽선(M5-02에서 생성)…"/></svg>`;

function sIcons() {
  const sized = (svg, s) => svg.replace('<svg ', `<svg width="${s}" height="${s}" `);
  const ladder = [16, 32, 48].map((s) => `<figure><div class="edge">${s === 16 ? pix(P16, pal16L, { title: '16px' }) : sized(iconB('small', { label: `${s}px` }), s)}</div><figcaption>${s}</figcaption></figure>`).join('')
    + `<figure><div class="edge">${sized(iconB('apple', { label: 'apple-touch 180px' }), 180)}</div><figcaption>180 apple</figcaption></figure>`
    + `<figure><div class="edge">${sized(iconB('any', { label: 'any 192px' }), 192)}</div><figcaption>192 any</figcaption></figure>`
    + `<figure class="big"><div class="edge">${sized(iconB('any', { label: 'any 512px' }), 512)}</div><figcaption>512 any — 좁은 화면에서는 폭에 맞춰 줄여 보임</figcaption></figure>`;
  const masks = () => ['m-circle', 'm-squircle', 'm-round'].map((m, i) => `<figure><div class="${m}">${sized(iconB('maskable'), 60)}</div><figcaption>유로 다이제스트<span>${['원', '스퀴클', '둥근 사각'][i]}</span></figcaption></figure>`).join('');
  const tab = (dark) => `<div class="tabs tabs--${dark ? 'd' : 'l'}"><div class="tabs__t tabs__t--on">${pix(P16, dark ? pal16D : pal16L, { title: `파비콘 16px ${dark ? '다크' : '라이트'}` })}<span>유로 다이제스트</span></div><div class="tabs__t"><i aria-hidden="true"></i><span>새 탭</span></div></div>`;
  return `<section id="s1" class="blk" aria-labelledby="s1h">
  <div class="sec-h"><h2 id="s1h"><span class="blk__no">1</span>앱 아이콘</h2><span class="rh" aria-hidden="true" lang="en">ICONS</span></div>
  <p class="sub2">제호의 첫 글자. 크림 지면(라이트 <code>--paper</code>) · 위 잉크 겹괘선 · 한글 <b>유</b>(EuroDigest Sans 800) · 아래 스팟 레드 괘선. 세 파일 모두 면을 꽉 채운다(투명 0).</p>
  <div class="grid3" style="margin-top:18px">
    <figure class="fr"><p class="fr__cap"><b>any 512</b><span class="path">public/icons/icon-512.png</span> · 192 같은 그림</p><div class="edge">${iconB('any', { label: 'any 아이콘 — 크림 면, 잉크 겹괘선, 유, 레드 괘선' })}</div></figure>
    <figure class="fr"><p class="fr__cap"><b>maskable 512</b><span class="path">icon-maskable-512.png</span> · 점선 원 = 안전 영역 지름 80%</p><div class="safe-wrap edge">${iconB('maskable', { label: 'maskable 아이콘 — 안전 원 안의 괘선과 유' })}${SAFE}</div></figure>
    <figure class="fr"><p class="fr__cap"><b>apple-touch 180</b><span class="path">apple-touch-icon.png</span> · 투명 0 · iOS가 모서리를 깎음</p><div class="ios edge">${iconB('apple', { label: 'apple-touch 아이콘' })}</div></figure>
  </div>
  <h3 class="h3">크기 사다리 <small lang="en">16 · 32 · 48 · 180 · 192 · 512</small></h3>
  <div class="ladder">${ladder}</div>
  <p class="sub2">점선 테두리는 보기용이다(아이콘에 포함되지 않음) — 크림 면이 이 지면과 같은 색이라 경계를 보이려고 둘렀다.</p>
  <h3 class="h3">런처 마스크 · 홈 화면 바탕 <small lang="en">LAUNCHER</small></h3>
  <div class="devices"><div class="home home--l">${masks()}</div><div class="home home--d">${masks()}</div></div>
  <p class="sub2">흰 바탕에서는 크림 면과 바탕의 경계가 1.12라 면이 거의 사라지고 <b>잉크 괘선 · 글자만</b> 남는다. 검 바탕에서는 가장 밝은 아이콘이 된다.</p>
  <h3 class="h3">파비콘 · 브라우저 탭 <small lang="en">FAVICON</small></h3>
  <div class="grid2">
    <div class="fr"><p class="fr__cap"><b>favicon.svg</b><span class="path">public/favicon.svg</span> — 라이트 탭 크림 · 다크 탭 네이비 지면(각 테마의 <code>--paper</code> · <code>--ink</code>)</p>${tab(false)}${tab(true)}
      <pre class="code" aria-label="favicon.svg 구조">${esc(faviconSrc)}</pre></div>
    <div class="fr"><p class="fr__cap"><b>favicon.ico 16 · 32</b><span class="path">public/favicon.ico</span> — 16은 픽셀 격자에 맞춰 손으로 그린다. ㅇ 4 · ㅠ 획 2px</p>
      <div class="px">
        <figure>${pix(P16, pal16L, { px: 16, title: '16px 라이트' })}<figcaption>16</figcaption></figure>
        <figure>${sized(iconB('small'), 32)}<figcaption>32</figcaption></figure>
        <figure class="zoom">${pixZoom(P16, pal16L, '16px 격자 8배 확대')}<figcaption>16 × 8 확대</figcaption></figure>
        <figure class="zoom">${pixZoom(P16, pal16D, '16px 다크 격자 8배 확대')}<figcaption>다크 탭용 (svg만)</figcaption></figure>
      </div></div>
  </div>
</section>`;
}

/* ───────── 2. OG ───────── */
const OGPIN = `--paper:${T.paperL};--ink:${T.inkL};--ink-2:${T.ink2L};--rule:${T.ruleL};--brand-accent:${T.accentL};--brand-accent-text:${T.accentTextL};--competition-foreground:${T.paperL};` + Object.entries(T.compL).map(([k, v]) => `--competition-${SLUG[k]}:${v}`).join(';');
const ogB = (id, { rh, right = '', np, npCls = '', foot, footR = '', tab = '', alt }) => `<div class="og og--b${tab ? ' og--btab' : ''}" data-solo="${id}" role="img" aria-label="${esc(alt)}"><div class="ogb__in"><p class="ogb__rh"><span lang="en">${rh}</span><span>${right}</span></p><p class="ogb__rule" aria-hidden="true"></p><div class="ogb__np ${npCls}">${np}</div><p class="ogb__red" aria-hidden="true"></p><p class="ogb__ft"><span>${foot}</span><span>${footR}</span></p></div>${tab}</div>`;
const ogDefault = (id = 'og-default') => ogB(id, { rh: 'EURO DIGEST', np: '<p class="ogb__t">유로 다이제스트</p>', foot: esc(D.copy.tagline), alt: `유로 다이제스트 — ${D.copy.tagline}` });
const ogNews = (iss, id) => ogB(id, { rh: 'EURO DIGEST', right: `제 <span class="n">${iss.no}</span>호`, np: '<p class="ogb__t">유로 다이제스트</p>', foot: `<b>${esc(iss.label)}</b>`, footR: esc(D.copy.tagline), alt: `유로 다이제스트 제 ${iss.no}호, ${iss.label}` });
const ogComp = (c, id) => ogB(id, { rh: 'EURO DIGEST', right: `<span class="n">${c.season}</span> 시즌`, np: `<p class="ogb__t ogb__t--c">${esc(c.nameKo)}</p>`, foot: `<span lang="en" class="ogb__en">${esc(c.nameEn)}</span>`, footR: '유로 다이제스트', tab: `<span class="ogb__tab tab--${SLUG[c.id]}" aria-hidden="true">${esc(c.shortKo)}</span>`, alt: `유로 다이제스트 · ${c.nameKo} ${c.season} 시즌` });
const ogTeam = (t, id) => ogB(id, { rh: 'EURO DIGEST', right: [t.comp, ...t.alsoIn].map((c) => `<span class="ogb__ftab tab--${SLUG[c]}">${esc(COMP[c].shortKo)}</span>`).join(''), np: `<span class="ogb__bdg" style="--k1:${t.k1};--k2:${t.k2};--kf:${t.kf}"><b>${esc(t.short)}</b></span><p class="ogb__t ogb__t--team">${esc(t.nameKo)}</p>`, npCls: 'ogb__np--team', foot: `<span lang="en" class="ogb__en">${esc(t.nameEn)}</span>`, footR: '유로 다이제스트', alt: `유로 다이제스트 · ${t.nameKo} (${t.short}) · ${[t.comp, ...t.alsoIn].map((c) => COMP[c].nameKo).join(' · ')}` });

function sOg() {
  const today = D.today, i100 = D.issue100;
  const lab = (p, note = '') => `<p class="ogf__l"><span class="path">${p}</span>${note ? `<span>${note}</span>` : ''}</p>`;
  return `<section id="s2" class="blk" aria-labelledby="s2h">
  <div class="sec-h"><h2 id="s2h"><span class="blk__no">2</span>OG 이미지 1200×630</h2><span class="rh" aria-hidden="true" lang="en">OPEN GRAPH</span></div>
  <p class="sub2">조간 1면 머리 그대로. 러닝 헤드 줄 → 잉크 겹괘선 → 한글 제호 → 레드 괘선 → 날짜 · 태그라인 줄. 면은 라이트 지면 토큰 고정(<code>--paper</code> · <code>--ink</code> · <code>--ink-2</code> · <code>--brand-accent</code>) — 옛 <code>--og-*</code> 4개를 없앤다. 크림 면이라 대회 색은 라이트 값(화면과 같은 색). <b>결과 노출 0</b>.</p>
  <h3 class="h3">기본 · 날짜 <small lang="en">DEFAULT · ISSUE</small></h3>
  <div class="ogset">
    <div class="ogf ogf--hero">${lab('/og/default.png', '홈 <span class="path">/</span> · 쪽 이름형 OG의 바탕')}${ogDefault()}</div>
    <div class="ogset ogset--2">
      <div class="ogf">${lab(`/og/news/${today.date}.png`, `제 ${today.no}호 · <span class="path">/news/</span> 최신 호`)}${ogNews(today, 'og-news-22')}</div>
      <div class="ogf">${lab(`/og/news/${i100.date}.png`, '제 100호 — 러닝 헤드 안이라 자릿수 영향 없음')}${ogNews(i100, 'og-news-100')}</div>
    </div>
  </div>
  <h3 class="h3">대회 <small lang="en">COMPETITIONS · 6</small></h3>
  <div class="ogset ogset--3">${['EPL', 'BUNDESLIGA', 'UCL'].map((id) => `<div class="ogf">${lab(`/og/competitions/${id.toLowerCase()}.png`)}${ogComp(COMP[id], `og-c-${id.toLowerCase()}`)}</div>`).join('')}</div>
  <div class="ogset ogset--3" style="margin-top:14px">${['LALIGA', 'SERIEA', 'LIGUE1'].map((id) => `<div class="ogf">${lab(`/og/competitions/${id.toLowerCase()}.png`, '축소판')}${ogComp(COMP[id], `og-c-${id.toLowerCase()}`)}</div>`).join('')}</div>
  <h3 class="h3">팀 <small lang="en">TEAMS · 111</small></h3>
  <div class="ogset ogset--2">${['rennes', 'atletico-madrid', 'borussia-monchengladbach', 'bayern-munchen'].map((s) => `<div class="ogf">${lab(`/og/teams/${s}.png`, { rennes: '이름 1자', 'atletico-madrid': '10자 · 두 줄', 'borussia-monchengladbach': '흰 상의 — 크림 면 위 경계 1.12 → 잉크 테두리', 'bayern-munchen': '소속 + UCL 탭 2개' }[s])}${ogTeam(TEAM[s], `og-t-${s}`)}</div>`).join('')}</div>
  <h3 class="h3">링크 미리보기 <small lang="en">PREVIEW</small></h3>
  ${previews({
    home: { og: ogDefault('pv-default'), title: '유로 다이제스트', desc: D.copy.tagline, alt: `유로 다이제스트 — ${D.copy.tagline}` },
    news: { og: ogNews(today, 'pv-news'), title: `제 ${today.no}호 · ${today.label} · 유로 다이제스트`, desc: '오늘의 5줄과 유럽 축구 소식', alt: `유로 다이제스트 제 ${today.no}호, ${today.label}` },
  })}
</section>`;
}

/* ───────── 3. 빈 상태 — 월 달력 괘선 판(M1-34 달력 문법) · 색인 쪽 ───────── */
const brief = (inner, sub) => `<div class="sec-h"><h3 class="h">오늘의 5줄</h3><span class="rh" aria-hidden="true" lang="en">STARTING FIVE</span></div><p class="sub">${sub}</p>${inner}`;
const WK = ['일', '월', '화', '수', '목', '금', '토'];
// cells: (date) => {cls, mark, label}
function cal({ y, m, cells = () => ({}), caption, from = 1, to = null }) {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = to ?? days;
  let rows = '', cur = '';
  const startPad = (first + from - 1) % 7;
  for (let i = 0; i < startPad; i++) cur += '<td class="cb__x"></td>';
  let col = startPad;
  for (let d = from; d <= last; d++) {
    const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const c = cells(date) || {};
    cur += `<td class="cb__d ${c.cls || ''}"${c.sr ? ` aria-label="${esc(c.sr)}"` : ''}><span class="cb__n">${d}</span>${c.mark ? `<span class="cb__m">${c.mark}</span>` : ''}${c.label ? `<span class="cb__l">${c.label}</span>` : ''}</td>`;
    col++;
    if (col % 7 === 0) { rows += `<tr>${cur}</tr>`; cur = ''; }
  }
  if (cur) { while (col % 7) { cur += '<td class="cb__x"></td>'; col++; } rows += `<tr>${cur}</tr>`; }
  return `<table class="cb"><caption class="sr">${esc(caption)}</caption><thead><tr>${WK.map((w) => `<th scope="col">${w}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}
const CK = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="m3 8.5 3.2 3.2L13 5"/></svg>`;
const XK = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="m4 4 8 8M12 4l-8 8"/></svg>`;

function sEmpty() {
  const e = D.emptyStates, ucl = COMP[e.ended.comp], lal = COMP[e.upcomingSample.comp];
  const head = (id, c, extra = '') => `<p class="calh">${ftab(id)}<span>${esc(c.nameKo)} <span class="n">${c.season}</span> 시즌</span>${extra}</p>`;
  const offEnded = `<div class="offB">${head('UCL', ucl)}<p class="calt"><span class="n">2027</span>년 <span class="n">6</span>월</p>${cal({ y: 2027, m: 6, caption: '2027년 6월 — 6월 5일 시즌 종료', cells: (d) => (d === e.ended.date ? { cls: 'cb__d--key', label: '종료', sr: '6월 5일, 시즌 종료' } : d === '2027-06-07' ? { cls: 'cb__d--today', label: '오늘', sr: '6월 7일, 오늘' } : {}) })}<p class="offB__n">${esc(D.copy.offSeason.ended.note)}</p><a class="tlink" href="#top">주요 뉴스로<span aria-hidden="true"> ↓</span></a></div>`;
  const offUp = `<div class="offB">${head('LALIGA', lal, '<span class="stamp stamp--ph">견본</span>')}<p class="calt"><span class="n">2026</span>년 <span class="n">8</span>월</p>${cal({ y: 2026, m: 8, caption: '2026년 8월 — 8월 16일 개막(견본)', cells: (d) => (d === e.upcomingSample.date ? { cls: 'cb__d--key', label: '개막', sr: '8월 16일, 개막' } : d === '2026-08-15' ? { cls: 'cb__d--today', label: '오늘', sr: '8월 15일, 오늘' } : {}) })}<p class="offB__n">${esc(D.copy.offSeason.upcoming.note)}</p></div>`;
  const im = D.intl.matches;
  const inWin = (d) => d >= D.intl.from && d <= D.intl.to;
  const rest = `<div class="restB"><p class="lead">오늘은 5줄을 쉽니다</p><p class="body2">전날 6개 대회에 끝난 경기가 없었습니다.</p>
    <p class="calt"><span class="n">2026</span>년 <span class="n">11</span>월 <span class="restB__w"><i class="hatch-sw" aria-hidden="true"></i>A매치 기간 <span class="n">${md(D.intl.from)} – ${md(D.intl.to)}</span></span></p>
    ${cal({ y: 2026, m: 11, caption: '2026년 11월 — A매치 기간 11월 10일부터 20일', cells: (d) => { const mm = im.find((x) => x.date === d); if (mm) return { cls: 'cb__d--win cb__d--match', label: '경기', sr: `${shortDate(d)}, A매치 ${mm.opponent}` }; if (d === '2026-11-12') return { cls: 'cb__d--win cb__d--today', label: '오늘', sr: '11월 12일, 오늘 — A매치 기간' }; if (inWin(d)) return { cls: 'cb__d--win', sr: `${shortDate(d)}, A매치 기간` }; return {}; } })}
    <ul class="ledB" role="list">${im.map((x) => `<li><span class="ledB__d"><span class="n">${x.md}</span> (${x.dow}) <span class="n">${x.time}</span></span><i aria-hidden="true"></i><span class="ledB__v"><b>${esc(x.opponent)}</b> · ${esc(x.venue)} · ${x.home ? '홈' : '원정'} · ${esc(x.competition)}</span></li>`).join('')}</ul>
    <a class="tlink" href="#top">주요 뉴스로<span aria-hidden="true"> ↓</span></a></div>`;
  const search = `<div class="srch">${IC.search}<span lang="en">${esc(e.searchQuery)}</span></div>
    <div class="idxB"><p class="idxB__k" aria-hidden="true" lang="en">M</p><div><p class="idxB__h">“<span lang="en">${esc(e.searchQuery)}</span>” ${esc(D.copy.search.none)}</p>
    <ul class="idxB__l" role="list">${['선수', '팀', '대회', '뉴스'].map((k) => `<li><span>${k}</span><i aria-hidden="true"></i><span class="n">0</span></li>`).join('')}</ul>
    <p class="body2">${esc(D.copy.search.hint)}</p></div></div>`;
  const saved = new Set(['2026-10-31', '2026-11-01', '2026-11-02']);
  const pub = new Set(ST.days.filter((d) => d.state === 'ontime' || d.state === 'late').map((d) => d.date));
  const offWeek = (y, m, from, to) => cal({ y, m, from, to, caption: '최근 두 주 — 저장한 호만 열 수 있음', cells: (d) => { const no = (Date.parse(d) - Date.parse('2026-10-12')) / 864e5 + 1; if (saved.has(d)) return { cls: 'cb__d--saved', label: `<span class="n">${no}</span>호`, sr: `${shortDate(d)} 제 ${no}호, 저장됨` }; if (pub.has(d)) return { cls: 'cb__d--gone', label: `<span class="n">${no}</span>호`, sr: `${shortDate(d)} 제 ${no}호, 저장 안 됨` }; if (d > '2026-11-02') return { cls: 'cb__d--fut' }; return { cls: 'cb__d--gap', label: '결호', sr: `${shortDate(d)}, 결호` }; } });
  const offline = `<div class="sec-h"><h3 class="h">${esc(D.copy.offline.h1)}</h3><span class="rh" aria-hidden="true" lang="en">OFFLINE</span></div>
  <div class="offlB"><div><p class="lead">${esc(D.copy.offline.lead)}</p><p class="body2">${esc(D.copy.offline.body)}</p><button class="btn btn--sm" type="button">${IC.retry}다시 시도</button></div>
  <div class="offlB__cal"><p class="calt"><span class="n">10</span>월 <span class="n">25</span>일 – <span class="n">11</span>월 <span class="n">7</span>일 <span class="offlB__lg"><i class="sw sw--saved"></i>저장됨 <i class="sw sw--gone"></i>저장 안 됨</span></p>${offWeek(2026, 10, 25, 31).replace('</tbody></table>', '') + offWeek(2026, 11, 1, 7).replace(/^[\s\S]*?<tbody>/, '')}</div></div>
  <div class="sec-h sec-h--thin" style="margin-top:28px"><h4 class="h">${esc(D.copy.offline.saved)}</h4><span class="rh" aria-hidden="true" lang="en">SAVED</span></div>
  <ul class="offline-list" role="list">${[...saved].reverse().map((d) => `<li><a href="#top"><span class="d">${md(d)}</span><span class="w">(${dow(d)})</span><span class="no">제 <span class="n">${(Date.parse(d) - Date.parse('2026-10-12')) / 864e5 + 1}</span>호</span></a></li>`).join('')}</ul>`;
  const ctx = (lbl, inner, ba) => `<figure class="ctx"><figcaption class="ctx__lbl">${lbl}</figcaption>${inner}<div class="ba">${ba}</div></figure>`;
  const ba = (before, after) => `<div class="ba__row"><span class="ba__k">지금</span><span>${before}</span></div><div class="ba__row"><span class="ba__k">새</span><span>${after}</span></div>`;
  return `<section id="s3" class="blk" aria-labelledby="s3h">
  <div class="sec-h"><h2 id="s3h"><span class="blk__no">3</span>빈 상태 조형</h2><span class="rh" aria-hidden="true" lang="en">EMPTY</span></div>
  <p class="sub2">그림 대신 조판. 비시즌 · 휴식기 · 오프라인은 M1-34 월 달력 괘선 판(일요일 시작 · 칸 52px · 결호 점선)을, 검색 0은 D2 검색 색인 쪽(가나다 머리 · 리더 점선)을 쓴다. 기간은 <code>--hatch</code> 빗금, 열쇠 날짜는 레드 2px 테두리.</p>
  <div class="es grid2" style="margin-top:18px">
    ${ctx('<b>비시즌 · 종료</b><span>견본 날 6월 7일 — 결승 다음 날부터 · UCL endDate</span>', brief(offEnded, '6월 6일 경기 기준'), ba('평탄 탭 + “2027.06.05 종료” 34px + 안내 — 글자만', '그달 달력에 종료일 한 칸만 레드 테두리 + “종료”'))}
    ${ctx('<b>비시즌 · 개막</b><span>견본 날 8월 15일 — 2027-28 설정 전이라 라리가 지난 개막일</span>', brief(offUp, '8월 14일 경기 기준'), ba('평탄 탭 + 날짜 + “개막” — 글자만', '개막일 레드 테두리 + 오늘 칸 반전 — 남은 날을 칸으로 센다'))}
    ${ctx('<b>휴식기 · A매치 기간</b><span>견본 날 11월 12일 — national-team.json 경기일 ±3일</span>', brief(rest, '11월 11일 경기 기준'), ba('S4 그대로 — 레드 윤곽 ‘0’ + “오늘은 5줄을 쉽니다” + 이유 1줄', 'S4 문구 아래 11월 달력 — 기간 빗금 · 경기 2칸 잉크 테두리 + 리더 행 2줄 — <b>새 S4 변형(결정 필요)</b>'))}
    ${ctx('<b>검색 결과 없음</b><span>오버레이 · <span class="path">/search/</span> 공용 · e2e 0건 질의</span>', search, ba('윤곽 ‘0’ 64px + “결과가 없어요” + 안내', '색인 쪽 — 머리 글자 M + 유형 4줄이 빈 리더 점선 · 0'))}
  </div>
  <figure class="ctx" style="margin-top:16px"><figcaption class="ctx__lbl"><b>/offline/ 화면</b><span>서비스 워커가 저장하지 않은 쪽을 열면 — 셸은 /status와 같다</span></figcaption>${offline}<div class="ba">${ba('h1 + OFFLINE + 안내 2줄 + 다시 시도 + 저장해 둔 호 목록 — 글자만', '최근 두 주 달력 — 저장한 호 3칸만 실선(열 수 있음), 나머지 발행 호는 점선(열 수 없음)')}</div></figure>
</section>`;
}

/* ───────── 4. /status — 판권면 원장 ───────── */
function sStatus() {
  const L = ST.lastPublish, R = ST.runRate, C = ST.cost, DC = ST.dayCounts;
  const early = (() => { const [h1, m1] = L.target.split(':').map(Number), [h2, m2] = L.finished.split(':').map(Number); return h1 * 60 + m1 - (h2 * 60 + m2); })();
  const byDate = Object.fromEntries(ST.days.map((d) => [d.date, d]));
  const cell = (date) => {
    const d = byDate[date];
    if (!d) return { cls: 'cb__d--fut' };
    const fr = d.failedRuns.length ? ` · 실패 실행 ${d.failedRuns.length}회 ${d.failedRuns.map((f) => f.started).join(', ')}` : '';
    const sr = `${shortDate(date)}${d.no ? ` 제 ${d.no}호` : ''} ${DAYSTATE[d.state].k}${d.finished ? ` · 수집 완료 ${d.finished}` : ''}${fr}`;
    const x = d.failedRuns.length ? `<span class="cb__x2" title="실패 실행">${XK}</span>` : '';
    if (d.state === 'prelaunch') return { cls: 'cb__d--pre', label: '창간 전', sr };
    if (d.state === 'missed') return { cls: 'cb__d--gap', mark: '–', label: '결호', sr };
    if (d.state === 'late') return { cls: 'cb__d--late', mark: '!', label: `<span class="n">${d.finished}</span>`, sr };
    return { cls: 'cb__d--ok', mark: CK + x, label: `<span class="n">${d.finished}</span>`, sr };
  };
  const tbl30 = cal({ y: 2026, m: 10, from: 4, to: 31, caption: '최근 30일 발행 — 10월 4일부터 11월 2일', cells: cell }).replace('</tbody></table>', '') + cal({ y: 2026, m: 11, from: 1, to: 7, caption: '', cells: cell }).replace(/^[\s\S]*?<tbody>/, '');
  const srows = ST.sources.map((s) => {
    const st = s.staleStreak >= 7 ? `새 기사 없음 <span class="n">${s.staleStreak}</span>회 연속` : s.failStreak ? `실패 <span class="n">${s.failStreak}</span>회 연속` : '새 기사 있음';
    return `<tr${s.staleStreak >= 7 ? ' class="is-flag"' : ''}><th scope="row"><span ${s.lang === 'ko' ? '' : `lang="${s.lang}"`}>${esc(s.name)}</span></th><td><span class="tier tier--${s.tier}">Tier <span class="n">${s.tier}</span></span></td><td class="num" data-k="응답"><span class="n">${s.ok}/${s.attempts}</span></td><td class="num" data-k="새 기사"><span class="n">${s.usable}</span></td><td class="stB">${st}</td></tr>`;
  }).join('');
  const bar = (k, v, cur) => `<div class="barB${cur ? '' : ' barB--prev'}"><p class="barB__k">${k}</p><div class="barB__t" role="img" aria-label="${k} 월 예산의 ${v.toFixed(2)}%"><i style="width:${v}%"></i><span class="barB__50" aria-hidden="true"></span></div><p class="barB__v"><span class="n">${v.toFixed(2)}</span>%</p></div>`;
  return `<div class="divider divider--screen" id="s4"><span><b>화면 4 · /status/</b> 앱 셸 안의 한 쪽 — 뒤표지 링크로 들어온다</span><span class="divider__info">판권면 원장 · 모션 없음(테마 잉크 전환만)</span></div>
<div class="scr"><div class="shell">
${ticket()}
<div class="layout">
  <aside class="contents" aria-label="이 쪽 목차"><div class="sec-h"><h2 class="h">이 쪽</h2><span class="rh" aria-hidden="true" lang="en">CONTENTS</span></div>
    <ul class="toc" role="list"><li><a href="#st-led"><span>원장</span><i></i></a></li><li><a href="#st-30"><span>최근 30일</span><i></i></a></li><li><a href="#st-src"><span>소스 건강도</span><i></i></a></li><li><a href="#st-cost"><span>비용</span><i></i></a></li></ul></aside>
  <main class="page" id="main">
    <div class="sec-h"><h1 class="h">발행 상태</h1><span class="rh" aria-hidden="true" lang="en">STATUS</span></div>
    <p class="st-basis">유로 다이제스트가 매일 아침 제때 나오는지 적어 두는 판권면이다. 발행할 때마다 다시 만든다.</p>
    <dl class="ledgerB" id="st-led">
      <div><dt>마지막 발행</dt><dd><time datetime="${L.date}">${esc(L.label)}</time> 제 <span class="n">${L.no}</span>호</dd></div>
      <div><dt>수집 완료</dt><dd><span class="n big">${L.finished}</span> KST <small>시작 <span class="n">${L.started}</span></small></dd></div>
      <div><dt>공개 목표</dt><dd><span class="n">${L.target}</span> KST <small>목표보다 <span class="n">${early}</span>분 앞</small></dd></div>
      <div><dt>배포 완료</dt><dd><span class="ph"><b>자리</b>실행 기록에 없음 · 채울 단계 <span class="n">M5-15</span></span></dd></div>
      <div><dt>최근 30일 실행 성공률</dt><dd><span class="n big">${pct(R.pct)}</span>% <small>prod 수집 <span class="n">${R.all}</span>회 중 <span class="n">${R.ok}</span>회</small></dd></div>
      <div><dt>이번 달 비용</dt><dd>월 예산의 <span class="n big">${C.thisMonth.pct.toFixed(2)}</span>% <small>10월 <span class="n">${C.lastMonth.pct.toFixed(2)}</span>%</small></dd></div>
      <div><dt>이 쪽 기준</dt><dd><time datetime="2026-11-02T13:39+09:00">${shortDate(D.today.date)} <span class="n">13:39</span> KST</time></dd></div>
    </dl>

    <section id="st-30" class="stB" aria-labelledby="st-30-h">
      <div class="sec-h sec-h--thin"><h2 id="st-30-h" class="h">최근 30일</h2><span class="rh" aria-hidden="true" lang="en">30 DAYS</span></div>
      <p class="sub"><span class="n">${md(ST.window.from)} – ${md(ST.window.to)}</span> · 칸 = 발행일 · 시각 = 그날 첫 발행 실행의 수집 완료(KST)</p>
      <div class="cbwrap">${tbl30}</div>
      <ul class="legB" role="list" aria-label="범례">
        <li><span class="cb__m">${CK}</span>정시 <span class="n">${DC.ontime}</span></li><li><span class="cb__m">!</span>늦음 <span class="n">${DC.late}</span></li><li><span class="cb__m">–</span>결호 <span class="n">${DC.missed}</span></li><li><span class="cb__m">${XK}</span>실패 <span class="n">${DC.failed}</span>일</li><li>실패한 실행 <span class="n">1</span>회 — 10.31 <span class="n">00:33</span> 수동, 그날 호는 정시</li><li><span class="legB__pre">창간 전</span><span class="n">${DC.prelaunch}</span></li>
      </ul>
      <p class="def"><b>성공률</b>은 실행 기준(PRD KPI · 운영 리포트와 같은 셈), <b>달력</b>은 발행일 기준이다. 정시 = 공개 목표(여름 <span class="n">07:00</span> · 겨울 <span class="n">07:30</span>) + 15분 안, 늦음 = 그 뒤, 결호 = 그날 발행 기록 없음, 창간 전 날은 분모에서 뺀다.</p>
    </section>

    <section id="st-src" class="stB" aria-labelledby="st-src-h">
      <div class="sec-h sec-h--thin"><h2 id="st-src-h" class="h">소스 건강도</h2><span class="rh" aria-hidden="true" lang="en">SOURCES</span></div>
      <p class="sub">최근 7일 <span class="n">${md(ST.days[23].date)} – ${md(D.today.date)}</span> · 지금 수집하는 <span class="n">${ST.sources.length}</span>곳</p>
      <div class="tblwrap"><table class="srcB"><caption class="sr">소스 건강도 — 최근 7일</caption><thead><tr><th scope="col">매체</th><th scope="col">등급</th><th scope="col" class="num">응답</th><th scope="col" class="num">새 기사</th><th scope="col">상태</th></tr></thead><tbody>${srows}</tbody></table></div>
      <p class="def">응답 = 성공 실행 / 시도(시간 예산 초과는 뺌). 새 기사 = 수집 창 안 새 항목 합. 새 기사 없음이 7회 이어지면 점검 이슈가 열린다.</p>
    </section>

    <section id="st-cost" class="stB" aria-labelledby="st-cost-h">
      <div class="sec-h sec-h--thin"><h2 id="st-cost-h" class="h">비용</h2><span class="rh" aria-hidden="true" lang="en">BUDGET</span></div>
      <p class="sub">월 예산 대비 · 운영(prod)과 개발 실험(dev)의 AI 브리핑 비용 합 · 데이터 API는 무료 플랜이라 0</p>
      ${bar('11월 · 지금까지', C.thisMonth.pct, true)}${bar('10월', C.lastMonth.pct, false)}
      <div class="barB barB--axis" aria-hidden="true"><span></span><p class="barB__ax"><span class="n" style="left:0">0</span><span class="n" style="left:50%">50%</span><span class="n" style="left:100%">100%</span></p><span></span></div>
    </section>
  </main>
</div>
${colophon({ linksAfter: [{ html: '<a href="#s4" class="colB">발행 상태</a>' }] })}
</div>
${tabbar()}</div>`;
}

/* ───────── CSS ───────── */
const css = `
code{font:600 13px/1 var(--font-numeric);letter-spacing:.02em;color:var(--ink)}
.code{margin-top:12px;padding:10px 12px;background:var(--paper-2);font:600 12px/1.45 var(--font-numeric);white-space:pre-wrap;overflow-wrap:anywhere;color:var(--ink)}
.safe-wrap,.ios{position:relative}
.safe-wrap svg,.ios svg,.fr .edge>svg{display:block;width:100%;height:auto}
.safe-wrap .safe{position:absolute;inset:0}
.ios{border-radius:22.5%;overflow:hidden;width:min(180px,100%)}
.edge{outline:1px dashed var(--ink-3);outline-offset:0}
.ladder .edge{display:inline-block;line-height:0}
/* OG B */
.og--b{${OGPIN};background:var(--paper);color:var(--ink);outline:1px dashed var(--ink-3)}
.ogb__in{position:absolute;inset:0;display:grid;grid-template-rows:auto auto 1fr auto auto;padding:4.6cqw 6cqw 4.4cqw}
.og--btab .ogb__in{right:10.5cqw;padding-right:4.4cqw}
.ogb__rh{display:flex;justify-content:space-between;align-items:center;gap:2cqw;font-size:2.3cqw;font-weight:800;min-height:3.8cqw}
.ogb__rh>span:first-child{font:800 2cqw/1 var(--font-numeric);letter-spacing:.34em}
.ogb__rh .n{font:800 3cqw/1 var(--font-numeric)}
.ogb__rule{height:1.25cqw;margin-top:1.4cqw;border-top:.6cqw solid var(--ink);border-bottom:.17cqw solid var(--ink)}
.ogb__np{display:flex;align-items:center;min-height:0}
.ogb__t{font-size:14cqw;font-weight:800;letter-spacing:-.06em;line-height:1;white-space:nowrap}
.ogb__t--c{font-size:9.6cqw;white-space:normal;line-height:1.02;letter-spacing:-.05em}
.ogb__np--team{gap:3.4cqw}
.ogb__t--team{font-size:9cqw;white-space:normal;line-height:1.04;letter-spacing:-.05em}
.ogb__red{height:.5cqw;background:var(--brand-accent)}
.ogb__ft{display:flex;justify-content:space-between;align-items:baseline;gap:3cqw;margin-top:2cqw;font-size:2.5cqw;color:var(--ink-2)}
.ogb__ft b{color:var(--ink);font-weight:800}
.ogb__ft>span:last-child{text-align:right}
.ogb__en{font:600 2.8cqw/1.1 var(--font-numeric);letter-spacing:.02em;color:var(--ink)}
.ogb__tab{position:absolute;top:0;right:0;bottom:0;width:10.5cqw;display:flex;align-items:center;justify-content:center;background:var(--c);color:var(--competition-foreground);writing-mode:vertical-rl;text-orientation:upright;font-size:4.4cqw;font-weight:800;letter-spacing:.06em}
.ogb__ftab{display:inline-flex;align-items:center;height:3.8cqw;padding:0 1.3cqw;margin-left:.8cqw;background:var(--c);color:var(--competition-foreground);font-size:2.2cqw;font-weight:800;letter-spacing:0}
.ogb__bdg{flex:none;display:grid;grid-template-rows:3fr 2fr;width:12cqw;height:13.2cqw;background:var(--k2);outline:.25cqw solid var(--ink);outline-offset:0}
.ogb__bdg b{display:grid;place-items:center;background:var(--k1);color:var(--kf);font:800 4.4cqw/1 var(--font-numeric);letter-spacing:.04em}
/* 빈 상태 — 달력 괘선 판 */
.calh{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-size:14px;font-weight:800;margin-top:14px}
.calt{margin-top:12px;font-size:15px;font-weight:800;line-height:1.6}
.calt>span:not(.n){margin-left:10px}
.calt .n{font:800 19px/1 var(--font-numeric)}
.cb{width:100%;table-layout:fixed;margin-top:8px;border-top:1px solid var(--ink)}
.cb th{font-size:11.5px;font-weight:800;color:var(--ink-2);text-align:center;padding:6px 0 5px;border-bottom:1px solid var(--rule)}
.cb td{padding:2px}
.cb tbody tr:first-child td{padding-top:6px}
.cb__d>*{display:block;position:relative}
.cb__d{position:relative;height:52px;text-align:center;vertical-align:top}
.cb__d::before{content:"";position:absolute;inset:2px;pointer-events:none}
.cb__n{font:600 18px/1 var(--font-numeric);font-variant-numeric:tabular-nums lining-nums;color:var(--ink-2);padding-top:7px}
.cb__l{font-size:11px;font-weight:800;margin-top:4px;color:var(--ink)}
.cb__l .n{font:600 12px/1 var(--font-numeric)}
.cb__d--key::before{border:2px solid var(--brand-accent)}
.cb__d--key .cb__n{color:var(--ink);font-weight:800}
.cb__d--today::before{background:var(--ink)}
.cb__d--today>*{position:relative;color:var(--paper)!important}
.cb__d--win::before{background:repeating-linear-gradient(-45deg,var(--hatch) 0 5px,transparent 5px 10px)}
.cb__d--win.cb__d--today::before{background:var(--ink)}
.cb__d--match::before{border:2px solid var(--ink)}
.cb__d--match .cb__n{color:var(--ink);font-weight:800}
.cb__d--saved::before{border:1.5px solid var(--ink)}
.cb__d--saved .cb__n{color:var(--ink);font-weight:800}
.cb__d--gone::before{border:1px dashed var(--ink-3)}
.cb__d--gone .cb__l{color:var(--ink-2);font-weight:400}
.cb__d--fut .cb__n{color:var(--ink-2);font-weight:400}
.cb__d--gap::before{border:1px dotted var(--ink-2);inset:4px}
.cb__d--gap .cb__n{text-decoration:line-through 2px;color:var(--ink-2)}
.cb__d--gap .cb__l{color:var(--ink-2)}
.cb__d--pre .cb__l{font-weight:400;color:var(--ink-2)}
.cb__d--ok .cb__n,.cb__d--late .cb__n{color:var(--ink);font-weight:800}
.cb__m{display:inline-flex!important;justify-content:center;align-items:center;height:14px;margin-top:3px;font:800 14px/1 var(--font-numeric);color:var(--ink)}
.cb__d--late .cb__l .n{color:var(--ink-2)}
.cb__x2{display:inline-flex;margin-left:3px;color:var(--brand-accent-text)}
.cb__x{height:52px}
@media (min-width:1024px){.cb__d,.cb__x{height:60px}.cb__n{font-size:20px}}
.cbwrap .cb__d,.cbwrap .cb__x{height:66px}
.offB__n{font-size:15px;font-weight:800;margin-top:12px}
.restB{margin-top:12px;border-top:1px solid var(--rule);padding-top:12px}
.restB__w{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:var(--ink)}
.restB__w .n{font:600 14px/1 var(--font-numeric)}
.hatch-sw{width:16px;height:16px;background:repeating-linear-gradient(-45deg,var(--hatch) 0 3px,var(--paper) 3px 6px);outline:1px solid var(--ink-2)}
.ledB{margin:8px 0 4px}
.ledB li{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;padding:9px 0;border-bottom:1px solid var(--rule);font-size:13.5px}
.ledB__d{font-weight:800}
.ledB__d .n{font:800 17px/1 var(--font-numeric)}
.ledB li i{flex:1 1 24px;border-bottom:2px dotted var(--ink-3);min-width:24px;transform:translateY(-3px)}
.ledB__v{color:var(--ink-2)}
.ledB__v b{color:var(--ink);font-weight:800}
.idxB{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;margin-top:14px;padding-top:12px;border-top:2px solid var(--ink)}
.idxB__k{font:800 56px/.84 var(--font-latin);color:var(--ink)}
.idxB__h{font-size:16px;font-weight:800}
.idxB__l{margin-top:6px}
.idxB__l li{display:flex;align-items:baseline;gap:8px;min-height:34px;padding:8px 0 0;border-bottom:1px solid var(--rule);font-size:13.5px;color:var(--ink-2)}
.idxB__l li i{flex:1;border-bottom:2px dotted var(--ink-3);transform:translateY(-3px)}
.idxB__l .n{font:600 15px/1 var(--font-numeric);color:var(--ink)}
@media (min-width:1024px){.idxB__k{font-size:96px}}
.offlB{display:grid;gap:18px;margin-top:16px}
@media (min-width:1024px){.offlB{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:40px;align-items:start}}
.offlB__lg{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:400;color:var(--ink-2)}
.sw{display:inline-block;width:14px;height:14px}
.sw--saved{border:1.5px solid var(--ink)}.sw--gone{border:1px dashed var(--ink-3);margin-left:6px}
.btn--sm{min-height:44px;gap:8px;margin-top:12px;padding:0 14px}
.btn .ic{width:18px;height:18px}
/* /status B */
.ledgerB{margin-top:20px;border-top:2px solid var(--ink)}
.ledgerB>div{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;padding:12px 0;border-bottom:1px solid var(--rule)}
.ledgerB dt{display:flex;align-items:baseline;gap:8px;flex:1 1 auto;font-size:14px;color:var(--ink-2)}
.ledgerB dt::after{content:"";flex:1;min-width:20px;border-bottom:2px dotted var(--ink-3);transform:translateY(-3px)}
.ledgerB dd{font-size:15px;font-weight:800;text-align:right}
.ledgerB dd .n{font:800 17px/1 var(--font-numeric)}
.ledgerB dd .big{font-size:24px}
.ledgerB small{display:inline-block;margin-left:6px;font-size:12.5px;font-weight:400;color:var(--ink-2)}
.ledgerB small .n{font:600 14px/1 var(--font-numeric)}
@media (max-width:520px){.ledgerB>div{display:grid;grid-template-columns:1fr}.ledgerB dd{text-align:left}.ledgerB dt::after{display:none}}
.stB{margin-top:40px}
.cbwrap .cb{margin-top:12px}
.legB{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:12px;font-size:12.5px;color:var(--ink-2)}
.legB li{display:inline-block}
.legB li>.cb__m,.legB li>.legB__pre{vertical-align:-2px;margin-right:6px}
.legB .cb__m{margin:0;width:16px;display:inline-flex!important}
.legB li:nth-child(4) .cb__m{color:var(--brand-accent-text)}
.legB .n{font:600 14px/1 var(--font-numeric);color:var(--ink)}
.legB__pre{font-size:11px;padding:1px 4px;border:1px solid var(--rule);color:var(--ink-2)}
.tblwrap{overflow-x:auto;margin-top:12px}
.srcB{width:100%;font-size:13.5px}
.srcB th,.srcB td{padding:10px 8px 10px 0;border-bottom:1px solid var(--rule);text-align:left;vertical-align:baseline}
.srcB thead th{font-size:12px;font-weight:800;color:var(--ink-2);border-bottom:1px solid var(--ink);padding-top:0}
.srcB tbody th{font-weight:800}
.srcB .num{text-align:right}
.srcB td .n{font:800 16px/1 var(--font-numeric)}
.srcB .stB{margin:0;color:var(--ink-2);font-size:12.5px}
.srcB tr.is-flag .stB{color:var(--brand-accent-text);font-weight:800}
.srcB .stB .n{font:600 13.5px/1 var(--font-numeric)}
@media (max-width:640px){.srcB thead{display:none}.srcB tr{display:grid;grid-template-columns:minmax(0,1fr) auto auto;column-gap:12px;padding:10px 0;border-bottom:1px solid var(--rule)}.srcB th,.srcB td{border:0;padding:2px 0}.srcB tbody th{grid-column:1/-1}.srcB td.stB{grid-column:1/-1;order:5}.srcB td.num::before{content:attr(data-k) " ";font-size:12px;color:var(--ink-2)}}
.tier{display:inline-flex;align-items:center;gap:3px;height:24px;padding:0 6px;font:600 13px/1 var(--font-numeric);letter-spacing:.04em;white-space:nowrap}
.tier .n{font-weight:800!important;font-size:13px!important}
.tier--2{border:2px solid var(--ink)}.tier--3{border:1px dashed var(--ink-2);color:var(--ink-2)}
.barB{display:grid;grid-template-columns:96px minmax(0,1fr) 84px;align-items:center;gap:12px;margin-top:14px}
.barB__k{font-size:13px;font-weight:800}
.barB__t{position:relative;height:12px;border-bottom:1px solid var(--ink)}
.barB__t i{position:absolute;left:0;bottom:0;height:12px;background:var(--brand-accent);min-width:2px}
.barB__50{position:absolute;left:50%;bottom:0;height:8px;border-left:1px solid var(--ink-2)}
.barB__v{font-size:13px;font-weight:800;text-align:right}
.barB--axis{margin-top:2px}
.barB__ax{position:relative;height:14px;font:600 12px/1 var(--font-numeric);color:var(--ink-2)}
.barB__ax span{position:absolute;top:2px;transform:translateX(-50%);white-space:nowrap}
.barB__ax span:first-child{transform:none}.barB__ax span:last-child{transform:translateX(-100%)}
.barB__v .n{font:800 22px/1 var(--font-numeric)}
.barB--prev .barB__k,.barB--prev .barB__v{color:var(--ink-2)}
.barB--prev .barB__t i{background:var(--ink-2)}
.toc{margin-top:10px}
.toc a{display:flex;align-items:baseline;gap:6px;min-height:44px;padding:10px 0;border-bottom:1px solid var(--rule);font-size:14px;color:var(--ink);text-decoration:none}
.toc a i{flex:1;border-bottom:2px dotted var(--ink-3);transform:translateY(-3px)}
`;

export function build() {
  const m = meta({
    name: 'B 제호 (Nameplate)',
    one: '조간 1면 머리의 제호 띠와 판권면 — 크림 지면 위에 한글 제호 · 3px 잉크 괘선 · 리더 점선만으로 조판한다.',
    pros: ['‘Editorial, not portal’에 가장 충실하고 차분하다 — 아이콘 · OG · 빈 상태 · /status가 모두 지면의 조판이다', '크림 OG는 메신저의 흰 · 검 바탕 어디서나 ‘종이’로 읽히고, 대회 OG가 화면과 같은 라이트 대회 색을 쓴다', '/status가 원장(리더 행) + 달력 표 + 소스 표라 3초 스캔과 스크린리더에 가장 강하다 — 30칸 모두 시각 숫자가 칸 안에 있다', '빈 상태가 기존 M1-34 달력 · D2 색인 컴포넌트를 재사용해 새 SVG가 거의 없다(가장 가벼움)'],
    cons: ['크림 아이콘은 흰 런처 바탕(경계 1.12)에 묻힌다 — 잉크 괘선 · 글자만 형태를 만든다', '한글 “유” 한 글자는 브랜드를 알아보는 근거가 약하다(“유” = 유튜브 · 유통 등으로도 읽힘)', '그림이라 할 요소가 적어 D3 기대(빈 상태 조형)와 거리가 있다 — 달력 · 색인은 조형보다 표에 가깝다', '/status 달력 표는 375에서 칸이 49px로 좁아 시각(“20:28”)이 빽빽하다'],
    diff: '<b>하~중</b> — 아이콘은 “유” 글리프 path 변환 1회 + 사각형 3개. OG 템플릿 1개 + 변형 3(대회 탭 · 팀 배지), 빈 상태는 M1-34 달력 · D2 색인 컴포넌트 재사용(CSS 위주), /status는 서버 컴포넌트 JS 0.',
    bundle: '폰트 변화 0 — EuroDigest Sans 400 · 800 + Barlow Condensed 600 · 800(417.8KB, 2패밀리 4파일). 새 색 토큰 0, OG 전용 변수 4개 제거. favicon.svg 약 0.7KB(“유” path 포함 추정) · ico 약 1.5KB.',
    rules: '없음. 휴식기 S4 변형(A매치 기간 달력)은 화면 결정. /status 달력은 M1-34 달력 칸 규칙에 상태 기호(체크 · 느낌표 · 대시 · 엑스 — 체크와 엑스는 SVG)를 더한다.',
    axes: AXES, me: 1,
  });
  const body = `${m}
${topbar('D3 시안 B · 제호')}
<div class="board">
  <header class="hero"><p class="hero__k" lang="en" aria-hidden="true">D3 · NAMEPLATE</p><h1>B 제호</h1><p>조간 1면 머리의 제호 띠와 판권면. 크림 지면 위에 한글 제호 · 잉크 괘선 · 리더 점선만으로 조판하고, 레드는 괘선 한 줄로만 쓴다.</p></header>
  ${sIcons()}
  ${sOg()}
  ${sEmpty()}
</div>
${sStatus()}`;
  return page({
    file: 'concept-b.html', title: 'D3 시안 B · 제호 — 유로 다이제스트',
    comment: `D3 시안 B — 제호 (Nameplate)
한 줄: 조간 1면 머리의 제호 띠와 판권면 — 크림 지면 위 한글 제호 · 잉크 괘선 · 리더 점선만으로 조판
장점: Editorial에 가장 충실 · 크림 OG는 어디서나 종이 · /status 표가 3초 스캔 · 스크린리더에 강함 · 빈 상태가 기존 컴포넌트 재사용
단점: 크림 아이콘이 흰 런처에 묻힘(1.12) · "유" 한 글자의 브랜드 인지 약함 · 조형보다 표에 가까움 · 375 달력 칸 좁음
구현 난이도: 하~중 (유 글리프 path 1회, OG 템플릿 1 + 변형 3, 빈 상태 CSS 위주, /status JS 0)
번들/폰트: 폰트 변화 0 (EuroDigest Sans 400·800 + Barlow Condensed 600·800 = 417.8KB, ../fonts/ 로컬), 새 색 토큰 0, OG 전용 변수 4개 제거
데이터: docs/design/d3/data/d3-data.json (실값, 2026-11-02 기준). 문구 생성·LLM 호출 0
견본 단독 렌더: ?solo=<data-solo 값>&w=1200 (예: ?solo=og-news-22)`,
    css, body,
  });
}
