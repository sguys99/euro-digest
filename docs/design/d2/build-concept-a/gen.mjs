// D2 시안 A — 스쿼드 명단 (Squad Register) 생성기
// 입력: docs/design/d2/data/d2-data.json (실데이터만) · 출력: docs/design/d2/concept-a.html
// 문구 생성·LLM 호출 0. 데이터에 없는 값은 자리 객체(reason · fillStage)로 표시한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/design/d2/data/d2-data.json'), 'utf8'));
const OUT = path.join(ROOT, 'docs/design/d2/concept-a.html');
const BASE_CSS = fs.readFileSync(path.join(HERE, 'base.css'), 'utf8');
const A_CSS = fs.readFileSync(path.join(HERE, 'a.css'), 'utf8');

const BP = '/euro-digest';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const T = D.teams;
const C = D.cards;
const COMP = Object.fromEntries(D.labels.competitions.map((c) => [c.id, c]));
const TABC = { EPL: 'epl', LALIGA: 'laliga', SERIEA: 'seriea', BUNDESLIGA: 'bundesliga', LIGUE1: 'ligue1', UCL: 'ucl' };
const allPlayers = D.players.groups.flatMap((g) => g.players);
const P = Object.fromEntries(allPlayers.map((p) => [p.slug, p]));

/* ── 아이콘 ── */
const svg = (d, extra = '') => `<svg class="ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" stroke-linejoin="miter"${extra}>${d}</svg>`;
const IC = {
  search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5"/>'),
  theme: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>'),
  right: svg('<path d="m9 6 6 6-6 6"/>'),
  left: svg('<path d="m15 6-6 6 6 6"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>'),
  arrow: svg('<path d="M4 12h15M14 7l5 5-5 5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>').replace('class="ic"', 'class="ic pl-ic"'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>').replace('class="ic"', 'class="ic ck"'),
  cal: svg('<path d="M4 6h16v14H4z"/><path d="M4 10h16M8 3.5V7M16 3.5V7"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>'),
  home: svg('<path d="M3.5 10.5 12 4l8.5 6.5V20h-5.5v-6h-6v6H3.5z"/>'),
  news: svg('<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 12.5h8M8 16h5"/>'),
  league: svg('<path d="M4 5h16M4 10h16M4 15h16M4 20h16"/><path d="M8.5 5v15"/>'),
  player: svg('<path d="M8 3.5 3.5 6.5 5.5 10.5 7.5 9.5V20.5h9V9.5l2 1 2-4L16 3.5c-.6 1.7-2.2 2.8-4 2.8S8.6 5.2 8 3.5z"/>'),
  my: svg('<path d="M6 3.5h12v17l-6-4.5-6 4.5z"/>'),
};

/* ── 원자 ── */
const tm = (o, cls = '', txt) => (o && o.utc ? `<time${cls ? ` class="${cls}"` : ''} datetime="${o.utc.replace('.000Z', 'Z')}">${esc(txt ?? o.short)}</time>` : `<span class="${cls}">${esc(txt ?? o?.short ?? '')}</span>`);
const n = (v) => `<span class="n">${esc(v)}</span>`;
const ftab = (id, extra = '') => {
  if (!id || id === 'OTHER') return `<span class="ftab ftab--other${extra}" title="기타 대회">기타</span>`;
  const c = COMP[id];
  return `<span class="ftab tab--${TABC[id]}${extra}" title="${esc(c.nameKo)}">${esc(c.shortKo)}</span>`;
};
const itab = (id) => (id && TABC[id] ? `<span class="tab tab--${TABC[id]}" title="${esc(COMP[id].nameKo)}"><span class="tab__t">${esc(COMP[id].shortKo)}</span></span>` : '');
function badge(slug, size = 'xs', solo = false) {
  const t = slug ? T[slug] : null;
  const b = t?.badge;
  if (!b || b.fallback) {
    const sh = b?.short || '';
    return `<span class="bdg bdg--${size} bdg--none"${solo ? ` role="img" aria-label="${esc(t?.nameKo || '팀')} 배지 (팀 컬러 없음 — 폴백)"` : ' aria-hidden="true"'}><b>${esc(sh)}</b></span>`;
  }
  return `<span class="bdg bdg--${size}" style="--k1:${b.k1};--k2:${b.k2};--kf:${b.kf}"${solo ? ` role="img" aria-label="${esc(t.nameKo)} 배지 ${esc(b.short)}"` : ' aria-hidden="true"'}><b>${esc(b.short)}</b></span>`;
}
const tName = (slug, fallback) => (slug && T[slug] ? T[slug].nameKo : fallback);
const fm = (o) => `<i class="fm fm--${o}" aria-hidden="true">${o}</i>`;
const OUTK = { W: '승', D: '무', L: '패' };
function spo(inner, label) {
  // 결과 가림 칸 — data-spoiler="on"이면 빗금 버튼으로 바뀐다 (--hatch 재사용)
  return `<span class="spo"><span class="spo-v">${inner}</span><button class="spo-b" type="button" aria-label="${esc(label)} 결과 보기"><span>보기</span></button></span>`;
}
function resCell(r, extraSr = '') {
  if (!r || !r.result) return '';
  const o = r.result.outcome;
  return spo(`<span class="res">${fm(o)}<span class="sr">${OUTK[o]} </span><b class="sc n">${esc(r.result.text)}</b></span>${extraSr}`, '이 경기');
}
const punch = (filled, status) => {
  let s = '';
  for (let i = 0; i < 4; i++) s += `<i${status !== 'collapsed' && i < filled ? ' class="on"' : ''}></i>`;
  return `<span class="punch">${s}</span>`;
};
const STG = Object.fromEntries(Object.entries(D.labels.transferStage).map(([k, v]) => [k, v]));
const stg = (status) => {
  const L = STG[status];
  const aria = status === 'collapsed' ? '이적 단계: 결렬' : `이적 단계: ${L.label} (4단계 중 ${L.filled})`;
  return `<span class="stg stg--${status}" role="img" aria-label="${aria}">${punch(L.filled, status)}<span class="stg__v" aria-hidden="true">${L.label}</span></span>`;
};
const tier = (t) => `<span class="tier tier--${t}"><span class="sr">출처 </span>Tier ${t}</span>`;
const ph = (reason, fill, what) => `<p class="ph-box" aria-label="${esc(what || '자리')}"><b>자리</b>${what ? esc(what) + ' — ' : ''}${esc(reason)}<span class="id">${esc(fill)}</span></p>`;
const arm = () => `<span class="arm" title="한국 선수 관련">한국</span>`;
const rh = (s) => `<span class="rh" lang="en" aria-hidden="true">${s}</span>`;
const secH = (id, h, r, tag = 'h2', thin = false) => `<div class="sec-h${thin ? ' sec-h--thin' : ''}"><${tag} id="${id}">${h}</${tag}>${r ? rh(r) : ''}</div>`;

/* 원제목 링크 (무수정 — 마지막 단어 + ↗ 붙임) */
function titleLink(c) {
  const t = c.t;
  const i = t.lastIndexOf(' ');
  const head = i > 0 ? t.slice(0, i + 1) : '';
  const tail = i > 0 ? t.slice(i + 1) : t;
  return `<a href="${esc(c.lead.u)}" target="_blank" rel="noopener">${esc(head)}<span class="nobr">${esc(tail)}<span class="ext" aria-hidden="true">↗</span></span><span class="sr">(원문 ${esc(c.lead.n)}, 새 창)</span></a>`;
}
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
    <div class="nr__m"><span class="src"${/[a-z]/i.test(c.lead.n) && !/[가-힣]/.test(c.lead.n) ? ' lang="en"' : ''}>${esc(c.lead.n)}</span>${more}<time datetime="${c.lead.at.utc.replace('.000Z', 'Z')}"><span class="rel">${esc(c.lead.rel)}</span><span class="abs">${esc(c.lead.at.short)}</span></time>${why}</div>
  </div>
  <div class="nr__tabs">${comps}</div>
</article>`;
}

/* ── 출전 거터 ── */
const ST_SHORT = { start: '선발', sub: '교체', bench: '벤치', absent: '명단 제외', unknown: '라인업 없음' };
function gut(r) {
  if (!r || r.placeholder) return `<span class="min min--na" aria-hidden="true">–</span><span class="st">연결 전</span>`;
  const on = r.appeared;
  const v = r.minutes == null ? '–' : r.minutes;
  return `<span class="min${on ? '' : ' min--off'}" aria-hidden="true">${v}</span><span class="st${on ? ' st--on' : ''}" aria-hidden="true">${ST_SHORT[r.status]}</span><span class="sr">${esc(r.statusLabel)}${r.minutes != null ? ` ${r.minutes}분` : ''}</span>`;
}
const gl = (g, a) => `${g > 0 ? `<span class="gl"><span class="n">${g}</span>골</span>` : ''}${a > 0 ? `<span class="gl"><span class="n">${a}</span>도움</span>` : ''}`;
const oppName = (o) => (o.nameLang ? `<span lang="${o.nameLang}">${esc(o.name)}</span>` : esc(o.name || o.nameKo));
const compLbl = (r) => (r.comp.id === 'OTHER' ? `기타 대회` : esc(r.comp.shortKo));

/* ══════════════════════════ 화면 1 — 한국 선수 목록 ══════════════════════════ */
function listRow(p) {
  const r = p.recent;
  const linked = p.state.kind === 'linked';
  const hasRecent = r && !r.placeholder;
  const s = p.season && !p.season.placeholder ? p.season.total : null;
  const nx = p.next && !p.next.placeholder ? p.next : null;
  const stateStamp = !linked ? `<span class="state">${esc(p.state.label)}${p.state.kind === 'not-linked' ? ' <span class="id">M3-01</span>' : ''}</span>` : '';
  const uclTxt = p.ucl ? (p.ucl.teamInUcl ? `<span class="ucl">${ftab('UCL')}<b>${esc(p.ucl.label)}</b>${p.ucl.detail ? ` <span class="n">${esc(p.ucl.detail)}</span>` : ''}</span>` : `<span class="note" title="${esc(p.ucl.label)}" aria-hidden="true">–</span><span class="sr">${esc(p.ucl.label)}</span>`) : '<span class="note" aria-hidden="true">–</span><span class="sr">해당 없음</span>';
  const teamLine = `<span class="pl__tm">${badge(p.team.slug)}<span>${esc(p.team.nameKo)}</span></span>`;
  const plCell = `<td class="c-pl"><div class="pl">
      <p class="pl__n"><a href="${BP}/korean-players/${p.slug}/">${esc(p.nameKo)}</a><span class="pos">${esc(p.position)}</span>${hasRecent ? gl(r.goals, r.assists) : ''}</p>
      ${teamLine}
      ${p.ucl && p.ucl.teamInUcl ? `<span class="m-only v-season pl__x">${uclTxt}</span>` : ''}
    </div></td>`;
  // 최근 경기
  let when = '', opp = '', res = '';
  if (hasRecent) {
    when = `<td class="d c-when v-recent"><div class="when">${tm(r.kickoff, '', r.kickoff.dayShort)}<span class="when__c">${r.comp.id === 'OTHER' ? `<span class="note">기타 대회 · <span lang="en">${esc(r.leagueRaw)}</span></span>` : ftab(r.comp.id)}</span></div></td>`;
    opp = `<td class="d c-opp v-recent"><span class="opp">${badge(r.opponent.slug)}<span>${oppName(r.opponent)}</span><span class="v">${esc(r.venueLabel)}</span></span></td>`;
    res = `<td class="c-res v-recent">${resCell(r)}<span class="res__l m-only">${tm(r.kickoff, '', r.kickoff.short.slice(0, 5))} <span class="nobr">${esc(r.venueLabel)}</span> ${oppName(r.opponent)}</span></td>`;
  } else {
    when = '';
    opp = '';
    res = `<td class="c-res v-recent c-wide" colspan="3">${stateStamp}<span class="note">${esc(r?.reason || '')} · ${esc(r?.fillStage || '')}</span></td>`;
  }
  // 시즌
  let season;
  if (s) {
    const c = (v, z) => `<td class="c-n v-season${z ? ' c-sep' : ''}"><span class="num${v === 0 ? ' num--z' : ''}">${v}</span></td>`;
    season = c(s.apps, true) + c(s.minutes) + c(s.goals) + c(s.assists);
  } else {
    season = `<td class="c-n v-season c-sep" colspan="4" style="text-align:left">${stateStamp}</td>`;
  }
  const ucl = `<td class="d c-ucl">${uclTxt}</td>`;
  let next;
  if (nx) {
    next = `<td class="c-next v-next"><span class="nx">${tm(nx.kickoff, '', nx.kickoff.short.slice(6))}<span class="nx__d">${esc(nx.kickoff.dayShort)}</span><span class="nx__o">${ftab(nx.comp.id)}<b>${esc(nx.opponent.nameKo)}</b> ${esc(nx.venueLabel)}</span></span></td>`;
  } else {
    next = `<td class="c-next v-next"><span class="state">${esc(p.state.label || '일정 없음')}</span><span class="d note" style="display:block;margin-top:4px">${esc(p.next?.reason || '')}</span></td>`;
  }
  return `<tr data-p="${p.slug}"><td class="c-min">${gut(hasRecent ? r : null)}</td>${plCell}${when}${opp}${res}${season}${ucl}${next}</tr>`;
}
function listTable() {
  const head = `<thead>
<tr class="rg-hg"><th class="gap" colspan="2"><span></span></th><th scope="colgroup" colspan="3"><span>최근 경기</span></th><th scope="colgroup" colspan="4"><span>시즌 누적 <span class="note">· 10.19부터</span></span></th><th scope="col" class="gap"><span>UCL</span></th><th scope="colgroup"><span>다음 경기 KST</span></th></tr>
<tr class="rg-hc"><th scope="col" class="l c-min">분</th><th scope="col" class="l c-pl">선수 · 소속</th><th scope="col" class="d l">일시 · 대회</th><th scope="col" class="d l">상대</th><th scope="col" class="c-res v-recent">결과</th><th scope="col" class="c-n v-season c-sep" title="출전 경기">출전</th><th scope="col" class="c-n v-season">분</th><th scope="col" class="c-n v-season">골</th><th scope="col" class="c-n v-season">도움</th><th scope="col" class="d l c-ucl">리그 페이즈</th><th scope="col" class="c-next v-next">일시 · 상대</th></tr>
</thead>`;
  const bodies = D.players.groups
    .map((g) => {
      const gh = `<tr class="rg-g"><th scope="rowgroup" colspan="11"><span class="rg-g__in">${ftab(g.comp === 'OTHER' ? null : g.comp)}<span>${g.comp === 'OTHER' ? '기타 리그' : esc(g.label)}</span><span class="cnt">${g.players.length}명</span>${g.comp === 'OTHER' ? '<span class="note">5대 리그 밖 — 목록에 남김(FR-64)</span>' : ''}</span></th></tr>`;
      return `<tbody>${gh}${g.players.map(listRow).join('\n')}</tbody>`;
    })
    .join('\n');
  return `<div class="vt" role="tablist" aria-label="명단 보기">
  <button role="tab" type="button" id="vt-r" aria-controls="rg-list" aria-selected="true" data-view="recent">최근 경기</button>
  <button role="tab" type="button" id="vt-s" aria-controls="rg-list" aria-selected="false" tabindex="-1" data-view="season">시즌 누적</button>
  <button role="tab" type="button" id="vt-n" aria-controls="rg-list" aria-selected="false" tabindex="-1" data-view="next">다음 경기</button>
</div>
<table class="rg" id="rg-list" data-view="recent" aria-labelledby="kp-h">
<caption class="sr">한국 선수 명단 — 리그별. 첫 열은 가장 최근 경기의 출전 분과 출전 상태. 시즌 누적은 ${esc(D.players.aggregationSinceLabel)}. 시각은 KST.</caption>
${head}
${bodies}
</table>`;
}

/* ── 선수 상세 (김민재) ── */
const PD = D.playerDetail;
const kim = P[PD.slug];
function logRow(r) {
  if (r.placeholder) {
    return `<li class="is-ph"><span class="min min--na" aria-hidden="true">–</span><p class="lg__ph"><b>${esc(r.label)}</b><span>${esc(r.reason)}</span><span class="id mono">${esc(r.fillStage)}</span></p></li>`;
  }
  const comp = r.comp.id === 'OTHER' ? `<span class="ftab ftab--other" title="기타 대회">기타</span><span>기타 대회 · <span lang="en">${esc(r.leagueRaw)}</span> ${esc(r.roundLabel)}</span>` : `${ftab(r.comp.id)}<span>${esc(r.roundLabel)}</span>`;
  return `<li>
  <div>${gut(r)}</div>
  <div><p class="lg__k">${tm(r.kickoff, '', r.kickoff.dayShort + ' ' + r.kickoff.time)}${comp}</p>
  <p class="lg__o">vs ${badge(r.opponent.slug)}<span>${oppName(r.opponent)}</span><span class="lg__v">${esc(r.venueLabel)}</span>${gl(r.goals, r.assists)}</p></div>
  <div class="lg__r">${resCell(r)}</div>
</li>`;
}
function fxRow(m, why = '', withIcs = false) {
  const home = m.homeTeam, away = m.awayTeam;
  return `<li class="fx">
  <div class="fx__g">${tm(m.kickoff, 'fx__t', m.kickoff.short.slice(6))}<span class="fx__d">${esc(m.kickoff.dayShort)}</span></div>
  <div class="fx__b"><p class="fx__k">${ftab(m.comp.id)}<span>${esc(m.roundLabel)}</span></p>
  <p class="fx__vs"><span>${badge(home.slug, 's')}<span><span class="sr">홈 </span>${esc(home.nameKo)}</span></span><span>${badge(away.slug, 's')}<span><span class="sr">원정 </span>${esc(away.nameKo)}</span></span></p>${why ? `<p class="fx__why"><span class="sr">팔로우: </span>${why}</p>` : ''}${withIcs ? `<button class="tlink icsl" type="button" aria-describedby="ics-ph">${IC.cal}<span>캘린더에 추가 .ics</span></button>` : ''}</div>
</li>`;
}
function followBtn(state, name, id, sq = false) {
  // state: on | off | limit
  const pressed = state === 'on';
  const dis = state === 'limit';
  return `<button class="btn fol${sq ? ' fol--sq' : ''}" type="button" data-follow="${esc(id)}" aria-pressed="${pressed}"${dis ? ' aria-disabled="true" aria-describedby="lim-note"' : ''} aria-label="${esc(name)} 팔로우">${IC.plus}${IC.check}<span>팔로우</span></button>`;
}

function seasonTable(s) {
  const rows = s.byComp
    .map((c) => {
      const lab = c.comp.id === 'OTHER' ? `<span class="sn__c"><span class="ftab ftab--other" title="기타 대회">기타</span><span class="sn__raw" lang="en">${esc(c.leaguesRaw.join(', '))}</span></span>` : `<span class="sn__c">${ftab(c.comp.id)}</span>`;
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
function transferRow(it, opts = {}) {
  const lead = C[it.timeline[it.timeline.length - 1]];
  const who = it.playerName ? `<span class="xr__nm">${esc(it.playerName)}</span>` : `<span class="xr__nm xr__nm--none"><span class="sr">선수 이름 — </span>이름 표기 없음(names.ko 미등록)</span>`;
  const aff = it.affiliation ? `<span class="aff"><span class="aff__k">소속</span>${badge(it.affiliation.team.slug)}<b>${esc(it.affiliation.team.nameKo)}</b></span>` : '';
  const to = it.to ? `${badge(it.to.slug, 's')}<span>${esc(it.to.nameKo)}</span>` : `<span class="none" aria-hidden="true">–</span><span class="sr">행선지 정보 없음</span>`;
  const rt = `<span class="sr">출발 팀 정보 없음, </span><span class="ar" aria-hidden="true">${IC.arrow}</span><span class="sr">행선지 </span>${to}`;
  const id = `${opts.p || 'x'}-${it.id}`;
  const teams = new Set();
  it.timeline.forEach((cid) => C[cid].tags.filter((t) => t.kind === 'team').forEach((t) => teams.add(t.slug)));
  if (it.affiliation) teams.add(it.affiliation.team.slug);
  if (it.to) teams.add(it.to.slug);
  const tl = it.history
    .slice()
    .reverse()
    .map((h) => {
      const c = C[h.card];
      return `<li><span class="tl__d"><b>${esc(h.at.short.slice(0, 5))}</b>${esc(h.at.short.slice(6))}</span><div><p class="tl__s">${stg(h.status)}<span class="note">${esc(c.lead.n)} · ${tier(c.lead.tier)}</span></p><h4 class="nr__t">${titleLink(c)}</h4></div></li>`;
    })
    .join('');
  const aux = it.auxiliaryCards ? `<li><p class="tl__aux">같은 선수의 이적 분류 기사 ${it.auxiliaryCards.ids.length}건(단계 근거 아님)은 넣지 않았다 — M4-01에서 정함</p></li>` : '';
  return `<article class="xr${opts.wide ? ' xr--w' : ''}" id="${id}" data-league="${it.comps.map((c) => c.id).join(' ')}" data-team="${[...teams].join(' ')}" data-status="${it.status}" data-tier="${it.bestTier}" data-kr="${it.registeredKorean}" aria-labelledby="${id}-h">
  <div class="xr__stg">${stg(it.status)}</div>
  <div class="xr__who"><h3 id="${id}-h" style="font-size:inherit">${who}</h3>${aff}</div>
  <div class="xr__rt">${rt}</div>
  <div class="xr__tier">${tier(it.bestTier)}</div>
  <div class="xr__upd"><span>최근 갱신</span>${tm({ utc: it.updated.utc || lead.lead.at.utc, short: it.updated.short }, '', it.updated.short)}</div>
  <div class="xr__ev"><div><h4 class="nr__t">${titleLink(lead)}</h4><p class="nr__m"><span class="src">${esc(lead.lead.n)}</span><span>${esc(it.updatedRel)}</span></p></div>
  ${it.history.length > 1 ? `<button class="tlb" type="button" aria-expanded="false" aria-controls="${id}-tl"><span class="u">타임라인</span> <span class="n">${it.history.length}</span><span class="sr">건</span>${IC.down}</button>` : `<span class="note tl1">기사 <span class="n">1</span></span>`}</div>
  ${it.history.length > 1 ? `<div class="xr__tl" id="${id}-tl" hidden><ol class="tl" aria-label="기사 타임라인 — 최신순">${tl}${aux}</ol></div>` : ''}
</article>`;
}

/* ══════════════════════════ 셸 ══════════════════════════ */
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
const divider = (id, title, code, info) => `<aside class="divider divider--screen" id="${id}" aria-label="시안 설명 — ${esc(title)}"><span><b>${esc(title)}</b> <code>${esc(code)}</code></span><span class="divider__info">${info}</span></aside>`;

/* ══════════════════════════ 화면 1 ══════════════════════════ */
const counts = D.players.counts;
const ixGroups = D.players.groups.map((g) => `<li><a class="ix-row" href="#rg-list">${ftab(g.comp === 'OTHER' ? null : g.comp)}<span class="ix-l">${g.comp === 'OTHER' ? '기타 리그' : esc(g.label)}</span><span class="lead" aria-hidden="true"></span><span class="n">${g.players.length}</span></a></li>`).join('');
const screen1 = `
<div class="shell" id="s1">
${masthead}
<div class="layout">
<nav class="contents" aria-label="한국 선수 목차">
  ${secH('kp-ix-h', '리그별', 'INDEX')}
  <ul class="toc-ix">${ixGroups}</ul>
  <ul class="toc-ix" style="margin-top:18px"><li><a class="ix-row" href="#s2"><span class="ix-l">주간 리포트</span><span class="lead" aria-hidden="true"></span><span class="n">W43</span></a></li><li><a class="ix-row" href="#s3"><span class="ix-l">이적</span><span class="lead" aria-hidden="true"></span><span class="n">${D.transfers.counts.items}</span></a></li></ul>
  <p class="note" style="margin-top:12px">${esc(D.players.aggregationSinceLabel)} — 원장 ${esc(D.meta.ledger.since)}부터. 그 전 경기는 백필하지 않는다(D27 ④)</p>
</nav>
<main class="page" id="main" tabindex="-1">
<section aria-labelledby="kp-h">
  <header class="pg-h">
    <p class="pg-k"><span>등록 ${n(counts.total)} · 활성 ${n(counts.active)} · 기록 연결 ${n(counts.linked)}</span>${rh('SQUAD REGISTER')}</p>
    <h1 id="kp-h">한국 선수</h1>
    <p class="pg-s"><b>${esc(D.players.aggregationSinceLabel)}</b> · 원장 ${tm(D.meta.ledger.updatedAt, '', D.meta.ledger.updatedAt.short)} KST</p>
  </header>
  ${listTable()}
  <div class="legend legend--rg"><span><b>선발·교체</b> 분 = 잉크</span><span><b>벤치</b> 0분 · <b>명단 제외</b> – = 보조색 + 글자</span><span><span class="gl"><span class="n">1</span>골</span> 그 경기 골·도움(있을 때만)</span><span><i class="fm fm--W" aria-hidden="true">W</i> 결과 = 소속팀 득점 먼저 (홈-원정 순 아님)</span><span><b>UCL –</b> 참가 팀 아님</span><span><span class="state">기록 연결 전</span> 데이터 상태</span></div>
  <p class="src-note">출처: 출전·분·골은 <b>API-Football</b> 경기 기록(원장), 일정은 <b>football-data.org</b>. 컵 대회는 화면 스키마상 "기타 대회"로만 쓸 수 있다(scope §6 #1 — 원문 "DFB Pokal"은 참고 표기)</p>
</section>
</main>
</div>
</div>`;

/* 상세 */
const pdH = PD.head;
const st = pdH.teamStanding;
const nxt = PD.next;
const nationalIds = PD.nationalNews.ids;
const tKim = D.transfers.items.find((x) => x.id === PD.transferLink.transferId);
const rosterIx = allPlayers.map((p) => {
  const r = p.recent && !p.recent.placeholder ? p.recent : null;
  const v = r ? (r.minutes == null ? '–' : r.minutes) : '–';
  return `<li><a class="ix-row${p.slug === PD.slug ? '' : ''}" href="${BP}/korean-players/${p.slug}/"${p.slug === PD.slug ? ' aria-current="page"' : ''}><span class="min-s n${r && r.appeared ? '' : ' off'}" aria-hidden="true">${v}</span><span class="ix-l">${esc(p.nameKo)}</span><span class="lead" aria-hidden="true"></span>${badge(p.team.slug)}</a></li>`;
}).join('');
const detail = `
${divider('s1b', '화면 1 · 한국 선수 상세', '/korean-players/kim-min-jae/', '머리 1줄 + 수치 한 줄 + 시즌 기록 표 + 최근 5경기 원장(실 3 · 집계 전 2) · 1280 = 목차(명단) · 지면 · 마주 보는 면(다음 경기 · 이적설 · 대표팀)')}
<div class="shell">
<div class="layout layout--3">
<nav class="contents" aria-label="한국 선수 명단">
  ${secH('pd-ix-h', '명단', 'SQUAD')}
  <ul class="toc-ix">${rosterIx}</ul>
  <p class="note" style="margin-top:10px">숫자 = 최근 경기 출전 분</p>
</nav>
<main class="page">
<article aria-labelledby="pd-h">
  <header class="pd-h">
    <p class="pd-h__k"><a class="tlink" href="#s1" style="min-height:44px">${IC.left}<span>한국 선수</span></a>${rh('PLAYER REGISTER')}</p>
    <h1 id="pd-h">${esc(pdH.nameKo)} <span class="en" lang="en">${esc(pdH.nameEn)}</span></h1>
    ${followBtn('on', pdH.nameKo, 'p:kim-min-jae')}
    <p class="pd-m"><span><b>${esc(pdH.position)}</b></span><span><span class="t"><span class="n">${pdH.birthYear}</span>년생</span></span><span>${badge(pdH.team.slug, 's')}<b>${esc(pdH.team.nameKo)}</b></span><span>${ftab(st.comp)}<span class="t"><span class="n">${st.pos}</span>위 · 승점 <span class="n">${st.pts}</span></span></span></p>
  </header>
  <dl class="tally" aria-label="시즌 누적 — ${esc(PD.season.sinceLabel)}">
    <div><dt>명단</dt><dd>${PD.season.total.inSquad}</dd></div>
    <div><dt>출전</dt><dd>${PD.season.total.apps}</dd></div>
    <div><dt>출전 분</dt><dd>${PD.season.total.minutes}</dd></div>
    <div><dt>골</dt><dd>${PD.season.total.goals}</dd></div>
    <div><dt>도움</dt><dd>${PD.season.total.assists}</dd></div>
  </dl>
  <p class="note tally__f">${esc(PD.season.sinceLabel)} · 전 대회 합 · UCL ${esc(PD.ucl.label)}(${esc(PD.ucl.detail)}) · 출전 = 선발·교체, 명단 = 선발·교체·벤치</p>

  <section class="sec" aria-labelledby="pd-sn-h">
    ${secH('pd-sn-h', '시즌 기록', 'SEASON RECORD')}
    <p class="sub">대회별 · ${esc(PD.season.sinceLabel)} — 리그와 UCL은 따로, 컵은 기타 대회</p>
    ${seasonTable(PD.season)}
  </section>

  <section class="sec" aria-labelledby="pd-lg-h">
    ${secH('pd-lg-h', '최근 5경기', 'MATCH LOG')}
    <p class="sub">최신순 · 첫 열 출전 분 · 결과는 ${esc(kim.team.nameKo)} 득점 먼저(W/D/L 칩과 함께) — 홈-원정 순 스코어 행과 섞이지 않게</p>
    <ol class="lg">${PD.log5.map(logRow).join('')}</ol>
  </section>

  <section class="sec" aria-labelledby="pd-nw-h">
    ${secH('pd-nw-h', '관련 뉴스', 'PRESS')}
    <div class="vt vt--keep" role="tablist" aria-label="관련 뉴스 언어" style="display:flex">
      <button role="tab" type="button" id="nw-ko" aria-controls="nw-ko-p" aria-selected="true">한국어 <span class="n">${PD.news.ko.length}</span></button>
      <button role="tab" type="button" id="nw-en" aria-controls="nw-en-p" aria-selected="false" tabindex="-1">영문 <span class="n">0</span></button>
    </div>
    <div role="tabpanel" id="nw-ko-p" aria-labelledby="nw-ko"><div class="nrs">${PD.news.ko.slice(0, 4).map((id) => newsRow(id, { p: 'pd' })).join('')}</div>
      <p class="more"><span class="note">대표 출처 시각 최신순 · 원제목 그대로</span><a class="tlink" href="${BP}/news/?player=kim-min-jae">${PD.news.ko.length}건 모두 보기 ${IC.right}</a></p></div>
    <div role="tabpanel" id="nw-en-p" aria-labelledby="nw-en" hidden><div class="empty-s"><span class="empty__n" aria-hidden="true">0</span><p><b>영문 관련 뉴스가 없어요</b>${esc(PD.news.en.reason)} · <span class="mono">${esc(PD.news.en.fillStage)}</span></p></div></div>
  </section>
</article>
</main>
<aside class="side" aria-label="김민재 — 다음 경기 · 이적설 · 대표팀">
  <section class="sec" aria-labelledby="pd-fx-h">
    ${secH('pd-fx-h', '다음 경기', 'FIXTURES', 'h2', true)}
    <p class="sub">KST · 홈 팀 먼저</p>
    <ol class="fxs">${PD.upcoming.map((m, i) => fxRow(m, '', i === 0)).join('')}</ol>
    <p class="ph-box" id="ics-ph" style="margin-top:10px"><b>자리</b>.ics — ${esc(PD.ics.reason)}<span class="id">${esc(PD.ics.fillStage)}</span></p>
  </section>
  <section class="sec" aria-labelledby="pd-tr-h">
    ${secH('pd-tr-h', '이적설', 'TRANSFERS', 'h2', true)}
    <div class="xrs">${transferRow(tKim, { p: 'pd' })}</div>
    <a class="tlink" href="#s3">이적 화면에서 보기 ${IC.right}</a>
  </section>
  <section class="sec" aria-labelledby="pd-nt-h">
    ${secH('pd-nt-h', '대표팀 소집 소식', 'NATIONAL', 'h2', true)}
    <p class="sub">소집 명단 데이터는 없다(M3-05) — 기사만</p>
    <div class="nrs">${nationalIds.map((id) => newsRow(id, { p: 'pdn', small: true })).join('')}</div>
  </section>
</aside>
</div>
</div>`;

/* ══════════════════════════ 화면 2 — 주간 리포트 ══════════════════════════ */
const W = D.weekly;
const wRows = W.rows
  .map((r, i) => {
    const isM = r.player === W.mvp.player;
    const ms = r.matches.map((m) => `${esc(m.kickoff.dayShort.slice(0, 5))} ${m.comp.id === 'OTHER' ? '기타' : esc(m.comp.shortKo)} ${esc(m.opponent)} · ${esc(m.statusLabel)}${m.minutes ? ` <span class="n">${m.minutes}</span>분` : ''}`).join(' / ');
    const v = (x) => `<td class="c-n"><span class="num${x === 0 ? ' num--z' : ''}">${x}</span></td>`;
    return `<tr${isM ? ' class="is-mvp"' : ''}><td class="c-r"><b>${i + 1}</b></td><td class="c-pl"><p class="pl__n" style="font-size:15.5px"><a href="${BP}/korean-players/${r.player}/">${esc(r.nameKo)}</a>${isM ? '<span class="stamp" style="border-color:var(--brand-accent-text);color:var(--brand-accent-text)">MVP</span>' : ''}</p><span class="pl__tm" style="margin-top:4px">${badge(r.team.slug)}<span>${esc(r.team.nameKo)}</span></span><span class="wt__m">${ms}</span></td>${v(r.apps)}${v(r.minutes)}${v(r.goals)}${v(r.assists)}<td class="c-pts"><b>${r.mvpScore}</b></td></tr>`;
  })
  .join('');
const mvpP = W.rows.find((r) => r.player === W.mvp.player);
const gd = W.mvp.goalDetail[0];
const screen2 = `
${divider('s2', '화면 2 · 주간 리포트', '/korean-players/weekly/2026-43/', '주차 머리 + 호 넘기기(주 단위) + MVP 행 + 선수별 기록 표 + 총평 자리(AI 작성 라벨 위치) · 1024 이상 = 목차(주차 색인) · 지면')}
<div class="shell">
<div class="layout">
<nav class="contents" aria-label="주간 리포트 색인">
  ${secH('wk-ix-h', '주차', 'WEEKS')}
  <ul class="toc-ix">
    <li><span class="ix-row is-off"><span class="ix-l">W44 · ${esc(W.archive.next.label)}</span><span class="lead" aria-hidden="true"></span><span class="n">–</span></span></li>
    <li><a class="ix-row" href="#s2" aria-current="page"><span class="ix-l">W43 · 10.19 ~ 10.25</span><span class="lead" aria-hidden="true"></span><span class="n">${W.rows.length}</span></a></li>
    <li><span class="ix-row is-off"><span class="ix-l">W42 · 리포트 없음</span><span class="lead" aria-hidden="true"></span><span class="n">–</span></span></li>
  </ul>
  <p class="note" style="margin-top:10px">${esc(W.archive.prev.reason)}</p>
</nav>
<main class="page">
<article aria-labelledby="wk-h">
  <header class="pg-h">
    <p class="pg-k"><span>한국 선수 · 주간 리포트</span>${rh('WEEKLY RETURN')}</p>
    <h1 id="wk-h">${esc(W.isoWeekLabel)}</h1>
    <p class="pg-s"><b>${esc(W.range.label)}</b> · 경기일은 UTC 하루 기준(브리핑과 같은 '현지') · ${esc(W.publish.label)}</p>
  </header>
  <nav class="wk-nav" aria-label="주 넘기기">
    <span class="wk-b wk-b--off" aria-disabled="true"><span>‹ 지난주</span><b>W42</b><span class="sr">— ${esc(W.archive.prev.reason)}</span></span>
    <p class="wk-c"><b>W43</b><span>${esc(W.range.label)}</span></p>
    <span class="wk-b wk-b--off wk-b--next" aria-disabled="true"><span>다음 주 ›</span><b>W44</b><span class="sr">— ${esc(W.archive.next.label)}</span></span>
  </nav>

  <section class="mvp" aria-labelledby="mvp-h">
    <div class="mvp__g"><span class="stamp">MVP</span><span class="mvp__pts n">${W.mvp.score}<small>점</small></span></div>
    <div>
      <h2 id="mvp-h" class="mvp__n"><a href="${BP}/korean-players/${W.mvp.player}/" style="text-decoration:none">${esc(W.mvp.nameKo)}</a><span class="gl"><span class="n">${mvpP.goals}</span>골</span></h2>
      <p class="mvp__tm">${badge(mvpP.team.slug)}<span>${esc(mvpP.team.nameKo)}</span></p>
      <p class="mvp__g2"><span class="nobr"><span class="n">${esc(gd.kickoff.dayShort)}</span> vs ${esc(gd.opponent)}</span><span class="nobr"><span class="n">${esc(gd.goalMinutes[0])}</span>분 골</span>${spo(`<span class="res">${fm(gd.result.outcome)}<span class="sr">${OUTK[gd.result.outcome]} </span><b class="sc n" style="font-size:15px">${esc(gd.result.text)}</b></span>`, 'MVP 경기')}</p>
      <p class="mvp__f">${esc(W.mvp.rule)} — <span class="n">${esc(W.mvp.breakdown.replace(/×/g, '×'))}</span></p>
      <p class="mvp__r">2위 그룹 1점: ${W.mvp.runnersUp.filter((r) => r.score === 1).map((r) => esc(r.nameKo)).join(' · ')}</p>
    </div>
  </section>

  <section class="sec" aria-labelledby="wk-t-h" style="margin-top:28px">
    ${secH('wk-t-h', '선수별 기록', 'RETURN')}
    <table class="wt"><caption class="sr">W43 선수별 출전·분·골·도움·MVP 점수 — ${esc(W.rowOrder)}</caption>
      <thead><tr><th scope="col" class="l c-r">#</th><th scope="col" class="l c-pl">선수 · 경기</th><th scope="col" class="c-n">출전</th><th scope="col" class="c-n">분</th><th scope="col" class="c-n">골</th><th scope="col" class="c-n">도움</th><th scope="col" class="c-pts">점수</th></tr></thead>
      <tbody>${wRows}</tbody>
      <tfoot><tr><td colspan="7">${W.excluded.map((e) => `<b style="color:var(--ink)">${esc(e.nameKo)}</b> ${esc(e.reason)}`).join(' · ')} — 표 밖. 정렬: 점수 → 분 → 명단 순(PRD에 정렬 규칙 없음 — 시안 가정)</td></tr></tfoot>
    </table>
  </section>

  <section class="rem" aria-labelledby="wk-r-h">
    <div class="rem__h"><h3 id="wk-r-h">총평</h3>${rh('REMARKS')}</div>
    <div class="rem__box" aria-label="총평 자리">
      <div class="rem__lines" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="rem__end"><i aria-hidden="true"></i><a class="ai" href="${BP}/about/#ai">AI 작성</a></div>
      <p class="note" style="margin-top:10px"><b style="color:var(--ink)">자리</b> ${esc(W.summary.sentences)}문장 — ${esc(W.summary.reason)} <span class="mono">${esc(W.summary.fillStage)}</span>. 라벨은 마지막 문장 끝에 한 번(5줄 AI 줄과 같은 상자)</p>
    </div>
  </section>
  <p class="rule-note"><b>경계 확인</b> 같은 주를 KST로 자르면 김민재 프라이부르크전(명단 제외)이 W44로 넘어간다 — 표 숫자는 바뀌지 않는다(scope §6 #2). <b>동점</b> W44 진행분은 ${W.w44InProgress.tiedLeaders.map((x) => esc(x.nameKo)).join(' · ')} ${W.w44InProgress.tiedLeaders.length}명이 1점 — 동점 규칙 미정(§6 #3)</p>
</article>
</main>
</div>
</div>`;

/* ══════════════════════════ 화면 3 — 이적 ══════════════════════════ */
const TR = D.transfers;
const fGroup = (key, title, opts, note = '') =>
  `<div class="xf__g" role="group" aria-labelledby="xf-${key}"><p class="xf__gh" id="xf-${key}">${title}</p>${note ? `<p class="xf__note">${note}</p>` : ''}<div class="xf__opts">${opts
    .map((o) => `<button class="chip${o.kr ? ' chip--kr' : ''}" type="button" data-f="${key}" data-v="${esc(o.v)}" aria-pressed="false"${o.count === 0 ? ' disabled' : ''}>${o.pre || ''}<span class="xo__l">${esc(o.label)}</span><span class="lead" aria-hidden="true"></span><span class="c">${o.count}</span><span class="chip__ck" aria-hidden="true">✓</span></button>`)
    .join('')}</div></div>`;
const xf = `<nav class="xf" aria-label="이적 필터">
  <div class="xf__bar">
    ${secH('xf-h', '필터', 'FILTER', 'h2')}
  </div>
  <div class="xf__bar" style="margin-top:4px">
    <button class="chip chip--kr" type="button" data-f="kr" data-v="true" aria-pressed="false" data-dup="kr"><span>한국 선수</span><span class="c">${TR.filters.korean.count}</span><span class="chip__ck" aria-hidden="true">✓</span></button>
    <button class="chip xf__tg" type="button" aria-expanded="false" aria-controls="xf-panel">리그 · 팀 · 단계 · Tier <span class="c" data-fcount>0</span>${IC.down.replace('class="ic"', 'class="ic" style="width:16px;height:16px"')}</button>
  </div>
  <div class="xf__panel" id="xf-panel" hidden>
    ${fGroup('status', '단계', TR.filters.status.map((s) => ({ v: s.id, label: s.label, count: s.count })))}
    ${fGroup('league', '리그', TR.filters.league.map((l) => ({ v: l.id, label: l.label, count: l.count, pre: ftab(l.id) })))}
    ${fGroup('team', '팀', TR.filters.team.map((t) => ({ v: t.slug, label: t.label, count: t.count, pre: badge(t.slug) })))}
    ${fGroup('tier', '출처 Tier', TR.filters.tier.map((t) => ({ v: String(t.tier), label: t.label, count: t.count })), 'Tier 1 활성 소스 0 — 결과 0이 기본(scope §6 #5)')}
  </div>
  <p class="xf__sum" aria-live="polite"><span><b data-xcount>${TR.items.length}</b>건 중 <b data-xshown>${TR.items.length}</b>건</span><button class="tlink" type="button" data-xreset hidden>필터 해제</button></p>
</nav>`;
const screen3 = `
${divider('s3', '화면 3 · 이적', '/transfers/', '창 모드 머리 + 필터 5축(375 접힘 칩 · 1024+ 목차 열 체크 목록) + 이적 원장 행(단계 · 선수 · 소속 칸(Q3 ①) · 경로 · Tier · 갱신 · 기사 타임라인 펼침) · 필터를 바꾸면 남은 행이 찍힌다')}
<div class="shell">
<div class="layout layout--x">
<header class="pgx">
  <div class="pg-h">
    <p class="pg-k"><span>단계 = 펀치 구멍 · 출처 Tier = 카드 최고 출처</span>${rh('TRANSFER LEDGER')}</p>
    <h1 id="tr-h">이적</h1>
  </div>
  <p class="win"><span class="stamp">이적 창 닫힘</span><span>창 모드 꺼짐 — 열리면 홈 이적 섹션이 위로 올라간다(FR-105)</span><span class="ph-box" style="padding:4px 8px;border-width:1px"><b>자리</b>창 날짜 <span class="id">${esc(TR.window.dates.fillStage)}</span></span></p>
</header>
${xf}
<main class="page">
<section aria-labelledby="tr-h">
  <div class="xr-h" aria-hidden="true"><span>단계</span><span>선수 · 소속</span><span>출발 → 행선지</span><span>Tier</span><span>최근 갱신</span></div>
  <div class="xrs" data-xlist>${TR.items.map((it) => transferRow(it, { wide: true })).join('')}</div>
  <div class="empty-s" data-xempty hidden><span class="empty__n" aria-hidden="true">0</span><p><b>조건에 맞는 이적이 없어요</b>Tier 1·2, 협상·합의 단계는 지금 데이터에 없다 — 1월 이적 창부터 <button class="tlink" type="button" data-xreset>필터 해제</button></p></div>
  <p class="src-note">이적 단계는 코드 분류(제목 키워드), 루머는 보도 형식 그대로. 출발 팀은 기사 필드(<b>transfer.from</b>)에만 있고 비어 있으면 비운다 — 등록 한국 선수의 <b>소속</b>은 설정 값을 별도 칸에(Q3 ①). 선수 단위 1건(김민재 행선지 여러 곳 처리는 M4-01)</p>
</section>
</main>
</div>
</div>`;

/* ══════════════════════════ 화면 4 — 마이 · 온보딩 · 검색 ══════════════════════════ */
const MY = D.my;
// 다음 경기 — 팀·선수 팔로우 묶음(경기 id로 합침)
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
const myRecent = MY.teams.flatMap((t) => t.recent.map((r) => ({ r, t }))).sort((a, b) => b.r.kickoff.utc.localeCompare(a.r.kickoff.utc));
const recentRow = ({ r, t }) => `<li><span class="rs__d">${tm(r.kickoff, '', r.kickoff.short.slice(0, 5))}</span><div class="rs__b"><p class="rs__t">${badge(t.team.slug)}<span>${esc(t.team.nameKo)}</span></p><p class="rs__o">${ftab(r.comp.id)}<span>vs ${esc(r.opponent.nameKo)} · ${esc(r.venueLabel)}</span></p></div>${resCell(r)}</li>`;
const followRows = [
  ...MY.teams.map((t) => ({ k: 'team', id: 't:' + t.team.slug, name: t.team.nameKo, pre: badge(t.team.slug, 's'), sub: `${COMP[t.standing.comp].shortKo} ${t.standing.pos}위` })),
  ...MY.players.map((p) => ({ k: 'player', id: 'p:' + p.slug, name: p.nameKo, pre: arm(), sub: p.team.nameKo })),
];
const mgList = `<ul class="mg" aria-label="팔로우 목록">
  <li class="mg__h" style="min-height:0;display:flex"><span>팀 ${n(MY.teams.length)}</span><span>선수 ${n(MY.players.length)}</span></li>
  ${followRows.map((f) => `<li><span class="mg__n">${f.pre}<span>${esc(f.name)}</span><small>${esc(f.sub)}</small></span>${followBtn('on', f.name, f.id, true)}</li>`).join('')}
</ul>`;
const myNewsCards = MY.news.latestIssue.cards;
const onb = D.onboarding;
const step1 = onb.steps[0], step2 = onb.steps[1], step3 = onb.steps[2];
const s1opts = step1.options.map((o) => `<label class="ob__o"><input type="checkbox" name="ob-l" value="${o.id}"${step1.sampleSelected.includes(o.id) ? ' checked' : ''}>${ftab(o.id)}<span>${esc(o.nameKo)}</span><span class="pos-n">${o.teamCount}팀</span></label>`).join('');
const s2opts = step2.byLeague
  .map((g) => {
    const first = g.teams.slice(0, 6);
    return `<div><p class="ob__lg">${ftab(g.comp.id)}<span>${esc(g.comp.nameKo)}</span><span class="note" style="margin-left:auto;font-weight:400">${esc(g.order.replace('(data/competitions standings)', ''))}</span></p><div class="ob__opts">${first
      .map((t) => `<label class="ob__o"><input type="checkbox" name="ob-t" value="${t.slug}"${step2.sampleSelected.includes(t.slug) ? ' checked' : ''}>${badge(t.slug)}<span>${esc(t.nameKo)}</span>${t.hasKorean ? arm() : ''}<span class="pos-n">${t.pos}위</span></label>`)
      .join('')}</div><p class="ob__more"><span class="note">${g.teams.length}팀 중 ${first.length}</span><button class="tlink" type="button">${g.teams.length}팀 모두 ${IC.down.replace('class="ic"', 'class="ic" style="width:16px;height:16px"')}</button></p></div>`;
  })
  .join('');
const s3opts = step3.options.map((o) => `<label class="ob__o"><input type="checkbox" name="ob-p" value="${o.slug}"${step3.sampleSelected.includes(o.slug) ? ' checked' : ''}><span>${esc(o.nameKo)}</span><span class="pos">${esc(o.position)}</span><span class="note">${esc(o.team.nameKo)}</span>${o.state.label ? `<span class="state">${esc(o.state.label)}</span>` : ''}</label>`).join('');
const obStep = (no, cls, title, sub, status, body, open) => `<div class="ob__step ${cls}">
  <button class="ob__hd" type="button" aria-expanded="${open}" aria-controls="ob-b${no}"><span class="ob__no n" aria-hidden="true">${no}</span><span class="ob__t"><b><span class="sr">${no}단계 </span>${title}</b><span>${sub}</span></span><span class="ob__s">${status}${IC.down}</span></button>
  <div class="ob__bd" id="ob-b${no}"${open ? '' : ' hidden'}>${body}</div>
</div>`;
const onboarding = `<section class="ob" aria-labelledby="ob-h">
  <div class="ob__h"><p id="ob-h">내 명단 만들기</p><span class="note">팔로우는 이 기기에만 저장 · 언제든 마이에서 바꿀 수 있다</span></div>
  ${obStep(1, 'is-done', '리그', '보고 싶은 리그', `<span>${step1.sampleSelected.length}개 ✓</span>`, `<div class="ob__opts">${s1opts}</div><p class="note" style="margin-top:6px">${esc(step1.note)}</p>`, false)}
  ${obStep(2, 'is-cur', '팀', `최대 ${step2.max} · 고른 리그의 현재 순위 순`, `<span><span class="n">${step2.sampleSelected.length}</span> / <span class="n">${step2.max}</span></span>`, `<div class="ob__opts--2 ob__opts">${s2opts}</div>`, true)}
  ${obStep(3, 'is-todo', '한국 선수', `등록 ${step3.options.length}명`, `<span><span class="n">${step3.sampleSelected.length}</span>명</span>`, `<div class="ob__opts ob__opts--2">${s3opts}</div>`, false)}
  <div class="ob__f"><button class="tlink" type="button">건너뛰기</button><span class="ob__cnt">팔로우 <b>${MY.limit.used}</b> / ${MY.limit.max}</span><span class="grp"><button class="btn" type="button">이전</button><button class="btn btn--pri" type="button">다음</button></span></div>
</section>`;

/* 검색 결과 컴포넌트 */
function searchBody(q, o = {}) {
  const lim = o.lim ?? 3;
  const pre = o.p || 's';
  const pl = q.players.map((p) => `<li><a class="sx-r" href="${BP}${p.path}"><span class="sx-l"><span class="sx-n">${arm()}<span>${esc(p.nameKo)}</span><span class="pos">${esc(p.position)}</span></span><span class="sx-s">${badge(p.team.slug)}<span>${esc(p.team.nameKo)}</span><span>· 일치 <mark${/[a-z]/i.test(p.matchedAlias) ? ' lang="en"' : ''}>${esc(p.matchedAlias)}</mark></span></span></span>${IC.right}</a></li>`).join('');
  const tmz = q.teams.map((t) => `<li><a class="sx-r" href="${BP}/teams/${t.slug}/"><span class="sx-l"><span class="sx-n">${badge(t.slug, 's')}<span>${esc(t.nameKo)}</span></span><span class="sx-s">${t.reasonLabel ? esc(t.reasonLabel) : `이름 일치 <mark>${esc(t.matchedAlias)}</mark>`}</span></span>${IC.right}</a></li>`).join('');
  const nw = q.news.top10.slice(0, lim).map((x) => newsRow(x.id, { p: pre + '-' + q.q.length, small: true })).join('');
  const grp = (key, title, count, inner, emptyMsg) => `<section class="sx-g" aria-label="${title} ${count}건"><h3 class="sx-gh">${title} <span class="n">${count}</span>${rh(key)}</h3>${count ? inner : `<p class="sx-0">${emptyMsg}</p>`}</section>`;
  return (
    grp('PLAYERS', '선수', q.counts.players, `<ul>${pl}</ul>`, '일치하는 선수 없음') +
    grp('TEAMS', '팀', q.counts.teams, `<ul>${tmz}</ul>`, '일치하는 팀 없음') +
    grp('NEWS', '뉴스', q.counts.news, `<div class="nrs sx-nw">${nw}</div>${q.counts.news > lim ? `<p class="more"><span class="note">한국어 ${q.counts.newsKo} · 영문 ${q.counts.newsEn} · 대표 출처 시각 최신순</span><a class="tlink" href="${BP}${esc(q.path)}">뉴스 ${q.counts.news}건 모두 ${IC.right}</a></p>` : ''}`, '관련 뉴스 0건 — 이 선수 이름이 잡힌 카드가 아직 없다(scope §6 #8)')
  );
}
const SQ = D.search;
const qKim = SQ.queries.find((q) => q.q === '김민재');
const qJ = SQ.queries.find((q) => q.q === '정우영');
const searchFrame = `<div class="fr-ov" aria-label="검색 오버레이 — 열린 상태 견본">
  <div class="sq">${IC.search}<input type="search" value="김민재" aria-label="검색어" readonly tabindex="-1"><button class="ibtn" type="button" tabindex="-1" aria-label="닫기">${IC.close}</button></div>
  <div class="ov__body">${searchBody(qKim, { lim: 2, p: 'fo' })}</div>
  <p class="ov__f" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd>이동</span><span><kbd>Enter</kbd>열기</span><span><kbd>Esc</kbd>닫기</span><span><kbd>/</kbd>열기</span></p>
</div>`;

const screen4 = `
${divider('s4', '화면 4 · 마이', '/my/', '내 명단 = 팔로우 5(팀 3 + 선수 2 — 시안 표본) · 다음 경기(경기 id로 합침) · 최근 결과(팀 기준 W/D/L) · 내 팀 소식 · 1024+ 목차 열 = 팔로우 관리(한도 · 내보내기/가져오기 · .ics)')}
<div class="shell">
<div class="layout layout--y">
<main class="page">
<section aria-labelledby="my-h">
  <header class="pg-h">
    <p class="pg-k"><span>팔로우 ${n(MY.limit.used)} · 이 기기에만 저장(localStorage)</span>${rh('MY REGISTER')}</p>
    <h1 id="my-h">마이</h1>
    <p class="pg-s">시안 표본 — 팀 ${MY.sample.teams.map((s) => esc(tName(s))).join(' · ')} + 선수 ${MY.sample.players.map((s) => esc(P[s].nameKo)).join(' · ')}</p>
  </header>
  <div class="mx">
  <section class="sec" aria-labelledby="my-fx-h" style="margin-top:24px">
    ${secH('my-fx-h', '다음 경기', 'FIXTURES')}
    <p class="sub">KST · 홈 팀 먼저 · 팔로우가 겹치는 경기는 한 줄(경기 id 기준)</p>
    <ol class="fxs">${myFx.slice(0, 5).map((e) => fxRow(e.m, [...e.why].map((w) => `<b>${esc(w)}</b>`).join(' · '))).join('')}</ol>
    <p class="more"><span class="note">${myFx.length}경기 중 5</span><a class="tlink" href="${BP}/my/#fixtures">모두 보기 ${IC.right}</a></p>
  </section>
  <section class="sec" aria-labelledby="my-rs-h">
    ${secH('my-rs-h', '최근 결과', 'RESULTS')}
    <p class="sub">팔로우 팀 기준 — 팀 득점 먼저 + W/D/L</p>
    <ol class="rs">${myRecent.slice(0, 6).map(recentRow).join('')}</ol>
  </section>
  </div>
  <section class="sec" aria-labelledby="my-nw-h">
    ${secH('my-nw-h', '내 팀 소식', 'MY NEWS')}
    <p class="sub">제 ${MY.news.latestIssue.issueNo}호 · ${MY.news.latestIssue.count}건 — 카드 오른쪽 굵은 글자가 걸린 팔로우</p>
    <div class="nrs">${myNewsCards.slice(0, 4).map((c) => newsRow(c.id, { p: 'my', why: c.followMatch.map((f) => f.label).join(' · ') })).join('')}</div>
    <p class="more"><span class="note">전 호 합계 ${MY.news.allIssues.count}건</span><a class="tlink" href="${BP}/news/?mine=1">${MY.news.latestIssue.count}건 모두 ${IC.right}</a></p>
  </section>
</section>
</main>
<nav class="contents mgc" aria-label="팔로우 관리">
  ${secH('my-mg-h', '내 명단', 'MY REGISTER')}
  <p class="my-cnt" style="margin-top:12px"><span class="n">${MY.limit.used}</span><small> / ${MY.limit.max}</small></p>
  ${mgList}
  <p class="lim" id="lim-note"><span>한도 <b>${MY.limit.max}</b> 도달 — 하나를 풀어야 더할 수 있다</span></p>
  <div class="tools">
    <button class="btn" type="button" aria-describedby="exp-ph">${IC.link}<span>내보내기 — 주소 복사</span></button>
    <button class="btn" type="button" aria-describedby="exp-ph"><span>가져오기</span></button>
    <p class="ph-box" id="exp-ph"><b>자리</b>${esc(MY.exportImport.reason)} · 상태: ${MY.exportImport.states.map(esc).join(' / ')}<span class="id">${esc(MY.exportImport.fillStage)}</span></p>
    <button class="btn" type="button" aria-describedby="icsb-ph">${IC.cal}<span>팀 일정 .ics 묶음</span></button>
    <p class="ph-box" id="icsb-ph"><b>자리</b>${esc(MY.icsBundle.reason)}<span class="id">${esc(MY.icsBundle.fillStage)}</span></p>
  </div>
</nav>
</div>
</div>

${divider('s4b', '화면 4 · 첫 방문 온보딩', '/ (첫 방문)', '번호 1·2·3 체크 목록 · 현재 단계만 펼침(완료 = 윤곽 숫자, 다음 = 흐린 윤곽) · 위치: 홈 5줄 아래 한 줄 진입 → 펼치면 이 목록(375 첫 화면 5줄 4줄 유지) · 표본 선택 상태')}
<div class="shell">
<div class="layout">
<div class="contents"><p class="ph-box"><b>목차</b>D0 그대로</p></div>
<main class="page">
  <p class="ph-box"><b>지면</b>오늘의 5줄 — D0 혼합안 그대로(생략). 진입 줄은 5줄 바로 아래</p>
  <div class="entry" aria-label="온보딩 진입 줄">
    <span class="entry__n n" aria-hidden="true">1·2·3</span>
    <div class="entry__b"><p class="entry__t">내 명단 만들기<span>리그 → 팀 → 한국 선수 · 건너뛸 수 있다</span></p><span class="entry__a"><button class="btn btn--pri" type="button" aria-controls="ob-h">시작</button><button class="tlink" type="button">다음에</button></span></div>
  </div>
  <div style="margin-top:20px">${onboarding}</div>
</main>
</div>
</div>

${divider('s4c', '화면 4 · 검색', '오버레이 · /search/?q=김민재', '마스트헤드 검색 버튼(/·⌘K) → 오버레이(375 전면 · 1024+ 640px 판). 결과는 유형별 명단 행(선수 · 팀 · 뉴스) · ↑↓로 결과 이동 · /search/ 페이지는 같은 결과 컴포넌트 · 결과 없음은 글자만(일러스트 D3)')}
<div class="shell">
<div class="layout">
<nav class="contents" aria-label="검색 결과 유형">
  ${secH('sx-ix-h', '유형', 'INDEX')}
  <ul class="toc-ix">
    <li><a class="ix-row" href="#sx-page" aria-current="true"><span class="ix-l">전체</span><span class="lead" aria-hidden="true"></span><span class="n">${qKim.counts.players + qKim.counts.teams + qKim.counts.news}</span></a></li>
    <li><a class="ix-row" href="#sx-page"><span class="ix-l">선수</span><span class="lead" aria-hidden="true"></span><span class="n">${qKim.counts.players}</span></a></li>
    <li><a class="ix-row" href="#sx-page"><span class="ix-l">팀</span><span class="lead" aria-hidden="true"></span><span class="n">${qKim.counts.teams}</span></a></li>
    <li><a class="ix-row" href="#sx-page"><span class="ix-l">뉴스</span><span class="lead" aria-hidden="true"></span><span class="n">${qKim.counts.news}</span></a></li>
  </ul>
  <p class="note" style="margin-top:10px">${esc(SQ.rule)}</p>
</nav>
<main class="page">
  <div class="grid2">
    <figure class="frame" style="border:0;padding:0"><figcaption class="cap"><b>오버레이 · 열린 상태</b>입력 "김민재" — 첫 결과에 포커스 이동 전. 실제 버튼(마스트헤드 검색)을 누르면 질의 5개로 동작한다</figcaption>${searchFrame}</figure>
    <section id="sx-page" aria-labelledby="sx-h">
      <header class="pg-h">
        <p class="pg-k"><span>검색</span>${rh('SEARCH')}</p>
        <h1 id="sx-h" style="font-size:28px">“김민재” 검색 결과</h1>
      </header>
      <div class="sq sq--page">${IC.search}<input type="search" value="김민재" aria-label="검색어" readonly><button class="ibtn" type="button" aria-label="지우기">${IC.close}</button></div>
      ${searchBody(qKim, { lim: 3, p: 'sp' })}
    </section>
  </div>
  <div class="grid2" style="margin-top:36px">
    <figure class="frame"><figcaption class="cap"><b>뉴스 0건 묶음</b>“정우영” — 선수·팀은 있고 뉴스는 0(빈 묶음도 머리는 남긴다)</figcaption>${searchBody(qJ, { lim: 3, p: 'sj' })}</figure>
    <figure class="frame"><figcaption class="cap"><b>결과 없음</b>“${esc(SQ.empty.q)}” — ${esc(SQ.empty.note)}</figcaption>
      <div class="sx-empty"><span class="empty__n" aria-hidden="true">0</span><p><b>“<span lang="en">${esc(SQ.empty.q)}</span>” 결과가 없어요</b>선수 · 팀은 한글이나 영문 이름으로, 뉴스는 제목과 태그로 찾는다</p></div>
    </figure>
  </div>
</main>
</div>
</div>`;

/* ══════════════════════════ 홈 위젯 ══════════════════════════ */
const H = D.home;
function kcRow(r) {
  return `<li><div>${gut(r)}</div><div><p class="kc__n"><a href="${BP}/korean-players/${r.player}/" style="text-decoration:none">${esc(r.nameKo)}</a>${gl(r.goals, r.assists)}</p><p class="kc__t">${badge(r.team.slug)}<span>${esc(r.team.nameKo)} vs ${esc(r.opponent.name)} · ${esc(r.venueLabel)}</span></p></div><div class="kc__r">${resCell(r)}</div></li>`;
}
const today = H.koreanChips.today;
const kcToday = `<section class="sec" aria-labelledby="KCID">
  ${secH('KCID', '어젯밤 한국 선수', 'KOREANS', 'h2', true)}
  <p class="sub">${esc(today.window.from.dayShort)} 경기(UTC 하루 — 브리핑과 같은 창) · 제 ${today.issueNo}호</p>
  <div class="kc__0"><span class="empty__n" aria-hidden="true">${today.appearedCount}</span><p>출전 ${today.appearedCount}명<span>명단 ${today.rowCount}명</span></p></div>
  <ol class="kc">${today.rows.map(kcRow).join('')}</ol>
  <a class="tlink" href="#s1">한국 선수 ${D.players.counts.total}명 ${IC.right}</a>
</section>`;
const hot = H.transferHotList;
const hlRow = (it) => `<li><div class="hl__s0">${stg(it.status)}</div><div class="hl__r">${tier(it.bestTier)}${tm({ utc: C[it.leadCardId].lead.at.utc }, '', it.updated.short.slice(0, 5))}</div>${it.playerName ? `<p class="hl__a"><span>${esc(it.playerName)}</span>${it.registeredKorean ? arm() : ''}${it.to ? `<span class="ar" aria-hidden="true">→</span><span class="sr">행선지 </span>${badge(it.to.slug)}<span>${esc(it.to.nameKo)}</span>` : ''}</p>` : `<p class="hl__s nr__t" style="margin:0;font-size:13.5px">${titleLink(C[it.leadCardId])}</p>`}</li>`;
const hotList = `<section class="sec" aria-labelledby="HLID">
  ${secH('HLID', '이적 핫 리스트', 'TRANSFERS', 'h2', true)}
  <p class="sub">${esc(hot.rule)} · 실데이터 ${hot.count}건</p>
  <ol class="hl">${hot.items.map(hlRow).join('')}</ol>
  <a class="tlink" href="#s3">이적 ${IC.right}</a>
</section>`;
const nt = H.nationalTeam;
const ntSec = `<section class="sec" aria-labelledby="nt-h">
  ${secH('nt-h', 'A매치', 'NATIONAL TEAM', 'h2', true)}
  <p class="sub">A매치 기간에만 보인다 — 기간 판정 자리(M3-05)</p>
  <div class="nt-ph">
    <div class="ph-box" aria-label="A매치 일정 자리"><b>자리</b>일정·결과 — ${esc(nt.schedule.reason)}<span class="id">${esc(nt.schedule.fillStage)}</span><div class="ph__rows" style="display:grid;gap:6px;margin-top:10px" aria-hidden="true"><i style="display:block;height:44px;border:1px dashed var(--ink-3)"></i><i style="display:block;height:44px;border:1px dashed var(--ink-3)"></i></div></div>
    <p class="ph-box"><b>자리</b>소집 선수 — ${esc(nt.squad.reason)}<span class="id">${esc(nt.squad.fillStage)}</span></p>
  </div>
  <div class="nrs">${nt.news.ids.slice(0, 3).map((id) => newsRow(id, { p: 'hnt', small: true })).join('')}</div>
  <a class="tlink" href="${BP}/national-team/">대표팀 소식 ${nt.news.count}건 ${IC.right}</a>
</section>`;
const myNews = `<section class="sec" aria-labelledby="hmn-h">
  ${secH('hmn-h', '내 팀 소식', 'MY NEWS', 'h2', true)}
  <p class="sub">팔로우가 있을 때만 · 시안 표본 5 · 제 ${H.myTeamNews.issueDate === ISSUE.date ? ISSUE.no : ''}호 ${H.myTeamNews.count}건</p>
  <div class="nrs">${H.myTeamNews.cards.slice(0, 3).map((c) => newsRow(c.id, { p: 'hmn', small: true, why: c.followMatch.map((f) => f.label).join(' · ') })).join('')}</div>
  <a class="tlink" href="#s4">${H.myTeamNews.count}건 모두 · 마이 ${IC.right}</a>
</section>`;
const screen5 = `
${divider('s5', '홈 위젯', '/', 'PRD §4.2 순서 2 내 팀 소식 · 3 A매치 · 4 한국 선수 · 7 이적 핫 리스트 — 1280 = 마주 보는 면(오늘 밤 → 한국 선수 → 순위 → 이적), 1279 이하 = 지면 안 같은 순서 · 제 20호 실데이터(한국 선수 출전 0명 날)')}
<div class="shell">
<div class="layout layout--3">
<div class="contents"><p class="ph-box"><b>목차</b>D0 그대로</p></div>
<div class="page">
  <p class="ph-box"><b>지면</b>오늘의 5줄 — D0 혼합안 그대로(생략)</p>
  ${myNews}
  ${ntSec}
  <div class="in-flow">${kcToday.replace(/KCID/g, 'kc1-h')}
  <p class="ph-box sec"><b>자리</b>오늘 밤 볼 경기 · 주요 뉴스 — D1·D0 그대로(생략)</p>
  ${hotList.replace(/HLID/g, 'hl1-h')}</div>
</div>
<aside class="facing" aria-label="마주 보는 면">
  <p class="ph-box"><b>자리</b>오늘 밤 볼 경기 — D1 그대로(생략)</p>
  ${kcToday.replace(/KCID/g, 'kc2-h')}
  <p class="ph-box sec"><b>자리</b>리그 순위 미니 — D1 그대로(생략)</p>
  ${hotList.replace(/HLID/g, 'hl2-h')}
</aside>
</div>
</div>`;

/* ══════════════════════════ 견본 ══════════════════════════ */
const SP = D.specimens;
const apStates = SP.appearance.states;
const apRow = (s) => {
  if (s.status === 'sub') {
    const e = s.examples[0];
    return `<li><div>${gut({ appeared: true, minutes: e.minutes, status: 'sub', statusLabel: e.statusLabel })}</div><div><p class="lg__k"><span class="mono" style="color:var(--ink)">${esc(e.kickoff.short)}</span><span lang="en">${esc(e.leagueRaw)}</span><span class="state">집계 전 견본</span></p><p class="lg__o">${esc(e.nameKo)} · vs ${badge(e.opponent.slug)}<span>${esc(e.opponent.name)}</span><span class="lg__v">${esc(e.venueLabel)} · ${esc(e.enteredAt)} 투입</span></p></div><div class="lg__r">${resCell(e)}</div></li>`;
  }
  if (s.status === 'unknown') {
    return `<li class="is-ph"><span class="min min--na" aria-hidden="true">?</span><p class="lg__ph"><b>${esc(s.label)}</b><span>${esc(s.rule)} · ${esc(s.example.reason)}</span><span class="id mono">${esc(s.example.fillStage)}</span></p></li>`;
  }
  return logRow(s.example);
};
const comboTable = (() => {
  const stages = ['rumor', 'negotiating', 'agreed', 'official', 'collapsed'];
  const rows = stages
    .map((s) => {
      const cells = [1, 2, 3]
        .map((t) => {
          const c = TR.stageTierSpecimen.combos.find((x) => x.status === s && x.tier === t);
          const real = c.realItem ? TR.items.find((x) => x.id === c.realItem) : null;
          return `<td><span class="cell-n">${tier(t)}${real ? `<span class="real">실례 <b>${esc(real.playerName || '로호(이름 미등록)')}</b></span>` : ''}</span></td>`;
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
const fbRow = `<li><div><span class="min min--off" aria-hidden="true">–</span><span class="st" aria-hidden="true">폴백</span><span class="sr">폴백 — 분 정보 없음</span></div><div><p class="lg__k"><span class="mono" style="color:var(--ink)">${esc(fb.match.kickoff.dayShort)}</span>${ftab('BUNDESLIGA')}<span class="state">폴백 · FR-65</span></p><p class="lg__o">${esc(fb.nameKo)} · vs ${badge('werder-bremen')}<span>${esc(fb.match.opponent)}</span><span class="lg__v">${esc(fb.match.venueLabel)} · 분 ${esc(fb.match.minutesLabel)} · 도움 ${esc(fb.match.assistsLabel)}</span></p></div><div class="lg__r">${resCell(fb.match)}</div></li>`;
const npRows = ['notLinked', 'otherLeague'].map((k) => listRow(P[ps[k].slug])).join('');
const prof = SP.teamProfile;
const ntp = SP.nationalTeamPage;
const busy = H.koreanChips.busySpecimen;
const bayern = T['bayern-munchen'].badge;
const specimens = `
${divider('s6', '견본', '상태 · 변형', '출전 상태 5종 · 이적 단계 5 × Tier 3 · 팔로우 3상태 · 결과 가림 칸 · 선수 상태 4종 · 팀 한줄평 자리 · /national-team 구조 · 창 모드 켜짐 · 잠잠 · 붐비는 날')}
<div class="shell">
<section class="spec" aria-labelledby="sp-h" style="margin-top:28px">
  ${secH('sp-h', '견본 — 한국 선수 · 이적 · 마이', 'SPECIMENS')}
  <div class="spec-grid">
    <figure class="frame"><figcaption class="cap"><b>출전 상태 5종</b>거터 = 분(출전은 잉크, 미출전은 보조색) + 상태 글자. 교체는 원장 0건이라 집계 전 fixtures(이강인 33분)로만 · 라인업 없음은 0으로 세지 않는다</figcaption>
      <ol class="lg">${apStates.map(apRow).join('')}</ol></figure>
    <figure class="frame"><figcaption class="cap"><b>이적 단계 5 × Tier 3</b>펀치 구멍(채운 수 = 단계) + 단계 글자, Tier는 채움·실선·점선 + 글자. 실데이터는 Tier 3 루머·공식·결렬 3건뿐 — 나머지는 범례</figcaption>${comboTable}</figure>
    <figure class="frame"><figcaption class="cap"><b>팔로우 버튼 3상태</b>꺼짐 = 보조 버튼 + "+" · 켜짐 = 잉크 반전 + ✓(aria-pressed) · 한도 5 도달 = 점선 비활성(aria-disabled — 누르면 토스트로 이유). 자리: 선수 머리 · 팀 티켓 꼬리 · 온보딩 · 마이</figcaption>
      <div class="fl-row">${followBtn('off', fs0[0].example.nameKo, 'spec-off')}<span class="note">${esc(fs0[0].example.nameKo)} — ${esc(fs0[0].example.why)}</span></div>
      <div class="fl-row" style="margin-top:10px">${followBtn('on', fs0[1].example.nameKo, 'spec-on')}<span class="note">${esc(fs0[1].example.nameKo)}</span></div>
      <div class="fl-row" style="margin-top:10px">${followBtn('limit', '여섯 번째 항목', 'spec-lim')}<span class="note">${esc(fs0[2].example.note)}</span></div>
      <div class="tkm" style="margin-top:16px;--k1:${bayern.k1};--k2:${bayern.k2};--kf:${bayern.kf}"><div class="tkm__stub" aria-hidden="true"><b>${bayern.short}</b></div><span class="tkm__perf" aria-hidden="true"></span><div class="tkm__b"><b>바이에른 뮌헨</b>${followBtn('on', '바이에른 뮌헨', 'spec-team')}</div></div>
      <p class="note" style="margin-top:6px">D1 팀 티켓 몸통 오른쪽 위에 같은 버튼(축소 견본)</p></figure>
    <figure class="frame"><figcaption class="cap"><b>스코어 결과 가림 칸</b>결과 가리기 켬 → W/D/L 칩과 스코어만 빗금 칸(--hatch)으로. 분·출전 상태·골은 결과가 아니라 그대로(시안 가정). "보기"를 누르면 그 칸만 찍힘으로 드러난다</figcaption>
      <ol class="lg spo-demo">${SP.spoilerScore.examples.map((e) => logRow(PD.log5.find((l) => l.matchId === e.matchId))).join('')}</ol>
      <p class="note" style="margin-top:8px">마스트헤드 "결과 가리기"를 켜면 문서 전체의 스코어 칸이 같은 모양으로 바뀐다</p></figure>
    <figure class="frame"><figcaption class="cap"><b>선수 상태 4종</b>연결됨(위 목록) · 기록 연결 전(김지수 — API id 없음, 다음 경기는 있음) · 기타 리그(홍현석 — 갱신 중단, 목록에 남김) · 폴백(FR-65 견본 — 실제 결과·뉴스 제목만, 분·도움 "–")</figcaption>
      <table class="rg rg--c" data-view="recent" style="margin-top:0"><caption class="sr">선수 상태 견본</caption><tbody>${npRows}</tbody></table>
      <ol class="lg" style="margin-top:12px">${fbRow}</ol>
      <div class="nrs">${fb.newsCards.slice(0, 1).map((id) => newsRow(id, { p: 'fb', small: true })).join('')}</div></figure>
    <figure class="frame"><figcaption class="cap"><b>팀 한줄평 · 강점/약점 자리</b>D1 팀 티켓 바로 아래, 팀시트 위. 한줄평 끝에 "AI 작성"(5줄과 같은 상자), 강점 2 · 약점 2는 번호 행. 생성 날짜는 아래 줄 — ${esc(prof.note)}</figcaption>
      <div class="sec-h sec-h--thin"><h3>바이에른 뮌헨 — 이번 주</h3>${rh('PROFILE')}</div>
      <div class="prof">
        <p class="prof__one" aria-label="한줄평 자리"><i aria-hidden="true"></i><a class="ai" href="${BP}/about/#ai">AI 작성</a></p>
        <div class="prof__sw"><div><h4>강점</h4><ol>${prof.strengths.map((s, i) => `<li><span>${i + 1}</span><i aria-hidden="true"></i><span class="sr">${esc(s.reason)} 자리</span></li>`).join('')}</ol></div><div><h4>약점</h4><ol>${prof.weaknesses.map((s, i) => `<li><span>${i + 1}</span><i aria-hidden="true"></i><span class="sr">${esc(s.reason)} 자리</span></li>`).join('')}</ol></div></div>
        <p class="prof__f"><span>생성 날짜 자리 <span class="mono">${esc(prof.generatedAt.fillStage)}</span> · 주 1회 배치</span><span>한줄평 <span class="mono">${esc(prof.oneLiner.fillStage)}</span> · 강점/약점 <span class="mono">${esc(prof.strengths[0].fillStage)}</span></span></p>
      </div></figure>
    <figure class="frame"><figcaption class="cap"><b>/national-team 구조</b>${esc(ntp.path)} — 일정·명단은 자리, 소식은 실카드. 주요국 A매치 뉴스는 /news/?cat=national 결과와 같다</figcaption>
      <div class="nt-pg"><h3>대표팀</h3>${rh('NATIONAL TEAM')}
        ${ntp.sections.map((s) => `<div class="sec-h sec-h--thin" style="margin-top:16px"><h4 style="font-size:15px;font-weight:800">${esc(s.title)}</h4>${s.data.count != null ? `<span class="cnt">${s.data.count}</span>` : ''}</div>${s.data.placeholder ? `<p class="ph-box" style="margin-top:8px"><b>자리</b>${esc(s.data.reason)}${s.data.schemaFields ? ` · 필드 <span lang="en">${esc(s.data.schemaFields.join(', '))}</span>` : ''}<span class="id">${esc(s.data.fillStage)}</span></p>` : s.key === 'krNews' ? `<div class="nrs">${s.data.ids.slice(0, 2).map((id) => newsRow(id, { p: 'ntp', small: true })).join('')}</div>` : `<p class="note" style="margin-top:8px">${esc(s.data.rule)} — ${s.data.count}건</p>`}`).join('')}
      </div></figure>
    <figure class="frame"><figcaption class="cap"><b>이적 창 켜짐 · 잠잠</b>창 모드 켜짐 = 머리 줄 반전(날짜는 자리). 잠잠(30일 넘게 갱신 없음) = 행 전체 보조색 + "잠잠" 도장, 목록 아래로 — ${esc(TR.quietSpecimen.note)}(가장 오래된 갱신 ${esc(TR.quietSpecimen.oldestUpdate.short)})</figcaption>
      <p class="win win--on" style="margin-top:0"><span class="stamp">이적 창 열림</span><span>홈 이적 섹션이 위로(FR-105)</span><span><b>자리</b> 창 날짜 <span class="mono">${esc(TR.window.dates.fillStage)}</span></span></p>
      <div class="xr" style="color:var(--ink-2);margin-top:8px" aria-label="잠잠 견본(문구 없음)"><div class="xr__stg">${stg('rumor')}</div><div class="xr__tier"><span class="stamp" style="border-color:var(--ink-2);color:var(--ink-2)">잠잠</span></div><div class="xr__who"><span class="ph-box" style="padding:4px 8px;border-width:1px;min-width:120px">선수</span></div><div class="xr__rt"><span class="ar" aria-hidden="true">${IC.arrow}</span><span class="ph-box" style="padding:4px 8px;border-width:1px;min-width:90px">행선지</span></div><div class="xr__upd"><span>최근 갱신</span><span class="mono">30일 넘음</span></div></div></figure>
    <figure class="frame"><figcaption class="cap"><b>붐비는 날 — 제 ${busy.issueNo}호</b>${esc(busy.note)} · 출전 ${busy.appearedCount}명 · 순서 ${esc(busy.order)}</figcaption>
      <ol class="kc" style="margin-top:0">${busy.rows.map(kcRow).join('')}</ol></figure>
  </div>
</section>
</div>`;

/* ══════════════════════════ 메타 · 목차 ══════════════════════════ */
const META = {
  name: 'A 스쿼드 명단 (Squad Register)',
  one: "프로그램 뒤쪽 '선수 명단·기록지' 면 — 모든 화면이 괘선 사이 한 줄짜리 명단 행이고, 숫자 열(출전 분 · 골 · 날짜)이 주인공이다.",
  pros: [
    '3초 스캔·비교가 가장 쉽다 — 375 첫 화면(마스트헤드 아래)에 선수 5행 + 6번째 행 일부, 거터의 출전 분 열(0 · 75 · 65 · 77 …)이 위아래로 정렬되어 선수끼리 바로 비교된다',
    'D1 순위표·라운드 행과 같은 문법(번호 거터 + 괘선 + 표 머리)이라 새 모티프 0, 컴포넌트 재사용이 가장 많다',
    '데이터가 얇은 칸(집계 전 2칸 · 영문 0 · Tier 1·2 0 · 이적 3건)이 빈 행·점선 행·비활성 칩으로 조용히 처리된다',
    '375는 보기 탭(최근 · 시즌 · 다음)으로 열 묶음만 바꾸고, 1024 이상은 같은 표가 11열을 한 번에 보인다(D1 순위표 방식)',
  ],
  cons: [
    '시각적 인상이 약하다 — 한국 선수가 서비스의 주인공이라는 감정은 B(티켓)보다 덜하다',
    '화면끼리 비슷해 보인다 — 목록·상세·주간·이적·마이가 모두 명단 행이라 선수 상세가 목록과 크게 다르지 않다',
    '375 목록에서 상대 팀·다음 경기는 보기 탭 뒤에 있다(한 번에 다 보려면 1024 이상)',
    '주간 총평(LLM 문단)이 들어오면 표 아래 비고 칸이라 기사처럼 읽히지 않는다(C가 더 맞다)',
  ],
  diff: '하 — D1 표·행 컴포넌트 확장(서버 렌더). 새 섬: 보기 탭(D1 탭 섬 재사용) · 이적 필터 · 타임라인 펼침 · 팔로우 · 온보딩 · 검색 오버레이(Pagefind 지연 로드) · 결과 가림 칸',
  bundle: '폰트 변화 0 — EuroDigest Sans 400·800 + Barlow Condensed 600·800 = 417.8KB(2패밀리 4파일, D0 서브셋 그대로). 새 색 토큰 0. 섬 JS 추정 gzip 약 3KB(필터 0.8 · 팔로우 0.5 · 검색 셸 1.2 · 온보딩 0.4 · 가림 칸 0.2, 탭은 기존) — 페이지별로 나뉘어 초기 JS는 페이지당 +0.5~1.5KB',
};
const axes = [
  ['레이아웃', '1단 목록·표 주축 — 괘선 사이 한 줄 명단 행. 1024+ 목차 + 넓은 표(11열)', '카드 격자 · 티켓 스텁', '2단 지면 · 세로 타임라인'],
  ['타이포', 'Barlow 숫자 열(분·골·날짜) + 한글 800 중간 크기 이름 — 표 읽기', '큰 숫자 하나 + 나머지 작게', '한글 800 큰 제목 + 400 문단'],
  ['색', 'D0·D1 토큰 그대로 — 2도 + 대회 탭 · 키트 배지, 행마다 레드 1곳(골 · MVP 띠)', '같은 토큰 · 키트 면 넓음', '같은 토큰'],
  ['밀도', '높음 — 375 첫 화면 선수 6~7명', '중간~낮음', '낮음'],
  ['모션', '찍힘만(보기 전환 · 필터 결과 · 펼침 행 · 온보딩 단계)', '뜯김', '잉크 전환 · 도착'],
];
const metaBand = `<aside class="meta-w" aria-label="시안 정보"><details class="meta">
  <summary><span class="meta__tag">D2 시안 A</span><b>${esc(META.name)}</b><span class="meta__one">${esc(META.one)}</span><span class="meta__more" aria-hidden="true"></span></summary>
  <div class="meta__grid">
    <div><p class="meta__h">장점</p><ul>${META.pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div><p class="meta__h">단점</p><ul>${META.cons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div><p class="meta__h">구현 난이도</p><p>${esc(META.diff)}</p><p class="meta__h">번들·폰트 영향</p><p>${esc(META.bundle)}</p></div>
    <div class="span3"><p class="meta__h">축 매트릭스 — A는 B와 4축(레이아웃·타이포·밀도·모션), C와 4축이 다르다. 색은 세 안 모두 같은 토큰(새 토큰 0)</p><table class="axes"><thead><tr><th>축</th><th>A 스쿼드 명단 (이 시안)</th><th>B 시즌권</th><th>C 주간 지면</th></tr></thead><tbody>${axes.map((a) => `<tr><th>${a[0]}</th><td class="me">${esc(a[1])}</td><td>${esc(a[2])}</td><td>${esc(a[3])}</td></tr>`).join('')}</tbody></table></div>
    <div class="span3"><p class="meta__h">데이터</p><p>모든 문구·숫자는 docs/design/d2/data/d2-data.json(실데이터)에서. 기준 ${esc(REF.label)}. 원제목 무수정(D23), 뉴스 카드 AI 라벨 없음. 자리는 reason · fillStage 그대로. 마이 팔로우 상태는 시안 표본(Q2 ①). 캡처 환경(Linux)에는 한자 글꼴이 없어 원제목의 韓·獨·西가 빈칸으로 찍힌다(DESIGN §3.7)</p></div>
  </div>
</details></aside>`;
const tocItems = [
  ['s1', '1', '한국 선수 목록'], ['s1b', '1', '선수 상세 · 김민재'], ['s2', '2', '주간 리포트 W43'], ['s3', '3', '이적'], ['s4', '4', '마이'], ['s4b', '4', '온보딩'], ['s4c', '4', '검색'], ['s5', 'H', '홈 위젯'], ['s6', 'S', '견본'],
];
const toc = `<nav class="toc" aria-label="시안 구역"><ol><li><span class="toc__k">구역</span></li>${tocItems.map(([h, k, l]) => `<li><a href="#${h}"><span class="n">${k}</span><span>${esc(l)}</span></a></li>`).join('')}</ol></nav>`;

/* 검색 오버레이 (실제 동작) — 미리 계산한 질의만 */
const ovData = {};
for (const q of [...SQ.queries, SQ.empty]) ovData[q.q.toLowerCase()] = q.q;
const ovPanels = [...SQ.queries, SQ.empty]
  .map((q, i) => `<div class="ov__res" data-q="${esc(q.q.toLowerCase())}" hidden>${q.isEmpty ? `<div class="sx-empty"><span class="empty__n" aria-hidden="true">0</span><p><b>“<span lang="en">${esc(q.q)}</span>” 결과가 없어요</b>선수 · 팀은 한글이나 영문 이름으로, 뉴스는 제목과 태그로 찾는다</p></div>` : searchBody(q, { lim: 3, p: 'ov' + i })}</div>`)
  .join('');
const overlay = `<dialog class="ov" id="ov" aria-labelledby="ov-l">
  <div class="ov__in">
    <form class="sq" method="dialog" role="search" onsubmit="return false"><label class="sr" for="ov-i" id="ov-l">검색</label>${IC.search}<input id="ov-i" type="search" placeholder="선수 · 팀 · 뉴스" autocomplete="off" aria-describedby="ov-hint"><button class="ibtn" type="button" data-ov-close aria-label="검색 닫기">${IC.close}</button></form>
    <div class="ov__body">
      <div class="sq-pre" aria-label="미리 계산한 질의"><span class="note" id="ov-hint" style="flex-basis:100%;padding:6px 0 0">시안은 미리 계산한 질의 5개만 결과가 나온다(Pagefind 흉내 — d2-data.search)</span>${[...SQ.queries, SQ.empty].map((q) => `<button class="chip" type="button" data-ov-q="${esc(q.q)}"${/[a-z]/i.test(q.q) ? ' lang="en"' : ''}>${esc(q.q)}</button>`).join('')}</div>
      <div data-ov-res aria-live="polite">${ovPanels}<p class="sx-0" data-ov-none hidden>미리 계산한 질의가 아니다 — 위 다섯 개 중 하나를 고르거나 그대로 입력</p></div>
    </div>
    <p class="ov__f"><span><kbd>↑</kbd><kbd>↓</kbd>이동</span><span><kbd>Enter</kbd>열기</span><span><kbd>Esc</kbd>닫기</span><span><kbd>/</kbd>열기</span></p>
  </div>
</dialog>`;

const tabbar = `<nav class="tabbar" aria-label="하단 탭"><a href="${BP}/">${IC.home}<span>홈</span></a><a href="${BP}/news/">${IC.news}<span>뉴스</span></a><a href="${BP}/competitions/epl/">${IC.league}<span>리그</span></a><a href="${BP}/korean-players/" aria-current="page">${IC.player}<span>한국 선수</span></a><a href="${BP}/my/">${IC.my}<span>마이</span></a></nav>`;
const colophon = `<div class="shell"><footer class="colophon"><div class="colophon__in"><p class="colophon__brand">유로 다이제스트<span>제 ${ISSUE.no}호 · 2026년 10월 31일 (토)</span></p><p class="colophon__fd" lang="en">Football data provided by the Football-Data.org API</p><p class="colophon__p">경기 기록은 API-Football, 일정·순위는 football-data.org. 기사는 원제목과 원문 링크만 싣는다.</p><nav class="colophon__links" aria-label="바닥글"><a href="${BP}/about/">소개</a><a href="${BP}/about/#ai">AI 작성 안내</a></nav></div></footer></div>`;

const SCRIPT = fs.readFileSync(path.join(HERE, 'a.js'), 'utf8');
const firstComment = `<!--
  D2 시안 A — 「${META.name}」
  한 줄 설명: ${META.one}
  장점: ${META.pros.join(' / ')}
  단점: ${META.cons.join(' / ')}
  구현 난이도: ${META.diff}
  번들/폰트 영향: ${META.bundle}
  축: ${axes.map((a) => a[0] + ' = ' + a[1]).join(' · ')}
  데이터: docs/design/d2/data/d2-data.json(실데이터) — 기준 ${REF.label}. 문구 생성·LLM 호출 0. 자리 = reason · fillStage.
  생성: docs/design/d2/build-concept-a/gen.mjs (d2-data.json → 정적 HTML). 외부 의존 0, 폰트는 ../fonts/ 상대 경로.
-->`;
const html = `<!doctype html>
${firstComment}
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>D2 시안 A · 스쿼드 명단 · 유로 다이제스트</title>
<script>(function(){var d=document.documentElement,t,s;try{t=localStorage.getItem('ed-theme');s=localStorage.getItem('ed-spoiler')}catch(e){}if(s==='on')d.setAttribute('data-spoiler','on');if(t==='light'||t==='dark')d.setAttribute('data-theme',t)})();</script>
<style>
${BASE_CSS}
:root{--transfer-progress:var(--ink)}
${A_CSS}
</style>
</head>
<body>
<a class="skip" href="#main">본문 바로가기</a>
${metaBand}
${toc}
<aside class="divider" aria-label="시안 설명 — 화면 1 · 한국 선수"><span><b>화면 1 · 한국 선수</b> <code>/korean-players/</code></span><span class="divider__info">명단 표 — 리그 구간 머리 + 선수 행(거터 = 최근 경기 출전 분) · 375 보기 탭(최근 · 시즌 · 다음) / 1024+ 11열 · 기준 ${esc(REF.short)} KST · 제 ${ISSUE.no}호</span></aside>
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
console.log('wrote', OUT, html.length);
