// D3 혼합안 — 아이콘 · 파비콘 · OG = A 입장권 · 빈 상태(비시즌 · 휴식기 · 검색 0) = C 등번호 · /offline/ = B 제호
// · /status = B 원장 + C 숫자판 머리 · 뒤표지 링크 = B. 사용자 결정 2026-11-02(scope §7.1 · comparison §5 + 휴식기 변형 신설).
// 원칙: 새로 그리지 않고 A · B · C 생성기의 함수 · CSS를 가져와 이음새만 맞춘다(DESIGN 규칙 변경 0 · 새 색 토큰 0).
import { D, ST, COMP, IC, esc, ftab, md, longDate, shortDate, ticket, tabbar, colophon, DAYSTATE, pct, page } from './common.mjs';
import { sIcons, sOg, css as cssA } from './concept-a.mjs';
import { offlineB, cal30B, srcRowsB, css as cssB } from './concept-b.mjs';
import { searchZeroC, css as cssC } from './concept-c.mjs';

/* ───────── CSS 가져오기 — 최상위 규칙(@media 안 포함)을 선택자 앞부분으로 골라 온다 ───────── */
function blocks(src) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { out.push(src.slice(start, i + 1).trim()); start = i + 1; } }
  }
  return out;
}
function pick(src, re) {
  return blocks(src.replace(/\/\*[\s\S]*?\*\//g, '')).map((b) => {
    const head = b.slice(0, b.indexOf('{'));
    if (head.startsWith('@media')) { const kept = pick(b.slice(b.indexOf('{') + 1, -1), re); return kept ? `${head}{${kept}}` : ''; }
    return head.split(',').some((s) => re.test(s.trim())) ? b : '';
  }).filter(Boolean).join('\n');
}
const fromA = pick(cssA, /^(code\b|\.code\b|\.safe-wrap|\.ios\b|\.fr \.chk|\.og--a|\.oga__|\.ogf--s)/);
const fromB = pick(cssB, /^\.(cb|calt|offlB|sw|btn|ledgerB|legB|tblwrap|srcB|tier|toc)/);
const fromC = pick(cssC, /^(\.boardC|\.zeroC|\.n\.o)/);

/* ───────── 3. 빈 상태 ───────── */
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

