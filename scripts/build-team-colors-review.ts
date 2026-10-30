/**
 * 팀 키트 색·약어·한글 표기 검토 시트 생성 (plan M2-05 — 사용자 검토용, `docs/design/d1/team-colors-review.html`).
 *
 *   npx tsx scripts/build-team-colors-review.ts
 *
 * 입력: docs/design/d1/team-colors-source.json(원색·확신도·출처) · configs/names.ko.json · configs/team-ids.json ·
 * D1 혼합안(docs/design/d1/concept-mix.html)의 D0 토큰 블록. 원본을 고친 뒤 scripts/build-team-colors.ts --write와 함께 돌린다.
 * 외부 의존 없는 단일 정적 HTML(웹폰트는 docs/design/fonts 로컬 파일만)을 쓴다 — 키트 색만 데이터, 나머지는 토큰.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NamesKoFileSchema, TeamIdsFileSchema } from "@/lib/schema";

import { contrastRatio } from "@/lib/kit-contrast";
import {
  buildTeamColorRows,
  TEAM_COLORS_SOURCE_PATH,
  TeamColorSourceFileSchema,
  type TeamColorBuildRow,
} from "./lib/team-colors";
import { TEAM_LEAGUES, UCL_TEAMS } from "./lib/team-leagues";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rj = (p: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));
const source = TeamColorSourceFileSchema.parse(rj(TEAM_COLORS_SOURCE_PATH));
const names = NamesKoFileSchema.parse(rj("configs/names.ko.json"));
const ids = TeamIdsFileSchema.parse(rj("configs/team-ids.json"));
const rows = buildTeamColorRows(source);
const bySlug = new Map(rows.map((r) => [r.slug, r]));
const teamName = new Map(
  names.entries.filter((e) => e.kind === "team").map((e) => [e.slug!, e]),
);

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const nameConf = (note: string): string =>
  /^(확실|관용|통칭|확정|추정)/.exec(note)?.[1] ?? "?";
/** 이번 초안에서 표기를 새로 정한 팀(초안 확신도 추정 → 2026-10-30 사용자 확정 — 근거 표시용) */
const NAME_DRAFT = new Set(["viking"]);
const NAME_TOUCHED = new Map<string, string>([
  ["aek-athens", "별칭 +'AEK Athens FC'"],
  ["troyes", "별칭 +'Estac Troyes'"],
  ["malaga", "별칭 +'Malaga'"],
  ["deportivo-la-coruna", "별칭 +'Deportivo La Coruna'"],
  ["viking", "새 항목(2026-10-30 사용자 확정)"],
]);

/** note에서 근거 부분(영문 별칭 설명 앞) */
const basisOf = (note: string): string => {
  const cut = note.split(" · 영문")[0]!;
  return cut.length > 150 ? `${cut.slice(0, 148)}…` : cut;
};
const fdAf = (slug: string): { fd: string; af: string } => {
  const n = ids[slug]?.note ?? "";
  return {
    fd: /fd "([^"]+)"/.exec(n)?.[1] ?? "",
    af: /af "([^"]+)"/.exec(n)?.[1] ?? "",
  };
};

const badge = (
  shirt: string,
  bottom: string,
  text: string,
  short: string,
  size = "m",
): string =>
  `<span class="bdg bdg--${size}" style="--k1:${shirt};--k2:${bottom};--kf:${text}" aria-hidden="true"><b>${esc(short)}</b></span>`;

const sw = (hex: string, label?: string): string =>
  `<span class="sw"><i style="--c:${hex}" aria-hidden="true"></i><code>${hex}</code>${label ? ` <em>${label}</em>` : ""}</span>`;

const dupShorts = (() => {
  const m = new Map<string, string[]>();
  for (const r of rows)
    m.set(r.source.short, [...(m.get(r.source.short) ?? []), r.slug]);
  return new Map([...m].filter(([, v]) => v.length > 1));
})();

