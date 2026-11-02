// M4 미니 시안 생성기 — data/·configs/ 실값으로 concept-a.html · concept-b.html을 만든다.
// 실행(저장소 루트에서): node docs/design/m4/build/gen.mjs <출력 폴더>
// 외부 의존 0, LLM 호출 0. 기반 CSS는 D1 혼합안 <style>을 그대로 추출한다(확정 컴포넌트 모양 유지).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.cwd();
const OUT = process.argv[2] || path.resolve(HERE, "..");
const j = (p) => JSON.parse(readFileSync(path.resolve(ROOT, p), "utf8"));

// ───────── 데이터 ─────────
const comps = j("configs/competitions.json");
const teamColors = j("configs/team-colors.json");
const kplayers = j("configs/korean-players.json");
const krec = j("data/players/korean.json");
const widgets = JSON.parse(readFileSync(path.resolve(HERE, "widgets.json"), "utf8"));
const COMP_KEYS = { EPL: "epl", LALIGA: "laliga", SERIEA: "seriea", BUNDESLIGA: "bundesliga", LIGUE1: "ligue1", UCL: "ucl" };
const compData = Object.fromEntries(Object.entries(COMP_KEYS).map(([id, k]) => [id, j(`data/competitions/${k}.json`)]));
const compCfg = Object.fromEntries(comps.map((c) => [c.id, c]));
const teamCache = {};
function team(slug) {
  if (teamCache[slug]) return teamCache[slug];
  let t = {};
  try { t = j(`data/teams/${slug}.json`); } catch { t = {}; }
  const tc = teamColors[slug] || {};
  return (teamCache[slug] = { slug, name: t.nameKo || slug, short: tc.short || t.short || "", colors: tc.colors || t.colors || null });
}
const BUILD = "2026-11-01T22:18:18Z"; // 시안 기준 = 11.02 (월) 07:18 KST (한국 선수 현황 생성 시각 — 그날 호의 마지막 갱신)
const ISSUE_NO = 22; // 2026-11-02 − 창간일 2026-10-12 + 1

// ───────── 시간(KST) ─────────
const DOW = "일월화수목금토";
const kst = (iso) => new Date(Date.parse(iso) + 9 * 3600e3);
const p2 = (n) => String(n).padStart(2, "0");
const md = (iso) => { const d = kst(iso); return `${p2(d.getUTCMonth() + 1)}.${p2(d.getUTCDate())}`; };
const dow = (iso) => DOW[kst(iso).getUTCDay()];
const hm = (iso) => { const d = kst(iso); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };
const tm = (iso, txt) => `<time datetime="${iso}">${txt}</time>`;

