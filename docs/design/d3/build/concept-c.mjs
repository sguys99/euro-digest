// D3 시안 C — 등번호 (Squad No.): '숫자가 주인공'을 끝까지 민다. 아이콘 · OG · 빈 상태 · /status가 모두 Barlow 큰 숫자 하나로 말한다.
import { D, ST, TOK, COMP, TEAM, IC, esc, ftab, badge, md, dow, longDate, shortDate, pix, pixZoom, ticket, tabbar, colophon, meta, AXES, topbar, previews, DAYSTATE, pct, page } from './common.mjs';

const T = TOK;
const SLUG = { EPL: 'epl', LALIGA: 'laliga', SERIEA: 'seriea', BUNDESLIGA: 'bundesliga', LIGUE1: 'ligue1', UCL: 'ucl' };
/* ───────── 1. 아이콘 ───────── */
// "5"는 웹폰트(Barlow Condensed 800)로 그린 견본 — 구현(M5-02)에서는 글리프 외곽선을 path로 옮긴다(notes-c §5).
const NUM = (x, y, size, fill, t = '5', extra = '') => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Barlow Condensed" font-weight="800" font-size="${size}" fill="${fill}"${extra}>${t}</text>`;
function iconC(kind, { face = T.ticketD, fg = T.ticketFgD, label = '' } = {}) {
  const aria = label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"';
  if (kind === 'any') return `<svg viewBox="0 0 512 512"${aria}><rect width="512" height="512" fill="${face}"/>${NUM(256, 388, 430, fg)}<rect x="196" y="440" width="120" height="16" fill="${fg}"/></svg>`;
  if (kind === 'gutter') {
    // 192 이상 변형 — 5줄 등번호 1~5 세로 거터(1~4 윤곽은 '아직 아님'이 아니라 순서 표시 — notes-c §5)
    let col = '';
    [1, 2, 3, 4].forEach((d, i) => { col += NUM(118, 134 + i * 84, 92, 'none', String(d), ` stroke="${fg}" stroke-width="3.5"`); });
    return `<svg viewBox="0 0 512 512"${aria}><rect width="512" height="512" fill="${face}"/>${col}<rect x="168" y="66" width="4" height="380" fill="${fg}"/>${NUM(330, 420, 430, fg)}</svg>`;
  }
  if (kind === 'maskable' || kind === 'apple') return `<svg viewBox="0 0 512 512"${aria}><rect width="512" height="512" fill="${face}"/>${NUM(256, 348, 290, fg)}<rect x="214" y="390" width="84" height="12" fill="${fg}"/></svg>`;
  return `<svg viewBox="0 0 512 512"${aria}><rect width="512" height="512" fill="${face}"/>${NUM(256, 452, 530, fg)}</svg>`;
}
const P16 = [
  '................',
  '................',
  '....########....',
  '....########....',
  '....##..........',
  '....##..........',
  '....#######.....',
  '....########....',
  '..........##....',
  '..........##....',
  '..........##....',
  '....##....##....',
  '....########....',
  '.....######.....',
  '................',
  '................',
];
const pal16L = { '.': T.ticketD, '#': T.ticketFgD };
const pal16D = { '.': T.accentD, '#': T.paperD };
const SAFE = `<svg viewBox="0 0 512 512" class="safe" aria-hidden="true"><circle cx="256" cy="256" r="204.8" fill="none" stroke="${T.paperL}" stroke-width="3" stroke-dasharray="10 8"/><path d="M256 0V512M0 256H512" stroke="${T.paperL}" stroke-width="1.5" stroke-dasharray="4 6"/></svg>`;
const faviconSrc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>.f{fill:${T.ticketD}}.g{fill:${T.ticketFgD}}@media (prefers-color-scheme:dark){.f{fill:${T.accentD}}.g{fill:${T.paperD}}}</style><rect class="f" width="32" height="32"/><path class="g" d="…5 글리프 외곽선(M5-02에서 생성)…"/></svg>`;

function sIcons() {
  const sized = (svg, s) => svg.replace('<svg ', `<svg width="${s}" height="${s}" `);
  const ladder = [16, 32, 48].map((s) => `<figure><div>${s === 16 ? pix(P16, pal16L, { title: '16px' }) : sized(iconC('small', { label: `${s}px` }), s)}</div><figcaption>${s}</figcaption></figure>`).join('')
    + `<figure><div>${sized(iconC('apple', { label: 'apple-touch 180px' }), 180)}</div><figcaption>180 apple</figcaption></figure>`
    + `<figure><div>${sized(iconC('any', { label: 'any 192px' }), 192)}</div><figcaption>192 any</figcaption></figure>`
    + `<figure class="big"><div>${sized(iconC('any', { label: 'any 512px' }), 512)}</div><figcaption>512 any — 좁은 화면에서는 폭에 맞춰 줄여 보임</figcaption></figure>`;
  const masks = () => ['m-circle', 'm-squircle', 'm-round'].map((m, i) => `<figure><div class="${m}">${sized(iconC('maskable'), 60)}</div><figcaption>유로 다이제스트<span>${['원', '스퀴클', '둥근 사각'][i]}</span></figcaption></figure>`).join('');
  const tab = (dark) => `<div class="tabs tabs--${dark ? 'd' : 'l'}"><div class="tabs__t tabs__t--on">${pix(P16, dark ? pal16D : pal16L, { title: `파비콘 16px ${dark ? '다크' : '라이트'}` })}<span>유로 다이제스트</span></div><div class="tabs__t"><i aria-hidden="true"></i><span>새 탭</span></div></div>`;
  return `<section id="s1" class="blk" aria-labelledby="s1h">
  <div class="sec-h"><h2 id="s1h"><span class="blk__no">1</span>앱 아이콘</h2><span class="rh" aria-hidden="true" lang="en">ICONS</span></div>
  <p class="sub2">오늘의 5줄의 마지막 등번호 <b class="n">5</b>. 벽돌 레드 면(다크 <code>--ticket</code> ${T.ticketD}) · 지면색 Barlow 800 · 아래 짧은 괘선. 세 파일 모두 면을 꽉 채운다. 192 이상에서는 1~5 세로 거터 변형도 비교한다.</p>
  <div class="grid3" style="margin-top:18px">
    <figure class="fr"><p class="fr__cap"><b>any 512</b><span class="path">public/icons/icon-512.png</span> · 192 같은 그림</p>${iconC('any', { label: 'any 아이콘 — 벽돌 레드 면, 지면색 5, 짧은 괘선' })}</figure>
    <figure class="fr"><p class="fr__cap"><b>maskable 512</b><span class="path">icon-maskable-512.png</span> · 점선 원 = 안전 영역 지름 80%</p><div class="safe-wrap">${iconC('maskable', { label: 'maskable 아이콘 — 안전 원 안의 5' })}${SAFE}</div></figure>
    <figure class="fr"><p class="fr__cap"><b>변형 — 1~5 거터</b> 192 · 512 any 후보(16~48에는 쓰지 않음)</p>${iconC('gutter', { label: '거터 변형 — 윤곽 1~4와 큰 5' })}</figure>
  </div>
  <div class="grid3" style="margin-top:16px">
    <figure class="fr"><p class="fr__cap"><b>apple-touch 180</b><span class="path">apple-touch-icon.png</span> · 투명 0 · iOS가 모서리를 깎음</p><div class="ios">${iconC('apple', { label: 'apple-touch 아이콘' })}</div></figure>
  </div>
  <h3 class="h3">크기 사다리 <small lang="en">16 · 32 · 48 · 180 · 192 · 512</small></h3>
  <div class="ladder">${ladder}</div>
  <h3 class="h3">런처 마스크 · 홈 화면 바탕 <small lang="en">LAUNCHER</small></h3>
  <div class="devices"><div class="home home--l">${masks()}</div><div class="home home--d">${masks()}</div></div>
  <p class="sub2">홈 화면에서 가장 눈에 띈다(진한 레드 면 + 큰 숫자). 다만 숫자 하나는 알림 배지 · 숫자 채널 앱과 헷갈릴 수 있다 — 아래 이름 줄이 늘 붙는 런처에서는 덜하다.</p>
  <h3 class="h3">파비콘 · 브라우저 탭 <small lang="en">FAVICON</small></h3>
  <div class="grid2">
    <div class="fr"><p class="fr__cap"><b>favicon.svg</b><span class="path">public/favicon.svg</span> — 라이트 탭 벽돌 레드 · 다크 탭 레드(<code>--brand-accent</code> 다크) 면 + 네이비 5 — 어두운 탭에서 벽돌 레드가 가라앉아 밝은 값으로 바꾼다</p>${tab(false)}${tab(true)}
      <pre class="code" aria-label="favicon.svg 구조">${esc(faviconSrc)}</pre></div>
    <div class="fr"><p class="fr__cap"><b>favicon.ico 16 · 32</b><span class="path">public/favicon.ico</span> — 16은 픽셀 격자에 맞춰 손으로 그린다. 획 2px</p>
      <div class="px">
        <figure>${pix(P16, pal16L, { px: 16, title: '16px 라이트' })}<figcaption>16</figcaption></figure>
        <figure>${sized(iconC('small'), 32)}<figcaption>32</figcaption></figure>
        <figure class="zoom">${pixZoom(P16, pal16L, '16px 격자 8배 확대')}<figcaption>16 × 8 확대</figcaption></figure>
        <figure class="zoom">${pixZoom(P16, pal16D, '16px 다크 격자 8배 확대')}<figcaption>다크 탭용 (svg만)</figcaption></figure>
      </div></div>
  </div>
