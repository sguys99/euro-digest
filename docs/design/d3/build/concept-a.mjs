// D3 시안 A — 입장권 (Admission): 모든 산출물을 마스트헤드 티켓의 한 조각으로 만든다.
import { D, ST, TOK, COMP, TEAM, IC, esc, n, ftab, itab, badge, md, dow, longDate, shortDate, pix, pixZoom, ticket, tabbar, colophon, meta, AXES, topbar, previews, DAYSTATE, SRCSTATE, pct, page } from './common.mjs';

const T = TOK;
/* ───────── 1. 아이콘 ───────── */
// 512 좌표. 글자는 웹폰트로 그린 견본이다 — 구현(M5-02)에서는 글리프 외곽선을 path로 옮긴다(notes-a §5).
const ED = (x, y, size, fill) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Barlow Condensed" font-weight="800" font-size="${size}" letter-spacing="${(-size * 0.01).toFixed(1)}" fill="${fill}">ED</text>`;
const perfRow = (y, x0, x1, r, fill, step = 18) => { let s = ''; for (let x = x0; x <= x1 + 0.1; x += step) s += `<circle cx="${x.toFixed(1)}" cy="${y}" r="${r}" fill="${fill}"/>`; return s; };
function iconA(kind, { face = T.ticketL, fg = T.ticketFgL, label = '' } = {}) {
  const aria = label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"';
  if (kind === 'any') {
    // 투명 노치(좌우) + 가로 천공 — 375 마스트헤드의 천공 줄과 같은 방향
    const y = 384, r = 36;
    return `<svg viewBox="0 0 512 512"${aria}><path d="M0 0H512V${y - r}A${r} ${r} 0 0 0 512 ${y + r}V512H0V${y + r}A${r} ${r} 0 0 0 0 ${y - r}Z" fill="${face}"/>${ED(256, 312, 330, fg)}${perfRow(y, 62, 450, 5.6, fg, 17.6)}<rect x="216" y="438" width="80" height="16" fill="${T.accentL}"/></svg>`;
  }
  if (kind === 'maskable' || kind === 'apple') {
    // 면을 꽉 채움(투명 0). 그림은 가운데 지름 80% 안전 원 안에만
    return `<svg viewBox="0 0 512 512"${aria}><rect width="512" height="512" fill="${face}"/>${ED(256, 292, 236, fg)}${perfRow(338, 112, 400, 4.6, fg, 14.4)}<circle cx="96" cy="338" r="9" fill="${fg}"/><circle cx="416" cy="338" r="9" fill="${fg}"/><rect x="224" y="374" width="64" height="13" fill="${T.accentL}"/></svg>`;
  }
  // small — 16·32·48: 천공 · 막대를 빼고 ED만
  return `<svg viewBox="0 0 512 512"${aria}><rect width="512" height="512" fill="${face}"/>${ED(256, 392, 440, fg)}</svg>`;
}
const P16 = [
  '................',
  '................',
  '................',
  '..#####.#####...',
  '..#####.######..',
  '..##....##..##..',
  '..##....##..##..',
  '..####..##..##..',
  '..####..##..##..',
  '..##....##..##..',
  '..##....##..##..',
  '..#####.######..',
  '..#####.#####...',
  '................',
  '................',
  '................',
].map((r) => r);
const pal16L = { '.': T.ticketL, '#': T.ticketFgL };
const pal16D = { '.': T.ticketD, '#': T.ticketFgD };
const SAFE = `<svg viewBox="0 0 512 512" class="safe" aria-hidden="true"><circle cx="256" cy="256" r="204.8" fill="none" stroke="${T.accentD}" stroke-width="3" stroke-dasharray="10 8"/><path d="M256 0V512M0 256H512" stroke="${T.accentD}" stroke-width="1.5" stroke-dasharray="4 6"/></svg>`;
const faviconSrc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>.f{fill:${T.ticketL}}@media (prefers-color-scheme:dark){.f{fill:${T.ticketD}}}</style><rect class="f" width="32" height="32"/><path fill="${T.ticketFgL}" d="…ED 글리프 외곽선(M5-02에서 생성)…"/></svg>`;

export function sIcons() {
  const ladder = [16, 32, 48].map((s) => `<figure><div>${iconA('small', { label: `작은 아이콘 ${s}px` }).replace('<svg ', `<svg width="${s}" height="${s}" `)}</div><figcaption>${s}</figcaption></figure>`).join('')
    + `<figure><div>${iconA('apple', { label: 'apple-touch-icon 180px' }).replace('<svg ', '<svg width="180" height="180" ')}</div><figcaption>180 apple</figcaption></figure>`
    + `<figure><div class="chk">${iconA('any', { label: 'any 192px' }).replace('<svg ', '<svg width="192" height="192" ')}</div><figcaption>192 any</figcaption></figure>`
    + `<figure class="big"><div class="chk">${iconA('any', { label: 'any 512px' }).replace('<svg ', '<svg width="512" height="512" ')}</div><figcaption>512 any — 좁은 화면에서는 폭에 맞춰 줄여 보임</figcaption></figure>`;
  const masks = (cls) => ['m-circle', 'm-squircle', 'm-round'].map((m, i) => `<figure><div class="${m}">${iconA('maskable').replace('<svg ', '<svg width="60" height="60" ')}</div><figcaption>유로 다이제스트<span>${['원', '스퀴클', '둥근 사각'][i]}</span></figcaption></figure>`).join('');
  const tab = (dark) => `<div class="tabs tabs--${dark ? 'd' : 'l'}"><div class="tabs__t tabs__t--on">${pix(P16, dark ? pal16D : pal16L, { title: `파비콘 16px ${dark ? '다크' : '라이트'}` })}<span>유로 다이제스트</span></div><div class="tabs__t"><i aria-hidden="true"></i><span>새 탭</span></div></div>`;
  return `<section id="s1" class="blk" aria-labelledby="s1h">
  <div class="sec-h"><h2 id="s1h"><span class="blk__no">1</span>앱 아이콘</h2><span class="rh" aria-hidden="true" lang="en">ICONS</span></div>
  <p class="sub2">티켓 스텁을 그대로 줄였다. 네이비 면(라이트 <code>--ticket</code>) · 지면색 <b>ED</b>(Barlow 800) · 가로 천공 · 스팟 레드 막대 하나. any만 좌우 노치를 투명으로 뚫고, maskable · apple은 면을 꽉 채운다.</p>
  <div class="grid3" style="margin-top:18px">
    <figure class="fr"><p class="fr__cap"><b>any 512</b><span class="path">public/icons/icon-512.png</span> · 192 같은 그림</p><div class="chk">${iconA('any', { label: 'any 아이콘 — 네이비 면, ED, 가로 천공, 좌우 투명 노치' })}</div></figure>
    <figure class="fr"><p class="fr__cap"><b>maskable 512</b><span class="path">icon-maskable-512.png</span> · 점선 원 = 안전 영역 지름 80%</p><div class="safe-wrap">${iconA('maskable', { label: 'maskable 아이콘 — 안전 원 안의 ED와 천공' })}${SAFE}</div></figure>
    <figure class="fr"><p class="fr__cap"><b>apple-touch 180</b><span class="path">apple-touch-icon.png</span> · 투명 0 · iOS가 모서리를 깎음</p><div class="ios">${iconA('apple', { label: 'apple-touch 아이콘' })}</div></figure>
  </div>
  <h3 class="h3">크기 사다리 <small lang="en">16 · 32 · 48 · 180 · 192 · 512</small></h3>
  <div class="ladder">${ladder}</div>
  <h3 class="h3">런처 마스크 · 홈 화면 바탕 <small lang="en">LAUNCHER</small></h3>
  <div class="devices"><div class="home home--l">${masks()}</div><div class="home home--d">${masks()}</div></div>
  <p class="sub2">바탕은 기기 색 견본(흰 · 검)이다. 네이비 면은 두 바탕 모두에서 윤곽이 선다 — 흰 바탕 대비 15.7, 검 바탕은 면 경계 1.3이지만 지면색 ED · 천공이 형태를 만든다.</p>
  <h3 class="h3">파비콘 · 브라우저 탭 <small lang="en">FAVICON</small></h3>
  <div class="grid2">
    <div class="fr"><p class="fr__cap"><b>favicon.svg</b><span class="path">public/favicon.svg</span> — 라이트 탭 네이비 · 다크 탭 벽돌 레드(<code>prefers-color-scheme</code> — 사이트 다크 티켓과 같은 짝)</p>${tab(false)}${tab(true)}
      <pre class="code" aria-label="favicon.svg 구조">${esc(faviconSrc)}</pre></div>
    <div class="fr"><p class="fr__cap"><b>favicon.ico 16 · 32</b><span class="path">public/favicon.ico</span> — 16은 픽셀 격자에 맞춰 손으로 그린다(벡터 축소는 흐려짐)</p>
      <div class="px">
        <figure>${pix(P16, pal16L, { px: 16, title: '16px 라이트' })}<figcaption>16</figcaption></figure>
        <figure>${iconA('small').replace('<svg ', '<svg width="32" height="32" ')}<figcaption>32</figcaption></figure>
        <figure class="zoom">${pixZoom(P16, pal16L, '16px 격자 8배 확대')}<figcaption>16 × 8 확대</figcaption></figure>
        <figure class="zoom">${pixZoom(P16, pal16D, '16px 다크 격자 8배 확대')}<figcaption>다크 탭용 (svg만)</figcaption></figure>
      </div></div>
  </div>
