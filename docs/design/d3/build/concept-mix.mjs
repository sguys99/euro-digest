// D3 혼합안 2차 — C 등번호 기반(사용자 결정 2026-11-02). 1차(A 아이콘 · OG + C 빈 상태 + B /status)는 커밋 5552dbf.
// · OG(기본 · 날짜 · 대회 · 팀) · /status(N1 숫자판 + 점 그래프) · 뒤표지 링크 = C 그대로(팀 거대 약어 채움만 내부 하한 5.3으로 강화)
// · 앱 아이콘 · 파비콘 = C 스타일로 ED(벽돌 레드 면 + 지면색 ED + 아래 짧은 괘선, 1~5 거터 변형 없음)
// · 빈 상태 = S4 가족(1차 확정 유지) + C 검색 0 · /offline/ = C 언어로 다시(저장한 호 수 실선 + 열 수 있는 호 목록)
// · /status = C + 30칸 발행일 띠(점 그래프 아래 — 기호로 상태 구분)
import { D, ST, TOK, COMP, IC, esc, ftab, md, dow, longDate, shortDate, pix, pixZoom, DAYSTATE, page } from './common.mjs';
import { sOg, sStatus, searchZeroC, js as jsC, css as cssC } from './concept-c.mjs';

const T = TOK;
/* ───────── 1. 아이콘 — C 스타일 ED ───────── */
// 512 좌표. ED는 웹폰트(Barlow Condensed 800)로 그린 견본 — 구현(M5-02)에서는 글리프 외곽선을 path로 옮긴다
const ED = (x, y, size, fill) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Barlow Condensed" font-weight="800" font-size="${size}" letter-spacing="${(-size * 0.01).toFixed(1)}" fill="${fill}">ED</text>`;
function iconE(kind, { face = T.ticketD, fg = T.ticketFgD, label = '' } = {}) {
  const aria = label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"';
  // any — 면 꽉 채움(C와 같음). ED + 아래 짧은 괘선
  if (kind === 'any') return `<svg viewBox="0 0 512 512"${aria}><rect width="512" height="512" fill="${face}"/>${ED(256, 352, 340, fg)}<rect x="196" y="398" width="120" height="16" fill="${fg}"/></svg>`;
  // maskable · apple — ED · 괘선 모두 안전 원(지름 80%) 안
  if (kind === 'maskable' || kind === 'apple') return `<svg viewBox="0 0 512 512"${aria}><rect width="512" height="512" fill="${face}"/>${ED(256, 300, 236, fg)}<rect x="214" y="330" width="84" height="12" fill="${fg}"/></svg>`;
  // small — 48(벡터): ED만
  return `<svg viewBox="0 0 512 512"${aria}><rect width="512" height="512" fill="${face}"/>${ED(256, 410, 470, fg)}</svg>`;
}
// 16px 픽셀 격자 — A의 P16(획 2px)을 C 색으로
const P16 = [
  '................', '................', '................',
  '..#####.#####...', '..#####.######..', '..##....##..##..', '..##....##..##..', '..####..##..##..',
  '..####..##..##..', '..##....##..##..', '..##....##..##..', '..#####.######..', '..#####.#####...',
  '................', '................', '................',
];
// 32px 픽셀 격자 — 세로 획 4px · 가로 획 3px, 글자 높이 20px(6~25행), D 모서리는 2px 깎음
const P32 = (() => {
  const g = Array.from({ length: 32 }, () => Array(32).fill('.'));
  const fill = (x0, x1, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = '#'; };
  fill(5, 8, 6, 25); fill(5, 13, 6, 8); fill(5, 12, 14, 16); fill(5, 13, 23, 25); // E
  fill(16, 19, 6, 25); fill(16, 24, 6, 8); fill(16, 24, 23, 25); fill(23, 26, 8, 23); // D
  [[25, 6], [26, 6], [26, 7], [25, 25], [26, 25], [26, 24]].forEach(([x, y]) => { g[y][x] = '.'; });
  g[8][25] = '#'; g[23][25] = '#';
  return g.map((r) => r.join(''));
})();
const palL = { '.': T.ticketD, '#': T.ticketFgD };
const palD = { '.': T.accentD, '#': T.paperD };
const SAFE = `<svg viewBox="0 0 512 512" class="safe" aria-hidden="true"><circle cx="256" cy="256" r="204.8" fill="none" stroke="${T.paperL}" stroke-width="3" stroke-dasharray="10 8"/><path d="M256 0V512M0 256H512" stroke="${T.paperL}" stroke-width="1.5" stroke-dasharray="4 6"/></svg>`;
const faviconSrc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>.f{fill:${T.ticketD}}.g{fill:${T.ticketFgD}}@media (prefers-color-scheme:dark){.f{fill:${T.accentD}}.g{fill:${T.paperD}}}</style><rect class="f" width="32" height="32"/><path class="g" d="…P32 격자 그대로(사각형 합) 또는 ED 글리프 외곽선(M5-02)…"/></svg>`;

function sIcons() {
  const sized = (svg, s) => svg.replace('<svg ', `<svg width="${s}" height="${s}" `);
  const ladder = `<figure><div>${pix(P16, palL, { px: 16, title: '16px 픽셀 격자' })}</div><figcaption>16</figcaption></figure>`
    + `<figure><div>${pix(P32, palL, { px: 32, title: '32px 픽셀 격자' })}</div><figcaption>32</figcaption></figure>`
    + `<figure><div>${sized(iconE('small', { label: '48px' }), 48)}</div><figcaption>48</figcaption></figure>`
    + `<figure><div class="ios ios--180">${sized(iconE('apple', { label: 'apple-touch 180px' }), 180)}</div><figcaption>180 apple</figcaption></figure>`
    + `<figure><div>${sized(iconE('any', { label: 'any 192px' }), 192)}</div><figcaption>192 any</figcaption></figure>`
    + `<figure class="big"><div>${sized(iconE('any', { label: 'any 512px' }), 512)}</div><figcaption>512 any — 좁은 화면에서는 폭에 맞춰 줄여 보임</figcaption></figure>`;
  const masks = () => ['m-circle', 'm-squircle', 'm-round'].map((m, i) => `<figure><div class="${m}">${sized(iconE('maskable'), 60)}</div><figcaption>유로 다이제스트<span>${['원', '스퀴클', '둥근 사각'][i]}</span></figcaption></figure>`).join('');
  const tab = (dark) => `<div class="tabs tabs--${dark ? 'd' : 'l'}"><div class="tabs__t tabs__t--on">${pix(P16, dark ? palD : palL, { title: `파비콘 16px ${dark ? '다크' : '라이트'}` })}<span>유로 다이제스트</span></div><div class="tabs__t"><i aria-hidden="true"></i><span>새 탭</span></div></div>`;
  const tab32 = (dark) => `<div class="tabs tabs--${dark ? 'd' : 'l'} tabs--hi"><div class="tabs__t tabs__t--on">${pix(P32, dark ? palD : palL, { px: 16, title: `파비콘 32px 격자를 16px 칸에 — 고해상도 화면 ${dark ? '다크' : '라이트'}` })}<span>유로 다이제스트 <small>2× 화면</small></span></div></div>`;
  return `<section id="s1" class="blk" aria-labelledby="s1h">
  <div class="sec-h"><h2 id="s1h"><span class="blk__no">1</span>앱 아이콘 · 파비콘</h2><span class="rh" aria-hidden="true" lang="en">ICONS</span></div>
  <p class="sub2">C 아이콘의 ‘5’ 자리에 <b>ED</b>. 벽돌 레드 면(다크 <code>--ticket</code> ${T.ticketD}) · 지면색 ED(Barlow 800, <code>--ticket-fg</code> 다크 ${T.ticketFgD}) · 아래 짧은 괘선. 세 파일 모두 면을 꽉 채운다(투명 0). C의 1~5 거터 변형은 뺐다.</p>
  <div class="grid3" style="margin-top:18px">
    <figure class="fr"><p class="fr__cap"><b>any 512</b><span class="path">public/icons/icon-512.png</span> · 192 같은 그림</p>${iconE('any', { label: 'any 아이콘 — 벽돌 레드 면, 지면색 ED, 아래 짧은 괘선' })}</figure>
    <figure class="fr"><p class="fr__cap"><b>maskable 512</b><span class="path">icon-maskable-512.png</span> · 점선 원 = 안전 영역 지름 80% — ED · 괘선 모두 안</p><div class="safe-wrap">${iconE('maskable', { label: 'maskable 아이콘 — 안전 원 안의 ED와 괘선' })}${SAFE}</div></figure>
    <figure class="fr"><p class="fr__cap"><b>apple-touch 180</b><span class="path">apple-touch-icon.png</span> · 투명 0 · iOS가 모서리를 깎음</p><div class="ios">${iconE('apple', { label: 'apple-touch 아이콘' })}</div></figure>
  </div>
  <h3 class="h3">크기 사다리 <small lang="en">16 · 32 · 48 · 180 · 192 · 512</small></h3>
  <div class="ladder">${ladder}</div>
  <p class="sub2">16 · 32는 픽셀 격자에 맞춰 손으로 그린다(벡터 축소는 흐려진다) — 16은 획 2px, 32는 세로 획 4px · 가로 획 3px. 48 이상은 벡터.</p>
  <h3 class="h3">16 · 32 확대 견본 <small lang="en">PIXEL GRID</small></h3>
  <div class="pxset">
    <figure class="zoom">${pixZoom(P16, palL, '16px 라이트 격자 8배 확대')}<figcaption>16 · 라이트 탭</figcaption></figure>
    <figure class="zoom">${pixZoom(P16, palD, '16px 다크 격자 8배 확대')}<figcaption>16 · 다크 탭</figcaption></figure>
    <figure class="zoom">${pixZoom(P32, palL, '32px 라이트 격자 4배 확대')}<figcaption>32 · 라이트 탭</figcaption></figure>
    <figure class="zoom">${pixZoom(P32, palD, '32px 다크 격자 4배 확대')}<figcaption>32 · 다크 탭</figcaption></figure>
  </div>
  <h3 class="h3">런처 마스크 · 홈 화면 바탕 <small lang="en">LAUNCHER</small></h3>
  <div class="devices"><div class="home home--l">${masks()}</div><div class="home home--d">${masks()}</div></div>
  <p class="sub2">바탕은 기기 색 견본이다. 흰 바탕 면 경계 7.26, 검 바탕 2.89(면이 가라앉아도 지면색 ED · 괘선이 형태를 만든다). 아래 이름 줄이 늘 붙는 런처라 숫자 앱 · 알림 배지로 오해할 여지는 C의 ‘5’보다 적다.</p>
  <h3 class="h3">파비콘 · 브라우저 탭 <small lang="en">FAVICON</small></h3>
  <div class="grid2">
    <div class="fr"><p class="fr__cap"><b>favicon.svg</b><span class="path">public/favicon.svg</span> — 라이트 탭 벽돌 레드 · 다크 탭 레드(<code>--brand-accent</code> 다크 ${T.accentD}) 면 + 네이비 ED — 어두운 탭 바에서 벽돌 레드가 가라앉아 밝은 값으로 바꾼다(C 그대로)</p>${tab(false)}${tab(true)}${tab32(false)}${tab32(true)}
      <pre class="code" aria-label="favicon.svg 구조">${esc(faviconSrc)}</pre></div>
    <div class="fr"><p class="fr__cap"><b>favicon.ico 16 · 32</b><span class="path">public/favicon.ico</span> — 라이트 면만(ICO는 테마를 모른다)</p>
      <div class="px">
        <figure>${pix(P16, palL, { px: 16, title: '16px 라이트' })}<figcaption>16</figcaption></figure>
        <figure>${pix(P32, palL, { px: 32, title: '32px 라이트' })}<figcaption>32</figcaption></figure>
      </div>
      <p class="sub2" style="margin-top:12px">실제 크기 탭에서 16은 E · D 사이 1px 틈과 D 모서리(1px 깎음)까지 읽힌다. 2× 화면은 32 격자를 16px 칸에 쓴다.</p></div>
  </div>
