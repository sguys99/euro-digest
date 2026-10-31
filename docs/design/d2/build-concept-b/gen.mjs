// D2 시안 B 「시즌권 (Season Pass)」 생성기 — d2-data.json 값만 옮긴다(문구·숫자 생성 0, LLM 호출 0)
// 실행: node gen.mjs <repo root>
import fs from "node:fs";
import path from "node:path";
import { CSS } from "./css.mjs";

const ROOT = process.argv[2] || process.cwd();
const D = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/design/d2/data/d2-data.json"), "utf8"));
const OUT = path.join(ROOT, "docs/design/d2/concept-b.html");
const BP = "/euro-digest";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const T = D.teams;
const C = D.cards;
const CC = { EPL: "epl", LALIGA: "laliga", SERIEA: "seriea", BUNDESLIGA: "bundesliga", LIGUE1: "ligue1", UCL: "ucl" };
const COMP = Object.fromEntries(D.labels.competitions.map((c) => [c.id, c]));

/* ── 아이콘 (D0 경로 · square cap) ── */
const svg = (p, w = 22) => `<svg class="ic" viewBox="0 0 24 24" width="${w}" height="${w}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" stroke-linejoin="miter">${p}</svg>`;
const IC = {
  search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5"/>'),
  theme: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>', 16),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  cal: svg('<path d="M4 6h16v14H4z"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/>', 18),
  bookmark: svg('<path d="M6 3.5h12v17l-6-4.5-6 4.5z"/>', 16),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 16),
  link: svg('<path d="M10 14 20 4M14 4h6v6"/><path d="M18 14v6H4V6h6"/>', 18),
  home: svg('<path d="M3.5 10.5 12 4l8.5 6.5V20h-5.5v-6h-6v6H3.5z"/>'),
  news: svg('<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 12.5h8M8 16h5"/>'),
  league: svg('<path d="M4 5h16M4 10h16M4 15h16M4 20h16"/><path d="M8.5 5v15"/>'),
  kr: svg('<path d="M8 3.5 3.5 6.5 5.5 10.5 7.5 9.5V20.5h9V9.5l2 1 2-4L16 3.5c-.6 1.7-2.2 2.8-4 2.8S8.6 5.2 8 3.5z"/>'),
  my: svg('<path d="M6 3.5h12v17l-6-4.5-6 4.5z"/>'),
};

/* ── 원자 ── */
const tm = (t, f = "short", cls = "") => (t ? `<time${cls ? ` class="${cls}"` : ""} datetime="${t.utc}">${esc(t[f])}</time>` : "");
const dayOf = (t) => t.dayShort.split(" ");
function badge(slug, size = "s", hidden = true) {
  const tt = slug ? T[slug] : null;
  const b = tt && tt.badge;
  const aria = hidden ? 'aria-hidden="true"' : `role="img" aria-label="${esc(tt ? tt.nameKo : "")} 배지 ${esc(b && b.short ? b.short : "없음")}"`;
  if (!b || b.fallback) return `<span class="bdg bdg--${size} bdg--none" ${aria}><b></b></span>`;
  return `<span class="bdg bdg--${size}" style="--k1:${b.k1};--k2:${b.k2};--kf:${b.kf}" ${aria}><b>${esc(b.short)}</b></span>`;
}
function kit(slug, cls = "", label = true) {
  const tt = slug ? T[slug] : null;
  const b = tt && tt.badge;
  const aria = label && tt ? `role="img" aria-label="${esc(tt.nameKo)} 키트 2색${b && !b.fallback ? " " + esc(b.short) : " (팀 컬러 없음)"}"` : 'aria-hidden="true"';
  if (!b || b.fallback) return `<div class="kit kit--none ${cls}" ${aria}><b></b></div>`;
  return `<div class="kit ${cls}" style="--k1:${b.k1};--k2:${b.k2};--kf:${b.kf}" ${aria}><b>${esc(b.short)}</b></div>`;
}
function ftab(comp) {
  const id = typeof comp === "string" ? comp : comp && comp.id;
  if (!id || id === "OTHER") return `<span class="ftab ftab--other" title="기타 대회(컵 등)">기타 대회</span>`;
  const c = COMP[id];
  return `<span class="ftab tab--${CC[id]}" title="${esc(c.nameKo)}">${esc(c.shortKo)}</span>`;
}
const vtab = (id) => `<span class="tab tab--${CC[id]}" title="${esc(COMP[id].nameKo)}">${esc(COMP[id].shortKo)}</span>`;
const fm = (o) => `<i class="fm fm--${o}" aria-hidden="true">${o}</i>`;
const OL = { W: "승", D: "무", L: "패" };
function res(result) {
  if (!result) return "";
  return `<span class="res">${fm(result.outcome)}<span class="sc n">${esc(result.text)}</span><span class="sr">${OL[result.outcome]} ${esc(result.text)}</span></span>`;
}
function punch(filled, status, vertical = false) {
  const n = status === "collapsed" ? 0 : filled;
  const label = status === "collapsed" ? "이적 단계: 결렬" : `이적 단계: ${D.labels.transferStage[status].label} (4단계 중 ${n})`;
  let h = "";
  for (let i = 1; i <= 4; i++) h += `<i${i <= n ? ' class="on"' : ""}></i>`;
  return `<span class="punch${vertical ? " punch--v" : ""}${status === "official" ? " punch--official" : ""}${status === "collapsed" ? " punch--collapsed" : ""}" role="img" aria-label="${label}">${h}</span>`;
}
const tier = (n) => `<span class="tier tier--${n}"><span class="sr">출처 </span>Tier ${n}</span>`;
const ph = (o, lead = "자리") => `<div class="ph"><b>${esc(lead)}</b>${esc(o.reason)}<span class="fs">${esc(o.fillStage)}</span></div>`;
const big = (val, out, unit = "", extra = "") => `<span class="big${val === "–" ? " big--dash" : out ? " big--out" : ""}${extra ? " " + extra : ""}">${esc(val)}${unit ? `<small>${esc(unit)}</small>` : ""}</span>`;
const AI = `<a class="ai" href="${BP}/about/#ai">AI 작성</a>`;

function titleHtml(t, url, src) {
  const s = esc(t);
  const i = s.lastIndexOf(" ");
  const head = i > 0 ? s.slice(0, i + 1) : "";
  const tail = i > 0 ? s.slice(i + 1) : s;
  return `<a href="${esc(url)}" target="_blank" rel="noopener">${head}<span class="nobr">${tail}<span class="ext" aria-hidden="true">↗</span></span><span class="sr">(원문 ${esc(src)}, 새 창)</span></a>`;
}

/* ── 뉴스 카드 (D0 확정 문법 그대로 — 게재 번호 없이) ── */
function card(id, opts = {}) {
  const c = C[id];
  if (!c) throw new Error("card missing " + id);
  const latin = c.lang !== "ko";
  let imp = "";
  for (let i = 1; i <= 5; i++) imp += `<i${i <= c.imp ? ' class="on"' : ""}></i>`;
  const tags = c.tags.map((t) => `<li${t.korean ? ' class="kr"' : ""}>${esc(t.label)}</li>`).join("");
  const xf = c.transfer
    ? `<p class="xfer${c.transfer.status === "official" ? " xfer--official" : ""}">${punch(c.transfer.filled, c.transfer.status)}<span class="xfer__v">${esc(c.transfer.stageLabel)}</span>${tier(c.transfer.tier)}</p>`
    : "";
  const more = c.more ? `<span class="more">+${c.more.n}${esc(c.more.unit)}</span>` : "";
  const tabs = c.comp.filter((x) => CC[x.id]).slice(0, 2).map((x) => vtab(x.id)).join("");
  const why = opts.why ? `<p class="card__why">${opts.why}</p>` : "";
  return `<article class="card" id="${opts.idPrefix || ""}${c.id}" aria-labelledby="${opts.idPrefix || ""}${c.id}-t">
  <div class="card__gut"><span class="imp" role="img" aria-label="중요도 ${c.imp}/5">${imp}</span>${c.kr ? '<span class="arm" title="한국 선수 관련">한국</span>' : ""}</div>
  <div class="card__body">
    <div class="card__tags"><span class="stamp">${esc(c.catLabel)}</span>${tags ? `<ul class="tags" aria-label="태그">${tags}</ul>` : ""}</div>${xf}
    <h3 class="card__title${latin ? " is-latin" : ""}" id="${opts.idPrefix || ""}${c.id}-t"${latin ? ` lang="${c.lang}"` : ""}>${titleHtml(c.t, c.lead.u, c.lead.n)}</h3>
    <div class="card__meta"><span class="src"${/^[A-Za-z]/.test(c.lead.n) ? ' lang="en"' : ""}>${esc(c.lead.n)}</span>${more}<time datetime="${c.lead.at.utc}"><span class="rel">${esc(c.lead.rel)}</span><span class="abs">${esc(c.lead.at.short)}</span></time></div>${why}
  </div>
  <div class="card__tabs">${tabs}</div>
</article>`;
}

/* ── 선수 티켓 (목록) ── */
function stLabel(r) {
  return `<p class="pt__st${r.appeared ? "" : " pt__st--off"}">${esc(r.statusLabel)}</p>`;
}
function oppHtml(o, home) {
  const nm = o.nameKo || o.name;
  const lang = o.nameLang === "en" ? ' lang="en"' : "";
  return `${badge(o.slug, "xs")}<span${lang}>${esc(nm)}</span>`;
}
function seasonLine(s) {
  const t = s.total;
  return `출전 <span class="n">${t.apps}</span> <span class="u">·</span> <span class="n">${t.minutes}</span>분 <span class="u">·</span> 골 <span class="n">${t.goals}</span> <span class="u">·</span> 도움 <span class="n">${t.assists}</span>`;
}
function nextLine(n) {
  if (!n || n.placeholder) return null;
  return `${tm(n.kickoff, "short")} ${ftab(n.comp)} <span class="u">${esc(n.venueLabel)}</span> ${esc(n.opponent.nameKo)}`;
}
function playerTicket(p, opts = {}) {
  const tslug = p.team && p.team.slug;
  const st = p.state.kind;
  const stamp = p.state.label ? `<span class="stamp stamp--soft">${esc(p.state.label)}</span>` : "";
  const name = `<h3 class="pt__name"><a href="${BP}/korean-players/${p.slug}/">${esc(p.nameKo)}</a></h3>`;
  const id = `<div class="pt__id"><p class="pt__k"><span>${esc(p.position)}</span><span class="t-num">${p.birthYear}</span>${stamp}</p>${name}<p class="pt__team"><b>${esc(p.team.nameKo)}</b>${p.teamStanding ? ` · ${esc(COMP[p.teamStanding.comp].shortKo)} <span class="n">${p.teamStanding.pos}</span>위` : ""}</p></div>`;
  let num, last;
  const r = p.recent;
  if (r && !r.placeholder) {
    const val = r.minutes === null ? "–" : r.minutes;
    num = `<div class="pt__num">${big(val, !r.appeared, r.minutes === null ? "" : "분")}<span class="cap">최근 경기</span></div>`;
    const goals = r.goals > 0 ? ` · <b>골 <span class="n">${r.goals}</span></b>` : "";
    last = `<div class="pt__last">${stLabel(r)}<p class="pt__m">${tm(r.kickoff)}${ftab(r.comp)}${r.roundLabel ? `<span>${esc(r.roundLabel)}</span>` : ""}</p><p class="pt__opp"><span class="u">${esc(r.venueLabel)}</span>${oppHtml(r.opponent)}${res(r.result)}${goals}</p></div>`;
  } else {
    num = `<div class="pt__num">${big("–", true)}<span class="cap">기록 없음</span></div>`;
    last = `<div class="pt__last"><p class="pt__st pt__st--off">${esc(p.state.label || "")}</p><p class="pt__m">${esc(r.reason)} <span class="t-num">${esc(r.fillStage)}</span></p></div>`;
  }
  const rows = [];
  if (p.season && !p.season.placeholder) rows.push(`<p class="pt__row"><span class="k">시즌<br><span class="t-num">10.19~</span></span><span>${seasonLine(p.season)}</span></p>`);
  else if (p.season) rows.push(`<p class="pt__row"><span class="k">시즌</span><span class="u">${esc(p.season.reason)}</span></p>`);
  const nx = nextLine(p.next);
  if (nx) rows.push(`<p class="pt__row"><span class="k">다음</span><span>${nx}</span></p>`);
  else if (p.next && p.next.placeholder) rows.push(`<p class="pt__row"><span class="k">다음</span><span class="u">${esc(p.next.reason)}</span></p>`);
  if (p.ucl && p.ucl.teamInUcl) rows.push(`<p class="pt__row"><span class="k">UCL</span><span>${esc(p.ucl.label)}${p.ucl.detail ? ` · <span class="n">${esc(p.ucl.detail.replace("분", ""))}</span>분` : ""}</span></p>`);
  return `<article class="tkt pt${st !== "linked" ? " pt--gone" : ""}" id="${opts.idPrefix || "p-"}${p.slug}" aria-label="${esc(p.nameKo)} 선수 티켓">
  ${kit(tslug, "pt__kit")}<span class="perf pt__perf" aria-hidden="true"></span>${id}${num}${last}
  <div class="pt__tail">${rows.join("")}</div>
</article>`;
}