</section>`;
}

/* ───────── 2. OG ───────── */
const OGPIN = `--ticket:${T.ticketL};--ticket-fg:${T.ticketFgL};--ticket-fg-2:${T.ticketFg2L};--paper:${T.paperL};--competition-foreground:${T.paperD};` + Object.entries(T.compD).map(([k, v]) => `--competition-${{ EPL: 'epl', LALIGA: 'laliga', SERIEA: 'seriea', BUNDESLIGA: 'bundesliga', LIGUE1: 'ligue1', UCL: 'ucl' }[k]}:${v}`).join(';');
function ogShell(id, stub, main, { stubCls = '', stubStyle = '', alt }) {
  return `<div class="og og--a" data-solo="${id}" role="img" aria-label="${esc(alt)}"><div class="oga__stub ${stubCls}"${stubStyle ? ` style="${stubStyle}"` : ''}>${stub}</div><span class="oga__perf" aria-hidden="true"></span><div class="oga__main">${main}</div></div>`;
}
const sign = `<p class="oga__sig">유로 다이제스트 <span lang="en">EURO DIGEST</span></p>`;
const ogDefault = (id = 'og-default') => ogShell(id, `<p class="oga__mark" aria-hidden="true">ED</p>`, `<p class="oga__wm">유로 다이제스트</p><p class="oga__en" lang="en">EURO DIGEST</p><p class="oga__ft oga__ft--tag">${esc(D.copy.tagline)}</p>`, { alt: `유로 다이제스트 — ${D.copy.tagline}` });
const ogNews = (iss, id) => ogShell(id, `<p class="oga__no"><span class="k">제</span><span class="n">${iss.no}</span><span class="k">호</span></p>`, `<p class="oga__wm">유로 다이제스트</p><p class="oga__en" lang="en">EURO DIGEST</p><p class="oga__ft">${esc(iss.label)}</p>`, { alt: `유로 다이제스트 제 ${iss.no}호, ${iss.label}` });
const ogComp = (c, id) => ogShell(id, `<p class="oga__short">${esc(c.shortKo)}</p>`, `<p class="oga__season"><span class="n">${c.season}</span> 시즌</p><p class="oga__name">${esc(c.nameKo)}</p><p class="oga__en2" lang="en">${esc(c.nameEn)}</p>${sign}`, { stubCls: `tab--${{ EPL: 'epl', LALIGA: 'laliga', SERIEA: 'seriea', BUNDESLIGA: 'bundesliga', LIGUE1: 'ligue1', UCL: 'ucl' }[c.id]} oga__stub--c`, alt: `유로 다이제스트 · ${c.nameKo} ${c.season} 시즌` });
const compTab = (id) => `<span class="oga__tab tab--${{ EPL: 'epl', LALIGA: 'laliga', SERIEA: 'seriea', BUNDESLIGA: 'bundesliga', LIGUE1: 'ligue1', UCL: 'ucl' }[id]}">${esc(COMP[id].shortKo)}</span>`;
const ogTeam = (t, id) => ogShell(id, `<div class="oga__kit" style="--k1:${t.k1};--k2:${t.k2};--kf:${t.kf}"><b>${esc(t.short)}</b><i></i></div>`, `<p class="oga__tabs">${[t.comp, ...t.alsoIn].map(compTab).join('')}</p><p class="oga__name">${esc(t.nameKo)}</p><p class="oga__en2" lang="en">${esc(t.nameEn)}</p>${sign}`, { stubCls: 'oga__stub--k', alt: `유로 다이제스트 · ${t.nameKo} (${t.short}) · ${[t.comp, ...t.alsoIn].map((c) => COMP[c].nameKo).join(' · ')}` });

export function sOg() {
  const today = D.today, i100 = D.issue100;
  const lab = (p, note = '') => `<p class="ogf__l"><span class="path">${p}</span>${note ? `<span>${note}</span>` : ''}</p>`;
  const big = ['EPL', 'BUNDESLIGA', 'UCL'], small = ['LALIGA', 'SERIEA', 'LIGUE1'];
  return `<section id="s2" class="blk" aria-labelledby="s2h">
  <div class="sec-h"><h2 id="s2h"><span class="blk__no">2</span>OG 이미지 1200×630</h2><span class="rh" aria-hidden="true" lang="en">OPEN GRAPH</span></div>
  <p class="sub2">D0 견본 티켓을 정리했다. 스텁 31% · 세로 천공 · 위아래 노치 · 본문. 면은 라이트 티켓 토큰 고정(<code>--ticket</code> ${T.ticketL} · <code>--ticket-fg</code> · <code>--ticket-fg-2</code> · 천공 <code>--paper</code>) — 옛 <code>--og-*</code> 4개를 없앤다. 네이비 면 위 대회 색은 다크 값. <b>결과 노출 0</b> — 스코어 · 순위 · 승점 · 폼 · 5줄 · 원제목 · 포메이션 · 한줄평 없음.</p>
  <h3 class="h3">기본 · 날짜 <small lang="en">DEFAULT · ISSUE</small></h3>
  <div class="ogset">
    <div class="ogf ogf--hero">${lab('/og/default.png', '홈 <span class="path">/</span> · 쪽 이름형 OG의 바탕')}${ogDefault()}</div>
    <div class="ogset ogset--2">
      <div class="ogf">${lab(`/og/news/${today.date}.png`, `제 ${today.no}호 · <span class="path">/news/</span> 최신 호`)}${ogNews(today, 'og-news-22')}</div>
      <div class="ogf">${lab(`/og/news/${i100.date}.png`, '제 100호 — 3자리도 같은 크기')}${ogNews(i100, 'og-news-100')}</div>
    </div>
  </div>
  <h3 class="h3">대회 <small lang="en">COMPETITIONS · 6</small></h3>
  <div class="ogset ogset--3">${big.map((id) => `<div class="ogf">${lab(`/og/competitions/${id.toLowerCase()}.png`)}${ogComp(COMP[id], `og-c-${id.toLowerCase()}`)}</div>`).join('')}</div>
  <div class="ogset ogset--3" style="margin-top:14px">${small.map((id) => `<div class="ogf ogf--s">${lab(`/og/competitions/${id.toLowerCase()}.png`, '축소판')}${ogComp(COMP[id], `og-c-${id.toLowerCase()}`)}</div>`).join('')}</div>
  <h3 class="h3">팀 <small lang="en">TEAMS · 111</small></h3>
  <div class="ogset ogset--2">${['rennes', 'atletico-madrid', 'borussia-monchengladbach', 'bayern-munchen'].map((s) => `<div class="ogf">${lab(`/og/teams/${s}.png`, { rennes: '이름 1자', 'atletico-madrid': '10자 · 두 줄', 'borussia-monchengladbach': '흰 상의 — 면 경계 지면색 테두리', 'bayern-munchen': '소속 + UCL 탭 2개' }[s])}${ogTeam(TEAM[s], `og-t-${s}`)}</div>`).join('')}</div>
  <h3 class="h3">링크 미리보기 <small lang="en">PREVIEW</small></h3>
  ${previews({
    home: { og: ogDefault('pv-default'), title: '유로 다이제스트', desc: D.copy.tagline, alt: `유로 다이제스트 — ${D.copy.tagline}` },
    news: { og: ogNews(today, 'pv-news'), title: `제 ${today.no}호 · ${today.label} · 유로 다이제스트`, desc: '오늘의 5줄과 유럽 축구 소식', alt: `유로 다이제스트 제 ${today.no}호, ${today.label}` },
  })}