function row(r: TeamColorBuildRow, ucl: boolean): string {
  const e = teamName.get(r.slug)!;
  const { fd, af } = fdAf(r.slug);
  const s = r.shirt;
  const est = r.source.confidence === "추정";
  const nconf = nameConf(e.note ?? "");
  const nameDraft = NAME_DRAFT.has(r.slug);
  const shortDiff = r.source.short !== r.source.tla.trim();
  const dup = dupShorts.get(r.source.short);
  const cls = [
    "tr",
    s.corrected ? "is-fix" : "",
    est ? "is-est" : "",
    nameDraft ? "is-name" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const flags = [
    s.corrected
      ? `<span class="tag tag--fix">보정 f ${s.factor.toFixed(2)}</span>`
      : "",
    est ? `<span class="tag tag--est">색 추정</span>` : "",
    nameDraft ? `<span class="tag tag--est">표기 새로 정함</span>` : "",
    shortDiff ? `<span class="tag tag--est">약어 예외</span>` : "",
    dup ? `<span class="tag">약어 충돌 · 이름 병기</span>` : "",
    ucl ? `<span class="tag">UCL</span>` : "",
  ].join("");
  const enAll = [...new Set([fd, af, ...e.en])].filter(Boolean);
  return `<li class="${cls}" data-fix="${s.corrected ? 1 : 0}" data-est="${est || nameDraft || shortDiff ? 1 : 0}">
  <div class="tr__b">${badge(s.shirt, r.bottom, s.text, r.source.short)}</div>
  <div class="tr__n"><h3>${esc(e.ko)}</h3><p class="en">${enAll.map(esc).join(" · ")}</p>${flags ? `<p class="flags">${flags}</p>` : ""}</div>
  <div class="tr__c">
    <p class="ln"><span class="k">상의</span>${s.corrected ? `${sw(s.original)}<span class="arr" aria-label="보정">→</span>${sw(s.shirt)}` : sw(s.shirt)}</p>
    <p class="ln"><span class="k">하의</span>${sw(r.bottom)}</p>
    <p class="ln"><span class="k">대비</span><span class="n">${s.corrected ? `${s.originalContrast.toFixed(2)} → <b>${s.contrast.toFixed(2)}</b>` : `<b>${s.contrast.toFixed(2)}</b>`}</span> <span class="mut">글자 ${s.text === "#FFFFFF" ? "흰색" : "남색 #14213D"}</span></p>
  </div>
  <div class="tr__s">
    <p class="ln"><span class="k">약어</span><code class="n">${esc(r.source.short)}</code>${shortDiff ? ` <span class="mut">tla <code>"${esc(r.source.tla)}"</code> — ${esc(r.source.shortBasis ?? "")}</span>` : ` <span class="mut">= tla</span>`}</p>
    <p class="ln"><span class="k">키트</span><span>${esc(r.source.kitNote)}</span></p>
    <p class="ln"><span class="k">출처</span><span class="mut"><b class="cf${est ? " cf--est" : ""}">${r.source.confidence}</b> ${esc(r.source.source)}${r.source.fdClubColors ? ` · fd "${esc(r.source.fdClubColors)}"` : ""}</span></p>
    <p class="ln"><span class="k">표기</span><span class="mut"><b class="cf${nconf === "추정" ? " cf--est" : ""}">${nconf}</b> ${esc(basisOf(e.note ?? "").replace(/^(확실|관용|통칭|확정|추정)(\([^)]*\))?\s*—\s*/, ""))}${NAME_TOUCHED.has(r.slug) ? ` <b class="chg">${esc(NAME_TOUCHED.get(r.slug)!)}</b>` : ""}</span></p>
  </div>
</li>`;
}

const GROUPS: Array<[string, string, string, string[]]> = [
  ["epl", "프리미어리그", "EPL", [...TEAM_LEAGUES.EPL]],
  ["laliga", "라리가", "LALIGA", [...TEAM_LEAGUES.LALIGA]],
  ["seriea", "세리에 A", "SERIEA", [...TEAM_LEAGUES.SERIEA]],
  ["bundesliga", "분데스리가", "BUNDESLIGA", [...TEAM_LEAGUES.BUNDESLIGA]],
  ["ligue1", "리그 1", "LIGUE1", [...TEAM_LEAGUES.LIGUE1]],
];
const inLeague = new Set(GROUPS.flatMap((g) => g[3]));
GROUPS.push([
  "ucl",
  "챔피언스리그 — 5대 리그 밖",
  "UCL",
  UCL_TEAMS.filter((s) => !inLeague.has(s)),
]);

const uclSet = new Set(UCL_TEAMS);
const sections = GROUPS.map(([id, label, code, slugs]) => {
  const rs = slugs.map((s) => bySlug.get(s)!);
  const fix = rs.filter((r) => r.shirt.corrected).length;
  const est = rs.filter((r) => r.source.confidence === "추정").length;
  return `<section class="comp" id="${id}" aria-labelledby="h-${id}" style="--cc:var(--competition-${id})">
  <header class="comp__h"><span class="comp__tab" aria-hidden="true">${code}</span><h2 id="h-${id}">${label}</h2><p class="comp__m n">${rs.length}팀 · 보정 ${fix} · 색 추정 ${est}</p></header>
  <ul class="tl">${rs.map((r) => row(r, id !== "ucl" && uclSet.has(r.slug))).join("\n")}</ul>
</section>`;
}).join("\n");

const fixN = rows.filter((r) => r.shirt.corrected).length;
const estN = rows.filter((r) => r.source.confidence === "추정").length;
const minC = rows.reduce((a, r) =>
  r.shirt.contrast < a.shirt.contrast ? r : a,
);
const minF = rows.reduce((a, r) => (r.shirt.factor < a.shirt.factor ? r : a));
const navyN = rows.filter((r) => r.shirt.text !== "#FFFFFF").length;
const ko = (slug: string): string => teamName.get(slug)!.ko;
const dupText = [...dupShorts]
  .map(([k, v]) => `<code>${k}</code> ${v.map(ko).join("·")}`)
  .join(" / ");

// 토큰 쌍 대비(시트 자체 점검용)
const L = { paper: "#F3F0EA", ink: "#14213D", ink2: "#4A5670" };
const Dk = { paper: "#0E1626", ink: "#F2EFE8", ink2: "#ABA698" };
const selfCheck = `ink-2/paper 라이트 ${contrastRatio(L.ink2, L.paper).toFixed(2)} · 다크 ${contrastRatio(Dk.ink2, Dk.paper).toFixed(2)}`;

const tokens = readFileSync(
  path.join(ROOT, "docs/design/d1/concept-mix.html"),
  "utf8",
);
const tokenBlock = tokens.slice(
  tokens.indexOf(":root{"),
  tokens.indexOf("@media (min-width:1024px){:root{"),
);

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>팀 키트 색 검토</title>
<!--
  M2-05 팀 키트 색·약어·한글 표기 검토 시트 (2026-10-30 초안 → 같은 날 사용자 승인). 외부 의존 없음, 웹폰트는 docs/design/fonts 로컬 파일만.
  데이터: docs/design/d1/team-colors-source.json(원색·확신도·출처) → scripts/build-team-colors.ts → configs/team-colors.json(보정 값)
  · configs/names.ko.json(한글 표기·별칭) · configs/team-ids.json(fd·af 원문 이름). 색·간격은 D0 토큰(concept-mix와 같은 값), 키트 색만 데이터.
  보정 규칙: PRD §15 D62 ④ — scripts/lib/kit-contrast.ts. 이 파일은 생성물이다(scripts/build-team-colors-review.ts) — 고칠 것은 원본 JSON에.
-->
<script>(function(){var d=document.documentElement,t;try{t=localStorage.getItem('ed-theme')}catch(e){}if(t==='light'||t==='dark')d.setAttribute('data-theme',t)})();</script>
<style>
@font-face{font-family:"EuroDigest Sans";src:url("../fonts/pretendard/eurodigest-sans-400.ksx.woff2") format("woff2");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"EuroDigest Sans";src:url("../fonts/pretendard/eurodigest-sans-800.ksx.woff2") format("woff2");font-weight:800;font-style:normal;font-display:swap}
@font-face{font-family:"Barlow Condensed";src:url("../fonts/barlow-condensed/BarlowCondensed-SemiBold.latin.woff2") format("woff2");font-weight:600;font-style:normal;font-display:swap}
@font-face{font-family:"Barlow Condensed";src:url("../fonts/barlow-condensed/BarlowCondensed-ExtraBold.latin.woff2") format("woff2");font-weight:800;font-style:normal;font-display:swap}
${tokenBlock}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--font-sans);font-size:15px;line-height:1.5;word-break:keep-all;overflow-wrap:anywhere;font-synthesis:none;-webkit-font-smoothing:antialiased}
h1,h2,h3,p,ul{margin:0}ul{padding:0;list-style:none}
button{font:inherit;color:inherit;cursor:pointer}
code{font-family:var(--font-numeric);font-weight:600;letter-spacing:.02em}
.n,code{font-variant-numeric:tabular-nums lining-nums}
:focus-visible{outline:3px solid var(--ring);outline-offset:2px}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
.wrap{max-width:var(--container);margin:0 auto;padding:0 var(--edge)}
@media (min-width:1024px){.wrap{padding:0 40px}}