function sEmpty() {
  const e = D.emptyStates;
  return `<section id="s3" class="blk" aria-labelledby="s3h">
  <div class="sec-h"><h2 id="s3h"><span class="blk__no">3</span>빈 상태 조형</h2><span class="rh" aria-hidden="true" lang="en">EMPTY</span></div>
  <p class="sub2">C 등번호의 숫자 문법 — 날짜처럼 값이 있으면 <b>실선</b>, 결과가 0이면 <b>윤곽</b>. 5줄 자리 빈 상태 셋(경기 없음 · A매치 기간 · 비시즌)은 거터의 레드 윤곽 <b>0</b>과 “오늘은 5줄을 쉽니다”를 늘 같은 자리에 두고, 이유 블록만 바꾼다. 오프라인은 B의 두 주 달력. 새 도형 0.</p>

  <div class="cmp" id="s3-rest">
    <h3 class="h3">휴식기 — A매치 기간 <small lang="en">NEW S4 VARIANT</small></h3>
    <p class="sub2">견본 날 <b>11월 12일</b> — <span class="path">configs/national-team.json</span>의 두 경기(11.13 · 11.17, 경기일 ±3일 → <span class="n">11.10 – 11.20</span>) 기간 안이고, 전날 6개 대회에 끝난 경기가 없는 날. 같은 날 지금 화면과 새 화면을 나란히 둔다.</p>
    <div class="es grid2 cmp__g">
      ${ctx('<b>지금 · S4</b><span>M1-32 구현 그대로</span>', brief(s4Plain()), one('읽힘', 'A매치 기간이라 쉬는지는 이 블록에서 알 수 없다 — 아래 A매치 섹션까지 내려가야 한다'))}
      ${ctx('<b>새 · A매치 휴식기 변형</b><span>S4 위에 이유 블록 하나만 더함</span>', `${brief(s4Intl())}<p class="omit" id="s3-nat"><span class="stamp stamp--om">생략</span><span><b>A매치 섹션</b>이 5줄 바로 아래 이어진다 — 경기 행 · 소집 선수 · 대표팀 소식(M3-13, 바꾸지 않음)</span></p>`, one('읽힘', '거터 0 · 문장 · 링크는 S4와 같다. 그 아래 <b>A매치 기간 도장 + 기간</b>과 <b>경기 날짜 2개(N2 실선)</b> + 상대 · 홈/원정만. 시각 · 장소 · 결과는 A매치 섹션이 맡는다(중복 · 결과 노출 0)'))}
    </div>
    <p class="def"><b>판정(제안)</b> 홈 오늘의 5줄이 S4(<code>emptyReason</code> no-matches)이고 · 비시즌이 아니고 · <code>restPeriodOf(발행일)</code>에 <code>international-window</code>가 있을 때만. 결과 지연(results-pending)은 오류 상자, 비시즌은 비시즌 변형이 먼저. 날짜 아카이브(“이날의 5줄”)는 S4 그대로. 기간 안 경기만(연기 경기 제외 — <code>nationalWindows</code> 그대로), 지난 경기는 날짜 <code>--ink-2</code> + “끝남”, 스코어는 싣지 않는다.</p>
  </div>

  <h3 class="h3">비시즌 · 검색 결과 없음 <small lang="en">OFF-SEASON · SEARCH</small></h3>
  <div class="es grid2">
    ${ctx('<b>비시즌 · 종료</b><span>견본 날 6월 7일 — UCL endDate 다음 날부터</span>', brief(s4Off(e.ended.comp, e.ended.date, 'ended')), ba('평탄 탭 + 시즌 + 날짜 Barlow 800 34px + “종료” + 안내 — 거터 없음', 'S4 가족으로 — 거터 윤곽 0 · “오늘은 5줄을 쉽니다” 아래 평탄 탭 · 시즌 + 날짜 <b>N2 실선</b> + 종료 · 연도 + 안내'))}
    ${ctx('<b>비시즌 · 개막</b><span>견본 날 8월 15일 — 2027-28 설정 전이라 라리가 지난 개막일</span>', brief(s4Off(e.upcomingSample.comp, e.upcomingSample.date, 'upcoming', true)), ba('평탄 탭 + 날짜 + “개막” — 글자만', '같은 틀, 낱말만 “개막”'))}
    ${ctx('<b>검색 결과 없음</b><span>오버레이 · <span class="path">/search/</span> 공용 · e2e 0건 질의</span>', searchZeroC(), ba('윤곽 ‘0’ 64px + “결과가 없어요” + 안내', '윤곽 0 <b>N2</b>(44 / 64px) + 유형 4개도 윤곽 0(22px · 1.25px) — 결과가 바뀔 때만 찍힘 150ms'))}
    ${ctx('<b>숫자 상태 한 줄 요약</b><span>D2 숫자 상태 규칙 그대로</span>', `<dl class="nrule">
      <div><dt><span class="nrule__s n" aria-hidden="true">11.13</span></dt><dd><b>실선</b> 값이 있다 — 날짜 · 시각 · 성공률</dd></div>
      <div><dt><span class="nrule__o n" aria-hidden="true">0</span></dt><dd><b>윤곽</b> 결과가 0이다 — 검색 0 · 유형별 0 (<code>--ink-2</code>)</dd></div>
      <div><dt><span class="nrule__r n" aria-hidden="true">0</span></dt><dd><b>레드 윤곽</b> 오늘 실린 5줄이 0줄 — 5줄 자리에만 (<code>--brand-accent</code>)</dd></div>
    </dl>`, one('규칙', '빈 상태 숫자는 N2(44 / 64px)까지 — 빈 날이 꽉 찬 날(5줄 등번호 40 / 54px)보다 크게 말하지 않게. N1은 /status 숫자판에만'))}
  </div>

  <h3 class="h3">/offline/ <small lang="en">OFFLINE · B</small></h3>
  ${ctx('<b>/offline/ 화면</b><span>서비스 워커가 저장하지 않은 쪽을 열면 — 셸은 /status와 같다</span>', offlineB({ h: 'h4', h2: 'h5' }), ba('h1 + OFFLINE + 안내 2줄 + 다시 시도 + 저장해 둔 호 목록 — 글자만', '최근 두 주 달력 — 저장한 호 3칸만 실선(열 수 있음), 나머지 발행 호는 점선(열 수 없음), 결호는 점선 · 취소선(M1-34 달력 칸 규칙)'))}
</section>`;
}