</section>`;
}

/* ───────── 2. OG ───────── */
const PIN_R = `--ticket:${T.ticketD};--ticket-fg:${T.ticketFgD};--ticket-fg-2:${T.ticketFg2D}`;
const PIN_P = `--paper:${T.paperL};--ink:${T.inkL};--ink-2:${T.ink2L};--competition-foreground:${T.paperL};` + Object.entries(T.compL).map(([k, v]) => `--competition-${SLUG[k]}:${v}`).join(';');
const ogR = (id, { top, big, digits, alt }) => `<div class="og og--cr" data-solo="${id}" role="img" aria-label="${esc(alt)}"><div class="ogc__top">${top}</div><p class="ogc__big n" data-d="${digits}" aria-hidden="true">${big}</p></div>`;
const head = `<p class="ogc__wm">유로 다이제스트</p><p class="ogc__en" lang="en">EURO DIGEST</p>`;
const ogDefault = (id = 'og-default') => ogR(id, { top: `${head}<p class="ogc__tag">${esc(D.copy.tagline)}</p>`, big: '5', digits: 1, alt: `유로 다이제스트 — ${D.copy.tagline}` });
const ogNews = (iss, id) => ogR(id, { top: `${head}<p class="ogc__no"><span>제</span><i aria-hidden="true"></i><span>호</span><b>${esc(iss.label)}</b></p>`, big: String(iss.no), digits: String(iss.no).length, alt: `유로 다이제스트 제 ${iss.no}호, ${iss.label}` });
const ogComp = (c, id) => `<div class="og og--cp" data-solo="${id}" role="img" aria-label="${esc(`유로 다이제스트 · ${c.nameKo} ${c.season} 시즌`)}"><p class="ogc__sig">유로 다이제스트 <span lang="en">EURO DIGEST</span></p><p class="ogc__short${/^[A-Z]+$/.test(c.shortKo) ? ' ogc__short--l' : ''}">${esc(c.shortKo)}</p><p class="ogc__name">${esc(c.nameKo)}</p><p class="ogc__bar tab--${SLUG[c.id]}"><span lang="en">${esc(c.nameEn)}</span><span><span class="n">${c.season}</span> 시즌</span></p></div>`;
// 거대 약어 채움 = 상의 색. 상의가 크림 면과 3:1이 안 되면(흰 상의 등) 하의 색, 그것도 안 되면 잉크 — 윤곽처럼 보이지 않게(윤곽 = 0 규칙과 충돌 방지)
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const letterFill = (t) => (cr(t.k1, T.paperL) >= 3 ? t.k1 : cr(t.k2, T.paperL) >= 3 ? t.k2 : T.inkL);
const ogTeam = (t, id) => `<div class="og og--cp og--ct" data-solo="${id}" role="img" aria-label="${esc(`유로 다이제스트 · ${t.nameKo} (${t.short}) · ${[t.comp, ...t.alsoIn].map((c) => COMP[c].nameKo).join(' · ')}`)}"><p class="ogc__sig">유로 다이제스트 <span lang="en">EURO DIGEST</span></p><div class="ogc__abbr" style="--k1:${t.k1};--k2:${t.k2};--kl:${letterFill(t)}"><p class="n">${esc(t.short)}</p><i></i></div><div class="ogc__tm"><p class="ogc__tabs">${[t.comp, ...t.alsoIn].map((c) => `<span class="ogc__ftab tab--${SLUG[c]}">${esc(COMP[c].shortKo)}</span>`).join('')}</p><p class="ogc__name ogc__name--t">${esc(t.nameKo)}</p><p class="ogc__en2" lang="en">${esc(t.nameEn)}</p></div></div>`;

function sOg() {
  const today = D.today, i100 = D.issue100;
  const lab = (p, note = '') => `<p class="ogf__l"><span class="path">${p}</span>${note ? `<span>${note}</span>` : ''}</p>`;
  return `<section id="s2" class="blk" aria-labelledby="s2h">
  <div class="sec-h"><h2 id="s2h"><span class="blk__no">2</span>OG 이미지 1200×630</h2><span class="rh" aria-hidden="true" lang="en">OPEN GRAPH</span></div>
  <p class="sub2">기본 · 날짜는 벽돌 레드 면(다크 티켓 토큰 고정 — <code>--ticket</code> · <code>--ticket-fg</code> · <code>--ticket-fg-2</code>) 위 큰 숫자 하나가 아래로 흘러 나간다(블리드). 숫자는 <b>실선</b> — D2 숫자 상태 규칙(실선 = 값 · 윤곽 = 0)을 따라 scope의 ‘윤곽 숫자’를 바꿨다. 대회 · 팀은 데이터 색이 주인공이라 크림 지면(라이트 토큰 · 대회 라이트 값). <b>결과 노출 0</b>.</p>
  <h3 class="h3">기본 · 날짜 <small lang="en">DEFAULT · ISSUE</small></h3>
  <div class="ogset">
    <div class="ogf ogf--hero">${lab('/og/default.png', '홈 <span class="path">/</span> · 쪽 이름형 OG의 바탕')}${ogDefault()}</div>
    <div class="ogset ogset--2">
      <div class="ogf">${lab(`/og/news/${today.date}.png`, `제 ${today.no}호 · <span class="path">/news/</span> 최신 호`)}${ogNews(today, 'og-news-22')}</div>
      <div class="ogf">${lab(`/og/news/${i100.date}.png`, '제 100호 — 같은 높이, 폭만 늘어남')}${ogNews(i100, 'og-news-100')}</div>
    </div>
  </div>
  <h3 class="h3">대회 <small lang="en">COMPETITIONS · 6</small></h3>
  <div class="ogset ogset--3">${['EPL', 'BUNDESLIGA', 'UCL'].map((id) => `<div class="ogf">${lab(`/og/competitions/${id.toLowerCase()}.png`)}${ogComp(COMP[id], `og-c-${id.toLowerCase()}`)}</div>`).join('')}</div>
  <div class="ogset ogset--3" style="margin-top:14px">${['LALIGA', 'SERIEA', 'LIGUE1'].map((id) => `<div class="ogf">${lab(`/og/competitions/${id.toLowerCase()}.png`, '축소판')}${ogComp(COMP[id], `og-c-${id.toLowerCase()}`)}</div>`).join('')}</div>
  <h3 class="h3">팀 <small lang="en">TEAMS · 111</small></h3>
  <div class="ogset ogset--2">${['rennes', 'atletico-madrid', 'borussia-monchengladbach', 'bayern-munchen'].map((s) => `<div class="ogf">${lab(`/og/teams/${s}.png`, { rennes: '이름 1자', 'atletico-madrid': '10자 · 두 줄', 'borussia-monchengladbach': '흰 상의(크림 대비 1.12) → 글자는 하의 색, 띠에 2색', 'bayern-munchen': '소속 + UCL 탭 2개' }[s])}${ogTeam(TEAM[s], `og-t-${s}`)}</div>`).join('')}</div>
  <h3 class="h3">링크 미리보기 <small lang="en">PREVIEW</small></h3>
  ${previews({
    home: { og: ogDefault('pv-default'), title: '유로 다이제스트', desc: D.copy.tagline, alt: `유로 다이제스트 — ${D.copy.tagline}` },
    news: { og: ogNews(today, 'pv-news'), title: `제 ${today.no}호 · ${today.label} · 유로 다이제스트`, desc: '오늘의 5줄과 유럽 축구 소식', alt: `유로 다이제스트 제 ${today.no}호, ${today.label}` },
  })}
