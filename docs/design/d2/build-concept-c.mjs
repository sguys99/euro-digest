// D2 시안 C "주간 지면 (Weekly Feature)" 생성기 — 일회성 빌드 스크립트
// 실행: node docs/design/d2/build-concept-c.mjs   (저장소 루트에서, 의존성 없음)
// 입력: docs/design/d2/data/d2-data.json 하나만 읽는다. 문구·숫자는 모두 이 파일에서 온다(LLM 호출 0).
// 출력: docs/design/d2/concept-c.html (외부 의존 0 — 폰트는 ../fonts/ 상대 경로)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const D = JSON.parse(readFileSync(join(here, "data/d2-data.json"), "utf8"));
const OUT = join(here, "concept-c.html");

/* ───────── 공용 도우미 ───────── */
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const B = "/euro-digest";
const COMP = Object.fromEntries(D.labels.competitions.map((c) => [c.id, c]));
const TABCLS = { EPL: "epl", LALIGA: "laliga", SERIEA: "seriea", BUNDESLIGA: "bundesliga", LIGUE1: "ligue1", UCL: "ucl" };
const n = (v) => `<span class="n">${esc(v)}</span>`;
const t = (o, txt) => `<time datetime="${esc(o.utc)}">${esc(txt ?? o.short)}</time>`;
const md = (o) => o.short.split(" ")[0]; // "10.29"
const dow = (o) => o.dayShort.replace(/^[^(]*/, ""); // "(목)"
const PLAYER = {};
for (const g of D.players.groups) for (const p of g.players) PLAYER[p.slug] = p;
const ICON = (p, w = 22) => `<svg class="ic" viewBox="0 0 24 24" width="${w}" height="${w}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" stroke-linejoin="miter">${p}</svg>`;
const IC = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5"/>',
  theme: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  prev: '<path d="M14.5 6 8.5 12l6 6"/>',
  next: '<path d="M9.5 6l6 6-6 6"/>',
  cal: '<path d="M4 6h16v14H4z"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/>',
  home: '<path d="M3.5 10.5 12 4l8.5 6.5V20h-5.5v-6h-6v6H3.5z"/>',
  news: '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 12.5h8M8 16h5"/>',
  league: '<path d="M4 5h16M4 10h16M4 15h16M4 20h16"/><path d="M8.5 5v15"/>',
  kr: '<path d="M12 3.5 4.5 7v5.5c0 4 3.2 6.9 7.5 8 4.3-1.1 7.5-4 7.5-8V7z"/><path d="M8.5 12.5h7"/>',
  my: '<path d="M6 4h12v16l-6-4-6 4z"/>',
};

function ftab(id, extra = "") {
  if (!id || id === "OTHER") return `<span class="ftab ftab--other${extra}" title="기타 대회">기타</span>`;
  const c = COMP[id];
  return `<span class="ftab tab--${TABCLS[id]}${extra}" title="${esc(c.nameKo)}">${esc(c.shortKo)}</span>`;
}
function vtab(id) {
  if (!id || !TABCLS[id]) return "";
  const c = COMP[id];
  return `<span class="tab tab--${TABCLS[id]}" title="${esc(c.nameKo)}">${esc(c.shortKo)}</span>`;
}
function badge(slug, size = "s", { label = false, name } = {}) {
  const tm = slug ? D.teams[slug] : null;
  const b = tm?.badge;
  const nm = name ?? tm?.nameKo ?? "";
  const aria = label ? ` role="img" aria-label="${esc(nm)} 배지 ${esc(b && !b.fallback ? b.short : "없음")}"` : ' aria-hidden="true"';
  if (!b || b.fallback) return `<span class="bdg bdg--${size} bdg--none"${aria}><b></b></span>`;
  return `<span class="bdg bdg--${size}" style="--k1:${b.k1};--k2:${b.k2};--kf:${b.kf}"${aria}><b>${esc(b.short)}</b></span>`;
}
function teamName(o) {
  // o: { slug, name|nameKo, nameLang }
  const nm = o.nameKo ?? o.name;
  return o.nameLang === "en" || (!o.slug && /^[\x00-\x7F. ]+$/.test(nm)) ? `<span lang="en">${esc(nm)}</span>` : esc(nm);
}
const AM = { start: "start", sub: "sub", bench: "bench", absent: "absent", unknown: "unknown" };
function am(status, label) {
  return `<span class="am am--${AM[status]}"><i aria-hidden="true"></i>${esc(label ?? D.labels.appearance[status].label)}</span>`;
}
function fm(o, label) {
  return `<i class="fm fm--${o}" title="${esc(label ?? "")}">${o}</i>`;
}
// 결과(스코어) — 결과 가리기 대상. result = 소속팀 기준
function spo(result, ctx, { force = false, homeAway } = {}) {
  const v = `<span class="spo__v">${fm(result.outcome, result.outcomeLabel)}<b class="spo__s n">${esc(result.text)}</b>${homeAway ? `<span class="spo__ha">${esc(homeAway)}</span>` : ""}</span>`;
  return `<span class="spo${force ? " spo--force" : ""}">${v}<button class="spo__veil" type="button" aria-label="결과 보기 — ${esc(ctx)}"><span>보기</span></button></span>`;
}
function punch(status, filled, { big = false } = {}) {
  const lb = D.labels.transferStage[status].label;
  const aria = status === "collapsed" ? `이적 단계: 결렬` : `이적 단계: ${lb} (4단계 중 ${filled})`;
  let h = "";
  for (let i = 0; i < 4; i++) h += `<i class="${i < filled ? "on" : ""}"></i>`;
  return `<span class="punch punch--${status}${big ? " punch--big" : ""}" role="img" aria-label="${aria}">${h}</span>`;
}
function tier(nr) {
  return `<span class="tier tier--${nr}"><span class="sr">출처 </span>Tier ${nr}</span>`;
}
function stageBar(status, filled) {
  const steps = ["rumor", "negotiating", "agreed", "official"];
  const cur = status === "collapsed" ? -1 : filled - 1;
  const cells = steps
    .map((s, i) => `<span class="stg__c${i <= cur ? " on" : ""}${i === cur ? " cur" : ""}"><i></i><span>${esc(D.labels.transferStage[s].label)}</span></span>`)
    .join("");
  const lbl = D.labels.transferStage[status].label;
  return `<div class="stg stg--${status}"><span class="stg__l" role="img" aria-label="${status === "collapsed" ? "이적 단계: 결렬" : `이적 단계: ${lbl} (4단계 중 ${filled})`}">${cells}</span>${status === "collapsed" ? `<b class="stg__x">결렬</b>` : ""}</div>`;
}
function blank(ph, { title, lines = 0, ai = false, cls = "", short = false } = {}) {
  return `<div class="blank${lines ? " blank--lines" : ""}${short ? " blank--short" : ""} ${cls}"${lines ? ` style="--lines:${lines}"` : ""}>
  <p class="blank__h"><span class="blank__k">자리</span>${title ? `<span class="blank__t">${title}</span>` : ""}${ai ? `<span class="ai" title="LLM이 쓴 문단에 붙는 라벨 — 자리">AI 작성</span>` : ""}<span class="blank__st">채울 단계 <b class="id">${esc(ph.fillStage)}</b></span></p>
  <p class="blank__r">${esc(ph.reason)}</p>${lines ? `<div class="blank__lines" aria-hidden="true"></div>` : ""}
</div>`;
}
function titleHtml(c) {
  const e = esc(c.t);
  const m = e.match(/^(.*\s)(\S+)$/s);
  const last = m ? m[2] : e;
  const head = m ? m[1] : "";
  return `${head}<span class="nobr">${last}<span class="ext" aria-hidden="true">↗</span></span><span class="sr">(원문 ${esc(c.lead.n)}, 새 창)</span>`;
}
// 뉴스 기사 한 줄(원제목 카드) — 원제목 그대로, 요약 없음, AI 라벨 없음
function newsItem(id, { follow, cls = "", hTag = "h4", matched } = {}) {
  const c = D.cards[id];
  const latin = c.lang !== "ko";
  const tags = c.tags.map((g) => `<li${g.korean ? ' class="kr"' : ""}>${g.korean ? `<span class="arm" title="한국 선수">한국</span> ` : ""}${esc(g.label)}</li>`).join("");
  const comp = c.comp[0]?.id;
  const xfer = c.transfer ? `<div class="xfer xfer--${c.transfer.status}">${punch(c.transfer.status, c.transfer.filled)}<b class="xfer__v">${esc(c.transfer.stageLabel)}</b>${tier(c.transfer.tier)}</div>` : "";
  const fol = follow?.length ? `<p class="ni__fol"><span class="ni__fk">팔로우</span>${follow.map((f) => `<span>${esc(f.label)}</span>`).join("")}</p>` : "";
  const mt = matched ? `<span class="ni__mb">${esc(matched)}</span>` : "";
  const spoil = c.spoiler ? " spo-t" : "";
  return `<article class="ni ${cls}" aria-labelledby="${id}-${cls.replace(/\W/g, "") || "t"}">
  <div class="ni__b">
    <div class="ni__k"><span class="stamp">${esc(c.catLabel)}</span>${tags ? `<ul class="tags" aria-label="태그">${tags}</ul>` : ""}</div>
    ${xfer}
    <${hTag} class="ni__t${latin ? " is-latin" : ""}${spoil}" id="${id}-${cls.replace(/\W/g, "") || "t"}" lang="${c.lang}"><a href="${esc(c.lead.u)}" target="_blank" rel="noopener">${titleHtml(c)}</a></${hTag}>
    <p class="ni__m"><span class="src"${/^[\x00-\x7F ]+$/.test(c.lead.n) ? ' lang="en"' : ""}>${esc(c.lead.n)}</span>${c.more ? `<span class="more">+${c.more.n}${esc(c.more.unit)}</span>` : ""}${t(c.lead.at, null).replace(esc(c.lead.at.short), `<span class="rel">${esc(c.lead.rel)}</span><span class="abs">${esc(c.lead.at.short)}</span>`)}${mt}</p>
    ${fol}
  </div>
  <div class="ni__tab">${vtab(comp)}</div>
</article>`;
}
// 화면 구분 띠(시안 설명용)
function divider(id, title, path, info) {
  return `<aside class="divider divider--screen" id="${id}" aria-label="시안 설명 — ${esc(title)}"><span><b>${title}</b> <code>${esc(path)}</code></span><span class="divider__info">${info}</span></aside>`;
}
// 시안 메모(제품에는 없음)
const anno = (h) => `<p class="anno"><span class="anno__k">시안 메모</span>${h}</p>`;
function secH(h, rh, { tag = "h2", id, thin = false, sub } = {}) {
  return `<div class="sec-h${thin ? " sec-h--thin" : ""}"><${tag}${id ? ` id="${id}"` : ""}>${h}</${tag}>${rh ? `<span class="rh" lang="en" aria-hidden="true">${rh}</span>` : ""}</div>${sub ? `<p class="sub">${sub}</p>` : ""}`;
}
function tocRow(href, label, count, { cur = false, tab, note } = {}) {
  return `<li><a class="ct-row" href="${href}"${cur ? ' aria-current="true"' : ""}>${tab ?? ""}<span class="ct-l">${label}</span><span class="lead" aria-hidden="true"></span>${count != null ? `<span class="c">${esc(count)}</span>` : ""}</a>${note ? `<p class="ct-note">${note}</p>` : ""}</li>`;
}
function follow(state, key, label, nm) {
  if (state === "limit")
    return `<button class="fol fol--limit" type="button" aria-disabled="true" data-follow="${key}" aria-describedby="fol-lim-note"><span class="fol__box" aria-hidden="true"></span><span class="fol__t">${label ?? "팔로우"}</span><span class="fol__c n">5/5</span><span class="sr">— 한도 5개 도달, ${esc(nm)} 팔로우 불가</span></button>`;
  const on = state === "on";
  return `<button class="fol" type="button" aria-pressed="${on}" data-follow="${key}"><span class="fol__box" aria-hidden="true"></span><span class="fol__t" data-on="팔로우 중" data-off="팔로우">${on ? "팔로우 중" : "팔로우"}</span><span class="sr"> — ${esc(nm)}</span></button>`;
}

/* ───────── 데이터 별칭 ───────── */
const M = D.meta;
const REF = M.reference;
const ISSUE = M.issue;
const PD = D.playerDetail;
const WK = D.weekly;
const TR = D.transfers;
const HOME = D.home;
const SP = D.specimens;
const KIM = PLAYER["kim-min-jae"];