</section>`;
}

/* ───────── 3. 빈 상태 ───────── */
const brief = (inner, sub = '11월 1일 경기 기준') => `<div class="sec-h"><h3 class="h">오늘의 5줄</h3><span class="rh" aria-hidden="true" lang="en">STARTING FIVE</span></div><p class="sub">${sub}</p>${inner}`;
// 입장권 — D2 다음 경기 입장권 문법(1.5px 잉크 테두리 · 2px 점선 절취선 · 위아래 노치)
const adm = ({ cls = '', stub, body, label }) => `<article class="adm ${cls}" aria-label="${esc(label)}"><div class="adm__stub">${stub}</div><span class="adm__perf" aria-hidden="true"></span><div class="adm__body">${body}</div></article>`;
function sEmpty() {
  const e = D.emptyStates, ucl = COMP[e.ended.comp], lal = COMP[e.upcomingSample.comp];
  const offEnded = adm({ label: `${ucl.nameKo} ${ucl.season} 시즌 종료 ${longDate(e.ended.date)}`, stub: `<time class="adm__n" datetime="${e.ended.date}">${md(e.ended.date)}</time><span class="adm__y n">${e.ended.date.slice(0, 4)}</span><span class="adm__k">종료</span>`, body: `<p class="adm__c">${ftab('UCL')}<span>${esc(ucl.nameKo)} <span class="n">${ucl.season}</span> 시즌</span></p><p class="adm__note">${esc(D.copy.offSeason.ended.note)}</p><a class="tlink" href="#top">주요 뉴스로<span aria-hidden="true"> ↓</span></a>` });
  const offUp = adm({ cls: 'adm--sample', label: `견본: ${lal.nameKo} ${lal.season} 시즌 개막 ${longDate(e.upcomingSample.date)}`, stub: `<time class="adm__n" datetime="${e.upcomingSample.date}">${md(e.upcomingSample.date)}</time><span class="adm__y n">${e.upcomingSample.date.slice(0, 4)}</span><span class="adm__k">개막</span>`, body: `<p class="adm__c">${ftab('LALIGA')}<span>${esc(lal.nameKo)} <span class="n">${lal.season}</span> 시즌</span><span class="stamp stamp--ph">견본</span></p><p class="adm__note">${esc(D.copy.offSeason.upcoming.note)}</p>` });
  const im = D.intl.matches;
  const intlT = (m, i) => adm({ cls: `adm--intl adm--i${i}`, label: `A매치 ${shortDate(m.date)} ${m.time} KST ${m.opponent} ${m.venue} ${m.home ? '홈' : '원정'} ${m.competition}`, stub: `<time class="adm__n" datetime="${m.utc}">${m.md}</time><span class="adm__y">(${m.dow}) <span class="n">${m.time}</span></span><span class="adm__k">KST</span>`, body: `<p class="adm__c"><span class="stamp">${esc(m.competition)}</span><span class="adm__h">대한민국 <span class="vs">vs</span> ${esc(m.opponent)}</span></p><p class="adm__note">${esc(m.venue)} · ${m.home ? '홈' : '원정'}</p>` });
  const rest = `<div class="restA"><p class="lead">오늘은 5줄을 쉽니다</p><p class="body2">전날 6개 대회에 끝난 경기가 없었습니다.</p><p class="restA__w"><span class="stamp">A매치 기간</span><span class="n">${md(D.intl.from)} – ${md(D.intl.to)}</span></p><div class="stackA">${im.map(intlT).join('')}</div><a class="tlink" href="#top">주요 뉴스로<span aria-hidden="true"> ↓</span></a></div>`;
  const holes = ['선수', '팀', '대회', '뉴스'];
  const search = `<div class="srch">${IC.search}<span lang="en">${esc(e.searchQuery)}</span></div>` + adm({ cls: 'adm--chk', label: `“${e.searchQuery}” 결과 없음 — 선수 0 팀 0 대회 0 뉴스 0`, stub: `<ol class="chk4" role="list">${holes.map((h) => `<li><i aria-hidden="true"></i><span>${h} <span class="n">0</span></span></li>`).join('')}</ol>`, body: `<p class="adm__h"><span class="adm__q">“<span lang="en">${esc(e.searchQuery)}</span>”</span> ${esc(D.copy.search.none)}</p><p class="adm__note">${esc(D.copy.search.hint)}</p>` });
  const saved = ['2026-11-02', '2026-11-01', '2026-10-31'];
  const offline = `<div class="sec-h"><h3 class="h">${esc(D.copy.offline.h1)}</h3><span class="rh" aria-hidden="true" lang="en">OFFLINE</span></div>
  <div class="offA"><div class="offA__s"><span class="adm__n">${saved.length}</span><span class="adm__k">저장한 호</span></div>
    <div class="offA__b"><p class="lead">${esc(D.copy.offline.lead)}</p><p class="body2">${esc(D.copy.offline.body)}</p><button class="btn btn--sm" type="button">${IC.retry}다시 시도</button></div></div>
  <div class="sec-h sec-h--thin" style="margin-top:28px"><h4 class="h">${esc(D.copy.offline.saved)}</h4><span class="rh" aria-hidden="true" lang="en">SAVED</span></div>
  <ul class="offline-list" role="list">${saved.map((d) => `<li><a href="#top"><span class="d">${md(d)}</span><span class="w">(${dow(d)})</span><span class="no">제 <span class="n">${(Date.parse(d) - Date.parse('2026-10-12')) / 864e5 + 1}</span>호</span></a></li>`).join('')}</ul>`;
  const ctx = (lbl, inner, ba) => `<figure class="ctx"><figcaption class="ctx__lbl">${lbl}</figcaption>${inner}<div class="ba">${ba}</div></figure>`;
  const ba = (before, after) => `<div class="ba__row"><span class="ba__k">지금</span><span>${before}</span></div><div class="ba__row"><span class="ba__k">새</span><span>${after}</span></div>`;
  return `<section id="s3" class="blk" aria-labelledby="s3h">
  <div class="sec-h"><h2 id="s3h"><span class="blk__no">3</span>빈 상태 조형</h2><span class="rh" aria-hidden="true" lang="en">EMPTY</span></div>
  <p class="sub2">'아직 검표하지 않은 표'. 새 그림 없이 D2 입장권(1.5px 잉크 테두리 · 점선 절취선 · 노치)과 이적 단계 펀치 구멍만 쓴다. 표 안의 날짜 · 상대는 설정 파일 실값이다.</p>
  <div class="es grid2" style="margin-top:18px">
    ${ctx('<b>비시즌 · 종료</b><span>견본 날 6월 7일 — 결승 다음 날부터 · UCL endDate</span>', brief(offEnded, '6월 6일 경기 기준'), ba('평탄 탭 + “2027.06.05 종료” 34px + 안내 — 글자만', '종료 입장권 — 스텁에 날짜 N2 · 본문에 대회 탭 · 시즌 · 안내'))}
    ${ctx('<b>비시즌 · 개막</b><span>견본 날 8월 15일 — 2027-28 설정 전이라 라리가 지난 개막일</span>', brief(offUp, '8월 14일 경기 기준'), ba('평탄 탭 + 날짜 + “개막” — 글자만', '개막 입장권 — 같은 틀, 낱말만 “개막”'))}
    ${ctx('<b>휴식기 · A매치 기간</b><span>견본 날 11월 12일 — national-team.json 경기일 ±3일</span>', brief(rest, '11월 11일 경기 기준'), ba('S4 그대로 — 레드 윤곽 ‘0’ + “오늘은 5줄을 쉽니다” + 이유 1줄', 'S4 문구 아래 A매치 입장권 2장 겹침(11.13 · 11.17, 도하) — <b>새 S4 변형(결정 필요)</b>'))}
    ${ctx('<b>검색 결과 없음</b><span>오버레이 · <span class="path">/search/</span> 공용 · e2e 0건 질의</span>', search, ba('윤곽 ‘0’ 64px + “결과가 없어요” + 안내', '검표 4칸(선수 · 팀 · 대회 · 뉴스)이 모두 빈 작은 표 — 유형별 0을 한 번에'))}
  </div>
  <figure class="ctx" style="margin-top:16px"><figcaption class="ctx__lbl"><b>/offline/ 화면</b><span>서비스 워커가 저장하지 않은 쪽을 열면 — 셸은 /status와 같다</span></figcaption>${offline}<div class="ba">${ba('h1 + OFFLINE + 안내 2줄 + 다시 시도 + 저장해 둔 호 목록 — 글자만', '스텁만 남은 표 — 저장한 호(실선 스텁) · 열 수 없는 쪽(점선 본문). 목록은 괘선 사이 행 그대로')}</div></figure>