</section>`;
}

/* ───────── 3. 빈 상태 — 숫자 조판(실선 = 값 · 윤곽 = 0 · 대시 = 값 없음) ───────── */
const brief = (inner, sub) => `<div class="sec-h"><h3 class="h">오늘의 5줄</h3><span class="rh" aria-hidden="true" lang="en">STARTING FIVE</span></div><p class="sub">${sub}</p>${inner}`;
// 검색 결과 없음 — 윤곽 0. 혼합안(concept-mix)도 이 함수를 그대로 쓴다
export function searchZeroC() {
  const e = D.emptyStates;
  return `<div class="srch">${IC.search}<span lang="en">${esc(e.searchQuery)}</span></div>
    <div class="zeroC"><span class="zeroC__n" aria-hidden="true">0</span><div><p class="zeroC__h">“<span lang="en">${esc(e.searchQuery)}</span>” ${esc(D.copy.search.none)}</p><p class="body2">${esc(D.copy.search.hint)}</p>
    <ul class="zeroC__t" role="list">${['선수', '팀', '대회', '뉴스'].map((k) => `<li>${k} <span class="n o">0</span></li>`).join('')}</ul></div></div>`;
}
function sEmpty() {
  const e = D.emptyStates, ucl = COMP[e.ended.comp], lal = COMP[e.upcomingSample.comp];
  const dateBig = (date, word, comp, extra = '') => `<div class="numC"><p class="numC__c">${ftab(comp.id)}<span>${esc(comp.nameKo)} <span class="n">${comp.season}</span> 시즌</span>${extra}</p>
    <p class="numC__big"><time datetime="${date}"><span class="n" aria-hidden="true">${md(date)}</span><span class="sr">${longDate(date)}</span></time><span class="numC__w">${word}<span class="n">${date.slice(0, 4)}</span></span></p></div>`;
  const offEnded = `${dateBig(e.ended.date, '종료', ucl)}<p class="numC__note">${esc(D.copy.offSeason.ended.note)}</p><a class="tlink" href="#top">주요 뉴스로<span aria-hidden="true"> ↓</span></a>`;
  const offUp = `${dateBig(e.upcomingSample.date, '개막', lal, '<span class="stamp stamp--ph">견본</span>')}<p class="numC__note">${esc(D.copy.offSeason.upcoming.note)}</p>`;
  const im = D.intl.matches;
  const rest = `<div class="gutC"><span class="gutC__n gutC__n--o" aria-hidden="true">0</span><div><p class="lead">오늘은 5줄을 쉽니다</p><p class="body2">전날 6개 대회에 끝난 경기가 없었습니다.</p></div></div>
    <div class="intlC"><p class="intlC__k"><span class="stamp">A매치 기간</span><span class="n">${md(D.intl.from)} – ${md(D.intl.to)}</span></p>
    <ul class="intlC__l" role="list">${im.map((m) => `<li><time datetime="${m.utc}"><span class="n intlC__d" aria-hidden="true">${m.md}</span><span class="sr">${shortDate(m.date)}</span></time><p class="intlC__t"><span class="n">${m.time}</span> KST · (${m.dow})</p><p class="intlC__o">${esc(m.opponent)}</p><p class="intlC__v">${esc(m.venue)} · ${m.home ? '홈' : '원정'} · ${esc(m.competition)}</p></li>`).join('')}</ul></div>
    <a class="tlink" href="#top">주요 뉴스로<span aria-hidden="true"> ↓</span></a>`;
  const search = searchZeroC();
  const saved = ['2026-11-02', '2026-11-01', '2026-10-31'];
  const offline = `<div class="sec-h"><h3 class="h">${esc(D.copy.offline.h1)}</h3><span class="rh" aria-hidden="true" lang="en">OFFLINE</span></div>
  <div class="dashC"><span class="dashC__n" aria-hidden="true"></span><div><p class="lead">${esc(D.copy.offline.lead)}</p><p class="body2">${esc(D.copy.offline.body)}</p><button class="btn btn--sm" type="button">${IC.retry}다시 시도</button></div></div>
  <div class="sec-h sec-h--thin" style="margin-top:28px"><h4 class="h">${esc(D.copy.offline.saved)}</h4><span class="rh" aria-hidden="true" lang="en">SAVED</span></div>
  <ul class="savedC" role="list">${saved.map((d) => { const no = (Date.parse(d) - Date.parse('2026-10-12')) / 864e5 + 1; return `<li><a href="#top"><span class="savedC__n n" aria-hidden="true">${no}</span><span class="savedC__t"><b>제 <span class="n">${no}</span>호</b><span><span class="n">${md(d)}</span> (${dow(d)})</span></span>${IC.right}</a></li>`; }).join('')}</ul>`;
  const ctx = (lbl, inner, ba) => `<figure class="ctx"><figcaption class="ctx__lbl">${lbl}</figcaption>${inner}<div class="ba">${ba}</div></figure>`;
  const ba = (before, after) => `<div class="ba__row"><span class="ba__k">지금</span><span>${before}</span></div><div class="ba__row"><span class="ba__k">새</span><span>${after}</span></div>`;
  return `<section id="s3" class="blk" aria-labelledby="s3h">
  <div class="sec-h"><h2 id="s3h"><span class="blk__no">3</span>빈 상태 조형</h2><span class="rh" aria-hidden="true" lang="en">EMPTY</span></div>
  <p class="sub2">이미 7곳에 퍼진 윤곽 숫자 언어를 키운다. 날짜가 있는 상태는 <b>실선 큰 숫자</b>(값), 결과가 없으면 <b>윤곽 0</b>, 값 자체가 없으면 <b>대시</b>. 새 도형은 0개다.</p>
  <div class="es grid2" style="margin-top:18px">
    ${ctx('<b>비시즌 · 종료</b><span>견본 날 6월 7일 — 결승 다음 날부터 · UCL endDate</span>', brief(`<div class="restC">${offEnded}</div>`, '6월 6일 경기 기준'), ba('평탄 탭 + “2027.06.05 종료” 34px + 안내 — 글자만', '“06.05” N1 실선 숫자(56 / 96px) + 낱말 · 연도 — 날짜가 화면의 중심'))}
    ${ctx('<b>비시즌 · 개막</b><span>견본 날 8월 15일 — 2027-28 설정 전이라 라리가 지난 개막일</span>', brief(`<div class="restC">${offUp}</div>`, '8월 14일 경기 기준'), ba('평탄 탭 + 날짜 + “개막” — 글자만', '같은 숫자 조판, 낱말만 “개막”'))}
    ${ctx('<b>휴식기 · A매치 기간</b><span>견본 날 11월 12일 — national-team.json 경기일 ±3일</span>', brief(`<div class="restC">${rest}</div>`, '11월 11일 경기 기준'), ba('S4 그대로 — 레드 윤곽 ‘0’ + “오늘은 5줄을 쉽니다” + 이유 1줄', 'S4 아래 A매치 날짜 “11.13” · “11.17” N2 실선 숫자 2개 + 상대 · 장소 — <b>새 S4 변형(결정 필요)</b>'))}
    ${ctx('<b>검색 결과 없음</b><span>오버레이 · <span class="path">/search/</span> 공용 · e2e 0건 질의</span>', search, ba('윤곽 ‘0’ 64px + “결과가 없어요” + 안내', '윤곽 ‘0’을 N1(56 / 96px)로 키우고 유형 4개도 윤곽 0'))}
  </div>
  <figure class="ctx" style="margin-top:16px"><figcaption class="ctx__lbl"><b>/offline/ 화면</b><span>서비스 워커가 저장하지 않은 쪽을 열면 — 셸은 /status와 같다</span></figcaption>${offline}<div class="ba">${ba('h1 + OFFLINE + 안내 2줄 + 다시 시도 + 저장해 둔 호 목록 — 글자만', '거터에 대시 “–”(값 없음 — 이 쪽은 못 엶) + 저장한 호를 호수 실선 숫자 거터로')}</div></figure>