/* ───────── 1. 셸: 마스트헤드 ───────── */
const masthead = `<header class="mast">
  <div class="ticket">
    <div class="ticket__brand">
      <p class="wordmark"><a href="${B}/">유로 다이제스트</a></p>
      <p class="wordmark-en" lang="en">EURO DIGEST</p>
      <p class="tagline">매일 아침, 밤사이 유럽 축구를 한눈에.</p>
    </div>
    <div class="ticket__tools">
      <button class="ibtn search" type="button" data-search-open aria-haspopup="dialog" aria-label="검색 (단축키 / 또는 ⌘K)">${ICON(IC.search)}<span class="search__t">검색</span><kbd>/</kbd></button>
      <button class="ibtn" type="button" data-theme-toggle aria-label="테마: 시스템 설정 (눌러서 바꾸기)">${ICON(IC.theme)}</button>
    </div>
    <span class="ticket__perf" aria-hidden="true"></span>
    <p class="issue"><span class="issue__k">제</span><span class="issue__n">${ISSUE.no}</span><span class="issue__k">호</span></p>
    <p class="stub"><time datetime="${ISSUE.date}">2026년 10월 31일 (토)</time><span>${esc(ISSUE.publishLabel)}</span><span>업데이트 ${esc(REF.time)} KST</span></p>
    <div class="switch"><span class="switch__l" id="spoil-l">결과 가리기</span><button class="switch__b" type="button" role="switch" aria-checked="false" aria-labelledby="spoil-l" data-spoiler-toggle><span class="off">끔</span><span class="on">켬</span></button></div>
  </div>
  <nav class="topnav" aria-label="주요 메뉴"><a href="${B}/">홈</a><a href="${B}/news/">뉴스</a><a href="${B}/competitions/epl/">리그</a><a href="${B}/korean-players/" aria-current="page">한국 선수</a><a href="${B}/my/">마이</a><span class="topnav__upd">마지막 업데이트 ${t(REF, REF.time + " KST")}</span></nav>
</header>`;

/* ───────── 화면 1a · 한국 선수 목록 ───────── */
function playerEntry(p) {
  const st = p.state.kind;
  const tm = p.team;
  const head = `<div class="pl__id">
    <h3 class="pl__n"><a href="${p.slug === "kim-min-jae" ? "#sc1b" : `${B}/korean-players/${p.slug}/`}">${esc(p.nameKo)}</a></h3>
    <p class="pl__en" lang="en">${esc(p.nameEn)}</p>
    <p class="pl__tm">${badge(tm.slug, "xs")}<span>${esc(tm.nameKo)}</span><span class="pl__pos">${esc(p.position)}</span>${st !== "linked" ? `<span class="stamp stamp--ph">${esc(p.state.label)}</span>` : ""}</p>
  </div>`;
  let rec, last, next, foot;
  if (st === "linked") {
    const s = p.season.total;
    rec = `<dl class="pl__rec" aria-label="시즌 누적 — ${esc(p.season.sinceLabel)}">
      <div><dt>출전</dt><dd class="n">${s.apps}</dd></div><div><dt>분</dt><dd class="n">${s.minutes}</dd></div><div><dt>골</dt><dd class="n${s.goals ? " is-g" : ""}">${s.goals}</dd></div><div><dt>도움</dt><dd class="n">${s.assists}</dd></div>
    </dl>`;
    const r = p.recent;
    last = `<p class="pl__ln"><span class="pl__lk">최근</span><span class="pl__lv">${t(r.kickoff, r.kickoff.dayShort + " " + r.kickoff.time)} · ${r.comp.id === "OTHER" ? "기타 대회" : esc(r.comp.shortKo)} · ${teamName(r.opponent)}(${esc(r.venueLabel)})<span class="pl__am">${am(r.status, r.statusLabel)}${r.appeared ? ` <b class="n">${r.minutes}</b>분` : ""}</span></span></p>`;
    foot = `<p class="pl__foot"><span>${/^UCL/.test(p.ucl?.label ?? "") ? esc(p.ucl.label) : `UCL ${esc(p.ucl?.label ?? "–")}`}</span><span>관련 뉴스 <b class="n">${p.news.total}</b></span></p>`;
  } else {
    rec = blank(p.season, { short: true, cls: "pl__blank" });
    last = "";
    foot = `<p class="pl__foot"><span>관련 뉴스 <b class="n">${p.news.total}</b></span></p>`;
  }
  if (p.next && !p.next.placeholder) {
    const x = p.next;
    next = `<p class="pl__ln"><span class="pl__lk">다음</span><span class="pl__lv">${t(x.kickoff, x.kickoff.dayShort + " " + x.kickoff.time)} · ${esc(x.comp.shortKo)} · ${esc(x.opponent.nameKo)}(${esc(x.venueLabel)})</span></p>`;
  } else next = `<p class="pl__ln"><span class="pl__lk">다음</span><span class="pl__lv pl__lv--na">${esc(p.next.reason)}</span></p>`;
  return `<article class="pl pl--${st}" id="pl-${p.slug}">${head}<div class="pl__d">${rec}${last}${next}${foot}</div></article>`;
}
const listGroups = D.players.groups
  .map(
    (g) => `<section class="grp" id="grp-${g.comp.toLowerCase()}" aria-labelledby="grp-${g.comp}-h">
  <div class="grp__h">${g.comp === "OTHER" ? `<span class="ftab ftab--other">기타</span>` : ftab(g.comp)}<h3 id="grp-${g.comp}-h">${esc(g.label)}</h3><span class="grp__c n">${g.count}<span>명</span></span></div>
  ${g.players.map(playerEntry).join("\n")}
</section>`
  )
  .join("\n");

const counts = D.players.counts;
const screen1a = `<section class="sheet" id="sc1" aria-labelledby="sc1-h">
  <nav class="sheet__toc" aria-label="한국 선수 목차">
    ${secH("목차", "CONTENTS", { tag: "h2" })}
    <ul class="ct">${D.players.groups.map((g) => tocRow(`#grp-${g.comp.toLowerCase()}`, esc(g.label), g.count, { tab: g.comp === "OTHER" ? `<span class="ftab ftab--other">기타</span>` : ftab(g.comp) })).join("")}${tocRow("#sc2", "주간 리포트 · 43주", null)}</ul>
  </nav>
  <header class="sheet__head">
    <p class="kick"><span>한국 선수</span><span class="rh" lang="en" aria-hidden="true">KOREAN PLAYERS</span></p>
    <h1 class="hed" id="sc1-h">한국 선수 <span class="n">${D.players.groups.reduce((a, g) => a + g.count, 0)}</span>명</h1>
    <p class="dek">${D.players.groups.map((g) => `${esc(g.label)} ${g.count}`).join(" · ")}. 출전 기록은 <b>${esc(D.players.aggregationSinceLabel)}</b>입니다 — 원장 ${t(M.ledger.updatedAt, M.ledger.updatedAt.dayShort + " " + M.ledger.updatedAt.time + " KST")} 갱신.</p>
  </header>
  <aside class="sheet__side" aria-label="옆단">
<div class="side-e">
    <section class="rec" aria-labelledby="sc1-wk-h">
      <h2 class="rec__h" id="sc1-wk-h"><span>이번 주 리포트</span><span class="rec__rh" lang="en" aria-hidden="true">WEEKLY</span></h2>
      <div class="rec__b">
        <p class="rec__k">${esc(WK.isoWeekLabel)} · ${esc(WK.range.label)}</p>
        <p class="rec__mvp"><span class="rec__mk">MVP</span><a href="#sc2">${esc(WK.mvp.nameKo)}</a><span class="rec__pt"><b class="n">${WK.mvp.score}</b>점</span></p>
        <p class="rec__f">${esc(WK.mvp.breakdown)}</p>
        <a class="tlink" href="#sc2">주간 리포트 읽기</a>
      </div>
    </section>
</div><div class="side-l">
    <section class="side-sec" aria-labelledby="sc1-lg-h">
      <h2 class="side-h" id="sc1-lg-h">출전 표시 읽는 법</h2>
      <ul class="lgd">${Object.entries(D.labels.appearance).map(([k, v]) => `<li>${am(k, v.label)}${v.note ? `<span class="lgd__n">${esc(v.note)}</span>` : ""}</li>`).join("")}</ul>
      <p class="note">분이 비어 있으면 "–"(0으로 바꾸지 않음). 컵 대회는 "기타 대회"로 묶는다.</p>
    </section>
</div>
  </aside>
  <div class="sheet__body">${listGroups}</div>
</section>`;

/* ───────── 화면 1b · 김민재 상세 ───────── */
const h = PD.head;
const seasonRows = PD.season.byComp
  .map((r) => {
    const sub = [r.bench ? `벤치 ${r.bench}` : "", r.absent ? `명단 제외 ${r.absent}` : "", r.leaguesRaw[0] && r.comp.id === "OTHER" ? `` : ""].filter(Boolean).join(" · ");
    return `<tr><th scope="row">${r.comp.id === "OTHER" ? `<span class="ftab ftab--other">기타</span>` : ftab(r.comp.id)}${sub ? `<span class="st__sub">${sub}</span>` : ""}</th><td class="n">${r.apps}</td><td class="n">${r.minutes}</td><td class="n">${r.goals}</td><td class="n">${r.assists}</td></tr>`;
  })
  .join("");
const T = PD.season.total;
const logRows = PD.log5
  .map((r, i) => {
    if (r.placeholder)
      return `<li class="lg lg--ph"><span class="lg__no n">${i + 1}</span><p class="lg__d" aria-hidden="true"><b class="lg__dash"></b></p><div class="lg__ph"><b>${esc(r.label)}</b><span class="lg__phl" aria-hidden="true"></span></div></li>`;
    return `<li class="lg"><span class="lg__no n">${i + 1}</span>
    <p class="lg__d">${t(r.kickoff, md(r.kickoff))}<span>${esc(dow(r.kickoff))} ${esc(r.kickoff.time)}</span></p>
    <div class="lg__b">
      <p class="lg__k">${r.comp.id === "OTHER" ? `<span class="ftab ftab--other">기타</span><span>기타 대회</span>` : `${ftab(r.comp.id)}`}<span>${esc(r.roundLabel)}</span></p>
      <p class="lg__o">${badge(r.opponent.slug, "xs")}<span>${teamName(r.opponent)}</span><span class="lg__v">${esc(r.venueLabel)}</span></p>
      <p class="lg__a">${am(r.status, r.statusLabel)}<span class="lg__min">${r.appeared ? `<b class="n">${r.minutes}</b>분` : r.minutes == null ? `<span class="sr">출전 시간 </span><b class="n">–</b>` : ""}</span></p>
    </div>
    <div class="lg__r">${spo(r.result, `${md(r.kickoff)} ${r.opponent.name}전`)}</div>
  </li>`;
  })
  .join("");
const nx = PD.next;
const upRows = PD.upcoming
  .slice(1)
  .map((u) => `<li class="up"><span class="up__d">${t(u.kickoff, u.kickoff.dayShort)}<b class="n">${esc(u.kickoff.time)}</b></span>${ftab(u.comp.id)}<span class="up__o">${badge(u.opponent.slug, "xs")}${esc(u.opponent.nameKo)}<span class="lg__v">${esc(u.venueLabel)}</span></span></li>`)
  .join("");
const kimTr = TR.items.find((x) => x.id === PD.transferLink.transferId);
const screen1b = `<section class="sheet sheet--profile" id="sc1b" aria-labelledby="sc1b-h">
  <nav class="sheet__toc" aria-label="선수 기사 목차">
    ${secH("목차", "CONTENTS")}
    <ul class="ct">${tocRow("#kim-log", "최근 5경기", 3)}${tocRow("#kim-next", "다음 경기", PD.upcoming.length)}${tocRow("#kim-news", "관련 뉴스", PD.news.total)}${tocRow("#kim-tr", "이적설", 1)}${tocRow("#kim-nat", "대표팀 소식", PD.nationalNews.ids.length)}</ul>
  </nav>
  <header class="sheet__head">
    <p class="kick"><a class="kick__a" href="#sc1">한국 선수</a><span aria-hidden="true">›</span><span>${esc(h.compLabel)}</span><span class="rh" lang="en" aria-hidden="true">PLAYER FOCUS</span></p>
    <div class="ph">
      <h1 class="hed hed--xl" id="sc1b-h">${esc(h.nameKo)}</h1>
      <p class="ph__en" lang="en">${esc(h.nameEn)}</p>
    </div>
    <p class="ph__facts">${badge(h.team.slug, "s")}<a href="${B}/teams/${h.team.slug}/">${esc(h.team.nameKo)}</a><span>${esc(h.position)}</span><span><span class="n">${h.birthYear}</span>년생</span><span>${esc(h.compLabel)} <span class="n">${h.teamStanding.pos}</span>위</span></p>
    <div class="ph__act">${follow("on", "player:kim-min-jae", null, "김민재")}<span class="ph__note">팔로우 표본(시안) — 켜짐</span></div>
  </header>
  <aside class="sheet__side" aria-label="옆단 — 시즌 기록">