/* 머리 — 티켓 스텁 */
.mast{border-bottom:3px double var(--ink);padding:var(--space-5) 0 var(--space-4)}
.mast__top{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-4)}
.kick{font:600 12px/1 var(--font-numeric);letter-spacing:.14em;color:var(--ink-2);text-transform:uppercase}
.mast h1{font-weight:800;font-size:26px;line-height:1.15;letter-spacing:-.01em;margin-top:var(--space-2)}
.mast__lead{color:var(--ink-2);font-size:14px;margin-top:var(--space-2);max-width:62ch}
.ibtn{display:inline-grid;place-items:center;min-width:44px;min-height:44px;border:1px solid var(--ink-2);background:transparent;padding:0 12px;font-size:13px;font-weight:800}
.ibtn:hover{background:var(--paper-2)}
@media (min-width:1024px){.mast h1{font-size:40px}}

/* 요약 수치 */
.sum{display:grid;grid-template-columns:repeat(2,1fr);border-bottom:1px solid var(--rule)}
.sum div{padding:var(--space-3) 0;border-top:1px solid var(--rule)}
.sum div:nth-child(odd){padding-right:var(--space-3);border-right:1px solid var(--rule)}
.sum div:nth-child(even){padding-left:var(--space-3)}
.sum dt{font-size:12px;color:var(--ink-2);font-weight:800}
.sum dd{margin:2px 0 0;font:800 30px/1 var(--font-numeric)}
.sum dd small{font:400 12px/1.3 var(--font-sans);color:var(--ink-2);display:block;margin-top:4px}
@media (min-width:1024px){.sum{grid-template-columns:repeat(6,1fr)}.sum div,.sum div:nth-child(odd),.sum div:nth-child(even){padding:var(--space-4) var(--space-4) var(--space-4) 0;border-right:1px solid var(--rule);border-top:0}.sum div+div{padding-left:var(--space-4)}.sum div:last-child{border-right:0}.sum dd{font-size:40px}}