</section>`;
}

/* ───────── 3. 빈 상태 — S4 가족(1차 확정) + C 검색 0 + C 언어 /offline/ ───────── */
const LEAD = '오늘은 5줄을 쉽니다';
const WHY = `전날 ${D.competitions.length}개 대회에 끝난 경기가 없었습니다.`;
const toNews = '<a class="tlink" href="#top">주요 뉴스로<span aria-hidden="true"> ↓</span></a>';
// 5줄 블록 — 지금 구현과 같은 머리 · 부제(S4 자리는 날짜를 단정하지 않는다: "전날(현지) 경기 기준")
const brief = (inner) => `<div class="sec-h"><h4 class="h">오늘의 5줄</h4><span class="rh" aria-hidden="true" lang="en">STARTING FIVE</span></div><p class="sub">전날(현지) 경기 기준</p>${inner}`;
// S4 가족: 거터 레드 윤곽 0(오늘 실린 줄 수 — 장식) + "오늘은 5줄을 쉽니다" + 이유 블록(변형마다 다름) + 링크
const s4 = (body, cls = '') => `<div class="s4${cls ? ` ${cls}` : ''}"><span class="s4__no" aria-hidden="true">0</span><div class="s4__b"><p class="s4__lead">${LEAD}</p>${body}</div></div>`;
const s4Plain = () => s4(`<p class="s4__why">${esc(WHY)}</p><p class="s4__links">${toNews}</p>`);
function s4Intl() {
  const w = D.intl;
  const li = (m) => `<li><time datetime="${m.utc}"><span class="s4i__d n" aria-hidden="true">${m.md}</span><span class="sr">${shortDate(m.date)}</span></time><p class="s4i__t">(${m.dow}) <span class="n">${m.time}</span> KST</p><p class="s4i__o">${esc(m.opponent)}</p><p class="s4i__v">${m.home ? '홈' : '원정'} · ${esc(m.competition)}</p></li>`;
  return s4(`<p class="s4__why">${esc(WHY)}</p>
      <div class="s4i"><p class="s4i__k"><span class="stamp">A매치 기간</span><span class="s4i__r"><span class="n">${md(w.from)}</span> – <span class="n">${md(w.to)}</span></span><span class="sr">${shortDate(w.from)}부터 ${shortDate(w.to)}까지</span></p>
      <ol class="s4i__l" role="list" aria-label="A매치 기간 경기 — 킥오프 순">${w.matches.map(li).join('')}</ol></div>
      <p class="s4__links"><a class="tlink" href="#s3-nat">A매치 섹션으로<span aria-hidden="true"> ↓</span></a>${toNews}</p>`, 's4--intl');
}
function s4Off(id, date, phase, sample = false) {
  const c = COMP[id], word = D.copy.offSeason[phase].label;
  return s4(`<p class="s4o__c">${ftab(id)}<span>${esc(c.nameKo)} <span class="n">${c.season}</span> 시즌</span>${sample ? '<span class="stamp stamp--ph">견본</span>' : ''}</p>
      <p class="s4o__big"><time datetime="${date}"><span class="n" aria-hidden="true">${md(date)}</span><span class="sr">${longDate(date)}</span></time><span class="s4o__w">${word}<span class="n">${date.slice(0, 4)}</span></span></p>
      <p class="s4o__note">${esc(D.copy.offSeason[phase].note)}</p><p class="s4__links">${toNews}</p>`, 's4--off');
}
const ctx = (lbl, inner, foot) => `<figure class="ctx"><figcaption class="ctx__lbl">${lbl}</figcaption>${inner}${foot ? `<div class="ba">${foot}</div>` : ''}</figure>`;
const ba = (before, after) => `<div class="ba__row"><span class="ba__k">지금</span><span>${before}</span></div><div class="ba__row"><span class="ba__k">새</span><span>${after}</span></div>`;
const one = (k, t) => `<div class="ba__row"><span class="ba__k">${k}</span><span>${t}</span></div>`;


function offlineC() {
  const saved = ['2026-11-02', '2026-11-01', '2026-10-31'];
  const no = (d) => (Date.parse(d) - Date.parse('2026-10-12')) / 864e5 + 1;
  return `<div class="sec-h"><h4 class="h">${esc(D.copy.offline.h1)}</h4><span class="rh" aria-hidden="true" lang="en">OFFLINE</span></div>
  <div class="offC"><p class="lead">${esc(D.copy.offline.lead)}</p><p class="body2">${esc(D.copy.offline.body)}</p><button class="btn btn--sm" type="button">${IC.retry}다시 시도</button></div>
  <div class="sec-h offC__h"><h5 class="h">${esc(D.copy.offline.saved)}</h5><span class="rh" aria-hidden="true" lang="en">SAVED</span></div>
  <p class="offC__cnt"><span class="offC__n n" aria-hidden="true">${saved.length}</span><span class="offC__t"><b>연결 없이 열 수 있는 호 <span class="sr">${saved.length}개</span></b><span>최근 3일 <span class="n">${md(saved.at(-1))} – ${md(saved[0])}</span> · 결호가 낀 날은 그만큼 적어요</span></span></p>
  <ul class="savedC" role="list">${saved.map((d) => `<li><a href="#top"><span class="savedC__n" aria-hidden="true"><span class="n">${no(d)}</span><small>호</small></span><span class="savedC__t"><b>${shortDate(d)}</b><span class="sr">제 ${no(d)}호</span></span>${IC.right}</a></li>`).join('')}</ul>`;
}

function sEmpty() {
  const e = D.emptyStates;
  return `<section id="s3" class="blk" aria-labelledby="s3h">
  <div class="sec-h"><h2 id="s3h"><span class="blk__no">3</span>빈 상태 조형</h2><span class="rh" aria-hidden="true" lang="en">EMPTY</span></div>
  <p class="sub2">숫자 상태 규칙 하나 — 날짜 · 개수처럼 값이 있으면 <b>실선</b>, 결과가 0이면 <b>윤곽</b>, 값 자체가 없으면 <b>대시</b>(이번 화면에는 쓸 곳이 없다). 5줄 자리 빈 상태 셋(경기 없음 · A매치 기간 · 비시즌)은 거터의 레드 윤곽 <b>0</b>과 “오늘은 5줄을 쉽니다”를 늘 같은 자리에 두고, 이유 블록만 바꾼다. 새 도형 0.</p>

  <div class="cmp" id="s3-rest">
    <h3 class="h3">휴식기 — A매치 기간 <small lang="en">NEW S4 VARIANT</small></h3>
    <p class="sub2">견본 날 <b>11월 12일</b> — <span class="path">configs/national-team.json</span>의 두 경기(11.13 · 11.17, 경기일 ±3일 → <span class="n">11.10 – 11.20</span>) 기간 안이고, 전날 6개 대회에 끝난 경기가 없는 날. 같은 날 지금 화면과 새 화면을 나란히 둔다.</p>
    <div class="es grid2 cmp__g">
      ${ctx('<b>지금 · S4</b><span>M1-32 구현 그대로</span>', brief(s4Plain()), one('읽힘', 'A매치 기간이라 쉬는지는 이 블록에서 알 수 없다 — 아래 A매치 섹션까지 내려가야 한다'))}
      ${ctx('<b>새 · A매치 휴식기 변형</b><span>S4 위에 이유 블록 하나만 더함</span>', `${brief(s4Intl())}<p class="omit" id="s3-nat"><span class="stamp stamp--om">생략</span><span><b>A매치 섹션</b>이 5줄 바로 아래 이어진다 — 경기 행 · 소집 선수 · 대표팀 소식(M3-13, 바꾸지 않음)</span></p>`, one('읽힘', '거터 0 · 문장 · 링크는 S4와 같다. 그 아래 <b>A매치 기간 도장 + 기간</b>과 <b>경기 날짜 2개(N2 실선)</b> + 상대 · 홈/원정만. 장소 · 결과는 A매치 섹션이 맡는다(중복 · 결과 노출 0)'))}
    </div>
    <p class="def"><b>판정</b> 홈 오늘의 5줄이 S4(<code>emptyReason</code> no-matches)이고 · 비시즌이 아니고 · <code>restPeriodOf(발행일)</code>에 <code>international-window</code>가 있을 때만. 결과 지연(results-pending)은 오류 상자, 비시즌은 비시즌 변형이 먼저. 날짜 아카이브(“이날의 5줄”)는 S4 그대로. 기간 안 경기만(연기 경기 제외 — <code>nationalWindows</code> 그대로), 지난 경기는 날짜 <code>--ink-2</code> + “끝남”, 스코어는 싣지 않는다.</p>
  </div>

  <h3 class="h3">비시즌 · 검색 결과 없음 <small lang="en">OFF-SEASON · SEARCH</small></h3>
  <div class="es grid2">
    ${ctx('<b>비시즌 · 종료</b><span>견본 날 6월 7일 — UCL endDate 다음 날부터</span>', brief(s4Off(e.ended.comp, e.ended.date, 'ended')), ba('평탄 탭 + 시즌 + 날짜 Barlow 800 34px + “종료” + 안내 — 거터 없음', 'S4 가족 — 거터 윤곽 0 · “오늘은 5줄을 쉽니다” 아래 평탄 탭 · 시즌 + 날짜 <b>N2 실선</b> + 종료 · 연도 + 안내'))}
    ${ctx('<b>비시즌 · 개막</b><span>견본 날 8월 15일 — 2027-28 설정 전이라 라리가 지난 개막일</span>', brief(s4Off(e.upcomingSample.comp, e.upcomingSample.date, 'upcoming', true)), ba('평탄 탭 + 날짜 + “개막” — 글자만', '같은 틀, 낱말만 “개막”'))}
    ${ctx('<b>검색 결과 없음</b><span>오버레이 · <span class="path">/search/</span> 공용 · e2e 0건 질의</span>', searchZeroC(), ba('윤곽 ‘0’ 64px + “결과가 없어요” + 안내', '윤곽 0 <b>N2</b>(44 / 64px) + 유형 4개도 윤곽 0(22px · 1.25px) — 결과가 바뀔 때만 찍힘 150ms'))}
    ${ctx('<b>숫자 상태 한 줄 요약</b><span>D2 숫자 상태 규칙 그대로</span>', `<dl class="nrule">
      <div><dt><span class="nrule__s n" aria-hidden="true">11.13</span></dt><dd><b>실선</b> 값이 있다 — 날짜 · 개수 · 시각 · 성공률</dd></div>
      <div><dt><span class="nrule__o n" aria-hidden="true">0</span></dt><dd><b>윤곽</b> 결과가 0이다 — 검색 0 · 유형별 0 · 저장한 호 0(<code>--ink-2</code>)</dd></div>
      <div><dt><span class="nrule__r n" aria-hidden="true">0</span></dt><dd><b>레드 윤곽</b> 오늘 실린 5줄이 0줄 — 5줄 자리에만(<code>--brand-accent</code>)</dd></div>
      <div><dt><span class="nrule__d" aria-hidden="true"></span></dt><dd><b>대시</b> 값 자체가 없다 — 빈 상태 화면에는 쓰지 않는다(C의 오프라인 대시는 뺐다)</dd></div>
    </dl>`, one('규칙', '빈 상태 숫자는 N2(44 / 64px)까지 — 빈 날이 꽉 찬 날(5줄 등번호 40 / 54px)보다 크게 말하지 않게. N1은 /status 숫자판에만'))}
  </div>

  <h3 class="h3">/offline/ <small lang="en">OFFLINE</small></h3>
  ${ctx('<b>/offline/ 화면</b><span>서비스 워커가 저장하지 않은 쪽을 열면 — 셸은 /status와 같다</span>', offlineC(), ba('h1 + OFFLINE + 안내 2줄 + 다시 시도 + 저장해 둔 호 목록(날짜 22px + 제 N호) — 글자만', '<b>저장한 호 수</b>를 N2 실선 숫자로(0이면 윤곽 0) + 열 수 있는 호를 호수 거터(N3) 목록으로. 범위 = 서비스 워커가 미리 받는 최근 3일 호(<code>recentIssueDates</code> — 결호는 건너뜀). C의 대시 거터는 버렸다 — 이 쪽을 못 여는 것은 ‘값 없음’이 아니라 안내 문장이 맡는다'))}
