// D2 시안 B 시즌권 — CSS (D0·D1 토큰 그대로, 새 색 토큰 0 · 새 폰트 0)
const LIGHT = `
  --paper:#F3F0EA;--paper-2:#E8E4DB;--paper-3:#E1DFDC;
  --ink:#14213D;--ink-2:#4A5670;--ink-3:#727886;--ink-disabled:#727886;--rule:#CFCFCE;--hatch:#DFDDDA;
  --brand-accent:#B32F25;--brand-accent-text:#A92B22;--brand-accent-foreground:#F3F0EA;
  --ticket:#14213D;--ticket-fg:#F3F0EA;--ticket-fg-2:#C2C2C4;
  --colophon:#14213D;--colophon-fg:#F3F0EA;--colophon-fg-2:#C2C2C4;
  --ring:#A92B22;
  --competition-epl:#3D1E5C;--competition-laliga:#7F5300;--competition-seriea:#0A6390;
  --competition-bundesliga:#A8122B;--competition-ligue1:#2A7035;--competition-ucl:#4A5263;
  --competition-foreground:#F3F0EA;
  --result-win:#1F6B45;--result-draw:#4A5670;--result-loss:#A92B22;--trend-up:#1F6B45;--trend-down:#A92B22;
  --transfer-progress:#14213D;--transfer-official:#B32F25;--transfer-collapsed:#4A5670;
  --tier-1:#14213D;--tier-2:#14213D;--tier-3:#4A5670;`;
const DARK = `
  --paper:#0E1626;--paper-2:#16213A;--paper-3:#232A37;
  --ink:#F2EFE8;--ink-2:#ABA698;--ink-3:#75787D;--ink-disabled:#75787D;--rule:#323945;--hatch:#202736;
  --brand-accent:#FF7A6E;--brand-accent-text:#FF7A6E;--brand-accent-foreground:#0E1626;
  --ticket:#9E2F28;--ticket-fg:#F2EFE8;--ticket-fg-2:#EADCD5;
  --colophon:#16213A;--colophon-fg:#F2EFE8;--colophon-fg-2:#ABA698;
  --ring:#FF7A6E;
  --competition-epl:#C7A8F2;--competition-laliga:#F2C14E;--competition-seriea:#6CC6F2;
  --competition-bundesliga:#F45D7D;--competition-ligue1:#8FD18A;--competition-ucl:#C5CBD8;
  --competition-foreground:#0E1626;
  --result-win:#7FD3A4;--result-draw:#ABA698;--result-loss:#FF7A6E;--trend-up:#7FD3A4;--trend-down:#FF7A6E;
  --transfer-progress:#F2EFE8;--transfer-official:#FF7A6E;--transfer-collapsed:#ABA698;
  --tier-1:#F2EFE8;--tier-2:#F2EFE8;--tier-3:#ABA698;`;