.notes{display:grid;gap:var(--space-4);padding:var(--space-5) 0;border-bottom:1px solid var(--rule);font-size:13.5px;color:var(--ink-2)}
.notes h2{font-size:13px;font-weight:800;color:var(--ink);margin-bottom:4px}
.notes li{position:relative;padding-left:12px}.notes li::before{content:"";position:absolute;left:0;top:.75em;width:6px;height:1px;background:var(--ink-2)}
.notes b{color:var(--ink)}
.legend{display:flex;flex-wrap:wrap;gap:var(--space-3) var(--space-5);align-items:center}
.legend span.l{display:inline-flex;align-items:center;gap:8px;font-size:13px}
@media (min-width:1024px){.notes{grid-template-columns:1.1fr 1fr 1fr;gap:var(--space-6)}}

/* 필터 */
.filt{position:sticky;top:0;z-index:5;background:var(--paper);border-bottom:1px solid var(--rule);display:flex;gap:var(--space-2);padding:var(--space-2) 0;overflow-x:auto}
.filt button{min-height:44px;padding:0 14px;border:1px solid var(--ink-2);background:transparent;font-size:13.5px;font-weight:800;white-space:nowrap}
.filt button[aria-pressed="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.filt a{display:inline-grid;place-items:center;min-height:44px;min-width:44px;padding:0 10px;font:600 14px/1 var(--font-numeric);letter-spacing:.06em;color:var(--ink-2);text-decoration:none;white-space:nowrap}
.filt a:hover{color:var(--ink)}
.filt .sep{flex:none;width:1px;background:var(--rule);margin:6px 4px}

/* 배지 — D1 혼합안과 같은 규칙 */
.bdg{position:relative;display:inline-grid;grid-template-rows:3fr 2fr;flex:none;background:var(--k2);outline:1px solid var(--rule);outline-offset:-1px;vertical-align:middle}
.bdg b{grid-row:1;display:grid;place-items:center;background:var(--k1);color:var(--kf);font-family:var(--font-numeric);font-weight:800;font-variant-numeric:tabular-nums lining-nums;letter-spacing:.04em;line-height:1}
.bdg--m{width:40px;height:44px}.bdg--m b{font-size:15px}
.bdg--s{width:30px;height:33px}.bdg--s b{font-size:12px;letter-spacing:.02em}
.bdg--none{background:transparent;outline:1px dashed var(--ink-2)}
.bdg--none b{background:transparent;color:var(--ink-2);border-bottom:1px dashed var(--ink-2)}
.bdg--none::after{content:"";grid-row:2;background:repeating-linear-gradient(-45deg,var(--hatch) 0 3px,transparent 3px 6px)}

/* 대회 절 */
.comp{padding-top:var(--space-6)}
.comp__h{display:flex;align-items:baseline;gap:var(--space-3);border-bottom:2px solid var(--ink);padding-bottom:var(--space-2);flex-wrap:wrap}
.comp__tab{align-self:center;font:800 12px/1 var(--font-numeric);letter-spacing:.1em;background:var(--cc);color:var(--competition-foreground);padding:5px 7px 4px}
.comp h2{font-size:21px;font-weight:800}
.comp__m{margin-left:auto;font:600 14px/1 var(--font-numeric);letter-spacing:.04em;color:var(--ink-2)}

/* 팀 행 */
.tr{position:relative;display:grid;grid-template-columns:40px 1fr;grid-template-areas:"b n" "c c" "s s";gap:var(--space-2) var(--space-3);padding:var(--space-4) 0 var(--space-4) var(--space-3);border-bottom:1px solid var(--rule)}
.tr::before{content:"";position:absolute;left:0;top:var(--space-4);bottom:var(--space-4);width:3px;background:transparent}
.tr.is-fix::before{background:var(--brand-accent)}
.tr.is-est:not(.is-fix)::before{background:repeating-linear-gradient(180deg,var(--ink-2) 0 5px,transparent 5px 9px)}
.tr__b{grid-area:b}.tr__n{grid-area:n;min-width:0}.tr__c{grid-area:c}.tr__s{grid-area:s}
.tr h3{font-size:17px;font-weight:800;line-height:1.25}
.en{font-size:12.5px;color:var(--ink-2);margin-top:2px}
.flags{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.tag{font-size:11.5px;font-weight:800;line-height:1;padding:4px 6px;border:1px solid var(--ink-2);color:var(--ink-2)}
.tag--fix{background:var(--brand-accent);border-color:var(--brand-accent);color:var(--brand-accent-foreground)}
.tag--est{border-style:dashed;color:var(--ink)}
.ln{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;font-size:13px;line-height:1.45}
.ln+.ln{margin-top:3px}
.k{flex:none;width:30px;font-size:11.5px;font-weight:800;color:var(--ink-2)}
.ln>span:not(.k){flex:1 1 0;min-width:0}
.tr__c .ln>span:not(.k),.tr__c .ln>.sw{flex:none}
.mut{color:var(--ink-2)}
.sw{display:inline-flex;align-items:center;gap:5px}
.sw i{display:inline-block;width:14px;height:14px;background:var(--c);outline:1px solid var(--rule);outline-offset:-1px}
.sw code{font-size:14px}
.sw em{font-style:normal;color:var(--ink-2);font-size:12px}
.arr{color:var(--brand-accent-text);font-weight:800}
.tr__c b{font:800 15px/1 var(--font-numeric)}
.cf{font-weight:800;color:var(--ink)}
.cf--est{border-bottom:1px dashed var(--ink)}
.chg{font-weight:800;color:var(--brand-accent-text)}
@media (min-width:1024px){
  .tl{display:block}
  .tr{grid-template-columns:40px minmax(180px,1.1fr) minmax(250px,1.15fr) 2fr;grid-template-areas:"b n c s";gap:0 var(--space-5);align-items:start;padding:var(--space-3) 0 var(--space-3) var(--space-3)}
  .tr::before{top:var(--space-3);bottom:var(--space-3)}
}
.tr[hidden]{display:none}
.foot{padding:var(--space-7) 0 var(--space-8);color:var(--ink-2);font-size:12.5px}
</style>
</head>
<body>
<div class="wrap">
<header class="mast">
  <div class="mast__top">
    <div>
      <p class="kick">M2-05 · 2026-10-30 · 사용자 승인</p>
      <h1>팀 키트 색 · 약어 · 한글 표기</h1>
    </div>
    <button class="ibtn" type="button" data-theme-toggle aria-label="테마 바꾸기 (현재: 시스템 설정)">테마</button>
  </div>
  <p class="mast__lead">6개 대회 ${rows.length}팀의 배지(상의 3/5 + 약어, 하의 2/5)를 실제 크기 40×44로 그렸다. 상의 색은 D62 ④ 대비 보정 뒤 값이고, 원색과 보정 값·비율 f·약어 글자 대비를 함께 적었다. <b>왼쪽 레드 띠 = 보정한 팀</b>, <b>점선 띠 = 추정(색·표기·약어) 포함</b>.</p>
</header>

<dl class="sum">
  <div><dt>팀</dt><dd class="n">${rows.length}<small>5대 리그 96 + UCL 밖 15</small></dd></div>
  <div><dt>보정</dt><dd class="n">${fixN}<small>최저 f ${minF.shirt.factor.toFixed(2)} ${ko(minF.slug)}</small></dd></div>
  <div><dt>색 추정</dt><dd class="n">${estN}<small>확실 ${rows.length - estN}</small></dd></div>
  <div><dt>최저 대비</dt><dd class="n">${minC.shirt.contrast.toFixed(2)}<small>${ko(minC.slug)} · 하한 5.3</small></dd></div>
  <div><dt>약어 예외</dt><dd class="n">2<small>보되/글림트 FK→BOD · 스트라스부르 "RC "→STR</small></dd></div>
  <div><dt>약어 충돌</dt><dd class="n">${dupShorts.size}<small>${[...dupShorts].map(([k]) => k).join(" · ")} — 한글 팀명 병기</small></dd></div>
</dl>

<div class="notes">
  <div>
    <h2>규칙 (PRD §15 D62 ②④)</h2>
    <ul>
      <li>글자색 = <code>#FFFFFF</code>·<code>#14213D</code> 중 상의와 대비가 큰 쪽 (남색 글자 ${navyN}팀)</li>
      <li>대비 &lt; 5.3이면 상의 R·G·B × f (1.00에서 0.02씩, 채널 반올림) — 흰 글자 5.3 이상 되는 첫 f. 하의는 원색 그대로</li>
      <li>약어 충돌 ${dupText}은 약어를 바꾸지 않고 이름으로 구분</li>
    </ul>
  </div>
  <div>
    <h2>확신도·출처</h2>
    <ul>
      <li><b>확실</b> — 색 계열에 이견이 없고 널리 인용되는 브랜드 hex(D1 시안값 포함). 구단 원문은 이번에 다시 조회하지 않았다</li>
      <li><b>추정</b> — football-data clubColors·키트 색 계열에 맞춘 근사 hex이거나 키트 배치(어느 색이 상의인지)가 불확실</li>
      <li>표기: 확실·관용·통칭·확정 = 기존 사전 근거, <b>추정</b> = 이번 초안 확신도(사용자 확정 뒤에도 근거로 남김)</li>
    </ul>
  </div>
  <div>
    <h2>배지 견본</h2>
    <div class="legend">
      <span class="l">${badge("#D70106", "#FFFFFF", "#FFFFFF", "ARS")} 보정 뒤</span>
      <span class="l">${badge("#EF0107", "#FFFFFF", "#FFFFFF", "ARS")} 원색 4.49</span>
      <span class="l"><span class="bdg bdg--m bdg--none" aria-hidden="true"><b>XXX</b></span> 폴백(색 없음)</span>
    </div>
    <p style="margin-top:8px">폴백 배지는 team-colors.json에 없는 팀만 쓴다 — 지금은 111팀 모두 색이 있어 쓰이지 않는다.</p>
  </div>
</div>

<nav class="filt" aria-label="보기">
  <button type="button" data-f="all" aria-pressed="true">전체 ${rows.length}</button>
  <button type="button" data-f="fix" aria-pressed="false">보정 ${fixN}</button>
  <button type="button" data-f="est" aria-pressed="false">추정 포함 ${rows.filter((r) => r.source.confidence === "추정" || NAME_DRAFT.has(r.slug) || r.source.short !== r.source.tla.trim()).length}</button>
  <span class="sep" aria-hidden="true"></span>
  ${GROUPS.map(([id, , code]) => `<a href="#${id}">${code}</a>`).join("")}
</nav>

${sections}

<p class="foot">점검: ${selfCheck} (D0 토큰 쌍 — 시트 글자) · 키트 글자 대비는 모두 테마 무관. 수정은 <code>docs/design/d1/team-colors-source.json</code>(색·약어)·<code>configs/names.ko.json</code>(표기)에 하고 <code>npx tsx scripts/build-team-colors.ts --write</code>로 다시 만든다.</p>
</div>
<script>
(function(){
  var d=document.documentElement,L={system:'시스템 설정',light:'라이트',dark:'다크'};
  function cur(){return d.getAttribute('data-theme')||'system'}
  var b=document.querySelector('[data-theme-toggle]');
  b.addEventListener('click',function(){var o=['system','light','dark'],nx=o[(o.indexOf(cur())+1)%3];if(nx==='system')d.removeAttribute('data-theme');else d.setAttribute('data-theme',nx);try{if(nx==='system')localStorage.removeItem('ed-theme');else localStorage.setItem('ed-theme',nx)}catch(e){}b.setAttribute('aria-label','테마 바꾸기 (현재: '+L[nx]+')')});
  var btns=document.querySelectorAll('[data-f]'),rows=document.querySelectorAll('.tr');
  btns.forEach(function(x){x.addEventListener('click',function(){var f=x.getAttribute('data-f');btns.forEach(function(y){y.setAttribute('aria-pressed',String(y===x))});rows.forEach(function(r){r.hidden=f==='fix'?r.getAttribute('data-fix')!=='1':f==='est'?r.getAttribute('data-est')!=='1':false})})});
})();
</script>
</body>
</html>
`;
writeFileSync(path.join(ROOT, "docs/design/d1/team-colors-review.html"), html);
console.log(
  `[build-team-colors-review] docs/design/d1/team-colors-review.html (${html.length}자)`,
);