</section>`;
}

/* ───────── 4. 규칙 — C 한 벌 ───────── */
function sRules() {
  const rule = (cls, k, where) => `<li><span class="ln ${cls}" aria-hidden="true"></span><b>${k}</b><span>${where}</span></li>`;
  return `<section id="s4" class="blk" aria-labelledby="s4h">
  <div class="sec-h"><h2 id="s4h"><span class="blk__no">4</span>규칙</h2><span class="rh" aria-hidden="true" lang="en">RULES</span></div>
  <p class="sub2">C 한 벌로 모았다. 바뀌는 DESIGN 규칙은 레드 넓은 면 예외(아이콘 · 파비콘 · OG) 하나와 그에 딸린 쓰임 추가뿐이다 — 화면 안 규칙은 그대로.</p>
  <div class="seam">
    <div class="seam__c"><h3 class="seam__h">레드 넓은 면</h3><ul class="mo" role="list">
      <li><b>허용 — 화면 밖 이미지만</b> 앱 아이콘 · 파비콘 · OG 기본 · 날짜 면 = 벽돌 레드 <code>${T.ticketD}</code>(다크 <code>--ticket</code> 값), 다크 탭 파비콘 = <code>${T.accentD}</code>(다크 <code>--brand-accent</code>)</li>
      <li><b>화면 안 그대로</b> 넓은 레드 면은 다크 티켓뿐. 레드는 S4 거터 윤곽 0 · 실패한 실행 엑스 표식 · 선택 막대 · 러닝 헤드 글자</li>
      <li><b>대회 · 팀 OG는 크림 면</b> 데이터 색(대회 6색 · 키트 2색)이 주인공 — 레드 면 위에 데이터 색을 올리지 않는다</li>
    </ul></div>
    <div class="seam__c"><h3 class="seam__h">숫자 크기</h3><ul class="nums" role="list">
      <li><span class="nums__v nums__v--1 n" aria-hidden="true">07:18</span><b>N1 56 / 96</b><span>/status 숫자판 3개 — 그 쪽의 주제일 때만</span></li>
      <li><span class="nums__v nums__v--2 n" aria-hidden="true">11.13</span><b>N2 44 / 64</b><span>빈 상태 날짜 · 검색 0 · 저장한 호 수</span></li>
      <li><span class="nums__v nums__v--b n" aria-hidden="true">0</span><b>5줄 등번호 40 / 54</b><span>S4 거터 레드 윤곽 0</span></li>
      <li><span class="nums__v nums__v--3 n" aria-hidden="true">22</span><b>N3 28 / 34</b><span>/offline/ 호수 거터</span></li>
      <li><span class="nums__v nums__v--t n" aria-hidden="true">302</span><b>표 숫자 18</b><span>소스 표 · 그래프 축 12</span></li>
      <li><b class="nums__og">OG 46 · 27 · 26cqw</b><span>호수 · 대회 약칭 · 팀 약어 — 이미지 안에서만, 늘 실선</span></li>
    </ul></div>
    <div class="seam__c"><h3 class="seam__h">괘선 위계</h3><ul class="lns" role="list">
      ${rule('ln--3', '3px <code>--ink</code>', '섹션 머리 — 오늘의 5줄 · 발행 상태 h1 · 저장해 둔 호')}
      ${rule('ln--2', '2px <code>--ink</code>', '숫자판 위 — 데이터 묶음의 시작은 한 번만')}
      ${rule('ln--1', '1px <code>--ink</code>', '얇은 머리(최근 30일 · 소스) · 날짜 이동 줄 위 · 표 머리 아래')}
      ${rule('ln--r', '1px <code>--rule</code>', '행 · 그래프 눈금 · S4 자리 위아래')}
      ${rule('ln--dt', '1px dotted <code>--ink-3</code>', 'S4 안 이유와 A매치 날짜 사이 · ‘생략’ 띠')}
      ${rule('ln--ds', '1.5px dashed <code>--ink-3</code>', '자리 — 배포 완료 시각')}
    </ul></div>
    <div class="seam__c"><h3 class="seam__h">모션 · 간격</h3><ul class="mo" role="list">
      <li><b>찍힘</b> 150ms — /status 날짜 선택 → 그날 상세 줄(C) · 검색 결과가 0으로 바뀔 때</li>
      <li><b>선택 막대</b> 150ms — /status 그래프의 레드 세로 막대 이동</li>
      <li><b>잉크 전환</b> 200ms — 테마 · <b>피드백</b> 150ms — hover</li>
      <li><b>첫 로드 0</b> — /status · /offline/ · 5줄 자리 모두 진입 모션 없음 · <b>모션 줄이기</b> 전부 0</li>
      <li><b>구역 사이</b> 40px(C) · 블록 안 머리 아래 8 ~ 12px · S4 자리 안 12px</li>
    </ul></div>
  </div>