</section>`;
}

/* ───────── 4. /status — 숫자판 + 30일 점 그래프 ───────── */
function sStatus() {
  const L = ST.lastPublish, R = ST.runRate, C = ST.cost, DC = ST.dayCounts;
  const early = (() => { const [h1, m1] = L.target.split(':').map(Number), [h2, m2] = L.finished.split(':').map(Number); return h1 * 60 + m1 - (h2 * 60 + m2); })();
  // 점 그래프 — x: 30일, y: 수집 완료 시각(KST, 0~24시, 위 = 늦음). 공개 목표 기준선(여름 07:00 → 겨울 07:30 계단)
  // 선 · 면은 SVG(늘려도 선 굵기 고정), 점 · 글자는 % 좌표 HTML(늘어나지 않음)
  const yP = (hm) => { const [h, m] = hm.split(':').map(Number); return 100 * (1 - (h * 60 + m) / 1440); };
  const xP = (i) => (100 * (i + 0.5)) / 30;
  let g = '', pts = '', ax = '';
  [0, 6, 12, 18, 24].forEach((h) => { const y = 100 * (1 - h / 24); g += `<line x1="0" x2="100" y1="${y}" y2="${y}" class="gl"/>`; ax += `<span class="dotC__y" style="top:${y}%">${String(h).padStart(2, '0')}</span>`; });
  const preN = DC.prelaunch;
  g += `<rect x="0" y="0" width="${(100 * preN) / 30}" height="100" class="pre"/>`;
  ax += `<span class="dotC__pre" style="left:0;width:${(100 * preN) / 30}%">창간 전</span>`;
  let path = '';
  ST.days.forEach((d, i) => { if (d.state === 'prelaunch') return; const y = yP(d.target); path += `${path ? 'L' : 'M'}${(100 * i) / 30} ${y}L${(100 * (i + 1)) / 30} ${y}`; });
  g += `<path d="${path}" class="tg"/>`;
  ax += `<span class="dotC__tg" style="left:${(100 * preN) / 30}%;top:${yP('07:00')}%">공개 목표</span>`;
  ST.days.forEach((d, i) => {
    const x = xP(i);
    if (d.state === 'ontime' || d.state === 'late') pts += `<i class="dp dp--${d.state}" style="left:${x}%;top:${yP(d.finished)}%"></i>`;
    else if (d.state === 'missed') pts += `<i class="dp dp--miss" style="left:${x}%;top:97%"></i>`;
    d.failedRuns.forEach((f) => { pts += `<i class="dp dp--x" style="left:${x}%;top:${yP(f.started)}%"></i>`; });
    if (['10-04', '10-12', '10-19', '10-26', '11-02'].includes(d.date.slice(5))) ax += `<span class="dotC__x" style="left:${x}%">${d.md}</span>`;
  });
  const btns = ST.days.map((d, i) => `<button type="button" class="dotC__b" data-i="${i}" style="left:${(100 * i) / 30}%;width:${100 / 30}%" aria-label="${esc(`${shortDate(d.date)} ${DAYSTATE[d.state].k}`)}" aria-pressed="${i === 29}"></button>`).join('');
  const dayLine = (d) => `${md(d.date)} (${d.dow})${d.no ? ` · 제 ${d.no}호` : ''} · ${DAYSTATE[d.state].k}${d.finished ? ` · 수집 완료 ${d.finished}${d.finishedDate !== d.date ? `(${md(d.finishedDate)})` : ''}` : ''}${d.state !== 'prelaunch' ? ` · 공개 목표 ${d.target}` : ''}${d.failedRuns.length ? ` · 실패한 실행 ${d.failedRuns.length}회(${d.failedRuns.map((f) => f.started).join(', ')} 수동)` : ''}`;
  const daysJson = JSON.stringify(ST.days.map(dayLine));
  const srows = ST.sources.map((s) => `<tr${s.staleStreak >= 7 ? ' class="is-flag"' : ''}><th scope="row"><span ${s.lang === 'ko' ? '' : `lang="${s.lang}"`}>${esc(s.name)}</span></th><td class="num"><span class="tier tier--${s.tier}"><span class="n">${s.tier}</span></span></td><td class="num"><span class="n">${s.ok}</span><span class="den">/${s.attempts}</span></td><td class="num"><span class="n">${s.usable}</span></td><td class="num"><span class="n${s.staleStreak ? '' : ' o'}">${s.staleStreak}</span></td></tr>`).join('');
  return `<div class="divider divider--screen" id="s4"><span><b>화면 4 · /status/</b> 앱 셸 안의 한 쪽 — 뒤표지 링크로 들어온다</span><span class="divider__info">숫자판 · 찍힘(점 선택 → 그날 상세 줄)</span></div>