/* ── 마스트헤드 · 내비 ── */
const I = D.meta.issue;
const REF = D.meta.reference;
function mast() {
  return `<header class="mast">
  <div class="ticket">
    <div class="ticket__brand"><p class="wordmark"><a href="${BP}/">유로 다이제스트</a></p><p class="wordmark-en" lang="en">EURO DIGEST</p><p class="tagline">매일 아침, 밤사이 유럽 축구를 한눈에.</p></div>
    <div class="ticket__tools"><button class="ibtn search" type="button" data-search-open aria-label="검색 (단축키 /)">${IC.search}<span class="search__t">검색</span><kbd>/</kbd></button><button class="ibtn" type="button" data-theme-toggle aria-label="테마: 시스템 설정 (눌러서 바꾸기)">${IC.theme}</button></div>
    <span class="ticket__perf" aria-hidden="true"></span>
    <p class="issue"><span class="issue__k">제</span><span class="issue__n">${I.no}</span><span class="issue__k">호</span></p>
    <p class="stub"><time datetime="${I.date}">2026년 10월 31일 (토)</time><span>${esc(I.publishLabel)}</span><span>업데이트 ${esc(D.meta.ledger.updatedAt.time)} KST</span></p>
  </div>
  <nav class="topnav" aria-label="주요 메뉴"><a href="${BP}/">홈</a><a href="${BP}/news/">뉴스</a><a href="${BP}/competitions/epl/">리그</a><a href="${BP}/korean-players/" aria-current="page">한국 선수</a><a href="${BP}/my/">마이</a><span class="topnav__upd">마지막 업데이트 <time datetime="${D.meta.ledger.updatedAt.utc}">${esc(D.meta.ledger.updatedAt.time)} KST</time></span></nav>
</header>`;
}
const divider = (id, title, pathTxt, info) => `<aside class="divider divider--screen${id === "s1" ? " divider--first" : ""}" id="${id}" aria-label="시안 설명 — ${esc(title)}"><span><b>${esc(title)}</b> <code>${esc(pathTxt)}</code></span><span class="divider__info">${info}</span></aside>`;

/* ═════════ 화면 1 · 한국 선수 목록 ═════════ */
function screen1() {
  const P = D.players;
  const grp = (g) => {
    const tab = g.comp === "OTHER" ? ftab("OTHER").replace("기타 대회", "기타") : ftab(g.comp);
    return `<section aria-labelledby="lg-${g.comp}"><div class="lg-h" id="g-${g.comp}">${tab}<h2 id="lg-${g.comp}">${esc(g.label)}</h2><span class="n">${g.count}</span></div>
    <div class="grid grid--3">${g.players.map((p) => playerTicket(p)).join("")}</div></section>`;
  };
  const groups = [grp(P.groups[0]), `<div class="lg-row">${P.groups.slice(1).map(grp).join("")}</div>`];
  const contents = `<nav class="contents" aria-label="리그별 한국 선수"><div class="sec-h"><h2>한국 선수</h2><span class="rh" lang="en" aria-hidden="true">SEASON PASS</span></div>
  <div class="ct">${P.groups.map((g) => `<a class="ct-row" href="#g-${g.comp}">${g.comp === "OTHER" ? ftab("OTHER").replace("기타 대회", "기타") : ftab(g.comp)}<span class="l">${esc(g.label)}</span><span class="n">${g.count}</span></a>`).join("")}</div>
  <p class="ct-k">주간 리포트</p><div class="ct"><a class="ct-row" href="#s2"><span class="l">${esc(D.weekly.isoWeekLabel)}</span><span class="n">W43</span></a></div></nav>`;
  return `${divider("s1", "화면 1 · 한국 선수 목록", "/korean-players/", `리그별 그룹 · 선수 티켓 = 키트 스텁 + <b>큰 숫자 하나(최근 경기 출전 분)</b> · 실선 = 출전 · 윤곽 = 미출전 · ${esc(REF.label)}`)}
<div class="shell">${mast()}
<div class="layout">${contents}
<div class="page" role="region" aria-labelledby="s1-h">
  <div class="pghead"><p class="sub">${esc(P.aggregationSinceLabel)} · 등록 <span class="n">${P.counts.total}</span>명 · 기록 연결 <span class="n">${P.counts.linked}</span>명</p>
  <h1 id="s1-h" class="pg-h1">한국 선수</h1></div>
  ${groups.join("")}
  <p class="note blk--s">큰 숫자 = 가장 최근 경기의 출전 시간(분). <b>실선</b>은 출전, <b>속 빈 윤곽</b>은 출전하지 않은 경기(벤치 0 · 명단 제외 –)다. 컵 경기는 화면 스키마상 '기타 대회'로만 쓴다(scope §6 #1). 스코어는 그 선수의 소속팀 득점이 먼저다.</p>
</div></div></div>`;
}

/* ═════════ 화면 1 · 김민재 상세 ═════════ */
function screen1d() {
  const pd = D.playerDetail;
  const h = pd.head;
  const all = D.players.groups.flatMap((g) => g.players);
  const P = all.find((p) => p.slug === pd.slug);
  const st = pd.season;
  const tot = st.total;
  // 머리 티켓
  const head = `<article class="tkt ph-tk" aria-labelledby="pd-h">
  <div class="ph-tk__stub">${kit(h.team.slug)}<div class="ph-tk__num">${big(tot.minutes, tot.minutes === 0, "분")}<span class="cap">시즌 출전 시간 · ${esc(st.sinceLabel)}</span></div></div>
  <span class="perf ph-tk__perf" aria-hidden="true"></span>
  <div class="ph-tk__body">
    <p class="ph-tk__comp">${ftab(h.teamStanding.comp)}<span>${esc(h.compLabel)} · ${esc(h.team.nameKo)} <span class="n">${h.teamStanding.pos}</span>위</span></p>
    <h1 id="pd-h" class="ph-tk__name">${esc(h.nameKo)}</h1>
    <p class="ph-tk__en" lang="en">${esc(h.nameEn)}</p>
    <p class="ph-tk__facts"><span><b>${esc(h.position)}</b></span><span><span class="n">${h.birthYear}</span>년생</span><span>출전 <span class="n">${tot.apps}</span> · 선발 <span class="n">${tot.starts}</span></span><span>골 <span class="n">${tot.goals}</span> · 도움 <span class="n">${tot.assists}</span></span><span>벤치 <span class="n">${tot.bench}</span> · 명단 제외 <span class="n">${tot.absent}</span></span></p>
    <div class="ph-tk__act">${followBtn("kim-min-jae", "김민재", true)}<a class="btn" href="${BP}/teams/${h.team.slug}/">${esc(h.team.nameKo)} 팀 화면</a></div>
  </div>
  <div class="ph-tk__tail">
    <div class="cell"><p class="cell__k">UCL<span>리그 페이즈</span></p><p class="cell__v">${esc(pd.ucl.label)} · <span class="t-num">${esc(pd.ucl.detail)}</span></p></div>
    <div class="cell"><p class="cell__k">이적설</p><p class="cell__v">${punch(1, "rumor")}<a href="#tr_kim-min-jae">루머 · 아스널</a></p></div>
    <div class="cell"><p class="cell__k">대표팀<span>소집 소식</span></p><p class="cell__v"><a href="#pd-nat">관련 카드 <span class="t-num">${pd.nationalNews.ids.length}</span>장</a></p></div>
  </div>
</article>`;
  // 시즌 기록
  const pass = `<section class="wide" aria-labelledby="pd-se"><div class="bh"><h2 id="pd-se">대회별 시즌 기록</h2><p class="sub">${esc(st.sinceLabel)} — 집계 전 경기는 원장에 없어 더하지 않는다. 큰 숫자 = 출전 경기 수(윤곽 = 0)</p></div>
  <div class="tkt"><div class="pass">${st.byComp.map((b) => `<div class="pass__c">${ftab(b.comp)}${big(b.apps, b.apps === 0)}<p class="cap">경기 출전</p><p class="v"><span><span class="n">${b.minutes}</span>분</span><span>골 <span class="n">${b.goals}</span> · 도움 <span class="n">${b.assists}</span></span><span>벤치 <span class="n">${b.bench}</span></span><span>명단 제외 <span class="n">${b.absent}</span></span></p></div>`).join("")}</div>
  <p class="pass__tot"><b>합계</b><span>경기 <span class="n">${tot.rows}</span></span><span>출전 <span class="n">${tot.apps}</span></span><span><span class="n">${tot.minutes}</span>분</span><span>골 <span class="n">${tot.goals}</span> · 도움 <span class="n">${tot.assists}</span></span></p></div></section>`;
  // 최근 5경기 스텁
  const stubs = pd.log5.map((r) => {
    if (r.placeholder) return `<li><div class="ms--empty">${big("–", true)}<p><b>${esc(r.label)}</b>원장에 없음 · 백필 불가(D27 4항)<br><span class="t-num">${esc(r.fillStage)}</span></p></div></li>`;
    const [dd, wd] = dayOf(r.kickoff);
    const val = r.minutes === null ? "–" : r.minutes;
    return `<li><article class="tkt ms" aria-label="${esc(r.kickoff.date)} ${esc(r.comp.nameKo)} ${esc(r.opponent.name)}전 — ${esc(r.statusLabel)}">
    <div class="ms__top"><p class="ms__d"><time datetime="${r.kickoff.utc}">${esc(dd)}</time><span>${esc(wd)}</span><span class="t">${esc(r.kickoff.time)}</span></p><p class="ms__c">${ftab(r.comp)}<span>${esc(r.roundLabel)}</span></p></div>
    <div class="ms__perf" aria-hidden="true"></div>
    <div class="ms__mid">${big(val, !r.appeared, r.minutes === null ? "" : "분")}<p class="ms__st${r.appeared ? "" : " ms__st--off"}">${esc(r.statusLabel)}</p></div>
    <div class="ms__bot"><p class="ms__vr"><span>${esc(r.venueLabel)}</span>${res(r.result)}</p><p class="ms__opp">${oppHtml(r.opponent)}</p></div>
  </article></li>`;
  });
  const log = `<section class="wide" aria-labelledby="pd-lg"><div class="bh"><h2 id="pd-lg">최근 5경기</h2><p class="sub">경기 스텁 5장 — 빈 스텁 = 집계 시작(10.19) 전. 스코어는 바이에른 뮌헨 득점이 먼저(W/D/L + 홈·원정 병기)</p></div>
  <ol class="stubs" tabindex="0" aria-label="최근 5경기 스텁 (옆으로 넘기기)">${stubs.join("")}</ol></section>`;
  // 다음 경기 입장권
  const n = pd.next;
  const [nd, nw] = dayOf(n.kickoff);
  const upc = pd.upcoming.slice(1).map((u) => `<li>${tm(u.kickoff)}${ftab(u.comp)}<span>${esc(u.roundLabel)}</span><span class="u">${esc(u.venueLabel)}</span><b>${esc(u.opponent.nameKo)}</b></li>`).join("");
  const adm = `<section aria-labelledby="pd-nx"><div class="bh"><h2 id="pd-nx">다음 경기</h2><p class="sub">킥오프 KST</p></div>
  <article class="tkt adm" aria-label="다음 경기 ${esc(n.kickoff.datetime)} ${esc(n.opponent.nameKo)}전">
    <div class="adm__stub">${big(n.kickoff.time, false)}<time class="d" datetime="${n.kickoff.utc}">${esc(nd)} ${esc(nw)}</time></div>
    <span class="perf" aria-hidden="true"></span>
    <div class="adm__body"><p class="adm__c">${ftab(n.comp)}<span>${esc(n.roundLabel)} · ${esc(n.venueLabel)} 경기</span></p>
      <div class="adm__vs">${badge(n.homeTeam.slug, "s")}<span>${esc(n.homeTeam.nameKo)} <span class="tag">홈</span></span>${badge(n.awayTeam.slug, "s")}<span>${esc(n.awayTeam.nameKo)} <span class="tag">원정</span></span></div>
      <div class="adm__act"><button class="btn" type="button" data-toast-msg="자리 — .ics 경로·파일은 빌드 산출물(M4-12)">${IC.cal}캘린더에 추가</button><span class="note">.ics · <b>자리</b> M4-12</span></div>
    </div>
  </article>
  <ul class="upc" aria-label="이어지는 경기">${upc}</ul></section>`;
  // 이적설 연결
  const xi = D.transfers.items.find((x) => x.id === pd.transferLink.transferId);
  const xfer = `<section aria-labelledby="pd-xf"><div class="bh"><h2 id="pd-xf">이적설</h2><p class="sub">이적 카드로 연결 — 단계는 기사 분류 코드가 정한다</p></div>${transferTicket(xi, { compact: true, idPrefix: "pd-" })}</section>`;
  // 관련 뉴스
  const ko = pd.news.ko.slice(0, 5).map((id) => card(id, { idPrefix: "pdn-" })).join("");
  const news = `<section aria-labelledby="pd-nw"><div class="bh"><h2 id="pd-nw">관련 뉴스</h2></div>
  <div class="ptabs" role="tablist" aria-label="관련 뉴스 언어"><button role="tab" type="button" id="pdt-ko" aria-selected="true" aria-controls="pdp-ko" tabindex="0">한국어<span class="n">${pd.news.total}</span></button><button role="tab" type="button" id="pdt-en" aria-selected="false" aria-controls="pdp-en" tabindex="-1">영문<span class="n">0</span></button></div>
  <div class="pn" id="pdp-ko" role="tabpanel" aria-labelledby="pdt-ko"><div class="feed">${ko}</div><a class="tlink" href="${BP}/search/?q=%EA%B9%80%EB%AF%BC%EC%9E%AC">${pd.news.total}장 모두 보기</a></div>
  <div class="pn" id="pdp-en" role="tabpanel" aria-labelledby="pdt-en" hidden><div class="sempty"><p class="sempty__n" aria-hidden="true">0</p><p class="sempty__t">영문 관련 뉴스 0장</p>${ph(pd.news.en)}</div></div></section>`;
  const nat = `<section aria-labelledby="pd-nat-h" id="pd-nat"><div class="bh"><h2 id="pd-nat-h">대표팀 소집 소식</h2><p class="sub">대표팀 분류 + 김민재 태그 카드 — 소집 명단 데이터는 자리(M3-05)</p></div><div class="feed">${pd.nationalNews.ids.map((id) => card(id, { idPrefix: "pdc-" })).join("")}</div></section>`;
  const contents = `<nav class="contents" aria-label="한국 선수"><div class="sec-h"><h2>한국 선수</h2></div><div class="ct">${all.map((p) => `<a class="ct-row" href="#p-${p.slug}"${p.slug === pd.slug ? ' aria-current="page"' : ""}>${badge(p.team.slug, "xs")}<span class="l">${esc(p.nameKo)}</span></a>`).join("")}</div></nav>`;
  return `${divider("s1d", "화면 1 · 선수 상세 — 김민재", "/korean-players/kim-min-jae/", `머리 = 큰 선수 티켓(D1 팀 티켓과 같은 스텁 · 절취선 · 꼬리표) · 큰 숫자 = 시즌 출전 시간 · 로그 = 경기 스텁 5장 · 팔로우 표본 켜짐`)}
<div class="shell"><div class="layout">${contents}
<div class="page" role="region" aria-labelledby="pd-h">${head}
<div class="dg">${pass}${log}${adm}${xfer}${news}${nat}</div>
</div></div></div>`;
}