<div class="side-e">
    <section class="rec" aria-labelledby="kim-rec-h">
      <h2 class="rec__h" id="kim-rec-h"><span>시즌 기록</span><span class="rec__rh" lang="en" aria-hidden="true">RECORD</span></h2>
      <div class="rec__b">
        <p class="rec__k">${esc(PD.season.sinceLabel)} · 원장 행 <span class="n">${T.rows}</span></p>
        <div class="rec__tot"><div><b class="n">${T.apps}</b><span>출전</span></div><div><b class="n">${T.minutes}</b><span>분</span></div><div><b class="n">${T.goals}</b><span>골</span></div><div><b class="n">${T.assists}</b><span>도움</span></div></div>
        <table class="st"><caption class="sr">대회별 시즌 기록 (${esc(PD.season.sinceLabel)})</caption><thead><tr><th scope="col">대회</th><th scope="col" class="num">출전</th><th scope="col" class="num">분</th><th scope="col" class="num">골</th><th scope="col" class="num">도움</th></tr></thead><tbody>${seasonRows}</tbody></table>
        <p class="rec__f">UCL ${esc(PD.ucl.label)} · ${esc(PD.ucl.detail)} — 리그 페이즈</p>
      </div>
    </section>
    <section class="side-sec" aria-labelledby="kim-team-h">
      <h2 class="side-h" id="kim-team-h">소속팀 ${esc(h.compLabel)}</h2>
      <p class="tmini">${badge(h.team.slug, "s")}<span class="tmini__n">${esc(h.team.nameKo)}</span><span class="tmini__p"><b class="n">${h.teamStanding.pos}</b>위 · <b class="n">${h.teamStanding.pts}</b>점</span></p>
      <p class="tmini__s"><span class="n">${h.teamStanding.played}</span>경기 <span class="n">${h.teamStanding.w}</span>승 <span class="n">${h.teamStanding.d}</span>무 <span class="n">${h.teamStanding.l}</span>패 <span class="form" role="img" aria-label="최근 5경기(오래된 순): ${h.teamStanding.form.map((x) => ({ W: "승", D: "무", L: "패" })[x]).join(", ")}">${h.teamStanding.form.map((x) => fm(x)).join("")}</span></p>
    </section>
    <section class="side-sec" aria-labelledby="kim-tr">
      <h2 class="side-h" id="kim-tr">이적설</h2>
      <a class="trl" href="#tr-kim-min-jae"><span class="trl__s">${punch(kimTr.status, kimTr.filled)}<b>${esc(kimTr.stageLabel)}</b>${tier(kimTr.bestTier)}</span><span class="trl__to"><span class="trl__ar" aria-hidden="true">→</span><span class="sr">행선지 </span>${badge(kimTr.to.slug, "xs")}${esc(kimTr.to.nameKo)}</span><span class="trl__u">최근 갱신 ${t(kimTr.updated, kimTr.updated.dayShort + " " + kimTr.updated.time)} · 기사 <span class="n">${kimTr.timeline.length}</span>건</span><span class="trl__go">이적 면에서 타임라인 보기 ›</span></a>
    </section>
</div><div class="side-l"></div>
  </aside>
  <div class="sheet__body">
    <section aria-labelledby="kim-log">
      ${secH("최근 5경기", "MATCH LOG", { id: "kim-log", sub: `결과는 ${esc(h.team.nameKo)} 기준(득-실) · 최신순` })}
      <ol class="lgs">${logRows}</ol>
      <p class="lgs__cap"><span class="blank__k">자리</span>4·5번 칸 — ${esc(PD.log5[3].reason)} · 채울 단계 <b class="id">${esc(PD.log5[3].fillStage)}</b></p>
    </section>
    <section class="art-sec" aria-labelledby="kim-next">
      ${secH("다음 경기", "NEXT", { id: "kim-next" })}
      <div class="nx">
        <p class="nx__d">${t(nx.kickoff, nx.kickoff.dayShort)}<b class="n">${esc(nx.kickoff.time)}</b><span>KST</span></p>
        <div class="nx__b"><p class="nx__k">${ftab(nx.comp.id)}<span>${esc(nx.roundLabel)}</span><span>${esc(nx.venueLabel)}</span></p>
        <p class="nx__vs"><span>${badge(nx.homeTeam.slug, "s")}${esc(nx.homeTeam.nameKo)}</span><span class="nx__x" aria-hidden="true">vs</span><span class="sr">대</span><span>${badge(nx.awayTeam.slug, "s")}${esc(nx.awayTeam.nameKo)}</span></p></div>
        <div class="nx__ics"><button class="btn btn--ph" type="button" aria-disabled="true" aria-describedby="ics-ph">${ICON(IC.cal, 18)}캘린더(.ics)</button><span class="note" id="ics-ph">자리 · ${esc(PD.ics.fillStage)}</span></div>
      </div>
      <ul class="ups">${upRows}</ul>
    </section>
    <section class="art-sec" aria-labelledby="kim-news">
      ${secH(`관련 뉴스 <span class="n">${PD.news.total}</span>`, "COVERAGE", { id: "kim-news", sub: "한국어 32 · 영문 0 · 대표 출처 시각 최신순" })}
      <div class="nis">${PD.news.ko.slice(0, 4).map((id) => newsItem(id, { cls: "ni--kim" })).join("")}</div>
      <a class="tlink" href="${B}/search/?q=%EA%B9%80%EB%AF%BC%EC%9E%AC">관련 뉴스 ${PD.news.total}건 모두 보기</a>
      ${blank(PD.news.en, { title: "영문 관련 뉴스 0건" })}
    </section>

    <section class="art-sec" aria-labelledby="kim-nat">
      ${secH("대표팀 소식", "NATIONAL TEAM", { id: "kim-nat" })}
      <div class="nis">${PD.nationalNews.ids.map((id) => newsItem(id, { cls: "ni--nat" })).join("")}</div>
      ${blank(HOME.nationalTeam.squad, { title: "소집 명단 · A매치 일정", short: true })}
    </section>
  </div>
</section>`;

/* ───────── 화면 2 · 주간 리포트 W43 ───────── */
const mvp = WK.mvp;
const mvpRow = WK.rows.find((r) => r.player === mvp.player);
const gd = mvp.goalDetail[0];
const wkRows = WK.rows
  .map((r) => {
    const isM = r.player === mvp.player;
    const ms = r.matches
      .map((m) => `<li>${t(m.kickoff, m.kickoff.dayShort)} ${m.comp.id === "OTHER" ? "기타" : esc(m.comp.shortKo)} · ${esc(m.opponent)} · ${am(m.status, m.statusLabel)}${m.minutes ? ` <span class="n">${m.minutes}</span>분` : ""}${m.goals ? ` · <span class="n">${m.goals}</span>골` : ""}</li>`)
      .join("");
    return `<tr class="${isM ? "is-mvp" : ""}"><th scope="row"><span class="wt__n">${isM ? `<span class="stamp stamp--mvp">MVP</span>` : ""}<a href="${B}/korean-players/${r.player}/">${esc(r.nameKo)}</a></span><span class="wt__tm">${badge(r.team.slug, "xs")}${esc(r.team.nameKo)}</span><ul class="wt__ms">${ms}</ul></th><td class="n">${r.apps}</td><td class="n">${r.minutes}</td><td class="n${r.goals ? " is-g" : ""}">${r.goals}</td><td class="n">${r.assists}</td><td class="n wt__pt">${r.mvpScore}</td></tr>`;
  })
  .join("");
const w44 = WK.w44InProgress;
const screen2 = `<section class="sheet sheet--weekly" id="sc2" aria-labelledby="sc2-h">
  <nav class="sheet__toc" aria-label="주간 리포트 아카이브">
    ${secH("주간 리포트", "ARCHIVE")}
    <ul class="ct">
      <li><span class="ct-row ct-row--off"><span class="ct-l">${esc(WK.archive.next.week.replace("2026-", ""))}주</span><span class="lead" aria-hidden="true"></span><span class="ct-s">${esc(WK.archive.next.label)}</span></span></li>
      ${tocRow("#sc2", `${esc(WK.week.replace("2026-", ""))}주 · ${esc(WK.range.label)}`, null, { cur: true })}
      <li><span class="ct-row ct-row--off"><span class="ct-l">${esc(WK.archive.prev.week.replace("2026-", ""))}주</span><span class="lead" aria-hidden="true"></span><span class="ct-s">없음</span></span><p class="ct-note">${esc(WK.archive.prev.reason)}</p></li>
    </ul>
  </nav>
  <header class="sheet__head">
    <p class="kick"><span>주간 리포트</span><span>${esc(WK.isoWeekLabel)}</span><span class="rh" lang="en" aria-hidden="true">WEEKLY REPORT</span></p>
    <nav class="wnav" aria-label="주간 리포트 이동">
      <span class="wnav__b is-off" aria-disabled="true">${ICON(IC.prev, 16)}<span><span class="n">42</span>주</span><span class="sr"> — ${esc(WK.archive.prev.reason)}</span></span>
      <p class="wnav__c"><b><span class="n">43</span>주</b> ${t(WK.range.from, WK.range.label)}</p>
      <span class="wnav__b is-off" aria-disabled="true"><span><span class="n">44</span>주</span>${ICON(IC.next, 16)}<span class="sr"> — ${esc(WK.archive.next.label)}</span></span>
    </nav>
    <div class="mvp">
      <p class="mvp__k"><span class="stamp stamp--mvp">이번 주 MVP</span><span>${badge(mvpRow.team.slug, "xs")}${esc(mvpRow.team.nameKo)} · ${esc(PLAYER[mvp.player].position)}</span></p>
      <h1 class="hed hed--xl" id="sc2-h"><span class="sr">43주 MVP </span>${esc(mvp.nameKo)}</h1>
      <p class="dek">${t(gd.kickoff, gd.kickoff.dayShort + " " + gd.kickoff.time)} ${esc(gd.opponent)}전 <b><span class="n">${gd.goalMinutes[0]}</span>분 골</b> · ${esc(mvpRow.team.nameKo)} ${spo(gd.result, `${esc(gd.opponent)}전`, { homeAway: "홈" })}</p>
      <p class="wk-pub">${esc(WK.publish.label)} · 출전 기록 ${esc(WK.range.label)}</p>
    </div>
  </header>
  <aside class="sheet__side" aria-label="옆단 — MVP 점수">
<div class="side-e">
    <section class="rec" aria-labelledby="wk-pt-h">
      <h2 class="rec__h" id="wk-pt-h"><span>MVP 점수</span><span class="rec__rh" lang="en" aria-hidden="true">SCORE</span></h2>
      <div class="rec__b">
        <p class="pt-big"><b class="n">${mvp.score}</b><span>점</span></p>
        <p class="pt-f"><span><b class="n">${mvpRow.goals}</b>골 ×<span class="n">3</span></span><span>+</span><span><b class="n">${mvpRow.assists}</b>도움 ×<span class="n">2</span></span><span>+</span><span><b class="n">${mvpRow.apps}</b>출전</span></p>
        <p class="rec__f">${esc(mvp.rule)}</p>
      </div>
    </section>
</div><div class="side-l">
    <section class="side-sec" aria-labelledby="wk-ru-h">
      <h2 class="side-h" id="wk-ru-h">다음 순위</h2>
      <ol class="ru">${mvp.runnersUp.map((r) => `<li><span>${esc(r.nameKo)}</span><span class="lead" aria-hidden="true"></span><b class="n">${r.score}</b><span class="ru__u">점</span></li>`).join("")}</ol>
    </section>
    ${anno(`W44(진행 중, 미발행)은 ${w44.tiedLeaders.map((x) => esc(x.nameKo)).join("·")}가 모두 <span class="n">1</span>점 동점 — 동점 규칙 미정(scope §6 #3). 김민재 프라이부르크전(10.25 16:30Z)은 KST로 자르면 W44로 넘어간다(§6 #2, 표 숫자는 같음).`)}
</div>
  </aside>
  <div class="sheet__body">
    <section class="col-sum" aria-labelledby="wk-sum-h">
      <h2 class="col-sum__h" id="wk-sum-h">총평</h2>
      ${blank(WK.summary, { title: `<span class="n">${esc(WK.summary.sentences)}</span>문장`, lines: 5, ai: true })}
    </section>
    <section class="art-sec" aria-labelledby="wk-tb-h">
      <div class="rec rec--wide">
        <h2 class="rec__h" id="wk-tb-h"><span>출전 기록 · <span class="n">${WK.rows.length}</span>명</span><span class="rec__rh" lang="en" aria-hidden="true">BOX SCORE</span></h2>
        <table class="wt"><caption class="sr">43주 한국 선수 출전 기록 — ${esc(WK.rowOrder)}</caption>
          <thead><tr><th scope="col">선수</th><th scope="col" class="num">출전</th><th scope="col" class="num">분</th><th scope="col" class="num">골</th><th scope="col" class="num">도움</th><th scope="col" class="num">점수</th></tr></thead>
          <tbody>${wkRows}</tbody></table>
        <p class="rec__f wt__foot">표 밖 — ${WK.excluded.map((x) => `<b>${esc(x.nameKo)}</b> ${esc(x.reason)}`).join(" · ")}</p>
      </div>
    </section>
  </div>