<div class="scr"><div class="shell">
${ticket()}
<div class="layout">
  <aside class="contents" aria-label="이 쪽 목차"><div class="sec-h"><h2 class="h">이 쪽</h2><span class="rh" aria-hidden="true" lang="en">CONTENTS</span></div>
    <ul class="toc" role="list"><li><a href="#st-n"><span>숫자판</span><i></i></a></li><li><a href="#st-30"><span>최근 30일</span><i></i></a></li><li><a href="#st-src"><span>소스</span><i></i></a></li></ul></aside>
  <main class="page" id="main">
    <div class="sec-h"><h1 class="h">발행 상태</h1><span class="rh" aria-hidden="true" lang="en">STATUS</span></div>
    <p class="st-basis">이 쪽 기준 <time datetime="2026-11-02T13:39+09:00">${shortDate(D.today.date)} 13:39 KST</time> · 발행할 때마다 다시 만든다</p>
    <dl class="boardC" id="st-n">
      <div><dt>마지막 발행 · 수집 완료</dt><dd><span class="boardC__n n">${L.finished}</span><span class="boardC__u">KST</span></dd><dd class="boardC__c">${shortDate(L.date)} 제 <span class="n">${L.no}</span>호 · 공개 목표 <span class="n">${L.target}</span>보다 <span class="n">${early}</span>분 앞<br><span class="ph"><b>자리</b>배포 완료 시각 · <span class="n">M5-15</span></span></dd></div>
      <div><dt>최근 30일 실행 성공률</dt><dd><span class="boardC__n n">${pct(R.pct)}</span><span class="boardC__u">%</span></dd><dd class="boardC__c">prod 수집 <span class="n">${R.all}</span>회 중 <span class="n">${R.ok}</span>회 · 실패 <span class="n">${R.all - R.ok}</span>회</dd></div>
      <div><dt>이번 달 비용 · 월 예산 대비</dt><dd><span class="boardC__n n">${C.thisMonth.pct.toFixed(2)}</span><span class="boardC__u">%</span></dd><dd class="boardC__c">운영 + 개발 실험 합 · 10월 <span class="n">${C.lastMonth.pct.toFixed(2)}</span>%</dd></div>
    </dl>

    <section id="st-30" class="stC" aria-labelledby="st-30-h">
      <div class="sec-h sec-h--thin"><h2 id="st-30-h" class="h">최근 30일 — 수집 완료 시각</h2><span class="rh" aria-hidden="true" lang="en">30 DAYS</span></div>
      <p class="sub">점 = 그날 첫 발행 실행의 수집 완료(KST) · 선 = 공개 목표(여름 <span class="n">07:00</span> → 겨울 <span class="n">07:30</span>)</p>
      <div class="dotC"><div class="dotC__plot"><svg viewBox="0 0 100 100" class="dotC__svg" aria-hidden="true" preserveAspectRatio="none">${g}</svg><div class="dotC__pts" aria-hidden="true">${pts}<i class="dotC__sel" style="left:${xP(29)}%"></i></div>${btns}</div><div class="dotC__ax" aria-hidden="true">${ax}</div></div>
      <div class="dotC__nav"><button class="ibtn ibtn--b" type="button" data-step="-1" aria-label="이전 날">${IC.right.replace('<svg', '<svg style="transform:scaleX(-1)"')}</button><p class="dotC__line" aria-live="polite" id="dotline">${esc(dayLine(ST.days[29]))}</p><button class="ibtn ibtn--b" type="button" data-step="1" aria-label="다음 날">${IC.right}</button></div>
      <ul class="legC" role="list"><li><i class="lg lg--on"></i>정시 <span class="n">${DC.ontime}</span></li><li><i class="lg lg--late"></i>늦음 <span class="n">${DC.late}</span></li><li><i class="lg lg--miss"></i>결호 <span class="n">${DC.missed}</span></li><li><i class="lg lg--x"></i>실패한 실행 <span class="n">1</span></li><li><i class="lg lg--pre"></i>창간 전 <span class="n">${DC.prelaunch}</span></li></ul>
      <ol class="sr">${ST.days.map((d) => `<li>${esc(dayLine(d))}</li>`).join('')}</ol>
      <p class="def"><b>성공률</b>은 실행 기준(PRD KPI · 운영 리포트와 같은 셈), <b>점</b>은 발행일 기준이다. 정시 = 공개 목표 + 15분 안. 10월 13일 점(<span class="n">00:28</span>)은 자정 직후 수동 실행이라 목표보다 이르다.</p>
    </section>

    <section id="st-src" class="stC" aria-labelledby="st-src-h">
      <div class="sec-h sec-h--thin"><h2 id="st-src-h" class="h">소스 건강도</h2><span class="rh" aria-hidden="true" lang="en">SOURCES</span></div>
      <p class="sub">최근 7일 <span class="n">${md(ST.days[23].date)} – ${md(D.today.date)}</span> · 수집 <span class="n">${ST.sources.length}</span>곳</p>
      <div class="tblwrap"><table class="srcC"><caption class="sr">소스 건강도 — 최근 7일</caption><thead><tr><th scope="col">매체</th><th scope="col" class="num">Tier</th><th scope="col" class="num">응답</th><th scope="col" class="num">새 기사</th><th scope="col" class="num">없음 연속</th></tr></thead><tbody>${srows}</tbody></table></div>
      <p class="def">없음 연속 = 응답은 했지만 새 기사가 없던 실행이 이어진 횟수(7 이상이면 점검 이슈). 0은 윤곽 숫자.</p>
    </section>
  </main>