</section>`;
}

/* ───────── 4. /status ───────── */
function sStatus() {
  const L = ST.lastPublish, R = ST.runRate, C = ST.cost, DC = ST.dayCounts;
  const early = (() => { const [h1, m1] = L.target.split(':').map(Number), [h2, m2] = L.finished.split(':').map(Number); return h1 * 60 + m1 - (h2 * 60 + m2); })();
  const hole = (d) => {
    const st = DAYSTATE[d.state];
    const lbl = `${shortDate(d.date)}${d.no ? ` 제 ${d.no}호` : ''} ${st.k}${d.finished ? ` · 수집 완료 ${d.finished}` : ''}${d.failedRuns.length ? ` · 실패 실행 ${d.failedRuns.length}회(${d.failedRuns.map((f) => f.started).join(', ')})` : ''}`;
    const tick = ['10-04', '10-12', '10-19', '10-26', '11-02'].includes(d.date.slice(5)) ? `<span class="ph30__t" aria-hidden="true">${d.md}</span>` : '';
    return `<li class="h h--${d.state}${d.failedRuns.length ? ' h--x' : ''}" title="${esc(lbl)}"><i aria-hidden="true"></i><span class="sr">${esc(lbl)}</span>${tick}</li>`;
  };
  const srow = (s, i) => {
    const sh = s.perDay.map((p) => `<i class="sh sh--${p.state}" title="${p.md} ${SRCSTATE[p.state]}"></i>`).join('');
    const tier = `<span class="tier tier--${s.tier}">Tier <span class="n">${s.tier}</span></span>`;
    const note = s.staleStreak >= 7 ? `<span class="srcA__flag">새 기사 없음 <span class="n">${s.staleStreak}</span>회 연속</span>` : '';
    return `<li class="srcA"><button class="srcA__b" type="button" aria-expanded="false" aria-controls="srcd-${i}">
      <span class="srcA__stub">${tier}</span><span class="srcA__perf" aria-hidden="true"></span>
      <span class="srcA__name"><b ${s.lang === 'ko' ? '' : `lang="${s.lang}"`}>${esc(s.name)}</b>${note}</span>
      <span class="srcA__holes" aria-label="최근 7일: ${s.perDay.map((p) => `${p.md} ${SRCSTATE[p.state]}`).join(', ')}">${sh}</span>
      <span class="srcA__ok"><span class="n">${s.ok}/${s.attempts}</span><small>응답</small></span>
      <span class="srcA__new"><span class="n">${s.usable}</span><small>새 기사</small></span>
      <span class="srcA__chev">${IC.down}</span></button>
      <div class="srcA__d" id="srcd-${i}" hidden><dl><div><dt>실행</dt><dd><span class="n">${s.runs}</span>회</dd></div><div><dt>응답 성공</dt><dd><span class="n">${s.ok}</span>회</dd></div><div><dt>원문 항목</dt><dd><span class="n">${s.items}</span></dd></div><div><dt>창 안 새 항목</dt><dd><span class="n">${s.usable}</span></dd></div><div><dt>실패 연속</dt><dd><span class="n">${s.failStreak}</span></dd></div><div><dt>새 기사 없음 연속</dt><dd><span class="n">${s.staleStreak}</span></dd></div></dl></div></li>`;
  };
  const failDay = ST.days.find((d) => d.failedRuns.length);
  return `<div class="divider divider--screen" id="s4"><span><b>화면 4 · /status/</b> 앱 셸 안의 한 쪽 — 뒤표지 링크로 들어온다</span><span class="divider__info">375 하단 탭 · 1024+ 상단 내비 · 목차 열</span></div>