/* ── 팔로우 버튼 ── */
function followBtn(key, name, on, opts = {}) {
  const dis = opts.limit && !on;
  return `<button class="fol${opts.sm ? " fol--sm" : ""}" type="button" data-follow="${key}" data-name="${esc(name)}" aria-pressed="${on ? "true" : "false"}"${dis ? ' aria-disabled="true"' : ""}><span class="fol__s" aria-hidden="true"><span class="off">${IC.bookmark}</span><span class="on">${IC.check}</span></span><span class="fol__t">${on ? "팔로우 중" : dis ? "팔로우 5/5" : "팔로우"}</span><span class="sr"> — ${esc(name)}</span></button>`;
}

/* ═════════ 화면 2 · 주간 리포트 W43 ═════════ */
function screen2() {
  const W = D.weekly;
  const mvp = W.mvp;
  const g = mvp.goalDetail[0];
  const mrow = W.rows.find((r) => r.player === mvp.player);
  const head = `<article class="tkt wk" aria-labelledby="wk-h">
  <div class="wk__s">${big("43", false)}<span class="cap">2026 · 주차</span></div><span class="perf wk__p" aria-hidden="true"></span>
  <div class="wk__b"><span class="stamp">주간 리포트</span><h1 id="wk-h">한국 선수 주간 리포트</h1><p class="wk__range"><span class="t-num">${esc(W.range.label)}</span><span>· ${esc(W.isoWeekLabel)}</span><span>· 10.26 (월) 발행</span></p></div>
  <nav class="wk__t" aria-label="주간 리포트 넘기기"><div class="wk__nav"><span>‹ 지난주</span><b>첫 리포트예요</b></div><div class="wk__nav"><span>다음 주 ›</span><b>W44 · <span class="t-num">11.02</span> (월) 발행 예정</b></div></nav>
</article>`;
  const mvpT = `<article class="tkt mvp" aria-labelledby="mvp-h">
  ${kit(mrow.team.slug, "mvp__kit")}<span class="perf mvp__perf" aria-hidden="true"></span>
  <div class="mvp__num">${big(mvp.score, false)}<span class="cap">MVP 점수</span></div>
  <div class="mvp__body"><span class="stamp stamp--red">이번 주 MVP</span><h2 id="mvp-h" class="mvp__name">${esc(mvp.nameKo)}</h2><p class="mvp__team"><b>${esc(mrow.team.nameKo)}</b> · 출전 <span class="n">${mrow.apps}</span> · <span class="n">${mrow.minutes}</span>분</p>
    <div class="mvp__g"><p><b>골 <span class="t-num">${esc(g.goalMinutes.join(", "))}′</span></b></p><p>${tm(g.kickoff)} ${ftab("BUNDESLIGA")} 홈 · ${esc(g.opponent)}</p><p>${res(g.result)} <span class="note">마인츠 득점 먼저</span></p></div></div>
  <p class="mvp__tail"><span><b>점수</b> ${esc(mvp.breakdown).replace(/(\d+)/g, '<span class="n">$1</span>')}</span><span>규칙 ${esc(mvp.rule)}</span><span>다음 순위 1점 — ${mvp.runnersUp.filter((x) => x.score === 1).map((x) => esc(x.nameKo)).join(" · ")}</span></p>
</article>`;
  const ws = W.rows.map((r) => {
    const out = r.minutes === 0;
    const ml = r.matches.map((m) => {
      const w = m.minutes ? Math.round((m.minutes / 90) * 100) : 0;
      const off = !["start", "sub"].includes(m.status);
      return `<li><time datetime="${m.kickoff.utc}">${esc(m.kickoff.dayShort.split(" ")[0])}</time><span class="o"><span>${ftab(m.comp)}<span>${esc(m.opponent)}</span></span><span class="s${off ? " s--off" : ""}">${esc(m.statusLabel)}${m.minutes ? ` <span class="n">${m.minutes}</span>분` : ""}${m.goals ? ` · 골 <span class="n">${m.goals}</span>` : ""}</span></span><i class="mbar${m.status === "absent" ? " mbar--abs" : ""}" style="--w:${w}%" aria-hidden="true"></i></li>`;
    }).join("");
    return `<article class="tkt ws${r.player === mvp.player ? " ws--mvp" : ""}" aria-label="${esc(r.nameKo)} 주간 기록">
    ${kit(r.team.slug, "ws__kit")}<span class="perf ws__perf" aria-hidden="true"></span>
    <div class="ws__num">${big(r.minutes, out, "분")}<span class="cap">주간 출전</span></div>
    <div class="ws__body"><p class="ws__n"><b>${esc(r.nameKo)}</b><span>${esc(r.team.nameKo)}</span>${r.player === mvp.player ? '<span class="stamp stamp--red">MVP</span>' : ""}</p>
      <p class="ws__stat"><span>출전 <span class="n">${r.apps}</span></span><span>골 <span class="n">${r.goals}</span></span><span>도움 <span class="n">${r.assists}</span></span><span>점수 <span class="n">${r.mvpScore}</span></span></p>
      <ul class="ws__ml">${ml}</ul></div>
  </article>`;
  }).join("");
  const sum = `<section class="sum" aria-labelledby="sum-h"><div class="bh"><h2 id="sum-h">이번 주 총평</h2></div>
  <div class="sum__box"><p class="sum__h"><b>총평 ${esc(W.summary.sentences)}문장</b>${AI}<span class="note">← 라벨 위치: 문단 머리 오른쪽(5줄 AI 줄과 같은 라벨)</span></p>
  <div class="sum__lines" aria-hidden="true"><i></i><i></i><i></i><i></i></div>${ph(W.summary)}</div></section>`;
  const exc = `<p class="note blk--s">표 밖: ${W.excluded.map((x) => `<b>${esc(x.nameKo)}</b> ${esc(x.reason)}`).join(" · ")}. 주 경계 = UTC 하루(브리핑과 같은 '현지' 경기일 — scope §6 #2 추천안). 정렬 = MVP 점수 → 출전 시간 → 명단 순(시안 가정).</p>`;
  const contents = `<nav class="contents" aria-label="주간 리포트"><div class="sec-h"><h2>주간 리포트</h2><span class="rh" lang="en" aria-hidden="true">WEEKLY</span></div>
  <div class="ct"><a class="ct-row" href="#s2" aria-current="page"><span class="l">W43 · 10.19~10.25</span></a><span class="ct-row is-dis"><span class="l">W44 · 11.02 발행 예정</span></span></div>
  <p class="ct-k">선수</p><div class="ct">${W.rows.map((r) => `<span class="ct-row">${badge(r.team.slug, "xs")}<span class="l">${esc(r.nameKo)}</span><span class="n">${r.minutes}</span></span>`).join("")}</div></nav>`;
  return `${divider("s2", "화면 2 · 주간 리포트 W43", W.archive.path, `주차 티켓(꼬리표 = ‹ 지난주 · 다음 주 ›) · MVP 티켓 큰 숫자 = 점수(코드 규칙) · 선수 스텁 큰 숫자 = 주간 출전 분 + 경기별 90분 막대 · 총평 = LLM 자리 · 발행일 10.26은 가정(실제 발행 M3-06)`)}
<div class="shell"><div class="layout">${contents}
<div class="page" role="region" aria-labelledby="wk-h">${head}${mvpT}
<section class="blk" aria-labelledby="ws-h"><div class="bh"><h2 id="ws-h">선수별 기록<span class="n">${W.rows.length}</span></h2><p class="sub">출전 · 시간 · 골 · 도움 — 막대 = 그 경기 출전 시간 / 90분(벤치 = 빈 막대, 명단 제외 = 점선)</p></div>
<div class="grid grid--3">${ws}</div>${exc}</section>
${sum}
</div></div></div>`;
}