</section>`;

/* ───────── 화면 3 · 이적 ───────── */
function trTeams(it) {
  const s = new Set();
  if (it.affiliation) s.add(it.affiliation.team.slug);
  if (it.to) s.add(it.to.slug);
  for (const id of it.timeline) for (const g of D.cards[id].tags) if (g.kind === "team") s.add(g.slug);
  return [...s].filter((x) => TR.filters.team.some((f) => f.slug === x));
}
function tlItem(at, card, kind, status, stageLabel, idp) {
  const c = D.cards[card];
  const isStage = kind === "stage";
  return `<li class="tl__i${isStage ? "" : " tl__i--aux"}" id="${idp}-${card}">
    <p class="tl__d">${t(at, md(at))}<span>${esc(at.time)}</span></p>
    <span class="tl__node${isStage ? ` tl__node--${status}` : " tl__node--aux"}" aria-hidden="true"></span>
    <div class="tl__b">
      <p class="tl__k">${isStage ? `<b class="tl__st">${esc(stageLabel)}</b>${tier(c.lead.tier)}` : `<span class="tl__aux">보조 · 단계 없음</span>`}</p>
      <h4 class="tl__t" lang="${c.lang}"><a href="${esc(c.lead.u)}" target="_blank" rel="noopener">${titleHtml(c)}</a></h4>
      <p class="ni__m"><span class="src">${esc(c.lead.n)}</span>${c.more ? `<span class="more">+${c.more.n}${esc(c.more.unit)}</span>` : ""}</p>
    </div>
  </li>`;
}
function story(it, { idp = "tr" } = {}) {
  const teams = trTeams(it);
  const lead = D.cards[it.timeline[it.timeline.length - 1]];
  const entries = it.history.map((hh) => ({ at: hh.at, card: hh.card, kind: "stage", status: hh.status, stageLabel: hh.stageLabel }));
  if (it.auxiliaryCards) for (const id of it.auxiliaryCards.ids) entries.push({ at: D.cards[id].lead.at, card: id, kind: "aux" });
  entries.sort((a, b) => (a.at.utc < b.at.utc ? 1 : -1));
  const name = it.playerName
    ? `<h3 class="sty__n" id="${idp}-${it.player}-h">${esc(it.playerName)}</h3>`
    : `<h3 class="sty__n sty__n--none" id="${idp}-${it.player}-h"><span class="sty__slot" aria-hidden="true"></span><span class="sr">선수 이름 표기 없음 — </span><span class="sty__nn">이름 칸 비움 · 표기 사전(names.ko) 미등록 — 아래 원제목으로 읽는다</span></h3>`;
  const route = `<p class="sty__rt">${it.affiliation ? `<span class="sty__aff"><span class="sty__ak">소속</span>${badge(it.affiliation.team.slug, "xs")}${esc(it.affiliation.team.nameKo)}</span>` : ""}<span class="sty__ft"><span class="sty__from" title="${esc(it.fromNote)}"><span class="sty__ak">출발</span><span class="sty__q">미확인</span></span><span class="sty__ar" aria-hidden="true">→</span><span class="sr">에서</span><span class="sty__to">${it.to ? `<span class="sty__ak">행선지</span>${badge(it.to.slug, "xs")}<b>${esc(it.to.nameKo)}</b>` : `<span class="sty__ak">행선지</span><span class="sty__q">미확인</span>`}</span></span></p>`;
  return `<article class="sty" id="${idp}-${it.player}" data-league="${it.comps.map((c) => c.id).join(" ")}" data-team="${teams.join(" ")}" data-status="${it.status}" data-tier="${it.bestTier}" data-kr="${it.registeredKorean}" aria-labelledby="${idp}-${it.player}-h">
  <header class="sty__h">
    <p class="sty__k">${it.comps.map((c) => ftab(c.id)).join("")}${it.registeredKorean ? `<span class="arm" title="한국 선수">한국</span>` : ""}<span class="sty__u">최근 갱신 ${t(it.updated, it.updated.dayShort + " " + it.updated.time)}${/전$/.test(it.updatedRel) ? ` · ${esc(it.updatedRel)}` : ""}</span></p>
    ${name}
    ${route}
    <div class="sty__s">${stageBar(it.status, it.filled)}<span class="sty__tier">최고 출처 ${tier(it.bestTier)}</span></div>
  </header>
  <ol class="tl" aria-label="${esc(it.playerName ?? "이 이적")} 기사 타임라인 — 최신순">${entries.map((e) => tlItem(e.at, e.card, e.kind, e.status, e.stageLabel, idp)).join("")}</ol>
  ${it.auxiliaryCards ? `<p class="note sty__aux">보조 ${it.auxiliaryCards.ids.length}건 = 같은 선수의 이적 분류 카드(단계 필드 없음 — 아스널·토트넘·AC 밀란). 타임라인에 넣을지는 M4-01에서 정함(scope §6 #4)</p>` : ""}
</article>`;
}
function ixGroup(key, title, entries) {
  return `<div class="ix__g" role="group" aria-labelledby="ix-${key}-h"><p class="ix__h" id="ix-${key}-h">${title}</p><ul>${entries
    .map((e) => `<li><button class="ix__e" type="button" data-f="${key}" data-v="${esc(e.v)}" aria-pressed="false"${e.c === 0 ? ' aria-disabled="true"' : ""}><span class="ix__box" aria-hidden="true"></span><span class="ix__l">${e.l}</span><span class="lead" aria-hidden="true"></span><span class="c">${e.c}</span></button></li>`)
    .join("")}</ul></div>`;
}
const F = TR.filters;
const ixHtml = `<div class="ix" data-ix>
  ${ixGroup("league", "리그", F.league.map((x) => ({ v: x.id, l: `${ftab(x.id)}<span>${esc(x.label)}</span>`, c: x.count })))}
  ${ixGroup("team", "팀", F.team.map((x) => ({ v: x.slug, l: `${badge(x.slug, "xs")}<span>${esc(x.label)}</span>`, c: x.count })))}
  ${ixGroup("status", "상태", F.status.map((x) => ({ v: x.id, l: `${punch(x.id, D.labels.transferStage[x.id].filled)}<span>${esc(x.label)}</span>`, c: x.count })))}
  ${ixGroup("tier", "출처 Tier", F.tier.map((x) => ({ v: String(x.tier), l: `${tier(x.tier)}`, c: x.count })))}
  ${ixGroup("kr", "한국 선수", [{ v: "true", l: `<span class="arm">한국</span><span>${esc(F.korean.label)}만</span>`, c: F.korean.count }])}
  <p class="ix__clr"><button class="tlink" type="button" data-ix-clear>색인 선택 지우기</button></p>
</div>`;
const quietSpec = TR.quietSpecimen;
const screen3 = `<section class="sheet sheet--toc" id="sc3" aria-labelledby="sc3-h">
  <header class="sheet__head">
    <p class="kick"><span>이적</span><span class="rh" lang="en" aria-hidden="true">TRANSFERS</span></p>
    <h1 class="hed" id="sc3-h">이적 <span class="n">${TR.counts.items}</span>건</h1>
    <p class="dek">선수 단위로 묶은 이적 기사 타임라인. 이적 분류 카드 <span class="n">${TR.counts.transferCategoryCardsLive}</span>장 중 단계 정보가 있는 카드는 <span class="n">${TR.counts.cardsWithFieldLive}</span>장이고, 견본 <span class="n">${TR.counts.cardsWithField - TR.counts.cardsWithFieldLive}</span>장(fixtures)을 더했다.</p>
    <p class="win"><span class="win__k">이적 창</span><b>꺼짐</b><span class="win__d">창 날짜 — 자리 · <span class="id">${esc(TR.window.dates.fillStage)}</span></span></p>
  </header>
  <nav class="sheet__toc" aria-label="이적 색인(필터)">
    <details class="ix-d" data-ix-details>
      <summary class="ix-d__s"><span class="ix-d__t">색인</span><span class="rh" lang="en" aria-hidden="true">INDEX</span><span class="ix-d__sel" data-ix-sel>리그 · 팀 · 상태 · Tier · 한국 선수</span><span class="ix-d__more" aria-hidden="true"></span></summary>
      ${ixHtml}
    </details>
  </nav>
  <aside class="sheet__side" aria-label="옆단 — 읽는 법">
<div class="side-e"></div><div class="side-l">
    <section class="rec" aria-labelledby="tr-lg-h">
      <h2 class="rec__h" id="tr-lg-h"><span>단계 · Tier 읽는 법</span><span class="rec__rh" lang="en" aria-hidden="true">KEY</span></h2>
      <div class="rec__b">
        <ul class="lgd lgd--st">${["rumor", "negotiating", "agreed", "official", "collapsed"].map((s) => `<li>${punch(s, D.labels.transferStage[s].filled)}<b>${esc(D.labels.transferStage[s].label)}</b></li>`).join("")}</ul>
        <ul class="lgd lgd--tier">${[1, 2, 3].map((x) => `<li>${tier(x)}<span>${esc(D.labels.tiers[x].replace(/^Tier \d — /, ""))}</span></li>`).join("")}</ul>
        <p class="rec__f">${esc(TR.rules.tier)}</p>
      </div>
    </section>
    <section class="side-sec win-on" aria-labelledby="tr-win-h">
      <h2 class="side-h" id="tr-win-h">견본 — 이적 창 켜짐</h2>
      <p class="win win--on"><span class="win__k">이적 창</span><b>열림</b><span class="win__d">날짜 자리 · <span class="id">${esc(TR.window.dates.fillStage)}</span></span></p>
      <p class="note">켜지면 홈 '이적 핫 리스트'가 위로 올라간다(FR-105, 위치 규칙만).</p>
    </section>
</div>
  </aside>
  <div class="sheet__body">
    <p class="tr-res" aria-live="polite" data-tr-res>전체 <b class="n">${TR.items.length}</b>건 · 최근 갱신 순</p>
    <div class="stys" data-stys>${TR.items.map((it) => story(it)).join("\n")}
    <p class="tr-empty" data-tr-empty hidden><b class="zero n" aria-hidden="true">0</b><span>색인에 맞는 이적이 없어요. 선택을 줄여 보세요.</span></p></div>
    <section class="quiet" aria-labelledby="tr-q-h">
      ${secH("잠잠", "QUIET", { thin: true, id: "tr-q-h", sub: "마지막 갱신 + 30일이 지난 이적은 목록 아래로(FR-106)" })}
      <div class="sty sty--quiet"><p class="sty__k"><span class="stamp stamp--ph">견본</span><span class="sty__u">실데이터 <span class="n">${quietSpec.realCount}</span>건 — 가장 오래된 갱신 ${t(quietSpec.oldestUpdate, quietSpec.oldestUpdate.dayShort)}(<span class="n">21</span>일)</span></p>
      <div class="sty__s">${stageBar("rumor", 1)}<span class="sty__tier">최고 출처 ${tier(3)}</span></div>
      <p class="note">잠잠 카드 = 단계 바·Tier는 그대로, 글자는 보조색 · 타임라인 접힘 · '잠잠 n일' 표기(<span class="n">30</span>일 기준)</p></div>
    </section>
  </div>