// ───────── 대비 · 키트 글자 ─────────
function lum(hex) { const c = hex.replace("#", ""); const v = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const kf = (k1) => (cr(k1, "#FFFFFF") >= cr(k1, "#14213D") ? "#FFFFFF" : "#14213D");

// ───────── 아이콘 ─────────
const svg = (d, cls = "ic") => `<svg class="${cls}" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" stroke-linejoin="miter">${d}</svg>`;
const I = {
  down: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5"/>',
  theme: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  rss: '<path d="M5 11a8 8 0 0 1 8 8"/><path d="M5 5a14 14 0 0 1 14 14"/><rect x="4.25" y="17.25" width="2.5" height="2.5" fill="currentColor" stroke="none"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
};

// ───────── 공통 조각 ─────────
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const B = "/euro-digest";
function badge(slug, size = "s") {
  const t = team(slug);
  if (!t.colors) return `<span class="bdg bdg--${size} bdg--none" aria-hidden="true"><b>${esc(t.short)}</b></span>`;
  const [k1, k2] = t.colors;
  return `<span class="bdg bdg--${size}" style="--k1:${k1};--k2:${k2};--kf:${kf(k1)}" aria-hidden="true"><b>${esc(t.short)}</b></span>`;
}
const ftab = (id) => `<span class="ftab tab--${COMP_KEYS[id]}" title="${esc(compCfg[id].nameKo)}">${esc(compCfg[id].shortKo)}</span>`;
const fm = (r) => `<i class="fm fm--${r}">${r}</i>`;
const RK = { W: "승", D: "무", L: "패" };
function formStrip(list, label) {
  const cells = [...Array(Math.max(0, 5 - list.length)).fill(null), ...list];
  const aria = list.length ? `${label} 자료 ${list.length}경기 (오래된 순): ${list.map((r) => RK[r]).join(", ")}${list.length < 5 ? ` — 나머지 ${5 - list.length}경기 자료 없음` : ""}` : `${label} 자료 없음`;
  return `<span class="form" role="img" aria-label="${aria}">${cells.map((r) => (r ? fm(r) : '<i class="fm fm--x"></i>')).join("")}</span>`;
}
function trend(row) {
  if (row.prevPos == null) return `<span class="tr tr--na"><span class="sr">변동 자료 없음</span></span>`;
  const d = row.prevPos - row.pos;
  if (d > 0) return `<span class="tr tr--up"><i aria-hidden="true"></i><span class="n">${d}</span><span class="sr">계단 상승</span></span>`;
  if (d < 0) return `<span class="tr tr--down"><i aria-hidden="true"></i><span class="n">${-d}</span><span class="sr">계단 하락</span></span>`;
  return `<span class="tr tr--eq"><span aria-hidden="true">–</span><span class="sr">변동 없음</span></span>`;
}
function resultFor(m, slug) {
  const mine = m.home === slug ? m.score.h : m.score.a;
  const opp = m.home === slug ? m.score.a : m.score.h;
  return mine > opp ? "W" : mine < opp ? "L" : "D";
}
const scoreHtml = (m) => `<span class="n">${m.score.h}</span><span aria-hidden="true">-</span><span class="sr">대</span><span class="n">${m.score.a}</span>`;
const roundLabel = (m) => (m.comp === "UCL" ? `${Number(m.round)}차전` : `${m.round}라운드`);

// ───────── 콘셉트 정의 ─────────
const CONCEPTS = {
  a: {
    key: "a",
    name: "낱칸 — 경기 하나만 가린다",
    tag: "A · CELL",
    one: "D2에서 정한 '경기 하나의 결과 vs 집계값' 선을 D1 화면에 그대로 넓힌다. 변동 ▲▼·폼 칩·스코어만 빗금 칸으로 가리고 순위·승점은 집계라 보인다(안내 띠로 밝힘). RSS는 뒤표지 '구독' 단에 모은다.",
    pros: [
      "DECISIONS D2 #6(D64 ④) '집계값은 가리지 않는다'와 같은 원칙 — 사용자가 이미 고른 선을 그대로 넓혀 규칙이 하나다",
      "가린 뒤에도 표가 표로 남는다 — 순위·승점·득실을 읽을 수 있고, 펼치는 단위가 작아(칸·표) 필요한 것만 연다",
      "D2 '결과 가림 칸'(44×64 · 찍힘)과 D0 안내 띠를 재사용 — 새 모양은 작은 빗금 칸 2종(▲▼ 자리 26×13 · 폼 자리 112×20)뿐",
      "구독 주소가 한 곳(뒤표지)에 다 있어 찾기 규칙이 단순하고, 화면마다 버튼이 늘지 않는다",
    ],
    cons: [
      "순위·승점이 바뀐 걸 보면 결과를 짐작할 수 있다(라리가: 헤타페 18→12위) — 안내 띠로 고지할 뿐 막지 못한다",
      "경기 칸마다 버튼이라 라운드 9경기를 다 보려면 9번 누른다(라운드 단위 '모두 보기'는 없음)",
      "375 라운드 행 가운데 칸이 44→64px로 넓어져 팀명 칸이 줄어든다(긴 이름 '데포르티보 라코루냐'는 말줄임 규칙 그대로)",
      "RSS가 대회 화면·한국 선수 목록에 없어 발견성이 낮다 — 맨 아래까지 내려야 보인다",
    ],
    diff: "중 — 가림 대상이 칸 단위로 흩어져 있어 `data-slot=\"result-value\"` 묶음을 순위표 변동·폼·라운드·팀 일정·티켓 꼬리표에 각각 붙인다(선수 기록과 같은 방식). 섬 JS는 스위치 + 칸/표 펼치기 하나(이벤트 위임)",
    bundle: "폰트 변화 0(EuroDigest Sans 400·800 + Barlow Condensed 600·800 = 417.9KB, 2패밀리). 섬 JS 추정 gzip 약 0.8KB(스위치 · 펼치기 위임 · 포커스 이동) → 초기 JS 예산 영향 미미. CSS 약 +0.6KB",
  },
  b: {
    key: "b",
    name: "봉함 — 결과가 밴 판째 접는다",
    tag: "B · SEALED",
    one: "순위·승점·순서 자체가 결과를 드러낸다고 보고 순위표·리그 맥락·순위 미니·팀 티켓 숫자를 판째 접는다. 스코어는 라운드·지난 경기 묶음째 한 번에 편다. RSS는 각 목록 머리에 .ics와 짝으로 둔다.",
    pros: [
      "새는 곳이 없다 — 순위·승점·순위 이유 도장까지 가려 '어젯밤 결과'를 하나도 짐작할 수 없다",
      "한 번 누르면 판 전체가 열린다 — 라운드 9경기·지난 경기 4경기를 버튼 하나로(누르는 횟수가 적다)",
      "D0 '결과 가림 띠'를 라운드·일정 묶음 버튼으로 그대로 쓰고, 표 자리는 큰 봉투 하나라 구현할 칸 수가 적다",
      "구독이 맥락에 있다 — 라리가 화면에 라리가 RSS, 한국 선수 목록에 한국 선수 RSS + 소속팀 .ics가 나란히",
    ],
    cons: [
      "D2 #6(D64 ④)의 '집계값은 가리지 않는다'와 원칙이 갈린다 — 순위표만 예외로 접는 규칙이 하나 더 생긴다(선수 티켓의 팀 순위·승점도 같이 가려야 일관)",
      "가림을 켜 두면 대회 화면 첫 화면이 봉투다 — 순위표를 보러 온 독자는 매번 한 번 더 누른다",
      "순위 이유 도장(승점 차 · 순위)은 펼칠 단위가 없어 스위치를 꺼야 보인다",
      "구독 버튼이 화면마다 생겨 머리 영역이 한 줄 늘고, 전체 목록은 /about 한 곳을 따로 둔다(뒤표지는 링크 하나)",
    ],
    diff: "중하 — 가림 단위가 판 몇 개(표 · 라운드 · 지난 경기 · 티켓 · 미니)라 감싸는 요소가 적다. 대신 순위 이유 도장·선수 티켓 순위 줄까지 범위를 넓혀야 한다. 구독 버튼은 정적 링크",
    bundle: "폰트 변화 0(417.9KB, 2패밀리). 섬 JS 추정 gzip 약 0.7KB(스위치 · 판 펼치기 · 포커스 이동) — 뜯김은 기존 `--animate-tear`. CSS 약 +0.7KB(봉투 · 빗금 자리)",
  },
};

// ───────── 마스트헤드 ─────────
function masthead(current) {
  return `<header class="mast">
  <div class="ticket">
    <div class="ticket__brand">
      <p class="wordmark"><a href="${B}/">유로 다이제스트</a></p>
      <p class="wordmark-en" lang="en">EURO DIGEST</p>
      <p class="tagline">매일 아침, 밤사이 유럽 축구를 한눈에.</p>
    </div>
    <div class="ticket__tools"><button class="ibtn search" type="button" aria-label="검색 (단축키 /)" aria-haspopup="dialog">${svg(I.search)}<span class="search__t">검색</span><kbd>/</kbd></button><button class="ibtn" type="button" data-theme-toggle aria-label="테마: 시스템 설정 (눌러서 바꾸기)">${svg(I.theme)}</button></div>
    <span class="ticket__perf" aria-hidden="true"></span>
    <p class="issue"><span class="issue__k">제</span><span class="issue__n">${ISSUE_NO}</span><span class="issue__k">호</span></p>
    <p class="stub"><time datetime="2026-11-02">2026년 11월 2일 (월)</time><span>발행 07:12 KST</span><span>업데이트 07:18 KST</span></p>
    <div class="switch"><span class="switch__l" id="sw-l-${current}">결과 가리기</span><button class="switch__b" type="button" role="switch" aria-checked="true" aria-labelledby="sw-l-${current}" data-spoiler-switch><span class="off">끔</span><span class="on">켬</span></button></div>
  </div>
  <nav class="topnav" aria-label="주요 메뉴"><a href="${B}/"${current === "home" ? ' aria-current="page"' : ""}>홈</a><a href="${B}/news/">뉴스</a><a href="${B}/competitions/laliga/"${current === "comp" || current === "team" ? ' aria-current="page"' : ""}>리그</a><a href="${B}/korean-players/"${current === "kp" ? ' aria-current="page"' : ""}>한국 선수</a><a href="${B}/my/">마이</a><span class="topnav__upd">마지막 업데이트 ${tm("2026-11-01T22:18:18Z", "07:18 KST")}</span></nav>
</header>`;
}

// ───────── 화면 1 · 대회(라리가) ─────────
const LL = compData.LALIGA;
function lastLeagueMatches(slug, n = 5) {
  return LL.matches.filter((m) => m.status === "finished" && (m.home === slug || m.away === slug)).sort((a, b) => (a.kickoff < b.kickoff ? -1 : 1)).slice(-n);
}
function standingsTable(c) {
  const cfg = compCfg.LALIGA;
  const rel = cfg.zones.find((z) => z.zone === "relegation");
  let rows = "";
  for (const s of LL.standings) {
    const t = team(s.team);
    const inRel = s.pos >= rel.from && s.pos <= rel.to;
    if (inRel && s.pos === rel.from) {
      rows += `<tr class="zh zh--rel"><td colspan="11">${rel.label} 구간<span class="zh__r n">${rel.from}–${rel.to}위</span></td></tr>`;
    }
    const ms = lastLeagueMatches(s.team);
    const form = ms.map((m) => resultFor(m, s.team));
    const id = `${c.key}-lt-${s.team}`;
    const gd = s.gf - s.ga;
    // A: 변동 칸 = 빗금 자리 / 폼 = 빗금 줄. B: 표 전체가 봉투 안이라 그대로.
    const trCell = c.key === "a"
      ? `<span class="sv" style="display:contents">${trend(s)}</span><span class="trx hx hx--fine sx" style="--sx-d:block" aria-hidden="true"></span><span class="sr sx" style="--sx-d:inline">변동 가림</span>`
      : trend(s);
    const formCell = c.key === "a"
      ? `<span class="sv">${formStrip(form, "최근 리그 경기")}</span><span class="fmx hx hx--fine sx" style="--sx-d:block" aria-hidden="true"></span><span class="sr sx" style="--sx-d:inline">최근 5경기 가림</span>`
      : formStrip(form, "최근 리그 경기");
    const msList = ms.map((m) => { const r = resultFor(m, s.team); return `<li><i class="fm fm--${r}" aria-hidden="true">${r}</i><span class="sr">${RK[r]}</span> <time class="dtl__t" datetime="${m.kickoff}">${md(m.kickoff)} (${dow(m.kickoff)}) ${hm(m.kickoff)}</time> <span>${esc(team(m.home).name)} <b class="n">${m.score.h}-${m.score.a}</b> ${esc(team(m.away).name)}</span></li>`; }).join("");
    const recentBlock = `<p class="dtl__k">최근 리그 경기 <span>자료 ${ms.length}경기 · 오래된 → 최근</span></p>${formStrip(form, "최근 리그 경기")}<ul class="dtl__ms">${msList}</ul>`;
    const detailRecent = c.key === "a"
      ? `<div class="dtl__f" data-scope><div class="sv" data-focus tabindex="-1">${recentBlock}</div><button class="flap sx" style="--sx-d:flex" type="button" data-reveal><span class="flap__k">결과 가림</span><span class="flap__v">최근 리그 <span class="n">${ms.length}</span>경기</span><span class="flap__go">보기 ${svg(I.down)}</span></button></div>`
      : `<div class="dtl__f">${recentBlock}</div>`;
    rows += `<tr class="lt-row${inRel ? " z-rel" : ""}" id="${id}">
<td class="c-pos"><span class="pw"><span class="pos n">${s.pos}</span>${trCell}</span></td>
<th scope="row" class="c-team"><a class="tm" href="${B}/teams/${s.team}/">${badge(s.team, "s")}<span class="tm__n">${esc(t.name)}</span></a></th>
<td class="num">${s.played}</td>
<td class="num d">${s.w}</td><td class="num d">${s.d}</td><td class="num d">${s.l}</td><td class="num d">${s.gf}</td><td class="num d">${s.ga}</td>
<td class="num c-gd">${gd > 0 ? "+" : ""}${gd}</td>
<td class="c-pts"><span class="pts n pts-plain">${s.pts}</span><button class="rowbtn" type="button" aria-expanded="false" aria-controls="${id}-d"><span class="pts n">${s.pts}</span>${svg(I.down)}<span class="sr">${esc(t.name)} 상세 펼치기</span></button></td>
<td class="d c-form">${formCell}</td>
</tr><tr class="lt-detail${inRel ? " z-rel" : ""}" id="${id}-d" hidden><td colspan="11"><div class="dtl">
<dl class="dt"><div><dt>승</dt><dd class="n">${s.w}</dd></div><div><dt>무</dt><dd class="n">${s.d}</dd></div><div><dt>패</dt><dd class="n">${s.l}</dd></div><div><dt>득점</dt><dd class="n">${s.gf}</dd></div><div><dt>실점</dt><dd class="n">${s.ga}</dd></div></dl>
${detailRecent}
<a class="tlink" href="${B}/teams/${s.team}/">${esc(t.name)} 팀 화면 ${svg(I.right)}</a>
</div></td></tr>`;
  }
  const upd = LL.updatedAt;
  return `<table class="lt" id="${c.key}-lt">
<caption class="sr">라리가 순위 — 11월 2일 07:15 기준, 변동은 11월 1일 스냅숏 대비. 좁은 화면에서는 승점 칸 버튼으로 행을 펼친다</caption>
<thead><tr><th scope="col" class="c-pos"><span aria-hidden="true">#</span><span class="sr">순위·변동</span></th><th scope="col" class="c-team">팀</th><th scope="col" class="num">경기</th><th scope="col" class="num d">승</th><th scope="col" class="num d">무</th><th scope="col" class="num d">패</th><th scope="col" class="num d">득점</th><th scope="col" class="num d">실점</th><th scope="col" class="num c-gd">득실</th><th scope="col" class="c-pts">승점</th><th scope="col" class="d c-form">최근 5경기</th></tr></thead>
<tbody>${rows}</tbody></table>
<p class="lt-legend" aria-label="표 읽는 법"><span><i class="zs" aria-hidden="true"></i><b>강등 구간</b> ${rel.from}–${rel.to}위</span><span><span class="tr tr--up" aria-hidden="true"><i></i></span><span class="tr tr--down" aria-hidden="true"><i></i></span><b>변동</b> <span class="id">11.01 → 11.02</span></span><span>${fm("W")}${fm("D")}${fm("L")}<b>최근 5경기</b> 오래된 → 최근</span></p>`;
  void upd;
}
function roundBlock(c) {
  const ms = LL.matches.filter((m) => m.round === "11").sort((a, b) => (a.kickoff < b.kickoff ? -1 : 1));
  const fin = ms.filter((m) => m.status === "finished");
  const sched = ms.filter((m) => m.status !== "finished");
  const days = [];
  for (const m of ms) { const k = md(m.kickoff); let d = days.find((x) => x.k === k); if (!d) days.push((d = { k, dow: dow(m.kickoff), ms: [] })); d.ms.push(m); }
  const row = (m) => {
    const h = team(m.home), a = team(m.away);
    let mid;
    if (m.status !== "finished") mid = `<span class="rd__vs">예정</span>`;
    else if (c.key === "a") mid = `<span class="rc" data-scope><span class="sv res" data-focus tabindex="-1">${scoreHtml(m)}</span><button class="spo-b sx" type="button" data-reveal aria-label="${md(m.kickoff)} ${esc(h.name)} 대 ${esc(a.name)} 결과 보기"><span>보기</span></button></span>`;
    else mid = `<span class="sv res">${scoreHtml(m)}</span><span class="slot hx sx" style="--sx-d:block" aria-hidden="true"></span><span class="sr sx" style="--sx-d:inline">결과 가림</span>`;
    return `<li class="rd${m.status !== "finished" ? " rd--sched" : ""}"><time class="rd__t" datetime="${m.kickoff}">${hm(m.kickoff)}</time><span class="rd__h"><span class="rd__nm">${esc(h.name)}</span>${badge(m.home, "xs")}</span><span class="rd__s">${mid}</span><span class="rd__a">${badge(m.away, "xs")}<span class="rd__nm">${esc(a.name)}</span></span></li>`;
  };
  const list = days.map((d) => `<li><p class="rd-day__h">${d.k} (${d.dow})</p><ul>${d.ms.map(row).join("")}</ul></li>`).join("");
  const first = ms[0], last = ms[ms.length - 1];
  const bandB = c.key === "b" ? `<button class="flap flap--rd sx" style="--sx-d:flex" type="button" data-reveal><span class="flap__k">결과 가림</span><span class="flap__v">11라운드 종료 <span class="n">${fin.length}</span>경기 스코어</span><span class="flap__go">모두 보기 ${svg(I.down)}</span></button>` : "";
  return `<section class="rd-w" aria-labelledby="${c.key}-rd-h"${c.key === "b" ? " data-scope" : ""}>
  <div class="sec-h"><h2 id="${c.key}-rd-h">11라운드</h2><span class="rh" lang="en" aria-hidden="true">FIXTURES</span></div>
  <p class="sub">${md(first.kickoff)} (${dow(first.kickoff)}) – ${md(last.kickoff)} (${dow(last.kickoff)}) · 킥오프 KST · 종료 <span class="n">${fin.length}</span> · 예정 <span class="n">${sched.length}</span></p>
  <nav class="rnav" aria-label="라운드 이동"><a class="rnav__b" href="#" aria-label="10라운드">${svg(I.left)}10R</a><span class="rnav__c">11라운드<span class="n">10.31 – 11.03</span></span><a class="rnav__b" href="#" aria-label="12라운드">12R${svg(I.right)}</a></nav>
  ${bandB}
  <ul class="rds"${c.key === "b" ? ' data-tear data-focus tabindex="-1"' : ""}>${list}</ul>
</section>`;
}
function compScreen(c) {
  const head = `<header class="cp-head">
    <p class="cp-kicker">${ftab("LALIGA")}<span>2026-27 시즌</span><span class="rh" lang="en" aria-hidden="true">LEAGUE TABLE</span></p>
    <h1 id="${c.key}-cp-h">라리가</h1>
    <p class="cp-sub"><span class="n">11</span>라운드 진행 중 · 순위 ${tm(LL.updatedAt, "11.02 07:15 KST")} 갱신</p>
    ${c.key === "b" ? `<p class="subl"><a class="btn btn--sec btn--s" href="${B}/rss/laliga.xml" type="application/rss+xml">${svg(I.rss)}라리가 소식 RSS</a></p>` : ""}
  </header>`;
  const cswitch = `<nav class="cswitch" aria-label="대회 이동">${Object.keys(COMP_KEYS).map((id) => `<a class="ctab tab--${COMP_KEYS[id]}" href="${B}/competitions/${COMP_KEYS[id]}/"${id === "LALIGA" ? ' aria-current="page"' : ""}>${esc(compCfg[id].shortKo)}</a>`).join("")}</nav>`;
  const ptabs = `<div class="ptabs" role="tablist" aria-label="라리가 보기">${["순위표", "일정·결과", "득점 순위", "뉴스"].map((l, i) => `<button role="tab" type="button" id="${c.key}-tb-${i}" aria-controls="${c.key}-pn-${i}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ""}>${l}</button>`).join("")}</div>`;
  const panelOthers = [1, 2, 3].map((i) => `<div class="pn" role="tabpanel" id="${c.key}-pn-${i}" aria-labelledby="${c.key}-tb-${i}" hidden><p class="skipnote"><b>생략</b>이 탭은 D1 확정 그대로다 — 이 시안은 순위표 탭과 그 아래 라운드만 다룬다.</p></div>`).join("");
  let table;
  if (c.key === "a") {
    table = `<div data-scope id="a-lt-scope">
  <div class="veil veil--lt sx" style="--sx-d:flex"><p><b>결과 가리기 켜짐.</b> <span class="veil__s">순위 변동과 최근 5경기를 가렸어요. 순위·승점은 어젯밤 경기까지 더한 집계라 그대로 보여요.</span></p><button class="btn btn--sec btn--s" type="button" data-reveal>변동 보기</button></div>
  <div data-focus tabindex="-1">${standingsTable(c)}</div>
</div>`;
  } else {
    table = `<div data-scope id="b-lt-scope">
  <button class="seal hx sx" style="--sx-d:grid" type="button" data-reveal aria-describedby="b-seal-d"><span class="seal__lab"><span class="seal__k">순위표 가림</span><span class="seal__d" id="b-seal-d">순위·승점·변동이 어젯밤 결과를 드러내서 표를 접었어요.</span><span class="seal__m">20팀 · 11라운드 종료 <span class="n">9</span>경기 반영 · ${tm(LL.updatedAt, "11.02 07:15")} KST 갱신</span></span><span class="seal__go">순위표 펼치기 ${svg(I.down)}</span></button>
  <div class="sv" data-tear data-focus tabindex="-1">${standingsTable(c)}</div>
</div>`;
  }
  return `<div class="layout">
<nav class="contents" aria-label="대회">
  <div class="sec-h"><h2>대회</h2><span class="rh" lang="en" aria-hidden="true">COMPETITIONS</span></div>
  <ul class="ct">${Object.keys(COMP_KEYS).map((id) => `<li><a class="ct-row" href="${B}/competitions/${COMP_KEYS[id]}/"${id === "LALIGA" ? ' aria-current="page"' : ""}>${ftab(id).replace("ftab ", "ftab ")}<span class="ct-l">${esc(compCfg[id].nameKo)}</span></a></li>`).join("")}</ul>
</nav>
<main class="page" id="main" tabindex="-1">
<section class="cp" aria-labelledby="${c.key}-cp-h">
  ${head}
  ${cswitch}
  ${ptabs}
  <div class="pn" role="tabpanel" id="${c.key}-pn-0" aria-labelledby="${c.key}-tb-0">
    ${table}
    <div class="prog prog--m4">${roundBlock(c)}</div>
  </div>
  ${panelOthers}
  <p class="dsrc"><b>데이터</b> football-data.org — 순위·경기 ${tm(LL.updatedAt, "11.02 07:15")} KST 갱신 · <span lang="en">Football data provided by the Football-Data.org API</span></p>
</section>
</main>
</div>`;
}

// ───────── 화면 2 · 팀(아틀레티코 마드리드) ─────────
const TEAM = "atletico-madrid";
function allTeamMatches(slug) {
  return Object.values(compData).flatMap((cd) => cd.matches).filter((m) => m.home === slug || m.away === slug).sort((a, b) => (a.kickoff < b.kickoff ? -1 : 1));
}
function teamScreen(c) {
  const t = team(TEAM);
  const st = LL.standings.find((s) => s.team === TEAM);
  const ms = allTeamMatches(TEAM);
  const past = ms.filter((m) => m.status === "finished");
  const next = ms.filter((m) => m.status !== "finished");
  const shownPast = past.slice(-4), shownNext = next.slice(0, 4);
  const form = past.slice(-5).map((m) => resultFor(m, TEAM));
  const nx = next[0];
  const gd = st.gf - st.ga;
  const kr = kplayers.filter((p) => p.team === TEAM && p.active);
  const [k1, k2] = t.colors;
  // 숫자 칸 — B는 순위·승점·승무패·득실을 가린다(경기 수는 결과가 아니다)
  const hideB = c.key === "b";
  const val = (v, w) => hideB ? `<b class="sv n">${v}</b><span class="numx hx hx--fine sx" style="--sx-d:block;--w:${w}" aria-hidden="true"></span>` : `<b class="n">${v}</b>`;
  const subv = (v) => hideB ? `<span class="sv">${v}</span><span class="sr sx" style="--sx-d:inline">가림</span>` : `<span>${v}</span>`;
  const formA = `<span class="rc rc--strip" data-scope><span class="sv" data-focus tabindex="-1">${formStrip(form, "최근 경기(전 대회)")}</span><button class="spo-b spo-b--strip sx" type="button" data-reveal aria-label="최근 경기 5경기 결과 보기"><span>보기</span></button></span>`;
  const formB = `<span class="sv">${formStrip(form, "최근 경기(전 대회)")}</span><span class="fmx hx hx--fine sx" style="--sx-d:block" aria-hidden="true"></span><span class="sr sx" style="--sx-d:inline">최근 경기 가림</span>`;
  const ics = `<a class="btn btn--sec btn--s icsb" href="${B}/calendar/${TEAM}.ics">${svg(I.cal)}.ics 일정 구독</a>`;
  const ticket = `<article class="tk" aria-labelledby="${c.key}-tk-h"${hideB ? " data-scope" : ""}>
  <div class="tk__stub" style="--k1:${k1};--k2:${k2};--kf:${kf(k1)}" role="img" aria-label="${esc(t.name)} 배지 ${t.short}"><b>${t.short}</b></div>
  <span class="tk__perf" aria-hidden="true"></span>
  <div class="tk__body">
    <p class="tk__comp">${ftab("LALIGA")}<span>라리가 · 2026-27</span></p>
    <h1 class="tk__name" id="${c.key}-tk-h">${esc(t.name)}</h1>
    <dl class="tk__nums"${hideB ? ' data-tear data-focus tabindex="-1"' : ""}>
      <div><dt>순위</dt><dd>${hideB ? `<span class="sv"><b class="n">${st.pos}</b><span class="u">위</span></span><span class="numx hx hx--fine sx" style="--sx-d:block" aria-hidden="true"></span><span class="sr sx" style="--sx-d:inline">가림</span>` : `<span><b class="n">${st.pos}</b><span class="u">위</span></span>`}</dd></div>
      <div><dt>승점</dt><dd>${val(st.pts)}${hideB ? '<span class="sr sx" style="--sx-d:inline">가림</span>' : ""}</dd></div>
      <div><dt>경기</dt><dd><b class="n">${st.played}</b>${subv(`<span class="n">${st.w}</span>승 <span class="n">${st.d}</span>무 <span class="n">${st.l}</span>패`)}</dd></div>
      <div><dt>득실</dt><dd>${val(`${gd > 0 ? "+" : ""}${gd}`)}${subv(`<span class="n">${st.gf}</span>-<span class="n">${st.ga}</span>`)}</dd></div>
    </dl>
    ${hideB ? `<button class="flap flap--tk sx" style="--sx-d:flex" type="button" data-reveal><span class="flap__k">결과 가림</span><span class="flap__v">순위·승점·최근 경기</span><span class="flap__go">보기 ${svg(I.down)}</span></button>` : ""}
  </div>
  <div class="tk__tail">
    <div class="tk__cell"><p class="tk__k">최근 경기<span>전 대회 · 자료 ${Math.min(5, past.length)}경기</span></p><div class="tk__v">${c.key === "a" ? formA : formB}</div></div>
    <div class="tk__cell"><p class="tk__k">다음 경기</p><div class="tk__v"><time datetime="${nx.kickoff}">${md(nx.kickoff)} (${dow(nx.kickoff)}) ${hm(nx.kickoff)}</time>${ftab(nx.comp)}<span>${nx.home === TEAM ? "홈" : "원정"}</span><span>${esc(team(nx.home === TEAM ? nx.away : nx.home).name)}</span>${ics}</div></div>
    <div class="tk__cell"><p class="tk__k">한국 선수</p><div class="tk__v">${kr.map((p) => `<span class="arm" title="한국 선수">한국</span><a class="krl" href="${B}/korean-players/${p.slug}/">${esc(p.nameKo)}</a><span class="sh__p">${p.position}</span>`).join("")}</div></div>
  </div>
</article>`;
  const fxRow = (m, isPast) => {
    const home = m.home === TEAM;
    const opp = home ? m.away : m.home;
    let right;
    if (!isPast) right = `<span class="fx__t"><time datetime="${m.kickoff}">${hm(m.kickoff)}</time></span><span class="fx__st">예정 · KST</span>`;
    else {
      const r = resultFor(m, TEAM);
      const val = `<span class="fx__s">${scoreHtml(m)}</span><i class="fm fm--${r}" aria-hidden="true">${r}</i><span class="sr">${RK[r]} (홈-원정 순 스코어)</span>`;
      if (c.key === "a") right = `<span class="rc" data-scope><span class="sv res" data-focus tabindex="-1">${val}</span><button class="spo-b sx" type="button" data-reveal aria-label="${md(m.kickoff)} ${esc(team(opp).name)}전 결과 보기"><span>보기</span></button></span>`;
      else right = `<span class="sv res">${val}</span><span class="slot slot--fx hx sx" style="--sx-d:block" aria-hidden="true"></span><span class="sr sx" style="--sx-d:inline">결과 가림</span>`;
    }
    return `<li class="fx"><span class="fx__gut"><span class="fx__d">${md(m.kickoff)}</span><span class="fx__w">${dow(m.kickoff)}</span></span><span class="fx__b"><span class="fx__k">${ftab(m.comp)}<span>${home ? "홈" : "원정"} · ${roundLabel(m)}</span></span><span class="fx__o">${badge(opp, "s")}<span>${esc(team(opp).name)}</span></span></span><span class="fx__r">${right}</span></li>`;
  };
  const pastBlock = c.key === "b"
    ? `<div data-scope><button class="flap flap--fx sx" style="--sx-d:flex" type="button" data-reveal><span class="flap__k">결과 가림</span><span class="flap__v">지난 경기 <span class="n">${shownPast.length}</span>경기 스코어</span><span class="flap__go">모두 보기 ${svg(I.down)}</span></button><ul class="fxs fxs--in" data-tear data-focus tabindex="-1">${shownPast.map((m) => fxRow(m, true)).join("")}</ul></div>`
    : `<ul class="fxs fxs--in">${shownPast.map((m) => fxRow(m, true)).join("")}</ul>`;
  const fixtures = `<section aria-labelledby="${c.key}-fx-h">
  <div class="sec-h"><h2 id="${c.key}-fx-h">일정·결과</h2><span class="rh" lang="en" aria-hidden="true">FIXTURES</span></div>
  <p class="sub">KST · 스코어는 홈-원정 순 · 시즌 <span class="n">${ms.length}</span>경기</p>
  <details class="fx-more"><summary class="tlink"><span>지난 경기 <span class="n">${past.length - shownPast.length}</span>경기 더 보기</span></summary><p class="note">생략 — D1 확정 그대로(접힌 목록도 같은 가림 규칙)</p></details>
  ${pastBlock}
  <ul class="fxs fxs--in fxs--next">${shownNext.map((m) => fxRow(m, false)).join("")}</ul>
  <details class="fx-more"><summary class="tlink"><span>남은 일정 <span class="n">${next.length - shownNext.length}</span>경기 더 보기</span></summary><p class="note">생략 — D1 확정 그대로</p></details>
</section>`;
  // 리그 맥락 1~4위
  const ctxRows = LL.standings.slice(0, 4).map((s) => `<li class="lc${s.team === TEAM ? " is-me" : ""}"><span class="lc__no n">${s.pos}</span>${badge(s.team, "xs")}<span>${esc(team(s.team).name)}</span><span class="lc__p n">${s.pts}</span></li>`).join("");
  const ctxInner = `<ol class="lcs" aria-label="라리가 순위 1~4위"${c.key === "b" ? ' data-tear data-focus tabindex="-1"' : ""}>${ctxRows}</ol>`;
  const ctx = (id) => `<section class="lctx" aria-labelledby="${c.key}-lc-h${id}"${c.key === "b" ? " data-scope" : ""}>
  <div class="sec-h sec-h--thin"><h2 id="${c.key}-lc-h${id}">라리가 순위</h2><span class="rh" lang="en" aria-hidden="true">TABLE</span></div>
  ${c.key === "b" ? `<button class="seal seal--s hx sx" style="--sx-d:grid" type="button" data-reveal><span class="seal__lab"><span class="seal__k">리그 순위 가림</span><span class="seal__m">1~4위 · 이 팀 포함</span></span><span class="seal__go">펼치기 ${svg(I.down)}</span></button><div class="sv">${ctxInner}</div>` : ctxInner}
  <a class="tlink" href="${B}/competitions/laliga/">전체 순위 ${svg(I.right)}</a>
</section>`;
  return `${ticket}
<p class="skipnote"><b>생략</b>팀시트(포메이션 · 선발 · 교체) — D1 확정 그대로, 결과와 무관</p>
<div class="layout tp-grid">
<nav class="contents" aria-label="리그 맥락">${ctx("c")}</nav>
<div class="page">${fixtures}<div class="lc-flow">${ctx("f")}</div></div>
</div>`;
}

// ───────── 화면 3 · 홈 위젯(오늘 밤 · 리그 순위 미니) ─────────
function tonightWidget(c) {
  const w = widgets.tonight;
  const rows = w.cards.map((cd) => {
    const why = cd.reasons.map((r) => {
      if (r.kind === "korean") return `<li class="why"><span class="arm" title="한국 선수">한국</span>${esc(r.label)}</li>`;
      const rankBased = r.kind === "closeRace" || r.kind === "topClash";
      if (c.key === "b" && rankBased) return `<li><span class="stamp sv">${esc(r.label)}</span><span class="stamp stampx hx hx--fine sx" style="--sx-d:inline-flex">순위 이유 가림</span></li>`;
      return `<li><span class="stamp">${esc(r.label)}</span></li>`;
    }).join("");
    const key = Object.entries(COMP_KEYS).find(([id]) => id === cd.comp)[1];
    return `<li class="tn"><span class="tn__gut"><time class="tn__t" datetime="${cd.kickoff}">${cd.time}</time><span class="tn__d">${cd.date}</span></span><span class="tn__b">${why ? `<ul class="tn__why" aria-label="선정 이유">${why}</ul>` : ""}<span class="tn__vs"><span>${badge(cd.home.slug, "s")}${esc(cd.home.name)}</span><span class="sr">대</span><span>${badge(cd.away.slug, "s")}${esc(cd.away.name)}</span></span></span><span class="tn__tab"><span class="tab tab--${key}" title="${esc(cd.compLabel.name)}">${esc(cd.compLabel.short)}</span></span></li>`;
  }).join("");
  return `<section class="wg" aria-labelledby="${c.key}-tn-h">
  <div class="sec-h sec-h--thin"><h2 id="${c.key}-tn-h">오늘 밤 볼 경기</h2><span class="rh" lang="en" aria-hidden="true">TONIGHT</span></div>
  <p class="sub">11.02 18:00 ~ 11.03 07:00 KST · <span class="n">${w.cards.length}</span>경기</p>
  <ol class="tns">${rows}</ol>
</section>`;
}
function miniWidget(c) {
  const panels = widgets.mini;
  const tabs = panels.map((p, i) => `<button class="ctab tab--${COMP_KEYS[p.comp]}" role="tab" type="button" id="${c.key}-mt-${i}" aria-controls="${c.key}-mp-${i}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ""}>${esc(p.short)}</button>`).join("");
  const body = panels.map((p, i) => {
    const rows = p.rows.map((r) => {
      const tr = r.trend.kind === "up" ? `<span class="tr tr--up"><i aria-hidden="true"></i><span class="n">${r.trend.by}</span><span class="sr">계단 상승</span></span>` : r.trend.kind === "down" ? `<span class="tr tr--down"><i aria-hidden="true"></i><span class="n">${r.trend.by}</span><span class="sr">계단 하락</span></span>` : r.trend.kind === "same" ? `<span class="tr tr--eq"><span aria-hidden="true">–</span><span class="sr">변동 없음</span></span>` : `<span class="tr tr--na"><span class="sr">변동 자료 없음</span></span>`;
      const trCell = c.key === "a" ? `<span class="sv">${tr}</span><span class="mrx hx hx--fine sx" style="--sx-d:block" aria-hidden="true"></span><span class="sr sx" style="--sx-d:inline">변동 가림</span>` : tr;
      return `<li class="mr${r.band === "ko" ? " z-ko" : ""}"><span class="mr__no n">${r.pos}</span>${badge(r.team.slug, "s")}<span>${esc(r.team.name)}</span>${trCell}<span class="mr__p"><b class="n">${r.pts}</b><span class="sr">점</span></span></li>`;
    }).join("");
    const list = `<ol class="mrs" aria-label="${esc(p.name)} 상위 5위"${c.key === "b" ? ' data-tear data-focus tabindex="-1"' : ' data-focus tabindex="-1"'}>${rows}</ol>`;
    const foot = c.key === "a"
      ? `<div class="mp__f"><span class="note">${esc(p.note)}</span><button class="btn btn--sec btn--s sx" style="--sx-d:inline-flex" type="button" data-reveal>변동 보기</button><a class="tlink" href="${B}/competitions/${COMP_KEYS[p.comp]}/">전체 순위 ${svg(I.right)}</a></div>`
      : `<div class="mp__f"><span class="note">${esc(p.note)}</span><a class="tlink" href="${B}/competitions/${COMP_KEYS[p.comp]}/">전체 순위 ${svg(I.right)}</a></div>`;
    const inner = c.key === "b"
      ? `<button class="seal seal--s hx sx" style="--sx-d:grid" type="button" data-reveal><span class="seal__lab"><span class="seal__k">리그 순위 가림</span><span class="seal__m">${esc(p.name)} 상위 5위</span></span><span class="seal__go">펼치기 ${svg(I.down)}</span></button><div class="sv">${list}</div>`
      : list;
    return `<div class="mp" role="tabpanel" id="${c.key}-mp-${i}" aria-labelledby="${c.key}-mt-${i}" data-scope${i ? " hidden" : ""}>${inner}${foot}</div>`;
  }).join("");
  return `<section class="wg" aria-labelledby="${c.key}-mn-h">
  <div class="sec-h sec-h--thin"><h2 id="${c.key}-mn-h">리그 순위</h2><span class="rh" lang="en" aria-hidden="true">LEAGUE TABLE</span></div>
  <div class="mtabs" role="tablist" aria-label="대회 선택">${tabs}</div>
  ${body}
</section>`;
}
function homeScreen(c) {
  return `<div class="hm">
  <div class="hm__main"><p class="skipnote"><b>생략</b>지면(오늘의 5줄 · 주요 뉴스) — 5줄 결과 줄과 spoiler 카드 띠는 D0 확정('결과 가림 띠')</p></div>
  <div class="hm__facing">${tonightWidget(c)}${miniWidget(c)}</div>
</div>`;
}

// ───────── 화면 4 · 한국 선수 목록 머리 ─────────
function kpScreen(c) {
  const total = kplayers.length;
  const linked = kplayers.filter((p) => p.comp !== "OTHER" && p.active && p.apiFootballId !== null && krec.players.find((r) => r.slug === p.slug)?.since).length;
  const subB = `<p class="subl"><a class="btn btn--sec btn--s" href="${B}/rss/korean.xml" type="application/rss+xml">${svg(I.rss)}한국 선수 소식 RSS</a><a class="btn btn--sec btn--s" href="${B}/calendar/korean.ics">${svg(I.cal)}.ics 소속팀 경기 구독</a></p>`;
  return `<section class="kp" aria-labelledby="${c.key}-kp-h">
  <header class="kp-head">
    <p class="kp-k"><span>등록 <span class="n">${total}</span> · 기록 연결 <span class="n">${linked}</span></span><span class="rh" lang="en" aria-hidden="true">SQUAD REGISTER</span></p>
    <h1 id="${c.key}-kp-h">한국 선수</h1>
    <p class="kp-sub"><b>10월 19일 이후 집계</b> · 업데이트 ${tm(krec.generatedAt, "11.02 07:18")} KST</p>
    ${c.key === "b" ? subB : ""}
  </header>
  <p class="skipnote"><b>생략</b>명단 표 — D2 확정 그대로(결과 칸은 D2 '결과 가림 칸', 시즌 누적은 가리지 않음)${c.key === "a" ? " · 구독 링크는 뒤표지 '구독' 단" : ""}</p>
</section>`;
}

// ───────── 뒤표지 ─────────
function colophon(c) {
  const links = `<ul class="colophon__links"><li><a href="${B}/about/#ai">AI 작성 고지</a></li><li><a href="${B}/about/">소개·출처 정책</a></li><li><a href="${B}/about/#contact">삭제·정정 요청</a></li><li><a href="https://github.com/sguys99/euro-digest" target="_blank" rel="noopener">GitHub<span aria-hidden="true"> ↗</span><span class="sr"> (새 창)</span></a></li>${c.key === "b" ? `<li><a href="${B}/about/#subscribe">RSS·캘린더 구독 모음</a></li>` : ""}</ul>`;
  const subsA = `<section class="subs" aria-labelledby="a-subs-h">
    <h2 class="subs__h" id="a-subs-h">구독 <span class="subs__rh" lang="en" aria-hidden="true">FEEDS</span></h2>
    <ul class="subs__rows">
      <li class="subs__row"><span class="subs__k">${svg(I.rss, "ic ic--16")}RSS</span><span class="subs__v"><a href="${B}/rss.xml" type="application/rss+xml">전체 소식</a><a href="${B}/rss/korean.xml" type="application/rss+xml">한국 선수</a></span></li>
      <li class="subs__row"><span class="subs__k">${svg(I.rss, "ic ic--16")}대회별</span><span class="subs__v subs__v--c">${Object.keys(COMP_KEYS).map((id) => `<a href="${B}/rss/${COMP_KEYS[id]}.xml" type="application/rss+xml" title="${esc(compCfg[id].nameKo)} RSS">${esc(compCfg[id].shortKo)}</a>`).join("")}</span></li>
      <li class="subs__row"><span class="subs__k">${svg(I.cal, "ic ic--16")}캘린더</span><span class="subs__v"><a href="${B}/calendar/korean.ics">한국 선수 소속팀 경기 .ics</a></span></li>
    </ul>
    <p class="subs__note">RSS 리더나 캘린더 앱에 주소를 붙여 넣어 구독해요. 팀 일정 .ics는 각 팀 화면 '다음 경기' 칸에 있어요.</p>
  </section>`;
  return `<footer class="colophon colophon--${c.key}"><div class="colophon__in">
  <p class="colophon__brand">유로 다이제스트 <span>제 ${ISSUE_NO}호 · <time datetime="2026-11-02">2026년 11월 2일 (월)</time></span></p>
  <p class="colophon__fd" lang="en">Football data provided by the Football-Data.org API</p>
  <p class="colophon__p">경기·출전 데이터 football-data.org · API-Football. 오늘의 5줄은 이 데이터로 AI가 쓰고, AI가 쓴 줄에만 ‘AI 작성’ 라벨을 붙입니다. 검증에 맞지 않는 줄은 라벨 없는 코드 문장으로 바꾸거나 빼고, AI 답을 쓸 수 없는 날은 모든 줄을 코드 문장으로 싣습니다. 뉴스 카드는 AI 없이 원문 제목 그대로 싣습니다.</p>
  ${links}
  ${c.key === "a" ? subsA : ""}
  <p class="colophon__p colophon__upd">마지막 업데이트 ${tm("2026-11-01T22:18:18Z", "07:18 KST")}</p>
</div></footer>`;
}

// ───────── 콘셉트별 CSS ─────────
const CSS_COMMON_EXTRA = `
@media (max-width:1023px){.rd{grid-template-columns:40px minmax(0,1fr) 44px minmax(0,1fr);gap:6px}.rd__h,.rd__a{gap:5px}}
.rd__nm{min-width:0}
.rd-day__h{margin-top:4px}
.prog--m4{display:block;margin-top:36px}
@media (min-width:1024px){.prog--m4{margin-top:44px;max-width:640px}}
.subl{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.fx-more summary{cursor:pointer;list-style:none}
.fx-more summary::-webkit-details-marker{display:none}
.tk__v .btn{text-decoration:none}
.fxs--in{margin-top:0}
.fxs--next{border-top:0}
.tk__v .icsb{margin-left:auto}
.lctx .tlink{margin-top:4px}
.lc-flow{margin-top:36px}
.kp{padding-top:4px}
.colophon__upd{color:var(--colophon-fg-2)}
.mp__f .note{margin-right:auto}
.tn__why .stamp{white-space:nowrap}
`;
const CSS = {
  a: `
/* ══ A 낱칸 ══ */
.trx{width:26px;height:13px;margin-top:5px}
@media (min-width:1024px){.trx{margin-top:1px}}
.fmx{width:112px;height:20px}
.mrx{width:26px;height:13px}
.veil--lt{margin-top:14px}
[data-spoiler="on"] .rds .rd{grid-template-columns:44px minmax(0,1fr) 64px minmax(0,1fr)}
@media (max-width:1023px){[data-spoiler="on"] .rds .rd{grid-template-columns:40px minmax(0,1fr) 64px minmax(0,1fr)}}
.sv.is-in{animation:stamp var(--duration-fast) var(--ease) both}
.spo-b--strip{min-width:112px}
.rc--strip{justify-items:start}
.dtl__f .flap{margin-top:0}
/* 뒤표지 '구독' 단 */
.subs{display:grid;gap:6px;margin-top:6px;padding-top:14px;border-top:1px solid var(--colophon-fg-2)}
.subs__h{display:flex;align-items:baseline;gap:10px;font-size:15px;font-weight:800;letter-spacing:-.02em}
.subs__rh{font:600 12.5px/1 var(--font-numeric);letter-spacing:.14em;color:var(--colophon-fg-2)}
.subs__row{display:grid;grid-template-columns:76px minmax(0,1fr);align-items:center;column-gap:12px;border-bottom:1px dotted var(--colophon-fg-2)}
.subs__row:last-child{border-bottom:0}
.subs__k{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:800;color:var(--colophon-fg-2)}
.subs__v{display:flex;flex-wrap:wrap;column-gap:16px;min-width:0}
.subs__v a{display:inline-flex;align-items:center;min-height:44px;font-weight:800;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:4px}
.subs__v a:hover{text-decoration-thickness:2px}
.subs__v--c{display:grid;grid-template-columns:repeat(3,max-content);column-gap:18px}
.subs__v--c a{min-width:44px}
@media (min-width:1024px){.subs__v--c{grid-template-columns:repeat(6,max-content)}}
.subs__note{color:var(--colophon-fg-2);font-size:12.5px;line-height:1.5}
@media (min-width:1024px){.colophon--a .subs{grid-column:2}.colophon--a .colophon__links{grid-row:2/3}.colophon--a .colophon__upd{grid-column:1;grid-row:4}}
`,
  b: `
/* ══ B 봉함 ══ */
.seal{position:relative;grid-template-columns:minmax(0,1fr);align-content:space-between;gap:18px;width:100%;min-height:200px;margin-top:14px;padding:14px;color:var(--ink);text-align:left;font:inherit}
.seal__lab{display:grid;gap:5px;justify-self:start;max-width:30em;padding:10px 12px 11px;background:var(--paper)}
.seal__k{font-size:16px;font-weight:800;letter-spacing:-.02em;line-height:1.3}
.seal__d{font-size:13px;color:var(--ink-2);line-height:1.5}
.seal__m{font-size:12.5px;color:var(--ink-2);line-height:1.4}
.seal__m .n,.seal__m time{font:600 13.5px/1 var(--font-numeric)}
.seal__go{justify-self:end;display:inline-flex;align-items:center;gap:4px;min-height:44px;padding:0 10px 0 14px;background:var(--paper);border:1px dashed var(--ink-2);font-size:14px;font-weight:800}
.seal__go .ic{width:18px;height:18px}
.seal:hover{border-color:var(--ink)}
.seal:hover .seal__go{border-color:var(--ink)}
.seal--s{min-height:128px;margin-top:10px;gap:12px}
.seal--s .seal__k{font-size:15px}
@media (min-width:1024px){.seal{min-height:248px;padding:18px}.seal--s{min-height:128px;padding:14px}}
.slot{width:40px;height:22px}
@media (min-width:1024px){.slot{width:48px}}
.slot--fx{width:76px;height:24px}
.fmx{width:112px;height:20px}
.numx{width:44px;height:24px}
@media (min-width:1024px){.numx{width:56px;height:34px}}
.stampx{border:1px dashed var(--ink-2);color:var(--ink-2)}
.flap--rd{margin-top:12px}
.flap--tk{margin-top:12px}
.flap--fx{margin-top:10px}
[data-tear].is-in{animation:tear var(--duration-base) var(--ease) both}
.rd-w .rds{margin-top:8px}
`,
};

// ───────── 문서 ─────────
function meta(c) {
  const o = c.key === "a" ? CONCEPTS.b : CONCEPTS.a;
  const li = (a) => a.map((x) => `<li>${esc(x)}</li>`).join("");
  const axes = [
    ["순위표 가림 범위(정보 노출)", "변동 ▲▼ · 최근 5경기만. 순위·승점·승무패·득실은 집계라 보임 + 안내 띠로 고지", "표 전체(순위 순서·승점·변동·폼). 리그 맥락 · 순위 미니 · 팀 티켓 숫자 · 순위 이유 도장까지"],
    ["펼치는 단위", "칸 하나(경기 결과 칸 · 티켓 폼) / 변동은 표 하나에 버튼 1개", "판 하나(순위표 · 라운드 전체 · 지난 경기 묶음 · 티켓 · 미니 패널)"],
    ["경기 기준 스코어 행", "D2 '결과 가림 칸'을 행마다(라운드 가운데 칸 64px)", "행에는 빗금 자리만, 묶음 위 D0 '결과 가림 띠' 버튼 하나"],
    ["폼 칩 W/D/L 줄", "112×20 빗금 줄 — 표에서는 '변동 보기'로, 티켓에서는 그 칸 '보기'로", "112×20 빗금 줄 — 판(표·티켓)과 함께 펼침"],
    ["RSS · .ics 배치", "뒤표지 '구독' 단에 RSS 전부 + 한국 선수 .ics. 팀 .ics는 티켓 '다음 경기' 칸(D2)", "맥락: 대회 머리 = 그 대회 RSS, 한국 선수 머리 = RSS + .ics 짝, 팀 티켓 = .ics. 뒤표지는 '구독 모음' 링크 하나"],
    ["모션", "찍힘(fast) — 드러난 값만", "뜯김(base) — 판이 위에서 아래로"],
  ];
  const axesRows = axes.map(([k, a, b]) => `<tr><th>${esc(k)}</th><td${c.key === "a" ? ' class="me"' : ""}>${esc(a)}</td><td${c.key === "b" ? ' class="me"' : ""}>${esc(b)}</td></tr>`).join("");
  void o;
  return `<aside class="meta-w" aria-label="시안 정보"><details class="meta">
  <summary><span class="meta__tag">M4 미니 시안 ${c.tag}</span><b>${esc(c.name)}</b><span class="meta__one">${esc(c.one)}</span><span class="meta__more" aria-hidden="true"></span></summary>
  <div class="meta__grid">
    <div><p class="meta__h">장점</p><ul>${li(c.pros)}</ul></div>
    <div><p class="meta__h">단점</p><ul>${li(c.cons)}</ul></div>
    <div><p class="meta__h">구현 난이도</p><p>${esc(c.diff)}</p><p class="meta__h">번들·폰트 영향</p><p>${esc(c.bundle)}</p><p class="meta__h">데이터</p><p>data/competitions(라리가 · 6개 대회 순위표 — 11.02 07:15~07:17 KST 갱신) · data/teams · configs/team-colors · configs/korean-players · data/players/korean.json(11.02 07:18). 오늘 밤 · 순위 미니는 src 로더(loadTonightWidget · loadLeagueMini)를 기준 시각 11.02 07:30 KST로 돌린 값. 스위치는 이 시안에서만 처음부터 켜 둔다(제품 기본값은 꺼짐 — ?spoiler=off로 끔 상태).</p></div>
    <div class="span3"><p class="meta__h">축 매트릭스 (A ↔ B)</p><table class="axes"><thead><tr><th>축</th><th>A 낱칸</th><th>B 봉함</th></tr></thead><tbody>${axesRows}</tbody></table></div>
  </div>
</details></aside>`;
}
const divider = (title, path, info) => `<aside class="divider divider--screen" aria-label="시안 설명 — ${esc(title)}"><span><b>${esc(title)}</b> <code>${esc(path)}</code></span><span class="divider__info">${info}</span></aside>`;

const JS = `(function(){
var r=document.documentElement,rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)');
function reduced(){return rm&&rm.matches}
function sw(on){if(on)r.setAttribute('data-spoiler','on');else r.removeAttribute('data-spoiler');
 var s=document.querySelectorAll('.is-shown,.is-in');for(var i=0;i<s.length;i++)s[i].classList.remove('is-shown','is-in');
 var b=document.querySelectorAll('[data-spoiler-switch]');for(var k=0;k<b.length;k++)b[k].setAttribute('aria-checked',on?'true':'false');}
sw(r.getAttribute('data-spoiler')==='on');
function reveal(sc){if(!sc)return;var els=sc.querySelectorAll('.sv,.sx');for(var i=0;i<els.length;i++)els[i].classList.add('is-shown');
 if(!reduced()){var a=sc.querySelectorAll(${"'"}.sv,[data-tear]${"'"});for(var k=0;k<a.length;k++){a[k].classList.remove('is-in');void a[k].offsetWidth;a[k].classList.add('is-in')}}
 var f=sc.querySelector('[data-focus]');if(f)f.focus({preventScroll:true});}
var THEMES=[null,'light','dark'],TL={null:'시스템 설정',light:'라이트',dark:'다크'};
document.addEventListener('click',function(e){
 var t=e.target;
 var s=t.closest('[data-spoiler-switch]');if(s){sw(s.getAttribute('aria-checked')!=='true');return}
 var rv=t.closest('[data-reveal]');if(rv){reveal(rv.closest('[data-scope]'));return}
 var th=t.closest('[data-theme-toggle]');if(th){var cur=r.getAttribute('data-theme'),i=(THEMES.indexOf(cur)+1)%3,n=THEMES[i];if(n)r.setAttribute('data-theme',n);else r.removeAttribute('data-theme');try{n?localStorage.setItem('ed-theme',n):localStorage.removeItem('ed-theme')}catch(x){}th.setAttribute('aria-label','테마: '+TL[n]+' (눌러서 바꾸기)');return}
 var tab=t.closest('[role=tab]');if(tab){var list=tab.parentNode.querySelectorAll('[role=tab]');for(var j=0;j<list.length;j++){var on=list[j]===tab;list[j].setAttribute('aria-selected',on?'true':'false');list[j].tabIndex=on?0:-1;var p=document.getElementById(list[j].getAttribute('aria-controls'));if(p){p.hidden=!on;if(on&&!reduced()){p.classList.remove('is-in');void p.offsetWidth;p.classList.add('is-in')}}}return}
 var rb=t.closest('.rowbtn');var row=t.closest('.lt-row');
 if(!rb&&row&&!t.closest('a')&&window.matchMedia('(max-width:1023px)').matches)rb=row.querySelector('.rowbtn');
 if(rb){var d=document.getElementById(rb.getAttribute('aria-controls'));var open=rb.getAttribute('aria-expanded')!=='true';rb.setAttribute('aria-expanded',open?'true':'false');d.hidden=!open;rb.closest('tr').classList.toggle('is-open',open);if(open&&!reduced()){d.classList.remove('is-tear');void d.offsetWidth;d.classList.add('is-tear')}}
});
document.addEventListener('keydown',function(e){var tab=e.target.closest&&e.target.closest('[role=tab]');if(!tab)return;var list=[].slice.call(tab.parentNode.querySelectorAll('[role=tab]')),i=list.indexOf(tab),n=-1;
 if(e.key==='ArrowRight')n=(i+1)%list.length;else if(e.key==='ArrowLeft')n=(i-1+list.length)%list.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=list.length-1;if(n<0)return;e.preventDefault();list[n].focus();list[n].click()});
})();`;

function page(c) {
  const d1 = readFileSync(path.resolve(ROOT, "docs/design/d1/concept-mix.html"), "utf8");
  const base = d1.slice(d1.indexOf("<style>") + 7, d1.indexOf("</style>"));
  const m4 = readFileSync(path.resolve(HERE, "m4.css"), "utf8");
  const head = `<!doctype html>
<!--
  M4 미니 시안 ${c.tag} — 「${c.name}」
  한 줄 설명: ${c.one}
  장점: ${c.pros.join(" / ")}
  단점: ${c.cons.join(" / ")}
  구현 난이도: ${c.diff}
  번들/폰트 영향: ${c.bundle}
  범위: FR-37 미확정 3요소(① 순위표 순위 변동 ▲▼ 가림 ② 경기 기준 스코어 행 가림 · 폼 칩 ③ FR-122 RSS 구독 링크 위치 + .ics 관계). 확정분(5줄 줄 · spoiler 카드 띠 · 선수 기록 결과 가림 칸)은 다루지 않는다.
  데이터: data/competitions · data/teams · data/players/korean.json · configs/* 실값(2026-11-02 호). 생성: build/gen.mjs. 외부 의존 0, 폰트는 ../fonts/ 상대 경로, LLM 호출 0.
-->
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>M4 미니 시안 ${c.tag} · ${esc(c.name)} · 유로 다이제스트</title>
<script>(function(){var d=document.documentElement,t,q=location.search,m;try{t=localStorage.getItem('ed-theme')}catch(e){}m=q.match(/theme=(light|dark)/);if(m)t=m[1];if(t==='light'||t==='dark')d.setAttribute('data-theme',t);if(!/spoiler=off/.test(q))d.setAttribute('data-spoiler','on')})();</script>
<style>
${base}
${m4}
${CSS_COMMON_EXTRA}
${CSS[c.key]}
</style>
</head>`;
  const state = `<p class="m4-state" aria-live="polite"><b>결과 가리기</b><span class="on-t">켬 — 빗금 칸이 가린 값이다. 스위치(티켓 오른쪽 아래)를 끄면 확정 화면 그대로 돌아온다.</span><span class="off-t">끔 — D1·D2 확정 화면 그대로(가림 없음). 구독 링크 위치는 켬/끔과 무관하다.</span></p>`;
  const body = `<body>
<a class="skip" href="#main">본문 바로가기</a>
${meta(c)}
${state}
${divider("화면 1 · 대회", "/competitions/laliga/", c.key === "a" ? "순위표 = 변동·최근 5경기만 빗금 + 안내 띠 '변동 보기'(표 하나) · 라운드 = 경기마다 결과 가림 칸 · 375 승점 칸(▾)을 누르면 행 펼침 — 그 안의 최근 경기도 가림" : "순위표 = 봉투 하나로 접음(펼치면 뜯김) · 라운드 = 행마다 빗금 자리 + 묶음 위 '결과 가림 띠' 하나 · 머리에 라리가 RSS(§9.2 보조 버튼)")}
<div class="shell" id="s1">
${masthead("comp")}
${compScreen(c)}
</div>
${divider("화면 2 · 팀", "/teams/atletico-madrid/", c.key === "a" ? "티켓 숫자(순위·승점·득실)는 집계라 보임 · 꼬리표 최근 경기 = 폼 줄 빗금 + '보기' · 지난 경기 = 행마다 결과 가림 칸 · 리그 맥락 보임" : "티켓 숫자(순위·승점·승무패·득실)와 꼬리표 폼을 티켓 한 판으로 가림 · 지난 경기 4행 = 묶음 띠 하나 · 리그 맥락 = 작은 봉투")}
<div class="shell" id="s2">
${compactMast()}
${teamScreen(c)}
</div>
${divider("화면 3 · 홈 위젯", "/ (마주 보는 면)", c.key === "a" ? "오늘 밤 = 스코어를 싣지 않아 그대로(이유 도장도 그대로) · 순위 미니 = 변동만 빗금 + 패널마다 '변동 보기'" : "오늘 밤 = 순위로 계산한 이유 도장('승점 차 · 순위')을 빗금 도장으로 · 순위 미니 = 패널마다 작은 봉투")}
<div class="shell" id="s3">
${homeScreen(c)}
</div>
${divider("화면 4 · 한국 선수 목록 머리 + 뒤표지", "/korean-players/", c.key === "a" ? "목록 머리에는 구독 링크가 없다 — 뒤표지 '구독' 단(RSS 전체 · 대회별 6 · 한국 선수 + 소속팀 .ics)" : "목록 머리에 '한국 선수 소식 RSS' + '.ics 소속팀 경기 구독'(보조 버튼 짝) · 뒤표지는 '구독 모음' 링크 하나")}
<div class="shell" id="s4">
${kpScreen(c)}
${colophon(c)}
</div>
<script>${JS}</script>
</body></html>`;
  return head + "\n" + body;
}
function compactMast() {
  return `<p class="note" style="padding:4px 0 12px">티켓 마스트헤드는 화면 1과 같다(생략) — 스위치 상태는 페이지 전체에 적용된다.</p>`;
}

for (const c of Object.values(CONCEPTS)) {
  writeFileSync(path.join(OUT, `concept-${c.key}.html`), page(c));
  console.log("wrote", path.join(OUT, `concept-${c.key}.html`));
}