/* ═════════ 화면 3 · 이적 ═════════ */
function transferTicket(x, opts = {}) {
  const pre = opts.idPrefix || "";
  const status = x.status;
  const lead = C[x.timeline[x.timeline.length - 1]];
  const nameRow = x.playerName
    ? `<p class="xt__name">${esc(x.playerName)}${x.registeredKorean ? '<span class="arm" title="등록 한국 선수">한국</span>' : ""}</p>`
    : `<h3 class="xt__title">${titleHtml(lead.t, lead.lead.u, lead.lead.n)}</h3>`;
  const dl = [];
  if (x.affiliation) dl.push(`<dt>소속</dt><dd>${badge(x.affiliation.team.slug, "xs")}${esc(x.affiliation.team.nameKo)}</dd>`);
  if (x.to) dl.push(`<dt>행선지</dt><dd><i class="arrow" aria-hidden="true"></i>${badge(x.to.slug, "xs")}${esc(x.to.nameKo)}</dd>`);
  const stub = status === "collapsed"
    ? `<span class="big big--dash">–<small>/4</small></span><span class="xt__stage xt__stage--collapsed">결렬</span>`
    : `<span class="big${status === "official" ? " big--red" : ""}">${x.filled}<small>/4</small></span><span class="xt__stage${status === "official" ? " xt__stage--official" : ""}">${esc(x.stageLabel)}</span>`;
  const tl = x.history.map((h) => {
    const c = C[h.card];
    return `<li><span><time datetime="${h.at.utc}">${esc(h.at.short)}</time><span class="st">${punch(D.labels.transferStage[h.status].filled, h.status)}${esc(h.stageLabel)}</span></span><p class="t">${titleHtml(c.t, c.lead.u, c.lead.n)}</p><p class="m"><b>${esc(c.lead.n)}</b> · ${tier(c.lead.tier)}</p></li>`;
  }).join("");
  const open = !!opts.open;
  const more = opts.compact ? "" : `<div class="xt__more"><button class="xt__btn" type="button" aria-expanded="${open}" aria-controls="${pre}${x.id}-tl"><span>기사 타임라인 <span class="n">${x.history.length}</span>건</span>${IC.down}</button><ol class="tl" id="${pre}${x.id}-tl"${open ? "" : " hidden"}>${tl}</ol></div>`;
  const teams = [x.affiliation && x.affiliation.team.slug, x.to && x.to.slug].filter(Boolean);
  const fteam = D.transfers.filters.team.filter((t) => teams.includes(t.slug) || (lead.tags || []).some((g) => g.slug === t.slug)).map((t) => t.slug);
  return `<article class="tkt xt${x.quiet ? " xt--quiet" : ""}" id="${pre}${x.id}" data-x data-comps="${x.comps.map((c) => c.id).join(" ")}" data-teams="${fteam.join(" ")}" data-status="${status}" data-tier="${x.bestTier}" data-kr="${x.registeredKorean ? 1 : 0}" aria-label="이적 — ${esc(x.playerName || "선수 이름 없음(원제목 표시)")} · ${esc(x.stageLabel)}">
  <div class="xt__body"><p class="xt__top"><span class="stamp">이적</span>${tier(x.bestTier)}<span>최근 갱신 <time datetime="${x.updated.utc}">${esc(x.updated.short)}</time></span>${x.comps.map((c) => ftab(c)).join("")}</p>${nameRow}${dl.length ? `<dl class="xt__dl">${dl.join("")}</dl>` : ""}</div>
  <div class="perf xt__perf" aria-hidden="true">${punch(x.filled, status, true).replace('role="img"', 'aria-hidden="true"').replace(/ aria-label="[^"]*"/, "")}</div>
  <div class="xt__stub" role="img" aria-label="${status === "collapsed" ? "이적 단계: 결렬" : `이적 단계: ${esc(x.stageLabel)} (4단계 중 ${x.filled})`}">${stub}</div>
  ${more}
</article>`;
}
function screen3() {
  const X = D.transfers;
  const F = X.filters;
  const chip = (attr, val, label, n, kr = false) => `<button class="chip${kr ? " chip--kr" : ""}" type="button" data-f="${attr}" data-v="${val}" aria-pressed="false"${n === 0 ? ' aria-disabled="true"' : ""}>${esc(label)}<span class="n">${n}</span></button>`;
  const groups = [
    ["리그", F.league.map((l) => chip("comps", l.id, l.shortKo, l.count))],
    ["팀", F.team.map((t) => chip("teams", t.slug, t.label, t.count))],
    ["상태", F.status.map((s) => chip("status", s.id, s.label, s.count))],
    ["Tier", F.tier.map((t) => chip("tier", t.tier, t.label, t.count))],
    ["한국 선수", [chip("kr", "1", "한국 선수만", F.korean.count, true)]],
  ];
  const mobileF = `<details class="fl fl--m"><summary><span>필터 <span class="n">5</span>축</span><span class="n" data-xcount-m>${X.counts.items}건</span>${IC.down}</summary>${groups.map(([k, cs]) => `<div class="fg"><p class="fg__k">${k}</p><div class="chips">${cs.join("")}</div></div>`).join("")}</details>`;
  const crow = (attr, val, label, n, pre = "") => `<button class="ct-row${n === 0 ? " is-dis" : ""}" type="button" data-f="${attr}" data-v="${val}" aria-pressed="false"${n === 0 ? ' aria-disabled="true"' : ""}>${pre}<span class="l">${esc(label)}</span><span class="n">${n}</span></button>`;
  const contents = `<nav class="contents" aria-label="이적 필터"><div class="sec-h"><h2>필터</h2><span class="rh" lang="en" aria-hidden="true">TRANSFERS</span></div>
  <p class="ct-k">리그</p><div class="ct">${F.league.map((l) => crow("comps", l.id, l.label, l.count, ftab(l.id))).join("")}</div>
  <p class="ct-k">상태</p><div class="ct">${F.status.map((s) => crow("status", s.id, s.label, s.count, punch(D.labels.transferStage[s.id].filled, s.id).replace('role="img"', 'aria-hidden="true"'))).join("")}</div>
  <p class="ct-k">Tier</p><div class="ct">${F.tier.map((t) => crow("tier", t.tier, t.label, t.count)).join("")}</div>
  <p class="ct-k">팀</p><div class="ct">${F.team.map((t) => crow("teams", t.slug, t.label, t.count, badge(t.slug, "xs"))).join("")}</div>
  <p class="ct-k">한국 선수</p><div class="ct">${crow("kr", "1", "한국 선수만", F.korean.count, '<span class="arm">한국</span>')}</div></nav>`;
  const win = `<div class="tkt win" aria-label="이적 창"><div class="win__s"><span class="cap">이적 창</span><span class="stamp stamp--soft">창 모드 꺼짐</span></div><span class="perf" aria-hidden="true"></span><div class="win__b">${ph(X.window.dates)}<p class="note">창 모드가 켜지면 홈 이적 섹션이 위로 올라온다(FR-105) — 켜짐 상태는 아래 견본</p></div></div>`;
  const items = X.items.map((x, i) => transferTicket(x, { open: i === 0 })).join("");
  // 견본: 잠잠 · 창 켜짐 · 없는 단계
  const quiet = `<article class="tkt xt xt--quiet" aria-label="잠잠 견본"><div class="xt__body"><p class="xt__top"><span class="stamp stamp--soft">이적</span><span class="stamp stamp--soft">잠잠</span><span>최근 갱신 30일 넘음</span></p><div class="sum__lines" aria-hidden="true"><i></i><i></i></div><p class="note">견본 · 문구 없음 — 실데이터 <span class="n">${X.quietSpecimen.realCount}</span>건(가장 오래된 갱신 <span class="t-num">${esc(X.quietSpecimen.oldestUpdate.short)}</span>, 21일). 목록 맨 아래로, 테두리 점선</p></div><div class="perf xt__perf" aria-hidden="true"><span class="punch punch--v" aria-hidden="true"><i class="on"></i><i></i><i></i><i></i></span></div><div class="xt__stub"><span class="big big--out">1<small>/4</small></span><span class="xt__stage">잠잠</span></div></article>`;
  const winOn = `<div class="tkt win" aria-label="이적 창 켜짐 견본"><div class="win__s"><span class="cap">이적 창</span><span class="stamp stamp--red">창 모드 켜짐</span></div><span class="perf" aria-hidden="true"></span><div class="win__b"><div class="ph"><b>견본</b>창 열림 · 닫힘 날짜 — 자리<span class="fs">M4-03</span></div><p class="note">켜짐 = 스텁 도장만 레드로 바뀌고(면 칠하기 없음) 홈에서 이적 핫 리스트가 한국 선수 칩 바로 아래로 올라온다</p></div></div>`;
  return `${divider("s3", "화면 3 · 이적", "/transfers/", `이적 티켓 = 몸통 · 절취선 위 검표 펀치 4 · 스텁(큰 숫자 n/4) · 소속 칸은 등록 한국 선수만(Q3 1안) · 출발(from)은 데이터에 없어 비움 · 필터는 실제로 걸린다`)}
<div class="shell"><div class="layout">${contents}
<div class="page" role="region" aria-labelledby="s3-h"><p class="sub">이적 소식 · 단계는 코드 분류(루머 → 협상 → 합의 → 공식, 예외 결렬)</p><h1 id="s3-h" class="pg-h1">이적</h1>
${win}${mobileF}
<p class="result-n" aria-live="polite"><span class="n" data-xcount>${X.counts.items}</span>건 · 최근 갱신 순, 잠잠은 아래로</p>
<div class="grid grid--2 xlist" style="margin-top:12px">${items}</div>
<p class="note" data-xempty hidden style="margin-top:12px">조건에 맞는 이적이 없어요 — Tier 1·2와 협상·합의 단계는 지금 실데이터 0건이다(scope §6 #5).</p>
<section class="blk" aria-labelledby="s3-sp"><div class="bh"><h2 id="s3-sp">견본 — 잠잠 · 창 모드 켜짐</h2><p class="sub">${esc(X.missingStages.reason)} — ${esc(X.missingStages.fillStage)}</p></div>
<div class="grid grid--2">${quiet}${winOn}</div></section>
</div></div></div>`;
}