/* ───────── 4. 이음새 — 세 출처를 한 언어로 ───────── */
function sSeams() {
  const rule = (cls, k, where) => `<li><span class="ln ${cls}" aria-hidden="true"></span><b>${k}</b><span>${where}</span></li>`;
  return `<section id="s4" class="blk" aria-labelledby="s4h">
  <div class="sec-h"><h2 id="s4h"><span class="blk__no">4</span>이음새</h2><span class="rh" aria-hidden="true" lang="en">SEAMS</span></div>
  <p class="sub2">티켓(A) · 윤곽 숫자(C) · 원장(B)이 한 화면에 섞여도 같은 제품으로 보이게 맞춘 규칙. 모두 기존 토큰이다 — 새 색 · 새 모티프 · DESIGN 규칙 변경 0.</p>
  <div class="seam">
    <div class="seam__c"><h3 class="seam__h">괘선 위계</h3><ul class="lns" role="list">
      ${rule('ln--3', '3px <code>--ink</code>', '섹션 머리 — 오늘의 5줄 · 발행 상태 h1')}
      ${rule('ln--2', '2px <code>--ink</code>', '숫자판 위 — 데이터 묶음의 시작은 한 번만')}
      ${rule('ln--1', '1px <code>--ink</code>', '얇은 머리(원장 · 최근 30일 · 소스) · 표 머리 아래')}
      ${rule('ln--r', '1px <code>--rule</code>', '행 · 원장 줄 · S4 자리 위아래')}
      ${rule('ln--dt', '1px dotted <code>--ink-3</code>', 'S4 안 이유와 A매치 날짜 사이 · ‘생략’ 띠')}
      ${rule('ln--ld', '2px dotted <code>--ink-3</code>', '리더 점선 — 원장 · 목차')}
      ${rule('ln--ds', '1.5px dashed <code>--ink-3</code>', '자리 — 배포 완료 시각')}
    </ul></div>
    <div class="seam__c"><h3 class="seam__h">숫자 크기</h3><ul class="nums" role="list">
      <li><span class="nums__v nums__v--1 n" aria-hidden="true">07:18</span><b>N1 56 / 96</b><span>/status 숫자판 3개 — 그 쪽의 주제일 때만</span></li>
      <li><span class="nums__v nums__v--2 n" aria-hidden="true">11.13</span><b>N2 44 / 64</b><span>빈 상태 날짜 · 검색 0</span></li>
      <li><span class="nums__v nums__v--b n" aria-hidden="true">0</span><b>5줄 등번호 40 / 54</b><span>S4 거터 레드 윤곽 0</span></li>
      <li><span class="nums__v nums__v--t n" aria-hidden="true">07:14</span><b>표 숫자 12 ~ 18</b><span>달력 칸 · 원장 · 소스 표</span></li>
    </ul></div>
    <div class="seam__c"><h3 class="seam__h">라벨 서체</h3><dl class="lbls">
      <div><dt><span class="rh" lang="en">STATUS</span></dt><dd>러닝 헤드 — Barlow 600 12.5px 0.14em <code>--brand-accent-text</code>, 섹션 머리에만</dd></div>
      <div><dt><span class="lbls__k">최근 30일 실행 성공률</span></dt><dd>칸 라벨 — 13px 800 <code>--ink-2</code>, 큰 숫자 위(숫자판)</dd></div>
      <div><dt><span class="lbls__r">공개 목표</span></dt><dd>행 라벨 — 14px 400 <code>--ink-2</code> + 리더 점선(원장)</dd></div>
      <div><dt><span class="stamp">A매치 기간</span></dt><dd>도장 — 11.5px 800 1px <code>--ink</code>, 상태 이름 한 낱말</dd></div>
      <div><dt><span class="lbls__u n">KST</span></dt><dd>단위 — Barlow 800 20 / 26px <code>--ink-2</code>, 큰 숫자 옆</dd></div>
    </dl></div>
    <div class="seam__c"><h3 class="seam__h">간격 · 모션</h3><ul class="mo" role="list">
      <li><b>구역 사이</b> 36 / 44px — D2 혼합안 값 그대로(숫자판 → 원장 → 30일 → 소스)</li>
      <li><b>블록 안</b> 머리 아래 8 ~ 12px · S4 자리 안 12px · 숫자 아래 캡션 10px</li>
      <li><b>잉크 전환</b> 200ms — 테마(지면 · 잉크 · 티켓)</li>
      <li><b>피드백</b> 150ms — hover 색 · 밑줄</li>
      <li><b>찍힘</b> 150ms — 검색 결과가 0으로 바뀔 때만. 첫 로드 · /status · /offline/ · 5줄 자리는 모션 0</li>
      <li><b>모션 줄이기</b> 전부 0</li>
    </ul></div>
  </div>
</section>`;
}

