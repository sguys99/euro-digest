// D2 혼합안 생성기 — A 스쿼드 명단 기반 + B 선수 티켓 + C 주간 지면 · 타임라인 · 색인 · 자리 규칙
// 입력: docs/design/d2/data/d2-data.json (실데이터만) · 출력: docs/design/d2/concept-mix.html
// 실행: 저장소 루트에서 `node docs/design/d2/build-concept-mix/gen.mjs` (의존성 없음)
// 문구 생성·LLM 호출 0. 데이터에 없는 값은 자리(reason · fillStage)로 표시한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/design/d2/data/d2-data.json'), 'utf8'));
const OUT = path.join(ROOT, 'docs/design/d2/concept-mix.html');
const CSS = ['base.css', 'components.css', 'mix.css'].map((f) => fs.readFileSync(path.join(HERE, f), 'utf8')).join('\n');

const BP = '/euro-digest';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// 제품 화면 문구에서 작업 메모(FR ID · scope · 결정 번호 괄호)를 뺀다 — 자리(reason · fillStage)와 시안 설명 띠에는 쓰지 않는다
const clean = (s) => String(s ?? '').replace(/\s*\([^()]*(?:FR-\d|PRD|scope|D\d\d|M\d-\d|§|코드)[^()]*\)/g, '').replace(/\s+/g, ' ').trim();
const T = D.teams;
const C = D.cards;
const COMP = Object.fromEntries(D.labels.competitions.map((c) => [c.id, c]));
const TABC = { EPL: 'epl', LALIGA: 'laliga', SERIEA: 'seriea', BUNDESLIGA: 'bundesliga', LIGUE1: 'ligue1', UCL: 'ucl' };
const allPlayers = D.players.groups.flatMap((g) => g.players);
const P = Object.fromEntries(allPlayers.map((p) => [p.slug, p]));

/* ── 아이콘 (D0 경로 · square cap) ── */
const svg = (d, w = 22) => `<svg class="ic" viewBox="0 0 24 24" width="${w}" height="${w}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" stroke-linejoin="miter">${d}</svg>`;
const IC = {
  search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5"/>'),
  theme: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>'),
  right: svg('<path d="m9 6 6 6-6 6"/>'),
  left: svg('<path d="m15 6-6 6 6 6"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>'),
  arrow: svg('<path d="M4 12h15M14 7l5 5-5 5"/>'),
  bookmark: svg('<path d="M6 3.5h12v17l-6-4.5-6 4.5z"/>', 16),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 16),
  cal: svg('<path d="M4 6h16v14H4z"/><path d="M4 10h16M8 3.5V7M16 3.5V7"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>'),
  home: svg('<path d="M3.5 10.5 12 4l8.5 6.5V20h-5.5v-6h-6v6H3.5z"/>'),
  news: svg('<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 12.5h8M8 16h5"/>'),
  league: svg('<path d="M4 5h16M4 10h16M4 15h16M4 20h16"/><path d="M8.5 5v15"/>'),
  player: svg('<path d="M8 3.5 3.5 6.5 5.5 10.5 7.5 9.5V20.5h9V9.5l2 1 2-4L16 3.5c-.6 1.7-2.2 2.8-4 2.8S8.6 5.2 8 3.5z"/>'),
  my: svg('<path d="M6 3.5h12v17l-6-4.5-6 4.5z"/>'),
};
const icS = (k, w = 16) => IC[k].replace(/width="\d+" height="\d+"/, `width="${w}" height="${w}"`);