</section>`;

/* ───────── 화면 4a · /my ───────── */
const MY = D.my;
function myTeam(tm) {
  const s = tm.standing;
  const rec = tm.recent
    .map((r) => `<li><span class="mt__d">${t(r.kickoff, md(r.kickoff))}</span>${ftab(r.comp.id)}<span class="mt__o">${esc(r.opponent.nameKo)}<span class="lg__v">${esc(r.venueLabel)}</span></span>${spo(r.result, `${md(r.kickoff)} ${r.opponent.nameKo}전`)}</li>`)
    .join("");
  const x = tm.next;
  return `<article class="mt" aria-labelledby="mt-${tm.team.slug}">
    <div class="mt__h">${badge(tm.team.slug, "m")}<div><h3 id="mt-${tm.team.slug}"><a href="${B}/teams/${tm.team.slug}/">${esc(tm.team.nameKo)}</a></h3><p class="mt__s">${ftab(s.comp)}<span><b class="n">${s.pos}</b>위 · <b class="n">${s.pts}</b>점</span></p></div></div>
    <p class="mt__nx"><span class="pl__lk">다음</span><span>${t(x.kickoff, x.kickoff.dayShort + " " + x.kickoff.time)} · ${esc(x.comp.shortKo)} · ${esc(x.opponent.nameKo)}(${esc(x.venueLabel)})</span></p>
    <ol class="mt__r" aria-label="최근 경기 3 — ${esc(tm.team.nameKo)} 기준 결과">${rec}</ol>
  </article>`;
}
function myPlayer(p) {
  const r = p.recent;
  const x = p.next;
  return `<article class="mt mt--p" aria-labelledby="mp-${p.slug}">
    <div class="mt__h"><span class="arm" title="한국 선수">한국</span><div><h3 id="mp-${p.slug}"><a href="${p.slug === "kim-min-jae" ? "#sc1b" : `${B}/korean-players/${p.slug}/`}">${esc(p.nameKo)}</a></h3><p class="mt__s">${badge(p.team.slug, "xs")}<span>${esc(p.team.nameKo)}</span></p></div></div>
    <p class="mt__nx"><span class="pl__lk">최근</span><span>${t(r.kickoff, r.kickoff.dayShort)} · ${teamName(r.opponent)} · ${am(r.status, r.statusLabel)}${r.appeared ? ` <b class="n">${r.minutes}</b>분` : ""}</span></p>
    <p class="mt__nx"><span class="pl__lk">다음</span><span>${t(x.kickoff, x.kickoff.dayShort + " " + x.kickoff.time)} · ${esc(x.opponent.nameKo)}(${esc(x.venueLabel)})</span></p>
  </article>`;
}
const manage = [...MY.teams.map((x) => ({ k: `team:${x.team.slug}`, nm: x.team.nameKo, b: badge(x.team.slug, "xs"), kind: "팀" })), ...MY.players.map((p) => ({ k: `player:${p.slug}`, nm: p.nameKo, b: `<span class="arm">한국</span>`, kind: "선수" }))];
const screen4a = `<section class="sheet" id="sc4" aria-labelledby="sc4-h">
  <nav class="sheet__toc" aria-label="마이 목차">
    ${secH("내 지면", "MY EDITION")}
    <ul class="ct">${tocRow("#my-news", "내 팀 소식", MY.news.latestIssue.count)}${MY.teams.map((x) => tocRow(`#mt-${x.team.slug}`, esc(x.team.nameKo), null, { tab: badge(x.team.slug, "xs") })).join("")}${MY.players.map((p) => tocRow(`#mp-${p.slug}`, esc(p.nameKo), null, { tab: `<span class="arm">한국</span>` })).join("")}${tocRow("#my-manage", "팔로우 관리", `${MY.limit.used}/${MY.limit.max}`)}</ul>
  </nav>
  <header class="sheet__head">
    <p class="kick"><span>마이</span><span class="stamp stamp--ph">시안 표본</span><span class="rh" lang="en" aria-hidden="true">MY EDITION</span></p>
    <h1 class="hed" id="sc4-h">내 지면</h1>
    <p class="dek">팔로우 <b><span class="n">${MY.limit.used}</span>/<span class="n">${MY.limit.max}</span></b> — 팀 <span class="n">${MY.teams.length}</span> · 한국 선수 <span class="n">${MY.players.length}</span>. 이 기기에만 저장된다(로그인 없음).</p>
  </header>
  <aside class="sheet__side" aria-label="옆단 — 팔로우 관리">
<div class="side-e"></div><div class="side-l">
    <section class="rec" id="my-manage" aria-labelledby="my-mg-h">
      <h2 class="rec__h" id="my-mg-h"><span>팔로우 관리 · <span class="n" data-fol-count>${MY.limit.used}/${MY.limit.max}</span></span><span class="rec__rh" lang="en" aria-hidden="true">FOLLOWING</span></h2>
      <div class="rec__b">
        <ul class="mg">${manage.map((m) => `<li><span class="mg__n">${m.b}<span>${esc(m.nm)}</span><span class="mg__k">${m.kind}</span></span>${follow("on", m.k, null, m.nm)}</li>`).join("")}</ul>
        <p class="rec__f" id="fol-lim-note">한도 <span class="n">${MY.limit.max}</span>개(시안 가정 — M4-07). 가득 차면 다른 화면의 팔로우 버튼이 점선 '5/5'로 바뀐다.</p>
      </div>
    </section>
    <section class="side-sec" aria-labelledby="my-ex-h">
      <h2 class="side-h" id="my-ex-h">내보내기 · 가져오기</h2>
      <ol class="exs">${MY.exportImport.states.map((s, i) => `<li><span class="n">${i + 1}</span><span>${esc(s)}</span></li>`).join("")}</ol>
      ${blank(MY.exportImport, { short: true })}
      <h2 class="side-h" style="margin-top:20px">팀 일정 캘린더</h2>
      ${blank(MY.icsBundle, { short: true, title: "팔로우 팀 .ics 묶음" })}
    </section>
</div>
  </aside>
  <div class="sheet__body">
    <section aria-labelledby="my-news">
      ${secH(`내 팀 소식 <span class="n">${MY.news.latestIssue.count}</span>`, "MY NEWS", { id: "my-news", sub: `제 ${MY.news.latestIssue.issueNo}호 · 팔로우에 걸린 카드 · 전체 호 ${MY.news.allIssues.count}건` })}
      <div class="nis">${MY.news.latestIssue.cards.slice(0, 4).map((c) => newsItem(c.id, { follow: c.followMatch, cls: "ni--my" })).join("")}</div>
    </section>
    <section class="art-sec" aria-labelledby="my-tm-h">
      ${secH("팔로우 팀", "CLUBS", { id: "my-tm-h", sub: "다음 경기 · 최근 결과 3(그 팀 기준)" })}
      <div class="mts">${MY.teams.map(myTeam).join("")}</div>
    </section>
    <section class="art-sec" aria-labelledby="my-pl-h">
      ${secH("팔로우 선수", "PLAYERS", { id: "my-pl-h" })}
      <div class="mts">${MY.players.map(myPlayer).join("")}</div>
    </section>
  </div>
</section>`;

/* ───────── 화면 4b · 온보딩(구독 신청서) ───────── */
const OB = D.onboarding;
const s1 = OB.steps[0], s2 = OB.steps[1], s3 = OB.steps[2];
const box = (on) => `<span class="ix__box" aria-hidden="true"></span>`;
const ob1 = s1.options.map((o) => `<li><button class="ob__o" type="button" aria-pressed="${s1.sampleSelected.includes(o.id)}" data-ob="league" data-v="${o.id}">${box()}${ftab(o.id)}<span class="ob__l">${esc(o.nameKo)}</span><span class="ob__c"><span class="n">${o.teamCount}</span>팀</span></button></li>`).join("");
const ob2tabs = s2.byLeague.map((g, i) => `<button class="ctab tab--${TABCLS[g.comp.id]}" type="button" role="tab" id="obt-${g.comp.id}" aria-controls="obp-${g.comp.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(g.comp.shortKo)}</button>`).join("");
const ob2panels = s2.byLeague
  .map(
    (g, i) => `<div class="ob__panel" role="tabpanel" id="obp-${g.comp.id}" aria-labelledby="obt-${g.comp.id}"${i === 0 ? "" : " hidden"}><ul class="ob__tg">${g.teams
      .map((tm) => `<li><button class="ob__o ob__o--t" type="button" aria-pressed="${s2.sampleSelected.includes(tm.slug)}" data-ob="team" data-v="${tm.slug}">${box()}${badge(tm.slug, "xs")}<span class="ob__l">${esc(tm.nameKo)}</span>${tm.hasKorean ? `<span class="arm" title="한국 선수 소속">한국</span>` : ""}</button></li>`)
      .join("")}</ul></div>`
  )
  .join("");
const ob3 = s3.options.map((o) => `<li><button class="ob__o" type="button" aria-pressed="${s3.sampleSelected.includes(o.slug)}" data-ob="player" data-v="${o.slug}">${box()}<span class="ob__l"><b>${esc(o.nameKo)}</b><span class="ob__s">${esc(o.team.nameKo)} · ${esc(o.position)}</span></span>${o.state.label ? `<span class="stamp stamp--ph">${esc(o.state.label)}</span>` : ""}</button></li>`).join("");
const screen4b = `<section class="obw" id="sc4b" aria-labelledby="ob-h">
  <div class="ob" data-ob-form>
    <header class="ob__head">
      <p class="kick"><span>첫 방문</span><span class="rh" lang="en" aria-hidden="true">SUBSCRIPTION FORM</span></p>
      <h2 class="ob__hed" id="ob-h">구독 신청서</h2>
      <p class="ob__dek">세 칸을 채우면 홈에 '내 팀 소식'이 생긴다. 언제든 건너뛸 수 있다.</p>
      <ol class="ob__steps" aria-label="단계">${OB.steps.map((s, i) => `<li data-ob-ind="${i}"${i === 0 ? ' aria-current="step"' : ""}><span class="n">${s.step}</span><span>${esc(s.title)}</span></li>`).join("")}</ol>
    </header>
    <fieldset class="ob__f" data-ob-step="0"><legend><span class="ob__no n">1</span><span>${esc(s1.title)}</span><span class="ob__lim">여러 개 고를 수 있음</span></legend><ul class="ob__ul">${ob1}</ul><p class="note">${esc(s1.note)}</p></fieldset>
    <fieldset class="ob__f" data-ob-step="1"><legend><span class="ob__no n">2</span><span>${esc(s2.title)}</span><span class="ob__lim">최대 <span class="n">${s2.max}</span> · 선택 <b class="n" data-ob-tc>${s2.sampleSelected.length}/${s2.max}</b></span></legend>
      <div class="ob__tabs" role="tablist" aria-label="고른 리그">${ob2tabs}</div>${ob2panels}<p class="note">${esc(s2.byLeague[0].order)} · 한국 완장 = 한국 선수 소속 팀</p></fieldset>
    <fieldset class="ob__f" data-ob-step="2"><legend><span class="ob__no n">3</span><span>${esc(s3.title)}</span><span class="ob__lim">여러 명 고를 수 있음</span></legend><ul class="ob__ul ob__ul--p">${ob3}</ul></fieldset>
    <div class="ob__nav"><button class="btn btn--ghost" type="button" data-ob-skip>건너뛰기</button><span class="ob__sp"></span><button class="btn" type="button" data-ob-prev hidden>${ICON(IC.prev, 16)}이전</button><button class="btn btn--pri" type="button" data-ob-next>다음${ICON(IC.next, 16)}</button><button class="btn btn--pri ob__done" type="button" data-ob-done>신청 마치기</button></div>
  </div>
</section>`;