</div>
${colophon({ linksAfter: [{ html: `<a href="#s4" class="colC">발행 상태 <span class="n">${pct(R.pct)}</span>%</a>` }] })}
</div>
${tabbar()}</div>
<script>window.__D3DAYS=${daysJson.replace(/</g, '\\u003c')};</script>`;
}

/* ───────── CSS ───────── */
export const css = `
code{font:600 13px/1 var(--font-numeric);letter-spacing:.02em;color:var(--ink)}
.code{margin-top:12px;padding:10px 12px;background:var(--paper-2);font:600 12px/1.45 var(--font-numeric);white-space:pre-wrap;overflow-wrap:anywhere;color:var(--ink)}
.safe-wrap,.ios{position:relative}
.fr>svg,.safe-wrap svg,.ios svg{display:block;width:100%;height:auto}
.safe-wrap .safe{position:absolute;inset:0}
.ios{border-radius:22.5%;overflow:hidden;width:min(180px,100%)}
/* OG C — 벽돌 레드 면 */
.og--cr{${PIN_R};background:var(--ticket);color:var(--ticket-fg)}
.ogc__top{position:absolute;left:5cqw;top:4.6cqw;max-width:52cqw}
.ogc__wm{font-size:5.6cqw;font-weight:800;letter-spacing:-.05em;line-height:1.05;white-space:nowrap}
.ogc__en{font:800 1.7cqw/1 var(--font-numeric);letter-spacing:.34em;color:var(--ticket-fg-2);margin-top:1.4cqw}
.ogc__tag{font-size:2.6cqw;margin-top:2.4cqw;color:var(--ticket-fg)}
.ogc__no{display:flex;align-items:baseline;gap:1cqw;margin-top:2.4cqw;font-size:2.6cqw;font-weight:800;white-space:nowrap}
.ogc__no i{display:inline-block;width:5cqw;border-bottom:.25cqw solid var(--ticket-fg-2);transform:translateY(-.5cqw)}
.ogc__no b{margin-left:2cqw;padding-left:2cqw;border-left:.25cqw solid var(--ticket-fg-2);font-weight:800}
.ogc__big{position:absolute;right:4cqw;bottom:-7.2cqw;font:800 46cqw/1 var(--font-numeric);font-variant-numeric:tabular-nums lining-nums;letter-spacing:-.02em;color:var(--ticket-fg)}
/* OG C — 크림 면(대회 · 팀) */
.og--cp{${PIN_P};background:var(--paper);color:var(--ink);outline:1px dashed var(--ink-3)}
.ogc__sig{position:absolute;left:5cqw;top:4.4cqw;font-size:2.2cqw;font-weight:800;color:var(--ink)}
.ogc__sig span{font:800 1.5cqw/1 var(--font-numeric);letter-spacing:.3em;color:var(--ink-2);margin-left:1.2cqw}
.ogc__short{position:absolute;left:4.4cqw;top:8cqw;font-size:17cqw;font-weight:800;letter-spacing:-.05em;line-height:1.1}
.ogc__short--l{font:800 27cqw/.9 var(--font-numeric);letter-spacing:-.01em;top:9cqw}
.ogc__name{position:absolute;left:5cqw;bottom:13.4cqw;font-size:4.4cqw;font-weight:800;letter-spacing:-.03em;line-height:1.1}
.ogc__bar{position:absolute;left:0;right:0;bottom:0;height:9cqw;display:flex;justify-content:space-between;align-items:center;padding:0 5cqw;background:var(--c);color:var(--competition-foreground);font-size:2.4cqw;font-weight:800}
.ogc__bar span[lang]{font:600 2.8cqw/1 var(--font-numeric);letter-spacing:.02em}
.ogc__bar .n{font:600 1.1em/1 var(--font-numeric)}
.ogc__abbr{position:absolute;left:4.4cqw;top:9.5cqw}
.ogc__abbr p{font:800 26cqw/.86 var(--font-numeric);letter-spacing:.01em;color:var(--kl)}
.ogc__abbr i{display:block;height:3.6cqw;margin-top:1.6cqw;background:linear-gradient(90deg,var(--k1) 50%,var(--k2) 50%);outline:.25cqw solid var(--ink)}
.ogc__tm{position:absolute;left:5cqw;right:5cqw;bottom:4.6cqw}
.og--ct .ogc__tm{left:auto;right:5cqw;bottom:5cqw;width:42cqw;text-align:right}
.ogc__tabs{display:flex;justify-content:flex-end;gap:.8cqw}
.ogc__ftab{display:inline-flex;align-items:center;height:3.6cqw;padding:0 1.2cqw;background:var(--c);color:var(--competition-foreground);font-size:2.1cqw;font-weight:800}
.ogc__name--t{position:static;font-size:5.6cqw;margin-top:1.6cqw;line-height:1.08}
.ogc__en2{font:600 2.4cqw/1.1 var(--font-numeric);letter-spacing:.02em;color:var(--ink-2);margin-top:1.2cqw}
/* 빈 상태 — 숫자 */
.restC{margin-top:12px;border-top:1px solid var(--rule);padding-top:14px}
.numC__c{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-size:14px;font-weight:800}
.numC__big{display:flex;align-items:flex-end;gap:12px;margin-top:12px}
.numC__big .n{font:800 var(--num-n1,56px)/.84 var(--font-numeric);letter-spacing:-.02em;color:var(--ink)}
.numC__w{display:grid;gap:4px;font-size:15px;font-weight:800;padding-bottom:2px}
.numC__w .n{font:600 14px/1 var(--font-numeric)!important;color:var(--ink-2)!important;letter-spacing:.02em!important}
.numC__note{font-size:15px;font-weight:800;margin-top:14px;max-width:34em}
@media (min-width:1024px){:root{--num-n1:96px;--num-n2:64px}}
.gutC{display:grid;grid-template-columns:var(--gutter) minmax(0,1fr);gap:0 12px;align-items:start}
.gutC__n{font:800 var(--num-brief-no)/.86 var(--font-numeric);font-variant-numeric:tabular-nums lining-nums}
.gutC__n--o{color:transparent;-webkit-text-stroke:2px var(--brand-accent)}
.intlC{margin-top:16px;padding-top:12px;border-top:2px solid var(--ink)}
.intlC__k{display:flex;align-items:center;gap:10px;font:600 15px/1 var(--font-numeric)}
.intlC__l{display:grid;grid-template-columns:1fr 1fr;gap:12px 20px;margin-top:12px}
.intlC__d{display:block;font:800 var(--num-n2,44px)/.84 var(--font-numeric);letter-spacing:-.02em}
.intlC__t{font-size:12.5px;color:var(--ink-2);margin-top:8px}
.intlC__t .n{font:600 14px/1 var(--font-numeric);color:var(--ink)}
.intlC__o{font-size:15px;font-weight:800;margin-top:4px}
.intlC__v{font-size:12.5px;color:var(--ink-2)}
.restC .tlink{margin-top:6px}
.zeroC{display:grid;grid-template-columns:auto minmax(0,1fr);gap:0 18px;align-items:start;margin-top:12px;padding-top:14px;border-top:1px solid var(--ink)}
.zeroC__n{font:800 var(--num-n1,56px)/.84 var(--font-numeric);color:transparent;-webkit-text-stroke:2px var(--ink-2);font-variant-numeric:tabular-nums lining-nums}
@media (min-width:1024px){.zeroC__n{-webkit-text-stroke-width:2.5px}}
.zeroC__h{font-size:16px;font-weight:800}
.zeroC__t{display:flex;flex-wrap:wrap;gap:4px 18px;word-spacing:4px;margin-top:10px;font-size:13px;color:var(--ink-2)}
.n.o{font:800 22px/1 var(--font-numeric);color:transparent;-webkit-text-stroke:1.5px var(--ink-2)}
.dashC{display:grid;grid-template-columns:auto minmax(0,1fr);gap:0 18px;align-items:start;margin-top:16px}
.dashC__n{display:block;width:44px;height:var(--num-n1,56px);background:linear-gradient(var(--ink-2),var(--ink-2)) center 58%/100% 7px no-repeat}
@media (min-width:1024px){.dashC__n{width:76px;background-size:100% 10px}}
.savedC{margin-top:8px}
.savedC a{display:grid;grid-template-columns:var(--gutter) minmax(0,1fr) auto;gap:0 12px;align-items:center;min-height:60px;padding:8px 0;border-bottom:1px solid var(--rule);color:var(--ink);text-decoration:none}
.savedC a:hover{background:var(--paper-2)}
.savedC__n{font:800 var(--num-n3,28px)/.86 var(--font-numeric)}
.savedC__t b{display:block;font-weight:800}
.savedC__t b .n{font:800 17px/1 var(--font-numeric)}
.savedC__t>span{font-size:13px;color:var(--ink-2)}
.savedC__t>span .n{font:600 14px/1 var(--font-numeric)}
.savedC .ic{width:18px;height:18px;color:var(--ink-2)}
@media (min-width:1024px){:root{--num-n3:34px}}
.btn--sm{min-height:44px;gap:8px;margin-top:12px;padding:0 14px}
.btn .ic{width:18px;height:18px}
/* /status C */
.boardC{display:grid;gap:0;margin-top:20px;border-top:2px solid var(--ink)}
.boardC>div{padding:14px 0 16px;border-bottom:1px solid var(--rule)}
.boardC dt{font-size:13px;font-weight:800;color:var(--ink-2)}
.boardC dd{display:flex;align-items:baseline;gap:6px;margin-top:10px}
.boardC__n{font:800 var(--num-n1,56px)/.84 var(--font-numeric);letter-spacing:-.02em}
.boardC__u{font:800 20px/1 var(--font-numeric);letter-spacing:.04em;color:var(--ink-2)}
.boardC dd.boardC__c{display:block;font-size:13px;line-height:1.6;color:var(--ink-2)}
.boardC__c .n{font:600 14.5px/1 var(--font-numeric);color:var(--ink)}
.boardC .ph{margin-top:6px}
@media (min-width:1024px){.boardC{grid-template-columns:repeat(3,minmax(0,1fr))}.boardC>div{padding:18px 24px 20px 0;border-bottom:0}.boardC>div+div{padding-left:24px;border-left:1px solid var(--rule)}.boardC__u{font-size:26px}}
.stC{margin-top:40px}
.dotC{position:relative;margin-top:14px;padding:0 0 22px 26px}
.dotC__plot{position:relative;height:200px}
@media (min-width:1024px){.dotC__plot{height:240px}}
.dotC__svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.dotC__svg .gl{stroke:var(--rule);stroke-width:1;vector-effect:non-scaling-stroke}
.dotC__svg .pre{fill:var(--paper-2)}
.dotC__svg .tg{fill:none;stroke:var(--ink);stroke-width:2;vector-effect:non-scaling-stroke}
.dotC__pts{position:absolute;inset:0;pointer-events:none}
.dp{position:absolute;width:9px;height:9px;margin:-4.5px 0 0 -4.5px}
.dp--ontime{border-radius:50%;background:var(--ink)}
.dp--late{border:1.75px solid var(--ink);background:var(--paper)}
.dp--miss{width:9px;height:2.5px;margin-top:-1px;background:var(--ink-2)}
.dp--x{width:10px;height:10px;margin:-5px 0 0 -5px;background:linear-gradient(45deg,transparent 40%,var(--brand-accent) 40% 60%,transparent 60%),linear-gradient(-45deg,transparent 40%,var(--brand-accent) 40% 60%,transparent 60%)}
.dotC__sel{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:var(--brand-accent);transition:left var(--duration-fast) var(--ease)}
.dotC__ax{position:absolute;left:26px;right:0;top:0;height:200px;pointer-events:none}
@media (min-width:1024px){.dotC__ax{height:240px}}
.dotC__y{position:absolute;left:-26px;transform:translateY(-50%);font:600 12px/1 var(--font-numeric);color:var(--ink-2)}
.dotC__x{position:absolute;top:calc(100% + 8px);transform:translateX(-50%);font:600 12px/1 var(--font-numeric);color:var(--ink-2);white-space:nowrap}
.dotC__x:last-child{transform:translateX(-100%)}
.dotC__pre{position:absolute;top:8px;text-align:center;font-size:11px;font-weight:800;color:var(--ink-2)}
.dotC__tg{position:absolute;transform:translate(6px,calc(-100% - 4px));font-size:11px;font-weight:800;color:var(--ink);white-space:nowrap}
.dotC__b{position:absolute;top:0;bottom:0;padding:0;border:0;background:transparent}
@media (max-width:1023px){.dotC__b{display:none}}
.dotC__b:hover{box-shadow:inset 0 -3px 0 var(--ink-2)}
.dotC__b[aria-pressed="true"]{box-shadow:inset 0 -3px 0 var(--brand-accent)}
.dotC__nav{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:center;gap:8px;margin-top:8px;border-top:1px solid var(--ink);border-bottom:1px solid var(--rule)}
.ibtn--b{color:var(--ink)}
.dotC__line{font-size:14px;font-weight:800;text-align:center;line-height:1.4;padding:8px 0}
.dotC__line.is-stamp{animation:stamp var(--duration-fast) var(--ease) both}
.legC{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:12px;font-size:12.5px;color:var(--ink-2)}
.legC li{display:inline-flex;align-items:center;gap:6px}
.legC .n{font:600 14px/1 var(--font-numeric);color:var(--ink)}
.lg{display:inline-block;width:10px;height:10px}
.lg--on{border-radius:50%;background:var(--ink)}
.lg--late{border:1.75px solid var(--ink)}
.lg--miss{height:2.5px;background:var(--ink-2)}
.lg--x{background:linear-gradient(45deg,transparent 40%,var(--brand-accent) 40% 60%,transparent 60%),linear-gradient(-45deg,transparent 40%,var(--brand-accent) 40% 60%,transparent 60%)}
.lg--pre{background:var(--paper-2);outline:1px solid var(--rule)}
.tblwrap{margin-top:12px}
.srcC{width:100%;font-size:13.5px}
.srcC th,.srcC td{padding:10px 0 10px 10px;border-bottom:1px solid var(--rule);text-align:left;vertical-align:baseline}
.srcC th:first-child{padding-left:0}
.srcC thead th{font-size:12px;font-weight:800;color:var(--ink-2);border-bottom:1px solid var(--ink);padding-top:0}
.srcC tbody th{font-weight:800}
.srcC .num{text-align:right;white-space:nowrap}
.srcC td .n{font:800 18px/1 var(--font-numeric)}
.srcC td .n.o{font-size:18px}
.srcC .den{font:600 13px/1 var(--font-numeric);color:var(--ink-2)}
.srcC tr.is-flag td:last-child .n{color:var(--brand-accent-text)}
.tier{display:inline-grid;place-items:center;min-width:24px;height:24px;padding:0 4px}
.tier .n{font-size:14px!important}
.tier--2{border:2px solid var(--ink)}.tier--3{border:1px dashed var(--ink-2);color:var(--ink-2)}
@media (max-width:520px){.srcC thead th:nth-child(2),.srcC td:nth-child(2){display:none}.srcC td .n{font-size:16px}}
.toc{margin-top:10px}
.toc a{display:flex;align-items:baseline;gap:6px;min-height:44px;padding:10px 0;border-bottom:1px solid var(--rule);font-size:14px;color:var(--ink);text-decoration:none}
.toc a i{flex:1;border-bottom:2px dotted var(--ink-3);transform:translateY(-3px)}
.colC .n{font:800 17px/1 var(--font-numeric);margin-left:4px}
`;

const js = `
(function(){var days=window.__D3DAYS;if(!days)return;var bs=[].slice.call(document.querySelectorAll('.dotC__b'));var line=document.getElementById('dotline');var sel=document.querySelector('.dotC__sel');var cur=29;
var rm=matchMedia('(prefers-reduced-motion: reduce)');
function set(i){if(i<0||i>29)return;cur=i;bs.forEach(function(b,k){b.setAttribute('aria-pressed',String(k===i))});line.textContent=days[i];if(!rm.matches){line.classList.remove('is-stamp');void line.offsetWidth;line.classList.add('is-stamp')}
sel.style.left=(100*(i+.5)/30)+'%';}
bs.forEach(function(b,k){b.addEventListener('click',function(){set(k)})});
document.querySelectorAll('[data-step]').forEach(function(b){b.addEventListener('click',function(){set(cur+(+b.getAttribute('data-step')))})});
set(29);line.classList.remove('is-stamp');})();
`;

export function build() {
  const m = meta({
    name: 'C 등번호 (Squad No.)',
    one: '‘숫자가 주인공’을 끝까지 민다 — 아이콘 · OG · 빈 상태 · /status가 모두 Barlow 큰 숫자 하나로 말한다(실선 · 윤곽 · 대시).',
    pros: ['홈 화면 · 링크 미리보기에서 가장 눈에 띈다(진한 레드 면 + 큰 숫자) — 세 안 중 첫인상이 가장 강하다', '이미 7곳에 퍼진 윤곽 숫자 언어를 그대로 키워 빈 상태 일관성이 가장 높다 — 새 도형 0', '/status 점 그래프가 실제 수집 완료 시각을 그대로 보여 줘 ‘10월 28일부터 정시’가 한눈에 읽힌다', '대회 · 팀 OG가 크림 면이라 화면과 같은 라이트 대회 색 · 키트 색을 쓴다'],
    cons: ['“5”가 브랜드로 읽힐지 불확실하다 — 알림 배지 · 숫자 채널 앱처럼 보일 위험', '벽돌 레드 넓은 면은 DESIGN §2.2 “레드를 넓은 면으로 깔지 않는다(다크 티켓만 예외)”의 예외를 아이콘 · OG로 넓히는 규칙 변경이다(사용자 확인)', '숫자가 없는 상태(오프라인)에 대시를 억지로 세운다 — 첫눈에 “무엇이 없는지” 글을 읽어야 안다', 'OG 면이 둘(레드 · 크림)로 갈려 한 벌로 보이는 힘이 A · B보다 약하다', '/status 점 그래프는 375에서 날짜 칸이 11px라 화살표 버튼으로 고른다(점 직접 누르기는 1024 이상)'],
    diff: '<b>중</b> — 아이콘 “5” 글리프 path 1회, OG 면 2종(레드 · 크림) 템플릿 + 변형 3, 빈 상태는 숫자 조판(CSS), /status 점 그래프 SVG(빌드 때 계산) + 날짜 선택 섬 1개(gzip 약 0.4KB).',
    bundle: '폰트 변화 0 — EuroDigest Sans 400 · 800 + Barlow Condensed 600 · 800(417.8KB, 2패밀리 4파일). 새 색 토큰 0, OG 전용 변수 4개 제거. favicon.svg 약 0.5KB · ico 약 1.5KB.',
    rules: '<b>필요</b> — (1) DESIGN §2.2 레드 넓은 면 예외에 “아이콘 · OG 면(다크 --ticket 값)” 추가 (2) OG 호수 숫자는 실선(scope의 윤곽 안은 D2 숫자 상태 규칙과 충돌해 바꿈) (3) 다크 탭 파비콘은 --brand-accent 다크 면. 휴식기 S4 변형은 화면 결정.',
    axes: AXES, me: 2,
  });
  const body = `${m}