/* ───────── 5. /status — B 원장 + C 숫자판 머리 ───────── */
function sStatus() {
  const L = ST.lastPublish, R = ST.runRate, C = ST.cost, DC = ST.dayCounts;
  const early = (() => { const [h1, m1] = L.target.split(':').map(Number), [h2, m2] = L.finished.split(':').map(Number); return h1 * 60 + m1 - (h2 * 60 + m2); })();
  const failDay = ST.days.find((d) => d.failedRuns.length);
  const CK = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="m3 8.5 3.2 3.2L13 5"/></svg>';
  const XK = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="m4 4 8 8M12 4l-8 8"/></svg>';
  const basis = `<time datetime="2026-11-02T13:39+09:00">${shortDate(D.today.date)} <span class="n">13:39</span> KST</time>`;
  return `<div class="divider divider--screen" id="s5"><span><b>화면 5 · /status/</b> 앱 셸 안의 한 쪽 — 뒤표지 “발행 상태” 링크로 들어온다</span><span class="divider__info">C 숫자판 머리 + B 원장 · 30일 달력 · 소스 표 · 모션 0(테마 잉크 전환만)</span></div>
<div class="scr"><div class="shell">
${ticket()}
<div class="layout">
  <aside class="contents" aria-label="이 쪽 목차"><div class="sec-h"><h2 class="h">이 쪽</h2><span class="rh" aria-hidden="true" lang="en">CONTENTS</span></div>
    <ul class="toc" role="list"><li><a href="#st-n"><span>숫자판</span><i></i></a></li><li><a href="#st-led"><span>원장</span><i></i></a></li><li><a href="#st-30"><span>최근 30일</span><i></i></a></li><li><a href="#st-src"><span>소스 건강도</span><i></i></a></li></ul></aside>
  <main class="page" id="main">
    <div class="sec-h"><h1 class="h">발행 상태</h1><span class="rh" aria-hidden="true" lang="en">STATUS</span></div>
    <p class="st-basis">유로 다이제스트가 매일 아침 제때 나오는지 적어 두는 판권면이다. 이&nbsp;쪽 기준 ${basis} · 발행할 때마다 다시 만든다.</p>

    <dl class="boardC" id="st-n">
      <div><dt>마지막 수집 완료</dt><dd><span class="boardC__n n">${L.finished}</span><span class="boardC__u">KST</span></dd><dd class="boardC__c">제 <span class="n">${L.no}</span>호 · 공개 목표 <span class="n">${L.target}</span>보다 <span class="n">${early}</span>분 앞</dd></div>
      <div><dt>최근 30일 실행 성공률</dt><dd><span class="boardC__n n">${pct(R.pct)}</span><span class="boardC__u">%</span></dd><dd class="boardC__c">prod 수집 <span class="n">${R.all}</span>회 중 <span class="n">${R.ok}</span>회</dd></div>
      <div><dt>이번 달 비용 · 월 예산 대비</dt><dd><span class="boardC__n n">${C.thisMonth.pct.toFixed(2)}</span><span class="boardC__u">%</span></dd><dd class="boardC__c">10월 <span class="n">${C.lastMonth.pct.toFixed(2)}</span>%</dd></div>
    </dl>

    <section id="st-led" class="stM" aria-labelledby="st-led-h">
      <div class="sec-h sec-h--thin"><h2 id="st-led-h" class="h">원장</h2><span class="rh" aria-hidden="true" lang="en">LEDGER</span></div>
      <dl class="ledgerB">
        <div><dt>마지막 발행</dt><dd><time datetime="${L.date}">${esc(L.label)}</time> 제 <span class="n">${L.no}</span>호</dd></div>
        <div><dt>수집</dt><dd>시작 <span class="n">${L.started}</span> · 완료 <span class="n">${L.finished}</span> KST</dd></div>
        <div><dt>공개 목표</dt><dd><span class="n">${L.target}</span> KST <small>겨울 · 여름은 <span class="n">07:00</span></small></dd></div>
        <div><dt>배포 완료</dt><dd><span class="ph"><b>자리</b>실행 기록에 없음 · 채울 단계 <span class="n">M5-15</span></span></dd></div>
        <div><dt>실패한 실행</dt><dd><span class="n">${R.all - R.ok}</span>회 <small><span class="n">${failDay.md}</span> <span class="n">${failDay.failedRuns[0].started}</span> 수동 — 그날 호는 <span class="n">${failDay.finished}</span> 정시</small></dd></div>
        <div><dt>비용에 드는 것</dt><dd>AI 브리핑 · 운영 + 개발 실험 합 <small>데이터 API는 무료 플랜이라 0</small></dd></div>
      </dl>
    </section>

    <section id="st-30" class="stM" aria-labelledby="st-30-h">
      <div class="sec-h sec-h--thin"><h2 id="st-30-h" class="h">최근 30일</h2><span class="rh" aria-hidden="true" lang="en">30 DAYS</span></div>
      <p class="sub"><span class="n">${md(ST.window.from)} – ${md(ST.window.to)}</span> · 칸 = 발행일 · 시각 = 그날 첫 발행 실행의 수집 완료(KST)</p>
      <div class="cbwrap">${cal30B()}</div>
      <ul class="legB" role="list" aria-label="범례">
        <li><span class="cb__m">${CK}</span>정시 <span class="n">${DC.ontime}</span></li><li><span class="cb__m">!</span>늦음 <span class="n">${DC.late}</span></li><li><span class="cb__m">–</span>결호 <span class="n">${DC.missed}</span></li><li><span class="cb__m">${XK}</span>실패 <span class="n">${DC.failed}</span>일</li><li><span class="legB__x">${CK}${XK}</span>실패한 실행 <span class="n">1</span>회 — ${failDay.md} <span class="n">${failDay.failedRuns[0].started}</span> 수동, 그날 호는 정시</li><li><span class="legB__pre">창간 전</span><span class="n">${DC.prelaunch}</span></li>
      </ul>
      <p class="def"><b>성공률</b>은 실행 기준(PRD KPI · 운영 리포트와 같은 셈), <b>달력</b>은 발행일 기준이다. 정시 = 공개 목표(여름 <span class="n">07:00</span> · 겨울 <span class="n">07:30</span>) + 15분 안, 늦음 = 그 뒤, 결호 = 그날 발행 기록 없음, 실패 = 그날 실행이 모두 실패. 창간 전 날은 분모에서 뺀다.</p>
    </section>

    <section id="st-src" class="stM" aria-labelledby="st-src-h">
      <div class="sec-h sec-h--thin"><h2 id="st-src-h" class="h">소스 건강도</h2><span class="rh" aria-hidden="true" lang="en">SOURCES</span></div>
      <p class="sub">최근 7일 <span class="n">${md(ST.days[23].date)} – ${md(D.today.date)}</span> · 지금 수집하는 <span class="n">${ST.sources.length}</span>곳</p>
      <div class="tblwrap"><table class="srcB"><caption class="sr">소스 건강도 — 최근 7일</caption><thead><tr><th scope="col">매체</th><th scope="col">등급</th><th scope="col" class="num">응답</th><th scope="col" class="num">새 기사</th><th scope="col">상태</th></tr></thead><tbody>${srcRowsB()}</tbody></table></div>
      <p class="def">응답 = 성공 실행 / 시도(시간 예산 초과는 뺌). 새 기사 = 수집 창 안 새 항목 합. 새 기사 없음이 7회 이어지면 점검 이슈가 열린다.</p>
    </section>
  </main>
</div>
${colophon({ linksAfter: [{ html: '<a href="#s5">발행 상태</a>' }] })}
</div>
${tabbar()}</div>`;
}