/* ───────── 화면 4c·4d · 검색 ───────── */
const SQ = D.search;
const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const cho = (s) => CHO[Math.floor((s.charCodeAt(0) - 0xac00) / 588)];
const allPlayers = D.onboarding.steps[2].options.slice().sort((a, b) => a.nameKo.localeCompare(b.nameKo, "ko"));
const byCho = {};
for (const p of allPlayers) (byCho[cho(p.nameKo)] ||= []).push(p);
function indexPage(idp) {
  return `<div class="gix">
  <p class="gix__k">색인 — 한국 선수 <span class="n">${allPlayers.length}</span> · 표기 사전(선수·팀·감독 한/영 별칭)으로 찾는다</p>
  <div class="gix__cols">${Object.entries(byCho)
    .map(([k, ps]) => `<section class="gix__g" id="${idp}-${k}" aria-label="${k}"><p class="gix__l" aria-hidden="true">${k}</p><ul>${ps.map((p) => `<li><a href="${p.slug === "kim-min-jae" ? "#sc1b" : `${B}/korean-players/${p.slug}/`}"><span class="gix__n">${esc(p.nameKo)}</span><span class="lead" aria-hidden="true"></span><span class="gix__en" lang="en">${esc(p.nameEn)}</span></a></li>`).join("")}</ul></section>`)
    .join("")}</div>
  <p class="gix__q">준비된 질의(시안): ${[...SQ.queries.map((q) => q.q), SQ.empty.q].map((q) => `<button class="qchip" type="button" data-q="${esc(q)}"${/^[\x00-\x7F ]+$/.test(q) ? ' lang="en"' : ""}>${esc(q)}</button>`).join("")}</p>
</div>`;
}
function resultsHtml(q, idp, { opt = false } = {}) {
  const role = opt ? ' role="option" aria-selected="false"' : "";
  const c = q.counts;
  if (q.isEmpty)
    return `<div class="sres sres--empty"><p class="zero-w"><b class="zero n" aria-hidden="true">0</b><span class="zero-t"><b>‘<span lang="en">${esc(q.q)}</span>’에 맞는 선수·팀·뉴스가 없어요</b><span>철자를 바꾸거나 한글 이름으로 찾아 보세요. 색인은 등록된 표기 사전만 읽는다.</span></span></p></div>`;
  const pl = q.players.map((p, i) => `<li><a class="sres__a" id="${idp}-p${i}" href="${p.slug === "kim-min-jae" ? "#sc1b" : B + p.path}"${role}><span class="arm">한국</span><span class="sres__n">${esc(p.nameKo)}</span><span class="sres__en" lang="en">${esc(p.nameEn)}</span><span class="lead" aria-hidden="true"></span><span class="sres__x">${badge(p.team.slug, "xs")}${esc(p.team.nameKo)} · ${esc(p.position)}</span></a></li>`).join("");
  const tm = q.teams.map((x, i) => `<li><a class="sres__a" id="${idp}-t${i}" href="${B}/teams/${x.slug}/"${role}>${badge(x.slug, "s")}<span class="sres__n">${esc(x.nameKo)}</span><span class="lead" aria-hidden="true"></span><span class="sres__x">${esc(x.reasonLabel ?? (x.reason === "이름" ? "이름 일치" : x.reason))}</span></a></li>`).join("");
  const nw = q.news.top10
    .slice(0, opt ? 5 : 10)
    .map((r, i) => {
      const cd = D.cards[r.id];
      return `<li><a class="sres__a sres__a--n" id="${idp}-n${i}" href="${esc(cd.lead.u)}" target="_blank" rel="noopener"${role}><span class="sres__t${cd.lang !== "ko" ? " is-latin" : ""}" lang="${cd.lang}">${titleHtml(cd)}</span><span class="sres__m"><span class="src">${esc(cd.lead.n)}</span>${t(cd.lead.at, cd.lead.at.short)}<span class="sres__mb">${esc(r.matchedBy.map((m) => (m.startsWith("태그") ? "태그" : m)).join(" + "))}</span></span></a></li>`;
    })
    .join("");
  const grp = (k, h, cnt, body, extra = "") => `<section class="sres__g" id="${idp}-g-${k}" aria-labelledby="${idp}-g-${k}-h"><p class="sres__h" id="${idp}-g-${k}-h"><span>${h}</span><span class="lead" aria-hidden="true"></span><b class="n">${cnt}</b></p>${cnt ? `<ul${opt ? ' role="group" aria-labelledby="' + idp + "-g-" + k + '-h"' : ""}>${body}</ul>` : `<p class="sres__0">${h} 결과 없음</p>`}${extra}</section>`;
  return `<div class="sres">
  ${grp("p", "선수", c.players, pl)}
  ${grp("t", "팀", c.teams, tm)}
  ${grp("n", "뉴스", c.news, nw, c.news > (opt ? 5 : 10) ? `<p class="sres__more">뉴스 <span class="n">${c.news}</span>건 중 <span class="n">${opt ? 5 : 10}</span>건 · 한국어 <span class="n">${c.newsKo}</span> · 영문 <span class="n">${c.newsEn}</span>${opt ? ` — <a class="tlink" href="#sc4d">전체 결과 보기</a>` : ""}</p>` : "")}
</div>`;
}
const qKim = SQ.queries[0];
const screen4d = `<section class="sheet sheet--search" id="sc4d" aria-labelledby="sc4d-h">
  <nav class="sheet__toc" aria-label="검색 결과 목차">
    ${secH("결과", "RESULTS")}
    <ul class="ct">${tocRow("#sp-g-p", "선수", qKim.counts.players)}${tocRow("#sp-g-t", "팀", qKim.counts.teams)}${tocRow("#sp-g-n", "뉴스", qKim.counts.news)}</ul>
  </nav>
  <header class="sheet__head">
    <p class="kick"><span>검색</span><span class="rh" lang="en" aria-hidden="true">INDEX</span></p>
    <form class="sfield" role="search" action="${B}/search/" onsubmit="return false"><label class="sr" for="sp-q">검색어</label>${ICON(IC.search)}<input id="sp-q" name="q" type="search" value="${esc(qKim.q)}" autocomplete="off"><button class="btn" type="submit">찾기</button></form>
    <h1 class="hed hed--q" id="sc4d-h">‘${esc(qKim.q)}’ 색인</h1>
    <p class="dek">선수 <span class="n">${qKim.counts.players}</span> · 팀 <span class="n">${qKim.counts.teams}</span> · 뉴스 <span class="n">${qKim.counts.news}</span> — 한/영 별칭(Kim Min-jae · Minjae Kim)도 같은 항목으로 모인다.</p>
  </header>
  <aside class="sheet__side" aria-label="옆단 — 결과 없음 상태">
<div class="side-e"></div><div class="side-l">
    <section class="side-sec" aria-labelledby="sp-e-h">
      <h2 class="side-h" id="sp-e-h">결과 없음 — <span lang="en">/search/?q=${esc(SQ.empty.q)}</span></h2>
      ${resultsHtml(SQ.empty, "spe")}
      ${anno(esc(SQ.empty.note))}
    </section>
    <section class="side-sec" aria-labelledby="sp-0-h">
      <h2 class="side-h" id="sp-0-h">뉴스 0건 — ‘${esc(SQ.queries[3].q)}’</h2>
      ${resultsHtml(SQ.queries[3], "sp0")}
    </section>
</div>
  </aside>
  <div class="sheet__body">${resultsHtml(qKim, "sp")}</div>
</section>`;
const screen4c = `<section class="ovp" id="sc4c" aria-labelledby="ovp-h">
  <div class="ovp__frame">
    <div class="sov sov--static">
      <div class="sov__bar">${ICON(IC.search)}<span class="sov__in" aria-hidden="true">이름 · 팀 · 기사 제목</span><span class="sov__kbd"><kbd>Esc</kbd></span></div>
      <h2 class="sr" id="ovp-h">검색 오버레이 — 입력 전(색인)</h2>
      ${indexPage("ovs")}
    </div>
  </div>
  <p class="note ovp__n">마스트헤드 검색 버튼 · <kbd>/</kbd> · <kbd>⌘K</kbd>로 연다. 입력 전에는 책 뒤 색인(가나다)을, 입력하면 같은 결과 컴포넌트를 유형별로 묶어 보인다. ↑↓로 이동, Enter로 열기, Esc로 닫기. <button class="tlink" type="button" data-search-open>오버레이 열어 보기</button></p>
</section>`;
// 실제 오버레이(dialog)
// 오버레이 listbox — role=group 안에 role=option만(목록·섹션 없음). 머리·건수 줄은 listbox 밖
function listboxHtml(q) {
  const c = q.counts;
  const opt = (id, href, inner, ext = false) => `<a class="sres__a${ext ? " sres__a--n" : ""}" id="${id}" role="option" aria-selected="false" href="${href}"${ext ? ' target="_blank" rel="noopener"' : ""}>${inner}</a>`;
  const g = (k, h, cnt, body) => (cnt ? `<div class="sres__g" role="group" aria-labelledby="ov-g-${k}-h"><div class="sres__h" id="ov-g-${k}-h"><span>${h}</span><span class="lead" aria-hidden="true"></span><b class="n">${cnt}</b></div>${body}</div>` : "");
  const pl = q.players.map((p, i) => opt(`ov-p${i}`, p.slug === "kim-min-jae" ? "#sc1b" : B + p.path, `<span class="arm">한국</span><span class="sres__n">${esc(p.nameKo)}</span><span class="sres__en" lang="en">${esc(p.nameEn)}</span><span class="lead" aria-hidden="true"></span><span class="sres__x">${badge(p.team.slug, "xs")}${esc(p.team.nameKo)} · ${esc(p.position)}</span>`)).join("");
  const tm = q.teams.map((x, i) => opt(`ov-t${i}`, `${B}/teams/${x.slug}/`, `${badge(x.slug, "s")}<span class="sres__n">${esc(x.nameKo)}</span><span class="lead" aria-hidden="true"></span><span class="sres__x">${esc(x.reasonLabel ?? (x.reason === "이름" ? "이름 일치" : x.reason))}</span>`)).join("");
  const nw = q.news.top10.slice(0, 5).map((r, i) => { const cd = D.cards[r.id]; return opt(`ov-n${i}`, esc(cd.lead.u), `<span class="sres__t${cd.lang !== "ko" ? " is-latin" : ""}" lang="${cd.lang}">${titleHtml(cd)}</span><span class="sres__m"><span class="src">${esc(cd.lead.n)}</span>${t(cd.lead.at, cd.lead.at.short)}</span>`, true); }).join("");
  const lb = g("p", "선수", c.players, pl) + g("t", "팀", c.teams, tm) + g("n", "뉴스", c.news, nw);
  const after = `<p class="sres__more">선수 <span class="n">${c.players}</span> · 팀 <span class="n">${c.teams}</span> · 뉴스 <span class="n">${c.news}</span>${c.news > 5 ? `(상위 <span class="n">5</span>)` : ""} — <a class="tlink" href="#sc4d">전체 결과 보기</a></p>`;
  return q.isEmpty ? { lb: "", after: resultsHtml(q, "ove") } : { lb, after };
}
const QDATA = {};
for (const q of [...SQ.queries, SQ.empty]) QDATA[q.q.toLowerCase()] = listboxHtml(q);
const overlay = `<div class="sov-w" data-sov hidden>
  <div class="sov-bd" data-sov-close></div>
  <div class="sov" role="dialog" aria-modal="true" aria-labelledby="sov-h">
    <h2 class="sr" id="sov-h">검색</h2>
    <div class="sov__bar">${ICON(IC.search)}<label class="sr" for="sov-q">검색어</label><input id="sov-q" type="search" role="combobox" aria-expanded="false" aria-controls="sov-r" aria-autocomplete="list" autocomplete="off" placeholder="이름 · 팀 · 기사 제목" data-sov-q><button class="ibtn" type="button" data-sov-close aria-label="검색 닫기">${ICON(IC.close)}</button></div>
    <div class="sov__idx" data-sov-idx>${indexPage("ovi")}</div>
    <div class="sres sov__lb" id="sov-r" role="listbox" aria-label="검색 결과" data-sov-r hidden></div>
    <div class="sov__after" data-sov-after aria-live="polite"></div>
  </div>
</div>`;

/* ───────── 홈 위젯 ───────── */
const KC = HOME.koreanChips;
function krChip(r) {
  const g = r.goals ? `<b class="kc__g"><span class="n">${r.goals}</span>골</b>` : "";
  return `<li><a class="kc" href="${r.player === "kim-min-jae" ? "#sc1b" : `${B}/korean-players/${r.player}/`}"><span class="kc__n">${esc(r.nameKo)}</span><span class="kc__v">${r.appeared ? `<b class="n">${r.minutes}</b>분` : am(r.status, r.statusLabel)}</span>${g}<span class="kc__o">${esc(r.team.nameKo)} · ${esc(r.opponent.name)}</span></a></li>`;
}
function wKorean(sfx) {
  const today = KC.today, busy = KC.busySpecimen;
  return `<section class="wg" aria-labelledby="w-kr-${sfx}">
  ${secH("한국 선수", "LAST NIGHT", { id: `w-kr-${sfx}`, sub: `제 ${today.issueNo}호 창 · ${t(today.window.from, today.window.from.short)} ~ ${esc(today.window.toExclusive.short)} KST 경기` })}
  <p class="kc-zero"><b class="n">${today.appearedCount}</b><span>명 출전 · 명단 <span class="n">${today.rowCount}</span></span></p>
  <ul class="kcs">${today.rows.map(krChip).join("")}</ul>
  <p class="kc-spec"><span class="stamp stamp--ph">견본</span><span>붐비는 날 — 제 <span class="n">${busy.issueNo}</span>호(${esc(busy.window.from.dayShort)} 경기) · 출전 <span class="n">${busy.appearedCount}</span>명</span></p>
  <ul class="kcs">${busy.rows.map(krChip).join("")}</ul>
</section>`;
}
function wHot(sfx) {
  const items = HOME.transferHotList.items;
  const rows = [];
  for (let i = 0; i < 5; i++) {
    const it = items[i];
    if (!it) {
      rows.push(`<li class="hot__i hot__i--e"><span class="hot__no n">${i + 1}</span><span class="hot__e"><span aria-hidden="true">—</span><span class="sr">빈 칸</span></span></li>`);
      continue;
    }
    rows.push(`<li class="hot__i"><span class="hot__no n">${i + 1}</span><a class="hot__a" href="#tr-${it.id.replace("tr_", "")}">${it.playerName ? `<b class="hot__n">${esc(it.playerName)}</b>` : `<b class="hot__n hot__n--t">${esc(it.leadTitle)}</b>`}${it.to ? `<span class="hot__to">→ ${esc(it.to.nameKo)}</span>` : ""}<span class="hot__s">${punch(it.status, it.filled)}<span>${esc(it.stageLabel)}</span>${tier(it.bestTier)}${t(it.updated, md(it.updated))}</span></a></li>`);
  }
  return `<section class="wg" aria-labelledby="w-hot-${sfx}">
  ${secH("이적 핫 리스트", "TRANSFERS", { id: `w-hot-${sfx}`, sub: esc(HOME.transferHotList.rule) })}
  <ol class="hot">${rows.join("")}</ol>
  <p class="note">${esc(HOME.transferHotList.note)} · 4·5번 칸은 비워 둔다</p>
</section>`;
}
function wStub(title, rh, what) {
  return `<section class="wg wg--stub" aria-label="${esc(title)} — D0·D1 확정, 생략"><div class="sec-h sec-h--thin"><h2>${title}</h2><span class="rh" lang="en" aria-hidden="true">${rh}</span></div><p class="stubline">${what}</p></section>`;
}
const myNews = HOME.myTeamNews;
const nat = HOME.nationalTeam;
const homeScreen = `<section class="home" id="sc5" aria-label="홈 위젯">
  <div class="home__g">
    <nav class="home__toc" aria-label="뉴스 목차(D0 확정 — 생략)">${secH("목차", "CONTENTS")}<p class="stubline">D0 확정 목차(대회 · 분류 · 한국 선수) — 생략</p></nav>
    <div class="home__page">
      ${wStub("오늘의 5줄", "STARTING FIVE", "D0 확정 — 생략. 첫 방문이면 이 바로 아래에 '구독 신청서' 간지가 들어간다(아래 견본)")}
      <section class="wg" aria-labelledby="w-my">
        ${secH(`내 팀 소식 <span class="n">${myNews.count}</span>`, "MY CLUBS", { id: "w-my", sub: `팔로우가 있을 때만 · 팀 3 + 선수 2(시안 표본) · 제 ${ISSUE.no}호` })}
        <div class="nis">${myNews.cards.slice(0, 3).map((c) => newsItem(c.id, { follow: c.followMatch, cls: "ni--hm" })).join("")}</div>
        <a class="tlink" href="#sc4">내 지면에서 ${myNews.count}건 모두 보기</a>
      </section>
      <section class="wg" aria-labelledby="w-nat">
        ${secH("A매치", "NATIONAL TEAM", { id: "w-nat", sub: "A매치 기간에만 나오는 섹션" })}
        <div class="nat-ph">${blank(nat.periodActive, { short: true, title: "A매치 기간 판정" })}${blank(nat.schedule, { short: true, title: "11월 일정 · 결과" })}</div>
        <p class="sub">대표팀 소식(한국) <span class="n">${nat.news.count}</span>건 · ${esc(nat.news.rule)}</p>
        <div class="nis">${nat.news.ids.slice(0, 2).map((id) => newsItem(id, { cls: "ni--hn" })).join("")}</div>
      </section>
      <div class="in-flow">${wKorean("a")}${wStub("오늘 밤 볼 경기", "TONIGHT", "D1 확정(M2 구현) — 생략")}</div>
      ${wStub("주요 뉴스", "SQUAD", "D0 확정 피드 — 생략")}
      <div class="in-flow">${wHot("a")}${wStub("리그 순위 미니", "TABLES", "D1 확정(M2 구현) — 생략")}</div>
    </div>
    <aside class="home__facing" aria-label="마주 보는 면">${wStub("오늘 밤 볼 경기", "TONIGHT", "D1 확정 — 생략")}${wKorean("b")}${wStub("리그 순위 미니", "TABLES", "D1 확정 — 생략")}${wHot("b")}</aside>
  </div>
</section>`;