<div class="scr"><div class="shell">
${ticket()}
<div class="layout">
  <aside class="contents" aria-label="이 쪽 목차"><div class="sec-h"><h2 class="h">이 쪽</h2><span class="rh" aria-hidden="true" lang="en">CONTENTS</span></div>
    <ul class="toc" role="list"><li><a href="#st-last"><span>마지막 발행</span><i></i><span class="n">${L.finished}</span></a></li><li><a href="#st-30"><span>최근 30일</span><i></i><span class="n">${pct(R.pct)}%</span></a></li><li><a href="#st-src"><span>소스</span><i></i><span class="n">${ST.sources.length}</span></a></li><li><a href="#st-cost"><span>이번 달 비용</span><i></i><span class="n">${C.thisMonth.pct.toFixed(2)}%</span></a></li></ul></aside>
  <main class="page" id="main">
    <div class="sec-h"><h1 class="h">발행 상태</h1><span class="rh" aria-hidden="true" lang="en">STATUS</span></div>
    <p class="st-basis">이 쪽 기준 <time datetime="2026-11-02T13:39+09:00">${shortDate(D.today.date)} 13:39 KST</time> · 발행할 때마다 다시 만든다</p>

    <section id="st-last" class="stA" aria-labelledby="st-last-h">
      <h2 id="st-last-h" class="sr">마지막 발행</h2>
      <div class="tixA"><div class="tixA__stub"><p class="tixA__k">마지막 발행</p><p class="tixA__no"><span class="k">제</span><span class="n">${L.no}</span><span class="k">호</span></p><p class="tixA__d"><time datetime="${L.date}">${esc(L.label)}</time></p></div><span class="tixA__perf" aria-hidden="true"></span>
      <div class="tixA__main"><p class="tixA__big"><time datetime="${L.date}T${L.finished}+09:00" class="n">${L.finished}</time><span>KST</span></p><p class="tixA__cap">수집 완료 · 시작 <span class="n">${L.started}</span></p>
        <p class="tixA__vs"><span>공개 목표 <b class="n">${L.target}</b></span><span>목표보다 <b class="n">${early}</b>분 앞</span></p>
        <p class="tixA__ph"><b>자리</b> 배포 완료 시각 — 실행 기록에 없음 · 채울 단계 <span class="n">M5-15</span></p></div></div>
    </section>

    <section id="st-30" class="stA" aria-labelledby="st-30-h">
      <div class="sec-h sec-h--thin"><h2 id="st-30-h" class="h">최근 30일</h2><span class="rh" aria-hidden="true" lang="en">30 DAYS</span></div>
      <div class="rateA"><p class="rateA__n"><span class="n">${pct(R.pct)}</span><span class="u">%</span></p><p class="rateA__c"><b>실행 성공률</b> prod 수집 <span class="n">${R.all}</span>회 중 <span class="n">${R.ok}</span>회 성공 · 실패 <span class="n">${R.all - R.ok}</span>회<br><span class="n">${md(ST.window.from)} – ${md(ST.window.to)}</span> · 운영 리포트와 같은 셈</p></div>
      <ol class="ph30" role="list" aria-label="최근 30일 발행일 띠">${ST.days.map(hole).join('')}</ol>
      <ul class="legA" role="list">
        <li><i class="h h--ontime"><i></i></i>정시 <span class="n">${DC.ontime}</span></li>
        <li><i class="h h--late"><i></i></i>늦음 <span class="n">${DC.late}</span></li>
        <li><i class="h h--missed"><i></i></i>결호 <span class="n">${DC.missed}</span></li>
        <li><i class="h h--failed"><i></i></i>실패 <span class="n">${DC.failed}</span></li>
        <li><i class="h h--prelaunch"><i></i></i>창간 전 <span class="n">${DC.prelaunch}</span></li>
        <li><i class="xmark" aria-hidden="true"></i>실패한 실행 있음 <span class="n">1</span> · <span class="n">${failDay.md}</span> <span class="n">${failDay.failedRuns[0].started}</span> 수동</li>
      </ul>
      <p class="def"><b>숫자</b>는 실행 기준(PRD KPI와 같은 셈), <b>띠</b>는 발행일 기준이다. 정시 = 그날 첫 발행 실행의 수집 완료가 공개 목표(여름 <span class="n">07:00</span> · 겨울 <span class="n">07:30</span>) + 15분 안, 늦음 = 그 뒤, 결호 = 그날 발행 기록 없음. 결호 4일은 10월 28일 정시 수집이 자리 잡기 전이다.</p>
    </section>

    <section id="st-src" class="stA" aria-labelledby="st-src-h">
      <div class="sec-h sec-h--thin"><h2 id="st-src-h" class="h">소스 건강도</h2><span class="rh" aria-hidden="true" lang="en">SOURCES</span></div>
      <p class="sub">최근 7일 <span class="n">${md(ST.days[23].date)} – ${md(D.today.date)}</span> · 수집 <span class="n">${ST.sources.length}</span>곳 · 구멍 = 날마다 <span class="legS"><i class="sh sh--fresh"></i>새 기사</span> <span class="legS"><i class="sh sh--no-new"></i>응답 · 새 기사 없음</span> <span class="legS"><i class="sh sh--failed"></i>실패</span></p>
      <ol class="srcsA" role="list">${ST.sources.map(srow).join('')}</ol>
    </section>

    <section id="st-cost" class="stA" aria-labelledby="st-cost-h">
      <div class="sec-h sec-h--thin"><h2 id="st-cost-h" class="h">이번 달 비용</h2><span class="rh" aria-hidden="true" lang="en">BUDGET</span></div>
      <div class="costA"><div class="costA__s"><p class="costA__k">11월 · 지금까지</p><p class="costA__n"><span class="n">${C.thisMonth.pct.toFixed(2)}</span><span class="u">%</span></p></div><span class="costA__perf" aria-hidden="true"></span><div class="costA__s costA__s--prev"><p class="costA__k">10월</p><p class="costA__n costA__n--s"><span class="n">${C.lastMonth.pct.toFixed(2)}</span><span class="u">%</span></p></div></div>
      <p class="def">월 예산 대비 사용률. 운영(prod)과 개발 실험(dev)의 AI 브리핑 비용을 합쳤다. 데이터 API는 무료 플랜이라 0이다.</p>
    </section>
  </main>