/* ───────── 혼합안 전용 CSS — 이음새 ───────── */
const css = `
:root{--num-n1:56px;--num-n2:44px;--num-n3:28px}
@media (min-width:1024px){:root{--num-n1:96px;--num-n2:64px;--num-n3:34px}}
/* ── A: 아이콘 · OG ── */
${fromA}
/* ── B: 달력 · 원장 · 소스 표 · 목차 ── */
${fromB}
/* ── C: 숫자판 · 검색 0 ── */
${fromC}
/* ── 이음새 ── */
.blk .h3+.sub2{margin-top:-4px}
h4.h,h5.h{margin:0}
.sec-h h4,.sec-h h5{font-size:var(--text-h2);font-weight:800;line-height:var(--lh-h2);letter-spacing:-.025em}
.sec-h--thin h4,.sec-h--thin h5{font-size:16px}
@media (min-width:1024px){.sec-h--thin h4,.sec-h--thin h5{font-size:17px}}
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
/* /status — 숫자판(값) → 원장(근거): 2px는 숫자판 위 한 번, 나머지 머리는 1px */
.boardC{margin-top:18px}
@media (max-width:1023px){.boardC>div:last-child{border-bottom:0}}
.boardC__c{margin-top:10px!important}
@media (max-width:1023px){.scr .page{padding-top:24px}}
.stM{margin-top:36px}
@media (min-width:1024px){.stM{margin-top:44px}}
.ledgerB{margin-top:8px;border-top:0}
.ledgerB dd{font-weight:800}
.ledgerB dd .n{font:800 17px/1 var(--font-numeric)}
.ledgerB .ph .n{font:600 13px/1 var(--font-numeric)}
.ledgerB time{font-variant-numeric:normal}
.legB__x{display:inline-flex;align-items:center;vertical-align:-2px;margin-right:6px;color:var(--ink)}
.legB__x svg+svg{margin-left:1px;color:var(--brand-accent-text)}
.cbwrap .cb__x2{color:var(--brand-accent-text)}
/* 이음새 견본 */
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
.ln--dt{border-top:1px dotted var(--ink-3)}.ln--ld{border-top:2px dotted var(--ink-3)}.ln--ds{border-top:1.5px dashed var(--ink-3)}
.nums li{grid-template-columns:auto minmax(0,1fr);align-items:end;column-gap:16px}
.nums li span:last-child{grid-column:2}
.nums__v{grid-row:1/3;white-space:nowrap;min-width:88px;font-weight:800;font-family:var(--font-numeric);letter-spacing:-.02em;line-height:.84;color:var(--ink)}
.nums__v--1{font-size:var(--num-n1)}.nums__v--2{font-size:var(--num-n2)}
.nums__v--b{font-size:var(--num-brief-no);color:transparent;-webkit-text-stroke:2px var(--brand-accent);line-height:.86}
.nums__v--t{font-size:18px;font-weight:600;line-height:1}
.lbls>div{display:grid;grid-template-columns:minmax(0,150px) minmax(0,1fr);gap:4px 12px;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--rule)}
.lbls dd{font-size:12.5px;line-height:1.45;color:var(--ink-2)}
.lbls__k{font-size:13px;font-weight:800;color:var(--ink-2)}
.lbls__r{font-size:14px;color:var(--ink-2)}
.lbls__u{font:800 20px/1 var(--font-numeric);letter-spacing:.04em;color:var(--ink-2)}
.mo li{display:block}
code{font:600 13px/1 var(--font-numeric);letter-spacing:.02em;color:var(--ink);white-space:nowrap}
/* 메타 — 출처 표 */
.meta .src td:first-child{color:var(--ink);font-weight:800;white-space:nowrap}
`;