</section>`;
}

/* ───────── 5. /status — C + 30칸 발행일 띠 ───────── */
function band() {
  const DC = ST.dayCounts;
  const strip = `<div class="bandC" aria-hidden="true"><span class="bandC__k">발행일</span><ol class="bandC__l">${ST.days.map((d) => `<li class="bd bd--${d.state}"><i></i></li>`).join('')}</ol></div>`;
  const legend = `<ul class="legC legC--band" role="list"><li><i class="bd bd--ontime"><i></i></i>정시 <span class="n">${DC.ontime}</span></li><li><i class="bd bd--late"><i></i></i>늦음 <span class="n">${DC.late}</span></li><li><i class="bd bd--missed"><i></i></i>결호 <span class="n">${DC.missed}</span></li><li><i class="bd bd--failed"><i></i></i>실패 <span class="n ${DC.failed ? '' : 'o'}">${DC.failed}</span>일</li><li><i class="bd bd--prelaunch"><i></i></i>창간 전 <span class="n">${DC.prelaunch}</span></li><li><i class="lg lg--x"></i><span>실패한 실행 <span class="n">1</span>회 — 그래프에만(10.31 <span class="n">00:33</span> 수동, 그날 호는 정시)</span></li></ul>`;
  return { strip, legend };
}

/* ───────── CSS ───────── */
const css = `
${cssC}
/* ── 2차 혼합안 ── */
:root{--num-n1:56px;--num-n2:44px;--num-n3:28px}
@media (min-width:1024px){:root{--num-n1:96px;--num-n2:64px;--num-n3:34px}}
h4.h,h5.h{margin:0}
.sec-h h4,.sec-h h5{font-size:var(--text-h2);font-weight:800;line-height:var(--lh-h2);letter-spacing:-.025em}
/* 아이콘 */
.ios--180{width:180px}
.pxset{display:flex;flex-wrap:wrap;gap:18px 22px}
.pxset figure{display:grid;gap:6px;justify-items:start}
.pxset figcaption{font:600 12px/1 var(--font-numeric);letter-spacing:.04em;color:var(--ink-2)}
.tabs--hi{margin-top:6px}
.tabs__t small{font-size:11px;opacity:1;margin-left:4px}
.tabs--l .tabs__t small{color:var(--frame-l-fg2)}.tabs--d .tabs__t small{color:var(--frame-d-fg2)}
/* S4 가족 — 거터 레드 윤곽 0 + 몸통(지금 구현 BriefRest 치수 그대로) */
.s4{display:grid;grid-template-columns:var(--gutter) minmax(0,1fr);gap:0 10px;align-items:start;margin-top:12px;padding:12px 0 2px;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}
@media (min-width:1024px){.s4{gap:0 14px}}
.s4__no{font:800 var(--num-brief-no)/.86 var(--font-numeric);font-variant-numeric:tabular-nums lining-nums;letter-spacing:-.02em;color:transparent;-webkit-text-stroke:2px var(--brand-accent)}
.s4__b{min-width:0}
.s4__lead{padding-top:2px;font-size:var(--text-brief);line-height:1.4;font-weight:800}
.s4__why{margin-top:2px;font-size:14px;line-height:1.55;color:var(--ink-2)}
.s4__links{display:flex;flex-wrap:wrap;column-gap:18px;margin-top:2px}
/* 휴식기 — 이유 블록: 도장 + 기간 → 경기 날짜 N2 실선 2개 */
.s4i{margin-top:12px;padding-top:12px;border-top:1px dotted var(--ink-3)}
.s4i__k{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
.s4i__r{font:600 15px/1 var(--font-numeric);letter-spacing:.02em;color:var(--ink)}
.s4i__l{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 20px;margin-top:12px}
.s4i__d{display:block;font:800 var(--num-n2)/.84 var(--font-numeric);letter-spacing:-.02em;color:var(--ink)}
.s4i__t{margin-top:10px;font-size:12.5px;color:var(--ink-2)}
.s4i__t .n{font:600 14px/1 var(--font-numeric);color:var(--ink)}
.s4i__o{margin-top:3px;font-size:15px;line-height:1.35;font-weight:800}
.s4i__v{font-size:12.5px;color:var(--ink-2)}
@media (min-width:1024px){.s4i__l{grid-template-columns:repeat(2,minmax(0,220px));gap:12px 32px}}
/* 비시즌 — 이유 블록: 평탄 탭 · 시즌 → 날짜 N2 실선 + 낱말 · 연도 → 안내 */
.s4o__c{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-top:10px;font-size:14px;font-weight:800}
.s4o__big{display:flex;align-items:flex-end;gap:12px;margin-top:12px}
.s4o__big .n{font:800 var(--num-n2)/.84 var(--font-numeric);font-variant-numeric:tabular-nums lining-nums;letter-spacing:-.02em;color:var(--ink)}
.s4o__w{display:grid;gap:4px;padding-bottom:1px;font-size:15px;font-weight:800}
.s4o__w .n{font:600 14px/1 var(--font-numeric)!important;letter-spacing:.02em!important;color:var(--ink-2)!important}
.s4o__note{margin-top:12px;font-size:15px;line-height:1.5;font-weight:800;max-width:34em}
/* '생략' 띠 — D2 혼합안 문법(1px dotted) */
.omit{display:flex;align-items:baseline;gap:8px;margin-top:14px;padding:10px 12px;border:1px dotted var(--ink-3);font-size:12.5px;line-height:1.5;color:var(--ink-2)}
.omit b{color:var(--ink);font-weight:800}
.stamp--om{border-style:dotted;border-color:var(--ink-2);color:var(--ink-2)}
.cmp__g{margin-top:14px;align-items:start}
.cmp .def{margin-top:14px}
/* 검색 0 — 빈 상태 숫자는 N2까지, 22px 윤곽은 1.25px(D2 숫자 상태 규칙) */
.zeroC__n{font-size:var(--num-n2)}
.zeroC__t .n.o{-webkit-text-stroke-width:1.25px}
/* 숫자 상태 요약 */
.nrule{display:grid;gap:10px;margin-top:4px}
.nrule>div{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--rule)}
.nrule dd{font-size:13.5px;line-height:1.5;color:var(--ink-2)}
.nrule dd b{color:var(--ink);font-weight:800;margin-right:4px}
.nrule .n{font:800 44px/.84 var(--font-numeric);letter-spacing:-.02em}
.nrule__s{color:var(--ink)}
.nrule__o{color:transparent;-webkit-text-stroke:2px var(--ink-2)}
.nrule__r{color:transparent;-webkit-text-stroke:2px var(--brand-accent)}
.nrule__d{display:block;width:40px;height:6px;background:var(--ink-2)}
/* /offline/ — 저장한 호 수(실선) + 호수 거터 목록 */
.offC{margin-top:16px;padding-bottom:24px;border-bottom:1px solid var(--rule)}
.offC__h{margin-top:28px}
.offC__cnt{display:grid;grid-template-columns:var(--gutter) minmax(0,1fr);gap:0 12px;align-items:end;margin-top:14px}
.offC__n{font:800 var(--num-n2)/.84 var(--font-numeric);letter-spacing:-.02em;color:var(--ink)}
.offC__n.o{color:transparent;-webkit-text-stroke:2px var(--ink-2)}
.offC__t{display:grid;gap:3px;padding-bottom:1px}
.offC__t b{font-size:15px;font-weight:800}
.offC__t>span{font-size:13px;color:var(--ink-2)}
.offC__t .n{font:600 14px/1 var(--font-numeric);color:var(--ink)}
.offC~.savedC,.offC__cnt+.savedC{margin-top:12px;border-top:1px solid var(--ink)}
.savedC__n{display:flex;align-items:baseline;gap:2px}
.savedC__n .n{font:800 var(--num-n3)/.86 var(--font-numeric);letter-spacing:-.02em}
.savedC__n small{font-size:12px;font-weight:800;color:var(--ink-2)}
.savedC__t b{font-size:15px}
/* /status — 30칸 발행일 띠(그래프 열과 같은 격자) */
.bandC{display:grid;grid-template-columns:26px minmax(0,1fr);align-items:center;margin-top:2px;padding:8px 0;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}
.bandC__k{font-size:11px;font-weight:800;color:var(--ink-2);writing-mode:vertical-rl;text-orientation:upright;justify-self:start;letter-spacing:-.05em}
.bandC__l{display:grid;grid-template-columns:repeat(30,minmax(0,1fr));align-items:center;justify-items:center;height:16px}
.bd{display:inline-grid;place-items:center;width:11px;height:11px;flex:none}
.bd>i{display:block}
.bd--ontime>i{width:9px;height:9px;border-radius:50%;background:var(--ink)}
.bd--late>i{width:9px;height:9px;border:1.75px solid var(--ink)}
.bd--missed>i{width:9px;height:2.5px;background:var(--ink-2)}
.bd--failed>i{width:10px;height:10px;border-radius:50%;border:1.5px solid var(--ink);background:linear-gradient(-45deg,transparent calc(50% - .9px),var(--ink) calc(50% - .9px) calc(50% + .9px),transparent calc(50% + .9px))}
.bd--prelaunch>i{width:6px;height:6px;border-radius:50%;border:1.5px dotted var(--ink-3)}
@media (min-width:1024px){.bd{width:13px;height:13px}.bd--ontime>i,.bd--late>i{width:11px;height:11px}.bd--missed>i{width:11px}}
@media (max-width:1023px){.bandC__l .bd{width:9px}.bandC__l .bd--ontime>i,.bandC__l .bd--late>i{width:7px;height:7px}.bandC__l .bd--late>i{border-width:1.5px}.bandC__l .bd--missed>i{width:7px;height:2px}.bandC__l .bd--failed>i{width:8px;height:8px}.bandC__l .bd--prelaunch>i{width:5px;height:5px}}
.legC--band .bd{vertical-align:-1px}
.legC--band .n.o{font:800 15px/1 var(--font-numeric);-webkit-text-stroke-width:1.25px}
.dotC{margin-bottom:6px}
/* 날짜 칸 버튼(1024+ 폭 32px)은 44px 미달 — 숨기고, 그래프 면 전체를 누름 영역 하나로(포인터 보조), 키보드 · 375는 ‹ › 44px */
.dotC__b{display:none!important}
@media (min-width:1024px){.dotC__plot{cursor:pointer}}
/* 규칙 견본 */
.seam{display:grid;gap:18px;margin-top:18px}
@media (min-width:768px){.seam{grid-template-columns:1fr 1fr;gap:24px}}
.seam__c{border-top:2px solid var(--ink);padding-top:10px;min-width:0}
.seam__h{font-size:16px;font-weight:800;letter-spacing:-.02em}
.lns li,.nums li,.mo li{display:grid;gap:2px 12px;padding:9px 0;border-bottom:1px solid var(--rule);font-size:13px;line-height:1.45;color:var(--ink-2)}
.lns li{grid-template-columns:64px minmax(0,1fr);align-items:center}
.lns li b,.nums li b,.mo li b{color:var(--ink);font-weight:800}
.lns li span:last-child{grid-column:2}
.lns .ln{grid-row:1/3;display:block;width:64px;height:0}
.ln--3{border-top:3px solid var(--ink)}.ln--2{border-top:2px solid var(--ink)}.ln--1{border-top:1px solid var(--ink)}.ln--r{border-top:1px solid var(--rule)}
.ln--dt{border-top:1px dotted var(--ink-3)}.ln--ds{border-top:1.5px dashed var(--ink-3)}
.nums li{grid-template-columns:auto minmax(0,1fr);align-items:end;column-gap:16px}
.nums li span:last-child{grid-column:2}
.nums__v{grid-row:1/3;white-space:nowrap;min-width:88px;font-weight:800;font-family:var(--font-numeric);letter-spacing:-.02em;line-height:.84;color:var(--ink)}
.nums__v--1{font-size:var(--num-n1)}.nums__v--2{font-size:var(--num-n2)}.nums__v--3{font-size:var(--num-n3)}
.nums__v--b{font-size:var(--num-brief-no);color:transparent;-webkit-text-stroke:2px var(--brand-accent);line-height:.86}
.nums__v--t{font-size:18px;line-height:1}
.nums__og{grid-row:1/3;min-width:88px;font-size:13px}
.mo li{display:block}
code{white-space:nowrap}
.meta .src td:first-child{color:var(--ink);font-weight:800;white-space:nowrap}
.ogteam{margin:-4px 0 12px}
`;

function meta() {
  const li = (a) => a.map((x) => `<li>${x}</li>`).join('');
  const rows = [
    ['앱 아이콘 · 파비콘', 'C 스타일 ED', '벽돌 레드 면 + 지면색 ED + 짧은 괘선 · any 192 · 512 · maskable 512 · apple 180 · favicon.svg(라이트 벽돌 / 다크 레드 #FF7A6E) · ico 16 · 32 픽셀 격자 · 1~5 거터 변형 뺌'],
    ['OG · 미리보기', 'C', '기본 · 날짜 = 벽돌 레드 면 + 큰 실선 숫자(5 · 22 · 100) · 대회 · 팀 = 크림 면 · 팀 거대 약어 채움 <b>5.3 하한</b>(45팀 바뀜) · summary_large_image · 메신저 · og:image:alt'],
    ['빈 상태 — 5줄 자리', '1차 확정 유지', 'S4 가족(경기 없음 · A매치 휴식기 · 비시즌) — 거터 레드 윤곽 0 + “쉽니다” + 이유 블록, 날짜 N2'],
    ['검색 0', 'C', '윤곽 0 N2 + 유형 4개 윤곽 0'],
    ['/offline/', 'C 언어로 다시', '저장한 호 수 N2 실선 + 호수 거터(N3) 목록 — 최근 3일 호(서비스 워커 프리캐시와 같은 함수). 대시 뺌'],
    ['/status', 'C + 띠', 'N1 숫자판 3개 + 점 그래프 + <b>30칸 발행일 띠</b>(기호 5종) + 소스 표 · 비용 %만 · 배포 완료 자리'],
    ['뒤표지 링크', 'C', '“발행 상태 96.0%”'],
  ].map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
  return `<details class="meta">
  <summary><span class="meta__tag">시안 정보</span><b>D3 혼합안 2차 — C 등번호 기반</b><span class="meta__one">숫자가 주인공 — 아이콘 · OG · 빈 상태 · 상태 쪽이 모두 큰 숫자 하나로 말한다. 아이콘만 ‘5’ 대신 ED.</span><span class="meta__more" aria-hidden="true"></span></summary>
  <div class="meta__grid">
    <div><p class="meta__h">장점</p><ul>${li(['홈 화면 · 링크 미리보기에서 첫인상이 가장 강하다(진한 레드 면 + 큰 숫자)', 'ED로 바꿔 ‘5’의 브랜드 인지 문제(알림 배지처럼 보임)를 덜었다 — 마스트헤드 워드마크 영문과 같은 글자', '빈 상태 · /offline/ · /status가 숫자 상태 규칙 하나로 읽힌다 — 새 도형 0', '팀 OG 거대 약어가 111팀 모두 내부 하한 5.3 이상'])}</ul></div>
    <div><p class="meta__h">단점</p><ul>${li(['DESIGN §2.2 규칙 변경 — 레드 넓은 면 예외를 아이콘 · 파비콘 · OG로 넓힌다(화면 안은 그대로)', 'OG 면이 둘(레드 · 크림)로 갈린다 — 날짜 링크와 팀 링크의 미리보기 색이 다르다', '팀 거대 약어 45팀이 상의 색 대신 하의 색(16) · 잉크(29)로 — 빨간 상의 팀(아스널 · 바이에른 뮌헨 · 리버풀 등)도 잉크 글자, 키트 색은 아래 2색 띠가 맡는다', '375 /status 점 선택은 화살표 버튼 — 대신 30칸 띠로 상태를 한눈에'])}</ul></div>
    <div><p class="meta__h">구현 난이도</p><p><b>중</b> — 아이콘 ED path 1회(16 · 32는 격자 그대로), OG 면 2종 템플릿 + 변형 3, 빈 상태 BriefRest 확장(서버), /status 점 그래프 + 띠(빌드 때 좌표) + 날짜 선택 섬 1개(gzip 약 0.4KB).</p><p class="meta__h">번들 · 폰트 영향</p><p>폰트 변화 0 — EuroDigest Sans 400 · 800 + Barlow Condensed 600 · 800(417.8KB, 2패밀리 4파일, ../fonts/ 로컬). 새 색 토큰 0. favicon.svg 약 0.6KB · ico 16 + 32 약 1.5KB.</p><p class="meta__h">DESIGN 규칙 변경</p><p><b>필요</b> — §2.2 레드 넓은 면 예외(아이콘 · 파비콘 · OG), §2.10 OG 면 2종 고정 값, 대회 6색 · 키트 2색 쓰는 곳에 OG 추가, 팀 약어 채움 규칙(5.3). 화면 안 규칙은 그대로.</p></div>
    <div class="span3"><p class="meta__h">출처 (산출물 × 시안)</p><table class="axes src"><thead><tr><th scope="col">산출물</th><th scope="col">바탕</th><th scope="col">혼합안 2차에서</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div>