/* ═════════ 화면 4 · 마이 · 온보딩 · 검색 ═════════ */
function walletItem(kind, o, i) {
  const id = kind === "team" ? `w-${o.team.slug}-team` : `w-${o.slug}-player`;
  if (kind === "team") {
    const s = o.standing;
    const n = o.next;
    const rec = o.recent.map((r) => `<li>${tm(r.kickoff)}${ftab(r.comp)}<span class="u">${esc(r.venueLabel)}</span><span>${esc(r.opponent.nameKo)}</span>${res(r.result)}</li>`).join("");
    const upc = o.upcoming.map((u) => `<li>${tm(u.kickoff)}${ftab(u.comp)}<span class="u">${esc(u.venueLabel)}</span><span>${esc(u.opponent.nameKo)}</span></li>`).join("");
    return `<li><article class="tkt wt" aria-labelledby="${id}-n">
    <button class="wt__h" type="button" aria-expanded="${i === 0}" aria-controls="${id}-p">${kit(o.team.slug, "", false)}<span class="perf" aria-hidden="true"></span><span class="wt__hb"><b id="${id}-n">${esc(o.team.nameKo)}</b><span>다음 ${tm(n.kickoff)} · ${esc(n.venueLabel)} ${esc(n.opponent.nameKo)}</span></span><span class="wt__ic">${IC.down}</span></button>
    <div class="wt__p" id="${id}-p"${i === 0 ? "" : " hidden"}>
      <p class="wt__row"><span class="k">순위</span><span>${ftab(s.comp)} <span class="t-num">${s.pos}</span>위 · 승점 <span class="t-num">${s.pts}</span> · <span class="t-num">${s.played}</span>경기</span></p>
      <div class="wt__row"><span class="k">다음</span><ul class="wt__rec">${upc}</ul></div>
      <div class="wt__row"><span class="k">최근</span><ul class="wt__rec">${rec}</ul></div>
      <div class="wt__act">${followBtn(o.team.slug, o.team.nameKo, true, { sm: true })}<a class="btn" href="${BP}/teams/${o.team.slug}/">팀 화면</a></div>
    </div></article></li>`;
  }
  const r = o.recent;
  const n = o.next;
  return `<li><article class="tkt wt" aria-labelledby="${id}-n">
    <button class="wt__h" type="button" aria-expanded="false" aria-controls="${id}-p">${kit(o.team.slug, "", false)}<span class="perf" aria-hidden="true"></span><span class="wt__hb"><b id="${id}-n">${esc(o.nameKo)} <span class="arm">한국</span></b><span>${esc(o.team.nameKo)} · 다음 ${tm(n.kickoff)}</span></span><span class="wt__ic">${IC.down}</span></button>
    <div class="wt__p" id="${id}-p" hidden>
      <p class="wt__row"><span class="k">최근</span><span><b>${esc(r.statusLabel)}</b>${r.minutes ? ` <span class="t-num">${r.minutes}</span>분` : ""} · ${tm(r.kickoff)} ${ftab(r.comp)} ${esc(r.venueLabel)} ${esc(r.opponent.name)} ${res(r.result)}</span></p>
      <p class="wt__row"><span class="k">다음</span><span>${tm(n.kickoff)} ${ftab(n.comp)} ${esc(n.venueLabel)} ${esc(n.opponent.nameKo)}</span></p>
      <div class="wt__act">${followBtn(o.slug, o.nameKo, true, { sm: true })}<a class="btn" href="${BP}/korean-players/${o.slug}/">선수 화면</a></div>
    </div></article></li>`;
}
function onboarding() {
  const O = D.onboarding;
  const [s1, s2, s3] = O.steps;
  const sel1 = s1.sampleSelected;
  const leagues = s1.options.map((l) => `<button class="pick" type="button" data-pick="league" aria-pressed="${sel1.includes(l.id)}"><span class="ck" aria-hidden="true"></span>${ftab(l.id)}<span class="l">${esc(l.nameKo)}<span class="s"><span class="t-num">${l.teamCount}</span>팀</span></span></button>`).join("");
  const sel2 = s2.sampleSelected;
  const tabs = s2.byLeague.map((b, i) => `<button role="tab" type="button" id="obt-${b.comp.id}" aria-selected="${i === 0}" aria-controls="obp-${b.comp.id}" tabindex="${i === 0 ? 0 : -1}">${esc(b.comp.shortKo)}<span class="n">${b.teams.length}</span></button>`).join("");
  const panels = s2.byLeague.map((b, i) => `<div class="pn" id="obp-${b.comp.id}" role="tabpanel" aria-labelledby="obt-${b.comp.id}"${i === 0 ? "" : " hidden"}><div class="ob__teams" style="margin-top:12px">${b.teams.map((t) => `<button class="pick pick--row" type="button" data-pick="team" aria-pressed="${sel2.includes(t.slug)}"><span class="ck" aria-hidden="true"></span>${badge(t.slug, "xs")}<span class="l">${esc(t.nameKo)}<span class="s"><span class="t-num">${t.pos}</span>위</span></span>${t.hasKorean ? '<span class="arm" title="한국 선수 소속">한국</span>' : ""}</button>`).join("")}</div></div>`).join("");
  const sel3 = s3.sampleSelected;
  const players = s3.options.map((p) => `<button class="pick" type="button" data-pick="player" aria-pressed="${sel3.includes(p.slug)}"><span class="ck" aria-hidden="true"></span>${badge(p.team.slug, "xs")}<span class="l">${esc(p.nameKo)}<span class="s">${esc(p.team.nameKo)} · ${esc(p.position)}</span></span>${p.state.label ? `<span class="stamp stamp--soft">${esc(p.state.label)}</span>` : ""}</button>`).join("");
  const step = (no, key, title, sum, body, foot, state) => `<section class="tkt ob__st is-${state}" data-ob-step="${no}" aria-labelledby="ob-${no}-t">
    <div class="ob__h"><span class="ob__no" aria-hidden="true">${no}<small>/3</small></span><span class="perf" aria-hidden="true"></span><p class="ob__t"><b id="ob-${no}-t">${no}단계 · ${esc(title)}</b><span data-ob-sum="${no}">${sum}</span></p><span class="ob__ok">${state === "done" ? "완료" : state === "next" ? "다음" : "지금"}</span></div>
    <div class="ob__body" data-ob-body="${no}"${state === "open" ? "" : " hidden"}>${body}<div class="ob__foot">${foot}</div></div></section>`;
  return `<div class="ob" data-ob>
  ${step(1, "league", s1.title, "분데스리가 · 라리가 · 프리미어리그", `<div class="ob__lg">${leagues}</div><p class="ob__more">UCL은 대회라 리그 단계에 넣지 않았다(시안 가정)</p>`, `<a class="tlink" href="#ob-skip" data-ob-skip>건너뛰기</a><button class="btn btn--pri" type="button" data-ob-next="1">다음 — 팀 고르기</button>`, "done")}
  ${step(2, "team", s2.title, `최대 <span class="t-num">${s2.max}</span>팀 · 고른 리그의 현재 순위 순`, `<div class="ptabs" role="tablist" aria-label="리그">${tabs}</div>${panels}`, `<p class="ob__cnt"><span class="n" data-ob-cnt>${sel2.length}</span> / ${s2.max}팀</p><span><a class="tlink" href="#ob-skip" data-ob-skip>건너뛰기</a> <button class="btn btn--pri" type="button" data-ob-next="2">다음 — 선수 고르기</button></span>`, "open")}
  ${step(3, "player", s3.title, "등록 한국 선수 9명", `<div class="ob__teams">${players}</div>`, `<a class="tlink" href="#ob-skip" data-ob-skip>건너뛰기</a><button class="btn btn--pri" type="button" data-ob-next="3">마치기</button>`, "next")}
</div>`;
}
function searchResults(q, opts = {}) {
  const pre = opts.idPrefix || "sr";
  if (q.isEmpty || (q.counts.players + q.counts.teams + q.counts.news) === 0) {
    return `<div class="sempty"><p class="sempty__n" aria-hidden="true">0</p><p class="sempty__t"><q lang="en">${esc(q.q)}</q> 검색 결과가 없어요</p><p>선수·팀은 한글·영문 이름 모두로 찾을 수 있어요.</p></div>`;
  }
  let k = 0;
  const opt = (inner, href) => `<a class="sr-row" id="${pre}-o${k++}" role="option" aria-selected="false" href="${href}">${inner}</a>`;
  const grp = (label, n, rows, extra = "") => `<div class="sgrp" role="group" aria-label="${label} ${n}"><p class="sgrp__h">${label}<span class="n">${n}</span>${extra}</p>${rows}</div>`;
  const pl = q.players.map((p) => opt(`<span class="sr-tk">${kit(p.team.slug, "", false)}<span class="perf" aria-hidden="true"></span></span><span class="l"><b>${esc(p.nameKo)} <span class="arm">한국</span></b><span>${esc(p.team.nameKo)} · ${esc(p.position)} · <span lang="en">${esc(p.nameEn)}</span></span></span><span class="r">별칭 <span lang="en">${esc(p.matchedAlias)}</span></span>`, `${BP}${p.path}`)).join("");
  const te = q.teams.map((t) => opt(`<span class="sr-tk">${kit(t.slug, "", false)}<span class="perf" aria-hidden="true"></span></span><span class="l"><b>${esc(t.nameKo)}</b><span lang="en">${esc(T[t.slug].nameEn)}</span></span><span class="r">${esc(t.reasonLabel || "이름 일치")}</span>`, `${BP}/teams/${t.slug}/`)).join("");
  const nn = q.news.top10.slice(0, opts.news || 4).map((x) => {
    const c = C[x.id];
    const latin = c.lang !== "ko";
    return opt(`<span class="sr-n${c.kr ? " kr" : ""}" aria-hidden="true">${c.lang.toUpperCase()}</span><span class="l"><span class="sr-t${latin ? " is-latin" : ""}"${latin ? ` lang="${c.lang}"` : ""}>${esc(c.t)}</span><span>${esc(c.lead.n)} · ${esc(c.catLabel)}</span></span><span class="r"><time datetime="${c.lead.at.utc}">${esc(c.lead.at.short)}</time></span>`, c.lead.u);
  }).join("");
  const parts = [];
  if (q.counts.players) parts.push(grp("선수", q.counts.players, pl));
  if (q.counts.teams) parts.push(grp("팀", q.counts.teams, te));
  parts.push(q.counts.news ? grp("뉴스", q.counts.news, nn, q.counts.newsEn ? `<span>· 한국어 <span class="n">${q.counts.newsKo}</span> · 영문 <span class="n">${q.counts.newsEn}</span></span>` : "") : grp("뉴스", 0, `<p class="note" style="padding:10px 0">${esc(q.q)} 관련 뉴스 0장 — 선수·팀 결과만 보인다(scope §6 #8)</p>`));
  return `<div role="listbox" aria-label="검색 결과">${parts.join("")}</div>${q.counts.news > (opts.news || 4) ? `<a class="tlink" href="${BP}${q.path}">뉴스 ${q.counts.news}장 모두 보기</a>` : ""}`;
}
function screen4() {
  const M = D.my;
  const wallet = [...M.teams.map((t, i) => walletItem("team", t, i)), ...M.players.map((p, i) => walletItem("player", p, 9))].join("");
  const news = M.news.latestIssue.cards.slice(0, 4).map((x) => card(x.id, { idPrefix: "my-", why: `<b>팔로우</b> ${x.followMatch.map((f) => esc(f.label)).join(" · ")}` })).join("");
  const mgr = [...M.teams.map((t) => ({ key: t.team.slug, l: t.team.nameKo, s: "팀", b: badge(t.team.slug, "xs") })), ...M.players.map((p) => ({ key: p.slug, l: p.nameKo, s: "선수", b: badge(p.team.slug, "xs") }))]
    .map((r) => `<li>${r.b}<span class="l">${esc(r.l)}<span>${r.s}</span></span><button class="rm" type="button" data-unfollow="${r.key}">해제<span class="sr"> — ${esc(r.l)}</span></button></li>`).join("");
  const S = D.search;
  const qK = S.queries[0];
  const qL = S.queries[1];
  const my = `<section aria-labelledby="my-h">
  <div class="bh" style="border-top:0;padding-top:0"><h1 id="my-h" class="pg-h1">마이</h1><p class="lim" aria-live="polite"><span class="n" data-lim>${M.limit.used}</span><span class="of">/ ${M.limit.max}</span> 팔로우 · <b data-lim-t>한도 도달</b></p><p class="sub">시안 표본(Q2 1안) — 실데이터 아님(localStorage) · 전체 한도 5는 시안 가정(M4-07)</p></div>
  <h2 class="sr">팔로우 지갑</h2><ol class="wallet" aria-label="팔로우 티켓 지갑">${wallet}</ol>
  <div class="dg">
  <section aria-labelledby="my-nw"><div class="bh"><h2 id="my-nw">내 팀 소식<span class="n">${M.news.latestIssue.count}</span></h2><p class="sub">제 <span class="n">${M.news.latestIssue.issueNo}</span>호에서 팔로우 항목이 태그된 카드 — 왜 왔는지 한 줄</p></div><div class="feed">${news}</div><a class="tlink" href="${BP}/news/?mine=1">내 팀만 보기 (전체 ${M.news.allIssues.count}장)</a></section>
  <section aria-labelledby="my-mg"><div class="bh"><h2 id="my-mg">팔로우 관리</h2></div><ul class="mgr">${mgr}</ul>
    <div class="blk--s"><div class="bh"><h3>내보내기 · 가져오기</h3><p class="sub">다른 기기로 옮기기 — URL 한 줄</p></div><div class="xi"><div class="xi__opts"><button class="opt" type="button" data-toast-msg="자리 — URL 형식 M4-10"><b>${esc(M.exportImport.states[0])}</b><span>URL 값 — 자리</span></button><button class="opt" type="button" data-toast-msg="자리 — URL 형식 M4-10"><b>가져오기</b><span>URL 붙여 넣기 — 자리</span></button></div>
    <div class="tkt" style="padding:12px 14px"><p class="k" style="margin-bottom:8px">가져오기 확인 (견본)</p><div class="xi__opts"><button class="opt" type="button"><b>덮어쓰기</b><span>지금 팔로우 5개를 지우고 가져온 목록으로</span></button><button class="opt" type="button"><b>합치기</b><span>한도 5까지만 — 넘치는 항목은 고르게</span></button></div></div>${ph(M.exportImport)}</div></div>
    <div class="blk--s"><div class="bh"><h3>캘린더</h3></div><div class="adm__act"><button class="btn" type="button" data-toast-msg="자리 — .ics 묶음 M4-12">${IC.cal}팔로우 팀 일정 .ics</button></div>${ph(M.icsBundle)}</div>
  </section></div></section>`;
  const ob = `<section class="blk" aria-labelledby="ob-h" id="s4-ob"><div class="bh"><h2 id="ob-h">첫 방문 온보딩 — 3단계</h2><p class="sub">단계마다 스텁 1장. '다음'을 누르면 지금 스텁이 위로 뜯겨 한 줄 요약으로 접히고 다음 스텁이 펼쳐진다(뜯김 200ms). 표본: 2단계 진행 중</p></div>
  ${onboarding()}
  <div class="tkt ob__entry" aria-label="온보딩 진입 스텁 — 홈"><span class="ob__no" aria-hidden="true">1<small>/3</small></span><span class="perf" aria-hidden="true"></span><div class="ob__entry-b"><b>리그·팀·선수를 골라 두면 홈에 내 팀 소식이 생겨요</b><p>진입 위치: 홈 오늘의 5줄 <b>바로 아래</b>, 첫 방문(팔로우 0)일 때만 — 375 첫 화면의 5줄 4줄을 밀지 않는다(scope §4 #13). 모달 없음</p><div class="ob__entry-a"><button class="btn btn--pri" type="button">고르기 시작</button><a class="tlink" href="#ob-skip">건너뛰기</a></div></div></div></section>`;
  const sov = `<section class="blk" aria-labelledby="so-h" id="s4-so"><div class="bh"><h2 id="so-h">검색 오버레이 — 열린 상태</h2><p class="sub">마스트헤드 검색 버튼 · <kbd>/</kbd> · <kbd lang="en">⌘K</kbd>로 연다. 375는 화면 전체, 1024 이상은 티켓 아래 패널. 결과 = 유형별 작은 티켓 줄(왼쪽 스텁: 선수·팀 = 키트, 뉴스 = 원제목 언어). 질의 <q lang="en">${esc(qL.q)}</q> = 영문 별칭 → 이강인</p></div>
  <div class="sframe" aria-label="검색 오버레이 견본"><div class="sbox">${IC.search}<input type="search" value="${esc(qL.q)}" aria-label="검색어" readonly><kbd>Esc</kbd></div><div class="sres">${searchResults(qL, { idPrefix: "sf" })}</div><p class="skeys"><span><kbd>↑</kbd><kbd>↓</kbd>이동</span><span><kbd>Enter</kbd>열기</span><span><kbd>Esc</kbd>닫기</span></p></div>
  <p class="note" style="margin-top:8px"><button class="btn" type="button" data-search-open>오버레이 실제로 열기</button> 준비된 질의 5개(${S.queries.map((q) => esc(q.q)).join(" · ")} · ${esc(S.empty.q)})만 결과가 나온다 — Pagefind 흉내(${esc(S.rule.split(" — ")[0])})</p></section>`;
  const qJ = S.queries[3];
  const spage = `<section class="blk" aria-labelledby="sp-h" id="s4-sp"><div class="bh"><h2 id="sp-h">/search/?q=${esc(qK.q)}</h2><p class="sub">오버레이와 같은 결과 컴포넌트를 페이지 폭으로. 아래는 뉴스 0장 질의와 결과 없음(글자만)</p></div>
  <div class="sframe" style="max-width:none;border:0;border-top:3px solid var(--ink)"><div class="sbox" style="padding-left:0">${IC.search}<input type="search" value="${esc(qK.q)}" aria-label="검색어 (페이지)" readonly><span></span></div><div class="sres" style="padding:0">${searchResults(qK, { idPrefix: "sp", news: 6 })}</div></div>
  <div class="grid grid--2 blk--s"><div class="frame"><p class="cap2"><b>뉴스 0장</b>질의 ${esc(qJ.q)}</p>${searchResults(qJ, { idPrefix: "sj" })}</div><div class="frame"><p class="cap2"><b>결과 없음</b>${esc(S.empty.note)}</p>${searchResults(S.empty)}</div></div></section>`;
  const contents = `<nav class="contents" aria-label="마이"><div class="sec-h"><h2>마이</h2><span class="rh" lang="en" aria-hidden="true">WALLET</span></div><div class="ct"><a class="ct-row" href="#my-h"><span class="l">팔로우 지갑</span><span class="n">5</span></a><a class="ct-row" href="#my-nw"><span class="l">내 팀 소식</span><span class="n">${M.news.latestIssue.count}</span></a><a class="ct-row" href="#my-mg"><span class="l">팔로우 관리</span></a><a class="ct-row" href="#s4-ob"><span class="l">온보딩</span></a><a class="ct-row" href="#s4-so"><span class="l">검색</span></a></div></nav>`;
  return `${divider("s4", "화면 4 · 마이 · 온보딩 · 검색", "/my/ · /search/?q=김민재", `마이 = 티켓 지갑(겹친 스텁 — 하나씩 펼침) · 팔로우 표본 5/5(Q2 1안) = 한도 도달 상태 · 해제를 누르면 한도가 풀린다`)}
<div class="shell"><div class="layout">${contents}
<div class="page" role="region" aria-labelledby="my-h">${my}${ob}${sov}${spage}</div></div></div>`;
}