function meta() {
  const li = (a) => a.map((x) => `<li>${x}</li>`).join('');
  const rows = [
    ['앱 아이콘 · 파비콘', 'A 입장권', 'any 192 · 512(좌우 투명 노치) · maskable 512 · apple-touch 180 · favicon.svg(라이트 네이비 / 다크 벽돌 레드) · ico 16 · 32 — A 그대로'],
    ['OG · 미리보기', 'A 입장권', '기본 · 날짜(제 22호 · 제 100호) · 대회 6 · 팀 4견본 · summary_large_image · 메신저 · og:image:alt · 홈 = 기본 / /news/ = 최신 호 — A 그대로, <code>--og-*</code> 4개 제거'],
    ['빈 상태 — 비시즌 · 휴식기 · 검색 0', 'C 등번호', 'S4 가족(거터 레드 윤곽 0 + “쉽니다” 고정 + 이유 블록) · 날짜 N2 실선 · 검색 윤곽 0 N2 — A매치 휴식기 변형 신설'],
    ['/offline/', 'B 제호', '최근 두 주 달력 — 저장한 호만 실선 — B 그대로'],
    ['/status', 'B + C', 'C 숫자판 3개(값) → B 원장(근거) → B 30일 달력 → B 소스 표. B 비용 막대는 숫자판과 겹쳐 뺐다'],
    ['뒤표지 링크', 'B 제호', '링크 목록 끝 “발행 상태” 한 항목'],
  ].map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
  return `<details class="meta">
  <summary><span class="meta__tag">시안 정보</span><b>D3 혼합안 — A 얼굴 · C 빈 상태 · B 원장</b><span class="meta__one">밖에서 보는 얼굴(아이콘 · OG)은 마스트헤드 티켓, 비어 있는 자리는 등번호 숫자, 운영 기록은 판권면 원장.</span><span class="meta__more" aria-hidden="true"></span></summary>
  <div class="meta__grid">
    <div><p class="meta__h">장점</p><ul>${li(['설치 · 공유 · 방문이 같은 얼굴(티켓)로 이어진다 — D0 견본을 정리한 것이라 새로 정할 것 0', '빈 상태가 이미 7곳에 퍼진 윤곽 숫자 언어를 키운 것 — 새 도형 0, CSS만', '/status는 값(숫자판)과 근거(원장 · 달력 · 표)가 위아래로 나뉘어 3초 스캔 · 스크린리더 · JS 0', 'DESIGN 규칙 변경 0 · 새 색 토큰 0 · 새 폰트 0'])}</ul></div>
    <div><p class="meta__h">단점</p><ul>${li(['출처가 셋이라 이음새 규칙(괘선 · 숫자 크기 · 라벨)을 지켜야 한 제품으로 보인다 — 아래 4번에 고정', '휴식기 변형은 M1-37 #2 결정을 바꾼다(사용자 결정 2026-11-02) — 홈 A매치 섹션과 경기 정보가 겹치지 않게 날짜 · 상대만 싣는다', '대회 OG는 네이비 면이라 다크 대회 값 — 화면(라이트 탭)과 색이 달라 보일 수 있다(A 단점 그대로)', '375 /status 달력 칸이 좁아 시각 글자가 빽빽하다(B 단점 그대로)'])}</ul></div>
    <div><p class="meta__h">구현 난이도</p><p><b>중</b> — 아이콘은 temp-icons.ts에 천공 · 노치 + ED 글리프 path 1회, OG 템플릿 1 + 변형 3, 빈 상태는 BriefRest 확장(CSS · 서버 컴포넌트), /status 서버 컴포넌트 JS 0.</p><p class="meta__h">번들 · 폰트 영향</p><p>폰트 변화 0 — EuroDigest Sans 400 · 800 + Barlow Condensed 600 · 800(417.8KB, 2패밀리 4파일, ../fonts/ 로컬). 섬 JS 0(/status · 빈 상태 모두 서버). favicon.svg 약 0.6KB · ico 약 1.5KB.</p><p class="meta__h">DESIGN 규칙 변경</p><p>0 — <code>--og-*</code> 4개 삭제(라이트 티켓 토큰 고정), 휴식기 변형은 화면 결정.</p></div>
    <div class="span3"><p class="meta__h">출처 (산출물 × 시안)</p><table class="axes src"><thead><tr><th scope="col">산출물</th><th scope="col">출처</th><th scope="col">혼합안에서</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div>
</details>`;
}