</details>`;
}

function topbar() {
  return `<div class="bar"><div class="bar__in"><b>D3 혼합안 2차</b><span>기준 <time datetime="${D.today.date}">${esc(D.today.label)}</time> 제 ${D.today.no}호 · 실데이터</span><nav class="bar__nav" aria-label="견본 목차"><a href="#s1"><span class="n">1</span>아이콘</a><a href="#s2"><span class="n">2</span>OG</a><a href="#s3"><span class="n">3</span>빈 상태</a><a href="#s4"><span class="n">4</span>규칙</a><a href="#s5"><span class="n">5</span>/status</a></nav><button class="ibtn" type="button" data-theme-toggle aria-label="테마: 시스템 설정">${IC.theme}</button></div></div>`;
}

const PLOTJS = `
(function(){var p=document.querySelector('.dotC__plot');if(!p)return;var bs=p.querySelectorAll('.dotC__b');p.addEventListener('click',function(e){var r=p.getBoundingClientRect();var i=Math.max(0,Math.min(29,Math.floor((e.clientX-r.left)/r.width*30)));if(bs[i])bs[i].click();});})();
`;

export function build() {
  const teamNote = `<p class="sub2 ogteam">거대 약어 채움 = 상의 → 하의 → 잉크 순으로 크림 면 대비 <b>5.3 이상</b>인 첫 색(내부 하한 — C 시안의 3.0에서 강화). 111팀 중 45팀이 바뀌었다(하의 16 · 잉크 29), 최저 5.32. 키트 2색은 아래 띠가 늘 보인다.</p>`;
  const body = `${meta()}