</div>
${colophon({ statusSlot: `<p class="colA"><a href="#s4" class="colA__a"><span class="colA__k">발행 상태</span><span class="colA__perf" aria-hidden="true"></span><span class="colA__v">최근 30일 <span class="n">${pct(R.pct)}%</span></span>${IC.right}</a></p>` })}
</div>
${tabbar()}</div>`;
}

/* ───────── CSS ───────── */
export const css = `
code{font:600 13px/1 var(--font-numeric);letter-spacing:.02em;color:var(--ink)}
.code{margin-top:12px;padding:10px 12px;background:var(--paper-2);font:600 12px/1.45 var(--font-numeric);white-space:pre-wrap;overflow-wrap:anywhere;color:var(--ink)}
.safe-wrap,.ios{position:relative}
.safe-wrap svg,.ios svg,.fr .chk svg{display:block;width:100%;height:auto}
.safe-wrap .safe{position:absolute;inset:0}
.ios{border-radius:22.5%;overflow:hidden;width:min(180px,100%)}
/* OG A */
.og--a{${OGPIN};display:grid;grid-template-columns:31% 0 minmax(0,1fr);background:var(--ticket);color:var(--ticket-fg)}
.oga__stub{display:flex;flex-direction:column;justify-content:center;padding:0 2.6cqw 0 3.6cqw;min-width:0}
.oga__stub--c{background:var(--c);color:var(--competition-foreground);align-items:flex-start}
.oga__stub--k{padding:0}
.oga__no{display:flex;align-items:baseline;gap:.5cqw;white-space:nowrap}
.oga__no .k{font-size:2.8cqw;font-weight:800}
.oga__no .n{font-size:12.4cqw;line-height:.8;font-weight:800;letter-spacing:-.02em}
.oga__mark{font:800 15cqw/.8 var(--font-numeric);letter-spacing:-.01em}
.oga__short{font-size:6.6cqw;font-weight:800;letter-spacing:-.03em;line-height:1.05}
.oga__perf{position:relative;width:.5cqw;margin-left:-.25cqw;background-image:radial-gradient(circle,var(--paper) .2cqw,transparent .26cqw);background-size:.5cqw 1.15cqw;z-index:1}
.oga__perf::before,.oga__perf::after{content:"";position:absolute;left:50%;width:4.4cqw;height:4.4cqw;margin-left:-2.2cqw;border-radius:50%;background:var(--paper)}
.oga__perf::before{top:-2.2cqw}.oga__perf::after{bottom:-2.2cqw}
.oga__main{display:flex;flex-direction:column;justify-content:center;padding:0 5cqw 0 5.2cqw;min-width:0}
.oga__wm{font-size:8.4cqw;font-weight:800;letter-spacing:-.05em;line-height:1.05;white-space:nowrap}
.oga__en{font:800 1.9cqw/1 var(--font-numeric);letter-spacing:.34em;color:var(--ticket-fg-2);margin-top:2.4cqw}
.oga__ft{align-self:flex-start;font-size:2.8cqw;font-weight:800;margin-top:4.6cqw;padding-top:2.2cqw;border-top:.25cqw solid var(--ticket-fg-2)}
.oga__ft--tag{font-weight:400;color:var(--ticket-fg)}
.oga__season{font-size:2.4cqw;font-weight:800;color:var(--ticket-fg-2)}
.oga__season .n{font-weight:600;font-size:1.1em}
.oga__name{font-size:7.6cqw;font-weight:800;letter-spacing:-.045em;line-height:1.08;margin-top:1.4cqw}
.oga__en2{font:600 2.5cqw/1.1 var(--font-numeric);letter-spacing:.02em;color:var(--ticket-fg-2);margin-top:1.4cqw}
.oga__sig{align-self:flex-start;font-size:2.2cqw;font-weight:800;margin-top:4cqw;padding-top:1.8cqw;border-top:.25cqw solid var(--ticket-fg-2)}
.oga__sig span{font:800 1.6cqw/1 var(--font-numeric);letter-spacing:.3em;color:var(--ticket-fg-2);margin-left:1.2cqw}
.oga__tabs{display:flex;gap:1cqw}
.oga__tab{display:inline-flex;align-items:center;height:3.6cqw;padding:0 1.2cqw;background:var(--c);color:var(--competition-foreground);font-size:2.1cqw;font-weight:800}
.oga__kit{height:100%;display:grid;grid-template-rows:3fr 2fr;background:var(--k2);box-shadow:inset 0 0 0 .3cqw var(--paper)}
.oga__kit b{display:grid;place-items:center;background:var(--k1);color:var(--kf);font:800 9cqw/1 var(--font-numeric);letter-spacing:.04em;box-shadow:inset .3cqw .3cqw 0 0 var(--paper),inset -.3cqw 0 0 0 var(--paper)}
.ogf--s .og{max-width:100%}
/* 빈 상태 — 입장권 */
.adm{position:relative;display:grid;grid-template-columns:auto 2px minmax(0,1fr);border:1.5px solid var(--ink);background:var(--paper);margin-top:14px}
.adm__stub{display:grid;align-content:center;justify-items:start;gap:4px;padding:14px 16px 14px 14px;min-width:104px}
.adm__n{font:800 var(--num-n2,44px)/.84 var(--font-numeric);font-variant-numeric:tabular-nums lining-nums;letter-spacing:-.02em;color:var(--ink)}
.adm__y{font-size:12.5px;color:var(--ink-2)}
.adm__y .n{font:600 14px/1 var(--font-numeric)}
.adm__k{font-size:13px;font-weight:800}
.adm__perf{position:relative;background-image:radial-gradient(circle,var(--ink-3) 1px,transparent 1.4px);background-size:2px 6px;background-repeat:repeat-y}
.adm__perf::before,.adm__perf::after{content:"";position:absolute;left:50%;width:20px;height:20px;margin-left:-10px;border-radius:50%;background:var(--paper);border:1.5px solid var(--ink)}
.adm__perf::before{top:-11.5px;clip-path:inset(50% 0 0 0)}.adm__perf::after{bottom:-11.5px;clip-path:inset(0 0 50% 0)}
.adm__body{padding:14px 14px 10px 16px;min-width:0}
.adm__c{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-size:14px;font-weight:800}
.adm__note{font-size:13.5px;line-height:1.5;color:var(--ink-2);margin-top:6px}
.adm__h{font-size:15px;font-weight:800;letter-spacing:-.01em}
.adm__q{display:block;font:600 21px/1.1 var(--font-latin);letter-spacing:.002em}
.adm__h .vs{font:600 13px/1 var(--font-numeric);color:var(--ink-2);margin:0 2px}
.adm .tlink{margin-top:2px}
.adm--sample{border-style:dashed}
@media (min-width:1024px){:root{--num-n2:64px}.adm__stub{min-width:150px;padding:18px 22px 16px 20px}.adm__body{padding:18px 20px 12px 22px}}
.restA{margin-top:12px;border-top:1px solid var(--rule);padding-top:12px}
.restA__w{display:flex;align-items:center;gap:10px;margin-top:10px;font:600 15px/1 var(--font-numeric)}
.stackA{position:relative;padding-bottom:4px}
.stackA .adm--i1{margin-left:18px;margin-top:-6px;z-index:0}
.stackA .adm--i0{z-index:1;margin-right:18px}
.adm--intl .adm__n{font-size:34px}
@media (min-width:1024px){.adm--intl .adm__n{font-size:44px}}
.adm--chk .adm__stub{min-width:0;padding:12px 14px}
.chk4{display:grid;grid-template-columns:auto auto;gap:8px 12px}
.chk4 li{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2)}
.chk4 i{width:13px;height:13px;border-radius:50%;border:1.5px solid var(--ink-2)}
.chk4 .n{font:600 13px/1 var(--font-numeric);color:var(--ink)}
.offA{display:grid;grid-template-columns:104px minmax(0,1fr);gap:0 10px;margin-top:16px}
.offA__s{position:relative;display:grid;align-content:center;gap:6px;padding:16px 14px;border:1.5px solid var(--ink);border-right:2px dotted var(--ink-3)}
.offA__s::before,.offA__s::after{content:"";position:absolute;right:-11px;width:20px;height:20px;border-radius:50%;background:var(--paper);border:1.5px solid var(--ink);clip-path:inset(0 50% 0 0)}
.offA__s::before{top:-11.5px;clip-path:inset(50% 50% 0 0)}.offA__s::after{bottom:-11.5px;clip-path:inset(0 50% 50% 0)}
.offA__b{padding:16px 16px 14px;border:1.5px dashed var(--ink-3)}
.btn--sm{min-height:44px;gap:8px;margin-top:12px;padding:0 14px}
.btn .ic{width:18px;height:18px}
@media (min-width:1024px){.offA{grid-template-columns:200px minmax(0,1fr);gap:0 14px}.offA__s{padding:22px 26px}.offA__b{padding:24px 30px 20px}}
/* /status A */
.stA{margin-top:36px}
@media (min-width:1024px){.stA{margin-top:48px}}
.tixA{--ring:var(--ticket-fg);display:grid;grid-template-columns:minmax(0,1fr);background:var(--ticket);color:var(--ticket-fg);margin-top:18px}
.tixA__stub{padding:16px 18px 14px}
.tixA__k{font-size:12.5px;font-weight:800;color:var(--ticket-fg-2)}
.tixA__no{display:flex;align-items:baseline;gap:4px;margin-top:6px}
.tixA__no .k{font-size:14px;font-weight:800}
.tixA__no .n{font:800 40px/.82 var(--font-numeric);letter-spacing:-.02em}
.tixA__d{font-size:13px;font-weight:800;margin-top:8px}
.tixA__perf{position:relative;height:4px;margin:0 14px;background-image:radial-gradient(circle at 2px 2px,var(--paper) 1.6px,transparent 2.1px);background-size:9px 4px;background-repeat:repeat-x}
.tixA__perf::before,.tixA__perf::after{content:"";position:absolute;top:50%;width:20px;height:20px;margin-top:-10px;border-radius:50%;background:var(--paper)}
.tixA__perf::before{left:-24px}.tixA__perf::after{right:-24px}
.tixA__main{padding:16px 18px 16px}
.tixA__big{display:flex;align-items:baseline;gap:8px}
.tixA__big .n{font:800 var(--num-n1,56px)/.84 var(--font-numeric);letter-spacing:-.02em}
.tixA__big span:last-child{font:800 16px/1 var(--font-numeric);letter-spacing:.06em;color:var(--ticket-fg-2)}
.tixA__cap{font-size:13px;color:var(--ticket-fg-2);margin-top:8px}
.tixA__cap .n{font:600 15px/1 var(--font-numeric)}
.tixA__vs{display:flex;flex-wrap:wrap;gap:4px 18px;margin-top:12px;font-size:14px;padding-top:10px;border-top:1px solid var(--ticket-fg-2)}
.tixA__vs b{font:800 17px/1 var(--font-numeric);margin:0 2px}
.tixA__ph{margin-top:12px;padding:8px 10px;border:1.5px dashed var(--ticket-fg-2);font-size:12.5px;color:var(--ticket-fg-2)}
.tixA__ph b{color:var(--ticket-fg);margin-right:4px}
.tixA__ph .n{white-space:nowrap}
@media (min-width:1024px){:root{--num-n1:96px}.tixA{grid-template-columns:232px 4px minmax(0,1fr)}.tixA__stub{padding:22px 24px}.tixA__no .n{font-size:64px}
  .tixA__perf{height:auto;width:4px;margin:14px 0;background-size:4px 9px;background-repeat:repeat-y}.tixA__perf::before,.tixA__perf::after{left:50%;right:auto;margin:0 0 0 -10px}.tixA__perf::before{top:-24px}.tixA__perf::after{top:auto;bottom:-24px}
  .tixA__main{padding:24px 32px 22px}}