/* ═════════ 홈 위젯 ═════════ */
function chipStub(r) {
  const val = r.minutes === null ? "–" : r.minutes;
  return `<a class="tkt kc__t" href="${BP}/korean-players/${r.player}/"><span class="kc__h">${kit(r.team.slug, "", false)}<b class="nm">${esc(r.nameKo)}</b></span><span class="kc__m">${big(val, !r.appeared, r.minutes === null ? "" : "분")}<span class="st${r.appeared ? "" : " st--off"}">${esc(r.statusLabel)}</span>${r.goals ? `<span class="g">골 <span class="n">${r.goals}</span> · <span class="n">${esc(r.goalMinutes.join(","))}</span>′</span>` : ""}</span></a>`;
}
function homeWidgets(where) {
  const H = D.home;
  const K = H.koreanChips;
  const tdy = K.today;
  const busy = K.busySpecimen;
  const p = where;
  const kr = `<section class="wg" aria-labelledby="${p}-kr"><div class="sec-h sec-h--thin"><h2 id="${p}-kr">한국 선수</h2><span class="rh" lang="en" aria-hidden="true">PLAYER FOCUS</span></div>
  <p class="wg__sub">제 <span class="n">${tdy.issueNo}</span>호 · <span class="t-num">${esc(tdy.window.from.dayShort)}</span> 경기(현지) 기준</p>
  <div class="kc0">${big(tdy.appearedCount, tdy.appearedCount === 0, "명")}<p><b>어젯밤 출전 ${tdy.appearedCount}명</b><br>명단에 든 선수 <span class="n">${tdy.rowCount}</span>명</p></div>
  <div class="kc">${tdy.rows.map(chipStub).join("")}</div>
  <p class="wg__sub" style="margin-top:16px"><b>붐비는 날 견본</b> · 제 <span class="n">${busy.issueNo}</span>호(<span class="t-num">${esc(busy.window.from.dayShort)}</span> 경기) — 출전 <span class="n">${busy.appearedCount}</span>명</p>
  <div class="kc">${busy.rows.map(chipStub).join("")}</div></section>`;
  const hot = `<section class="wg" aria-labelledby="${p}-xf"><div class="sec-h sec-h--thin"><h2 id="${p}-xf">이적 핫 리스트</h2><span class="rh" lang="en" aria-hidden="true">TRANSFERS</span></div>
  <p class="wg__sub">상태 변화 상위 5 — 실데이터 <span class="n">${H.transferHotList.count}</span>건뿐이라 3칸만</p>
  <div class="hl">${H.transferHotList.items.map((x) => `<a class="tkt hl__t" href="#${x.id}"><span class="hl__b">${x.playerName ? `<span class="nm">${esc(x.playerName)}${x.registeredKorean ? '<span class="arm">한국</span>' : ""}</span>` : `<span class="tt">${esc(x.leadTitle)}</span>`}<span class="m">${x.to ? `<i class="arrow" aria-hidden="true"></i>${esc(x.to.nameKo)} · ` : ""}${tier(x.bestTier)}${tm(x.updated)}</span></span><span class="perf" aria-hidden="true"></span><span class="hl__s">${punch(x.filled, x.status)}<span class="xs${x.status === "official" ? " xs--official" : ""}">${esc(x.stageLabel)}</span></span></a>`).join("")}</div></section>`;
  return { kr, hot };
}
function screen5() {
  const H = D.home;
  const M = D.my;
  const myNews = M.news.latestIssue.cards.slice(0, 3).map((x) => card(x.id, { idPrefix: "hm-", why: `<b>팔로우</b> ${x.followMatch.map((f) => esc(f.label)).join(" · ")}` })).join("");
  const NT = H.nationalTeam;
  const nat = `<section class="wg" aria-labelledby="h-nt"><div class="sec-h sec-h--thin"><h2 id="h-nt">A매치</h2><span class="rh" lang="en" aria-hidden="true">NATIONAL TEAM</span></div>
  <p class="wg__sub">A매치 기간만 보이는 섹션 — 기간 판정·일정·소집 명단은 자리, 소식은 실카드 ${NT.news.count}장</p>
  <div class="nt"><div class="nt__fx"><div><b>11월 A매치 일정</b><span>자리 · 킥오프 · 상대 · 장소</span><span class="t-num">M3-05</span></div><div><b>소집 명단</b><span>자리 · 등록 선수만 링크(FR-73)</span><span class="t-num">M3-05</span></div></div>
  <div class="ph ph--in"><b>기간 판정</b>${esc(NT.periodActive.reason)}<span class="fs">${esc(NT.periodActive.fillStage)}</span></div></div>
  <div class="feed">${NT.news.ids.slice(0, 2).map((id) => card(id, { idPrefix: "hn-" })).join("")}</div><a class="tlink" href="${BP}/national-team/">대표팀 페이지</a></section>`;
  const W1 = homeWidgets("h1");
  const W2 = homeWidgets("h2");
  const d1 = (t, rh) => `<section class="wg" aria-label="${t} (D1 확정)"><div class="sec-h sec-h--thin"><h2>${t}</h2><span class="rh" lang="en" aria-hidden="true">${rh}</span></div><p class="skip-w" style="margin-top:10px"><b>D1 확정 위젯</b>이 시안에서는 생략</p></section>`;
  const page = `<div class="page" role="region" aria-labelledby="h5-h"><h1 id="h5-h" class="sr">홈 위젯</h1>
  <section aria-label="오늘의 5줄 (D0 확정)"><div class="sec-h"><h2>오늘의 5줄</h2><span class="rh" lang="en" aria-hidden="true">STARTING FIVE</span></div><p class="skip-w" style="margin-top:10px"><b>D0 확정</b>제 ${I.no}호 5줄 — 이 시안에서는 생략. 첫 방문이면 이 바로 아래에 온보딩 스텁(화면 4)</p></section>
  <section class="wg" aria-labelledby="h-my"><div class="sec-h sec-h--thin"><h2 id="h-my">내 팀 소식</h2><span class="rh" lang="en" aria-hidden="true">MY TEAMS</span></div><p class="wg__sub">팔로우가 있을 때만 — 표본 5개 · 제 <span class="n">${I.no}</span>호 <span class="n">${M.news.latestIssue.count}</span>장 중 3장</p><div class="feed">${myNews}</div><a class="tlink" href="${BP}/my/">마이에서 모두 보기</a></section>
  ${nat}
  <div class="in-flow">${W1.kr}${d1("오늘 밤 볼 경기", "TONIGHT")}</div>
  <section class="wg" aria-label="주요 뉴스 (D0 확정)"><div class="sec-h"><h2>주요 뉴스</h2><span class="rh" lang="en" aria-hidden="true">HEADLINES</span></div><p class="skip-w" style="margin-top:10px"><b>D0 확정</b>머리기사 · 피드 — 생략</p></section>
  <div class="in-flow">${W1.hot}${d1("리그 순위", "LEAGUE TABLE")}</div>
</div>`;
  const facing = `<aside class="facing" aria-label="마주 보는 면">${d1("오늘 밤 볼 경기", "TONIGHT")}${W2.kr}${d1("리그 순위", "LEAGUE TABLE")}${W2.hot}</aside>`;
  return `${divider("s5", "홈 위젯", "/", `PRD §4.2 순서 2 내 팀 소식 · 3 A매치 · 4 한국 선수 · 7 이적 핫 리스트 · 1280 = 마주 보는 면(오늘 밤 → 한국 선수 → 순위 → 이적) · 1279 이하 = 지면 안 순서대로`)}
<div class="shell"><div class="layout layout--3"><nav class="contents" aria-label="목차"><div class="sec-h"><h2>목차</h2><span class="rh" lang="en" aria-hidden="true">CONTENTS</span></div><p class="skip-w" style="margin-top:10px"><b>D0 확정</b>대회 · 분류 목차 — 생략</p></nav>${page}${facing}</div></div>`;
}