export const CSS = `
@font-face{font-family:"EuroDigest Sans";src:url("../fonts/pretendard/eurodigest-sans-400.ksx.woff2") format("woff2");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"EuroDigest Sans";src:url("../fonts/pretendard/eurodigest-sans-800.ksx.woff2") format("woff2");font-weight:800;font-style:normal;font-display:swap}
@font-face{font-family:"Barlow Condensed";src:url("../fonts/barlow-condensed/BarlowCondensed-SemiBold.latin.woff2") format("woff2");font-weight:600;font-style:normal;font-display:swap}
@font-face{font-family:"Barlow Condensed";src:url("../fonts/barlow-condensed/BarlowCondensed-ExtraBold.latin.woff2") format("woff2");font-weight:800;font-style:normal;font-display:swap}
:root{color-scheme:light;${LIGHT}
  --font-sans:"EuroDigest Sans",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji";
  --font-numeric:"Barlow Condensed","EuroDigest Sans",-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  --font-latin:"Barlow Condensed","EuroDigest Sans",-apple-system,"Apple SD Gothic Neo",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji";
  --space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:24px;--space-6:32px;--space-7:48px;--space-8:64px;
  --radius:0px;--notch:10px;--perf:3.2px;
  --shadow-print:4px 4px 0 var(--ink);--shadow-print-accent:4px 4px 0 var(--brand-accent);--shadow-none:none;
  --duration-fast:150ms;--duration-base:200ms;--duration-slow:250ms;--ease:cubic-bezier(.2,.8,.2,1);
  --gutter:40px;--tab-w:18px;--edge:16px;--col-contents:232px;--col-facing:296px;--container:1280px;
  --text-wordmark:30px;--lh-wordmark:1.1;--text-h2:21px;--lh-h2:1.3;--text-card:16.5px;--lh-card:1.45;--text-card-latin:21px;--lh-card-latin:1.14;--text-tag:13px;--text-stamp:11.5px;--text-meta:13px;--text-rh:12.5px;--num-issue:40px;--num-card-no:14px;--num-meta:14.5px;
  /* B 컴포넌트 보조 크기(토큰 아님 — DESIGN §3.4 방식) */
  --stub-w:64px;--big:40px;
}
[data-theme="dark"]{color-scheme:dark;${DARK}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;${DARK}}}
@media (min-width:1024px){:root{--text-wordmark:52px;--text-h2:24px;--text-card:18px;--text-card-latin:23px;--lh-card-latin:1.13;--num-issue:88px;--num-card-no:15px;--tab-w:22px;--gutter:64px;--stub-w:76px;--big:44px}}

*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--font-sans);font-size:16px;line-height:1.55;word-break:keep-all;overflow-wrap:anywhere;font-synthesis:none;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;transition:background-color var(--duration-base) var(--ease),color var(--duration-base) var(--ease)}
h1,h2,h3,h4,p,ul,ol,dl,dd,figure,table{margin:0}
ul,ol{padding:0;list-style:none}
a{color:inherit}
button{font:inherit;color:inherit;cursor:pointer}
input{font:inherit;color:inherit}
table{border-collapse:collapse;border-spacing:0}
th{font-weight:inherit;text-align:inherit}
.n,time,.c{font-variant-numeric:tabular-nums lining-nums}
.sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
:focus-visible{outline:3px solid var(--ring);outline-offset:2px}
.skip{position:absolute;left:8px;top:-80px;z-index:30;background:var(--ink);color:var(--paper);padding:12px 16px;font-weight:800;text-decoration:none;box-shadow:0 0 0 7px var(--paper)}
.skip:focus{top:8px}
.ic{display:block;flex:none}
[lang="en"],[lang="it"],[lang="es"]{word-break:normal}
.hit{position:relative}
.hit::after{content:"";position:absolute;left:-6px;right:-6px;top:50%;height:44px;transform:translateY(-50%)}
.nobr{white-space:nowrap}
[hidden]{display:none!important}
.is-in{animation:stamp var(--duration-fast) var(--ease) both}

/* 시안 메타 띠 · 구역 목차 (문서용) */
.meta{background:var(--paper-2);border-bottom:1px solid var(--rule);font-size:13px;line-height:1.55}
.meta summary{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;max-width:1280px;margin:0 auto;padding:12px var(--edge);cursor:pointer;list-style:none;min-height:44px}
.meta summary::-webkit-details-marker{display:none}
.meta summary b{font-size:15px;font-weight:800}
.meta__tag{font:600 12px/1 var(--font-numeric);letter-spacing:.12em;border:1px solid var(--ink-2);padding:4px 6px 3px;color:var(--ink-2)}
.meta__one{color:var(--ink-2)}
.meta__more{margin-left:auto;font-weight:800;color:var(--ink);text-decoration:underline;text-underline-offset:3px}
.meta__more::before{content:"펼치기"}
.meta[open] .meta__more::before{content:"접기"}
.meta__grid{display:grid;gap:12px 32px;max-width:1280px;margin:0 auto;padding:0 var(--edge) 16px}
.meta .meta__h{font-size:12px;font-weight:800;margin:8px 0 2px;color:var(--ink)}
.meta li{padding-left:12px;position:relative;color:var(--ink-2)}
.meta li::before{content:"";position:absolute;left:0;top:.7em;width:5px;height:1px;background:var(--ink-2)}
.meta p{color:var(--ink-2)}
.meta p b,.meta li b{color:var(--ink)}
.axes{width:100%;font-size:12.5px}
.axes th,.axes td{border-bottom:1px solid var(--rule);padding:5px 8px 5px 0;vertical-align:top;text-align:left}
.axes thead th{font-weight:800;border-bottom:1px solid var(--ink);color:var(--ink)}
.axes td{color:var(--ink-2)}
.axes td.me{color:var(--ink);font-weight:800}
@media (min-width:1024px){.meta summary{padding:12px 32px}.meta__grid{grid-template-columns:1fr 1fr 1fr;padding:0 32px 18px}.meta__grid>.span3{grid-column:1/-1}}
@media (max-width:1023px){.meta:not([open]) .meta__one{display:none}}
.toc{border-bottom:1px solid var(--rule);background:var(--paper)}
.toc ol{display:flex;gap:6px;max-width:1280px;margin:0 auto;padding:6px var(--edge);overflow-x:auto;scrollbar-width:none;scroll-snap-type:x proximity}
.toc ol::-webkit-scrollbar{display:none}
.toc li{flex:none;scroll-snap-align:start}
.toc a{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 10px;border:1px solid var(--ink-2);font-size:13px;font-weight:800;text-decoration:none;white-space:nowrap}
.toc a:hover{border-color:var(--ink)}
.toc a b{font:800 15px/1 var(--font-numeric);color:var(--brand-accent-text)}
@media (min-width:1024px){.toc ol{padding:8px 32px;flex-wrap:wrap}}

.divider{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:4px 16px;max-width:1280px;margin:0 auto;padding:10px var(--edge);font-size:12px;color:var(--ink-2);border-bottom:1px solid var(--rule)}
.divider b{font-weight:800;color:var(--ink)}
.divider code{font:600 13px/1 var(--font-numeric);letter-spacing:.02em;color:var(--ink)}
.divider--screen{border-top:3px double var(--ink);margin-top:64px;padding-top:14px}
.divider--first{margin-top:0;border-top:0}
@media (min-width:1024px){.divider{padding:10px 32px}}
@media (max-width:1023px){.divider__info{flex-basis:100%}}

.shell{max-width:1280px;margin:0 auto;padding:12px var(--edge) 0}
@media (min-width:1024px){.shell{padding:24px 32px 0;--edge:32px}}

/* 마스트헤드 = 티켓 (D0 셸 — 검색 버튼 숨김 해제) */
.ticket{--ring:var(--ticket-fg);position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"brand brand tools" "perf perf perf" "issue stub stub";background:var(--ticket);color:var(--ticket-fg);transition:background-color var(--duration-base) var(--ease)}
.ticket__brand{grid-area:brand;padding:16px 0 14px 18px;min-width:0}
.wordmark{font-size:var(--text-wordmark);font-weight:800;line-height:var(--lh-wordmark);letter-spacing:-.045em}
.wordmark a{display:inline-block;padding:6px 0;margin:-6px 0;text-decoration:none}
.wordmark-en{font:800 12px/1 var(--font-numeric);letter-spacing:.32em;margin-top:8px;color:var(--ticket-fg-2)}
.tagline{font-size:13px;line-height:1.45;margin-top:10px;color:var(--ticket-fg-2)}
.ticket__tools{grid-area:tools;display:flex;align-items:flex-start;gap:4px;padding:6px 6px 0 0}
.ibtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-width:44px;height:44px;padding:0 10px;background:transparent;border:0;color:inherit;transition:background-color var(--duration-fast) var(--ease)}
.ibtn:hover{background:color-mix(in srgb,currentColor 12%,transparent)}
.search__t,.search kbd{display:none}
kbd{font:600 13px/1 var(--font-numeric);font-variant-numeric:tabular-nums lining-nums;border:1px solid currentColor;padding:3px 6px 2px}
.search kbd{border-color:var(--ticket-fg-2);color:var(--ticket-fg-2)}
.ticket__perf{grid-area:perf;position:relative;height:4px;margin:0 14px;background-image:radial-gradient(circle at 2px 2px,var(--paper) 1.6px,transparent 2.1px);background-size:9px 4px;background-repeat:repeat-x}
.ticket__perf::before,.ticket__perf::after{content:"";position:absolute;top:50%;width:calc(var(--notch)*2);height:calc(var(--notch)*2);margin-top:calc(var(--notch)*-1);border-radius:50%;background:var(--paper)}
.ticket__perf::before{left:calc(-14px - var(--notch))}
.ticket__perf::after{right:calc(-14px - var(--notch))}
.issue{grid-area:issue;display:flex;align-items:baseline;gap:3px;padding:12px 0 12px 18px}
.issue__k{font-size:13px;font-weight:800}
.issue__n{font:800 var(--num-issue)/.82 var(--font-numeric);font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.stub{grid-area:stub;display:flex;flex-direction:column;justify-content:center;padding:10px 8px 10px 14px;font-size:12.5px;line-height:1.45;min-width:0}
.stub time{font-weight:800;font-variant-numeric:normal}
.stub span{display:block;color:var(--ticket-fg-2);font-size:11.5px;line-height:1.4}
.topnav{display:none}
@media (min-width:1024px){
  .ticket{grid-template-columns:232px 4px minmax(0,1fr) auto;grid-template-rows:1fr auto;grid-template-areas:"issue perf brand tools" "stub perf brand tools";min-height:160px}
  .ticket__brand{padding:22px 0 20px 36px;align-self:center}
  .wordmark{letter-spacing:-.05em}
  .wordmark-en{font-size:13px;margin-top:12px}
  .tagline{font-size:15px;margin-top:12px}
  .ticket__tools{padding:14px 14px 0 0;gap:8px}
  .search{border:1px solid var(--ticket-fg-2);padding:0 12px;min-width:132px;justify-content:flex-start}
  .search__t{display:inline;font-size:14px;font-weight:800;flex:1;text-align:left}
  .search kbd{display:inline}
  .ticket__perf{height:auto;width:4px;margin:14px 0;background-size:4px 9px;background-repeat:repeat-y}
  .ticket__perf::before,.ticket__perf::after{left:50%;right:auto;margin:0 0 0 calc(var(--notch)*-1)}
  .ticket__perf::before{top:calc(-14px - var(--notch))}
  .ticket__perf::after{top:auto;bottom:calc(-14px - var(--notch))}
  .issue{padding:18px 0 0 28px;align-self:start;gap:6px}
  .issue__k{font-size:17px}
  .issue__n{line-height:.78}
  .stub{padding:0 16px 18px 28px;justify-content:flex-end;font-size:13px}
  .stub span{font-size:12.5px}
  .topnav{display:flex;align-items:center;gap:28px;border-bottom:1px solid var(--rule);padding:0 4px}
  .topnav a{position:relative;display:flex;align-items:center;justify-content:center;min-width:44px;min-height:48px;font-size:15px;font-weight:800;color:var(--ink-2);text-decoration:none}
  .topnav a:hover{color:var(--ink)}
  .topnav a[aria-current]{color:var(--ink)}
  .topnav a[aria-current]::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:3px;background:var(--brand-accent)}
  .topnav__upd{margin-left:auto;font-size:13px;color:var(--ink-2)}
}

/* 레이아웃 (D31) */
.layout{display:block}
.contents,.facing{display:none}
@media (min-width:1024px){
  .layout{display:grid;grid-template-columns:var(--col-contents) minmax(0,1fr);align-items:start}
  .contents{display:block;position:sticky;top:16px;margin:28px 36px 0 0}
  .page{padding-top:28px;min-width:0}
}
@media (min-width:1280px){
  .layout--3{grid-template-columns:var(--col-contents) minmax(0,1fr) var(--col-facing)}
  .layout--3 .facing{display:block;border-left:1px solid var(--ink);padding:0 0 0 32px;margin-top:28px;align-self:stretch}
  .layout--3 .in-flow{display:none}
  .layout--3 .page{padding-right:32px}
}

/* 섹션 머리 · 러닝 헤드 */
.sec-h{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-top:3px solid var(--ink);padding-top:10px}
.sec-h h2,.sec-h h3,.sec-h .h{font-size:var(--text-h2);font-weight:800;line-height:var(--lh-h2);letter-spacing:-.025em}
.sec-h--thin{border-top-width:1px}
.sec-h--thin h2,.sec-h--thin h3{font-size:16px}
@media (min-width:1024px){.sec-h--thin h2,.sec-h--thin h3{font-size:17px}}
.rh{flex:none;font:600 var(--text-rh)/1 var(--font-numeric);letter-spacing:.14em;color:var(--brand-accent-text)}
.sub{font-size:13px;color:var(--ink-2);margin-top:4px;line-height:1.5}
.sub b{color:var(--ink);font-weight:800}
.blk{margin-top:40px}
.blk--s{margin-top:28px}

/* 대회 표식 */
.tab{display:flex;align-items:center;justify-content:center;width:var(--tab-w);padding:7px 0 6px;background:var(--c);color:var(--competition-foreground);font:800 10.5px/1.08 var(--font-sans);writing-mode:vertical-rl;text-orientation:upright;letter-spacing:0}
@media (min-width:1024px){.tab{font-size:11px;padding:9px 0 8px}}
.ftab{display:inline-flex;align-items:center;justify-content:center;min-width:42px;height:22px;padding:0 6px;background:var(--c);color:var(--competition-foreground);font-size:11.5px;font-weight:800;line-height:1;letter-spacing:-.01em;flex:none}
.ftab--other{background:transparent;color:var(--ink-2);box-shadow:inset 0 0 0 1px var(--ink-2)}
.tab--epl{--c:var(--competition-epl)}.tab--laliga{--c:var(--competition-laliga)}.tab--seriea{--c:var(--competition-seriea)}
.tab--bundesliga{--c:var(--competition-bundesliga)}.tab--ligue1{--c:var(--competition-ligue1)}.tab--ucl{--c:var(--competition-ucl)}

/* 도장 · 완장 · 자리 · AI 라벨 */
.stamp{flex:none;display:inline-flex;align-items:center;gap:4px;padding:3px 6px 2px;border:1px solid var(--ink);color:var(--ink);font-size:var(--text-stamp);font-weight:800;line-height:1.3;letter-spacing:.01em}
.stamp--soft{border-color:var(--ink-2);color:var(--ink-2)}
.stamp--red{border-color:var(--brand-accent-text);color:var(--brand-accent-text)}
.arm{display:inline-block;padding:3px 3px 2px;background:var(--brand-accent);color:var(--brand-accent-foreground);font-size:10.5px;font-weight:800;line-height:1.2;letter-spacing:-.02em;flex:none}
.ph{padding:12px 14px;border:1.5px dashed var(--ink-3);font-size:12.5px;line-height:1.5;color:var(--ink-2)}
.ph b{color:var(--ink);font-weight:800;margin-right:6px}
.ph .fs{display:inline-block;font:600 13.5px/1.3 var(--font-numeric);letter-spacing:.04em;color:var(--ink);margin-left:4px}
.ph--in{border-width:1px}
.ai{position:relative;display:inline-block;padding:2px 5px 1px;border:1px solid var(--ink-2);font-size:11px;font-weight:800;line-height:1.35;letter-spacing:.02em;color:var(--ink-2);text-decoration:none;white-space:nowrap}
.ai::after{content:"";position:absolute;left:-8px;right:-8px;top:50%;height:44px;transform:translateY(-50%)}
.ai:hover{border-color:var(--ink);color:var(--ink)}

/* 팀 배지 (DR-05) */
.bdg{position:relative;display:inline-grid;grid-template-rows:3fr 2fr;flex:none;background:var(--k2);outline:1px solid var(--rule);outline-offset:-1px;vertical-align:middle}
.bdg b{grid-row:1;display:grid;place-items:center;background:var(--k1);color:var(--kf);font-family:var(--font-numeric);font-weight:800;font-variant-numeric:tabular-nums lining-nums;letter-spacing:.04em;line-height:1}
.bdg--m{width:40px;height:44px}.bdg--m b{font-size:15px}
.bdg--s{width:30px;height:33px}.bdg--s b{font-size:12px;letter-spacing:.02em}
.bdg--xs{width:24px;height:27px}.bdg--xs b{font-size:10.5px;letter-spacing:0}
.bdg--none{background:transparent;outline:1px dashed var(--ink-2)}
.bdg--none b{background:transparent;color:var(--ink-2);border-bottom:1px dashed var(--ink-2)}
.bdg--none::after{content:"";grid-row:2;background:repeating-linear-gradient(-45deg,var(--hatch) 0 3px,transparent 3px 6px)}

/* 폼 칩 W/D/L */
.fm{display:inline-grid;place-items:center;width:20px;height:20px;font:800 12.5px/1 var(--font-numeric);font-style:normal;letter-spacing:0;border:1.5px solid currentColor;flex:none}
.fm--W{color:var(--result-win)}.fm--D{color:var(--result-draw)}.fm--L{color:var(--result-loss)}
.res{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.res .sc{font:800 16px/1 var(--font-numeric);letter-spacing:.04em}

/* 버튼 · 링크 */
.btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;font-size:14px;font-weight:800;border:1px solid var(--ink);background:transparent;color:var(--ink);text-decoration:none;transition:background-color var(--duration-fast) var(--ease),color var(--duration-fast) var(--ease)}
.btn:hover{background:var(--ink);color:var(--paper)}
.btn:active{transform:translateY(1px)}
.btn--pri{background:var(--ink);color:var(--paper)}
.btn--pri:hover{background:var(--brand-accent);border-color:var(--brand-accent);color:var(--brand-accent-foreground)}
.btn[aria-disabled="true"]{border-style:dashed;border-color:var(--ink-disabled);color:var(--ink-disabled);background:transparent;cursor:not-allowed}
.btn .ic{width:18px;height:18px}
.tlink{position:relative;display:inline-flex;align-items:center;gap:4px;min-height:44px;min-width:44px;font-size:13px;font-weight:800;color:var(--brand-accent-text);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:4px}
.tlink:hover{text-decoration-thickness:2px}
.note{font-size:12.5px;color:var(--ink-2);line-height:1.5}
.note b{color:var(--ink);font-weight:800}

/* 뉴스 카드 (D0 확정 — 그대로) */
.feed{margin-top:4px}
.card{position:relative;display:grid;grid-template-columns:var(--gutter) minmax(0,1fr) var(--tab-w);column-gap:10px;padding:15px 0 13px;border-bottom:1px solid var(--rule)}
.card__gut{display:flex;flex-direction:column;align-items:flex-start;gap:7px;padding-top:3px}
.card__body{min-width:0}
.card__tags{display:flex;flex-wrap:wrap;align-items:center;gap:5px 8px;font-size:var(--text-tag);line-height:1.35;color:var(--ink-2)}
.tags{display:flex;flex-wrap:wrap;gap:2px 0}
.tags li{padding:0 7px;border-left:1px solid var(--rule)}
.tags li:first-child{padding-left:0;border-left:0}
.tags li.kr{font-weight:800;color:var(--ink)}
.card__title{margin-top:8px;font-size:var(--text-card);font-weight:800;line-height:var(--lh-card);letter-spacing:-.015em;text-wrap:pretty;max-width:46em}
.card__title.is-latin{font-family:var(--font-latin);font-weight:600;font-size:var(--text-card-latin);line-height:var(--lh-card-latin);letter-spacing:.002em;word-break:normal;max-width:none}
.card__title a{text-decoration:none;padding:13px 0}
.card__title.is-latin a{padding:10px 0}
.card__title a:hover{text-decoration:underline;text-decoration-color:var(--brand-accent);text-decoration-thickness:2px;text-underline-offset:3px}
.ext{display:inline-block;margin-left:4px;font-family:var(--font-sans);font-size:.62em;font-weight:400;color:var(--ink-2);vertical-align:.25em}
.card__meta{display:flex;flex-wrap:wrap;align-items:center;column-gap:10px;row-gap:4px;margin-top:9px;font-size:var(--text-meta);line-height:1.3;color:var(--ink-2)}
.card__meta .src{font-weight:800;color:var(--ink)}
.card__meta .more{font-weight:800;color:var(--ink);border-bottom:1px solid var(--ink-2)}
.card__meta time{display:inline-flex;gap:8px;align-items:baseline;white-space:nowrap}
.card__meta .abs{font:600 var(--num-meta)/1 var(--font-numeric);letter-spacing:.02em}
.card__tabs{display:flex;flex-direction:column;gap:2px}
.card__why{margin-top:8px;font-size:12.5px;color:var(--ink-2)}
.card__why b{color:var(--ink);font-weight:800}
.imp{display:flex;gap:2px}
.imp i{width:4px;height:9px;background:transparent;box-shadow:inset 0 0 0 1px var(--ink-3)}
.imp i.on{background:var(--ink-2);box-shadow:none}
.xfer{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;margin-top:8px;font-size:12.5px}
.xfer__v{font-weight:800;color:var(--ink)}
.xfer--official .xfer__v{color:var(--brand-accent-text)}
@media (min-width:1024px){.card{column-gap:14px;padding:18px 0 15px}.card__gut{gap:8px}}

/* 펀치 구멍 (DESIGN §2.7) · Tier (§2.8) */
.punch{position:relative;display:inline-flex;gap:3px;flex:none}
.punch i{width:13px;height:13px;border:1.5px solid var(--ink-2);border-radius:50%}
.punch i.on{background:var(--transfer-progress);border-color:var(--transfer-progress)}
.punch--official i.on{background:var(--transfer-official);border-color:var(--transfer-official)}
.punch--collapsed::after{content:"";position:absolute;left:-3px;right:-3px;top:50%;height:2px;margin-top:-1px;background:var(--transfer-collapsed);transform:rotate(-8deg)}
.punch--v{flex-direction:column;gap:6px}
.punch--v.punch--collapsed::after{left:50%;right:auto;top:-3px;bottom:-3px;width:2px;height:auto;margin:0 0 0 -1px;transform:rotate(-8deg)}
.tier{display:inline-flex;align-items:center;height:20px;padding:0 6px;font:600 13.5px/1 var(--font-numeric);font-variant-numeric:tabular-nums lining-nums;letter-spacing:.04em;flex:none;white-space:nowrap}
.tier--1{background:var(--tier-1);color:var(--paper)}
.tier--2{border:2px solid var(--tier-2);color:var(--ink)}
.tier--3{border:1px dashed var(--tier-3);color:var(--ink-2)}

/* ── B 공통: 티켓 물성 — 1.5px 잉크 테두리 · 2px 점선 절취선 · 반원 노치 (D1 팀 티켓 문법) ── */
.tkt{position:relative;background:var(--paper);border:1.5px solid var(--ink);min-width:0}
.perf{position:relative;border-left:2px dotted var(--ink-3);align-self:stretch}
.perf::before,.perf::after{content:"";position:absolute;left:50%;width:20px;height:20px;margin-left:-11px;border-radius:50%;background:var(--paper);border:1.5px solid var(--ink)}
.perf::before{top:-11.5px;clip-path:inset(50% 0 0 0)}
.perf::after{bottom:-11.5px;clip-path:inset(0 0 50% 0)}
.perf--open::after{display:none}
.kit{display:grid;grid-template-rows:3fr 2fr;background:var(--k2);box-shadow:inset 0 0 0 1px var(--rule)}
.kit b{display:grid;place-items:center;background:var(--k1);color:var(--kf);font:800 17px/1 var(--font-numeric);letter-spacing:.04em;font-variant-numeric:tabular-nums lining-nums}
.kit--none{background:transparent;box-shadow:inset 0 0 0 1px var(--ink-2)}
.kit--none b{background:transparent;color:var(--ink-2);border-bottom:1px dashed var(--ink-2)}
.kit--none::after{content:"";background:repeating-linear-gradient(-45deg,var(--hatch) 0 3px,transparent 3px 6px)}
/* 큰 숫자 하나 — 실선 = 출전(또는 값 있음), 속 빈 윤곽 = 출전 없음/0. 늘 글자 라벨과 함께 */
.big{display:block;font:800 var(--big)/.84 var(--font-numeric);letter-spacing:-.02em;font-variant-numeric:tabular-nums lining-nums;color:var(--ink)}
.big--out{color:transparent;-webkit-text-stroke:1.5px var(--ink-2)}
.big--red{color:var(--brand-accent)}
.big--dash{color:var(--ink-2)}
.big small{font:800 .36em/1 var(--font-sans);letter-spacing:0;margin-left:1px;-webkit-text-stroke:0;color:var(--ink)}
.big--out small{color:var(--ink-2)}
.cap{font-size:11.5px;font-weight:800;line-height:1.3;color:var(--ink-2)}
.k{font-size:11.5px;font-weight:800;color:var(--ink-2);line-height:1.3}
.v{font-size:13.5px;line-height:1.45}
.v b,.v .n{font-weight:800}
.v .n,.t-num{font:600 14.5px/1.2 var(--font-numeric);letter-spacing:.02em}
.vs{color:var(--ink-2);font-size:12px;font-weight:800;margin:0 3px}
.dot{color:var(--ink-3);margin:0 4px}

/* ── 선수 티켓 (목록) — 스텁(키트 2색 + 큰 숫자) │ 절취선 │ 몸통(신원 + 최근 경기) / 꼬리(시즌 · 다음) ── */
.grid{display:grid;gap:14px;align-items:start}
.lg-row{display:grid;gap:0 18px}
@media (min-width:1024px){.lg-row{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:1280px){.lg-row{grid-template-columns:repeat(3,minmax(0,1fr))}}
.lg-row .grid{grid-template-columns:minmax(0,1fr)}
@media (min-width:1024px){.grid--2,.grid--3{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}}
@media (min-width:1280px){.grid--3{grid-template-columns:repeat(3,minmax(0,1fr))}}
.lg-h{display:flex;align-items:center;gap:10px;margin:30px 0 12px;padding-top:10px;border-top:1px solid var(--ink)}
.lg-h h2{font-size:16px;font-weight:800;letter-spacing:-.02em}
.lg-h .n{font:800 17px/1 var(--font-numeric);color:var(--ink-2)}
.lg-h:first-of-type{margin-top:20px}
.pt{display:grid;grid-template-columns:var(--stub-w) 2px minmax(0,1fr);grid-template-areas:"kit perf id" "num perf last" "tail tail tail";transition:transform var(--duration-fast) var(--ease)}
.pt__kit{grid-area:kit;min-height:66px}
.pt__num{grid-area:num;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:10px 2px 12px;border-top:1px solid var(--rule);text-align:center}
.pt__perf{grid-area:perf;grid-row:1/3}
.pt__id{grid-area:id;padding:10px 12px 10px 14px;min-width:0;display:flex;flex-direction:column;justify-content:center}
.pt__k{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:12px;color:var(--ink-2)}
.pt__k .t-num{font-size:13px}
.pt__name{font-size:21px;font-weight:800;letter-spacing:-.035em;line-height:1.2;margin-top:3px}
.pt__name a{text-decoration:none;display:inline-block;padding:10px 0;margin:-10px 0}
.pt__name a:hover{text-decoration:underline;text-decoration-thickness:2px;text-decoration-color:var(--brand-accent);text-underline-offset:4px}
.pt__team{font-size:13px;color:var(--ink-2);margin-top:2px}
.pt__team b{color:var(--ink);font-weight:800}
.pt__last{grid-area:last;padding:10px 12px 12px 14px;border-top:1px solid var(--rule);min-width:0}
.pt__st{font-size:14px;font-weight:800;line-height:1.3}
.pt__st--off{color:var(--ink-2)}
.pt__m{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:4px;font-size:12.5px;color:var(--ink-2);line-height:1.4}
.pt__m time{font:600 14px/1 var(--font-numeric);letter-spacing:.02em;color:var(--ink)}
.pt__opp{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:5px;font-size:13px;line-height:1.35}
.pt__opp b{font-weight:800}
.pt__tail{grid-area:tail;border-top:2px dotted var(--ink-3);padding:8px 12px 10px;display:grid;gap:4px}
.pt__row{display:grid;grid-template-columns:44px minmax(0,1fr);gap:8px;align-items:baseline;font-size:13px;line-height:1.45}
.pt__row .k{padding-top:1px}
.pt__row .n{font:600 14.5px/1 var(--font-numeric);letter-spacing:.02em;color:var(--ink)}
.pt__row .u{color:var(--ink-2)}
.pt__row time{font:600 14.5px/1 var(--font-numeric);letter-spacing:.02em}
a.pt{text-decoration:none}
.pt--gone .pt__num{border-top-style:dashed}
.pt .stamp{margin-left:auto}

/* ── 선수 상세 머리 = 큰 선수 티켓 ── */
.ph-tk{display:grid;grid-template-columns:104px 2px minmax(0,1fr);grid-template-areas:"stub perf body" "tail tail tail"}
.ph-tk__stub{grid-area:stub;display:grid;grid-template-rows:auto 1fr}
.ph-tk__stub .kit{min-height:112px}
.ph-tk__stub .kit b{font-size:30px}
.ph-tk__num{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:6px;padding:14px 10px 16px 12px;border-top:1px solid var(--rule)}
.ph-tk__num .big{--big:58px}
.ph-tk__perf{grid-area:perf}
.ph-tk__body{grid-area:body;padding:14px 14px 16px 16px;min-width:0}
.ph-tk__comp{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-size:12.5px;color:var(--ink-2)}
.ph-tk__name{font-size:34px;font-weight:800;letter-spacing:-.045em;line-height:1.1;margin-top:10px}
.ph-tk__en{font:600 19px/1.1 var(--font-latin);letter-spacing:.01em;color:var(--ink-2);margin-top:4px}
.ph-tk__facts{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:12px;font-size:13px;color:var(--ink-2)}
.ph-tk__facts b{color:var(--ink);font-weight:800}
.ph-tk__facts .n{font:600 15px/1 var(--font-numeric);color:var(--ink);letter-spacing:.02em}
.ph-tk__act{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.ph-tk__tail{grid-area:tail;display:grid;border-top:2px dotted var(--ink-3)}
.cell{padding:10px 14px;border-bottom:1px solid var(--rule);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 10px;min-width:0}
.cell:last-child{border-bottom:0}
.cell__k{font-size:12.5px;font-weight:800}
.cell__k span{font-weight:400;color:var(--ink-2);margin-left:6px}
.cell__v{display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px;font-size:14px;font-weight:800;min-width:0}
.cell__v .t-num{font-size:15px}
.cell__v a{display:inline-flex;align-items:center;min-height:44px;text-decoration:underline;text-underline-offset:4px;text-decoration-thickness:1px}
.cell__v a:hover{text-decoration-thickness:2px}
@media (min-width:1024px){
  .ph-tk{grid-template-columns:var(--col-contents) 2px minmax(0,1fr)}
  .ph-tk__stub .kit{min-height:150px}
  .ph-tk__stub .kit b{font-size:64px}
  .ph-tk__num{padding:18px 24px 22px 28px}
  .ph-tk__num .big{--big:104px}
  .ph-tk__body{padding:24px 28px 22px 32px}
  .ph-tk__name{font-size:52px}
  .ph-tk__en{font-size:24px}
  .ph-tk__tail{grid-template-columns:repeat(3,minmax(0,1fr))}
  .ph-tk__tail .cell{border-bottom:0;border-left:1px solid var(--rule);padding:12px 18px;min-height:64px}
  .ph-tk__tail .cell:first-child{border-left:0}
}

/* 팔로우 버튼 — 왼쪽 미니 스텁(절취선) · 켜면 스텁이 접혀 ✓ (모션: 접힘 200ms) */
.fol{position:relative;display:inline-flex;align-items:stretch;min-height:44px;padding:0;border:1px solid var(--ink);background:transparent;color:var(--ink);font-size:14px;font-weight:800;text-align:left;transition:background-color var(--duration-fast) var(--ease),color var(--duration-fast) var(--ease)}
.fol__s{display:grid;place-items:center;width:34px;border-right:2px dotted currentColor;transform-origin:right center}
.fol__s .ic{width:16px;height:16px}
.fol__s .on{display:none}
.fol__t{display:flex;align-items:center;padding:0 14px 0 12px;white-space:nowrap}
.fol:hover{background:var(--paper-2)}
.fol[aria-pressed="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.fol[aria-pressed="true"] .fol__s .on{display:block}
.fol[aria-pressed="true"] .fol__s .off{display:none}
.fol[aria-pressed="true"]:hover{background:var(--ink)}
.fol.is-fold .fol__s{animation:fold var(--duration-base) var(--ease)}
@keyframes fold{0%{transform:scaleX(1)}50%{transform:scaleX(0)}100%{transform:scaleX(1)}}
.fol[aria-disabled="true"]{border-style:dashed;border-color:var(--ink-disabled);color:var(--ink-disabled);cursor:not-allowed}
.fol[aria-disabled="true"]:hover{background:transparent}
.fol[aria-disabled="true"] .fol__s{border-right-color:var(--ink-disabled)}
.fol--sm{min-height:36px;font-size:13px}
.fol--sm .fol__s{width:28px}
.fol--sm::after{content:"";position:absolute;left:0;right:0;top:50%;height:44px;transform:translateY(-50%)}
.fol-help{font-size:12.5px;color:var(--ink-2);margin-top:6px}
.fol-help b{color:var(--ink);font-weight:800}

/* 블록 머리 (B — 얇은 섹션 머리 + 오른쪽 보조) */
.bh{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px;border-top:1px solid var(--ink);padding-top:10px;margin-bottom:12px}
.bh h2,.bh h3{font-size:17px;font-weight:800;letter-spacing:-.02em;line-height:1.3}
.bh h2 .n,.bh h3 .n{font:800 18px/1 var(--font-numeric);color:var(--ink-2);margin-left:6px}
.bh .sub{margin-top:0;flex-basis:100%}

/* 시즌 기록 — 대회별 시즌권 3장 띠 */
.pass{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
.pass__c{position:relative;padding:12px 10px 12px 12px;min-width:0;border-left:2px dotted var(--ink-3)}
.pass__c:first-child{border-left:0}
.pass__c .ftab{margin-bottom:12px}
.pass__c .big{--big:38px}
.pass__c .cap{margin-top:6px}
.pass__c .v{font-size:12.5px;color:var(--ink-2);margin-top:8px;line-height:1.55;display:grid}
.pass__c .v .n{font-size:14px;color:var(--ink)}
.pass__tot{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;padding:10px 12px;border-top:2px dotted var(--ink-3);font-size:13px;color:var(--ink-2)}
.pass__tot b{color:var(--ink);font-weight:800}
.pass__tot .n{font:600 15px/1 var(--font-numeric);color:var(--ink);letter-spacing:.02em}
@media (min-width:1024px){.pass__c{padding:16px 18px}.pass__c .big{--big:52px}}

/* 경기 스텁 5장 — 가로 줄 (375: 스냅 스크롤 · 1024+: 5칸 고정) */
.stubs{display:grid;grid-auto-flow:column;grid-auto-columns:148px;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 2px 12px;margin:0 calc(var(--edge)*-1);padding-left:var(--edge);padding-right:var(--edge);scroll-padding-left:var(--edge);scrollbar-width:thin;scrollbar-color:var(--ink-3) transparent}
.stubs>li{scroll-snap-align:start;min-width:0}
@media (min-width:1024px){.stubs{grid-auto-flow:row;grid-template-columns:repeat(5,minmax(0,1fr));grid-auto-columns:auto;overflow:visible;margin:0;padding:0}}
.ms{display:flex;flex-direction:column;height:100%}
.ms__top{padding:10px 10px 10px 12px}
.ms__d{display:flex;align-items:baseline;gap:5px;font-size:12px;color:var(--ink-2)}
.ms__d time{font:800 17px/1 var(--font-numeric);letter-spacing:.01em;color:var(--ink)}
.ms__d .t{font:600 13px/1 var(--font-numeric);letter-spacing:.02em}
.ms__c{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;margin-top:8px;font-size:11.5px;color:var(--ink-2);line-height:1.3}
.ms__perf{position:relative;height:0;border-top:2px dotted var(--ink-3);margin:0}
.ms__perf::before,.ms__perf::after{content:"";position:absolute;top:-11px;width:20px;height:20px;border-radius:50%;background:var(--paper);border:1.5px solid var(--ink)}
.ms__perf::before{left:-11.5px;clip-path:inset(0 0 0 50%)}
.ms__perf::after{right:-11.5px;clip-path:inset(0 50% 0 0)}
.ms__mid{padding:12px 12px 10px;display:flex;flex-direction:column;gap:6px}
.ms__mid .big{--big:44px}
.ms__st{font-size:13px;font-weight:800;line-height:1.3}
.ms__st--off{color:var(--ink-2)}
.ms__bot{margin-top:auto;padding:10px 12px 12px;border-top:1px solid var(--rule);display:grid;gap:6px;font-size:12.5px;line-height:1.35}
.ms__opp{display:flex;align-items:center;gap:6px;min-width:0}
.ms__vr{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:12px;color:var(--ink-2)}
.ms__opp span{min-width:0}
.ms--empty{border:1.5px dashed var(--ink-3);background:transparent;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:14px 12px;min-height:100%}
.ms--empty .big{--big:44px}
.ms--empty p{font-size:12.5px;color:var(--ink-2);line-height:1.45}
.ms--empty b{color:var(--ink);font-weight:800;display:block}

/* 다음 경기 입장권 */
.adm{display:grid;grid-template-columns:auto 2px minmax(0,1fr)}
.adm__stub{padding:14px 16px 14px 14px;display:flex;flex-direction:column;justify-content:center;gap:6px;min-width:104px}
.adm__stub .big{--big:46px}
.adm__stub time.d{font:800 14px/1 var(--font-numeric);letter-spacing:.02em;color:var(--ink-2)}
.adm__body{padding:12px 14px 14px 16px;min-width:0;display:flex;flex-direction:column;gap:8px}
.adm__c{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-size:12.5px;color:var(--ink-2)}
.adm__vs{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:6px 10px;font-size:15px;font-weight:800;line-height:1.25}
.adm__vs .tag{font-size:11.5px;color:var(--ink-2);font-weight:800}
.adm__act{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
.upc{margin-top:10px}
.upc li{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;min-height:44px;padding:6px 0;border-bottom:1px solid var(--rule);font-size:13.5px}
.upc time{font:600 15px/1 var(--font-numeric);letter-spacing:.02em;min-width:92px}
.upc b{font-weight:800}
@media (min-width:1024px){.adm__stub{padding:18px 24px;min-width:150px}.adm__stub .big{--big:64px}}

/* 탭 (관련 뉴스 한/영) */
.ptabs{display:flex;gap:16px;border-bottom:1px solid var(--rule)}
.ptabs [role=tab]{position:relative;flex:none;min-height:46px;min-width:44px;padding:0 4px;background:none;border:0;font-size:15px;font-weight:800;color:var(--ink-2);transition:color var(--duration-fast) var(--ease)}
.ptabs [role=tab] .n{font:600 16px/1 var(--font-numeric);margin-left:4px}
.ptabs [role=tab]:hover{color:var(--ink)}
.ptabs [role=tab][aria-selected=true]{color:var(--ink)}
.ptabs [role=tab][aria-selected=true]::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:3px;background:var(--brand-accent)}
.pn.is-in{animation:stamp var(--duration-fast) var(--ease) both}

/* 상세 격자 (1280: 카드 격자 2열) */
.dg{display:grid;gap:40px;margin-top:36px}
.dg>*{min-width:0}
@media (min-width:1280px){.dg{grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:32px;row-gap:44px}.dg>.wide{grid-column:1/-1}}

/* ── 이적 티켓 — 몸통 │ 절취선 위 검표 펀치 4 │ 스텁(단계 n/4) ── */
.xt{display:grid;grid-template-columns:minmax(0,1fr) 2px 82px}
.xt__body{padding:12px 14px 12px 14px;min-width:0}
.xt__top{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-size:12.5px;color:var(--ink-2)}
.xt__top time{font:600 14px/1 var(--font-numeric);letter-spacing:.02em;color:var(--ink)}
.xt__name{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-top:8px;font-size:21px;font-weight:800;letter-spacing:-.035em;line-height:1.2}
.xt__title{margin-top:8px;font-size:15px;font-weight:800;line-height:1.45;letter-spacing:-.01em;max-width:46em}
.xt__dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 12px;margin-top:10px;font-size:13.5px;align-items:center}
.xt__dl dt{font-size:11.5px;font-weight:800;color:var(--ink-2)}
.xt__dl dd{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-weight:800;min-width:0}
.xt__dl dd.none{font-weight:400;color:var(--ink-2)}
.arrow{display:inline-block;width:20px;height:10px;flex:none;background:var(--ink);clip-path:polygon(0 40%,62% 40%,62% 0,100% 50%,62% 100%,62% 60%,0 60%)}
.xt__perf{position:relative;display:flex;justify-content:center;padding-top:14px}
.xt__perf .punch{position:absolute;left:50%;top:14px;transform:translateX(-50%);background:var(--paper);padding:3px 0}
.xt__stub{display:flex;flex-direction:column;justify-content:flex-start;align-items:flex-start;gap:6px;padding:12px 10px 12px 18px}
.xt__stub .big{--big:40px}
.xt__stub .big small{font-family:var(--font-numeric);font-size:.5em;font-weight:800}
.xt__stage{font-size:14px;font-weight:800}
.xt__stage--official{color:var(--brand-accent-text)}
.xt__stage--collapsed{color:var(--ink)}
.xt__more{grid-column:1/-1;border-top:2px dotted var(--ink-3)}
.xt__btn{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:44px;padding:0 14px;background:none;border:0;font-size:13px;font-weight:800;text-align:left}
.xt__btn .n{font:600 15px/1 var(--font-numeric)}
.xt__btn:hover{background:var(--paper-2)}
.xt__btn .ic{width:16px;height:16px;transition:transform var(--duration-base) var(--ease)}
.xt__btn[aria-expanded="true"] .ic{transform:rotate(180deg)}
.tl{padding:4px 14px 14px}
.tl li{position:relative;display:grid;grid-template-columns:86px minmax(0,1fr);gap:4px 12px;padding:10px 0;border-top:1px solid var(--rule)}
.tl li:first-child{border-top:0}
.tl time{font:600 14.5px/1.2 var(--font-numeric);letter-spacing:.02em}
.tl .st{display:grid;justify-items:start;gap:4px;margin-top:6px;font-size:12px;font-weight:800;color:var(--ink-2)}
.tl li{grid-template-columns:96px minmax(0,1fr)}
.tl .t{font-size:14.5px;font-weight:800;line-height:1.45}
.tl .t a{text-decoration:none;padding:14px 0}
.xt__title a{text-decoration:none;padding:13px 0}
.xt__title a:hover{text-decoration:underline;text-decoration-color:var(--brand-accent);text-decoration-thickness:2px;text-underline-offset:3px}
.tl .t a:hover{text-decoration:underline;text-decoration-color:var(--brand-accent);text-decoration-thickness:2px;text-underline-offset:3px}
.tl .m{grid-column:2;font-size:12.5px;color:var(--ink-2)}
.tl .m b{color:var(--ink);font-weight:800}
.is-tear{animation:tear var(--duration-base) var(--ease) both}
.xt--quiet{border-style:dashed;border-color:var(--ink-2)}
.xt--quiet .perf::before,.xt--quiet .perf::after{border-color:var(--ink-2)}
@media (min-width:1024px){.xt{grid-template-columns:minmax(0,1fr) 2px 104px}.xt__body{padding:14px 18px}.xt__stub{padding:14px 14px 14px 22px}.xt__stub .big{--big:52px}}

/* 이적 창 머리 · 필터 */
.win{display:grid;grid-template-columns:auto 2px minmax(0,1fr);margin-top:14px}
.win__s{display:flex;flex-direction:column;justify-content:center;gap:6px;padding:12px 16px 12px 14px}
.win__b{padding:12px 14px;min-width:0;display:grid;gap:8px}
.fl{margin-top:14px;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}
.fl summary{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:48px;cursor:pointer;list-style:none;font-size:14px;font-weight:800}
.fl summary::-webkit-details-marker{display:none}
.fl summary .n{font:600 15px/1 var(--font-numeric);color:var(--ink-2)}
.fl summary .ic{width:16px;height:16px;transition:transform var(--duration-base) var(--ease)}
.fl[open] summary .ic{transform:rotate(180deg)}
.fg{padding:4px 0 12px}
.fg+.fg{border-top:1px solid var(--rule);padding-top:12px}
.fg__k{font-size:12px;font-weight:800;color:var(--ink-2);margin-bottom:8px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{position:relative;display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border:1px solid var(--ink-2);background:transparent;font-size:13.5px;font-weight:800;color:var(--ink);transition:border-color var(--duration-fast) var(--ease),background-color var(--duration-fast) var(--ease)}
.chip::after{content:"";position:absolute;left:0;right:0;top:50%;height:46px;transform:translateY(-50%)}
.chip .n{font:600 16px/1 var(--font-numeric);color:var(--ink-2)}
.chip:hover{border-color:var(--ink)}
.chip[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:var(--paper)}
.chip[aria-pressed="true"] .n{color:var(--paper)}
.chip[aria-pressed="true"]::before{content:"✓";font-size:12px}
.chip[aria-disabled="true"]{border-style:dashed;border-color:var(--ink-disabled);color:var(--ink-disabled)}
.chip[aria-disabled="true"] .n{color:var(--ink-disabled)}
.chip--kr{border-color:var(--brand-accent-text);color:var(--brand-accent-text)}
.chip--kr[aria-pressed="true"]{background:var(--brand-accent);border-color:var(--brand-accent);color:var(--brand-accent-foreground)}
.ct{margin-top:6px}
.ct-k{font-size:12px;font-weight:800;color:var(--ink-2);margin:18px 0 4px}
.ct-row{display:flex;align-items:center;gap:8px;min-height:44px;border-bottom:1px solid var(--rule);font-size:14px;text-decoration:none;color:var(--ink);width:100%;background:none;border-top:0;border-left:0;border-right:0;padding:0;text-align:left}
.ct-row .l{flex:1;min-width:0}
.ct-row .n{font:600 17px/1 var(--font-numeric);color:var(--ink-2)}
.ct-row[aria-current],.ct-row[aria-pressed="true"]{font-weight:800}
.ct-row[aria-current] .l::after,.ct-row[aria-pressed="true"] .l::after{content:" ✓";color:var(--brand-accent-text)}
.ct-row:hover .l{text-decoration:underline;text-underline-offset:3px}
.ct-row.is-dis{color:var(--ink-disabled)}
.ct-row.is-dis .n{color:var(--ink-disabled)}
span.ct-row.is-dis{color:var(--ink-2)}
.result-n{display:flex;align-items:baseline;gap:8px;margin-top:18px;font-size:13px;color:var(--ink-2)}
.result-n .n{font:800 22px/1 var(--font-numeric);color:var(--ink)}
@media (min-width:1024px){.fl--m{display:none}}

/* 주간 리포트 — 주차 티켓 · MVP 티켓 · 주간 스텁 */
.wk{display:grid;grid-template-columns:92px 2px minmax(0,1fr);grid-template-areas:"s p b" "t t t"}
.wk__s{grid-area:s;display:flex;flex-direction:column;justify-content:center;gap:4px;padding:14px 10px 14px 14px}
.wk__s .big{--big:56px}
.wk__p{grid-area:p}
.wk__b{grid-area:b;padding:14px 14px 14px 16px;min-width:0}
.wk__b h1{font-size:26px;font-weight:800;letter-spacing:-.04em;line-height:1.2;margin-top:8px}
.wk__range{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:8px;font-size:13px;color:var(--ink-2)}
.wk__range .t-num{color:var(--ink);font-size:15px}
.wk__t{grid-area:t;display:grid;grid-template-columns:1fr 1fr;border-top:2px dotted var(--ink-3)}
.wk__nav{display:flex;flex-direction:column;justify-content:center;gap:4px;min-height:56px;padding:8px 14px;font-size:12px;color:var(--ink-2)}
.wk__nav+.wk__nav{border-left:1px solid var(--rule);text-align:right;align-items:flex-end}
.wk__nav b{font-size:12.5px;font-weight:800;color:var(--ink)}
.wk__nav .t-num{color:var(--ink)}
@media (min-width:1024px){.wk{grid-template-columns:var(--col-contents) 2px minmax(0,1fr)}.wk__s{padding:20px 28px}.wk__s .big{--big:96px}.wk__b{padding:22px 28px 20px 32px}.wk__b h1{font-size:40px}}
.mvp{display:grid;grid-template-columns:96px 2px minmax(0,1fr);grid-template-areas:"kit perf body" "num perf body" "tail tail tail";margin-top:28px}
.mvp__kit{grid-area:kit;min-height:84px}
.mvp__kit b{font-size:24px}
.mvp__num{grid-area:num;display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:12px 10px 14px 12px;border-top:1px solid var(--rule)}
.mvp__num .big{--big:64px}
.mvp__num .big{color:var(--brand-accent)}
.mvp__perf{grid-area:perf;grid-row:1/3}
.mvp__body{grid-area:body;padding:14px 14px 14px 16px;min-width:0}
.mvp__name{font-size:34px;font-weight:800;letter-spacing:-.045em;line-height:1.1;margin-top:10px}
.mvp__team{font-size:13.5px;color:var(--ink-2);margin-top:6px}
.mvp__team b{color:var(--ink);font-weight:800}
.mvp__g{margin-top:14px;padding-top:10px;border-top:1px solid var(--rule);display:grid;gap:6px;font-size:13.5px;line-height:1.45}
.mvp__g .t-num{font-size:15px}
.mvp__tail{grid-area:tail;border-top:2px dotted var(--ink-3);padding:10px 14px;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--ink-2)}
.mvp__tail b{color:var(--ink);font-weight:800}
.mvp__tail .n{font:600 14.5px/1 var(--font-numeric);color:var(--ink);letter-spacing:.02em}
@media (min-width:1024px){.mvp{grid-template-columns:var(--col-contents) 2px minmax(0,1fr)}.mvp__kit{min-height:110px}.mvp__kit b{font-size:44px}.mvp__num{padding:16px 24px 20px 28px}.mvp__num .big{--big:112px}.mvp__body{padding:22px 28px 20px 32px}.mvp__name{font-size:52px}}
.ws{display:grid;grid-template-columns:var(--stub-w) 2px minmax(0,1fr);grid-template-areas:"kit perf body" "num perf body"}
.ws__kit{grid-area:kit;min-height:48px}
.ws__kit b{font-size:14px}
.ws__num{grid-area:num;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px 2px 10px;border-top:1px solid var(--rule);text-align:center}
.ws__num .big{--big:34px}
.ws__perf{grid-area:perf;grid-row:1/3}
.ws__body{grid-area:body;padding:10px 12px 10px 14px;min-width:0}
.ws__n{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px}
.ws__n b{font-size:18px;font-weight:800;letter-spacing:-.03em}
.ws__n span{font-size:12.5px;color:var(--ink-2)}
.ws__stat{display:flex;flex-wrap:wrap;gap:2px 12px;margin-top:4px;font-size:12.5px;color:var(--ink-2)}
.ws__stat .n{font:600 14.5px/1 var(--font-numeric);color:var(--ink);letter-spacing:.02em}
.ws__ml{margin-top:8px;display:grid;gap:6px}
.ws__ml li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:2px 8px;font-size:12.5px;line-height:1.35}
.ws__ml .o{display:grid;gap:3px}
.ws__ml .o>span:first-child{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px}
.ws__ml time{padding-top:4px}
.ws__ml .mbar{margin-top:7px}
.ws__ml time{font:600 13.5px/1 var(--font-numeric);letter-spacing:.02em}
.ws__ml .o{min-width:0}
.ws__ml .s{font-weight:800}
.ws__ml .s--off{font-weight:400;color:var(--ink-2)}
/* 90분 막대 — 출전 시간 비율. 벤치 = 빈 막대, 명단 제외 = 점선 막대 (글자 상태와 함께) */
.mbar{display:block;width:54px;height:8px;border:1px solid var(--ink-2);background:linear-gradient(var(--ink),var(--ink)) left/var(--w,0%) 100% no-repeat;flex:none}
.mbar--abs{border-style:dashed;border-color:var(--ink-3)}
.sum{margin-top:36px}
.sum__box{position:relative;padding:14px 16px 16px;border:1.5px dashed var(--ink-3)}
.sum__h{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.sum__h b{font-size:15px;font-weight:800}
.sum__lines{display:grid;gap:8px;margin:12px 0}
.sum__lines i{display:block;height:12px;background:var(--paper-3)}
.sum__lines i:nth-child(2){width:92%}.sum__lines i:nth-child(3){width:96%}.sum__lines i:nth-child(4){width:70%}

/* 마이 — 티켓 지갑 (겹친 스텁) */
.wallet{margin-top:4px}
.wallet>li{position:relative;margin-top:-8px}
.wallet>li:first-child{margin-top:0}
.wt{display:block}
.wt__h{position:relative;display:grid;grid-template-columns:var(--stub-w) 2px minmax(0,1fr) auto;align-items:stretch;width:100%;min-height:60px;padding:0;background:var(--paper);border:0;text-align:left}
.wt__h .kit{min-height:58px}
.wt__h .kit b{font-size:15px}
.wt__h .perf::after{display:none}
.wt__hb{display:flex;flex-direction:column;justify-content:center;gap:2px;padding:8px 10px 8px 14px;min-width:0}
.wt__hb b{font-size:16px;font-weight:800;letter-spacing:-.02em;line-height:1.25}
.wt__hb>span{font-size:12px;color:var(--ink-2)}
.wt__hb time{font:600 13.5px/1 var(--font-numeric);letter-spacing:.02em;color:var(--ink)}
.wt__ic{display:grid;place-items:center;width:44px}
.wt__ic .ic{width:16px;height:16px;transition:transform var(--duration-base) var(--ease)}
.wt__h[aria-expanded="true"] .wt__ic .ic{transform:rotate(180deg)}
.wt__h:hover .wt__hb b{text-decoration:underline;text-underline-offset:3px}
.wt__p{border-top:2px dotted var(--ink-3);padding:12px 14px 14px;display:grid;gap:12px}
.wt__p[hidden]{display:none}
.wt__row{display:grid;grid-template-columns:56px minmax(0,1fr);gap:10px;align-items:baseline;font-size:13.5px}
.wt__row .k{padding-top:2px}
.wt__rec{display:grid;gap:6px}
.wt__rec li{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:13px}
.wt__rec time{font:600 14px/1 var(--font-numeric);letter-spacing:.02em;min-width:72px}
.wt__act{display:flex;flex-wrap:wrap;gap:8px}
.lim{display:flex;align-items:baseline;gap:6px;font-size:13px;color:var(--ink-2)}
.lim .n{font:800 28px/1 var(--font-numeric);color:var(--ink)}
.lim .of{font:800 16px/1 var(--font-numeric);color:var(--ink-2)}
.mgr li{display:flex;align-items:center;gap:10px;min-height:52px;border-bottom:1px solid var(--rule);font-size:14px}
.mgr li .l{flex:1;min-width:0;font-weight:800}
.mgr li .l span{font-weight:400;color:var(--ink-2);font-size:12.5px;margin-left:6px}
.rm{position:relative;min-height:36px;padding:0 10px;border:1px solid var(--ink-2);background:transparent;font-size:12.5px;font-weight:800}
.rm::after{content:"";position:absolute;left:0;right:0;top:50%;height:44px;transform:translateY(-50%)}
.rm:hover{border-color:var(--ink)}
.xi{display:grid;gap:10px}
.xi__opts{display:grid;gap:8px}
@media (min-width:1024px){.xi__opts{grid-template-columns:1fr 1fr}}
.opt{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:64px;padding:10px 12px;border:1px solid var(--ink-2);background:transparent;text-align:left}
.opt b{font-size:14px;font-weight:800}
.opt span{font-size:12.5px;color:var(--ink-2)}
.opt:hover{border-color:var(--ink)}

/* 온보딩 — 스텁 묶음(단계마다 스텁 1장, 다음 = 뜯어 넘김) */
.ob{max-width:640px}
.ob__st{margin-top:-1.5px}
.ob__st:first-child{margin-top:0}
.ob__h{display:grid;grid-template-columns:56px 2px minmax(0,1fr) auto;align-items:center;min-height:56px}
.ob__h .perf::after{display:none}
.ob__no{display:flex;align-items:baseline;justify-content:center;align-self:center;font:800 26px/1 var(--font-numeric);letter-spacing:-.02em}
.ob__no small{font-size:13px;color:var(--ink-2);margin-left:1px}
.ob__t{padding:8px 12px 8px 14px;min-width:0}
.ob__t b{display:block;font-size:16px;font-weight:800}
.ob__t>span{display:block;font-size:12.5px;color:var(--ink-2)}
.ob__ok{padding-right:14px;font-size:12px;font-weight:800;color:var(--ink-2);white-space:nowrap}
.ob__st.is-done .ob__no{color:transparent;-webkit-text-stroke:1.2px var(--ink-2)}
.ob__st.is-done .ob__ok::before{content:"✓ ";color:var(--brand-accent-text)}
.ob__st.is-next{border-style:dashed;border-color:var(--ink-3)}
.ob__st.is-next .perf::before{border-color:var(--ink-3)}
.ob__st.is-next .ob__t b,.ob__st.is-next .ob__no{color:var(--ink-2)}
.ob__body{border-top:2px dotted var(--ink-3);padding:14px 14px 16px}
.ob__body[hidden]{display:none}
.ob__lg{display:grid;gap:8px}
@media (min-width:640px){.ob__lg{grid-template-columns:1fr 1fr}}
.pick{position:relative;display:flex;align-items:center;gap:10px;min-height:48px;padding:6px 12px 6px 8px;border:1px solid var(--ink-2);background:transparent;text-align:left;font-size:14px;font-weight:800;color:var(--ink);transition:background-color var(--duration-fast) var(--ease),color var(--duration-fast) var(--ease)}
.pick .s{font-size:12px;font-weight:400;color:var(--ink-2)}
.pick .l{flex:1;min-width:0;display:flex;flex-direction:column}
.pick--row{min-height:46px}
.pick--row .l{flex-direction:row;align-items:baseline;gap:8px}
.pick .ck{display:grid;place-items:center;width:20px;height:20px;border:1.5px solid currentColor;flex:none;font-size:12px}
.pick:hover{border-color:var(--ink)}
.pick[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:var(--paper)}
.pick[aria-pressed="true"] .s{color:var(--paper)}
.pick[aria-pressed="true"] .ck::before{content:"✓"}
.pick[aria-disabled="true"]{border-style:dashed;border-color:var(--ink-disabled);color:var(--ink-disabled)}
.pick[aria-disabled="true"] .s{color:var(--ink-disabled)}
.ob__teams{display:grid;gap:6px}
@media (min-width:640px){.ob__teams{grid-template-columns:1fr 1fr}}
.ob__lgh{display:flex;align-items:center;gap:8px;margin:14px 0 8px;font-size:13px;font-weight:800}
.ob__lgh:first-child{margin-top:0}
.ob__lgh .n{font:600 15px/1 var(--font-numeric);color:var(--ink-2)}
.ob__foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-top:16px;padding-top:12px;border-top:1px solid var(--rule)}
.ob__cnt{font-size:13px;color:var(--ink-2)}
.ob__cnt .n{font:800 22px/1 var(--font-numeric);color:var(--ink)}
.ob__more{font-size:12.5px;color:var(--ink-2);margin-top:8px}
.ob__entry{display:grid;grid-template-columns:56px 2px minmax(0,1fr);margin-top:24px}
.ob__entry .perf::after{display:none}
.ob__entry .ob__no{font-size:22px}
.ob__entry-b{padding:12px 14px;display:grid;gap:8px;min-width:0}
.ob__entry-b b{font-size:15px;font-weight:800}
.ob__entry-b p{font-size:13px;color:var(--ink-2)}
.ob__entry-a{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center}

/* 검색 — 오버레이 · 결과(작은 티켓 줄) */
.sov{position:fixed;inset:0;z-index:35;display:flex;flex-direction:column;background:var(--paper)}
.sov[hidden]{display:none}
.sov__scrim{display:none}
.sov__panel{display:flex;flex-direction:column;min-height:0;flex:1;background:var(--paper)}
@media (min-width:1024px){
  .sov{background:color-mix(in srgb,var(--ink) 42%,transparent);align-items:center;padding-top:72px}
  .sov__panel{flex:none;width:min(760px,calc(100% - 64px));max-height:calc(100vh - 120px);border:1.5px solid var(--ink);box-shadow:var(--shadow-print)}
}
.sbox{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 8px 8px 14px;border-bottom:2px dotted var(--ink-3)}
.sbox .ic{width:22px;height:22px;color:var(--ink-2)}
.sbox input{width:100%;min-height:48px;padding:0 4px;border:0;background:transparent;font-size:18px;font-weight:800;letter-spacing:-.02em;outline:none}
.sbox input::placeholder{color:var(--ink-2);font-weight:400}
.sbox input::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none}
.sbox:focus-within{box-shadow:inset 0 -3px 0 var(--ring)}
.sres{overflow:auto;padding:4px 14px 16px;flex:1}
.sgrp{margin-top:14px}
.sgrp__h{display:flex;align-items:baseline;gap:8px;font-size:12px;font-weight:800;color:var(--ink-2);padding-bottom:6px;border-bottom:1px solid var(--ink)}
.sgrp__h .n{font:600 15px/1 var(--font-numeric);color:var(--ink)}
.sr-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;min-height:52px;padding:6px 8px 6px 0;border-bottom:1px solid var(--rule);text-decoration:none;color:inherit}
.sr-row:hover,.sr-row[aria-selected="true"]{background:var(--paper-2);box-shadow:inset 3px 0 0 var(--brand-accent)}
.sr-row .l{min-width:0;display:flex;flex-direction:column;gap:2px}
.sr-row .l b{font-size:15px;font-weight:800;line-height:1.35}
.sr-row .l>span{font-size:12.5px;color:var(--ink-2)}
.sr-row .r{font-size:12px;color:var(--ink-2);white-space:nowrap}
.sr-row .r time{font:600 13.5px/1 var(--font-numeric);letter-spacing:.02em}
.sr-tk{display:grid;grid-template-columns:36px 2px;align-self:stretch}
.sr-tk .kit{min-height:40px}
.sr-tk .kit b{font-size:11px}
.sr-tk .perf::before,.sr-tk .perf::after{display:none}
.sr-n{display:grid;place-items:center;width:38px;align-self:stretch;border-right:2px dotted var(--ink-3);font:800 13px/1 var(--font-numeric);color:var(--ink-2)}
.sr-n.kr{color:var(--brand-accent-text)}
.sr-t{font-size:14px;font-weight:800;line-height:1.45}
.sr-t.is-latin{font-family:var(--font-latin);font-weight:600;font-size:17px;line-height:1.2}
.skeys{display:none;gap:14px;padding:10px 14px;border-top:1px solid var(--rule);font-size:12px;color:var(--ink-2)}
.skeys kbd{color:var(--ink);border-color:var(--ink-2);margin-right:4px}
@media (min-width:1024px){.skeys{display:flex}}
.sqs{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px 0}
.sframe{border:1.5px solid var(--ink);max-width:760px;margin-top:14px;display:flex;flex-direction:column;background:var(--paper)}
.sframe .sres{max-height:none}
.sempty{padding:28px 0 8px}
.sempty .sempty__n{font:800 64px/.8 var(--font-numeric);color:transparent;-webkit-text-stroke:2px var(--ink-2)}
.sempty__t{font-size:15px;font-weight:800;margin:14px 0 6px}
.sempty p{font-size:13.5px;color:var(--ink-2)}
.sempty q{font-weight:800;color:var(--ink)}

/* 홈 위젯 */
.wg{margin-top:36px}
.facing .wg:first-child{margin-top:0}
.wg__sub{font-size:12.5px;color:var(--ink-2);margin:6px 0 12px;line-height:1.5}
.wg__sub b{color:var(--ink);font-weight:800}
.wg__sub .t-num{font-size:13.5px}
.kc{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.facing .kc{grid-template-columns:repeat(2,minmax(0,1fr))}
@media (min-width:640px) and (max-width:1279px){.kc{grid-template-columns:repeat(5,minmax(0,1fr))}}
.kc__t{display:flex;flex-direction:column;height:100%;text-decoration:none}
.kc__h{display:flex;align-items:center;gap:6px;padding:8px 8px 8px 0}
.kc__h .kit{width:8px;min-height:30px;align-self:stretch;box-shadow:none}
.kc__h .kit b{font-size:0}
.kc__h b.nm{font-size:14px;font-weight:800;letter-spacing:-.03em;line-height:1.2}
.kc__m{border-top:2px dotted var(--ink-3);padding:8px 10px 10px;display:flex;flex-direction:column;gap:4px;flex:1}
.kc__m .big{--big:34px}
.kc__m .st{font-size:12px;font-weight:800;line-height:1.3}
.kc__m .st--off{color:var(--ink-2)}
.kc__m .g{font-size:12px;font-weight:800;color:var(--brand-accent-text)}
.kc__m .g .n{font:800 13.5px/1 var(--font-numeric)}
.kc0{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:center;margin-bottom:10px}
.kc0 .big{--big:56px}
.kc0 p{font-size:13px;color:var(--ink-2);line-height:1.5}
.kc0 p b{color:var(--ink);font-weight:800}
.hl{display:grid;gap:8px}
.hl__t{display:grid;grid-template-columns:minmax(0,1fr) 2px 86px;text-decoration:none}
.hl__b{padding:10px 12px;min-width:0}
.hl__b .nm{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:15px;font-weight:800;letter-spacing:-.02em;line-height:1.3}
.hl__b .tt{font-size:13px;font-weight:800;line-height:1.45}
.hl__b .m{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:6px;font-size:12px;color:var(--ink-2)}
.hl__b .m time{font:600 13.5px/1 var(--font-numeric);letter-spacing:.02em;color:var(--ink)}
.hl__s{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:6px;padding:8px 8px 8px 12px}
.hl__s .big{--big:28px}
.hl__s .big small{font-family:var(--font-numeric);font-size:.55em}
.hl__s .xs{font-size:12px;font-weight:800}
.hl__s .xs--official{color:var(--brand-accent-text)}
.hl__t:hover .nm,.hl__t:hover .tt{text-decoration:underline;text-underline-offset:3px}
.skip-w{padding:12px 14px;border:1px solid var(--rule);font-size:12.5px;color:var(--ink-2);display:flex;flex-wrap:wrap;gap:4px 8px;align-items:baseline}
.skip-w b{color:var(--ink);font-weight:800}
.nt{display:grid;gap:8px}
.nt__fx{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.nt__fx>div{min-height:84px;border:1.5px dashed var(--ink-3);padding:10px 12px;font-size:12px;color:var(--ink-2);display:flex;flex-direction:column;justify-content:space-between;gap:6px}
.nt__fx>div b{color:var(--ink);font-weight:800;font-size:12.5px}

/* 견본 */
.spec{margin-top:24px}
.spec-grid{display:grid;gap:24px;margin-top:14px}
@media (min-width:1024px){.spec-grid{grid-template-columns:1fr 1fr}.spec-grid>.wide{grid-column:1/-1}}
.frame{border:1px solid var(--rule);padding:14px;min-width:0}
.frame>.cap2{font-size:12.5px;color:var(--ink-2);margin-bottom:12px;line-height:1.5}
.frame>.cap2 b{font-weight:800;color:var(--ink);margin-right:4px}
.apl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
@media (min-width:640px){.apl{grid-template-columns:repeat(5,minmax(0,1fr))}}
.apl .ms__mid{padding:10px}
.apl figcaption{font-size:11.5px;color:var(--ink-2);padding:8px 10px;border-top:1px solid var(--rule);line-height:1.4}
.apl figcaption b{color:var(--ink);font-weight:800}
.mx{width:100%;font-size:12.5px}
.mx th,.mx td{padding:8px 6px;border-bottom:1px solid var(--rule);text-align:left;vertical-align:middle}
.mx thead th{font-size:11.5px;font-weight:800;color:var(--ink-2);border-bottom:1px solid var(--ink)}
.mx td .xs{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
.mx td .real{font-size:11px;font-weight:800;color:var(--brand-accent-text)}
.mx .sg{font-size:12.5px;font-weight:800}
.mx .sg--official{color:var(--brand-accent-text)}
.fstates{display:grid;gap:14px}
.fstates>div{display:grid;gap:6px}
.fstates .k{font-size:12px}
.spoil{display:grid;gap:10px}
.sbx{display:inline-flex;align-items:stretch;min-height:44px;border:1px dashed var(--ink-2);background:repeating-linear-gradient(-45deg,var(--hatch) 0 5px,transparent 5px 10px);font-size:12.5px;line-height:1.3}
.sbx__k{display:flex;align-items:center;padding:0 10px;font-weight:800}
.sbx__go{display:flex;align-items:center;gap:2px;min-height:44px;padding:0 10px;border:0;border-left:1px dashed var(--ink-2);background:var(--paper);font-size:12.5px;font-weight:800}
.sbx__go .ic{width:16px;height:16px}
[data-spoil="on"] .ms:not([data-spoil="off"]) .spoil-v{display:none}
[data-spoil="on"] .ms[data-spoil="off"] .spoil-h{display:none}
[data-spoil="off"] .spoil-h{display:none}
.sw{display:inline-flex;align-items:center;gap:10px;min-height:44px;padding:0;border:0;background:none;font-size:13px;font-weight:800}
.sw i{position:relative;width:44px;height:26px;border:1.5px solid var(--ink);flex:none}
.sw i::after{content:"";position:absolute;top:3px;left:3px;width:17px;height:17px;background:var(--ink-2);transition:transform var(--duration-fast) var(--ease),background-color var(--duration-fast) var(--ease)}
.sw[aria-checked="true"] i::after{transform:translateX(18px);background:var(--ink)}
.tp-mini{display:grid;grid-template-columns:72px 2px minmax(0,1fr);grid-template-areas:"stub perf body" "back back back"}
.tp-mini .kit{grid-area:stub;min-height:96px}
.tp-mini .kit b{font-size:22px}
.tp-mini .perf{grid-area:perf}
.tp-mini__b{grid-area:body;padding:12px 14px;min-width:0;display:grid;gap:8px}
.tp-mini__b h4{font-size:22px;font-weight:800;letter-spacing:-.04em}
.tp-back{grid-area:back;border-top:2px dotted var(--ink-3);padding:12px 14px 14px;display:grid;gap:10px}
.tp-back__h{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
.tp-back__h b{font-size:13px;font-weight:800}
.tp-sw{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tp-sw>div{display:grid;gap:6px}
.tp-sw .k{font-size:11.5px}
.ln{height:30px;border:1px dashed var(--ink-3)}
.ns{display:grid;gap:10px}
.ns__sec{border-top:1px solid var(--ink);padding-top:8px}
.ns__sec h4{font-size:14px;font-weight:800;margin-bottom:8px;display:flex;align-items:baseline;gap:8px}
.ns__sec h4 .n{font:600 15px/1 var(--font-numeric);color:var(--ink-2)}
.ns__list li{font-size:13.5px;font-weight:800;line-height:1.45;padding:8px 0;border-bottom:1px solid var(--rule)}
.ns__list li span{display:block;font-size:12px;font-weight:400;color:var(--ink-2);margin-top:2px}
.pst{display:grid;gap:10px}
@media (min-width:640px){.pst{grid-template-columns:1fr 1fr}}
.pst figcaption{font-size:11.5px;color:var(--ink-2);margin-top:6px;line-height:1.45}
.pst figcaption b{color:var(--ink);font-weight:800}

/* 뒤표지 · 하단 탭 · 토스트 */
.colophon{position:relative;margin:64px calc(var(--edge)*-1) 0;background:var(--colophon);color:var(--colophon-fg);--ring:var(--colophon-fg)}
.colophon::before{content:"";display:block;height:4px;background-image:radial-gradient(circle at 2px 2px,var(--paper) 1.6px,transparent 2.1px);background-size:9px 4px;background-repeat:repeat-x;transform:translateY(6px)}
.colophon__in{padding:26px var(--edge) 28px;display:grid;gap:10px;font-size:13px;line-height:1.6}
.colophon__brand{font-size:17px;font-weight:800;letter-spacing:-.03em}
.colophon__brand span{font-size:12.5px;font-weight:400;letter-spacing:0;color:var(--colophon-fg-2);margin-left:6px}
.colophon__fd{font:600 15px/1.3 var(--font-numeric);letter-spacing:.03em}
.colophon__p{color:var(--colophon-fg-2);max-width:62ch}
.colophon__links{display:flex;flex-wrap:wrap;column-gap:18px}
.colophon__links a{display:inline-flex;align-items:center;min-height:44px;font-weight:800;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:4px}
@media (min-width:1024px){.colophon{margin:72px 0 0}.colophon__in{grid-template-columns:1.1fr 1fr;column-gap:48px;padding:32px 36px 34px}.colophon__links{grid-column:2;grid-row:2/4}.colophon__brand{grid-column:1/-1}}
.tabbar{position:sticky;bottom:0;z-index:20;display:grid;grid-template-columns:repeat(5,1fr);margin:0;background:var(--paper);border-top:1px solid var(--ink)}
.tabbar a{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-height:58px;font-size:11px;font-weight:800;color:var(--ink-2);text-decoration:none}
.tabbar a:hover{color:var(--ink)}
.tabbar a[aria-current]{color:var(--ink)}
.tabbar a[aria-current]::before{content:"";position:absolute;top:-1px;left:24%;right:24%;height:3px;background:var(--brand-accent)}
@media (min-width:1024px){.tabbar{display:none}}
.toast-region{position:fixed;left:0;right:0;bottom:76px;z-index:40;display:flex;justify-content:center;pointer-events:none}
.toast{display:inline-flex;align-items:center;gap:12px;min-height:48px;padding:0 16px 0 0;background:var(--ink);color:var(--paper);font-size:14px;font-weight:800;pointer-events:auto;box-shadow:var(--shadow-print-accent);animation:eject var(--duration-base) var(--ease) both}
.toast[hidden]{display:none}
.toast__k{align-self:stretch;display:grid;place-items:center;padding:0 10px;border-right:2px dotted color-mix(in srgb,var(--paper) 55%,transparent);font-size:12px}
@media (min-width:1024px){.toast-region{bottom:28px}}
@keyframes eject{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes tear{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes tearoff{from{clip-path:inset(0 0 0 0);transform:none}to{clip-path:inset(0 0 100% 0);transform:translateY(-6px)}}
@keyframes stamp{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.is-tearoff{animation:tearoff var(--duration-base) var(--ease) both}

@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;scroll-behavior:auto!important}
}
`;