.rateA{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px 18px;margin-top:14px}
.rateA__n{display:flex;align-items:baseline}
.rateA__n .n{font:800 var(--num-n2,44px)/.84 var(--font-numeric);letter-spacing:-.02em}
.rateA__n .u{font:800 22px/1 var(--font-numeric);margin-left:2px}
.rateA__c{font-size:13px;line-height:1.5;color:var(--ink-2)}
.rateA__c b{color:var(--ink);font-weight:800;margin-right:6px}
.rateA__c .n{font:600 14.5px/1 var(--font-numeric);color:var(--ink)}
.ph30{display:grid;grid-template-columns:repeat(15,minmax(0,1fr));row-gap:34px;margin-top:20px;padding-bottom:34px}
@media (min-width:768px){.ph30{grid-template-columns:repeat(30,minmax(0,1fr))}}
.ph30 .h{position:relative;display:grid;justify-items:center}
.h>i{display:block;width:15px;height:15px;border-radius:50%;border:1.5px solid var(--ink)}
@media (min-width:1024px){.h>i{width:17px;height:17px}}
.h--ontime>i{background:var(--ink)}
.h--late>i{background:linear-gradient(90deg,var(--ink) 50%,transparent 50%)}
.h--missed>i{border-color:var(--ink-2)}
.h--failed>i{border-color:var(--ink-2);background:linear-gradient(-82deg,transparent calc(50% - 1px),var(--ink-2) calc(50% - 1px) calc(50% + 1px),transparent calc(50% + 1px))}
.h--prelaunch>i{border:1.5px dotted var(--ink-3);transform:scale(.72)}
.h--x::after{content:"";position:absolute;top:21px;left:50%;width:9px;height:9px;margin-left:-4.5px;background:linear-gradient(45deg,transparent 40%,var(--brand-accent) 40% 60%,transparent 60%),linear-gradient(-45deg,transparent 40%,var(--brand-accent) 40% 60%,transparent 60%)}
.ph30__t{position:absolute;top:36px;left:50%;transform:translateX(-50%);font:600 12px/1 var(--font-numeric);letter-spacing:.02em;color:var(--ink-2);white-space:nowrap}
@media (max-width:767px){.ph30 .h:nth-child(15n+1) .ph30__t{left:0;transform:none}}
.legA{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:14px;font-size:12.5px;color:var(--ink-2)}
.legA li{display:inline-flex;align-items:center;gap:6px}
.legA .n{font:600 14px/1 var(--font-numeric);color:var(--ink)}
.legA .h>i{width:13px;height:13px}
.xmark{width:10px;height:10px;background:linear-gradient(45deg,transparent 40%,var(--brand-accent) 40% 60%,transparent 60%),linear-gradient(-45deg,transparent 40%,var(--brand-accent) 40% 60%,transparent 60%)}
.legS{display:inline-flex;align-items:center;gap:4px;margin-left:6px;white-space:nowrap}
.sh{display:inline-block;width:11px;height:11px;border-radius:50%;border:1.5px solid var(--ink);flex:none}
.sh--fresh{background:var(--ink)}
.sh--no-new{border-color:var(--ink-2)}
.sh--failed{border-color:var(--ink-2);background:linear-gradient(-82deg,transparent calc(50% - 1px),var(--ink-2) calc(50% - 1px) calc(50% + 1px),transparent calc(50% + 1px))}
.srcsA{margin-top:12px;border-top:1px solid var(--ink)}
.srcA{border-bottom:1px solid var(--rule)}
.srcA__b{display:grid;grid-template-columns:60px 2px minmax(0,1fr) auto auto 28px;grid-template-areas:"stub perf name name name chev" "stub perf holes ok new chev";align-items:center;gap:4px 10px;width:100%;min-height:60px;padding:8px 0;border:0;background:transparent;text-align:left;transition:background-color var(--duration-fast) var(--ease)}
.srcA__b:hover{background:var(--paper-2)}
.srcA__stub{grid-area:stub;display:grid;place-items:center}
.srcA__perf{grid-area:perf;align-self:stretch;margin:-8px 0;background-image:radial-gradient(circle,var(--ink-3) 1px,transparent 1.4px);background-size:2px 6px}
.srcA__name{grid-area:name;min-width:0;font-size:14px;line-height:1.3}
.srcA__name b{font-weight:800}
.srcA__flag{display:block;font-size:12px;color:var(--brand-accent-text);font-weight:800;margin-top:2px}
.srcA__flag .n{font:600 13px/1 var(--font-numeric)}
.srcA__holes{grid-area:holes;display:flex;gap:4px}
.srcA__ok{grid-area:ok}.srcA__new{grid-area:new}
.srcA__ok,.srcA__new{display:grid;justify-items:end;gap:3px;min-width:44px}
.srcA__ok .n,.srcA__new .n{font:800 18px/1 var(--font-numeric)}
.srcA small{font-size:11px;color:var(--ink-2)}
.srcA__chev{grid-area:chev;color:var(--ink-2);transition:transform var(--duration-base) var(--ease)}
.srcA__chev .ic{width:18px;height:18px}
.srcA__b[aria-expanded="true"] .srcA__chev{transform:rotate(180deg)}
.srcA__d{padding:4px 0 14px 76px;animation:tear var(--duration-base) var(--ease) both}
.srcA__d dl{display:flex;flex-wrap:wrap;gap:6px 22px;font-size:12.5px;color:var(--ink-2);border-top:2px dotted var(--ink-3);padding-top:10px}
.srcA__d dd{color:var(--ink);font-weight:800}
.srcA__d dd .n{font:800 15px/1 var(--font-numeric)}
.tier{display:inline-flex;align-items:center;gap:3px;height:24px;padding:0 6px;font:600 13px/1 var(--font-numeric);letter-spacing:.04em;white-space:nowrap}
.tier .n{font-weight:800}
.tier--2{border:2px solid var(--ink)}.tier--3{border:1px dashed var(--ink-2);color:var(--ink-2)}
@media (min-width:1024px){.srcA__b{grid-template-columns:78px 2px minmax(0,1fr) auto 64px 64px 28px;grid-template-areas:"stub perf name holes ok new chev";min-height:56px}.srcA__holes{gap:6px}.srcA__d{padding-left:90px}}
.costA{display:grid;grid-template-columns:minmax(0,1.3fr) 2px minmax(0,1fr);border:1.5px solid var(--ink);margin-top:16px}
.costA__s{padding:14px 16px}
.costA__k{font-size:12.5px;font-weight:800;color:var(--ink-2)}
.costA__n{display:flex;align-items:baseline;margin-top:8px}
.costA__n .n{font:800 var(--num-n2,44px)/.84 var(--font-numeric);letter-spacing:-.02em}
.costA__n .u{font:800 20px/1 var(--font-numeric);margin-left:2px}
.costA__n--s .n{font-size:28px;color:var(--ink-2)}
.costA__perf{position:relative;background-image:radial-gradient(circle,var(--ink-3) 1px,transparent 1.4px);background-size:2px 6px}
.costA__perf::before,.costA__perf::after{content:"";position:absolute;left:50%;width:20px;height:20px;margin-left:-10px;border-radius:50%;background:var(--paper);border:1.5px solid var(--ink)}
.costA__perf::before{top:-11.5px;clip-path:inset(50% 0 0 0)}.costA__perf::after{bottom:-11.5px;clip-path:inset(0 0 50% 0)}
@media (min-width:1024px){.costA{max-width:560px}}
.toc{margin-top:10px}
.toc a{display:flex;align-items:baseline;gap:6px;min-height:44px;padding:10px 0;border-bottom:1px solid var(--rule);font-size:14px;color:var(--ink);text-decoration:none}
.toc a i{flex:1;border-bottom:2px dotted var(--ink-3);transform:translateY(-3px)}
.toc .n{font:600 17px/1 var(--font-numeric)}
.colA{margin-top:4px}
.colA__a{display:inline-flex;align-items:center;gap:10px;min-height:48px;padding:0 10px 0 12px;border:1.5px solid var(--colophon-fg);color:var(--colophon-fg);text-decoration:none;font-weight:800}
.colA__a:hover{background:color-mix(in srgb,currentColor 12%,transparent)}
.colA__perf{align-self:stretch;width:2px;background-image:radial-gradient(circle,var(--colophon-fg-2) 1px,transparent 1.4px);background-size:2px 6px}
.colA__v{font-weight:400;color:var(--colophon-fg-2)}
.colA__v .n{font:800 16px/1 var(--font-numeric);color:var(--colophon-fg)}
.colA .ic{width:18px;height:18px}
@media (min-width:1024px){.colA{grid-column:2}}
`;

const js = `
document.addEventListener('click',function(e){var b=e.target.closest('.srcA__b');if(!b)return;var d=document.getElementById(b.getAttribute('aria-controls'));var o=b.getAttribute('aria-expanded')==='true';b.setAttribute('aria-expanded',String(!o));d.hidden=o;});
`;

export function build() {
  const m = meta({
    name: 'A 입장권 (Admission)',
    one: '모든 산출물을 마스트헤드 티켓의 한 조각으로 — 아이콘은 스텁, OG는 D0 견본 티켓, 빈 상태는 아직 검표하지 않은 표, /status는 검표 기록.',
    pros: ['D0 견본 · 마스트헤드 · D2 입장권과 한 식구라 정할 것이 가장 적다(DECISIONS D0이 “D3 티켓 OG · 스텁 아이콘”을 예고)', '아이콘이 지금 임시안(네이비 + ED + 레드 막대)과 가까워 이행이 쉽고, 흰 · 검 런처 모두에서 윤곽이 선다', '공유 미리보기가 사이트 첫인상(티켓)과 같다 — 메신저 흰 · 검 바탕 어디서나 진한 면으로 구분된다', '/status 30일 띠가 이적 단계 펀치 구멍 문법이라 따로 배울 것이 없다'],
    cons: ['티켓 변형이 아이콘 · OG · 빈 상태 · /status 전부로 늘어 키치 경계에 가장 가깝다(DESIGN §1 원칙 1) — 이 시안은 장식 0(ADMIT ONE · 바코드 · 일련번호 없음)으로 버텼다', '네이비 면 위 레드는 2.55라 장식 막대로만 쓴다. 대회 OG는 다크 대회 값이라 화면(라이트 탭)과 색이 달라 보인다', '/status 구멍 30개는 375에서 15칸 × 2줄로 접어야 한다', '빈 상태 입장권이 실제 입장권(선수 상세)과 모양이 같아 “경기 표”로 오해할 여지'],
    diff: '<b>중</b> — 아이콘은 temp-icons.ts 래스터라이저에 천공 점 · 노치만 더한다(ED 글자는 path 변환 1회). OG 템플릿 1개 + 변형 3(날짜 · 대회 · 팀), 빈 상태는 D2 입장권 컴포넌트 재사용 + SVG 1개(오프라인). /status는 서버 컴포넌트(JS 0) + 소스 행 펼침 섬 1개(gzip 약 0.3KB).',
    bundle: '폰트 변화 0 — EuroDigest Sans 400 · 800 + Barlow Condensed 600 · 800(417.8KB, 2패밀리 4파일). 새 색 토큰 0, OG 전용 변수 4개 제거. favicon.svg 약 0.6KB · ico 16+32 약 1.5KB.',
    rules: '없음 — OG 견본 변수 4개 삭제(라이트 티켓 토큰으로). 휴식기 S4 변형(A매치 기간)은 화면 결정(today-brief 주석 변경).',
    axes: AXES, me: 0,
  });
  const body = `${m}