/* ═════════ 견본 ═════════ */
function screen6() {
  const S = D.specimens;
  const ap = S.appearance.states;
  const fig = (body, cap) => `<figure class="tkt ms" style="height:auto">${body}<figcaption>${cap}</figcaption></figure>`;
  const st = ap.find((x) => x.status === "start").example;
  const sb = ap.find((x) => x.status === "sub").examples[0];
  const bn = ap.find((x) => x.status === "bench").example;
  const ab = ap.find((x) => x.status === "absent").example;
  const un = ap.find((x) => x.status === "unknown");
  const apl = `<div class="apl">
  ${fig(`<div class="ms__mid">${big(st.minutes, false, "분")}<p class="ms__st">${esc(st.statusLabel)}</p></div>`, `<b>선발</b> 김민재 · ${esc(st.kickoff.dayShort)} UCL ${esc(st.opponent.name)}`)}
  ${fig(`<div class="ms__mid">${big(sb.minutes, false, "분")}<p class="ms__st">${esc(sb.statusLabel)} · <span class="t-num">${esc(sb.enteredAt)}</span> 투입</p></div>`, `<b>교체</b> ${esc(sb.nameKo)} · ${esc(sb.kickoff.dayShort)} ${esc(sb.opponent.name)} — 집계 전 fixtures(로그에 넣지 않음)`)}
  ${fig(`<div class="ms__mid">${big(bn.minutes, true, "분")}<p class="ms__st ms__st--off">${esc(bn.statusLabel)}</p></div>`, `<b>벤치</b> 분 0은 0으로 쓴다 · ${esc(bn.kickoff.dayShort)} 기타 대회`)}
  ${fig(`<div class="ms__mid">${big("–", true)}<p class="ms__st ms__st--off">${esc(ab.statusLabel)}</p></div>`, `<b>명단 제외</b> 분 null = "–"(0 아님) · ${esc(ab.kickoff.dayShort)} ${esc(ab.opponent.name)}`)}
  ${fig(`<div class="ms__mid">${big("?", true)}<p class="ms__st ms__st--off">${esc(un.label)}</p></div>`, `<b>라인업 없음</b> ${esc(un.rule)} · 실례 0(${esc(un.example.fillStage)})`)}
  </div>`;
  const X = D.transfers.stageTierSpecimen.combos;
  const stages = ["rumor", "negotiating", "agreed", "official", "collapsed"];
  const mx = `<table class="mx"><caption class="sr">이적 단계 5종 × Tier 1~3</caption><thead><tr><th scope="col">단계</th><th scope="col">Tier 1</th><th scope="col">Tier 2</th><th scope="col">Tier 3</th></tr></thead><tbody>${stages.map((s) => `<tr><th scope="row"><span class="xs">${punch(D.labels.transferStage[s].filled, s)}<span class="sg${s === "official" ? " sg--official" : ""}">${esc(D.labels.transferStage[s].label)}</span></span></th>${[1, 2, 3].map((t) => { const c = X.find((x) => x.status === s && x.tier === t); return `<td><span class="xs">${tier(t)}${c.realItem ? `<span class="real">실데이터 ${esc(D.transfers.items.find((i) => i.id === c.realItem).playerName || "로호(원제목)")}</span>` : ""}</span></td>`; }).join("")}</tr>`).join("")}</tbody></table>`;
  const F = S.follow.states;
  const fol = `<div class="fstates">
  <div><span class="k">꺼짐 — ${esc(F[0].example.nameKo)} (${esc(F[0].example.why)})</span><span>${followBtn("spec-off", F[0].example.nameKo, false)}</span></div>
  <div><span class="k">켜짐 — ${esc(F[1].example.nameKo)} · 누르면 왼쪽 스텁이 접혀 ✓(200ms)</span><span>${followBtn("spec-on", F[1].example.nameKo, true)}</span></div>
  <div><span class="k">한도 ${F[2].example.used}/${F[2].example.max} 도달 — 6번째</span><span>${followBtn("spec-lim", "도르트문트", false, { limit: true })}</span><p class="fol-help">팔로우는 <b>5개</b>까지예요. 마이에서 하나를 해제하면 다시 켤 수 있어요.</p></div>
  <p class="note">쓰는 곳: ${S.follow.places.map(esc).join(" · ")} — 같은 버튼 하나</p></div>`;
  const sp = S.spoilerScore.examples;
  const sstub = (e, i) => {
    const lg = D.playerDetail.log5.find((l) => l.matchId === e.matchId);
    return `<article class="tkt ms" aria-label="결과 가림 견본 ${i + 1}"><div class="ms__top"><p class="ms__d"><time datetime="${e.kickoff.utc}">${esc(e.kickoff.dayShort.split(" ")[0])}</time><span>${esc(e.kickoff.dayShort.split(" ")[1])}</span></p><p class="ms__c">${ftab(lg.comp)}<span>${esc(lg.roundLabel)}</span></p></div><div class="ms__perf" aria-hidden="true"></div><div class="ms__mid">${big(lg.minutes, !lg.appeared, "분")}<p class="ms__st${lg.appeared ? "" : " ms__st--off"}">${esc(lg.statusLabel)}</p></div><div class="ms__bot"><p class="ms__vr"><span>${esc(lg.venueLabel)}</span><span class="spoil-v">${res(e.result)} · 골 <span class="n">${lg.goals}</span></span></p><p class="spoil-h"><span class="sbx"><span class="sbx__k">결과 가림</span><button class="sbx__go" type="button" data-spoil-one>보기 ${IC.down}<span class="sr"> — ${esc(e.opponent)}전 결과</span></button></span></p><p class="ms__opp">${oppHtml(lg.opponent)}</p></div></article>`;
  };
  const spo = `<div class="spoil" data-spoil="on" data-spoil-box><button class="sw" type="button" role="switch" aria-checked="true" data-spoil-sw><i aria-hidden="true"></i>결과 가리기</button><div class="grid grid--2">${sp.map(sstub).join("")}</div><p class="note">${esc(S.spoilerScore.note)} — 시안 결정: <b>골·도움 숫자도 함께 가린다</b>(골 수가 승패를 짐작하게 한다). 가림 칸 = <code>--hatch</code> 빗금(D0 결과 가림 재사용), 블러 없음</p></div>`;
  const NP = S.nationalTeamPage;
  const nsec = NP.sections.map((s) => {
    if (s.data.placeholder) return `<div class="ns__sec"><h4>${esc(s.title)}</h4>${ph(s.data)}${s.data.schemaFields ? `<p class="note" style="margin-top:6px">필드: <span lang="en">${s.data.schemaFields.map(esc).join(" · ")}</span></p>` : ""}</div>`;
    const ids = s.data.ids.slice(0, s.key === "krNews" ? 3 : 2);
    return `<div class="ns__sec"><h4>${esc(s.title)}<span class="n">${s.data.count}</span></h4><ul class="ns__list">${ids.map((id) => { const c = C[id]; const l = c.lang !== "ko"; return `<li${l ? ` lang="${c.lang}"` : ""}>${esc(c.t)}<span>${esc(c.lead.n)} · ${esc(c.lead.at.short)}</span></li>`; }).join("")}</ul>${s.data.rule ? `<p class="note" style="margin-top:6px">${esc(s.data.rule)}</p>` : ""}</div>`;
  }).join("");
  const TP = S.teamProfile;
  const bt = T[TP.team.slug];
  const tp = `<article class="tkt tp-mini" aria-label="팀 티켓 뒷면 견본"><div class="kit" style="--k1:${bt.badge.k1};--k2:${bt.badge.k2};--kf:${bt.badge.kf}" role="img" aria-label="${esc(bt.nameKo)} 키트 2색 ${esc(bt.badge.short)}"><b>${esc(bt.badge.short)}</b></div><span class="perf" aria-hidden="true"></span><div class="tp-mini__b"><p class="ph-tk__comp">${ftab("BUNDESLIGA")}<span>D1 팀 티켓 (축소)</span></p><h4>${esc(bt.nameKo)}</h4><div>${followBtn("bayern-munchen-spec", bt.nameKo, true, { sm: true })}</div></div>
  <div class="tp-back"><div class="tp-back__h"><b>팀 한줄평</b>${AI}<span class="note">생성 날짜 — 자리 <span class="t-num">${esc(TP.generatedAt.fillStage)}</span></span></div>${ph(TP.oneLiner)}
  <div class="tp-sw"><div><span class="k">강점 2</span><i class="ln"></i><i class="ln"></i></div><div><span class="k">약점 2</span><i class="ln"></i><i class="ln"></i></div></div><p class="note">${esc(TP.strengths[0].reason.replace(" 1", ""))} · ${esc(TP.strengths[0].fillStage)} — 티켓 꼬리표 아래 '뒷면'(2px 점선 절취선 다음)에 둔다. 라벨은 문단 머리 하나</p></div></article>`;
  const PS = S.playerStates;
  const all = D.players.groups.flatMap((g) => g.players);
  const fb = PS.fallback;
  const fbCards = fb.newsCards.map((id) => `<li>${esc(C[id].t)}<span>${esc(C[id].lead.n)} · ${esc(C[id].lead.at.short)}</span></li>`).join("");
  const fbT = `<article class="tkt pt pt--gone" aria-label="폴백 견본 — 이재성">${kit("mainz", "pt__kit")}<span class="perf pt__perf" aria-hidden="true"></span><div class="pt__id"><p class="pt__k"><span>MF</span><span class="stamp stamp--soft">${esc(fb.label)}</span></p><h3 class="pt__name">${esc(fb.nameKo)}</h3><p class="pt__team"><b>마인츠</b></p></div><div class="pt__num">${big("–", true)}<span class="cap">분 미확인</span></div><div class="pt__last"><p class="pt__st">경기 결과 · 뉴스 기반</p><p class="pt__m">${tm(fb.match.kickoff)}${ftab("BUNDESLIGA")}</p><p class="pt__opp"><span class="u">${esc(fb.match.venueLabel)}</span>${esc(fb.match.opponent)} ${res(fb.match.result)} · 도움 ${esc(fb.match.assistsLabel)}</p></div><div class="pt__tail"><p class="pt__row"><span class="k">근거</span><span class="u">${esc(fb.rule)}</span></p><ul class="ns__list">${fbCards}</ul></div></article>`;
  const pst = `<div class="pst">
  <figure>${playerTicket(all.find((p) => p.slug === PS.linked.slug), { idPrefix: "ps-" })}<figcaption><b>연결</b> 원장 기록이 있는 선수</figcaption></figure>
  <figure>${playerTicket(all.find((p) => p.slug === PS.notLinked.slug), { idPrefix: "ps-" })}<figcaption><b>${esc(PS.notLinked.label)}</b> ${esc(PS.notLinked.note)} — 다음 경기는 소속팀 일정으로</figcaption></figure>
  <figure>${playerTicket(all.find((p) => p.slug === PS.otherLeague.slug), { idPrefix: "ps-" })}<figcaption><b>${esc(PS.otherLeague.label)}</b> ${esc(PS.otherLeague.note)} · 팀 컬러 없음 → 폴백 키트</figcaption></figure>
  <figure>${fbT}<figcaption><b>폴백 견본</b> ${esc(fb.note)}</figcaption></figure></div>`;
  return `${divider("s6", "견본", "DR-06", `출전 상태 5종 · 이적 단계 5 × Tier 3 · 팔로우 3상태 · 스코어 결과 가림 · /national-team 구조 · 팀 한줄평 자리 · 선수 상태 4종`)}
<div class="shell"><div class="spec" role="region" aria-labelledby="sp-h6"><div class="sec-h"><h2 id="sp-h6">견본 — 상태 · 단계 · 자리</h2><span class="rh" lang="en" aria-hidden="true">SPECIMENS</span></div>
<div class="spec-grid">
  <div class="frame wide"><p class="cap2"><b>출전 상태 5종</b>경기 스텁 가운데 칸 — 실선 숫자 = 출전, 윤곽 = 미출전 · 모름. 상태 글자를 늘 함께</p>${apl}</div>
  <div class="frame"><p class="cap2"><b>이적 단계 5 × Tier 1~3</b>${esc(D.transfers.stageTierSpecimen.note)}</p>${mx}</div>
  <div class="frame"><p class="cap2"><b>팔로우 버튼 3상태</b>표본 5/5가 곧 한도 — 꺼진 버튼은 점선 비활성 + 이유 문장</p>${fol}</div>
  <div class="frame"><p class="cap2"><b>스코어 결과 가림 칸</b>${esc(S.spoilerScore.rule)}</p>${spo}</div>
  <div class="frame"><p class="cap2"><b>/national-team 구조</b>${esc(NP.path)} — 일정·명단은 자리</p><div class="ns">${nsec}</div></div>
  <div class="frame wide"><p class="cap2"><b>팀 한줄평 · 강점/약점 자리</b>${esc(TP.note)}</p><div class="grid grid--2">${tp}<div class="note">위치: 팀 티켓(D1) 꼬리표 바로 아래 '티켓 뒷면'. 팔로우 버튼은 팀명 아래(같은 컴포넌트). 'AI 작성' 라벨은 한줄평 머리 한 곳, 강점/약점은 같은 묶음이라 다시 달지 않는다. 생성 날짜는 라벨 옆 보조 글자.</div></div></div>
  <div class="frame wide"><p class="cap2"><b>선수 카드 상태 4종</b>연결 · 기록 연결 전 · 기타 리그 · 폴백(FR-60·64·65)</p>${pst}</div>
</div></div>
<footer class="colophon">
  <div class="colophon__in">
    <p class="colophon__brand">유로 다이제스트 <span>제 ${I.no}호 · 2026년 10월 31일 (토)</span></p>
    <p class="colophon__fd" lang="en">Football data provided by the Football-Data.org API</p>
    <p class="colophon__p">경기·출전 데이터 football-data.org · API-Football. 오늘의 5줄은 이 데이터로 AI가 쓰고, AI가 쓴 줄에만 ‘AI 작성’ 라벨을 붙입니다. 검증에 맞지 않는 줄은 라벨 없는 코드 문장으로 바꾸거나 빼고, AI 답을 쓸 수 없는 날은 모든 줄을 코드 문장으로 싣습니다. 뉴스 카드는 AI 없이 원문 제목 그대로 싣습니다.</p>
    <ul class="colophon__links" role="list"><li><a href="${BP}/about/#ai">AI 작성 고지</a></li><li><a href="${BP}/about/">소개·출처 정책</a></li><li><a href="${BP}/about/#contact">삭제·정정 요청</a></li></ul>
    <p class="colophon__p">마지막 업데이트 <time datetime="${D.meta.ledger.updatedAt.utc}">${esc(D.meta.ledger.updatedAt.time)} KST</time></p>
  </div>
</footer></div>`;
}