${topbar()}
<div class="board">
  <header class="hero"><p class="hero__k" lang="en" aria-hidden="true">D3 · MIX 2 · SQUAD NO.</p><h1>혼합안 2차</h1><p>C 등번호 한 벌. 숫자 하나가 화면을 맡는다 — 값이 있으면 실선, 0이면 윤곽. 아이콘만 ‘5’ 자리에 ED를 넣었고, 5줄 자리 빈 상태는 1차에서 확정한 S4 가족을 그대로 쓴다.</p></header>
  ${sIcons()}
  ${sOg({ fillMin: 5.3, teamNote })}
  ${sEmpty()}
  ${sRules()}
</div>
${sStatus({ id: 's5', no: '5', band: band() })}`;
  return page({
    file: 'concept-mix.html', title: 'D3 혼합안 2차 (C 기반) — 유로 다이제스트',
    comment: `D3 혼합안 2차 — C 등번호 기반(사용자 결정 2026-11-02). 1차 혼합안(A 아이콘 · OG + C 빈 상태 + B /status)은 커밋 5552dbf
한 줄: 숫자가 주인공 — 아이콘 · OG · 빈 상태 · /status가 모두 큰 숫자 하나로 말한다. 아이콘만 '5' 대신 ED
장점: 첫인상이 가장 강함 · ED로 브랜드 인지 보완 · 빈 상태 · 오프라인 · 상태 쪽이 숫자 상태 규칙 하나 · 팀 OG 약어 111팀 모두 5.3 이상
단점: DESIGN §2.2 레드 넓은 면 예외 확장(아이콘 · 파비콘 · OG — 화면 안 그대로) · OG 면 2종 · 빨간 상의 팀 약어가 잉크 글자 · 375 점 선택은 화살표
구현 난이도: 중 (ED path 1회 + 16 · 32 픽셀 격자, OG 면 2종 템플릿 + 변형 3, BriefRest 확장, /status 점 그래프 + 띠 + 섬 1개)
번들/폰트: 폰트 변화 0 (EuroDigest Sans 400·800 + Barlow Condensed 600·800 = 417.8KB, ../fonts/ 로컬), 새 색 토큰 0, OG 전용 변수 4개 제거, 섬 gzip 약 0.4KB
데이터: docs/design/d3/data/d3-data.json (runs.json · runs-dev.json · configs · data/teams 실값, 2026-11-02 기준), 팀 약어 채움은 configs/team-colors.json 111팀. 문구 생성 · LLM 호출 0
생성: node docs/design/d3/build/gen.mjs mix — C 생성기의 sOg · sStatus · searchZeroC · CSS · JS를 가져온다(build/concept-mix.mjs)
견본 단독 렌더: ?solo=<data-solo 값>&w=1200 (예: ?solo=og-news-22) — OG 1200×630 실제 크기`,
    css, body, js: jsC + PLOTJS,
  });
}