/* ───────── 견본 ───────── */
const AP = SP.appearance.states;
const apSpec = AP.map((s) => {
  if (s.status === "sub")
    return `<li><span class="spx__l">${am("sub", s.label)}</span><span class="spx__v">${s.examples.map((e) => `${esc(e.nameKo)} <b class="n">${e.minutes}</b>분(${esc(e.enteredAt)} 투입)`).join(" · ")}</span><span class="spx__n">집계 시작 전 fixtures — 화면 로그에는 넣지 않음</span></li>`;
  if (s.status === "unknown") return `<li><span class="spx__l">${am("unknown", s.label)}</span><span class="spx__v">${esc(s.rule)}</span><span class="spx__n">${esc(s.example.reason)} · ${esc(s.example.fillStage)}</span></li>`;
  const e = s.example;
  return `<li><span class="spx__l">${am(s.status, s.label)}</span><span class="spx__v">${t(e.kickoff, e.kickoff.dayShort)} ${teamName(e.opponent)} · <b class="n">${e.minutesLabel.replace("분", "")}</b>${e.minutes != null ? "분" : ""}</span><span class="spx__n">김민재 원장</span></li>`;
}).join("");
const combos = TR.stageTierSpecimen.combos;
const stages = ["rumor", "negotiating", "agreed", "official", "collapsed"];
const matrix = `<table class="mx"><caption class="sr">이적 단계 5종 × Tier 1~3</caption><thead><tr><th scope="col">단계</th>${[1, 2, 3].map((x) => `<th scope="col">${tier(x)}</th>`).join("")}</tr></thead><tbody>${stages
  .map((s) => `<tr><th scope="row"><b>${esc(D.labels.transferStage[s].label)}</b></th>${[1, 2, 3].map((x) => {
    const cb = combos.find((c) => c.status === s && c.tier === x);
    return `<td>${stageBar(s, cb.filled)}${cb.realItem ? `<span class="mx__r">실례</span>` : ""}</td>`;
  }).join("")}</tr>`)
  .join("")}</tbody></table>`;
const FS = SP.follow.states;
const TP = SP.teamProfile;
const NTP = SP.nationalTeamPage;
const PS = SP.playerStates;
const fbm = PS.fallback.match;
const specs = `<section class="spec" id="sc6" aria-labelledby="sc6-h">
  ${secH("견본", "SPECIMENS", { id: "sc6-h" })}
  <div class="spec-grid">
    <figure class="frame"><figcaption class="cap"><b>출전 상태 5종</b>모양(채움·반·빈·가로선·점선) + 글자. 색은 잉크 하나</figcaption><ul class="spx">${apSpec}</ul></figure>
    <figure class="frame"><figcaption class="cap"><b>팔로우 버튼 3상태</b>신청서의 체크 칸 문법 — 꺼짐 · 켜짐(반전) · 한도 5 도달(점선 + 5/5). 위치: ${SP.follow.places.map(esc).join(" · ")}</figcaption>
      <div class="fol-row">${FS.map((s) => `<div class="fol-c"><span class="fol-c__l">${esc(s.label)}</span>${s.state === "limit" ? follow("limit", "spec:limit", null, "도르트문트") : follow(s.state, `spec:${s.state}`, null, s.example.nameKo)}<span class="note">${esc(s.example.nameKo ?? `${s.example.used}/${s.example.max} 사용`)}</span></div>`).join("")}</div></figure>
    <figure class="frame frame--wide"><figcaption class="cap"><b>이적 단계 5종 × Tier 1~3</b>펀치 구멍 4 + 단계 글자(결렬 = 빈 구멍 + 사선). '실례' 칸만 실데이터, 나머지는 범례 — ${esc(TR.missingStages.reason)}</figcaption>${matrix}</figure>
    <figure class="frame"><figcaption class="cap"><b>스코어 결과 가림 칸</b>결과 가리기 켬 — 스코어·W/D/L만 가리고 출전 상태·분은 그대로(빗금 --hatch 재사용)</figcaption>
      <ul class="spx">${SP.spoilerScore.examples.map((e) => `<li><span class="spx__v">${t(e.kickoff, e.kickoff.dayShort)} ${teamName({ name: e.opponent, slug: e.opponent === "아스널" ? "arsenal" : null })}전</span>${spo(e.result, `${e.opponent}전`, { force: true })}</li>`).join("")}</ul></figure>
    <figure class="frame"><figcaption class="cap"><b>선수 상태 4종</b>연결 · 기록 연결 전 · 기타 리그 · 폴백(FR-65 견본)</figcaption>
      <ul class="pst">
        <li><span class="stamp">연결</span><span>${esc(PLAYER[PS.linked.slug].nameKo)} — 원장 기록 그대로</span></li>
        <li><span class="stamp stamp--ph">${esc(PS.notLinked.label)}</span><span>${esc(PLAYER[PS.notLinked.slug].nameKo)} — ${esc(PS.notLinked.note)}</span></li>
        <li><span class="stamp stamp--ph">${esc(PS.otherLeague.label)}</span><span>${esc(PLAYER[PS.otherLeague.slug].nameKo)} — ${esc(PS.otherLeague.note)}</span></li>
        <li class="pst__fb"><span class="stamp stamp--ph">${esc(PS.fallback.label)}</span><span><b>${esc(PS.fallback.nameKo)}</b> ${t(fbm.kickoff, fbm.kickoff.dayShort)} ${esc(fbm.opponent)}전(${esc(fbm.venueLabel)}) ${spo(fbm.result, `${fbm.opponent}전`)} · 분 <b class="n">${esc(fbm.minutesLabel)}</b> · 도움 <b class="n">${esc(fbm.assistsLabel)}</b></span><span class="note">${esc(PS.fallback.rule)}</span></li>
      </ul>
      <div class="nis">${PS.fallback.newsCards.slice(0, 1).map((id) => newsItem(id, { cls: "ni--fb" })).join("")}</div></figure>
    <figure class="frame"><figcaption class="cap"><b>팀 단평 · 강점/약점 자리</b>팀 티켓(D1) 바로 아래, 팀시트 앞. 문단 머리에 'AI 작성' + 생성 날짜 — ${esc(TP.note)}</figcaption>
      <div class="tpf"><p class="tpf__t">${badge(TP.team.slug, "s")}<b>${esc(TP.team.nameKo)}</b><span class="ai">AI 작성</span><span class="tpf__d">생성 날짜 자리 · <span class="id">${esc(TP.generatedAt.fillStage)}</span></span></p>
      ${blank(TP.oneLiner, { title: "한줄평", lines: 1 })}
      <div class="tpf__2"><div><p class="tpf__k">강점</p>${TP.strengths.map((s) => blank(s, { lines: 1, short: true })).join("")}</div><div><p class="tpf__k">약점</p>${TP.weaknesses.map((s) => blank(s, { lines: 1, short: true })).join("")}</div></div></div></figure>
    <figure class="frame frame--wide"><figcaption class="cap"><b>/national-team 구조</b>${esc(NTP.path)} — 일정·명단은 자리, 소식은 실카드 수</figcaption>
      <div class="ntp">${NTP.sections.map((s) => `<section class="ntp__s"><p class="ntp__h">${esc(s.title)}${s.data.count != null ? ` <b class="n">${s.data.count}</b>` : ""}</p>${s.data.placeholder ? blank(s.data, { short: true }) : `<p class="note">${esc(s.data.rule ?? "cat:national + kr:true")}</p><div class="nis">${s.data.ids.slice(0, 1).map((id) => newsItem(id, { cls: "ni--ntp" + s.key })).join("")}</div>`}</section>`).join("")}</div></figure>
    <figure class="frame"><figcaption class="cap"><b>온보딩 진입 위치</b>첫 방문 감지 → 홈 '오늘의 5줄' 바로 아래(내 팀 소식 자리)에 간지 1장. 375 첫 화면의 5줄 4줄은 그대로 둔다(scope §4 #13)</figcaption>
      <div class="insert"><p class="insert__k">간지</p><p class="insert__t"><b>구독 신청서</b><span>리그 · 팀 · 한국 선수 3칸</span></p><div class="insert__a"><a class="btn btn--pri" href="#sc4b">신청서 펼치기</a><button class="btn btn--ghost" type="button">건너뛰기</button></div></div></figure>
  </div>
</section>`;