function topbar() {
  return `<div class="bar"><div class="bar__in"><b>D3 혼합안</b><span>기준 <time datetime="${D.today.date}">${esc(D.today.label)}</time> 제 ${D.today.no}호 · 실데이터</span><nav class="bar__nav" aria-label="견본 목차"><a href="#s1"><span class="n">1</span>앱 아이콘</a><a href="#s2"><span class="n">2</span>OG</a><a href="#s3"><span class="n">3</span>빈 상태</a><a href="#s4"><span class="n">4</span>이음새</a><a href="#s5"><span class="n">5</span>/status</a></nav><button class="ibtn" type="button" data-theme-toggle aria-label="테마: 시스템 설정">${IC.theme}</button></div></div>`;
}

export function build() {
  const body = `${meta()}
${topbar()}
<div class="board">
  <header class="hero"><p class="hero__k" lang="en" aria-hidden="true">D3 · MIX</p><h1>혼합안</h1><p>밖에서 보는 얼굴(앱 아이콘 · 파비콘 · OG)은 A 입장권, 비어 있는 자리(비시즌 · 휴식기 · 검색 0)는 C 등번호, 운영 기록(/status · /offline/)은 B 제호. 세 출처를 괘선 위계 · 숫자 크기 · 라벨 서체 · 모션 하나로 맞췄다.</p></header>
  ${sIcons()}
  ${sOg()}
  ${sEmpty()}
  ${sSeams()}
</div>
${sStatus()}`;
  return page({
    file: 'concept-mix.html', title: 'D3 혼합안 — 유로 다이제스트',
    comment: `D3 혼합안 — A 입장권(아이콘 · 파비콘 · OG) + C 등번호(빈 상태) + B 제호(/offline/ · /status 원장 · 뒤표지 링크) + C 숫자판(/status 머리)
사용자 결정 2026-11-02: 아이콘 · OG 전부 A, 빈 상태 C, A매치 휴식기 5줄 변형 신설(M1-37 #2 변경), /offline/ B, /status B + C 숫자판 3개(비용 %만), 뒤표지 링크 B
한 줄: 밖에서 보는 얼굴은 마스트헤드 티켓, 비어 있는 자리는 등번호 숫자, 운영 기록은 판권면 원장
장점: 설치 · 공유 · 방문이 같은 얼굴 · 빈 상태 새 도형 0 · /status 값 → 근거 위계 · DESIGN 규칙 변경 0
단점: 출처 셋의 이음새 규칙을 지켜야 함 · 휴식기 변형은 기존 결정 변경 · 대회 OG 다크 대회 값 · 375 달력 칸 빽빽
구현 난이도: 중 (temp-icons 천공 · 노치 + ED path 1회, OG 템플릿 1 + 변형 3, BriefRest 확장, /status 서버 컴포넌트 JS 0)
번들/폰트: 폰트 변화 0 (EuroDigest Sans 400·800 + Barlow Condensed 600·800 = 417.8KB, ../fonts/ 로컬), 새 색 토큰 0, OG 전용 변수 4개 제거, 섬 JS 0
데이터: docs/design/d3/data/d3-data.json (runs.json · runs-dev.json · configs · data/teams 실값, 2026-11-02 기준). 문구 생성 · LLM 호출 0
생성: node docs/design/d3/build/gen.mjs mix — A · B · C 생성기의 함수 · CSS를 가져온다(build/concept-mix.mjs)
견본 단독 렌더: ?solo=<data-solo 값>&w=1200 (예: ?solo=og-news-22) — OG 1200×630 실제 크기`,
    css, body,
  });
}