${topbar('D3 시안 C · 등번호')}
<div class="board">
  <header class="hero"><p class="hero__k" lang="en" aria-hidden="true">D3 · SQUAD NO.</p><h1>C 등번호</h1><p>숫자 하나가 화면의 절반을 맡는다. 값이 있으면 실선, 0이면 윤곽, 값이 없으면 대시 — D2 숫자 상태 규칙을 아이콘 · OG · 빈 상태 · 상태 쪽까지 민다.</p></header>
  ${sIcons()}
  ${sOg()}
  ${sEmpty()}
</div>
${sStatus()}`;
  return page({
    file: 'concept-c.html', title: 'D3 시안 C · 등번호 — 유로 다이제스트',
    comment: `D3 시안 C — 등번호 (Squad No.)
한 줄: '숫자가 주인공'을 끝까지 — 아이콘 · OG · 빈 상태 · /status가 모두 Barlow 큰 숫자 하나(실선 · 윤곽 · 대시)
장점: 첫인상이 가장 강함 · 윤곽 숫자 언어를 키워 빈 상태 일관성 최고 · /status 점 그래프가 실제 시각을 보임
단점: "5"의 브랜드 인지 불확실 · 벽돌 레드 넓은 면 = DESIGN §2.2 규칙 변경 · 대시 억지 · OG 면 2종 · 375 점 선택은 화살표
구현 난이도: 중 (5 글리프 path 1회, OG 면 2종, 숫자 조판 CSS, 점 그래프 SVG + 섬 1)
번들/폰트: 폰트 변화 0 (EuroDigest Sans 400·800 + Barlow Condensed 600·800 = 417.8KB, ../fonts/ 로컬), 새 색 토큰 0, OG 전용 변수 4개 제거
데이터: docs/design/d3/data/d3-data.json (실값, 2026-11-02 기준). 문구 생성·LLM 호출 0
견본 단독 렌더: ?solo=<data-solo 값>&w=1200 (예: ?solo=og-news-100)`,
    css, body, js,
  });
}