${topbar('D3 시안 A · 입장권')}
<div class="board">
  <header class="hero"><p class="hero__k" lang="en" aria-hidden="true">D3 · ADMISSION</p><h1>A 입장권</h1><p>아이콘 · OG · 빈 상태 · 상태 쪽을 모두 마스트헤드 티켓의 한 조각으로 만든다. 장식 문구 · 바코드 · 일련번호는 넣지 않는다 — 천공 · 노치 · 펀치 구멍만.</p></header>
  ${sIcons()}
  ${sOg()}
  ${sEmpty()}
</div>
${sStatus()}`;
  return page({
    file: 'concept-a.html', title: 'D3 시안 A · 입장권 — 유로 다이제스트',
    comment: `D3 시안 A — 입장권 (Admission)
한 줄: 모든 산출물을 마스트헤드 티켓의 한 조각으로 — 아이콘 = 스텁, OG = D0 견본 티켓 정리, 빈 상태 = 아직 검표하지 않은 표, /status = 검표 기록
장점: D0·D2와 한 식구라 정할 것이 가장 적다 · 아이콘이 임시안과 가깝다 · 미리보기 = 사이트 첫인상
단점: 티켓 변형이 늘어 키치 경계 · 네이비 면 위 레드 2.55(장식만) · 대회 OG 다크 값 · 375 구멍 30개는 2줄
구현 난이도: 중 (래스터라이저 천공·노치 + ED path 1회, OG 템플릿 1 + 변형 3, /status JS 0 + 펼침 섬 1)
번들/폰트: 폰트 변화 0 (EuroDigest Sans 400·800 + Barlow Condensed 600·800 = 417.8KB, ../fonts/ 로컬), 새 색 토큰 0, OG 전용 변수 4개 제거
데이터: docs/design/d3/data/d3-data.json (runs.json·runs-dev.json·configs·data/teams 실값, 2026-11-02 기준). 문구 생성·LLM 호출 0
견본 단독 렌더: ?solo=<data-solo 값>&w=1200 (예: ?solo=og-news-22) — OG 1200×630 실제 크기`,
    css, body, js,
  });
}