/* ══════════════ 원자 ══════════════ */
const tm = (o, cls = '', txt) => (o && o.utc ? `<time${cls ? ` class="${cls}"` : ''} datetime="${o.utc.replace('.000Z', 'Z')}">${esc(txt ?? o.short)}</time>` : `<span class="${cls}">${esc(txt ?? o?.short ?? '')}</span>`);
const n = (v) => `<span class="n">${esc(v)}</span>`;
const md = (o) => o.short.slice(0, 5); // "10.29"
const dow = (o) => o.dayShort.replace(/^[^(]*/, ''); // "(목)"
const ftab = (id) => {
  if (!id || id === 'OTHER') return `<span class="ftab ftab--other" title="기타 대회">기타</span>`;
  const c = COMP[id];
  return `<span class="ftab tab--${TABC[id]}" title="${esc(c.nameKo)}">${esc(c.shortKo)}</span>`;
};
const itab = (id) => (id && TABC[id] ? `<span class="tab tab--${TABC[id]}" title="${esc(COMP[id].nameKo)}"><span class="tab__t">${esc(COMP[id].shortKo)}</span></span>` : '');
function badge(slug, size = 'xs', solo = false) {
  const t = slug ? T[slug] : null;
  const b = t?.badge;
  if (!b || b.fallback) {
    const sh = b?.short || '';
    return `<span class="bdg bdg--${size} bdg--none"${solo ? ` role="img" aria-label="${esc(t?.nameKo || '팀')} 배지 (팀 컬러 없음)"` : ' aria-hidden="true"'}><b>${esc(sh)}</b></span>`;
  }
  return `<span class="bdg bdg--${size}" style="--k1:${b.k1};--k2:${b.k2};--kf:${b.kf}"${solo ? ` role="img" aria-label="${esc(t.nameKo)} 배지 ${esc(b.short)}"` : ' aria-hidden="true"'}><b>${esc(b.short)}</b></span>`;
}
const tName = (slug, fallback) => (slug && T[slug] ? T[slug].nameKo : fallback);
const fm = (o) => `<i class="fm fm--${o}" aria-hidden="true">${o}</i>`;
const OUTK = { W: '승', D: '무', L: '패' };
const gl = (g, a) => `${g > 0 ? `<span class="gl"><span class="n">${g}</span>골</span>` : ''}${a > 0 ? `<span class="gl"><span class="n">${a}</span>도움</span>` : ''}`;
const oppName = (o) => (o.nameLang ? `<span lang="${o.nameLang}">${esc(o.name)}</span>` : esc(o.name || o.nameKo));
const arm = () => `<span class="arm" title="한국 선수 관련">한국</span>`;
const rh = (s) => `<span class="rh" lang="en" aria-hidden="true">${s}</span>`;
const secH = (id, h, r, tag = 'h2', thin = false) => `<div class="sec-h${thin ? ' sec-h--thin' : ''}"><${tag} id="${id}">${h}</${tag}>${r ? rh(r) : ''}</div>`;
const AI = `<a class="ai" href="${BP}/about/#ai">AI 작성</a>`;

/* 숫자 상태 규칙 (B) — 실선 = 값 있음(출전) · 윤곽 = 0·미출전 · 대시 = 값 없음(null). 상태 글자를 늘 함께 쓴다 */
const stv = (v, appeared) => (v == null || v === '–' ? 'v-null' : appeared ? 'v-on' : 'v-zero');

/* 결과 칸 — 맥락 규칙: 선수·팀 기준 행 = W/D/L + 기준 팀 득점 먼저 + 홈/원정 글자.
   결과 가리기 켬 = W/D/L·스코어·골·도움을 함께 가리고(빗금 + "보기" 44px), 홈/원정·출전 상태·분은 남긴다 */
function rcell(inner, goals, ha, ctx) {
  return `<span class="rc"><span class="rc__l"><span class="spo-v res">${inner}</span><button class="spo-b" type="button" aria-label="${esc(ctx)} 결과 보기"><span>보기</span></button>${ha ? `<span class="ha">${esc(ha)}</span>` : ''}</span>${goals ? `<span class="spo-v rc__g">${goals}</span>` : ''}</span>`;
}
function resCell(r, o = {}) {
  if (!r || !r.result) return '';
  const oc = r.result.outcome;
  const inner = `${fm(oc)}<span class="sr">${OUTK[oc]} </span><b class="sc n">${esc(r.result.text)}</b>`;
  return rcell(inner, o.gl === false ? '' : gl(r.goals, r.assists), o.ha === false ? '' : r.venueLabel, o.ctx || `${md(r.kickoff)} 경기`);
}

/* 이적 단계 펀치 · Tier (DESIGN §2.7 · §2.8) */
const punch = (filled, status) => {
  let s = '';
  for (let i = 0; i < 4; i++) s += `<i${status !== 'collapsed' && i < filled ? ' class="on"' : ''}></i>`;
  return `<span class="punch">${s}</span>`;
};
const STG = D.labels.transferStage;
const stg = (status) => {
  const L = STG[status];
  const aria = status === 'collapsed' ? '이적 단계: 결렬' : `이적 단계: ${L.label} (4단계 중 ${L.filled})`;
  return `<span class="stg stg--${status}" role="img" aria-label="${aria}">${punch(L.filled, status)}<span class="stg__v" aria-hidden="true">${L.label}</span></span>`;
};
const tier = (t) => `<span class="tier tier--${t}"><span class="sr">출처 </span>Tier ${t}</span>`;

/* 자리 조형 (C) — 점선 1.5px + '자리' 도장 + reason + 채울 단계. 문단 자리 = 빈 기준선, 이름 자리 = 빈 밑줄 */
function blank(ph, o = {}) {
  const head = `<p class="blank__h"><span class="blank__k">자리</span>${o.title ? `<span class="blank__t">${o.title}</span>` : ''}${o.ai ? `<span class="ai ai--ph">AI 작성</span>` : ''}${o.gen ? `<span class="blank__gen">생성 날짜<i class="slot" aria-hidden="true"></i></span>` : ''}<span class="blank__st">채울 단계 <b class="id">${esc(ph.fillStage)}</b></span></p>`;
  return `<div class="blank${o.lines ? ' blank--lines' : ''}${o.short ? ' blank--short' : ''}${o.cls ? ' ' + o.cls : ''}"${o.id ? ` id="${o.id}"` : ''}${o.lines ? ` style="--lines:${o.lines}"` : ''}>${head}<p class="blank__r">${esc(ph.reason)}</p>${o.lines ? `<div class="blank__lines" aria-hidden="true"></div>` : ''}${o.after || ''}</div>`;
}
const blankI = (ph, label = '', o = {}) => `<span class="blank-i"><span class="blank__k">자리</span>${label ? `<b>${esc(label)}</b>` : ''}${o.noReason ? '' : `<span class="blank-i__r">${esc(ph.reason)}</span>`}<b class="id">${esc(ph.fillStage)}</b></span>`;
/* 생략 띠 — 이 시안 범위 밖(D0·D1 확정 영역). 자리(데이터 대기)와 모양을 나눈다 */
const omit = (what) => `<p class="omit"><span class="omit__k">생략</span>${what}</p>`;

/* 원제목 링크 (무수정 — 마지막 단어 + ↗ 붙임) */
function titleLink(c) {
  const t = c.t;
  const i = t.lastIndexOf(' ');
  const head = i > 0 ? t.slice(0, i + 1) : '';
  const tail = i > 0 ? t.slice(i + 1) : t;
  return `<a href="${esc(c.lead.u)}" target="_blank" rel="noopener">${esc(head)}<span class="nobr">${esc(tail)}<span class="ext" aria-hidden="true">↗</span></span><span class="sr">(원문 ${esc(c.lead.n)}, 새 창)</span></a>`;
}
function titleText(c) {
  const t = c.t;
  const i = t.lastIndexOf(' ');
  const head = i > 0 ? t.slice(0, i + 1) : '';
  const tail = i > 0 ? t.slice(i + 1) : t;
  return `${esc(head)}<span class="nobr">${esc(tail)}<span class="ext" aria-hidden="true">↗</span></span><span class="sr">(원문 ${esc(c.lead.n)}, 새 창)</span>`;
}
const srcLang = (nm) => (/[a-z]/i.test(nm) && !/[가-힣]/.test(nm) ? ' lang="en"' : '');
/* 뉴스 행 (A — D0 카드 · 날짜 거터) */
function newsRow(id, o = {}) {
  const c = C[id];
  if (!c) throw new Error('카드 없음 ' + id);
  const latin = c.lang !== 'ko';
  const tags = c.tags.map((t) => `<li${t.korean ? ' class="kr"' : ''}>${esc(t.label)}</li>`).join('');
  const more = c.more ? ` <span>+${c.more.n}${c.more.unit}</span>` : '';
  const why = o.why ? `<span class="why">${esc(o.why)}</span>` : '';
  const comps = c.comp.map((x) => itab(x.id)).join('');
  const tid = `${o.p || 'n'}-${id}`;
  return `<article class="nr${o.small ? ' nr--s' : ''}" aria-labelledby="${tid}">
  <div class="nr__g"><span class="nr__d" aria-hidden="true">${esc(c.lead.at.short.slice(0, 5))}</span>${c.kr ? arm() : ''}</div>
  <div class="nr__b">
    <div class="nr__tg"><span class="stamp">${esc(c.catLabel)}</span>${tags ? `<ul class="tags" aria-label="태그">${tags}</ul>` : ''}</div>
    <h3 class="nr__t${latin ? ' is-latin' : ''}" id="${tid}"${latin ? ` lang="${c.lang}"` : ''}>${titleLink(c)}</h3>
    <div class="nr__m"><span class="src"${srcLang(c.lead.n)}>${esc(c.lead.n)}</span>${more}<time datetime="${c.lead.at.utc.replace('.000Z', 'Z')}"><span class="rel">${esc(c.lead.rel)}</span><span class="abs">${esc(c.lead.at.short)}</span></time>${why}</div>
  </div>
  <div class="nr__tabs">${comps}</div>
</article>`;
}

/* ── 출전 분 거터 (A) + 숫자 상태 규칙 (B) ── */
const ST_SHORT = { start: '선발', sub: '교체', bench: '벤치', absent: '명단 제외', unknown: '라인업 없음' };
function gut(r) {
  if (!r || r.placeholder) return `<span class="min v-null" aria-hidden="true">–</span><span class="st" aria-hidden="true">연결 전</span><span class="sr">기록 연결 전</span>`;
  const v = r.minutes == null ? '–' : r.minutes;
  return `<span class="min ${stv(r.minutes, r.appeared)}" aria-hidden="true">${v}</span><span class="st${r.appeared ? ' st--on' : ''}" aria-hidden="true">${ST_SHORT[r.status]}</span><span class="sr">${esc(r.statusLabel)}${r.minutes != null ? ` ${r.minutes}분` : ''}</span>`;
}

/* ── 팔로우 버튼 (B) — 미니 스텁 + 접힘 200ms · 켜짐 반전 + ✓ · 한도 5 = 점선 비활성 + 이유 문장 ── */
function followBtn(state, name, id, o = {}) {
  const on = state === 'on';
  const lim = state === 'limit';
  const desc = lim ? ` aria-disabled="true" aria-describedby="${o.desc || 'fol-lim'}"` : '';
  return `<button class="fol${o.icon ? ' fol--icon' : ''}" type="button" data-follow="${esc(id)}" data-name="${esc(name)}" aria-pressed="${on}"${desc}><span class="fol__s" aria-hidden="true"><span class="off">${IC.bookmark}</span><span class="on">${IC.check}</span></span><span class="fol__t">${on ? '팔로우 중' : lim ? '팔로우 5/5' : '팔로우'}</span><span class="sr"> — ${esc(name)}</span></button>`;
}

/* ══════════════ 화면 1 — 한국 선수 목록 (A 명단 표) ══════════════ */
function listRow(p) {
  const r = p.recent;
  const linked = p.state.kind === 'linked';
  const hasRecent = r && !r.placeholder;
  const s = p.season && !p.season.placeholder ? p.season.total : null;
  const nx = p.next && !p.next.placeholder ? p.next : null;
  const state = !linked ? `<span class="state">${esc(p.state.label)}</span>` : '';
  const uclTxt = p.ucl
    ? p.ucl.teamInUcl
      ? `<span class="ucl">${ftab('UCL')}<b>${esc(p.ucl.label)}</b>${p.ucl.detail ? ` <span class="n">${esc(p.ucl.detail)}</span>` : ''}</span>`
      : `<span class="note" aria-hidden="true">–</span><span class="sr">${esc(p.ucl.label)}</span>`
    : '<span class="note" aria-hidden="true">–</span><span class="sr">해당 없음</span>';
  const plCell = `<td class="c-pl"><div class="pl">
      <p class="pl__n"><a href="${BP}/korean-players/${p.slug}/">${esc(p.nameKo)}</a><span class="pos">${esc(p.position)}</span></p>
      <span class="pl__tm">${badge(p.team.slug)}<span>${esc(p.team.nameKo)}</span></span>
      ${p.ucl && p.ucl.teamInUcl ? `<span class="m-only v-season pl__x">${uclTxt}</span>` : ''}
    </div></td>`;
  let when = '', opp = '', res = '';
  if (hasRecent) {
    when = `<td class="d c-when v-recent"><div class="when">${tm(r.kickoff, '', r.kickoff.dayShort)}<span class="when__c">${r.comp.id === 'OTHER' ? `<span class="note">기타 대회 · <span lang="en">${esc(r.leagueRaw)}</span></span>` : ftab(r.comp.id)}</span></div></td>`;
    opp = `<td class="d c-opp v-recent"><span class="opp">${badge(r.opponent.slug)}<span>${oppName(r.opponent)}</span></span></td>`;
    res = `<td class="c-res v-recent">${resCell(r, { ctx: `${p.nameKo} ${md(r.kickoff)} 경기` })}<span class="res__l m-only">${tm(r.kickoff, '', r.kickoff.short.slice(0, 5))} ${oppName(r.opponent)}</span></td>`;
  } else if (p.state.kind === 'not-linked') {
    res = `<td class="c-res v-recent c-wide" colspan="3">${blankI(r, p.state.label)}</td>`;
  } else {
    res = `<td class="c-res v-recent c-wide" colspan="3">${state}<span class="note c-wide__r">${esc(clean(r?.reason || ''))}</span></td>`;
  }
  let season;
  if (s) {
    const c = (v, z) => `<td class="c-n v-season${z ? ' c-sep' : ''}"><span class="num${v === 0 ? ' num--z' : ''}">${v}</span></td>`;
    season = c(s.apps, true) + c(s.minutes) + c(s.goals) + c(s.assists);
  } else {
    season = `<td class="c-n v-season c-sep" colspan="4" style="text-align:left">${p.state.kind === 'not-linked' ? blankI(p.season) : state}</td>`;
  }
  const ucl = `<td class="d c-ucl">${uclTxt}</td>`;
  const next = nx
    ? `<td class="c-next v-next"><span class="nx">${tm(nx.kickoff, '', nx.kickoff.short.slice(6))}<span class="nx__d">${esc(nx.kickoff.dayShort)}</span><span class="nx__o">${ftab(nx.comp.id)}<b>${esc(nx.opponent.nameKo)}</b> ${esc(nx.venueLabel)}</span></span></td>`
    : `<td class="c-next v-next"><span class="state">${esc(p.state.label || '일정 없음')}</span><span class="d note" style="display:block;margin-top:4px">${esc(clean(p.next?.reason || ''))}</span></td>`;
  return `<tr data-p="${p.slug}"><td class="c-min">${gut(hasRecent ? r : null)}</td>${plCell}${when}${opp}${res}${season}${ucl}${next}</tr>`;
}
function listTable() {
  const head = `<thead>
<tr class="rg-hg"><th class="gap" colspan="2"><span></span></th><th scope="colgroup" colspan="3"><span>최근 경기</span></th><th scope="colgroup" colspan="4"><span>시즌 누적 <span class="note">· 10.19부터</span></span></th><th scope="col" class="gap"><span>UCL</span></th><th scope="colgroup"><span>다음 경기 KST</span></th></tr>
<tr class="rg-hc"><th scope="col" class="l c-min">분</th><th scope="col" class="l c-pl">선수 · 소속</th><th scope="col" class="d l">일시 · 대회</th><th scope="col" class="d l">상대</th><th scope="col" class="c-res v-recent">결과</th><th scope="col" class="c-n v-season c-sep" title="출전 경기">출전</th><th scope="col" class="c-n v-season">분</th><th scope="col" class="c-n v-season">골</th><th scope="col" class="c-n v-season">도움</th><th scope="col" class="d l c-ucl">리그 페이즈</th><th scope="col" class="c-next v-next">일시 · 상대</th></tr>
</thead>`;
  const bodies = D.players.groups
    .map((g) => {
      const gh = `<tr class="rg-g"><th scope="rowgroup" colspan="11"><span class="rg-g__in">${ftab(g.comp === 'OTHER' ? null : g.comp)}<span>${g.comp === 'OTHER' ? '기타 리그' : esc(g.label)}</span><span class="cnt">${g.players.length}명</span>${g.comp === 'OTHER' ? '<span class="note">5대 리그 밖 — 기록 갱신 중단</span>' : ''}</span></th></tr>`;
      return `<tbody>${gh}${g.players.map(listRow).join('\n')}</tbody>`;
    })
    .join('\n');
  return `<div class="vt" role="tablist" aria-label="명단 보기">
  <button role="tab" type="button" id="vt-r" aria-controls="rg-list" aria-selected="true" data-view="recent">최근 경기</button>
  <button role="tab" type="button" id="vt-s" aria-controls="rg-list" aria-selected="false" tabindex="-1" data-view="season">시즌 누적</button>
  <button role="tab" type="button" id="vt-n" aria-controls="rg-list" aria-selected="false" tabindex="-1" data-view="next">다음 경기</button>
</div>
<table class="rg" id="rg-list" data-view="recent" aria-labelledby="kp-h">
<caption class="sr">한국 선수 명단 — 리그별. 첫 열은 가장 최근 경기의 출전 분과 출전 상태. 결과는 그 선수 소속팀 득점이 먼저. 시즌 누적은 ${esc(D.players.aggregationSinceLabel)}. 시각은 KST.</caption>
${head}
${bodies}
</table>`;
}

/* ══════════════ 공용 행 ══════════════ */
const PD = D.playerDetail;
const kim = P[PD.slug];
/* 출전 로그 행 (C) — 날짜 거터 + 대회 · 상대 + 출전 상태(숫자 상태 규칙) + 결과 칸 */
function logRow(r, o = {}) {
  if (r.placeholder) return `<li class="lgr lgr--ph"><p class="lgr__d" aria-hidden="true"><b class="lgr__dash"></b></p><div class="lgr__ph"><b>${esc(r.label)}</b><span class="lgr__phl" aria-hidden="true"></span></div></li>`;
  const comp = r.comp.id === 'OTHER' ? `${ftab('OTHER')}<span lang="en">${esc(r.leagueRaw)}</span>` : ftab(r.comp.id);
  const v = r.minutes == null ? '–' : r.minutes;
  return `<li class="lgr">
  <p class="lgr__d">${tm(r.kickoff, '', md(r.kickoff))}<span>${esc(dow(r.kickoff))} ${esc(r.kickoff.time)}</span></p>
  <div class="lgr__b">
    <p class="lgr__k">${comp}<span>${esc(r.roundLabel)}</span></p>
    <p class="lgr__o">${o.who ? `<b class="lgr__who">${esc(o.who)}</b>` : ''}<span class="vs">vs</span>${badge(r.opponent.slug)}<span>${oppName(r.opponent)}</span></p>
    <p class="lgr__a"><span class="lgr__m ${stv(r.minutes, r.appeared)}" aria-hidden="true">${v}</span>${r.minutes != null ? '<small aria-hidden="true">분</small>' : ''}<span class="lgr__s${r.appeared ? ' is-on' : ''}">${esc(r.statusLabel)}<span class="sr">${r.minutes != null ? ` ${r.minutes}분` : ''}</span></span></p>
  </div>
  <div class="lgr__r">${resCell(r, { ctx: `${md(r.kickoff)} ${r.opponent.name}전` })}</div>
</li>`;
}
/* 일정 행 (A — 경기 기준: 홈 팀 먼저) */
function fxRow(m, why = '') {
  const home = m.homeTeam, away = m.awayTeam;
  return `<li class="fx">
  <div class="fx__g">${tm(m.kickoff, 'fx__t', m.kickoff.short.slice(6))}<span class="fx__d">${esc(m.kickoff.dayShort)}</span></div>
  <div class="fx__b"><p class="fx__k">${ftab(m.comp.id)}<span>${esc(m.roundLabel)}</span></p>
  <p class="fx__vs"><span>${badge(home.slug, 's')}<span><span class="sr">홈 </span>${esc(home.nameKo)}</span></span><span>${badge(away.slug, 's')}<span><span class="sr">원정 </span>${esc(away.nameKo)}</span></span></p>${why ? `<p class="fx__why"><span class="sr">팔로우: </span>${why}</p>` : ''}</div>
</li>`;
}
/* 다음 경기 입장권 (B) — 킥오프 큰 숫자 + .ics · 경기 기준이라 홈 팀 먼저 */
function admission(m, o = {}) {
  return `<article class="adm${o.v ? ' adm--v' : ''}" aria-labelledby="${o.id}-h">
  <div class="adm__stub"><p class="adm__time"><span class="sr" id="${o.id}-h">${esc(o.title || '다음 경기')} — ${esc(m.kickoff.datetime)} KST, ${esc(m.homeTeam.nameKo)} 대 ${esc(m.awayTeam.nameKo)}</span><span class="big" aria-hidden="true">${esc(m.kickoff.time)}</span></p><p class="adm__d" aria-hidden="true">${tm(m.kickoff, '', m.kickoff.dayShort)}<span>KST</span></p></div>
  <span class="perf adm__perf" aria-hidden="true"></span>
  <div class="adm__body">
    <p class="adm__c">${ftab(m.comp.id)}<span>${esc(m.roundLabel)}</span></p>
    <p class="adm__vs"><span class="adm__t">${badge(m.homeTeam.slug, 's')}<span>${esc(m.homeTeam.nameKo)}</span><span class="tag">홈</span></span><span class="adm__t">${badge(m.awayTeam.slug, 's')}<span>${esc(m.awayTeam.nameKo)}</span><span class="tag">원정</span></span></p>
    ${o.why ? `<p class="fx__why"><span class="sr">팔로우: </span>${o.why}</p>` : ''}
    <p class="adm__act"><button class="tlink icsl" type="button" aria-describedby="${o.ics}" data-toast-msg="캘린더 파일은 준비 중이에요">${icS('cal', 18)}<span>캘린더에 추가 .ics</span></button></p>
  </div>
</article>`;
}

/* 이적 원장 행 (A) + 펼침 = 세로 타임라인 (C) — 단계 근거 = 펀치 노드 · 같은 선수의 이적 분류 카드 = 보조 눈금 노드 */
function tlItem(e, pre) {
  const c = C[e.card];
  const stage = e.kind === 'stage';
  return `<li class="tln__i${stage ? '' : ' tln__i--aux'}" id="${pre}-${e.card}" tabindex="-1">
  <p class="tln__d">${tm(e.at, '', md(e.at))}<span>${esc(e.at.time)}</span></p>
  <span class="tln__node${stage ? ` tln__node--${e.status}` : ' tln__node--aux'}" aria-hidden="true"></span>
  <div class="tln__b">
    <p class="tln__k">${stage ? `<b class="tln__st tln__st--${e.status}">${esc(STG[e.status].label)}<span class="sr"> 단계 근거</span></b>${tier(c.lead.tier)}` : `<span class="tln__aux">보조 · 단계 없음</span>`}</p>
    <h4 class="tln__t${c.lang !== 'ko' ? ' is-latin' : ''}"${c.lang !== 'ko' ? ` lang="${c.lang}"` : ''}>${titleLink(c)}</h4>
    <p class="nr__m"><span class="src"${srcLang(c.lead.n)}>${esc(c.lead.n)}</span>${c.more ? `<span>+${c.more.n}${esc(c.more.unit)}</span>` : ''}</p>
  </div>
</li>`;
}
function transferRow(it, opts = {}) {
  const pre = opts.p || 'x';
  const lead = C[it.timeline[it.timeline.length - 1]];
  const who = it.playerName
    ? `<span class="xr__nm">${esc(it.playerName)}</span>${it.registeredKorean ? arm() : ''}`
    : `<span class="xr__nm xr__nm--none"><i class="slot slot--name" aria-hidden="true"></i><span class="sr">선수 이름 표기 없음 — </span><span class="xr__nn">이름 표기 전 — 원제목 참고</span></span>`;
  const aff = it.affiliation ? `<span class="aff"><span class="aff__k">소속</span>${badge(it.affiliation.team.slug)}<b>${esc(it.affiliation.team.nameKo)}</b></span>` : '';
  const to = it.to ? `${badge(it.to.slug, 's')}<span>${esc(it.to.nameKo)}</span>` : `<span class="none" aria-hidden="true">–</span><span class="sr">행선지 정보 없음</span>`;
  const rt = `<span class="sr">출발 팀 정보 없음, </span><span class="ar" aria-hidden="true">${IC.arrow}</span><span class="sr">행선지 </span>${to}`;
  const id = `${pre}-${it.id}`;
  const teams = new Set();
  it.timeline.forEach((cid) => C[cid].tags.filter((t) => t.kind === 'team').forEach((t) => teams.add(t.slug)));
  if (it.affiliation) teams.add(it.affiliation.team.slug);
  if (it.to) teams.add(it.to.slug);
  const entries = it.history.map((h) => ({ at: h.at, card: h.card, kind: 'stage', status: h.status }));
  if (it.auxiliaryCards) for (const cid of it.auxiliaryCards.ids) entries.push({ at: C[cid].lead.at, card: cid, kind: 'aux' });
  entries.sort((a, b) => (a.at.utc < b.at.utc ? 1 : -1));
  const nStage = it.history.length;
  const nAux = entries.length - nStage;
  const tlList = `<ol class="tln" aria-label="기사 타임라인 — 최신순, 단계 근거 ${nStage}건${nAux ? ` · 보조 ${nAux}건` : ''}">${entries.map((e) => tlItem(e, `${pre}t`)).join('')}</ol>
  <p class="tln__lg" aria-hidden="true"><span><i class="tln__node tln__node--rumor"></i>단계 근거</span>${nAux ? `<span><i class="tln__node tln__node--aux"></i>보조 · 같은 선수의 이적 기사(단계 없음)</span>` : ''}</p>`;
  return `<article class="xr${opts.wide ? ' xr--w' : ''}" id="${id}" data-league="${it.comps.map((c) => c.id).join(' ')}" data-team="${[...teams].join(' ')}" data-status="${it.status}" data-tier="${it.bestTier}" data-kr="${it.registeredKorean}" aria-labelledby="${id}-h">
  <div class="xr__stg">${stg(it.status)}</div>
  <div class="xr__who"><h3 id="${id}-h" class="xr__h">${who}</h3>${aff}</div>
  <div class="xr__rt">${rt}</div>
  <div class="xr__tier">${tier(it.bestTier)}</div>
  <div class="xr__upd"><span>최근 갱신</span>${tm({ utc: it.updated.utc || lead.lead.at.utc }, '', it.updated.short)}</div>
  <div class="xr__ev"><div><h4 class="nr__t">${titleLink(lead)}</h4><p class="nr__m"><span class="src">${esc(lead.lead.n)}</span><span>${esc(it.updatedRel)}</span></p></div>
  ${entries.length > 1 ? `<button class="tlb" type="button" aria-expanded="false" aria-controls="${id}-tl"><span class="u">타임라인</span> <span class="n">${entries.length}</span><span class="sr">건</span>${icS('down')}</button>` : `<span class="note tl1">기사 <span class="n">1</span></span>`}</div>
  ${entries.length > 1 ? `<div class="xr__tl" id="${id}-tl" hidden>${tlList}</div>` : ''}
</article>`;
}

/* ══════════════ 셸 ══════════════ */
const REF = D.meta.reference;
const ISSUE = D.meta.issue;
const masthead = `<header class="mast">
  <div class="ticket">
    <div class="ticket__brand">
      <p class="wordmark"><a href="${BP}/">유로 다이제스트</a></p>
      <p class="wordmark-en" lang="en">EURO DIGEST</p>
      <p class="tagline">매일 아침, 밤사이 유럽 축구를 한눈에.</p>
    </div>
    <div class="ticket__tools"><button class="ibtn search" type="button" data-search aria-label="검색 (단축키 /)" aria-haspopup="dialog">${IC.search}<span class="search__t">검색</span><kbd>/</kbd></button><button class="ibtn" type="button" data-theme-toggle aria-label="테마: 시스템 설정 (눌러서 바꾸기)">${IC.theme}</button></div>
    <span class="ticket__perf" aria-hidden="true"></span>
    <p class="issue"><span class="issue__k">제</span><span class="issue__n">${ISSUE.no}</span><span class="issue__k">호</span></p>
    <p class="stub"><time datetime="${ISSUE.date}">2026년 10월 31일 (토)</time><span>${esc(ISSUE.publishLabel)}</span><span>업데이트 ${esc(D.meta.ledger.updatedAt.time)} KST</span></p>
    <div class="switch"><span class="switch__l" id="sw-l">결과 가리기</span><button class="switch__b" type="button" role="switch" aria-checked="false" aria-labelledby="sw-l" data-spoiler-switch><span class="off">끔</span><span class="on">켬</span></button></div>
  </div>
  <nav class="topnav" aria-label="주요 메뉴"><a href="${BP}/">홈</a><a href="${BP}/news/">뉴스</a><a href="${BP}/competitions/epl/">리그</a><a href="${BP}/korean-players/" aria-current="page">한국 선수</a><a href="${BP}/my/">마이</a><span class="topnav__upd">마지막 업데이트 ${tm(D.meta.ledger.updatedAt, '', D.meta.ledger.updatedAt.time + ' KST')}</span></nav>
</header>`;
/* 시안 설명 띠 — 출처(A/B/C) 꼬리표 */
const srcTag = (s) => s.split('').map((k) => `<span class="src-tag src-tag--${k.toLowerCase()}">${k}</span>`).join('');
const divider = (id, title, code, src, info) => `<aside class="divider divider--screen" id="${id}" aria-label="시안 설명 — ${esc(title)}"><span class="divider__t"><b>${esc(title)}</b> <code>${esc(code)}</code><span class="src-tags"><span class="sr">출처 ${src.split('').join(' · ')}</span><span aria-hidden="true">${srcTag(src)}</span></span></span><span class="divider__info">${info}</span></aside>`;

/* ══════════════ 화면 1 · 목록 ══════════════ */
const counts = D.players.counts;
const ixGroups = D.players.groups.map((g) => `<li><a class="ix-row" href="#rg-list">${ftab(g.comp === 'OTHER' ? null : g.comp)}<span class="ix-l">${g.comp === 'OTHER' ? '기타 리그' : esc(g.label)}</span><span class="lead" aria-hidden="true"></span><span class="n">${g.players.length}</span></a></li>`).join('');
const screen1 = `
<div class="shell" id="s1">
${masthead}
<div class="layout">
<nav class="contents" aria-label="한국 선수 목차">
  ${secH('kp-ix-h', '리그별', 'INDEX')}
  <ul class="toc-ix">${ixGroups}</ul>
  <ul class="toc-ix toc-ix--gap"><li><a class="ix-row" href="#s2"><span class="ix-l">주간 리포트</span><span class="lead" aria-hidden="true"></span><span class="n">W43</span></a></li><li><a class="ix-row" href="#s3"><span class="ix-l">이적</span><span class="lead" aria-hidden="true"></span><span class="n">${D.transfers.counts.items}</span></a></li></ul>
  <p class="note toc-note">${esc(D.players.aggregationSinceLabel)} — 그 전 경기는 기록에 없어요</p>
</nav>
<main class="page" id="main" tabindex="-1">
<section aria-labelledby="kp-h">
  <header class="pg-h">
    <p class="pg-k"><span>등록 ${n(counts.total)} · 기록 연결 ${n(counts.linked)}</span>${rh('SQUAD REGISTER')}</p>
    <h1 id="kp-h">한국 선수</h1>
    <p class="pg-s"><b>${esc(D.players.aggregationSinceLabel)}</b> · 업데이트 ${tm(D.meta.ledger.updatedAt, '', D.meta.ledger.updatedAt.short)} KST</p>
  </header>
  ${listTable()}
  <div class="legend legend--rg">
    <span><span class="lg-n v-on" aria-hidden="true">75</span>출전 분</span>
    <span><span class="lg-n v-zero" aria-hidden="true">0</span>벤치 · 미출전</span>
    <span><span class="lg-n v-null" aria-hidden="true">–</span>값 없음(명단 제외 · 연결 전)</span>
    <span><i class="fm fm--W" aria-hidden="true">W</i><b class="n">6-1</b> · 홈 = 그 선수 소속팀 득점 먼저</span>
  </div>
  <p class="src-note">출전·분·골은 <b>API-Football</b> 경기 기록, 일정은 <b>football-data.org</b>. 컵 대회는 '기타 대회'로 표시해요</p>
</section>
</main>
</div>
</div>`;

/* ══════════════ 화면 1 · 선수 상세 ══════════════ */
const pdH = PD.head;
const st = pdH.teamStanding;
const nationalIds = PD.nationalNews.ids;
const tKim = D.transfers.items.find((x) => x.id === PD.transferLink.transferId);
const rosterIx = allPlayers
  .map((p) => {
    const r = p.recent && !p.recent.placeholder ? p.recent : null;
    const v = r ? (r.minutes == null ? '–' : r.minutes) : '–';
    return `<li><a class="ix-row" href="${BP}/korean-players/${p.slug}/"${p.slug === PD.slug ? ' aria-current="page"' : ''}><span class="min-s n${r && r.appeared ? '' : ' off'}" aria-hidden="true">${v}</span><span class="ix-l">${esc(p.nameKo)}</span><span class="lead" aria-hidden="true"></span>${badge(p.team.slug)}</a></li>`;
  })
  .join('');
const kb = T[pdH.team.slug].badge;
const tot = PD.season.total;
// 선수 티켓 (B) — 키트 스텁(높이를 줄여 다크에서 흰 하의 면을 작게) + 시즌 출전 시간 큰 숫자 + 팔로우(오른쪽 위) + 꼬리표
const playerTicket = `<article class="ptk" aria-labelledby="pd-h">
  <div class="ptk__stub">
    <div class="ptk__kit" style="--k1:${kb.k1};--k2:${kb.k2};--kf:${kb.kf}" role="img" aria-label="${esc(pdH.team.nameKo)} 키트 2색 ${esc(kb.short)}"><b aria-hidden="true">${esc(kb.short)}</b></div>
    <div class="ptk__num"><p class="ptk__big"><span class="big ${stv(tot.minutes, tot.minutes > 0)}" aria-hidden="true">${tot.minutes}<small>분</small></span><span class="sr">시즌 출전 시간 ${tot.minutes}분</span></p><p class="cap">시즌 출전 시간</p><p class="cap cap--2">${esc(PD.season.sinceLabel)}</p></div>
  </div>
  <span class="perf ptk__perf" aria-hidden="true"></span>
  <div class="ptk__body">
    <p class="ptk__comp">${ftab(st.comp)}<span>${esc(pdH.compLabel)} · ${esc(pdH.team.nameKo)} <span class="n">${st.pos}</span>위 · 승점 <span class="n">${st.pts}</span></span></p>
    <div class="ptk__fol">${followBtn('on', pdH.nameKo, 'p:kim-min-jae')}</div>
    <h1 id="pd-h" class="ptk__name">${esc(pdH.nameKo)}</h1>
    <p class="ptk__en" lang="en">${esc(pdH.nameEn)}</p>
    <p class="ptk__facts"><span><b>${esc(pdH.position)}</b></span><span><span class="n">${pdH.birthYear}</span>년생</span><span>출전 <span class="n">${tot.apps}</span> · 선발 <span class="n">${tot.starts}</span></span><span>골 <span class="n">${tot.goals}</span> · 도움 <span class="n">${tot.assists}</span></span><span>벤치 <span class="n">${tot.bench}</span> · 명단 제외 <span class="n">${tot.absent}</span></span></p>
    <p class="ptk__go"><a class="tlink" href="${BP}/teams/${pdH.team.slug}/">${esc(pdH.team.nameKo)} 팀 화면 ${IC.right}</a></p>
  </div>
  <div class="ptk__tail">
    <div class="tcell"><p class="tcell__k">UCL<span>리그 페이즈</span></p><p class="tcell__v"><span>${esc(PD.ucl.label)} · <span class="n">${esc(PD.ucl.detail.replace('분', ''))}</span>분</span></p></div>
    <div class="tcell"><p class="tcell__k">이적설</p><p class="tcell__v">${stg(tKim.status)}<a href="#pd-tr-h">${esc(tKim.to.nameKo)}</a></p></div>
    <div class="tcell"><p class="tcell__k">대표팀<span>소집 소식</span></p><p class="tcell__v"><a href="#pd-nt-h">관련 기사 <span class="n">${nationalIds.length}</span>건</a></p></div>
  </div>
</article>`;
function seasonTable(s) {
  const rows = s.byComp
    .map((c) => {
      const lab = c.comp.id === 'OTHER' ? `<span class="sn__c">${ftab('OTHER')}<span class="sn__raw" lang="en">${esc(c.leaguesRaw.join(', '))}</span></span>` : `<span class="sn__c">${ftab(c.comp.id)}</span>`;
      const v = (x) => `<td><span class="num${x === 0 ? ' num--z' : ''}">${x}</span></td>`;
      return `<tr><th scope="row">${lab}<span class="sr">${esc(c.comp.nameKo)}</span></th>${v(c.apps)}${v(c.minutes)}${v(c.goals)}${v(c.assists)}${v(c.bench)}${v(c.absent)}</tr>`;
    })
    .join('');
  const t = s.total;
  const f = (x) => `<td><span class="num">${x}</span></td>`;
  return `<table class="sn"><caption class="sr">대회별 시즌 기록 — ${esc(s.sinceLabel)}</caption>
<thead><tr><th scope="col">대회</th><th scope="col">출전</th><th scope="col">분</th><th scope="col">골</th><th scope="col">도움</th><th scope="col">벤치</th><th scope="col">제외</th></tr></thead>
<tbody>${rows}</tbody><tfoot><tr><th scope="row">합계</th>${f(t.apps)}${f(t.minutes)}${f(t.goals)}${f(t.assists)}${f(t.bench)}${f(t.absent)}</tr></tfoot></table>`;
}
const detail = `
${divider('s1b', '화면 1 · 한국 선수 상세', '/korean-players/kim-min-jae/', 'BAC', '머리 = B 선수 티켓(키트 스텁 높이를 줄여 다크 흰 면 축소 · 팔로우 오른쪽 위) · 시즌 기록 표 = A · 최근 5경기 = C 로그 행(집계 전 칸 = 대시 + 점선 + 캡션 1줄) · 다음 경기 = B 입장권 · 1280 옆단 = A(다음 경기 · 이적설 · 대표팀). 1279 이하는 머리 → 시즌 → 로그 → 다음 경기 → 뉴스 → 이적설 → 대표팀 순')}
<div class="shell">
<div class="layout layout--3 pd-l">
<nav class="contents" aria-label="한국 선수 명단">
  ${secH('pd-ix-h', '명단', 'SQUAD')}
  <ul class="toc-ix">${rosterIx}</ul>
  <p class="note toc-note">숫자 = 최근 경기 출전 분</p>
</nav>
<div class="pd-flow">
<main class="page pd-main">
  <p class="pd-k pd-o1"><a class="tlink" href="#s1">${IC.left}<span>한국 선수</span></a>${rh('PLAYER REGISTER')}</p>
  <div class="pd-o1">${playerTicket}</div>
  <section class="sec pd-o2" aria-labelledby="pd-sn-h">
    ${secH('pd-sn-h', '시즌 기록', 'SEASON RECORD')}
    <p class="sub">대회별 · ${esc(PD.season.sinceLabel)} — 리그와 UCL은 따로, 컵은 기타 대회</p>
    ${seasonTable(PD.season)}
  </section>
  <section class="sec pd-o3" aria-labelledby="pd-lg-h">
    ${secH('pd-lg-h', '최근 5경기', 'MATCH LOG')}
    <p class="sub">최신순 · 결과는 ${esc(kim.team.nameKo)} 득점 먼저</p>
    <ol class="lgs">${PD.log5.map((r) => logRow(r)).join('')}</ol>
    <p class="lgs__cap"><span class="blank__k">자리</span>4·5번 칸 — ${esc(PD.log5[3].reason)} · 채울 단계 <b class="id">${esc(PD.log5[3].fillStage)}</b></p>
  </section>
  <section class="sec pd-o5" aria-labelledby="pd-nw-h">
    ${secH('pd-nw-h', '관련 뉴스', 'PRESS')}
    <div class="vt vt--keep" role="tablist" aria-label="관련 뉴스 언어">
      <button role="tab" type="button" id="nw-ko" aria-controls="nw-ko-p" aria-selected="true">한국어 <span class="n">${PD.news.ko.length}</span></button>
      <button role="tab" type="button" id="nw-en" aria-controls="nw-en-p" aria-selected="false" tabindex="-1">영문 <span class="n">0</span></button>
    </div>
    <div role="tabpanel" id="nw-ko-p" aria-labelledby="nw-ko"><div class="nrs">${PD.news.ko.slice(0, 4).map((id) => newsRow(id, { p: 'pd' })).join('')}</div>
      <p class="more"><span class="note">대표 출처 시각 최신순 · 원제목 그대로</span><a class="tlink" href="${BP}/news/?player=kim-min-jae">${PD.news.ko.length}건 모두 보기 ${IC.right}</a></p></div>
    <div role="tabpanel" id="nw-en-p" aria-labelledby="nw-en" hidden><div class="empty-s"><span class="empty__n" aria-hidden="true">0</span><p><b>영문 관련 뉴스가 없어요</b></p></div>${blank(PD.news.en, { title: '영문 관련 뉴스', short: true })}</div>
  </section>
</main>
<aside class="side pd-side" aria-label="${esc(pdH.nameKo)} — 다음 경기 · 이적설 · 대표팀">
  <section class="sec pd-o4" aria-labelledby="pd-fx-h">
    ${secH('pd-fx-h', '다음 경기', 'FIXTURES', 'h2', true)}
    <p class="sub">KST · 홈 팀 먼저</p>
    ${admission(PD.upcoming[0], { id: 'pd-adm', ics: 'pd-ics', v: true })}
    <ol class="fxs fxs--after">${PD.upcoming.slice(1).map((m) => fxRow(m)).join('')}</ol>
    ${blank(PD.ics, { title: '.ics', short: true, id: 'pd-ics' })}
  </section>
  <section class="sec pd-o6" aria-labelledby="pd-tr-h">
    ${secH('pd-tr-h', '이적설', 'TRANSFERS', 'h2', true)}
    <div class="xrs">${transferRow(tKim, { p: 'pd' })}</div>
    <a class="tlink" href="#s3">이적 화면에서 보기 ${IC.right}</a>
  </section>
  <section class="sec pd-o7" aria-labelledby="pd-nt-h">
    ${secH('pd-nt-h', '대표팀 소집 소식', 'NATIONAL', 'h2', true)}
    <div class="nrs">${nationalIds.map((id) => newsRow(id, { p: 'pdn', small: true })).join('')}</div>
    ${blank(D.home.nationalTeam.squad, { title: '소집 명단', short: true })}
  </section>
</aside>
</div>
</div>
</div>`;

/* ══════════════ 화면 2 — 주간 리포트 (C 지면 전체 + B 90분 막대) ══════════════ */
const W = D.weekly;
const mvp = W.mvp;
const mvpRow = W.rows.find((r) => r.player === mvp.player);
const gd = mvp.goalDetail[0];
const gdHa = gd.scoreHomeAway.homeName === mvpRow.team.nameKo ? '홈' : '원정';
const bars = (ms) => `<span class="mbars" aria-hidden="true">${ms.map((m) => `<i class="mbar${m.status === 'absent' ? ' mbar--abs' : ''}" style="--w:${m.minutes ? Math.round((m.minutes / 90) * 100) : 0}%"></i>`).join('')}</span>`;
const wRows = W.rows
  .map((r) => {
    const isM = r.player === mvp.player;
    const ms = r.matches.map((m) => `<li>${tm(m.kickoff, '', m.kickoff.dayShort)} ${m.comp.id === 'OTHER' ? '기타' : esc(m.comp.shortKo)} · ${esc(m.opponent)} · <b${['start', 'sub'].includes(m.status) ? '' : ' class="off"'}>${esc(m.statusLabel)}</b>${m.minutes ? ` <span class="n">${m.minutes}</span>분` : ''}</li>`).join('');
    const v = (x, cls = '') => `<td class="n${x === 0 ? ' is-z' : ''}${cls}">${x}</td>`;
    return `<tr class="${isM ? 'is-mvp' : ''}"><th scope="row"><span class="wt__n">${isM ? `<span class="stamp stamp--mvp">MVP</span>` : ''}<a href="${BP}/korean-players/${r.player}/">${esc(r.nameKo)}</a></span><span class="wt__tm">${badge(r.team.slug)}${esc(r.team.nameKo)}</span><ul class="wt__ms">${ms}</ul></th>${v(r.apps)}<td class="n wt__min${r.minutes === 0 ? ' is-z' : ''}">${r.minutes}${bars(r.matches)}</td>${v(r.goals, r.goals ? ' is-g' : '')}${v(r.assists)}<td class="n wt__pt">${r.mvpScore}</td></tr>`;
  })
  .join('');
const ptF = `<span><b class="n">${mvpRow.goals}</b>골 ×<span class="n">3</span></span><span class="op">+</span><span><b class="n">${mvpRow.assists}</b>도움 ×<span class="n">2</span></span><span class="op">+</span><span><b class="n">${mvpRow.apps}</b>출전</span>`;
const screen2 = `
${divider('s2', '화면 2 · 주간 리포트', '/korean-players/weekly/2026-43/', 'CB', 'C 지면 전체 — MVP 머리기사(큰 한글 제목은 이 화면에만) · MVP 점수 박스 · 총평 단(빈 기준선 + 단 머리 AI 작성 + 생성 날짜) · 반전 머리 기록 박스 표 + B 90분 막대(분 열). 375는 MVP 점수 박스를 한 줄로 줄여 표를 앞으로. 발행일 10.26은 가정(M3-06) · 주 경계 UTC 하루 · W44 동점 규칙 미정(scope §6 #2 · #3)')}
<div class="shell">
<section class="sheet" aria-labelledby="wk-h">
  <nav class="sheet__toc" aria-label="주간 리포트 색인">
    ${secH('wk-ix-h', '주간 리포트', 'ARCHIVE')}
    <ul class="toc-ix">
      <li><span class="ix-row is-off"><span class="ix-l">W44</span><span class="lead" aria-hidden="true"></span><span class="ix-s">${esc(W.archive.next.label)}</span></span></li>
      <li><a class="ix-row" href="#s2" aria-current="page"><span class="ix-l">W43 · 10.19 ~ 10.25</span><span class="lead" aria-hidden="true"></span><span class="n">${W.rows.length}</span></a></li>
      <li><span class="ix-row is-off"><span class="ix-l">W42</span><span class="lead" aria-hidden="true"></span><span class="ix-s">리포트 없음</span></span></li>
    </ul>
  </nav>
  <header class="sheet__head">
    <p class="pg-k"><span>한국 선수 · 주간 리포트 · ${esc(W.isoWeekLabel)}</span>${rh('WEEKLY REPORT')}</p>
    <nav class="wnav" aria-label="주 넘기기">
      <span class="wnav__b is-off" aria-disabled="true">${icS('left')}<span><span class="n">W42</span></span><span class="sr"> — ${esc(W.archive.prev.reason)}</span></span>
      <p class="wnav__c"><b><span class="n">W43</span></b>${tm(W.range.from, '', W.range.label)}</p>
      <span class="wnav__b is-off" aria-disabled="true"><span><span class="n">W44</span></span>${icS('right')}<span class="sr"> — ${esc(W.archive.next.label)}</span></span>
    </nav>
    <div class="wk-mvp">
      <p class="wk-mvp__k"><span class="stamp stamp--mvp">이번 주 MVP</span><span>${badge(mvpRow.team.slug)}${esc(mvpRow.team.nameKo)} · ${esc(P[mvp.player].position)}</span></p>
      <h1 class="hed-xl" id="wk-h"><span class="sr">W43 MVP </span><a href="${BP}/korean-players/${mvp.player}/">${esc(mvp.nameKo)}</a></h1>
      <p class="dek">${tm(gd.kickoff, '', gd.kickoff.dayShort + ' ' + gd.kickoff.time)}<span>${esc(gd.opponent)}전</span>${rcell(`<b class="gm"><span class="n">${esc(gd.goalMinutes[0])}</span>분 골</b>${fm(gd.result.outcome)}<span class="sr">${OUTK[gd.result.outcome]} </span><b class="sc n">${esc(gd.result.text)}</b>`, '', gdHa, 'MVP 경기')}</p>
      <p class="wk-pub"><span>${tm({ utc: W.publish.plannedDate + 'T00:00:00Z' }, '', '10.26 (월)')} 발행</span><span>출전 기록 ${esc(W.range.label)}</span></p>
    </div>
  </header>
  <aside class="sheet__side" aria-label="옆단 — MVP 점수 · 다음 순위">
    <div class="side-e">
    <section class="rec rec--pt" aria-labelledby="wk-pt-h">
      <h2 class="rec__h" id="wk-pt-h"><span>MVP 점수</span><span class="rec__rh" lang="en" aria-hidden="true">SCORE</span></h2>
      <div class="rec__b">
        <p class="pt-big"><b class="n">${mvp.score}</b><span>점</span></p>
        <p class="pt-f">${ptF}</p>
        <p class="rec__f">${esc(clean(mvp.rule))}</p>
      </div>
    </section>
    </div>
    <div class="side-l">
    <section aria-labelledby="wk-ru-h">
      ${secH('wk-ru-h', '다음 순위', '', 'h2', true)}
      <ol class="ru">${mvp.runnersUp.map((r) => `<li><span>${esc(r.nameKo)}</span><span class="lead" aria-hidden="true"></span><b class="n">${r.score}</b><span class="ru__u">점</span></li>`).join('')}</ol>
    </section>
    </div>
  </aside>
  <div class="sheet__body">
    <section class="sum" aria-labelledby="wk-sum-h">
      ${secH('wk-sum-h', '총평', 'REMARKS')}
      ${blank(W.summary, { title: `<span class="n">${esc(W.summary.sentences)}</span>문장`, lines: 5, ai: true, gen: true })}
    </section>
    <section class="sec" aria-labelledby="wk-tb-h">
      <div class="rec rec--wide">
        <h2 class="rec__h" id="wk-tb-h"><span>출전 기록 · <span class="n">${W.rows.length}</span>명</span><span class="rec__rh" lang="en" aria-hidden="true">BOX SCORE</span></h2>
        <table class="wt"><caption class="sr">W43 한국 선수 출전 기록 — MVP 점수 순. 분 옆 막대는 경기마다 출전 시간 / 90분</caption>
          <thead><tr><th scope="col">선수 · 경기</th><th scope="col" class="num">출전</th><th scope="col" class="num">분</th><th scope="col" class="num">골</th><th scope="col" class="num">도움</th><th scope="col" class="num">점수</th></tr></thead>
          <tbody>${wRows}</tbody></table>
        <p class="rec__f wt__foot"><span class="mbars mbars--lg" aria-hidden="true"><i class="mbar" style="--w:100%"></i></span>막대 = 경기마다 출전 시간 / 90분 · 벤치는 빈 막대, 명단 제외는 점선<br>표 밖 — ${W.excluded.map((x) => `<b>${esc(x.nameKo)}</b> ${esc(clean(x.reason).split(' — ')[0])}`).join(' · ')}</p>
      </div>
    </section>
  </div>
</section>
</div>`;

/* ══════════════ 화면 3 — 이적 (A 원장 행 + 왼쪽 필터 · C 타임라인 펼침) ══════════════ */
const TR = D.transfers;
const fGroup = (key, title, opts, note = '') =>
  `<div class="xf__g" role="group" aria-labelledby="xf-${key}"><p class="xf__gh" id="xf-${key}">${title}</p>${note ? `<p class="xf__note">${note}</p>` : ''}<div class="xf__opts">${opts
    .map((o) => `<button class="chip${o.kr ? ' chip--kr' : ''}" type="button" data-f="${key}" data-v="${esc(o.v)}" aria-pressed="false"${o.count === 0 ? ' disabled' : ''}>${o.pre || ''}<span class="xo__l">${esc(o.label)}</span><span class="lead" aria-hidden="true"></span><span class="c">${o.count}</span><span class="chip__ck" aria-hidden="true">✓</span></button>`)
    .join('')}</div></div>`;
const xf = `<nav class="xf" aria-label="이적 필터">
  <div class="xf__bar">${secH('xf-h', '필터', 'FILTER', 'h2')}</div>
  <div class="xf__bar xf__bar--2">
    <button class="chip chip--kr" type="button" data-f="kr" data-v="true" aria-pressed="false"><span>한국 선수</span><span class="c">${TR.filters.korean.count}</span><span class="chip__ck" aria-hidden="true">✓</span></button>
    <button class="chip xf__tg" type="button" aria-expanded="false" aria-controls="xf-panel">리그 · 팀 · 단계 · Tier <span class="c" data-fcount>0</span>${icS('down')}</button>
  </div>
  <div class="xf__panel" id="xf-panel" hidden>
    ${fGroup('status', '단계', TR.filters.status.map((s) => ({ v: s.id, label: s.label, count: s.count, pre: punch(STG[s.id].filled, s.id).replace('class="punch"', `class="punch punch--s${s.id === 'official' ? ' punch--off' : ''}${s.id === 'collapsed' ? ' punch--x' : ''}" aria-hidden="true"`) })))}
    ${fGroup('league', '리그', TR.filters.league.map((l) => ({ v: l.id, label: l.label, count: l.count, pre: ftab(l.id) })))}
    ${fGroup('team', '팀', TR.filters.team.map((t) => ({ v: t.slug, label: t.label, count: t.count, pre: badge(t.slug) })))}
    ${fGroup('tier', '출처 Tier', TR.filters.tier.map((t) => ({ v: String(t.tier), label: t.label, count: t.count })), '지금 Tier 1 출처 기사는 없어요')}
  </div>
  <p class="xf__sum" aria-live="polite"><span><b data-xcount>${TR.items.length}</b>건 중 <b data-xshown>${TR.items.length}</b>건</span><button class="tlink" type="button" data-xreset hidden>필터 해제</button></p>
</nav>`;
const screen3 = `
${divider('s3', '화면 3 · 이적', '/transfers/', 'AC', 'A 원장 행(단계 · 선수 + 소속 칸 · 경로 · Tier · 갱신) + 필터(375 접힘 칩 · 1024+ 왼쪽 체크 목록, 0건 점선 비활성) · 펼침 = C 세로 타임라인(단계 근거 = 펀치 노드 · 같은 선수의 이적 분류 카드 = 보조 눈금 노드, 홈 핫 리스트 → :target 도착). 행선지별 카드 분리는 M4-01')}
<div class="shell">
<div class="layout layout--x">
<header class="pgx">
  <div class="pg-h">
    <p class="pg-k"><span>단계 = 펀치 구멍 · 출처 Tier = 카드 최고 출처</span>${rh('TRANSFER LEDGER')}</p>
    <h1 id="tr-h">이적</h1>
  </div>
  <p class="win"><span class="stamp">이적 창 닫힘</span><span>창이 열리면 홈 이적 섹션이 위로 올라가요</span>${blankI(TR.window.dates, '창 날짜', { noReason: true })}</p>
</header>
${xf}
<main class="page">
<section aria-labelledby="tr-h">
  <div class="xr-h" aria-hidden="true"><span>단계</span><span>선수 · 소속</span><span>출발 → 행선지</span><span>Tier</span><span>최근 갱신</span></div>
  <div class="xrs" data-xlist>${TR.items.map((it) => transferRow(it, { wide: true })).join('')}</div>
  <div class="empty-s" data-xempty hidden><span class="empty__n" aria-hidden="true">0</span><p><b>조건에 맞는 이적이 없어요</b>Tier 1·2, 협상·합의 단계 기사는 아직 없어요 <button class="tlink" type="button" data-xreset>필터 해제</button></p></div>
  <p class="src-note">단계는 기사 제목의 표현으로 분류하고, 루머는 보도 형식 그대로 실어요. 출발 팀은 기사에 있을 때만 쓰고, 한국 선수의 소속 팀은 '소속' 칸에 따로 적어요</p>
</section>
</main>
</div>
</div>`;

/* ══════════════ 화면 4 — 마이 · 온보딩 · 검색 ══════════════ */
const MY = D.my;
const fxMap = new Map();
for (const t of MY.teams) for (const m of t.upcoming) {
  const e = fxMap.get(m.matchId) || { m, why: new Set() };
  e.why.add(t.team.nameKo);
  fxMap.set(m.matchId, e);
}
for (const p of MY.players) {
  const pl = P[p.slug];
  for (const m of pl.upcoming || []) {
    const e = fxMap.get(m.matchId) || { m, why: new Set() };
    e.why.add(p.nameKo);
    fxMap.set(m.matchId, e);
  }
}
const myFx = [...fxMap.values()].sort((a, b) => a.m.kickoff.utc.localeCompare(b.m.kickoff.utc));
const whyHtml = (e) => [...e.why].map((w) => `<b>${esc(w)}</b>`).join(' · ');
const myRecent = MY.teams.flatMap((t) => t.recent.map((r) => ({ r, t }))).sort((a, b) => b.r.kickoff.utc.localeCompare(a.r.kickoff.utc));
const recentRow = ({ r, t }) => `<li><span class="rs__d">${tm(r.kickoff, '', md(r.kickoff))}</span><div class="rs__b"><p class="rs__t">${badge(t.team.slug)}<span>${esc(t.team.nameKo)}</span></p><p class="rs__o">${ftab(r.comp.id)}<span>vs ${esc(r.opponent.nameKo)}</span></p></div>${resCell(r, { gl: false, ctx: `${t.team.nameKo} ${md(r.kickoff)} 경기` })}</li>`;
const followRows = [
  ...MY.teams.map((t) => ({ id: 't:' + t.team.slug, name: t.team.nameKo, pre: badge(t.team.slug, 's'), sub: `${COMP[t.standing.comp].shortKo} ${t.standing.pos}위` })),
  ...MY.players.map((p) => ({ id: 'p:' + p.slug, name: p.nameKo, pre: arm(), sub: p.team.nameKo })),
];
const mgList = `<ul class="mg" aria-label="팔로우 목록">
  <li class="mg__h"><span>팀 ${n(MY.teams.length)}</span><span>선수 ${n(MY.players.length)}</span></li>
  ${followRows.map((f) => `<li><span class="mg__n">${f.pre}<span>${esc(f.name)}</span><small>${esc(f.sub)}</small></span>${followBtn('on', f.name, f.id, { icon: true })}</li>`).join('')}
</ul>`;
const myNewsCards = MY.news.latestIssue.cards;
const onb = D.onboarding;
const [step1, step2, step3] = onb.steps;
const s1opts = step1.options.map((o) => `<label class="ob__o"><input type="checkbox" name="ob-l" value="${o.id}"${step1.sampleSelected.includes(o.id) ? ' checked' : ''}>${ftab(o.id)}<span>${esc(o.nameKo)}</span><span class="pos-n">${o.teamCount}팀</span></label>`).join('');
const s2opts = step2.byLeague
  .map((g) => {
    const first = g.teams.slice(0, 6);
    return `<div><p class="ob__lg">${ftab(g.comp.id)}<span>${esc(g.comp.nameKo)}</span><span class="note ob__lg-r">현재 순위 순</span></p><div class="ob__opts">${first
      .map((t) => `<label class="ob__o"><input type="checkbox" name="ob-t" value="${t.slug}"${step2.sampleSelected.includes(t.slug) ? ' checked' : ''}>${badge(t.slug)}<span>${esc(t.nameKo)}</span>${t.hasKorean ? arm() : ''}<span class="pos-n">${t.pos}위</span></label>`)
      .join('')}</div><p class="ob__more"><span class="note">${g.teams.length}팀 중 ${first.length}</span><button class="tlink" type="button">${g.teams.length}팀 모두 ${icS('down')}</button></p></div>`;
  })
  .join('');
const s3opts = step3.options.map((o) => `<label class="ob__o"><input type="checkbox" name="ob-p" value="${o.slug}"${step3.sampleSelected.includes(o.slug) ? ' checked' : ''}><span>${esc(o.nameKo)}</span><span class="pos">${esc(o.position)}</span><span class="note">${esc(o.team.nameKo)}</span>${o.state.label ? `<span class="state">${esc(o.state.label)}</span>` : ''}</label>`).join('');
const obStep = (no, cls, title, sub, status, body, open) => `<div class="ob__step ${cls}">
  <button class="ob__hd" type="button" aria-expanded="${open}" aria-controls="ob-b${no}"><span class="ob__no n" aria-hidden="true">${no}</span><span class="ob__t"><b><span class="sr">${no}단계 </span>${title}</b><span>${sub}</span></span><span class="ob__s">${status}${icS('down', 18)}</span></button>
  <div class="ob__bd" id="ob-b${no}"${open ? '' : ' hidden'}>${body}</div>
</div>`;
const onboarding = `<section class="ob" aria-labelledby="ob-h">
  <div class="ob__h"><p id="ob-h">내 명단 만들기</p><span class="note">팔로우는 이 기기에만 저장돼요 · 마이에서 언제든 바꿀 수 있어요</span></div>
  ${obStep(1, 'is-done', '리그', '보고 싶은 리그', `<span>${step1.sampleSelected.length}개 ✓</span>`, `<div class="ob__opts">${s1opts}</div>`, false)}
  ${obStep(2, 'is-cur', '팀', `최대 ${step2.max} · 고른 리그의 현재 순위 순`, `<span><span class="n">${step2.sampleSelected.length}</span> / <span class="n">${step2.max}</span></span>`, `<div class="ob__opts--2 ob__opts">${s2opts}</div>`, true)}
  ${obStep(3, 'is-todo', '한국 선수', `등록 ${step3.options.length}명`, `<span><span class="n">${step3.sampleSelected.length}</span>명</span>`, `<div class="ob__opts ob__opts--2">${s3opts}</div>`, false)}
  <div class="ob__f"><button class="tlink" type="button">건너뛰기</button><span class="ob__cnt">팔로우 <b>${MY.limit.used}</b> / ${MY.limit.max}</span><span class="grp"><button class="btn" type="button">이전</button><button class="btn btn--pri" type="button">다음</button></span></div>
</section>`;

/* 검색 — C 색인 구조(입력 전 가나다 색인 · 리더 점선 + 건수) + 뉴스 행은 A */
const SQ = D.search;
const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const cho = (s) => CHO[Math.floor((s.charCodeAt(0) - 0xac00) / 588)];
const idxPlayers = step3.options.slice().sort((a, b) => a.nameKo.localeCompare(b.nameKo, 'ko'));
const byCho = {};
for (const p of idxPlayers) (byCho[cho(p.nameKo)] ||= []).push(p);
const pHref = (slug) => (slug === 'kim-min-jae' ? '#s1b' : `${BP}/korean-players/${slug}/`);
function indexPage() {
  return `<div class="gix">
  <p class="gix__k">색인 — 한국 선수 <span class="n">${idxPlayers.length}</span> · 선수·팀·감독은 한글·영문 이름으로 찾아요</p>
  <div class="gix__cols">${Object.entries(byCho)
    .map(([k, ps]) => `<div class="gix__g"><p class="gix__l" aria-hidden="true">${k}</p><ul aria-label="${k}">${ps.map((p) => `<li><a href="${pHref(p.slug)}"><span class="gix__n">${esc(p.nameKo)}</span><span class="lead" aria-hidden="true"></span><span class="gix__en" lang="en">${esc(p.nameEn)}</span></a></li>`).join('')}</ul></div>`)
    .join('')}</div>
</div>`;
}
const zeroHtml = (q) => `<div class="sx-empty"><span class="empty__n" aria-hidden="true">0</span><p><b>“<span lang="en">${esc(q)}</span>” 결과가 없어요</b>선수 · 팀은 한글이나 영문 이름으로, 뉴스는 제목과 태그로 찾아요</p></div>`;
const plInner = (p) => `${arm()}<span class="sres__n">${esc(p.nameKo)}</span><span class="sres__en" lang="en">${esc(p.nameEn)}</span><span class="lead" aria-hidden="true"></span><span class="sres__x">${badge(p.team.slug)}${esc(p.team.nameKo)} · ${esc(p.position)}</span>`;
const tmInner = (x) => `${badge(x.slug, 's')}<span class="sres__n">${esc(x.nameKo)}</span><span class="lead" aria-hidden="true"></span><span class="sres__x">${esc(x.reasonLabel ?? '이름 일치')}</span>`;
const grpH = (id, h, cnt, tag = 'h2') => `<${tag} class="sres__h" id="${id}"><span>${h}</span><span class="lead" aria-hidden="true"></span><b class="n">${cnt}</b></${tag}>`;
function searchPage(q, idp, o = {}) {
  if (q.isEmpty) return zeroHtml(q.q);
  const lim = o.lim ?? 3;
  const c = q.counts;
  const pl = q.players.map((p) => `<li><a class="sres__a" href="${pHref(p.slug)}">${plInner(p)}</a></li>`).join('');
  const tmz = q.teams.map((x) => `<li><a class="sres__a" href="${BP}/teams/${x.slug}/">${tmInner(x)}</a></li>`).join('');
  const nw = q.news.top10.slice(0, lim).map((x) => newsRow(x.id, { p: `${idp}n`, small: true })).join('');
  const g = (k, h, cnt, body, zero) => `<section class="sres__g" id="${idp}-${k}" aria-labelledby="${idp}-${k}-h">${grpH(`${idp}-${k}-h`, h, cnt, o.tag || 'h2')}${cnt ? body : `<p class="sx-0">${zero}</p>`}</section>`;
  return `<div class="sres">${g('p', '선수', c.players, `<ul>${pl}</ul>`, '일치하는 선수가 없어요')}${g('t', '팀', c.teams, `<ul>${tmz}</ul>`, '일치하는 팀이 없어요')}${g('n', '뉴스', c.news, `<div class="nrs sx-nw">${nw}</div>${c.news > lim ? `<p class="more"><span class="note">한국어 ${c.newsKo} · 영문 ${c.newsEn} · 대표 출처 시각 최신순</span><a class="tlink" href="${BP}${esc(q.path)}">뉴스 ${c.news}건 모두 ${IC.right}</a></p>` : ''}`, '관련 뉴스가 아직 없어요')}</div>`;
}
/* 오버레이 listbox — role=group 안에 role=option만. 뉴스 옵션 = A 뉴스 행 문법(분류 도장 · 태그 · 원제목 · 출처 · 상대 시각) */
function newsOpt(id, oid) {
  const c = C[id];
  const latin = c.lang !== 'ko';
  const tags = c.tags.map((t) => `<span${t.korean ? ' class="kr"' : ''}>${esc(t.label)}</span>`).join('');
  return `<a class="sres__a sres__a--n" id="${oid}" role="option" aria-selected="false" href="${esc(c.lead.u)}" target="_blank" rel="noopener"><span class="nr__tg"><span class="stamp">${esc(c.catLabel)}</span>${tags ? `<span class="tags">${tags}</span>` : ''}</span><span class="sres__t${latin ? ' is-latin' : ''}" lang="${c.lang}">${titleText(c)}</span><span class="nr__m"><span class="src"${srcLang(c.lead.n)}>${esc(c.lead.n)}</span><span class="rel">${esc(c.lead.rel)}</span><span class="abs n">${esc(c.lead.at.short)}</span></span></a>`;
}
function listboxHtml(q, i) {
  const c = q.counts;
  if (q.isEmpty) return { lb: '', after: zeroHtml(q.q) };
  const opt = (id, href, inner) => `<a class="sres__a" id="${id}" role="option" aria-selected="false" href="${href}">${inner}</a>`;
  const g = (k, h, cnt, body) => (cnt ? `<div class="sres__g" role="group" aria-labelledby="ov${i}-${k}-h">${grpH(`ov${i}-${k}-h`, h, cnt, 'div')}${body}</div>` : '');
  const lb =
    g('p', '선수', c.players, q.players.map((p, j) => opt(`ov${i}-p${j}`, pHref(p.slug), plInner(p))).join('')) +
    g('t', '팀', c.teams, q.teams.map((x, j) => opt(`ov${i}-t${j}`, `${BP}/teams/${x.slug}/`, tmInner(x))).join('')) +
    g('n', '뉴스', c.news, q.news.top10.slice(0, 3).map((x, j) => newsOpt(x.id, `ov${i}-n${j}`)).join(''));
  const zeros = [c.players ? '' : '선수', c.teams ? '' : '팀', c.news ? '' : '뉴스'].filter(Boolean);
  const after = `<p class="sres__more">${zeros.length ? `${zeros.join(' · ')} 0건 · ` : ''}선수 <span class="n">${c.players}</span> · 팀 <span class="n">${c.teams}</span> · 뉴스 <span class="n">${c.news}</span>${c.news > 3 ? ` (상위 <span class="n">3</span>)` : ''} — <a class="tlink" href="#s4c">전체 결과 보기</a></p>`;
  return { lb, after };
}
const QDATA = {};
[...SQ.queries, SQ.empty].forEach((q, i) => (QDATA[q.q.toLowerCase()] = listboxHtml(q, i)));
const qKim = SQ.queries.find((q) => q.q === '김민재');
const qJ = SQ.queries.find((q) => q.q === '정우영');
const preQ = `<p class="sov__pre"><span class="sov__pre-k">시안 — 준비된 질의</span>${[...SQ.queries, SQ.empty].map((q) => `<button class="chip qchip" type="button" data-q="${esc(q.q)}"${/^[\x00-\x7F ]+$/.test(q.q) ? ' lang="en"' : ''}>${esc(q.q)}</button>`).join('')}</p>`;
const overlay = `<div class="sov-w" data-sov hidden>
  <div class="sov-bd" data-sov-close></div>
  <div class="sov" role="dialog" aria-modal="true" aria-labelledby="sov-h">
    <h2 class="sr" id="sov-h">검색</h2>
    <div class="sov__bar">${IC.search}<label class="sr" for="sov-q">검색어</label><input id="sov-q" type="search" role="combobox" aria-expanded="false" aria-controls="sov-r" aria-autocomplete="list" autocomplete="off" placeholder="이름 · 팀 · 기사 제목" data-sov-q><button class="ibtn" type="button" data-sov-close aria-label="검색 닫기">${IC.close}</button></div>
    <div class="sov__body">
      <div class="sov__idx" data-sov-idx>${indexPage()}</div>
      <div class="sres sov__lb" id="sov-r" role="listbox" aria-label="검색 결과" data-sov-r hidden></div>
      <div class="sov__after" data-sov-after aria-live="polite"></div>
      ${preQ}
    </div>
    <p class="ov__f" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd>이동</span><span><kbd>Enter</kbd>열기</span><span><kbd>Esc</kbd>닫기</span><span><kbd>/</kbd>열기</span></p>
  </div>
</div>`;

const myAdmE = myFx[0];
const screen4 = `
${divider('s4', '화면 4 · 마이', '/my/', 'AB', 'A 내 명단 — 다음 경기(경기 id로 합침, 첫 경기 = B 입장권) · 최근 결과(팀 기준 W/D/L + 팀 득점 먼저 + 홈/원정) · 내 팀 소식. 관리 = 1024+ 목차 열 · B 팔로우 버튼(아이콘형, 한도 5 이유 문장). 팔로우 5 = 시안 표본(팀 3 + 선수 2)')}
<div class="shell">
<div class="layout layout--y">
<main class="page">
<section aria-labelledby="my-h">
  <header class="pg-h">
    <p class="pg-k"><span>팔로우 ${n(MY.limit.used)} · 이 기기에만 저장</span>${rh('MY REGISTER')}</p>
    <h1 id="my-h">마이</h1>
    <p class="pg-s">팀 ${MY.sample.teams.map((s) => esc(tName(s))).join(' · ')} · 선수 ${MY.sample.players.map((s) => esc(P[s].nameKo)).join(' · ')}</p>
  </header>
  <div class="mx">
  <section class="sec" aria-labelledby="my-fx-h">
    ${secH('my-fx-h', '다음 경기', 'FIXTURES')}
    <p class="sub">KST · 홈 팀 먼저 · 팔로우가 겹치는 경기는 한 번만</p>
    <div class="adm-w">${admission(myAdmE.m, { id: 'my-adm', ics: 'my-ics', why: whyHtml(myAdmE) })}</div>
    <ol class="fxs fxs--after">${myFx.slice(1, 5).map((e) => fxRow(e.m, whyHtml(e))).join('')}</ol>
    <p class="more"><span class="note">${myFx.length}경기 중 5</span><a class="tlink" href="${BP}/my/#fixtures">모두 보기 ${IC.right}</a></p>
  </section>
  <section class="sec" aria-labelledby="my-rs-h">
    ${secH('my-rs-h', '최근 결과', 'RESULTS')}
    <p class="sub">팔로우 팀 기준 — 팀 득점 먼저</p>
    <ol class="rs">${myRecent.slice(0, 6).map(recentRow).join('')}</ol>
  </section>
  </div>
  <section class="sec" aria-labelledby="my-nw-h">
    ${secH('my-nw-h', '내 팀 소식', 'MY NEWS')}
    <p class="sub">제 ${MY.news.latestIssue.issueNo}호 · ${MY.news.latestIssue.count}건 — 카드 메타 끝 굵은 글자가 걸린 팔로우</p>
    <div class="nrs">${myNewsCards.slice(0, 4).map((c) => newsRow(c.id, { p: 'my', why: c.followMatch.map((f) => f.label).join(' · ') })).join('')}</div>
    <p class="more"><span class="note">전 호 합계 ${MY.news.allIssues.count}건</span><a class="tlink" href="${BP}/news/?mine=1">${MY.news.latestIssue.count}건 모두 ${IC.right}</a></p>
  </section>
</section>
</main>
<nav class="contents mgc" aria-label="팔로우 관리">
  ${secH('my-mg-h', '내 명단', 'MY REGISTER')}
  <p class="my-cnt"><span class="n">${MY.limit.used}</span><small> / ${MY.limit.max}</small></p>
  ${mgList}
  <p class="lim" id="fol-lim">팔로우는 <b>${MY.limit.max}</b>개까지예요 — 하나를 풀면 더할 수 있어요</p>
  <div class="tools">
    <button class="btn" type="button" aria-describedby="exp-ph">${icS('link', 18)}<span>내보내기 — 주소 복사</span></button>
    <button class="btn" type="button" aria-describedby="exp-ph"><span>가져오기</span></button>
    ${blank(MY.exportImport, { short: true, id: 'exp-ph', title: '내보내기 · 가져오기', after: `<p class="blank__r">상태: ${MY.exportImport.states.map(esc).join(' / ')}</p>` })}
    <button class="btn" type="button" aria-describedby="my-ics">${icS('cal', 18)}<span>팀 일정 .ics 묶음</span></button>
    ${blank({ reason: clean(MY.icsBundle.reason), fillStage: MY.icsBundle.fillStage }, { short: true, id: 'my-ics', title: '.ics' })}
  </div>
</nav>
</div>
</div>

${divider('s4b', '화면 4 · 첫 방문 온보딩', '/ (첫 방문 · 팔로우 0)', 'A', 'A 번호 1·2·3 체크 목록 — 완료 = 실선 숫자 + ✓ · 현재 = 레드 · 다음 = --ink-2 윤곽(숫자 상태 규칙과 같은 문법). 진입 = 홈 5줄 바로 아래 한 줄(첫 방문 + 팔로우 0일 때만, 모달 없음 — 375 첫 화면 5줄 4줄 유지)')}
<div class="shell">
<div class="layout">
<div class="contents">${omit('목차 — D0 그대로')}</div>
<main class="page">
  ${omit('오늘의 5줄 — D0 그대로. 진입 줄은 5줄 바로 아래')}
  <div class="entry" aria-label="온보딩 진입 줄">
    <span class="entry__n n" aria-hidden="true">1·2·3</span>
    <div class="entry__b"><p class="entry__t">내 명단 만들기<span>리그 → 팀 → 한국 선수 · 건너뛸 수 있어요</span></p><span class="entry__a"><button class="btn btn--pri" type="button" aria-controls="ob-h">시작</button><button class="tlink" type="button">다음에</button></span></div>
  </div>
  <div class="ob-w">${onboarding}</div>
</main>
</div>
</div>

${divider('s4c', '화면 4 · 검색', '오버레이 · /search/?q=김민재', 'CA', 'C 색인 — 입력 전 = 한국 선수 가나다 색인, 입력 후 = 유형 묶음(리더 점선 + 건수) · combobox + listbox(↑↓ Enter Esc, 포커스 가둠). 뉴스 행 = A(분류 도장 · 태그 · 출처 · 상대 시각). 마스트헤드 검색 · / · ⌘K로 연다. 결과 없음은 글자만(일러스트 D3)')}
<div class="shell">
<div class="layout">
<nav class="contents" aria-label="검색 결과 유형">
  ${secH('sx-ix-h', '결과', 'RESULTS')}
  <ul class="toc-ix">
    <li><a class="ix-row" href="#sp-p"><span class="ix-l">선수</span><span class="lead" aria-hidden="true"></span><span class="n">${qKim.counts.players}</span></a></li>
    <li><a class="ix-row" href="#sp-t"><span class="ix-l">팀</span><span class="lead" aria-hidden="true"></span><span class="n">${qKim.counts.teams}</span></a></li>
    <li><a class="ix-row" href="#sp-n"><span class="ix-l">뉴스</span><span class="lead" aria-hidden="true"></span><span class="n">${qKim.counts.news}</span></a></li>
  </ul>
</nav>
<main class="page">
  <section aria-labelledby="sx-h">
    <header class="pg-h">
      <p class="pg-k"><span>검색</span>${rh('INDEX')}</p>
      <h1 id="sx-h">“${esc(qKim.q)}” 색인</h1>
    </header>
    <form class="sfield" role="search" action="${BP}/search/" onsubmit="return false"><label class="sr" for="sp-q">검색어</label>${IC.search}<input id="sp-q" name="q" type="search" value="${esc(qKim.q)}" autocomplete="off"><button class="btn" type="submit">찾기</button></form>
    <p class="pg-s sfield__s">선수 ${n(qKim.counts.players)} · 팀 ${n(qKim.counts.teams)} · 뉴스 ${n(qKim.counts.news)} — 영문 이름(<span lang="en">Kim Min-jae</span>)도 같은 항목으로 모여요</p>
    ${searchPage(qKim, 'sp', { lim: 3 })}
  </section>
  <div class="grid2 sx-frames">
    <figure class="frame"><figcaption class="cap"><b>오버레이 · 입력 전</b>책 뒤 색인 — 한국 선수 가나다. 마스트헤드 검색 버튼으로 실제 오버레이를 열 수 있어요</figcaption>
      <div class="sov sov--static" aria-label="검색 오버레이 입력 전 견본"><div class="sov__bar">${IC.search}<span class="sov__in" aria-hidden="true">이름 · 팀 · 기사 제목</span><span class="sov__kbd"><kbd>Esc</kbd></span></div>${indexPage()}</div></figure>
    <div class="sx-side">
      <figure class="frame"><figcaption class="cap"><b>뉴스 0건 묶음</b>“${esc(qJ.q)}” — 선수 · 팀은 있고 뉴스는 0(빈 묶음도 머리는 남긴다)</figcaption>${searchPage(qJ, 'sj', { tag: 'h3' })}</figure>
      <figure class="frame"><figcaption class="cap"><b>결과 없음</b>“<span lang="en">${esc(SQ.empty.q)}</span>” — 원장의 컵 상대 원문 이름. 사전·팀·카드 어디에도 없어요</figcaption>${zeroHtml(SQ.empty.q)}</figure>
    </div>
  </div>
</main>
</div>
</div>`;

/* ══════════════ 홈 위젯 (A) ══════════════ */
const H = D.home;
function kcRow(r) {
  return `<li><div>${gut(r)}</div><div><p class="kc__n"><a href="${BP}/korean-players/${r.player}/">${esc(r.nameKo)}</a></p><p class="kc__t">${badge(r.team.slug)}<span>${esc(r.team.nameKo)} vs ${esc(r.opponent.name)}</span></p></div><div class="kc__r">${resCell(r, { ctx: `${r.nameKo} 경기` })}</div></li>`;
}
const today = H.koreanChips.today;
const kcToday = `<section class="sec" aria-labelledby="KCID">
  ${secH('KCID', '어젯밤 한국 선수', 'KOREANS', 'h2', true)}
  <p class="sub">${esc(today.window.from.dayShort)} 현지 경기 · 제 ${today.issueNo}호</p>
  <div class="kc__0"><span class="min v-zero" aria-hidden="true">${today.appearedCount}</span><p>출전 ${today.appearedCount}명<span>명단 ${today.rowCount}명</span></p></div>
  <ol class="kc">${today.rows.map(kcRow).join('')}</ol>
  <a class="tlink" href="#s1">한국 선수 ${D.players.counts.total}명 ${IC.right}</a>
</section>`;
const hot = H.transferHotList;
const hotTarget = (it) => {
  const tr = TR.items.find((x) => x.id === it.id);
  return tr && tr.history.length + (tr.auxiliaryCards ? tr.auxiliaryCards.ids.length : 0) > 1 ? `#xt-${it.leadCardId}` : `#x-${it.id}`;
};
const hlRow = (it) => `<li><div class="hl__s0">${stg(it.status)}</div><div class="hl__r">${tier(it.bestTier)}${tm({ utc: C[it.leadCardId].lead.at.utc }, '', it.updated.short.slice(0, 5))}</div>${
  it.playerName
    ? `<p class="hl__a"><a class="hl__go" href="${hotTarget(it)}"><span class="hl__nm">${esc(it.playerName)}</span>${it.registeredKorean ? arm() : ''}${it.to ? `<span class="ar" aria-hidden="true">→</span><span class="sr">행선지 </span>${badge(it.to.slug)}<span>${esc(it.to.nameKo)}</span>` : ''}<span class="sr"> — 이적 타임라인의 최근 기사로</span></a></p>`
    : `<p class="hl__s nr__t">${titleLink(C[it.leadCardId])}</p>`
}</li>`;
const hotList = `<section class="sec" aria-labelledby="HLID">
  ${secH('HLID', '이적 핫 리스트', 'TRANSFERS', 'h2', true)}
  <p class="sub">상태가 바뀐 이적 · 최근 갱신 순 · ${hot.count}건</p>
  <ol class="hl">${hot.items.map(hlRow).join('')}</ol>
  <a class="tlink" href="#s3">이적 ${IC.right}</a>
</section>`;
const nt = H.nationalTeam;
const ntSec = `<section class="sec" aria-labelledby="nt-h">
  ${secH('nt-h', 'A매치', 'NATIONAL TEAM', 'h2', true)}
  <p class="sub">A매치 기간에만 보여요</p>
  <div class="nt-ph">
    ${blank(nt.schedule, { title: '일정 · 결과', short: true })}
    ${blank(nt.squad, { title: '소집 선수', short: true })}
  </div>
  <div class="nrs">${nt.news.ids.slice(0, 3).map((id) => newsRow(id, { p: 'hnt', small: true })).join('')}</div>
  <a class="tlink" href="${BP}/national-team/">대표팀 소식 ${nt.news.count}건 ${IC.right}</a>
</section>`;
const myNews = `<section class="sec" aria-labelledby="hmn-h">
  ${secH('hmn-h', '내 팀 소식', 'MY NEWS', 'h2', true)}
  <p class="sub">제 ${ISSUE.no}호 · ${H.myTeamNews.count}건</p>
  <div class="nrs">${H.myTeamNews.cards.slice(0, 3).map((c) => newsRow(c.id, { p: 'hmn', small: true, why: c.followMatch.map((f) => f.label).join(' · ') })).join('')}</div>
  <a class="tlink" href="#s4">${H.myTeamNews.count}건 모두 · 마이 ${IC.right}</a>
</section>`;
const screen5 = `
${divider('s5', '홈 위젯', '/', 'AC', 'A — PRD §4.2 순서 2 내 팀 소식 · 3 A매치 · 4 한국 선수 · 7 이적 핫 리스트. 1280 = 마주 보는 면(오늘 밤 → 한국 선수 → 순위 → 이적), 1279 이하 = 지면 안 같은 순서 · 핫 리스트 이름 → C 타임라인 항목 도착(:target) · 제 20호 실데이터(출전 0명 날 — 윤곽 0)')}
<div class="shell">
<div class="layout layout--3">
<div class="contents">${omit('목차 — D0 그대로')}</div>
<div class="page">
  ${omit('오늘의 5줄 — D0 그대로')}
  ${myNews}
  ${ntSec}
  <div class="in-flow">${kcToday.replace(/KCID/g, 'kc1-h')}
  ${omit('오늘 밤 볼 경기 · 주요 뉴스 — D1 · D0 그대로')}
  ${hotList.replace(/HLID/g, 'hl1-h')}</div>
</div>
<aside class="facing" aria-label="마주 보는 면">
  ${omit('오늘 밤 볼 경기 — D1 그대로')}
  ${kcToday.replace(/KCID/g, 'kc2-h')}
  ${omit('리그 순위 미니 — D1 그대로')}
  ${hotList.replace(/HLID/g, 'hl2-h')}
</aside>
</div>
</div>`;

/* ══════════════ 견본 ══════════════ */
const SP = D.specimens;
const apStates = SP.appearance.states;
const apRow = (s) => {
  if (s.status === 'sub') {
    const e = s.examples[0];
    return `<li><div>${gut({ appeared: true, minutes: e.minutes, status: 'sub', statusLabel: e.statusLabel })}</div><p class="ap__t"><b>${esc(e.nameKo)}</b> vs <span>${esc(e.opponent.name)}</span><span class="note"> · ${esc(e.kickoff.short)} · 집계 시작 전 경기</span></p></li>`;
  }
  if (s.status === 'unknown') return `<li><div><span class="min v-null" aria-hidden="true">–</span><span class="st" aria-hidden="true">라인업 없음</span><span class="sr">라인업 없음</span></div><p class="ap__t"><b>출전 여부 모름</b><span class="note"> — 0으로 세지 않아요</span></p></li>`;
  const r = s.example;
  return `<li><div>${gut(r)}</div><p class="ap__t"><b>${esc(r.nameKo || (r.player && P[r.player]?.nameKo) || r.team?.name || '')}</b> vs <span>${oppName(r.opponent)}</span><span class="note"> · ${esc(r.kickoff.short)}</span></p></li>`;
};
const comboTable = (() => {
  const rows = ['rumor', 'negotiating', 'agreed', 'official', 'collapsed']
    .map((s) => {
      const cells = [1, 2, 3]
        .map((t) => {
          const c = TR.stageTierSpecimen.combos.find((x) => x.status === s && x.tier === t);
          const real = c.realItem ? TR.items.find((x) => x.id === c.realItem) : null;
          return `<td><span class="cell-n">${tier(t)}${real ? `<span class="real">실례 <b>${esc(real.playerName || '이름 표기 전')}</b></span>` : ''}</span></td>`;
        })
        .join('');
      return `<tr><th scope="row">${stg(s)}</th>${cells}</tr>`;
    })
    .join('');
  return `<table class="stx"><caption class="sr">이적 단계 5종 × 출처 Tier 3종</caption><thead><tr><th scope="col">단계</th><th scope="col">Tier 1</th><th scope="col">Tier 2</th><th scope="col">Tier 3</th></tr></thead><tbody>${rows}</tbody></table>`;
})();
const fs0 = SP.follow.states;
const ps = SP.playerStates;
const fb = ps.fallback;
const npRows = ['notLinked', 'otherLeague'].map((k) => listRow(P[ps[k].slug])).join('');
const prof = SP.teamProfile;
const ntp = SP.nationalTeamPage;
const busy = H.koreanChips.busySpecimen;
const bayern = T['bayern-munchen'].badge;
const fxScore = PD.upcoming[0];
const specimens = `
${divider('s6', '견본', '상태 · 변형', 'ABC', '숫자 상태 규칙(B) · 출전 상태 5종 · 스코어 표기 맥락 규칙 · 결과 가림 칸 · 팔로우 3상태(B) · 이적 단계 5 × Tier 3 · 타임라인 노드 2종(C) · 자리 조형 3종(C) · 선수 상태 · 팀 한줄평 자리 · /national-team · 창 모드 · 붐비는 날')}
<div class="shell">
<section class="spec" aria-labelledby="sp-h">
  ${secH('sp-h', '견본 — 한국 선수 · 이적 · 마이', 'SPECIMENS')}
  <div class="spec-grid">
    <figure class="frame"><figcaption class="cap"><b>숫자 상태 규칙</b>24px 이상 큰 숫자 — 실선 = 값 있음(출전) · 윤곽 = 0 · 미출전 · 대시 = 값 없음. 상태 글자를 늘 함께 쓴다. 표 안 작은 숫자(18px 이하)의 0은 윤곽 대신 --ink-2</figcaption>
      <div class="nsr">
        <div><span class="big v-on" aria-hidden="true">45<small>분</small></span><p><b>선발</b> 45분</p></div>
        <div><span class="big v-zero" aria-hidden="true">0<small>분</small></span><p><b>벤치 · 미출전</b></p></div>
        <div><span class="big v-null" aria-hidden="true">–</span><p><b>명단 제외</b> 값 없음</p></div>
      </div></figure>
    <figure class="frame"><figcaption class="cap"><b>출전 상태 5종</b>거터 = 분 + 상태 글자. 교체는 원장에 아직 없어 집계 시작 전 경기로만 · 라인업 없음은 0으로 세지 않는다</figcaption>
      <ol class="kc ap">${apStates.map(apRow).join('')}</ol></figure>
    <figure class="frame"><figcaption class="cap"><b>스코어 표기 — 맥락 규칙</b>선수 · 팀 기준 행 = W/D/L + 기준 팀 득점 먼저 + 홈/원정 글자. 경기 기준 행(일정 · 오늘 밤 · 라운드) = 홈 팀 먼저(D1 그대로). 칩이 늘 스코어 앞이라 두 순서가 섞여 보이지 않는다</figcaption>
      <p class="spx-k">선수 기준 — 김민재 · 바이에른 뮌헨 득점 먼저</p>
      <ol class="lgs">${logRow(PD.log5[1])}</ol>
      <p class="spx-k">경기 기준 — 홈 팀 먼저</p>
      <ol class="fxs">${fxRow(fxScore)}</ol></figure>
    <figure class="frame"><figcaption class="cap"><b>결과 가림 칸</b>결과 가리기 켬 — W/D/L · 스코어 · 골 · 도움을 빗금 칸(--hatch) 하나로 가리고 "보기"(44px). 홈/원정 · 출전 상태 · 분은 결과가 아니라 남긴다. 펼치면 그 칸만 찍힘으로 드러난다</figcaption>
      <ol class="lgs spo-demo">${PD.log5.slice(0, 3).map((r) => logRow(r)).join('')}</ol>
      <ol class="kc spo-demo">${busy.rows.slice(0, 1).map(kcRow).join('')}</ol></figure>
    <figure class="frame"><figcaption class="cap"><b>팔로우 버튼 3상태</b>꺼짐 = 1px 잉크 + 책갈피 · 켜짐 = 반전 + ✓ + "팔로우 중"(aria-pressed) · 한도 5 = 점선 비활성 + 이유 문장. 누르면 미니 스텁이 접힌다(200ms). 자리: 선수 머리 · 팀 티켓 오른쪽 위 · /my 관리(아이콘형)</figcaption>
      <div class="fl-row">${followBtn('off', fs0[0].example.nameKo, 'spec-off')}<span class="note">${esc(fs0[0].example.nameKo)} — 꺼짐</span></div>
      <div class="fl-row">${followBtn('on', fs0[1].example.nameKo, 'spec-on')}<span class="note">${esc(fs0[1].example.nameKo)} — 켜짐</span></div>
      <div class="fl-row">${followBtn('limit', '여섯 번째 항목', 'spec-lim', { desc: 'spec-lim-n' })}<p class="fol-help" id="spec-lim-n">팔로우는 <b>5개</b>까지예요 — 마이에서 하나를 풀면 더할 수 있어요</p></div>
      <div class="fl-row">${followBtn('on', '아스널', 'spec-icon', { icon: true })}<span class="note">아이콘형 — /my 관리 목록</span></div>
      <div class="tkm" style="--k1:${bayern.k1};--k2:${bayern.k2};--kf:${bayern.kf}"><div class="tkm__stub" aria-hidden="true"><b>${bayern.short}</b></div><span class="tkm__perf" aria-hidden="true"></span><div class="tkm__b"><b>바이에른 뮌헨</b>${followBtn('on', '바이에른 뮌헨', 'spec-team')}</div></div>
      <p class="note">D1 팀 티켓 몸통 오른쪽 위 — 축소 견본</p></figure>
    <figure class="frame"><figcaption class="cap"><b>이적 단계 5 × Tier 3</b>펀치 구멍(채운 수 = 단계) + 단계 글자, Tier는 채움 · 실선 · 점선 + 글자. 실데이터는 Tier 3 루머 · 공식 · 결렬뿐</figcaption>${comboTable}</figure>
    <figure class="frame"><figcaption class="cap"><b>타임라인 노드 2종</b>날짜 거터 + 2px 잉크 줄기. 단계 근거 = 단계 색 펀치 노드 + 단계 · Tier, 보조 = 가로 눈금 노드 + "보조 · 단계 없음"(같은 선수의 이적 분류 기사). 핫 리스트에서 오면 항목이 --paper-2 + 왼쪽 4px 레드로 도착</figcaption>
      <ol class="tln tln--spec">${[
        { at: tKim.history[1].at, card: tKim.history[1].card, kind: 'stage', status: 'rumor' },
        { at: C[tKim.auxiliaryCards.ids[0]].lead.at, card: tKim.auxiliaryCards.ids[0], kind: 'aux' },
      ]
        .map((e) => tlItem(e, 'spt'))
        .join('')}</ol></figure>
    <figure class="frame"><figcaption class="cap"><b>자리 조형 3종</b>데이터를 기다리는 칸 = 점선 1.5px --ink-3 + '자리' 도장 + 이유 + 채울 단계. 문단 = 빈 기준선(마지막 줄 짧게), 이름 = 빈 밑줄. 시안 범위 밖(확정 영역)은 '생략' 띠로 따로 쓴다</figcaption>
      ${blank(PD.ics, { title: '상자', short: true })}
      ${blank(prof.oneLiner, { title: '문단 — 빈 기준선', lines: 3, ai: true, gen: true })}
      <p class="spx-name"><i class="slot slot--name" aria-hidden="true"></i><span class="note">이름 — 빈 밑줄(이름 표기 전 이적)</span></p>
      ${omit('확정 영역 — 생략 띠')}</figure>
    <figure class="frame"><figcaption class="cap"><b>선수 상태</b>연결됨(목록) · 기록 연결 전(김지수 — 다음 경기는 있음) · 기타 리그(홍현석 — 갱신 중단, 목록에 남김) · 폴백(실제 결과 · 뉴스 제목만, 분 · 도움 "–")</figcaption>
      <table class="rg rg--c" data-view="recent"><caption class="sr">선수 상태 견본</caption><tbody>${npRows}</tbody></table>
      <ol class="kc">${`<li><div><span class="min v-null" aria-hidden="true">–</span><span class="st" aria-hidden="true">폴백</span><span class="sr">폴백 — 분 정보 없음</span></div><div><p class="kc__n">${esc(fb.nameKo)}<span class="state">폴백</span></p><p class="kc__t">${badge('werder-bremen')}<span>vs ${esc(fb.match.opponent)} · 분 ${esc(fb.match.minutesLabel)} · 도움 ${esc(fb.match.assistsLabel)}</span></p></div><div class="kc__r">${resCell({ ...fb.match, goals: 0, assists: 0 }, { ctx: '폴백 견본 경기' })}</div></li>`}</ol>
      <div class="nrs">${fb.newsCards.slice(0, 1).map((id) => newsRow(id, { p: 'fb', small: true })).join('')}</div></figure>
    <figure class="frame"><figcaption class="cap"><b>팀 한줄평 · 강점/약점 자리</b>D1 팀 티켓 바로 아래, 팀시트 위. 'AI 작성'은 단 머리에 한 번 + 생성 날짜(문단 블록이라 줄마다 붙이지 않는다)</figcaption>
      <div class="tkm" style="--k1:${bayern.k1};--k2:${bayern.k2};--kf:${bayern.kf}"><div class="tkm__stub" aria-hidden="true"><b>${bayern.short}</b></div><span class="tkm__perf" aria-hidden="true"></span><div class="tkm__b"><b>바이에른 뮌헨</b>${followBtn('on', '바이에른 뮌헨', 'spec-team2')}</div></div>
      ${blank(prof.oneLiner, { title: '이번 주 한줄평', lines: 2, ai: true, gen: true })}
      <div class="prof__sw">${['강점', '약점'].map((h, k) => `<div><h4>${h}</h4><ol>${(k ? prof.weaknesses : prof.strengths).map((s, i) => `<li><span class="n">${i + 1}</span><i aria-hidden="true"></i><span class="sr">${esc(s.reason)} 자리</span></li>`).join('')}</ol></div>`).join('')}</div>
      <p class="lgs__cap"><span class="blank__k">자리</span>강점 · 약점 — 채울 단계 <b class="id">${esc(prof.strengths[0].fillStage)}</b> · 아래 팀시트는 D1 그대로</p></figure>
    <figure class="frame"><figcaption class="cap"><b>/national-team 구조</b>${esc(ntp.path)} — 일정 · 명단은 자리, 소식은 실카드. 주요국 A매치 뉴스는 /news/?cat=national 결과와 같다</figcaption>
      <div class="nt-pg"><div class="sec-h sec-h--thin"><h3>대표팀</h3>${rh('NATIONAL TEAM')}</div>
        ${ntp.sections.map((s) => `<div class="nt-s"><p class="nt-s__h"><b>${esc(s.title)}</b>${s.data.count != null ? `<span class="cnt">${s.data.count}</span>` : ''}</p>${s.data.placeholder ? blank(s.data, { short: true }) : s.key === 'krNews' ? `<div class="nrs">${s.data.ids.slice(0, 2).map((id) => newsRow(id, { p: 'ntp', small: true })).join('')}</div>` : `<p class="note">${esc(clean(s.data.rule))} — ${s.data.count}건</p>`}</div>`).join('')}
      </div></figure>
    <figure class="frame"><figcaption class="cap"><b>이적 창 켜짐 · 잠잠</b>창 모드 켜짐 = 머리 줄 반전(날짜는 자리). 잠잠(30일 넘게 갱신 없음) = 행 전체 보조색 + "잠잠" 도장, 목록 아래로 — 실례 없음(가장 오래된 갱신 ${esc(TR.quietSpecimen.oldestUpdate.short)})</figcaption>
      <p class="win win--on"><span class="stamp">이적 창 열림</span><span>홈 이적 섹션이 위로</span><span class="blank-i blank-i--inv"><span class="blank__k">자리</span><b>창 날짜</b><b class="id">${esc(TR.window.dates.fillStage)}</b></span></p>
      <div class="xr xr--quiet" aria-label="잠잠 견본(문구 없음)"><div class="xr__stg">${stg('rumor')}</div><div class="xr__tier"><span class="stamp stamp--q">잠잠</span></div><div class="xr__who"><i class="slot slot--name" aria-hidden="true"></i><span class="note">선수</span></div><div class="xr__rt"><span class="ar" aria-hidden="true">${IC.arrow}</span><i class="slot slot--name slot--s" aria-hidden="true"></i></div><div class="xr__upd"><span>최근 갱신</span><span class="mono">30일 넘음</span></div></div></figure>
    <figure class="frame"><figcaption class="cap"><b>붐비는 날 — 제 ${busy.issueNo}호</b>출전 ${busy.appearedCount}명 · 출전 분 순</figcaption>
      <ol class="kc">${busy.rows.map(kcRow).join('')}</ol></figure>
  </div>
</section>
</div>`;

/* ══════════════ 메타 · 목차 ══════════════ */
const META = {
  name: '혼합안 — A 스쿼드 명단 기반 + B 선수 티켓 + C 주간 지면',
  one: '비교하고 고르는 화면(목록 · 이적 · 마이 · 온보딩 · 홈)은 A 명단 행, 선수가 주인공인 자리(상세 머리 · 다음 경기 입장권 · 팔로우)는 B 티켓, 읽는 화면(주간 리포트 · 이적 타임라인 · 검색 색인 · 자리)은 C 지면 — 괘선 · 머리 · 숫자 크기 단계를 하나로 맞췄다.',
  pros: [
    '375 목록 첫 화면 5명 · 1280 이적 2건(A) 그대로 — 훑고 고르는 화면이 가장 빠르다',
    '선수 상세 머리가 D1 팀 티켓과 짝(B) — 팀 ↔ 선수 이동이 한 식구로 읽힌다. 티켓은 상세 머리 · 입장권 · 팔로우에만 써서 상자 격자가 번지지 않는다',
    '주간 리포트는 한 편의 기사(C) — 총평 단이 MVP 바로 아래, LLM 문단이 들어오면 화면의 중심이 된다. 375는 MVP 점수를 한 줄로 줄여 표를 앞당겼다',
    '숫자 상태(실선 / 윤곽 / 대시) · 결과 칸(W/D/L + 기준 팀 득점 + 홈/원정) · 자리(점선 + 도장)가 모든 화면에서 같은 뜻',
  ],
  cons: [
    '컴포넌트 수가 A 단독보다 많다 — 선수 티켓 · 입장권 · 지면 그리드 · 타임라인 · combobox가 더해진다',
    '선수 상세 1279 이하 순서를 위해 지면 · 옆단을 display: contents로 풀어 order로 섞는다(구현 때 DOM 순서 = 375 순서로 두고 1280에서 옆단을 grid로 빼는 편이 안전)',
    '주간 리포트만 큰 한글 제목(60/112px)을 쓰므로 다른 화면과 머리 크기 차이가 크다 — 의도된 위계지만 DESIGN에 예외로 적어야 한다',
  ],
  diff: '중 — A(서버 표 · 행) 위에 B 선수 티켓 · 입장권 · 팔로우 버튼(스텁 격자 1종 + 키프레임 1개), C 지면 그리드(주간 1화면) · 세로 타임라인 · combobox 검색 오버레이',
  bundle: '폰트 변화 0 — EuroDigest Sans 400·800 + Barlow Condensed 600·800 = 417.8KB(2패밀리 4파일, D0 서브셋 그대로). 새 색 토큰 0. 섬 JS 추정 gzip 약 3.3KB(필터 0.8 · 팔로우 0.6 · 검색 combobox 1.3 · 온보딩 0.4 · 가림 칸 0.2) → 초기 JS 약 147KB / 160KB. Pagefind는 첫 입력 때 지연 로드',
};
const SRC = [
  ['A 기반', '셸 · 한국 선수 목록(명단 표 + 375 보기 탭 + 출전 분 거터 · 1024+ 11열) · 상세 시즌 기록 표 · 1280 옆단(다음 경기 · 이적설 · 대표팀) · 이적 원장 행 + 왼쪽 필터 체크 목록 · /my(다음 경기 경기 id 합침 · 최근 결과 · 관리 열) · 온보딩(1·2·3 체크 목록 + 5줄 아래 진입 줄) · 홈 위젯 · 결과 가림 칸 · 뉴스 행'],
  ['B', '선수 상세 머리 티켓(키트 스텁 + 시즌 출전 시간 큰 숫자 + 팔로우 + 꼬리표 UCL · 이적설 · 대표팀) · 다음 경기 입장권(상세 옆단 세로형 · /my 가로형) · 팔로우 버튼(미니 스텁 접힘 · 한도 비활성 + 이유) · 숫자 상태 규칙 · 주간 표 90분 막대'],
  ['C', '주간 리포트 전체(MVP 머리기사 · MVP 점수 박스 · 총평 단 · 반전 머리 기록 박스 표) · 상세 최근 5경기 로그 행(집계 전 = 대시 + 점선 + 캡션 1줄) · 이적 펼침 세로 타임라인(펀치 노드 / 보조 눈금 노드 · :target 도착) · 검색 색인(입력 전 가나다 · 리더 점선 + 건수 · combobox) · 자리 조형(점선 + 도장 + reason/fillStage · 빈 기준선 · 빈 밑줄)'],
  ['조정', 'C 주간 375 MVP 점수 박스 한 줄 · 제품 화면의 FR ID · 작업 메모 제거(설명 띠로 이동) · 온보딩 다음 단계 윤곽 --ink-2(완료 = 실선) · 다크 키트 면 축소(스텁 키트 높이 52/64px, 3:2 유지) · 생략 띠(확정 영역)와 자리(데이터 대기) 모양 분리'],
  ['결정 반영', '스코어 = 맥락별(선수 · 팀 기준 "W 6-1 · 홈" / 경기 기준 홈 먼저) · 결과 가리기 = W/D/L · 스코어 · 골 · 도움 가림, 출전 상태 · 분 표시 · 타임라인 = 단계 근거 + 보조 노드 · 온보딩 진입 = 5줄 바로 아래 · 팔로우 = 머리 · 팀 티켓 오른쪽 위 · /my · AI 라벨 = 단 머리 한 번 + 생성 날짜'],
];
const RULES = [
  ['간격', '구역 사이 36px(375) · 44px(1024+) — 모든 화면 .sec 하나 · 머리 아래 목록 8px · 행 안쪽 위아래 12/11px'],
  ['괘선', '3px 잉크 = 구역 머리 · 2px 잉크 = 합계 줄 · 1.5px 잉크 = 티켓 테두리(선수 티켓 · 입장권 · 팀 티켓만) · 1px 잉크 = 표 머리 아래 · 목록 시작 · 기록 박스 · 1px --rule = 행 · 2px 점선 --ink-3 = 절취선 · 리더 · 1.5px 파선 --ink-3 = 자리'],
  ['머리', '쪽 머리 = 키커 줄(13px --ink-2 + 영문 러닝 헤드) + h1 32/48px(주간만 MVP 이름 60/112px) · 구역 머리 = 3px 괘선 + h2 21/24px + 러닝 헤드 · 옆단 머리 = 1px 괘선 + 16/17px'],
  ['숫자 크기', 'N1 56/96px(선수 티켓 시즌 분 · MVP 점수) · N2 44/64px(입장권 킥오프) · N3 28/34px(출전 분 거터 · 출전 0명) · N4 20/22px(로그 · 타임라인 · 일정 날짜) · N5 17/18px(표 숫자, 합계 19/20)'],
];
const metaBand = `<aside class="meta-w" aria-label="시안 정보"><details class="meta">
  <summary><span class="meta__tag">D2 혼합안</span><b>${esc(META.name)}</b><span class="meta__one">${esc(META.one)}</span><span class="meta__more" aria-hidden="true"></span></summary>
  <div class="meta__grid">
    <div><p class="meta__h">장점</p><ul>${META.pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div><p class="meta__h">단점</p><ul>${META.cons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div><p class="meta__h">구현 난이도</p><p>${esc(META.diff)}</p><p class="meta__h">번들·폰트 영향</p><p>${esc(META.bundle)}</p></div>
    <div class="span3"><p class="meta__h">혼합 지시(2026-10-31 사용자 결정) → 요소별 출처</p><table class="axes"><thead><tr><th>출처</th><th>가져온 것</th></tr></thead><tbody>${SRC.map((r) => `<tr><th>${esc(r[0])}</th><td class="me">${esc(r[1])}</td></tr>`).join('')}</tbody></table></div>
    <div class="span3"><p class="meta__h">하나의 시스템으로 맞춘 규칙</p><table class="axes"><tbody>${RULES.map((r) => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table></div>
    <div class="span3"><p class="meta__h">데이터</p><p>모든 문구 · 숫자는 docs/design/d2/data/d2-data.json(실데이터)에서. 기준 ${esc(REF.label)}. 원제목 무수정(D23), 뉴스 카드 AI 라벨 없음. 자리는 reason · fillStage 그대로. 마이 팔로우 상태는 시안 표본(scope Q2 ①). 캡처 환경(Linux)에는 한자 글꼴이 없어 원제목의 韓 · 獨 · 西가 빈칸으로 찍힌다(DESIGN §3.7)</p></div>
  </div>
</details></aside>`;
const tocItems = [
  ['s1', '1', '한국 선수 목록', 'A'], ['s1b', '1', '선수 상세 · 김민재', 'BAC'], ['s2', '2', '주간 리포트 W43', 'CB'], ['s3', '3', '이적', 'AC'], ['s4', '4', '마이', 'AB'], ['s4b', '4', '온보딩', 'A'], ['s4c', '4', '검색', 'CA'], ['s5', 'H', '홈 위젯', 'AC'], ['s6', 'S', '견본', 'ABC'],
];
const toc = `<nav class="toc" aria-label="시안 구역"><ol><li><span class="toc__k">구역</span></li>${tocItems.map(([h, k, l, s]) => `<li><a href="#${h}"><span class="n">${k}</span><span>${esc(l)}</span><span class="toc__s" aria-hidden="true">${s}</span></a></li>`).join('')}</ol></nav>`;

const tabbar = `<nav class="tabbar" aria-label="하단 탭"><a href="${BP}/">${IC.home}<span>홈</span></a><a href="${BP}/news/">${IC.news}<span>뉴스</span></a><a href="${BP}/competitions/epl/">${IC.league}<span>리그</span></a><a href="${BP}/korean-players/" aria-current="page">${IC.player}<span>한국 선수</span></a><a href="${BP}/my/">${IC.my}<span>마이</span></a></nav>`;
const colophon = `<div class="shell"><footer class="colophon"><div class="colophon__in"><p class="colophon__brand">유로 다이제스트<span>제 ${ISSUE.no}호 · 2026년 10월 31일 (토)</span></p><p class="colophon__fd" lang="en">Football data provided by the Football-Data.org API</p><p class="colophon__p">경기 기록은 API-Football, 일정·순위는 football-data.org. 기사는 원제목과 원문 링크만 싣는다.</p><nav class="colophon__links" aria-label="바닥글"><a href="${BP}/about/">소개</a><a href="${BP}/about/#ai">AI 작성 안내</a></nav></div></footer></div>`;

const SCRIPT = fs.readFileSync(path.join(HERE, 'mix.js'), 'utf8').replace('__QDATA__', JSON.stringify(QDATA).replace(/</g, '\\u003c'));
const firstComment = `<!--
  D2 시안 혼합안 — 「${META.name}」
  한 줄 설명: ${META.one}
  장점: ${META.pros.join(' / ')}
  단점: ${META.cons.join(' / ')}
  구현 난이도: ${META.diff}
  번들/폰트 영향: ${META.bundle}
  출처: ${SRC.map((r) => r[0] + ' = ' + r[1]).join(' | ')}
  통일 규칙: ${RULES.map((r) => r[0] + ' = ' + r[1]).join(' | ')}
  데이터: docs/design/d2/data/d2-data.json(실데이터) — 기준 ${REF.label}. 문구 생성·LLM 호출 0. 자리 = reason · fillStage.
  생성: docs/design/d2/build-concept-mix/gen.mjs (d2-data.json → 정적 HTML). 외부 의존 0, 폰트는 ../fonts/ 상대 경로.
-->`;
const html = `<!doctype html>
${firstComment}
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>D2 혼합안 · 한국 선수 · 이적 · 마이 팀 · 유로 다이제스트</title>
<script>(function(){var d=document.documentElement,t,s;try{t=localStorage.getItem('ed-theme');s=localStorage.getItem('ed-spoiler')}catch(e){}if(s==='on')d.setAttribute('data-spoiler','on');if(t==='light'||t==='dark')d.setAttribute('data-theme',t)})();</script>
<style>
${CSS}
</style>
</head>
<body>
<a class="skip" href="#main">본문 바로가기</a>
${metaBand}
${toc}
${divider('s0', '화면 1 · 한국 선수', '/korean-players/', 'A', `A 명단 표 — 리그 구간 머리 + 선수 행(거터 = 최근 경기 출전 분, 숫자 상태 규칙) · 375 보기 탭(최근 · 시즌 · 다음) / 1024+ 11열 · 결과 칸 "W 6-1 · 홈" · 기준 ${esc(REF.short)} KST · 제 ${ISSUE.no}호`)}
${screen1}
${detail}
${screen2}
${screen3}
${screen4}
${screen5}
${specimens}
${colophon}
${tabbar}
${overlay}
<div class="toast-region" aria-live="polite" aria-atomic="true"><div class="toast" data-toast hidden><span class="toast__k">알림</span><span data-toast-t></span></div></div>
<script>
${SCRIPT}
</script>
</body>
</html>
`;
fs.writeFileSync(OUT, html);
console.log('wrote', path.relative(ROOT, OUT), html.length);