/* ═════════ 검색 오버레이(실제) ═════════ */
function overlay() {
  const S = D.search;
  const qs = [...S.queries, S.empty];
  const tpl = qs.map((q, i) => `<template data-q="${esc(q.q.toLowerCase())}">${searchResults(q, { idPrefix: "ov" + i })}</template>`).join("");
  return `<div class="sov" id="sov" role="dialog" aria-modal="true" aria-label="검색" hidden><div class="sov__panel"><div class="sbox">${IC.search}<input type="search" id="sov-in" role="combobox" aria-expanded="true" aria-controls="sov-res" aria-autocomplete="list" placeholder="선수 · 팀 · 뉴스 — 한글·영문" autocomplete="off"><button class="ibtn" type="button" data-search-close aria-label="검색 닫기">${IC.close}</button></div>
  <div class="sqs" aria-label="준비된 질의">${qs.map((q) => `<button class="chip" type="button" data-q-pick="${esc(q.q)}">${esc(q.q)}</button>`).join("")}</div>
  <div class="sres" id="sov-res" aria-live="polite"><p class="note" style="padding-top:12px">시안: 준비된 질의 5개만 결과가 나온다.</p></div><p class="skeys"><span><kbd>↑</kbd><kbd>↓</kbd>이동</span><span><kbd>Enter</kbd>열기</span><span><kbd>Esc</kbd>닫기</span></p></div>${tpl}</div>`;
}

/* ═════════ 메타 ═════════ */
const META = {
  name: "B 시즌권 (Season Pass)",
  one: "선수 · 이적 · 팔로우를 뜯어 쓰는 티켓으로 — D1 팀 티켓의 키트 스텁 · 절취선 · 노치를 선수 티켓 · 경기 스텁 · 검표 펀치 · 티켓 지갑으로 넓힌다. 티켓마다 큰 숫자는 하나뿐.",
  pros: [
    "한국 선수가 이 서비스의 주인공이라는 인상이 가장 강하다 — 이미지 없이 키트 2색 스텁만으로 '선수 카드'의 물성이 생긴다",
    "D1 팀 티켓과 같은 문법(스텁 · 절취선 · 몸통 / 꼬리표)이라 팀 ↔ 선수 ↔ 이적이 한 식구로 읽힌다. 새 토큰 0 · 새 모티프 0(티켓 스텁 ② 확장)",
    "숫자 하나 규칙(최근 출전 분 · 시즌 분 · 단계 n/4 · 킥오프 · MVP 점수) + 실선/윤곽 = 출전/미출전이 화면 전체에서 같은 뜻이라 배우는 비용이 낮다",
    "팔로우 · 온보딩 · 지갑에 손맛(접힘 · 뜯김)이 있다",
  ],
  cons: [
    "카드가 커서 길다 — 티켓 1장 240~295px, 375 목록 첫 화면(마스트헤드 아래)에 약 1.5장, 9명 목록이 약 2,960px",
    "티켓 테두리가 화면마다 많아 '상자 격자'로 보일 위험 — 뉴스 카드(괘선 한 줄)와 문법이 둘로 나뉜다",
    "375 경기 스텁 5장은 가로 스크롤(스냅)이라 4·5번째(집계 전)가 처음엔 안 보인다",
    "키트 색 면이 넓어져 팀 컬러 데이터 품질(흰 하의 · 비슷한 색)이 첫인상을 좌우한다",
  ],
  diff: "중 — 스텁 변형 4종(선수 · 경기 · 이적 · 지갑)이 같은 3열 격자(스텁 · 절취선 · 몸통) 하나를 공유한다. 모션은 CSS 2개(접힘 · 뜯김). 섬: 팔로우(한도) · 지갑 펼침 · 온보딩 · 이적 필터 · 검색 오버레이 — 시안 인라인 JS",
  fonts: "폰트 변화 0 — EuroDigest Sans 400·800 + Barlow Condensed 600·800 = 427,896바이트(417.9KB, 2패밀리, D0와 같은 파일)",
};

function metaBand() {
  return `<aside class="meta-w" aria-label="시안 정보"><details class="meta">
  <summary><span class="meta__tag">D2 시안 B</span><b>${esc(META.name)}</b><span class="meta__one">${esc(META.one)}</span><span class="meta__more" aria-hidden="true"></span></summary>
  <div class="meta__grid">
    <div><p class="meta__h">장점</p><ul>${META.pros.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="meta__h">단점</p><ul>${META.cons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    <div><p class="meta__h">구현 난이도</p><p>${esc(META.diff)}</p><p class="meta__h">번들·폰트 영향</p><p>${esc(META.fonts)}. 시안 인라인 JS 12.5KB(gzip 4.4KB — 테마·토스트·탭·팔로우·지갑·필터·온보딩·검색·결과 가림 전부). 구현 섬 추정은 notes-b.md</p></div>
    <div><p class="meta__h">데이터 · 가정</p><ul><li>데이터: <b>d2-data.json</b>만 — ${esc(REF.label)}</li><li>팔로우 표본(바이에른 · 아틀레티코 · 아스널 + 김민재 · 이강인 = 5/5)은 시안 표본(Q2 1안)</li><li>점선 상자 = 자리(이유 · 채울 단계). LLM 출력 자리 2곳(주간 총평 · 팀 한줄평)에 'AI 작성' 라벨 위치</li><li>스코어 표기: 선수 · 팀 맥락(로그 · 지갑)은 소속팀 득점 먼저 + W/D/L + 홈·원정 병기, 일정 · 라운드는 홈-원정(DESIGN §3.5) 그대로</li></ul></div>
    <div class="span3"><p class="meta__h">축 매트릭스 (scope §8)</p><table class="axes"><thead><tr><th>축</th><th>A 스쿼드 명단</th><th>B 시즌권 (이 시안)</th><th>C 주간 지면</th></tr></thead><tbody>
<tr><th>레이아웃</th><td>1단 명단 행 · 표형 행</td><td class="me">카드 격자(1024 2열 · 1280 3열) · 스텁 · 절취선 · 몸통 티켓 · 로그 = 경기 스텁 5장 가로 줄 · 마이 = 겹친 스텁 지갑</td><td>2단 지면 · 세로 타임라인 · 색인</td></tr>
<tr><th>타이포</th><td>Barlow 숫자 열 위주</td><td class="me">티켓마다 큰 숫자 하나(40~112px) + 나머지 11.5~14px — 대비 큼. 실선 = 출전 · 윤곽 = 미출전</td><td>한글 800 큰 제목 + 본문 문단</td></tr>
<tr><th>색</th><td colspan="3">셋 다 D0 토큰 그대로(새 색 0). B는 키트 2색 면이 스텁 전체 높이로 가장 넓다</td></tr>
<tr><th>밀도</th><td>높음(첫 화면 6~7명)</td><td class="me">중간~낮음(첫 화면 선수 티켓 약 1.5장)</td><td>낮음(1명)</td></tr>
<tr><th>모션</th><td>찍힘</td><td class="me">뜯김(온보딩 다음 단계 · 이적 타임라인 · 결과 보기) · 접힘(팔로우 스텁) · 찍힘(필터)</td><td>잉크 전환 · 도착</td></tr>
</tbody></table></div>
  </div>
</details>
<nav class="toc" aria-label="구역 목차"><ol>
<li><a href="#s1"><b>1</b>한국 선수 목록</a></li><li><a href="#s1d"><b>1</b>김민재 상세</a></li><li><a href="#s2"><b>2</b>주간 W43</a></li><li><a href="#s3"><b>3</b>이적</a></li><li><a href="#s4"><b>4</b>마이 · 온보딩 · 검색</a></li><li><a href="#s5"><b>H</b>홈 위젯</a></li><li><a href="#s6"><b>S</b>견본</a></li>
</ol></nav></aside>`;
}

const JS = fs.readFileSync(new URL("./app.js", import.meta.url), "utf8");

const html = `<!doctype html>
<!--
  D2 시안 B — 「${META.name}」
  한 줄 설명: ${META.one}
  장점: ${META.pros.join(" / ")}
  단점: ${META.cons.join(" / ")}
  구현 난이도: ${META.diff}
  번들/폰트 영향: ${META.fonts}
  데이터: docs/design/d2/data/d2-data.json만(scope.md §2 계산 규칙). 기준 ${REF.label}. 문구·숫자 생성 0, LLM 호출 0.
  생성: docs/design/d2/build-concept-b/gen.mjs (저장소 루트에서 node 실행 — d2-data.json → 정적 HTML). 외부 의존 0, 폰트는 ../fonts/ 상대 경로. 외부 URL은 기사 원문 링크뿐.
-->
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>D2 시안 B · 시즌권 (Season Pass) · 유로 다이제스트</title>
<script>(function(){var d=document.documentElement,t;try{t=localStorage.getItem('ed-theme')}catch(e){}if(t==='light'||t==='dark')d.setAttribute('data-theme',t)})();</script>
<style>
.pg-h1{font-size:32px;font-weight:800;letter-spacing:-.04em;line-height:1.15;margin-top:4px}
@media (min-width:1024px){.pg-h1{font-size:48px}}
.pghead{padding-top:6px}
${CSS}
</style>
</head>
<body>
<a class="skip" href="#main">본문 바로가기</a>
${metaBand()}
<main id="main">
${screen1()}
${screen1d()}
${screen2()}
${screen3()}
${screen4()}
${screen5()}
${screen6()}
</main>
<nav class="tabbar" aria-label="하단 탭"><a href="${BP}/">${IC.home}<span>홈</span></a><a href="${BP}/news/">${IC.news}<span>뉴스</span></a><a href="${BP}/competitions/epl/">${IC.league}<span>리그</span></a><a href="${BP}/korean-players/" aria-current="page">${IC.kr}<span>한국 선수</span></a><a href="${BP}/my/">${IC.my}<span>마이</span></a></nav>
${overlay()}
<div class="toast-region" aria-live="polite" aria-atomic="true"><div class="toast" data-toast hidden><span class="toast__k">알림</span><span data-toast-t></span></div></div>
<script>
${JS}
</script>
</body>
</html>
`;
fs.writeFileSync(OUT, html);
console.log("wrote", OUT, html.length, "bytes");