/* ───────── 메타·목차·푸터·탭 ───────── */
const META = {
  name: "C 주간 지면 (Weekly Feature)",
  one: "조간 특집면 — 한국 선수·이적·마이를 큰 한글 제목, 옆단 기록 박스, 날짜 세로 타임라인, 책 뒤 색인으로 편다. 필터·검색도 지면의 색인·목차 문법으로 푼다.",
  pros: [
    "'Editorial, not portal'이 가장 또렷하다 — 화면마다 큰 제목 하나가 위계를 정하고, 숫자는 기록 박스 안에만 모인다",
    "주간 리포트·이적처럼 시간 순 이야기가 있는 화면에 맞는다 — MVP 머리기사, 날짜 세로 괘선 타임라인(단계 근거 2 + 보조 5)",
    "LLM 총평·팀 단평이 들어올 '단'이 처음부터 지면 안에 있다 — 자리가 괘선 교정쇄(빈 기준선)로 보여 빈 지면이 아니라 '조판 대기'로 읽힌다",
    "필터는 색인(체크 칸 + 리더 점선 + 건수), 온보딩은 구독 신청서, 팔로우는 같은 체크 칸 — 입력 UI가 한 문법이다",
  ],
  cons: [
    "목록 화면이 길다 — 375 한국 선수 목록(9명)이 약 3,770px이고 첫 화면에 1~2명만 보인다",
    "데이터가 얇은 지금은 자리 상자가 많이 보인다(총평·영문 뉴스·A매치·잠잠·창 날짜) — 조형으로 줄였지만 지면이 '예고면'처럼 보일 수 있다",
    "1280 3단(목차·본문·옆단)에서 옆단 박스가 본문보다 짧으면 아래가 빈다 — 375에서는 옆단이 제목 바로 아래로 접혀 본문이 그만큼 내려간다",
    "검색 오버레이를 색인 페이지로 만든 만큼 결과 수가 많을 때(뉴스 71건) 한 화면에 덜 들어간다",
  ],
  diff: "중~상 — 지면 그리드(목차·제목·옆단·본문 4영역, 375 접힘 순서) · 세로 타임라인 · 색인 필터 섬 · 신청서 단계 섬 · 검색 오버레이 섬(combobox) · 결과 가림 칸. 서버 컴포넌트 비중이 높아 JS 섬은 B와 같은 수",
  bundle: "폰트 변화 0 — EuroDigest Sans 400·800 + Barlow Condensed 600·800 = 417.8KB(2패밀리, 새 파일 0). 새 색 토큰 0. 시안 인라인 JS 11.0KB / gzip 4.4KB(테마·토스트 포함) → 새 섬(색인 필터 · 신청서 · 검색 오버레이 · 팔로우 · 결과 가림) 추정 gzip 약 3KB → 초기 JS 약 147KB / 160KB(오버레이는 첫 열 때 지연 로드하면 더 준다). Pagefind는 첫 입력 때 지연 로드(초기 0)",
};
const axisTable = `<table class="axes"><thead><tr><th>축</th><th>A 스쿼드 명단</th><th>B 시즌권</th><th>C 주간 지면 (이 시안)</th></tr></thead><tbody>
<tr><th>레이아웃</th><td>1단 명단 행 주축</td><td>카드(티켓) 격자</td><td class="me">2단 지면 — 큰 제목 머리 + 본문 · 옆단 기록 박스, 날짜 세로 타임라인, 색인 페이지</td></tr>
<tr><th>타이포</th><td>Barlow 숫자 열 · 이름 800 중간</td><td>큰 숫자 하나 · 나머지 작게</td><td class="me">한글 800 큰 제목(56→112px) + 본문 400 문단 · 숫자는 박스 안에서만 크게</td></tr>
<tr><th>색</th><td colspan="3">셋 다 D0 2도(크림·네이비 + 스팟 레드) — 새 토큰 0. C는 기록 박스 머리를 잉크 반전 띠로(같은 토큰)</td></tr>
<tr><th>밀도</th><td>높음(375 첫 화면 6~7명)</td><td>중간~낮음(2~3장)</td><td class="me">낮음(375 첫 화면 기사 한 편 · 선수 1~2명)</td></tr>
<tr><th>모션</th><td>찍힘</td><td>뜯김</td><td class="me">잉크 전환 · 도착(:target 타임라인 항목)만 — 필터·단계 전환에도 진입 모션 없음. 결과 가림 펼치기만 D0 뜯김</td></tr>
<tr><th>다른 축 수</th><td colspan="3">C ↔ A: 레이아웃 · 타이포 · 밀도 · 모션(4) / C ↔ B: 레이아웃 · 타이포 · 밀도 · 모션(4)</td></tr></tbody></table>`;
const metaBand = `<aside class="meta-w" aria-label="시안 정보"><details class="meta">
  <summary><span class="meta__tag">D2 시안 C</span><b>${META.name}</b><span class="meta__one">${META.one}</span><span class="meta__more" aria-hidden="true"></span></summary>
  <div class="meta__grid">
    <div><p class="meta__h">장점</p><ul>${META.pros.map((x) => `<li>${x}</li>`).join("")}</ul></div>
    <div><p class="meta__h">단점</p><ul>${META.cons.map((x) => `<li>${x}</li>`).join("")}</ul></div>
    <div><p class="meta__h">구현 난이도</p><p>${META.diff}</p><p class="meta__h">번들 · 폰트 영향</p><p>${META.bundle}</p><p class="meta__h">데이터</p><p>docs/design/d2/data/d2-data.json만 읽음(scope §2 계산 규칙) · 기준 ${esc(REF.label)} · 문구 생성 0 · 팔로우 = 시안 표본</p></div>
    <div class="span3"><p class="meta__h">축 매트릭스</p>${axisTable}</div>
  </div>
</details></aside>`;
const docToc = `<nav class="dtoc" aria-label="시안 구역 목차"><p class="dtoc__h"><b>이 시안의 지면</b><span class="rh" lang="en" aria-hidden="true">IN THIS ISSUE</span></p><ol>
  ${[
    ["#sc1", "화면 1", "한국 선수 목록"],
    ["#sc1b", "화면 1", "김민재 상세"],
    ["#sc2", "화면 2", "주간 리포트 43주"],
    ["#sc3", "화면 3", "이적"],
    ["#sc4", "화면 4", "마이 · 신청서 · 검색"],
    ["#sc5", "홈", "위젯 4종"],
    ["#sc6", "견본", "상태 · 자리"],
  ]
    .map(([h, k, l], i) => `<li><a href="${h}"><span class="dtoc__no n">${String(i + 1).padStart(2, "0")}</span><span class="dtoc__k">${k}</span><span class="dtoc__l">${l}</span></a></li>`)
    .join("")}</ol></nav>`;
const colophon = `<div class="shell"><footer class="colophon">
  <div class="colophon__in">
    <p class="colophon__brand">유로 다이제스트 <span>제 ${ISSUE.no}호 · 2026년 10월 31일 (토)</span></p>
    <p class="colophon__fd" lang="en">Football data provided by the Football-Data.org API</p>
    <p class="colophon__p">순위·경기 데이터 football-data.org · 출전 기록 API-Football(10월 19일 이후 자체 집계). 기록과 기사 제목은 그대로 보여 주며, 'AI 작성' 라벨이 붙은 문단만 AI가 씁니다.</p>
    <ul class="colophon__links"><li><a href="${B}/about/">소개·출처 정책</a></li><li><a href="${B}/about/#data">데이터 출처</a></li><li><a href="${B}/privacy/">개인정보 처리방침</a></li></ul>
    <p class="colophon__p">마지막 업데이트 ${t(REF, REF.time + " KST")}</p>
  </div>
</footer></div>`;
const tabbar = `<nav class="tabbar" aria-label="하단 탭"><a href="${B}/">${ICON(IC.home)}<span>홈</span></a><a href="${B}/news/">${ICON(IC.news)}<span>뉴스</span></a><a href="${B}/competitions/epl/">${ICON(IC.league)}<span>리그</span></a><a href="${B}/korean-players/" aria-current="page">${ICON(IC.kr)}<span>한국 선수</span></a><a href="${B}/my/">${ICON(IC.my)}<span>마이</span></a></nav>`;

/* ───────── CSS ───────── */
const CSS = readFileSync(join(here, "build-concept-c.css"), "utf8");
/* ───────── JS ───────── */
const JS = readFileSync(join(here, "build-concept-c.js"), "utf8").replace("__QDATA__", JSON.stringify(QDATA).replace(/</g, "\\u003c"));

const firstComment = `<!--
  D2 시안 C — 「${META.name}」
  한 줄 설명: ${META.one}
  장점: ${META.pros.join(" / ")}
  단점: ${META.cons.join(" / ")}
  구현 난이도: ${META.diff}
  번들/폰트 영향: ${META.bundle}
  축(A·B와 다른 축): C↔A 레이아웃·타이포·밀도·모션 / C↔B 레이아웃·타이포·밀도·모션 · 색 전략은 셋 다 D0 2도(새 토큰 0)
  데이터: docs/design/d2/data/d2-data.json(실데이터 + 자리 객체 + 시안 표본) — 문구·숫자를 새로 만들지 않음. 자리는 reason · fillStage만 표시
  생성: docs/design/d2/build-concept-c.mjs (+ .css · .js) — 외부 의존 0, 폰트는 ../fonts/ 상대 경로, LLM 호출 0
-->`;

const html = `<!doctype html>
${firstComment}
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#F3F0EA" media="(prefers-color-scheme: light)" data-m="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0E1626" media="(prefers-color-scheme: dark)" data-m="(prefers-color-scheme: dark)">
<title>D2 시안 C · 주간 지면 · 유로 다이제스트</title>
<script>(function(){var d=document,r=d.documentElement,t,s,m,i;try{t=localStorage.getItem('ed-theme');s=localStorage.getItem('ed-spoiler')}catch(e){}if(s==='on')r.setAttribute('data-spoiler','on');if(t==='light'||t==='dark'){r.setAttribute('data-theme',t);m=d.querySelectorAll('meta[name="theme-color"]');for(i=0;i<m.length;i++)m[i].setAttribute('media',(m[i].getAttribute('media')||'').indexOf(t)<0?'not all':'all')}})();</script>
<style>
${CSS}
</style>
</head>
<body>
<a class="skip" href="#sc1">본문 바로가기</a>
${metaBand}
<div class="shell shell--top">${docToc}</div>
${divider("d-sc1", "화면 1 · 한국 선수 목록", "/korean-players/", `리그별 그룹 · 선수마다 인물 단(큰 이름 + 기록 줄) · 375는 옆단(이번 주 리포트·읽는 법)이 제목 바로 아래로 접힌다 · 기준 ${esc(REF.short)} KST`)}
<div class="shell">
${masthead}
<main id="main">
${screen1a}
</main>
</div>
${divider("d-sc1b", "화면 1 · 선수 상세", "/korean-players/kim-min-jae/", "프로필 기사 — 이름 112px 머리 · 옆단 시즌 기록 박스 · 본문 = 최근 5경기 원장(3 + 집계 전 2) → 다음 경기 → 관련 뉴스 → 이적설 → 대표팀 소식 · 스코어 표기는 소속팀 기준(득-실) + 홈/원정 글자(scope §6 #6 제안)")}
<div class="shell">${screen1b}</div>
${divider("d-sc2", "화면 2 · 주간 리포트", "/korean-players/weekly/2026-43/", "MVP 머리기사(코드 점수) + 총평 단(LLM 자리 — 괘선 교정쇄 5줄, 'AI 작성' 라벨은 단 머리) + 기록 박스 표 · 아카이브는 ‹ 42주 없음 · 44주 11.02 발행 예정 ›")}
<div class="shell">${screen2}</div>
${divider("d-sc3", "화면 3 · 이적", "/transfers/", "필터 = 색인(체크 칸 · 리더 점선 · 건수, 같은 묶음 OR · 묶음끼리 AND) · 이적 = 선수 단위 기사 + 날짜 세로 타임라인(단계 근거 = 펀치 구멍 노드, 보조 = 가로 눈금) · '소속' 칸은 출발 화살표와 분리(Q3 ①) · 375는 색인을 접어 둔다")}
<div class="shell">${screen3}</div>
${divider("d-sc4", "화면 4 · 마이", "/my/", "내 지면 — 팔로우 표본(바이에른 · 아틀레티코 · 아스널 + 김민재 · 이강인 = 한도 5/5) · 결과는 그 팀 기준 · 내보내기/가져오기 · .ics는 자리")}
<div class="shell">${screen4a}</div>
${divider("d-sc4b", "화면 4 · 온보딩", "첫 방문 (홈 간지 → 신청서)", "구독 신청서 지면 — 1 리그 → 2 팀(최대 5, 리그 탭) → 3 한국 선수 · 375는 한 칸씩(다음 · 이전 · 건너뛰기), 1024 이상은 세 칸을 한 장에 · 선택 상태는 시안 표본")}
<div class="shell">${screen4b}</div>
${divider("d-sc4c", "화면 4 · 검색 오버레이", "/ · ⌘K", "책 뒤 색인 — 입력 전에는 가나다 색인, 입력하면 유형별 결과(combobox · ↑↓ · Enter · Esc). 아래 틀은 열린 모습의 정적 사본")}
<div class="shell">${screen4c}</div>
${divider("d-sc4d", "화면 4 · 검색 결과", "/search/?q=김민재", "오버레이와 같은 결과 컴포넌트 — 선수 1 · 팀 1 · 뉴스 32(상위 10) · 옆단 = 결과 없음(Magdeburg) · 뉴스 0건(정우영)")}
<div class="shell">${screen4d}</div>
${divider("d-sc5", "홈 위젯", "/", "PRD §4.2 순서 2·3·4·7 — 1279 이하 지면 안(5줄 → 내 팀 소식 → A매치 → 한국 선수 → 오늘 밤 → 주요 뉴스 → 이적 → 순위) · 1280 = 지면(내 팀 소식 · A매치) + 마주 보는 면(한국 선수 · 이적)")}
<div class="shell">${homeScreen}</div>
${divider("d-sc6", "견본", "–", "출전 상태 · 팔로우 · 단계×Tier · 결과 가림 · 선수 상태 · 팀 단평 자리 · /national-team · 온보딩 진입")}
<div class="shell">${specs}</div>
${colophon}
${tabbar}
${overlay}
<div class="toast-region" aria-live="polite" aria-atomic="true"><div class="toast" data-toast hidden><span class="toast__k">알림</span><span data-toast-t></span></div></div>
<script>
${JS}
</script>
</body>
</html>
`;
writeFileSync(OUT, html);
console.log("wrote", OUT, (html.length / 1024).toFixed(1) + "KB");
